/**
 * Zustand-store текущего синтеза. Беседа 1.6b (запрос 1, п. 7).
 *
 * Держит открытый на странице /synthesis/:id документ: SynthesisFull
 * (GET /syntheses/:id — беседа 1.6, с pausedState и pauseEstimates),
 * список SectionSummary (subsections нужны TableOfContents) и полные
 * SectionFull с htmlContent для рендера.
 *
 * Транспорт: GET /sections отдаёт только метаданные, поэтому htmlContent
 * дотягивается по разделу через GET /sections/:key (Promise.all).
 * Ключ `capsule` НЕ дотягивается: капсула живёт в шапке документа и
 * рендерится из synthesis.capsuleHtml (решение 1.6: роут ничего не
 * вырезает — исключение делает клиент). Закрывает часть маркера
 * маркера 1.6b «исключение capsule при рендере» (реестр 07 §12).
 *
 * loadSeq — защита от гонки: параллельный load() старого id не должен
 * перезаписать состояние более позднего (React StrictMode двоит эффекты —
 * грабля 0.4).
 */
import { create } from "zustand";

import type {
  SectionFull,
  SectionSummary,
} from "@philosynth/shared/types/section";
import type { SynthesisFull } from "@philosynth/shared/types/synthesis";

import { ApiError, type ApiErrorCode } from "../api/client";
import { getSection, getSections } from "../api/sections";
import { getSynthesis } from "../api/syntheses";

interface SynthesisStoreState {
  /** id загруженного (или загружаемого) синтеза */
  synthesisId: string | null;
  synthesis: SynthesisFull | null;
  /** GET /sections — порядок sectionOrder, с subsections для TOC */
  summaries: SectionSummary[];
  /** Полные разделы с htmlContent, в порядке summaries; без `capsule` */
  sections: SectionFull[];
  loading: boolean;
  /** Код ошибки загрузки (NOT_FOUND → 404-страница, FORBIDDEN → 403) */
  errorCode: ApiErrorCode | null;

  /** Полная загрузка синтеза + разделов; повторный вызов = перезагрузка */
  load: (id: string) => Promise<void>;
  /** Перезапрос только разделов (стриминг: section_done у страницы
   *  просмотра — html дотягивается транспортом чтения, не из WS) */
  reloadSections: () => Promise<void>;
  /** Точечное обновление SynthesisFull (напр. после PATCH title/isPublic) */
  applySynthesis: (synthesis: SynthesisFull) => void;
  clear: () => void;
}

let loadSeq = 0;

async function fetchSections(
  id: string,
): Promise<{ summaries: SectionSummary[]; sections: SectionFull[] }> {
  const summaries = await getSections(id);
  const sections = await Promise.all(
    summaries
      .filter((s) => s.key !== "capsule")
      .map((s) => getSection(id, s.key)),
  );
  return { summaries, sections };
}

export const useSynthesisStore = create<SynthesisStoreState>((set, get) => ({
  synthesisId: null,
  synthesis: null,
  summaries: [],
  sections: [],
  loading: false,
  errorCode: null,

  async load(id) {
    const seq = ++loadSeq;
    set({
      synthesisId: id,
      loading: true,
      errorCode: null,
    });
    try {
      const [synthesis, { summaries, sections }] = await Promise.all([
        getSynthesis(id),
        fetchSections(id),
      ]);
      if (seq !== loadSeq) return; // пришёл более поздний load
      set({ synthesis, summaries, sections, loading: false });
    } catch (err) {
      if (seq !== loadSeq) return;
      set({
        synthesis: null,
        summaries: [],
        sections: [],
        loading: false,
        errorCode: err instanceof ApiError ? err.code : "NETWORK_ERROR",
      });
    }
  },

  async reloadSections() {
    const id = get().synthesisId;
    if (!id) return;
    const seq = loadSeq;
    try {
      const { summaries, sections } = await fetchSections(id);
      if (seq !== loadSeq) return;
      set({ summaries, sections });
    } catch {
      // best-effort: стриминговая дотяжка; терминальные ошибки ловит load
    }
  },

  applySynthesis(synthesis) {
    if (get().synthesisId !== synthesis.id) return;
    set({ synthesis });
  },

  clear() {
    ++loadSeq;
    set({
      synthesisId: null,
      synthesis: null,
      summaries: [],
      sections: [],
      loading: false,
      errorCode: null,
    });
  },
}));
