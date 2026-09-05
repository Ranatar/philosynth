/**
 * Смоук чистых ядер беседы 5.4 (запрос 1; без БД, сети и браузера):
 *  - CharacteristicSlider: шаг/формат по CharacteristicSpec (REAL 0.05,
 *    целое 1), группа покрывает ВСЕ характеристики типа (8 / 6);
 *  - TaxonomySelector: написание документа из name_ru, предложение ключа
 *    латиницей (KEY_RE сервера 0.3b);
 *  - EnrichmentPanel: наборы типов ≡ канону 03 §2.14 (шаблоны 5.3);
 *  - диффы редакторов: categoryDiff со всеми характеристиками и
 *    typeCatalogId, edgeDiff (новый EdgeEditor);
 *  - ElementEditor: HOST_SECTION.edge = graph;
 *  - api/enrichment и api/taxonomy: пути запросов ≡ роутам сервера
 *    (fetch подменён — тело и URL перехватываются);
 *  - useStreamingGeneration гасит stream_error с ключом enrich: (текст).
 * Запуск: node_modules/.bin/tsx tests/smoke-54-request1.mjs
 */
import { readFileSync } from "node:fs";

import {
  CATEGORY_CHARACTERISTICS, EDGE_CHARACTERISTICS, CHARACTERISTICS_BY_TYPE,
} from "../packages/shared/constants/characteristics.ts";
import { characteristicStep, formatCharacteristic, REAL_STEP } from "../client/src/components/edit/CharacteristicSlider.tsx";
import { typeTextFromCatalog, suggestTypeKey } from "../client/src/components/edit/TaxonomySelector.tsx";
import { CATEGORY_ENRICHMENT_OPTIONS, EDGE_ENRICHMENT_OPTIONS, ENRICHMENT_TYPE_LABELS } from "../client/src/components/edit/EnrichmentPanel.tsx";
import { categoryDiff, categoryToDraft, CATEGORY_DRAFT_CHARACTERISTICS } from "../client/src/components/edit/CategoryEditor.tsx";
import { edgeDiff, edgeToDraft, EDGE_DIRECTIONS } from "../client/src/components/edit/EdgeEditor.tsx";
import { HOST_SECTION } from "../client/src/components/edit/ElementEditor.tsx";
import * as enrichmentApi from "../client/src/api/enrichment.ts";
import * as taxonomyApi from "../client/src/api/taxonomy.ts";
import { SEED_ENRICHMENT_TEMPLATES } from "../server/config/enrichment-templates.ts";
const TEMPLATE_KEYS = SEED_ENRICHMENT_TEMPLATES.map((t) => t.key);
const CATEGORY_TEMPLATE_KEYS = TEMPLATE_KEYS.filter((k) => k.startsWith("enrichment.category."));
const EDGE_TEMPLATE_KEYS = TEMPLATE_KEYS.filter((k) => k.startsWith("enrichment.edge."));

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, extra === undefined ? "" : JSON.stringify(extra)); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("── CharacteristicSlider: спецификации ──");
check("категорий 8, связей 6", CATEGORY_CHARACTERISTICS.length === 8 && EDGE_CHARACTERISTICS.length === 6);
const innov = CATEGORY_CHARACTERISTICS.find((s) => s.key === "innovation_degree");
check("innovation_degree — целое 1–5, шаг 1", innov.integer && innov.min === 1 && innov.max === 5 && characteristicStep(innov) === 1);
const cen = CATEGORY_CHARACTERISTICS.find((s) => s.key === "centrality");
check(`centrality — REAL 0–1, шаг ${REAL_STEP}`, !cen.integer && characteristicStep(cen) === REAL_STEP);
check("формат: REAL два знака, целое как есть", formatCharacteristic(cen, 0.9) === "0.90" && formatCharacteristic(innov, 4) === "4");
check("формат: не число → —", formatCharacteristic(cen, NaN) === "—");
check("CHARACTERISTICS_BY_TYPE ≡ спискам", CHARACTERISTICS_BY_TYPE.category === CATEGORY_CHARACTERISTICS && CHARACTERISTICS_BY_TYPE.edge === EDGE_CHARACTERISTICS);
check("черновик категории покрывает все dtoField", eq([...CATEGORY_DRAFT_CHARACTERISTICS].sort(), CATEGORY_CHARACTERISTICS.map((s) => s.dtoField).sort()));

console.log("── TaxonomySelector: ядра ──");
check("name_ru → написание документа", typeTextFromCatalog("Онтологическая") === "онтологическая");
check("пустое — пустое", typeTextFromCatalog("") === "");
const KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;
for (const s of ["Диалектическая", "Кросс-дисциплинарная", "Новый тип 2", "  ёж  "]) {
  const k = suggestTypeKey(s);
  check(`ключ из «${s}» → «${k}» проходит KEY_RE сервера`, KEY_RE.test(k), k);
}

console.log("── EnrichmentPanel: канон типов ──");
check("типы категории ≡ шаблонам 5.3", eq(CATEGORY_ENRICHMENT_OPTIONS.map((o) => `enrichment.category.${o.type}`).sort(), [...CATEGORY_TEMPLATE_KEYS].sort()));
check("типы связи ≡ шаблонам 5.3", eq(EDGE_ENRICHMENT_OPTIONS.map((o) => `enrichment.edge.${o.type}`).sort(), [...EDGE_TEMPLATE_KEYS].sort()));
check("подписи всех типов + characteristic", ["description", "evolution", "justification", "counterarguments", "characteristic"].every((t) => ENRICHMENT_TYPE_LABELS[t]));

