/**
 * Находки сторожа рекомендаций — кодом в БД, фразой при чтении
 * (беседа 12.3, Д-46).
 *
 * ЧТО БЫЛО. Сторож 10.1 (`guardRows`), планировщик 10.2 («адресат не найден
 * при постановке плана») и сверка «Основания» 12.3 писали в
 * `recommendations.invalid_reason` / `warning` готовую русскую фразу, а
 * панель показывала её как есть — при английском или немецком интерфейсе
 * причина оставалась русской. Обернуть фразу в `tl()` при записи нельзя:
 * язык записи — язык запроса РАЗБОРА, читать строку могут на другом.
 *
 * ЧТО СТАЛО. Находка — `{ level, code, params }` (shared
 * `RecommendationIssue`), хранится в `recommendations.issues` (jsonb,
 * миграция 0013). Фразу собирает `renderIssue` под языком запроса в момент
 * чтения (`toRecommendationDto`). Колонки `invalid_reason` и `warning`
 * остаются и несут РУССКИЙ вид той же фразы (`renderIssuesRu`): для
 * SQL-диагностики и для строк, разобранных до 12.3, у которых кодов нет
 * (`issues IS NULL`) — у них DTO отдаёт сохранённый текст.
 *
 * ПАРАМЕТРЫ — данные документа и машинные значения контракта: названия
 * подразделов и элементов, операции, важность. Они не переводятся (11.1:
 * машинные значения документа — по-русски при любом языке). Исключение —
 * ключи разделов (`sections`): хранятся ключами, показываются меткой
 * `tData(KEY_LABELS[key])`.
 *
 * Модуль чистый (без БД): фразы проверяются смоуком на трёх языках. Русские
 * тексты ДОСЛОВНО равны фразам 10.1/10.2/12.3 — на них стоят тесты прежних
 * бесед и сохранённые строки.
 */
import {
  RECOMMENDATION_ISSUE_CODES,
  RECOMMENDATION_ISSUE_LEVELS,
  type RecommendationIssueCode,
  type RecommendationIssueLevel,
} from "@philosynth/shared/constants/recommendations";
import { KEY_LABELS, isSectionKey } from "@philosynth/shared/constants/section-labels";
import { tData } from "@philosynth/shared/i18n/data";
import { tl } from "@philosynth/shared/i18n/t";

import { runWithLocale } from "../i18n/locale.js";

import type { RecommendationIssue } from "@philosynth/shared/types/recommendations";

/** Находка: уровень, код, параметры (пустые значения не пишутся). */
export function issue(
  level: RecommendationIssueLevel,
  code: RecommendationIssueCode,
  params: Record<string, string | string[]> = {},
): RecommendationIssue {
  return { level, code, params };
}

const str = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? v.join(", ") : (v ?? "");
const list = (v: string | string[] | undefined): string[] =>
  Array.isArray(v) ? v : v ? [v] : [];
/** Название в кавычках языка запроса: «А» / “A” / „A“. */
const q = (name: string): string =>
  tl("server.recommendationIssues.quoted", "«{name}»", { name });
/** Названия в кавычках через запятую: «А», «Б». */
const quoted = (v: string | string[] | undefined): string => list(v).map(q).join(", ");

/**
 * Фраза находки на языке текущего запроса (вне запроса — по-русски).
 * Каждый код — свой литеральный `tl()`: опись и `i18n:check` видят тексты.
 */
