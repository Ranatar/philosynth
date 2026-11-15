/**
 * Предложения изменений (беседа 17.1; 03 §2.20) — под /api/syntheses.
 *
 *   GET    /:id/proposals                 список (status, addressKind, addressKey, mine)
 *   POST   /:id/proposals                 создать                       — discuss
 *   GET    /:id/proposals/:pid            одно, с журналом событий      — discuss
 *   POST   /:id/proposals/:pid/accept     черновик плана правок         — edit
 *   POST   /:id/proposals/:pid/reject     отклонить { note? }           — edit
 *   POST   /:id/proposals/:pid/close      закрыть { reason?, note? }    — edit
 *   POST   /:id/proposals/:pid/withdraw   снять                         — автор
 *   POST   /:id/proposals/:pid/rebase     новое поверх текущего { value?, rationale? } — автор
 *
 * Гейт входа — право обсуждения (модуль прав, как у комментариев 16.1);
 * право правки у принятия/отклонения проверяет служба по тем же
 * capabilities. Принятие НЕ исполняет: ответ — предложение и ЧЕРНОВИК
 * плана, дальше — обычные маршруты планов (§2.6).
 */
import { Hono } from "hono";
import type { Context } from "hono";

import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import { loadCapabilities } from "../services/capabilities.js";
import type { DiscussionViewer } from "../services/discussion.js";
import {
  ProposalError,
  acceptProposal,
  closeProposal,
  createProposal,
  getProposal,
  listProposals,
  parseProposalListQuery,
  proposalErrorStatus,
  rebaseProposal,
  rejectProposal,
  withdrawProposal,
} from "../services/proposals.js";
import { forbiddenJson, isUuid, notFoundJson } from "./syntheses.js";
import type { ProposalAcceptInput, ProposalCreateInput, ProposalsResponse } from "@philosynth/shared/types/proposals";
import { tl } from "@philosynth/shared/i18n/t";

export const proposalsRoutes = new Hono<AuthEnv>();

async function gate(c: Context, id: string, userId: string): Promise<{ viewer: DiscussionViewer } | { res: Response }> {
  if (!isUuid(id)) return { res: c.json(notFoundJson, 404) };
  const loaded = await loadCapabilities(id, userId);
  if (!loaded) return { res: c.json(notFoundJson, 404) };
  if (!loaded.capabilities.discuss) return { res: c.json(forbiddenJson, 403) };
  return { viewer: { userId, capabilities: loaded.capabilities } };
}

function serviceError(c: Context, err: unknown): Response {
  if (err instanceof ProposalError)
    return c.json(
      { error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) },
      proposalErrorStatus(err.code),
    );
  throw err;
}

async function readBody(c: Context): Promise<Record<string, unknown>> {
  try {
    const body = (await c.req.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const badProposalId = (c: Context) =>
  c.json({ error: tl("server.proposals.notFound", "Предложение не найдено"), code: "NOT_FOUND" }, 404);

type Handler = (c: Context, viewer: DiscussionViewer, id: string, pid: string) => Promise<Response>;

function handler(needsPid: boolean, fn: Handler) {
  return async (c: Context<AuthEnv>): Promise<Response> => {
    const user = c.get("user");
    const id = c.req.param("id") ?? "";
    const g = await gate(c, id, user.id);
    if ("res" in g) return g.res;
    const pid = c.req.param("pid") ?? "";
    if (needsPid && !isUuid(pid)) return badProposalId(c);
    try {
      return await fn(c, g.viewer, id, pid);
    } catch (err) {
      return serviceError(c, err);
    }
  };
}

proposalsRoutes.get(
  "/:id/proposals",
  requireAuth,
  handler(false, async (c, viewer, id) => {
    const res: ProposalsResponse = {
      proposals: await listProposals(id, viewer, parseProposalListQuery(c.req.query())),
    };
    return c.json(res);
  }),
);

proposalsRoutes.post(
  "/:id/proposals",
  requireAuth,
  handler(false, async (c, viewer, id) =>
    c.json(await createProposal(id, viewer, (await readBody(c)) as unknown as ProposalCreateInput), 201),
  ),
);

proposalsRoutes.get(
  "/:id/proposals/:pid",
  requireAuth,
  handler(true, async (c, _viewer, id, pid) => c.json(await getProposal(id, pid))),
);

proposalsRoutes.post(
  "/:id/proposals/:pid/accept",
  requireAuth,
  handler(true, async (c, viewer, id, pid) =>
    c.json(await acceptProposal(id, pid, viewer, (await readBody(c)) as ProposalAcceptInput), 201),
  ),
);

proposalsRoutes.post(
  "/:id/proposals/:pid/reject",
  requireAuth,
  handler(true, async (c, viewer, id, pid) => c.json(await rejectProposal(id, pid, viewer, (await readBody(c))["note"]))),
);

proposalsRoutes.post(
  "/:id/proposals/:pid/close",
  requireAuth,
  handler(true, async (c, viewer, id, pid) => {
    const body = await readBody(c);
    return c.json(await closeProposal(id, pid, viewer, body["reason"], body["note"]));
  }),
);

proposalsRoutes.post(
  "/:id/proposals/:pid/withdraw",
  requireAuth,
  handler(true, async (c, viewer, id, pid) => c.json(await withdrawProposal(id, pid, viewer))),
);

proposalsRoutes.post(
  "/:id/proposals/:pid/rebase",
  requireAuth,
  handler(true, async (c, viewer, id, pid) => c.json(await rebaseProposal(id, pid, viewer, await readBody(c)), 201)),
);
