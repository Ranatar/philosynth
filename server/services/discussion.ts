/**
 * Обсуждение и рецензии — сервис (беседа 16.1; врезка «Фаза 16» в 07;
 * 02 §2.34–2.37, 03 §2.17). Документ НИЧЕМ отсюда не меняется: ни одна
 * функция не пишет в sections / capsule_html / гранулярные таблицы.
 *
 * Права решает вызывающий роут через модуль прав (capabilities: discuss —
 * участник или владелец; manage — владелец) и передаёт их сюда; сервис
 * проверяет лишь то, что зависит от строки (автор ли это, корень ли ветки,
 * черновик ли). Автор сравнивается с id пользователя — это не «владелец
 * ли синтеза» (тот вопрос — только capabilities; здесь он задаётся через
 * canManageSynthesis для пометки isOwner у автора).
 *
 * Тексты — обычный текст (`plainText`): HTML не разбирается и не чистится,
 * экранирует показ клиент; нового входа разметки после 13.1 нет (сторож 4bm
 * проверяет, что модуль не импортирует html-parser/санитайзер).
 *
 * Адреса: при создании — `findTarget` → `addressOf` (хэш, выдержка,
 * версия на момент записи); при чтении — `resolveAddress` против индекса
 * концепции, построенного один раз на запрос (current / outdated / deleted
 * вычисляется, не хранится). Ответ в ветке наследует адрес корня.
 *
 * Комментарий, удалённый автором, не исчезает из ветки, пока у него есть
 * ответы: тело стирается, строка остаётся заглушкой (deleted_at); без
 * ответов строка удаляется физически. Скрытый владельцем (status 'hidden')
 * виден всем как «скрыто владельцем», тело — только владельцу и автору.
 *
 * Рецензия: черновик (виден только автору) → publish (редакция 1 —
 * снимок полей, версии документа и замечаний) → правка опубликованной
 * (полей или замечаний) = новая редакция, прежняя сохраняется → withdraw
 * (остаётся видимой с пометкой). Версия документа — четыре числа
 * syntheses.version_* на момент создания, обновляются при публикации.
 *
 * Удалённый аккаунт (7.1 анонимизирует строку users) показывается как
 * «удалённый пользователь» (id null, deleted true) — фраза на языке запроса.
 */
import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db, schema } from "../db/index.js";
import { anonymizedEmailFor } from "./account-deletion.js";
import { canManageSynthesis } from "./capabilities.js";
import { notifyParticipants, notifySafe, participantsOf } from "./notifications.js"; // 16.2
import {
  addressOf,
  findTarget,
  loadAddressIndex,
  objectBelongs,
  resolveAddress,
  type AddressIndex,
} from "./discussion-address.js";

import {
  COMMENTS_PAGE_DEFAULT,
  COMMENTS_PAGE_MAX,
  COMMENT_BODY_MAX,
  FINDING_BODY_MAX,
  REVIEW_FIELD_MAX,
  REVIEW_TEXT_FIELDS,
  REVIEW_TITLE_MAX,
  isAddressKind,
  isCommentKind,
  isCommentStatus,
  type AddressKind,
  type CommentKind,
  type CommentStatus,
} from "@philosynth/shared/constants/discussion";
import type {
  AddressCounts,
  AddressResolution,
  AddressTarget,
  Capabilities,
  Comment,
  CommentCreateInput,
  CommentList,
  CommentListQuery,
  CommentUpdateInput,
  DiscussionAddress,
  DiscussionAuthor,
  DiscussionSummary,
  FindingCreateInput,
  FindingUpdateInput,
  Review,
  ReviewDocVersion,
  ReviewFields,
  ReviewFinding,
  ReviewRevision,
  ReviewUpsertInput,
} from "@philosynth/shared/types/discussion";
import { isDiscussionAddress, plainText } from "@philosynth/shared/utils/discussion-address";
import { tl } from "@philosynth/shared/i18n/t";

const { comments, reviewFindings, reviewRevisions, reviews, syntheses, synthesisMembers, users } = schema;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CommentRow = typeof comments.$inferSelect;
type ReviewRow = typeof reviews.$inferSelect;
type FindingRow = typeof reviewFindings.$inferSelect;

/* ── Ошибки ──────────────────────────────────────────────────────────── */

export type DiscussionErrorCode = "NOT_FOUND" | "FORBIDDEN" | "VALIDATION_ERROR" | "CONFLICT";

export class DiscussionError extends Error {
  constructor(
    readonly code: DiscussionErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DiscussionError";
  }
}

export function discussionErrorStatus(code: DiscussionErrorCode): 400 | 403 | 404 | 409 {
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

const notFound = (what: string) =>
  new DiscussionError("NOT_FOUND", tl("server.discussion.notFound", "{what} не найден", { what }));
const forbidden = (msg: string) => new DiscussionError("FORBIDDEN", msg);

/* ── Смотрящий ───────────────────────────────────────────────────────── */

/** Кто читает: id пользователя и его права на синтез (из роута). */
export interface DiscussionViewer {
  userId: string;
  capabilities: Capabilities;
}

/* ── Авторы ──────────────────────────────────────────────────────────── */

const deletedUserLabel = (): string => tl("server.discussion.deletedUser", "удалённый пользователь");

/** 7.1: удалённый аккаунт — анонимизированная строка users. */
export function isAnonymizedUser(u: { id: string; email: string }): boolean {
  return u.email === anonymizedEmailFor(u.id);
}

async function loadAuthors(ids: Iterable<string | null>): Promise<Map<string, DiscussionAuthor>> {
  const uniq = [...new Set([...ids].filter((x): x is string => !!x))];
  const out = new Map<string, DiscussionAuthor>();
  if (uniq.length === 0) return out;
  const rows = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, uniq));
  for (const u of rows) {
    if (isAnonymizedUser(u)) {
      out.set(u.id, { id: null, name: deletedUserLabel(), deleted: true, isOwner: false, formerMember: false });
    } else {
      out.set(u.id, {
        id: u.id,
        name: u.displayName?.trim() || u.email,
        deleted: false,
        isOwner: false,
        formerMember: false,
      });
    }
  }
  return out;
}

