/**
 * Экономика и структурная проверка тарифа — ОБЩИЙ модуль сида
 * (scripts/seed/seed-plans.ts), сервера (services/plan-admin.ts — правка и
 * новые редакции админкой) и описания посева (config/plans.ts).
 * Вынесен беседой 15.4 (Д-74, первый запрос п.1) из plans.ts: пока тарифы
 * правил только сид, проверка жила рядом с описанием; теперь строку плана
 * пишет и сервер, и обе стороны обязаны считать одной функцией
 * («экономика проверяется одной функцией на обеих сторонах» — сторож 4bl).
 *
 * Правило заведения (текст беседы 8.3): тариф, у которого квоты дороже
 * цены, завести нельзя. «Дороже» считается тем же, чем считал бы режим
 * баланса: себестоимость операции по ставкам оценщика 1.1 × наценка
 * BILLING_MARKUP («По факту 6.1» п. 6) — иначе подписка была бы дешевле тех
 * же операций по счётчику, и служба платила бы за пользователя.
 *
 * Опорные стоимости операций (REFERENCE_OPERATION_COST_USD) выводятся из
 * констант cost-estimator.ts (CHARS_PER_TOKEN, PRICE_IN/OUT, mw,
 * SECTION_OUTPUT_MULT, WORDS_TO_CHARS, HTML_OVERHEAD, OUTPUT_MULTIPLIER,
 * CONTEXT_BUDGET), а не вписаны числами: сдвинутся ставки — сдвинется и
 * проверка. Модель ВЕРХНЯЯ: каждый проход после первого считается
 * потребившим весь межсекционный бюджет глубины (estimateCost ограничивает
 * контекст бюджетом сверху — здесь берётся сам предел), глубина — 'standard',
 * набор разделов — sum + отмеченные по умолчанию в форме (graph, glossary,
 * theses, history, name, critique) + capsule. Фактические синтезы дешевле;
 * для заслона нужна именно завышенная оценка. Глубина 'exhaustive' в модель
 * не входит: тариф с квотой «синтез» не обязан окупать самый дорогой синтез
 * каждым — иначе квоты выродились бы в единицы; учёт при исчерпании квоты
 * падает на баланс (01 §6 п. 2 «fallback»).
 *
 * PlanSpec — то, что проверяется: поля строки subscription_plans без
 * идентификаторов (id, family, edition, stripe_price_id, is_active) — их
 * экономика не касается. PlanDefinition посева (plans.ts) — PlanSpec с
 * именем из PLAN_NAMES; строка редакции админки — PlanSpec с любым name.
 *
 * Внутри блочных комментариев звёздочка со слешем закрывает комментарий —
 * поэтому пары колонок «used и quota» здесь пишутся словами (09 §8, 6.1).
 */
import { CONTEXT_BUDGET } from "./fragment-share.js";
import {
  CHARS_PER_TOKEN,
  HTML_OVERHEAD,
  OUTPUT_MULTIPLIER,
  PRICE_IN,
  PRICE_OUT,
  SECTION_OUTPUT_MULT,
  WORDS_TO_CHARS,
  mw,
} from "../services/cost-estimator.js";

export type PlanBillingPeriod = "month" | "year";

/** Проверяемые поля тарифа — у описания посева и у строки редакции одни. */
export interface PlanSpec {
  /** Идентификатор редакции: имя семейства у редакции 1, `<family>-v<N>` далее */
  name: string;
  displayName: string;
  /** Цена за период, USD (две цифры после точки — NUMERIC(10,2) в схеме) */
  priceUsd: number;
  billingPeriod: PlanBillingPeriod;
  quotaSyntheses: number;
  quotaRegenerations: number;
  quotaModes: number;
  quotaEnrichments: number;
}

/** Четыре квоты тарифа — ключи полей PlanSpec, по ним и считает экономика. */
export const PLAN_QUOTA_FIELDS = [
  "quotaSyntheses",
  "quotaRegenerations",
  "quotaModes",
  "quotaEnrichments",
] as const;
export type PlanQuotaField = (typeof PLAN_QUOTA_FIELDS)[number];

/** Имя редакции: `[a-z0-9_-]`, 1–40 знаков (lookup_key Stripe и env-переменная
 *  STRIPE_PRICE_<NAME_UPPER> собираются из него). */
export const PLAN_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/* ── Опорные стоимости операций ──────────────────────────────────────── */

/** Глубина опорной модели — умолчание формы. */
export const REFERENCE_DEPTH = "standard" as const;

/**
 * Разделы опорного синтеза: sum (всегда) + отмеченные по умолчанию в
 * SynthesisForm (DEFAULT_SECTIONS 1.5) + capsule (дописывается
 * генерацией). Клиентскую константу сюда не импортируем — сервер не
 * тянет client/; расхождение сторожит integration-check (4al).
 */
