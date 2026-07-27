/**
 * Context Extractor — извлечение контекстных фрагментов (04-code-reuse-map
 * §2.1; 01-architecture §4.3; беседа 1.3).
 *
 * Порт из philosynth.html:
 *  - extractContextFragment [8150–8270] — диспетчер по ctx-ключу;
 *  - extractSection [7953], extractAllTablesAsText [8010],
 *    extractGlossaryCompact [8021], extractThesesSummary [8057],
 *    extractNameTitle [8068], extractGraphNodesTable [8092],
 *    extractGraphNodesCompact [8109], extractGraphEdgesTable [8137],
 *    extractCapsuleText [11720], extractIntraSectionContext [19866],
 *    extractRelevantIntraSectionContext [19894],
 *    extractSubsectionContent [19950].
 *
 * ═══ Ключевая адаптация: DOM → БД ═══
 *
 * В исходнике диспетчер получает `generated` — карту sectionKey → DOM-элемент
 * уже отрендеренного раздела, и все extract*() парсят этот DOM. В сервисе
 * ту же роль играет ContextSource: объект доступа к данным одного синтеза с
 * мемоизацией (одна выборка на таблицу за вызов buildContextForSection —
 * иначе каждый из ~40 фрагментов делал бы собственные запросы).
 *
 * Разделение источников (01-architecture §4.3, «часть из БД, часть из
 * sections.html_content»):
 *  - ГРАНУЛЯРНЫЕ ТАБЛИЦЫ (приоритет беседы 1.3): graph:nodes,
 *    graph:nodes_compact, graph:nodes_top, graph:edges — из categories /
 *    category_edges; glossary:table — из glossary_terms;
 *    theses:summary — из theses. Таблица собирается из полей БД в тот же
 *    текстовый формат, что даёт tableToText («h | h» / «--- | ---» / ячейки),
 *    со столбцами промптов исходника [10897, 10907];
 *  - HTML РАЗДЕЛА через linkedom (server/utils/html-parser.ts): всё
 *    остальное — sum:*, name:*, dialogue:*, origin:*, history:*,
 *    evolution:*, practical:*, critique:*, graph:topology. Здесь порты
 *    дословные: меняется только способ получить контейнер (parseFragment
 *    вместо generated[key]).
 *
 * Гейт наличия раздела сохранён: `if (!el) return null` исходника →
 * отсутствующая (ещё не сгенерированная) строка sections → null, включая
 * ключи, которые читаются из гранулярных таблиц. Капсула, как и в
 * исходнике, обрабатывается ДО гейта (живёт в syntheses.capsule_html,
 * не в разделах).
 */

import { and, asc, eq } from "drizzle-orm";

import { truncateText } from "../utils/text.js";
import { innerTextTrimmed, parseFragment } from "../utils/html-parser.js";
import type { HtmlElement } from "../utils/html-parser.js";
import { tableToText } from "../utils/text.js";
import { db } from "../db/index.js";
import {
  categories,
  categoryEdges,
  glossaryTerms,
  sections,
  syntheses,
  theses,
} from "../db/schema.js";
import { RegistryNotFoundError, getTemplate } from "./prompt-registry.js";

/* ── Строки БД в форме, нужной форматтерам ───────────────────────────── */

export interface CategoryRow {
  name: string;
  type: string;
  definition: string;
  centrality: number;
  certainty: number;
  origin: string;
  historicalSignificance: number;
  innovationDegree: number;
  clarity: number;
  breadth: number;
  depthScore: number;
  applicability: number;
}

export interface EdgeRow {
  sourceName: string;
  description: string;
  targetName: string;
  edgeType: string;
  direction: string;
  strength: number;
  certainty: number;
  innovationDegree: number;
  historicalSupport: number;
  logicalNecessity: number;
  contextDependency: number;
}

export interface GlossaryRow {
  term: string;
  definition: string;
  termCategory: string;
}

export interface ThesisRow {
  thesisNum: number;
  formulation: string;
  thesisType: string;
  noveltyDegree: string;
  relatedCategories: string[];
}

