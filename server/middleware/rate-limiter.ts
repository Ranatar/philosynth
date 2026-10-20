/**
 * Rate limiting по пользователю/IP (беседа 0.2; требование B5 из 03-spec §1.11).
 *
 * Алгоритм: fixed window на Redis (INCR + EXPIRE), ключи по схеме
 * 01-architecture §3: rate_limit:{scope}:{identity}:{windowIdx}.
 *
 * Идентичность (беседа 13.2, Д-67): пользователь ПРОВЕРЕННОЙ сессии —
 * `u:{userId}` (все сессии одного пользователя делят квоту; снята половина
 * Огр-10); иначе — адрес клиента `ip:{адрес}` (utils/client-address:
 * X-Forwarded-For только под TRUST_PROXY). Непроверенная или поддельная
 * cookie своей квоты НЕ даёт. До 13.2 ключом служил SHA-256 ЛЮБОГО значения
 * cookie (лимитер стоял до аутентификации, ветка u: была мертва) — случайная
 * cookie на каждый запрос давала новую квоту и снимала и общий лимит, и
 * mailLimiter, и защиту входа от перебора. Сессию проверяет глобальный
 * optionalAuth в index.ts ДО лимитера (один запрос к БД на запрос с cookie,
 * роутовые requireAuth/optionalAuth результат переиспользуют) — выбор
 * «лимитер после optionalAuth», а не «проверка внутри»: вторая проверка
 * сессии в роуте стоила бы второго запроса к БД на каждый вызов.
 *
 * Ответ при превышении — 429 { error, code: "RATE_LIMIT",
 * details: { retryAfter } } + заголовок Retry-After (секунды до конца окна);
 * форма согласована с WS-вариантом (03-spec §3.4: retryAfter).
 *
 * Политика отказа: fail-open — при недоступном Redis запрос пропускается
 * (лимитер не должен ронять API), инцидент логируется.
 *
 * Лимиты генераций (3 одновременных, §3.4) — не здесь: это семантика
 * generation-service (беседа 1.4), а не HTTP-окна.
 */
import type { Context, MiddlewareHandler } from "hono";

import { env } from "../env.js";
import { redis } from "../redis.js";
import { clientAddressOf } from "../utils/client-address.js"; // 13.2 (Д-67)
import type { AuthEnv } from "./auth.js";
import { tl } from "@philosynth/shared/i18n/t";

export interface RateLimiterOptions {
  /** Запросов на окно (по умолчанию env.rateLimit.httpRequestsPerMinute) */
  limit?: number;
  /** Длина окна, секунд (по умолчанию 60) */
  windowSec?: number;
  /** Пространство ключей (разные лимиты — разные scope) */
  scope?: string;
}

/** Ключ личности: пользователь проверенной сессии (c.get("user") ставит
 *  optionalAuth/requireAuth ДО лимитера) либо адрес клиента. Cookie здесь
 *  не читается вовсе — её значение без проверки ничего не значит (13.2). */
export function clientIdentity(c: Context): string {
  const user = (c as Context<AuthEnv>).get("user");
  if (user?.id) return `u:${user.id}`;
  return `ip:${clientAddressOf(c) ?? "unknown"}`;
}

export function rateLimiter(
  options: RateLimiterOptions = {},
): MiddlewareHandler {
  const windowSec = options.windowSec ?? 60;
  const limit = options.limit ?? env.rateLimit.httpRequestsPerMinute;
  const scope = options.scope ?? "http";

  return async (c, next) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const windowIdx = Math.floor(nowSec / windowSec);
    const key = `rate_limit:${scope}:${clientIdentity(c)}:${windowIdx}`;

    let count: number;
    try {
      count = await redis.incr(key);
      if (count === 1) {
        // Ключ живёт чуть дольше окна — защита от вечных ключей
        await redis.expire(key, windowSec + 1);
      }
    } catch (err) {
      console.error(`[rate-limiter] Redis недоступен, fail-open: ${(err as Error).message}`);
      await next();
      return;
    }

    if (count > limit) {
      const retryAfter = (windowIdx + 1) * windowSec - nowSec;
      c.header("Retry-After", String(retryAfter));
      return c.json(
        {
          error: tl("server.middleware.rateLimiter.rateLimited", "Превышен лимит запросов"),
          code: "RATE_LIMIT",
          details: { retryAfter },
        },
        429,
      );
    }

    await next();
  };
}
