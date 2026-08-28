/**
 * Mode Service — система режимов: оппонент / переводчик / временной срез.
 * Беседа 4.1 (07 §6; 03 §1.7/§2.7/§3.1–§3.2; 01-arch §4.15 п.6;
 * карта 04 §1.11/§2.7). Порт блока MODE_CONFIG … regenerateModeSilent
 * исходника [22543–23222].
 *
 * Владение (карта 04): getEffectiveModeDeps [22558] и MODE_CONFIG [22578]
 * живут ЗДЕСЬ — локальные порты беседы 2.1 из cascade-analyzer
 * (getEffectiveModeDepsFromConfig, MODE_TITLES) сняты этой беседой:
 * cascade-analyzer делегирует сюда ЛЕНИВЫМ import() (статический импорт
 * замкнул бы цикл cascade-analyzer → mode-service → generation-service →
 * cascade-analyzer — запрет по грабле 2.1 «статический цикл импортов»).
 *
 * Адаптации против исходника:
 *  - MODE_CONFIG.buildPrompt → шаблоны Prompt Registry
 *    (mode.adversarial / mode.translator / mode.timeslice, посеяны 0.3;
 *    плейсхолдеры {{param}} и {{context}}); статика (title/desc/
 *    paramLabel/paramPlaceholder/suggestions) — хардкод дословно;
 *  - buildModeContext [22651]: DOM-маппинг docBodies → ContextSource
 *    (context-extractor, БД); бюджет 12 000 и приоритизация
 *    required/optional с truncateText — 1:1; ctxLog-запись возвращается
 *    драфтом, вставляет вызывающий (паттерн buildContextForSection 1.3);
 *  - runMode [23020]: DOM/alert-обвязка → WS (stream_delta с sectionKey
 *    "mode:{modeKey}", mode_done §3.2); стрим — streamWithRetries
 *    generation-service (порт streamResp: ретраится только pre-stream);
 *    обрыв НЕ создаёт pausedState (исходник обрабатывает ошибку режима
 *    на месте, паузы у режимов нет) — stream_error шлёт обёртка;
 *  - regenerateModeSilent [23165]: скрытый контейнер → стрим БЕЗ дельт;
 *    замена results[index] → UPDATE строки mode_results с СОХРАНЕНИЕМ
 *    created_at (индексы результатов = позиция по created_at ASC — новая
 *    метка времени перетасовала бы индексы; исходник обновлял timestamp,
 *    отступление задокументировано); source 'mode_cascade' (02 §2.15;
 *    в исходнике строка "mode-cascade" — приведено к enum схемы);
 *  - КВИРКИ сохранены: taskChars = prompt.length − ctx.length в runMode,
 *    но prompt.length ЦЕЛИКОМ в regenerateModeSilent [23183]; catch
 *    silent-перегенерации НЕ учитывает err.usage (в отличие от runMode,
 *    где max-tokens-токены учитываются [23133]); genEntry silent — без
 *    promptSkeleton (исходник не пишет _promptSkeleton в каскаде);
 *  - checkModeDeps [22782]: DOC_STATE.sectionOrder → строка syntheses;
 *    тексты предупреждений дословно.
 *
 * Регистрация в разъём plan-executor'а (setModeRegenerator, долг §12
 * бесед 2.1/2.2) — ПОБОЧНЫМ ЭФФЕКТОМ ИМПОРТА в низе модуля (прецедент —
 * setPlanResumeExecutor 2.2); импортёры: ws/handler, routes/modes.
 */
import { and, asc, eq, sql as dsql } from "drizzle-orm";

import type { GenerationOrder } from "@philosynth/shared/types/synthesis";
import type {
  ModeConfig,
  ModeDepsWarning,
  ModeKey,
} from "@philosynth/shared/types/modes";
import { CTX_LABELS } from "@philosynth/shared/constants/ctx-keys";
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";

import { db } from "../db/index.js";
import { contextLog, generationLog, modeResults, syntheses } from "../db/schema.js";
import { env } from "../env.js";
import type { SectionDeps } from "../utils/deep-merge.js";
import { sourceOf } from "../utils/topo-sort.js";
import { truncateText } from "../utils/text.js";
import { connectionManager } from "../ws/connection-manager.js";
import { clearStreamState } from "../ws/stream-state.js";

