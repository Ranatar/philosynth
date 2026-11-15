/**
 * Предложения изменений (беседа 17.1, п.5; 02 §2.40–2.41, 03 §2.20).
 *
 * Предложение — адресованное (адрес Фазы 16) изменение документа от
 * участника с правом обсуждения: `replace` несёт готовое значение (поле
 * элемента либо разметку подраздела), `note` — только обоснование, способ
 * исполнения выбирает принимающий. Основа (`base`) — версия и хэш адресата
 * на момент записи; расхождение с живым документом — `stale`, ВЫЧИСЛЯЕТСЯ
 * при чтении и нигде не хранится.
 *
 * ИСПОЛНЕНИЕ — ТОЛЬКО ПЛАН ПРАВОК. `acceptProposal` ничего в документе не
 * меняет: он собирает ЧЕРНОВИК плана (createPlan — тот же, что у человека:
 * предпросмотр, каскад, подтверждение) со ссылкой на предложение в шаге.
 * Статус 'accepted' пишет исполнитель плана после успешного шага
 * (proposal-links.settleProposalStep). Второго пути исполнения нет; модель
 * замечание как разрешение переписать документ не толкует — `note` уходит в
 * шаг только доводом (context) способа, названного человеком.
 *
 * Устаревшее принять нельзя (409 PROPOSAL_STALE) — ни здесь, ни в
 * исполнителе (заслон proposalStepBlockers). Автоматического перебазирования
 * нет: «новое поверх текущего» заводит ЧЕЛОВЕК (rebaseProposal), старое
 * закрывается как superseded. Отклонение — только действие человека с
 * правом правки; машина предложение не отклоняет.
 *
 * Тексты (rationale, note) — обычный текст (plainText 16.1); фраз о
 * предложении в БД нет (правило 14.2): события — код и параметры.
 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { db, schema } from "../db/index.js";
import {
  activeMemberIds,
  addressFromRow,
  authorDto,
  loadAuthors,
  resolveTarget,
  type DiscussionViewer,
} from "./discussion.js";
import {
  addressOf,
  findTarget,
  loadAddressIndex,
  resolveAddress,
  type AddressIndex,
} from "./discussion-address.js";
import { createPlan, deletePlan, PlanError } from "./edit-planner.js";
import { resolveStepField, ElementStepError, ELEMENT_FIELD_MAX_CHARS } from "./element-step.js";
import { subsectionLockOf } from "./element-editor.js";
import { VersionConflictError } from "./expected-version.js";
import { baseIsCurrent, logProposalEvent } from "./proposal-links.js";
import { notifySafe, participantsOf } from "./notifications.js";
import { sanitizeSectionHtml } from "../utils/html-parser.js";

import {
  PROPOSAL_NOTE_MAX,
  PROPOSAL_RATIONALE_MAX,
  PROPOSAL_VALUE_MAX,
  PROPOSALS_PAGE_MAX,
  isProposalAcceptMethod,
  isProposalKind,
  isProposalSource,
  isProposalStatus,
  type ProposalAcceptMethod,
  type ProposalCloseReason,
  type ProposalStatus,
} from "@philosynth/shared/constants/proposals";
import { ELEMENT_STEP_KINDS, elementStepTarget } from "@philosynth/shared/constants/edit-steps";
import type { AddressResolution, DiscussionAddress } from "@philosynth/shared/types/discussion";
import type { CreatePlanRequest, EditPlan, ElementStepKind, StepProposalRef } from "@philosynth/shared/types/edit-plan";
import type {
  Proposal,
  ProposalAcceptInput,
  ProposalAcceptResult,
  ProposalCreateInput,
  ProposalDetail,
  ProposalEvent,
} from "@philosynth/shared/types/proposals";
import { parseSubsectionKey, plainText } from "@philosynth/shared/utils/discussion-address";
import { tl } from "@philosynth/shared/i18n/t";

const { comments, proposals, proposalEvents, recommendations, reviewFindings, reviews, sections, syntheses, synthesisMembers } = schema;

type ProposalRow = typeof proposals.$inferSelect;

/* ── Ошибки ──────────────────────────────────────────────────────────── */

export type ProposalErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "PROPOSAL_STALE";

export class ProposalError extends Error {
  constructor(
    readonly code: ProposalErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ProposalError";
  }
}

export function proposalErrorStatus(code: ProposalErrorCode): 400 | 403 | 404 | 409 {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "FORBIDDEN":
      return 403;
    case "CONFLICT":
    case "PROPOSAL_STALE":
      return 409;
    default:
      return 400;
  }
}

const notFound = () => new ProposalError("NOT_FOUND", tl("server.proposals.notFound", "Предложение не найдено"));
const invalid = (details: Record<string, unknown>) =>
  new ProposalError("VALIDATION_ERROR", tl("common.invalidData", "Невалидные данные"), details);

