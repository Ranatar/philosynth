/**
 * Связь «предложение ↔ план правок» (беседа 17.1, п.5) — нижний слой без
 * зависимости от планировщика и исполнителя (их зовут оба, круга нет).
 *
 * Предложение исполняет ТОЛЬКО план правок: принятие создаёт черновик плана
 * со ссылкой `StepProposalRef` в шаге и ставит `proposals.plan_id`; статус
 * остаётся 'open'. 'accepted' пишет исполнитель плана ПОСЛЕ успешного шага
 * (`settleProposalStep`). План удалён, остановлен, шаг снят или не состоялся
 * — предложение ОСВОБОЖДАЕТСЯ (`plan_id = NULL`, событие `plan_released`) и
 * снова ждёт решения. Отклонения машиной здесь нет: 'rejected' пишет только
 * действие человека (services/proposals.ts: rejectProposal).
 */
import { and, eq, inArray } from "drizzle-orm";

import { db, schema } from "../db/index.js";

import type { DiscussionAddress } from "@philosynth/shared/types/discussion";
import type { EditStep, StepProposalRef } from "@philosynth/shared/types/edit-plan";
import type { ProposalBase } from "@philosynth/shared/types/proposals";
import type { ProposalOrigin } from "@philosynth/shared/types/elements";

const { proposals, proposalEvents } = schema;

type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Почему предложение вышло из плана — параметр события `plan_released`. */
export type ProposalReleaseReason =
  | "plan_deleted"
  | "plan_stopped"
  | "step_skipped"
  | "step_failed"
  | "stale"
  | "not_open"
  | "member_removed";

export async function logProposalEvent(
  tx: DbLike,
  p: { id: string; synthesisId: string },
  actorId: string | null,
  type: (typeof proposalEvents.$inferInsert)["type"],
  payload: Record<string, unknown> = {},
): Promise<void> {
  await tx.insert(proposalEvents).values({
    proposalId: p.id,
    synthesisId: p.synthesisId,
    actorId,
    type,
    payload,
  });
}

/** Ссылки на предложения всех шагов плана. */
export function proposalRefsOf(steps: readonly EditStep[]): StepProposalRef[] {
  return steps.flatMap((s) => s.proposals ?? []);
}

/**
 * Освободить предложения плана: все открытые с этим plan_id (или только
 * названные) возвращаются в ожидание решения. Статус НЕ меняется.
 */
export async function releaseProposalsOfPlan(
  synthesisId: string,
  planId: string,
  actorId: string | null,
  reason: ProposalReleaseReason,
  onlyIds?: readonly string[],
): Promise<string[]> {
  if (onlyIds && onlyIds.length === 0) return [];
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(proposals)
      .set({ planId: null, updatedAt: new Date() })
      .where(
        and(
          eq(proposals.synthesisId, synthesisId),
          eq(proposals.planId, planId),
          eq(proposals.status, "open"),
          ...(onlyIds ? [inArray(proposals.id, [...onlyIds])] : []),
        ),
      )
      .returning({ id: proposals.id, synthesisId: proposals.synthesisId });
    for (const r of rows) await logProposalEvent(tx, r, actorId, "plan_released", { planId, reason });
    return rows.map((r) => r.id);
  });
}

export interface ProposalStepRow {
  id: string;
  synthesisId: string;
  authorId: string | null;
  status: string;
  planId: string | null;
  address: DiscussionAddress;
  base: ProposalBase;
}

/** Строки предложений шага (для проверки перед исполнением). */
export async function loadProposalsOfStep(
  synthesisId: string,
  refs: readonly StepProposalRef[],
): Promise<ProposalStepRow[]> {
  if (refs.length === 0) return [];
  return db
    .select({
      id: proposals.id,
      synthesisId: proposals.synthesisId,
      authorId: proposals.authorId,
      status: proposals.status,
      planId: proposals.planId,
      address: proposals.address,
      base: proposals.base,
    })
    .from(proposals)
    .where(and(eq(proposals.synthesisId, synthesisId), inArray(proposals.id, refs.map((r) => r.id))));
}

/**
 * Шаг плана по предложению исполнен: предложение — 'accepted' (решил
 * исполнитель), событие `accepted`. Возвращает принятые строки — их авторам
 * исполнитель шлёт уведомление proposal_decided. Только открытые и стоящие
 * в ЭТОМ плане: повторный зов безвреден.
 */
export async function settleProposalStep(
  synthesisId: string,
  planId: string,
  stepIndex: number,
  stepType: string,
  refs: readonly StepProposalRef[],
  actorId: string,
): Promise<{ id: string; authorId: string | null }[]> {
  if (refs.length === 0) return [];
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(proposals)
      .set({ status: "accepted", decidedBy: actorId, decidedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(proposals.synthesisId, synthesisId),
          eq(proposals.planId, planId),
          eq(proposals.status, "open"),
          inArray(proposals.id, refs.map((r) => r.id)),
        ),
      )
      .returning({ id: proposals.id, synthesisId: proposals.synthesisId, authorId: proposals.authorId });
    for (const r of rows) await logProposalEvent(tx, r, actorId, "accepted", { planId, stepIndex, stepType });
    return rows.map((r) => ({ id: r.id, authorId: r.authorId }));
  });
}

/** Происхождение версии, записанной шагом по предложению (первая ссылка
 *  шага; остальные — в журнале событий и в version_marker). */
