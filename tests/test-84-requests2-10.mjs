/**
 * Тестовые запросы 2–10 беседы 8.4 (управление своим содержимым) — одним
 * заходом, в браузере (puppeteer-core + системный Chromium) против живого
 * сервера :3000 (прокси vite зашит) + vite :5199 + PG16/Redis; мок Claude
 * SSE нужен только для R8 (операция под слотом, стрим намеренно «висит»):
 *  R2  Удаление: карточка → «Удалить» → второй шаг «Точно удалить?» →
 *      карточка исчезла, GET /:id → 404, разделы/элементы сняты CASCADE.
 *  R3  Потомки: у концепции два потомка → текст называет «2 потомка» →
 *      удаление → потомки живы, parent_synthesis_id = NULL.
 *  R4  Переименование: поле по месту → Enter → PATCH → карточка и заголовок
 *      документа; пустое → 400 details.title под полем; Esc → прежнее.
 *  R5  Дублирование: → { id }, список перечитан, копия видна, автоперехода
 *      нет; копия — разделы и граф на месте.
 *  R6  Капсула: ✎ → textarea → сохранение → DocumentHeader показывает
 *      новый текст; у чужого синтеза ✎ (капсулы и названия) нет вовсе.
 *  R7  Удаление связи: панель связи → «Удалить связь» → второй шаг → граф
 *      без связи, таблица связей документа тоже.
 *  R8  Блокировка: активная операция (мок держит стрим) → DELETE/PATCH
 *      capsule/DELETE edge → 409, состояние не изменилось; в карточке —
 *      строка 409; при status='generating' ✎ капсулы disabled.
 *  R9  Уборка: tsc -b packages/shared server client чистый; grep по
 *      client/src не находит пяти имён.
 *  R10 Edge: чужой DELETE /syntheses/:id → 403; PATCH чужой капсулы → 403.
 * Запуск: setsid nohup node_modules/.bin/tsx tests/test-84-requests2-10.mjs > /tmp/t84.log 2>&1 &
 * (PG16 + Redis подняты: pg_ctlcluster 16 main start; redis-server --daemonize yes --save '')
 */
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import puppeteer from "puppeteer-core";

const SERVER_PORT = 3000;
const VITE_PORT = 5199;
const MOCK_PORT = 3884;
const UI = `http://localhost:${VITE_PORT}`;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const DB_URL = "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const CHROME = process.env.CHROME_PATH ?? "/opt/google/chrome/chrome";
const ROOT = new URL("../", import.meta.url).pathname;

process.env.DATABASE_URL ??= DB_URL;
process.env.REDIS_URL ??= "redis://localhost:6379";

let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
const J = (x) => JSON.stringify(x);
const pageErrors = [], consoleErrors = [];

const { db, closeDb } = await import("../server/db/index.js");
const schema = await import("../server/db/schema.js");
const { closeRedis } = await import("../server/redis.js");
const { saveGraphToDb, parseGraphFromHTML } = await import("../server/services/graph-parser.js");
const { parseThesesFromHTML, saveElementsToDb } = await import("../server/services/element-parser.js");
const { and, eq, like } = await import("drizzle-orm");
const { users, syntheses, synthesisLineage, sections, categories, categoryEdges, theses, apiUsage, transactions, elementVersions } = schema;

/* ══ Фикстура синтеза (как 6.2, капсула — настоящая секция) ═══════════ */
const secWrap = (num, title, inner) =>
  `<div class="doc-section"><div class="section-num">§ ${num}</div>` +
  `<div class="section-title">${title}</div><div class="doc-content">${inner}</div></div>`;
