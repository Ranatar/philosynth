/**
 * Import Service — беседа 4.3 (03-spec §1.9/§2.2 POST /syntheses/import;
 * 02-data-model §4; карта 04 §2.6).
 *
 * Порт importHTML [21282] → extractMetadata [21356] → validateImportMeta
 * [21416] → extractSections [21484] → extractEmbeddedState [21534] →
 * extractModesFromHTML [21550] → buildDocStateFromImport [21661] на
 * серверном DOM (linkedom через utils/html-parser — инвариант 1.3) и БД
 * вместо DOC_STATE. populateFromImport [21591] — DOM-рендер, на сервере
 * вырожден: его данные — это поля syntheses (title/docNum/totals) и
 * секции; отображение — клиент (SynthesisPage 1.6b).
 *
 * ДВА ВХОДНЫХ ФОРМАТА:
 *  - standalone-файл philosynth.html (saveHTML исходника [18003]):
 *    шапка с id (#docTitle/#docMethod/#footerPhil/#docHeaderExtras),
 *    embedded state version:2 c genLog-полями `cost`/`error`, маркерами
 *    `type` через дефис ('version-marker'), метаданными россыпью в
 *    записи (без объекта metadata) и без createdAt (у маркеров —
 *    timestamp);
 *  - экспорт сервиса (html-exporter 4.2): шапка ПО КЛАССАМ без id
 *    (.doc-title/.doc-subtitle/.doc-meta-grid — зеркало DocumentHeader),
 *    embedded state version:2 с полями-колонками (costUsd/errorMessage/
 *    metadata/createdAt).
 *
 * АДАПТАЦИИ (задокументированные отступления от буквы порта):
 *  1. extractMetadata: чтение по id (standalone), fallback — классы
 *     серверного экспорта (.doc-title, .doc-subtitle, .doc-meta-grid по
 *     русским подписям, disclosures внутри .doc-header). Протокол 07
 *     адаптацию не оговаривает — дыра доков, фиксируется по завершении.
 *  2. extractSections: в html_content кладётся outerHTML самого
 *     .doc-section (исходник брал parentBody.innerHTML — тот в экспорте
 *     4.2 содержит якорь <a id="sec-…"> и кнопку «▦ Граф категорий»,
 *     которые загрязнили бы переэкспорт и рендер SPA). sec-disclosure
 *     по-прежнему ищется в родительском .doc-body (standalone-файлы);
 *     экспорт 4.2 sec-disclosure не пишет — secCtx восстанавливается из
 *     embedded params.secCtx (порт слияния buildDocStateFromImport).
 *  3. confirm() при критических предупреждениях [21327] — браузерный;
 *     сервис импортирует всегда, критичность уходит клиенту в warnings
 *     (кнопки «Подтвердить/Отмена» — ImportPage ДО отправки). Аналога
 *     DOC_STATE.incomplete в схеме нет — гейт «неполный документ»
 *     остаётся долгом (2.3 адресовала его 6.1/4.3; см. ревью беседы).
 *  4. reconstructGenealogy: концепции среди embedded participants
 *     распознаются по type !== 'philosopher' — сервис пишет участников
 *     type='synthesis' (конвенция isConceptParticipant 3.1), исходник —
 *     'concept'; принимаются оба. synthesisId участника сохраняется в
 *     узле — по нему строится synthesis_lineage.
 *  5. synthesis_lineage — первый слой генеалогии: философы по имени,
 *     концепции-родители — ТОЛЬКО при валидном существующем synthesisId
 *     (файловые концепции без записи в БД дают предупреждение — глубокое
 *     дерево файла живёт лишь в embedded state и в БД не персистится:
 *     модели lineage для него недостаточно).
 *  6. Разделы-дубликаты по key: UNIQUE(synthesis_id, key) — первый
 *     побеждает, повтор уходит в warnings (исходник складывал все в
 *     DOM, dbIdx перетирался последним).
 *  7. Ключи разделов, извлечённые из файла, но отсутствующие во
 *     встроенном sectionOrder, дописываются в хвост порядка (исходник
 *     оставлял их видимыми в DOM вне sectionOrder; в сервисе рендер идёт
 *     по sectionOrder — иначе разделы стали бы невидимы).
 *  8. Восстановленным mode_results токены/стоимость ставятся в 0 —
 *     ни standalone, ни экспорт 4.2 их в файл не пишут.
 *  9. Квирк капсулы сохранён [21806]: capsule_html собирается из ТЕКСТА
 *     шапки (`meta.capsuleText`) обёрткой doc-section — HTML-форматирование
 *     капсулы при roundtrip теряется. Ветка `embeddedState.capsuleHTML`
 *     [21793] для файлов version:2 обеих линий МЕРТВА (ни один saveHTML
 *     capsuleHTML в state не пишет) — порт сохранён на случай старых
 *     файлов.
 *
 * Серверные копии клиентских утилит (карта 04 §2.6/§1.7: «серверная
 * копия — беседа 4.3»): TITLE_TO_KEY/titleToKey (client/utils/
 * concept-file.ts), isPlaceholderConceptName/resolveConceptName (FIX
 * \w→[а-яё])/normalizeGenealogyNames/restoreCapsulesFromHTML/
 * reconstructGenealogy (client/utils/genealogy.ts). Дрейф двойников —
 * кандидат в integration-check (блок завершения беседы).
 */
import { eq } from "drizzle-orm";

import { REVERSE_DL, REVERSE_ML, REVERSE_SL } from "@philosynth/shared/constants/labels";
import { parseVersion } from "@philosynth/shared/utils/version";

import { db } from "../db/index.js";
import {
  contextLog,
  generationLog,
  modeResults,
  sections,
  syntheses,
  synthesisLineage,
} from "../db/schema.js";
import {
  parseDocument,
  type HtmlDocument,
  type HtmlElement,
} from "../utils/html-parser.js";
import {
  parseGraphFromHTML,
  saveGraphToDb,
} from "./graph-parser.js";
import {
  parseGlossaryFromHTML,
  parseThesesFromHTML,
  saveElementsToDb,
} from "./element-parser.js";

