/**
 * Клиентский парсинг концепт-файлов PhiloSynth для Unified Concept Pool.
 * Беседа 1.5b (запрос 1).
 *
 * Порты из philosynth.html (браузер — родная среда исходника, DOMParser
 * нативен; серверные адаптации тех же extract-функций живут в
 * server/services/context-extractor.ts и работают с БД — здесь ДРУГОЙ
 * сценарий: разбор ЗАГРУЖЕННОГО standalone-ФАЙЛА, DOM-версии уместны 1:1):
 *  - TITLE_TO_KEY + titleToKey [5413–5466]
 *  - truncateText [8054], tableToText [7994], extractSection [7953]
 *  - extractGlossaryCompact [8021], extractThesesSummary [8057],
 *    extractGraphNodesTable [8092], extractGraphEdgesTable [8137]
 *  - extractContextFragment [8150] — ТОЛЬКО ветки, которые читает
 *    importConceptAsParticipant (9 ключей + graph:nodes_top [8255])
 *  - extractCapsuleText [11720]
 *  - extractMetadata [21356], extractSections [21484],
 *    extractEmbeddedState [21534]
 *  - parseConceptFile [4617–4671]
 *  - importConceptAsParticipant [22009–22176]
 *  - fetchWithFallback + CORS_PROXIES [21227–21273]
 *
 * ОТСТУПЛЕНИЯ (задокументированы по месту):
 *  1. [ЗАКРЫТО беседой 3.2] reconstructGenealogy [22181] и
 *     restoreCapsulesFromHTML [11745] портированы в utils/genealogy.ts;
 *     importConceptAsParticipant теперь заполняет participant.genealogy
 *     (реконструкция + восстановление капсул из .gen-card дерева файла).
 *  2. extractThesesSummary исходника при отсутствии секции возвращает
 *     undefined (нет финального return) — здесь нормализовано к null
 *     (все потребители используют `|| ""`, поведение неотличимо).
 *  3. Ветка capsule:full extractContextFragment (DOC_STATE.capsuleHTML)
 *     не нужна: importConceptAsParticipant читает капсулу по своим трём
 *     приоритетам (embeddedState → meta → DOM), без DOC_STATE.
 */
import {
  REVERSE_DL,
  REVERSE_ML,
  REVERSE_SL,
} from "@philosynth/shared/constants/labels";
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";

import {
  reconstructGenealogy,
  restoreCapsulesFromHTML,
  type GenealogyNode,
} from "./genealogy";

/* ─────────────────────────── Типы ─────────────────────────── */

/** Участник-концепция (возврат importConceptAsParticipant [22150–22175]).
 *  Тип клиентский: серверный аналог появится в meta-synthesis-service
 *  (беседа 3.1, loadConceptContext из БД). */
export interface ConceptParticipant {
  type: "concept";
  name: string;
  capsule: string;
  graphNodes: string;
  graphEdges: string;
  dialogueConcepts: string;
  dialogueSynthesis: string;
  glossaryCompact: string;
  thesesSummary: string;
  goals: string;
  tensions: string;
  portraits: string;
  method: string;
  synthLevel: string;
  seed: string;
  /** Генеалогия участника (reconstructGenealogy + restoreCapsulesFromHTML,
   *  беседа 3.2 — долг TODO(3.1/3.2) закрыт); null — реконструкция
   *  невозможна (не должно случаться для валидного файла) */
  genealogy: GenealogyNode | null;
  /** Переносится из записи пула в syncConceptParticipants [4885] */
  generationOrder?: string;
  /** Только у концепций, добавленных ИЗ КАТАЛОГА (беседа 3.2): id синтеза
   *  в БД — представим в ParticipantInput {type:'synthesis', synthesisId};
   *  файловые концепции поля не имеют (сервер примет их после импорта 4.3) */
  synthesisId?: string;
  // Мета для UI
  _filename: string;
  _nodeCount: number;
  _thesesCount: number;
}

