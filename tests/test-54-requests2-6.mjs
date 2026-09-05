/**
 * Тестовые запросы 2–6 беседы 5.4 (Характеристики + Обогащение +
 * Таксономия UI, клиент) + проверки «По факту 5.4» (EdgeEditor, guard
 * enrich:, привязка к каталогу).
 *  R2  CharacteristicSlider в NodePanel: сдвинуть centrality → PATCH →
 *      БД обновлена, статус «Сохранено»; «?» → обоснование ПОД слайдером
 *      (стрим мока → три части), строка characteristic_justifications.
 *  R3  EnrichmentPanel: «Обогатить» → «Описание» → стриминг → карточка;
 *      повторно «Эволюция» → история из 2 записей (UI и БД).
 *  R4  TaxonomySelector: «диалектическая» (связь) → автокомплит
 *      «Диалектическая · dialectical»; «новый_тип» → normalize null →
 *      строка «+ Создать тип» → форма → POST → тип выбран, «из каталога».
 *  R5  Интеграция с NodePanel: граф → узел → 8 слайдеров + «Обогатить» +
 *      TaxonomySelector; выбор типа из каталога → PATCH typeCatalogId.
 *  R6  Edge cases: innovation_degree — дискретный (min 1, max 5, step 1,
 *      засечки); readOnly у чужого публичного синтеза — слайдеры
 *      disabled, «?» без истории заблокирован, кнопок запуска нет.
 *  + По факту 5.4: EdgePanel «✎ Редактировать» → EdgeEditor (тип связи
 *    через селектор, шесть слайдеров) → PATCH /edges; CategoryEditor в
 *    модалке — восемь слайдеров и селектор; обрыв обогащения не даёт
 *    «ошибку генерации» на странице.
 *
 * Харнесс: сервер :3000 + vite :5199 + PG16/Redis, мок Claude SSE :3854
 * (ANTHROPIC_BASE_URL), puppeteer-core + системный Chrome.
 * Запуск: node_modules/.bin/tsx tests/test-54-requests2-6.mjs
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import puppeteer from "puppeteer-core";

const SERVER_PORT = 3000; // прокси vite зашит на :3000
const VITE_PORT = 5199;
const MOCK_PORT = 3854;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const UI = `http://127.0.0.1:${VITE_PORT}`;
const DB_URL = "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const CHROME = process.env.CHROME_PATH ?? "/opt/google/chrome/chrome";

process.env.DATABASE_URL ??= DB_URL;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.ANTHROPIC_API_KEY ??= "sk-test-not-used";

let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
const J = (x) => JSON.stringify(x);
const norm = (s) => String(s ?? "").replace(/[\s\u00a0]+/g, " ").trim().toLowerCase();
const has = (text, frag) => norm(text).includes(norm(frag));

const { db, closeDb } = await import("../server/db/index.js");
const schema = await import("../server/db/schema.js");
const { closeRedis } = await import("../server/redis.js");
const { saveGraphToDb, parseGraphFromHTML } = await import("../server/services/graph-parser.js");
const { and, asc, eq, inArray } = await import("drizzle-orm");
const { syntheses, synthesisLineage, sections, categories, categoryEdges, elementEnrichments, characteristicJustifications, relationshipTypeCatalog, categoryTypeCatalog } = schema;

/* ══ Мок Claude API (SSE) — как test-53 ═══════════════════════════════ */
const mock = { calls: [], failCount: 0 }; // failCount — сколько ближайших вызовов ответить 500 (ретраи streamWithRetries)
const CHUNK = 60, CHUNK_DELAY_MS = 20;
function enrichmentAnswer(prompt) {
  const isEvo = /Векторы давления|эволюци/i.test(prompt);
  return isEvo
    ? `<div class="enrichment-result"><h5>Векторы изменения</h5><p>Категория <strong>смещается</strong> к процессуальности.</p></div>`
    : `<div class="enrichment-result"><h5>Развёрнутое описание</h5><p>Категория <strong>схватывает основание</strong> концепции.</p><ul><li>Первая</li><li>Вторая</li></ul></div>`;
}
function justificationAnswer() {
  return `<div data-section="Основания"><h4>Основания</h4><p>Оценка обоснована центральным положением в графе.</p></div>` +
    `<div data-section="Ограничения"><h4>Ограничения</h4><ul><li>Не учтена генеалогия.</li></ul></div>` +
    `<div data-section="Альтернативные подходы"><h4>Альтернативные подходы</h4><p>По PageRank оценка дала бы 0.7.</p></div>`;
}
function startMock() {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      let prompt = "", system = "";
      try { const b = JSON.parse(body); prompt = b.messages?.[0]?.content ?? ""; system = b.system ?? ""; } catch {}
      mock.calls.push({ system, prompt });
      if (mock.failCount > 0) {
        mock.failCount--;
        res.writeHead(500, { "content-type": "application/json" });
        res.end(J({ type: "error", error: { type: "api_error", message: "mock failure" } }));
        return;
      }
      const html = /Обоснование числовой характеристики|ЭЛЕМЕНТ: /.test(prompt) ? justificationAnswer() : enrichmentAnswer(prompt);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (o) => res.write(`data: ${J(o)}\n\n`);
      send({ type: "message_start", message: { usage: { input_tokens: Math.ceil(prompt.length / 4) } } });
      for (let i = 0; i < html.length; i += CHUNK) {
        send({ type: "content_block_delta", delta: { type: "text_delta", text: html.slice(i, i + CHUNK) } });
        await sleep(CHUNK_DELAY_MS);
      }
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: Math.ceil(html.length / 4) } });
      send({ type: "message_stop" });
      res.end();
    });
  });
  return new Promise((r) => srv.listen(MOCK_PORT, "127.0.0.1", () => r(srv)));
}

