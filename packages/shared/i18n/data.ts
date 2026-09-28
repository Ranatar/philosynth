/**
 * Перевод ДАННЫХ по месту показа (беседа 11.4).
 *
 * Строки со отметкой `data` в strings.json — общие константы
 * (shared/constants/*), сиды БД (каталоги типов), конфиг матрицы
 * совместимости, зеркала MODE_UI и подзаголовка документа. Их читают и
 * промпты, и разбор документа, и сторожа 4x/4y — поэтому в самих константах
 * они остаются РУССКИМИ, а переводятся там, где человек их видит:
 *
 *   tData(ML[synthesis.method])          // «Диалектический» → «Dialectical»
 *   tData(spec.labelRu)                   // подпись характеристики
 *   tData(PASSWORD_TOO_SHORT_TEMPLATE, { minLength })   // шаблон с подстановкой
 *
 * Карта «русское значение → ключ таблицы» — генерат generated/data-keys.ts
 * (npm run i18n:split; --check сверяет свежесть, сторож 4ay). Значение без
 * ключа (пользовательский тип каталога, имя из документа, неизвестная
 * строка) возвращается как есть — данные документа на языке генерации не
 * трогаются. Перевод берётся тем же tl(), что и надписи: каталог языка
 * несёт data-строки (i18n:split 11.4).
 *
 * Этот модуль — единственное место, где tl() зовётся с НЕлитеральными
 * ключом и текстом; сканы i18n-core (scanCalls/scanStaticCalls) его
 * пропускают, как и t.ts.
 */
import { DATA_KEYS } from "./generated/data-keys.js";
import { tl, type TlParams } from "./t.js";

/** Ключ таблицы для русского значения данных; null — значение не из данных. */
export function displayKey(value: string): string | null {
  return DATA_KEYS[value] ?? null;
}

/** Есть ли у значения ключ в карте данных. */
export function isDataValue(value: string): boolean {
  return value in DATA_KEYS;
}

/**
 * Перевод значения данных на текущий язык каталога. Значение без ключа —
 * как есть (с подстановкой params, если оно шаблон). Пустое/нестроковое —
 * пустая строка.
 */
export function tData(value: string | null | undefined, params?: TlParams): string {
  if (typeof value !== "string" || value === "") return "";
  const key = DATA_KEYS[value];
  return tl(key ?? "", value, params);
}

/**
 * Перевод значения с обрезкой хвоста в скобках либо префикса-эмодзи не
 * делается здесь: вызывающий приводит значение к ТОЧНОМУ виду константы.
 * Для написания документа (строчная первая буква у типов категорий,
 * ФАКТ 5.4) — см. tDataLoose.
 */

/**
 * Нестрогий перевод: сначала точное значение, затем то же с заглавной
 * первой буквой (типы каталога в документе пишутся со строчной: «онтологическая»
 * при name_ru «Онтологическая»). Регистр результата подстраивается под
 * исходный (строчная первая буква сохраняется).
 */
export function tDataLoose(value: string | null | undefined): string {
  if (typeof value !== "string" || value === "") return "";
  if (value in DATA_KEYS) return tData(value);
  const cap = value.charAt(0).toLocaleUpperCase("ru") + value.slice(1);
  if (cap in DATA_KEYS) {
    const out = tData(cap);
    return out.charAt(0).toLocaleLowerCase() + out.slice(1);
  }
  return value;
}
