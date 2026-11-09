/**
 * API обсуждения и рецензий (беседа 16.3; контракт — 03 §2.17,
 * server/routes/discussion.ts, 16.1). Все маршруты — под requireAuth и
 * discussGate: чужому без участия — 404 (само наличие концепции не
 * раскрывается), участнику без `capabilities.discuss` — 403. Клиент
 * вызывает их только при `capabilities.discuss` — гейт вкладок и панели.
 *
 * Список комментариев — ПЛОСКИЙ (корни и ответы вперемешку, по createdAt),
 * ветки собирает клиент (utils/discussion.ts → threadsOf). Фильтр `status`
 * сервера применяется и к ответам (у ответов он всегда 'open'), поэтому
 * для показа решённых веток с ответами список берётся без `status`, а
 * отбор делается на клиенте. `listAllComments` обходит страницы по
 * курсору (COMMENTS_PAGE_MAX за запрос).
 */
import { COMMENTS_PAGE_MAX } from "@philosynth/shared/constants/discussion";
import type {
  Comment,
  CommentCreateInput,
  CommentList,
  CommentListQuery,
  CommentUpdateInput,
  DiscussionSummary,
  FindingCreateInput,
  FindingUpdateInput,
  Review,
  ReviewRevision,
  ReviewUpsertInput,
} from "@philosynth/shared/types/discussion";

import { apiDelete, apiGet, apiPatch, apiPost } from "./client";

const base = (synthesisId: string): string => `/syntheses/${encodeURIComponent(synthesisId)}`;

function qs(q: CommentListQuery): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/* ── Комментарии ─────────────────────────────────────────────────────── */

export const listComments = (synthesisId: string, q: CommentListQuery = {}): Promise<CommentList> =>
  apiGet<CommentList>(`${base(synthesisId)}/comments${qs(q)}`);

/** Все комментарии по фильтру — обход страниц по курсору. */
export async function listAllComments(synthesisId: string, q: Omit<CommentListQuery, "cursor" | "limit"> = {}): Promise<Comment[]> {
  const out: Comment[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 50; i += 1) {
    const page = await listComments(synthesisId, { ...q, limit: COMMENTS_PAGE_MAX, ...(cursor ? { cursor } : {}) });
    out.push(...page.comments);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

export const createComment = (synthesisId: string, input: CommentCreateInput): Promise<Comment> =>
  apiPost<Comment>(`${base(synthesisId)}/comments`, input);

export const updateComment = (synthesisId: string, commentId: string, input: CommentUpdateInput): Promise<Comment> =>
  apiPatch<Comment>(`${base(synthesisId)}/comments/${commentId}`, input);

export const deleteComment = (synthesisId: string, commentId: string): Promise<{ ok: true; removed: boolean }> =>
  apiDelete(`${base(synthesisId)}/comments/${commentId}`);

export const resolveThread = (synthesisId: string, commentId: string): Promise<Comment> =>
  apiPost<Comment>(`${base(synthesisId)}/comments/${commentId}/resolve`);

export const reopenThread = (synthesisId: string, commentId: string): Promise<Comment> =>
  apiPost<Comment>(`${base(synthesisId)}/comments/${commentId}/reopen`);

export const hideComment = (synthesisId: string, commentId: string): Promise<Comment> =>
  apiPost<Comment>(`${base(synthesisId)}/comments/${commentId}/hide`);

export const unhideComment = (synthesisId: string, commentId: string): Promise<Comment> =>
  apiPost<Comment>(`${base(synthesisId)}/comments/${commentId}/unhide`);

/* ── Рецензии ────────────────────────────────────────────────────────── */

export const listReviews = (synthesisId: string): Promise<Review[]> =>
  apiGet<Review[]>(`${base(synthesisId)}/reviews`);

export const createReview = (synthesisId: string, input: ReviewUpsertInput = {}): Promise<Review> =>
  apiPost<Review>(`${base(synthesisId)}/reviews`, input);

export const getReview = (synthesisId: string, reviewId: string): Promise<Review> =>
  apiGet<Review>(`${base(synthesisId)}/reviews/${reviewId}`);

export const updateReview = (synthesisId: string, reviewId: string, input: ReviewUpsertInput): Promise<Review> =>
  apiPatch<Review>(`${base(synthesisId)}/reviews/${reviewId}`, input);

export const deleteReview = (synthesisId: string, reviewId: string): Promise<{ ok: true }> =>
  apiDelete(`${base(synthesisId)}/reviews/${reviewId}`);

export const publishReview = (synthesisId: string, reviewId: string): Promise<Review> =>
  apiPost<Review>(`${base(synthesisId)}/reviews/${reviewId}/publish`);

export const withdrawReview = (synthesisId: string, reviewId: string): Promise<Review> =>
  apiPost<Review>(`${base(synthesisId)}/reviews/${reviewId}/withdraw`);

export const listRevisions = (synthesisId: string, reviewId: string): Promise<ReviewRevision[]> =>
  apiGet<ReviewRevision[]>(`${base(synthesisId)}/reviews/${reviewId}/revisions`);

export const addFinding = (synthesisId: string, reviewId: string, input: FindingCreateInput): Promise<Review> =>
  apiPost<Review>(`${base(synthesisId)}/reviews/${reviewId}/findings`, input);

export const updateFinding = (synthesisId: string, reviewId: string, findingId: string, input: FindingUpdateInput): Promise<Review> =>
  apiPatch<Review>(`${base(synthesisId)}/reviews/${reviewId}/findings/${findingId}`, input);

export const deleteFinding = (synthesisId: string, reviewId: string, findingId: string): Promise<Review> =>
  apiDelete<Review>(`${base(synthesisId)}/reviews/${reviewId}/findings/${findingId}`);

/* ── Сводка (пометки у места) ────────────────────────────────────────── */

export const getDiscussionSummary = (synthesisId: string): Promise<DiscussionSummary> =>
  apiGet<DiscussionSummary>(`${base(synthesisId)}/discussion/summary`);
