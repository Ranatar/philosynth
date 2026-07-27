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
 * Формат ошибок: { error, code, details? }; коды — §4.3.
 * Примечания к кодам (в §4.3 нет отдельных кодов для конфликтов/кредов):
 *   - занятый email → 409 VALIDATION_ERROR (details.email);
 *   - неверные креды → 401 AUTH_REQUIRED (сессия не выдана), текст ошибки
 *     не раскрывает, существует ли email.
 */
import { and, eq, ne } from "drizzle-orm";
import { Hono } from "hono";

import { db, schema } from "../db/index.js";
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

/* ── Валидация тела запроса ──────────────────────────────────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const DISPLAY_NAME_MAX_LENGTH = 100;

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
    details.password = `Минимальная длина пароля — ${PASSWORD_MIN_LENGTH} символов`;
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
    details.newPassword = `Минимальная длина пароля — ${PASSWORD_MIN_LENGTH} символов`;
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
