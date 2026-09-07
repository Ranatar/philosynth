/**
 * Смоук беседы 6.2 (запрос 1; без сервера, БД и браузера):
 *  - utils/text-diff: построчный LCS-diff, свёртка контекста, статистика;
 *  - utils/template-placeholders: извлечение {{…}} (синтаксис
 *    prompt-registry), предпросмотр с тестовыми значениями, missing;
 *  - utils/format: деньги/целые/даты;
 *  - AdminPromptsPage: keyGroup/groupKeys, validateJson/prettyJson;
 *  - BillingPage: maskApiKey, billingErrorText;
 *  - api/billing, api/subscription, api/prompts — состав экспортов и
 *    пути эндпоинтов §2.10/§2.9 (парсинг исходников);
 *  - App.tsx: RequireAdmin на /admin/prompts; PauseModal: форма ключа;
 *    Sidebar: ссылка «Промпты» admin-only; globals.css: блоки 3/4/6 кита.
 * Запуск: node_modules/.bin/tsx tests/smoke-62-request1.mjs
 */
import { readFileSync } from "node:fs";

// Модули страниц импортируют react — под tsx это чистый импорт без DOM,
// пока не рендерится JSX; Stripe-утилита обращается к window только в
// функциях. import.meta.env в vite-модуле под tsx отсутствует — utils/stripe
// это учитывает.
const { diffLines, diffStats } = await import("../client/src/utils/text-diff.ts");
const { extractPlaceholders, previewParts, missingPlaceholders, SAMPLE_VALUES } =
  await import("../client/src/utils/template-placeholders.ts");
const { fmtUsd, fmtMoney, fmtInt, fmtDateShort, toIsoDate } =
  await import("../client/src/utils/format.ts");
const { stripeConfigured, STRIPE_APPEARANCE } = await import("../client/src/utils/stripe.ts");
const { keyGroup, groupKeys, validateJson, prettyJson } =
  await import("../client/src/pages/AdminPromptsPage.tsx");
const { maskApiKey, billingErrorText } = await import("../client/src/pages/BillingPage.tsx");
const { ApiError } = await import("../client/src/api/client.ts");

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, extra === undefined ? "" : JSON.stringify(extra)); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

console.log("── utils/text-diff ──");
const d1 = diffLines("a\nb\nc", "a\nB\nc");
check("замена строки → del+add с контекстом", eq(d1.map((l) => l.kind), ["ctx", "del", "add", "ctx"]), d1);
check("тексты del/add", d1[1].text === "b" && d1[2].text === "B");
check("одинаковые тексты → «Различий нет»", diffLines("x", "x")[0].text === "Различий нет");
const big = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
const d2 = diffLines(big, big.replace("line 15", "LINE 15"));
check("длинные одинаковые участки свёрнуты", d2.some((l) => /без изменений/.test(l.text)) && d2.length < 12, d2.length);
check("контекст 2 строки вокруг изменения", d2.filter((l) => l.kind === "ctx" && /^line/.test(l.text)).length === 4);
check("diffStats", eq(diffStats(d2), { added: 1, removed: 1 }));
const d3 = diffLines("a\nb", "a\nb\nc\nd");
check("добавление в конец", eq(diffStats(d3), { added: 2, removed: 0 }));
check("удаление всего", eq(diffStats(diffLines("a\nb", "")), { added: 1, removed: 2 }));

console.log("── utils/template-placeholders ──");
const body = "Текст {{participants}}, {{ method_label }} и {{participants}} + {{unknown_ph}}.";
check("extractPlaceholders уникальные, с пробелами внутри", eq(extractPlaceholders(body), ["participants", "method_label", "unknown_ph"]));
check("синтаксис ≡ prompt-registry ([\\w.-])", eq(extractPlaceholders("{{a.b-c}} {{ bad ph }}"), ["a.b-c"]));
check("missingPlaceholders", eq(missingPlaceholders(body), ["unknown_ph"]));
const parts = previewParts(body);
check("previewParts: filled/missing/text", eq(parts.map((p) => p.kind), ["text", "filled", "text", "filled", "text", "filled", "text", "missing", "text"]), parts);
check("filled берёт SAMPLE_VALUES", parts[1].text === SAMPLE_VALUES.participants && parts[7].text === "{{unknown_ph}}");
check("previewParts без плейсхолдеров — один text", eq(previewParts("plain").map((p) => p.kind), ["text"]));
check("пустое тело → []", previewParts("").length === 0);
// Инвентарь плейсхолдеров серверных шаблонов: у всех есть тестовое значение
const cfg = ["server/config/enrichment-templates.ts", "server/config/transform-templates.ts", "server/config/mode-config.ts"];
const inventory = new Set();
for (const f of cfg) {
  let text = "";
  try { text = read(f); } catch { continue; }
  for (const m of text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) inventory.add(m[1]);
}
const noSample = [...inventory].filter((k) => !(k in SAMPLE_VALUES));
check(`тестовые значения для плейсхолдеров enrichment/transform (${inventory.size})`, noSample.length === 0, noSample);

