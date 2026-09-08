/**
 * Тестовые запросы 2–11 беседы 6.1 (Billing Service + API Key Management)
 * — одним заходом, против ЖИВОГО сервера (BILLING_ENFORCE=true) с моком
 * Claude SSE и моком Stripe REST:
 *  R2  BYO-Key: POST /billing/api-key → GET список (префикс, без ключа) →
 *      getDecryptedKey ≡ оригинал → resolveBilling mode 'byo' →
 *      операция уходит в Claude с КЛЮЧОМ ПОЛЬЗОВАТЕЛЯ (x-api-key) →
 *      api_usage 'byo', баланс не тронут.
 *  R3  Баланс: POST /topup $1.00 → мок-оплата → /topup/confirm → баланс 1.00,
 *      transaction 'topup' (идемпотентно) → операция → баланс уменьшился
 *      ровно на себестоимость×наценка → transaction 'usage' + api_usage
 *      'balance' → GET /usage и /transactions это видят.
 *  R4  Недостаток баланса: баланс $0.001 → POST /syntheses (exhaustive) →
 *      403 INSUFFICIENT_BALANCE, строка синтеза НЕ создана; баланс 0 →
 *      BILLING_REQUIRED.
 *  R5  Шифрование: ключ сохранён → ПЕРЕЗАПУСК сервера → GET список тот же →
 *      операция идёт с тем же ключом; ключ в БД не в открытом виде.
 *  R6  BYO-Key И баланс → приоритет BYO (баланс не меняется, api_usage byo).
 *  R7  Подписка: план Starter → POST /subscribe (Stripe mock: customer +
 *      subscription incomplete, clientSecret) → webhook invoice.paid →
 *      active → POST /syntheses → used_syntheses = 1 → generation_complete;
 *      api_usage 'subscription'; GET /subscription отражает использование.
 *  R8  Исчерпание квоты: used_syntheses = quota → POST /syntheses → 403
 *      QUOTA_EXCEEDED (details.quotaType) → пополнить баланс → тот же
 *      запрос проходит в режиме 'balance' (fallback).
 *  R9  Webhook invoice.paid: счётчики сброшены, период обновлён; повтор
 *      того же периода не сбрасывает; неверная подпись → 400.
 *  R10 Отмена: cancel → cancel_at_period_end=true → до конца периода режим
 *      'subscription' → webhook subscription.deleted → canceled → без
 *      источника → BILLING_REQUIRED; resume снимает флаг.
 *  R11 Приоритет: BYO + подписка + баланс → byo; удалить ключ → subscription;
 *      исчерпать квоту → balance; удалить баланс → QUOTA_EXCEEDED.
 *  + admin routes/prompts: не-админ 403, черновик → список версий →
 *    активация → getTemplate отдаёт новое тело (кэш сброшен) → откат.
 * Запуск: node_modules/.bin/tsx tests/test-61-requests2-11.mjs
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import { createStripeMock } from "../tools/stripe-mock.mjs";

import WebSocket from "ws";

const SERVER_PORT = 3000;
const MOCK_PORT = 3855;
const STRIPE_PORT = 3866;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const DB_URL = "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const ENC_SECRET = "test-encryption-secret-61";
const WH_SECRET = "whsec_test_61";
const SERVER_KEY = "sk-ant-server-key-61";

process.env.DATABASE_URL ??= DB_URL;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.ANTHROPIC_API_KEY = SERVER_KEY;
process.env.API_KEY_ENCRYPTION_SECRET = ENC_SECRET;
process.env.STRIPE_WEBHOOK_SECRET = WH_SECRET;
process.env.BILLING_ENFORCE = "true";
process.env.BILLING_MIN_RESERVE_USD = "0.05";
process.env.BILLING_MARKUP = "1.2";

let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
const J = (x) => JSON.stringify(x);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const { db, closeDb } = await import("../server/db/index.js");
const schema = await import("../server/db/schema.js");
const { closeRedis } = await import("../server/redis.js");
const { saveGraphToDb, parseGraphFromHTML } = await import("../server/services/graph-parser.js");
const { parseThesesFromHTML, saveElementsToDb } = await import("../server/services/element-parser.js");
const { getDecryptedKey } = await import("../server/services/api-key-service.js");
const { resolveBilling, computeCostUsd, computeChargeUsd, BillingError } = await import("../server/services/billing-service.js");
const { getTemplate } = await import("../server/services/prompt-registry.js");
const { signWebhookPayload } = await import("../server/services/stripe-client.js");
const { and, asc, desc, eq } = await import("drizzle-orm");
const { users, syntheses, synthesisLineage, sections, apiKeys, apiUsage, transactions, subscriptionPlans, userSubscriptions, promptTemplates } = schema;

/* ══ Фикстура синтеза (как 5.5) ═══════════════════════════════════════ */
const secWrap = (num, title, inner) =>
  `<div class="doc-section"><div class="section-num">§ ${num}</div>` +
  `<div class="section-title">${title}</div><div class="doc-content">${inner}</div></div>`;
