/**
 * Тестовые запросы 2–12 беседы 8.7 (витрина — клиент) одним заходом, в
 * браузере (puppeteer-core + Chrome) против живого сервера :3000 + vite
 * :5199 + PG16/Redis (БД philosynth, тарифы посеяны); мок Claude — для
 * старта мета-синтеза (R9). Фикстуры — SQL как в test-86 (капсула-секция,
 * пять разделов, ступень и флаги).
 *  R2  Гость на «/» без cookie → стартовая: карточки из публичного каталога
 *      (свои публичные из фикстуры), таблица тарифов с посеянными планами,
 *      «Создать аккаунт» в теле ведёт на /register; шапка гостя.
 *  R3  Зарегистрированный на «/» → /catalog.
 *  R4  Гостевой просмотр: карточка со стартовой → документ виден, полоса
 *      «Вы смотрите публичную концепцию» + «Создать аккаунт», стоимости и
 *      токенов НЕТ на странице, кнопок «◈ Лог»/графа/экспорта/правки нет;
 *      WS гостем не открывается.
 *  R5  Витрина глазами гостя: капсула и метаданные видны, оглавления,
 *      разделов и графа нет, врезка объясняет почему.
 *  R6  Приватная по прямой ссылке гостем → «концепция приватна» со ссылкой
 *      на вход (state.from возвращает после входа), не пусто и не NotFound;
 *      несуществующий id → 404 внутри страницы; гость на /catalog → «/».
 *  R7  Управление публичностью: «Публичность» → «Публичная», снять
 *      «показывать логи» → «Сохранить» → ровно ОДИН PATCH { visibility,
 *      4 флага }, список перечитан (бейдж «публичная»), подпись audienceText
 *      сменилась; из другой учётной записи документ виден, «◈ Лог» нет,
 *      GET /logs/context → 403.
 *  R8  Ступени галочек: витрина (в БД show_logs=false, show_prompts=true,
 *      allow_meta=false) → в панели одна галочка «показывать авторство» и
 *      строка-пояснение; переключение на «Публичную» возвращает три с
 *      ПРЕЖНИМИ значениями (false/true/false), не сброшенными.
 *  R9  Мета-синтез: форма → «+ Из каталога» → чужая с allow_meta=false ☑ →
 *      «Генерировать» → сообщение с её названием и «не разрешил»; чужая
 *      разрешённая → синтез создан (строка + lineage), редирект на документ.
 *  R10 Шапка: у гостя «Войти · Регистрация», бокового меню нет; после входа
 *      — имя и меню.
 *  R11 Edge: владелец на своём публичном документе, сессия удалена в БД →
 *      клик «◈ Лог» → 401 → страница не падает, полоса гостевая, кнопок
 *      владельца нет.
 *  R12 css-parity: A и B нулевые, C — только gm-hint; tsc -b чистый.
 * Запуск: setsid nohup node_modules/.bin/tsx tests/test-87-requests2-12.mjs > /tmp/t87.log 2>&1 &
 * (PG16 + Redis подняты; CHROME_PATH — путь к chrome)
 */
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";
import puppeteer from "puppeteer-core";

const SERVER_PORT = 3000;
const VITE_PORT = 5199;
const MOCK_PORT = 3887;
const UI = `http://localhost:${VITE_PORT}`;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const CHROME = process.env.CHROME_PATH ?? "/opt/google/chrome/chrome";
const ROOT = new URL("../", import.meta.url).pathname;

let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
const J = (x) => JSON.stringify(x);
const pageErrors = [], consoleErrors = [];
const sqlc = postgres(DB_URL, { max: 3 });

