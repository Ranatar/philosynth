#!/usr/bin/env node
/**
 * test-12-requests2-8.mjs — тестовые запросы 2–8 беседы 1.2 (docs/07) одним
 * заходом. Все тесты читающие, гоняются на живом Registry (PG+Redis,
 * сиды 0.3+1.2 применены). Запуск: npx tsx test-12-requests2-8.mjs
 *
 * Т1. baseCtx: НЕТ «ВЫБРАННЫЕ РАЗДЕЛЫ»; есть ЗЕРНО/ФИЛОСОФЫ(КОНЦЕПЦИИ)/
 *     МЕТОД/УРОВЕНЬ/ГЛУБИНА/КОНТЕКСТ(если есть); мета-синтез: «РЕЖИМ:
 *     МЕТА-СИНТЕЗ» + блок контекста концепций (через провайдер).
 * Т2. buildSYS(dialectical/comparative/standard, Кант+Гегель): имена
 *     философов присутствуют; длина «как в исходнике» (байтовое равенство
 *     уже доказано смоуком — здесь замер и сверка с оригиналом).
 * Т3. buildSectionDefs(sum,graph,glossary,theses) → 4 def; key/num/title/
 *     prompt; prompt непустой и содержит текст из Registry.
 * Т4. groupPasses: 6 разделов — sum и graph в РАЗНЫХ проходах, sum раньше.
 * Т5. patchPromptsWithSecCtx({graph: "Сделать акцент на этику"}).
 * Т6. baseCtx: все параметры в правильном формате.
 * Т7. Edge case: creative + generative, ВСЕ разделы — ни одного
 *     missing template (strict-рендер кинул бы TemplateNotFoundError).
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

import {
  baseCtx,
  buildSYS,
  setParentContextProvider,
} from "./server/services/prompt-builder.ts";
import {
  buildSectionDefs,
  groupPasses,
  patchPromptsWithSecCtx,
} from "./server/services/section-defs-builder.ts";
import { closeDb } from "./server/db/index.js";
import { closeRedis } from "./server/redis.js";

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${detail ? `\n    ${detail}` : ""}`); }
};

const ALL_SEC = ["graph", "glossary", "theses", "name", "history", "origin",
  "practical", "dialogue", "evolution", "critique", "capsule"];

/* ── Т1 + Т6: baseCtx ──────────────────────────────────────────────── */
console.log("\n═══ Т1+Т6: baseCtx — состав и формат ═══");
{
  const p = {
    seed: "Единство события и структуры",
    phil: ["Кант", "Гегель"],
    sec: ["graph", "theses"],
    method: "dialectical", synthLevel: "comparative", depth: "standard",
    generationOrder: "architectural", ctx: "Учитывать феноменологию",
  };
  const ctx1 = await baseCtx(p, "graph");
  ok("НЕ содержит «ВЫБРАННЫЕ РАЗДЕЛЫ» (убрана в v10)", !ctx1.includes("ВЫБРАННЫЕ РАЗДЕЛЫ"));
  ok("содержит ЗЕРНО КОНЦЕПЦИИ с текстом зерна",
    ctx1.includes("ЗЕРНО КОНЦЕПЦИИ: «Единство события и структуры»"));
  ok("содержит ФИЛОСОФЫ: Кант, Гегель", ctx1.includes("ФИЛОСОФЫ: Кант, Гегель"));
  ok("содержит МЕТОД: <метка> — <описание>", /МЕТОД: .+ — .+/.test(ctx1));
  ok("содержит УРОВЕНЬ СИНТЕЗА: <метка> — <описание>", /УРОВЕНЬ СИНТЕЗА: .+ — .+/.test(ctx1));
  ok("содержит ГЛУБИНА: <метка>", /ГЛУБИНА: .+/.test(ctx1));
  ok("содержит КОНТЕКСТ (ctx задан)", ctx1.includes("КОНТЕКСТ: Учитывать феноменологию"));
  // формат: порядок строк как в исходнике
  const iSeed = ctx1.indexOf("ЗЕРНО"), iPhil = ctx1.indexOf("ФИЛОСОФЫ"),
    iM = ctx1.indexOf("МЕТОД:"), iL = ctx1.indexOf("УРОВЕНЬ"),
    iD = ctx1.indexOf("ГЛУБИНА"), iC = ctx1.indexOf("КОНТЕКСТ");
  ok("порядок: ЗЕРНО → ФИЛОСОФЫ → МЕТОД → УРОВЕНЬ → ГЛУБИНА → КОНТЕКСТ",
    iSeed >= 0 && iSeed < iPhil && iPhil < iM && iM < iL && iL < iD && iD < iC);

  const noCtx = await baseCtx({ ...p, ctx: "" }, "graph");
  ok("без ctx строка КОНТЕКСТ отсутствует", !noCtx.includes("КОНТЕКСТ:"));

  // Мета-синтез: РЕЖИМ + блок концепций через провайдер (реализация — 1.3/3.1)
  const pMeta = {
    seed: "Мета-зерно", phil: ["Кант"],
    participants: [
      { type: "philosopher", name: "Кант" },
      { type: "concept", name: "Экспрессивная Гармониология" },
    ],
    isMetaSynthesis: true,
    sec: ["graph"], method: "integrative", synthLevel: "transformative",
    depth: "standard", generationOrder: "architectural", ctx: "",
  };
  const metaNoProvider = await baseCtx(pMeta, "graph");
  ok("мета: содержит «РЕЖИМ: МЕТА-СИНТЕЗ»", metaNoProvider.includes("РЕЖИМ: МЕТА-СИНТЕЗ"));
  ok("мета: содержит КОНЦЕПЦИИ-УЧАСТНИКИ: «Экспрессивная Гармониология»",
    metaNoProvider.includes("КОНЦЕПЦИИ-УЧАСТНИКИ: «Экспрессивная Гармониология»"));
  ok("мета без провайдера: блок родителей опущен (плечо 1.3/3.1)",
    !metaNoProvider.includes("КОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ"));

  const STUB = "\n\nКОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ (заглушка 1.3): капсула, категории…";
  setParentContextProvider((_p, sectionKey) => STUB + ` [section=${sectionKey}]`);
  const metaWithProvider = await baseCtx(pMeta, "graph");
  setParentContextProvider(null);
  ok("мета с провайдером: блок концепций добавлен после статики",
    metaWithProvider === metaNoProvider + STUB + " [section=graph]");
  const nonMeta = await baseCtx(p, "graph");
  ok("не-мета: провайдер не влияет (hasConceptParticipants=false)", nonMeta === ctx1);
}

