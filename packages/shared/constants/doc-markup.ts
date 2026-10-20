/**
 * Разрешённая разметка документа (беседа 13.1, Д-63/Д-64).
 *
 * ЕДИНСТВЕННЫЙ источник правды о том, какой HTML имеет право лежать в
 * документе: `sections.html_content`, `syntheses.capsule_html`,
 * `mode_results.html_content`, снимки разделов в `element_versions`. До 13.1
 * список жил в трёх местах порознь — в системном промпте (раздел
 * «ФОРМАТИРОВАНИЕ», генерат `server/config/prompt-templates.ts`), в белом
 * списке `server/utils/html-parser.ts` и в подсказке под полем правки 9.2 —
 * и чистились по нему только ручные правки подраздела. Отсюда строятся:
 *  - санитайзер всех входов HTML (`packages/shared/utils/doc-markup-sanitize.ts`;
 *    сервер зовёт его из html-parser на linkedom, клиент — на DOMParser при
 *    вставке из буфера);
 *  - панель кнопок полнотекстового редактора подраздела (`EDITOR_TOOLS`);
 *  - сторож check:integration: список здесь ≡ тексту промпта (тег или класс в
 *    промпте без строки модуля — красный, и наоборот). Промпт — генерат, его
 *    текст не меняется; этот модуль ПОДЧИНЁН ему, не наоборот.
 *
 * Два режима чистки:
 *  - «содержимое подраздела» (`subsection`) — то, что человек правит и что
 *    модель пишет внутри `<div data-section>` после `<h4>`: абзацы, h5,
 *    strong/em, списки, таблица, выноски, метки риска. Структурные теги в этом
 *    режиме ЗАПРЕЩЕНЫ (правка их не заводит — «По факту 9.2» п.3: <h1>–<h4> и
 *    data-section → отказ, а не чистка; этим занимается replaceSubsectionContent);
 *  - «раздел целиком» (`section`) — ответ модели, импорт, капсула, снимок
 *    версии: сверх содержимого разрешена обёртка раздела (div.doc-section,
 *    .section-num, .section-title, .doc-content, div[data-section] с <h4>) и
 *    якоря оглавления 12.2 (`<a id="subsec-…">` пустой, `<a class="toc-back-btn"
 *    href="#docTOC">` — их несут документы, заведённые импортом одностраничника
 *    до 12.2; в промпте их нет, это отступление службы, объявленное отдельно).
 *
 * Решения пользователя 2026-10-13: санитайзер СУЖАЕТСЯ до списка промпта —
 * `<b>` → `<strong>`, `<i>` → `<em>` (вставка из Word и браузера), прочее вне
 * списка (sup, sub, blockquote, br, caption, tfoot и всё неизвестное)
 * снимается с сохранением текста; опасное (script, iframe, img, …) — вместе с
 * содержимым; атрибуты — все, кроме разрешённых классов и colspan/rowspan у
 * td/th. Ссылок (<a>) в содержимом документа нет.
 */

/* ── Теги содержимого подраздела — ровно по разделу «ФОРМАТИРОВАНИЕ» ──── */

/** Теги, доступные ВНУТРИ подраздела (после <h4>); имена в нижнем регистре. */
export const CONTENT_TAGS: readonly string[] = [
  "p", "h5", "ul", "ol", "li", "strong", "em",
  "table", "thead", "tbody", "tr", "th", "td",
  "div", "span",
];

/** Структурная обёртка раздела — только режим `section`, человек её не правит. */
export const STRUCTURE_TAGS: readonly string[] = ["div", "h4"];

/**
 * Якоря оглавления (12.2, Д-29): ставятся при выгрузке и достраиваются страницей,
 * в html_content их нет — кроме документов, заведённых импортом одностраничника
 * до 12.2. В промпте тега <a> нет: это объявленное отступление службы, сторож
 * сравнивает с промптом СОДЕРЖИМОЕ и обёртку, а якоря — отдельной строкой.
 */
export const TOC_ANCHOR_TAG = "a";
export const TOC_ANCHOR_ID_PREFIX = "subsec-";
export const TOC_BACK_CLASS = "toc-back-btn";
export const TOC_BACK_HREF = "#docTOC";

