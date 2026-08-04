/**
 * edit-planner — персистентные планы редактирования (беседа 2.1;
 * 01-arch §4.5, 03-spec §2.6/§4.2, карта 04 §2.4).
 *
 * Замена цепочек confirm() исходника (recalcEditPlan [19053] +
 * updateLiveCascade [19139] + updateEditPlanUI): вместо живого пересчёта
 * по чекбоксам — таблица edit_plans с шагами EditStep.
 *
 * Адаптации DOM/DOC_STATE → сервис:
 *  - recalcEditPlan снимал план с чекбоксов DOM — здесь план приходит
 *    телом POST /plans (CreatePlanRequest, 03 §2.6): { regen, remove,
 *    add, regenContexts, addContexts, modeRegen, modeRemove };
 *  - getAvailableSectionsToAdd (DOM) → валидация: add ⊆ известные
 *    разделы ∖ текущий sectionOrder;
 *  - каскад вычисляет analyzeImpact (cascade-analyzer): затронутые
 *    downstream-разделы становятся regen-шагами cascadeGenerated=true,
 *    затронутые режимы — шагами regen_mode cascadeGenerated=true
 *    (workflow 01-arch §4.5 п.2–3);
 *  - порядок add+regen — единый топологический buildPlanOrder (v10,
 *    01-arch §4.5 п.6); delete-шаги идут ПЕРЕД ним (порядок документа),
 *    шаги режимов — в конце (delete режимов, затем regen_mode);
 *  - статусы: шаги, явно выбранные пользователем, — 'confirmed';
 *    каскадные — 'pending' (пользователь подтверждает/снимает,
 *    01-arch §4.5 п.4);
 *  - удаление результата режима: отдельного EditStepType нет (03 §4.2) —
 *    шаг type='delete' с target «modeKey:index» (различение по target,
 *    как у regen_mode);
 *  - estimatedCost (03 §4.2) НЕ хранится в edit_plans (02 §2.13) —
 *    вычислим заново из шагов; считается при создании и при каждом
 *    чтении/обновлении (estimatePlanCost);
 *  - estimatePlanCost: regen/add-шаги — через estimateCascadeWaveCost
 *    (порт 2.1) с поставщиками поверх серверного estimateCost
 *    (isEdit:true + фактические размеры генлога, по образцу
 *    computePauseEstimates из 1.4b); regen_subsection-шаги (появятся у
 *    executor'а 2.2) — estimateSubsectionCost; regen_mode —
 *    estimateModeCost; delete — 0.
 *
 * НЕ здесь (беседа 2.2): исполнение плана (plan-executor, execute,
 * confirm_step, pausedState kind='plan').
 */

