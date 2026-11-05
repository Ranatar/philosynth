/**
 * Типы биллинга: использование API, транзакции, подписки.
 * Соответствие: server/db/schema.ts (api_usage, transactions, api_keys,
 * subscription_plans, user_subscriptions), 03-specification §2.10.
 */

/**
 * Режим биллинга запроса — три значения по приоритету 01 §6
 * (правка 2026-09-02): byo — ключ пользователя, списания нет, costUsd
 * несёт себестоимость; subscription — списана квота; balance — списано
 * с баланса. Прежний enum byo|service не различал подписку и баланс.
 */
export type BillingMode = "byo" | "subscription" | "balance";

export type TransactionType = "topup" | "usage" | "refund";

/** Строка api_usage */
export interface ApiUsage {
  id: string;
  userId: string;
  synthesisId: string | null;
  sectionKey: string | null;
  billingMode: BillingMode;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: string;
}

/** Итоги за период (GET /billing/usage) */
export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  requests: number;
}

/** Строка transactions */
export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amountUsd: number;
  balanceAfter: number;
  synthesisId: string | null;
  sectionKey: string | null;
  stripeId: string | null;
  createdAt: string;
}

/** GET /billing/api-key — без самого ключа (encrypted_key не покидает БД) */
export interface ApiKeyInfo {
  id: string;
  /** 'sk-ant-api03-...' (первые 14 символов) */
  prefix: string;
  isActive: boolean;
  createdAt: string;
}

/* ── Подписки (Фаза 6) ───────────────────────────────────────────────── */

export type BillingPeriod = "month" | "year";

export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "trialing"
  | "incomplete";

/** Строка subscription_plans */
export interface SubscriptionPlan {
  id: string;
  /** Уникальный идентификатор РЕДАКЦИИ: 'starter' (редакция 1),
   *  'starter-v2' (редакция 2) … — 15.4 (Д-74) */
  name: string;
  /** 15.4 (Д-74): семейство тарифа — у всех редакций одно ('starter');
   *  редакция 1 посеяна из plans.ts, следующие заводит админка */
  family: string;
  /** 15.4 (Д-74): номер редакции в семействе, с 1 */
  edition: number;
  displayName: string;
  priceUsd: number;
  billingPeriod: BillingPeriod;
  quotaSyntheses: number;
  quotaRegenerations: number;
  quotaModes: number;
  quotaEnrichments: number;
  stripePriceId: string;
  /** «открыт для покупки»: только такие отдаёт GET /billing/plans и
   *  принимает POST /billing/subscribe; закрытая редакция живёт ради
   *  своих подписчиков (15.4) */
  isActive: boolean;
  createdAt: string;
}

/* ── Админка тарифов (беседа 15.4, Д-74) ───────────────────────────────── */

/** Строка вкладки «Тарифы»: план + число живых подписок (status ≠ canceled —
 *  те, что держат Price и квоты; GET /billing/admin/plans). */
export interface AdminPlanRow extends SubscriptionPlan {
  liveSubscriptions: number;
}

/** Ответ GET /billing/admin/plans — все редакции всех семейств,
 *  открытые и закрытые, по семейству и номеру редакции. */
export interface AdminPlansView {
  plans: AdminPlanRow[];
}

/** Поля тарифа, которые правит человек (без name/family/edition/price id). */
export interface PlanFieldsInput {
  displayName?: string;
  priceUsd?: number;
  billingPeriod?: BillingPeriod;
  quotaSyntheses?: number;
  quotaRegenerations?: number;
  quotaModes?: number;
  quotaEnrichments?: number;
}

/** PATCH /billing/admin/plans/:id — правка на месте. displayName и isActive
 *  правятся всегда; цена, период и квоты — только у плана БЕЗ живых подписок
 *  (иначе 409 PLAN_HAS_SUBSCRIPTIONS с details.lockedFields). Новая цена или
 *  период — новый Stripe Price, прежний выключается. */
export interface PlanUpdateInput extends PlanFieldsInput {
  isActive?: boolean;
}

/** POST /billing/admin/plans/:id/editions — новая редакция семейства:
 *  поля по умолчанию берутся у прежней редакции; name и edition назначает
 *  сервер; прежняя редакция закрывается для покупки, её подписчики
 *  дорабатывают на своей. */
export type PlanEditionInput = PlanFieldsInput;

/** POST /billing/admin/plans — новое семейство (редакция 1); isActive по
 *  умолчанию true (Price заводится тут же). */
export interface PlanCreateInput {
  name: string;
  isActive?: boolean;
  displayName: string;
  priceUsd: number;
  billingPeriod: BillingPeriod;
  quotaSyntheses: number;
  quotaRegenerations: number;
  quotaModes: number;
  quotaEnrichments: number;
}

/** Ответ PATCH / POST редакции / POST семейства: план после записи;
 *  previous — закрытая прежняя редакция (только у новой редакции). */
export interface AdminPlanResult {
  plan: AdminPlanRow;
  previous?: AdminPlanRow;
  /** id Stripe Price, выключенного при смене цены (PATCH) */
  retiredPriceId?: string | null;
}

/** Строка user_subscriptions */
export interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  /** Счётчики использования (сбрасываются в начале периода) */
  usedSyntheses: number;
  usedRegenerations: number;
  usedModes: number;
  usedEnrichments: number;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

/** GET /billing/subscription (03-spec §2.10) */
export interface SubscriptionOverview {
  subscription: UserSubscription | null;
  plan: SubscriptionPlan | null;
  usage: {
    syntheses: number;
    regenerations: number;
    modes: number;
    enrichments: number;
  };
  quotas: {
    syntheses: number;
    regenerations: number;
    modes: number;
    enrichments: number;
  };
}

/* ── DTO эндпоинтов §2.10 (беседа 6.1; потребитель — client/api/billing.ts 6.2) ── */

/** POST /billing/api-key → */
export interface StoredApiKey {
  keyId: string;
  prefix: string;
}

/** POST /billing/topup → (Stripe PaymentIntent для Stripe Elements) */
export interface TopupIntent {
  clientSecret: string;
  paymentIntentId: string;
  amountUsd: number;
}

/** POST /billing/topup/confirm → */
export interface TopupResult {
  balanceUsd: number;
  transaction: Transaction;
}

/** GET /billing/usage → */
export interface UsageHistory {
  entries: ApiUsage[];
  /** Сводка; costUsd БЕЗ строк 'byo' (02 §2.21 — там себестоимость чужого ключа) */
  totals: UsageTotals;
  /** Итоги по режимам биллинга */
  byMode: Record<BillingMode, UsageTotals>;
}

/** GET /billing/transactions → */
export interface TransactionHistory {
  items: Transaction[];
  total: number;
  page: number;
  limit: number;
}

/** POST /billing/subscribe → */
export interface SubscribeResult {
  clientSecret: string;
  subscriptionId: string;
  subscription: UserSubscription;
}

/** Квоты подписки — колонки used_… и quota_… (02 §2.22–2.23) */
export type QuotaType = "syntheses" | "regenerations" | "modes" | "enrichments";
