/**
 * Subscription Service — подписки Stripe и квоты (беседа 6.1;
 * 01-architecture §6 п.2, 02-data-model §2.22–2.23, 03-specification
 * §1.11 B6/B8, §2.10). Полностью новый код.
 *
 *  - getPlans(): активные тарифы;
 *  - getActiveSubscription(userId): подписка + план + использование/квоты
 *    (форма GET /billing/subscription §2.10);
 *  - createSubscription(userId, planId): Stripe Customer → Subscription
 *    (default_incomplete) → строка user_subscriptions → { clientSecret,
 *    subscriptionId };
 *  - cancelSubscription / resumeSubscription: cancel_at_period_end;
 *  - checkQuota / incrementUsage / consumeQuota (атомарная проверка +
 *    инкремент одним UPDATE … WHERE used + n <= quota — гонка двух
 *    операций не пробивает квоту);
 *  - resetUsageCounters: новый период (invoice.paid);
 *  - handleStripeWebhook: диспетчер трёх событий §2.10.
 *
 * Решения 6.1:
 *  - «активная для биллинга» = status ∈ {active, trialing} и
 *    current_period_end > now; cancel_at_period_end=true работает до конца
 *    периода (протокол: «до конца периода работает — после canceled»);
 *  - квота потребляется ОДИН раз на операцию при взятии generation-слота
 *    (synthesis → syntheses, регенерация/добавление/подраздел →
 *    regenerations, режим → modes, обогащение → enrichments; план —
 *    по числу подтверждённых шагов регенерации), а не на каждый вызов
 *    Claude: иначе синтез из восьми разделов стоил бы восемь синтезов;
 *  - 7.1: Stripe Customer ОДИН на пользователя — `ensureStripeCustomer`
 *    читает/заполняет users.stripe_customer_id (миграция 0003) и
 *    переиспользуется подпиской и пополнением (billing-service); до 7.1
 *    Customer создавался на каждую подписку.
 */
import { and, desc, eq, gt, inArray, sql as dsql } from "drizzle-orm";
import type {
  QuotaType,
  SubscribeResult,
  SubscriptionOverview,
  SubscriptionPlan,
  SubscriptionStatus,
  UserSubscription,
} from "@philosynth/shared/types/billing";

import { db, schema } from "../db/index.js";
import {
  stripe,
  type StripeEvent,
  type StripeInvoice,
  type StripeSubscription,
} from "./stripe-client.js";

const { subscriptionPlans, userSubscriptions, users } = schema;

export type { QuotaType };

export const QUOTA_TYPES: readonly QuotaType[] = [
  "syntheses",
  "regenerations",
  "modes",
  "enrichments",
];

