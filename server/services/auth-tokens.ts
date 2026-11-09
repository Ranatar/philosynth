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
import { currentLocale, runWithLocale } from "../i18n/locale.js"; // 14.1 (Д-51)
import {
  emailChangeLetter,
  emailChangedNoticeLetter,
  memberInviteRegisterLetter,
  passwordResetLetter,
  verifyEmailLetter,
} from "./mail/templates.js";
import {
  MEMBER_INVITE_TOKEN_PURPOSE,
  MEMBER_INVITE_TTL_HOURS,
} from "@philosynth/shared/constants/notifications"; // 16.2
import type { MemberRole } from "@philosynth/shared/constants/discussion";

const { authTokens } = schema;

/** 15.3 (Д-73): + 'email_change' — смена адреса (миграция 0015).
 *  16.2: + 'member_invite' — приглашение участника на адрес БЕЗ аккаунта
 *  (миграция 0018): довод принадлежит ПРИГЛАСИВШЕМУ (user_id), несёт синтез,
 *  роль и адрес; регистрация по ссылке гасит его и заводит участника. */
export type AuthTokenPurpose = "email_verify" | "password_reset" | "email_change" | "member_invite";

/** Срок жизни довода, часов (запрос 1, п. 4): подтверждение 72, сброс 1;
 *  15.3: смена адреса — 1 ч (как сброс: ссылка уходит на адрес, который
 *  ещё не доказан своим); 16.2: приглашение на регистрацию — 72 ч (как
 *  подтверждение адреса: человеку надо дойти до почты и зарегистрироваться). */
export const TOKEN_TTL_HOURS: Readonly<Record<AuthTokenPurpose, number>> = Object.freeze({
  email_verify: 72,
  password_reset: 1,
  email_change: 1,
  member_invite: MEMBER_INVITE_TTL_HOURS,
});

/** Клиентские маршруты, куда ведут ссылки писем (App.tsx, 9.1 п. 6; 15.3;
 *  16.2 — регистрация с приглашением: довод в query, RegisterPage читает
 *  `?invite=`). */
export const TOKEN_LINK_PATH: Readonly<Record<AuthTokenPurpose, string>> = Object.freeze({
  email_verify: "/verify-email/",
  password_reset: "/reset-password/",
  email_change: "/change-email/",
  member_invite: "/register?invite=",
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
  /** 15.3 (Д-73): новый адрес — только у 'email_change' */
  newEmail: string | null = null,
): Promise<string> {
  // 16.2: у приглашений своя выдача (гашение — по синтезу и адресу, а не по
  // пользователю: владелец приглашает многих) — issueMemberInviteToken
  if (purpose === MEMBER_INVITE_TOKEN_PURPOSE)
    throw new Error("issueToken: member_invite is issued by issueMemberInviteToken");
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
    newEmail: purpose === "email_change" ? newEmail : null,
    expiresAt: new Date(now.getTime() + TOKEN_TTL_HOURS[purpose] * 3_600_000),
  });
  return token;
}

/** Погашенная строка довода (15.3): у 'email_change' newEmail — новый адрес. */
export interface ConsumedToken {
  userId: string;
  newEmail: string | null;
}

/**
 * Погасить довод и вернуть его строку. Атомарно: условие «не использован И
 * не просрочен» и отметка used_at — один UPDATE. null — любой негодный довод.
 */
export async function consumeTokenRow(
  exec: MailDbExecutor,
  token: string,
  purpose: AuthTokenPurpose,
  now: Date = new Date(),
): Promise<ConsumedToken | null> {
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
    .returning({ userId: authTokens.userId, newEmail: authTokens.newEmail });
  return rows[0] ?? null;
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
  const row = await consumeTokenRow(exec, token, purpose, now);
  return row?.userId ?? null;
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
  /** 14.1 (Д-51): язык интерфейса получателя (users.ui_locale); null —
   *  язык текущего запроса (регистрация: созданный пользователь ещё без выбора) */
  uiLocale: string | null;
}

