/**
 * Загрузка Stripe.js (беседа 6.2: пополнение и подписка через Stripe
 * Payment Element). Без npm-зависимостей: Stripe запрещает бандлить
 * Stripe.js — он ставится только с js.stripe.com; @stripe/stripe-js
 * делает то же самое, поэтому вставка <script> здесь эквивалентна.
 *
 * Publishable key — VITE_STRIPE_PUBLISHABLE_KEY (клиентский env vite;
 * секретный ключ живёт только на сервере, env.stripe.secretKey 6.1).
 * Ключа нет → stripeConfigured() = false и страница показывает
 * dev-режим: PaymentIntent создаётся сервером (POST /billing/topup), а
 * подтверждение делается напрямую POST /billing/topup/confirm — так
 * работает мок-Stripe из tests/test-61 (PaymentIntent сразу succeeded).
 *
 * Типы ниже — минимальный срез API Stripe.js, который использует
 * BillingPage; полные типы не нужны.
 */

export interface StripeElement {
  mount(target: HTMLElement | string): void;
  unmount(): void;
  destroy(): void;
}

export interface StripeElements {
  create(type: "payment", options?: Record<string, unknown>): StripeElement;
}

export interface StripeConfirmResult {
  error?: { message?: string; code?: string; type?: string };
  paymentIntent?: { id: string; status: string };
}

export interface StripeInstance {
  elements(options: { clientSecret: string; appearance?: Record<string, unknown> }): StripeElements;
  confirmPayment(options: {
    elements: StripeElements;
    redirect: "if_required";
    confirmParams?: Record<string, unknown>;
  }): Promise<StripeConfirmResult>;
}

type StripeFactory = (publishableKey: string) => StripeInstance;

declare global {
  interface Window {
    Stripe?: StripeFactory;
  }
}

const SCRIPT_SRC = "https://js.stripe.com/v3/";

export function stripePublishableKey(): string {
  // import.meta.env есть только под vite; под tsx (смоуки/integration-check) — undefined
  const env = (import.meta as unknown as { env?: ImportMetaEnv }).env;
  return env?.VITE_STRIPE_PUBLISHABLE_KEY ?? "";
}

export function stripeConfigured(): boolean {
  return stripePublishableKey().length > 0;
}

let loading: Promise<StripeFactory> | null = null;

function loadScript(): Promise<StripeFactory> {
  if (window.Stripe) return Promise.resolve(window.Stripe);
  if (loading) return loading;
  loading = new Promise<StripeFactory>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    const done = (): void => {
      if (window.Stripe) resolve(window.Stripe);
      else reject(new Error("Stripe.js загружен, но window.Stripe отсутствует"));
    };
    script.addEventListener("load", done);
    script.addEventListener("error", () => {
      loading = null;
      reject(new Error("Не удалось загрузить Stripe.js (js.stripe.com недоступен)"));
    });
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return loading;
}

let instance: StripeInstance | null = null;

/** Экземпляр Stripe (один на вкладку). Бросает, если ключа нет или CDN недоступен. */
export async function getStripe(): Promise<StripeInstance> {
  const pk = stripePublishableKey();
  if (!pk) throw new Error("VITE_STRIPE_PUBLISHABLE_KEY не задан");
  if (instance) return instance;
  const factory = await loadScript();
  instance = factory(pk);
  return instance;
}

/**
 * Оформление Payment Element в идиоме приложения: прямые углы, палитра
 * :root. Цвета — hex-дубли переменных globals.css (Stripe iframe CSS-
 * переменные страницы не видит).
 */
export const STRIPE_APPEARANCE = {
  theme: "flat",
  variables: {
    borderRadius: "0px",
    colorPrimary: "#1a2855",
    colorText: "#1a1814",
    colorDanger: "#8b1a1a",
    fontFamily: "IBM Plex Sans, sans-serif",
    fontSizeBase: "13px",
  },
} as const;
