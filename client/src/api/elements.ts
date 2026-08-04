/**
 * API-функции гранулярных элементов. Беседа 1.7 (запрос 1, п. 10).
 *
 * Модуль создаётся ЗДЕСЬ: в контексте беседы он числился готовым, но не
 * создавался никем (беседа 5.2 говорит о нём «расширение» — там добавятся
 * PATCH-функции категорий/тезисов/глоссария Фазы 5).
 *
 * Контракт: 03-specification §2.4 + server/routes/elements.ts (беседа 1.6):
 *  - getCategories → GET /syntheses/:id/categories →
 *      { categories, edges, clusters, topology } (GraphData).
 *    Доступ: владелец ИЛИ is_public; 403 FORBIDDEN / 404 NOT_FOUND.
 */

import type { GraphData } from "@philosynth/shared/types/graph";

import { apiGet } from "./client";

export function getCategories(synthesisId: string): Promise<GraphData> {
  return apiGet<GraphData>(
    `/syntheses/${encodeURIComponent(synthesisId)}/categories`,
  );
}
