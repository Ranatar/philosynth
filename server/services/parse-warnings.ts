/**
 * Предупреждения разбора — кодом в БД, фразой при чтении (беседа 14.2, Д-55).
 *
 * ЧТО БЫЛО. `generation_log.metadata.parseWarnings` хранил готовые русские
 * фразы: graph-parser (11.1), `resolveSubsection` (11.2), `missingSubsectionsNote`
 * и заметка повтора таблицы рекомендаций (12.3), чистка разметки (14.1).
 * С 11.3 их показывает владельцу блок замечаний раздела в переведённом
 * интерфейсе и лог генерации — по-русски при любом языке. Обернуть фразу в
 * `tl()` при записи нельзя: язык записи — язык запроса ГЕНЕРАЦИИ (а чаще —
 * фон без запроса), читать могут на другом.
 *
 * ЧТО СТАЛО (образец — `recommendation-issues.ts` 12.3). Предупреждение —
 * `{ code, params }` (shared `ParseWarning`), фразу собирает `renderParseWarning`
 * под языком запроса в момент чтения (`loadSectionParseWarnings`,
 * `log-formatter`). Массив `parseWarnings` принимает и код, и строку: записи
 * до 14.2 и журнал из выгрузки — строки, они показываются как есть.
 *
 * РУССКИЕ ТЕКСТЫ ДОСЛОВНО равны фразам 11.1/11.2/12.3/14.1 — на них стоят
 * сторожа прежних бесед (4av, 4bb) и сохранённые строки. Параметры — данные
 * документа и машинные значения (имена подразделов, атрибуты, ячейки,
 * сообщения ошибок): не переводятся.
 *
 * Модуль чистый (без БД).
 */
import { PARSE_WARNING_CODES, type ParseWarningCode } from "@philosynth/shared/constants/parse-warnings";
import { tl } from "@philosynth/shared/i18n/t";

import { runWithLocale } from "../i18n/locale.js";

import type { SanitizeReport } from "@philosynth/shared/utils/doc-markup-sanitize";
import type { ParseWarning, ParseWarningParams, StoredParseWarning } from "@philosynth/shared/types/parse-warnings";

/** Предупреждение кодом (пустые параметры не пишутся). */
export function pw(code: ParseWarningCode, params: ParseWarningParams = {}): ParseWarning {
  return Object.keys(params).length ? { code, params } : { code };
}

/** Контекст поиска подраздела — префикс фразы при показе (см. `via` в константах). */
export function withVia(w: ParseWarning, via: string): ParseWarning {
  return { code: w.code, params: { ...(w.params ?? {}), via } };
}

const str = (v: string | number | string[] | undefined): string =>
  Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
const num = (v: string | number | string[] | undefined): number =>
  typeof v === "number" ? v : Number(str(v)) || 0;
const list = (v: string | number | string[] | undefined): string[] =>
  Array.isArray(v) ? v : v == null || v === "" ? [] : [String(v)];
/** Название в кавычках языка запроса — общий ключ 12.3 («А» / “A” / „A“). */
const q = (name: string): string => tl("server.recommendationIssues.quoted", "«{name}»", { name });
const quoted = (v: string | number | string[] | undefined): string => list(v).map(q).join(", ");
/** Атрибуты data-section раздела: "a", "b" либо «нет». */
const attrs = (v: string | number | string[] | undefined): string =>
  list(v).map((a) => `"${a}"`).join(", ") || tl("server.parseWarnings.none", "нет");
const tags = (v: string | number | string[] | undefined): string => list(v).map((t) => `<${t}>`).join(", ");

/** Префикс чистки разметки (14.1) — общий для пяти кодов sanitize_*. */
function sanitized(text: string): string {
  return tl("server.parseWarnings.sanitizePrefix", "чистка разметки ответа модели: {text}", { text });
}

/** Префикс контекста поиска подраздела. */
function viaPrefix(via: string | undefined, text: string): string {
  if (!via) return text;
  if (via === "intra") return tl("server.parseWarnings.viaIntra", "intra-контекст: {text}", { text });
  if (via === "thesis_labels") return tl("server.parseWarnings.viaThesisLabels", "метки тезисов: {text}", { text });
  return `${via}: ${text}`;
}

function tableRetryWhat(p: ParseWarningParams): string {
  const subsection = str(p["subsection"]);
  return str(p["gap"]) === "missing"
    ? tl("server.parseWarnings.tableGapMissing", "модель не написала подраздел «{subsection}»", { subsection })
    : tl("server.parseWarnings.tableGapNoTable", "подраздел «{subsection}» написан без таблицы либо без столбцов контракта", { subsection });
}

/**
 * Фраза предупреждения на языке текущего запроса (вне запроса — по-русски).
 * Каждый код — свой литеральный `tl()`: опись и `i18n:check` видят тексты.
 * Строка (запись до 14.2) возвращается как есть.
 */
