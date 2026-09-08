/**
 * Роуты аутентификации (беседа 0.2). Контракт — 03-specification §2.1:
 *   POST /auth/register  { email, password, displayName? } → { user }
 *   POST /auth/login     { email, password }               → { user } + cookie
 *   POST /auth/logout    (no body)                         → { ok: true }
 *   GET  /auth/me                                          → { user }
 *   PATCH /auth/me       { displayName } → { user }  (беседа 0.6, A3:
 *     trim; пустая строка → null; длина > 100 → VALIDATION_ERROR + details)
 *   POST /auth/password-change { currentPassword, newPassword } → { ok: true }
 *     (беседа 0.5, требование A3: неверный currentPassword →
 *      401 AUTH_REQUIRED единым ответом; прочие сессии пользователя
 *      инвалидируются, текущая остаётся живой)
 *
 *   DELETE /auth/me { password } → { ok: true, deletedSyntheses,
 *     subscriptionCanceled } (беседа 7.1, долг §12 6.1): подтверждение
 *     паролем (неверный → 401 AUTH_REQUIRED единым ответом); активная
 *     генерация → 409 GENERATION_IN_PROGRESS; строка users анонимизируется
 *     (финансовая история RESTRICT остаётся), сессии/ключи/синтезы удаляются,
 *     подписка отменяется — см. services/account-deletion.ts; cookie сессии
 *     очищается.
 *
 *   Управление доступом (беседа 8.1; requireAuth + requireAdmin):
 *   GET  /auth/users ?query=&limit=&offset= → { users: AdminUserRow[], total }
 *     минимальный список для назначения роли (id, email, displayName,
 *     role, createdAt); query — подстрока email/displayName (ILIKE);
 *     анонимизированные deleted-*@deleted.invalid (7.1) не показываются.
 *   POST /auth/users/:id/role { role: 'user' | 'admin' } → { user }
 *     роль вне двух значений → 400 VALIDATION_ERROR (details.role);
 *     :id не UUID / не найден → 404 NOT_FOUND; своя роль → 409
 *     SELF_ROLE_CHANGE; понижение последнего администратора → 409
 *     LAST_ADMIN; та же роль → 200 без изменений и без строки журнала;
 *     успех → полный user + строка admin_audit user.role.changed
 *     { from, to } — той же транзакцией (services/admin-audit.ts);
 *     транзакция держит pg_advisory_xact_lock(ADMIN_SET_LOCK_KEY), чтобы
 *     две параллельные смены не насчитали лишнего администратора.
 *   GET  /auth/audit ?limit=50 → { entries: AdminAuditEntry[] } — последние
 *     строки журнала, новые первыми (limit 1..500).
 *
 * Правила пароля/email/имени — @philosynth/shared/constants/auth (8.1 п.1:
 * второго свода правил быть не должно — bootstrap-admin проверяет то же).
 *
 * Формат ошибок: { error, code, details? }; коды — §4.3.
 * Примечания к кодам (в §4.3 нет отдельных кодов для конфликтов/кредов):
 *   - занятый email → 409 VALIDATION_ERROR (details.email);
 *   - неверные креды → 401 AUTH_REQUIRED (сессия не выдана), текст ошибки
 *     не раскрывает, существует ли email.
 */
import {
  DISPLAY_NAME_MAX_LENGTH,
  EMAIL_RE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOO_SHORT_MESSAGE,
} from "@philosynth/shared/constants/auth";
import type { AdminUserRow, UserRole } from "@philosynth/shared/types/admin";
import { and, count, desc, eq, ilike, ne, notLike, or, sql } from "drizzle-orm";
import { Hono } from "hono";

import { db, schema } from "../db/index.js";
import { requireAdmin } from "../middleware/admin-only.js";
import {
  clearSessionCookie,
  createSession,
  getSessionToken,
  hashPassword,
  invalidateSession,
  requireAuth,
  sessionIdFromToken,
  setSessionCookie,
  validateSessionToken,
  verifyPassword,
  type AuthEnv,
} from "../middleware/auth.js";
import { AccountDeletionError, deleteAccount } from "../services/account-deletion.js"; // 7.1
import {
  ADMIN_ACTIONS,
  ADMIN_SET_LOCK_KEY,
  clientIpOf,
  listAudit,
  writeAudit,
} from "../services/admin-audit.js"; // 8.1

/* ── Валидация тела запроса ──────────────────────────────────────────── */

