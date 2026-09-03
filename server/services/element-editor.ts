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
import { and, asc, eq, inArray } from "drizzle-orm";

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
  replaceThesisParagraph,
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
import { buildEditInfra, loadSynthesis } from "./generation-service.js";
import { buildSubsectionMap } from "./section-defs-builder.js";

import type {
  AutoRenameResult,
  CategoryUpdateInput,
  EdgeUpdateInput,
  ElementVersion,
  GlossaryTermUpdateInput,
  HtmlSyncInfo,
  ImpactAnalysis,
  ThesisUpdateInput,
  VersionedElementType,
} from "@philosynth/shared/types/elements";
import type { Category, CategoryEdge } from "@philosynth/shared/types/graph";
import type { GlossaryTerm, Thesis } from "@philosynth/shared/types/elements";

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
  throw new ElementEditorError("VALIDATION_ERROR", "Невалидные данные", details);
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
  if (!row) throw new ElementEditorError("NOT_FOUND", "Категория не найдена");
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
  if (!row) throw new ElementEditorError("NOT_FOUND", "Связь не найдена");
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
  if (!row) throw new ElementEditorError("NOT_FOUND", "Тезис не найден");
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
  if (!row) throw new ElementEditorError("NOT_FOUND", "Термин не найден");
  return row;
}

/* ── Синхронизация с HTML ────────────────────────────────────────────── */

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
): Promise<UpdateCategoryResult> {
  if (!isObj(updates)) fail({ body: "ожидается объект" });
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
  if (Object.keys(patch).length === 0) fail({ body: "нет ни одного поля для обновления" });

  const { before, row, version } = await db.transaction(async (tx) => {
    const before = await loadCategoryRow(synthesisId, categoryId, tx);
    const version = await createVersion(
      synthesisId, before.id, "category", snapshotOf(before), "manual", tx,
    );
    const [row] = await tx
      .update(categories)
      .set({ ...patch, source: "manual", updatedAt: new Date() })
      .where(eq(categories.id, before.id))
      .returning();
    if (!row) throw new ElementEditorError("NOT_FOUND", "Категория не найдена");
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
): Promise<UpdateEdgeResult> {
  if (!isObj(updates)) fail({ body: "ожидается объект" });
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
  if (Object.keys(patch).length === 0) fail({ body: "нет ни одного поля для обновления" });

  const { row, version, reflexiveChanged } = await db.transaction(async (tx) => {
    const before = await loadEdgeRow(synthesisId, edgeId, tx);
    const version = await createVersion(
      synthesisId, before.id, "edge", snapshotOf(before), "manual", tx,
    );
    const [row] = await tx
      .update(categoryEdges)
      .set({ ...patch, sourceOrigin: "manual" })
      .where(eq(categoryEdges.id, before.id))
      .returning();
    if (!row) throw new ElementEditorError("NOT_FOUND", "Связь не найдена");
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
): Promise<UpdateThesisResult> {
  if (!isObj(updates)) fail({ body: "ожидается объект" });
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
  if (Object.keys(patch).length === 0) fail({ body: "нет ни одного поля для обновления" });

  const { before, row, version } = await db.transaction(async (tx) => {
    const before = await loadThesisRow(synthesisId, thesisId, tx);
    const version = await createVersion(
      synthesisId, before.id, "thesis", snapshotOf(before), "manual", tx,
    );
    const [row] = await tx
      .update(theses)
      .set({ ...patch, source: "manual", updatedAt: new Date() })
      .where(eq(theses.id, before.id))
      .returning();
    if (!row) throw new ElementEditorError("NOT_FOUND", "Тезис не найден");
    return { before, row, version };
  });

  const sync = emptySync();
  await renderTables(synthesisId, ["theses"], sync);

  // Поля вне таблицы: формулировка/обоснование в прозаическом абзаце
  if (("justification" in patch || "formulation" in patch) && !sync.sectionMissing) {
    await patchThesisParagraph(synthesisId, before.formulation, row, sync);
  }

  const impact = await computeElementImpact("thesis", row.id, synthesisId);
  return { thesis: toThesisDto(row), impact, version, htmlSync: sync };
}

/** Точечная правка абзаца тезиса в разделе theses; не найден → pending. */
async function patchThesisParagraph(
  synthesisId: string,
  oldFormulation: string,
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
  const patched = replaceThesisParagraph(
    sec.html,
    oldFormulation,
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
): Promise<UpdateGlossaryTermResult> {
  if (!isObj(updates)) fail({ body: "ожидается объект" });
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
  if (Object.keys(patch).length === 0) fail({ body: "нет ни одного поля для обновления" });

  const { before, row, version } = await db.transaction(async (tx) => {
    const before = await loadGlossaryRow(synthesisId, termId, tx);
    const version = await createVersion(
      synthesisId, before.id, "glossary_term", snapshotOf(before), "manual", tx,
    );
    const [row] = await tx
      .update(glossaryTerms)
      .set({ ...patch, source: "manual", updatedAt: new Date() })
      .where(eq(glossaryTerms.id, before.id))
      .returning();
    if (!row) throw new ElementEditorError("NOT_FOUND", "Термин не найден");
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
  if (o === n) fail({ newName: "совпадает с oldName" });
  const re = nameRegex(o);
  if (!re) fail({ oldName: "слишком короткое имя" });

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
 * не отображается.
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
  return { element, version: res.version, impact, htmlSync: sync };
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
    fail({ html: "ожидается непустая HTML-строка" });
  const value = html.trim();
  return db.transaction(async (tx) => {
    const [synth] = await tx
      .select({ id: syntheses.id, capsule: syntheses.capsuleHtml })
      .from(syntheses)
      .where(eq(syntheses.id, synthesisId))
      .limit(1);
    if (!synth) throw new ElementEditorError("NOT_FOUND", "Синтез не найден");
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
        : { key: "capsule", htmlContent: synth.capsule, title: KEY_LABELS["capsule"] ?? "Капсула" },
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