/** Параметры синтеза, влияющие на состав столбцов таблиц графа */
export interface ExtractParams {
  /** Определяет имя последнего столбца таблицы категорий [8990] */
  synthLevel: string;
  /** Расширенные характеристики графа (v10) — доп. столбцы [10897, 10907] */
  extGraphMetrics: boolean;
  /** Заголовок документа — фолбэк ветки name:title (docTitle исходника) */
  docTitle: string;
}

/**
 * Источник данных одного синтеза — служебный аналог `generated` исходника.
 * Все методы мемоизируются реализацией: за один buildContextForSection
 * каждая таблица читается не более одного раза.
 */
export interface ContextSource {
  readonly synthesisId: string;
  /** true, если раздел сгенерирован (аналог `generated[key]` ≠ undefined) */
  hasSection(sectionKey: string): Promise<boolean>;
  /** Распарсенный HTML раздела либо null (аналог `generated[key]`) */
  getSectionElement(sectionKey: string): Promise<HtmlElement | null>;
  getCapsuleHtml(): Promise<string>;
  getCategories(): Promise<CategoryRow[]>;
  getEdges(): Promise<EdgeRow[]>;
  getGlossary(): Promise<GlossaryRow[]>;
  getTheses(): Promise<ThesisRow[]>;
  getParams(): Promise<ExtractParams>;
}

/* ── Реализация поверх БД ────────────────────────────────────────────── */

/** Ленивое однократное вычисление (мемо на время жизни источника) */
function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= fn());
}

const DEFAULT_TITLE = "Синтез Философской Концепции";

/** Источник данных из БД для конкретного синтеза. */
export function createDbContextSource(synthesisId: string): ContextSource {
  const sectionCache = new Map<string, Promise<HtmlElement | null>>();

  const loadSynthesis = once(async () => {
    const row = await db.query.syntheses.findFirst({
      where: eq(syntheses.id, synthesisId),
      columns: {
        title: true,
        synthLevel: true,
        extGraphMetrics: true,
        capsuleHtml: true,
      },
    });
    return row ?? null;
  });

  const loadSection = (key: string): Promise<HtmlElement | null> => {
    let cached = sectionCache.get(key);
    if (!cached) {
      cached = (async () => {
        const row = await db.query.sections.findFirst({
          where: and(eq(sections.synthesisId, synthesisId), eq(sections.key, key)),
          columns: { htmlContent: true },
        });
        if (!row || !row.htmlContent.trim()) return null;
        return parseFragment(row.htmlContent);
      })();
      sectionCache.set(key, cached);
    }
    return cached;
  };

  const loadCategories = once(async (): Promise<CategoryRow[]> => {
    const rows = await db
      .select({
        name: categories.name,
        type: categories.type,
        definition: categories.definition,
        centrality: categories.centrality,
        certainty: categories.certainty,
        origin: categories.origin,
        historicalSignificance: categories.historicalSignificance,
        innovationDegree: categories.innovationDegree,
        clarity: categories.clarity,
        breadth: categories.breadth,
        depthScore: categories.depthScore,
        applicability: categories.applicability,
      })
      .from(categories)
      .where(eq(categories.synthesisId, synthesisId))
      .orderBy(asc(categories.position), asc(categories.name));
    return rows;
  });

  const loadEdges = once(async (): Promise<EdgeRow[]> => {
    const src = db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.synthesisId, synthesisId))
      .as("src");
    const tgt = db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.synthesisId, synthesisId))
      .as("tgt");

    return db
      .select({
        sourceName: src.name,
        description: categoryEdges.description,
        targetName: tgt.name,
        edgeType: categoryEdges.edgeType,
        direction: categoryEdges.direction,
        strength: categoryEdges.strength,
        certainty: categoryEdges.certainty,
        innovationDegree: categoryEdges.innovationDegree,
        historicalSupport: categoryEdges.historicalSupport,
        logicalNecessity: categoryEdges.logicalNecessity,
        contextDependency: categoryEdges.contextDependency,
      })
      .from(categoryEdges)
      .innerJoin(src, eq(categoryEdges.sourceId, src.id))
      .innerJoin(tgt, eq(categoryEdges.targetId, tgt.id))
      .where(eq(categoryEdges.synthesisId, synthesisId))
      .orderBy(asc(categoryEdges.position));
  });

  const loadGlossary = once(async (): Promise<GlossaryRow[]> => {
    return db
      .select({
        term: glossaryTerms.term,
        definition: glossaryTerms.definition,
        termCategory: glossaryTerms.termCategory,
      })
      .from(glossaryTerms)
      .where(eq(glossaryTerms.synthesisId, synthesisId))
      .orderBy(asc(glossaryTerms.position), asc(glossaryTerms.term));
  });

  const loadTheses = once(async (): Promise<ThesisRow[]> => {
    return db
      .select({
        thesisNum: theses.thesisNum,
        formulation: theses.formulation,
        thesisType: theses.thesisType,
        noveltyDegree: theses.noveltyDegree,
        relatedCategories: theses.relatedCategories,
      })
      .from(theses)
      .where(eq(theses.synthesisId, synthesisId))
      .orderBy(asc(theses.thesisNum));
  });

  return {
    synthesisId,
    async hasSection(key) {
      return (await loadSection(key)) !== null;
    },
    getSectionElement: loadSection,
    async getCapsuleHtml() {
      return (await loadSynthesis())?.capsuleHtml ?? "";
    },
    getCategories: loadCategories,
    getEdges: loadEdges,
    getGlossary: loadGlossary,
    getTheses: loadTheses,
    async getParams() {
      const row = await loadSynthesis();
      return {
        synthLevel: row?.synthLevel ?? "comparative",
        extGraphMetrics: row?.extGraphMetrics ?? false,
        docTitle: row?.title ?? DEFAULT_TITLE,
      };
    },
  };
}

