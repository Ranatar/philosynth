/**
 * Смоук чистых ядер беседы 5.5 (запрос 1; без БД, сети и браузера):
 *  - шаблоны transform.* : ключи, плейсхолдеры ≡ переменным сервиса,
 *    уникальность среди всех сидов;
 *  - representation-transformer: константы направлений/ключей стрима/
 *    разделов, блоки источника (buildGraphBlock / buildThesesBlock),
 *    контекст, DTO трансформации;
 *  - routes/transforms: пять роутов §2.15 смонтированы;
 *  - graph-parser: экспорт normalizeGraphTypesToCatalog и опция
 *    saveGraphToDb (долг §12 нормализации типов);
 *  - ws: start_transform в типах и в CLIENT_MESSAGE_TYPES хендлера;
 *  - клиент: api/transforms пути ≡ роутам (fetch подменён), тексты
 *    TransformPanel (превью потерь / пустой источник), summaryText и
 *    подписи TransformHistory, guard transform: в useStreamingGeneration,
 *    кнопки интеграции в GraphModal / SynthesisPage / EditModal,
 *    блок 9 кита в globals.css.
 * Запуск: node_modules/.bin/tsx tests/smoke-55-request1.mjs
 */
import { readFileSync } from "node:fs";

import { SEED_TRANSFORM_TEMPLATES, transformPromptKey } from "../server/config/transform-templates.ts";
import { SEED_PROMPT_TEMPLATES } from "../server/config/prompt-templates.ts";
import { SEED_SECTION_TEMPLATES } from "../server/config/section-templates.ts";
import { SEED_ENRICHMENT_TEMPLATES } from "../server/config/enrichment-templates.ts";
import {
  TRANSFORM_DIRECTIONS, TRANSFORM_SOURCE_SECTION, TRANSFORM_TARGET_SECTION,
  buildGraphBlock, buildThesesBlock, buildTransformContextText, emptySourceMessage,
  isTransformDirection, toTransformDto, transformStreamKey, targetSectionLabel,
} from "../server/services/representation-transformer.ts";
import * as graphParser from "../server/services/graph-parser.ts";
import { parseGlossaryFromHTML, GLOSSARY_TABLE_SECTION } from "../server/services/element-parser.ts";
import { transformRoutes } from "../server/routes/transforms.ts";
import * as transformsApi from "../client/src/api/transforms.ts";
import { lossPreviewText, sourceEmptyText, TARGET_SECTION_TITLES } from "../client/src/components/edit/TransformPanel.tsx";
import { DIRECTION_LABELS, ROLLBACK_TARGET_LABELS, summaryText } from "../client/src/components/edit/TransformHistory.tsx";
import { TRANSFORM_STREAM_PREFIX } from "../client/src/hooks/useTransformStream.ts";

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, extra === undefined ? "" : JSON.stringify(extra)); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const placeholders = (body) => [...new Set([...body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].sort();

console.log("── шаблоны transform.* ──");
check("два шаблона", SEED_TRANSFORM_TEMPLATES.length === 2);
const keys = SEED_TRANSFORM_TEMPLATES.map((t) => t.key).sort();
check("ключи ≡ transformPromptKey(direction)", eq(keys, TRANSFORM_DIRECTIONS.map(transformPromptKey).sort()));
const g2t = SEED_TRANSFORM_TEMPLATES.find((t) => t.key === "transform.graph_to_theses");
const t2g = SEED_TRANSFORM_TEMPLATES.find((t) => t.key === "transform.theses_to_graph");
check("graph_to_theses: плейсхолдеры ≡ переменным сервиса", eq(placeholders(g2t.body), ["graph_block", "section_task", "synthesis_context"]), placeholders(g2t.body));
check("theses_to_graph: плейсхолдеры ≡ переменным сервиса", eq(placeholders(t2g.body), ["section_task", "synthesis_context", "theses_block"]), placeholders(t2g.body));
const allKeys = [...SEED_PROMPT_TEMPLATES, ...SEED_SECTION_TEMPLATES, ...SEED_ENRICHMENT_TEMPLATES, ...SEED_TRANSFORM_TEMPLATES].map((t) => t.key);
check("ключи уникальны среди всех сидов", new Set(allKeys).size === allKeys.length);
check("шаблоны — режим трансформации, без описания столбцов таблиц", !/Столбцы СТРОГО/.test(g2t.body) && !/Столбцы СТРОГО/.test(t2g.body) && /ЕДИНСТВЕННЫЙ источник/.test(g2t.body));

console.log("── representation-transformer: константы и ядра ──");
check("направления", eq([...TRANSFORM_DIRECTIONS], ["graph_to_theses", "theses_to_graph"]));
check("isTransformDirection", isTransformDirection("graph_to_theses") && !isTransformDirection("theses") && !isTransformDirection(1));
check("ключ стрима transform:{direction}", transformStreamKey("theses_to_graph") === "transform:theses_to_graph");
check("цель/источник разделов", TRANSFORM_TARGET_SECTION.graph_to_theses === "theses" && TRANSFORM_SOURCE_SECTION.graph_to_theses === "graph" && TRANSFORM_TARGET_SECTION.theses_to_graph === "graph");
check("сообщения пустого источника (edge case 07)", emptySourceMessage("theses_to_graph") === "No theses to transform" && emptySourceMessage("graph_to_theses") === "No graph to transform");
check("подпись раздела-цели из KEY_LABELS", targetSectionLabel("graph_to_theses") === "Корпус тезисов" && targetSectionLabel("theses_to_graph") === "Граф категорий");

const cats = [
  { id: "a", name: "Бытие", type: "онтологическая", definition: "то, что есть", centrality: 0.9, certainty: 0.8, origin: "Парменид", clusterIndices: [0], structuralRoles: ["central"], proceduralRoles: ["thesis"], hasReflexive: true },
  { id: "b", name: "Становление", type: "метафизическая", definition: "", centrality: 0.7, certainty: 0.5, origin: "", clusterIndices: [0, 1], structuralRoles: ["bridge"], proceduralRoles: [], hasReflexive: false },
];
const edges = [
  { sourceId: "a", targetId: "b", description: "бытие переходит", edgeType: "диалектическая", direction: "двунаправленная", strength: 0.75 },
  { sourceId: "a", targetId: "a", description: "", edgeType: "рефлексивная", direction: "рефлексивная", strength: 0.5 },
];
const clusters = [{ clusterIndex: 0, label: "Онтологическое ядро" }, { clusterIndex: 1, label: "Процесс" }];
const gb = buildGraphBlock(cats, edges, clusters);
check("graph_block: категории с ролями по-русски и кластерами по меткам", gb.includes("1. «Бытие» — тип: онтологическая") && gb.includes("роли: центральная, тезис") && gb.includes("кластеры: Онтологическое ядро") && gb.includes("Онтологическое ядро / Процесс"));
check("graph_block: связи со стрелками ↔ / ↺ и именами концов", gb.includes("«Бытие» ↔ «Становление» — диалектическая, сила 0.75: бытие переходит") && gb.includes("«Бытие» ↺ «Бытие»"));
check("graph_block: блок кластеров с составом", gb.includes("КЛАСТЕРЫ (2):") && gb.includes("1. Онтологическое ядро: «Бытие», «Становление»"));
check("graph_block: пустые поля → «—»", gb.includes("определение: —"));
const tb = buildThesesBlock([
  { thesisNum: 2, formulation: "Бытие есть.", justification: "ибо", thesisType: "ontological", noveltyDegree: "высокая", relatedCategories: ["Бытие"] },
  { thesisNum: 3, formulation: "Знание возможно.", justification: "", thesisType: "epistemological", noveltyDegree: "", relatedCategories: [] },
]);
check("theses_block: номер, тип по-русски, обоснование, категории", tb.includes("ТЕЗИСЫ (2):") && tb.includes("2. [онтологический] Бытие есть.") && tb.includes("Обоснование: ибо") && tb.includes("Связанные категории: Бытие"));
check("theses_block: пустые поля опущены", !tb.split("3. ")[1].includes("Обоснование"));
const ctx = buildTransformContextText({ title: "T", method: "dialectical", synthLevel: "generative" }, ["Кант"]);
check("контекст: метод/уровень метками, участники", ctx.includes("Метод синтеза: ") && ctx.includes("Участники синтеза: Кант") && !ctx.includes("Зерно"));
check("контекст: свободный синтез", buildTransformContextText({ title: "T", method: "creative", synthLevel: "comparative" }, []).includes("[свободный синтез"));
const dto = toTransformDto({ id: "t", synthesisId: "s", direction: "graph_to_theses", sourceSnapshot: { kind: "graph" }, targetSnapshot: { kind: "theses" }, resultSummary: { thesesCreated: 3 }, inputTokens: 10, outputTokens: 20, costUsd: "0.001200", createdAt: new Date("2026-09-05T10:00:00Z") });
check("DTO: costUsd число, createdAt ISO", dto.costUsd === 0.0012 && dto.createdAt === "2026-09-05T10:00:00.000Z" && dto.resultSummary.thesesCreated === 3);

console.log("── routes/transforms и graph-parser ──");
const routes = transformRoutes.routes.filter((r) => r.method !== "ALL").map((r) => `${r.method} ${r.path}`);
for (const r of ["POST /:id/transform/graph-to-theses", "POST /:id/transform/theses-to-graph", "GET /:id/transforms", "POST /:id/transforms/:transformId/rollback"])
  check(`роут ${r}`, routes.includes(r), routes);
check("graph-parser экспортирует normalizeGraphTypesToCatalog", typeof graphParser.normalizeGraphTypesToCatalog === "function");
const gpSrc = readFileSync("server/services/graph-parser.ts", "utf8");
check("saveGraphToDb принимает { normalizeTypes } и зовёт нормализацию после tx", /opts: SaveGraphOptions = \{\}/.test(gpSrc) && /opts\.normalizeTypes !== false/.test(gpSrc));
const idx = readFileSync("server/index.ts", "utf8");
check("transformRoutes смонтированы на /api/v1/syntheses", /app\.route\("\/api\/v1\/syntheses", transformRoutes\)/.test(idx));
const seed = readFileSync("scripts/seed-prompts.ts", "utf8");
check("seed-prompts сеет SEED_TRANSFORM_TEMPLATES", seed.includes("...SEED_TRANSFORM_TEMPLATES"));

console.log("── долг §12: парсер глоссария при lang ≠ Russian ──");
const glEn = `<div data-section="${GLOSSARY_TABLE_SECTION}"><table class="doc-table"><thead><tr><th>Term</th><th>Definition</th><th>Source</th></tr></thead><tbody><tr><td>Being</td><td>What is</td><td>P</td></tr></tbody></table></div>`;
const glRu = `<div data-section="Другое"><table class="doc-table"><thead><tr><th>Термин</th><th>Определение</th></tr></thead><tbody><tr><td>Бытие</td><td>Есть</td></tr></tbody></table></div>`;
check("таблица по data-section при переведённых заголовках", eq(parseGlossaryFromHTML(glEn).map((t) => [t.term, t.extraColumns.Source]), [["Being", "P"]]));
check("запасной путь по th «термин» сохранён", parseGlossaryFromHTML(glRu)[0]?.term === "Бытие");
check("GLOSSARY_TABLE_SECTION ≡ data-section рендерера", GLOSSARY_TABLE_SECTION === "Таблица определений");

console.log("── WS ──");
const wsTypes = readFileSync("packages/shared/types/ws-messages.ts", "utf8");
check("WsStartTransform в WsClientMessage", /type: "start_transform"/.test(wsTypes) && /\| WsStartTransform/.test(wsTypes));
const handler = readFileSync("server/ws/handler.ts", "utf8");
check("хендлер: start_transform в CLIENT_MESSAGE_TYPES и case с проверкой владельца", /"start_transform",/.test(handler) && /case "start_transform":/.test(handler) && handler.includes("await startTransform(msg.synthesisId, user.id, msg.direction)"));

console.log("── клиент: api/transforms пути ≡ роутам ──");
const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined });
  return new Response(JSON.stringify({ ok: true, transforms: [], transform: { id: "x" }, summary: {} }), { status: 200, headers: { "Content-Type": "application/json" } });
};
await transformsApi.transformGraphToTheses("S1");
await transformsApi.transformThesesToGraph("S1");
await transformsApi.startTransformRequest("S1", "theses_to_graph");
await transformsApi.getTransformHistory("S1");
await transformsApi.rollbackTransform("S1", "T1");
check("POST /transform/graph-to-theses", calls[0].method === "POST" && calls[0].url === "/api/v1/syntheses/S1/transform/graph-to-theses");
check("POST /transform/theses-to-graph", calls[1].method === "POST" && calls[1].url === "/api/v1/syntheses/S1/transform/theses-to-graph");
check("startTransformRequest диспетчеризует по направлению", calls[2].url === calls[1].url);
check("GET /transforms", calls[3].method === "GET" && calls[3].url === "/api/v1/syntheses/S1/transforms");
check("POST /transforms/:id/rollback", calls[4].method === "POST" && calls[4].url === "/api/v1/syntheses/S1/transforms/T1/rollback");
check("префикс стрима клиента ≡ серверному", TRANSFORM_STREAM_PREFIX + "graph_to_theses" === transformStreamKey("graph_to_theses"));

