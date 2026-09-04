/**
 * Смоук запроса 1 беседы 5.3 (без БД, Redis, сети и браузера):
 *  - шаблоны enrichment.* ↔ переменные, которые реально собирает сервис
 *    (buildCategoryVars / buildEdgeVars / buildCharacteristicVars на
 *    синтетических строках): множества плейсхолдеров совпадают в обе
 *    стороны, strict-рендер prompt-registry не упадёт;
 *  - канон ключей 03 §2.14 (шесть), их уникальность среди сидов 0.3/1.2,
 *    подключение в seed-prompts;
 *  - shared/constants/characteristics: составы, диапазоны, алиасы,
 *    validateCharacteristicValue;
 *  - validateJustifyInput / parseJustificationHtml / enrichmentStreamKey;
 *  - роутеры: набор путей и методов §2.13/§2.14, монтирование в index.ts,
 *    start_enrichment в CLIENT_MESSAGE_TYPES ws/handler;
 *  - контракт enrichment_done (enrichmentId/content) в shared ws-messages.
 * Запуск: node_modules/.bin/tsx tests/smoke-53-request1.mjs
 */
import { readFileSync } from "node:fs";

import { SEED_ENRICHMENT_TEMPLATES, JUSTIFICATION_SECTIONS } from "../server/config/enrichment-templates.ts";
import { SEED_PROMPT_TEMPLATES } from "../server/config/prompt-templates.ts";
import { SEED_SECTION_TEMPLATES } from "../server/config/section-templates.ts";
import {
  CATEGORY_CHARACTERISTICS,
  EDGE_CHARACTERISTICS,
  resolveCharacteristic,
  validateCharacteristicValue,
} from "../packages/shared/constants/characteristics.ts";
import {
  CATEGORY_ENRICHMENT_TYPES,
  CHARACTERISTIC_PROMPT_KEY,
  EDGE_ENRICHMENT_TYPES,
  EnrichmentError,
  buildCategoryVars,
  buildCharacteristicVars,
  buildEdgeVars,
  buildSynthesisContextText,
  enrichmentPromptKey,
  enrichmentStreamKey,
  parseJustificationHtml,
  validateJustifyInput,
} from "../server/services/element-enrichment.ts";
import { enrichmentRoutes } from "../server/routes/enrichment.ts";
import { taxonomyRoutes } from "../server/routes/taxonomy.ts";

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, extra === undefined ? "" : JSON.stringify(extra)); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const setEq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const PLACEHOLDER_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;
const placeholders = (body) => new Set([...body.matchAll(PLACEHOLDER_RE)].map((m) => m[1]));
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

/* ── Синтетические строки БД (форма $inferSelect) ───────────────────── */
const now = new Date();
const cat = {
  id: "11111111-1111-4111-8111-111111111111", synthesisId: "s", name: "Бытие",
  type: "онтологическая", definition: "Всё, что есть", centrality: 0.9, certainty: 0.75,
  historicalSignificance: 0.8, innovationDegree: 3, clarity: 0.6, breadth: 0.7, depthScore: 0.55,
  applicability: 0.4, typeCatalogId: null, origin: "Парменид", clusterIndices: [0, 2],
  structuralRoles: ["central", "bridge"], proceduralRoles: ["synthesis"], hasReflexive: true,
  position: 0, source: "generated", createdAt: now, updatedAt: now,
};
const edge = {
  id: "22222222-2222-4222-8222-222222222222", synthesisId: "s", sourceId: cat.id,
  targetId: "33333333-3333-4333-8333-333333333333", description: "порождает", edgeType: "диалектическая",
  direction: "однонаправленная", strength: 0.8, certainty: 0.5, historicalSupport: 0.6,
  logicalNecessity: 0.7, innovationDegree: 2, contextDependency: 0.3, typeCatalogId: null,
  position: 0, sourceOrigin: "generated", createdAt: now,
};
const target = { name: "Ничто", definition: "Отсутствие бытия" };
const row = { title: "Синтез", seed: "зерно", method: "dialectical", synthLevel: "generative", context: "" };

