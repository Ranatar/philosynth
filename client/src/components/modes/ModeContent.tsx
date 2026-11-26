/**
 * Контент результата режима. Беседа 4.1 (запрос 1, п. 6).
 *
 * Рендер HTML-результата (dangerouslySetInnerHTML) — паритет
 * modeContent.innerHTML исходника [22905]. Стили — .mode-modal-body
 * .doc-content (globals.css, дословно из исходника): контент режима
 * приходит от Claude как <div class="doc-content">…</div>.
 * Обогащение enrichSectionHtml (1.6b) здесь НЕ нужно: у режимов нет
 * якорной hash-навигации и подразделов.
 */
import { genLangContentAttrs } from "@philosynth/shared/i18n/locales";

export interface ModeContentProps {
  html: string;
  /** 2026-11-26: язык генерации документа — lang/dir результата режима
   *  (таблица GEN_LANGS); не задан — направление по первой букве текста */
  contentLang?: string | undefined;
}

export function ModeContent({ html, contentLang }: ModeContentProps) {
  return (
    <div
      id="modeContent"
      className="doc-content"
      {...(contentLang !== undefined ? genLangContentAttrs(contentLang) : { dir: "auto" as const })}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
