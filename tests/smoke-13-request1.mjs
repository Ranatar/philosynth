/**
 * Смоук первого запроса беседы 1.3 (context-builder / context-extractor /
 * parent-context / html-parser).
 *
 * Запуск: npx tsx smoke-13-request1.mjs   (нужны живые PG + Redis + сиды)
 *
 * Что проверяется:
 *  A. html-parser: innerText-приближение, parseFragment;
 *  B. дословность HTML-портов (extractSection / extractCapsuleText /
 *     extractNameTitle / extractIntraSectionContext) — СВЕРКА С ИСХОДНИКОМ:
 *     те же функции исполняются в vm поверх jsdom-подобного DOM linkedom,
 *     результаты сравниваются побайтово;
 *  C. DB-backed extract*(): формат таблиц, столбцы, ext-метрики, nodes_top;
 *  D. applyBudgetPressure (канон) + parentOverheadForSection +
 *     computeConceptOverhead + resolveParentDeps/ForSubsection;
 *  E. buildContextForSection на живой БД: бюджет, статусы ctxLog,
 *     ранний выход, отсутствующий раздел.
 */

import { readFileSync } from "node:fs";
import vm from "node:vm";

import { parseHTML } from "linkedom";
import { eq } from "drizzle-orm";

import { db, closeDb } from "../server/db/index.ts";
import { closeRedis } from "../server/redis.ts";
import * as schema from "../server/db/schema.ts";
import { parseFragment, innerText, innerTextTrimmed } from "../server/utils/html-parser.ts";
import { truncateText, tableToText } from "../server/utils/text.ts";
import {
  createDbContextSource,
  extractContextFragment,
  extractSection,
  extractCapsuleText,
  extractNameTitle,
  extractIntraSectionContext,
  extractGraphNodesTable,
  extractGraphEdges,
  extractGlossaryTable,
  extractThesesSummary,
  extractSummaryGoals,
  extractSummaryTensions,
} from "../server/services/context-extractor.ts";
import {
  applyBudgetPressure,
  computeConceptOverhead,
  parentOverheadForSection,
  buildContextForSection,
} from "../server/services/context-builder.ts";
import {
  resolveParentDeps,
  resolveParentDepsForSubsection,
  buildParentSpecForLog,
  validateParentDeps,
} from "../server/services/parent-context.ts";
import { resolveContextDeps, buildEffectiveDeps } from "../server/services/synthesis-engine.ts";
import { buildDynamicOrder } from "../server/utils/topo-sort.ts";

let pass = 0;
const fails = [];
function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push(name + (extra ? ` — ${extra}` : ""));
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}
function eq2(name, actual, expected) {
  ok(name, actual === expected, actual === expected ? "" : `получено ${JSON.stringify(actual)}, ожидалось ${JSON.stringify(expected)}`);
}

/* ═══ Эталон: функции исходника, исполняемые в vm поверх linkedom ═══ */

const FRAG = readFileSync("docs/fragments-for-conversations/1.3-context-builder.js", "utf8");

function sliceFn(name) {
  const marker = `// ───── [${name}] `;
  const start = FRAG.indexOf(marker);
  if (start < 0) throw new Error(`фрагмент ${name} не найден`);
  const bodyStart = FRAG.indexOf("\n", start) + 1;
  const next = FRAG.indexOf("\n// ───── [", bodyStart);
  return FRAG.slice(bodyStart, next < 0 ? FRAG.length : next);
}

/** Песочница с браузерными зависимостями портов (innerText через наш порт) */
function makeReference() {
  const sandbox = {
    console,
    tableToText,
    truncateText,
    INTRA_DEPS: {},
    canonicalSubsectionKey: (_k, n) => n,
    document: { createElement: () => parseFragment("") },
  };
  vm.createContext(sandbox);
  const src = [
    sliceFn("extractSection"),
    sliceFn("extractNameTitle"),
    sliceFn("extractIntraSectionContext"),
  ].join("\n");
  vm.runInContext(src + "\n;({extractSection, extractNameTitle, extractIntraSectionContext})", sandbox);
  return vm.runInContext("({extractSection, extractNameTitle, extractIntraSectionContext})", sandbox);
}

