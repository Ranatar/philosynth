/**
 * Полнотекстовая правка подраздела (беседа 13.1, Д-64) — приборы над DOM.
 *
 * ДВИЖОК — собственный contenteditable поверх общего модуля разметки
 * (`@philosynth/shared/constants/doc-markup`), а не ProseMirror/TipTap.
 * Довод (п.6 беседы, критерии размер/вставка/таблицы/отмена):
 *  - набор конструкций закрыт и мал — тринадцать кнопок по разделу
 *    «ФОРМАТИРОВАНИЕ»; схема ProseMirror повторила бы этот же список вторым
 *    описанием, которое пришлось бы держать в согласии со сторожем;
 *  - правка идёт НА МЕСТЕ подраздела, в типографике документа: редактор —
 *    часть той же строки HTML раздела, что и документ (приём 1.6b/9.2), а
 *    редактор-библиотека потребовал бы своего корня, стилей и портала в DOM,
 *    которым владеет dangerouslySetInnerHTML (React 19 переписывает innerHTML
 *    при смене ссылки { __html } — 09 §6);
 *  - вставка из буфера проходит через ТОТ ЖЕ санитайзер, что и сервер
 *    (`sanitizeDocMarkup`, одно ядро на клиент и сервер) — человек видит ровно
 *    то, что сохранится; сервер чистит повторно и клиенту не доверяет;
 *  - размер сборки: ноль новых зависимостей (TipTap с таблицами — ~300 КБ);
 *  - отмена: набор текста и команды через document.execCommand (жирный,
 *    курсив, списки, абзац/подзаголовок, вставка) идут в родной стек отмены
 *    браузера (Ctrl+Z); перестройки таблиц (строки/столбцы), выноски и метки
 *    риска — прямые правки DOM, родной стек их не знает. Это слабое место
 *    выбранного движка, названное честно; запасной режим «Разметка» — то же
 *    поле 9.2, на всю ширину и с переносом (Д-64 п. вёрстки).
 *
 * Функции здесь не знают о React: SectionView зовёт их из делегированных
 * обработчиков (клик по кнопке панели, вставка, клавиши), а разметку формы
 * строит renderSubsectionEditor в той же строке HTML. Единственное
 * состояние — DOM редактируемого блока; состояние React (SubsectionEditState)
 * хранит режим и ЧЕРНОВИК В ВИДЕ РАЗМЕТКИ (как её отдаёт и принимает сервер,
 * со строками-местами вложенных подразделов комментариями).
 *
 * Строки-места вложенных подразделов (п.9): в редакторе — плашки
 * `.rich-placeholder` с contenteditable="false" и видимым заголовком;
 * удалить или переставить их нельзя (Backspace/Delete/вырезание рядом
 * гасятся — isPlaceholderDeletion); при сборке разметки плашка возвращается
 * комментарием ДОСЛОВНО (текст комментария хранится в data-атрибуте).
 * Сервер и так отвергает правку с пропавшей строкой (400 'placeholder') —
 * это второй рубеж.
 */
import {
  CALLOUT_CLASSES,
  EDITOR_TOOLS,
  SPAN_CLASSES,
  TABLE_CLASS,
  type EditorToolId,
} from "@philosynth/shared/constants/doc-markup";
import {
  sanitizeDocMarkup,
  type SanitizableElement,
} from "@philosynth/shared/utils/doc-markup-sanitize";
import { tl } from "@philosynth/shared/i18n/t";

/** Селекторы редактора — одни на SectionView, харнессы и этот модуль. */
export const EDITOR_BODY_SELECTOR = "[data-subsection-editor-body]";
export const PLACEHOLDER_CLASS = "rich-placeholder";
export const PLACEHOLDER_SELECTOR = `.${PLACEHOLDER_CLASS}`;

/** Регулярка строки-места — та же, что у сервера (html-parser PLACEHOLDER_RE). */
const PLACEHOLDER_RE = /^\s*подраздел\s+(\d+)\b/;
const PLACEHOLDER_NAME_RE = /^\s*подраздел\s+\d+\s*:\s*(.*?)\s*(?:—\s*правится отдельно.*)?$/s;

export type TableOp = "row-add" | "row-del" | "col-add" | "col-del";
export const TABLE_OPS: readonly TableOp[] = ["row-add", "row-del", "col-add", "col-del"];

