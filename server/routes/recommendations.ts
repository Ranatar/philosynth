/**
 * Роуты рекомендаций критики (беседа 10.1; 03-spec §2.16):
 *
 *   GET  /syntheses/:id/recommendations          ?round=N → RecommendationsResponse
 *   POST /syntheses/:id/recommendations/parse    → RecommendationsParseResponse
 *   POST /syntheses/:id/recommendations/extract  → RecommendationsExtractResponse
 *
 * Отдельный роутер, а не routes/sections.ts: там сторожа 4ao/4ar считают
 * читающие и пишущие маршруты разделов, и рекомендации — не раздел.
 *
 * Доступ — ТОЛЬКО ВЛАДЕЛЕЦ на всех трёх путях, включая чтение: рекомендации
 * касаются правки, а не чтения; чужому — 403 и на публичной концепции. Гейт
 * тот же, что у правки (ownerEditGate 5.1/9.2): не-UUID/нет → 404, чужой →
 * 403, активная операция → 409 — у POST; у GET гейта активной операции нет
 * (чтение строк БД генерации не мешает).
 *
 * extract — ОДНО обращение к модели, квота regenerations. Исполняется
 * СИНХРОННО (запрос ждёт ответа модели), в отличие от обогащений 5.3 и
 * трансформаций 5.5: фоновой операции понадобилось бы новое WS-сообщение, а
 * клиент до беседы 10.3 принял бы чужой stream_error за обрыв генерации
 * документа. Отказы биллинга и занятый слот — обычными кодами §4.3.
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { syntheses } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import { billingCheck } from "../middleware/billing-check.js";
import { GenerationError } from "../services/generation-service.js";
import {
  RecommendationsError,
  extractRecommendationsTable,
  listRecommendations,
  parseAndStore,
} from "../services/recommendations.js";
import { StreamError } from "../services/streaming-manager.js";
import { ownerEditGate } from "./elements.js";
import { forbiddenJson, isUuid, notFoundJson } from "./syntheses.js";

import type { Context } from "hono";

export const recommendationsRoutes = new Hono<AuthEnv>();

/** Гейт чтения: владелец, без проверки активной операции. */
async function ownerReadGate(c: Context, id: string, userId: string): Promise<Response | null> {
  if (!isUuid(id)) return c.json(notFoundJson, 404);
  const [row] = await db
    .select({ userId: syntheses.userId })
    .from(syntheses)
    .where(eq(syntheses.id, id))
    .limit(1);
  if (!row) return c.json(notFoundJson, 404);
  if (row.userId !== userId) return c.json(forbiddenJson, 403);
  return null;
}

const BILLING_403 = new Set([
  "BILLING_REQUIRED",
  "QUOTA_EXCEEDED",
  "INSUFFICIENT_BALANCE",
  "API_KEY_MISSING",
  "API_KEY_INVALID",
  "FORBIDDEN",
]);

function serviceError(c: Context, err: unknown): Response {
  if (err instanceof RecommendationsError) {
    const status =
      err.code === "NOT_FOUND" ? 404 : err.code === "RECOMMENDATIONS_TABLE_INVALID" ? 422 : 400;
    return c.json(
      { error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) },
      status,
    );
  }
  if (err instanceof GenerationError) {
    const status =
      err.code === "GENERATION_IN_PROGRESS" ? 409
      : err.code === "RATE_LIMIT" ? 429
      : err.code === "NOT_FOUND" ? 404
      : BILLING_403.has(err.code) ? 403
      : 500;
    return c.json(
      { error: err.message, code: err.code, ...(err.details ? { details: err.details } : {}) },
      status,
    );
  }
  if (err instanceof StreamError)
    // Обрыв обращения к модели: документ не тронут, запрос можно повторить
    return c.json(
      { error: err.message, code: "GENERATION_FAILED", details: { kind: err.kind } },
      502,
    );
  throw err;
}

/* ── GET /:id/recommendations ────────────────────────────────────────── */

recommendationsRoutes.get("/:id/recommendations", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const gate = await ownerReadGate(c, id, user.id);
  if (gate) return gate;
  const q = c.req.query("round");
  let round: number | undefined;
  if (q !== undefined) {
    round = Number(q);
    if (!Number.isInteger(round) || round < 1)
      return c.json(
        { error: "Невалидные данные", code: "VALIDATION_ERROR", details: { round: "ожидается целое ≥ 1" } },
        400,
      );
  }
  try {
    return c.json(await listRecommendations(id, round));
  } catch (err) {
    return serviceError(c, err);
  }
});

/* ── POST /:id/recommendations/parse ─────────────────────────────────── */

recommendationsRoutes.post("/:id/recommendations/parse", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const gate = await ownerEditGate(c, id, user.id);
  if (gate) return gate;
  try {
    return c.json(await parseAndStore(id));
  } catch (err) {
    return serviceError(c, err);
  }
});

/* ── POST /:id/recommendations/extract (ретрофит) ────────────────────── */

recommendationsRoutes.post(
  "/:id/recommendations/extract",
  requireAuth,
  billingCheck({ quota: "regenerations" }),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const gate = await ownerEditGate(c, id, user.id);
    if (gate) return gate;
    try {
      return c.json(await extractRecommendationsTable(id, user.id));
    } catch (err) {
      return serviceError(c, err);
    }
  },
);
