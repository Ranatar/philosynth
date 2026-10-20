/**
 * Санитайзер разметки документа — ядро, не знающее о DOM-реализации
 * (беседа 13.1, Д-63). Правила — `constants/doc-markup.ts`; здесь только их
 * применение к дереву. Сервер зовёт ядро из `server/utils/html-parser.ts`
 * (linkedom — единственная точка разбора на сервере), клиент — из редактора
 * подраздела на дереве `DOMParser` (вставка из буфера, п.7 беседы, и
 * нормализация набранного). Одно ядро — одно поведение: человек в редакторе
 * видит ровно то, что сохранит сервер.
 *
 * Что делает проход (`sanitizeDocMarkup`):
 *  - теги из DROPPED_TAGS — удаляются вместе с содержимым;
 *  - `<b>` → `<strong>`, `<i>` → `<em>` (TAG_REWRITES);
 *  - прочие теги вне списка режима — снимаются, дети остаются на месте
 *    («снимается с сохранением текста»); `<br>` без детей заменяется пробелом,
 *    чтобы слова по краям не слиплись;
 *  - у оставшихся тегов снимаются ВСЕ атрибуты, кроме разрешённых: class из
 *    набора (у table — принудительно doc-table), colspan/rowspan у ячеек (1–2
 *    цифры); в режиме `section` ещё data-section у div, id у пустого якоря
 *    `<a id="subsec-…">` и class/href/title у `<a class="toc-back-btn"
 *    href="#docTOC">`; любой другой `<a>` снимается — ссылок в документе нет;
 *  - комментарии: в режиме `section` удаляются (ответ модели, импорт); в режиме
 *    `subsection` остаются — ими правка 9.2 помечает места вложенных
 *    подразделов, и их проверяет replaceSubsectionContent;
 *  - структурных тегов (<h1>–<h4>, data-section) в режиме `subsection` ядро НЕ
 *    решает: replaceSubsectionContent отвергает их отказом ДО чистки («По
 *    факту 9.2» п.3) — здесь они пришли бы как «теги вне списка» и были бы
 *    сняты, поэтому порядок вызовов там: отказы → ядро.
 *
 * `protect(el)` — элемент (и всё под ним) ядро не трогает: редактор помечает
 * так плашки вложенных подразделов, которые человек не правит.
 */
import {
  CALLOUT_CLASSES,
  CELL_SPAN_ATTRS,
  CELL_SPAN_RE,
  CONTENT_TAGS,
  DROPPED_TAGS,
  SPAN_CLASSES,
  STRUCTURE_DIV_CLASSES,
  STRUCTURE_TAGS,
  SUBSECTION_ATTR,
  TABLE_CLASS,
  TAG_REWRITES,
  TOC_ANCHOR_ID_PREFIX,
  TOC_ANCHOR_TAG,
  TOC_BACK_CLASS,
  TOC_BACK_HREF,
} from "../constants/doc-markup.js";

export type SanitizeMode = "subsection" | "section";

/** Минимум узла дерева, одинаковый у linkedom и браузера. */
export interface SanitizableNode {
  readonly nodeType: number;
  textContent: string | null;
  readonly parentNode: SanitizableNode | null;
  remove(): void;
}

export interface SanitizableElement extends SanitizableNode {
  readonly tagName: string;
  readonly childNodes: Iterable<SanitizableNode>;
  readonly parentElement: SanitizableElement | null;
  readonly ownerDocument: {
    createElement(tag: string): SanitizableElement;
    createTextNode(text: string): SanitizableNode;
  } | null;
  readonly attributes: Iterable<{ name: string; value: string }>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelectorAll(selector: string): Iterable<SanitizableElement>;
  replaceWith(...nodes: SanitizableNode[]): void;
  appendChild(node: SanitizableNode): SanitizableNode;
}

export interface SanitizeOptions {
  mode: SanitizeMode;
  /** Элемент не трогать и внутрь не заходить (плашки редактора) */
  protect?: ((el: SanitizableElement) => boolean) | undefined;
}