/* ── 1. Канон ключей и уникальность среди сидов ─────────────────────── */
console.log("── Канон ключей 03 §2.14 ──");
const keys = SEED_ENRICHMENT_TEMPLATES.map((t) => t.key);
const CANON = [
  "enrichment.category.description", "enrichment.category.evolution", "enrichment.category.justification",
  "enrichment.edge.justification", "enrichment.edge.counterarguments", "enrichment.characteristic_justification",
];
check("шесть ключей канона (03 пишет «пять», перечисляет шесть)", eq([...keys].sort(), [...CANON].sort()), keys);
check("enrichmentPromptKey строит ключи канона", CATEGORY_ENRICHMENT_TYPES.every((t) => CANON.includes(enrichmentPromptKey("category", t)))
  && EDGE_ENRICHMENT_TYPES.every((t) => CANON.includes(enrichmentPromptKey("edge", t))));
check("CHARACTERISTIC_PROMPT_KEY в каноне", CANON.includes(CHARACTERISTIC_PROMPT_KEY));
const others = new Set([...SEED_PROMPT_TEMPLATES, ...SEED_SECTION_TEMPLATES].map((t) => t.key));
check("ключи не пересекаются с сидами 0.3/1.2", keys.every((k) => !others.has(k)));
check("описания непустые", SEED_ENRICHMENT_TEMPLATES.every((t) => t.description.trim().length > 0));
check("seed-prompts.ts сеет SEED_ENRICHMENT_TEMPLATES", read("scripts/seed-prompts.ts").includes("...SEED_ENRICHMENT_TEMPLATES"));

/* ── 2. Плейсхолдеры ↔ переменные сервиса ───────────────────────────── */
console.log("── Шаблоны ↔ переменные сервиса ──");
const ctx = buildSynthesisContextText(row, ["Парменид", "концепция «Другая»"]);
check("контекст: метка метода/уровня и участники", ctx.includes("Диалектический") && ctx.includes("Порождающий") && ctx.includes("Парменид, концепция «Другая»"));
check("контекст: свободный синтез без участников", buildSynthesisContextText(row, []).includes("свободный синтез"));
check("контекст: пустой seed → «—»", buildSynthesisContextText({ ...row, seed: "  " }, []).includes("Зерно: —"));

const catVars = buildCategoryVars(cat, "- «Бытие» → «Ничто» (диалектическая): порождает", ctx);
const edgeVars = buildEdgeVars(edge, cat, target, ctx);
const spec = resolveCharacteristic("category", "centrality");
const chVars = buildCharacteristicVars("category", spec, 0.9, 0.85, "Бытие", "онтологическая. Всё, что есть", ctx);
const varsFor = (key) => key.startsWith("enrichment.category.") ? catVars : key.startsWith("enrichment.edge.") ? edgeVars : chVars;
for (const t of SEED_ENRICHMENT_TEMPLATES) {
  const ph = placeholders(t.body);
  const vs = new Set(Object.keys(varsFor(t.key)));
  check(`${t.key}: плейсхолдеры = переменные (${ph.size})`, setEq(ph, vs), { ph: [...ph], vars: [...vs] });
  check(`${t.key}: все значения — непустые строки`, Object.values(varsFor(t.key)).every((v) => typeof v === "string" && v.length > 0));
}
check("метрики категории: 8 значений, целое /5", catVars.category_metrics.split(", ").length === 8 && catVars.category_metrics.includes("инновационность 3/5"));
check("роли категории: русские метки ROLE_MAP + кластеры + рефлексивная", catVars.category_roles.includes("центральная") && catVars.category_roles.includes("мост") && catVars.category_roles.includes("кластеры: 1, 3") && catVars.category_roles.includes("рефлексивная"));
check("метрики связи: 6 значений", edgeVars.edge_metrics.split(", ").length === 6);
check("связь без концов → «?» / «—»", eq([buildEdgeVars(edge, null, null, ctx).source_name, buildEdgeVars(edge, null, null, ctx).target_definition], ["?", "—"]));
check("характеристика: range/value/current для REAL", chVars.range === "от 0 до 1" && chVars.value === "0.9" && chVars.current_value === "0.85");
const intSpec = resolveCharacteristic("edge", "innovation_degree");
const chInt = buildCharacteristicVars("edge", intSpec, 4, Number.NaN, "A → B", "…", ctx);
check("характеристика: целочисленный range, NaN → «—», kind «связь»", chInt.range === "целое от 1 до 5" && chInt.current_value === "—" && chInt.element_kind === "связь");
const chT = SEED_ENRICHMENT_TEMPLATES.find((t) => t.key === CHARACTERISTIC_PROMPT_KEY);
check("шаблон обоснования требует три data-section из JUSTIFICATION_SECTIONS", Object.values(JUSTIFICATION_SECTIONS).every((name) => chT.body.includes(`data-section="${name}"`)));
check("шаблоны обогащения задают формат <div class=\"enrichment-result\">", SEED_ENRICHMENT_TEMPLATES.filter((t) => t.key !== CHARACTERISTIC_PROMPT_KEY).every((t) => t.body.includes('<div class="enrichment-result">')));