const sub = (name, inner) => `<div data-section="${name}"><h4>${name}</h4>${inner}</div>`;
const tbl = (heads, rows) =>
  `<table class="doc-table"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` +
  `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const CAT_NAMES = ["Бытие", "Становление", "Ничто", "Логос", "Истина", "Благо"];
const CAT_TYPES = ["онтологическая", "метафизическая", "онтологическая", "логическая", "эпистемологическая", "этическая"];
function graphHtml(names, types, num = 2) {
  const cats = names.map((n, i) => [n, types[i % types.length], `Определение ${n}`, "0.6", "0.7", `Источник ${n}`]);
  const edges = names.slice(1).map((n, i) => [names[i], `${names[i]} обусловливает ${n}`, n, i % 2 ? "каузальная" : "диалектическая", "однонаправленная", "0.8"]);
  const topo = names.map((n, i) => [n, i < 3 ? "Ядро" : "Горизонт", i === 0 ? "центральная" : "", i % 2 ? "тезис" : "антитезис", ""]);
  return secWrap(num, "Граф категорий",
    sub("Методология построения графа", "<p>Методология.</p>") +
    sub("Таблица категорий", tbl(["Категория", "Тип", "Определение", "Центральность", "Определённость", "Происхождение"], cats)) +
    sub("Таблица связей", tbl(["Источник", "Описание связи", "Цель", "Тип", "Направление", "Сила"], edges)) +
    sub("Топология графа", "<p>Два кластера.</p>") +
    sub("Топологическая таблица", tbl(["Категория", "Кластер", "Структурные роли", "Процессуальные роли", "Рефлексивная связь"], topo)));
}
function thesesHtml(num = 3) {
  const items = [
    { f: "Бытие первично по отношению к становлению.", type: "онтологический", cats: "Бытие, Становление" },
    { f: "Логос открывает истину.", type: "эпистемологический", cats: "Логос, Истина" },
    { f: "Благо познаётся через свободу.", type: "этический", cats: "Благо" },
  ];
  return secWrap(num, "Корпус тезисов",
    sub("Онтологические тезисы", `<p><strong>${items[0].f}</strong> Обоснование.</p>`) +
    sub("Эпистемологические тезисы", `<p><strong>${items[1].f}</strong> Обоснование.</p>`) +
    sub("Этические и аксиологические тезисы", `<p><strong>${items[2].f}</strong> Обоснование.</p>`) +
    sub("Сводная таблица тезисов", tbl(["№", "Формулировка тезиса", "Тип", "Степень новизны", "Связанные категории"],
      items.map((t, i) => [String(i + 1), t.f, t.type, "средняя", t.cats]))));
}
async function makeSynthesis(userId, title) {
  const [s] = await db.insert(syntheses).values({
    userId, seed: "зерно 6.1", sectionOrder: ["sum", "graph", "theses"], status: "ready", title,
    capsuleHtml: "<p>Капсула.</p>", synthLevel: "comparative",
  }).returning();
  await db.insert(synthesisLineage).values([{ synthesisId: s.id, parentType: "philosopher", parentName: "Парменид", position: 0 }]);
  const g = graphHtml(CAT_NAMES, CAT_TYPES, 2);
  const t = thesesHtml(3);
  await db.insert(sections).values([
    { synthesisId: s.id, key: "sum", sectionNum: 1, title: "Резюме", htmlContent: secWrap(1, "Резюме", sub("Цели", "<p>Цели.</p>")) },
    { synthesisId: s.id, key: "graph", sectionNum: 2, title: "Граф Категорий Концепции", htmlContent: g },
    { synthesisId: s.id, key: "theses", sectionNum: 3, title: "Корпус Тезисов", htmlContent: t },
  ]);
  await saveGraphToDb(s.id, parseGraphFromHTML(g), { normalizeTypes: false });
  await saveElementsToDb(s.id, "theses", { theses: parseThesesFromHTML(t) });
  return s;
}

/* ══ Мок Claude SSE — записывает x-api-key ════════════════════════════ */
const claude = { calls: [] };
function startClaudeMock() {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      let prompt = "";
      try { prompt = JSON.parse(body).messages?.[0]?.content ?? ""; } catch {}
      const apiKey = req.headers["x-api-key"];
      const html = /ГРАФ КАТЕГОРИЙ|граф категорий/i.test(prompt) && /Таблица категорий/.test(prompt)
        ? graphHtml(CAT_NAMES.slice(0, 4), CAT_TYPES, 2)
        : /КОРПУС ТЕЗИСОВ/i.test(prompt) ? thesesHtml(3)
          : `<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">Ответ</div><div class="doc-content">${sub("Ответ мока", "<p>" + "Текст ответа мока. ".repeat(40) + "</p>")}</div></div>`;
      const inTok = Math.ceil(prompt.length / 4), outTok = Math.ceil(html.length / 4);
      claude.calls.push({ apiKey, inTok, outTok, promptHead: prompt.slice(0, 80) });
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (o) => res.write(`data: ${J(o)}\n\n`);
      send({ type: "message_start", message: { usage: { input_tokens: inTok } } });
      for (let i = 0; i < html.length; i += 400) { send({ type: "content_block_delta", delta: { type: "text_delta", text: html.slice(i, i + 400) } }); await sleep(3); }
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: outTok } });
      send({ type: "message_stop" });
      res.end();
    });
  });
  return new Promise((r) => srv.listen(MOCK_PORT, "127.0.0.1", () => r(srv)));
}

/* ══ Мок Stripe REST — общий модуль оснастки (8.2), поведение test-61 ═══ */
// PaymentIntent рождается requires_payment_method (тест переводит его в
// succeeded руками — так проверяется отказ confirm неоплаченного); ключ и
// порт — как до выноса.
const stripeMock = createStripeMock({ port: STRIPE_PORT, bearer: "sk_test_mock61", paymentIntentStatus: "requires_payment_method" });
const stripeState = stripeMock.state; // pis/subs/customers/requests — тот же объект, что читают проверки ниже
const nowSec = () => Math.floor(Date.now() / 1000);
const startStripeMock = () => stripeMock.start();

/* ══ Процессы ═════════════════════════════════════════════════════════ */
let serverProc, claudeSrv, stripeSrv;
let serverLog = "";
async function startServer(extraEnv = {}) {
  serverProc = spawn(process.execPath, ["--import", "tsx", "index.ts"], {
    cwd: new URL("../server/", import.meta.url).pathname,
    env: {
      ...process.env, PORT: String(SERVER_PORT), DATABASE_URL: DB_URL, REDIS_URL: "redis://localhost:6379",
      CLIENT_ORIGIN: "http://localhost:5173", RATE_LIMIT_HTTP_PER_MINUTE: "100000",
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: SERVER_KEY,
      STRIPE_SECRET_KEY: "sk_test_mock61", STRIPE_API_BASE: `http://127.0.0.1:${STRIPE_PORT}`, STRIPE_WEBHOOK_SECRET: WH_SECRET,
      API_KEY_ENCRYPTION_SECRET: ENC_SECRET, BILLING_ENFORCE: "true", BILLING_MIN_RESERVE_USD: "0.05", BILLING_MARKUP: "1.2",
      STREAM_RETRY_DELAYS: "50", ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  serverProc.stdout.on("data", (d) => (serverLog += d));
  serverProc.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`${API}/health`)).ok) return; } catch {} await sleep(300); }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-3000));
}
const killGroup = (p) => { if (!p) return; try { process.kill(-p.pid, "SIGKILL"); } catch {} try { p.kill("SIGKILL"); } catch {} };
async function restartServer() {
  killGroup(serverProc);
  for (let i = 0; i < 50; i++) { try { await fetch(`${API}/health`); await sleep(200); } catch { break; } }
  await startServer();
}