/* ── Форматирование строк БД в текстовую таблицу ─────────────────────── */

/** Ячейка: та же нормализация, что в tableToText (переносы → пробел) */
function cell(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\n+/g, " ").replace(/\s{2,}/g, " ");
}

/** Число 0–1 в вид, в котором его пишет Claude: «0.85», «0.5», «1» */
function num(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return String(Number(value.toFixed(2)));
}

/** Строки → текст в формате tableToText: заголовки, «--- | ---», ячейки */
function rowsToText(headers: string[], rows: string[][]): string {
  const out = [headers.join(" | "), headers.map(() => "---").join(" | ")];
  for (const r of rows) out.push(r.join(" | "));
  return out.join("\n");
}

/**
 * Имя последнего столбца таблицы категорий [8990] — из Prompt Registry
 * (level.{level}.graph_last_col_name). Фолбэк — только на отсутствие
 * шаблона; сбои БД/Redis пробрасываются, чтобы не деградировать молча.
 */
async function graphLastColName(synthLevel: string): Promise<string> {
  try {
    return await getTemplate(`level.${synthLevel}.graph_last_col_name`);
  } catch (err) {
    if (err instanceof RegistryNotFoundError) return "Происхождение"; // дефолт comparative
    throw err;
  }
}

/** Доп. столбцы категорий при extGraphMetrics [10897] */
const EXT_NODE_HEADERS = [
  "Ист. значимость",
  "Степень инновации",
  "Ясность",
  "Широта",
  "Глубина",
  "Применимость",
];

/** Доп. столбцы связей при extGraphMetrics [10907] */
const EXT_EDGE_HEADERS = [
  "Определённость связи",
  "Степень инновации",
  "Ист. поддержка",
  "Логическая необходимость",
  "Контекстозависимость",
];

/** Русские сокращения типов тезисов (шапка «Тип (онтол./эпистем./этич.)») */
const THESIS_TYPE_RU: Record<string, string> = {
  ontological: "онтол.",
  epistemological: "эпистем.",
  ethical: "этич.",
};

/* ── DB-backed extract*() (приоритет беседы 1.3) ─────────────────────── */

/**
 * Аналог extractGraphNodesTable(el) [8092] на данных БД.
 * Столбцы — по промпту графа [10897]: Категория | Тип | Определение |
 * Центральность | Определённость | {Происхождение|Генеалогия|Преодолённые
 * ограничения} (+ 6 расширенных при extGraphMetrics).
 */