/** Запись пула (возврат parseConceptFile [4655–4670]) */
export interface PoolConceptEntry {
  id: string;
  filename: string;
  rawHTML: string;
  /** Отображаемое имя: «Имя» либо «Концепция» */
  name: string;
  realName: string;
  subtitle: string;
  method: string;
  synthLevel: string;
  generationOrder: string;
  /** «граф», «диалог», «глоссарий», «тезисы» — для мета-строки карточки */
  sources: string[];
  /** Концепция ИЗ КАТАЛОГА (беседа 3.2): id синтеза в БД. Файловые записи
   *  поля не имеют. Каталожная запись: rawHTML="" (◉-предпросмотр
   *  недоступен — просмотр на /synthesis/:id), контекст для промптов
   *  грузит СЕРВЕР (loadConceptContext, беседа 3.1) — у клиента только
   *  метаданные превью. */
  synthesisId?: string;
  participant: ConceptParticipant | null;
  participantError: string | null;
  isSelected: boolean;
  isSynthParticipant: boolean;
  /** Снимок текущего состояния. В сервисе локальное редактирование
   *  просматриваемой концепции невозможно (правки — в БД, беседы 2.x),
   *  поэтому снимки не создаются; поле сохранено структурно —
   *  refreshPoolParticipant идёт по ветке «rawHTML не менялся». */
  snapshot: { html: string } | null;
}

/* ────────────────── titleToKey [5413–5466] ────────────────── */

const TITLE_TO_KEY: Readonly<Record<string, string>> = {
  "исполнительное резюме синтеза": "sum",
  "исполнительное резюме": "sum",
  "граф категорий концепции": "graph",
  "граф категорий и концептуальных связей": "graph",
  "граф категорий": "graph",
  "глоссарий категорий и определений": "glossary",
  "глоссарий терминов": "glossary",
  глоссарий: "glossary",
  "корпус тезисов": "theses",
  "название концепции и его анализ": "name",
  "анализ названия": "name",
  "название концепции": "name",
  "историческая контекстуализация": "history",
  "анализ происхождения": "origin",
  "анализ происхождения и генеалогия идей": "origin",
  "практическое применение": "practical",
  "диалог между традициями": "dialogue",
  "эволюция и перспективы": "evolution",
  "эволюция и перспективы концепции": "evolution",
  "критический анализ": "critique",
  "критический анализ синтеза": "critique",
};

export function titleToKey(titleText: string): string | null {
  const norm = titleText
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^§\s*\d+\s*[-–—]\s*/, ""); // убираем "§ 3 — "

  // 1. Точное совпадение
  const exact = TITLE_TO_KEY[norm];
  if (exact) return exact;

  // 2. Совпадение по вхождению (заголовок может содержать доп. текст)
  for (const [pattern, key] of Object.entries(TITLE_TO_KEY)) {
    if (norm.includes(pattern) || pattern.includes(norm)) return key;
  }

  // 3. Ключевые слова
  const KW: Readonly<Record<string, string>> = {
    резюме: "sum",
    граф: "graph",
    глоссар: "glossary",
    тезис: "theses",
    назван: "name",
    историч: "history",
    происхожден: "origin",
    практическ: "practical",
    диалог: "dialogue",
    эволюц: "evolution",
    критическ: "critique",
  };
  for (const [kw, key] of Object.entries(KW)) {
    if (norm.includes(kw)) return key;
  }

  return null; // не удалось распознать
}

/* ────────── Текстовые хелперы [7953–8090] (DOM-версии) ────────── */

/** innerText на элементе из detached-DOMParser-документа: по спецификации
 *  innerText не-рендерящегося узла = textContent — читаем через каст. */
function innerTextOf(el: Element): string {
  return (el as HTMLElement).innerText ?? el.textContent ?? "";
}

export function truncateText(text: string | null | undefined, maxLen: number): string {
  if (!text || text.length <= maxLen) return text || "";
  const half = Math.floor(maxLen / 2);
  return text.slice(0, half) + "\n[...сокращено...]\n" + text.slice(-half);
}

export function tableToText(table: Element): string {
  const rows: string[] = [];
  const ths = Array.from(table.querySelectorAll("thead th")).map((th) =>
    (th.textContent ?? "").trim(),
  );
  if (ths.length) {
    rows.push(ths.join(" | "));
    rows.push(ths.map(() => "---").join(" | "));
  }
  table.querySelectorAll("tbody tr").forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll("td")).map((td) =>
      (td.textContent ?? "").trim().replace(/\n+/g, " ").replace(/\s{2,}/g, " "),
    );
    rows.push(cells.join(" | "));
  });
  return rows.join("\n");
}

