/**
 * Element Renderer (беседа 5.1; НОВОЕ — решение 2026-09-02, аудит фаз 5–6,
 * п.1 в суженной форме; 02-data-model §3 «Направление записи»).
 *
 * Обратное к парсерам 1.4: из гранулярных строк БД собирает ту же
 * разметку таблиц, что генерирует Claude по шаблонам Registry
 * (section.graph.sub.categories[.ext] / .edges[.ext] / .topology_table,
 * section.theses.sub.table, section.glossary.sub.table), и врезает
 * ТОЛЬКО таблицу в sections.html_content через replaceDocTable
 * (html-parser). Раздел и даже подраздел целиком не перерисовываются:
 * обоснования тезисов, преамбулы и комментарии к кластерам лежат вне
 * таблиц — 02 §3.
 *
 * Параметры формы таблиц:
 *  - категории: ext_graph_metrics (6 доп. столбцов) и synth_level
 *    (имя последнего базового столбца — level.{level}.graph_last_col_name);
 *  - связи: ext_graph_metrics (5 доп. столбцов);
 *  - глоссарий: столбцы сверх «Термин | Определение» — из extra_columns
 *    (ключи = фактические заголовки thead, как их сохранил парсер 1.4).
 *
 * Заголовки thead рендерер ПРЕДПОЧИТАЕТ брать из текущего HTML раздела
 * (locateDocTable): при lang ≠ Russian или иной формулировке Claude их не
 * следует переписывать шаблонными; шаблон Registry — fallback для
 * таблицы, которой в HTML не было.
 *
 * ПРИЁМКА (07 5.1 п.1b): round-trip parse(render(x)) ≡ x. Строго побайтно
 * невозможно — парсеры НОРМАЛИЗУЮТ (normalizeName/normalizeType,
 * toLowerCase направления, parseFloat(...) || 0.5 для пустых/нулевых
 * центральности/определённости/силы). Round-trip проверяется на уровне
 * ПОЛЕЙ после нормализации; известные невосстановимые значения:
 * centrality/certainty/strength === 0 (парсер читает как 0.5) — это
 * квирк парсера 1.4, воспроизводящий исходник [12939], здесь не чинится.
 * Дрейф-контроль пары parser↔renderer — секция integration-check.
 */
import { and, asc, eq } from "drizzle-orm";

import { esc } from "@philosynth/shared/utils/escape";

import { db } from "../db/index.js";
import {
  categories,
  categoryEdges,
  clusterLabels,
  glossaryTerms,
  sections,
  syntheses,
  theses,
} from "../db/schema.js";
import {
  locateDocTable,
  replaceDocTable,
  type DocTableLocator,
} from "../utils/html-parser.js";
import { ROLE_MAP } from "./graph-parser.js";
import { getTemplate } from "./prompt-registry.js";

/* ── Типы строк (select-формы схемы) ─────────────────────────────────── */

export type CategoryRow = typeof categories.$inferSelect;
export type EdgeRow = typeof categoryEdges.$inferSelect;
export type ClusterRow = typeof clusterLabels.$inferSelect;
export type ThesisRow = typeof theses.$inferSelect;
export type GlossaryRow = typeof glossaryTerms.$inferSelect;

/** Имена подразделов-хозяев таблиц (ключи SUBSECTION_TO_CTX_KEYS). */
export const TABLE_SUBSECTIONS = {
  categories: "Таблица категорий",
  edges: "Таблица связей",
  topology: "Топологическая таблица",
  topologyProse: "Топология графа",
  theses: "Сводная таблица тезисов",
  glossary: "Таблица определений",
} as const;

export type RenderableTable = "categories" | "edges" | "topology" | "theses" | "glossary";

/** Раздел-хозяин каждой таблицы (ключ sections.key). */
export const TABLE_SECTION: Readonly<Record<RenderableTable, string>> = {
  categories: "graph",
  edges: "graph",
  topology: "graph",
  theses: "theses",
  glossary: "glossary",
};

/* ── Заголовки по шаблонам Registry (fallback) ───────────────────────── */