const BLOCK_TAGS = new Set(["P", "H5", "UL", "OL", "TABLE", "DIV"]);

/* ── Плашки вложенных подразделов ─────────────────────────────────────── */

export function isPlaceholder(el: Element | null | undefined): boolean {
  return !!el && el.classList.contains(PLACEHOLDER_CLASS);
}

/** Плашка из текста комментария-ссылки сервера (создаётся в переданном документе). */
export function placeholderFromComment(doc: Document, commentText: string): HTMLElement | null {
  const m = PLACEHOLDER_RE.exec(commentText);
  if (!m) return null;
  const name = PLACEHOLDER_NAME_RE.exec(commentText)?.[1] ?? "";
  const el = doc.createElement("div");
  el.className = PLACEHOLDER_CLASS;
  el.setAttribute("contenteditable", "false");
  el.setAttribute("draggable", "false");
  el.setAttribute("data-placeholder", m[1] ?? "");
  el.setAttribute("data-placeholder-src", commentText);
  el.setAttribute("title", tl("utils.richEditor.placeholderTitle", "Вложенный подраздел правится отдельно; плашку нельзя удалить или переставить"));
  el.textContent = tl("utils.richEditor.placeholderText", "▣ Вложенный подраздел «{name}» — правится отдельно", { name });
  return el;
}

/** Все комментарии-ссылки под корнем → плашки (чужие комментарии снимаются). */
export function commentsToPlaceholders(doc: Document, root: Element): void {
  const walker = doc.createTreeWalker(root, 128 /* NodeFilter.SHOW_COMMENT */);
  const comments: Comment[] = [];
  let n = walker.nextNode();
  while (n) {
    comments.push(n as Comment);
    n = walker.nextNode();
  }
  for (const c of comments) {
    const plaque = placeholderFromComment(doc, c.data);
    if (plaque) c.replaceWith(plaque);
    else c.remove();
  }
}

/** Плашки → комментарии дословно (в клоне, перед отправкой на сервер). */
export function placeholdersToComments(doc: Document, root: Element): void {
  for (const el of Array.from(root.querySelectorAll(PLACEHOLDER_SELECTOR))) {
    const src = el.getAttribute("data-placeholder-src") ?? "";
    el.replaceWith(doc.createComment(src));
  }
}

/* ── Чистка и сборка разметки ─────────────────────────────────────────── */

/** Общее ядро на дереве браузера; плашки защищены. */
export function sanitizeEditable(root: Element): void {
  sanitizeDocMarkup(root as unknown as SanitizableElement, {
    mode: "subsection",
    protect: (el) => isPlaceholder(el as unknown as Element),
  });
}

/** Пустые абзацы (служебные <br> contenteditable, пробелы) — долой; внутри таблиц не трогаем. */
function dropEmptyParagraphs(root: Element): void {
  for (const p of Array.from(root.querySelectorAll("p"))) {
    if (p.closest("table, li")) continue;
    if ((p.textContent ?? "").replace(/\s|\u00a0/g, "") === "" && !p.querySelector("span.risk")) p.remove();
  }
}

/**
 * Следы contenteditable → разметка документа: текст и строчные узлы на
 * верхнем уровне (набор после таблицы, Enter в конце) — в <p>; <div> без
 * класса (Chrome ставит его вместо абзаца, обёртка буфера) — в <p>;
 * <br> в конце блока — долой; ячейки, где только служебный nbsp, — пустые.
 */
