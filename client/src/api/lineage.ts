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
 *
 * Беседа 8.5: linkParent → POST /syntheses/:id/lineage/link — привязка
 * концепции-родителя по выбору человека (предложение ImportPage); коды
 * LINEAGE_SELF (400) / LINEAGE_CYCLE / LINEAGE_EXISTS (409), 403 у чужого.
 *
 * Беседа 15.1: linkParent принимает position узла файла (Д-68 — действие
 * у узла древа; узел не свободная концепция → 409 LINEAGE_NODE_UNAVAILABLE);
 * getFileNodeCandidates → GET …/lineage/file-node/:position/candidates?q=
 * (совпадения по имени и поиск по подстроке среди своих); unlinkParent →
 * DELETE …/lineage/link/:parentSynthesisId (Д-69; связь без узла файла →
 * 409 LINEAGE_GENERATED, активная операция → 409 GENERATION_IN_PROGRESS).
 */
import type {
  FileNodeCandidates,
  LineageNode,
  LineageRecord,
  LineageUnlinkResult,
  LinkParentInput,
} from "@philosynth/shared/types/lineage";
import type { SynthesisPreview } from "@philosynth/shared/types/synthesis";

import { apiDelete, apiGet, apiPost } from "./client";

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

export function linkParent(
  synthesisId: string,
  parentName: string,
  parentSynthesisId: string,
  position?: number,
): Promise<LineageRecord> {
  const body: LinkParentInput = { parentName, parentSynthesisId };
  if (position !== undefined) body.position = position; // 15.1 (Д-68)
  return apiPost<{ ok: true; record: LineageRecord }>(
    `/syntheses/${encodeURIComponent(synthesisId)}/lineage/link`,
    body,
  ).then((r) => r.record);
}

/** 15.1 (Д-68): кандидаты для узла-концепции верхнего уровня дерева файла. */
export function getFileNodeCandidates(
  synthesisId: string,
  position: number,
  query?: string,
): Promise<FileNodeCandidates> {
  return apiGet<FileNodeCandidates>(
    `/syntheses/${encodeURIComponent(synthesisId)}/lineage/file-node/${position}/candidates`,
    query ? { q: query } : {},
  );
}

/** 15.1 (Д-69): отвязка родителя — только поверх узла-концепции файла. */
export function unlinkParent(
  synthesisId: string,
  parentSynthesisId: string,
): Promise<LineageUnlinkResult> {
  return apiDelete<LineageUnlinkResult>(
    `/syntheses/${encodeURIComponent(synthesisId)}/lineage/link/${encodeURIComponent(parentSynthesisId)}`,
  );
}