import { and, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { editPlans, syntheses } from "../db/schema.js";
import {
  analyzeImpact,
  getEffectiveModeDepsFromConfig,
  loadModesState,
  sortInTopoOrder,
} from "./cascade-analyzer.js";
import { buildPlanOrder } from "./plan-order-builder.js";
import {
  estimateCascadeWaveCost,
  estimateCost,
  estimateModeCost,
  estimateSubsectionCost,
} from "./cost-estimator.js";
import { loadActualOutputChars } from "./pause-resume-service.js";
import { loadSynthesis } from "./generation-service.js";
import {
  baseCtx,
  baseCtxStatic,
  buildSYS,
  hasConceptParticipants,
} from "./prompt-builder.js";
import {
  SEC_NAMES,
  buildSectionDefs,
  patchPromptsWithSecCtx,
} from "./section-defs-builder.js";
import {
  buildEffectiveDeps,
  resolveContextDeps,
} from "./synthesis-engine.js";
import { buildDynamicOrder } from "../utils/topo-sort.js";

import type {
  CreatePlanRequest,
  EditPlan,
  EditStep,
  UpdatePlanRequest,
} from "@philosynth/shared/types/edit-plan";
import type {
  Depth,
  GenerationOrder,
  SynthesisMethod,
  SynthLevel,
} from "@philosynth/shared/types/synthesis";
import type { PromptParams } from "./prompt-builder.js";
import type { SectionDefFull } from "./section-defs-builder.js";
import type { CascadeWaveEntry } from "./cost-estimator.js";

/* ── Ошибки планировщика (коды 03 §4.3) ──────────────────────────────── */

export type PlanErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "PLAN_CONFLICT";

export class PlanError extends Error {
  constructor(
    public code: PlanErrorCode,
    message: string,
    public details?: Record<string, string>,
  ) {
    super(message);
    this.name = "PlanError";
  }
}

type PlanRow = typeof editPlans.$inferSelect;
type SynthesisRow = typeof syntheses.$inferSelect;

/** Параметры p из строки syntheses (форма исходника; аналог 1.4/2.1). */
function paramsFromRow(
  row: SynthesisRow,
  philosophers: string[],
): PromptParams & { keepFullBudget: boolean } {
  return {
    seed: row.seed,
    phil: philosophers,
    participants: philosophers.map((name) => ({
      type: "philosopher" as const,
      name,
    })),
    sec: (row.sectionOrder ?? []).filter((k) => k !== "sum"),
    method: row.method as SynthesisMethod,
    synthLevel: row.synthLevel as SynthLevel,
    depth: row.depth as Depth,
    generationOrder: row.generationOrder as GenerationOrder,
    extGraphMetrics: row.extGraphMetrics,
    ctx: row.context,
    lang: row.lang,
    keepFullBudget: row.keepFullBudget,
  };
}

/** Строка edit_plans → API-представление (03 §4.2). */
export function toApiPlan(row: PlanRow, estimatedCost: number): EditPlan {
  return {
    id: row.id,
    synthesisId: row.synthesisId,
    status: row.status,
    currentStep: row.currentStep,
    steps: row.steps,
    estimatedCost,
    createdAt: row.createdAt.toISOString(),
  };
}

/* ── Валидация действий плана ────────────────────────────────────────── */

const KNOWN_SECTIONS = new Set(Object.keys(SEC_NAMES));

interface NormalizedActions {
  regen: string[];
  remove: string[];
  add: string[];
  regenContexts: Record<string, string>;
  addContexts: Record<string, string>;
  modeRegen: [string, number][];
  modeRemove: [string, number][];
}

/**
 * Нормализация + валидация CreatePlanRequest против состояния синтеза.
 * Правила:
 *  - regen/remove ⊆ sectionOrder ∖ {sum} (recalcEditPlan итерирует
 *    order без sum [19055]); add ⊆ известные разделы ∖ sectionOrder
 *    (аналог getAvailableSectionsToAdd);
 *  - regen ∩ remove = ∅ (противоречие); remove ∩ add допустим —
 *    паттерн «заменить раздел» (edge case 4 протокола 2.1);
 *  - modeRegen/modeRemove — пары [modeKey, index] по существующим
 *    результатам; пересечение пар regen∩remove режимов — ошибка.
 */
async function normalizeActions(
  synthesisId: string,
  sectionOrder: readonly string[],
  body: CreatePlanRequest,
): Promise<NormalizedActions> {
  const details: Record<string, string> = {};
  const inDoc = new Set(sectionOrder.filter((k) => k !== "sum"));

  const uniq = (xs: unknown): string[] =>
    Array.isArray(xs)
      ? [...new Set(xs.filter((x): x is string => typeof x === "string"))]
      : [];

  const regen = uniq(body.regen);
  const remove = uniq(body.remove);
  const add = uniq(body.add);

  for (const k of regen)
    if (!inDoc.has(k)) details.regen = `раздел «${k}» отсутствует в документе`;
  for (const k of remove)
    if (!inDoc.has(k)) details.remove = `раздел «${k}» отсутствует в документе`;
  for (const k of add) {
    if (!KNOWN_SECTIONS.has(k)) details.add = `неизвестный раздел «${k}»`;
    else if (inDoc.has(k) && !remove.includes(k))
      details.add = `раздел «${k}» уже есть в документе`;
  }
  const contradiction = regen.filter((k) => remove.includes(k));
  if (contradiction.length > 0)
    details.regen = `regen и remove одновременно: ${contradiction.join(", ")}`;

  const modes = await loadModesState(synthesisId);
  const asPairs = (xs: unknown): [string, number][] =>
    Array.isArray(xs)
      ? xs.filter(
          (t): t is [string, number] =>
            Array.isArray(t) &&
            t.length === 2 &&
            typeof t[0] === "string" &&
            typeof t[1] === "number" &&
            Number.isInteger(t[1]),
        )
      : [];
  const modeRegen = asPairs(body.modeRegen);
  const modeRemove = asPairs(body.modeRemove);
  const checkPair = (field: "modeRegen" | "modeRemove") => {
    for (const [mk, i] of field === "modeRegen" ? modeRegen : modeRemove) {
      const list = modes[mk];
      if (!list || i < 0 || i >= list.length)
        details[field] = `результат «${mk}:${i}» не существует`;
    }
  };
  checkPair("modeRegen");
  checkPair("modeRemove");
  const modeKeyOf = ([mk, i]: [string, number]) => `${mk}:${i}`;
  const removeModeSet = new Set(modeRemove.map(modeKeyOf));
  if (modeRegen.some((t) => removeModeSet.has(modeKeyOf(t))))
    details.modeRegen = "modeRegen и modeRemove одновременно для результата";

  if (Object.keys(details).length > 0)
    throw new PlanError("VALIDATION_ERROR", "Невалидные действия плана", details);

  const ctxMap = (v: unknown): Record<string, string> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).filter(
            (e): e is [string, string] => typeof e[1] === "string",
          ),
        )
      : {};

  return {
    regen,
    remove,
    add,
    regenContexts: ctxMap(body.regenContexts),
    addContexts: ctxMap(body.addContexts),
    modeRegen,
    modeRemove,
  };
}

