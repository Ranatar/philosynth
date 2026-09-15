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
 *
 * Беседа 8.7 (режим просмотра): GET /syntheses/:id теперь ГОСТЕВОЙ путь
 * (8.6), а /sections — нет; порядок загрузки стал последовательным —
 * сначала синтез, затем разделы, и откуда их брать, решает ответ:
 *  - synthesis.sections присутствует (гость при scope='full' — «документ
 *    одним ответом») → разделы оттуда, /sections не зовётся; сводки для
 *    оглавления собираются из тех же тел (summariesFromSections);
 *  - scope='showcase' (любой невладелец) → разделов нет ПО ПРАВУ, /sections
 *    ответил бы 403 — не зовём вовсе;
 *  - иначе (владелец, зарегистрированный на 'full') — /sections + /sections/:key,
 *    как прежде.
 * sectionsEmbedded помнит первый случай: reloadSections тогда перечитывает
 * GET /:id (единственный доступный гостю транспорт), а не /sections.
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
  /** 8.7: разделы пришли внутри GET /:id (гость, scope='full') —
   *  /sections для этого смотрящего недоступен */
  sectionsEmbedded: boolean;

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

/** 8.7: сводки для оглавления из тел разделов гостевого ответа —
 *  SectionSummary без contextQualityScore (ctxLog гостю не отдаётся) */
export function summariesFromSections(
  list: readonly SectionFull[],
  updatedAt: string,
): SectionSummary[] {
  return list.map((s) => ({
    key: s.key,
    sectionNum: s.sectionNum,
    title: s.title,
    isEdited: s.isEdited,
    htmlChars: s.htmlContent.length,
    contextQualityScore: null,
    subsections: s.subsections,
    updatedAt,
  }));
}

/** 8.7: разделы по ответу GET /:id — см. шапку модуля */
async function sectionsFor(
  synthesis: SynthesisFull,
): Promise<{ summaries: SectionSummary[]; sections: SectionFull[]; embedded: boolean }> {
  if (synthesis.sections) {
    const list = synthesis.sections.filter((s) => s.key !== "capsule");
    return {
      summaries: summariesFromSections(list, synthesis.updatedAt),
      sections: list,
      embedded: true,
    };
  }
  if (synthesis.scope === "showcase") {
    return { summaries: [], sections: [], embedded: false };
  }
  const { summaries, sections } = await fetchSections(synthesis.id);
  return { summaries, sections, embedded: false };
}

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
  sectionsEmbedded: false,

  async load(id) {
    const seq = ++loadSeq;
    set({
      synthesisId: id,
      loading: true,
      errorCode: null,
    });
    try {
      // Последовательно (8.7): откуда брать разделы, решает ответ GET /:id
      const synthesis = await getSynthesis(id);
      const { summaries, sections, embedded } = await sectionsFor(synthesis);
      if (seq !== loadSeq) return; // пришёл более поздний load
      set({
        synthesis,
        summaries,
        sections,
        loading: false,
        sectionsEmbedded: embedded,
      });
    } catch (err) {
      if (seq !== loadSeq) return;
      set({
        synthesis: null,
        summaries: [],
        sections: [],
        loading: false,
        sectionsEmbedded: false,
        errorCode: err instanceof ApiError ? err.code : "NETWORK_ERROR",
      });
    }
  },

  async reloadSections() {
    const id = get().synthesisId;
    if (!id) return;
    const seq = loadSeq;
    try {
      if (get().sectionsEmbedded) {
        // Гость: единственный транспорт — GET /:id целиком
        const synthesis = await getSynthesis(id);
        const { summaries, sections } = await sectionsFor(synthesis);
        if (seq !== loadSeq) return;
        set({ synthesis, summaries, sections });
        return;
      }
      if (get().synthesis?.scope === "showcase") return;
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
      sectionsEmbedded: false,
    });
  },
}));
