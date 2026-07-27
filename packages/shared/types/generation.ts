/**
 * Типы логов генерации и контекста.
 * Соответствие: server/db/schema.ts (generation_log, context_log),
 * 02-data-model §2.15–2.16, 01-architecture §4.13 (parentSpec, budgetMode).
 */

/** v11: маркеры показываются в «Логе контекста»,
 *  исключаются из «Лога промптов» (не являются запросами к API) */
export type GenerationLogType =
  | "generation"
  | "version_marker"
  | "deletion_marker"
  | "pause_marker"
  | "resume_marker"
  | "user_action_marker"
  | "schema_migration_marker";

export type GenerationSource =
  | "initial"
  | "edit"
  | "edit_add"
  | "cascade"
  | "subsection_regen"
  | "mode"
  | "mode_cascade";

/** Строка generation_log (аналог genLog из исходника) */
export interface GenLogEntry {
  id: string;
  synthesisId: string;
  sectionKey: string;
  sectionLabel: string;
  logType: GenerationLogType;
  source: GenerationSource;
  status: string;
  priorChars: number;
  taskChars: number;
  inputChars: number;
  outputChars: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  errorMessage: string | null;
  /** secCtxPreview, modeParam, subsections;
   *  v11: promptSkeleton — скелет промпта пишется при генерации,
   *  реконструкция — только fallback импорта */
  metadata: Record<string, unknown>;
  createdAt: string;
}

/* ── context_log ─────────────────────────────────────────────────────── */

/** v11, tz_budget_mode: 'full' — полный бюджет,
 *  'shrink' — ужат под давлением родителей */
export type BudgetMode = "full" | "shrink";

/** Элемент context_log.entries[] — один фрагмент контекста раздела */
export interface ContextEntry {
  /** Ключ фрагмента: 'graph:nodes', 'theses:summary', ... (CTX_LABELS) */
  key: string;
  /** 'included'|'truncated'|'missing'|'skipped_budget'|... */
  status: string;
  /** Длина фрагмента, симв. */
  len: number;
  /** 'required' | 'optional' */
  priority: string;
  /** Фрагмент попал через SUBSTITUTION_MAP */
  isSubstitute?: boolean;
  [k: string]: unknown;
}

/** context_log.parent_spec — per-parent разбивка (v11, 01-arch §4.13 п.7) */
export interface ParentSpecLog {
  [parentName: string]: {
    required: string[];
    optional: string[];
    /** «⚠ отсутствует обязательное поле» в логе */
    missingRequired: string[];
    /** Опущенные поля */
    omitted: string[];
  };
}

/** Строка context_log (аналог ctxLog из исходника) */
export interface CtxLogEntry {
  id: string;
  synthesisId: string;
  sectionKey: string;
  budget: number;
  totalUsed: number;
  reqFound: number;
  reqTotal: number;
  optIncluded: number;
  optTotal: number;
  /** v11 */
  budgetMode: BudgetMode;
  /** Вес родительского контекста, симв. (v11) */
  parentOverhead: number;
  /** v11; null для не-мета-синтезов */
  parentSpec: ParentSpecLog | null;
  entries: ContextEntry[];
  createdAt: string;
}

/** Качество контекста раздела (getSectionContextQuality, v11 §4.15 п.3) */
export interface SectionContextQuality {
  /** 0–100; ≥90 — зелёный бейдж */
  score: number;
  /** «отсутствовали обязательные: …», «N пропущено из-за бюджета»,
   *  «N обрезано», «N подстановок» */
  issues: string[];
}