/* ── Т2: buildSYS ──────────────────────────────────────────────────── */
console.log("\n═══ Т2: buildSYS — имена и длина ═══");
{
  const p = { method: "dialectical", synthLevel: "comparative", depth: "standard", phil: ["Кант", "Гегель"] };
  const sys = await buildSYS(p, {});
  ok("содержит «Кант» и «Гегель»", sys.includes("Кант") && sys.includes("Гегель"));

  // «Как в исходнике»: сверка с оригинальным buildSYS (vm) + замер длины
  const src = readFileSync("source/philosynth.html", "utf8").split("\n");
  const slice = (a, b) => src.slice(a - 1, b).join("\n");
  const vctx = {};
  vm.runInNewContext(slice(8590, 8647) + "\n; __SYS__ = buildSYS;", vctx);
  const expected = vctx.__SYS__(p, {});
  ok(`байт-в-байт с исходником (длина ${sys.length})`, sys === expected,
    `got ${sys.length}, exp ${expected.length}`);
  // Ориентир протокола ~5000–8000: фиксируем фактическую длину исходника
  console.log(`  ℹ длина buildSYS исходника: ${expected.length} символов ` +
    `(ориентир протокола 5000–8000 — ${expected.length >= 5000 && expected.length <= 8000 ? "в диапазоне" : "ВНЕ диапазона; эталон — исходник"})`);
}

/* ── Т3: buildSectionDefs (4 раздела) ──────────────────────────────── */
console.log("\n═══ Т3: buildSectionDefs — sum,graph,glossary,theses ═══");
{
  const p = {
    seed: "Зерно Т3", phil: ["Кант", "Гегель"],
    sec: ["graph", "glossary", "theses"], // sum добавляется всегда первым
    method: "dialectical", synthLevel: "comparative", depth: "standard",
    generationOrder: "architectural", extGraphMetrics: false, ctx: "",
  };
  const defs = await buildSectionDefs(p);
  ok("возвращает 4 def-объекта", defs.length === 4, `got ${defs.length}`);
  ok("ключи: sum,graph,glossary,theses по порядку",
    defs.map((d) => d.key).join(",") === "sum,graph,glossary,theses");
  for (const d of defs) {
    const shape = typeof d.key === "string" && typeof d.num === "number" &&
      typeof d.title === "string" && typeof d.prompt === "string";
    ok(`${d.key}: key/num/title/prompt присутствуют (num=${d.num})`, shape);
    ok(`${d.key}: prompt непустой (${d.prompt.length} симв.)`, d.prompt.length > 200);
  }
  ok("нумерация сквозная 1..4", defs.map((d) => d.num).join(",") === "1,2,3,4");
  // Текст реально из Registry: маркеры посеянных шаблонов
  const g = (k) => defs.find((d) => d.key === k).prompt;
  ok("sum: преамбула из section.sum.preamble",
    g("sum").includes("ИСПОЛНИТЕЛЬНОЕ РЕЗЮМЕ СИНТЕЗА"));
  ok("graph: level-фрагмент graph_last_col_name подставлен (нет {{…}})",
    !g("graph").includes("{{") && g("graph").includes("Таблица категорий"));
  ok("glossary: method-фрагмент глоссария вшит", g("glossary").includes("Таблица определений"));
  ok("theses: shared-блок со scope вшит", g("theses").includes("Онтологические тезисы"));
}

