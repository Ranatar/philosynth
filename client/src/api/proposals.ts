/**
 * Предложения изменений — маршруты 03 §2.20 (сервер 17.1; клиент 17.2).
 *
 * Все — под правом обсуждения (capabilities.discuss); принять, отклонить и
 * закрыть — под правом правки, проверяет сервер. «Принять» НЕ меняет
 * документ: ответ несёт черновик плана правок, дальше — обычный путь плана
 * (EditModal: предпросмотр с каскадом → подтверждение → исполнение). Прямого
 * PATCH элемента или подраздела из этого модуля нет и быть не должно
 * (сторож 4bq).
 */
import type {
  Proposal,
  ProposalAcceptInput,
  ProposalAcceptResult,
  ProposalCreateInput,
  ProposalDetail,
  ProposalsResponse,
} from "@philosynth/shared/types/proposals";
import type { ProposalStatus } from "@philosynth/shared/constants/proposals";

import { apiGet, apiPost } from "./client";

const base = (synthesisId: string): string => `/syntheses/${encodeURIComponent(synthesisId)}/proposals`;
const one = (synthesisId: string, proposalId: string): string => `${base(synthesisId)}/${encodeURIComponent(proposalId)}`;

export interface ProposalsQuery {
  status?: ProposalStatus | undefined;
  addressKind?: string | undefined;
  addressKey?: string | undefined;
  mine?: boolean | undefined;
}

export function listProposals(synthesisId: string, query: ProposalsQuery = {}): Promise<Proposal[]> {
  return apiGet<ProposalsResponse>(base(synthesisId), {
    status: query.status,
    addressKind: query.addressKind,
    addressKey: query.addressKey,
    mine: query.mine ? 1 : undefined,
  }).then((r) => r.proposals);
}

export function createProposal(synthesisId: string, body: ProposalCreateInput): Promise<Proposal> {
  return apiPost<Proposal>(base(synthesisId), body);
}

export function getProposal(synthesisId: string, proposalId: string): Promise<ProposalDetail> {
  return apiGet<ProposalDetail>(one(synthesisId, proposalId));
}

/** «Принять»: черновик плана правок со ссылкой на предложение в шаге. */
export function acceptProposal(synthesisId: string, proposalId: string, body: ProposalAcceptInput = {}): Promise<ProposalAcceptResult> {
  return apiPost<ProposalAcceptResult>(`${one(synthesisId, proposalId)}/accept`, body);
}

export function rejectProposal(synthesisId: string, proposalId: string, note?: string): Promise<Proposal> {
  return apiPost<Proposal>(`${one(synthesisId, proposalId)}/reject`, note ? { note } : {});
}

export function closeProposal(synthesisId: string, proposalId: string, reason: "manual" | "outdated", note?: string): Promise<Proposal> {
  return apiPost<Proposal>(`${one(synthesisId, proposalId)}/close`, note ? { reason, note } : { reason });
}

export function withdrawProposal(synthesisId: string, proposalId: string): Promise<Proposal> {
  return apiPost<Proposal>(`${one(synthesisId, proposalId)}/withdraw`, {});
}

/** «Новое поверх текущего» — действие автора устаревшего предложения. */
export function rebaseProposal(synthesisId: string, proposalId: string, body: { value?: string; rationale?: string } = {}): Promise<Proposal> {
  return apiPost<Proposal>(`${one(synthesisId, proposalId)}/rebase`, body);
}