export function extractSection(
  containerEl: Element,
  keyword: string,
): string | null {
  const kw = keyword.toLowerCase();

  // Приоритет 1: ищем <div data-section="..."> с подходящим именем
  const divs = containerEl.querySelectorAll("div[data-section]");
  for (const div of Array.from(divs)) {
    if ((div.getAttribute("data-section") ?? "").toLowerCase().includes(kw)) {
      // Возвращаем весь текстовый контент div-а, включая вложенные h4
      const parts: string[] = [];
      for (const child of Array.from(div.children)) {
        if (child.tagName === "TABLE") {
          parts.push(tableToText(child));
        } else {
          const t = innerTextOf(child).trim();
          if (t) parts.push(t);
        }
      }
      return (
        parts.filter(Boolean).join("\n") || innerTextOf(div).trim() || null
      );
    }
  }

  // Фолбэк: старая логика через h4 (для обратной совместимости)
  const h4s = containerEl.querySelectorAll("h4");
  for (const h4 of Array.from(h4s)) {
    if (!(h4.textContent ?? "").toLowerCase().includes(kw)) continue;
    const parts = [(h4.textContent ?? "").trim()];
    let next = h4.nextElementSibling;
    while (next && next.tagName !== "H4" && !next.hasAttribute("data-section")) {
      if (next.tagName === "TABLE") {
        parts.push(tableToText(next));
      } else {
        const t = innerTextOf(next).trim();
        if (t) parts.push(t);
      }
      next = next.nextElementSibling;
    }
    return parts.filter(Boolean).join("\n");
  }
  return null;
}

export function extractGlossaryCompact(containerEl: Element): string | null {
  const tables = containerEl.querySelectorAll("table.doc-table");
  for (const t of Array.from(tables)) {
    const ths = Array.from(t.querySelectorAll("thead th")).map((th) =>
      (th.textContent ?? "").trim().toLowerCase(),
    );
    // Ищем таблицу, у которой первый столбец содержит "термин"
    if (ths.length >= 2 && (ths[0] ?? "").includes("термин")) {
      const rows: string[] = [];
      const headEls = t.querySelectorAll("thead th");
      const h0 = (headEls[0]?.textContent ?? "").trim() || "Термин";
      const h1 = (headEls[1]?.textContent ?? "").trim() || "Определение";
      rows.push(h0 + " | " + h1);
      rows.push("--- | ---");
      t.querySelectorAll("tbody tr").forEach((tr) => {
        const tds = tr.querySelectorAll("td");
        if (tds.length >= 2) {
          const c0 = (tds[0]?.textContent ?? "").trim().replace(/\n+/g, " ");
          const c1 = (tds[1]?.textContent ?? "")
            .trim()
            .replace(/\n+/g, " ")
            .replace(/\s{2,}/g, " ");
          rows.push(c0 + " | " + c1);
        }
      });
      return "ГЛОССАРИЙ (термины и определения):\n" + rows.join("\n");
    }
  }
  // Фолбэк: если таблица с "термин" не найдена, берём первую таблицу компактно
  const first = tables[0];
  if (first) {
    return "ГЛОССАРИЙ:\n" + tableToText(first);
  }
  return null;
}

export function extractThesesSummary(containerEl: Element): string | null {
  const sec =
    containerEl.querySelector('[data-section*="Сводная таблица"]') ||
    containerEl.querySelector('[data-section*="сводная таблица"]');
  if (sec) {
    const table = sec.querySelector("table.doc-table") || sec.querySelector("table");
    if (table) return "СВОДКА ТЕЗИСОВ:\n" + tableToText(table);
    // Секция есть, но таблицы нет — берём текст секции
    return "СВОДКА ТЕЗИСОВ:\n" + truncateText(innerTextOf(sec).trim(), 3000);
  }
  return null; // отступление 2 шапки: исходник возвращает undefined
}

export function extractGraphNodesTable(containerEl: Element): string | null {
  const tables = containerEl.querySelectorAll("table.doc-table");
  for (const t of Array.from(tables)) {
    const ths = Array.from(t.querySelectorAll("thead th")).map((h) =>
      (h.textContent ?? "").toLowerCase(),
    );
    if (
      ths.some((h) => h.includes("категори")) &&
      ths.some((h) => h.includes("центральност"))
    ) {
      return "ТАБЛИЦА КАТЕГОРИЙ:\n" + tableToText(t);
    }
  }
  return null;
}

