/**
 * Тонкий клиент Stripe REST API поверх fetch (беседа 6.1).
 *
 * Отступление от «Stripe SDK»: официальный пакет не добавляется —
 * биллингу нужны шесть вызовов (PaymentIntents create/retrieve,
 * Customers create, Subscriptions create/update/retrieve) и проверка
 * подписи webhook; форма запросов Stripe — application/x-www-form-
 * urlencoded с вложенными ключами `a[b]=…`. База API подменяется
 * env STRIPE_API_BASE (мок в тестах — тот же приём, что
 * ANTHROPIC_BASE_URL беседы 1.4).
 *
 * Пустой STRIPE_SECRET_KEY → StripeError STRIPE_UNAVAILABLE (роуты
 * пополнения/подписки отвечают 503; BYO-Key и баланс, начисленный
 * иначе, работают без Stripe).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../env.js";

export class StripeError extends Error {
  code: "STRIPE_UNAVAILABLE" | "STRIPE_ERROR" | "WEBHOOK_SIGNATURE_INVALID";
  status?: number | undefined;
  stripeCode?: string | undefined;
  constructor(
    code: StripeError["code"],
    message: string,
    status?: number,
    stripeCode?: string,
  ) {
    super(message);
    this.name = "StripeError";
    this.code = code;
    this.status = status;
    this.stripeCode = stripeCode;
  }
}

/* ── Формат тела Stripe: вложенные объекты → a[b][c]=v ─────────────── */

type FormValue = string | number | boolean | null | undefined | FormObject | FormValue[];
interface FormObject {
  [k: string]: FormValue;
}

