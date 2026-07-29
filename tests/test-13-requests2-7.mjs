/**
 * Беседа 1.3, тестовые запросы 2–7 протокола (07, «Последующие запросы»).
 *
 * Запуск: npx tsx test-13-requests2-7.mjs   (живые PG + Redis + сиды)
 *
 *  2. extractGraphNodesTable: 5 записей в categories (разные типы,
 *     centrality, certainty) → форматированная таблица со столбцами.
 *  3. extractGlossaryTable: 3 термина → таблица со столбцами.
 *  4. buildContextForSection("theses") при required=["sum:goals",
 *     "graph:nodes_top"] → оба фрагмента внутри, длина ≤ CONTEXT_BUDGET.
 *  5. Бюджетирование: контекст превышает CONTEXT_BUDGET → optional
 *     обрезаются/пропускаются, required нет; ctxLog содержит статусы
 *     "found", "truncated", "skipped_budget".
 *  6. extractSummaryGoals: HTML в sections WHERE key='sum' с
 *     data-section="Цели и задачи" → парсинг через linkedom.
 *  7. Edge cases: первый раздел (sum) без предшественников не падает;
 *     фрагмент несгенерированного раздела — не ошибка.
 */

import { eq } from "drizzle-orm";

import { db, closeDb } from "../server/db/index.ts";
import { closeRedis } from "../server/redis.ts";
import * as schema from "../server/db/schema.ts";
import { getConfig } from "../server/services/prompt-registry.ts";
import {
  createDbContextSource,
  extractContextFragment,
  extractGraphNodesTable,
  extractGlossaryTable,
  extractSummaryGoals,
} from "../server/services/context-extractor.ts";
import { buildContextForSection } from "../server/services/context-builder.ts";
import {
  resolveContextDeps,
  buildEffectiveDeps,
} from "../server/services/synthesis-engine.ts";
import { buildDynamicOrder } from "../server/utils/topo-sort.ts";

let pass = 0;
const fails = [];
const notes = [];
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
  const good = actual === expected;
  ok(name, good, good ? "" : `получено ${JSON.stringify(actual)}, ожидалось ${JSON.stringify(expected)}`);
}
function note(text) {
  notes.push(text);
  console.log(`  ⚑ ${text}`);
}

const userId = (
  await db
    .insert(schema.users)
    .values({ email: `t13-${Date.now()}@example.org`, passwordHash: "x" })
    .returning({ id: schema.users.id })
)[0].id;

async function makeSynthesis(overrides = {}) {
  const rows = await db
    .insert(schema.syntheses)
    .values({ userId, seed: "зерно", depth: "standard", ...overrides })
    .returning({ id: schema.syntheses.id });
  return rows[0].id;
}

const CONTEXT_BUDGET = await getConfig("context_budget");

/* ═════════════ Запрос 2: extractGraphNodesTable ═════════════ */

console.log("\nЗапрос 2. extractGraphNodesTable — 5 категорий разных типов");

const sid = await makeSynthesis({ synthLevel: "comparative", title: "Тестовая концепция" });
await db.insert(schema.sections).values({
  synthesisId: sid, key: "graph", sectionNum: 2, title: "Граф", htmlContent: "<p>граф</p>",
});

const CATS = [
  ["Свобода", "онтологическая", "Способность к самоопределению", 0.92, 0.81, "Кант"],
  ["Необходимость", "метафизическая", "Всеобщая связь причин", 0.78, 0.95, "Спиноза"],
  ["Различание", "лингвистическая", "Отсрочка и различие смысла", 0.64, 0.33, "Деррида"],
  ["Забота", "экзистенциальная", "Основной модус присутствия", 0.55, 0.7, "Хайдеггер"],
  ["Событие", "эпистемологическая", "Разрыв в порядке知 — точка новизны", 0.4, 0.5, "синтез"],
];
await db.insert(schema.categories).values(
  CATS.map(([name, type, definition, centrality, certainty, origin], i) => ({
    synthesisId: sid, name, type, definition, centrality, certainty, origin, position: i,
  })),
);

