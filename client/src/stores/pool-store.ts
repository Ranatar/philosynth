/**
 * Zustand-стор Unified Concept Pool. Беседа 1.5b (запрос 1).
 *
 * Аналог модульного состояния исходника: _loadedConcepts,
 * _selectedConceptId, _conceptParticipants + статус #poolStatus.
 * Портированные действия (якоря philosynth.html):
 *  - addToPool [4676], removeFromPool [4692], renamePoolConcept [4715]
 *    (prompt() остаётся в компоненте — стор принимает готовое имя),
 *  - toggleSynthParticipant [4731] — БЕЗ DOM-части secSynthReady:
 *    автовключение обязательных разделов делает SynthesisForm эффектом
 *    по hasSynthConcepts (React-адаптация DOM-манипуляций исходника),
 *  - selectForViewing [4776], snapshot-механика (см. ниже),
 *  - syncConceptParticipants [4881] — derived-поле conceptParticipants,
 *    пересчитывается после каждой мутации (в исходнике — явные вызовы),
 *  - refreshPoolParticipant [4904], refreshAllSynthParticipants [4940],
 *  - setPoolStatus [5014].
 *
 * АДАПТАЦИЯ СНИМКОВ (план беседы, п. 2): в сервисе клиент НЕ редактирует
 * просматриваемую концепцию локально (правки — в БД, беседы 2.x), поэтому
 * snapshotCurrentState [4833] не портирован и snapshot не создаётся;
 * refreshPoolParticipant идёт по ветке исходника «rawHTML не менялся —
 * participant актуален» (ранний return). Ветка snapshot сохранена
 * структурно на случай будущих локальных правок.
 *
 * renderFullBudgetPreview [10456] дёргался из syncConceptParticipants —
 * в React превью пересчитывается само (FullBudgetPreview подписан на
 * conceptParticipants), вызов не нужен.
 */
import { create } from "zustand";

import {
  importConceptAsParticipant,
  type ConceptParticipant,
  type PoolConceptEntry,
} from "../utils/concept-file";

export interface PoolStatus {
  text: string;
  cls: "" | "ok" | "err";
}

interface PoolState {
  concepts: PoolConceptEntry[];
  selectedConceptId: string | null;
  /** _conceptParticipants исходника (derived, syncConceptParticipants) */
  conceptParticipants: ConceptParticipant[];
  status: PoolStatus | null;

  setPoolStatus: (text: string, cls?: PoolStatus["cls"]) => void;
  addToPool: (entry: PoolConceptEntry) => boolean;
  removeFromPool: (id: string) => void;
  renamePoolConcept: (id: string, newName: string) => void;
  toggleSynthParticipant: (id: string) => void;
  selectForViewing: (id: string) => void;
  refreshPoolParticipant: (id: string) => void;
  refreshAllSynthParticipants: () => void;
  /** Перед генерацией (беседа 1.5, п. интеграции): refreshAll + сброс
   *  индикатора просмотра (снимок текущей — N/A, см. шапку) */
  prepareForGeneration: () => void;
}

/** syncConceptParticipants [4881–4899]: фильтр ☑ + перенос generationOrder */
function computeConceptParticipants(
  concepts: readonly PoolConceptEntry[],
): ConceptParticipant[] {
  return concepts
    .filter((c) => c.isSynthParticipant && c.participant)
    .map((c) => {
      const p = c.participant as ConceptParticipant;
      // Переносим generationOrder из объекта пула в participant, чтобы
      // при построении genealogy для участников-концепций без собственной
      // genealogy можно было использовать известный порядок как fallback.
      return c.generationOrder
        ? { ...p, generationOrder: c.generationOrder }
        : p;
    });
}

