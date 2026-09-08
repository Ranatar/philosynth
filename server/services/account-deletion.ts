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
 *
 * 8.1 — заслон последнего администратора: удаляющийся администратор, если
 * он единственный, получает LAST_ADMIN (409 в роуте) с подсказкой «сначала
 * назначьте второго». Проверка — ДВАЖДЫ: до отмены подписки (чтобы отказ не
 * оставлял побочного эффекта в Stripe) и внутри транзакции удаления под
 * pg_advisory_xact_lock(ADMIN_SET_LOCK_KEY) — иначе двое последних
 * администраторов уйдут одновременно.
 *
 * 8.1 — след: строка admin_audit account.deleted (actor = сам пользователь,
 * target user, details { deletedSyntheses, subscriptionCanceled, wasAdmin })
 * пишется той же транзакцией; затем actor_id ВСЕХ строк этого пользователя
 * обнуляется — воспроизводится эффект ON DELETE SET NULL, который FK дал бы
 * при физическом удалении (строка users здесь не удаляется, а
 * анонимизируется, и FK не срабатывает). След действий остаётся: action,
 * target, details — на месте, привязка к личности снята.
 */
import { randomUUID } from "node:crypto";

import { count, eq, inArray, sql } from "drizzle-orm";

import { db, schema } from "../db/index.js";
import { hashPassword } from "../middleware/auth.js";
import { ADMIN_ACTIONS, ADMIN_SET_LOCK_KEY, writeAudit, type DbExecutor } from "./admin-audit.js"; // 8.1
import { hasActiveGenerationForUser } from "./generation-service.js";
import { cancelSubscription, SubscriptionError } from "./subscription-service.js";

const { users, sessions, apiKeys, syntheses, userSubscriptions, adminAudit } = schema;

export class AccountDeletionError extends Error {
  constructor(
    readonly code: "GENERATION_IN_PROGRESS" | "NOT_FOUND" | "LAST_ADMIN",
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

export interface DeleteAccountOptions {
  /** IP запроса для admin_audit (8.1) */
  ip?: string | null | undefined;
}

const LAST_ADMIN_MESSAGE =
  "Вы единственный администратор — сначала назначьте второго (POST /auth/users/:id/role)";

/** 8.1: администратор, единственный в базе, уйти не может. */
async function assertNotLastAdmin(
  exec: DbExecutor,
  role: "user" | "admin",
): Promise<void> {
  if (role !== "admin") return;
  const [adm] = await exec.select({ n: count() }).from(users).where(eq(users.role, "admin"));
  if (Number(adm?.n ?? 0) <= 1) throw new AccountDeletionError("LAST_ADMIN", LAST_ADMIN_MESSAGE);
}

export async function deleteAccount(
  userId: string,
  opts: DeleteAccountOptions = {},
): Promise<DeleteAccountResult> {
  const [u] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) throw new AccountDeletionError("NOT_FOUND", "Пользователь не найден");
  if (hasActiveGenerationForUser(userId)) {
    throw new AccountDeletionError(
      "GENERATION_IN_PROGRESS",
      "Идёт генерация — дождитесь завершения или остановите её перед удалением аккаунта",
    );
  }
  // 8.1: предварительный заслон — до побочного эффекта в Stripe
  await assertNotLastAdmin(db, u.role);

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
    // 8.1: авторитетная проверка под блокировкой множества администраторов
    await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_SET_LOCK_KEY})`);
    const [fresh] = await tx
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1);
    if (!fresh) throw new AccountDeletionError("NOT_FOUND", "Пользователь не найден");
    await assertNotLastAdmin(tx, fresh.role);

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
    // 8.1: след — той же транзакцией; затем привязка актора снимается со
    // ВСЕХ его строк (эффект ON DELETE SET NULL при логическом удалении)
    await writeAudit(tx, {
      actorId: userId,
      action: ADMIN_ACTIONS.ACCOUNT_DELETED,
      targetType: "user",
      targetId: userId,
      details: {
        deletedSyntheses: own.length,
        subscriptionCanceled,
        wasAdmin: fresh.role === "admin",
      },
      ip: opts.ip ?? null,
    });
    await tx.update(adminAudit).set({ actorId: null }).where(eq(adminAudit.actorId, userId));
    return own.length;
  });

  return { ok: true, deletedSyntheses, subscriptionCanceled, anonymizedEmail };
}
