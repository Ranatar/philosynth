/**
 * Смоук беседы 8.4 (запрос 1; без сервера, БД и браузера — DOM из linkedom):
 *  - api/syntheses: deleteSynthesis / duplicateSynthesis / renameSynthesis —
 *    пути и методы ≡ роутам routes/syntheses (fetch подменён), rename
 *    шлёт PATCH { title };
 *  - уборка пяти мёртвых функций api/*: имён нет ни в client/src, ни в
 *    экспортах модулей; exportUrl и invalidateTaxonomyCache на месте;
 *    startTransformRequest бьёт в оба пути POST /transform/*;
 *    getTemplateVersions/getConfigVersionsFull — прямые вызовы /versions;
 *  - SynthesisCard: чистые ядра descendantsPhrase / deleteWarningText,
 *    текстовые контракты — preventDefault+stopPropagation у кнопок внутри
 *    Link, второй шаг «Точно удалить?» + «Отмена», сброс по клику мимо,
 *    ни одного window.confirm/prompt; строка действий только при actions
 *    (вкладка «Мои») — CatalogPage передаёт их только на tab === "mine";
 *  - CatalogPage: actionErrorText (details.title / 409 / 403), перечитка
 *    списка после duplicate и delete, потомки depth=1 и только synthesis;
 *  - utils/capsule-html: buildCapsuleHtml сохраняет обёртку секции и <h4>,
 *    round-trip с extractCapsuleText 1.5b, пустой исходник → секция с
 *    data-section="Капсула";
 *  - DocumentHeader: updateCapsule вызывается, ✎ капсулы и названия под
 *    isOwner, disabled при generating, capsuleErrorText по кодам;
 *  - EdgePanel: проп onDelete, второй шаг, без confirm; GraphModal зовёт
 *    deleteEdge и идёт путём onElementSaved (kind 'edge');
 *  - globals.css: блок 8.4 в части 3 (.action-btn.danger, строка действий,
 *    тёмная кнопка панели); новых hex-цветов в блоке нет;
 *  - integration-check 4ac/4af/4ah переписаны под уборку.
 * Запуск: node_modules/.bin/tsx tests/smoke-84-request1.mjs
 */
import { readFileSync } from "node:fs";

import { DOMParser, parseHTML } from "linkedom";

globalThis.DOMParser = DOMParser;
const { document: ldDocument, window: ldWindow } = parseHTML("<!doctype html><html><body></body></html>");
globalThis.document = ldDocument;
globalThis.window = ldWindow;

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, extra === undefined ? "" : JSON.stringify(extra)); }
}
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
// Сначала строчные комментарии, потом блочные: в GraphModal есть
// `// … services/export/*` — наивный порядок «блочные первыми» принимает
// этот `/*` за начало блока и съедает код до ближайшего `*/` (грабля
// класса 09 §3 1.3 п.6, повторилась здесь).
const strip = (s) => s.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

/* ── 1. api/syntheses: три функции 8.4 ── */
console.log("── 1. api/syntheses ──");
const synApi = await import("../client/src/api/syntheses.ts");
check("экспорты deleteSynthesis/duplicateSynthesis/renameSynthesis",
  ["deleteSynthesis", "duplicateSynthesis", "renameSynthesis"].every((f) => typeof synApi[f] === "function"));