export const usePoolStore = create<PoolState>((set, get) => {
  // Dev-хук для браузерных тестов (test-15b-*): доступ к состоянию пула
  // из page.evaluate. В prod-сборке отсутствует (tree-shake по DEV).
  // Гард Node-безопасен: integration-check исполняет модуль под tsx,
  // где import.meta.env не существует — сперва window, затем env?.DEV.
  const _viteEnv = (import.meta as { env?: { DEV?: boolean } }).env;
  if (typeof window !== "undefined" && _viteEnv?.DEV) {
    (window as unknown as Record<string, unknown>).__poolStore = {
      get: () => get(),
    };
  }
  /** Обновить concepts + пересчитать derived (аналог явных вызовов
   *  syncConceptParticipants исходника) */
  const commit = (
    concepts: PoolConceptEntry[],
    extra?: Partial<Pick<PoolState, "selectedConceptId" | "status">>,
  ) =>
    set({
      concepts,
      conceptParticipants: computeConceptParticipants(concepts),
      ...(extra ?? {}),
    });

  return {
    concepts: [],
    selectedConceptId: null,
    conceptParticipants: [],
    status: null,

    setPoolStatus: (text, cls = "") => set({ status: { text, cls } }),

    // addToPool [4676–4687]
    addToPool: (entry) => {
      const { concepts } = get();
      // Проверка дубликатов по имени файла
      if (concepts.some((c) => c.filename === entry.filename)) {
        set({
          status: {
            text: "⚠ Файл «" + entry.filename + "» уже загружен.",
            cls: "err",
          },
        });
        return false;
      }
      commit([...concepts, entry]);
      return true;
    },

    // removeFromPool [4692–4710]
    removeFromPool: (id) => {
      const { concepts, selectedConceptId } = get();
      const idx = concepts.findIndex((c) => c.id === id);
      if (idx === -1) return;
      const concept = concepts[idx];
      if (!concept) return;

      const next = concepts.filter((c) => c.id !== id);
      // Если она сейчас выбрана для просмотра — сбросить индикатор
      const nextSelected = concept.isSelected ? null : selectedConceptId;
      commit(next, { selectedConceptId: nextSelected });
    },

    // renamePoolConcept [4715–4726] (prompt — в компоненте)
    renamePoolConcept: (id, newName) => {
      const { concepts } = get();
      const trimmed = newName.trim();
      if (!trimmed) return;
      commit(
        concepts.map((c) => {
          if (c.id !== id) return c;
          const participant = c.participant
            ? { ...c.participant, name: trimmed }
            : c.participant;
          return {
            ...c,
            realName: trimmed,
            name: "«" + trimmed + "»",
            participant,
          };
        }),
      );
    },

    // toggleSynthParticipant [4731–4771] — DOM-часть secSynthReady
    // вынесена в SynthesisForm (см. шапку)
    toggleSynthParticipant: (id) => {
      const { concepts } = get();
      const concept = concepts.find((c) => c.id === id);
      if (!concept) return;

      if (!concept.isSynthParticipant) {
        // Включаем — проверяем пригодность
        if (!concept.participant) {
          window.alert(
            "Концепция непригодна для мета-синтеза:\n" +
              (concept.participantError || "Неизвестная ошибка"),
          );
          return;
        }
        commit(
          concepts.map((c) =>
            c.id === id ? { ...c, isSynthParticipant: true } : c,
          ),
        );
      } else {
        const next = concepts.map((c) =>
          c.id === id ? { ...c, isSynthParticipant: false } : c,
        );
        const remaining = next.filter((c) => c.isSynthParticipant).length;
        commit(next, {
          ...(remaining === 0
            ? {
                status: {
                  text:
                    "Мета-синтез отменён. Галочки разделов можно изменить вручную.",
                  cls: "" as const,
                },
              }
            : {}),
        });
      }
    },

    // selectForViewing [4776–4828]; снимки — см. шапку (адаптация)
    selectForViewing: (id) => {
      const { concepts, selectedConceptId } = get();
      const concept = concepts.find((c) => c.id === id);
      if (!concept) return;

      // Если кликнули на уже выбранную — деселект
      if (concept.isSelected) {
        commit(
          concepts.map((c) => (c.id === id ? { ...c, isSelected: false } : c)),
          { selectedConceptId: null },
        );
        return;
      }

      // Снимаем выбор с предыдущей (снимок — N/A, см. шапку)
      const next = concepts.map((c) => {
        if (c.id === selectedConceptId) return { ...c, isSelected: false };
        if (c.id === id) return { ...c, isSelected: true };
        return c;
      });
      commit(next, { selectedConceptId: id });
    },

    // refreshPoolParticipant [4904–4935]
    refreshPoolParticipant: (id) => {
      const { concepts } = get();
      const concept = concepts.find((c) => c.id === id);
      if (!concept) return;
      // Определяем HTML для парсинга:
      // - isSelected + DOC_STATE.ready — ветка standalone-редактирования,
      //   в сервисе недостижима (локальных правок нет);
      // - есть snapshot — берём его;
      // - иначе — rawHTML не менялся, participant актуален (ранний return).
      const html = concept.snapshot?.html;
      if (!html) return;
      try {
        const updated = importConceptAsParticipant(html, concept.filename);
        if (updated) {
          // Сохраняем имя (могла быть переименована пользователем)
          updated.name = concept.participant?.name || updated.name;
          const sources: string[] = [];
          if (updated.graphNodes) sources.push("граф");
          if (updated.dialogueConcepts) sources.push("диалог");
          if (updated.glossaryCompact) sources.push("глоссарий");
          if (updated.thesesSummary) sources.push("тезисы");
          commit(
            get().concepts.map((c) =>
              c.id === id ? { ...c, participant: updated, sources } : c,
            ),
          );
        }
      } catch (err) {
        console.warn(
          "Не удалось обновить participant для «" + concept.name + "»:",
          err instanceof Error ? err.message : err,
        );
      }
    },

    // refreshAllSynthParticipants [4940–4945]
    refreshAllSynthParticipants: () => {
      const { concepts, refreshPoolParticipant } = get();
      for (const c of concepts) {
        if (c.isSynthParticipant) refreshPoolParticipant(c.id);
      }
      // sync: commit внутри refreshPoolParticipant уже пересчитал derived;
      // если ни одного ☑ — состояние не менялось, пересчёт не нужен.
    },

    prepareForGeneration: () => {
      get().refreshAllSynthParticipants();
      const { concepts } = get();
      // Сброс индикатора просмотра (беседа 1.5: «сброс индикатора»)
      commit(
        concepts.map((c) => (c.isSelected ? { ...c, isSelected: false } : c)),
        { selectedConceptId: null },
      );
    },
  };
});
