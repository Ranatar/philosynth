/**
 * Обёртка над linkedom для серверного DOM-парсинга (05-file-structure,
 * server/utils/html-parser.ts; беседа 1.3).
 *
 * Зачем: контекстная подсистема исходника читает разделы из DOM
 * (`el.querySelector('[data-section="…"]')`, `el.innerText`). В сервисе
 * HTML раздела лежит в `sections.html_content` — его нужно распарсить
 * серверным DOM, чтобы порты extract*() оставались дословными.
 *
 * Два отличия серверного DOM от браузерного, закрытые здесь:
 *  1. linkedom не реализует `innerText` (только `textContent`, который
 *     склеивает текст без переносов: «<p>a</p><p>b</p>» → «ab»).
 *     `innerText()` ниже — приближение браузерного поведения: блочные
 *     элементы и <br> дают перенос строки, ячейки таблицы разделяются
 *     пробелом, пробельные последовательности схлопываются. Это
 *     АДАПТАЦИЯ, а не дословный порт: точное совпадение с браузерным
 *     layout-зависимым innerText недостижимо вне браузера.
 *  2. Фрагмент раздела — не документ: parseFragment оборачивает HTML в
 *     контейнер, возвращая элемент с тем же API, что `generated[key]`
 *     в исходнике.
 *
 * Интерфейс HtmlElement — структурный минимум, надстройка над
 * TableLikeElement из server/utils/text.ts (tableToText принимает
 * элементы отсюда без приведений).
 */

import { parseHTML } from "linkedom";

import type { TableLikeElement } from "./text.js";

/** Структурный минимум DOM-элемента, достаточный для портов extract*(). */
export interface HtmlElement extends TableLikeElement {
  readonly tagName: string;
  readonly children: Iterable<HtmlElement>;
  readonly childNodes: Iterable<HtmlNode>;
  readonly nextElementSibling: HtmlElement | null;
  querySelector(selector: string): HtmlElement | null;
  querySelectorAll(selector: string): Iterable<HtmlElement>;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  textContent: string | null;
}

/** Узел дерева: элемент (nodeType 1) либо текст (nodeType 3). */
export interface HtmlNode {
  readonly nodeType: number;
  readonly textContent: string | null;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/**
 * Блочные теги, дающие ОДИН перенос строки (боксы без вертикальных
 * отступов: div, li, строка таблицы, секционные обёртки).
 */
const LINE_BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "DD",
  "DETAILS",
  "DIV",
  "DT",
  "FIGCAPTION",
  "FOOTER",
  "HEADER",
  "LI",
  "MAIN",
  "NAV",
  "SECTION",
  "SUMMARY",
  "TBODY",
  "TFOOT",
  "THEAD",
  "TR",
]);

/**
 * Блочные теги, дающие ПУСТУЮ СТРОКУ (в браузере имеют вертикальные
 * margin, из-за чего innerText разделяет их двойным переносом):
 * абзацы, заголовки, таблицы, списки, цитаты.
 */
const PARAGRAPH_BLOCK_TAGS = new Set([
  "BLOCKQUOTE",
  "DL",
  "FIELDSET",
  "FIGURE",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "OL",
  "P",
  "PRE",
  "TABLE",
  "UL",
]);

/** Ячейки таблицы: в браузере разделяются табуляцией, здесь — пробелом. */
const CELL_TAGS = new Set(["TD", "TH"]);

/**
 * Границы блоков помечаются служебными символами, а не сразу переносами:
 * соседние блоки дают ДВЕ границы (конец предыдущего + начало следующего),
 * которые в браузере схлопываются в один разделитель. Схлопывание идёт по
 * максимуму «силы»: если в серии есть абзацная граница — пустая строка,
 * иначе — один перенос.
 */
const LINE_BOUNDARY = "\u0001";
const PARA_BOUNDARY = "\u0002";
const BOUNDARY_RUN_RE = /[\u0001\u0002]+/g;

/**
 * Парсинг HTML-фрагмента раздела в элемент-контейнер.
 * Возвращаемый элемент — аналог `generated[sectionKey]` исходника.
 */
export function parseFragment(html: string): HtmlElement {
  const { document } = parseHTML(
    `<!DOCTYPE html><html><body><div id="__ps_root">${html}</div></body></html>`,
  );
  const root = document.getElementById("__ps_root");
  if (!root) {
    // Недостижимо: контейнер вставлен нами. Защита от смены поведения linkedom.
    throw new Error("html-parser: не удалось создать контейнер фрагмента");
  }
  return root as unknown as HtmlElement;
}

/** true, если строка состоит только из пробельных символов */
function isBlank(s: string): boolean {
  return /^\s*$/.test(s);
}

/**
 * Приближение браузерного `element.innerText`.
 * Схлопывает пробельные последовательности, ставит перенос на границах
 * блоков без отступов (div, li, tr) и <br>, пустую строку — на границах
 * блоков с вертикальными margin (p, заголовки, таблицы, списки),
 * оставляет не более одной пустой строки подряд.
 */
export function innerText(el: HtmlElement | null | undefined): string {
  if (!el) return "";
  const out: string[] = [];
  walk(el, out);
  return normalizeInnerText(out.join(""));
}

function walk(el: HtmlElement, out: string[]): void {
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "BR") {
    out.push(LINE_BOUNDARY);
    return;
  }
  const line = LINE_BLOCK_TAGS.has(tag);
  const para = PARAGRAPH_BLOCK_TAGS.has(tag);
  if (para) out.push(PARA_BOUNDARY);
  else if (line) out.push(LINE_BOUNDARY);

  let first = true;
  for (const node of el.childNodes) {
    if (node.nodeType === TEXT_NODE) {
      const raw = node.textContent ?? "";
      if (raw === "") continue;
      out.push(raw.replace(/\s+/g, " "));
      first = false;
    } else if (node.nodeType === ELEMENT_NODE) {
      const child = node as unknown as HtmlElement;
      const childTag = (child.tagName || "").toUpperCase();
      if (CELL_TAGS.has(childTag) && !first) out.push(" ");
      walk(child, out);
      first = false;
    }
  }

  if (para) out.push(PARA_BOUNDARY);
  else if (line) out.push(LINE_BOUNDARY);
}

function normalizeInnerText(text: string): string {
  const withNewlines = text.replace(BOUNDARY_RUN_RE, (run) =>
    run.includes(PARA_BOUNDARY) ? "\n\n" : "\n",
  );
  const lines = withNewlines
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim());
  const result: string[] = [];
  for (const line of lines) {
    if (isBlank(line) && (result.length === 0 || isBlank(result[result.length - 1] ?? "")))
      continue;
    result.push(line);
  }
  while (result.length && isBlank(result[result.length - 1] ?? "")) result.pop();
  return result.join("\n");
}

/**
 * `el.innerText?.trim()` исходника одной функцией — читаемость портов.
 * Пустая строка возвращается как "" (в исходнике — undefined → "" через `|| ""`).
 */
export function innerTextTrimmed(el: HtmlElement | null | undefined): string {
  return innerText(el).trim();
}
