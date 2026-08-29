/**
 * common — общая обвязка экспортёров (беседа 4.2): загрузка строки
 * синтеза с генеалогией + класс ошибки экспорта.
 *
 * ExportError NO_GRAPH — серверная замена `alert("Нет графа.")`
 * exportMMD/exportPNG/exportJSON [16397/16592/17299]: роут отвечает
 * 400 VALIDATION_ERROR (edge case протокола 4.2 «exportPNG для синтеза
 * без графа — корректная ошибка 400»).
 */
import { asc, eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import { syntheses, synthesisLineage } from "../../db/schema.js";
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

  // Имена концепций-родителей: parent_name строки генеалогии; при его
  // отсутствии — заголовок родителя (дотяжка на стороне вызывающего не
  // нужна: экспорту достаточно имени, id — для навигации импорта 4.3)
  const conceptParents = lineageRows
    .filter((l) => l.parentType === "synthesis")
    .map((l) => ({
      id: l.parentSynthesisId,
      name: l.parentName ?? "[безымянная концепция]",
    }));

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