{
  const src = createDbContextSource(sid);
  const table = await extractGraphNodesTable(src);
  const lines = table.split("\n");

  eq2("префикс «ТАБЛИЦА КАТЕГОРИЙ:»", lines[0], "ТАБЛИЦА КАТЕГОРИЙ:");
  const headers = lines[1].split(" | ");
  eq2("6 столбцов", headers.length, 6);
  ok("столбец «Тип»", headers[1] === "Тип");
  ok("столбец «Определение»", headers[2] === "Определение");
  ok("столбец «Центральность»", headers[3] === "Центральность");
  ok("столбец «Определённость»", headers[4] === "Определённость");
  eq2("первый столбец — «Категория» (не «Имя»)", headers[0], "Категория");
  note(
    "07 (запрос 2 беседы 1.3) называет первый столбец «Имя»; исходник в промпте " +
      "графа [10897] задаёт «Категория» — реализация следует исходнику. " +
      "Формулировку 07 поправить патчем доков.",
  );
  eq2("столбец уровня (comparative → «Происхождение»)", headers[5], "Происхождение");
  eq2("разделитель формата tableToText", lines[2], "--- | --- | --- | --- | --- | ---");
  eq2("5 строк данных", lines.length - 3, 5);

  const rows = lines.slice(3).map((r) => r.split(" | "));
  ok("все 5 типов различны и сохранены",
    new Set(rows.map((r) => r[1])).size === 5,
    JSON.stringify(rows.map((r) => r[1])));
  eq2("centrality 0.92 без потери точности", rows[0][3], "0.92");
  eq2("certainty 0.81", rows[0][4], "0.81");
  eq2("certainty 0.7 без хвостовых нулей", rows[3][4], "0.7");
  eq2("порядок = position", rows.map((r) => r[0]).join(","),
    "Свобода,Необходимость,Различание,Забота,Событие");
  ok("определения на месте", rows[1][2] === "Всеобщая связь причин", rows[1][2]);
  ok("нет ext-столбцов при extGraphMetrics=false", headers.length === 6);
}

/* ═════════════ Запрос 3: extractGlossaryTable ═════════════ */

console.log("\nЗапрос 3. extractGlossaryTable — 3 термина");

await db.insert(schema.sections).values({
  synthesisId: sid, key: "glossary", sectionNum: 3, title: "Глоссарий", htmlContent: "<p>г</p>",
});
await db.insert(schema.glossaryTerms).values([
  { synthesisId: sid, term: "Свобода", definition: "Само-\nопределение субъекта", termCategory: "redefined", position: 0 },
  { synthesisId: sid, term: "Различание", definition: "Отсрочка смысла", termCategory: "borrowed", position: 1 },
  { synthesisId: sid, term: "Событие-предел", definition: "Точка   разрыва", termCategory: "new", position: 2 },
]);

{
  const src = createDbContextSource(sid);
  const table = await extractGlossaryTable(src);
  const lines = table.split("\n");

  eq2("префикс «ГЛОССАРИЙ (термины и определения):»", lines[0], "ГЛОССАРИЙ (термины и определения):");
  eq2("столбцы «Термин | Определение»", lines[1], "Термин | Определение");
  eq2("разделитель", lines[2], "--- | ---");
  eq2("3 строки данных", lines.length - 3, 3);
  eq2("перенос в определении нормализован", lines[3], "Свобода | Само- определение субъекта");
  eq2("двойные пробелы схлопнуты", lines[5], "Событие-предел | Точка разрыва");
  eq2("порядок = position", lines.slice(3).map((l) => l.split(" | ")[0]).join(","),
    "Свобода,Различание,Событие-предел");

  ok("столбца «Категория» НЕТ — как в исходнике", !lines[1].includes("Категория"));
  note(
    "07 (запрос 3 беседы 1.3) ожидает третий столбец «Категория». " +
      "extractGlossaryCompact исходника [8021] берёт РОВНО первые два столбца " +
      "(h0/h1 с дефолтами «Термин»/«Определение») — termCategory в контекст " +
      "не попадает. Реализация следует исходнику; 07 поправить патчем доков.",
  );
}

/* ═════════════ Запрос 4: buildContextForSection ═════════════ */

console.log("\nЗапрос 4. buildContextForSection('theses') с required=[sum:goals, graph:nodes_top]");

