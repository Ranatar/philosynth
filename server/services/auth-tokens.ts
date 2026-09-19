/**
 * Одноразовые доводы из писем и сами письма учётной записи (беседа 9.1,
 * запрос 1, пп. 2b и 4; 02 §2.30 auth_tokens).
 *
 * Довод — 32 случайных байта (base64url), живёт ТОЛЬКО в ссылке письма; в
 * базе — его sha256 (hex): утечка таблицы не даёт ни входа, ни
 * подтверждения (тот же принцип, что sessions.id, 0.2).
 *
 * Выдача (issueToken) помечает прежние доводы того же пользователя и
 * назначения использованными — иначе старая ссылка из почты осталась бы
 * рабочей. Погашение (consumeToken) — ОДНИМ условным UPDATE … RETURNING:
 * два одновременных перехода по ссылке не пройдут оба. Просроченный,
 * использованный и несуществующий довод неразличимы — null (роут отвечает
 * 400 TOKEN_INVALID одним кодом: подсказывать, какая именно беда, незачем).
 *
 * queue*Mail — довод + письмо одним шагом ПОД ТОЧКОЙ СОХРАНЕНИЯ в
 * транзакции вызывающего (mail/outbox.ts): откат действия уносит и довод, и
 * письмо; сбой постановки не отменяет действия (довод без письма
 * бесполезен, поэтому откатывается вместе с ним).
 */
import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";

import { schema } from "../db/index.js";
import { env } from "../env.js";
import { enqueue, underSavepoint, type MailDbExecutor } from "./mail/outbox.js";
import { passwordResetLetter, verifyEmailLetter } from "./mail/templates.js";

const { authTokens } = schema;

export type AuthTokenPurpose = "email_verify" | "password_reset";

/** Срок жизни довода, часов (запрос 1, п. 4): подтверждение 72, сброс 1. */
export const TOKEN_TTL_HOURS: Readonly<Record<AuthTokenPurpose, number>> = Object.freeze({
  email_verify: 72,
  password_reset: 1,
});

/** Клиентские маршруты, куда ведут ссылки писем (App.tsx, 9.1 п. 6). */
export const TOKEN_LINK_PATH: Readonly<Record<AuthTokenPurpose, string>> = Object.freeze({
  email_verify: "/verify-email/",
  password_reset: "/reset-password/",
});

export function generateAuthToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenLink(purpose: AuthTokenPurpose, token: string): string {
  return `${env.mail.publicBaseUrl}${TOKEN_LINK_PATH[purpose]}${encodeURIComponent(token)}`;
}

/**
 * Выдать довод: прежние непогашенные того же назначения → used_at = now,
 * новая строка с хэшем. Возвращает САМ довод (в базу он не попадает).
 */
export async function issueToken(
  exec: MailDbExecutor,
  userId: string,
  purpose: AuthTokenPurpose,
  now: Date = new Date(),
): Promise<string> {
  await exec
    .update(authTokens)
    .set({ usedAt: now })
    .where(
      and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)),
    );
  const token = generateAuthToken();
  await exec.insert(authTokens).values({
    userId,
    purpose,
    tokenHash: hashAuthToken(token),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_HOURS[purpose] * 3_600_000),
  });
  return token;
}

/**
 * Погасить довод. Атомарно: условие «не использован И не просрочен» и
 * отметка used_at — один UPDATE. → userId либо null (любой негодный довод).
 */
export async function consumeToken(
  exec: MailDbExecutor,
  token: string,
  purpose: AuthTokenPurpose,
  now: Date = new Date(),
): Promise<string | null> {
  if (!token) return null;
  const rows = await exec
    .update(authTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(authTokens.tokenHash, hashAuthToken(token)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .returning({ userId: authTokens.userId });
  return rows[0]?.userId ?? null;
}

/** Годен ли довод СЕЙЧАС, без погашения — дешёвая предпроверка до bcrypt
 *  (решает всё равно consumeToken в транзакции). */
export async function isTokenUsable(
  exec: MailDbExecutor,
  token: string,
  purpose: AuthTokenPurpose,
  now: Date = new Date(),
): Promise<boolean> {
  if (!token) return false;
  const rows = await exec
    .select({ id: authTokens.id })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, hashAuthToken(token)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Погасить все непогашенные доводы пользователя (любого назначения либо
 *  одного): после сброса пароля, при удалении аккаунта. */
export async function revokeTokens(
  exec: MailDbExecutor,
  userId: string,
  purpose?: AuthTokenPurpose,
  now: Date = new Date(),
): Promise<void> {
  await exec
    .update(authTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(authTokens.userId, userId),
        isNull(authTokens.usedAt),
        ...(purpose ? [eq(authTokens.purpose, purpose)] : []),
      ),
    );
}

export interface MailRecipient {
  id: string;
  email: string;
  displayName: string | null;
}

async function queueTokenMail(
  exec: MailDbExecutor,
  user: MailRecipient,
  purpose: AuthTokenPurpose,
): Promise<boolean> {
  const id = await underSavepoint(exec, `письмо ${purpose} для ${user.id} не поставлено`, async (sp) => {
    const token = await issueToken(sp, user.id, purpose);
    const input = {
      displayName: user.displayName,
      link: tokenLink(purpose, token),
      ttlHours: TOKEN_TTL_HOURS[purpose],
    };
    const letter = purpose === "email_verify" ? verifyEmailLetter(input) : passwordResetLetter(input);
    return enqueue(sp, { to: user.email, ...letter });
  });
  return id !== null;
}

/** Довод + письмо с подтверждением адреса. false — не поставлено (в логе). */
export function queueVerificationMail(exec: MailDbExecutor, user: MailRecipient): Promise<boolean> {
  return queueTokenMail(exec, user, "email_verify");
}

/** Довод + письмо сброса пароля. false — не поставлено (в логе). */
export function queuePasswordResetMail(exec: MailDbExecutor, user: MailRecipient): Promise<boolean> {
  return queueTokenMail(exec, user, "password_reset");
}
