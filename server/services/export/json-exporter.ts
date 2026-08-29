/**
 * json-exporter — exportJSON() [17265–17312] (беседа 4.2; карта 04 §2.5).
 * Структура { meta, nodes, edges, clusters } — 1:1 с исходником.
 *
 * АДАПТАЦИИ DOM→БД:
 *  - G — из loadGModel; roles — через createGraphStyle.getRolesFromLayer;
 *  - document.getElementById("docNum"/"docTitle") → syntheses.doc_num/title;
 *  - alert("Нет графа.") → ExportError NO_GRAPH (роут: 400);
 *  - downloadFile → возврат объекта (сериализует роут: JSON.stringify(_, null, 2),
 *    как в исходнике [17342]).
 */
import { ExportError } from "./common.js";
import { emptyTopology, loadGModel } from "./graph-model.js";
import { createGraphStyle } from "./graph-style.js";

import type { GModel } from "./graph-model.js";

export interface GraphExportJSON {
  meta: {
    format: "PhiloSynth Graph";
    version: 1;
    exported: string;
    document: string | null;
    title: string | null;
  };
  nodes: {
    name: string;
    type: string | null;
    definition: string | null;
    centrality: number;
    certainty: number;
    origin: string | null;
    roles: { structural: string[]; procedural: string[] };
    clusters: { index: number; label: string | null }[];
  }[];
  edges: {
    source: string;
    target: string;
    type: string | null;
    description: string | null;
    direction: string | null;
    strength: number;
  }[];
  clusters: { index: number; label: string; members: string[] }[];
}

/** Ядро на готовой модели G. */
export function buildJSON(
  G: GModel,
  doc: { docNum: string; title: string },
): GraphExportJSON {
  if (!G.nodes.length) throw new ExportError("NO_GRAPH", "Нет графа.");
  const style = createGraphStyle(G);
  const topo = G.topology || emptyTopology();

  return {
    meta: {
      format: "PhiloSynth Graph",
      version: 1,
      exported: new Date().toISOString(),
      document: doc.docNum.trim() || null,
      title: doc.title.trim() || null,
    },
    nodes: G.nodes.map((n) => ({
      name: n.name,
      type: n.type || null,
      definition: n.def || null,
      centrality: n.cen ?? 0.5,
      certainty: n.cert ?? 0.5,
      origin: n.orig || null,
      roles: {
        structural: [...(style.getRolesFromLayer("structural", n.name) || [])],
        procedural: [...(style.getRolesFromLayer("procedural", n.name) || [])],
      },
      clusters: (topo.clusters?.[n.name] || []).map((idx) => ({
        index: idx,
        label: topo.clusterLabels?.[idx] || null,
      })),
    })),
    edges: G.edges.map((e) => ({
      source: e.src,
      target: e.tgt,
      type: e.type || null,
      description: e.desc || null,
      direction: e.dir || null,
      strength: e.str ?? 0.5,
    })),
    clusters: (topo.clusterLabels || []).map((label, idx) => ({
      index: idx,
      label,
      members: G.nodes
        .filter((n) => (topo.clusters?.[n.name] || []).includes(idx))
        .map((n) => n.name),
    })),
  };
}

/** exportJSON(synthesisId) — контракт первого запроса 4.2. */
export async function exportJSON(
  synthesisId: string,
  doc: { docNum: string; title: string },
): Promise<GraphExportJSON> {
  return buildJSON(await loadGModel(synthesisId), doc);
}