const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  calls.push({ m: (init?.method ?? "GET").toUpperCase(), u: String(url), b: init?.body ?? null });
  return new Response(JSON.stringify({ ok: true, id: "COPY", synthesis: { id: "S", title: "T" }, capsuleHtml: "<p>x</p>", version: {}, impact: {}, htmlSync: {}, transforms: [], versions: [] }),
    { status: 200, headers: { "content-type": "application/json" } });
};
try {
  await synApi.deleteSynthesis("S");
  const dup = await synApi.duplicateSynthesis("S");
  const ren = await synApi.renameSynthesis("S", "Новое имя");
  check("DELETE /api/v1/syntheses/S", calls[0].m === "DELETE" && calls[0].u === "/api/v1/syntheses/S");
  check("POST /api/v1/syntheses/S/duplicate → { id }", calls[1].m === "POST" && calls[1].u === "/api/v1/syntheses/S/duplicate" && dup.id === "COPY");
  check("rename → PATCH /syntheses/S { title }", calls[2].m === "PATCH" && calls[2].u === "/api/v1/syntheses/S" && JSON.parse(calls[2].b).title === "Новое имя" && ren.id === "S");

  /* ── 2. Уборка мёртвых функций ── */
  console.log("── 2. уборка api/* ──");
  const dead = ["transformGraphToTheses", "transformThesesToGraph", "getVersions", "getConfigVersions", "getCategory"];
  const files = ["client/src/api/transforms.ts", "client/src/api/prompts.ts", "client/src/api/elements.ts"];
  for (const f of files) {
    const src = read(f);
    check(`${f}: ни одного мёртвого имени`, dead.every((d) => !new RegExp(`\\b${d}\\b`).test(src)), dead.filter((d) => new RegExp(`\\b${d}\\b`).test(src)));
  }
  const tApi = await import("../client/src/api/transforms.ts");
  const pApi = await import("../client/src/api/prompts.ts");
  const eApi = await import("../client/src/api/elements.ts");
  check("экспортов мёртвых функций нет", dead.every((d) => !(d in tApi) && !(d in pApi) && !(d in eApi)));
  const exApi = await import("../client/src/api/export.ts");
  const txApi = await import("../client/src/api/taxonomy.ts");
  check("exportUrl и invalidateTaxonomyCache НЕ тронуты", typeof exApi.exportUrl === "function" && typeof txApi.invalidateTaxonomyCache === "function");
  calls.length = 0;
  await tApi.startTransformRequest("S", "graph_to_theses");
  await tApi.startTransformRequest("S", "theses_to_graph");
  await pApi.getTemplateVersions("system");
  await pApi.getConfigVersionsFull("context_budget");
  check("startTransformRequest → POST оба пути /transform/*",
    calls[0].m === "POST" && calls[0].u.endsWith("/syntheses/S/transform/graph-to-theses") &&
    calls[1].m === "POST" && calls[1].u.endsWith("/syntheses/S/transform/theses-to-graph"));
  check("getTemplateVersions/getConfigVersionsFull — прямые GET /versions",
    calls[2].u === "/api/v1/prompts/system/versions" && calls[3].u === "/api/v1/configs/context_budget/versions");
  const cats = ["getCategories", "getTheses", "getGlossary", "updateCapsule", "deleteEdge"];
  check("api/elements: живые функции на месте", cats.every((f) => typeof eApi[f] === "function"));
} finally {
  globalThis.fetch = realFetch;
}

