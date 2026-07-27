/**
 * Типы биллинга: использование API, транзакции, подписки.
 * Соответствие: server/db/schema.ts (api_usage, transactions, api_keys,
 * subscription_plans, user_subscriptions), 03-specification §2.10.
 */

export type BillingMode = "byo" | "service";

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
  /** 'starter', 'pro', 'academic' */
  name: string;
  displayName: string;
  priceUsd: number;
  billingPeriod: BillingPeriod;
  quotaSyntheses: number;
  quotaRegenerations: number;
  quotaModes: number;
  quotaEnrichments: number;
  stripePriceId: string;
  isActive: boolean;
  createdAt: string;
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
