/**
 * Участники концепции — управление владельцем и ответ приглашённого
 * (беседа 16.2, первый запрос; врезка «Фаза 16»; 03 §2.18).
 *
 * Правила:
 *   - участники ТОЛЬКО по приглашению владельца (решение пользователя);
 *     право на всё здесь — manage (= владелец, модуль прав 16.1);
 *   - приглашение по email + роль. Аккаунт есть → строка synthesis_members
 *     status 'invited' + письмо со ссылкой на страницу принятия + уведомление
 *     member_invited; аккаунта нет → довод auth_tokens 'member_invite' и
 *     письмо со ссылкой на регистрацию; после регистрации по доводу
 *     (routes/auth register) — строка 'invited' той же концепции;
 *   - приглашение владельца, уже участника или ждущего адреса → 409 CONFLICT;
 *   - принять/отклонить — только сам приглашённый (status 'invited');
 *     отклонение строку удаляет (повторное приглашение возможно);
 *   - отозвать приглашение / сменить роль / исключить — владелец; второй
 *     шаг исключения — на клиенте (useSecondStep), сервер исполняет сразу;
 *   - исключение: строка участника удаляется; комментарии и рецензии
 *     остаются (автор показывается «бывший участник» — вычисляется при
 *     чтении в discussion.ts); открытые предложения Фазы 17 закрываются с
 *     причиной — правило для 17.1 записано в 03 (здесь ещё нечего закрывать);
 *   - письма — шаблонами 14.1 под языком получателя (у адреса без аккаунта
 *     — язык запроса), через mail_outbox под точкой сохранения; сбой письма
 *     действие не отменяет (`sent: false` в ответе);
 *   - mailLimiter — на роуте (письмо порождает каждое приглашение/повтор).
 */
import { and, desc, eq, inArray } from "drizzle-orm";

import { db, schema } from "../db/index.js";
import { env } from "../env.js";
import { runWithLocale } from "../i18n/locale.js";
import { anonymizedEmailFor } from "./account-deletion.js";
import {
  consumeMemberInviteToken,
  findMemberInviteToken,
  listMemberInviteTokens,
  peekMemberInviteToken,
  queueMemberInviteRegisterMail,
  revokeMemberInviteToken,
  type MailRecipient,
} from "./auth-tokens.js";
import { canManageSynthesis } from "./capabilities.js";
import { memberInviteLetter } from "./mail/templates.js";
import { tryEnqueue, type MailDbExecutor } from "./mail/outbox.js";
import { notifySafe } from "./notifications.js";
import { EMAIL_RE } from "@philosynth/shared/constants/auth";
import { isMemberRole, type MemberRole } from "@philosynth/shared/constants/discussion";
import { tl } from "@philosynth/shared/i18n/t";
import type {
  InvitationInfo,
  MemberInviteResult,
  MemberView,
  MembersView,
  MyMembership,
  PendingInvitation,
} from "@philosynth/shared/types/notifications";

const { synthesisMembers, syntheses, users } = schema;

export type MembersErrorCode = "NOT_FOUND" | "FORBIDDEN" | "VALIDATION_ERROR" | "CONFLICT";

export class MembersError extends Error {
  constructor(
    readonly code: MembersErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MembersError";
  }
}

export function membersErrorStatus(code: MembersErrorCode): 400 | 403 | 404 | 409 {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "FORBIDDEN":
      return 403;
    case "CONFLICT":
      return 409;
    default:
      return 400;
  }
}

const notFound = () => new MembersError("NOT_FOUND", tl("server.members.synthesisNotFound", "Концепция не найдена"));
const forbidden = () => new MembersError("FORBIDDEN", tl("server.members.ownerOnly", "Управлять участниками может только владелец концепции"));
const memberNotFound = () => new MembersError("NOT_FOUND", tl("server.members.memberNotFound", "Участник не найден"));
const invitationNotFound = () => new MembersError("NOT_FOUND", tl("server.members.invitationNotFound", "Приглашение не найдено"));

type SynthesisRow = typeof syntheses.$inferSelect;
type MemberRow = typeof synthesisMembers.$inferSelect;

async function loadSynthesis(id: string): Promise<SynthesisRow> {
  const [row] = await db.select().from(syntheses).where(eq(syntheses.id, id)).limit(1);
  if (!row) throw notFound();
  return row;
}

/** Владелец ли управляющий — единственный вопрос модулю прав здесь. */
async function loadManaged(synthesisId: string, userId: string): Promise<SynthesisRow> {
  const row = await loadSynthesis(synthesisId);
  if (!canManageSynthesis(row, userId)) throw forbidden();
  return row;
}