/** Классы div по режимам (точное значение атрибута class после схлопывания пробелов). */
export const CALLOUT_CLASSES: readonly string[] = ["callout warning", "callout note", "callout gold"];
export const STRUCTURE_DIV_CLASSES: readonly string[] = ["doc-section", "section-num", "section-title", "doc-content"];
/** Классы span. */
export const SPAN_CLASSES: readonly string[] = ["callout-label", "risk high", "risk medium", "risk low"];
/** Класс таблицы — единственный; каждой таблице документа возвращается принудительно
 *  (по нему таблицу находят парсеры 1.4 и экстракторы контекста 1.3). */
export const TABLE_CLASS = "doc-table";

/** Переименования при чистке: тег вне списка → тег списка (решение пользователя). */
export const TAG_REWRITES: Readonly<Record<string, string>> = { b: "strong", i: "em" };

/**
 * Удаляются ВМЕСТЕ с содержимым: текст внутри них — не текст документа
 * (скрипты, стили, формы, медиа, встраивания). Всё прочее вне списка
 * снимается с сохранением текста.
 */
export const DROPPED_TAGS: readonly string[] = [
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet",
  "link", "meta", "base", "head", "title", "template", "noscript", "slot",
  "svg", "math", "form", "input", "button", "textarea", "select", "option",
  "datalist", "output", "img", "picture", "source", "video", "audio", "track",
  "canvas", "map", "area", "dialog", "portal",
];

/** Атрибуты, разрешённые у тегов содержимого: только у ячеек, только 1–2 цифры. */
export const CELL_SPAN_ATTRS: readonly string[] = ["colspan", "rowspan"];
export const CELL_SPAN_RE = /^\d{1,2}$/;

/** Атрибут имени подраздела (режим `section`). Машинное значение — через tl() не идёт. */
export const SUBSECTION_ATTR = "data-section";

/* ── Кнопки редактора (Д-64): ровно по тегам содержимого ──────────────── */

export type EditorToolId =
  | "p" | "h5" | "strong" | "em" | "ul" | "ol" | "table"
  | "callout-warning" | "callout-note" | "callout-gold"
  | "risk-high" | "risk-medium" | "risk-low";

export interface EditorTool {
  id: EditorToolId;
  /** Тег, который кнопка ставит */
  tag: string;
  /** Класс для div/span (пусто у тегов без класса) */
  className?: string;
  /** Блочная (абзац, подзаголовок, списки, таблица, выноска) или строчная (strong, em, метка) */
  kind: "block" | "inline";
}

/**
 * Панель кнопок полнотекстовой правки: каждый тег раздела «ФОРМАТИРОВАНИЕ»,
 * доступный внутри подраздела, — одной кнопкой; структурных тегов и <h4> нет
 * (решение пользователя). Сторож сверяет: панель клиента ⊆ этого списка, а
 * список ≡ тегам и классам промпта.
 */
export const EDITOR_TOOLS: readonly EditorTool[] = [
  { id: "p", tag: "p", kind: "block" },
  { id: "h5", tag: "h5", kind: "block" },
  { id: "strong", tag: "strong", kind: "inline" },
  { id: "em", tag: "em", kind: "inline" },
  { id: "ul", tag: "ul", kind: "block" },
  { id: "ol", tag: "ol", kind: "block" },
  { id: "table", tag: "table", className: TABLE_CLASS, kind: "block" },
  { id: "callout-warning", tag: "div", className: "callout warning", kind: "block" },
  { id: "callout-note", tag: "div", className: "callout note", kind: "block" },
  { id: "callout-gold", tag: "div", className: "callout gold", kind: "block" },
  { id: "risk-high", tag: "span", className: "risk high", kind: "inline" },
  { id: "risk-medium", tag: "span", className: "risk medium", kind: "inline" },
  { id: "risk-low", tag: "span", className: "risk low", kind: "inline" },
];

export const EDITOR_TOOL_IDS: readonly EditorToolId[] = EDITOR_TOOLS.map((t) => t.id);