import type { WsServerMessage } from "@philosynth/shared/types/ws-messages";

import {
  createDbContextSource,
  extractContextFragment,
  type ContextSource,
} from "./context-extractor.js";
import { estimateModeCost, PRICE_IN, PRICE_OUT } from "./cost-estimator.js";
import type { CostEstimate } from "./cost-estimator.js";
import {
  buildParams,
  buildPromptSkeleton,
  bumpTotals,
  GenerationError,
  loadSynthesis,
  streamWithRetries,
  withGenerationSlot,
  type GenerationSlotHandle,
  type SynthesisRow,
} from "./generation-service.js";
import { setModeRegenerator } from "./plan-executor.js";
import { buildSYS } from "./prompt-builder.js";
import { getConfig, renderTemplate } from "./prompt-registry.js";
import { StreamError, classifyStreamError } from "./streaming-manager.js";

const sendToUser = (userId: string, msg: WsServerMessage): void =>
  connectionManager.sendToUser(userId, msg);

/** CTX_LABELS/KEY_LABELS — const-объекты без индекс-подписи (как в
 *  context-builder 1.3): доступ по строковому ключу через каст. */
const ctxLabel = (k: string): string =>
  (CTX_LABELS as Record<string, string>)[k] ?? k;

/* ══ MODE_CONFIG [22578] — статика дословно, промпты из Registry ═════ */

export const MODE_CONFIG: Readonly<Record<ModeKey, ModeConfig>> = {
  adversarial: {
    key: "adversarial",
    title: "⚔ Оппонент",
    desc: "Генерирует контр-документ от лица философа или традиции, несовместимой с синтезом.",
    paramLabel: "Философ или традиция-оппонент",
    paramPlaceholder: "Например: Кант, логический позитивизм, буддийская Абхидхарма...",
    suggestions: ["Кант", "Логический позитивизм", "Буддийская Абхидхарма", "Маркс", "Постмодернизм"],
    promptKey: "mode.adversarial",
  },
  translator: {
    key: "translator",
    title: "🔄 Переводчик",
    desc: "Переформулирует концепцию в терминах другой философской традиции.",
    paramLabel: "Целевая традиция",
    paramPlaceholder: "Например: аналитическая философия разума, буддийская Абхидхарма...",
    suggestions: ["Аналитическая ФР", "Буддийская Абхидхарма", "Феноменология Гуссерля", "Прагматизм"],
    promptKey: "mode.translator",
  },
  timeslice: {
    key: "timeslice",
    title: "⏳ Временной срез",
    desc: "Проецирует концепцию в конкретный исторический период.",
    paramLabel: "Исторический период",
    paramPlaceholder: "Например: Афины V в. до н.э., Средневековый Париж XIII в....",
    suggestions: ["Афины V в. до н.э.", "Париж XIII в.", "Вена 1920-х", "Киото XVII в."],
    promptKey: "mode.timeslice",
  },
} as const;

export const MODE_KEYS = Object.keys(MODE_CONFIG) as ModeKey[];

/** Конфиг режима либо null для неизвестного ключа (исходник: `if (!config) return`). */
export function getModeConfig(modeKey: string): ModeConfig | null {
  return (MODE_CONFIG as Record<string, ModeConfig | undefined>)[modeKey] ?? null;
}

/* ══ getEffectiveModeDeps [22558] — канонический порт (владелец) ═════ */

/**
 * MODE_DEPS — из Registry (конфиг mode_deps, посеян 0.3). При
 * генетическом порядке graph:nodes / graph:edges замещаются диалоговыми
 * ключами, если графа нет в документе (DOC_STATE.sectionOrder →
 * параметр sectionOrder). Тело 1:1 с локальным портом 2.1 — тот снят.
 */
export async function getEffectiveModeDeps(
  modeKey: string,
  generationOrder: GenerationOrder | undefined,
  sectionOrder: readonly string[],
): Promise<SectionDeps> {
  const modeDeps =
    await getConfig<Record<string, SectionDeps | undefined>>("mode_deps");
  const base = modeDeps[modeKey];
  if (!base) return { required: [], optional: [] };

  if (generationOrder === "genetic") {
    // Заменяем graph:nodes на dialogue:new_concepts, если графа нет
    const hasGraph = sectionOrder.includes("graph");
    const mapKey = (k: string): string => {
      if (k === "graph:nodes" && !hasGraph) return "dialogue:new_concepts";
      if (k === "graph:edges" && !hasGraph) return "dialogue:turning_points";
      return k;
    };
    return {
      required: base.required.map(mapKey),
      optional: base.optional.map(mapKey),
    };
  }

  return base;
}