const isElementKind = (k: string): k is ElementStepKind => (ELEMENT_STEP_KINDS as readonly string[]).includes(k);

/* ── Чтение ──────────────────────────────────────────────────────────── */

async function ownerIdOf(synthesisId: string): Promise<string> {
  const [row] = await db.select({ userId: syntheses.userId }).from(syntheses).where(eq(syntheses.id, synthesisId)).limit(1);
  if (!row) throw new ProposalError("NOT_FOUND", tl("common.synthesisNotFound", "Синтез не найден"));
  return row.userId;
}

/** Устарело ли: открытое предложение, чья основа разошлась с адресатом
 *  (элемент — номер версии, раздел/подраздел — хэш; адресат удалён). */
export function isStale(
  status: string,
  resolution: AddressResolution,
  addressKind = "section",
  base: { version: number | null; hash: string } = { version: null, hash: "" },
): boolean {
  return status === "open" && !baseIsCurrent(addressKind, base, resolution);
}

async function toDtos(synthesisId: string, rows: ProposalRow[], index?: AddressIndex): Promise<Proposal[]> {
  if (rows.length === 0) return [];
  const idx = index ?? (await loadAddressIndex(synthesisId));
  const [ownerId, active, authors] = await Promise.all([
    ownerIdOf(synthesisId),
    activeMemberIds(synthesisId),
    loadAuthors(rows.flatMap((r) => [r.authorId, r.decidedBy])),
  ]);
  const out: Proposal[] = [];
  for (const r of rows) {
    const address = addressFromRow(r.address);
    const resolution = await resolveAddress(idx, address);
    out.push({
      id: r.id,
      synthesisId: r.synthesisId,
      author: authorDto(r.authorId, authors, ownerId, active),
      address,
      resolution,
      excerpt: r.excerpt,
      base: r.base,
      stale: isStale(r.status, resolution, address.kind, r.base),
      source: r.source,
      sourceId: r.sourceId,
      sourceReviewId: r.sourceReviewId,
      kind: r.kind,
      field: r.field,
      value: r.value,
      rationale: r.rationale,
      status: r.status,
      planId: r.planId,
      decidedBy: r.decidedBy ? authorDto(r.decidedBy, authors, ownerId, active) : null,
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
      note: r.note,
      closeReason: r.closeReason,
      supersededBy: r.supersededBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    });
  }
  return out;
}

async function loadRow(synthesisId: string, proposalId: string): Promise<ProposalRow> {
  const [row] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, proposalId), eq(proposals.synthesisId, synthesisId)))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

export interface ProposalListQuery {
  status?: ProposalStatus;
  addressKind?: string;
  addressKey?: string;
  mine?: boolean;
}

export function parseProposalListQuery(q: Record<string, string | undefined>): ProposalListQuery {
  const out: ProposalListQuery = {};
  if (q["status"] !== undefined) {
    if (!isProposalStatus(q["status"])) throw invalid({ status: "open | accepted | rejected | withdrawn | closed" });
    out.status = q["status"];
  }
  if (q["addressKind"]) out.addressKind = q["addressKind"];
  if (q["addressKey"]) out.addressKey = q["addressKey"];
  if (q["mine"] === "1" || q["mine"] === "true") out.mine = true;
  return out;
}

/** Список предложений концепции — всем с правом обсуждения, новые сверху. */
export async function listProposals(
  synthesisId: string,
  viewer: DiscussionViewer,
  query: ProposalListQuery = {},
): Promise<Proposal[]> {
  const rows = await db
    .select()
    .from(proposals)
    .where(
      and(
        eq(proposals.synthesisId, synthesisId),
        ...(query.status ? [eq(proposals.status, query.status)] : []),
        ...(query.addressKind ? [eq(proposals.addressKind, query.addressKind)] : []),
        ...(query.addressKey ? [eq(proposals.addressKey, query.addressKey)] : []),
        ...(query.mine ? [eq(proposals.authorId, viewer.userId)] : []),
      ),
    )
    .orderBy(desc(proposals.createdAt))
    .limit(PROPOSALS_PAGE_MAX);
  return toDtos(synthesisId, rows);
}

