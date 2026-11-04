/**
 * Шаги плана мельче раздела (беседа 10.2): правка элемента готовым текстом
 * (edit_element) и точечная генерация в элемент (refine_element).
 *
 * Единственный источник: какие шаги бесплатны, какие виды элементов и какие
 * их поля шаг адресует, в каком разделе элемент живёт. По нему работают
 * планировщик, исполнитель, оценка и панель 10.3.
 */
import type {
  EditStep,
  EditStepType,
  ElementStepKind,
  PlanCascadePending,
  PlanCostBreakdown,
} from "../types/edit-plan.js";

/** Шаги, которым модель не нужна: квота и резерв для них не берутся.
 *  15.2 (Д-71): удаления мельче раздела — тоже бесплатны. */
export const FREE_STEP_TYPES: readonly EditStepType[] = [
  "delete",
  "edit_element",
  "delete_element",
  "delete_subsection",
];

export function isFreeStepType(t: EditStepType): boolean {
  return FREE_STEP_TYPES.includes(t);
}

/** Шаги, адресующие ЭЛЕМЕНТ (цель «kind:elementId»). 15.2: + delete_element. */
export const ELEMENT_STEP_TYPES: readonly EditStepType[] = [
  "edit_element",
  "refine_element",
  "delete_element",
];

export function isElementStepType(t: EditStepType): boolean {
  return ELEMENT_STEP_TYPES.includes(t);
}

/**
 * 15.2 (Д-71): шаги удаления мельче раздела — НЕ под `delete` (у того цель
 * различается по «:»: раздел либо «modeKey:index»; «category:uuid» приняли бы
 * за результат режима). Исполнитель, планировщик (updatePlan переносит их
 * дословно) и панель плана ветвятся по этому списку; сторож 4bj сверяет, что
 * ветки есть у всех троих.
 */
export const DELETE_STEP_TYPES: readonly EditStepType[] = ["delete_element", "delete_subsection"];

export function isDeleteStepType(t: EditStepType): boolean {
  return DELETE_STEP_TYPES.includes(t);
}

/** Виды элементов, удаляемых шагом delete_element / DELETE-маршрутом 15.2
 *  (связь удаляется своим путём — deleteCategoryEdge, панель графа). */
export const DELETABLE_ELEMENT_KINDS = ["category", "thesis", "glossary_term"] as const;
export type DeletableElementKind = (typeof DELETABLE_ELEMENT_KINDS)[number];

export function isDeletableElementKind(k: unknown): k is DeletableElementKind {
  return (DELETABLE_ELEMENT_KINDS as readonly unknown[]).includes(k);
}

export const ELEMENT_STEP_KINDS: readonly ElementStepKind[] = [
  "category",
  "thesis",
  "glossary_term",
  "edge",
];

/**
 * Текстовые поля элемента, доступные шагу; первое — поле по умолчанию (то, о
 * чём рекомендация говорит без уточнения: определение категории, формулировка
 * тезиса, определение термина, описание связи).
 */
export const ELEMENT_STEP_FIELDS: Readonly<Record<ElementStepKind, readonly string[]>> = {
  category: ["definition", "name", "origin"],
  thesis: ["formulation", "justification"],
  glossary_term: ["definition", "term"],
  edge: ["description"],
};

export const ELEMENT_STEP_FIELD_LABELS: Readonly<Record<string, string>> = {
  definition: "определение",
  name: "название",
  origin: "происхождение",
  formulation: "формулировка",
  justification: "обоснование",
  term: "термин",
  description: "описание связи",
};

export const ELEMENT_STEP_KIND_LABELS: Readonly<Record<ElementStepKind, string>> = {
  category: "категория",
  thesis: "тезис",
  glossary_term: "термин глоссария",
  edge: "связь",
};

export function defaultElementStepField(kind: ElementStepKind): string {
  return ELEMENT_STEP_FIELDS[kind][0] as string;
}

/** Раздел-хозяин элемента (куда служба врезает его таблицу, 5.1). */
export const ELEMENT_STEP_HOST: Readonly<Record<ElementStepKind, string>> = {
  category: "graph",
  edge: "graph",
  thesis: "theses",
  glossary_term: "glossary",
};

/** target шага элемента: «kind:elementId». */
export function elementStepTarget(kind: ElementStepKind, elementId: string): string {
  return `${kind}:${elementId}`;
}

export function parseElementStepTarget(
  target: string,
): { kind: ElementStepKind; elementId: string } | null {
  const i = target.indexOf(":");
  if (i <= 0) return null;
  const kind = target.slice(0, i);
  if (!(ELEMENT_STEP_KINDS as readonly string[]).includes(kind)) return null;
  return { kind: kind as ElementStepKind, elementId: target.slice(i + 1) };
}

/** 15.2: цель шага подраздела (regen_subsection / delete_subsection) —
 *  «sectionKey:подраздел»; имя подраздела само может содержать «:». */
export function parseSubsectionStepTarget(
  target: string,
): { sectionKey: string; subsectionName: string } | null {
  const i = target.indexOf(":");
  if (i <= 0 || i === target.length - 1) return null;
  return { sectionKey: target.slice(0, i), subsectionName: target.slice(i + 1) };
}

/**
 * 12.3 (Д-7): шаг ВЗЯТ в план — человек его подтвердил (либо он уже исполнен
 * или исполняется). Не взяты: снятые ('skipped') и ждущие решения ('pending' —
 * каскадные и структурный шаг; без подтверждения они не исполняются). В
 * черновике взятые — ровно 'confirmed'; после прогона к ним относятся и
 * 'running' / 'done' / 'failed': прогноз взятого исполнением не обнуляется.
 */
export function isTakenStep(step: Pick<EditStep, "status">): boolean {
  return step.status !== "skipped" && step.status !== "pending";
}

/** Шаг ждёт решения человека: в оценку плана не входит (Д-7). */
export function isPendingStep(step: Pick<EditStep, "status">): boolean {
  return step.status === "pending";
}

/**
 * Бесплатное ОТДЕЛЬНО от платного — по ВЗЯТЫМ шагам (12.3, Д-7): снятые и
 * ждущие решения не считаются. `estimatedCost` — оценка взятых шагов.
 */
export function planCostBreakdown(
  steps: readonly EditStep[],
  estimatedCost: number,
): PlanCostBreakdown {
  let free = 0;
  let paid = 0;
  for (const s of steps) {
    if (!isTakenStep(s)) continue;
    if (isFreeStepType(s.type)) free += 1;
    else paid += 1;
  }
  return { free: { steps: free, costUsd: 0 }, paid: { steps: paid, costUsd: estimatedCost } };
}

/**
 * 12.3 (Д-7): шаги, ждущие решения, — отдельно от оценки плана. `steps` —
 * сколько их, `costUsd` — во что обойдётся план СВЕРХ estimatedCost, если
 * подтвердить их все.
 */
export function planCascadePending(
  steps: readonly EditStep[],
  pendingCost: number,
): PlanCascadePending {
  return { steps: steps.filter(isPendingStep).length, costUsd: pendingCost };
}