export async function extractGraphNodesTable(
  src: ContextSource,
): Promise<string | null> {
  const rows = await src.getCategories();
  if (rows.length === 0) return null;
  const { synthLevel, extGraphMetrics } = await src.getParams();

  const headers = [
    "Категория",
    "Тип",
    "Определение",
    "Центральность",
    "Определённость",
    await graphLastColName(synthLevel),
  ];
  if (extGraphMetrics) headers.push(...EXT_NODE_HEADERS);

  const body = rows.map((c) => {
    const base = [
      cell(c.name),
      cell(c.type),
      cell(c.definition),
      num(c.centrality),
      num(c.certainty),
      cell(c.origin),
    ];
    if (extGraphMetrics) {
      base.push(
        num(c.historicalSignificance),
        String(c.innovationDegree),
        num(c.clarity),
        num(c.breadth),
        num(c.depthScore),
        num(c.applicability),
      );
    }
    return base;
  });

  return "ТАБЛИЦА КАТЕГОРИЙ:\n" + rowsToText(headers, body);
}

/** Аналог extractGraphNodesCompact(el) [8109]: первые три столбца. */
export async function extractGraphNodesCompact(
  src: ContextSource,
): Promise<string | null> {
  const rows = await src.getCategories();
  if (rows.length === 0) return null;
  const headers = ["Категория", "Тип", "Определение"];
  const body = rows.map((c) => [cell(c.name), cell(c.type), cell(c.definition)]);
  return "ТАБЛИЦА КАТЕГОРИЙ (компактная):\n" + rowsToText(headers, body);
}

/**
 * Аналог extractGraphEdgesTable(el) [8137] на данных БД.
 * Столбцы — по промпту связей [10907].
 */
export async function extractGraphEdges(src: ContextSource): Promise<string | null> {
  const rows = await src.getEdges();
  if (rows.length === 0) return null;
  const { extGraphMetrics } = await src.getParams();

  const headers = [
    "Источник",
    "Описание связи",
    "Цель",
    "Тип",
    "Направление",
    "Сила",
  ];
  if (extGraphMetrics) headers.push(...EXT_EDGE_HEADERS);

  const body = rows.map((e) => {
    const base = [
      cell(e.sourceName),
      cell(e.description),
      cell(e.targetName),
      cell(e.edgeType),
      cell(e.direction),
      num(e.strength),
    ];
    if (extGraphMetrics) {
      base.push(
        num(e.certainty),
        String(e.innovationDegree),
        num(e.historicalSupport),
        num(e.logicalNecessity),
        num(e.contextDependency),
      );
    }
    return base;
  });

  return "ТАБЛИЦА СВЯЗЕЙ:\n" + rowsToText(headers, body);
}

/**
 * Аналог extractGlossaryCompact(el) [8021] на данных БД: два столбца
 * (в исходнике — «таблица, у которой первый столбец содержит „термин“»,
 * с заголовками по умолчанию «Термин»/«Определение»).
 */
export async function extractGlossaryTable(
  src: ContextSource,
): Promise<string | null> {
  const rows = await src.getGlossary();
  if (rows.length === 0) return null;
  const body = rows.map((t) => [cell(t.term), cell(t.definition)]);
  return (
    "ГЛОССАРИЙ (термины и определения):\n" +
    rowsToText(["Термин", "Определение"], body)
  );
}

/**
 * Аналог extractThesesSummary(el) [8057] на данных БД.
 * Столбцы — по промпту «Сводная таблица тезисов» [11038].
 */
export async function extractThesesSummary(
  src: ContextSource,
): Promise<string | null> {
  const rows = await src.getTheses();
  if (rows.length === 0) return null;
  const headers = [
    "№",
    "Формулировка тезиса",
    "Тип",
    "Степень новизны",
    "Связанные категории",
  ];
  const body = rows.map((t) => [
    String(t.thesisNum),
    cell(t.formulation),
    THESIS_TYPE_RU[t.thesisType] ?? cell(t.thesisType),
    cell(t.noveltyDegree),
    cell((t.relatedCategories ?? []).join(", ")),
  ]);
  return "СВОДКА ТЕЗИСОВ:\n" + rowsToText(headers, body);
}

/* ── HTML-backed extract*() (дословные порты) ────────────────────────── */

