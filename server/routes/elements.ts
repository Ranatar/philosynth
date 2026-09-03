/**
 * Роуты гранулярных элементов (03-spec §2.4).
 *
 * Беседа 1.6 создала ТОЛЬКО чтение графа — GET /syntheses/:id/categories
 * (нужен клиентской беседе 1.7). Беседа 5.1 дополняет остальное §2.4:
 *
 *   GET    /:id/categories/:catId
 *   PATCH  /:id/categories/:catId          → updateCategory
 *   PATCH  /:id/edges/:edgeId              → updateCategoryEdge
 *   DELETE /:id/edges/:edgeId              → deleteCategoryEdge (АДДИТИВНО:
 *          edge case протокола 5.1 требует удаление связи, в §2.4 его нет)
 *   GET    /:id/theses                     → { theses }
 *   PATCH  /:id/theses/:thesisId           → updateThesis
 *   GET    /:id/glossary                   → { terms }
 *   PATCH  /:id/glossary/:termId           → updateGlossaryTerm
 *   GET    /:id/elements/:elementType/:elementId/versions
 *   POST   /:id/elements/:elementType/:elementId/rollback { version }
 *   POST   /:id/elements/auto-rename { oldName, newName }
 *   PATCH  /:id/capsule { html }           (п.14 правки 2026-09-02)
 *
 * Доступ: чтение — владелец ИЛИ is_public (решение аудита 2026-07-30);
 * правка — только владелец (правило edit-операций 2.1) и не во время
 * активной генерации (409 GENERATION_IN_PROGRESS — иначе гонка с
 * saveGraphToDb/saveElementsToDb, которые ЗАМЕНЯЮТ строки). Не-UUID →
 * 404 до запроса к PG. Ответы PATCH/rollback несут аддитивные version и
 * htmlSync (какие таблицы перерисованы / что не дошло до HTML — 02 §3 п.4).
 */
import { Hono } from "hono";

import type { Context } from "hono";
import { and, asc, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  categories,
  categoryEdges,
  clusterLabels,
  glossaryTerms,
  syntheses,
  theses,
} from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  ElementEditorError,
  autoRenameReferences,
  deleteCategoryEdge,
  rollbackElement,
  toCategoryDto,
  toGlossaryDto,
  toThesisDto,
  updateCapsule,
  updateCategory,
  updateCategoryEdge,
  updateGlossaryTerm,
  updateThesis,
} from "../services/element-editor.js";
import {
  VersioningError,
  getVersionHistory,
  isVersionedElementType,
  loadElementRow,
} from "../services/element-versioning.js";
import { isGenerationActive } from "../services/generation-service.js";
import {
  forbiddenJson,
  isUuid,
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

/* ══ Беседа 5.1 ═══════════════════════════════════════════════════════ */

/** Гейт правки: не-UUID/нет → 404, чужой → 403, генерация → 409. */
async function ownerEditGate(
  c: Context,
  id: string,
  userId: string,
): Promise<Response | null> {
  if (!isUuid(id)) return c.json(notFoundJson, 404);
  const [row] = await db
    .select({ userId: syntheses.userId })
    .from(syntheses)
    .where(eq(syntheses.id, id))
    .limit(1);
  if (!row) return c.json(notFoundJson, 404);
  if (row.userId !== userId) return c.json(forbiddenJson, 403);
  if (isGenerationActive(id))
    return c.json(
      { error: "Генерация уже идёт", code: "GENERATION_IN_PROGRESS" },
      409,
    );
  return null;
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/** Ошибки сервисов → JSON 03 §4.3; прочее — наверх (500). */
function serviceError(c: Context, err: unknown): Response {
  if (err instanceof ElementEditorError) {
    if (err.code === "NOT_FOUND")
      return c.json({ error: err.message, code: "NOT_FOUND" }, 404);
    return c.json(
      { error: err.message, code: "VALIDATION_ERROR", details: err.details ?? {} },
      400,
    );
  }
  if (err instanceof VersioningError) {
    if (err.code === "NOT_FOUND")
      return c.json({ error: err.message, code: "NOT_FOUND" }, 404);
    return c.json({ error: err.message, code: "VALIDATION_ERROR" }, 400);
  }
  throw err;
}

const invalidIdJson = { error: "Элемент не найден", code: "NOT_FOUND" } as const;

/* ── GET /:id/categories/:catId ──────────────────────────────────────── */

elementsRoutes.get("/:id/categories/:catId", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  const catId = c.req.param("catId");
  if (!isUuid(catId)) return c.json(invalidIdJson, 404);
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, catId), eq(categories.synthesisId, res.row.id)))
    .limit(1);
  if (!row) return c.json(invalidIdJson, 404);
  return c.json({ category: toCategoryDto(row) });
});

/* ── PATCH /:id/categories/:catId ────────────────────────────────────── */

elementsRoutes.patch("/:id/categories/:catId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const gate = await ownerEditGate(c, id, user.id);
  if (gate) return gate;
  const catId = c.req.param("catId");
  if (!isUuid(catId)) return c.json(invalidIdJson, 404);
  try {
    const result = await updateCategory(id, catId, await readJson(c));
    return c.json(result);
  } catch (err) {
    return serviceError(c, err);
  }
});

/* ── PATCH / DELETE /:id/edges/:edgeId ───────────────────────────────── */

