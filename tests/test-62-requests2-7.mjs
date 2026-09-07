/**
 * Тестовые запросы 2–7 беседы 6.2 (Billing UI + Admin Prompts Page) —
 * одним заходом, в браузере (puppeteer-core + системный Chrome) против
 * живого сервера (BILLING_ENFORCE=true) с моком Claude SSE и моком Stripe
 * REST (харнесс test-61; без VITE_STRIPE_PUBLISHABLE_KEY страница
 * биллинга работает в dev-режиме подтверждения платежа сервером):
 *  R2  BYO-Key UI: «не задан» → невалидный ключ → ошибка → валидный →
 *      маска prefix+•••, «активен» → удалить (confirm) → «не задан».
 *  R3  Пополнение: $5 → «Пополнить» → «Подтвердить платёж» (мок PI
 *      succeeded) → баланс $5.00 → транзакция «пополнение» в таблице →
 *      GET /auth/me тот же баланс.
 *  R4  История использования: 3 операции (2 на S1, 1 на S2, режим
 *      balance) → таблица 3 строки → фильтр по S1 → 2 → итоги tfoot ≡
 *      сумме строк ≡ GET /usage → разбивка по режимам; транзакции
 *      «списание».
 *  R5  AdminPromptsPage: admin → шаблон «system» → правка → черновик v2
 *      (не активен) → активировать → getTemplate отдаёт новое тело →
 *      операция уходит в Claude с новым system → «Откатить» v1 → старое.
 *  R6  Diff: ⇄ на v1 при выбранной v2 → .diff-line.del/.add с маркером;
 *      конфиги: невалидный JSON → .invalid/err → валидный → черновик →
 *      активация → getConfig отдаёт новое значение.
 *  R7  Доступ: обычный пользователь → /admin/prompts → redirect /catalog,
 *      в Sidebar нет «Промпты»; серверный роут → 403.
 *  R8  (5b) Подписка: тариф → «Оформить» → «ожидает оплаты» → webhook
 *      invoice.paid → «Обновить» → «активна», квоты → отмена → флаг →
 *      возобновление.
 *  R9  (п. 6) PauseModal auth: BYO-ключ, который мок отвергает (401) →
 *      генерация в паузе → форма ключа → «Сохранить и продолжить» →
 *      новый ключ активен → генерация завершена.
 * Запуск: node_modules/.bin/tsx tests/test-62-requests2-7.mjs > /tmp/t62.log 2>&1 &
 * (PG16 + Redis должны быть подняты; ≈ 3 мин)
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import puppeteer from "puppeteer-core";

const SERVER_PORT = 3000;
const VITE_PORT = 5199;
const MOCK_PORT = 3855;
const STRIPE_PORT = 3866;
const UI = `http://localhost:${VITE_PORT}`;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const DB_URL = "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const ENC_SECRET = "test-encryption-secret-62";
const WH_SECRET = "whsec_test_62";
const SERVER_KEY = "sk-ant-server-key-62";
const CHROME = process.env.CHROME_PATH ?? "/opt/google/chrome/chrome";
const BAD_USER_KEY = "sk-ant-api03-BAD-" + "b".repeat(60);
const GOOD_USER_KEY = "sk-ant-api03-GOOD-" + "g".repeat(60);

process.env.DATABASE_URL ??= DB_URL;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.ANTHROPIC_API_KEY = SERVER_KEY;
process.env.API_KEY_ENCRYPTION_SECRET = ENC_SECRET;
process.env.STRIPE_WEBHOOK_SECRET = WH_SECRET;
process.env.BILLING_ENFORCE = "true";

let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
const J = (x) => JSON.stringify(x);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const pageErrors = [], consoleErrors = [];

const { db, closeDb } = await import("../server/db/index.js");
const schema = await import("../server/db/schema.js");
const { closeRedis } = await import("../server/redis.js");
const { saveGraphToDb, parseGraphFromHTML } = await import("../server/services/graph-parser.js");
const { parseThesesFromHTML, saveElementsToDb } = await import("../server/services/element-parser.js");
const { getTemplate, getConfig, invalidateCache } = await import("../server/services/prompt-registry.js");
const { signWebhookPayload } = await import("../server/services/stripe-client.js");
const { and, desc, eq, like } = await import("drizzle-orm");
const { users, syntheses, synthesisLineage, sections, apiUsage, transactions, subscriptionPlans, userSubscriptions, promptTemplates, synthesisConfigs } = schema;

/* ══ Фикстура синтеза (как 6.1) ═══════════════════════════════════════ */
const secWrap = (num, title, inner) =>
  `<div class="doc-section"><div class="section-num">§ ${num}</div>` +
  `<div class="section-title">${title}</div><div class="doc-content">${inner}</div></div>`;