/* ══ Фикстуры (как test-86) ═══════════════════════════════════════════ */
const TAG = "T87";
const SEC_HTML = (key, title, num) => `<div class="doc-section" id="sec-${key}"><span class="section-num">§ ${num}</span><h3 class="section-title">${title}</h3><div class="doc-content"><div data-section="${title}"><p>Текст ${title} ${TAG}.</p></div></div></div>`;
async function makeSynthesis(ownerId, title, opts = {}) {
  const [row] = await sqlc`INSERT INTO syntheses (user_id, title, status, visibility, show_author, show_logs, show_prompts, allow_meta, section_order, capsule_html, total_input_tokens, total_output_tokens, total_cost_usd, doc_num, seed)
    VALUES (${ownerId}, ${title}, 'ready', ${opts.visibility ?? "private"}, ${opts.showAuthor ?? false}, ${opts.showLogs ?? true}, ${opts.showPrompts ?? false}, ${opts.allowMeta ?? true},
      ${sqlc.json(["sum", "graph", "glossary", "theses", "critique"])}, ${'<div class="doc-section"><div data-section="Капсула"><h4>Капсула</h4><p>Капсула ' + title + '</p></div></div>'}, 1000, 2000, 1.234567, ${"PS-" + Math.floor(Math.random() * 9000 + 1000) + "-" + TAG}, ${"зерно " + TAG})
    RETURNING id`;
  const id = row.id;
  const secs = [["sum", "Сводка", 1], ["graph", "Граф категорий", 2], ["glossary", "Глоссарий", 3], ["theses", "Корпус тезисов", 4], ["critique", "Критика", 5]];
  for (const [key, t, n] of secs) await sqlc`INSERT INTO sections (synthesis_id, key, section_num, title, html_content) VALUES (${id}, ${key}, ${n}, ${t}, ${SEC_HTML(key, t, n)})`;
  await sqlc`INSERT INTO synthesis_lineage (synthesis_id, parent_type, parent_name, position) VALUES (${id}, 'philosopher', 'Кант', 0)`;
  await sqlc`INSERT INTO generation_log (synthesis_id, section_key, section_label, log_type, source, status, input_tokens, output_tokens, cost_usd, metadata) VALUES (${id}, 'sum', 'Сводка', 'generation', 'initial', 'done', 500, 600, 0.5, ${sqlc.json({ promptSkeleton: "СКЕЛЕТ " + TAG })})`;
  await sqlc`INSERT INTO context_log (synthesis_id, section_key, budget, total_used, req_found, req_total, opt_included, opt_total, entries) VALUES (${id}, 'sum', 1000, 100, 1, 1, 0, 0, ${sqlc.json([])})`;
  return id;
}
const dbVis = async (id) => (await sqlc`SELECT visibility, show_author, show_logs, show_prompts, allow_meta FROM syntheses WHERE id = ${id}`)[0];
async function cleanup() {
  const stale = await sqlc`SELECT id FROM users WHERE email LIKE 't87-%'`;
  for (const u of stale) {
    await sqlc`DELETE FROM syntheses WHERE user_id = ${u.id}`;
    await sqlc`DELETE FROM api_usage WHERE user_id = ${u.id}`;
    await sqlc`DELETE FROM transactions WHERE user_id = ${u.id}`;
    await sqlc`DELETE FROM users WHERE id = ${u.id}`;
  }
}

/* ══ Мок Claude SSE — короткий ответ (мета-синтез R9 стартует фоном) ═══ */
function startClaudeMock() {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (o) => res.write(`data: ${J(o)}\n\n`);
      send({ type: "message_start", message: { usage: { input_tokens: 100 } } });
      send({ type: "content_block_delta", delta: { type: "text_delta", text: '<div class="doc-section"><div class="doc-content"><p>Мок T87.</p></div></div>' } });
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 20 } });
      send({ type: "message_stop" });
      res.end();
    });
  });
  return new Promise((r) => srv.listen(MOCK_PORT, "127.0.0.1", () => r(srv)));
}

/* ══ Процессы ═════════════════════════════════════════════════════════ */
let serverProc, viteProc, browser, claudeSrv;
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
      ...process.env, PORT: String(SERVER_PORT), DATABASE_URL: DB_URL, REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
      CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000",
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-87",
      API_KEY_ENCRYPTION_SECRET: "test-encryption-secret-87", BILLING_ENFORCE: "false", NODE_ENV: "development",
      STREAM_RETRY_DELAYS: "50", STREAM_STUCK_MS: "600000",
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
  viteProc = spawn(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "--port", String(VITE_PORT), "--strictPort"], {
    cwd: new URL("../client/", import.meta.url).pathname,
    env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  viteProc.stdout.on("data", (d) => (viteLog += d));
  viteProc.stderr.on("data", (d) => (viteLog += d));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(UI + "/")).ok) return; } catch {} await sleep(300); }
  throw new Error("vite не поднялся:\n" + viteLog.slice(-2000));
}
const killGroup = (p) => { if (!p) return; try { process.kill(-p.pid, "SIGKILL"); } catch {} try { p.kill("SIGKILL"); } catch {} };

