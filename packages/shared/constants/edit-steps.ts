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
  PlanCostBreakdown,
} from "../types/edit-plan.js";

/** Шаги, которым модель не нужна: квота и резерв для них не берутся. */
export const FREE_STEP_TYPES: readonly EditStepType[] = ["delete", "edit_element"];

export function isFreeStepType(t: EditStepType): boolean {
  return FREE_STEP_TYPES.includes(t);
}

export const ELEMENT_STEP_TYPES: readonly EditStepType[] = ["edit_element", "refine_element"];

export function isElementStepType(t: EditStepType): boolean {
  return ELEMENT_STEP_TYPES.includes(t);
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

/** Бесплатное ОТДЕЛЬНО от платного; снятые шаги не считаются. */
export function planCostBreakdown(
  steps: readonly EditStep[],
  estimatedCost: number,
): PlanCostBreakdown {
  let free = 0;
  let paid = 0;
  for (const s of steps) {
    if (s.status === "skipped") continue;
    if (isFreeStepType(s.type)) free += 1;
    else paid += 1;
  }
  return { free: { steps: free, costUsd: 0 }, paid: { steps: paid, costUsd: estimatedCost } };
}