/* ══ buildModeContext [22651] ════════════════════════════════════════ */

/** Бюджет контекста режима, симв. [22683] */
export const MODE_CONTEXT_BUDGET = 12000;

/** Совместим с ContextEntry (индекс-подпись — требование колонки
 *  entries схемы, как у CtxLogDraft 1.3). */
interface ModeCtxEntry {
  key: string;
  status: "found" | "missing" | "error" | "skipped_budget" | "truncated";
  len: number;
  priority: "required" | "optional";
  note?: string;
  [extra: string]: unknown;
}

export interface ModeCtxLogDraft {
  sectionKey: string;
  budget: number;
  entries: ModeCtxEntry[];
  totalUsed: number;
  reqFound: number;
  reqTotal: number;
  optIncluded: number;
  optTotal: number;
}

export interface BuildModeContextResult {
  text: string;
  ctxLog: ModeCtxLogDraft;
}

export interface BuildModeContextOptions {
  /** Предвычисленные deps (иначе — getEffectiveModeDeps по строке syntheses) */
  deps?: SectionDeps | undefined;
  /** Готовый источник (иначе создаётся createDbContextSource) */
  source?: ContextSource | undefined;
}

/**
 * Порт buildModeContext(modeKey) [22651]: DOM-маппинг `generated` заменён
 * ContextSource (БД); required без бюджета, optional под бюджетом 12 000
 * с truncateText; статусы entries — как в исходнике. ctxLog-драфт
 * возвращается (sectionKey "mode:{modeKey}") — вставляет вызывающий.
 */
export async function buildModeContext(
  modeKey: string,
  synthesisId: string,
  opts: BuildModeContextOptions = {},
): Promise<BuildModeContextResult> {
  let deps = opts.deps;
  if (!deps) {
    const [row] = await db
      .select({
        generationOrder: syntheses.generationOrder,
        sectionOrder: syntheses.sectionOrder,
      })
      .from(syntheses)
      .where(eq(syntheses.id, synthesisId))
      .limit(1);
    deps = await getEffectiveModeDeps(
      modeKey,
      (row?.generationOrder ?? undefined) as GenerationOrder | undefined,
      row?.sectionOrder ?? [],
    );
  }

  const src = opts.source ?? createDbContextSource(synthesisId);
  const parts: string[] = [];
  const logEntries: ModeCtxEntry[] = [];
  const budget = MODE_CONTEXT_BUDGET;
  let used = 0;

  for (const ctxKey of deps.required) {
    try {
      const text = await extractContextFragment(ctxKey, src);
      if (text) {
        parts.push("### " + ctxLabel(ctxKey) + "\n" + text);
        logEntries.push({ key: ctxKey, status: "found", len: text.length, priority: "required" });
        used += text.length;
      } else {
        console.warn("[buildModeContext] required key missing:", ctxKey);
        logEntries.push({ key: ctxKey, status: "missing", len: 0, priority: "required" });
      }
    } catch (err) {
      console.error("[buildModeContext] error extracting", ctxKey, err);
      const note = err instanceof Error ? err.message : String(err);
      logEntries.push({ key: ctxKey, status: "error", len: 0, priority: "required", note });
    }
  }

  for (const ctxKey of deps.optional) {
    if (used >= budget) {
      logEntries.push({
        key: ctxKey, status: "skipped_budget", len: 0,
        priority: "optional", note: "бюджет исчерпан",
      });
      continue;
    }
    try {
      const text = await extractContextFragment(ctxKey, src);
      if (text) {
        const truncated =
          text.length + used > budget ? truncateText(text, budget - used) : text;
        parts.push("### " + ctxLabel(ctxKey) + "\n" + truncated);
        logEntries.push({
          key: ctxKey,
          status: truncated.length < text.length ? "truncated" : "found",
          len: truncated.length,
          priority: "optional",
        });
        used += truncated.length;
      } else {
        logEntries.push({ key: ctxKey, status: "missing", len: 0, priority: "optional" });
      }
    } catch (err) {
      console.error("[buildModeContext] error extracting", ctxKey, err);
      const note = err instanceof Error ? err.message : String(err);
      logEntries.push({ key: ctxKey, status: "error", len: 0, priority: "optional", note });
    }
  }

  const ctxLog: ModeCtxLogDraft = {
    sectionKey: "mode:" + modeKey,
    budget,
    entries: logEntries,
    totalUsed: used,
    reqFound: logEntries.filter(
      (e) => e.priority === "required" && e.status === "found",
    ).length,
    reqTotal: deps.required.length,
    optIncluded: logEntries.filter(
      (e) =>
        e.priority === "optional" &&
        (e.status === "found" || e.status === "truncated"),
    ).length,
    optTotal: deps.optional.length,
  };

  const text =
    parts.length > 0
      ? 'КОНТЕКСТ КОНЦЕПЦИИ:\n"""\n' + parts.join("\n\n") + '\n"""'
      : "";
  return { text, ctxLog };
}

