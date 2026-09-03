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
  /** Ближайший предок по селектору (порт extractSections 4.3 ищет
   *  родительский .doc-body через closest — linkedom его реализует) */
  closest(selector: string): HtmlElement | null;
  /** Сериализация элемента (extractSections 4.3 сохраняет outerHTML
   *  раздела в sections.html_content; innerHTML — тела .philosynth-mode
   *  в extractModesFromHTML) */
  readonly outerHTML: string;
  readonly innerHTML: string;
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

/* ── Полный документ (беседа 4.3: importHTML разбирает целый файл) ───── */

/**
 * Минимум document-API для import-service: getElementById + селекторы.
 * parseFragment здесь не годится — импортируемый файл является полным
 * документом (<html><head>…), а не фрагментом раздела.
 */
export interface HtmlDocument {
  getElementById(id: string): HtmlElement | null;
  querySelector(selector: string): HtmlElement | null;
  querySelectorAll(selector: string): Iterable<HtmlElement>;
}

/**
 * Парсинг ПОЛНОГО HTML-документа (беседа 4.3, importHTML). Аналог
 * `new DOMParser().parseFromString(htmlString, "text/html")` исходника
 * [21284]. Единственная точка входа linkedom (инвариант 1.3) — модуль
 * этот же.
 */
