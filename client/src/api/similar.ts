/**
 * API похожих концепций. Беседа 18.3 (03 §2.22).
 *
 *  - getSimilarSyntheses → GET /syntheses/:id/similar — концепции, похожие
 *    на данную, среди видимых смотрящему: превью каталога + мера словами
 *    (`grade`) + причины. Путь ГОСТЕВОЙ (optionalAuth): гостю кандидаты —
 *    только публичные.
 */
import type { SimilarSynthesesResponse } from "@philosynth/shared/types/similarity";

import { apiGet } from "./client";

export function getSimilarSyntheses(synthesisId: string): Promise<SimilarSynthesesResponse> {
  return apiGet<SimilarSynthesesResponse>(`/syntheses/${synthesisId}/similar`);
}
