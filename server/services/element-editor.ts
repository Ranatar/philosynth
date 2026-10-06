/**
 * Element Editor (беседа 5.1; НОВОЕ — 01-architecture §4.7, 03-spec §2.4,
 * §1.5 E7–E9). Функциональности в исходнике НЕТ — там элементы живут
 * только внутри HTML и правятся перегенерацией.
 *
 * Каждая правка: (a) загрузка строки с проверкой принадлежности синтезу,
 * (b) версия-снимок ДО изменения (element-versioning), (c) UPDATE
 * гранулярной таблицы, source → 'manual', (d) перерисовка ЗАТРОНУТЫХ
 * таблиц в html_content (element-renderer; 02 §3 — только таблицы, не
 * раздел), (e) impact-анализ. (b)+(c) — одна транзакция.
 *
 * Impact (computeElementImpact) — «зона поражения» без DOM:
 *  - раздел-хозяин: category/edge → graph, thesis → theses,
 *    glossary_term → glossary;
 *  - affectedSubsections: getCrossSecDependents (cascade-analyzer 2.1) по
 *    подразделам-таблицам, где элемент отображён, через
 *    SUBSECTION_TO_CTX_KEYS — подразделы ДРУГИХ разделов, потреблявшие
 *    этот контекст;
 *  - affectedSections: analyzeImpact({regen:[раздел-хозяин]}) —
 *    downstream по текущим effectiveDeps (тот же расчёт, что у планов);
 *  - affectedModes: getAffectedModes по разделу и подразделам;
 *  - severity: 'high' — имя элемента текстуально упомянуто в других
 *    разделах/тезисах (замена имени без каскада оставит документ
 *    несогласованным); 'low' — есть структурные зависимые, упоминаний нет;
 *    'none' — ничего.
 *
 * Поля вне таблиц (02 §3 п.4): justification тезиса — точечная правка
 * абзаца «<strong>формулировка</strong> обоснование» (replaceThesisParagraph);
 * не найден абзац → поле в htmlSync.pending («раздел требует
 * перегенерации»). Прочие внетабличные (termCategory глоссария,
 * hasReflexive — денормализация) в HTML напрямую не живут: termCategory —
 * принадлежность категорийным подразделам — тоже уходит в pending.
 *
 * Связь с generation-service (loadSynthesis/buildEditInfra) — статический
 * импорт допустим: модуль — лист графа (его импортируют только роуты),
 * цикла нет (грабля 2.1).
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  categories,
  categoryEdges,
  categoryTypeCatalog,
  glossaryTerms,
  relationshipTypeCatalog,
  sections,
  syntheses,
  theses,
} from "../db/schema.js";
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";
import {
  SubsectionHtmlError,
  listSubsectionNames,
  readSubsectionSource,
  replaceSubsectionContent,
  readThesisBlock,
  replaceThesisBlock,
  replaceThesisParagraph,
  thesisLabelIndex,
} from "../utils/html-parser.js";
import {
  analyzeImpact,
  getAffectedModes,
  getCrossSecDependents,
  loadModesState,
  type SectionDefsForCascade,
} from "./cascade-analyzer.js";
import {
  applyElementUpdateToHtml,
  lockedSubsectionsOf,
  writeSectionHtml,
  TABLE_SECTION,
  TABLE_SUBSECTIONS,
  type CategoryRow,
  type EdgeRow,
  type GlossaryRow,
  type RenderableTable,
  type ThesisRow,
} from "./element-renderer.js";
import {
  createVersion,
  rollbackToVersion,
  snapshotOf,
  type DbLike,
} from "./element-versioning.js";
import { parseThesisParagraphs, type ThesisParagraph } from "./element-parser.js";
import { buildEditInfra, extractTitleFromNameHtml, loadSynthesis } from "./generation-service.js";
import { buildSubsectionMap } from "./section-defs-builder.js";

import type {
  AutoRenameResult,
  CategoryUpdateInput,
  EdgeUpdateInput,
  ElementVersion,
  GlossaryTermUpdateInput,
  HtmlSyncInfo,
  ImpactAnalysis,
  ChangeSource,
  ThesisUpdateInput,
  VersionOrigin,
  VersionedElementType,
} from "@philosynth/shared/types/elements";
import type { Category, CategoryEdge } from "@philosynth/shared/types/graph";
import type { GlossaryTerm, Thesis } from "@philosynth/shared/types/elements";
import { tl } from "@philosynth/shared/i18n/t";

/* ── Ошибки ──────────────────────────────────────────────────────────── */

export type ElementEditorErrorCode = "NOT_FOUND" | "VALIDATION_ERROR";

export class ElementEditorError extends Error {
  constructor(
    public readonly code: ElementEditorErrorCode,
    message: string,
    public readonly details?: Record<string, string> | undefined,
  ) {
    super(message);
    this.name = "ElementEditorError";
  }
}

/* ── DTO-мапперы (совместимы с routes/elements.ts 1.6) ───────────────── */

export function toCategoryDto(r: CategoryRow): Category {
  return {
    id: r.id,
    synthesisId: r.synthesisId,
    name: r.name,
    type: r.type,
    definition: r.definition,
    centrality: r.centrality,
    certainty: r.certainty,
    historicalSignificance: r.historicalSignificance,
    innovationDegree: r.innovationDegree,
    clarity: r.clarity,
    breadth: r.breadth,
    depthScore: r.depthScore,
    applicability: r.applicability,
    typeCatalogId: r.typeCatalogId ?? null,
    origin: r.origin,
    clusterIndices: r.clusterIndices,
    structuralRoles: r.structuralRoles,
    proceduralRoles: r.proceduralRoles,
    hasReflexive: r.hasReflexive,
    position: r.position,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toEdgeDto(r: EdgeRow): CategoryEdge {
  return {
    id: r.id,
    synthesisId: r.synthesisId,
    sourceId: r.sourceId,
    targetId: r.targetId,
    description: r.description,
    edgeType: r.edgeType,
    direction: r.direction,
    strength: r.strength,
    certainty: r.certainty,
    historicalSupport: r.historicalSupport,
    logicalNecessity: r.logicalNecessity,
    innovationDegree: r.innovationDegree,
    contextDependency: r.contextDependency,
    typeCatalogId: r.typeCatalogId ?? null,
    position: r.position,
    sourceOrigin: r.sourceOrigin,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toThesisDto(r: ThesisRow): Thesis {
  return {
    id: r.id,
    synthesisId: r.synthesisId,
    thesisNum: r.thesisNum,
    label: r.label ?? null,
    formulation: r.formulation,
    justification: r.justification,
    thesisType: r.thesisType,
    noveltyDegree: r.noveltyDegree,
    relatedCategories: r.relatedCategories,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toGlossaryDto(r: GlossaryRow): GlossaryTerm {
  return {
    id: r.id,
    synthesisId: r.synthesisId,
    term: r.term,
    definition: r.definition,
    extraColumns: r.extraColumns,
    termCategory: r.termCategory,
    source: r.source,
    position: r.position,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/* ── Валидация входов ────────────────────────────────────────────────── */

type Details = Record<string, string>;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(details: Details): never {
  throw new ElementEditorError("VALIDATION_ERROR", tl("common.invalidData", "Невалидные данные"), details);
}

/** Строка: trim; пустая допустима только если allowEmpty. */
function str(
  v: unknown,
  field: string,
  d: Details,
  opts: { allowEmpty?: boolean; max?: number } = {},
): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string") {
    d[field] = "ожидается строка";
    return undefined;
  }
  const t = v.trim();
  if (!t && !opts.allowEmpty) {
    d[field] = "не может быть пустым";
    return undefined;
  }
  if (opts.max && t.length > opts.max) {
    d[field] = `не длиннее ${opts.max} символов`;
    return undefined;
  }
  return t;
}

/** Число в [lo, hi]; integer — целое. (п.18 правки 2026-09-02: диапазон
 *  зависит от поля — 0–1 для REAL-характеристик, 1–5 для innovationDegree.) */
function num(
  v: unknown,
  field: string,
  d: Details,
  lo: number,
  hi: number,
  integer = false,
): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    d[field] = "ожидается число";
    return undefined;
  }
  if (integer && !Number.isInteger(v)) {
    d[field] = "ожидается целое";
    return undefined;
  }
  if (v < lo || v > hi) {
    d[field] = `допустимый диапазон ${lo}–${hi}`;
    return undefined;
  }
  return v;
}

function strList(v: unknown, field: string, d: Details): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
    d[field] = "ожидается массив строк";
    return undefined;
  }
  return v.map((x: string) => x.trim()).filter(Boolean);
}

async function catalogIdOrNull(
  v: unknown,
  field: string,
  d: Details,
  table: typeof categoryTypeCatalog | typeof relationshipTypeCatalog,
): Promise<string | null | undefined> {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) {
    d[field] = "ожидается id каталога или null";
    return undefined;
  }
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(eq(table.id, v))
    .limit(1);
  if (!row) {
    d[field] = "тип не найден в каталоге";
    return undefined;
  }
  return v;
}

/* ── Загрузчики с проверкой принадлежности ───────────────────────────── */

async function loadCategoryRow(
  synthesisId: string,
  id: string,
  tx: DbLike = db,
): Promise<CategoryRow> {
  const [row] = await tx
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.synthesisId, synthesisId)))
    .limit(1);
  if (!row) throw new ElementEditorError("NOT_FOUND", tl("server.elementEditor.categoryNotFound", "Категория не найдена"));
  return row;
}

