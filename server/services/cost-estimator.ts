/**
 * Cost Estimator — оценка стоимости генерации (беседа 1.1).
 *
 * Порт из philosynth.html:
 *  - константы оценки [7539–7562]: CHARS_PER_TOKEN, PRICE_IN/OUT,
 *    HTML_OVERHEAD, OUTPUT_MULTIPLIER, WORDS_TO_CHARS, SECTION_OUTPUT_MULT;
 *  - mw(p) [10519] — ожидаемый выход в словах по глубине;
 *  - estimateCost [7634] — суммирование по pass'ам;
 *  - estimateSubsectionCost [7807];
 *  - estimateModeCost [22748].
 *
 * Конфиги FRAGMENT_SHARE / CONTEXT_BUDGET — из Prompt Registry
 * (getConfig("fragment_share") / getConfig("context_budget")) → функции
 * асинхронны.
 *
 * Адаптация DOM/DOC_STATE → входные интерфейсы (в исходнике оценщик сам
 * читает форму, DOC_STATE, genLog и вызывает buildSectionDefs/groupPasses/
 * buildSYS/baseCtx — этих модулей на сервере пока нет, они появятся в
 * беседах 1.2/1.4):
 *  - подготовка defs/passes и длин sysChars/baseStaticChars — обязанность
 *    вызывающего (generation-service, беседа 1.4; для тестов — синтетика);
 *    ядро суммирования портировано 1:1;
 *  - фактические размеры разделов из genLog (findLast done → outputChars)
 *    передаются как actualOutputChars: Record<sectionKey, number>;
 *  - parentOverhead* (селективный родительский контекст, 01-arch §4.13) —
 *    вычисляется parent-context/context-builder (беседа 1.3); здесь
 *    принимается готовым числом/колбэком, по умолчанию 0 (не мета-синтез);
 *  - applyBudgetPressure (пол 40%) по карте 04 принадлежит
 *    context-builder.ts — ЗАКРЫТО в беседе 1.3: локальная копия удалена,
 *    функция импортируется из канонического модуля.
 *
 * Сохранённые формулы и константы — дословно (включая эмпирику 2.6 симв./
 * токен для русского+HTML и цены $3/$15 за MTok).
 */

import type { Depth, GenerationOrder } from "@philosynth/shared/types/synthesis";

import type { DepsMap, SectionDeps } from "../utils/deep-merge.js";
import { applyBudgetPressure } from "./context-builder.js";
import { sourceOf } from "../utils/topo-sort.js";
import { getConfig } from "./prompt-registry.js";

/* ── Константы оценки (дословно, [7539–7562]) ────────────────────────── */

export const CHARS_PER_TOKEN = 2.6; // эмпирика для русского + HTML
export const PRICE_IN = 3 / 1e6; // $3 per MTok input
export const PRICE_OUT = 15 / 1e6; // $15 per MTok output
/** HTML-оверхед: теги, атрибуты, пустые строки добавляют ~50% к объёму чистого текста. */
export const HTML_OVERHEAD = 1.5;
export const OUTPUT_MULTIPLIER = 3.5;
export const WORDS_TO_CHARS = 7; // среднее для русских слов с пробелами

/** Множитель ожидаемого выхода раздела [7548] */
export const SECTION_OUTPUT_MULT: Readonly<Record<string, number>> = {
  sum: 2.8,
  graph: 4.2,
  glossary: 4.0,
  theses: 3.8,
  name: 3.2,
  history: 3.5,
  origin: 4.2,
  practical: 4.5,
  dialogue: 3.2,
  evolution: 3.8,
  critique: 5.0,
  capsule: 0.45,
  _default: 3.5,
};

/** Порт mw(p) [10519]: ожидаемый выход (в словах) за раздел при данной глубине. */
export function mw(p: { depth?: Depth | string | undefined }): number {
  return (
    ({ overview: 150, standard: 250, deep: 400, exhaustive: 600 } as Record<
      string,
      number
    >)[p.depth ?? ""] ?? 250
  );
}

