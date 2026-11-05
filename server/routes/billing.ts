/**
 * Роуты биллинга (беседа 6.1; 03-spec §2.10, коды §4.3). Тонкие обёртки
 * над api-key-service / billing-service / subscription-service:
 *
 *   GET    /billing/usage            ?from&to&synthesisId → { entries, totals, byMode }
 *   POST   /billing/api-key          { key } → { keyId, prefix }
 *   DELETE /billing/api-key/:id      → { ok: true }
 *   GET    /billing/api-key          → { keys: ApiKeyInfo[] }
 *   POST   /billing/topup            { amountUsd } → { clientSecret, paymentIntentId }
 *   POST   /billing/topup/confirm    { paymentIntentId } → { balanceUsd, transaction }
 *   GET    /billing/subscription     → SubscriptionOverview
 *   GET    /billing/plans            → { plans }
 *   POST   /billing/subscribe        { planId } → { clientSecret, subscriptionId }
 *   POST   /billing/subscription/cancel  → { subscription }
 *   POST   /billing/subscription/resume  → { subscription }
 *   POST   /billing/webhook          (Stripe, без сессии; подпись)
 *   GET    /billing/transactions     ?page&limit → { items, total }
 *
 * 15.4 (Д-74), под requireAdmin — тарифы админкой и редакциями
 * (services/plan-admin.ts; 03 §2.10):
 *   GET    /billing/admin/plans              → { plans: AdminPlanRow[] } (все редакции + живые подписки)
 *   POST   /billing/admin/plans              PlanCreateInput → AdminPlanResult (новое семейство, 201)
 *   PATCH  /billing/admin/plans/:id          PlanUpdateInput → AdminPlanResult (на месте; 409 PLAN_HAS_SUBSCRIPTIONS)
 *   POST   /billing/admin/plans/:id/editions PlanEditionInput → AdminPlanResult (новая редакция, 201)
 *
 * Решения:
 *  - тело POST /api-key принимает `key` (текст 6.1) И `encryptedKey`
 *    (03 §2.10 — имя вводит в заблуждение: клиент шлёт ОТКРЫТЫЙ ключ по
 *    TLS, шифрует сервер; дыра доков — в патч);
 *  - Stripe не настроен → 503 STRIPE_UNAVAILABLE у пополнения/подписки;
 *    остальное работает;
 *  - webhook читает СЫРОЕ тело (подпись считается по нему), отвечает 200
 *    и на необработанные события (Stripe иначе ретраит), 400 — на
 *    невалидную подпись; монтируется в том же роутере ДО requireAuth;
 *  - from/to — ISO-даты (невалидные → 400 VALIDATION_ERROR), synthesisId —
 *    UUID (иначе 400).
 */
import { Hono } from "hono";
import type { Context } from "hono";

import { requireAdmin } from "../middleware/admin-only.js";
import { optionalAuth, requireAuth, type AuthEnv } from "../middleware/auth.js";
import { clientIpOf } from "../services/admin-audit.js";
import {
  ApiKeyError,
  deleteApiKey,
  listApiKeys,
  storeApiKey,
} from "../services/api-key-service.js";
import {
  BillingError,
  billingErrorStatus,
  confirmTopup,
  createTopup,
  getTransactionHistory,
  getUsageHistory,
} from "../services/billing-service.js";
import {
  createPlanEdition,
  createPlanFamily,
  listPlansForAdmin,
  PlanAdminError,
  planAdminErrorStatus,
  updatePlan,
} from "../services/plan-admin.js";
import {
  constructWebhookEvent,
  StripeError,
} from "../services/stripe-client.js";
import {
  cancelSubscription,
  createSubscription,
  getActiveSubscription,
  getPlans,
  handleStripeWebhook,
  resumeSubscription,
  SubscriptionError,
} from "../services/subscription-service.js";
import { CryptoConfigError } from "../utils/crypto.js";
import { tl } from "@philosynth/shared/i18n/t";