async function queueTokenMail(
  exec: MailDbExecutor,
  user: MailRecipient,
  purpose: AuthTokenPurpose,
  /** 15.3 (Д-73): у 'email_change' — новый адрес: он же адресат письма */
  newEmail: string | null = null,
): Promise<boolean> {
  // 14.1 (Д-51): письмо собирается под языком ПОЛУЧАТЕЛЯ в момент постановки
  // в очередь — работник почты языка не знает, тело хранится собранным
  const id = await underSavepoint(exec, `письмо ${purpose} для ${user.id} не поставлено`, async (sp) => {
    const token = await issueToken(sp, user.id, purpose, new Date(), newEmail);
    const input = {
      displayName: user.displayName,
      link: tokenLink(purpose, token),
      ttlHours: TOKEN_TTL_HOURS[purpose],
    };
    const letter = runWithLocale(user.uiLocale ?? currentLocale(), () =>
      purpose === "email_verify"
        ? verifyEmailLetter(input)
        : purpose === "password_reset"
          ? passwordResetLetter(input)
          : emailChangeLetter({ ...input, newEmail: newEmail ?? "" }),
    );
    // Письмо смены адреса уходит на НОВЫЙ адрес — только переход по ссылке
    // с него доказывает, что ящик свой
    return enqueue(sp, { to: purpose === "email_change" ? (newEmail ?? user.email) : user.email, ...letter });
  });
  return id !== null;
}

/** 15.3 (Д-73): довод + письмо со ссылкой подтверждения на НОВЫЙ адрес.
 *  false — не поставлено (в логе). Прежние доводы смены гасятся выдачей. */
export function queueEmailChangeMail(
  exec: MailDbExecutor,
  user: MailRecipient,
  newEmail: string,
): Promise<boolean> {
  return queueTokenMail(exec, user, "email_change", newEmail);
}

/** 15.3 (Д-73): уведомление на СТАРЫЙ адрес после смены — без довода, в
 *  транзакции подтверждения, под точкой сохранения (сбой постановки смену не
 *  отменяет). false — не поставлено (в логе). */
export function queueEmailChangedNotice(
  exec: MailDbExecutor,
  user: MailRecipient,
  oldEmail: string,
  newEmail: string,
): Promise<boolean> {
  return underSavepoint(exec, `уведомление о смене адреса для ${user.id} не поставлено`, (sp) => {
    const letter = runWithLocale(user.uiLocale ?? currentLocale(), () =>
      emailChangedNoticeLetter({ displayName: user.displayName, newEmail }),
    );
    return enqueue(sp, { to: oldEmail, ...letter });
  }).then((id) => id !== null);
}

/** Довод + письмо с подтверждением адреса. false — не поставлено (в логе). */
export function queueVerificationMail(exec: MailDbExecutor, user: MailRecipient): Promise<boolean> {
  return queueTokenMail(exec, user, "email_verify");
}

/** Довод + письмо сброса пароля. false — не поставлено (в логе). */
export function queuePasswordResetMail(exec: MailDbExecutor, user: MailRecipient): Promise<boolean> {
  return queueTokenMail(exec, user, "password_reset");
}

/* ── 16.2: доводы приглашения адреса БЕЗ аккаунта ─────────────────────── */

export interface MemberInviteTokenInput {
  /** Пригласивший (владелец синтеза) — хозяин строки auth_tokens */
  inviterId: string;
  synthesisId: string;
  /** Приглашаемый адрес (нормализованный, нижний регистр) */
  email: string;
  role: MemberRole;
}

export interface MemberInviteTokenRow {
  id: string;
  inviterId: string;
  synthesisId: string;
  email: string;
  role: MemberRole;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Выдать довод приглашения: прежние непогашенные доводы ЭТОГО синтеза на ЭТОТ
 * адрес гасятся (повтор письма = новая ссылка, старая мертва), новая строка —
 * с synthesis_id, member_role и new_email. Возвращает сам довод.
 */
export async function issueMemberInviteToken(
  exec: MailDbExecutor,
  input: MemberInviteTokenInput,
  now: Date = new Date(),
): Promise<string> {
  await exec
    .update(authTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(authTokens.purpose, MEMBER_INVITE_TOKEN_PURPOSE),
        eq(authTokens.synthesisId, input.synthesisId),
        eq(authTokens.newEmail, input.email),
        isNull(authTokens.usedAt),
      ),
    );
  const token = generateAuthToken();
  await exec.insert(authTokens).values({
    userId: input.inviterId,
    purpose: MEMBER_INVITE_TOKEN_PURPOSE,
    tokenHash: hashAuthToken(token),
    newEmail: input.email,
    synthesisId: input.synthesisId,
    memberRole: input.role,
    expiresAt: new Date(now.getTime() + MEMBER_INVITE_TTL_HOURS * 3_600_000),
  });
  return token;
}

function inviteRowOf(r: {
  id: string;
  userId: string;
  synthesisId: string | null;
  newEmail: string | null;
  memberRole: "reviewer" | "editor" | null;
  expiresAt: Date;
  createdAt: Date;
}): MemberInviteTokenRow | null {
  if (!r.synthesisId || !r.newEmail || !r.memberRole) return null;
  return {
    id: r.id,
    inviterId: r.userId,
    synthesisId: r.synthesisId,
    email: r.newEmail,
    role: r.memberRole,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  };
}