/**
 * Исходник опирается на браузерный innerText. linkedom его не даёт, поэтому
 * эталонные функции получают элементы с подмешанным innerText (наш порт) —
 * сверяется ЛОГИКА порта, а не реализация innerText (её проверяет блок A).
 */
function withInnerText(html) {
  const el = parseFragment(html);
  const patch = (node) => {
    if (!node || node.nodeType !== 1) return;
    // ВАЖНО: linkedom определяет собственный innerText (≈textContent).
    // Перекрываем безусловно — сверяется ЛОГИКА порта, а не innerText.
    Object.defineProperty(node, "innerText", {
      get() {
        return innerText(this);
      },
      configurable: true,
    });
    for (const c of node.children) patch(c);
  };
  patch(el);
  return el;
}

/* ═══════════════════ A. html-parser ═══════════════════ */

console.log("\nA. html-parser (innerText-приближение)");
{
  const { document } = parseHTML("<div><p>a</p><p>b</p></div>");
  eq2("textContent linkedom склеивает (обоснование порта)", document.querySelector("div").textContent, "ab");

  eq2("div-блоки дают один перенос", innerText(parseFragment("<div>a</div><div>b</div>")), "a\nb");
  eq2("абзацы дают пустую строку (как в браузере)", innerText(parseFragment("<p>a</p><p>b</p>")), "a\n\nb");
  eq2("<br> даёт перенос", innerText(parseFragment("<p>a<br>b</p>")), "a\nb");
  eq2("пробелы схлопываются", innerText(parseFragment("<p>a   \n  b</p>")), "a b");
  eq2("ячейки таблицы через пробел", innerText(parseFragment("<table><tbody><tr><td>x</td><td>y</td></tr></tbody></table>")), "x y");
  eq2("подряд идущие пустые строки схлопываются", innerText(parseFragment("<div><div>a</div><div></div><div></div><div>b</div></div>")), "a\nb");
  eq2("innerTextTrimmed на null → ''", innerTextTrimmed(null), "");
}

/* ═══════════════════ B. дословность HTML-портов ═══════════════════ */

console.log("\nB. Сверка HTML-портов с исходником (vm)");
{
  const ref = makeReference();

  const SUM_HTML = `
    <div class="doc-section">
      <div data-section="Цели и метод"><h4>Цели и метод</h4><p>Цель синтеза — примирение.</p>
        <table class="doc-table"><thead><tr><th>A</th><th>B</th></tr></thead>
        <tbody><tr><td>1</td><td>2</td></tr></tbody></table></div>
      <div data-section="Точки напряжения"><h4>Точки напряжения</h4><p>Свобода против необходимости.</p></div>
      <div data-section="Портрет каждого философа"><p>Кант: критика.</p></div>
    </div>`;

  for (const kw of ["цели и метод", "напряжени", "портрет", "нет такого"]) {
    const mine = extractSection(parseFragment(SUM_HTML), kw);
    const theirs = ref.extractSection(withInnerText(SUM_HTML), kw);
    eq2(`extractSection("${kw}") ≡ исходник`, mine, theirs);
  }

  const H4_HTML = `<div><h4>Обоснование</h4><p>Первое.</p><p>Второе.</p><h4>Другое</h4><p>Третье.</p></div>`;
  eq2("extractSection фолбэк через h4 ≡ исходник",
    extractSection(parseFragment(H4_HTML), "обоснован"),
    ref.extractSection(withInnerText(H4_HTML), "обоснован"));

  const NAME_HTML = `<div><div data-section="Итоговая рекомендация"><strong>Трансцендентальный реализм</strong><p>Потому что.</p></div></div>`;
  eq2("extractNameTitle ≡ исходник",
    extractNameTitle(parseFragment(NAME_HTML)),
    ref.extractNameTitle(withInnerText(NAME_HTML)));

  const NAME_OLD = `<div><strong>Старое имя</strong><div data-section="Обоснование"><p>Аргумент.</p></div></div>`;
  eq2("extractNameTitle (старый формат) ≡ исходник",
    extractNameTitle(parseFragment(NAME_OLD)),
    ref.extractNameTitle(withInnerText(NAME_OLD)));

  eq2("extractIntraSectionContext ≡ исходник",
    extractIntraSectionContext(parseFragment(SUM_HTML), "Точки напряжения"),
    ref.extractIntraSectionContext(withInnerText(SUM_HTML), "Точки напряжения"));

  const CAPSULE = `<div class="doc-content"><div data-section="Капсула"><h4>Капсула</h4><p>Мир есть воля.</p></div></div>`;
  eq2("extractCapsuleText снимает заголовок", extractCapsuleText(CAPSULE), "Мир есть воля.");
  eq2("extractCapsuleText('') → ''", extractCapsuleText(""), "");
}

