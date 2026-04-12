/**
 * Все контекстные ключи (из CTX_LABELS исходника, строка 7141).
 *
 * Формат: "sectionKey:fragmentType".
 * Используются в buildContextForSection() для извлечения фрагментов
 * из ранее сгенерированных разделов.
 */
export const ALL_CTX_KEYS = [
  // Резюме
  "sum:goals",
  "sum:portraits",
  "sum:novelty",
  "sum:tensions",
  "sum:coherence",
  "sum:difficulty",

  // Граф категорий (+ топология как подраздел)
  "graph:nodes",
  "graph:nodes_top",
  "graph:nodes_compact",
  "graph:edges",
  "graph:topology",

  // Глоссарий
  "glossary:table",

  // Тезисы
  "theses:full",
  "theses:summary",

  // Анализ названия
  "name:title",
  "name:full",

  // Историческая контекстуализация
  "history:contemporary",
  "history:genealogy",
  "history:influence",
  "history:name_context",

  // Анализ происхождения
  "origin:genealogy",
  "origin:decomposition",
  "origin:novelty",

  // Эволюция и перспективы
  "evolution:directions",
  "evolution:graph_changes",
  "evolution:name_evolution",
  "evolution:science",

  // Диалог
  "dialogue:synthesis",
  "dialogue:new_concepts",
  "dialogue:tensions_discovered",
  "dialogue:turning_points",

  // Практическое применение
  "practical:summary",

  // Критический анализ
  "critique:final_table",

  // Капсула
  "capsule:full",
] as const;

export type CtxKey = (typeof ALL_CTX_KEYS)[number];

/**
 * Русские метки контекстных ключей (CTX_LABELS из исходника, строка 7141).
 */
export const CTX_LABELS: Record<CtxKey, string> = {
  "sum:goals": "Резюме → Цели и метод",
  "sum:portraits": "Резюме → Портреты философов",
  "sum:novelty": "Резюме → Новизна и ценность",
  "sum:tensions": "Резюме → Точки напряжения",
  "sum:coherence": "Резюме → Индекс когерентности",
  "sum:difficulty": "Резюме → Оценка сложности",

  "graph:nodes": "Граф → Таблица категорий",
  "graph:nodes_top": "Граф → Топ категорий",
  "graph:nodes_compact": "Граф → Таблица категорий (компактная)",
  "graph:edges": "Граф → Таблица связей",
  "graph:topology": "Граф → Топология",

  "glossary:table": "Глоссарий → Определения",

  "theses:full": "Тезисы (полные)",
  "theses:summary": "Тезисы (сводка)",

  "name:title": "Название концепции",
  "name:full": "Анализ названия",

  "history:contemporary": "История → Современные концепции",
  "history:genealogy": "История → Генеалогия идей",
  "history:influence": "История → Потенциальное влияние",
  "history:name_context": "История → Название в ист. контексте",

  "origin:genealogy": "Происхождение → Родительские традиции",
  "origin:decomposition": "Происхождение → Декомпозиция элементов",
  "origin:novelty": "Происхождение → Оригинальность",

  "evolution:directions": "Эволюция → Направления развития",
  "evolution:graph_changes": "Эволюция → Изменения графа",
  "evolution:name_evolution": "Эволюция → Название",
  "evolution:science": "Эволюция → Современная наука",

  "dialogue:synthesis": "Диалог → Аналитический комментарий",
  "dialogue:new_concepts": "Диалог → Новые понятия",
  "dialogue:tensions_discovered": "Диалог → Обнаруженные напряжения",
  "dialogue:turning_points": "Диалог → Переломные моменты",

  "practical:summary": "Практика → Сводная таблица",

  "critique:final_table": "Критика → Итоговая таблица",

  "capsule:full": "Капсула концепции",
};

/**
 * Маппинг: sectionKey → какие ctx-ключи этот раздел порождает.
 */
export const SECTION_TO_CTX_KEYS: Record<string, readonly CtxKey[]> = {
  sum: [
    "sum:goals",
    "sum:portraits",
    "sum:novelty",
    "sum:tensions",
    "sum:coherence",
    "sum:difficulty",
  ],
  graph: [
    "graph:nodes",
    "graph:nodes_top",
    "graph:nodes_compact",
    "graph:edges",
    "graph:topology",
  ],
  glossary: ["glossary:table"],
  theses: ["theses:full", "theses:summary"],
  name: ["name:title", "name:full"],
  history: [
    "history:contemporary",
    "history:genealogy",
    "history:influence",
    "history:name_context",
  ],
  origin: ["origin:genealogy", "origin:decomposition", "origin:novelty"],
  evolution: [
    "evolution:directions",
    "evolution:graph_changes",
    "evolution:name_evolution",
    "evolution:science",
  ],
  dialogue: [
    "dialogue:synthesis",
    "dialogue:new_concepts",
    "dialogue:tensions_discovered",
    "dialogue:turning_points",
  ],
  practical: ["practical:summary"],
  critique: ["critique:final_table"],
  capsule: ["capsule:full"],
};

/**
 * Обратный маппинг: ctx-ключ → sectionKey.
 */
export const CTX_KEY_TO_SECTION: Record<CtxKey, string> = Object.fromEntries(
  Object.entries(SECTION_TO_CTX_KEYS).flatMap(([section, keys]) =>
    keys.map((key) => [key, section]),
  ),
) as Record<CtxKey, string>;

/**
 * Бюджет контекста по глубине (символов). Из исходника, строка 6413.
 */
export const CONTEXT_BUDGET: Record<string, number> = {
  overview: 24000,
  standard: 48000,
  deep: 72000,
  exhaustive: 100000,
};

/**
 * Доля контекстного бюджета на один фрагмент (FRAGMENT_SHARE, строка 6450).
 * Используется для оценки стоимости и при бюджетировании контекста.
 */
export const FRAGMENT_SHARE: Record<string, number> = {
  "sum:goals": 0.12,
  "sum:portraits": 0.16,
  "sum:novelty": 0.10,
  "sum:tensions": 0.08,
  "sum:coherence": 0.08,
  "sum:difficulty": 0.13,

  "graph:nodes": 0.23,
  "graph:nodes_compact": 0.14,
  "graph:nodes_top": 0.15,
  "graph:edges": 0.18,
  "graph:topology": 0.19,

  "glossary:table": 0.27,

  "theses:full": 0.15,
  "theses:summary": 0.11,

  "name:title": 0.23,
  "name:full": 0.21,

  "history:contemporary": 0.19,
  "history:genealogy": 0.22,
  "history:influence": 0.14,
  "history:name_context": 0.18,

  "origin:decomposition": 0.14,
  "origin:genealogy": 0.20,
  "origin:novelty": 0.18,

  "evolution:directions": 0.29,
  "evolution:graph_changes": 0.18,
  "evolution:name_evolution": 0.13,
  "evolution:science": 0.20,

  "dialogue:synthesis": 0.30,
  "dialogue:new_concepts": 0.50,
  "dialogue:tensions_discovered": 0.30,
  "dialogue:turning_points": 0.40,

  "practical:summary": 0.25,
  "critique:final_table": 0.25,
  "capsule:full": 0.25,
};

// ─── Cost estimation constants (строка 6420) ───────────────────────────────

/** Эмпирика для русского + HTML */
export const CHARS_PER_TOKEN = 2.6;
/** $3 per MTok input */
export const PRICE_IN = 3 / 1e6;
/** $15 per MTok output */
export const PRICE_OUT = 15 / 1e6;
/** HTML-оверхед: теги, атрибуты ~50% к чистому тексту */
export const HTML_OVERHEAD = 1.5;
