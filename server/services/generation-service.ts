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
 *    до неё провайдер честно возвращает "" с предупреждением TODO(3.1).
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
  contextLog,
  generationLog,
  sections,
  syntheses,
  synthesisLineage,
} from "../db/schema.js";
import { env } from "../env.js";
import { parseFragment } from "../utils/html-parser.js";
import { connectionManager } from "../ws/connection-manager.js";
import { clearStreamState, getStreamState } from "../ws/stream-state.js";

import { buildContextForSection } from "./context-builder.js";
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
  type SectionDefFull,
} from "./section-defs-builder.js";
import {
  classifyStreamError,
  pauseFriendlyMessage,
  StreamError,
  streamSection,
} from "./streaming-manager.js";
import { buildEffectiveDeps, resolveContextDeps } from "./synthesis-engine.js";
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
 * (NEXT-CONTEXT 1.2/1.3: «регистрация — 1.4»). Реализация селективного
 * блока — беседа 3.1; до неё провайдер возвращает "" с предупреждением,
 * фиксируя подключённый разъём.
 */
export function registerParentContextProvider(): void {
  if (providerRegistered) return;
  providerRegistered = true;
  setParentContextProvider((p, sectionKey, subsectionName) => {
    void sectionKey;
    void subsectionName;
    if (!hasConceptParticipants(p)) return "";
    console.warn(
      "[generation-service] селективный блок родительского контекста — " +
        "TODO(3.1) conceptContextBlockFull/Selective (meta-synthesis-service); " +
        "блок родителей опущен",
    );
    return "";
  });
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
      isEdited: false,
    })
    .onConflictDoUpdate({
      target: [sections.synthesisId, sections.key],
      set: {
        sectionNum: def.num,
        title: def.title,
        htmlContent,
        secContext,
        isEdited: false,
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

/** Параметры p в форме исходника из строки syntheses. */
function buildParams(
  row: SynthesisRow,
  philosophers: string[],
  secCtx: Record<string, string>,
): PromptParams & {
  secCtx: Record<string, string>;
  keepFullBudget: boolean;
} {
  return {
    seed: row.seed,
    phil: philosophers,
    participants: philosophers.map((name) => ({ type: "philosopher", name })),
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
  const p = buildParams(row, philosophers, secCtx);

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
      [],
      p,
      sectionKeysForSpec,
    ), // TODO(3.1): участники-концепции с полями
    rulesChars: 0,
    qualityChars: partQuality.length,
    scaffoldChars: scaffoldLen,
    totalChars: commonChars,
    conceptBlockSizes: await computeFullConceptBlockSizes([]), // TODO(3.1)
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
        ? await parentFieldsUsedFor([], p, passKey).catch(() => [])
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
