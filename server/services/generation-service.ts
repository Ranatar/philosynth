/**
 * Generation Service (беседа 1.4; 01-architecture §5.1, 04 §2.4).
 *
 * Оркестрация генерации синтеза — порт generateDoc() [philosynth.html
 * 11897–12236] и _runGenPassesFromIdx() [25573–25821] без DOM:
 *  resolveContextDeps → buildEffectiveDeps → buildDynamicOrder →
 *  buildSectionDefs (Registry) → groupPasses → на каждый проход:
 *  buildContextForSection → промпт `ПАРАМЕТРЫ СИНТЕЗА… ${sp}${quality}
 *  ${STOP_SIGNAL}` → streamSection → сохранение раздела и гранулярных
 *  таблиц → WebSocket-события → генлог/ктхлог.
 *
 * Ретраи — модель streamResp [12642]: только kind='pre-stream', задержки
 * env.streaming.retryDelays (1с/3с/8с); остальные kind немедленно ведут к
 * паузе (persistent pausedState, 01-arch §4.12) — действия возобновления
 * (fill-missing-subs/retry/skip/stop) — беседа 1.4b.
 *
 * Адаптации DOM/DOC_STATE → сервис (задокументированные отступления):
 *  - валидации-confirm'ы формы generateDoc (диалог без участников,
 *    transformative без multi, дремлющие концепции, compat-конфликт,
 *    генетический без dialogue) — клиентские подтверждения → беседа 1.5;
 *    серверная валидация параметров — роут POST /syntheses (запрос 2);
 *  - контейнеры db{i}/ps{i}, прогресс-панель, футер — React (1.5);
 *    refreshCtxLogIfOpen → live-обновления идут WebSocket-событиями;
 *  - genLog/ctxLog: вместо глобальных массивов — строки generation_log /
 *    context_log; genEntry вставляется со status='streaming' и
 *    обновляется по завершении (виден при reconnect);
 *  - genCommon персистится строкой generation_log с sectionKey='_genCommon',
 *    status='common' (схема БД колонки не имеет и не требует — прецедент
 *    решений 1.3; потребители: log-formatter 2.4, экспорт промптов 4.2);
 *  - PausedStateGen.timestamp: number (Date.now) — по shared-типу 0.1
 *    (исходник пишет ISO-строку); partialSubsections: string[] (имена) —
 *    по shared-типу (исходник хранит {name, chars, status}; chars
 *    восстановимы из metadata.subsections генлога);
 *  - user-abort (cancel §3.1): pausedState НЕ создаётся, частичный
 *    результат финализируется по правилам stop (status='ready');
 *  - API-ключ: env.ANTHROPIC_API_KEY; BYO-Key/подписки — биллинг-беседы
 *    (TODO(6.1): ключ пользователя через api-key-service);
 *  - _autoAddCurrentDocToPool: на сервере тривиально — синтез уже в БД и
 *    доступен участником мета-синтеза; UX-паттерн — ConceptPool.tsx (3.2);
 *  - setParentContextProvider (разъём 1.2): регистрируется здесь при
 *    старте генерационного слоя; реализация селективного блока
 *    (conceptContextBlockFull/Selective) — meta-synthesis-service (3.1),
 *    беседа 3.1 заменила стаб настоящим (buildMetaParentContext).
 */
import { and, eq, sql as dsql } from "drizzle-orm";

import type {
  Depth,
  GenerationOrder,
  PausedStateGen,
  SynthesisMethod,
  SynthLevel,
} from "@philosynth/shared/types/synthesis";
import type { CtxLogDraft } from "@philosynth/shared/types/generation";
import type {
  PauseEstimates,
  WsServerMessage,
} from "@philosynth/shared/types/ws-messages";

import { db } from "../db/index.js";
import {
  categories,
  categoryEdges,
  clusterLabels,
  contextLog,
  generationLog,
  sections,
  syntheses,
  synthesisLineage,
} from "../db/schema.js";
import { env } from "../env.js";
import {
  innerTextTrimmed,
  parseFragment,
  spliceSubsectionHtml,
  type HtmlElement,
} from "../utils/html-parser.js";
import { tableToText } from "../utils/text.js";
import type { DepsMap } from "../utils/deep-merge.js";
import { connectionManager } from "../ws/connection-manager.js";
import { clearStreamState, getStreamState } from "../ws/stream-state.js";

import {
  buildContextForSection,
  extractRelevantIntraSectionContext,
} from "./context-builder.js";
import { computeDependents, getIntraDependents } from "./cascade-analyzer.js";
import { updateStructureSections, STRUCTURE_SUBSECTION } from "./structure-tracker.js";
import { createDbContextSource } from "./context-extractor.js";
import { PRICE_IN, PRICE_OUT } from "./cost-estimator.js";
import {
  isConceptParticipant,
  buildParentSpecForLog,
  getParentFieldOrder,
  parentFieldValue,
  parentFieldsUsedFor,
  type ConceptParticipant,
  type ParentDepsParams,
} from "./parent-context.js";
import {
  baseCtxParents,
  baseCtxStatic,
  buildQualityReinforcement,
  buildSYS,
  getStopSignal,
  hasConceptParticipants,
  setParentContextProvider,
  type PromptParams,
} from "./prompt-builder.js";
import {
  buildSectionDefs,
  buildSubsectionMap,
  groupPasses,
  patchPromptsWithSecCtx,
  serializeSubsectionRegen,
  type SectionDefFull,
} from "./section-defs-builder.js";
import {
  classifyStreamError,
  pauseFriendlyMessage,
  StreamError,
  streamSection,
} from "./streaming-manager.js";
import {
  buildEffectiveDeps,
  getActiveSubstitutionMap,
  resolveContextDeps,
} from "./synthesis-engine.js";
import { sourceOf } from "../utils/topo-sort.js";
import {
  buildMetaParentContext,
  loadConceptParticipants,
  type ConceptParticipantFull,
} from "./meta-synthesis-service.js";
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";
import { CTX_LABELS } from "@philosynth/shared/constants/ctx-keys";
import { PARENT_CONTEXT_SCHEMA_ID } from "../config/parent-deps.js";
import { buildDynamicOrder } from "../utils/topo-sort.js";
import { parseGraphFromHTML, saveGraphToDb } from "./graph-parser.js";
import {
  parseGlossaryFromHTML,
  parseThesesFromHTML,
  saveElementsToDb,
} from "./element-parser.js";

/* ══ Разъём провайдера родительского контекста (TODO 1.2 → 1.4) ═══════ */

let providerRegistered = false;

/**
 * Регистрация провайдера baseCtxParents при старте генерационного слоя
 * (NEXT-CONTEXT 1.2/1.3: «регистрация — 1.4»). Стаб беседы 1.4 ЗАМЕНЁН
 * настоящим провайдером (беседа 3.1, долг §12): buildMetaParentContext —
 * conceptContextBlockFull (schema 'monolithic', legacy до миграции) либо
 * conceptContextBlockSelective (+intra-spec подраздела) из
 * meta-synthesis-service. Поля участников наполняет buildParams
 * (loadConceptParticipants из synthesis_lineage).
 */
export function registerParentContextProvider(): void {
  if (providerRegistered) return;
  providerRegistered = true;
  setParentContextProvider((p, sectionKey, subsectionName) =>
    buildMetaParentContext(p, sectionKey, subsectionName),
  );
}

/* ══ Разъём провайдера оценок паузы (TODO 1.4 → 1.4b) ═════════════════ */

export type PauseEstimatesProvider = (
  synthesisId: string,
  ps: PausedStateGen,
) => Promise<PauseEstimates>;

let pauseEstimatesProvider: PauseEstimatesProvider | null = null;

/**
 * Регистрация серверного аналога _computeGenPauseEstimates [24521]
 * (pause-resume-service, беседа 1.4b; регистрация — побочный эффект его
 * импорта через ws/handler). Без провайдера generation_paused несёт
 * estimates:{} — деградация, а не ошибка. Разъём вместо прямого импорта:
 * pause-resume-service сам импортирует generation-service (цикл ESM
 * недопустим); прецедент — setParentContextProvider (1.2 → 1.4).
 */
export function setPauseEstimatesProvider(
  fn: PauseEstimatesProvider | null,
): void {
  pauseEstimatesProvider = fn;
}

async function pauseEstimatesFor(
  synthesisId: string,
  ps: PausedStateGen,
): Promise<PauseEstimates> {
  if (!pauseEstimatesProvider) return {};
  try {
    return await pauseEstimatesProvider(synthesisId, ps);
  } catch (e) {
    // fail-open, как console.warn исходника [24660]
    console.warn("_computeGenPauseEstimates error:", e);
    return {};
  }
}

/* ══ Реестр активных генераций ════════════════════════════════════════ */

interface ActiveRun {
  synthesisId: string;
  userId: string;
  abort: AbortController;
  startedAt: number;
}

const activeRuns = new Map<string, ActiveRun>();

export class GenerationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GenerationError";
    this.code = code;
  }
}

export function isGenerationActive(synthesisId: string): boolean {
  return activeRuns.has(synthesisId);
}

function activeRunsOfUser(userId: string): number {
  let n = 0;
  for (const run of activeRuns.values()) if (run.userId === userId) n += 1;
  return n;
}

/**
 * Отмена активной генерации (WS cancel, §3.1): user-abort → abort
 * контроллера; финализация по правилам stop — внутри цикла генерации.
 */
export function cancelGeneration(synthesisId: string, userId: string): boolean {
  const run = activeRuns.get(synthesisId);
  if (!run || run.userId !== userId) return false;
  run.abort.abort();
  return true;
}

/* ══ Порты вспомогательных функций исходника ══════════════════════════ */

export interface ParsedSubsection {
  name: string;
  startChar: number;
  chars: number;
  status: "streaming" | "done";
}

/**
 * Порт parseSubsectionsFromHTML(html, expectedSections) [9795]: трекинг
 * подразделов по data-section в потоке (нечёткое совпадение имён,
 * последняя найденная — 'streaming').
 */
export function parseSubsectionsFromHTML(
  html: string,
  expectedSections: readonly string[],
): ParsedSubsection[] {
  if (!html || !expectedSections || !expectedSections.length) return [];

  const regex = /data-section="([^"]+)"/g;
  const found: { name: string; pos: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    found.push({ name: m[1] as string, pos: m.index });
  }
  if (!found.length) return [];

  const result: ParsedSubsection[] = [];
  for (let i = 0; i < expectedSections.length; i++) {
    const expected = expectedSections[i] as string;
    const match = found.find(
      (f) =>
        f.name === expected ||
        f.name.toLowerCase().includes(expected.toLowerCase()) ||
        expected.toLowerCase().includes(f.name.toLowerCase()),
    );
    if (!match) continue;

    const startChar = match.pos;
    const foundIdx = found.indexOf(match);
    const nextFound = found[foundIdx + 1];
    const endChar = nextFound ? nextFound.pos : html.length;
    const chars = endChar - startChar;
    const isLast = foundIdx === found.length - 1;
    const status = isLast ? ("streaming" as const) : ("done" as const);
    result.push({ name: expected, startChar, chars, status });
  }
  return result;
}

/**
 * Порт buildPromptSkeleton(fp) [8506]: сворачивает контекстные блоки,
 * блоки концепций-участников (расширенный маркер с полями — ТЗ 6.2),
 * тройные кавычки и блок ТРЕБОВАНИЯ в компактный скелет для генлога.
 */