/* ── Сверка с текстом промпта (сторож) ────────────────────────────────── */

export interface PromptMarkupSpec {
  /** Теги раздела «ФОРМАТИРОВАНИЕ» (нижний регистр, без повторов, по порядку) */
  tags: string[];
  /** Классы, названные в промпте, вида «тег.класс» («div.callout warning») */
  classes: string[];
  /** Атрибуты (кроме class), названные в промпте, вида «тег@атрибут» */
  attrs: string[];
}

const FORMATTING_HEAD_RE = /ФОРМАТИРОВАНИЕ[^\n]*\n/u;
const FORMATTING_TAIL_RE = /\n\s*ТРЕБОВАНИЯ К КАЧЕСТВУ/u;

/**
 * Теги, классы и атрибуты, которые разрешает раздел «ФОРМАТИРОВАНИЕ»
 * системного промпта (тело шаблона `system`). Разбор — по строкам «- <…>»
 * между заголовком раздела и «ТРЕБОВАНИЯ К КАЧЕСТВУ»; читаются ОТКРЫВАЮЩИЕ
 * теги и их атрибуты. null — раздела в тексте нет (генерат изменился:
 * сторож обязан покраснеть, а не промолчать).
 */
export function parsePromptFormatting(systemBody: string): PromptMarkupSpec | null {
  const head = FORMATTING_HEAD_RE.exec(systemBody);
  if (!head) return null;
  const from = head.index + head[0].length;
  const tail = FORMATTING_TAIL_RE.exec(systemBody.slice(from));
  const block = tail ? systemBody.slice(from, from + tail.index) : systemBody.slice(from);
  const tags: string[] = [];
  const classes: string[] = [];
  const attrs: string[] = [];
  const push = (arr: string[], v: string): void => {
    if (!arr.includes(v)) arr.push(v);
  };
  for (const line of block.split("\n")) {
    if (!/^\s*-\s*</.test(line)) continue;
    const re = /<([a-z][a-z0-9]*)((?:\s+[a-z-]+="[^"]*")*)\s*>/giu;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const tag = (m[1] ?? "").toLowerCase();
      push(tags, tag);
      const attrRe = /([a-z-]+)="([^"]*)"/giu;
      let a: RegExpExecArray | null;
      while ((a = attrRe.exec(m[2] ?? "")) !== null) {
        const name = (a[1] ?? "").toLowerCase();
        const value = (a[2] ?? "").trim().replace(/\s+/g, " ");
        if (name === "class") push(classes, `${tag}.${value}`);
        else push(attrs, `${tag}@${name}`);
      }
    }
  }
  return { tags, classes, attrs };
}

/** Что этот модуль считает разрешённым — в том же виде, что parsePromptFormatting. */
export function moduleMarkupSpec(): PromptMarkupSpec {
  const tags = [...new Set([...STRUCTURE_TAGS, ...CONTENT_TAGS])];
  const classes = [
    ...STRUCTURE_DIV_CLASSES.map((c) => `div.${c}`),
    `table.${TABLE_CLASS}`,
    ...CALLOUT_CLASSES.map((c) => `div.${c}`),
    ...SPAN_CLASSES.map((c) => `span.${c}`),
  ];
  const attrs = [`div@${SUBSECTION_ATTR}`];
  return { tags, classes, attrs };
}

/** Расхождения модуля с промптом — пусто, когда списки совпали как множества. */
export function diffMarkupSpecs(prompt: PromptMarkupSpec, module: PromptMarkupSpec): string[] {
  const out: string[] = [];
  const cmp = (what: string, a: readonly string[], b: readonly string[]): void => {
    for (const x of a) if (!b.includes(x)) out.push(`${what} в промпте без строки модуля: ${x}`);
    for (const x of b) if (!a.includes(x)) out.push(`${what} в модуле, которого нет в промпте: ${x}`);
  };
  cmp("тег", prompt.tags, module.tags);
  cmp("класс", prompt.classes, module.classes);
  cmp("атрибут", prompt.attrs, module.attrs);
  return out;
}