console.log("── клиент: тексты панели и истории ──");
check("превью потерь graph→theses", lossPreviewText("graph_to_theses", { theses: 5, categories: 10, edges: 12 }) === "Будут заменены текущие тезисы: 5.");
check("превью потерь theses→graph", lossPreviewText("theses_to_graph", { theses: 5, categories: 10, edges: 12 }).includes("категории: 10 и связи: 12"));
check("пустой источник: нет графа", sourceEmptyText("graph_to_theses", { theses: 5, categories: 0, edges: 0 }) !== null && sourceEmptyText("graph_to_theses", { theses: 0, categories: 3, edges: 0 }) === null);
check("пустой источник: нет тезисов", sourceEmptyText("theses_to_graph", { theses: 0, categories: 3, edges: 1 }) !== null);
check("заголовки разделов-целей", TARGET_SECTION_TITLES.graph_to_theses === "Корпус тезисов" && TARGET_SECTION_TITLES.theses_to_graph === "Граф категорий");
check("подписи направлений и целей отката", DIRECTION_LABELS.graph_to_theses === "Граф → Тезисы" && ROLLBACK_TARGET_LABELS.graph_to_theses === "тезисы" && ROLLBACK_TARGET_LABELS.theses_to_graph === "граф");
check("summaryText: создано/удалено + sectionMissing", summaryText({ thesesCreated: 7, thesesRemoved: 5, sectionMissing: 1 }) === "тезисов: создано 7, удалено 5 · раздела нет в документе — заменены только таблицы");
check("summaryText: граф с нормализацией", summaryText({ categoriesCreated: 9, categoriesRemoved: 8, edgesCreated: 12, edgesRemoved: 10, categoriesNormalized: 6, edgesNormalized: 4 }).includes("типов привязано к каталогу: 6 + 4"));