console.log("── диффы редакторов ──");
const cat = { id: "c1", synthesisId: "s", name: "Бытие", type: "онтологическая", definition: "d", centrality: 0.9, certainty: 0.5, historicalSignificance: 0.5, innovationDegree: 1, clarity: 0, breadth: 0, depthScore: 0, applicability: 0, typeCatalogId: null, origin: "o", clusterIndices: [], structuralRoles: [], proceduralRoles: [], hasReflexive: false, position: 0, source: "generated", createdAt: "", updatedAt: "" };
const cd = categoryToDraft(cat);
check("категория: без правок — пустое тело", eq(categoryDiff(cd, cd), {}));
check("категория: depthScore/innovationDegree", eq(categoryDiff(cd, { ...cd, depthScore: 0.4, innovationDegree: 3 }), { innovationDegree: 3, depthScore: 0.4 }));
check("категория: выбор из каталога → type + typeCatalogId", eq(categoryDiff(cd, { ...cd, type: "метафизическая", typeCatalogId: "uuid-1" }), { type: "метафизическая", typeCatalogId: "uuid-1" }));
check("категория: отвязка от каталога → typeCatalogId: null", eq(categoryDiff({ ...cd, typeCatalogId: "uuid-1" }, { ...cd, typeCatalogId: null }), { typeCatalogId: null }));
const edge = { id: "e1", synthesisId: "s", sourceId: "c1", targetId: "c2", description: "d", edgeType: "диалектическая", direction: "однонаправленная", strength: 0.7, certainty: 0.5, historicalSupport: 0.5, logicalNecessity: 0.5, innovationDegree: 1, contextDependency: 0.5, typeCatalogId: null, position: 0, sourceOrigin: "generated", createdAt: "" };
const ed = edgeToDraft(edge);
check("связь: без правок — пустое тело", eq(edgeDiff(ed, ed), {}));
check("связь: направление + сила", eq(edgeDiff(ed, { ...ed, direction: "двунаправленная", strength: 0.9 }), { direction: "двунаправленная", strength: 0.9 }));
check("связь: тип с trim + typeCatalogId", eq(edgeDiff(ed, { ...ed, edgeType: " каузальная ", typeCatalogId: "u" }), { edgeType: "каузальная", typeCatalogId: "u" }));
check("направления — три значения схемы", eq([...EDGE_DIRECTIONS], ["однонаправленная", "двунаправленная", "рефлексивная"]));
check("HOST_SECTION.edge = graph", HOST_SECTION.edge === "graph" && HOST_SECTION.category === "graph");

console.log("── api/enrichment, api/taxonomy: пути ≡ роутам ──");
const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined });
  return new Response(JSON.stringify({ ok: true, enrichments: [], justifications: [], types: [], match: null, suggestions: [], type: { id: "t", key: "k", nameRu: "N" } }), { status: 200, headers: { "Content-Type": "application/json" } });
};
await enrichmentApi.enrichCategory("S1", "C1", "description");
await enrichmentApi.enrichEdge("S1", "E1", "counterarguments");
await enrichmentApi.justifyCharacteristic("S1", { elementId: "C1", elementType: "category", characteristic: "centrality", value: 0.9 });
await enrichmentApi.getEnrichments("S1", "C1", "category");
await enrichmentApi.getJustifications("S1", "C1");
check("POST /enrich/category/:catId { type }", calls[0].method === "POST" && calls[0].url === "/api/v1/syntheses/S1/enrich/category/C1" && eq(calls[0].body, { type: "description" }));
check("POST /enrich/edge/:edgeId { type }", calls[1].method === "POST" && calls[1].url === "/api/v1/syntheses/S1/enrich/edge/E1" && eq(calls[1].body, { type: "counterarguments" }));
check("POST /justify-characteristic", calls[2].method === "POST" && calls[2].url === "/api/v1/syntheses/S1/justify-characteristic" && calls[2].body.characteristic === "centrality" && calls[2].body.value === 0.9);
check("GET /enrichments/:elementId?elementType=", calls[3].method === "GET" && calls[3].url === "/api/v1/syntheses/S1/enrichments/C1?elementType=category");
check("GET /justifications/:elementId (без фильтра)", calls[4].url === "/api/v1/syntheses/S1/justifications/C1");
calls.length = 0;
await taxonomyApi.getCatalog("category");
await taxonomyApi.getCatalog("category"); // кэш
await taxonomyApi.normalizeType("диалектич", "relationship");
await taxonomyApi.createCustomType("relationship", { key: "k", nameRu: "N", defaultDirection: "bidirectional" });
await taxonomyApi.getCatalog("relationship");
check("GET /taxonomy/category-types один раз (кэш)", calls.filter((c) => c.url === "/api/v1/taxonomy/category-types").length === 1);
check("POST /taxonomy/normalize { text, kind }", eq(calls[1].body, { text: "диалектич", kind: "relationship" }) && calls[1].url === "/api/v1/taxonomy/normalize");
check("POST /taxonomy/relationship-types с defaultDirection", calls[2].url === "/api/v1/taxonomy/relationship-types" && calls[2].body.defaultDirection === "bidirectional" && calls[2].body.description === "");
check("после создания — кэш relationship сброшен (GET снова)", calls[3].url === "/api/v1/taxonomy/relationship-types");

console.log("── useStreamingGeneration: guard enrich: ──");
const usg = readFileSync("client/src/hooks/useStreamingGeneration.ts", "utf8");
check("stream_error с sectionKey enrich: игнорируется прогрессом", /startsWith\("enrich:"\)/.test(usg));
const ce = readFileSync("client/src/components/edit/CategoryEditor.tsx", "utf8");
check("CATEGORY_TYPES удалена из CategoryEditor (долг §12)", !/export const CATEGORY_TYPES/.test(ce) && ce.includes("TaxonomySelector"));

console.log(`\n${failed ? "FAIL" : "OK"}: ${n - failed}/${n}`);
process.exit(failed ? 1 : 0);
