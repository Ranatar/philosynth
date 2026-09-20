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

/* ── Ручная правка подраздела (беседа 9.2) ───────────────────────────── */

/**
 * ЕДИНИЦА ПРАВКИ — ПОДРАЗДЕЛ: правится СОДЕРЖИМОЕ <div data-section>,
 * а обёртка, атрибут data-section и заголовок <h4> не трогаются — по
 * data-section подраздел находят перегенерация (2.2), планы (2.1), сборка
 * контекста, врезка таблиц (5.1), импорт и экспорт (4.2/4.3).
 *
 * Правится РАЗМЕТКА, не голый текст (решение пользователя, 9.2): в
 * подразделе кроме <p> живут списки, <h5>, врезки callout, таблицы и
 * <strong>формулировка</strong> тезисов (якорь replaceThesisParagraph) —
 * пересборка «абзацы по пустой строке» их стёрла бы. Поэтому сервер не
 * верит присланному: разметка разбирается linkedom'ом и проходит через
 * белый список тегов системного промпта (prompt-templates «system»).
 *
 * Вложенный подраздел (например, «Топологическая таблица» внутри
 * «Топологии графа») в исходник правки НЕ попадает: на его месте стоит
 * комментарий-ссылка SUBSECTION_PLACEHOLDER, при сохранении он меняется
 * обратно на нетронутый оригинал. Иначе заслон табличных подразделов
 * обходился бы правкой внешнего.
 *
 * spliceSubsectionHtml (1.4b) для врезки НЕ годится — заменяет весь
 * <div data-section> вместе с <h4> («По факту 5.1» п.1).
 */

/** Узел linkedom в объёме, нужном правке подраздела. */
interface EditNode {
  readonly nodeType: number;
  textContent: string | null;
  remove(): void;
}

interface EditElement extends EditNode {
  readonly tagName: string;
  readonly childNodes: Iterable<EditNode>;
  readonly children: Iterable<EditElement>;
  readonly parentElement: EditElement | null;
  readonly outerHTML: string;
  innerHTML: string;
  readonly attributes: Iterable<{ name: string; value: string }>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelectorAll(selector: string): Iterable<EditElement>;
  closest(selector: string): EditElement | null;
  replaceWith(...nodes: EditNode[]): void;
  insertAdjacentHTML(
    position: "beforebegin" | "afterbegin" | "beforeend" | "afterend",
    html: string,
  ): void;
}

const COMMENT_NODE = 8;

function parseEditable(html: string): EditElement {
  return parseMutable(html) as unknown as EditElement;
}

/** Точный поиск: правка не должна попасть в «похожий» подраздел. Перебором —
 *  имена содержат кавычки и скобки, селектор с ними хрупок. */
function findExactSubsection(root: EditElement, name: string): EditElement | null {
  for (const el of root.querySelectorAll("[data-section]")) {
    if (el.getAttribute("data-section") === name) return el;
  }
  return null;
}

