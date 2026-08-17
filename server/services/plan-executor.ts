/**
 * Plan Executor (беседа 2.2) — порт executeEditPlan [19514–19861] и
 * исполнительной части resumePlan [25916–26019] (фрагмент
 * docs/fragments-for-conversations/2.2-plan-executor.js).
 *
 * Модель исполнения (03 §2.6, §3.1–3.2; 01 §4.5):
 *  - executePlan исполняет шаги status='confirmed' последовательно под
 *    generation-слотом (занятый слот = «генерация активна» для гейтов и
 *    cancel); 'skipped' пропускаются; 'pending' (неподтверждённые
 *    каскадные) НЕ исполняются и остаются в плане — их исполняет
 *    confirm_step по одному;
 *  - порядок шагов задан createPlan/updatePlan (buildPlanOrder, 2.1) и
 *    здесь не пересортировывается;
 *  - regen раздела, которого больше нет в документе → 'skipped' [20144];
 *  - version bump [19595–19620]: изменения разделов → version_base += 1,
 *    version_sub = 0; перегенерации режимов → version_mode_regen += n;
 *    version_marker в генлог с перечнем действий;
 *  - каскад: ОДИН пересчёт analyzeImpact после исполнения базовых шагов
 *    (паритет исходника [фрагмент 206–241] — каскад после плана;
 *    формулировка 07 «после каждого шага может добавить» реализована на
 *    уровне «после каждого ПРОГОНА» — задокументированное отступление);
 *    новые downstream вне плана → pending-шаги cascadeGenerated:true +
 *    plan_steps_added; их исполнение — подтверждение confirm_step;
 *  - обрыв шага (таксономия стриминга) → шаг 'failed', pausedState
 *    kind='plan' [19770–19800], план 'paused', WS generation_paused
 *    kind='plan' (isPartial:false, estimates {}). ОТСТУПЛЕНИЕ: при
 *    reasonKind='user-abort' WS-сообщение НЕ отправляется (тип
 *    WsGenerationPaused исключает 'user-abort'; клиент сам жал «Стоп» и
 *    видит паузу в GET /syntheses/:id) — pausedState при этом создаётся,
 *    как в исходнике (cancelPlan = abort слота → пауза плана);
 *  - resume (retry|skip_step) регистрируется в pause-resume-service через
 *    setPlanResumeExecutor побочным эффектом импорта модуля (образец —
 *    провайдер оценок 1.4b); каркас resumePlan уже сделал валидацию,
 *    resume-marker и ветку stop;
 *  - regen_mode: mode-service появляется в беседе 4.1 — разъём
 *    setModeRegenerator; без регистрации шаг → 'failed', план ПРОДОЛЖАЕТСЯ
 *    (паритет: исходник копит modeErr и не роняет план [фрагмент 155]);
 *  - delete результата режима: target «modeKey:index», index — позиция в
 *    списке результатов режима (created_at ASC); удаления исполняются в
 *    порядке шагов (buildPlanOrder уже отсортировал индексы по убыванию).
 */
import { and, asc, eq, sql as dsql } from "drizzle-orm";

import { db } from "../db/index.js";
import { editPlans, generationLog, modeResults, syntheses } from "../db/schema.js";
import { connectionManager } from "../ws/connection-manager.js";

import type { WsServerMessage } from "@philosynth/shared/types/ws-messages";

import { analyzeImpact } from "./cascade-analyzer.js";
import {
  estimatePlanCost,
  loadPlanRow,
  PlanError,
  toApiPlan,
} from "./edit-planner.js";
import {
  addSection,
  deleteSection,
  isGenerationActive,
  loadSynthesis,
  regenerateSection,
  runSubsectionRegen,
  withGenerationSlot,
  type GenerationSlotHandle,
} from "./generation-service.js";
import {
  createPausedState,
  logPauseEvent,
  setPlanResumeExecutor,
} from "./pause-resume-service.js";
import { STRUCTURE_SUBSECTION } from "./structure-tracker.js";
import { classifyStreamError, StreamError } from "./streaming-manager.js";

import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";
import { formatVersion } from "@philosynth/shared/utils/version";
import type {
  EditStep,
  StepResult,
} from "@philosynth/shared/types/edit-plan";
import type { PauseReasonKind } from "@philosynth/shared/types/synthesis";

type PlanRow = typeof editPlans.$inferSelect;

const sendToUser = (userId: string, msg: WsServerMessage): void =>
  connectionManager.sendToUser(userId, msg);