elementsRoutes.patch("/:id/edges/:edgeId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const gate = await ownerEditGate(c, id, user.id);
  if (gate) return gate;
  const edgeId = c.req.param("edgeId");
  if (!isUuid(edgeId)) return c.json(invalidIdJson, 404);
  try {
    const result = await updateCategoryEdge(id, edgeId, await readJson(c));
    return c.json(result);
  } catch (err) {
    return serviceError(c, err);
  }
});

elementsRoutes.delete("/:id/edges/:edgeId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const gate = await ownerEditGate(c, id, user.id);
  if (gate) return gate;
  const edgeId = c.req.param("edgeId");
  if (!isUuid(edgeId)) return c.json(invalidIdJson, 404);
  try {
    const result = await deleteCategoryEdge(id, edgeId);
    return c.json({ ok: true, ...result });
  } catch (err) {
    return serviceError(c, err);
  }
});

/* ── GET /:id/theses, PATCH /:id/theses/:thesisId ────────────────────── */

elementsRoutes.get("/:id/theses", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  const rows = await db
    .select()
    .from(theses)
    .where(eq(theses.synthesisId, res.row.id))
    .orderBy(asc(theses.thesisNum));
  return c.json({ theses: rows.map(toThesisDto) });
});

elementsRoutes.patch("/:id/theses/:thesisId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const gate = await ownerEditGate(c, id, user.id);
  if (gate) return gate;
  const thesisId = c.req.param("thesisId");
  if (!isUuid(thesisId)) return c.json(invalidIdJson, 404);
  try {
    const result = await updateThesis(id, thesisId, await readJson(c));
    return c.json(result);
  } catch (err) {
    return serviceError(c, err);
  }
});

/* ── GET /:id/glossary, PATCH /:id/glossary/:termId ──────────────────── */

elementsRoutes.get("/:id/glossary", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  const rows = await db
    .select()
    .from(glossaryTerms)
    .where(eq(glossaryTerms.synthesisId, res.row.id))
    .orderBy(asc(glossaryTerms.position));
  return c.json({ terms: rows.map(toGlossaryDto) });
});

elementsRoutes.patch("/:id/glossary/:termId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const gate = await ownerEditGate(c, id, user.id);
  if (gate) return gate;
  const termId = c.req.param("termId");
  if (!isUuid(termId)) return c.json(invalidIdJson, 404);
  try {
    const result = await updateGlossaryTerm(id, termId, await readJson(c));
    return c.json(result);
  } catch (err) {
    return serviceError(c, err);
  }
});

/* ── Версии и откат ──────────────────────────────────────────────────── */

elementsRoutes.get(
  "/:id/elements/:elementType/:elementId/versions",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const res = await loadSynthesisForRead(c.req.param("id"), user.id);
    if (res.access === "notfound") return c.json(notFoundJson, 404);
    if (res.access === "forbidden") return c.json(forbiddenJson, 403);
    const elementType = c.req.param("elementType");
    const elementId = c.req.param("elementId");
    if (!isVersionedElementType(elementType))
      return c.json(
        { error: "Неизвестный тип элемента", code: "VALIDATION_ERROR", details: { elementType } },
        400,
      );
    if (!isUuid(elementId)) return c.json(invalidIdJson, 404);
    const versions = await getVersionHistory(res.row.id, elementType, elementId);
    if (versions.length === 0) {
      // Версий нет: элемент существует → пустой список; иначе 404
      const row = await loadElementRow(res.row.id, elementType, elementId);
      if (!row) return c.json(invalidIdJson, 404);
    }
    return c.json({ versions });
  },
);

elementsRoutes.post(
  "/:id/elements/:elementType/:elementId/rollback",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const gate = await ownerEditGate(c, id, user.id);
    if (gate) return gate;
    const elementType = c.req.param("elementType");
    const elementId = c.req.param("elementId");
    if (!isVersionedElementType(elementType))
      return c.json(
        { error: "Неизвестный тип элемента", code: "VALIDATION_ERROR", details: { elementType } },
        400,
      );
    if (!isUuid(elementId)) return c.json(invalidIdJson, 404);
    const body = await readJson(c);
    const version =
      body && typeof body === "object" ? (body as { version?: unknown }).version : undefined;
    if (typeof version !== "number" || !Number.isInteger(version) || version < 1)
      return c.json(
        { error: "Требуется version ≥ 1", code: "VALIDATION_ERROR", details: { version: "целое ≥ 1" } },
        400,
      );
    try {
      const result = await rollbackElement(id, elementType, elementId, version);
      return c.json(result);
    } catch (err) {
      return serviceError(c, err);
    }
  },
);

/* ── POST /:id/elements/auto-rename ──────────────────────────────────── */

elementsRoutes.post("/:id/elements/auto-rename", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const gate = await ownerEditGate(c, id, user.id);
  if (gate) return gate;
  const body = await readJson(c);
  const b = (body && typeof body === "object" ? body : {}) as {
    oldName?: unknown;
    newName?: unknown;
  };
  try {
    const result = await autoRenameReferences(
      id,
      String(b.oldName ?? ""),
      String(b.newName ?? ""),
    );
    return c.json(result);
  } catch (err) {
    return serviceError(c, err);
  }
});

/* ── PATCH /:id/capsule ──────────────────────────────────────────────── */

elementsRoutes.patch("/:id/capsule", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const gate = await ownerEditGate(c, id, user.id);
  if (gate) return gate;
  const body = await readJson(c);
  const html =
    body && typeof body === "object" ? (body as { html?: unknown }).html : undefined;
  try {
    const result = await updateCapsule(id, html);
    return c.json(result);
  } catch (err) {
    return serviceError(c, err);
  }
});
