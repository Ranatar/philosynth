/**
 * Краткие метки разделов (KEY_LABELS — из исходника).
 * Ключ: код раздела (sections.key / sectionOrder).
 */
export const KEY_LABELS: Record<string, string> = {
  sum: "Исполнительное резюме",
  graph: "Граф категорий",
  glossary: "Глоссарий терминов",
  theses: "Корпус тезисов",
  name: "Анализ названия",
  history: "Историческая контекстуализация",
  origin: "Анализ происхождения",
  practical: "Практическое применение",
  dialogue: "Диалог между традициями",
  evolution: "Эволюция и перспективы",
  critique: "Критический анализ",
  capsule: "Капсула концепции",
};

/**
 * Маппинг DOM-id чекбокса → русское название (SECTION_LABELS из исходника).
 * Используется в клиенте для предупреждений о зависимостях.
 */
export const SECTION_LABELS: Record<string, string> = {
  secGraph: "Граф категорий",
  secGlossary: "Глоссарий терминов",
  secTheses: "Корпус тезисов",
  secHistory: "Историческая контекстуализация",
  secName: "Анализ названия",
  secPractical: "Практическое применение",
  secDialogue: "Диалог между традициями",
  secEvolution: "Эволюция и перспективы",
  secCritique: "Критический анализ",
  secOrigin: "Анализ происхождения",
  secCapsule: "Капсула концепции",
};

/**
 * Маппинг DOM-id → sectionKey (secIdToKey из исходника).
 */
export const SEC_ID_TO_KEY: Record<string, string> = {
  secGraph: "graph",
  secGlossary: "glossary",
  secTheses: "theses",
  secHistory: "history",
  secName: "name",
  secPractical: "practical",
  secDialogue: "dialogue",
  secEvolution: "evolution",
  secCritique: "critique",
  secOrigin: "origin",
  secCapsule: "capsule",
};

/**
 * Все допустимые ключи разделов.
 */
export const ALL_SECTION_KEYS = Object.keys(KEY_LABELS);

/**
 * Разделы, необходимые для пригодности концепции к мета-синтезу
 * (SYNTH_READY_SECTIONS из исходника).
 */
export const SYNTH_READY_SECTIONS = [
  "graph",
  "glossary",
  "theses",
  "dialogue",
  "critique",
  "capsule",
] as const;

/**
 * Обязательные разделы (нельзя убрать из синтеза).
 * sum генерируется всегда.
 */
export const REQUIRED_SECTIONS = ["sum"] as const;

/**
 * Разделы, из которых извлекаются гранулярные элементы в БД.
 */
export const PARSED_SECTIONS: Record<string, string> = {
  graph: "categories + category_edges + topology",
  glossary: "glossary_terms",
  theses: "theses",
  dialogue: "dialogue_turns",
};