export interface SanitizeReport {
  /** Теги, удалённые вместе с содержимым (нижний регистр) */
  dropped: string[];
  /** Теги, снятые с сохранением текста */
  unwrapped: string[];
  /** Переименования вида «b→strong» */
  renamed: string[];
  /** Снятые классы вида «div.foo» */
  classesStripped: string[];
  /** Снятые атрибуты вида «p@style» */
  attrsStripped: string[];
  /** Хоть что-то изменилось */
  changed: boolean;
}

const ELEMENT_NODE = 1;
const COMMENT_NODE = 8;

const DROPPED = new Set(DROPPED_TAGS);
const CONTENT = new Set(CONTENT_TAGS);
const STRUCTURE = new Set(STRUCTURE_TAGS);

function pushUniq(arr: string[], v: string): void {
  if (!arr.includes(v)) arr.push(v);
}

function normClass(el: SanitizableElement): string {
  return (el.getAttribute("class") ?? "").trim().replace(/\s+/g, " ");
}

/** Разрешённый class для тега в режиме; null — класс снимается. */
function allowedClass(tag: string, cls: string, mode: SanitizeMode): string | null {
  if (!cls) return null;
  if (tag === "table") return TABLE_CLASS;
  if (tag === "div") {
    if (CALLOUT_CLASSES.includes(cls)) return cls;
    if (mode === "section" && STRUCTURE_DIV_CLASSES.includes(cls)) return cls;
    return null;
  }
  if (tag === "span") return SPAN_CLASSES.includes(cls) ? cls : null;
  if (tag === TOC_ANCHOR_TAG && mode === "section" && cls === TOC_BACK_CLASS) return cls;
  return null;
}

function hasProtectedAncestor(
  el: SanitizableElement,
  protect: (el: SanitizableElement) => boolean,
): boolean {
  for (let p: SanitizableElement | null = el; p; p = p.parentElement) {
    if (protect(p)) return true;
  }
  return false;
}

function dropComments(root: SanitizableElement, report: SanitizeReport): void {
  const walk = (node: SanitizableElement): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === COMMENT_NODE) {
        child.remove();
        report.changed = true;
      } else if (child.nodeType === ELEMENT_NODE) walk(child as SanitizableElement);
    }
  };
  walk(root);
}

/** Якорь оглавления 12.2: пустой <a id="subsec-…"> либо кнопка ⏫ «К содержанию». */
function tocAnchorKind(el: SanitizableElement): "anchor" | "back" | null {
  const id = el.getAttribute("id") ?? "";
  if (id.startsWith(TOC_ANCHOR_ID_PREFIX) && (el.textContent ?? "").trim() === "") {
    let hasChild = false;
    for (const c of el.childNodes) {
      if (c.nodeType === ELEMENT_NODE) { hasChild = true; break; }
    }
    if (!hasChild) return "anchor";
  }
  if (normClass(el) === TOC_BACK_CLASS && (el.getAttribute("href") ?? "") === TOC_BACK_HREF) return "back";
  return null;
}

/**
 * Чистка дерева ПО МЕСТУ. Возвращает отчёт; текст предупреждений для человека
 * собирает вызывающий (на сервере — html-parser, своими прежними фразами).
 */
