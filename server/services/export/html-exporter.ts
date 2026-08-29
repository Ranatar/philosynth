/**
 * html-exporter — saveHTML() [18003–18196] + buildGraphExportSection
 * [17679–17834] + buildModesExportSection [17535–17672] (беседа 4.2).
 * Собирает АВТОНОМНЫЙ HTML-файл: документ + интерактивный граф (three.js/
 * d3 с CDN) + модалка режимов + встроенное состояние для импорта (4.3) +
 * видимый лог контекста; CSS прогнан через auditCSS.
 *
 * АДАПТАЦИИ DOM→БД (пп. 4d/4g первого запроса на сервере буквально
 * неисполнимы — нет DOM и живых функций для сериализации):
 *  - fnBundle/constBundle/разметка модалок/rawCSS — ассеты из САМОГО
 *    исходника (server/config/export-assets.ts, генератор
 *    scripts/extract-export-assets.mjs): встроенный просмотрщик — тот же
 *    код, что исходник сериализовал бы fn.toString(); клиентские порты
 *    1.7 (React/TS) в автономный файл не сериализуемы;
 *  - docHTML — серверный рендер: шапка (зеркало DocumentHeader 1.6b:
 *    doc-type/doc-title/doc-subtitle/дисклоужеры/doc-meta-grid) + разделы
 *    sections.html_content в порядке sectionOrder (кроме capsule), каждый
 *    в обёртке .doc-body с якорем sec-{key} (разметка SectionView 1.6b);
 *    TOC не строится — исходник удалял docTOC/toc-back-btn перед экспортом;
 *  - кнопка «▦ Граф категорий»: маркер id="db{graphBodyIdx}" вырожден
 *    (db-индексация снята 1.6) — вставка после открывающего тега обёртки
 *    .doc-body раздела graph;
 *  - видимый лог: скрипт исходника сериализовал БРАУЗЕРНЫЕ formatCtxLog/
 *    colorizeLog и строил лог на лету из embedded state; серверный
 *    formatCtxLog ходит в БД и несериализуем — в <pre> кладётся ГОТОВЫЙ
 *    html из formatCtxLogHTML (беседа 2.4), разметка details дословна;
 *  - embedded state: genLog/ctxLog — из generation_log/context_log
 *    (metadata без sys/promptSkeleton — паритет среза _sys/_promptSkeleton),
 *    params — buildParams, участники — философы + loadConceptParticipants
 *    БЕЗ капсул и контекстных полей (паритет cleanParticipants);
 *    genealogy строится из synthesis_lineage напрямую БЕЗ капсул —
 *    stripCapsulesFromGenealogy/normalizeGenealogyNames вырождены
 *    (серверная копия клиентских utils/genealogy — беседа 4.3);
 *  - КВИРК языка [18181]: исходник смотрел docLang только для "ru", прочие
 *    ветки — по глобалу GEN_LANG; на сервере один источник row.lang.
 */
import { asc, eq } from "drizzle-orm";

import { DL, ML, SL } from "@philosynth/shared/constants/labels";
import { esc } from "@philosynth/shared/utils/escape";

import {
  EXPORT_GM_OVERLAY_HTML,
  EXPORT_GRAPH_CONST_BUNDLE,
  EXPORT_GRAPH_FN_BUNDLE,
  EXPORT_MODE_OVERLAY_HTML,
  EXPORT_SOURCE_RAW_CSS,
} from "../../config/export-assets.js";
import { PARENT_CONTEXT_SCHEMA_ID, PARENT_CONTEXT_SCHEMA_VERSION } from "../../config/parent-deps.js";
import { db } from "../../db/index.js";
import {
  contextLog,
  generationLog,
  modeResults,
  sections,
} from "../../db/schema.js";
import { auditCSS } from "../../utils/css-audit.js";
import { innerTextTrimmed, parseFragment } from "../../utils/html-parser.js";
import { buildParams, loadSynthesis } from "../generation-service.js";
import { formatCtxLogHTML } from "../log-formatter.js";
import { getModeConfig } from "../mode-service.js";
import { loadConceptParticipants } from "../meta-synthesis-service.js";
import { exportFilename, loadExportSynthesis } from "./common.js";
import { loadGModel } from "./graph-model.js";
import { docDateFor, subtitleForExport } from "./md-exporter.js";

