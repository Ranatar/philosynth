#!/usr/bin/env node
/**
 * smoke-12-request1.mjs — смоук первого запроса беседы 1.2.
 * Байтовая сверка: buildSYS / buildSectionDefs сервиса (шаблоны из живого
 * Registry, PG+Redis) против ОРИГИНАЛЬНЫХ функций исходника, исполненных
 * в vm с реальными хелперами. Наборы параметров покрывают ветки:
 * multi/single/none, architectural/genetic, extGraphMetrics, ±dialogue,
 * уровни синтеза, lang. Запуск: npx tsx smoke-12-request1.mjs
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

import { buildSYS, buildQualityReinforcement, getStopSignal } from "../server/services/prompt-builder.ts";
import { buildSectionDefs, buildSubsectionMap, serializeParts } from "../server/services/section-defs-builder.ts";
// Беседа 10.1: служба НАМЕРЕННО отступила от исходника в одном месте — у критики
// появился подраздел «Таблица рекомендаций» (после «Рекомендации по улучшению»),
// а прозаическому шаблону рекомендаций дописано одно требование. Байтовая сверка
// с исходником сохраняется в полную силу: отступление СНИМАЕТСЯ перед сравнением
// (и отдельно проверяется, что оно ровно такое), всё остальное обязано совпасть.
import { RECOMMENDATIONS_PROSE_SUBSECTION as REC_PROSE, RECOMMENDATIONS_TABLE_SUBSECTION as REC_TABLE } from "../packages/shared/constants/recommendations.ts";
import { RECOMMENDATIONS_PROSE_ADDENDUM } from "../server/config/recommendation-templates.ts";
// Беседа 11.1: второе намеренное отступление — system.lang_instruction при
// lang ≠ Russian несёт правило машинных значений (надстройка lang-templates).
// Байтовая сверка buildSYS сохраняется: добавка СНИМАЕТСЯ перед сравнением и
// отдельно проверяется, что она стоит ровно один раз на своём месте.
import { stripLangInstructionAddendum } from "../server/config/lang-templates.ts";
function withoutDeparture101(def) {
  if (def.key !== "critique") return { def, departed: null };
  const subs = def.parts.subsections;
  const i = subs.findIndex((x) => x.name === REC_TABLE);
  const departed = i === subs.length - 1 && subs[i - 1]?.name === REC_PROSE && subs[i - 1].body.endsWith(RECOMMENDATIONS_PROSE_ADDENDUM);
  const parts = { ...def.parts, subsections: subs.filter((x) => x.name !== REC_TABLE).map((x) => x.name === REC_PROSE ? { ...x, body: x.body.slice(0, x.body.length - RECOMMENDATIONS_PROSE_ADDENDUM.length) } : x) };
  return { def: { ...def, parts, prompt: serializeParts(parts) }, departed };
}
import { closeDb } from "../server/db/index.js";
import { closeRedis } from "../server/redis.js";

const src = readFileSync("source/philosynth.html", "utf8").split("\n");
const slice = (a, b) => src.slice(a - 1, b).join("\n");

// Реальные хелперы исходника + промптовая система + buildSectionDefs.
const code = [
  slice(4415, 4530),   // ML, MD_BY_CARD, mdText, DL, SL, SD_BY_CARD, sdText
  slice(8590, 9304),   // buildSYS, quality, METHOD_*, TOPOLOGY_ROLES, LEVEL_*, _buildExtraTypesBlock, SEC_NAMES
  slice(9314, 9428),   // SUBSECTION_MAP_BASE/GLOSSARY/CRITIQUE_*
  slice(9429, 9448),   // SUBSECTION_SUM_PORTRAIT (c JSDoc)
  slice(9450, 9481),   // buildSubsectionMap
  slice(9746, 9752),   // _SUM_PORTRAIT_VARIANTS (не нужен defs, но пусть будет)
  slice(9844, 9868),   // hasConceptParticipants, philNames, conceptNames, allParticipantNames
  slice(10510, 10514), // STOP_SIGNAL
  slice(10515, 10517), // baseCtx (decl; baseCtxStatic/Parents не вызываются)
  slice(10519, 10641), // mw, participantsForPrompt, cardinality, словоформы, hasNoParticipants..., serializeParts
  slice(11532, 11592), // parseGlossarySubsections, patchPromptsWithSecCtx, groupPasses
  slice(10742, 11515), // buildSectionDefs
].join("\n");

const ctx = { console };
vm.runInNewContext(
  code + "\n; __EXPORT__ = { buildSYS, buildSectionDefs, buildQualityReinforcement, STOP_SIGNAL, buildSubsectionMap };",
  ctx,
  { filename: "source-slices" },
);
const orig = ctx.__EXPORT__;

const CASES = [
  { name: "multi/architectural/comparative", p: { seed: "Зерно А", phil: ["Кант", "Гегель"], sec: ["graph", "glossary", "theses", "name", "history", "origin", "practical", "dialogue", "evolution", "critique", "capsule"], method: "dialectical", synthLevel: "comparative", depth: "standard", generationOrder: "architectural", extGraphMetrics: false, ctx: "" } },
  { name: "single/genetic/transformative", p: { seed: "Зерно Б", phil: ["Хайдеггер"], sec: ["dialogue", "theses", "glossary", "graph", "critique"], method: "hermeneutical", synthLevel: "transformative", depth: "deep", generationOrder: "genetic", extGraphMetrics: false, ctx: "Доп. контекст" } },
  { name: "none/ext/generative", p: { seed: "Зерно В", phil: [], sec: ["graph", "glossary", "theses", "history", "origin", "practical", "evolution", "critique", "capsule"], method: "creative", synthLevel: "generative", depth: "exhaustive", generationOrder: "architectural", extGraphMetrics: true, ctx: "" } },
  { name: "meta/multi/integrative", p: { seed: "Зерно М", phil: ["Кант"], participants: [{ type: "philosopher", name: "Кант" }, { type: "concept", name: "Экспрессивная Гармониология" }], isMetaSynthesis: true, sec: ["graph", "glossary", "theses", "origin", "dialogue", "critique", "capsule"], method: "integrative", synthLevel: "transformative", depth: "standard", generationOrder: "architectural", extGraphMetrics: false, ctx: "" } },
  { name: "meta/single/deconstructive", p: { seed: "Зерно МС", phil: [], participants: [{ type: "concept", name: "Кривая Победа" }], isMetaSynthesis: true, sec: ["graph", "theses", "critique"], method: "deconstructive", synthLevel: "comparative", depth: "standard", generationOrder: "architectural", extGraphMetrics: false, ctx: "" } },
  { name: "multi/no-dialogue/analytical", p: { seed: "Зерно Г", phil: ["Витгенштейн", "Куайн", "Крипке"], sec: ["graph", "theses", "critique"], method: "analytical", synthLevel: "comparative", depth: "overview", generationOrder: "architectural", extGraphMetrics: false, ctx: "" } },
];

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${detail ? `\n    ${detail}` : ""}`); }
};

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

for (const { name, p } of CASES) {
  console.log(`\n═══ ${name} ═══`);

  // buildSYS: full/subsection/mode
  for (const outputMode of ["full", "subsection", "mode"]) {
    const got = await buildSYS(p, { outputMode });
    const exp = orig.buildSYS(p, { outputMode });
    const d = firstDiff(got, exp);
    ok(`buildSYS(${outputMode}) байт-в-байт`, got === exp,
      d >= 0 ? `diff@${d}: got«${got.slice(d - 40, d + 40)}» exp«${exp.slice(d - 40, d + 40)}»` : "");
  }

  // buildSectionDefs: ключи/номера/заголовки/промпты
  const gotDefs = await buildSectionDefs(p);
  const expDefs = orig.buildSectionDefs(p);
  ok(`число разделов ${expDefs.length}`, gotDefs.length === expDefs.length,
    `got ${gotDefs.length}`);
  for (let i = 0; i < Math.min(gotDefs.length, expDefs.length); i++) {
    const { def: g, departed } = withoutDeparture101(gotDefs[i]);
    const e = expDefs[i];
    if (departed !== null)
      ok("critique: отступление 10.1 ровно одно — таблица последним подразделом после прозы + требование в прозе", departed,
        gotDefs[i].parts.subsections.map((x) => x.name).join("|"));
    const meta = g.key === e.key && g.num === e.num && g.title === e.title;
    const d = firstDiff(g.prompt, e.prompt);
    ok(`${e.key}: key/num/title + prompt байт-в-байт`, meta && g.prompt === e.prompt,
      !meta ? `meta: got(${g.key},${g.num},«${g.title}») exp(${e.key},${e.num},«${e.title}»)`
        : d >= 0 ? `diff@${d}: got«${JSON.stringify(g.prompt.slice(Math.max(0, d - 60), d + 60))}» exp«${JSON.stringify(e.prompt.slice(Math.max(0, d - 60), d + 60))}»` : "");
    // parts.subsections: имена и типы совпадают
    const gs = g.parts.subsections.map((s) => s.type ?? s.name).join("|");
    const es = e.parts.subsections.map((s) => s.type ?? s.name).join("|");
    ok(`${e.key}: состав подразделов`, gs === es, `got ${gs}\n    exp ${es}`);
  }

  // buildSubsectionMap — сверка по ключам (jsonb не сохраняет порядок
  // ключей объекта — грабли 0.3; семантика от порядка не зависит)
  const gotMapRaw = await buildSubsectionMap(p);
  ok("buildSubsectionMap: отступление 10.1 — таблица сразу после прозы", gotMapRaw.critique[gotMapRaw.critique.indexOf(REC_PROSE) + 1] === REC_TABLE);
  const gotMap = { ...gotMapRaw, critique: gotMapRaw.critique.filter((x) => x !== REC_TABLE) };
  const expMap = orig.buildSubsectionMap(p);
  const mapKeysEq =
    JSON.stringify(Object.keys(gotMap).sort()) ===
    JSON.stringify(Object.keys(expMap).sort());
  const mapValsEq = Object.keys(expMap).every(
    (k) => JSON.stringify(gotMap[k]) === JSON.stringify(expMap[k]),
  );
  ok("buildSubsectionMap идентична (поключево)", mapKeysEq && mapValsEq,
    Object.keys(expMap)
      .filter((k) => JSON.stringify(gotMap[k]) !== JSON.stringify(expMap[k]))
      .map((k) => `${k}: got ${JSON.stringify(gotMap[k])} exp ${JSON.stringify(expMap[k])}`)
      .join("\n    "));
}

// lang ≠ Russian и quality/stop
{
  console.log("\n═══ lang=English + quality + stop_signal ═══");
  const p = { phil: ["Кант"], lang: "English" };
  const gotRaw = await buildSYS(p, {});
  const exp = orig.buildSYS(p, {});
  const { text: got, departed } = stripLangInstructionAddendum(gotRaw, p.lang);
  ok("buildSYS(lang=English): отступление 11.1 ровно одно и на месте", departed);
  ok("buildSYS(lang=English) байт-в-байт (без отступления 11.1)", got === exp);
  const q = await buildQualityReinforcement({ depth: "deep" });
  ok("buildQualityReinforcement(deep) байт-в-байт", q === orig.buildQualityReinforcement({ depth: "deep" }));
  ok("stop_signal байт-в-байт", (await getStopSignal()) === orig.STOP_SIGNAL);
}

console.log(`\nИтог: ${pass} ✓, ${fail} ✗`);
process.exitCode = fail ? 1 : 0;
await closeDb();
await closeRedis();
