/**
 * Типы синтеза: параметры, статусы, состояние паузы (v11), API-формы.
 * Соответствие: server/db/schema.ts (таблица syntheses),
 * 03-specification §2.2 (SynthesisFull), 01-architecture §4.12.
 */

import type { ParticipantInput } from "./lineage.js";
import type { PauseEstimates } from "./ws-messages.js";

/* ── Перечисления параметров (enum-колонки syntheses) ─────────────────── */

export type SynthesisMethod =
  | "dialectical"
  | "integrative"
  | "deconstructive"
  | "hermeneutical"
  | "analytical"
  | "creative";

export type SynthLevel = "comparative" | "transformative" | "generative";

export type Depth = "overview" | "standard" | "deep" | "exhaustive";

export type GenerationOrder = "architectural" | "genetic";

/** 'paused' добавлен в v11 */
export type SynthesisStatus =
  | "draft"
  | "generating"
  | "paused"
  | "ready"
  | "error";

/** Кардинальность участников (v11, 01-arch §4.14) */
export type ParticipantCardinality = "none" | "single" | "multi";

/** Схема родительского контекста (v11, 01-arch §4.13) */
export type ParentContextSchema = "selective-v1" | "monolithic";

/* ── Пауза (v11, 01-arch §4.12) ──────────────────────────────────────── */

/** Таксономия причин обрыва стрима (err.kind из _streamRespOnce) */
/* 'context-error' — reasonKind паузы при сбое ПОСТРОЕНИЯ контекста/промпта
 * (outer catch _runGenPassesFromIdx [philosynth.html ~25842]), а не kind
 * ошибки стрима. В перечне 02-data-model §2.3 отсутствует — дыра доков,
 * зафиксирована беседой 1.4 (закрыть патчем доков в завершение беседы). */
export type PauseReasonKind =
  | "auth"
  | "billing"
  | "pre-stream"
  | "max-tokens"
  | "partial"
  | "stuck"
  | "user-abort"
  | "context-error";

/** syntheses.paused_state, kind === "gen" — прервана основная генерация */
export interface PausedStateGen {
  kind: "gen";
  passIdx: number;
  sectionKeys: string[];
  sectionLabel: string;
  isPartial: boolean;
  reason: string;
  reasonKind: PauseReasonKind;
  timestamp: number;
  partialSubsections: string[];
  expectedSubsections: string[];
  completedPasses: string[][];
  /** Полный снапшот параметров генерации {…p, secCtx} —
   *  возобновление не зависит от состояния формы */
  genParams: Record<string, unknown>;
  maxTokensUsed?: number;
}

/** syntheses.paused_state, kind === "plan" — прерван план редактирования */
export interface PausedStatePlan {
  kind: "plan";
  stepIdx: number;
  totalSteps: number;
  failedOp: Record<string, unknown>;
  remainingOps: Record<string, unknown>[];
  plan: {
    regen: string[];
    remove: string[];
    add: string[];
    modeRegen: [string, number][];
    modeRemove: [string, number][];
  };
  regenCtx: Record<string, string>;
  addCtx: Record<string, string>;
  reason: string;
  reasonKind: PauseReasonKind;
  timestamp: number;
}

export type PausedState = PausedStateGen | PausedStatePlan;

/* ── Версия документа (аналог DOC_STATE.docVersion) ──────────────────── */

export interface DocVersion {
  base: number;
  sub: number;
  modes: number;
  modeRegen: number;
}

/* ── Параметры создания (POST /syntheses, 03-spec §2.2) ──────────────── */

export interface SynthesisParams {
  seed: string;
  /** v11: опционально — оба пусты = свободный синтез (обязателен seed) */
  philosophers?: string[];
  /** v11: опционально (мета-синтез) */
  participants?: ParticipantInput[];
  sections: string[];
  method: SynthesisMethod;
  depth: Depth;
  synthLevel: SynthLevel;
  generationOrder?: GenerationOrder;
  /** v10: расширенные характеристики графа */
  extGraphMetrics?: boolean;
  /** v11: tz_budget_mode */
  keepFullBudget?: boolean;
  context?: string;
  /** secCtx per-section */
  sectionContexts?: Record<string, string>;
  lang?: string;
}

/* ── Полное представление (GET /syntheses/:id) ───────────────────────── */

export interface SynthesisFull {
  id: string;
  title: string;
  seed: string;
  method: SynthesisMethod;
  synthLevel: SynthLevel;
  depth: Depth;
  generationOrder: GenerationOrder;
  /** v10 */
  extGraphMetrics: boolean;
  context: string;
  lang: string;
  /** v11: + 'paused' */
  status: SynthesisStatus;
  /** v11 */
  keepFullBudget: boolean;
  /** v11: 'selective-v1' | 'monolithic' */
  parentContextSchema: ParentContextSchema;
  /** v11: syntheses.paused_state */
  pausedState: PausedState | null;
  /** v11: оценки действий паузы — computePauseEstimates(id, ps) из
   *  pause-resume-service (1.4b), fail-open {}; null при pausedState=null.
   *  Не путать с оценкой стоимости /estimate (03 §2.2, беседа 1.6). */
  pauseEstimates: PauseEstimates | null;
  isPublic: boolean;
  docNum: string;
  sectionOrder: string[];
  version: DocVersion;
  /** v10: снимок sectionOrder для «Структура документа» */
  structureSections: string[] | null;
  capsuleHtml: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  createdAt: string;
  updatedAt: string;
  // Связи
  philosophers: string[];
  parentSyntheses: { id: string; title: string }[];
  childSyntheses: { id: string; title: string }[];
}

/* ── Превью для каталога (GET /syntheses, /syntheses/public) ─────────── */

export interface SynthesisPreview {
  id: string;
  title: string;
  method: SynthesisMethod;
  synthLevel: SynthLevel;
  depth: Depth;
  status: SynthesisStatus;
  isPublic: boolean;
  philosophers: string[];
  /** Первые символы капсулы (превью карточки каталога) */
  capsulePreview: string;
  totalCostUsd: number;
  createdAt: string;
  updatedAt: string;
}