export const billingRoutes = new Hono<AuthEnv>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Единый маппинг ошибок сервисов → HTTP (формат { error, code, details? }). */
function errorResponse(c: Context<AuthEnv>, err: unknown): Response {
  if (err instanceof BillingError) {
    return c.json(
      { error: err.message, code: err.code, ...(err.details !== undefined ? { details: err.details } : {}) },
      billingErrorStatus(err.code),
    );
  }
  if (err instanceof ApiKeyError || err instanceof SubscriptionError) {
    const status =
      err.code === "NOT_FOUND" ? 404 : err.code === "QUOTA_EXCEEDED" ? 403 : 400;
    return c.json(
      { error: err.message, code: err.code, ...(err.details !== undefined ? { details: err.details } : {}) },
      status,
    );
  }
  if (err instanceof PlanAdminError) {
    return c.json(
      { error: err.message, code: err.code, ...(err.details !== undefined ? { details: err.details } : {}) },
      planAdminErrorStatus(err.code),
    );
  }
  if (err instanceof StripeError) {
    if (err.code === "STRIPE_UNAVAILABLE") {
      return c.json({ error: err.message, code: "STRIPE_UNAVAILABLE" }, 503);
    }
    return c.json(
      { error: `Stripe: ${err.message}`, code: "STRIPE_ERROR", details: { stripeCode: err.stripeCode ?? null } },
      502,
    );
  }
  if (err instanceof CryptoConfigError) {
    return c.json({ error: err.message, code: "INTERNAL_ERROR" }, 503);
  }
  throw err;
}

async function readJson(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/* ── Webhook (без сессии; ДО requireAuth) ────────────────────────────── */

billingRoutes.post("/webhook", async (c) => {
  const raw = await c.req.text();
  let event;
  try {
    event = constructWebhookEvent(raw, c.req.header("stripe-signature"));
  } catch (err) {
    if (err instanceof StripeError) {
      return c.json({ error: err.message, code: "WEBHOOK_SIGNATURE_INVALID" }, 400);
    }
    throw err;
  }
  const result = await handleStripeWebhook(event);
  return c.json({ received: true, ...result });
});

/* ── Всё остальное — под сессией ─────────────────────────────────────── */

/* ── GET /plans — тарифы БЕЗ входа (8.6 п.6c: цена службы видна до
 *    регистрации); optionalAuth ради единообразия с гостевыми путями
 *    (сессия, если есть, валидируется и подчищается). Регистрируется ДО
 *    requireAuth; остальные billing-пути не тронуты. ── */
billingRoutes.get("/plans", optionalAuth, async (c) => {
  return c.json({ plans: await getPlans() });
});

billingRoutes.use("*", requireAuth);

/* ── API-ключи ───────────────────────────────────────────────────────── */

billingRoutes.get("/api-key", async (c) => {
  const user = c.get("user");
  return c.json({ keys: await listApiKeys(user.id) });
});

billingRoutes.post("/api-key", async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const key = body.key ?? body.encryptedKey;
  try {
    const stored = await storeApiKey(user.id, typeof key === "string" ? key : "");
    return c.json(stored, 201);
  } catch (err) {
    return errorResponse(c, err);
  }
});

billingRoutes.delete("/api-key/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) {
    return c.json({ error: tl("server.routes.billing.keyNotFound", "Ключ не найден"), code: "NOT_FOUND" }, 404);
  }
  try {
    await deleteApiKey(id, user.id);
    return c.json({ ok: true });
  } catch (err) {
    return errorResponse(c, err);
  }
});

/* ── Пополнение баланса ──────────────────────────────────────────────── */

billingRoutes.post("/topup", async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const amount =
    typeof body.amountUsd === "number"
      ? body.amountUsd
      : typeof body.amountUsd === "string"
        ? Number(body.amountUsd)
        : NaN;
  try {
    const intent = await createTopup(user.id, amount);
    return c.json(intent);
  } catch (err) {
    return errorResponse(c, err);
  }
});

billingRoutes.post("/topup/confirm", async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  try {
    const result = await confirmTopup(
      user.id,
      typeof body.paymentIntentId === "string" ? body.paymentIntentId : "",
    );
    return c.json(result);
  } catch (err) {
    return errorResponse(c, err);
  }
});

/* ── История ─────────────────────────────────────────────────────────── */

function parseDate(v: string | undefined, name: string): { date?: Date; error?: string } {
  if (v === undefined || v === "") return {};
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { error: tl("server.routes.billing.isoDateExpected", "{name}: ожидается ISO-дата", { name }) };
  return { date: d };
}

billingRoutes.get("/usage", async (c) => {
  const user = c.get("user");
  const from = parseDate(c.req.query("from"), "from");
  const to = parseDate(c.req.query("to"), "to");
  const synthesisId = c.req.query("synthesisId");
  const details: Record<string, string> = {};
  if (from.error) details.from = from.error;
  if (to.error) details.to = to.error;
  if (synthesisId && !UUID_RE.test(synthesisId)) details.synthesisId = tl("server.routes.billing.uuidExpected", "ожидается UUID");
  if (Object.keys(details).length > 0) {
    return c.json({ error: tl("server.routes.billing.invalidParams", "Невалидные параметры"), code: "VALIDATION_ERROR", details }, 400);
  }
  const history = await getUsageHistory(user.id, {
    from: from.date,
    to: to.date,
    synthesisId: synthesisId || undefined,
  });
  return c.json(history);
});