/** Имена всех data-section раздела в порядке появления (для 404 со списком). */
export function listSubsectionNames(sectionHtml: string): string[] {
  const root = parseEditable(sectionHtml);
  const out: string[] = [];
  for (const el of root.querySelectorAll("[data-section]")) {
    const n = el.getAttribute("data-section");
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Вложенные подразделы первого уровня (ближайший предок-подраздел — host). */
function nestedSubsections(host: EditElement): EditElement[] {
  const out: EditElement[] = [];
  for (const el of host.querySelectorAll("[data-section]")) {
    if (el.parentElement?.closest("[data-section]") === host) out.push(el);
  }
  return out;
}

const PLACEHOLDER_RE = /^\s*подраздел\s+(\d+)\b/;

/** Комментарий-ссылка на вложенный подраздел: номер решает, имя — для глаз. */
export function subsectionPlaceholder(index: number, name: string): string {
  return `<!-- подраздел ${index}: ${name.replace(/--+/g, "—")} — правится отдельно, строку не удалять -->`;
}

/** Таблицы и списки — построчно: одна строка на ряд, иначе в поле правки
 *  таблица выглядит одной лентой. Пробелы между этими тегами незначимы. */
function prettyBlock(html: string): string {
  return html
    .replace(/<(thead|tbody|tfoot)\b/g, "\n<$1")
    .replace(/<\/(thead|tbody|tfoot|table|ul|ol)>/g, "\n</$1>")
    .replace(/<(tr|li)\b/g, "\n  <$1")
    .replace(/\n\s*\n/g, "\n");
}

export interface SubsectionSource {
  /** Имя подраздела (data-section) — как в документе */
  name: string;
  /** Разметка содержимого без обёртки и <h4>, блок на строку */
  html: string;
  /** Имена вложенных подразделов, заменённых комментариями-ссылками */
  nested: string[];
}

/**
 * Исходник правки подраздела. null — подраздела с ТОЧНО таким именем нет.
 */
export function readSubsectionSource(
  sectionHtml: string,
  subsectionName: string,
): SubsectionSource | null {
  const root = parseEditable(sectionHtml);
  const sub = findExactSubsection(root, subsectionName);
  if (!sub) return null;
  const nested = nestedSubsections(sub);
  const names = nested.map((el) => el.getAttribute("data-section") ?? "");
  nested.forEach((el, i) => {
    el.insertAdjacentHTML("beforebegin", subsectionPlaceholder(i + 1, names[i] ?? ""));
    el.remove();
  });
  const lines: string[] = [];
  // Всё ДО заголовка включительно в исходник не идёт — ровно то, что врезка
  // (replaceSubsectionContent) оставляет нетронутым. В документах, заведённых
  // импортом одностраничника, перед <h4> стоит якорь оглавления
  // <a id="subsec-…"> (найдено на живом файле, 9.2): в поле ему делать нечего.
  let hasHeading = false;
  for (const el of sub.children) {
    if (el.tagName.toUpperCase() === "H4") { hasHeading = true; break; }
  }
  let headingSeen = !hasHeading;
  for (const node of sub.childNodes) {
    if (!headingSeen) {
      if (node.nodeType === ELEMENT_NODE && (node as EditElement).tagName.toUpperCase() === "H4")
        headingSeen = true;
      continue;
    }
    if (node.nodeType === ELEMENT_NODE) {
      const el = node as EditElement;
      lines.push(prettyBlock(el.outerHTML.trim()));
    } else if (node.nodeType === COMMENT_NODE) {
      const data = node.textContent ?? "";
      if (PLACEHOLDER_RE.test(data)) lines.push(`<!--${data}-->`);
    } else {
      const t = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      if (t) lines.push(t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    }
  }
  return { name: subsectionName, html: lines.join("\n"), nested: names };
}

/* Белый список — теги раздела «ФОРМАТИРОВАНИЕ» системного промпта плюс их
   безвредная родня (b/i/sup/sub/blockquote/tfoot/caption). */
const ALLOWED_TAGS = new Set([
  "P", "UL", "OL", "LI", "STRONG", "EM", "B", "I", "SUP", "SUB", "BR", "H5",
  "BLOCKQUOTE", "TABLE", "CAPTION", "THEAD", "TBODY", "TFOOT", "TR", "TH",
  "TD", "DIV", "SPAN",
]);
/** Удаляются ВМЕСТЕ с содержимым: текст внутри них — не текст документа. */
const DROPPED_TAGS = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "TEMPLATE",
  "NOSCRIPT", "SVG", "MATH", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT",
  "IMG", "VIDEO", "AUDIO", "CANVAS", "BASE", "HEAD", "TITLE",
]);
const DIV_CLASS_RE = /^callout(?: (?:warning|note|gold))?$/;
const SPAN_CLASS_RE = /^(?:callout-label|risk(?: (?:high|medium|low))?)$/;

export const SUBSECTION_HTML_MAX = 200_000;

export type SubsectionEditProblem =
  | "too_long"
  | "empty"
  | "heading"
  | "anchor"
  | "placeholder";

export class SubsectionHtmlError extends Error {
  constructor(
    public readonly problem: SubsectionEditProblem,
    message: string,
  ) {
    super(message);
    this.name = "SubsectionHtmlError";
  }
}

export interface ReplaceSubsectionResult {
  /** HTML раздела после врезки */
  html: string;
  /** false — присланное совпало с текущим исходником, раздел не тронут */
  changed: boolean;
  /** Что сервер убрал из присланного (теги вне белого списка и т.п.) */
  warnings: string[];
}

/**
 * Лишние закрывающие </div> (и </body>, </html>) — долой ДО разбора: разбор
 * идёт внутри служебной обёртки-div, и непарный </div> закрыл бы ЕЁ — всё,
 * что набрано после него, молча пропало бы (найдено тестом R8 беседы 9.2).
 */
function dropStrayClosers(html: string): string {
  let depth = 0;
  return html
    .replace(/<\/(?:body|html)\s*>/gi, "")
    .replace(/<div\b[^>]*>|<\/div\s*>/gi, (tag) => {
      if (tag[1] !== "/") {
        depth++;
        return tag;
      }
      if (depth === 0) return "";
      depth--;
      return tag;
    });
}

function sanitizeTree(root: EditElement, warnings: string[]): void {
  const unwrapped = new Set<string>();
  const dropped = new Set<string>();
  // Снимок списка: дерево меняется по ходу обхода
  for (const el of Array.from(root.querySelectorAll("*"))) {
    const tag = el.tagName.toUpperCase();
    if (DROPPED_TAGS.has(tag)) {
      dropped.add(tag.toLowerCase());
      el.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      unwrapped.add(tag.toLowerCase());
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      const spanOk = (n === "colspan" || n === "rowspan") &&
        (tag === "TD" || tag === "TH") && /^\d{1,2}$/.test(attr.value.trim());
      if (n === "class" || spanOk) continue;
      el.removeAttribute(attr.name);
    }
    const cls = (el.getAttribute("class") ?? "").trim().replace(/\s+/g, " ");
    if (tag === "TABLE") {
      // Парсеры и экстракторы контекста ищут table.doc-table
      el.setAttribute("class", "doc-table");
    } else if ((tag === "DIV" && DIV_CLASS_RE.test(cls)) || (tag === "SPAN" && SPAN_CLASS_RE.test(cls))) {
      el.setAttribute("class", cls);
    } else if (el.getAttribute("class") !== null) {
      el.removeAttribute("class");
    }
  }
  if (dropped.size)
    warnings.push(`Удалены вместе с содержимым: ${[...dropped].map((t) => `<${t}>`).join(", ")}`);
  if (unwrapped.size)
    warnings.push(`Теги вне набора документа сняты, текст оставлен: ${[...unwrapped].map((t) => `<${t}>`).join(", ")}`);
}

function stripForeignComments(node: EditElement): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === COMMENT_NODE) {
      if (!PLACEHOLDER_RE.test(child.textContent ?? "")) child.remove();
    } else if (child.nodeType === ELEMENT_NODE) {
      stripForeignComments(child as EditElement);
    }
  }
}