export function buildPromptSkeleton(fp: string): string {
  // 1. Сворачиваем контекстные блоки разделов (### ...)
  let result = fp.replace(
    /(### ([^\n]+))\n([\s\S]*?)(?=\n###\s|\n"""|$)/g,
    (_match, _headerLine: string, label: string, content: string) => {
      const chars = content.trim().length;
      return "[" + label.trim() + ": " + chars.toLocaleString("ru") + " симв.]";
    },
  );

  // 2. Блоки концепций-участников (═══ КОНЦЕПЦИЯ-УЧАСТНИК … ═══)
  result = result.replace(
    /(═══ КОНЦЕПЦИЯ-УЧАСТНИК: ([^═]+)═══)\n([\s\S]*?)(?=\n═══ КОНЦЕПЦИЯ-УЧАСТНИК|\n""")/g,
    (_match, _headerLine: string, name: string, content: string) => {
      const chars = content.trim().length;
      const fieldHeaders: string[] = [];
      const rx = /^([А-ЯЁ][А-ЯЁ\s()А-ЯЁ]{2,50}):$/gm;
      let mm: RegExpExecArray | null;
      while ((mm = rx.exec(content)) !== null) {
        const h = (mm[1] as string).trim();
        if (h === "МЕТОД" || h === "УРОВЕНЬ" || h === "ЗЕРНО") continue;
        fieldHeaders.push(h);
      }
      const fieldsLabel =
        fieldHeaders.length > 0 ? ": " + fieldHeaders.join(" + ") + " = " : ": ";
      return (
        "[контекст «" +
        name.trim() +
        "»" +
        fieldsLabel +
        chars.toLocaleString("ru") +
        " симв.]"
      );
    },
  );

  // 3. Блоки в тройных кавычках с предшествующим заголовком
  result = result.replace(
    /((?:КОНТЕКСТ ДРУГИХ ПОДРАЗДЕЛОВ|ТЕКУЩЕЕ СОДЕРЖИМОЕ ПОДРАЗДЕЛА|КОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ)[^\n]*)\n"""\n([\s\S]*?)"""/g,
    (_match, header: string, content: string) => {
      const chars = content.trim().length;
      if (header.includes("КОНТЕКСТ ДРУГИХ ПОДРАЗДЕЛОВ")) {
        const parts: string[] = [];
        const rx = /\[([^\]]+)\]\n/g;
        let mm: RegExpExecArray | null;
        let prevName: string | null = null;
        let prevStart = 0;
        while ((mm = rx.exec(content)) !== null) {
          if (prevName && !prevName.includes("сокращено")) {
            const len = mm.index - prevStart;
            parts.push(
              "[" + prevName + ": " + len.toLocaleString("ru") + " симв.]",
            );
          }
          prevName = mm[1] as string;
          prevStart = mm.index;
        }
        if (prevName && !prevName.includes("сокращено")) {
          const len = content.length - prevStart;
          parts.push(
            "[" + prevName + ": " + len.toLocaleString("ru") + " симв.]",
          );
        }
        if (parts.length > 0) {
          return parts.join("\n");
        }
      }
      if (header.includes("КОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ")) {
        const conceptLines = content
          .trim()
          .split("\n")
          .filter((l) => l.startsWith("[контекст"));
        if (conceptLines.length > 0) {
          return header + '\n"""\n' + conceptLines.join("\n") + '\n"""';
        }
      }
      return "[" + chars.toLocaleString("ru") + " симв.]";
    },
  );

  // 4. Блок ТРЕБОВАНИЯ в конце промпта
  result = result.replace(
    /\n\nТРЕБОВАНИЯ: каждый раздел[^\n]*/g,
    "\n\n[ТРЕБОВАНИЯ К КАЧЕСТВУ: см. общие элементы]",
  );

  return result;
}

/**
 * Порт updateDocTitleFromName(nameContainer) [11871] на HTML-строке:
 * извлекает название концепции из раздела «name» (подраздел с «итогов…»/
 * «рекоменд…», иначе первый <strong>), срезает служебные префиксы и
 * подзаголовок после двоеточия. null — извлечь не удалось.
 */
export function extractTitleFromNameHtml(html: string): string | null {
  const ct = parseFragment(html);
  let recSection: ReturnType<typeof ct.querySelector> = null;
  for (const div of ct.querySelectorAll("div[data-section]")) {
    const sec = (div.getAttribute("data-section") ?? "").toLowerCase();
    if (sec.includes("итогов") || sec.includes("рекоменд")) {
      recSection = div;
      break;
    }
  }
  const strong = recSection
    ? recSection.querySelector("strong")
    : ct.querySelector("strong");
  let nameText = strong?.textContent?.trim();
  if (!nameText) return null;
  nameText = nameText
    // Шаг 1: убрать известные служебные префиксы модели.
    // FIX (задокументированное отступление): в исходнике [11886] классы
    // \w — они НЕ матчат кириллицу в JS, срезание префиксов было мёртвым
    // кодом (латентный баг); здесь \w заменён на [а-яё] (с /i).
    .replace(
      /^(?:итогов[а-яё]+\s+рекомендаци[а-яё]*|рекомендуем[а-яё]+\s+названи[а-яё]*|названи[а-яё]+\s*концепци[а-яё]*)\s*[:：]\s*/i,
      "",
    )
    .replace(/^[«""]|[»""]$/g, "")
    // Шаг 2: основная часть до двоеточия (подзаголовок в шапку не нужен)
    .split(/\s*[:：]\s*/)[0]!
    .trim();
  return nameText || null;
}

/** Порт computeFullConceptBlockSizes(p) [10302]: полный вес полей каждой
 *  концепции-участника (для genCommon.conceptBlockSizes). */
export async function computeFullConceptBlockSizes(
  participants: readonly ConceptParticipant[] | null | undefined,
): Promise<{ name: string; chars: number }[]> {
  const concepts = (participants ?? []).filter(isConceptParticipant);
  if (concepts.length === 0) return [];
  const order = await getParentFieldOrder();
  return concepts.map((c) => {
    const total = order.reduce(
      (s, fld) => s + parentFieldValue(c, fld).length,
      0,
    );
    return { name: c.name ?? "", chars: total };
  });
}

/** Порт buildParentSpecBySection(p, sectionKeys) [10399]. */
export async function buildParentSpecBySection(
  participants: readonly ConceptParticipant[] | null | undefined,
  p: ParentDepsParams,
  sectionKeys: readonly string[],
): Promise<Record<string, unknown>> {
  const concepts = (participants ?? []).filter(isConceptParticipant);
  if (concepts.length === 0) return {};
  const out: Record<string, unknown> = {};
  for (const sk of sectionKeys) {
    out[sk] = await buildParentSpecForLog(concepts, p, sk);
  }
  return out;
}

/* ══ Служебное ════════════════════════════════════════════════════════ */

const sendToUser = (userId: string, msg: WsServerMessage): void =>
  connectionManager.sendToUser(userId, msg);

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(t);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Каждая N-я дельта несёт totalHtml (03-spec §3.2: «каждые N дельт»). */
const TOTAL_HTML_EVERY_N_DELTAS = 25;
/** Троттлинг пересчёта подразделов в onDelta (как 300 мс исходника). */
const SUBSECTION_SCAN_THROTTLE_MS = 300;

export type SynthesisRow = typeof syntheses.$inferSelect;

export interface LoadedSynthesis {
  row: SynthesisRow;
  philosophers: string[];
  secCtx: Record<string, string>;
}

/** Экспортирована для pause-resume-service (беседа 1.4b). */
export async function loadSynthesis(
  synthesisId: string,
): Promise<LoadedSynthesis> {
  const [row] = await db
    .select()
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  if (!row) throw new GenerationError("NOT_FOUND", "Синтез не найден");

  const lineage = await db
    .select()
    .from(synthesisLineage)
    .where(eq(synthesisLineage.synthesisId, synthesisId))
    .orderBy(synthesisLineage.position);
  const philosophers = lineage
    .filter((l) => l.parentType === "philosopher" && l.parentName)
    .map((l) => l.parentName as string);

  const secRows = await db
    .select({ key: sections.key, secContext: sections.secContext })
    .from(sections)
    .where(eq(sections.synthesisId, synthesisId));
  const secCtx: Record<string, string> = {};
  for (const s of secRows) if (s.secContext) secCtx[s.key] = s.secContext;

  return { row, philosophers, secCtx };
}

/** Upsert раздела по (synthesisId, key) — уникальный индекс схемы. */
async function upsertSection(
  synthesisId: string,
  def: SectionDefFull,
  htmlContent: string,
  secContext: string,
  isEdited = false, // 2.2: regenerateSection/addSection помечают раздел изменённым
): Promise<void> {
  await db
    .insert(sections)
    .values({
      synthesisId,
      key: def.key,
      sectionNum: def.num,
      title: def.title,
      htmlContent,
      secContext,
      isEdited,
    })
    .onConflictDoUpdate({
      target: [sections.synthesisId, sections.key],
      set: {
        sectionNum: def.num,
        title: def.title,
        htmlContent,
        secContext,
        isEdited,
        updatedAt: new Date(),
      },
    });
}

/* ══ Оркестрация ══════════════════════════════════════════════════════ */

export interface GenerateSynthesisOptions {
  /** secCtx поверх сохранённого в sections.sec_context (POST-роут, запрос 2) */
  sectionContexts?: Record<string, string> | undefined;
}

/**
 * Предпроверки старта (используются и POST /syntheses ДО создания строки,
 * и generateSynthesis повторно — гонка допустима, вторая проверка решает):
 * лимит одновременных генераций (03 §3.4) и наличие API-ключа.
 */
export function assertCanStartGeneration(userId: string): void {
  if (activeRunsOfUser(userId) >= env.rateLimit.concurrentGenerations) {
    throw new GenerationError(
      "RATE_LIMIT",
      `Не более ${env.rateLimit.concurrentGenerations} одновременных генераций`,
    );
  }
  if (!env.anthropic.apiKey) {
    throw new GenerationError("API_KEY_MISSING", "API-ключ Anthropic не задан");
  }
}

/**
 * generateSynthesis(synthesisId, userId) — полный цикл генерации.
 * Ошибки ДО старта цикла (нет синтеза, нет ключа, лимиты) — исключения
 * GenerationError (вызывающий шлёт stream_error); обрывы стрима внутри
 * цикла — пауза (pausedState + generation_paused), не исключение.
 */
/** Ручка слота активной генерации (передаётся в цикл проходов). */
export interface GenerationSlotHandle {
  synthesisId: string;
  userId: string;
  /** Сигнал user-abort (WS cancel §3.1) */
  signal: AbortSignal;
}

/**
 * Резервация слота activeRuns + предпроверки + гарантированное
 * освобождение. Слот ставится СИНХРОННО, до первого await: иначе
 * POST-запуск и subscribe_generation, пришедший в окно loadSynthesis,
 * оба проходят has()-проверку и стартуют ДВА параллельных цикла
 * (грабля 1.4, тест R3: двойной saveGraphToDb → 23505 на cluster_labels).
 * Экспортирована для pause-resume-service (беседа 1.4b): ветка
 * fill-missing-subs стримит подразделы под тем же предохранителем,
 * чтобы работал cancel.
 */
export async function withGenerationSlot(
  synthesisId: string,
  userId: string,
  fn: (handle: GenerationSlotHandle) => Promise<void>,
): Promise<void> {
  if (activeRuns.has(synthesisId)) {
    throw new GenerationError(
      "GENERATION_IN_PROGRESS",
      "Генерация уже запущена для этого синтеза",
    );
  }
  assertCanStartGeneration(userId);
  const run: ActiveRun = {
    synthesisId,
    userId,
    abort: new AbortController(),
    startedAt: Date.now(),
  };
  activeRuns.set(synthesisId, run);
  try {
    await fn({ synthesisId, userId, signal: run.abort.signal });
  } finally {
    activeRuns.delete(synthesisId);
  }
}

export async function generateSynthesis(
  synthesisId: string,
  userId: string,
  opts: GenerateSynthesisOptions = {},
): Promise<void> {
  registerParentContextProvider();
  const apiKey = env.anthropic.apiKey; // TODO(6.1): BYO-Key пользователя
  await withGenerationSlot(synthesisId, userId, async (handle) => {
    const { row, philosophers, secCtx } = await loadSynthesis(synthesisId);
    if (row.userId !== userId) {
      throw new GenerationError("FORBIDDEN", "Нет доступа к синтезу");
    }
    Object.assign(secCtx, opts.sectionContexts ?? {});
    await runGenerationPasses(handle, row, philosophers, secCtx, apiKey);
  });
}

export interface ResumeFromPassOptions {
  /** secCtx из снапшота genParams: переопределения sectionContexts POST
   *  для НЕдостигнутых проходов не персистентны в sections.sec_context */
  sectionContexts?: Record<string, string> | undefined;
}

/**
 * Возобновление цикла проходов с startIdx — доля resumeGeneration [25075]
 * уровня «пересборка инфраструктуры + _runGenPassesFromIdx» (retry/skip и
 * продолжение после догенерации подразделов; беседа 1.4b). Вызывающий
 * (pause-resume-service) обязан ДО вызова: записать resume_marker,
 * очистить pausedState и поставить status='generating' (аналог
 * _clearPausedState [25141] — новая ошибка запишет НОВЫЙ pausedState).
 */
export async function resumeSynthesisFromPass(
  synthesisId: string,
  userId: string,
  startIdx: number,
  opts: ResumeFromPassOptions = {},
): Promise<void> {
  registerParentContextProvider();
  const apiKey = env.anthropic.apiKey; // TODO(6.1): BYO-Key пользователя
  await withGenerationSlot(synthesisId, userId, async (handle) => {
    const { row, philosophers, secCtx } = await loadSynthesis(synthesisId);
    if (row.userId !== userId) {
      throw new GenerationError("FORBIDDEN", "Нет доступа к синтезу");
    }
    Object.assign(secCtx, opts.sectionContexts ?? {});
    await runGenerationPasses(handle, row, philosophers, secCtx, apiKey, {
      startIdx,
      source: "resume",
    });
  });
}

/** Параметры p в форме исходника из строки syntheses.
 *  Беседа 3.1: участники-концепции (наполненные loadConceptParticipants)
 *  сливаются в participants, гейт мета-синтеза p.isMetaSynthesis
 *  (hasConceptParticipants исходника — флаг, не подсчёт!) выставляется
 *  при их наличии; parentContextSchema — для диспетчеризации провайдера
 *  (monolithic → Full, иначе Selective). */
export function buildParams(
  row: SynthesisRow,
  philosophers: string[],
  secCtx: Record<string, string>,
  conceptParticipants: ConceptParticipantFull[] = [],
): GenParams & { keepFullBudget: boolean } {
  return {
    seed: row.seed,
    phil: philosophers,
    participants: [
      ...philosophers.map((name) => ({
        type: "philosopher" as const,
        name,
      })),
      ...conceptParticipants,
    ],
    isMetaSynthesis: conceptParticipants.length > 0,
    conceptParticipants,
    parentContextSchema: row.parentContextSchema,
    sec: (row.sectionOrder ?? []).filter((k) => k !== "sum"),
    method: row.method as SynthesisMethod,
    synthLevel: row.synthLevel as SynthLevel,
    depth: row.depth as Depth,
    generationOrder: row.generationOrder as GenerationOrder,
    extGraphMetrics: row.extGraphMetrics,
    ctx: row.context,
    lang: row.lang,
    secCtx,
    keepFullBudget: row.keepFullBudget,
  };
}

export interface RunGenerationOptions {
  /** С какого pass начинать: 0 — штатная генерация, passIdx — retry,
   *  passIdx+1 — skip / продолжение после догенерации подразделов */
  startIdx?: number | undefined;
  /** source строк генлога (_runGenPassesFromIdx [25573]: 'init'|'resume';
   *  в терминах 02 §2.15 — 'initial'|'resume') */
  source?: "initial" | "resume" | undefined;
}

/**
 * Цикл проходов (_runGenPassesFromIdx [25573]) — ЕДИНЫЙ для штатной
 * генерации и возобновления; различаются только startIdx и source (при
 * resume: метки « [возобновление]» в генлоге, _genCommon не дублируется).
 * Экспортирован для pause-resume-service (беседа 1.4b): продолжение после
 * fill-missing-subs идёт под уже занятым слотом (_continueAfterFilledSubs
 * [25500]).
 */
export async function runGenerationPasses(
  run: GenerationSlotHandle,
  row: SynthesisRow,
  philosophers: string[],
  secCtx: Record<string, string>,
  apiKey: string,
  options: RunGenerationOptions = {},
): Promise<void> {
  const { synthesisId, userId } = run;
  const startIdx = options.startIdx ?? 0;
  const source = options.source ?? "initial";
  const isResume = source === "resume";
  const labelSuffix = isResume ? " [возобновление]" : "";
  // Беседа 3.1: концепции-родители из synthesis_lineage с полями из БД —
  // загрузка здесь (а не в loadSynthesis), чтобы вызывающие с прежней
  // сигнатурой (pause-resume 1.4b) получили мета-контекст без правок.
  const conceptParticipants = await loadConceptParticipants(synthesisId);
  const p = buildParams(row, philosophers, secCtx, conceptParticipants);

  /* ── Инфраструктура порядка [12078–12100] ── */
  const resolvedDeps = await resolveContextDeps(p);
  const effectiveDeps = await buildEffectiveDeps(
    p.sec,
    resolvedDeps,
    p.generationOrder,
  );
  const dynamicOrder = buildDynamicOrder(
    effectiveDeps,
    p.sec,
    resolvedDeps,
    p.generationOrder,
  );
  p.sec = dynamicOrder.filter((k) => k !== "sum");

  // Пересборка defs в новом порядке (sum всегда первый внутри)
  const baseDefs = await buildSectionDefs(p);
  patchPromptsWithSecCtx(baseDefs, p.secCtx);
  const defsMap = Object.fromEntries(baseDefs.map((d) => [d.key, d]));
  let secNum = 1;
  const defs: SectionDefFull[] = dynamicOrder.map((key) => {
    const d = { ...(defsMap[key] as SectionDefFull) };
    d.num = secNum++;
    return d;
  });

  const passes = groupPasses(defs);

  /* ── Общие элементы промпта + genCommon [12160–12183] ── */
  const SYS = await buildSYS(p);
  const partStatic = await baseCtxStatic(p);
  const partParentsFirst = hasConceptParticipants(p)
    ? await baseCtxParents(p, passes[0]?.[0]?.key ?? undefined)
    : "";
  const partBase = partStatic + partParentsFirst;
  const partQuality = await buildQualityReinforcement(p);
  const stopSignal = await getStopSignal();
  const scaffoldLen =
    `ПАРАМЕТРЫ СИНТЕЗА:\n\n\n\nЗАДАНИЕ: составь ТОЛЬКО следующие разделы (строго в указанном порядке, без добавления других):\n\n\n\n`
      .length;
  const commonChars =
    SYS.length + partBase.length + partQuality.length + scaffoldLen;

  const sectionKeysForSpec = passes.map((pass) =>
    pass.map((d) => d.key).join("+"),
  );
  const genCommon = {
    sysChars: SYS.length,
    baseChars: partBase.length,
    baseCharsWithoutConcepts: partStatic.length,
    totalConceptOverhead: partBase.length - partStatic.length,
    budgetMode: p.keepFullBudget ? "full" : "shrink",
    parentSpecBySection: await buildParentSpecBySection(
      conceptParticipants,
      p,
      sectionKeysForSpec,
    ), // участники-концепции с полями — беседа 3.1 (TODO закрыт)
    rulesChars: 0,
    qualityChars: partQuality.length,
    scaffoldChars: scaffoldLen,
    totalChars: commonChars,
    conceptBlockSizes: await computeFullConceptBlockSizes(
      conceptParticipants,
    ), // беседа 3.1 (TODO закрыт)
  };
  /* На возобновлении _genCommon обычно уже записан штатной генерацией —
     не дублируем (аналог `if (!genCommon)` исходника [25563/1039]). */
  const existingCommon = isResume
    ? await db
        .select({ id: generationLog.id })
        .from(generationLog)
        .where(
          and(
            eq(generationLog.synthesisId, synthesisId),
            eq(generationLog.sectionKey, "_genCommon"),
          ),
        )
        .limit(1)
    : [];
  if (existingCommon.length === 0) {
    await db.insert(generationLog).values({
      synthesisId,
      sectionKey: "_genCommon",
      sectionLabel: "Общие элементы",
      logType: "generation",
      source,
      status: "common",
      inputChars: commonChars,
      metadata: { genCommon },
    });
  }

  let totalInputTokens = row.totalInputTokens;
  let totalOutputTokens = row.totalOutputTokens;
  const graphBodyIdx = passes.findIndex((pass) =>
    pass.some((d) => d.key === "graph"),
  );
  const subsecMapAll = await buildSubsectionMap(p);
  const retryDelays = env.streaming.retryDelays;

  /* ── Цикл проходов (_runGenPassesFromIdx [25573]) ── */
  for (let i = startIdx; i < passes.length; i++) {
    const pass = passes[i] as SectionDefFull[];
    const passKey = (pass[0] as SectionDefFull).key;
    const sectionLabel = pass.map((d) => d.title).join(" + ");
    const sectionKeyJoined = pass.map((d) => d.key).join("+");

    try {
      /* ── Контекст из предыдущих разделов [25612–25630] ── */
      let prior = "";
      let ctxDraft: CtxLogDraft | null = null;
      if (i > 0) {
        for (const def of pass) {
          if (def.key === "sum") continue;
          try {
            // Свежий source на каждый проход: мемоизация не должна
            // прятать только что сохранённые разделы.
            const built = await buildContextForSection(
              def.key,
              synthesisId,
              p.depth,
              effectiveDeps,
              resolvedDeps,
              {
                source: createDbContextSource(synthesisId),
                params: {
                  synthLevel: p.synthLevel,
                  method: p.method,
                  generationOrder: p.generationOrder,
                  keepFullBudget: p.keepFullBudget,
                },
                // 3.1: давление родителей на бюджет (01 §4.13 ч. II)
                participants: conceptParticipants,
              },
            );
            prior = built.text;
            ctxDraft = built.ctxLog;
          } catch (ctxErr) {
            console.warn("Ошибка построения контекста для", def.key, ctxErr);
            prior = "";
          }
          break;
        }
      }
      // Запись CtxLogDraft в context_log — закрытие TODO(1.4) беседы 1.3
      if (ctxDraft) {
        await db.insert(contextLog).values({
          synthesisId,
          sectionKey: ctxDraft.sectionKey,
          budget: ctxDraft.budget,
          totalUsed: ctxDraft.totalUsed,
          reqFound: ctxDraft.reqFound,
          reqTotal: ctxDraft.reqTotal,
          optIncluded: ctxDraft.optIncluded,
          optTotal: ctxDraft.optTotal,
          budgetMode: ctxDraft.budgetMode,
          parentOverhead: ctxDraft.parentOverhead,
          parentSpec: ctxDraft.parentSpec,
          entries: ctxDraft.entries,
        });
      }

      /* ── Промпт прохода [25632–25636] ── */
      const sp = pass
        .map((d) => `§ ${d.num} — ${d.title.toUpperCase()}\n${d.prompt}`)
        .join("\n\n");
      const partParentsForPass = hasConceptParticipants(p)
        ? await baseCtxParents(p, passKey)
        : "";
      const partBaseForPass = partStatic + partParentsForPass;
      const fp = `ПАРАМЕТРЫ СИНТЕЗА:\n${partBaseForPass}${prior}\n\nЗАДАНИЕ: составь ТОЛЬКО следующие разделы (строго в указанном порядке, без добавления других):\n\n${sp}${partQuality}${stopSignal}`;
      const expectedSubs = pass.flatMap((d) => subsecMapAll[d.key] ?? []);

      /* ── genEntry: insert 'streaming' → update по завершении ── */
      const parentFieldsUsed = hasConceptParticipants(p)
        ? await parentFieldsUsedFor(conceptParticipants, p, passKey).catch(
            () => [],
          )
        : undefined;
      const [genEntry] = await db
        .insert(generationLog)
        .values({
          synthesisId,
          sectionKey: sectionKeyJoined,
          // labelSuffix ' [возобновление]' — только в genEntry [25601]
          sectionLabel: sectionLabel + labelSuffix,
          logType: "generation",
          source,
          status: "streaming",
          priorChars: prior.length,
          taskChars: sp.length,
          inputChars: SYS.length + fp.length,
          metadata: {
            expectedSubsections: expectedSubs,
            subsections: [],
            promptSkeleton: buildPromptSkeleton(fp),
            sys: SYS,
            // _augmentGenEntry [10384]:
            budgetMode: p.keepFullBudget ? "full" : "shrink",
            parentOverheadChars: partParentsForPass.length,
            ...(parentFieldsUsed ? { parentFieldsUsed } : {}),
          },
        })
        .returning({ id: generationLog.id });
      const genEntryId = (genEntry as { id: string }).id;

      /* ── onDelta: WS-дельты + трекинг подразделов ── */
      let deltaCount = 0;
      let lastSubScan = 0;
      let subsections: ParsedSubsection[] = [];
      const announcedSubs = new Set<string>();
      const onDelta = (
        delta: string,
        totalChars: number,
        htmlSoFar: string,
      ): void => {
        deltaCount += 1;
        sendToUser(userId, {
          type: "stream_delta",
          synthesisId,
          sectionKey: passKey,
          delta,
          totalChars,
          ...(deltaCount % TOTAL_HTML_EVERY_N_DELTAS === 0
            ? { totalHtml: htmlSoFar }
            : {}),
        });
        if (expectedSubs.length > 0) {
          const now = Date.now();
          if (now - lastSubScan > SUBSECTION_SCAN_THROTTLE_MS) {
            lastSubScan = now;
            subsections = parseSubsectionsFromHTML(htmlSoFar, expectedSubs);
            for (const s of subsections) {
              if (!announcedSubs.has(s.name)) {
                announcedSubs.add(s.name);
                sendToUser(userId, {
                  type: "subsection_found",
                  synthesisId,
                  sectionKey: passKey,
                  subsectionName: s.name,
                  charsSoFar: totalChars,
                });
              }
            }
          }
        }
      };

      /* ── Стрим с ретраями pre-stream (streamResp [12642]) ── */
      let html = "";
      let usage: { inputTokens: number; outputTokens: number };
      try {
        const maxAttempts = retryDelays.length + 1;
        let lastErr: StreamError | null = null;
        let attemptUsage: { inputTokens: number; outputTokens: number } | null =
          null;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            let attemptHtml = "";
            attemptUsage = await streamSection(
              synthesisId,
              passKey,
              fp,
              SYS,
              apiKey,
              (delta, totalChars, htmlSoFar) => {
                attemptHtml = htmlSoFar;
                onDelta(delta, totalChars, htmlSoFar);
              },
              { signal: run.signal },
            );
            html = attemptHtml;
            break;
          } catch (err) {
            const e = err as StreamError;
            lastErr = e;
            // Не ретраим: auth, partial, stuck, user-abort, max-tokens, billing
            if (e.kind !== "pre-stream") throw e;
            if (attempt < maxAttempts - 1) {
              const wait = retryDelays[attempt] as number;
              console.warn(
                `streamSection retry ${attempt + 1}/${maxAttempts - 1} in ${wait}ms:`,
                e.message,
              );
              await clearStreamState(synthesisId, passKey);
              await sleep(wait, run.signal);
              continue;
            }
            throw e;
          }
        }
        if (attemptUsage === null) {
          throw lastErr ?? new StreamError("неизвестная ошибка", "pre-stream");
        }
        usage = attemptUsage;
      } catch (rawErr) {
        /* ── Обрыв стрима → пауза [25690–25765] ── */
        // Не-StreamError сюда попадает только из sleep между ретраями
        // (abort по cancel) — classifyStreamError отличит AbortError
        // (user-abort) от прочего (pre-stream); контента ещё нет.
        const e =
          rawErr instanceof StreamError
            ? rawErr
            : classifyStreamError(rawErr, false);
        // max-tokens: токены реально потрачены — учитываем (err._usage)
        const eUsage = e.usage ?? { inputTokens: 0, outputTokens: 0 };
        totalInputTokens += eUsage.inputTokens;
        totalOutputTokens += eUsage.outputTokens;
        const errorMsg = pauseFriendlyMessage(e);
        // Частичный HTML: streamed-контент прохода (буфер Redis его же
        // держит для reconnect); сохраняем в раздел.
        const partialHtml = await currentPartialHtml(synthesisId, passKey);
        if (partialHtml) {
          for (const def of pass) {
            await upsertSection(
              synthesisId,
              def,
              partialHtml,
              p.secCtx[def.key] ?? "",
            );
          }
        }
        subsections = partialHtml
          ? parseSubsectionsFromHTML(partialHtml, expectedSubs)
          : subsections;
        const doneSubs = subsections.filter((s) => s.chars > 0);
        const cost =
          eUsage.inputTokens * PRICE_IN + eUsage.outputTokens * PRICE_OUT;
        await db
          .update(generationLog)
          .set({
            status: "error",
            errorMessage: e.message,
            outputChars: partialHtml.length,
            inputTokens: eUsage.inputTokens,
            outputTokens: eUsage.outputTokens,
            costUsd: cost.toFixed(6),
            metadata: dsql`metadata || ${JSON.stringify({
              subsections,
            })}::jsonb`,
          })
          .where(eq(generationLog.id, genEntryId));

        if (e.kind === "user-abort") {
          // §3.1: pausedState не создаётся — финализация по правилам stop
          await db.insert(generationLog).values({
            synthesisId,
            sectionKey: sectionKeyJoined,
            sectionLabel,
            logType: "user_action_marker",
            source,
            status: "done",
            metadata: { action: "abort", context: "streamSection", passIdx: i },
          });
          await finalizeRun(
            synthesisId,
            userId,
            dynamicOrder,
            totalInputTokens,
            totalOutputTokens,
          );
          return;
        }

        const isPartial = doneSubs.length > 0;
        const completedPasses: string[][] = [];
        for (let n = 0; n < i; n++)
          completedPasses.push((passes[n] as SectionDefFull[]).map((d) => d.key));

        const pausedState: PausedStateGen = {
          kind: "gen",
          passIdx: i,
          sectionKeys: pass.map((d) => d.key),
          sectionLabel,
          isPartial,
          reason: errorMsg,
          reasonKind: e.kind,
          timestamp: Date.now(),
          partialSubsections: doneSubs.map((s) => s.name),
          expectedSubsections: [...expectedSubs],
          completedPasses,
          genParams: { ...p, secCtx: { ...p.secCtx } },
          skipDegrades: computeSkipDegrades(
            effectiveDeps, pass.map((d) => d.key), completedPasses,
          ),
          ...(e.kind === "max-tokens"
            ? { maxTokensUsed: e.maxTokensUsed || env.anthropic.maxTokens }
            : {}),
        };
        await db
          .update(syntheses)
          .set({
            status: "paused",
            pausedState,
            totalInputTokens,
            totalOutputTokens,
            totalCostUsd: totalCostStr(totalInputTokens, totalOutputTokens),
            updatedAt: new Date(),
          })
          .where(eq(syntheses.id, synthesisId));
        // _logPauseEvent('pause-marker', …) [25766]
        await db.insert(generationLog).values({
          synthesisId,
          sectionKey: sectionKeyJoined,
          sectionLabel,
          logType: "pause_marker",
          source,
          status: "done",
          metadata: {
            kind: "gen",
            reasonKind: e.kind,
            reason: errorMsg,
            sectionLabel,
            passIdx: i,
            isPartial,
            maxTokensUsed:
              e.kind === "max-tokens"
                ? e.maxTokensUsed || env.anthropic.maxTokens
                : null,
          },
        });
        sendToUser(userId, {
          type: "generation_paused",
          synthesisId,
          kind: "gen",
          reasonKind: e.kind,
          reason: errorMsg,
          isPartial,
          partialSubsections: doneSubs.map((s) => s.name),
          expectedSubsections: [...expectedSubs],
          skipDegrades: pausedState.skipDegrades ?? [],
          estimates: await pauseEstimatesFor(synthesisId, pausedState),
        });
        return; // прерываем цикл
      }

      /* ── Успех прохода [25668–25689] ── */
      totalInputTokens += usage.inputTokens;
      totalOutputTokens += usage.outputTokens;
      if (expectedSubs.length > 0) {
        subsections = parseSubsectionsFromHTML(html, expectedSubs);
        subsections.forEach((s) => {
          s.status = "done";
        });
      }
      const cost =
        usage.inputTokens * PRICE_IN + usage.outputTokens * PRICE_OUT;
      await db
        .update(generationLog)
        .set({
          status: "done",
          outputChars: html.length,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: cost.toFixed(6),
          metadata: dsql`metadata || ${JSON.stringify({ subsections })}::jsonb`,
        })
        .where(eq(generationLog.id, genEntryId));

      for (const def of pass) {
        await upsertSection(synthesisId, def, html, p.secCtx[def.key] ?? "");
      }
      await db
        .update(syntheses)
        .set({
          totalInputTokens,
          totalOutputTokens,
          totalCostUsd: totalCostStr(totalInputTokens, totalOutputTokens),
          updatedAt: new Date(),
        })
        .where(eq(syntheses.id, synthesisId));

      /* Авто-заголовок из раздела «name» (updateDocTitleFromName [11871];
         01-arch §4.15 п.5: после section_done для 'name' → PATCH title) */
      if (pass.some((d) => d.key === "name")) {
        const title = extractTitleFromNameHtml(html);
        if (title) {
          await db
            .update(syntheses)
            .set({ title, updatedAt: new Date() })
            .where(eq(syntheses.id, synthesisId));
        }
      }

      /* Парсинг графа [25683–25688] и гранулярных элементов (02 §3) */
      if (i === graphBodyIdx) {
        try {
          const parsed = parseGraphFromHTML(html);
          if (parsed.nodes.length > 0) {
            const saved = await saveGraphToDb(synthesisId, parsed);
            for (const w of saved.warnings) console.warn("Graph parse:", w);
          }
        } catch (e) {
          console.warn("Graph parse:", e);
        }
      }
      if (pass.some((d) => d.key === "theses")) {
        try {
          const parsedTheses = parseThesesFromHTML(html);
          if (parsedTheses.length > 0) {
            await saveElementsToDb(synthesisId, "theses", {
              theses: parsedTheses,
            });
          }
        } catch (e) {
          console.warn("Theses parse:", e);
        }
      }
      if (pass.some((d) => d.key === "glossary")) {
        try {
          const parsedTerms = parseGlossaryFromHTML(html);
          if (parsedTerms.length > 0) {
            await saveElementsToDb(synthesisId, "glossary", {
              glossaryTerms: parsedTerms,
            });
          }
        } catch (e) {
          console.warn("Glossary parse:", e);
        }
      }

      sendToUser(userId, {
        type: "section_done",
        synthesisId,
        sectionKey: passKey,
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: cost,
        },
        html,
      });
    } catch (outerErr) {
      /* ── Сбой ПОСТРОЕНИЯ контекста/промпта → пауза 'context-error'
            (outer catch _runGenPassesFromIdx [25822–25868]) ── */
      console.error(
        "Ошибка построения контекста для раздела:",
        pass.map((d) => d.key),
        outerErr,
      );
      const reason =
        "Ошибка контекста: " +
        ((outerErr as Error).message || String(outerErr));
      const completedPasses: string[][] = [];
      for (let n = 0; n < i; n++)
        completedPasses.push((passes[n] as SectionDefFull[]).map((d) => d.key));
      const pausedState: PausedStateGen = {
        kind: "gen",
        passIdx: i,
        sectionKeys: pass.map((d) => d.key),
        sectionLabel,
        isPartial: false,
        reason,
        reasonKind: "context-error",
        timestamp: Date.now(),
        partialSubsections: [],
        expectedSubsections: [],
        completedPasses,
        genParams: { ...p, secCtx: { ...p.secCtx } },
        skipDegrades: computeSkipDegrades(
          effectiveDeps, pass.map((d) => d.key), completedPasses,
        ),
      };
      await db
        .update(syntheses)
        .set({
          status: "paused",
          pausedState,
          totalInputTokens,
          totalOutputTokens,
          totalCostUsd: totalCostStr(totalInputTokens, totalOutputTokens),
          updatedAt: new Date(),
        })
        .where(eq(syntheses.id, synthesisId));
      await db.insert(generationLog).values({
        synthesisId,
        sectionKey: sectionKeyJoined,
        sectionLabel,
        logType: "pause_marker",
        source,
        status: "done",
        metadata: {
          kind: "gen",
          reasonKind: "context-error",
          reason,
          sectionLabel,
          passIdx: i,
          isPartial: false,
        },
      });
      sendToUser(userId, {
        type: "generation_paused",
        synthesisId,
        kind: "gen",
        reasonKind: "context-error",
        reason,
        isPartial: false,
        skipDegrades: pausedState.skipDegrades ?? [],
        estimates: await pauseEstimatesFor(synthesisId, pausedState),
      });
      return;
    }
  }

  /* ── Финализация после успешного завершения всех проходов ── */
  await finalizeRun(
    synthesisId,
    userId,
    dynamicOrder,
    totalInputTokens,
    totalOutputTokens,
  );
}

/** Частичный HTML раздела из reconnect-буфера Redis (fail-open → ""). */
async function currentPartialHtml(
  synthesisId: string,
  sectionKey: string,
): Promise<string> {
  const state = await getStreamState(synthesisId, sectionKey);
  return state?.htmlSoFar ?? "";
}

function totalCostStr(inputTokens: number, outputTokens: number): string {
  return (inputTokens * PRICE_IN + outputTokens * PRICE_OUT).toFixed(6);
}

/**
 * Финализация (_finalizeGenerationPostloop [12242], серверная доля):
 * капсула → syntheses.capsule_html (в БД раздел сохраняется тоже —
 * гранулярность и перегенерация, адаптация против removeCapsuleFromDocBodies),
 * sectionOrder → фактический динамический порядок, статус 'ready',
 * pausedState → null (защита исходника [12296]), итоговый usage клиенту.
 */
export async function finalizeRun(
  synthesisId: string,
  userId: string,
  dynamicOrder: string[],
  totalInputTokens: number,
  totalOutputTokens: number,
): Promise<void> {
  let capsuleHtml: string | undefined;
  if (dynamicOrder.includes("capsule")) {
    const [capsuleRow] = await db
      .select({ htmlContent: sections.htmlContent })
      .from(sections)
      .where(
        and(
          eq(sections.synthesisId, synthesisId),
          eq(sections.key, "capsule"),
        ),
      )
      .limit(1);
    if (capsuleRow?.htmlContent) capsuleHtml = capsuleRow.htmlContent;
  }

  await db
    .update(syntheses)
    .set({
      status: "ready",
      pausedState: null,
      sectionOrder: dynamicOrder,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd: totalCostStr(totalInputTokens, totalOutputTokens),
      ...(capsuleHtml !== undefined ? { capsuleHtml } : {}),
      updatedAt: new Date(),
    })
    .where(eq(syntheses.id, synthesisId));

  await clearStreamState(synthesisId);

  sendToUser(userId, {
    type: "generation_complete",
    synthesisId,
    totalUsage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      costUsd: totalInputTokens * PRICE_IN + totalOutputTokens * PRICE_OUT,
    },
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   Беседа 2.2 — Regeneration: порты regenerateSection [19971–20227],
   regenerateSubsection [20236–20476], addSection [20922–21216],
   deleteSection [20806–20899], buildDeletionReplacements [20759–20801],
   getAvailableSectionsToAdd [20912], хелперы нумерации [5628–5790].

   Адаптации DOM/DOC_STATE → сервис (задокументированные отступления):
    - UI-блокировки/прогресс/карточки Edit Modal — клиент (2.3); здесь
      WS-события stream_delta / section_done / stream_error;
    - контейнеры db{i} → строки sections; «стриминг на место старого
      подраздела» → врезка spliceSubsectionHtml в html_content (1.4b);
    - confirm-диалоги («Структура устарела», каскад downstream) —
      клиентские (2.3); сервер отдаёт данные (structure_sections,
      analyzeImpact, affectedSubs) и подавляет их при opts.fromPlan,
      как исходник;
    - версия документа: executePlan бампает base/modeRegen (plan-executor),
      standalone-перегенерация подраздела бампает version_sub [18811]
      (startSubsectionRegeneration); ручная перегенерация раздела версию
      НЕ меняет — паритет исходника;
    - deleteSection синхронен и в исходнике не стримит — handle не нужен;
      гранулярный граф (categories/edges/cluster_labels) при удалении
      раздела graph вычищается (аналог G={} [20824]);
    - renumberSectionRefs: TreeWalker по текстовым узлам → строковая
      замена /§\s*(\d+)/ в html_content каждого раздела. ОТСТУПЛЕНИЕ:
      замена задевает и вхождения внутри атрибутов/тегов, но «§ N» в
      разметке Claude встречается только в тексте — риск принят и
      зафиксирован;
    - standalone-ошибка регенерации НЕ создаёт pausedState (паритет:
      ручная перегенерация исходника глотает ошибку в карточке [20716]);
      обрыв шага ПЛАНА → пауза kind='plan' — plan-executor (2.2).
   ═══════════════════════════════════════════════════════════════════════ */

/** ALL_SECTION_KEYS [20906] — дословно (без «sum»). */
export const ALL_SECTION_KEYS = [
  "graph", "glossary", "theses", "name", "history",
  "origin", "practical", "dialogue", "evolution", "critique", "capsule",
] as const;

/** Порт getAvailableSectionsToAdd() [20912]: ключи, которых нет в документе. */
export function getAvailableSectionsToAdd(
  sectionOrder: readonly string[],
): string[] {
  const current = new Set(sectionOrder);
  return ALL_SECTION_KEYS.filter((k) => !current.has(k));
}

/** Параметры генерации со secCtx (форма buildParams; keepFullBudget
 *  опционален — совместимость с GenParams pause-resume-service). */
export type GenParams = PromptParams & {
  secCtx: Record<string, string>;
  keepFullBudget?: boolean | undefined;
  /** Участники-концепции с полями (беседа 3.1; [] — не мета-синтез) */
  conceptParticipants?: ConceptParticipantFull[] | undefined;
  /** Схема родительского контекста строки syntheses (v11 §4.13 п.10) */
  parentContextSchema?: string | undefined;
};

/* ── Инфраструктура порядка от ТЕКУЩЕГО состояния строки ────────────── */

export interface EditInfra {
  p: GenParams;
  resolvedDeps: DepsMap;
  effectiveDeps: DepsMap;
  dynamicOrder: string[];
  defs: SectionDefFull[];
}

/**
 * resolveContextDeps → buildEffectiveDeps → buildDynamicOrder (мутация
 * effectiveDeps сохранена — контекст строится по отмутированной карте,
 * как DOC_STATE.effectiveDeps) → buildSectionDefs → patch. Номера defs
 * НЕ перенумеровываются — фактические берутся из строк sections.
 */
export async function buildEditInfra(
  row: SynthesisRow,
  philosophers: string[],
  secCtx: Record<string, string>,
): Promise<EditInfra> {
  // 3.1: концепции-родители — здесь (все потребители инфраструктуры
  // правок: regenerateSection/Subsection, addSection, планы, роуты —
  // получают мета-контекст без смены своих сигнатур)
  const conceptParticipants = await loadConceptParticipants(row.id);
  const p = buildParams(row, philosophers, secCtx, conceptParticipants);
  const resolvedDeps = await resolveContextDeps(p);
  const effectiveDeps = await buildEffectiveDeps(
    p.sec,
    resolvedDeps,
    p.generationOrder,
  );
  const dynamicOrder = buildDynamicOrder(
    effectiveDeps,
    p.sec,
    resolvedDeps,
    p.generationOrder,
  );
  const defs = await buildSectionDefs(p);
  patchPromptsWithSecCtx(defs, p.secCtx);
  return { p, resolvedDeps, effectiveDeps, dynamicOrder, defs };
}

/** genCommon при регенерации без штатной генерации [20570]: если
 *  служебной строки '_genCommon' нет (напр., импорт) — создать. */
async function ensureGenCommonForEdit(
  synthesisId: string,
  p: GenParams,
  sectionKey: string,
  sysChars: number,
  baseChars: number,
  parentsChars: number,
): Promise<void> {
  const [existing] = await db
    .select({ id: generationLog.id })
    .from(generationLog)
    .where(
      and(
        eq(generationLog.synthesisId, synthesisId),
        eq(generationLog.sectionKey, "_genCommon"),
      ),
    )
    .limit(1);
  if (existing) return;
  const scaffoldLen = `ПАРАМЕТРЫ СИНТЕЗА:\n\n\nЗАДАНИЕ:...\n\n\n`.length;
  await db.insert(generationLog).values({
    synthesisId,
    sectionKey: "_genCommon",
    sectionLabel: "Общие элементы",
    logType: "generation",
    source: "edit",
    status: "common",
    inputChars: sysChars + baseChars + scaffoldLen,
    metadata: {
      genCommon: {
        sysChars,
        baseChars,
        baseCharsWithoutConcepts: baseChars - parentsChars,
        totalConceptOverhead: parentsChars,
        budgetMode: p.keepFullBudget ? "full" : "shrink",
        parentSpecBySection: await buildParentSpecBySection(
          p.conceptParticipants ?? [],
          p,
          [sectionKey],
        ),
        rulesChars: 0,
        qualityChars: 0,
        scaffoldChars: scaffoldLen,
        totalChars: sysChars + baseChars + scaffoldLen,
        conceptBlockSizes: await computeFullConceptBlockSizes(
          p.conceptParticipants ?? [],
        ),
      },
    },
  });
}

/** Общий стрим с ретраями pre-stream (модель streamResp [12642]). */
/** ЭКСПОРТ (беседа 4.1): единая retry-обёртка (порт streamResp [12642])
 *  нужна и mode-service (runMode стримит через тот же контракт);
 *  прецеденты аддитивных экспортов — buildParams (3.1),
 *  loadActualOutputChars (2.1). */
export async function streamWithRetries(
  handle: GenerationSlotHandle,
  streamKey: string,
  fp: string,
  SYS: string,
  apiKey: string,
  onDelta: (delta: string, totalChars: number, htmlSoFar: string) => void,
): Promise<{ usage: { inputTokens: number; outputTokens: number }; html: string }> {
  const retryDelays = env.streaming.retryDelays;
  const maxAttempts = retryDelays.length + 1;
  let usage: { inputTokens: number; outputTokens: number } | null = null;
  let html = "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      let attemptHtml = "";
      usage = await streamSection(
        handle.synthesisId,
        streamKey,
        fp,
        SYS,
        apiKey,
        (delta, totalChars, htmlSoFar) => {
          attemptHtml = htmlSoFar;
          onDelta(delta, totalChars, htmlSoFar);
        },
        { signal: handle.signal },
      );
      html = attemptHtml;
      break;
    } catch (err) {
      const e = err as StreamError;
      if (e.kind !== "pre-stream") throw e;
      if (attempt < maxAttempts - 1) {
        const wait = retryDelays[attempt] as number;
        console.warn(
          `regen retry ${attempt + 1}/${maxAttempts - 1} in ${wait}ms:`,
          e.message,
        );
        await clearStreamState(handle.synthesisId, streamKey);
        await sleep(wait, handle.signal);
        continue;
      }
      throw e;
    }
  }
  if (usage === null) throw new StreamError("неизвестная ошибка", "pre-stream");
  return { usage, html };
}

/** Side-effects раздела [20450–20454, 20661–20684]: graph/name/capsule. */
async function applySectionSideEffects(
  synthesisId: string,
  sectionKey: string,
  html: string,
): Promise<void> {
  if (sectionKey === "graph") {
    try {
      const parsed = parseGraphFromHTML(html);
      if (parsed.nodes.length > 0) {
        const saved = await saveGraphToDb(synthesisId, parsed);
        for (const w of saved.warnings) console.warn("Graph parse:", w);
      }
    } catch (e) {
      console.warn("Graph re-parse after edit:", e);
    }
  }
  if (sectionKey === "theses") {
    try {
      const parsedTheses = parseThesesFromHTML(html);
      if (parsedTheses.length > 0)
        await saveElementsToDb(synthesisId, "theses", { theses: parsedTheses });
    } catch (e) {
      console.warn("Theses parse:", e);
    }
  }
  if (sectionKey === "glossary") {
    try {
      const parsedTerms = parseGlossaryFromHTML(html);
      if (parsedTerms.length > 0)
        await saveElementsToDb(synthesisId, "glossary", {
          glossaryTerms: parsedTerms,
        });
    } catch (e) {
      console.warn("Glossary parse:", e);
    }
  }
  if (sectionKey === "name") {
    const title = extractTitleFromNameHtml(html);
    if (title) {
      await db
        .update(syntheses)
        .set({ title, updatedAt: new Date() })
        .where(eq(syntheses.id, synthesisId));
    }
  }
  if (sectionKey === "capsule") {
    // Адаптация 1.4: строка sections сохраняется тоже
    await db
      .update(syntheses)
      .set({ capsuleHtml: html, updatedAt: new Date() })
      .where(eq(syntheses.id, synthesisId));
  }
}

/** SQL-инкременты totals (устойчиво к параллельным строкам; образец 1.4b). */
/** ЭКСПОРТ (беседа 4.1): mode-service учитывает usage режимов той же
 *  функцией (единая формула totals, без копий). */
export async function bumpTotals(
  synthesisId: string,
  usage: { inputTokens: number; outputTokens: number },
): Promise<void> {
  if (usage.inputTokens === 0 && usage.outputTokens === 0) return;
  const cost = usage.inputTokens * PRICE_IN + usage.outputTokens * PRICE_OUT;
  await db
    .update(syntheses)
    .set({
      totalInputTokens: dsql`${syntheses.totalInputTokens} + ${usage.inputTokens}`,
      totalOutputTokens: dsql`${syntheses.totalOutputTokens} + ${usage.outputTokens}`,
      totalCostUsd: dsql`${syntheses.totalCostUsd} + ${cost.toFixed(6)}::numeric`,
      updatedAt: new Date(),
    })
    .where(eq(syntheses.id, synthesisId));
}

/** Confirm-данные деградации при skip [25686] (долг §12 → 2.2):
 *  прямые потребители пропускаемых разделов по effectiveDeps
 *  (computeDependents — паритет downstream updateLiveCascade), из ещё
 *  не сгенерированных. Кладётся в PausedStateGen.skipDegrades и в
 *  WS generation_paused — клиентский confirm в PauseModal. */
export function computeSkipDegrades(
  effectiveDeps: DepsMap,
  interrupted: readonly string[],
  completedPasses: readonly (readonly string[])[],
): string[] {
  const dependents = computeDependents(effectiveDeps);
  const done = new Set(completedPasses.flat());
  const skipped = new Set(interrupted);
  const out = new Set<string>();
  for (const k of interrupted) {
    for (const d of dependents[k] ?? []) {
      if (!done.has(d) && !skipped.has(d)) out.add(d);
    }
  }
  return [...out];
}

/* ── regenerateSection [19971–20227] ─────────────────────────────────── */

export interface RegenerateSectionOpts {
  /** v10: вызов из плана — подавляет клиентские пост-шаги, ошибки
   *  пробрасываются executor'у (пауза kind='plan') [20716] */
  fromPlan?: boolean | undefined;
}

/**
 * Порт regenerateSection(sectionKey, newCtx, opts): пересборка промпта
 * одного раздела, стрим, сохранение, парсинг элементов, genLog/ctxLog.
 * Ошибки стрима ПРОБРАСЫВАЮТСЯ всегда (адаптация: «глотание» при ручной
 * перегенерации — на вызывающем: startSectionRegeneration шлёт
 * stream_error; из плана — пауза у executor'а).
 */
export async function regenerateSection(
  handle: GenerationSlotHandle,
  sectionKey: string,
  newCtx: string | null | undefined,
  _opts: RegenerateSectionOpts = {},
): Promise<{ inputTokens: number; outputTokens: number }> {
  const { synthesisId, userId } = handle;
  const apiKey = env.anthropic.apiKey; // TODO(6.1): BYO-Key пользователя
  registerParentContextProvider();

  const { row, philosophers, secCtx } = await loadSynthesis(synthesisId);
  const sectionOrder: string[] = row.sectionOrder ?? [];
  if (!sectionOrder.includes(sectionKey)) {
    throw new GenerationError(
      "VALIDATION_ERROR",
      `Раздел «${sectionKey}» отсутствует в документе`,
    );
  }

  // ── 2. Контекст раздела [20509]: newCtx ? set : delete ──
  if (newCtx) secCtx[sectionKey] = newCtx;
  else delete secCtx[sectionKey];
  await db
    .update(sections)
    .set({ secContext: newCtx ?? "", updatedAt: new Date() })
    .where(
      and(eq(sections.synthesisId, synthesisId), eq(sections.key, sectionKey)),
    );

  const infra = await buildEditInfra(row, philosophers, secCtx);
  const { p, resolvedDeps, effectiveDeps } = infra;

  // ТЗ selective-parent-context 10.2 [19984]: маркер миграции схемы
  if (hasConceptParticipants(p) && row.parentContextSchema === "monolithic") {
    await db.insert(generationLog).values({
      synthesisId,
      sectionKey,
      sectionLabel: KEY_LABELS[sectionKey as keyof typeof KEY_LABELS] ?? sectionKey,
      logType: "schema_migration_marker",
      source: "edit",
      status: "done",
      metadata: {
        fromSchema: "monolithic",
        toSchema: PARENT_CONTEXT_SCHEMA_ID,
      },
    });
    await db
      .update(syntheses)
      .set({ parentContextSchema: PARENT_CONTEXT_SCHEMA_ID, updatedAt: new Date() })
      .where(eq(syntheses.id, synthesisId));
    // 3.1: p собран buildEditInfra ДО апдейта — переводим и его, чтобы
    // сама первая перегенерация уже шла по selective (ТЗ 10.2)
    p.parentContextSchema = PARENT_CONTEXT_SCHEMA_ID;
  }

  // ── 3. def раздела; номер — фактический из строки sections [20526] ──
  const def = infra.defs.find((d) => d.key === sectionKey);
  if (!def) {
    throw new GenerationError(
      "VALIDATION_ERROR",
      `Раздел «${sectionKey}» не найден в определениях.`,
    );
  }
  const [secRow] = await db
    .select({ sectionNum: sections.sectionNum })
    .from(sections)
    .where(
      and(eq(sections.synthesisId, synthesisId), eq(sections.key, sectionKey)),
    )
    .limit(1);
  if (secRow) def.num = secRow.sectionNum;

  // ── 4. Контекст из предыдущих разделов [20539–20563] ──
  let prior = "";
  if (sectionKey !== "sum") {
    try {
      const built = await buildContextForSection(
        sectionKey,
        synthesisId,
        p.depth,
        effectiveDeps,
        resolvedDeps,
        {
          source: createDbContextSource(synthesisId),
          params: {
            synthLevel: p.synthLevel,
            method: p.method,
            generationOrder: p.generationOrder,
            keepFullBudget: p.keepFullBudget,
          },
          // 3.1: давление родителей на бюджет (01 §4.13 ч. II)
          participants: p.conceptParticipants ?? [],
        },
      );
      prior = built.text;
      if (built.ctxLog) {
        await db.insert(contextLog).values({
          synthesisId,
          sectionKey: built.ctxLog.sectionKey,
          budget: built.ctxLog.budget,
          totalUsed: built.ctxLog.totalUsed,
          reqFound: built.ctxLog.reqFound,
          reqTotal: built.ctxLog.reqTotal,
          optIncluded: built.ctxLog.optIncluded,
          optTotal: built.ctxLog.optTotal,
          budgetMode: built.ctxLog.budgetMode,
          parentOverhead: built.ctxLog.parentOverhead,
          parentSpec: built.ctxLog.parentSpec,
          entries: built.ctxLog.entries,
        });
      }
    } catch (ctxErr) {
      console.warn(
        "Ошибка построения контекста при перегенерации",
        sectionKey,
        ctxErr,
      );
    }
  }

  // ── 5. Финальный промпт [20566–20587] ──
  const SYS = await buildSYS(p);
  const partStatic = await baseCtxStatic(p);
  const partParents = hasConceptParticipants(p)
    ? await baseCtxParents(p, sectionKey)
    : "";
  const partBase = partStatic + partParents;
  await ensureGenCommonForEdit(
    synthesisId, p, sectionKey, SYS.length, partBase.length, partParents.length,
  );
  const quality = await buildQualityReinforcement(p);
  const stopSignal = await getStopSignal();
  const sp = `§ ${def.num} — ${def.title.toUpperCase()}\n${def.prompt}`;
  const fp = `ПАРАМЕТРЫ СИНТЕЗА:\n${partBase}${prior}\n\nЗАДАНИЕ: составь ТОЛЬКО следующие разделы (строго в указанном порядке, без добавления других):\n\n${sp}${quality}${stopSignal}`;

  // ── 6. genEntry source='edit' [20594–20618] ──
  const subsecMap = await buildSubsectionMap(p);
  const expectedSubs = subsecMap[sectionKey] ?? [];
  const [genEntry] = await db
    .insert(generationLog)
    .values({
      synthesisId,
      sectionKey,
      sectionLabel: `${def.title} [перегенерация]`,
      logType: "generation",
      source: "edit",
      status: "streaming",
      priorChars: prior.length,
      taskChars: sp.length,
      inputChars: SYS.length + fp.length,
      metadata: {
        expectedSubsections: expectedSubs,
        subsections: [],
        promptSkeleton: buildPromptSkeleton(fp),
        sys: SYS,
        secCtxPreview: newCtx
          ? newCtx.slice(0, 120) + (newCtx.length > 120 ? "…" : "")
          : null,
        secCtxChars: newCtx ? newCtx.length : 0,
        budgetMode: p.keepFullBudget ? "full" : "shrink",
        parentOverheadChars: partParents.length,
      },
    })
    .returning({ id: generationLog.id });
  const genEntryId = (genEntry as { id: string }).id;

  // ── 7. Стрим [20620–20634] ──
  let lastSubScan = 0;
  let subsections: ParsedSubsection[] = [];
  const onDelta = (delta: string, totalChars: number, htmlSoFar: string): void => {
    sendToUser(userId, {
      type: "stream_delta",
      synthesisId,
      sectionKey,
      delta,
      totalChars,
    });
    if (expectedSubs.length > 0) {
      const now = Date.now();
      if (now - lastSubScan > SUBSECTION_SCAN_THROTTLE_MS) {
        lastSubScan = now;
        subsections = parseSubsectionsFromHTML(htmlSoFar, expectedSubs);
      }
    }
  };

  try {
    const { usage, html } = await streamWithRetries(
      handle, sectionKey, fp, SYS, apiKey, onDelta,
    );

    // ── 8. Финализация genEntry [20636–20648] ──
    if (expectedSubs.length > 0) {
      subsections = parseSubsectionsFromHTML(html, expectedSubs);
      subsections.forEach((s) => { s.status = "done"; });
    }
    const cost = usage.inputTokens * PRICE_IN + usage.outputTokens * PRICE_OUT;
    await db
      .update(generationLog)
      .set({
        status: "done",
        outputChars: html.length,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: cost.toFixed(6),
        metadata: dsql`metadata || ${JSON.stringify({ subsections })}::jsonb`,
      })
      .where(eq(generationLog.id, genEntryId));

    // ── 12. Раздел + editedSections [20676–20686] ──
    await upsertSection(synthesisId, def, html, newCtx ?? "", true);
    await bumpTotals(synthesisId, usage);
    await applySectionSideEffects(synthesisId, sectionKey, html);

    await clearStreamState(synthesisId, sectionKey);
    sendToUser(userId, {
      type: "section_done",
      synthesisId,
      sectionKey,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: cost,
      },
      html,
    });
    return usage;
  } catch (rawErr) {
    // [20705–20718]: genEntry → error; usage max-tokens учитывается
    const e =
      rawErr instanceof StreamError ? rawErr : classifyStreamError(rawErr, false);
    const eUsage = e.usage ?? { inputTokens: 0, outputTokens: 0 };
    const eCost = eUsage.inputTokens * PRICE_IN + eUsage.outputTokens * PRICE_OUT;
    await db
      .update(generationLog)
      .set({
        status: "error",
        errorMessage: e.message,
        inputTokens: eUsage.inputTokens,
        outputTokens: eUsage.outputTokens,
        costUsd: eCost.toFixed(6),
      })
      .where(eq(generationLog.id, genEntryId));
    await bumpTotals(synthesisId, eUsage);
    throw e;
  }
}

/**
 * Обёртка standalone-перегенерации (POST /regenerate, WS start_regen):
 * собственный слот; ошибка стрима — stream_error клиенту, БЕЗ pausedState
 * (паритет ручной перегенерации исходника [20716]).
 */
export async function startSectionRegeneration(
  synthesisId: string,
  userId: string,
  sectionKey: string,
  ctx?: string | null,
): Promise<void> {
  await withGenerationSlot(synthesisId, userId, async (handle) => {
    try {
      await regenerateSection(handle, sectionKey, ctx ?? null, {});
    } catch (err) {
      const message =
        err instanceof StreamError || err instanceof GenerationError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      console.error(`regenerateSection(${synthesisId}, ${sectionKey}):`, err);
      sendToUser(userId, {
        type: "stream_error",
        synthesisId,
        sectionKey,
        error: message,
        recoverable: false,
      });
    }
  });
}

/* ── regenerateSubsection [20236–20476] (полный; долг 1.4b закрыт) ───── */

export interface SubsectionRegenOpts {
  includeCurrentContent?: boolean | undefined;
  resumeFromInterruption?: boolean | undefined;
  userNote?: string | undefined;
}

/** Поиск подраздела [20390–20402]: точное имя → нечёткое включение. */
export function findSubsection(
  container: HtmlElement,
  name: string,
): HtmlElement | null {
  const exact = container.querySelector(`[data-section="${name}"]`);
  if (exact) return exact;
  const lower = name.toLowerCase();
  for (const sub of container.querySelectorAll("[data-section]")) {
    const n = (sub.getAttribute("data-section") ?? "").toLowerCase();
    if (n.includes(lower) || lower.includes(n)) return sub;
  }
  return null;
}

/** Порт extractSubsectionContent [19950]: таблицы → tableToText,
 *  прочие дети — innerText. */
export function extractSubsectionContent(
  container: HtmlElement,
  subsectionName: string,
): string | null {
  const sec = container.querySelector(`[data-section="${subsectionName}"]`);
  if (!sec) return null;
  const parts: string[] = [];
  for (const child of sec.children) {
    if (child.tagName === "TABLE") {
      parts.push(tableToText(child));
    } else {
      const t = innerTextTrimmed(child);
      if (t) parts.push(t);
    }
  }
  return parts.filter(Boolean).join("\n") || innerTextTrimmed(sec) || null;
}

/**
 * Порт поподраздельного ctxLog-логирования intra-контекста [20255–20310]
 * (перенос из pause-resume-service — объединение по долгу TODO(2.2)).
 */
async function logIntraSectionContext(
  synthesisId: string,
  sectionKey: string,
  subsectionName: string,
  intraSectionCtx: string,
  container: HtmlElement,
): Promise<void> {
  interface IntraPart {
    name: string;
    _start: number;
    len: number;
  }
  const intraParts: IntraPart[] = [];
  const regex = /\[([^\]]+)\]\n/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(intraSectionCtx)) !== null) {
    const prev = intraParts[intraParts.length - 1];
    if (prev) prev.len = m.index - prev._start;
    intraParts.push({ name: m[1] as string, _start: m.index, len: 0 });
  }
  const last = intraParts[intraParts.length - 1];
  if (last) last.len = intraSectionCtx.length - last._start;

  const realSubsectionNames = new Set<string>();
  for (const el of container.querySelectorAll("[data-section]")) {
    const n = el.getAttribute("data-section");
    if (n !== null) realSubsectionNames.add(n);
  }
  const cleanParts: IntraPart[] = [];
  for (const part of intraParts) {
    if (realSubsectionNames.has(part.name)) {
      cleanParts.push(part);
    } else if (cleanParts.length > 0) {
      (cleanParts[cleanParts.length - 1] as IntraPart).len += part.len;
    }
  }

  const entries =
    cleanParts.length > 0
      ? cleanParts.map((part) => ({
          key: "intra:" + part.name,
          status: "found",
          len: part.len,
          priority: "required",
        }))
      : [
          {
            key: "intra:" + sectionKey,
            status: "found",
            len: intraSectionCtx.length,
            priority: "required",
          },
        ];

  await db.insert(contextLog).values({
    synthesisId,
    sectionKey: sectionKey + ":" + subsectionName,
    budget: intraSectionCtx.length,
    totalUsed: intraSectionCtx.length,
    reqFound: entries.length,
    reqTotal: entries.length,
    optIncluded: 0,
    optTotal: 0,
    entries,
  });
}

/**
 * ПОЛНЫЙ порт regenerateSubsection [20236] (объединение с
 * regenerateSubsectionForResume 1.4b — долг §12 закрыт): intra-контекст +
 * его ctxLog [20255], prior-контекст с subsectionName, промпт
 * serializeSubsectionRegen, SYS outputMode='subsection', genEntry
 * source='subsection_regen', стрим с ретраями, врезка результата
 * (spliceSubsectionHtml), side-effects раздела, totals, снимок
 * structureSections при «Структура документа» [20461], editedSections
 * [20445] → is_edited, возврат getIntraDependents для каскада [20475].
 */
export async function regenerateSubsection(
  handle: GenerationSlotHandle,
  p: GenParams,
  def: SectionDefFull,
  subsectionName: string,
  effectiveDeps: DepsMap,
  resolvedDeps: DepsMap,
  opts: SubsectionRegenOpts = {},
): Promise<{
  usage: { inputTokens: number; outputTokens: number };
  affectedSubs: string[];
}> {
  const { synthesisId, userId } = handle;
  const sectionKey = def.key;
  const apiKey = env.anthropic.apiKey; // TODO(6.1): BYO-Key пользователя
  if (!def.parts) {
    throw new GenerationError(
      "VALIDATION_ERROR",
      `Раздел «${sectionKey}» не имеет структурированных parts.`,
    );
  }

  const [secRow] = await db
    .select({ htmlContent: sections.htmlContent })
    .from(sections)
    .where(
      and(eq(sections.synthesisId, synthesisId), eq(sections.key, sectionKey)),
    )
    .limit(1);
  const sectionHtml = secRow?.htmlContent ?? "";
  const container = parseFragment(sectionHtml);

  /* ── 1. Контексты ── */
  const intraSectionCtx = await extractRelevantIntraSectionContext(
    container,
    sectionKey,
    subsectionName,
  );
  if (intraSectionCtx) {
    await logIntraSectionContext(
      synthesisId, sectionKey, subsectionName, intraSectionCtx, container,
    );
  }

  const currentContent = opts.includeCurrentContent
    ? extractSubsectionContent(container, subsectionName)
    : null;

  let priorCtx = "";
  if (sectionKey !== "sum") {
    try {
      const built = await buildContextForSection(
        sectionKey,
        synthesisId,
        p.depth,
        effectiveDeps,
        resolvedDeps,
        {
          source: createDbContextSource(synthesisId),
          params: {
            synthLevel: p.synthLevel,
            method: p.method,
            generationOrder: p.generationOrder,
            keepFullBudget: p.keepFullBudget,
          },
          // 3.1: давление родителей на бюджет; intra-spec — по subsectionName
          participants: p.conceptParticipants ?? [],
          subsectionName,
        },
      );
      priorCtx = built.text;
      if (built.ctxLog) {
        await db.insert(contextLog).values({
          synthesisId,
          sectionKey: built.ctxLog.sectionKey,
          budget: built.ctxLog.budget,
          totalUsed: built.ctxLog.totalUsed,
          reqFound: built.ctxLog.reqFound,
          reqTotal: built.ctxLog.reqTotal,
          optIncluded: built.ctxLog.optIncluded,
          optTotal: built.ctxLog.optTotal,
          budgetMode: built.ctxLog.budgetMode,
          parentOverhead: built.ctxLog.parentOverhead,
          parentSpec: built.ctxLog.parentSpec,
          entries: built.ctxLog.entries,
        });
      }
    } catch (e) {
      console.warn("Subsection regen context error:", e);
    }
  }

  /* ── 2. Промпт [20338–20348] ── */
  const subPrompt = serializeSubsectionRegen(
    def.parts,
    subsectionName,
    intraSectionCtx,
    {
      userNote: opts.userNote ?? "",
      currentContent,
      resumeFromInterruption: !!opts.resumeFromInterruption,
    },
  );
  const SYS = await buildSYS(p, { outputMode: "subsection" });
  const partStatic = await baseCtxStatic(p);
  const partParents = hasConceptParticipants(p)
    ? await baseCtxParents(p, sectionKey, subsectionName)
    : "";
  const partBase = partStatic + partParents;
  const fp = `ПАРАМЕТРЫ СИНТЕЗА:\n${partBase}${priorCtx}\n\n${subPrompt}`;

  /* ── 3. GenLog [20352–20376] ── */
  const [genEntry] = await db
    .insert(generationLog)
    .values({
      synthesisId,
      sectionKey: `${sectionKey}:${subsectionName}`,
      sectionLabel: `${def.title} → ${subsectionName} [подраздел]`,
      logType: "generation",
      source: "subsection_regen",
      status: "streaming",
      priorChars: priorCtx.length,
      taskChars: subPrompt.length,
      inputChars: SYS.length + fp.length,
      metadata: {
        expectedSubsections: [subsectionName],
        subsections: [],
        promptSkeleton: buildPromptSkeleton(fp),
        sys: SYS,
        intraSectionChars: intraSectionCtx ? intraSectionCtx.length : 0,
        hasUserNote: !!opts.userNote,
        userNotePreview: opts.userNote
          ? opts.userNote.slice(0, 120) + (opts.userNote.length > 120 ? "…" : "")
          : null,
        hasCurrentContent: !!(opts.includeCurrentContent && currentContent),
        currentContentChars: currentContent ? currentContent.length : 0,
        budgetMode: p.keepFullBudget ? "full" : "shrink",
        parentOverheadChars: partParents.length,
      },
    })
    .returning({ id: generationLog.id });
  const genEntryId = (genEntry as { id: string }).id;

  /* ── 4. Стрим ── */
  const streamKey = `${sectionKey}:${subsectionName}`;
  try {
    const { usage, html } = await streamWithRetries(
      handle,
      streamKey,
      fp,
      SYS,
      apiKey,
      (delta, totalChars) => {
        sendToUser(userId, {
          type: "stream_delta",
          synthesisId,
          sectionKey,
          delta,
          totalChars,
        });
      },
    );

    /* ── 5. Фиксация + врезка [20426–20444] ── */
    const cost = usage.inputTokens * PRICE_IN + usage.outputTokens * PRICE_OUT;
    await db
      .update(generationLog)
      .set({
        status: "done",
        outputChars: html.length,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: cost.toFixed(6),
        metadata: dsql`metadata || ${JSON.stringify({
          subsections: [
            { name: subsectionName, chars: html.length, status: "done" },
          ],
        })}::jsonb`,
      })
      .where(eq(generationLog.id, genEntryId));

    const newSectionHtml = spliceSubsectionHtml(
      sectionHtml, subsectionName, html,
    );
    await db
      .update(sections)
      .set({ htmlContent: newSectionHtml, isEdited: true, updatedAt: new Date() })
      .where(
        and(eq(sections.synthesisId, synthesisId), eq(sections.key, sectionKey)),
      );
    await bumpTotals(synthesisId, usage);

    /* ── 6. Side-effects [20450–20454] + снимок структуры [20461] ── */
    await applySectionSideEffects(synthesisId, sectionKey, newSectionHtml);
    if (sectionKey === "sum" && subsectionName === STRUCTURE_SUBSECTION) {
      const [fresh] = await db
        .select({ sectionOrder: syntheses.sectionOrder })
        .from(syntheses)
        .where(eq(syntheses.id, synthesisId))
        .limit(1);
      await updateStructureSections(synthesisId, fresh?.sectionOrder ?? []);
    }

    await clearStreamState(synthesisId, streamKey);
    sendToUser(userId, {
      type: "section_done",
      synthesisId,
      sectionKey,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: cost,
      },
      html: newSectionHtml,
    });

    /* ── 7. Зависимые для каскада [20475] ── */
    let affectedSubs: string[] = [];
    try {
      affectedSubs = await getIntraDependents(p, sectionKey, subsectionName);
    } catch (e) {
      console.warn("getIntraDependents:", e);
    }
    return { usage, affectedSubs };
  } catch (rawErr) {
    const e =
      rawErr instanceof StreamError ? rawErr : classifyStreamError(rawErr, false);
    const eUsage = e.usage ?? { inputTokens: 0, outputTokens: 0 };
    const eCost = eUsage.inputTokens * PRICE_IN + eUsage.outputTokens * PRICE_OUT;
    await db
      .update(generationLog)
      .set({
        status: "error",
        errorMessage: e.message,
        inputTokens: eUsage.inputTokens,
        outputTokens: eUsage.outputTokens,
        costUsd: eCost.toFixed(6),
      })
      .where(eq(generationLog.id, genEntryId));
    await bumpTotals(synthesisId, eUsage);
    throw e;
  }
}

/**
 * Исполнение подраздельной перегенерации под УЖЕ занятым слотом
 * (plan-executor, каскад): пересборка infra от текущего состояния,
 * поиск def с parts, вызов regenerateSubsection.
 */
export async function runSubsectionRegen(
  handle: GenerationSlotHandle,
  sectionKey: string,
  subsectionName: string,
  opts: SubsectionRegenOpts = {},
): Promise<{
  usage: { inputTokens: number; outputTokens: number };
  affectedSubs: string[];
}> {
  const { row, philosophers, secCtx } = await loadSynthesis(handle.synthesisId);
  const infra = await buildEditInfra(row, philosophers, secCtx);
  const def = infra.defs.find((d) => d.key === sectionKey);
  if (!def) {
    throw new GenerationError(
      "VALIDATION_ERROR",
      `Раздел «${sectionKey}» не найден в определениях.`,
    );
  }
  const [secRow] = await db
    .select({ sectionNum: sections.sectionNum })
    .from(sections)
    .where(
      and(
        eq(sections.synthesisId, handle.synthesisId),
        eq(sections.key, sectionKey),
      ),
    )
    .limit(1);
  if (secRow) def.num = secRow.sectionNum;
  return regenerateSubsection(
    handle,
    infra.p,
    def,
    subsectionName,
    infra.effectiveDeps,
    infra.resolvedDeps,
    opts,
  );
}

/**
 * Обёртка standalone-перегенерации подраздела (POST /regenerate-subsection,
 * WS start_sub_regen): собственный слот + инкремент version_sub [18811]
 * (executeSubsectionRegen); ошибка стрима — stream_error, БЕЗ pausedState.
 */
export async function startSubsectionRegeneration(
  synthesisId: string,
  userId: string,
  sectionKey: string,
  subsectionName: string,
  opts: SubsectionRegenOpts = {},
): Promise<void> {
  await withGenerationSlot(synthesisId, userId, async (handle) => {
    try {
      await runSubsectionRegen(handle, sectionKey, subsectionName, opts);
      await db
        .update(syntheses)
        .set({
          versionSub: dsql`${syntheses.versionSub} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(syntheses.id, synthesisId));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `regenerateSubsection(${synthesisId}, ${sectionKey}:${subsectionName}):`,
        err,
      );
      sendToUser(userId, {
        type: "stream_error",
        synthesisId,
        sectionKey,
        error: message,
        recoverable: false,
      });
    }
  });
}

/* ── Нумерация разделов [5730] + ссылки §N [5628] ────────────────────── */

/**
 * Порт recalcSectionNumbers(): номера = позиция в sectionOrder (1-based,
 * включая «sum»). Обновляет sections.section_num, возвращает карту
 * oldNum → newNum для перенумерации ссылок.
 */
async function recalcSectionNumbers(
  synthesisId: string,
  sectionOrder: readonly string[],
): Promise<Record<number, number>> {
  const rows = await db
    .select({ key: sections.key, sectionNum: sections.sectionNum })
    .from(sections)
    .where(eq(sections.synthesisId, synthesisId));
  const oldNums = new Map(rows.map((r) => [r.key, r.sectionNum]));
  const renumberMap: Record<number, number> = {};
  let num = 1;
  for (const key of sectionOrder) {
    if (!oldNums.has(key)) continue;
    const oldNum = oldNums.get(key) as number;
    if (oldNum !== num) {
      renumberMap[oldNum] = num;
      await db
        .update(sections)
        .set({ sectionNum: num, updatedAt: new Date() })
        .where(
          and(eq(sections.synthesisId, synthesisId), eq(sections.key, key)),
        );
    }
    num += 1;
  }
  return renumberMap;
}

/**
 * Порт renumberSectionRefs(renumberMap, deletedNums) [5628]: замена
 * ссылок «§ N» в html_content каждого раздела (TreeWalker исходника →
 * строковая замена; отступление задокументировано в шапке блока).
 */
async function renumberSectionRefs(
  synthesisId: string,
  renumberMap: Record<number, number>,
  deletedNums: number[] = [],
): Promise<void> {
  const hasRenumber = Object.keys(renumberMap).length > 0;
  const deletedSet = new Set(deletedNums);
  if (!hasRenumber && deletedSet.size === 0) return;

  const rows = await db
    .select({ key: sections.key, htmlContent: sections.htmlContent })
    .from(sections)
    .where(eq(sections.synthesisId, synthesisId));
  const regex = /§\s*(\d+)/g;
  for (const rowSec of rows) {
    const replaced = rowSec.htmlContent.replace(regex, (match, numStr: string) => {
      const oldNum = Number.parseInt(numStr, 10);
      if (deletedSet.has(oldNum)) return match + " [удалён]";
      const newNum = renumberMap[oldNum];
      if (newNum !== undefined && newNum !== oldNum) {
        return match.replace(numStr, String(newNum));
      }
      return match;
    });
    if (replaced !== rowSec.htmlContent) {
      await db
        .update(sections)
        .set({ htmlContent: replaced, updatedAt: new Date() })
        .where(
          and(eq(sections.synthesisId, synthesisId), eq(sections.key, rowSec.key)),
        );
    }
  }
}

/* ── addSection [20922–21216] ────────────────────────────────────────── */

/** Порт findInsertPosition(newKey) [5761]: индекс в sectionOrder, ПОСЛЕ
 *  которого вставлять (по будущему динамическому порядку). */
async function findInsertPosition(
  row: SynthesisRow,
  philosophers: string[],
  secCtx: Record<string, string>,
  newKey: string,
): Promise<number> {
  const sectionOrder: string[] = row.sectionOrder ?? [];
  const currentSections = sectionOrder.filter((k) => k !== "sum");
  const allSections = [...currentSections, newKey];
  const p = buildParams(row, philosophers, secCtx);
  const resolvedDeps = await resolveContextDeps(p);
  const effDeps = await buildEffectiveDeps(
    allSections, resolvedDeps, p.generationOrder,
  );
  const newOrder = buildDynamicOrder(
    effDeps, allSections, resolvedDeps, p.generationOrder ?? "architectural",
  );
  const posInNew = newOrder.indexOf(newKey);
  for (let i = posInNew - 1; i >= 0; i--) {
    const prevKey = newOrder[i] as string;
    const posInCurrent = sectionOrder.indexOf(prevKey);
    if (posInCurrent !== -1) return posInCurrent;
  }
  return 0; // после sum
}

export interface AddSectionOpts {
  /** v10: вызов из плана — подавляет пост-шаги (TOC/каскады — клиент) */
  fromPlan?: boolean | undefined;
}

/**
 * Порт addSection(sectionKey, newCtx, opts): позиция вставки по будущим
 * зависимостям, обновление sectionOrder, перенумерация §§ и ссылок,
 * контекст, стрим, сохранение, side-effects; при ошибке — откат
 * [21253–21264]. Ошибки стрима пробрасываются (план — пауза executor'а).
 */
export async function addSection(
  handle: GenerationSlotHandle,
  sectionKey: string,
  newCtx: string | null | undefined,
  _opts: AddSectionOpts = {},
): Promise<{ inputTokens: number; outputTokens: number }> {
  const { synthesisId, userId } = handle;
  const apiKey = env.anthropic.apiKey; // TODO(6.1): BYO-Key пользователя
  registerParentContextProvider();

  const { row, philosophers, secCtx } = await loadSynthesis(synthesisId);
  const sectionOrder: string[] = [...(row.sectionOrder ?? [])];
  if (sectionOrder.includes(sectionKey)) {
    throw new GenerationError(
      "VALIDATION_ERROR",
      `Раздел «${sectionKey}» уже есть в документе`,
    );
  }
  if (!(ALL_SECTION_KEYS as readonly string[]).includes(sectionKey)) {
    throw new GenerationError(
      "VALIDATION_ERROR",
      `Неизвестный раздел «${sectionKey}»`,
    );
  }

  /* ── 1–2. Позиция вставки + sectionOrder ── */
  const insertAfterIdx = await findInsertPosition(
    row, philosophers, secCtx, sectionKey,
  );
  sectionOrder.splice(insertAfterIdx + 1, 0, sectionKey);
  await db
    .update(syntheses)
    .set({ sectionOrder, updatedAt: new Date() })
    .where(eq(syntheses.id, synthesisId));

  /* ── 3. Контекст ── */
  if (newCtx) secCtx[sectionKey] = newCtx;

  let inserted = false;
  try {
    /* ── 4–7. Инфраструктура с новым разделом; номер по позиции ── */
    const rowWithNew: SynthesisRow = { ...row, sectionOrder };
    const infra = await buildEditInfra(rowWithNew, philosophers, secCtx);
    const { p, resolvedDeps, effectiveDeps } = infra;
    const newDef = infra.defs.find((d) => d.key === sectionKey);
    if (!newDef) {
      throw new GenerationError(
        "VALIDATION_ERROR",
        `Раздел «${sectionKey}» не найден в определениях.`,
      );
    }
    newDef.num = sectionOrder.indexOf(sectionKey) + 1;

    /* ── 7–8. Перенумерация существующих + ссылки §N ── */
    const renumberMap = await recalcSectionNumbers(synthesisId, sectionOrder);
    await renumberSectionRefs(synthesisId, renumberMap);

    /* ── 9. Контекст и промпт ── */
    let prior = "";
    if (sectionKey !== "sum") {
      try {
        const built = await buildContextForSection(
          sectionKey,
          synthesisId,
          p.depth,
          effectiveDeps,
          resolvedDeps,
          {
            source: createDbContextSource(synthesisId),
            params: {
              synthLevel: p.synthLevel,
              method: p.method,
              generationOrder: p.generationOrder,
              keepFullBudget: p.keepFullBudget,
            },
            // 3.1: давление родителей на бюджет (01 §4.13 ч. II)
            participants: p.conceptParticipants ?? [],
          },
        );
        prior = built.text;
        if (built.ctxLog) {
          await db.insert(contextLog).values({
            synthesisId,
            sectionKey: built.ctxLog.sectionKey,
            budget: built.ctxLog.budget,
            totalUsed: built.ctxLog.totalUsed,
            reqFound: built.ctxLog.reqFound,
            reqTotal: built.ctxLog.reqTotal,
            optIncluded: built.ctxLog.optIncluded,
            optTotal: built.ctxLog.optTotal,
            budgetMode: built.ctxLog.budgetMode,
            parentOverhead: built.ctxLog.parentOverhead,
            parentSpec: built.ctxLog.parentSpec,
            entries: built.ctxLog.entries,
          });
        }
      } catch (ctxErr) {
        console.warn("Ошибка контекста при добавлении раздела", sectionKey, ctxErr);
      }
    }

    const SYS = await buildSYS(p);
    const partStatic = await baseCtxStatic(p);
    const partParents = hasConceptParticipants(p)
      ? await baseCtxParents(p, sectionKey)
      : "";
    const partBase = partStatic + partParents;
    await ensureGenCommonForEdit(
      synthesisId, p, sectionKey, SYS.length, partBase.length, partParents.length,
    );
    const quality = await buildQualityReinforcement(p);
    const stopSignal = await getStopSignal();
    const sp = `§ ${newDef.num} — ${newDef.title.toUpperCase()}\n${newDef.prompt}`;
    const fp = `ПАРАМЕТРЫ СИНТЕЗА:\n${partBase}${prior}\n\nЗАДАНИЕ: составь ТОЛЬКО следующие разделы (строго в указанном порядке, без добавления других):\n\n${sp}${quality}${stopSignal}`;

    /* ── 10. GenLog source='edit_add' ── */
    const subsecMap = await buildSubsectionMap(p);
    const expectedSubs = subsecMap[sectionKey] ?? [];
    const [genEntry] = await db
      .insert(generationLog)
      .values({
        synthesisId,
        sectionKey,
        sectionLabel: `${newDef.title} [добавлен]`,
        logType: "generation",
        source: "edit_add",
        status: "streaming",
        priorChars: prior.length,
        taskChars: sp.length,
        inputChars: SYS.length + fp.length,
        metadata: {
          expectedSubsections: expectedSubs,
          subsections: [],
          promptSkeleton: buildPromptSkeleton(fp),
          sys: SYS,
          budgetMode: p.keepFullBudget ? "full" : "shrink",
          parentOverheadChars: partParents.length,
        },
      })
      .returning({ id: generationLog.id });
    const genEntryId = (genEntry as { id: string }).id;

    /* ── 11. Стрим ── */
    let lastSubScan = 0;
    let subsections: ParsedSubsection[] = [];
    const { usage, html } = await streamWithRetries(
      handle,
      sectionKey,
      fp,
      SYS,
      apiKey,
      (delta, totalChars, htmlSoFar) => {
        sendToUser(userId, {
          type: "stream_delta",
          synthesisId,
          sectionKey,
          delta,
          totalChars,
        });
        if (expectedSubs.length > 0) {
          const now = Date.now();
          if (now - lastSubScan > SUBSECTION_SCAN_THROTTLE_MS) {
            lastSubScan = now;
            subsections = parseSubsectionsFromHTML(htmlSoFar, expectedSubs);
          }
        }
      },
    );

    if (expectedSubs.length > 0) {
      subsections = parseSubsectionsFromHTML(html, expectedSubs);
      subsections.forEach((s) => { s.status = "done"; });
    }
    const cost = usage.inputTokens * PRICE_IN + usage.outputTokens * PRICE_OUT;
    await db
      .update(generationLog)
      .set({
        status: "done",
        outputChars: html.length,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: cost.toFixed(6),
        metadata: dsql`metadata || ${JSON.stringify({ subsections })}::jsonb`,
      })
      .where(eq(generationLog.id, genEntryId));

    /* ── 12–14. Раздел + side-effects (editedSections [21178]) ── */
    await upsertSection(synthesisId, newDef, html, newCtx ?? "", true);
    inserted = true;
    await bumpTotals(synthesisId, usage);
    await applySectionSideEffects(synthesisId, sectionKey, html);

    await clearStreamState(synthesisId, sectionKey);
    sendToUser(userId, {
      type: "section_done",
      synthesisId,
      sectionKey,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: cost,
      },
      html,
    });
    return usage;
  } catch (err) {
    /* ── Откат [21253–21264] ── */
    console.error("Ошибка добавления раздела:", sectionKey, err);
    try {
      const rollbackOrder = sectionOrder.filter((k) => k !== sectionKey);
      await db
        .update(syntheses)
        .set({ sectionOrder: rollbackOrder, updatedAt: new Date() })
        .where(eq(syntheses.id, synthesisId));
      if (inserted) {
        await db
          .delete(sections)
          .where(
            and(
              eq(sections.synthesisId, synthesisId),
              eq(sections.key, sectionKey),
            ),
          );
      }
      const rollbackRenumber = await recalcSectionNumbers(
        synthesisId, rollbackOrder,
      );
      await renumberSectionRefs(synthesisId, rollbackRenumber);
    } catch (rollbackErr) {
      console.warn("addSection rollback:", rollbackErr);
    }
    if (err instanceof StreamError) {
      const eUsage = err.usage ?? { inputTokens: 0, outputTokens: 0 };
      await bumpTotals(synthesisId, eUsage);
    }
    throw err;
  }
}

/* ── deleteSection [20806–20899] ─────────────────────────────────────── */

/**
 * Порт deleteSection(sectionKey): deletion_marker в генлог [20845],
 * удаление строки sections + из sectionOrder, перенумерация §§ и ссылок
 * (с пометкой удалённого), side-effects: graph → очистка гранулярного
 * графа (аналог G={} [20824]), name → заголовок по умолчанию [20860],
 * capsule → capsule_html='' [20865]. Синхронна (без стрима).
 * Предложения «обновить Структуру» — клиент (данные structure_sections).
 */
export async function deleteSection(
  synthesisId: string,
  sectionKey: string,
): Promise<void> {
  const [row] = await db
    .select({ sectionOrder: syntheses.sectionOrder })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  if (!row) throw new GenerationError("NOT_FOUND", "Синтез не найден");
  const sectionOrder: string[] = row.sectionOrder ?? [];
  if (sectionKey === "sum" || !sectionOrder.includes(sectionKey)) {
    throw new GenerationError(
      "VALIDATION_ERROR",
      `Раздел «${sectionKey}» нельзя удалить`,
    );
  }

  const [secRow] = await db
    .select({ sectionNum: sections.sectionNum })
    .from(sections)
    .where(
      and(eq(sections.synthesisId, synthesisId), eq(sections.key, sectionKey)),
    )
    .limit(1);
  const deletedNum = secRow?.sectionNum;

  // ── Запись в лог [20845] ──
  await db.insert(generationLog).values({
    synthesisId,
    sectionKey,
    sectionLabel:
      KEY_LABELS[sectionKey as keyof typeof KEY_LABELS] ?? sectionKey,
    logType: "deletion_marker",
    source: "edit",
    status: "done",
    metadata: { sectionNum: deletedNum ?? null },
  });

  // ── 2–3. Удаление строки + порядок ──
  await db
    .delete(sections)
    .where(
      and(eq(sections.synthesisId, synthesisId), eq(sections.key, sectionKey)),
    );
  const newOrder = sectionOrder.filter((k) => k !== sectionKey);
  await db
    .update(syntheses)
    .set({ sectionOrder: newOrder, updatedAt: new Date() })
    .where(eq(syntheses.id, synthesisId));

  // ── 5–6. Перенумерация + ссылки (с пометкой удалённого) ──
  const renumberMap = await recalcSectionNumbers(synthesisId, newOrder);
  await renumberSectionRefs(
    synthesisId, renumberMap, deletedNum ? [deletedNum] : [],
  );

  // ── 8. Side-effects [20823–20866] ──
  if (sectionKey === "graph") {
    await db
      .delete(categoryEdges)
      .where(eq(categoryEdges.synthesisId, synthesisId));
    await db.delete(categories).where(eq(categories.synthesisId, synthesisId));
    await db
      .delete(clusterLabels)
      .where(eq(clusterLabels.synthesisId, synthesisId));
  }
  if (sectionKey === "name") {
    await db
      .update(syntheses)
      .set({ title: "Синтез Философской Концепции", updatedAt: new Date() })
      .where(eq(syntheses.id, synthesisId));
  }
  if (sectionKey === "capsule") {
    await db
      .update(syntheses)
      .set({ capsuleHtml: "", updatedAt: new Date() })
      .where(eq(syntheses.id, synthesisId));
  }
}

/* ── buildDeletionReplacements [20759–20801] ─────────────────────────── */

export interface DeletionReplacement {
  key: string;
  label: string;
  reason: string;
  quality: number;
}

/**
 * Порт buildDeletionReplacements(deletedKey): какие ОТСУТСТВУЮЩИЕ в
 * документе разделы могут заменить контекст удаляемого (по
 * SUBSTITUTION_MAP). Потребитель — UI удаления (беседа 2.3).
 */
export async function buildDeletionReplacements(
  deletedKey: string,
  sectionOrder: readonly string[],
  generationOrder: "architectural" | "genetic",
): Promise<DeletionReplacement[]> {
  const subMap = await getActiveSubstitutionMap(generationOrder);
  const providedKeys = Object.keys(subMap).filter(
    (k) => sourceOf(k) === deletedKey,
  );
  if (!providedKeys.length) return [];

  const currentSections = new Set(sectionOrder);
  const labels = KEY_LABELS as Record<string, string>;
  const ctxLabels = CTX_LABELS as Record<string, string>;
  const suggestions: Record<
    string,
    { key: string; label: string; reasons: string[]; maxQ: number }
  > = {};

  for (const ctxKey of providedKeys) {
    const candidates = subMap[ctxKey] ?? [];
    for (const { key: subKey, q } of candidates) {
      const src = sourceOf(subKey);
      if (currentSections.has(src)) continue;
      if (src === deletedKey) continue;
      if (!suggestions[src]) {
        suggestions[src] = {
          key: src,
          label: labels[src] ?? src,
          reasons: [],
          maxQ: 0,
        };
      }
      const s = suggestions[src] as {
        key: string; label: string; reasons: string[]; maxQ: number;
      };
      s.reasons.push(
        `${ctxLabels[subKey] ?? subKey} заменяет ${ctxLabels[ctxKey] ?? ctxKey}`,
      );
      s.maxQ = Math.max(s.maxQ, q);
    }
  }

  return Object.values(suggestions)
    .sort((a, b) => b.maxQ - a.maxQ)
    .map((s) => ({
      key: s.key,
      label: s.label,
      reason: s.reasons.slice(0, 2).join("; "),
      quality: s.maxQ,
    }));
}
