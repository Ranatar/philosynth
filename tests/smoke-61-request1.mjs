/**
 * Смоук чистых ядер беседы 6.1 (запрос 1; без БД, сети и Stripe):
 *  - utils/crypto: AES-256-GCM round-trip, пакование iv‖tag‖ciphertext,
 *    чужой ключ/повреждение → отказ, пустой секрет → ошибка конфигурации;
 *  - api-key-service: валидация формата, префикс 14 символов;
 *  - stripe-client: form-encoding вложенных ключей, подпись webhook
 *    (симметрия sign/construct, устаревание, подмена тела);
 *  - subscription-service: маппинг статусов Stripe, набор квот;
 *  - billing-service: стоимость/наценка, коды → HTTP-статусы;
 *  - streaming-manager: разъём учёта — мок SSE → usage у рекордера
 *    (успех и max-tokens), без opts.billing — не вызывается;
 *  - plan-executor: countBillableSteps;
 *  - роуты: billing (13 путей §2.10) и prompts (8 путей §2.9), обёртка
 *    billingCheck на роутах генерации (парсинг исходников), монтирование
 *    и warmCache в index.ts, отсутствие TODO(6.1) в сервисах.
 * Запуск: node_modules/.bin/tsx tests/smoke-61-request1.mjs
 */
import { readFileSync } from "node:fs";

process.env.API_KEY_ENCRYPTION_SECRET ??= "smoke-secret";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_smoke";
process.env.NODE_ENV ??= "test";

const {
  decrypt, deriveKey, encrypt, packSecret, unpackSecret, CryptoConfigError,
} = await import("../server/utils/crypto.ts");
const { validateApiKeyFormat, keyPrefixOf, KEY_PREFIX_LENGTH, ApiKeyError } =
  await import("../server/services/api-key-service.ts");
const { encodeForm, constructWebhookEvent, signWebhookPayload, StripeError } =
  await import("../server/services/stripe-client.ts");
const { mapStripeStatus, QUOTA_TYPES } = await import("../server/services/subscription-service.ts");
const { computeCostUsd, computeChargeUsd, billingErrorStatus, BillingError } =
  await import("../server/services/billing-service.ts");
const sm = await import("../server/services/streaming-manager.ts");
const { countBillableSteps } = await import("../server/services/plan-executor.ts");
const { billingRoutes } = await import("../server/routes/billing.ts");
const { promptsRoutes } = await import("../server/routes/prompts.ts");
const { PRICE_IN, PRICE_OUT } = await import("../server/services/cost-estimator.ts");
const { env } = await import("../server/env.ts");

let n = 0, failed = 0;
function check(name, cond, extra) {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, extra === undefined ? "" : JSON.stringify(extra)); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const throwsWith = (fn, pred) => { try { fn(); return false; } catch (e) { return pred(e); } };

console.log("── utils/crypto ──");
const key = deriveKey("some secret");
check("deriveKey → 32 байта", key.length === 32);
check("deriveKey детерминирован", deriveKey("some secret").equals(key));
const plain = "sk-ant-api03-" + "x".repeat(60);
const enc = encrypt(plain, key);
check("iv 12, tag 16", enc.iv.length === 12 && enc.tag.length === 16);
check("round-trip", decrypt(enc.ciphertext, enc.iv, enc.tag, key) === plain);
const packed = packSecret(enc);
const un = unpackSecret(packed);
check("pack/unpack", decrypt(un.ciphertext, un.iv, un.tag, key) === plain && packed.length === 28 + enc.ciphertext.length);
check("случайный IV: два шифрования различны", !encrypt(plain, key).ciphertext.equals(enc.ciphertext));
check("чужой ключ → отказ", throwsWith(() => decrypt(enc.ciphertext, enc.iv, enc.tag, deriveKey("other")), () => true));
const tampered = Buffer.from(enc.ciphertext); tampered[0] ^= 0xff;
check("повреждённый ciphertext → отказ", throwsWith(() => decrypt(tampered, enc.iv, enc.tag, key), () => true));
check("пустой секрет → CryptoConfigError", throwsWith(() => deriveKey(""), (e) => e instanceof CryptoConfigError));

console.log("── api-key-service: формат ──");
check("валидный ключ проходит (trim)", validateApiKeyFormat("  " + plain + " ") === plain);
check("префикс 14 символов", keyPrefixOf(plain) === "sk-ant-api03-x" && KEY_PREFIX_LENGTH === 14);
check("пустой → VALIDATION_ERROR + details.key", throwsWith(() => validateApiKeyFormat(""), (e) => e instanceof ApiKeyError && e.code === "VALIDATION_ERROR" && !!e.details?.key));
check("не sk-ant- → VALIDATION_ERROR", throwsWith(() => validateApiKeyFormat("sk-openai-" + "x".repeat(40)), (e) => e.code === "VALIDATION_ERROR"));
check("короткий → VALIDATION_ERROR", throwsWith(() => validateApiKeyFormat("sk-ant-abc"), (e) => e.code === "VALIDATION_ERROR"));
check("пробел внутри → VALIDATION_ERROR", throwsWith(() => validateApiKeyFormat("sk-ant-api03-aaa bbb" + "x".repeat(20)), (e) => e.code === "VALIDATION_ERROR"));