const sub = (name, inner) => `<div data-section="${name}"><h4>${name}</h4>${inner}</div>`;
const tbl = (heads, rows) =>
  `<table class="doc-table"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` +
  `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const CAT_NAMES = ["Бытие", "Становление", "Ничто", "Логос"];
const CAT_TYPES = ["онтологическая", "метафизическая", "онтологическая", "логическая"];
const EDGE_DESC = (a, b) => `${a} обусловливает ${b}`;
function graphHtml(names, types, num = 2) {
  const cats = names.map((n, i) => [n, types[i % types.length], `Определение ${n}`, "0.6", "0.7", `Источник ${n}`]);
  const edges = names.slice(1).map((n, i) => [names[i], EDGE_DESC(names[i], n), n, i % 2 ? "каузальная" : "диалектическая", "однонаправленная", "0.8"]);
  const topo = names.map((n, i) => [n, i < 2 ? "Ядро" : "Горизонт", i === 0 ? "центральная" : "", i % 2 ? "тезис" : "антитезис", ""]);
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
    { f: "Логос открывает истину.", type: "эпистемологический", cats: "Логос" },
  ];
  return secWrap(num, "Корпус тезисов",
    sub("Онтологические тезисы", `<p><strong>${items[0].f}</strong> Обоснование.</p>`) +
    sub("Эпистемологические тезисы", `<p><strong>${items[1].f}</strong> Обоснование.</p>`) +
    sub("Сводная таблица тезисов", tbl(["№", "Формулировка тезиса", "Тип", "Степень новизны", "Связанные категории"],
      items.map((t, i) => [String(i + 1), t.f, t.type, "средняя", t.cats]))));
}
const CAPSULE_TEXT = "Исходная капсула концепции: бытие первично.";
const capsuleHtml = (text) => secWrap(0, "Капсула", sub("Капсула", `<p>${text}</p>`));
async function makeSynthesis(userId, title, extra = {}) {
  const [s] = await db.insert(syntheses).values({
    userId, seed: "зерно 8.4", sectionOrder: ["sum", "graph", "theses"], status: "ready", title,
    capsuleHtml: capsuleHtml(CAPSULE_TEXT), synthLevel: "comparative", ...extra,
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
/** Потомок: строка lineage type='synthesis' → parent */
async function makeChild(userId, title, parentId) {
  const c = await makeSynthesis(userId, title);
  await db.insert(synthesisLineage).values([{ synthesisId: c.id, parentType: "synthesis", parentSynthesisId: parentId, position: 1 }]);
  return c;
}
const countRows = async (table, sid) => (await db.select({ id: table.id }).from(table).where(eq(table.synthesisId, sid))).length;
const loadSynth = async (sid) => (await db.select().from(syntheses).where(eq(syntheses.id, sid)))[0] ?? null;

/* ══ Мок Claude SSE: маркер SLOW84 в промпте → стрим «висит» (операция под слотом) ═══ */
const claude = { calls: 0, hanging: [] };
function startClaudeMock() {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      claude.calls++;
      let prompt = "";
      try { prompt = JSON.parse(body).messages?.[0]?.content ?? ""; } catch {}
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (o) => res.write(`data: ${J(o)}\n\n`);
      send({ type: "message_start", message: { usage: { input_tokens: 100 } } });
      send({ type: "content_block_delta", delta: { type: "text_delta", text: '<div class="doc-section"><div class="doc-content"><p>Начало…' } });
      if (/SLOW84/.test(prompt)) { claude.hanging.push(res); return; } // держим до конца прогона
      send({ type: "content_block_delta", delta: { type: "text_delta", text: " конец.</p></div></div>" } });
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
      ...process.env, PORT: String(SERVER_PORT), DATABASE_URL: DB_URL, REDIS_URL: "redis://localhost:6379",
      CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000",
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-84",
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

async function makeUser(tag) {
  const email = `t84-${tag}-${Date.now()}@test.local`;
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
const T = (id) => `[data-testid="${id}"]`;
const CARD = (id) => `.catalog-card[data-synthesis-id="${id}"]`;
async function fill(page, sel, value) {
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.click(sel);
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (value) await page.type(sel, value);
}
const text = (page, sel) => page.$eval(sel, (el) => el.innerText.replace(/\s+/g, " ").trim()).catch(() => null);
const has = (s, frag) => String(s ?? "").toLowerCase().includes(String(frag).toLowerCase());
const waitText = async (page, sel, frag, timeout = 15000) => {
  await page.waitForFunction(([s, f]) => {
    const el = document.querySelector(s);
    const n = (x) => String(x ?? "").replace(/[\s\u00a0]+/g, " ").trim().toLowerCase();
    return !!el && n(el.innerText).includes(n(f));
  }, { timeout }, [sel, frag]);
  return text(page, sel);
};
const exists = (page, sel) => page.$(sel).then((h) => !!h);
/** Клик через DOM (карточки перерисовываются React после каждого действия) */
const clickDom = (page, sel) => page.$eval(sel, (el) => el.click());
const waitGone = (page, sel, timeout = 15000) => page.waitForFunction((s) => !document.querySelector(s), { timeout }, sel);
async function clickBtn(page, rootSel, frag) {
  return page.evaluate(([root, t]) => {
    const r = root ? document.querySelector(root) : document;
    if (!r) return "no-root";
    const n = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const b = [...r.querySelectorAll("button")].find((x) => n(x.innerText).includes(n(t)));
    if (!b) return "no-btn";
    if (b.disabled) return "disabled";
    b.click(); return "ok";
  }, [rootSel, frag]);
}
const openCatalog = async (page) => {
  await page.goto(`${UI}/catalog`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".catalog-card, .pool-status", { timeout: 20000 });
};
const openSynth = async (page, sid) => {
  await page.goto(`${UI}/synthesis/${sid}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".doc-header .doc-title", { timeout: 20000 });
};
async function openGraph2d(page) {
  ok(await clickBtn(page, ".actions-bar", "◈ Граф") === "ok", "кнопка «◈ Граф»");
  await page.waitForSelector(".gm-overlay", { timeout: 15000 });
  await clickBtn(page, ".gm-header", "2D");
  await page.waitForSelector(".node-g", { timeout: 15000 });
  await sleep(600);
}

