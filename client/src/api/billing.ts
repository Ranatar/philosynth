/**
 * API-функции биллинга. Беседа 6.2 (запрос 1, п. 3).
 *
 * Контракт: 03-specification §2.10 и server/routes/billing.ts (6.1):
 *  - listApiKeys   → GET    /billing/api-key        → { keys: ApiKeyInfo[] }
 *  - storeApiKey   → POST   /billing/api-key { key } → 201 StoredApiKey
 *      (клиент шлёт ОТКРЫТЫЙ ключ по TLS, шифрует сервер; формат
 *      sk-ant-…, ≥ 20 символов, иначе 400 VALIDATION_ERROR + details.key;
 *      активный ключ ОДИН — новый деактивирует прежние)
 *  - deleteApiKey  → DELETE /billing/api-key/:id   → { ok: true } (404 — чужой/нет)
 *  - createTopup   → POST   /billing/topup { amountUsd } → TopupIntent
 *      (1 ≤ amountUsd ≤ 1000; Stripe не настроен → 503 STRIPE_UNAVAILABLE)
 *  - confirmTopup  → POST   /billing/topup/confirm { paymentIntentId } → TopupResult
 *      (идемпотентно по stripe_id; платёж не succeeded → 400 VALIDATION_ERROR
 *      details.status)
 *  - getUsageHistory → GET  /billing/usage ?from&to&synthesisId → UsageHistory
 *      (totals.costUsd БЕЗ строк 'byo' — 02 §2.21; byMode — по режимам)
 *  - getTransactionHistory → GET /billing/transactions ?page&limit → TransactionHistory
 *
 * Подписки — отдельный модуль ./subscription (05 его числит отдельно).
 * ApiError пробрасывается как есть — страница разбирает code/details сама.
 */

import type {
  ApiKeyInfo,
  StoredApiKey,
  TopupIntent,
  TopupResult,
  TransactionHistory,
  UsageHistory,
} from "@philosynth/shared/types/billing";

import { apiDelete, apiGet, apiPost } from "./client";

/* ── BYO-Key ─────────────────────────────────────────────────────────── */

export function listApiKeys(): Promise<ApiKeyInfo[]> {
  return apiGet<{ keys: ApiKeyInfo[] }>("/billing/api-key").then((r) => r.keys);
}

export function storeApiKey(key: string): Promise<StoredApiKey> {
  return apiPost<StoredApiKey>("/billing/api-key", { key });
}

export function deleteApiKey(id: string): Promise<void> {
  return apiDelete<{ ok: true }>(`/billing/api-key/${encodeURIComponent(id)}`).then(
    () => undefined,
  );
}

/* ── Баланс ──────────────────────────────────────────────────────────── */

export function createTopup(amountUsd: number): Promise<TopupIntent> {
  return apiPost<TopupIntent>("/billing/topup", { amountUsd });
}

export function confirmTopup(paymentIntentId: string): Promise<TopupResult> {
  return apiPost<TopupResult>("/billing/topup/confirm", { paymentIntentId });
}

/* ── История ─────────────────────────────────────────────────────────── */

export interface UsageQuery {
  /** ISO-дата начала периода (включительно) */
  from?: string;
  /** ISO-дата конца периода */
  to?: string;
  synthesisId?: string;
}

export function getUsageHistory(query: UsageQuery = {}): Promise<UsageHistory> {
  return apiGet<UsageHistory>("/billing/usage", {
    from: query.from || undefined,
    to: query.to || undefined,
    synthesisId: query.synthesisId || undefined,
  });
}

export function getTransactionHistory(
  page = 1,
  limit = 50,
): Promise<TransactionHistory> {
  return apiGet<TransactionHistory>("/billing/transactions", { page, limit });
}