/* ══ Разъём режимной перегенерации (TODO(4.1): mode-service) ══════════ */

export type ModeRegenerator = (
  handle: GenerationSlotHandle,
  modeKey: string,
  index: number,
) => Promise<{ inputTokens: number; outputTokens: number; outputChars: number }>;

let modeRegenerator: ModeRegenerator | null = null;

/** Регистрация regenerateModeSilent (беседа 4.1). До неё шаги regen_mode
 *  завершаются 'failed' (план продолжается — паритет modeErr исходника). */
export function setModeRegenerator(fn: ModeRegenerator | null): void {
  modeRegenerator = fn;
}

/* ══ Вспомогательное ══════════════════════════════════════════════════ */

const ZERO_RESULT: StepResult = {
  outputChars: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
};

const PRICE_IN = 3 / 1e6;
const PRICE_OUT = 15 / 1e6;

function usageToResult(
  usage: { inputTokens: number; outputTokens: number },
  outputChars: number,
): StepResult {
  return {
    outputChars,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: usage.inputTokens * PRICE_IN + usage.outputTokens * PRICE_OUT,
  };
}

/** target режимного шага: «modeKey:index». Ключи режимов не содержат
 *  двоеточий (isModeTarget edit-planner) — split по последнему ':'. */
function parseModeTarget(target: string): { modeKey: string; index: number } {
  const i = target.lastIndexOf(":");
  return {
    modeKey: target.slice(0, i),
    index: Number.parseInt(target.slice(i + 1), 10),
  };
}

async function persistSteps(
  planId: string,
  steps: EditStep[],
  currentStep: number,
): Promise<void> {
  await db
    .update(editPlans)
    .set({ steps, currentStep, updatedAt: new Date() })
    .where(eq(editPlans.id, planId));
}

async function setPlanStatus(
  planId: string,
  status: PlanRow["status"],
): Promise<void> {
  await db
    .update(editPlans)
    .set({ status, updatedAt: new Date() })
    .where(eq(editPlans.id, planId));
}

/** Удаление результата режима: строка mode_results по (modeKey, порядковый
 *  index в created_at ASC) [фрагмент executeEditPlan, sortedRemoves]. */
async function deleteModeResult(
  synthesisId: string,
  modeKey: string,
  index: number,
): Promise<void> {
  const rows = await db
    .select({ id: modeResults.id })
    .from(modeResults)
    .where(
      and(
        eq(modeResults.synthesisId, synthesisId),
        eq(modeResults.modeKey, modeKey),
      ),
    )
    .orderBy(asc(modeResults.createdAt));
  const row = rows[index];
  if (!row) {
    throw new PlanError(
      "VALIDATION_ERROR",
      `Результат режима ${modeKey}[${index}] не найден`,
    );
  }
  await db.delete(modeResults).where(eq(modeResults.id, row.id));
}

/** Сводка плана для pausedState.plan (форма исходника [19776]). */
function planSummaryFromSteps(steps: EditStep[]): {
  regen: string[];
  remove: string[];
  add: string[];
  modeRegen: [string, number][];
  modeRemove: [string, number][];
} {
  const regen: string[] = [];
  const remove: string[] = [];
  const add: string[] = [];
  const modeRegen: [string, number][] = [];
  const modeRemove: [string, number][] = [];
  for (const s of steps) {
    if (s.type === "regen") regen.push(s.target);
    else if (s.type === "add") add.push(s.target);
    else if (s.type === "regen_mode") {
      const { modeKey, index } = parseModeTarget(s.target);
      modeRegen.push([modeKey, index]);
    } else if (s.type === "delete") {
      if (s.target.includes(":")) {
        const { modeKey, index } = parseModeTarget(s.target);
        modeRemove.push([modeKey, index]);
      } else {
        remove.push(s.target);
      }
    }
  }
  return { regen, remove, add, modeRegen, modeRemove };
}

function stepToOp(step: EditStep): Record<string, unknown> {
  if (step.type === "regen_subsection") {
    const i = step.target.indexOf(":");
    return {
      action: "regen_subsection",
      key: step.target.slice(0, i),
      subsection: step.target.slice(i + 1),
    };
  }
  return { action: step.type, key: step.target };
}

/* ══ Version bump + version_marker [19595–19620] ══════════════════════ */

