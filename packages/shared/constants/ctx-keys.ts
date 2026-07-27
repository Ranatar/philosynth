/**
 * Ключи и метки контекстных фрагментов.
 * CTX_LABELS — дословный порт из philosynth.html (~8276–8311).
 *
 * ALL_CTX_KEYS в v11 удалён из исходника: перечень ключей ВЫВОДИТСЯ
 * из CTX_LABELS (05-file-structure) — здесь это Object.keys + тип CtxKey.
 */

export const CTX_LABELS = {
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
  // Ключи «второго эшелона»: в CTX_LABELS исходника отсутствовали (в логах
  // рендерились сырым ключом через `CTX_LABELS[k] || k`), но существуют как
  // case-ветки extractContextFragment [~8223, ~8237] и заменители в
  // SUBSTITUTION_MAP ("critique:full" при "graph:topology"). Добавлены при
  // сверке в беседе 0.3, чтобы union CtxKey покрывал все ключи конфигов.
  "critique:full": "Критика (полный текст)",
  "history:full": "История (полный текст)",
  "capsule:full": "Капсула концепции",
} as const;

/** Ключ контекстного фрагмента ('graph:nodes', 'theses:summary', ...) */
export type CtxKey = keyof typeof CTX_LABELS;

/** Перечень всех ключей — выводится из CTX_LABELS (ALL_CTX_KEYS удалён в v11) */
export const ALL_CTX_KEYS: readonly CtxKey[] = Object.keys(
  CTX_LABELS,
) as CtxKey[];

export function isCtxKey(key: string): key is CtxKey {
  return key in CTX_LABELS;
}

/** Раздел-источник фрагмента: 'graph:nodes' → 'graph' */
export function ctxKeySection(key: CtxKey): string {
  return key.split(":")[0] ?? key;
}
