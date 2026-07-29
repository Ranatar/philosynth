/**
 * Беседа 1.1, запрос 7: edge cases — пустой sections=[] не роняет конвейер
 * (resolveContextDeps → buildEffectiveDeps → buildDynamicOrder →
 * computeSectionAdvice → estimateCost); computePredecessors с одним
 * разделом — корректный результат.
 */
import assert from "node:assert/strict";

const {
  resolveContextDeps,
  buildEffectiveDeps,
  buildEffectiveDepsWith,
  getActiveSubstitutionMap,
} = await import("../server/services/synthesis-engine.ts");
const { computePredecessors, buildDynamicOrder, resolveCircularDeps } =
  await import("../server/utils/topo-sort.ts");
const { computeSectionAdvice } = await import(
  "../server/services/compat-advisor.ts"
);
const { estimateCost, estimateModeCost } = await import(
  "../server/services/cost-estimator.ts"
);
const { closeDb } = await import("../server/db/index.js");
const { closeRedis } = await import("../server/redis.js");

let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);

try {
  const p = { method: "dialectical", synthLevel: "comparative" };
  const rd = await resolveContextDeps(p);

  // ── 1. Пустой sections=[] — весь конвейер без crash ──
  const edEmpty = await buildEffectiveDeps([], rd, "architectural");
  assert.deepEqual(edEmpty, {});
  ok("buildEffectiveDeps([]) → {} (без crash)");

  const predsEmpty = computePredecessors(edEmpty);
  assert.deepEqual(predsEmpty, {});
  ok("computePredecessors({}) → {}");

  const orderEmpty = buildDynamicOrder(edEmpty, [], rd, "architectural");
  assert.deepEqual(orderEmpty, ["sum"]);
  ok("buildDynamicOrder([], …) → ['sum'] (sum всегда первый и единственный)");

  const adviceEmpty = await computeSectionAdvice({
    sections: [],
    synthLevel: "comparative",
    method: "dialectical",
  });
  assert.deepEqual(adviceEmpty.warnings, []);
  assert.deepEqual(adviceEmpty.recommendations, []);
  assert.deepEqual(adviceEmpty.substitutions, []);
  ok("computeSectionAdvice(sections=[]) → три пустых списка");

  const estEmpty = await estimateCost({
    params: { depth: "standard" },
    passes: [],
    effectiveDeps: {},
    sysChars: 6000,
    baseStaticChars: 2000,
  });
  assert.deepEqual(estEmpty, { inTokens: 0, outTokens: 0, cost: 0, passes: 0 });
  ok("estimateCost(passes=[]) → нули (без crash)");

  // Только sum (свободный минимум): один pass, контекст не нужен (i=0)
  const estSumOnly = await estimateCost({
    params: { depth: "standard" },
    passes: [[{ key: "sum", prompt: "x".repeat(1000), title: "Резюме" }]],
    effectiveDeps: {},
    sysChars: 6000,
    baseStaticChars: 2000,
  });
  assert.ok(estSumOnly.inTokens > 0 && estSumOnly.outTokens > 0);
  assert.equal(estSumOnly.passes, 1);
  ok("estimateCost только с sum: валидная ненулевая оценка, 1 pass");

  // ── 2. computePredecessors с одним разделом ──
  const edSingle = await buildEffectiveDeps(["theses"], rd, "architectural");
  const predsSingle = computePredecessors(edSingle);
  assert.deepEqual(Object.keys(predsSingle), ["theses"]);
  ok("один раздел: ключ единственный");
  // Все graph/glossary-зависимости недоступны и без заменителей из
  // доступного набора → deps только от sum → предшественников нет
  assert.equal(predsSingle.theses.size, 0);
  ok("предшественники theses пусты (остались только sum:* ключи)");
  const orderSingle = buildDynamicOrder(edSingle, ["theses"], rd, "architectural");
  assert.deepEqual(orderSingle, ["sum", "theses"]);
  ok("buildDynamicOrder одного раздела → ['sum','theses']");

  // ── 3. Смежные краевые случаи чистых функций ──
  // resolveCircularDeps на пустых структурах — no-op
  const emptyPreds = {};
  resolveCircularDeps(emptyPreds, {}, {}, {});
  assert.deepEqual(emptyPreds, {});
  ok("resolveCircularDeps({} …) — no-op без crash");

  // Раздел без записи в resolvedDeps → пустые deps (ветка !base исходника);
  // capsule НЕ подходит — у него запись есть (optional sum:goals/sum:novelty)
  const subMap = await getActiveSubstitutionMap("architectural");
  const edUnknown = buildEffectiveDepsWith(["nonexistent"], rd, subMap);
  assert.deepEqual(edUnknown.nonexistent, { required: [], optional: [] });
  ok("раздел без записи в resolvedDeps → {required:[], optional:[]}");
  const edCapsule = buildEffectiveDepsWith(["capsule"], rd, subMap);
  assert.deepEqual(edCapsule.capsule.optional, ["sum:goals", "sum:novelty"]);
  ok("капсула: запись в resolvedDeps ЕСТЬ (optional sum:goals, sum:novelty)");

  // estimateModeCost с пустыми deps режима — фикс-часть промпта + выход
  const estMode = await estimateModeCost({
    deps: { required: [], optional: [] },
    params: { depth: "standard" },
    sysChars: 5000,
  });
  assert.ok(estMode.inTokens > 0 && estMode.outTokens > 0 && estMode.cost > 0);
  ok("estimateModeCost с пустыми deps: валидная оценка (промпт+выход)");

  console.log(`\ntest-11-request7: OK (${n} ✓)`);
} finally {
  await closeDb();
  await closeRedis();
}
