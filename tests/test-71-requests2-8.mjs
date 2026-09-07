/**
 * Тестовые запросы 2–8 беседы 7.1 (долги §12 и доводка) — одним заходом,
 * против ЖИВОГО сервера (BILLING_ENFORCE=true, мок Claude SSE, мок Stripe
 * REST) с живым PG16/Redis и браузерной частью (puppeteer-core + Chrome):
 *  R2  Миграция 0003 на живом PG16: (а) отдельная БД, 0000–0002 →
 *      строки со ссылками created_by/type_catalog_id → применение 0003 →
 *      удаление пользователя и типа проходит, ссылки → NULL; (б) в рабочей
 *      БД pg_constraint: confdeltype='n' у пяти FK, users.stripe_customer_id
 *      с UNIQUE; (в) ensureStripeCustomer: два пополнения + подписка одного
 *      пользователя → ОДИН Customer в Stripe, id в users, payment_intents
 *      с customer.
 *  R3  GET /prompts/:key/versions и /configs/:key/versions отдают тела и
 *      value; клиентские getTemplateVersions/getConfigVersionsFull без
 *      обхода (перехват fetch в браузере — один запрос к /versions).
 *  R4  PATCH/DELETE типов каталога: не-админ 403, системный 403, правка
 *      nameRu/description/defaultDirection, удаление типа со ссылкой →
 *      unlinked=1, categories.type_catalog_id NULL, текст type сохранён,
 *      кэш каталога сброшен; 404 на чужой id; + вкладка «Каталоги» в браузере.
 *  R5  POST /syntheses/:id/edges: 201 { edge, impact, htmlSync } без
 *      version, position следующий, sourceOrigin manual, таблица связей в
 *      html_content перерисована; валидация концов (чужая категория,
 *      совпадение без рефлексивности), рефлексивная петля → has_reflexive,
 *      не-владелец 403; + EdgeCreateForm через GraphModal в браузере.
 *  R6  Форма: ☑ файловая концепция → сабмит → POST /syntheses/import →
 *      участник type='synthesis' с полученным id в POST /syntheses (201);
 *      ошибок гейта нет.
 *  R7  Точный гейт: баланс между порогом и оценкой exhaustive → 403
 *      INSUFFICIENT_BALANCE с details.estimatedChargeUsd ≡ /estimate ×
 *      наценка, строка не создана; баланс ≥ оценки → 201.
 *      DELETE /auth/me: 400 без пароля, 401 неверный, 200 верный →
 *      users анонимизирован (email/role/stripe_customer_id), сессии, ключи,
 *      синтезы удалены, transactions/api_usage сохранены, подписка
 *      canceled + cancel_at_period_end в Stripe, вход старыми кредами
 *      невозможен; + ProfilePage в браузере.
 *  R8  typecheck корневой (включая typecheck:scripts) — 0 ошибок;
 *      tests/smoke-1.4b.mts и scripts/test-31-requests2-4.ts исполняются.
 * Запуск: node_modules/.bin/tsx tests/test-71-requests2-8.mjs
 */
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import puppeteer from "puppeteer-core";
import postgres from "postgres";

const SERVER_PORT = 3000;
const MOCK_PORT = 3855;
const STRIPE_PORT = 3866;
const VITE_PORT = 5199;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const UI = `http://127.0.0.1:${VITE_PORT}`;
const DB_URL = "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const ENC_SECRET = "test-encryption-secret-71";
const WH_SECRET = "whsec_test_71";
const SERVER_KEY = "sk-ant-server-key-71";
const CHROME = process.env.CHROME_PATH ?? "/opt/google/chrome/chrome";
const ROOT = new URL("../", import.meta.url).pathname;

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

const { db, closeDb } = await import("../server/db/index.js");
const schema = await import("../server/db/schema.js");
const { closeRedis, redis } = await import("../server/redis.js");
const { saveGraphToDb, parseGraphFromHTML } = await import("../server/services/graph-parser.js");
const { parseThesesFromHTML, saveElementsToDb } = await import("../server/services/element-parser.js");
const { computeChargeUsd } = await import("../server/services/billing-service.js");
const { and, asc, desc, eq, like, sql } = await import("drizzle-orm");
const { users, syntheses, synthesisLineage, sections, categories, categoryEdges, apiKeys, apiUsage, transactions,
  subscriptionPlans, userSubscriptions, promptTemplates, synthesisConfigs, categoryTypeCatalog, relationshipTypeCatalog, sessions } = schema;

/* ══ Фикстура синтеза (как 6.1) ═══════════════════════════════════════ */
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
    userId, seed: "зерно 7.1", sectionOrder: ["sum", "graph", "theses"], status: "ready", title,
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

