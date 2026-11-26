/**
 * Тестовые запросы типовой беседы L (07, шаблон «Типовая беседа L») — ОДИН
 * харнесс на любой язык интерфейса (беседа L.2, 2026-11-27; до неё каждая
 * беседа копировала test-L1 и правила ~70 французских ожиданий руками).
 * Ожидания берутся из каталога языка (generated/<xx>.json) и карты данных
 * DATA_KEYS, плюралы — из ветвей ICU строки каталога по Intl.PluralRules:
 * новый язык харнесс не правит.
 *
 *   node_modules/.bin/tsx tests/test-L-requests.mjs --lang es
 *   (по умолчанию — последний язык UI_LOCALES)
 *
 * Живой сервер :3000 + СБОРКА клиента (vite build) под vite preview :5216 +
 * Chrome 131 (ТОЛЬКО 131 — харнесс сверяет версию; кэш puppeteer первым,
 * CHROME_PATH — запасной: в песочнице он ведёт на системный 153), каждый
 * персонаж — свой browser context; мок Claude :3896 пишет тела запросов.
 *
 *   R1 гость выбирает язык в шапке: без перезагрузки, cookie ui_locale, после
 *      перезагрузки — тот же; 401 сервера — на языке; данные по месту показа —
 *      метки метода/уровня/глубины и дата шапки документа, философы
 *      подзаголовка, типы связей/категорий в легенде и панели графа; в БД и
 *      промпте — по-русски
 *   R2 вошедший переключается: users.ui_locale, gen_lang = UI_TO_GEN; форма
 *      создания предлагает его; смена языка генерации интерфейс не трогает;
 *      вход с другого браузера (контекста) — сразу этот язык
 *   R3 плюралы: три строки с {n, plural, …} для n = 1, 2, 5, 21, 10⁶ дают
 *      ветвь категории Intl.PluralRules(xx) (Node = Chrome), «#» — с
 *      разделителями языка; import (на копии таблицы) отвергает форму, которой
 *      у языка нет
 *   R4 каталоги по требованию: ru→xx→en→xx→de→xx — ровно один запрос чанка xx
 *   R5 сторож: удалить перевод одного ключа на xx → i18n:check --strict
 *      красный с ключом → check:integration красный (4ay) → таблица
 *      возвращена побайтно
 *
 * Перед прогоном: pg_ctlcluster 16 main start; redis-server --daemonize yes
 * --save ''; посевы prompts/configs/taxonomy; puppeteer-core —
 * `npm i --no-save puppeteer-core@23`.
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
import { DATA_KEYS } from "../packages/shared/i18n/generated/data-keys.ts";

const argL = process.argv.indexOf("--lang");
const L = argL > 0 ? process.argv[argL + 1] : UI_LOCALES.at(-1);
if (!UI_LOCALES.includes(L) || L === "ru") { console.error(`язык «${L}» не из UI_LOCALES (кроме ru)`); process.exit(2); }
const NAME = UI_TO_GEN[L];
const SELF = [...fs.readFileSync(new URL("../client/src/i18n/i18n-store.ts", import.meta.url), "utf8").matchAll(/^\s*(\w+):\s*"([^"]+)",?$/gm)].find((m) => m[1] === L)?.[2];
const CAT = JSON.parse(fs.readFileSync(new URL(`../packages/shared/i18n/generated/${L}.json`, import.meta.url), "utf8")).strings;
/** Текст каталога по ключу; данные — по русскому значению через DATA_KEYS (как tData). */
const C = (k) => { if (typeof CAT[k] !== "string") throw new Error(`нет строки каталога ${L}: ${k}`); return CAT[k]; };
const D = (ru) => C(DATA_KEYS[ru]);
const strip = (s) => s.replace(/^[^\p{L}]+/u, "").trim();
const has = (hay, needle) => hay.toLocaleLowerCase(L).includes(needle.toLocaleLowerCase(L));
const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5216, MOCK_PORT = 3896;
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
  const sc = r.headers.get("set-cookie");
  if (!sc) throw new Error(`вход ${email}: ${r.status} ${await r.text()}`);
  return { cookie: sc.split(";")[0], user: (await r.json()).user };
}
async function mkUser(tag) {
  const email = `tL-${L}-${tag}-${Date.now()}@example.com`;
  await api(null, "POST", "/auth/register", { email, password: "password-L", displayName: `TL ${tag}` });
  const { cookie, user } = await login(email, "password-L");
  return { email, cookie, id: user.id };
}
async function insertFixture(user, title) {
  const [syn] = await sql`insert into syntheses (user_id, seed, title, status, section_order, capsule_html, doc_num, lang, method, synth_level, depth)
    values (${user.id}, 'зерно L', ${title}, 'ready', ${sql.json(SECTION_ORDER)}, ${CAPSULE}, 'PS-L-TEST', 'Russian', 'dialectical', 'transformative', 'deep') returning id`;
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
  ok(Boolean(NAME && SELF), `${L} в UI_LOCALES: UI_TO_GEN = ${NAME}, самоназвание «${SELF}»`);

  console.log("■ Сборка клиента (vite build)");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8" });
  ok(build.status === 0 && new RegExp(`dist\\/assets\\/${L}-[^ ]+\\.js`).test(build.stdout), `сборка прошла, каталог ${L} — отдельный чанк`, build.stderr?.slice(-300));

  await startClaudeMock();
  sp(["--import", "tsx", "index.ts"], ROOT + "server", {
    PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-L", STREAM_RETRY_DELAYS: "50",
  });
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {});
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");
  const puppeteer = (await import("puppeteer-core")).default;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
  console.log(`  (браузер: ${await browser.version()}; клиент — сборка под vite preview)`);
  ok((await browser.version()).includes("131.0.6778.204"), "браузер — Chrome 131 (09 §4: иные версии не годятся)", await browser.version());

  const { saveGraphToDb, parseGraphFromHTML } = await import("../server/services/graph-parser.ts");
  const A = await mkUser("owner");
  await sql`update users set balance_usd = 20 where id = ${A.id}`;
  const DOC = await insertFixture(A, "ТL русский документ с графом");
  await saveGraphToDb(DOC, parseGraphFromHTML(SECTIONS.find((s) => s.key === "graph").html));
  await api(A, "PATCH", `/syntheses/${DOC}`, { visibility: "full" });
  const edges0 = await sql`select edge_type as type from category_edges where synthesis_id=${DOC} order by position`;
  const cats0 = await sql`select type from categories where synthesis_id=${DOC} order by position`;
  ok(edges0.length > 0 && edges0.every((e) => /^[а-яё]/i.test(e.type)) && cats0.every((c) => /^[а-яё]/i.test(c.type)), "фикстура: граф в БД, типы — русские", J([edges0, cats0]));

  /* ═══ R1 ═══ */
  console.log(`\n■ R1 [${L}]: гость выбирает язык в шапке → без перезагрузки, cookie, после перезагрузки; 401 на языке; данные по месту показа`);
  const TAG = C("layout.header.tagline").slice(0, 16);
  const g = await newPage(browser, null);
  await g.goto(UI + "/", { waitUntil: "networkidle0" });
  ok((await lang(g)) === "ru" && (await txt(g, ".topbar-tagline")).startsWith("Платформа синтеза"), "гость с ru-RU: ru, шапка русская");
  await g.click('[data-testid="lang-switch-toggle"]');
  const menu = await g.$$eval('[data-testid="lang-switch-topbar"] .app-lang-menu button[data-locale]', (bs) => bs.map((b) => [b.dataset.locale, b.textContent.trim(), b.lang]));
  ok(J(menu.map((m) => m[0])) === J(UI_LOCALES) && menu.some((m) => m[0] === L && m[1] === SELF && m[2] === L), `меню шапки: языки из UI_LOCALES, ${L} подписан самоназванием «${SELF}» (lang=${L})`, J(menu));
  await g.click('[data-testid="lang-switch-toggle"]');
  const urlBefore = g.url();
  const navBefore = await g.evaluate(() => performance.getEntriesByType("navigation").length);
  await pickLangUi(g, L);
  await waitText(g, ".topbar-tagline", TAG);
  ok((await lang(g)) === L && (await g.$eval("html", (e) => e.dir)) === "ltr", `<html lang=${L} dir=ltr>`);
  ok((await txt(g, '[data-testid="lang-switch-toggle"]')).includes(SELF), `кнопка шапки показывает «${SELF}»`);
  const guestLinks = await txt(g, '[data-testid="guest-links"]');
  ok(guestLinks.includes(C("common.logIn")) && guestLinks.includes(C("layout.header.register")), "гостевые ссылки шапки на языке", guestLinks);
  ok((await g.evaluate(() => document.querySelector(".app-landing")?.textContent ?? "")).includes(C("landingPage.heroTitle")), "лендинг на языке");
  ok((await g.evaluate(() => performance.getEntriesByType("navigation").length)) === navBefore && g.url() === urlBefore, "без перезагрузки страницы");
  ok((await g.cookies()).some((c) => c.name === "ui_locale" && c.value === L), `cookie ui_locale=${L}`);
  await g.reload({ waitUntil: "networkidle0" });
  ok((await lang(g)) === L && (await txt(g, ".topbar-tagline")).startsWith(TAG), `после перезагрузки — ${L} (cookie)`);
  const r401 = await fetch(`${BASE}/auth/me`, { headers: { Cookie: `ui_locale=${L}` } });
  const j401 = await r401.json().catch(() => ({}));
  ok(r401.status === 401 && j401.error === C("common.authRequired"), `401 гостю — на языке («${C("common.authRequired")}»)`, J([r401.status, j401]));
  // данные по месту показа: шапка документа и граф
  await g.goto(UI + `/synthesis/${DOC}`, { waitUntil: "networkidle0" });
  await g.waitForSelector(".doc-section", { timeout: 20000 });
  const metaVals = await g.evaluate(() => [...document.querySelectorAll(".doc-meta-val")].map((e) => e.textContent.trim()));
  ok(metaVals.includes(D("Диалектический")) && metaVals.includes(D("Глубокая")) && metaVals.includes(D("Преобразующий")), "шапка документа: метод/глубина/уровень на языке", J(metaVals));
  ok(metaVals.every((v) => !/Диалектический|Глубокая|Преобразующий/.test(v)), "русских меток в шапке нет");
  const expDate = new Date((await sql`select created_at from syntheses where id=${DOC}`)[0].created_at).toLocaleDateString(L, { day: "2-digit", month: "long", year: "numeric" });
  ok(metaVals.includes(expDate) && !/[а-яё]/i.test(expDate), `дата шапки — на языке («${expDate}», числа и даты по языку интерфейса)`, J(metaVals));
  const subtitle = await txt(g, ".doc-subtitle");
  ok(subtitle.includes(D("Гегель")) && subtitle.includes(D("Гераклит")), `подзаголовок: философы на языке (${D("Гегель")}, ${D("Гераклит")})`, subtitle);
  ok((await g.evaluate(() => [...document.querySelectorAll(".section-title")].map((s) => s.textContent))).some((t) => /Граф категорий/.test(t)), "названия разделов документа — русские (данные документа)");
  ok(g.errors.length === 0, "ошибок страницы нет (гость)", g.errors);
  // граф гостю не рисуется (8.7: содержание — вошедшему); панель графа смотрит
  // зарегистрированный читатель публичной концепции — тоже выбрав язык в шапке
  const RD = await mkUser("reader");
  const gr = await newPage(browser, RD);
  await gr.goto(UI + `/synthesis/${DOC}`, { waitUntil: "networkidle0" });
  await gr.waitForSelector(".doc-section", { timeout: 20000 });
  await pickLangUi(gr, L);
  await waitText(gr, ".topbar-tagline", TAG);
  const g0 = g;
  { const g = gr;
  ok(await clickBtn(g, ".actions-bar", strip(C("synthesisPage.graph"))) === "ok", `кнопка «${C("synthesisPage.graph")}» на языке (читатель публичной концепции)`);
  await g.waitForSelector(".gm-overlay", { timeout: 15000 });
  await clickBtn(g, ".gm-header", "2D");
  await g.waitForSelector(".node-g", { timeout: 15000 });
  await sleep(600);
  const legend = await textOf(g, ".gm-legend");
  ok(has(legend, C("graph.graphLegend.edgeTypesHeading")) && has(legend, D("Диалектическая")) && has(legend, D("Иерархическая")), "легенда: заголовок типов связей и типы на языке", legend.slice(0, 300));
  ok(has(legend, D("Онтологическая")) && !/диалектическая|онтологическая/i.test(legend), "легенда: типы категорий на языке, русских нет", legend.slice(0, 300));
  await g.evaluate(() => { document.querySelector(".edge-hit")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await g.waitForFunction(() => (document.querySelector(".gm-info-panel")?.innerText ?? "").length > 20, { timeout: 10000 }).catch(() => {});
  const panel = await textOf(g, ".gm-info-panel");
  ok((has(panel, D("Диалектическая")) || has(panel, D("Иерархическая"))) && !/диалектическая|иерархическая/i.test(panel), "панель связи: тип на языке", panel.slice(0, 200));
  ok((has(panel, C("graph.edgePanel.sourceHeading")) || has(panel, C("graph.edgePanel.targetHeading"))), "панель связи: заголовки на языке", panel.slice(0, 200));
  ok(g.errors.length === 0, "ошибок страницы нет (читатель)", g.errors);
  }
  void g0;
  // БД и промпт — по-русски
  const edges1 = await sql`select edge_type as type from category_edges where synthesis_id=${DOC} order by position`;
  ok(J(edges1) === J(edges0), "БД: типы связей русские и после показа на языке");
  const before = claude.calls;
  const rg = await api({ cookie: `${A.cookie}; ui_locale=${L}` }, "POST", `/syntheses/${DOC}/regenerate/theses`, {});
  ok(rg.status === 200, `перегенерация тезисов принята (интерфейс ${L})`, J(rg.json));
  for (let i = 0; i < 80 && claude.calls === before; i++) await sleep(250);
  const body = claude.bodies.at(-1) ?? {};
  const prompt = J(body.messages ?? "") + J(body.system ?? "");
  ok(claude.calls > before && /диалектическая/.test(prompt) && /онтологическая/.test(prompt), "промпт несёт русские типы", prompt.slice(0, 200));
  ok(![D("Диалектическая"), D("Онтологическая"), C("common.authRequired"), C("landingPage.heroTitle")].some((x) => has(prompt, x)), "в промпте нет текстов интерфейса на языке");
  for (let i = 0; i < 60; i++) { if ((await sql`select status from syntheses where id=${DOC}`)[0].status === "ready") break; await sleep(250); }

  /* ═══ R2 ═══ */
  console.log(`\n■ R2 [${L}]: вошедший: ui_locale=${L}, gen_lang=${NAME}; форма — ${NAME}; смена генерации интерфейс не трогает; другой браузер — сразу ${L}`);
  const B = await mkUser("user");
  const p = await newPage(browser, B);
  await p.goto(UI + "/catalog", { waitUntil: "networkidle0" });
  ok((await lang(p)) === "ru" && (await userRow(B.id)).ui_locale === null, "вошедший без выбора: ru, ui_locale NULL");
  await pickLangUi(p, L);
  await sleep(700);
  const row1 = await userRow(B.id);
  ok(row1.ui_locale === L && row1.gen_lang === NAME, `PATCH /auth/me: ui_locale=${L}, gen_lang=${NAME}`, J(row1));
  ok((await txt(p, ".topbar-tagline")).startsWith(TAG), "шапка вошедшего на языке");
  await p.goto(UI + "/synthesis/new", { waitUntil: "networkidle0" });
  await p.waitForSelector('[data-testid="gen-lang-select"]');
  ok((await p.$eval('[data-testid="gen-lang-select"]', (s) => s.value)) === NAME, `форма создания открывается с ${NAME}`);
  const formLabel = await p.evaluate(() => document.body.innerText);
  ok(has(formLabel, C("synthesis.synthesisForm.generationLanguage")) && has(formLabel, C("synthesis.synthesisForm.synthesize")) && !/Язык генерации|Синтезировать/i.test(formLabel), "форма создания на языке", formLabel.slice(0, 300));
  const OTHER = NAME === "German" ? "English" : "German";
  await p.select('[data-testid="gen-lang-select"]', OTHER);
  await sleep(700);
  const row2 = await userRow(B.id);
  ok(row2.gen_lang === OTHER && row2.ui_locale === L && (await lang(p)) === L, `генерация → ${OTHER}: gen_lang=${OTHER}, интерфейс остался ${L}`, J(row2));
  await p.goto(UI + "/profile", { waitUntil: "networkidle0" });
  ok(await p.$(`[data-testid="lang-switch-form"] button[data-locale="${L}"].active`), `профиль: переключатель-форма показывает ${L}`);
  ok(new RegExp(OTHER === "German" ? "German|Deutsch" : "English").test(await txt(p, '[data-testid="profile-gen-lang"]') ?? ""), `профиль: язык генерации по умолчанию — ${OTHER}`, await txt(p, '[data-testid="profile-gen-lang"]'));
  ok(p.errors.length === 0, "ошибок страницы нет (вошедший)", p.errors);
  const { cookie: cookie2 } = await login(B.email, "password-L");
  const p2 = await newPage(browser, { cookie: cookie2 });
  await p2.goto(UI + "/catalog", { waitUntil: "networkidle0" });
  await p2.waitForFunction((l2) => document.documentElement.lang === l2, { timeout: 10000 }, L).catch(() => {});
  ok((await lang(p2)) === L && (await txt(p2, ".topbar-tagline")).startsWith(TAG), `вход из другого браузера (свой контекст, без cookie ui_locale) — сразу ${L}`, await txt(p2, ".topbar-tagline"));
  ok(!(await p2.cookies()).some((c) => c.name === "ui_locale" && c.value !== L), "cookie другого браузера не спорит с ui_locale пользователя");

  /* ═══ R3 ═══ */
  console.log(`\n■ R3 [${L}]: плюралы по Intl.PluralRules; import отвергает форму, которой у языка нет`);
  const PL = ["catalog.synthesisCard.descendantsCount", "reviewPage.revisionFindings", "synthesis.pauseModal.stepsCount"];
  const NS = [1, 2, 5, 21, 1000000];
  const browserCats = await p.evaluate((ns, l) => ns.map((n) => new Intl.PluralRules(l).select(n)), NS, L);
  const nodeCats = NS.map((n) => new Intl.PluralRules(L).select(n));
  const langCats = new Intl.PluralRules(L).resolvedOptions().pluralCategories;
  ok(J(browserCats) === J(nodeCats), `категории ${L} для ${NS.join(", ")}: ${nodeCats.join(", ")} (Chrome 131 = Node)`, J([browserCats, nodeCats]));
  /** Ветви «категория {текст}» плюрала строки каталога (без вложенных скобок). */
  const branches = (msg) => Object.fromEntries([...msg.matchAll(/(?:^|\s)(zero|one|two|few|many|other|=\d+)\s*\{([^{}]*)\}/g)].map((m) => [m[1], m[2]]));
  for (const key of PL) {
    const br = branches(C(key));
    ok(langCats.every((c) => c in br) && Object.keys(br).every((c) => c.startsWith("=") || langCats.includes(c)), `${key}: ветви ${Object.keys(br).join("/")} ≡ формам ${L} (${langCats.join("/")})`, C(key));
    const got = NS.map((n) => formatMessage(C(key), { n }, L));
    // «#» печатается с разделителями языка (правка после L.1): 10⁶ — «1.000.000 …»
    const want = NS.map((n, i) => (br[`=${n}`] ?? br[nodeCats[i]] ?? br.other).replace(/#/g, n.toLocaleString(L)).trim());
    ok(got.every((x, i) => x.trim().endsWith(want[i])) && got.every((x) => !/[а-яё]/i.test(x)), `${key}: ${got.join(" | ")}`, J(want));
  }
  const ALIEN = ["few", "two", "zero", "many"].find((c) => !langCats.includes(c));
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tL-"));
    for (const d of ["scripts/i18n", "packages/shared/i18n"]) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
    fs.mkdirSync(path.join(tmp, "node_modules"), { recursive: true });
    fs.symlinkSync(path.join(ROOT, "node_modules/typescript"), path.join(tmp, "node_modules/typescript"), "dir");
    const t = JSON.parse(fs.readFileSync(path.join(tmp, "packages/shared/i18n/strings.json"), "utf8"));
    const k = "catalog.synthesisCard.descendantsCount";
    const req = path.join(tmp, "req.json");
    fs.writeFileSync(req, J({ meta: { kind: "translation-request", languages: [L] }, strings: { [k]: { ru: t.strings[k].ru, [L]: `{n, plural, one {# x} ${ALIEN} {# xx} other {# xxx}}` } } }));
    const r = spawnSync(process.execPath, ["scripts/i18n/i18n-import.mjs", req], { cwd: tmp, encoding: "utf8" });
    const t2 = JSON.parse(fs.readFileSync(path.join(tmp, "packages/shared/i18n/strings.json"), "utf8"));
    ok(/отклонено 1/.test(r.stdout + r.stderr) && (r.stdout + r.stderr).includes(ALIEN) && t2.strings[k][L] === t.strings[k][L], `import отвергает форму ${ALIEN} для ${L}, строка таблицы не тронута`, (r.stdout + r.stderr).slice(-400));
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  /* ═══ R4 ═══ */
  const [O1, O2] = UI_LOCALES.filter((x) => x !== "ru" && x !== L);
  console.log(`\n■ R4 [${L}]: каталоги по требованию — ru→${L}→${O1}→${L}→${O2}→${L}, ровно один запрос чанка ${L}`);
  const q = await newPage(browser, null);
  await q.goto(UI + "/", { waitUntil: "networkidle0" });
  ok((await lang(q)) === "ru" && q.catalogRequests.length === 0, "старт ru, каталоги не грузились");
  for (const l of [L, O1, L, O2, L]) { await pickLangUi(q, l); await sleep(300); }
  const lReq = q.catalogRequests.filter((x) => x.startsWith(`${L}-`));
  ok(lReq.length === 1, `шесть переключений: запросов чанка ${L} — ${lReq.length}`, J(q.catalogRequests));
  ok(q.catalogRequests.filter((x) => x.startsWith(`${O1}-`)).length === 1 && q.catalogRequests.filter((x) => x.startsWith(`${O2}-`)).length === 1, `${O1} и ${O2} — тоже по одному разу`, J(q.catalogRequests));
  ok((await lang(q)) === L && (await txt(q, ".topbar-tagline")).startsWith(TAG), `в конце — ${L}`);
  ok(q.errors.length === 0, "ошибок страницы нет", q.errors);
  try { await browser.close(); } catch {}
  browser = null;
  killKids();

  /* ═══ R5 ═══ */
  console.log(`\n■ R5 [${L}]: удалить перевод одного ключа → i18n:check --strict и check:integration (4ay) красные → таблица побайтно`);
  const backup = fs.readFileSync(TABLE, "utf8");
  const K = "common.save";
  try {
    const t = JSON.parse(backup);
    t.strings[K][L] = null;
    delete t.strings[K].draft;
    fs.writeFileSync(TABLE, JSON.stringify(t, null, 2) + "\n");
    const chk = spawnSync(process.execPath, ["scripts/i18n/i18n-check.mjs", "--strict"], { cwd: ROOT, encoding: "utf8" });
    ok(chk.status === 1 && /ключи без перевода[^\n]*: 1/.test(chk.stdout) && new RegExp(`${K.replace(".", "\\.")} \\[${L}\\]`).test(chk.stdout), `i18n:check --strict красный: ${K} [${L}]`, chk.stdout.split("\n").filter((l) => /без перевода|common\.save/.test(l)).join(" | "));
    console.log("  · check:integration на испорченной таблице — около двух минут…");
    const ic = spawnSync("npm", ["run", "check:integration", "-w", "server"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const out = (ic.stdout ?? "") + (ic.stderr ?? "");
    ok(ic.status !== 0 && /ПРОБЛЕМЫ/.test(out), "check:integration красный");
    ok(/4ay: i18n:check --strict красный/.test(out) && new RegExp(`${K.replace(".", "\\.")} \\[${L}\\]`).test(out), `4ay называет i18n:check --strict и ключ common.save [${L}]`, out.split("\n").filter((l) => /^ - /.test(l)).slice(0, 6).join("\n"));
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