/** Скелет-обвязка задания (литерал исходника [7714]) */
const SCAFFOLD_CHARS =
  `ПАРАМЕТРЫ СИНТЕЗА:\n\n\nЗАДАНИЕ: составь ТОЛЬКО следующие разделы (строго в указанном порядке, без добавления других):\n\n\n\n`
    .length;

export interface CostEstimate {
  inTokens: number;
  outTokens: number;
  /** USD */
  cost: number;
}

export interface FullCostEstimate extends CostEstimate {
  passes: number;
}

/** Конфиги оценки из Registry */
async function loadEstimatorConfigs(): Promise<{
  fragmentShare: Record<string, number>;
  contextBudget: Record<string, number>;
}> {
  const [fragmentShare, contextBudget] = await Promise.all([
    getConfig<Record<string, number>>("fragment_share"),
    getConfig<Record<string, number>>("context_budget"),
  ]);
  return { fragmentShare, contextBudget };
}

/* ── estimateCost [7634] ─────────────────────────────────────────────── */

/** Определение раздела в объёме, нужном оценщику (из buildSectionDefs, 1.2) */
export interface EstimateSectionDef {
  key: string;
  /** Текст промпта раздела (учитывается длина) */
  prompt?: string | undefined;
  /** Заголовок раздела (учитывается длина) */
  title?: string | undefined;
}

export interface EstimateCostInput {
  params: {
    depth: Depth;
    generationOrder?: GenerationOrder | undefined;
    keepFullBudget?: boolean | undefined;
  };
  /** Проходы генерации: groupPasses(defs) (беседа 1.2) */
  passes: EstimateSectionDef[][];
  /** Эффективные зависимости выбранных разделов (buildEffectiveDeps) */
  effectiveDeps: DepsMap;
  /** buildSYS(p).length (беседа 1.2) */
  sysChars: number;
  /** Статическая часть baseCtx: baseCtxStatic(p).length при концепциях-
   *  участниках, иначе полный baseCtx(p).length (логика выбора — у
   *  вызывающего, как _baseStaticChars исходника) */
  baseStaticChars: number;
  /** Обвязка задания; по умолчанию — литерал исходника */
  scaffoldChars?: number | undefined;
  /** Режим редактирования (opts.sections в исходнике): needsContext для
   *  каждого pass с не-sum разделами; фактические размеры прочих разделов
   *  подменяют оценки */
  isEdit?: boolean | undefined;
  /** Фактические outputChars разделов со status=done из genLog
   *  (в edit-режиме подменяют оценку для НЕ-целевых разделов) */
  actualOutputChars?: Record<string, number> | undefined;
  /** Вес родительского контекста для раздела (parentOverheadForSection,
   *  беседа 1.3); по умолчанию 0 — не мета-синтез */
  parentOverheadForSection?: ((sectionKey: string) => number) | undefined;
}

/**
 * Порт ядра estimateCost(opts) [7634]. Подготовка p/defs/passes/effectiveDeps
 * (DOM-ветка и edit-ветка исходника) — у вызывающего; здесь — оценка выхода
 * разделов и суммирование по pass'ам 1:1.
 */
