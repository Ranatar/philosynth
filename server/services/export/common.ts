/**
 * common — общая обвязка экспортёров (беседа 4.2): загрузка строки
 * синтеза с генеалогией + класс ошибки экспорта.
 *
 * ExportError NO_GRAPH — серверная замена `alert("Нет графа.")`
 * exportMMD/exportPNG/exportJSON [16397/16592/17299]: роут отвечает
 * 400 VALIDATION_ERROR (edge case протокола 4.2 «exportPNG для синтеза
 * без графа — корректная ошибка 400»).
 */
import { asc, eq, inArray } from "drizzle-orm";

import { db } from "../../db/index.js";
import { syntheses, synthesisLineage } from "../../db/schema.js";
import { unlinkedFileParents } from "../lineage-service.js";
import { getDocFilename } from "./filename.js";

export type ExportErrorCode = "NOT_FOUND" | "NO_GRAPH";

export class ExportError extends Error {
  readonly code: ExportErrorCode;
  constructor(code: ExportErrorCode, message: string) {
    super(message);
    this.name = "ExportError";
    this.code = code;
  }
}

export type SynthesisRow = typeof syntheses.$inferSelect;
export type LineageRow = typeof synthesisLineage.$inferSelect;

export interface ExportSynthesis {
  row: SynthesisRow;
  /** Философы-родители (имена, порядок position) */
  philosophers: string[];
  /** Концепции-родители (parent_type='synthesis'), порядок position */
  conceptParents: { id: string | null; name: string }[];
  lineageRows: LineageRow[];
}

/** Строка синтеза + генеалогия; NOT_FOUND — исключением. */
export async function loadExportSynthesis(
  synthesisId: string,
): Promise<ExportSynthesis> {
  const [row] = await db
    .select()
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  if (!row) throw new ExportError("NOT_FOUND", "Синтез не найден");

  const lineageRows = await db
    .select()
    .from(synthesisLineage)
    .where(eq(synthesisLineage.synthesisId, synthesisId))
    .orderBy(asc(synthesisLineage.position));

  const philosophers = lineageRows
    .filter((l) => l.parentType === "philosopher" && l.parentName)
    .map((l) => l.parentName as string);

  // Имена концепций-родителей — заголовки родителей из БД. parent_name у
  // строк parent_type='synthesis' не пишет НИКТО (createLineageRecords,
  // импорт по UUID, linkParent — 02 §2.4: это имя философа), поэтому прежнее
  // «parent_name ?? заглушка» давало «[безымянная концепция]» всегда.
  // Родители из дерева импортированного файла без связи в БД (правило
  // приоритета lineage-service) идут с id=null на своих позициях.
  const parentIds = lineageRows
    .filter((l) => l.parentType === "synthesis" && l.parentSynthesisId)
    .map((l) => l.parentSynthesisId as string);
  const titles = new Map<string, string>();
  if (parentIds.length > 0) {
    for (const t of await db
      .select({ id: syntheses.id, title: syntheses.title })
      .from(syntheses)
      .where(inArray(syntheses.id, [...new Set(parentIds)])))
      titles.set(t.id, t.title);
  }
  const slots: { position: number; id: string | null; name: string }[] =
    lineageRows
      .filter((l) => l.parentType === "synthesis" && l.parentSynthesisId)
      .map((l) => ({
        position: l.position,
        id: l.parentSynthesisId,
        name:
          titles.get(l.parentSynthesisId as string) ??
          l.parentName ??
          "[безымянная концепция]",
      }));
  for (const f of unlinkedFileParents(row.fileGenealogy, lineageRows)) {
    if (f.node.type === "concept")
      slots.push({ position: f.position, id: null, name: f.node.name });
  }
  const conceptParents = slots
    .sort((a, b) => a.position - b.position)
    .map(({ id, name }) => ({ id, name }));

  return { row, philosophers, conceptParents, lineageRows };
}

/** Имя файла экспорта для строки синтеза (обвязка getDocFilename). */
export function exportFilename(s: ExportSynthesis, ext: string): string {
  return getDocFilename(
    {
      docNum: s.row.docNum,
      title: s.row.title,
      philosophers: s.philosophers,
      conceptParentCount: s.conceptParents.length,
      method: s.row.method,
      synthLevel: s.row.synthLevel,
      generationOrder: s.row.generationOrder,
      depth: s.row.depth,
      version: {
        base: s.row.versionBase,
        sub: s.row.versionSub,
        modes: s.row.versionModes,
        modeRegen: s.row.versionModeRegen,
      },
      lang: s.row.lang,
    },
    ext,
  );
}
