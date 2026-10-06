/**
 * scripts/seed/cache-reset.ts — сброс кэша Redis после посева
 * (беседа 12.3, Д-18).
 *
 * Кэш реестра (prompt_cache:* / config_cache:*) и кэш каталогов типов
 * бессрочны: сбрасывали их только активация версии через API и прогрев при
 * старте сервера. Посев на РАБОТАЮЩЕЙ службе оставлял её на прежних версиях
 * до перезапуска — причём код (билдер) уже новый, а шаблоны и карта
 * подразделов из кэша старые («По факту 10.1» п.19). С 12.3 сиды сбрасывают
 * ключи, которые сами изменили (created / updated), и говорят об этом в
 * отчёте.
 *
 * ПОЧЕМУ НЕ ПРОСТО invalidateCache В СИДЕ. Клиент Redis службы ленивый
 * (lazyConnect, enableOfflineQueue=false): в скрипте, который не звал
 * connectRedis, первая же команда отклоняется, а invalidateCache ошибку
 * глотает (fail-open) — сброс молча не состоялся бы (09 §3, беседы 0.3b и
 * 1.4). Поэтому здесь явное подключение, а ответ invalidateCache читается.
 *
 * Отказ Redis сид НЕ роняет (fail-open): посев состоялся, в отчёте — строка
 * о том, что кэш не сброшен и что с этим делать. Соединение закрывается
 * здесь же — иначе скрипт не завершится (09 §1, 1.1).
 *
 * Модуль вне описи i18n (scripts/i18n/ui-strings-lib SCOPE): его строки —
 * вывод консоли оператора, не интерфейс. seed-taxonomy.ts в опись входит
 * (файл-данные), поэтому текст отчёта собирается здесь, а не там.
 */
import { closeRedis, connectRedis } from "../../server/redis.js";
import { invalidateTaxonomyCache } from "../../server/services/element-taxonomy.js";
import { invalidateCache } from "../../server/services/prompt-registry.js";

export interface CacheResetReport {
  /** true — сбрасывать было нечего либо сброс состоялся целиком */
  ok: boolean;
  /** Сколько ключей сброшено */
  reset: number;
  /** Строка для отчёта сида */
  line: string;
}

// Повторный посев тут не поможет: версии уже в БД, он даст одни skip и
// сбрасывать ничего не станет — только перезапуск (прогрев кэша при старте).
const RESTART_HINT =
  "Если сервер запущен и его Redis жив, он держит прежние версии — перезапустите сервер " +
  "(кэш прогревается при старте).";

async function withRedis<T>(run: () => Promise<T>, onDown: () => T): Promise<T> {
  let connected = false;
  try {
    connected = await connectRedis();
    if (!connected) return onDown();
    return await run();
  } finally {
    await closeRedis();
  }
}

/**
 * Сбросить кэш реестра по ключам, которые посев создал или обновил.
 * Пустой список — подключения нет вовсе (повторный посев: одни skip).
 */
export async function resetRegistryCache(
  keys: readonly string[],
): Promise<CacheResetReport> {
  const uniq = [...new Set(keys)];
  if (uniq.length === 0)
    return { ok: true, reset: 0, line: "Кэш реестра: изменённых ключей нет — сбрасывать нечего" };
  return withRedis<CacheResetReport>(
    async () => {
      let reset = 0;
      for (const key of uniq) if (await invalidateCache(key)) reset += 1;
      if (reset === uniq.length)
        return {
          ok: true,
          reset,
          line: `Кэш реестра: сброшено ключей — ${reset}; работающий сервер прочитает новые версии без перезапуска`,
        };
      return {
        ok: false,
        reset,
        line: `⚠ Кэш реестра сброшен НЕ ПОЛНОСТЬЮ: ${reset} из ${uniq.length} ключей (Redis отвечал с ошибками). ${RESTART_HINT}`,
      };
    },
    () => ({
      ok: false,
      reset: 0,
      line: `⚠ Кэш реестра НЕ сброшен: Redis недоступен (ключей к сбросу — ${uniq.length}). ${RESTART_HINT}`,
    }),
  );
}

/** Сбросить кэш каталогов типов, если посев что-то создал или обновил. */
export async function resetTaxonomyCache(changed: number): Promise<CacheResetReport> {
  if (changed === 0)
    return { ok: true, reset: 0, line: "Кэш каталогов типов: изменений нет — сбрасывать нечего" };
  return withRedis<CacheResetReport>(
    async () =>
      (await invalidateTaxonomyCache())
        ? {
            ok: true,
            reset: 2,
            line: "Кэш каталогов типов сброшен; работающий сервер прочитает каталоги заново без перезапуска",
          }
        : {
            ok: false,
            reset: 0,
            line: `⚠ Кэш каталогов типов НЕ сброшен (Redis ответил ошибкой). ${RESTART_HINT}`,
          },
    () => ({
      ok: false,
      reset: 0,
      line: `⚠ Кэш каталогов типов НЕ сброшен: Redis недоступен. ${RESTART_HINT}`,
    }),
  );
}
