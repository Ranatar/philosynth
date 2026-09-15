/**
 * extract-export-assets.mjs — генератор server/config/export-assets.ts
 * (беседа 4.2, Export Service; механика — по образцу extract-seed-data.mjs
 * и extract-section-templates.mjs беседы 0.3/1.2).
 *
 * ЗАЧЕМ. Исходник в buildGraphExportSection() сериализует ЖИВЫЕ функции
 * браузерной страницы через fn.toString() и клонирует DOM-модалки. На
 * сервере ни того ни другого нет: клиентские порты 1.7 — React/TS-модули
 * с импортами, их текст в автономном файле неисполним. Поэтому встроенный
 * просмотрщик графа/режимов экспортируемого файла берётся ИЗ САМОГО
 * ИСХОДНИКА: функции — те же, что исходник сериализовал бы (fnBundle
 * [17691–17738] дословно, извлечение scripts/extract-by-name.py), разметка
 * модалок — статическая разметка #gmOverlay [4224] / #modeOverlay [4330]
 * (в статике она уже «чистая» — клон-очистки исходника вырождены; из
 * modeOverlay, как и в исходнике, удаляется .mode-modal-params),
 * CSS — содержимое единственного <style> исходника (rawCSS для auditCSS).
 *
 * Запуск: node scripts/extract-export-assets.mjs
 * (из корня репо; требует python3 для extract-by-name.py).
 * Прогон идемпотентен: одинаковый исходник → одинаковый байт-в-байт файл.
 * При обновлении source/philosynth.html — перегенерировать.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "source", "philosynth.html");
const OUT = path.join(ROOT, "server", "config", "export-assets.ts");

const src = readFileSync(SOURCE, "utf8");

/* ── 1. CSS: содержимое первого (и единственного) <style> ─────────────── */

function extractCss(text) {
  const open = text.indexOf("<style>");
  if (open === -1) throw new Error("Не найден <style> в исходнике");
  const close = text.indexOf("</style>", open);
  if (close === -1) throw new Error("Не найден </style> в исходнике");
  return text.slice(open + "<style>".length, close);
}

/* ── 2. Разметка модалок: балансное извлечение <div …>…</div> ─────────── */

function extractDivBlock(text, openTagMarker) {
  const start = text.indexOf(openTagMarker);
  if (start === -1) throw new Error("Не найден маркер: " + openTagMarker);
  const re = /<div\b|<\/div>/g;
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === "<div") depth++;
    else {
      depth--;
      if (depth === 0) {
        const end = m.index + "</div>".length;
        return text.slice(start, end);
      }
    }
  }
  throw new Error("Небаланс <div> для маркера: " + openTagMarker);
}

const gmOverlayHtml = extractDivBlock(src, '<div class="gm-overlay" id="gmOverlay">');

let modeOverlayHtml = extractDivBlock(
  src,
  '<div class="mode-overlay" id="modeOverlay"',
);
// Паритет клон-очистки buildModesExportSection [17575]: поле ввода
// (.mode-modal-params) в экспортируемой модалке отсутствует;
// #modeContent / #modeTabsBar в статической разметке уже пусты.
{
  const paramsBlock = extractDivBlock(
    modeOverlayHtml,
    '<div class="mode-modal-params">',
  );
  modeOverlayHtml = modeOverlayHtml.replace(paramsBlock, "");
}

for (const [name, html] of [
  ["gmOverlay", gmOverlayHtml],
  ["modeOverlay", modeOverlayHtml],
]) {
  if (html.includes("visible"))
    throw new Error(`Разметка ${name} содержит класс visible — очистка неполна`);
}

/* ── 3. Функции fnBundle [17691–17738] + константы constBundle [17742] ── */

// Порядок ВАЖЕН (хелперы перед потребителями) и повторяет fnBundle
// исходника дословно.
const FN_NAMES = [
  "normalizeName",
  "normalizeType",
  "parseTopology",
  "parseGraph",
  "_hexToHSL",
  "_hslToHex",
  "_blendHex",
  "_rebuildNodeColors",
  "_rebuildEdgeStyles",
  "edgeTypeStyle",
  "showNodePanel",
  "showEdgePanel",
  "typeColor",
  "typeColorHex",
  "getTopRole",
  "getStructuralMarkers",
  "getStructuralMarker",
  "polyPath",
  "hexStarPath",
  "trapezoidPath",
  "rectPath",
  "nodeSymbolPath",
  "nodeGeometry3D",
  "tick",
  "warmup",
  "mkSprite",
  "getRolesFromLayer",
  "getRolesForMode",
  "getAllRoles",
  "applyClusters3D",
  "applyClusters2D",
  "toggleClusters",
  "clearLegendFilter",
  "build3D",
  "build2D",
  "buildLegend",
  "switchView",
  "openGraph",
  "closeGraph",
  "downloadFile",
  "toggleExportMenu",
  "closeExportMenu",
  "doExport",
  "exportMMD",
  "exportPNG",
  "exportJSON",
];

