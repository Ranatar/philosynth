/**
 * Смоук чистых ядер беседы 5.1 (запрос 1; без БД):
 *  - round-trip parse(render(x)) ≡ x по полям для всех пяти таблиц
 *    (element-renderer ↔ graph-parser / element-parser 1.4);
 *  - replaceDocTable сохраняет <h4> и прозу подраздела, ветки
 *    replaced/appended/created;
 *  - replaceThesisParagraph — точечная правка абзаца тезиса.
 * Запуск: node_modules/.bin/tsx tests/smoke-51-request1.mjs
 */
import {
  renderCategoriesTable,
  renderEdgesTable,
  renderGlossaryTable,
  renderThesesTable,
  renderTopologyTable,
  ROLE_LABELS,
  THESIS_TYPE_LABELS,
} from "../server/services/element-renderer.ts";
import { parseGraphFromHTML, ROLE_MAP } from "../server/services/graph-parser.ts";
import {
  parseGlossaryFromHTML,
  parseThesesFromHTML,
} from "../server/services/element-parser.ts";
import {
  locateDocTable,
  replaceDocTable,
  replaceThesisParagraph,
} from "../server/utils/html-parser.ts";

let n = 0;
let failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.log(`  ✗ ${name}`, extra === undefined ? "" : JSON.stringify(extra));
  }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ── Фикстуры (select-формы строк) ─────────────────────────────────── */
const now = new Date();
const idA = "11111111-1111-4111-8111-111111111111";
const idB = "22222222-2222-4222-8222-222222222222";
const idC = "33333333-3333-4333-8333-333333333333";
const catBase = {
  synthesisId: "s", typeCatalogId: null, source: "generated", createdAt: now, updatedAt: now,
  historicalSignificance: 0, innovationDegree: 1, clarity: 0, breadth: 0, depthScore: 0, applicability: 0,
};
const cats = [
  { ...catBase, id: idA, name: "Бытие", type: "онтологическая", definition: "Всё, что есть & <существует>", centrality: 0.9, certainty: 0.8, origin: "Парменид", clusterIndices: [0], structuralRoles: ["central", "core"], proceduralRoles: ["thesis"], hasReflexive: true, position: 0 },
  { ...catBase, id: idB, name: "Становление", type: "метафизическая", definition: "Переход", centrality: 0.7, certainty: 0.6, origin: "Гераклит", clusterIndices: [0, 1], structuralRoles: ["bridge"], proceduralRoles: ["antithesis"], hasReflexive: false, position: 1 },
  { ...catBase, id: idC, name: "Единое", type: "логическая", definition: "Целое", centrality: 0.5, certainty: 0.5, origin: "Плотин", clusterIndices: [], structuralRoles: ["bridge"], proceduralRoles: [], hasReflexive: false, position: 2 },
];
const catsExt = cats.map((c, i) => ({ ...c, historicalSignificance: 0.4 + i / 10, innovationDegree: 2 + i, clarity: 0.3, breadth: 0.6, depthScore: 0.7, applicability: 0.2 }));
const edges = [
  { id: "e1", synthesisId: "s", sourceId: idA, targetId: idB, description: "порождает", edgeType: "диалектическая", direction: "однонаправленная", strength: 0.8, certainty: 0.5, historicalSupport: 0.5, logicalNecessity: 0.5, innovationDegree: 1, contextDependency: 0.5, typeCatalogId: null, position: 0, sourceOrigin: "generated", createdAt: now },
  { id: "e2", synthesisId: "s", sourceId: idA, targetId: idA, description: "само-полагание", edgeType: "рефлексия", direction: "рефлексивная", strength: 0.3, certainty: 0.9, historicalSupport: 0.1, logicalNecessity: 0.2, innovationDegree: 4, contextDependency: 0.6, typeCatalogId: null, position: 1, sourceOrigin: "generated", createdAt: now },
];
const clusters = [
  { id: "c0", synthesisId: "s", clusterIndex: 0, label: "Онтологическое ядро" },
  { id: "c1", synthesisId: "s", clusterIndex: 1, label: "Эпистемический мост" },
];

