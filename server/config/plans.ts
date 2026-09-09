/**
 * Тарифы подписки — описание в коде БЕЗ stripe_price_id (беседа 8.3,
 * запрос 1, п. 1; 02-data-model §2.22, 01-architecture §6 п. 2).
 *
 * Строки таблицы subscription_plans рождаются только из этого файла
 * посевом scripts/seed-plans.ts (npm run seed:plans). Обязательное поле
 * stripe_price_id существует лишь в аккаунте Stripe владельца службы —
 * его посев берёт из переменной окружения STRIPE_PRICE_<NAME_UPPER>
 * (priceEnvVarFor), а сами Prices заводит scripts/stripe-create-prices.ts
 * по этому же описанию (lookup_key = stripeLookupKeyFor).
 *
 * Экономика тарифа. Подписка продаёт квоты (01 §6): N синтезов, M
 * перегенераций, K режимов, L обогащений за период. Правило заведения
 * (текст беседы 8.3): тариф, у которого квота дороже цены, завести
 * нельзя. «Дороже» считается тем же, чем считал бы режим баланса:
 * себестоимость операции по ставкам оценщика 1.1 × наценка
 * BILLING_MARKUP («По факту 6.1» п. 6) — иначе подписка была бы дешевле
 * тех же операций по счётчику, и служба платила бы за пользователя.
 * Проверка — assertPlanEconomics(plan, markup); посев зовёт её до записи и
 * при провале отвечает fail. Наценка берётся из env при запуске посева,
 * поэтому тариф, проходящий при BILLING_MARKUP=1.2, может не пройти при
 * BILLING_MARKUP=3 — это и есть требуемый отказ, а не дефект.
 *
 * Опорные стоимости операций (REFERENCE_OPERATION_COST_USD) выводятся из
 * констант cost-estimator.ts (CHARS_PER_TOKEN, PRICE_IN/OUT, mw,
 * SECTION_OUTPUT_MULT, WORDS_TO_CHARS, HTML_OVERHEAD, OUTPUT_MULTIPLIER,
 * CONTEXT_BUDGET), а не вписаны числами: сдвинутся ставки — сдвинется и
 * проверка. Модель ВЕРХНЯЯ: каждый проход после первого считается
 * потребившим весь межсекционный бюджет глубины (estimateCost ограничивает
 * контекст бюджетом сверху — здесь берётся сам предел), глубина — 'standard',
 * набор разделов — sum + отмеченные по умолчанию в форме (graph, glossary,
 * theses, history, name, critique) + capsule. Фактические синтезы
 * дешевле; для заслона нужна именно завышенная оценка. Глубина 'exhaustive'
 * в модель не входит: тариф с квотой «синтез» не обязан окупать самый
 * дорогой синтез каждым — иначе квоты выродились бы в единицы; учёт
 * при исчерпании квоты падает на баланс (01 §6 п. 2 «fallback»).
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

/* ── Описание тарифов ────────────────────────────────────────────────── */

export const PLAN_NAMES = ["starter", "pro", "academic"] as const;
export type PlanName = (typeof PLAN_NAMES)[number];

export type PlanBillingPeriod = "month" | "year";

/** Тариф без stripe_price_id — всё, что известно коду, а не аккаунту Stripe. */
export interface PlanDefinition {
  name: PlanName;
  displayName: string;
  /** Цена за период, USD (две цифры после точки — NUMERIC(10,2) в схеме) */
  priceUsd: number;
  billingPeriod: PlanBillingPeriod;
  quotaSyntheses: number;
  quotaRegenerations: number;
  quotaModes: number;
  quotaEnrichments: number;
}

export const PLANS: readonly PlanDefinition[] = Object.freeze([
  {
    name: "starter",
    displayName: "Starter",
    priceUsd: 9.99,
    billingPeriod: "month",
    quotaSyntheses: 3,
    quotaRegenerations: 5,
    quotaModes: 5,
    quotaEnrichments: 10,
  },
  {
    name: "pro",
    displayName: "Pro",
    priceUsd: 29.99,
    billingPeriod: "month",
    quotaSyntheses: 9,
    quotaRegenerations: 15,
    quotaModes: 15,
    quotaEnrichments: 25,
  },
  {
    name: "academic",
    displayName: "Academic",
    priceUsd: 79.99,
    billingPeriod: "month",
    quotaSyntheses: 24,
    quotaRegenerations: 35,
    quotaModes: 35,
    quotaEnrichments: 80,
  },
] satisfies PlanDefinition[]);