/** Базовые столбцы таблицы категорий (section.graph.sub.categories). */
export const CATEGORY_BASE_HEADERS = [
  "Категория",
  "Тип",
  "Определение",
  "Центральность",
  "Определённость",
] as const;
/** Доп. столбцы при extGraphMetrics (section.graph.sub.categories.ext). */
export const CATEGORY_EXT_HEADERS = [
  "Ист. значимость",
  "Степень инновации",
  "Ясность",
  "Широта",
  "Глубина",
  "Применимость",
] as const;
export const EDGE_BASE_HEADERS = [
  "Источник",
  "Описание связи",
  "Цель",
  "Тип",
  "Направление",
  "Сила",
] as const;
export const EDGE_EXT_HEADERS = [
  "Определённость связи",
  "Степень инновации",
  "Ист. поддержка",
  "Логическая необходимость",
  "Контекстозависимость",
] as const;
export const TOPOLOGY_HEADERS = [
  "Категория",
  "Кластер",
  "Структурные роли",
  "Процессуальные роли",
  "Рефлексивная связь",
] as const;
export const THESES_HEADERS = [
  "№",
  "Формулировка тезиса",
  "Тип (онтол./эпистем./этич.)",
  "Степень новизны",
  "Связанные категории",
] as const;
export const GLOSSARY_BASE_HEADERS = [
  "Термин",
  "Принятое определение в данной концепции",
] as const;

/** level.{level}.graph_last_col_name (Происхождение/Генеалогия/…). */
export async function graphLastColName(synthLevel: string): Promise<string> {
  try {
    return (await getTemplate(`level.${synthLevel}.graph_last_col_name`)).trim();
  } catch {
    return "Происхождение";
  }
}

/* ── Обратные словари парсеров ───────────────────────────────────────── */

/** Ключ роли → русская метка (обращение ROLE_MAP graph-parser; при
 *  нескольких метках одного ключа побеждает первая по порядку карты). */
export const ROLE_LABELS: Readonly<Record<string, string>> = (() => {
  const out: Record<string, string> = {};
  for (const [label, key] of Object.entries(ROLE_MAP)) {
    if (!(key in out)) out[key] = label;
  }
  return out;
})();

/** Enum тезиса → метка столбца «Тип» (mapThesisType парсера различает
 *  по подстрокам «эпист»/«этич», иначе онтологический). */
export const THESIS_TYPE_LABELS: Readonly<Record<string, string>> = {
  ontological: "онтологический",
  epistemological: "эпистемологический",
  ethical: "этический",
};

/* ── Форматирование ──────────────────────────────────────────────────── */

/** Число как в ответах Claude: до 2 знаков, без хвостовых нулей. */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "";
  const r = Math.round(n * 100) / 100;
  return String(r);
}

function tr(cells: readonly string[]): string {
  return "<tr>" + cells.map((c) => `<td>${esc(c)}</td>`).join("") + "</tr>";
}

function table(headers: readonly string[], rows: readonly string[]): string {
  return (
    '<table class="doc-table"><thead><tr>' +
    headers.map((h) => `<th>${esc(h)}</th>`).join("") +
    "</tr></thead><tbody>" +
    rows.join("") +
    "</tbody></table>"
  );
}

/* ── Рендереры таблиц ────────────────────────────────────────────────── */

export interface CategoriesTableOptions {
  extGraphMetrics: boolean;
  /** Имя последнего базового столбца (по synth_level) */
  lastColName: string;
  /** Фактические заголовки thead из HTML — если есть, приоритетны */
  headers?: readonly string[] | undefined;
}

export function renderCategoriesTable(
  rows: readonly CategoryRow[],
  opts: CategoriesTableOptions,
): string {
  const expectedCols = 6 + (opts.extGraphMetrics ? 6 : 0);
  const headers =
    opts.headers && opts.headers.length === expectedCols
      ? opts.headers
      : [
          ...CATEGORY_BASE_HEADERS,
          opts.lastColName,
          ...(opts.extGraphMetrics ? CATEGORY_EXT_HEADERS : []),
        ];
  const body = [...rows]
    .sort((a, b) => a.position - b.position)
    .map((r) =>
      tr([
        r.name,
        r.type,
        r.definition,
        fmtNum(r.centrality),
        fmtNum(r.certainty),
        r.origin,
        ...(opts.extGraphMetrics
          ? [
              fmtNum(r.historicalSignificance),
              String(r.innovationDegree),
              fmtNum(r.clarity),
              fmtNum(r.breadth),
              fmtNum(r.depthScore),
              fmtNum(r.applicability),
            ]
          : []),
      ]),
    );
  return table(headers, body);
}

export interface EdgesTableOptions {
  extGraphMetrics: boolean;
  headers?: readonly string[] | undefined;
}