export function encodeForm(obj: FormObject, prefix = ""): string {
  const parts: string[] = [];
  const walk = (val: FormValue, key: string): void => {
    if (val === undefined || val === null) return;
    if (Array.isArray(val)) {
      val.forEach((v, i) => walk(v, `${key}[${i}]`));
    } else if (typeof val === "object") {
      for (const [k, v] of Object.entries(val)) {
        walk(v, key ? `${key}[${k}]` : k);
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    }
  };
  walk(obj, prefix);
  return parts.join("&");
}

/* ── Минимальные типы ответов Stripe ────────────────────────────────── */

export interface StripePaymentIntent {
  id: string;
  object: "payment_intent";
  amount: number; // центы
  currency: string;
  status:
    | "requires_payment_method"
    | "requires_confirmation"
    | "requires_action"
    | "processing"
    | "requires_capture"
    | "canceled"
    | "succeeded";
  client_secret: string | null;
  metadata?: Record<string, string>;
}

export interface StripeCustomer {
  id: string;
  object: "customer";
  email?: string | null;
}

export interface StripeInvoice {
  id: string;
  object: "invoice";
  subscription?: string | null;
  period_start?: number;
  period_end?: number;
  payment_intent?: string | StripePaymentIntent | null;
  lines?: { data: { period?: { start: number; end: number } }[] };
}

export interface StripeSubscription {
  id: string;
  object: "subscription";
  customer: string;
  status:
    | "active"
    | "past_due"
    | "canceled"
    | "trialing"
    | "incomplete"
    | "incomplete_expired"
    | "unpaid"
    | "paused";
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  latest_invoice?: string | StripeInvoice | null;
  metadata?: Record<string, string>;
}

export interface StripeEvent {
  id: string;
  object: "event";
  type: string;
  data: { object: Record<string, unknown> };
}

/* ── Транспорт ───────────────────────────────────────────────────────── */

export function isStripeConfigured(): boolean {
  return env.stripe.secretKey.length > 0;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: FormObject,
): Promise<T> {
  if (!isStripeConfigured()) {
    throw new StripeError(
      "STRIPE_UNAVAILABLE",
      "Stripe не настроен (STRIPE_SECRET_KEY пуст)",
    );
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.stripe.secretKey}`,
    "Stripe-Version": "2024-06-20",
  };
  let payload: string | undefined;
  if (method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = encodeForm(body ?? {});
  }
  let resp: Response;
  try {
    resp = await fetch(`${env.stripe.apiBase}${path}`, {
      method,
      headers,
      ...(payload !== undefined ? { body: payload } : {}),
    });
  } catch (err) {
    throw new StripeError(
      "STRIPE_ERROR",
      `Stripe недоступен: ${(err as Error).message}`,
    );
  }
  const text = await resp.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* не JSON */
  }
  if (!resp.ok) {
    const e = (json as { error?: { message?: string; code?: string } } | null)
      ?.error;
    throw new StripeError(
      "STRIPE_ERROR",
      e?.message ?? `Stripe ${resp.status}`,
      resp.status,
      e?.code,
    );
  }
  return json as T;
}

/* ── Операции ─────────────────────────────────────────────────────────── */

export const stripe = {
  createPaymentIntent(params: {
    amountCents: number;
    currency?: string;
    /** 7.1: Customer пользователя (users.stripe_customer_id) — платежи
     *  пополнения и подписки видны под одним Customer */
    customerId?: string;
    metadata?: Record<string, string>;
  }): Promise<StripePaymentIntent> {
    return request<StripePaymentIntent>("POST", "/v1/payment_intents", {
      amount: params.amountCents,
      currency: params.currency ?? "usd",
      automatic_payment_methods: { enabled: true },
      ...(params.customerId ? { customer: params.customerId } : {}),
      metadata: params.metadata ?? {},
    });
  },

  retrievePaymentIntent(id: string): Promise<StripePaymentIntent> {
    return request<StripePaymentIntent>(
      "GET",
      `/v1/payment_intents/${encodeURIComponent(id)}`,
    );
  },

  createCustomer(params: {
    email: string;
    metadata?: Record<string, string>;
  }): Promise<StripeCustomer> {
    return request<StripeCustomer>("POST", "/v1/customers", {
      email: params.email,
      metadata: params.metadata ?? {},
    });
  },

  /** Подписка в режиме default_incomplete: первый инвойс ждёт оплаты,
   *  client_secret его PaymentIntent уходит клиенту (Stripe Elements). */
  createSubscription(params: {
    customerId: string;
    priceId: string;
    metadata?: Record<string, string>;
  }): Promise<StripeSubscription> {
    return request<StripeSubscription>("POST", "/v1/subscriptions", {
      customer: params.customerId,
      items: [{ price: params.priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: params.metadata ?? {},
    });
  },

  retrieveSubscription(id: string): Promise<StripeSubscription> {
    return request<StripeSubscription>(
      "GET",
      `/v1/subscriptions/${encodeURIComponent(id)}`,
    );
  },

  updateSubscription(
    id: string,
    params: { cancel_at_period_end?: boolean },
  ): Promise<StripeSubscription> {
    return request<StripeSubscription>(
      "POST",
      `/v1/subscriptions/${encodeURIComponent(id)}`,
      params as FormObject,
    );
  },
};

/* ── Webhook: проверка подписи Stripe-Signature ─────────────────────── */

/** Допуск расхождения времени подписи, с (как в SDK Stripe). */
export const WEBHOOK_TOLERANCE_SEC = 300;

/**
 * Проверка `Stripe-Signature: t=…,v1=…` по схеме Stripe:
 * HMAC-SHA256(secret, `${t}.${rawBody}`) === v1 (любая из v1).
 * Возвращает разобранное событие; иначе StripeError WEBHOOK_SIGNATURE_INVALID.
 * Пустой STRIPE_WEBHOOK_SECRET — подпись НЕ проверяется только вне
 * production (мок-тесты); в production — отказ.
 */
export function constructWebhookEvent(
  rawBody: string,
  signatureHeader: string | undefined,
  nowSec: number = Math.floor(Date.now() / 1000),
): StripeEvent {
  const secret = env.stripe.webhookSecret;
  if (!secret) {
    if (env.isProd) {
      throw new StripeError(
        "WEBHOOK_SIGNATURE_INVALID",
        "STRIPE_WEBHOOK_SECRET не задан",
      );
    }
  } else {
    if (!signatureHeader) {
      throw new StripeError("WEBHOOK_SIGNATURE_INVALID", "Нет заголовка Stripe-Signature");
    }
    let ts = "";
    const v1s: string[] = [];
    for (const part of signatureHeader.split(",")) {
      const [k, v] = part.trim().split("=", 2);
      if (k === "t" && v) ts = v;
      if (k === "v1" && v) v1s.push(v);
    }
    if (!ts || v1s.length === 0) {
      throw new StripeError("WEBHOOK_SIGNATURE_INVALID", "Неполная подпись webhook");
    }
    if (Math.abs(nowSec - Number(ts)) > WEBHOOK_TOLERANCE_SEC) {
      throw new StripeError("WEBHOOK_SIGNATURE_INVALID", "Подпись webhook устарела");
    }
    const expected = createHmac("sha256", secret)
      .update(`${ts}.${rawBody}`, "utf8")
      .digest("hex");
    const ok = v1s.some((sig) => {
      const a = Buffer.from(sig, "hex");
      const b = Buffer.from(expected, "hex");
      return a.length === b.length && timingSafeEqual(a, b);
    });
    if (!ok) {
      throw new StripeError("WEBHOOK_SIGNATURE_INVALID", "Подпись webhook не сходится");
    }
  }
  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    throw new StripeError("WEBHOOK_SIGNATURE_INVALID", "Тело webhook — не JSON");
  }
  if (!event || typeof event.type !== "string" || !event.data?.object) {
    throw new StripeError("WEBHOOK_SIGNATURE_INVALID", "Тело webhook — не событие Stripe");
  }
  return event;
}

/** Подпись для тестов/моков (симметрична constructWebhookEvent). */
export function signWebhookPayload(
  rawBody: string,
  secret: string,
  ts: number = Math.floor(Date.now() / 1000),
): string {
  const v1 = createHmac("sha256", secret).update(`${ts}.${rawBody}`, "utf8").digest("hex");
  return `t=${ts},v1=${v1}`;
}