export function renderParseWarning(w: StoredParseWarning): string {
  if (typeof w === "string") return w;
  const p = w.params ?? {};
  switch (w.code) {
    case "graph_role_unknown":
      return tl("server.parseWarnings.graphRoleUnknown", "топологическая таблица, строка {row} («{name}»), столбец «{column}»: роль «{role}» не опознана (ожидается одна из ролей задания, по-русски) — пропущена", {
        row: num(p["row"]), name: str(p["name"]), column: str(p["column"]), role: str(p["role"]),
      });
    case "graph_table_missing":
      return str(p["table"]) === "Таблица связей"
        ? tl("server.parseWarnings.graphEdgesTableMissing", "подраздел «{table}» не найден — связи не разобраны (атрибуты data-section раздела: {attrs})", { table: str(p["table"]), attrs: attrs(p["attrs"]) })
        : tl("server.parseWarnings.graphNodesTableMissing", "подраздел «{table}» не найден — категории не разобраны (атрибуты data-section раздела: {attrs})", { table: str(p["table"]), attrs: attrs(p["attrs"]) });
    case "graph_dir_unknown":
      return tl("server.parseWarnings.graphDirUnknown", "таблица связей, строка {row} («{src}» → «{tgt}»): направление «{dir}» не опознано (ожидается {expected}) — подставлено «{fallback}»", {
        row: num(p["row"]), src: str(p["src"]), tgt: str(p["tgt"]), dir: str(p["dir"]),
        expected: list(p["expected"]).join(" | "), fallback: str(p["fallback"]),
      });
    case "graph_edge_skipped":
      return str(p["end"]) === "target"
        ? tl("server.parseWarnings.graphEdgeSkippedTarget", "ребро «{src}» → «{tgt}» пропущено: цель не найдена в таблице категорий", { src: str(p["src"]), tgt: str(p["tgt"]) })
        : tl("server.parseWarnings.graphEdgeSkippedSource", "ребро «{src}» → «{tgt}» пропущено: источник не найдена в таблице категорий", { src: str(p["src"]), tgt: str(p["tgt"]) });
    case "graph_normalize_skipped":
      return tl("server.parseWarnings.graphNormalizeSkipped", "нормализация типов на каталог пропущена: {message}", { message: str(p["message"]) });
    case "graph_parse_failed":
      return tl("server.parseWarnings.graphParseFailed", "разбор графа не удался: {message}", { message: str(p["message"]) });
    case "subsection_not_found_no_order":
      return viaPrefix(str(p["via"]) || undefined, tl("server.parseWarnings.subsectionNotFoundNoOrder", "подраздел «{name}» не найден по имени (атрибуты data-section раздела: {attrs}); ожидаемый порядок не передан — опознать по месту нельзя", { name: str(p["name"]), attrs: attrs(p["attrs"]) }));
    case "subsection_not_in_map":
      return viaPrefix(str(p["via"]) || undefined, tl("server.parseWarnings.subsectionNotInMap", "подраздел «{name}» не найден по имени и отсутствует в ожидаемом порядке карты ({count} имён) — опознать по месту нельзя", { name: str(p["name"]), count: num(p["count"]) }));
    case "subsection_count_mismatch":
      return viaPrefix(str(p["via"]) || undefined, tl("server.parseWarnings.subsectionCountMismatch", "подраздел «{name}» не найден по имени; опознать по месту нельзя: в разделе {actual} подраздел(ов), в карте {expected}", { name: str(p["name"]), actual: num(p["actual"]), expected: num(p["expected"]) }));
    case "subsection_by_position":
      return viaPrefix(str(p["via"]) || undefined, tl("server.parseWarnings.subsectionByPosition", "подраздел {index} опознан по месту: атрибут \"{attr}\" вместо \"{name}\"", { index: num(p["index"]), attr: str(p["attr"]), name: str(p["name"]) }));
    case "subsections_missing": {
      const names = list(p["names"]);
      const counts = { names: quoted(names), expected: num(p["expected"]), marked: num(p["marked"]) };
      return names.length === 1
        ? tl("server.parseWarnings.subsectionMissingOne", "модель завершила ответ, не написав подраздел {names} (ожидалось подразделов: {expected}, размечено: {marked}). Раздел сохранён как есть — перегенерируйте его, если подраздел нужен", counts)
        : tl("server.parseWarnings.subsectionMissingMany", "модель завершила ответ, не написав подразделы {names} (ожидалось подразделов: {expected}, размечено: {marked}). Раздел сохранён как есть — перегенерируйте его, если подразделы нужны", counts);
    }
    case "subsections_renamed": {
      const names = list(p["names"]);
      const counts = { names: quoted(names), expected: num(p["expected"]), marked: num(p["marked"]) };
      return names.length === 1
        ? tl("server.parseWarnings.subsectionRenamedOne", "модель завершила ответ, но подраздел {names} по названию не найден (ожидалось подразделов: {expected}, размечено: {marked}) — вероятно, названия изменены. Раздел сохранён как есть", counts)
        : tl("server.parseWarnings.subsectionRenamedMany", "модель завершила ответ, но подразделы {names} по названию не найдены (ожидалось подразделов: {expected}, размечено: {marked}) — вероятно, названия изменены. Раздел сохранён как есть", counts);
    }
    case "table_retry_composed":
      return tl("server.parseWarnings.tableRetryComposed", "таблица рекомендаций: {what} — составлена повторным обращением по готовой прозе", { what: tableRetryWhat(p) });
    case "table_retry_failed":
      return tl("server.parseWarnings.tableRetryFailed", "таблица рекомендаций: {what}; повторное обращение не помогло ({message}) — составьте её по готовой прозе из панели рекомендаций", { what: tableRetryWhat(p), message: str(p["message"]) });
    case "sanitize_dropped":
      return sanitized(tl("server.parseWarnings.sanitizeDropped", "Удалены вместе с содержимым: {tags}", { tags: tags(p["tags"]) }));
    case "sanitize_unwrapped":
      return sanitized(tl("server.parseWarnings.sanitizeUnwrapped", "Теги вне набора документа сняты, текст оставлен: {tags}", { tags: tags(p["tags"]) }));
    case "sanitize_renamed":
      return sanitized(tl("server.parseWarnings.sanitizeRenamed", "Заменены тегами набора: {pairs}", {
        pairs: list(p["pairs"]).map((r) => { const [a, b] = r.split("→"); return `<${a}> → <${b}>`; }).join(", "),
      }));
    case "sanitize_classes_stripped":
      return sanitized(tl("server.parseWarnings.sanitizeClassesStripped", "Сняты классы вне набора: {classes}", { classes: list(p["classes"]).join(", ") }));
    case "sanitize_attrs_stripped":
      return sanitized(tl("server.parseWarnings.sanitizeAttrsStripped", "Сняты атрибуты: {attrs}", { attrs: list(p["attrs"]).join(", ") }));
    default:
      // код новее службы — показать сам код, не терять запись
      return String((w as { code: unknown }).code);
  }
}

