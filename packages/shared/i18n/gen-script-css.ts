/**
 * Оформление документа на языках с иной письменностью (2026-11-26, вне
 * бесед): арабский и фарси — справа налево и арабской вязью, санскрит —
 * деванагари.
 *
 * Один текст правил на клиент и экспорт: клиент держит его ДОСЛОВНО в
 * globals.css (часть 3, блок между метками GEN_SCRIPT_CSS_BEGIN/END), экспорт
 * HTML кладёт его после CSS исходника. Сторож 4bu сверяет, что блок
 * globals.css совпадает с GEN_SCRIPT_CSS побайтно.
 *
 * Что делают правила:
 *  - шрифты: к стекам --mono/--sans/--serif добавлены IBM Plex Sans Arabic
 *    (арабский, фарси) и IBM Plex Sans Devanagari (санскрит) запасными
 *    семействами — латиница и кириллица по-прежнему берутся из прежних
 *    семейств, а файлы новых браузер грузит, только встретив их буквы
 *    (unicode-range Google Fonts);
 *  - справа налево (атрибут dir="rtl" на теле раздела ставит клиент и
 *    экспорт по таблице GEN_LANGS): выравнивание заголовков таблиц, черта
 *    врезки и отступ списков переезжают на правую сторону;
 *  - разрядка и прописные: моноширинные заголовки документа набраны
 *    разрядкой 1.5–2 px и прописными в 9–10 px — разрядка рвёт соединения
 *    арабской вязи и лигатуры деванагари, прописных у этих письменностей
 *    нет, а 9 px вязи не читаются. Для ar/fa/sa разрядка снята, кегль
 *    подрос; тело текста — на кегль крупнее и с большим интерлиньяжем.
 */

/** Семейства Google Fonts для письменностей языков генерации (параметр css2). */
export const GEN_SCRIPT_FONT_FAMILIES =
  "family=IBM+Plex+Sans+Arabic:wght@300;400;500;600&family=IBM+Plex+Sans+Devanagari:wght@300;400;500;600";

export const GEN_SCRIPT_CSS_BEGIN = "/* gen-script-css: begin (packages/shared/i18n/gen-script-css.ts) */";
export const GEN_SCRIPT_CSS_END = "/* gen-script-css: end */";

/** Правила (без меток). */
export const GEN_SCRIPT_CSS = `:root {
  --mono: "IBM Plex Mono", "IBM Plex Sans Arabic", "IBM Plex Sans Devanagari", monospace;
  --sans: "IBM Plex Sans", "IBM Plex Sans Arabic", "IBM Plex Sans Devanagari", sans-serif;
  --serif: "Playfair Display", "IBM Plex Sans Arabic", "IBM Plex Sans Devanagari", serif;
}
[dir="rtl"] .doc-table th {
  text-align: right;
}
[dir="rtl"] .callout {
  border-left: none;
  border-right: 3px solid;
}
[dir="rtl"] .doc-content ul,
[dir="rtl"] .doc-content ol {
  margin: 8px 20px 14px 0;
}
:is(:lang(ar), :lang(fa), :lang(sa)) .doc-content {
  font-size: 14px;
  line-height: 2;
}
:is(:lang(ar), :lang(fa), :lang(sa)) :is(.section-num, .doc-content h4, .doc-content h5, .doc-table th, .callout-label) {
  letter-spacing: normal;
  text-transform: none;
}
:is(:lang(ar), :lang(fa), :lang(sa)) :is(.doc-content h4, .doc-content h5) {
  font-size: 13px;
}
:is(:lang(ar), :lang(fa), :lang(sa)) :is(.section-num, .doc-table th, .callout-label) {
  font-size: 11px;
}`;

/** Тот же текст для <style> экспортированного файла. */
export const GEN_SCRIPT_EXPORT_CSS = `<style>\n${GEN_SCRIPT_CSS}\n</style>`;