async function loadEdgeRow(
  synthesisId: string,
  id: string,
  tx: DbLike = db,
): Promise<EdgeRow> {
  const [row] = await tx
    .select()
    .from(categoryEdges)
    .where(and(eq(categoryEdges.id, id), eq(categoryEdges.synthesisId, synthesisId)))
    .limit(1);
  if (!row) throw new ElementEditorError("NOT_FOUND", tl("server.elementEditor.edgeNotFound", "Связь не найдена"));
  return row;
}

async function loadThesisRow(
  synthesisId: string,
  id: string,
  tx: DbLike = db,
): Promise<ThesisRow> {
  const [row] = await tx
    .select()
    .from(theses)
    .where(and(eq(theses.id, id), eq(theses.synthesisId, synthesisId)))
    .limit(1);
  if (!row) throw new ElementEditorError("NOT_FOUND", tl("server.elementEditor.thesisNotFound", "Тезис не найден"));
  return row;
}

async function loadGlossaryRow(
  synthesisId: string,
  id: string,
  tx: DbLike = db,
): Promise<GlossaryRow> {
  const [row] = await tx
    .select()
    .from(glossaryTerms)
    .where(and(eq(glossaryTerms.id, id), eq(glossaryTerms.synthesisId, synthesisId)))
    .limit(1);
  if (!row) throw new ElementEditorError("NOT_FOUND", tl("server.elementEditor.termNotFound", "Термин не найден"));
  return row;
}

/* ── Синхронизация с HTML ────────────────────────────────────────────── */

/**
 * 10.2: чем вызвана правка. По умолчанию — рука человека ('manual'); шаги
 * плана edit_element / refine_element передают 'recommendation' и снимок
 * рекомендации — он ложится в element_versions.origin.
 */
export interface ElementUpdateOptions {
  changeSource?: ChangeSource;
  origin?: VersionOrigin | null;
}

function emptySync(): HtmlSyncInfo {
  return { rendered: [], patched: [], pending: [], sectionMissing: false };
}

const TABLE_LABEL: Record<RenderableTable, string> = {
  categories: `graph:${TABLE_SUBSECTIONS.categories}`,
  edges: `graph:${TABLE_SUBSECTIONS.edges}`,
  topology: `graph:${TABLE_SUBSECTIONS.topology}`,
  theses: `theses:${TABLE_SUBSECTIONS.theses}`,
  glossary: `glossary:${TABLE_SUBSECTIONS.glossary}`,
};

/** Перерисовать набор таблиц; отсутствие раздела фиксируется один раз. */
async function renderTables(
  synthesisId: string,
  which: readonly RenderableTable[],
  sync: HtmlSyncInfo,
): Promise<void> {
  for (const w of which) {
    const res = await applyElementUpdateToHtml(synthesisId, w);
    if (res.updated) sync.rendered.push(TABLE_LABEL[w]);
    else if (res.reason === "section_missing") sync.sectionMissing = true;
  }
}

/* ── computeElementImpact ────────────────────────────────────────────── */

export type ImpactElementType = "category" | "edge" | "thesis" | "glossary_term";

/** Подразделы-таблицы, где элемент отображён (для getCrossSecDependents). */
function subsectionsOf(elementType: ImpactElementType): string[] {
  switch (elementType) {
    case "category":
      return [
        TABLE_SUBSECTIONS.categories,
        TABLE_SUBSECTIONS.edges,
        TABLE_SUBSECTIONS.topology,
      ];
    case "edge":
      return [TABLE_SUBSECTIONS.edges];
    case "thesis":
      return [TABLE_SUBSECTIONS.theses];
    case "glossary_term":
      return [TABLE_SUBSECTIONS.glossary];
  }
}

function sectionOf(elementType: ImpactElementType): string {
  switch (elementType) {
    case "category":
    case "edge":
      return TABLE_SECTION.categories;
    case "thesis":
      return TABLE_SECTION.theses;
    case "glossary_term":
      return TABLE_SECTION.glossary;
  }
}

/** Регексп «имя как отдельное слово» (\b не работает для кириллицы). */
function nameRegex(name: string, flags = "gu"): RegExp | null {
  const t = name.trim();
  if (t.length < 2) return null;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, flags);
}

/** Упоминания имени в HTML других разделов и в related_categories тезисов. */
async function countNameMentions(
  synthesisId: string,
  names: readonly string[],
  ownSectionKey: string,
): Promise<{ sections: string[]; theses: number }> {
  const res = names.map((n) => nameRegex(n, "u")).filter((r): r is RegExp => r !== null);
  if (!res.length) return { sections: [], theses: 0 };
  const re = { test: (t: string) => res.some((r) => r.test(t)) };
  const secRows = await db
    .select({ key: sections.key, html: sections.htmlContent })
    .from(sections)
    .where(eq(sections.synthesisId, synthesisId));
  const hit: string[] = [];
  for (const s of secRows) {
    if (s.key === ownSectionKey || s.key === "capsule") continue;
    if (re.test(s.html)) hit.push(s.key);
  }
  const thRows = await db
    .select({ rc: theses.relatedCategories, f: theses.formulation, j: theses.justification })
    .from(theses)
    .where(eq(theses.synthesisId, synthesisId));
  let thesesHits = 0;
  for (const t of thRows) {
    if (t.rc.some((c) => re.test(c)) || re.test(t.f) || re.test(t.j)) thesesHits++;
  }
  return { sections: hit, theses: thesesHits };
}

/**
 * computeElementImpact(elementType, elementId, synthesisId, names) →
 * ImpactAnalysis. `names` — отображаемые имена элемента для поиска
 * текстуальных упоминаний: при переименовании — И прежнее, И новое
 * (ссылки на прежнее имя в других разделах — то, что ломает правка;
 * новое — уже согласованные места). Категория — name, термин — term;
 * связь/тезис — без имени.
 */
export async function computeElementImpact(
  elementType: ImpactElementType,
  elementId: string,
  synthesisId: string,
  names: string | readonly (string | null | undefined)[] | null = null,
): Promise<ImpactAnalysis> {
  void elementId; // элемент уже загружен вызывающим; impact — по типу и имени
  const { row, philosophers, secCtx } = await loadSynthesis(synthesisId);
  const sectionOrder: readonly string[] = row.sectionOrder ?? [];
  const ownKey = sectionOf(elementType);
  const present = new Set(sectionOrder);

  // Раздел-хозяин отсутствует в документе → каскадных зависимых нет
  let affectedSections: string[] = [];
  const affectedSubs = new Map<string, string>();
  let affectedModes: ImpactAnalysis["affectedModes"] = [];
  const subs = subsectionsOf(elementType);

  if (present.has(ownKey)) {
    const infra = await buildEditInfra(row, philosophers, secCtx);
    const defsForCascade: SectionDefsForCascade = Object.fromEntries(
      infra.defs.map((d) => [d.key, { parts: d.parts }]),
    );
    const subsMap = await buildSubsectionMap(infra.p);
    for (const sub of subs) {
      for (const d of await getCrossSecDependents(
        ownKey,
        sub,
        infra.resolvedDeps,
        defsForCascade,
      )) {
        if (!present.has(d.section)) continue;
        if (
          d.subsection &&
          subsMap[d.section] &&
          !(subsMap[d.section] as string[]).includes(d.subsection)
        )
          continue;
        const k = d.section + ":" + (d.subsection ?? "*");
        if (!affectedSubs.has(k)) affectedSubs.set(k, k);
      }
    }
    const impact = await analyzeImpact(synthesisId, {
      regen: [ownKey],
      remove: [],
      add: [],
    });
    affectedSections = impact.affectedSections;
    const modes = await loadModesState(synthesisId);
    const am = await getAffectedModes({
      modes,
      generationOrder: infra.p.generationOrder,
      sectionOrder,
      changedSections: [ownKey],
      changedSubsections: subs.map((s) => ownKey + ":" + s),
    });
    affectedModes = am.map((m) => ({
      modeKey: m.modeKey,
      index: m.index,
      title: m.title,
    }));
  }

  const nameList = (Array.isArray(names) ? names : [names]).filter(
    (n): n is string => typeof n === "string" && n.trim().length > 0,
  );
  const mentions = await countNameMentions(synthesisId, nameList, ownKey);
  const structural =
    affectedSections.length + affectedSubs.size + affectedModes.length > 0;
  const severity: ImpactAnalysis["severity"] =
    mentions.sections.length + mentions.theses > 0
      ? "high"
      : structural
        ? "low"
        : "none";

  return {
    affectedSections,
    affectedSubsections: [...affectedSubs.keys()],
    affectedModes,
    severity,
  };
}

/* ── updateCategory ──────────────────────────────────────────────────── */

export interface UpdateCategoryResult {
  category: Category;
  impact: ImpactAnalysis;
  version: ElementVersion;
  htmlSync: HtmlSyncInfo;
}

