/**
 * Рекомендации критики: разбор таблицы, сторож адресов, хэш источника,
 * раунд, ретрофит (беседа 10.1; 02 §2.32, 03 §2.16). В одностраничнике
 * прародителя нет — функциональность новая.
 *
 * Конвейер:  HTML раздела critique
 *   → parseRecommendationsTable  (чистая: столбцы ПО ЗАГОЛОВКАМ, не по месту)
 *   → guardRows                  (чистая: сторож против индекса документа)
 *   → storeRound                 (БД: раунд, идемпотентность, перенос статусов)
 *
 * РЕШЕНИЯ БЕСЕДЫ (подробно — «По факту 10.1» в 07):
 *  1. Ключ раунда — хэш ПРОЗЫ «Рекомендации по улучшению», а не таблицы.
 *     Таблицу правят руками (п.5г беседы; 9.2 это разрешает) — и починка
 *     негодной строки не должна открывать новый раунд и терять статусы.
 *     Проза меняется при перегенерации критики — это и есть смена раунда.
 *     Нет прозы (вырожденный документ) — ключом служит сама таблица.
 *  2. Повторный разбор В ПРЕДЕЛАХ раунда пересобирает строки по текущей
 *     таблице; строки, уже ушедшие в работу (planned/done/rejected),
 *     узнаются по тройке «№ + адрес + элемент» и сохраняют id, статус и
 *     привязку к плану. 'stale' после перечитки снова 'new' (10.2 п.4).
 *  3. Хэш источника у строки С ЭЛЕМЕНТОМ считается по значению элемента,
 *     БЕЗ содержимого подраздела: «Таблицу категорий» служба перерисовывает
 *     целиком при правке ЛЮБОЙ категории (5.1) — иначе исполнение одной
 *     рекомендации делало бы устаревшими все соседние по таблице. У строки
 *     без элемента — по содержимому подраздела-адресата.
 *  4. Номер в раунде не уникален: контракт велит рекомендацию о двух
 *     подразделах писать двумя строками с одним номером. Ключ строки —
 *     position. Полный повтор (№ + адрес + элемент) — 'invalid'.
 *  5. Ретрофит СИНХРОНЕН: одно обращение, запрос ждёт ответа. Фоновая
 *     операция потребовала бы нового WS-сообщения, а клиент 9.2 чужой
 *     stream_error принял бы за обрыв генерации документа — клиента беседа
 *     не трогает. Дельты никому не шлются.
 *
 * Беседа 12.3:
 *  - Д-21: сторож сверяет столбец «Основание» с подразделами критики;
 *    расхождение — ЗАМЕЧАНИЕ строки (колонка `warning`, миграция 0012), а не
 *    'invalid': основание — довод человеку, исполнению не мешает;
 *  - Д-20: оценка ретрофита до вызова (estimateExtractCost) — запрос к модели
 *    собирается целиком и измеряется, модель не зовётся;
 *  - Д-46: находки сторожа хранятся КОДАМИ (`issues`, миграция 0013), фраза
 *    человеку собирается при чтении на языке запроса
 *    (recommendation-issues.ts); `invalid_reason` и `warning` несут её
 *    русский вид. Сторож фраз больше не сочиняет;
 *  - Д-21, вторая половина: СВОЙ ПОВТОР пропущенной таблицы. Модель, не
 *    написавшая «Таблицу рекомендаций» (либо написавшая её без таблицы или
 *    без столбцов), до 12.3 не ловилась ничем: общий механизм недостающих
 *    подразделов 1.4b работает только на ОБРЫВЕ стрима, а не на успешном
 *    проходе. Теперь после каждой удачной генерации критики
 *    (ensureRecommendationsTable — генерация, перегенерация, добавление
 *    раздела) таблица составляется ОДНИМ повторным обращением по готовой
 *    прозе, тем же запросом, что ретрофит; неудача повтора генерацию не
 *    роняет — пометка в генлоге раздела;
 *  - строка генлога ретрофита и повтора идёт ключом подраздела
 *    («critique:Таблица рекомендаций»), а не раздела: ключ раздела делал её
 *    «фактическим размером критики» в оценках (loadActualOutputChars), и
 *    перегенерация критики после ретрофита оценивалась по размеру таблицы;
 *  - Д-11 (ОГРАНИЧЕНИЕ, не исправлялось): ключ раунда сравнивается с
 *    последним СОХРАНЁННЫМ раундом. Перегенерация, давшая прозу дословно
 *    равной ему, раунда не откроет — в том числе когда промежуточная редакция
 *    не была разобрана (разбор не звали либо он отклонён ROUND_IN_PROGRESS).
 *    Возврат к редакции, после которой был состоявшийся разбор другой
 *    редакции (A → B → A), новый раунд открывает. На живой модели дословное
 *    совпадение прозы недостижимо; для ручной правки туда-обратно прежний
 *    раунд — верный ответ (07 §12, Огр-12).
 *
 * linkedom по-прежнему только в utils/html-parser (инвариант 1.3).
 */
import { createHash } from "node:crypto";

import { and, asc, desc, eq, inArray, max } from "drizzle-orm";

import {
  RECOMMENDATIONS_PROSE_SUBSECTION,
  RECOMMENDATIONS_SECTION_KEY,
  RECOMMENDATIONS_TABLE_SUBSECTION,
  RECOMMENDATION_COLUMNS,
  RECOMMENDATION_NUM_RE,
  RECOMMENDATION_OPS,
  RECOMMENDATION_SEVERITIES,
  normalizeRecommendationText as norm,
  type RecommendationElementKind,
  type RecommendationField,
  type RecommendationStatus,
} from "@philosynth/shared/constants/recommendations";

import {
  RECOMMENDATIONS_EXTRACT_TEMPLATE_KEY,
  RECOMMENDATIONS_TABLE_TEMPLATE_KEY,
} from "../config/recommendation-templates.js";
import { db } from "../db/index.js";
import {
  categories,
  generationLog,
  glossaryTerms,
  recommendations,
  sections,
  syntheses,
  theses,
} from "../db/schema.js";
import {
  SubsectionHtmlError,
  innerTextTrimmed,
  insertSubsectionAfter,
  listSubsectionNames,
  parseFragment,
  readSubsectionSource,
  resolveSubsection,
  type HtmlElement,
} from "../utils/html-parser.js";
import {
  CHARS_PER_TOKEN,
  PRICE_IN,
  PRICE_OUT,
  subsectionOutputChars,
} from "./cost-estimator.js";
import { createVersion, snapshotOf } from "./element-versioning.js";
import {
  issue,
  issueTextFor,
  issuesFromColumn,
  renderIssuesRu,
} from "./recommendation-issues.js";
import {
  buildPromptSkeleton,
  bumpTotals,
  extractSubsectionContent,
  loadSynthesis,
  streamWithRetries,
  withGenerationSlot,
  type GenerationSlotHandle,
} from "./generation-service.js";
import { buildSYS } from "./prompt-builder.js";
import { renderTemplate } from "./prompt-registry.js";
import { loadExpectedSubsectionOrder } from "./subsection-order.js"; // 11.2, Д-16
import {
  addressableSectionKeys,
  formatDocumentSubsections,
} from "./section-defs-builder.js";
import { StreamError, classifyStreamError } from "./streaming-manager.js";
import { clearStreamState } from "../ws/stream-state.js";

import type {
  Recommendation,
  RecommendationIssue,
  RecommendationsExtractEstimateResponse,
  RecommendationsExtractResponse,
  RecommendationsParseResponse,
  RecommendationsResponse,
} from "@philosynth/shared/types/recommendations";
import { tl } from "@philosynth/shared/i18n/t";

/* ══ Ошибки ═══════════════════════════════════════════════════════════ */

export type RecommendationsErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RECOMMENDATIONS_TABLE_INVALID"
  /** 10.2: в раунде есть рекомендации 'planned' — новый раунд не открывается */
  | "ROUND_IN_PROGRESS"
  /** 10.2: ни одна из названных рекомендаций в план не вошла */
  | "RECOMMENDATIONS_NOT_PLANNABLE";

/**
 * NOT_FOUND — нет критики / нет прозы / нет таблицы (details.reason говорит,
 * чего именно, и что делать); RECOMMENDATIONS_TABLE_INVALID — подраздел есть,
 * но разобрать его как таблицу контракта нельзя (details.problem, и для
 * столбцов — details.missing/found): таблицу правит и человек, пустой список
 * вместо причины оставил бы его без подсказки.
 */