/** Вставка ctxLog-драфта режима в context_log (budget_mode/parent_* —
 *  дефолты схемы: у режимов родительского давления нет). */
async function insertModeCtxLog(
  synthesisId: string,
  draft: ModeCtxLogDraft,
): Promise<void> {
  await db.insert(contextLog).values({
    synthesisId,
    sectionKey: draft.sectionKey,
    budget: draft.budget,
    totalUsed: draft.totalUsed,
    reqFound: draft.reqFound,
    reqTotal: draft.reqTotal,
    optIncluded: draft.optIncluded,
    optTotal: draft.optTotal,
    entries: draft.entries,
  });
}

/* ══ checkModeDeps [22782] ═══════════════════════════════════════════ */

/**
 * Ядро проверки зависимостей: sectionOrder → предупреждения; тексты 1:1.
 * (`src !== "sum"`: sum есть всегда — как в исходнике.)
 */
export async function computeModeDepsWarnings(
  modeKey: string,
  generationOrder: GenerationOrder | undefined,
  sectionOrder: readonly string[],
): Promise<ModeDepsWarning[]> {
  const deps = await getEffectiveModeDeps(modeKey, generationOrder, sectionOrder);
  const warnings: ModeDepsWarning[] = [];
  const available = new Set(sectionOrder);
  const keyLabel = (k: string): string =>
    (KEY_LABELS as Record<string, string>)[k] ?? k;

  for (const ctxKey of deps.required) {
    const src = sourceOf(ctxKey);
    if (src !== "sum" && !available.has(src)) {
      warnings.push({
        level: "error",
        text:
          "Обязательный контекст «" + ctxLabel(ctxKey) +
          "» недоступен (раздел «" + keyLabel(src) + "» не сгенерирован).",
      });
    }
  }

  for (const ctxKey of deps.optional) {
    const src = sourceOf(ctxKey);
    if (src !== "sum" && !available.has(src)) {
      warnings.push({
        level: "info",
        text:
          "Дополнительный контекст «" + ctxLabel(ctxKey) +
          "» недоступен — качество может быть снижено.",
      });
    }
  }

  return warnings;
}

/** Порт checkModeDeps(modeKey) [22782] — сигнатура протокола 4.1
 *  (modeKey, synthesisId): параметры документа читаются из БД. */
export async function checkModeDeps(
  modeKey: string,
  synthesisId: string,
): Promise<ModeDepsWarning[]> {
  const [row] = await db
    .select({
      generationOrder: syntheses.generationOrder,
      sectionOrder: syntheses.sectionOrder,
    })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  if (!row) return [];
  return computeModeDepsWarnings(
    modeKey,
    row.generationOrder as GenerationOrder,
    row.sectionOrder ?? [],
  );
}

/* ══ Оценка стоимости (транспорт для ModeModal) ══════════════════════ */

/** estimateModeCost по строке синтеза: deps + SYS(mode) → cost-estimator
 *  (1.1). fail-open null — оценка не гейт (правило /estimate 3.1). */
