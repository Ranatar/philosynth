/**
 * Уведомления (беседа 16.2; 02 §2.38–2.39; 03 §2.18).
 *
 * Устройство:
 *   - `notify(exec, event)` — ОДНА точка записи. Событие знает тип, синтез,
 *     актора и получателей; строка пишется каждому получателю, КРОМЕ актора
 *     (своё действие человеку не сообщают) и кроме тех, у кого категория типа
 *     отключена в профиле (`notification_settings.muted_categories`:
 *     отключённая категория не пишется вовсе — ни в колокольчик, ни в
 *     сводку). Пишется исполнителем вызывающего (транзакция действия, как
 *     writeAudit 8.1 и enqueue 9.1), под точкой сохранения: сбой записи
 *     уведомления действие не отменяет.
 *   - фраза в строке НЕ хранится (правило 14.2): только код `type`, ссылки
 *     (синтез, актор, адрес, объект) и параметры (`payload`); клиент собирает
 *     фразу `tl()` на языке интерфейса, сводка по почте — `notificationText`
 *     под языком ПОЛУЧАТЕЛЯ при постановке письма.
 *   - `dedupe_key` — для повторяющихся событий: `finding_outdated` пишется
 *     один раз на (получатель, объект, текущий хэш) — ON CONFLICT DO NOTHING
 *     по частичному уникальному индексу.
 *   - доставка в приложении — опросом (GET /notifications/unread-count, без
 *     WebSocket — решение беседы); по почте — сводкой не чаще раза в
 *     NOTIFY_DIGEST_INTERVAL_HOURS одному получателю, проходом на тике
 *     работника почты (`maybeRunNotificationPasses`, как чистка 15.3).
 *   - «объект моего открытого замечания изменился» (`finding_outdated`)
 *     вычисляется ПРОХОДОМ: мутаций документа много (генерация, правки
 *     элементов и подразделов, трансформации, откаты, импорт), и не все
 *     двигают `syntheses.updated_at`; надёжнее раз в NOTIFY_SCAN_INTERVAL_MS
 *     перебрать синтезы с открытыми корнями комментариев и замечаниями
 *     опубликованных рецензий и сверить их адреса тем же `resolveAddress`,
 *     что читатели 16.1. Решение «По факту 16.2» п.0.
 */
import { and, asc, count, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db, schema } from "../db/index.js";
import { env } from "../env.js";
import { currentLocale, runWithLocale } from "../i18n/locale.js";
import { anonymizedEmailFor } from "./account-deletion.js";
import { loadAddressIndex, resolveAddress } from "./discussion-address.js";
import { notificationDigestLetter, type DigestLine } from "./mail/templates.js";
import { tryEnqueue, type MailDbExecutor } from "./mail/outbox.js";
import { tl } from "@philosynth/shared/i18n/t";
import { tData } from "@philosynth/shared/i18n/data";
import {
  NOTIFICATIONS_PAGE_DEFAULT,
  NOTIFICATIONS_PAGE_MAX,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_OF,
  isNotificationCategory,
  type NotificationCategory,
  type NotificationRefKind,
  type NotificationType,
} from "@philosynth/shared/constants/notifications";
import type { DiscussionAddress } from "@philosynth/shared/types/discussion";
import type {
  Notification,
  NotificationActor,
  NotificationList,
  NotificationPayload,
  NotificationSettings,
} from "@philosynth/shared/types/notifications";
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";

const { notifications, notificationSettings, syntheses, synthesisMembers, users, comments, reviews, reviewFindings } =
  schema;

export type NotifyDbExecutor = MailDbExecutor;

/* ── Запись ──────────────────────────────────────────────────────────── */

export interface NotifyEvent {
  type: NotificationType;
  synthesisId: string;
  /** Кто совершил событие; строки себе не получает. null — служба */
  actorId: string | null;
  /** Кому: id пользователей (повторы и актор отсеиваются) */
  recipients: readonly string[];
  address?: DiscussionAddress | null;
  refKind?: NotificationRefKind | null;
  refId?: string | null;
  payload?: NotificationPayload;
  /** Ключ дедупликации БЕЗ получателя — получатель дописывается */
  dedupeKey?: string | null;
}

