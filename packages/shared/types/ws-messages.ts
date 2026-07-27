/**
 * Типы WebSocket-протокола (клиент ↔ сервер).
 * Соответствие: 03-specification §3.1–3.3 (включая v11:
 * resume_generation/resume_plan, generation_paused с estimates,
 * generation_resumed) и §3.4 (rate limiting).
 */

import type { PauseReasonKind } from "./synthesis.js";
import type { EditPlan, EditStep, StepResult } from "./edit-plan.js";

/* ── Общие фрагменты ─────────────────────────────────────────────────── */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** Режим возобновления генерации (v11, 01-arch §4.12 п.7) */
export type ResumeGenerationMode =
  | "fill-missing-subs"
  | "retry"
  | "skip"
  | "stop";

/** Режим возобновления плана */
export type ResumePlanMode = "retry" | "skip_step" | "stop";

/** Серверный аналог _computeGenPauseEstimates: оценки стоимости действий */
export interface PauseEstimates {
  fillMissingSubs?: number;
  wholeSection?: number;
  skipRemaining?: number;
}

/* ── Клиент → Сервер (03-spec §3.1) ──────────────────────────────────── */

export interface WsSubscribeGeneration {
  type: "subscribe_generation";
  synthesisId: string;
}

export interface WsStartRegen {
  type: "start_regen";
  synthesisId: string;
  sectionKey: string;
  context?: string;
}

export interface WsStartSubRegen {
  type: "start_sub_regen";
  synthesisId: string;
  sectionKey: string;
  subsectionName: string;
  userNote?: string;
  includeCurrentContent?: boolean;
}

export interface WsStartMode {
  type: "start_mode";
  synthesisId: string;
  modeKey: string;
  param: string;
}

export interface WsExecutePlan {
  type: "execute_plan";
  synthesisId: string;
  planId: string;
}

export interface WsConfirmStep {
  type: "confirm_step";
  planId: string;
  stepIndex: number;
}

/** Возобновление приостановленной генерации (v11) */
export interface WsResumeGeneration {
  type: "resume_generation";
  synthesisId: string;
  mode: ResumeGenerationMode;
}

/** Возобновление приостановленного плана (v11) */
export interface WsResumePlan {
  type: "resume_plan";
  synthesisId: string;
  planId: string;
  mode: ResumePlanMode;
}

/** Отмена текущей операции (user-abort → pausedState не создаётся,
 *  частичный результат финализируется по правилам stop) */
export interface WsCancel {
  type: "cancel";
  synthesisId: string;
}

export interface WsPing {
  type: "ping";
}

export type WsClientMessage =
  | WsSubscribeGeneration
  | WsStartRegen
  | WsStartSubRegen
  | WsStartMode
  | WsExecutePlan
  | WsConfirmStep
  | WsResumeGeneration
  | WsResumePlan
  | WsCancel
  | WsPing;

/* ── Сервер → Клиент (03-spec §3.2) ──────────────────────────────────── */

export interface WsStreamDelta {
  type: "stream_delta";
  synthesisId: string;
  sectionKey: string;
  /** Инкрементальный HTML-фрагмент */
  delta: string;
  totalChars: number;
  /** Полный HTML (опционально, каждые N дельт) */
  totalHtml?: string;
}

/** Обнаружен подраздел в потоке (трекинг прогресса по data-section) */
export interface WsSubsectionFound {
  type: "subsection_found";
  synthesisId: string;
  sectionKey: string;
  subsectionName: string;
  charsSoFar: number;
}

export interface WsSectionDone {
  type: "section_done";
  synthesisId: string;
  sectionKey: string;
  usage: TokenUsage;
  html: string;
}

export interface WsGenerationComplete {
  type: "generation_complete";
  synthesisId: string;
  totalUsage: TokenUsage;
}

/** Генерация приостановлена (v11): классифицированный обрыв → pausedState.
 *  reasonKind без 'user-abort' — отмена не создаёт паузу (§3.1 cancel). */
export interface WsGenerationPaused {
  type: "generation_paused";
  synthesisId: string;
  kind: "gen" | "plan";
  reasonKind: Exclude<PauseReasonKind, "user-abort">;
  reason: string;
  isPartial: boolean;
  partialSubsections?: string[];
  expectedSubsections?: string[];
  estimates: PauseEstimates;
}

/** Возобновление принято (v11) */
export interface WsGenerationResumed {
  type: "generation_resumed";
  synthesisId: string;
  mode: string;
  fromPassIdx?: number;
}

/** Ошибка генерации (терминальная, без паузы — например IMPORT_INVALID) */
export interface WsStreamError {
  type: "stream_error";
  synthesisId: string;
  sectionKey?: string;
  error: string;
  partialHtml?: string;
  recoverable: boolean;
}

export interface WsPlanUpdated {
  type: "plan_updated";
  planId: string;
  plan: EditPlan;
}

export interface WsPlanStepStarted {
  type: "plan_step_started";
  planId: string;
  stepIndex: number;
}

export interface WsPlanStepDone {
  type: "plan_step_done";
  planId: string;
  stepIndex: number;
  result: StepResult;
}

/** Новые шаги добавлены каскадом */
export interface WsPlanStepsAdded {
  type: "plan_steps_added";
  planId: string;
  newSteps: EditStep[];
  reason: string;
}

export interface WsModeDone {
  type: "mode_done";
  synthesisId: string;
  modeKey: string;
  index: number;
  usage: TokenUsage;
  html: string;
}

/* Трансформация graph↔theses */

export interface WsTransformStarted {
  type: "transform_started";
  synthesisId: string;
  direction: "graph_to_theses" | "theses_to_graph";
}

export interface WsTransformDone {
  type: "transform_done";
  synthesisId: string;
  direction: "graph_to_theses" | "theses_to_graph";
  summary: Record<string, number>;
  usage: TokenUsage;
}

/* Обогащение элемента */

export interface WsEnrichmentDelta {
  type: "enrichment_delta";
  synthesisId: string;
  elementId: string;
  delta: string;
  totalChars: number;
}

export interface WsEnrichmentDone {
  type: "enrichment_done";
  synthesisId: string;
  elementId: string;
  enrichmentType: string;
  usage: TokenUsage;
}

/** Reconnect (03-spec §3.3): сервер продолжает стрим с накопленного буфера */
export interface WsResume {
  type: "resume";
  sectionKey: string;
  htmlSoFar: string;
  charsSoFar: number;
}

/** Rate limiting (03-spec §3.4) */
export interface WsRateLimitError {
  type: "error";
  code: "RATE_LIMIT";
  retryAfter: number;
}

export interface WsPong {
  type: "pong";
}

export type WsServerMessage =
  | WsStreamDelta
  | WsSubsectionFound
  | WsSectionDone
  | WsGenerationComplete
  | WsGenerationPaused
  | WsGenerationResumed
  | WsStreamError
  | WsPlanUpdated
  | WsPlanStepStarted
  | WsPlanStepDone
  | WsPlanStepsAdded
  | WsModeDone
  | WsTransformStarted
  | WsTransformDone
  | WsEnrichmentDelta
  | WsEnrichmentDone
  | WsResume
  | WsRateLimitError
  | WsPong;