export async function estimateModeForSynthesis(
  modeKey: string,
  row: SynthesisRow,
  philosophers: string[],
): Promise<CostEstimate | null> {
  try {
    const p = buildParams(row, philosophers, {});
    const deps = await getEffectiveModeDeps(
      modeKey, p.generationOrder, row.sectionOrder ?? [],
    );
    const sys = await buildSYS(p, { outputMode: "mode" });
    return await estimateModeCost({
      deps,
      params: { depth: p.depth },
      sysChars: sys.length,
    });
  } catch (err) {
    console.warn("estimateModeForSynthesis fail-open:", err);
    return null;
  }
}

/* ══ runMode [23020] ═════════════════════════════════════════════════ */

/** Позиция результата = индекс по created_at ASC (порядок массива
 *  DOC_STATE.modes[modeKey]; тот же контракт — loadModesState 2.1 и
 *  delete-шаги plan-executor 2.2). */
async function loadModeRows(synthesisId: string, modeKey: string) {
  return db
    .select()
    .from(modeResults)
    .where(
      and(eq(modeResults.synthesisId, synthesisId), eq(modeResults.modeKey, modeKey)),
    )
    .orderBy(asc(modeResults.createdAt));
}

export interface RunModeResult {
  usage: { inputTokens: number; outputTokens: number };
  html: string;
  /** Индекс нового результата (позиция по created_at ASC) */
  index: number;
}

/**
 * Порт runMode() [23020] под уже занятым слотом: контекст → промпт из
 * Registry → SYS(mode) → genLog 'mode' → стрим с дельтами (sectionKey
 * "mode:{modeKey}") → mode_results (push) → bumpTotals → version_modes+1
 * → mode_done. Обрыв: genEntry 'error' (usage max-tokens учитывается,
 * как err._usage исходника [23133]), исключение — вызывающему
 * (stream_error шлёт обёртка; pausedState у режимов НЕТ).
 */
