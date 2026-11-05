/**
 * API-функции управления доступом (беседа 8.1, запрос 1, п. 9) — три
 * вызова вкладки «Доступ» AdminPromptsPage.
 *
 * Контракт: 03-specification §2.1 и server/routes/auth.ts (8.1); все три —
 * requireAuth + requireAdmin (403 FORBIDDEN обычному пользователю):
 *  - listUsers   → GET  /auth/users ?query&limit&offset → { users, total }
 *      (минимум для назначения: id, email, displayName, role, createdAt;
 *      query — подстрока email/имени; анонимизированных 7.1 нет в списке)
 *  - setUserRole → POST /auth/users/:id/role { role } → { user, changed }
 *      400 VALIDATION_ERROR (details.role) / 404 NOT_FOUND /
 *      409 SELF_ROLE_CHANGE (своя роль) / 409 LAST_ADMIN (последний админ)
 *  - getAuditLog → GET  /auth/audit ?limit → { entries } (новые первыми)
 *  - getMailOutbox → GET /auth/mail-outbox ?limit → { counts, rows } (15.3)
 *  - 15.4 (Д-74), вкладка «Тарифы» (server/routes/billing.ts, requireAdmin):
 *    listAdminPlans → GET /billing/admin/plans → { plans: AdminPlanRow[] }
 *    updatePlan     → PATCH /billing/admin/plans/:id PlanUpdateInput → AdminPlanResult
 *        409 PLAN_HAS_SUBSCRIPTIONS (details.lockedFields) / 400 VALIDATION_ERROR
 *        (details по полям, economics) / 503 STRIPE_UNAVAILABLE
 *    createPlanEdition → POST /billing/admin/plans/:id/editions PlanEditionInput → AdminPlanResult
 *    createPlan     → POST /billing/admin/plans PlanCreateInput → AdminPlanResult
 *
 * ApiError пробрасывается как есть — вкладка показывает err.message.
 */
import type {
  AdminAuditEntry,
  AdminUserList,
  MailOutboxView,
  UserRole,
} from "@philosynth/shared/types/admin";
import type {
  AdminPlanResult,
  AdminPlanRow,
  AdminPlansView,
  PlanCreateInput,
  PlanEditionInput,
  PlanUpdateInput,
} from "@philosynth/shared/types/billing";

import { apiGet, apiPatch, apiPost } from "./client";

export interface ListUsersQuery {
  query?: string;
  limit?: number;
  offset?: number;
}

export function listUsers(q: ListUsersQuery = {}): Promise<AdminUserList> {
  return apiGet<AdminUserList>("/auth/users", {
    query: q.query?.trim() || undefined,
    limit: q.limit,
    offset: q.offset,
  });
}

export interface SetRoleResult {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    role: UserRole;
    balanceUsd: number;
    createdAt: string;
  };
  /** false — роль уже была такой (строки журнала нет) */
  changed: boolean;
}

export function setUserRole(userId: string, role: UserRole): Promise<SetRoleResult> {
  return apiPost<SetRoleResult>(`/auth/users/${encodeURIComponent(userId)}/role`, { role });
}

export function getAuditLog(limit = 50): Promise<AdminAuditEntry[]> {
  return apiGet<{ entries: AdminAuditEntry[] }>("/auth/audit", { limit }).then((r) => r.entries);
}

/** 15.3 (Д-72 п.3): очередь писем — счётчики по статусам и последние строки
 *  без тел (GET /auth/mail-outbox ?limit=, requireAdmin). */
export function getMailOutbox(limit = 50): Promise<MailOutboxView> {
  return apiGet<MailOutboxView>("/auth/mail-outbox", { limit });
}

/* ── 15.4 (Д-74): тарифы админкой и редакциями ─────────────────────────── */

export function listAdminPlans(): Promise<AdminPlanRow[]> {
  return apiGet<AdminPlansView>("/billing/admin/plans").then((r) => r.plans);
}

export function updatePlan(planId: string, input: PlanUpdateInput): Promise<AdminPlanResult> {
  return apiPatch<AdminPlanResult>(`/billing/admin/plans/${encodeURIComponent(planId)}`, input);
}

export function createPlanEdition(planId: string, input: PlanEditionInput): Promise<AdminPlanResult> {
  return apiPost<AdminPlanResult>(`/billing/admin/plans/${encodeURIComponent(planId)}/editions`, input);
}

export function createPlan(input: PlanCreateInput): Promise<AdminPlanResult> {
  return apiPost<AdminPlanResult>("/billing/admin/plans", input);
}
