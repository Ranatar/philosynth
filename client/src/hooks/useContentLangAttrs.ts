/**
 * Атрибуты lang/dir для содержимого документа вне тел разделов (2026-11-26,
 * вне бесед): обогащения элемента, живой просмотр преобразования. Язык —
 * открытой концепции (стор синтеза): правила письменностей (gen-script-css)
 * завязаны на :lang() и :dir(), без lang арабский текст оставался с
 * разрядкой заголовков. Концепция не открыта — направление по первой букве.
 */
import { genLangContentAttrs } from "@philosynth/shared/i18n/locales";

import { useSynthesisStore } from "../stores/synthesis-store";

export function useContentLangAttrs(): { lang?: string; dir: "ltr" | "rtl" | "auto" } {
  const lang = useSynthesisStore((s) => s.synthesis?.lang);
  return lang !== undefined ? genLangContentAttrs(lang) : { dir: "auto" };
}