/** Отключённые категории получателей одним запросом. */
async function mutedFor(exec: NotifyDbExecutor, userIds: readonly string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (userIds.length === 0) return out;
  const rows = await exec
    .select({ userId: notificationSettings.userId, muted: notificationSettings.mutedCategories })
    .from(notificationSettings)
    .where(inArray(notificationSettings.userId, [...userIds]));
  for (const r of rows) out.set(r.userId, new Set(r.muted ?? []));
  return out;
}

/**
 * Записать событие получателям. Возвращает число записанных строк. Ошибок
 * не глотает — вызывающий решает, под точкой ли сохранения (`notifySafe`).
 */
export async function notify(exec: NotifyDbExecutor, event: NotifyEvent): Promise<number> {
  const category = NOTIFICATION_CATEGORY_OF[event.type];
  const targets = [...new Set(event.recipients)].filter((u) => u && u !== event.actorId);
  if (targets.length === 0) return 0;
  const muted = await mutedFor(exec, targets);
  const rows = targets
    .filter((u) => !muted.get(u)?.has(category))
    .map((userId) => ({
      userId,
      type: event.type,
      synthesisId: event.synthesisId,
      actorId: event.actorId,
      address: event.address ?? null,
      refKind: event.refKind ?? null,
      refId: event.refId ?? null,
      payload: event.payload ?? {},
      dedupeKey: event.dedupeKey ? `${event.dedupeKey}:${userId}` : null,
    }));
  if (rows.length === 0) return 0;
  const inserted = await exec
    .insert(notifications)
    .values(rows)
    .onConflictDoNothing({ target: notifications.dedupeKey, where: sql`${notifications.dedupeKey} IS NOT NULL` })
    .returning({ id: notifications.id });
  return inserted.length;
}

/** notify под точкой сохранения: сбой записи уведомления действие не
 *  отменяет (образец — tryEnqueue 9.1). */
export async function notifySafe(exec: NotifyDbExecutor, event: NotifyEvent): Promise<number> {
  try {
    return await exec.transaction((sp) => notify(sp, event));
  } catch (err) {
    console.error(`[notify] ${event.type} для ${event.synthesisId}: ${(err as Error).message}`);
    return 0;
  }
}

/** Круг получателей событий концепции: владелец и действующие участники. */
export async function participantsOf(
  exec: NotifyDbExecutor,
  synthesisId: string,
): Promise<{ ownerId: string | null; memberIds: string[] }> {
  const [row] = await exec.select({ userId: syntheses.userId }).from(syntheses).where(eq(syntheses.id, synthesisId)).limit(1);
  const members = await exec
    .select({ userId: synthesisMembers.userId })
    .from(synthesisMembers)
    .where(and(eq(synthesisMembers.synthesisId, synthesisId), eq(synthesisMembers.status, "active")));
  return { ownerId: row?.userId ?? null, memberIds: members.map((m) => m.userId) };
}

/** Событие всем участникам концепции (владелец + active), кроме актора. */
export async function notifyParticipants(
  exec: NotifyDbExecutor,
  event: Omit<NotifyEvent, "recipients">,
): Promise<number> {
  const { ownerId, memberIds } = await participantsOf(exec, event.synthesisId);
  const recipients = [...(ownerId ? [ownerId] : []), ...memberIds];
  return notifySafe(exec, { ...event, recipients });
}

/* ── Чтение ──────────────────────────────────────────────────────────── */

type NotificationRow = typeof notifications.$inferSelect;

const deletedUserLabel = (): string => tl("server.discussion.deletedUser", "удалённый пользователь");

async function actorsFor(ids: Iterable<string | null>): Promise<Map<string, NotificationActor>> {
  const uniq = [...new Set([...ids].filter((x): x is string => !!x))];
  const out = new Map<string, NotificationActor>();
  if (uniq.length === 0) return out;
  const rows = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, uniq));
  for (const u of rows) {
    out.set(
      u.id,
      u.email === anonymizedEmailFor(u.id)
        ? { id: null, name: deletedUserLabel() }
        : { id: u.id, name: u.displayName?.trim() || u.email },
    );
  }
  return out;
}