const sub = (name, inner) => `<div data-section="${name}"><h4>${name}</h4>${inner}</div>`;
const tbl = (heads, rows) =>
  `<table class="doc-table"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` +
  `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const CAT_NAMES = ["Бытие", "Становление", "Ничто", "Логос"];
const CAT_TYPES = ["онтологическая", "метафизическая", "онтологическая", "логическая"];
function graphHtml(names, types, num = 2) {
  const cats = names.map((n, i) => [n, types[i % types.length], `Определение ${n}`, "0.6", "0.7", `Источник ${n}`]);
  const edges = names.slice(1).map((n, i) => [names[i], `${names[i]} обусловливает ${n}`, n, i % 2 ? "каузальная" : "диалектическая", "однонаправленная", "0.8"]);
  const topo = names.map((n, i) => [n, i < 2 ? "Ядро" : "Горизонт", i === 0 ? "центральная" : "", i % 2 ? "тезис" : "антитезис", ""]);
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
    { f: "Логос открывает истину.", type: "эпистемологический", cats: "Логос" },
  ];
  return secWrap(num, "Корпус тезисов",
    sub("Онтологические тезисы", `<p><strong>${items[0].f}</strong> Обоснование.</p>`) +
    sub("Эпистемологические тезисы", `<p><strong>${items[1].f}</strong> Обоснование.</p>`) +
    sub("Сводная таблица тезисов", tbl(["№", "Формулировка тезиса", "Тип", "Степень новизны", "Связанные категории"],
      items.map((t, i) => [String(i + 1), t.f, t.type, "средняя", t.cats]))));
}
async function makeSynthesis(userId, title) {
  const [s] = await db.insert(syntheses).values({
    userId, seed: "зерно 6.2", sectionOrder: ["sum", "graph", "theses"], status: "ready", title,
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

/* ══ Мок Claude SSE: пишет x-api-key и system; BAD_USER_KEY → 401 ═════ */
const claude = { calls: [] };
function startClaudeMock() {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      let prompt = "", system = "";
      try { const b = JSON.parse(body); prompt = b.messages?.[0]?.content ?? ""; system = typeof b.system === "string" ? b.system : J(b.system ?? ""); } catch {}
      const apiKey = req.headers["x-api-key"];
      claude.calls.push({ apiKey, system, promptHead: prompt.slice(0, 80) });
      if (apiKey === BAD_USER_KEY) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(J({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
        return;
      }
      const html = /ГРАФ КАТЕГОРИЙ|граф категорий/i.test(prompt) && /Таблица категорий/.test(prompt)
        ? graphHtml(CAT_NAMES, CAT_TYPES, 2)
        : /КОРПУС ТЕЗИСОВ/i.test(prompt) ? thesesHtml(3)
          : `<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">Ответ</div><div class="doc-content">${sub("Ответ мока", "<p>" + "Текст ответа мока. ".repeat(40) + "</p>")}</div></div>`;
      const inTok = Math.ceil(prompt.length / 4), outTok = Math.ceil(html.length / 4);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (o) => res.write(`data: ${J(o)}\n\n`);
      send({ type: "message_start", message: { usage: { input_tokens: inTok } } });
      for (let i = 0; i < html.length; i += 400) { send({ type: "content_block_delta", delta: { type: "text_delta", text: html.slice(i, i + 400) } }); await sleep(2); }
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: outTok } });
      send({ type: "message_stop" });
      res.end();
    });
  });
  return new Promise((r) => srv.listen(MOCK_PORT, "127.0.0.1", () => r(srv)));
}

/* ══ Мок Stripe REST (PaymentIntent сразу succeeded — оплата «в Elements» вне стенда) ═ */
const stripeState = { pis: new Map(), subs: new Map(), customers: [] };
const nowSec = () => Math.floor(Date.now() / 1000);
function parseForm(body) {
  const out = {};
  for (const [k, v] of new URLSearchParams(body)) {
    const path = k.replace(/\]/g, "").split("[");
    let cur = out;
    path.forEach((p, i) => { if (i === path.length - 1) cur[p] = v; else cur = cur[p] ??= {}; });
  }
  return out;
}
function startStripeMock() {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(J(obj)); };
      if (req.headers.authorization !== "Bearer sk_test_mock62") return send(401, { error: { message: "bad key" } });
      const form = parseForm(body);
      const u = req.url;
      let m;
      if (req.method === "POST" && u === "/v1/payment_intents") {
        const id = `pi_${stripeState.pis.size + 1}`;
        const pi = { id, object: "payment_intent", amount: Number(form.amount), currency: form.currency, status: "succeeded", client_secret: `${id}_secret`, metadata: form.metadata ?? {} };
        stripeState.pis.set(id, pi); return send(200, pi);
      }
      if (req.method === "GET" && (m = u.match(/^\/v1\/payment_intents\/([^/?]+)/))) {
        const pi = stripeState.pis.get(m[1]); return pi ? send(200, pi) : send(404, { error: { message: "No such payment_intent", code: "resource_missing" } });
      }
      if (req.method === "POST" && u === "/v1/customers") {
        const c = { id: `cus_${stripeState.customers.length + 1}`, object: "customer", email: form.email, metadata: form.metadata ?? {} };
        stripeState.customers.push(c); return send(200, c);
      }
      if (req.method === "POST" && u === "/v1/subscriptions") {
        const id = `sub_${stripeState.subs.size + 1}`;
        const s = { id, object: "subscription", customer: form.customer, status: "incomplete", current_period_start: nowSec(), current_period_end: nowSec() + 30 * 86400,
          cancel_at_period_end: false, metadata: form.metadata ?? {}, items: form.items,
          latest_invoice: { id: `in_${id}`, object: "invoice", subscription: id, payment_intent: { id: `pi_${id}`, object: "payment_intent", status: "requires_payment_method", client_secret: `pi_${id}_secret` } } };
        stripeState.subs.set(id, s); return send(200, s);
      }
      if ((m = u.match(/^\/v1\/subscriptions\/([^/?]+)/))) {
        const s = stripeState.subs.get(m[1]);
        if (!s) return send(404, { error: { message: "No such subscription", code: "resource_missing" } });
        if (req.method === "POST" && form.cancel_at_period_end !== undefined) s.cancel_at_period_end = form.cancel_at_period_end === "true";
        return send(200, s);
      }
      send(404, { error: { message: `unknown ${u}` } });
    });
  });
  return new Promise((r) => srv.listen(STRIPE_PORT, "127.0.0.1", () => r(srv)));
}

