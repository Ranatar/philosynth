/**
 * Оформление документа на языках с иной письменностью (2026-11-26, вне
 * бесед): арабский и фарси — справа налево и арабской вязью, санскрит —
 * деванагари, древнегреческий — политоника.
 *
 * Один текст правил на клиент и экспорт: клиент держит его ДОСЛОВНО в
 * globals.css (часть 3, блок между метками GEN_SCRIPT_CSS_BEGIN/END), экспорт
 * HTML кладёт его после CSS исходника. Сторож 4bu сверяет, что блок
 * globals.css совпадает с GEN_SCRIPT_CSS побайтно.
 *
 * Что делают правила:
 *  - шрифты: к стекам --mono/--sans/--serif добавлены IBM Plex Sans Arabic
 *    (арабский, фарси), IBM Plex Sans Devanagari (санскрит) и Noto
 *    (политоника древнегреческого) запасными семействами — латиница и
 *    кириллица по-прежнему берутся из прежних семейств, а файлы новых
 *    браузер грузит, только встретив их буквы (unicode-range);
 *  - древнегреческий (:lang(grc)): в IBM Plex греческий только
 *    монотонический, в Playfair Display и IBM Plex Mono греческого нет —
 *    буквы с придыханиями и облечённым ударением падали в системный шрифт
 *    вперемешку с Plex внутри слова. Под :lang(grc) стеки начинаются с Noto
 *    (Sans / Serif / Sans Mono — greek и greek-ext), слово набирается одним
 *    шрифтом; прописные в моноширинных заголовках сняты (text-transform в
 *    древнегреческом оставляет диакритику над прописными);
 *  - справа налево: правила стоят на псевдоклассе :dir(rtl), а не на
 *    атрибуте — он срабатывает и при dir="rtl" на самом .doc-content
 *    (режимы), и при dir="auto" (язык, введённый руками): выравнивание
 *    заголовков таблиц, черта врезки и отступ списков переезжают на правую
 *    сторону;
 *  - разрядка и прописные: моноширинные заголовки документа набраны
 *    разрядкой 1.5–2 px и прописными в 9–10 px — разрядка рвёт соединения
 *    арабской вязи и лигатуры деванагари, прописных у этих письменностей
 *    нет, а 9 px вязи не читаются. Для ar/fa/sa разрядка снята, кегль
 *    подрос; тело текста — на кегль крупнее и с большим интерлиньяжем.
 *    :lang() стоит на самом элементе, а не на предке: .doc-content,
 *    несущий lang сам (режимы, обогащения), получает те же правила.
 */

/**
 * Семейства Google Fonts для письменностей языков генерации (параметр css2)
 * — ТОЛЬКО для экспортированного файла HTML: он живёт вне службы и берёт
 * шрифты ссылкой, как файл исходника. Клиент ссылок не держит: его шрифты
 * лежат в проекте (client/public/fonts, @font-face — client/src/fonts.css,
 * сборка scripts/fonts/vendor-fonts.mjs); семейства здесь и там — одни.
 */
export const GEN_SCRIPT_FONT_FAMILIES =
  "family=IBM+Plex+Sans+Arabic:wght@300;400;500;600&family=IBM+Plex+Sans+Devanagari:wght@300;400;500;600" +
  "&family=Noto+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Noto+Sans+Mono:wght@400;500;600&family=Noto+Serif:wght@700;900";

export const GEN_SCRIPT_CSS_BEGIN = "/* gen-script-css: begin (packages/shared/i18n/gen-script-css.ts) */";
export const GEN_SCRIPT_CSS_END = "/* gen-script-css: end */";

/** Правила (без меток). */
export const GEN_SCRIPT_CSS = `:root {
  --mono: "IBM Plex Mono", "IBM Plex Sans Arabic", "IBM Plex Sans Devanagari", "Noto Sans Mono", monospace;
  --sans: "IBM Plex Sans", "IBM Plex Sans Arabic", "IBM Plex Sans Devanagari", "Noto Sans", sans-serif;
  --serif: "Playfair Display", "IBM Plex Sans Arabic", "IBM Plex Sans Devanagari", "Noto Serif", serif;
}
:lang(grc) {
  --mono: "Noto Sans Mono", "IBM Plex Mono", monospace;
  --sans: "Noto Sans", "IBM Plex Sans", sans-serif;
  --serif: "Noto Serif", "Playfair Display", serif;
}
[lang="grc"] {
  font-family: var(--sans);
}
.doc-table th:dir(rtl) {
  text-align: right;
}
.callout:dir(rtl) {
  border-left: none;
  border-right: 3px solid;
}
.doc-content :is(ul, ol):dir(rtl) {
  margin: 8px 20px 14px 0;
}
.doc-content:is(:lang(ar), :lang(fa), :lang(sa)) {
  font-size: 14px;
  line-height: 2;
}
:is(.section-num, .doc-content h4, .doc-content h5, .doc-table th, .callout-label):is(:lang(ar), :lang(fa), :lang(sa)) {
  letter-spacing: normal;
  text-transform: none;
}
:is(.section-num, .doc-content h4, .doc-content h5, .doc-table th, .callout-label):lang(grc) {
  text-transform: none;
}
:is(.doc-content h4, .doc-content h5):is(:lang(ar), :lang(fa), :lang(sa)) {
  font-size: 13px;
}
:is(.section-num, .doc-table th, .callout-label):is(:lang(ar), :lang(fa), :lang(sa)) {
  font-size: 11px;
}`;

/** Тот же текст для <style> экспортированного файла. */
export const GEN_SCRIPT_EXPORT_CSS = `<style>\n${GEN_SCRIPT_CSS}\n</style>`;
