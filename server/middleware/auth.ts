/**
 * Аутентификация (беседа 0.2): сессии Lucia-модели в PostgreSQL.
 *
 * Пакет lucia (v3) снят с поддержки; проект следует актуальной рекомендации
 * самих авторов Lucia — реализация сессий по их же схеме:
 *   - таблица sessions (id TEXT PK, user_id, expires_at) — уже в schema.ts (02 §2.2);
 *   - токен сессии — 32 случайных байта (base64url), живёт ТОЛЬКО в cookie;
 *   - в БД хранится SHA-256 от токена (кража дампа БД не даёт валидных cookie);
 *   - скользящее продление: TTL 30 дней, продлевается при остатке < 15 дней.
 *
 * Пароли — bcrypt (01-architecture §6), реализация bcryptjs (без нативных
 * сборок; совместима по формату хэша $2b$).
 *
 * Формат ошибок и коды — 03-specification, преамбула §2 и §4.3.
 */
import { createHash, randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { db, schema } from "../db/index.js";
import { env } from "../env.js";

/* ── Константы ───────────────────────────────────────────────────────── */

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней
const SESSION_RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // продлевать при остатке < 15 дней
const BCRYPT_ROUNDS = 10;

/* ── Типы ────────────────────────────────────────────────────────────── */

/** Пользователь в контексте запроса (ответ GET /auth/me, 03-spec §2.1) */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  role: "user" | "admin";
  balanceUsd: number;
}

export interface SessionInfo {
  /** SHA-256 от токена (значение sessions.id) */
  id: string;
  userId: string;
  expiresAt: Date;
}

/** Hono-Env с переменными, которые выставляет requireAuth */
export type AuthEnv = {
  Variables: {
    user: AuthUser;
    session: SessionInfo;
  };
};

/* ── Пароли ──────────────────────────────────────────────────────────── */

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/* ── Сессии ──────────────────────────────────────────────────────────── */

/** Токен сессии — уходит в cookie, в БД не хранится. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** sessions.id = SHA-256(token) в hex. */
export function sessionIdFromToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
): Promise<{ token: string; session: SessionInfo }> {
  const token = generateSessionToken();
  const session: SessionInfo = {
    id: sessionIdFromToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  };
  await db.insert(schema.sessions).values(session);
  return { token, session };
}

/**
 * Валидация токена: находит сессию + пользователя, удаляет истёкшую,
 * продлевает скользящим окном. null — токен невалиден/истёк.
 */
export async function validateSessionToken(
  token: string,
): Promise<{ user: AuthUser; session: SessionInfo } | null> {
  const sessionId = sessionIdFromToken(token);
  const rows = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const now = Date.now();
  if (row.session.expiresAt.getTime() <= now) {
    await db
      .delete(schema.sessions)
      .where(eq(schema.sessions.id, sessionId));
    return null;
  }

  let expiresAt = row.session.expiresAt;
  if (expiresAt.getTime() - now < SESSION_RENEW_THRESHOLD_MS) {
    expiresAt = new Date(now + SESSION_TTL_MS);
    await db
      .update(schema.sessions)
      .set({ expiresAt })
      .where(eq(schema.sessions.id, sessionId));
  }

  return {
    user: toAuthUser(row.user),
    session: { id: sessionId, userId: row.session.userId, expiresAt },
  };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

function toAuthUser(u: typeof schema.users.$inferSelect): AuthUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    // numeric(10,4) приходит строкой из postgres.js
    balanceUsd: Number(u.balanceUsd),
  };
}

/* ── Cookie ──────────────────────────────────────────────────────────── */

export function setSessionCookie(
  c: Context,
  token: string,
  expiresAt: Date,
): void {
  setCookie(c, env.session.cookieName, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: env.session.cookieSecure,
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, env.session.cookieName, { path: "/" });
}

export function getSessionToken(c: Context): string | undefined {
  return getCookie(c, env.session.cookieName);
}

/* ── Middleware ──────────────────────────────────────────────────────── */

/**
 * Проверка сессии: валидный cookie → c.get("user") / c.get("session"),
 * иначе 401 AUTH_REQUIRED (03-spec §4.3).
 */
export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const token = getSessionToken(c);
  const result = token ? await validateSessionToken(token) : null;
  if (!result) {
    if (token) clearSessionCookie(c); // мёртвый cookie — подчистить
    return c.json(
      { error: "Требуется авторизация", code: "AUTH_REQUIRED" },
      401,
    );
  }
  c.set("user", result.user);
  c.set("session", result.session);
  await next();
};