async function toDtos(rows: NotificationRow[]): Promise<Notification[]> {
  if (rows.length === 0) return [];
  const sids = [...new Set(rows.map((r) => r.synthesisId))];
  const [titles, actors] = await Promise.all([
    db.select({ id: syntheses.id, title: syntheses.title }).from(syntheses).where(inArray(syntheses.id, sids)),
    actorsFor(rows.map((r) => r.actorId)),
  ]);
  const titleOf = new Map(titles.map((t) => [t.id, t.title]));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    category: NOTIFICATION_CATEGORY_OF[r.type],
    synthesisId: r.synthesisId,
    synthesisTitle: titleOf.get(r.synthesisId) ?? "",
    actor: r.actorId ? (actors.get(r.actorId) ?? { id: null, name: deletedUserLabel() }) : null,
    address: r.address ?? null,
    refKind: r.refKind ?? null,
    refId: r.refId ?? null,
    payload: r.payload ?? {},
    readAt: r.readAt ? r.readAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface NotificationListQuery {
  unreadOnly?: boolean;
  limit?: number;
  /** id последней строки прежней страницы (новые первыми) */
  cursor?: string | null;
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.n ?? 0);
}

/** Список уведомлений получателя, новые первыми, курсор — id последней
 *  строки (сравнение кортежем (created_at, id) в PG — урок 16.1 §3). */
export async function listNotifications(userId: string, q: NotificationListQuery = {}): Promise<NotificationList> {
  const limit = Math.max(1, Math.min(NOTIFICATIONS_PAGE_MAX, q.limit ?? NOTIFICATIONS_PAGE_DEFAULT));
  const conds = [eq(notifications.userId, userId)];
  if (q.unreadOnly) conds.push(isNull(notifications.readAt));
  if (q.cursor) {
    conds.push(
      sql`(${notifications.createdAt}, ${notifications.id}) < (select n.created_at, n.id from notifications n where n.id = ${q.cursor} and n.user_id = ${userId})`,
    );
  }
  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const items = await toDtos(page);
  return {
    items,
    unread: await unreadCount(userId),
    nextCursor: rows.length > limit && page.length > 0 ? page[page.length - 1]!.id : null,
  };
}

/** Пометить прочитанным одну строку СВОЮ; чужой или несуществующий id → null. */
export async function markRead(userId: string, id: string): Promise<Notification | null> {
  const rows = await db
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning();
  const [dto] = await toDtos(rows);
  return dto ?? null;
}

/** «Прочитать всё»: число помеченных. */
export async function markAllRead(userId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length;
}

/* ── Настройки ───────────────────────────────────────────────────────── */

function settingsDto(row: typeof notificationSettings.$inferSelect | undefined): NotificationSettings {
  return {
    mutedCategories: (row?.mutedCategories ?? []).filter(isNotificationCategory),
    emailDigest: row?.emailDigest ?? true,
  };
}

export async function getSettings(userId: string): Promise<NotificationSettings> {
  const [row] = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId)).limit(1);
  return settingsDto(row);
}

export class NotificationSettingsError extends Error {
  constructor(
    public readonly details: Record<string, string>,
    message: string,
  ) {
    super(message);
    this.name = "NotificationSettingsError";
  }
}

/** PATCH настроек: категории — только из закрытого списка (иначе 400 с
 *  details.mutedCategories); строка заводится при первой правке. */