export async function updateCategory(
  synthesisId: string,
  categoryId: string,
  updates: unknown,
  opts: ElementUpdateOptions = {},
): Promise<UpdateCategoryResult> {
  if (!isObj(updates)) fail({ body: tl("server.elementEditor.objectExpected", "ожидается объект") });
  const d: Details = {};
  const patch: Partial<typeof categories.$inferInsert> = {};
  const set = <K extends keyof typeof patch>(k: K, v: (typeof patch)[K]) => {
    if (v !== undefined) patch[k] = v;
  };
  set("name", str(updates["name"], "name", d, { max: 300 }));
  set("type", str(updates["type"], "type", d, { allowEmpty: true, max: 200 }));
  set("definition", str(updates["definition"], "definition", d, { allowEmpty: true }));
  set("origin", str(updates["origin"], "origin", d, { allowEmpty: true }));
  set("centrality", num(updates["centrality"], "centrality", d, 0, 1));
  set("certainty", num(updates["certainty"], "certainty", d, 0, 1));
  set("historicalSignificance", num(updates["historicalSignificance"], "historicalSignificance", d, 0, 1));
  set("innovationDegree", num(updates["innovationDegree"], "innovationDegree", d, 1, 5, true));
  set("clarity", num(updates["clarity"], "clarity", d, 0, 1));
  set("breadth", num(updates["breadth"], "breadth", d, 0, 1));
  set("depthScore", num(updates["depthScore"], "depthScore", d, 0, 1));
  set("applicability", num(updates["applicability"], "applicability", d, 0, 1));
  set("structuralRoles", strList(updates["structuralRoles"], "structuralRoles", d));
  set("proceduralRoles", strList(updates["proceduralRoles"], "proceduralRoles", d));
  if (updates["clusterIndices"] !== undefined) {
    const ci = updates["clusterIndices"];
    if (!Array.isArray(ci) || !ci.every((x) => Number.isInteger(x) && x >= 0))
      d["clusterIndices"] = "ожидается массив неотрицательных целых";
    else set("clusterIndices", ci as number[]);
  }
  const tc = await catalogIdOrNull(updates["typeCatalogId"], "typeCatalogId", d, categoryTypeCatalog);
  if (tc !== undefined) patch.typeCatalogId = tc;
  if (Object.keys(d).length) fail(d);
  if (Object.keys(patch).length === 0) fail({ body: tl("server.elementEditor.noFieldsToUpdate", "нет ни одного поля для обновления") });

  const { before, row, version } = await db.transaction(async (tx) => {
    const before = await loadCategoryRow(synthesisId, categoryId, tx);
    const version = await createVersion(
      synthesisId, before.id, "category", snapshotOf(before),
      opts.changeSource ?? "manual", tx, opts.origin ?? null,
    );
    const [row] = await tx
      .update(categories)
      .set({ ...patch, source: "manual", updatedAt: new Date() })
      .where(eq(categories.id, before.id))
      .returning();
    if (!row) throw new ElementEditorError("NOT_FOUND", tl("server.elementEditor.categoryNotFound", "Категория не найдена"));
    return { before, row, version };
  });

  const sync = emptySync();
  const tables: RenderableTable[] = ["categories"];
  const topoTouched =
    "structuralRoles" in patch || "proceduralRoles" in patch || "clusterIndices" in patch;
  if ("name" in patch) tables.push("edges", "topology");
  else if (topoTouched) tables.push("topology");
  await renderTables(synthesisId, tables, sync);

  const impact = await computeElementImpact("category", row.id, synthesisId, [
    before.name,
    row.name,
  ]);
  return { category: toCategoryDto(row), impact, version, htmlSync: sync };
}

/* ── updateCategoryEdge ──────────────────────────────────────────────── */

export interface UpdateEdgeResult {
  edge: CategoryEdge;
  impact: ImpactAnalysis;
  version: ElementVersion;
  htmlSync: HtmlSyncInfo;
}

const DIRECTIONS = ["однонаправленная", "двунаправленная", "рефлексивная"] as const;

/** has_reflexive денормализован (graph-parser 1.4): пересчёт по рёбрам
 *  затронутых категорий после смены направления/удаления ребра. */
async function recomputeReflexive(
  synthesisId: string,
  categoryIds: readonly string[],
  tx: DbLike = db,
): Promise<boolean> {
  const ids = [...new Set(categoryIds)];
  if (!ids.length) return false;
  const edges = await tx
    .select({ s: categoryEdges.sourceId, t: categoryEdges.targetId, dir: categoryEdges.direction })
    .from(categoryEdges)
    .where(eq(categoryEdges.synthesisId, synthesisId));
  const reflexive = new Set<string>();
  for (const e of edges) {
    if (e.dir === "рефлексивная") {
      reflexive.add(e.s);
      reflexive.add(e.t);
    }
  }
  let changed = false;
  const cats = await tx
    .select({ id: categories.id, hr: categories.hasReflexive })
    .from(categories)
    .where(inArray(categories.id, ids));
  for (const c of cats) {
    const want = reflexive.has(c.id);
    if (want !== c.hr) {
      changed = true;
      await tx
        .update(categories)
        .set({ hasReflexive: want, updatedAt: new Date() })
        .where(eq(categories.id, c.id));
    }
  }
  return changed;
}

export async function updateCategoryEdge(
  synthesisId: string,
  edgeId: string,
  updates: unknown,
  opts: ElementUpdateOptions = {},
): Promise<UpdateEdgeResult> {
  if (!isObj(updates)) fail({ body: tl("server.elementEditor.objectExpected", "ожидается объект") });
  const d: Details = {};
  const patch: Partial<typeof categoryEdges.$inferInsert> = {};
  const set = <K extends keyof typeof patch>(k: K, v: (typeof patch)[K]) => {
    if (v !== undefined) patch[k] = v;
  };
  set("description", str(updates["description"], "description", d, { allowEmpty: true }));
  set("edgeType", str(updates["edgeType"], "edgeType", d, { allowEmpty: true, max: 200 }));
  if (updates["direction"] !== undefined) {
    const dir = updates["direction"];
    if (typeof dir !== "string" || !(DIRECTIONS as readonly string[]).includes(dir))
      d["direction"] = "одно из: " + DIRECTIONS.join(" | ");
    else set("direction", dir as (typeof DIRECTIONS)[number]);
  }
  set("strength", num(updates["strength"], "strength", d, 0, 1));
  set("certainty", num(updates["certainty"], "certainty", d, 0, 1));
  set("historicalSupport", num(updates["historicalSupport"], "historicalSupport", d, 0, 1));
  set("logicalNecessity", num(updates["logicalNecessity"], "logicalNecessity", d, 0, 1));
  set("innovationDegree", num(updates["innovationDegree"], "innovationDegree", d, 1, 5, true));
  set("contextDependency", num(updates["contextDependency"], "contextDependency", d, 0, 1));
  const tc = await catalogIdOrNull(updates["typeCatalogId"], "typeCatalogId", d, relationshipTypeCatalog);
  if (tc !== undefined) patch.typeCatalogId = tc;
  if (Object.keys(d).length) fail(d);
  if (Object.keys(patch).length === 0) fail({ body: tl("server.elementEditor.noFieldsToUpdate", "нет ни одного поля для обновления") });

  const { row, version, reflexiveChanged } = await db.transaction(async (tx) => {
    const before = await loadEdgeRow(synthesisId, edgeId, tx);
    const version = await createVersion(
      synthesisId, before.id, "edge", snapshotOf(before),
      opts.changeSource ?? "manual", tx, opts.origin ?? null,
    );
    const [row] = await tx
      .update(categoryEdges)
      .set({ ...patch, sourceOrigin: "manual" })
      .where(eq(categoryEdges.id, before.id))
      .returning();
    if (!row) throw new ElementEditorError("NOT_FOUND", tl("server.elementEditor.edgeNotFound", "Связь не найдена"));
    const reflexiveChanged =
      "direction" in patch
        ? await recomputeReflexive(synthesisId, [row.sourceId, row.targetId], tx)
        : false;
    return { row, version, reflexiveChanged };
  });

  const sync = emptySync();
  await renderTables(
    synthesisId,
    reflexiveChanged ? ["edges", "topology"] : ["edges"],
    sync,
  );
  const impact = await computeElementImpact("edge", row.id, synthesisId);
  return { edge: toEdgeDto(row), impact, version, htmlSync: sync };
}

/* ── createCategoryEdge (7.1) ────────────────────────────────────────── */

export interface CreateEdgeResult {
  edge: CategoryEdge;
  impact: ImpactAnalysis;
  htmlSync: HtmlSyncInfo;
}

/**
 * Создание связи (7.1, долг §12 5.4: EdgeEditor правил существующие,
 * концы менять нельзя было — «удалить и создать» без «создать»).
 * Вход: sourceId/targetId — категории ЭТОГО синтеза (иначе VALIDATION_ERROR,
 * details по полю); совпадение концов допустимо только у рефлексивной
 * связи; edgeType/direction/характеристики/typeCatalogId — как в PATCH,
 * незаданные берут дефолты схемы (strength 0.5 и т.д.). position —
 * следующий за максимальным. source_origin='manual'. Версии-снимка нет:
 * состояния «до» у новой строки не существует (в ответе version
 * отсутствует — отличие от PATCH/DELETE). Перерисовываются таблицы связей
 * (и топологии, если направление рефлексивное и has_reflexive изменился).
 */