export class RecommendationsError extends Error {
  constructor(
    public readonly code: RecommendationsErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RecommendationsError";
  }
}

/* ══ Разбор таблицы (чистая функция) ══════════════════════════════════ */

/** Строка таблицы как записана: только снятие пробельного шума. */
export interface RawRecommendationRow {
  /** Место строки в таблице, с 1 (пустые строки не считаются) */
  position: number;
  num: string;
  address: string;
  element: string;
  op: string;
  replacement: string;
  rationale: string;
  severity: string;
}

const cellText = (el: HtmlElement): string =>
  (el.textContent ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

/** Точный поиск подраздела перебором: имена содержат кавычки и скобки. */
function findExact(root: HtmlElement, name: string): HtmlElement | null {
  for (const el of root.querySelectorAll("[data-section]"))
    if (el.getAttribute("data-section") === name) return el;
  return null;
}

/**
 * Разбор подраздела «Таблица рекомендаций». Столбцы ищутся ПО ЗАГОЛОВКАМ:
 * модель (и человек) могут переставить их, и падать из-за этого нельзя.
 * Отсутствующий или переименованный столбец — отказ с названием заголовка,
 * которого не нашлось, а не молчаливый пустой список.
 */
export function parseRecommendationsTable(sectionHtml: string): RawRecommendationRow[] {
  const root = parseFragment(sectionHtml);
  const host = findExact(root, RECOMMENDATIONS_TABLE_SUBSECTION);
  if (!host)
    throw new RecommendationsError(
      "NOT_FOUND",
      tl("server.recommendations.noTableSubsection", "В разделе «Критический анализ» нет подраздела «{tableSubsection}». ", { tableSubsection: RECOMMENDATIONS_TABLE_SUBSECTION }) +
        tl("server.recommendations.legacyConcept", "Концепция создана до контракта рекомендаций — составьте таблицу по готовой прозе: ") +
        "POST /syntheses/:id/recommendations/extract",
      { reason: "no_table", available: listSubsectionNames(sectionHtml) },
    );
  const table = host.querySelector("table.doc-table") ?? host.querySelector("table");
  if (!table)
    throw new RecommendationsError(
      "RECOMMENDATIONS_TABLE_INVALID",
      tl("server.recommendations.noTable", "В подразделе «{tableSubsection}» нет таблицы (<table class=\"doc-table\">)", { tableSubsection: RECOMMENDATIONS_TABLE_SUBSECTION }),
      { problem: "no_table_element" },
    );

  const trs = Array.from(table.querySelectorAll("tr"));
  let headerCells = Array.from(table.querySelectorAll("thead th"));
  let headerTr: HtmlElement | null = headerCells.length
    ? (headerCells[0] as HtmlElement).closest("tr")
    : null;
  if (headerCells.length === 0 && trs[0]) {
    // Без <thead> (ручная правка): заголовком считается первая строка
    headerTr = trs[0] as HtmlElement;
    headerCells = Array.from(headerTr.querySelectorAll("th, td"));
  }
  const found = headerCells.map(cellText);
  const index = new Map<RecommendationField, number>();
  found.forEach((h, i) => {
    const n = norm(h);
    for (const col of RECOMMENDATION_COLUMNS) {
      if (index.has(col.field)) continue;
      if ((col.aliases as readonly string[]).includes(n)) {
        index.set(col.field, i);
        break;
      }
    }
  });
  const missing = RECOMMENDATION_COLUMNS.filter((c) => !index.has(c.field)).map(
    (c) => c.header,
  );
  if (missing.length > 0)
    throw new RecommendationsError(
      "RECOMMENDATIONS_TABLE_INVALID",
      tl("server.recommendations.columnMissing", "В таблице рекомендаций не найден столбец: {missing}. ", { missing: missing.map((m) => `«${m}»`).join(", ") }) +
        tl("server.recommendations.headersFound", "Найдены заголовки: {foundCount}. ", { foundCount: found.length ? found.map((f) => `«${f}»`).join(", ") : "—" }) +
        tl("server.recommendations.orderIrrelevant", "Порядок столбцов не важен, названия — важны."),
      { problem: "missing_columns", missing, found },
    );

  const rows: RawRecommendationRow[] = [];
  for (const tr of trs) {
    if (tr === headerTr) continue;
    if (tr.closest("thead")) continue;
    const tds = Array.from(tr.querySelectorAll("td, th")).map(cellText);
    if (tds.every((t) => t === "")) continue;
    const at = (f: RecommendationField): string => tds[index.get(f) as number] ?? "";
    rows.push({
      position: rows.length + 1,
      num: at("num"),
      address: at("address"),
      element: at("element"),
      op: at("op"),
      replacement: at("replacement"),
      rationale: at("rationale"),
      severity: at("severity"),
    });
  }
  if (rows.length === 0)
    throw new RecommendationsError(
      "RECOMMENDATIONS_TABLE_INVALID",
      tl("server.recommendations.tableEmpty", "В таблице рекомендаций нет ни одной строки"),
      { problem: "no_rows" },
    );
  return rows;
}

/* ══ Индекс документа для сторожа ═════════════════════════════════════ */

export interface DocumentIndex {
  /** Раздел → имена его подразделов в порядке появления (все разделы
   *  документа). 11.2 (Д-16): КАНОНИЧЕСКИЕ имена карты subsection_map там,
   *  где подраздел опознан (по имени, нечётко или по месту); подразделы вне
   *  карты — фактическим атрибутом. Адреса рекомендаций и закрытый список
   *  {{document_subsections}} остаются каноническими при любом языке. */
  subsectionsBySection: Record<string, string[]>;
  /** Фактический атрибут data-section по каноническому имени (когда они
   *  различаются — переведённый моделью атрибут); читать документ — по нему. */
  actualNameOf(sectionKey: string, canonicalName: string): string;
  /** Предупреждения опознания подразделов по месту (для владельца). */
  lookupWarnings: string[];
  categories: { id: string; name: string; value: string }[];
  /** labels — как тезис назван в «Сводной таблице тезисов» («Э-2») и числом */
  theses: { id: string; labels: string[]; formulation: string; value: string }[];
  terms: { id: string; term: string; value: string }[];
  /** Исходник подраздела (readSubsectionSource) — для хэша; null — нет.
   *  Имя — каноническое либо фактическое: разрешается через actualNameOf. */
  subsectionSource(sectionKey: string, name: string): string | null;
}

/** Канонический подраздел «Сводная таблица тезисов» карты theses. */
const THESES_SUMMARY_TABLE = "Сводная таблица тезисов";

/** Номера тезисов, как они записаны в документе: первая ячейка строки
 *  сводной таблицы → формулировка. Документ нумерует «О-1», «Э-2» (parseInt
 *  даёт NaN → порядковый thesis_num). С 12.1 (Д-1) метка хранится в колонке
 *  theses.label, и сторож сводит её по колонке; эта функция — ЗАПАСНОЙ
 *  источник для строк без метки (концепции до миграции 0011).
 *  11.2 (Д-16): подраздел ищется resolveSubsection по каноническому имени со
 *  страховкой по месту (expectedOrder — карта theses); прежний нечёткий поиск
 *  «сводная таблица» остаётся запасным ходом. */
export function thesisLabelsFromHtml(
  thesesHtml: string,
  expectedOrder?: readonly string[] | undefined,
  warnings?: string[] | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  if (!thesesHtml) return out;
  const root = parseFragment(thesesHtml);
  const found = resolveSubsection(root, THESES_SUMMARY_TABLE, expectedOrder);
  let host: HtmlElement | null = found.el;
  if (found.el && found.warning && warnings) warnings.push(`метки тезисов: ${found.warning}`);
  if (!host) {
    for (const el of root.querySelectorAll("[data-section]")) {
      if ((el.getAttribute("data-section") ?? "").toLowerCase().includes("сводная таблица")) {
        host = el;
        break;
      }
    }
  }
  const table = host?.querySelector("table.doc-table") ?? host?.querySelector("table");
  if (!table) return out;
  for (const tr of table.querySelectorAll("tbody tr")) {
    const td = Array.from(tr.querySelectorAll("td")).map(cellText);
    if (td.length >= 2 && td[0] && td[1]) out.set(norm(td[1]), td[0]);
  }
  return out;
}

const canonicalJson = (v: unknown): string =>
  JSON.stringify(v, (_k, val: unknown) => {
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      const rec = val as Record<string, unknown>;
      return Object.fromEntries(Object.keys(rec).sort().map((k) => [k, rec[k]]));
    }
    return val;
  });

