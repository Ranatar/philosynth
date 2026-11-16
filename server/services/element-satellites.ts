/**
 * Спутники удалённых элементов (беседа 18.1, Д-87) — то, что ссылается на
 * категорию, ребро, тезис или термин БЕЗ внешнего ключа (`element_id`
 * полиморфный) и потому не уходит каскадом базы:
 *   - обогащения (`element_enrichments`) и обоснования характеристик
 *     (`characteristic_justifications`) — удаляются;
 *   - рекомендации критики (`recommendations.element_id`) — ссылка гаснет;
 *     строка, ещё годная к исполнению (`new` | `stale`), становится негодной
 *     кодом `target_element_gone` (правило 15.2, Д-71).
 *
 * Одна функция на два пути удаления: поштучный (`deleteElement`,
 * element-editor) и удаление раздела целиком (`deleteSection`,
 * generation-service) — до 18.1 второй путь спутников не снимал, а у
 * разделов глоссария и тезисов не снимал и самих строк элементов.
 *
 * Модуль-лист (db + recommendation-issues): его импортируют и редактор
 * элементов, и служба генерации, которые сами друг от друга зависят.
 */
import { and, eq, inArray } from "drizzle-orm";

import type { db } from "../db/index.js";
import {
  characteristicJustifications,
  elementEnrichments,
  recommendations,
} from "../db/schema.js";
import { issue, issuesFromColumn, withIssueTexts } from "./recommendation-issues.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface SatellitesResult {
  /** Удалено обогащений и обоснований (вместе) */
  enrichmentsDeleted: number;
  /** Рекомендаций, у которых погашена ссылка на элемент */
  recommendationsDetached: number;
}

/**
 * Снять спутников удаляемых элементов — В ТРАНЗАКЦИИ удаления.
 * @param ownerIds   id всех уходящих строк (элементы и их рёбра) — владельцы
 *                   обогащений и обоснований
 * @param recTargets элементы, на которые могли ссылаться рекомендации;
 *                   `name` — имя для находки, если строка рекомендации
 *                   своего текста адресата не несёт
 */
export async function detachElementSatellites(
  tx: Tx,
  synthesisId: string,
  ownerIds: readonly string[],
  recTargets: readonly { id: string; name: string }[],
): Promise<SatellitesResult> {
  const out: SatellitesResult = { enrichmentsDeleted: 0, recommendationsDetached: 0 };
  if (ownerIds.length > 0) {
    const en = await tx
      .delete(elementEnrichments)
      .where(and(eq(elementEnrichments.synthesisId, synthesisId), inArray(elementEnrichments.elementId, [...ownerIds])))
      .returning({ id: elementEnrichments.id });
    const ju = await tx
      .delete(characteristicJustifications)
      .where(and(eq(characteristicJustifications.synthesisId, synthesisId), inArray(characteristicJustifications.elementId, [...ownerIds])))
      .returning({ id: characteristicJustifications.id });
    out.enrichmentsDeleted = en.length + ju.length;
  }
  if (recTargets.length === 0) return out;
  const nameOf = new Map(recTargets.map((t) => [t.id, t.name]));
  // рекомендации: ссылка гаснет; годные к исполнению — негодны кодом
  const recs = await tx
    .select({
      id: recommendations.id,
      status: recommendations.status,
      element: recommendations.element,
      elementId: recommendations.elementId,
      issues: recommendations.issues,
    })
    .from(recommendations)
    .where(and(eq(recommendations.synthesisId, synthesisId), inArray(recommendations.elementId, [...nameOf.keys()])));
  for (const r of recs) {
    if (r.status === "new" || r.status === "stale") {
      const gone = issue("invalid", "target_element_gone", { element: r.element ?? nameOf.get(r.elementId ?? "") ?? "" });
      const notes = issuesFromColumn(r.issues).filter((x) => x.level === "warning");
      await tx
        .update(recommendations)
        .set({ elementId: null, status: "invalid", ...withIssueTexts([gone, ...notes]) })
        .where(eq(recommendations.id, r.id));
    } else {
      await tx.update(recommendations).set({ elementId: null }).where(eq(recommendations.id, r.id));
    }
    out.recommendationsDetached++;
  }
  return out;
}