export async function createCategoryEdge(
  synthesisId: string,
  input: unknown,
): Promise<CreateEdgeResult> {
  if (!isObj(input)) fail({ body: tl("server.elementEditor.objectExpected", "ожидается объект") });
  const d: Details = {};
  const values: Partial<typeof categoryEdges.$inferInsert> = {};
  const set = <K extends keyof typeof values>(k: K, v: (typeof values)[K]) => {
    if (v !== undefined) values[k] = v;
  };
  const idOf = (field: string): string | undefined => {
    const v = input[field];
    if (typeof v !== "string" || !/^[0-9a-f-]{36}$/i.test(v)) {
      d[field] = "ожидается id категории";
      return undefined;
    }
    return v;
  };
  const sourceId = idOf("sourceId");
  const targetId = idOf("targetId");
  set("description", str(input["description"], "description", d, { allowEmpty: true }));
  set("edgeType", str(input["edgeType"], "edgeType", d, { allowEmpty: true, max: 200 }));
  let direction: (typeof DIRECTIONS)[number] = "однонаправленная";
  if (input["direction"] !== undefined) {
    const dir = input["direction"];
    if (typeof dir !== "string" || !(DIRECTIONS as readonly string[]).includes(dir))
      d["direction"] = "одно из: " + DIRECTIONS.join(" | ");
    else direction = dir as (typeof DIRECTIONS)[number];
  }
  set("strength", num(input["strength"], "strength", d, 0, 1));
  set("certainty", num(input["certainty"], "certainty", d, 0, 1));
  set("historicalSupport", num(input["historicalSupport"], "historicalSupport", d, 0, 1));
  set("logicalNecessity", num(input["logicalNecessity"], "logicalNecessity", d, 0, 1));
  set("innovationDegree", num(input["innovationDegree"], "innovationDegree", d, 1, 5, true));
  set("contextDependency", num(input["contextDependency"], "contextDependency", d, 0, 1));
  const tc = await catalogIdOrNull(input["typeCatalogId"], "typeCatalogId", d, relationshipTypeCatalog);
  if (tc !== undefined) values.typeCatalogId = tc;
  if (sourceId && targetId && sourceId === targetId && direction !== "рефлексивная")
    d["targetId"] = "совпадение концов допустимо только у рефлексивной связи";
  if (Object.keys(d).length) fail(d);

  const { row, reflexiveChanged } = await db.transaction(async (tx) => {
    const ends = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.synthesisId, synthesisId),
          inArray(categories.id, [sourceId!, targetId!]),
        ),
      );
    const found = new Set(ends.map((e) => e.id));
    const dd: Details = {};
    if (!found.has(sourceId!)) dd["sourceId"] = "категория не найдена в этом синтезе";
    if (!found.has(targetId!)) dd["targetId"] = "категория не найдена в этом синтезе";
    if (Object.keys(dd).length) fail(dd);
    const [last] = await tx
      .select({ position: categoryEdges.position })
      .from(categoryEdges)
      .where(eq(categoryEdges.synthesisId, synthesisId))
      .orderBy(desc(categoryEdges.position))
      .limit(1);
    const [row] = await tx
      .insert(categoryEdges)
      .values({
        ...values,
        synthesisId,
        sourceId: sourceId!,
        targetId: targetId!,
        direction,
        position: (last?.position ?? -1) + 1,
        sourceOrigin: "manual",
      })
      .returning();
    if (!row) throw new ElementEditorError("NOT_FOUND", tl("server.elementEditor.edgeNotCreated", "Связь не создана"));
    const reflexiveChanged =
      direction === "рефлексивная"
        ? await recomputeReflexive(synthesisId, [row.sourceId, row.targetId], tx)
        : false;
    return { row, reflexiveChanged };
  });

  const sync = emptySync();
  await renderTables(synthesisId, reflexiveChanged ? ["edges", "topology"] : ["edges"], sync);
  const impact = await computeElementImpact("edge", row.id, synthesisId);
  return { edge: toEdgeDto(row), impact, htmlSync: sync };
}

/**
 * Удаление связи (edge case протокола 5.1 «удаление связи — impact на
 * подраздел «Таблица связей»»; эндпоинта в 03 §2.4 НЕТ — аддитивный
 * DELETE /syntheses/:id/edges/:edgeId, дыра доков). Версия-снимок
 * ('manual') остаётся — историю удалённого ребра видно по elementId.
 */
export interface DeleteEdgeResult {
  impact: ImpactAnalysis;
  version: ElementVersion;
  htmlSync: HtmlSyncInfo;
}

export async function deleteCategoryEdge(
  synthesisId: string,
  edgeId: string,
): Promise<DeleteEdgeResult> {
  const { before, version, reflexiveChanged } = await db.transaction(async (tx) => {
    const before = await loadEdgeRow(synthesisId, edgeId, tx);
    const version = await createVersion(
      synthesisId, before.id, "edge", snapshotOf(before), "manual", tx,
    );
    await tx.delete(categoryEdges).where(eq(categoryEdges.id, before.id));
    const reflexiveChanged = await recomputeReflexive(
      synthesisId, [before.sourceId, before.targetId], tx,
    );
    return { before, version, reflexiveChanged };
  });
  const sync = emptySync();
  await renderTables(
    synthesisId,
    reflexiveChanged ? ["edges", "topology"] : ["edges"],
    sync,
  );
  const impact = await computeElementImpact("edge", before.id, synthesisId);
  return { impact, version, htmlSync: sync };
}

/* ── updateThesis ────────────────────────────────────────────────────── */

export interface UpdateThesisResult {
  thesis: Thesis;
  impact: ImpactAnalysis;
  version: ElementVersion;
  htmlSync: HtmlSyncInfo;
}

const THESIS_TYPES = ["ontological", "epistemological", "ethical"] as const;

export async function updateThesis(
  synthesisId: string,
  thesisId: string,
  updates: unknown,
  opts: ElementUpdateOptions = {},
): Promise<UpdateThesisResult> {
  if (!isObj(updates)) fail({ body: tl("server.elementEditor.objectExpected", "ожидается объект") });
  const d: Details = {};
  const patch: Partial<typeof theses.$inferInsert> = {};
  const set = <K extends keyof typeof patch>(k: K, v: (typeof patch)[K]) => {
    if (v !== undefined) patch[k] = v;
  };
  set("formulation", str(updates["formulation"], "formulation", d));
  set("justification", str(updates["justification"], "justification", d, { allowEmpty: true }));
  set("noveltyDegree", str(updates["noveltyDegree"], "noveltyDegree", d, { allowEmpty: true, max: 200 }));
  if (updates["thesisType"] !== undefined) {
    const t = updates["thesisType"];
    if (typeof t !== "string" || !(THESIS_TYPES as readonly string[]).includes(t))
      d["thesisType"] = "одно из: " + THESIS_TYPES.join(" | ");
    else set("thesisType", t as (typeof THESIS_TYPES)[number]);
  }
  set("relatedCategories", strList(updates["relatedCategories"], "relatedCategories", d));
  if (Object.keys(d).length) fail(d);
  if (Object.keys(patch).length === 0) fail({ body: tl("server.elementEditor.noFieldsToUpdate", "нет ни одного поля для обновления") });

  const { before, row, version } = await db.transaction(async (tx) => {
    const before = await loadThesisRow(synthesisId, thesisId, tx);
    const version = await createVersion(
      synthesisId, before.id, "thesis", snapshotOf(before),
      opts.changeSource ?? "manual", tx, opts.origin ?? null,
    );
    const [row] = await tx
      .update(theses)
      .set({ ...patch, source: "manual", updatedAt: new Date() })
      .where(eq(theses.id, before.id))
      .returning();
    if (!row) throw new ElementEditorError("NOT_FOUND", tl("server.elementEditor.thesisNotFound", "Тезис не найден"));
    return { before, row, version };
  });

  const sync = emptySync();
  await renderTables(synthesisId, ["theses"], sync);

  // Поля вне таблицы: формулировка/обоснование в прозаическом абзаце
  if (("justification" in patch || "formulation" in patch) && !sync.sectionMissing) {
    await patchThesisParagraph(synthesisId, before, row, sync);
  }

  const impact = await computeElementImpact("thesis", row.id, synthesisId);
  return { thesis: toThesisDto(row), impact, version, htmlSync: sync };
}

/**
 * Точечная правка прозы тезиса в разделе theses; не найдено → pending.
 *
 * 12.2 (Д-36): сначала блок ВТОРОЙ модели по метке тезиса (<h5>Тезис О-1…,
 * абзац формулировки, абзац «Обоснование.»). В нём пишется ТОЛЬКО поле,
 * изменённое этой правкой: формулировка в прозе бывает переписана
 * относительно сводной таблицы, и правка одного обоснования не должна
 * затирать её табличной. Обоснование НЕ пишется (pending), если до правки в
 * БД оно было пусто, а в прозе есть: у концепций, импортированных до 12.2,
 * разбор абзац не читал — редактор показал человеку пустое поле, и запись
 * стёрла бы текст, которого он не видел. Блока нет — первая модель
 * («<strong>формулировка</strong> обоснование» одним абзацем), как прежде.
 */
