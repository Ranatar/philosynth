/**
 * Удаление аккаунта (беседа 7.1; долг §12 6.1 «процедура удаления
 * аккаунта с финансовой историей»; 03 §2.1 DELETE /auth/me).
 *
 * По 02 §2.20–2.21 `transactions.user_id` и `api_usage.user_id` — RESTRICT:
 * финансовая история обязана пережить пользователя, поэтому строка users
 * НЕ удаляется, а АНОНИМИЗИРУЕТСЯ:
 *  - email → `deleted-<id>@deleted.invalid` (уникален; вход невозможен —
 *    домен .invalid не существует), password_hash → хэш случайного
 *    секрета (bcrypt; никакой пароль не подойдёт), display_name → null,
 *    stripe_customer_id → null (Customer в Stripe остаётся у истории
 *    платежей), role → 'user' (админ теряет права), balance_usd — как есть
 *    (часть финансовой истории; воспользоваться им нельзя);
 *  - удаляются: все сессии, BYO-ключи, синтезы пользователя (CASCADE
 *    уносит разделы/элементы/логи/планы; `api_usage`/`transactions.
 *    synthesis_id` → SET NULL по миграции 0002; `prompt_templates` и
 *    каталоги типов `created_by` → SET NULL по 0003 — но строка users
 *    остаётся, так что FK и не срабатывает);
 *  - подписка: активная — cancel_at_period_end в Stripe (fail-open: сбой
 *    Stripe логируется, удаление не останавливает), строки
 *    user_subscriptions → status 'canceled'.
 *
 * Гейт: активная операция пользователя → GENERATION_IN_PROGRESS (иначе
 * удаление синтеза под стримом уронит слот). Подтверждение паролем — в
 * роуте (единый 401 AUTH_REQUIRED, как у password-change).
 */
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";

import { db, schema } from "../db/index.js";
import { hashPassword } from "../middleware/auth.js";
import { hasActiveGenerationForUser } from "./generation-service.js";
import { cancelSubscription, SubscriptionError } from "./subscription-service.js";

const { users, sessions, apiKeys, syntheses, userSubscriptions } = schema;

export class AccountDeletionError extends Error {
  constructor(
    readonly code: "GENERATION_IN_PROGRESS" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "AccountDeletionError";
  }
}

export interface DeleteAccountResult {
  ok: true;
  /** Удалено синтезов (с потомками по CASCADE) */
  deletedSyntheses: number;
  /** Подписка была активна и отменена (cancel_at_period_end) */
  subscriptionCanceled: boolean;
  /** Анонимизированный email (для журнала/теста) */
  anonymizedEmail: string;
}

export function anonymizedEmailFor(userId: string): string {
  return `deleted-${userId}@deleted.invalid`;
}

export async function deleteAccount(userId: string): Promise<DeleteAccountResult> {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new AccountDeletionError("NOT_FOUND", "Пользователь не найден");
  if (hasActiveGenerationForUser(userId)) {
    throw new AccountDeletionError(
      "GENERATION_IN_PROGRESS",
      "Идёт генерация — дождитесь завершения или остановите её перед удалением аккаунта",
    );
  }

  // Подписка — до транзакции (сетевой вызов Stripe), fail-open
  let subscriptionCanceled = false;
  try {
    await cancelSubscription(userId);
    subscriptionCanceled = true;
  } catch (err) {
    if (!(err instanceof SubscriptionError && err.code === "NOT_FOUND")) {
      console.warn("[account-deletion] отмена подписки в Stripe не удалась:", err);
    }
  }

  const passwordHash = await hashPassword(randomUUID() + randomUUID());
  const anonymizedEmail = anonymizedEmailFor(userId);

  const deletedSyntheses = await db.transaction(async (tx) => {
    const own = await tx
      .select({ id: syntheses.id })
      .from(syntheses)
      .where(eq(syntheses.userId, userId));
    if (own.length > 0) {
      await tx.delete(syntheses).where(inArray(syntheses.id, own.map((r) => r.id)));
    }
    await tx.delete(apiKeys).where(eq(apiKeys.userId, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx
      .update(userSubscriptions)
      .set({ status: "canceled", cancelAtPeriodEnd: true, updatedAt: new Date() })
      .where(eq(userSubscriptions.userId, userId));
    await tx
      .update(users)
      .set({
        email: anonymizedEmail,
        passwordHash,
        displayName: null,
        stripeCustomerId: null,
        role: "user",
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    return own.length;
  });

  return { ok: true, deletedSyntheses, subscriptionCanceled, anonymizedEmail };
}