import type { ExportSynthesis } from "./common.js";

/* ══ Шапка документа (зеркало DocumentHeader 1.6b / [4169–4201]) ══════ */

function disclosure(label: string, text: string): string {
  return (
    `<details class="header-disclosure"><summary>${esc(label)}</summary>` +
    `<div class="disclosure-body">${esc(text)}</div></details>`
  );
}

function renderDocHeader(s: ExportSynthesis): string {
  const row = s.row;
  // Текст капсулы — как extractCapsuleText клиента: текстовое содержимое
  // capsuleHtml (серверный DOM — только через html-parser)
  const capsuleText = row.capsuleHtml
    ? innerTextTrimmed(parseFragment(row.capsuleHtml))
    : "";

  const extras: string[] = [];
  if (row.seed) extras.push(disclosure("Зерно концепции", row.seed));
  if (row.context)
    extras.push(disclosure("Дополнительный контекст", row.context));
  if (capsuleText)
    extras.push(
      `<details class="header-disclosure-capsule" open><summary>◈ Капсула концепции</summary>` +
        `<div class="disclosure-body">${esc(capsuleText)}</div></details>`,
    );

  const metaItem = (key: string, val: string, gold = false): string =>
    `<div class="doc-meta-item"><span class="doc-meta-key">${key}</span>` +
    `<span class="doc-meta-val${gold ? " gold" : ""}">${esc(val)}</span></div>`;

  return (
    `<div class="doc-header">` +
    `<div class="doc-type">PhiloSynth Pro™ · Синтез Философской Концепции</div>` +
    `<div class="doc-title">${esc(row.title)}</div>` +
    `<div class="doc-subtitle">${esc(subtitleForExport(s))}</div>` +
    (extras.length
      ? `<div style="margin-top:14px;display:flex;flex-direction:column;gap:6px">${extras.join("")}</div>`
      : "") +
    `<div class="doc-meta-grid" style="margin-top:20px">` +
    metaItem("Документ №", row.docNum || "—") +
    metaItem("Дата составления", docDateFor(s)) +
    metaItem("Метод синтеза", (ML as Record<string, string>)[row.method] ?? row.method, true) +
    metaItem("Глубина", (DL as Record<string, string>)[row.depth] ?? row.depth, true) +
    metaItem("Уровень синтеза", (SL as Record<string, string>)[row.synthLevel] ?? row.synthLevel, true) +
    `</div></div>`
  );
}

/* ══ buildModesExportSection [17535–17672] ════════════════════════════ */

interface ModeRow {
  modeKey: string;
  paramValue: string;
  htmlContent: string;
  createdAt: Date;
}

