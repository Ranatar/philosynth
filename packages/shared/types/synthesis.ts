/**
 * Типы синтеза: параметры, статусы, состояние паузы (v11), API-формы.
 * Соответствие: server/db/schema.ts (таблица syntheses),
 * 03-specification §2.2 (SynthesisFull), 01-architecture §4.12.
 */

import type { ParticipantInput } from "./lineage.js";
import type { SectionFull } from "./section.js";
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

/* ── Публичность (беседа 8.6, миграция 0005) ──────────────────────────── */

/** Ступень видимости синтеза (колонка syntheses.visibility):
 *  'private' — только владелец; 'showcase' — витрина (капсула, метаданные,
 *  философы, даты; тела разделов и элементы не отдаются); 'full' —
 *  произведение целиком. */
export type SynthesisVisibility = "private" | "showcase" | "full";

export const SYNTHESIS_VISIBILITIES: readonly SynthesisVisibility[] = [
  "private",
  "showcase",
  "full",
];

/** Сырые флаги публичности, как в БД (сохраняются при понижении ступени). */
export interface VisibilityFlags {
  visibility: SynthesisVisibility;
  showAuthor: boolean;
  showLogs: boolean;
  showPrompts: boolean;
  allowMeta: boolean;
}

/** Действенность флагов — effectiveFlags(row) (shared/utils/visibility):
 *  showLogs/showPrompts/allowMeta действуют ТОЛЬКО при 'full', на витрине
 *  гасятся; showAuthor — на обеих неприватных ступенях. */
export interface EffectiveFlags {
  showAuthor: boolean;
  showLogs: boolean;
  showPrompts: boolean;
  allowMeta: boolean;
}

/** Кто смотрит (loadSynthesisForRead 8.6): владелец / зарегистрированный /
 *  гость без сессии. */
export type SynthesisViewer = "owner" | "user" | "guest";

/** Что отдаётся смотрящему: 'full' — всё, 'showcase' — без содержания. */
export type SynthesisScope = "full" | "showcase";

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
  /** Разделы, теряющие контекст пропускаемых при skip-remaining
   *  (confirm деградации [25686], беседа 2.2) */
  skipDegrades?: string[];
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
  /** 8.6: ступень и сырые флаги публичности (как в БД). У невладельца
   *  видны — чтобы клиент 8.7 мог объяснить, почему логи/мета закрыты.
   *  Производного isPublic больше нет (снят 8.7 вместе с синонимом PATCH):
   *  «публична» = visibility !== 'private'. */
  visibility: SynthesisVisibility;
  showAuthor: boolean;
  showLogs: boolean;
  showPrompts: boolean;
  allowMeta: boolean;
  /** 8.6: имя автора (users.display_name) — ТОЛЬКО при действенном
   *  show_author и непустом display_name; иначе поля нет. */
  authorName?: string;
  /** 8.6: чем смотрящему отдан документ — 'showcase' значит, что тел
   *  разделов и элементов у него нет по праву, а не по сбою. */
  scope: SynthesisScope;
  /** Текущий пользователь — владелец синтеза (беседа 5.2, «По факту 5.2»):
   *  клиентские гейты правок вместо оптимизма «покажем всем, 403 решит».
   *  Флаг, а не userId — публичный синтез не раскрывает владельца. */
  isOwner: boolean;
  docNum: string;
  sectionOrder: string[];
  version: DocVersion;
  /** v10: снимок sectionOrder для «Структура документа» */
  structureSections: string[] | null;
  capsuleHtml: string;
  /** 8.6: стоимость и токены ГОСТЮ не отдаются никогда (поля отсутствуют);
   *  зарегистрированному — у любой неприватной, флагом не управляются. */
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalCostUsd?: number;
  /** 8.6: тела разделов — ТОЛЬКО гостю при scope='full' («документ одним
   *  ответом»: /sections гостю недоступен); прочим — свой роут. */
  sections?: SectionFull[];
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
  /** 8.6; производный isPublic снят 8.7 — «публична» = visibility !== 'private' */
  visibility: SynthesisVisibility;
  /** 8.6: только при действенном show_author и непустом display_name */
  authorName?: string;
  philosophers: string[];
  /** Есть родители-концепции (parent_type='synthesis') — бейдж
   *  «мета-синтез» в карточке каталога (беседа 3.2, п. 5; аддитивная
   *  правка транспорта: SynthesisPreview признака не нёс — дыра доков,
   *  прецедент аддитивности — warnings в POST из 3.1) */
  hasConceptParents: boolean;
  /** Первые символы капсулы (превью карточки каталога) */
  capsulePreview: string;
  /** 8.6: гостю в GET /syntheses/public поля нет */
  totalCostUsd?: number;
  createdAt: string;
  updatedAt: string;
}

/** Тело PATCH /syntheses/:id (8.6): visibility и четыре флага вместо
 *  isPublic. Синоним isPublic снят 8.7: сервер отвечает 400 с
 *  details.isPublic (клиент шлёт visibility). */
export interface SynthesisPatchInput {
  title?: string;
  extGraphMetrics?: boolean;
  visibility?: SynthesisVisibility;
  showAuthor?: boolean;
  showLogs?: boolean;
  showPrompts?: boolean;
  allowMeta?: boolean;
}

/* ── Импорт HTML-файла (беседа 4.3; 03-spec §2.2 POST /syntheses/import) ── */

/**
 * Предупреждение импорта — форма validateImportMeta исходника [21416]
 * плюс операционные предупреждения сервиса (пропущенные рёбра графа,
 * неразрешённые концепции-родители и т.п.; у них critical=false).
 */
export interface ImportWarning {
  /** Поле метаданных ('phil'|'method'|'depth'|'synthLevel'|'log') либо
   *  область операционного предупреждения ('graph'|'lineage'|'sections'|
   *  'theses'|'glossary'|'modes') */
  field: string;
  message: string;
  /** true — критическое: в исходнике блокировало перегенерацию
   *  (DOC_STATE.incomplete); сервис импортирует, клиент показывает */
  critical: boolean;
}
