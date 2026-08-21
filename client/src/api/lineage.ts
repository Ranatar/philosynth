/**
 * API-функции генеалогии. Беседа 3.2 (запрос 1, п. 6).
 *
 * Контракт: 03-specification §2.8 + server/routes/lineage.ts (беседа 3.1):
 *  - getAncestors → GET /syntheses/:id/lineage/ancestors?depth=N —
 *    { tree }: корень depth 0 — сам синтез, children — родители;
 *  - getDescendants → GET /syntheses/:id/lineage/descendants?depth=N —
 *    { children }: потомки; чужие приватные узлы отсечены сервером
 *    ВМЕСТЕ с поддеревьями (pruneInvisible);
 *  - searchByPhilosophers → GET /lineage/search?philosopher=…×N —
 *    { syntheses }: концепции, в генеалогии которых есть ВСЕ указанные
 *    философы (транзитивно); только видимые (свои ИЛИ публичные).
 *
 * depth зажимается сервером в 1..10 (clampDepth) — клиент не валидирует.
 */
import type { LineageNode } from "@philosynth/shared/types/lineage";
import type { SynthesisPreview } from "@philosynth/shared/types/synthesis";

import { apiGet } from "./client";

export function getAncestors(
  id: string,
  depth?: number,
): Promise<LineageNode> {
  return apiGet<{ tree: LineageNode }>(
    `/syntheses/${encodeURIComponent(id)}/lineage/ancestors`,
    depth !== undefined ? { depth } : {},
  ).then((r) => r.tree);
}

export function getDescendants(
  id: string,
  depth?: number,
): Promise<LineageNode[]> {
  return apiGet<{ children: LineageNode[] }>(
    `/syntheses/${encodeURIComponent(id)}/lineage/descendants`,
    depth !== undefined ? { depth } : {},
  ).then((r) => r.children);
}

export function searchByPhilosophers(
  names: readonly string[],
): Promise<SynthesisPreview[]> {
  // Повторяющийся параметр philosopher=…&philosopher=… (§2.8)
  const qs = names
    .map((n) => "philosopher=" + encodeURIComponent(n))
    .join("&");
  return apiGet<{ syntheses: SynthesisPreview[] }>(
    `/lineage/search?${qs}`,
  ).then((r) => r.syntheses);
}
