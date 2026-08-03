/**
 * Роуты гранулярных элементов (03-spec §2.4).
 *
 * Беседа 1.6 создаёт ТОЛЬКО чтение графа — GET /syntheses/:id/categories
 * → { categories, edges, clusters, topology }: он нужен клиентской
 * беседе 1.7 (Graph2D/Graph3D), а тащить его через Фазу 5 значило бы
 * оставить граф без данных (перенос из 5.1 — аудит 2026-07-30).
 *
 * PATCH-часть (categories/:catId, edges/:edgeId, theses, glossary) и
 * прочие GET-ы §2.4 здесь НЕ делаются — остаются беседе 5.1 (Фаза 5),
 * вместе с element-editor/element-versioning и impact analysis.
 *
 * Доступ: владелец ИЛИ is_public (решение аудита 2026-07-30); иначе
 * 403 FORBIDDEN, несуществующий id → 404 NOT_FOUND.
 */
import { Hono } from "hono";

import { asc, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { categories, categoryEdges, clusterLabels } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  forbiddenJson,
  loadSynthesisForRead,
  notFoundJson,
} from "./syntheses.js";

import type {
  Category,
  CategoryEdge,
  ClusterLabel,
  GraphData,
  TopologyInfo,
} from "@philosynth/shared/types/graph";

export const elementsRoutes = new Hono<AuthEnv>();

/* ── GET /:id/categories — граф целиком (для 1.7) ────────────────────── */

elementsRoutes.get("/:id/categories", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  const synthesisId = res.row.id;

  const [catRows, edgeRows, clusterRows] = await Promise.all([
    db
      .select()
      .from(categories)
      .where(eq(categories.synthesisId, synthesisId))
      .orderBy(asc(categories.position)),
    db
      .select()
      .from(categoryEdges)
      .where(eq(categoryEdges.synthesisId, synthesisId))
      .orderBy(asc(categoryEdges.position)),
    db
      .select()
      .from(clusterLabels)
      .where(eq(clusterLabels.synthesisId, synthesisId))
      .orderBy(asc(clusterLabels.clusterIndex)),
  ]);

  const cats: Category[] = catRows.map((r) => ({
    id: r.id,
    synthesisId: r.synthesisId,
    name: r.name,
    type: r.type,
    definition: r.definition,
    centrality: r.centrality,
    certainty: r.certainty,
    historicalSignificance: r.historicalSignificance,
    innovationDegree: r.innovationDegree,
    clarity: r.clarity,
    breadth: r.breadth,
    depthScore: r.depthScore,
    applicability: r.applicability,
    typeCatalogId: r.typeCatalogId ?? null,
    origin: r.origin,
    clusterIndices: r.clusterIndices,
    structuralRoles: r.structuralRoles,
    proceduralRoles: r.proceduralRoles,
    hasReflexive: r.hasReflexive,
    position: r.position,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  const edges: CategoryEdge[] = edgeRows.map((r) => ({
    id: r.id,
    synthesisId: r.synthesisId,
    sourceId: r.sourceId,
    targetId: r.targetId,
    description: r.description,
    edgeType: r.edgeType,
    direction: r.direction,
    strength: r.strength,
    certainty: r.certainty,
    historicalSupport: r.historicalSupport,
    logicalNecessity: r.logicalNecessity,
    innovationDegree: r.innovationDegree,
    contextDependency: r.contextDependency,
    typeCatalogId: r.typeCatalogId ?? null,
    position: r.position,
    sourceOrigin: r.sourceOrigin,
    createdAt: r.createdAt.toISOString(),
  }));

  const clusters: ClusterLabel[] = clusterRows.map((r) => ({
    id: r.id,
    synthesisId: r.synthesisId,
    clusterIndex: r.clusterIndex,
    label: r.label,
  }));

  /* Агрегат топологии: роли — объединение по всем категориям (в порядке
     первого появления); рефлексивность — по рёбрам ИЛИ по флагу
     категорий (parseTopology пишет и то и другое). Пустой граф →
     пустые массивы/false (edge case из тестов беседы). */
  const structuralRoles: string[] = [];
  const proceduralRoles: string[] = [];
  const seenS = new Set<string>();
  const seenP = new Set<string>();
  for (const cat of cats) {
    for (const role of cat.structuralRoles) {
      if (!seenS.has(role)) {
        seenS.add(role);
        structuralRoles.push(role);
      }
    }
    for (const role of cat.proceduralRoles) {
      if (!seenP.has(role)) {
        seenP.add(role);
        proceduralRoles.push(role);
      }
    }
  }
  const topology: TopologyInfo = {
    clusters,
    structuralRoles,
    proceduralRoles,
    hasReflexiveEdges:
      edges.some((e) => e.direction === "рефлексивная") ||
      cats.some((cat) => cat.hasReflexive),
  };

  const payload: GraphData = { categories: cats, edges, clusters, topology };
  return c.json(payload);
});
