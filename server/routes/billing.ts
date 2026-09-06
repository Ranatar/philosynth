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

import { requireAuth, type AuthEnv } from "../middleware/auth.js";
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
    return c.json({ error: "Ключ не найден", code: "NOT_FOUND" }, 404);
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
  if (Number.isNaN(d.getTime())) return { error: `${name}: ожидается ISO-дата` };
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
  if (synthesisId && !UUID_RE.test(synthesisId)) details.synthesisId = "ожидается UUID";
  if (Object.keys(details).length > 0) {
    return c.json({ error: "Невалидные параметры", code: "VALIDATION_ERROR", details }, 400);
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

billingRoutes.get("/plans", async (c) => {
  return c.json({ plans: await getPlans() });
});

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
      { error: "planId не задан", code: "VALIDATION_ERROR", details: { planId: "ожидается UUID тарифа" } },
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