/* ── 3. shared/constants/characteristics ────────────────────────────── */
console.log("── Характеристики и диапазоны (п.18) ──");
check("категория: 8 характеристик", CATEGORY_CHARACTERISTICS.length === 8);
check("связь: 6 характеристик", EDGE_CHARACTERISTICS.length === 6);
check("innovation_degree — целое [1,5] у обоих типов", [CATEGORY_CHARACTERISTICS, EDGE_CHARACTERISTICS].every((l) => { const s = l.find((x) => x.key === "innovation_degree"); return s && s.integer && s.min === 1 && s.max === 5; }));
check("остальные — REAL [0,1]", [...CATEGORY_CHARACTERISTICS, ...EDGE_CHARACTERISTICS].filter((s) => s.key !== "innovation_degree").every((s) => !s.integer && s.min === 0 && s.max === 1));
check("алиасы depth/depthScore → depth_score", resolveCharacteristic("category", "depth")?.key === "depth_score" && resolveCharacteristic("category", "depthScore")?.key === "depth_score");
check("camelCase DTO → snake_case", resolveCharacteristic("edge", "logicalNecessity")?.key === "logical_necessity");
check("характеристика не того типа → null", resolveCharacteristic("edge", "centrality") === null && resolveCharacteristic("category", "strength") === null);
const vResults = [
  validateCharacteristicValue(spec, "0.5"), validateCharacteristicValue(spec, Number.NaN), validateCharacteristicValue(spec, 1.01),
  validateCharacteristicValue(intSpec, 2.5), validateCharacteristicValue(spec, 1), validateCharacteristicValue(intSpec, 5),
].map((x) => x === null);
check("validate: строка/NaN/за границей/нецелое → ошибка; границы 1 и 5 → ок", eq(vResults, [false, false, false, false, true, true]), vResults);

/* ── 4. validateJustifyInput / parseJustificationHtml / streamKey ───── */
console.log("── Чистые функции сервиса ──");
const details = (body) => { try { validateJustifyInput(body); return null; } catch (e) { return e instanceof EnrichmentError ? e.details : { thrown: String(e) }; } };
check("валидный вход → канонический ключ", eq(validateJustifyInput({ elementId: "x", elementType: "category", characteristic: "depth", value: 0.5 }), { elementId: "x", elementType: "category", characteristic: "depth_score", value: 0.5 }));
check("нецелое innovation_degree → details.value", "value" in details({ elementId: "x", elementType: "edge", characteristic: "innovation_degree", value: 3.5 }));
check("вне [0,1] → details.value", "value" in details({ elementId: "x", elementType: "category", characteristic: "centrality", value: 1.2 }));
check("чужая характеристика → details.characteristic", "characteristic" in details({ elementId: "x", elementType: "edge", characteristic: "centrality", value: 0.5 }));
check("плохой elementType → details.elementType", "elementType" in details({ elementId: "x", elementType: "thesis", characteristic: "centrality", value: 0.5 }));
check("пустое тело → все три поля в details", eq(Object.keys(details(undefined)).sort(), ["characteristic", "elementId", "elementType", "value"].sort()));
const html = `<div data-section="Основания"><h4>Основания</h4><p>Потому что <strong>А</strong>.</p></div><div data-section="Ограничения"><h4>Ограничения</h4><ul><li>Не учтено Б</li></ul></div><div data-section="Альтернативные подходы"><h4>Альтернативные подходы</h4><p>Иначе — 0.7.</p></div>`;
check("три секции → три колонки, без h4", eq(parseJustificationHtml(html), { justification: "Потому что А.", limitations: "Не учтено Б", alternatives: "Иначе — 0.7." }));
check("одна секция → остальные null", eq(parseJustificationHtml(`<div data-section="Основания"><h4>Основания</h4><p>X</p></div>`), { justification: "X", limitations: null, alternatives: null }));
check("без секций → весь текст в justification (fail-soft)", eq(parseJustificationHtml("<p>плоский ответ</p>"), { justification: "плоский ответ", limitations: null, alternatives: null }));
check("streamKey enrich:{type}:{id}", enrichmentStreamKey("category", "abc") === "enrich:category:abc");