export async function estimateCost(
  input: EstimateCostInput,
): Promise<FullCostEstimate> {
  const { fragmentShare, contextBudget } = await loadEstimatorConfigs();

  const p = input.params;
  const passes = input.passes;
  const effectiveDeps = input.effectiveDeps;
  const isEdit = input.isEdit ?? false;
  const sysChars = input.sysChars;
  const baseStaticChars = input.baseStaticChars;
  const scaffoldChars = input.scaffoldChars ?? SCAFFOLD_CHARS;
  const parentOverheadFor = input.parentOverheadForSection ?? (() => 0);

  const baseBudget0 = contextBudget[p.depth] ?? 48000;
  const keepFullBudget = p.keepFullBudget ?? false;

  // ── Оценка выхода каждого раздела ──
  const defs = passes.flat();
  const targetKeys = new Set(defs.map((d) => d.key));
  const estimatedOutput: Record<string, number> = {};
  for (const def of defs) {
    const mult = SECTION_OUTPUT_MULT[def.key] ?? SECTION_OUTPUT_MULT._default!;
    estimatedOutput[def.key] = Math.round(
      mw(p) * mult * WORDS_TO_CHARS * HTML_OVERHEAD * OUTPUT_MULTIPLIER,
    );
  }

  // При редактировании: фактические размеры уже сгенерированных разделов
  // (используются для оценки контекста — сколько символов даст источник)
  if (isEdit && input.actualOutputChars) {
    for (const [key, chars] of Object.entries(input.actualOutputChars)) {
      if (chars > 0 && !targetKeys.has(key)) {
        estimatedOutput[key] = chars;
      }
    }
  }

  // ── Суммирование ──
  let totalInChars = 0;
  let totalOutChars = 0;

  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i] as EstimateSectionDef[];
    if (pass.length === 0) continue;
    const needsContext = isEdit ? pass.some((d) => d.key !== "sum") : i > 0;

    // Соответствие runtime (_runGenPassesFromIdx): partBase собирается
    // один раз на весь pass через pass[0].key. passParentOverhead и
    // budget вычисляются по репрезентативному ключу (pass[0]).
    const passKey = (pass[0] as EstimateSectionDef).key;
    const passParentOverhead = parentOverheadFor(passKey);
    const baseWithCritic =
      passKey === "critique" ? Math.floor(baseBudget0 * 1.5) : baseBudget0;
    const { effectiveBudget: budgetForPass } = applyBudgetPressure(
      baseWithCritic,
      passParentOverhead,
      keepFullBudget,
    );

    // contextChars складывается по def (как было в оригинале — это
    // верхняя оценка, затем ограничивается общим pass-бюджетом).
    let contextChars = 0;
    if (needsContext) {
      for (const def of pass) {
        if (def.key === "sum") continue;
        const deps: SectionDeps | undefined = effectiveDeps[def.key];
        if (!deps) continue;
        for (const ctxKey of [...deps.required, ...deps.optional]) {
          const src = sourceOf(ctxKey);
          const srcOutput = estimatedOutput[src];
          if (!srcOutput) continue;
          const share = fragmentShare[ctxKey] ?? 0.25;
          contextChars += Math.round(srcOutput * share);
        }
      }
      contextChars = Math.min(contextChars, budgetForPass);
    }

    const sectionPromptsChars = pass.reduce(
      (s, d) => s + (d.prompt?.length ?? 0) + (d.title?.length ?? 0) + 20,
      0,
    );

    const passInChars =
      sysChars +
      baseStaticChars +
      passParentOverhead +
      contextChars +
      sectionPromptsChars +
      scaffoldChars;
    totalInChars += passInChars;

    for (const def of pass) {
      totalOutChars += estimatedOutput[def.key] ?? 0;
    }
  }

  const inTokens = Math.ceil(totalInChars / CHARS_PER_TOKEN);
  const outTokens = Math.ceil(totalOutChars / CHARS_PER_TOKEN);
  const cost = inTokens * PRICE_IN + outTokens * PRICE_OUT;
  return { inTokens, outTokens, cost, passes: passes.length };
}

/* ── estimateSubsectionCost [7807] ───────────────────────────────────── */

/** Подраздел в parts (структура buildSectionDefs, беседа 1.2) */
export interface EstimateSubsectionPart {
  name?: string | undefined;
  /** 'shared' | 'bridge' | обычный подраздел */
  type?: string | undefined;
  /** Для type='shared' — имена подразделов, к которым блок относится */
  scope?: string[] | undefined;
  body?: string | undefined;
}

/** parts раздела в объёме, нужном оценщику */
export interface EstimateSectionParts {
  preamble_short?: string | undefined;
  postamble_short?: string | undefined;
  subsections: EstimateSubsectionPart[];
}