/* ── Сборка шагов из действий + каскада ──────────────────────────────── */

/**
 * Единый порядок шагов плана:
 *  1) delete разделов (в topo-порядке документа);
 *  2) add + regen (включая каскадные regen) — buildPlanOrder (v10);
 *  3) delete результатов режимов; 4) regen_mode (включая каскадные).
 * Статусы: пользовательские — confirmed, каскадные — pending; при
 * пересборке (updatePlan) прежние статусы переносятся по (type, target).
 */
async function assembleSteps(
  params: PromptParams,
  sectionOrder: readonly string[],
  actions: NormalizedActions,
  cascadeRegen: string[],
  cascadeModes: [string, number][],
  carryOver?: Map<string, EditStep>,
): Promise<EditStep[]> {
  const carried = (type: EditStep["type"], target: string): EditStep | null =>
    carryOver?.get(`${type}\u0000${target}`) ?? null;

  const steps: EditStep[] = [];
  const push = (step: EditStep): void => {
    const prev = carried(step.type, step.target);
    if (prev) {
      // Переносим пользовательское решение (confirmed/skipped) и контекст
      steps.push({
        ...step,
        status:
          prev.status === "skipped" || prev.status === "confirmed"
            ? prev.status
            : step.status,
        ...(prev.context !== undefined ? { context: prev.context } : {}),
      });
    } else {
      steps.push(step);
    }
  };

  // 1) Удаления разделов
  for (const key of sortInTopoOrder(sectionOrder, actions.remove)) {
    push({ type: "delete", target: key, status: "confirmed", cascadeGenerated: false });
  }

  // 2) add + regen единым топопорядком (каскадные regen — внутри)
  const userRegen = new Set(actions.regen);
  const order = await buildPlanOrder(
    {
      regen: [...actions.regen, ...cascadeRegen],
      remove: actions.remove,
      add: actions.add,
    },
    params,
    sectionOrder,
  );
  for (const item of order) {
    const isCascade = item.action === "regen" && !userRegen.has(item.key);
    const context =
      item.action === "add"
        ? actions.addContexts[item.key]
        : actions.regenContexts[item.key];
    push({
      type: item.action,
      target: item.key,
      status: isCascade ? "pending" : "confirmed",
      cascadeGenerated: isCascade,
      ...(context !== undefined ? { context } : {}),
    });
  }

  // 3) Удаления результатов режимов (type='delete', target «modeKey:index»)
  for (const [mk, i] of actions.modeRemove) {
    push({
      type: "delete",
      target: `${mk}:${i}`,
      status: "confirmed",
      cascadeGenerated: false,
    });
  }

  // 4) Перегенерации режимов: пользовательские + каскадные
  const userModes = new Set(actions.modeRegen.map(([mk, i]) => `${mk}:${i}`));
  const removedModes = new Set(actions.modeRemove.map(([mk, i]) => `${mk}:${i}`));
  for (const [mk, i] of actions.modeRegen) {
    push({
      type: "regen_mode",
      target: `${mk}:${i}`,
      status: "confirmed",
      cascadeGenerated: false,
    });
  }
  for (const [mk, i] of cascadeModes) {
    const target = `${mk}:${i}`;
    if (userModes.has(target) || removedModes.has(target)) continue;
    push({
      type: "regen_mode",
      target,
      status: "pending",
      cascadeGenerated: true,
    });
  }

  return steps;
}

