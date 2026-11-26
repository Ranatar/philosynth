/**
 * Тестовые запросы беседы L.1 (язык интерфейса fr) — все пять запросов шаблона
 * «Типовая беседа L» (07) одним харнессом: живой сервер :3000 + СБОРКА клиента
 * (vite build) под vite preview :5215 + Chrome 131, каждый персонаж — свой
 * browser context; мок Claude :3895 пишет тела запросов (промпт).
 *
 *   R1 гость выбирает fr в шапке: язык меняется без перезагрузки, cookie
 *      ui_locale=fr, после перезагрузки — fr; 401 сервера — по-французски;
 *      данные по месту показа — метки метода/уровня/глубины шапки документа и
 *      типы связей/категорий в панели графа по-французски; в БД и промпте —
 *      по-русски. Числа и даты — по языку интерфейса (L.1: дата шапки).
 *   R2 вошедший переключается на fr: users.ui_locale=fr, gen_lang=French;
 *      форма создания предлагает French; смена языка генерации интерфейс не
 *      трогает; вход с другого браузера (контекста) — сразу fr
 *   R3 плюралы fr: три строки с {n, plural, …} для n = 1, 2, 5, 21 (и 10⁶ —
 *      форма many) дают формы по Intl.PluralRules("fr") — в Node и в Chrome;
 *      import (на копии таблицы) отвергает форму чужого языка (few)
 *   R4 каталоги по требованию: ru→fr→en→fr→de→fr — ровно один запрос чанка fr
 *   R5 сторож: удалить перевод одного ключа на fr → i18n:check --strict
 *      красный с ключом → check:integration красный (4ay) → таблица
 *      возвращена побайтно
 *
 * Перед прогоном: pg_ctlcluster 16 main start; redis-server --daemonize yes
 * --save ''; посевы prompts/configs/taxonomy. Запуск из корня:
 *   node_modules/.bin/tsx tests/test-L1-requests.mjs   (CHROME_PATH — Chrome 131;
 *   puppeteer-core — `npm i --no-save puppeteer-core@23`)
 */
import { spawn, spawnSync } from "node:child_process";
import fs, { existsSync } from "node:fs";
import http from "node:http";
import os, { homedir } from "node:os";
import path from "node:path";
import postgres from "postgres";

import { CAPSULE, SECTIONS, SECTION_ORDER } from "./test-92-fixture.mjs";
import { UI_LOCALES, UI_TO_GEN } from "../packages/shared/i18n/locales.ts";
import { formatMessage } from "../packages/shared/i18n/t.ts";

const L = "fr", NAME = "French", SELF = "Français";
const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5215, MOCK_PORT = 3895;
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${UI_PORT}`;
const CHROME = [`${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`, process.env.CHROME_PATH].find((p) => p && existsSync(p));
const TABLE = path.join(ROOT, "packages/shared/i18n/strings.json");
const sql = postgres(process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth");
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CATALOG_CHUNK = new RegExp(`\\/assets\\/((?:${UI_LOCALES.filter((l) => l !== "ru").join("|")})-[^/]+\\.js)$`);

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? " — " + String(extra).slice(0, 500) : ""}`); }
}

/* ── Мок Claude ── */
const claude = { calls: 0, bodies: [] };
function startClaudeMock() {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      claude.calls++;
      try { claude.bodies.push(JSON.parse(body)); } catch { claude.bodies.push({}); }
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (o) => res.write(`data: ${J(o)}\n\n`);
      send({ type: "message_start", message: { usage: { input_tokens: 100 } } });
      send({ type: "content_block_delta", delta: { type: "text_delta", text: '<div class="doc-section"><div class="section-num">§ 4</div><div class="section-title">Корпус тезисов</div><div class="doc-content"><div data-section="Онтологические тезисы"><h4>Онтологические тезисы</h4><p><strong>Бытие есть становление</strong> Перегенерировано.</p></div></div></div>' } });
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 40 } });
      send({ type: "message_stop" });
      res.end();
    });
  });
  return new Promise((r) => srv.listen(MOCK_PORT, "127.0.0.1", () => r(srv)));
}