export function normalizeBlocks(root: Element): void {
  const doc = root.ownerDocument;
  // <div> без класса → <p> (вложенные div без класса тоже)
  for (const div of Array.from(root.querySelectorAll("div"))) {
    if (div.getAttribute("class")) continue;
    if (div.closest("table")) { div.replaceWith(...Array.from(div.childNodes)); continue; }
    const p = doc.createElement("p");
    while (div.firstChild) p.appendChild(div.firstChild);
    div.replaceWith(p);
  }
  // <p> с блочными детьми (insertUnorderedList в абзаце даёт <p><ul>…</ul></p>;
  // HTML так не разбирается — сервер закрыл бы <p> раньше): блоки наружу,
  // строчные куски — своими <p>
  for (const p of Array.from(root.querySelectorAll("p"))) {
    const kids = Array.from(p.childNodes);
    if (!kids.some((k) => k.nodeType === 1 && BLOCK_TAGS.has((k as Element).tagName))) continue;
    let inline: Node[] = [];
    const out: Node[] = [];
    const flushInline = (): void => {
      if (!inline.length) return;
      if (inline.map((n) => n.textContent ?? "").join("").replace(/\s|\u00a0/g, "") !== "") {
        const np = doc.createElement("p");
        for (const n of inline) np.appendChild(n);
        out.push(np);
      }
      inline = [];
    };
    for (const k of kids) {
      if (k.nodeType === 1 && BLOCK_TAGS.has((k as Element).tagName)) { flushInline(); out.push(k); }
      else inline.push(k);
    }
    flushInline();
    p.replaceWith(...out);
  }
  // строчные пробеги верхнего уровня → <p>
  let run: Node[] = [];
  const flush = (): void => {
    if (!run.length) return;
    const text = run.map((n) => n.textContent ?? "").join("");
    const first = run[0]!;
    if (text.replace(/\s|\u00a0/g, "") === "") {
      for (const n of run) n.parentNode?.removeChild(n);
    } else {
      const p = doc.createElement("p");
      first.parentNode?.insertBefore(p, first);
      for (const n of run) p.appendChild(n);
    }
    run = [];
  };
  for (const node of Array.from(root.childNodes)) {
    const isBlock = node.nodeType === 1 && (BLOCK_TAGS.has((node as Element).tagName) || isPlaceholder(node as Element));
    if (isBlock) flush();
    else run.push(node);
  }
  flush();
  // хвостовые <br> в блоках; nbsp-заглушки ячеек
  for (const br of Array.from(root.querySelectorAll("br"))) {
    if (!br.nextSibling || (br.nextSibling.nodeType === 3 && (br.nextSibling.textContent ?? "").trim() === "" && !br.nextSibling.nextSibling)) br.remove();
  }
  for (const cell of Array.from(root.querySelectorAll("td, th"))) {
    if ((cell.textContent ?? "").replace(/\u00a0/g, "").trim() === "" && !cell.querySelector("*")) cell.textContent = "";
    else if (cell.lastChild?.nodeType === 3) cell.lastChild.textContent = (cell.lastChild.textContent ?? "").replace(/[\s\u00a0]+$/, "");
  }
  // пустые строчные узлы (след отложенного стиля execCommand) — долой
  for (const el of Array.from(root.querySelectorAll("strong, em, span"))) {
    if (!el.firstChild && !el.classList.contains("risk")) el.remove();
  }
  // nbsp contenteditable (хвостовые пробелы набора) → обычные пробелы
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  let t = walker.nextNode();
  while (t) {
    if (t.textContent && t.textContent.includes("\u00a0")) t.textContent = t.textContent.replace(/\u00a0/g, " ");
    t = walker.nextNode();
  }
}

/**
 * Разметка подраздела из текущего состояния редактора — то, что уйдёт в
 * PATCH { html } (сборка в КЛОНЕ: сам редактор не трогается).
 */
export function readEditorHtml(editable: Element): string {
  const doc = editable.ownerDocument;
  const clone = editable.cloneNode(true) as Element;
  sanitizeEditable(clone);
  normalizeBlocks(clone);
  dropEmptyParagraphs(clone);
  placeholdersToComments(doc, clone);
  return prettyMarkup(clone.innerHTML);
}

/**
 * Разметка (с комментариями-ссылками) → содержимое редактора: комментарии —
 * плашками, остальное — через санитайзер (человек сразу видит, что
 * сохранится). Чистый текст без тегов — абзацами по пустой строке.
 */
export function fillEditable(doc: Document, editable: Element, draftHtml: string): void {
  editable.innerHTML = looksLikeMarkup(draftHtml) ? draftHtml : plainTextToParagraphs(draftHtml);
  commentsToPlaceholders(doc, editable);
  sanitizeEditable(editable);
  if (!editable.firstChild) editable.appendChild(doc.createElement("p"));
}

function looksLikeMarkup(s: string): boolean {
  return /<[a-z!][^>]*>/i.test(s);
}

function escText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function plainTextToParagraphs(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((p) => `<p>${escText(p)}</p>`)
    .join("\n");
}

const BLOCK_TAG_RE = "p|h5|ul|ol|li|table|thead|tbody|tfoot|tr|th|td|div";

