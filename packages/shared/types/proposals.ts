/**
 * Предложения изменений — DTO маршрутов 03 §2.20 (беседа 17.1).
 */
import type {
  ProposalAcceptMethod,
  ProposalCloseReason,
  ProposalEventType,
  ProposalKind,
  ProposalSource,
  ProposalStatus,
} from "../constants/proposals.js";
import type { AddressResolution, DiscussionAddress, DiscussionAuthor, AddressTarget } from "./discussion.js";
import type { EditPlan } from "./edit-plan.js";

/** Основа предложения: то, к чему оно написано. Элемент — номер версии
 *  element_versions; раздел, подраздел, капсула и концепция — хэш
 *  содержимого (как адрес Фазы 16). */
export interface ProposalBase {
  version: number | null;
  hash: string;
}

export interface Proposal {
  id: string;
  synthesisId: string;
  author: DiscussionAuthor;
  /** Адрес объекта на момент записи + вычисленное состояние */
  address: DiscussionAddress;
  resolution: AddressResolution;
  /** Выдержка объекта на момент записи («как было») */
  excerpt: string;
  base: ProposalBase;
  /** Основа ≠ текущему (либо объект удалён): принять нельзя — 409
   *  PROPOSAL_STALE; доступно «новое поверх текущего» и закрыть.
   *  Вычисляется при чтении, у решённых — false */
  stale: boolean;
  source: ProposalSource;
  sourceId: string | null;
  /** Рецензия замечания-источника (source = review_finding) */
  sourceReviewId: string | null;
  kind: ProposalKind;
  /** replace у элемента: правимое поле (ELEMENT_STEP_FIELDS вида) */
  field: string | null;
  /** replace: готовое значение поля либо разметка содержимого подраздела */
  value: string | null;
  rationale: string;
  status: ProposalStatus;
  /** Черновик плана, в котором стоит предложение («принимается»); null — нет */
  planId: string | null;
  decidedBy: DiscussionAuthor | null;
  decidedAt: string | null;
  /** Слово решившего (отклонение, закрытие) */
  note: string;
  closeReason: ProposalCloseReason | null;
  /** Новое предложение, заведённое поверх текущего взамен этого */
  supersededBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalEvent {
  id: string;
  type: ProposalEventType;
  actor: DiscussionAuthor | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ProposalDetail extends Proposal {
  events: ProposalEvent[];
}

/** Тело POST /syntheses/:id/proposals */
export interface ProposalCreateInput {
  /** Адрес; у предложения из комментария / замечания можно опустить —
   *  берётся адрес источника */
  target?: AddressTarget;
  kind: ProposalKind;
  field?: string;
  value?: string;
  rationale?: string;
  source?: ProposalSource;
  sourceId?: string;
}

/** Тело POST …/proposals/:pid/accept */
export interface ProposalAcceptInput {
  /** note: обязателен; replace: не нужен (определён адресом) */
  method?: ProposalAcceptMethod;
  /** note + ручная правка: значение даёт принимающий */
  field?: string;
  value?: string;
}

export interface ProposalAcceptResult {
  proposal: Proposal;
  /** Черновик плана правок: исполнение — POST /plans/:planId/execute */
  plan: EditPlan;
}

export interface ProposalsResponse {
  proposals: Proposal[];
}
