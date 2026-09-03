/**
 * Element Versioning (беседа 5.1; НОВОЕ — 01-architecture §4.7 п.1,
 * 02-data-model §2.12, 03-specification §2.4 ElementVersion / rollback).
 *
 * Версия — полный снимок элемента ДО изменения (data JSONB); version —
 * автоинкремент в пределах (element_type, element_id). synthesis_id
 * обязателен (правка 2026-09-02, п.3, миграция 0001): по нему роуты
 * проверяют принадлежность элемента синтезу одним WHERE и по нему же
 * версии гибнут CASCADE'ом вместе с синтезом.
 *
 * rollbackToVersion восстанавливает данные версии в таблице элемента и
 * создаёт НОВУЮ версию с changeSource='rollback' (снимок состояния до
 * отката) — история линейна, откат не переписывает её. Перерисовку
 * таблицы в html_content и impact выполняет element-editor (владелец
 * знаний о таблицах); здесь — только данные.
 *
 * Снимки хранятся в форме select-строк Drizzle (camelCase, Date →
 * ISO-строка через JSON); при восстановлении берётся только белый список
 * содержательных полей типа — id/synthesisId/createdAt/version-поля
 * снимка не применяются.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  categories,
  categoryEdges,
  dialogueTurns,
  elementVersions,
  glossaryTerms,
  sections,
  theses,
} from "../db/schema.js";

import type {
  ChangeSource,
  ElementVersion,
  VersionedElementType,
} from "@philosynth/shared/types/elements";

export const VERSIONED_ELEMENT_TYPES: readonly VersionedElementType[] = [
  "category",
  "edge",
  "thesis",
  "glossary_term",
  "dialogue_turn",
  "section",
];

export function isVersionedElementType(v: string): v is VersionedElementType {
  return (VERSIONED_ELEMENT_TYPES as readonly string[]).includes(v);
}

/** Транзакция Drizzle либо сам db — createVersion зовётся из обеих сред. */
export type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export class VersioningError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "VALIDATION_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "VersioningError";
  }
}