/** Таблицы и списки — построчно, блок на строку (двойник prettyBlock сервера).
 *  Пробелы снимаются ТОЛЬКО рядом с блочными тегами: «</strong> <em>» цел. */
export function prettyMarkup(html: string): string {
  return html
    .replace(new RegExp(`(<\\/?(?:${BLOCK_TAG_RE})\\b[^>]*>)\\s+(?=<)`, "g"), "$1")
    .replace(new RegExp(`>\\s+(?=<\\/?(?:${BLOCK_TAG_RE})\\b)`, "g"), ">")
    .replace(/>\s+(?=<!--)/g, ">")
    .replace(/(-->)\s+(?=<)/g, "$1")
    .replace(/<(p|h5|ul|ol|table|div|!--)/g, "\n<$1")
    .replace(/<(thead|tbody|tfoot)\b/g, "\n<$1")
    .replace(/<\/(thead|tbody|tfoot|table|ul|ol)>/g, "\n</$1>")
    .replace(/<(tr|li)\b/g, "\n  <$1")
    .replace(/\n\s*\n/g, "\n")
    .trim();
}

/* ── Выбор и блоки ────────────────────────────────────────────────────── */

function selectionIn(editable: Element): Selection | null {
  const sel = editable.ownerDocument.defaultView?.getSelection() ?? null;
  if (!sel || sel.rangeCount === 0) return null;
  const anchor = sel.anchorNode;
  if (!anchor || !editable.contains(anchor)) return null;
  return sel;
}

/** Каретку — в конец редактора (кнопка нажата при фокусе вне поля). */
function focusEnd(editable: Element): Selection | null {
  const doc = editable.ownerDocument;
  (editable as HTMLElement).focus();
  const sel = doc.defaultView?.getSelection() ?? null;
  if (!sel) return null;
  const range = doc.createRange();
  range.selectNodeContents(editable);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  return sel;
}

/** Блок верхнего уровня редактора, содержащий узел. */
export function topBlockOf(editable: Element, node: Node | null): Element | null {
  let el: Node | null = node;
  while (el && el.parentNode !== editable) el = el.parentNode;
  return el && el.nodeType === 1 ? (el as Element) : null;
}

function currentTopBlock(editable: Element, sel: Selection): Element | null {
  return topBlockOf(editable, sel.anchorNode);
}

function placeCaret(editable: Element, node: Node, atEnd = true): void {
  const doc = editable.ownerDocument;
  const sel = doc.defaultView?.getSelection();
  if (!sel) return;
  const range = doc.createRange();
  range.selectNodeContents(node);
  range.collapse(!atEnd);
  sel.removeAllRanges();
  sel.addRange(range);
}

/* ── Команды панели ───────────────────────────────────────────────────── */

const exec = (doc: Document, cmd: string, value?: string): boolean => {
  try {
    return doc.execCommand(cmd, false, value);
  } catch {
    return false;
  }
};

const toolById = (id: EditorToolId) => EDITOR_TOOLS.find((t) => t.id === id);

/** Метка риска — текст по виду (документ пишется словами; человек поправит). */
function riskLabel(id: EditorToolId): string {
  switch (id) {
    case "risk-high": return tl("utils.richEditor.riskHigh", "ВЫСОКИЙ");
    case "risk-medium": return tl("utils.richEditor.riskMedium", "СРЕДНИЙ");
    default: return tl("utils.richEditor.riskLow", "НИЗКИЙ");
  }
}

function calloutLabel(id: EditorToolId): string {
  switch (id) {
    case "callout-warning": return tl("utils.richEditor.calloutWarning", "ПРЕДУПРЕЖДЕНИЕ");
    case "callout-note": return tl("utils.richEditor.calloutNote", "ПРИМЕЧАНИЕ");
    default: return tl("utils.richEditor.calloutGold", "РЕКОМЕНДАЦИЯ");
  }
}

/**
 * Применить кнопку панели к текущему выделению. Возвращает false, когда
 * команда неприменима (нет блока, каретка в плашке). После команды дерево
 * нормализуется общим ядром (execCommand даёт <b>/<i>/style — они становятся
 * strong/em без атрибутов).
 */