export const REFERENCE_SYNTHESIS_SECTIONS: readonly string[] = Object.freeze([
  "sum",
  "graph",
  "glossary",
  "theses",
  "history",
  "name",
  "critique",
  "capsule",
]);

/** Длина системного промпта (факт 1.2: buildSYS = 3192 симв.). */
const REFERENCE_SYS_CHARS = 3200;
/** Статический базовый контекст (зерно + параметры), симв. */
const REFERENCE_BASE_STATIC_CHARS = 2500;
/** Задание раздела + обвязка + заголовок, симв. */
const REFERENCE_SECTION_PROMPT_CHARS = 3000;
/** Фиксированная часть промпта режима (estimateModeCost) */
const MODE_PROMPT_BASE_CHARS = 800;
/** Бюджет контекста режима (estimateModeCost) */
const MODE_CONTEXT_BUDGET_CHARS = 12_000;
/** Блок элемента в промпте обогащения (категория/связь с полями), симв. */
const ENRICHMENT_ELEMENT_CHARS = 4000;

function usd(inChars: number, outChars: number): number {
  const inTokens = Math.ceil(inChars / CHARS_PER_TOKEN);
  const outTokens = Math.ceil(outChars / CHARS_PER_TOKEN);
  return inTokens * PRICE_IN + outTokens * PRICE_OUT;
}

/** Выход раздела в символах — формула estimateCost (1.1). */
function sectionOutputChars(key: string): number {
  const mult = SECTION_OUTPUT_MULT[key] ?? SECTION_OUTPUT_MULT._default!;
  return Math.round(
    mw({ depth: REFERENCE_DEPTH }) * mult * WORDS_TO_CHARS * HTML_OVERHEAD * OUTPUT_MULTIPLIER,
  );
}

export interface ReferenceOperationCosts {
  /** Полный синтез опорного состава (квота syntheses) */
  synthesis: number;
  /** Перегенерация одного раздела среднего веса (квота regenerations) */
  regeneration: number;
  /** Запуск режима (квота modes) */
  mode: number;
  /** Обогащение/обоснование элемента (квота enrichments) */
  enrichment: number;
}

/** Себестоимость опорных операций по ставкам оценщика, USD (без наценки). */
export function computeReferenceOperationCosts(): ReferenceOperationCosts {
  const budget = CONTEXT_BUDGET[REFERENCE_DEPTH];
  const passPrompt = REFERENCE_SYS_CHARS + REFERENCE_BASE_STATIC_CHARS + REFERENCE_SECTION_PROMPT_CHARS;

  // Синтез: по разделу на проход; контекст у всех проходов после первого —
  // верхняя граница (весь бюджет глубины).
  let synthIn = 0;
  let synthOut = 0;
  REFERENCE_SYNTHESIS_SECTIONS.forEach((key, i) => {
    synthIn += passPrompt + (i > 0 ? budget : 0);
    synthOut += sectionOutputChars(key);
  });

  // Перегенерация: один раздел среднего веса с полным контекстом.
  const regenIn = passPrompt + budget;
  const regenOut = sectionOutputChars("_default");

  // Режим: формула estimateModeCost — выход ≈ средний раздел БЕЗ OUTPUT_MULTIPLIER.
  const modeIn = REFERENCE_SYS_CHARS + MODE_PROMPT_BASE_CHARS + MODE_CONTEXT_BUDGET_CHARS;
  const modeOut = Math.round(mw({ depth: REFERENCE_DEPTH }) * 3.5 * WORDS_TO_CHARS * HTML_OVERHEAD);

  // Обогащение: SYS режима + блок элемента; выход — вдвое короче режима.
  const enrichIn = REFERENCE_SYS_CHARS + ENRICHMENT_ELEMENT_CHARS;
  const enrichOut = Math.round(modeOut / 2);

  return {
    synthesis: usd(synthIn, synthOut),
    regeneration: usd(regenIn, regenOut),
    mode: usd(modeIn, modeOut),
    enrichment: usd(enrichIn, enrichOut),
  };
}

/** Вычислено один раз при импорте — константы оценщика не меняются в рантайме. */
export const REFERENCE_OPERATION_COST_USD: Readonly<ReferenceOperationCosts> = Object.freeze(
  computeReferenceOperationCosts(),
);

/* ── Проверка экономики ──────────────────────────────────────────────── */

export interface PlanEconomics {
  /** Себестоимость полного исчерпания квот, USD */
  quotaCostUsd: number;
  /** То же × наценка — что взял бы режим баланса за те же операции */
  quotaChargeUsd: number;
  priceUsd: number;
  /** priceUsd − quotaChargeUsd; отрицательное — тариф убыточен */
  marginUsd: number;
  ok: boolean;
  breakdown: Record<keyof ReferenceOperationCosts, { quota: number; costUsd: number }>;
}