async function patchThesisParagraph(
  synthesisId: string,
  before: ThesisRow,
  row: ThesisRow,
  sync: HtmlSyncInfo,
): Promise<void> {
  const [sec] = await db
    .select({ id: sections.id, html: sections.htmlContent })
    .from(sections)
    .where(and(eq(sections.synthesisId, synthesisId), eq(sections.key, "theses")))
    .limit(1);
  if (!sec) {
    sync.sectionMissing = true;
    return;
  }
  const label = row.label ?? String(row.thesisNum);
  const block = readThesisBlock(sec.html, label);
  if (block) {
    const formulationChanged = row.formulation !== before.formulation;
    const justificationChanged = row.justification !== before.justification;
    const proseUnknownToDb = before.justification === "" && block.justification !== "";
    const writeJustification = justificationChanged && !proseUnknownToDb;
    if (justificationChanged && proseUnknownToDb) sync.pending.push("thesis.justification");
    const patch = replaceThesisBlock(sec.html, label, {
      formulation: formulationChanged ? row.formulation : undefined,
      justification: writeJustification ? row.justification : undefined,
    });
    if (patch) {
      if (patch.patched.length) await writeSectionHtml(sec.id, patch.html);
      for (const f of patch.patched) sync.patched.push("thesis." + f);
      for (const f of patch.missing) sync.pending.push("thesis." + f);
    }
    return;
  }
  const patched = replaceThesisParagraph(
    sec.html,
    before.formulation,
    row.formulation,
    row.justification,
  );
  if (patched === null) {
    sync.pending.push("thesis.justification");
    return;
  }
  await writeSectionHtml(sec.id, patched);
  sync.patched.push("thesis.justification");
}

/* ── updateGlossaryTerm ──────────────────────────────────────────────── */

export interface UpdateGlossaryTermResult {
  term: GlossaryTerm;
  impact: ImpactAnalysis;
  version: ElementVersion;
  htmlSync: HtmlSyncInfo;
}

export async function updateGlossaryTerm(
  synthesisId: string,
  termId: string,
  updates: unknown,
  opts: ElementUpdateOptions = {},
): Promise<UpdateGlossaryTermResult> {
  if (!isObj(updates)) fail({ body: tl("server.elementEditor.objectExpected", "ожидается объект") });
  const d: Details = {};
  const patch: Partial<typeof glossaryTerms.$inferInsert> = {};
  const set = <K extends keyof typeof patch>(k: K, v: (typeof patch)[K]) => {
    if (v !== undefined) patch[k] = v;
  };
  set("term", str(updates["term"], "term", d, { max: 300 }));
  set("definition", str(updates["definition"], "definition", d, { allowEmpty: true }));
  set("termCategory", str(updates["termCategory"], "termCategory", d, { allowEmpty: true, max: 100 }));
  if (updates["extraColumns"] !== undefined) {
    const ec = updates["extraColumns"];
    if (!isObj(ec) || !Object.values(ec).every((v) => typeof v === "string"))
      d["extraColumns"] = "ожидается объект строка → строка";
    else set("extraColumns", ec as Record<string, string>);
  }
  if (Object.keys(d).length) fail(d);
  if (Object.keys(patch).length === 0) fail({ body: tl("server.elementEditor.noFieldsToUpdate", "нет ни одного поля для обновления") });

  const { before, row, version } = await db.transaction(async (tx) => {
    const before = await loadGlossaryRow(synthesisId, termId, tx);
    const version = await createVersion(
      synthesisId, before.id, "glossary_term", snapshotOf(before),
      opts.changeSource ?? "manual", tx, opts.origin ?? null,
    );
    const [row] = await tx
      .update(glossaryTerms)
      .set({ ...patch, source: "manual", updatedAt: new Date() })
      .where(eq(glossaryTerms.id, before.id))
      .returning();
    if (!row) throw new ElementEditorError("NOT_FOUND", tl("server.elementEditor.termNotFound", "Термин не найден"));
    return { before, row, version };
  });

  const sync = emptySync();
  await renderTables(synthesisId, ["glossary"], sync);
  // termCategory живёт в категорийных подразделах прозой — в HTML не отражается
  if ("termCategory" in patch && !sync.sectionMissing)
    sync.pending.push("glossary_term.termCategory");

  const impact = await computeElementImpact("glossary_term", row.id, synthesisId, [
    before.term,
    row.term,
  ]);
  return { term: toGlossaryDto(row), impact, version, htmlSync: sync };
}

/* ── autoRenameReferences ────────────────────────────────────────────── */

/**
 * autoRenameReferences(synthesisId, oldName, newName): замена oldName →
 * newName в html_content ВСЕХ разделов и капсуле (как отдельного слова;
 * кириллица — через lookaround \p{L}) и в theses.related_categories (п.4
 * правки 2026-09-02). РАСШИРЕНИЕ против буквы 03 §2.4 (найдено тестами
 * 5.1): имя переписывается и в ТЕКСТОВЫХ полях гранулярных строк —
 * theses.formulation/justification, glossary_terms.term/definition/
 * extra_columns, categories.definition/origin, category_edges.description.
 * Иначе auto-rename сам создаёт рассинхрон БД ↔ HTML: сводная таблица
 * тезисов в html_content уже говорит «Существование есть …», а строка
 * theses — по-прежнему «Бытие есть …», и следующая правка тезиса не
 * находит свой абзац. Каждая затронутая строка — версия
 * changeSource='auto_rename'. Отдельный вызов, а не побочный эффект PATCH.
 */
export async function autoRenameReferences(
  synthesisId: string,
  oldName: string,
  newName: string,
): Promise<AutoRenameResult> {
  const d: Details = {};
  const o = str(oldName, "oldName", d, { max: 300 });
  const n = str(newName, "newName", d, { max: 300 });
  if (Object.keys(d).length || !o || !n) fail(d);
  if (o === n) fail({ newName: tl("server.elementEditor.sameAsOldName", "совпадает с oldName") });
  const re = nameRegex(o);
  if (!re) fail({ oldName: tl("server.elementEditor.nameTooShort", "слишком короткое имя") });

  return db.transaction(async (tx) => {
    const secRows = await tx
      .select()
      .from(sections)
      .where(eq(sections.synthesisId, synthesisId))
      .orderBy(asc(sections.sectionNum));
    const affectedSections: string[] = [];
    for (const s of secRows) {
      re.lastIndex = 0;
      if (!re.test(s.htmlContent)) continue;
      re.lastIndex = 0;
      const html = s.htmlContent.replace(re, n);
      await createVersion(synthesisId, s.id, "section", snapshotOf(s), "auto_rename", tx);
      await tx
        .update(sections)
        .set({ htmlContent: html, isEdited: true, updatedAt: new Date() })
        .where(eq(sections.id, s.id));
      affectedSections.push(s.key);
    }

    // Капсула живёт в syntheses.capsule_html (не среди тел разделов)
    const [synth] = await tx
      .select({ capsule: syntheses.capsuleHtml })
      .from(syntheses)
      .where(eq(syntheses.id, synthesisId))
      .limit(1);
    if (synth) {
      re.lastIndex = 0;
      if (re.test(synth.capsule)) {
        re.lastIndex = 0;
        await tx
          .update(syntheses)
          .set({ capsuleHtml: synth.capsule.replace(re, n), updatedAt: new Date() })
          .where(eq(syntheses.id, synthesisId));
        if (!affectedSections.includes("capsule")) affectedSections.push("capsule");
      }
    }

    const sub = (text: string): string => {
      re.lastIndex = 0;
      return text.replace(re, n);
    };

    const thRows = await tx
      .select()
      .from(theses)
      .where(eq(theses.synthesisId, synthesisId));
    let affectedTheses = 0;
    for (const t of thRows) {
      const rc = t.relatedCategories.map(sub);
      const formulation = sub(t.formulation);
      const justification = sub(t.justification);
      const changed =
        rc.some((c, i) => c !== t.relatedCategories[i]) ||
        formulation !== t.formulation ||
        justification !== t.justification;
      if (!changed) continue;
      await createVersion(synthesisId, t.id, "thesis", snapshotOf(t), "auto_rename", tx);
      await tx
        .update(theses)
        .set({ relatedCategories: rc, formulation, justification, updatedAt: new Date() })
        .where(eq(theses.id, t.id));
      affectedTheses++;
    }

    // Глоссарий: term/definition/extra_columns
    const glRows = await tx
      .select()
      .from(glossaryTerms)
      .where(eq(glossaryTerms.synthesisId, synthesisId));
    for (const gRow of glRows) {
      const term = sub(gRow.term);
      const definition = sub(gRow.definition);
      const extra: Record<string, string> = {};
      let extraChanged = false;
      for (const [k, v] of Object.entries(gRow.extraColumns)) {
        extra[k] = sub(v);
        if (extra[k] !== v) extraChanged = true;
      }
      if (term === gRow.term && definition === gRow.definition && !extraChanged) continue;
      await createVersion(synthesisId, gRow.id, "glossary_term", snapshotOf(gRow), "auto_rename", tx);
      await tx
        .update(glossaryTerms)
        .set({ term, definition, extraColumns: extra, updatedAt: new Date() })
        .where(eq(glossaryTerms.id, gRow.id));
    }

    // Категории (definition/origin; name правится PATCH'ем) и описания связей
    const catRows = await tx
      .select()
      .from(categories)
      .where(eq(categories.synthesisId, synthesisId));
    for (const cRow of catRows) {
      const definition = sub(cRow.definition);
      const origin = sub(cRow.origin);
      if (definition === cRow.definition && origin === cRow.origin) continue;
      await createVersion(synthesisId, cRow.id, "category", snapshotOf(cRow), "auto_rename", tx);
      await tx
        .update(categories)
        .set({ definition, origin, updatedAt: new Date() })
        .where(eq(categories.id, cRow.id));
    }
    const edgeRows = await tx
      .select()
      .from(categoryEdges)
      .where(eq(categoryEdges.synthesisId, synthesisId));
    for (const eRow of edgeRows) {
      const description = sub(eRow.description);
      if (description === eRow.description) continue;
      await createVersion(synthesisId, eRow.id, "edge", snapshotOf(eRow), "auto_rename", tx);
      await tx
        .update(categoryEdges)
        .set({ description })
        .where(eq(categoryEdges.id, eRow.id));
    }
    return { affectedSections, affectedTheses };
  });
}

