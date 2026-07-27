/**
 * Беседа 1.1, запрос 3: buildDynamicOrder корректно обрабатывает циклические
 * зависимости — тест с graph → theses → graph (resolveCircularDeps разрывает
 * цикл по слабейшему ребру). Чистые функции + один прогон на живых конфигах.
 */
import assert from "node:assert/strict";

const {
  buildDynamicOrder,
  computePredecessors,
  resolveCircularDeps,
  findOneCycle,
} = await import("./server/utils/topo-sort.ts");
const { resolveContextDeps, buildEffectiveDeps } = await import(
  "./server/services/synthesis-engine.ts"
);
const { closeDb } = await import("./server/db/index.js");
const { closeRedis } = await import("./server/redis.js");

let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);
const clone = (o) => JSON.parse(JSON.stringify(o));

try {
  // ── 1. Синтетический цикл graph → theses → graph ──
  // theses требует graph:nodes_compact (ребро graph→theses),
  // graph получил заменитель theses:summary (ребро theses→graph, слабое q=1)
  const resolvedDeps = {
    graph: { required: ["sum:goals"], optional: [] },
    theses: { required: ["graph:nodes_compact"], optional: [] },
  };
  const effectiveDeps = {
    graph: { required: ["sum:goals"], optional: ["theses:summary"] },
    theses: { required: ["graph:nodes_compact"], optional: [] },
  };
  const subMap = {
    "glossary:table": [{ key: "theses:summary", q: 1 }], // theses:summary — заменитель, q=1
  };

  const preds = computePredecessors(effectiveDeps);
  assert.ok(preds.graph.has("theses") && preds.theses.has("graph"));
  ok("предусловие: цикл graph ↔ theses присутствует в predecessors");
  assert.ok(findOneCycle(preds) !== null);
  ok("findOneCycle находит цикл");

  const order = buildDynamicOrder(
    effectiveDeps,
    ["graph", "theses"],
    resolvedDeps,
    "architectural",
    subMap,
  );
  assert.deepEqual(order, ["sum", "graph", "theses"]);
  ok("порядок валиден: sum → graph → theses (слабое ребро разорвано)");
  // Разорвано именно слабейшее ребро (заменитель q=1), оригинальная
  // required-зависимость theses←graph (q=10) сохранена
  assert.deepEqual(effectiveDeps.theses.required, ["graph:nodes_compact"]);
  ok("оригинальная required-зависимость theses (q=10) не тронута");
  assert.deepEqual(effectiveDeps.graph.optional, []);
  ok("слабый optional-заменитель theses:summary удалён из effectiveDeps (мутация)");
  assert.equal(findOneCycle(computePredecessors(effectiveDeps)), null);
  ok("после buildDynamicOrder циклов нет");

  // ── 2. Взаимные ОРИГИНАЛЬНЫЕ required (fallback-ветка исходника) ──
  const resolved2 = {
    graph: { required: ["theses:summary"], optional: [] },
    theses: { required: ["graph:nodes_compact"], optional: [] },
  };
  const eff2 = clone(resolved2);
  const preds2 = computePredecessors(eff2);
  resolveCircularDeps(preds2, eff2, resolved2, {});
  assert.equal(findOneCycle(preds2), null);
  ok("взаимные оригинальные required: цикл разорван fallback-веткой");
  // removeEdge переносит required→optional, а не удаляет (контекст ценен)
  const moved =
    eff2.graph.optional.includes("theses:summary") ||
    eff2.theses.optional.includes("graph:nodes_compact");
  assert.ok(moved);
  ok("removeEdge перенёс required-ключ разорванного ребра в optional");

  // ── 3. Живые конфиги: реальный набор секций ацикличен и упорядочен ──
  const p = { method: "dialectical", synthLevel: "comparative" };
  const sections = ["graph", "glossary", "theses", "critique"];
  const rd = await resolveContextDeps(p);
  const ed = await buildEffectiveDeps(sections, rd, "architectural");
  const realOrder = buildDynamicOrder(ed, sections, rd, "architectural");
  assert.equal(realOrder[0], "sum");
  assert.deepEqual([...realOrder].sort(), ["critique", "glossary", "graph", "sum", "theses"].sort());
  ok(`живые конфиги: порядок ${realOrder.join(" → ")}`);
  // Зависимости соблюдены: graph раньше glossary/theses, critique последним
  assert.ok(realOrder.indexOf("graph") < realOrder.indexOf("glossary"));
  assert.ok(realOrder.indexOf("graph") < realOrder.indexOf("theses"));
  assert.equal(realOrder[realOrder.length - 1], "critique");
  ok("топология соблюдена: graph ранее потребителей, critique последним");

  // ── 4. Генетический порядок меняет tie-break таблицу ──
  const sectionsG = ["graph", "glossary", "theses", "dialogue"];
  const rdG = await resolveContextDeps({ ...p, generationOrder: "genetic" });
  const edG = await buildEffectiveDeps(sectionsG, rdG, "genetic");
  const orderG = buildDynamicOrder(edG, sectionsG, rdG, "genetic");
  assert.equal(orderG[0], "sum");
  assert.ok(orderG.indexOf("dialogue") < orderG.indexOf("graph"));
  ok(`генетический порядок: ${orderG.join(" → ")} (dialogue раньше graph)`);

  console.log(`\ntest-11-request3: OK (${n} ✓)`);
} finally {
  await closeDb();
  await closeRedis();
}
