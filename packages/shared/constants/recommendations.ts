/**
 * Контракт таблицы рекомендаций критики (беседа 10.1).
 *
 * ЕДИНСТВЕННЫЙ источник закрытых списков и заголовков столбцов: из него
 * собирается шаблон Registry section.critique.sub.recommendations_table
 * (server/config/recommendation-templates.ts), по нему работают разбор и
 * сторож (server/services/recommendations.ts), его же возьмёт панель 10.3.
 * Расхождение «шаблон требует одно, разбор ждёт другое» тем самым
 * невозможно по построению; админская правка шаблона в Registry — под
 * дрейф-контролем integration-check.
 *
 * В одностраничнике прародителя нет: там рекомендации — только проза.
 */

/** Прозаический подраздел критики — источник, ПО которому составляется таблица. */
export const RECOMMENDATIONS_PROSE_SUBSECTION = "Рекомендации по улучшению";

/** Машиночитаемый подраздел — стоит сразу ПОСЛЕ прозаического. */
export const RECOMMENDATIONS_TABLE_SUBSECTION = "Таблица рекомендаций";

/** Раздел-хозяин обоих подразделов. */
export const RECOMMENDATIONS_SECTION_KEY = "critique";

/**
 * Столбцы таблицы. `header` — заголовок, которого требует шаблон; разбор
 * ищет столбец ПО ЗАГОЛОВКУ (после нормализации), а не по позиции: модель
 * может переставить столбцы, и падать из-за этого нельзя. `aliases` —
 * допустимые варианты написания заголовка (нормализованные).
 */
export const RECOMMENDATION_COLUMNS = [
  { field: "num", header: "№", aliases: ["№", "n", "no", "номер", "№ п/п"] },
  { field: "address", header: "Адрес", aliases: ["адрес"] },
  { field: "element", header: "Элемент", aliases: ["элемент"] },
  { field: "op", header: "Операция", aliases: ["операция"] },
  { field: "replacement", header: "Готовая замена", aliases: ["готовая замена"] },
  { field: "rationale", header: "Основание", aliases: ["основание"] },
  { field: "severity", header: "Важность", aliases: ["важность"] },
] as const;

export type RecommendationField = (typeof RECOMMENDATION_COLUMNS)[number]["field"];

/** Строка «Столбцы СТРОГО: …» шаблона. */
export const RECOMMENDATION_HEADERS_LINE = RECOMMENDATION_COLUMNS.map(
  (c) => c.header,
).join(" | ");

/** Закрытый список операций (столбец «Операция»). */
export const RECOMMENDATION_OPS = [
  "переопределить",
  "уточнить формулировку",
  "удалить",
  "добавить",
  "развить",
  "перегенерировать",
] as const;
export type RecommendationOp = (typeof RECOMMENDATION_OPS)[number];

/** Слова-пожелания, прямо запрещённые шаблоном: не операции. */
export const RECOMMENDATION_FORBIDDEN_OPS = [
  "улучшить",
  "усилить",
  "доработать",
  "проработать",
] as const;

/** Закрытый список важности (столбец «Важность»). */
export const RECOMMENDATION_SEVERITIES = [
  "блокирующая",
  "существенная",
  "косметическая",
] as const;
export type RecommendationSeverity = (typeof RECOMMENDATION_SEVERITIES)[number];

/**
 * Статусы строки. 'new' | 'planned' | 'done' | 'rejected' | 'invalid' —
 * из текста 10.1; 'stale' заведён сразу (его требует 10.2 п.4: «текст
 * изменился» отдельно от 'invalid' «адрес не найден») — иначе 10.2 начала
 * бы с миграции ради одного значения перечисления.
 */
export const RECOMMENDATION_STATUSES = [
  "new",
  "planned",
  "done",
  "rejected",
  "invalid",
  "stale",
] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

/** Вид элемента, найденного сторожем по столбцу «Элемент». */
export const RECOMMENDATION_ELEMENT_KINDS = [
  "category",
  "thesis",
  "glossary_term",
] as const;
export type RecommendationElementKind =
  (typeof RECOMMENDATION_ELEMENT_KINDS)[number];

/** № рекомендации: «5», «5а», «5б» (кириллица либо латиница, без пробелов). */
export const RECOMMENDATION_NUM_RE = /^\d{1,3}[a-zа-яё]?$/i;

/**
 * Нормализация для сверки названий: снять кавычки всех видов, «§», схлопнуть
 * пробелы, регистр, ё→е. Одна функция на заголовки столбцов, адреса,
 * элементы и значения закрытых списков.
 */
export function normalizeRecommendationText(s: string): string {
  return s
    .replace(/[«»"“”„‟'‘’`]/g, "")
    .replace(/§/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е");
}