console.log("── клиент: интеграция ──");
const usg = readFileSync("client/src/hooks/useStreamingGeneration.ts", "utf8");
check("guard transform: в useStreamingGeneration", /startsWith\("transform:"\)/.test(usg));
const gm = readFileSync("client/src/components/graph/GraphModal.tsx", "utf8");
check("GraphModal: onTransform + кнопка «→ Тезисы»", /onTransform\?: \(\(direction: "graph_to_theses"\) => void\)/.test(gm) && gm.includes("→ Тезисы"));
const sp = readFileSync("client/src/pages/SynthesisPage.tsx", "utf8");
check("SynthesisPage: TransformPanel и «→ Граф» у theses", sp.includes("<TransformPanel") && /key === "theses" && isOwner && !live/.test(sp) && sp.includes("→ Граф"));
const em = readFileSync("client/src/components/edit/EditModal.tsx", "utf8");
check("EditModal: секция «Трансформации» с TransformHistory", em.includes("<TransformHistory") && em.includes("Трансформации"));
const css = readFileSync("client/src/globals.css", "utf8");
const kit = readFileSync("docs/fragments-for-conversations/5-6-ui-kit.css", "utf8");
for (const cls of [".transform-row", ".transform-arrow", ".transform-warn"]) {
  const rule = (src) => { const i = src.indexOf(cls + " {"); return src.slice(i, src.indexOf("}", i)).replace(/\s+/g, " "); };
  check(`блок 9 кита ${cls} перенесён дословно`, rule(css) === rule(kit), [rule(css), rule(kit)]);
}
check("дополнения 5.5: .transform-item / .section-actions / .transform-live", css.includes(".version-item.transform-item") && css.includes(".section-actions") && css.includes(".transform-live"));

console.log(`\n${failed ? "FAIL" : "OK"}: ${n - failed}/${n}`);
process.exit(failed ? 1 : 0);