export function applyTool(editable: Element, id: EditorToolId): boolean {
  const doc = editable.ownerDocument;
  const tool = toolById(id);
  if (!tool) return false;
  const sel = selectionIn(editable) ?? focusEnd(editable);
  if (!sel) return false;
  const anchorEl = sel.anchorNode?.nodeType === 1 ? (sel.anchorNode as Element) : sel.anchorNode?.parentElement ?? null;
  if (anchorEl?.closest(PLACEHOLDER_SELECTOR)) return false;
  exec(doc, "defaultParagraphSeparator", "p");
  exec(doc, "styleWithCSS", "false"); // <b>/<i>, не <span style>: ядро переименует их при сборке

  let ok = true;
  switch (id) {
    case "p":
      ok = exec(doc, "formatBlock", "p");
      break;
    case "h5":
      ok = exec(doc, "formatBlock", "h5");
      break;
    case "strong":
      ok = exec(doc, "bold");
      break;
    case "em":
      ok = exec(doc, "italic");
      break;
    case "ul":
      ok = exec(doc, "insertUnorderedList");
      break;
    case "ol":
      ok = exec(doc, "insertOrderedList");
      break;
    case "table":
      ok = insertTable(editable, sel);
      break;
    case "callout-warning":
    case "callout-note":
    case "callout-gold":
      ok = toggleCallout(editable, sel, tool.className ?? "", calloutLabel(id));
      break;
    case "risk-high":
    case "risk-medium":
    case "risk-low":
      ok = toggleRisk(editable, sel, tool.className ?? "", riskLabel(id));
      break;
  }
  // Живое дерево после команды НЕ чистится: замена узла (<b> → <strong>)
  // под кареткой сбивает выделение — Chrome переносил набор в конец блока.
  // Следы execCommand снимает ядро при сборке (readEditorHtml на клоне).
  return ok;
}

function insertTable(editable: Element, sel: Selection): boolean {
  const doc = editable.ownerDocument;
  const block = currentTopBlock(editable, sel);
  const table = doc.createElement("table");
  table.className = TABLE_CLASS;
  const th1 = tl("utils.richEditor.tableHeader", "Столбец {n}", { n: 1 });
  const th2 = tl("utils.richEditor.tableHeader", "Столбец {n}", { n: 2 });
  table.innerHTML =
    `<thead><tr><th>${escText(th1)}</th><th>${escText(th2)}</th></tr></thead>` +
    `<tbody><tr><td> </td><td> </td></tr><tr><td> </td><td> </td></tr></tbody>`;
  if (block) {
    const empty = block.tagName === "P" && (block.textContent ?? "").trim() === "";
    if (empty) block.replaceWith(table);
    else block.after(table);
  } else editable.appendChild(table);
  const after = doc.createElement("p");
  after.appendChild(doc.createElement("br"));
  table.after(after);
  const firstCell = table.querySelector("td");
  if (firstCell) placeCaret(editable, firstCell, false);
  return true;
}

function toggleCallout(editable: Element, sel: Selection, cls: string, label: string): boolean {
  const doc = editable.ownerDocument;
  const block = currentTopBlock(editable, sel);
  if (!block) return false;
  if (block.tagName === "DIV" && CALLOUT_CLASSES.includes(block.className.trim().replace(/\s+/g, " "))) {
    if (block.className.trim().replace(/\s+/g, " ") === cls) {
      // та же выноска — снять: метка долой, содержимое — абзацем
      const p = doc.createElement("p");
      for (const child of Array.from(block.childNodes)) {
        if (child.nodeType === 1 && (child as Element).classList.contains("callout-label")) continue;
        p.appendChild(child);
      }
      block.replaceWith(p);
      placeCaret(editable, p);
    } else {
      block.className = cls;
    }
    return true;
  }
  const callout = doc.createElement("div");
  callout.className = cls;
  const lab = doc.createElement("span");
  lab.className = "callout-label";
  lab.textContent = label;
  callout.appendChild(lab);
  if (block.tagName === "P") {
    for (const child of Array.from(block.childNodes)) callout.appendChild(child);
    block.replaceWith(callout);
  } else {
    // список, таблица, подзаголовок — целиком внутрь выноски
    block.replaceWith(callout);
    callout.appendChild(block);
  }
  placeCaret(editable, callout);
  return true;
}

