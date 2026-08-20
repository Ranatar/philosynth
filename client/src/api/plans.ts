/**
 * API-функции планов редактирования. Беседа 2.3 (запрос 1, п. 8).
 *
 * Контракты: 03-specification §2.6 + server/routes/plans.ts (2.1/2.2/2.3)
 * и §2.5 + server/routes/generation.ts (2.2/2.3):
 *  - createPlan   → POST   /syntheses/:id/plans           → { plan }
 *  - getPlan      → GET    /syntheses/:id/plans/:planId   → { plan }
 *  - updatePlan   → PATCH  /syntheses/:id/plans/:planId   → { plan }
 *  - executePlan  → POST   /syntheses/:id/plans/:planId/execute → { ok }
 *                   (исполнение фоном; прогресс — WebSocket
 *                    plan_step_started/plan_step_done/plan_steps_added)
 *  - deletePlan   → DELETE /syntheses/:id/plans/:planId   → { ok }
 *  - getPlanImpact → POST /syntheses/:id/plans/impact — read-only превью
 *    каскада для живой CascadePanel (серверный analyzeImpact; транспорт
 *    добавлен беседой 2.3, прецеденты — /advice 1.5, /:key/context 1.6)
 *  - getSubsectionImpact → POST /syntheses/:id/subsection-impact —
 *    превью подраздельной перегенерации (intra/cross-зависимые, режимы,
 *    оценка; закрывает транспорт долга §12 по affectedSubs)
 *  - regenerateSubsection → POST /syntheses/:id/regenerate-subsection
 *    (§2.5, беседа 2.2) — запуск фоном, прогресс по WS section_done
 */
import type {
  CreatePlanRequest,
  EditPlan,
  PlanImpactRequest,
  PlanImpactResponse,
  SubsectionImpactRequest,
  SubsectionImpactResponse,
  UpdatePlanRequest,
} from "@philosynth/shared/types/edit-plan";

import { apiDelete, apiGet, apiPatch, apiPost } from "./client";

const base = (synthesisId: string): string =>
  `/syntheses/${encodeURIComponent(synthesisId)}`;

export function createPlan(
  synthesisId: string,
  body: CreatePlanRequest,
): Promise<EditPlan> {
  return apiPost<{ plan: EditPlan }>(`${base(synthesisId)}/plans`, body).then(
    (r) => r.plan,
  );
}

export function getPlan(
  synthesisId: string,
  planId: string,
): Promise<EditPlan> {
  return apiGet<{ plan: EditPlan }>(
    `${base(synthesisId)}/plans/${encodeURIComponent(planId)}`,
  ).then((r) => r.plan);
}

export function updatePlan(
  synthesisId: string,
  planId: string,
  body: UpdatePlanRequest,
): Promise<EditPlan> {
  return apiPatch<{ plan: EditPlan }>(
    `${base(synthesisId)}/plans/${encodeURIComponent(planId)}`,
    body,
  ).then((r) => r.plan);
}

export function executePlan(
  synthesisId: string,
  planId: string,
): Promise<void> {
  return apiPost<{ ok: true }>(
    `${base(synthesisId)}/plans/${encodeURIComponent(planId)}/execute`,
  ).then(() => undefined);
}

export function deletePlan(
  synthesisId: string,
  planId: string,
): Promise<void> {
  return apiDelete<{ ok: true }>(
    `${base(synthesisId)}/plans/${encodeURIComponent(planId)}`,
  ).then(() => undefined);
}

export function getPlanImpact(
  synthesisId: string,
  body: PlanImpactRequest,
): Promise<PlanImpactResponse> {
  return apiPost<PlanImpactResponse>(`${base(synthesisId)}/plans/impact`, body);
}

export function getSubsectionImpact(
  synthesisId: string,
  body: SubsectionImpactRequest,
): Promise<SubsectionImpactResponse> {
  return apiPost<SubsectionImpactResponse>(
    `${base(synthesisId)}/subsection-impact`,
    body,
  );
}

export function regenerateSubsection(
  synthesisId: string,
  body: {
    sectionKey: string;
    subsectionName: string;
    userNote?: string;
    includeCurrentContent?: boolean;
  },
): Promise<void> {
  return apiPost<{ ok: true }>(
    `${base(synthesisId)}/regenerate-subsection`,
    body,
  ).then(() => undefined);
}
