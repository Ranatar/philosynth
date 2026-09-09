/**
 * Тестовые запросы 2–8 беседы 8.3 (тарифы — посев и заведение Prices) —
 * одним заходом против НАСТОЯЩЕГО стенда tools/dev-billing.sh (мок Stripe →
 * сервер :3000 → vite :5199; .env.local из .env.local.example с
 * STRIPE_PRICE_*=price_mock_*), браузер puppeteer-core + Chrome:
 *  R2  seed-plans БЕЗ STRIPE_PRICE_* (дочерний процесс без переменных): три
 *      плана is_active=false, вывод с предупреждением по каждому; GET
 *      /billing/plans → [] (activeOnly), не ошибка;
 *  R3  seed-plans С STRIPE_PRICE_* (мок-id стенда): активны, GET /billing/plans
 *      — три позиции по возрастанию цены; секция «Подписка» в BillingPage →
 *      «Выбрать тариф» → таблица трёх тарифов с ценами и квотами;
 *  R4  идемпотентность: повтор → skip ×3; правка цены ОДНОГО плана (описание
 *      с изменённой ценой pro передано seedPlans как plans.ts) → updated
 *      только у него, changed = [priceUsd]; возврат → updated pro снова;
 *      admin_audit plan.seeded — по строке на created/updated, ноль на skip;
 *  R5  заслон: подписка на starter (incomplete через API), STRIPE_PRICE_STARTER
 *      изменён → fail с объяснением, строка не тронута, соседи skip; после
 *      canceled смена разрешена (и откачена назад);
 *  R6  stripe-create-prices на моке стенда: первый запуск создаёт Product+Price
 *      ×3 (счётчики мока), второй находит по lookup_key (skip ×3, счётчики те
 *      же, строки STRIPE_PRICE_* совпадают);
 *  R7  edge: пустой STRIPE_SECRET_KEY → отказ до первого запроса (счётчик
 *      запросов мока не растёт, rc=1); убыточная квота → fail seed-plans
 *      с расчётом, строка не тронута;
 *  R8  подписка целиком в браузере: «Выбрать тариф» → «Оформить» Starter →
 *      «ожидает оплаты» (incomplete) → stripe-emit invoice.paid → «Обновить»
 *      → «активна», квоты 3/5/5/10 видны → «Отменить подписку» →
 *      cancel_at_period_end (UI + БД + мок) → «Возобновить» → снова без
 *      пометки отмены.
 * Запуск из корня: node_modules/.bin/tsx tests/test-83-requests2-8.mjs
 * Требует живых PG/Redis, смигрированной и посеянной БД (prompts/configs/
 * taxonomy не нужны — сервер стартует и без них), node_modules, Chrome.
 * Планы starter/pro/academic после прогона остаются в БД активными с
 * price_mock_* (состояние посева стенда).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, copyFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import net from "node:net";

import puppeteer from "puppeteer-core";

const ROOT = new URL("../", import.meta.url).pathname;
const UI = "http://127.0.0.1:5199";
const API = "http://127.0.0.1:3000/api/v1";
const MOCK = "http://127.0.0.1:3866";
const CHROME = process.env.CHROME_PATH ?? "/opt/google/chrome/chrome";
const ENV_LOCAL = ROOT + ".env.local";
const ENV_BAK = ROOT + ".env.local.t83-bak";
const TSX = ROOT + "node_modules/.bin/tsx";

process.env.DATABASE_URL ??= "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.REDIS_URL ??= "redis://localhost:6379";
// Наценка стенда (== .env.local.example): seedPlans в этом процессе берёт env.stripe.billingMarkup
process.env.BILLING_MARKUP ??= "1.2";

let passed = 0, failed = 0; const fails = [];
function ok(cond, name, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
const J = (x) => JSON.stringify(x);
const T = (id) => `[data-testid="${id}"]`;
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

const { db, closeDb } = await import("../server/db/index.js");
const schema = await import("../server/db/schema.js");
const { closeRedis } = await import("../server/redis.js");
const { eq, like, asc, and, inArray } = await import("drizzle-orm");
const { users, transactions, userSubscriptions, subscriptionPlans, adminAudit } = schema;
const { PLANS, priceEnvVarFor, computePlanEconomics } = await import("../server/config/plans.js");
const { seedPlans } = await import("../scripts/seed-plans.js");

/* ── утилиты ─────────────────────────────────────────────────────────── */
const portBusy = (port) => new Promise((res) => {
  const s = net.connect({ host: "127.0.0.1", port });
  s.once("connect", () => { s.destroy(); res(true); });
  s.once("error", () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 700);
});
const httpOk = async (url) => { try { return (await fetch(url)).ok; } catch { return false; } };
function devBilling(...args) {
  const r = spawnSync("bash", [ROOT + "tools/dev-billing.sh", ...args], { cwd: ROOT, encoding: "utf8", env: { ...process.env, HEALTH_WAIT_SEC: "90" } });
  const out = strip((r.stdout ?? "") + (r.stderr ?? ""));
  const m = out.match(/created=(\d+) skip=(\d+) fail=(\d+)/);
  return { rc: r.status, out, created: m ? +m[1] : null, skip: m ? +m[2] : null, fail: m ? +m[3] : null };
}
const readEnvLocal = () => Object.fromEntries(readFileSync(ENV_LOCAL, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
/** Окружение дочерних скриптов: базовое минус STRIPE_PRICE_*, плюс overrides */
function childEnv(overrides = {}) {
  const e = { ...process.env };
  for (const k of Object.keys(e)) if (k.startsWith("STRIPE_PRICE_")) delete e[k];
  return { ...e, ...overrides };
}
function runScript(rel, env, args = []) {
  const r = spawnSync(TSX, [ROOT + rel, ...args], { cwd: ROOT, encoding: "utf8", env });
  const out = strip((r.stdout ?? "") + (r.stderr ?? ""));
  const m = out.match(/created=(\d+), (?:updated=(\d+), )?skip=(\d+), fail=(\d+)/);
  return { rc: r.status, out, created: m ? +m[1] : null, updated: m && m[2] !== undefined ? +m[2] : null, skip: m ? +m[3] : null, fail: m ? +m[4] : null };
}
function emit(...args) {
  const r = spawnSync(process.execPath, [ROOT + "tools/stripe-emit.mjs", ...args], { cwd: ROOT, encoding: "utf8", env: { ...process.env, STRIPE_WEBHOOK_SECRET: "" } });
  return { rc: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
const mockHealth = async () => (await fetch(`${MOCK}/__mock/health`)).json();
const plansInDb = async () => db.select().from(subscriptionPlans).where(inArray(subscriptionPlans.name, ["starter", "pro", "academic"])).orderBy(asc(subscriptionPlans.priceUsd));
const auditCount = async () => (await db.select({ id: adminAudit.id }).from(adminAudit).where(eq(adminAudit.action, "plan.seeded"))).length;
const userByEmail = async (email) => (await db.select().from(users).where(eq(users.email, email)))[0];
const text = (page, sel) => page.$eval(sel, (el) => el.innerText);

/** API-клиент с cookie-сессией (billing-роуты требуют requireAuth). */
async function apiSession(email, password) {
  await fetch(`${API}/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: J({ email, password }) });
  const login = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: J({ email, password }) });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const call = async (method, path, body) => {
    const r = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", cookie }, ...(body ? { body: J(body) } : {}) });
    let json = null; try { json = await r.json(); } catch {}
    return { status: r.status, json };
  };
  return { cookie, call };
}

let browser = null, stopped = false, hadEnvLocal = false;
const cleanupEmails = [];
try {
  hadEnvLocal = existsSync(ENV_LOCAL);
  if (hadEnvLocal) copyFileSync(ENV_LOCAL, ENV_BAK);
  // следы прежних прогонов
  for (const stale of await db.select({ id: users.id }).from(users).where(like(users.email, "t83-%"))) {
    await db.delete(userSubscriptions).where(eq(userSubscriptions.userId, stale.id));
    await db.delete(transactions).where(eq(transactions.userId, stale.id));
    await db.delete(users).where(eq(users.id, stale.id));
  }
  for (const p of [5199, 3000, 3866]) {
    if (await portBusy(p)) throw new Error(`порт ${p} занят до старта — чужой процесс; ps aux | grep -E "[s]erver/index|[v]ite|[s]tripe-mock"`);
  }
  if (existsSync(ENV_LOCAL)) unlinkSync(ENV_LOCAL);

  /* ── стенд ───────────────────────────────────────────────────────── */
  console.log("\n── Стенд: dev-billing.sh (сеет тарифы с 8.3) ──");
  const dv = devBilling();
  ok(dv.rc === 0 && dv.fail === 0, `dev-billing.sh: rc=${dv.rc}, created=${dv.created} skip=${dv.skip} fail=${dv.fail}`, dv.out.slice(-1500));
  ok(/тарифы (?:уже )?посеяны \(npm run seed:plans/.test(dv.out) && /subscription_plans: created=/.test(dv.out), "стенд зовёт npm run seed:plans и показывает его отчёт (created/updated/skip)");
  ok(!/seed:plans нет/.test(dv.out), "прежнего предупреждения «seed:plans нет» больше нет");
  ok(await httpOk(`${MOCK}/__mock/health`) && await httpOk(`${API}/health`) && await httpOk(`${UI}/`), "мок :3866, сервер :3000, vite :5199 отвечают");
  const envLocal = readEnvLocal();
  ok(envLocal.STRIPE_PRICE_STARTER === "price_mock_starter" && envLocal.STRIPE_PRICE_PRO === "price_mock_pro" && envLocal.STRIPE_PRICE_ACADEMIC === "price_mock_academic", ".env.local из образца несёт price_mock_* для трёх тарифов");
  const MOCK_PRICES = { STRIPE_PRICE_STARTER: envLocal.STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO: envLocal.STRIPE_PRICE_PRO, STRIPE_PRICE_ACADEMIC: envLocal.STRIPE_PRICE_ACADEMIC };
  const seededRows = await plansInDb();
  ok(seededRows.length === 3 && seededRows.every((p) => p.isActive) && seededRows.map((p) => p.stripePriceId).join() === "price_mock_starter,price_mock_pro,price_mock_academic", "после стенда: три плана активны с price_mock_*", J(seededRows.map((p) => [p.name, p.isActive, p.stripePriceId])));

  const apiUser = await apiSession(`t83-api-${Date.now()}@test.local`, "Passw0rd!123");
  cleanupEmails.push(`t83-api-`);
  const plansViaApi = async () => apiUser.call("GET", "/billing/plans");

  /* ── R2: без STRIPE_PRICE_* ──────────────────────────────────────── */
  console.log("\n── R2: seed-plans без STRIPE_PRICE_* ──");
  const r2 = runScript("scripts/seed-plans.ts", childEnv());
  ok(r2.rc === 0 && r2.fail === 0 && r2.updated === 3, `seed-plans без переменных: rc=0, updated=3 (isActive → false), fail=0`, r2.out.slice(-1200));
  ok(/ВНИМАНИЕ: 3 из 3 тарифов заведены НЕАКТИВНЫМИ/.test(r2.out), "громкое предупреждение: 3 из 3 неактивны");
  for (const p of PLANS) ok(new RegExp(`${priceEnvVarFor(p.name)} не задана → план «${p.name}» is_active=false`).test(r2.out), `предупреждение по ${priceEnvVarFor(p.name)}`);
  ok(/stripe:create-prices/.test(r2.out) && /НЕ означает, что посев не запускался/.test(r2.out), "подсказка: stripe:create-prices, «страница пуста ≠ скрипт не запускали»");
  ok((r2.out.match(/INACTIVE/g) ?? []).length === 3, "три строки отчёта помечены INACTIVE");
  const r2rows = await plansInDb();
  ok(r2rows.every((p) => !p.isActive), "БД: is_active=false у всех трёх");
  ok(r2rows.map((p) => p.stripePriceId).join() === "price_mock_starter,price_mock_pro,price_mock_academic", "сохранённые stripe_price_id НЕ затёрты пустотой");
  const plansEmpty = await plansViaApi();
  ok(plansEmpty.status === 200 && Array.isArray(plansEmpty.json?.plans) && plansEmpty.json.plans.length === 0, "GET /billing/plans → 200 { plans: [] } (activeOnly), не ошибка", J(plansEmpty));
  const r2b = runScript("scripts/seed-plans.ts", childEnv());
  ok(r2b.rc === 0 && r2b.skip === 3 && /ВНИМАНИЕ/.test(r2b.out), "повтор без переменных: skip ×3, предупреждение по-прежнему громкое", r2b.out.slice(-600));

  /* ── R3: с STRIPE_PRICE_* ────────────────────────────────────────── */
  console.log("\n── R3: seed-plans с STRIPE_PRICE_* → активны → /plans → BillingPage ──");
  const r3 = runScript("scripts/seed-plans.ts", childEnv(MOCK_PRICES));
  ok(r3.rc === 0 && r3.updated === 3 && r3.fail === 0 && !/ВНИМАНИЕ/.test(r3.out), "seed-plans с переменными: updated ×3 (isActive → true), без предупреждения", r3.out.slice(-800));
  ok((r3.out.match(/изменены: isActive$/gm) ?? []).length === 3, "у каждого изменён ровно isActive");
  const r3rows = await plansInDb();
  ok(r3rows.every((p) => p.isActive), "БД: is_active=true у всех трёх");
  const plans3 = await plansViaApi();
  ok(plans3.status === 200 && plans3.json.plans.length === 3, "GET /billing/plans → три позиции", J(plans3.json));
  ok(plans3.json.plans.map((p) => p.name).join() === "starter,pro,academic" && plans3.json.plans.map((p) => p.priceUsd).join() === "9.99,29.99,79.99", "порядок по возрастанию цены: starter 9.99, pro 29.99, academic 79.99");
  const starterDto = plans3.json.plans[0];
  ok(starterDto.quotaSyntheses === 3 && starterDto.quotaRegenerations === 5 && starterDto.quotaModes === 5 && starterDto.quotaEnrichments === 10 && starterDto.stripePriceId === "price_mock_starter" && starterDto.billingPeriod === "month", "DTO starter: квоты 3/5/5/10, price_mock_starter, month", J(starterDto));

  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.googleapis|401|Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
  const email = `t83-user-${Date.now()}@test.local`, password = "Passw0rd!123";
  cleanupEmails.push("t83-user-");
  await page.goto(`${UI}/register`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.type('input[type="email"]', email);
  for (const inp of await page.$$('input[type="password"]')) await inp.type(password);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !/\/register$/.test(location.pathname), { timeout: 20000 });
  if (/\/login/.test(page.url())) {
    await page.waitForSelector('input[type="email"]', { timeout: 20000 });
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => !/\/login$/.test(location.pathname), { timeout: 20000 });
  }
  const row = await userByEmail(email);
  ok(!!row, "регистрация через браузер стенда: пользователь в БД", email);

  const openBilling = async () => {
    await page.goto(`${UI}/billing`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(T("billing-page"), { timeout: 20000 });
    // секция подписки грузится СВОИМ запросом — ждать её отдельно (09 §9 п.8)
    await page.waitForFunction(() => { const el = document.querySelector('[data-testid="billing-subscription"]'); return el && !/Загрузка…/.test(el.innerText); }, { timeout: 20000 });
  };
  await openBilling();
  ok(await page.$(T("sub-absent")) !== null, "секция подписки: подписки нет (новый пользователь)");
  await page.$eval(T("sub-choose"), (el) => el.click());
  await page.waitForSelector(T("sub-plans"), { timeout: 15000 });
  await page.waitForFunction(() => !/Загрузка тарифов/.test(document.querySelector('[data-testid="sub-plans"]')?.innerText ?? ""), { timeout: 15000 });
  const planRows = await page.$$eval(`${T("sub-plans")} tbody tr`, (trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.trim())));
  ok(planRows.length === 3, "таблица тарифов: три строки", J(planRows));
  ok(planRows.map((r) => r[0]).join() === "Starter,Pro,Academic", "порядок Starter / Pro / Academic");
  const priceCell = (r) => r[1].replace(/\s+/g, " ");
  ok(/\$9\.99/.test(priceCell(planRows[0])) && /\$29\.99/.test(priceCell(planRows[1])) && /\$79\.99/.test(priceCell(planRows[2])), "цены $9.99 / $29.99 / $79.99 (за месяц)", J(planRows.map(priceCell)));
  ok(planRows[0].slice(2, 6).join() === "3,5,5,10" && planRows[1].slice(2, 6).join() === "9,15,15,25" && planRows[2].slice(2, 6).join() === "24,35,35,80", "квоты в таблице совпадают с plans.ts", J(planRows.map((r) => r.slice(2, 6))));
  for (const n of ["starter", "pro", "academic"]) ok(await page.$(T(`sub-plan-${n}`)) !== null, `кнопка «Оформить» у ${n}`);
  ok(consoleErrors.length === 0, "ошибок страницы/консоли нет", J(consoleErrors));

  /* ── R4: идемпотентность ─────────────────────────────────────────── */
  console.log("\n── R4: идемпотентность и правка цены ──");
  const audit0 = await auditCount();
  const r4 = runScript("scripts/seed-plans.ts", childEnv(MOCK_PRICES));
  ok(r4.rc === 0 && r4.skip === 3 && r4.created === 0 && r4.updated === 0, "повторный прогон → skip ×3", r4.out.slice(-600));
  ok(await auditCount() === audit0, "skip не пишет строк admin_audit");
  const pricedUp = PLANS.map((p) => (p.name === "pro" ? { ...p, priceUsd: 34.99 } : p));
  const r4b = await seedPlans({ plans: pricedUp, envSource: MOCK_PRICES, markup: 1.2 });
  ok(r4b.counts.updated === 1 && r4b.counts.skip === 2 && r4b.counts.fail === 0, "правка цены pro в описании → updated только у pro", J(r4b.counts));
  const proRes = r4b.results.find((r) => r.name === "pro");
  ok(proRes.outcome === "updated" && J(proRes.changed) === '["priceUsd"]', "changed у pro = [priceUsd]", J(proRes));
  ok(Number((await plansInDb()).find((p) => p.name === "pro").priceUsd) === 34.99, "БД: pro = 34.99");
  const [auditRow] = await db.select().from(adminAudit).where(eq(adminAudit.action, "plan.seeded")).orderBy(asc(adminAudit.createdAt)).then((rows) => rows.slice(-1));
  ok(auditRow?.targetType === "subscription_plan" && auditRow.targetId === "pro" && auditRow.actorId === null && auditRow.details.outcome === "updated" && J(auditRow.details.changed) === '["priceUsd"]', "admin_audit plan.seeded: target pro, actor NULL, details.changed=[priceUsd]", J(auditRow));
  ok(await auditCount() === audit0 + 1, "одна строка журнала на один updated");
  const r4c = runScript("scripts/seed-plans.ts", childEnv(MOCK_PRICES));
  ok(r4c.updated === 1 && r4c.skip === 2 && /updated pro:.*изменены: priceUsd/.test(r4c.out), "возврат к plans.ts → updated pro (цена назад), остальные skip", r4c.out.slice(-600));
  ok(Number((await plansInDb()).find((p) => p.name === "pro").priceUsd) === 29.99, "БД: pro снова 29.99");

  /* ── R5: заслон живых подписок ───────────────────────────────────── */
  console.log("\n── R5: заслон смены Price при действующей подписке ──");
  const starterRow = (await plansInDb()).find((p) => p.name === "starter");
  const sub5 = await apiUser.call("POST", "/billing/subscribe", { planId: starterRow.id });
  ok(sub5.status === 201 && sub5.json.subscription?.status === "incomplete", "подписка API-пользователя на starter → incomplete", J(sub5.json));
  const r5 = runScript("scripts/seed-plans.ts", childEnv({ ...MOCK_PRICES, STRIPE_PRICE_STARTER: "price_mock_starter_v2" }));
  ok(r5.rc === 1 && r5.fail === 1 && r5.skip === 2, "STRIPE_PRICE_STARTER изменён → fail ×1 (rc=1), соседи skip", r5.out.slice(-900));
  ok(/FAIL\s+starter: stripe_price_id плана «starter» уже price_mock_starter, а STRIPE_PRICE_STARTER=price_mock_starter_v2; на плане 1 действующих подписок/.test(r5.out) && /сменить Price у живой подписки нельзя/.test(r5.out), "объяснение: прежний и новый Price, число действующих подписок, почему нельзя");
  const starterAfter = (await plansInDb()).find((p) => p.name === "starter");
  ok(starterAfter.stripePriceId === "price_mock_starter" && starterAfter.isActive && J({ ...starterAfter, createdAt: 0 }) === J({ ...starterRow, createdAt: 0 }), "строка starter в БД не тронута");
  ok(await auditCount() === audit0 + 2, "fail строки журнала не пишет");
  // incomplete тоже держит Price; canceled — отпускает
  const em5 = emit("customer.subscription.deleted", sub5.json.subscriptionId);
  ok(em5.rc === 0 && /"action":"canceled"/.test(em5.out), "emit subscription.deleted → подписка canceled");
  const r5b = runScript("scripts/seed-plans.ts", childEnv({ ...MOCK_PRICES, STRIPE_PRICE_STARTER: "price_mock_starter_v2" }));
  ok(r5b.rc === 0 && r5b.updated === 1 && /updated starter:.*изменены: stripePriceId/.test(r5b.out), "после canceled смена Price разрешена (updated starter)", r5b.out.slice(-500));
  const r5c = runScript("scripts/seed-plans.ts", childEnv(MOCK_PRICES));
  ok(r5c.updated === 1 && (await plansInDb()).find((p) => p.name === "starter").stripePriceId === "price_mock_starter", "откат к price_mock_starter");

  /* ── R6: stripe-create-prices на моке ────────────────────────────── */
  console.log("\n── R6: stripe-create-prices против мока стенда ──");
  const h0 = await mockHealth();
  const scEnv = { ...process.env, STRIPE_SECRET_KEY: envLocal.STRIPE_MOCK_SECRET_KEY ?? "sk_test_mock", STRIPE_API_BASE: MOCK };
  const r6 = runScript("scripts/stripe-create-prices.ts", scEnv);
  ok(r6.rc === 0 && r6.created === 3 && r6.fail === 0, "первый запуск: created ×3", r6.out.slice(-900));
  ok(/НЕ api\.stripe\.com — мок\/прокси/.test(r6.out) && /ключ test/.test(r6.out), "шапка: база API — мок, ключ test");
  const h1 = await mockHealth();
  ok(h1.counts.products === h0.counts.products + 3 && h1.counts.prices === h0.counts.prices + 3, "мок: +3 Product, +3 Price", J([h0.counts, h1.counts]));
  const lines6 = r6.out.match(/^\s*STRIPE_PRICE_(STARTER|PRO|ACADEMIC)=price_\S+$/gm) ?? [];
  ok(lines6.length === 3, "напечатаны три строки STRIPE_PRICE_*=price_…", J(lines6));
  const r6b = runScript("scripts/stripe-create-prices.ts", scEnv);
  ok(r6b.rc === 0 && r6b.skip === 3 && r6b.created === 0, "второй запуск: skip ×3 по lookup_key", r6b.out.slice(-700));
  ok(/найден price_\S+ по lookup_key philosynth_starter/.test(r6b.out), "skip называет найденный price и lookup_key");
  const h2 = await mockHealth();
  ok(h2.counts.products === h1.counts.products && h2.counts.prices === h1.counts.prices, "дубликатов не создано");
  const lines6b = r6b.out.match(/^\s*STRIPE_PRICE_(STARTER|PRO|ACADEMIC)=price_\S+$/gm) ?? [];
  ok(J(lines6b.map((l) => l.trim())) === J(lines6.map((l) => l.trim())), "строки STRIPE_PRICE_* совпадают с первым запуском");

  /* ── R7: edge cases ──────────────────────────────────────────────── */
  console.log("\n── R7: пустой STRIPE_SECRET_KEY; убыточная квота ──");
  const h3 = await mockHealth();
  const r7 = runScript("scripts/stripe-create-prices.ts", { ...scEnv, STRIPE_SECRET_KEY: "" });
  ok(r7.rc === 1 && /STRIPE_SECRET_KEY пуст/.test(r7.out) && /Ни одного запроса к Stripe не сделано/.test(r7.out), "пустой ключ → отказ с объяснением, rc=1", r7.out.slice(-500));
  // /__mock/health сам считается запросом мока: после h3 ровно +1 (наш опрос), ничего от скрипта
  ok(!/created=|skip=/.test(r7.out) && (await mockHealth()).counts.requests === h3.counts.requests + 1, "ни одного запроса к моку — отказ до первого запроса");
  const lossy = PLANS.map((p) => (p.name === "starter" ? { ...p, quotaSyntheses: 100 } : p));
  const econ = computePlanEconomics(lossy[0], 1.2);
  const r7b = await seedPlans({ plans: lossy, envSource: MOCK_PRICES, markup: 1.2 });
  const starterFail = r7b.results.find((r) => r.name === "starter");
  ok(starterFail.outcome === "fail" && /убыточен/.test(starterFail.error) && /BILLING_MARKUP 1\.2/.test(starterFail.error) && r7b.counts.skip === 2, "квота 100 синтезов при цене $9.99 → fail с расчётом, соседи skip", J(starterFail));
  ok(new RegExp(`\\$${econ.quotaChargeUsd.toFixed(2).replace(".", "\\.")}`).test(starterFail.error), "в объяснении — сумма квоты × наценки из computePlanEconomics", starterFail.error);
  ok((await plansInDb()).find((p) => p.name === "starter").quotaSyntheses === 3, "строка starter не тронута (quota_syntheses = 3)");
  const r7c = runScript("scripts/seed-plans.ts", childEnv({ ...MOCK_PRICES, BILLING_MARKUP: "3" }));
  ok(r7c.rc === 1 && r7c.fail === 3 && /BILLING_MARKUP 3 =/.test(r7c.out), "BILLING_MARKUP=3 в окружении → все три тарифа fail (наценка читается при посеве)", r7c.out.slice(-700));
  ok((await plansInDb()).every((p) => p.isActive && Number(p.priceUsd) > 0), "БД после отказов — как была");

  /* ── R8: подписка целиком в браузере ─────────────────────────────── */
  console.log("\n── R8: подписка целиком (браузер) ──");
  await openBilling();
  await page.$eval(T("sub-choose"), (el) => el.click());
  await page.waitForSelector(T("sub-plan-starter"), { timeout: 15000 });
  await page.$eval(T("sub-plan-starter"), (el) => el.click());
  // статус-сообщение «…ожидает оплаты первого инвойса» появляется ДО reload(); ждать сам sub-status
  await page.waitForSelector(T("sub-status"), { timeout: 20000 });
  await page.waitForFunction(() => /ожидает оплаты/i.test(document.querySelector('[data-testid="sub-status"]')?.innerText ?? ""), { timeout: 20000 });
  ok(true, "«Оформить» Starter → карточка подписки со статусом «ожидает оплаты» (incomplete до webhook)");
  ok(/ожидает оплаты/i.test(await text(page, T("sub-status"))), "sub-status = «ожидает оплаты»");
  ok(/Starter/.test(await text(page, T("sub-plan"))), "sub-plan = Starter");
  let subRow = (await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, row.id)))[0];
  ok(subRow?.status === "incomplete" && subRow.planId === starterRow.id && /^sub_/.test(subRow.stripeSubscriptionId), "БД: user_subscriptions incomplete на starter", J(subRow));
  const mockSub = (await mockHealth()).counts.subscriptions;
  ok(mockSub >= 2, "мок: Subscription создана (customer из ensureStripeCustomer)", String(mockSub));
  ok(await page.$(T("sub-cancel")) === null && await page.$(T("sub-choose")) !== null, "до оплаты кнопки «Отменить» нет, «Выбрать тариф» есть (не billable)");
  const em8 = emit("invoice.paid", subRow.stripeSubscriptionId);
  ok(em8.rc === 0 && /"action":"period_reset"/.test(em8.out), "stripe-emit invoice.paid → period_reset", em8.out.trim());
  await page.$eval(T("sub-refresh"), (el) => el.click());
  await page.waitForFunction(() => /^активна$/i.test(document.querySelector('[data-testid="sub-status"]')?.innerText.trim() ?? ""), { timeout: 20000 });
  ok(true, "«Обновить» → статус «активна»");
  const quotaRows = await page.$$eval(`${T("sub-quotas")} tbody tr`, (trs) => trs.map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.trim())));
  ok(quotaRows.length === 4 && quotaRows.map((r) => r[2]).join() === "3,5,5,10" && quotaRows.every((r) => r[1] === "0") && quotaRows.map((r) => r[3]).join() === "3,5,5,10", "квоты видны: лимиты 3/5/5/10, использовано 0, остаток = лимит", J(quotaRows));
  subRow = (await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, row.id)))[0];
  ok(subRow.status === "active" && subRow.usedSyntheses === 0, "БД: active, счётчики 0");
  const subApi = await page.evaluate(async () => (await fetch("/api/v1/billing/subscription")).json());
  ok(subApi.plan?.name === "starter" && subApi.quotas.syntheses === 3 && subApi.quotas.enrichments === 10, "GET /billing/subscription: план starter, квоты из посева", J(subApi.quotas));
  // cancel
  await page.$eval(T("sub-cancel"), (el) => el.click());
  await page.waitForSelector(T("sub-resume"), { timeout: 20000 });
  ok(/отмена в конце периода/i.test(await text(page, T("billing-subscription"))), "«Отменить подписку» → пометка «отмена в конце периода», кнопка «Возобновить»");
  subRow = (await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, row.id)))[0];
  ok(subRow.cancelAtPeriodEnd === true && subRow.status === "active", "БД: cancel_at_period_end = true, статус active до конца периода");
  ok(/будет отменена в конце периода/i.test(await text(page, T("billing-subscription"))), "статус-сообщение об отмене");
  const mockSubReq = await (await fetch(`${MOCK}/__mock/health`)).json();
  ok(mockSubReq.counts.requests > 0, "мок получил POST /v1/subscriptions/:id (cancel_at_period_end)");
  ok(/активна/i.test(await text(page, T("sub-status"))), "статус по-прежнему «активна»");
  // resume
  await page.$eval(T("sub-resume"), (el) => el.click());
  await page.waitForSelector(T("sub-cancel"), { timeout: 20000 });
  ok(!/отмена в конце периода/i.test(await text(page, T("sub-status") + " + .stat-label")), "«Возобновить» → пометки отмены нет, снова «Отменить подписку»");
  subRow = (await db.select().from(userSubscriptions).where(eq(userSubscriptions.userId, row.id)))[0];
  ok(subRow.cancelAtPeriodEnd === false && subRow.status === "active", "БД: cancel_at_period_end = false, active");
  ok(/возобновлена/i.test(await text(page, T("billing-subscription"))), "статус-сообщение «Подписка возобновлена»");
  ok(consoleErrors.length === 0, "ошибок страницы/консоли за прогон нет", J(consoleErrors));

  /* ── teardown ────────────────────────────────────────────────────── */
  console.log("\n── teardown ──");
  await browser.close(); browser = null;
  const st = devBilling("--stop");
  stopped = true;
  ok(st.rc === 0 && st.fail === 0, `--stop: rc=${st.rc}, fail=${st.fail}`, st.out.slice(-600));
  await sleep(500);
  ok(!(await portBusy(5199)) && !(await portBusy(3000)) && !(await portBusy(3866)), "порты 5199 / 3000 / 3866 свободны");
  const finalRows = await plansInDb();
  ok(finalRows.length === 3 && finalRows.every((p) => p.isActive) && finalRows.map((p) => p.stripePriceId).join() === "price_mock_starter,price_mock_pro,price_mock_academic", "планы оставлены в состоянии посева стенда (активны, price_mock_*)");
} catch (e) {
  failed++; fails.push("ИСКЛЮЧЕНИЕ: " + (e?.stack ?? e));
  console.error(e);
} finally {
  try { await browser?.close(); } catch {}
  if (!stopped) { try { devBilling("--stop"); } catch {} }
  try {
    for (const prefix of new Set(cleanupEmails)) {
      for (const u of await db.select({ id: users.id }).from(users).where(like(users.email, `${prefix}%`))) {
        await db.delete(userSubscriptions).where(eq(userSubscriptions.userId, u.id));
        await db.delete(transactions).where(eq(transactions.userId, u.id));
        await db.delete(users).where(eq(users.id, u.id));
      }
    }
  } catch {}
  try { if (hadEnvLocal) { copyFileSync(ENV_BAK, ENV_LOCAL); unlinkSync(ENV_BAK); } else if (existsSync(ENV_LOCAL)) unlinkSync(ENV_LOCAL); } catch {}
  await closeDb().catch(() => {});
  await closeRedis().catch(() => {});
  console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗`);
  if (fails.length) console.log("Провалы:\n  - " + fails.join("\n  - "));
  process.exit(failed ? 1 : 0);
}
