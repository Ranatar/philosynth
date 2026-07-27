/**
 * Rate limiting по пользователю/IP (беседа 0.2; требование B5 из 03-spec §1.11).
 *
 * Алгоритм: fixed window на Redis (INCR + EXPIRE), ключи по схеме
 * 01-architecture §3: rate_limit:{scope}:{identity}:{windowIdx}.
 * Идентичность: userId авторизованного пользователя, иначе IP.
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
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";

import { env } from "../env.js";
import { redis } from "../redis.js";
import type { AuthEnv } from "./auth.js";

export interface RateLimiterOptions {
  /** Запросов на окно (по умолчанию env.rateLimit.httpRequestsPerMinute) */
  limit?: number;
  /** Длина окна, секунд (по умолчанию 60) */
  windowSec?: number;
  /** Пространство ключей (разные лимиты — разные scope) */
  scope?: string;
}

function clientIdentity(c: Context): string {
  const user = (c as Context<AuthEnv>).get("user");
  if (user?.id) return `u:${user.id}`;
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return `ip:${forwarded.split(",")[0]!.trim()}`;
  try {
    const info = getConnInfo(c);
    return `ip:${info.remote.address ?? "unknown"}`;
  } catch {
    return "ip:unknown";
  }
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
          error: "Превышен лимит запросов",
          code: "RATE_LIMIT",
          details: { retryAfter },
        },
        429,
      );
    }

    await next();
  };
}
