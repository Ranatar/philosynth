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
  | "mode_cascade"
  /* 'resume' — строки генлога возобновлённой генерации (исходник
   * _runGenPassesFromIdx [25573] пишет source:"resume"; в перечне
   * 02-data-model §2.15 отсутствует — дыра доков, найдена беседой 1.4b,
   * закрыть патчем доков в завершение беседы). */
  | "resume";

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
  /** ФАКТИЧЕСКИЕ статусы (уточнено 4.2; прежний комментарий называл
   *  несуществующий 'included'): 'found' | 'truncated' | 'missing' |
   *  'skipped_budget' | 'dropped' */
  status: string;
  /** Длина фрагмента, симв. */
  len: number;
  /** 'required' | 'optional' */
  priority: string;
  /** Фрагмент попал через SUBSTITUTION_MAP */
  isSubstitute?: boolean;
  [k: string]: unknown;
}

/** Разбивка по одному родителю внутри ParentSpecLog.perParent */
export interface ParentSpecPerParent {
  /** Имя концепции-родителя */
  name: string;
  /** Поля spec, непустые у этого родителя (канонический порядок) */
  includedFields: string[];
  /** Непустые поля родителя ВНЕ spec раздела («Опущено: …» в логе) */
  omittedFields: string[];
  /** «⚠ отсутствует обязательное поле» в логе */
  missingRequired: string[];
  /** Вес включённых полей с заголовками и обвязкой, симв. */
  chars: number;
}

/**
 * context_log.parent_spec — spec родительского контекста раздела
 * (v11, 01-arch §4.13 п.7).
 *
 * ИСПРАВЛЕНО в беседе 1.3: тип описывал карту «имя родителя → spec», тогда
 * как buildParentSpecForLog [philosynth.html ~10197] возвращает ОДИН spec
 * раздела (required/optional — общие для всех родителей) с разбивкой
 * perParent. Приведено к исходнику.
 */
export interface ParentSpecLog {
  /** Обязательные поля родителей для этого раздела/подраздела */
  required: string[];
  /** Опциональные поля */
  optional: string[];
  /** По одной записи на концепцию-родителя */
  perParent: ParentSpecPerParent[];
  /** Σ perParent[].chars */
  totalChars: number;
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

/**
 * Запись ctxLog, ещё не сохранённая в БД — то, что возвращает
 * buildContextForSection (беседа 1.3). В исходнике эквивалент кладётся в
 * глобальный массив ctxLog [~8357]; на сервере глобального состояния нет,
 * запись отдаётся вызывающему (generation-service, беседа 1.4).
 *
 * Два поля исходника не имеют колонок в context_log (02-data-model §2.16) и
 * НЕ требуют их: оба восстановимы из сохранённого —
 *  rawBaseBudget = CONTEXT_BUDGET[depth] × (sectionKey === "critique" ? 1.5 : 1),
 *  conceptOverheadApplied = rawBaseBudget − budget.
 * Персистентная колонка parent_overhead хранит СЫРОЙ вес родителей
 * (parentOverheadForSection), а не величину ужатия — это разные числа.
 */
export interface CtxLogDraft {
  sectionKey: string;
  /** Базовый бюджет ДО давления родителей (с критиковым ×1.5) */
  rawBaseBudget: number;
  /** На сколько бюджет ужат давлением родителей (0 при mode='full') */
  conceptOverheadApplied: number;
  budgetMode: BudgetMode;
  /** Эффективный бюджет после applyBudgetPressure */
  budget: number;
  /** Сырой вес родительского контекста раздела, симв. → context_log.parent_overhead */
  parentOverhead: number;
  entries: ContextEntry[];
  totalUsed: number;
  reqFound: number;
  reqTotal: number;
  optIncluded: number;
  optTotal: number;
  parentSpec: ParentSpecLog | null;
}

/** Качество контекста раздела (getSectionContextQuality, v11 §4.15 п.3) */
export interface SectionContextQuality {
  /** 0–100; ≥90 — зелёный бейдж */
  score: number;
  /** «отсутствовали обязательные: …», «N пропущено из-за бюджета»,
   *  «N обрезано», «N подстановок» */
  issues: string[];
}