export function buildModesExportSection(modeRows: ModeRow[]): string {
  // Группировка по режиму (порядок createdAt ASC внутри — как runMode
  // наполнял DOC_STATE.modes[key].push)
  const byKey = new Map<string, ModeRow[]>();
  for (const r of modeRows) {
    if (!r.htmlContent) continue;
    const arr = byKey.get(r.modeKey) ?? [];
    arr.push(r);
    byKey.set(r.modeKey, arr);
  }
  const allResults = [...byKey.entries()];
  if (!allResults.length) return "";

  // ── 1. Данные: скрытые блоки с HTML-контентом ──
  let dataHTML = '<div id="philosynth-modes" style="display:none">';
  for (const [key, results] of allResults) {
    const title = getModeConfig(key)?.title || key;
    for (const r of results) {
      if (!r.htmlContent) continue;
      dataHTML += `<div class="philosynth-mode"
           data-mode-key="${esc(key)}"
           data-mode-title="${esc(title)}"
           data-mode-param="${esc(r.paramValue)}"
           data-mode-timestamp="${esc(r.createdAt.toISOString())}">
        ${r.htmlContent}
      </div>`;
    }
  }
  dataHTML += "</div>";

  // ── 2. Кнопки открытия ──
  let buttons =
    '<div style="max-width:1100px;margin:20px auto 0;display:flex;gap:8px;flex-wrap:wrap">';
  for (const [key, results] of allResults) {
    const title = getModeConfig(key)?.title || key;
    const count = results.filter((r) => r.htmlContent).length;
    buttons += `<button class="action-btn" style="border-color:var(--violet);color:var(--violet)"
      onclick="openExportedMode('${esc(key)}')">${esc(title)} (${count})</button>`;
  }
  buttons += "</div>";

  // ── 3. Модальное окно (ассет: статическая разметка без поля ввода) ──
  const modalHTML = EXPORT_MODE_OVERLAY_HTML;

  // ── 4. Тонкий скрипт (текст исходника дословно) ──
  const script = `
      (function() {
        // Парсим данные из HTML
        function loadModes() {
          var modes = {};
          var els = document.querySelectorAll("#philosynth-modes .philosynth-mode");
          for (var i = 0; i < els.length; i++) {
            var el = els[i];
            var key = el.getAttribute("data-mode-key");
            if (!modes[key]) modes[key] = [];
            modes[key].push({
              html:      el.innerHTML,
              param:     el.getAttribute("data-mode-param") || "",
              timestamp: el.getAttribute("data-mode-timestamp") || "",
              title:     el.getAttribute("data-mode-title") || key,
            });
          }
          return modes;
        }

        var _modes = null;
        function getModes() {
          if (!_modes) _modes = loadModes();
          return _modes;
        }

        function esc(s) {
          return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
        }
        function truncLabel(s, max) {
          return s.length > max ? s.slice(0, max - 1) + "\\u2026" : s;
        }

        // Вкладки
        function buildTabs(key, results) {
          var bar = document.getElementById("modeTabsBar");
          if (!results || !results.length) { bar.style.display = "none"; bar.innerHTML = ""; return; }
          bar.style.display = "flex";
          bar.innerHTML = results.map(function(r, i) {
            var label = truncLabel(r.param, 24);
            var date = new Date(r.timestamp).toLocaleDateString("ru-RU");
            return '<button class="mode-tab" data-index="' + i + '" ' +
              'onclick="switchExpTab(\\'' + key + '\\',' + i + ')">' +
              esc(label) + '<span class="mode-tab-date">' + date + '</span></button>';
          }).join("");
        }

        function switchTab(key, idx) {
          var modes = getModes();
          var results = modes[key];
          if (!results || idx >= results.length) return;
          var tabs = document.querySelectorAll("#modeTabsBar .mode-tab");
          for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle("active", i === idx);
          }
          document.getElementById("modeContent").innerHTML = results[idx].html;
          document.getElementById("modeInfo").textContent =
            results[idx].param + " \\u00b7 " +
            new Date(results[idx].timestamp).toLocaleString("ru-RU");
        }

        // Публичные функции
        window.openExportedMode = function(key) {
          var modes = getModes();
          var results = modes[key] || [];
          if (!results.length) return;
          document.getElementById("modeTitle").textContent = results[0].title || key;
          buildTabs(key, results);
          switchTab(key, results.length - 1);
          document.getElementById("modeOverlay").classList.add("visible");
          document.body.style.overflow = "hidden";
        };
        window.switchExpTab = switchTab;
        window.closeModeModal = function() {
          document.getElementById("modeOverlay").classList.remove("visible");
          document.body.style.overflow = "";
        };
        window.copyModeContent = function() {
          var text = (document.getElementById("modeContent") || {}).innerText || "";
          navigator.clipboard.writeText(text).then(function() {
            var btn = document.querySelector("#modeOverlay .mode-modal-copy");
            if (!btn) return;
            var o = btn.textContent;
            btn.textContent = "\\u2713 Скопировано";
            setTimeout(function() { btn.textContent = o; }, 2000);
          });
        };
      })();`;

  return `${dataHTML}${buttons}${modalHTML}
      <script>${script}<\\/script>`.replace("<\\/script>", "</script>");
}

/* ══ buildGraphExportSection [17679–17834] ════════════════════════════ */