/**
 * Врезка правленого содержимого подраздела с сохранением обёртки и <h4>.
 * null — подраздела с точно таким именем нет. Отказы по содержимому —
 * SubsectionHtmlError (роут → 400 VALIDATION_ERROR, details.html).
 */
export function replaceSubsectionContent(
  sectionHtml: string,
  subsectionName: string,
  userHtml: string,
): ReplaceSubsectionResult | null {
  const current = readSubsectionSource(sectionHtml, subsectionName);
  if (!current) return null;
  if (userHtml.length > SUBSECTION_HTML_MAX)
    throw new SubsectionHtmlError("too_long", `Не длиннее ${SUBSECTION_HTML_MAX} знаков`);
  const norm = (s: string): string => s.replace(/\r\n?/g, "\n").trim();
  if (norm(userHtml) === norm(current.html))
    return { html: sectionHtml, changed: false, warnings: [] };

  const draft = parseEditable(dropStrayClosers(userHtml));
  // Заголовок и якорь подраздела правке не подлежат — отказ, а не тихая чистка:
  // человек должен узнать, что его <h4> в документ не попал
  for (const el of draft.querySelectorAll("h1, h2, h3, h4")) {
    throw new SubsectionHtmlError(
      "heading",
      `<${el.tagName.toLowerCase()}> здесь нельзя: <h4> — заголовок подраздела, он не правится; внутренние подзаголовки — <h5>`,
    );
  }
  for (const _ of draft.querySelectorAll("[data-section]")) {
    throw new SubsectionHtmlError(
      "anchor",
      "Атрибут data-section здесь нельзя: по нему служба находит подразделы, заводить и переименовывать их правкой нельзя",
    );
  }
  const warnings: string[] = [];
  sanitizeTree(draft, warnings);
  stripForeignComments(draft);

  const hasText = (draft.textContent ?? "").replace(/\s+/g, "").length > 0;
  // Текст ВНЕ тегов верхнего уровня — в абзацы по пустой строке: человек,
  // не знающий HTML, просто набирает текст, и голый текстовый узел остался
  // бы без оформления абзаца. Внутри блоков текст не трогается.
  const esc = (t: string): string =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blocks: string[] = [];
  // Соседние текстовые узлы склеиваются ДО деления на абзацы: разбор режет
  // текст на узлы по одиночному «<» («a < b» — два узла, а абзац один)
  let loose = "";
  const flushLoose = (): void => {
    for (const para of loose.split(/\n\s*\n/)) {
      const t = para.replace(/\s+/g, " ").trim();
      if (t) blocks.push(`<p>${esc(t)}</p>`);
    }
    loose = "";
  };
  for (const node of draft.childNodes) {
    if (node.nodeType === ELEMENT_NODE) {
      flushLoose();
      blocks.push((node as EditElement).outerHTML);
    } else if (node.nodeType === COMMENT_NODE) {
      flushLoose();
      blocks.push(`<!--${node.textContent ?? ""}-->`);
    } else loose += node.textContent ?? "";
  }
  flushLoose();
  let body = blocks.join("\n");
  if (!hasText && !/<table\b/i.test(body) && current.nested.length === 0)
    throw new SubsectionHtmlError("empty", "Подраздел не может быть пустым");

  // Вложенные подразделы — обратно на места своих комментариев-ссылок
  const root = parseEditable(sectionHtml);
  const sub = findExactSubsection(root, subsectionName);
  if (!sub) return null;
  const originals = nestedSubsections(sub).map((el) => el.outerHTML);
  const seen = new Set<number>();
  let bad: string | null = null;
  body = body.replace(/<!--([\s\S]*?)-->/g, (whole, data: string) => {
    const m = PLACEHOLDER_RE.exec(data);
    if (!m) return "";
    const idx = Number(m[1]);
    const original = originals[idx - 1];
    if (original === undefined) bad = `строка-ссылка «подраздел ${idx}» не из этого подраздела`;
    else if (seen.has(idx)) bad = `строка-ссылка «подраздел ${idx}» повторена`;
    seen.add(idx);
    return original ?? whole;
  });
  if (!bad && seen.size !== originals.length) {
    const lost = current.nested.filter((_, i) => !seen.has(i + 1));
    bad = `пропала строка-ссылка на вложенный подраздел: ${lost.map((n) => `«${n}»`).join(", ")} — верните её на место`;
  }
  if (bad) throw new SubsectionHtmlError("placeholder", bad);

  // Всё после заголовка — долой; нет <h4> — содержимое заменяется целиком
  let headingSeen = false;
  let hasHeading = false;
  for (const el of sub.children) {
    if (el.tagName.toUpperCase() === "H4") { hasHeading = true; break; }
  }
  for (const node of Array.from(sub.childNodes)) {
    if (hasHeading && !headingSeen) {
      if (node.nodeType === ELEMENT_NODE && (node as EditElement).tagName.toUpperCase() === "H4")
        headingSeen = true;
      continue; // всё до заголовка включительно остаётся как было
    }
    node.remove();
  }
  sub.insertAdjacentHTML("beforeend", body);
  return { html: root.innerHTML, changed: true, warnings };
}

/**
 * Куда ПОПАЛ локатор таблицы (беседа 9.2, вычисляемый заслон): имя
 * подраздела, в который рендерер 5.1 врежет таблицу — заменой
 * ('replaced') ИЛИ дописыванием в найденный подраздел без таблицы
 * ('appended'). locateDocTable для этого не годится: без таблицы она
 * отвечает null, а рендерер в этот подраздел всё равно пишет. null —
 * таблица вне data-section либо локатор никуда не попал (ветка 'created').
 */
export function locateDocTableHost(
  sectionHtml: string,
  locators: readonly DocTableLocator[],
): string | null {
  const root = parseMutable(sectionHtml);
  return locateMutableTable(root, locators).hostName;
}
