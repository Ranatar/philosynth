/**
 * Подписка на стриминг генерации. Беседа 1.5 (запрос 1, п. 7).
 *
 * Строится ПОВЕРХ useWebSocket (0.4) — NEXT-CONTEXT «Беседы 1.4/1.5».
 * Протокол — фактический серверный (1.4/1.4b): stream_delta с
 * периодическим totalHtml, subsection_found, section_done с html,
 * generation_paused/resumed, generation_complete, stream_error,
 * resume (§3.3 — соединение открывается с ?resume={synthesisId},
 * поэтому и первое подключение, и реконнект получают накопленный буфер
 * либо паузу от handleResume).
 *
 * Адаптации:
 *  - pausedState для PauseModal собирается ИЗ WS-сообщения
 *    generation_paused + локального прогресса (passIdx/completedPasses/
 *    sectionLabel восстановимы из done-шагов; genParams клиенту не нужны —
 *    возобновление серверное). Полный syntheses.paused_state отдаёт
 *    GET /syntheses/:id — на странице просмотра (SynthesisPage, 1.6b)
 *    он и служит источником; WS-пауза его лишь перекрывает по ходу
 *    прогона (маркер 1.6b закрыт беседой 1.6b).
 *  - viewOnly (беседа 1.6): страница просмотра подписывается с флагом
 *    viewOnly: true — subscribe_generation НЕ запускает generateSynthesis
 *    при status='generating' без активного прогона; события активного
 *    прогона доходят и так (доставка по userId).
 *  - kind='plan' до plan-executor'а (2.2) в этом потоке не возникает;
 *    ветка собирает минимальный PausedStatePlan на будущее.
 *  - cancel (§3.1): user-abort финализирует частичное по правилам stop
 *    БЕЗ pausedState — в отличие от исходника, где abort давал паузу.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";
import type {
  PausedState,
  PausedStateGen,
  PausedStatePlan,
} from "@philosynth/shared/types/synthesis";
import type {
  PauseEstimates,
  ResumeGenerationMode,
  ResumePlanMode,
  TokenUsage,
  WsServerMessage,
} from "@philosynth/shared/types/ws-messages";

import { useWebSocket, type WsStatus } from "./useWebSocket";

export type SectionStepStatus = "pending" | "streaming" | "done" | "error";

export interface SectionProgress {
  key: string;
  label: string;
  status: SectionStepStatus;
  chars: number;
  /** Обнаруженные подразделы (subsection_found) */
  subsections: string[];
}

export interface StreamingPause {
  pausedState: PausedState;
  estimates: PauseEstimates;
}

export interface UseStreamingGenerationOptions {
  /** null — генерация ещё не запущена, соединение не открывается */
  synthesisId: string | null;
  /** Ожидаемый порядок разделов (["sum", ...sections] из формы) —
   *  предзаполняет шаги ◯; сервер может изменить порядок
   *  (buildDynamicOrder) — шаги пересортируются по мере сообщений */
  expectedSections?: readonly string[] | undefined;
  /** Режим «только подписка» (беседа 1.6, WsSubscribeGeneration.viewOnly):
   *  не запускать генерацию при подписке — страница просмотра (1.6b) */
  viewOnly?: boolean | undefined;
  onComplete?: ((totalUsage: TokenUsage) => void) | undefined;
}

export interface UseStreamingGenerationResult {
  wsStatus: WsStatus;
  sections: SectionProgress[];
  currentSection: string | null;
  complete: boolean;
  totalUsage: TokenUsage | null;
  /** Терминальная ошибка (stream_error) либо RATE_LIMIT */
  error: string | null;
  pause: StreamingPause | null;
  /** Последний принятый режим возобновления (generation_resumed) */
  resumedMode: string | null;
  resumeGeneration: (mode: ResumeGenerationMode) => void;
  resumePlan: (planId: string, mode: ResumePlanMode) => void;
  cancel: () => void;
}

interface SectionState {
  order: string[];
  byKey: Record<string, SectionProgress>;
}