/** Порт extractSection(containerEl, keyword) [7953] — логика 1:1. */
export function extractSection(
  containerEl: HtmlElement | null | undefined,
  keyword: string,
): string | null {
  if (!containerEl) return null;
  const kw = keyword.toLowerCase();

  // Приоритет 1: <div data-section="..."> с подходящим именем
  for (const div of containerEl.querySelectorAll("div[data-section]")) {
    if ((div.getAttribute("data-section") ?? "").toLowerCase().includes(kw)) {
      const parts: string[] = [];
      for (const child of div.children) {
        if (child.tagName === "TABLE") {
          parts.push(tableToText(child));
        } else {
          const t = innerTextTrimmed(child);
          if (t) parts.push(t);
        }
      }
      return parts.filter(Boolean).join("\n") || innerTextTrimmed(div) || null;
    }
  }

  // Фолбэк: старая логика через h4
  for (const h4 of containerEl.querySelectorAll("h4")) {
    if (!(h4.textContent ?? "").toLowerCase().includes(kw)) continue;
    const parts: string[] = [(h4.textContent ?? "").trim()];
    let next = h4.nextElementSibling;
    while (next && next.tagName !== "H4" && !next.hasAttribute("data-section")) {
      if (next.tagName === "TABLE") {
        parts.push(tableToText(next));
      } else {
        const t = innerTextTrimmed(next);
        if (t) parts.push(t);
      }
      next = next.nextElementSibling;
    }
    return parts.filter(Boolean).join("\n");
  }
  return null;
}

/** Порт extractAllTablesAsText(containerEl) [8010] — логика 1:1. */
export function extractAllTablesAsText(containerEl: HtmlElement): string {
  return Array.from(containerEl.querySelectorAll("table.doc-table"))
    .map((t) => tableToText(t))
    .join("\n\n");
}

/**
 * Порт extractCapsuleText(capsuleHTML) [11720] — логика 1:1
 * (document.createElement → parseFragment).
 */