/** Фразы списка на языке запроса; строки — как есть. */
export function renderParseWarnings(ws: readonly StoredParseWarning[]): string[] {
  return ws.map(renderParseWarning);
}

/** То же по-русски при любом языке запроса (сторожа, выгрузка, console). */
export function renderParseWarningsRu(ws: readonly StoredParseWarning[]): string[] {
  return runWithLocale("ru", () => renderParseWarnings(ws));
}

/** Предупреждения чистки разметки (14.1) кодами — по отчёту `sanitizeDocMarkup`. */
export function sanitizeParseWarnings(report: SanitizeReport): ParseWarning[] {
  const out: ParseWarning[] = [];
  if (report.dropped.length) out.push(pw("sanitize_dropped", { tags: [...report.dropped] }));
  if (report.unwrapped.length) out.push(pw("sanitize_unwrapped", { tags: [...report.unwrapped] }));
  if (report.renamed.length) out.push(pw("sanitize_renamed", { pairs: [...report.renamed] }));
  if (report.classesStripped.length) out.push(pw("sanitize_classes_stripped", { classes: [...report.classesStripped] }));
  if (report.attrsStripped.length) out.push(pw("sanitize_attrs_stripped", { attrs: [...report.attrsStripped] }));
  return out;
}

const CODES = new Set<string>(PARSE_WARNING_CODES);

/**
 * `metadata.parseWarnings` из jsonb — с проверкой формы: строки (записи до
 * 14.2, журнал из выгрузки) остаются строками; объекты — код с параметрами
 * (неизвестный код сохраняется: `renderParseWarning` покажет его как есть);
 * прочее отбрасывается. NULL и не-массив — [].
 */
export function parseWarningsFromMetadata(value: unknown): StoredParseWarning[] {
  if (!Array.isArray(value)) return [];
  const out: StoredParseWarning[] = [];
  for (const raw of value) {
    if (typeof raw === "string") { out.push(raw); continue; }
    if (!raw || typeof raw !== "object") continue;
    const { code, params } = raw as { code?: unknown; params?: unknown };
    if (typeof code !== "string") continue;
    const clean: ParseWarningParams = {};
    if (params && typeof params === "object" && !Array.isArray(params))
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        if (typeof v === "string" || typeof v === "number") clean[k] = v;
        else if (Array.isArray(v)) clean[k] = v.filter((x): x is string => typeof x === "string");
      }
    out.push({ code: code as ParseWarningCode, params: clean });
  }
  return out;
}

/** Код известен службе? (сторожа и тесты) */
export function isParseWarningCode(code: string): code is ParseWarningCode {
  return CODES.has(code);
}