billingRoutes.get("/transactions", async (c) => {
  const user = c.get("user");
  const page = Number(c.req.query("page") ?? "1");
  const limit = Number(c.req.query("limit") ?? "50");
  const history = await getTransactionHistory(user.id, {
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 50,
  });
  return c.json(history);
});

/* ── Подписки ────────────────────────────────────────────────────────── */

billingRoutes.get("/subscription", async (c) => {
  const user = c.get("user");
  return c.json(await getActiveSubscription(user.id));
});

billingRoutes.post("/subscribe", async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const planId = typeof body.planId === "string" ? body.planId : "";
  if (!UUID_RE.test(planId)) {
    return c.json(
      { error: tl("server.routes.billing.planIdMissing", "planId не задан"), code: "VALIDATION_ERROR", details: { planId: tl("server.routes.billing.planUuidExpected", "ожидается UUID тарифа") } },
      400,
    );
  }
  try {
    const result = await createSubscription(user.id, planId);
    return c.json(result, 201);
  } catch (err) {
    return errorResponse(c, err);
  }
});

billingRoutes.post("/subscription/cancel", async (c) => {
  const user = c.get("user");
  try {
    return c.json({ subscription: await cancelSubscription(user.id) });
  } catch (err) {
    return errorResponse(c, err);
  }
});

billingRoutes.post("/subscription/resume", async (c) => {
  const user = c.get("user");
  try {
    return c.json({ subscription: await resumeSubscription(user.id) });
  } catch (err) {
    return errorResponse(c, err);
  }
});

/* ── 15.4 (Д-74): тарифы админкой — под requireAdmin ─────────────────── */

billingRoutes.use("/admin/*", requireAdmin);

type PlanBody = Record<string, unknown>;

/** Поля тарифа из тела: заданные — приводятся к числу/строке, незаданные —
 *  опускаются (сервис сам валидирует общей функцией plan-economics). */
function planFieldsOf(body: PlanBody): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const num = (k: string) => {
    if (body[k] === undefined || body[k] === null || body[k] === "") return;
    out[k] = typeof body[k] === "number" ? body[k] : Number(body[k]);
  };
  if (typeof body.displayName === "string") out.displayName = body.displayName;
  num("priceUsd");
  if (body.billingPeriod !== undefined) out.billingPeriod = body.billingPeriod;
  for (const k of ["quotaSyntheses", "quotaRegenerations", "quotaModes", "quotaEnrichments"]) num(k);
  return out;
}

function planIdParam(c: Context<AuthEnv>): string | Response {
  const id = c.req.param("id") ?? "";
  if (!UUID_RE.test(id)) {
    return c.json(
      { error: tl("server.routes.billing.planIdMissing", "planId не задан"), code: "VALIDATION_ERROR", details: { planId: tl("server.routes.billing.planUuidExpected", "ожидается UUID тарифа") } },
      400,
    );
  }
  return id;
}

billingRoutes.get("/admin/plans", async (c) => {
  return c.json({ plans: await listPlansForAdmin() });
});

billingRoutes.post("/admin/plans", async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const fields = planFieldsOf(body);
  try {
    const result = await createPlanFamily(
      {
        name: typeof body.name === "string" ? body.name : "",
        ...(fields as Omit<Parameters<typeof createPlanFamily>[0], "name">),
        ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
      },
      { id: user.id, ip: clientIpOf(c) },
    );
    return c.json(result, 201);
  } catch (err) {
    return errorResponse(c, err);
  }
});

billingRoutes.patch("/admin/plans/:id", async (c) => {
  const user = c.get("user");
  const id = planIdParam(c);
  if (typeof id !== "string") return id;
  const body = await readJson(c);
  const input = {
    ...planFieldsOf(body),
    ...(typeof body.isActive === "boolean" ? { isActive: body.isActive } : {}),
  } as Parameters<typeof updatePlan>[1];
  try {
    return c.json(await updatePlan(id, input, { id: user.id, ip: clientIpOf(c) }));
  } catch (err) {
    return errorResponse(c, err);
  }
});

billingRoutes.post("/admin/plans/:id/editions", async (c) => {
  const user = c.get("user");
  const id = planIdParam(c);
  if (typeof id !== "string") return id;
  const body = await readJson(c);
  const input = planFieldsOf(body) as Parameters<typeof createPlanEdition>[1];
  try {
    return c.json(await createPlanEdition(id, input, { id: user.id, ip: clientIpOf(c) }), 201);
  } catch (err) {
    return errorResponse(c, err);
  }
});
