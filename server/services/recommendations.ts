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
 * linkedom по-прежнему только в utils/html-parser (инвариант 1.3).
 */
import { createHash } from "node:crypto";

import { and, asc, desc, eq, max } from "drizzle-orm";

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
import { KEY_LABELS, isSectionKey } from "@philosynth/shared/constants/section-labels";

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
  type HtmlElement,
} from "../utils/html-parser.js";
import { PRICE_IN, PRICE_OUT } from "./cost-estimator.js";
import { createVersion, snapshotOf } from "./element-versioning.js";
import {
  buildPromptSkeleton,
  bumpTotals,
  extractSubsectionContent,
  loadSynthesis,
  streamWithRetries,
  withGenerationSlot,
} from "./generation-service.js";
import { buildSYS } from "./prompt-builder.js";
import { renderTemplate } from "./prompt-registry.js";
import {
  addressableSectionKeys,
  formatDocumentSubsections,
} from "./section-defs-builder.js";
import { StreamError, classifyStreamError } from "./streaming-manager.js";
import { clearStreamState } from "../ws/stream-state.js";

import type {
  Recommendation,
  RecommendationsExtractResponse,
  RecommendationsParseResponse,
  RecommendationsResponse,
} from "@philosynth/shared/types/recommendations";

/* ══ Ошибки ═══════════════════════════════════════════════════════════ */

export type RecommendationsErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RECOMMENDATIONS_TABLE_INVALID";

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
      `В разделе «Критический анализ» нет подраздела «${RECOMMENDATIONS_TABLE_SUBSECTION}». ` +
        "Концепция создана до контракта рекомендаций — составьте таблицу по готовой прозе: " +
        "POST /syntheses/:id/recommendations/extract",
      { reason: "no_table", available: listSubsectionNames(sectionHtml) },
    );
  const table = host.querySelector("table.doc-table") ?? host.querySelector("table");
  if (!table)
    throw new RecommendationsError(
      "RECOMMENDATIONS_TABLE_INVALID",
      `В подразделе «${RECOMMENDATIONS_TABLE_SUBSECTION}» нет таблицы (<table class="doc-table">)`,
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
      `В таблице рекомендаций не найден столбец: ${missing.map((m) => `«${m}»`).join(", ")}. ` +
        `Найдены заголовки: ${found.length ? found.map((f) => `«${f}»`).join(", ") : "—"}. ` +
        "Порядок столбцов не важен, названия — важны.",
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
      "В таблице рекомендаций нет ни одной строки",
      { problem: "no_rows" },
    );
  return rows;
}

/* ══ Индекс документа для сторожа ═════════════════════════════════════ */

export interface DocumentIndex {
  /** Раздел → его data-section в порядке появления (все разделы документа) */
  subsectionsBySection: Record<string, string[]>;
  categories: { id: string; name: string; value: string }[];
  /** labels — как тезис назван в «Сводной таблице тезисов» («Э-2») и числом */
  theses: { id: string; labels: string[]; formulation: string; value: string }[];
  terms: { id: string; term: string; value: string }[];
  /** Исходник подраздела (readSubsectionSource) — для хэша; null — нет */
  subsectionSource(sectionKey: string, name: string): string | null;
}

/** Номера тезисов, как они записаны в документе: первая ячейка строки
 *  сводной таблицы → формулировка. В БД живёт только целое thesis_num, а
 *  документ нумерует «О-1», «Э-2» (parseInt даёт NaN → порядковый номер). */
