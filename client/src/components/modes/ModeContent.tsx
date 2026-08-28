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
export interface ModeContentProps {
  html: string;
}

export function ModeContent({ html }: ModeContentProps) {
  return (
    <div
      id="modeContent"
      className="doc-content"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
