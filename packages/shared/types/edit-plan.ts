/**
 * Типы планов редактирования (каскадная перегенерация → персистентные планы).
 * Соответствие: server/db/schema.ts (edit_plans),
 * 01-architecture §4.5, 03-specification §2.6 и §4.2.
 */

/** 'paused' — v11 (01-arch §4.12, pausedState kind="plan") */
export type EditPlanStatus =
  | "draft"
  | "executing"
  | "paused"
  | "done"
  | "failed";

export type EditStepType =
  | "delete"
  | "regen"
  | "add"
  | "regen_subsection"
  | "regen_mode";

export type EditStepStatus =
  | "pending"
  | "confirmed"
  | "running"
  | "done"
  | "skipped"
  | "failed";

/** Результат исполненного шага */
export interface StepResult {
  outputChars: number;
  inputTokens: number;
  outputTokens: number;
  /** В edit_plans.steps[].result хранится как cost;
   *  в API-ответах (03-spec §4.2) — costUsd */
  costUsd: number;
}

/** Элемент edit_plans.steps[] */
export interface EditStep {
  type: EditStepType;
  /** sectionKey или "sectionKey:subsectionName";
   *  для regen_mode — "modeKey:index" */
  target: string;
  status: EditStepStatus;
  /** secCtx для этого шага */
  context?: string;
  result?: StepResult;
  /** true = шаг добавлен автоматически каскадом */
  cascadeGenerated: boolean;
}

/** Строка edit_plans + API-представление (03-spec §4.2) */
export interface EditPlan {
  id: string;
  synthesisId: string;
  status: EditPlanStatus;
  currentStep: number;
  steps: EditStep[];
  /** Суммарная оценка стоимости плана, USD */
  estimatedCost: number;
  createdAt: string;
}

/** Тело POST /syntheses/:id/plans (03-spec §2.6) */
export interface CreatePlanRequest {
  regen: string[];
  remove: string[];
  add: string[];
  regenContexts?: Record<string, string>;
  addContexts?: Record<string, string>;
  modeRegen?: [string, number][];
  modeRemove?: [string, number][];
}

/** Тело PATCH /syntheses/:id/plans/:planId */
export interface UpdatePlanRequest {
  steps: { index: number; status: "confirmed" | "skipped" }[];
}
