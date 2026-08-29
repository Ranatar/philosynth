/**
 * md-exporter — saveMD() [18197] + sec2md/node2md/inline2md/table2md/
 * sig2md [18211–18292] (беседа 4.2; карта 04 §2.5: «УЖЕ реализован в
 * исходнике — портировать»; 03 §1.8 X5, §2.11 GET /export/md).
 *
 * АДАПТАЦИИ DOM→БД:
 *  - document.getElementById(docTitle/docSubtitle/docNum/docDate/docMethod/
 *    docDepth) → строка syntheses (подзаголовок — три ветки subtitleFor,
 *    как DocumentHeader 1.6b; дата — createdAt в ru-RU day 2-digit /
 *    month long / year, как заполнял [12110]);
 *  - #docBodies.querySelectorAll(".doc-section") → sections.html_content
 *    в порядке sectionOrder (капсула исключена — она живёт в шапке),
 *    парсинг server/utils/html-parser (единственная точка linkedom);
 *  - c.classList.contains("callout") → атрибут class (у HtmlElement нет
 *    classList); c.innerText → innerText() html-parser (приближение
 *    браузерного, адаптация 1.3);
 *  - downloadFile → возврат строки (имя файла даёт роут).
 * Тексты и порядок строк — 1:1.
 */
import { asc, eq } from "drizzle-orm";

import { DL, ML } from "@philosynth/shared/constants/labels";

import { db } from "../../db/index.js";
import { sections } from "../../db/schema.js";
import { innerText, parseFragment } from "../../utils/html-parser.js";
import { loadExportSynthesis } from "./common.js";

import type { HtmlElement, HtmlNode } from "../../utils/html-parser.js";
import type { ExportSynthesis } from "./common.js";

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function hasClass(el: HtmlElement, cls: string): boolean {
  const c = el.getAttribute("class");
  return !!c && c.split(/\s+/).includes(cls);
}

function asElement(n: HtmlNode): HtmlElement {
  return n as unknown as HtmlElement;
}

/* ── sec2md [18211] ──────────────────────────────────────────────────── */

function sec2md(sec: HtmlElement): string {
  const parts: string[] = [];
  const num = sec.querySelector(".section-num")?.textContent?.trim() || "";
  const title = sec.querySelector(".section-title")?.textContent?.trim() || "";
  if (num || title)
    parts.push(`## ${num}${num && title ? " — " : ""}${title}`);
  const ct = sec.querySelector(".doc-content");
  if (ct) parts.push(node2md(ct));
  const sig = sec.querySelector(".sig-block");
  if (sig) parts.push(sig2md(sig));
  return parts.join("\n\n");
}

/* ── node2md [18225] ─────────────────────────────────────────────────── */

function node2md(node: HtmlElement): string {
  const p: string[] = [];
  for (const c of node.childNodes) {
    if (c.nodeType === TEXT_NODE) {
      const t = c.textContent?.trim();
      if (t) p.push(t);
    } else if (c.nodeType === ELEMENT_NODE) {
      const el = asElement(c);
      const tag = el.tagName.toLowerCase();
      if (tag === "h4") p.push(`\n### ${el.textContent?.trim() ?? ""}`);
      else if (tag === "p") p.push(inline2md(el));
      else if (tag === "ul") {
        for (const li of el.querySelectorAll("li")) p.push(`- ${inline2md(li)}`);
      } else if (tag === "ol") {
        let n = 1;
        for (const li of el.querySelectorAll("li"))
          p.push(`${n++}. ${inline2md(li)}`);
      } else if (tag === "table") p.push(table2md(el));
      else if (hasClass(el, "callout")) {
        const lb = el.querySelector(".callout-label")?.textContent?.trim() || "";
        const tx = innerText(el).replace(lb, "").trim();
        p.push(`> **${lb}** ${tx}`);
      } else {
        const inner = node2md(el);
        if (inner.trim()) p.push(inner);
      }
    }
  }
  return p.join("\n\n");
}

/* ── inline2md [18253] ───────────────────────────────────────────────── */

function inline2md(el: HtmlElement): string {
  let r = "";
  for (const c of el.childNodes) {
    if (c.nodeType === TEXT_NODE) r += c.textContent ?? "";
    else if (c.nodeType === ELEMENT_NODE) {
      const ce = asElement(c);
      const t = ce.tagName.toLowerCase();
      if (t === "strong") r += `**${ce.textContent ?? ""}**`;
      else if (t === "em") r += `*${ce.textContent ?? ""}*`;
      else if (hasClass(ce, "risk")) r += `\`${ce.textContent ?? ""}\``;
      else r += ce.textContent ?? "";
    }
  }
  return r.trim();
}