/* ── 3. SynthesisCard ── */
console.log("── 3. SynthesisCard ──");
const card = await import("../client/src/components/catalog/SynthesisCard.tsx");
check("descendantsPhrase 1/2/5/11/21", [1, 2, 5, 11, 21].map(card.descendantsPhrase).join("|") === "1 потомок|2 потомка|5 потомков|11 потомков|21 потомок");
check("deleteWarningText(2) называет число и 'без родителя'", /2 потомка/.test(card.deleteWarningText(2)) && /без родителя/.test(card.deleteWarningText(2)));
check("deleteWarningText называет ЧЕМ грозит (разделы, элементы, логи, родословная)", /разделы.*элементы.*логи.*родословн/.test(card.deleteWarningText(0)));
check("deleteWarningText(0) — потомков нет; null — без числа", /Потомков у концепции нет/.test(card.deleteWarningText(0)) && !/потомк/i.test(card.deleteWarningText(null)));
const cardSrc = read("client/src/components/catalog/SynthesisCard.tsx");
const cardCode = strip(cardSrc);
check("кнопки внутри Link: preventDefault + stopPropagation", /e\.preventDefault\(\);\s*e\.stopPropagation\(\);/.test(cardCode));
check("второй шаг: «Точно удалить?» + «Отмена», без window.confirm/prompt",
  cardSrc.includes("Точно удалить?") && cardSrc.includes("Отмена") && !/\bconfirm\(|\bprompt\(|\balert\(/.test(cardCode));
check("сброс второго шага по клику мимо карточки (mousedown на document)", /addEventListener\("mousedown"/.test(cardCode) && /!el\.contains\(ev\.target\)/.test(cardCode));
check("переименование по месту: Enter сохраняет, Esc отменяет, .inline-edit-form", /"Enter"/.test(cardCode) && /"Escape"/.test(cardCode) && /inline-edit-form/.test(cardSrc));
check("кнопка удаления — .action-btn.danger (--red)", /className="action-btn danger"/.test(cardSrc));
check("строка действий — в .catalog-card-foot, только при actions", /catalog-card-foot[\s\S]*catalog-card-actions[\s\S]*actions \?/.test(cardSrc));
check("число потомков запрашивается ДО показа числа (countDescendants в armDelete)", /armDelete[\s\S]*countDescendants/.test(cardCode));
check("409 и сбои — строкой в карточке (setStatus), карточка не исчезает", /setStatus\(err\)/.test(cardCode));

/* ── 4. CatalogPage ── */
console.log("── 4. CatalogPage ──");
const cp = await import("../client/src/pages/CatalogPage.tsx");
const { ApiError } = await import("../client/src/api/client.ts");
check("actionErrorText: details.title под полем",
  cp.actionErrorText(new ApiError("bad", "VALIDATION_ERROR", 400, { title: "непустая строка" }), "title", "x") === "Название: непустая строка");
check("actionErrorText: 409 → текст про генерацию", /[Гг]енерац/.test(cp.actionErrorText(new ApiError("x", "GENERATION_IN_PROGRESS", 409), null, "x")));
check("actionErrorText: 403 → только владельцу", /владельц/.test(cp.actionErrorText(new ApiError("x", "FORBIDDEN", 403), null, "x")));
const cpSrc = strip(read("client/src/pages/CatalogPage.tsx"));
check("actions только на вкладке «Мои»", /actions=\{tab === "mine" \? cardActions : undefined\}/.test(cpSrc));
check("после duplicate и delete — перечитка списка (fetchList), автоперехода нет",
  /duplicateSynthesis\(s\.id\);\s*await fetchList\(\{ silent: true \}\)/.test(cpSrc) && /deleteSynthesis\(s\.id\);\s*await fetchList\(\{ silent: true \}\)/.test(cpSrc) && !/navigate\(/.test(cpSrc));
check("потомки: getDescendants(id, 1), только type === 'synthesis'", /getDescendants\(s\.id, 1\)/.test(cpSrc) && /n\.type === "synthesis"/.test(cpSrc));

/* ── 5. capsule-html ── */
console.log("── 5. utils/capsule-html ──");
const ch = await import("../client/src/utils/capsule-html.ts");
const { extractCapsuleText } = await import("../client/src/utils/concept-file.ts");
const orig = `<div class="doc-section"><div class="section-num">§ 5</div><div class="section-title">Капсула</div><div class="doc-content" data-section="Капсула"><h4>Капсула</h4><p>Старый текст.</p><p>Второй абзац.</p></div></div>`;
const text = "Первый абзац нового текста.\n\nВторой абзац, с <угловыми> скобками.";
const rebuilt = ch.buildCapsuleHtml(orig, text);
check("обёртка секции и <h4> сохранены", rebuilt.includes('class="section-num"') && rebuilt.includes('data-section="Капсула"') && rebuilt.includes("<h4>Капсула</h4>"));
check("содержимое → абзацы, HTML экранирован", (rebuilt.match(/<p>/g) || []).length === 2 && rebuilt.includes("&lt;угловыми&gt;") && !rebuilt.includes("Старый текст"));
check("round-trip с extractCapsuleText 1.5b", extractCapsuleText(rebuilt).replace(/\s+/g, " ") === text.replace(/\s+/g, " "));
const empty = ch.buildCapsuleHtml("", "Текст");
check("пустой исходник → минимальная секция с data-section=\"Капсула\"", /data-section="Капсула"/.test(empty) && extractCapsuleText(empty) === "Текст");
check("capsuleParagraphs: пустая строка делит, пробельные абзацы выпадают", ch.capsuleParagraphs("a\n\n\n  \n\nb\r\nc").join("|") === "a|b\nc");

/* ── 6. DocumentHeader ── */
console.log("── 6. DocumentHeader ──");
const dh = await import("../client/src/components/document/DocumentHeader.tsx");
const dhSrc = strip(read("client/src/components/document/DocumentHeader.tsx"));
check("updateCapsule из api/elements вызывается", /import \{ updateCapsule \} from "\.\.\/\.\.\/api\/elements"/.test(dhSrc) && /await updateCapsule\(synthesis\.id, html\)/.test(dhSrc));
check("buildCapsuleHtml перед PATCH", /buildCapsuleHtml\(synthesis\.capsuleHtml, capsuleEdit\.text\)/.test(dhSrc));
check("✎ капсулы только у владельца, disabled при generating",
  /synthesis\.isOwner && !capsuleEdit &&/.test(dhSrc) && /disabled=\{live\}/.test(dhSrc) && /status === "generating"/.test(dhSrc));
check("✎ названия — тоже под isOwner", /\{synthesis\.isOwner && \(\s*<button[\s\S]*?doc-title-edit-btn/.test(dhSrc));
check("ответ → applySynthesis({ ...synthesis, capsuleHtml })", /applySynthesis\(\{ \.\.\.synthesis, capsuleHtml: res\.capsuleHtml \}\)/.test(dhSrc));
check("capsuleErrorText: 409 / 403 / details.html",
  /[Гг]енерац/.test(dh.capsuleErrorText(new ApiError("x", "GENERATION_IN_PROGRESS", 409))) &&
  /владелец/.test(dh.capsuleErrorText(new ApiError("x", "FORBIDDEN", 403))) &&
  dh.capsuleErrorText(new ApiError("x", "VALIDATION_ERROR", 400, { html: "ожидается непустая HTML-строка" })) === "Капсула: ожидается непустая HTML-строка");
check("клик по ✎ в summary не сворачивает details (preventDefault)", /summary сворачивает details/.test(read("client/src/components/document/DocumentHeader.tsx")) && /startCapsuleEdit\(\)/.test(dhSrc));

/* ── 7. EdgePanel / GraphModal ── */
console.log("── 7. EdgePanel / GraphModal ──");
const epSrc = read("client/src/components/graph/EdgePanel.tsx");
const epCode = strip(epSrc);
check("EdgePanel: проп onDelete?: (() => Promise<string | null>) | undefined", /onDelete\?: \(\(\) => Promise<string \| null>\) \| undefined/.test(epSrc));
check("EdgePanel: кнопка в .gm-panel-edit-row, второй шаг, без confirm",
  epSrc.includes("Удалить связь") && epSrc.includes("Точно удалить?") && /gm-panel-edit-row/.test(epSrc) && !/\bconfirm\(/.test(epCode));
check("EdgePanel: блокировка при генерации — editDisabled на обеих кнопках", (epCode.match(/disabled=\{editDisabled \|\| deleting\}/g) || []).length === 2);
check("EdgePanel: сброс второго шага по клику мимо панели", /addEventListener\("mousedown"/.test(epCode));
const gmSrc = strip(read("client/src/components/graph/GraphModal.tsx"));
check("GraphModal: deleteEdge из api/elements + onDelete у EdgePanel", /import \{ deleteEdge \} from "\.\.\/\.\.\/api\/elements"/.test(gmSrc) && /await deleteEdge\(synthesisId, edge\.id\)/.test(gmSrc) && /onDelete=\{\s*editable && synthesisId && data/.test(gmSrc));
check("GraphModal: после успеха — панель закрыта, путь onElementSaved kind 'edge' (как после PATCH 5.4)",
  /setPanel\(null\);\s*setEditEdge\(null\);\s*[\s\S]*?onElementSaved\?\.\(\{\s*kind: "edge"/.test(gmSrc));
const gm = await import("../client/src/components/graph/GraphModal.tsx");
check("messageOfEdgeDeleteError по кодам", /[Гг]енерац/.test(gm.messageOfEdgeDeleteError(new ApiError("x", "GENERATION_IN_PROGRESS", 409))) && /владелец/.test(gm.messageOfEdgeDeleteError(new ApiError("x", "FORBIDDEN", 403))));

/* ── 8. globals.css ── */
console.log("── 8. globals.css ──");
const css = read("client/src/globals.css");
const b84 = css.indexOf("Беседа 8.4");
const b62 = css.indexOf("Беседа 6.2 — биллинг");
check("блок 8.4 в части 3, перед блоком 6.2", b84 > 0 && b84 < b62 && b84 > css.indexOf("Беседа 5.5"));
const block = css.slice(b84, b62);
for (const sel of [".action-btn.danger", ".catalog-card-actions", ".catalog-card-rename", ".catalog-card-danger", ".gm-panel-edit-btn.danger", ".gm-panel-danger-note"])
  check(`правило ${sel}`, block.includes(sel + " {") || block.includes(sel + ","));
check("блок без новых hex-цветов (палитра закрыта: --red)", !/#[0-9a-f]{3,6}\b/i.test(block.replace(/#fff\b/g, "")) && /var\(--red\)/.test(block));
check("VersionHistory/TransformHistory не тронуты (наследие confirm остаётся)",
  /confirm\(/.test(read("client/src/components/edit/VersionHistory.tsx")) && /confirm\(/.test(read("client/src/components/edit/TransformHistory.tsx")));

/* ── 9. integration-check ── */
console.log("── 9. integration-check ──");
// секции ДО 2ab/4am: сама 4am упоминает снятые имена как проверяемые
const ic = read("server/integration-check.mts").split("// ── 2ab/4am")[0];
check("4ac без getCategory", !/"getCategory"/.test(ic));
check("4af: startTransformRequest вместо пофункциональных обёрток", /tapi\.startTransformRequest/.test(ic) && !/tapi\.transformGraphToTheses/.test(ic));
check("4ah без getVersions/getConfigVersions", !/apiP\.getVersions\b/.test(ic) && !/apiP\.getConfigVersions\b/.test(ic) && /apiP\.getTemplateVersions/.test(ic));

console.log(`\nИТОГ: ${n - failed} ✓ / ${failed} ✗`);
process.exit(failed ? 1 : 0);