/* ── Процессы ── */
const kids = [];
let serverLog = "";
function sp(args, cwd, env) {
  const p = spawn(process.execPath, args, { cwd, detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
  p.stdout.on("data", (d) => (serverLog += d)); p.stderr.on("data", (d) => (serverLog += d));
  kids.push(p);
  return p;
}
async function waitUp(url, name) {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(url)).ok) return; } catch {} await sleep(500); }
  throw new Error(`${name} не поднялся`);
}
async function assertPortFree(url, name) {
  let busy = false;
  try { busy = (await fetch(url)).ok; } catch {}
  if (busy) throw new Error(`порт занят чужим ${name} — снимите сирот (09 §4)`);
}
function killKids() { for (const k of kids) { try { process.kill(-k.pid, "SIGTERM"); } catch {} } kids.length = 0; }

/* ── HTTP ── */
async function api(who, method, p, body) {
  const headers = {};
  if (who) headers.Cookie = who.cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : J(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function login(email, password) {
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  return { cookie: r.headers.get("set-cookie").split(";")[0], user: (await r.json()).user };
}
async function mkUser(tag) {
  const email = `tL1-${tag}-${Date.now()}@example.com`;
  await api(null, "POST", "/auth/register", { email, password: "password-L1", displayName: `TL1 ${tag}` });
  const { cookie, user } = await login(email, "password-L1");
  return { email, cookie, id: user.id };
}
async function insertFixture(user, title) {
  const [syn] = await sql`insert into syntheses (user_id, seed, title, status, section_order, capsule_html, doc_num, lang, method, synth_level, depth)
    values (${user.id}, 'зерно L.1', ${title}, 'ready', ${sql.json(SECTION_ORDER)}, ${CAPSULE}, 'PS-L1-TEST', 'Russian', 'dialectical', 'transformative', 'deep') returning id`;
  for (const [i, name] of ["Гегель", "Гераклит"].entries())
    await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${syn.id}, 'philosopher', ${name}, ${i})`;
  for (const s of SECTIONS)
    await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${syn.id}, ${s.key}, ${s.num}, ${s.title}, ${s.html})`;
  return syn.id;
}
const userRow = async (id) => (await sql`select ui_locale, gen_lang from users where id=${id}`)[0];

/* ── Браузер ── */
const lang = (page) => page.$eval("html", (e) => e.lang);
const txt = (page, sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
const textOf = (page, sel) => page.evaluate((s) => document.querySelector(s)?.innerText ?? "", sel);
async function clickBtn(page, scope, label) {
  return page.evaluate((s, l) => { const b = [...document.querySelectorAll(`${s} button`)].find((x) => x.textContent.includes(l)); if (!b) return "no-button"; b.click(); return "ok"; }, scope, label);
}
async function newPage(browser, who) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.catalogRequests = [];
  page.on("request", (r) => { const m = CATALOG_CHUNK.exec(r.url()); if (m) page.catalogRequests.push(m[1]); });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setUserAgentOverride", { userAgent: await browser.userAgent(), acceptLanguage: "ru-RU,ru" });
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  return page;
}
/** Настоящий клик пользователя: раскрыть меню шапки и выбрать язык. */
async function pickLangUi(page, l) {
  await page.click('[data-testid="lang-switch-toggle"]');
  await page.waitForSelector(`[data-testid="lang-switch-topbar"] .app-lang-menu:not([hidden]) button[data-locale="${l}"]`, { visible: true, timeout: 5000 });
  await page.click(`[data-testid="lang-switch-topbar"] button[data-locale="${l}"]`);
  await page.waitForFunction((l2) => document.querySelector(`[data-testid="lang-switch-topbar"] button[data-locale="${l2}"]`)?.classList.contains("active") && document.documentElement.lang === l2, { timeout: 8000 }, l);
}
const waitText = (page, sel, needle) => page.waitForFunction((s, n) => (document.querySelector(s)?.textContent ?? "").includes(n), { timeout: 10000 }, sel, needle);

let browser;
async function main() {
  if (!CHROME) throw new Error("Chrome 131 не найден — задайте CHROME_PATH");
  await assertPortFree(`${BASE}/health`, "сервером");
  await assertPortFree(UI, "preview");
  ok(UI_LOCALES.includes(L) && UI_TO_GEN[L] === NAME, `fr в UI_LOCALES, UI_TO_GEN.fr = ${NAME}`);

  console.log("■ Сборка клиента (vite build)");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8" });
  ok(build.status === 0 && /dist\/assets\/fr-[^ ]+\.js/.test(build.stdout), "сборка прошла, каталог fr — отдельный чанк", build.stderr?.slice(-300));

  await startClaudeMock();
  sp(["--import", "tsx", "index.ts"], ROOT + "server", {
    PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-L1", STREAM_RETRY_DELAYS: "50",
  });
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {});
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");
  const puppeteer = (await import("puppeteer-core")).default;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
  console.log(`  (браузер: ${await browser.version()}; клиент — сборка под vite preview)`);

  const { saveGraphToDb, parseGraphFromHTML } = await import("../server/services/graph-parser.ts");
  const A = await mkUser("owner");
  await sql`update users set balance_usd = 20 where id = ${A.id}`;
  const DOC = await insertFixture(A, "ТL1 русский документ с графом");
  await saveGraphToDb(DOC, parseGraphFromHTML(SECTIONS.find((s) => s.key === "graph").html));
  await api(A, "PATCH", `/syntheses/${DOC}`, { visibility: "full" });
  const edges0 = await sql`select edge_type as type from category_edges where synthesis_id=${DOC} order by position`;
  const cats0 = await sql`select type from categories where synthesis_id=${DOC} order by position`;
  ok(edges0.length > 0 && edges0.every((e) => /^[а-яё]/i.test(e.type)) && cats0.every((c) => /^[а-яё]/i.test(c.type)), "фикстура: граф в БД, типы — русские", J([edges0, cats0]));

  /* ═══ R1 ═══ */
  console.log("\n■ R1: гость выбирает fr в шапке → без перезагрузки, cookie, после перезагрузки fr; 401 по-французски; данные по месту показа");
  const g = await newPage(browser, null);
  await g.goto(UI + "/", { waitUntil: "networkidle0" });
  ok((await lang(g)) === "ru" && (await txt(g, ".topbar-tagline")).startsWith("Платформа синтеза"), "гость с ru-RU: ru, шапка русская");
  await g.click('[data-testid="lang-switch-toggle"]');
  const menu = await g.$$eval('[data-testid="lang-switch-topbar"] .app-lang-menu button[data-locale]', (bs) => bs.map((b) => [b.dataset.locale, b.textContent.trim(), b.lang]));
  ok(J(menu.map((m) => m[0])) === J(UI_LOCALES) && menu.some((m) => m[0] === L && m[1] === SELF && m[2] === L), `меню шапки: языки из UI_LOCALES, fr подписан самоназванием «${SELF}» (lang=fr)`, J(menu));
  await g.click('[data-testid="lang-switch-toggle"]');
  const urlBefore = g.url();
  const navBefore = await g.evaluate(() => performance.getEntriesByType("navigation").length);
  await pickLangUi(g, L);
  await waitText(g, ".topbar-tagline", "Plateforme de synthèse");
  ok((await lang(g)) === L && (await g.$eval("html", (e) => e.dir)) === "ltr", "<html lang=fr dir=ltr>");
  ok((await txt(g, '[data-testid="lang-switch-toggle"]')).includes(SELF), "кнопка шапки показывает «Français»");
  const guestLinks = await txt(g, '[data-testid="guest-links"]');
  ok(/Se connecter|Connexion/.test(guestLinks) && /S’inscrire/.test(guestLinks), "гостевые ссылки шапки по-французски", guestLinks);
  ok((await g.evaluate(() => document.querySelector(".app-landing")?.textContent ?? "")).includes("Synthèse de concepts"), "лендинг по-французски");
  ok((await g.evaluate(() => performance.getEntriesByType("navigation").length)) === navBefore && g.url() === urlBefore, "без перезагрузки страницы");
  ok((await g.cookies()).some((c) => c.name === "ui_locale" && c.value === L), "cookie ui_locale=fr");
  await g.reload({ waitUntil: "networkidle0" });
  ok((await lang(g)) === L && (await txt(g, ".topbar-tagline")).startsWith("Plateforme"), "после перезагрузки — fr (cookie)");
  const r401 = await fetch(`${BASE}/auth/me`, { headers: { Cookie: `ui_locale=${L}` } });
  const j401 = await r401.json().catch(() => ({}));
  ok(r401.status === 401 && j401.error === "Autorisation requise", "401 гостю — по-французски («Autorisation requise»)", J([r401.status, j401]));
  // данные по месту показа: шапка документа и граф
  await g.goto(UI + `/synthesis/${DOC}`, { waitUntil: "networkidle0" });
  await g.waitForSelector(".doc-section", { timeout: 20000 });
  const metaVals = await g.evaluate(() => [...document.querySelectorAll(".doc-meta-val")].map((e) => e.textContent.trim()));
  ok(metaVals.includes("Dialectique") && metaVals.includes("Approfondie") && metaVals.includes("Transformatif"), "шапка документа: метод/глубина/уровень по-французски", J(metaVals));
  ok(metaVals.every((v) => !/Диалектический|Глубокая|Преобразующий/.test(v)), "русских меток в шапке нет");
  const expDate = new Date((await sql`select created_at from syntheses where id=${DOC}`)[0].created_at).toLocaleDateString("fr", { day: "2-digit", month: "long", year: "numeric" });
  ok(metaVals.includes(expDate) && /[a-zéû]+/.test(expDate), `дата шапки — по-французски («${expDate}», L.1: числа и даты по языку интерфейса)`, J(metaVals));
  const subtitle = await txt(g, ".doc-subtitle");
  ok(/Hegel/.test(subtitle) && /Héraclite/.test(subtitle), "подзаголовок: философы по-французски (Hegel, Héraclite)", subtitle);
  ok((await g.evaluate(() => [...document.querySelectorAll(".section-title")].map((s) => s.textContent))).some((t) => /Граф категорий/.test(t)), "названия разделов документа — русские (данные документа)");
  ok(g.errors.length === 0, "ошибок страницы нет (гость)", g.errors);
  // граф гостю не рисуется (8.7: содержание — вошедшему); панель графа смотрит
  // зарегистрированный читатель публичной концепции — тоже выбрав fr в шапке
  const C = await mkUser("reader");
  const gr = await newPage(browser, C);
  await gr.goto(UI + `/synthesis/${DOC}`, { waitUntil: "networkidle0" });
  await gr.waitForSelector(".doc-section", { timeout: 20000 });
  await pickLangUi(gr, L);
  await waitText(gr, ".topbar-tagline", "Plateforme de synthèse");
  const g0 = g;
  { const g = gr;
  ok(await clickBtn(g, ".actions-bar", "Graphe") === "ok", "кнопка «◈ Graphe» по-французски (читатель публичной концепции)");
  await g.waitForSelector(".gm-overlay", { timeout: 15000 });
  await clickBtn(g, ".gm-header", "2D");
  await g.waitForSelector(".node-g", { timeout: 15000 });
  await sleep(600);
  const legend = await textOf(g, ".gm-legend");
  ok(/TYPES DE RELATIONS/.test(legend) && /dialectique/.test(legend) && /hiérarchique/.test(legend), "легенда: «TYPES DE RELATIONS», типы dialectique/hiérarchique", legend.slice(0, 300));
  ok(/ontologique/.test(legend) && !/диалектическая|онтологическая/.test(legend), "легенда: типы категорий по-французски, русских нет", legend.slice(0, 300));
  await g.evaluate(() => { document.querySelector(".edge-hit")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await g.waitForFunction(() => /dialectique|hiérarchique|диалектическая/.test(document.querySelector(".gm-info-panel")?.innerText ?? ""), { timeout: 10000 }).catch(() => {});
  const panel = await textOf(g, ".gm-info-panel");
  ok(/dialectique|hiérarchique/i.test(panel) && !/диалектическая|иерархическая/.test(panel), "панель связи: тип по-французски", panel.slice(0, 200));
  ok(/SOURCE|CIBLE/.test(panel), "панель связи: заголовки по-французски", panel.slice(0, 200));
  ok(g.errors.length === 0, "ошибок страницы нет (читатель)", g.errors);
  }
  void g0;
  // БД и промпт — по-русски
  const edges1 = await sql`select edge_type as type from category_edges where synthesis_id=${DOC} order by position`;
  ok(J(edges1) === J(edges0), "БД: типы связей русские и после показа по-французски");
  const before = claude.calls;
  const rg = await api({ cookie: `${A.cookie}; ui_locale=${L}` }, "POST", `/syntheses/${DOC}/regenerate/theses`, {});
  ok(rg.status === 200, "перегенерация тезисов принята (интерфейс fr)", J(rg.json));
  for (let i = 0; i < 80 && claude.calls === before; i++) await sleep(250);
  const body = claude.bodies.at(-1) ?? {};
  const prompt = J(body.messages ?? "") + J(body.system ?? "");
  ok(claude.calls > before && /диалектическая/.test(prompt) && /онтологическая/.test(prompt), "промпт несёт русские типы", prompt.slice(0, 200));
  ok(!/dialectique|ontologique|Autorisation|Synthèse de concepts/i.test(prompt), "в промпте нет французского интерфейса");
  for (let i = 0; i < 60; i++) { if ((await sql`select status from syntheses where id=${DOC}`)[0].status === "ready") break; await sleep(250); }

  /* ═══ R2 ═══ */
  console.log("\n■ R2: вошедший → fr: ui_locale=fr, gen_lang=French; форма — French; смена генерации интерфейс не трогает; другой браузер — сразу fr");
  const B = await mkUser("user");
  const p = await newPage(browser, B);
  await p.goto(UI + "/catalog", { waitUntil: "networkidle0" });
  ok((await lang(p)) === "ru" && (await userRow(B.id)).ui_locale === null, "вошедший без выбора: ru, ui_locale NULL");
  await pickLangUi(p, L);
  await sleep(700);
  const row1 = await userRow(B.id);
  ok(row1.ui_locale === L && row1.gen_lang === NAME, "PATCH /auth/me: ui_locale=fr, gen_lang=French", J(row1));
  ok(/^Plateforme/.test(await txt(p, ".topbar-tagline")), "шапка вошедшего по-французски");
  await p.goto(UI + "/synthesis/new", { waitUntil: "networkidle0" });
  await p.waitForSelector('[data-testid="gen-lang-select"]');
  ok((await p.$eval('[data-testid="gen-lang-select"]', (s) => s.value)) === NAME, "форма создания открывается с French");
  const formLabel = await p.evaluate(() => document.body.innerText);
  ok(/Langue de génération/i.test(formLabel) && /Synthétiser le concept/i.test(formLabel) && !/Язык генерации|Синтезировать/i.test(formLabel), "форма создания по-французски", formLabel.slice(0, 300));
  await p.select('[data-testid="gen-lang-select"]', "German");
  await sleep(700);
  const row2 = await userRow(B.id);
  ok(row2.gen_lang === "German" && row2.ui_locale === L && (await lang(p)) === L, "генерация → German: gen_lang=German, интерфейс остался fr", J(row2));
  await p.goto(UI + "/profile", { waitUntil: "networkidle0" });
  ok(await p.$(`[data-testid="lang-switch-form"] button[data-locale="${L}"].active`), "профиль: переключатель-форма показывает fr");
  ok(/German|Deutsch/.test(await txt(p, '[data-testid="profile-gen-lang"]') ?? ""), "профиль: язык генерации по умолчанию — German", await txt(p, '[data-testid="profile-gen-lang"]'));
  ok(p.errors.length === 0, "ошибок страницы нет (вошедший)", p.errors);
  const { cookie: cookie2 } = await login(B.email, "password-L1");
  const p2 = await newPage(browser, { cookie: cookie2 });
  await p2.goto(UI + "/catalog", { waitUntil: "networkidle0" });
  await p2.waitForFunction(() => document.documentElement.lang === "fr", { timeout: 10000 }).catch(() => {});
  ok((await lang(p2)) === L && /^Plateforme/.test(await txt(p2, ".topbar-tagline")), "вход из другого браузера (свой контекст, без cookie ui_locale) — сразу fr", await txt(p2, ".topbar-tagline"));
  ok(!(await p2.cookies()).some((c) => c.name === "ui_locale" && c.value !== L), "cookie другого браузера не спорит с ui_locale пользователя");

  /* ═══ R3 ═══ */
  console.log("\n■ R3: плюралы fr по Intl.PluralRules; import отвергает форму чужого языка");
  const frCat = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/shared/i18n/generated/fr.json"), "utf8")).strings;
  const PL = [
    ["catalog.synthesisCard.descendantsCount", "n", { one: "descendant", other: "descendants", many: "de descendants" }],
    ["reviewPage.revisionFindings", "n", { one: "remarque", other: "remarques", many: "de remarques" }],
    ["synthesis.pauseModal.stepsCount", "n", { one: "étape", other: "étapes", many: "d’étapes" }],
  ];
  const NS = [1, 2, 5, 21, 1000000];
  const browserCats = await p.evaluate((ns) => ns.map((n) => new Intl.PluralRules("fr").select(n)), NS);
  const nodeCats = NS.map((n) => new Intl.PluralRules("fr").select(n));
  ok(J(browserCats) === J(nodeCats) && J(nodeCats) === J(["one", "other", "other", "other", "many"]), `категории fr для ${NS.join(", ")}: ${nodeCats.join(", ")} (Chrome 131 = Node)`, J([browserCats, nodeCats]));
  for (const [key, arg, words] of PL) {
    const got = NS.map((n) => formatMessage(frCat[key], { [arg]: n }, L));
    // «#» печатается с разделителями языка (правка после L.1): 10⁶ — «1 000 000 de …»
    const want = NS.map((n, i) => `${n.toLocaleString(L)} ${words[nodeCats[i]]}`);
    ok(got.every((s, i) => s === want[i] || s.endsWith(want[i])), `${key}: ${got.join(" | ")}`, J(want));
  }
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tL1-"));
    for (const d of ["scripts/i18n", "packages/shared/i18n"]) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
    fs.mkdirSync(path.join(tmp, "node_modules"), { recursive: true });
    fs.symlinkSync(path.join(ROOT, "node_modules/typescript"), path.join(tmp, "node_modules/typescript"), "dir");
    const t = JSON.parse(fs.readFileSync(path.join(tmp, "packages/shared/i18n/strings.json"), "utf8"));
    const k = "catalog.synthesisCard.descendantsCount";
    const req = path.join(tmp, "req.json");
    fs.writeFileSync(req, J({ meta: { kind: "translation-request", languages: [L] }, strings: { [k]: { ru: t.strings[k].ru, [L]: "{n, plural, one {# descendant} few {# descendants} other {# descendants}}" } } }));
    const r = spawnSync(process.execPath, ["scripts/i18n/i18n-import.mjs", req], { cwd: tmp, encoding: "utf8" });
    const t2 = JSON.parse(fs.readFileSync(path.join(tmp, "packages/shared/i18n/strings.json"), "utf8"));
    ok(/отклонено 1/.test(r.stdout + r.stderr) && /few/.test(r.stdout + r.stderr) && t2.strings[k][L] === t.strings[k][L], "import отвергает форму few для fr, строка таблицы не тронута", (r.stdout + r.stderr).slice(-400));
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  /* ═══ R4 ═══ */
  console.log("\n■ R4: каталоги по требованию — ru→fr→en→fr→de→fr, ровно один запрос чанка fr");
  const q = await newPage(browser, null);
  await q.goto(UI + "/", { waitUntil: "networkidle0" });
  ok((await lang(q)) === "ru" && q.catalogRequests.length === 0, "старт ru, каталоги не грузились");
  for (const l of [L, "en", L, "de", L]) { await pickLangUi(q, l); await sleep(300); }
  const frReq = q.catalogRequests.filter((x) => x.startsWith(`${L}-`));
  ok(frReq.length === 1, `шесть переключений: запросов чанка fr — ${frReq.length}`, J(q.catalogRequests));
  ok(q.catalogRequests.filter((x) => x.startsWith("en-")).length === 1 && q.catalogRequests.filter((x) => x.startsWith("de-")).length === 1, "en и de — тоже по одному разу", J(q.catalogRequests));
  ok((await lang(q)) === L && /^Plateforme/.test(await txt(q, ".topbar-tagline")), "в конце — fr");
  ok(q.errors.length === 0, "ошибок страницы нет", q.errors);
  try { await browser.close(); } catch {}
  browser = null;
  killKids();

  /* ═══ R5 ═══ */
  console.log("\n■ R5: удалить перевод одного ключа на fr → i18n:check --strict и check:integration (4ay) красные → таблица побайтно");
  const backup = fs.readFileSync(TABLE, "utf8");
  const K = "common.save";
  try {
    const t = JSON.parse(backup);
    t.strings[K][L] = null;
    delete t.strings[K].draft;
    fs.writeFileSync(TABLE, JSON.stringify(t, null, 2) + "\n");
    const chk = spawnSync(process.execPath, ["scripts/i18n/i18n-check.mjs", "--strict"], { cwd: ROOT, encoding: "utf8" });
    ok(chk.status === 1 && /ключи без перевода[^\n]*: 1/.test(chk.stdout) && new RegExp(`${K.replace(".", "\\.")} \\[${L}\\]`).test(chk.stdout), `i18n:check --strict красный: ${K} [fr]`, chk.stdout.split("\n").filter((l) => /без перевода|common\.save/.test(l)).join(" | "));
    console.log("  · check:integration на испорченной таблице — около двух минут…");
    const ic = spawnSync("npm", ["run", "check:integration", "-w", "server"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const out = (ic.stdout ?? "") + (ic.stderr ?? "");
    ok(ic.status !== 0 && /ПРОБЛЕМЫ/.test(out), "check:integration красный");
    ok(/4ay: i18n:check --strict красный/.test(out) && new RegExp(`${K.replace(".", "\\.")} \\[${L}\\]`).test(out), "4ay называет i18n:check --strict и ключ common.save [fr]", out.split("\n").filter((l) => /^ - /.test(l)).slice(0, 6).join("\n"));
  } finally {
    fs.writeFileSync(TABLE, backup);
  }
  ok(fs.readFileSync(TABLE, "utf8") === backup, "таблица восстановлена побайтно");
  const chk3 = spawnSync(process.execPath, ["scripts/i18n/i18n-check.mjs", "--strict"], { cwd: ROOT, encoding: "utf8" });
  ok(chk3.status === 0, "после возврата i18n:check --strict чист");
}

main()
  .catch((e) => { failed++; console.log("  ✗ харнесс:", e?.stack ?? e); console.log("\n--- server log (хвост) ---\n" + serverLog.slice(-2500)); })
  .finally(async () => {
    try { await browser?.close(); } catch {}
    killKids();
    await sql.end({ timeout: 2 }).catch(() => {});
    console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗`);
    process.exit(failed ? 1 : 0);
  });