/* ── estimatePlanCost ────────────────────────────────────────────────── */

/**
 * Оценка стоимости плана (07: «estimateCost для regen+add шагов +
 * estimateModeCost для mode-шагов»). Skipped-шаги не считаются.
 * Регены/добавления идут волной через estimateCascadeWaveCost —
 * поставщики строятся поверх БУДУЩЕГО состояния документа (после
 * delete/add), с isEdit:true и фактическими размерами из генлога
 * (по образцу computePauseEstimates 1.4b). Ошибки инфраструктуры —
 * fail-open 0 (оценка вспомогательная, как /estimate беседы 1.5).
 */
export async function estimatePlanCost(
  synthesisId: string,
  row: SynthesisRow,
  philosophers: string[],
  steps: EditStep[],
): Promise<number> {
  try {
    const active = steps.filter((s) => s.status !== "skipped");
    const sectionEntries: CascadeWaveEntry[] = [];
    const modeTargets: string[] = [];
    const removedSections = new Set<string>();
    for (const s of active) {
      if (s.type === "delete") {
        if (s.target.includes(":")) continue; // удаление результата режима
        removedSections.add(s.target);
      } else if (s.type === "regen" || s.type === "add") {
        sectionEntries.push({ section: s.target });
      } else if (s.type === "regen_subsection") {
        const idx = s.target.indexOf(":");
        if (idx > 0)
          sectionEntries.push({
            section: s.target.slice(0, idx),
            subsection: s.target.slice(idx + 1),
          });
      } else if (s.type === "regen_mode") {
        modeTargets.push(s.target);
      }
    }
    if (sectionEntries.length === 0 && modeTargets.length === 0) return 0;

    const p = paramsFromRow(row, philosophers);
    const sectionOrder: readonly string[] = row.sectionOrder ?? [];
    const adds = new Set(
      active.filter((s) => s.type === "add").map((s) => s.target),
    );
    const futureSections = [
      ...sectionOrder.filter((k) => k !== "sum" && !removedSections.has(k)),
      ...adds,
    ];

    // Инфраструктура будущего состояния (конвейер 1.1/1.2, как /estimate)
    const fp: PromptParams = { ...p, sec: futureSections };
    const resolvedDeps = await resolveContextDeps(fp);
    const effectiveDeps = await buildEffectiveDeps(
      fp.sec,
      resolvedDeps,
      fp.generationOrder,
    );
    const dynamicOrder = buildDynamicOrder(
      effectiveDeps,
      fp.sec,
      resolvedDeps,
      fp.generationOrder,
    );
    fp.sec = dynamicOrder.filter((k) => k !== "sum");

    const defs = await buildSectionDefs(fp);
    const secCtx: Record<string, string> = {};
    for (const s of active) {
      if ((s.type === "regen" || s.type === "add") && s.context)
        secCtx[s.target] = s.context;
    }
    patchPromptsWithSecCtx(defs, secCtx);
    const defsMap = new Map<string, SectionDefFull>(defs.map((d) => [d.key, d]));

    const estimatorParams = {
      depth: fp.depth,
      generationOrder: fp.generationOrder,
      keepFullBudget: row.keepFullBudget,
    };
    const sysChars = (await buildSYS(fp)).length;
    const baseStaticChars = hasConceptParticipants(fp)
      ? (await baseCtxStatic(fp)).length
      : (await baseCtx(fp)).length;
    const actualOutputChars = await loadActualOutputChars(synthesisId);
    let subSysChars: number | null = null;

    const wave = await estimateCascadeWaveCost(sectionEntries, {
      estimateSection: async (sectionKey) => {
        const def = defsMap.get(sectionKey);
        if (!def) return null;
        return estimateCost({
          params: estimatorParams,
          passes: [[{ key: def.key, prompt: def.prompt, title: def.title }]],
          effectiveDeps,
          sysChars,
          baseStaticChars,
          isEdit: true,
          actualOutputChars,
        });
      },
      estimateSubsection: async (sectionKey, subsectionName) => {
        const def = defsMap.get(sectionKey);
        if (!def?.parts) return null;
        subSysChars ??= (await buildSYS(fp, { outputMode: "subsection" }))
          .length;
        return estimateSubsectionCost({
          sectionKey,
          subsectionName,
          parts: def.parts,
          params: estimatorParams,
          sysChars: subSysChars,
          baseStaticChars,
          effectiveDeps,
          sectionOutputChars: actualOutputChars[sectionKey],
          actualOutputChars,
        });
      },
    });

    let total = wave?.cost ?? 0;

    if (modeTargets.length > 0) {
      const modeSysChars = (await buildSYS(fp, { outputMode: "mode" })).length;
      const seenModeKeys = new Map<string, number>();
      for (const target of modeTargets) {
        const mk = target.slice(0, target.indexOf(":"));
        seenModeKeys.set(mk, (seenModeKeys.get(mk) ?? 0) + 1);
      }
      for (const [mk, count] of seenModeKeys) {
        const deps = await getEffectiveModeDepsFromConfig(
          mk,
          fp.generationOrder,
          ["sum", ...futureSections],
        );
        const est = await estimateModeCost({
          deps,
          params: { depth: fp.depth },
          sysChars: modeSysChars,
        });
        total += est.cost * count;
      }
    }

    return total;
  } catch (err) {
    console.warn("[edit-planner] estimatePlanCost failed:", err);
    return 0;
  }
}