/* ── table2md [18268] ────────────────────────────────────────────────── */

function table2md(table: HtmlElement): string {
  const rows: string[] = [];
  const hs = Array.from(table.querySelectorAll("thead th")).map(
    (th) => th.textContent?.trim() ?? "",
  );
  if (hs.length) {
    rows.push(`| ${hs.join(" | ")} |`);
    rows.push(`| ${hs.map(() => "---").join(" | ")} |`);
  }
  for (const tr of table.querySelectorAll("tbody tr")) {
    const cs = Array.from(tr.querySelectorAll("td")).map((td) =>
      (inline2md(td) || td.textContent?.trim() || "").replace(/\|/g, "\\|"),
    );
    rows.push(`| ${cs.join(" | ")} |`);
  }
  return rows.join("\n");
}

/* ── sig2md [18283] ──────────────────────────────────────────────────── */

function sig2md(sig: HtmlElement): string {
  return Array.from(sig.querySelectorAll(".sig-party"))
    .map((p) => {
      const n = p.querySelector(".sig-party-name")?.textContent?.trim() || "";
      const r = p.querySelector(".sig-party-role")?.textContent?.trim() || "";
      return `**${n}** *(${r})*\n\n_________________\n*Подпись / Дата*`;
    })
    .join("\n\n---\n\n");
}

/* ── Шапка: три ветки подзаголовка [12126–12139] (двойник subtitleFor
      DocumentHeader 1.6b — дрейф сторожит integration-check 4.2) ─────── */

export function subtitleForExport(s: ExportSynthesis): string {
  const hasPhil = s.philosophers.length > 0;
  const hasConcepts = s.conceptParents.length > 0;
  if (!hasPhil && !hasConcepts) return "Свободный синтез (на основе зерна)";
  if (hasConcepts) {
    const parts: string[] = [];
    if (hasPhil) parts.push(s.philosophers.join(", "));
    parts.push(s.conceptParents.map((p) => p.name).join(", "));
    return "На основе: " + parts.join(" + ");
  }
  return `На основе: ${s.philosophers.join(", ")}`;
}

/** Дата составления — формат заполнения шапки [12110]. */
export function docDateFor(s: ExportSynthesis): string {
  return new Date(s.row.createdAt).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/* ── saveMD [18197] ──────────────────────────────────────────────────── */

/** Ядро на загруженном синтезе + html-разделах (порядок sectionOrder). */
export function buildMD(
  s: ExportSynthesis,
  sectionHtmlInOrder: string[],
): string {
  const lines: string[] = [];
  lines.push(`# ${s.row.title}`);
  lines.push(`\n> ${subtitleForExport(s)}`);
  lines.push(
    `\n---\n\n| Параметр | Значение |\n|---|---|\n| Документ № | ${s.row.docNum || "—"} |\n| Дата | ${docDateFor(s)} |\n| Метод | ${(ML as Record<string, string>)[s.row.method] ?? s.row.method} |\n| Глубина | ${(DL as Record<string, string>)[s.row.depth] ?? s.row.depth} |\n\n---\n`,
  );
  for (const html of sectionHtmlInOrder) {
    const root = parseFragment(html);
    for (const sec of root.querySelectorAll(".doc-section"))
      lines.push(sec2md(sec));
  }
  lines.push(`\n---\n*PhiloSynth Pro™ · Документ сгенерирован Claude AI*`);
  return lines.join("\n");
}

/** exportMD(synthesisId) — Markdown-версия документа. */
export async function exportMD(synthesisId: string): Promise<string> {
  const s = await loadExportSynthesis(synthesisId);
  const rows = await db
    .select()
    .from(sections)
    .where(eq(sections.synthesisId, synthesisId))
    .orderBy(asc(sections.sectionNum));

  const byKey = new Map(rows.map((r) => [r.key, r]));
  const ordered: string[] = [];
  for (const key of s.row.sectionOrder ?? []) {
    if (key === "capsule") continue; // капсула живёт в шапке (1.6b)
    const r = byKey.get(key);
    if (r) {
      ordered.push(r.htmlContent);
      byKey.delete(key);
    }
  }
  // Разделы вне sectionOrder — в хвост (страховка DocumentView 1.6b)
  for (const [key, r] of byKey) {
    if (key !== "capsule") ordered.push(r.htmlContent);
  }

  return buildMD(s, ordered);
}