export class SubscriptionError extends Error {
  code: "NOT_FOUND" | "VALIDATION_ERROR" | "QUOTA_EXCEEDED";
  details?: unknown;
  constructor(
    code: SubscriptionError["code"],
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "SubscriptionError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

type PlanRow = typeof subscriptionPlans.$inferSelect;
type SubRow = typeof userSubscriptions.$inferSelect;

/* ── DTO ─────────────────────────────────────────────────────────────── */

export function toPlanDto(p: PlanRow): SubscriptionPlan {
  return {
    id: p.id,
    name: p.name,
    displayName: p.displayName,
    priceUsd: Number(p.priceUsd),
    billingPeriod: p.billingPeriod,
    quotaSyntheses: p.quotaSyntheses,
    quotaRegenerations: p.quotaRegenerations,
    quotaModes: p.quotaModes,
    quotaEnrichments: p.quotaEnrichments,
    stripePriceId: p.stripePriceId,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  };
}

export function toSubscriptionDto(s: SubRow): UserSubscription {
  return {
    id: s.id,
    userId: s.userId,
    planId: s.planId,
    stripeSubscriptionId: s.stripeSubscriptionId,
    status: s.status,
    currentPeriodStart: s.currentPeriodStart.toISOString(),
    currentPeriodEnd: s.currentPeriodEnd.toISOString(),
    usedSyntheses: s.usedSyntheses,
    usedRegenerations: s.usedRegenerations,
    usedModes: s.usedModes,
    usedEnrichments: s.usedEnrichments,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/* ── Колонки квот ────────────────────────────────────────────────────── */

const USED_COL = {
  syntheses: userSubscriptions.usedSyntheses,
  regenerations: userSubscriptions.usedRegenerations,
  modes: userSubscriptions.usedModes,
  enrichments: userSubscriptions.usedEnrichments,
} as const;

/** Имя поля Drizzle-строки для .set() */
const USED_FIELD = {
  syntheses: "usedSyntheses",
  regenerations: "usedRegenerations",
  modes: "usedModes",
  enrichments: "usedEnrichments",
} as const;

const QUOTA_COL = {
  syntheses: subscriptionPlans.quotaSyntheses,
  regenerations: subscriptionPlans.quotaRegenerations,
  modes: subscriptionPlans.quotaModes,
  enrichments: subscriptionPlans.quotaEnrichments,
} as const;

function usedOf(s: SubRow, q: QuotaType): number {
  switch (q) {
    case "syntheses":
      return s.usedSyntheses;
    case "regenerations":
      return s.usedRegenerations;
    case "modes":
      return s.usedModes;
    case "enrichments":
      return s.usedEnrichments;
  }
}

function quotaOf(p: PlanRow, q: QuotaType): number {
  switch (q) {
    case "syntheses":
      return p.quotaSyntheses;
    case "regenerations":
      return p.quotaRegenerations;
    case "modes":
      return p.quotaModes;
    case "enrichments":
      return p.quotaEnrichments;
  }
}

/* ── Планы ───────────────────────────────────────────────────────────── */

export async function getPlans(): Promise<SubscriptionPlan[]> {
  const rows = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.isActive, true))
    .orderBy(subscriptionPlans.priceUsd);
  return rows.map(toPlanDto);
}

/* ── Подписка пользователя ───────────────────────────────────────────── */

/** Статусы, при которых подписка оплачивает операции. */
const BILLABLE_STATUSES: readonly SubscriptionStatus[] = ["active", "trialing"];

/** Живая (billable) подписка пользователя с планом; null — нет. */
export async function findBillableSubscription(
  userId: string,
  now: Date = new Date(),
): Promise<{ subscription: SubRow; plan: PlanRow } | null> {
  const [row] = await db
    .select({ subscription: userSubscriptions, plan: subscriptionPlans })
    .from(userSubscriptions)
    .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        inArray(userSubscriptions.status, [...BILLABLE_STATUSES]),
        gt(userSubscriptions.currentPeriodEnd, now),
      ),
    )
    .orderBy(desc(userSubscriptions.currentPeriodEnd))
    .limit(1);
  return row ?? null;
}

/** Последняя подписка пользователя любого статуса (для UI/отмены). */
async function findLatestSubscription(
  userId: string,
): Promise<{ subscription: SubRow; plan: PlanRow } | null> {
  const [row] = await db
    .select({ subscription: userSubscriptions, plan: subscriptionPlans })
    .from(userSubscriptions)
    .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
    .where(eq(userSubscriptions.userId, userId))
    .orderBy(desc(userSubscriptions.createdAt))
    .limit(1);
  return row ?? null;
}

/** GET /billing/subscription: показывается billable, иначе последняя
 *  (canceled/incomplete — чтобы UI видел состояние), иначе null. */