/* ── createPlan ──────────────────────────────────────────────────────── */

/**
 * Порт workflow 01-arch §4.5 п.1–3: принять действия, вычислить каскад
 * (analyzeImpact → затронутые разделы и режимы), добавить каскадные
 * шаги cascadeGenerated=true, сохранить в edit_plans, вернуть EditPlan.
 */
export async function createPlan(
  synthesisId: string,
  userId: string,
  body: CreatePlanRequest,
): Promise<EditPlan> {
  const { row, philosophers } = await loadSynthesis(synthesisId);
  if (row.userId !== userId)
    throw new PlanError("FORBIDDEN", "Нет доступа к синтезу");

  const sectionOrder: readonly string[] = row.sectionOrder ?? [];
  const actions = await normalizeActions(synthesisId, sectionOrder, body);
  const hasAny =
    actions.regen.length +
      actions.remove.length +
      actions.add.length +
      actions.modeRegen.length +
      actions.modeRemove.length >
    0;
  if (!hasAny)
    throw new PlanError("VALIDATION_ERROR", "План пуст", {
      actions: "нужно хотя бы одно действие",
    });

  const impact = await analyzeImpact(synthesisId, {
    regen: actions.regen,
    remove: actions.remove,
    add: actions.add,
  });
  // Каскадные regen: затронутые downstream вне плана (analyzeImpact уже
  // исключил операции плана и удалённые разделы)
  const cascadeRegen = impact.affectedSections;
  const cascadeModes: [string, number][] = impact.affectedModes.map((m) => [
    m.modeKey,
    m.index,
  ]);

  const p = paramsFromRow(row, philosophers);
  const steps = await assembleSteps(
    p,
    sectionOrder,
    actions,
    cascadeRegen,
    cascadeModes,
  );

  const estimatedCost = await estimatePlanCost(
    synthesisId,
    row,
    philosophers,
    steps,
  );

  const [inserted] = await db
    .insert(editPlans)
    .values({ synthesisId, userId, status: "draft", steps })
    .returning();
  if (!inserted) throw new Error("edit_plans insert returned no row");

  return toApiPlan(inserted, estimatedCost);
}

