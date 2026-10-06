/**
 * Смоук беседы 12.2 (запрос 1) — экспорт и граф: долги Д-9, Д-10, Д-29, Д-30,
 * Д-36, Д-37. Часть A — без БД (чистые функции); часть B — живая БД (свои
 * строки, чужого не трогаем); часть C — файл концепции (T122_FILE; без файла —
 * пропуск).
 *  A. Д-9: characteristicOf и разбор таблиц («0» → 0, пусто и «—» → 0.5), круг
 *     render → parse хранит 0; физика клиента и экспорта: связь силой 0 не
 *     тянет концы; просмотрщик экспортированного файла (бандл с надстройкой в
 *     vm) разбирает «0» как 0 и красит как клиент.
 *     Д-10: палитра {логическая, онтологическая, эпистемологическая,
 *     феноменологическая} — разные цвета в клиенте, в graph-style и в
 *     просмотрщике, тождественные между собой; сид по самому длинному ключу
 *     (275, а не 168); генерат без надстройки воспроизводит квирк.
 *     Д-29: renderDocTOC (порог, слуг ≡ клиенту, ⏫), addTocAnchors
 *     (идемпотентно), stripTocTraces, правила CSS переживают auditCSS.
 *     Д-30: блок древа — только при родителе-концепции, разметка, капсула
 *     узла файла; импорт читает капсулу из блока.
 *     Д-36: обе раскладки абзаца тезиса — разбор, сведение по метке, запись,
 *     круг parse → replace → parse. Д-37: название без ёлочки в трёх копиях.
 *  B. мета-синтез с родителем: экспорт несёт оглавление, якоря, древо,
 *     надстройку; экспорт → импорт: разделы без следов оглавления, 0 остаётся
 *     0, обоснования тезисов непусты; правка обоснования редактором 5.2 —
 *     patched, прочие абзацы блока целы; формулировка в прозе не затёрта;
 *     пустое обоснование в БД при непустой прозе — pending; правка абзаца
 *     «Обоснование.» в подразделе → theses.justification, версия 'manual'.
 *  C. файл концепции: импорт — следов оглавления в разделах нет, обоснование
 *     у каждого тезиса; экспорт импортированного — оглавление и древо.
 * Запуск: T122_FILE=… node_modules/.bin/tsx tests/smoke-122-request1.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

let ok = 0, bad = 0;
const t = (name, cond, extra = "") => { if (cond) { ok++; console.log(`  ✓ ${name}`); } else { bad++; console.log(`  ✗ ${name} ${extra}`); } };
const J = (v) => JSON.stringify(v);

const gp = await import("../server/services/graph-parser.ts");
const parser = await import("../server/services/element-parser.ts");
const renderer = await import("../server/services/element-renderer.ts");
const editor = await import("../server/services/element-editor.ts");
const imp = await import("../server/services/import-service.ts");
const gen = await import("../server/services/generation-service.ts");
const hp = await import("../server/utils/html-parser.ts");
const css = await import("../server/utils/css-audit.ts");
const exp = await import("../server/services/export/html-exporter.ts");
const gstyle = await import("../server/services/export/graph-style.ts");
const sphys = await import("../server/services/export/graph-physics.ts");
const assets = await import("../server/config/export-assets.ts");
const ov = await import("../server/config/export-viewer-overrides.ts");
const cgu = await import("../client/src/components/graph/graph-utils.ts");
const cphys = await import("../client/src/utils/graph-physics.ts");
const ctoc = await import("../client/src/components/document/TableOfContents.tsx");
const cgen = await import("../client/src/utils/genealogy.ts");

const tbl = (h, rows) => `<table class="doc-table"><thead><tr>${h.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>${b}</div>`;
const wrap = (num, title, b) => `<div class="doc-section"><div class="section-num">§ ${num}</div><div class="section-title">${title}</div><div class="doc-content">${b}</div></div>`;

/* ── Фикстуры ─────────────────────────────────────────────────────────── */
const CAT_H = ["Категория", "Тип", "Определение", "Центральность", "Определённость", "Происхождение"];
const EDGE_H = ["Источник", "Описание связи", "Цель", "Тип связи", "Направление", "Сила"];
const graphHtml = (cats, edges) => wrap(4, "Граф категорий",
  sub("Таблица категорий", tbl(CAT_H, cats)) + sub("Таблица связей", tbl(EDGE_H, edges)));
const CATS = [
  ["Логос", "логическая", "Мера речи", "0", "0.9", "Гераклит"],
  ["Бытие", "онтологическая", "То, что есть", "0.8", "0", "Парменид"],
  ["Знание", "эпистемологическая", "Обоснованное мнение", "", "—", "Платон"],
  ["Явление", "феноменологическая", "Данность сознанию", "0.4", "0.6", "Гуссерль"],
];
const EDGES = [
  ["Логос", "нулевая связь", "Бытие", "иерархическая", "однонаправленная", "0"],
  ["Бытие", "сильная связь", "Знание", "диалектическая", "двунаправленная", "0.9"],
  ["Знание", "связь без силы", "Явление", "каузальная", "однонаправленная", "—"],
];

const TH = ["№", "Формулировка тезиса", "Тип", "Степень новизны", "Связанные категории"];
/** Вторая раскладка — как в живом документе: формулировка в прозе ПЕРЕПИСАНА относительно таблицы */
const block = (label, title, proseF, just) =>
  `<h5>Тезис ${label} (${title})</h5>` +
  `<p><strong>${proseF}</strong></p>` +
  `<p><strong>Обоснование.</strong> ${just}</p>` +
  `<p><strong>Ограничения, преодолеваемые тезисом.</strong></p><ul><li><em>Ограничение Юнга:</em> текст ограничения ${label}.</li></ul>` +
  `<p><strong>Степень новизны:</strong> порождён зерном концепции.</p>` +
  `<p><strong>Связанные категории / понятия:</strong> логос, бытие.</p>`;
const thesesBlockHtml = wrap(3, "Корпус тезисов",
  sub("Онтологические тезисы",
    `<div class="callout note"><span class="callout-label">ЗАМЕЧАНИЕ</span> Вводное замечание.</div>` +
    block("О-1", "Архетип как матрица", "Архетип является не структурой целостности, но разломной матрицей — формой с назначением.", "Первое обоснование со ссылкой на § Граф.") +
    block("О-10", "Десятый", "Десятый тезис существует, чтобы метка О-1 не находилась в О-10.", "Обоснование десятого.")) +
  sub("Эпистемологические тезисы",
    block("Э-1", "Образ как артикуляция", "Архетипический образ есть форма двойной артикуляции в психическом регистре.", "Третье обоснование.")) +
  sub("Сводная таблица тезисов", tbl(TH, [
    ["О-1", "Архетип является разломной матрицей — онтологической формой", "Онтологический", "порождён", "Логос"],
    ["О-10", "Десятый тезис существует", "Онтологический", "порождён", "Бытие"],
    ["Э-1", "Архетипический образ является формой двойной артикуляции", "Эпистемологический", "порождён", "Знание"],
  ])));
