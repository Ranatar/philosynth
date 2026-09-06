/**
 * Роуты трансформаций представлений graph↔theses (беседа 5.5; 03-spec
 * §2.15):
 *
 *   POST /syntheses/:id/transform/graph-to-theses   → { ok: true }
 *   POST /syntheses/:id/transform/theses-to-graph   → { ok: true }
 *   GET  /syntheses/:id/transforms                  → { transforms }
 *   POST /syntheses/:id/transforms/:transformId/rollback
 *                                                   → { ok: true, transform, summary }
 *
 * Решения:
 *  - POST /transform/* отвечают { ok: true } и исполняются ФОНОМ под
 *    generation-слотом (решение п.5 03 §3.1, паритет routes/enrichment
 *    5.3 и routes/modes 4.1): дельты stream_delta "transform:{direction}",
 *    transform_started → transform_done, обрыв → stream_error;
 *  - гейты POST: не-UUID → 404, чужой → 403, активная операция → 409
 *    GENERATION_IN_PROGRESS (ownerEditGate); пустой источник → 400
 *    VALIDATION_ERROR («No theses to transform» / «No graph to transform»
 *    — edge case протокола 5.5) СИНХРОННО, до запуска фона;
 *  - rollback — синхронный (Claude не нужен): только владелец, под тем же
 *    409-гейтом (гонка с генерацией графа/тезисов); неизвестный id → 404.
 *    03 §2.15 обещает «→ { ok: true }» — ответ АДДИТИВНО несёт transform
 *    (строка-откат) и summary, чтобы клиент обновил историю без GET;
 *  - GET — владелец ИЛИ публичный синтез (правило транспорта чтения 1.6).
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { syntheses } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import { billingCheck } from "../middleware/billing-check.js"; // 6.1
import { isGenerationActive } from "../services/generation-service.js";
import {
  TransformError,
  emptySourceMessage,
  getTransformHistory,
  hasSourceRepresentation,
  rollbackTransform,
  startTransform,
} from "../services/representation-transformer.js";
import {
  forbiddenJson,
  isUuid,
  loadSynthesisForRead,
  notFoundJson,
} from "./syntheses.js";

export const transformRoutes = new Hono<AuthEnv>();

/** Гейт правки: не-UUID/нет → 404, чужой → 403, активная операция → 409. */
async function ownerEditGate(c: Context, id: string, userId: string): Promise<Response | null> {
  if (!isUuid(id)) return c.json(notFoundJson, 404);
  const [row] = await db
    .select({ userId: syntheses.userId })
    .from(syntheses)
    .where(eq(syntheses.id, id))
    .limit(1);
  if (!row) return c.json(notFoundJson, 404);
  if (row.userId !== userId) return c.json(forbiddenJson, 403);
  if (isGenerationActive(id))
    return c.json({ error: "Генерация уже идёт", code: "GENERATION_IN_PROGRESS" }, 409);
  return null;
}

function fireAndForget(label: string, p: Promise<void>): void {
  void p.catch((err) => console.error(`${label}:`, err));
}

async function postTransform(
  c: Context<AuthEnv>,
  id: string,
  direction: "graph_to_theses" | "theses_to_graph",
): Promise<Response> {
  const user = c.get("user");
  const gate = await ownerEditGate(c, id, user.id);
  if (gate) return gate;
  if (!(await hasSourceRepresentation(id, direction))) {
    return c.json(
      {
        error: emptySourceMessage(direction),
        code: "VALIDATION_ERROR",
        details: { source: emptySourceMessage(direction) },
      },
      400,
    );
  }
  fireAndForget(`startTransform(${id}, ${direction})`, startTransform(id, user.id, direction));
  return c.json({ ok: true });
}

transformRoutes.post("/:id/transform/graph-to-theses", requireAuth, billingCheck({ quota: "regenerations" }), (c) =>
  postTransform(c, c.req.param("id"), "graph_to_theses"),
);
transformRoutes.post("/:id/transform/theses-to-graph", requireAuth, billingCheck({ quota: "regenerations" }), (c) =>
  postTransform(c, c.req.param("id"), "theses_to_graph"),
);

transformRoutes.get("/:id/transforms", requireAuth, async (c) => {
  const user = c.get("user");
  const res = await loadSynthesisForRead(c.req.param("id"), user.id);
  if (res.access === "notfound") return c.json(notFoundJson, 404);
  if (res.access === "forbidden") return c.json(forbiddenJson, 403);
  const transforms = await getTransformHistory(res.row.id);
  return c.json({ transforms });
});

transformRoutes.post("/:id/transforms/:transformId/rollback", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const transformId = c.req.param("transformId");
  const gate = await ownerEditGate(c, id, user.id);
  if (gate) return gate;
  if (!isUuid(transformId))
    return c.json({ error: "Трансформация не найдена", code: "NOT_FOUND" }, 404);
  try {
    const { transform, summary } = await rollbackTransform(id, transformId);
    return c.json({ ok: true, transform, summary });
  } catch (err) {
    if (err instanceof TransformError) {
      if (err.code === "NOT_FOUND") return c.json({ error: err.message, code: "NOT_FOUND" }, 404);
      return c.json({ error: err.message, code: "VALIDATION_ERROR", details: err.details ?? {} }, 400);
    }
    throw err;
  }
});