/** 16.2: действующие участники синтеза (для пометки «бывший участник»). */
async function activeMemberIds(synthesisId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: synthesisMembers.userId })
    .from(synthesisMembers)
    .where(and(eq(synthesisMembers.synthesisId, synthesisId), eq(synthesisMembers.status, "active")));
  return new Set(rows.map((r) => r.userId));
}

function authorDto(
  authorId: string | null,
  map: Map<string, DiscussionAuthor>,
  ownerId: string,
  active: Set<string>,
): DiscussionAuthor {
  const base = (authorId && map.get(authorId)) || {
    id: null,
    name: deletedUserLabel(),
    deleted: true,
    isOwner: false,
    formerMember: false,
  };
  // «автор — владелец» решает модуль прав, не сравнение здесь
  const isOwner = base.id !== null && canManageSynthesis({ userId: ownerId }, base.id);
  // 16.2: не владелец и не действующий участник → «бывший участник»
  // (исключён владельцем либо отклонил приглашение после записи)
  return { ...base, isOwner, formerMember: base.id !== null && !isOwner && !active.has(base.id) };
}

/* ── Общее ───────────────────────────────────────────────────────────── */

async function loadSynthesisRow(synthesisId: string) {
  const [row] = await db
    .select({
      id: syntheses.id,
      userId: syntheses.userId,
      versionBase: syntheses.versionBase,
      versionSub: syntheses.versionSub,
      versionModes: syntheses.versionModes,
      versionModeRegen: syntheses.versionModeRegen,
    })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  if (!row) throw notFound(tl("server.discussion.synthesis", "Синтез"));
  return row;
}

function docVersionOf(row: {
  versionBase: number;
  versionSub: number;
  versionModes: number;
  versionModeRegen: number;
}): ReviewDocVersion {
  return { base: row.versionBase, sub: row.versionSub, modes: row.versionModes, modeRegen: row.versionModeRegen };
}

function cleanBody(raw: unknown, field: string, max: number, required: boolean): string {
  if (raw === undefined || raw === null) {
    if (required)
      throw new DiscussionError("VALIDATION_ERROR", tl("server.discussion.textRequired", "Нужен текст"), {
        [field]: tl("server.discussion.requiredField", "обязательное поле"),
      });
    return "";
  }
  if (typeof raw !== "string")
    throw new DiscussionError("VALIDATION_ERROR", tl("server.discussion.textExpected", "Ожидается текст"), {
      [field]: tl("server.discussion.stringExpected", "строка"),
    });
  const text = plainText(raw);
  if (required && !text)
    throw new DiscussionError("VALIDATION_ERROR", tl("server.discussion.textRequired", "Нужен текст"), {
      [field]: tl("server.discussion.requiredField", "обязательное поле"),
    });
  if (text.length > max)
    throw new DiscussionError("VALIDATION_ERROR", tl("server.discussion.textTooLong", "Текст длиннее {max} символов", { max: String(max) }), {
      [field]: tl("server.discussion.maxLength", "не длиннее {max} символов", { max: String(max) }),
    });
  return text;
}

function cleanKind(raw: unknown): CommentKind | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (!isCommentKind(raw))
    throw new DiscussionError("VALIDATION_ERROR", tl("server.discussion.kindInvalid", "Неизвестный вид замечания"), {
      kind: tl("server.discussion.kindAllowed", "question | objection | source | unclear | null"),
    });
  return raw;
}

function cleanTarget(raw: unknown): AddressTarget {
  const t = (raw ?? {}) as Record<string, unknown>;
  if (!isAddressKind(t["kind"]))
    throw new DiscussionError("VALIDATION_ERROR", tl("server.discussion.targetKindInvalid", "Неизвестный вид адреса"), {
      target: tl("server.discussion.targetShape", "{ kind: synthesis | section | subsection | category | edge | thesis | glossary_term, id?, key? }"),
    });
  const out: AddressTarget = { kind: t["kind"] };
  if (typeof t["id"] === "string" && t["id"]) out.id = t["id"];
  if (typeof t["key"] === "string" && t["key"]) out.key = t["key"];
  if (out.kind !== "synthesis" && !out.id && !out.key)
    throw new DiscussionError("VALIDATION_ERROR", tl("server.discussion.targetNeedsIdOrKey", "Адресу нужен id или ключ объекта"), {
      target: tl("server.discussion.targetIdOrKey", "id либо key"),
    });
  return out;
}

/** Цель → адрес и выдержка; объекта нет → 404. Чужой id (другого синтеза)
 *  индексом не найдётся — адрес строится только из объектов этой концепции. */
async function resolveTarget(index: AddressIndex, raw: unknown): Promise<{ address: DiscussionAddress; excerpt: string }> {
  const target = cleanTarget(raw);
  const obj = findTarget(index, target);
  if (!obj) {
    if (target.id && !(await objectBelongs(target.kind, target.id, index.synthesisId)))
      throw notFound(tl("server.discussion.addressObject", "Объект адреса"));
    throw notFound(tl("server.discussion.addressObject", "Объект адреса"));
  }
  return addressOf(index, obj);
}

