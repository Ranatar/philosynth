/**
 * Метки разделов документа.
 * KEY_LABELS — дословный порт из philosynth.html (~5389–5402).
 * SECTION_LABELS / SEC_ID_TO_KEY — из updateSectionWarnings [~6631, ~6653]
 * (сверено по полному исходнику): словари по DOM-id чекбоксов формы;
 * 11 записей — раздел sum отсутствует, он обязателен и чекбокса не имеет.
 */

/** Ключи разделов документа (12, включая capsule) */
export const SECTION_KEYS = [
  "sum",
  "graph",
  "glossary",
  "theses",
  "name",
  "history",
  "origin",
  "practical",
  "dialogue",
  "evolution",
  "critique",
  "capsule",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

/** Ключ раздела → русский заголовок */
export const KEY_LABELS: Readonly<Record<SectionKey, string>> = {
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
} as const;

export function isSectionKey(key: string): key is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(key);
}

/* ── Словари по DOM-id чекбоксов формы (Section Dependency Warnings) ── */

/** DOM-id чекбоксов секций в форме (без sum — он обязателен) */
export const SECTION_CHECKBOX_IDS = [
  "secGraph",
  "secGlossary",
  "secTheses",
  "secHistory",
  "secName",
  "secPractical",
  "secDialogue",
  "secEvolution",
  "secCritique",
  "secOrigin",
  "secCapsule",
] as const;

export type SectionCheckboxId = (typeof SECTION_CHECKBOX_IDS)[number];

/** DOM-id чекбокса → русская метка (SECTION_LABELS, дословно) */
export const SECTION_LABELS: Readonly<Record<SectionCheckboxId, string>> = {
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
} as const;

/** DOM-id чекбокса → ключ раздела (secIdToKey, дословно) */
export const SEC_ID_TO_KEY: Readonly<
  Record<SectionCheckboxId, Exclude<SectionKey, "sum">>
> = {
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
} as const;