export function parseDocument(html: string): HtmlDocument {
  const { document } = parseHTML(html);
  return document as unknown as HtmlDocument;
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

/* ── Врезка подраздела в HTML раздела (беседа 1.4b) ──────────────────── */

/**
 * Минимум мутирующего DOM-API linkedom для врезки подраздела. Все
 * мутации HTML разделов идут через этот модуль — изоляция linkedom
 * (беседа 1.3) сохраняется.
 */
interface MutableElement {
  getAttribute(name: string): string | null;
  querySelector(selector: string): MutableElement | null;
  querySelectorAll(selector: string): Iterable<MutableElement>;
  insertAdjacentHTML(
    position: "beforebegin" | "afterbegin" | "beforeend" | "afterend",
    html: string,
  ): void;
  remove(): void;
  readonly outerHTML: string;
  /** innerHTML записываемый — точечная правка абзаца (5.1) */
  innerHTML: string;
  /** Ниже — расширение 5.1 (linkedom реализует всё) */
  readonly textContent: string | null;
  readonly parentElement: MutableElement | null;
  closest(selector: string): MutableElement | null;
}

function parseMutable(html: string): MutableElement {
  const { document } = parseHTML(
    `<!DOCTYPE html><html><body><div id="__ps_root">${html}</div></body></html>`,
  );
  const root = document.getElementById("__ps_root");
  if (!root) {
    throw new Error("html-parser: не удалось создать контейнер фрагмента");
  }
  return root as unknown as MutableElement;
}

/**
 * Поиск подраздела: точное имя, затем нечёткое взаимное включение —
 * порт поиска oldSubDiv в regenerateSubsection [20390–20402].
 */
function findMutableSubsection(
  root: MutableElement,
  name: string,
): MutableElement | null {
  const exact = root.querySelector(`[data-section="${name}"]`);
  if (exact) return exact;
  const lower = name.toLowerCase();
  for (const sub of root.querySelectorAll("[data-section]")) {
    const n = (sub.getAttribute("data-section") ?? "").toLowerCase();
    if (n.includes(lower) || lower.includes(n)) return sub;
  }
  return null;
}

/**
 * Замена подраздела результатом (пере)генерации — порт DOM-механики
 * regenerateSubsection [20384–20444] на строках html_content:
 *  - из сгенерированного HTML берётся <div data-section="…"> (точное имя,
 *    иначе первый data-section, иначе весь HTML как есть — аналог ветки
 *    «модель не обернула в data-section»);
 *  - старый подраздел ищется точно, затем нечётко; найден → замена,
 *    не найден → добавление в конец контейнера (аналог append в
 *    .doc-content).
 * Возвращает обновлённый HTML раздела.
 */
export function spliceSubsectionHtml(
  sectionHtml: string,
  subsectionName: string,
  generatedHtml: string,
): string {
  const root = parseMutable(sectionHtml);
  const gen = parseMutable(generatedHtml);
  const newDiv =
    gen.querySelector(`[data-section="${subsectionName}"]`) ??
    gen.querySelector("[data-section]");
  const newHtml = newDiv ? newDiv.outerHTML : generatedHtml;

  const oldDiv = findMutableSubsection(root, subsectionName);
  if (oldDiv) {
    oldDiv.insertAdjacentHTML("beforebegin", newHtml);
    oldDiv.remove();
  } else {
    root.insertAdjacentHTML("beforeend", newHtml);
  }
  return root.innerHTML;
}

/**
 * Удаление подраздела (обрывочный div при возобновлении: частичный текст
 * короче порога продолжения — порт obrivDiv.remove() из
 * _resumeFromSubsection [25368–25376]).
 */
export function removeSubsectionHtml(
  sectionHtml: string,
  subsectionName: string,
): { html: string; removed: boolean } {
  const root = parseMutable(sectionHtml);
  const div = findMutableSubsection(root, subsectionName);
  if (!div) return { html: sectionHtml, removed: false };
  div.remove();
  return { html: root.innerHTML, removed: true };
}

/* ── Точечная замена таблицы внутри подраздела (беседа 5.1) ──────────── */

/**
 * Локатор таблицы doc-table в HTML раздела. Зеркалит приёмы поиска
 * парсеров (graph-parser 1.4 / element-parser 1.4):
 *  - `subsection` — таблица внутри <div data-section="…"> (точное имя,
 *    затем нечёткое — как findMutableSubsection);
 *  - `firstHeaderIncludes` — первая table.doc-table, чей ПЕРВЫЙ th
 *    содержит подстроку (порт критерия extractGlossaryCompact [8027]).
 * Локаторы перебираются по порядку; первый найденный — рабочий.
 */
export type DocTableLocator =
  | { subsection: string }
  | { firstHeaderIncludes: string };

export interface LocatedDocTable {
  /** Имя подраздела, в котором лежит таблица (null — вне data-section) */
  subsection: string | null;
  /** Заголовки thead (trim), как их отрендерил Claude */
  headers: string[];
}

function tableHeaders(table: MutableElement): string[] {
  return Array.from(table.querySelectorAll("thead th")).map((th) =>
    (th.textContent ?? "")
      .trim()
      .replace(/\s+/g, " "),
  );
}

function locateMutableTable(
  root: MutableElement,
  locators: readonly DocTableLocator[],
): { table: MutableElement | null; host: MutableElement | null; hostName: string | null } {
  for (const loc of locators) {
    if ("subsection" in loc) {
      const host = findMutableSubsection(root, loc.subsection);
      if (!host) continue;
      const table =
        host.querySelector("table.doc-table") ?? host.querySelector("table");
      return {
        table,
        host,
        hostName: host.getAttribute("data-section") ?? loc.subsection,
      };
    }
    const needle = loc.firstHeaderIncludes.toLowerCase();
    for (const t of root.querySelectorAll("table.doc-table")) {
      const ths = tableHeaders(t);
      if (ths.length >= 2 && (ths[0] ?? "").toLowerCase().includes(needle)) {
        const host = t.closest("[data-section]");
        return {
          table: t,
          host,
          hostName: host?.getAttribute("data-section") ?? null,
        };
      }
    }
  }
  return { table: null, host: null, hostName: null };
}

/**
 * Чтение фактических заголовков таблицы раздела — рендерер (5.1)
 * предпочитает их шаблонным, чтобы не переписывать перевод/формулировку,
 * которую дал Claude (lang ≠ Russian, quirk'и заголовков).
 */
export function locateDocTable(
  sectionHtml: string,
  locators: readonly DocTableLocator[],
): LocatedDocTable | null {
  const root = parseMutable(sectionHtml);
  const { table, hostName } = locateMutableTable(root, locators);
  if (!table) return null;
  return { subsection: hostName, headers: tableHeaders(table) };
}

export interface ReplaceDocTableResult {
  html: string;
  /** 'replaced' — таблица найдена и заменена; 'appended' — таблицы не было,
   *  новая добавлена в найденный подраздел; 'created' — не было и
   *  подраздела, создан <div data-section> в конце раздела */
  outcome: "replaced" | "appended" | "created";
}

/**
 * Замена ОДНОЙ таблицы doc-table внутри подраздела (решение 2026-09-02,
 * аудит фаз 5–6, п.1 в суженной форме). В отличие от spliceSubsectionHtml
 * (замена всего <div data-section>) заголовок <h4> и прозаические абзацы
 * подраздела сохраняются: перерисовывается только таблица.
 * `fallbackSubsection` — имя подраздела для ветки 'created'.
 */
export function replaceDocTable(
  sectionHtml: string,
  locators: readonly DocTableLocator[],
  tableHtml: string,
  fallbackSubsection: string,
): ReplaceDocTableResult {
  const root = parseMutable(sectionHtml);
  const { table, host } = locateMutableTable(root, locators);
  if (table) {
    table.insertAdjacentHTML("beforebegin", tableHtml);
    table.remove();
    return { html: root.innerHTML, outcome: "replaced" };
  }
  if (host) {
    host.insertAdjacentHTML("beforeend", tableHtml);
    return { html: root.innerHTML, outcome: "appended" };
  }
  root.insertAdjacentHTML(
    "beforeend",
    `<div data-section="${fallbackSubsection.replace(/"/g, "&quot;")}"><h4>${fallbackSubsection
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")}</h4>${tableHtml}</div>`,
  );
  return { html: root.innerHTML, outcome: "created" };
}

/**
 * Точечная правка прозаического абзаца тезиса (поле вне таблицы, 02 §3
 * п.4): ищется элемент, чей первый <strong>/<b> совпадает с прежней
 * формулировкой (нормализованно, как в buildJustificationIndex
 * element-parser 1.4); его содержимое заменяется на
 * «<strong>формулировка</strong> обоснование». Не найден → null —
 * вызывающий обязан сообщить, что правка в HTML не отражена.
 */
export function replaceThesisParagraph(
  sectionHtml: string,
  oldFormulation: string,
  newFormulation: string,
  justification: string,
): string | null {
  const root = parseMutable(sectionHtml);
  const norm = (s: string): string =>
    s.toLowerCase().replace(/\s+/g, " ").trim();
  const target = norm(oldFormulation);
  if (target.length < 4) return null;
  for (const strong of root.querySelectorAll("strong, b")) {
    const key = norm(strong.textContent ?? "");
    if (!key || !(key === target || key.includes(target) || target.includes(key)))
      continue;
    const parent = strong.parentElement;
    if (!parent || parent === root) continue;
    // Таблицу не трогаем — её рисует рендерер
    if (parent.closest("table")) continue;
    const esc = (s: string): string =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    parent.innerHTML =
      `<strong>${esc(newFormulation)}</strong>` +
      (justification ? " " + esc(justification) : "");
    return root.innerHTML;
  }
  return null;
}
