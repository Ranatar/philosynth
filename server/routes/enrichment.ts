/**
 * Роуты обогащения элементов (беседа 5.3; 03-spec §2.14):
 *
 *   POST /syntheses/:id/enrich/category/:catId   { type }  → { ok: true }
 *   POST /syntheses/:id/enrich/edge/:edgeId      { type }  → { ok: true }
 *   POST /syntheses/:id/justify-characteristic
 *        { elementId, elementType, characteristic, value } → { ok: true }
 *   GET  /syntheses/:id/enrichments/:elementId    → { enrichments }
 *   GET  /syntheses/:id/justifications/:elementId → { justifications }
 *
 * Решения:
 *  - POST отвечают { ok: true } и исполняются ФОНОМ под generation-слотом —
 *    решение 2026-09-02 п.5 (03 §3.1): «HTTP-роут создаёт операцию,
 *    результат — WS» (enrichment_delta / enrichment_done с enrichmentId и
 *    content). §2.14 в теле роутов пишет «→ { enrichment }» — противоречие
 *    внутри 03, выбран п.5 как более позднее явное решение и паритет
 *    режимов 4.1 (POST /run → ok, mode_done по WS); дыра доков — в патч
 *    на завершение беседы;
 *  - гейты POST: не-UUID → 404, чужой → 403, активная операция → 409
 *    GENERATION_IN_PROGRESS (ownerEditGate, паритет routes/modes 4.1);
 *    элемент не в синтезе → 404 синхронно (до старта фона — edge case
 *    протокола «несуществующая категория → 404»);
 *  - валидация тел — синхронно, 400 VALIDATION_ERROR + details по полям;
 *    диапазон value зависит от характеристики (п.18 правки 2026-09-02);
 *  - GET — владелец ИЛИ публичный синтез (loadSynthesisForRead, правило
 *    транспорта чтения 1.6); ?elementType=category|edge — необязательный
 *    фильтр (элемент ищется по UUID, тип нужен редко).
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { and, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { categories, categoryEdges, syntheses } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  EnrichmentError,
  getEnrichments,
  getJustifications,
  isCategoryEnrichmentType,
  isEdgeEnrichmentType,
  startEnrichment,
  startJustification,
  validateJustifyInput,
  type EnrichableType,
} from "../services/element-enrichment.js";
import { isGenerationActive } from "../services/generation-service.js";
import {
  forbiddenJson,
  isUuid,
  loadSynthesisForRead,
  notFoundJson,
} from "./syntheses.js";

export const enrichmentRoutes = new Hono<AuthEnv>();

const elementNotFoundJson = { error: "Элемент не найден", code: "NOT_FOUND" } as const;

/** Гейт запуска: не-UUID/нет → 404, чужой → 403, активная операция → 409. */
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

function validationJson(c: Context, details: Record<string, string>): Response {
  return c.json({ error: "Невалидные данные", code: "VALIDATION_ERROR", details }, 400);
}

/** Элемент принадлежит синтезу? (синхронный 404 до фона) */
async function elementExists(
  synthesisId: string,
  elementType: EnrichableType,
  elementId: string,
): Promise<boolean> {
  if (!isUuid(elementId)) return false;
  if (elementType === "category") {
    const [r] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, elementId), eq(categories.synthesisId, synthesisId)))
      .limit(1);
    return Boolean(r);
  }
  const [r] = await db
    .select({ id: categoryEdges.id })
    .from(categoryEdges)
    .where(and(eq(categoryEdges.id, elementId), eq(categoryEdges.synthesisId, synthesisId)))
    .limit(1);
  return Boolean(r);
}

/** Фоновый запуск: ошибки гейтов слота (гонка) — только в лог,
 *  stream_error клиенту шлёт сама start*-цепочка. */
function fireAndForget(label: string, p: Promise<void>): void {
  void p.catch((err) => console.error(`${label}:`, err));
}

/* ── POST /:id/enrich/category/:catId ────────────────────────────────── */

enrichmentRoutes.post("/:id/enrich/category/:catId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const catId = c.req.param("catId");
  const gate = await ownerEditGate(c, id, user.id);
  if (gate) return gate;

  const body = (await readJson(c)) as { type?: unknown } | undefined;
  const type = body?.type;
  if (!isCategoryEnrichmentType(type))
    return validationJson(c, { type: "Ожидается description | evolution | justification" });
  if (!(await elementExists(id, "category", catId)))
    return c.json(elementNotFoundJson, 404);

  fireAndForget(
    `startEnrichment(${id}, category:${catId}, ${type})`,
    startEnrichment(id, user.id, "category", catId, type),
  );
  return c.json({ ok: true });
});

/* ── POST /:id/enrich/edge/:edgeId ───────────────────────────────────── */

enrichmentRoutes.post("/:id/enrich/edge/:edgeId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const edgeId = c.req.param("edgeId");
  const gate = await ownerEditGate(c, id, user.id);
  if (gate) return gate;

  const body = (await readJson(c)) as { type?: unknown } | undefined;
  const type = body?.type;
  if (!isEdgeEnrichmentType(type))
    return validationJson(c, { type: "Ожидается justification | counterarguments" });
  if (!(await elementExists(id, "edge", edgeId)))
    return c.json(elementNotFoundJson, 404);

  fireAndForget(
    `startEnrichment(${id}, edge:${edgeId}, ${type})`,
    startEnrichment(id, user.id, "edge", edgeId, type),
  );
  return c.json({ ok: true });
});

/* ── POST /:id/justify-characteristic ────────────────────────────────── */

enrichmentRoutes.post("/:id/justify-characteristic", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const gate = await ownerEditGate(c, id, user.id);
  if (gate) return gate;

  const body = await readJson(c);
  let input;
  try {
    input = validateJustifyInput(body);
  } catch (err) {
    if (err instanceof EnrichmentError)
      return validationJson(c, err.details ?? {});
    throw err;
  }
  if (!(await elementExists(id, input.elementType, input.elementId)))
    return c.json(elementNotFoundJson, 404);

  fireAndForget(
    `startJustification(${id}, ${input.elementType}:${input.elementId}, ${input.characteristic})`,
    startJustification(id, user.id, input),
  );
  return c.json({ ok: true });
});

/* ── GET /:id/enrichments/:elementId ─────────────────────────────────── */

function elementTypeFilter(c: Context): EnrichableType | undefined {
  const q = c.req.query("elementType");
  return q === "category" || q === "edge" ? q : undefined;
}

enrichmentRoutes.get("/:id/enrichments/:elementId", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  const elementId = c.req.param("elementId");
  if (!isUuid(elementId)) return c.json(elementNotFoundJson, 404);
  const enrichments = await getEnrichments(res.row.id, elementId, elementTypeFilter(c));
  return c.json({ enrichments });
});

/* ── GET /:id/justifications/:elementId ──────────────────────────────── */

enrichmentRoutes.get("/:id/justifications/:elementId", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  const elementId = c.req.param("elementId");
  if (!isUuid(elementId)) return c.json(elementNotFoundJson, 404);
  const justifications = await getJustifications(res.row.id, elementId, elementTypeFilter(c));
  return c.json({ justifications });
});
