// ─── Enums ──────────────────────────────────────────────────────────────────

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

// ─── Row type (matches schema.ts edit_plans) ───────────────────────────────

export interface EditPlan {
  id: string;
  synthesisId: string;
  userId: string;
  status: EditPlanStatus;
  currentStep: number;
  /** Массив шагов (JSONB в БД) */
  steps: EditStep[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Nested types (stored in JSONB steps) ──────────────────────────────────

export interface EditStep {
  type: EditStepType;
  /** sectionKey или "sectionKey:subsectionName" */
  target: string;
  status: EditStepStatus;
  /** secCtx для этого шага */
  context?: string;
  result?: StepResult;
  /** true = шаг добавлен автоматически каскадом */
  cascadeGenerated: boolean;
}

export interface StepResult {
  outputChars: number;
  inputTokens: number;
  outputTokens: number;
  /** numeric as number — вычислено на сервере */
  cost: number;
}

// ─── Input types ───────────────────────────────────────────────────────────

/** Создание плана (POST /api/plans) */
export interface EditPlanCreateInput {
  synthesisId: string;
  /** Начальные действия пользователя (каскад добавится сервером) */
  steps: EditStepInput[];
}

export interface EditStepInput {
  type: EditStepType;
  target: string;
  context?: string;
}

/** Обновление плана (PATCH /api/plans/:id) — подтверждение/снятие шагов */
export interface EditPlanUpdateInput {
  /** Индексы шагов, которые пользователь подтвердил */
  confirmedSteps?: number[];
  /** Индексы шагов, которые пользователь пропустил */
  skippedSteps?: number[];
}