async function loadUser(id: string): Promise<MailRecipient | null> {
  const [u] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName, uiLocale: users.uiLocale })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return u ?? null;
}

const nameOf = (u: { email: string; displayName: string | null }): string => u.displayName?.trim() || u.email;

function parseRole(v: unknown): MemberRole {
  if (!isMemberRole(v))
    throw new MembersError("VALIDATION_ERROR", tl("common.invalidData", "Невалидные данные"), {
      role: tl("server.members.badRole", "Роль — reviewer или editor"),
    });
  return v;
}

function parseEmail(v: unknown): string {
  const email = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email))
    throw new MembersError("VALIDATION_ERROR", tl("common.invalidData", "Невалидные данные"), {
      email: tl("server.routes.auth.invalidEmail", "Невалидный email"),
    });
  return email;
}

/* ── Просмотр ────────────────────────────────────────────────────────── */

async function memberViews(rows: MemberRow[]): Promise<MemberView[]> {
  if (rows.length === 0) return [];
  const us = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, rows.map((r) => r.userId)));
  const byId = new Map(us.map((u) => [u.id, u]));
  return rows.map((r) => {
    const u = byId.get(r.userId);
    const deleted = !u || u.email === anonymizedEmailFor(u.id);
    return {
      id: r.id,
      userId: r.userId,
      email: deleted ? "" : u.email,
      displayName: deleted ? tl("server.discussion.deletedUser", "удалённый пользователь") : nameOf(u),
      role: r.role,
      status: r.status,
      invitedAt: r.createdAt.toISOString(),
      acceptedAt: r.acceptedAt ? r.acceptedAt.toISOString() : null,
    };
  });
}

/** Вкладка «Участники» (владелец): строки участников + ждущие приглашения
 *  адресам без аккаунта. */
export async function listMembers(synthesisId: string, ownerId: string): Promise<MembersView> {
  await loadManaged(synthesisId, ownerId);
  const rows = await db
    .select()
    .from(synthesisMembers)
    .where(eq(synthesisMembers.synthesisId, synthesisId))
    .orderBy(desc(synthesisMembers.createdAt));
  const tokens = await listMemberInviteTokens(db, synthesisId);
  const invitations: PendingInvitation[] = tokens
    .map((t) => ({ id: t.id, email: t.email, role: t.role, createdAt: t.createdAt.toISOString(), expiresAt: t.expiresAt.toISOString() }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { members: await memberViews(rows), invitations };
}

/* ── Приглашение ─────────────────────────────────────────────────────── */

/** Письмо приглашённому с аккаунтом — под его языком; false — не поставлено. */
async function queueInviteLetter(
  exec: MailDbExecutor,
  invitee: MailRecipient,
  inviter: { email: string; displayName: string | null },
  synthesis: SynthesisRow,
  role: MemberRole,
): Promise<boolean> {
  const letter = runWithLocale(invitee.uiLocale, () =>
    memberInviteLetter({
      displayName: invitee.displayName,
      inviterName: nameOf(inviter),
      synthesisTitle: synthesis.title,
      role,
      link: `${env.mail.publicBaseUrl}/invitations/${synthesis.id}`,
    }),
  );
  return (await tryEnqueue(exec, { to: invitee.email, ...letter })) !== null;
}

/**
 * Пригласить адрес с ролью. Аккаунт есть → строка 'invited' + письмо +
 * уведомление; нет → довод + письмо со ссылкой на регистрацию.
 */
export async function inviteMember(
  synthesisId: string,
  ownerId: string,
  body: { email?: unknown; role?: unknown },
): Promise<MemberInviteResult> {
  const synthesis = await loadManaged(synthesisId, ownerId);
  const email = parseEmail(body.email);
  const role = parseRole(body.role);
  const owner = await loadUser(ownerId);
  if (!owner) throw forbidden();
  if (owner.email.toLowerCase() === email)
    throw new MembersError("CONFLICT", tl("server.members.ownerSelf", "Владелец и так участник своей концепции"));

  const [invitee] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName, uiLocale: users.uiLocale })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (invitee && invitee.email !== anonymizedEmailFor(invitee.id)) {
    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: synthesisMembers.id, status: synthesisMembers.status })
        .from(synthesisMembers)
        .where(and(eq(synthesisMembers.synthesisId, synthesisId), eq(synthesisMembers.userId, invitee.id)))
        .limit(1);
      if (existing)
        throw new MembersError(
          "CONFLICT",
          existing.status === "active"
            ? tl("server.members.alreadyMember", "Этот пользователь уже участник концепции")
            : tl("server.members.alreadyInvited", "Этот пользователь уже приглашён — можно повторить письмо"),
        );
      const [row] = await tx
        .insert(synthesisMembers)
        .values({ synthesisId, userId: invitee.id, role, status: "invited", invitedBy: ownerId })
        .returning();
      const sent = await queueInviteLetter(tx, invitee, owner, synthesis, role);
      await notifySafe(tx, {
        type: "member_invited",
        synthesisId,
        actorId: ownerId,
        recipients: [invitee.id],
        refKind: "member",
        refId: row!.id,
        payload: { role },
      });
      const [view] = await memberViews([row!]);
      return { kind: "member", member: view!, sent };
    });
  }

  // аккаунта нет: ждущее приглашение адресу (повтор → 409, как у участника)
  const pending = (await listMemberInviteTokens(db, synthesisId)).find((t) => t.email === email);
  if (pending)
    throw new MembersError("CONFLICT", tl("server.members.alreadyInvitedEmail", "На этот адрес уже отправлено приглашение — можно повторить письмо"));
  return db.transaction(async (tx) => {
    const sent = await queueMemberInviteRegisterMail(tx, {
      inviter: owner,
      synthesisId,
      synthesisTitle: synthesis.title,
      email,
      role,
    });
    const [t] = (await listMemberInviteTokens(tx, synthesisId)).filter((x) => x.email === email);
    if (!t) throw new MembersError("CONFLICT", tl("server.members.inviteFailed", "Приглашение не создано — попробуйте ещё раз"));
    return {
      kind: "invitation",
      invitation: { id: t.id, email: t.email, role: t.role, createdAt: t.createdAt.toISOString(), expiresAt: t.expiresAt.toISOString() },
      sent,
    };
  });
}