export function extractGraphEdgesTable(containerEl: Element): string | null {
  const tables = containerEl.querySelectorAll("table.doc-table");
  for (const t of Array.from(tables)) {
    const ths = Array.from(t.querySelectorAll("thead th")).map((h) =>
      (h.textContent ?? "").toLowerCase(),
    );
    if (
      ths.some((h) => h.includes("источник")) &&
      ths.some((h) => h.includes("цел") || h.includes("направлен"))
    ) {
      return "ТАБЛИЦА СВЯЗЕЙ:\n" + tableToText(t);
    }
  }
  return null;
}

/* ── extractContextFragment [8150] — ветки, нужные пулу ──
 * Диспетчер урезан до 9 ключей, которые читает importConceptAsParticipant
 * [22105–22119]. generated: секция → корневой элемент секции. */

export type PoolCtxKey =
  | "sum:goals"
  | "sum:tensions"
  | "sum:portraits"
  | "graph:nodes_top"
  | "graph:edges"
  | "dialogue:new_concepts"
  | "dialogue:synthesis"
  | "glossary:table"
  | "theses:summary";

export function extractContextFragment(
  contextKey: PoolCtxKey,
  generated: Readonly<Record<string, Element | undefined>>,
): string | null {
  const [section] = contextKey.split(":");
  const el = section ? generated[section] : undefined;
  if (!el) return null;
  switch (contextKey) {
    case "sum:goals":
      return extractSection(el, "цели и метод") || extractSection(el, "цели");
    case "sum:portraits":
      return extractSection(el, "портрет");
    case "sum:tensions":
      return extractSection(el, "напряжени");
    case "graph:edges":
      return extractGraphEdgesTable(el);
    case "glossary:table":
      return extractGlossaryCompact(el);
    case "theses:summary":
      return extractThesesSummary(el);
    case "dialogue:synthesis":
      return extractSection(el, "аналитическ");
    case "dialogue:new_concepts": {
      // Ищем понятия, введённые в диалоге — обычно выделены <strong> или <em>
      // Или берём из «Итоговая таблица диалога»
      const table = extractSection(el, "итогов");
      if (table) return "ПОНЯТИЯ ИЗ ДИАЛОГА:\n" + truncateText(table, 4000);
      // Фолбэк: ищем все <strong> в диалоге
      const strongs = el.querySelectorAll("strong");
      const concepts = Array.from(strongs)
        .map((s) => (s.textContent ?? "").trim())
        .filter((t) => t.length > 5 && t.length < 100);
      if (concepts.length > 0) {
        return "ПОНЯТИЯ ИЗ ДИАЛОГА:\n" + [...new Set(concepts)].join("\n");
      }
      return truncateText(innerTextOf(el).trim(), 3000);
    }
    case "graph:nodes_top": {
      const fullTable = extractGraphNodesTable(el);
      if (!fullTable) return null;
      const rows = fullTable.split("\n");
      if (rows.length <= 3) return fullTable;
      const header = rows.slice(0, 3);
      const dataRows = rows.slice(3);
      const parsed = dataRows.map((row) => {
        const cols = row.split(" | ");
        const cen = parseFloat(cols[3] ?? "") || 0;
        return { row, cen };
      });
      parsed.sort((a, b) => b.cen - a.cen);
      const top = parsed.slice(0, 7).map((p) => p.row);
      return header.concat(top).join("\n");
    }
    default:
      return null;
  }
}

/* ────────────── extractCapsuleText [11720–11739] ────────────── */

