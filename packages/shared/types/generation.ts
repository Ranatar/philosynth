// ─── Enums ──────────────────────────────────────────────────────────────────

export type GenLogType = "generation" | "version_marker" | "deletion_marker";

export type GenLogSource =
  | "initial"
  | "edit"
  | "edit_add"
  | "cascade"
  | "subsection_regen"
  | "mode"
  | "mode_cascade";

export type GenLogStatus = "done" | "error" | "partial";

export type ContextEntryStatus =
  | "included"
  | "required_missing"
  | "optional_skipped"
  | "truncated";

// ─── Row types ─────────────────────────────────────────────────────────────

/** Запись лога генерации (matches schema.ts generation_log) */
export interface GenLogEntry {
  id: string;
  synthesisId: string;
  sectionKey: string;
  sectionLabel: string;
  logType: GenLogType;
  source: GenLogSource;
  status: GenLogStatus;
  priorChars: number;
  taskChars: number;
  inputChars: number;
  outputChars: number;
  inputTokens: number;
  outputTokens: number;
  /** numeric(10,6) */
  costUsd: string;
  errorMessage: string | null;
  /** secCtxPreview, modeParam, subsections и т.д. */
  metadata: GenLogMetadata;
  createdAt: Date;
}

export interface GenLogMetadata {
  secCtxPreview?: string;
  modeParam?: string;
  subsections?: string[];
  [key: string]: unknown;
}

/** Запись контекстного лога (matches schema.ts context_log) */
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
  /** Детальный массив записей по каждому ctx-ключу */
  entries: ContextEntry[];
  createdAt: Date;
}

/** Одна запись контекста (элемент массива entries JSONB) */
export interface ContextEntry {
  /** Контекстный ключ: 'graph:nodes', 'theses:table', ... */
  key: string;
  status: ContextEntryStatus;
  /** Длина включённого фрагмента (символов) */
  len: number;
  /** Приоритет: 'required' | 'optional' */
  priority: "required" | "optional";
  /** Доля от бюджета, выделенная этому фрагменту */
  share?: number;
  /** Был ли фрагмент обрезан */
  truncated?: boolean;
}