export function proposalOriginOf(
  ref: StepProposalRef,
  planId: string,
  stepIndex: number,
  stepType: ProposalOrigin["stepType"],
): ProposalOrigin {
  return {
    kind: "proposal",
    proposalId: ref.id,
    authorId: ref.authorId,
    source: ref.source,
    sourceId: ref.sourceId ?? null,
    ...(ref.sourceReviewId ? { reviewId: ref.sourceReviewId } : {}),
    proposalKind: ref.kind,
    rationale: ref.rationale,
    planId,
    stepIndex,
    stepType,
  };
}

/* ── Основа предложения против живого документа ──────────────────────── */

/**
 * Основа совпадает с текущим состоянием адресата? Правило врезки «Фаза 17»:
 * у ЭЛЕМЕНТА основа — номер версии (`element_versions.version`): любая правка
 * элемента после записи предложения делает его устаревшим, даже если правили
 * другое поле; у раздела и подраздела — хэш содержимого (как адрес Фазы 16).
 * Адресат удалён — не совпадает. Единственное место правила: его зовут чтение
 * (stale), принятие, «новое поверх текущего» и заслон исполнителя плана.
 */
export function baseIsCurrent(
  addressKind: string,
  base: ProposalBase,
  resolution: { state: string; currentVersion: number | null },
): boolean {
  if (resolution.state !== "current") return false;
  if (addressKind === "section" || addressKind === "subsection") return true;
  return (base.version ?? 0) === (resolution.currentVersion ?? 0);
}

/* ── Заслон исполнения шага по предложению ───────────────────────────── */

/**
 * Перед шагом по предложению: каждое предложение шага обязано быть открытым,
 * стоять в ЭТОМ плане и не устареть (адрес разрешается против живого
 * документа; основа — хэш адреса на момент записи предложения). Иначе шаг НЕ
 * исполняется: устаревшее предложение принять нельзя, и исполнитель плана —
 * не обход этого правила (план мог пролежать черновиком, пока документ
 * правили). Возвращает причины по предложениям; пустой список — можно.
 */
export async function proposalStepBlockers(
  synthesisId: string,
  planId: string,
  refs: readonly StepProposalRef[],
): Promise<{ id: string; reason: "stale" | "not_open" }[]> {
  if (refs.length === 0) return [];
  const { loadAddressIndex, resolveAddress } = await import("./discussion-address.js");
  const rows = await loadProposalsOfStep(synthesisId, refs);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const index = await loadAddressIndex(synthesisId);
  const out: { id: string; reason: "stale" | "not_open" }[] = [];
  for (const ref of refs) {
    const row = byId.get(ref.id);
    if (!row || row.status !== "open" || row.planId !== planId) {
      out.push({ id: ref.id, reason: "not_open" });
      continue;
    }
    const res = await resolveAddress(index, row.address);
    if (!baseIsCurrent(row.address.kind, row.base, res)) out.push({ id: ref.id, reason: "stale" });
  }
  return out;
}

/* ── Исключение участника ────────────────────────────────────────────── */

/**
 * Участник исключён (или сам вышел): его ОТКРЫТЫЕ предложения закрываются с
 * причиной `member_removed` — той же транзакцией, что удаление строки
 * участия (03 §2.18). Предложения ДРУГИХ авторов, стоявшие в его черновиках
 * планов, освобождаются: его планы больше не исполнятся (loadPlanRow).
 * Принятые, отклонённые, снятые — история, не трогаются.
 */
export async function closeProposalsOfMember(
  tx: DbLike,
  synthesisId: string,
  memberUserId: string,
  actorId: string | null,
): Promise<{ closed: number; released: number }> {
  const closed = await tx
    .update(proposals)
    .set({
      status: "closed",
      closeReason: "member_removed",
      planId: null,
      decidedBy: actorId,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(proposals.synthesisId, synthesisId), eq(proposals.authorId, memberUserId), eq(proposals.status, "open")))
    .returning({ id: proposals.id, synthesisId: proposals.synthesisId });
  for (const r of closed) await logProposalEvent(tx, r, actorId, "closed", { reason: "member_removed" });

  const released = await releaseProposalsOfMemberPlans(tx, synthesisId, memberUserId, actorId);
  return { closed: closed.length, released };
}

/**
 * Участник потерял право правки (исключён, понижен до рецензента): его планы
 * больше не исполнятся (loadPlanRow), и предложения, стоявшие в них,
 * освобождаются — иначе они висели бы «в черновике плана», который никто не
 * может ни исполнить, ни удалить. Собственные предложения участника НЕ
 * трогаются (рецензент по-прежнему обсуждает и предлагает).
 */
export async function releaseProposalsOfMemberPlans(
  tx: DbLike,
  synthesisId: string,
  memberUserId: string,
  actorId: string | null,
): Promise<number> {
  const { editPlans } = schema;
  const plans = await tx
    .select({ id: editPlans.id })
    .from(editPlans)
    .where(and(eq(editPlans.synthesisId, synthesisId), eq(editPlans.userId, memberUserId)));
  if (plans.length === 0) return 0;
  const rows = await tx
    .update(proposals)
    .set({ planId: null, updatedAt: new Date() })
    .where(
      and(
        eq(proposals.synthesisId, synthesisId),
        eq(proposals.status, "open"),
        inArray(proposals.planId, plans.map((p) => p.id)),
      ),
    )
    .returning({ id: proposals.id, synthesisId: proposals.synthesisId });
  for (const r of rows) await logProposalEvent(tx, r, actorId, "plan_released", { reason: "member_removed" });
  return rows.length;
}
