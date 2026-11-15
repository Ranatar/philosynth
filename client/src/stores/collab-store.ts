/**
 * Хранилище совместной работы страницы концепции (беседа 17.2): предложения
 * и названия рецензий. Нужны глубоко в дереве — истории версий элемента и
 * раздела («принято предложение № N пользователя X», «по рецензии Y»: снимок
 * `origin` версии несёт id автора и рецензии, имён не несёт) и панели
 * обсуждения. Пишет SynthesisPage (участникам, по capabilities.discuss);
 * читателю и гостю хранилище пусто — подписи обходятся без имён.
 */
import { create } from "zustand";

import type { Proposal } from "@philosynth/shared/types/proposals";

interface CollabState {
  synthesisId: string | null;
  /** Новые первыми — как отдаёт сервер */
  proposals: Proposal[];
  /** id рецензии → её название */
  reviewTitles: Record<string, string>;
  setProposals: (synthesisId: string | null, proposals: Proposal[]) => void;
  setReviewTitles: (titles: Record<string, string>) => void;
  clear: () => void;
}

export const useCollabStore = create<CollabState>((set) => ({
  synthesisId: null,
  proposals: [],
  reviewTitles: {},
  setProposals: (synthesisId, proposals) => set({ synthesisId, proposals }),
  setReviewTitles: (reviewTitles) => set({ reviewTitles }),
  clear: () => set({ synthesisId: null, proposals: [], reviewTitles: {} }),
}));

/** Номер предложения в концепции: по порядку создания, с 1 (список — новые
 *  первыми). null — предложение не в списке (читатель, старше 200 строк). */
export function proposalNumberIn(proposals: readonly Pick<Proposal, "id">[], id: string): number | null {
  const i = proposals.findIndex((p) => p.id === id);
  return i < 0 ? null : proposals.length - i;
}