/* ── 5. Роутеры, монтирование, WS ───────────────────────────────────── */
console.log("── Роуты, index.ts, ws/handler ──");
const routeSet = (app) => new Set(app.routes.filter((r) => r.method !== "ALL").map((r) => `${r.method} ${r.path}`));
const enr = routeSet(enrichmentRoutes);
check("§2.14: пять роутов", eq([...enr].sort(), [
  "GET /:id/enrichments/:elementId", "GET /:id/justifications/:elementId",
  "POST /:id/enrich/category/:catId", "POST /:id/enrich/edge/:edgeId", "POST /:id/justify-characteristic",
].sort()), [...enr]);
const tax = routeSet(taxonomyRoutes);
check("§2.13: пять роутов", eq([...tax].sort(), [
  "GET /category-types", "GET /relationship-types", "POST /category-types", "POST /normalize", "POST /relationship-types",
].sort()), [...tax]);
check("все роуты обоих роутеров под requireAuth", [enrichmentRoutes, taxonomyRoutes].every((app) => app.routes.filter((r) => r.method !== "ALL").every((r) => r.handler.name === "requireAuth" || app.routes.some((m) => m.path === r.path && m.handler.name === "requireAuth"))));
const idx = read("server/index.ts");
check("index.ts монтирует enrichmentRoutes на /api/v1/syntheses", /app\.route\("\/api\/v1\/syntheses", enrichmentRoutes\)/.test(idx));
check("index.ts монтирует taxonomyRoutes на /api/v1/taxonomy", /app\.route\("\/api\/v1\/taxonomy", taxonomyRoutes\)/.test(idx));
const ws = read("server/ws/handler.ts");
check("ws/handler: start_enrichment в CLIENT_MESSAGE_TYPES и case", /"start_enrichment",/.test(ws) && /case "start_enrichment":/.test(ws));
check("ws/handler: явная проверка владельца в start_enrichment", /row\.userId !== user\.id/.test(ws.slice(ws.indexOf('case "start_enrichment"'))));
const wsTypes = read("packages/shared/types/ws-messages.ts");
check("shared: WsStartEnrichment в union клиента", /export interface WsStartEnrichment/.test(wsTypes) && /\|\s*WsStartEnrichment/.test(wsTypes));
const doneBlock = wsTypes.slice(wsTypes.indexOf("export interface WsEnrichmentDone"), wsTypes.indexOf("}", wsTypes.indexOf("export interface WsEnrichmentDone")));
check("shared: enrichment_done несёт enrichmentId и content", /enrichmentId: string/.test(doneBlock) && /content: string/.test(doneBlock));
const svc = read("server/services/element-enrichment.ts");
check("сервис не зовёт bumpTotals (01 §4.9: обогащения вне total_cost_usd)", !/bumpTotals\(/.test(svc));
check("сервис: разъём setUsageRecorder объявлен и вызывается после сохранения", /export function setUsageRecorder/.test(svc) && (svc.match(/await recordUsage\(/g) || []).length === 3);
check("сервис: три стрима под withGenerationSlot (startEnrichment + startJustification)", (svc.match(/withGenerationSlot\(/g) || []).length === 2);

console.log(`\n${failed ? "✗" : "✓"} ${n - failed}/${n}`);
process.exit(failed ? 1 : 0);
