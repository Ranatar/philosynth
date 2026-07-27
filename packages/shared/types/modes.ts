/**
 * Типы режимов (оппонент, переводчик, временной срез).
 * Соответствие: server/db/schema.ts (mode_results),
 * 03-specification §1.7/§2.7, MODE_CONFIG/MODE_DEPS из исходника.
 */

export type ModeKey = "adversarial" | "translator" | "timeslice";

/** Конфигурация режима (MODE_CONFIG; хранится в Prompt Registry) */
export interface ModeConfig {
  key: ModeKey;
  /** «⚔ Оппонент», «🔄 Переводчик», «⏳ Временной срез» */
  title: string;
  /** Лейбл параметра: «Философ-критик», «Целевая традиция», «Эпоха/место» */
  paramLabel: string;
  /** Подсказки-примеры параметра */
  suggestions: string[];
  /** Ключ промпт-шаблона в Registry */
  promptKey: string;
}

/** Декларативные зависимости режима от разделов (MODE_DEPS, v11 §4.15 п.6) */
export interface ModeDeps {
  required: string[];
  optional: string[];
}

/** Строка mode_results + API-представление */
export interface ModeResult {
  id: string;
  synthesisId: string;
  modeKey: ModeKey;
  /** «Кант», «Аналитическая ФР», «Афины V в. до н.э.» */
  paramValue: string;
  htmlContent: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: string;
}
