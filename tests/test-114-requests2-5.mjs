/**
 * Тестовые запросы R2–R5 беседы 11.4 (данные и переводы) — одним харнессом:
 * живой сервер :3000 + СБОРКА клиента (vite build) под vite preview :5214 +
 * Chrome 131 + PG/Redis; мок Claude :3894 пишет тела запросов (R2: промпт).
 *
 *   R2 data по месту показа: интерфейс en → типы связей и категорий в панели
 *      графа, легенде и TaxonomySelector — по-английски; в БД (categories /
 *      category_edges) и в промпте следующей генерации — по-русски
 *   R3 зеркала: режимы в английском интерфейсе подписаны по-английски
 *      (кнопки страницы, заголовок/подпись/подсказка модалки), MODE_CONFIG и
 *      MODE_UI остались русскими; check:integration с 4x/4y — INTEGRATION OK
 *   R4 цикл переводчика: export de → изменить три строки → import без --draft
 *      → отметка draft снята только у них (на КОПИИ таблицы — рабочую
 *      машинный текст без вычитки не трогает)
 *   R5 сторож: удалить перевод одного ключа (рабочая таблица, с возвратом) →
 *      i18n:check --strict и check:integration (4ay) красные с указанием ключа
 *
 * Перед прогоном: pg_ctlcluster 16 main start; redis-server --daemonize yes
 * --save ''; посевы prompts/configs/taxonomy. Запуск из корня:
 *   node_modules/.bin/tsx tests/test-114-requests2-5.mjs   (импорт server/services →
 *   только через tsx, 09 §1.1; CHROME_PATH — Chrome 131, PUPPETEER_CORE — путь к
 *   puppeteer-core, если он не в node_modules)
 */
import { spawn, spawnSync } from "node:child_process";
import fs, { existsSync } from "node:fs";
import http from "node:http";
import os, { homedir } from "node:os";
import path from "node:path";
import postgres from "postgres";

import { CAPSULE, SECTIONS, SECTION_ORDER } from "./test-92-fixture.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5214, MOCK_PORT = 3894;
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${UI_PORT}`;
const CHROME = [process.env.CHROME_PATH, `${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`, "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome"].find((p) => p && existsSync(p));
const sql = postgres(process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth");
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TABLE = path.join(ROOT, "packages/shared/i18n/strings.json");

let passed = 0, failed = 0;
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? " — " + String(extra).slice(0, 500) : ""}`); }
}

/* ── Мок Claude: пишет system и messages каждого запроса ── */
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
const runIntegration = () => spawnSync("npm", ["run", "check:integration", "-w", "server"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env } });

/* ── HTTP ── */
async function api(who, method, path, body) {
  const headers = {};
  if (who) headers.Cookie = who.cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : J(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function mkUser(tag) {
  const email = `t114-${tag}-${Date.now()}@example.com`;
  await api(null, "POST", "/auth/register", { email, password: "password-114", displayName: `T114 ${tag}` });
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-114" }) });
  const cookie = r.headers.get("set-cookie").split(";")[0];
  return { email, cookie, id: (await r.json()).user.id };
}
async function insertFixture(user, title) {
  const [syn] = await sql`insert into syntheses (user_id, seed, title, status, section_order, capsule_html, doc_num, lang, method, synth_level, depth)
    values (${user.id}, 'зерно 11.4', ${title}, 'ready', ${sql.json(SECTION_ORDER)}, ${CAPSULE}, 'PS-0114-TEST', 'Russian', 'dialectical', 'transformative', 'deep') returning id`;
  // философы — строки родословной (synthesis_lineage, parent_type = philosopher)
  for (const [i, name] of ["Гегель", "Гераклит"].entries())
    await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${syn.id}, 'philosopher', ${name}, ${i})`;
  for (const s of SECTIONS)
    await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${syn.id}, ${s.key}, ${s.num}, ${s.title}, ${s.html})`;
  return syn.id;
}

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
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setUserAgentOverride", { userAgent: await browser.userAgent(), acceptLanguage: "ru-RU,ru" });
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  return page;
}
async function clickLang(page, l) {
  const found = await page.evaluate((l2) => { const b = document.querySelector(`[data-testid="lang-switch-topbar"] button[data-locale="${l2}"]`); b?.click(); return !!b; }, l);
  if (!found) throw new Error(`нет кнопки языка ${l}`);
  await page.waitForFunction((l2) => document.querySelector(`[data-testid="lang-switch-topbar"] button[data-locale="${l2}"]`)?.classList.contains("active"), { timeout: 5000 }, l);
}