export function renderEdgesTable(
  rows: readonly EdgeRow[],
  cats: readonly Pick<CategoryRow, "id" | "name">[],
  opts: EdgesTableOptions,
): string {
  const nameOf = new Map(cats.map((c) => [c.id, c.name]));
  const expectedCols = 6 + (opts.extGraphMetrics ? 5 : 0);
  const headers =
    opts.headers && opts.headers.length === expectedCols
      ? opts.headers
      : [...EDGE_BASE_HEADERS, ...(opts.extGraphMetrics ? EDGE_EXT_HEADERS : [])];
  const body = [...rows]
    .sort((a, b) => a.position - b.position)
    .map((e) =>
      tr([
        nameOf.get(e.sourceId) ?? "",
        e.description,
        nameOf.get(e.targetId) ?? "",
        e.edgeType,
        e.direction,
        fmtNum(e.strength),
        ...(opts.extGraphMetrics
          ? [
              fmtNum(e.certainty),
              String(e.innovationDegree),
              fmtNum(e.historicalSupport),
              fmtNum(e.logicalNecessity),
              fmtNum(e.contextDependency),
            ]
          : []),
      ]),
    );
  return table(headers, body);
}

export interface TopologyTableOptions {
  headers?: readonly string[] | undefined;
}

/**
 * Топологическая таблица: Категория | Кластер | Структурные роли |
 * Процессуальные роли | Рефлексивная связь. Кластеры — полные метки через
 * « / »; мост без кластера — «мост» (шаблон topology_table; парсер читает
 * его как роль bridge, кластер не создаёт); роли — русские метки ROLE_MAP.
 */
export function renderTopologyTable(
  rows: readonly CategoryRow[],
  clusters: readonly Pick<ClusterRow, "clusterIndex" | "label">[],
  opts: TopologyTableOptions = {},
): string {
  const labelOf = new Map(clusters.map((c) => [c.clusterIndex, c.label]));
  const headers =
    opts.headers && opts.headers.length === TOPOLOGY_HEADERS.length
      ? opts.headers
      : TOPOLOGY_HEADERS;
  const roleText = (keys: readonly string[]): string =>
    keys.map((k) => ROLE_LABELS[k] ?? k).join(", ");
  const body = [...rows]
    .sort((a, b) => a.position - b.position)
    .map((r) => {
      const clusterCell = r.clusterIndices
        .map((i) => labelOf.get(i))
        .filter((l): l is string => typeof l === "string")
        .join(" / ");
      return tr([
        r.name,
        clusterCell || (r.structuralRoles.includes("bridge") ? "мост" : ""),
        roleText(r.structuralRoles),
        roleText(r.proceduralRoles),
        r.hasReflexive ? "да" : "",
      ]);
    });
  return table(headers, body);
}

export interface ThesesTableOptions {
  headers?: readonly string[] | undefined;
}

export function renderThesesTable(
  rows: readonly ThesisRow[],
  opts: ThesesTableOptions = {},
): string {
  const headers =
    opts.headers && opts.headers.length === THESES_HEADERS.length
      ? opts.headers
      : THESES_HEADERS;
  const body = [...rows]
    .sort((a, b) => a.thesisNum - b.thesisNum)
    .map((t) =>
      tr([
        String(t.thesisNum),
        t.formulation,
        THESIS_TYPE_LABELS[t.thesisType] ?? t.thesisType,
        t.noveltyDegree,
        t.relatedCategories.join(", "),
      ]),
    );
  return table(headers, body);
}

export interface GlossaryTableOptions {
  /** Фактические заголовки thead (приоритетны); иначе базовые + ключи
   *  extra_columns в порядке первого появления по строкам */
  headers?: readonly string[] | undefined;
}

export function renderGlossaryTable(
  rows: readonly GlossaryRow[],
  opts: GlossaryTableOptions = {},
): string {
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  let headers: readonly string[];
  if (opts.headers && opts.headers.length >= 2) {
    headers = opts.headers;
  } else {
    const extra: string[] = [];
    for (const r of sorted) {
      for (const k of Object.keys(r.extraColumns)) {
        if (!extra.includes(k)) extra.push(k);
      }
    }
    headers = [...GLOSSARY_BASE_HEADERS, ...extra];
  }
  const extraHeaders = headers.slice(2);
  const body = sorted.map((g) =>
    tr([
      g.term,
      g.definition,
      ...extraHeaders.map((h) => g.extraColumns[h] ?? ""),
    ]),
  );
  return table(headers, body);
}

/* ── Врезка в html_content ───────────────────────────────────────────── */

/** Локаторы таблицы в HTML раздела — зеркало поиска парсеров 1.4. */
export function locatorsFor(which: RenderableTable): DocTableLocator[] {
  switch (which) {
    case "categories":
      return [{ subsection: TABLE_SUBSECTIONS.categories }];
    case "edges":
      return [{ subsection: TABLE_SUBSECTIONS.edges }];
    case "topology":
      // parseTopology: «Топологическая таблица» внутри/рядом с «Топология
      // графа», иначе таблица в самом описательном подразделе
      return [
        { subsection: TABLE_SUBSECTIONS.topology },
        { subsection: TABLE_SUBSECTIONS.topologyProse },
      ];
    case "theses":
      return [{ subsection: "Сводная таблица" }];
    case "glossary":
      return [
        { firstHeaderIncludes: "термин" },
        { subsection: TABLE_SUBSECTIONS.glossary },
      ];
  }
}