function addressFromRow(raw: unknown): DiscussionAddress {
  if (isDiscussionAddress(raw)) return raw;
  // форма неизвестна (строку могла записать более новая версия) — считаем удалённым
  return { kind: "synthesis", key: "", id: null, hash: "?", version: null };
}

async function resolutionsFor(
  index: AddressIndex,
  rows: Iterable<{ address: unknown }>,
): Promise<Map<unknown, AddressResolution>> {
  const out = new Map<unknown, AddressResolution>();
  for (const r of rows) {
    if (out.has(r.address)) continue;
    out.set(r.address, await resolveAddress(index, addressFromRow(r.address)));
  }
  return out;
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/* ══ Комментарии ═══════════════════════════════════════════════════════ */

function commentDto(
  r: CommentRow,
  ctx: {
    authors: Map<string, DiscussionAuthor>;
    ownerId: string;
    active: Set<string>;
    resolution: AddressResolution;
    replyCount: number;
    viewer: DiscussionViewer;
  },
): Comment {
  const hidden = r.status === "hidden";
  const deleted = r.deletedAt !== null;
  const mayReadHidden = ctx.viewer.capabilities.manage || r.authorId === ctx.viewer.userId;
  return {
    id: r.id,
    synthesisId: r.synthesisId,
    author: authorDto(r.authorId, ctx.authors, ctx.ownerId, ctx.active),
    address: addressFromRow(r.address),
    excerpt: r.excerpt,
    resolution: ctx.resolution,
    parentId: r.parentId,
    kind: r.kind,
    body: deleted || (hidden && !mayReadHidden) ? "" : r.body,
    status: r.status,
    hidden,
    deleted,
    edited: r.editedAt !== null,
    replyCount: ctx.replyCount,
    resolvedAt: iso(r.resolvedAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function replyCounts(rootIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (rootIds.length === 0) return out;
  const rows = await db
    .select({ parentId: comments.parentId, n: count() })
    .from(comments)
    .where(and(inArray(comments.parentId, rootIds), isNull(comments.deletedAt)))
    .groupBy(comments.parentId);
  for (const r of rows) if (r.parentId) out.set(r.parentId, Number(r.n));
  return out;
}

async function toComments(
  synthesisId: string,
  rows: CommentRow[],
  viewer: DiscussionViewer,
  index?: AddressIndex,
): Promise<Comment[]> {
  if (rows.length === 0) return [];
  const idx = index ?? (await loadAddressIndex(synthesisId));
  const synth = await loadSynthesisRow(synthesisId);
  const [authors, res, replies, active] = await Promise.all([
    loadAuthors(rows.map((r) => r.authorId)),
    resolutionsFor(idx, rows),
    replyCounts(rows.filter((r) => r.parentId === null).map((r) => r.id)),
    activeMemberIds(synthesisId),
  ]);
  return rows.map((r) =>
    commentDto(r, {
      authors,
      ownerId: synth.userId,
      active,
      resolution: res.get(r.address) as AddressResolution,
      replyCount: replies.get(r.id) ?? 0,
      viewer,
    }),
  );
}

/** Курсор — id последней строки страницы: сравнение (created_at, id) идёт
 *  в PG по строке с микросекундами (JS Date режет до миллисекунд — такой
 *  курсор повторял бы последнюю строку). */
const encodeCursor = (id: string): string => Buffer.from(id, "utf8").toString("base64url");
function decodeCursor(cur: string): string | null {
  try {
    const s = Buffer.from(cur, "base64url").toString("utf8");
    return /^[0-9a-f-]{36}$/.test(s) ? s : null;
  } catch {
    return null;
  }
}

/** Разбор строки запроса списка (роут передаёт как есть). */
export function parseCommentListQuery(q: Record<string, string | undefined>): CommentListQuery {
  const out: CommentListQuery = {};
  const details: Record<string, string> = {};
  if (q["kind"] !== undefined) {
    if (!isAddressKind(q["kind"])) details["kind"] = tl("server.discussion.targetKindInvalid", "Неизвестный вид адреса");
    else out.kind = q["kind"];
  }
  if (q["key"] !== undefined) out.key = q["key"];
  if (q["status"] !== undefined) {
    if (!isCommentStatus(q["status"])) details["status"] = tl("server.discussion.statusAllowed", "open | resolved | hidden");
    else out.status = q["status"];
  }
  if (q["author"] !== undefined) out.author = q["author"];
  if (q["cursor"] !== undefined) out.cursor = q["cursor"];
  if (q["limit"] !== undefined) {
    const n = Number(q["limit"]);
    if (!Number.isInteger(n) || n < 1 || n > COMMENTS_PAGE_MAX)
      details["limit"] = tl("server.discussion.limitRange", "целое от 1 до {max}", { max: String(COMMENTS_PAGE_MAX) });
    else out.limit = n;
  }
  if (Object.keys(details).length)
    throw new DiscussionError("VALIDATION_ERROR", tl("server.discussion.invalidQuery", "Неверные параметры запроса"), details);
  return out;
}

/**
 * Список комментариев концепции: плоский, по времени создания (клиент
 * собирает ветки по parentId); фильтры — адрес (kind + key), статус, автор;
 * страница — курсор. Удалённые автором без ответов не отдаются.
 */
export async function listComments(
  synthesisId: string,
  q: CommentListQuery,
  viewer: DiscussionViewer,
): Promise<CommentList> {
  const limit = q.limit ?? COMMENTS_PAGE_DEFAULT;
  const conds = [eq(comments.synthesisId, synthesisId)];
  if (q.kind) conds.push(eq(comments.addressKind, q.kind));
  if (q.key !== undefined) conds.push(eq(comments.addressKey, q.key));
  if (q.status) conds.push(eq(comments.status, q.status));
  if (q.author) conds.push(eq(comments.authorId, q.author));
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    if (!c)
      throw new DiscussionError("VALIDATION_ERROR", tl("server.discussion.cursorInvalid", "Негодный курсор"), { cursor: "cursor" });
    conds.push(
      sql`(${comments.createdAt}, ${comments.id}) > (select k.created_at, k.id from ${comments} k where k.id = ${c}::uuid)`,
    );
  }
  // удалённый автором без ответов — не показывается
  conds.push(
    or(
      isNull(comments.deletedAt),
      sql`exists (select 1 from ${comments} r where r.parent_id = ${comments.id} and r.deleted_at is null)`,
    )!,
  );
  const rows = await db
    .select()
    .from(comments)
    .where(and(...conds))
    .orderBy(asc(comments.createdAt), asc(comments.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    comments: await toComments(synthesisId, page, viewer),
    nextCursor: rows.length > limit && last ? encodeCursor(last.id) : null,
  };
}

async function loadComment(synthesisId: string, commentId: string): Promise<CommentRow> {
  const [row] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.synthesisId, synthesisId)))
    .limit(1);
  if (!row) throw notFound(tl("server.discussion.comment", "Комментарий"));
  return row;
}

/** Один комментарий (DTO) — после правок. */
export async function getComment(synthesisId: string, commentId: string, viewer: DiscussionViewer): Promise<Comment> {
  const row = await loadComment(synthesisId, commentId);
  const [dto] = await toComments(synthesisId, [row], viewer);
  return dto as Comment;
}

/** Создание комментария (корень по цели) или ответа (parentId — корень). */
export async function createComment(
  synthesisId: string,
  viewer: DiscussionViewer,
  input: CommentCreateInput,
): Promise<Comment> {
  const body = cleanBody(input.body, "body", COMMENT_BODY_MAX, true);
  const kind = cleanKind(input.kind);
  let address: DiscussionAddress;
  let excerpt: string;
  let parentId: string | null = null;
  const index = await loadAddressIndex(synthesisId);
  if (input.parentId !== undefined && input.parentId !== null) {
    if (typeof input.parentId !== "string")
      throw new DiscussionError("VALIDATION_ERROR", tl("server.discussion.parentInvalid", "parentId должен быть id корневого комментария"), { parentId: "uuid" });
    const root = await loadComment(synthesisId, input.parentId);
    if (root.parentId !== null)
      throw new DiscussionError("VALIDATION_ERROR", tl("server.discussion.replyToReply", "Отвечать можно только корню ветки"), { parentId: root.parentId });
    if (root.deletedAt !== null)
      throw new DiscussionError("CONFLICT", tl("server.discussion.replyToDeleted", "Ветка удалена автором"), { parentId: root.id });
    if (root.status === "hidden")
      throw new DiscussionError("CONFLICT", tl("server.discussion.replyToHidden", "Ветка скрыта владельцем"), { parentId: root.id });
    parentId = root.id;
    address = addressFromRow(root.address);
    excerpt = root.excerpt;
  } else {
    ({ address, excerpt } = await resolveTarget(index, input.target));
  }
  const [row] = await db
    .insert(comments)
    .values({
      synthesisId,
      authorId: viewer.userId,
      address,
      addressKind: address.kind,
      addressKey: address.key,
      excerpt,
      parentId,
      kind,
      body,
    })
    .returning();
  // 16.2: уведомления — ответ в ветке автору корня (comment_reply), новый
  // комментарий — остальным участникам (comment_new); актор себе не пишется
  const created = row as CommentRow;
  const snippet = plainText(body).slice(0, 80);
  if (parentId) {
    const [root] = await db.select({ authorId: comments.authorId }).from(comments).where(eq(comments.id, parentId)).limit(1);
    const rootAuthor = root?.authorId ?? null;
    if (rootAuthor) {
      const { ownerId, memberIds } = await participantsOf(db, synthesisId);
      const circle = new Set([...(ownerId ? [ownerId] : []), ...memberIds]);
      if (circle.has(rootAuthor))
        await notifySafe(db, {
          type: "comment_reply",
          synthesisId,
          actorId: viewer.userId,
          recipients: [rootAuthor],
          address,
          refKind: "comment",
          refId: created.id,
          payload: { excerpt: snippet },
        });
      circle.delete(rootAuthor);
      await notifySafe(db, {
        type: "comment_new",
        synthesisId,
        actorId: viewer.userId,
        recipients: [...circle],
        address,
        refKind: "comment",
        refId: created.id,
        payload: { excerpt: snippet },
      });
    } else {
      await notifyParticipants(db, { type: "comment_new", synthesisId, actorId: viewer.userId, address, refKind: "comment", refId: created.id, payload: { excerpt: snippet } });
    }
  } else {
    await notifyParticipants(db, { type: "comment_new", synthesisId, actorId: viewer.userId, address, refKind: "comment", refId: created.id, payload: { excerpt: snippet } });
  }
  const [dto] = await toComments(synthesisId, [created], viewer, index);
  return dto as Comment;
}

/** Правка своего комментария (тело, вид). Скрытый владельцем не правится. */
export async function updateComment(
  synthesisId: string,
  commentId: string,
  viewer: DiscussionViewer,
  input: CommentUpdateInput,
): Promise<Comment> {
  const row = await loadComment(synthesisId, commentId);
  if (row.authorId !== viewer.userId) throw forbidden(tl("server.discussion.notAuthor", "Правит только автор"));
  if (row.deletedAt !== null) throw new DiscussionError("CONFLICT", tl("server.discussion.commentDeleted", "Комментарий удалён"), {});
  if (row.status === "hidden") throw new DiscussionError("CONFLICT", tl("server.discussion.commentHidden", "Комментарий скрыт владельцем"), {});
  const patch: Partial<CommentRow> = {};
  if (input.body !== undefined) patch.body = cleanBody(input.body, "body", COMMENT_BODY_MAX, true);
  if (input.kind !== undefined) patch.kind = cleanKind(input.kind);
  if (Object.keys(patch).length === 0)
    throw new DiscussionError("VALIDATION_ERROR", tl("server.discussion.nothingToChange", "Нечего менять"), { body: "body | kind" });
  const now = new Date();
  await db
    .update(comments)
    .set({ ...patch, editedAt: now, updatedAt: now })
    .where(eq(comments.id, row.id));
  return getComment(synthesisId, commentId, viewer);
}

/** Удаление своего комментария: без ответов — строка удаляется; с ответами
 *  — остаётся заглушкой (тело стёрто). */
export async function deleteComment(
  synthesisId: string,
  commentId: string,
  viewer: DiscussionViewer,
): Promise<{ ok: true; removed: boolean }> {
  const row = await loadComment(synthesisId, commentId);
  if (row.authorId !== viewer.userId) throw forbidden(tl("server.discussion.notAuthorDelete", "Удаляет только автор"));
  if (row.deletedAt !== null) return { ok: true, removed: false };
  const [cnt] = await db
    .select({ n: count() })
    .from(comments)
    .where(and(eq(comments.parentId, row.id), isNull(comments.deletedAt)));
  if (Number(cnt?.n ?? 0) === 0 && row.parentId === null) {
    await db.delete(comments).where(eq(comments.id, row.id));
    return { ok: true, removed: true };
  }
  if (row.parentId !== null) {
    await db.delete(comments).where(eq(comments.id, row.id));
    return { ok: true, removed: true };
  }
  const now = new Date();
  await db
    .update(comments)
    .set({ body: "", deletedAt: now, updatedAt: now })
    .where(eq(comments.id, row.id));
  return { ok: true, removed: false };
}

/** Решить / переоткрыть ветку — автор ветки или владелец (manage). */
export async function setThreadResolved(
  synthesisId: string,
  commentId: string,
  viewer: DiscussionViewer,
  resolved: boolean,
): Promise<Comment> {
  const row = await loadComment(synthesisId, commentId);
  if (row.parentId !== null)
    throw new DiscussionError("VALIDATION_ERROR", tl("server.discussion.notRoot", "Статус есть только у корня ветки"), { commentId: row.parentId });
  if (!viewer.capabilities.manage && row.authorId !== viewer.userId)
    throw forbidden(tl("server.discussion.resolveForbidden", "Решить ветку может её автор или владелец"));
  if (row.status === "hidden")
    throw new DiscussionError("CONFLICT", tl("server.discussion.commentHidden", "Комментарий скрыт владельцем"), {});
  const next: CommentStatus = resolved ? "resolved" : "open";
  if (row.status !== next) {
    const now = new Date();
    await db
      .update(comments)
      .set({
        status: next,
        resolvedBy: resolved ? viewer.userId : null,
        resolvedAt: resolved ? now : null,
        updatedAt: now,
      })
      .where(eq(comments.id, row.id));
  }
  return getComment(synthesisId, commentId, viewer);
}

/** Скрыть / вернуть комментарий — владелец (роут проверяет manage).
 *  При возврате ветка получает прежний статус: решённая остаётся решённой
 *  (resolved_at на месте), иначе open. */
export async function setCommentHidden(
  synthesisId: string,
  commentId: string,
  viewer: DiscussionViewer,
  hidden: boolean,
): Promise<Comment> {
  const row = await loadComment(synthesisId, commentId);
  if (!viewer.capabilities.manage) throw forbidden(tl("server.discussion.hideForbidden", "Скрывать комментарии может только владелец"));
  const now = new Date();
  if (hidden && row.status !== "hidden") {
    await db
      .update(comments)
      .set({ status: "hidden", hiddenBy: viewer.userId, hiddenAt: now, updatedAt: now })
      .where(eq(comments.id, row.id));
  } else if (!hidden && row.status === "hidden") {
    await db
      .update(comments)
      .set({
        status: row.parentId === null && row.resolvedAt ? "resolved" : "open",
        hiddenBy: null,
        hiddenAt: null,
        updatedAt: now,
      })
      .where(eq(comments.id, row.id));
  }
  return getComment(synthesisId, commentId, viewer);
}

/* ══ Рецензии ══════════════════════════════════════════════════════════ */

function fieldsOf(r: ReviewRow): ReviewFields {
  return {
    title: r.title,
    summary: r.summary,
    strengths: r.strengths,
    objections: r.objections,
    minor: r.minor,
    questions: r.questions,
    conclusion: r.conclusion,
  };
}

function findingDto(f: FindingRow, resolution: AddressResolution): ReviewFinding {
  return {
    id: f.id,
    reviewId: f.reviewId,
    address: addressFromRow(f.address),
    excerpt: f.excerpt,
    resolution,
    body: f.body,
    kind: f.kind,
    position: f.position,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

async function toReviews(synthesisId: string, rows: ReviewRow[], index?: AddressIndex): Promise<Review[]> {
  if (rows.length === 0) return [];
  const idx = index ?? (await loadAddressIndex(synthesisId));
  const synth = await loadSynthesisRow(synthesisId);
  const frows = await db
    .select()
    .from(reviewFindings)
    .where(inArray(reviewFindings.reviewId, rows.map((r) => r.id)))
    .orderBy(asc(reviewFindings.position), asc(reviewFindings.createdAt));
  const [authors, res, active] = await Promise.all([
    loadAuthors(rows.map((r) => r.authorId)),
    resolutionsFor(idx, frows),
    activeMemberIds(synthesisId),
  ]);
  const byReview = new Map<string, ReviewFinding[]>();
  for (const f of frows) {
    const list = byReview.get(f.reviewId) ?? [];
    list.push(findingDto(f, res.get(f.address) as AddressResolution));
    byReview.set(f.reviewId, list);
  }
  return rows.map((r) => ({
    id: r.id,
    synthesisId: r.synthesisId,
    author: authorDto(r.authorId, authors, synth.userId, active),
    docVersion: docVersionOf(r),
    status: r.status,
    revision: r.revision,
    ...fieldsOf(r),
    findings: byReview.get(r.id) ?? [],
    publishedAt: iso(r.publishedAt),
    withdrawnAt: iso(r.withdrawnAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** Список рецензий: опубликованные и отозванные — всем, кому открыто
 *  обсуждение; черновики — только их автору. Новые первыми. */
export async function listReviews(synthesisId: string, viewer: DiscussionViewer): Promise<Review[]> {
  const rows = await db
    .select()
    .from(reviews)
    .where(
      and(
        eq(reviews.synthesisId, synthesisId),
        or(sql`${reviews.status} <> 'draft'`, eq(reviews.authorId, viewer.userId))!,
      ),
    )
    .orderBy(desc(reviews.createdAt));
  return toReviews(synthesisId, rows);
}

async function loadReview(synthesisId: string, reviewId: string): Promise<ReviewRow> {
  const [row] = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), eq(reviews.synthesisId, synthesisId)))
    .limit(1);
  if (!row) throw notFound(tl("server.discussion.review", "Рецензия"));
  return row;
}

/** Черновик чужой — как несуществующий (404, не 403: само наличие
 *  черновика другим не раскрывается). */
function assertVisible(row: ReviewRow, viewer: DiscussionViewer): void {
  if (row.status === "draft" && row.authorId !== viewer.userId) throw notFound(tl("server.discussion.review", "Рецензия"));
}

function assertAuthor(row: ReviewRow, viewer: DiscussionViewer): void {
  if (row.authorId !== viewer.userId) throw forbidden(tl("server.discussion.notReviewAuthor", "Рецензию правит только её автор"));
}

export async function getReview(synthesisId: string, reviewId: string, viewer: DiscussionViewer): Promise<Review> {
  const row = await loadReview(synthesisId, reviewId);
  assertVisible(row, viewer);
  const [dto] = await toReviews(synthesisId, [row]);
  return dto as Review;
}

function cleanReviewFields(input: ReviewUpsertInput): Partial<ReviewFields> {
  const out: Partial<ReviewFields> = {};
  for (const f of REVIEW_TEXT_FIELDS) {
    const v = (input as Record<string, unknown>)[f];
    if (v === undefined) continue;
    out[f] = cleanBody(v, f, f === "title" ? REVIEW_TITLE_MAX : REVIEW_FIELD_MAX, false);
  }
  return out;
}

/** Снимок текущего состояния рецензии новой редакцией (внутри tx). */
async function writeRevision(tx: Tx, row: ReviewRow, revision: number): Promise<void> {
  const frows = await tx
    .select()
    .from(reviewFindings)
    .where(eq(reviewFindings.reviewId, row.id))
    .orderBy(asc(reviewFindings.position), asc(reviewFindings.createdAt));
  const dummy: AddressResolution = { state: "current", currentId: null, currentHash: null, currentVersion: null };
  const findings = frows.map((f) => {
    const { resolution: _r, ...rest } = findingDto(f, dummy);
    return rest;
  });
  await tx.insert(reviewRevisions).values({
    reviewId: row.id,
    revision,
    docVersion: docVersionOf(row),
    fields: fieldsOf(row),
    findings,
  });
}

/** Опубликованная рецензия после любой правки получает новую редакцию. */
async function bumpRevisionIfPublished(tx: Tx, reviewId: string): Promise<void> {
  const [row] = await tx.select().from(reviews).where(eq(reviews.id, reviewId)).limit(1);
  if (!row || row.status !== "published") return;
  const revision = row.revision + 1;
  const now = new Date();
  await tx.update(reviews).set({ revision, updatedAt: now }).where(eq(reviews.id, reviewId));
  await writeRevision(tx, { ...row, revision, updatedAt: now }, revision);
}

/** Новый черновик (поля — по желанию). */
export async function createReview(
  synthesisId: string,
  viewer: DiscussionViewer,
  input: ReviewUpsertInput,
): Promise<Review> {
  const synth = await loadSynthesisRow(synthesisId);
  const fields = cleanReviewFields(input);
  const [row] = await db
    .insert(reviews)
    .values({
      synthesisId,
      authorId: viewer.userId,
      versionBase: synth.versionBase,
      versionSub: synth.versionSub,
      versionModes: synth.versionModes,
      versionModeRegen: synth.versionModeRegen,
      ...fields,
    })
    .returning();
  const [dto] = await toReviews(synthesisId, [row as ReviewRow]);
  return dto as Review;
}

/** Правка полей: черновик — на месте; опубликованная — на месте + новая
 *  редакция; отозванная не правится. */
export async function updateReview(
  synthesisId: string,
  reviewId: string,
  viewer: DiscussionViewer,
  input: ReviewUpsertInput,
): Promise<Review> {
  const row = await loadReview(synthesisId, reviewId);
  assertVisible(row, viewer);
  assertAuthor(row, viewer);
  if (row.status === "withdrawn")
    throw new DiscussionError("CONFLICT", tl("server.discussion.reviewWithdrawn", "Рецензия отозвана и не правится"), {});
  const fields = cleanReviewFields(input);
  if (Object.keys(fields).length === 0)
    throw new DiscussionError("VALIDATION_ERROR", tl("server.discussion.nothingToChange", "Нечего менять"), {
      fields: REVIEW_TEXT_FIELDS.join(" | "),
    });
  await db.transaction(async (tx) => {
    await tx.update(reviews).set({ ...fields, updatedAt: new Date() }).where(eq(reviews.id, row.id));
    await bumpRevisionIfPublished(tx, row.id);
  });
  return getReview(synthesisId, reviewId, viewer);
}

/** Удаление — только черновика и только автором. */
export async function deleteReview(synthesisId: string, reviewId: string, viewer: DiscussionViewer): Promise<{ ok: true }> {
  const row = await loadReview(synthesisId, reviewId);
  assertVisible(row, viewer);
  assertAuthor(row, viewer);
  if (row.status !== "draft")
    throw new DiscussionError("CONFLICT", tl("server.discussion.onlyDraftDeleted", "Удалить можно только черновик; опубликованную рецензию отзывают"), {});
  await db.delete(reviews).where(eq(reviews.id, row.id));
  return { ok: true };
}

/** Публикация черновика: версия документа — на момент публикации;
 *  редакция 1 (или следующая после повторной публикации отозванной). */
export async function publishReview(synthesisId: string, reviewId: string, viewer: DiscussionViewer): Promise<Review> {
  const row = await loadReview(synthesisId, reviewId);
  assertVisible(row, viewer);
  assertAuthor(row, viewer);
  if (row.status === "published")
    throw new DiscussionError("CONFLICT", tl("server.discussion.alreadyPublished", "Рецензия уже опубликована"), {});
  const synth = await loadSynthesisRow(synthesisId);
  await db.transaction(async (tx) => {
    const now = new Date();
    const revision = row.revision + 1;
    const patch = {
      status: "published" as const,
      revision,
      publishedAt: now,
      withdrawnAt: null,
      versionBase: synth.versionBase,
      versionSub: synth.versionSub,
      versionModes: synth.versionModes,
      versionModeRegen: synth.versionModeRegen,
      updatedAt: now,
    };
    await tx.update(reviews).set(patch).where(eq(reviews.id, row.id));
    await writeRevision(tx, { ...row, ...patch }, revision);
    // 16.2: опубликованная рецензия — всем участникам, кроме автора
    await notifyParticipants(tx, {
      type: "review_published",
      synthesisId,
      actorId: viewer.userId,
      refKind: "review",
      refId: row.id,
      payload: { excerpt: plainText(row.summary ?? "").slice(0, 80) },
    });
  });
  return getReview(synthesisId, reviewId, viewer);
}

/** Отзыв опубликованной: остаётся видимой с пометкой; редакции целы. */
export async function withdrawReview(synthesisId: string, reviewId: string, viewer: DiscussionViewer): Promise<Review> {
  const row = await loadReview(synthesisId, reviewId);
  assertVisible(row, viewer);
  assertAuthor(row, viewer);
  if (row.status !== "published")
    throw new DiscussionError("CONFLICT", tl("server.discussion.notPublished", "Отозвать можно только опубликованную рецензию"), {});
  const now = new Date();
  await db.update(reviews).set({ status: "withdrawn", withdrawnAt: now, updatedAt: now }).where(eq(reviews.id, row.id));
  return getReview(synthesisId, reviewId, viewer);
}

/** Редакции — всем, кому видна рецензия (черновик редакций не имеет). */
export async function listRevisions(
  synthesisId: string,
  reviewId: string,
  viewer: DiscussionViewer,
): Promise<ReviewRevision[]> {
  const row = await loadReview(synthesisId, reviewId);
  assertVisible(row, viewer);
  const rows = await db
    .select()
    .from(reviewRevisions)
    .where(eq(reviewRevisions.reviewId, row.id))
    .orderBy(desc(reviewRevisions.revision));
  return rows.map((r) => ({
    id: r.id,
    reviewId: r.reviewId,
    revision: r.revision,
    docVersion: r.docVersion,
    fields: r.fields,
    findings: r.findings,
    createdAt: r.createdAt.toISOString(),
  }));
}

/* ── Замечания рецензии ──────────────────────────────────────────────── */

export async function addFinding(
  synthesisId: string,
  reviewId: string,
  viewer: DiscussionViewer,
  input: FindingCreateInput,
): Promise<Review> {
  const row = await loadReview(synthesisId, reviewId);
  assertVisible(row, viewer);
  assertAuthor(row, viewer);
  if (row.status === "withdrawn")
    throw new DiscussionError("CONFLICT", tl("server.discussion.reviewWithdrawn", "Рецензия отозвана и не правится"), {});
  const body = cleanBody(input.body, "body", FINDING_BODY_MAX, true);
  const kind = cleanKind(input.kind);
  const index = await loadAddressIndex(synthesisId);
  const { address, excerpt } = await resolveTarget(index, input.target);
  await db.transaction(async (tx) => {
    const [mxRow] = await tx
      .select({ mx: sql<number>`coalesce(max(${reviewFindings.position}), 0)` })
      .from(reviewFindings)
      .where(eq(reviewFindings.reviewId, row.id));
    const mx = mxRow?.mx ?? 0;
    await tx.insert(reviewFindings).values({
      reviewId: row.id,
      synthesisId,
      address,
      addressKind: address.kind,
      addressKey: address.key,
      excerpt,
      body,
      kind,
      position: Number(mx) + 1,
    });
    await tx.update(reviews).set({ updatedAt: new Date() }).where(eq(reviews.id, row.id));
    await bumpRevisionIfPublished(tx, row.id);
  });
  return getReview(synthesisId, reviewId, viewer);
}

async function loadFinding(reviewId: string, findingId: string): Promise<FindingRow> {
  const [f] = await db
    .select()
    .from(reviewFindings)
    .where(and(eq(reviewFindings.id, findingId), eq(reviewFindings.reviewId, reviewId)))
    .limit(1);
  if (!f) throw notFound(tl("server.discussion.finding", "Замечание"));
  return f;
}

export async function updateFinding(
  synthesisId: string,
  reviewId: string,
  findingId: string,
  viewer: DiscussionViewer,
  input: FindingUpdateInput,
): Promise<Review> {
  const row = await loadReview(synthesisId, reviewId);
  assertVisible(row, viewer);
  assertAuthor(row, viewer);
  if (row.status === "withdrawn")
    throw new DiscussionError("CONFLICT", tl("server.discussion.reviewWithdrawn", "Рецензия отозвана и не правится"), {});
  const f = await loadFinding(row.id, findingId);
  const patch: Partial<FindingRow> = {};
  if (input.body !== undefined) patch.body = cleanBody(input.body, "body", FINDING_BODY_MAX, true);
  if (input.kind !== undefined) patch.kind = cleanKind(input.kind);
  if (Object.keys(patch).length === 0)
    throw new DiscussionError("VALIDATION_ERROR", tl("server.discussion.nothingToChange", "Нечего менять"), { body: "body | kind" });
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.update(reviewFindings).set({ ...patch, updatedAt: now }).where(eq(reviewFindings.id, f.id));
    await tx.update(reviews).set({ updatedAt: now }).where(eq(reviews.id, row.id));
    await bumpRevisionIfPublished(tx, row.id);
  });
  return getReview(synthesisId, reviewId, viewer);
}

export async function deleteFinding(
  synthesisId: string,
  reviewId: string,
  findingId: string,
  viewer: DiscussionViewer,
): Promise<Review> {
  const row = await loadReview(synthesisId, reviewId);
  assertVisible(row, viewer);
  assertAuthor(row, viewer);
  if (row.status === "withdrawn")
    throw new DiscussionError("CONFLICT", tl("server.discussion.reviewWithdrawn", "Рецензия отозвана и не правится"), {});
  const f = await loadFinding(row.id, findingId);
  await db.transaction(async (tx) => {
    await tx.delete(reviewFindings).where(eq(reviewFindings.id, f.id));
    await tx.update(reviews).set({ updatedAt: new Date() }).where(eq(reviews.id, row.id));
    await bumpRevisionIfPublished(tx, row.id);
  });
  return getReview(synthesisId, reviewId, viewer);
}

/* ══ Сводка по адресам ═════════════════════════════════════════════════ */

/**
 * Счётчики по адресам для пометок у элементов (16.3): открытые ветки
 * (корни со статусом open, не удалённые) и замечания опубликованных (не
 * отозванных) рецензий — двумя сгруппированными запросами.
 */
export async function discussionSummary(synthesisId: string): Promise<DiscussionSummary> {
  const [openRows, findingRows, reviewRows] = await Promise.all([
    db
      .select({ kind: comments.addressKind, key: comments.addressKey, n: count() })
      .from(comments)
      .where(
        and(
          eq(comments.synthesisId, synthesisId),
          isNull(comments.parentId),
          eq(comments.status, "open"),
          isNull(comments.deletedAt),
        ),
      )
      .groupBy(comments.addressKind, comments.addressKey),
    db
      .select({ kind: reviewFindings.addressKind, key: reviewFindings.addressKey, n: count() })
      .from(reviewFindings)
      .innerJoin(reviews, eq(reviews.id, reviewFindings.reviewId))
      .where(and(eq(reviewFindings.synthesisId, synthesisId), eq(reviews.status, "published")))
      .groupBy(reviewFindings.addressKind, reviewFindings.addressKey),
    db
      .select({ n: count() })
      .from(reviews)
      .where(and(eq(reviews.synthesisId, synthesisId), eq(reviews.status, "published"))),
  ]);
  const map = new Map<string, AddressCounts>();
  const at = (kind: string, key: string): AddressCounts => {
    const k = `${kind}:${key}`;
    let c = map.get(k);
    if (!c) {
      c = { kind: kind as AddressKind, key, openComments: 0, findings: 0 };
      map.set(k, c);
    }
    return c;
  };
  let openComments = 0;
  let findings = 0;
  for (const r of openRows) {
    at(r.kind, r.key).openComments += Number(r.n);
    openComments += Number(r.n);
  }
  for (const r of findingRows) {
    at(r.kind, r.key).findings += Number(r.n);
    findings += Number(r.n);
  }
  return {
    byAddress: [...map.values()],
    totals: { openComments, findings, reviews: Number(reviewRows[0]?.n ?? 0) },
  };
}
