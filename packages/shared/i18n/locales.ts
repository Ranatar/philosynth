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

export const UI_LOCALES = ["ru", "en", "de"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

/** Язык генерации по языку интерфейса (значения — из LANG_OPTIONS). */
export const UI_TO_GEN: Readonly<Record<UiLocale, string>> = {
  ru: "Russian",
  en: "English",
  de: "German",
};

/** Язык генерации, когда соответствия языку интерфейса нет. */
export const GEN_FALLBACK = "English";

/** Умолчание интерфейса (язык исходника и колонка ru мастер-таблицы). */
export const DEFAULT_UI_LOCALE: UiLocale = "ru";

export function isUiLocale(v: unknown): v is UiLocale {
  return typeof v === "string" && (UI_LOCALES as readonly string[]).includes(v);
}

/** Правило владельца: язык генерации, соответствующий языку интерфейса. */
export function genLangForUi(locale: string): string {
  return isUiLocale(locale) ? UI_TO_GEN[locale] : GEN_FALLBACK;
}

/**
 * Список языков генерации формы создания синтеза (перенесён из
 * client/src/components/synthesis/SynthesisForm.tsx, беседа 1.5): пары
 * [значение syntheses.lang, подпись]. «__custom» — ввод языка руками.
 */
export const LANG_OPTIONS = [
  ["Russian", "Русский"],
  ["English", "English"],
  ["German", "Deutsch"],
  ["French", "Français"],
  ["Spanish", "Español"],
  ["Chinese", "中文"],
  ["Japanese", "日本語"],
  ["Latin", "Latina"],
  ["__custom", "Другой…"],
] as const;

export const LANG_CUSTOM_VALUE = "__custom";

/** Значения языков генерации, выбираемые в форме (без «__custom»). */
export const GEN_LANG_VALUES: readonly string[] = LANG_OPTIONS
  .map(([v]) => v)
  .filter((v) => v !== LANG_CUSTOM_VALUE);