console.log("── stripe-client ──");
check("encodeForm вложенные ключи", encodeForm({ amount: 100, items: [{ price: "p_1" }], metadata: { userId: "u" }, skip: undefined }) ===
  "amount=100&items%5B0%5D%5Bprice%5D=p_1&metadata%5BuserId%5D=u");
const body = JSON.stringify({ id: "evt_1", object: "event", type: "invoice.paid", data: { object: { id: "in_1" } } });
const ts = Math.floor(Date.now() / 1000);
const sig = signWebhookPayload(body, process.env.STRIPE_WEBHOOK_SECRET, ts);
check("подпись сходится → событие", constructWebhookEvent(body, sig, ts).type === "invoice.paid");
check("устаревшая подпись → отказ", throwsWith(() => constructWebhookEvent(body, sig, ts + 1000), (e) => e instanceof StripeError && e.code === "WEBHOOK_SIGNATURE_INVALID"));
check("подмена тела → отказ", throwsWith(() => constructWebhookEvent(body + " ", sig, ts), (e) => e.code === "WEBHOOK_SIGNATURE_INVALID"));
check("без заголовка → отказ", throwsWith(() => constructWebhookEvent(body, undefined, ts), (e) => e.code === "WEBHOOK_SIGNATURE_INVALID"));
check("не событие → отказ", throwsWith(() => constructWebhookEvent("{}", signWebhookPayload("{}", process.env.STRIPE_WEBHOOK_SECRET, ts), ts), (e) => e.code === "WEBHOOK_SIGNATURE_INVALID"));

console.log("── subscription-service ──");
check("четыре квоты", eq([...QUOTA_TYPES], ["syntheses", "regenerations", "modes", "enrichments"]));
check("маппинг статусов Stripe", eq(
  ["active", "trialing", "past_due", "unpaid", "paused", "canceled", "incomplete_expired", "incomplete"].map(mapStripeStatus),
  ["active", "trialing", "past_due", "past_due", "past_due", "canceled", "canceled", "incomplete"]));

console.log("── billing-service ──");
check("стоимость = формула оценщика", Math.abs(computeCostUsd(1000, 500) - (1000 * PRICE_IN + 500 * PRICE_OUT)) < 1e-12);
check("наценка = BILLING_MARKUP", Math.abs(computeChargeUsd(1) - env.stripe.billingMarkup) < 1e-12);
check("коды → статусы", eq(
  ["QUOTA_EXCEEDED", "INSUFFICIENT_BALANCE", "BILLING_REQUIRED", "API_KEY_MISSING", "NOT_FOUND", "STRIPE_UNAVAILABLE", "VALIDATION_ERROR"].map(billingErrorStatus),
  [403, 403, 403, 403, 404, 503, 400]));
check("BillingError несёт details", new BillingError("QUOTA_EXCEEDED", "x", { quotaType: "modes" }).details.quotaType === "modes");
check("env.billing: enforce boolean, minReserveUsd number", typeof env.billing.enforce === "boolean" && env.billing.minReserveUsd > 0);

console.log("── streaming-manager: разъём учёта (мок SSE) ──");
const sse = (events) => new Response(new ReadableStream({
  start(ctrl) {
    const te = new TextEncoder();
    for (const e of events) ctrl.enqueue(te.encode(`data: ${JSON.stringify(e)}\n\n`));
    ctrl.close();
  },
}), { status: 200 });
const okEvents = (stop) => [
  { type: "message_start", message: { usage: { input_tokens: 120 } } },
  { type: "content_block_delta", delta: { text: "<p>hi</p>" } },
  { type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: 33 } },
];
const realFetch = globalThis.fetch;
const recorded = [];
const prevRecorder = sm.hasStreamUsageRecorder();
sm.setStreamUsageRecorder(async (ctx, usage) => { recorded.push({ ctx, usage }); });
globalThis.fetch = async () => sse(okEvents("end_turn"));
const billing = { userId: "u1", billingMode: "balance" };
const u1 = await sm.streamSection("s1", "graph", "p", "sys", "k", null, { billing });
check("успех: usage возвращён", eq(u1, { inputTokens: 120, outputTokens: 33 }));
check("успех: рекордер получил контекст с synthesisId/sectionKey", recorded.length === 1 && recorded[0].ctx.synthesisId === "s1" && recorded[0].ctx.sectionKey === "graph" && recorded[0].ctx.billingMode === "balance" && eq(recorded[0].usage, u1));
globalThis.fetch = async () => sse(okEvents("max_tokens"));
let mt = null;
try { await sm.streamSection("s1", "graph", "p", "sys", "k", null, { billing }); } catch (e) { mt = e; }
check("max-tokens: StreamError kind + usage", mt?.kind === "max-tokens" && eq(mt.usage, { inputTokens: 120, outputTokens: 33 }));
check("max-tokens: рекордер вызван (токены потрачены)", recorded.length === 2 && eq(recorded[1].usage, mt.usage));
globalThis.fetch = async () => sse(okEvents("end_turn"));
await sm.streamSection("s1", "graph", "p", "sys", "k", null, {});
check("без opts.billing — учёта нет", recorded.length === 2);
sm.setStreamUsageRecorder(async () => { throw new Error("boom"); });
const u2 = await sm.streamSection("s1", "graph", "p", "sys", "k", null, { billing });
check("ошибка рекордера не роняет стрим", eq(u2, { inputTokens: 120, outputTokens: 33 }));
globalThis.fetch = realFetch;
sm.setStreamUsageRecorder(null);
check("до смоука рекордер был зарегистрирован billing-service (импорт)", prevRecorder === true);