async function bumpVersionsForPlan(
  synthesisId: string,
  steps: EditStep[],
): Promise<void> {
  const active = steps.filter((s) => s.status === "confirmed");
  const labels = KEY_LABELS as Record<string, string>;
  const hasSectionChanges = active.some(
    (s) =>
      s.type === "regen" ||
      s.type === "add" ||
      s.type === "regen_subsection" ||
      (s.type === "delete" && !s.target.includes(":")),
  );
  const modeRegenCount = active.filter((s) => s.type === "regen_mode").length;
  if (!hasSectionChanges && modeRegenCount === 0) return;

  await db
    .update(syntheses)
    .set({
      ...(hasSectionChanges
        ? {
            versionBase: dsql`${syntheses.versionBase} + 1`,
            versionSub: 0,
          }
        : {}),
      ...(modeRegenCount > 0
        ? {
            versionModeRegen: dsql`${syntheses.versionModeRegen} + ${modeRegenCount}`,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(syntheses.id, synthesisId));

  // Беседа 2.4: строка версии для маркера (formatCtxLog печатает
  // «ВЕРСИЯ vN» — исходник [23414]; без сохранённого значения номер
  // в логе опускался бы)
  const [vrow] = await db
    .select({
      versionBase: syntheses.versionBase,
      versionSub: syntheses.versionSub,
      versionModes: syntheses.versionModes,
      versionModeRegen: syntheses.versionModeRegen,
    })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);

  const actions = active.map((s) => {
    const label = s.target.includes(":")
      ? s.target
      : (labels[s.target] ?? s.target);
    return `${s.type}: ${label}`;
  });
  await db.insert(generationLog).values({
    synthesisId,
    sectionKey: "_versionMarker",
    sectionLabel: "Версия документа",
    logType: "version_marker",
    source: "edit",
    status: "done",
    metadata: {
      actions,
      hasSectionChanges,
      modeRegenCount,
      // Беседа 2.4: печать «ВЕРСИЯ vN» в formatCtxLog
      version: vrow
        ? formatVersion({
            base: vrow.versionBase,
            sub: vrow.versionSub,
            modes: vrow.versionModes,
            modeRegen: vrow.versionModeRegen,
          })
        : null,
    },
  });
}

/* ══ Исполнение одного шага ═══════════════════════════════════════════ */

async function runStep(
  handle: GenerationSlotHandle,
  step: EditStep,
): Promise<StepResult> {
  const { synthesisId } = handle;
  switch (step.type) {
    case "delete": {
      if (step.target.includes(":")) {
        const { modeKey, index } = parseModeTarget(step.target);
        await deleteModeResult(synthesisId, modeKey, index);
      } else {
        await deleteSection(synthesisId, step.target);
      }
      return ZERO_RESULT;
    }
    case "add": {
      const usage = await addSection(handle, step.target, step.context ?? null, {
        fromPlan: true,
      });
      return usageToResult(usage, 0);
    }
    case "regen": {
      const usage = await regenerateSection(
        handle,
        step.target,
        step.context ?? null,
        { fromPlan: true },
      );
      return usageToResult(usage, 0);
    }
    case "regen_subsection": {
      const i = step.target.indexOf(":");
      const sectionKey = step.target.slice(0, i);
      const subsectionName = step.target.slice(i + 1);
      const { usage } = await runSubsectionRegen(
        handle,
        sectionKey,
        subsectionName,
        step.context !== undefined ? { userNote: step.context } : {},
      );
      return usageToResult(usage, 0);
    }
    case "regen_mode": {
      if (!modeRegenerator) {
        throw new PlanError(
          "VALIDATION_ERROR",
          "Перегенерация режимов требует mode-service (беседа 4.1)",
        );
      }
      const { modeKey, index } = parseModeTarget(step.target);
      const r = await modeRegenerator(handle, modeKey, index);
      return usageToResult(r, r.outputChars);
    }
    default:
      throw new PlanError(
        "VALIDATION_ERROR",
        `Неизвестный тип шага: ${String(step.type)}`,
      );
  }
}

/* ══ Основной прогон шагов (общий для execute и resume) ═══════════════ */

/**
 * Исполняет шаги с fromIndex под уже занятым слотом. Возвращает true при
 * штатном завершении прогона; при обрыве шага создаёт паузу kind='plan'
 * и возвращает false.
 */
async function runPlanSteps(
  handle: GenerationSlotHandle,
  planId: string,
  steps: EditStep[],
  fromIndex: number,
  regenCtx: Record<string, string>,
  addCtx: Record<string, string>,
): Promise<boolean> {
  const { synthesisId, userId } = handle;
  const [synthRow] = await db
    .select({ sectionOrder: syntheses.sectionOrder })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  let sectionOrder: string[] = synthRow?.sectionOrder ?? [];

  for (let i = fromIndex; i < steps.length; i++) {
    const step = steps[i] as EditStep;
    if (step.status !== "confirmed") continue; // pending/skipped/done/failed

    // regen раздела, которого больше нет [20144]
    if (step.type === "regen" && !sectionOrder.includes(step.target)) {
      step.status = "skipped";
      await persistSteps(planId, steps, i);
      continue;
    }
    if (
      step.type === "regen_subsection" &&
      !sectionOrder.includes(step.target.split(":")[0] as string)
    ) {
      step.status = "skipped";
      await persistSteps(planId, steps, i);
      continue;
    }

    step.status = "running";
    await persistSteps(planId, steps, i);
    sendToUser(userId, { type: "plan_step_started", planId, stepIndex: i });

    try {
      const result = await runStep(handle, step);
      step.status = "done";
      step.result = result;
      await persistSteps(planId, steps, i + 1);
      sendToUser(userId, {
        type: "plan_step_done",
        planId,
        stepIndex: i,
        result,
      });
      if (step.type === "delete" || step.type === "add") {
        const [fresh] = await db
          .select({ sectionOrder: syntheses.sectionOrder })
          .from(syntheses)
          .where(eq(syntheses.id, synthesisId))
          .limit(1);
        sectionOrder = fresh?.sectionOrder ?? sectionOrder;
      }
    } catch (rawErr) {
      // Ошибка режимного шага не роняет план (паритет modeErr [155])
      if (step.type === "regen_mode") {
        console.warn(`Шаг ${i} (regen_mode ${step.target}):`, rawErr);
        step.status = "failed";
        await persistSteps(planId, steps, i + 1);
        continue;
      }

      // Обрыв шага → пауза kind='plan' [19770–19800]
      const e =
        rawErr instanceof StreamError
          ? rawErr
          : classifyStreamError(rawErr, false);
      step.status = "failed";
      await persistSteps(planId, steps, i);

      const remaining = steps
        .slice(i + 1)
        .filter((s) => s.status === "confirmed")
        .map(stepToOp);
      const ps = await createPausedState(synthesisId, "plan", {
        stepIdx: i,
        totalSteps: steps.length,
        failedOp: stepToOp(step),
        remainingOps: remaining,
        plan: planSummaryFromSteps(steps),
        regenCtx,
        addCtx,
        reason: e.message,
        reasonKind: (e.kind || "partial") as PauseReasonKind,
      });
      await setPlanStatus(planId, "paused");
      await logPauseEvent(synthesisId, "pause_marker", {
        kind: "plan",
        stepIdx: i,
        totalSteps: steps.length,
        reasonKind: ps.reasonKind,
      });
      if (ps.reasonKind !== "user-abort") {
        sendToUser(userId, {
          type: "generation_paused",
          synthesisId,
          kind: "plan",
          reasonKind: ps.reasonKind as Exclude<PauseReasonKind, "user-abort">,
          reason: e.message,
          isPartial: false,
          estimates: {},
        });
      }
      return false;
    }
  }
  return true;
}

/* ══ Каскад после исполнения базовых шагов [фрагмент 206–241] ═════════ */

async function appendCascadeSteps(
  synthesisId: string,
  userId: string,
  planId: string,
  steps: EditStep[],
): Promise<void> {
  const executed = steps.filter((s) => s.status === "done");
  const regen = executed
    .filter((s) => s.type === "regen")
    .map((s) => s.target);
  const add = executed.filter((s) => s.type === "add").map((s) => s.target);
  const remove = executed
    .filter((s) => s.type === "delete" && !s.target.includes(":"))
    .map((s) => s.target);
  if (regen.length + add.length + remove.length === 0) return;

  let affected: string[] = [];
  try {
    const impact = await analyzeImpact(synthesisId, { regen, remove, add });
    affected = impact.affectedSections;
  } catch (e) {
    console.warn("appendCascadeSteps analyzeImpact:", e);
    return;
  }

  const planned = new Set(
    steps
      .filter((s) => s.type === "regen" || s.type === "add")
      .map((s) => s.target),
  );
  const newSteps: EditStep[] = affected
    .filter((k) => !planned.has(k))
    .map((k) => ({
      type: "regen",
      target: k,
      status: "pending",
      cascadeGenerated: true,
    }));
  const reasons: string[] = [];
  if (newSteps.length > 0) {
    reasons.push("каскад: разделы зависят от изменённых");
  }

  /* Пост-план [07 2.2 п.1]: добавлялись/удалялись разделы → предложить
     обновить «Структура документа» (в исходнике — confirm-диалог после
     плана; здесь — pending-шаг regen_subsection через штатный
     confirm_step). Только если «sum» в документе и шага ещё нет. */
  if (remove.length + add.length > 0) {
    const [fresh] = await db
      .select({ sectionOrder: syntheses.sectionOrder })
      .from(syntheses)
      .where(eq(syntheses.id, synthesisId))
      .limit(1);
    const order = fresh?.sectionOrder ?? [];
    const structureTarget = `sum:${STRUCTURE_SUBSECTION}`;
    const alreadyOffered = steps.some(
      (s) => s.type === "regen_subsection" && s.target === structureTarget,
    );
    if (order.includes("sum") && !alreadyOffered) {
      newSteps.push({
        type: "regen_subsection",
        target: structureTarget,
        status: "pending",
        cascadeGenerated: true,
      });
      reasons.push("состав разделов изменился — обновить «Структуру документа»");
    }
  }
  if (newSteps.length === 0) return;

  steps.push(...newSteps);
  await persistSteps(planId, steps, steps.length - newSteps.length);
  sendToUser(userId, {
    type: "plan_steps_added",
    planId,
    newSteps,
    reason: reasons.join("; "),
  });
}

/* ══ executePlan [19514] ══════════════════════════════════════════════ */

/**
 * Исполнение плана: гейты (draft, нет активной генерации), version bump,
 * прогон confirmed-шагов под слотом, каскад, финальный статус.
 */
export async function executePlan(
  synthesisId: string,
  planId: string,
  userId: string,
): Promise<void> {
  const row = await loadPlanRow(synthesisId, planId, userId);
  if (row.status !== "draft") {
    throw new PlanError(
      "PLAN_CONFLICT",
      `План в статусе «${row.status}» нельзя исполнить`,
    );
  }
  if (isGenerationActive(synthesisId)) {
    throw new PlanError("PLAN_CONFLICT", "Генерация уже идёт");
  }
  const steps: EditStep[] = [...row.steps];
  if (!steps.some((s) => s.status === "confirmed")) {
    throw new PlanError("VALIDATION_ERROR", "В плане нет подтверждённых шагов");
  }

  await bumpVersionsForPlan(synthesisId, steps);
  await setPlanStatus(planId, "executing");

  await withGenerationSlot(synthesisId, userId, async (handle) => {
    const regenCtx: Record<string, string> = {};
    const addCtx: Record<string, string> = {};
    for (const s of steps) {
      if (s.context === undefined) continue;
      if (s.type === "regen") regenCtx[s.target] = s.context;
      if (s.type === "add") addCtx[s.target] = s.context;
    }
    const completed = await runPlanSteps(
      handle, planId, steps, 0, regenCtx, addCtx,
    );
    if (!completed) return; // пауза создана внутри

    await appendCascadeSteps(synthesisId, userId, planId, steps);
    await setPlanStatus(planId, "done");
    await sendPlanUpdated(synthesisId, planId, userId);
  });
}

/** plan_updated с живой оценкой (форма getPlan). */
async function sendPlanUpdated(
  synthesisId: string,
  planId: string,
  userId: string,
): Promise<void> {
  try {
    const [row] = await db
      .select()
      .from(editPlans)
      .where(eq(editPlans.id, planId))
      .limit(1);
    if (!row) return;
    const { row: synthRow, philosophers } = await loadSynthesis(synthesisId);
    const cost = await estimatePlanCost(
      synthesisId, synthRow, philosophers, row.steps,
    );
    sendToUser(userId, {
      type: "plan_updated",
      planId,
      plan: toApiPlan(row, cost),
    });
  } catch (e) {
    console.warn("sendPlanUpdated:", e);
  }
}

/* ══ confirm_step (03 §3.1) ═══════════════════════════════════════════ */

/**
 * Немедленное исполнение подтверждаемого pending-шага (каскадные шаги
 * после плана). План в статусе 'done'/'executing'; занятый слот →
 * PLAN_CONFLICT. Возвращает synthesisId (нужен ws-обработчику для
 * stream_error — в WsConfirmStep его нет).
 */
export async function confirmStep(
  planId: string,
  stepIndex: number,
  userId: string,
): Promise<string> {
  const [row] = await db
    .select()
    .from(editPlans)
    .where(eq(editPlans.id, planId))
    .limit(1);
  if (!row) throw new PlanError("NOT_FOUND", "План не найден");
  if (row.userId !== userId) {
    throw new PlanError("FORBIDDEN", "Нет доступа к плану");
  }
  const synthesisId = row.synthesisId;
  if (row.status !== "done" && row.status !== "executing") {
    throw new PlanError(
      "PLAN_CONFLICT",
      `Подтверждение шага недоступно для плана в статусе «${row.status}»`,
    );
  }
  if (isGenerationActive(synthesisId)) {
    throw new PlanError("PLAN_CONFLICT", "Генерация уже идёт");
  }
  const steps: EditStep[] = [...row.steps];
  const step = steps[stepIndex];
  if (!step || step.status !== "pending") {
    throw new PlanError(
      "VALIDATION_ERROR",
      `Шаг ${stepIndex} не ожидает подтверждения`,
    );
  }
  step.status = "confirmed";

  await withGenerationSlot(synthesisId, userId, async (handle) => {
    const regenCtx: Record<string, string> = {};
    const addCtx: Record<string, string> = {};
    const completed = await runPlanSteps(
      handle, planId, steps, stepIndex, regenCtx, addCtx,
    );
    if (!completed) return;
    await appendCascadeSteps(synthesisId, userId, planId, steps);
    if (!steps.some((s) => s.status === "pending")) {
      await setPlanStatus(planId, "done");
    }
    await sendPlanUpdated(synthesisId, planId, userId);
  });
  return synthesisId;
}

/* ══ Resume executor (retry|skip_step) [25916–26019] ══════════════════ */

/**
 * Исполнение возобновления плана: каркас resumePlan (1.4b) уже провёл
 * валидацию, resume-marker и очистил ветку stop. Здесь: снять паузу,
 * план → 'executing', продолжить прогон с failed-шага (retry) или со
 * следующего (skip_step: failed → skipped).
 */
async function resumePlanExecutor(
  synthesisId: string,
  planId: string,
  userId: string,
  mode: "retry" | "skip_step",
): Promise<void> {
  const row = await loadPlanRow(synthesisId, planId, userId);
  if (row.status !== "paused") {
    throw new PlanError(
      "PLAN_CONFLICT",
      `План в статусе «${row.status}» нельзя возобновить`,
    );
  }
  const [synthRow] = await db
    .select({ pausedState: syntheses.pausedState })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  const ps = synthRow?.pausedState;
  const stepIdx =
    ps && ps.kind === "plan" ? ps.stepIdx : (row.currentStep ?? 0);
  const regenCtx = ps && ps.kind === "plan" ? ps.regenCtx : {};
  const addCtx = ps && ps.kind === "plan" ? ps.addCtx : {};

  const steps: EditStep[] = [...row.steps];
  const failedStep = steps[stepIdx];
  let fromIndex = stepIdx;
  if (failedStep && failedStep.status === "failed") {
    if (mode === "retry") {
      failedStep.status = "confirmed"; // повторить тот же шаг
    } else {
      failedStep.status = "skipped"; // пропустить и идти дальше
      fromIndex = stepIdx + 1;
    }
  } else {
    fromIndex = stepIdx + (mode === "skip_step" ? 1 : 0);
  }

  await db
    .update(syntheses)
    .set({ status: "ready", pausedState: null, updatedAt: new Date() })
    .where(eq(syntheses.id, synthesisId));
  await db
    .update(editPlans)
    .set({ steps, status: "executing", updatedAt: new Date() })
    .where(eq(editPlans.id, planId));

  await withGenerationSlot(synthesisId, userId, async (handle) => {
    const completed = await runPlanSteps(
      handle, planId, steps, fromIndex, regenCtx, addCtx,
    );
    if (!completed) return;
    await appendCascadeSteps(synthesisId, userId, planId, steps);
    await setPlanStatus(planId, "done");
    await sendPlanUpdated(synthesisId, planId, userId);
  });
}

/* ══ Регистрация разъёма (побочный эффект импорта; образец 1.4b) ══════ */

setPlanResumeExecutor((synthesisId, planId, userId, mode) =>
  resumePlanExecutor(synthesisId, planId, userId, mode),
);