export function buildGraphExportSection(
  hasNodes: boolean,
  filenameBase: string,
): string {
  if (!hasNodes) return "";

  // ── 1. Разметка модалки — ассет (статика исходника уже «чистая») ──
  const modalHTML = EXPORT_GM_OVERLAY_HTML;

  // ── 2–3. Самодостаточный скрипт: константы + функции исходника ──
  // Текст initScript — дословно [17773–17828]; fnBundle/constBundle — из
  // ассетов (экстракция вместо fn.toString()).
  const initScript = `
(function () {

  ${EXPORT_GRAPH_CONST_BUNDLE}

  var _nodeColorMap = new Map();
  var _edgeStyleMap = new Map();
  var G = {
          nodes: [], edges: [],
          topology: { clusters: {}, roles: { structural: {}, procedural: {} }, clusterLabels: [] }
        };
  var anim3d = null;
  var renderer3d = null;
  var scene3d = null;
  var sim2d = null;
  var resizeObs3d = null;
  var clusterVisible   = false;
  var roleMode         = "procedural";
  var clusterObjects3d = null;
  var clusterObjects2d = null;
  var graphAPI3d       = null;
  var graphAPI2d       = null;
  var currentViewMode  = "3d";
  var legendFilter     = null;

  document.addEventListener('DOMContentLoaded', function () {
    var ct = document.getElementById('docOutput') || document.body;
    var parsed = parseGraph(ct);
    if (parsed.nodes.length) G = parsed;
  });

  document.addEventListener("click", function(e) {
    const wrap = document.getElementById("exportWrap");
    if (wrap && !wrap.contains(e.target)) closeExportMenu();
  });

  function getDocFilename(ext) {
    return ${JSON.stringify(filenameBase)} + (ext ? "." + ext : "");
  }

  ${EXPORT_GRAPH_FN_BUNDLE}

  // Экспорт в глобальную область для onclick-атрибутов клонированного модала
  window.openGraph   = openGraph;
  window.closeGraph  = closeGraph;
  window.switchView  = switchView;
  window.toggleExportMenu = toggleExportMenu;
  window.closeExportMenu  = closeExportMenu;
  window.doExport         = doExport;
  window.exportMMD   = exportMMD;
  window.exportPNG   = exportPNG;
  window.exportJSON  = exportJSON;
  window.toggleClusters = toggleClusters;
})();`;

  return `${modalHTML}
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
<script>${initScript}</script>`;
}

/* ══ saveHTML [18003] ═════════════════════════════════════════════════ */