/* ── rollback (обёртка над versioning: перерисовка + impact) ─────────── */

export interface RollbackElementResult {
  element: unknown;
  version: ElementVersion;
  impact: ImpactAnalysis;
  htmlSync: HtmlSyncInfo;
  /** 12.1 (Д-14): признак «капсула обновлена» — откат версии капсулы вернул и
   *  syntheses.capsule_html (шапка документа); у прочих откатов false */
  capsuleUpdated: boolean;
  /** Новое значение капсулы — только при capsuleUpdated */
  capsuleHtml?: string | undefined;
}

const TABLES_BY_TYPE: Partial<Record<VersionedElementType, RenderableTable[]>> = {
  category: ["categories", "edges", "topology"],
  edge: ["edges", "topology"],
  thesis: ["theses"],
  glossary_term: ["glossary"],
};

/**
 * Откат элемента к версии (03 §2.4 POST .../rollback): versioning
 * восстанавливает данные и пишет версию 'rollback'; здесь — перерисовка
 * таблиц и impact. Для 'section' восстанавливается html_content целиком
 * (снимок auto_rename), таблиц не перерисовываем; 'dialogue_turn' в HTML
 * не отображается. 12.1 (Д-14): откат версии КАПСУЛЫ (строка sections
 * 'capsule' либо, после импорта, версия на id синтеза) возвращает и
 * syntheses.capsule_html — ответ несёт capsuleUpdated и capsuleHtml.
 */
export async function rollbackElement(
  synthesisId: string,
  elementType: VersionedElementType,
  elementId: string,
  version: number,
): Promise<RollbackElementResult> {
  const res = await rollbackToVersion(synthesisId, elementType, elementId, version);
  const sync = emptySync();
  const tables = TABLES_BY_TYPE[elementType];
  if (tables) {
    if (elementType === "edge") {
      const e = res.element as EdgeRow;
      await recomputeReflexive(synthesisId, [e.sourceId, e.targetId]);
    }
    await renderTables(synthesisId, tables, sync);
  }
  let impact: ImpactAnalysis = {
    affectedSections: [],
    affectedSubsections: [],
    affectedModes: [],
    severity: "none",
  };
  if (elementType === "category" || elementType === "edge" || elementType === "thesis" || elementType === "glossary_term") {
    const el = res.element as Record<string, unknown>;
    const name =
      elementType === "category"
        ? (el["name"] as string)
        : elementType === "glossary_term"
          ? (el["term"] as string)
          : null;
    impact = await computeElementImpact(elementType, elementId, synthesisId, [name]);
  }
  const element =
    elementType === "category"
      ? toCategoryDto(res.element as CategoryRow)
      : elementType === "edge"
        ? toEdgeDto(res.element as EdgeRow)
        : elementType === "thesis"
          ? toThesisDto(res.element as ThesisRow)
          : elementType === "glossary_term"
            ? toGlossaryDto(res.element as GlossaryRow)
            : snapshotOf(res.element);
  return {
    element,
    version: res.version,
    impact,
    htmlSync: sync,
    capsuleUpdated: res.capsuleHtml !== undefined,
    ...(res.capsuleHtml !== undefined ? { capsuleHtml: res.capsuleHtml } : {}),
  };
}

/* ── Капсула (п.14: PATCH /syntheses/:id/capsule) ────────────────────── */

export interface UpdateCapsuleResult {
  capsuleHtml: string;
  version: ElementVersion;
}

/**
 * Капсула живёт в syntheses.capsule_html; строка sections 'capsule'
 * (если есть — генерация 1.4 её сохраняет, импорт 4.3 — нет) держится в
 * синхроне. Версия — elementType 'section' с elementId строки sections
 * 'capsule', либо id синтеза, когда строки нет.
 */
export async function updateCapsule(
  synthesisId: string,
  html: unknown,
): Promise<UpdateCapsuleResult> {
  if (typeof html !== "string" || !html.trim())
    fail({ html: tl("server.elementEditor.htmlStringExpected", "ожидается непустая HTML-строка") });
  const value = html.trim();
  return db.transaction(async (tx) => {
    const [synth] = await tx
      .select({ id: syntheses.id, capsule: syntheses.capsuleHtml })
      .from(syntheses)
      .where(eq(syntheses.id, synthesisId))
      .limit(1);
    if (!synth) throw new ElementEditorError("NOT_FOUND", tl("common.synthesisNotFound", "Синтез не найден"));
    const [capRow] = await tx
      .select()
      .from(sections)
      .where(and(eq(sections.synthesisId, synthesisId), eq(sections.key, "capsule")))
      .limit(1);
    const version = await createVersion(
      synthesisId,
      capRow?.id ?? synthesisId,
      "section",
      capRow
        ? snapshotOf(capRow)
        : { key: "capsule", htmlContent: synth.capsule, title: KEY_LABELS["capsule"] ?? tl("common.capsule", "Капсула") },
      "manual",
      tx,
    );
    await tx
      .update(syntheses)
      .set({ capsuleHtml: value, updatedAt: new Date() })
      .where(eq(syntheses.id, synthesisId));
    if (capRow)
      await tx
        .update(sections)
        .set({ htmlContent: value, isEdited: true, updatedAt: new Date() })
        .where(eq(sections.id, capRow.id));
    return { capsuleHtml: value, version };
  });
}

/* ── Ручная правка подраздела (беседа 9.2) ───────────────────────────── */

/** Имя подраздела-капсулы: у неё свой путь правки с 5.1 (PATCH /capsule). */
export const CAPSULE_SUBSECTION = "Капсула";

export type SubsectionLockReason = "table" | "capsule";

export interface SubsectionLock {
  reason: SubsectionLockReason;
  /** Чья таблица заперла подраздел (reason 'table') */
  table?: RenderableTable | undefined;
  /** Чем править вместо ручной правки — текст для человека */
  hint: string;
}

const TABLE_LOCK_HINT: Readonly<Record<RenderableTable, string>> = {
  categories:
    "Таблицу категорий служба рисует из графа: правьте категорию в панели узла графа («◈ Граф» → узел → «✎ Редактировать»)",
  edges:
    "Таблицу связей служба рисует из графа: правьте связь в панели связи графа («◈ Граф» → связь → «✎ Редактировать»)",
  topology:
    "Топологическую таблицу служба рисует из графа: роли и кластеры правятся в панели узла графа («◈ Граф» → узел → «✎ Редактировать»)",
  theses:
    "Сводную таблицу тезисов служба рисует из списка тезисов: правьте тезис карандашом ✎ в его строке таблицы",
  glossary:
    "Таблицу определений служба рисует из списка терминов: правьте термин карандашом ✎ в его строке таблицы",
};

const CAPSULE_LOCK_HINT =
  "У капсулы свой путь правки: карандаш ✎ у капсулы в шапке документа (PATCH /syntheses/:id/capsule)";

/**
 * Заперт ли подраздел и чем его править. Таблицы — вычисляемым заслоном
 * (lockedSubsectionsOf: куда попал локатор рендерера в ТЕКУЩЕМ HTML);
 * капсула — по ключу раздела либо имени подраздела.
 */
export function subsectionLockOf(
  sectionKey: string,
  sectionHtml: string,
  subsectionName: string,
): SubsectionLock | null {
  if (sectionKey === "capsule" || subsectionName === CAPSULE_SUBSECTION)
    return { reason: "capsule", hint: CAPSULE_LOCK_HINT };
  const hit = lockedSubsectionsOf(sectionKey, sectionHtml).find(
    (l) => l.subsection === subsectionName,
  );
  return hit ? { reason: "table", table: hit.table, hint: TABLE_LOCK_HINT[hit.table] } : null;
}

/** Имена запертых подразделов раздела — клиенту, чтобы не рисовать карандаш. */
export function lockedSubsectionNames(sectionKey: string, sectionHtml: string): string[] {
  const names = lockedSubsectionsOf(sectionKey, sectionHtml).map((l) => l.subsection);
  if (sectionKey === "capsule") return listSubsectionNames(sectionHtml);
  if (sectionHtml.includes(`data-section="${CAPSULE_SUBSECTION}"`) && !names.includes(CAPSULE_SUBSECTION))
    names.push(CAPSULE_SUBSECTION);
  return names;
}

export type SubsectionEditErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "SECTION_TABLE_LOCKED";

export class SubsectionEditError extends Error {
  constructor(
    public readonly code: SubsectionEditErrorCode,
    message: string,
    public readonly details?: Record<string, unknown> | undefined,
  ) {
    super(message);
    this.name = "SubsectionEditError";
  }
}