console.log("── plan-executor: countBillableSteps ──");
const steps = [
  { type: "delete", status: "confirmed" }, { type: "regen", status: "confirmed" },
  { type: "add", status: "skipped" }, { type: "regen_subsection", status: "confirmed" },
  { type: "regen_mode", status: "pending" },
];
check("delete/skipped/pending не считаются", countBillableSteps(steps) === 2);
check("с шага 3 → 1", countBillableSteps(steps, 3) === 1);
check("минимум 1", countBillableSteps([{ type: "delete", status: "confirmed" }]) === 1);

console.log("── роуты ──");
const paths = (app) => app.routes.filter((r) => r.method !== "ALL").map((r) => `${r.method} ${r.path}`).sort();
check("billing: 13 путей §2.10", eq(paths(billingRoutes), [
  "DELETE /api-key/:id", "GET /api-key", "GET /plans", "GET /subscription", "GET /transactions", "GET /usage",
  "POST /api-key", "POST /subscribe", "POST /subscription/cancel", "POST /subscription/resume",
  "POST /topup", "POST /topup/confirm", "POST /webhook",
]), paths(billingRoutes));
check("prompts: 8 путей §2.9", eq(paths(promptsRoutes), [
  "GET /configs", "GET /configs/:key/versions", "GET /prompts", "GET /prompts/:key/versions",
  "POST /configs/:key/activate", "POST /prompts/:key", "POST /prompts/:key/activate", "PUT /configs/:key",
]), paths(promptsRoutes));
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const wrapped = {
  "server/routes/syntheses.ts": ['synthesesRoutes.post("/", requireAuth, billingCheck({ quota: "syntheses" })'],
  "server/routes/generation.ts": ['billingCheck({ quota: "regenerations" })'],
  "server/routes/plans.ts": ['/execute", requireAuth, billingCheck({ quota: "regenerations" })'],
  "server/routes/modes.ts": ['/run", requireAuth, billingCheck({ quota: "modes" })'],
  "server/routes/enrichment.ts": ['billingCheck({ quota: "enrichments" })'],
  "server/routes/transforms.ts": ['billingCheck({ quota: "regenerations" })'],
};
for (const [f, needles] of Object.entries(wrapped)) {
  const t = src(f);
  check(`billingCheck на ${f}`, needles.every((x) => t.includes(x)));
}
check("generation.ts: два роута обёрнуты", (src("server/routes/generation.ts").match(/billingCheck\(/g) ?? []).length === 2);
check("enrichment.ts: три роута обёрнуты", (src("server/routes/enrichment.ts").match(/billingCheck\(/g) ?? []).length === 3);
check("modes.ts: два роута обёрнуты", (src("server/routes/modes.ts").match(/billingCheck\(/g) ?? []).length === 2);
check("transforms.ts: два роута обёрнуты", (src("server/routes/transforms.ts").match(/billingCheck\(/g) ?? []).length === 2);
const idx = src("server/index.ts");
check("index.ts: billing и prompts смонтированы, warmCache вызван", /\/api\/v1\/billing", billingRoutes/.test(idx) && /\/api\/v1", promptsRoutes/.test(idx) && /void warmCache\(\)/.test(idx));
const svc = ["generation-service", "mode-service", "element-enrichment", "representation-transformer", "pause-resume-service"]
  .map((m) => src(`server/services/${m}.ts`)).join("\n");
check("env.anthropic.apiKey больше не берётся в сервисах", !/env\.anthropic\.apiKey/.test(svc));
check("TODO(6.1) BYO-Key снят", !/TODO\(6\.1\)/.test(svc));
check("все слоты с квотами (8 в сервисах + 3 в plan-executor)", (svc.match(/6\.1: квота подписки/g) ?? []).length === 8 && (src("server/services/plan-executor.ts").match(/6\.1: квота подписки/g) ?? []).length === 3);

console.log(`\n${n - failed}/${n} ✓${failed ? `, ${failed} ✗` : ""}`);
process.exit(failed ? 1 : 0);
