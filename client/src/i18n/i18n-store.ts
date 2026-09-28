/**
 * Язык интерфейса на клиенте (беседа 11.3, п. 1).
 *
 * Хранилище — zustand: текущий язык, каталог этого языка и счётчик
 * `version`, растущий при каждой смене языка или каталога. На `version`
 * подписан хук useT() (client/src/i18n/useT.ts): компонент, звущий его,
 * перерисуется при смене языка БЕЗ перезагрузки страницы. Провайдер
 * каталога для tl() (setCatalogProvider, shared/i18n/t.ts) ставится здесь
 * же: читает каталог из хранилища, так что все tl() клиента отвечают на
 * текущем языке.
 *
 * Каталоги грузятся ПО ТРЕБОВАНИЮ и по одному разу: import.meta.glob по
 * packages/shared/i18n/generated/*.json — ленивый, каждый язык — свой чанк
 * сборки. Русский каталог не грузится вовсе (ru — второй аргумент tl(), 11.2).
 * Повторная смена на тот же язык — ни одного запроса (кэш в Map).
 *
 * Откуда язык:
 *   вошедший — users.ui_locale из GET /auth/me (applyUserLocale из
 *              auth-store при restore/login/PATCH);
 *   гость    — cookie ui_locale → navigator.language → ru (resolveInitialLocale).
 * Cookie ui_locale читает и сервер (server/i18n/locale.ts, UI_LOCALE_COOKIE,
 * ДО сессии) — поэтому её пишет и гость, и вошедший: язык ответов сервера
 * гостю иначе неизвестен. Вошедшему сервер отдаёт ui_locale первее cookie.
 *
 * Модуль импортируется и вне браузера (integration-check под tsx): всё
 * браузерное — за гардами typeof document / import.meta.glob.
 */
import { create } from "zustand";

import {
  DEFAULT_UI_LOCALE,
  UI_LOCALES,
  isUiLocale,
  type UiLocale,
} from "@philosynth/shared/i18n/locales";
import { setCatalogProvider, type CatalogSource } from "@philosynth/shared/i18n/t";

/** Имя cookie — то же, что UI_LOCALE_COOKIE сервера (server/i18n/locale.ts). */
export const UI_LOCALE_COOKIE = "ui_locale";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Самоназвания языков — НЕ переводятся и в каталог не идут (11.3, п. 3). */
export const UI_LOCALE_NAMES: Readonly<Record<UiLocale, string>> = {
  ru: "Русский",
  en: "English",
  de: "Deutsch",
};

type CatalogLoader = () => Promise<unknown>;

/** Ленивые загрузчики каталогов: ключ — путь файла относительно этого
 *  модуля. Вызов import.meta.glob обязан стоять ЛИТЕРАЛЬНО (его переписывает
 *  сборщик Vite); вне Vite (tsx, integration-check) его нет — пустой набор. */
const loaders: Record<string, CatalogLoader> = (() => {
  try {
    return import.meta.glob("../../../packages/shared/i18n/generated/*.json") as Record<string, CatalogLoader>;
  } catch {
    return {};
  }
})();

const loaded = new Map<UiLocale, CatalogSource | null>();
const inflight = new Map<UiLocale, Promise<CatalogSource | null>>();

/** Сколько раз каталог реально запрашивался (тест R6: один раз на язык). */
export const catalogLoadCount: Record<string, number> = {};

function normalizeCatalog(locale: UiLocale, mod: unknown): CatalogSource | null {
  const raw = (mod && typeof mod === "object" && "default" in (mod as Record<string, unknown>)
    ? (mod as { default: unknown }).default
    : mod) as Partial<CatalogSource> | undefined;
  if (!raw || typeof raw !== "object" || !raw.strings || typeof raw.strings !== "object") return null;
  return { locale: raw.locale ?? locale, strings: raw.strings };
}