/** Первая раскладка — документ службы (фикстура 12.1) */
const thesesInlineHtml = wrap(3, "Корпус тезисов",
  sub("Онтологические тезисы",
    "<p><strong>Бытие есть событие различия</strong> Потому что различие первично относительно тождества (§ Граф).</p>" +
    "<p><strong>Ничто не предшествует бытию</strong> Обоснование второго тезиса.</p>") +
  sub("Сводная таблица тезисов", tbl(TH, [
    ["1", "Бытие есть событие различия", "Онтологический", "высокая", "Бытие"],
    ["2", "Ничто не предшествует бытию", "Онтологический", "средняя", "Ничто"],
  ])));

console.log("A. чистые функции");
{
  // ── Д-9: разбор
  t("Д-9: characteristicOf — «0» → 0, «0.35» → 0.35", gp.characteristicOf("0") === 0 && gp.characteristicOf("0.35") === 0.35 && gp.characteristicOf("0,0") === 0);
  t("Д-9: characteristicOf — пусто, «—», текст, undefined → 0.5", [gp.characteristicOf(""), gp.characteristicOf("—"), gp.characteristicOf("высокая"), gp.characteristicOf(undefined)].every((v) => v === 0.5));
  const g = gp.parseGraphFromHTML(graphHtml(CATS, EDGES));
  t("Д-9: центральность «0» и определённость «0» разобраны как 0", g.nodes[0].cen === 0 && g.nodes[1].cert === 0, J(g.nodes.map((n) => [n.cen, n.cert])));
  t("Д-9: пустая ячейка и «—» — 0.5, как прежде", g.nodes[2].cen === 0.5 && g.nodes[2].cert === 0.5);
  t("Д-9: сила связи «0» → 0; «—» → 0.5; число — как есть", g.edges[0].str === 0 && g.edges[2].str === 0.5 && g.edges[1].str === 0.9, J(g.edges.map((e) => e.str)));
  t("Д-9: рендерер рисует 0 как «0» — круг render → parse хранит ноль", renderer.fmtNum(0) === "0" && gp.characteristicOf(renderer.fmtNum(0)) === 0);
  const gpSrc = readFileSync(new URL("../server/services/graph-parser.ts", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  t("Д-9: в коде graph-parser нет `|| 0.5`", !/\|\|\s*0?\.5(?![0-9])/.test(gpSrc));

  // ── Д-9: физика — связь силой 0 не тянет концы
  for (const [name, mod] of [["клиент", cphys], ["экспорт", sphys]]) {
    const mk = () => [{ x: -40, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, { x: 40, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }];
    const run = (str) => { const ns = mk(); mod.tick(ns, [{ si: 0, ti: 1, str }], 1); return ns[0].vx; };
    const noEdge = (() => { const ns = mk(); mod.tick(ns, [], 1); return ns[0].vx; })();
    t(`Д-9: физика (${name}) — связь силой 0 не тянет (как без связи), сила 0.5 тянет`, run(0) === noEdge && run(0.5) !== noEdge && run(undefined) === run(0.5), J([run(0), noEdge, run(0.5)]));
  }

  // ── Д-10: палитра
  const TYPES = ["логическая", "онтологическая", "эпистемологическая", "феноменологическая"];
  const nodes = TYPES.map((type, i) => ({ name: "N" + i, type, def: "", orig: "", cen: 0.5, cert: 0.5 }));
  const ETYPES = ["противоречие", "противоречие / корреляционная", "аналогия", "иерархическая"];
  const edges = ETYPES.map((type, i) => ({ src: "N0", tgt: "N" + ((i % 3) + 1), type, desc: "", dir: "однонаправленная", str: 0.5 }));
  cgu._rebuildNodeColors(nodes);
  cgu._rebuildEdgeStyles(edges);
  const cliColors = TYPES.map((x) => cgu.typeColorHex(x));
  t("Д-10 (клиент): четыре вложенных по названию типа — четыре разных цвета", new Set(cliColors).size === 4, J(cliColors));
  const hueOf = (hex) => Math.round(cgu._hexToHSL(parseInt(hex.slice(1), 16)).h);
  t("Д-10 (клиент): «феноменологическая» берёт свой сид 275, а не 168 «логическ»", Math.abs(hueOf(cliColors[3]) - 275) <= 2 && Math.abs(hueOf(cliColors[0]) - 168) <= 2, J(cliColors.map(hueOf)));
  t("Д-10 (клиент): сиды онтологическ 215 и эпистемологическ 145 на месте", Math.abs(hueOf(cliColors[1]) - 215) <= 2 && Math.abs(hueOf(cliColors[2]) - 145) <= 2);
  const gs = gstyle.createGraphStyle({ nodes, edges, topology: { clusters: {}, roles: { structural: {}, procedural: {} }, clusterLabels: [] } });
  t("Д-10 (экспорт graph-style): цвета узлов ≡ клиенту", J(TYPES.map((x) => gs.typeColorHex(x))) === J(cliColors), J(TYPES.map((x) => gs.typeColorHex(x))));
  t("Д-10: стили связей клиент ≡ экспорт", J(ETYPES.map((x) => gs.edgeTypeStyle(x))) === J(ETYPES.map((x) => cgu.edgeTypeStyle(x))));
  t("Д-10: строка вне палитры — запасным нечётким ходом (цвет есть), пустая — серый", cgu.typeColorHex("логическая категория") === cliColors[0] && cgu.typeColorHex("") === "#95a5a6");
  // Порядок, в котором квирк проявлялся: «логическая» в палитре раньше остальных
  const viewer = (bundle) => {
    const ctx = vm.createContext({ console, document: {}, window: {} });
    vm.runInContext(
      assets.EXPORT_GRAPH_CONST_BUNDLE + "\nvar _nodeColorMap = new Map(); var _edgeStyleMap = new Map();\n" + bundle +
      "\nthis.api = { _rebuildNodeColors, _rebuildEdgeStyles, typeColorHex, edgeTypeStyle, parseGraph, tick };", ctx);
    return ctx.api;
  };
  const patched = ov.applyExportViewerOverrides(assets.EXPORT_GRAPH_FN_BUNDLE);
  const vNew = viewer(patched);
  vNew._rebuildNodeColors(nodes); vNew._rebuildEdgeStyles(edges);
  t("Д-10 (просмотрщик экспортированного файла): цвета узлов ≡ клиенту", J(TYPES.map((x) => vNew.typeColorHex(x))) === J(cliColors), J(TYPES.map((x) => vNew.typeColorHex(x))));
  t("Д-10 (просмотрщик): стили связей ≡ клиенту", J(ETYPES.map((x) => vNew.edgeTypeStyle(x))) === J(ETYPES.map((x) => cgu.edgeTypeStyle(x))));
  const vOld = viewer(assets.EXPORT_GRAPH_FN_BUNDLE);
  vOld._rebuildNodeColors(nodes);
  t("Д-10: генерат БЕЗ надстройки воспроизводит квирк исходника (типы схлопываются в один цвет)", new Set(TYPES.map((x) => vOld.typeColorHex(x))).size < 4, J(TYPES.map((x) => vOld.typeColorHex(x))));
  // Просмотрщик: разбор «0» (linkedom вместо DOM браузера)
  const ct = hp.parseFragment(graphHtml(CATS, EDGES));
  const pNew = vNew.parseGraph(ct), pOld = vOld.parseGraph(ct);
  t("Д-9 (просмотрщик): «0» разобран как 0, «—» — 0.5", pNew.nodes[0].cen === 0 && pNew.nodes[1].cert === 0 && pNew.edges[0].str === 0 && pNew.nodes[2].cen === 0.5 && pNew.edges[2].str === 0.5, J([pNew.nodes.map((n) => [n.cen, n.cert]), pNew.edges.map((e) => e.str)]));
  t("Д-9: генерат БЕЗ надстройки читает «0» как 0.5 (квирк исходника)", pOld.nodes[0].cen === 0.5 && pOld.edges[0].str === 0.5);
  const mk = () => [{ x: -40, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, { x: 40, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }];
  const vtick = (v, es) => { const ns = mk(); v.tick(ns, es, 1); return ns[0].vx; };
  t("Д-9 (просмотрщик): связь силой 0 не тянет концы; без надстройки — тянет как 0.5", vtick(vNew, [{ si: 0, ti: 1, str: 0 }]) === vtick(vNew, []) && vtick(vOld, [{ si: 0, ti: 1, str: 0 }]) === vtick(vOld, [{ si: 0, ti: 1, str: 0.5 }]));
  for (const rel of ["../client/src/components/graph/Graph2D.tsx", "../client/src/components/graph/Graph3D.tsx", "../client/src/components/graph/EdgePanel.tsx", "../client/src/components/graph/NodePanel.tsx", "../client/src/utils/graph-physics.ts", "../server/services/export/graph-physics.ts", "../server/services/export/mmd-exporter.ts", "../server/services/export/png-exporter.ts"]) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    if (/\|\|\s*0?\.[15](?![0-9])/.test(src)) t(`Д-9: в ${rel} нет \`|| 0.5\` / \`|| 0.1\``, false);
  }
  t("Д-9: `|| 0.5` и `|| 0.1` нет ни в клиентском графе, ни в экспортных двойниках", true);

  // ── Д-29: оглавление
  const toc = exp.renderDocTOC([
    { key: "sum", sectionNum: 1, title: "Резюме", subsections: ["Цели и задачи", "Портрет каждого философа"] },
    { key: "graph", sectionNum: 4, title: "Граф", subsections: ["Таблица категорий"] },
  ]);
  t("Д-29: оглавление — <details open id=docTOC class=doc-body>, «Содержание»", toc.startsWith('<details open id="docTOC" class="doc-body">') && toc.includes('<span class="toc-arrow">▶</span> Содержание'));
  t("Д-29: ссылки на разделы «§ N — метка» и подразделы", toc.includes('<a href="#sec-sum">§ 1 — ') && toc.includes('<a href="#sec-graph">§ 4 — ') && toc.includes(`href="#subsec-sum-Цели_и_задачи"`) && toc.includes(">Портрет каждого философа</a>"));
  t("Д-29: порог — меньше двух разделов оглавления нет", exp.renderDocTOC([{ key: "sum", sectionNum: 1, title: "Резюме", subsections: [] }]) === "" && exp.TOC_MIN_SECTIONS === 2);
  const names = ["Цели и задачи", "Портрет каждого философа", "«Капсула» (ёлочки, скобки) — v2.1", "Таблица связей"];
  t("Д-29: слуг якоря ≡ клиентскому subsectionSlugId", names.every((n) => hp.subsectionAnchorId("sum", n) === ctoc.subsectionSlugId("sum", n)), J(names.map((n) => hp.subsectionAnchorId("sum", n))));
  const secHtml = wrap(1, "Резюме", sub("Цели и задачи", "<p>Текст.</p>") + sub("Портрет", "<p>Ещё.</p>"));
  const withToc = hp.addTocAnchors(secHtml, "sum", ["Цели и задачи", "Портрет"]);
  t("Д-29: addTocAnchors — якорь первым узлом подраздела, ⏫ в заголовке раздела и в <h4>",
    withToc.includes('<div data-section="Цели и задачи"><a id="subsec-sum-Цели_и_задачи"></a><h4>Цели и задачи<a href="#docTOC" class="toc-back-btn" title="К содержанию">⏫</a></h4>') &&
    withToc.includes('<div class="section-title">Резюме<a href="#docTOC" class="toc-back-btn"'), withToc.slice(0, 500));
  t("Д-29: addTocAnchors идемпотентен (документ из одностраничника уже несёт якоря)", hp.addTocAnchors(withToc, "sum", ["Цели и задачи", "Портрет"]) === withToc);
  const stripped = hp.stripTocTraces(withToc);
  t("Д-29: stripTocTraces снимает ⏫ и якоря — остаётся исходная разметка", stripped.html === secHtml && stripped.removed === 5, String(stripped.removed));
  t("Д-29: stripTocTraces не трогает раздел без следов и якорь с содержимым", hp.stripTocTraces(secHtml).html === secHtml && hp.stripTocTraces('<p><a id="subsec-x">текст</a></p>').removed === 0);
  const audited = css.auditCSS(assets.EXPORT_SOURCE_RAW_CSS, toc + withToc);
  t("Д-29: правила #docTOC, .toc-body, .toc-sub-link и .toc-back-btn переживают auditCSS", ["#docTOC {", "#docTOC summary", ".toc-body {", ".toc-section-link a", ".toc-sub-link {", ".toc-back-btn {", ".toc-back-btn:hover"].every((r) => audited.includes(r)));
  t("Д-29: без оглавления в содержимом .toc-back-btn вырезается (аудит работает)", !css.auditCSS(assets.EXPORT_SOURCE_RAW_CSS, secHtml).includes(".toc-back-btn {"));

  // ── Д-30: древо
  const lineage = {
    type: "synthesis", name: "Корень", synthesisId: "r", depth: 0, children: [
      { type: "philosopher", name: "Юнг", depth: 1, children: [] },
      { type: "synthesis", name: "Грамматика самоотрицания", depth: 1, fromFile: true, method: "creative", synthLevel: "generative", generationOrder: "genetic", seed: "Зерно родителя", capsule: "Капсула родителя: <текст> & ещё.", children: [
        { type: "philosopher", name: "Шестов", depth: 2, fromFile: true, children: [] }] },
      { type: "synthesis", name: "Родитель из базы", synthesisId: "p2", depth: 1, children: [] },
    ],
  };
  const root = exp.lineageTreeToExportGenealogy(lineage, { name: "Вмещающий разлом", method: "dialectical", synthLevel: "generative", generationOrder: "architectural", seed: "З".repeat(100) });
  const tree = exp.renderGenealogyDisclosure(root);
  t("Д-30: блок шапки — details.header-disclosure.header-disclosure-genealogy open, «Генеалогическое древо»", tree.startsWith('<details class="header-disclosure header-disclosure-genealogy" open><summary>Генеалогическое древо</summary><div class="disclosure-body"'));
  t("Д-30: корень — имя концепции, мета-строка, зерно усечено до 80 знаков", tree.includes('<div class="gen-tree"><div class="gen-card"><div class="gen-card-name">◈ Вмещающий разлом</div><div class="gen-card-meta">Диалектический × Порождающий · архитект.</div>') && tree.includes("«" + "З".repeat(80) + "…»"), tree.slice(0, 400));
  t("Д-30: родитель-концепция с философами, философ — .gen-phil", tree.includes('<div class="gen-card-name">◈ Грамматика самоотрицания</div><div class="gen-card-meta">Творческий × Порождающий · генетич.</div>') && tree.includes('<div class="gen-phil"><div class="gen-phil-name">Шестов</div></div>') && tree.includes('<div class="gen-phil-name">Юнг</div>'));
  t("Д-30: зерно и капсула родителя — раскрывающиеся блоки, текст экранирован", tree.includes('<details class="gen-card-seed-details"><summary>Зерно</summary><div class="gen-card-seed-details-body">«Зерно родителя»</div></details>') && tree.includes('<details class="gen-card-capsule"><summary>Капсула</summary><div class="gen-card-capsule-body">Капсула родителя: &lt;текст&gt; &amp; ещё.</div></details>'));
  t("Д-30: узел базы без параметров — без мета-строки «? × ?»", tree.includes('<div class="gen-card"><div class="gen-card-name">◈ Родитель из базы</div></div>'));
  t("Д-30: у одних философов (не мета-синтез) блока нет", exp.renderGenealogyDisclosure(exp.lineageTreeToExportGenealogy({ type: "synthesis", name: "К", depth: 0, children: [{ type: "philosopher", name: "Кант", depth: 1, children: [] }] })) === "");
  const gnode = { type: "concept", name: "Вмещающий разлом", participants: [{ type: "philosopher", name: "Юнг" }, { type: "concept", name: "Грамматика самоотрицания", participants: [] }] };
  imp.restoreCapsulesFromHTML(gnode, hp.parseDocument(`<html><body><div id="docOutput"><div class="doc-header">${tree}</div></div></body></html>`));
  t("Д-30: импорт берёт из блока древа капсулу родителя (restoreCapsulesFromHTML)", gnode.participants[1].capsule === "Капсула родителя: <текст> & ещё.", J(gnode.participants[1]));
  const meta = imp.extractMetadata(hp.parseDocument(`<html><body><div id="docOutput"><div class="doc-header"><div class="doc-title">Т</div><details class="header-disclosure"><summary>Зерно концепции</summary><div class="disclosure-body">настоящее зерно</div></details>${tree}</div></div></body></html>`));
  t("Д-30: блок древа не читается импортом как зерно или контекст", meta.seed === "настоящее зерно" && !meta.ctx, J([meta.seed, meta.ctx]));
  t("Д-30: правила .gen-tree и .header-disclosure переживают auditCSS", (() => { const a = css.auditCSS(assets.EXPORT_SOURCE_RAW_CSS, tree); return a.includes(".gen-tree {") && a.includes(".gen-card-capsule-body") && a.includes(".header-disclosure"); })());

  // ── Д-36: вторая модель абзаца тезиса
  const th2 = parser.parseThesesFromHTML(thesesBlockHtml);
  t("Д-36: вторая раскладка — обоснование у каждого тезиса, по МЕТКЕ в <h5>", J(th2.map((x) => [x.label, x.justification])) === J([["О-1", "Первое обоснование со ссылкой на § Граф."], ["О-10", "Обоснование десятого."], ["Э-1", "Третье обоснование."]]), J(th2.map((x) => [x.label, x.justification])));
  t("Д-36: формулировка тезиса — табличная (проза переписана и её не подменяет)", th2[0].formulation === "Архетип является разломной матрицей — онтологической формой");
  const th1 = parser.parseThesesFromHTML(thesesInlineHtml);
  t("Д-36: первая раскладка (документ службы) разбирается как прежде", J(th1.map((x) => [x.thesisNum, x.label, x.justification])) === J([[1, null, "Потому что различие первично относительно тождества (§ Граф)."], [2, null, "Обоснование второго тезиса."]]), J(th1));
  t("Д-36: thesisLabelIndex — «О-1» не находится в «О-10», «1» — в «О-1» и «11»; «2.» ≡ «2»", hp.thesisLabelIndex("Тезис О-10 (Десятый)", "О-1") === -1 && hp.thesisLabelIndex("Тезис О-1 (Первый)", "О-1") === 6 && hp.thesisLabelIndex("Тезис О-1", "1") === -1 && hp.thesisLabelIndex("Тезис 11", "1") === -1 && hp.thesisLabelIndex("Тезис 2. Название", "2.") === 6);
  const srcOf = (html, name) => hp.readSubsectionSource(html, name).html;
  const paras = parser.parseThesisParagraphs(srcOf(thesesBlockHtml, "Онтологические тезисы"));
  t("Д-36: parseThesisParagraphs — блок даёт ОДИН абзац с заголовком; «Ограничения…», «Степень новизны» абзацами тезиса не считаются", paras.length === 2 && paras[0].heading === "Тезис О-1 (Архетип как матрица)" && paras[0].justification === "Первое обоснование со ссылкой на § Граф." && paras[0].formulation.startsWith("Архетип является не структурой") && paras[1].heading.startsWith("Тезис О-10"), J(paras));
  t("Д-36: parseThesisParagraphs первой раскладки — без изменений (нет heading)", J(parser.parseThesisParagraphs(srcOf(thesesInlineHtml, "Онтологические тезисы"))) === J([{ formulation: "Бытие есть событие различия", justification: "Потому что различие первично относительно тождества (§ Граф)." }, { formulation: "Ничто не предшествует бытию", justification: "Обоснование второго тезиса." }]));
  // запись
  const blk = hp.readThesisBlock(thesesBlockHtml, "О-1");
  t("Д-36: readThesisBlock находит блок по метке", blk?.heading === "Тезис О-1 (Архетип как матрица)" && blk.justification.startsWith("Первое обоснование") && hp.readThesisBlock(thesesBlockHtml, "О-2") === null);
  const p1 = hp.replaceThesisBlock(thesesBlockHtml, "О-1", { justification: "Новое обоснование <с> знаками & амперсандом." });
  t("Д-36: обоснование пишется в абзац «Обоснование.», жирное начало сохранено", p1.patched.join() === "justification" && p1.html.includes("<p><strong>Обоснование.</strong> Новое обоснование &lt;с&gt; знаками &amp; амперсандом.</p>"));
  t("Д-36: прочие абзацы блока и соседние блоки целы", ["<p><strong>Архетип является не структурой целостности, но разломной матрицей — формой с назначением.</strong></p>", "текст ограничения О-1.", "<p><strong>Степень новизны:</strong> порождён зерном концепции.</p>", "<p><strong>Обоснование.</strong> Обоснование десятого.</p>", "<p><strong>Обоснование.</strong> Третье обоснование.</p>", "Вводное замечание."].every((x) => p1.html.includes(x)) && p1.html.length - thesesBlockHtml.length === "Новое обоснование &lt;с&gt; знаками &amp; амперсандом.".length - "Первое обоснование со ссылкой на § Граф.".length);
  const p2 = hp.replaceThesisBlock(thesesBlockHtml, "Э-1", { formulation: "Новая формулировка образа." });
  t("Д-36: формулировка пишется в абзац формулировки, обоснование не тронуто", p2.patched.join() === "formulation" && p2.html.includes("<h5>Тезис Э-1 (Образ как артикуляция)</h5><p><strong>Новая формулировка образа.</strong></p><p><strong>Обоснование.</strong> Третье обоснование.</p>"));
  t("Д-36: replaceThesisParagraph с меткой — вторая модель; без изменённой формулировки абзац формулировки цел", (() => { const r = hp.replaceThesisParagraph(thesesBlockHtml, "f", "f", "Через обёртку.", "О-10"); return r.includes("<p><strong>Обоснование.</strong> Через обёртку.</p>") && r.includes("Десятый тезис существует, чтобы метка О-1 не находилась в О-10."); })());
  t("Д-36: replaceThesisParagraph без метки и с меткой без блока — первая модель, как прежде", hp.replaceThesisParagraph(thesesInlineHtml, "Бытие есть событие различия", "Бытие и есть событие", "Иное.", "1") === hp.replaceThesisParagraph(thesesInlineHtml, "Бытие есть событие различия", "Бытие и есть событие", "Иное.") && hp.replaceThesisParagraph(thesesInlineHtml, "Бытие есть событие различия", "Бытие и есть событие", "Иное.").includes("<p><strong>Бытие и есть событие</strong> Иное.</p>"));
  // круг parse → replace → parse, обе раскладки
  const round2 = parser.parseThesesFromHTML(hp.replaceThesisParagraph(thesesBlockHtml, th2[2].formulation, th2[2].formulation, "Обоснование после круга.", "Э-1"));
  t("Д-36: круг parse → replaceThesisParagraph → parse (вторая раскладка)", round2[2].justification === "Обоснование после круга." && round2[0].justification === th2[0].justification && round2[2].formulation === th2[2].formulation, J(round2.map((x) => x.justification)));
  const round1 = parser.parseThesesFromHTML(hp.replaceThesisParagraph(thesesInlineHtml, th1[1].formulation, th1[1].formulation, "Обоснование после круга."));
  t("Д-36: круг parse → replaceThesisParagraph → parse (первая раскладка)", round1[1].justification === "Обоснование после круга." && round1[0].justification === th1[0].justification);
  // сведение по метке
  const rows = [{ id: "a", thesisNum: 1, label: "О-1", formulation: th2[0].formulation, justification: th2[0].justification }, { id: "b", thesisNum: 2, label: "О-10", formulation: th2[1].formulation, justification: th2[1].justification }];
  const after = (edit) => parser.parseThesisParagraphs(srcOf(edit(thesesBlockHtml), "Онтологические тезисы"));
  let plan = editor.planThesisProseSync(rows, paras, after((h) => h.replace("Первое обоснование со ссылкой на § Граф.", "Обоснование, исправленное человеком.")));
  t("Д-36: правка абзаца «Обоснование.» сводится с тезисом по метке — обновляется justification", plan.updates.length === 1 && plan.updates[0].row.id === "a" && plan.updates[0].justification === "Обоснование, исправленное человеком." && plan.updates[0].formulation === undefined && plan.warnings.length === 0, J(plan));
  plan = editor.planThesisProseSync(rows, paras, after((h) => h.replace("Десятый тезис существует, чтобы", "Десятый тезис написан, чтобы")));
  t("Д-36: формулировка в прозе отличалась от табличной — правка её в список не идёт, предупреждение", plan.updates.length === 0 && plan.warnings.length === 1 && plan.warnings[0].includes("О-10"), J(plan));
  plan = editor.planThesisProseSync(rows, paras, after((h) => h.replace("текст ограничения О-1.", "ограничение переписано.").replace("порождён зерном концепции", "иная новизна")));
  t("Д-36: правка прочих абзацев блока — ни обновлений, ни предупреждений", plan.updates.length === 0 && plan.warnings.length === 0, J(plan));
  plan = editor.planThesisProseSync([{ ...rows[0], justification: "Правка редактора, не отражённая в прозе." }, rows[1]], paras, after((h) => h.replace("Обоснование десятого.", "Десятое, новое.")));
  t("Д-36: нетронутый блок не сверяется с БД (pending редактора не затирается)", plan.updates.length === 1 && plan.updates[0].row.id === "b", J(plan));

  // ── Д-37: название
  const nameHtml = (strong) => wrap(6, "Название концепции", sub("Итоговая рекомендация", `<p><strong>${strong}</strong></p>`));
  const cases = [["«Вмещающий разлом»: онтология архетипа", "Вмещающий разлом"], ["Итоговая рекомендация: «Плерома различия»: очерк", "Плерома различия"], ["«Плерома различия»", "Плерома различия"], ["Плерома: очерк", "Плерома"], ["\"Логос\": о мере", "Логос"]];
  t("Д-37: extractTitleFromNameHtml — без хвостовой ёлочки", cases.every(([a, b]) => gen.extractTitleFromNameHtml(nameHtml(a)) === b), J(cases.map(([a]) => gen.extractTitleFromNameHtml(nameHtml(a)))));
  const fileOf = (strong, attr) => hp.parseDocument(`<html><body><div id="docOutput"><div class="doc-title" id="docTitle">Синтез Философской Концепции</div><div class="doc-body"${attr}>${nameHtml(strong)}</div></div></body></html>`);
  t("Д-37: resolveConceptName импорта — без хвостовой ёлочки", cases.every(([a, b]) => imp.resolveConceptName(fileOf(a, "")) === b), J(cases.map(([a]) => imp.resolveConceptName(fileOf(a, "")))));
  t("Д-37: resolveConceptName клиента (utils/genealogy) — без хвостовой ёлочки", cases.every(([a, b]) => cgen.resolveConceptName(fileOf(a, ' data-section-key="name"')) === b), J(cases.map(([a]) => cgen.resolveConceptName(fileOf(a, ' data-section-key="name"')))));
}

/* ── B. живая БД ─────────────────────────────────────────────────────── */
let db, schema, eq, and, asc, dbUp = false;
try {
  ({ db, schema } = await import("../server/db/index.ts"));
  ({ eq, and, asc } = await import("drizzle-orm"));
  await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  dbUp = true;
} catch (e) {
  console.log("B. БД недоступна — пропуск:", e?.cause?.code ?? e?.message);
}

if (dbUp) {
  console.log("B. живая БД");
  const tag = "sm122-" + Math.random().toString(36).slice(2, 8);
  const [owner] = await db.insert(schema.users).values({ email: `${tag}-o@sm.local`, passwordHash: "x" }).returning();
  const ids = [];
  const mkSynth = async (o = {}) => {
    const [s] = await db.insert(schema.syntheses).values({ userId: owner.id, seed: "зерно " + tag, title: tag, status: "ready", sectionOrder: ["sum", "theses", "graph", "name"], ...o }).returning();
    ids.push(s.id);
    return s;
  };
  const secRow = async (sid, key) => (await db.select().from(schema.sections).where(and(eq(schema.sections.synthesisId, sid), eq(schema.sections.key, key))))[0];
  const thesesOf = (sid) => db.select().from(schema.theses).where(eq(schema.theses.synthesisId, sid)).orderBy(asc(schema.theses.thesisNum));
  const catsOf = (sid) => db.select().from(schema.categories).where(eq(schema.categories.synthesisId, sid)).orderBy(asc(schema.categories.position));
  const edgesOf = (sid) => db.select().from(schema.categoryEdges).where(eq(schema.categoryEdges.synthesisId, sid)).orderBy(asc(schema.categoryEdges.position));
  const count = (s, frag) => s.split(frag).length - 1;

  try {
    // Родитель-концепция и мета-синтез: разделы строками, гранулярные таблицы — парсерами 1.4 (урок 5.1)
    const parent = await mkSynth({ title: "Родитель " + tag, capsuleHtml: "<p>Капсула родителя.</p>" });
    await db.insert(schema.synthesisLineage).values({ synthesisId: parent.id, parentType: "philosopher", parentName: "Шестов", position: 0 });
    const s = await mkSynth({ title: "Мета " + tag, capsuleHtml: wrap(0, "Капсула", sub("Капсула", "<p>Капсула мета-синтеза.</p>")) });
    await db.insert(schema.synthesisLineage).values([
      { synthesisId: s.id, parentType: "philosopher", parentName: "Юнг", position: 0 },
      { synthesisId: s.id, parentType: "synthesis", parentSynthesisId: parent.id, position: 1 },
    ]);
    const sumHtml = wrap(1, "Резюме", sub("Цели и задачи", "<p>Цели.</p>") + sub("Портрет каждого участника синтеза", "<p>Портреты.</p>"));
    const gHtml = graphHtml(CATS, EDGES);
    const nHtml = wrap(6, "Название концепции", sub("Итоговая рекомендация", `<p><strong>«Мета ${tag}»: подзаголовок</strong></p>`));
    await db.insert(schema.sections).values([
      { synthesisId: s.id, key: "sum", sectionNum: 1, title: "Резюме", htmlContent: sumHtml },
      { synthesisId: s.id, key: "theses", sectionNum: 3, title: "Корпус тезисов", htmlContent: thesesBlockHtml },
      { synthesisId: s.id, key: "graph", sectionNum: 4, title: "Граф категорий", htmlContent: gHtml },
      { synthesisId: s.id, key: "name", sectionNum: 6, title: "Название концепции", htmlContent: nHtml },
    ]);
    await gp.saveGraphToDb(s.id, gp.parseGraphFromHTML(gHtml));
    await parser.saveElementsToDb(s.id, "theses", { theses: parser.parseThesesFromHTML(thesesBlockHtml) });

    let cats = await catsOf(s.id), eds = await edgesOf(s.id);
    t("Д-9: в БД центральность 0, определённость 0, сила связи 0 — а не 0.5", cats[0].centrality === 0 && cats[1].certainty === 0 && eds[0].strength === 0 && cats[2].centrality === 0.5 && eds[2].strength === 0.5, J([cats.map((c) => [c.centrality, c.certainty]), eds.map((e) => e.strength)]));
    let th = await thesesOf(s.id);
    t("Д-36: разбор второй раскладки пишет theses.justification", th.length === 3 && th.every((x) => x.justification !== "") && th[0].label === "О-1", J(th.map((x) => [x.label, x.justification])));

    // ── Экспорт
    const file = await exp.exportHTML(s.id);
    t("Д-29: в выгрузке оглавление со ссылками на все разделы", count(file, 'id="docTOC"') === 1 + count(assets.EXPORT_SOURCE_RAW_CSS, 'id="docTOC"') && ["sum", "theses", "graph", "name"].every((k) => file.includes(`<a href="#sec-${k}">§ `) && file.includes(`<a id="sec-${k}"></a>`)));
    const subLinks = [...file.matchAll(/<p class="toc-sub-link"><a href="#(subsec-[^"]+)">/g)].map((m) => m[1]);
    t("Д-29: каждая ссылка подраздела ведёт к существующему якорю; ⏫ ведёт к оглавлению", subLinks.length === 8 && subLinks.every((id) => count(file, `<a id="${id}"></a>`) === 1) && count(file, '<a href="#docTOC" class="toc-back-btn"') === 4 + 8, J([subLinks.length, count(file, 'class="toc-back-btn"')]));
    t("Д-29: оглавление стоит между шапкой и первым разделом", file.indexOf('class="doc-meta-grid"') < file.indexOf('<details open id="docTOC"') && file.indexOf('<details open id="docTOC"') < file.indexOf('<a id="sec-sum">'));
    t("Д-29: стили оглавления в файле (auditCSS не вырезал)", file.includes("#docTOC {") && file.includes(".toc-back-btn {") && file.includes(".toc-sub-link {"));
    t("Д-30: в шапке блок «Генеалогическое древо» с родителем и его философами", file.includes('header-disclosure-genealogy" open><summary>Генеалогическое древо</summary>') && file.includes(`◈ Родитель ${tag}`) && file.includes('<div class="gen-phil-name">Шестов</div>') && file.includes('<div class="gen-phil-name">Юнг</div>') && file.indexOf("header-disclosure-genealogy\" open") < file.indexOf('class="doc-meta-grid"'));
    t("Д-30: стили древа в файле", file.includes(".gen-tree {") && file.includes(".gen-phil-name"));
    t("Д-9/Д-10: просмотрщик в файле несёт надстройку", ov.EXPORT_VIEWER_OVERRIDE_MARKERS.every((m) => file.includes(m)) && !/\|\| 0\.5(?![0-9])/.test(file.slice(file.indexOf("function parseGraph("), file.indexOf("window.openGraph"))));
    const plain = await mkSynth({ title: "Без родителей " + tag, sectionOrder: ["sum"] });
    await db.insert(schema.synthesisLineage).values({ synthesisId: plain.id, parentType: "philosopher", parentName: "Кант", position: 0 });
    await db.insert(schema.sections).values({ synthesisId: plain.id, key: "sum", sectionNum: 1, title: "Резюме", htmlContent: hp.addTocAnchors(sumHtml, "sum", ["Цели и задачи"]) });
    const plainFile = await exp.exportHTML(plain.id);
    t("Д-30/Д-29: не мета-синтез с одним разделом — ни древа, ни оглавления, ни ⏫ в теле", !plainFile.includes('header-disclosure-genealogy" open') && !plainFile.includes('<details open id="docTOC"') && !plainFile.includes('class="toc-back-btn"') && !plainFile.includes('<a id="subsec-'));

    // ── Экспорт → импорт
    const res = await imp.importHTML(file, owner.id, "meta.html");
    ids.push(res.synthesisId);
    const iSecs = await db.select().from(schema.sections).where(eq(schema.sections.synthesisId, res.synthesisId));
    t("Д-29: после импорта в разделах нет ни ⏫, ни якорей subsec-…", iSecs.length === 4 && iSecs.every((x) => !x.htmlContent.includes("toc-back-btn") && !x.htmlContent.includes('id="subsec-') && !x.htmlContent.includes("⏫") && !x.title.includes("⏫")), J(iSecs.map((x) => [x.key, x.title])));
    t("Д-29: разметка раздела после круга — та же, что до экспорта", (await secRow(res.synthesisId, "theses")).htmlContent === thesesBlockHtml && (await secRow(res.synthesisId, "sum")).htmlContent === sumHtml);
    cats = await catsOf(res.synthesisId); eds = await edgesOf(res.synthesisId);
    t("Д-9: круг экспорт → импорт сохраняет ноль характеристики", cats[0].centrality === 0 && cats[1].certainty === 0 && eds[0].strength === 0, J([cats.map((c) => c.centrality), eds.map((e) => e.strength)]));
    const { getAncestors } = await import("../server/services/lineage-service.ts");
    const strip = (n) => ({ type: n.type, name: n.name, children: n.children.map(strip) });
    t("Д-30: дерево после импорта прежнее (блок древа структуру не подменяет)", J(strip(await getAncestors(res.synthesisId)).children) === J(strip(await getAncestors(s.id)).children), J(strip(await getAncestors(res.synthesisId))));
    const again = await exp.exportHTML(res.synthesisId);
    t("Д-29/Д-30: повторная выгрузка импортированного — то же оглавление и древо", count(again, 'class="toc-back-btn"') === count(file, 'class="toc-back-btn"') && again.includes('header-disclosure-genealogy" open'));
    th = await thesesOf(res.synthesisId);
    t("Д-36: после импорта theses.justification непуст у каждого тезиса", th.length === 3 && th.every((x) => x.justification !== ""), J(th.map((x) => x.justification)));

    // ── Правка редактором 5.2
    let upd = await editor.updateThesis(res.synthesisId, th[0].id, { justification: "Обоснование из редактора." });
    let html = (await secRow(res.synthesisId, "theses")).htmlContent;
    t("Д-36: правка обоснования редактором — patched, не pending; абзац «Обоснование.» изменён", upd.htmlSync.patched.includes("thesis.justification") && upd.htmlSync.pending.length === 0 && html.includes("<p><strong>Обоснование.</strong> Обоснование из редактора.</p>"), J(upd.htmlSync));
    t("Д-36: формулировка в прозе и прочие абзацы блока целы", html.includes("<p><strong>Архетип является не структурой целостности, но разломной матрицей — формой с назначением.</strong></p>") && html.includes("текст ограничения О-1.") && html.includes("<p><strong>Обоснование.</strong> Обоснование десятого.</p>"));
    upd = await editor.updateThesis(res.synthesisId, th[2].id, { formulation: "Образ есть двойная артикуляция (правка редактора)" });
    html = (await secRow(res.synthesisId, "theses")).htmlContent;
    t("Д-36: правка формулировки редактором — в абзац формулировки и в сводную таблицу; обоснование не тронуто", upd.htmlSync.patched.includes("thesis.formulation") && html.includes("<h5>Тезис Э-1 (Образ как артикуляция)</h5><p><strong>Образ есть двойная артикуляция (правка редактора)</strong></p><p><strong>Обоснование.</strong> Третье обоснование.</p>") && html.includes("<td>Образ есть двойная артикуляция (правка редактора)</td>"), J(upd.htmlSync));
    // концепция, импортированная ДО 12.2: в БД обоснование пусто, в прозе есть
    await db.update(schema.theses).set({ justification: "" }).where(eq(schema.theses.id, th[1].id));
    upd = await editor.updateThesis(res.synthesisId, th[1].id, { justification: "Одна фраза вместо невиденного текста." });
    html = (await secRow(res.synthesisId, "theses")).htmlContent;
    t("Д-36: обоснование в БД было пусто, а в прозе есть — проза не затёрта, поле в pending", upd.htmlSync.pending.includes("thesis.justification") && !upd.htmlSync.patched.includes("thesis.justification") && html.includes("<p><strong>Обоснование.</strong> Обоснование десятого.</p>"), J(upd.htmlSync));
    upd = await editor.updateThesis(res.synthesisId, th[1].id, { noveltyDegree: "иная" });
    t("Д-36: правка поля вне прозы блок не трогает и pending не даёт", upd.htmlSync.patched.length === 0 && upd.htmlSync.pending.length === 0, J(upd.htmlSync));

    // ── Правка подраздела (9.2 → сведение 12.1) на второй раскладке
    const src = (await editor.getSubsectionSource(res.synthesisId, "theses", "Эпистемологические тезисы")).html;
    const r = await editor.updateSubsection(res.synthesisId, "theses", "Эпистемологические тезисы", src.replace("Третье обоснование.", "Третье обоснование, исправленное в подразделе."));
    th = await thesesOf(res.synthesisId);
    const vers = await db.select().from(schema.elementVersions).where(and(eq(schema.elementVersions.elementId, th[2].id), eq(schema.elementVersions.elementType, "thesis")));
    t("Д-36: правка абзаца «Обоснование.» в подразделе → theses.justification обновлён, версия 'manual'", th[2].justification === "Третье обоснование, исправленное в подразделе." && r.thesesUpdated?.length === 1 && r.thesesUpdated[0].label === "Э-1" && J(r.thesesUpdated[0].fields) === J(["justification"]) && vers.some((v) => v.changeSource === "manual") && r.warnings.length === 0, J([r.thesesUpdated, r.warnings]));

    // ── Д-37: имя концепции, которое импорт извлекает из раздела name выгрузки
    // (resolveConceptName: название-заглушка в шапке → раздел «name», его
    // заголовок в файле несёт ⏫; имя идёт корню генеалогии файла без
    // встроенного состояния — в syntheses.title импорт пишет шапку как есть)
    const placeholderFile = file.replace(/<div class="doc-title">[^<]*<\/div>/, '<div class="doc-title">Синтез Философской Концепции</div>');
    t("Д-37: импорт извлекает имя из раздела name выгрузки без хвостовой ёлочки", imp.resolveConceptName(hp.parseDocument(placeholderFile)) === `Мета ${tag}`, String(imp.resolveConceptName(hp.parseDocument(placeholderFile))));
    t("Д-37: название при генерации (раздел name фикстуры) — без ёлочки", gen.extractTitleFromNameHtml(nHtml) === `Мета ${tag}`);

    // ── C. файл концепции
    const live = process.env.T122_FILE;
    if (!live || !existsSync(live)) {
      console.log("C. файл концепции (T122_FILE) не задан — пропуск");
    } else {
      console.log("C. файл концепции");
      const raw = readFileSync(live, "utf8");
      t("файл несёт следы оглавления одностраничника (⏫ и якоря subsec-…) — есть что снимать", count(raw, 'class="toc-back-btn"') > 10 && count(raw, '<a id="subsec-') > 10, J([count(raw, 'class="toc-back-btn"'), count(raw, '<a id="subsec-')]));
      const r1 = await imp.importHTML(raw, owner.id, "live.html");
      ids.push(r1.synthesisId);
      const secs = await db.select().from(schema.sections).where(eq(schema.sections.synthesisId, r1.synthesisId));
      t("Д-29: после импорта файла в тексте разделов нет ни ⏫, ни якорей subsec-…", secs.length >= 10 && secs.every((x) => !x.htmlContent.includes("toc-back-btn") && !x.htmlContent.includes('id="subsec-') && !x.title.includes("⏫")), J(secs.filter((x) => x.htmlContent.includes("toc-back-btn")).map((x) => x.key)));
      const lth = await thesesOf(r1.synthesisId);
      const liveTheses = (await secRow(r1.synthesisId, "theses")).htmlContent;
      const justParas = count(liveTheses, "<strong>Обоснование.</strong>");
      t(`Д-36: theses.justification непуст у каждого тезиса с абзацем «Обоснование.» (${justParas} из ${lth.length})`, lth.length > 0 && justParas === lth.length && lth.every((x) => x.justification.length > 50), J(lth.map((x) => [x.label, x.justification.length])));
      const u = await editor.updateThesis(r1.synthesisId, lth[1].id, { justification: "Обоснование, заменённое редактором на живом документе." });
      const after = (await secRow(r1.synthesisId, "theses")).htmlContent;
      t("Д-36: правка обоснования на живом документе — patched; изменён только свой абзац", u.htmlSync.patched.includes("thesis.justification") && u.htmlSync.pending.length === 0 && count(after, "Обоснование, заменённое редактором на живом документе.") === 1 && count(after, "<strong>Обоснование.</strong>") === justParas && count(after, "<h5>") === count(liveTheses, "<h5>") && count(after, "<li>") === count(liveTheses, "<li>"), J(u.htmlSync));
      const out = await exp.exportHTML(r1.synthesisId);
      const links = [...out.matchAll(/<p class="toc-sub-link"><a href="#(subsec-[^"]+)">/g)].map((m) => m[1]);
      t(`Д-29: выгрузка импортированного — оглавление, ${links.length} ссылок подразделов, у каждой ровно один якорь`, out.includes('<details open id="docTOC"') && links.length > 40 && links.every((id) => count(out, `<a id="${id}"></a>`) === 1));
      t("Д-30: выгрузка несёт древо с концепциями-родителями файла", out.includes('header-disclosure-genealogy" open') && out.includes("◈ Грамматика самоотрицания") && out.includes('<div class="gen-phil-name">Юнг</div>'));
      const r2 = await imp.importHTML(out, owner.id, "live-2.html");
      ids.push(r2.synthesisId);
      const secs2 = await db.select().from(schema.sections).where(eq(schema.sections.synthesisId, r2.synthesisId));
      const byKey = new Map(secs.map((x) => [x.key, x.htmlContent]));
      byKey.set("theses", after);
      t("Д-29: второй круг экспорт → импорт — разделы побайтно те же", secs2.length === secs.length && secs2.every((x) => byKey.get(x.key) === x.htmlContent), J(secs2.filter((x) => byKey.get(x.key) !== x.htmlContent).map((x) => x.key)));
      const strip2 = (n) => ({ type: n.type, name: n.name, children: n.children.map(strip2) });
      t("Д-30: дерево файла после второго круга прежнее", J(strip2(await getAncestors(r2.synthesisId))) === J(strip2(await getAncestors(r1.synthesisId))));
    }
  } catch (e) {
    bad++;
    console.log("  ✗ ИСКЛЮЧЕНИЕ:", e?.stack ?? e);
  } finally {
    for (const id of ids) await db.delete(schema.syntheses).where(eq(schema.syntheses.id, id)).catch(() => {});
    await db.delete(schema.users).where(eq(schema.users.id, owner.id)).catch(() => {});
  }
}

console.log(`\nИТОГ: ${ok} ✓ / ${bad} ✗`);
try { const { closeDb } = await import("../server/db/index.ts"); await closeDb(); } catch {}
try { const { closeRedis } = await import("../server/redis.ts"); await closeRedis(); } catch {}
process.exit(bad ? 1 : 0);