// EMAIL_RE / PASSWORD_MIN_LENGTH / DISPLAY_NAME_MAX_LENGTH — из shared (8.1)

interface CredentialsBody {
  email: string;
  password: string;
  displayName?: string | undefined;
}

/** Разбор JSON-тела: битый JSON → null (роут ответит VALIDATION_ERROR). */
async function readJson(c: { req: { json(): Promise<unknown> } }): Promise<
  Record<string, unknown> | null
> {
  try {
    const body = await c.req.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Проверка полей; возвращает нормализованные креды либо карту ошибок. */
function parseCredentials(
  body: Record<string, unknown> | null,
  opts: { validateStrength: boolean },
): { ok: true; value: CredentialsBody } | { ok: false; details: Record<string, string> } {
  const details: Record<string, string> = {};
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const displayNameRaw = body?.displayName;

  if (!email) details.email = "Обязательное поле";
  else if (!EMAIL_RE.test(email)) details.email = "Невалидный email";

  if (!password) details.password = "Обязательное поле";
  else if (opts.validateStrength && password.length < PASSWORD_MIN_LENGTH) {
    details.password = PASSWORD_TOO_SHORT_MESSAGE;
  }

  let displayName: string | undefined;
  if (displayNameRaw !== undefined) {
    if (typeof displayNameRaw !== "string") {
      details.displayName = "Должно быть строкой";
    } else {
      displayName = displayNameRaw.trim() || undefined;
    }
  }

  if (Object.keys(details).length > 0) return { ok: false, details };
  return { ok: true, value: { email, password, displayName } };
}

/* ── Роуты ───────────────────────────────────────────────────────────── */

export const authRoutes = new Hono<AuthEnv>();

authRoutes.post("/register", async (c) => {
  const parsed = parseCredentials(await readJson(c), { validateStrength: true });
  if (!parsed.ok) {
    return c.json(
      {
        error: "Невалидные данные",
        code: "VALIDATION_ERROR",
        details: parsed.details,
      },
      400,
    );
  }
  const { email, password, displayName } = parsed.value;

  const passwordHash = await hashPassword(password);
  try {
    const [user] = await db
      .insert(schema.users)
      .values({ email, passwordHash, displayName: displayName ?? null })
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        displayName: schema.users.displayName,
      });
    return c.json({ user }, 201);
  } catch (err) {
    // Гонка/дубль по UNIQUE(email) — postgres код 23505.
    // drizzle-orm ≥0.44 оборачивает PostgresError в DrizzleQueryError,
    // код лежит в err.cause.code — проверяем оба уровня.
    const e = err as { code?: string; cause?: { code?: string } };
    if (e.code === "23505" || e.cause?.code === "23505") {
      return c.json(
        {
          error: "Пользователь с таким email уже зарегистрирован",
          code: "VALIDATION_ERROR",
          details: { email: "Уже зарегистрирован" },
        },
        409,
      );
    }
    throw err;
  }
});

authRoutes.post("/login", async (c) => {
  const parsed = parseCredentials(await readJson(c), { validateStrength: false });
  if (!parsed.ok) {
    return c.json(
      {
        error: "Невалидные данные",
        code: "VALIDATION_ERROR",
        details: parsed.details,
      },
      400,
    );
  }
  const { email, password } = parsed.value;

  const rows = await db.query.users.findMany({
    where: (u, { eq }) => eq(u.email, email),
    limit: 1,
  });
  const user = rows[0];
  // Единый ответ для «нет такого email» и «неверный пароль»
  const valid = user
    ? await verifyPassword(password, user.passwordHash)
    : false;
  if (!user || !valid) {
    return c.json(
      { error: "Неверный email или пароль", code: "AUTH_REQUIRED" },
      401,
    );
  }

  const { token, session } = await createSession(user.id);
  setSessionCookie(c, token, session.expiresAt);
  return c.json({
    user: { id: user.id, email: user.email, displayName: user.displayName },
  });
});

