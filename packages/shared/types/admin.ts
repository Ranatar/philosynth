/**
 * Типы управления доступом и журнала администратора (беседа 8.1).
 * Соответствие: server/db/schema.ts (admin_audit, 02 §2.29),
 * 03-specification §2.1 (GET /auth/users, POST /auth/users/:id/role,
 * GET /auth/audit); список действий — server/services/admin-audit.ts
 * (ADMIN_ACTIONS — замороженная константа, единственный источник).
 */

/** Роли остаются две (решение при заведении Фазы 8, 07 §8). */
export type UserRole = "user" | "admin";

/** Действие журнала — значение из ADMIN_ACTIONS (admin-audit.ts). */
export type AdminAction =
  | "prompt.version.created"
  | "prompt.version.activated"
  | "config.version.created"
  | "config.version.activated"
  | "taxonomy.type.updated"
  | "taxonomy.type.deleted"
  | "user.role.changed"
  | "user.bootstrapped"
  | "account.deleted";

/** Род цели действия (admin_audit.target_type). */
export type AdminAuditTargetType =
  | "prompt_template"
  | "synthesis_config"
  | "taxonomy_type"
  | "user";

/** Строка admin_audit (GET /auth/audit). */
export interface AdminAuditEntry {
  id: string;
  /** null — актор удалил аккаунт (7.1 анонимизирует строку users; след остаётся) */
  actorId: string | null;
  action: AdminAction;
  targetType: AdminAuditTargetType;
  /** Ключ шаблона/конфига, id типа каталога, id пользователя */
  targetId: string | null;
  /** jsonb — порядок ключей НЕ сохраняется (09 §1 0.3); сравнивать канонически */
  details: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
  /** email актора (LEFT JOIN users в listAudit; не колонка) — null, если
   *  актор снят или строка отдана без join */
  actorEmail: string | null;
}

/** Элемент GET /auth/users — минимум для назначения роли. */
export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
}

/** Ответ GET /auth/users. */
export interface AdminUserList {
  users: AdminUserRow[];
  total: number;
}
