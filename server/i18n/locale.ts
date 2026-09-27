/**
 * Язык запроса на сервере (беседа 11.2, п.6).
 *
 * Порядок: пользователь (users.ui_locale) → cookie ui_locale →
 * Accept-Language → ru. Гостю — cookie и заголовок.
 *
 * Механика — AsyncLocalStorage: middleware `requestLocale` (index.ts, ДО
 * роутов) открывает контекст запроса с языком по cookie/заголовку;
 * requireAuth/optionalAuth, найдя пользователя с ui_locale, поднимают язык
 * в том же контексте (`setRequestLocale`) — сессия читается только там, и
 * «пользователь первым» иначе неисполним, middleware до роутов её не знает.
 * Провайдер каталога tl() (setCatalogProvider) читает `currentLocale()`:
 * все tl() в роутах и сервисах, вызванные из запроса, отвечают на его
 * языке; вне запроса (сиды, работник почты, тесты) — ru, как прежде.
 *
 * Каталоги — генераты `npm run i18n:split`
 * (packages/shared/i18n/generated/<lang>.json), читаются один раз при первом
 * обращении; русского каталога нет — ru в коде вторым аргументом tl().
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";

import {
  DEFAULT_UI_LOCALE,
  UI_LOCALES,
  isUiLocale,
  type UiLocale,
} from "@philosynth/shared/i18n/locales";
import {
  setCatalogProvider,
  type CatalogSource,
} from "@philosynth/shared/i18n/t";

/** Имя cookie языка интерфейса (ставит клиент 11.3; гостю — единственный явный выбор). */
export const UI_LOCALE_COOKIE = "ui_locale";

interface LocaleStore {
  locale: UiLocale;
  /** Откуда взят язык — для отладки и тестов. */
  source: "user" | "cookie" | "accept-language" | "default";
}

const als = new AsyncLocalStorage<LocaleStore>();

/** Язык текущего запроса; вне запроса — ru. */
export function currentLocale(): UiLocale {
  return als.getStore()?.locale ?? DEFAULT_UI_LOCALE;
}

export function currentLocaleSource(): LocaleStore["source"] {
  return als.getStore()?.source ?? "default";
}

/** Поднять язык запроса (после того как найден пользователь с ui_locale).
 *  Вне контекста запроса — no-op. */
export function setRequestLocale(locale: string | null | undefined, source: LocaleStore["source"] = "user"): void {
  const store = als.getStore();
  if (!store || !isUiLocale(locale)) return;
  store.locale = locale;
  store.source = source;
}

/** Выполнить fn в контексте языка (тесты, фоновые задачи «от имени» пользователя). */
export function runWithLocale<T>(locale: string | null | undefined, fn: () => T): T {
  const store: LocaleStore = isUiLocale(locale)
    ? { locale, source: "user" }
    : { locale: DEFAULT_UI_LOCALE, source: "default" };
  return als.run(store, fn);
}

/**
 * Язык из Accept-Language: первый из UI_LOCALES по убыванию q; язык
 * «en-GB» → «en»; ничего подходящего → null.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): UiLocale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: (tag ?? "").trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 0, i };
    })
    .filter((x) => x.tag && x.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.i - b.i);
  for (const { tag } of ranked) {
    const base = tag.split("-")[0] ?? tag;
    if (isUiLocale(base)) return base;
  }
  return null;
}

/** Язык по cookie и заголовку — то, что известно ДО сессии. */
export function resolveGuestLocale(
  cookie: string | undefined,
  acceptLanguage: string | null | undefined,
): LocaleStore {
  if (isUiLocale(cookie)) return { locale: cookie, source: "cookie" };
  const fromHeader = localeFromAcceptLanguage(acceptLanguage);
  if (fromHeader) return { locale: fromHeader, source: "accept-language" };
  return { locale: DEFAULT_UI_LOCALE, source: "default" };
}

/**
 * Middleware языка запроса: открывает контекст на весь обработчик.
 * Монтировать в index.ts ДО роутов; типизирован без Env — ложится на
 * Hono<AuthEnv> рядом с rateLimiter.
 */
export const requestLocale: MiddlewareHandler = async (c, next) => {
  const store = resolveGuestLocale(
    getCookie(c, UI_LOCALE_COOKIE),
    c.req.header("accept-language"),
  );
  await als.run(store, () => next());
};

/* ── Каталоги ────────────────────────────────────────────────────────── */

const catalogs = new Map<UiLocale, CatalogSource | null>();

/** Каталог языка из generated/<lang>.json; ru и отсутствующий файл → null
 *  (tl() отдаёт русский текст). Читается один раз. */
export function catalogFor(locale: UiLocale): CatalogSource | null {
  if (locale === DEFAULT_UI_LOCALE) return null;
  if (catalogs.has(locale)) return catalogs.get(locale) ?? null;
  let source: CatalogSource | null = null;
  try {
    const url = new URL(`../../packages/shared/i18n/generated/${locale}.json`, import.meta.url);
    const parsed = JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as Partial<CatalogSource>;
    if (parsed && typeof parsed === "object" && parsed.strings && typeof parsed.strings === "object") {
      source = { locale: parsed.locale ?? locale, strings: parsed.strings };
    }
  } catch (err) {
    console.warn(`[i18n] каталог ${locale} не прочитан:`, (err as Error).message);
  }
  catalogs.set(locale, source);
  return source;
}

/** Сбросить прочитанные каталоги (тесты после i18n:split). */
export function resetCatalogs(): void {
  catalogs.clear();
}

/** Поставить провайдер каталога tl() на язык запроса. Зовётся из index.ts;
 *  повторный вызов безвреден. */
export function installServerCatalogProvider(): void {
  setCatalogProvider(() => catalogFor(currentLocale()));
}

export { UI_LOCALES };