const CONST_NAMES = [
  "_TC_HUE_SEEDS",
  "_EC_HUE_SEEDS",
  "_EC_DASH_SEEDS",
  "CPAL",
  "PROCEDURAL_PRIORITY",
  "STRUCTURAL_PRIORITY",
];

const tmp = mkdtempSync(path.join(tmpdir(), "export-assets-"));
let fnBundle;
let constBundle;
try {
  const specPath = path.join(tmp, "export-assets.spec");
  const outFns = path.join(tmp, "fns.js");
  const outConsts = path.join(tmp, "consts.js");

  // Извлечение — проверенным сборщиком комплектов (07 §1); две спеки,
  // чтобы функции и константы легли в раздельные файлы.
  writeFileSync(
    specPath,
    "## fnBundle buildGraphExportSection (порядок исходника)\n" +
      FN_NAMES.map((n) => "js:" + n).join("\n") +
      "\n",
    "utf8",
  );
  execFileSync(
    "python3",
    [path.join(ROOT, "scripts", "extract-by-name.py"), specPath, "-o", outFns],
    { stdio: "inherit" },
  );
  fnBundle = readFileSync(outFns, "utf8");

  writeFileSync(
    specPath,
    "## constBundle buildGraphExportSection\n" +
      CONST_NAMES.map((n) => "var:" + n).join("\n") +
      "\n",
    "utf8",
  );
  execFileSync(
    "python3",
    [
      path.join(ROOT, "scripts", "extract-by-name.py"),
      specPath,
      "-o",
      outConsts,
    ],
    { stdio: "inherit" },
  );
  constBundle = readFileSync(outConsts, "utf8");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// QC: каждое имя действительно объявлено в извлечённом тексте.
for (const n of FN_NAMES) {
  if (!new RegExp("function\\s+" + n + "\\s*\\(").test(fnBundle))
    throw new Error("fnBundle: не извлечена функция " + n);
}
for (const n of CONST_NAMES) {
  if (!new RegExp("(const|let|var)\\s+" + n + "\\b").test(constBundle))
    throw new Error("constBundle: не извлечена константа " + n);
}

/* ── 4. Запись TS-модуля ──────────────────────────────────────────────── */

const banner = `/**
 * АВТОГЕНЕРАТ scripts/extract-export-assets.mjs — НЕ ПРАВИТЬ РУКАМИ.
 * Перегенерация: node scripts/extract-export-assets.mjs (после обновления
 * source/philosynth.html).
 *
 * Ассеты автономного HTML-экспорта (беседа 4.2, html-exporter):
 *  - EXPORT_GRAPH_FN_BUNDLE — fnBundle buildGraphExportSection [17691–17738]
 *    дословно из исходника (граф-просмотрщик экспортируемого файла — это
 *    просмотрщик самого исходника, а не сериализация клиентских портов 1.7);
 *  - EXPORT_GRAPH_CONST_BUNDLE — constBundle [17742] (объявления констант
 *    дословно, эквивалент JSON.stringify рантайм-значений исходника);
 *  - EXPORT_GM_OVERLAY_HTML — статическая разметка #gmOverlay [4224]
 *    (клон-очистки исходника на статике вырождены: canvas/легенда пусты,
 *    таб 3D активен);
 *  - EXPORT_MODE_OVERLAY_HTML — #modeOverlay [4330] БЕЗ .mode-modal-params
 *    (паритет клон-очистки buildModesExportSection [17575]);
 *  - EXPORT_SOURCE_RAW_CSS — содержимое <style> исходника (rawCSS для
 *    auditCSS; в исходнике rawCSS собирался со всех <style> страницы —
 *    он один).
 */

`;

const ts =
  banner +
  "export const EXPORT_GRAPH_FN_BUNDLE: string = " +
  JSON.stringify(fnBundle) +
  ";\n\n" +
  "export const EXPORT_GRAPH_CONST_BUNDLE: string = " +
  JSON.stringify(constBundle) +
  ";\n\n" +
  "export const EXPORT_GM_OVERLAY_HTML: string = " +
  JSON.stringify(gmOverlayHtml) +
  ";\n\n" +
  "export const EXPORT_MODE_OVERLAY_HTML: string = " +
  JSON.stringify(modeOverlayHtml) +
  ";\n\n" +
  "export const EXPORT_SOURCE_RAW_CSS: string = " +
  JSON.stringify(extractCss(src)) +
  ";\n";

writeFileSync(OUT, ts, "utf8");
console.log(
  `export-assets: fnBundle ${fnBundle.length} симв. (${FN_NAMES.length} функций), ` +
    `constBundle ${constBundle.length} симв., gmOverlay ${gmOverlayHtml.length}, ` +
    `modeOverlay ${modeOverlayHtml.length}, CSS ${extractCss(src).length} → ${path.relative(ROOT, OUT)}`,
);