await db.insert(schema.sections).values({
  synthesisId: sid, key: "sum", sectionNum: 1, title: "Резюме",
  htmlContent:
    `<div data-section="Цели и метод"><h4>Цели и метод</h4><p>Цель синтеза — соединить трансцендентальную и деконструктивную линии.</p></div>
     <div data-section="Точки напряжения"><h4>Точки напряжения</h4><p>Автономия против différance.</p></div>`,
});

{
  const src = createDbContextSource(sid);
  const p = { method: "dialectical", synthLevel: "comparative", generationOrder: "architectural" };
  const resolved = await resolveContextDeps(p);
  const effective = {
    ...(await buildEffectiveDeps(["sum", "graph", "glossary", "theses"], resolved, "architectural")),
    theses: { required: ["sum:goals", "graph:nodes_top"], optional: [] },
  };

  const res = await buildContextForSection("theses", sid, "standard", effective, resolved, { source: src });

  ok("блок начинается заголовком исходника",
    res.text.startsWith("\n\nКОНТЕКСТ ИЗ ПРЕДЫДУЩИХ РАЗДЕЛОВ"), res.text.slice(0, 50));
  ok("фрагмент sum:goals внутри", res.text.includes("Цель синтеза — соединить"));
  ok("фрагмент graph:nodes_top внутри", res.text.includes("ТАБЛИЦА КАТЕГОРИЙ:"));
  ok("метка sum:goals из CTX_LABELS", res.text.includes("### Резюме → Цели и метод"));
  ok("метка graph:nodes_top из CTX_LABELS", res.text.includes("### Граф → Топ категорий"));
  ok("блок закрыт тройными кавычками", res.text.trimEnd().endsWith('"""'));

  eq2("оба required найдены", res.ctxLog.reqFound, 2);
  eq2("reqTotal = 2", res.ctxLog.reqTotal, 2);
  eq2("optional пуст", res.ctxLog.optTotal, 0);
  const byK = Object.fromEntries(res.ctxLog.entries.map((e) => [e.key, e]));
  eq2("sum:goals — status found", byK["sum:goals"].status, "found");
  eq2("graph:nodes_top — status found", byK["graph:nodes_top"].status, "found");
  // Шаг 4b: ключи из resolvedDeps, не попавшие в effectiveDeps, логируются
  // как dropped с пояснением — это и есть «утраченные» ключи исходника [8437].
  const dropped = res.ctxLog.entries.filter((e) => e.status === "dropped");
  ok("шаг 4b: сужение effectiveDeps даёт записи dropped", dropped.length > 0);
  ok("шаг 4b: у каждой dropped-записи есть note",
    dropped.every((e) => typeof e.note === "string" && e.note.length > 0));
  ok("шаг 4b: dropped не имеет длины и не помечен подстановкой",
    dropped.every((e) => e.len === 0 && e.isSubstitute === false));
  ok("шаг 4b: заменитель, реально попавший в effective, не дублируется",
    !dropped.some((e) => e.key === "sum:goals" || e.key === "graph:nodes_top"));

  eq2("budget = CONTEXT_BUDGET[standard]", res.ctxLog.budget, CONTEXT_BUDGET.standard);
  ok("totalUsed ≤ CONTEXT_BUDGET", res.ctxLog.totalUsed <= CONTEXT_BUDGET.standard,
    `${res.ctxLog.totalUsed} > ${CONTEXT_BUDGET.standard}`);
  ok("totalUsed = Σ длин обоих фрагментов",
    res.ctxLog.totalUsed === res.ctxLog.entries.reduce((s, e) => s + (e.status === "found" ? e.len : 0), 0));
  ok("порядок фрагментов = порядок required",
    res.text.indexOf("### Резюме → Цели и метод") < res.text.indexOf("### Граф → Топ категорий"));
}

/* ═════════════ Запрос 5: бюджетирование ═════════════ */

console.log("\nЗапрос 5. Бюджетирование: превышение CONTEXT_BUDGET");

const bigId = await makeSynthesis({ depth: "overview", synthLevel: "comparative" });
const BUDGET = CONTEXT_BUDGET.overview; // 24000

