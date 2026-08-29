/**
 * graph-model — модель G исходника из БД (беседа 4.2, Export Service).
 *
 * Экспортёры графа (exportMMD [16370], exportPNG [16591], exportJSON
 * [17265]) в исходнике работают с глобальным G, который наполнял
 * parseGraph из DOM. На сервере источник — гранулярные таблицы
 * (categories + category_edges + cluster_labels, беседа 1.4/1.6); формы
 * узлов/рёбер/топологии повторяют клиентский адаптер buildGFromGraphData
 * (client/src/components/graph/graph-utils.ts, беседа 1.7): рёбра — по
 * ИМЕНАМ узлов, топология — картами имя → роли/кластеры.
 *
 * АДАПТАЦИЯ (сервер конкурентен): вместо глобального graphState модель
 * возвращается значением; стилевые карты строит createGraphStyle
 * (graph-style.ts) на конкретный G.
 */
import { asc, eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import { categories, categoryEdges, clusterLabels } from "../../db/schema.js";

/** Узел G — поля как в исходнике (parseGraph): name/type/def/orig/cen/cert */
export interface GNode {
  name: string;
  type: string;
  def: string;
  orig: string;
  cen: number;
  cert: number;
}

/** Ребро G — по именам узлов (src/tgt), как в исходнике */
export interface GEdge {
  src: string;
  tgt: string;
  type: string;
  desc: string;
  dir: string;
  str: number;
}

export interface GTopology {
  /** имя узла → индексы кластеров */
  clusters: Record<string, number[]>;
  roles: {
    structural: Record<string, string[]>;
    procedural: Record<string, string[]>;
  };
  clusterLabels: string[];
}

export interface GModel {
  nodes: GNode[];
  edges: GEdge[];
  topology: GTopology;
}

export type RoleLayer = "structural" | "procedural";

/** Пустая топология — дефолт `G.topology || {…}` исходника [16402]. */
export function emptyTopology(): GTopology {
  return {
    clusters: {},
    roles: { structural: {}, procedural: {} },
    clusterLabels: [],
  };
}

/** Загрузка модели G синтеза из БД (порядок узлов — position, как парсер 1.4). */
export async function loadGModel(synthesisId: string): Promise<GModel> {
  const catRows = await db
    .select()
    .from(categories)
    .where(eq(categories.synthesisId, synthesisId))
    .orderBy(asc(categories.position));
  const edgeRows = await db
    .select()
    .from(categoryEdges)
    .where(eq(categoryEdges.synthesisId, synthesisId))
    .orderBy(asc(categoryEdges.position));
  const clusterRows = await db
    .select()
    .from(clusterLabels)
    .where(eq(clusterLabels.synthesisId, synthesisId))
    .orderBy(asc(clusterLabels.clusterIndex));

  const idToName = new Map<string, string>();
  for (const c of catRows) idToName.set(c.id, c.name);

  const nodes: GNode[] = catRows.map((c) => ({
    name: c.name,
    type: c.type,
    def: c.definition,
    orig: c.origin,
    cen: c.centrality,
    cert: c.certainty,
  }));

  const edges: GEdge[] = edgeRows
    .map((e) => ({
      src: idToName.get(e.sourceId) ?? "",
      tgt: idToName.get(e.targetId) ?? "",
      type: e.edgeType,
      desc: e.description,
      dir: e.direction,
      str: e.strength,
    }))
    .filter((e) => e.src && e.tgt);

  const topology = emptyTopology();
  for (const c of catRows) {
    if (c.clusterIndices.length) topology.clusters[c.name] = c.clusterIndices;
    if (c.structuralRoles.length)
      topology.roles.structural[c.name] = c.structuralRoles;
    if (c.proceduralRoles.length)
      topology.roles.procedural[c.name] = c.proceduralRoles;
  }
  for (const cl of clusterRows) topology.clusterLabels[cl.clusterIndex] = cl.label;

  return { nodes, edges, topology };
}