/** Одно предложение с журналом событий. */
export async function getProposal(synthesisId: string, proposalId: string): Promise<ProposalDetail> {
  const row = await loadRow(synthesisId, proposalId);
  const [dto] = await toDtos(synthesisId, [row]);
  const evRows = await db
    .select()
    .from(proposalEvents)
    .where(eq(proposalEvents.proposalId, proposalId))
    .orderBy(asc(proposalEvents.createdAt), asc(proposalEvents.id));
  const [ownerId, active, actors] = await Promise.all([
    ownerIdOf(synthesisId),
    activeMemberIds(synthesisId),
    loadAuthors(evRows.map((e) => e.actorId)),
  ]);
  const events: ProposalEvent[] = evRows.map((e) => ({
    id: e.id,
    type: e.type,
    actor: e.actorId ? authorDto(e.actorId, actors, ownerId, active) : null,
    payload: e.payload ?? {},
    createdAt: e.createdAt.toISOString(),
  }));
  return { ...(dto as Proposal), events };
}

/* ── Создание ────────────────────────────────────────────────────────── */

function cleanText(raw: unknown, field: string, max: number): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") throw invalid({ [field]: tl("server.discussion.stringExpected", "строка") });
  const text = plainText(raw);
  if (text.length > max)
    throw invalid({ [field]: tl("server.discussion.maxLength", "не длиннее {max} символов", { max: String(max) }) });
  return text;
}

/** Адрес из источника (комментарий / замечание): объект ищется ЗАНОВО по id
 *  и ключу сохранённого адреса — основа предложения всегда текущая. */
async function addressFromSource(
  index: AddressIndex,
  stored: unknown,
): Promise<{ address: DiscussionAddress; excerpt: string }> {
  const a = addressFromRow(stored);
  const obj = findTarget(index, { kind: a.kind, ...(a.id ? { id: a.id } : {}), ...(a.key ? { key: a.key } : {}) });
  if (!obj)
    throw new ProposalError("CONFLICT", tl("server.proposals.sourceObjectGone", "Объект, к которому относится источник, удалён — предложить изменение не к чему"));
  return addressOf(index, obj);
}

/** Значение `replace` по виду адреса: поле элемента — текст; подраздел —
 *  разметка содержимого (чистится тем же санитайзером, что правка 9.2). */
async function cleanReplace(
  synthesisId: string,
  address: DiscussionAddress,
  rawField: unknown,
  rawValue: unknown,
): Promise<{ field: string | null; value: string }> {
  if (typeof rawValue !== "string" || !rawValue.trim())
    throw invalid({ value: tl("server.proposals.valueRequired", "у предложения-замены обязательно значение") });
  if (isElementKind(address.kind)) {
    let field: string;
    try {
      field = resolveStepField(address.kind as ElementStepKind, typeof rawField === "string" && rawField ? rawField : undefined);
    } catch (e) {
      throw invalid({ field: e instanceof ElementStepError ? e.message : String(e) });
    }
    const value = rawValue.replace(/ /g, " ").replace(/\s+/g, " ").trim();
    if (value.length > ELEMENT_FIELD_MAX_CHARS)
      throw invalid({ value: tl("server.discussion.maxLength", "не длиннее {max} символов", { max: String(ELEMENT_FIELD_MAX_CHARS) }) });
    return { field, value };
  }
  if (address.kind === "subsection") {
    if (rawValue.length > PROPOSAL_VALUE_MAX)
      throw invalid({ value: tl("server.discussion.maxLength", "не длиннее {max} символов", { max: String(PROPOSAL_VALUE_MAX) }) });
    const parsed = parseSubsectionKey(address.key);
    if (!parsed) throw invalid({ target: tl("server.proposals.subsectionKeyShape", "ключ подраздела — «раздел:подраздел»") });
    const [sec] = await db
      .select({ html: sections.htmlContent })
      .from(sections)
      .where(and(eq(sections.synthesisId, synthesisId), eq(sections.key, parsed.sectionKey)))
      .limit(1);
    const lock = sec ? subsectionLockOf(parsed.sectionKey, sec.html, parsed.dataSection) : null;
    if (lock)
      throw invalid({ target: lock.hint, reason: lock.reason });
    const value = sanitizeSectionHtml(rawValue.trim()).html.trim();
    if (!value) throw invalid({ value: tl("server.proposals.valueRequired", "у предложения-замены обязательно значение") });
    return { field: null, value };
  }
  throw invalid({
    kind: tl("server.proposals.replaceTargets", "готовую замену можно предложить элементу (категория, связь, тезис, термин) или подразделу; разделу — только замечание"),
  });
}

/** Кому сообщить о новом предложении: тем, кто решает, — владельцу и
 *  действующим редакторам (актор себе не пишется — notify). */
async function decidersOf(synthesisId: string): Promise<string[]> {
  const { ownerId } = await participantsOf(db, synthesisId);
  const editors = await db
    .select({ userId: synthesisMembers.userId })
    .from(synthesisMembers)
    .where(
      and(
        eq(synthesisMembers.synthesisId, synthesisId),
        eq(synthesisMembers.status, "active"),
        eq(synthesisMembers.role, "editor"),
      ),
    );
  return [...(ownerId ? [ownerId] : []), ...editors.map((e) => e.userId)];
}

