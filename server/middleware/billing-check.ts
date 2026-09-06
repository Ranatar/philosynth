/**
 * Billing Check — middleware роутов генерации (беседа 6.1; 01-architecture
 * §6 «приоритет middleware», 03-specification §1.11 B7, §4.3).
 *
 * Определяет режим биллинга запроса по приоритету BYO-Key → активная
 * подписка с остатком квоты → баланс ≥ порог → отказ, и кладёт решение
 * `{ billingMode, apiKey?, subscriptionId? }` в c.get("billing").
 *
 * Роль — ПРЕДПРОВЕРКА на HTTP-границе (403 с кодами §4.3 до создания
 * строк/запуска фона). Квоту middleware НЕ потребляет (consume:false):
 * потребление и окончательное решение — в withGenerationSlot
 * (generation-service), единой точке для HTTP и WS. Гонка «middleware
 * пропустил, слот отказал» допустима — вторая проверка решает (тот же
 * принцип, что assertCanStartGeneration 1.4); фон тогда шлёт
 * stream_error с кодом.
 *
 * Ретрофит: оборачивает роуты закрытых бесед (1.4/1.6/2.2/4.1/5.3/5.5) —
 * список сверен с фактическим server/index.ts, а не с текстом 07.
 * Ставится ПОСЛЕ requireAuth (нужен c.get("user")).
 */
import type { MiddlewareHandler } from "hono";

import type { AuthEnv } from "./auth.js";
import {
  BillingError,
  billingErrorStatus,
  resolveBilling,
  type BillingDecision,
} from "../services/billing-service.js";
import type { QuotaType } from "../services/subscription-service.js";

/** Что кладётся в контекст запроса (apiKey — только для BYO). */
export interface BillingContextVar {
  billingMode: BillingDecision["billingMode"];
  apiKey?: string | undefined;
  subscriptionId?: string | undefined;
  enforced: boolean;
}

export interface BillingCheckOptions {
  /** Квота подписки, которую потребует операция; null — без квоты */
  quota: QuotaType | null;
  /** Единиц квоты (дефолт 1) */
  units?: number | undefined;
  /** Порог баланса для режима balance (дефолт env.billing.minReserveUsd) */
  estimatedCostUsd?: number | undefined;
}

/**
 * Фабрика middleware: `billingCheck({ quota: "syntheses" })`.
 * a. режим по приоритету; b/c. квота / баланс — внутри resolveBilling;
 * d. { billingMode, apiKey?, subscriptionId? } → c.set("billing").
 */
export function billingCheck(
  opts: BillingCheckOptions,
): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) {
      return c.json(
        { error: "Требуется авторизация", code: "AUTH_REQUIRED" },
        401,
      );
    }
    let decision: BillingDecision;
    try {
      decision = await resolveBilling(user.id, {
        quota: opts.quota,
        units: opts.units ?? 1,
        estimatedCostUsd: opts.estimatedCostUsd,
        consume: false,
      });
    } catch (err) {
      if (err instanceof BillingError) {
        return c.json(
          {
            error: err.message,
            code: err.code,
            ...(err.details !== undefined ? { details: err.details } : {}),
          },
          billingErrorStatus(err.code),
        );
      }
      throw err;
    }
    c.set("billing", {
      billingMode: decision.billingMode,
      // Ключ прокидывается только в режиме BYO (серверный в контекст не
      // попадает — его знает сам слот)
      ...(decision.billingMode === "byo" ? { apiKey: decision.apiKey } : {}),
      subscriptionId: decision.subscriptionId,
      enforced: decision.enforced,
    });
    await next();
  };
}