/* ── Чтение/обновление/удаление ──────────────────────────────────────── */

/** Строка плана + владельческий контроль (планы — только владельца). */
export async function loadPlanRow(
  synthesisId: string,
  planId: string,
  userId: string,
): Promise<PlanRow> {
  const [row] = await db
    .select()
    .from(editPlans)
    .where(and(eq(editPlans.id, planId), eq(editPlans.synthesisId, synthesisId)))
    .limit(1);
  if (!row) throw new PlanError("NOT_FOUND", "План не найден");
  if (row.userId !== userId)
    throw new PlanError("FORBIDDEN", "Нет доступа к плану");
  return row;
}

/** GET /plans/:planId — план с живой оценкой стоимости. */
export async function getPlan(
  synthesisId: string,
  planId: string,
  userId: string,
): Promise<EditPlan> {
  const planRow = await loadPlanRow(synthesisId, planId, userId);
  const { row, philosophers } = await loadSynthesis(synthesisId);
  const estimatedCost = await estimatePlanCost(
    synthesisId,
    row,
    philosophers,
    planRow.steps,
  );
  return toApiPlan(planRow, estimatedCost);
}

/**
 * Порт «Пользователь подтверждает/снимает шаги» (01-arch §4.5 п.4) +
 * пересчёт каскада (07): статусы confirmed/skipped применяются к шагам,
 * затем каскад пересобирается от НЕ-снятых пользовательских действий —
 * аналог живого updateLiveCascade при смене чекбоксов. Пользовательские
 * решения по каскадным шагам переносятся по (type, target); каскадные
 * шаги, переставшие быть затронутыми, из плана уходят.
 * Допустим только для планов status='draft' (иначе PLAN_CONFLICT).
 */