export function computePlanEconomics(
  plan: PlanSpec,
  markup: number,
  ref: ReferenceOperationCosts = REFERENCE_OPERATION_COST_USD,
): PlanEconomics {
  if (!Number.isFinite(markup) || markup <= 0) {
    throw new RangeError(`BILLING_MARKUP должен быть положительным числом, получено: ${markup}`);
  }
  const breakdown = {
    synthesis: { quota: plan.quotaSyntheses, costUsd: plan.quotaSyntheses * ref.synthesis },
    regeneration: { quota: plan.quotaRegenerations, costUsd: plan.quotaRegenerations * ref.regeneration },
    mode: { quota: plan.quotaModes, costUsd: plan.quotaModes * ref.mode },
    enrichment: { quota: plan.quotaEnrichments, costUsd: plan.quotaEnrichments * ref.enrichment },
  };
  const quotaCostUsd = Object.values(breakdown).reduce((s, b) => s + b.costUsd, 0);
  const quotaChargeUsd = quotaCostUsd * markup;
  const marginUsd = plan.priceUsd - quotaChargeUsd;
  return {
    quotaCostUsd,
    quotaChargeUsd,
    priceUsd: plan.priceUsd,
    marginUsd,
    ok: marginUsd >= 0,
    breakdown,
  };
}

export class PlanEconomicsError extends Error {
  economics: PlanEconomics;
  planName: string;
  markup: number;
  constructor(plan: PlanSpec, economics: PlanEconomics, markup: number) {
    // Текст — консольный отчёт сида (русский, как у сидов 0.3); ответ
    // админского маршрута собирает фразу tl() сам по economics (plan-admin.ts)
    super(
      `тариф «${plan.name}» убыточен: квоты стоят $${economics.quotaCostUsd.toFixed(2)} ` +
        `себестоимости × BILLING_MARKUP ${markup} = $${economics.quotaChargeUsd.toFixed(2)} ` +
        `при цене $${plan.priceUsd.toFixed(2)} (не хватает $${(-economics.marginUsd).toFixed(2)}) — ` +
        `уменьшите квоты или поднимите цену`,
    );
    this.name = "PlanEconomicsError";
    this.economics = economics;
    this.planName = plan.name;
    this.markup = markup;
  }
}

/** Бросает PlanEconomicsError, если квоты плана дороже его цены. */
export function assertPlanEconomics(plan: PlanSpec, markup: number): PlanEconomics {
  const e = computePlanEconomics(plan, markup);
  if (!e.ok) throw new PlanEconomicsError(plan, e, markup);
  return e;
}

/**
 * Структурная валидность полей тарифа — одна для описания посева и для
 * строки, которую пишет админка. Возвращает список нарушений (пусто —
 * годен); каждое — код поля и русский текст консоли: маршрут админки
 * переводит коды в `details` сам.
 */
export interface PlanSpecIssue {
  field: keyof PlanSpec;
  text: string;
}

export function validatePlanSpec(plan: PlanSpec): PlanSpecIssue[] {
  const errs: PlanSpecIssue[] = [];
  if (typeof plan.name !== "string" || !PLAN_NAME_RE.test(plan.name))
    errs.push({ field: "name", text: `name — латиница, цифры, «-» и «_», 1–40 знаков: ${String(plan.name)}` });
  if (typeof plan.displayName !== "string" || !plan.displayName.trim()) errs.push({ field: "displayName", text: "displayName пуст" });
  else if (plan.displayName.trim().length > 60) errs.push({ field: "displayName", text: "displayName длиннее 60 знаков" });
  if (
    typeof plan.priceUsd !== "number" ||
    !(plan.priceUsd > 0) ||
    plan.priceUsd > 99_999_999 ||
    Math.abs(Math.round(plan.priceUsd * 100) - plan.priceUsd * 100) > 1e-6
  )
    errs.push({ field: "priceUsd", text: `priceUsd должен быть > 0 с двумя знаками после точки: ${String(plan.priceUsd)}` });
  if (plan.billingPeriod !== "month" && plan.billingPeriod !== "year")
    errs.push({ field: "billingPeriod", text: `billingPeriod: ${String(plan.billingPeriod)}` });
  for (const k of PLAN_QUOTA_FIELDS) {
    const v = plan[k];
    if (!Number.isInteger(v) || (v as number) < 0) errs.push({ field: k, text: `${k} должен быть целым ≥ 0: ${String(v)}` });
  }
  return errs;
}

/** Тексты нарушений одной строкой — для отчётов сида. */
export function planSpecIssuesText(issues: PlanSpecIssue[]): string[] {
  return issues.map((i) => i.text);
}