/** Каталог языка: ru → null (русский в коде); прочие — генерат, один раз. */
export function loadCatalog(locale: UiLocale): Promise<CatalogSource | null> {
  if (locale === DEFAULT_UI_LOCALE) return Promise.resolve(null);
  if (loaded.has(locale)) return Promise.resolve(loaded.get(locale) ?? null);
  const pending = inflight.get(locale);
  if (pending) return pending;
  const key = Object.keys(loaders).find((k) => k.endsWith(`/${locale}.json`));
  const loader = key ? loaders[key] : undefined;
  if (!loader) {
    loaded.set(locale, null);
    return Promise.resolve(null);
  }
  catalogLoadCount[locale] = (catalogLoadCount[locale] ?? 0) + 1;
  const p = loader()
    .then((mod) => normalizeCatalog(locale, mod))
    .catch((err: unknown) => {
      console.warn(`[i18n] каталог ${locale} не загружен:`, (err as Error)?.message ?? err);
      return null;
    })
    .then((cat) => {
      loaded.set(locale, cat);
      inflight.delete(locale);
      return cat;
    });
  inflight.set(locale, p);
  return p;
}

/* ── cookie и первичное определение ─────────────────────────────────── */

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function writeLocaleCookie(locale: UiLocale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${UI_LOCALE_COOKIE}=${locale}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

/** Язык гостя до ответа сервера: cookie → navigator.language → ru. */
export function resolveInitialLocale(): UiLocale {
  const fromCookie = readCookie(UI_LOCALE_COOKIE);
  if (isUiLocale(fromCookie)) return fromCookie;
  if (typeof navigator !== "undefined") {
    const langs = [navigator.language, ...(navigator.languages ?? [])];
    for (const l of langs) {
      const base = (l ?? "").toLowerCase().split("-")[0];
      if (isUiLocale(base)) return base;
    }
  }
  return DEFAULT_UI_LOCALE;
}

/* ── хранилище ───────────────────────────────────────────────────────── */

interface I18nState {
  locale: UiLocale;
  /** Каталог текущего языка (null — русский либо ещё не загружен) */
  catalog: CatalogSource | null;
  /** Растёт при смене языка и при приходе каталога — на него подписан useT() */
  version: number;
  /** Идёт загрузка каталога */
  loading: boolean;
  /** Сменить язык интерфейса: cookie, каталог по требованию, перерисовка.
   *  Сервер (PATCH /auth/me) здесь НЕ зовётся — это дело auth-store. */
  setLocale(locale: UiLocale): Promise<void>;
}

export const useI18nStore = create<I18nState>((set, get) => ({
  locale: resolveInitialLocale(),
  catalog: null,
  version: 0,
  loading: false,

  async setLocale(locale) {
    if (!isUiLocale(locale)) return;
    writeLocaleCookie(locale);
    if (typeof document !== "undefined") document.documentElement.lang = locale;
    if (locale === get().locale) return; // тот же язык — ни запроса, ни перерисовки
    const cached = loaded.get(locale);
    set({ locale, catalog: cached ?? null, loading: cached === undefined && locale !== DEFAULT_UI_LOCALE, version: get().version + 1 });
    if (locale === DEFAULT_UI_LOCALE || cached !== undefined) return;
    const cat = await loadCatalog(locale);
    // пока грузился — язык мог смениться снова
    if (get().locale !== locale) return;
    set({ catalog: cat, loading: false, version: get().version + 1 });
  },
}));

/** Применить язык вошедшего пользователя (users.ui_locale из /auth/me);
 *  null/undefined — «не выбирал», остаётся язык гостя. */
export function applyUserLocale(uiLocale: string | null | undefined): void {
  if (isUiLocale(uiLocale)) void useI18nStore.getState().setLocale(uiLocale);
}

/** Текущий язык интерфейса — вне компонентов (в компонентах — useLocale). */
export function currentUiLocale(): UiLocale {
  return useI18nStore.getState().locale;
}

/* Провайдер каталога для tl() — из хранилища; ставится при импорте модуля
   (клиентское приложение импортирует его из App). */
setCatalogProvider(() => useI18nStore.getState().catalog);

/* Первичный язык гостя: каталог подтягивается сразу (cookie/navigator могли
   дать en или de), и <html lang> — тоже. Только в браузере. */
if (typeof document !== "undefined") {
  const initial = useI18nStore.getState().locale;
  document.documentElement.lang = initial;
  if (initial !== DEFAULT_UI_LOCALE) {
    useI18nStore.setState({ loading: true });
    void loadCatalog(initial).then((cat) => {
      const s = useI18nStore.getState();
      if (s.locale === initial) useI18nStore.setState({ catalog: cat, loading: false, version: s.version + 1 });
    });
  }
}

export { UI_LOCALES };
export type { UiLocale };