export async function runMode(
  handle: GenerationSlotHandle,
  modeKey: string,
  paramValue: string,
): Promise<RunModeResult> {
  const { synthesisId, userId } = handle;
  const config = getModeConfig(modeKey);
  if (!config) {
    throw new GenerationError("NOT_FOUND", `Режим «${modeKey}» не существует`);
  }
  const param = paramValue.trim();
  if (!param) {
    throw new GenerationError("VALIDATION_ERROR", "Заполните параметр.");
  }
  const apiKey = env.anthropic.apiKey; // TODO(6.1): BYO-Key пользователя

  const { row, philosophers, secCtx } = await loadSynthesis(synthesisId);
  const p = buildParams(row, philosophers, secCtx);
  const streamKey = "mode:" + modeKey;

  const deps = await getEffectiveModeDeps(
    modeKey, p.generationOrder, row.sectionOrder ?? [],
  );
  const { text: ctx, ctxLog } = await buildModeContext(modeKey, synthesisId, { deps });
  await insertModeCtxLog(synthesisId, ctxLog);

  const prompt = await renderTemplate(config.promptKey, { param, context: ctx });
  const SYS = await buildSYS(p, { outputMode: "mode" });

  // genEntry [23046]; КВИРК: taskChars = prompt − ctx (в silent — целиком)
  const [genEntry] = await db
    .insert(generationLog)
    .values({
      synthesisId,
      sectionKey: streamKey,
      sectionLabel: `${config.title} · ${param}`,
      logType: "generation",
      source: "mode",
      status: "streaming",
      priorChars: ctx.length,
      taskChars: prompt.length - ctx.length,
      inputChars: SYS.length + prompt.length,
      metadata: {
        modeParam: param,
        ctxChars: ctx.length,
        expectedSubsections: [],
        subsections: [],
        promptSkeleton: buildPromptSkeleton(prompt),
        sys: SYS,
      },
    })
    .returning({ id: generationLog.id });
  const genEntryId = (genEntry as { id: string }).id;

  const onDelta = (delta: string, totalChars: number): void => {
    sendToUser(userId, {
      type: "stream_delta",
      synthesisId,
      sectionKey: streamKey,
      delta,
      totalChars,
    });
  };

  try {
    const { usage, html } = await streamWithRetries(
      handle, streamKey, prompt, SYS, apiKey, onDelta,
    );

    const cost = usage.inputTokens * PRICE_IN + usage.outputTokens * PRICE_OUT;
    await db
      .update(generationLog)
      .set({
        status: "done",
        outputChars: html.length,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: cost.toFixed(6),
      })
      .where(eq(generationLog.id, genEntryId));

    // push результата [23108]; индекс — позиция по created_at ASC
    const index = (await loadModeRows(synthesisId, modeKey)).length;
    await db.insert(modeResults).values({
      synthesisId,
      modeKey,
      paramValue: param,
      htmlContent: html,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: cost.toFixed(6),
    });

    await bumpTotals(synthesisId, usage);
    // v.modes += 1 [23117]
    await db
      .update(syntheses)
      .set({
        versionModes: dsql`${syntheses.versionModes} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(syntheses.id, synthesisId));

    await clearStreamState(synthesisId, streamKey);
    sendToUser(userId, {
      type: "mode_done",
      synthesisId,
      modeKey,
      index,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: cost,
      },
      html,
    });
    return { usage, html, index };
  } catch (rawErr) {
    // [23124–23141]: genEntry → error; usage при max-tokens учитывается
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
 * Обёртка standalone-запуска режима (POST /modes/:modeKey/run,
 * WS start_mode): собственный generation-слот; ошибка стрима —
 * stream_error клиенту БЕЗ pausedState (у режимов паузы нет — паритет
 * runMode исходника, обрабатывающего ошибку на месте). Ошибки ДО слота
 * (GENERATION_IN_PROGRESS, RATE_LIMIT, API_KEY_MISSING) пробрасываются —
 * их шлёт вызывающий (роут honest-кодом, ws — handleBackground).
 */
export async function startMode(
  synthesisId: string,
  userId: string,
  modeKey: string,
  paramValue: string,
): Promise<void> {
  await withGenerationSlot(synthesisId, userId, async (handle) => {
    try {
      await runMode(handle, modeKey, paramValue);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`runMode(${synthesisId}, ${modeKey}):`, err);
      sendToUser(userId, {
        type: "stream_error",
        synthesisId,
        sectionKey: "mode:" + modeKey,
        error: message,
        recoverable: false,
      });
    }
  });
}

/**
 * Фоновая обёртка ОДИНОЧНОЙ тихой перегенерации со своим слотом —
 * транспорт каскада режимов из SubsectionRegenPanel (долг §12 за 4.1).
 * ОТСТУПЛЕНИЕ от исходника: его подраздельный каскад звал runMode() с
 * paramValue ИЗ ПОЛЯ МОДАЛКИ [19034] (создавая НОВЫЙ результат с чужим
 * параметром; комментарий исходника «нужен fallback» — признание
 * дефекта). Здесь — перегенерация СУЩЕСТВУЮЩЕГО результата с его
 * собственным param через regenerateModeSilent, т.е. механизм
 * ПЛАНОВОГО каскада исходника [19756]. Финал — mode_done (обновлённый
 * html из строки), ошибка стрима — stream_error "mode:{modeKey}".
 */
export async function startModeRegen(
  synthesisId: string,
  userId: string,
  modeKey: string,
  index: number,
): Promise<void> {
  await withGenerationSlot(synthesisId, userId, async (handle) => {
    try {
      const usage = await regenerateModeSilent(handle, modeKey, index);
      const rows = await loadModeRows(synthesisId, modeKey);
      const row = rows[index];
      sendToUser(userId, {
        type: "mode_done",
        synthesisId,
        modeKey,
        index,
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: row ? Number(row.costUsd) : 0,
        },
        html: row?.htmlContent ?? "",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`regenerateModeSilent(${synthesisId}, ${modeKey}:${index}):`, err);
      sendToUser(userId, {
        type: "stream_error",
        synthesisId,
        sectionKey: "mode:" + modeKey,
        error: message,
        recoverable: false,
      });
    }
  });
}

/* ══ regenerateModeSilent [23165] ════════════════════════════════════ */

/**
 * Тихая перегенерация одного результата по индексу (каскад планов).
 * Контракт ModeRegenerator (plan-executor 2.2): под УЖЕ занятым слотом,
 * возврат usage + outputChars. Отсутствующий результат/режим — тихий
 * возврат нулей (исходник: `return` без генлога [23167–23170]).
 * Стрим БЕЗ дельт (скрытый tempContainer исходника); результат —
 * UPDATE строки с сохранением created_at (стабильность индексов).
 * КВИРКИ 1:1: taskChars = prompt.length целиком; catch не учитывает
 * err.usage (в отличие от runMode); promptSkeleton не пишется.
 * Ошибка стрима — исключение вызывающему (plan-executor: шаг 'failed',
 * план продолжается — паритет modeErr).
 */
export async function regenerateModeSilent(
  handle: GenerationSlotHandle,
  modeKey: string,
  index: number,
): Promise<{ inputTokens: number; outputTokens: number; outputChars: number }> {
  const { synthesisId } = handle;
  const ZERO = { inputTokens: 0, outputTokens: 0, outputChars: 0 };

  const rows = await loadModeRows(synthesisId, modeKey);
  const target = rows[index];
  if (!target) return ZERO;
  const config = getModeConfig(modeKey);
  if (!config) return ZERO;
  const apiKey = env.anthropic.apiKey; // TODO(6.1): BYO-Key пользователя

  const { row, philosophers, secCtx } = await loadSynthesis(synthesisId);
  const p = buildParams(row, philosophers, secCtx);
  const streamKey = "mode:" + modeKey;

  const deps = await getEffectiveModeDeps(
    modeKey, p.generationOrder, row.sectionOrder ?? [],
  );
  const { text: ctx, ctxLog } = await buildModeContext(modeKey, synthesisId, { deps });
  await insertModeCtxLog(synthesisId, ctxLog);

  const prompt = await renderTemplate(config.promptKey, {
    param: target.paramValue,
    context: ctx,
  });
  const SYS = await buildSYS(p, { outputMode: "mode" });

  // genEntry [23180]; КВИРК: taskChars = prompt.length ЦЕЛИКОМ
  const [genEntry] = await db
    .insert(generationLog)
    .values({
      synthesisId,
      sectionKey: streamKey,
      sectionLabel: `${config.title} · ${target.paramValue} [каскад]`,
      logType: "generation",
      source: "mode_cascade",
      status: "streaming",
      priorChars: ctx.length,
      taskChars: prompt.length,
      inputChars: SYS.length + prompt.length,
      metadata: {
        modeParam: target.paramValue,
        ctxChars: ctx.length,
        expectedSubsections: [],
        subsections: [],
      },
    })
    .returning({ id: generationLog.id });
  const genEntryId = (genEntry as { id: string }).id;

  try {
    const { usage, html } = await streamWithRetries(
      handle, streamKey, prompt, SYS, apiKey,
      () => {}, // silent: скрытый контейнер исходника — дельты не шлём
    );
    const cost = usage.inputTokens * PRICE_IN + usage.outputTokens * PRICE_OUT;
    await db
      .update(generationLog)
      .set({
        status: "done",
        outputChars: html.length,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: cost.toFixed(6),
      })
      .where(eq(generationLog.id, genEntryId));

    // Замена results[index] [23204]: UPDATE с сохранением created_at
    await db
      .update(modeResults)
      .set({
        htmlContent: html,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: cost.toFixed(6),
      })
      .where(eq(modeResults.id, target.id));

    await bumpTotals(synthesisId, usage);
    // v.modeRegen += 1 [23211]
    await db
      .update(syntheses)
      .set({
        versionModeRegen: dsql`${syntheses.versionModeRegen} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(syntheses.id, synthesisId));

    await clearStreamState(synthesisId, streamKey);
    return {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      outputChars: html.length,
    };
  } catch (rawErr) {
    // [23216]: только status+error — КВИРК: usage НЕ учитывается
    const e =
      rawErr instanceof StreamError ? rawErr : classifyStreamError(rawErr, false);
    await db
      .update(generationLog)
      .set({ status: "error", errorMessage: e.message })
      .where(eq(generationLog.id, genEntryId));
    throw e;
  }
}

/* ══ Регистрация в разъём plan-executor (долг §12 бесед 2.1/2.2) ═════ */

// Побочный эффект импорта (прецедент setPlanResumeExecutor 2.2):
// шаги regen_mode планов перестают падать 'failed'.
setModeRegenerator((handle, modeKey, index) =>
  regenerateModeSilent(handle, modeKey, index),
);