/* ═══════════════════ C. DB-backed extract*() ═══════════════════ */

console.log("\nC. extract*() из гранулярных таблиц");

const userId = (await db.insert(schema.users).values({
  email: `smoke13-${Date.now()}@example.org`, passwordHash: "x",
}).returning({ id: schema.users.id }))[0].id;

async function makeSynthesis(overrides = {}) {
  const rows = await db.insert(schema.syntheses).values({
    userId, seed: "зерно", depth: "standard", ...overrides,
  }).returning({ id: schema.syntheses.id });
  return rows[0].id;
}

const sid = await makeSynthesis({ synthLevel: "comparative", title: "Трансцендентальный реализм" });

await db.insert(schema.sections).values([
  { synthesisId: sid, key: "sum", sectionNum: 1, title: "Резюме", htmlContent:
      `<div data-section="Цели и метод"><p>Цель — синтез.</p></div>
       <div data-section="Точки напряжения"><p>Напряжение между X и Y.</p></div>` },
  { synthesisId: sid, key: "graph", sectionNum: 2, title: "Граф", htmlContent: "<div data-section=\"Топология\"><p>Кластеры.</p></div>" },
  { synthesisId: sid, key: "glossary", sectionNum: 3, title: "Глоссарий", htmlContent: "<p>Термины</p>" },
  { synthesisId: sid, key: "theses", sectionNum: 4, title: "Тезисы", htmlContent: "<p>Тезисы</p>" },
]);

const catIds = await db.insert(schema.categories).values(
  [
    ["Свобода", "онтологическая", "Способность к самоопределению", 0.9, 0.8, "Кант", 0],
    ["Необходимость", "метафизическая", "Закон причинности", 0.75, 0.9, "Спиноза", 1],
    ["Событие", "онтологическая", "Точка разрыва", 0.4, 0.5, "синтез", 2],
    ["Différance", "лингвистическая", "Отсрочка смысла", 0.6, 0.3, "Деррида", 3],
    ["Забота", "экзистенциальная", "Модус бытия", 0.55, 0.7, "Хайдеггер", 4],
  ].map(([name, type, definition, centrality, certainty, origin, position]) => ({
    synthesisId: sid, name, type, definition, centrality, certainty, origin, position,
  })),
).returning({ id: schema.categories.id, name: schema.categories.name });

const byName = Object.fromEntries(catIds.map((c) => [c.name, c.id]));

await db.insert(schema.categoryEdges).values([
  { synthesisId: sid, sourceId: byName["Свобода"], targetId: byName["Необходимость"],
    description: "снимается в", edgeType: "диалектическая", direction: "двунаправленная", strength: 0.8, position: 0 },
  { synthesisId: sid, sourceId: byName["Событие"], targetId: byName["Свобода"],
    description: "обосновывает", edgeType: "каузальная", strength: 0.6, position: 1 },
]);

