/**
 * Роуты участников концепции (беседа 16.2, первый запрос; 03 §2.18).
 *
 *   GET    /syntheses/shared                                 → { items: SharedSynthesisPreview[] }   (мои участия)
 *   GET    /syntheses/:id/members                            → MembersView            (владелец)
 *   POST   /syntheses/:id/members         MemberInviteInput  → MemberInviteResult 201 (владелец; mailLimiter)
 *   PATCH  /syntheses/:id/members/:mid    { role }           → MemberView             (владелец)
 *   DELETE /syntheses/:id/members/:mid                       → { ok, removed }        (владелец: отзыв / исключение)
 *   POST   /syntheses/:id/members/:mid/resend                → { ok, sent }           (владелец; mailLimiter)
 *   DELETE /syntheses/:id/invitations/:tid                   → { ok }                 (владелец; адрес без аккаунта)
 *   POST   /syntheses/:id/invitations/:tid/resend            → { ok, sent, invitation } (владелец; mailLimiter)
 *   GET    /syntheses/:id/membership                         → MyMembership           (приглашённый/участник)
 *   POST   /syntheses/:id/membership/accept                  → MyMembership
 *   POST   /syntheses/:id/membership/decline                 → { ok }
 *
 * Доступ: гость → 401 (requireAuth); не-UUID / нет строки → 404; не
 * владелец на управляющих роутах → 403 FORBIDDEN (решает canManageSynthesis;
 * сторож 5ax). Конфликты (владелец, уже участник, уже приглашён) → 409
 * CONFLICT. Монтируется ДО synthesesRoutes: `/shared` иначе перехватил бы
 * `GET /:id` (как `/public` внутри synthesesRoutes).
 */
import { Hono } from "hono";
import type { Context } from "hono";

import { db } from "../db/index.js";
import { syntheses } from "../db/schema.js";
import { inArray } from "drizzle-orm";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  MembersError,
  acceptInvitation,
  changeMemberRole,
  declineInvitation,
  inviteMember,
  listMembers,
  listMyMemberships,
  membersErrorStatus,
  myMembership,
  removeMember,
  resendInvitation,
  resendMemberInvite,
  revokeInvitation,
} from "../services/members.js";
import { mailLimiter } from "./auth.js";
import {
  isUuid,
  loadAuthorNamesFor,
  loadConceptParentFlags,
  loadPhilosophersFor,
  notFoundJson,
  toPreview,
} from "./syntheses.js";
import { tl } from "@philosynth/shared/i18n/t";
import type { SharedSynthesisPreview } from "@philosynth/shared/types/notifications";

export const membersRoutes = new Hono<AuthEnv>();

function serviceError(c: Context, err: unknown): Response {
  if (err instanceof MembersError)
    return c.json(
      { error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) },
      membersErrorStatus(err.code),
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

type Handler = (c: Context, userId: string, body: Record<string, unknown>) => Promise<Response>;

/** Каркас: UUID синтеза (и вложенного id, если задан), тело, ошибки сервиса. */
function handler(withBody: boolean, fn: Handler, nested?: "mid" | "tid") {
  return async (c: Context<AuthEnv>): Promise<Response> => {
    const user = c.get("user");
    if (!isUuid(c.req.param("id") ?? "")) return c.json(notFoundJson, 404);
    if (nested && !isUuid(c.req.param(nested) ?? "")) return c.json(notFoundJson, 404);
    let body: Record<string, unknown> = {};
    if (withBody) {
      const parsed = await readJson(c);
      if (parsed instanceof Response) return parsed;
      body = parsed;
    }
    try {
      return await fn(c, user.id, body);
    } catch (err) {
      return serviceError(c, err);
    }
  };
}

const sid = (c: Context): string => c.req.param("id") ?? "";
const mid = (c: Context): string => c.req.param("mid") ?? "";
const tid = (c: Context): string => c.req.param("tid") ?? "";

/* ── Каталог «Со мной поделились» ────────────────────────────────────── */

membersRoutes.get("/shared", requireAuth, async (c) => {
  const user = c.get("user");
  const memberships = await listMyMemberships(user.id);
  if (memberships.length === 0) return c.json({ items: [] as SharedSynthesisPreview[] });
  const ids = memberships.map((m) => m.synthesisId);
  const rows = await db.select().from(syntheses).where(inArray(syntheses.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const philMap = await loadPhilosophersFor(ids);
  const metaFlags = await loadConceptParentFlags(ids);
  const authors = await loadAuthorNamesFor(rows);
  const items: SharedSynthesisPreview[] = [];
  for (const m of memberships) {
    const r = byId.get(m.synthesisId);
    if (!r) continue;
    items.push({
      ...toPreview(r, philMap.get(r.id) ?? [], metaFlags.has(r.id), authors.get(r.id)),
      myRole: m.role,
      myStatus: m.status,
    });
  }
  return c.json({ items });
});

/* ── Владелец ────────────────────────────────────────────────────────── */

membersRoutes.get("/:id/members", requireAuth, handler(false, async (c, uid) => c.json(await listMembers(sid(c), uid))));

membersRoutes.post(
  "/:id/members",
  mailLimiter,
  requireAuth,
  handler(true, async (c, uid, body) => c.json(await inviteMember(sid(c), uid, body), 201)),
);

membersRoutes.patch(
  "/:id/members/:mid",
  requireAuth,
  handler(true, async (c, uid, body) => c.json(await changeMemberRole(sid(c), uid, mid(c), body)), "mid"),
);

membersRoutes.delete(
  "/:id/members/:mid",
  requireAuth,
  handler(false, async (c, uid) => c.json(await removeMember(sid(c), uid, mid(c))), "mid"),
);

membersRoutes.post(
  "/:id/members/:mid/resend",
  mailLimiter,
  requireAuth,
  handler(false, async (c, uid) => c.json(await resendMemberInvite(sid(c), uid, mid(c))), "mid"),
);

membersRoutes.delete(
  "/:id/invitations/:tid",
  requireAuth,
  handler(false, async (c, uid) => c.json(await revokeInvitation(sid(c), uid, tid(c))), "tid"),
);

membersRoutes.post(
  "/:id/invitations/:tid/resend",
  mailLimiter,
  requireAuth,
  handler(false, async (c, uid) => c.json(await resendInvitation(sid(c), uid, tid(c))), "tid"),
);

/* ── Приглашённый ────────────────────────────────────────────────────── */

membersRoutes.get("/:id/membership", requireAuth, handler(false, async (c, uid) => c.json(await myMembership(sid(c), uid))));
membersRoutes.post("/:id/membership/accept", requireAuth, handler(false, async (c, uid) => c.json(await acceptInvitation(sid(c), uid))));
membersRoutes.post("/:id/membership/decline", requireAuth, handler(false, async (c, uid) => c.json(await declineInvitation(sid(c), uid))));