authRoutes.post("/logout", async (c) => {
  // Толерантный logout: чистим cookie всегда, сессию — если она была
  const token = getSessionToken(c);
  if (token) {
    const result = await validateSessionToken(token);
    if (result) await invalidateSession(result.session.id);
    else await invalidateSession(sessionIdFromToken(token)); // на случай истёкшей
  }
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.post("/password-change", requireAuth, async (c) => {
  // 03-spec §2.1 (беседа 0.5): смена пароля под живой сессией.
  const body = await readJson(c);
  const details: Record<string, string> = {};
  const currentPassword =
    typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword) details.currentPassword = "Обязательное поле";
  if (!newPassword) details.newPassword = "Обязательное поле";
  else if (newPassword.length < PASSWORD_MIN_LENGTH) {
    details.newPassword = PASSWORD_TOO_SHORT_MESSAGE;
  }
  if (Object.keys(details).length > 0) {
    return c.json(
      { error: "Невалидные данные", code: "VALIDATION_ERROR", details },
      400,
    );
  }

  const user = c.get("user");
  const session = c.get("session");

  // AuthUser контекста не содержит password_hash — читаем из БД.
  const rows = await db.query.users.findMany({
    where: (u, { eq: eqOp }) => eqOp(u.id, user.id),
    limit: 1,
  });
  const dbUser = rows[0];
  // Единый ответ 401 AUTH_REQUIRED (анти-enumeration, как в login):
  // не различаем «пользователь исчез» и «пароль не совпал».
  const valid = dbUser
    ? await verifyPassword(currentPassword, dbUser.passwordHash)
    : false;
  if (!dbUser || !valid) {
    return c.json(
      { error: "Неверный текущий пароль", code: "AUTH_REQUIRED" },
      401,
    );
  }

  const passwordHash = await hashPassword(newPassword);
  // Атомарно: новый хэш + инвалидация всех сессий пользователя,
  // КРОМЕ текущей (защита от угнанных сессий; текущая живёт — §2.1).
  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    await tx
      .delete(schema.sessions)
      .where(
        and(
          eq(schema.sessions.userId, user.id),
          ne(schema.sessions.id, session.id),
        ),
      );
  });

  return c.json({ ok: true });
});

authRoutes.delete("/me", requireAuth, async (c) => {
  // 7.1: удаление аккаунта — подтверждение текущим паролем
  const body = await readJson(c);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) {
    return c.json(
      { error: "Невалидные данные", code: "VALIDATION_ERROR", details: { password: "Обязательное поле" } },
      400,
    );
  }
  const user = c.get("user");
  const rows = await db.query.users.findMany({
    where: (u, { eq: eqOp }) => eqOp(u.id, user.id),
    limit: 1,
  });
  const dbUser = rows[0];
  const valid = dbUser ? await verifyPassword(password, dbUser.passwordHash) : false;
  if (!dbUser || !valid) {
    return c.json({ error: "Неверный пароль", code: "AUTH_REQUIRED" }, 401);
  }
  try {
    const result = await deleteAccount(user.id, { ip: clientIpOf(c) });
    clearSessionCookie(c);
    return c.json({
      ok: true,
      deletedSyntheses: result.deletedSyntheses,
      subscriptionCanceled: result.subscriptionCanceled,
    });
  } catch (err) {
    if (err instanceof AccountDeletionError) {
      // 8.1: LAST_ADMIN — единственный администратор не может уйти
      return c.json(
        { error: err.message, code: err.code },
        err.code === "GENERATION_IN_PROGRESS" || err.code === "LAST_ADMIN" ? 409 : 404,
      );
    }
    throw err;
  }
});

authRoutes.get("/me", requireAuth, (c) => {
  const user = c.get("user");
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      balanceUsd: user.balanceUsd,
    },
  });
});

authRoutes.patch("/me", requireAuth, async (c) => {
  // 03-spec §2.1 (беседа 0.6, A3): смена отображаемого имени.
  const body = await readJson(c);
  const raw = body?.displayName;
  if (raw === undefined || typeof raw !== "string") {
    return c.json(
      {
        error: "Невалидные данные",
        code: "VALIDATION_ERROR",
        details: {
          displayName:
            raw === undefined ? "Обязательное поле" : "Должно быть строкой",
        },
      },
      400,
    );
  }
  const trimmed = raw.trim();
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return c.json(
      {
        error: "Невалидные данные",
        code: "VALIDATION_ERROR",
        details: {
          displayName: `Максимальная длина — ${DISPLAY_NAME_MAX_LENGTH} символов`,
        },
      },
      400,
    );
  }
  const displayName = trimmed || null; // пустая строка = сброс имени

  const sessionUser = c.get("user");
  const [updated] = await db
    .update(schema.users)
    .set({ displayName, updatedAt: new Date() })
    .where(eq(schema.users.id, sessionUser.id))
    .returning();
  if (!updated) {
    // Пользователь исчез под живой сессией — единый 401, как везде в auth
    return c.json(
      { error: "Требуется авторизация", code: "AUTH_REQUIRED" },
      401,
    );
  }
  // Полный user, как в GET /auth/me (numeric приходит строкой из postgres.js)
  return c.json({
    user: {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
      balanceUsd: Number(updated.balanceUsd),
    },
  });
});