export async function createProposal(
  synthesisId: string,
  viewer: DiscussionViewer,
  input: ProposalCreateInput,
): Promise<Proposal> {
  if (!isProposalKind(input.kind)) throw invalid({ kind: "replace | note" });
  const source = input.source === undefined ? "direct" : input.source;
  if (!isProposalSource(source)) throw invalid({ source: "direct | comment | review_finding | recommendation" });
  const rationale = cleanText(input.rationale, "rationale", PROPOSAL_RATIONALE_MAX);

  const index = await loadAddressIndex(synthesisId);
  let address: DiscussionAddress;
  let excerpt: string;
  let sourceId: string | null = null;
  let sourceReviewId: string | null = null;

  if (source === "comment" || source === "review_finding" || source === "recommendation") {
    if (typeof input.sourceId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.sourceId))
      throw invalid({ sourceId: tl("server.proposals.sourceIdRequired", "у предложения из источника обязателен sourceId") });
    sourceId = input.sourceId;
  }
  if (source === "comment") {
    const [c] = await db
      .select()
      .from(comments)
      .where(and(eq(comments.id, sourceId as string), eq(comments.synthesisId, synthesisId)))
      .limit(1);
    if (!c || c.deletedAt !== null || c.status === "hidden")
      throw new ProposalError("NOT_FOUND", tl("server.proposals.sourceNotFound", "Источник предложения не найден в этой концепции"));
    ({ address, excerpt } = await addressFromSource(index, c.address));
  } else if (source === "review_finding") {
    const [f] = await db
      .select({ id: reviewFindings.id, address: reviewFindings.address, reviewId: reviewFindings.reviewId, status: reviews.status, authorId: reviews.authorId })
      .from(reviewFindings)
      .innerJoin(reviews, eq(reviews.id, reviewFindings.reviewId))
      .where(and(eq(reviewFindings.id, sourceId as string), eq(reviews.synthesisId, synthesisId)))
      .limit(1);
    // черновик чужой рецензии — как несуществующий (16.1)
    if (!f || (f.status === "draft" && f.authorId !== viewer.userId))
      throw new ProposalError("NOT_FOUND", tl("server.proposals.sourceNotFound", "Источник предложения не найден в этой концепции"));
    sourceReviewId = f.reviewId;
    ({ address, excerpt } = await addressFromSource(index, f.address));
  } else {
    if (source === "recommendation") {
      // рекомендации критики читает и исполняет правящий (10.1) — и
      // предложение из них заводит только он
      if (!viewer.capabilities.edit)
        throw new ProposalError("FORBIDDEN", tl("server.proposals.recommendationNeedsEdit", "Предложение из рекомендации критики заводит участник с правом правки"));
      const [r] = await db
        .select({ id: recommendations.id })
        .from(recommendations)
        .where(and(eq(recommendations.id, sourceId as string), eq(recommendations.synthesisId, synthesisId)))
        .limit(1);
      if (!r)
        throw new ProposalError("NOT_FOUND", tl("server.proposals.sourceNotFound", "Источник предложения не найден в этой концепции"));
    }
    try {
      ({ address, excerpt } = await resolveTarget(index, input.target));
    } catch (e) {
      const err = e as { code?: string; message?: string; details?: Record<string, unknown> };
      if (err.code === "NOT_FOUND") throw new ProposalError("NOT_FOUND", err.message ?? "");
      if (err.code === "VALIDATION_ERROR") throw invalid(err.details ?? { target: err.message });
      throw e;
    }
  }
  if (address.kind === "synthesis")
    throw invalid({
      target: tl("server.proposals.synthesisNotAddressable", "предложение адресуется разделу, подразделу или элементу; о документе в целом — комментарий"),
    });

  let field: string | null = null;
  let value: string | null = null;
  if (input.kind === "replace") {
    ({ field, value } = await cleanReplace(synthesisId, address, input.field, input.value));
  } else {
    if (!rationale)
      throw invalid({ rationale: tl("server.proposals.rationaleRequired", "замечанию без готовой замены обязательно обоснование") });
    if (isElementKind(address.kind) && typeof input.field === "string" && input.field) {
      try {
        field = resolveStepField(address.kind as ElementStepKind, input.field);
      } catch (e) {
        throw invalid({ field: e instanceof ElementStepError ? e.message : String(e) });
      }
    }
  }

  const row = await db.transaction(async (tx) => {
    const [ins] = await tx
      .insert(proposals)
      .values({
        synthesisId,
        authorId: viewer.userId,
        address,
        addressKind: address.kind,
        addressKey: address.key,
        excerpt,
        base: { version: address.version, hash: address.hash },
        source,
        sourceId,
        sourceReviewId,
        kind: input.kind,
        field,
        value,
        rationale,
      })
      .returning();
    const created = ins as ProposalRow;
    await logProposalEvent(tx, created, viewer.userId, "created", { kind: created.kind, source });
    return created;
  });
  await notifySafe(db, {
    type: "proposal_created",
    synthesisId,
    actorId: viewer.userId,
    recipients: await decidersOf(synthesisId),
    address,
    refKind: "proposal",
    refId: row.id,
    payload: { excerpt: (rationale || excerpt).slice(0, 80), kind: row.kind },
  });
  const [dto] = await toDtos(synthesisId, [row], index);
  return dto as Proposal;
}