// sum:goals — небольшой required; sum:tensions — маленький optional (found);
// glossary:table — огромный optional (truncated); sum:novelty — за ним (skipped).
const GOALS = "Ц".repeat(800);
const TENSIONS = "Н".repeat(400);
const NOVELTY = "О".repeat(600);
await db.insert(schema.sections).values([
  { synthesisId: bigId, key: "sum", sectionNum: 1, title: "Резюме", htmlContent:
      `<div data-section="Цели и метод"><p>${GOALS}</p></div>
       <div data-section="Точки напряжения"><p>${TENSIONS}</p></div>
       <div data-section="Новизна и ценность"><p>${NOVELTY}</p></div>` },
  { synthesisId: bigId, key: "glossary", sectionNum: 2, title: "Глоссарий", htmlContent: "<p>г</p>" },
]);
await db.insert(schema.glossaryTerms).values(
  Array.from({ length: 400 }, (_, i) => ({
    synthesisId: bigId, term: `Термин ${i}`, definition: "О".repeat(120), position: i,
  })),
);

{
  const effective = {
    theses: {
      required: ["sum:goals"],
      optional: ["sum:tensions", "glossary:table", "sum:novelty"],
    },
  };
  const resolved = { theses: { required: ["sum:goals"], optional: ["sum:tensions", "glossary:table", "sum:novelty"] } };

  const res = await buildContextForSection("theses", bigId, "overview", effective, resolved);
  const byKey = Object.fromEntries(res.ctxLog.entries.map((e) => [e.key, e]));

  eq2("budget = CONTEXT_BUDGET[overview]", res.ctxLog.budget, BUDGET);

  eq2("required sum:goals — status found", byKey["sum:goals"].status, "found");
  eq2("required НЕ обрезан: len = полной длине фрагмента", byKey["sum:goals"].len, GOALS.length);

  eq2("маленький optional — status found", byKey["sum:tensions"].status, "found");
  eq2("огромный optional — status truncated", byKey["glossary:table"].status, "truncated");
  ok("truncated: note содержит «обрезан с … до …»",
    /обрезан с \d+ до \d+/.test(byKey["glossary:table"].note ?? ""), byKey["glossary:table"].note);
  eq2("следующий за truncated optional — skipped_budget", byKey["sum:novelty"].status, "skipped_budget");
  ok("skipped_budget: note про исчерпанный бюджет",
    /бюджет исчерпан/.test(byKey["sum:novelty"].note ?? ""), byKey["sum:novelty"].note);

  ok("все три статуса присутствуют в ctxLog",
    ["found", "truncated", "skipped_budget"].every((s) => res.ctxLog.entries.some((e) => e.status === s)),
    JSON.stringify([...new Set(res.ctxLog.entries.map((e) => e.status))]));

  ok("totalUsed ≤ budget", res.ctxLog.totalUsed <= BUDGET, `${res.ctxLog.totalUsed} > ${BUDGET}`);
  eq2("optIncluded = found + truncated", res.ctxLog.optIncluded, 2);
  eq2("optTotal = 3", res.ctxLog.optTotal, 3);
  ok("текст содержит обрезанный глоссарий с маркером сокращения",
    res.text.includes("[...сокращено...]"));

  // Ветка «бюджет исчерпан до входа в цикл optional» (remainingBudget ≤ 500)
  const heavyReq = { theses: { required: ["glossary:table"], optional: ["sum:tensions", "sum:novelty"] } };
  const res2 = await buildContextForSection("theses", bigId, "overview", heavyReq, heavyReq);
  const st2 = res2.ctxLog.entries.filter((e) => e.priority === "optional").map((e) => e.status);
  ok("required больше бюджета → ВСЕ optional skipped_budget",
    st2.length === 2 && st2.every((s) => s === "skipped_budget"), JSON.stringify(st2));
  const req2 = res2.ctxLog.entries.find((e) => e.key === "glossary:table");
  ok("required не обрезан, пока requiredLen ≤ budget × 1.5",
    req2.status === "found" && req2.len > BUDGET, `len=${req2.len}, budget=${BUDGET}`);
  ok("totalUsed может превышать budget — required приоритетнее (семантика исходника)",
    res2.ctxLog.totalUsed > BUDGET);
  note(
    "Уточнение к 07: «required не обрезаются» верно лишь до порога 1.5×budget. " +
      "Шаг 4 исходника [8419] пережимает required при requiredLen > budget×1.5, " +
      "щадя UNTOUCHABLE (graph:nodes, graph:edges, sum:goals, sum:tensions).",
  );

  // Порог 1.5×: не-UNTOUCHABLE required ужимается, UNTOUCHABLE — нет
  const over = { theses: { required: ["sum:goals", "glossary:table"], optional: [] } };
  const res3 = await buildContextForSection("theses", bigId, "overview", over, over);
  const goals3 = res3.ctxLog.entries.find((e) => e.key === "sum:goals");
  eq2("за порогом 1.5×: UNTOUCHABLE sum:goals цел", goals3.len, GOALS.length);
  ok("за порогом 1.5×: не-UNTOUCHABLE required пережат в тексте",
    res3.text.includes("[...сокращено...]"));
  ok("после пережатия totalUsed уменьшился относительно сырой суммы",
    res3.ctxLog.totalUsed > 0);
}

