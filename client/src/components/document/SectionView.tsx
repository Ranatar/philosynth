/**
 * Один раздел документа. Беседа 1.6b (запрос 1, п. 3).
 *
 * Обёртка .doc-body (аналог db{N} исходника — но БЕЗ индексации db{N} /
 * rebuildDbMapping: разделы адресуются по key) с якорем #sec-{key} и
 * рендером htmlContent через dangerouslySetInnerHTML. Свой заголовок
 * НЕ рисует: html_content хранит весь <div class="doc-section"> вместе
 * с section-num и section-title.
 *
 * Вторая половина buildTableOfContents [11655–11710] — кнопки ⏫
 * («К содержанию», href="#docTOC") в .section-title и якоря подразделов
 * <a id="subsec-{key}-{slug}"> + ⏫ в h4 — вносится В САМУ HTML-СТРОКУ
 * до рендера (DOMParser в useMemo), а не пострендер-мутацией DOM.
 *
 * ГРАБЛЯ 1.6b (пойман тестом R4): пострендер-вставки в DOM под
 * dangerouslySetInnerHTML стираются — React пере-применяет innerHTML
 * при ре-рендере от hash-навигации (клик по TOC-ссылке дёргает
 * location → ре-рендер дерева → вставленные узлы исчезают, эффект с
 * неизменными deps не перезапускается). Обогащение строки снимает
 * класс проблем: якоря — часть __html, их нечего терять.
 *
 * Поиск подраздела — перебором [data-section] со сравнением атрибута
 * (имена содержат произвольные символы — селектор с кавычками хрупок).
 *
 * Беседа 5.2 (п. 7): кнопки ✎ на строках «Сводной таблицы тезисов» и
 * «Таблицы определений» вносятся тем же приёмом — в строку HTML
 * (addInlineEditButtons; дополнительный столбец .inline-edit-cell —
 * только на экране, html_content в БД не меняется). Клик ловится
 * делегированием на обёртке; редактор рендерится слотом inlineEditor ПОД
 * HTML раздела (внутрь dangerouslySetInnerHTML React-узел не вставить).
 */
import { useMemo, type MouseEvent, type ReactNode } from "react";

import type { SectionFull } from "@philosynth/shared/types/section";

import { subsectionSlugId } from "./TableOfContents";

/** Строка таблицы, редактируемая по месту (беседа 5.2, п. 7) */
export type EditableRowKind = "thesis" | "glossary_term";

export interface EditableRowRef {
  kind: EditableRowKind;
  sectionKey: string;
  /** Индекс строки в tbody (0-based) */
  rowIndex: number;
  /** Тексты ячеек строки (сопоставление с элементом БД у хозяина) */
  cells: string[];
  /** Заголовки thead таблицы (ключи extra_columns глоссария) */
  headers: string[];
}

export interface SectionViewProps {
  section: SectionFull;
  /** Беседа 5.2 (п. 7): рисовать кнопки ✎ на строках таблиц тезисов/
   *  глоссария (добавляются В СТРОКУ HTML до вставки — грабля 1.6b) */
  editable?: boolean | undefined;
  onRowEdit?: ((row: EditableRowRef) => void) | undefined;
  /** Слот редактора по месту — рендерится под HTML раздела */
  inlineEditor?: ReactNode;
}

/** Таблица тезисов: подраздел «Сводная таблица тезисов» (locatorsFor
 *  element-renderer: subsection «Сводная таблица»); глоссарий — первый th
 *  «термин» либо подраздел «Таблица определений» (парсер 1.4). */
function findEditableTables(
  root: Element,
): { kind: EditableRowKind; table: Element }[] {
  const out: { kind: EditableRowKind; table: Element }[] = [];
  for (const sub of root.querySelectorAll("[data-section]")) {
    const name = sub.getAttribute("data-section") ?? "";
    const table = sub.querySelector("table.doc-table, table");
    if (!table) continue;
    if (name.includes("Сводная таблица")) out.push({ kind: "thesis", table });
    else if (name === "Таблица определений")
      out.push({ kind: "glossary_term", table });
  }
  if (!out.some((t) => t.kind === "glossary_term")) {
    for (const table of root.querySelectorAll("table")) {
      const th = table.querySelector("th");
      if (th && (th.textContent ?? "").trim().toLowerCase().includes("термин")) {
        out.push({ kind: "glossary_term", table });
        break;
      }
    }
  }
  return out;
}

