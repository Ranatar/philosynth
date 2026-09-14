/**
 * Пересборка HTML капсулы из текста. Беседа 8.4 (запрос 1, п. 6).
 *
 * Капсула хранится в syntheses.capsule_html целой секцией документа
 * (`div.doc-section` с .section-num/.section-title и подразделом
 * `[data-section="Капсула"]`), а шапка показывает ТЕКСТ, извлечённый
 * extractCapsuleText (1.5b). Правка по месту идёт в textarea с текстом:
 * править сырой HTML читателю философского документа незачем, а
 * PATCH /syntheses/:id/capsule принимает { html } (03 §2.4) — значит,
 * HTML собирается на клиенте:
 *  - берётся исходная секция, в ней целевой контейнер — тот же, что у
 *    экстрактора: `[data-section="Капсула"]`, иначе `.doc-content`,
 *    иначе корень; у контейнера сохраняется <h4> (заголовок
 *    подраздела), остальное содержимое заменяется абзацами <p> —
 *    по одному на блок текста, разделённый пустой строкой;
 *  - обёртка секции (номер, заголовок, data-section) не трогается —
 *    экстракторы capsule:full (1.3) и импорт/экспорт продолжают находить
 *    секцию по тем же якорям;
 *  - если исходного HTML нет (пустая капсула) — собирается минимальная
 *    секция с тем же якорем data-section.
 * Обратная операция extractCapsuleText(buildCapsuleHtml(html, text))
 * возвращает тот же текст с точностью до схлопывания пробелов.
 */

const CAPSULE_SECTION = "Капсула";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Текст → абзацы: пустая строка разделяет, одиночные переносы — <br> */
export function capsuleParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function paragraphsToHtml(paragraphs: readonly string[]): string {
  return paragraphs
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/**
 * Новый HTML капсулы: исходная секция с заменённым содержимым.
 * Требует DOMParser (браузер; в смоуках — linkedom).
 */
export function buildCapsuleHtml(originalHtml: string, text: string): string {
  const body = paragraphsToHtml(capsuleParagraphs(text));
  if (!originalHtml.trim()) {
    return (
      `<div class="doc-section">` +
      `<div class="doc-content" data-section="${CAPSULE_SECTION}">` +
      `<h4>${CAPSULE_SECTION}</h4>\n${body}</div></div>`
    );
  }
  const doc = new DOMParser().parseFromString(
    `<div id="__capsule_root">${originalHtml}</div>`,
    "text/html",
  );
  const root = doc.getElementById("__capsule_root");
  if (!root) return originalHtml;
  const target =
    root.querySelector(`[data-section="${CAPSULE_SECTION}"]`) ??
    root.querySelector(".doc-content") ??
    (root.firstElementChild ?? root);
  const h4 = target.querySelector("h4");
  const keepH4 = h4 ? h4.outerHTML + "\n" : "";
  target.innerHTML = keepH4 + body;
  return root.innerHTML;
}
