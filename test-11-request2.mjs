/**
 * Беседа 1.1, запрос 2: юнит-тест resolveContextDeps на живых конфигах
 * (synthesis_configs, посеяны seed:configs; чтение через Prompt Registry).
 *
 * Примечание к ожиданию протокола 07: «graph получает required:
 * ["sum:goals","sum:tensions"]» при {method:"dialectical",
 * synthLevel:"comparative"} — по фактическим конфигам (= исходнику,
 * байт-сверка 0.3) sum:tensions добавляется уровне-патчем
 * transformative/generative, а не comparative. Тест фиксирует ФАКТ
 * исходника: comparative → ["sum:goals"], transformative →
 * ["sum:goals","sum:tensions"]. Расхождение — неточность формулировки
 * протокола, задокументирована в отчёте беседы.
 */
import assert from "node:assert/strict";

const { resolveContextDeps } = await import(
  "./server/services/synthesis-engine.ts"
);
const { closeDb } = await import("./server/db/index.js");
const { closeRedis } = await import("./server/redis.js");

let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);

try {
  // ── 1. comparative:dialectical (параметры из протокола) ──
  const comp = await resolveContextDeps({
    method: "dialectical",
    synthLevel: "comparative",
    generationOrder: "architectural",
  });
  assert.deepEqual(comp.graph.required, ["sum:goals"]);
  ok("comparative:dialectical → graph.required = ['sum:goals'] (= исходник)");
  assert.deepEqual(comp.graph.optional, ["sum:portraits"]);
  ok("comparative:dialectical → graph.optional = ['sum:portraits']");
  assert.deepEqual(comp.theses.required, [
    "sum:goals",
    "sum:tensions",
    "graph:nodes_compact",
    "graph:edges",
  ]);
  ok("theses.required — 4 ключа BASE без патчей (dialectical патча нет)");

  // ── 2. transformative:dialectical — здесь ожидание протокола верно ──
  const trans = await resolveContextDeps({
    method: "dialectical",
    synthLevel: "transformative",
  });
  assert.deepEqual(trans.graph.required, ["sum:goals", "sum:tensions"]);
  ok(
    "transformative:dialectical → graph.required = ['sum:goals','sum:tensions'] (ожидание протокола — про этот уровень)",
  );
  // Повышение deepMergeUniq: sum:portraits у theses (BASE optional)
  // при transformative уходит в required и исчезает из optional
  assert.ok(trans.theses.required.includes("sum:portraits"));
  assert.ok(!trans.theses.optional.includes("sum:portraits"));
  ok("deepMergeUniq-повышение: theses sum:portraits optional→required");

  // ── 3. Метод-патчи: analytical добавляет glossary:table в theses.optional ──
  const anal = await resolveContextDeps({
    method: "analytical",
    synthLevel: "comparative",
  });
  assert.ok(anal.theses.optional.includes("glossary:table"));
  ok("метод-патч analytical: theses.optional += glossary:table");

  // ── 4. Генетический порядок: BASE_GENETIC + LEVEL_GENETIC + METHOD ──
  const gen = await resolveContextDeps({
    method: "hermeneutical",
    synthLevel: "comparative",
    generationOrder: "genetic",
  });
  // В генетике graph строится после theses/glossary — его deps иные, чем в BASE
  assert.ok(gen.graph, "graph присутствует в генетической карте");
  assert.notDeepEqual(gen.graph, comp.graph);
  ok("genetic: карта отличается от архитектурной (graph deps иные)");
  // Метод-патч применим и к генетическому порядку (hermeneutical → history)
  assert.ok(gen.history.optional.includes("origin:genealogy"));
  ok("метод-патч hermeneutical действует и в генетическом порядке");

  // ── 5. Дефолты параметров (?? в исходнике) ──
  const dflt = await resolveContextDeps({});
  assert.deepEqual(dflt, comp);
  ok("пустые params → дефолты comparative/dialectical/architectural");

  console.log(`\ntest-11-request2: OK (${n} ✓)`);
} finally {
  await closeDb();
  await closeRedis();
}