console.log("── utils/format ──");
check("fmtUsd 4 знака", fmtUsd(0.14204) === "$0.1420");
check("fmtUsd отрицательное", fmtUsd(-1.5, 2) === "−$1.50");
check("fmtMoney", fmtMoney(5) === "$5.00");
check("fmtInt разделитель", fmtInt(18402) === "18\u202f402" && fmtInt(999) === "999");
check("fmtInt NaN → —", fmtInt(NaN) === "—");
check("fmtDateShort формат", /^\d{2}\.\d{2}(\.\d{2})? \d{2}:\d{2}$/.test(fmtDateShort(new Date().toISOString())));
check("fmtDateShort мусор → —", fmtDateShort("nope") === "—");
check("toIsoDate", /^\d{4}-\d{2}-\d{2}$/.test(toIsoDate(new Date())));

console.log("── utils/stripe ──");
check("без VITE_STRIPE_PUBLISHABLE_KEY — не настроен (dev-режим)", stripeConfigured() === false);
check("appearance: прямые углы, палитра :root", STRIPE_APPEARANCE.variables.borderRadius === "0px" && STRIPE_APPEARANCE.variables.colorPrimary === "#1a2855");

console.log("── AdminPromptsPage: дерево и JSON ──");
check("keyGroup", keyGroup("method.dialectical.graph") === "method.dialectical" && keyGroup("system") === "system");
const g = groupKeys(["method.dialectical.theses", "system", "method.dialectical.graph", "level.comparative.sum"]);
check("groupKeys: группы по алфавиту, ключи внутри отсортированы", eq(g, [
  ["level.comparative", ["level.comparative.sum"]],
  ["method.dialectical", ["method.dialectical.graph", "method.dialectical.theses"]],
  ["system", ["system"]],
]), g);
check("validateJson ok", eq(validateJson('{"a":[1,2]}'), { ok: true, value: { a: [1, 2] } }));
const bad = validateJson('{ "sum": ["goals",, ] }');
check("validateJson ошибка с позицией (строка/столбец)", bad.ok === false && /строка \d+, столбец \d+/.test(bad.error), bad);
check("validateJson пусто", validateJson("  ").ok === false);
check("prettyJson канон 2 пробела", prettyJson({ a: 1 }) === '{\n  "a": 1\n}');

console.log("── BillingPage: маска и ошибки ──");
check("maskApiKey", maskApiKey("sk-ant-api03-a") === "sk-ant-api03-a" + "•".repeat(12));
check("billingErrorText: details первое поле", billingErrorText(new ApiError("Неверная сумма", "VALIDATION_ERROR", 400, { amountUsd: "от 1 до 1000 USD" }), "x") === "Неверная сумма: от 1 до 1000 USD");
check("billingErrorText: STRIPE_UNAVAILABLE", /Stripe не настроен/.test(billingErrorText(new ApiError("s", "STRIPE_UNAVAILABLE", 503), "x")));
check("billingErrorText: fallback", billingErrorText(42, "fb") === "fb");

