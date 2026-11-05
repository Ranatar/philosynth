/**
 * Тарифы подписки — описание НАЧАЛЬНОГО ПОСЕВА без stripe_price_id (беседа
 * 8.3, запрос 1, п. 1; 02-data-model §2.22, 01-architecture §6 п. 2).
 *
 * 15.4 (Д-74, Д-75): источник истины о тарифах — БД (таблица
 * subscription_plans), правка — админкой и РЕДАКЦИЯМИ (вкладка «Тарифы»,
 * services/plan-admin.ts). Этот файл — только первый посев: сид
 * scripts/seed/seed-plans.ts создаёт отсутствующие планы и НЕ переписывает
 * существующие; расхождение строки с описанием — предупреждением в выводе.
 * Правка чисел здесь после первого посева НИЧЕГО не меняет в службе — это
 * нарочно: сид переписывал строку под всеми подписчиками сразу (Д-75).
 *
 * Обязательное поле stripe_price_id существует лишь в аккаунте Stripe
 * владельца службы — его посев берёт из переменной окружения
 * STRIPE_PRICE_<NAME_UPPER> (priceEnvVarFor), а сами Prices заводит
 * scripts/seed/stripe-create-prices.ts по этому же описанию
 * (lookup_key = stripeLookupKeyFor).
 *
 * Экономика тарифа (правило заведения 8.3: квоты не дороже цены при
 * BILLING_MARKUP) и структурная проверка живут с 15.4 в ОБЩЕМ модуле
 * config/plan-economics.ts — им пользуются и сид, и сервер; здесь они
 * реэкспортированы ради прежних потребителей (сторож 4al, тесты 8.3).
 * validatePlanDefinition сверх общей проверки требует name ∈ PLAN_NAMES:
 * описание посева — закрытый список, редакции админки — нет.
 */
import {
  type PlanBillingPeriod,
  type PlanSpec,
  planSpecIssuesText,
  validatePlanSpec,
} from "./plan-economics.js";

export {
  REFERENCE_DEPTH,
  REFERENCE_SYNTHESIS_SECTIONS,
  REFERENCE_OPERATION_COST_USD,
  computeReferenceOperationCosts,
  computePlanEconomics,
  assertPlanEconomics,
  PlanEconomicsError,
  validatePlanSpec,
  PLAN_QUOTA_FIELDS,
  PLAN_NAME_RE,
} from "./plan-economics.js";
export type {
  PlanBillingPeriod,
  PlanSpec,
  PlanEconomics,
  PlanQuotaField,
  PlanSpecIssue,
  ReferenceOperationCosts,
} from "./plan-economics.js";

/* ── Описание тарифов ────────────────────────────────────────────────── */

export const PLAN_NAMES = ["starter", "pro", "academic"] as const;
export type PlanName = (typeof PLAN_NAMES)[number];

/** Тариф посева без stripe_price_id — всё, что известно коду, а не аккаунту Stripe. */
export interface PlanDefinition extends PlanSpec {
  name: PlanName;
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

/** lookup_key Price в Stripe — ключ идемпотентности stripe-create-prices;
 *  у редакций админки — тот же префикс + name редакции (15.4). */
export const STRIPE_LOOKUP_KEY_PREFIX = "philosynth_";

export function stripeLookupKeyFor(name: PlanName | string): string {
  return `${STRIPE_LOOKUP_KEY_PREFIX}${name}`;
}

/** Имя Product в Stripe — человекочитаемое, одно на семейство тарифа. */
export function stripeProductNameFor(plan: Pick<PlanSpec, "displayName">): string {
  return `PhiloSynth ${plan.displayName}`;
}

/** Интервал Stripe для billing_period (совпадают по написанию, но явно). */
export function stripeIntervalFor(period: PlanBillingPeriod): "month" | "year" {
  return period;
}

/** Структурная валидность описания посева — общая проверка + name из
 *  закрытого списка PLAN_NAMES (ловит опечатки в этом же файле). */
export function validatePlanDefinition(plan: PlanDefinition): string[] {
  const errs = planSpecIssuesText(validatePlanSpec(plan));
  if (!(PLAN_NAMES as readonly string[]).includes(plan.name)) errs.push(`name вне PLAN_NAMES: ${plan.name}`);
  return errs;
}