async function loadMember(synthesisId: string, memberId: string): Promise<MemberRow> {
  const [row] = await db
    .select()
    .from(synthesisMembers)
    .where(and(eq(synthesisMembers.id, memberId), eq(synthesisMembers.synthesisId, synthesisId)))
    .limit(1);
  if (!row) throw memberNotFound();
  return row;
}

/** Сменить роль участника (любого статуса); та же роль → без записи. */
export async function changeMemberRole(
  synthesisId: string,
  ownerId: string,
  memberId: string,
  body: { role?: unknown },
): Promise<MemberView> {
  await loadManaged(synthesisId, ownerId);
  const role = parseRole(body.role);
  const row = await loadMember(synthesisId, memberId);
  if (row.role === role) return (await memberViews([row]))[0]!;
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(synthesisMembers)
      .set({ role, updatedAt: new Date() })
      .where(eq(synthesisMembers.id, memberId))
      .returning();
    if (updated!.status === "active")
      await notifySafe(tx, {
        type: "member_role_changed",
        synthesisId,
        actorId: ownerId,
        recipients: [updated!.userId],
        refKind: "member",
        refId: memberId,
        payload: { role },
      });
    return (await memberViews([updated!]))[0]!;
  });
}

/**
 * Удалить строку участника: приглашённого — отзыв приглашения (без
 * уведомления: письмо просто перестаёт работать); действующего —
 * исключение с уведомлением member_removed. Комментарии и рецензии
 * остаются («бывший участник» — при чтении).
 */
export async function removeMember(
  synthesisId: string,
  ownerId: string,
  memberId: string,
): Promise<{ ok: true; removed: "invited" | "active" }> {
  await loadManaged(synthesisId, ownerId);
  const row = await loadMember(synthesisId, memberId);
  await db.transaction(async (tx) => {
    await tx.delete(synthesisMembers).where(eq(synthesisMembers.id, memberId));
    if (row.status === "active")
      await notifySafe(tx, {
        type: "member_removed",
        synthesisId,
        actorId: ownerId,
        recipients: [row.userId],
        refKind: "member",
        refId: memberId,
        payload: { role: row.role },
      });
    // Фаза 17 (17.1): здесь же закрыть открытые предложения исключённого с
    // причиной «участник исключён» — правило записано в 03 §2.18.
  });
  return { ok: true, removed: row.status };
}