export async function getActiveSubscription(
  userId: string,
): Promise<SubscriptionOverview> {
  const found =
    (await findBillableSubscription(userId)) ??
    (await findLatestSubscription(userId));
  if (!found) {
    return {
      subscription: null,
      plan: null,
      usage: { syntheses: 0, regenerations: 0, modes: 0, enrichments: 0 },
      quotas: { syntheses: 0, regenerations: 0, modes: 0, enrichments: 0 },
    };
  }
  const { subscription: s, plan: p } = found;
  return {
    subscription: toSubscriptionDto(s),
    plan: toPlanDto(p),
    usage: {
      syntheses: s.usedSyntheses,
      regenerations: s.usedRegenerations,
      modes: s.usedModes,
      enrichments: s.usedEnrichments,
    },
    quotas: {
      syntheses: p.quotaSyntheses,
      regenerations: p.quotaRegenerations,
      modes: p.quotaModes,
      enrichments: p.quotaEnrichments,
    },
  };
}

/* ── Stripe ↔ строка ─────────────────────────────────────────────────── */

export function mapStripeStatus(s: StripeSubscription["status"]): SubscriptionStatus {
  switch (s) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
    case "paused":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "incomplete":
      return "incomplete";
  }
}

function tsToDate(sec: number | undefined, fallback: Date): Date {
  return typeof sec === "number" && Number.isFinite(sec)
    ? new Date(sec * 1000)
    : fallback;
}

export type CreateSubscriptionResult = SubscribeResult;

/**
 * Stripe Customer пользователя (7.1). Возвращает users.stripe_customer_id,
 * при пустом — создаёт Customer (email + metadata.userId) и записывает id
 * условным UPDATE (… WHERE stripe_customer_id IS NULL): при гонке двух
 * запросов побеждает первый, второй перечитывает колонку (лишний Customer в
 * Stripe остаётся пустым — безвредно). Ошибки Stripe пробрасываются
 * (StripeError STRIPE_UNAVAILABLE при пустом ключе).
 */
