/**
 * Роуты обсуждения и рецензий (беседа 16.1; 03 §2.17; врезка «Фаза 16»).
 *
 *   GET    /syntheses/:id/comments                     ?kind&key&status&author&cursor&limit → CommentList
 *   POST   /syntheses/:id/comments                     CommentCreateInput → Comment (201)
 *   PATCH  /syntheses/:id/comments/:cid                CommentUpdateInput → Comment
 *   DELETE /syntheses/:id/comments/:cid                → { ok, removed }
 *   POST   /syntheses/:id/comments/:cid/resolve        → Comment
 *   POST   /syntheses/:id/comments/:cid/reopen         → Comment
 *   POST   /syntheses/:id/comments/:cid/hide           → Comment   (владелец)
 *   POST   /syntheses/:id/comments/:cid/unhide         → Comment   (владелец)
 *   GET    /syntheses/:id/reviews                      → Review[]
 *   POST   /syntheses/:id/reviews                      ReviewUpsertInput → Review (201, черновик)
 *   GET    /syntheses/:id/reviews/:rid                 → Review
 *   PATCH  /syntheses/:id/reviews/:rid                 ReviewUpsertInput → Review
 *   DELETE /syntheses/:id/reviews/:rid                 → { ok }   (только черновик)
 *   POST   /syntheses/:id/reviews/:rid/publish         → Review
 *   POST   /syntheses/:id/reviews/:rid/withdraw        → Review
 *   GET    /syntheses/:id/reviews/:rid/revisions       → ReviewRevision[]
 *   POST   /syntheses/:id/reviews/:rid/findings        FindingCreateInput → Review
 *   PATCH  /syntheses/:id/reviews/:rid/findings/:fid   FindingUpdateInput → Review
 *   DELETE /syntheses/:id/reviews/:rid/findings/:fid   → Review
 *   GET    /syntheses/:id/discussion/summary           → DiscussionSummary
 *
 * Доступ — ВСЕГДА через синтез и модуль прав: гость → 401 (requireAuth);
 * не-UUID / нет строки → 404; право discuss (владелец или активный
 * участник) нет → 403 FORBIDDEN — и на публичной концепции: читатель
 * обсуждения не видит (решение 16.1: участники только по приглашению).
 * Скрытие комментариев — право manage (владелец). Автор ли это — решает
 * сервис по строке. Активная операция над синтезом обсуждению не мешает
 * (409 нет): документ отсюда не меняется.
 *
 * Тела — обычный текст; разметка не принимается и не чистится (плоский
 * текст экранирует клиент). Ошибки сервиса → коды §4.3
 * (NOT_FOUND 404, FORBIDDEN 403, VALIDATION_ERROR 400, CONFLICT 409).
 */
import { Hono } from "hono";
import type { Context } from "hono";

import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import { loadCapabilities } from "../services/capabilities.js";
import {
  DiscussionError,
  addFinding,
  createComment,
  createReview,
  deleteComment,
  deleteFinding,
  deleteReview,
  discussionErrorStatus,
  discussionSummary,
  getReview,
  listComments,
  listReviews,
  listRevisions,
  parseCommentListQuery,
  publishReview,
  setCommentHidden,
  setThreadResolved,
  updateComment,
  updateFinding,
  updateReview,
  withdrawReview,
  type DiscussionViewer,
} from "../services/discussion.js";
import { forbiddenJson, isUuid, notFoundJson } from "./syntheses.js";
import { tl } from "@philosynth/shared/i18n/t";

export const discussionRoutes = new Hono<AuthEnv>();

/** Гейт обсуждения: 404 / 403, иначе смотрящий с правами синтеза. */
async function discussGate(
  c: Context,
  id: string,
  userId: string,
): Promise<{ viewer: DiscussionViewer } | { res: Response }> {
  if (!isUuid(id)) return { res: c.json(notFoundJson, 404) };
  const loaded = await loadCapabilities(id, userId);
  if (!loaded) return { res: c.json(notFoundJson, 404) };
  if (!loaded.capabilities.discuss) return { res: c.json(forbiddenJson, 403) };
  return { viewer: { userId, capabilities: loaded.capabilities } };
}

function serviceError(c: Context, err: unknown): Response {
  if (err instanceof DiscussionError)
    return c.json(
      { error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) },
      discussionErrorStatus(err.code),
    );
  throw err;
}

async function readJson(c: Context): Promise<Record<string, unknown> | Response> {
  try {
    const body = (await c.req.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body))
      return c.json({ error: tl("common.invalidData", "Невалидные данные"), code: "VALIDATION_ERROR" }, 400);
    return body as Record<string, unknown>;
  } catch {
    return c.json({ error: tl("common.invalidJson", "Невалидный JSON"), code: "VALIDATION_ERROR" }, 400);
  }
}

const badId = (c: Context, what: string) => c.json({ error: tl("server.discussion.notFound", "{what} не найден", { what }), code: "NOT_FOUND" }, 404);

type Handler = (c: Context, viewer: DiscussionViewer, body: Record<string, unknown>) => Promise<Response>;

/** Общий каркас: авторизация, гейт, тело (если нужно), ошибки сервиса. */
function handler(withBody: boolean, fn: Handler) {
  return async (c: Context<AuthEnv>): Promise<Response> => {
    const user = c.get("user");
    const gate = await discussGate(c, c.req.param("id") ?? "", user.id);
    if ("res" in gate) return gate.res;
    let body: Record<string, unknown> = {};
    if (withBody) {
      const parsed = await readJson(c);
      if (parsed instanceof Response) return parsed;
      body = parsed;
    }
    try {
      return await fn(c, gate.viewer, body);
    } catch (err) {
      return serviceError(c, err);
    }
  };
}

const sid = (c: Context): string => c.req.param("id") ?? "";

