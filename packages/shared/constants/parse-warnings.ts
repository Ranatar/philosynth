/**
 * Коды предупреждений разбора (беседа 14.2, Д-55) — закрытый список.
 * Хранятся в `generation_log.metadata.parseWarnings` вместе с параметрами
 * (shared `ParseWarning`), фраза собирается при чтении
 * (`server/services/parse-warnings.ts`). Код, которого служба не знает
 * (строка записана более новой версией), показывается самим кодом.
 *
 * Параметры в комментарии — ключи `params`; `via` — контекст поиска
 * подраздела у кодов `subsection_*` ("intra" — intra-контекст, "thesis_labels"
 * — метки тезисов, иначе — ключ раздела как префикс).
 */
export const PARSE_WARNING_CODES = [
  // ── graph-parser (11.1): топологическая таблица, таблицы категорий и связей
  "graph_role_unknown", // { row, name, column, role }
  "graph_table_missing", // { table, attrs }
  "graph_dir_unknown", // { row, src, tgt, dir, expected, fallback }
  "graph_edge_skipped", // { src, tgt, end: "source" | "target" }
  "graph_normalize_skipped", // { message }
  "graph_parse_failed", // { message }
  // ── html-parser resolveSubsection (11.2): поиск подраздела по имени и месту
  "subsection_not_found_no_order", // { name, attrs, via? }
  "subsection_not_in_map", // { name, count, via? }
  "subsection_count_mismatch", // { name, actual, expected, via? }
  "subsection_by_position", // { index, attr, name, via? }
  // ── generation-service (12.3): сверка подразделов после удачного ответа
  "subsections_missing", // { names: string[], expected, marked }
  "subsections_renamed", // { names: string[], expected, marked }
  // ── recommendations (12.3, Д-21): повтор таблицы рекомендаций
  "table_retry_composed", // { gap: "missing" | "no_table", subsection }
  "table_retry_failed", // { gap, subsection, message }
  // ── чистка разметки ответа модели (14.1, Д-60)
  "sanitize_dropped", // { tags: string[] }
  "sanitize_unwrapped", // { tags: string[] }
  "sanitize_renamed", // { pairs: string[] — "a→b" }
  "sanitize_classes_stripped", // { classes: string[] }
  "sanitize_attrs_stripped", // { attrs: string[] }
] as const;
export type ParseWarningCode = (typeof PARSE_WARNING_CODES)[number];