/* ── Т4: groupPasses ───────────────────────────────────────────────── */
console.log("\n═══ Т4: groupPasses — 6 разделов ═══");
{
  const p = {
    seed: "Зерно Т4", phil: ["Кант", "Гегель"],
    sec: ["graph", "glossary", "theses", "dialogue", "critique"],
    method: "dialectical", synthLevel: "comparative", depth: "standard",
    generationOrder: "architectural", extGraphMetrics: false, ctx: "",
  };
  const defs = await buildSectionDefs(p);
  ok("6 разделов на входе", defs.length === 6, `got ${defs.length}`);
  const passes = groupPasses(defs);
  // ОТСТУПЛЕНИЕ от формулировки протокола: в исходнике groupPasses НЕ
  // принимает effectiveDeps — всегда по одному разделу на проход
  // (последовательная генерация); порт 1:1. Требование теста выполняется
  // автоматически: sum и graph в разных проходах, sum раньше.
  ok("проходов столько же, сколько разделов (по одному на проход)",
    passes.length === 6 && passes.every((x) => x.length === 1));
  const passOf = (k) => passes.findIndex((x) => x[0].key === k);
  ok("sum и graph в РАЗНЫХ проходах", passOf("sum") !== passOf("graph"));
  ok("sum раньше graph", passOf("sum") < passOf("graph"),
    `sum@${passOf("sum")}, graph@${passOf("graph")}`);
  ok("порядок проходов повторяет порядок defs",
    passes.map((x) => x[0].key).join(",") === defs.map((d) => d.key).join(","));
}

/* ── Т5: patchPromptsWithSecCtx ────────────────────────────────────── */
console.log("\n═══ Т5: patchPromptsWithSecCtx ═══");
{
  const p = {
    seed: "Зерно Т5", phil: ["Кант"],
    sec: ["graph", "theses"],
    method: "dialectical", synthLevel: "comparative", depth: "standard",
    generationOrder: "architectural", extGraphMetrics: false, ctx: "",
  };
  const defs = await buildSectionDefs(p);
  const before = Object.fromEntries(defs.map((d) => [d.key, d.prompt]));
  patchPromptsWithSecCtx(defs, { graph: "Сделать акцент на этику" });
  const graph = defs.find((d) => d.key === "graph");
  ok("промпт graph содержит текст secCtx", graph.prompt.includes("Сделать акцент на этику"));
  ok("вставка с меткой «ДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ К ЭТОМУ РАЗДЕЛУ (от пользователя):»",
    graph.prompt.includes("ДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ К ЭТОМУ РАЗДЕЛУ (от пользователя):\nСделать акцент на этику"));
  const marker = before.graph.lastIndexOf("\n\nМ");
  ok("вставка ПЕРЕД постамбулой «Минимум … слов» (позиция lastIndexOf «\\n\\nМ»)",
    marker !== -1 && graph.prompt.indexOf("ДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ") < graph.prompt.lastIndexOf("\n\nМ") &&
    graph.prompt.endsWith(before.graph.slice(marker)));
  ok("остальные промпты не тронуты",
    defs.filter((d) => d.key !== "graph").every((d) => d.prompt === before[d.key]));
  patchPromptsWithSecCtx(defs, null);
  ok("secCtx=null — no-op", defs.find((d) => d.key === "graph").prompt === graph.prompt);
}

/* ── Т7: edge case creative + generative ───────────────────────────── */
console.log("\n═══ Т7: creative + generative — все шаблоны найдены ═══");
{
  // strict-рендер Registry кидает TemplateNotFoundError при отсутствии
  // шаблона — прогон всех разделов на всех ветках creative+generative.
  const variants = [
    { name: "полный набор, architectural", generationOrder: "architectural", extGraphMetrics: false, phil: ["Делёз", "Уайтхед"] },
    { name: "полный набор, genetic + ext", generationOrder: "genetic", extGraphMetrics: true, phil: ["Делёз", "Уайтхед"] },
    { name: "свободный синтез (0 участников)", generationOrder: "architectural", extGraphMetrics: false, phil: [] },
    { name: "один участник", generationOrder: "architectural", extGraphMetrics: false, phil: ["Делёз"] },
  ];
  for (const v of variants) {
    try {
      const defs = await buildSectionDefs({
        seed: "Зерно Т7", phil: v.phil, sec: ALL_SEC,
        method: "creative", synthLevel: "generative", depth: "exhaustive",
        generationOrder: v.generationOrder, extGraphMetrics: v.extGraphMetrics, ctx: "",
      });
      const unresolved = defs.flatMap((d) =>
        d.prompt.includes("{{") ? [d.key] : []);
      ok(`${v.name}: ${defs.length} разделов, все шаблоны найдены, плейсхолдеров не осталось`,
        defs.length === 12 && unresolved.length === 0,
        unresolved.length ? `незакрытые {{…}} в: ${unresolved.join(", ")}` : `defs=${defs.length}`);
    } catch (e) {
      ok(`${v.name}: без ошибок`, false, `${e.name}: ${e.message}`);
    }
  }
  const sys = await buildSYS({ phil: ["Делёз", "Уайтхед"] }, { outputMode: "full" });
  ok("buildSYS для creative-набора рендерится", sys.length > 1000);
}

console.log(`\nИтог: ${pass} ✓, ${fail} ✗`);
process.exitCode = fail ? 1 : 0;
await closeDb();
await closeRedis();