export function extractCapsuleText(capsuleHtml: string | null | undefined): string {
  if (!capsuleHtml) return "";
  const tmp = parseFragment(capsuleHtml);
  const target =
    tmp.querySelector('[data-section="Капсула"]') ??
    tmp.querySelector(".doc-content") ??
    tmp;

  // Клонирования нет (linkedom-элемент одноразовый на вызов): вместо
  // удаления h4 из клона исключаем его текст при обходе.
  const h4 = target.querySelector("h4");
  const h4Text = h4 ? innerTextTrimmed(h4) : "";
  let text = innerTextTrimmed(target);
  if (h4Text && text.startsWith(h4Text)) text = text.slice(h4Text.length);

  return text
    .replace(/^\s*Капсула\s*/i, "")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Порт extractNameTitle(containerEl) [8068] — логика 1:1. */
export function extractNameTitle(containerEl: HtmlElement): string {
  const recSection = (() => {
    for (const div of containerEl.querySelectorAll("div[data-section]")) {
      const sec = (div.getAttribute("data-section") ?? "").toLowerCase();
      if (sec.includes("итогов") || sec.includes("рекоменд")) return div;
    }
    return null;
  })();

  const strong = recSection
    ? recSection.querySelector("strong")
    : containerEl.querySelector("strong");
  const title = (strong?.textContent ?? "").trim();
  const rationale = recSection
    ? innerTextTrimmed(recSection)
    : extractSection(containerEl, "обоснован");

  let result = "";
  if (title) result += "НАЗВАНИЕ КОНЦЕПЦИИ: «" + title + "»";
  if (rationale) result += "\n" + rationale;
  return result || truncateText(innerTextTrimmed(containerEl), 1500);
}

/** Порт extractIntraSectionContext(container, excludeName) [19866] — 1:1. */
export function extractIntraSectionContext(
  container: HtmlElement,
  excludeName: string,
): string {
  const parts: string[] = [];
  for (const sec of container.querySelectorAll("[data-section]")) {
    const name = sec.getAttribute("data-section");
    if (name === excludeName) continue;
    const tables = Array.from(sec.querySelectorAll("table.doc-table"));
    if (tables.length > 0) {
      const tableParts = tables.map((t) => tableToText(t));
      const nonTableText = innerTextTrimmed(sec).replace(/\n{3,}/g, "\n\n");
      parts.push(
        `[${name}]\n${truncateText(nonTableText, 1500)}\n${tableParts.join("\n")}`,
      );
    } else {
      const text = innerTextTrimmed(sec);
      if (text) parts.push(`[${name}]\n${truncateText(text, 2000)}`);
    }
  }
  return parts.join("\n\n");
}

/** Порт extractSubsectionContent(container, subsectionName) [19950] — 1:1. */
export function extractSubsectionContent(
  container: HtmlElement,
  subsectionName: string,
): string | null {
  const sec = container.querySelector(`[data-section="${subsectionName}"]`);
  if (!sec) return null;
  const parts: string[] = [];
  for (const child of sec.children) {
    if (child.tagName === "TABLE") {
      parts.push(tableToText(child));
    } else {
      const t = innerTextTrimmed(child);
      if (t) parts.push(t);
    }
  }
  return parts.filter(Boolean).join("\n") || innerTextTrimmed(sec) || null;
}

/* ── Именованные обёртки протокола (07, беседа 1.3) ──────────────────── */

/** sum:goals — «Цели и метод» с фолбэком на «цели» [8158]. */
export async function extractSummaryGoals(src: ContextSource): Promise<string | null> {
  const el = await src.getSectionElement("sum");
  return extractSection(el, "цели и метод") ?? extractSection(el, "цели");
}

/** sum:tensions — «Точки напряжения» [8161]. */
export async function extractSummaryTensions(
  src: ContextSource,
): Promise<string | null> {
  return extractSection(await src.getSectionElement("sum"), "напряжени");
}

/* ── Диспетчер extractContextFragment [8150] ─────────────────────────── */

/** Раздел-источник ключа: 'graph:nodes' → 'graph' (`contextKey.split(":")`) */
function sectionOfKey(contextKey: string): string {
  return contextKey.split(":")[0] ?? contextKey;
}

/**
 * Порт extractContextFragment(contextKey, generated) [8150].
 * Структура switch и все ветки — 1:1 с исходником; отличаются только
 * источники данных (см. шапку модуля). Неизвестный ключ → null (default).
 */
export async function extractContextFragment(
  contextKey: string,
  src: ContextSource,
): Promise<string | null> {
  // Капсула хранится в syntheses (в исходнике — DOC_STATE), не в разделах:
  // обрабатываем ДО проверки наличия раздела — как в исходнике.
  if (contextKey === "capsule:full") {
    const html = await src.getCapsuleHtml();
    if (!html) return null;
    return extractCapsuleText(html) || null;
  }

  const el = await src.getSectionElement(sectionOfKey(contextKey));
  if (!el) return null;

  switch (contextKey) {
    case "sum:goals":
      return extractSection(el, "цели и метод") ?? extractSection(el, "цели");
    case "sum:portraits":
      return extractSection(el, "портрет");
    case "sum:novelty":
      return extractSection(el, "новизн");
    case "sum:tensions":
      return extractSection(el, "напряжени");
    case "sum:coherence":
      return extractSection(el, "когерентност");
    case "sum:difficulty":
      return extractSection(el, "сложност");

    case "graph:nodes":
      return extractGraphNodesTable(src);
    case "graph:nodes_compact":
      return extractGraphNodesCompact(src);
    case "graph:edges":
      return extractGraphEdges(src);
    case "graph:topology":
      return extractSection(el, "тополог");

    case "glossary:table":
      return extractGlossaryTable(src);

    case "theses:full":
      return truncateText(innerTextTrimmed(el), 6000);
    case "theses:summary":
      return extractThesesSummary(src);

    case "name:title": {
      // Приоритет 1: из раздела «Анализ названия»
      const fromSection = extractNameTitle(el);
      if (fromSection) return fromSection;
      // Приоритет 2: заголовок документа (в исходнике — #docTitle,
      // здесь — syntheses.title)
      const { docTitle } = await src.getParams();
      const t = docTitle.trim();
      if (t && t !== DEFAULT_TITLE) return "НАЗВАНИЕ КОНЦЕПЦИИ: «" + t + "»";
      return null;
    }
    case "name:full":
      return truncateText(innerTextTrimmed(el), 4000);

    case "dialogue:synthesis":
      return extractSection(el, "аналитическ");
    case "dialogue:new_concepts": {
      const table = extractSection(el, "итогов");
      if (table) return "ПОНЯТИЯ ИЗ ДИАЛОГА:\n" + truncateText(table, 4000);
      const concepts = Array.from(el.querySelectorAll("strong"))
        .map((s) => (s.textContent ?? "").trim())
        .filter((t) => t.length > 5 && t.length < 100);
      if (concepts.length > 0) {
        return "ПОНЯТИЯ ИЗ ДИАЛОГА:\n" + [...new Set(concepts)].join("\n");
      }
      return truncateText(innerTextTrimmed(el), 3000);
    }
    case "dialogue:tensions_discovered": {
      const comment = extractSection(el, "аналитическ");
      if (comment) return "НАПРЯЖЕНИЯ (из диалога):\n" + truncateText(comment, 3000);
      return null;
    }
    case "dialogue:turning_points": {
      const table = extractSection(el, "итогов");
      const comment = extractSection(el, "аналитическ");
      const parts: string[] = [];
      if (table) parts.push(truncateText(table, 2000));
      if (comment) parts.push(truncateText(comment, 2000));
      return parts.length
        ? "КЛЮЧЕВЫЕ МОМЕНТЫ ДИАЛОГА:\n" + parts.join("\n")
        : null;
    }

    case "origin:genealogy":
      return extractSection(el, "идентификац");
    case "origin:decomposition":
      return truncateText(extractSection(el, "декомпозиц") ?? "", 5000);
    case "origin:novelty":
      return extractSection(el, "оригинальност");

    case "history:full":
      return truncateText(innerTextTrimmed(el), 4000);
    case "history:contemporary":
      return extractSection(el, "современн");
    case "history:genealogy":
      return extractSection(el, "генеалог");
    case "history:influence":
      return extractSection(el, "потенциальное влиян");
    case "history:name_context":
      return (
        extractSection(el, "название историчес") ??
        extractSection(el, "соответствие назван")
      );

    case "practical:summary": {
      const tables = Array.from(el.querySelectorAll("table.doc-table"));
      const last = tables[tables.length - 1];
      return last ? "ТАБЛИЦА ПРИМЕНЕНИЯ:\n" + tableToText(last) : null;
    }

    case "evolution:directions":
      return extractSection(el, "направления развития");
    case "evolution:graph_changes":
      return extractSection(el, "изменения графа");
    case "evolution:name_evolution":
      return extractSection(el, "эволюция названия");
    case "evolution:science":
      return extractSection(el, "современной науке");

    case "critique:full":
      return truncateText(innerTextTrimmed(el), 6000);
    case "critique:final_table": {
      const sec =
        el.querySelector('[data-section*="Итоговая оценка"]') ??
        el.querySelector('[data-section*="итогов"]');
      if (sec) {
        const table = sec.querySelector("table.doc-table");
        if (table) return "ИТОГОВАЯ ОЦЕНКА:\n" + tableToText(table);
        return truncateText(innerTextTrimmed(sec), 2000);
      }
      const tables = Array.from(el.querySelectorAll("table.doc-table"));
      const last = tables[tables.length - 1];
      return last ? "ИТОГОВАЯ ОЦЕНКА:\n" + tableToText(last) : null;
    }

    case "graph:nodes_top": {
      // Дословный порт [8232]: сортировка идёт по УЖЕ СОБРАННОЙ таблице
      // (cols[3] = Центральность), а не по данным БД — формат и поведение
      // при нестандартных значениях сохраняются 1:1.
      const fullTable = await extractGraphNodesTable(src);
      if (!fullTable) return null;
      const rows = fullTable.split("\n");
      if (rows.length <= 3) return fullTable;
      const header = rows.slice(0, 3);
      const dataRows = rows.slice(3);
      const parsed = dataRows.map((row) => {
        const cols = row.split(" | ");
        const cen = parseFloat(cols[3] ?? "") || 0;
        return { row, cen };
      });
      parsed.sort((a, b) => b.cen - a.cen);
      const top = parsed.slice(0, 7).map((p) => p.row);
      return header.concat(top).join("\n");
    }

    default:
      return null;
  }
}