/* ══ Фикстура (как test-52) ═══════════════════════════════════════════ */
const secWrap = (num, title, inner) =>
  `<div class="doc-section"><div class="section-num">§ ${num}</div>` +
  `<div class="section-title">${title}</div><div class="doc-content">${inner}</div></div>`;
const sub = (name, inner) => `<div data-section="${name}"><h4>${name}</h4>${inner}</div>`;
const tbl = (heads, rows) =>
  `<table class="doc-table"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` +
  `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const GRAPH_HTML = secWrap(2, "Граф категорий",
  sub("Таблица категорий",
    tbl(["Категория", "Тип", "Определение", "Центральность", "Определённость", "Происхождение"], [
      ["Бытие", "онтологическая", "То, что есть", "0.9", "0.8", "Парменид"],
      ["Становление", "метафизическая", "Переход", "0.7", "0.6", "Гераклит"],
    ])) +
  sub("Таблица связей",
    tbl(["Источник", "Описание связи", "Цель", "Тип", "Направление", "Сила"], [
      ["Бытие", "порождает", "Становление", "диалектическая", "однонаправленная", "0.8"],
    ])) +
  sub("Топологическая таблица",
    tbl(["Категория", "Кластер", "Структурные роли", "Процессуальные роли", "Рефлексивная связь"], [
      ["Бытие", "Ядро", "центральная", "тезис", ""],
      ["Становление", "Ядро", "мост", "антитезис", ""],
    ])));
async function makeSynthesis(userId, title) {
  const [s] = await db.insert(syntheses).values({
    userId, seed: "тестовое зерно 5.4", sectionOrder: ["sum", "graph"], status: "ready", title,
    capsuleHtml: "<p>Капсула.</p>", synthLevel: "comparative", extGraphMetrics: true,
  }).returning();
  await db.insert(synthesisLineage).values([{ synthesisId: s.id, parentType: "philosopher", parentName: "Парменид", position: 0 }]);
  await db.insert(sections).values([
    { synthesisId: s.id, key: "sum", sectionNum: 1, title: "Резюме", htmlContent: secWrap(1, "Резюме", sub("Цели", "<p>Цели.</p>")) },
    { synthesisId: s.id, key: "graph", sectionNum: 2, title: "Граф категорий", htmlContent: GRAPH_HTML },
  ]);
  await saveGraphToDb(s.id, parseGraphFromHTML(GRAPH_HTML));
  return s;
}

/* ══ Процессы ═════════════════════════════════════════════════════════ */
let serverProc, viteProc, browser, mockSrv;
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
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-54",
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
    env: { ...process.env, PHILOSYNTH_API_PORT: String(SERVER_PORT) }, stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  viteProc.stdout.on("data", (d) => (viteLog += d));
  viteProc.stderr.on("data", (d) => (viteLog += d));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(UI + "/")).ok) return; } catch {} await sleep(300); }
  throw new Error("vite не поднялся:\n" + viteLog.slice(-2000));
}
const killGroup = (p) => { if (!p) return; try { process.kill(-p.pid, "SIGKILL"); } catch {} try { p.kill("SIGKILL"); } catch {} };

async function makeUser(tag) {
  const email = `t54-${tag}-${Date.now()}@test.local`;
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

/* ══ Хелперы браузера ═════════════════════════════════════════════════ */
async function fill(page, sel, value) {
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.click(sel);
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type(sel, value);
}
async function clickBtn(page, rootSel, text) {
  return page.evaluate(([root, t]) => {
    const r = root ? document.querySelector(root) : document;
    if (!r) return "no-root";
    const n = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const b = [...r.querySelectorAll("button")].find((x) => n(x.innerText).includes(n(t)));
    if (!b) return "no-btn";
    if (b.disabled) return "disabled";
    b.click(); return "ok";
  }, [rootSel, text]);
}
const textOf = (page, sel) => page.$eval(sel, (el) => el.innerText).catch(() => "");
async function waitText(page, sel, frag, timeout = 20000) {
  await page.waitForFunction(([s, f]) => {
    const el = document.querySelector(s);
    const n = (x) => String(x ?? "").replace(/[\s\u00a0]+/g, " ").trim().toLowerCase();
    return !!el && n(el.innerText).includes(n(f));
  }, { timeout }, [sel, frag]);
}
async function click2dNode(page, name) {
  await page.evaluate((nm) => {
    const g = [...document.querySelectorAll(".node-g")].find((el) => el.__data__?.name === nm);
    g?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, name);
}
/** Сдвинуть range-слайдер React-контролируемо и «отпустить» (onCommit) */
async function slide(page, sel, value) {
  return page.evaluate(([s, v]) => {
    const el = document.querySelector(s);
    if (!el) return "no-input";
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    return "ok";
  }, [sel, value]);
}
async function openGraph2d(page) {
  ok(await clickBtn(page, ".actions-bar", "◈ Граф") === "ok", "кнопка «◈ Граф»");
  await page.waitForSelector(".gm-overlay", { timeout: 15000 });
  await clickBtn(page, ".gm-header", "2D");
  await page.waitForSelector(".node-g", { timeout: 15000 });
  await sleep(600);
}
const consoleErrors = [];
const pageErrors = [];

mockSrv = await startMock();
try {
  await startServer();
  await startVite();
  console.log("Мок, сервер и vite подняты.");

  // Уборка пользовательских типов прошлых прогонов: похожие имена дали бы
  // fuzzy-match в normalize и спрятали бы строку «Создать тип»
  const userTypes = (await db.select({ id: categoryTypeCatalog.id }).from(categoryTypeCatalog).where(eq(categoryTypeCatalog.isSystem, false))).map((r) => r.id);
  if (userTypes.length) {
    await db.update(categories).set({ typeCatalogId: null }).where(inArray(categories.typeCatalogId, userTypes));
    await db.delete(categoryTypeCatalog).where(inArray(categoryTypeCatalog.id, userTypes));
  }
  const A = await makeUser("owner");
  const B = await makeUser("stranger");
  const S = await makeSynthesis(A.id, "Синтез 5.4");
  const sid = S.id;
  const cats0 = await db.select().from(categories).where(eq(categories.synthesisId, sid)).orderBy(asc(categories.position));
  const bytie = cats0.find((c) => c.name === "Бытие");
  const [edge0] = await db.select().from(categoryEdges).where(eq(categoryEdges.synthesisId, sid));
  ok(!!bytie && cats0.length === 2 && !!edge0, "фикстура: 2 категории, 1 связь");
  ok(bytie.typeCatalogId === null, "ФАКТ: typeCatalogId после парсинга — null (нормализации в конвейере нет)");

  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push("console: " + m.text()); });
  page.on("dialog", (d) => void d.accept());
  const login = async (u) => {
    await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
    await fill(page, "input[type=email]", u.email);
    await fill(page, "input[type=password]", u.password);
    await page.click("button[type=submit]");
    await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 20000 });
  };
  await login(A);
  const openSynth = async () => {
    await page.goto(`${UI}/synthesis/${sid}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".actions-bar", { timeout: 20000 });
    await page.waitForSelector("#sec-graph", { timeout: 20000 });
  };

  /* ══ R5 (интеграция с NodePanel) + R2 (слайдер) ══ */
  console.log("\n■ R5: граф → узел → NodePanel: 8 слайдеров + «Обогатить» + TaxonomySelector");
  await openSynth();
  await openGraph2d(page);
  await click2dNode(page, "Бытие");
  await page.waitForSelector(".gm-info-panel [data-node-inline-edit]", { timeout: 10000 });
  const P = ".gm-info-panel";
  const sliderKeys = await page.$$eval(`${P} .char-slider`, (els) => els.map((e) => e.dataset.characteristic));
  ok(sliderKeys.length === 8, `в панели 8 слайдеров (${sliderKeys.length})`, J(sliderKeys));
  ok(J(sliderKeys) === J(["centrality", "certainty", "historical_significance", "innovation_degree", "clarity", "breadth", "depth_score", "applicability"]), "порядок ≡ CATEGORY_CHARACTERISTICS", J(sliderKeys));
  ok(await page.$(`${P} [data-testid=node-enrich-toggle]`) !== null, "кнопка «Обогатить» в панели");
  ok(await page.$(`${P} .combobox input[role=combobox]`) !== null, "TaxonomySelector типа в панели");
  const origin0 = await textOf(page, `${P} [data-testid=type-origin]`);
  ok(has(origin0, "свободный текст"), "индикатор: «свободный текст» (typeCatalogId=null)", origin0);
  const cenLabel = await textOf(page, `${P} .char-slider[data-characteristic=centrality]`);
  ok(has(cenLabel, "Центральность") && has(cenLabel, "0.90"), "подпись + значение слайдера centrality", cenLabel);
  const whyCount = await page.$$eval(`${P} .char-slider-why`, (els) => els.length);
  ok(whyCount === 8, "у каждого слайдера кнопка «?»");

  console.log("\n■ R2: сдвинуть centrality → PATCH → БД; «?» → обоснование");
  const cenSel = `${P} .char-slider[data-characteristic=centrality] input[type=range]`;
  const attrs = await page.$eval(cenSel, (el) => ({ min: el.min, max: el.max, step: el.step, disabled: el.disabled }));
  ok(attrs.min === "0" && attrs.max === "1" && attrs.step === "0.05" && !attrs.disabled, "range centrality: 0–1, шаг 0.05, активен", J(attrs));
  ok(await slide(page, cenSel, 0.35) === "ok", "сдвиг ползунка до 0.35 + pointerup");
  await waitText(page, `${P} [data-testid=node-edit-status]`, "Сохранено");
  const st = await textOf(page, `${P} [data-testid=node-edit-status]`);
  ok(has(st, "Таблица категорий"), "статус: перерисовано «Таблица категорий»", st);
  const [c1] = await db.select().from(categories).where(eq(categories.id, bytie.id));
  ok(Math.abs(c1.centrality - 0.35) < 1e-6, `БД: centrality = ${c1.centrality}`);
  ok((await db.select({ h: sections.htmlContent }).from(sections).where(and(eq(sections.synthesisId, sid), eq(sections.key, "graph"))))[0].h.includes("<td>0.35</td>"), "html_content графа перерисован (0.35)");
  await page.waitForFunction((s) => document.querySelector(s)?.innerText.includes("0.35"), { timeout: 10000 }, `${P} .char-slider[data-characteristic=centrality] .char-slider-value`);
  ok(true, "значение в панели — 0.35 (строка categories перечитана хозяином)");
  // дискретный слайдер — innovation_degree
  const innSel = `${P} .char-slider[data-characteristic=innovation_degree] input[type=range]`;
  ok(await slide(page, innSel, 4) === "ok", "innovation_degree → 4");
  await page.waitForFunction((id) => true, {}, 0);
  await sleep(800);
  const [c2] = await db.select().from(categories).where(eq(categories.id, bytie.id));
  ok(c2.innovationDegree === 4, `БД: innovation_degree = ${c2.innovationDegree}`);

  // «?» — обоснование
  const callsBefore = mock.calls.length;
  const jrows0 = await db.select().from(characteristicJustifications).where(eq(characteristicJustifications.synthesisId, sid));
  ok(jrows0.length === 0, "обоснований до клика нет");
  await page.click(`${P} .char-slider[data-characteristic=centrality] .char-slider-why`);
  await page.waitForSelector(`${P} .char-slider[data-characteristic=centrality] [data-testid=char-justification]`, { timeout: 10000 });
  ok(true, "блок обоснования раскрылся ПОД слайдером (не popover)");
  await page.waitForSelector(`${P} .char-slider[data-characteristic=centrality] [data-testid=char-justification].streaming`, { timeout: 10000 });
  ok(true, "стрим обоснования показан с кареткой (.streaming)");
  await page.waitForFunction((s) => { const el = document.querySelector(s); return el && !el.classList.contains("streaming") && el.innerText.includes("Оценка обоснована"); }, { timeout: 20000 }, `${P} .char-slider[data-characteristic=centrality] [data-testid=char-justification]`);
  const jText = await textOf(page, `${P} .char-slider[data-characteristic=centrality] [data-testid=char-justification]`);
  ok(has(jText, "Ограничения") && has(jText, "Не учтена генеалогия") && has(jText, "Альтернативные подходы") && has(jText, "PageRank"), "три части обоснования", jText.slice(0, 200));
  ok(has(jText, "centrality") || has(jText, "центральность"), "мета: имя характеристики");
  ok(has(jText, "0.35"), "мета: значение обоснования — текущее (0.35)", jText.slice(0, 120));
  ok(mock.calls.length === callsBefore + 1 && /centrality|центральность/i.test(mock.calls.at(-1).prompt), "мок: один вызов, промпт про centrality");
  const jrows1 = await db.select().from(characteristicJustifications).where(eq(characteristicJustifications.synthesisId, sid));
  ok(jrows1.length === 1 && jrows1[0].characteristic === "centrality" && Math.abs(jrows1[0].value - 0.35) < 1e-6 && jrows1[0].limitations && jrows1[0].alternativeApproaches, "БД: строка characteristic_justifications (три колонки)", J(jrows1.map((r) => [r.characteristic, r.value])));
  // повторный клик — скрыть; снова — из истории без вызова
  await page.click(`${P} .char-slider[data-characteristic=centrality] .char-slider-why`);
  await sleep(200);
  ok(await page.$(`${P} .char-slider[data-characteristic=centrality] [data-testid=char-justification]`) === null, "второй клик «?» скрывает блок");
  const calls2 = mock.calls.length;
  await page.click(`${P} .char-slider[data-characteristic=centrality] .char-slider-why`);
  await waitText(page, `${P} .char-slider[data-characteristic=centrality] [data-testid=char-justification]`, "Оценка обоснована");
  ok(mock.calls.length === calls2, "повторное раскрытие — из истории, без вызова Claude");
  ok(has(await textOf(page, `${P} .char-slider[data-characteristic=centrality] [data-testid=char-justification]`), "Обосновать заново"), "кнопка «Обосновать заново»");

  /* ══ R3: EnrichmentPanel ══ */
  console.log("\n■ R3: «Обогатить» → «Описание» → стриминг → карточка; «Эволюция» → история 2");
  ok(await clickBtn(page, P, "Обогатить") === "ok", "клик «✦ Обогатить»");
  await page.waitForSelector(`${P} [data-enrichment-panel=category]`, { timeout: 5000 });
  await waitText(page, `${P} [data-enrichment-panel]`, "Обогащений ещё нет");
  ok(await clickBtn(page, `${P} [data-enrichment-panel]`, "Обогатить") === "ok", "кнопка «Обогатить» панели → выбор типа");
  const typeBtns = await page.$$eval(`${P} [data-enrichment-panel] [data-enrichment-type]`, (els) => els.map((e) => e.dataset.enrichmentType));
  ok(J(typeBtns) === J(["description", "evolution", "justification"]), "три типа по канону §2.14", J(typeBtns));
  await page.click(`${P} [data-enrichment-panel] [data-enrichment-type=description]`);
  await page.waitForSelector(`${P} [data-testid=enrich-streaming]`, { timeout: 10000 });
  ok(true, "стриминговая карточка .enrich-card.streaming появилась");
  await page.waitForFunction((s) => !document.querySelector(s), { timeout: 20000 }, `${P} [data-testid=enrich-streaming]`);
  await waitText(page, `${P} [data-enrichment-panel]`, "схватывает основание");
  const hist1 = await page.$$eval(`${P} [data-enrichment-panel] .enrich-card[data-enrichment-id]`, (els) => els.length);
  ok(hist1 === 1, "история: 1 карточка (из enrichment_done, без GET)");
  const card1 = await textOf(page, `${P} [data-enrichment-panel] .enrich-card[data-enrichment-id]`);
  ok(has(card1, "Описание") && /\$0\.\d{4}/.test(card1) && has(card1, "вх."), "карточка: тип, стоимость, токены", card1.slice(0, 160));
  ok(await clickBtn(page, `${P} [data-enrichment-panel]`, "Обогатить") === "ok" && (await page.click(`${P} [data-enrichment-panel] [data-enrichment-type=evolution]`), true), "второй запрос — «Эволюция»");
  await waitText(page, `${P} [data-enrichment-panel]`, "смещается");
  await page.waitForFunction((s) => document.querySelectorAll(s).length === 2, { timeout: 10000 }, `${P} [data-enrichment-panel] .enrich-card[data-enrichment-id]`);
  ok(true, "история: 2 карточки");
  const enr = await db.select().from(elementEnrichments).where(eq(elementEnrichments.elementId, bytie.id));
  ok(enr.length === 2 && J(enr.map((e) => e.enrichmentType).sort()) === J(["description", "evolution"]), "БД: 2 обогащения разных типов", J(enr.map((e) => e.enrichmentType)));
  ok(has(await textOf(page, `${P} [data-enrichment-panel]`), "2 ·"), "итог панели: «2 · $…»");
  // Перезагрузка → история из GET
  await openSynth(); await openGraph2d(page); await click2dNode(page, "Бытие");
  await page.waitForSelector(`${P} [data-node-inline-edit]`, { timeout: 10000 });
  await clickBtn(page, P, "Обогатить");
  await page.waitForFunction((s) => document.querySelectorAll(s).length === 2, { timeout: 10000 }, `${P} [data-enrichment-panel] .enrich-card[data-enrichment-id]`);
  ok(true, "после перезагрузки история из GET /enrichments — 2 записи");

  /* ══ R3b: обрыв обогащения не ломает страницу ══ */
  console.log("\n■ По факту: обрыв обогащения → ошибка в панели, страница без «ошибки генерации»");
  mock.failCount = 4; // больше попыток streamWithRetries (STREAM_RETRY_DELAYS=50 → 2 попытки)
  await clickBtn(page, `${P} [data-enrichment-panel]`, "Обогатить");
  await page.click(`${P} [data-enrichment-panel] [data-enrichment-type=justification]`);
  await page.waitForSelector(`${P} [data-enrichment-panel] .pool-status.err`, { timeout: 20000 });
  ok(true, "stream_error показан в панели обогащения");
  const pageErrText = await page.evaluate(() => document.body.innerText);
  ok(!has(pageErrText, "Ошибка генерации"), "страница не показала ошибку генерации (guard enrich:)");

  /* ══ R5b: тип из каталога в NodePanel → PATCH typeCatalogId ══ */
  console.log("\n■ R5b: TaxonomySelector в NodePanel — выбор из каталога → PATCH");
  await page.click(`${P} .combobox input[role=combobox]`);
  await page.waitForSelector(`${P} .combobox-list .combobox-item`, { timeout: 8000 });
  await waitText(page, `${P} .combobox-list`, "≈");
  const listTxt = await textOf(page, `${P} .combobox-list`);
  ok(has(listTxt, "Онтологическая") && has(listTxt, "ontological"), "normalize «онтологическая» → «≈ Онтологическая · ontological»", listTxt.slice(0, 120));
  await page.evaluate((p) => [...document.querySelectorAll(`${p} .combobox-item`)].find((e) => e.innerText.includes("Онтологическая"))?.click(), P);
  await page.waitForFunction((s) => document.querySelector(s)?.innerText.toLowerCase().includes("из каталога"), { timeout: 10000 }, `${P} [data-testid=type-origin]`);
  let c3;
  for (let i = 0; i < 30; i++) { [c3] = await db.select().from(categories).where(eq(categories.id, bytie.id)); if (c3.typeCatalogId) break; await sleep(200); }
  const [ont] = await db.select().from(categoryTypeCatalog).where(eq(categoryTypeCatalog.key, "ontological"));
  ok(c3.typeCatalogId === ont.id && c3.type === "онтологическая", "БД: typeCatalogId = каталог ontological, type — написание документа", J([c3.type, c3.typeCatalogId === ont.id]));

  /* ══ R4 + EdgeEditor: EdgePanel → ✎ → тип связи ══ */
  console.log("\n■ R4 + По факту: EdgePanel → «✎ Редактировать» → EdgeEditor → TaxonomySelector связи");
  await page.evaluate(() => { const h = document.querySelector(".edge-hit"); h?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await page.waitForFunction(() => document.querySelector(".gm-info-panel")?.innerText.toLowerCase().includes("редактировать"), { timeout: 10000 });
  const ep = await textOf(page, P);
  ok(has(ep, "диалектическая") && has(ep, "Редактировать"), "EdgePanel: связь + «✎ Редактировать»", ep.slice(0, 100));
  ok(await clickBtn(page, P, "Редактировать") === "ok", "клик «✎ Редактировать» связи");
  await page.waitForSelector(".element-editor-overlay [data-edge-editor]", { timeout: 10000 });
  const title = await textOf(page, ".element-editor-overlay .edit-modal-title");
  ok(has(title, "Связь графа") && has(title, "Бытие") && has(title, "Становление"), "модалка редактора связи: «Бытие → Становление»", title);
  const edgeSliders = await page.$$eval(".element-editor-overlay [data-edge-editor] .char-slider", (els) => els.map((e) => e.dataset.characteristic));
  ok(J(edgeSliders) === J(["strength", "certainty", "historical_support", "logical_necessity", "innovation_degree", "context_dependency"]), "шесть слайдеров связи ≡ EDGE_CHARACTERISTICS", J(edgeSliders));
  const E = ".element-editor-overlay [data-taxonomy-kind=relationship]";
  await fill(page, `${E} input[role=combobox]`, "диалектическая");
  await page.waitForSelector(`${E} .combobox-list .combobox-item`, { timeout: 8000 });
  await waitText(page, `${E} .combobox-list`, "dialectical");
  const l2 = await textOf(page, `${E} .combobox-list`);
  ok(has(l2, "Диалектическая") && has(l2, "dialectical"), "автокомплит: «Диалектическая · dialectical»", l2.slice(0, 120));
  ok(!has(l2, "Создать тип"), "точное совпадение — строки «Создать тип» нет");
  await page.evaluate((e) => [...document.querySelectorAll(`${e} .combobox-item`)].find((x) => x.innerText.includes("Диалектическая"))?.click(), E);
  await page.waitForFunction((s) => document.querySelector(s)?.innerText.toLowerCase().includes("из каталога"), { timeout: 5000 }, `${E} [data-testid=type-origin]`);
  ok(true, "выбор из списка → индикатор «из каталога»");
  ok(await slide(page, ".element-editor-overlay .char-slider[data-characteristic=strength] input[type=range]", 0.45) === "ok", "strength → 0.45 (черновик)");
  await page.select(".element-editor-overlay #edge-ed-dir", "двунаправленная");
  ok(await clickBtn(page, ".element-editor-overlay .inline-edit-actions", "Сохранить") === "ok", "«Сохранить» связь");
  await page.waitForSelector(".element-editor-overlay [data-element-impact]", { timeout: 15000 });
  const [e1] = await db.select().from(categoryEdges).where(eq(categoryEdges.id, edge0.id));
  const [dial] = await db.select().from(relationshipTypeCatalog).where(eq(relationshipTypeCatalog.key, "dialectical"));
  ok(e1.typeCatalogId === dial.id && Math.abs(e1.strength - 0.45) < 1e-6 && e1.direction === "двунаправленная", "БД: связь — typeCatalogId dialectical, strength 0.45, двунаправленная", J([e1.typeCatalogId === dial.id, e1.strength, e1.direction]));
  const impactE = await textOf(page, ".element-editor-overlay [data-element-impact]");
  ok(has(impactE, "Таблица связей"), "htmlSync: перерисована «Таблица связей»", impactE.slice(0, 200));
  ok(await page.$(".element-editor-overlay [data-enrichment-panel=edge]") !== null, "в просмотре связи — EnrichmentPanel связи");
  const edgeTypes = await page.$$eval(".element-editor-overlay [data-enrichment-panel=edge] [data-enrichment-type]", (els) => els.map((e) => e.dataset.enrichmentType)).catch(() => null);
  await clickBtn(page, ".element-editor-overlay [data-enrichment-panel=edge]", "Обогатить");
  const edgeTypes2 = await page.$$eval(".element-editor-overlay [data-enrichment-panel=edge] [data-enrichment-type]", (els) => els.map((e) => e.dataset.enrichmentType));
  ok(J(edgeTypes2) === J(["justification", "counterarguments"]), "типы обогащения связи по канону", J(edgeTypes2 ?? edgeTypes));
  await clickBtn(page, ".element-editor-overlay .edit-modal-footer", "Закрыть");

  /* ══ R4b: новый тип — «новый_тип» → normalize null → «Создать» ══ */
  console.log("\n■ R4b: «новый_тип» → normalize null → «+ Создать тип» → форма → создан и выбран");
  await click2dNode(page, "Становление");
  await page.waitForFunction(() => document.querySelector(".gm-info-panel")?.innerText.toLowerCase().includes("становление"), { timeout: 10000 });
  await clickBtn(page, P, "Редактировать");
  await page.waitForSelector(".element-editor-overlay [data-element-editor=category]", { timeout: 10000 });
  const catSliders = await page.$$eval(".element-editor-overlay [data-element-editor=category] .char-slider", (els) => els.length);
  ok(catSliders === 8, "CategoryEditor в модалке: 8 слайдеров");
  const C = ".element-editor-overlay [data-taxonomy-kind=category]";
  const uniq = "новый_тип_" + Array.from({ length: 6 }, () => "абвгдежзиклмнопрст"[Math.floor(Math.random() * 18)]).join("");
  await fill(page, `${C} input[role=combobox]`, uniq);
  await page.waitForSelector(`${C} [data-testid=taxonomy-create]`, { timeout: 8000 });
  ok(has(await textOf(page, `${C} [data-testid=taxonomy-create]`), `Создать тип «${uniq}»`), "normalize → null → строка «+ Создать тип»");
  ok(has(await textOf(page, `${C} [data-testid=type-origin]`), "свободный текст"), "индикатор — «свободный текст»");
  await page.click(`${C} [data-testid=taxonomy-create]`);
  await page.waitForSelector(`${C} [data-testid=taxonomy-create-form]`, { timeout: 5000 });
  const keyVal = await page.$eval(`${C} #newtype-category-key`, (el) => el.value);
  ok(/^[a-z][a-z0-9_]{1,63}$/.test(keyVal) && keyVal.startsWith("novyy_tip"), `ключ предложен латиницей: ${keyVal}`);
  await page.click(`${C} #newtype-category-desc`); await page.type(`${C} #newtype-category-desc`, "тестовый тип 5.4");
  ok(await clickBtn(page, `${C} [data-testid=taxonomy-create-form]`, "Создать") === "ok", "клик «Создать»");
  await page.waitForFunction((s) => document.querySelector(s)?.innerText.toLowerCase().includes("из каталога"), { timeout: 10000 }, `${C} [data-testid=type-origin]`);
  const [newType] = await db.select().from(categoryTypeCatalog).where(eq(categoryTypeCatalog.key, keyVal));
  ok(!!newType && newType.isSystem === false && newType.createdBy === A.id && newType.nameRu === uniq, "БД: пользовательский тип создан (is_system=false)", J(newType && [newType.key, newType.isSystem]));
  ok(has(await page.$eval(`${C} input[role=combobox]`, (el) => el.value), uniq), "поле — новый тип выбран");
  await clickBtn(page, ".element-editor-overlay .inline-edit-actions", "Сохранить");
  await page.waitForSelector(".element-editor-overlay [data-element-impact]", { timeout: 15000 });
  const stan = cats0.find((c) => c.name === "Становление");
  const [c4] = await db.select().from(categories).where(eq(categories.id, stan.id));
  ok(c4.typeCatalogId === newType.id && c4.type === uniq, "БД: категория привязана к новому типу", J([c4.type, c4.typeCatalogId === newType.id]));
  // дубликат ключа → 400 в форме
  const dup = await api(A, "POST", "/taxonomy/category-types", { key: keyVal, nameRu: "x" });
  ok(dup.status === 400 && dup.json.code === "VALIDATION_ERROR", "дубликат ключа через API → 400 VALIDATION_ERROR");
  await clickBtn(page, ".element-editor-overlay .edit-modal-footer", "Закрыть");

  /* ══ R6: edge cases ══ */
  console.log("\n■ R6: innovation_degree дискретный; readOnly у чужого");
  await click2dNode(page, "Бытие");
  await page.waitForSelector(`${P} [data-node-inline-edit]`, { timeout: 10000 });
  const inn = await page.$eval(`${P} .char-slider[data-characteristic=innovation_degree]`, (el) => ({
    discrete: el.classList.contains("discrete"), min: el.querySelector("input").min, max: el.querySelector("input").max,
    step: el.querySelector("input").step, ticks: [...el.querySelectorAll(".char-slider-ticks span")].map((s) => s.innerText),
    value: el.querySelector(".char-slider-value").innerText,
  }));
  ok(inn.discrete && inn.min === "1" && inn.max === "5" && inn.step === "1", "innovation_degree: .discrete, 1–5, шаг 1", J(inn));
  ok(J(inn.ticks) === J(["1", "2", "3", "4", "5"]) && inn.value === "4", "засечки 1…5, значение целое «4»", J(inn));
  ok(!(await page.$eval(`${P} .char-slider[data-characteristic=centrality]`, (el) => el.classList.contains("discrete"))), "centrality — не дискретный");

  await api(A, "PATCH", `/syntheses/${sid}`, { isPublic: true });
  await login(B);
  await openSynth();
  await openGraph2d(page);
  await click2dNode(page, "Бытие");
  await page.waitForSelector(P, { timeout: 10000 });
  const pB = await textOf(page, P);
  ok(!has(pB, "Редактировать") && (await page.$(`${P} [data-node-inline-edit]`)) === null, "чужой публичный: ни «✎», ни правки по месту в NodePanel");
  // readOnly-слайдеры — через API нельзя показать в NodePanel чужого; проверяем компонентно: ElementEditor disabled
  // Владелец при status='generating' → CharacteristicSlider readOnly
  await login(A);
  await db.update(syntheses).set({ status: "generating" }).where(eq(syntheses.id, sid));
  await openSynth();
  await openGraph2d(page);
  await click2dNode(page, "Бытие");
  await page.waitForSelector(`${P} [data-node-inline-edit]`, { timeout: 10000 });
  const ro = await page.$eval(`${P} .char-slider[data-characteristic=clarity]`, (el) => ({
    readonly: el.classList.contains("readonly"), disabled: el.querySelector("input").disabled, whyDisabled: el.querySelector(".char-slider-why").disabled,
  }));
  ok(ro.readonly && ro.disabled, "status=generating: слайдер .readonly и disabled", J(ro));
  ok(ro.whyDisabled === false, "«?» у readOnly доступен (просмотр сохранённого)");
  const callsRO = mock.calls.length;
  await page.click(`${P} .char-slider[data-characteristic=clarity] .char-slider-why`);
  await waitText(page, `${P} .char-slider[data-characteristic=clarity] [data-testid=char-justification]`, "Обоснований ещё нет");
  const roBlock = await textOf(page, `${P} .char-slider[data-characteristic=clarity] [data-testid=char-justification]`);
  ok(!has(roBlock, "Обосновать") && mock.calls.length === callsRO, "readOnly: без истории — «Обоснований ещё нет», запрос НЕ запущен, кнопки «Обосновать» нет");
  await page.click(`${P} .char-slider[data-characteristic=centrality] .char-slider-why`);
  await waitText(page, `${P} .char-slider[data-characteristic=centrality] [data-testid=char-justification]`, "Оценка обоснована");
  ok(!has(await textOf(page, `${P} .char-slider[data-characteristic=centrality] [data-testid=char-justification]`), "заново"), "readOnly: сохранённое обоснование показано, «Обосновать заново» нет");
  await clickBtn(page, P, "Обогатить");
  await page.waitForSelector(`${P} [data-enrichment-panel]`, { timeout: 5000 });
  ok((await page.$(`${P} [data-enrichment-panel] [data-testid=enrich-button]`)) === null, "readOnly: кнопок запуска обогащения нет, история видна");
  await db.update(syntheses).set({ status: "ready" }).where(eq(syntheses.id, sid));

  const realErrors = [...pageErrors, ...consoleErrors].filter((e) => !/favicon|net::ERR_|Failed to load resource|500 \(Internal|WebSocket/i.test(e));
  ok(realErrors.length === 0, "без ошибок консоли/pageerror", J(realErrors.slice(0, 3)));
} catch (err) {
  failed++;
  fails.push("ИСКЛЮЧЕНИЕ: " + (err?.stack || err));
  console.log("\n✗ ИСКЛЮЧЕНИЕ:", err?.stack || err);
  console.log("server log tail:", serverLog.slice(-1500));
} finally {
  try { await browser?.close(); } catch {}
  killGroup(serverProc); killGroup(viteProc);
  try { mockSrv?.close(); } catch {}
  try { await closeRedis(); } catch {}
  try { await closeDb(); } catch {}
}
console.log(`\n══ ИТОГ: ${passed} ✓, ${failed} ✗`);
if (fails.length) { console.log("Провалы:\n - " + fails.join("\n - ")); process.exit(1); }
process.exit(0);