/* ── Комментарии ─────────────────────────────────────────────────────── */

discussionRoutes.get(
  "/:id/comments",
  requireAuth,
  handler(false, async (c, viewer) => c.json(await listComments(sid(c), parseCommentListQuery(c.req.query()), viewer))),
);

discussionRoutes.post(
  "/:id/comments",
  requireAuth,
  handler(true, async (c, viewer, body) => c.json(await createComment(sid(c), viewer, body as never), 201)),
);

const cid = (c: Context): string | Response => {
  const v = c.req.param("cid") ?? "";
  return isUuid(v) ? v : badId(c, tl("server.discussion.comment", "Комментарий"));
};

discussionRoutes.patch(
  "/:id/comments/:cid",
  requireAuth,
  handler(true, async (c, viewer, body) => {
    const id = cid(c);
    if (id instanceof Response) return id;
    return c.json(await updateComment(sid(c), id, viewer, body as never));
  }),
);

discussionRoutes.delete(
  "/:id/comments/:cid",
  requireAuth,
  handler(false, async (c, viewer) => {
    const id = cid(c);
    if (id instanceof Response) return id;
    return c.json(await deleteComment(sid(c), id, viewer));
  }),
);

for (const [action, resolved] of [
  ["resolve", true],
  ["reopen", false],
] as const) {
  discussionRoutes.post(
    `/:id/comments/:cid/${action}`,
    requireAuth,
    handler(false, async (c, viewer) => {
      const id = cid(c);
      if (id instanceof Response) return id;
      return c.json(await setThreadResolved(sid(c), id, viewer, resolved));
    }),
  );
}

for (const [action, hidden] of [
  ["hide", true],
  ["unhide", false],
] as const) {
  discussionRoutes.post(
    `/:id/comments/:cid/${action}`,
    requireAuth,
    handler(false, async (c, viewer) => {
      const id = cid(c);
      if (id instanceof Response) return id;
      if (!viewer.capabilities.manage) return c.json(forbiddenJson, 403);
      return c.json(await setCommentHidden(sid(c), id, viewer, hidden));
    }),
  );
}

/* ── Рецензии ────────────────────────────────────────────────────────── */

const rid = (c: Context): string | Response => {
  const v = c.req.param("rid") ?? "";
  return isUuid(v) ? v : badId(c, tl("server.discussion.review", "Рецензия"));
};
const fid = (c: Context): string | Response => {
  const v = c.req.param("fid") ?? "";
  return isUuid(v) ? v : badId(c, tl("server.discussion.finding", "Замечание"));
};

discussionRoutes.get("/:id/reviews", requireAuth, handler(false, async (c, viewer) => c.json(await listReviews(sid(c), viewer))));

discussionRoutes.post(
  "/:id/reviews",
  requireAuth,
  handler(true, async (c, viewer, body) => c.json(await createReview(sid(c), viewer, body as never), 201)),
);

discussionRoutes.get(
  "/:id/reviews/:rid",
  requireAuth,
  handler(false, async (c, viewer) => {
    const r = rid(c);
    if (r instanceof Response) return r;
    return c.json(await getReview(sid(c), r, viewer));
  }),
);

discussionRoutes.patch(
  "/:id/reviews/:rid",
  requireAuth,
  handler(true, async (c, viewer, body) => {
    const r = rid(c);
    if (r instanceof Response) return r;
    return c.json(await updateReview(sid(c), r, viewer, body as never));
  }),
);

discussionRoutes.delete(
  "/:id/reviews/:rid",
  requireAuth,
  handler(false, async (c, viewer) => {
    const r = rid(c);
    if (r instanceof Response) return r;
    return c.json(await deleteReview(sid(c), r, viewer));
  }),
);

discussionRoutes.post(
  "/:id/reviews/:rid/publish",
  requireAuth,
  handler(false, async (c, viewer) => {
    const r = rid(c);
    if (r instanceof Response) return r;
    return c.json(await publishReview(sid(c), r, viewer));
  }),
);

discussionRoutes.post(
  "/:id/reviews/:rid/withdraw",
  requireAuth,
  handler(false, async (c, viewer) => {
    const r = rid(c);
    if (r instanceof Response) return r;
    return c.json(await withdrawReview(sid(c), r, viewer));
  }),
);

discussionRoutes.get(
  "/:id/reviews/:rid/revisions",
  requireAuth,
  handler(false, async (c, viewer) => {
    const r = rid(c);
    if (r instanceof Response) return r;
    return c.json(await listRevisions(sid(c), r, viewer));
  }),
);

discussionRoutes.post(
  "/:id/reviews/:rid/findings",
  requireAuth,
  handler(true, async (c, viewer, body) => {
    const r = rid(c);
    if (r instanceof Response) return r;
    return c.json(await addFinding(sid(c), r, viewer, body as never), 201);
  }),
);

discussionRoutes.patch(
  "/:id/reviews/:rid/findings/:fid",
  requireAuth,
  handler(true, async (c, viewer, body) => {
    const r = rid(c);
    if (r instanceof Response) return r;
    const f = fid(c);
    if (f instanceof Response) return f;
    return c.json(await updateFinding(sid(c), r, f, viewer, body as never));
  }),
);

discussionRoutes.delete(
  "/:id/reviews/:rid/findings/:fid",
  requireAuth,
  handler(false, async (c, viewer) => {
    const r = rid(c);
    if (r instanceof Response) return r;
    const f = fid(c);
    if (f instanceof Response) return f;
    return c.json(await deleteFinding(sid(c), r, f, viewer));
  }),
);

/* ── Сводка ──────────────────────────────────────────────────────────── */

discussionRoutes.get("/:id/discussion/summary", requireAuth, handler(false, async (c) => c.json(await discussionSummary(sid(c)))));