export async function updatePlan(
  synthesisId: string,
  planId: string,
  userId: string,
  body: UpdatePlanRequest,
): Promise<EditPlan> {
  const planRow = await loadPlanRow(synthesisId, planId, userId);
  if (planRow.status !== "draft")
    throw new PlanError(
      "PLAN_CONFLICT",
      "План уже исполняется или завершён — статусы шагов не изменить",
    );

  if (!Array.isArray(body.steps))
    throw new PlanError("VALIDATION_ERROR", "Невалидное тело", {
      steps: "массив { index, status }",
    });

  const steps: EditStep[] = planRow.steps.map((s) => ({ ...s }));
  for (const upd of body.steps) {
    const idx = upd?.index;
    const st = upd?.status;
    if (
      typeof idx !== "number" ||
      !Number.isInteger(idx) ||
      idx < 0 ||
      idx >= steps.length
    )
      throw new PlanError("VALIDATION_ERROR", "Невалидный индекс шага", {
        steps: `index ${String(idx)}`,
      });
    if (st !== "confirmed" && st !== "skipped")
      throw new PlanError("VALIDATION_ERROR", "Невалидный статус шага", {
        steps: "status ∈ confirmed | skipped",
      });
    const step = steps[idx] as EditStep;
    if (!["pending", "confirmed", "skipped"].includes(step.status))
      throw new PlanError("VALIDATION_ERROR", "Шаг уже исполнен", {
        steps: `index ${idx}: status=${step.status}`,
      });
    step.status = st;
  }

  // ── Пересчёт каскада от активных пользовательских действий ──
  const { row, philosophers } = await loadSynthesis(synthesisId);
  const sectionOrder: readonly string[] = row.sectionOrder ?? [];

  const base = steps.filter((s) => !s.cascadeGenerated);
  const activeBase = base.filter((s) => s.status !== "skipped");
  const isModeTarget = (t: string) => t.includes(":");
  const pair = (t: string): [string, number] => {
    const i = t.indexOf(":");
    return [t.slice(0, i), Number(t.slice(i + 1))];
  };
  const actions: NormalizedActions = {
    regen: activeBase.filter((s) => s.type === "regen").map((s) => s.target),
    remove: activeBase
      .filter((s) => s.type === "delete" && !isModeTarget(s.target))
      .map((s) => s.target),
    add: activeBase.filter((s) => s.type === "add").map((s) => s.target),
    regenContexts: {},
    addContexts: {},
    modeRegen: activeBase
      .filter((s) => s.type === "regen_mode")
      .map((s) => pair(s.target)),
    modeRemove: activeBase
      .filter((s) => s.type === "delete" && isModeTarget(s.target))
      .map((s) => pair(s.target)),
  };

  const impact = await analyzeImpact(synthesisId, {
    regen: actions.regen,
    remove: actions.remove,
    add: actions.add,
  });

  // Пересборка: пользовательские шаги (включая снятые) + свежий каскад;
  // прежние решения и контексты переносятся по (type, target)
  const carryOver = new Map<string, EditStep>(
    steps.map((s) => [`${s.type}\u0000${s.target}`, s]),
  );
  // Базовые списки для пересборки — ВСЕ пользовательские действия
  // (снятые остаются в плане со статусом skipped)
  const allActions: NormalizedActions = {
    ...actions,
    regen: base.filter((s) => s.type === "regen").map((s) => s.target),
    remove: base
      .filter((s) => s.type === "delete" && !isModeTarget(s.target))
      .map((s) => s.target),
    add: base.filter((s) => s.type === "add").map((s) => s.target),
    modeRegen: base
      .filter((s) => s.type === "regen_mode" && !s.cascadeGenerated)
      .map((s) => pair(s.target)),
    modeRemove: base
      .filter((s) => s.type === "delete" && isModeTarget(s.target))
      .map((s) => pair(s.target)),
  };

  const p = paramsFromRow(row, philosophers);
  const rebuilt = await assembleSteps(
    p,
    sectionOrder,
    allActions,
    impact.affectedSections,
    impact.affectedModes.map((m) => [m.modeKey, m.index]),
    carryOver,
  );

  const [updated] = await db
    .update(editPlans)
    .set({ steps: rebuilt, updatedAt: new Date() })
    .where(eq(editPlans.id, planId))
    .returning();
  if (!updated) throw new PlanError("NOT_FOUND", "План не найден");

  const estimatedCost = await estimatePlanCost(
    synthesisId,
    row,
    philosophers,
    rebuilt,
  );
  return toApiPlan(updated, estimatedCost);
}

/** DELETE /plans/:planId — удаление плана (исполняемый — PLAN_CONFLICT). */
export async function deletePlan(
  synthesisId: string,
  planId: string,
  userId: string,
): Promise<void> {
  const planRow = await loadPlanRow(synthesisId, planId, userId);
  if (planRow.status === "executing")
    throw new PlanError("PLAN_CONFLICT", "План исполняется — сначала остановите");
  await db.delete(editPlans).where(eq(editPlans.id, planId));
}