/** Снимок строки → JSON-совместимый объект (Date → ISO). */
export function snapshotOf(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

function toDto(r: typeof elementVersions.$inferSelect): ElementVersion {
  return {
    id: r.id,
    synthesisId: r.synthesisId,
    elementId: r.elementId,
    elementType: r.elementType,
    version: r.version,
    data: r.data,
    changeSource: r.changeSource,
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * createVersion(synthesisId, elementId, elementType, data, changeSource):
 * INSERT с version = max(version)+1 по (element_type, element_id).
 * Гонка двух правок одного элемента исключена транзакцией вызывающего
 * (editor держит update + createVersion в одной tx).
 */
export async function createVersion(
  synthesisId: string,
  elementId: string,
  elementType: VersionedElementType,
  data: Record<string, unknown>,
  changeSource: ChangeSource,
  tx: DbLike = db,
): Promise<ElementVersion> {
  const [mx] = await tx
    .select({ max: sql<number>`coalesce(max(${elementVersions.version}), 0)` })
    .from(elementVersions)
    .where(
      and(
        eq(elementVersions.elementType, elementType),
        eq(elementVersions.elementId, elementId),
      ),
    );
  const version = Number(mx?.max ?? 0) + 1;
  const [row] = await tx
    .insert(elementVersions)
    .values({
      synthesisId,
      elementId,
      elementType,
      version,
      data: snapshotOf(data),
      changeSource,
    })
    .returning();
  if (!row) throw new Error("element-versioning: insert без returning");
  return toDto(row);
}

/**
 * getVersionHistory(synthesisId, elementType, elementId): все версии,
 * version DESC. synthesisId — фильтр доступа (03 §2.4): чужой или
 * несуществующий элемент даёт пустой список, роут отвечает 404 сам.
 */
export async function getVersionHistory(
  synthesisId: string,
  elementType: VersionedElementType,
  elementId: string,
): Promise<ElementVersion[]> {
  const rows = await db
    .select()
    .from(elementVersions)
    .where(
      and(
        eq(elementVersions.synthesisId, synthesisId),
        eq(elementVersions.elementType, elementType),
        eq(elementVersions.elementId, elementId),
      ),
    )
    .orderBy(desc(elementVersions.version));
  return rows.map(toDto);
}

/* ── Восстановление данных по типу ───────────────────────────────────── */

/** Белые списки восстанавливаемых полей (содержательные, без id/FK/дат). */
const RESTORE_FIELDS: Record<VersionedElementType, readonly string[]> = {
  category: [
    "name", "type", "definition", "centrality", "certainty",
    "historicalSignificance", "innovationDegree", "clarity", "breadth",
    "depthScore", "applicability", "typeCatalogId", "origin",
    "clusterIndices", "structuralRoles", "proceduralRoles", "hasReflexive",
    "position", "source",
  ],
  edge: [
    "description", "edgeType", "direction", "strength", "certainty",
    "historicalSupport", "logicalNecessity", "innovationDegree",
    "contextDependency", "typeCatalogId", "position", "sourceOrigin",
  ],
  thesis: [
    "thesisNum", "formulation", "justification", "thesisType",
    "noveltyDegree", "relatedCategories", "source",
  ],
  glossary_term: [
    "term", "definition", "extraColumns", "termCategory", "source", "position",
  ],
  dialogue_turn: ["partNumber", "turnNumber", "speaker", "content", "newConcepts"],
  section: ["title", "htmlContent", "secContext", "isEdited"],
};

const TABLE_OF = {
  category: categories,
  edge: categoryEdges,
  thesis: theses,
  glossary_term: glossaryTerms,
  dialogue_turn: dialogueTurns,
  section: sections,
} as const;

/** Текущая строка элемента (для снимка до отката); null — нет строки. */
export async function loadElementRow(
  synthesisId: string,
  elementType: VersionedElementType,
  elementId: string,
  tx: DbLike = db,
): Promise<Record<string, unknown> | null> {
  const t = TABLE_OF[elementType];
  const [row] = await tx
    .select()
    .from(t)
    .where(and(eq(t.id, elementId), eq(t.synthesisId, synthesisId)))
    .limit(1);
  return (row as Record<string, unknown> | undefined) ?? null;
}

/** Применить снимок к строке (белый список полей типа). */
export async function restoreElementData(
  synthesisId: string,
  elementType: VersionedElementType,
  elementId: string,
  data: Record<string, unknown>,
  tx: DbLike = db,
): Promise<Record<string, unknown>> {
  const t = TABLE_OF[elementType];
  const patch: Record<string, unknown> = {};
  for (const f of RESTORE_FIELDS[elementType]) {
    if (f in data) patch[f] = data[f];
  }
  if ("updatedAt" in t) patch["updatedAt"] = new Date();
  const rows = await tx
    .update(t)
    .set(patch as never)
    .where(and(eq(t.id, elementId), eq(t.synthesisId, synthesisId)))
    .returning();
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new VersioningError("NOT_FOUND", "Элемент не найден");
  return row;
}

export interface RollbackResult {
  /** Строка элемента ПОСЛЕ отката */
  element: Record<string, unknown>;
  /** Созданная версия (changeSource='rollback' — снимок ДО отката) */
  version: ElementVersion;
  /** Версия, к которой откатились */
  restoredFrom: ElementVersion;
}

/**
 * rollbackToVersion(synthesisId, elementType, elementId, version):
 * восстановить данные версии; создать новую версию 'rollback'.
 * Одной транзакцией. Версия не найдена → NOT_FOUND.
 */
export async function rollbackToVersion(
  synthesisId: string,
  elementType: VersionedElementType,
  elementId: string,
  version: number,
): Promise<RollbackResult> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(elementVersions)
      .where(
        and(
          eq(elementVersions.synthesisId, synthesisId),
          eq(elementVersions.elementType, elementType),
          eq(elementVersions.elementId, elementId),
          eq(elementVersions.version, version),
        ),
      )
      .limit(1);
    if (!target) throw new VersioningError("NOT_FOUND", "Версия не найдена");

    const current = await loadElementRow(synthesisId, elementType, elementId, tx);
    if (!current) throw new VersioningError("NOT_FOUND", "Элемент не найден");

    const created = await createVersion(
      synthesisId,
      elementId,
      elementType,
      current,
      "rollback",
      tx,
    );
    const element = await restoreElementData(
      synthesisId,
      elementType,
      elementId,
      target.data,
      tx,
    );
    return { element, version: created, restoredFrom: toDto(target) };
  });
}