/* ══ Процессы ═════════════════════════════════════════════════════════ */
let serverProc, viteProc, browser, claudeSrv, stripeSrv;
let serverLog = "", viteLog = "";
async function assertPortFree(url, name) {
  try { const r = await fetch(url); if (r.ok) throw new Error(`порт занят чужим ${name}`); }
  catch (e) { if (String(e).includes("порт занят")) throw e; }
}
async function startServer() {
  await assertPortFree(`${API}/health`, "сервером");
  serverProc = spawn(process.execPath, ["--import", "tsx", "index.ts"], {
    cwd: new URL("../server/", import.meta.url).pathname,
    env: {
      ...process.env, PORT: String(SERVER_PORT), DATABASE_URL: DB_URL, REDIS_URL: "redis://localhost:6379",
      CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000",
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: SERVER_KEY,
      STRIPE_SECRET_KEY: "sk_test_mock62", STRIPE_API_BASE: `http://127.0.0.1:${STRIPE_PORT}`, STRIPE_WEBHOOK_SECRET: WH_SECRET,
      API_KEY_ENCRYPTION_SECRET: ENC_SECRET, BILLING_ENFORCE: "true", BILLING_MIN_RESERVE_USD: "0.05", BILLING_MARKUP: "1.2",
      STREAM_RETRY_DELAYS: "50",
    },
    stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  serverProc.stdout.on("data", (d) => (serverLog += d));
  serverProc.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`${API}/health`)).ok) return; } catch {} await sleep(300); }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-2000));
}
async function startVite() {
  await assertPortFree(UI + "/", "vite");
  viteProc = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort"], {
    cwd: new URL("../client/", import.meta.url).pathname,
    env: { ...process.env, VITE_STRIPE_PUBLISHABLE_KEY: "" }, stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  viteProc.stdout.on("data", (d) => (viteLog += d));
  viteProc.stderr.on("data", (d) => (viteLog += d));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(UI + "/")).ok) return; } catch {} await sleep(300); }
  throw new Error("vite не поднялся:\n" + viteLog.slice(-2000));
}
const killGroup = (p) => { if (!p) return; try { process.kill(-p.pid, "SIGKILL"); } catch {} try { p.kill("SIGKILL"); } catch {} };