export interface SubsectionSourceResult {
  sectionKey: string;
  name: string;
  /** Разметка содержимого без обёртки и <h4> — то, что уходит в поле правки */
  html: string;
  nested: string[];
  lock: SubsectionLock | null;
}

export interface UpdateSubsectionResult {
  sectionKey: string;
  name: string;
  /** false — присланное совпало с текущим, версия не создана */
  changed: boolean;
  /** HTML раздела ПОСЛЕ правки */
  htmlContent: string;
  version: ElementVersion | null;
  /** Что снято чисткой разметки + (12.1) что не сведено со списком тезисов
   *  и почему название концепции не тронуто — всё, что человек обязан узнать */
  warnings: string[];
  /** 12.1 (Д-3): тезисы, чьи formulation/justification обновлены по прозе */
  thesesUpdated: ThesisProseUpdate[];
  /** 12.1 (Д-4): новое название концепции — только если оно обновлено */
  titleUpdated?: string | undefined;
}

/* ── Сведение прозы тезисов со списком (12.1, Д-3) ───────────────────── */

export interface ThesisProseUpdate {
  id: string;
  /** Как тезис назван в документе: метка либо номер */
  label: string;
  fields: ("formulation" | "justification")[];
}

/** Строка тезиса в объёме, нужном сведению (чистое ядро не знает о БД). */
export interface ThesisProseRow {
  id: string;
  thesisNum: number;
  label: string | null;
  formulation: string;
  justification: string;
}

export interface ThesisProsePlan {
  updates: { row: ThesisProseRow; formulation?: string; justification?: string }[];
  warnings: string[];
}

const proseNorm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();
const proseQuote = (s: string): string => (s.length > 70 ? s.slice(0, 67).trimEnd() + "…" : s);
const thesisNameOf = (r: { label: string | null; thesisNum: number }): string =>
  r.label ?? "№" + String(r.thesisNum);

/**
 * Что из правки прозы подраздела переносится в строки theses (чистая функция).
 *
 * before / after — абзацы «<strong>формулировка</strong> обоснование» ОДНОГО
 * подраздела до и после правки (parseThesisParagraphs). Правила:
 *  - 12.2 (Д-36): абзац ВТОРОЙ модели (несёт `heading` — текст <h5> блока)
 *    сводится с тезисом по МЕТКЕ в заголовке (theses.label либо номер), а не
 *    по формулировке — в прозе она бывает переписана относительно таблицы;
 *    «точным» такое сведение считается, только если формулировка абзаца
 *    равна табличной; с абзацем after — по неизменному заголовку блока;
 *  - тезис «живёт» в абзаце before, чья формулировка совпала с theses.formulation
 *    (сначала точно, затем включением в любую сторону — как индекс 1.4);
 *  - абзац after сводится с абзацем before по неизменной формулировке, а если
 *    формулировку правили — по месту (только при том же числе абзацев);
 *  - переносится ТОЛЬКО изменённое этой правкой: абзац, который человек не
 *    трогал, не сверяется с БД вовсе — иначе обоснование, изменённое редактором
 *    5.2 и не отражённое в прозе (htmlSync.pending), затёрлось бы старой прозой
 *    при правке соседнего абзаца (та же тихая потеря, зеркально);
 *  - новая формулировка пишется, только если до правки абзац совпадал с тезисом
 *    ТОЧНО; при нечётком совпадении — предупреждение, обоснование переносится;
 *  - абзац без тезиса (новый либо изменённый, но не сведённый) и тезис, чей
 *    абзац пропал, — предупреждение, строки theses не заводятся и не удаляются.
 */
export function planThesisProseSync(
  rows: readonly ThesisProseRow[],
  before: readonly ThesisParagraph[],
  after: readonly ThesisParagraph[],
): ThesisProsePlan {
  const plan: ThesisProsePlan = { updates: [], warnings: [] };
  // 1. Тезис → абзац «до»: точное совпадение формулировки, затем включение
  const rowOfBefore = new Map<number, { row: ThesisProseRow; exact: boolean }>();
  const taken = new Set<string>();
  // 0. Вторая модель: блок → тезис по метке в <h5> (метка раньше — тезис вернее)
  before.forEach((b, i) => {
    if (!b.heading) return;
    let best: ThesisProseRow | null = null;
    let bestIdx = Infinity;
    for (const r of rows) {
      if (taken.has(r.id)) continue;
      const at = thesisLabelIndex(b.heading, r.label ?? String(r.thesisNum));
      if (at >= 0 && at < bestIdx) {
        best = r;
        bestIdx = at;
      }
    }
    if (!best) return;
    taken.add(best.id);
    rowOfBefore.set(i, {
      row: best,
      exact: proseNorm(b.formulation) === proseNorm(best.formulation),
    });
  });
  for (const exact of [true, false]) {
    before.forEach((b, i) => {
      if (rowOfBefore.has(i)) return;
      if (b.heading && !b.formulation) return; // блок без абзаца формулировки — только по метке
      const key = proseNorm(b.formulation);
      const row = rows.find((r) => {
        if (taken.has(r.id)) return false;
        const f = proseNorm(r.formulation);
        return exact ? f === key : f.length >= 8 && (f.includes(key) || key.includes(f));
      });
      if (!row) return;
      taken.add(row.id);
      rowOfBefore.set(i, { row, exact });
    });
  }
  // 2. Абзац «до» → абзац «после»: по формулировке, затем по месту
  const afterOfBefore = new Map<number, number>();
  const claimed = new Set<number>();
  // Вторая модель: по неизменному заголовку блока
  before.forEach((b, i) => {
    if (!b.heading) return;
    const key = proseNorm(b.heading);
    const j = after.findIndex((a, k) => !claimed.has(k) && !!a.heading && proseNorm(a.heading) === key);
    if (j >= 0) {
      claimed.add(j);
      afterOfBefore.set(i, j);
    }
  });
  before.forEach((b, i) => {
    if (afterOfBefore.has(i)) return;
    const key = proseNorm(b.formulation);
    if (!key) return; // блок без абзаца формулировки сводится только по заголовку
    const j = after.findIndex((a, k) => !claimed.has(k) && proseNorm(a.formulation) === key);
    if (j >= 0) {
      claimed.add(j);
      afterOfBefore.set(i, j);
    }
  });
  if (after.length === before.length)
    before.forEach((_b, i) => {
      if (afterOfBefore.has(i) || claimed.has(i)) return;
      claimed.add(i);
      afterOfBefore.set(i, i);
    });
  // 3. Изменённые абзацы
  before.forEach((b, i) => {
    const hit = rowOfBefore.get(i);
    const j = afterOfBefore.get(i);
    if (j === undefined) {
      if (hit)
        plan.warnings.push(
          tl("server.elementEditor.thesisParagraphLost", "Абзац тезиса {thesis} после правки не найден — тезис в списке тезисов не изменён и не удалён", { thesis: thesisNameOf(hit.row) }),
        );
      return;
    }
    const a = after[j]!;
    const formulationChanged = proseNorm(a.formulation) !== proseNorm(b.formulation);
    const justificationChanged = a.justification !== b.justification;
    if (!formulationChanged && !justificationChanged) return;
    if (!hit) {
      plan.warnings.push(
        tl("server.elementEditor.paragraphWithoutThesis", "Абзац «{paragraph}» изменён, но ни с одним тезисом списка не сведён — список тезисов не обновлён", { paragraph: proseQuote(a.formulation || a.heading || "") }),
      );
      return;
    }
    const upd: ThesisProsePlan["updates"][number] = { row: hit.row };
    if (justificationChanged && a.justification !== hit.row.justification) upd.justification = a.justification;
    if (formulationChanged) {
      if (hit.exact) upd.formulation = a.formulation;
      else
        plan.warnings.push(
          tl("server.elementEditor.thesisFormulationFuzzy", "Формулировка тезиса {thesis} в прозе изменена, но с тезисом она сведена нечётко — формулировка в списке тезисов не обновлена (правьте её карандашом ✎ в строке сводной таблицы)", { thesis: thesisNameOf(hit.row) }),
        );
    }
    if (upd.formulation !== undefined || upd.justification !== undefined) plan.updates.push(upd);
  });
  // 4. Новые абзацы «после»
  after.forEach((a, j) => {
    if (claimed.has(j)) return;
    plan.warnings.push(
      tl("server.elementEditor.newParagraphNotThesis", "Абзац «{paragraph}» не сведён ни с одним тезисом — в список тезисов он не попал (новый тезис заводится перегенерацией раздела)", { paragraph: proseQuote(a.formulation || a.heading || "") }),
    );
  });
  return plan;
}

function subsectionNotFound(sectionHtml: string, name: string): SubsectionEditError {
  return new SubsectionEditError(
    "NOT_FOUND",
    tl("server.elementEditor.subsectionNotFound", "Подраздел «{name}» не найден", { name }),
    { available: listSubsectionNames(sectionHtml) },
  );
}