/** Файл-концепция для пула (как test-15b; полный набор разделов для пригодности M1) */
function conceptFile({ title, marker }) {
  const catRows = [];
  for (let i = 1; i <= 8; i++) catRows.push(`<tr><td>Категория ${i}</td><td>онтологическая</td><td>Опр. ${i} (${title}).</td><td>0.${9 - (i % 5)}</td><td>0.5</td></tr>`);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head><body>
<div id="docOutput">
  <h1 id="docTitle">${title}</h1>
  <div id="docSubtitle">На основе: Кант, Гегель</div>
  <span id="docNum">PS-7100-T71A</span>
  <span id="docMethod">Диалектический</span><span id="docDepth">Стандартная</span><span id="docSynthLevel">Сравнительный</span>
  <div id="docHeaderExtras">
    <details class="header-disclosure"><summary>Зерно концепции</summary><div class="disclosure-body">зерно (${title})</div></details>
    <details class="header-disclosure header-disclosure-capsule"><summary>◈ Капсула концепции</summary><div class="disclosure-body">Капсула концепции «${title}».</div></details>
  </div>
  <div id="docBodies">
    <div class="doc-body" data-section-key="sum">
      <div class="doc-section"><span class="section-num">§ 1</span><span class="section-title">Исполнительное резюме синтеза</span>
        <div data-section="Цели и метод"><h4>Цели</h4><p>Цель (${title}). ${marker}</p></div>
        <div data-section="Ключевые напряжения"><h4>Напряжения</h4><p>Напряжение (${title}).</p></div>
      </div></div>
    <div class="doc-body" data-section-key="graph">
      <div class="doc-section"><span class="section-num">§ 2</span><span class="section-title">Граф категорий</span>
        <table class="doc-table"><thead><tr><th>Категория</th><th>Тип</th><th>Определение</th><th>Центральность</th><th>Определённость</th></tr></thead><tbody>${catRows.join("")}</tbody></table>
        <table class="doc-table"><thead><tr><th>Источник</th><th>Цель</th><th>Тип</th><th>Направление</th></tr></thead>
        <tbody><tr><td>Категория 1</td><td>Категория 2</td><td>диалектическая</td><td>однонаправленная</td></tr></tbody></table>
      </div></div>
    <div class="doc-body" data-section-key="glossary">
      <div class="doc-section"><span class="section-num">§ 3</span><span class="section-title">Глоссарий терминов</span>
        <table class="doc-table"><thead><tr><th>Термин</th><th>Определение</th></tr></thead>
        <tbody><tr><td>Термин-${marker}</td><td>Определение термина (${title}).</td></tr></tbody></table>
      </div></div>
    <div class="doc-body" data-section-key="theses">
      <div class="doc-section"><span class="section-num">§ 4</span><span class="section-title">Корпус тезисов</span>
        <div data-section="Сводная таблица тезисов"><h4>Сводная таблица</h4>
          <table class="doc-table"><thead><tr><th>№</th><th>Тезис</th></tr></thead>
          <tbody><tr><td>1.</td><td>Тезис первый (${title}).</td></tr></tbody></table>
        </div></div></div>
    <div class="doc-body" data-section-key="dialogue">
      <div class="doc-section"><span class="section-num">§ 5</span><span class="section-title">Диалог между традициями</span>
        <div data-section="Итоговая таблица диалога"><h4>Итоговая</h4>
          <table class="doc-table"><thead><tr><th>Понятие</th><th>Автор</th></tr></thead>
          <tbody><tr><td>Понятие-${marker}</td><td>Кант*</td></tr></tbody></table></div>
        <div data-section="Аналитический комментарий"><h4>Аналитический комментарий</h4><p>Комментарий (${title}).</p></div>
      </div></div>
    <div class="doc-body" data-section-key="critique">
      <div class="doc-section"><span class="section-num">§ 6</span><span class="section-title">Критический анализ</span><p>Критика (${title}).</p></div>
    </div>
  </div>
  <span id="footerPhil">Кант, Гегель</span>
</div>
<script type="application/json" id="philosynth-state">${J({ version: 2, params: { generationOrder: "architectural" }, genLog: [], ctxLog: [], sectionOrder: ["sum", "graph", "glossary", "theses", "dialogue", "critique"], participants: [{ type: "philosopher", name: "Кант" }, { type: "philosopher", name: "Гегель" }], genealogy: null })}</script>
</body></html>`;
}

/* ══ Мок Claude SSE ═══════════════════════════════════════════════════ */
const claude = { calls: [] };
function startClaudeMock() {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      let prompt = "";
      try { prompt = JSON.parse(body).messages?.[0]?.content ?? ""; } catch {}
      const html = /ГРАФ КАТЕГОРИЙ|граф категорий/i.test(prompt) && /Таблица категорий/.test(prompt)
        ? graphHtml(CAT_NAMES.slice(0, 4), CAT_TYPES, 2)
        : /КОРПУС ТЕЗИСОВ/i.test(prompt) ? thesesHtml(3)
          : `<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">Ответ</div><div class="doc-content">${sub("Ответ мока", "<p>" + "Текст ответа мока. ".repeat(40) + "</p>")}</div></div>`;
      const inTok = Math.ceil(prompt.length / 4), outTok = Math.ceil(html.length / 4);
      claude.calls.push({ inTok, outTok });
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

/* ══ Мок Stripe REST ═══════════════════════════════════════════════════ */
const stripeState = { pis: new Map(), subs: new Map(), customers: [], requests: [] };
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
      const form = parseForm(body);
      stripeState.requests.push({ method: req.method, url: req.url, form });
      const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(J(obj)); };
      if (req.headers.authorization !== "Bearer sk_test_mock71") return send(401, { error: { message: "bad key" } });
      const u = req.url;
      if (req.method === "POST" && u === "/v1/payment_intents") {
        const id = `pi_${stripeState.pis.size + 1}`;
        const pi = { id, object: "payment_intent", amount: Number(form.amount), currency: form.currency, customer: form.customer ?? null, status: "succeeded", client_secret: `${id}_secret`, metadata: form.metadata ?? {} };
        stripeState.pis.set(id, pi); return send(200, pi);
      }
      let m;
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
let serverProc, viteProc, claudeSrv, stripeSrv, browser;
let serverLog = "", viteLog = "";
const SERVER_ENV = {
  PORT: String(SERVER_PORT), DATABASE_URL: DB_URL, REDIS_URL: "redis://localhost:6379",
  CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: SERVER_KEY,
  STRIPE_SECRET_KEY: "sk_test_mock71", STRIPE_API_BASE: `http://127.0.0.1:${STRIPE_PORT}`, STRIPE_WEBHOOK_SECRET: WH_SECRET,
  API_KEY_ENCRYPTION_SECRET: ENC_SECRET, BILLING_ENFORCE: "true", BILLING_MIN_RESERVE_USD: "0.05", BILLING_MARKUP: "1.2",
  STREAM_RETRY_DELAYS: "50",
};
async function startServer() {
  serverProc = spawn(process.execPath, ["--import", "tsx", "index.ts"], {
    cwd: join(ROOT, "server"), env: { ...process.env, ...SERVER_ENV }, stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  serverProc.stdout.on("data", (d) => (serverLog += d));
  serverProc.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`${API}/health`)).ok) return; } catch {} await sleep(300); }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-3000));
}
async function startVite() {
  viteProc = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort", "--host", "127.0.0.1"], {
    cwd: join(ROOT, "client"), env: { ...process.env, VITE_STRIPE_PUBLISHABLE_KEY: "" }, stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  viteProc.stdout.on("data", (d) => (viteLog += d));
  viteProc.stderr.on("data", (d) => (viteLog += d));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(UI + "/")).ok) return; } catch {} await sleep(300); }
  throw new Error("vite не поднялся:\n" + viteLog.slice(-2000));
}
const killGroup = (p) => { if (!p) return; try { process.kill(-p.pid, "SIGKILL"); } catch {} try { p.kill("SIGKILL"); } catch {} };

