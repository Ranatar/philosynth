// ─── Enums ──────────────────────────────────────────────────────────────────

export type ModeKey = "adversarial" | "translator" | "timeslice";

// ─── Row type (matches schema.ts mode_results) ────────────────────────────

export interface ModeResult {
  id: string;
  synthesisId: string;
  modeKey: ModeKey;
  /** Параметр режима: «Кант», «Аналитическая ФР», «Афины V в. до н.э.» */
  paramValue: string;
  htmlContent: string;
  inputTokens: number;
  outputTokens: number;
  /** numeric(10,6) */
  costUsd: string;
  createdAt: Date;
}

// ─── Config / input types ──────────────────────────────────────────────────

/**
 * Конфигурация режима (из Prompt Registry / MODE_CONFIG).
 * Определяет промпт, контекстные ключи и параметры для запуска.
 */
export interface ModeConfig {
  key: ModeKey;
  label: string;
  description: string;
  /** Промпт-шаблон (Mustache-подобный) */
  promptTemplate: string;
  /** Контекстные ключи, необходимые для этого режима */
  requiredCtxKeys: string[];
  /** Допускает ли режим множественные результаты */
  allowMultiple: boolean;
}

/** Запрос на запуск режима (POST /api/modes/run) */
export interface ModeRunInput {
  synthesisId: string;
  modeKey: ModeKey;
  paramValue: string;
  /** Доп. контекст от пользователя */
  context?: string;
}

/** Результат запуска режима с метаданными */
export interface ModeRunResult {
  modeResult: ModeResult;
  /** Повлиял ли запуск на версию документа */
  versionBumped: boolean;
}
