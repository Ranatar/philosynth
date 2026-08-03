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
 */
import { useMemo } from "react";

import type { SectionFull } from "@philosynth/shared/types/section";

import { subsectionSlugId } from "./TableOfContents";

export interface SectionViewProps {
  section: SectionFull;
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

  return root.innerHTML;
}

export function SectionView({ section }: SectionViewProps) {
  const enrichedHtml = useMemo(
    () =>
      enrichSectionHtml(section.htmlContent, section.key, section.subsections),
    [section.htmlContent, section.key, section.subsections],
  );

  return (
    <div className="doc-body">
      <a id={`sec-${section.key}`} />
      <div dangerouslySetInnerHTML={{ __html: enrichedHtml }} />
    </div>
  );
}