/* ── Управление доступом (беседа 8.1) ────────────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_ROLES: readonly UserRole[] = ["user", "admin"];
/** Анонимизированные 7.1 строки — назначать им нечего, из списка убраны */
const DELETED_EMAIL_PATTERN = "deleted-%@deleted.invalid";

function toAdminUserRow(u: {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  createdAt: Date;
}): AdminUserRow {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  };
}

function parseIntParam(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

authRoutes.get("/users", requireAuth, requireAdmin, async (c) => {
  const query = (c.req.query("query") ?? "").trim();
  const limit = parseIntParam(c.req.query("limit"), 20, 1, 100);
  const offset = parseIntParam(c.req.query("offset"), 0, 0, 1_000_000);

  const notDeleted = notLike(schema.users.email, DELETED_EMAIL_PATTERN);
  const where = query
    ? and(
        notDeleted,
        or(
          ilike(schema.users.email, `%${query}%`),
          ilike(schema.users.displayName, `%${query}%`),
        ),
      )
    : notDeleted;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        displayName: schema.users.displayName,
        role: schema.users.role,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(where)
      .orderBy(desc(schema.users.createdAt), desc(schema.users.id))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(schema.users).where(where),
  ]);
  return c.json({ users: rows.map(toAdminUserRow), total: Number(totalRow?.n ?? 0) });
});

authRoutes.post("/users/:id/role", requireAuth, requireAdmin, async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) {
    return c.json({ error: "Пользователь не найден", code: "NOT_FOUND" }, 404);
  }
  const body = await readJson(c);
  const role = body?.role;
  if (typeof role !== "string" || !(USER_ROLES as readonly string[]).includes(role)) {
    return c.json(
      {
        error: "Невалидные данные",
        code: "VALIDATION_ERROR",
        details: { role: "Ожидается 'user' или 'admin'" },
      },
      400,
    );
  }
  const actor = c.get("user");
  if (id === actor.id) {
    // Иначе единственный администратор понижает сам себя
    return c.json(
      {
        error: "Свою роль изменить нельзя — попросите другого администратора",
        code: "SELF_ROLE_CHANGE",
      },
      409,
    );
  }

  type Outcome =
    | { kind: "not_found" }
    | { kind: "last_admin" }
    | { kind: "ok"; changed: boolean; user: typeof schema.users.$inferSelect };

  const outcome = await db.transaction(async (tx): Promise<Outcome> => {
    // Сериализация операций над множеством администраторов (см. admin-audit.ts)
    await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_SET_LOCK_KEY})`);
    const [target] = await tx
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .for("update")
      .limit(1);
    if (!target) return { kind: "not_found" };
    if (target.role === role) return { kind: "ok", changed: false, user: target };
    if (target.role === "admin" && role === "user") {
      const [adm] = await tx
        .select({ n: count() })
        .from(schema.users)
        .where(eq(schema.users.role, "admin"));
      if (Number(adm?.n ?? 0) <= 1) return { kind: "last_admin" };
    }
    const [updated] = await tx
      .update(schema.users)
      .set({ role: role as UserRole, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    await writeAudit(tx, {
      actorId: actor.id,
      action: ADMIN_ACTIONS.USER_ROLE_CHANGED,
      targetType: "user",
      targetId: id,
      details: { from: target.role, to: role, email: target.email },
      ip: clientIpOf(c),
    });
    return { kind: "ok", changed: true, user: updated! };
  });

  if (outcome.kind === "not_found") {
    return c.json({ error: "Пользователь не найден", code: "NOT_FOUND" }, 404);
  }
  if (outcome.kind === "last_admin") {
    return c.json(
      {
        error: "Нельзя понизить последнего администратора — сначала назначьте второго",
        code: "LAST_ADMIN",
      },
      409,
    );
  }
  const u = outcome.user;
  return c.json({
    user: {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      balanceUsd: Number(u.balanceUsd),
      createdAt: u.createdAt.toISOString(),
    },
    changed: outcome.changed,
  });
});

authRoutes.get("/audit", requireAuth, requireAdmin, async (c) => {
  const limit = parseIntParam(c.req.query("limit"), 50, 1, 500);
  return c.json({ entries: await listAudit(limit) });
});
