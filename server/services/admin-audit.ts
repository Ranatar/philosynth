/**
 * Журнал административных действий (беседа 8.1, запрос 1, п. 4;
 * 02 §2.29 admin_audit, миграция 0004).
 *
 * Принцип: writeAudit принимает db ИЛИ транзакцию и пишет строку ТОЙ ЖЕ
 * транзакцией, что и само действие — журнал, который может разойтись с
 * делом, хуже отсутствующего. Поэтому сервисы-точки записи (prompt-registry,
 * element-taxonomy, смена роли в routes/auth, account-deletion) вызывают
 * writeAudit ВНУТРИ db.transaction, а не после него.
 *
 * Список действий — замороженная константа ADMIN_ACTIONS: action — не
 * свободная строка, TypeScript не пропустит опечатку. Колонка admin_audit.
 * action без SQL-enum намеренно: пополнение списка не требует миграции.
 *
 * Роли остаются две (user/admin), матрицы прав нет — журнал фиксирует не
 * «кто что мог», а «кто что сделал» с глобальным последствием: активация
 * версии шаблона меняет генерацию у всех, смена роли меняет круг тех, кто
 * может это сделать.
 *
 * Чтение — listAudit(limit): последние строки, новые первыми (вкладка
 * «Доступ» AdminPromptsPage, GET /auth/audit).
 */
import { getConnInfo } from "@hono/node-server/conninfo";
import { desc, eq } from "drizzle-orm";
import type { Context } from "hono";
import type {
  AdminAction,
  AdminAuditEntry,
  AdminAuditTargetType,
} from "@philosynth/shared/types/admin";

import { db, schema } from "../db/index.js";

const { adminAudit, users } = schema;

/** db либо транзакция drizzle — writeAudit исполняется тем, что дали. */
export type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Замороженный перечень действий (03 §2.1 GET /auth/audit). */
export const ADMIN_ACTIONS = Object.freeze({
  PROMPT_VERSION_CREATED: "prompt.version.created",
  PROMPT_VERSION_ACTIVATED: "prompt.version.activated",
  CONFIG_VERSION_CREATED: "config.version.created",
  CONFIG_VERSION_ACTIVATED: "config.version.activated",
  TAXONOMY_TYPE_UPDATED: "taxonomy.type.updated",
  TAXONOMY_TYPE_DELETED: "taxonomy.type.deleted",
  USER_ROLE_CHANGED: "user.role.changed",
  USER_BOOTSTRAPPED: "user.bootstrapped",
  ACCOUNT_DELETED: "account.deleted",
  /** 8.3: строка subscription_plans создана/обновлена посевом seed-plans
   *  (actor_id NULL — действие скрипта, не пользователя; skip строки не даёт) */
  PLAN_SEEDED: "plan.seeded",
} as const satisfies Record<string, AdminAction>);

/** Все значения ADMIN_ACTIONS — для проверок и фильтров. */
export const ADMIN_ACTION_VALUES: readonly AdminAction[] = Object.freeze(
  Object.values(ADMIN_ACTIONS),
);

export function isAdminAction(v: unknown): v is AdminAction {
  return typeof v === "string" && (ADMIN_ACTION_VALUES as readonly string[]).includes(v);
}

export interface AuditInput {
  /** Кто сделал; null — действие без актора (в проекте таких точек нет,
   *  но тип допускает: скрипт с actor_id = самому себе пишет id) */
  actorId: string | null;
  action: AdminAction;
  targetType: AdminAuditTargetType;
  targetId?: string | null | undefined;
  details?: Record<string, unknown> | undefined;
  ip?: string | null | undefined;
}

/**
 * Запись строки журнала исполнителем exec (db или tx вызывающего).
 * Возвращает id строки. Не глотает ошибок: сбой записи откатывает
 * транзакцию действия — так и задумано (журнал и дело неразделимы).
 */
export async function writeAudit(exec: DbExecutor, input: AuditInput): Promise<string> {
  const [row] = await exec
    .insert(adminAudit)
    .values({
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      details: input.details ?? {},
      ip: input.ip ?? null,
    })
    .returning({ id: adminAudit.id });
  return row!.id;
}

/** Последние строки журнала, новые первыми (limit 1..500, дефолт 50).
 *  actorEmail — LEFT JOIN users по actor_id (у анонимизированных 7.1 актор
 *  уже снят — null); вкладка «Доступ» показывает его вместо uuid. */
export async function listAudit(limit = 50): Promise<AdminAuditEntry[]> {
  const n = Math.min(500, Math.max(1, Math.floor(limit)));
  const rows = await db
    .select({ a: adminAudit, actorEmail: users.email })
    .from(adminAudit)
    .leftJoin(users, eq(users.id, adminAudit.actorId))
    .orderBy(desc(adminAudit.createdAt), desc(adminAudit.id))
    .limit(n);
  return rows.map((r) => ({ ...toAuditDto(r.a), actorEmail: r.actorEmail ?? null }));
}

export function toAuditDto(r: typeof adminAudit.$inferSelect): AdminAuditEntry {
  return {
    id: r.id,
    actorId: r.actorId,
    action: r.action as AdminAction,
    targetType: r.targetType as AdminAuditTargetType,
    targetId: r.targetId,
    details: r.details,
    ip: r.ip,
    createdAt: r.createdAt.toISOString(),
    actorEmail: null,
  };
}

/**
 * IP запроса для журнала: X-Forwarded-For (первый адрес) → X-Real-IP →
 * адрес сокета (getConnInfo, как в rate-limiter 0.2) → null.
 */
export function clientIpOf(c: Context): string | null {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim() || null;
  const real = c.req.header("x-real-ip");
  if (real?.trim()) return real.trim();
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

/**
 * Ключ advisory-блокировки, сериализующей операции над множеством
 * администраторов (смена роли, удаление аккаунта, bootstrap): без неё две
 * параллельные транзакции насчитают по два администратора и понизят
 * обоих. Берётся pg_advisory_xact_lock внутри транзакции — снимается
 * вместе с ней.
 */
export const ADMIN_SET_LOCK_KEY = 810_001;