export function sanitizeDocMarkup(root: SanitizableElement, opts: SanitizeOptions): SanitizeReport {
  const report: SanitizeReport = {
    dropped: [], unwrapped: [], renamed: [], classesStripped: [], attrsStripped: [], changed: false,
  };
  const mode = opts.mode;
  const protect = opts.protect;
  // Снимок списка: дерево меняется по ходу обхода
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (!el.parentNode) continue; // уже удалён вместе с предком
    if (protect && hasProtectedAncestor(el, protect)) continue;
    let tag = el.tagName.toLowerCase();
    if (DROPPED.has(tag)) {
      pushUniq(report.dropped, tag);
      el.remove();
      report.changed = true;
      continue;
    }
    const rewrite = TAG_REWRITES[tag];
    let node = el;
    if (rewrite) {
      const doc = el.ownerDocument;
      if (doc) {
        const fresh = doc.createElement(rewrite);
        for (const child of Array.from(el.childNodes)) fresh.appendChild(child);
        el.replaceWith(fresh);
        node = fresh;
        pushUniq(report.renamed, `${tag}→${rewrite}`);
        report.changed = true;
        tag = rewrite;
      }
    }
    const allowedTag =
      CONTENT.has(tag) ||
      (mode === "section" && (STRUCTURE.has(tag) || tag === TOC_ANCHOR_TAG));
    if (!allowedTag) {
      pushUniq(report.unwrapped, tag);
      const doc = node.ownerDocument;
      const children = Array.from(node.childNodes);
      if (tag === "br" && children.length === 0 && doc) node.replaceWith(doc.createTextNode(" "));
      else if (tag === "caption" && node.parentElement?.tagName.toLowerCase() === "table") {
        // Подпись таблицы — текстом ПЕРЕД таблицей: внутри <table> голому тексту
        // не место (браузер вынес бы его сам, но непредсказуемо)
        const table = node.parentElement;
        const p = doc ? doc.createElement("p") : null;
        if (p) {
          for (const c of children) p.appendChild(c);
          table.replaceWith(p, table);
          node.remove();
        } else node.replaceWith(...children);
      } else node.replaceWith(...children);
      report.changed = true;
      continue;
    }
    let tocKind: "anchor" | "back" | null = null;
    if (tag === TOC_ANCHOR_TAG) {
      tocKind = tocAnchorKind(node);
      if (!tocKind) {
        // Ссылок в документе нет: любой другой <a> снимается, текст остаётся
        pushUniq(report.unwrapped, tag);
        node.replaceWith(...Array.from(node.childNodes));
        report.changed = true;
        continue;
      }
    }
    // Атрибуты: всё, кроме разрешённого
    const cls = normClass(node);
    const keepClass = allowedClass(tag, cls, mode);
    for (const attr of Array.from(node.attributes)) {
      const n = attr.name.toLowerCase();
      if (n === "class") continue; // решается ниже
      const spanOk =
        CELL_SPAN_ATTRS.includes(n) && (tag === "td" || tag === "th") && CELL_SPAN_RE.test(attr.value.trim());
      const sectionOk =
        mode === "section" &&
        ((tag === "div" && n === SUBSECTION_ATTR) ||
          (tocKind === "anchor" && n === "id") ||
          (tocKind === "back" && (n === "href" || n === "title")));
      if (spanOk || sectionOk) continue;
      pushUniq(report.attrsStripped, `${tag}@${n}`);
      node.removeAttribute(attr.name);
      report.changed = true;
    }
    if (tag === "table") {
      if (cls !== TABLE_CLASS) {
        node.setAttribute("class", TABLE_CLASS);
        if (cls) pushUniq(report.classesStripped, `table.${cls}`);
        report.changed = true;
      }
    } else if (keepClass !== null) {
      if (node.getAttribute("class") !== keepClass) {
        node.setAttribute("class", keepClass);
        report.changed = true;
      }
    } else if (cls) {
      // linkedom отдаёт "" у отсутствующего class — пустой класс не считается
      pushUniq(report.classesStripped, `${tag}.${cls}`);
      node.removeAttribute("class");
      report.changed = true;
    }
  }
  if (mode === "section") dropComments(root, report);
  return report;
}

/** Строки предупреждений по отчёту — РУССКИЕ (диагностика для владельца; перевод — Фаза 14, Д-60). */
export function sanitizeWarningsRu(report: SanitizeReport): string[] {
  const out: string[] = [];
  const tags = (arr: readonly string[]): string => arr.map((t) => `<${t}>`).join(", ");
  if (report.dropped.length) out.push(`Удалены вместе с содержимым: ${tags(report.dropped)}`);
  if (report.unwrapped.length) out.push(`Теги вне набора документа сняты, текст оставлен: ${tags(report.unwrapped)}`);
  if (report.renamed.length)
    out.push(`Заменены тегами набора: ${report.renamed.map((r) => { const [a, b] = r.split("→"); return `<${a}> → <${b}>`; }).join(", ")}`);
  if (report.classesStripped.length) out.push(`Сняты классы вне набора: ${report.classesStripped.join(", ")}`);
  if (report.attrsStripped.length) out.push(`Сняты атрибуты: ${report.attrsStripped.join(", ")}`);
  return out;
}