import type {
  ContextEntry as ContextLogEntry,
  ParentSpecLog,
} from "@philosynth/shared/types/generation";
import type {
  Depth,
  ImportWarning,
  PausedState,
  SynthesisMethod,
  SynthLevel,
} from "@philosynth/shared/types/synthesis";

/* ══ Ошибка импорта (03 §4.3 IMPORT_INVALID) ══════════════════════════ */

export class ImportError extends Error {
  readonly code = "IMPORT_INVALID";
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

/* ══ titleToKey — серверная копия client/utils/concept-file.ts ════════
   Порт TITLE_TO_KEY + titleToKey [5413–5466] (дословно клиентской). */

const TITLE_TO_KEY: Readonly<Record<string, string>> = {
  "исполнительное резюме синтеза": "sum",
  "исполнительное резюме": "sum",
  "граф категорий концепции": "graph",
  "граф категорий и концептуальных связей": "graph",
  "граф категорий": "graph",
  "глоссарий категорий и определений": "glossary",
  "глоссарий терминов": "glossary",
  "глоссарий": "glossary",
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
    "резюме": "sum",
    "граф": "graph",
    "глоссар": "glossary",
    "тезис": "theses",
    "назван": "name",
    "историч": "history",
    "происхожден": "origin",
    "практическ": "practical",
    "диалог": "dialogue",
    "эволюц": "evolution",
    "критическ": "critique",
  };
  for (const [kw, key] of Object.entries(KW)) {
    if (norm.includes(kw)) return key;
  }

  return null; // не удалось распознать
}

/* ══ Генеалогия — серверные копии client/utils/genealogy.ts ═══════════ */

/** Узел genealogy-дерева (embeddedState.genealogy; = клиентскому). */
export interface GenealogyNode {
  type: "concept" | "philosopher";
  name: string;
  method?: string;
  synthLevel?: string;
  generationOrder?: string;
  seed?: string;
  capsule?: string;
  participants?: GenealogyNode[];
  /** id концепции в БД сервиса (экспорт 4.2 пишет его у родителей) */
  synthesisId?: string;
}

/** Порт isPlaceholderConceptName [22228–22237]. */
export function isPlaceholderConceptName(s: string | null | undefined): boolean {
  if (!s) return true;
  const t = String(s).trim();
  if (!t) return true;
  if (t === "?" || t === "—" || t === "-") return true;
  if (t.toLowerCase() === "синтез философской концепции") return true;
  if (t.toLowerCase() === "импортированный документ") return true;
  return false;
}

/** Заголовок документа: #docTitle (standalone) → .doc-title (экспорт 4.2). */
function readDocTitle(doc: HtmlDocument): string {
  return (
    doc.getElementById("docTitle")?.textContent?.trim() ||
    doc.querySelector(".doc-title")?.textContent?.trim() ||
    ""
  );
}

/**
 * Порт resolveConceptName [22248–22286] (серверная копия клиентского,
 * FIX \w→[а-яё] сохранён). АДАПТАЦИЯ: контейнер раздела «name» ищется
 * (а) по data-section-key (standalone), (б) fallback — по .section-title
 * через titleToKey (экспорт 4.2 data-section-key на .doc-body не пишет).
 */
export function resolveConceptName(doc: HtmlDocument): string | null {
  const rawTitle = readDocTitle(doc);
  if (!isPlaceholderConceptName(rawTitle)) return rawTitle;

  // (а) секции помечены data-section-key (standalone)
  let nameContainer: HtmlElement | null = null;
  for (const el of doc.querySelectorAll(".doc-body[data-section-key]")) {
    const keys = (el.getAttribute("data-section-key") || "").split("+");
    if (keys.includes("name")) {
      nameContainer = el;
      break;
    }
  }
  // (б) fallback: раздел, чей заголовок распознаётся как 'name'
  if (!nameContainer) {
    for (const sec of doc.querySelectorAll(".doc-section")) {
      const title = sec.querySelector(".section-title")?.textContent?.trim() ?? "";
      if (title && titleToKey(title) === "name") {
        nameContainer = sec.closest(".doc-body") ?? sec;
        break;
      }
    }
  }
  if (!nameContainer) return null;

  const divs = nameContainer.querySelectorAll("div[data-section]");
  let recSection: HtmlElement | null = null;
  for (const div of divs) {
    const sec = (div.getAttribute("data-section") || "").toLowerCase();
    if (sec.includes("итогов") || sec.includes("рекоменд")) {
      recSection = div;
      break;
    }
  }
  const strong = recSection
    ? recSection.querySelector("strong")
    : nameContainer.querySelector("strong");
  let nameText = strong?.textContent?.trim() || "";
  if (!nameText) return null;
  nameText = nameText
    // FIX \w → [а-яё] (кириллица; латентный баг регекспа исходника)
    .replace(
      /^(?:итогов[а-яё]+\s+рекомендаци[а-яё]*|рекомендуем[а-яё]+\s+названи[а-яё]*|названи[а-яё]+\s*концепци[а-яё]*)\s*[:：]\s*/i,
      "",
    )
    .replace(/^[«""]|[»""]$/g, "")
    .split(/\s*[:：]\s*/)[0]!
    .trim();
  return nameText || null;
}

/** Порт normalizeGenealogyNames [22298–22315] (серверная копия). */
export function normalizeGenealogyNames(
  node: GenealogyNode | null,
  fallbackName: string | null,
): GenealogyNode | null {
  if (!node) return null;
  if (node.type === "philosopher") return { ...node };
  const copy: GenealogyNode = { ...node };
  if (isPlaceholderConceptName(copy.name)) {
    copy.name =
      fallbackName && !isPlaceholderConceptName(fallbackName)
        ? fallbackName
        : "[безымянная концепция]";
  }
  if (copy.participants) {
    copy.participants = copy.participants
      .map((p) =>
        p && p.type === "philosopher" ? { ...p } : normalizeGenealogyNames(p, null),
      )
      .filter((p): p is GenealogyNode => p !== null);
  }
  return copy;
}

