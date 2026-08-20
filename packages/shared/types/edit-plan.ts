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

/* ── Превью каскада (беседа 2.3) ─────────────────────────────────────── */
/*
 * DTO read-only эндпоинта POST /syntheses/:id/plans/impact — серверного
 * транспорта живой панели каскада (клиентская отрисовка analyzeImpact,
 * NEXT-CONTEXT гл. 2.1). Структурно зеркалит CascadeImpact из
 * server/services/cascade-analyzer.ts (сервер отдаёт свой результат как
 * есть); дыра «live-каскад без транспорта» найдена беседой 2.3 —
 * прецеденты того же класса: /syntheses/advice (1.5),
 * /sections/:key/context (1.6).
 */

/** Действия плана в объёме, нужном превью каскада. */
export interface PlanImpactRequest {
  regen: string[];
  remove: string[];
  add: string[];
  /** Для оценки стоимости (не влияет на каскад) */
  modeRegen?: [string, number][];
}

/** Весовая подсказка downstream-раздела (E1: симв. от источника плана). */
export interface FactualWeightHintDto {
  source: string;
  chars: number;
}

/** «Обязательные зависимости отсутствуют» для добавляемого раздела (C1). */
export interface MissingHardDepDto {
  consumer: string;
  label: string;
  sources: { ctxKey: string; src: string; label: string }[];
}

/** Активная подстановка контекста для добавляемого раздела (C2). */
export interface ActiveSubstitutionDto {
  consumer: string;
  consumerLabel: string;
  ctxKey: string;
  ctxLabel: string;
  replacedKey: string | null;
  replacedLabel: string;
  quality: number;
}

/** Рекомендация добавить раздел-источник optional-контекста (C3). */
export interface AddableBenefitDto {
  src: string;
  label: string;
  consumers: string[];
}

/** Затронутый результат режима (E5). */
export interface AffectedModeDto {
  modeKey: string;
  index: number;
  param: string;
  title: string;
  reason: string;
}

/** Результат каскадного анализа (расчётная часть updateLiveCascade). */
export interface CascadeImpactDto {
  /** Downstream: затронутые разделы вне плана (topo-порядок документа) */
  affectedSections: string[];
  /** depKey → фактические веса контекста от источников плана (E1) */
  factualWeights: Record<string, FactualWeightHintDto[]>;
  missingHard: MissingHardDepDto[];
  activeSubstitutions: ActiveSubstitutionDto[];
  recommendations: AddableBenefitDto[];
  affectedModes: AffectedModeDto[];
}

/** Ответ POST /syntheses/:id/plans/impact. */
export interface PlanImpactResponse {
  impact: CascadeImpactDto;
  /** Оценка стоимости ВЫБРАННЫХ действий (без каскадных шагов), USD —
   *  паритет футера исходника: estimateCost({sections}) + режимы */
  estimatedCost: number;
}

/* ── Превью подраздельной перегенерации (беседа 2.3) ─────────────────── */
/*
 * DTO POST /syntheses/:id/subsection-impact. Закрывает транспорт долга
 * §12 «внутрисекционный каскад по affectedSubs»: зависимые вычислимы по
 * картам ДО перегенерации (getIntraDependents/getCrossSecDependents), а
 * роут /regenerate-subsection отвечает { ok:true } фоном и вернуть их
 * не может.
 */

export interface SubsectionImpactRequest {
  sectionKey: string;
  subsectionName: string;
}

/** Затронутый подраздел другого раздела (null = весь раздел). */
export interface CrossSectionDepDto {
  section: string;
  subsection: string | null;
}

export interface SubsectionImpactResponse {
  /** Транзитивные внутрисекционные зависимые (в фактических именах) */
  intraDependents: string[];
  /** Затронутые подразделы других разделов (dedup, только присутствующие) */
  crossDependents: CrossSectionDepDto[];
  affectedModes: AffectedModeDto[];
  /** Оценка стоимости перегенерации самого подраздела; null — нет parts */
  estimate: { cost: number; inTokens: number; outTokens: number } | null;
}
