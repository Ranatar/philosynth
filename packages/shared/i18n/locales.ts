/**
 * Языки интерфейса и их связь с языком генерации (беседа 11.2, п.1).
 *
 * Правило владельца (Фаза 11): смена языка ИНТЕРФЕЙСА переключает язык
 * ГЕНЕРАЦИИ на соответствующий (нет соответствия → English); смена языка
 * генерации язык интерфейса не меняет. Связь односторонняя — её реализует
 * PATCH /auth/me (routes/auth.ts), здесь только словарь и функция.
 *
 * Значения языков генерации — те же, что в списке формы создания
 * (LANG_OPTIONS ниже, бывший локальный список SynthesisForm.tsx 1.5):
 * второго списка нет намеренно, сторож 4aw проверяет UI_TO_GEN ⊆ LANG_OPTIONS.
 *
 * Подписи LANG_OPTIONS — самоназвания языков; две русские («Русский»,
 * «Другой…») — строки-данные (packages/shared codemod не переписывает),
 * переводятся по месту показа в 11.4.
 */

export const UI_LOCALES = ["ru", "en", "de", "fr", "es", "it"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

/** Язык генерации по языку интерфейса (значения — из LANG_OPTIONS). */
export const UI_TO_GEN: Readonly<Record<UiLocale, string>> = {
  ru: "Russian",
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
};

/** Язык генерации, когда соответствия языку интерфейса нет. */
export const GEN_FALLBACK = "English";

/** Умолчание интерфейса (язык исходника и колонка ru мастер-таблицы). */
export const DEFAULT_UI_LOCALE: UiLocale = "ru";

export function isUiLocale(v: unknown): v is UiLocale {
  return typeof v === "string" && (UI_LOCALES as readonly string[]).includes(v);
}

/**
 * Направление письма ИНТЕРФЕЙСА (2026-11-26, вне бесед). Языки, которые
 * пишутся справа налево, перечислены по основному подтегу BCP 47 — список
 * шире нынешних UI_LOCALES намеренно: язык интерфейса, добавленный беседой
 * L, получает направление отсюда, без правок компонентов. Клиент ставит
 * результат атрибутом `dir` на <html> рядом с `lang` (i18n-store), стили
 * клиента написаны логическими свойствами (scripts/checks/css_logical.py) и
 * зеркалятся сами; то, что логическими свойствами не выражается, — блок
 * «Направление интерфейса» в части 3 globals.css.
 */
export type UiDir = "ltr" | "rtl";
export const RTL_UI_LANGS: readonly string[] = ["ar", "fa", "he", "ur", "ps", "sd", "ug", "yi", "dv", "ckb"];

export function uiLocaleDir(locale: string | null | undefined): UiDir {
  const primary = (locale ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
  return RTL_UI_LANGS.includes(primary) ? "rtl" : "ltr";
}

/** Правило владельца: язык генерации, соответствующий языку интерфейса. */
export function genLangForUi(locale: string): string {
  return isUiLocale(locale) ? UI_TO_GEN[locale] : GEN_FALLBACK;
}

/* ── Языки генерации — ОДНА таблица (2026-11-26, вне бесед) ─────────────
 *
 * Прежде сведения о языке генерации жили в трёх местах, которые расходились:
 * список формы (здесь), цепочка docLang → html lang экспортёра и карта
 * словарей поиска (constants/search). Теперь всё — строкой этой таблицы, а
 * LANG_OPTIONS, словари поиска, html lang и направление письма, суффикс имени
 * файла и имя языка для модели выводятся из неё.
 *
 * Поля строки:
 *  - value   — значение syntheses.lang / users.gen_lang (английское имя
 *              языка; оно же уходит в промпт, если promptName не задан);
 *  - label   — самоназвание (не переводится);
 *  - bcp47   — тег языка для атрибута lang (html экспорта, тела разделов);
 *  - dir     — направление письма: тела документа на арабском и фарси
 *              вёрстаются справа налево (атрибут dir), интерфейс — нет;
 *  - search  — словарь полнотекстового поиска PostgreSQL (snowball); null —
 *              морфологии нет, только `simple` (слова как есть);
 *  - fileSuffix — суффикс имени файла экспорта. У прежних языков — правило
 *              исходника «первые две буквы значения» (German → -ge,
 *              Chinese → -ch), чтобы имена прежних выгрузок не менялись; у
 *              новых — код BCP 47 (две буквы значения дали бы «-an» у
 *              Ancient Greek и совпали бы у Persian/Portuguese по смыслу);
 *  - experimental — модель пишет на языке заметно хуже, чем на прочих
 *              (длинный связный текст): в форме — пометка и предупреждение;
 *  - promptName — как язык назван модели, когда одного имени мало
 *              (письменность, орфография, норма).
 */

export type GenLangDir = "ltr" | "rtl";

/** Словари snowball, которыми индексируются документы языков таблицы. */
export type GenLangSearchConfig =
  | "russian"
  | "english"
  | "german"
  | "french"
  | "spanish"
  | "italian"
  | "portuguese"
  | "arabic";

export interface GenLangInfo {
  readonly value: string;
  readonly label: string;
  readonly bcp47: string;
  readonly dir: GenLangDir;
  readonly search: GenLangSearchConfig | null;
  readonly fileSuffix: string;
  readonly experimental: boolean;
  readonly promptName?: string;
}

/** Порядок — порядок списка формы: живые языки, затем языки учёной традиции. */
export const GEN_LANGS: readonly GenLangInfo[] = [
  { value: "Russian", label: "Русский", bcp47: "ru", dir: "ltr", search: "russian", fileSuffix: "", experimental: false },
  { value: "English", label: "English", bcp47: "en", dir: "ltr", search: "english", fileSuffix: "en", experimental: false },
  { value: "German", label: "Deutsch", bcp47: "de", dir: "ltr", search: "german", fileSuffix: "ge", experimental: false },
  { value: "French", label: "Français", bcp47: "fr", dir: "ltr", search: "french", fileSuffix: "fr", experimental: false },
  { value: "Italian", label: "Italiano", bcp47: "it", dir: "ltr", search: "italian", fileSuffix: "it", experimental: false },
  { value: "Spanish", label: "Español", bcp47: "es", dir: "ltr", search: "spanish", fileSuffix: "sp", experimental: false },
  { value: "Portuguese", label: "Português", bcp47: "pt", dir: "ltr", search: "portuguese", fileSuffix: "pt", experimental: false },
  { value: "Chinese", label: "中文", bcp47: "zh", dir: "ltr", search: null, fileSuffix: "ch", experimental: false },
  { value: "Japanese", label: "日本語", bcp47: "ja", dir: "ltr", search: null, fileSuffix: "ja", experimental: false },
  { value: "Arabic", label: "العربية", bcp47: "ar", dir: "rtl", search: "arabic", fileSuffix: "ar", experimental: false },
  { value: "Persian", label: "فارسی", bcp47: "fa", dir: "rtl", search: null, fileSuffix: "fa", experimental: false, promptName: "Persian (Farsi)" },
  { value: "Latin", label: "Latina", bcp47: "la", dir: "ltr", search: null, fileSuffix: "la", experimental: false },
  {
    value: "Ancient Greek", label: "Ἀρχαία ἑλληνική", bcp47: "grc", dir: "ltr", search: null, fileSuffix: "grc", experimental: true,
    promptName: "Ancient Greek (Attic prose, polytonic orthography)",
  },
  {
    value: "Classical Chinese", label: "文言", bcp47: "lzh", dir: "ltr", search: null, fileSuffix: "lzh", experimental: true,
    promptName: "Classical Chinese (文言文, Literary Chinese), written in traditional characters",
  },
  {
    value: "Sanskrit", label: "संस्कृतम्", bcp47: "sa", dir: "ltr", search: null, fileSuffix: "sa", experimental: true,
    promptName: "Sanskrit, written in Devanagari script (not in transliteration)",
  },
];

export const LANG_CUSTOM_VALUE = "__custom";

/**
 * Список языков генерации формы создания синтеза (перенесён из
 * client/src/components/synthesis/SynthesisForm.tsx, беседа 1.5): пары
 * [значение syntheses.lang, подпись]. «__custom» — ввод языка руками.
 * С 2026-11-26 выводится из GEN_LANGS.
 */
export const LANG_OPTIONS: readonly (readonly [string, string])[] = [
  ...GEN_LANGS.map((l) => [l.value, l.label] as const),
  [LANG_CUSTOM_VALUE, "Другой…"],
];

/** Значения языков генерации, выбираемые в форме (без «__custom»). */
export const GEN_LANG_VALUES: readonly string[] = GEN_LANGS.map((l) => l.value);

/** Строка таблицы по значению syntheses.lang (без регистра и краевых
 *  пробелов); язык, введённый руками и в таблице не найденный, — null. */
export function genLangInfo(value: string | null | undefined): GenLangInfo | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return null;
  return GEN_LANGS.find((l) => l.value.toLowerCase() === v) ?? null;
}

/** Имя языка для модели: promptName строки либо значение как есть. */
export function genLangPromptName(value: string): string {
  return genLangInfo(value)?.promptName ?? value;
}

/**
 * Атрибуты lang/dir для разметки с СОДЕРЖИМЫМ документа (тела разделов,
 * капсула, режимы). Язык таблицы — его тег и направление; язык, введённый
 * руками, — dir="auto" без lang: направление определит первая буква
 * текста (иврит, урду и пр. встанут справа налево сами), тег не угадываем.
 */
export function genLangContentAttrs(value: string | null | undefined): { lang?: string; dir: "ltr" | "rtl" | "auto" } {
  const info = genLangInfo(value);
  if (info) return { lang: info.bcp47, dir: info.dir };
  return (value ?? "").trim() ? { dir: "auto" } : { lang: "ru", dir: "ltr" };
}

/** Тег языка для <html lang> экспорта: язык таблицы — его тег; введённый
 *  руками — «und» (не определён; прежде такой файл ложно звался английским). */
export function genLangHtmlTag(value: string | null | undefined): string {
  if (!(value ?? "").trim()) return "ru";
  return genLangInfo(value)?.bcp47 ?? "und";
}

/** Суффикс имени файла экспорта (без дефиса; "" — без суффикса). Язык,
 *  введённый руками, — по правилу исходника: две первые буквы. */
export function genLangFileSuffix(value: string | null | undefined): string {
  const v = (value ?? "").trim() || "Russian";
  const info = genLangInfo(v);
  if (info) return info.fileSuffix;
  return v.slice(0, 2).toLowerCase();
}
