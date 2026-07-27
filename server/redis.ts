/**
 * Подключение к Redis (ioredis).
 * Потребители: middleware/rate-limiter (rate_limit:*), далее —
 * prompt_cache:* / config_cache:* (беседа 0.3) и stream_state:* (беседа 1.4);
 * схема ключей — 01-architecture §3 (DATA LAYER).
 *
 * Политика отказа: enableOfflineQueue=false — при недоступном Redis команды
 * отклоняются сразу, а не копятся; rate-limiter на этом строит fail-open
 * (лимитер не должен ронять API из-за упавшего Redis).
 */
import { Redis } from "ioredis";

import { env } from "./env.js";

export const redis = new Redis(env.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  // Повторные попытки подключения — с растущей задержкой, максимум 5 с
  retryStrategy: (times) => Math.min(times * 500, 5_000),
});

redis.on("error", (err) => {
  console.error(`[redis] ${err.message}`);
});

/** Явное подключение при старте (lazyConnect). Ошибка не фатальна. */
export async function connectRedis(): Promise<boolean> {
  try {
    await redis.connect();
    return true;
  } catch (err) {
    console.error(
      `[redis] не удалось подключиться: ${(err as Error).message} — ` +
        "rate-limiter работает в режиме fail-open",
    );
    return false;
  }
}

/** Закрытие соединения (graceful shutdown). */
export async function closeRedis(): Promise<void> {
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
}