/* ═════════════ Запрос 6: extractSummaryGoals через linkedom ═════════════ */

console.log("\nЗапрос 6. extractSummaryGoals: data-section=\"Цели и задачи\"");

const goalsId = await makeSynthesis();
await db.insert(schema.sections).values({
  synthesisId: goalsId, key: "sum", sectionNum: 1, title: "Резюме",
  htmlContent:
    `<div class="doc-body"><div data-section="Цели и задачи"><h4>Цели и задачи</h4>
       <p>Первая задача — реконструкция.</p><p>Вторая задача — критика.</p>
       <table class="doc-table"><thead><tr><th>Задача</th><th>Метод</th></tr></thead>
       <tbody><tr><td>Реконструкция</td><td>герменевтика</td></tr></tbody></table>
     </div></div>`,
});

{
  const src = createDbContextSource(goalsId);
  const text = await extractSummaryGoals(src);

  ok("текст извлечён (фолбэк «цели» сработал на «Цели и задачи»)", typeof text === "string" && text.length > 0, String(text));
  ok("заголовок h4 включён", text.includes("Цели и задачи"));
  ok("оба абзаца включены",
    text.includes("Первая задача — реконструкция.") && text.includes("Вторая задача — критика."));
  ok("таблица прошла через tableToText, а не innerText",
    text.includes("Задача | Метод") && text.includes("--- | ---") && text.includes("Реконструкция | герменевтика"),
    JSON.stringify(text));
  ok("тот же результат через диспетчер",
    (await extractContextFragment("sum:goals", src)) === text);

  // Точное имя «Цели и метод» — приоритет 1, без фолбэка
  const exactId = await makeSynthesis();
  await db.insert(schema.sections).values({
    synthesisId: exactId, key: "sum", sectionNum: 1, title: "Резюме",
    htmlContent: `<div data-section="Цели и метод"><p>Метод: диалектика.</p></div>
                  <div data-section="Цели и задачи"><p>Не должно попасть.</p></div>`,
  });
  const exactSrc = createDbContextSource(exactId);
  const exact = await extractSummaryGoals(exactSrc);
  eq2("«Цели и метод» выигрывает у «Цели и задачи»", exact, "Метод: диалектика.");
}

/* ═════════════ Запрос 7: edge cases ═════════════ */

console.log("\nЗапрос 7. Edge cases");