/**
 * Подразделы раздела в КАНОНИЧЕСКИХ именах (11.2, Д-16): каждое имя карты
 * ищется resolveSubsection (точно → нечётко → по месту при совпадающем числе);
 * найденное получает канон в списке и запись «канон → фактический атрибут»;
 * атрибуты, не опознанные ни одним каноном, идут в список как есть, в
 * порядке документа. Чистая функция — сверяется смоуком без БД.
 */
export function indexSectionSubsections(
  sectionKey: string,
  sectionHtml: string,
  expectedOrder: readonly string[],
  actualByCanon: Map<string, string>,
  warnings: string[],
): string[] {
  const actual = listSubsectionNames(sectionHtml);
  if (!expectedOrder.length) return actual;
  const root = parseFragment(sectionHtml);
  const canonByActual = new Map<string, string>();
  for (const canon of expectedOrder) {
    const found = resolveSubsection(root, canon, expectedOrder);
    if (!found.el || found.actualName === null || canonByActual.has(found.actualName)) continue;
    canonByActual.set(found.actualName, canon);
    if (found.actualName !== canon) actualByCanon.set(`${sectionKey}\u0000${canon}`, found.actualName);
    if (found.warning) warnings.push(`${sectionKey}: ${found.warning}`);
  }
  return actual.map((a) => canonByActual.get(a) ?? a);
}

/** Индекс живого документа из БД. */
export async function loadDocumentIndex(synthesisId: string): Promise<DocumentIndex> {
  const secRows = await db
    .select({ key: sections.key, html: sections.htmlContent })
    .from(sections)
    .where(eq(sections.synthesisId, synthesisId));
  const htmlByKey = new Map(secRows.map((r) => [r.key, r.html]));
  const expected = await loadExpectedSubsectionOrder(synthesisId);
  const lookupWarnings: string[] = [];
  const subsectionsBySection: Record<string, string[]> = {};
  const actualByCanon = new Map<string, string>(); // `${key}\u0000${canon}` → атрибут
  for (const r of secRows) {
    const canonList = indexSectionSubsections(r.key, r.html, expected[r.key] ?? [], actualByCanon, lookupWarnings);
    subsectionsBySection[r.key] = canonList;
  }
  const actualNameOf = (sectionKey: string, name: string): string =>
    actualByCanon.get(`${sectionKey}\u0000${name}`) ?? name;

  const cats = await db
    .select()
    .from(categories)
    .where(eq(categories.synthesisId, synthesisId))
    .orderBy(asc(categories.position));
  const ths = await db
    .select()
    .from(theses)
    .where(eq(theses.synthesisId, synthesisId))
    .orderBy(asc(theses.thesisNum));
  const terms = await db
    .select()
    .from(glossaryTerms)
    .where(eq(glossaryTerms.synthesisId, synthesisId))
    .orderBy(asc(glossaryTerms.position));
  const labels = thesisLabelsFromHtml(htmlByKey.get("theses") ?? "", expected["theses"], lookupWarnings);

  const sourceCache = new Map<string, string | null>();
  return {
    subsectionsBySection,
    actualNameOf,
    lookupWarnings,
    categories: cats.map((c) => ({
      id: c.id,
      name: c.name,
      value: canonicalJson([c.name, c.type, c.definition, c.origin]),
    })),
    theses: ths.map((t) => {
      // 12.1 (Д-1): метка — из КОЛОНКИ theses.label (её пишут парсер 1.4 и
      // импорт, рисует рендерер 5.1); сводная таблица HTML остаётся запасным
      // источником для концепций, заведённых до миграции 0011, чью таблицу
      // ещё не перерисовывали (после перерисовки метку дозаливает рендерер)
      const fromTable = labels.get(norm(t.formulation));
      return {
        id: t.id,
        labels: [...new Set([...(t.label ? [t.label] : []), ...(fromTable ? [fromTable] : []), String(t.thesisNum)])],
        formulation: t.formulation,
        value: canonicalJson([t.formulation, t.justification]),
      };
    }),
    terms: terms.map((g) => ({
      id: g.id,
      term: g.term,
      value: canonicalJson([g.term, g.definition, g.extraColumns]),
    })),
    subsectionSource(sectionKey, name) {
      const k = `${sectionKey}\u0000${name}`;
      if (!sourceCache.has(k)) {
        const html = htmlByKey.get(sectionKey);
        // 11.2: читать по фактическому атрибуту (канон → атрибут, иначе как есть)
        sourceCache.set(k, html ? (readSubsectionSource(html, actualNameOf(sectionKey, name))?.html ?? null) : null);
      }
      return sourceCache.get(k) ?? null;
    },
  };
}

/* ══ Сторож (чистая функция) ══════════════════════════════════════════ */