export async function ensureStripeCustomer(userId: string): Promise<string> {
  const [u] = await db
    .select({ email: users.email, customerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) throw new SubscriptionError("NOT_FOUND", "Пользователь не найден");
  if (u.customerId) return u.customerId;

  const customer = await stripe.createCustomer({
    email: u.email,
    metadata: { userId },
  });
  const [saved] = await db
    .update(users)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(and(eq(users.id, userId), dsql`${users.stripeCustomerId} IS NULL`))
    .returning({ customerId: users.stripeCustomerId });
  if (saved?.customerId) return saved.customerId;
  // гонка: колонку успел заполнить параллельный запрос
  const [again] = await db
    .select({ customerId: users.stripeCustomerId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return again?.customerId ?? customer.id;
}

/**
 * a. Stripe Customer пользователя (ensureStripeCustomer, 7.1) → Subscription
 *    (default_incomplete, expand latest_invoice.payment_intent);
 * b. строка user_subscriptions со статусом Stripe (обычно 'incomplete' —
 *    до оплаты первого инвойса подписка операций не оплачивает;
 *    invoice.paid / subscription.updated переводят её в 'active').
 */
export async function createSubscription(
  userId: string,
  planId: string,
): Promise<CreateSubscriptionResult> {
  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(and(eq(subscriptionPlans.id, planId), eq(subscriptionPlans.isActive, true)))
    .limit(1);
  if (!plan) throw new SubscriptionError("NOT_FOUND", "Тариф не найден");

  const existing = await findBillableSubscription(userId);
  if (existing) {
    throw new SubscriptionError(
      "VALIDATION_ERROR",
      "У пользователя уже есть активная подписка",
      { planId: existing.plan.name },
    );
  }

  const customerId = await ensureStripeCustomer(userId);
  const sub = await stripe.createSubscription({
    customerId,
    priceId: plan.stripePriceId,
    metadata: { userId, planId: plan.id, planName: plan.name },
  });

  const now = new Date();
  const [row] = await db
    .insert(userSubscriptions)
    .values({
      userId,
      planId: plan.id,
      stripeSubscriptionId: sub.id,
      status: mapStripeStatus(sub.status),
      currentPeriodStart: tsToDate(sub.current_period_start, now),
      currentPeriodEnd: tsToDate(
        sub.current_period_end,
        new Date(now.getTime() + 30 * 24 * 3600 * 1000),
      ),
      cancelAtPeriodEnd: sub.cancel_at_period_end === true,
    })
    .returning();

  const inv = sub.latest_invoice;
  const pi =
    inv && typeof inv === "object" ? inv.payment_intent : null;
  const clientSecret =
    pi && typeof pi === "object" ? pi.client_secret ?? "" : "";

  return {
    clientSecret,
    subscriptionId: sub.id,
    subscription: toSubscriptionDto(row as SubRow),
  };
}

async function setCancelFlag(
  userId: string,
  cancelAtPeriodEnd: boolean,
): Promise<UserSubscription> {
  const found = await findBillableSubscription(userId);
  if (!found) {
    throw new SubscriptionError("NOT_FOUND", "Активной подписки нет");
  }
  const s = found.subscription;
  await stripe.updateSubscription(s.stripeSubscriptionId, {
    cancel_at_period_end: cancelAtPeriodEnd,
  });
  const [row] = await db
    .update(userSubscriptions)
    .set({ cancelAtPeriodEnd, updatedAt: new Date() })
    .where(eq(userSubscriptions.id, s.id))
    .returning();
  return toSubscriptionDto(row as SubRow);
}

/** cancel_at_period_end = true — работает до конца периода. */
export function cancelSubscription(userId: string): Promise<UserSubscription> {
  return setCancelFlag(userId, true);
}

/** cancel_at_period_end = false. */
export function resumeSubscription(userId: string): Promise<UserSubscription> {
  return setCancelFlag(userId, false);
}

/* ── Квоты ───────────────────────────────────────────────────────────── */

export interface QuotaStatus {
  ok: boolean;
  used: number;
  quota: number;
  remaining: number;
}

/** Остаток ≥ units? (без изменения счётчиков). */
export async function checkQuota(
  subscriptionId: string,
  quotaType: QuotaType,
  units = 1,
): Promise<QuotaStatus> {
  const [row] = await db
    .select({ subscription: userSubscriptions, plan: subscriptionPlans })
    .from(userSubscriptions)
    .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
    .where(eq(userSubscriptions.id, subscriptionId))
    .limit(1);
  if (!row) throw new SubscriptionError("NOT_FOUND", "Подписка не найдена");
  const used = usedOf(row.subscription, quotaType);
  const quota = quotaOf(row.plan, quotaType);
  return { ok: used + units <= quota, used, quota, remaining: Math.max(0, quota - used) };
}

/** Атомарный инкремент used_* (без проверки квоты — учёт факта). */
export async function incrementUsage(
  subscriptionId: string,
  quotaType: QuotaType,
  units = 1,
): Promise<void> {
  if (units <= 0) return;
  const col = USED_COL[quotaType];
  await db
    .update(userSubscriptions)
    .set({ [USED_FIELD[quotaType]]: dsql`${col} + ${units}`, updatedAt: new Date() })
    .where(eq(userSubscriptions.id, subscriptionId));
}

/**
 * Проверка + инкремент ОДНИМ запросом: UPDATE … WHERE used + units <=
 * quota (квота — из плана подзапросом). Нет обновлённой строки →
 * квота исчерпана (ok=false, счётчик не тронут).
 */
export async function consumeQuota(
  subscriptionId: string,
  quotaType: QuotaType,
  units = 1,
): Promise<QuotaStatus> {
  if (units <= 0) return checkQuota(subscriptionId, quotaType, 0);
  const col = USED_COL[quotaType];
  const quotaCol = QUOTA_COL[quotaType];
  const updated = await db
    .update(userSubscriptions)
    .set({ [USED_FIELD[quotaType]]: dsql`${col} + ${units}`, updatedAt: new Date() })
    .where(
      and(
        eq(userSubscriptions.id, subscriptionId),
        dsql`${col} + ${units} <= (SELECT ${quotaCol} FROM ${subscriptionPlans} WHERE ${subscriptionPlans.id} = ${userSubscriptions.planId})`,
      ),
    )
    .returning({ id: userSubscriptions.id });
  const status = await checkQuota(subscriptionId, quotaType, 0);
  return { ...status, ok: updated.length > 0 };
}

/** Новый период: счётчики в ноль, границы периода — из аргумента. */
export async function resetUsageCounters(
  subscriptionId: string,
  period?: { start: Date; end: Date },
): Promise<void> {
  await db
    .update(userSubscriptions)
    .set({
      usedSyntheses: 0,
      usedRegenerations: 0,
      usedModes: 0,
      usedEnrichments: 0,
      ...(period
        ? { currentPeriodStart: period.start, currentPeriodEnd: period.end }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(userSubscriptions.id, subscriptionId));
}

/* ── Webhook ─────────────────────────────────────────────────────────── */

export interface WebhookResult {
  handled: boolean;
  action?: string;
  subscriptionId?: string;
}

async function findByStripeId(stripeSubscriptionId: string): Promise<SubRow | null> {
  const [row] = await db
    .select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  return row ?? null;
}

function invoicePeriod(inv: StripeInvoice): { start: Date; end: Date } | null {
  const line = inv.lines?.data?.[0]?.period;
  const start = line?.start ?? inv.period_start;
  const end = line?.end ?? inv.period_end;
  if (typeof start !== "number" || typeof end !== "number") return null;
  return { start: new Date(start * 1000), end: new Date(end * 1000) };
}

/**
 * invoice.paid → новый период: сброс счётчиков + границы периода +
 *   status='active' (первая оплата переводит 'incomplete' → 'active');
 * customer.subscription.updated → status/period/cancel_at_period_end;
 * customer.subscription.deleted → status='canceled'.
 * Неизвестная подписка/тип → handled:false (200 Stripe всё равно нужен).
 */
export async function handleStripeWebhook(event: StripeEvent): Promise<WebhookResult> {
  switch (event.type) {
    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const inv = event.data.object as unknown as StripeInvoice;
      const subId = typeof inv.subscription === "string" ? inv.subscription : null;
      if (!subId) return { handled: false };
      const row = await findByStripeId(subId);
      if (!row) return { handled: false };
      const period = invoicePeriod(inv);
      // Повтор того же периода (ретрай Stripe) счётчики не сбрасывает
      const isNewPeriod =
        !period || period.start.getTime() > row.currentPeriodStart.getTime() ||
        row.status === "incomplete";
      if (isNewPeriod) {
        await resetUsageCounters(row.id, period ?? undefined);
      }
      await db
        .update(userSubscriptions)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(userSubscriptions.id, row.id));
      return { handled: true, action: isNewPeriod ? "period_reset" : "already_current", subscriptionId: row.id };
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as unknown as StripeSubscription;
      const row = await findByStripeId(sub.id);
      if (!row) return { handled: false };
      await db
        .update(userSubscriptions)
        .set({
          status: mapStripeStatus(sub.status),
          currentPeriodStart: tsToDate(sub.current_period_start, row.currentPeriodStart),
          currentPeriodEnd: tsToDate(sub.current_period_end, row.currentPeriodEnd),
          cancelAtPeriodEnd: sub.cancel_at_period_end === true,
          updatedAt: new Date(),
        })
        .where(eq(userSubscriptions.id, row.id));
      return { handled: true, action: "updated", subscriptionId: row.id };
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as unknown as StripeSubscription;
      const row = await findByStripeId(sub.id);
      if (!row) return { handled: false };
      await db
        .update(userSubscriptions)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(eq(userSubscriptions.id, row.id));
      return { handled: true, action: "canceled", subscriptionId: row.id };
    }
    default:
      return { handled: false };
  }
}