async function makeUser(tag) {
  const email = `t61-${tag}-${Date.now()}@test.local`;
  const password = "Passw0rd!123";
  let r = await fetch(`${API}/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: J({ email, password }) });
  if (!r.ok) throw new Error("register: " + (await r.text()));
  const id = (await r.json()).user.id;
  r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: J({ email, password }) });
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  return { id, email, password, cookie };
}
const api = async (u, method, path, body) => {
  const r = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", Cookie: u.cookie }, body: body === undefined ? undefined : J(body) });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};
function openWs(u) {
  const ws = new WebSocket(`ws://127.0.0.1:${SERVER_PORT}/ws`, { headers: { Cookie: u.cookie } });
  const msgs = [];
  ws.on("message", (d) => { try { msgs.push(JSON.parse(String(d))); } catch {} });
  const opened = new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
  const waitFor = async (pred, timeout = 60000, since = 0) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { const m = msgs.slice(since).find(pred); if (m) return m; await sleep(100); }
    return null;
  };
  return { ws, msgs, opened, waitFor, mark: () => msgs.length };
}
const balanceOf = async (uid) => Number((await db.select({ b: users.balanceUsd }).from(users).where(eq(users.id, uid)))[0].b);
const setBalance = (uid, v) => db.update(users).set({ balanceUsd: v.toFixed(4) }).where(eq(users.id, uid));
const usageOf = (uid) => db.select().from(apiUsage).where(eq(apiUsage.userId, uid)).orderBy(asc(apiUsage.createdAt));
const txOf = (uid) => db.select().from(transactions).where(eq(transactions.userId, uid)).orderBy(asc(transactions.createdAt));
const subOf = async (uid) => (await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, uid)).orderBy(desc(userSubscriptions.createdAt)))[0];