export function planByName(name: string): PlanDefinition | undefined {
  return PLANS.find((p) => p.name === name);
}

/** Имя переменной окружения с Price ID: STRIPE_PRICE_STARTER и т. п. */
export function priceEnvVarFor(name: PlanName | string): string {
  return `STRIPE_PRICE_${name.toUpperCase()}`;
}

/** lookup_key Price в Stripe — ключ идемпотентности stripe-create-prices. */
export const STRIPE_LOOKUP_KEY_PREFIX = "philosynth_";

export function stripeLookupKeyFor(name: PlanName | string): string {
  return `${STRIPE_LOOKUP_KEY_PREFIX}${name}`;
}

/** Имя Product в Stripe — человекочитаемое, одно на тариф. */
export function stripeProductNameFor(plan: PlanDefinition): string {
  return `PhiloSynth ${plan.displayName}`;
}

/** Интервал Stripe для billing_period (совпадают по написанию, но явно). */
export function stripeIntervalFor(period: PlanBillingPeriod): "month" | "year" {
  return period;
}

/* ── Опорные стоимости операций ──────────────────────────────────────── */

/** Глубина опорной модели — умолчание формы. */
export const REFERENCE_DEPTH = "standard" as const;

/**
 * Разделы опорного синтеза: sum (всегда) + отмеченные по умолчанию в
 * SynthesisForm (DEFAULT_SECTIONS 1.5) + capsule (дописывается
 * генерацией). Клиентскую константу сюда не импортируем — сервер не
 * тянет client/; расхождение сторожит integration-check.
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
  plan: PlanDefinition,
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
  constructor(plan: PlanDefinition, economics: PlanEconomics, markup: number) {
    super(
      `тариф «${plan.name}» убыточен: квоты стоят $${economics.quotaCostUsd.toFixed(2)} ` +
        `себестоимости × BILLING_MARKUP ${markup} = $${economics.quotaChargeUsd.toFixed(2)} ` +
        `при цене $${plan.priceUsd.toFixed(2)} (не хватает $${(-economics.marginUsd).toFixed(2)}) — ` +
        `уменьшите квоты в server/config/plans.ts или поднимите цену`,
    );
    this.name = "PlanEconomicsError";
    this.economics = economics;
  }
}

/** Бросает PlanEconomicsError, если квоты плана дороже его цены. */
export function assertPlanEconomics(plan: PlanDefinition, markup: number): PlanEconomics {
  const e = computePlanEconomics(plan, markup);
  if (!e.ok) throw new PlanEconomicsError(plan, e, markup);
  return e;
}

/** Структурная валидность описания — ловит опечатки в этом же файле. */
export function validatePlanDefinition(plan: PlanDefinition): string[] {
  const errs: string[] = [];
  if (!(PLAN_NAMES as readonly string[]).includes(plan.name)) errs.push(`name вне PLAN_NAMES: ${plan.name}`);
  if (!plan.displayName.trim()) errs.push("displayName пуст");
  if (!(plan.priceUsd > 0) || Math.abs(Math.round(plan.priceUsd * 100) - plan.priceUsd * 100) > 1e-6)
    errs.push(`priceUsd должен быть > 0 с двумя знаками после точки: ${plan.priceUsd}`);
  if (plan.billingPeriod !== "month" && plan.billingPeriod !== "year")
    errs.push(`billingPeriod: ${String(plan.billingPeriod)}`);
  for (const [k, v] of [
    ["quotaSyntheses", plan.quotaSyntheses],
    ["quotaRegenerations", plan.quotaRegenerations],
    ["quotaModes", plan.quotaModes],
    ["quotaEnrichments", plan.quotaEnrichments],
  ] as const) {
    if (!Number.isInteger(v) || v < 0) errs.push(`${k} должен быть целым ≥ 0: ${v}`);
  }
  return errs;
}
