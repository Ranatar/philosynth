/**
 * Роуты планов редактирования (беседа 2.1; 03-spec §2.6).
 *
 *   POST   /syntheses/:id/plans          → { plan: EditPlan }
 *   GET    /syntheses/:id/plans/:planId  → { plan: EditPlan }
 *   PATCH  /syntheses/:id/plans/:planId  → { plan: EditPlan }
 *   DELETE /syntheses/:id/plans/:planId  → { ok: true }
 *
 *   POST   /syntheses/:id/plans/:planId/execute → { ok: true } (2.2)
 *
 * Execute: sync-гейты (владение, draft, отсутствие активной генерации) —
 * повтор проверок executePlan для честного HTTP-кода; исполнение — фоном,
 * события по WebSocket (plan_step_started/…).
 *
 * Решения:
 *  - Планы — рабочий объект ВЛАДЕЛЬЦА синтеза (edit-операции): все
 *    эндпоинты owner-only (403 FORBIDDEN), в отличие от чтения синтеза
 *    (владелец ИЛИ is_public);
 *  - не-UUID id/planId → 404 (guard до запроса к PG, правило 1.6);
 *  - создание плана при активной генерации допустимо (PLAN_CONFLICT в
 *    03 §4.3 — про ИСПОЛНЕНИЕ; проверка — у executor'а 2.2);
 *  - estimatedCost вычисляется на каждый ответ (в edit_plans не
 *    хранится — 02 §2.13).
 */
import { Hono } from "hono";

import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  PlanError,
  createPlan,
  deletePlan,
  getPlan,
  loadPlanRow,
  updatePlan,
} from "../services/edit-planner.js";
import {
  GenerationError,
  isGenerationActive,
} from "../services/generation-service.js";
import { executePlan } from "../services/plan-executor.js";
import { isUuid } from "./syntheses.js";

import type { Context } from "hono";
import type {
  CreatePlanRequest,
  UpdatePlanRequest,
} from "@philosynth/shared/types/edit-plan";

export const plansRoutes = new Hono<AuthEnv>();

const PLAN_ERROR_STATUS = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  PLAN_CONFLICT: 409,
} as const;

function errJson(c: Context, err: unknown): Response {
  if (err instanceof PlanError) {
    return c.json(
      {
        error: err.message,
        code: err.code,
        ...(err.details ? { details: err.details } : {}),
      },
      PLAN_ERROR_STATUS[err.code],
    );
  }
  // loadSynthesis (generation-service) кидает GenerationError NOT_FOUND
  if (err instanceof GenerationError && err.code === "NOT_FOUND") {
    return c.json({ error: "Синтез не найден", code: "NOT_FOUND" }, 404);
  }
  console.error("[plans] internal error:", err);
  return c.json({ error: "Внутренняя ошибка", code: "INTERNAL_ERROR" }, 500);
}

/* ── POST /syntheses/:id/plans ───────────────────────────────────────── */

plansRoutes.post("/:id/plans", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!isUuid(id))
    return c.json({ error: "Синтез не найден", code: "NOT_FOUND" }, 404);

  let body: CreatePlanRequest;
  try {
    body = (await c.req.json()) as CreatePlanRequest;
  } catch {
    return c.json({ error: "Невалидный JSON", code: "VALIDATION_ERROR" }, 400);
  }

  try {
    const plan = await createPlan(id, user.id, body);
    return c.json({ plan });
  } catch (err) {
    return errJson(c, err);
  }
});

/* ── GET /syntheses/:id/plans/:planId ────────────────────────────────── */

plansRoutes.get("/:id/plans/:planId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const planId = c.req.param("planId");
  if (!isUuid(id) || !isUuid(planId))
    return c.json({ error: "План не найден", code: "NOT_FOUND" }, 404);

  try {
    const plan = await getPlan(id, planId, user.id);
    return c.json({ plan });
  } catch (err) {
    return errJson(c, err);
  }
});

/* ── PATCH /syntheses/:id/plans/:planId ──────────────────────────────── */

plansRoutes.patch("/:id/plans/:planId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const planId = c.req.param("planId");
  if (!isUuid(id) || !isUuid(planId))
    return c.json({ error: "План не найден", code: "NOT_FOUND" }, 404);

  let body: UpdatePlanRequest;
  try {
    body = (await c.req.json()) as UpdatePlanRequest;
  } catch {
    return c.json({ error: "Невалидный JSON", code: "VALIDATION_ERROR" }, 400);
  }

  try {
    const plan = await updatePlan(id, planId, user.id, body);
    return c.json({ plan });
  } catch (err) {
    return errJson(c, err);
  }
});

/* ── DELETE /syntheses/:id/plans/:planId ─────────────────────────────── */

plansRoutes.delete("/:id/plans/:planId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const planId = c.req.param("planId");
  if (!isUuid(id) || !isUuid(planId))
    return c.json({ error: "План не найден", code: "NOT_FOUND" }, 404);

  try {
    await deletePlan(id, planId, user.id);
    return c.json({ ok: true });
  } catch (err) {
    return errJson(c, err);
  }
});

/* ── POST /syntheses/:id/plans/:planId/execute (беседа 2.2) ──────────── */

plansRoutes.post("/:id/plans/:planId/execute", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const planId = c.req.param("planId");
  if (!isUuid(id) || !isUuid(planId))
    return c.json({ error: "План не найден", code: "NOT_FOUND" }, 404);

  try {
    // Синхронные гейты (те же, что в executePlan) — честный HTTP-код
    const row = await loadPlanRow(id, planId, user.id);
    if (row.status !== "draft") {
      return c.json(
        {
          error: `План в статусе «${row.status}» нельзя исполнить`,
          code: "PLAN_CONFLICT",
        },
        409,
      );
    }
    if (isGenerationActive(id)) {
      return c.json(
        { error: "Генерация уже идёт", code: "PLAN_CONFLICT" },
        409,
      );
    }
  } catch (err) {
    return errJson(c, err);
  }

  // Исполнение — фоном; прогресс и ошибки — по WebSocket
  void executePlan(id, planId, user.id).catch((err) => {
    console.error(`executePlan(${id}, ${planId}):`, err);
  });
  return c.json({ ok: true });
});