export function renderIssue(it: RecommendationIssue): string {
  const p = it.params ?? {};
  switch (it.code) {
    case "num_invalid":
      return tl("server.recommendationIssues.numInvalid", "№ «{num}» не номер рекомендации (ожидается «5», «5а», «5б»)", { num: str(p["num"]) });
    case "address_empty":
      return tl("server.recommendationIssues.addressEmpty", "адрес пуст: рекомендация обязана называть подраздел документа");
    case "address_not_found":
      return list(p["near"]).length > 0
        ? tl("server.recommendationIssues.addressNotFoundNear", "подраздела «{address}» в документе нет (похожие: {near})", { address: str(p["address"]), near: quoted(p["near"]) })
        : tl("server.recommendationIssues.addressNotFound", "подраздела «{address}» в документе нет", { address: str(p["address"]) });
    case "address_in_critique":
      return tl("server.recommendationIssues.addressInCritique", "«{address}» — подраздел самой критики: адресом рекомендации он быть не может", { address: str(p["address"]) });
    case "address_ambiguous":
      return tl("server.recommendationIssues.addressAmbiguous", "адрес «{address}» неоднозначен: такой подраздел есть в разделах {sections}", {
        address: str(p["address"]),
        // ключи разделов → метки на языке запроса (данные — по месту показа)
        sections: list(p["sections"])
          .map((k) => q(isSectionKey(k) ? tData(KEY_LABELS[k]) : k))
          .join(tl("server.recommendationIssues.and", " и ")),
      });
    case "element_not_found":
      return tl("server.recommendationIssues.elementNotFound", "элемент «{element}» не найден среди категорий, тезисов и терминов концепции", { element: str(p["element"]) });
    case "op_not_allowed":
      return tl("server.recommendationIssues.opNotAllowed", "операция «{op}» вне закрытого списка: {allowed}", { op: str(p["op"]), allowed: list(p["allowed"]).join(" | ") });
    case "severity_not_allowed":
      return tl("server.recommendationIssues.severityNotAllowed", "важность «{severity}» вне закрытого списка: {allowed}", { severity: str(p["severity"]), allowed: list(p["allowed"]).join(" | ") });
    case "row_duplicate":
      return tl("server.recommendationIssues.rowDuplicate", "строка повторяет предыдущую (тот же №, адрес и элемент)");
    case "target_element_gone":
      return tl("server.recommendationIssues.targetElementGone", "адресат не найден при постановке плана: элемент «{element}» удалён из концепции после разбора", { element: str(p["element"]) });
    case "target_subsection_gone":
      return tl("server.recommendationIssues.targetSubsectionGone", "адресат не найден при постановке плана: подраздел «{subsection}» исчез из документа после разбора", { subsection: str(p["subsection"]) });
    case "rationale_empty":
      return tl("server.recommendationIssues.rationaleEmpty", "основание не указано: контракт требует название подраздела критики, где проблема установлена ({subsections})", { subsections: quoted(p["subsections"]) });
    case "rationale_self":
      return tl("server.recommendationIssues.rationaleSelf", "основанием названы сами рекомендации ({names}): проблема устанавливается в подразделах критики до них ({subsections})", { names: quoted(p["names"]), subsections: quoted(p["subsections"]) });
    case "rationale_unknown":
      return tl("server.recommendationIssues.rationaleUnknown", "основание {names} — не подраздел критики этого документа (есть: {subsections}). Исполнению строки это не мешает", { names: quoted(p["names"]), subsections: quoted(p["subsections"]) });
  }
}

/** Находки одного уровня одной фразой через «; »; нет находок — null. */
export function renderIssues(
  issues: readonly RecommendationIssue[],
  level: RecommendationIssueLevel,
): string | null {
  const own = issues.filter((x) => x.level === level);
  return own.length ? own.map(renderIssue).join("; ") : null;
}

/** То же по-русски при любом языке запроса — вид для колонок БД. */
export function renderIssuesRu(
  issues: readonly RecommendationIssue[],
  level: RecommendationIssueLevel,
): string | null {
  return runWithLocale("ru", () => renderIssues(issues, level));
}

const CODES = new Set<string>(RECOMMENDATION_ISSUE_CODES);
const LEVELS = new Set<string>(RECOMMENDATION_ISSUE_LEVELS);

/**
 * Находки из колонки jsonb — с проверкой формы: значение колонки приходит из
 * БД, а код, которого служба не знает (строка записана более новой версией
 * либо правлена рукой), молча отбрасывается — тогда у этого уровня остаётся
 * сохранённый текст. NULL и не-массив — [] (строка до 12.3).
 */
export function issuesFromColumn(value: unknown): RecommendationIssue[] {
  if (!Array.isArray(value)) return [];
  const out: RecommendationIssue[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const { level, code, params } = raw as { level?: unknown; code?: unknown; params?: unknown };
    if (typeof level !== "string" || !LEVELS.has(level)) continue;
    if (typeof code !== "string" || !CODES.has(code)) continue;
    const clean: Record<string, string | string[]> = {};
    if (params && typeof params === "object" && !Array.isArray(params))
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        if (typeof v === "string") clean[k] = v;
        else if (Array.isArray(v)) clean[k] = v.filter((x): x is string => typeof x === "string");
      }
    out.push({
      level: level as RecommendationIssueLevel,
      code: code as RecommendationIssueCode,
      params: clean,
    });
  }
  return out;
}

/**
 * Что показать человеку у строки: фраза уровня на языке запроса, если у
 * уровня есть находки кодами; иначе — сохранённый текст (строка до 12.3 либо
 * неизвестные коды).
 */
export function issueTextFor(
  issues: readonly RecommendationIssue[],
  level: RecommendationIssueLevel,
  stored: string | null,
): string | null {
  return renderIssues(issues, level) ?? stored;
}
