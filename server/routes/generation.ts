/**
 * Роуты перегенерации (беседа 2.2; 03-spec §2.5):
 *
 *   POST /syntheses/:id/regenerate/:sectionKey → { ok: true }
 *        body { context?: string }
 *   POST /syntheses/:id/regenerate-subsection  → { ok: true }
 *        body { sectionKey, subsectionName, userNote?,
 *               includeCurrentContent? }
 *
 * Решения:
 *  - owner-only (перегенерация — edit-операция, правило планов 2.1);
 *  - не-UUID id → 404 (guard до PG, правило 1.6);
 *  - активная генерация → 409 GENERATION_IN_PROGRESS (03 §4.3);
 *  - исполнение — фоном под generation-слотом; прогресс — WebSocket
 *    (stream_delta/section_done); ошибка стрима — stream_error БЕЗ
 *    pausedState (паритет ручной перегенерации исходника [20716]);
 *  - add/delete разделов намеренно НЕ здесь: только через планы (§2.6).
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { syntheses } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  isGenerationActive,
  startSectionRegeneration,
  startSubsectionRegeneration,
} from "../services/generation-service.js";
import { isUuid } from "./syntheses.js";

export const generationRoutes = new Hono<AuthEnv>();

/** Владелец и существование; null = гейты пройдены. */
async function ownerGate(
  c: Context,
  id: string,
  userId: string,
): Promise<Response | null> {
  if (!isUuid(id))
    return c.json({ error: "Синтез не найден", code: "NOT_FOUND" }, 404);
  const [row] = await db
    .select({ userId: syntheses.userId })
    .from(syntheses)
    .where(eq(syntheses.id, id))
    .limit(1);
  if (!row)
    return c.json({ error: "Синтез не найден", code: "NOT_FOUND" }, 404);
  if (row.userId !== userId)
    return c.json({ error: "Нет доступа к синтезу", code: "FORBIDDEN" }, 403);
  if (isGenerationActive(id)) {
    return c.json(
      { error: "Генерация уже идёт", code: "GENERATION_IN_PROGRESS" },
      409,
    );
  }
  return null;
}

/* ── POST /syntheses/:id/regenerate/:sectionKey ──────────────────────── */

generationRoutes.post(
  "/:id/regenerate/:sectionKey",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const sectionKey = c.req.param("sectionKey");
    const gate = await ownerGate(c, id, user.id);
    if (gate) return gate;

    let context: string | undefined;
    try {
      const body = (await c.req.json()) as { context?: string };
      if (body && typeof body.context === "string") context = body.context;
    } catch {
      /* пустое тело допустимо */
    }

    void startSectionRegeneration(id, user.id, sectionKey, context ?? null);
    return c.json({ ok: true });
  },
);

/* ── POST /syntheses/:id/regenerate-subsection ───────────────────────── */

generationRoutes.post(
  "/:id/regenerate-subsection",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const gate = await ownerGate(c, id, user.id);
    if (gate) return gate;

    let body: {
      sectionKey?: string;
      subsectionName?: string;
      userNote?: string;
      includeCurrentContent?: boolean;
    };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: "Невалидный JSON", code: "VALIDATION_ERROR" }, 400);
    }
    if (
      typeof body.sectionKey !== "string" ||
      typeof body.subsectionName !== "string"
    ) {
      return c.json(
        {
          error: "Требуются sectionKey и subsectionName",
          code: "VALIDATION_ERROR",
        },
        400,
      );
    }

    void startSubsectionRegeneration(
      id,
      user.id,
      body.sectionKey,
      body.subsectionName,
      {
        ...(body.userNote !== undefined ? { userNote: body.userNote } : {}),
        ...(body.includeCurrentContent !== undefined
          ? { includeCurrentContent: body.includeCurrentContent }
          : {}),
      },
    );
    return c.json({ ok: true });
  },
);
