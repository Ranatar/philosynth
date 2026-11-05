/**
 * Беседа 15.4 — тестовые запросы 2–4 одним харнессом (тарифы — админка
 * редакциями и согласие подписки с тарифом; Д-74, Д-75). Живой сервер :3000
 * с моком Stripe В ПРОЦЕССЕ ХАРНЕССА (tools/stripe-mock.mjs; STRIPE_API_BASE,
 * STRIPE_WEBHOOK_SECRET пуст — события без подписи) + PG16/Redis + СБОРКА
 * клиента (vite build) под vite preview :5230 + Chrome 131 (CHROME_PATH).
 *
 *  R2  Д-74 на моке живьём (HTTP): план без подписок — правка цены создаёт
 *      новый Price (lookup_key переехал), прежний active=false; план с
 *      подпиской (оформлена POST /billing/subscribe через мок — incomplete,
 *      живая) — правка квот отклонена 409 с lockedFields, название и
 *      «открыт» правятся; «новая редакция» создаёт строку <family>-v2 и
 *      Price, прежняя закрыта (GET /billing/plans без неё, /subscribe → 404);
 *      подписчик сохраняет прежние квоты и plan_id (GET /billing/subscription);
 *      новый покупатель получает новую редакцию; каждое действие — строка
 *      admin_audit (GET /auth/audit: plan.created/updated/edition с актором).
 *  R3  Д-75 живьём: `npm run seed:plans` (дочерний процесс) при строке
 *      academic, изменённой админкой, — предупреждение «расходятся с
 *      plans.ts» с полем, строка НЕ переписана, exit 0, в отчёте нет
 *      updated; seedPlans с изменёнными квотами (plans как plans.ts) — skip +
 *      diverged; `node tools/stripe-emit.mjs customer.subscription.updated
 *      <sub> --price <Price редакции 2>` → plan_id перенесён (handled,
 *      action updated_plan); с неизвестным Price — предупреждение в логе
 *      сервера, строка не тронута; без --price — статус, plan_id цел.
 *  R4  Браузер (Chrome 131, сборка клиента): вкладка «Тарифы» (строки с
 *      редакциями, живыми подписками, открыт/закрыт); форма правки плана с
 *      живой подпиской — цена/период/квоты заперты с подсказкой, название
 *      правится и сохраняется; «Новая редакция» — второй шаг (предупреждение
 *      о подписчиках, «Точно завести?»), после — новая строка открыта,
 *      прежняя закрыта; журнал на вкладке «Доступ» подписывает plan.*;
 *      стартовая страница и BillingPage показывают только открытые редакции;
 *      пользователю вкладки нет.
 *
 * Запуск (≈ 1,5 мин): node_modules/.bin/tsx tests/test-154-requests2-4.mjs [R2 R3 R4]
 * Предпосылки: PG16 + Redis, миграции и сиды (starter/pro/academic посеяны);
 * `npm i --no-save puppeteer-core@23`; Chrome 131 (chrome/README.md) либо CHROME_PATH;
 * лог сервера — /tmp/t154-server.log.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import postgres from "postgres";
import { createStripeMock } from "../tools/stripe-mock.mjs";

const ONLY = process.argv.slice(2);
const want = (r) => ONLY.length === 0 || ONLY.includes(r);
const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5230, MOCK_PORT = 3867;
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${UI_PORT}`;
const CHROME = [process.env.CHROME_PATH, `${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`].find((p) => p && existsSync(p));
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (id) => `[data-testid="${id}"]`;
const SERVER_LOG = "/tmp/t154-server.log";
const STRIPE_KEY = "sk_test_t154";
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}
const TAG = "t154-" + Math.random().toString(36).slice(2, 6);
const PW = "password-154";

/* ── Процессы ────────────────────────────────────────────────────────── */
const procs = [];
function sp(args, cwd, env, logFile) {
  const log = openSync(logFile, "w");
  const p = spawn(process.execPath, args, { cwd, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...env } });
  procs.push(p);
  return p;
}
async function isUp(url) { try { return (await fetch(url)).status < 500; } catch { return false; } }
async function waitUp(url, what) { for (let i = 0; i < 120; i++) { if (await isUp(url)) return; await sleep(500); } throw new Error(`${what} не поднялся: ${url}`); }
const serverLog = () => { try { return readFileSync(SERVER_LOG, "utf8"); } catch { return ""; } };
const SERVER_ENV = { PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", STRIPE_SECRET_KEY: STRIPE_KEY, STRIPE_API_BASE: `http://127.0.0.1:${MOCK_PORT}`, STRIPE_WEBHOOK_SECRET: "", MAIL_TRANSPORT: "console" };

/* ── HTTP ────────────────────────────────────────────────────────────── */
async function call(p, { method = "POST", body, cookie } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(BASE + p, { method, headers, body: body !== undefined ? J(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] || null };
}
const GET = (p, cookie) => call(p, { method: "GET", cookie });
const userIds = [];
async function account(tag, { role = "user" } = {}) {
  const email = `${TAG}-${tag}@example.com`;
  const reg = await call("/auth/register", { body: { email, password: PW, displayName: "Проверяющий " + tag } });
  if (reg.status !== 201 && reg.status !== 200) throw new Error("регистрация: " + reg.text.slice(0, 200));
  const [u] = await sql`update users set role=${role}, email_verified_at=now() where email=${email} returning id`;
  userIds.push(u.id);
  const lr = await call("/auth/login", { body: { email, password: PW } });
  return { id: u.id, email, cookie: lr.cookie };
}

/* ── Браузер ─────────────────────────────────────────────────────────── */
let browser = null, lastPage = null;
async function newPage(who) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setUserAgentOverride", { userAgent: await browser.userAgent(), acceptLanguage: "ru-RU,ru" });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("dialog", (d) => void d.accept());
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  lastPage = page;
  return page;
}
const exists = async (page, sel) => (await page.$(sel)) !== null;
const click = (page, sel) => page.$eval(sel, (el) => el.click());
const text = (page, sel) => page.$eval(sel, (el) => el.textContent ?? "");
const waitSel = (page, sel, ms = 20000) => page.waitForSelector(sel, { timeout: ms });
const waitText = (page, sel, re, ms = 20000) => page.waitForFunction((s, r) => new RegExp(r).test(document.querySelector(s)?.textContent ?? ""), { timeout: ms }, sel, re.source);
async function typeInto(page, sel, value) { await page.$eval(sel, (el) => { el.value = ""; }); await page.focus(sel); await page.keyboard.type(value); }

/* ══ Прогон ═════════════════════════════════════════════════════════════ */
const mock = createStripeMock({ port: MOCK_PORT, bearer: STRIPE_KEY, idTag: "t154", log: () => {} });
const spec = (name) => ({ name, displayName: "Тест 154", priceUsd: 19.99, billingPeriod: "month", quotaSyntheses: 3, quotaRegenerations: 5, quotaModes: 5, quotaEnrichments: 10 });
let A = null, U = null, U2 = null, fam = null, v2 = null, subId = null;
let academicName = null;
const startedAt = new Date();
try {
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`], [`http://127.0.0.1:${MOCK_PORT}/v1/products`, `мок :${MOCK_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  await mock.start();
  if (want("R4")) {
    if (!CHROME) throw new Error("браузер не найден — задайте CHROME_PATH (Chrome 131)");
    console.log("■ Сборка клиента (vite build)");
    const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8", env: { ...process.env, VITE_STRIPE_PUBLISHABLE_KEY: "" } });
    ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
    sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t154-preview.log");
  }
  sp(["--import", "tsx", "index.ts"], ROOT + "server", SERVER_ENV, SERVER_LOG);
  await waitUp(`${BASE}/health`, "сервер");
  if (want("R4")) {
    await waitUp(UI, "preview");
    const puppeteer = (await import("puppeteer-core")).default;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
    console.log(`  (браузер: ${await browser.version()}; клиент — сборка под vite preview)`);
  }
  A = await account("adm", { role: "admin" });
  U = await account("u1");
  U2 = await account("u2");

  /* ════ R2: Д-74 на моке живьём ════ */
  console.log("\n■ R2: Д-74 — цена без подписок, заслон с подпиской, новая редакция, журнал");
  const c = await call("/billing/admin/plans", { body: spec(TAG), cookie: A.cookie });
  fam = c.json?.plan;
  ok(c.status === 201 && fam?.edition === 1 && fam.family === TAG && fam.isActive, "новое семейство заведено админкой (201, редакция 1, открыт)", c.json);
  const price1 = mock.state.prices.get(fam?.stripePriceId);
  ok(price1?.lookup_key === `philosynth_${TAG}` && price1.unit_amount === 1999, "мок: Price редакции 1 с lookup_key философсинта", price1);
  // цена без подписок
  const pr = await call(`/billing/admin/plans/${fam.id}`, { method: "PATCH", body: { priceUsd: 21.99 }, cookie: A.cookie });
  const price2 = mock.state.prices.get(pr.json?.plan?.stripePriceId);
  ok(pr.status === 200 && pr.json.plan.stripePriceId !== fam.stripePriceId && pr.json.retiredPriceId === fam.stripePriceId && price2?.unit_amount === 2199 && price2.lookup_key === `philosynth_${TAG}` && mock.state.prices.get(fam.stripePriceId).active === false, "план без подписок: правка цены → новый Price (lookup_key переехал), прежний выключен", pr.json);
  fam = pr.json.plan;
  // живая подписка через /billing/subscribe (мок → incomplete)
  const s = await call("/billing/subscribe", { body: { planId: fam.id }, cookie: U.cookie });
  ok(s.status === 201 && s.json?.subscriptionId, "пользователь оформил подписку на план через мок (incomplete до invoice.paid)", s.json);
  // subscriptionId ответа — id подписки в Stripe (03 §2.10); строка — по нему
  const [subRow] = await sql`select id, stripe_subscription_id, status, plan_id from user_subscriptions where stripe_subscription_id=${s.json?.subscriptionId ?? ""}`;
  subId = subRow?.id;
  const list = (await GET("/billing/admin/plans", A.cookie)).json.plans;
  ok(subRow?.status === "incomplete" && list.find((p) => p.id === fam.id)?.liveSubscriptions === 1, "список админки: подписка incomplete — живая (status ≠ canceled)", { subRow, live: list.find((p) => p.id === fam.id)?.liveSubscriptions });
  const q = await call(`/billing/admin/plans/${fam.id}`, { method: "PATCH", body: { quotaSyntheses: 4, quotaModes: 6 }, cookie: A.cookie });
  ok(q.status === 409 && q.json?.code === "PLAN_HAS_SUBSCRIPTIONS" && J(q.json.details?.lockedFields) === '["quotaSyntheses","quotaModes"]', "план с подпиской: правка квот отклонена 409 PLAN_HAS_SUBSCRIPTIONS с lockedFields", q.json);
  const pp = await call(`/billing/admin/plans/${fam.id}`, { method: "PATCH", body: { priceUsd: 25 }, cookie: A.cookie });
  ok(pp.status === 409 && mock.state.prices.size === 2, "план с подпиской: правка цены отклонена, Price в Stripe не заведён", pp.json);
  const nm = await call(`/billing/admin/plans/${fam.id}`, { method: "PATCH", body: { displayName: "Тест 154 (переименован)" }, cookie: A.cookie });
  ok(nm.status === 200 && nm.json.plan.displayName === "Тест 154 (переименован)" && nm.json.plan.liveSubscriptions === 1, "план с подпиской: название правится на месте");
  // новая редакция
  const e = await call(`/billing/admin/plans/${fam.id}/editions`, { body: { priceUsd: 24.99, quotaSyntheses: 5 }, cookie: A.cookie });
  v2 = e.json?.plan;
  ok(e.status === 201 && v2?.name === `${TAG}-v2` && v2.edition === 2 && v2.isActive && v2.quotaSyntheses === 5 && e.json.previous?.isActive === false, "«новая редакция» → строка -v2 с Price, прежняя закрыта для покупки", e.json);
  const price3 = mock.state.prices.get(v2?.stripePriceId);
  ok(price3?.lookup_key === `philosynth_${TAG}-v2` && price3.unit_amount === 2499 && price3.product === price2.product && mock.state.prices.get(fam.stripePriceId).active !== false, "мок: Price редакции 2 под тем же Product; Price редакции 1 жив (подписчик продлевается)", price3);
  const pub = (await GET("/billing/plans")).json.plans;
  ok(!pub.some((p) => p.id === fam.id) && pub.some((p) => p.id === v2.id), "GET /billing/plans: прежняя редакция скрыта, новая видна");
  ok((await call("/billing/subscribe", { body: { planId: fam.id }, cookie: U2.cookie })).status === 404, "POST /subscribe на закрытую редакцию → 404");
  const ov = (await GET("/billing/subscription", U.cookie)).json;
  ok(ov?.plan?.id === fam.id && ov.plan.quotaSyntheses === 3 && ov.quotas?.syntheses === 3, "подписчик: GET /billing/subscription — прежняя редакция, прежние квоты (3 синтеза)", ov?.quotas);
  const s2 = await call("/billing/subscribe", { body: { planId: v2.id }, cookie: U2.cookie });
  const [sub2] = s2.json?.subscriptionId ? await sql`select plan_id from user_subscriptions where stripe_subscription_id=${s2.json.subscriptionId}` : [null];
  ok(s2.status === 201 && sub2?.plan_id === v2.id, "новый покупатель получает новую редакцию (plan_id = -v2)");
  const list2 = (await GET("/billing/admin/plans", A.cookie)).json.plans;
  ok(list2.find((p) => p.id === fam.id)?.liveSubscriptions === 1 && list2.find((p) => p.id === v2.id)?.liveSubscriptions === 1, "список админки: по живой подписке у каждой редакции");
  const audit = (await GET("/auth/audit?limit=50", A.cookie)).json.entries.filter((r) => String(r.targetId ?? "").startsWith(TAG));
  const by = (a) => audit.filter((r) => r.action === a);
  ok(by("plan.created").length === 1 && by("plan.updated").length === 2 && by("plan.edition").length === 1 && audit.every((r) => r.actorEmail === A.email), `каждое действие — строка admin_audit с актором (${audit.map((r) => r.action).join(", ")})`);
  ok(by("plan.updated").some((r) => r.details?.previousPriceId && r.details?.changed?.priceUsd) && by("plan.edition")[0]?.details?.previousName === TAG, "details журнала: смена цены несёт previousPriceId и changed, редакция — previousName");
  ok((await GET("/billing/admin/plans", U.cookie)).status === 403 && (await GET("/billing/admin/plans")).status === 401, "маршруты админки: 403 пользователю, 401 гостю");

  /* ════ R3: Д-75 — сид и вебхук ════ */
  if (want("R3")) {
    console.log("\n■ R3: Д-75 — seed:plans не переписывает, вебхук переносит plan_id");
    const [acad] = await sql`select id, display_name, quota_syntheses, is_active, stripe_price_id from subscription_plans where name='academic'`;
    ok(!!acad, "посеянный academic на месте (стенд/сиды)");
    if (acad) {
      academicName = acad.display_name;
      const ren = await call(`/billing/admin/plans/${acad.id}`, { method: "PATCH", body: { displayName: academicName + " (154)" }, cookie: A.cookie });
      ok(ren.status === 200, "academic переименован админкой (строка теперь расходится с plans.ts)");
      const seed = spawnSync("npm", ["run", "-s", "seed:plans"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, STRIPE_PRICE_STARTER: "", STRIPE_PRICE_PRO: "", STRIPE_PRICE_ACADEMIC: "" } });
      const out = (seed.stdout ?? "") + (seed.stderr ?? "");
      ok(seed.status === 0 && /created=0, skip=3 \(расходятся с plans\.ts: [1-3]\), fail=0/.test(out) && !/updated=/.test(out), "npm run seed:plans: rc 0, skip ×3 с числом расхождений, исхода updated нет", out.slice(-600));
      ok(/ПРЕДУПРЕЖДЕНИЕ: [1-3] из 3 тарифов в БД расходятся/.test(out) && /academic\.displayName: в БД .*\(154\), в plans\.ts Academic/.test(out) && /правится админкой/.test(out), "вывод: предупреждение по полю с отсылкой к админке", out.slice(-900));
      const [acad2] = await sql`select display_name, quota_syntheses, is_active, stripe_price_id from subscription_plans where id=${acad.id}`;
      ok(acad2.display_name === academicName + " (154)" && acad2.quota_syntheses === acad.quota_syntheses && acad2.is_active === acad.is_active && acad2.stripe_price_id === acad.stripe_price_id, "строка academic НЕ переписана (название, квоты, активность, Price прежние)");
      const SEED = await import("../scripts/seed/seed-plans.ts");
      const PL = await import("../server/config/plans.ts");
      const sr = await SEED.seedPlans({ envSource: {}, markup: 1.2, plans: [{ ...PL.planByName("academic"), quotaSyntheses: acad.quota_syntheses - 1 }] });
      ok(sr.counts.skip === 1 && sr.results[0].diverged?.some((d) => d.field === "quotaSyntheses" && d.inDb === String(acad.quota_syntheses)), "seedPlans с изменёнными квотами (как plans.ts) → skip + diverged по квоте", sr.results[0]);
      const [acad3] = await sql`select quota_syntheses from subscription_plans where id=${acad.id}`;
      ok(acad3.quota_syntheses === acad.quota_syntheses, "квота academic после сида прежняя");
      const back = await call(`/billing/admin/plans/${acad.id}`, { method: "PATCH", body: { displayName: academicName }, cookie: A.cookie });
      ok(back.status === 200, "academic возвращено прежнее название");
      academicName = null;
    }
    // вебхук через tools/stripe-emit.mjs
    const emit = (args) => spawnSync(process.execPath, [ROOT + "tools/stripe-emit.mjs", ...args], { cwd: ROOT, encoding: "utf8", env: { ...process.env, PORT: String(PORT), STRIPE_WEBHOOK_SECRET: "" } });
    const stripeSub = subRow.stripe_subscription_id;
    const logBefore = serverLog().length;
    const w1 = emit(["customer.subscription.updated", stripeSub, "--price", "price_t154_unknown"]);
    await sleep(300);
    const [after1] = await sql`select plan_id, status from user_subscriptions where id=${subId}`;
    const warn = serverLog().slice(logBefore);
    ok(w1.status === 0 && /"handled":true/.test(w1.stdout) && /"action":"updated"/.test(w1.stdout) && after1.plan_id === fam.id && /price_t154_unknown не соответствует ни одному тарифу/.test(warn), "stripe-emit --price неизвестный: 200 handled, plan_id цел, предупреждение в логе сервера", { out: w1.stdout.slice(-300), warn: warn.slice(-300) });
    const w2 = emit(["customer.subscription.updated", stripeSub, "--price", v2.stripePriceId, "--status", "active"]);
    await sleep(300);
    const [after2] = await sql`select plan_id, status from user_subscriptions where id=${subId}`;
    ok(w2.status === 0 && /"action":"updated_plan"/.test(w2.stdout) && after2.plan_id === v2.id && after2.status === "active", "stripe-emit --price редакции 2: plan_id перенесён, статус active", w2.stdout.slice(-300));
    const ov2 = (await GET("/billing/subscription", U.cookie)).json;
    ok(ov2?.plan?.id === v2.id && ov2.quotas?.syntheses === 5, "подписчик после переноса видит квоты редакции 2 (5 синтезов)", ov2?.quotas);
    const w3 = emit(["customer.subscription.updated", stripeSub, "--status", "past_due"]);
    await sleep(300);
    const [after3] = await sql`select plan_id, status from user_subscriptions where id=${subId}`;
    ok(w3.status === 0 && after3.plan_id === v2.id && after3.status === "past_due", "stripe-emit без --price: статус обновлён, plan_id не тронут");
    // вернуть подписчика на редакцию 1 (для R4: у неё живая подписка, у v2 — вторая)
    emit(["customer.subscription.updated", stripeSub, "--price", fam.stripePriceId, "--status", "active"]);
    await sleep(300);
  }

  /* ════ R4: браузер ════ */
  if (want("R4")) {
    console.log("\n■ R4: браузер — вкладка «Тарифы», запертые поля, второй шаг редакции, BillingPage");
    const ap = await newPage(A);
    await ap.goto(`${UI}/admin/prompts`, { waitUntil: "networkidle0" });
    await waitSel(ap, T("tab-plans"));
    await click(ap, T("tab-plans"));
    await waitSel(ap, T("plans-tab"));
    await waitSel(ap, T(`plan-row-${TAG}`));
    const row1 = await ap.$eval(T(`plan-row-${TAG}`), (el) => ({ live: el.dataset.live, open: el.dataset.open, text: el.textContent }));
    const row2 = await ap.$eval(T(`plan-row-${TAG}-v2`), (el) => ({ live: el.dataset.live, open: el.dataset.open, text: el.textContent }));
    ok(row1.live === "1" && row1.open === "0" && /ред\. 1/.test(row1.text) && /закрыт/.test(row1.text) && row2.live === "1" && row2.open === "1" && /ред\. 2/.test(row2.text) && /открыт/.test(row2.text), "таблица: обе редакции, живые подписки, открыт/закрыт", { row1: row1.text, row2: row2.text });
    ok(/редакций: \d+, открыто для покупки: \d+/.test(await text(ap, T("plans-count"))), "счётчик редакций и открытых");
    // форма правки плана с живой подпиской
    await click(ap, T(`plan-edit-${TAG}`));
    await waitSel(ap, T(`plan-edit-form-${TAG}`));
    const locked = await ap.$$eval(`${T(`plan-edit-form-${TAG}`)} [data-locked="1"]`, (els) => els.map((e) => ({ id: e.dataset.testid, disabled: e.disabled, title: e.title })));
    ok(locked.length === 6 && locked.every((l) => l.disabled && /живые подписки/.test(l.title)), "поля цена/период/4 квоты заперты (disabled) с подсказкой о живых подписках", locked);
    ok(await exists(ap, T(`plan-edit-${TAG}-locked-note`)) && !(await ap.$eval(T(`plan-edit-${TAG}-displayName`), (e) => e.disabled)), "строка-пояснение под полями; название доступно");
    await ap.screenshot({ path: "/tmp/t154-plans.png", fullPage: true }).catch(() => {});
    await typeInto(ap, T(`plan-edit-${TAG}-displayName`), "Тест 154 из браузера");
    await click(ap, T(`plan-edit-submit-${TAG}`));
    await waitText(ap, T("plans-tab"), /сохранено/);
    await waitText(ap, T(`plan-row-${TAG}`), /Тест 154 из браузера/);
    ok(true, "название сохранено, строка обновилась, статус «сохранено»");
    // план без подписок (v2 после переноса R3 без живых? — у v2 подписка U2) — проверим незапертость на свежем семействе
    const c2 = await call("/billing/admin/plans", { body: spec(TAG + "f"), cookie: A.cookie });
    await click(ap, T("plans-refresh"));
    await waitSel(ap, T(`plan-row-${TAG}f`));
    await click(ap, T(`plan-edit-${TAG}f`));
    await waitSel(ap, T(`plan-edit-form-${TAG}f`));
    const free = await ap.$$eval(`${T(`plan-edit-form-${TAG}f`)} input, ${T(`plan-edit-form-${TAG}f`)} select`, (els) => els.filter((e) => e.disabled).length);
    ok(c2.status === 201 && free === 0 && !(await exists(ap, T(`plan-edit-${TAG}f-locked-note`))), "план без подписок: ни одно поле не заперто, пояснения нет");
    await click(ap, T(`plan-edit-cancel-${TAG}f`));
    // новая редакция со вторым шагом (у v2 живая подписка U2)
    await click(ap, T(`plan-edition-${TAG}-v2`));
    await waitSel(ap, T(`plan-edition-form-${TAG}-v2`));
    ok(/Будет создана строка t154-\w+-v3/.test(await text(ap, T(`plan-edition-form-${TAG}-v2`))), "форма редакции называет имя будущей строки -v3");
    ok(!(await exists(ap, T(`plan-edition-warn-${TAG}-v2`))), "до первого клика предупреждения нет");
    await typeInto(ap, T(`plan-edition-${TAG}-v2-quotaSyntheses`), "6");
    await click(ap, T(`plan-edition-submit-${TAG}-v2`));
    await waitSel(ap, T(`plan-edition-warn-${TAG}-v2`));
    const warnT = await text(ap, T(`plan-edition-warn-${TAG}-v2`));
    ok(/подписчики \(1\)/.test(warnT) && /никто не переводит/.test(warnT) && /Точно завести\?/.test(await text(ap, T(`plan-edition-submit-${TAG}-v2`))), "второй шаг: предупреждение о подписчиках, кнопка «Точно завести?»", warnT);
    await click(ap, T(`plan-edition-cancel-${TAG}-v2`));
    ok(!(await exists(ap, T(`plan-edition-form-${TAG}-v2`))), "«Отмена» закрывает форму без создания");
    await click(ap, T(`plan-edition-${TAG}-v2`));
    await waitSel(ap, T(`plan-edition-form-${TAG}-v2`));
    await typeInto(ap, T(`plan-edition-${TAG}-v2-quotaSyntheses`), "6");
    await click(ap, T(`plan-edition-submit-${TAG}-v2`));
    await waitSel(ap, T(`plan-edition-warn-${TAG}-v2`));
    await click(ap, T(`plan-edition-submit-${TAG}-v2`));
    await waitSel(ap, T(`plan-row-${TAG}-v3`));
    const r3 = await ap.$eval(T(`plan-row-${TAG}-v3`), (el) => ({ open: el.dataset.open, text: el.textContent }));
    const r2b = await ap.$eval(T(`plan-row-${TAG}-v2`), (el) => ({ open: el.dataset.open, live: el.dataset.live }));
    ok(r3.open === "1" && /6 \/ 5 \/ 5 \/ 10/.test(r3.text) && r2b.open === "0" && r2b.live === "1" && /заведена и открыта/.test(await text(ap, T("plans-tab"))), "после подтверждения: -v3 открыта с новыми квотами, -v2 закрыта, подписка на ней", { r3, r2b });
    const [v3row] = await sql`select name, edition, is_active, stripe_price_id from subscription_plans where name=${TAG + "-v3"}`;
    ok(v3row?.edition === 3 && v3row.is_active && mock.state.prices.get(v3row.stripe_price_id)?.lookup_key === `philosynth_${TAG}-v3`, "БД и мок: редакция 3 с Price");
    // журнал на вкладке «Доступ» подписывает plan.*
    await click(ap, T("tab-access"));
    await waitSel(ap, T("access-tab"));
    await waitText(ap, T("access-tab"), /новая редакция тарифа/);
    const accessT = await text(ap, T("access-tab"));
    ok(/тариф изменён/.test(accessT) && /тариф создан/.test(accessT) && /новая редакция тарифа/.test(accessT), "журнал «Доступ»: подписи plan.created / plan.updated / plan.edition");
    ok(ap.errors.length === 0, "страница админки без ошибок JS", ap.errors);
    // стартовая страница и BillingPage — только открытые редакции
    const g = await newPage(null);
    await g.goto(`${UI}/`, { waitUntil: "networkidle0" });
    await waitSel(g, T("landing-plans-table"));
    const landing = await g.$$eval(`${T("landing-plans-table")} tbody tr`, (els) => els.map((e) => e.dataset.testid));
    ok(landing.includes(`landing-plans-table-row-${TAG}-v3`) && !landing.includes(`landing-plans-table-row-${TAG}`) && !landing.includes(`landing-plans-table-row-${TAG}-v2`), "стартовая страница: только открытая редакция -v3 (закрытых нет)", landing);
    const bp = await newPage(U2);
    await bp.goto(`${UI}/billing`, { waitUntil: "networkidle0" });
    await waitSel(bp, T("sub-choose"));
    await click(bp, T("sub-choose"));
    await waitSel(bp, T("sub-plans"));
    await waitSel(bp, `${T("sub-plans")} [data-testid^="sub-plan-"]`); // список тарифов грузится своим запросом
    const bpPlans = await bp.$$eval(`${T("sub-plans")} [data-testid^="sub-plan-"]`, (els) => els.map((e) => e.dataset.testid));
    ok(bpPlans.includes(`sub-plan-${TAG}-v3`) && !bpPlans.includes(`sub-plan-${TAG}`) && !bpPlans.includes(`sub-plan-${TAG}-v2`), "BillingPage: в выборе тарифов только открытые редакции", bpPlans);
    ok(/Тест 154/.test(await text(bp, T("sub-plan"))), "BillingPage: подписчик видит свою (закрытую) редакцию в карточке подписки");
    const up = await newPage(U);
    await up.goto(`${UI}/admin/prompts`, { waitUntil: "networkidle0" });
    await sleep(500);
    ok(!(await exists(up, T("tab-plans"))), "пользователю вкладки «Тарифы» нет (/admin/prompts закрыт)", up.url());
  }
} catch (err) {
  failed++; fails.push("исключение");
  console.error("исключение:", err);
  if (lastPage) await lastPage.screenshot({ path: "/tmp/t154-fail.png" }).catch(() => {});
} finally {
  if (browser) await browser.close().catch(() => {});
  if (academicName && A) await call(`/billing/admin/plans/${(await sql`select id from subscription_plans where name='academic'`)[0]?.id}`, { method: "PATCH", body: { displayName: academicName }, cookie: A.cookie }).catch(() => {});
  for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch {} }
  await mock.stop().catch(() => {});
  for (const id of userIds) await sql`delete from user_subscriptions where user_id=${id}`.catch(() => {});
  await sql`delete from admin_audit where target_id like ${TAG + "%"}`.catch(() => {});
  await sql`delete from admin_audit where target_id = 'academic' and action = 'plan.updated' and created_at >= ${startedAt}`.catch(() => {});
  await sql`delete from subscription_plans where family like ${TAG + "%"}`.catch(() => {});
  for (const id of userIds) await sql`delete from users where id=${id}`.catch(() => {});
  await sql.end({ timeout: 2 });
}
console.log(`\nИТОГ test-154 (запросы 2–4): ${passed} ✓ / ${failed} ✗${fails.length ? "\n  провалы: " + fails.join(" | ") : ""}`);
process.exit(failed ? 1 : 0);
