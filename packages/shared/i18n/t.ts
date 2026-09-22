/**
 * Перевод строк интерфейса — общий для клиента и сервера.
 *
 *   tl("auth.login.submit", "Войти")
 *   tl("catalog.synthesisCard.author", "Автор: {authorName}", { authorName })
 *
 * Второй аргумент — русский текст: он же запасной вариант, он же источник
 * колонки ru мастер-таблицы (packages/shared/i18n/strings.json), откуда его
 * забирает `npm run i18n:export`. Подстановки — {имя}; значения — только
 * строки, числа, null/undefined/boolean (ReactNode сюда не передаётся —
 * это ловит проверка типов).
 *
 * Каталог текущего языка отдаёт провайдер: клиент ставит его из своего
 * хранилища языка, сервер — из языка запроса. Пока провайдер не поставлен,
 * возвращается русский текст — поведение проекта не меняется.
 */

/** null, undefined и логические значения подставляются пустой строкой —
 *  как их (не) рисует React в JSX. */
export type TlParams = Readonly<Record<string, string | number | boolean | null | undefined>>;
export type Catalog = Readonly<Record<string, string>>;

let catalogProvider: (() => Catalog | null | undefined) | null = null;

/** Поставить источник каталога текущего языка (null — только русский). */
export function setCatalogProvider(provider: (() => Catalog | null | undefined) | null): void {
  catalogProvider = provider;
}

/** Подставить {имя} из params; неизвестные подстановки остаются как есть. */
export function formatMessage(text: string, params?: TlParams): string {
  if (!params) return text;
  return text.replace(/\{([A-Za-z_$][\w$]*)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? printValue(params[name]) : whole,
  );
}

function printValue(v: string | number | boolean | null | undefined): string {
  return v == null || typeof v === "boolean" ? "" : String(v);
}

export function tl(key: string, ru: string, params?: TlParams): string {
  const translated = catalogProvider?.()?.[key];
  return formatMessage(translated ?? ru, params);
}