/** Повторить письмо приглашённому с аккаунтом (status 'invited'). */
export async function resendMemberInvite(
  synthesisId: string,
  ownerId: string,
  memberId: string,
): Promise<{ ok: true; sent: boolean }> {
  const synthesis = await loadManaged(synthesisId, ownerId);
  const row = await loadMember(synthesisId, memberId);
  if (row.status !== "invited")
    throw new MembersError("CONFLICT", tl("server.members.alreadyActive", "Участник уже принял приглашение"));
  const [owner, invitee] = await Promise.all([loadUser(ownerId), loadUser(row.userId)]);
  if (!owner || !invitee || invitee.email === anonymizedEmailFor(invitee.id)) throw memberNotFound();
  const sent = await queueInviteLetter(db, invitee, owner, synthesis, row.role);
  return { ok: true, sent };
}

/** Отозвать ждущее приглашение адресу без аккаунта (довод гасится). */
export async function revokeInvitation(synthesisId: string, ownerId: string, tokenId: string): Promise<{ ok: true }> {
  await loadManaged(synthesisId, ownerId);
  const t = await findMemberInviteToken(db, synthesisId, tokenId);
  if (!t) throw invitationNotFound();
  await revokeMemberInviteToken(db, tokenId);
  return { ok: true };
}

/** Повторить письмо адресу без аккаунта: новый довод (прежний гасится
 *  issueMemberInviteToken), новое письмо. Возвращает новую строку. */
export async function resendInvitation(
  synthesisId: string,
  ownerId: string,
  tokenId: string,
): Promise<{ ok: true; sent: boolean; invitation: PendingInvitation }> {
  const synthesis = await loadManaged(synthesisId, ownerId);
  const t = await findMemberInviteToken(db, synthesisId, tokenId);
  if (!t) throw invitationNotFound();
  const owner = await loadUser(ownerId);
  if (!owner) throw forbidden();
  return db.transaction(async (tx) => {
    const sent = await queueMemberInviteRegisterMail(tx, {
      inviter: owner,
      synthesisId,
      synthesisTitle: synthesis.title,
      email: t.email,
      role: t.role,
    });
    const fresh = (await listMemberInviteTokens(tx, synthesisId)).find((x) => x.email === t.email);
    if (!fresh) throw invitationNotFound();
    return {
      ok: true,
      sent,
      invitation: { id: fresh.id, email: fresh.email, role: fresh.role, createdAt: fresh.createdAt.toISOString(), expiresAt: fresh.expiresAt.toISOString() },
    };
  });
}

/* ── Сторона приглашённого ───────────────────────────────────────────── */

/** Моё участие в концепции (страница принятия): 404 — строки нет. */
export async function myMembership(synthesisId: string, userId: string): Promise<MyMembership> {
  const [row] = await db
    .select()
    .from(synthesisMembers)
    .where(and(eq(synthesisMembers.synthesisId, synthesisId), eq(synthesisMembers.userId, userId)))
    .limit(1);
  if (!row) throw new MembersError("NOT_FOUND", tl("server.members.noInvitation", "Приглашения в эту концепцию у вас нет"));
  const synthesis = await loadSynthesis(synthesisId);
  const owner = await loadUser(synthesis.userId);
  return {
    member: {
      id: row.id,
      role: row.role,
      status: row.status,
      invitedAt: row.createdAt.toISOString(),
      acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    },
    synthesis: {
      id: synthesis.id,
      title: synthesis.title,
      ownerName: owner && owner.email !== anonymizedEmailFor(owner.id) ? nameOf(owner) : tl("server.discussion.deletedUser", "удалённый пользователь"),
    },
  };
}

/** Принять приглашение: 'invited' → 'active'; владельцу — member_accepted. */
export async function acceptInvitation(synthesisId: string, userId: string): Promise<MyMembership> {
  const synthesis = await loadSynthesis(synthesisId);
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(synthesisMembers)
      .set({ status: "active", acceptedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(synthesisMembers.synthesisId, synthesisId),
          eq(synthesisMembers.userId, userId),
          eq(synthesisMembers.status, "invited"),
        ),
      )
      .returning();
    if (rows.length === 0) {
      const [any] = await tx
        .select({ status: synthesisMembers.status })
        .from(synthesisMembers)
        .where(and(eq(synthesisMembers.synthesisId, synthesisId), eq(synthesisMembers.userId, userId)))
        .limit(1);
      if (any) throw new MembersError("CONFLICT", tl("server.members.alreadyAccepted", "Приглашение уже принято"));
      throw new MembersError("NOT_FOUND", tl("server.members.noInvitation", "Приглашения в эту концепцию у вас нет"));
    }
    await notifySafe(tx, {
      type: "member_accepted",
      synthesisId,
      actorId: userId,
      recipients: [synthesis.userId],
      refKind: "member",
      refId: rows[0]!.id,
      payload: { role: rows[0]!.role },
    });
  });
  return myMembership(synthesisId, userId);
}