/** Операция под слотом с вызовом Claude: режим adversarial на фикстуре; ждём mode_done. */
async function runOp(u, sid, ws) {
  const since = ws.mark();
  const callsBefore = claude.calls.length;
  const r = await api(u, "POST", `/syntheses/${sid}/modes/adversarial/run`, { param: "Кант" });
  if (r.status !== 200) return { r, done: null, call: null };
  const done = await ws.waitFor((m) => m.type === "mode_done" && m.synthesisId === sid, 60000, since);
  await sleep(300); // учёт usage — после usage, до mode_done? страховка на асинхронный insert
  return { r, done, call: claude.calls[callsBefore] ?? null };
}
const webhook = async (event, { badSig = false } = {}) => {
  const raw = J({ id: `evt_${Math.random().toString(36).slice(2)}`, object: "event", type: event.type, data: { object: event.object } });
  const sig = badSig ? "t=1,v1=00" : signWebhookPayload(raw, WH_SECRET);
  const r = await fetch(`${API}/billing/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": sig }, body: raw });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const SYNTH_BODY = (depth = "exhaustive") => ({ seed: "Зерно теста биллинга 6.1", philosophers: ["Парменид"], sections: ["graph", "theses"], method: "dialectical", depth, synthLevel: "comparative" });

/* ══ Прогон ═══════════════════════════════════════════════════════════ */
try {
  // следы прежних прогонов (пользователи t61-*)
  const { like } = await import("drizzle-orm");
  for (const stale of await db.select({ id: users.id }).from(users).where(like(users.email, "t61-%"))) {
    await db.delete(syntheses).where(eq(syntheses.userId, stale.id));
    await db.delete(apiUsage).where(eq(apiUsage.userId, stale.id));
    await db.delete(transactions).where(eq(transactions.userId, stale.id));
    await db.delete(users).where(eq(users.id, stale.id));
  }
  claudeSrv = await startClaudeMock();
  stripeSrv = await startStripeMock();
  await startServer();
  const USER_KEY = "sk-ant-api03-USER-" + "k".repeat(60);

  /* ── R2 BYO-Key ─────────────────────────────────────────────────────── */
  console.log("\n── R2: BYO-Key ──");
  const A = await makeUser("a");
  const SA = await makeSynthesis(A.id, "Синтез A");
  const wsA = openWs(A); await wsA.opened;
  let r = await api(A, "GET", "/billing/api-key");
  ok(r.status === 200 && r.json.keys.length === 0, "GET /api-key: пусто у нового пользователя");
  r = await api(A, "POST", "/billing/api-key", { key: "bad" });
  ok(r.status === 400 && r.json.code === "VALIDATION_ERROR" && r.json.details?.key, "POST /api-key невалидный → 400 + details.key");
  r = await api(A, "POST", "/billing/api-key", { key: USER_KEY });
  ok(r.status === 201 && r.json.prefix === USER_KEY.slice(0, 14) && /^[0-9a-f-]{36}$/.test(r.json.keyId), "POST /api-key → 201 { keyId, prefix (14) }", J(r.json));
  const keyIdA = r.json?.keyId;
  r = await api(A, "GET", "/billing/api-key");
  ok(r.status === 200 && r.json.keys.length === 1 && r.json.keys[0].isActive && r.json.keys[0].prefix === USER_KEY.slice(0, 14) && !J(r.json).includes(USER_KEY), "GET /api-key: одна активная запись, сам ключ не отдаётся");
  ok((await getDecryptedKey(A.id)) === USER_KEY, "getDecryptedKey ≡ оригинал");
  const rowKey = (await db.select().from(apiKeys).where(eq(apiKeys.userId, A.id)))[0];
  ok(rowKey && !Buffer.from(rowKey.encryptedKey).toString("utf8").includes("USER-"), "в БД ключ не в открытом виде");
  let dec = await resolveBilling(A.id, { quota: "modes" });
  ok(dec.billingMode === "byo" && dec.apiKey === USER_KEY, "resolveBilling → mode byo с ключом пользователя");
  let op = await runOp(A, SA.id, wsA);
  ok(op.r.status === 200 && op.done, "операция запущена (billing-check пропустил) и завершена");
  ok(op.call?.apiKey === USER_KEY, "Claude получил x-api-key = КЛЮЧ ПОЛЬЗОВАТЕЛЯ", op.call?.apiKey);
  let us = await usageOf(A.id);
  ok(us.length === 1 && us[0].billingMode === "byo" && us[0].inputTokens === op.call.inTok && us[0].outputTokens === op.call.outTok && near(Number(us[0].costUsd), computeCostUsd(op.call.inTok, op.call.outTok), 1e-6), "api_usage 'byo' с себестоимостью и токенами", J(us));
  ok(near(await balanceOf(A.id), 0) && (await txOf(A.id)).length === 0, "баланс не тронут, транзакций нет");
  // второй ключ вытесняет первый
  r = await api(A, "POST", "/billing/api-key", { key: USER_KEY.replace("USER", "SECOND") });
  const keys2 = (await api(A, "GET", "/billing/api-key")).json.keys;
  ok(r.status === 201 && keys2.length === 2 && keys2.filter((k) => k.isActive).length === 1 && (await getDecryptedKey(A.id)).includes("SECOND"), "новый ключ → прежний деактивирован, активен один");
  r = await api(A, "DELETE", `/billing/api-key/${r.json.keyId}`);
  ok(r.status === 200 && (await getDecryptedKey(A.id)) === null, "DELETE активного → активного нет (прежний остаётся неактивным)");
  r = await api(A, "DELETE", `/billing/api-key/${keyIdA}`);
  ok(r.status === 200 && (await api(A, "GET", "/billing/api-key")).json.keys.length === 0, "DELETE второго → список пуст");
  r = await api(A, "DELETE", `/billing/api-key/${keyIdA}`);
  ok(r.status === 404 && r.json.code === "NOT_FOUND", "повторный DELETE → 404");

  /* ── R3 Баланс ──────────────────────────────────────────────────────── */
  console.log("\n── R3: баланс ──");
  const B = await makeUser("b");
  const SB = await makeSynthesis(B.id, "Синтез B");
  const wsB = openWs(B); await wsB.opened;
  r = await api(B, "POST", "/billing/topup", { amountUsd: 0.5 });
  ok(r.status === 400 && r.json.code === "VALIDATION_ERROR", "topup 0.5 → 400 (минимум $1)");
  r = await api(B, "POST", "/billing/topup", { amountUsd: 1 });
  ok(r.status === 200 && r.json.clientSecret?.endsWith("_secret") && r.json.paymentIntentId?.startsWith("pi_") && r.json.amountUsd === 1, "POST /topup → clientSecret + paymentIntentId", J(r.json));
  const piId = r.json.paymentIntentId;
  ok(stripeState.pis.get(piId)?.amount === 100 && stripeState.pis.get(piId)?.metadata.userId === B.id, "Stripe получил PaymentIntent 100¢ с metadata.userId");
  r = await api(B, "POST", "/billing/topup/confirm", { paymentIntentId: piId });
  ok(r.status === 400 && r.json.code === "VALIDATION_ERROR" && r.json.details?.status === "requires_payment_method", "confirm неоплаченного → 400");
  stripeState.pis.get(piId).status = "succeeded";
  r = await api(B, "POST", "/billing/topup/confirm", { paymentIntentId: piId });
  ok(r.status === 200 && near(r.json.balanceUsd, 1) && r.json.transaction.type === "topup" && near(r.json.transaction.amountUsd, 1) && r.json.transaction.stripeId === piId, "confirm → баланс 1.00, transaction topup", J(r.json));
  const r2 = await api(B, "POST", "/billing/topup/confirm", { paymentIntentId: piId });
  ok(r2.status === 200 && near(r2.json.balanceUsd, 1) && r2.json.transaction.id === r.json.transaction.id, "повторный confirm идемпотентен (без второго начисления)");
  r = await api(B, "POST", "/billing/topup/confirm", { paymentIntentId: "pi_nope" });
  ok(r.status === 404, "confirm неизвестного PI → 404");
  ok(near(await balanceOf(B.id), 1), "users.balance_usd = 1.0000");
  dec = await resolveBilling(B.id, { quota: "modes" });
  ok(dec.billingMode === "balance" && dec.apiKey === SERVER_KEY, "resolveBilling → mode balance с серверным ключом");
  op = await runOp(B, SB.id, wsB);
  ok(op.r.status === 200 && op.done && op.call?.apiKey === SERVER_KEY, "операция прошла серверным ключом");
  const cost = computeCostUsd(op.call.inTok, op.call.outTok), charge = computeChargeUsd(cost);
  const balB = await balanceOf(B.id);
  ok(near(balB, 1 - charge, 1e-4) && balB < 1, `баланс уменьшился на себестоимость×1.2 (${charge.toFixed(6)})`, `${balB}`);
  let txs = await txOf(B.id);
  ok(txs.length === 2 && txs[1].type === "usage" && near(Number(txs[1].amountUsd), -charge, 1e-6) && near(Number(txs[1].balanceAfter), balB, 1e-4) && txs[1].synthesisId === SB.id && txs[1].sectionKey === "mode:adversarial", "transaction 'usage' с суммой, balance_after, synthesisId, section_key", J(txs[1]));
  us = await usageOf(B.id);
  ok(us.length === 1 && us[0].billingMode === "balance" && near(Number(us[0].costUsd), cost, 1e-6), "api_usage 'balance' с себестоимостью");
  r = await api(B, "GET", "/billing/usage");
  ok(r.status === 200 && r.json.entries.length === 1 && r.json.totals.requests === 1 && near(r.json.totals.costUsd, cost, 1e-6) && r.json.byMode.balance.requests === 1, "GET /usage: entries + totals + byMode");
  r = await api(B, "GET", `/billing/usage?synthesisId=${SB.id}&from=2020-01-01`);
  ok(r.status === 200 && r.json.entries.length === 1, "GET /usage с фильтрами synthesisId/from");
  r = await api(B, "GET", "/billing/usage?from=не-дата");
  ok(r.status === 400 && r.json.details?.from, "GET /usage невалидная дата → 400");
  r = await api(B, "GET", "/billing/transactions?limit=1");
  ok(r.status === 200 && r.json.total === 2 && r.json.items.length === 1 && r.json.items[0].type === "usage", "GET /transactions: пагинация, новые первыми");
  r = await api(B, "GET", "/auth/me");
  ok(near(r.json.user.balanceUsd, balB, 1e-4), "GET /auth/me отражает баланс");
  // ФАКТ 6.1: удаление оплаченного синтеза — история остаётся (synthesis_id → NULL, миграция 0002)
  r = await api(B, "DELETE", `/syntheses/${SB.id}`);
  us = await usageOf(B.id); txs = await txOf(B.id);
  ok(r.status === 200 && us.length === 1 && us[0].synthesisId === null && txs[1].synthesisId === null, "DELETE оплаченного синтеза → 200, api_usage/transactions остаются с synthesis_id = NULL");

  /* ── R4 Недостаток баланса ──────────────────────────────────────────── */
  console.log("\n── R4: недостаток баланса ──");
  const C = await makeUser("c");
  await setBalance(C.id, 0.001);
  const nSynthBefore = (await db.select().from(syntheses).where(eq(syntheses.userId, C.id))).length;
  r = await api(C, "POST", "/syntheses", SYNTH_BODY("exhaustive"));
  ok(r.status === 403 && r.json.code === "INSUFFICIENT_BALANCE" && r.json.details?.balanceUsd === 0.001, "баланс $0.001 → 403 INSUFFICIENT_BALANCE", J(r.json));
  ok((await db.select().from(syntheses).where(eq(syntheses.userId, C.id))).length === nSynthBefore, "строка синтеза НЕ создана (middleware до INSERT)");
  await setBalance(C.id, 0);
  r = await api(C, "POST", "/syntheses", SYNTH_BODY());
  ok(r.status === 403 && r.json.code === "BILLING_REQUIRED", "баланс 0, без ключа и подписки → 403 BILLING_REQUIRED");
  const SC = await makeSynthesis(C.id, "Синтез C");
  r = await api(C, "POST", `/syntheses/${SC.id}/regenerate/theses`, {});
  ok(r.status === 403 && r.json.code === "BILLING_REQUIRED", "regenerate без оплаты → 403 (ретрофит middleware)");
  r = await api(C, "POST", `/syntheses/${SC.id}/modes/adversarial/run`, { param: "Кант" });
  ok(r.status === 403, "modes/run без оплаты → 403");
  // WS-запуск тоже под гейтом слота
  const wsC = openWs(C); await wsC.opened;
  const sinceC = wsC.mark();
  wsC.ws.send(J({ type: "start_mode", synthesisId: SC.id, modeKey: "adversarial", param: "Кант" }));
  const errC = await wsC.waitFor((m) => m.type === "stream_error", 10000, sinceC);
  ok(errC && /BILLING_REQUIRED|источника оплаты/i.test(errC.error), "WS start_mode без оплаты → stream_error с BILLING_REQUIRED", J(errC));
  await setBalance(C.id, 0.049);
  r = await api(C, "POST", "/syntheses", SYNTH_BODY());
  ok(r.status === 403 && r.json.code === "INSUFFICIENT_BALANCE", "баланс ниже порога резерва → INSUFFICIENT_BALANCE");
  wsC.ws.close();

  /* ── R5 Шифрование через перезапуск ─────────────────────────────────── */
  console.log("\n── R5: шифрование + перезапуск ──");
  const D = await makeUser("d");
  const SD = await makeSynthesis(D.id, "Синтез D");
  const D_KEY = "sk-ant-api03-DKEY-" + "d".repeat(60);
  r = await api(D, "POST", "/billing/api-key", { encryptedKey: D_KEY }); // имя поля из 03 §2.10
  ok(r.status === 201, "POST /api-key принимает и поле encryptedKey (03 §2.10)");
  await restartServer();
  ok(true, "сервер перезапущен");
  r = await api(D, "GET", "/billing/api-key");
  ok(r.status === 200 && r.json.keys.length === 1 && r.json.keys[0].prefix === D_KEY.slice(0, 14), "после перезапуска ключ в списке (сессия жива)");
  ok((await getDecryptedKey(D.id)) === D_KEY, "getDecryptedKey после перезапуска ≡ оригинал");
  const wsD = openWs(D); await wsD.opened;
  op = await runOp(D, SD.id, wsD);
  ok(op.done && op.call?.apiKey === D_KEY, "новый процесс сервера расшифровал тот же ключ для Claude");
  // чужой секрет — ключ не читается
  const prevSecret = process.env.API_KEY_ENCRYPTION_SECRET;
  wsD.ws.close();

  /* ── R6 BYO + баланс → BYO ──────────────────────────────────────────── */
  console.log("\n── R6: BYO-Key И баланс ──");
  const E = await makeUser("e");
  const SE = await makeSynthesis(E.id, "Синтез E");
  await setBalance(E.id, 5);
  const E_KEY = "sk-ant-api03-EKEY-" + "e".repeat(60);
  await api(E, "POST", "/billing/api-key", { key: E_KEY });
  const wsE = openWs(E); await wsE.opened;
  op = await runOp(E, SE.id, wsE);
  ok(op.done && op.call?.apiKey === E_KEY, "приоритет BYO: Claude получил ключ пользователя");
  ok(near(await balanceOf(E.id), 5), "баланс не изменился");
  us = await usageOf(E.id);
  ok(us.length === 1 && us[0].billingMode === "byo", "api_usage 'byo'");
  wsE.ws.close();

  /* ── R7 Подписка ────────────────────────────────────────────────────── */
  console.log("\n── R7: подписка ──");
  // уборка следов прежних прогонов: подписки на старый план → план
  for (const old of await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, "starter"))) {
    await db.delete(userSubscriptions).where(eq(userSubscriptions.planId, old.id));
  }
  await db.delete(subscriptionPlans).where(eq(subscriptionPlans.name, "starter"));
  const [plan] = await db.insert(subscriptionPlans).values({
    name: "starter", displayName: "Starter", priceUsd: "9.00", billingPeriod: "month",
    quotaSyntheses: 3, quotaRegenerations: 10, quotaModes: 5, quotaEnrichments: 20, stripePriceId: "price_starter_61",
  }).returning();
  const F = await makeUser("f");
  r = await api(F, "GET", "/billing/plans");
  ok(r.status === 200 && r.json.plans.some((p) => p.name === "starter" && p.priceUsd === 9 && p.quotaSyntheses === 3), "GET /plans содержит Starter");
  r = await api(F, "GET", "/billing/subscription");
  ok(r.status === 200 && r.json.subscription === null && r.json.plan === null, "GET /subscription без подписки → null");
  r = await api(F, "POST", "/billing/subscribe", { planId: "not-uuid" });
  ok(r.status === 400, "subscribe невалидный planId → 400");
  r = await api(F, "POST", "/billing/subscribe", { planId: plan.id });
  ok(r.status === 201 && r.json.subscriptionId?.startsWith("sub_") && r.json.clientSecret?.endsWith("_secret") && r.json.subscription.status === "incomplete", "POST /subscribe → clientSecret + subscriptionId, status incomplete", J(r.json));
  const stripeSubId = r.json.subscriptionId;
  const stripeSub = stripeState.subs.get(stripeSubId);
  ok(stripeSub?.items?.["0"]?.price === "price_starter_61" && stripeSub.metadata.userId === F.id && stripeState.customers.some((c) => c.email === F.email), "Stripe: customer с email, подписка на price плана, metadata.userId");
  r = await api(F, "POST", "/syntheses", SYNTH_BODY("overview"));
  ok(r.status === 403 && r.json.code === "BILLING_REQUIRED", "incomplete-подписка ещё не оплачивает");
  // оплата → webhook invoice.paid
  const ps = nowSec(), pe = ps + 30 * 86400;
  let wh = await webhook({ type: "invoice.paid", object: { id: "in_1", object: "invoice", subscription: stripeSubId, lines: { data: [{ period: { start: ps, end: pe } }] } } });
  ok(wh.status === 200 && wh.json.handled && wh.json.action === "period_reset", "webhook invoice.paid → handled", J(wh.json));
  let subRow = await subOf(F.id);
  ok(subRow.status === "active" && Math.abs(subRow.currentPeriodEnd.getTime() / 1000 - pe) < 2, "подписка active, период из инвойса");
  dec = await resolveBilling(F.id, { quota: "syntheses" });
  ok(dec.billingMode === "subscription" && dec.subscriptionId === subRow.id && dec.apiKey === SERVER_KEY, "resolveBilling → subscription (проверка без потребления)");
  ok((await subOf(F.id)).usedSyntheses === 0, "checkQuota (consume:false) счётчик не тронул");
  const wsF = openWs(F); await wsF.opened;
  const sinceF = wsF.mark();
  r = await api(F, "POST", "/syntheses", SYNTH_BODY("overview"));
  ok(r.status === 201 || r.status === 200, "POST /syntheses под подпиской принят", J(r.json));
  const synthF = r.json?.id;
  const doneF = await wsF.waitFor((m) => m.type === "generation_complete" && m.synthesisId === synthF, 120000, sinceF);
  ok(!!doneF, "generation_complete получен", serverLog.slice(-800));
  subRow = await subOf(F.id);
  ok(subRow.usedSyntheses === 1, "used_syntheses = 1 (один синтез, а не по разделу)", String(subRow.usedSyntheses));
  us = await usageOf(F.id);
  ok(us.length >= 2 && us.every((x) => x.billingMode === "subscription" && x.synthesisId === synthF), `api_usage 'subscription' на каждый вызов Claude (${us.length})`);
  ok(near(await balanceOf(F.id), 0) && (await txOf(F.id)).length === 0, "баланс/транзакции не тронуты");
  r = await api(F, "GET", "/billing/subscription");
  ok(r.json.subscription?.status === "active" && r.json.usage.syntheses === 1 && r.json.quotas.syntheses === 3 && r.json.plan.name === "starter", "GET /subscription: usage/quotas");
  const rowF = (await db.select().from(syntheses).where(eq(syntheses.id, synthF)))[0];
  ok(rowF.status === "ready" && Number(rowF.totalCostUsd) > 0, "синтез ready, total_cost_usd > 0 (себестоимость документа)");

  /* ── R8 Исчерпание квоты → QUOTA_EXCEEDED / fallback на баланс ──────── */
  console.log("\n── R8: исчерпание квоты ──");
  await db.update(userSubscriptions).set({ usedSyntheses: 3 }).where(eq(userSubscriptions.id, subRow.id));
  r = await api(F, "POST", "/syntheses", SYNTH_BODY("overview"));
  ok(r.status === 403 && r.json.code === "QUOTA_EXCEEDED" && r.json.details?.quotaType === "syntheses" && r.json.details?.used === 3, "квота исчерпана, баланса нет → 403 QUOTA_EXCEEDED(details)", J(r.json));
  r = await api(F, "POST", `/syntheses/${synthF}/modes/adversarial/run`, { param: "Кант" });
  ok(r.status === 200, "другая квота (modes) ещё есть → операция принята");
  await wsF.waitFor((m) => m.type === "mode_done" && m.synthesisId === synthF, 60000);
  ok((await subOf(F.id)).usedModes === 1, "used_modes = 1");
  await setBalance(F.id, 2);
  dec = await resolveBilling(F.id, { quota: "syntheses" });
  ok(dec.billingMode === "balance", "квота исчерпана, баланс есть → fallback на balance");
  const sinceF2 = wsF.mark();
  const before = (await usageOf(F.id)).length;
  r = await api(F, "POST", "/syntheses", SYNTH_BODY("overview"));
  ok(r.status === 201 || r.status === 200, "POST /syntheses прошёл в режиме balance");
  const doneF2 = await wsF.waitFor((m) => m.type === "generation_complete" && m.synthesisId === r.json.id, 120000, sinceF2);
  ok(!!doneF2 && (await balanceOf(F.id)) < 2 && (await usageOf(F.id)).slice(before).every((x) => x.billingMode === "balance"), "генерация списала с баланса, api_usage 'balance'");
  ok((await subOf(F.id)).usedSyntheses === 3, "квота не превышена (осталась 3/3)");

  /* ── R9 Webhook invoice.paid: сброс счётчиков ───────────────────────── */
  console.log("\n── R9: webhook ──");
  const ps2 = pe, pe2 = pe + 30 * 86400;
  wh = await webhook({ type: "invoice.paid", object: { id: "in_2", object: "invoice", subscription: stripeSubId, lines: { data: [{ period: { start: ps2, end: pe2 } }] } } });
  subRow = await subOf(F.id);
  ok(wh.status === 200 && wh.json.action === "period_reset" && subRow.usedSyntheses === 0 && subRow.usedModes === 0 && Math.abs(subRow.currentPeriodStart.getTime() / 1000 - ps2) < 2 && Math.abs(subRow.currentPeriodEnd.getTime() / 1000 - pe2) < 2, "новый период: счётчики 0, границы обновлены");
  await db.update(userSubscriptions).set({ usedSyntheses: 2 }).where(eq(userSubscriptions.id, subRow.id));
  wh = await webhook({ type: "invoice.paid", object: { id: "in_2", object: "invoice", subscription: stripeSubId, lines: { data: [{ period: { start: ps2, end: pe2 } }] } } });
  ok(wh.status === 200 && wh.json.action === "already_current" && (await subOf(F.id)).usedSyntheses === 2, "повтор того же периода (ретрай Stripe) счётчики не сбрасывает");
  wh = await webhook({ type: "invoice.paid", object: { id: "in_x", object: "invoice", subscription: "sub_unknown" } });
  ok(wh.status === 200 && wh.json.handled === false, "неизвестная подписка → 200 handled:false");
  wh = await webhook({ type: "invoice.paid", object: { id: "in_3", object: "invoice", subscription: stripeSubId } }, { badSig: true });
  ok(wh.status === 400 && wh.json.code === "WEBHOOK_SIGNATURE_INVALID", "неверная подпись → 400");
  const noAuth = await fetch(`${API}/billing/subscription`);
  ok(noAuth.status === 401, "прочие billing-роуты требуют сессии");

  /* ── R10 Отмена ─────────────────────────────────────────────────────── */
  console.log("\n── R10: отмена подписки ──");
  await setBalance(F.id, 0);
  r = await api(F, "POST", "/billing/subscription/cancel");
  ok(r.status === 200 && r.json.subscription.cancelAtPeriodEnd === true && stripeState.subs.get(stripeSubId).cancel_at_period_end === true, "cancel → cancel_at_period_end=true (и в Stripe)");
  dec = await resolveBilling(F.id, { quota: "syntheses" });
  ok(dec.billingMode === "subscription", "до конца периода подписка продолжает работать");
  r = await api(F, "POST", "/billing/subscription/resume");
  ok(r.status === 200 && r.json.subscription.cancelAtPeriodEnd === false && stripeState.subs.get(stripeSubId).cancel_at_period_end === false, "resume → флаг снят");
  await api(F, "POST", "/billing/subscription/cancel");
  wh = await webhook({ type: "customer.subscription.updated", object: { id: stripeSubId, object: "subscription", status: "active", current_period_start: ps2, current_period_end: pe2, cancel_at_period_end: true } });
  ok(wh.status === 200 && wh.json.action === "updated", "subscription.updated обработан");
  wh = await webhook({ type: "customer.subscription.deleted", object: { id: stripeSubId, object: "subscription", status: "canceled", current_period_start: ps2, current_period_end: pe2, cancel_at_period_end: true } });
  subRow = await subOf(F.id);
  ok(wh.status === 200 && wh.json.action === "canceled" && subRow.status === "canceled", "subscription.deleted → status canceled");
  let threw = null;
  try { await resolveBilling(F.id, { quota: "syntheses" }); } catch (e) { threw = e; }
  ok(threw instanceof BillingError && threw.code === "BILLING_REQUIRED", "после отмены без баланса → BILLING_REQUIRED");
  r = await api(F, "GET", "/billing/subscription");
  ok(r.json.subscription?.status === "canceled", "GET /subscription показывает последнюю (canceled)");
  r = await api(F, "POST", "/billing/subscription/cancel");
  ok(r.status === 404, "cancel без активной подписки → 404");
  wsF.ws.close();

  /* ── R11 Приоритет ──────────────────────────────────────────────────── */
  console.log("\n── R11: приоритет BYO → подписка → баланс ──");
  const G = await makeUser("g");
  const SG = await makeSynthesis(G.id, "Синтез G");
  const G_KEY = "sk-ant-api03-GKEY-" + "g".repeat(60);
  const kg = await api(G, "POST", "/billing/api-key", { key: G_KEY });
  const sg = await api(G, "POST", "/billing/subscribe", { planId: plan.id });
  await webhook({ type: "invoice.paid", object: { id: "in_g", object: "invoice", subscription: sg.json.subscriptionId, lines: { data: [{ period: { start: nowSec(), end: nowSec() + 86400 } }] } } });
  await setBalance(G.id, 3);
  const wsG = openWs(G); await wsG.opened;
  op = await runOp(G, SG.id, wsG);
  ok(op.done && op.call?.apiKey === G_KEY && (await usageOf(G.id)).at(-1).billingMode === "byo" && (await subOf(G.id)).usedModes === 0 && near(await balanceOf(G.id), 3), "1) всё есть → BYO (квота и баланс не тронуты)");
  await api(G, "DELETE", `/billing/api-key/${kg.json.keyId}`);
  op = await runOp(G, SG.id, wsG);
  ok(op.done && op.call?.apiKey === SERVER_KEY && (await usageOf(G.id)).at(-1).billingMode === "subscription" && (await subOf(G.id)).usedModes === 1 && near(await balanceOf(G.id), 3), "2) ключ удалён → подписка (used_modes=1, баланс не тронут)");
  await db.update(userSubscriptions).set({ usedModes: 5 }).where(eq(userSubscriptions.userId, G.id));
  op = await runOp(G, SG.id, wsG);
  ok(op.done && op.call?.apiKey === SERVER_KEY && (await usageOf(G.id)).at(-1).billingMode === "balance" && (await balanceOf(G.id)) < 3 && (await subOf(G.id)).usedModes === 5, "3) квота исчерпана → баланс (списание, квота не превышена)");
  await setBalance(G.id, 0);
  r = await api(G, "POST", `/syntheses/${SG.id}/modes/adversarial/run`, { param: "Кант" });
  ok(r.status === 403 && r.json.code === "QUOTA_EXCEEDED", "4) без баланса → QUOTA_EXCEEDED (подписка есть, квоты нет)");
  wsG.ws.close();

  /* ── Admin: routes/prompts ──────────────────────────────────────────── */
  console.log("\n── routes/prompts (admin) ──");
  r = await api(G, "GET", "/prompts");
  ok(r.status === 403 && r.json.code === "FORBIDDEN", "не-админ → 403");
  await db.update(users).set({ role: "admin" }).where(eq(users.id, G.id));
  r = await api(G, "GET", "/prompts?prefix=mode.");
  ok(r.status === 200 && r.json.templates.length === 3 && r.json.templates.every((t) => t.key.startsWith("mode.") && t.isActive), "GET /prompts?prefix=mode. → 3 активных", r.json?.templates?.length);
  const KEY = "mode.adversarial"; // ФАКТ: ключ без суффикса .prompt (04 §2.7 пишет mode.{…}.prompt — расхождение)
  const original = await getTemplate(KEY);
  r = await api(G, "POST", `/prompts/${KEY}`, { body: "" });
  ok(r.status === 400, "POST пустое тело → 400");
  r = await api(G, "POST", `/prompts/${KEY}`, { body: original + "\n<!-- v61 -->", description: "тест 6.1" });
  ok(r.status === 201 && r.json.template.version === 2 && r.json.template.isActive === false && r.json.template.createdBy === G.id, "POST → черновик v2 (неактивен, createdBy)");
  r = await api(G, "GET", `/prompts/${KEY}/versions`);
  ok(r.status === 200 && r.json.versions.length === 2 && r.json.versions[0].version === 2 && r.json.versions[1].isActive === true, "GET versions: две, новые первыми, активна v1");
  ok((await getTemplate(KEY)) === original, "getTemplate до активации — прежнее тело");
  r = await api(G, "POST", `/prompts/${KEY}/activate`, { version: 2 });
  ok(r.status === 200 && r.json.template.isActive && r.json.template.version === 2, "activate v2");
  ok((await getTemplate(KEY)) === original + "\n<!-- v61 -->", "getTemplate после активации — новое тело (кэш сброшен)");
  r = await api(G, "POST", `/prompts/${KEY}/activate`, { version: 9 });
  ok(r.status === 404, "activate несуществующей версии → 404");
  r = await api(G, "POST", `/prompts/${KEY}/activate`, { version: 1 });
  ok(r.status === 200 && (await getTemplate(KEY)) === original, "откат на v1");
  await db.delete(promptTemplates).where(and(eq(promptTemplates.key, KEY), eq(promptTemplates.version, 2)));
  ok((await getTemplate(KEY)) === original && (await api(G, "GET", `/prompts/${KEY}/versions`)).json.versions.length === 1, "уборка: v2 удалена, v1 активна");
  r = await api(G, "GET", "/configs");
  ok(r.status === 200 && r.json.configs.length === 27 && r.json.configs.find((c) => c.key === "mode_deps")?.value, "GET /configs → 27 активных со значениями");
  r = await api(G, "PUT", "/configs/mode_deps", { value: { test: 1 }, description: "черновик 6.1" });
  ok(r.status === 201 && r.json.config.version === 2 && r.json.config.isActive === false, "PUT /configs/:key → черновик v2");
  r = await api(G, "GET", "/configs/mode_deps/versions");
  ok(r.status === 200 && r.json.versions.length === 2, "GET /configs/:key/versions → 2");
  r = await api(G, "POST", "/configs/mode_deps/activate", { version: 2 });
  ok(r.status === 200 && r.json.config.isActive && J(r.json.config.value) === J({ test: 1 }), "activate конфига v2");
  const { getConfig, invalidateCache } = await import("../server/services/prompt-registry.js");
  ok(J(await getConfig("mode_deps")) === J({ test: 1 }), "getConfig отдаёт новое значение (кэш сброшен)");
  r = await api(G, "POST", "/configs/mode_deps/activate", { version: 1 });
  ok(r.status === 200 && J(await getConfig("mode_deps")) !== J({ test: 1 }), "откат конфига на v1");
  await db.delete(schema.synthesisConfigs).where(and(eq(schema.synthesisConfigs.key, "mode_deps"), eq(schema.synthesisConfigs.version, 2)));
  await invalidateCache("mode_deps");
  r = await api(G, "GET", "/prompts/bad key!/versions");
  ok(r.status === 400, "невалидный ключ → 400");
  r = await api(G, "GET", "/prompts/nope.nope/versions");
  ok(r.status === 404, "неизвестный ключ → 404");

  /* ── Уборка ─────────────────────────────────────────────────────────── */
  wsA.ws.close(); wsB.ws.close();
  for (const u of [A, B, C, D, E, F, G]) {
    await db.delete(syntheses).where(eq(syntheses.userId, u.id));
    await db.delete(apiUsage).where(eq(apiUsage.userId, u.id));
    await db.delete(transactions).where(eq(transactions.userId, u.id));
    await db.delete(users).where(eq(users.id, u.id));
  }
  await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, plan.id));
  void prevSecret;
} catch (e) {
  failed++; fails.push("ИСКЛЮЧЕНИЕ: " + (e?.stack ?? e));
  console.error(e);
  console.error("--- server log tail ---\n" + serverLog.slice(-3000));
} finally {
  killGroup(serverProc);
  claudeSrv?.close(); stripeSrv?.close();
  await closeDb().catch(() => {});
  await closeRedis().catch(() => {});
  console.log(`\n${passed} ✓ / ${failed} ✗`);
  if (fails.length) console.log("Провалы:\n  - " + fails.join("\n  - "));
  process.exit(failed ? 1 : 0);
}