export async function updateSettings(
  userId: string,
  patch: { mutedCategories?: unknown; emailDigest?: unknown },
): Promise<NotificationSettings> {
  const set: Partial<typeof notificationSettings.$inferInsert> = { updatedAt: new Date() };
  if (patch.mutedCategories !== undefined) {
    if (!Array.isArray(patch.mutedCategories) || !patch.mutedCategories.every(isNotificationCategory))
      throw new NotificationSettingsError(
        { mutedCategories: tl("server.notifications.badCategory", "Допустимы только: {list}", { list: NOTIFICATION_CATEGORIES.join(", ") }) },
        tl("common.invalidData", "Невалидные данные"),
      );
    set.mutedCategories = [...new Set(patch.mutedCategories as NotificationCategory[])];
  }
  if (patch.emailDigest !== undefined) {
    if (typeof patch.emailDigest !== "boolean")
      throw new NotificationSettingsError(
        { emailDigest: tl("server.notifications.mustBeBoolean", "Должно быть true или false") },
        tl("common.invalidData", "Невалидные данные"),
      );
    set.emailDigest = patch.emailDigest;
  }
  if (set.mutedCategories === undefined && set.emailDigest === undefined)
    throw new NotificationSettingsError(
      { mutedCategories: tl("server.notifications.nothingToChange", "Нечего менять") },
      tl("common.invalidData", "Невалидные данные"),
    );
  const [row] = await db
    .insert(notificationSettings)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: notificationSettings.userId, set })
    .returning();
  return settingsDto(row);
}

/* ── Фраза уведомления на языке получателя (сводка по почте) ───────────── */

function addressLabel(addr: DiscussionAddress | null): string {
  if (!addr) return "";
  switch (addr.kind) {
    case "section":
      return tData(KEY_LABELS[addr.key as keyof typeof KEY_LABELS] ?? addr.key);
    case "synthesis":
      return tl("server.notifications.addrSynthesis", "концепция в целом");
    default:
      return addr.key;
  }
}

/** Фраза уведомления на текущем языке контекста (сводка — runWithLocale
 *  получателя). Тексты пользователей (`payload.excerpt`) не переводятся. */
export function notificationText(n: Notification): string {
  const who = n.actor?.name ?? tl("server.notifications.someone", "кто-то");
  const title = n.synthesisTitle;
  const role = n.payload.role
    ? n.payload.role === "editor"
      ? tl("server.mail.templates.roleEditor", "редактор")
      : tl("server.mail.templates.roleReviewer", "рецензент")
    : "";
  const excerpt = n.payload.excerpt ? ` «${n.payload.excerpt}»` : "";
  switch (n.type) {
    case "member_invited":
      return tl("server.notifications.memberInvited", "{who} приглашает вас в концепцию «{title}» в роли «{role}»", { who, title, role });
    case "member_accepted":
      return tl("server.notifications.memberAccepted", "{who} принял приглашение в концепцию «{title}»", { who, title });
    case "member_declined":
      return tl("server.notifications.memberDeclined", "{who} отклонил приглашение в концепцию «{title}»", { who, title });
    case "member_role_changed":
      return tl("server.notifications.memberRoleChanged", "Ваша роль в концепции «{title}» теперь «{role}»", { title, role });
    case "member_removed":
      return tl("server.notifications.memberRemoved", "Вы исключены из участников концепции «{title}»", { title });
    case "comment_new":
      return tl("server.notifications.commentNew", "{who} оставил комментарий к «{addr}» в концепции «{title}»{excerpt}", { who, addr: addressLabel(n.address), title, excerpt });
    case "comment_reply":
      return tl("server.notifications.commentReply", "{who} ответил в вашей ветке в концепции «{title}»{excerpt}", { who, title, excerpt });
    case "review_published":
      return tl("server.notifications.reviewPublished", "{who} опубликовал рецензию на концепцию «{title}»{excerpt}", { who, title, excerpt });
    case "finding_outdated":
      return tl("server.notifications.findingOutdated", "Объект «{addr}» вашего замечания в концепции «{title}» изменился", { addr: addressLabel(n.address), title });
    case "proposal_created":
      return tl("server.notifications.proposalCreated", "{who} предложил изменение в концепции «{title}»", { who, title });
    case "proposal_decided":
      return tl("server.notifications.proposalDecided", "По вашему предложению в концепции «{title}» принято решение", { title });
  }
}

/* ── Проход: объекты открытых замечаний изменились ─────────────────────── */

export interface OutdatedScanResult {
  syntheses: number;
  checked: number;
  notified: number;
}

