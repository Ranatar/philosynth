/**
 * Все контекстные ключи (ALL_CTX_KEYS, строки 5128–5148).
 *
 * Формат: "sectionKey:fragmentType".
 * Используются в buildContextForSection() для извлечения контекстных
 * фрагментов из ранее сгенерированных разделов.
 *
 * Каждому ключу соответствует функция extract*() в context-extractor.ts,
 * которая читает данные из БД (в сервисе) или парсит HTML (в исходнике).
 */
export const ALL_CTX_KEYS = [
  // Резюме
  "sum:capsule",
  "sum:text",
  "sum:goals",
  "sum:tensions",

  // Граф категорий
  "graph:nodes",
  "graph:edges",
  "graph:description",
  "graph:stats",

  // Топология
  "topology:clusters",
  "topology:roles",
  "topology:reflexive",

  // Глоссарий
  "glossary:terms",
  "glossary:compact",

  // Тезисы
  "theses:table",
  "theses:formulations",
  "theses:summary",

  // Критика
  "critique:main",
  "critique:arguments",

  // Диалог
  "dialogue:text",
] as const;

export type CtxKey = (typeof ALL_CTX_KEYS)[number];

/**
 * Русские метки контекстных ключей (CTX_LABELS).
 * Используются в логах и UI контекстного лога.
 */
export const CTX_LABELS: Record<CtxKey, string> = {
  "sum:capsule": "Капсула резюме",
  "sum:text": "Текст резюме",
  "sum:goals": "Цели концепции",
  "sum:tensions": "Ключевые напряжения",

  "graph:nodes": "Таблица категорий",
  "graph:edges": "Таблица связей",
  "graph:description": "Описание графа",
  "graph:stats": "Статистика графа",

  "topology:clusters": "Кластеры",
  "topology:roles": "Роли категорий",
  "topology:reflexive": "Рефлексивные связи",

  "glossary:terms": "Глоссарий (полный)",
  "glossary:compact": "Глоссарий (компактный)",

  "theses:table": "Таблица тезисов",
  "theses:formulations": "Формулировки тезисов",
  "theses:summary": "Сводка тезисов",

  "critique:main": "Основной текст критики",
  "critique:arguments": "Ключевые аргументы",

  "dialogue:text": "Текст диалога",
};

/**
 * Маппинг: sectionKey → какие ctx-ключи этот раздел порождает.
 */
export const SECTION_TO_CTX_KEYS: Record<string, readonly CtxKey[]> = {
  sum: ["sum:capsule", "sum:text", "sum:goals", "sum:tensions"],
  graph: ["graph:nodes", "graph:edges", "graph:description", "graph:stats"],
  topology: ["topology:clusters", "topology:roles", "topology:reflexive"],
  glossary: ["glossary:terms", "glossary:compact"],
  theses: ["theses:table", "theses:formulations", "theses:summary"],
  critique: ["critique:main", "critique:arguments"],
  dialogue: ["dialogue:text"],
};

/**
 * Обратный маппинг: ctx-ключ → sectionKey, который его порождает.
 */
export const CTX_KEY_TO_SECTION: Record<CtxKey, string> = Object.fromEntries(
  Object.entries(SECTION_TO_CTX_KEYS).flatMap(([section, keys]) =>
    keys.map((key) => [key, section]),
  ),
) as Record<CtxKey, string>;