/** Отклонить приглашение: строка 'invited' удаляется; владельцу — member_declined. */
export async function declineInvitation(synthesisId: string, userId: string): Promise<{ ok: true }> {
  const synthesis = await loadSynthesis(synthesisId);
  await db.transaction(async (tx) => {
    const rows = await tx
      .delete(synthesisMembers)
      .where(
        and(
          eq(synthesisMembers.synthesisId, synthesisId),
          eq(synthesisMembers.userId, userId),
          eq(synthesisMembers.status, "invited"),
        ),
      )
      .returning();
    if (rows.length === 0) {
      const [any] = await tx
        .select({ status: synthesisMembers.status })
        .from(synthesisMembers)
        .where(and(eq(synthesisMembers.synthesisId, synthesisId), eq(synthesisMembers.userId, userId)))
        .limit(1);
      if (any) throw new MembersError("CONFLICT", tl("server.members.cannotDeclineActive", "Приглашение уже принято; выйти из участников может только владелец исключением"));
      throw new MembersError("NOT_FOUND", tl("server.members.noInvitation", "Приглашения в эту концепцию у вас нет"));
    }
    await notifySafe(tx, {
      type: "member_declined",
      synthesisId,
      actorId: userId,
      recipients: [synthesis.userId],
      refKind: "member",
      refId: rows[0]!.id,
      payload: { role: rows[0]!.role },
    });
  });
  return { ok: true };
}

/* ── Довод приглашения при регистрации ───────────────────────────────── */

/** Что показать на /register?invite=…: концепция, роль, адрес, кто зовёт.
 *  null — довод недействителен (просрочен, погашен, отозван). */
export async function invitationInfo(token: string): Promise<InvitationInfo | null> {
  const t = await peekMemberInviteToken(db, token);
  if (!t) return null;
  const [synthesis, inviter] = await Promise.all([
    db.select({ title: syntheses.title }).from(syntheses).where(eq(syntheses.id, t.synthesisId)).limit(1),
    loadUser(t.inviterId),
  ]);
  if (!synthesis[0]) return null;
  return {
    synthesisId: t.synthesisId,
    synthesisTitle: synthesis[0].title,
    role: t.role,
    email: t.email,
    inviterName: inviter && inviter.email !== anonymizedEmailFor(inviter.id) ? nameOf(inviter) : tl("server.discussion.deletedUser", "удалённый пользователь"),
  };
}

/**
 * Регистрация по приглашению (routes/auth register, та же транзакция, что
 * создание пользователя): погасить довод и завести строку 'invited'.
 * Адрес регистрации должен совпадать с адресом приглашения — иначе
 * довод не гасится и участия нет (null). Если владелец тем временем сам
 * пригласил этот аккаунт (строка уже есть) — строка не дублируется.
 */
export async function applyInviteOnRegister(
  exec: MailDbExecutor,
  token: string,
  user: { id: string; email: string },
): Promise<{ synthesisId: string } | null> {
  const peek = await peekMemberInviteToken(exec, token);
  if (!peek || peek.email !== user.email.toLowerCase()) return null;
  const t = await consumeMemberInviteToken(exec, token);
  if (!t) return null;
  const [synthesis] = await exec.select({ userId: syntheses.userId }).from(syntheses).where(eq(syntheses.id, t.synthesisId)).limit(1);
  if (!synthesis) return null;
  // приглашающий мог перестать быть владельцем? владелец не меняется (копия —
  // другой синтез); но синтез мог быть удалён — тогда строки нет (выше).
  await exec
    .insert(synthesisMembers)
    .values({ synthesisId: t.synthesisId, userId: user.id, role: t.role, status: "invited", invitedBy: t.inviterId })
    .onConflictDoNothing({ target: [synthesisMembers.synthesisId, synthesisMembers.userId] });
  return { synthesisId: t.synthesisId };
}

/* ── Каталог «Со мной поделились» ────────────────────────────────────── */

/** Строки участия пользователя (любого статуса), новые первыми. */
export async function listMyMemberships(userId: string): Promise<MemberRow[]> {
  return db
    .select()
    .from(synthesisMembers)
    .where(eq(synthesisMembers.userId, userId))
    .orderBy(desc(synthesisMembers.createdAt));
}