/** Что говорит ссылка приглашения — БЕЗ погашения (RegisterPage показывает
 *  концепцию и роль до регистрации). null — любой негодный довод. */
export async function peekMemberInviteToken(
  exec: MailDbExecutor,
  token: string,
  now: Date = new Date(),
): Promise<MemberInviteTokenRow | null> {
  if (!token) return null;
  const [r] = await exec
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, hashAuthToken(token)),
        eq(authTokens.purpose, MEMBER_INVITE_TOKEN_PURPOSE),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .limit(1);
  return r ? inviteRowOf(r) : null;
}

/** Погасить довод приглашения (регистрация по ссылке) — один условный UPDATE,
 *  как consumeTokenRow. null — негодный довод. */
export async function consumeMemberInviteToken(
  exec: MailDbExecutor,
  token: string,
  now: Date = new Date(),
): Promise<MemberInviteTokenRow | null> {
  if (!token) return null;
  const rows = await exec
    .update(authTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(authTokens.tokenHash, hashAuthToken(token)),
        eq(authTokens.purpose, MEMBER_INVITE_TOKEN_PURPOSE),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .returning();
  return rows[0] ? inviteRowOf(rows[0]) : null;
}

/** Ждущие (непогашенные, непросроченные) приглашения синтеза — вкладка
 *  «Участники»: адреса без аккаунта, строки участника у них ещё нет. */
export async function listMemberInviteTokens(
  exec: MailDbExecutor,
  synthesisId: string,
  now: Date = new Date(),
): Promise<MemberInviteTokenRow[]> {
  const rows = await exec
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.purpose, MEMBER_INVITE_TOKEN_PURPOSE),
        eq(authTokens.synthesisId, synthesisId),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, now),
      ),
    );
  return rows.map(inviteRowOf).filter((r): r is MemberInviteTokenRow => r !== null);
}

/** Ждущее приглашение по id строки (владелец отзывает / повторяет письмо). */
export async function findMemberInviteToken(
  exec: MailDbExecutor,
  synthesisId: string,
  tokenId: string,
  now: Date = new Date(),
): Promise<MemberInviteTokenRow | null> {
  const [r] = await exec
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.id, tokenId),
        eq(authTokens.purpose, MEMBER_INVITE_TOKEN_PURPOSE),
        eq(authTokens.synthesisId, synthesisId),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, now),
      ),
    )
    .limit(1);
  return r ? inviteRowOf(r) : null;
}

/** Отозвать приглашение: погасить довод (ссылка из письма мертва). */
export async function revokeMemberInviteToken(
  exec: MailDbExecutor,
  tokenId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const rows = await exec
    .update(authTokens)
    .set({ usedAt: now })
    .where(and(eq(authTokens.id, tokenId), eq(authTokens.purpose, MEMBER_INVITE_TOKEN_PURPOSE), isNull(authTokens.usedAt)))
    .returning({ id: authTokens.id });
  return rows.length > 0;
}

export interface MemberInviteMailInput {
  inviter: MailRecipient;
  synthesisId: string;
  synthesisTitle: string;
  email: string;
  role: MemberRole;
}

/**
 * 16.2: довод приглашения + письмо со ссылкой на регистрацию — одним шагом
 * под точкой сохранения (как queueTokenMail). Язык письма — язык ЗАПРОСА:
 * у адресата аккаунта нет, выбора языка тоже (правило 14.1 для регистрации).
 * false — не поставлено (в логе).
 */
export async function queueMemberInviteRegisterMail(
  exec: MailDbExecutor,
  input: MemberInviteMailInput,
): Promise<boolean> {
  const id = await underSavepoint(exec, `письмо-приглашение для ${input.email} не поставлено`, async (sp) => {
    const token = await issueMemberInviteToken(sp, {
      inviterId: input.inviter.id,
      synthesisId: input.synthesisId,
      email: input.email,
      role: input.role,
    });
    const letter = memberInviteRegisterLetter({
      inviterName: input.inviter.displayName?.trim() || input.inviter.email,
      synthesisTitle: input.synthesisTitle,
      role: input.role,
      link: tokenLink(MEMBER_INVITE_TOKEN_PURPOSE, token),
      ttlHours: MEMBER_INVITE_TTL_HOURS,
    });
    return enqueue(sp, { to: input.email, ...letter });
  });
  return id !== null;
}