/* ── Принятие: черновик плана ────────────────────────────────────────── */

const refOf = (row: ProposalRow): StepProposalRef => ({
  id: row.id,
  authorId: row.authorId,
  source: row.source,
  sourceId: row.sourceId,
  ...(row.sourceReviewId ? { sourceReviewId: row.sourceReviewId } : {}),
  kind: row.kind,
  rationale: row.rationale.slice(0, 2000),
});

const EMPTY_PLAN = { regen: [] as string[], remove: [] as string[], add: [] as string[] };

/** Способы, которыми исполним адресат вида `kind`. */
export function acceptMethodsFor(addressKind: string, proposalKind: string): ProposalAcceptMethod[] {
  if (isElementKind(addressKind))
    return proposalKind === "replace" ? ["edit_element"] : ["edit_element", "refine_element"];
  if (addressKind === "subsection")
    return proposalKind === "replace" ? ["edit_subsection"] : ["edit_subsection", "regen_subsection"];
  if (addressKind === "section") return proposalKind === "replace" ? [] : ["regen"];
  return [];
}

/**
 * Тело плана по предложению — ЧИСТАЯ функция (сторож и смоук зовут её без
 * БД). `currentId` — id адресата сейчас (после удаления-пересоздания строки
 * адрес переразрешается по ключу).
 */
export function planBodyFor(
  row: Pick<ProposalRow, "id" | "authorId" | "source" | "sourceId" | "kind" | "rationale" | "field" | "value"> & {
    sourceReviewId?: string | null;
    address: DiscussionAddress;
  },
  resolution: AddressResolution,
  input: ProposalAcceptInput,
): CreatePlanRequest {
  const ref: StepProposalRef = refOf(row as ProposalRow);
  const allowed = acceptMethodsFor(row.address.kind, row.kind);
  if (allowed.length === 0)
    throw invalid({ method: tl("server.proposals.notExecutable", "у этого адресата нет способа исполнения — предложение можно только отклонить или закрыть") });
  let method: ProposalAcceptMethod;
  if (row.kind === "replace") {
    method = allowed[0] as ProposalAcceptMethod;
    if (input.method !== undefined && input.method !== method)
      throw invalid({ method: tl("server.proposals.replaceMethodFixed", "готовая замена исполняется способом «{method}» — другой не выбирается", { method }) });
    if (input.value !== undefined || input.field !== undefined)
      throw invalid({ value: tl("server.proposals.replaceValueFixed", "значение готовой замены при принятии не меняется: исполняется то, что предложено") });
  } else {
    if (!isProposalAcceptMethod(input.method) || !allowed.includes(input.method))
      throw invalid({ method: allowed.join(" | ") });
    method = input.method;
  }
  const a = row.address;
  const expectedVersion = resolution.currentVersion ?? 0;
  if (method === "edit_element" || method === "refine_element") {
    const kind = a.kind as ElementStepKind;
    const elementId = resolution.currentId ?? a.id ?? "";
    const target = elementStepTarget(kind, elementId);
    const field = row.field ?? (typeof input.field === "string" && input.field ? input.field : undefined);
    if (method === "edit_element") {
      const value = row.kind === "replace" ? row.value : input.value;
      if (typeof value !== "string" || !value.trim())
        throw invalid({ value: tl("server.proposals.acceptValueRequired", "ручная правка по замечанию требует значения (value)") });
      return {
        ...EMPTY_PLAN,
        elementEdits: [{ kind, elementId, ...(field ? { field } : {}), value, proposals: [ref] }],
        expected: [{ target, version: expectedVersion }],
      };
    }
    return {
      ...EMPTY_PLAN,
      elementRefines: [{ kind, elementId, ...(field ? { field } : {}), note: row.rationale, proposals: [ref] }],
      expected: [{ target, version: expectedVersion }],
    };
  }
  if (method === "edit_subsection") {
    const html = row.kind === "replace" ? row.value : input.value;
    if (typeof html !== "string" || !html.trim())
      throw invalid({ value: tl("server.proposals.acceptValueRequired", "ручная правка по замечанию требует значения (value)") });
    return {
      ...EMPTY_PLAN,
      subsectionEdits: [{ target: a.key, html, proposals: [ref] }],
      expected: [{ target: a.key, hash: resolution.currentHash ?? a.hash }],
    };
  }
  if (method === "regen_subsection")
    return {
      ...EMPTY_PLAN,
      regenSubsections: [{ target: a.key, note: row.rationale, proposals: [ref] }],
      expected: [{ target: a.key, hash: resolution.currentHash ?? a.hash }],
    };
  // regen раздела
  return {
    ...EMPTY_PLAN,
    regen: [a.key],
    regenContexts: { [a.key]: row.rationale },
    regenProposals: { [a.key]: [ref] },
    expected: [{ target: a.key, hash: resolution.currentHash ?? a.hash }],
  };
}