/**
 * Сверить адреса открытых корней комментариев и замечаний опубликованных
 * рецензий с живым документом; у `outdated` — уведомление автору
 * (участнику) один раз на текущий хэш (dedupe). `onlySynthesisIds` —
 * для проверок на общей базе.
 */
export async function scanOutdatedAddresses(opts: { onlySynthesisIds?: readonly string[] } = {}): Promise<OutdatedScanResult> {
  const only = opts.onlySynthesisIds ? inArray(comments.synthesisId, [...opts.onlySynthesisIds]) : undefined;
  const onlyF = opts.onlySynthesisIds ? inArray(reviewFindings.synthesisId, [...opts.onlySynthesisIds]) : undefined;
  const openRoots = await db
    .select({
      synthesisId: comments.synthesisId,
      id: comments.id,
      authorId: comments.authorId,
      address: comments.address,
      excerpt: comments.excerpt,
    })
    .from(comments)
    .where(
      and(
        isNull(comments.parentId),
        isNull(comments.deletedAt),
        eq(comments.status, "open"),
        sql`${comments.authorId} IS NOT NULL`,
        sql`${comments.address}->>'kind' <> 'synthesis'`,
        ...(only ? [only] : []),
      ),
    );
  const findings = await db
    .select({
      synthesisId: reviewFindings.synthesisId,
      id: reviewFindings.id,
      authorId: reviews.authorId,
      address: reviewFindings.address,
      excerpt: reviewFindings.excerpt,
    })
    .from(reviewFindings)
    .innerJoin(reviews, eq(reviews.id, reviewFindings.reviewId))
    .where(
      and(
        eq(reviews.status, "published"),
        sql`${reviews.authorId} IS NOT NULL`,
        sql`${reviewFindings.address}->>'kind' <> 'synthesis'`,
        ...(onlyF ? [onlyF] : []),
      ),
    );
  type Item = { id: string; authorId: string | null; address: DiscussionAddress; excerpt: string; refKind: NotificationRefKind };
  const bySynth = new Map<string, Item[]>();
  const push = (sid: string, item: Item) => {
    const list = bySynth.get(sid) ?? [];
    list.push(item);
    bySynth.set(sid, list);
  };
  for (const r of openRoots) push(r.synthesisId, { id: r.id, authorId: r.authorId, address: r.address, excerpt: r.excerpt, refKind: "comment" });
  for (const f of findings) push(f.synthesisId, { id: f.id, authorId: f.authorId, address: f.address, excerpt: f.excerpt, refKind: "finding" });

  const result: OutdatedScanResult = { syntheses: bySynth.size, checked: 0, notified: 0 };
  for (const [sid, items] of bySynth) {
    const { ownerId, memberIds } = await participantsOf(db, sid);
    const circle = new Set([...(ownerId ? [ownerId] : []), ...memberIds]);
    const index = await loadAddressIndex(sid);
    for (const it of items) {
      result.checked++;
      if (!it.authorId || !circle.has(it.authorId)) continue; // бывший участник уведомлений не получает
      const res = await resolveAddress(index, it.address);
      if (res.state !== "outdated" || !res.currentHash) continue;
      result.notified += await notifySafe(db, {
        type: "finding_outdated",
        synthesisId: sid,
        actorId: null,
        recipients: [it.authorId],
        address: it.address,
        refKind: it.refKind,
        refId: it.id,
        payload: it.excerpt ? { excerpt: it.excerpt.slice(0, 80) } : {},
        dedupeKey: `outdated:${it.refKind}:${it.id}:${res.currentHash}`,
      });
    }
  }
  return result;
}

/* ── Проход: сводка по почте ─────────────────────────────────────────── */

export interface DigestResult {
  recipients: number;
  queued: number;
}

/** Строк в письме сводки; остальное — «…и ещё N». */
export const DIGEST_MAX_LINES = 20;

/**
 * Сводка непрочитанного по почте: получатели — у кого есть непрочитанное,
 * ещё не вошедшее в сводку (`emailed_at IS NULL`), сводка не отключена и
 * прошло ≥ интервала с прежней. Письмо собирается под языком получателя;
 * строки помечаются `emailed_at` той же транзакцией, что и постановка
 * письма (повторно в сводку не попадают). Интервал 0 — сводок нет.
 */
