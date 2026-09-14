/**
 * API-функции трансформаций представлений graph↔theses.
 * Беседа 5.5 (запрос 1, п. 8).
 *
 * Контракт: 03-specification §2.15 + server/routes/transforms.ts:
 *  - startTransformRequest(id, direction) → POST /syntheses/:id/transform/
 *    graph-to-theses | theses-to-graph (8.4: две пофункциональные обёртки
 *    убраны как мёртвые — единственный вход остался один)
 *    Оба отвечают { ok: true } — операция исполняется ФОНОМ под
 *    generation-слотом синтеза, результат по WebSocket: transform_started
 *    → stream_delta с sectionKey "transform:{direction}" → transform_done
 *    (summary, usage); обрыв → stream_error с тем же sectionKey.
 *    Подписка на поток — hooks/useTransformStream. Гейты: чужой → 403,
 *    активная операция → 409 GENERATION_IN_PROGRESS, пустой источник
 *    (нет графа / нет тезисов) → 400 VALIDATION_ERROR.
 *  - getTransformHistory → GET /syntheses/:id/transforms → { transforms }
 *    (новые первыми; владелец ИЛИ публичный синтез)
 *  - rollbackTransform → POST /syntheses/:id/transforms/:transformId/rollback
 *    → { ok, transform, summary } — синхронно (Claude не нужен); только
 *    владелец, под тем же 409-гейтом.
 */

import type {
  RepresentationTransform,
  TransformDirection,
} from "@philosynth/shared/types/elements";

import { apiGet, apiPost } from "./client";

const base = (synthesisId: string): string =>
  `/syntheses/${encodeURIComponent(synthesisId)}`;

/** Пути POST по направлению (8.4: два одноимённых обёртки-предшественника
 *  убраны — через startTransformRequest ходит useTransformStream 5.5). */
const TRANSFORM_PATH: Readonly<Record<TransformDirection, string>> = {
  graph_to_theses: "transform/graph-to-theses",
  theses_to_graph: "transform/theses-to-graph",
};

/** Запуск трансформации по направлению → { ok: true } (фон, WS). */
export function startTransformRequest(
  synthesisId: string,
  direction: TransformDirection,
): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>(`${base(synthesisId)}/${TRANSFORM_PATH[direction]}`);
}

export function getTransformHistory(synthesisId: string): Promise<RepresentationTransform[]> {
  return apiGet<{ transforms: RepresentationTransform[] }>(
    `${base(synthesisId)}/transforms`,
  ).then((r) => r.transforms);
}

export interface RollbackTransformResponse {
  ok: true;
  transform: RepresentationTransform;
  summary: Record<string, number>;
}

export function rollbackTransform(
  synthesisId: string,
  transformId: string,
): Promise<RollbackTransformResponse> {
  return apiPost<RollbackTransformResponse>(
    `${base(synthesisId)}/transforms/${encodeURIComponent(transformId)}/rollback`,
  );
}