export function extractCapsuleText(capsuleHTML: string): string {
  if (!capsuleHTML) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = capsuleHTML;

  // Целимся в содержимое, минуя section-num и section-title
  const target =
    tmp.querySelector('[data-section="Капсула"]') ||
    tmp.querySelector(".doc-content") ||
    tmp;

  const clone = target.cloneNode(true) as Element;
  const h4 = clone.querySelector("h4");
  if (h4) h4.remove();

  return innerTextOf(clone)
    .replace(/^\s*Капсула\s*/i, "")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ────────────── extractMetadata [21356–21408] ────────────── */

export interface ConceptFileMeta {
  phil: string[];
  method: string;
  depth: string;
  synthLevel: string;
  seed: string;
  ctx: string;
  docNum: string;
  capsuleText: string;
  _raw: { methodDisplay: string; depthDisplay: string; synthDisplay: string };
}

export function extractMetadata(doc: Document): ConceptFileMeta {
  const getText = (id: string): string => {
    const el = doc.getElementById(id);
    return el ? (el.textContent ?? "").trim() : "";
  };

  // Философы: из footerPhil или из docSubtitle
  let phil: string[] = [];
  const footerPhil = getText("footerPhil");
  if (footerPhil && footerPhil !== "—") {
    phil = footerPhil.split(/\s*,\s*/).filter(Boolean);
  } else {
    const subtitle = getText("docSubtitle");
    const m = subtitle.match(/На основе:\s*(.+)/i);
    if (m && m[1]) phil = m[1].split(/\s*,\s*/).filter(Boolean);
  }

  // Метод, глубина, уровень — обратный маппинг
  const methodDisplay = getText("docMethod");
  const depthDisplay = getText("docDepth");
  const synthDisplay = getText("docSynthLevel");

  const method = REVERSE_ML[methodDisplay] || "dialectical";
  const depth = REVERSE_DL[depthDisplay] || "standard";
  const synthLevel = REVERSE_SL[synthDisplay] || "comparative";

  // Зерно и общий контекст — из <details class="header-disclosure">
  let seed = "",
    ctx = "";
  const headerExtras = doc.getElementById("docHeaderExtras");
  if (headerExtras) {
    headerExtras
      .querySelectorAll("details.header-disclosure")
      .forEach((det) => {
        const summaryText =
          det.querySelector("summary")?.textContent?.trim()?.toLowerCase() ??
          "";
        const bodyText =
          det.querySelector(".disclosure-body")?.textContent?.trim() ?? "";
        if (summaryText.includes("зерно")) seed = bodyText;
        else if (summaryText.includes("контекст")) ctx = bodyText;
      });
  }

  // Капсула — из header-disclosure-capsule
  let capsuleText = "";
  const capsuleDisc = headerExtras?.querySelector(".header-disclosure-capsule");
  if (capsuleDisc) {
    capsuleText =
      capsuleDisc.querySelector(".disclosure-body")?.textContent?.trim() ?? "";
  }

  const docNum = getText("docNum");

  return {
    phil,
    method,
    depth,
    synthLevel,
    seed,
    ctx,
    docNum,
    capsuleText,
    _raw: { methodDisplay, depthDisplay, synthDisplay },
  };
}

/* ────────────── extractSections [21484–21531] ────────────── */

export interface ExtractedSection {
  key: string;
  num: number;
  title: string;
  html: string;
  secCtx: string;
}

export function extractSections(doc: Document): ExtractedSection[] {
  const sections: ExtractedSection[] = [];

  // Ищем все .doc-body контейнеры внутри #docBodies (или потомки #docOutput)
  const docBodies =
    doc.getElementById("docBodies") || doc.getElementById("docOutput");
  if (!docBodies) return sections;

  // Контейнеры могут быть .doc-body или непосредственно .doc-section
  const sectionEls = docBodies.querySelectorAll(".doc-section");

  sectionEls.forEach((secEl) => {
    const numText =
      secEl.querySelector(".section-num")?.textContent?.trim() ?? "";
    const titleText =
      secEl.querySelector(".section-title")?.textContent?.trim() ?? "";
    const numMatch = numText.match(/§\s*(\d+)/);
    const num = numMatch && numMatch[1] ? parseInt(numMatch[1], 10) : 0;

    const key = titleToKey(titleText);
    if (!key) {
      console.warn(
        "Импорт: не удалось определить ключ для раздела «" +
          titleText +
          "» — пропущен.",
      );
      return;
    }

    // Извлекаем доп. контекст раздела (если есть <details class="sec-disclosure">)
    let secCtx = "";
    // Ищем в родительском .doc-body
    const parentBody = secEl.closest(".doc-body") || secEl.parentElement;
    if (parentBody) {
      const disc = parentBody.querySelector("details.sec-disclosure");
      if (disc) {
        secCtx =
          disc.querySelector(".disclosure-body")?.textContent?.trim() ?? "";
      }
    }

    // HTML всего контейнера (.doc-body), включая disclosure
    const containerHTML = parentBody ? parentBody.innerHTML : secEl.outerHTML;

    sections.push({ key, num, title: titleText, html: containerHTML, secCtx });
  });

  // Сортируем по номеру §
  sections.sort((a, b) => a.num - b.num);

  return sections;
}

/* ──────────── extractEmbeddedState [21534–21543] ──────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractEmbeddedState(doc: Document): any | null {
  const stateEl = doc.getElementById("philosynth-state");
  if (!stateEl) return null;
  try {
    return JSON.parse(stateEl.textContent ?? "");
  } catch (e) {
    console.warn("Не удалось распарсить встроенное состояние:", e);
    return null;
  }
}

/* ──────── importConceptAsParticipant [22009–22176] ────────
 * Возвращает участника либо null (пользователь отменил confirm мягких
 * предупреждений); непригодность — throw Error (как в исходнике). */

export function importConceptAsParticipant(
  htmlString: string,
  filename: string,
): ConceptParticipant | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");

  // ── 1. Проверка: это PhiloSynth-документ ──
  const docOutput = doc.getElementById("docOutput");
  if (!docOutput) throw new Error("Не найден #docOutput. Это не файл PhiloSynth.");

  // ── 2. Извлечение метаданных и embedded state ──
  const meta = extractMetadata(doc);
  const embeddedState = extractEmbeddedState(doc);

  // ── 3. Извлечение разделов ──
  const sections = extractSections(doc);
  const sectionKeys = new Set(sections.map((s) => s.key));

  // ── 4. Проверка обязательных разделов ──
  const required = ["sum", "glossary", "theses", "critique"];
  const missing = required.filter((k) => !sectionKeys.has(k));

  const hasGraph = sectionKeys.has("graph");
  const hasDialogue = sectionKeys.has("dialogue");
  if (!hasGraph && !hasDialogue) {
    missing.push("graph или dialogue");
  }

  const hasCapsule = !!(
    meta.capsuleText ||
    embeddedState?.capsuleHTML ||
    doc.querySelector(".header-disclosure-capsule")
  );
  if (!hasCapsule) missing.push("capsule");

  if (missing.length > 0) {
    throw new Error(
      "Концепция не пригодна для мета-синтеза. Отсутствуют разделы: " +
        missing
          .map(
            (k) =>
              "«" + ((KEY_LABELS as Record<string, string>)[k] || k) + "»",
          )
          .join(", ") +
        ". Откройте документ, добавьте недостающие разделы и сохраните заново.",
    );
  }

  // Мягкие предупреждения (не блокируют импорт)
  const warnings: string[] = [];
  if (!hasGraph) warnings.push("нет графа категорий");
  if (!hasDialogue) warnings.push("нет диалога");

  if (warnings.length > 0) {
    const ok = window.confirm(
      "Концепция импортируется с неполным набором разделов:\n" +
        "— " +
        warnings.join("\n— ") +
        "\n\n" +
        "Для максимального качества мета-синтеза рекомендуется " +
        "включить галочку «Пригодность к синтезу» и догенерировать " +
        "недостающие разделы.\n\nИмпортировать как есть?",
    );
    if (!ok) return null;
  }

  // ── 5. Извлечение контекста для промптов ──
  const docBodies = doc.getElementById("docBodies") || docOutput;

  // Строим маппинг секция → DOM-элемент
  const generated: Record<string, Element | undefined> = {};
  const bodyEls = docBodies.querySelectorAll(".doc-body[data-section-key]");
  for (const el of Array.from(bodyEls)) {
    const keys = (el.getAttribute("data-section-key") ?? "").split("+");
    for (const key of keys) {
      generated[key] = el;
    }
  }
  // Если нет data-section-key, пробуем через .doc-section
  if (Object.keys(generated).length === 0) {
    for (const sec of sections) {
      const els = docBodies.querySelectorAll(".doc-section");
      for (const el of Array.from(els)) {
        const title =
          el.querySelector(".section-title")?.textContent ?? "";
        if (titleToKey(title) === sec.key) {
          generated[sec.key] = el.closest(".doc-body") || el;
        }
      }
    }
  }

  // Извлечение конкретных фрагментов
  const capsuleText = (() => {
    // Приоритет 1: embedded state содержит полный HTML капсулы
    if (embeddedState?.capsuleHTML) {
      return extractCapsuleText(embeddedState.capsuleHTML as string);
    }
    // Приоритет 2: meta.capsuleText — уже текст из disclosure-body шапки
    if (meta.capsuleText) {
      return meta.capsuleText
        .replace(/^\s*Капсула\s*/i, "")
        .replace(/\n\s+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    // Приоритет 3: disclosure-body в шапке импортируемого документа
    const capsuleDisc = doc.querySelector(
      ".header-disclosure-capsule .disclosure-body",
    );
    if (capsuleDisc) {
      return (capsuleDisc.textContent ?? "")
        .replace(/^\s*Капсула\s*/i, "")
        .trim();
    }
    return "";
  })();

  // Граф (если есть)
  const graphNodes = extractContextFragment("graph:nodes_top", generated) || "";
  const graphEdges = extractContextFragment("graph:edges", generated) || "";

  // Диалог (если есть)
  const dialogueConcepts =
    extractContextFragment("dialogue:new_concepts", generated) || "";
  const dialogueSynthesis =
    extractContextFragment("dialogue:synthesis", generated) || "";

  // Общие (всегда)
  const glossaryCompact =
    extractContextFragment("glossary:table", generated) || "";
  const thesesSummary =
    extractContextFragment("theses:summary", generated) || "";
  const goals = extractContextFragment("sum:goals", generated) || "";
  const tensions = extractContextFragment("sum:tensions", generated) || "";
  const portraits = extractContextFragment("sum:portraits", generated) || "";

  // Подсчёт статистик для карточки
  const nodeCount = (graphNodes.match(/\n/g) || []).length - 1; // строки минус заголовок
  const thesesCount = (thesesSummary.match(/^\d+\./gm) || []).length;

  // ── 6. Извлечение названия ──
  const nameEl = doc.getElementById("docTitle");
  let conceptName = nameEl?.textContent?.trim() ?? "";
  if (conceptName === "Синтез Философской Концепции") conceptName = "";
  // Пустое имя — не ошибка; запросим при добавлении

  // ── 7. Реконструкция генеалогии (беседа 3.2 — долг закрыт) ──
  // reconstructGenealogy [22181]: embeddedState.genealogy при наличии,
  // иначе реконструкция из meta/participants; restoreCapsulesFromHTML
  // [11745]: капсулы родителей — из .gen-card сохранённого дерева файла.
  let genealogy: GenealogyNode | null = null;
  try {
    genealogy = reconstructGenealogy(meta, embeddedState, doc);
    restoreCapsulesFromHTML(genealogy, doc);
  } catch (err) {
    console.warn("Не удалось реконструировать генеалогию:", err);
    genealogy = null;
  }

  // ── 8. Сборка участника ──
  return {
    type: "concept",
    name: conceptName,
    capsule: capsuleText,
    graphNodes,
    graphEdges,
    dialogueConcepts,
    dialogueSynthesis,
    glossaryCompact,
    thesesSummary,
    goals,
    tensions,
    portraits,
    method: meta.method,
    synthLevel: meta.synthLevel,
    seed: meta.seed || "",
    genealogy,
    // Мета для UI
    _filename: filename,
    _nodeCount: nodeCount,
    _thesesCount: thesesCount,
  };
}

/* ───────────── parseConceptFile [4617–4671] ───────────── */

export function parseConceptFile(
  htmlString: string,
  filename: string,
): PoolConceptEntry {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");
  if (!doc.getElementById("docOutput"))
    throw new Error("Не найден #docOutput. Это не файл PhiloSynth.");

  const meta = extractMetadata(doc);
  extractSections(doc); // как в исходнике: результат не используется здесь
  const embeddedState = extractEmbeddedState(doc);
  const subtitle =
    doc.getElementById("docSubtitle")?.textContent?.trim() ?? "";

  const realName = doc.getElementById("docTitle")?.textContent?.trim() ?? "";
  const isDefaultTitle =
    !realName || realName === "Синтез Философской Концепции";
  const displayName = isDefaultTitle ? "Концепция" : "«" + realName + "»";

  const generationOrder: string =
    (embeddedState?.params?.generationOrder as string | undefined) ?? "";

  // Проверяем пригодность к мета-синтезу
  let participant: ConceptParticipant | null = null;
  let participantError: string | null = null;
  try {
    const result = importConceptAsParticipant(htmlString, filename);
    if (result) participant = result;
    else participantError = "Импорт для синтеза отменён";
  } catch (err) {
    participantError = err instanceof Error ? err.message : String(err);
  }

  // Источники контекста для мета-строки карточки
  const sources: string[] = [];
  if (participant) {
    if (participant.graphNodes) sources.push("граф");
    if (participant.dialogueConcepts) sources.push("диалог");
    if (participant.glossaryCompact) sources.push("глоссарий");
    if (participant.thesesSummary) sources.push("тезисы");
  }

  return {
    id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    filename,
    rawHTML: htmlString,
    name: displayName,
    realName: isDefaultTitle ? "" : realName,
    subtitle,
    method: meta.method,
    synthLevel: meta.synthLevel,
    generationOrder,
    sources,
    participant,
    participantError,
    isSelected: false,
    isSynthParticipant: false,
    snapshot: null,
  };
}

/* ───── catalogPreviewToPoolEntry (беседа 3.2, запрос 1, п. 1) ─────
 * Каталожная концепция → запись пула. В исходнике аналога нет (пул был
 * файловым); в сервисе синтезы уже лежат в БД — участник представим в
 * ParticipantInput {type:'synthesis', synthesisId}, а контекст для
 * промптов грузит СЕРВЕР (loadConceptContext, 3.1). Клиентский
 * participant заполняется пустыми строками — контентные поля ему не
 * нужны (FullBudgetPreview для каталожных концепций считает не по
 * символам, а по серверному estimate-diff); genealogy = null —
 * пересечения предков проверяются через GET /lineage/ancestors. */

export function catalogPreviewToPoolEntry(preview: {
  id: string;
  title: string;
  method: string;
  synthLevel: string;
}): PoolConceptEntry {
  const participant: ConceptParticipant = {
    type: "concept",
    name: preview.title,
    capsule: "",
    graphNodes: "",
    graphEdges: "",
    dialogueConcepts: "",
    dialogueSynthesis: "",
    glossaryCompact: "",
    thesesSummary: "",
    goals: "",
    tensions: "",
    portraits: "",
    method: preview.method,
    synthLevel: preview.synthLevel,
    seed: "",
    genealogy: null,
    synthesisId: preview.id,
    _filename: "catalog:" + preview.id,
    _nodeCount: 0,
    _thesesCount: 0,
  };
  return {
    id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    filename: "catalog:" + preview.id, // дедупликация addToPool по filename
    rawHTML: "",
    name: "«" + preview.title + "»",
    realName: preview.title,
    subtitle: "",
    method: preview.method,
    synthLevel: preview.synthLevel,
    generationOrder: "",
    sources: ["каталог"],
    synthesisId: preview.id,
    participant,
    participantError: null,
    isSelected: false,
    isSynthParticipant: true, // добавили из каталога — сразу ☑ участник
    snapshot: null,
  };
}

/* ─────── fetchWithFallback + CORS_PROXIES [21227–21273] ───────
 * statusEl исходника заменён колбэком onStatus (React без DOM-рефов). */

const CORS_PROXIES: ReadonlyArray<(url: string) => string> = [
  (url) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
  (url) => "https://corsproxy.io/?" + encodeURIComponent(url),
];

export async function fetchWithFallback(
  url: string,
  onStatus?: (text: string) => void,
): Promise<string> {
  // ── 1. Прямой fetch ──
  try {
    onStatus?.("Прямая загрузка...");
    const resp = await fetch(url, {
      mode: "cors",
      headers: { Accept: "text/html" },
    });
    if (resp.ok) {
      const text = await resp.text();
      if (text && text.includes("<")) return text;
    }
  } catch (e) {
    // CORS или сетевая ошибка — продолжаем к прокси
    console.log(
      "Прямой fetch не удался:",
      e instanceof Error ? e.message : e,
    );
  }

  // ── 2. CORS-прокси (по порядку) ──
  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const proxy = CORS_PROXIES[i];
    if (!proxy) continue;
    const proxyUrl = proxy(url);
    try {
      onStatus?.(`Прокси ${i + 1}/${CORS_PROXIES.length}...`);
      const resp = await fetch(proxyUrl);
      if (resp.ok) {
        const text = await resp.text();
        if (text && text.includes("<")) return text;
      }
    } catch (e) {
      console.log(
        `Прокси ${i + 1} не удался:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  // ── 3. Все попытки исчерпаны ──
  throw new Error(
    "Не удалось загрузить: сервер блокирует кросс-доменные запросы. " +
      "Скачайте файл вручную (Ctrl+S на странице) и загрузите через кнопку «↑ Файл».",
  );
}