/**
 * Порт restoreCapsulesFromHTML [11745–11770] (серверная копия):
 * капсулы родительских концепций — из .gen-card-capsule-body сохранённого
 * дерева генеалогии файла. МУТИРУЕТ node (как исходник).
 */
export function restoreCapsulesFromHTML(
  node: GenealogyNode | null,
  doc: HtmlDocument,
): void {
  if (!node || node.type === "philosopher") return;

  const capsuleMap: Record<string, string> = {};
  for (const card of doc.querySelectorAll(".gen-card")) {
    const nameEl = card.querySelector(".gen-card-name");
    const capsuleBody = card.querySelector(".gen-card-capsule-body");
    if (nameEl && capsuleBody) {
      // Имя без префикса "◈ "
      const name = (nameEl.textContent ?? "").replace(/^◈\s*/, "").trim();
      capsuleMap[name] = capsuleBody.textContent ?? "";
    }
  }

  function fill(n: GenealogyNode | null | undefined): void {
    if (!n || n.type === "philosopher") return;
    const cap = capsuleMap[n.name];
    if (!n.capsule && cap) n.capsule = cap;
    if (n.participants) n.participants.forEach(fill);
  }
  if (node.participants) node.participants.forEach(fill);
}

/**
 * Порт reconstructGenealogy [22181–22220] (серверная копия клиентского
 * client/utils/genealogy.ts). АДАПТАЦИЯ 4: концепции среди embedded
 * participants — по type !== 'philosopher' (принимает и 'concept'
 * исходника, и 'synthesis' сервиса); synthesisId сохраняется в узле.
 */
export function reconstructGenealogy(
  meta: ImportMeta,
  embeddedState: EmbeddedState | null,
  doc: HtmlDocument,
): GenealogyNode {
  // Если в embedded state уже есть genealogy — используем
  if (embeddedState?.genealogy) return embeddedState.genealogy as GenealogyNode;

  // Иначе реконструируем из метаданных: участники — философы из meta.phil
  const participants: GenealogyNode[] = (meta.phil || []).map((name) => ({
    type: "philosopher",
    name,
  }));

  // Настоящее имя: docTitle → раздел «name» → явный плейсхолдер (защита
  // от транзитивного распространения дефолта через метасинтез)
  const resolvedName = resolveConceptName(doc) || "[безымянная концепция]";

  // Если в embedded state есть participants — используем их
  if (embeddedState?.participants) {
    return {
      type: "concept",
      name: resolvedName,
      method: meta.method ?? "",
      synthLevel: meta.synthLevel ?? "",
      seed: meta.seed || "",
      participants: (embeddedState.participants as EmbeddedParticipant[]).map(
        (p): GenealogyNode =>
          p.type !== "philosopher"
            ? ((p.genealogy as GenealogyNode | null | undefined) ?? {
                type: "concept",
                name: p.name,
                ...(typeof p.synthesisId === "string"
                  ? { synthesisId: p.synthesisId }
                  : {}),
              })
            : { type: "philosopher", name: p.name },
      ),
    };
  }

  return {
    type: "concept",
    name: resolvedName,
    method: meta.method ?? "",
    synthLevel: meta.synthLevel ?? "",
    seed: meta.seed || "",
    participants,
  };
}

/* ══ Метаданные шапки ═════════════════════════════════════════════════ */

export interface ImportMeta {
  phil: string[];
  method: SynthesisMethod;
  depth: Depth;
  synthLevel: SynthLevel;
  seed: string;
  ctx: string;
  docNum: string;
  capsuleText: string;
  _raw: { methodDisplay: string; depthDisplay: string; synthDisplay: string };
}

/**
 * Порт extractMetadata [21356–21407]. АДАПТАЦИЯ 1: fallback'и для
 * экспорта 4.2 (без id): .doc-subtitle, .doc-meta-grid по русским
 * подписям, disclosures внутри .doc-header; «—» плейсхолдеры значений
 * meta-grid трактуются как пусто.
 */