/**
 * «Принять»: черновик плана правок с шагом по предложению. Документ НЕ
 * меняется; предложение остаётся 'open' и получает plan_id. Исполнение —
 * обычным путём плана (предпросмотр, каскад, подтверждение, слот и квота
 * исполнителя).
 */
export async function acceptProposal(
  synthesisId: string,
  proposalId: string,
  viewer: DiscussionViewer,
  input: ProposalAcceptInput,
): Promise<ProposalAcceptResult> {
  if (!viewer.capabilities.edit)
    throw new ProposalError("FORBIDDEN", tl("server.proposals.acceptNeedsEdit", "Принимает предложение участник с правом правки"));
  const row = await loadRow(synthesisId, proposalId);
  if (row.status !== "open")
    throw new ProposalError("CONFLICT", tl("server.proposals.notOpen", "Предложение уже не ждёт решения"), { status: row.status });
  if (row.planId !== null)
    throw new ProposalError("CONFLICT", tl("server.proposals.alreadyInPlan", "Предложение уже стоит в черновике плана — исполните или удалите тот план"), { planId: row.planId });
  const index = await loadAddressIndex(synthesisId);
  const address = addressFromRow(row.address);
  const resolution = await resolveAddress(index, address);
  if (!baseIsCurrent(address.kind, row.base, resolution))
    throw new ProposalError(
      "PROPOSAL_STALE",
      tl("server.proposals.stale", "Предложение устарело: документ изменился с тех пор, как оно написано. Принять его нельзя — заведите новое поверх текущего текста"),
      { state: resolution.state, base: row.base, current: { hash: resolution.currentHash, version: resolution.currentVersion } },
    );
  const body = planBodyFor({ ...row, address }, resolution, input ?? {});

  let plan: EditPlan;
  try {
    plan = await createPlan(synthesisId, viewer.userId, body, { trustProposalRefs: true });
  } catch (e) {
    if (e instanceof PlanError) {
      if (e.code === "FORBIDDEN") throw new ProposalError("FORBIDDEN", e.message);
      if (e.code === "NOT_FOUND") throw new ProposalError("NOT_FOUND", e.message);
      if (e.code === "PLAN_CONFLICT") throw new ProposalError("CONFLICT", e.message, e.details);
      throw new ProposalError("VALIDATION_ERROR", e.message, e.details);
    }
    // адресат изменился между чтением и сборкой плана
    if (e instanceof VersionConflictError)
      throw new ProposalError("PROPOSAL_STALE", tl("server.proposals.stale", "Предложение устарело: документ изменился с тех пор, как оно написано. Принять его нельзя — заведите новое поверх текущего текста"), e.details as Record<string, unknown>);
    throw e;
  }
  // гонка двух принимающих: план получает предложение, только если оно всё
  // ещё открыто и свободно; проигравший черновик удаляется
  const taken = await db.transaction(async (tx) => {
    const upd = await tx
      .update(proposals)
      .set({ planId: plan.id, updatedAt: new Date() })
      .where(and(eq(proposals.id, row.id), eq(proposals.status, "open"), isNull(proposals.planId)))
      .returning({ id: proposals.id });
    if (upd.length === 1)
      await logProposalEvent(tx, row, viewer.userId, "plan_drafted", { planId: plan.id, method: methodOfBody(body) });
    return upd.length === 1;
  });
  if (!taken) {
    await deletePlan(synthesisId, plan.id, viewer.userId).catch(() => undefined);
    throw new ProposalError("CONFLICT", tl("server.proposals.notOpen", "Предложение уже не ждёт решения"));
  }
  const fresh = await loadRow(synthesisId, row.id);
  const [dto] = await toDtos(synthesisId, [fresh], index);
  return { proposal: dto as Proposal, plan };
}