let browser;
async function main() {
  if (!CHROME) throw new Error("Chrome 131 не найден — задайте CHROME_PATH");
  await assertPortFree(`${BASE}/health`, "сервером");
  await assertPortFree(UI, "preview");

  console.log("■ Сборка клиента (vite build)");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8" });
  ok(build.status === 0 && /dist\/assets\/en-[^ ]+\.js/.test(build.stdout) && /dist\/assets\/de-[^ ]+\.js/.test(build.stdout), "сборка прошла, каталоги en и de — отдельные чанки", build.stderr?.slice(-300));

  await startClaudeMock();
  sp(["--import", "tsx", "index.ts"], ROOT + "server", {
    PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-114", STREAM_RETRY_DELAYS: "50",
  });
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {});
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");
  // puppeteer-core: в клоне его нет (не зависимость проекта); в песочнице живёт в
  // node_modules глобального mermaid-cli — берём оттуда, если обычный резолв пуст
  const PUPPETEER_FALLBACKS = [`${homedir()}/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js`, "/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js"];
  let puppeteer;
  try { puppeteer = (await import("puppeteer-core")).default; }
  catch { const fb = [process.env.PUPPETEER_CORE, ...PUPPETEER_FALLBACKS].find((f) => f && existsSync(f)); if (!fb) throw new Error("puppeteer-core не найден — задайте PUPPETEER_CORE"); puppeteer = (await import(fb)).default; }
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
  console.log(`  (браузер: ${await browser.version()}; клиент — сборка под vite preview)`);

  const { saveGraphToDb, parseGraphFromHTML } = await import("../server/services/graph-parser.ts");
  const A = await mkUser("owner");
  await sql`update users set balance_usd = 20 where id = ${A.id}`;
  const DOC = await insertFixture(A, "Т114 русский документ с графом");
  await saveGraphToDb(DOC, parseGraphFromHTML(SECTIONS.find((s) => s.key === "graph").html));
  const cats = await sql`select name, type, type_catalog_id from categories where synthesis_id=${DOC} order by position`;
  const edges = await sql`select edge_type as type, direction from category_edges where synthesis_id=${DOC} order by position`;
  ok(cats.length === 3 && edges.length === 2, "фикстура: 3 категории и 2 связи в БД", J([cats.length, edges.length]));
  ok(edges.every((e) => /^[а-яё]/i.test(e.type)) && cats.every((c) => /^[а-яё]/i.test(c.type)), "типы в БД — русские", J([edges.map((e) => e.type), cats.map((c) => c.type)]));

  /* ═══ R2 ═══ */
  console.log("\n■ R2: интерфейс en → типы связей/категорий в панели графа по-английски; в БД и в промпте — по-русски");
  const p = await newPage(browser, A);
  await p.goto(UI + `/synthesis/${DOC}`, { waitUntil: "networkidle0" });
  await p.waitForSelector(".doc-section", { timeout: 20000 });
  await clickLang(p, "en");
  await p.waitForFunction(() => document.documentElement.lang === "en", { timeout: 5000 });
  await p.waitForFunction(() => (document.querySelector(".brand-tagline")?.textContent ?? "").startsWith("Philosophical"), { timeout: 10000 }); // каталог en применён
  ok((await sql`select ui_locale from users where id=${A.id}`)[0].ui_locale === "en", "вошедший: ui_locale=en в БД");
  // шапка документа — метки-данные по месту показа
  const metaVals = await p.evaluate(() => [...document.querySelectorAll(".doc-meta-val")].map((e) => e.textContent.trim()));
  ok(metaVals.includes("Dialectical") && metaVals.includes("Deep") && metaVals.includes("Transformative"), "шапка: метод/глубина/уровень по-английски (ML/DL/SL по карте)", J(metaVals));
  ok(metaVals.every((v) => !/Диалектический|Глубокая|Преобразующий/.test(v)), "русских меток в шапке нет");
  const subtitle = await txt(p, ".doc-subtitle");
  ok(/^Based on: /.test(subtitle) && /Hegel/.test(subtitle) && /Heraclitus/.test(subtitle), "подзаголовок: «Based on: Hegel, Heraclitus» (зеркало subtitleFor не тронуто)", subtitle);
  const docTitles = await p.evaluate(() => [...document.querySelectorAll(".section-title")].map((s) => s.textContent.trim()));
  ok(docTitles.some((t) => /Граф категорий/.test(t)), "названия разделов ДОКУМЕНТА — русские (данные документа)", J(docTitles));
  // граф
  ok(await clickBtn(p, ".actions-bar", "Graph") === "ok", "кнопка «◈ Graph» по-английски");
  await p.waitForSelector(".gm-overlay", { timeout: 15000 });
  await clickBtn(p, ".gm-header", "2D");
  await p.waitForSelector(".node-g", { timeout: 15000 });
  await sleep(600);
  const legend = await textOf(p, ".gm-legend");
  ok(/RELATION TYPES|EDGE TYPES/.test(legend) && /dialectical/.test(legend) && /hierarchical/.test(legend), "легенда: заголовок типов связей по-английски, типы dialectical/hierarchical", legend.slice(0, 300));
  ok(/ontological/.test(legend) && /logical/.test(legend) && !/диалектическая|онтологическая/.test(legend), "легенда: типы категорий ontological/logical, русских нет", legend.slice(0, 300));
  const hits = await p.$$eval(".edge-hit", (els) => els.length);
  ok(hits === 2, "в 2D две области попадания связей (.edge-hit)", hits);
  await p.evaluate(() => { const h = document.querySelector(".edge-hit"); h?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await p.waitForFunction(() => /dialectical|hierarchical|диалектическая|иерархическая/.test(document.querySelector(".gm-info-panel")?.innerText ?? ""), { timeout: 10000 }).catch(() => {});
  const panel = await textOf(p, ".gm-info-panel");
  ok(/dialectical|hierarchical/.test(panel) && !/диалектическая|иерархическая/.test(panel), "EdgePanel: тип связи по-английски", panel.slice(0, 200));
  ok(/ontological|logical/.test(panel), "EdgePanel: типы концов (категорий) по-английски", panel.slice(0, 200));
  await p.evaluate(() => { const n = document.querySelector(".node-g"); n?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await sleep(400);
  const nodePanel = await textOf(p, ".gm-info-panel");
  ok(/ontological|logical/.test(nodePanel) && !/онтологическая/.test(nodePanel), "NodePanel: тип категории по-английски", nodePanel.slice(0, 200));
  // селектор таксономии в редакторе категории
  ok(await clickBtn(p, ".gm-info-panel", "Edit") === "ok", "«✎ Edit» категории", nodePanel.slice(0, 200));
  await p.waitForSelector(".element-editor-overlay [data-taxonomy-kind=category] input[role=combobox]", { timeout: 10000 });
  const C = ".element-editor-overlay [data-taxonomy-kind=category]";
  await p.click(`${C} input[role=combobox]`);
  await p.waitForSelector(`${C} .combobox-list .combobox-item`, { timeout: 8000 });
  const items = await p.$$eval(`${C} .combobox-item`, (els) => els.map((e) => e.innerText));
  const inputVal = await p.$eval(`${C} input[role=combobox]`, (i) => i.value);
  ok(/^[а-яё]/i.test(inputVal), "поле типа — значение ДОКУМЕНТА, русское (пишется в БД)", inputVal);
  const itemNames = items.map((t) => t.split("\n")[0].replace(/^≈ /, ""));
  ok(itemNames.length >= 5 && itemNames.every((n) => /^[A-Z]/.test(n)) && itemNames.includes("Aesthetic") && itemNames.includes("Analytical"), "TaxonomySelector: имена системных типов по-английски (ключи — латиница как были)", J(items.slice(0, 5)));
  // поле контролируемое: чистить нативным setter'ом value + input (09 §0.6 п.2), а не печатать поверх
  await p.evaluate((sel) => { const el = document.querySelector(sel); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, "Metaph"); el.dispatchEvent(new Event("input", { bubbles: true })); }, `${C} input[role=combobox]`);
  await sleep(400);
  const filtered = await p.$$eval(`${C} .combobox-item`, (els) => els.map((e) => e.innerText.split("\n")[0].replace(/^≈ /, ""))); // «≈» — нечёткое совпадение normalize первым
  ok(filtered.includes("Metaphysical"), "поиск по переведённому имени находит тип (Metaph → Metaphysical)", J(filtered));
  await p.keyboard.press("Escape");
  // БД не тронута, промпт следующей генерации — русский
  const edges2 = await sql`select edge_type as type from category_edges where synthesis_id=${DOC} order by position`;
  ok(J(edges2.map((e) => e.type)) === J(edges.map((e) => e.type)), "БД: типы связей остались русскими после показа по-английски", J(edges2));
  const before = claude.calls;
  const rg = await api({ cookie: A.cookie + "; ui_locale=en" }, "POST", `/syntheses/${DOC}/regenerate/theses`, {});
  ok(rg.status === 200, "POST /regenerate/theses принят (интерфейс en)", J(rg.json));
  for (let i = 0; i < 80 && claude.calls === before; i++) await sleep(250);
  ok(claude.calls > before, "модель вызвана");
  const body = claude.bodies.at(-1) ?? {};
  const prompt = J(body.messages ?? "") + J(body.system ?? "");
  ok(/диалектическая/.test(prompt) && /онтологическая/.test(prompt), "промпт следующей генерации несёт русские типы (graph:edges / nodes_compact)", prompt.slice(0, 200));
  ok(!/dialectical|ontological/i.test(prompt), "в промпте нет английских типов");
  for (let i = 0; i < 60; i++) { const st = (await sql`select status from syntheses where id=${DOC}`)[0].status; if (st === "ready") break; await sleep(250); }
  ok(p.errors.length === 0, "ошибок страницы нет", p.errors);

  /* ═══ R3 ═══ */
  console.log("\n■ R3: зеркала — режимы в английском интерфейсе по-английски; MODE_CONFIG/MODE_UI русские; check:integration 4x/4y зелёные");
  const stAfter = (await sql`select status from syntheses where id=${DOC}`)[0].status;
  console.log(`  · статус после перегенерации тезисов моком: ${stAfter}`);
  await sql`update syntheses set status='ready' where id=${DOC}`; // кнопки режимов — только у готового документа с капсулой
  await p.goto(UI + `/synthesis/${DOC}`, { waitUntil: "networkidle0" });
  await p.waitForSelector(".actions-bar", { timeout: 20000 }); // кнопки режимов — в панели действий страницы (#modeTabsBar — внутри модалки)
  await p.waitForFunction(() => [...document.querySelectorAll(".actions-bar button")].some((b) => /Opponent|Оппонент/.test(b.textContent)), { timeout: 15000 });
  const modeBtns = await p.evaluate(() => [...document.querySelectorAll(".actions-bar button")].map((b) => b.textContent.trim()));
  ok(modeBtns.some((t) => /Opponent/.test(t)) && modeBtns.some((t) => /Translator/.test(t)) && modeBtns.some((t) => /Time slice/.test(t)), "кнопки режимов: Opponent / Translator / Time slice", J(modeBtns));
  ok(!modeBtns.some((t) => /Оппонент|Переводчик|Временной/.test(t)), "русских подписей режимов нет");
  await p.evaluate(() => [...document.querySelectorAll(".actions-bar button")].find((b) => /Opponent/.test(b.textContent))?.click());
  await p.waitForSelector("#modeTitle", { timeout: 10000 });
  ok((await txt(p, "#modeTitle")) === "⚔ Opponent", "заголовок модалки «⚔ Opponent»", await txt(p, "#modeTitle"));
  const paramLabel = await txt(p, "#modeParamsGroup .form-label");
  const placeholder = await p.$eval("#modeParamInput", (i) => i.placeholder);
  ok(/Opponent philosopher|philosopher or tradition/i.test(paramLabel) && /Kant/.test(placeholder), "подпись параметра и placeholder по-английски", J([paramLabel, placeholder]));
  const sugg = await p.evaluate(() => [...document.querySelectorAll(".mode-modal button.edit-sec-btn")].map((b) => b.textContent.trim()));
  ok(sugg.includes("Marx") && !sugg.includes("Маркс"), "подсказки режима по-английски", J(sugg));
  await p.evaluate(() => [...document.querySelectorAll(".mode-modal button.edit-sec-btn")].find((b) => b.textContent.trim() === "Marx")?.click());
  ok((await p.$eval("#modeParamInput", (i) => i.value)) === "Marx", "клик по подсказке подставляет переведённое значение параметра (решение беседы)");
  await clickLang(p, "ru");
  await p.waitForFunction(() => document.querySelector("#modeTitle")?.textContent === "⚔ Оппонент", { timeout: 5000 });
  ok(true, "обратно на ru — «⚔ Оппонент» без переоткрытия модалки");
  const modeSvc = fs.readFileSync(path.join(ROOT, "server/services/mode-service.ts"), "utf8");
  const modeUi = fs.readFileSync(path.join(ROOT, "client/src/components/modes/ModeModal.tsx"), "utf8");
  ok(/title:\s*"⚔ Оппонент"/.test(modeSvc) && /title:\s*"⚔ Оппонент"/.test(modeUi) && !/\btl\(|\btData\(/.test(modeSvc.slice(modeSvc.indexOf("MODE_CONFIG"), modeSvc.indexOf("MODE_CONFIG") + 3000)), "MODE_CONFIG и MODE_UI — русские литералы (сторож 4x сравнивает как прежде)");
  ok(p.errors.length === 0, "ошибок страницы нет", p.errors);
  await browser.close(); browser = null;
  killKids();
  await sleep(1500);
  console.log("  · check:integration (сторожа 4x/4y/4aw/4ay) — около двух минут…");
  const ic = runIntegration();
  const icOut = (ic.stdout ?? "") + (ic.stderr ?? "");
  ok(ic.status === 0 && /INTEGRATION OK/.test(icOut), "check:integration — INTEGRATION OK", icOut.split("\n").filter((l) => /^ - /.test(l)).slice(0, 8).join("\n"));
  ok(!/ - 4x:| - 4y:| - 4aw:| - 4ay:/.test(icOut), "секции 4x/4y/4aw/4ay без замечаний");

  /* ═══ R4 ═══ */
  console.log("\n■ R4: цикл переводчика на копии таблицы — export de → три строки → import без --draft → draft снят только у них");
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "t114-"));
    for (const d of ["scripts/i18n", "packages/shared/i18n"]) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
    fs.mkdirSync(path.join(tmp, "node_modules"), { recursive: true });
    fs.symlinkSync(path.join(ROOT, "node_modules/typescript"), path.join(tmp, "node_modules/typescript"), "dir");
    const run = (args) => spawnSync(process.execPath, args, { cwd: tmp, encoding: "utf8" });
    const req = path.join(tmp, "i18n-request.de.json");
    let r = run(["scripts/i18n/i18n-export.mjs", "--lang", "de", "--dry", "--out", req]);
    const file = JSON.parse(fs.readFileSync(req, "utf8"));
    const total = Object.keys(file.strings).length;
    ok(r.status === 0 && total === 2269 && Object.values(file.strings).every((s) => s.draft?.includes("de")), `export --lang de: файл переводчика на ${total} строк, все — черновики`, r.stdout.slice(-200));
    const picked = ["common.save", "catalogPage.myCatalog", "shared.labels.methodDialectical" in file.strings ? "shared.labels.methodDialectical" : "shared.labels.methodAnalytical"];
    const edited = { meta: file.meta, strings: {} };
    for (const k of picked) edited.strings[k] = { ...file.strings[k], de: file.strings[k].de + " ✓", draft: file.strings[k].draft };
    fs.writeFileSync(req, J(edited));
    r = run(["scripts/i18n/i18n-import.mjs", req]);
    const t2 = JSON.parse(fs.readFileSync(path.join(tmp, "packages/shared/i18n/strings.json"), "utf8")).strings;
    ok(r.status === 0 && /влито переводов 3/.test(r.stdout), "import без --draft: влито 3", r.stdout.slice(-300));
    ok(picked.every((k) => t2[k].de.endsWith(" ✓") && !(t2[k].draft ?? []).includes("de") && (t2[k].draft ?? []).includes("en") && t2[k].from.de === t2[k].ru), "у трёх строк: текст новый, draft de снят, draft en цел, from.de = ru");
    const others = Object.keys(t2).filter((k) => !picked.includes(k));
    ok(others.every((k) => (t2[k].draft ?? []).includes("de") && t2[k].de === file.strings[k]?.de), `у остальных ${others.length} строк draft de и текст не тронуты`);
    r = run(["scripts/i18n/i18n-split.mjs"]);
    const deTmp = JSON.parse(fs.readFileSync(path.join(tmp, "packages/shared/i18n/generated/de.json"), "utf8"));
    ok(r.status === 0 && picked.every((k) => deTmp.strings[k].endsWith(" ✓")), "split: каталог de несёт вычитанный текст");
    r = run(["scripts/i18n/i18n-check.mjs", "--strict"]);
    ok(r.status === 0 && /de: нет перевода 0, устарел 0, черновик 2266/.test(r.stdout), "i18n:check --strict на копии: чист, черновиков de 2266", r.stdout.split("\n").filter((l) => /de:/.test(l)).join("; "));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  ok(JSON.parse(fs.readFileSync(TABLE, "utf8")).strings["common.save"].draft.includes("de"), "рабочая таблица не тронута (машинный текст без вычитки остался черновиком)");

  /* ═══ R5 ═══ */
  console.log("\n■ R5: удалить перевод одного ключа → i18n:check --strict и check:integration (4ay) красные с ключом");
  const backup = fs.readFileSync(TABLE, "utf8");
  try {
    const t = JSON.parse(backup);
    t.strings["common.save"].de = null;
    t.strings["common.save"].draft = ["en"];
    fs.writeFileSync(TABLE, JSON.stringify(t, null, 2) + "\n");
    const chk = spawnSync(process.execPath, ["scripts/i18n/i18n-check.mjs", "--strict"], { cwd: ROOT, encoding: "utf8" });
    ok(chk.status === 1 && /ключи без перевода[^\n]*: 1/.test(chk.stdout) && /common\.save \[de\]/.test(chk.stdout), "i18n:check --strict красный: «ключи без перевода: 1 — common.save [de]»", chk.stdout.split("\n").filter((l) => /без перевода|common\.save/.test(l)).join(" | "));
    const chkSoft = spawnSync(process.execPath, ["scripts/i18n/i18n-check.mjs"], { cwd: ROOT, encoding: "utf8" });
    ok(chkSoft.status === 0 && /common\.save \[de\]/.test(chkSoft.stdout), "без --strict — тот же ключ в отчёте, код 0");
    console.log("  · check:integration на испорченной таблице — около двух минут…");
    const ic2 = runIntegration();
    const out2 = (ic2.stdout ?? "") + (ic2.stderr ?? "");
    ok(ic2.status !== 0 && /ПРОБЛЕМЫ/.test(out2), "check:integration красный");
    ok(/4ay: i18n:check --strict красный/.test(out2) && /common\.save \[de\]/.test(out2), "4ay называет i18n:check --strict и ключ common.save [de]", out2.split("\n").filter((l) => /^ - /.test(l)).slice(0, 6).join("\n"));
    ok(/4ay: ключ «common\.save» без каталога en\/de/.test(out2) || /4aw: .*≠ нарезке/.test(out2), "4ay/4aw: каталог de расходится с таблицей (генерат устарел или ключ без каталога)", out2.split("\n").filter((l) => /^ - 4a[wy]/.test(l)).slice(0, 4).join("\n"));
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
