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
  /** Описание режима под заголовком модалки (MODE_CONFIG.desc) —
   *  добавлено беседой 4.1 (аддитивно): ModeModal рендерит desc в
   *  шапке и футере, как исходник [22955] */
  desc: string;
  /** Лейбл параметра: «Философ-критик», «Целевая традиция», «Эпоха/место» */
  paramLabel: string;
  /** Плейсхолдер поля параметра (MODE_CONFIG.paramPlaceholder) —
   *  добавлено беседой 4.1 (аддитивно) */
  paramPlaceholder: string;
  /** Подсказки-примеры параметра */
  suggestions: string[];
  /** Ключ промпт-шаблона в Registry */
  promptKey: string;
}

/** Предупреждение checkModeDeps [22782] (level как в исходнике) */
export interface ModeDepsWarning {
  level: "error" | "info";
  text: string;
}

/** Оценка стоимости режима (estimateModeCost, cost-estimator 1.1) */
export interface ModeCostEstimate {
  inTokens: number;
  outTokens: number;
  cost: number;
}

/** Ответ GET /syntheses/:id/modes/:modeKey (беседа 4.1).
 *  §2.7 специфицирует только { results }; warnings (checkModeDeps) и
 *  estimate (estimateModeCost, fail-open null) добавлены АДДИТИВНО —
 *  транспорт для ModeModal (прецеденты: warnings POST /syntheses 3.1,
 *  hasConceptParents 3.2). Дыра §2.7 — в патч доков на завершение. */
export interface ModeKeyResponse {
  results: ModeResult[];
  warnings: ModeDepsWarning[];
  estimate: ModeCostEstimate | null;
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