await db.insert(schema.glossaryTerms).values([
  { synthesisId: sid, term: "Свобода", definition: "Само-\nопределение", position: 0 },
  { synthesisId: sid, term: "Différance", definition: "Отсрочка", position: 1 },
  { synthesisId: sid, term: "Забота", definition: "Модус", position: 2 },
]);

await db.insert(schema.theses).values([
  { synthesisId: sid, thesisNum: 1, formulation: "Свобода первична", thesisType: "ontological",
    noveltyDegree: "высокая", relatedCategories: ["Свобода", "Событие"] },
  { synthesisId: sid, thesisNum: 2, formulation: "Знание ситуативно", thesisType: "epistemological",
    noveltyDegree: "средняя", relatedCategories: ["Différance"] },
]);

{
  const src = createDbContextSource(sid);

  const nodes = await extractGraphNodesTable(src);
  const nLines = nodes.split("\n");
  eq2("graph:nodes — префикс", nLines[0], "ТАБЛИЦА КАТЕГОРИЙ:");
  eq2("graph:nodes — столбцы (comparative → «Происхождение»)", nLines[1],
    "Категория | Тип | Определение | Центральность | Определённость | Происхождение");
  eq2("graph:nodes — разделитель как в tableToText", nLines[2], "--- | --- | --- | --- | --- | ---");
  eq2("graph:nodes — 5 строк данных", nLines.length - 3, 5);
  eq2("graph:nodes — первая строка", nLines[3],
    "Свобода | онтологическая | Способность к самоопределению | 0.9 | 0.8 | Кант");

  const compact = await src.getCategories().then(() => extractContextFragment("graph:nodes_compact", src));
  eq2("graph:nodes_compact — три столбца", compact.split("\n")[1], "Категория | Тип | Определение");

  const top = await extractContextFragment("graph:nodes_top", src);
  const topLines = top.split("\n");
  eq2("graph:nodes_top — шапка сохранена", topLines[0], "ТАБЛИЦА КАТЕГОРИЙ:");
  eq2("graph:nodes_top — отсортировано по центральности", topLines[3].split(" | ")[0], "Свобода");
  eq2("graph:nodes_top — второй по центральности", topLines[4].split(" | ")[0], "Необходимость");
  eq2("graph:nodes_top — при ≤7 строках берёт все", topLines.length - 3, 5);

  const edges = await extractGraphEdges(src);
  const eLines = edges.split("\n");
  eq2("graph:edges — префикс", eLines[0], "ТАБЛИЦА СВЯЗЕЙ:");
  eq2("graph:edges — столбцы", eLines[1], "Источник | Описание связи | Цель | Тип | Направление | Сила");
  eq2("graph:edges — имена узлов из join", eLines[2 + 1], "Свобода | снимается в | Необходимость | диалектическая | двунаправленная | 0.8");

  const gloss = await extractGlossaryTable(src);
  eq2("glossary:table — префикс и шапка", gloss.split("\n").slice(0, 2).join("|"),
    "ГЛОССАРИЙ (термины и определения):|Термин | Определение");
  eq2("glossary:table — перенос в ячейке нормализован", gloss.split("\n")[3], "Свобода | Само- определение");

  const th = await extractThesesSummary(src);
  const tLines = th.split("\n");
  eq2("theses:summary — префикс", tLines[0], "СВОДКА ТЕЗИСОВ:");
  eq2("theses:summary — столбцы", tLines[1], "№ | Формулировка тезиса | Тип | Степень новизны | Связанные категории");
  eq2("theses:summary — тип по-русски, категории через запятую", tLines[3],
    "1 | Свобода первична | онтол. | высокая | Свобода, Событие");

  eq2("sum:goals из HTML раздела", await extractSummaryGoals(src), "Цель — синтез.");
  eq2("sum:tensions из HTML раздела", await extractSummaryTensions(src), "Напряжение между X и Y.");
  eq2("graph:topology из HTML раздела", await extractContextFragment("graph:topology", src), "Кластеры.");

  eq2("неизвестный ключ → null (default)", await extractContextFragment("nope:nope", src), null);
  eq2("ключ несгенерированного раздела → null", await extractContextFragment("critique:full", src), null);
  eq2("capsule:full при пустой капсуле → null", await extractContextFragment("capsule:full", src), null);
}