/** Кнопки ✎ на строках таблиц — в HTML-строку (беседа 5.2, п. 7) */
export function addInlineEditButtons(doc: Document, root: Element): void {
  for (const { kind, table } of findEditableTables(root)) {
    if (table.querySelector(".inline-edit-cell")) continue;
    for (const hr of table.querySelectorAll("thead tr")) {
      const th = doc.createElement("th");
      th.className = "inline-edit-cell";
      th.setAttribute("aria-label", "Правка");
      hr.appendChild(th);
    }
    const rows = table.querySelectorAll("tbody tr");
    rows.forEach((tr, i) => {
      const td = doc.createElement("td");
      td.className = "inline-edit-cell";
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "inline-edit-btn";
      btn.textContent = "✎";
      btn.title = kind === "thesis" ? "Редактировать тезис" : "Редактировать термин";
      btn.setAttribute("data-edit-kind", kind);
      btn.setAttribute("data-edit-row", String(i));
      td.appendChild(btn);
      tr.appendChild(td);
    });
  }
}

function appendBackBtn(doc: Document, host: Element) {
  if (host.querySelector(".toc-back-btn")) return;
  const btn = doc.createElement("a");
  btn.setAttribute("href", "#docTOC");
  btn.className = "toc-back-btn";
  btn.textContent = "⏫";
  btn.setAttribute("title", "К содержанию");
  host.appendChild(btn);
}

/** Якоря #subsec-* и кнопки ⏫ — в HTML-строку (порт [11655–11710]) */
export function enrichSectionHtml(
  htmlContent: string,
  key: string,
  subsections: readonly string[],
  opts: { editButtons?: boolean } = {},
): string {
  if (typeof DOMParser === "undefined") return htmlContent; // среда без DOM
  const doc = new DOMParser().parseFromString(
    `<div id="__wrap">${htmlContent}</div>`,
    "text/html",
  );
  const root = doc.getElementById("__wrap");
  if (!root) return htmlContent;

  // Кнопка ⏫ рядом с заголовком раздела
  const sectionTitle = root.querySelector(".section-title");
  if (sectionTitle) appendBackBtn(doc, sectionTitle);

  // Якоря и кнопки ⏫ на подразделах
  const dataSectionEls = root.querySelectorAll("[data-section]");
  for (const subName of subsections) {
    const subId = subsectionSlugId(key, subName);
    let subEl: Element | null = null;
    for (const el of dataSectionEls) {
      if (el.getAttribute("data-section") === subName) {
        subEl = el;
        break;
      }
    }
    if (!subEl) continue;
    if (!doc.getElementById(subId)) {
      const anchor = doc.createElement("a");
      anchor.id = subId;
      subEl.insertBefore(anchor, subEl.firstChild);
    }
    const h4 = subEl.querySelector("h4");
    if (h4) appendBackBtn(doc, h4);
  }

  if (opts.editButtons) addInlineEditButtons(doc, root);

  return root.innerHTML;
}

export function SectionView({
  section,
  editable = false,
  onRowEdit,
  inlineEditor,
}: SectionViewProps) {
  const enrichedHtml = useMemo(
    () =>
      enrichSectionHtml(section.htmlContent, section.key, section.subsections, {
        editButtons: editable,
      }),
    [section.htmlContent, section.key, section.subsections, editable],
  );

  // Делегирование клика по ✎ (кнопки — часть __html, обработчиков у них нет)
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!onRowEdit) return;
    const target = e.target as HTMLElement | null;
    const btn = target?.closest?.("button[data-edit-kind]") as HTMLElement | null;
    if (!btn) return;
    e.preventDefault();
    const kind = btn.getAttribute("data-edit-kind") as EditableRowKind;
    const rowIndex = Number(btn.getAttribute("data-edit-row"));
    const tr = btn.closest("tr");
    const table = btn.closest("table");
    const cells = tr
      ? [...tr.querySelectorAll("td")]
          .filter((td) => !td.classList.contains("inline-edit-cell"))
          .map((td) => (td.textContent ?? "").trim())
      : [];
    const headers = table
      ? [...table.querySelectorAll("thead th")]
          .filter((th) => !th.classList.contains("inline-edit-cell"))
          .map((th) => (th.textContent ?? "").replace(/⏫/g, "").trim())
      : [];
    onRowEdit({ kind, sectionKey: section.key, rowIndex, cells, headers });
  };

  return (
    <div className="doc-body">
      <a id={`sec-${section.key}`} />
      <div dangerouslySetInnerHTML={{ __html: enrichedHtml }} onClick={handleClick} />
      {inlineEditor}
      {/* Долг 1.6b → 2.3: порт makeSectionCtxDisclosure [11482] —
          свёрнутый показ дополнительного контекста раздела (sec_context
          уже в SectionFull; исходник вставлял details.sec-disclosure в
          конец раздела при непустом secCtx; стили .sec-disclosure —
          в globals.css с 1.6b) */}
      {section.secContext && (
        <details className="sec-disclosure">
          <summary>Дополнительный контекст раздела</summary>
          <div className="disclosure-body">{section.secContext}</div>
        </details>
      )}
    </div>
  );
}