/* ── 1. Граф: категории + связи + топология, базовые столбцы ───────── */
console.log("1. Граф (extGraphMetrics=false)");
const wrap = (name, tbl) => `<div data-section="${name}"><h4>${name}</h4>${tbl}</div>`;
const graphHtml =
  wrap("Таблица категорий", renderCategoriesTable(cats, { extGraphMetrics: false, lastColName: "Происхождение" })) +
  wrap("Таблица связей", renderEdgesTable(edges, cats, { extGraphMetrics: false })) +
  `<div data-section="Топология графа"><h4>Топология графа</h4><p>Проза о кластерах.</p></div>` +
  wrap("Топологическая таблица", renderTopologyTable(cats, clusters));
const g = parseGraphFromHTML(graphHtml);
check("3 узла", g.nodes.length === 3);
check("узел 0: имя/тип/определение/числа/происхождение", eq(
  [g.nodes[0].name, g.nodes[0].type, g.nodes[0].def, g.nodes[0].cen, g.nodes[0].cert, g.nodes[0].orig],
  ["Бытие", "онтологическая", "Всё, что есть & <существует>", 0.9, 0.8, "Парменид"]), g.nodes[0]);
check("экранирование & < в определении восстановлено", g.nodes[0].def.includes("& <существует>"));
check("узлы без _extended", g.nodes.every((x) => !x._extended));
check("2 ребра, имена концов", eq(g.edges.map((e) => [e.src, e.tgt]), [["Бытие", "Становление"], ["Бытие", "Бытие"]]));
check("ребро: desc/type/dir/str", eq([g.edges[0].desc, g.edges[0].type, g.edges[0].dir, g.edges[0].str], ["порождает", "диалектическая", "однонаправленная", 0.8]));
check("рефлексивное направление", g.edges[1].dir === "рефлексивная");
check("кластеры: метки по порядку", eq(g.topology.clusterLabels, ["Онтологическое ядро", "Эпистемический мост"]));
check("кластеры узлов", eq([g.topology.clusters["Бытие"], g.topology.clusters["Становление"], g.topology.clusters["Единое"]], [[0], [0, 1], undefined]));
check("структурные роли", eq([g.topology.roles.structural["Бытие"], g.topology.roles.structural["Становление"], g.topology.roles.structural["Единое"]], [["central", "core"], ["bridge"], ["bridge"]]));
check("процессуальные роли", eq([g.topology.roles.procedural["Бытие"], g.topology.roles.procedural["Становление"]], [["thesis"], ["antithesis"]]));
check("«мост» без кластера → роль bridge, кластер не создан", !g.topology.clusters["Единое"] && g.topology.clusterLabels.length === 2);

/* ── 2. Граф: расширенные столбцы ──────────────────────────────────── */
console.log("2. Граф (extGraphMetrics=true)");
const graphExtHtml =
  wrap("Таблица категорий", renderCategoriesTable(catsExt, { extGraphMetrics: true, lastColName: "Генеалогия" })) +
  wrap("Таблица связей", renderEdgesTable(edges, cats, { extGraphMetrics: true }));
const ge = parseGraphFromHTML(graphExtHtml);
check("узлы _extended", ge.nodes.every((x) => x._extended));
check("узел 1: ext-метрики", eq(
  [ge.nodes[1].histSig, ge.nodes[1].innovDeg, ge.nodes[1].clarity, ge.nodes[1].breadth, ge.nodes[1].depth, ge.nodes[1].applic],
  [0.5, 3, 0.3, 0.6, 0.7, 0.2]), ge.nodes[1]);
check("рёбра _extended", ge.edges.every((x) => x._extended));
check("ребро 1: ext-метрики", eq(
  [ge.edges[1].certEdge, ge.edges[1].innovDeg, ge.edges[1].histSupport, ge.edges[1].logNec, ge.edges[1].ctxDep],
  [0.9, 4, 0.1, 0.2, 0.6]), ge.edges[1]);
const hdr = locateDocTable(graphExtHtml, [{ subsection: "Таблица категорий" }]);
check("заголовки категорий: 12, последний базовый — Генеалогия", hdr.headers.length === 12 && hdr.headers[5] === "Генеалогия", hdr);