function toggleRisk(editable: Element, sel: Selection, cls: string, label: string): boolean {
  const doc = editable.ownerDocument;
  const anchorEl = sel.anchorNode?.nodeType === 1 ? (sel.anchorNode as Element) : sel.anchorNode?.parentElement ?? null;
  const existing = anchorEl?.closest("span.risk");
  if (existing && editable.contains(existing)) {
    const cur = existing.className.trim().replace(/\s+/g, " ");
    if (cur === cls) existing.replaceWith(...Array.from(existing.childNodes));
    else existing.className = cls;
    return true;
  }
  if (!SPAN_CLASSES.includes(cls)) return false;
  const range = sel.getRangeAt(0);
  const span = doc.createElement("span");
  span.className = cls;
  const selected = range.toString().trim();
  if (selected && range.startContainer === range.endContainer) {
    span.textContent = selected;
    range.deleteContents();
  } else {
    if (!range.collapsed) range.collapse(false);
    span.textContent = label;
  }
  range.insertNode(span);
  // пробел после метки, чтобы набор продолжился вне неё
  const tail = doc.createTextNode(" ");
  span.after(tail);
  placeCaret(editable, tail);
  return true;
}

/* ── Таблицы: строки и столбцы ────────────────────────────────────────── */

function currentCell(editable: Element): HTMLTableCellElement | null {
  const sel = selectionIn(editable);
  const node = sel?.anchorNode ?? null;
  const el = node?.nodeType === 1 ? (node as Element) : node?.parentElement ?? null;
  const cell = el?.closest("td, th") as HTMLTableCellElement | null;
  return cell && editable.contains(cell) ? cell : null;
}

/** Операция над таблицей, в ячейке которой стоит каретка; false — каретка вне таблицы. */
export function applyTableOp(editable: Element, op: TableOp): boolean {
  const doc = editable.ownerDocument;
  const cell = currentCell(editable);
  if (!cell) return false;
  const row = cell.parentElement as HTMLTableRowElement | null;
  const table = cell.closest("table") as HTMLTableElement | null;
  if (!row || !table) return false;
  const colIdx = Array.from(row.children).indexOf(cell);
  const allRows = Array.from(table.querySelectorAll("tr"));
  switch (op) {
    case "row-add": {
      const fresh = doc.createElement("tr");
      const width = row.children.length;
      for (let i = 0; i < width; i++) {
        const td = doc.createElement("td");
        td.textContent = " ";
        fresh.appendChild(td);
      }
      // после строки заголовков новая строка идёт первой в tbody
      if (cell.tagName === "TH") {
        const tbody = table.querySelector("tbody") ?? table.appendChild(doc.createElement("tbody"));
        tbody.insertBefore(fresh, tbody.firstChild);
      } else row.after(fresh);
      const first = fresh.querySelector("td");
      if (first) placeCaret(editable, first, false);
      return true;
    }
    case "row-del": {
      if (cell.tagName === "TH") return false; // заголовки не удаляются построчно
      const bodyRows = allRows.filter((r) => !r.querySelector("th"));
      if (bodyRows.length <= 1) return false; // последнюю строку тела не убираем — таблицу удаляют целиком
      const next = (row.nextElementSibling ?? row.previousElementSibling) as Element | null;
      row.remove();
      const target = next?.querySelector("td, th");
      if (target) placeCaret(editable, target, false);
      return true;
    }
    case "col-add": {
      for (const r of allRows) {
        const ref = r.children[colIdx] ?? null;
        const fresh = doc.createElement(ref?.tagName === "TH" ? "th" : (r.querySelector("th") && !r.querySelector("td")) ? "th" : "td");
        fresh.textContent = " ";
        if (ref) ref.after(fresh);
        else r.appendChild(fresh);
      }
      const target = row.children[colIdx + 1] ?? null;
      if (target) placeCaret(editable, target, false);
      return true;
    }
    case "col-del": {
      if (row.children.length <= 1) return false;
      for (const r of allRows) r.children[colIdx]?.remove();
      const target = row.children[Math.min(colIdx, row.children.length - 1)] ?? null;
      if (target) placeCaret(editable, target, false);
      return true;
    }
  }
  return false;
}

/** Перед Enter: абзацы, не <div> (Chrome без этого ставит <div>). */
export function prepareParagraphs(editable: Element): void {
  const doc = editable.ownerDocument;
  exec(doc, "defaultParagraphSeparator", "p");
  exec(doc, "styleWithCSS", "false");
}