/* ── ext-метрики и уровень синтеза меняют столбцы ── */
{
  const sid2 = await makeSynthesis({ synthLevel: "generative", extGraphMetrics: true });
  await db.insert(schema.sections).values({ synthesisId: sid2, key: "graph", sectionNum: 1, title: "Граф", htmlContent: "<p>g</p>" });
  await db.insert(schema.categories).values({
    synthesisId: sid2, name: "Складка", type: "онтологическая", definition: "Изгиб",
    centrality: 1, certainty: 0.5, origin: "предел", historicalSignificance: 0.25,
    innovationDegree: 4, clarity: 0.6, breadth: 0.7, depthScore: 0.8, applicability: 0.9,
  });
  const src2 = createDbContextSource(sid2);
  const t = (await extractGraphNodesTable(src2)).split("\n");
  eq2("generative → последний столбец «Преодолённые ограничения»", t[1],
    "Категория | Тип | Определение | Центральность | Определённость | Преодолённые ограничения | Ист. значимость | Степень инновации | Ясность | Широта | Глубина | Применимость");
  eq2("ext-метрики: 1 форматируется как «1», innovationDegree целым", t[3],
    "Складка | онтологическая | Изгиб | 1 | 0.5 | предел | 0.25 | 4 | 0.6 | 0.7 | 0.8 | 0.9");
}

/* ═══════════════════ D. Бюджет и родительский контекст ═══════════════════ */

console.log("\nD. applyBudgetPressure / parentOverhead / parent-deps");
{
  eq2("keepFullBudget → полный бюджет, mode=full",
    JSON.stringify(applyBudgetPressure(10000, 4000, true)),
    JSON.stringify({ effectiveBudget: 10000, applied: 0, mode: "full" }));
  eq2("overhead=0 → без ужатия, mode=shrink",
    JSON.stringify(applyBudgetPressure(10000, 0, false)),
    JSON.stringify({ effectiveBudget: 10000, applied: 0, mode: "shrink" }));
  eq2("обычное ужатие",
    JSON.stringify(applyBudgetPressure(10000, 3000, false)),
    JSON.stringify({ effectiveBudget: 7000, applied: 3000, mode: "shrink" }));
  eq2("пол 40% не пробивается",
    JSON.stringify(applyBudgetPressure(10000, 9000, false)),
    JSON.stringify({ effectiveBudget: 4000, applied: 6000, mode: "shrink" }));

  const concepts = [
    { type: "concept", name: "Альфа", capsule: "к".repeat(100), goals: "ц".repeat(50),
      graphNodes: "г".repeat(30), thesesSummary: "т".repeat(20), glossaryCompact: "", tensions: "н".repeat(10) },
    { type: "philosopher", name: "Кант" },
  ];
  eq2("computeConceptOverhead суммирует только концепции", computeConceptOverhead(concepts), 210);

  const deps = await resolveParentDeps({ generationOrder: "architectural", synthLevel: "comparative", method: "dialectical" });
  ok("resolveParentDeps: 12 разделов в карте", Object.keys(deps).length >= 12, `получено ${Object.keys(deps).length}`);
  ok("resolveParentDeps: critique требует 8 полей (01-arch §4.13 п.3)",
    deps.critique.required.length === 8, JSON.stringify(deps.critique.required));
  eq2("resolveParentDeps: name → capsule + goals", JSON.stringify(deps.name.required), JSON.stringify(["capsule", "goals"]));

  const genetic = await resolveParentDeps({ generationOrder: "genetic" });
  ok("генетический порядок смещает зависимости на диалог",
    JSON.stringify(genetic) !== JSON.stringify(deps));

  const overheadCritique = await parentOverheadForSection(concepts, "critique", "architectural", "comparative", "dialectical");
  const critFields = new Set([...deps.critique.required, ...deps.critique.optional]);
  let expected = 200;
  for (const f of critFields) expected += (concepts[0][f] ?? "").length;
  eq2("parentOverheadForSection = Σ полей спеца + 200 на концепцию", overheadCritique, expected);
  eq2("parentOverheadForSection без участников → 0", await parentOverheadForSection([], "critique"), 0);
  eq2("нормализация ключа «graph+glossary:sub» → graph",
    await parentOverheadForSection(concepts, "graph+glossary:sub"),
    await parentOverheadForSection(concepts, "graph"));

  const subSpec = await resolveParentDepsForSubsection({}, "sum", "Портрет каждого философа");
  const secSpec = (await resolveParentDeps({})).sum;
  const secAll = new Set([...secSpec.required, ...secSpec.optional]);
  ok("resolveParentDepsForSubsection: intra не расширяет section",
    [...subSpec.required, ...subSpec.optional].every((f) => secAll.has(f)),
    JSON.stringify(subSpec));

  const spec = await buildParentSpecForLog(concepts, {}, "sum");
  ok("buildParentSpecForLog: одна запись на концепцию", spec.perParent.length === 1);
  eq2("buildParentSpecForLog: имя родителя", spec.perParent[0].name, "Альфа");
  ok("buildParentSpecForLog: пустое обязательное поле → missingRequired",
    spec.perParent[0].missingRequired.length === 0 || Array.isArray(spec.perParent[0].missingRequired));
  ok("buildParentSpecForLog: totalChars = Σ perParent.chars",
    spec.totalChars === spec.perParent.reduce((s, p) => s + p.chars, 0));
  eq2("buildParentSpecForLog без концепций → null", await buildParentSpecForLog([], {}, "sum"), null);

  const warnings = await validateParentDeps();
  eq2("validateParentDeps: посеянные карты чисты", warnings.length, 0);
}