export interface GuardedRow {
  position: number;
  num: string;
  addressSubsection: string;
  addressSection: string | null;
  element: string | null;
  elementKind: RecommendationElementKind | null;
  elementId: string | null;
  op: string;
  replacement: string | null;
  rationale: string;
  severity: string;
  status: "new" | "invalid";
  /** Русский вид находок уровня 'invalid' (колонка invalid_reason) */
  invalidReason: string | null;
  /** 12.3 (Д-21): замечание сторожа, НЕ делающее строку негодной —
   *  русский вид находок уровня 'warning' (колонка warning) */
  warning: string | null;
  /** 12.3 (Д-46): находки кодами, оба уровня (колонка issues) */
  issues: RecommendationIssue[];
  sourceHash: string | null;
}

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/** Адрес как записан → имя подраздела: снять «§», кавычки и «Раздел →». */
export function cleanAddress(raw: string): string {
  let s = raw.replace(/§/g, " ").replace(/[«»"“”„‟]/g, " ");
  const arrow = Math.max(s.lastIndexOf("→"), s.lastIndexOf("->"));
  if (arrow >= 0) s = s.slice(arrow + (s[arrow] === "→" ? 1 : 2));
  return s.replace(/\s+/g, " ").trim();
}

/**
 * 12.3 (Д-46): три колонки строки из одного списка находок — коды и русский
 * вид каждого уровня. Писать их порознь нельзя: текст и коды разойдутся.
 */
export function withIssueTexts(issues: RecommendationIssue[]): {
  issues: RecommendationIssue[];
  invalidReason: string | null;
  warning: string | null;
} {
  return {
    issues,
    invalidReason: renderIssuesRu(issues, "invalid"),
    warning: renderIssuesRu(issues, "warning"),
  };
}

/**
 * Хэш источника строки ПРОТИВ ТЕКУЩЕГО документа (решение 3 шапки): у строки
 * с элементом — значение элемента, у строки без элемента — исходник
 * подраздела-адресата. Экспорт — для беседы 10.2: перед постановкой плана она
 * сверяет этот хэш с сохранённым `source_hash`; разошёлся → 'stale' («текст
 * изменился»), null при сохранённом не-null → 'invalid' («адресата больше нет»).
 */
export function sourceHashFor(
  doc: DocumentIndex,
  row: {
    addressSection: string | null;
    addressSubsection: string;
    elementKind: RecommendationElementKind | null;
    elementId: string | null;
  },
): string | null {
  if (row.elementId && row.elementKind) {
    const pool =
      row.elementKind === "category" ? doc.categories
      : row.elementKind === "thesis" ? doc.theses
      : doc.terms;
    const el = pool.find((x) => x.id === row.elementId);
    return el ? sha256(`element\u0000${el.value}`) : null;
  }
  if (!row.addressSection) return null;
  const src = doc.subsectionSource(row.addressSection, row.addressSubsection);
  return src === null ? null : sha256(`subsection\u0000${src}`);
}

/**
 * 12.3 (Д-21): сверка столбца «Основание» с подразделами критики — чистая
 * функция. Контракт требует ТОЧНОЕ название подраздела критического анализа,
 * где проблема установлена. Возвращает находку уровня 'warning' (кодом —
 * Д-46) либо null.
 *
 * Это ЗАМЕЧАНИЕ, а не отказ: основание — довод человеку («почему»), адрес и
 * операция от него не зависят, исполнению строки оно не мешает. Поэтому
 * строка остаётся 'new', а текст уходит в `warning`, не в `invalid_reason`.
 *
 * Сверка — нормализованная (кавычки, «§», регистр, «Раздел →» снимаются тем
 * же cleanAddress, что у адреса). Модель нередко называет два подраздела
 * («Слепые пятна; Итоговая оценка») — ячейка делится по «;», затем по «,»,
 * затем по союзу «и»; каждый кусок сначала сверяется целиком, и деление,
 * ничего не узнавшее, отбрасывается (разделитель был частью названия). Сами
 * «Рекомендации по улучшению» и «Таблица рекомендаций» основанием не
 * считаются: проблема устанавливается ДО них.
 */
export function rationaleIssue(
  rationaleRaw: string,
  critiqueSubsections: readonly string[],
): RecommendationIssue | null {
  const allowed = critiqueSubsections.filter(
    (n) => n !== RECOMMENDATIONS_PROSE_SUBSECTION && n !== RECOMMENDATIONS_TABLE_SUBSECTION,
  );
  // вырожденный документ: в критике нет подразделов — сверять не с чем
  if (allowed.length === 0) return null;
  const known = new Set(allowed.map((n) => norm(n)));
  const own = new Set(
    [RECOMMENDATIONS_PROSE_SUBSECTION, RECOMMENDATIONS_TABLE_SUBSECTION].map((n) => norm(n)),
  );

  const whole = cleanAddress(rationaleRaw);
  if (!whole) return issue("warning", "rationale_empty", { subsections: allowed });
  if (known.has(norm(whole))) return null;

  // Несколько подразделов в одной ячейке: «;», затем «,», затем союз «и» —
  // по очереди, и каждый кусок сначала сверяется ЦЕЛИКОМ (запятая и «и»
  // бывают в самом названии). Если деление по «,» / «и» ничего не узнало,
  // разделитель был частью названия — чужим называется кусок целиком.
  const SEPS = [/\s*;\s*/, /\s*,\s*/, /\s+и\s+/];
  const unknownOf = (part: string, level: number): string[] => {
    if (known.has(norm(part))) return [];
    const sep = SEPS[level];
    if (!sep) return [part];
    const bits = part.split(sep).map((x) => x.trim()).filter(Boolean);
    if (bits.length < 2) return unknownOf(part, level + 1);
    const res = bits.map((b) => unknownOf(b, level + 1));
    if (level > 0 && res.every((r, i) => r.length === 1 && r[0] === bits[i])) return [part];
    return res.flat();
  };
  const unknown = unknownOf(whole, 0);
  if (unknown.length === 0) return null;
  const selfRef = unknown.filter((x) => own.has(norm(x)));
  if (selfRef.length === unknown.length)
    return issue("warning", "rationale_self", { names: selfRef, subsections: allowed });
  return issue("warning", "rationale_unknown", { names: unknown, subsections: allowed });
}

/** Русская фраза замечания об «Основании» либо null (вид колонки warning). */
export function rationaleWarning(
  rationaleRaw: string,
  critiqueSubsections: readonly string[],
): string | null {
  const it = rationaleIssue(rationaleRaw, critiqueSubsections);
  return it ? renderIssuesRu([it], "warning") : null;
}

/**
 * Сторож адресов. Негодная строка НЕ роняет разбор: status 'invalid' и
 * invalid_reason — что именно не сошлось (все причины разом, через «; »).
 * Документ живой, модель ошибается, и разбор обязан это переживать.
 * 12.3 (Д-21): столбец «Основание» сверяется с подразделами критики, но
 * расхождение — замечание строки (`warning`), статуса оно не меняет.
 * 12.3 (Д-46): сторож отдаёт находки КОДАМИ (`issues`); `invalidReason` и
 * `warning` — их русский вид для колонок БД.
 */
export function guardRows(raws: readonly RawRecommendationRow[], doc: DocumentIndex): GuardedRow[] {
  const critiqueSubsections = doc.subsectionsBySection[RECOMMENDATIONS_SECTION_KEY] ?? [];
  // нормализованное имя подраздела → [{ раздел, имя как в документе }]
  const bySub = new Map<string, { sectionKey: string; name: string }[]>();
  for (const [sectionKey, names] of Object.entries(doc.subsectionsBySection))
    for (const name of names) {
      const k = norm(name);
      const list = bySub.get(k) ?? [];
      if (!list.some((x) => x.sectionKey === sectionKey)) list.push({ sectionKey, name });
      bySub.set(k, list);
    }
  const seen = new Set<string>();

  return raws.map((raw): GuardedRow => {
    // 12.3 (Д-46): причины — кодами; фраза собирается при чтении
    const found: RecommendationIssue[] = [];
    const bad = (code: RecommendationIssue["code"], params: RecommendationIssue["params"] = {}): void => {
      found.push(issue("invalid", code, params));
    };
    const num = raw.num.replace(/\s+/g, "").replace(/[.)]$/, "");
    if (!RECOMMENDATION_NUM_RE.test(num)) bad("num_invalid", { num: raw.num });

    // ── Адрес
    const address = cleanAddress(raw.address);
    let addressSection: string | null = null;
    let addressName = address;
    if (!address) bad("address_empty");
    else {
      const hits = (bySub.get(norm(address)) ?? []).filter(
        (h) => h.sectionKey !== "capsule",
      );
      const outside = hits.filter((h) => h.sectionKey !== RECOMMENDATIONS_SECTION_KEY);
      if (hits.length === 0) {
        const words = norm(address).split(" ").filter((w) => w.length >= 5);
        const near = [...bySub.values()]
          .flat()
          .filter((h) => h.sectionKey !== RECOMMENDATIONS_SECTION_KEY && h.sectionKey !== "capsule")
          .filter((h) => words.some((w) => norm(h.name).includes(w.slice(0, -1))))
          .map((h) => h.name);
        bad("address_not_found", { address, near: [...new Set(near)].slice(0, 5) });
      } else if (outside.length === 0) bad("address_in_critique", { address });
      else if (outside.length > 1)
        // разделы — КЛЮЧАМИ: метка переводится при показе
        bad("address_ambiguous", { address, sections: outside.map((h) => h.sectionKey) });
      else {
        addressSection = (outside[0] as { sectionKey: string }).sectionKey;
        addressName = (outside[0] as { name: string }).name;
      }
    }

    // ── Элемент: точное название, затем нормализованное
    const elementRaw = raw.element.trim();
    let elementKind: RecommendationElementKind | null = null;
    let elementId: string | null = null;
    if (elementRaw) {
      type Hit = { kind: RecommendationElementKind; id: string; value: string };
      const collect = (eq: (a: string) => boolean): Hit[] => [
        ...doc.categories.filter((c) => eq(c.name)).map((c): Hit => ({ kind: "category", id: c.id, value: c.value })),
        ...doc.terms.filter((g) => eq(g.term)).map((g): Hit => ({ kind: "glossary_term", id: g.id, value: g.value })),
        ...doc.theses
          .filter((t) => t.labels.some(eq) || eq(t.formulation))
          .map((t): Hit => ({ kind: "thesis", id: t.id, value: t.value })),
      ];
      // Три ступени сверки: точное название → нормализованное (пробелы,
      // кавычки-ёлочки, регистр) → без хвостовой скобки. Третья найдена на
      // живой концепции: термины глоссария записаны с пояснением —
      // «Архетипический разлом (гипотетически незамкнутый неологизм)», — а
      // рекомендация называет термин без него. Ступени СКЛАДЫВАЮТСЯ, а не
      // сменяют друг друга: категория, совпавшая точно, не должна заслонить
      // одноимённый термин, совпавший лишь без скобки, — выбор между ними
      // делает раздел адреса, а не ступень.
      const n = norm(elementRaw).replace(/^тезис\s+/, "");
      const base = (x: string): string => norm(x).replace(/\s*\([^()]*\)\s*$/, "");
      const nb = base(n);
      const hits: Hit[] = [];
      for (const tier of [
        collect((a) => a === elementRaw),
        collect((a) => norm(a) === n),
        nb ? collect((a) => base(a) === nb) : [],
      ])
        for (const h of tier) if (!hits.some((x) => x.id === h.id)) hits.push(h);
      if (hits.length === 0) bad("element_not_found", { element: elementRaw });
      else {
        // Имя категории нередко совпадает с термином глоссария: решает раздел
        // адреса, иначе порядок категория → термин → тезис
        const want: RecommendationElementKind | null =
          addressSection === "graph" ? "category"
          : addressSection === "glossary" ? "glossary_term"
          : addressSection === "theses" ? "thesis"
          : null;
        const hit = hits.find((h) => h.kind === want) ?? (hits[0] as Hit);
        elementKind = hit.kind;
        elementId = hit.id;
      }
    }

    // ── Закрытые списки
    const opN = norm(raw.op);
    const op = RECOMMENDATION_OPS.find((o) => norm(o) === opN);
    if (!op) bad("op_not_allowed", { op: raw.op, allowed: [...RECOMMENDATION_OPS] });
    const sevN = norm(raw.severity);
    const severity = RECOMMENDATION_SEVERITIES.find((s) => norm(s) === sevN);
    if (!severity)
      bad("severity_not_allowed", { severity: raw.severity, allowed: [...RECOMMENDATION_SEVERITIES] });

    // ── Полный повтор строки
    const dupKey = `${norm(num)}|${norm(addressName)}|${norm(elementRaw)}`;
    if (seen.has(dupKey)) bad("row_duplicate");
    seen.add(dupKey);

    // ── «Основание» (12.3, Д-21): замечание, статуса не меняет
    const note = rationaleIssue(raw.rationale, critiqueSubsections);

    // ── Хэш источника (решение 3 шапки): элемент → его значение, иначе подраздел
    const sourceHash = elementRaw && !elementId
      ? null // элемент назван, но не найден: сверять не с чем
      : sourceHashFor(doc, { addressSection, addressSubsection: addressName, elementKind, elementId });

    return {
      position: raw.position,
      num,
      addressSubsection: addressName,
      addressSection,
      element: elementRaw || null,
      elementKind,
      elementId,
      op: op ?? raw.op,
      replacement: raw.replacement || null,
      rationale: raw.rationale,
      severity: severity ?? raw.severity,
      status: found.length ? "invalid" : "new",
      ...withIssueTexts([...found, ...(note ? [note] : [])]),
      sourceHash,
    };
  });
}

/* ══ Раунд и запись ═══════════════════════════════════════════════════ */

type RecRow = typeof recommendations.$inferSelect;

export function toRecommendationDto(r: RecRow): Recommendation {
  const issues = issuesFromColumn(r.issues);
  return {
    id: r.id,
    synthesisId: r.synthesisId,
    round: r.round,
    num: r.num,
    addressSubsection: r.addressSubsection,
    addressSection: r.addressSection,
    element: r.element,
    elementKind: r.elementKind,
    elementId: r.elementId,
    op: r.op,
    replacement: r.replacement,
    rationale: r.rationale,
    severity: r.severity,
    status: r.status,
    // 12.3 (Д-46): фраза — на языке запроса, из кодов; у строки без кодов
    // (разобрана до 12.3) — сохранённый русский текст
    invalidReason: issueTextFor(issues, "invalid", r.invalidReason),
    warning: issueTextFor(issues, "warning", r.warning),
    issues,
    planId: r.planId,
    stepIndex: r.stepIndex,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Ключ раунда: проза рекомендаций; нет прозы — сама таблица (решение 1). */
export function roundHashOf(critiqueHtml: string): string {
  const prose = readSubsectionSource(critiqueHtml, RECOMMENDATIONS_PROSE_SUBSECTION);
  if (prose) return sha256(`prose\u0000${prose.html}`);
  const table = readSubsectionSource(critiqueHtml, RECOMMENDATIONS_TABLE_SUBSECTION);
  return sha256(`table\u0000${table?.html ?? ""}`);
}

async function loadCritiqueHtml(synthesisId: string): Promise<{ id: string; html: string }> {
  const [row] = await db
    .select({ id: sections.id, html: sections.htmlContent })
    .from(sections)
    .where(and(eq(sections.synthesisId, synthesisId), eq(sections.key, RECOMMENDATIONS_SECTION_KEY)))
    .limit(1);
  if (!row || !row.html.trim())
    throw new RecommendationsError(
      "NOT_FOUND",
      tl("server.recommendations.critiqueNotGenerated", "Раздел «Критический анализ» ещё не сгенерирован — рекомендаций у концепции нет. ") +
        tl("server.recommendations.addCritique", "Добавьте раздел в документ (Изменить → добавить раздел), затем разберите рекомендации."),
      { reason: "no_critique" },
    );
  return row;
}

async function latestRoundOf(synthesisId: string): Promise<number> {
  const [agg] = await db
    .select({ r: max(recommendations.round) })
    .from(recommendations)
    .where(eq(recommendations.synthesisId, synthesisId));
  return agg?.r ?? 0;
}

const KEEP: readonly RecommendationStatus[] = ["planned", "done", "rejected"];
const carryKey = (r: { num: string; addressSubsection: string; element: string | null }): string =>
  `${norm(r.num)}|${norm(r.addressSubsection)}|${norm(r.element ?? "")}`;

/**
 * Разобрать подраздел и обновить строки. Идемпотентно в пределах раунда.
 * Бросает RecommendationsError (нет критики / нет таблицы / таблица негодна).
 */
export async function parseAndStore(synthesisId: string): Promise<RecommendationsParseResponse> {
  const critique = await loadCritiqueHtml(synthesisId);
  const raws = parseRecommendationsTable(critique.html);
  const guarded = guardRows(raws, await loadDocumentIndex(synthesisId));
  const roundHash = roundHashOf(critique.html);

  return db.transaction(async (tx) => {
    // Сериализация разборов одной концепции: без неё два одновременных parse
    // оба увидели бы прежний максимум и столкнулись на уникальном индексе
    await tx.select({ id: syntheses.id }).from(syntheses).where(eq(syntheses.id, synthesisId)).for("update");
    const [agg] = await tx
      .select({ r: max(recommendations.round) })
      .from(recommendations)
      .where(eq(recommendations.synthesisId, synthesisId));
    const latest = agg?.r ?? 0;
    const prev = latest
      ? await tx
          .select()
          .from(recommendations)
          .where(and(eq(recommendations.synthesisId, synthesisId), eq(recommendations.round, latest)))
      : [];
    const sameRound = prev.length > 0 && prev.every((p) => p.roundHash === roundHash);
    const round = sameRound ? latest : latest + 1;

    // 10.2 — РАУНД В РАБОТЕ. Текст критики сменился (новый раунд), а в прежнем
    // есть рекомендации, стоящие в плане: открыть round+1 значило бы оставить
    // их висеть в плане против документа, о котором критика уже говорит иное.
    // Сначала план — исполнить либо удалить; осиротевшие 'planned' (плана уже
    // нет: FK обнулил plan_id) раунд не держат и снимаются здесь же.
    if (!sameRound) {
      const held = prev.filter((p) => p.status === "planned" && p.planId !== null);
      if (held.length > 0)
        throw new RecommendationsError(
          "ROUND_IN_PROGRESS",
          tl("server.recommendations.roundInProgress", "Раунд {round} ещё в работе: {heldCount} рекомендаци{heldWordEnding} в плане правок. ", { round: latest, heldCount: held.length, heldWordEnding: held.length === 1 ? tl("server.recommendations.isSingular", "я стоит") : tl("server.recommendations.arePlural", "й стоят") }) +
            tl("server.recommendations.executeOrDelete", "Исполните этот план либо удалите его — после этого новый разбор откроет следующий раунд."),
          {
            round: latest,
            planIds: [...new Set(held.map((p) => p.planId as string))],
            nums: [...new Set(held.map((p) => p.num))],
          },
        );
      const orphans = prev.filter((p) => p.status === "planned" && p.planId === null);
      if (orphans.length > 0)
        await tx
          .update(recommendations)
          .set({ status: "new", stepIndex: null })
          .where(inArray(recommendations.id, orphans.map((p) => p.id)));
    }

    // Перенос строк, уже ушедших в работу (решение 2 шапки)
    // id строки при перечитке сохраняется у ВСЕХ узнанных строк (панель 10.3
    // держит их между запросами); статус и план — только у ушедших в работу
    const carry = new Map<string, RecRow>();
    if (sameRound) {
      for (const p of prev) if (!carry.has(carryKey(p))) carry.set(carryKey(p), p);
      await tx
        .delete(recommendations)
        .where(and(eq(recommendations.synthesisId, synthesisId), eq(recommendations.round, round)));
    }
    const values = guarded.map((g) => {
      const known = carry.get(carryKey(g));
      if (known) carry.delete(carryKey(g));
      const old = known && KEEP.includes(known.status) ? known : undefined;
      return {
        ...(known ? { id: known.id, createdAt: known.createdAt } : {}),
        synthesisId,
        round,
        roundHash,
        position: g.position,
        num: g.num,
        addressSubsection: g.addressSubsection,
        addressSection: g.addressSection,
        element: g.element,
        elementKind: g.elementKind,
        elementId: g.elementId,
        op: g.op,
        replacement: g.replacement,
        rationale: g.rationale,
        severity: g.severity,
        // строка в работе остаётся в работе, даже если сторож теперь против:
        // её судьбу решает исполнение (10.2), а не перечитка
        status: old ? old.status : g.status,
        // 12.3 (Д-21): замечание — всегда свежее: оно о текущем документе и
        // статуса не касается (в отличие от причины отказа у строки в работе);
        // 12.3 (Д-46): коды и оба текста — из одного списка находок
        ...(old ? carriedIssues(old, g) : withIssueTexts(g.issues)),
        sourceHash: old ? old.sourceHash : g.sourceHash,
        planId: old?.planId ?? null,
        stepIndex: old?.stepIndex ?? null,
      };
    });
    // Строка в работе, исчезнувшая из таблицы, не теряется: дописывается в хвост
    let pos = values.length;
    for (const old of carry.values()) {
      if (!KEEP.includes(old.status)) continue;
      pos += 1;
      values.push({ ...old, issues: issuesFromColumn(old.issues), position: pos, roundHash });
    }
    const inserted = await tx.insert(recommendations).values(values).returning();
    inserted.sort((a, b) => a.position - b.position);
    return {
      round,
      latestRound: round,
      newRound: !sameRound,
      invalidCount: inserted.filter((r) => r.status === "invalid").length,
      rows: inserted.map(toRecommendationDto),
    };
  });
}

/**
 * Находки строки В РАБОТЕ при перечитке: уровень 'invalid' — прежний (её
 * судьбу решает исполнение, а не перечитка), уровень 'warning' — свежий. У
 * строки без кодов (разобрана до 12.3) прежний текст причины сохраняется.
 */
function carriedIssues(old: RecRow, fresh: GuardedRow): ReturnType<typeof withIssueTexts> {
  const kept = issuesFromColumn(old.issues).filter((x) => x.level === "invalid");
  const next = withIssueTexts([...kept, ...fresh.issues.filter((x) => x.level === "warning")]);
  return { ...next, invalidReason: next.invalidReason ?? old.invalidReason };
}

/** Строки раунда (по умолчанию — последнего). Нет критики → NOT_FOUND. */
export async function listRecommendations(
  synthesisId: string,
  round?: number,
): Promise<RecommendationsResponse> {
  await loadCritiqueHtml(synthesisId);
  const latestRound = await latestRoundOf(synthesisId);
  const want = round ?? latestRound;
  if (round !== undefined && (round < 1 || round > latestRound))
    throw new RecommendationsError("NOT_FOUND", tl("server.recommendations.roundMissing", "Раунда {round} у концепции нет (последний — {latestRound})", { round, latestRound }), {
      reason: "no_round",
      latestRound,
    });
  const rows = want
    ? await db
        .select()
        .from(recommendations)
        .where(and(eq(recommendations.synthesisId, synthesisId), eq(recommendations.round, want)))
        .orderBy(asc(recommendations.position))
    : [];
  return { round: want, latestRound, rows: rows.map(toRecommendationDto) };
}

/** Раунды концепции, новые первыми (для панели 10.3). */
export async function listRounds(synthesisId: string): Promise<number[]> {
  const rows = await db
    .selectDistinct({ round: recommendations.round })
    .from(recommendations)
    .where(eq(recommendations.synthesisId, synthesisId))
    .orderBy(desc(recommendations.round));
  return rows.map((r) => r.round);
}

/* ══ Ретрофит: составить таблицу по готовой прозе ═════════════════════ */

export const RECOMMENDATIONS_EXTRACT_STREAM_KEY = "recommendations:extract";

/** Переменные шаблона recommendations.extract — чистое ядро (дрейф-контроль). */
export function buildExtractVars(input: {
  prose: string;
  critiqueSubsections: readonly string[];
  doc: Pick<DocumentIndex, "categories" | "theses" | "terms">;
  tableContract: string;
}): Record<string, string> {
  const list = (items: readonly string[]): string =>
    items.length ? items.map((i) => `— ${i}`).join("\n") : "— (нет)";
  return {
    recommendations_prose: input.prose,
    critique_subsections: list(
      input.critiqueSubsections.filter(
        (n) => n !== RECOMMENDATIONS_PROSE_SUBSECTION && n !== RECOMMENDATIONS_TABLE_SUBSECTION,
      ),
    ),
    categories: list(input.doc.categories.map((c) => c.name)),
    theses: list(input.doc.theses.map((t) => `${t.labels[0] ?? ""} — ${t.formulation}`)),
    terms: list(input.doc.terms.map((g) => g.term)),
    table_contract: input.tableContract,
  };
}

/**
 * Содержимое подраздела из ответа модели: снять markdown-ограду, взять
 * <div data-section> (точное имя, иначе первый) без его <h4>; нет обёртки —
 * сама таблица. null — таблицы в ответе нет.
 */
export function innerHtmlFromModelAnswer(answer: string): string | null {
  const cleaned = answer.replace(/^\s*```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const root = parseFragment(cleaned);
  const host =
    findExact(root, RECOMMENDATIONS_TABLE_SUBSECTION) ?? root.querySelector("[data-section]");
  const table = (host ?? root).querySelector("table");
  if (!table) return null;
  // Контракт: в подразделе только таблица; прочее из ответа не берётся
  return table.outerHTML;
}

/** Квота ретрофита — одна на оценку (12.3), предпроверку роута и слот. */
export const EXTRACT_QUOTA = "regenerations" as const;

/** Запрос ретрофита, собранный БЕЗ обращения к модели. */
export interface ExtractRequest {
  critique: { id: string; html: string };
  prompt: string;
  SYS: string;
  depth: string;
  /** Подразделы критики в документе (канонические имена) */
  critiqueSubsections: string[];
}

/**
 * Всё, что ретрофит отправит модели: SYS и промпт собираются из документа и
 * шаблонов Registry целиком до вызова — поэтому и оценка стоимости (12.3,
 * Д-20) считает вход ТОЧНО, а не моделью промпта перегенерации подраздела.
 * Бросает NOT_FOUND: нет критики (no_critique) / нет прозы (no_prose).
 */
export async function buildExtractRequest(synthesisId: string): Promise<ExtractRequest> {
  const critique = await loadCritiqueHtml(synthesisId);
  const container = parseFragment(critique.html);
  const prose = extractSubsectionContent(container, RECOMMENDATIONS_PROSE_SUBSECTION);
  if (!prose)
    throw new RecommendationsError(
      "NOT_FOUND",
      tl("server.recommendations.noProseSubsection", "В критике нет подраздела «{proseSubsection}» — составлять таблицу не по чему. ", { proseSubsection: RECOMMENDATIONS_PROSE_SUBSECTION }) +
        tl("server.recommendations.regenerateCritique", "Перегенерируйте раздел «Критический анализ»."),
      { reason: "no_prose", available: listSubsectionNames(critique.html) },
    );

  const doc = await loadDocumentIndex(synthesisId);
  const { row, philosophers } = await loadSynthesis(synthesisId);
  const keys = addressableSectionKeys([
    ...row.sectionOrder,
    ...Object.keys(doc.subsectionsBySection),
  ]);
  const tableContract = await renderTemplate(RECOMMENDATIONS_TABLE_TEMPLATE_KEY, {
    document_subsections: formatDocumentSubsections(doc.subsectionsBySection, keys),
  });
  const critiqueSubsections = doc.subsectionsBySection[RECOMMENDATIONS_SECTION_KEY] ?? [];
  const prompt = await renderTemplate(
    RECOMMENDATIONS_EXTRACT_TEMPLATE_KEY,
    buildExtractVars({
      prose,
      critiqueSubsections,
      doc,
      tableContract,
    }),
  );
  const SYS = await buildSYS({ phil: philosophers, lang: row.lang }, { outputMode: "subsection" });
  return { critique, prompt, SYS, depth: row.depth, critiqueSubsections: [...critiqueSubsections] };
}

/**
 * Оценка ретрофита из готовых размеров — чистое ядро (смоук без БД).
 * Вход: SYS + промпт, знаки → токены делителем оценщика 1.1. Выход: один
 * подраздел критики — 1/N полного выхода раздела (subsectionOutputChars,
 * формула estimateSubsectionCost 1.1); N — подразделы критики вместе с
 * таблицей, которую предстоит составить.
 */
export function estimateExtractFromSizes(input: {
  sysChars: number;
  promptChars: number;
  depth: string;
  /** Подразделы критики, уже стоящие в документе */
  critiqueSubsections: readonly string[];
}): { inTokens: number; outTokens: number; cost: number } {
  const subCount =
    input.critiqueSubsections.length +
    (input.critiqueSubsections.includes(RECOMMENDATIONS_TABLE_SUBSECTION) ? 0 : 1);
  const inTokens = Math.ceil((input.sysChars + input.promptChars) / CHARS_PER_TOKEN);
  const outTokens = Math.ceil(
    subsectionOutputChars(RECOMMENDATIONS_SECTION_KEY, { depth: input.depth }, subCount) /
      CHARS_PER_TOKEN,
  );
  return { inTokens, outTokens, cost: inTokens * PRICE_IN + outTokens * PRICE_OUT };
}

/**
 * 12.3 (Д-20): оценка ретрофита ДО вызова — модель не зовётся, слот не
 * берётся, квота не расходуется, в БД ничего не пишется. Панель 10.3 называла
 * цену словами («одно обращение к модели»), сумму показывала только после.
 * Отказы — те же, что у самого ретрофита: нет критики / нет прозы (404).
 */
export async function estimateExtractCost(
  synthesisId: string,
): Promise<RecommendationsExtractEstimateResponse> {
  const req = await buildExtractRequest(synthesisId);
  return {
    estimate: estimateExtractFromSizes({
      sysChars: req.SYS.length,
      promptChars: req.prompt.length,
      depth: req.depth,
      critiqueSubsections: req.critiqueSubsections,
    }),
    // во что обойдётся подписчику: одна единица той же квоты, что у ретрофита
    quota: { type: EXTRACT_QUOTA, units: 1 },
  };
}

/** Ключ строки генлога: подраздел, а не раздел (см. шапку, 12.3). */
export const RECOMMENDATIONS_TABLE_LOG_KEY = `${RECOMMENDATIONS_SECTION_KEY}:${RECOMMENDATIONS_TABLE_SUBSECTION}`;

interface ComposeTableOptions {
  /** Подпись строки генлога (хранимая диагностика владельца — по-русски) */
  logLabel: string;
  /** Снимок раздела ДО записи таблицы (версия 'section'/'regenerated') */
  versioned: boolean;
  /** Пометить раздел изменённым (is_edited) */
  markEdited: boolean;
}

interface ComposeTableResult {
  written: NonNullable<ReturnType<typeof insertSubsectionAfter>>;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number;
}

/**
 * Ядро составления таблицы по готовой прозе — ПОД УЖЕ ЗАНЯТЫМ слотом: одно
 * обращение к модели, строка генлога, итог документа, проверка ответа ДО
 * записи, вставка подраздела под замком строки. Его зовут ретрофит (свой
 * слот, POST …/extract) и свой повтор после генерации критики (слот
 * генерации; 12.3, Д-21). Бросает StreamError (обрыв обращения) и
 * RecommendationsError (негодный ответ) — документ при этом не меняется.
 */
async function composeTableUnderSlot(
  handle: GenerationSlotHandle,
  synthesisId: string,
  req: ExtractRequest,
  opts: ComposeTableOptions,
): Promise<ComposeTableResult> {
  const { critique, prompt, SYS } = req;
  const [genEntry] = await db
    .insert(generationLog)
    .values({
      synthesisId,
      // 12.3: ключ ПОДРАЗДЕЛА. С ключом раздела эта короткая строка
      // становилась «фактическим размером критики» в оценках стоимости
      sectionKey: RECOMMENDATIONS_TABLE_LOG_KEY,
      sectionLabel: opts.logLabel,
      logType: "generation",
      source: "subsection_regen",
      status: "streaming",
      priorChars: 0,
      taskChars: prompt.length,
      inputChars: SYS.length + prompt.length,
      metadata: {
        subsectionName: RECOMMENDATIONS_TABLE_SUBSECTION,
        expectedSubsections: [RECOMMENDATIONS_TABLE_SUBSECTION],
        subsections: [],
        promptSkeleton: buildPromptSkeleton(prompt),
        sys: SYS,
      },
    })
    .returning({ id: generationLog.id });
  const genEntryId = (genEntry as { id: string }).id;
  let answer: string;
  let usage: { inputTokens: number; outputTokens: number };
  try {
    const streamed = await streamWithRetries(
      handle,
      RECOMMENDATIONS_EXTRACT_STREAM_KEY,
      prompt,
      SYS,
      handle.billing.apiKey,
      () => undefined, // дельты никому не шлются (решение 5 шапки)
    );
    answer = streamed.html;
    usage = streamed.usage;
  } catch (rawErr) {
    const e = rawErr instanceof StreamError ? rawErr : classifyStreamError(rawErr, false);
    const eUsage = e.usage ?? { inputTokens: 0, outputTokens: 0 };
    await db
      .update(generationLog)
      .set({
        status: "error",
        errorMessage: e.message,
        inputTokens: eUsage.inputTokens,
        outputTokens: eUsage.outputTokens,
        costUsd: (eUsage.inputTokens * PRICE_IN + eUsage.outputTokens * PRICE_OUT).toFixed(6),
      })
      .where(eq(generationLog.id, genEntryId));
    await bumpTotals(synthesisId, eUsage);
    await clearStreamState(synthesisId, RECOMMENDATIONS_EXTRACT_STREAM_KEY);
    throw e;
  }
  const costUsd = usage.inputTokens * PRICE_IN + usage.outputTokens * PRICE_OUT;
  await db
    .update(generationLog)
    .set({
      status: "done",
      outputChars: answer.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd: costUsd.toFixed(6),
    })
    .where(eq(generationLog.id, genEntryId));
  await bumpTotals(synthesisId, usage);
  await clearStreamState(synthesisId, RECOMMENDATIONS_EXTRACT_STREAM_KEY);

  const inner = innerHtmlFromModelAnswer(answer);
  if (!inner)
    throw new RecommendationsError(
      "RECOMMENDATIONS_TABLE_INVALID",
      tl("server.recommendations.noTableReturned", "Модель не вернула таблицу — документ не изменён. Повторите запрос."),
      { problem: "model_no_table" },
    );

  // Перечитать раздел под замком: между чтением и записью шёл вызов модели
  const written = await db.transaction(async (tx) => {
    const [sec] = await tx
      .select()
      .from(sections)
      .where(eq(sections.id, critique.id))
      .limit(1)
      .for("update");
    if (!sec) throw new RecommendationsError("NOT_FOUND", tl("common.sectionNotFound", "Раздел не найден"), { reason: "no_critique" });
    let ins;
    try {
      ins = insertSubsectionAfter(
        sec.htmlContent,
        RECOMMENDATIONS_PROSE_SUBSECTION,
        RECOMMENDATIONS_TABLE_SUBSECTION,
        inner,
      );
    } catch (err) {
      if (err instanceof SubsectionHtmlError)
        throw new RecommendationsError(
          "RECOMMENDATIONS_TABLE_INVALID",
          tl("server.recommendations.responseUnfit", "Ответ модели не годится в документ: {message}", { message: err.message }),
          { problem: "model_html", detail: err.problem },
        );
      throw err;
    }
    if (!ins)
      throw new RecommendationsError(
        "NOT_FOUND",
        tl("server.recommendations.noProseSubsectionShort", "В критике нет подраздела «{proseSubsection}»", { proseSubsection: RECOMMENDATIONS_PROSE_SUBSECTION }),
        { reason: "no_prose" },
      );
    // Негодную таблицу в документ не пишем: проверка ДО записи
    parseRecommendationsTable(ins.html);
    if (opts.versioned)
      await createVersion(synthesisId, sec.id, "section", snapshotOf(sec), "regenerated", tx);
    await tx
      .update(sections)
      .set({
        htmlContent: ins.html,
        ...(opts.markEdited ? { isEdited: true } : {}),
        updatedAt: new Date(),
      })
      .where(eq(sections.id, sec.id));
    return ins;
  });
  return { written, usage, costUsd };
}

/**
 * Ретрофит: ОДНО обращение к модели → подраздел «Таблица рекомендаций»
 * вписан ПОСЛЕ прозы (insertSubsectionAfter; уже есть — заменено содержимое)
 * → разбор. Квота — regenerations. Версия раздела 'section'/'regenerated'
 * со снимком ДО, is_edited = true; стоимость входит в итог документа.
 * Негодный ответ модели (нет таблицы, нет столбца) в документ НЕ пишется.
 */
export async function extractRecommendationsTable(
  synthesisId: string,
  userId: string,
): Promise<RecommendationsExtractResponse> {
  const req = await buildExtractRequest(synthesisId);

  let result: RecommendationsExtractResponse | null = null;
  await withGenerationSlot(
    synthesisId,
    userId,
    async (handle) => {
      const run = await composeTableUnderSlot(handle, synthesisId, req, {
        logLabel: `Критический анализ → ${RECOMMENDATIONS_TABLE_SUBSECTION} [по готовой прозе]`,
        versioned: true,
        markEdited: true,
      });
      const parsed = await parseAndStore(synthesisId);
      result = {
        ...parsed,
        outcome: run.written.outcome,
        warnings: run.written.warnings,
        usage: { ...run.usage, costUsd: run.costUsd },
      };
    },
    { quota: EXTRACT_QUOTA },
  );
  // withGenerationSlot возвращает void; result заполнен либо брошено исключение
  return result as unknown as RecommendationsExtractResponse;
}

/* ══ Свой повтор пропущенной таблицы (12.3, Д-21) ═════════════════════ */

/** Чего не хватает критике, чтобы рекомендации можно было разобрать. */
export type RecommendationsTableGap =
  /** таблица на месте (в том числе пустая: это ответ модели, а не пропуск) */
  | "none"
  /** нет прозы рекомендаций — составлять не из чего */
  | "no_prose"
  /** подраздела «Таблица рекомендаций» нет */
  | "missing"
  /** подраздел есть, но в нём нет таблицы либо столбцов контракта */
  | "broken";

/** Состояние таблицы рекомендаций в HTML критики — чистая функция. */
export function recommendationsTableGap(critiqueHtml: string): RecommendationsTableGap {
  const root = parseFragment(critiqueHtml);
  if (!findExact(root, RECOMMENDATIONS_PROSE_SUBSECTION)) return "no_prose";
  try {
    parseRecommendationsTable(critiqueHtml);
    return "none";
  } catch (err) {
    if (!(err instanceof RecommendationsError)) throw err;
    if (err.details?.["reason"] === "no_table") return "missing";
    const problem = err.details?.["problem"];
    return problem === "no_table_element" || problem === "missing_columns" ? "broken" : "none";
  }
}

/** Итог токенов документа (то, что ведёт bumpTotals). */
async function documentTotals(synthesisId: string): Promise<{ inputTokens: number; outputTokens: number }> {
  const [row] = await db
    .select({ inputTokens: syntheses.totalInputTokens, outputTokens: syntheses.totalOutputTokens })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  return { inputTokens: row?.inputTokens ?? 0, outputTokens: row?.outputTokens ?? 0 };
}

export interface TableRetryResult {
  /** present — таблица была; not_applicable — нет критики или прозы;
   *  composed — составлена повтором; failed — повтор не удался */
  outcome: "present" | "not_applicable" | "composed" | "failed";
  /** HTML критики с таблицей (только у composed) */
  html: string | null;
  /** Расход повторного обращения (в итог документа он уже внесён); null —
   *  обращения не было */
  usage: { inputTokens: number; outputTokens: number } | null;
  /** Что записать в предупреждения генлога раздела (владельцу) */
  note: string | null;
}

/**
 * СВОЙ ПОВТОР (12.3, Д-21): после УДАЧНОЙ генерации критики убедиться, что
 * таблица рекомендаций в ней есть, и если модель её пропустила (либо
 * написала подраздел без таблицы или без столбцов контракта) — составить
 * одним повторным обращением по готовой прозе, тем же запросом, что
 * ретрофит. Работает под слотом генерации: своей квоты не берёт, расход
 * идёт в итог документа.
 *
 * Зовётся генерацией, перегенерацией и добавлением раздела ПОСЛЕ записи
 * критики в БД (запрос собирается из сохранённого документа). Никогда не
 * бросает: критика уже написана и годна, неудача повтора — не повод ронять
 * генерацию; о случившемся говорит `note` (её пишут в предупреждения генлога
 * раздела, рядом с предупреждениями разбора 11.1). Повтор один: негодный
 * ответ во второй раз не переспрашивается — остаётся ручной ретрофит.
 * Раунд рекомендаций здесь не разбирается — как и прежде, это делает панель.
 */
export async function ensureRecommendationsTable(
  handle: GenerationSlotHandle,
  synthesisId: string,
): Promise<TableRetryResult> {
  let gap: RecommendationsTableGap;
  try {
    gap = recommendationsTableGap((await loadCritiqueHtml(synthesisId)).html);
  } catch {
    return { outcome: "not_applicable", html: null, usage: null, note: null };
  }
  if (gap === "none") return { outcome: "present", html: null, usage: null, note: null };
  if (gap === "no_prose") return { outcome: "not_applicable", html: null, usage: null, note: null };
  const what =
    gap === "missing"
      ? `модель не написала подраздел «${RECOMMENDATIONS_TABLE_SUBSECTION}»`
      : `подраздел «${RECOMMENDATIONS_TABLE_SUBSECTION}» написан без таблицы либо без столбцов контракта`;
  // Расход повтора — разницей итога документа: ядро вносит его в итог и при
  // удаче, и при обрыве, и при негодном ответе (обращение состоялось, токены
  // потрачены) — а вызывающему он нужен во всех трёх случаях
  const before = await documentTotals(synthesisId);
  const spent = async (): Promise<TableRetryResult["usage"]> => {
    const after = await documentTotals(synthesisId);
    const usage = { inputTokens: after.inputTokens - before.inputTokens, outputTokens: after.outputTokens - before.outputTokens };
    return usage.inputTokens > 0 || usage.outputTokens > 0 ? usage : null;
  };
  try {
    const req = await buildExtractRequest(synthesisId);
    const run = await composeTableUnderSlot(handle, synthesisId, req, {
      logLabel: `Критический анализ → ${RECOMMENDATIONS_TABLE_SUBSECTION} [повтор: ${gap === "missing" ? "пропущена моделью" : "негодна"}]`,
      versioned: false,
      markEdited: false,
    });
    return {
      outcome: "composed",
      html: run.written.html,
      usage: await spent(),
      note: `таблица рекомендаций: ${what} — составлена повторным обращением по готовой прозе`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[recommendations] повтор таблицы (${synthesisId}) не удался: ${message}`);
    return {
      outcome: "failed",
      html: null,
      usage: await spent().catch(() => null),
      note:
        `таблица рекомендаций: ${what}; повторное обращение не помогло (${message}) — ` +
        "составьте её по готовой прозе из панели рекомендаций",
    };
  }
}

/** Для шапки подраздела в ответах и тестах. */
export const recommendationsSubsectionNames = {
  prose: RECOMMENDATIONS_PROSE_SUBSECTION,
  table: RECOMMENDATIONS_TABLE_SUBSECTION,
} as const;

/** innerText подраздела-таблицы — удобство смоуков. */
export function recommendationsTableText(critiqueHtml: string): string | null {
  const root = parseFragment(critiqueHtml);
  const host = findExact(root, RECOMMENDATIONS_TABLE_SUBSECTION);
  return host ? innerTextTrimmed(host) : null;
}
