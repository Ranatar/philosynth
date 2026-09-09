/**
 * Тестовые запросы 2–6 беседы 8.2 (локальный стенд биллинга) — одним заходом,
 * против НАСТОЯЩЕГО стенда tools/dev-billing.sh (мок Stripe → сервер :3000 →
 * vite :5199), браузер puppeteer-core + Chrome:
 *  R2  прогоны test-61/62/71 на общем моке — отдельными процессами (см.
 *      журнал беседы: 109 / 101 / 105); здесь проверяется только, что тесты
 *      импортируют мок из tools/ и собственных копий не осталось;
 *  R3  стенд руками: dev-billing.sh → регистрация в браузере → пополнение $5
 *      (dev-режим: «Подтвердить платёж» → /topup/confirm) → баланс вырос →
 *      транзакция topup в истории (UI и БД); повторный dev-billing.sh — одни skip;
 *  R4  заслон: STRIPE_SECRET_KEY=sk_live_… → dev-billing.sh отказывается
 *      (rc≠0, ни один процесс не запущен и не убит);
 *  R5  edge: stripe-emit с несуществующим sub_… → webhook 200 { handled:false },
 *      user_subscriptions не изменились; с настоящим sub_… → active (план — из
 *      посева стенда, 8.3; прежний ручной insert t82plan снят);
 *  R6  teardown: --stop гасит vite, сервер и мок, порты 5199/3000/3866 свободны;
 *      повторный старт проходит без «порт занят», повторный --stop чист.
 * Запуск из корня: node_modules/.bin/tsx tests/test-82-requests2-6.mjs
 * Требует живых PG/Redis, смигрированной и посеянной БД, node_modules.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync, copyFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import net from "node:net";

import puppeteer from "puppeteer-core";

const ROOT = new URL("../", import.meta.url).pathname;
const UI = "http://127.0.0.1:5199";
const API = "http://127.0.0.1:3000/api/v1";
const MOCK = "http://127.0.0.1:3866";
const CHROME = process.env.CHROME_PATH ?? "/opt/google/chrome/chrome";
const ENV_LOCAL = ROOT + ".env.local";
const ENV_BAK = ROOT + ".env.local.t82-bak";

process.env.DATABASE_URL ??= "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.REDIS_URL ??= "redis://localhost:6379";

let passed = 0, failed = 0; const fails = [];
function ok(cond, name, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
const J = (x) => JSON.stringify(x);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const T = (id) => `[data-testid="${id}"]`;

const { db, closeDb } = await import("../server/db/index.js");
const schema = await import("../server/db/schema.js");
const { closeRedis } = await import("../server/redis.js");
const { eq, like, asc } = await import("drizzle-orm");
const { users, transactions, userSubscriptions, subscriptionPlans, syntheses, apiUsage } = schema;

/* ── утилиты ─────────────────────────────────────────────────────────── */
const portBusy = (port) => new Promise((res) => {
  const s = net.connect({ host: "127.0.0.1", port });
  s.once("connect", () => { s.destroy(); res(true); });
  s.once("error", () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 700);
});
const httpOk = async (url) => { try { return (await fetch(url)).ok; } catch { return false; } };
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
function devBilling(...args) {
  const r = spawnSync("bash", [ROOT + "tools/dev-billing.sh", ...args], { cwd: ROOT, encoding: "utf8", env: { ...process.env, HEALTH_WAIT_SEC: "90" } });
  const out = strip((r.stdout ?? "") + (r.stderr ?? ""));
  const m = out.match(/created=(\d+) skip=(\d+) fail=(\d+)/);
  return { rc: r.status, out, created: m ? +m[1] : null, skip: m ? +m[2] : null, fail: m ? +m[3] : null };
}
function emit(...args) {
  const r = spawnSync(process.execPath, [ROOT + "tools/stripe-emit.mjs", ...args], { cwd: ROOT, encoding: "utf8", env: { ...process.env, STRIPE_WEBHOOK_SECRET: "" } });
  return { rc: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
const readEnvLocal = () => Object.fromEntries(readFileSync(ENV_LOCAL, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const userByEmail = async (email) => (await db.select().from(users).where(eq(users.email, email)))[0];
const setNative = async (page, sel, value) => page.$eval(sel, (el, v) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
}, value);
const text = (page, sel) => page.$eval(sel, (el) => el.innerText);

let browser = null, stopped = false, hadEnvLocal = false;
try {
  hadEnvLocal = existsSync(ENV_LOCAL);
  if (hadEnvLocal) copyFileSync(ENV_LOCAL, ENV_BAK);
  // следы прежних прогонов
  for (const stale of await db.select({ id: users.id }).from(users).where(like(users.email, "t82-%"))) {
    await db.delete(userSubscriptions).where(eq(userSubscriptions.userId, stale.id));
    await db.delete(syntheses).where(eq(syntheses.userId, stale.id));
    await db.delete(apiUsage).where(eq(apiUsage.userId, stale.id));
    await db.delete(transactions).where(eq(transactions.userId, stale.id));
    await db.delete(users).where(eq(users.id, stale.id));
  }
  for (const p of [5199, 3000, 3866]) {
    if (await portBusy(p)) throw new Error(`порт ${p} занят до старта — чужой процесс; ps aux | grep -E "[s]erver/index|[v]ite|[s]tripe-mock"`);
  }

  /* ── R2: копий мока в тестах не осталось ─────────────────────────── */
  console.log("\n── R2: общий мок в test-61/62/71 ──");
  for (const f of ["test-61-requests2-11.mjs", "test-62-requests2-7.mjs", "test-71-requests2-8.mjs"]) {
    const src = readFileSync(ROOT + "tests/" + f, "utf8");
    ok(/import \{ createStripeMock \} from "\.\.\/tools\/stripe-mock\.mjs"/.test(src) && !/function startStripeMock\(\)/.test(src) && !/function parseForm\(/.test(src), `${f}: импорт из tools/, своей копии мока нет`);
  }

  /* ── R3: стенд руками ────────────────────────────────────────────── */
  console.log("\n── R3: dev-billing.sh → регистрация → пополнение $5 ──");
  if (existsSync(ENV_LOCAL)) unlinkSync(ENV_LOCAL);
  let dv = devBilling();
  ok(dv.rc === 0 && dv.fail === 0, `dev-billing.sh: rc=${dv.rc}, created=${dv.created} skip=${dv.skip} fail=${dv.fail}`, dv.out.slice(-1200));
  ok(existsSync(ENV_LOCAL) && /\.env\.local создан из \.env\.local\.example/.test(dv.out), ".env.local создан из образца");
  ok(/тарифы (?:уже )?посеяны \(npm run seed:plans/.test(dv.out), "стенд сеет тарифы (npm run seed:plans, 8.3; до 8.3 — предупреждение о пустом разделе)");
  ok(/seed:admin/.test(dv.out), "напоминание про seed:admin (8.1)");
  ok(await httpOk(`${MOCK}/__mock/health`) && await httpOk(`${API}/health`) && await httpOk(`${UI}/`), "мок :3866, сервер :3000, vite :5199 отвечают");
  const health = await (await fetch(`${MOCK}/__mock/health`)).json();
  ok(health.paymentIntentStatus === "succeeded", "мок стенда рождает PaymentIntent succeeded (dev-режим подтверждения)");
  // сервер строго на :3000 — прокси vite зашит
  ok((await fetch(`${UI}/api/v1/health`)).ok, "vite проксирует /api на сервер :3000");
  // идемпотентность: повторный старт — одни skip
  const dv2 = devBilling();
  ok(dv2.rc === 0 && dv2.created === 0 && dv2.fail === 0 && dv2.skip >= 4, `повторный dev-billing.sh — одни skip (created=${dv2.created} skip=${dv2.skip})`, dv2.out.slice(-800));

  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.googleapis|401|Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
  const email = `t82-user-${Date.now()}@test.local`, password = "Passw0rd!123";
  await page.goto(`${UI}/register`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.type('input[type="email"]', email);
  const pwInputs = await page.$$('input[type="password"]');
  for (const inp of pwInputs) await inp.type(password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !/\/register$/.test(location.pathname), { timeout: 20000 });
  const u = await userByEmail(email);
  ok(!!u, "регистрация через браузер стенда: пользователь в БД", email);
  if (/\/login/.test(page.url())) {
    await page.waitForSelector('input[type="email"]', { timeout: 20000 });
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !/\/login$/.test(location.pathname), { timeout: 20000 });
  }
  const me = await page.evaluate(async () => (await fetch("/api/v1/auth/me")).json());
  ok(me.user?.email === email && near(me.user.balanceUsd, 0), "вход выполнен, баланс 0", J(me));

  await page.goto(`${UI}/billing`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(T("billing-page"), { timeout: 20000 });
  await page.waitForFunction(() => { const el = document.querySelector('[data-testid="billing-balance"]'); return el && !/Загрузка…/.test(el.innerText); }, { timeout: 20000 });
  await page.waitForFunction(() => { const el = document.querySelector('[data-testid="billing-subscription"]'); return el && !/Загрузка…/.test(el.innerText); }, { timeout: 20000 });
  const balBox = await text(page, T("balance-value"));
  ok(/\$0\.00/.test(balBox), "баланс на странице $0.00", balBox);
  ok(/подписки нет/i.test(await text(page, T("billing-subscription"))), "раздел подписки: «подписки нет» (у нового пользователя; тарифы посеяны стендом с 8.3)", await text(page, T("billing-subscription")));
  // пополнение $5: кнопка суммы → «Пополнить» → «Подтвердить платёж»
  await page.$eval(T("amount-5"), (el) => el.click());
  ok(true, "выбрана сумма $5 (amount-5)");
  const startBtn = await page.$$eval(`${T("billing-balance")} button`, (bs) => { const b = bs.find((x) => /пополнить/i.test(x.innerText)); if (b) { b.click(); return true; } return false; });
  ok(startBtn, "нажата «Пополнить» → POST /billing/topup");
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="billing-balance"] button')].some((b) => /подтвердить платёж/i.test(b.innerText)), { timeout: 20000 });
  ok(/тестовый режим|VITE_STRIPE/i.test(await text(page, T("billing-balance"))), "без publishable key — подсказка о dev-режиме подтверждения (Payment Element не монтируется)");
  const mockH1 = await (await fetch(`${MOCK}/__mock/health`)).json();
  ok(mockH1.counts.paymentIntents === 1 && mockH1.counts.customers === 1, "мок: создан PaymentIntent и Customer (ensureStripeCustomer 7.1)", J(mockH1.counts));
  await page.$$eval(`${T("billing-balance")} button`, (bs) => bs.find((x) => /подтвердить платёж/i.test(x.innerText)).click());
  // именно balance-value: в блоке есть кнопка «Пополнить на $5.00», и грубый регексп по секции зеленел до confirm
  await page.waitForFunction(() => /\$5\.00/.test(document.querySelector('[data-testid="balance-value"]')?.innerText ?? ""), { timeout: 20000 });
  ok(true, "balance-value вырос до $5.00 (после /topup/confirm)");
  const row = await userByEmail(email);
  ok(near(Number(row.balanceUsd), 5), "users.balance_usd = 5.0000", String(row.balanceUsd));
  ok(typeof row.stripeCustomerId === "string" && row.stripeCustomerId.startsWith("cus_"), "users.stripe_customer_id заполнен из мока", String(row.stripeCustomerId));
  const txs = await db.select().from(transactions).where(eq(transactions.userId, row.id)).orderBy(asc(transactions.createdAt));
  ok(txs.length === 1 && txs[0].type === "topup" && near(Number(txs[0].amountUsd), 5) && /^pi_/.test(txs[0].stripeId ?? ""), "transaction topup $5 со stripe_id мока", J(txs));
  await page.waitForFunction(() => /topup|пополнение/i.test(document.querySelector('[data-testid="billing-transactions"]')?.innerText ?? ""), { timeout: 20000 });
  const txText = await text(page, T("billing-transactions"));
  ok(/\$5\.00|5\.0000/.test(txText), "транзакция видна в истории на странице", txText.slice(0, 300));
  ok(consoleErrors.length === 0, "ошибок страницы/консоли нет", J(consoleErrors));

  /* ── R4: заслон sk_live_ ─────────────────────────────────────────── */
  console.log("\n── R4: заслон sk_live_ ──");
  const envText = readFileSync(ENV_LOCAL, "utf8");
  writeFileSync(ENV_LOCAL, envText.replace(/^STRIPE_SECRET_KEY=.*$/m, "STRIPE_SECRET_KEY=sk_live_51H4ck3rNope"));
  const dvLive = devBilling();
  ok(dvLive.rc !== 0 && /sk_live_/.test(dvLive.out) && /живой аккаунт/.test(dvLive.out), `sk_live_ → отказ (rc=${dvLive.rc})`, dvLive.out.slice(-600));
  ok(dvLive.created === 0 && !/мок Stripe →|сервер →|vite →/.test(dvLive.out), "ни один процесс не запущен заслоном");
  ok(await httpOk(`${API}/health`) && await httpOk(`${UI}/`) && await httpOk(`${MOCK}/__mock/health`), "уже поднятый стенд заслон не тронул");
  const dvLiveStop = devBilling("--stop");
  ok(dvLiveStop.rc !== 0 && /sk_live_/.test(dvLiveStop.out) && await httpOk(`${API}/health`), "--stop под sk_live_ тоже отказывает (окружение читается первым), стенд жив");
  writeFileSync(ENV_LOCAL, envText);
  ok(readEnvLocal().STRIPE_SECRET_KEY === "sk_test_mock", ".env.local восстановлен");

  /* ── R5: stripe-emit ─────────────────────────────────────────────── */
  console.log("\n── R5: stripe-emit ──");
  const subsBefore = J(await db.select().from(userSubscriptions));
  let em = emit("invoice.paid", "sub_does_not_exist");
  ok(em.rc === 0 && /HTTP 200/.test(em.out) && /"handled":false/.test(em.out), "несуществующий sub → webhook 200 handled:false", em.out.trim());
  ok(/не обработал/.test(em.out), "emit объясняет handled:false");
  em = emit("customer.subscription.deleted", "sub_does_not_exist");
  ok(em.rc === 0 && /HTTP 200/.test(em.out) && /"handled":false/.test(em.out), "subscription.deleted с неизвестным id → 200 handled:false");
  ok(J(await db.select().from(userSubscriptions)) === subsBefore, "user_subscriptions не изменились");
  em = emit("customer.subscription.updated", "sub_x", "--status", "bogus");
  ok(em.rc === 2 && /вне/.test(em.out), "невалидный --status → отказ до отправки (rc=2)");
  em = emit("nope.event", "sub_x");
  ok(em.rc === 2 && /неизвестное событие/.test(em.out), "неизвестное событие → rc=2");
  // настоящая подписка: с 8.3 план берётся из ПОСЕВА стенда (npm run seed:plans,
  // STRIPE_PRICE_* из .env.local — price_mock_*), ручной insert снят;
  // подписка через API → incomplete → emit invoice.paid → active → deleted → canceled
  const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, "starter"));
  ok(!!plan && plan.isActive && plan.stripePriceId === "price_mock_starter", "план starter посеян стендом активным с price_mock_starter", J(plan));
  const subRes = await page.evaluate(async (planId) => { const r = await fetch("/api/v1/billing/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId }) }); return { status: r.status, json: await r.json() }; }, plan.id);
  ok(subRes.status === 201 && subRes.json.subscription?.status === "incomplete" && /^sub_/.test(subRes.json.subscriptionId), "POST /subscribe на стенде → incomplete (webhook некому прислать)", J(subRes.json));
  em = emit("invoice.paid", subRes.json.subscriptionId);
  let subRow = (await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, row.id)))[0];
  ok(em.rc === 0 && /"action":"period_reset"/.test(em.out) && subRow.status === "active", "emit invoice.paid → подписка active", em.out.trim());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /активн/i.test(document.querySelector('[data-testid="sub-status"]')?.innerText ?? ""), { timeout: 20000 });
  ok(true, "страница показывает статус «активна»");
  em = emit("customer.subscription.deleted", subRes.json.subscriptionId);
  subRow = (await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, row.id)))[0];
  ok(em.rc === 0 && /"action":"canceled"/.test(em.out) && subRow.status === "canceled", "emit subscription.deleted → canceled");
  // подпись: при заданном секрете сервер (пустой секрет) подпись игнорирует — но emit её ставит
  const dry = spawnSync(process.execPath, [ROOT + "tools/stripe-emit.mjs", "invoice.paid", "sub_x", "--dry-run"], { encoding: "utf8", env: { ...process.env, STRIPE_WEBHOOK_SECRET: "whsec_t82" } });
  ok(/stripe-signature":"t=\d+,v1=[0-9a-f]{64}"/.test(dry.stdout), "с STRIPE_WEBHOOK_SECRET emit ставит подпись t=…,v1=…");
  const dry2 = spawnSync(process.execPath, [ROOT + "tools/stripe-emit.mjs", "invoice.paid", "sub_x", "--dry-run"], { encoding: "utf8", env: { ...process.env, STRIPE_WEBHOOK_SECRET: "" } });
  ok(!/stripe-signature/.test(dry2.stdout), "без секрета — без подписи");

  /* ── R6: teardown ────────────────────────────────────────────────── */
  console.log("\n── R6: teardown ──");
  await browser.close(); browser = null;
  const st = devBilling("--stop");
  stopped = true;
  ok(st.rc === 0 && st.fail === 0 && /vite остановлен/.test(st.out) && /сервер остановлен/.test(st.out) && /мок Stripe остановлен/.test(st.out), `--stop: vite, сервер, мок остановлены (rc=${st.rc})`, st.out.slice(-900));
  await sleep(500);
  ok(!(await portBusy(5199)) && !(await portBusy(3000)) && !(await portBusy(3866)), "порты 5199 / 3000 / 3866 свободны");
  const psOut = spawnSync("bash", ["-c", "ps -eo pid,args | grep -E '[v]ite\\.js|[-]-import tsx index\\.ts|[s]tripe-mock\\.mjs' || true"], { encoding: "utf8" }).stdout.trim();
  ok(psOut === "", "сирот vite/tsx/мока нет", psOut);
  const dv3 = devBilling();
  ok(dv3.rc === 0 && dv3.fail === 0 && !/порт .* занят/.test(dv3.out) && /vite →/.test(dv3.out), `повторный запуск после --stop проходит без «порт занят» (rc=${dv3.rc})`, dv3.out.slice(-900));
  ok(await httpOk(`${UI}/`) && await httpOk(`${API}/health`), "стенд снова отвечает");
  const st2 = devBilling("--stop");
  ok(st2.rc === 0 && st2.fail === 0 && !(await portBusy(5199)), "второй --stop чист, 5199 свободен");
  const st3 = devBilling("--stop");
  ok(st3.rc === 0 && st3.created === 3 && st3.skip === 4, "--stop на погашенном стенде: процессов нет (skip×3 + .env.local), три порта свободны", `created=${st3.created} skip=${st3.skip}`);
  const status = devBilling("--status");
  ok(status.rc === 0 && /не запущен/.test(status.out) && !/pid/.test(status.out), "--status на погашенном стенде — всё «не запущен»");

  /* ── уборка ──────────────────────────────────────────────────────── */
  await db.delete(userSubscriptions).where(eq(userSubscriptions.userId, row.id));
  await db.delete(transactions).where(eq(transactions.userId, row.id));
  await db.delete(users).where(eq(users.id, row.id));
} catch (e) {
  failed++; fails.push("ИСКЛЮЧЕНИЕ: " + (e?.stack ?? e));
  console.error(e);
} finally {
  try { await browser?.close(); } catch {}
  if (!stopped) { try { devBilling("--stop"); } catch {} }
  try { if (hadEnvLocal) { copyFileSync(ENV_BAK, ENV_LOCAL); unlinkSync(ENV_BAK); } else if (existsSync(ENV_LOCAL)) unlinkSync(ENV_LOCAL); } catch {}
  await closeDb().catch(() => {});
  await closeRedis().catch(() => {});
  console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗`);
  if (fails.length) console.log("Провалы:\n  - " + fails.join("\n  - "));
  process.exit(failed ? 1 : 0);
}
