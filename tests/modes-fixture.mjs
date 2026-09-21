/**
 * Фикстура режимов для тестов импорта (2026-09-21, вне бесед): блок
 * #philosynth-modes в разметке buildModesExportSection одностраничника
 * [17541–17553] ДОСЛОВНО (обёртка с отступами строк, data-mode-*), вставка
 * в начало #docOutput — как saveHTML [18200]. Разметка сверена с настоящим
 * прогоном одностраничника (runMode на моке API → saveHTML).
 * Потребители: test-import-modes, test-modes-readonly.
 */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const RESULTS = [
  ["adversarial", "⚔ Оппонент", "Кант", "2026-09-21T06:48:06.134Z", `<div class="doc-content"><h3>Опровержение: Кант</h3><p>Разлом <strong>смешивает</strong> уровни.</p><table class="doc-table"><thead><tr><th>Тезис</th><th>Контртезис</th></tr></thead><tbody><tr><td>А</td><td>Б</td></tr></tbody></table></div>`],
  ["adversarial", "⚔ Оппонент", "Логический позитивизм", "2026-09-21T06:48:06.151Z", `<div class="doc-content"><h3>Опровержение</h3><div class="callout warning"><span class="callout-label">Возражение</span>Бессмысленно.</div></div>`],
  ["translator", "🔄 Переводчик", "Буддийская Абхидхарма", "2026-09-21T06:48:06.166Z", `<div class="doc-content"><h3>1. Таблица перевода</h3><p>Duḥkha, <em>ahaṃkāra</em> &amp; «кавычки»</p></div>`],
  ["timeslice", "⏳ Временной срез", "Афины V в. до н.э.", "2026-09-21T06:48:06.179Z", `<div class="doc-content"><blockquote>χάσμα</blockquote></div>`],
];
export function withModes(html, results = RESULTS) {
  // Разметка buildModesExportSection [17541–17553] дословно, включая отступы
  let data = '<div id="philosynth-modes" style="display:none">';
  for (const [key, title, param, ts, body] of results) {
    data += `<div class="philosynth-mode"
                 data-mode-key="${esc(key)}"
                 data-mode-title="${esc(title)}"
                 data-mode-param="${esc(param)}"
                 data-mode-timestamp="${esc(ts)}">
              ${body}
            </div>`;
  }
  data += "</div>";
  // saveHTML [18200]: <div id="docOutput">${modesSection}${docHTML}</div>
  return html.replace('<div id="docOutput">', '<div id="docOutput">' + data);
}