export function extractMetadata(doc: HtmlDocument): ImportMeta {
  const getText = (id: string): string =>
    doc.getElementById(id)?.textContent?.trim() ?? "";

  // Подписи meta-grid экспорта 4.2 (renderDocHeader) → значения
  const metaGrid: Record<string, string> = {};
  for (const item of doc.querySelectorAll(".doc-meta-item")) {
    const k = item.querySelector(".doc-meta-key")?.textContent?.trim();
    const v = item.querySelector(".doc-meta-val")?.textContent?.trim() ?? "";
    if (k) metaGrid[k] = v === "—" ? "" : v;
  }

  // Философы: из footerPhil или из docSubtitle (fallback — .doc-subtitle)
  let phil: string[] = [];
  const footerPhil = getText("footerPhil");
  if (footerPhil && footerPhil !== "—") {
    phil = footerPhil.split(/\s*,\s*/).filter(Boolean);
  } else {
    const subtitle =
      getText("docSubtitle") ||
      doc.querySelector(".doc-subtitle")?.textContent?.trim() ||
      "";
    const m = subtitle.match(/На основе:\s*(.+)/i);
    if (m?.[1]) phil = m[1].split(/\s*,\s*/).filter(Boolean);
  }

  // Метод, глубина, уровень — обратный маппинг
  const methodDisplay = getText("docMethod") || metaGrid["Метод синтеза"] || "";
  const depthDisplay = getText("docDepth") || metaGrid["Глубина"] || "";
  const synthDisplay =
    getText("docSynthLevel") || metaGrid["Уровень синтеза"] || "";

  const method: SynthesisMethod = REVERSE_ML[methodDisplay] || "dialectical";
  const depth: Depth = REVERSE_DL[depthDisplay] || "standard";
  const synthLevel: SynthLevel = REVERSE_SL[synthDisplay] || "comparative";

  // Зерно и общий контекст — из <details class="header-disclosure">.
  // Standalone: #docHeaderExtras; экспорт 4.2 — прямо в .doc-header.
  let seed = "";
  let ctx = "";
  const headerExtras =
    doc.getElementById("docHeaderExtras") ?? doc.querySelector(".doc-header");
  if (headerExtras) {
    for (const det of headerExtras.querySelectorAll("details.header-disclosure")) {
      const summaryText =
        det.querySelector("summary")?.textContent?.trim()?.toLowerCase() || "";
      const bodyText =
        det.querySelector(".disclosure-body")?.textContent?.trim() || "";
      if (summaryText.includes("зерно")) seed = bodyText;
      else if (summaryText.includes("контекст")) ctx = bodyText;
    }
  }

  // Капсула — из header-disclosure-capsule
  let capsuleText = "";
  const capsuleDisc = headerExtras?.querySelector(".header-disclosure-capsule");
  if (capsuleDisc) {
    capsuleText =
      capsuleDisc.querySelector(".disclosure-body")?.textContent?.trim() || "";
  }

  const docNum = getText("docNum") || metaGrid["Документ №"] || "";

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

/* ══ Валидация метаданных ═════════════════════════════════════════════ */

/** Порт validateImportMeta [21416–21478] — тексты дословно. */
export function validateImportMeta(
  meta: ImportMeta,
  embeddedState: EmbeddedState | null,
): ImportWarning[] {
  const warnings: ImportWarning[] = [];

  if (!meta.phil || meta.phil.length === 0) {
    warnings.push({
      field: "phil",
      message:
        "Список философов не найден. Перегенерация разделов невозможна без него.",
      critical: true,
    });
  }

  const methodDisplay = meta._raw?.methodDisplay || "";
  const depthDisplay = meta._raw?.depthDisplay || "";
  const synthDisplay = meta._raw?.synthDisplay || "";

  if (!methodDisplay || !REVERSE_ML[methodDisplay]) {
    warnings.push({
      field: "method",
      message: `Метод синтеза не распознан (найдено: «${methodDisplay || "—"}»). Подставлен «Диалектический» по умолчанию.`,
      critical: false,
    });
  }

  if (!depthDisplay || !REVERSE_DL[depthDisplay]) {
    warnings.push({
      field: "depth",
      message: `Глубина не распознана (найдено: «${depthDisplay || "—"}»). Подставлена «Стандартная» по умолчанию.`,
      critical: false,
    });
  }

  if (!synthDisplay || !REVERSE_SL[synthDisplay]) {
    warnings.push({
      field: "synthLevel",
      message: `Уровень синтеза не распознан (найдено: «${synthDisplay || "—"}»). Подставлен «Сравнительный» по умолчанию.`,
      critical: false,
    });
  }

  if (!embeddedState) {
    warnings.push({
      field: "log",
      message:
        "Лог контекста и генерации отсутствует. История стоимости и контекстных зависимостей недоступна. " +
        "Лог начнёт накапливаться заново при редактировании.",
      critical: false,
    });
  }

  return warnings;
}

/* ══ Разделы ══════════════════════════════════════════════════════════ */

export interface ImportedSection {
  key: string;
  num: number;
  title: string;
  html: string;
  secCtx: string;
}

/**
 * Порт extractSections [21484–21529]. АДАПТАЦИЯ 2: html = outerHTML
 * самого .doc-section (см. шапку модуля). Нераспознанные заголовки —
 * console.warn (порт) + предупреждение в warnings (сервер молчать не
 * должен — пользователь alert'ов не видит).
 */
export function extractSections(
  doc: HtmlDocument,
  warnings?: ImportWarning[],
): ImportedSection[] {
  const result: ImportedSection[] = [];

  // Ищем все .doc-section внутри #docBodies (или потомки #docOutput)
  const docBodies =
    doc.getElementById("docBodies") ?? doc.getElementById("docOutput");
  if (!docBodies) return result;

  for (const secEl of docBodies.querySelectorAll(".doc-section")) {
    const numText = secEl.querySelector(".section-num")?.textContent?.trim() || "";
    const titleText =
      secEl.querySelector(".section-title")?.textContent?.trim() || "";
    const numMatch = numText.match(/§\s*(\d+)/);
    const num = numMatch?.[1] ? parseInt(numMatch[1], 10) : 0;

    const key = titleToKey(titleText);
    if (!key) {
      console.warn(
        "Импорт: не удалось определить ключ для раздела «" +
          titleText +
          "» — пропущен.",
      );
      warnings?.push({
        field: "sections",
        message: `Не удалось определить ключ для раздела «${titleText}» — раздел пропущен.`,
        critical: false,
      });
      continue;
    }

    // Доп. контекст раздела (<details class="sec-disclosure"> в .doc-body)
    let secCtx = "";
    const parentBody = secEl.closest(".doc-body");
    if (parentBody) {
      const disc = parentBody.querySelector("details.sec-disclosure");
      if (disc) {
        secCtx = disc.querySelector(".disclosure-body")?.textContent?.trim() || "";
      }
    }

    result.push({ key, num, title: titleText, html: secEl.outerHTML, secCtx });
  }

  // Сортируем по номеру §
  result.sort((a, b) => a.num - b.num);

  return result;
}

/* ══ Встроенное состояние ═════════════════════════════════════════════ */

interface EmbeddedParticipant {
  type: string;
  name: string;
  genealogy?: unknown;
  synthesisId?: unknown;
}

/** Свободная форма philosynth-state (version:2 обеих линий + legacy). */
export interface EmbeddedState {
  version?: unknown;
  parentContextSchema?: unknown;
  genLog?: unknown[];
  ctxLog?: unknown[];
  genCommon?: unknown;
  params?: Record<string, unknown> | null;
  sectionOrder?: unknown;
  editedSections?: unknown;
  docVersion?: unknown;
  participants?: EmbeddedParticipant[];
  genealogy?: unknown;
  structureSections?: unknown;
  pausedState?: unknown;
  modes?: Record<string, unknown>;
  capsuleHTML?: unknown;
}

/** Порт extractEmbeddedState [21534–21543]. */
export function extractEmbeddedState(doc: HtmlDocument): EmbeddedState | null {
  const stateEl = doc.getElementById("philosynth-state");
  if (!stateEl) return null;
  try {
    return JSON.parse(stateEl.textContent ?? "") as EmbeddedState;
  } catch (e) {
    console.warn("Не удалось распарсить встроенное состояние:", e);
    return null;
  }
}

/* ══ Режимы ═══════════════════════════════════════════════════════════ */

export interface ImportedModeResult {
  html: string;
  param: string;
  timestamp: string;
}

/** Порт extractModesFromHTML [21550–21586] — три формата 1:1. */
export function extractModesFromHTML(
  doc: HtmlDocument,
): Record<string, ImportedModeResult[]> {
  const modes: Record<string, ImportedModeResult[]> = {};

  // Формат 1 (новый, §5): данные в <script> как DOC_STATE = { modes: {...} }
  for (const s of doc.querySelectorAll("script")) {
    const match = (s.textContent ?? "").match(
      /DOC_STATE\s*=\s*\{\s*modes:\s*(\{[\s\S]*?\})\s*\}/,
    );
    if (match?.[1]) {
      try {
        const parsed = JSON.parse(match[1]) as Record<string, unknown>;
        for (const [key, results] of Object.entries(parsed)) {
          modes[key] = Array.isArray(results)
            ? (results as ImportedModeResult[])
            : [];
        }
        return modes;
      } catch (e) {
        console.warn("Не удалось распарсить DOC_STATE.modes:", e);
      }
    }
  }

  // Формат 2 (§3+§5): .philosynth-mode с data-атрибутами
  for (const det of doc.querySelectorAll(".philosynth-mode[data-mode-key]")) {
    const key = det.getAttribute("data-mode-key");
    if (!key) continue;
    const arr = modes[key] ?? [];
    const body = det.querySelector(".philosynth-mode-body");
    arr.push({
      html: body ? body.innerHTML : det.innerHTML,
      param: det.getAttribute("data-mode-param") || "",
      timestamp: det.getAttribute("data-mode-timestamp") || "",
    });
    modes[key] = arr;
  }
  if (Object.keys(modes).length > 0) return modes;

  // Формат 3 (старый): обычные <details> без атрибутов — не парсятся,
  // данные берутся из JSON-состояния (buildDocStateFromImport)
  return modes;
}

/* ══ Маппинг логов (оба входных формата — см. шапку модуля) ═══════════ */

const GEN_LOG_TYPES = new Set([
  "generation",
  "version_marker",
  "deletion_marker",
  "pause_marker",
  "resume_marker",
  "user_action_marker",
  "schema_migration_marker",
]);

const GEN_SOURCES = new Set([
  "initial",
  "edit",
  "edit_add",
  "cascade",
  "subsection_regen",
  "mode",
  "mode_cascade",
  "resume",
]);

/** Колонки generation_log — всё прочее у legacy-записи уходит в metadata. */
const GEN_COLUMN_KEYS = new Set([
  "sectionKey",
  "sectionLabel",
  "logType",
  "type",
  "source",
  "status",
  "priorChars",
  "taskChars",
  "inputChars",
  "outputChars",
  "inputTokens",
  "outputTokens",
  "cost",
  "costUsd",
  "error",
  "errorMessage",
  "metadata",
  "createdAt",
  "_sys",
  "_promptSkeleton",
]);

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

type GenLogInsert = typeof generationLog.$inferInsert;
type CtxLogInsert = typeof contextLog.$inferInsert;

/** Строка generation_log из записи genLog файла (v2-сервер и standalone). */
function toGenLogRow(
  raw: unknown,
  synthesisId: string,
  fallbackDate: Date,
  forceDate = false,
): GenLogInsert {
  const g = (raw ?? {}) as Record<string, unknown>;

  // logType: колонка v2 → маркерный type standalone (дефисы → подчёркивания)
  let logType = str(g.logType);
  if (!logType) {
    const legacy = str(g.type)?.replace(/-/g, "_");
    logType = legacy && GEN_LOG_TYPES.has(legacy) ? legacy : "generation";
  }
  if (!GEN_LOG_TYPES.has(logType)) logType = "generation";

  // source: 'mode-cascade' исходника → 'mode_cascade' (enum 02 §2.15, 4.1)
  let source = str(g.source)?.replace(/-/g, "_") ?? "initial";
  if (!GEN_SOURCES.has(source)) source = "initial";

  // metadata: объект v2 как есть; у standalone — поля россыпью минус колонки
  let metadata: Record<string, unknown>;
  if (g.metadata && typeof g.metadata === "object") {
    metadata = g.metadata as Record<string, unknown>;
  } else {
    metadata = {};
    for (const [k, v] of Object.entries(g)) {
      if (!GEN_COLUMN_KEYS.has(k)) metadata[k] = v;
    }
  }

  return {
    synthesisId,
    sectionKey: str(g.sectionKey) ?? "",
    sectionLabel: str(g.sectionLabel) ?? "",
    logType: logType as GenLogInsert["logType"],
    source: source as GenLogInsert["source"],
    status: str(g.status) ?? "done",
    priorChars: num(g.priorChars) ?? 0,
    taskChars: num(g.taskChars) ?? 0,
    inputChars: num(g.inputChars) ?? 0,
    outputChars: num(g.outputChars) ?? 0,
    inputTokens: num(g.inputTokens) ?? 0,
    outputTokens: num(g.outputTokens) ?? 0,
    costUsd: String(num(g.costUsd) ?? num(g.cost) ?? 0),
    errorMessage: str(g.errorMessage) ?? str(g.error),
    metadata,
    createdAt: forceDate
      ? fallbackDate
      : (parseDate(g.createdAt) ?? parseDate(g.timestamp) ?? fallbackDate),
  };
}

/** Строка context_log из записи ctxLog файла (формы совпадают почти 1:1;
 *  rawBaseBudget/conceptOverheadApplied колонок не имеют — восстановимы,
 *  02 §2.16; parentOverhead standalone не пишет — из parentSpec.totalChars). */
function toCtxLogRow(
  raw: unknown,
  synthesisId: string,
  fallbackDate: Date,
  forceDate = false,
): CtxLogInsert {
  const c = (raw ?? {}) as Record<string, unknown>;
  const parentSpec =
    c.parentSpec && typeof c.parentSpec === "object"
      ? (c.parentSpec as ParentSpecLog)
      : null;
  const budgetMode = str(c.budgetMode);
  return {
    synthesisId,
    sectionKey: str(c.sectionKey) ?? "",
    budget: num(c.budget) ?? 0,
    totalUsed: num(c.totalUsed) ?? 0,
    reqFound: num(c.reqFound) ?? 0,
    reqTotal: num(c.reqTotal) ?? 0,
    optIncluded: num(c.optIncluded) ?? 0,
    optTotal: num(c.optTotal) ?? 0,
    budgetMode: budgetMode === "full" ? "full" : "shrink",
    parentOverhead:
      num(c.parentOverhead) ?? num(parentSpec?.totalChars) ?? 0,
    parentSpec,
    entries: Array.isArray(c.entries)
      ? (c.entries as ContextLogEntry[])
      : [],
    createdAt: forceDate ? fallbackDate : (parseDate(c.createdAt) ?? fallbackDate),
  };
}

/* ══ importHTML — оркестрация (шаги a–m запроса 4.3) ══════════════════ */

const METHODS = new Set<string>([
  "dialectical",
  "integrative",
  "deconstructive",
  "hermeneutical",
  "analytical",
  "creative",
]);
const SYNTH_LEVELS = new Set<string>(["comparative", "transformative", "generative"]);
const DEPTHS = new Set<string>(["overview", "standard", "deep", "exhaustive"]);
const GENERATION_ORDERS = new Set<string>(["architectural", "genetic"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ImportResult {
  synthesisId: string;
  warnings: ImportWarning[];
}

function strArray(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === "string")
    ? (v as string[])
    : null;
}

export async function importHTML(
  htmlString: string,
  userId: string,
  filename?: string,
): Promise<ImportResult> {
  // ── a. Парсинг HTML ──
  const doc = parseDocument(htmlString);

  // Проверка: это PhiloSynth-документ?
  const docOutput = doc.getElementById("docOutput");
  if (!docOutput) {
    throw new ImportError("Не найден элемент #docOutput. Это не файл PhiloSynth.");
  }

  // ── b. Метаданные шапки ──
  const meta = extractMetadata(doc);

  // ── c. Разделы ──
  const warnings: ImportWarning[] = [];
  const parsedSections = extractSections(doc, warnings);
  if (parsedSections.length === 0) {
    throw new ImportError("В файле не найдено ни одного раздела (.doc-section).");
  }

  // ── d. Встроенное состояние ──
  const embeddedState = extractEmbeddedState(doc);

  // ── e. Валидация метаданных (confirm исходника — на клиенте; АДАПТАЦИЯ 3) ──
  warnings.push(...validateImportMeta(meta, embeddedState));

  // Дубликаты по ключу: UNIQUE(synthesis_id, key) — первый побеждает (АДАПТАЦИЯ 6)
  const byKey = new Map<string, ImportedSection>();
  for (const sec of parsedSections) {
    if (byKey.has(sec.key)) {
      warnings.push({
        field: "sections",
        message: `Раздел «${sec.title}» дублирует ключ «${sec.key}» — использован первый экземпляр.`,
        critical: false,
      });
      continue;
    }
    byKey.set(sec.key, sec);
  }

  // ── Параметры (порт buildDocStateFromImport [21688–21712]) ──
  const embParams = embeddedState?.params ?? null;
  const philosophers = strArray(embParams?.phil) ?? meta.phil;
  const methodRaw = str(embParams?.method) ?? meta.method;
  const method = (METHODS.has(methodRaw) ? methodRaw : meta.method) as SynthesisMethod;
  const depthRaw = str(embParams?.depth) ?? meta.depth;
  const depth = (DEPTHS.has(depthRaw) ? depthRaw : meta.depth) as Depth;
  const levelRaw = str(embParams?.synthLevel) ?? meta.synthLevel;
  const synthLevel = (SYNTH_LEVELS.has(levelRaw) ? levelRaw : meta.synthLevel) as SynthLevel;
  const orderRaw = str(embParams?.generationOrder) ?? "architectural";
  const generationOrder = (
    GENERATION_ORDERS.has(orderRaw) ? orderRaw : "architectural"
  ) as "architectural" | "genetic";
  const seed = str(embParams?.seed) ?? meta.seed;
  const context = str(embParams?.ctx) ?? meta.ctx;
  const lang = str(embParams?.lang) ?? "Russian";
  const extGraphMetrics = embParams?.extGraphMetrics === true;
  const keepFullBudget = embParams?.keepFullBudget === true;

  // secCtx: params.secCtx + гарантия контекстов из файла [21714–21719]
  const secCtx: Record<string, string> = {};
  if (embParams?.secCtx && typeof embParams.secCtx === "object") {
    for (const [k, v] of Object.entries(embParams.secCtx as Record<string, unknown>)) {
      if (typeof v === "string" && v) secCtx[k] = v;
    }
  }
  for (const sec of byKey.values()) {
    if (sec.secCtx && !secCtx[sec.key]) secCtx[sec.key] = sec.secCtx;
  }

  // ── Порядок разделов [21678–21686, 21798] ──
  const extractedKeys = new Set(byKey.keys());
  extractedKeys.add("sum"); // sum всегда присутствует
  // Капсула не извлекается extractSections (живёт в шапке) [21800–21805]
  const hasCapsule = Boolean(meta.capsuleText || embeddedState?.capsuleHTML);
  if (hasCapsule) extractedKeys.add("capsule");

  let sectionOrder =
    strArray(embeddedState?.sectionOrder) ??
    ["sum", ...[...byKey.keys()].filter((k) => k !== "sum")];
  sectionOrder = sectionOrder.filter((k) => extractedKeys.has(k));
  // АДАПТАЦИЯ 7: извлечённые ключи вне встроенного порядка — в хвост
  for (const k of byKey.keys()) {
    if (!sectionOrder.includes(k)) {
      sectionOrder.push(k);
      warnings.push({
        field: "sections",
        message: `Раздел «${k}» отсутствует во встроенном sectionOrder — добавлен в конец порядка.`,
        critical: false,
      });
    }
  }

  // Номера — по порядку sectionOrder [21735–21739]
  const numByKey = new Map<string, number>();
  let nextNum = 1;
  for (const k of sectionOrder) numByKey.set(k, nextNum++);

  // ── Заголовок, версия, статус, тоталы ──
  const title = readDocTitle(doc) || "Импортированный документ";
  const docVersion = parseVersion(
    embeddedState?.docVersion as string | number | null | undefined,
  );
  const pausedState = (embeddedState?.pausedState ?? null) as PausedState | null;
  const editedSections = new Set(strArray(embeddedState?.editedSections) ?? []);
  const structureSections = strArray(embeddedState?.structureSections);
  const parentContextSchemaRaw = str(embeddedState?.parentContextSchema);
  // ТЗ selective-parent-context 10.2: fallback 'monolithic' [21725]
  const parentContextSchema =
    parentContextSchemaRaw === "selective-v1" || parentContextSchemaRaw === "monolithic"
      ? parentContextSchemaRaw
      : "monolithic";

  // Тоталы футера из genLog [21625–21636] + стоимость
  const genLogRaw = Array.isArray(embeddedState?.genLog) ? embeddedState.genLog : [];
  const totals = genLogRaw.reduce<{ inT: number; outT: number; cost: number }>(
    (a, raw) => {
      const g = (raw ?? {}) as Record<string, unknown>;
      return {
        inT: a.inT + (num(g.inputTokens) ?? 0),
        outT: a.outT + (num(g.outputTokens) ?? 0),
        cost: a.cost + (num(g.costUsd) ?? num(g.cost) ?? 0),
      };
    },
    { inT: 0, outT: 0, cost: 0 },
  );

  // Квирк капсулы [21806–21813] (АДАПТАЦИЯ 9)
  const capsuleHtml = meta.capsuleText
    ? '<div class="doc-section"><div class="doc-content"><div data-section="Капсула"><p>' +
      meta.capsuleText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("</p><p>") +
      "</p></div></div></div>"
    : "";

  // ── f. Запись syntheses ──
  const [created] = await db
    .insert(syntheses)
    .values({
      userId,
      seed,
      method,
      synthLevel,
      depth,
      generationOrder,
      extGraphMetrics,
      keepFullBudget,
      context,
      lang,
      title,
      docNum: meta.docNum || "IMPORT", // порт populateFromImport [21598]
      status: pausedState ? "paused" : "ready",
      sectionOrder,
      structureSections: structureSections ?? null,
      parentContextSchema,
      pausedState,
      versionBase: docVersion.base,
      versionSub: docVersion.sub,
      versionModes: docVersion.modes,
      versionModeRegen: docVersion.modeRegen,
      capsuleHtml,
      totalInputTokens: totals.inT,
      totalOutputTokens: totals.outT,
      totalCostUsd: String(totals.cost),
    })
    .returning({ id: syntheses.id });
  if (!created) throw new Error("Импорт: запись syntheses не создана");
  const synthesisId = created.id;

  // Сбой любого следующего шага — откат: удаление строки (CASCADE чистит
  // детей). Единой транзакции нет: saveGraphToDb/saveElementsToDb ведут
  // собственные (адаптация; фиксируется в ревью беседы).
  try {
    // ── g. Разделы ──
    const sectionRows = [...byKey.values()].map((sec) => ({
      synthesisId,
      key: sec.key,
      sectionNum: numByKey.get(sec.key) ?? nextNum++,
      title: sec.title,
      htmlContent: sec.html,
      secContext: secCtx[sec.key] ?? "",
      isEdited: editedSections.has(sec.key),
    }));
    if (sectionRows.length > 0) await db.insert(sections).values(sectionRows);

    // ── h. Граф → categories / category_edges / cluster_labels [21611] ──
    const graphSec = byKey.get("graph");
    if (graphSec) {
      try {
        const parsed = parseGraphFromHTML(graphSec.html);
        if (parsed.nodes.length > 0) {
          const res = await saveGraphToDb(synthesisId, parsed);
          for (const w of res.warnings) {
            warnings.push({ field: "graph", message: w, critical: false });
          }
        }
      } catch (e) {
        // Порт console.warn [21619] + предупреждение пользователю
        console.warn("Не удалось распарсить граф при импорте:", e);
        warnings.push({
          field: "graph",
          message:
            "Не удалось распарсить граф — категории и связи не восстановлены.",
          critical: false,
        });
      }
    }

    // ── i–j. Тезисы и глоссарий → гранулярные таблицы (02 §3) ──
    const thesesSec = byKey.get("theses");
    const glossarySec = byKey.get("glossary");
    if (thesesSec || glossarySec) {
      try {
        await saveElementsToDb(synthesisId, thesesSec ? "theses" : "glossary", {
          theses: thesesSec ? parseThesesFromHTML(thesesSec.html) : undefined,
          glossaryTerms: glossarySec
            ? parseGlossaryFromHTML(glossarySec.html)
            : undefined,
        });
      } catch (e) {
        console.warn("Не удалось распарсить тезисы/глоссарий при импорте:", e);
        warnings.push({
          field: thesesSec ? "theses" : "glossary",
          message:
            "Не удалось распарсить тезисы/глоссарий — гранулярные элементы не восстановлены.",
          critical: false,
        });
      }
    }

    // ── k. genLog / ctxLog / genCommon [21665–21675] ──
    // Даты: v2 сервера датирует ВСЕ записи (createdAt) — даты сохраняются.
    // Legacy standalone датирует только маркеры (timestamp) — смешение
    // реальных прошлых дат с fallback-«сейчас» ЛОМАЕТ порядок журнала
    // (найдено тестом R3), поэтому при неполной датировке ВСЕ записи
    // получают синтетические монотонные t0+i (порядок массива — истина;
    // исходные timestamp маркеров сохраняются в metadata).
    const t0 = Date.now();
    const genDates = genLogRaw.map((g) => {
      const r = (g ?? {}) as Record<string, unknown>;
      return parseDate(r.createdAt) ?? parseDate(r.timestamp);
    });
    const genAllDated = genDates.length > 0 && genDates.every((d) => d !== null);
    if (genLogRaw.length > 0) {
      await db
        .insert(generationLog)
        .values(
          genLogRaw.map((g, i) =>
            toGenLogRow(
              g,
              synthesisId,
              genAllDated ? (genDates[i] as Date) : new Date(t0 + i),
              !genAllDated,
            ),
          ),
        );
    }
    if (embeddedState?.genCommon != null) {
      // Служебная строка _genCommon (02 §2.15)
      await db.insert(generationLog).values({
        synthesisId,
        sectionKey: "_genCommon",
        sectionLabel: "",
        logType: "generation",
        source: "initial",
        status: "common",
        metadata: { genCommon: embeddedState.genCommon },
        createdAt: new Date(t0 + genLogRaw.length),
      });
    }
    const ctxLogRaw = Array.isArray(embeddedState?.ctxLog) ? embeddedState.ctxLog : [];
    const ctxDates = ctxLogRaw.map((c) =>
      parseDate(((c ?? {}) as Record<string, unknown>).createdAt),
    );
    const ctxAllDated = ctxDates.length > 0 && ctxDates.every((d) => d !== null);
    if (ctxLogRaw.length > 0) {
      await db
        .insert(contextLog)
        .values(
          ctxLogRaw.map((c, i) =>
            toCtxLogRow(
              c,
              synthesisId,
              ctxAllDated ? (ctxDates[i] as Date) : new Date(t0 + i),
              !ctxAllDated,
            ),
          ),
        );
    }

    // ── l. Генеалогия → synthesis_lineage [21728–21734] + санация имён ──
    let genealogy = reconstructGenealogy(meta, embeddedState, doc);
    restoreCapsulesFromHTML(genealogy, doc); // порт [21729]; в БД капсулы
    // родителей не пишутся (не персистятся lineage-моделью) — вызов
    // сохранён для паритета мутации перед normalize
    genealogy = normalizeGenealogyNames(genealogy, title) ?? genealogy;

    const lineageRows: (typeof synthesisLineage.$inferInsert)[] = [];
    let position = 0;
    for (const p of genealogy.participants ?? []) {
      if (p.type === "philosopher") {
        lineageRows.push({
          synthesisId,
          parentType: "philosopher",
          parentName: p.name,
          position: position++,
        });
        continue;
      }
      // Концепция-родитель: только при существующем в БД synthesisId (АДАПТАЦИЯ 5)
      const sid = typeof p.synthesisId === "string" ? p.synthesisId : null;
      if (sid && UUID_RE.test(sid) && sid !== synthesisId) {
        const [exists] = await db
          .select({ id: syntheses.id })
          .from(syntheses)
          .where(eq(syntheses.id, sid))
          .limit(1);
        if (exists) {
          lineageRows.push({
            synthesisId,
            parentType: "synthesis",
            parentSynthesisId: sid,
            position: position++,
          });
          continue;
        }
      }
      warnings.push({
        field: "lineage",
        message: `Концепция-родитель «${p.name}» не найдена в базе — связь генеалогии не создана (дерево файла сохранено только во встроенном состоянии).`,
        critical: false,
      });
    }
    if (lineageRows.length > 0) {
      await db.insert(synthesisLineage).values(lineageRows);
    }

    // ── m. Режимы → mode_results [21816–21826] ──
    // Приоритет: JSON embedded state (обратная совместимость) → разметка
    let modes: Record<string, ImportedModeResult[]>;
    if (embeddedState?.modes && Object.keys(embeddedState.modes).length > 0) {
      modes = {};
      for (const [k, v] of Object.entries(embeddedState.modes)) {
        // Старый формат: одиночные объекты → массивы [21819–21822]
        const arr = Array.isArray(v)
          ? v
          : v && typeof v === "object" && (v as { html?: unknown }).html
            ? [v]
            : [];
        modes[k] = (arr as Record<string, unknown>[]).map((r) => ({
          html: str(r.html) ?? "",
          param: str(r.param) ?? "",
          timestamp: str(r.timestamp) ?? "",
        }));
      }
    } else {
      modes = extractModesFromHTML(doc);
    }
    const modeRows: (typeof modeResults.$inferInsert)[] = [];
    let modeIdx = 0;
    for (const [modeKey, results] of Object.entries(modes)) {
      for (const r of results) {
        if (!r.html) continue;
        modeRows.push({
          synthesisId,
          modeKey,
          paramValue: r.param,
          htmlContent: r.html,
          // Токены/стоимость файл не несёт (АДАПТАЦИЯ 8) — нули по умолчанию
          createdAt: parseDate(r.timestamp) ?? new Date(t0 + modeIdx),
        });
        modeIdx++;
      }
    }
    if (modeRows.length > 0) await db.insert(modeResults).values(modeRows);
  } catch (err) {
    await db.delete(syntheses).where(eq(syntheses.id, synthesisId));
    throw err;
  }

  console.log(
    "Импорт завершён:",
    filename ?? "(без имени)",
    "разделов:",
    byKey.size,
    "состояние:",
    embeddedState ? "восстановлено" : "реконструировано",
  );

  return { synthesisId, warnings };
}
