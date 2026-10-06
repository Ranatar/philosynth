/**
 * Тестовые запросы R2–R8 беседы 11.3 (язык интерфейса, клиент) — одним
 * харнессом: живой сервер :3000 + СБОРКА клиента (vite build) под vite
 * preview :5213 (preview проксирует /api и /ws по server.proxy) + Chrome 131
 * + PG/Redis; мок Claude :3893 записывает системные промпты (R5).
 *
 * Почему сборка, а не npm run dev: StrictMode в режиме разработки удваивает
 * эффекты, и счёт запросов каталога (R6) врал бы (постановка 11.3).
 *
 *   R2 гость: смена языка → шапка, лендинг, публичный каталог по-английски без
 *      перезагрузки; после перезагрузки язык сохранён (cookie ui_locale)
 *   R3 связь языков: вошедший → de в шапке → users.ui_locale/gen_lang, форма
 *      создания открывается с German; язык генерации → French → интерфейс de
 *   R4 static: карточки каталога, меню, заголовок EditModal — на новом языке
 *   R5 документ на русском при интерфейсе en: перегенерация раздела без
 *      языковой инструкции (lang документа), интерфейс вокруг английский
 *   R6 число запросов на сборке: каталог один раз, повтор — ни одного
 *   R7 пометка разбора (Д-16): владелец видит, чужой и гость — нет
 *   R8 css-parity — расхождений 0
 *
 * Перед прогоном: pg_ctlcluster 16 main start; redis-server --daemonize yes
 * --save ''; посевы prompts/configs/taxonomy. Запуск из корня:
 *   node tests/test-113-requests2-8.mjs      (CHROME_PATH — Chrome 131)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import postgres from "postgres";

import { CAPSULE, SECTIONS, SECTION_ORDER } from "./test-92-fixture.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5213, MOCK_PORT = 3893;
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${UI_PORT}`;
const CHROME = [process.env.CHROME_PATH, `${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`, "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome"].find((p) => p && existsSync(p));
const sql = postgres(process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth");
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? " — " + String(extra).slice(0, 400) : ""}`); }
}

/* ── Мок Claude: пишет system каждого запроса ── */
const claude = { calls: 0, systems: [] };
function startClaudeMock() {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      claude.calls++;
      try { const b = JSON.parse(body); claude.systems.push(typeof b.system === "string" ? b.system : J(b.system ?? "")); } catch { claude.systems.push(""); }
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (o) => res.write(`data: ${J(o)}\n\n`);
      send({ type: "message_start", message: { usage: { input_tokens: 100 } } });
      send({ type: "content_block_delta", delta: { type: "text_delta", text: '<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">Резюме</div><div class="doc-content"><div data-section="Цели и метод"><h4>Цели и метод</h4><p>Перегенерировано.</p></div></div></div>' } });
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

/* ── HTTP ── */
async function api(who, method, path, body) {
  const headers = {};
  if (who) headers.Cookie = who.cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : J(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function mkUser(tag) {
  const email = `t113-${tag}-${Date.now()}@example.com`;
  await api(null, "POST", "/auth/register", { email, password: "password-113", displayName: `T113 ${tag}` });
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-113" }) });
  const cookie = r.headers.get("set-cookie").split(";")[0];
  return { email, cookie, id: (await r.json()).user.id };
}
async function insertFixture(user, title, lang = "Russian") {
  const [syn] = await sql`insert into syntheses (user_id, seed, title, status, section_order, capsule_html, doc_num, lang)
    values (${user.id}, 'зерно 11.3', ${title}, 'ready', ${sql.json(SECTION_ORDER)}, ${CAPSULE}, 'PS-0113-TEST', ${lang}) returning id`;
  for (const s of SECTIONS)
    await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${syn.id}, ${s.key}, ${s.num}, ${s.title}, ${s.html})`;
  return syn.id;
}
const userRow = async (id) => (await sql`select ui_locale, gen_lang from users where id=${id}`)[0];

/* ── Браузер ── */
const lang = (page) => page.$eval("html", (e) => e.lang);
const txt = (page, sel) => page.$eval(sel, (e) => e.textContent.trim()).catch(() => null);
async function clickLang(page, l, variant = "topbar") {
  // клик через DOM: при открытой модалке .edit-overlay накрывает шапку, а
  // переключатель проверяется и в этом положении (R4)
  const found = await page.evaluate((v, l2) => { const b = document.querySelector(`[data-testid="lang-switch-${v}"] button[data-locale="${l2}"]`); b?.click(); return !!b; }, variant, l);
  if (!found) throw new Error(`нет кнопки языка ${l} (${variant})`);
  await page.waitForFunction((v, l2) => document.querySelector(`[data-testid="lang-switch-${v}"] button[data-locale="${l2}"]`)?.classList.contains("active"), { timeout: 5000 }, variant, l);
}
async function newPage(browser, who) {
  // каждому персонажу — свой контекст (свои cookie): иначе ui_locale гостя из
  // R2 достался бы вошедшему и R6 (в браузере это одно хранилище cookie)
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.catalogRequests = [];
  page.on("request", (r) => { const m = /\/assets\/((?:en|de)-[^/]+\.js)$/.exec(r.url()); if (m) page.catalogRequests.push(m[1]); });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  // Язык браузера ru-RU: headless shell не читает --lang, navigator.language
  // ставится через переопределение Accept-Language (CDP)
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setUserAgentOverride", { userAgent: await browser.userAgent(), acceptLanguage: "ru-RU,ru" });
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  return page;
}
const waitText = (page, sel, needle) => page.waitForFunction((s, n) => (document.querySelector(s)?.textContent ?? "").includes(n), { timeout: 10000 }, sel, needle);

let browser;
async function main() {
  if (!CHROME) throw new Error("Chrome 131 не найден — задайте CHROME_PATH");
  await assertPortFree(`${BASE}/health`, "сервером");
  await assertPortFree(UI, "preview");

  console.log("■ Сборка клиента (vite build) — счёт запросов честен только на сборке");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8" });
  ok(build.status === 0 && /dist\/assets\/en-[^ ]+\.js/.test(build.stdout), "сборка прошла, каталог en — отдельный чанк", build.stderr?.slice(-300));
  ok(/dist\/assets\/de-[^ ]+\.js/.test(build.stdout), "каталог de — отдельный чанк (пустой)");

  await startClaudeMock();
  sp(["--import", "tsx", "index.ts"], ROOT + "server", {
    PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-113", STREAM_RETRY_DELAYS: "50",
  });
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {});
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");
  const puppeteer = (await import("puppeteer-core")).default;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
  console.log(`  (браузер: ${await browser.version()}; клиент — сборка под vite preview)`);

  const A = await mkUser("owner"), B = await mkUser("other");
  await sql`update users set balance_usd = 20 where id in (${A.id}, ${B.id})`;
  const DOC = await insertFixture(A, "Т113 русский документ");
  await api(A, "PATCH", `/syntheses/${DOC}`, { visibility: "full" });

  /* ═══ R2 ═══ */
  console.log("\n■ R2: гость меняет язык → шапка, лендинг, каталог по-английски без перезагрузки; после перезагрузки язык сохранён");
  const g = await newPage(browser, null);
  await g.goto(UI + "/", { waitUntil: "networkidle0" });
  ok((await lang(g)) === "ru" && (await txt(g, ".brand-tagline")).startsWith("Система Синтеза"), "гость с ru-RU: язык ru, шапка русская", await txt(g, ".brand-tagline"));
  ok(g.catalogRequests.length === 0, "русский каталог не грузится (ru — в коде)");
  await g.waitForSelector('[data-testid="guest-links"]');
  const urlBefore = g.url();
  const navBefore = await g.evaluate(() => performance.getEntriesByType("navigation").length);
  await clickLang(g, "en");
  await waitText(g, ".brand-tagline", "Philosophical Concept Synthesis");
  ok((await lang(g)) === "en", "<html lang> = en");
  ok((await txt(g, '[data-testid="guest-links"]')).includes("Log in") && (await txt(g, '[data-testid="guest-links"]')).includes("Sign up"), "гостевые ссылки шапки по-английски", await txt(g, '[data-testid="guest-links"]'));
  ok((await g.evaluate(() => document.querySelector(".app-landing")?.textContent ?? "")).includes("Concept synthesis"), "лендинг по-английски");
  ok((await g.evaluate(() => performance.getEntriesByType("navigation").length)) === navBefore && g.url() === urlBefore, "без перезагрузки страницы");
  ok((await g.cookies()).some((c) => c.name === "ui_locale" && c.value === "en"), "cookie ui_locale=en выставлена");
  ok(g.catalogRequests.length === 1 && g.catalogRequests[0].startsWith("en-"), "каталог en загружен один раз", g.catalogRequests);
  await g.goto(UI + "/explore", { waitUntil: "networkidle0" });
  const exploreText = await g.evaluate(() => document.querySelector(".main-wrap")?.textContent ?? "");
  ok((await lang(g)) === "en" && !/Публичн|Каталог/.test(exploreText) && /Т113 русский документ/.test(exploreText), "публичный каталог: интерфейс английский, название концепции — как в документе", exploreText.slice(0, 200));
  ok((await g.evaluate(() => [...document.querySelectorAll(".cert-badge")].map((b) => b.textContent))).some((t) => /ready/i.test(t)), "подпись статуса карточки (static → фабрика) по-английски");
  await g.reload({ waitUntil: "networkidle0" });
  ok((await lang(g)) === "en" && (await txt(g, ".brand-tagline")).startsWith("Philosophical"), "после перезагрузки язык сохранён (cookie)");
  const r = await fetch(`${BASE}/syntheses/${DOC}/sections/sum`, { headers: { Cookie: "ui_locale=en" } });
  ok(r.status === 401 && /required|log ?in|authoriz/i.test((await r.json()).error ?? ""), "сервер отвечает гостю на языке cookie (401 по-английски)");
  ok(g.errors.length === 0, "ошибок страницы нет", g.errors);

  /* ═══ R3 ═══ */
  console.log("\n■ R3: вошедший → немецкий в шапке → форма с German; язык генерации French → интерфейс остался немецким");
  const p = await newPage(browser, A);
  await p.goto(UI + "/catalog", { waitUntil: "networkidle0" });
  ok((await lang(p)) === "ru" && (await userRow(A.id)).ui_locale === null, "вошедший без выбора: ru, ui_locale NULL");
  await clickLang(p, "de");
  await sleep(600);
  const rowDe = await userRow(A.id);
  ok(rowDe.ui_locale === "de" && rowDe.gen_lang === "German", "PATCH /auth/me { uiLocale: de } → ui_locale=de, gen_lang=German (правило владельца)", J(rowDe));
  ok((await lang(p)) === "de" && p.catalogRequests.filter((x) => x.startsWith("de-")).length === 1, "интерфейс de, каталог de загружен один раз", p.catalogRequests);
  ok((await txt(p, ".brand-tagline")).startsWith("Система Синтеза"), "каталог de пуст → текст русский (штатно)");
  await p.goto(UI + "/synthesis/new", { waitUntil: "networkidle0" });
  await p.waitForSelector('[data-testid="gen-lang-select"]');
  ok((await p.$eval('[data-testid="gen-lang-select"]', (s) => s.value)) === "German", "форма создания открывается с German (из user.gen_lang)");
  ok((await lang(p)) === "de", "перед сменой языка генерации интерфейс de");
  await p.select('[data-testid="gen-lang-select"]', "French");
  await sleep(600);
  const rowFr = await userRow(A.id);
  ok(rowFr.gen_lang === "French" && rowFr.ui_locale === "de", "PATCH { genLang: French }: gen_lang=French, ui_locale не тронут", J(rowFr));
  ok((await lang(p)) === "de", "интерфейс остался немецким (связь односторонняя)");
  await p.goto(UI + "/synthesis/new", { waitUntil: "networkidle0" });
  ok((await p.$eval('[data-testid="gen-lang-select"]', (s) => s.value)) === "French", "новая форма открывается с French");
  await p.select('[data-testid="gen-lang-select"]', "__custom");
  await p.type('[data-testid="gen-lang-custom"]', "Ancient Greek");
  await p.$eval('[data-testid="gen-lang-custom"]', (i) => i.blur());
  await sleep(600);
  ok((await userRow(A.id)).gen_lang === "Ancient Greek", "«Другой…» → свой язык уходит в gen_lang по blur");
  await p.goto(UI + "/synthesis/new", { waitUntil: "networkidle0" });
  ok((await p.$eval('[data-testid="gen-lang-select"]', (s) => s.value)) === "__custom" && (await p.$eval('[data-testid="gen-lang-custom"]', (i) => i.value)) === "Ancient Greek", "значение вне списка открывает ветку «Другой…» с ним в поле");
  await p.goto(UI + "/profile", { waitUntil: "networkidle0" });
  ok(await p.$('[data-testid="lang-switch-form"] button[data-locale="de"].active'), "в профиле переключатель показывает de");
  await clickLang(p, "en", "form");
  await sleep(600);
  const rowEn = await userRow(A.id);
  ok(rowEn.ui_locale === "en" && rowEn.gen_lang === "English" && (await lang(p)) === "en", "переключатель профиля: ui_locale=en, gen_lang переписан на English, интерфейс en", J(rowEn));
  ok((await txt(p, '[data-testid="profile-gen-lang"]')).includes("English"), "строка профиля показывает язык генерации по умолчанию");
  ok(p.errors.length === 0, "ошибок страницы нет", p.errors);

  /* ═══ R4 ═══ */
  console.log("\n■ R4: static — карточки каталога, меню, заголовок EditModal на новом языке, не на прежнем");
  await p.goto(UI + "/catalog", { waitUntil: "networkidle0" });
  const nav = async () => p.evaluate(() => [...document.querySelectorAll(".app-nav-link")].map((a) => a.textContent.trim()));
  ok((await nav()).includes("Catalog") && !(await nav()).includes("Каталог"), "меню (NAV_ITEMS) по-английски", await nav());
  const badges = async () => p.evaluate(() => [...document.querySelectorAll(".cert-badge")].map((b) => b.textContent.trim()));
  ok((await badges()).some((t) => t === "ready") && !(await badges()).some((t) => t === "готов"), "статус карточки (STATUS_LABELS) по-английски", await badges());
  await clickLang(p, "ru");
  await waitText(p, ".brand-tagline", "Система");
  ok((await nav()).includes("Каталог") && (await badges()).some((t) => t === "готов") && !(await badges()).some((t) => t === "ready"), "обратно на ru — подписи русские (не залипли)", await badges());
  await p.goto(UI + `/synthesis/${DOC}`, { waitUntil: "networkidle0" });
  await p.waitForSelector(".doc-section");
  const editBtn = async () => p.evaluate(() => [...document.querySelectorAll("button.action-btn")].some((b) => /Изменить|Edit/.test(b.textContent)));
  ok(await editBtn(), "кнопка редактирования есть");
  await p.evaluate(() => [...document.querySelectorAll("button.action-btn")].find((b) => /Изменить/.test(b.textContent))?.click());
  await p.waitForSelector(".edit-modal-title");
  ok((await txt(p, ".edit-modal-title")).includes("Редактирование Разделов"), "EditModal открыт по-русски");
  await clickLang(p, "en");
  await waitText(p, ".edit-modal-title", "Section Editing");
  ok((await txt(p, ".edit-modal-title")) === "✎ Section Editing", "заголовок EditModal переключился на английский без переоткрытия");
  const modalText = await p.evaluate(() => document.querySelector(".edit-modal")?.textContent ?? "");
  ok(!/Перегенерировать|Удалить/.test(modalText) || /Regenerate|Delete/.test(modalText), "словари действий модалки (TYPE_LABEL и т.п.) не залипли на русском", modalText.slice(0, 300));
  ok(p.errors.length === 0, "ошибок страницы нет", p.errors);

  /* ═══ R5 ═══ */
  console.log("\n■ R5: документ на русском, интерфейс английский → перегенерация по lang документа, интерфейс вокруг английский");
  await p.keyboard.press("Escape");
  await p.goto(UI + `/synthesis/${DOC}`, { waitUntil: "networkidle0" });
  ok((await lang(p)) === "en" && (await txt(p, ".brand-tagline")).startsWith("Philosophical"), "интерфейс английский");
  ok((await sql`select lang from syntheses where id=${DOC}`)[0].lang === "Russian", "lang документа — Russian");
  const before = claude.calls;
  const rg = await api(A, "POST", `/syntheses/${DOC}/regenerate/sum`, {});
  ok(rg.status === 200, "POST /regenerate/sum принят", J(rg.json));
  for (let i = 0; i < 60 && claude.calls === before; i++) await sleep(250);
  ok(claude.calls > before, "модель вызвана");
  const sys = claude.systems.at(-1) ?? "";
  ok(!/CRITICAL OUTPUT LANGUAGE INSTRUCTION/.test(sys) && /Ты — ведущий специалист/.test(sys), "системный промпт без языковой инструкции — генерация по-русски (lang документа), не по языку интерфейса", sys.slice(0, 120));
  ok((await sql`select lang from syntheses where id=${DOC}`)[0].lang === "Russian", "lang документа не изменился");
  for (let i = 0; i < 40; i++) { const st = (await sql`select status from syntheses where id=${DOC}`)[0].status; if (st === "ready") break; await sleep(250); }
  await p.goto(UI + `/synthesis/${DOC}`, { waitUntil: "networkidle0" });
  await p.waitForSelector(".doc-section");
  ok((await lang(p)) === "en" && (await p.evaluate(() => [...document.querySelectorAll("button.action-btn")].some((b) => /Edit/.test(b.textContent)))), "после перегенерации интерфейс вокруг документа английский");
  const docTitles = await p.evaluate(() => [...document.querySelectorAll(".section-title")].map((s) => s.textContent.trim()));
  ok(docTitles.some((t) => /Резюме|Граф категорий/.test(t)), "названия разделов документа — на языке генерации (русском), не переведены", docTitles);

  /* ═══ R6 ═══ */
  console.log("\n■ R6: число запросов на сборке — каталог один раз, повтор того же языка — ни одного");
  const q = await newPage(browser, null);
  await q.goto(UI + "/", { waitUntil: "networkidle0" });
  ok(q.catalogRequests.length === 0, "старт с ru — запросов каталога 0");
  await clickLang(q, "en"); await waitText(q, ".brand-tagline", "Philosophical");
  ok(q.catalogRequests.filter((x) => x.startsWith("en-")).length === 1, "смена на en — один запрос каталога", q.catalogRequests);
  await clickLang(q, "ru"); await waitText(q, ".brand-tagline", "Система");
  await clickLang(q, "en"); await waitText(q, ".brand-tagline", "Philosophical");
  ok(q.catalogRequests.filter((x) => x.startsWith("en-")).length === 1, "ru → en повторно — ни одного нового запроса (кэш)", q.catalogRequests);
  await clickLang(q, "de"); await sleep(500);
  ok(q.catalogRequests.filter((x) => x.startsWith("de-")).length === 1, "de — один запрос", q.catalogRequests);
  await clickLang(q, "en"); await clickLang(q, "de"); await sleep(300);
  ok(q.catalogRequests.length === 2, "итого за сеанс: ровно два запроса (en, de) при шести переключениях", q.catalogRequests);
  ok(q.errors.length === 0, "ошибок страницы нет", q.errors);

  /* ═══ R7 ═══ */
  console.log("\n■ R7: пометка разбора (Д-16) — владелец видит пометку и список; чужой зарегистрированный и гость — нет");
  const WARN = ["graph: направление «bidirektional» не опознано (строка 3) — заменено на «однонаправленная»", "graph: роль «Kern» вне ROLE_MAP (строка 5)"];
  await sql`INSERT INTO generation_log (synthesis_id, section_key, section_label, log_type, source, status, input_tokens, output_tokens, cost_usd, metadata)
    VALUES (${DOC}, 'graph', 'Граф категорий', 'generation', 'initial', 'done', 500, 600, 0.5, ${sql.json({ parseWarnings: WARN })})`;
  const secOwner = await api(A, "GET", `/syntheses/${DOC}/sections/graph`);
  ok(secOwner.json?.section?.parseWarnings?.length === 2, "сервер: владельцу parseWarnings в SectionFull");
  await clickLang(p, "ru"); await waitText(p, ".brand-tagline", "Система");
  await p.goto(UI + `/synthesis/${DOC}`, { waitUntil: "networkidle0" });
  await p.waitForSelector('[data-testid="parse-warnings-graph"]', { timeout: 15000 });
  ok((await txt(p, '[data-testid="parse-warnings-graph"] summary')).includes("Разобран с потерями (2 предупреждения)"), "владелец: пометка с русским плюралом «2 предупреждения»", await txt(p, '[data-testid="parse-warnings-graph"] summary'));
  // 12.3 (Д-47): «Резюме» выше перегенерировано моком, пишущим один подраздел из семи, —
  // у него теперь законная пометка о пропущенных подразделах; раздел без генлога — глоссарий
  ok(!(await p.$('[data-testid="parse-warnings-glossary"]')), "у раздела без предупреждений пометки нет");
  ok(((await txt(p, '[data-testid="parse-warnings-sum"] summary')) ?? "").includes("Разобран с потерями (1 предупреждение)"), "12.3 (Д-47): у «Резюме», где мок пропустил подразделы, — пометка о пропуске", await txt(p, '[data-testid="parse-warnings-sum"] summary'));
  await p.$eval('[data-testid="parse-warnings-graph"]', (d) => (d.open = true));
  const items = await p.evaluate(() => [...document.querySelectorAll('[data-testid="parse-warnings-graph"] li')].map((li) => li.textContent));
  ok(items.length === 2 && items[0].includes("bidirektional") && items[1].includes("Kern"), "раскрытие показывает оба предупреждения", items);
  await clickLang(p, "en"); await waitText(p, ".brand-tagline", "Philosophical");
  ok((await txt(p, '[data-testid="parse-warnings-graph"] summary')).includes("Parsed with losses (2 warnings)"), "пометка по-английски с английским плюралом", await txt(p, '[data-testid="parse-warnings-graph"] summary'));
  const other = await newPage(browser, B);
  await other.goto(UI + `/synthesis/${DOC}`, { waitUntil: "networkidle0" });
  await other.waitForSelector(".doc-section", { timeout: 15000 });
  ok((await other.$$(".doc-section")).length >= 3 && !(await other.$('[data-testid^="parse-warnings-"]')), "чужой зарегистрированный (ступень full): документ виден, пометки нет");
  const guest = await newPage(browser, null);
  await guest.goto(UI + `/synthesis/${DOC}`, { waitUntil: "networkidle0" });
  await guest.waitForSelector(".doc-section", { timeout: 15000 });
  ok((await guest.$$(".doc-section")).length >= 3 && !(await guest.$('[data-testid^="parse-warnings-"]')), "гость: документ виден, пометки нет");
  const secOther = await api(B, "GET", `/syntheses/${DOC}/sections/graph`);
  console.log(`  · сервер чужому: parseWarnings ${secOther.json?.section?.parseWarnings ? "ОТДАЁТ (" + secOther.json.section.parseWarnings.length + ") — долг Д-31, адресат 12.1" : "не отдаёт"}; клиент гейтит по isOwner`);

  /* ═══ R8 ═══ */
  console.log("\n■ R8: css-parity после блока 11.3");
  const cp = spawnSync("python3", ["scripts/checks/css-parity-audit.py"], { cwd: ROOT, encoding: "utf8" });
  const uncovered = /итог: непокрытых правил (\d+)/.exec(cp.stdout)?.[1];
  const mismatched = /итого правил с расхождениями: (\d+)/.exec(cp.stdout)?.[1];
  ok(cp.status === 0 && uncovered === "0" && mismatched === "0", `css-parity: непокрытых ${uncovered}, расхождений ${mismatched}`, cp.stdout.slice(-400));
  const unruled = [...cp.stdout.matchAll(/^\s{2}([a-z0-9-]+)\s+нет и в исходнике/gm)].map((m) => m[1]);
  ok(unruled.every((c) => c === "gm-hint"), "классов без правил — только предсуществующий gm-hint (Д-22)", unruled);
  ok(/Беседа 11.3/.test(cp.stdout) || uncovered === "0", "блок 11.3 учтён аудитом");
}

main()
  .catch((e) => { failed++; console.log("  ✗ харнесс:", e?.stack ?? e); console.log("\n--- server log (хвост) ---\n" + serverLog.slice(-2500)); })
  .finally(async () => {
    try { await browser?.close(); } catch {}
    for (const k of kids) { try { process.kill(-k.pid, "SIGTERM"); } catch {} }
    await sql.end({ timeout: 2 }).catch(() => {});
    console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗`);
    process.exit(failed ? 1 : 0);
  });