export interface EstimateSubsectionCostInput {
  sectionKey: string;
  subsectionName: string;
  /** def.parts из sectionDefs (беседа 1.2); нет parts → оценка невозможна */
  parts: EstimateSectionParts;
  params: {
    depth: Depth;
    generationOrder?: GenerationOrder | undefined;
    keepFullBudget?: boolean | undefined;
  };
  /** buildSYS(p, {outputMode:"subsection"}).length — SYS подраздела короче */
  sysChars: number;
  /** Статическая часть baseCtx (см. estimateCost) */
  baseStaticChars: number;
  effectiveDeps: DepsMap;
  /** Фактический outputChars раздела из genLog (findLast done>0), если есть */
  sectionOutputChars?: number | undefined;
  /** Фактические outputChars разделов-источников контекста из genLog */
  actualOutputChars?: Record<string, number> | undefined;
  /** parentOverheadForSection(…, subsectionName) (беседа 1.3); default 0 */
  parentOverhead?: number | undefined;
}

/**
 * Порт estimateSubsectionCost(sectionKey, subsectionName) [7807].
 * Возвращает null при отсутствии parts (как исходник при !def?.parts).
 */
export async function estimateSubsectionCost(
  input: EstimateSubsectionCostInput,
): Promise<CostEstimate | null> {
  const { parts, sectionKey, subsectionName, params: p } = input;
  if (!parts || !Array.isArray(parts.subsections)) return null;

  const { fragmentShare, contextBudget } = await loadEstimatorConfigs();

  const sysChars = input.sysChars;
  const parentOverhead = input.parentOverhead ?? 0;

  // ── Промпт подраздела (serializeSubsectionRegen) ──
  // Включает: preamble_short + shared/bridge блоки + body подраздела + note_after
  const sub = parts.subsections.find((s) => s.name === subsectionName);
  let subPromptChars =
    (parts.preamble_short ?? "").length +
    (subsectionName.length + 80) +
    (sub?.body?.length ?? 200) +
    (parts.postamble_short ?? "").length;

  // Shared/bridge блоки
  const subIdx = sub ? parts.subsections.indexOf(sub) : -1;
  for (let i = 0; i < parts.subsections.length; i++) {
    const item = parts.subsections[i] as EstimateSubsectionPart;
    if (item.type === "shared" && item.scope?.includes(subsectionName)) {
      subPromptChars += item.body?.length ?? 0;
    } else if (item.type === "bridge" && i < subIdx) {
      subPromptChars += item.body?.length ?? 0;
    }
  }

  // ── Intra-section контекст (текст других подразделов того же раздела) ──
  // Берём фактический размер раздела из genLog, если доступен
  const sectionOutputChars =
    input.sectionOutputChars ??
    Math.round(
      mw(p) *
        (SECTION_OUTPUT_MULT[sectionKey] ?? SECTION_OUTPUT_MULT._default!) *
        WORDS_TO_CHARS *
        HTML_OVERHEAD *
        OUTPUT_MULTIPLIER,
    );

  // Intra-контекст ≈ весь раздел минус целевой подраздел (с сжатием ~0.6)
  const subsections = parts.subsections.filter((s) => s.name);
  const subCount = Math.max(subsections.length, 1);
  const intraSectionEstimate = Math.round(
    sectionOutputChars * (1 - 1 / subCount) * 0.4,
  );
  subPromptChars += intraSectionEstimate;

  // ── Prior контекст (из предыдущих разделов) ──
  // Тот же подход, что и estimateCost: FRAGMENT_SHARE + фактические размеры
  let baseBudget = contextBudget[p.depth] ?? 48000;
  if (sectionKey === "critique") baseBudget = Math.floor(baseBudget * 1.5);
  const keepFull = p.keepFullBudget ?? false;
  const { effectiveBudget: budget } = applyBudgetPressure(
    baseBudget,
    parentOverhead,
    keepFull,
  );

  const deps = input.effectiveDeps[sectionKey];
  let priorCtxEstimate = 0;
  if (deps) {
    const allKeys = [...deps.required, ...deps.optional];
    for (const ctxKey of allKeys) {
      const src = sourceOf(ctxKey);
      // Фактический размер из genLog (приоритет) или оценка
      const actual = input.actualOutputChars?.[src];
      const srcOutput =
        actual && actual > 0
          ? actual
          : Math.round(
              mw(p) *
                (SECTION_OUTPUT_MULT[src] ?? SECTION_OUTPUT_MULT._default!) *
                WORDS_TO_CHARS *
                HTML_OVERHEAD *
                OUTPUT_MULTIPLIER,
            );
      const share = fragmentShare[ctxKey] ?? 0.25;
      priorCtxEstimate += Math.round(srcOutput * share);
    }
    priorCtxEstimate = Math.min(priorCtxEstimate, budget);
  }

  const totalInChars =
    sysChars +
    input.baseStaticChars +
    parentOverhead +
    subPromptChars +
    priorCtxEstimate;

  // ── Выход: подраздел ≈ 1/N от полного раздела ──
  const sectionMult =
    SECTION_OUTPUT_MULT[sectionKey] ?? SECTION_OUTPUT_MULT._default!;
  const fullSectionOutput =
    mw(p) * sectionMult * WORDS_TO_CHARS * HTML_OVERHEAD * OUTPUT_MULTIPLIER;
  const subShare = 1 / subCount;
  const totalOutChars = Math.round(fullSectionOutput * subShare);

  const inTokens = Math.ceil(totalInChars / CHARS_PER_TOKEN);
  const outTokens = Math.ceil(totalOutChars / CHARS_PER_TOKEN);
  const cost = inTokens * PRICE_IN + outTokens * PRICE_OUT;
  return { inTokens, outTokens, cost };
}