async function makeUser(tag, displayName) {
  const email = `t87-${tag}-${Date.now()}@test.local`;
  const password = "Passw0rd!123";
  let r = await fetch(`${API}/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: J({ email, password, displayName }) });
  if (!r.ok) throw new Error("register: " + (await r.text()));
  const id = (await r.json()).user.id;
  r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: J({ email, password }) });
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  return { id, email, password, cookie, displayName };
}

/* ══ Хелперы браузера ═════════════════════════════════════════════════ */
const T = (id) => `[data-testid="${id}"]`;
const CARD = (id) => `.catalog-card[data-synthesis-id="${id}"]`;
const text = (page, sel) => page.$eval(sel, (el) => el.innerText.replace(/\s+/g, " ").trim()).catch(() => null);
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
const has = (s, frag) => String(s ?? "").toLowerCase().includes(String(frag).toLowerCase());
const exists = (page, sel) => page.$(sel).then((h) => !!h);
const waitFor = (page, sel, timeout = 20000) => page.waitForSelector(sel, { timeout });
const clickDom = (page, sel) => page.$eval(sel, (el) => el.click());
async function clickBtn(page, rootSel, frag) {
  return page.evaluate(([root, t]) => {
    const r = root ? document.querySelector(root) : document;
    if (!r) return "no-root";
    const n = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const b = [...r.querySelectorAll("button, a")].find((x) => n(x.innerText).includes(n(t)));
    if (!b) return "no-btn";
    if (b.disabled) return "disabled";
    b.click(); return "ok";
  }, [rootSel, frag]);
}
async function fill(page, sel, value) {
  await waitFor(page, sel);
  await page.click(sel);
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (value) await page.type(sel, value);
}
const hasButton = (page, frag) => page.evaluate((t) => {
  const n = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return [...document.querySelectorAll("button")].some((b) => n(b.innerText).includes(n(t)));
}, frag);

/* ══ Прогон ═══════════════════════════════════════════════════════════ */
let tscResult = null;
try {
  await cleanup();
  claudeSrv = await startClaudeMock();
  await startServer();
  await startVite();
  console.log("Мок, сервер и vite подняты.");

  const A = await makeUser("owner", "Автор Т87");
  const B = await makeUser("reader", "Читатель Т87");
  const S_FULL = await makeSynthesis(A.id, `Публичная ${TAG}`, { visibility: "full", showAuthor: true, showLogs: true, showPrompts: true, allowMeta: false });
  const S_SHOW = await makeSynthesis(A.id, `Витрина ${TAG}`, { visibility: "showcase", showAuthor: true, showLogs: false, showPrompts: true, allowMeta: false });
  const S_PRIV = await makeSynthesis(A.id, `Приватная ${TAG}`, { visibility: "private" });
  const S_MANAGE = await makeSynthesis(A.id, `Управляемая ${TAG}`, { visibility: "private", showAuthor: true, showLogs: true, showPrompts: false, allowMeta: false });
  const S_META_OK = await makeSynthesis(A.id, `Разрешённая ${TAG}`, { visibility: "full", allowMeta: true });
  const S_META_NO = await makeSynthesis(A.id, `Запрещённая ${TAG}`, { visibility: "full", allowMeta: false });

  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push("console: " + m.text()); });
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); void d.accept(); });
  // Перехват запросов: считаем PATCH и WS
  const reqLog = [];
  page.on("request", (r) => reqLog.push({ method: r.method(), url: r.url() }));
  const cdp = await page.createCDPSession();
  await cdp.send("Network.enable");
  const wsOpens = [];
  cdp.on("Network.webSocketCreated", (e) => wsOpens.push(e.url));

  const login = async (u) => {
    await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
    await fill(page, "input[type=email]", u.email);
    await fill(page, "input[type=password]", u.password);
    await page.click("button[type=submit]");
    await page.waitForFunction(() => location.pathname !== "/login", { timeout: 20000 });
  };
  const clearCookies = async () => { await cdp.send("Network.clearBrowserCookies"); };

  /* ══ R2: гость на «/» ══ */
  console.log("\n■ R2: гость на стартовой");
  await clearCookies();
  await page.goto(`${UI}/`, { waitUntil: "domcontentloaded" });
  await waitFor(page, T("landing"));
  ok(await exists(page, T("landing")), "«/» без cookie → LandingPage (не редирект на /login)");
  ok(page.url().endsWith("/"), "URL остался «/»", page.url());
  await waitFor(page, `${T("landing-showcase")} .catalog-card`);
  const cards = await page.$$eval(`${T("landing-showcase")} .catalog-card`, (els) => els.map((e) => e.getAttribute("data-synthesis-id")));
  ok(cards.length >= 2 && cards.length <= 4 && cards.includes(S_FULL) && cards.includes(S_SHOW), "витрина живая: 2–4 карточки из /syntheses/public, среди них публичная и витрина фикстуры", J(cards));
  ok(!cards.includes(S_PRIV), "приватной на стартовой нет");
  const landingT = await bodyText(page);
  ok(!/Стоимость|\$\d/.test(await text(page, T("landing-showcase"))), "стоимости на карточках гостю нет");
  await waitFor(page, T("landing-plans-table"));
  const planRows = await page.$$eval(`${T("landing-plans-table")} tbody tr`, (els) => els.map((e) => e.innerText));
  ok(planRows.length === 3 && planRows.every((r) => /\$/.test(r)), "таблица тарифов — три посеянных плана с ценой", J(planRows));
  ok(!(await page.$$(`${T("landing-plans-table")} button`)).length, "на стартовой у тарифов нет «Оформить»");
  ok(has(landingT, "Синтез концепций") && has(landingT, "Граф категорий") && has(landingT, "Мета-синтез") && has(landingT, "Режимы"), "четыре опоры «что это»");
  ok(await exists(page, T("landing-register")), "крупная «Создать аккаунт» в теле страницы");
  ok(await exists(page, T("guest-links")), "шапка гостя: «Войти · Регистрация»");
  ok(!(await exists(page, ".app-sidebar")), "бокового меню у гостя нет");
  ok(has(await text(page, `${T("landing-showcase")} ${CARD(S_FULL)}`), `Автор: ${A.displayName}`), "карточка с действенным show_author несёт автора");
  await clickDom(page, T("landing-register"));
  await page.waitForFunction(() => location.pathname === "/register", { timeout: 15000 });
  ok(true, "«Создать аккаунт» → /register");
  ok(has(await bodyText(page), "На главную"), "на странице регистрации есть ссылка «На главную»");

  /* ══ R3: зарегистрированный на «/» ══ */
  console.log("\n■ R3: зарегистрированный на «/» → /catalog");
  await login(A);
  await page.goto(`${UI}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 15000 });
  ok(true, "вошедший на «/» попадает в /catalog");
  await waitFor(page, ".catalog-card, .pool-status");
  ok(await exists(page, ".app-sidebar"), "меню у вошедшего есть");
  ok(!(await exists(page, T("guest-links"))), "гостевых ссылок у вошедшего нет");
  ok(has(await text(page, T("topbar-right")), A.displayName), "в шапке — имя");

  /* ══ R4: гостевой просмотр ══ */
  console.log("\n■ R4: гостевой просмотр публичной");
  await clearCookies();
  await page.goto(`${UI}/`, { waitUntil: "domcontentloaded" });
  await waitFor(page, `${T("landing-showcase")} ${CARD(S_FULL)}`);
  wsOpens.length = 0;
  await clickDom(page, `${T("landing-showcase")} ${CARD(S_FULL)}`);
  await waitFor(page, ".doc-header .doc-title");
  ok(page.url().includes(`/synthesis/${S_FULL}`), "карточка ведёт на документ");
  ok(has(await text(page, ".doc-header .doc-title"), `Публичная ${TAG}`), "заголовок документа виден");
  await waitFor(page, T("view-banner"));
  ok(has(await text(page, T("view-banner")), "Вы смотрите публичную концепцию"), "полоса «Вы смотрите публичную концепцию»");
  ok(await page.$eval(T("view-banner"), (e) => e.getAttribute("data-viewer")) === "guest", "полоса помечена viewer=guest");
  ok(await exists(page, T("view-banner-register")), "в полосе — «Создать аккаунт» (гостю)");
  await sleep(800);
  const docT = await bodyText(page);
  ok(has(docT, `Текст Сводка ${TAG}`) && has(docT, `Текст Критика ${TAG}`), "разделы документа отрисованы из ответа GET /:id (одним ответом)");
  ok(!/Стоимость:|Токены:|1[.,]2346|1 000 вх/.test(docT), "стоимости и токенов на странице НЕТ (не нулями — вовсе)");
  ok(!(await hasButton(page, "◈ Лог")) && !(await hasButton(page, "Скачать промпты")), "кнопок логов и запросов нет");
  ok(!(await hasButton(page, "◈ Граф")) && !(await hasButton(page, "⤓ Экспорт")) && !(await hasButton(page, "✎ Изменить")), "графа, экспорта и правки у гостя нет");
  ok(await hasButton(page, "Распечатать"), "«Распечатать» гостю доступна");
  ok(has(docT, `Автор ${A.displayName}`) || has(docT, `автор: ${A.displayName}`), "authorName в шапке / полосе");
  ok(wsOpens.length === 0, "WS гостем не открывается", J(wsOpens));
  ok(!reqLog.some((r) => /\/api\/v1\/syntheses\/[^/]+\/(sections|modes)/.test(r.url) && r.url.includes(S_FULL)), "гость не зовёт /sections и /modes", J(reqLog.filter((r) => r.url.includes(S_FULL)).map((r) => r.url)));
  ok(!(await exists(page, ".doc-header button")), "✎ капсулы/названия гостю не рисуются");

  /* ══ R5: витрина глазами гостя ══ */
  console.log("\n■ R5: витрина глазами гостя");
  await page.goto(`${UI}/synthesis/${S_SHOW}`, { waitUntil: "domcontentloaded" });
  await waitFor(page, T("showcase-notice"));
  const showT = await bodyText(page);
  ok(has(await text(page, ".doc-header .doc-title"), `Витрина ${TAG}`), "заголовок витрины виден");
  ok(has(await text(page, ".doc-header"), "КАПСУЛА КОНЦЕПЦИИ") && has(await text(page, ".doc-header"), `Витрина ${TAG}`), "капсула видна в шапке", await text(page, ".doc-header"));
  ok(has(showT, "Кант"), "метаданные (философы) видны");
  ok(has(await text(page, T("showcase-notice")), "Автор открыл только витрину"), "врезка объясняет почему");
  ok(!has(showT, `Текст Сводка ${TAG}`) && !(await exists(page, ".doc-body, .toc-body")), "разделов и оглавления нет");
  ok(!(await hasButton(page, "◈ Граф")) && !(await hasButton(page, "◈ Лог")), "графа и лога на витрине нет");
  ok(has(await text(page, T("view-banner")), "витрина"), "полоса помечает ступень «витрина»");
  ok(!/Стоимость:|Токены:/.test(showT), "стоимости гостю на витрине нет");

  /* ══ R6: приватная по прямой ссылке ══ */
  console.log("\n■ R6: приватная / несуществующая / закрытый маршрут гостем");
  await page.goto(`${UI}/synthesis/${S_PRIV}`, { waitUntil: "domcontentloaded" });
  await waitFor(page, T("forbidden-page"));
  const fT = await text(page, T("forbidden-page"));
  ok(has(fT, "приватна") && has(fT, "войдите"), "страница «концепция приватна» со ссылкой на вход (не пустой экран)");
  ok(!has(await bodyText(page), "Страница не найдена"), "…и не NotFound");
  await clickDom(page, T("forbidden-login"));
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 15000 });
  await fill(page, "input[type=email]", A.email);
  await fill(page, "input[type=password]", A.password);
  await page.click("button[type=submit]");
  await page.waitForFunction((p) => location.pathname === p, { timeout: 20000 }, `/synthesis/${S_PRIV}`);
  await waitFor(page, ".doc-header .doc-title");
  ok(has(await text(page, ".doc-header .doc-title"), `Приватная ${TAG}`), "после входа возврат к приватной (state.from), документ владельцу виден");
  ok(!(await exists(page, T("view-banner"))), "владельцу полосы нет");
  await clearCookies();
  await page.goto(`${UI}/synthesis/00000000-0000-4000-8000-000000000000`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /404/.test(document.body.innerText), { timeout: 15000 });
  ok(has(await bodyText(page), "404"), "несуществующий id → 404 внутри страницы");
  await page.goto(`${UI}/catalog`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => location.pathname === "/", { timeout: 15000 });
  ok(await exists(page, T("landing")), "гость на /catalog → «/» (стартовая)");
  await page.goto(`${UI}/explore`, { waitUntil: "domcontentloaded" });
  await waitFor(page, ".catalog-card");
  const explT = await bodyText(page);
  ok(has(explT, "Публичные концепции") && !has(explT, "Новый синтез") && !(await hasButton(page, "Генеалогия")), "/explore гостю: публичный каталог без «Мои», «Новый синтез» и генеалогии");
  ok(await exists(page, T("explore-register")), "/explore гостю — «Создать аккаунт»");

  /* ══ R7: управление публичностью ══ */
  console.log("\n■ R7: управление публичностью");
  await login(A);
  await page.goto(`${UI}/catalog`, { waitUntil: "domcontentloaded" });
  const cardM = CARD(S_MANAGE);
  await waitFor(page, cardM);
  ok(has(await text(page, `${cardM} ${T("card-visibility")}`), "приватная"), "бейдж ступени на своей карточке: «приватная»");
  ok(!(await hasButton(page, "Опубликовать")), "кнопки «Опубликовать» больше нет");
  await clickDom(page, `${cardM} ${T("card-visibility-btn")}`);
  await waitFor(page, `${cardM} ${T("visibility-audience")}`);
  const aud0 = await text(page, `${cardM} ${T("visibility-audience")}`);
  ok(has(aud0, "никто"), "подпись для приватной: не видит никто");
  const patchesBefore = reqLog.filter((r) => r.method === "PATCH").length;
  await clickDom(page, `${cardM} ${T("visibility-step-full")}`);
  await sleep(200);
  ok(await exists(page, `${cardM} ${T("visibility-flag-showLogs")} input:checked`), "на «Публичной» галочка «показывать логи» отмечена (из БД true)");
  const aud1 = await text(page, `${cardM} ${T("visibility-audience")}`);
  ok(has(aud1, "открыты логи"), "подпись по черновику: логи открыты");
  await clickDom(page, `${cardM} ${T("visibility-flag-showLogs")} input`);
  await sleep(150);
  const aud2 = await text(page, `${cardM} ${T("visibility-audience")}`);
  ok(has(aud2, "Логи генерации закрыты"), "снятие галочки меняет подпись до сохранения");
  ok(reqLog.filter((r) => r.method === "PATCH").length === patchesBefore, "до «Сохранить» ни одного PATCH");
  await clickDom(page, `${cardM} ${T("visibility-save")}`);
  await page.waitForFunction((s) => !document.querySelector(s), { timeout: 15000 }, `${cardM} ${T("visibility-control")}`);
  await sleep(500);
  const patches = reqLog.filter((r) => r.method === "PATCH" && r.url.includes(S_MANAGE));
  ok(patches.length === patchesBefore + 1 || patches.length === 1, "ровно ОДИН PATCH со ступенью и флагами", J(patches.map((p) => p.url)));
  const v7 = await dbVis(S_MANAGE);
  ok(v7.visibility === "full" && v7.show_logs === false && v7.show_author === true && v7.show_prompts === false && v7.allow_meta === false, "в БД: full, show_logs=false, остальные как были", J(v7));
  await page.waitForFunction((s) => /публичная/i.test(document.querySelector(s)?.innerText ?? ""), { timeout: 15000 }, `${cardM} ${T("card-visibility")}`);
  ok(true, "список перечитан — бейдж «публичная»");
  ok(reqLog.filter((r) => r.method === "GET" && /\/api\/v1\/syntheses(\?|$)/.test(r.url)).length >= 2, "GET списка после PATCH (тихая перечитка)");
  await clickDom(page, `${cardM} ${T("card-visibility-btn")}`);
  await waitFor(page, `${cardM} ${T("visibility-audience")}`);
  const aud3 = await text(page, `${cardM} ${T("visibility-audience")}`);
  ok(has(aud3, "Логи генерации закрыты") && !has(aud3, "никто"), "подпись под переключателем изменилась после сохранения");
  // Из другой учётной записи
  // Отдельный контекст: cookie B не должна вытеснить сессию A в основной странице
  const bCtx = await browser.createBrowserContext();
  const bPage = await bCtx.newPage();
  await bPage.setViewport({ width: 1280, height: 900 });
  bPage.on("pageerror", (e) => pageErrors.push("B: " + String(e)));
  await bPage.setCookie({ name: B.cookie.split("=")[0], value: B.cookie.split("=").slice(1).join("="), url: UI });
  await bPage.goto(`${UI}/synthesis/${S_MANAGE}`, { waitUntil: "domcontentloaded" });
  await bPage.waitForSelector(".doc-header .doc-title", { timeout: 20000 });
  await bPage.waitForSelector(T("view-banner"), { timeout: 20000 });
  ok(await bPage.$eval(T("view-banner"), (e) => e.getAttribute("data-viewer")) === "user", "чужому зарегистрированному — полоса viewer=user");
  ok(!(await bPage.$(T("view-banner-register"))), "…без «Создать аккаунт»");
  ok(!(await bPage.evaluate(() => [...document.querySelectorAll("button")].some((b) => /◈ лог/i.test(b.innerText)))), "«◈ Лог» у чужого при show_logs=false нет");
  const bT = await bPage.evaluate(() => document.body.innerText);
  ok(/Стоимость:/.test(bT), "зарегистрированному стоимость видна (флагом не управляется)");
  const logsStatus = await bPage.evaluate(async (id) => (await fetch(`/api/v1/syntheses/${id}/logs/context`, { credentials: "include" })).status, S_MANAGE);
  ok(logsStatus === 403, "GET /logs/context чужому → 403", String(logsStatus));
  ok(await bPage.evaluate(() => [...document.querySelectorAll("button")].some((b) => /◈ граф/i.test(b.innerText))), "«◈ Граф» чужому зарегистрированному на 'full' доступен");
  await bCtx.close();

  /* ══ R8: ступени галочек ══ */
  console.log("\n■ R8: ступени галочек");
  await page.goto(`${UI}/catalog`, { waitUntil: "domcontentloaded" });
  const cardS = CARD(S_SHOW);
  await waitFor(page, cardS);
  await clickDom(page, `${cardS} ${T("card-visibility-btn")}`);
  await waitFor(page, `${cardS} ${T("visibility-flags")}`);
  const flags0 = await page.$$eval(`${cardS} ${T("visibility-flags")} label`, (els) => els.map((e) => e.getAttribute("data-testid")));
  ok(J(flags0) === J(["visibility-flag-showAuthor"]), "на витрине видна одна галочка — «показывать авторство»", J(flags0));
  ok(await exists(page, `${cardS} ${T("visibility-showcase-note")}`), "строка-пояснение о неприменяемых флагах");
  ok(await page.$eval(`${cardS} ${T("visibility-step-showcase")}`, (e) => e.getAttribute("aria-checked")) === "true", "подсвечена ступень «Витрина»");
  await clickDom(page, `${cardS} ${T("visibility-step-full")}`);
  await sleep(200);
  const flags1 = await page.$$eval(`${cardS} ${T("visibility-flags")} label`, (els) => els.map((e) => [e.getAttribute("data-testid"), e.querySelector("input").checked]));
  ok(J(flags1) === J([["visibility-flag-showAuthor", true], ["visibility-flag-showLogs", false], ["visibility-flag-showPrompts", true], ["visibility-flag-allowMeta", false]]), "на «Публичной» три спрятанные вернулись с ПРЕЖНИМИ значениями (false/true/false), не сброшенными", J(flags1));
  ok(!(await exists(page, `${cardS} ${T("visibility-showcase-note")}`)), "строка-пояснение витрины исчезла");
  await clickDom(page, `${cardS} ${T("visibility-step-showcase")}`);
  await sleep(150);
  ok((await page.$$(`${cardS} ${T("visibility-flags")} label`)).length === 1, "обратно на витрину — снова одна галочка");
  await clickBtn(page, cardS, "Отмена");
  ok(J(await dbVis(S_SHOW)) === J({ visibility: "showcase", show_author: true, show_logs: false, show_prompts: true, allow_meta: false }), "«Отмена» — в БД ничего не изменилось");

  /* ══ R9: мета-синтез ══ */
  console.log("\n■ R9: мета-синтез — запрет с названием, разрешённая создаётся");
  await login(B);
  await page.goto(`${UI}/synthesis/new`, { waitUntil: "domcontentloaded" });
  await waitFor(page, "textarea.form-textarea");
  ok(await clickBtn(page, null, "+ Из каталога") === "ok", "кнопка «+ Из каталога»");
  await waitFor(page, ".pool-catalog-row");
  const addRow = async (title) => page.evaluate((t) => {
    const row = [...document.querySelectorAll(".pool-catalog-row")].find((r) => r.innerText.includes(t));
    if (!row) return "no-row";
    row.querySelector("button").click(); return "ok";
  }, title);
  ok(await addRow(`Запрещённая ${TAG}`) === "ok", "чужая запрещённая добавлена в пул");
  // Каталожная запись входит в пул сразу ☑ участником (catalogPreviewToPoolEntry 3.2)
  await waitFor(page, ".pool-card.synth-on");
  ok(true, "☑ «Синтез» отмечен на карточке пула из каталога");
  await fill(page, "textarea.form-textarea", `зерно мета ${TAG}`);
  await page.$eval(".submit-btn", (el) => el.click());
  try {
    await page.waitForFunction((t) => /не разрешил/.test(document.body.innerText) && document.body.innerText.includes(t), { timeout: 30000 }, `Запрещённая ${TAG}`);
  } catch (e) {
    console.log("R9 диагностика:", J({ dialogs, posts: reqLog.filter((r) => r.method === "POST").slice(-5).map((r) => r.url), body: (await bodyText(page)).slice(0, 1500) }));
    throw e;
  }
  const errT = await bodyText(page);
  ok(has(errT, `«Запрещённая ${TAG}»`) && has(errT, "не разрешил"), "сообщение с названием концепции и причиной");
  ok(!(await sqlc`SELECT id FROM syntheses WHERE user_id = ${B.id}`).length, "синтез при запрете не создан");
  // Разрешённая — без перезагрузки: убрать запрещённую, добавить разрешённую
  await page.$eval(".pool-card .pool-card-btn.remove", (el) => el.click());
  await sleep(200);
  if (!(await exists(page, ".pool-catalog-row"))) await clickBtn(page, null, "+ Из каталога");
  await waitFor(page, ".pool-catalog-row");
  ok(await addRow(`Разрешённая ${TAG}`) === "ok", "чужая разрешённая добавлена в пул");
  await waitFor(page, ".pool-card.synth-on");
  await page.$eval(".submit-btn", (el) => el.click());
  await page.waitForFunction(() => /\/synthesis\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 40000 });
  const created = await sqlc`SELECT id, status FROM syntheses WHERE user_id = ${B.id}`;
  ok(created.length === 1, "разрешённая → синтез создан", J(created));
  if (created.length) {
    const lin = await sqlc`SELECT parent_synthesis_id FROM synthesis_lineage WHERE synthesis_id = ${created[0].id} AND parent_type = 'synthesis'`;
    ok(lin.length === 1 && lin[0].parent_synthesis_id === S_META_OK, "lineage: родитель — разрешённая концепция");
  }

  /* ══ R10: шапка ══ */
  console.log("\n■ R10: шапка гостя и вошедшего");
  await clearCookies();
  await page.goto(`${UI}/explore`, { waitUntil: "domcontentloaded" });
  await waitFor(page, T("guest-links"));
  const gl = await text(page, T("guest-links"));
  ok(has(gl, "Войти") && has(gl, "Регистрация"), "у гостя «Войти · Регистрация»");
  ok(!(await exists(page, ".app-sidebar")) && !(await exists(page, ".app-burger")), "бокового меню и бургера у гостя нет");
  await page.setViewport({ width: 400, height: 800 });
  await sleep(300);
  ok(await page.$eval(T("guest-links"), (e) => getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0), "гостевые ссылки видны и на узком экране");
  await page.setViewport({ width: 1280, height: 900 });
  await login(A);
  await waitFor(page, ".app-sidebar");
  ok(has(await text(page, T("topbar-right")), A.displayName) && await exists(page, ".app-sidebar"), "после входа — имя и меню");
  ok(!(await exists(page, T("guest-links"))), "гостевых ссылок нет");
  await clickBtn(page, T("topbar-right"), "Выйти");
  await page.waitForFunction(() => location.pathname === "/", { timeout: 15000 });
  ok(await exists(page, T("landing")), "выход → стартовая");

  /* ══ R11: сессия истекла на открытом документе ══ */
  console.log("\n■ R11: сессия истекла на открытом документе");
  await login(A);
  await page.goto(`${UI}/synthesis/${S_FULL}`, { waitUntil: "domcontentloaded" });
  await waitFor(page, ".doc-header .doc-title");
  await sleep(500);
  ok(!(await exists(page, T("view-banner"))) && (await hasButton(page, "✎ Изменить")), "владелец: полосы нет, правка есть");
  const killed = await sqlc`DELETE FROM sessions WHERE user_id = ${A.id} RETURNING id`;
  ok(killed.length >= 1, "сессия удалена в БД");
  pageErrors.length = 0;
  ok(await clickBtn(page, null, "◈ Лог") === "ok", "клик «◈ Лог» после смерти сессии");
  await waitFor(page, T("view-banner"), 20000);
  ok(await page.$eval(T("view-banner"), (e) => e.getAttribute("data-viewer")) === "guest", "полоса сменилась на гостевую");
  await sleep(500);
  ok(has(await text(page, ".doc-header .doc-title"), `Публичная ${TAG}`), "документ на месте (перечитан гостем)");
  ok(!(await hasButton(page, "✎ Изменить")) && !(await hasButton(page, "◈ Лог")), "кнопок владельца больше нет");
  ok(await exists(page, T("guest-links")), "шапка стала гостевой");
  ok(pageErrors.length === 0, "страница не упала (без pageerror)", J(pageErrors));

  /* ══ R12: css-parity и tsc ══ */
  console.log("\n■ R12: css-parity и tsc");
  const cssRun = spawnSync("python3", ["scripts/css-parity-audit.py"], { cwd: ROOT, encoding: "utf8" });
  ok(/итого правил с расхождениями: 0/.test(cssRun.stdout) && /непокрытых правил 0 из/.test(cssRun.stdout), "css-parity: A и B нулевые");
  const cRows = (cssRun.stdout.split("═══ C.")[1] ?? "").split("═══ D.")[0];
  ok(/gm-hint/.test(cRows) && /без правил: 1\b/.test(cRows), "раздел C — только gm-hint");
  tscResult = spawnSync("npx", ["tsc", "-b", "packages/shared", "server", "client"], { cwd: ROOT, encoding: "utf8", timeout: 600000 });
  ok(tscResult.status === 0, "tsc -b packages/shared server client — чистый", (tscResult.stdout + tscResult.stderr).slice(0, 800));

  ok(pageErrors.length === 0, "pageerror за прогон нет", J(pageErrors.slice(0, 3)));
  const realConsole = consoleErrors.filter((e) => !/401|403|404|Failed to load resource/.test(e));
  ok(realConsole.length === 0, "console.error за прогон нет (кроме ожидаемых 401/403/404)", J(realConsole.slice(0, 3)));
  ok(dialogs.every((d) => !/Ошибка|Error/i.test(d)), "диалогов с ошибками нет", J(dialogs));
} catch (e) {
  failed++; fails.push("EXCEPTION");
  console.log("\n✗ EXCEPTION: " + (e?.stack ?? e));
  console.log("server tail:\n" + serverLog.slice(-1500));
} finally {
  try { await browser?.close(); } catch {}
  killGroup(serverProc); killGroup(viteProc);
  try { claudeSrv?.close(); } catch {}
  try { await cleanup(); } catch {}
  await sqlc.end({ timeout: 2 });
}
console.log(`\nИТОГ test-87-requests2-12: ${passed} ✓ / ${failed} ✗`);
if (fails.length) console.log("Провалы:\n - " + fails.join("\n - "));
process.exit(failed ? 1 : 0);