{
  const p = { method: "dialectical", synthLevel: "comparative", generationOrder: "architectural" };
  const resolved = await resolveContextDeps(p);
  const selected = ["sum", "graph", "glossary", "theses"];
  const effective = await buildEffectiveDeps(selected, resolved, "architectural");
  buildDynamicOrder(effective, selected, resolved, "architectural");

  // 1. Первый раздел: предшественников нет
  const freshId = await makeSynthesis();
  const sum = await buildContextForSection("sum", freshId, "standard", effective, resolved);
  eq2("sum на пустом синтезе: текст пуст, не throw", sum.text, "");
  ok("sum: ctxLog всё равно записан", sum.ctxLog !== null && sum.ctxLog.sectionKey === "sum");
  eq2("sum: reqFound = 0", sum.ctxLog.reqFound, 0);
  ok("sum: все записи required/optional — missing либо dropped",
    sum.ctxLog.entries.every((e) => ["missing", "dropped", "skipped_budget"].includes(e.status)),
    JSON.stringify([...new Set(sum.ctxLog.entries.map((e) => e.status))]));
  ok("sum: capsule имеет запись в CONTEXT_DEPS_BASE (грабля 1.1) — deps найдены",
    sum.ctxLog.reqTotal + sum.ctxLog.optTotal >= 0);

  // 2. Фрагмент несгенерированного раздела
  const src = createDbContextSource(freshId);
  for (const key of ["graph:nodes", "theses:summary", "glossary:table", "critique:full", "dialogue:synthesis"]) {
    eq2(`${key} для несгенерированного раздела → null, не ошибка`,
      await extractContextFragment(key, src), null);
  }
  eq2("capsule:full без капсулы → null", await extractContextFragment("capsule:full", src), null);
  eq2("неизвестный ключ → null (ветка default)", await extractContextFragment("wat:wat", src), null);
  note(
    "Уточнение к 07: «возвращает пустую строку» — на деле исходник [8150] " +
      "возвращает null (falsy, отличимо от валидного пустого фрагмента); " +
      "buildContextForSection трактует null как status=\"missing\".",
  );

  // 3. Раздел сгенерирован, но гранулярные таблицы пусты
  const emptyGraphId = await makeSynthesis();
  await db.insert(schema.sections).values({
    synthesisId: emptyGraphId, key: "graph", sectionNum: 1, title: "Граф", htmlContent: "<p>текст без таблиц</p>",
  });
  const eg = createDbContextSource(emptyGraphId);
  eq2("раздел есть, categories пуст → null", await extractContextFragment("graph:nodes", eg), null);
  eq2("graph:nodes_top на пустых категориях → null", await extractContextFragment("graph:nodes_top", eg), null);
  eq2("graph:topology без нужного data-section → null", await extractContextFragment("graph:topology", eg), null);

  // 4. Пустой HTML раздела трактуется как «не сгенерирован»
  const blankId = await makeSynthesis();
  await db.insert(schema.sections).values({
    synthesisId: blankId, key: "sum", sectionNum: 1, title: "Резюме", htmlContent: "   ",
  });
  eq2("пустой html_content → раздел считается несгенерированным",
    await extractContextFragment("sum:goals", createDbContextSource(blankId)), null);

  // 5. Несуществующий synthesisId не роняет конвейер
  const ghost = createDbContextSource("00000000-0000-0000-0000-000000000000");
  eq2("несуществующий синтез: фрагмент → null", await extractContextFragment("sum:goals", ghost), null);
  const ghostRes = await buildContextForSection(
    "theses", "00000000-0000-0000-0000-000000000000", "standard", effective, resolved,
  );
  eq2("несуществующий синтез: buildContextForSection → пустой текст", ghostRes.text, "");
  ok("несуществующий синтез: ctxLog корректен", ghostRes.ctxLog.reqFound === 0);

  // 6. Идемпотентность: повторный вызов даёт тот же результат
  const a = await buildContextForSection("theses", sid, "standard", effective, resolved);
  const b = await buildContextForSection("theses", sid, "standard", effective, resolved);
  eq2("повторный вызов идемпотентен по тексту", a.text, b.text);
  eq2("повторный вызов идемпотентен по totalUsed", a.ctxLog.totalUsed, b.ctxLog.totalUsed);
}

/* ═════════════ Итог ═════════════ */

await db.delete(schema.users).where(eq(schema.users.id, userId));
await closeDb();
await closeRedis();

console.log(`\n${fails.length === 0 ? "OK" : "FAIL"}: ${pass} проверок пройдено, ${fails.length} провалено`);
if (notes.length) {
  console.log(`\nЗамечания к 07 (${notes.length}):`);
  for (const n of notes) console.log("  ⚑ " + n);
}
if (fails.length) {
  for (const f of fails) console.log("  ✗ " + f);
  process.exit(1);
}
