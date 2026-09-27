/**
 * Ожидаемый порядок подразделов сохранённого синтеза (беседа 11.2, долг Д-16).
 *
 * Страховка 11.1 опознаёт подраздел по месту, только когда известен порядок
 * карты subsection_map для ЭТОГО документа (кардинальность участников решает
 * имя портретного подраздела, уровень синтеза — глоссарий и пункты критики).
 * До 11.2 порядок умел строить только generation-service из своих полных
 * параметров; recommendations, recommendation-planner и element-step
 * порядка не знали и искали подразделы по каноническому имени — при
 * переведённых моделью атрибутах data-section молча теряли адресата.
 *
 * Здесь — минимальный загрузчик: строка syntheses + генеалогия → параметры
 * кардинальности → buildSubsectionMap. Лист графа импортов: db, схема,
 * section-defs-builder; generation-service и context-builder не трогаются
 * (анти-цикл 2.1) — context-builder получает порядок параметром.
 */
import { eq } from "drizzle-orm";

import type { Depth, SynthesisMethod, SynthLevel } from "@philosynth/shared/types/synthesis";

import { db } from "../db/index.js";
import { syntheses, synthesisLineage } from "../db/schema.js";
import { buildSubsectionMap } from "./section-defs-builder.js";
import type { PromptParams } from "./prompt-builder.js";

export type SubsectionOrderMap = Record<string, string[]>;

/** Параметры кардинальности и уровня из БД — всё, что нужно карте подразделов. */
export async function loadSubsectionOrderParams(synthesisId: string): Promise<PromptParams | null> {
  const [row] = await db
    .select({
      synthLevel: syntheses.synthLevel,
      method: syntheses.method,
      depth: syntheses.depth,
      sectionOrder: syntheses.sectionOrder,
      generationOrder: syntheses.generationOrder,
    })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  if (!row) return null;
  const lineage = await db
    .select({ parentType: synthesisLineage.parentType, parentName: synthesisLineage.parentName })
    .from(synthesisLineage)
    .where(eq(synthesisLineage.synthesisId, synthesisId))
    .orderBy(synthesisLineage.position);
  const philosophers = lineage
    .filter((l) => l.parentType === "philosopher" && l.parentName)
    .map((l) => l.parentName as string);
  const concepts = lineage.filter((l) => l.parentType === "synthesis").length;
  return {
    phil: philosophers,
    participants: [
      ...philosophers.map((name) => ({ type: "philosopher" as const, name })),
      ...Array.from({ length: concepts }, (_, i) => ({ type: "synthesis" as const, name: `concept-${i + 1}` })),
    ],
    isMetaSynthesis: concepts > 0,
    sec: ((row.sectionOrder as string[] | null) ?? []).filter((k) => k !== "sum"),
    method: row.method as SynthesisMethod,
    synthLevel: row.synthLevel as SynthLevel,
    depth: row.depth as Depth,
    generationOrder: row.generationOrder as PromptParams["generationOrder"],
  };
}

/** Карта «раздел → ожидаемые подразделы» синтеза; пустая — синтеза нет либо
 *  Registry недоступен (fail-open: без порядка страховка по месту молчит,
 *  поиск по имени работает как прежде). */
export async function loadExpectedSubsectionOrder(synthesisId: string): Promise<SubsectionOrderMap> {
  try {
    const p = await loadSubsectionOrderParams(synthesisId);
    return p ? await buildSubsectionMap(p) : {};
  } catch (err) {
    console.warn("[subsection-order] порядок подразделов недоступен:", (err as Error).message);
    return {};
  }
}
