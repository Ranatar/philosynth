/**
 * API-функции обогащения элементов и обоснования характеристик.
 * Беседа 5.4 (запрос 1, п. 7).
 *
 * Контракт: 03-specification §2.14 + «По факту 5.3» и
 * server/routes/enrichment.ts:
 *  - enrichCategory → POST /syntheses/:id/enrich/category/:catId { type }
 *  - enrichEdge     → POST /syntheses/:id/enrich/edge/:edgeId { type }
 *  - justifyCharacteristic → POST /syntheses/:id/justify-characteristic
 *      { elementId, elementType, characteristic, value }
 *    Все три POST отвечают { ok: true } — операция исполняется ФОНОМ под
 *    generation-слотом синтеза, результат приходит по WebSocket:
 *    enrichment_delta (по elementId) → enrichment_done (enrichmentType,
 *    enrichmentId, content, usage); обрыв → stream_error с sectionKey
 *    "enrich:…:{elementId}". Подписка на поток — hooks/useEnrichmentStream.
 *    Гейты сервера: чужой синтез → 403, активная операция (генерация,
 *    режим, другое обогащение) → 409 GENERATION_IN_PROGRESS, элемент не в
 *    синтезе → 404, value вне диапазона характеристики → 400
 *    VALIDATION_ERROR + details.
 *  - getEnrichments → GET /syntheses/:id/enrichments/:elementId
 *      [?elementType=category|edge] → { enrichments } (новые первыми)
 *  - getJustifications → GET /syntheses/:id/justifications/:elementId
 *      [?elementType=…] → { justifications } (новые первыми)
 *    Чтение — владелец ИЛИ публичный синтез.
 */

import type {
  CategoryEnrichmentType,
  CharacteristicJustification,
  EdgeEnrichmentType,
  ElementEnrichment,
  JustifyCharacteristicInput,
} from "@philosynth/shared/types/elements";

import { apiGet, apiPost } from "./client";

const base = (synthesisId: string): string =>
  `/syntheses/${encodeURIComponent(synthesisId)}`;

export type EnrichableElementKind = "category" | "edge";

export function enrichCategory(
  synthesisId: string,
  categoryId: string,
  type: CategoryEnrichmentType,
): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>(
    `${base(synthesisId)}/enrich/category/${encodeURIComponent(categoryId)}`,
    { type },
  );
}

export function enrichEdge(
  synthesisId: string,
  edgeId: string,
  type: EdgeEnrichmentType,
): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>(
    `${base(synthesisId)}/enrich/edge/${encodeURIComponent(edgeId)}`,
    { type },
  );
}

export function justifyCharacteristic(
  synthesisId: string,
  input: JustifyCharacteristicInput,
): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>(
    `${base(synthesisId)}/justify-characteristic`,
    input,
  );
}

export function getEnrichments(
  synthesisId: string,
  elementId: string,
  elementType?: EnrichableElementKind,
): Promise<ElementEnrichment[]> {
  return apiGet<{ enrichments: ElementEnrichment[] }>(
    `${base(synthesisId)}/enrichments/${encodeURIComponent(elementId)}`,
    elementType ? { elementType } : undefined,
  ).then((r) => r.enrichments);
}

export function getJustifications(
  synthesisId: string,
  elementId: string,
  elementType?: EnrichableElementKind,
): Promise<CharacteristicJustification[]> {
  return apiGet<{ justifications: CharacteristicJustification[] }>(
    `${base(synthesisId)}/justifications/${encodeURIComponent(elementId)}`,
    elementType ? { elementType } : undefined,
  ).then((r) => r.justifications);
}