/* ── estimateModeCost [22748] ────────────────────────────────────────── */

export interface EstimateModeCostInput {
  /** getEffectiveModeDeps(modeKey, p) — mode-service, беседа 4.1 */
  deps: SectionDeps;
  params: { depth: Depth };
  /** buildSYS(p, {outputMode:"mode"}).length — SYS режима чуть короче */
  sysChars: number;
}

/**
 * Порт estimateModeCost(modeKey) [22748]. Зависимости режима передаются
 * готовыми (getEffectiveModeDeps — беседа 4.1). Квирк исходника сохранён:
 * srcOutput здесь БЕЗ OUTPUT_MULTIPLIER (в отличие от разделов), выход
 * режима ≈ средний раздел (mw × 3.5).
 */
export async function estimateModeCost(
  input: EstimateModeCostInput,
): Promise<CostEstimate> {
  const { fragmentShare } = await loadEstimatorConfigs();
  const { deps, params: p, sysChars } = input;

  const promptBaseChars = 800; // фиксированная часть промпта режима

  // Контекст: оценка по зависимостям
  let ctxEstimate = 0;
  for (const ctxKey of [...deps.required, ...deps.optional]) {
    const src = sourceOf(ctxKey);
    const share = fragmentShare[ctxKey] ?? 0.25;
    const srcMult = SECTION_OUTPUT_MULT[src] ?? SECTION_OUTPUT_MULT._default!;
    const srcOutput = mw(p) * srcMult * WORDS_TO_CHARS * HTML_OVERHEAD;
    ctxEstimate += Math.round(srcOutput * share);
  }
  ctxEstimate = Math.min(ctxEstimate, 12000); // бюджет режима

  const totalInChars = sysChars + promptBaseChars + ctxEstimate;

  // Выход: режим ≈ средний раздел
  const totalOutChars = Math.round(mw(p) * 3.5 * WORDS_TO_CHARS * HTML_OVERHEAD);

  const inTokens = Math.ceil(totalInChars / CHARS_PER_TOKEN);
  const outTokens = Math.ceil(totalOutChars / CHARS_PER_TOKEN);
  const cost = inTokens * PRICE_IN + outTokens * PRICE_OUT;
  return { inTokens, outTokens, cost };
}
