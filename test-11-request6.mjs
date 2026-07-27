/**
 * Беседа 1.1, запрос 6: getCompatEntryByKey("generative:creative") — entry
 * содержит rating, severity, desc, чипы по разделам; computeSectionWarnings
 * для sections=["theses"] без graph/glossary — предупреждения содержат
 * недостающие источники; активные подстановки — в computeSectionAdvice.
 */
import assert from "node:assert/strict";

const {
  getCompatEntryByKey,
  chipClassForRating,
  iconForSeverity,
  titleForSeverity,
  computeSectionWarnings,
  computeSectionAdvice,
} = await import("./server/services/compat-advisor.ts");
const { resolveContextDeps } = await import(
  "./server/services/synthesis-engine.ts"
);
const { closeDb } = await import("./server/db/index.js");
const { closeRedis } = await import("./server/redis.js");

let n = 0;
const ok = (msg) => console.log(`  ✓ ${++n}. ${msg}`);

try {
  // ── 1. getCompatEntryByKey("generative:creative") ──
  const entry = await getCompatEntryByKey("generative:creative");
  assert.ok(entry, "entry найден");
  assert.equal(entry.rating, "★★");
  assert.equal(entry.severity, "synergy");
  assert.ok(typeof entry.desc === "string" && entry.desc.length > 0);
  ok(`entry: rating=${entry.rating}, severity=${entry.severity}, desc есть`);

  // Чипы по разделам: 11 рейтингов, sections_override применён
  assert.equal(Object.keys(entry.sections).length, 11);
  ok("sections — 11 чипов по разделам");
  assert.equal(entry.sections.glossary, "★★★"); // override
  assert.equal(entry.sections.dialogue, "★★★"); // override
  assert.equal(entry.sections.name, "★★"); // override (meta было бы ★)
  assert.equal(entry.sections.evolution, "★★"); // override
  ok("sections_override применён: glossary/dialogue ★★★, name/evolution ★★");
  // Без override: core при synergy → ★★, meta → ★ (BASE_SECTION_RATING)
  assert.equal(entry.sections.graph, "★★");
  assert.equal(entry.sections.history, "★");
  ok("без override: core (graph) ★★, meta (history) ★ — BASE_SECTION_RATING");

  // UI-хелперы Advisor v2
  assert.equal(chipClassForRating(entry.sections.glossary), "chip-synergy");
  assert.equal(chipClassForRating("✗✗"), "chip-hard-conflict");
  assert.equal(iconForSeverity(entry.severity), "★★");
  assert.equal(titleForSeverity(entry.severity), "Продуктивный парадокс");
  ok("chipClassForRating / iconForSeverity / titleForSeverity — как в исходнике");

  // synergy-max + пики метода: generative:analytical → пики theses/critique/origin ★★★
  const ga = await getCompatEntryByKey("generative:analytical");
  assert.equal(ga.severity, "synergy-max");
  assert.equal(ga.sections.theses, "★★★");
  assert.equal(ga.sections.critique, "★★★");
  assert.equal(ga.sections.graph, "★★"); // core вне пиков
  assert.equal(ga.sections.history, "★"); // override history:★
  ok("generative:analytical: METHOD_SYNERGY_PEAKS модулирует core-чипы");

  // Несуществующая пара → null
  assert.equal(await getCompatEntryByKey("nonexistent:creative"), null);
  ok("несуществующий ключ → null");

  // ── 2. computeSectionWarnings: theses без graph/glossary ──
  const rd = await resolveContextDeps({
    method: "dialectical",
    synthLevel: "comparative",
  });
  const w = computeSectionWarnings(rd);
  assert.ok(w.secTheses.needs.includes("secGraph"));
  ok("secTheses.needs содержит secGraph (required graph:*-ключи)");
  assert.ok(!w.secTheses.needs.includes("secGlossary"));
  ok("glossary:table — optional, в needs НЕ входит (needs только по required)");
  assert.equal(w.secTheses.label, "Корпус тезисов");
  ok("label из SECTION_LABELS");

  // ── 3. computeSectionAdvice: недостающие источники + активные подстановки ──
  const adviceTheses = await computeSectionAdvice({
    sections: ["theses"],
    synthLevel: "comparative",
    method: "dialectical",
    generationOrder: "architectural",
  });
  const warnTexts = adviceTheses.warnings.map((x) => x.text).join(" | ");
  assert.ok(warnTexts.includes("«Граф категорий»"));
  assert.ok(warnTexts.includes("«Корпус тезисов»"));
  assert.ok(warnTexts.includes("будет ненадлежащего качества"));
  ok("предупреждение о недостающем источнике: theses без graph");

  // Активные подстановки: [graph, theses] без glossary →
  // glossary:table у theses заменён на graph:nodes (q=2, «частичная замена»)
  const adviceGT = await computeSectionAdvice({
    sections: ["graph", "theses"],
    synthLevel: "comparative",
    method: "dialectical",
    generationOrder: "architectural",
  });
  const subTexts = adviceGT.substitutions.map((x) => x.text).join(" | ");
  assert.ok(subTexts.includes("«Корпус тезисов»"));
  assert.ok(subTexts.includes("Граф → Таблица категорий")); // CTX_LABELS[graph:nodes]
  assert.ok(subTexts.includes("частичная замена"));
  ok("активная подстановка показана: graph:nodes как частичная замена (q=2)");
  assert.ok(adviceGT.warnings.every((x) => !x.text.includes("«Граф категорий» раздел")));
  ok("при выбранном graph предупреждения о нём отсутствуют");

  // Рекомендации: включение glossary улучшит theses (optional-зависимость)
  const recTexts = adviceGT.recommendations.map((x) => x.text).join(" | ");
  assert.ok(recTexts.includes("«Глоссарий терминов»"));
  ok("рекомендация: включение «Глоссарий терминов» улучшит качество");

  // Конфликтные чипы ✗✗: transformative:integrative — жёсткий конфликт
  const adviceConflict = await computeSectionAdvice({
    sections: ["graph", "glossary", "dialogue"],
    synthLevel: "transformative",
    method: "integrative",
  });
  const hard = adviceConflict.warnings.filter((x) => x.severity === "hard-conflict");
  assert.ok(hard.length > 0);
  assert.ok(hard[0].text.includes("жёсткий конфликт (✗✗)"));
  assert.ok(hard[0].text.includes("Преобразующий × Интегративный"));
  ok(`transformative:integrative → ${hard.length} предупреждений ✗✗ (SL × ML в тексте)`);

  console.log(`\ntest-11-request6: OK (${n} ✓)`);
} finally {
  await closeDb();
  await closeRedis();
}