/* ══ Прогон ═══════════════════════════════════════════════════════════ */
let tscResult = null;
try {
  // Уборка следов прошлых прогонов — по FK: синтезы (lineage/элементы каскадом),
  // финансовая история (RESTRICT), затем пользователи
  for (const stale of await db.select({ id: users.id }).from(users).where(like(users.email, "t84-%"))) {
    await db.delete(syntheses).where(eq(syntheses.userId, stale.id));
    await db.delete(apiUsage).where(eq(apiUsage.userId, stale.id));
    await db.delete(transactions).where(eq(transactions.userId, stale.id));
    await db.delete(users).where(eq(users.id, stale.id));
  }

  claudeSrv = await startClaudeMock();
  await startServer();
  await startVite();
  console.log("Мок, сервер и vite подняты.");

  const A = await makeUser("owner");
  const B = await makeUser("stranger");
  const S_DEL = await makeSynthesis(A.id, "Для удаления");
  const S_PARENT = await makeSynthesis(A.id, "Родитель двух");
  const C1 = await makeChild(A.id, "Потомок первый", S_PARENT.id);
  const C2 = await makeChild(A.id, "Потомок второй", S_PARENT.id);
  const S_MAIN = await makeSynthesis(A.id, "Основной синтез", { isPublic: true });
  const S_GEN = await makeSynthesis(A.id, "Генерируется", { status: "generating" });
  const S_SLOT = await makeSynthesis(A.id, "Под слотом");

  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push("console: " + m.text()); });
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); void d.accept(); });
  const login = async (u) => {
    await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
    await fill(page, "input[type=email]", u.email);
    await fill(page, "input[type=password]", u.password);
    await page.click("button[type=submit]");
    await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 20000 });
  };
  const logout = async () => { await page.evaluate(() => fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" })); await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" }); };

  await login(A);
  await openCatalog(page);

  /* ══ R2: удаление ══ */
  console.log("\n■ R2: удаление из карточки — второй шаг кнопок");
  const cardDel = CARD(S_DEL.id);
  await page.waitForSelector(cardDel, { timeout: 15000 });
  const acts = await text(page, `${cardDel} ${T("card-actions")}`);
  ok(has(acts, "Переименовать") && has(acts, "Дублировать") && has(acts, "Удалить") && has(acts, "Опубликовать"), "строка действий: Опубликовать · Переименовать · Дублировать · Удалить", acts);
  const dangerColor = await page.$eval(`${cardDel} ${T("card-delete")}`, (el) => getComputedStyle(el).color);
  ok(dangerColor === "rgb(139, 26, 26)", "кнопка удаления красная (--red = #8b1a1a)", dangerColor);
  await clickDom(page, `${cardDel} ${T("card-delete")}`);
  await page.waitForSelector(`${cardDel} ${T("card-delete-confirm")}`, { timeout: 10000 });
  ok((await page.evaluate(() => location.pathname)) === "/catalog", "клик по кнопке внутри Link не увёл на /synthesis/:id");
  const warn = await waitText(page, `${cardDel} ${T("card-delete-warn")}`, "Потомков у концепции нет");
  ok(has(warn, "разделы") && has(warn, "родословн") && has(warn, "необратимо"), "подтверждение говорит, ЧЕМ грозит (CASCADE)", warn);
  ok(has(await text(page, `${cardDel} ${T("card-delete-confirm")}`), "Точно удалить?"), "кнопка перешла в «Точно удалить?»");
  ok(await exists(page, `${cardDel} ${T("card-delete-cancel")}`), "рядом — «Отмена»");
  // клик мимо карточки → второй шаг снят
  await page.mouse.click(5, 5);
  await waitGone(page, `${cardDel} ${T("card-delete-confirm")}`);
  ok(await exists(page, `${cardDel} ${T("card-delete")}`), "клик мимо карточки вернул кнопку назад");
  // «Отмена» тоже возвращает
  await clickDom(page, `${cardDel} ${T("card-delete")}`);
  await page.waitForSelector(`${cardDel} ${T("card-delete-cancel")}`, { timeout: 10000 });
  await clickDom(page, `${cardDel} ${T("card-delete-cancel")}`);
  await waitGone(page, `${cardDel} ${T("card-delete-confirm")}`);
  ok(await exists(page, `${cardDel} ${T("card-delete")}`), "«Отмена» вернула кнопку назад");
  // удаляем
  const before = { sections: await countRows(sections, S_DEL.id), cats: await countRows(categories, S_DEL.id), edges: await countRows(categoryEdges, S_DEL.id), theses: await countRows(theses, S_DEL.id) };
  ok(before.sections === 3 && before.cats === 4 && before.edges === 3 && before.theses === 2, "до удаления: 3 раздела, 4 категории, 3 связи, 2 тезиса", J(before));
  await clickDom(page, `${cardDel} ${T("card-delete")}`);
  await page.waitForSelector(`${cardDel} ${T("card-delete-confirm")}`, { timeout: 10000 });
  await page.waitForFunction((s) => { const b = document.querySelector(s); return b && !b.disabled; }, { timeout: 10000 }, `${cardDel} ${T("card-delete-confirm")}`);
  await clickDom(page, `${cardDel} ${T("card-delete-confirm")}`);
  await waitGone(page, cardDel);
  ok(true, "карточка исчезла");
  ok((await page.evaluate(() => location.pathname)) === "/catalog", "остались в каталоге");
  const g404 = await api(A, "GET", `/syntheses/${S_DEL.id}`);
  ok(g404.status === 404, "GET /syntheses/:id → 404", String(g404.status));
  const after = { sections: await countRows(sections, S_DEL.id), cats: await countRows(categories, S_DEL.id), edges: await countRows(categoryEdges, S_DEL.id), theses: await countRows(theses, S_DEL.id), lineage: (await db.select().from(synthesisLineage).where(eq(synthesisLineage.synthesisId, S_DEL.id))).length };
  ok(Object.values(after).every((v) => v === 0), "CASCADE: разделы, элементы, родословная сняты", J(after));
  ok(dialogs.length === 0, "ни одного window.confirm/alert", J(dialogs));

  /* ══ R3: потомки ══ */
  console.log("\n■ R3: предупреждение о потомках");
  const cardP = CARD(S_PARENT.id);
  await clickDom(page, `${cardP} ${T("card-delete")}`);
  const warnP = await waitText(page, `${cardP} ${T("card-delete-warn")}`, "2 потомка");
  ok(has(warnP, "У концепции 2 потомка") && has(warnP, "без родителя"), "текст называет число 2 и «останутся без родителя»", warnP);
  await page.waitForFunction((s) => { const b = document.querySelector(s); return b && !b.disabled; }, { timeout: 10000 }, `${cardP} ${T("card-delete-confirm")}`);
  await clickDom(page, `${cardP} ${T("card-delete-confirm")}`);
  await waitGone(page, cardP);
  await page.waitForSelector(CARD(C1.id), { timeout: 15000 });
  const c1 = await loadSynth(C1.id), c2 = await loadSynth(C2.id);
  ok(!!c1 && !!c2, "потомки живы");
  const lin1 = await db.select().from(synthesisLineage).where(and(eq(synthesisLineage.synthesisId, C1.id), eq(synthesisLineage.parentType, "synthesis")));
  const lin2 = await db.select().from(synthesisLineage).where(and(eq(synthesisLineage.synthesisId, C2.id), eq(synthesisLineage.parentType, "synthesis")));
  ok(lin1.length === 1 && lin1[0].parentSynthesisId === null && lin2.length === 1 && lin2[0].parentSynthesisId === null, "у потомков parent_synthesis_id = NULL (SET NULL)", J([lin1[0]?.parentSynthesisId, lin2[0]?.parentSynthesisId]));
  ok(await exists(page, CARD(C1.id)) && await exists(page, CARD(C2.id)), "карточки потомков остались в каталоге");

  /* ══ R4: переименование ══ */
  console.log("\n■ R4: переименование по месту");
  const cardM = CARD(S_MAIN.id);
  await page.waitForSelector(`${cardM} ${T("card-rename")}`, { timeout: 15000 });
  await clickDom(page, `${cardM} ${T("card-rename")}`);
  await page.waitForSelector(`${cardM} ${T("card-rename-form")} input`, { timeout: 10000 });
  ok((await page.$eval(`${cardM} input`, (el) => el.value)) === "Основной синтез", "в поле — текущее имя");
  ok((await page.evaluate(() => location.pathname)) === "/catalog", "открытие поля не увело со страницы");
  await fill(page, `${cardM} ${T("card-rename-form")} input`, "Переименованный синтез");
  ok((await page.evaluate(() => location.pathname)) === "/catalog", "клик по полю внутри Link не увёл на /synthesis/:id");
  await page.keyboard.press("Enter");
  await waitText(page, `${cardM} .catalog-card-head`, "Переименованный синтез");
  await waitGone(page, `${cardM} ${T("card-rename-form")}`);
  ok((await loadSynth(S_MAIN.id)).title === "Переименованный синтез", "PATCH: title в БД обновлён");
  // пустое имя → 400 details.title под полем
  await clickDom(page, `${cardM} ${T("card-rename")}`);
  await fill(page, `${cardM} ${T("card-rename-form")} input`, "");
  await page.keyboard.press("Enter");
  const rerr = await waitText(page, `${cardM} ${T("card-rename-error")}`, "непустая");
  ok(has(rerr, "Название") && has(rerr, "непустая строка"), "пустое имя → 400 с details.title под полем", rerr);
  ok(await exists(page, `${cardM} ${T("card-rename-form")}`), "поле осталось открытым для исправления");
  // Esc → прежнее
  await page.type(`${cardM} ${T("card-rename-form")} input`, "Черновик, не сохранять");
  await page.keyboard.press("Escape");
  await waitGone(page, `${cardM} ${T("card-rename-form")}`);
  ok(has(await text(page, `${cardM} .catalog-card-head`), "Переименованный синтез"), "Esc вернул прежнее имя");
  ok((await loadSynth(S_MAIN.id)).title === "Переименованный синтез", "БД не тронута после Esc");
  // заголовок документа
  await openSynth(page, S_MAIN.id);
  ok(has(await text(page, ".doc-header .doc-title"), "Переименованный синтез"), "заголовок документа показывает новое имя");

  /* ══ R5: дублирование ══ */
  console.log("\n■ R5: дублирование");
  await openCatalog(page);
  const mineBefore = await page.$$eval(".catalog-card", (els) => els.length);
  await clickDom(page, `${cardM} ${T("card-duplicate")}`);
  await page.waitForFunction((n) => document.querySelectorAll(".catalog-card").length === n + 1, { timeout: 15000 }, mineBefore);
  ok(true, "список перечитан: карточек стало на одну больше");
  ok((await page.evaluate(() => location.pathname)) === "/catalog", "автоперехода на копию нет");
  const copies = await db.select().from(syntheses).where(and(eq(syntheses.userId, A.id), like(syntheses.title, "% (копия)")));
  ok(copies.length === 1 && copies[0].title === "Переименованный синтез (копия)" && copies[0].isPublic === false, "копия в БД: title += « (копия)», is_public=false", J(copies.map((c) => [c.title, c.isPublic])));
  const COPY = copies[0];
  ok(await exists(page, CARD(COPY.id)), "карточка копии видна");
  ok(has(await text(page, `${CARD(COPY.id)} .catalog-card-head`), "(копия)"), "карточка копии с пометкой");
  const cp = { sections: await countRows(sections, COPY.id), cats: await countRows(categories, COPY.id), edges: await countRows(categoryEdges, COPY.id), theses: await countRows(theses, COPY.id) };
  ok(cp.sections === 3 && cp.cats === 4 && cp.edges === 3 && cp.theses === 2, "копия: разделы и граф на месте (3/4/3/2)", J(cp));
  await openSynth(page, COPY.id);
  ok(has(await text(page, ".doc-header .doc-title"), "(копия)"), "копия открывается");
  ok((await page.$$eval(".doc-body", (els) => els.length)) >= 3, "у копии ≥ 3 разделов в документе");
  await openGraph2d(page);
  ok((await page.$$eval(".node-g", (els) => els.length)) === 4, "граф копии: 4 узла");
  await clickBtn(page, ".gm-header", "✕");
  await sleep(300);

  /* ══ R6: капсула ══ */
  console.log("\n■ R6: правка капсулы по месту");
  await openSynth(page, S_MAIN.id);
  ok(has(await text(page, T("capsule-text")), CAPSULE_TEXT), "капсула показана");
  ok(await exists(page, T("capsule-edit")), "✎ у капсулы есть у владельца");
  await clickDom(page, T("capsule-edit"));
  await page.waitForSelector(`${T("capsule-form")} textarea`, { timeout: 10000 });
  ok(await page.$eval(".header-disclosure-capsule", (d) => d.open), "details капсулы не свернулся от клика по ✎");
  ok((await page.$eval(`${T("capsule-form")} textarea`, (el) => el.value)) === CAPSULE_TEXT, "в textarea — текст капсулы");
  const NEW_CAPSULE = "Новая капсула: становление первично.\n\nВторой абзац капсулы.";
  await page.$eval(`${T("capsule-form")} textarea`, (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
  }, NEW_CAPSULE);
  await clickDom(page, T("capsule-save"));
  await waitText(page, T("capsule-text"), "Новая капсула: становление первично");
  const capTxt = await text(page, T("capsule-text"));
  ok(has(capTxt, "Второй абзац капсулы"), "DocumentHeader показывает новый текст (оба абзаца)", capTxt);
  const rowCap = await loadSynth(S_MAIN.id);
  ok(rowCap.capsuleHtml.includes('data-section="Капсула"') && rowCap.capsuleHtml.includes("<h4>Капсула</h4>") && rowCap.capsuleHtml.includes("<p>Новая капсула: становление первично.</p>") && !rowCap.capsuleHtml.includes(CAPSULE_TEXT), "БД: capsule_html — та же секция, новые абзацы", rowCap.capsuleHtml.slice(0, 160));
  const capVer = await db.select().from(elementVersions).where(and(eq(elementVersions.synthesisId, S_MAIN.id), eq(elementVersions.elementType, "section")));
  ok(capVer.length === 1, "версия-снимок капсулы создана", String(capVer.length));
  // чужой публичный синтез — без ✎
  await logout();
  await login(B);
  await openSynth(page, S_MAIN.id);
  ok(has(await text(page, T("capsule-text")), "Новая капсула"), "чужой видит публичную капсулу");
  ok(!(await exists(page, T("capsule-edit"))), "у чужого ✎ капсулы нет вовсе");
  ok(!(await exists(page, ".doc-title .doc-title-edit-btn")), "у чужого нет и ✎ названия");
  await openCatalog(page);
  ok(!(await exists(page, T("card-actions"))), "на «Мои» у B (пусто) строки действий нет");
  ok(await clickBtn(page, null, "Публичные") === "ok", "вкладка «Публичные»");
  await page.waitForSelector(CARD(S_MAIN.id), { timeout: 15000 });
  ok(!(await exists(page, `${CARD(S_MAIN.id)} ${T("card-actions")}`)), "на «Публичные» строки действий нет");
  await logout();
  await login(A);

  /* ══ R7: удаление связи ══ */
  console.log("\n■ R7: удаление связи из панели");
  await openSynth(page, S_MAIN.id);
  await openGraph2d(page);
  const hits0 = await page.$$eval(".edge-hit", (els) => els.length);
  ok(hits0 === 3, "в графе 3 связи", String(hits0));
  await page.evaluate(() => { const h = document.querySelector(".edge-hit"); h?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await page.waitForSelector(".gm-info-panel", { timeout: 10000 });
  await waitText(page, ".gm-info-panel", "Удалить связь");
  const edgeSrc = await page.$eval(".gm-info-panel", (el) => el.innerText);
  const m = /ИСТОЧНИК\s+([^\n]+)\n[\s\S]*?ЦЕЛЬ\s+([^\n]+)\n/.exec(edgeSrc);
  ok(!!m, "панель показывает источник и цель", edgeSrc.slice(0, 120));
  const [srcName, tgtName] = m ? [m[1].trim(), m[2].trim()] : ["", ""];
  const edgeDesc = EDGE_DESC(srcName, tgtName);
  ok(has(edgeSrc, "Редактировать"), "«✎ Редактировать» рядом");
  await clickDom(page, `.gm-info-panel ${T("edge-delete")}`);
  await page.waitForSelector(`.gm-info-panel ${T("edge-delete-confirm")}`, { timeout: 10000 });
  ok(has(await text(page, `.gm-info-panel ${T("edge-delete-warn")}`), "таблица связей документа перерисуется"), "второй шаг предупреждает о таблице связей");
  ok(!(await exists(page, `.gm-info-panel ${T("edge-delete")}`)) && (await exists(page, `.gm-info-panel ${T("edge-delete-cancel")}`)), "кнопка перешла в «Точно удалить?» + «Отмена»");
  await clickDom(page, `.gm-info-panel ${T("edge-delete-cancel")}`);
  await page.waitForSelector(`.gm-info-panel ${T("edge-delete")}`, { timeout: 5000 });
  ok(true, "«Отмена» вернула кнопку");
  await clickDom(page, `.gm-info-panel ${T("edge-delete")}`);
  await page.waitForSelector(`.gm-info-panel ${T("edge-delete-confirm")}`, { timeout: 10000 });
  await clickDom(page, `.gm-info-panel ${T("edge-delete-confirm")}`);
  await waitGone(page, ".gm-info-panel");
  ok(true, "панель закрылась");
  await page.waitForFunction(() => document.querySelectorAll(".edge-hit").length === 2, { timeout: 15000 });
  ok(true, "граф перерисован: 2 связи");
  let edgesDb;
  for (let i = 0; i < 30; i++) { edgesDb = await db.select().from(categoryEdges).where(eq(categoryEdges.synthesisId, S_MAIN.id)); if (edgesDb.length === 2) break; await sleep(200); }
  ok(edgesDb.length === 2 && !edgesDb.some((e) => e.description === edgeDesc), "БД: связь удалена", J(edgesDb.map((e) => e.description)));
  const [gsec] = await db.select().from(sections).where(and(eq(sections.synthesisId, S_MAIN.id), eq(sections.key, "graph")));
  ok(!gsec.htmlContent.includes(edgeDesc) && (gsec.htmlContent.match(/<tr>/g) || []).length < 100, "таблица связей документа перерисована без удалённой связи");
  const edgeVer = await db.select().from(elementVersions).where(and(eq(elementVersions.synthesisId, S_MAIN.id), eq(elementVersions.elementType, "edge")));
  ok(edgeVer.length === 1 && edgeVer[0].data?.description === edgeDesc, "снимок связи остался версией", J(edgeVer.map((v) => v.data?.description)));
  await clickBtn(page, ".gm-header", "✕");
  await sleep(300);
  await page.waitForFunction((d) => !document.body.innerText.includes(d), { timeout: 15000 }, edgeDesc);
  ok(true, "документ на странице перечитан — описания связи в тексте нет");

  /* ══ R8: блокировка ══ */
  console.log("\n■ R8: блокировка при генерации");
  // status='generating' без активного прогона: ✎ капсулы disabled
  await openSynth(page, S_GEN.id);
  await page.waitForSelector(T("capsule-edit"), { timeout: 10000 });
  ok(await page.$eval(T("capsule-edit"), (b) => b.disabled), "status='generating' → ✎ капсулы disabled");
  ok(claude.calls === 0, "просмотр generating-синтеза не запустил генерацию (мок: 0 вызовов)");
  // активная операция под слотом: режим с маркером SLOW84 — мок держит стрим
  const run = await api(A, "POST", `/syntheses/${S_SLOT.id}/modes/adversarial/run`, { param: "SLOW84" });
  ok(run.status === 200, "операция под слотом запущена", J(run));
  for (let i = 0; i < 50 && claude.hanging.length === 0; i++) await sleep(200);
  ok(claude.hanging.length === 1, "мок держит стрим (слот занят)");
  const d409 = await api(A, "DELETE", `/syntheses/${S_SLOT.id}`);
  ok(d409.status === 409 && d409.json?.code === "GENERATION_IN_PROGRESS", "DELETE концепции → 409 GENERATION_IN_PROGRESS", J(d409));
  const c409 = await api(A, "PATCH", `/syntheses/${S_SLOT.id}/capsule`, { html: "<p>x</p>" });
  ok(c409.status === 409, "PATCH капсулы → 409", J(c409));
  const slotEdges = await db.select().from(categoryEdges).where(eq(categoryEdges.synthesisId, S_SLOT.id));
  const e409 = await api(A, "DELETE", `/syntheses/${S_SLOT.id}/edges/${slotEdges[0].id}`);
  ok(e409.status === 409, "DELETE связи → 409", J(e409));
  const slotRow = await loadSynth(S_SLOT.id);
  ok(!!slotRow && slotRow.capsuleHtml.includes(CAPSULE_TEXT) && (await countRows(categoryEdges, S_SLOT.id)) === 3, "состояние не изменилось: синтез, капсула, 3 связи");
  // в каталоге: карточка — второй шаг → 409 строкой, карточка не исчезает
  await openCatalog(page);
  const cardS = CARD(S_SLOT.id);
  await clickDom(page, `${cardS} ${T("card-delete")}`);
  await page.waitForFunction((s) => { const b = document.querySelector(s); return b && !b.disabled; }, { timeout: 10000 }, `${cardS} ${T("card-delete-confirm")}`);
  await clickDom(page, `${cardS} ${T("card-delete-confirm")}`);
  const st = await waitText(page, `${cardS} ${T("card-status")}`, "генерация");
  ok(has(st, "Генерация ещё идёт"), "409 — строкой в карточке", st);
  ok(await exists(page, cardS) && await exists(page, `${cardS} ${T("card-delete")}`), "карточка не исчезла, кнопка вернулась");
  ok(!!(await loadSynth(S_SLOT.id)), "синтез в БД цел");
  // в документе под слотом: PATCH капсулы из UI → 409 строкой
  await openSynth(page, S_SLOT.id);
  await clickDom(page, T("capsule-edit"));
  await page.waitForSelector(`${T("capsule-form")} textarea`, { timeout: 10000 });
  await clickDom(page, T("capsule-save"));
  const cerr = await waitText(page, T("capsule-error"), "генерация");
  ok(has(cerr, "заблокирована"), "капсула: 409 → строкой под полем", cerr);
  await openGraph2d(page);
  await page.evaluate(() => { const h = document.querySelector(".edge-hit"); h?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await page.waitForSelector(".gm-info-panel", { timeout: 10000 });
  await waitText(page, ".gm-info-panel", "Удалить связь");
  await clickDom(page, `.gm-info-panel ${T("edge-delete")}`);
  await page.waitForSelector(`.gm-info-panel ${T("edge-delete-confirm")}`, { timeout: 10000 });
  await clickDom(page, `.gm-info-panel ${T("edge-delete-confirm")}`);
  const eerr = await waitText(page, `.gm-info-panel ${T("edge-delete-error")}`, "генерация");
  ok(has(eerr, "заблокированы"), "связь: 409 → строкой в панели, панель открыта", eerr);
  ok((await countRows(categoryEdges, S_SLOT.id)) === 3, "связей по-прежнему 3");
  await clickBtn(page, ".gm-header", "✕");

  /* ══ R10: чужие запросы ══ */
  console.log("\n■ R10: edge case — чужой DELETE / PATCH");
  const f1 = await api(B, "DELETE", `/syntheses/${S_MAIN.id}`);
  ok(f1.status === 403 && f1.json?.code === "FORBIDDEN", "чужой DELETE /syntheses/:id → 403", J(f1));
  const f2 = await api(B, "PATCH", `/syntheses/${S_MAIN.id}/capsule`, { html: "<p>чужая</p>" });
  ok(f2.status === 403 && f2.json?.code === "FORBIDDEN", "чужой PATCH /capsule → 403", J(f2));
  const f3 = await api(B, "POST", `/syntheses/${S_MAIN.id}/duplicate`);
  ok(f3.status === 403, "чужой duplicate → 403", J(f3));
  const f4 = await api(B, "PATCH", `/syntheses/${S_MAIN.id}`, { title: "чужое" });
  ok(f4.status === 403, "чужой PATCH title → 403", J(f4));
  const mainRow = await loadSynth(S_MAIN.id);
  ok(!!mainRow && mainRow.title === "Переименованный синтез" && mainRow.capsuleHtml.includes("Новая капсула"), "публичный синтез A цел");
  const v400 = await api(A, "PATCH", `/syntheses/${S_MAIN.id}`, { title: "x".repeat(301) });
  ok(v400.status === 400 && v400.json?.details?.title, "title 301 знак → 400 details.title (сервер: лимит 300, не 200 из текста 8.4)", J(v400.json));

  /* ══ R9: уборка ══ */
  console.log("\n■ R9: уборка мёртвых функций");
  const dead = ["transformGraphToTheses", "transformThesesToGraph", "getVersions", "getConfigVersions", "getCategory"];
  const grep = spawnSync("grep", ["-rnwE", dead.join("|"), ROOT + "client/src"], { encoding: "utf8" });
  ok(grep.status === 1 && !grep.stdout.trim(), "grep по client/src не находит пяти имён", grep.stdout.slice(0, 300));
  const alive = spawnSync("grep", ["-rlE", "exportUrl|invalidateTaxonomyCache", ROOT + "client/src/api"], { encoding: "utf8" });
  ok(has(alive.stdout, "export.ts") && has(alive.stdout, "taxonomy.ts"), "exportUrl / invalidateTaxonomyCache не тронуты");
  console.log("  … tsc -b packages/shared server client");
  tscResult = spawnSync(ROOT + "node_modules/.bin/tsc", ["-b", "packages/shared", "server", "client"], { cwd: ROOT, encoding: "utf8", timeout: 170000 });
  ok(tscResult.status === 0, "tsc -b чистый после уборки", (tscResult.stdout + tscResult.stderr).slice(0, 400));

  /* ══ Гигиена консоли ══ */
  const noise = /Failed to load resource|fonts\.googleapis|401|WebSocket|ws:\/\//;
  const realErrors = [...pageErrors, ...consoleErrors].filter((e) => !noise.test(e));
  ok(realErrors.length === 0, "консоль браузера без ошибок (кроме известного шума)", realErrors.slice(0, 3).join(" | "));
  ok(dialogs.length === 0, "за весь прогон — ни одного window.confirm/alert/prompt", J(dialogs));
} catch (err) {
  failed++; fails.push("ИСКЛЮЧЕНИЕ: " + String(err));
  console.error("ИСКЛЮЧЕНИЕ сценария:", err?.stack ?? err);
  console.error("server log tail:\n" + serverLog.slice(-1500));
} finally {
  console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗`);
  if (fails.length) console.log("Провалы:\n  " + fails.join("\n  "));
  for (const r of claude.hanging) { try { r.destroy(); } catch {} }
  try { await Promise.race([browser?.close(), sleep(5000)]); } catch {}
  killGroup(serverProc); killGroup(viteProc);
  claudeSrv?.closeAllConnections?.(); claudeSrv?.close();
  try { await Promise.race([closeRedis(), sleep(3000)]); } catch {}
  try { await Promise.race([closeDb(), sleep(3000)]); } catch {}
  process.exit(failed ? 1 : 0);
}