/** Исходник правки: то, что клиент кладёт в поле, и замок, если он есть. */
export async function getSubsectionSource(
  synthesisId: string,
  sectionKey: string,
  subsectionName: string,
): Promise<SubsectionSourceResult> {
  if (sectionKey === "capsule" || subsectionName === CAPSULE_SUBSECTION)
    return {
      sectionKey,
      name: subsectionName,
      html: "",
      nested: [],
      lock: { reason: "capsule", hint: CAPSULE_LOCK_HINT },
    };
  const [row] = await db
    .select({ html: sections.htmlContent })
    .from(sections)
    .where(and(eq(sections.synthesisId, synthesisId), eq(sections.key, sectionKey)))
    .limit(1);
  if (!row) throw new SubsectionEditError("NOT_FOUND", tl("common.sectionNotFound", "Раздел не найден"));
  const source = readSubsectionSource(row.html, subsectionName);
  if (!source) throw subsectionNotFound(row.html, subsectionName);
  return {
    sectionKey,
    name: source.name,
    html: source.html,
    nested: source.nested,
    lock: subsectionLockOf(sectionKey, row.html, subsectionName),
  };
}

/**
 * Ручная правка содержимого ОДНОГО подраздела — обобщение updateCapsule:
 * версия "section" со снимком строки ДО правки и источником "manual",
 * запись html_content и is_edited=true — одной транзакцией. Обёртка,
 * data-section и <h4> не трогаются (replaceSubsectionContent). Тело раздела
 * целиком не правится ни одной функцией — намеренно (07, беседа 9.2).
 *
 * Побочные эффекты раздела (applySectionSideEffects 2.2) НЕ вызываются:
 * для graph/theses/glossary они ЗАМЕНЯЮТ гранулярные строки (новые id —
 * версии и обогащения элементов осиротели бы), а их таблицы и так заперты.
 */
export async function updateSubsection(
  synthesisId: string,
  sectionKey: string,
  subsectionName: string,
  html: unknown,
): Promise<UpdateSubsectionResult> {
  if (typeof html !== "string")
    throw new SubsectionEditError("VALIDATION_ERROR", tl("common.invalidData", "Невалидные данные"), {
      html: tl("server.elementEditor.markupStringExpected", "ожидается строка с разметкой подраздела"),
    });
  // Капсула — ДО поиска: после импорта (4.3) строки sections 'capsule' нет
  // вовсе, и 404 вместо «у капсулы свой путь» увёл бы человека искать не там
  if (sectionKey === "capsule" || subsectionName === CAPSULE_SUBSECTION)
    throw new SubsectionEditError("SECTION_TABLE_LOCKED", CAPSULE_LOCK_HINT, {
      reason: "capsule",
      subsection: subsectionName,
    });
  const saved = await db.transaction(async (tx): Promise<UpdateSubsectionResult & { rerenderTheses: boolean }> => {
    const [row] = await tx
      .select()
      .from(sections)
      .where(and(eq(sections.synthesisId, synthesisId), eq(sections.key, sectionKey)))
      .limit(1)
      .for("update");
    if (!row) throw new SubsectionEditError("NOT_FOUND", tl("common.sectionNotFound", "Раздел не найден"));
    if (!readSubsectionSource(row.htmlContent, subsectionName))
      throw subsectionNotFound(row.htmlContent, subsectionName);
    const lock = subsectionLockOf(sectionKey, row.htmlContent, subsectionName);
    if (lock)
      throw new SubsectionEditError("SECTION_TABLE_LOCKED", lock.hint, {
        reason: lock.reason,
        ...(lock.table ? { table: lock.table } : {}),
        subsection: subsectionName,
      });
    let result;
    try {
      result = replaceSubsectionContent(row.htmlContent, subsectionName, html);
    } catch (err) {
      if (err instanceof SubsectionHtmlError)
        throw new SubsectionEditError("VALIDATION_ERROR", tl("common.invalidData", "Невалидные данные"), {
          html: err.message,
          problem: err.problem,
        });
      throw err;
    }
    if (!result) throw subsectionNotFound(row.htmlContent, subsectionName);
    if (!result.changed)
      return {
        sectionKey,
        name: subsectionName,
        changed: false,
        htmlContent: row.htmlContent,
        version: null,
        warnings: [],
        thesesUpdated: [],
        rerenderTheses: false,
      };
    // Заслон после врезки: правка не должна ни сдвинуть замки, ни потерять
    // подраздел (страховка от собственной ошибки врезки, не от человека)
    const before = listSubsectionNames(row.htmlContent);
    const after = listSubsectionNames(result.html);
    if (before.length !== after.length || before.some((n, i) => n !== after[i]))
      throw new SubsectionEditError("VALIDATION_ERROR", tl("common.invalidData", "Невалидные данные"), {
        html: tl("server.elementEditor.subsectionsChanged", "правка изменила состав подразделов раздела — не сохранено"),
      });
    const version = await createVersion(
      synthesisId,
      row.id,
      "section",
      snapshotOf(row),
      "manual",
      tx,
    );
    await tx
      .update(sections)
      .set({ htmlContent: result.html, isEdited: true, updatedAt: new Date() })
      .where(eq(sections.id, row.id));
    const warnings = [...result.warnings];

    // 12.1 (Д-3): проза тезисов → строки theses, ТОЧЕЧНО. applySectionSideEffects
    // по-прежнему не зовётся: он заменил бы строки (новые id — версии и
    // обогащения тезисов осиротели бы, «По факту 9.2» п.10)
    const thesesUpdated: ThesisProseUpdate[] = [];
    let rerenderTheses = false;
    if (sectionKey === "theses") {
      const rows = await tx
        .select()
        .from(theses)
        .where(eq(theses.synthesisId, synthesisId))
        .orderBy(asc(theses.thesisNum));
      const plan = planThesisProseSync(
        rows,
        parseThesisParagraphs(readSubsectionSource(row.htmlContent, subsectionName)?.html ?? ""),
        parseThesisParagraphs(readSubsectionSource(result.html, subsectionName)?.html ?? ""),
      );
      for (const u of plan.updates) {
        const cur = rows.find((r) => r.id === u.row.id);
        if (!cur) continue;
        await createVersion(synthesisId, cur.id, "thesis", snapshotOf(cur), "manual", tx);
        await tx
          .update(theses)
          .set({
            ...(u.formulation !== undefined ? { formulation: u.formulation } : {}),
            ...(u.justification !== undefined ? { justification: u.justification } : {}),
            source: "manual",
            updatedAt: new Date(),
          })
          .where(eq(theses.id, cur.id));
        thesesUpdated.push({
          id: cur.id,
          label: thesisNameOf(cur),
          fields: [
            ...(u.formulation !== undefined ? (["formulation"] as const) : []),
            ...(u.justification !== undefined ? (["justification"] as const) : []),
          ],
        });
        if (u.formulation !== undefined) rerenderTheses = true;
      }
      warnings.push(...plan.warnings);
    }

    // 12.1 (Д-4): название концепции из раздела name — только если владелец
    // не переименовывал её отдельно (✎ 8.4): текущее название обязано
    // совпадать с тем, что раздел давал ДО правки
    let titleUpdated: string | undefined;
    const synthPatch: { updatedAt: Date; title?: string } = { updatedAt: new Date() };
    if (sectionKey === "name") {
      const titleBefore = extractTitleFromNameHtml(row.htmlContent);
      const titleAfter = extractTitleFromNameHtml(result.html);
      if (titleAfter && titleAfter !== titleBefore) {
        const [synth] = await tx
          .select({ title: syntheses.title })
          .from(syntheses)
          .where(eq(syntheses.id, synthesisId))
          .limit(1)
          .for("update");
        if (titleAfter.length > SYNTHESIS_TITLE_MAX)
          warnings.push(
            tl("server.elementEditor.titleTooLong", "Название в разделе длиннее {max} знаков — название концепции не обновлено", { max: SYNTHESIS_TITLE_MAX }),
          );
        else if (synth && titleBefore !== null && synth.title === titleBefore) {
          synthPatch.title = titleAfter;
          titleUpdated = titleAfter;
        } else if (synth && synth.title !== titleAfter)
          warnings.push(
            tl("server.elementEditor.titleKeptRenamed", "Название в разделе теперь «{sectionTitle}», но концепция названа отдельно («{title}») — её название не тронуто", { sectionTitle: titleAfter, title: synth.title }),
          );
      }
    }
    await tx
      .update(syntheses)
      .set(synthPatch)
      .where(eq(syntheses.id, synthesisId));
    return {
      sectionKey,
      name: subsectionName,
      changed: true,
      htmlContent: result.html,
      version,
      warnings,
      thesesUpdated,
      ...(titleUpdated !== undefined ? { titleUpdated } : {}),
      rerenderTheses,
    };
  });
  const { rerenderTheses, ...out } = saved;
  if (rerenderTheses) {
    // Формулировка стоит и в «Сводной таблице тезисов» — её рисует рендерер 5.1
    // (вне транзакции: applyElementUpdateToHtml читает зафиксированные строки)
    const res = await applyElementUpdateToHtml(synthesisId, "theses");
    if (res.updated) {
      const [fresh] = await db
        .select({ html: sections.htmlContent })
        .from(sections)
        .where(and(eq(sections.synthesisId, synthesisId), eq(sections.key, sectionKey)))
        .limit(1);
      if (fresh) out.htmlContent = fresh.html;
    }
  }
  return out;
}

/** Предел длины названия концепции — тот же, что у PATCH /syntheses/:id (03 §2.2). */
const SYNTHESIS_TITLE_MAX = 300;