/* ── 3. Тезисы ─────────────────────────────────────────────────────── */
console.log("3. Тезисы");
const thRows = [
  { id: "t1", synthesisId: "s", thesisNum: 1, formulation: "Бытие есть становление", justification: "", thesisType: "ontological", noveltyDegree: "высокая", relatedCategories: ["Бытие", "Становление"], source: "generated", createdAt: now, updatedAt: now },
  { id: "t2", synthesisId: "s", thesisNum: 2, formulation: "Познание опосредовано", justification: "", thesisType: "epistemological", noveltyDegree: "средняя", relatedCategories: ["Единое"], source: "generated", createdAt: now, updatedAt: now },
  { id: "t3", synthesisId: "s", thesisNum: 3, formulation: "Благо едино", justification: "", thesisType: "ethical", noveltyDegree: "низкая", relatedCategories: [], source: "generated", createdAt: now, updatedAt: now },
];
const thesesHtml =
  `<div data-section="Онтологические тезисы"><h4>Онтологические тезисы</h4><p><strong>Бытие есть становление</strong> Потому что Гераклит.</p></div>` +
  wrap("Сводная таблица тезисов", renderThesesTable(thRows));
const th = parseThesesFromHTML(thesesHtml);
check("3 тезиса", th.length === 3);
check("№/формулировка/тип/новизна/категории", eq(
  th.map((t) => [t.thesisNum, t.formulation, t.thesisType, t.noveltyDegree, t.relatedCategories]),
  thRows.map((t) => [t.thesisNum, t.formulation, t.thesisType, t.noveltyDegree, t.relatedCategories])), th);
check("обоснование подтянуто из абзаца", th[0].justification === "Потому что Гераклит.");
check("все метки типов тезисов читаются парсером", Object.entries(THESIS_TYPE_LABELS).every(([k]) => true) && th[1].thesisType === "epistemological" && th[2].thesisType === "ethical");

/* ── 4. Глоссарий ──────────────────────────────────────────────────── */
console.log("4. Глоссарий");
const H3 = "Традиционное понимание";
const H4 = "Почему принятое определение предпочтительнее";
const glRows = [
  { id: "g1", synthesisId: "s", term: "Бытие", definition: "Определение 1", extraColumns: { [H3]: "у Парменида", [H4]: "точнее" }, termCategory: "redefined", source: "generated", position: 0, createdAt: now, updatedAt: now },
  { id: "g2", synthesisId: "s", term: "Единое", definition: "Определение 2", extraColumns: { [H3]: "у Плотина" }, termCategory: "", source: "generated", position: 1, createdAt: now, updatedAt: now },
];
const glHtml = wrap("Таблица определений", renderGlossaryTable(glRows));
const gl = parseGlossaryFromHTML(glHtml);
check("2 термина", gl.length === 2);
check("термин/определение/extraColumns", eq(
  gl.map((t) => [t.term, t.definition, t.extraColumns]),
  glRows.map((t) => [t.term, t.definition, t.extraColumns])), gl);
check("заголовки: базовые + столбцы extra в порядке появления", eq(
  locateDocTable(glHtml, [{ firstHeaderIncludes: "термин" }]).headers,
  ["Термин", "Принятое определение в данной концепции", H3, H4]));
// Заголовки из HTML приоритетны над extraColumns-выводом
const glHtml2 = wrap("Таблица определений", renderGlossaryTable(glRows, { headers: ["Term", "Definition", H3, H4] }));
check("переданные заголовки сохранены", locateDocTable(glHtml2, [{ firstHeaderIncludes: "term" }]).headers[0] === "Term");

/* ── 5. replaceDocTable ────────────────────────────────────────────── */
console.log("5. replaceDocTable");
const secHtml =
  `<div class="doc-section"><div class="doc-content">` +
  `<div data-section="Методология"><h4>Методология</h4><p>Проза.</p></div>` +
  `<div data-section="Таблица категорий"><h4>Заголовок таблицы</h4><p>Вводный абзац.</p>` +
  `<table class="doc-table"><thead><tr><th>Категория</th></tr></thead><tbody><tr><td>Старое</td></tr></tbody></table>` +
  `<p>Комментарий после таблицы.</p></div></div></div>`;