async function makeUser(tag) {
  const email = `t71-${tag}-${Date.now()}@test.local`;
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
const setBalance = (uid, v) => db.update(users).set({ balanceUsd: v.toFixed(4) }).where(eq(users.id, uid));
const userRow = async (uid) => (await db.select().from(users).where(eq(users.id, uid)))[0];

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
const clickDom = (page, sel) => page.$eval(sel, (el) => el.click());
const waitSel = (page, sel, t = 15000) => page.waitForSelector(sel, { timeout: t });
const waitGone = (page, sel, t = 15000) => page.waitForFunction((s) => !document.querySelector(s), { timeout: t }, sel);

/* ══ Прогон ═══════════════════════════════════════════════════════════ */
const t0 = Date.now();
try {
  // следы прежних прогонов
  for (const stale of await db.select({ id: users.id }).from(users).where(like(users.email, "t71-%"))) {
    await db.delete(syntheses).where(eq(syntheses.userId, stale.id));
    await db.delete(apiUsage).where(eq(apiUsage.userId, stale.id));
    await db.delete(transactions).where(eq(transactions.userId, stale.id));
    await db.delete(users).where(eq(users.id, stale.id));
  }
  await db.delete(categoryTypeCatalog).where(like(categoryTypeCatalog.key, "t71_%"));
  await db.delete(relationshipTypeCatalog).where(like(relationshipTypeCatalog.key, "t71_%"));
  // анонимизированные пользователи прежних прогонов: история RESTRICT — сначала она
  for (const stale of await db.select({ id: users.id }).from(users).where(like(users.email, "deleted-%@deleted.invalid"))) {
    await db.delete(apiUsage).where(eq(apiUsage.userId, stale.id));
    await db.delete(transactions).where(eq(transactions.userId, stale.id));
    await db.delete(users).where(eq(users.id, stale.id));
  }

  /* ── R2а: миграция 0003 на отдельной БД ──────────────────────────── */
  console.log("\n── R2а: применение 0003 к базе на 0002 (отдельная БД) ──");
  const admin = postgres("postgres://philosynth:philosynth_dev@localhost:5432/postgres", { max: 1 });
  await admin`DROP DATABASE IF EXISTS philosynth_mig71`;
  await admin`CREATE DATABASE philosynth_mig71`;
  await admin.end();
  const mig = postgres("postgres://philosynth:philosynth_dev@localhost:5432/philosynth_mig71", { max: 1 });
  const migDir = join(ROOT, "server/db/migrations");
  const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  const runSql = async (f) => {
    for (const stmt of readFileSync(join(migDir, f), "utf8").split("--> statement-breakpoint")) {
      const s = stmt.trim(); if (s) await mig.unsafe(s);
    }
  };
  for (const f of files.filter((f) => !f.startsWith("0003_"))) await runSql(f);
  const [{ n: before }] = await mig`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='users' AND column_name='stripe_customer_id'`;
  ok(before === 0, "до 0003: users.stripe_customer_id нет");
  const [u0] = await mig`INSERT INTO users (email, password_hash) VALUES ('mig71@test.local', 'x') RETURNING id`;
  await mig`INSERT INTO prompt_templates (key, version, body, is_active, description, created_by) VALUES ('t71.mig', 1, 'b', false, '', ${u0.id})`;
  const [ct] = await mig`INSERT INTO category_type_catalog (key, name_ru, is_system, created_by) VALUES ('t71_mig', 'миг', false, ${u0.id}) RETURNING id`;
  const [sy] = await mig`INSERT INTO syntheses (user_id, seed, section_order) VALUES (${u0.id}, 's', '["sum"]'::jsonb) RETURNING id`;
  await mig`INSERT INTO categories (synthesis_id, name, type, type_catalog_id) VALUES (${sy.id}, 'К', 'миг', ${ct.id})`;
  let blocked = false;
  try { await mig`DELETE FROM category_type_catalog WHERE id = ${ct.id}`; } catch (e) { blocked = e.code === "23503"; }
  ok(blocked, "до 0003: удаление типа со ссылкой блокируется FK 23503");
  const f0003 = files.find((f) => f.startsWith("0003_"));
  await runSql(f0003);
  const [{ n: after }] = await mig`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='users' AND column_name='stripe_customer_id'`;
  ok(after === 1, `0003 применена: колонка stripe_customer_id появилась (${f0003})`);
  await mig`DELETE FROM category_type_catalog WHERE id = ${ct.id}`;
  const [cat0] = await mig`SELECT type, type_catalog_id FROM categories WHERE synthesis_id = ${sy.id}`;
  ok(cat0.type_catalog_id === null && cat0.type === "миг", "после 0003: тип удалён → categories.type_catalog_id NULL, текст type сохранён");
  await mig`DELETE FROM syntheses WHERE id = ${sy.id}`;
  await mig`DELETE FROM users WHERE id = ${u0.id}`;
  const [pt0] = await mig`SELECT created_by FROM prompt_templates WHERE key = 't71.mig'`;
  ok(pt0 && pt0.created_by === null, "после 0003: удаление автора → prompt_templates.created_by NULL");
  let dupBlocked = false;
  await mig`INSERT INTO users (email, password_hash, stripe_customer_id) VALUES ('a@x.y','x','cus_dup')`;
  try { await mig`INSERT INTO users (email, password_hash, stripe_customer_id) VALUES ('b@x.y','x','cus_dup')`; } catch (e) { dupBlocked = e.code === "23505"; }
  ok(dupBlocked, "stripe_customer_id UNIQUE (23505 на дубликат)");
  await mig.end();

  /* ── R2б: рабочая БД — действия FK ───────────────────────────────── */
  console.log("\n── R2б: рабочая БД после db:migrate ──");
  const fks = await db.execute(sql`SELECT conname, confdeltype FROM pg_constraint WHERE conname IN
    ('prompt_templates_created_by_users_id_fk','category_type_catalog_created_by_users_id_fk','relationship_type_catalog_created_by_users_id_fk',
     'categories_type_catalog_id_category_type_catalog_id_fk','category_edges_type_catalog_id_relationship_type_catalog_id_fk')`);
  const fkRows = Array.isArray(fks) ? fks : fks.rows ?? [];
  ok(fkRows.length === 5 && fkRows.every((r) => r.confdeltype === "n"), "5 FK с ON DELETE SET NULL (confdeltype='n')", J(fkRows));
  const uq = await db.execute(sql`SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'users_stripe_customer_id_unique' AND contype = 'u'`);
  ok((Array.isArray(uq) ? uq : uq.rows)[0].n === 1, "users_stripe_customer_id_unique есть");

  claudeSrv = await startClaudeMock();
  stripeSrv = await startStripeMock();
  await startServer();
  await startVite();

  const A = await makeUser("a");
  const B = await makeUser("b");
  const ADM = await makeUser("admin");
  await db.update(users).set({ role: "admin" }).where(eq(users.id, ADM.id));

  /* ── R2в: один Stripe Customer на пользователя ──────────────────── */
  console.log("\n── R2в: ensureStripeCustomer ──");
  let r = await api(A, "POST", "/billing/topup", { amountUsd: 5 });
  ok(r.status === 200 || r.status === 201, "POST /topup #1", J(r.json));
  const pi1 = r.json?.paymentIntentId ?? r.json?.transactionId;
  r = await api(A, "POST", "/billing/topup", { amountUsd: 7 });
  ok(r.status === 200 || r.status === 201, "POST /topup #2");
  const custA = (await userRow(A.id)).stripeCustomerId;
  ok(typeof custA === "string" && custA.startsWith("cus_"), "users.stripe_customer_id заполнен", String(custA));
  ok(stripeState.customers.filter((c) => c.metadata?.userId === A.id).length === 1, "в Stripe создан ОДИН Customer для A");
  const piReqs = stripeState.requests.filter((q) => q.method === "POST" && q.url === "/v1/payment_intents");
  ok(piReqs.length >= 2 && piReqs.slice(-2).every((q) => q.form.customer === custA), "оба payment_intents с customer = users.stripe_customer_id");
  for (const old of await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, "starter71"))) {
    await db.delete(userSubscriptions).where(eq(userSubscriptions.planId, old.id));
  }
  await db.delete(subscriptionPlans).where(eq(subscriptionPlans.name, "starter71"));
  const [plan] = await db.insert(subscriptionPlans).values({
    name: "starter71", displayName: "Starter 71", priceUsd: "9.00", billingPeriod: "month",
    quotaSyntheses: 3, quotaRegenerations: 10, quotaModes: 5, quotaEnrichments: 20, stripePriceId: "price_starter_71",
  }).returning();
  if (plan) {
    r = await api(A, "POST", "/billing/subscribe", { planId: plan.id });
    ok(r.status === 200 || r.status === 201, "POST /subscribe", J(r.json));
    const subReq = stripeState.requests.filter((q) => q.method === "POST" && q.url === "/v1/subscriptions").at(-1);
    ok(subReq?.form.customer === custA, "подписка на том же Customer (без нового /v1/customers)");
    ok(stripeState.customers.filter((c) => c.metadata?.userId === A.id).length === 1, "Customer для A по-прежнему один");
  } else {
    ok(false, "план подписки для теста недоступен");
  }
  void pi1;

  /* ── R3: тела в /versions ───────────────────────────────────────── */
  console.log("\n── R3: тела и value в /versions ──");
  r = await api(A, "GET", "/prompts/system/versions");
  ok(r.status === 403, "не-админ → 403");
  r = await api(ADM, "POST", "/prompts/system", { body: "Черновик 7.1 " + Date.now(), description: "t71" });
  ok(r.status === 201, "черновик system создан");
  const draftVersion = r.json?.template?.version;
  r = await api(ADM, "GET", "/prompts/system/versions");
  ok(r.status === 200 && Array.isArray(r.json.versions) && r.json.versions.length >= 2, "GET /prompts/system/versions → ≥2 версии");
  const vs = r.json?.versions ?? [];
  ok(vs.every((v) => typeof v.body === "string" && v.body.length > 0 && typeof v.id === "string" && v.key === "system"), "каждая версия несёт body/id/key (PromptTemplate)");
  ok(vs[0]?.version > vs.at(-1)?.version, "порядок: новые первыми");
  ok(vs.find((v) => v.version === draftVersion)?.body.startsWith("Черновик 7.1"), "тело черновика совпадает");
  r = await api(ADM, "GET", "/configs/context_budget/versions");
  ok(r.status === 200 && r.json.versions.every((v) => "value" in v && v.value !== undefined && v.key === "context_budget"), "GET /configs/:key/versions → value у каждой версии", J(r.json).slice(0, 200));
  r = await api(ADM, "GET", "/prompts/no.such.key/versions");
  ok(r.status === 404, "неизвестный ключ → 404");
  // уборка черновиков (system — только v1 активна)
  await db.update(promptTemplates).set({ createdBy: null }).where(and(eq(promptTemplates.key, "system"), sql`${promptTemplates.version} > 1`));
  await db.delete(promptTemplates).where(and(eq(promptTemplates.key, "system"), sql`${promptTemplates.version} > 1`));

  /* ── R4: каталоги ───────────────────────────────────────────────── */
  console.log("\n── R4: PATCH/DELETE типов каталога ──");
  r = await api(A, "POST", "/taxonomy/category-types", { key: "t71_custom", nameRu: "пробная", description: "d" });
  ok(r.status === 201 && r.json.type?.isSystem === false, "пользователь создал свой тип категории");
  const customCat = r.json?.type;
  r = await api(A, "POST", "/taxonomy/relationship-types", { key: "t71_rel", nameRu: "пробная связь", defaultDirection: "unidirectional" });
  ok(r.status === 201, "пользователь создал свой тип связи");
  const customRel = r.json?.type;
  r = await api(A, "PATCH", `/taxonomy/category-types/${customCat.id}`, { nameRu: "x" });
  ok(r.status === 403 && r.json.code === "FORBIDDEN", "PATCH не-админом → 403");
  r = await api(A, "DELETE", `/taxonomy/category-types/${customCat.id}`);
  ok(r.status === 403, "DELETE не-админом → 403");
  const sysType = (await db.select().from(categoryTypeCatalog).where(eq(categoryTypeCatalog.isSystem, true)).limit(1))[0];
  r = await api(ADM, "PATCH", `/taxonomy/category-types/${sysType.id}`, { nameRu: "взлом" });
  ok(r.status === 403 && r.json.code === "FORBIDDEN", "PATCH системного типа → 403 FORBIDDEN");
  r = await api(ADM, "DELETE", `/taxonomy/category-types/${sysType.id}`);
  ok(r.status === 403, "DELETE системного типа → 403");
  r = await api(ADM, "PATCH", `/taxonomy/category-types/${customCat.id}`, { nameRu: "  пробная-2  ", description: "новое описание" });
  ok(r.status === 200 && r.json.type.nameRu === "пробная-2" && r.json.type.description === "новое описание" && r.json.type.key === "t71_custom", "PATCH admin: nameRu (trim) + description, ключ прежний", J(r.json));
  r = await api(ADM, "PATCH", `/taxonomy/category-types/${customCat.id}`, { nameRu: "   " });
  ok(r.status === 400 && r.json.code === "VALIDATION_ERROR" && r.json.details?.nameRu, "PATCH пустое nameRu → 400 details.nameRu");
  r = await api(ADM, "PATCH", `/taxonomy/relationship-types/${customRel.id}`, { defaultDirection: "bidirectional" });
  ok(r.status === 200 && r.json.type.defaultDirection === "bidirectional", "PATCH связи: defaultDirection");
  r = await api(ADM, "PATCH", `/taxonomy/relationship-types/${customRel.id}`, { defaultDirection: "diagonal" });
  ok(r.status === 400 && r.json.details?.defaultDirection, "PATCH связи: невалидное направление → 400");
  r = await api(A, "GET", "/taxonomy/category-types");
  ok(r.json.types.find((t) => t.id === customCat.id)?.nameRu === "пробная-2", "GET каталога видит правку (кэш сброшен)");
  // ссылка на тип из категории синтеза
  const SA = await makeSynthesis(A.id, "Синтез A");
  const catRow = (await db.select().from(categories).where(eq(categories.synthesisId, SA.id)).orderBy(asc(categories.position)))[0];
  await db.update(categories).set({ typeCatalogId: customCat.id, type: "пробная-2" }).where(eq(categories.id, catRow.id));
  r = await api(ADM, "DELETE", `/taxonomy/category-types/${customCat.id}`);
  ok(r.status === 200 && r.json.ok === true && r.json.unlinked === 1, "DELETE admin → { ok, unlinked: 1 }", J(r.json));
  const catAfter = (await db.select().from(categories).where(eq(categories.id, catRow.id)))[0];
  ok(catAfter.typeCatalogId === null && catAfter.type === "пробная-2", "категория: typeCatalogId NULL, текст типа сохранён");
  r = await api(A, "GET", "/taxonomy/category-types");
  ok(!r.json.types.some((t) => t.id === customCat.id), "тип исчез из GET каталога");
  r = await api(ADM, "DELETE", `/taxonomy/category-types/${customCat.id}`);
  ok(r.status === 404 && r.json.code === "NOT_FOUND", "повторный DELETE → 404");
  r = await api(ADM, "DELETE", `/taxonomy/category-types/not-a-uuid`);
  ok(r.status === 404, "не-UUID → 404");

  /* ── R5: POST /edges ────────────────────────────────────────────── */
  console.log("\n── R5: POST /syntheses/:id/edges ──");
  const cats = await db.select().from(categories).where(eq(categories.synthesisId, SA.id)).orderBy(asc(categories.position));
  const byName = Object.fromEntries(cats.map((c) => [c.name, c]));
  const edgesBefore = await db.select().from(categoryEdges).where(eq(categoryEdges.synthesisId, SA.id));
  const maxPos = Math.max(...edgesBefore.map((e) => e.position));
  r = await api(B, "POST", `/syntheses/${SA.id}/edges`, { sourceId: byName["Бытие"].id, targetId: byName["Благо"].id });
  ok(r.status === 403, "не-владелец → 403");
  r = await api(A, "POST", `/syntheses/${SA.id}/edges`, { sourceId: byName["Бытие"].id, targetId: byName["Бытие"].id });
  ok(r.status === 400 && r.json.details?.targetId, "совпадение концов без рефлексивности → 400 details.targetId", J(r.json));
  const SB = await makeSynthesis(B.id, "Синтез B");
  const foreignCat = (await db.select().from(categories).where(eq(categories.synthesisId, SB.id)).limit(1))[0];
  r = await api(A, "POST", `/syntheses/${SA.id}/edges`, { sourceId: byName["Бытие"].id, targetId: foreignCat.id });
  ok(r.status === 400 && r.json.details?.targetId, "категория чужого синтеза → 400 details.targetId", J(r.json));
  r = await api(A, "POST", `/syntheses/${SA.id}/edges`, { sourceId: "nope", targetId: byName["Благо"].id, strength: 2 });
  ok(r.status === 400 && r.json.details?.sourceId && r.json.details?.strength, "невалидный id и strength → 400 по полям");
  r = await api(A, "POST", `/syntheses/${SA.id}/edges`, {
    sourceId: byName["Бытие"].id, targetId: byName["Благо"].id, edgeType: "телеологическая", description: "Бытие устремлено к Благу",
    direction: "двунаправленная", strength: 0.9, innovationDegree: 4, typeCatalogId: customRel.id,
  });
  ok(r.status === 201 && r.json.edge && r.json.impact && r.json.htmlSync && !("version" in r.json), "201 { edge, impact, htmlSync } без version", J(Object.keys(r.json ?? {})));
  const newEdge = r.json?.edge;
  ok(newEdge?.sourceId === byName["Бытие"].id && newEdge?.targetId === byName["Благо"].id && newEdge?.edgeType === "телеологическая" && newEdge?.direction === "двунаправленная" && near(newEdge?.strength, 0.9) && newEdge?.innovationDegree === 4 && newEdge?.typeCatalogId === customRel.id, "поля связи из тела", J(newEdge));
  ok(newEdge?.position === maxPos + 1 && newEdge?.sourceOrigin === "manual", "position = max+1, sourceOrigin manual", J({ p: newEdge?.position, maxPos, so: newEdge?.sourceOrigin }));
  const graphSec = (await db.select().from(sections).where(and(eq(sections.synthesisId, SA.id), eq(sections.key, "graph"))))[0];
  ok(/Бытие устремлено к Благу/.test(graphSec.htmlContent) && /телеологическая/.test(graphSec.htmlContent), "таблица связей в html_content перерисована с новой строкой");
  ok(Array.isArray(r.json?.htmlSync?.renderedTables) ? r.json.htmlSync.renderedTables.length > 0 : r.json?.htmlSync !== undefined, "htmlSync отчитался о перерисовке", J(r.json?.htmlSync));
  const defEdgeR = await api(A, "POST", `/syntheses/${SA.id}/edges`, { sourceId: byName["Логос"].id, targetId: byName["Истина"].id });
  ok(defEdgeR.status === 201 && near(defEdgeR.json.edge.strength, 0.5) && defEdgeR.json.edge.innovationDegree === 1 && defEdgeR.json.edge.direction === "однонаправленная" && defEdgeR.json.edge.edgeType === "", "дефолты схемы при минимальном теле");
  const hrBefore = (await db.select().from(categories).where(eq(categories.id, byName["Ничто"].id)))[0].hasReflexive;
  r = await api(A, "POST", `/syntheses/${SA.id}/edges`, { sourceId: byName["Ничто"].id, targetId: byName["Ничто"].id, direction: "рефлексивная" });
  ok(r.status === 201, "рефлексивная петля → 201");
  const hrAfter = (await db.select().from(categories).where(eq(categories.id, byName["Ничто"].id)))[0].hasReflexive;
  ok(hrBefore === false && hrAfter === true, "has_reflexive пересчитан → true");
  const graphSec2 = (await db.select().from(sections).where(and(eq(sections.synthesisId, SA.id), eq(sections.key, "graph"))))[0];
  ok(graphSec2.htmlContent !== graphSec.htmlContent, "топология/связи перерисованы после петли");
  r = await api(A, "DELETE", `/syntheses/${SA.id}/edges/${defEdgeR.json.edge.id}`);
  ok(r.status === 200 && r.json.ok, "созданную связь можно удалить штатным DELETE");

  /* ── Браузер ───────────────────────────────────────────────────── */
  console.log("\n── Браузер: каталоги, EdgeCreateForm, авто-импорт, профиль ──");
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); void d.accept(); });
  const reqLog = [];
  page.on("request", (q) => { if (q.url().includes("/api/v1/")) reqLog.push({ m: q.method(), u: q.url().replace(/^.*\/api\/v1/, ""), body: q.postData() ?? null }); });
  const respLog = [];
  page.on("response", (q) => { if (q.url().includes("/api/v1/")) respLog.push({ u: q.url().replace(/^.*\/api\/v1/, ""), s: q.status() }); });
  const login = async (u) => {
    await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
    await fill(page, "input[type=email]", u.email);
    await fill(page, "input[type=password]", u.password);
    await page.click("button[type=submit]");
    await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 20000 });
  };
  const logout = async () => { await page.evaluate(() => fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" })); await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" }); };

  // R3 (клиент) + R4 (вкладка «Каталоги») — под админом
  await login(ADM);
  await page.goto(`${UI}/admin/prompts`, { waitUntil: "domcontentloaded" });
  await waitSel(page, T("template-tree"));
  reqLog.length = 0;
  await page.waitForSelector(`${T("template-tree")} .key-tree-item[data-key="system"]`, { timeout: 15000 });
  await clickDom(page, `${T("template-tree")} .key-tree-item[data-key="system"]`);
  await waitSel(page, T("template-body"));
  const versionCalls = reqLog.filter((q) => /\/prompts\/system\/versions/.test(q.u));
  const prefixCalls = reqLog.filter((q) => /\/prompts\?.*prefix=system/.test(q.u) && /activeOnly=false/.test(q.u));
  ok(versionCalls.length >= 1 && prefixCalls.length === 0, "клиент берёт тела из /versions, обход ?prefix=&activeOnly=false не используется", J({ versionCalls: versionCalls.length, prefixCalls: prefixCalls.length }));
  const bodyText = await page.$eval(T("template-body"), (el) => el.value);
  ok(bodyText.length > 100, "тело активной версии загружено в редактор");
  // каталоги
  await clickDom(page, T("tab-catalogs"));
  await waitSel(page, T("catalog-category"));
  await waitSel(page, `${T("catalog-relationship")} table`);
  const catCount = await page.$$eval(`${T("catalog-category")} tbody tr`, (trs) => trs.length);
  ok(catCount >= 18, `таблица типов категорий: ${catCount} строк (≥18 системных)`);
  const sysRowBtns = await page.$$eval(`${T("catalog-category")} tbody tr`, (trs) => trs.filter((tr) => /системный/i.test(tr.innerText)).map((tr) => tr.querySelectorAll("button").length));
  ok(sysRowBtns.length >= 18 && sysRowBtns.every((n) => n === 0), "у системных типов кнопок правки нет");
  const relRow = T("catalog-relationship-row-t71_rel");
  await waitSel(page, relRow);
  await clickDom(page, T("catalog-relationship-edit-t71_rel"));
  await waitSel(page, T("catalog-relationship-edit-name"));
  await fill(page, T("catalog-relationship-edit-name"), "пробная связь UI");
  await page.select(T("catalog-relationship-edit-direction"), "reflexive");
  await clickDom(page, T("catalog-relationship-edit-save"));
  await page.waitForFunction((s) => /сохранён/i.test(document.querySelector(s)?.innerText ?? ""), { timeout: 15000 }, T("catalog-relationship-status"));
  const relDb = (await db.select().from(relationshipTypeCatalog).where(eq(relationshipTypeCatalog.id, customRel.id)))[0];
  ok(relDb.nameRu === "пробная связь UI" && relDb.defaultDirection === "reflexive", "правка по месту дошла до БД (nameRu + направление)", J(relDb));
  const rowTxt = await text(page, relRow);
  ok(/пробная связь UI/.test(rowTxt) && /рефлексивная/.test(rowTxt), "строка таблицы перерисована");
  dialogs.length = 0;
  await clickDom(page, T("catalog-relationship-delete-t71_rel"));
  await page.waitForFunction((s) => /удалён/i.test(document.querySelector(s)?.innerText ?? ""), { timeout: 15000 }, T("catalog-relationship-status"));
  ok(dialogs.length === 1 && /Удалить тип «t71_rel»/.test(dialogs[0]), "confirm перед удалением");
  ok((await db.select().from(relationshipTypeCatalog).where(eq(relationshipTypeCatalog.id, customRel.id))).length === 0, "тип связи удалён из БД");
  const statusTxt = await text(page, T("catalog-relationship-status"));
  ok(/отвязано связей: 1/.test(statusTxt), "статус несёт unlinked (связь SA ссылалась на тип)", statusTxt);
  const edgeAfter = (await db.select().from(categoryEdges).where(and(eq(categoryEdges.synthesisId, SA.id), eq(categoryEdges.edgeType, "телеологическая")))).length;
  void edgeAfter;
  await logout();

  // R5 (клиент): EdgeCreateForm через GraphModal
  await login(A);
  await setBalance(A.id, 1);
  await page.goto(`${UI}/synthesis/${SA.id}`, { waitUntil: "domcontentloaded" });
  // .action-btn — капитель: innerText в верхнем регистре, сравнение только регистронезависимо (грабля 6.2)
  await page.waitForSelector(".actions-bar", { timeout: 20000 });
  await page.waitForFunction(() => [...document.querySelectorAll(".actions-bar button")].some((b) => /граф/i.test(b.innerText)), { timeout: 20000 });
  await page.evaluate(() => [...document.querySelectorAll(".actions-bar button")].find((b) => /граф/i.test(b.innerText)).click());
  await waitSel(page, T("gm-add-edge-btn"));
  await clickDom(page, T("gm-add-edge-btn"));
  await waitSel(page, T("edge-create-form"));
  const srcOpts = await page.$$eval(`${T("edge-new-source")} option`, (os) => os.map((o) => o.innerText));
  ok(srcOpts.length === CAT_NAMES.length && CAT_NAMES.every((n) => srcOpts.includes(n)), "select источника — все категории синтеза");
  const idOf = (name) => byName[name].id;
  await page.select(T("edge-new-source"), idOf("Истина"));
  await page.select(T("edge-new-target"), idOf("Истина"));
  await sleep(100);
  const disabledSame = await page.$eval(T("edge-new-save"), (b) => b.disabled);
  ok(disabledSame, "совпадение концов при не-рефлексивной связи — кнопка недоступна");
  await page.select(T("edge-new-target"), idOf("Становление"));
  await page.type("#edge-ed-desc", "Истина проявляется в становлении");
  const edgesCountBefore = (await db.select().from(categoryEdges).where(eq(categoryEdges.synthesisId, SA.id))).length;
  reqLog.length = 0;
  await clickDom(page, T("edge-new-save"));
  await waitGone(page, T("edge-create-form"));
  const postEdge = reqLog.find((q) => q.m === "POST" && q.u === `/syntheses/${SA.id}/edges`);
  ok(!!postEdge && JSON.parse(postEdge.body).sourceId === idOf("Истина") && JSON.parse(postEdge.body).targetId === idOf("Становление"), "форма отправила POST /edges с выбранными концами", J(postEdge));
  const edgesCountAfter = (await db.select().from(categoryEdges).where(eq(categoryEdges.synthesisId, SA.id))).length;
  ok(edgesCountAfter === edgesCountBefore + 1, "связь создана в БД");
  ok(reqLog.some((q) => q.m === "GET" && q.u === `/syntheses/${SA.id}/categories`), "граф перечитан хозяином после создания");
  ok(pageErrors.length === 0, "ошибок страницы нет", J(pageErrors));
  await page.evaluate(() => document.querySelector(".gm-btn.close")?.click());

  // R6: авто-импорт файловой концепции
  console.log("\n── R6: авто-импорт файловой ☑-концепции при сабмите ──");
  await setBalance(A.id, 50); // мета-синтез шести разделов дороже $1 — точный гейт (R7) иначе откажет
  const dir = mkdtempSync(join(tmpdir(), "t71-"));
  const fA = join(dir, "alpha71.html");
  writeFileSync(fA, conceptFile({ title: "Альфа-71", marker: "MARKER-ALPHA-71" }));
  await page.goto(`${UI}/synthesis/new`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.textContent.includes("Загруженные Концепции"), { timeout: 15000 });
  const fileInput = await page.$('input[type="file"]');
  await fileInput.uploadFile(fA);
  await page.waitForFunction(() => document.body.textContent.includes("«Альфа-71»"), { timeout: 10000 });
  await page.evaluate(() => document.querySelector('.pool-card input[type="checkbox"]').click());
  await page.waitForFunction(() => document.querySelector(".pool-card.synth-on"), { timeout: 5000 });
  const importCountBefore = (await db.select({ id: syntheses.id }).from(syntheses).where(eq(syntheses.userId, A.id))).length;
  // зерно (участник-концепция — достаточно, но зерно не мешает); разделы автовключаются по ☑
  const seedSel = await page.$("textarea");
  if (seedSel) await seedSel.type("Зерно авто-импорта 7.1");
  reqLog.length = 0; respLog.length = 0; dialogs.length = 0;
  await page.evaluate(() => document.querySelector("button.submit-btn").click());
  await page.waitForFunction(() => /\/synthesis\/[0-9a-f-]{36}$/.test(location.pathname) || document.querySelector(".callout.warning, .pool-status.err"), { timeout: 60000 });
  const importReq = respLog.find((q) => q.u === "/syntheses/import");
  ok(importReq?.s === 200 || importReq?.s === 201, "POST /syntheses/import вызван и успешен", J(importReq));
  const postSynth = reqLog.find((q) => q.m === "POST" && /\/syntheses\/?$/.test(q.u));
  const postSynthBody = postSynth ? JSON.parse(postSynth.body) : null;
  const importedRow = (await db.select().from(syntheses).where(and(eq(syntheses.userId, A.id), eq(syntheses.title, "Альфа-71"))))[0];
  ok(!!importedRow, "импортированная концепция появилась в каталоге A");
  ok(postSynthBody?.participants?.some((p) => p.type === "synthesis" && p.synthesisId === importedRow?.id), "POST /syntheses несёт участника type='synthesis' с id импорта", J(postSynthBody?.participants));
  const postSynthResp = respLog.find((q) => /\/syntheses\/?$/.test(q.u));
  ok(postSynthResp?.s === 201, "POST /syntheses → 201 (гейт файловых снят)", J(postSynthResp) + " " + (await page.evaluate(() => document.querySelector(".callout.warning, .pool-status.err")?.innerText ?? "")));
  ok(/\/synthesis\/[0-9a-f-]{36}$/.test(await page.evaluate(() => location.pathname)), "переход на страницу нового синтеза");
  ok(!(await page.evaluate(() => document.body.innerText.includes("Файловые концепции пока не поддержаны"))), "старого текста гейта нет");
  ok((await db.select({ id: syntheses.id }).from(syntheses).where(eq(syntheses.userId, A.id))).length === importCountBefore + 2, "в БД: импорт + новый синтез");
  // дождаться завершения генерации мока, чтобы не мешать удалению аккаунта
  const newSid = (await page.evaluate(() => location.pathname)).split("/").pop();
  for (let i = 0; i < 300 && /^[0-9a-f-]{36}$/.test(newSid); i++) {
    const st = (await db.select({ s: syntheses.status }).from(syntheses).where(eq(syntheses.id, newSid)))[0]?.s;
    if (st && st !== "generating") break;
    await sleep(200);
  }

  /* ── R7: точный гейт ────────────────────────────────────────────── */
  console.log("\n── R7: точная оценка в гейте POST /syntheses ──");
  const C = await makeUser("c");
  const bodyEx = { seed: "Зерно точного гейта 7.1", philosophers: ["Парменид", "Гераклит"], sections: ["graph", "theses", "glossary", "critique"], method: "dialectical", depth: "exhaustive", synthLevel: "comparative" };
  r = await api(C, "POST", "/syntheses/estimate", bodyEx);
  ok(r.status === 200 && r.json.estimate?.cost > 0, "/estimate даёт стоимость", J(r.json).slice(0, 120));
  const estCost = r.json.estimate.cost;
  const charge = computeChargeUsd(estCost);
  ok(charge > 0.05, `ожидаемое списание ${charge.toFixed(4)} выше порога 0.05 — гейт по порогу пропустил бы`);
  await setBalance(C.id, 0.06);
  const rowsBefore = (await db.select({ id: syntheses.id }).from(syntheses).where(eq(syntheses.userId, C.id))).length;
  r = await api(C, "POST", "/syntheses", bodyEx);
  ok(r.status === 403 && r.json.code === "INSUFFICIENT_BALANCE", "баланс 0.06 (> порога, < оценки) → 403 INSUFFICIENT_BALANCE", J(r.json));
  ok(near(r.json.details?.estimatedChargeUsd ?? -1, charge, 1e-6) && near(r.json.details?.requiredUsd ?? -1, charge, 1e-6) && near(r.json.details?.balanceUsd ?? -1, 0.06, 1e-6), "details: estimatedChargeUsd ≡ requiredUsd ≡ /estimate × наценка, balanceUsd", J(r.json.details));
  ok((await db.select({ id: syntheses.id }).from(syntheses).where(eq(syntheses.userId, C.id))).length === rowsBefore, "строка синтеза не создана");
  await setBalance(C.id, charge + 0.01);
  r = await api(C, "POST", "/syntheses", bodyEx);
  ok(r.status === 201 && r.json.id, "баланс ≥ оценки → 201");
  const gateSid = r.json?.id;
  // BYO-пользователь баланса не требует: гейт не должен мешать
  const D = await makeUser("d");
  await api(D, "POST", "/billing/api-key", { key: "sk-ant-api03-USER-" + "k".repeat(60) });
  r = await api(D, "POST", "/syntheses", { ...bodyEx, sections: ["graph"] });
  ok(r.status === 201, "BYO-ключ: точный гейт не применяется (201 при нулевом балансе)");
  for (let i = 0; i < 300; i++) {
    const rowsG = await db.select({ s: syntheses.status }).from(syntheses).where(eq(syntheses.status, "generating"));
    if (rowsG.length === 0) break;
    await sleep(200);
  }
  void gateSid;

  /* ── R7: DELETE /auth/me ────────────────────────────────────────── */
  console.log("\n── R7: DELETE /auth/me ──");
  // у A: баланс, ключ, подписка, синтезы, транзакции, api_usage
  await api(A, "POST", "/billing/api-key", { key: "sk-ant-api03-USER-A-" + "a".repeat(58) });
  const aSynths = (await db.select({ id: syntheses.id }).from(syntheses).where(eq(syntheses.userId, A.id))).length;
  const aTx = (await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.userId, A.id))).length;
  const aUsage = (await db.select({ id: apiUsage.id }).from(apiUsage).where(eq(apiUsage.userId, A.id))).length;
  ok(aSynths >= 2 && aTx >= 0, `у A: синтезов ${aSynths}, транзакций ${aTx}, api_usage ${aUsage}`);
  r = await api(A, "DELETE", "/auth/me", {});
  ok(r.status === 400 && r.json.details?.password, "без пароля → 400 details.password");
  r = await api(A, "DELETE", "/auth/me", { password: "wrong-password" });
  ok(r.status === 401 && r.json.code === "AUTH_REQUIRED", "неверный пароль → 401 AUTH_REQUIRED");
  ok((await api(A, "GET", "/auth/me")).status === 200, "сессия жива после отказа");
  // подписка A активна?
  const subA = (await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, A.id)))[0];
  if (subA) await db.update(userSubscriptions).set({ status: "active", currentPeriodEnd: new Date(Date.now() + 86400e3), currentPeriodStart: new Date() }).where(eq(userSubscriptions.id, subA.id));
  const cancelReqsBefore = stripeState.requests.filter((q) => /\/v1\/subscriptions\/sub_/.test(q.url) && q.form?.cancel_at_period_end === "true").length;
  // через браузер: ProfilePage
  await page.goto(`${UI}/profile`, { waitUntil: "domcontentloaded" });
  await waitSel(page, T("delete-account-form"));
  dialogs.length = 0;
  await fill(page, `${T("delete-account-form")} input[type=password]`, "wrong-password");
  await clickDom(page, T("delete-account-btn"));
  await page.waitForFunction((s) => /Неверный пароль/.test(document.querySelector(s)?.innerText ?? ""), { timeout: 15000 }, T("delete-account-form"));
  ok(dialogs.length === 1 && /Удалить аккаунт\?/.test(dialogs[0]), "confirm перед удалением (браузер)");
  ok(await page.evaluate(() => location.pathname === "/profile"), "неверный пароль не разлогинил (skipUnauthorizedHandler)");
  await fill(page, `${T("delete-account-form")} input[type=password]`, A.password);
  await clickDom(page, T("delete-account-btn"));
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 20000 });
  ok(true, "после удаления — /login (store anonymous, RequireAuth)");
  const aRow = await userRow(A.id);
  ok(aRow && aRow.email === `deleted-${A.id}@deleted.invalid` && aRow.displayName === null && aRow.stripeCustomerId === null && aRow.role === "user", "users анонимизирован: email/displayName/stripe_customer_id/role", J({ e: aRow?.email, d: aRow?.displayName, c: aRow?.stripeCustomerId, r: aRow?.role }));
  ok((await db.select().from(sessions).where(eq(sessions.userId, A.id))).length === 0, "сессии удалены");
  ok((await db.select().from(apiKeys).where(eq(apiKeys.userId, A.id))).length === 0, "BYO-ключи удалены");
  ok((await db.select({ id: syntheses.id }).from(syntheses).where(eq(syntheses.userId, A.id))).length === 0, "синтезы удалены (CASCADE потомков)");
  ok((await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.userId, A.id))).length === aTx, "transactions сохранены (RESTRICT-история)");
  ok((await db.select({ id: apiUsage.id }).from(apiUsage).where(eq(apiUsage.userId, A.id))).length === aUsage, "api_usage сохранён");
  if (subA) {
    const subAfter = (await db.select().from(userSubscriptions).where(eq(userSubscriptions.id, subA.id)))[0];
    ok(subAfter.status === "canceled" && subAfter.cancelAtPeriodEnd === true, "подписка → canceled + cancel_at_period_end");
    const cancelReqsAfter = stripeState.requests.filter((q) => /\/v1\/subscriptions\/sub_/.test(q.url) && q.form?.cancel_at_period_end === "true").length;
    ok(cancelReqsAfter === cancelReqsBefore + 1, "Stripe получил cancel_at_period_end=true");
  }
  r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: J({ email: A.email, password: A.password }) });
  ok(r.status === 401, "вход старыми кредами → 401");
  r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: J({ email: aRow.email, password: A.password }) });
  ok(r.status === 401, "вход анонимизированным email → 401");
  ok((await api(A, "GET", "/auth/me")).status === 401, "старая cookie мертва");
  ok(pageErrors.length === 0, "ошибок страницы нет за весь браузерный прогон", J(pageErrors));

  /* ── R8: инструменты ────────────────────────────────────────────── */
  console.log("\n── R8: typecheck (с typecheck:scripts), smoke-1.4b, test-31 ──");
  const tc = spawnSync("npm", ["run", "typecheck"], { cwd: ROOT, encoding: "utf8", timeout: 400000 });
  ok(tc.status === 0 && /typecheck:scripts/.test(tc.stdout), "npm run typecheck → 0 (включая typecheck:scripts)", (tc.stdout + tc.stderr).split("\n").filter((l) => /error/.test(l)).slice(0, 5).join(" | "));
  const s14 = spawnSync(join(ROOT, "node_modules/.bin/tsx"), ["tests/smoke-1.4b.mts"], { cwd: ROOT, encoding: "utf8", timeout: 300000, env: { ...process.env, DATABASE_URL: DB_URL } });
  ok(s14.status === 0 && /Итог: \d+ ✓, 0 ✗/.test(s14.stdout), "tests/smoke-1.4b.mts исполняется (импорт PauseModal путём-переменной)", (s14.stdout + s14.stderr).slice(-400));
  const t31 = spawnSync(join(ROOT, "node_modules/.bin/tsx"), ["scripts/test-31-requests2-4.ts"], { cwd: ROOT, encoding: "utf8", timeout: 300000, env: { ...process.env, DATABASE_URL: DB_URL, REDIS_URL: "redis://localhost:6379" } });
  ok(t31.status === 0 && !/\s✗ /.test(t31.stdout), "scripts/test-31-requests2-4.ts исполняется на живой БД", (t31.stdout + t31.stderr).slice(-400));
} catch (err) {
  failed++;
  console.error("\n!!! ИСКЛЮЧЕНИЕ:", err);
  console.error("server log tail:\n" + serverLog.slice(-2500));
} finally {
  try { await browser?.close(); } catch {}
  killGroup(serverProc); killGroup(viteProc);
  claudeSrv?.close(); stripeSrv?.close();
  try { await closeRedis(); } catch {}
  try { await closeDb(); } catch {}
}
console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗ за ${((Date.now() - t0) / 1000).toFixed(0)} с`);
if (fails.length) console.log("Провалы:\n  - " + fails.join("\n  - "));
process.exit(failed ? 1 : 0);