/**
 * Enter с кареткой В КОНЦЕ блока верхнего уровня (абзац, подзаголовок,
 * выноска) — новый ЧИСТЫЙ абзац после блока. Родной Enter здесь плох дважды
 * (найдено харнессом 13.1): выноску Chrome раздваивает (второй div с тем же
 * классом, без метки), а жирный/курсив у края блока тянется в новый абзац
 * (<p><strong>…</strong></p>, список внутри <strong>). Enter посреди блока,
 * в списках и таблицах — родной. Возвращает true, когда Enter обработан.
 */
export function enterAtBlockEnd(editable: Element): boolean {
  const sel = selectionIn(editable);
  if (!sel || !sel.isCollapsed) return false;
  const doc = editable.ownerDocument;
  const range = sel.getRangeAt(0);
  let block: Element | null;
  if (range.startContainer === editable) {
    // каретка между блоками корня (selectNodeContents + collapse): блок — перед ней
    const prev = editable.childNodes[range.startOffset - 1] ?? null;
    block = prev && prev.nodeType === 1 ? (prev as Element) : null;
  } else {
    block = currentTopBlock(editable, sel);
    if (block) {
      const tail = doc.createRange();
      tail.setStart(range.endContainer, range.endOffset);
      tail.setEndAfter(block.lastChild ?? block);
      if (tail.toString().replace(/\u00a0/g, " ").trim() !== "") return false; // не в конце
    }
  }
  if (!block || !["P", "H5", "DIV"].includes(block.tagName) || isPlaceholder(block)) return false;
  const p = doc.createElement("p");
  p.appendChild(doc.createElement("br"));
  block.after(p);
  placeCaret(editable, p, false);
  return true;
}

/* ── Защита плашек от удаления ────────────────────────────────────────── */

/**
 * Удалит ли удаление (Backspace/Delete/вырезание) плашку: выделение
 * пересекает плашку, либо каретка стоит у края блока, соседствующего с ней.
 */
export function isPlaceholderDeletion(editable: Element, key: "Backspace" | "Delete" | "selection"): boolean {
  const sel = selectionIn(editable);
  if (!sel) return false;
  const range = sel.getRangeAt(0);
  for (const plaque of Array.from(editable.querySelectorAll(PLACEHOLDER_SELECTOR))) {
    if (range.intersectsNode(plaque)) return true;
  }
  if (!range.collapsed || key === "selection") return false;
  const block = currentTopBlock(editable, sel);
  if (!block) return false;
  const doc = editable.ownerDocument;
  const probe = doc.createRange();
  if (key === "Backspace") {
    probe.setStart(block, 0);
    probe.setEnd(range.startContainer, range.startOffset);
    if (probe.toString().length === 0) return isPlaceholder(block.previousElementSibling);
  } else {
    probe.setStart(range.endContainer, range.endOffset);
    probe.setEndAfter(block.lastChild ?? block);
    if (probe.toString().length === 0) return isPlaceholder(block.nextElementSibling);
  }
  return false;
}

/* ── Вставка из буфера ────────────────────────────────────────────────── */

/** Разметка буфера → чистая разметка подраздела (ядро 13.1), текст → абзацы. */
export function sanitizePasted(doc: Document, html: string | null, text: string): string {
  if (html && html.trim()) {
    const parsed = new DOMParser().parseFromString(`<div id="__paste">${html}</div>`, "text/html");
    const root = parsed.getElementById("__paste");
    if (root) {
      sanitizeEditable(root);
      // Word/браузер оборачивают всё в чужие блоки — после снятия тегов
      // остаются голый текст и <div> без класса: normalizeBlocks уложит их в <p>
      normalizeBlocks(root);
      const out = root.innerHTML.trim();
      // один абзац — строчно, в место каретки (не рвать абзац человека)
      const single = /^<p>([\s\S]*)<\/p>$/.exec(out);
      if (single && !/<\/p>/.test(single[1] ?? "")) return single[1] ?? "";
      if (out) return out;
    }
  }
  const t = text.replace(/\r\n?/g, "\n").trim();
  if (!t) return "";
  if (!/\n\s*\n/.test(t)) return escText(t.replace(/\s+/g, " "));
  return plainTextToParagraphs(t);
}

