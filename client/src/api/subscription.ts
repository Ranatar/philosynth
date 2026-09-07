/**
 * API-функции подписок. Беседа 6.2 (запрос 1, п. 5b).
 *
 * Контракт: 03-specification §2.10 и server/routes/billing.ts +
 * subscription-service (6.1):
 *  - getSubscription → GET  /billing/subscription → SubscriptionOverview
 *      (billable-подписка, иначе последняя любого статуса — чтобы UI видел
 *      canceled/incomplete, — иначе subscription/plan = null и нули)
 *  - getPlans        → GET  /billing/plans → { plans: SubscriptionPlan[] }
 *  - subscribe       → POST /billing/subscribe { planId } → 201 SubscribeResult
 *      (Stripe Customer + Subscription default_incomplete; clientSecret —
 *      PaymentIntent ПЕРВОГО инвойса для Stripe Elements; статус строки
 *      'incomplete' до invoice.paid по webhook; Stripe не настроен → 503)
 *  - cancelSubscription → POST /billing/subscription/cancel → { subscription }
 *      (cancel_at_period_end = true — работает до конца периода)
 *  - resumeSubscription → POST /billing/subscription/resume → { subscription }
 *
 * Отдельного «confirm» у подписки нет (в отличие от пополнения): после
 * оплаты в Elements клиент перечитывает GET /billing/subscription.
 */

import type {
  SubscribeResult,
  SubscriptionOverview,
  SubscriptionPlan,
  UserSubscription,
} from "@philosynth/shared/types/billing";

import { apiGet, apiPost } from "./client";

export function getSubscription(): Promise<SubscriptionOverview> {
  return apiGet<SubscriptionOverview>("/billing/subscription");
}

export function getPlans(): Promise<SubscriptionPlan[]> {
  return apiGet<{ plans: SubscriptionPlan[] }>("/billing/plans").then((r) => r.plans);
}

export function subscribe(planId: string): Promise<SubscribeResult> {
  return apiPost<SubscribeResult>("/billing/subscribe", { planId });
}

export function cancelSubscription(): Promise<UserSubscription> {
  return apiPost<{ subscription: UserSubscription }>(
    "/billing/subscription/cancel",
  ).then((r) => r.subscription);
}

export function resumeSubscription(): Promise<UserSubscription> {
  return apiPost<{ subscription: UserSubscription }>(
    "/billing/subscription/resume",
  ).then((r) => r.subscription);
}