function labelFor(key: string): string {
  return (KEY_LABELS as Record<string, string>)[key] ?? key;
}

function seedState(expected: readonly string[] | undefined): SectionState {
  const order = [...(expected ?? [])];
  const byKey: Record<string, SectionProgress> = {};
  for (const key of order) {
    byKey[key] = {
      key,
      label: labelFor(key),
      status: "pending",
      chars: 0,
      subsections: [],
    };
  }
  return { order, byKey };
}

export function useStreamingGeneration(
  options: UseStreamingGenerationOptions,
): UseStreamingGenerationResult {
  const { synthesisId, expectedSections, viewOnly, onComplete } = options;

  const [state, setState] = useState<SectionState>(() =>
    seedState(expectedSections),
  );
  const [currentSection, setCurrentSection] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [totalUsage, setTotalUsage] = useState<TokenUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pause, setPause] = useState<StreamingPause | null>(null);
  const [resumedMode, setResumedMode] = useState<string | null>(null);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  // Актуальные current/state для сборки pausedState без гонок setState
  const currentRef = useRef<string | null>(null);
  currentRef.current = currentSection;
  const stateRef = useRef(state);
  stateRef.current = state;

  // Новый synthesisId — новый прогон: сброс состояния
  useEffect(() => {
    setState(seedState(expectedSections));
    setCurrentSection(null);
    setComplete(false);
    setTotalUsage(null);
    setError(null);
    setPause(null);
    setResumedMode(null);
    // expectedSections намеренно вне deps: сброс — только по смене id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synthesisId]);

  const patchSection = useCallback(
    (key: string, patch: Partial<SectionProgress>) => {
      setState((prev) => {
        const existing = prev.byKey[key];
        const next: SectionProgress = {
          key,
          label: labelFor(key),
          status: "pending",
          chars: 0,
          subsections: [],
          ...existing,
          ...patch,
        };
        return {
          order: existing ? prev.order : [...prev.order, key],
          byKey: { ...prev.byKey, [key]: next },
        };
      });
    },
    [],
  );

  /** Сборка PausedState из WS-сообщения + локального прогресса (адаптация) */
  const buildPausedState = useCallback(
    (msg: Extract<WsServerMessage, { type: "generation_paused" }>): PausedState => {
      const st = stateRef.current;
      const doneKeys = st.order.filter((k) => st.byKey[k]?.status === "done");
      const cur =
        currentRef.current ??
        st.order.find((k) => st.byKey[k]?.status === "streaming") ??
        st.order.find((k) => st.byKey[k]?.status === "pending") ??
        "";
      if (msg.kind === "plan") {
        // До plan-executor'а (2.2) плановых пауз в этом потоке нет
        const plan: PausedStatePlan = {
          kind: "plan",
          stepIdx: 0,
          totalSteps: 0,
          failedOp: {},
          remainingOps: [],
          plan: {
            regen: [],
            remove: [],
            add: [],
            modeRegen: [],
            modeRemove: [],
          },
          regenCtx: {},
          addCtx: {},
          reason: msg.reason,
          reasonKind: msg.reasonKind,
          timestamp: Date.now(),
        };
        return plan;
      }
      const gen: PausedStateGen = {
        kind: "gen",
        passIdx: doneKeys.length,
        sectionKeys: cur ? [cur] : [],
        sectionLabel: cur ? labelFor(cur) : "",
        isPartial: msg.isPartial,
        reason: msg.reason,
        reasonKind: msg.reasonKind,
        timestamp: Date.now(),
        partialSubsections: msg.partialSubsections ?? [],
        expectedSubsections: msg.expectedSubsections ?? [],
        completedPasses: doneKeys.map((k) => [k]),
        genParams: {},
        skipDegrades: msg.skipDegrades ?? [],
      };
      return gen;
    },
    [],
  );

  const handleMessage = useCallback(
    (msg: WsServerMessage) => {
      switch (msg.type) {
        case "stream_delta":
          setCurrentSection(msg.sectionKey);
          patchSection(msg.sectionKey, {
            status: "streaming",
            chars: msg.totalChars,
          });
          break;
        case "subsection_found":
          setState((prev) => {
            const s = prev.byKey[msg.sectionKey];
            if (!s || s.subsections.includes(msg.subsectionName)) return prev;
            return {
              order: prev.order,
              byKey: {
                ...prev.byKey,
                [msg.sectionKey]: {
                  ...s,
                  subsections: [...s.subsections, msg.subsectionName],
                },
              },
            };
          });
          break;
        case "section_done":
          patchSection(msg.sectionKey, {
            status: "done",
            chars: msg.html.length,
          });
          break;
        case "generation_complete":
          setComplete(true);
          setTotalUsage(msg.totalUsage);
          setPause(null);
          onCompleteRef.current?.(msg.totalUsage);
          break;
        case "generation_paused": {
          const cur = currentRef.current;
          if (cur) patchSection(cur, { status: "error" });
          setPause({
            pausedState: buildPausedState(msg),
            estimates: msg.estimates ?? {},
          });
          break;
        }
        case "generation_resumed": {
          setPause(null);
          setResumedMode(msg.mode);
          // retry/fill-missing-subs: прерванный шаг снова в работе;
          // skip: остаётся ⚠, следующий шаг оживёт по stream_delta
          const cur = currentRef.current;
          if (cur && msg.mode !== "skip" && msg.mode !== "stop") {
            patchSection(cur, { status: "streaming" });
          }
          break;
        }
        case "stream_error": {
          setError(msg.error);
          const key = msg.sectionKey ?? currentRef.current;
          if (key) patchSection(key, { status: "error" });
          break;
        }
        case "resume":
          // §3.3: буфер активного стрима после реконнекта
          setCurrentSection(msg.sectionKey);
          patchSection(msg.sectionKey, {
            status: "streaming",
            chars: msg.charsSoFar,
          });
          break;
        case "error":
          if (msg.code === "RATE_LIMIT") {
            setError(`Превышен лимит сообщений; повторите через ${msg.retryAfter} с.`);
          }
          break;
        default:
          break;
      }
    },
    [patchSection, buildPausedState],
  );

  // §3.3: соединение сразу с ?resume= — handleResume отдаст буфер/паузу
  const wsUrl = useMemo(() => {
    if (!synthesisId) return undefined;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/ws?resume=${encodeURIComponent(synthesisId)}`;
  }, [synthesisId]);

  const { status: wsStatus, send } = useWebSocket({
    url: wsUrl,
    autoConnect: !!synthesisId,
    onMessage: handleMessage,
  });

  // Подписка (или рестарт после падения сервера) — на каждом открытии;
  // viewOnly: true — страница просмотра, генерация НЕ запускается (1.6)
  useEffect(() => {
    if (wsStatus === "open" && synthesisId) {
      send({
        type: "subscribe_generation",
        synthesisId,
        ...(viewOnly ? { viewOnly: true } : {}),
      });
    }
  }, [wsStatus, synthesisId, viewOnly, send]);

  const resumeGeneration = useCallback(
    (mode: ResumeGenerationMode) => {
      if (!synthesisId) return;
      send({ type: "resume_generation", synthesisId, mode });
    },
    [synthesisId, send],
  );

  const resumePlan = useCallback(
    (planId: string, mode: ResumePlanMode) => {
      if (!synthesisId) return;
      send({ type: "resume_plan", synthesisId, planId, mode });
    },
    [synthesisId, send],
  );

  const cancel = useCallback(() => {
    if (!synthesisId) return;
    send({ type: "cancel", synthesisId });
  }, [synthesisId, send]);

  const sections = useMemo(
    () => state.order.map((k) => state.byKey[k]).filter((s): s is SectionProgress => !!s),
    [state],
  );

  return {
    wsStatus,
    sections,
    currentSection,
    complete,
    totalUsage,
    error,
    pause,
    resumedMode,
    resumeGeneration,
    resumePlan,
    cancel,
  };
}
