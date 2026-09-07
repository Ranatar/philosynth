/**
 * Billing Service (беседа 6.1; 01-architecture §6, 02-data-model §2.20–2.21,
 * 03-specification §1.11, §2.10, §4.3). Полностью новый код.
 *
 * Части:
 *  1. Баланс и пополнения: getBalance, createTopup (Stripe PaymentIntent →
 *     clientSecret), confirmTopup (проверка статуса в Stripe → balance_usd
 *     += сумма → transactions 'topup'; идемпотентно по stripe_id);
 *  2. Списание: chargeUsage(userId, synthesisId, sectionKey, in, out) —
 *     себестоимость = PRICE_IN·in + PRICE_OUT·out (константы оценщика 1.1,
 *     та же формула, что в syntheses.total_cost_usd), к списанию —
 *     себестоимость × BILLING_MARKUP (01 §6 «по себестоимости API +
 *     наценка»); balance_usd -= сумма; transactions 'usage' + api_usage
 *     'balance'. Списание после факта: токены уже потрачены, поэтому
 *     баланс МОЖЕТ уйти в минус — гейт достаточности стоит ДО операции
 *     (resolveBilling), не здесь;
 *  3. История: getUsageHistory(userId, {from, to, synthesisId}) с итогами
 *     (для 'byo' cost_usd — себестоимость, в totals.costUsd НЕ входит —
 *     02 §2.21), getTransactionHistory(userId, {page, limit});
 *  4. resolveBilling(userId, {quota, units, estimatedCostUsd}) — приоритет
 *     01 §6: BYO-Key → подписка с квотой → баланс ≥ порог → ошибка.
 *     Единая точка для middleware/billing-check (HTTP-предпроверка, квоту
 *     не трогает) и withGenerationSlot (генерация-service; consume=true —
 *     потребляет квоту атомарно). BillingError.code — коды §4.3:
 *     QUOTA_EXCEEDED (details.quotaType), INSUFFICIENT_BALANCE,
 *     BILLING_REQUIRED, API_KEY_MISSING (серверный ключ пуст при режимах
 *     subscription/balance).
 *     env.billing.enforce=false → вместо ошибки режим 'balance' на
 *     серверном ключе (см. env.ts).
 *  5. recordStreamUsage — разъём streaming-manager (setStreamUsageRecorder):
 *     строка api_usage на каждый вызов Claude независимо от режима;
 *     'balance' → chargeUsage. Регистрируется побочным эффектом импорта
 *     модуля (образец: setModeRegenerator 4.1).
 */
import { and, desc, eq, gte, lte, sql as dsql } from "drizzle-orm";
import type {
  ApiUsage,
  BillingMode,
  TopupIntent,
  TopupResult,
  Transaction,
  TransactionHistory,
  UsageHistory,
  UsageTotals,
} from "@philosynth/shared/types/billing";

import { db, schema } from "../db/index.js";
import { env } from "../env.js";
import { getDecryptedKey } from "./api-key-service.js";
import { PRICE_IN, PRICE_OUT } from "./cost-estimator.js";
import {
  setStreamUsageRecorder,
  type StreamBillingContext,
  type StreamUsage,
} from "./streaming-manager.js";
import { stripe, StripeError } from "./stripe-client.js";
import {
  checkQuota,
  consumeQuota,
  ensureStripeCustomer,
  findBillableSubscription,
  type QuotaType,
} from "./subscription-service.js";

const { users, transactions, apiUsage } = schema;

/* ── Ошибка биллинга (коды §4.3) ─────────────────────────────────────── */

export type BillingErrorCode =
  | "QUOTA_EXCEEDED"
  | "INSUFFICIENT_BALANCE"
  | "BILLING_REQUIRED"
  | "API_KEY_MISSING"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "STRIPE_UNAVAILABLE";