/* ═══════════════════ E. buildContextForSection ═══════════════════ */

console.log("\nE. buildContextForSection на живой БД");
{
  const p = { method: "dialectical", synthLevel: "comparative", generationOrder: "architectural" };
  const resolved = await resolveContextDeps(p);
  const selected = ["sum", "graph", "glossary", "theses"];
  const effective = await buildEffectiveDeps(selected, resolved, "architectural");
  buildDynamicOrder(effective, selected, resolved, "architectural"); // мутирует effective — как в исходнике

  const res = await buildContextForSection("theses", sid, "standard", effective, resolved);
  ok("theses: блок контекста собран", res.text.startsWith("\n\nКОНТЕКСТ ИЗ ПРЕДЫДУЩИХ РАЗДЕЛОВ"), res.text.slice(0, 60));
  ok("theses: содержит таблицу категорий", res.text.includes("ТАБЛИЦА КАТЕГОРИЙ"));
  ok("theses: содержит цели резюме", res.text.includes("Цель — синтез."));
  ok("theses: метки CTX_LABELS в заголовках фрагментов", res.text.includes("### Граф → "));
  eq2("theses: budget = context_budget[standard]", res.ctxLog.budget, 48000);
  eq2("theses: rawBaseBudget без критикового множителя", res.ctxLog.rawBaseBudget, 48000);
  eq2("theses: overhead родителей = 0 (не мета-синтез)", res.ctxLog.parentOverhead, 0);
  eq2("theses: budgetMode", res.ctxLog.budgetMode, "shrink");
  eq2("theses: parentSpec = null без концепций", res.ctxLog.parentSpec, null);
  eq2("theses: reqTotal ≡ длине required", res.ctxLog.reqTotal, effective.theses.required.length);
  ok("theses: totalUsed = Σ длин включённых фрагментов",
    res.ctxLog.totalUsed === res.ctxLog.entries.filter((e) => e.status === "found").reduce((s, e) => s + e.len, 0)
      + res.ctxLog.entries.filter((e) => e.status === "truncated").reduce((s, e) => s + e.len, 0));
  ok("theses: totalUsed ≤ budget", res.ctxLog.totalUsed <= res.ctxLog.budget);
  ok("theses: все статусы из словаря исходника",
    res.ctxLog.entries.every((e) => ["found", "missing", "truncated", "skipped_budget", "dropped"].includes(e.status)),
    JSON.stringify([...new Set(res.ctxLog.entries.map((e) => e.status))]));

  const critique = await buildContextForSection("critique", sid, "standard", effective, resolved);
  eq2("critique: базовый бюджет × 1.5 ДО давления", critique.ctxLog.rawBaseBudget, 72000);

  const nope = await buildContextForSection("nonexistent", sid, "standard", effective, resolved);
  eq2("раздел вне карт зависимостей → ранний выход, текст пуст", nope.text, "");
  eq2("раздел вне карт зависимостей → ctxLog null", nope.ctxLog, null);

  // Первый раздел: контекста нет, но функция не падает и лог пишется
  const sum = await buildContextForSection("sum", sid, "standard", effective, resolved);
  ok("sum: не падает при отсутствии предшественников", typeof sum.text === "string");
  ok("sum: ctxLog записан", sum.ctxLog !== null && sum.ctxLog.sectionKey === "sum");

  // Пустой синтез: все фрагменты отсутствуют → текст пуст, статусы missing
  const emptyId = await makeSynthesis();
  const empty = await buildContextForSection("theses", emptyId, "standard", effective, resolved);
  eq2("пустой синтез: контекст пуст", empty.text, "");
  ok("пустой синтез: required залогированы как missing",
    empty.ctxLog.entries.filter((e) => e.priority === "required").every((e) => e.status === "missing" || e.status === "dropped"));
  eq2("пустой синтез: reqFound = 0", empty.ctxLog.reqFound, 0);

  // Давление бюджета на живом вызове: мета-синтез с тяжёлыми родителями
  const heavy = [{ type: "concept", name: "Тяжёлая", capsule: "к".repeat(40000),
    goals: "ц".repeat(40000), graphNodes: "г".repeat(40000), tensions: "н".repeat(40000),
    thesesSummary: "т".repeat(40000), glossaryCompact: "г".repeat(40000) }];
  const pressed = await buildContextForSection("theses", sid, "standard", effective, resolved,
    { participants: heavy, params: { ...p, keepFullBudget: false } });
  ok("мета: бюджет ужат давлением родителей", pressed.ctxLog.budget < 48000, String(pressed.ctxLog.budget));
  eq2("мета: пол 40% соблюдён", pressed.ctxLog.budget, Math.max(48000 - pressed.ctxLog.parentOverhead, 19200));
  eq2("мета: parentSpec заполнен", pressed.ctxLog.parentSpec.perParent.length, 1);
  ok("мета: parentOverhead > 0", pressed.ctxLog.parentOverhead > 0);

  const kept = await buildContextForSection("theses", sid, "standard", effective, resolved,
    { participants: heavy, params: { ...p, keepFullBudget: true } });
  eq2("мета + keepFullBudget: бюджет не ужат", kept.ctxLog.budget, 48000);
  eq2("мета + keepFullBudget: mode=full", kept.ctxLog.budgetMode, "full");
  eq2("мета + keepFullBudget: applied=0", kept.ctxLog.conceptOverheadApplied, 0);

  // params из БД, если не переданы явно
  await db.update(schema.syntheses).set({ keepFullBudget: true }).where(eq(schema.syntheses.id, sid));
  const fromDb = await buildContextForSection("theses", sid, "standard", effective, resolved, { participants: heavy });
  eq2("params читаются из syntheses, когда не переданы", fromDb.ctxLog.budgetMode, "full");
}

/* ═══ Итог ═══ */

await db.delete(schema.users).where(eq(schema.users.id, userId));
await closeDb();
await closeRedis();

console.log(`\n${fails.length === 0 ? "OK" : "FAIL"}: ${pass} проверок пройдено, ${fails.length} провалено`);
if (fails.length) {
  for (const f of fails) console.log("  ✗ " + f);
  process.exit(1);
}