function thesisLabelsFromHtml(thesesHtml: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!thesesHtml) return out;
  const root = parseFragment(thesesHtml);
  let host: HtmlElement | null = null;
  for (const el of root.querySelectorAll("[data-section]")) {
    if ((el.getAttribute("data-section") ?? "").toLowerCase().includes("сводная таблица")) {
      host = el;
      break;
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

/** Индекс живого документа из БД. */
export async function loadDocumentIndex(synthesisId: string): Promise<DocumentIndex> {
  const secRows = await db
    .select({ key: sections.key, html: sections.htmlContent })
    .from(sections)
    .where(eq(sections.synthesisId, synthesisId));
  const htmlByKey = new Map(secRows.map((r) => [r.key, r.html]));
  const subsectionsBySection: Record<string, string[]> = {};
  for (const r of secRows) subsectionsBySection[r.key] = listSubsectionNames(r.html);

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
  const labels = thesisLabelsFromHtml(htmlByKey.get("theses") ?? "");

  const sourceCache = new Map<string, string | null>();
  return {
    subsectionsBySection,
    categories: cats.map((c) => ({
      id: c.id,
      name: c.name,
      value: canonicalJson([c.name, c.type, c.definition, c.origin]),
    })),
    theses: ths.map((t) => {
      const label = labels.get(norm(t.formulation));
      return {
        id: t.id,
        labels: [...(label ? [label] : []), String(t.thesisNum)],
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
        sourceCache.set(k, html ? (readSubsectionSource(html, name)?.html ?? null) : null);
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
  invalidReason: string | null;
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

const sectionLabel = (k: string): string => (isSectionKey(k) ? KEY_LABELS[k] : k);

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
 * Сторож адресов. Негодная строка НЕ роняет разбор: status 'invalid' и
 * invalid_reason — что именно не сошлось (все причины разом, через «; »).
 * Документ живой, модель ошибается, и разбор обязан это переживать.
 */
export function guardRows(raws: readonly RawRecommendationRow[], doc: DocumentIndex): GuardedRow[] {
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
    const reasons: string[] = [];
    const num = raw.num.replace(/\s+/g, "").replace(/[.)]$/, "");
    if (!RECOMMENDATION_NUM_RE.test(num))
      reasons.push(`№ «${raw.num}» не номер рекомендации (ожидается «5», «5а», «5б»)`);

    // ── Адрес
    const address = cleanAddress(raw.address);
    let addressSection: string | null = null;
    let addressName = address;
    if (!address) reasons.push("адрес пуст: рекомендация обязана называть подраздел документа");
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
          .map((h) => `«${h.name}»`);
        reasons.push(
          `подраздела «${address}» в документе нет` +
            (near.length ? ` (похожие: ${[...new Set(near)].slice(0, 5).join(", ")})` : ""),
        );
      } else if (outside.length === 0)
        reasons.push(`«${address}» — подраздел самой критики: адресом рекомендации он быть не может`);
      else if (outside.length > 1)
        reasons.push(
          `адрес «${address}» неоднозначен: такой подраздел есть в разделах ` +
            outside.map((h) => `«${sectionLabel(h.sectionKey)}»`).join(" и "),
        );
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
      if (hits.length === 0)
        reasons.push(`элемент «${elementRaw}» не найден среди категорий, тезисов и терминов концепции`);
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
    if (!op)
      reasons.push(
        `операция «${raw.op}» вне закрытого списка: ${RECOMMENDATION_OPS.join(" | ")}`,
      );
    const sevN = norm(raw.severity);
    const severity = RECOMMENDATION_SEVERITIES.find((s) => norm(s) === sevN);
    if (!severity)
      reasons.push(
        `важность «${raw.severity}» вне закрытого списка: ${RECOMMENDATION_SEVERITIES.join(" | ")}`,
      );

    // ── Полный повтор строки
    const dupKey = `${norm(num)}|${norm(addressName)}|${norm(elementRaw)}`;
    if (seen.has(dupKey)) reasons.push("строка повторяет предыдущую (тот же №, адрес и элемент)");
    seen.add(dupKey);

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
      status: reasons.length ? "invalid" : "new",
      invalidReason: reasons.length ? reasons.join("; ") : null,
      sourceHash,
    };
  });
}

/* ══ Раунд и запись ═══════════════════════════════════════════════════ */

type RecRow = typeof recommendations.$inferSelect;

export function toRecommendationDto(r: RecRow): Recommendation {
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
    invalidReason: r.invalidReason,
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
      "Раздел «Критический анализ» ещё не сгенерирован — рекомендаций у концепции нет. " +
        "Добавьте раздел в документ (Изменить → добавить раздел), затем разберите рекомендации.",
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
        invalidReason: old ? old.invalidReason : g.invalidReason,
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
      values.push({ ...old, position: pos, roundHash });
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

/** Строки раунда (по умолчанию — последнего). Нет критики → NOT_FOUND. */
export async function listRecommendations(
  synthesisId: string,
  round?: number,
): Promise<RecommendationsResponse> {
  await loadCritiqueHtml(synthesisId);
  const latestRound = await latestRoundOf(synthesisId);
  const want = round ?? latestRound;
  if (round !== undefined && (round < 1 || round > latestRound))
    throw new RecommendationsError("NOT_FOUND", `Раунда ${round} у концепции нет (последний — ${latestRound})`, {
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
  const critique = await loadCritiqueHtml(synthesisId);
  const container = parseFragment(critique.html);
  const prose = extractSubsectionContent(container, RECOMMENDATIONS_PROSE_SUBSECTION);
  if (!prose)
    throw new RecommendationsError(
      "NOT_FOUND",
      `В критике нет подраздела «${RECOMMENDATIONS_PROSE_SUBSECTION}» — составлять таблицу не по чему. ` +
        "Перегенерируйте раздел «Критический анализ».",
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
  const prompt = await renderTemplate(
    RECOMMENDATIONS_EXTRACT_TEMPLATE_KEY,
    buildExtractVars({
      prose,
      critiqueSubsections: doc.subsectionsBySection[RECOMMENDATIONS_SECTION_KEY] ?? [],
      doc,
      tableContract,
    }),
  );
  const SYS = await buildSYS({ phil: philosophers, lang: row.lang }, { outputMode: "subsection" });

  let result: RecommendationsExtractResponse | null = null;
  await withGenerationSlot(
    synthesisId,
    userId,
    async (handle) => {
      const [genEntry] = await db
        .insert(generationLog)
        .values({
          synthesisId,
          sectionKey: RECOMMENDATIONS_SECTION_KEY,
          sectionLabel: `Критический анализ → ${RECOMMENDATIONS_TABLE_SUBSECTION} [по готовой прозе]`,
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
          "Модель не вернула таблицу — документ не изменён. Повторите запрос.",
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
        if (!sec) throw new RecommendationsError("NOT_FOUND", "Раздел не найден", { reason: "no_critique" });
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
              `Ответ модели не годится в документ: ${err.message}`,
              { problem: "model_html", detail: err.problem },
            );
          throw err;
        }
        if (!ins)
          throw new RecommendationsError(
            "NOT_FOUND",
            `В критике нет подраздела «${RECOMMENDATIONS_PROSE_SUBSECTION}»`,
            { reason: "no_prose" },
          );
        // Негодную таблицу в документ не пишем: проверка ДО записи
        parseRecommendationsTable(ins.html);
        await createVersion(synthesisId, sec.id, "section", snapshotOf(sec), "regenerated", tx);
        await tx
          .update(sections)
          .set({ htmlContent: ins.html, isEdited: true, updatedAt: new Date() })
          .where(eq(sections.id, sec.id));
        return ins;
      });

      const parsed = await parseAndStore(synthesisId);
      result = {
        ...parsed,
        outcome: written.outcome,
        warnings: written.warnings,
        usage: { ...usage, costUsd },
      };
    },
    { quota: "regenerations" },
  );
  // withGenerationSlot возвращает void; result заполнен либо брошено исключение
  return result as unknown as RecommendationsExtractResponse;
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