function methodOfBody(body: CreatePlanRequest): ProposalAcceptMethod {
  if (body.elementEdits?.length) return "edit_element";
  if (body.elementRefines?.length) return "refine_element";
  if (body.subsectionEdits?.length) return "edit_subsection";
  if (body.regenSubsections?.length) return "regen_subsection";
  return "regen";
}

/* ── Решения человека ────────────────────────────────────────────────── */

async function decide(
  row: ProposalRow,
  actorId: string,
  set: { status: "rejected" | "withdrawn" | "closed"; note?: string; closeReason?: ProposalCloseReason; supersededBy?: string },
  event: "rejected" | "withdrawn" | "closed",
  payload: Record<string, unknown>,
): Promise<ProposalRow> {
  return db.transaction(async (tx) => {
    const [upd] = await tx
      .update(proposals)
      .set({
        status: set.status,
        note: set.note ?? "",
        closeReason: set.closeReason ?? null,
        ...(set.supersededBy ? { supersededBy: set.supersededBy } : {}),
        planId: null,
        decidedBy: actorId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(proposals.id, row.id), eq(proposals.status, "open")))
      .returning();
    if (!upd)
      throw new ProposalError("CONFLICT", tl("server.proposals.notOpen", "Предложение уже не ждёт решения"));
    if (row.planId) await logProposalEvent(tx, row, actorId, "plan_released", { planId: row.planId, reason: "not_open" });
    await logProposalEvent(tx, row, actorId, event, payload);
    return upd;
  });
}

async function notifyDecision(row: ProposalRow, actorId: string, decision: string): Promise<void> {
  if (!row.authorId) return;
  await notifySafe(db, {
    type: "proposal_decided",
    synthesisId: row.synthesisId,
    actorId,
    recipients: [row.authorId],
    address: addressFromRow(row.address),
    refKind: "proposal",
    refId: row.id,
    payload: { decision },
    dedupeKey: `proposal_decided:${row.id}:${decision}`,
  });
}

function assertOpen(row: ProposalRow): void {
  if (row.status !== "open")
    throw new ProposalError("CONFLICT", tl("server.proposals.notOpen", "Предложение уже не ждёт решения"), { status: row.status });
}

/** Отклонить — действие человека с правом правки; слово решившего — note.
 *  Устаревшее отклоняется так же (и только так — машина не отклоняет). */
export async function rejectProposal(
  synthesisId: string,
  proposalId: string,
  viewer: DiscussionViewer,
  rawNote: unknown,
): Promise<Proposal> {
  if (!viewer.capabilities.edit)
    throw new ProposalError("FORBIDDEN", tl("server.proposals.rejectNeedsEdit", "Отклоняет предложение участник с правом правки"));
  const row = await loadRow(synthesisId, proposalId);
  assertOpen(row);
  const note = cleanText(rawNote, "note", PROPOSAL_NOTE_MAX);
  const upd = await decide(row, viewer.userId, { status: "rejected", note }, "rejected", note ? { hasNote: true } : {});
  await notifyDecision(upd, viewer.userId, "rejected");
  const [dto] = await toDtos(synthesisId, [upd]);
  return dto as Proposal;
}

/** Снять своё предложение — только автор. */
export async function withdrawProposal(
  synthesisId: string,
  proposalId: string,
  viewer: DiscussionViewer,
): Promise<Proposal> {
  const row = await loadRow(synthesisId, proposalId);
  if (row.authorId !== viewer.userId)
    throw new ProposalError("FORBIDDEN", tl("server.proposals.withdrawOnlyAuthor", "Снять предложение может только его автор"));
  assertOpen(row);
  const upd = await decide(row, viewer.userId, { status: "withdrawn" }, "withdrawn", {});
  const [dto] = await toDtos(synthesisId, [upd]);
  return dto as Proposal;
}

/** Закрыть без решения по существу (устарело, неактуально) — правящий. */
export async function closeProposal(
  synthesisId: string,
  proposalId: string,
  viewer: DiscussionViewer,
  rawReason: unknown,
  rawNote: unknown,
): Promise<Proposal> {
  if (!viewer.capabilities.edit)
    throw new ProposalError("FORBIDDEN", tl("server.proposals.closeNeedsEdit", "Закрывает предложение участник с правом правки"));
  const reason: ProposalCloseReason = rawReason === undefined || rawReason === null ? "manual" : (rawReason as ProposalCloseReason);
  if (reason !== "manual" && reason !== "outdated") throw invalid({ reason: "manual | outdated" });
  const row = await loadRow(synthesisId, proposalId);
  assertOpen(row);
  const note = cleanText(rawNote, "note", PROPOSAL_NOTE_MAX);
  const upd = await decide(row, viewer.userId, { status: "closed", closeReason: reason, note }, "closed", { reason });
  await notifyDecision(upd, viewer.userId, "closed");
  const [dto] = await toDtos(synthesisId, [upd]);
  return dto as Proposal;
}

