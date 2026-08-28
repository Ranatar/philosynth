/**
 * Хук плана редактирования. Беседа 2.3 (запрос 1, п. 1).
 *
 * Zustand-состояние (07: currentPlan, isExecuting, stepResults) +
 * собственное WebSocket-соединение поверх useWebSocket (0.4) для
 * событий исполнения: plan_step_started / plan_step_done /
 * plan_steps_added / plan_updated. Доставка серверных plan-событий —
 * по userId на ВСЕ соединения пользователя (connection-manager, 2.2),
 * поэтому отдельное соединение модалки получает их наравне с
 * соединением SynthesisPage; подписка subscribe_generation для
 * plan-событий не нужна.
 *
 * Адаптации DOM/DOC_STATE → сервис:
 *  - исходник исполнял план цепочкой confirm() прямо из updateEditPlanUI;
 *    здесь workflow 01-arch §4.5: createPlan (POST /plans, сервер
 *    добавляет каскадные шаги pending) → просмотр/подтверждение
 *    (EditPlanPanel; draft-шаги — PATCH) → executePlan (POST /execute,
 *    фон) → прогресс по WS; pending-шаги ВО ВРЕМЯ исполнения
 *    (plan_steps_added: структурный «sum:Структура документа»,
 *    новые downstream) подтверждаются WS confirm_step (2.2);
 *  - plan_updated несёт полный план — единственный источник статусов
 *    шагов (WsPlanStepDone не несёт объект шага — грабля 2.4 п.3);
 *  - пауза плана по user-abort в WS НЕ приходит (тип исключает) —
 *    клиент берёт pausedState из GET /syntheses/:id (грабля 2.2 п.4);
 *    здесь ловим только generation_paused kind='plan' живого прогона;
 *  - section_done/stream_error пробрасываются колбэком onSectionEvent —
 *    очередь внутрисекционного каскада SubsectionRegenPanel ждёт
 *    завершения текущего подраздела перед следующим POST.
 */
import { useCallback, useEffect, useRef } from "react";
import { create } from "zustand";

import type {
  EditPlan,
  StepResult,
  UpdatePlanRequest,
} from "@philosynth/shared/types/edit-plan";
import type { WsServerMessage } from "@philosynth/shared/types/ws-messages";

import { ApiError } from "../api/client";
import {
  createPlan as apiCreatePlan,
  deletePlan as apiDeletePlan,
  executePlan as apiExecutePlan,
  getPlan as apiGetPlan,
  updatePlan as apiUpdatePlan,
} from "../api/plans";
import { useWebSocket } from "./useWebSocket";

import type { CreatePlanRequest } from "@philosynth/shared/types/edit-plan";

/** Событие завершения/ошибки раздела — для очередей каскада (2.3).
 *  С 4.1 += mode_done (sectionKey "mode:{modeKey}") — очередь каскада
 *  режимов SubsectionRegenPanel ждёт его как section_done. */
export interface SectionEvent {
  kind: "section_done" | "stream_error" | "mode_done";
  sectionKey: string | null;
}

interface EditPlanState {
  /** Текущий план (после createPlan; обновляется plan_updated) */
  currentPlan: EditPlan | null;
  isExecuting: boolean;
  /** stepIndex → результат исполненного шага (plan_step_done) */
  stepResults: Record<number, StepResult>;
  /** Индекс исполняемого шага (plan_step_started), null — нет */
  runningStep: number | null;
  /** Ошибка последней операции плана (создание/исполнение) */
  error: string | null;

