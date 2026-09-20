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
 *
 * Беседа 5.5 (п. 7): слот actions — строка действий раздела НАД HTML
 * (кнопка «→ Граф» у раздела theses); рендерит хозяин через
 * DocumentView.sectionActionsFor. Тот же приём слота, что inlineEditor.
 *
 * Беседа 9.2: ручная правка подраздела. Карандаш у заголовка <h4> и сама
 * форма правки вносятся тем же приёмом — В СТРОКУ HTML (addSubsectionPencils
 * / renderSubsectionEditor): форма встаёт НА МЕСТО содержимого подраздела,
 * под его <h4>, а не под разделом, — иначе в длинном разделе поле оказалось
 * бы в экране от правимого текста. Поле — неуправляемая <textarea>: React не
 * трогает DOM, пока строка __html прежняя, а меняет её только хозяин
 * (состояние subsectionEdit), всякий раз передавая набранное в draft. Клики
 * и клавиши ловятся делегированием. У запертых подразделов (lockedSubsections
 * из GET /sections/:key) карандаша НЕТ вовсе — не рисовать неработающим (8.7).
 */
import {
  useMemo,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import type { SectionFull } from "@philosynth/shared/types/section";

import type { SubsectionEditState, SubsectionRef } from "../../utils/subsection-edit";

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
  /** Беседа 5.5: строка действий раздела — над HTML (кнопка «→ Граф») */
  actions?: ReactNode;
  /** Беседа 9.2: карандаши у заголовков незапертых подразделов */
  subsectionEditable?: boolean | undefined;
  /** Правка, открытая В ЭТОМ разделе (у прочих разделов — undefined) */
  subsectionEdit?: SubsectionEditState | undefined;
  /** Правка открыта где-то в документе — прочие карандаши прячутся */
  subsectionEditBusy?: boolean | undefined;
  onSubsectionEdit?: ((ref: SubsectionRef) => void) | undefined;
  onSubsectionSave?: ((html: string) => void) | undefined;
  onSubsectionCancel?: (() => void) | undefined;
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

/** Подраздел по ТОЧНОМУ имени — перебором (в именах кавычки и скобки). */
function findSubsectionEl(root: Element, name: string): Element | null {
  for (const el of root.querySelectorAll("[data-section]")) {
    if (el.getAttribute("data-section") === name) return el;
  }
  return null;
}

/** Карандаш у <h4> каждого незапертого подраздела (беседа 9.2, п. 4a/4d) */
export function addSubsectionPencils(
  doc: Document,
  root: Element,
  locked: readonly string[],
): void {
  for (const sub of root.querySelectorAll("[data-section]")) {
    const name = sub.getAttribute("data-section") ?? "";
    if (!name || locked.includes(name)) continue;
    let h4: Element | null = null;
    for (const child of sub.children) {
      if (child.tagName === "H4") {
        h4 = child;
        break;
      }
    }
    if (!h4 || h4.querySelector("[data-edit-subsection]")) continue;
    h4.classList.add("inline-edit-host");
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "inline-edit-btn subsection-edit-btn";
    btn.textContent = "✎";
    btn.title = "Править подраздел";
    btn.setAttribute("data-edit-subsection", name);
    h4.appendChild(btn);
  }
}

const SUBSECTION_DRAFT_TOKEN = "\u0000subsection-draft\u0000";

function escapeForTextarea(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Форма правки — на месте содержимого подраздела, под его <h4> (9.2, п. 4b) */
export function renderSubsectionEditor(
  doc: Document,
  root: Element,
  edit: SubsectionEditState,
): void {
  const sub = findSubsectionEl(root, edit.name);
  if (!sub) return;
  // Всё после заголовка убираем ТОЛЬКО с экрана — в поле лежит его разметка
  let headingSeen = false;
  for (const node of [...sub.childNodes]) {
    if (!headingSeen) {
      if (node.nodeType === 1 && (node as Element).tagName === "H4") headingSeen = true;
      continue;
    }
    sub.removeChild(node);
  }
  const el = (tag: string, cls: string, text?: string): HTMLElement => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const form = el("div", "inline-edit-form subsection-edit-form");
  form.setAttribute("data-subsection-editor", edit.name);

  if (edit.phase === "saved") {
    form.appendChild(el("div", "subsection-edit-note", "Сохранено. Сервер поправил разметку:"));
    const ul = el("ul", "subsection-edit-warnings");
    for (const w of edit.warnings) ul.appendChild(el("li", "", w));
    form.appendChild(ul);
    const actions = el("div", "inline-edit-actions");
    const ok = el("button", "action-btn", "Понятно");
    ok.setAttribute("type", "button");
    ok.setAttribute("data-subsection-action", "cancel");
    actions.appendChild(ok);
    form.appendChild(actions);
    sub.appendChild(form);
    return;
  }

  // Исходник не приехал (замок, 409, сеть): поля нет — только отказ и «Отмена»
  const loadFailed = edit.phase === "loading" && !!edit.error;
  form.appendChild(el("label", "form-label", "Разметка подраздела"));
  const area = doc.createElement("textarea");
  area.className = "form-textarea subsection-edit-source";
  area.setAttribute("data-subsection-source", "1");
  area.setAttribute("spellcheck", "true");
  area.setAttribute("rows", String(Math.min(28, Math.max(8, edit.draft.split("\n").length + 2))));
  if (edit.phase !== "ready") area.setAttribute("disabled", "");
  // Разметка в поле — через метку и подстановку в ГОТОВУЮ строку
  // (enrichSectionHtml): экранирование содержимого <textarea> при
  // сериализации у DOM-реализаций разное (браузер экранирует, linkedom —
  // нет), а </textarea> в разметке человека не должен закрыть поле
  area.textContent = edit.phase === "loading" ? "Загрузка…" : SUBSECTION_DRAFT_TOKEN;
  if (!loadFailed) form.appendChild(area);
  if (!loadFailed) form.appendChild(
    el(
      "div",
      "subsection-edit-note",
      "Правится разметка: <p> — абзац, <strong> — выделение, <ul>/<ol> с <li> — списки, <h5> — подзаголовок, <table> — таблица. " +
        "Заголовок подраздела здесь не правится." +
        (edit.nested.length
          ? " Строка «подраздел N» — место вложенного подраздела: у него своя правка, строку не удалять."
          : ""),
    ),
  );
  if (edit.error) {
    const err = el("div", "pool-status err", edit.error);
    err.setAttribute("role", "alert");
    err.setAttribute("data-testid", "subsection-edit-error");
    form.appendChild(err);
  }
  const actions = el("div", "inline-edit-actions");
  const save = el("button", "action-btn primary", edit.phase === "saving" ? "Сохранение…" : "Сохранить");
  save.setAttribute("type", "button");
  save.setAttribute("data-subsection-action", "save");
  if (edit.phase !== "ready") save.setAttribute("disabled", "");
  const cancel = el("button", "action-btn", "Отмена");
  cancel.setAttribute("type", "button");
  cancel.setAttribute("data-subsection-action", "cancel");
  if (edit.phase === "saving") cancel.setAttribute("disabled", "");
  if (!loadFailed) actions.appendChild(save);
  actions.appendChild(cancel);
  if (!loadFailed) actions.appendChild(el("span", "subsection-edit-keys", "Esc — отмена · Ctrl+Enter — сохранить"));
  form.appendChild(actions);
  sub.appendChild(form);
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
  opts: {
    editButtons?: boolean;
    /** 9.2: карандаши у подразделов, кроме перечисленных запертых */
    subsectionPencils?: { locked: readonly string[] } | undefined;
    /** 9.2: форма правки на месте подраздела (карандаши при ней не рисуются) */
    subsectionEdit?: SubsectionEditState | undefined;
  } = {},
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
  if (opts.subsectionEdit) renderSubsectionEditor(doc, root, opts.subsectionEdit);
  else if (opts.subsectionPencils)
    addSubsectionPencils(doc, root, opts.subsectionPencils.locked);

  const out = root.innerHTML;
  return opts.subsectionEdit
    ? out.split(SUBSECTION_DRAFT_TOKEN).join(escapeForTextarea(opts.subsectionEdit.draft))
    : out;
}

export function SectionView({
  section,
  editable = false,
  onRowEdit,
  inlineEditor,
  actions,
  subsectionEditable = false,
  subsectionEdit,
  subsectionEditBusy = false,
  onSubsectionEdit,
  onSubsectionSave,
  onSubsectionCancel,
}: SectionViewProps) {
  // Замки — из GET /sections/:key (вычисляемый заслон сервера). Нет поля
  // (вложенные разделы гостя) — карандашей нет вовсе: гадать клиент не вправе
  const locked = section.lockedSubsections;
  const pencils = subsectionEditable && !subsectionEditBusy && locked !== undefined;
  // Набранное в поле — в ref (без ре-рендера): если строка раздела всё же
  // пересоберётся посреди правки (перечитка разделов по событию WS), поле
  // встанет с набранным, а не с исходником из состояния хозяина
  const liveDraft = useRef<{ name: string; text: string } | null>(null);
  if (!subsectionEdit || subsectionEdit.phase === "loading") liveDraft.current = null;
  const enrichedHtml = useMemo(() => {
    const live = liveDraft.current;
    const edit =
      subsectionEdit && subsectionEdit.phase === "ready" && live?.name === subsectionEdit.name
        ? { ...subsectionEdit, draft: live.text }
        : subsectionEdit;
    return enrichSectionHtml(section.htmlContent, section.key, section.subsections, {
      editButtons: editable && !subsectionEdit,
      subsectionPencils: pencils && locked ? { locked } : undefined,
      subsectionEdit: edit,
    });
  }, [section.htmlContent, section.key, section.subsections, editable, pencils, locked, subsectionEdit]);
  // ОБЪЕКТ пропа обязан быть тем же, пока строка та же: React 19 заново
  // пишет innerHTML при каждой смене ссылки { __html }, даже с прежней
  // строкой (это и есть грабля 1.6b) — неуправляемое поле теряло бы набранное
  // при любом постороннем ре-рендере страницы (найдено пробой в Chrome, 9.2)
  const innerHtmlProp = useMemo(() => ({ __html: enrichedHtml }), [enrichedHtml]);

  const handleInput = (e: FormEvent<HTMLDivElement>) => {
    const target = e.target as HTMLTextAreaElement | null;
    if (!subsectionEdit || !target?.matches?.("textarea[data-subsection-source]")) return;
    liveDraft.current = { name: subsectionEdit.name, text: target.value };
  };

  /** Набранное в поле: читается из DOM — поле неуправляемое (см. шапку) */
  const readDraft = (from: Element | null): string | null => {
    const area = from
      ?.closest("[data-subsection-editor]")
      ?.querySelector("textarea[data-subsection-source]") as HTMLTextAreaElement | null;
    return area ? area.value : null;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target?.matches?.("textarea[data-subsection-source]")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onSubsectionCancel?.();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const draft = readDraft(target);
      if (draft !== null) onSubsectionSave?.(draft);
    }
  };

  // Делегирование клика по ✎ (кнопки — часть __html, обработчиков у них нет)
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    // 9.2: карандаш подраздела и кнопки формы правки
    const pencil = target?.closest?.("button[data-edit-subsection]") as HTMLElement | null;
    if (pencil) {
      e.preventDefault();
      const name = pencil.getAttribute("data-edit-subsection");
      if (name) onSubsectionEdit?.({ sectionKey: section.key, name });
      return;
    }
    const act = target?.closest?.("button[data-subsection-action]") as HTMLElement | null;
    if (act) {
      e.preventDefault();
      if (act.getAttribute("data-subsection-action") === "save") {
        const draft = readDraft(act);
        if (draft !== null) onSubsectionSave?.(draft);
      } else onSubsectionCancel?.();
      return;
    }
    if (!onRowEdit) return;
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
      {actions && <div className="section-actions">{actions}</div>}
      <div
        dangerouslySetInnerHTML={innerHtmlProp}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
      />
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