const newTbl = renderCategoriesTable(cats, { extGraphMetrics: false, lastColName: "Происхождение" });
const r1 = replaceDocTable(secHtml, [{ subsection: "Таблица категорий" }], newTbl, "Таблица категорий");
check("replaced", r1.outcome === "replaced");
check("h4, вводный абзац и комментарий сохранены", r1.html.includes("<h4>Заголовок таблицы</h4>") && r1.html.includes("Вводный абзац.") && r1.html.includes("Комментарий после таблицы."));
check("старая строка исчезла, новая на месте", !r1.html.includes("Старое") && r1.html.includes("Становление"));
check("соседний подраздел не тронут", r1.html.includes('<div data-section="Методология"><h4>Методология</h4><p>Проза.</p></div>'));
check("ровно одна таблица", (r1.html.match(/<table/g) || []).length === 1);
const r2 = replaceDocTable(`<div data-section="Таблица связей"><h4>Связи</h4><p>Нет таблицы.</p></div>`, [{ subsection: "Таблица связей" }], "<table class=\"doc-table\"></table>", "Таблица связей");
check("appended в подраздел без таблицы", r2.outcome === "appended" && r2.html.includes("Нет таблицы.</p><table"));
const r3 = replaceDocTable(`<p>Ничего</p>`, [{ subsection: "Таблица связей" }], "<table class=\"doc-table\"></table>", "Таблица связей");
check("created новый подраздел", r3.outcome === "created" && r3.html.includes('<div data-section="Таблица связей"><h4>Таблица связей</h4><table'));
// Нечёткий поиск подраздела (как findMutableSubsection): «Сводная таблица» ↔ «Сводная таблица тезисов»
const r4 = replaceDocTable(wrap("Сводная таблица тезисов", "<table class=\"doc-table\"><tbody><tr><td>x</td></tr></tbody></table>"), [{ subsection: "Сводная таблица" }], renderThesesTable(thRows), "Сводная таблица тезисов");
check("нечёткий локатор тезисов", r4.outcome === "replaced" && r4.html.includes("Благо едино"));
// Глоссарий по первому th
const r5 = replaceDocTable(`<div data-section="Таблица определений"><h4>Глоссарий</h4>${renderGlossaryTable(glRows)}</div>`, [{ firstHeaderIncludes: "термин" }], "<table class=\"doc-table\"><thead><tr><th>Термин</th><th>Опр.</th></tr></thead><tbody></tbody></table>", "Таблица определений");
check("локатор по первому th", r5.outcome === "replaced" && !r5.html.includes("Определение 1"));

/* ── 6. replaceThesisParagraph ─────────────────────────────────────── */
console.log("6. replaceThesisParagraph");
const p1 = replaceThesisParagraph(thesesHtml, "Бытие есть становление", "Бытие и есть становление", "Новое обоснование <с>угловыми>.");
check("абзац заменён", p1 !== null && p1.includes("<p><strong>Бытие и есть становление</strong> Новое обоснование &lt;с&gt;угловыми&gt;.</p>"), p1);
check("таблица не тронута", p1 !== null && p1.includes("<td>Бытие есть становление</td>"));
const p2 = replaceThesisParagraph(thesesHtml, "Нет такого тезиса вовсе", "X", "Y");
check("не найден → null", p2 === null);
const p3 = replaceThesisParagraph(wrap("Сводная таблица тезисов", renderThesesTable(thRows)), "Бытие есть становление", "X", "Y");
check("<strong> внутри таблицы не считается абзацем", p3 === null);

/* ── 7. Словари ────────────────────────────────────────────────────── */
console.log("7. Обратные словари");
check("ROLE_LABELS покрывает все ключи ROLE_MAP", [...new Set(Object.values(ROLE_MAP))].every((k) => ROLE_LABELS[k] in ROLE_MAP));
check("каждая метка ROLE_LABELS читается ROLE_MAP в тот же ключ", Object.entries(ROLE_LABELS).every(([k, l]) => ROLE_MAP[l] === k));

console.log(`\n${n - failed}/${n} ✓${failed ? `, ${failed} ✗` : ""}`);
process.exit(failed ? 1 : 0);
