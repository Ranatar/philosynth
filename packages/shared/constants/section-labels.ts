/**
 * Краткие метки разделов (KEY_LABELS, строки 4077–4095).
 * Ключ: код раздела из sections.key / sectionOrder.
 * Значение: краткое русское название для UI (кнопки, чекбоксы, логи).
 */
export const KEY_LABELS: Record<string, string> = {
  sum: "Резюме",
  graph: "Граф",
  topology: "Топология",
  glossary: "Глоссарий",
  theses: "Тезисы",
  critique: "Критика",
  dialogue: "Диалог",
};

/**
 * Полные заголовки разделов (SECTION_LABELS, строки 4096–4108).
 * Используются как заголовки H2 в документе.
 */
export const SECTION_LABELS: Record<string, string> = {
  sum: "Резюме Синтезированной Концепции",
  graph: "Граф Категорий Синтезированной Концепции",
  topology: "Топология Графа Категорий",
  glossary: "Глоссарий Синтезированной Концепции",
  theses: "Тезисы Синтезированной Концепции",
  critique: "Критический Анализ Синтезированной Концепции",
  dialogue: "Философский Диалог",
};

/**
 * Номера разделов (для sections.section_num).
 */
export const SECTION_NUMS: Record<string, number> = {
  sum: 1,
  graph: 2,
  topology: 3,
  glossary: 4,
  theses: 5,
  critique: 6,
  dialogue: 7,
};

/**
 * Все допустимые ключи разделов.
 */
export const ALL_SECTION_KEYS = Object.keys(KEY_LABELS);

/**
 * Порядок разделов по умолчанию (архитектурный).
 */
export const DEFAULT_SECTION_ORDER = [
  "sum",
  "graph",
  "topology",
  "glossary",
  "theses",
  "critique",
  "dialogue",
] as const;

/**
 * Обязательные разделы (нельзя убрать из синтеза).
 */
export const REQUIRED_SECTIONS = ["sum", "graph"] as const;

/**
 * Разделы, из которых извлекаются гранулярные элементы в БД.
 */
export const PARSED_SECTIONS: Record<string, string> = {
  graph: "categories + category_edges",
  topology: "cluster_labels + topology fields in categories",
  glossary: "glossary_terms",
  theses: "theses",
  dialogue: "dialogue_turns",
};