console.log("── api-модули: экспорты и пути ──");
const apiBilling = read("client/src/api/billing.ts");
for (const [fn, path] of [
  ["listApiKeys", "/billing/api-key"], ["storeApiKey", "/billing/api-key"], ["deleteApiKey", "/billing/api-key/${"],
  ["createTopup", "/billing/topup"], ["confirmTopup", "/billing/topup/confirm"],
  ["getUsageHistory", "/billing/usage"], ["getTransactionHistory", "/billing/transactions"],
]) check(`billing.ts: ${fn} → ${path}`, apiBilling.includes(`export function ${fn}`) && apiBilling.includes(path));
const apiSub = read("client/src/api/subscription.ts");
for (const [fn, path] of [
  ["getSubscription", "/billing/subscription\""], ["getPlans", "/billing/plans"], ["subscribe", "/billing/subscribe"],
  ["cancelSubscription", "/billing/subscription/cancel"], ["resumeSubscription", "/billing/subscription/resume"],
]) check(`subscription.ts: ${fn} → ${path}`, apiSub.includes(`export function ${fn}`) && apiSub.includes(path));
const apiPrompts = read("client/src/api/prompts.ts");
for (const [fn, path] of [
  ["listPrompts", "\"/prompts\""], ["getVersions", "/prompts/${k(key)}/versions"], ["createVersion", "`/prompts/${k(key)}`"],
  ["activateVersion", "/prompts/${k(key)}/activate"], ["listConfigs", "\"/configs\""], ["updateConfig", "/configs/${k(key)}`"],
  ["getConfigVersions", "/configs/${k(key)}/versions"], ["activateConfigVersion", "/configs/${k(key)}/activate"],
]) check(`prompts.ts: ${fn} → ${path}`, new RegExp(`export (async )?function ${fn}\\b`).test(apiPrompts) && apiPrompts.includes(path));
check("prompts.ts: PUT для конфига", /method: "PUT"/.test(apiPrompts));
check("prompts.ts: обход дыры /versions без тел — getTemplateVersions/getConfigVersionsFull", /getTemplateVersions/.test(apiPrompts) && /getConfigVersionsFull/.test(apiPrompts));

console.log("── App / PauseModal / Sidebar / CSS ──");
const app = read("client/src/App.tsx");
check("App: RequireAdmin объявлен и оборачивает /admin/prompts", /function RequireAdmin/.test(app) && /<RequireAdmin>\s*<AdminPromptsPage \/>/.test(app));
check("App: RequireAdmin → /catalog при role !== 'admin'", /role !== "admin"[\s\S]{0,80}Navigate to="\/catalog"/.test(app));
const pm = read("client/src/components/synthesis/PauseModal.tsx");
check("PauseModal: импорт storeApiKey и форма ключа (.pause-apikey-row)", /storeApiKey/.test(pm) && /pause-apikey-row/.test(pm) && /pause-save-key/.test(pm));
check("PauseModal: сохранение → resume retry (gen/plan)", /await storeApiKey\(key\);[\s\S]{0,200}onResumePlan\("retry"\)[\s\S]{0,100}onResumeGeneration\("retry"\)/.test(pm));
check("PauseModal: хуки до раннего return", pm.indexOf("useState(\"\")") < pm.indexOf("if (!open || !ps) return null;"));
const sb = read("client/src/components/layout/Sidebar.tsx");
check("Sidebar: «Промпты» admin-only", /\/admin\/prompts.*adminOnly: true/.test(sb));
const css = read("client/src/globals.css");
for (const cls of [".data-table", ".data-table-toolbar", ".pager", ".stat-row", ".stat-value", ".masked-key", ".masked-key-status.active", ".amount-choice", ".key-tree", ".key-tree-item.active", ".code-editor.invalid", ".code-status.err", ".placeholder-chip.filled"])
  check(`globals.css: ${cls}`, css.includes(`${cls} {`) || css.includes(`${cls} {`.replace(" {", ",")) || css.includes(`${cls}`));
check("globals.css: блоки 6.2 до @tailwind utilities", css.indexOf("Беседа 6.2") < css.lastIndexOf("@tailwind utilities"));
const kit = read("docs/fragments-for-conversations/5-6-ui-kit.css");
for (const sel of [".data-table th {", ".masked-key {", ".key-tree-item.active {", ".code-editor:focus {"]) {
  const rule = (t) => { const i = t.indexOf(sel); return t.slice(i, t.indexOf("}", i)).replace(/\s+/g, " "); };
  check(`перенос дословный: ${sel}`, rule(css).replace(/^\s+/, "") === rule(kit));
}
const pages = read("client/src/pages/BillingPage.tsx") + read("client/src/pages/AdminPromptsPage.tsx");
check("страницы не тянут PageStub", !/PageStub/.test(pages));
check("нет border-radius/box-shadow в разметке страниц", !/borderRadius|boxShadow/.test(pages));

console.log(`\n${n - failed}/${n} ✓${failed ? `, ${failed} ✗` : ""}`);
process.exit(failed ? 1 : 0);