export interface ApplyResult {
  /** false — раздела-хозяина нет в БД (правка сохранена только в таблице) */
  updated: boolean;
  outcome?: "replaced" | "appended" | "created" | undefined;
  reason?: string | undefined;
}

/**
 * Перерисовать ОДНУ таблицу из гранулярных данных и врезать её в
 * sections.html_content (07 5.1 п.1b: applyElementUpdateToHtml).
 * synth_level/ext_graph_metrics — из syntheses. Раздел помечается
 * is_edited. Отсутствие раздела-хозяина — не ошибка: {updated:false}
 * (гранулярная таблица уже обновлена; вызывающий сообщает клиенту).
 */
export async function applyElementUpdateToHtml(
  synthesisId: string,
  which: RenderableTable,
): Promise<ApplyResult> {
  const sectionKey = TABLE_SECTION[which];
  const [synth] = await db
    .select({
      synthLevel: syntheses.synthLevel,
      extGraphMetrics: syntheses.extGraphMetrics,
    })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  if (!synth) return { updated: false, reason: "synthesis_missing" };
  const [sec] = await db
    .select({ id: sections.id, html: sections.htmlContent })
    .from(sections)
    .where(and(eq(sections.synthesisId, synthesisId), eq(sections.key, sectionKey)))
    .limit(1);
  if (!sec) return { updated: false, reason: "section_missing" };

  const locators = locatorsFor(which);
  const located = locateDocTable(sec.html, locators);
  const headers = located?.headers;

  let tableHtml: string;
  switch (which) {
    case "categories": {
      const cats = await loadCats(synthesisId);
      tableHtml = renderCategoriesTable(cats, {
        extGraphMetrics: synth.extGraphMetrics,
        lastColName: await graphLastColName(synth.synthLevel),
        headers,
      });
      break;
    }
    case "edges": {
      const [cats, edges] = await Promise.all([
        loadCats(synthesisId),
        db
          .select()
          .from(categoryEdges)
          .where(eq(categoryEdges.synthesisId, synthesisId))
          .orderBy(asc(categoryEdges.position)),
      ]);
      tableHtml = renderEdgesTable(edges, cats, {
        extGraphMetrics: synth.extGraphMetrics,
        headers,
      });
      break;
    }
    case "topology": {
      const [cats, clusters] = await Promise.all([
        loadCats(synthesisId),
        db
          .select()
          .from(clusterLabels)
          .where(eq(clusterLabels.synthesisId, synthesisId))
          .orderBy(asc(clusterLabels.clusterIndex)),
      ]);
      tableHtml = renderTopologyTable(cats, clusters, { headers });
      break;
    }
    case "theses": {
      const rows = await db
        .select()
        .from(theses)
        .where(eq(theses.synthesisId, synthesisId))
        .orderBy(asc(theses.thesisNum));
      tableHtml = renderThesesTable(rows, { headers });
      break;
    }
    case "glossary": {
      const rows = await db
        .select()
        .from(glossaryTerms)
        .where(eq(glossaryTerms.synthesisId, synthesisId))
        .orderBy(asc(glossaryTerms.position));
      tableHtml = renderGlossaryTable(rows, { headers });
      break;
    }
  }

  const fallbackName =
    which === "topology" ? TABLE_SUBSECTIONS.topology : TABLE_SUBSECTIONS[which];
  const res = replaceDocTable(sec.html, locators, tableHtml, fallbackName);
  await db
    .update(sections)
    .set({ htmlContent: res.html, isEdited: true, updatedAt: new Date() })
    .where(eq(sections.id, sec.id));
  return { updated: true, outcome: res.outcome };
}

/** Прямая правка html_content раздела (auto-rename, абзац тезиса). */
export async function writeSectionHtml(
  sectionId: string,
  html: string,
): Promise<void> {
  await db
    .update(sections)
    .set({ htmlContent: html, isEdited: true, updatedAt: new Date() })
    .where(eq(sections.id, sectionId));
}

async function loadCats(synthesisId: string): Promise<CategoryRow[]> {
  return db
    .select()
    .from(categories)
    .where(eq(categories.synthesisId, synthesisId))
    .orderBy(asc(categories.position));
}