/**
 * «Новое поверх текущего» — ЧЕЛОВЕКОМ, не машиной: автор устаревшего
 * предложения заводит его заново против текущего текста (значение и
 * обоснование может поправить), прежнее закрывается как superseded со
 * ссылкой на новое. Автоматического перебазирования нет: что значит старое
 * значение поверх нового текста, решает человек, а не сервер.
 */
export async function rebaseProposal(
  synthesisId: string,
  proposalId: string,
  viewer: DiscussionViewer,
  input: { value?: unknown; rationale?: unknown },
): Promise<Proposal> {
  const old = await loadRow(synthesisId, proposalId);
  if (old.authorId !== viewer.userId)
    throw new ProposalError("FORBIDDEN", tl("server.proposals.rebaseOnlyAuthor", "Завести предложение заново может только его автор"));
  assertOpen(old);
  const index = await loadAddressIndex(synthesisId);
  const oldAddress = addressFromRow(old.address);
  const resolution = await resolveAddress(index, oldAddress);
  if (baseIsCurrent(oldAddress.kind, old.base, resolution))
    throw new ProposalError("CONFLICT", tl("server.proposals.notStale", "Предложение не устарело — заводить его заново не нужно"));
  if (resolution.state === "deleted")
    throw new ProposalError("CONFLICT", tl("server.proposals.sourceObjectGone", "Объект, к которому относится источник, удалён — предложить изменение не к чему"));
  const obj = findTarget(index, {
    kind: oldAddress.kind,
    ...(resolution.currentId ? { id: resolution.currentId } : {}),
    key: oldAddress.key,
  });
  if (!obj)
    throw new ProposalError("CONFLICT", tl("server.proposals.sourceObjectGone", "Объект, к которому относится источник, удалён — предложить изменение не к чему"));
  const { address, excerpt } = await addressOf(index, obj);
  const rationale = input.rationale === undefined ? old.rationale : cleanText(input.rationale, "rationale", PROPOSAL_RATIONALE_MAX);
  let field = old.field;
  let value = old.value;
  if (old.kind === "replace") {
    ({ field, value } = await cleanReplace(synthesisId, address, old.field ?? undefined, input.value === undefined ? old.value : input.value));
  } else if (!rationale) {
    throw invalid({ rationale: tl("server.proposals.rationaleRequired", "замечанию без готовой замены обязательно обоснование") });
  }
  const created = await db.transaction(async (tx) => {
    const [ins] = await tx
      .insert(proposals)
      .values({
        synthesisId,
        authorId: viewer.userId,
        address,
        addressKind: address.kind,
        addressKey: address.key,
        excerpt,
        base: { version: address.version, hash: address.hash },
        source: old.source,
        sourceId: old.sourceId,
        sourceReviewId: old.sourceReviewId,
        kind: old.kind,
        field,
        value,
        rationale,
      })
      .returning();
    const fresh = ins as ProposalRow;
    const closed = await tx
      .update(proposals)
      .set({
        status: "closed",
        closeReason: "superseded",
        supersededBy: fresh.id,
        planId: null,
        decidedBy: viewer.userId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(proposals.id, old.id), eq(proposals.status, "open")))
      .returning({ id: proposals.id });
    if (closed.length !== 1)
      throw new ProposalError("CONFLICT", tl("server.proposals.notOpen", "Предложение уже не ждёт решения"));
    if (old.planId) await logProposalEvent(tx, old, viewer.userId, "plan_released", { planId: old.planId, reason: "stale" });
    await logProposalEvent(tx, old, viewer.userId, "closed", { reason: "superseded", to: fresh.id });
    await logProposalEvent(tx, fresh, viewer.userId, "created", { kind: fresh.kind, source: fresh.source });
    await logProposalEvent(tx, fresh, viewer.userId, "rebased", { from: old.id });
    return fresh;
  });
  await notifySafe(db, {
    type: "proposal_created",
    synthesisId,
    actorId: viewer.userId,
    recipients: await decidersOf(synthesisId),
    address,
    refKind: "proposal",
    refId: created.id,
    payload: { excerpt: (rationale || excerpt).slice(0, 80), kind: created.kind, rebasedFrom: old.id },
  });
  const [dto] = await toDtos(synthesisId, [created], index);
  return dto as Proposal;
}

/** Счётчик открытых предложений концепции (для сводки обсуждения). */
export async function openProposalIds(synthesisId: string): Promise<string[]> {
  const rows = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(and(eq(proposals.synthesisId, synthesisId), inArray(proposals.status, ["open"])));
  return rows.map((r) => r.id);
}