async function makeUser(tag) {
  const email = `t62-${tag}-${Date.now()}@test.local`;
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
const webhook = async (event) => {
  const raw = J({ id: `evt_${Math.random().toString(36).slice(2)}`, object: "event", type: event.type, data: { object: event.object } });
  const r = await fetch(`${API}/billing/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signWebhookPayload(raw, WH_SECRET) }, body: raw });
  return { status: r.status, json: await r.json().catch(() => null) };
};
/** Операция под слотом: режим adversarial на фикстуре; ждём mode_result в БД (без WS) */
async function runOp(u, sid) {
  const before = (await db.select().from(apiUsage).where(eq(apiUsage.userId, u.id))).length;
  const r = await api(u, "POST", `/syntheses/${sid}/modes/adversarial/run`, { param: "Кант" });
  if (r.status !== 200) return r;
  for (let i = 0; i < 300; i++) {
    const n = (await db.select().from(apiUsage).where(eq(apiUsage.userId, u.id))).length;
    if (n > before) { await sleep(400); return r; }
    await sleep(100);
  }
  throw new Error("операция не учтена за 30 с");
}

/* ══ Хелперы браузера ═════════════════════════════════════════════════ */
const T = (id) => `[data-testid="${id}"]`;
async function fill(page, sel, value) {
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.click(sel);
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (value) await page.type(sel, value);
}
const text = (page, sel) => page.$eval(sel, (el) => el.innerText.replace(/\s+/g, " ").trim()).catch(() => null);
const waitText = async (page, sel, re, timeout = 15000) => {
  await page.waitForFunction((s, r) => { const el = document.querySelector(s); return !!el && new RegExp(r, "i").test(el.innerText); }, { timeout }, sel, re.source ?? re);
  return text(page, sel);
};
const exists = (page, sel) => page.$(sel).then((h) => !!h);
/** Клик через DOM (списки перерисовываются React — handle puppeteer может отвязаться) */
const clickDom = (page, sel) => page.$eval(sel, (el) => el.click());
const navTexts = (page) => page.$$eval(".app-sidebar-desktop .app-nav-link", (as) => as.map((a) => a.innerText.trim()));
async function rows(page, tableSel) {
  return page.$$eval(`${tableSel} tbody tr`, (trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.trim())));
}
const money = (s) => Number(String(s).replace(/[^\d.,−-]/g, "").replace(",", ".").replace("−", "-"));
const intOf = (s) => Number(String(s).replace(/[^\d]/g, ""));

/* ══ Прогон ═══════════════════════════════════════════════════════════ */
try {
  // шаблон system — только v1 (следы прогонов админки), конфиг context_budget — тоже
  const cleanupVersions = async () => {
    for (const [table, key] of [[promptTemplates, "system"], [synthesisConfigs, "context_budget"]]) {
      const rows0 = await db.select().from(table).where(eq(table.key, key)).orderBy(desc(table.version));
      const v1 = rows0.find((r) => r.version === 1);
      if (v1 && !v1.isActive) await db.update(table).set({ isActive: true }).where(eq(table.id, v1.id));
      for (const r of rows0.filter((r) => r.version > 1)) await db.delete(table).where(eq(table.id, r.id));
    }
    await invalidateCache("system"); await invalidateCache("context_budget");
  };
  await cleanupVersions();
  for (const stale of await db.select({ id: users.id }).from(users).where(like(users.email, "t62-%"))) {
    await db.delete(userSubscriptions).where(eq(userSubscriptions.userId, stale.id));
    // prompt_templates.created_by → users без ON DELETE SET NULL (дыра 02 §2.17): черновики админа держат пользователя
    await db.update(promptTemplates).set({ createdBy: null }).where(eq(promptTemplates.createdBy, stale.id));
    await db.delete(syntheses).where(eq(syntheses.userId, stale.id));
    await db.delete(apiUsage).where(eq(apiUsage.userId, stale.id));
    await db.delete(transactions).where(eq(transactions.userId, stale.id));
    await db.delete(users).where(eq(users.id, stale.id));
  }
  const SYSTEM_V1 = await getTemplate("system");

  claudeSrv = await startClaudeMock();
  stripeSrv = await startStripeMock();
  await startServer();
  await startVite();
  console.log("Моки, сервер и vite подняты.");

  const A = await makeUser("user");
  const B = await makeUser("stranger");
  const ADM = await makeUser("admin");
  await db.update(users).set({ role: "admin" }).where(eq(users.id, ADM.id));
  const S1 = await makeSynthesis(A.id, "Синтез Один");
  const S2 = await makeSynthesis(A.id, "Синтез Два");

  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push("console: " + m.text()); });
  let dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); void d.accept(); });
  const login = async (u) => {
    await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
    await fill(page, "input[type=email]", u.email);
    await fill(page, "input[type=password]", u.password);
    await page.click("button[type=submit]");
    await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 20000 });
  };
  const logout = async () => { await page.evaluate(() => fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" })); await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" }); };
  const openBilling = async () => {
    await page.goto(`${UI}/billing`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(T("billing-page"), { timeout: 20000 });
    await page.waitForFunction(() => { const el = document.querySelector('[data-testid="billing-api-key"]'); return el && !/Загрузка…/.test(el.innerText); }, { timeout: 20000 });
  };

  await login(A);

  /* ══ R2: BYO-Key UI ══ */
  console.log("\n■ R2: BYO-Key UI");
  await openBilling();
  ok(await exists(page, T("api-key-absent")), "начально: «не задан»");
  ok(/не задан/i.test(await text(page, T("api-key-absent"))), "статус «не задан» в маске");
  await fill(page, "#billing-new-key", "bad-key");
  await page.click(T("api-key-save"));
  await waitText(page, `${T("billing-api-key")} .pool-status.err`, /ключ|формат|sk-ant/i);
  ok(true, "невалидный ключ → ошибка (400 + details.key) показана");
  await fill(page, "#billing-new-key", GOOD_USER_KEY);
  await page.click(T("api-key-save"));
  await page.waitForSelector(T("api-key-masked"), { timeout: 15000 });
  const masked = await text(page, T("api-key-masked"));
  ok(masked.startsWith(GOOD_USER_KEY.slice(0, 14)) && masked.includes("••••") && !masked.includes("GOOD-g"), "после сохранения: prefix + маска, ключ не раскрыт", masked);
  ok(/активен/i.test(masked), "статус «активен»");
  ok((await page.$eval("#billing-new-key", (el) => el.value)) === "", "поле ввода очищено");
  ok((await page.$eval("#billing-new-key", (el) => el.type)) === "password", "input type=password");
  const keysApi = await api(A, "GET", "/billing/api-key");
  ok(keysApi.json.keys.length === 1 && keysApi.json.keys[0].isActive, "GET /api-key: одна активная запись");
  dialogs = [];
  await page.click(T("api-key-delete"));
  await page.waitForSelector(T("api-key-absent"), { timeout: 15000 });
  ok(dialogs.length === 1 && /удалить/i.test(dialogs[0]), "удаление — через confirm");
  ok(/не задан/i.test(await text(page, T("api-key-absent"))), "после удаления — «не задан»");
  ok((await api(A, "GET", "/billing/api-key")).json.keys.every((k) => !k.isActive), "GET /api-key: активных нет");

  /* ══ R3: пополнение ══ */
  console.log("\n■ R3: пополнение $5");
  ok(money(await text(page, T("balance-value"))) === 0, "баланс $0.00 до пополнения");
  ok((await page.$eval(T("amount-5"), (el) => el.className)).includes("active"), "$5 выбрано по умолчанию");
  await page.click(T("amount-5"));
  ok(/\$5\.00/.test(await text(page, T("topup-start"))), "кнопка «Пополнить на $5.00»");
  await page.click(T("topup-start"));
  await page.waitForSelector(T("topup-confirm-dev"), { timeout: 15000 });
  ok(stripeState.pis.size === 1 && [...stripeState.pis.values()][0].amount === 500, "POST /topup → Stripe PaymentIntent 500 центов");
  ok(/тестовый режим|VITE_STRIPE/i.test(await text(page, T("billing-balance"))), "без publishable key — подсказка о dev-режиме");
  await page.click(T("topup-confirm-dev"));
  await waitText(page, T("balance-value"), /\$5\.00/);
  ok(true, "после подтверждения баланс $5.00");
  ok(/пополнен на \$5\.00/i.test(await text(page, `${T("billing-balance")} .pool-status.ok`)), "статус «Баланс пополнен на $5.00»");
  const me = await api(A, "GET", "/auth/me");
  ok(near(me.json.user.balanceUsd, 5), "GET /auth/me: balanceUsd = 5");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="tx-table"] tbody tr').length >= 1, { timeout: 15000 });
  const tx1 = await rows(page, T("tx-table"));
  ok(tx1.length === 1 && /пополнение/i.test(tx1[0][1]) && money(tx1[0][3]) === 5 && money(tx1[0][4]) === 5, "транзакция «пополнение» $5.00 / баланс после $5.00 в таблице", J(tx1));
  ok(!(await exists(page, T("amount-choice"))) === false || (await exists(page, T("amount-choice"))), "форма суммы снова доступна");
  // невалидная своя сумма
  await fill(page, T("amount-custom"), "0.5");
  ok(await page.$eval(T("topup-start"), (el) => el.disabled), "своя сумма 0.5 → «Пополнить» неактивна (1 ≤ сумма ≤ 1000)");
  await fill(page, T("amount-custom"), "2000");
  ok(await page.$eval(T("topup-start"), (el) => el.disabled), "2000 → неактивна");

  /* ══ R4: история использования ══ */
  console.log("\n■ R4: история использования");
  for (const sid of [S1.id, S1.id, S2.id]) { const r = await runOp(A, sid); ok(r.status === 200, `операция (режим) на ${sid === S1.id ? "S1" : "S2"} → 200`); }
  const usageAll = await api(A, "GET", "/billing/usage");
  ok(usageAll.json.entries.length === 3 && usageAll.json.entries.every((e) => e.billingMode === "balance"), "GET /usage: 3 строки режима balance");
  await openBilling();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="usage-table"] tbody tr').length === 3, { timeout: 20000 });
  const u3 = await rows(page, T("usage-table"));
  ok(u3.length === 3, "таблица: 3 строки");
  ok(u3.every((r) => /баланс/i.test(r[6])), "колонка «Режим» — «баланс»");
  ok(u3.every((r) => /Синтез (Один|Два)/.test(r[1])), "колонка «Синтез» — заголовок из каталога", J(u3.map((r) => r[1])));
  ok(u3.every((r) => r[2] === "mode:adversarial"), "колонка «Раздел» — служебный ключ как есть", J(u3.map((r) => r[2])));
  const tot = await page.$$eval(`${T("usage-totals")} td`, (tds) => tds.map((td) => td.innerText.trim()));
  const sumIn = u3.reduce((s, r) => s + intOf(r[3]), 0), sumOut = u3.reduce((s, r) => s + intOf(r[4]), 0), sumCost = u3.reduce((s, r) => s + money(r[5]), 0);
  ok(intOf(tot[1]) === sumIn && intOf(tot[2]) === sumOut && near(money(tot[3]), sumCost, 0.0002), "итоги tfoot ≡ сумме строк", J(tot));
  ok(intOf(tot[1]) === usageAll.json.totals.inputTokens && intOf(tot[2]) === usageAll.json.totals.outputTokens && near(money(tot[3]), usageAll.json.totals.costUsd, 0.0001), "итоги tfoot ≡ GET /usage totals");
  ok(/3 запросов/.test(tot[0]), "итоги: «3 запросов»");
  ok(/баланс — 3 запр\./.test(await text(page, T("usage-by-mode"))), "разбивка по режимам: баланс — 3 запр.");
  await page.select(T("usage-synthesis-filter"), S1.id);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="usage-table"] tbody tr').length === 2, { timeout: 20000 });
  const u2 = await rows(page, T("usage-table"));
  ok(u2.length === 2 && u2.every((r) => r[1] === "Синтез Один"), "фильтр по синтезу S1 → 2 строки");
  const usageS1 = await api(A, "GET", `/billing/usage?synthesisId=${S1.id}`);
  const tot2 = await page.$$eval(`${T("usage-totals")} td`, (tds) => tds.map((td) => td.innerText.trim()));
  ok(intOf(tot2[1]) === usageS1.json.totals.inputTokens && near(money(tot2[3]), usageS1.json.totals.costUsd, 0.0001), "итоги по фильтру ≡ GET /usage?synthesisId");
  await page.select(T("usage-period-filter"), "custom");
  await page.waitForSelector(`${T("billing-usage")} input[type=date]`, { timeout: 5000 });
  ok(true, "«Свой период» показывает поля дат");
  const txAll = await rows(page, T("tx-table"));
  ok(txAll.length === 4 && txAll.filter((r) => /списание/i.test(r[1])).length === 3 && txAll.every((r) => !/списание/i.test(r[1]) || money(r[3]) < 0), "транзакции: 3 «списания» отрицательными + пополнение");
  const balNow = money(await text(page, T("balance-value")));
  const txApi = await api(A, "GET", "/billing/transactions?limit=50");
  const lastTx = txApi.json.items[0];
  ok(balNow < 5 && near(balNow, Number(lastTx.balanceAfter.toFixed(2)), 0.005) && near(5 - balNow, txApi.json.items.filter((t) => t.type === "usage").reduce((a, t) => a + Math.abs(t.amountUsd), 0), 0.005), "баланс уменьшился на сумму списаний (= последняя balanceAfter)", `${balNow} vs ${lastTx.balanceAfter}`);

  /* ══ R7: доступ обычного пользователя ══ */
  console.log("\n■ R7: доступ к /admin/prompts");
  const navA = await navTexts(page);
  ok(navA.length >= 4 && !navA.some((t) => /промпты/i.test(t)), "Sidebar: у пользователя нет «Промпты»", J(navA));
  await page.goto(`${UI}/admin/prompts`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 15000 });
  ok(true, "обычный пользователь → /admin/prompts → redirect /catalog");
  ok((await api(A, "GET", "/prompts")).status === 403, "серверный GET /prompts → 403 FORBIDDEN");
  ok((await api(B, "GET", "/configs")).status === 403, "серверный GET /configs → 403 у другого пользователя");

  /* ══ R5: AdminPromptsPage ══ */
  console.log("\n■ R5: AdminPromptsPage — черновик → активация → генерация → откат");
  await logout();
  await login(ADM);
  await page.waitForFunction(() => [...document.querySelectorAll(".app-sidebar-desktop .app-nav-link")].some((a) => /промпты/i.test(a.innerText)), { timeout: 10000 }).catch(() => {});
  const navAdm = await navTexts(page);
  ok(navAdm.some((t) => /промпты/i.test(t)), "Sidebar: у админа есть «Промпты»", J(navAdm));
  await page.goto(`${UI}/admin/prompts`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(T("template-tree"), { timeout: 20000 });
  const nKeys0 = await page.$$eval(`${T("template-tree")} .key-tree-item`, (els) => els.length);
  ok(nKeys0 >= 200, `дерево ключей: ${nKeys0} активных шаблонов`, String(nKeys0));
  ok((await page.$$eval(`${T("template-tree")} .key-tree-group`, (els) => els.map((e) => e.innerText))).some((g) => /^method\.dialectical$/i.test(g)), "группа «method.dialectical» в дереве");
  await fill(page, T("template-search"), "system");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="template-tree"] .key-tree-item').length < 20, { timeout: 5000 });
  const found = await page.$$eval(`${T("template-tree")} .key-tree-item`, (els) => els.map((e) => e.dataset.key));
  ok(found.includes("system") && found.every((k) => /system/.test(k)), "поиск «system» сужает дерево", J(found));
  await page.click(`${T("template-tree")} .key-tree-item[data-key="system"]`);
  await page.waitForSelector(T("template-body"), { timeout: 15000 });
  const body0 = await page.$eval(T("template-body"), (el) => el.value);
  ok(body0 === SYSTEM_V1, "редактор показывает активное тело «system»");
  const chips = await page.$$eval(`${T("placeholder-chips")} .placeholder-chip`, (els) => els.map((e) => e.innerText));
  ok(chips.includes("{{lang_instruction}}") && chips.includes("{{participants_note}}"), "чипы плейсхолдеров system", J(chips));
  ok(new RegExp(`плейсхолдеры распознаны: ${chips.length}`, "i").test(await text(page, T("placeholder-status"))), `статус: плейсхолдеры распознаны: ${chips.length}`, await text(page, T("placeholder-status")));
  const prev = await text(page, T("template-preview"));
  ok(prev.includes("Пиши на русском языке.") && !prev.includes("{{lang_instruction}}"), "предпросмотр подставляет тестовые значения");
  ok(await page.$eval(T("template-activate"), (el) => el.disabled), "«Активировать» неактивна для уже активной версии без правок");
  const MARK = " МАРКЕР-6.2-ТЕСТ";
  await page.focus(T("template-body"));
  await page.keyboard.down("Control"); await page.keyboard.press("End"); await page.keyboard.up("Control");
  await page.keyboard.type(MARK);
  ok(/сохранить и активировать/i.test(await text(page, T("template-activate"))), "правка → кнопка «Сохранить и активировать»", await text(page, T("template-activate")));
  ok(await exists(page, ".inline-edit-dirty"), "метка «не сохранено»");
  await fill(page, T("template-description"), "черновик теста 6.2");
  await page.click(T("template-save-draft"));
  await waitText(page, `${T("templates-tab")} .pool-status.ok`, /черновик сохранён как v2/i);
  ok(true, "черновик → v2");
  await page.waitForSelector(`${T("version-list")} .version-item[data-version="2"]`, { timeout: 15000 });
  const v2row = (await db.select().from(promptTemplates).where(and(eq(promptTemplates.key, "system"), eq(promptTemplates.version, 2))))[0];
  ok(v2row && !v2row.isActive && v2row.body.endsWith(MARK) && v2row.description === "черновик теста 6.2", "БД: v2 не активна, тело с маркером, описание");
  ok((await getTemplate("system")) === SYSTEM_V1, "getTemplate после черновика — прежнее тело");
  const vlist = await page.$$eval(`${T("version-list")} .version-item`, (els) => els.map((e) => ({ v: e.dataset.version, cur: e.classList.contains("current"), sel: e.classList.contains("selected") })));
  ok(vlist.length === 2 && vlist[0].v === "2" && !vlist[0].cur && vlist[0].sel && vlist[1].cur, "список версий: v2 выбрана, v1 активна", J(vlist));
  ok(!(await page.$eval(T("template-activate"), (el) => el.disabled)) && /^активировать$/i.test(await text(page, T("template-activate"))), "«Активировать» доступна для черновика v2", await text(page, T("template-activate")));
  await page.click(T("template-activate"));
  await waitText(page, `${T("templates-tab")} .pool-status.ok`, /v2 шаблона «system» активирована/i);
  ok((await getTemplate("system")) === SYSTEM_V1 + MARK, "getTemplate отдаёт v2 (кэш сброшен)");
  const before = claude.calls.length;
  await runOp(A, S2.id);
  ok(claude.calls.length > before && claude.calls[before].system.includes(MARK), "генерация использует новый system (маркер в system мока)");
  ok(/v2 · активна/i.test(await text(page, `${T("templates-tab")} .form-group:nth-child(2) .form-label`)), "шапка редактора: v2 · активна", await text(page, `${T("templates-tab")} .form-group:nth-child(2) .form-label`));
  dialogs = [];
  await clickDom(page, T("rollback-v1"));
  await waitText(page, `${T("templates-tab")} .pool-status.ok`, /v1 шаблона «system» активирована/i);
  await page.waitForFunction(() => document.querySelector('.version-item[data-version="1"]')?.classList.contains("current"), { timeout: 15000 });
  ok(dialogs.length === 1, "откат — через confirm");
  ok((await getTemplate("system")) === SYSTEM_V1, "после отката getTemplate = v1");
  ok((await page.$eval(T("template-body"), (el) => el.value)) === SYSTEM_V1, "редактор показывает v1 после отката");

  /* ══ R6: diff + конфиги ══ */
  console.log("\n■ R6: diff двух версий; JSON-конфиг");
  await clickDom(page, `${T("version-list")} .version-item[data-version="2"]`);
  await page.waitForFunction(() => document.querySelector('.version-item[data-version="2"]')?.classList.contains("selected"), { timeout: 5000 });
  await clickDom(page, T("compare-v1"));
  await page.waitForSelector(T("diff-view"), { timeout: 5000 });
  const diff = await page.$$eval(`${T("diff-view")} .diff-line`, (els) => els.map((e) => ({ k: e.className.replace("diff-line ", ""), t: e.innerText })));
  ok(diff.some((l) => l.k === "del") && diff.some((l) => l.k === "add" && l.t.includes(MARK.trim())), "diff v1 → v2: строка del и add с маркером", J(diff.slice(-4)));
  ok(/v1 → v2/i.test(await text(page, `${T("diff-view")} .form-label`)) && /\+1 \/ −1/.test(await text(page, `${T("diff-view")} .form-label`)), "заголовок diff: v1 → v2 (+1 / −1)", await text(page, `${T("diff-view")} .form-label`));
  await clickDom(page, T("compare-v1"));
  ok(!(await exists(page, T("diff-view"))), "повторный ⇄ снимает сравнение");

  await page.click(T("tab-configs"));
  await page.waitForSelector(T("config-tree"), { timeout: 15000 });
  const cfgKeys = await page.$$eval(`${T("config-tree")} .key-tree-item`, (els) => els.map((e) => e.dataset.key));
  ok(cfgKeys.length === 27 && cfgKeys.includes("context_budget") && cfgKeys.includes("parent_deps.base"), `конфиги: 27 ключей`, String(cfgKeys.length));
  await page.click(`${T("config-tree")} .key-tree-item[data-key="context_budget"]`);
  await page.waitForSelector(T("config-json"), { timeout: 15000 });
  const cfg0 = await getConfig("context_budget");
  const json0 = await page.$eval(T("config-json"), (el) => el.value);
  ok(JSON.stringify(JSON.parse(json0)) === JSON.stringify(cfg0), "JSON-редактор показывает активное значение context_budget");
  ok(/✓ JSON валиден/i.test(await text(page, T("config-json-status"))), "статус ✓ JSON валиден");
  await page.focus(T("config-json"));
  await page.keyboard.down("Control"); await page.keyboard.press("End"); await page.keyboard.up("Control");
  await page.keyboard.type(",,");
  ok((await page.$eval(T("config-json"), (el) => el.className)).includes("invalid"), "невалидный JSON → .code-editor.invalid");
  ok(/✗ JSON:.*строка \d+, столбец \d+/i.test(await text(page, T("config-json-status"))) && !/line \d+ column/i.test(await text(page, T("config-json-status"))), "статус ✗ с позицией ошибки", await text(page, T("config-json-status")));
  ok(await page.$eval(T("config-save-draft"), (el) => el.disabled) && await page.$eval(T("config-activate"), (el) => el.disabled), "кнопки сохранения заблокированы при невалидном JSON");
  const newCfg = { ...cfg0, test62: 12345 };
  await fill(page, T("config-json"), "");
  await page.evaluate((sel, val) => {
    const el = document.querySelector(sel);
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, val); el.dispatchEvent(new Event("input", { bubbles: true }));
  }, T("config-json"), JSON.stringify(newCfg));
  await waitText(page, T("config-json-status"), /✓ JSON валиден/);
  ok(true, "правленый JSON валиден");
  await page.click(T("config-activate"));
  await waitText(page, `${T("configs-tab")} .pool-status.ok`, /v2 конфига «context_budget» активирована/i);
  const cfgNow = await getConfig("context_budget");
  ok(cfgNow.test62 === 12345, "«Сохранить и активировать» → getConfig отдаёт v2 (кэш сброшен)");
  const cfgVersions = await page.$$eval(`${T("configs-tab")} ${T("version-list")} .version-item`, (els) => els.map((e) => e.dataset.version + (e.classList.contains("current") ? "*" : "")));
  ok(JSON.stringify(cfgVersions) === JSON.stringify(["2*", "1"]), "версии конфига: v2 активна, v1", J(cfgVersions));
  await clickDom(page, T("compare-v1"));
  await page.waitForSelector(`${T("configs-tab")} ${T("diff-view")}`, { timeout: 5000 });
  const cdiff = await page.$$eval(`${T("configs-tab")} ${T("diff-view")} .diff-line.add`, (els) => els.map((e) => e.innerText));
  ok(cdiff.some((t) => /test62/.test(t)), "diff конфигов показывает добавленное поле");
  dialogs = [];
  await clickDom(page, `${T("configs-tab")} ${T("rollback-v1")}`);
  await waitText(page, `${T("configs-tab")} .pool-status.ok`, /v1 конфига «context_budget» активирована/i);
  ok(JSON.stringify(await getConfig("context_budget")) === JSON.stringify(cfg0), "откат конфига → getConfig = v1");

  /* ══ R8: подписка (п. 5b) ══ */
  console.log("\n■ R8: UI подписки");
  for (const old of await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, "starter"))) {
    await db.delete(userSubscriptions).where(eq(userSubscriptions.planId, old.id));
  }
  await db.delete(subscriptionPlans).where(eq(subscriptionPlans.name, "starter"));
  const [plan] = await db.insert(subscriptionPlans).values({
    name: "starter", displayName: "Starter", priceUsd: "9.00", billingPeriod: "month",
    quotaSyntheses: 3, quotaRegenerations: 10, quotaModes: 5, quotaEnrichments: 20, stripePriceId: "price_starter_62",
  }).returning();
  await logout();
  await login(A);
  await openBilling();
  ok(await exists(page, T("sub-absent")), "подписки нет — «не оформлена»");
  await page.click(T("sub-choose"));
  await page.waitForSelector(T("sub-plan-starter"), { timeout: 15000 });
  const planRow = await rows(page, `${T("sub-plans")} table`);
  ok(planRow.length === 1 && planRow[0][0] === "Starter" && /\$9\.00/.test(planRow[0][1]) && intOf(planRow[0][2]) === 3, "таблица тарифов: Starter $9.00 / 3 синтеза", J(planRow));
  await page.click(T("sub-plan-starter"));
  await page.waitForSelector(T("sub-status"), { timeout: 15000 });
  ok(/ожидает оплаты/i.test(await text(page, T("sub-status"))), "после «Оформить» — статус «ожидает оплаты» (incomplete)");
  ok(/Starter/.test(await text(page, T("sub-plan"))), "тариф Starter показан");
  const subRow = (await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, A.id)).orderBy(desc(userSubscriptions.createdAt)))[0];
  const wh = await webhook({ type: "invoice.paid", object: { id: "in_x", subscription: subRow.stripeSubscriptionId, period_start: nowSec(), period_end: nowSec() + 30 * 86400, lines: { data: [{ period: { start: nowSec(), end: nowSec() + 30 * 86400 } }] } } });
  ok(wh.status === 200, "webhook invoice.paid принят");
  await page.click(T("sub-refresh"));
  await waitText(page, T("sub-status"), /активна/i);
  ok(true, "«Обновить» → статус «активна»");
  const quotas = await rows(page, T("sub-quotas"));
  ok(quotas.length === 4 && quotas[0][0] === "синтезы" && intOf(quotas[0][2]) === 3 && intOf(quotas[0][3]) === 3, "таблица квот: синтезы 0/3, остаток 3", J(quotas));
  await runOp(A, S1.id);
  await page.click(T("sub-refresh"));
  await page.waitForFunction(() => { const tr = document.querySelectorAll('[data-testid="sub-quotas"] tbody tr')[2]; return tr && /1/.test(tr.children[1].innerText); }, { timeout: 15000 });
  ok(true, "после режима: использовано режимов = 1 (квота потреблена)");
  await page.click(T("sub-cancel"));
  await waitText(page, T("billing-subscription"), /отмена в конце периода/i);
  ok(true, "отмена → «отмена в конце периода»");
  ok((await db.select().from(userSubscriptions).where(eq(userSubscriptions.id, subRow.id)))[0].cancelAtPeriodEnd === true, "БД: cancel_at_period_end = true");
  await page.waitForSelector(T("sub-resume"), { timeout: 10000 });
  await page.click(T("sub-resume"));
  await page.waitForSelector(T("sub-cancel"), { timeout: 15000 });
  ok((await db.select().from(userSubscriptions).where(eq(userSubscriptions.id, subRow.id)))[0].cancelAtPeriodEnd === false, "возобновление → флаг снят, снова «Отменить подписку»");
  await api(A, "POST", "/billing/subscription/cancel");
  await db.update(userSubscriptions).set({ status: "canceled" }).where(eq(userSubscriptions.id, subRow.id));

  /* ══ R9: PauseModal — форма ключа (п. 6) ══ */
  console.log("\n■ R9: PauseModal auth — новый ключ из модалки");
  await api(A, "POST", "/billing/api-key", { key: BAD_USER_KEY });
  const cr = await api(A, "POST", "/syntheses", { seed: "Зерно паузы 6.2", philosophers: ["Парменид"], sections: ["graph"], method: "dialectical", depth: "overview", synthLevel: "comparative" });
  ok(cr.status === 200 || cr.status === 201, "POST /syntheses с плохим BYO-ключом принят", J(cr.json));
  const pid = cr.json?.id;
  await page.goto(`${UI}/synthesis/${pid}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /паузе|pause/i.test(document.body.innerText) || document.querySelector(".pause-overlay"), { timeout: 60000 });
  if (!(await exists(page, ".pause-overlay.visible"))) { await page.waitForSelector(".progress-pause-badge.visible", { timeout: 20000 }); await page.click(".progress-pause-badge.visible"); }
  await page.waitForSelector(".pause-overlay.visible", { timeout: 20000 });
  ok(/API-ключ недействителен/i.test(await text(page, ".pause-modal-title")), "модалка паузы auth открыта");
  const ps = await api(A, "GET", `/syntheses/${pid}`);
  ok(ps.json.synthesis.status === "paused" && ps.json.synthesis.pausedState?.reasonKind === "auth", "GET: status paused, reasonKind auth");
  ok(await exists(page, T("pause-new-api-key")) && await page.$eval(T("pause-save-key"), (el) => el.disabled), "форма ключа есть, «Сохранить и продолжить» неактивна при пустом поле");
  await fill(page, T("pause-new-api-key"), "short");
  await page.click(T("pause-save-key"));
  await page.waitForSelector(T("pause-api-key-error"), { timeout: 10000 });
  ok(true, "невалидный ключ → ошибка сервера показана в модалке, пауза жива");
  await fill(page, T("pause-new-api-key"), GOOD_USER_KEY);
  await page.click(T("pause-save-key"));
  await page.waitForFunction(() => !document.querySelector(".pause-overlay.visible"), { timeout: 20000 });
  ok(true, "после сохранения модалка закрыта, возобновление отправлено");
  const keysNow = (await api(A, "GET", "/billing/api-key")).json.keys;
  ok(keysNow.filter((k) => k.isActive).length === 1 && keysNow.find((k) => k.isActive).prefix === GOOD_USER_KEY.slice(0, 14), "активный ключ — новый (старый деактивирован)");
  for (let i = 0; i < 300; i++) { const s = await api(A, "GET", `/syntheses/${pid}`); if (s.json.synthesis.status === "ready") break; await sleep(200); }
  const fin = await api(A, "GET", `/syntheses/${pid}`);
  ok(fin.json.synthesis.status === "ready" && fin.json.synthesis.pausedState === null, "генерация завершена с новым ключом (status ready)", fin.json.synthesis.status);
  ok(claude.calls.some((c) => c.apiKey === GOOD_USER_KEY), "мок Claude получил новый ключ пользователя");

  /* ══ Итог ══ */
  const realErrors = pageErrors.concat(consoleErrors.filter((e) => !/favicon|fonts\.googleapis|net::ERR|Failed to load resource|401|403|400/.test(e)));
  ok(realErrors.length === 0, "ошибок страницы/консоли нет", J(realErrors.slice(0, 3)));
} catch (e) {
  failed++; fails.push("EXCEPTION");
  console.error("\n✗ ИСКЛЮЧЕНИЕ:", e);
  console.error("--- server log tail ---\n" + serverLog.slice(-2500));
} finally {
  try { await browser?.close(); } catch {}
  killGroup(serverProc); killGroup(viteProc);
  claudeSrv?.close(); stripeSrv?.close();
  try { await closeRedis(); } catch {}
  try { await closeDb(); } catch {}
  console.log(`\n${passed} ✓, ${failed} ✗`);
  if (fails.length) console.log("Провалы:\n  " + fails.join("\n  "));
  process.exit(failed ? 1 : 0);
}
