/**
 * Беседа 1.1, запрос 4: estimateCost — глубина "exhaustive" против
 * "standard" (~2x; фактически mw 600/250 = 2.4 по выходу) и
 * пропорциональность стоимости числу разделов (6 vs 3).
 *
 * Конфиги fragment_share/context_budget — живые (Registry/БД);
 * sysChars/baseStaticChars/defs — синтетика реалистичных размеров
 * (buildSYS/buildSectionDefs появятся в беседе 1.2).
 */
import assert from "node:assert/strict";

const { estimateCost, mw, SECTION_OUTPUT_MULT } = await import(
  "../server/services/cost-estimator.ts"
);
const { resolveContextDeps, buildEffectiveDeps } = await import(
  "../server/services/synthesis-engine.ts"
);
const { buildDynamicOrder } = await import("../server/utils/topo-sort.ts");
const { closeDb } = await import("../server/db/index.js");
const { closeRedis } = await import("../server/redis.js");

let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);

// Синтетический def раздела с реалистичной длиной промпта
const mkDef = (key) => ({
  key,
  prompt: "x".repeat(1500),
  title: `Раздел ${key}`,
});

/** Полный прогон оценки для набора секций и глубины */
async function estimateFor(sections, depth) {
  const p = {
    method: "dialectical",
    synthLevel: "comparative",
    generationOrder: "architectural",
  };
  const rd = await resolveContextDeps(p);
  const ed = await buildEffectiveDeps(sections, rd, "architectural");
  const order = buildDynamicOrder(ed, sections, rd, "architectural");
  // Каждый раздел — отдельный pass (worst case groupPasses), sum первым
  const passes = order.map((key) => [mkDef(key)]);
  return estimateCost({
    params: { depth },
    passes,
    effectiveDeps: ed,
    sysChars: 6000,
    baseStaticChars: 2000,
  });
}

try {
  const S3 = ["graph", "glossary", "theses"];
  const S6 = ["graph", "glossary", "theses", "name", "history", "dialogue"];

  // ── 1. Глубина: exhaustive vs standard ──
  const std = await estimateFor(S3, "standard");
  const exh = await estimateFor(S3, "exhaustive");
  assert.ok(std.inTokens > 0 && std.outTokens > 0 && std.cost > 0);
  ok(
    `standard/3 секции: in=${std.inTokens}, out=${std.outTokens}, $${std.cost.toFixed(4)}, passes=${std.passes}`,
  );

  const outRatio = exh.outTokens / std.outTokens;
  const costRatio = exh.cost / std.cost;
  // mw: 600/250 = 2.4 → выход ровно 2.4x
  assert.ok(Math.abs(outRatio - 2.4) < 0.01);
  ok(`exhaustive/standard по выходу = ${outRatio.toFixed(2)} (= mw 600/250)`);
  // Стоимость ~2x из протокола: вход растёт медленнее (sys/промпты
  // фиксированы), итог между 1.8 и 2.4
  assert.ok(costRatio > 1.8 && costRatio < 2.45);
  ok(`exhaustive/standard по стоимости = ${costRatio.toFixed(2)} (~2x ✓)`);
  assert.ok(exh.inTokens > std.inTokens);
  ok("вход exhaustive > standard (контекст-фрагменты крупнее)");

  // ── 2. Пропорциональность числу разделов: 6 vs 3 ──
  const six = await estimateFor(S6, "standard");
  ok(
    `standard/6 секций: in=${six.inTokens}, out=${six.outTokens}, $${six.cost.toFixed(4)}, passes=${six.passes}`,
  );
  // Ожидаемая пропорция по выходу = отношение сумм множителей секций
  // (включая sum в обоих наборах)
  const multSum = (keys) =>
    ["sum", ...keys].reduce(
      (s, k) => s + (SECTION_OUTPUT_MULT[k] ?? SECTION_OUTPUT_MULT._default),
      0,
    );
  const expectedOutRatio = multSum(S6) / multSum(S3);
  const outRatio63 = six.outTokens / std.outTokens;
  assert.ok(Math.abs(outRatio63 - expectedOutRatio) < 0.02);
  ok(
    `выход 6/3 секций = ${outRatio63.toFixed(2)} (= Σ множителей ${expectedOutRatio.toFixed(2)} — пропорционален составу)`,
  );
  const costRatio63 = six.cost / std.cost;
  assert.ok(costRatio63 > 1.5 && costRatio63 < 2.3);
  ok(
    `стоимость 6/3 секций = ${costRatio63.toFixed(2)} (растёт пропорционально числу и весу разделов)`,
  );
  assert.equal(six.passes, 7);
  assert.equal(std.passes, 4);
  ok("passes: 7 против 4 (sum + секции, по одному на pass)");

  // ── 3. Санити: mw по глубинам ──
  assert.equal(mw({ depth: "standard" }), 250);
  assert.equal(mw({ depth: "exhaustive" }), 600);
  assert.equal(mw({}), 250);
  ok("mw: 250 / 600 / дефолт 250 — как в исходнике");

  console.log(`\ntest-11-request4: OK (${n} ✓)`);
} finally {
  await closeDb();
  await closeRedis();
}