export class BillingError extends Error {
  code: BillingErrorCode;
  details?: unknown;
  constructor(code: BillingErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "BillingError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/** HTTP-статус для кода биллинга (роуты и middleware). */
export function billingErrorStatus(code: BillingErrorCode): 400 | 402 | 403 | 404 | 503 {
  switch (code) {
    case "QUOTA_EXCEEDED":
    case "INSUFFICIENT_BALANCE":
    case "BILLING_REQUIRED":
    case "API_KEY_MISSING":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "STRIPE_UNAVAILABLE":
      return 503;
    case "VALIDATION_ERROR":
      return 400;
  }
}

/* ── Стоимость ───────────────────────────────────────────────────────── */

/** Себестоимость вызова по ставкам оценщика (та же формула, что bumpTotals). */
export function computeCostUsd(inputTokens: number, outputTokens: number): number {
  return inputTokens * PRICE_IN + outputTokens * PRICE_OUT;
}

/** К списанию с баланса: себестоимость × наценка. */
export function computeChargeUsd(costUsd: number): number {
  return costUsd * env.stripe.billingMarkup;
}

/** Округление денег для numeric(…,6). */
const money6 = (n: number): string => n.toFixed(6);
/** balance_usd — numeric(10,4). */
const money4 = (n: number): string => n.toFixed(4);

/* ── Баланс и пополнения ─────────────────────────────────────────────── */

export async function getBalance(userId: string): Promise<number> {
  const [row] = await db
    .select({ balanceUsd: users.balanceUsd })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw new BillingError("NOT_FOUND", "Пользователь не найден");
  return Number(row.balanceUsd);
}

export const TOPUP_MIN_USD = 1;
export const TOPUP_MAX_USD = 1000;

export type { TopupIntent, TopupResult, UsageHistory, TransactionHistory };

/** a. Stripe PaymentIntent (центы, metadata.userId); b. clientSecret. */
export async function createTopup(
  userId: string,
  amountUsd: number,
): Promise<TopupIntent> {
  if (
    typeof amountUsd !== "number" ||
    !Number.isFinite(amountUsd) ||
    amountUsd < TOPUP_MIN_USD ||
    amountUsd > TOPUP_MAX_USD
  ) {
    throw new BillingError("VALIDATION_ERROR", "Неверная сумма пополнения", {
      amountUsd: `от ${TOPUP_MIN_USD} до ${TOPUP_MAX_USD} USD`,
    });
  }
  const amountCents = Math.round(amountUsd * 100);
  let pi;
  try {
    // 7.1: PaymentIntent под Customer пользователя (users.stripe_customer_id)
    const customerId = await ensureStripeCustomer(userId);
    pi = await stripe.createPaymentIntent({
      amountCents,
      customerId,
      metadata: { userId, purpose: "topup" },
    });
  } catch (err) {
    if (err instanceof StripeError && err.code === "STRIPE_UNAVAILABLE") {
      throw new BillingError("STRIPE_UNAVAILABLE", err.message);
    }
    throw err;
  }
  return {
    clientSecret: pi.client_secret ?? "",
    paymentIntentId: pi.id,
    amountUsd: amountCents / 100,
  };
}

/**
 * a. статус PaymentIntent в Stripe (succeeded, metadata.userId — наш);
 * b. balance_usd += amount; c. transactions 'topup' (stripe_id = PI id).
 * Идемпотентно: повторный confirm того же PI возвращает прежнюю
 * транзакцию без второго начисления.
 */
export async function confirmTopup(
  userId: string,
  paymentIntentId: string,
): Promise<TopupResult> {
  if (typeof paymentIntentId !== "string" || !paymentIntentId.trim()) {
    throw new BillingError("VALIDATION_ERROR", "paymentIntentId не задан", {
      paymentIntentId: "обязательное поле",
    });
  }
  const [existing] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.type, "topup"),
        eq(transactions.stripeId, paymentIntentId),
      ),
    )
    .limit(1);
  if (existing) {
    return { balanceUsd: await getBalance(userId), transaction: toTransactionDto(existing) };
  }

  let pi;
  try {
    pi = await stripe.retrievePaymentIntent(paymentIntentId);
  } catch (err) {
    if (err instanceof StripeError && err.code === "STRIPE_UNAVAILABLE") {
      throw new BillingError("STRIPE_UNAVAILABLE", err.message);
    }
    if (err instanceof StripeError && err.status === 404) {
      throw new BillingError("NOT_FOUND", "Платёж не найден");
    }
    throw err;
  }
  if (pi.metadata?.userId && pi.metadata.userId !== userId) {
    throw new BillingError("NOT_FOUND", "Платёж не найден");
  }
  if (pi.status !== "succeeded") {
    throw new BillingError("VALIDATION_ERROR", "Платёж ещё не завершён", {
      status: pi.status,
    });
  }
  const amountUsd = pi.amount / 100;

  const tx = await db.transaction(async (t) => {
    const [u] = await t
      .update(users)
      .set({
        balanceUsd: dsql`${users.balanceUsd} + ${money4(amountUsd)}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ balanceUsd: users.balanceUsd });
    if (!u) throw new BillingError("NOT_FOUND", "Пользователь не найден");
    const [row] = await t
      .insert(transactions)
      .values({
        userId,
        type: "topup",
        amountUsd: money6(amountUsd),
        balanceAfter: money4(Number(u.balanceUsd)),
        stripeId: pi.id,
      })
      .returning();
    return row as typeof transactions.$inferSelect;
  });
  return { balanceUsd: Number(tx.balanceAfter), transaction: toTransactionDto(tx) };
}

/* ── Списание за использование ───────────────────────────────────────── */

export interface ChargeResult {
  costUsd: number;
  chargedUsd: number;
  balanceAfter: number;
  transaction: Transaction;
  usage: ApiUsage;
}

/**
 * a. стоимость; b. (проверка достаточности — ДО операции, resolveBilling);
 * c. balance_usd -= charge; d. transactions 'usage' + api_usage 'balance'.
 */
export async function chargeUsage(
  userId: string,
  synthesisId: string | null,
  sectionKey: string | null,
  inputTokens: number,
  outputTokens: number,
): Promise<ChargeResult> {
  const costUsd = computeCostUsd(inputTokens, outputTokens);
  const chargedUsd = computeChargeUsd(costUsd);
  return db.transaction(async (t) => {
    const [u] = await t
      .update(users)
      .set({
        balanceUsd: dsql`${users.balanceUsd} - ${money4(chargedUsd)}::numeric`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ balanceUsd: users.balanceUsd });
    if (!u) throw new BillingError("NOT_FOUND", "Пользователь не найден");
    const balanceAfter = Number(u.balanceUsd);
    const [trx] = await t
      .insert(transactions)
      .values({
        userId,
        type: "usage",
        amountUsd: money6(-chargedUsd),
        balanceAfter: money4(balanceAfter),
        synthesisId,
        sectionKey,
      })
      .returning();
    const [use] = await t
      .insert(apiUsage)
      .values({
        userId,
        synthesisId,
        sectionKey,
        billingMode: "balance",
        inputTokens,
        outputTokens,
        costUsd: money6(costUsd),
      })
      .returning();
    return {
      costUsd,
      chargedUsd,
      balanceAfter,
      transaction: toTransactionDto(trx as typeof transactions.$inferSelect),
      usage: toUsageDto(use as typeof apiUsage.$inferSelect),
    };
  });
}

/** Строка api_usage без списания (byo / subscription). */
export async function recordApiUsage(
  userId: string,
  synthesisId: string | null,
  sectionKey: string | null,
  billingMode: BillingMode,
  inputTokens: number,
  outputTokens: number,
): Promise<ApiUsage> {
  const costUsd = computeCostUsd(inputTokens, outputTokens);
  const [use] = await db
    .insert(apiUsage)
    .values({
      userId,
      synthesisId,
      sectionKey,
      billingMode,
      inputTokens,
      outputTokens,
      costUsd: money6(costUsd),
    })
    .returning();
  return toUsageDto(use as typeof apiUsage.$inferSelect);
}

/* ── История ─────────────────────────────────────────────────────────── */

export interface UsageFilters {
  from?: Date | undefined;
  to?: Date | undefined;
  synthesisId?: string | undefined;
}

const emptyTotals = (): UsageTotals => ({
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  requests: 0,
});

export async function getUsageHistory(
  userId: string,
  filters: UsageFilters = {},
): Promise<UsageHistory> {
  const conds = [eq(apiUsage.userId, userId)];
  if (filters.from) conds.push(gte(apiUsage.createdAt, filters.from));
  if (filters.to) conds.push(lte(apiUsage.createdAt, filters.to));
  if (filters.synthesisId) conds.push(eq(apiUsage.synthesisId, filters.synthesisId));
  const rows = await db
    .select()
    .from(apiUsage)
    .where(and(...conds))
    .orderBy(desc(apiUsage.createdAt));
  const entries = rows.map(toUsageDto);
  const byMode: Record<BillingMode, UsageTotals> = {
    byo: emptyTotals(),
    subscription: emptyTotals(),
    balance: emptyTotals(),
  };
  const totals = emptyTotals();
  for (const e of entries) {
    const m = byMode[e.billingMode];
    m.inputTokens += e.inputTokens;
    m.outputTokens += e.outputTokens;
    m.costUsd += e.costUsd;
    m.requests += 1;
    totals.inputTokens += e.inputTokens;
    totals.outputTokens += e.outputTokens;
    totals.requests += 1;
    // 02 §2.21: byo — себестоимость чужого ключа, в общий итог не входит
    if (e.billingMode !== "byo") totals.costUsd += e.costUsd;
  }
  return { entries, totals, byMode };
}

export interface Pagination {
  page?: number | undefined;
  limit?: number | undefined;
}

export async function getTransactionHistory(
  userId: string,
  pagination: Pagination = {},
): Promise<TransactionHistory> {
  const page = Math.max(1, Math.floor(pagination.page ?? 1));
  const limit = Math.min(200, Math.max(1, Math.floor(pagination.limit ?? 50)));
  const [countRow] = await db
    .select({ n: dsql<number>`count(*)::int` })
    .from(transactions)
    .where(eq(transactions.userId, userId));
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);
  return {
    items: rows.map(toTransactionDto),
    total: Number(countRow?.n ?? 0),
    page,
    limit,
  };
}

/* ── DTO ─────────────────────────────────────────────────────────────── */

export function toTransactionDto(r: typeof transactions.$inferSelect): Transaction {
  return {
    id: r.id,
    userId: r.userId,
    type: r.type,
    amountUsd: Number(r.amountUsd),
    balanceAfter: Number(r.balanceAfter),
    synthesisId: r.synthesisId,
    sectionKey: r.sectionKey,
    stripeId: r.stripeId,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toUsageDto(r: typeof apiUsage.$inferSelect): ApiUsage {
  return {
    id: r.id,
    userId: r.userId,
    synthesisId: r.synthesisId,
    sectionKey: r.sectionKey,
    billingMode: r.billingMode,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: Number(r.costUsd),
    createdAt: r.createdAt.toISOString(),
  };
}

/* ── Определение режима биллинга (приоритет 01 §6) ───────────────────── */

/** Решение биллинга операции — кладётся в контекст запроса (middleware)
 *  и в GenerationSlotHandle.billing (сервисы). */
export interface BillingDecision {
  billingMode: BillingMode;
  /** Ключ Anthropic для запроса: BYO — пользователя, иначе серверный */
  apiKey: string;
  subscriptionId?: string | undefined;
  /** false — env.billing.enforce выключен и источника оплаты не было:
   *  режим 'balance' в долг */
  enforced: boolean;
  /** Какая квота потреблена (consume=true) — для отката при сбое старта */
  quotaConsumed?: { subscriptionId: string; quotaType: QuotaType; units: number } | undefined;
}

export interface ResolveBillingOptions {
  /** Квота подписки, нужная операции; null/undefined — операция без
   *  квоты (возобновление, продолжение после паузы) */
  quota?: QuotaType | null | undefined;
  /** Единиц квоты (план — число шагов регенерации) */
  units?: number | undefined;
  /** Порог баланса для режима 'balance'; дефолт env.billing.minReserveUsd */
  estimatedCostUsd?: number | undefined;
  /** true — потребить квоту атомарно (слот); false — только проверить
   *  (middleware) */
  consume?: boolean | undefined;
}

/** Серверный ключ для режимов subscription/balance. */
function serverApiKeyOrThrow(): string {
  if (!env.anthropic.apiKey) {
    throw new BillingError("API_KEY_MISSING", "API-ключ Anthropic не задан на сервере");
  }
  return env.anthropic.apiKey;
}

export async function resolveBilling(
  userId: string,
  opts: ResolveBillingOptions = {},
): Promise<BillingDecision> {
  const units = Math.max(0, Math.floor(opts.units ?? 1));
  const consume = opts.consume === true;

  // 1. BYO-Key — стоимость для сервиса нулевая, квоты и баланс не трогаем
  const byo = await getDecryptedKey(userId);
  if (byo) {
    return { billingMode: "byo", apiKey: byo, enforced: true };
  }

  // 2. Активная подписка с остатком квоты
  let quotaExceeded: { quotaType: QuotaType; used: number; quota: number } | null = null;
  const sub = await findBillableSubscription(userId);
  if (sub) {
    const subscriptionId = sub.subscription.id;
    if (!opts.quota || units === 0) {
      return {
        billingMode: "subscription",
        apiKey: serverApiKeyOrThrow(),
        subscriptionId,
        enforced: true,
      };
    }
    const q = consume
      ? await consumeQuota(subscriptionId, opts.quota, units)
      : await checkQuota(subscriptionId, opts.quota, units);
    if (q.ok) {
      return {
        billingMode: "subscription",
        apiKey: serverApiKeyOrThrow(),
        subscriptionId,
        enforced: true,
        ...(consume
          ? { quotaConsumed: { subscriptionId, quotaType: opts.quota, units } }
          : {}),
      };
    }
    quotaExceeded = { quotaType: opts.quota, used: q.used, quota: q.quota };
  }

  // 3. Баланс ≥ порог
  const balance = await getBalance(userId);
  const threshold = opts.estimatedCostUsd ?? env.billing.minReserveUsd;
  if (balance > 0 && balance >= threshold) {
    return { billingMode: "balance", apiKey: serverApiKeyOrThrow(), enforced: true };
  }

  // 4. Отказ (или долг при выключенном принуждении)
  if (!env.billing.enforce) {
    return { billingMode: "balance", apiKey: serverApiKeyOrThrow(), enforced: false };
  }
  if (quotaExceeded) {
    throw new BillingError(
      "QUOTA_EXCEEDED",
      `Квота подписки «${quotaExceeded.quotaType}» исчерпана (${quotaExceeded.used}/${quotaExceeded.quota}), баланса недостаточно`,
      quotaExceeded,
    );
  }
  if (balance > 0) {
    throw new BillingError(
      "INSUFFICIENT_BALANCE",
      `Недостаточно средств: баланс $${balance.toFixed(4)}, требуется не менее $${threshold.toFixed(4)}`,
      { balanceUsd: balance, requiredUsd: threshold },
    );
  }
  throw new BillingError(
    "BILLING_REQUIRED",
    "Нет источника оплаты: добавьте API-ключ Anthropic, оформите подписку или пополните баланс",
  );
}

/* ── Разъём streaming-manager: учёт каждого вызова Claude ────────────── */

/**
 * После usage от Claude (и при max-tokens, когда токены потрачены):
 *  'balance' → chargeUsage (списание + api_usage 'balance');
 *  'subscription' → api_usage (квота потреблена при взятии слота);
 *  'byo' → api_usage с себестоимостью, списания нет.
 * Ошибка учёта не роняет стрим — только лог (образец recordUsage 5.3).
 */
export async function recordStreamUsage(
  ctx: StreamBillingContext,
  usage: StreamUsage,
): Promise<void> {
  if (usage.inputTokens === 0 && usage.outputTokens === 0) return;
  const synthesisId = ctx.synthesisId ?? null;
  const sectionKey = ctx.sectionKey ?? null;
  if (ctx.billingMode === "balance") {
    await chargeUsage(ctx.userId, synthesisId, sectionKey, usage.inputTokens, usage.outputTokens);
    return;
  }
  await recordApiUsage(
    ctx.userId,
    synthesisId,
    sectionKey,
    ctx.billingMode,
    usage.inputTokens,
    usage.outputTokens,
  );
}

setStreamUsageRecorder(async (ctx, usage) => {
  try {
    await recordStreamUsage(ctx, usage);
  } catch (err) {
    console.error("[billing] учёт usage не записан:", err);
  }
});