/** Вставить чистую разметку в место каретки (через родной стек отмены). */
export function insertPasted(editable: Element, cleanHtml: string): void {
  if (!cleanHtml) return;
  const doc = editable.ownerDocument;
  if (!selectionIn(editable)) focusEnd(editable);
  if (!exec(doc, "insertHTML", cleanHtml)) {
    const sel = selectionIn(editable);
    if (!sel) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const tpl = doc.createElement("template");
    tpl.innerHTML = cleanHtml;
    range.insertNode(tpl.content);
  }
}

/* ── Подписи панели ───────────────────────────────────────────────────── */

export interface ToolLabel {
  /** Текст на кнопке (коротко) */
  text: string;
  /** Подсказка title */
  hint: string;
}

/** Подписи кнопок панели — по EDITOR_TOOLS, вызывается при построении формы. */
export function toolLabel(id: EditorToolId): ToolLabel {
  switch (id) {
    case "p": return { text: tl("utils.richEditor.toolP", "¶"), hint: tl("utils.richEditor.toolPHint", "Абзац <p>") };
    case "h5": return { text: tl("utils.richEditor.toolH5", "H5"), hint: tl("utils.richEditor.toolH5Hint", "Подзаголовок <h5>") };
    case "strong": return { text: tl("utils.richEditor.toolStrong", "Ж"), hint: tl("utils.richEditor.toolStrongHint", "Выделение <strong> (Ctrl+B)") };
    case "em": return { text: tl("utils.richEditor.toolEm", "К"), hint: tl("utils.richEditor.toolEmHint", "Курсив <em> (Ctrl+I)") };
    case "ul": return { text: tl("utils.richEditor.toolUl", "• список"), hint: tl("utils.richEditor.toolUlHint", "Маркированный список <ul>") };
    case "ol": return { text: tl("utils.richEditor.toolOl", "1. список"), hint: tl("utils.richEditor.toolOlHint", "Нумерованный список <ol>") };
    case "table": return { text: tl("utils.richEditor.toolTable", "Таблица"), hint: tl("utils.richEditor.toolTableHint", "Вставить таблицу 2×2 <table class=\"doc-table\">") };
    case "callout-warning": return { text: tl("utils.richEditor.toolCalloutWarning", "Предупреждение"), hint: tl("utils.richEditor.toolCalloutWarningHint", "Выноска callout warning (повторное нажатие снимает)") };
    case "callout-note": return { text: tl("utils.richEditor.toolCalloutNote", "Примечание"), hint: tl("utils.richEditor.toolCalloutNoteHint", "Выноска callout note (повторное нажатие снимает)") };
    case "callout-gold": return { text: tl("utils.richEditor.toolCalloutGold", "Рекомендация"), hint: tl("utils.richEditor.toolCalloutGoldHint", "Выноска callout gold (повторное нажатие снимает)") };
    case "risk-high": return { text: tl("utils.richEditor.toolRiskHigh", "Риск ↑"), hint: tl("utils.richEditor.toolRiskHighHint", "Метка риска high (повторное нажатие снимает)") };
    case "risk-medium": return { text: tl("utils.richEditor.toolRiskMedium", "Риск →"), hint: tl("utils.richEditor.toolRiskMediumHint", "Метка риска medium (повторное нажатие снимает)") };
    case "risk-low": return { text: tl("utils.richEditor.toolRiskLow", "Риск ↓"), hint: tl("utils.richEditor.toolRiskLowHint", "Метка риска low (повторное нажатие снимает)") };
  }
}

export function tableOpLabel(op: TableOp): ToolLabel {
  switch (op) {
    case "row-add": return { text: tl("utils.richEditor.rowAdd", "+ строка"), hint: tl("utils.richEditor.rowAddHint", "Добавить строку после текущей") };
    case "row-del": return { text: tl("utils.richEditor.rowDel", "− строка"), hint: tl("utils.richEditor.rowDelHint", "Удалить текущую строку") };
    case "col-add": return { text: tl("utils.richEditor.colAdd", "+ столбец"), hint: tl("utils.richEditor.colAddHint", "Добавить столбец после текущего") };
    case "col-del": return { text: tl("utils.richEditor.colDel", "− столбец"), hint: tl("utils.richEditor.colDelHint", "Удалить текущий столбец") };
  }
}
