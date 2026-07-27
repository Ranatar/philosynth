/**
 * Беседа 1.1, запрос 5: findSubstitute при sections=["graph","theses"]
 * (нет glossary) — для тезисов, зависящих от glossary:table, находится
 * замена по SUBSTITUTION_MAP; getSubstituteQuality возвращает 1/2/3.
 * Живая карта подстановок — из Registry (substitution_map).
 */
import assert from "node:assert/strict";

const {
  findSubstitute,
  getSubstituteQuality,
  getActiveSubstitutionMap,
  resolveContextDeps,
  buildEffectiveDepsWith,
} = await import("./server/services/synthesis-engine.ts");
const { closeDb } = await import("./server/db/index.js");
const { closeRedis } = await import("./server/redis.js");

let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);

try {
  const subMap = await getActiveSubstitutionMap("architectural");

  // ── 1. findSubstitute напрямую: glossary:table при доступных graph+theses ──
  const available = new Set(["sum", "graph", "theses"]);
  // Карта исходника: glossary:table → [{graph:nodes, q:2}]
  const sub = findSubstitute("glossary:table", available, "theses", subMap);
  assert.equal(sub, "graph:nodes");
  ok("glossary:table → заменитель graph:nodes (первый доступный кандидат)");

  // selfSection исключается: для самого graph заменитель graph:nodes невозможен
  const subSelf = findSubstitute("glossary:table", available, "graph", subMap);
  assert.notEqual(subSelf, "graph:nodes");
  ok(`selfSection исключён: для graph заменитель ≠ graph:nodes (получен ${subSelf})`);

  // Недоступные источники всех кандидатов → null
  const subNone = findSubstitute(
    "glossary:table",
    new Set(["sum", "theses"]),
    "theses",
    subMap,
  );
  assert.equal(subNone, null);
  ok("нет доступных кандидатов (и не self) → null");

  // ── 2. Сквозной сценарий протокола: buildEffectiveDeps для [graph, theses] ──
  const rd = await resolveContextDeps({
    method: "dialectical",
    synthLevel: "comparative",
  });
  assert.ok(rd.theses.optional.includes("glossary:table"));
  ok("предусловие: theses зависит от glossary:table (optional в BASE)");

  const ed = buildEffectiveDepsWith(["graph", "theses"], rd, subMap);
  assert.ok(!ed.theses.optional.includes("glossary:table"));
  assert.ok(ed.theses.optional.includes("graph:nodes"));
  ok("в effectiveDeps glossary:table заменён на graph:nodes (glossary не выбран)");
  // Требуемые graph-ключи theses остались как есть — graph доступен
  assert.ok(ed.theses.required.includes("graph:nodes_compact"));
  assert.ok(ed.theses.required.includes("graph:edges"));
  ok("прямые graph-зависимости theses не тронуты (источник доступен)");

  // ── 3. Понижение required→optional при q<3 ──
  // Синтетика: required-ключ с заменителем q=2 уходит в optional
  const rdSynth = {
    theses: { required: ["glossary:table"], optional: [] },
  };
  const edSynth = buildEffectiveDepsWith(["graph", "theses"], rdSynth, subMap);
  assert.ok(!edSynth.theses.required.includes("graph:nodes"));
  assert.ok(edSynth.theses.optional.includes("graph:nodes"));
  ok("required-ключ с заменителем q=2 понижен до optional (q<3)");

  // ── 4. getSubstituteQuality: значения 1/2/3 и null ──
  const q2 = getSubstituteQuality("graph:nodes", subMap); // кандидат glossary:table, q=2
  assert.equal(q2, 2);
  ok("getSubstituteQuality('graph:nodes') = 2");
  const q1 = getSubstituteQuality("theses:summary", subMap); // кандидат graph:nodes_compact, q=1
  assert.equal(q1, 1);
  ok("getSubstituteQuality('theses:summary') = 1");
  // Все качества карты — строго из {1,2,3}
  const allQ = new Set(
    Object.values(subMap).flatMap((cands) => cands.map((c) => c.q)),
  );
  assert.ok([...allQ].every((q) => [1, 2, 3].includes(q)));
  ok(`все q карты ∈ {1,2,3} (встречаются: ${[...allQ].sort().join(",")})`);
  // Семантика first-match исходника: при вхождении ключа в несколько списков
  // кандидатов возвращается q ПЕРВОГО найденного при итерации карты
  const firstQ = new Map();
  for (const cands of Object.values(subMap))
    for (const c of cands) if (!firstQ.has(c.key)) firstQ.set(c.key, c.q);
  for (const [key, q] of firstQ)
    assert.equal(getSubstituteQuality(key, subMap), q, `first-match для ${key}`);
  ok(`first-match семантика подтверждена для всех ${firstQ.size} ключей-заменителей`);
  const q3first = [...firstQ.entries()].find(([, q]) => q === 3)?.[0];
  if (q3first) {
    assert.equal(getSubstituteQuality(q3first, subMap), 3);
    ok(`getSubstituteQuality('${q3first}') = 3 (равноценная замена, первое вхождение)`);
  } else {
    ok("ключа с q=3 в ПЕРВОМ вхождении нет — q=3 встречается только не-первым (факт карты)");
  }
  // Не-заменитель → null: ключ выбираем программно (sum:goals, вопреки
  // интуиции, САМ является кандидатом q=1 в карте)
  const { ALL_CTX_KEYS } = await import(
    "./packages/shared/constants/ctx-keys.ts"
  );
  const nonSub = ALL_CTX_KEYS.find((k) => !firstQ.has(k));
  assert.ok(nonSub, "существует ctx-ключ вне карты заменителей");
  assert.equal(getSubstituteQuality(nonSub, subMap), null);
  ok(`не-заменитель ('${nonSub}') → null`);

  console.log(`\ntest-11-request5: OK (${n} ✓)`);
} finally {
  await closeDb();
  await closeRedis();
}
