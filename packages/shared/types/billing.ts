// ─── Enums ──────────────────────────────────────────────────────────────────

export type BillingMode = "byo" | "service";

export type TransactionType = "topup" | "usage" | "refund";

// ─── Row types ─────────────────────────────────────────────────────────────

/** API-ключ (matches schema.ts api_keys, без encryptedKey) */
export interface ApiKeyInfo {
  id: string;
  userId: string;
  /** Первые 14 символов: 'sk-ant-api03-...' */
  keyPrefix: string;
  isActive: boolean;
  createdAt: Date;
}

/** Транзакция (matches schema.ts transactions) */
export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  /** numeric(10,6) */
  amountUsd: string;
  /** numeric(10,4) */
  balanceAfter: string;
  synthesisId: string | null;
  sectionKey: string | null;
  stripeId: string | null;
  createdAt: Date;
}

/** API usage (matches schema.ts api_usage) */
export interface ApiUsage {
  id: string;
  userId: string;
  synthesisId: string | null;
  sectionKey: string | null;
  billingMode: BillingMode;
  inputTokens: number;
  outputTokens: number;
  /** numeric(10,6) */
  costUsd: string;
  createdAt: Date;
}

// ─── Input types ───────────────────────────────────────────────────────────

/** Добавление API-ключа (POST /api/billing/keys) */
export interface ApiKeyCreateInput {
  /** Полный ключ Anthropic (будет зашифрован) */
  key: string;
}

/** Пополнение баланса (POST /api/billing/topup) */
export interface TopupInput {
  /** Сумма в USD */
  amountUsd: number;
  /** Stripe Payment Intent ID */
  stripePaymentIntentId: string;
}

// ─── Projections ───────────────────────────────────────────────────────────

/** Сводка биллинга пользователя */
export interface BillingSummary {
  balanceUsd: string;
  totalSpentUsd: string;
  activeKeyCount: number;
  recentTransactions: Transaction[];
}

/** Агрегированная статистика использования */
export interface UsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: string;
  bySection: Array<{
    sectionKey: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: string;
  }>;
}