export async function exportHTML(synthesisId: string): Promise<string> {
  const s = await loadExportSynthesis(synthesisId);
  const row = s.row;

  // ── Разделы в порядке sectionOrder (обёртка/якоря — SectionView 1.6b) ──
  const secRows = await db
    .select()
    .from(sections)
    .where(eq(sections.synthesisId, synthesisId))
    .orderBy(asc(sections.sectionNum));
  const byKey = new Map(secRows.map((r) => [r.key, r]));
  const orderedKeys: string[] = [];
  for (const key of row.sectionOrder ?? []) {
    if (key === "capsule") continue; // капсула живёт в шапке
    if (byKey.has(key)) orderedKeys.push(key);
  }
  for (const key of byKey.keys()) {
    if (key !== "capsule" && !orderedKeys.includes(key)) orderedKeys.push(key);
  }

  const G = await loadGModel(synthesisId);
  const hasGraph = G.nodes.length > 0;

  const graphBtnHTML =
    `<div style="display:flex;gap:10px;flex-wrap:wrap;padding:12px 0 8px">` +
    `<button class="action-btn gold-btn" onclick="openGraph()">▦ Граф категорий</button>` +
    `</div>`;

  let docHTML = renderDocHeader(s);
  for (const key of orderedKeys) {
    const sec = byKey.get(key)!;
    // Кнопки графа — в начало раздела графа (адаптация маркера db{N})
    const btns = hasGraph && key === "graph" ? graphBtnHTML : "";
    docHTML +=
      `<div class="doc-body">` +
      btns +
      `<a id="sec-${esc(key)}"></a>` +
      sec.htmlContent +
      `</div>`;
  }

  // ── Имя файла фиксируется на момент сохранения (без расширения) ──
  const filenameBase = exportFilename(s, "html").replace(/\.html$/, "");

  // ── Граф-секция ──
  const graphSection = buildGraphExportSection(hasGraph, filenameBase);

  // ── Режимы: ДО CSS-аудита, чтобы стили не были удалены ──
  const modeRows = await db
    .select()
    .from(modeResults)
    .where(eq(modeResults.synthesisId, synthesisId))
    .orderBy(asc(modeResults.createdAt));
  const modesSection = buildModesExportSection(modeRows);

  // ── CSS-аудит: контент = всё, что уйдёт в файл ──
  const contentToCheck = docHTML + graphSection + (modesSection || "");
  const styles =
    "<style>\n" + auditCSS(EXPORT_SOURCE_RAW_CSS, contentToCheck) + "\n</style>";

  // ── Встраиваем состояние для импорта (4.3) ──
  const { philosophers, secCtx } = await loadSynthesis(synthesisId);
  const conceptParticipants = await loadConceptParticipants(synthesisId);
  const params = buildParams(row, philosophers, secCtx, conceptParticipants);

  const { genRows, ctxRows, genCommon } = await loadExportLogs(synthesisId);

  // Паритет среза _sys/_promptSkeleton: metadata без sys/promptSkeleton
  // (реконструкция вернёт скелеты при импорте — prompt-reconstruction)
  const genLogClean = genRows.map((g) => {
    const { sys: _sys, promptSkeleton: _skel, ...restMeta } = (g.metadata ||
      {}) as Record<string, unknown>;
    return {
      sectionKey: g.sectionKey,
      sectionLabel: g.sectionLabel,
      logType: g.logType,
      source: g.source,
      status: g.status,
      priorChars: g.priorChars,
      taskChars: g.taskChars,
      inputChars: g.inputChars,
      outputChars: g.outputChars,
      inputTokens: g.inputTokens,
      outputTokens: g.outputTokens,
      costUsd: Number(g.costUsd),
      errorMessage: g.errorMessage,
      metadata: restMeta,
      createdAt: g.createdAt.toISOString(),
    };
  });

  const ctxLogClean = ctxRows.map((c) => ({
    sectionKey: c.sectionKey,
    budget: c.budget,
    totalUsed: c.totalUsed,
    reqFound: c.reqFound,
    reqTotal: c.reqTotal,
    optIncluded: c.optIncluded,
    optTotal: c.optTotal,
    budgetMode: c.budgetMode,
    parentOverhead: c.parentOverhead,
    parentSpec: c.parentSpec,
    entries: c.entries,
    createdAt: c.createdAt.toISOString(),
  }));

  // Паритет cleanParticipants [18066]: у концепций — только идентичность,
  // БЕЗ капсул и контекстных полей (capsule/goals/tensions/graph*/
  // dialogue*/glossaryCompact/thesesSummary/portraits)
  const cleanParticipants: unknown[] = [
    ...philosophers.map((name) => ({ type: "philosopher", name })),
    ...conceptParticipants.map((x) => ({
      type: x.type,
      name: x.name,
      method: x.method,
      synthLevel: x.synthLevel,
      seed: x.seed,
      // Серверная генеалогия участника — беседа 4.3 (reconstructGenealogy)
      genealogy: null,
      synthesisId: x.synthesisId,
    })),
  ];

  // Генеалогия корня — из synthesis_lineage напрямую (без капсул по
  // построению; strip/normalize клиентских utils/genealogy вырождены)
  const genealogy = {
    type: "concept",
    name: row.title,
    method: row.method,
    synthLevel: row.synthLevel,
    seed: row.seed || "",
    participants: [
      ...philosophers.map((name) => ({ type: "philosopher", name })),
      ...s.conceptParents.map((p) => ({
        type: "concept",
        name: p.name,
        synthesisId: p.id,
      })),
    ],
  };

  const editedSections = secRows.filter((r) => r.isEdited).map((r) => r.key);

  const stateData = {
    version: 2,
    parentContextSchema: PARENT_CONTEXT_SCHEMA_ID,
    parentContextSchemaVersion: PARENT_CONTEXT_SCHEMA_VERSION,
    genLog: genLogClean,
    ctxLog: ctxLogClean,
    genCommon,
    params,
    sectionOrder: row.sectionOrder,
    editedSections,
    docVersion: {
      base: row.versionBase,
      sub: row.versionSub,
      modes: row.versionModes,
      modeRegen: row.versionModeRegen,
    },
    participants: cleanParticipants,
    genealogy,
    structureSections: row.structureSections || null,
    pausedState: row.pausedState || null,
  };
  let stateJSON = `\n<script type="application/json" id="philosynth-state">\n${JSON.stringify(stateData, null, 2)}\n</script>`;

  // ── Видимый лог контекста (адаптация: предвычисленный html 2.4) ──
  if (genRows.length > 0 || ctxRows.length > 0) {
    const log = await formatCtxLogHTML(synthesisId);
    const isEmpty = log.text === "Лог пуст. Сгенерируйте документ.";
    stateJSON += `\n<details style="
      max-width:1100px; margin:20px auto 0;
      border:1px solid #d8d4cc; background:#1a1814;
    ">
      <summary style="
        padding:10px 18px; cursor:pointer;
        font-family:'IBM Plex Mono',monospace; font-size:10px;
        letter-spacing:2px; text-transform:uppercase;
        color:#8a8278; background:#f2f0eb;
        list-style:none; display:flex; align-items:center; gap:6px;
        user-select:none;
      ">◈ Лог контекста и генерации</summary>
      <div style="padding:20px; overflow-x:auto;">
        <pre id="philosynth-log-raw" style="
          font-family:'IBM Plex Mono',monospace; font-size:11px;
          line-height:1.7; color:#c8c0b0; white-space:pre-wrap;
          word-break:break-all; margin:0;${isEmpty ? " color:#8a8278;" : ""}
        ">${log.html}</pre>
      </div>
    </details>`;
  }

  // ── Язык (квирк GEN_LANG — см. шапку модуля) ──
  const docLang = row.lang || "Russian";
  const htmlLang =
    docLang === "Russian" ? "ru" :
    docLang === "English" ? "en" :
    docLang === "German" ? "de" :
    docLang === "French" ? "fr" :
    docLang === "Spanish" ? "es" :
    docLang === "Chinese" ? "zh" :
    docLang === "Japanese" ? "ja" :
    docLang === "Latin" ? "la" : "en";

  // Шаблон файла — дословно [18189]
  const html = `<!DOCTYPE html><html lang="${htmlLang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${esc(row.title)}</title><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">${styles}<style>body{background:#f2f0eb;padding:32px}#docOutput{max-width:1100px;margin:0 auto}</style></head><body><div id="docOutput">${modesSection}${docHTML}</div>${graphSection}${stateJSON}</body></html>`;
  return html;
}

/* ── Логи для embedded state (двойник loadLogs log-formatter — тот
      приватен; выборка та же: generation_log/context_log по createdAt) ── */

async function loadExportLogs(synthesisId: string): Promise<{
  genRows: (typeof generationLog.$inferSelect)[];
  ctxRows: (typeof contextLog.$inferSelect)[];
  genCommon: unknown;
}> {
  const genAll = await db
    .select()
    .from(generationLog)
    .where(eq(generationLog.synthesisId, synthesisId))
    .orderBy(asc(generationLog.createdAt));
  const ctxRows = await db
    .select()
    .from(contextLog)
    .where(eq(contextLog.synthesisId, synthesisId))
    .orderBy(asc(contextLog.createdAt));
  const commonRow = genAll.find((g) => g.sectionKey === "_genCommon");
  const genCommon =
    (commonRow?.metadata as { genCommon?: unknown } | undefined)?.genCommon ??
    null;
  // Служебная строка _genCommon в embedded genLog не входит (02 §2.15)
  const genRows = genAll.filter((g) => g.sectionKey !== "_genCommon");
  return { genRows, ctxRows, genCommon };
}