export async function runNotificationDigest(opts: { now?: Date; intervalHours?: number } = {}): Promise<DigestResult> {
  const hours = opts.intervalHours ?? env.notify.digestIntervalHours;
  const result: DigestResult = { recipients: 0, queued: 0 };
  if (!(hours > 0)) return result;
  const now = opts.now ?? new Date();
  const threshold = new Date(now.getTime() - hours * 3_600_000);
  const candidates = await db
    .selectDistinct({ userId: notifications.userId })
    .from(notifications)
    .leftJoin(notificationSettings, eq(notificationSettings.userId, notifications.userId))
    .where(
      and(
        isNull(notifications.readAt),
        isNull(notifications.emailedAt),
        or(isNull(notificationSettings.userId), eq(notificationSettings.emailDigest, true)),
        or(isNull(notificationSettings.digestSentAt), lt(notificationSettings.digestSentAt, threshold)),
      ),
    );
  for (const { userId } of candidates) {
    const [u] = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName, uiLocale: users.uiLocale })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!u || u.email === anonymizedEmailFor(u.id)) continue;
    const settings = await getSettings(userId);
    const muted = new Set(settings.mutedCategories);
    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), isNull(notifications.emailedAt)))
      .orderBy(asc(notifications.createdAt));
    // отключённые категории: в сводку не входят (и помечаются как вошедшие —
    // иначе одна отключённая строка держала бы получателя кандидатом вечно)
    const dtos = (await toDtos(rows)).filter((n) => !muted.has(n.category));
    const ids = rows.map((r) => r.id);
    if (dtos.length === 0) {
      if (ids.length)
        await db.update(notifications).set({ emailedAt: now }).where(inArray(notifications.id, ids));
      continue;
    }
    result.recipients++;
    const lines: DigestLine[] = runWithLocale(u.uiLocale ?? currentLocale(), () =>
      dtos.slice(0, DIGEST_MAX_LINES).map((n) => ({ text: notificationText(n), link: `${env.mail.publicBaseUrl}/synthesis/${n.synthesisId}` })),
    );
    const letter = runWithLocale(u.uiLocale ?? currentLocale(), () =>
      notificationDigestLetter({
        displayName: u.displayName,
        lines,
        unreadTotal: dtos.length,
        link: `${env.mail.publicBaseUrl}/notifications`,
      }),
    );
    await db.transaction(async (tx) => {
      const id = await tryEnqueue(tx, { to: u.email, ...letter });
      if (id === null) return;
      await tx.update(notifications).set({ emailedAt: now }).where(inArray(notifications.id, ids));
      await tx
        .insert(notificationSettings)
        .values({ userId, digestSentAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: notificationSettings.userId, set: { digestSentAt: now, updatedAt: now } });
      result.queued++;
    });
  }
  return result;
}

/* ── Планирование на тике работника почты ───────────────────────────── */

let lastPassAt = 0;

/** Пора ли проходу уведомлений (как maintenanceDue 15.3). */
export function notifyPassDue(lastAt: number, now: number, intervalMs: number = env.notify.scanIntervalMs): boolean {
  return now - lastAt >= Math.max(1_000, intervalMs);
}

/** Один проход: сверка адресов → сводки. Fail-open; зовёт работник. */
export async function runNotificationPasses(): Promise<{ scan: OutdatedScanResult; digest: DigestResult }> {
  const scan = await scanOutdatedAddresses();
  const digest = await runNotificationDigest();
  return { scan, digest };
}

export async function maybeRunNotificationPasses(now: number = Date.now()): Promise<void> {
  if (!notifyPassDue(lastPassAt, now)) return;
  lastPassAt = now;
  try {
    const r = await runNotificationPasses();
    if (r.scan.notified || r.digest.queued)
      console.log(`[notify] проход: устаревших адресов ${r.scan.notified}, сводок ${r.digest.queued}`);
  } catch (err) {
    console.error("[notify] проход уведомлений:", (err as Error).message);
  }
}