  setPlan: (plan: EditPlan | null) => void;
  applyWs: (msg: WsServerMessage) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useEditPlanStore = create<EditPlanState>((set, get) => ({
  currentPlan: null,
  isExecuting: false,
  stepResults: {},
  runningStep: null,
  error: null,

  setPlan(plan) {
    set({
      currentPlan: plan,
      isExecuting: plan?.status === "executing",
      ...(plan === null ? { stepResults: {}, runningStep: null } : {}),
    });
  },

  applyWs(msg) {
    const plan = get().currentPlan;
    switch (msg.type) {
      case "plan_updated": {
        if (!plan || msg.planId !== plan.id) return;
        set({
          currentPlan: msg.plan,
          isExecuting: msg.plan.status === "executing",
          ...(msg.plan.status !== "executing" ? { runningStep: null } : {}),
        });
        return;
      }
      case "plan_step_started": {
        if (!plan || msg.planId !== plan.id) return;
        set({ runningStep: msg.stepIndex, isExecuting: true });
        return;
      }
      case "plan_step_done": {
        if (!plan || msg.planId !== plan.id) return;
        set((s) => ({
          stepResults: { ...s.stepResults, [msg.stepIndex]: msg.result },
          runningStep:
            s.runningStep === msg.stepIndex ? null : s.runningStep,
        }));
        return;
      }
      case "plan_steps_added":
        // Полный план придёт plan_updated'ом; отдельного действия нет
        return;
      case "generation_paused": {
        // Живая пауза плана (kind='plan'; user-abort по WS не приходит —
        // тот случай виден по GET /syntheses/:id)
        if (msg.kind === "plan") set({ isExecuting: false });
        return;
      }
      default:
        return;
    }
  },

  setError(error) {
    set({ error });
  },

  reset() {
    set({
      currentPlan: null,
      isExecuting: false,
      stepResults: {},
      runningStep: null,
      error: null,
    });
  },
}));

export interface UseEditPlanOptions {
  synthesisId: string | null;
  /** Соединение активно (модалка открыта) */
  active: boolean;
  /** section_done/stream_error — очереди каскада SubsectionRegenPanel */
  onSectionEvent?: ((ev: SectionEvent) => void) | undefined;
  /** План перешёл в терминальный статус (done/failed) */
  onPlanFinished?: ((plan: EditPlan) => void) | undefined;
}

export interface UseEditPlanResult {
  plan: EditPlan | null;
  isExecuting: boolean;
  stepResults: Record<number, StepResult>;
  runningStep: number | null;
  error: string | null;
  create: (actions: CreatePlanRequest) => Promise<EditPlan | null>;
  updateSteps: (updates: UpdatePlanRequest["steps"]) => Promise<void>;
  execute: () => Promise<boolean>;
  /** Подтверждение pending-шага: draft — PATCH; executing — WS confirm_step */
  confirmStep: (stepIndex: number) => Promise<void>;
  skipStep: (stepIndex: number) => Promise<void>;
  discard: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

export function useEditPlan(options: UseEditPlanOptions): UseEditPlanResult {
  const { synthesisId, active, onSectionEvent, onPlanFinished } = options;

  const currentPlan = useEditPlanStore((s) => s.currentPlan);
  const isExecuting = useEditPlanStore((s) => s.isExecuting);
  const stepResults = useEditPlanStore((s) => s.stepResults);
  const runningStep = useEditPlanStore((s) => s.runningStep);
  const error = useEditPlanStore((s) => s.error);
  const setPlan = useEditPlanStore((s) => s.setPlan);
  const applyWs = useEditPlanStore((s) => s.applyWs);
  const setError = useEditPlanStore((s) => s.setError);
  const reset = useEditPlanStore((s) => s.reset);

  const onSectionEventRef = useRef(onSectionEvent);
  onSectionEventRef.current = onSectionEvent;
  const onPlanFinishedRef = useRef(onPlanFinished);
  onPlanFinishedRef.current = onPlanFinished;

  const handleMessage = useCallback(
    (msg: WsServerMessage) => {
      // Терминальный колбэк — по ПЕРЕХОДУ статуса в момент сообщения
      // (не эффектом по состоянию store: ref-дедупликация в эффекте не
      // переживает ремаунт и повторно стреляла бы на плане done —
      // грабля R3: цикл «полный load → спиннер → remount»)
      const prevStatus = useEditPlanStore.getState().currentPlan?.status;
      applyWs(msg);
      const nextPlan = useEditPlanStore.getState().currentPlan;
      const nextStatus = nextPlan?.status;
      if (
        nextPlan &&
        nextStatus !== prevStatus &&
        (nextStatus === "done" || nextStatus === "failed")
      ) {
        onPlanFinishedRef.current?.(nextPlan);
      }
      if (msg.type === "section_done") {
        onSectionEventRef.current?.({
          kind: "section_done",
          sectionKey: msg.sectionKey,
        });
      } else if (msg.type === "stream_error") {
        onSectionEventRef.current?.({
          kind: "stream_error",
          sectionKey: msg.sectionKey ?? null,
        });
      } else if (msg.type === "mode_done") {
        onSectionEventRef.current?.({
          kind: "mode_done",
          sectionKey: "mode:" + msg.modeKey,
        });
      }
    },
    [applyWs],
  );

  const { send } = useWebSocket({
    autoConnect: active && !!synthesisId,
    onMessage: handleMessage,
  });

  // Закрытие модалки/смена синтеза — состояние плана не переживает
  useEffect(() => {
    if (!active) reset();
  }, [active, synthesisId, reset]);

  const create = useCallback(
    async (actions: CreatePlanRequest): Promise<EditPlan | null> => {
      if (!synthesisId) return null;
      setError(null);
      try {
        const plan = await apiCreatePlan(synthesisId, actions);
        setPlan(plan);
        return plan;
      } catch (err) {
        setError(messageOf(err));
        return null;
      }
    },
    [synthesisId, setPlan, setError],
  );

  const refresh = useCallback(async () => {
    const plan = useEditPlanStore.getState().currentPlan;
    if (!synthesisId || !plan) return;
    try {
      setPlan(await apiGetPlan(synthesisId, plan.id));
    } catch {
      /* best-effort */
    }
  }, [synthesisId, setPlan]);

  const updateSteps = useCallback(
    async (updates: UpdatePlanRequest["steps"]) => {
      const plan = useEditPlanStore.getState().currentPlan;
      if (!synthesisId || !plan || updates.length === 0) return;
      setError(null);
      try {
        setPlan(await apiUpdatePlan(synthesisId, plan.id, { steps: updates }));
      } catch (err) {
        setError(messageOf(err));
      }
    },
    [synthesisId, setPlan, setError],
  );

  const execute = useCallback(async (): Promise<boolean> => {
    const plan = useEditPlanStore.getState().currentPlan;
    if (!synthesisId || !plan) return false;
    setError(null);
    try {
      await apiExecutePlan(synthesisId, plan.id);
      useEditPlanStore.setState({ isExecuting: true });
      return true;
    } catch (err) {
      setError(messageOf(err));
      return false;
    }
  }, [synthesisId, setError]);

  const confirmStep = useCallback(
    async (stepIndex: number) => {
      const plan = useEditPlanStore.getState().currentPlan;
      if (!plan) return;
      if (plan.status === "draft") {
        await updateSteps([{ index: stepIndex, status: "confirmed" }]);
        return;
      }
      // Исполнение: pending-шаг (каскад/структурный) — WS confirm_step;
      // подтверждение исполняется сервером немедленно (2.2)
      send({ type: "confirm_step", planId: plan.id, stepIndex });
    },
    [updateSteps, send],
  );

  const skipStep = useCallback(
    async (stepIndex: number) => {
      const plan = useEditPlanStore.getState().currentPlan;
      if (!plan) return;
      if (plan.status === "draft") {
        await updateSteps([{ index: stepIndex, status: "skipped" }]);
      }
      // Во время исполнения пропуск pending-шага — просто не подтверждать
    },
    [updateSteps],
  );

  const discard = useCallback(async () => {
    const plan = useEditPlanStore.getState().currentPlan;
    if (!synthesisId || !plan) return;
    try {
      if (plan.status === "draft") await apiDeletePlan(synthesisId, plan.id);
    } catch {
      /* удаление черновика — best-effort */
    }
    setPlan(null);
  }, [synthesisId, setPlan]);

  const clearError = useCallback(() => setError(null), [setError]);

  return {
    plan: currentPlan,
    isExecuting,
    stepResults,
    runningStep,
    error,
    create,
    updateSteps,
    execute,
    confirmStep,
    skipStep,
    discard,
    refresh,
    clearError,
  };
}
