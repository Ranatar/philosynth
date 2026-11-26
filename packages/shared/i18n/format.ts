/**
 * Числа и даты на языке ИНТЕРФЕЙСА (беседа L.1, 2026-11-26).
 *
 * Язык — тот же, по которому tl() выбирает каталог (`currentCatalogLocale`):
 * в клиенте — язык переключателя, на сервере — язык запроса (ALS). До L.1
 * подписи переводились, а числа и даты печатались `toLocaleString("ru-RU")`
 * при любом языке — «12 345 симв.» в английском интерфейсе.
 *
 * НЕ для текста, уходящего в промпт, в генлог как сырьё и в экспортированный
 * файл: они русские по конституции Фазы 11 (промпты, константы, БД) и их
 * разбирает импорт — там остаётся явный "ru".
 */
import { currentCatalogLocale } from "./t.js";

/** Локаль Intl текущего языка интерфейса. */
export function uiIntlLocale(): string {
  return currentCatalogLocale();
}

/** Целое/дробное с разделителями языка интерфейса. */
export function fmtUiNumber(n: number, opts?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(uiIntlLocale(), opts);
}

/** Дата (без времени) на языке интерфейса; невалидная дата — как есть. */
export function fmtUiDate(d: Date | string | number, opts?: Intl.DateTimeFormatOptions): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString(uiIntlLocale(), opts);
}

/** Дата и время на языке интерфейса; невалидная дата — как есть. */
export function fmtUiDateTime(d: Date | string | number, opts?: Intl.DateTimeFormatOptions): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleString(uiIntlLocale(), opts);
}
