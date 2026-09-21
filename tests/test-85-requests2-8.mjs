/**
 * Тестовые запросы 2–8 беседы 8.5 (родословная при импорте — сопоставление
 * родителя по имени предложением) — одним заходом: живой сервер :3000
 * (прокси vite зашит) + vite :5199 + PG16/Redis + браузер (puppeteer-core,
 * системный Chrome). Мок Claude не нужен: генерация не запускается.
 *
 * Фикстуры-файлы строятся из ЖИВОГО файла одностраничника
 * (PS-6933-6RIK, 1,1 МБ, без UUID; путь — T85_FILE или /mnt/user-data/uploads):
 *   child   — как есть («Вмещающий разлом» ← Юнг + концепция «Грамматика
 *             самоотрицания»);
 *   parent  — тот же файл с заголовком/корнем genealogy «Грамматика
 *             самоотрицания» (родителя импортируем ПЕРВЫМ — R3);
 *   two     — child с ВТОРОЙ концепцией-родителем в genealogy (R5).
 *
 *  R2  Импорт child без совпадений: lineageCandidates = [{ parentName,
 *      matches: [] }], предупреждение «импортировать родителя ДО», synthesis_lineage —
 *      только philosopher.
 *  R3  Полный путь в браузере: импорт parent → импорт child → блок с одним
 *      совпадением → «Связать» → «Точно связать?» → строка
 *      parent_type='synthesis' → авто-переход к синтезу → «Генеалогическое
 *      древо» в шапке РИСУЕТСЯ (isMetaSynthesis без правок 3.2).
 *  R4  Нормализация: родитель в базе с двойным пробелом и «в ёлочках» →
 *      совпадение; родитель с другим именем → нет.
 *  R5  Два родителя: two → два блока; «Связать» у одного, «Пропустить» у
 *      другого → ровно одна строка synthesis; второй шаг сбрасывается
 *      кликом мимо блока.
 *  R6  Заслоны: self → 400 LINEAGE_SELF; потомок в родители → 409
 *      LINEAGE_CYCLE; повтор пары → 409 LINEAGE_EXISTS без дубликата.
 *  R7  Чужое: link на концепцию другого пользователя → 403, строки нет;
 *      чужие одноимённые (даже публичные) в matches не попадают.
 *  R8  Edge: файл экспорта сервиса 4.2 (UUID есть) → прежняя ветка: связь
 *      создана при импорте БЕЗ предложения; lineageCandidates пуст.
 * Запуск: setsid nohup node_modules/.bin/tsx tests/test-85-requests2-8.mjs > /tmp/t85.log 2>&1 &
 * (PG16 + Redis подняты: pg_ctlcluster 16 main start; redis-server --daemonize yes --save '')
 */
import fs from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import puppeteer from "puppeteer-core";

const SERVER_PORT = 3000;
const VITE_PORT = 5199;
const UI = `http://127.0.0.1:${VITE_PORT}`;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const DB_URL = "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const CHROME = process.env.CHROME_PATH ?? "/opt/google/chrome/chrome";
const ROOT = new URL("../", import.meta.url).pathname;
const LIVE_FILE = process.env.T85_FILE ?? "/mnt/user-data/uploads/PS-6933-6RIK-vmeschayuschiy-razlom-rgG2.html";

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
const { eq, like } = await import("drizzle-orm");
const { users, syntheses, synthesisLineage, sections, apiUsage, transactions } = schema;

/* ══ Файлы-фикстуры из живого файла ═══════════════════════════════════ */
const STATE_RE = /(<script type="application\/json" id="philosynth-state">)([\s\S]*?)(<\/script>)/;
function withState(html, mut) {
  const m = STATE_RE.exec(html);
  if (!m) throw new Error("philosynth-state не найден в файле");
  const st = JSON.parse(m[2]);
  mut(st);
  return html.replace(STATE_RE, (_, a, __, c) => a + J(st) + c);
}
const PARENT_NAME = "Грамматика самоотрицания";
const SECOND_NAME = "Онтология вмещения";
function buildFixtures() {
  const live = fs.readFileSync(LIVE_FILE, "utf8");
  if (/synthesisId/.test(live) || /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(live))
    throw new Error("живой файл содержит UUID/synthesisId — фикстура непригодна");
  const parent = withState(live.replace('id="docTitle">Вмещающий разлом<', `id="docTitle">${PARENT_NAME}<`), (st) => {
    st.genealogy.name = PARENT_NAME;
    st.genealogy.participants = [{ type: "philosopher", name: "Витгенштейн" }, { type: "philosopher", name: "Шестов" }];
    st.participants = st.genealogy.participants.map((p) => ({ ...p }));
    st.params.phil = ["Витгенштейн", "Шестов"];
  });
  const two = withState(live, (st) => {
    st.genealogy.participants.push({ type: "concept", name: SECOND_NAME, method: "creative", synthLevel: "generative", generationOrder: "architectural", seed: "второе зерно" });
  });
  fs.writeFileSync("/tmp/t85-child.html", live);
  fs.writeFileSync("/tmp/t85-parent.html", parent);
  fs.writeFileSync("/tmp/t85-two.html", two);
}

/* ══ Фикстура синтеза для экспорта (R8) — граф как в 8.4 ══════════════ */
const secWrap = (num, title, inner) =>
  `<div class="doc-section"><div class="section-num">§ ${num}</div><div class="section-title">${title}</div><div class="doc-content">${inner}</div></div>`;
const sub = (name, inner) => `<div data-section="${name}"><h4>${name}</h4>${inner}</div>`;
const tbl = (heads, rows) =>
  `<table class="doc-table"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
function graphHtml() {
  const names = ["Бытие", "Становление", "Ничто"];
  const cats = names.map((n, i) => [n, i % 2 ? "метафизическая" : "онтологическая", `Определение ${n}`, "0.6", "0.7", `Источник ${n}`]);
  const edges = names.slice(1).map((n, i) => [names[i], `${names[i]} обусловливает ${n}`, n, "диалектическая", "однонаправленная", "0.8"]);
  const topo = names.map((n, i) => [n, i < 2 ? "Ядро" : "Горизонт", i === 0 ? "центральная" : "", i % 2 ? "тезис" : "антитезис", ""]);
  return secWrap(2, "Граф категорий",
    sub("Таблица категорий", tbl(["Категория", "Тип", "Определение", "Центральность", "Определённость", "Происхождение"], cats)) +
    sub("Таблица связей", tbl(["Источник", "Описание связи", "Цель", "Тип", "Направление", "Сила"], edges)) +
    sub("Топология графа", "<p>Два кластера.</p>") +
    sub("Топологическая таблица", tbl(["Категория", "Кластер", "Структурные роли", "Процессуальные роли", "Рефлексивная связь"], topo)));
}
async function makeSynthesis(userId, title, extra = {}) {
  const [s] = await db.insert(syntheses).values({
    userId, seed: "зерно 8.5", sectionOrder: ["sum", "graph"], status: "ready", title, docNum: "T85-" + Math.random().toString(36).slice(2, 6).toUpperCase(),
    capsuleHtml: secWrap(0, "Капсула", sub("Капсула", "<p>Капсула тестового синтеза.</p>")), ...extra,
  }).returning();
  await db.insert(synthesisLineage).values([{ synthesisId: s.id, parentType: "philosopher", parentName: "Парменид", position: 0 }]);
  const g = graphHtml();
  await db.insert(sections).values([
    { synthesisId: s.id, key: "sum", sectionNum: 1, title: "Резюме", htmlContent: secWrap(1, "Резюме", sub("Цели", "<p>Цели.</p>")) },
    { synthesisId: s.id, key: "graph", sectionNum: 2, title: "Граф Категорий Концепции", htmlContent: g },
  ]);
  await saveGraphToDb(s.id, parseGraphFromHTML(g), { normalizeTypes: false });
  return s;
}
const lineageOf = (sid) => db.select().from(synthesisLineage).where(eq(synthesisLineage.synthesisId, sid));

/* ══ Процессы ═════════════════════════════════════════════════════════ */
let serverProc, viteProc, browser;
let serverLog = "", viteLog = "";
async function assertPortFree(url, name) {
  try { const r = await fetch(url); if (r.ok) throw new Error(`порт занят чужим ${name}`); }
  catch (e) { if (String(e).includes("порт занят")) throw e; }
}
async function startServer() {
  await assertPortFree(`${API}/health`, "сервером");
  serverProc = spawn(process.execPath, ["--import", "tsx", "index.ts"], {
    cwd: new URL("../server/", import.meta.url).pathname,
    env: { ...process.env, PORT: String(SERVER_PORT), DATABASE_URL: DB_URL, REDIS_URL: "redis://localhost:6379", CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000" },
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
    cwd: new URL("../client/", import.meta.url).pathname, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  viteProc.stdout.on("data", (d) => (viteLog += d));
  viteProc.stderr.on("data", (d) => (viteLog += d));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(UI + "/")).ok) return; } catch {} await sleep(300); }
  throw new Error("vite не поднялся:\n" + viteLog.slice(-2000));
}
const killGroup = (p) => { if (!p) return; try { process.kill(-p.pid, "SIGKILL"); } catch {} try { p.kill("SIGKILL"); } catch {} };

async function makeUser(tag) {
  const email = `t85-${tag}-${Date.now()}@test.local`;
  const password = "Passw0rd!123";
  let r = await fetch(`${API}/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: J({ email, password }) });
  if (!r.ok) throw new Error("register: " + (await r.text()));
  const id = (await r.json()).user.id;
  r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: J({ email, password }) });
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  return { id, email, password, cookie, token: cookie.split("=")[1] };
}
const api = async (u, method, path, body) => {
  const r = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", Cookie: u.cookie }, body: body === undefined ? undefined : J(body) });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};
async function importViaApi(u, path) {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(path)], { type: "text/html" }), path.split("/").pop());
  const r = await fetch(`${API}/syntheses/import`, { method: "POST", headers: { Cookie: u.cookie }, body: form });
  return { status: r.status, json: await r.json() };
}

/* ══ Хелперы браузера ═════════════════════════════════════════════════ */
const T = (id) => `[data-testid="${id}"]`;
const has = (s, frag) => String(s ?? "").toLowerCase().includes(String(frag).toLowerCase());
const text = (page, sel) => page.$eval(sel, (el) => el.innerText.replace(/\s+/g, " ").trim()).catch(() => null);
const clickDom = (page, sel) => page.$eval(sel, (el) => el.click());
const waitPath = (page, prefix, timeout = 30000) =>
  page.waitForFunction((p) => location.pathname.startsWith(p), { timeout }, prefix);
async function importInBrowser(page, filePath) {
  await page.goto(`${UI}/import`, { waitUntil: "domcontentloaded" });
  const input = await page.waitForSelector('input[type="file"]', { timeout: 20000 });
  await input.uploadFile(filePath);
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Подтвердить импорт")), { timeout: 10000 });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Подтвердить импорт")).click());
  await page.waitForFunction(() => location.pathname.startsWith("/synthesis/") || document.body.innerText.includes("Импорт завершён"), { timeout: 60000 });
}
const blocks = (page) => page.$$eval(T("lineage-candidate"), (els) => els.map((e) => ({ state: e.dataset.state, name: e.dataset.parentName ?? e.querySelector(".callout-label")?.textContent ?? "", matches: e.querySelectorAll('[data-testid="lineage-match"]').length })));

/* ══ Прогон ═══════════════════════════════════════════════════════════ */
try {
  for (const stale of await db.select({ id: users.id }).from(users).where(like(users.email, "t85-%"))) {
    await db.delete(syntheses).where(eq(syntheses.userId, stale.id));
    await db.delete(apiUsage).where(eq(apiUsage.userId, stale.id));
    await db.delete(transactions).where(eq(transactions.userId, stale.id));
    await db.delete(users).where(eq(users.id, stale.id));
  }
  buildFixtures();
  await startServer();
  await startVite();
  console.log("Сервер и vite подняты; фикстуры собраны из живого файла.");

  const A = await makeUser("owner");     // R3/R5/R6/R8
  const B = await makeUser("stranger");  // R7
  const D = await makeUser("norm");      // R2/R4

  /* ══ R2: без совпадений ══ */
  console.log("\n■ R2: импорт без совпадений");
  const r2 = await importViaApi(D, "/tmp/t85-child.html");
  ok(r2.status === 200, "POST /syntheses/import → 200", J(r2.json).slice(0, 200));
  const cands2 = r2.json.lineageCandidates ?? [];
  ok(cands2.length === 1 && cands2[0].parentName === PARENT_NAME, "lineageCandidates: один родитель с parentName из файла", J(cands2));
  ok(cands2[0]?.matches?.length === 0, "matches пуст");
  const w2 = (r2.json.warnings ?? []).filter((w) => w.field === "lineage");
  ok(w2.length === 1 && has(w2[0].message, "импортировать родителя ДО"), "предупреждение говорит, как получить настоящую связь", J(w2));
  const l2 = await lineageOf(r2.json.id);
  ok(l2.length === 1 && l2.every((r) => r.parentType === "philosopher"), "synthesis_lineage — только строки philosopher", J(l2.map((r) => r.parentType)));
  const g2 = await api(D, "GET", `/syntheses/${r2.json.id}`);
  ok(g2.json?.synthesis?.parentSyntheses?.length === 0, "parentSyntheses пуст → isMetaSynthesis=false до связывания");

  /* ══ R4: нормализация имени (API) ══ */
  console.log("\n■ R4: нормализация имени");
  const [pN] = await db.insert(syntheses).values({ userId: D.id, title: "«Грамматика  самоотрицания»", status: "ready", docNum: "T85-N1" }).returning();
  const [pX] = await db.insert(syntheses).values({ userId: D.id, title: "Грамматика самоутверждения", status: "ready", docNum: "T85-N2" }).returning();
  const r4 = await importViaApi(D, "/tmp/t85-child.html");
  const m4 = r4.json.lineageCandidates?.[0]?.matches ?? [];
  ok(m4.length === 1 && m4[0].id === pN.id, "двойной пробел + ёлочки → совпадение найдено", J(m4));
  ok(!m4.some((x) => x.id === pX.id), "другое имя → не найдено");
  ok(has(r4.json.warnings.find((w) => w.field === "lineage")?.message, "совпадени"), "предупреждение переформулировано при совпадении");
  ok((await lineageOf(r4.json.id)).every((r) => r.parentType === "philosopher"), "связь при импорте НЕ создана при единственном совпадении");
  ok(typeof m4[0]?.title === "string" && typeof m4[0]?.createdAt === "string", "match несёт title и createdAt");

  /* ══ Браузер ══ */
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push("console: " + m.text()); });
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); void d.accept(); });
  await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
  await page.setCookie({ name: "philosynth_session", value: A.token, url: UI });

  /* ══ R3: полный путь ══ */
  console.log("\n■ R3: родитель → ребёнок → «Связать» → дерево");
  await importInBrowser(page, "/tmp/t85-parent.html");
  // родитель: без концепций-родителей — либо переход, либо экран предупреждений (квирки 4.3)
  let parentId;
  if (await page.evaluate(() => location.pathname.startsWith("/synthesis/"))) {
    parentId = await page.evaluate(() => location.pathname.split("/").pop());
  } else {
    ok((await page.$$(T("lineage-candidate"))).length === 0, "у родителя блоков предложения нет");
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Перейти к синтезу")).click());
    await waitPath(page, "/synthesis/");
    parentId = await page.evaluate(() => location.pathname.split("/").pop());
  }
  const parentRow = (await db.select().from(syntheses).where(eq(syntheses.id, parentId)))[0];
  ok(parentRow?.title === PARENT_NAME && parentRow.userId === A.id, "родитель импортирован первым, заголовок из файла", parentRow?.title);

  await importInBrowser(page, "/tmp/t85-child.html");
  ok(!(await page.evaluate(() => location.pathname.startsWith("/synthesis/"))), "ребёнок: перехода нет — есть предложение родителя");
  await page.waitForSelector(T("lineage-candidate"), { timeout: 10000 });
  let b3 = await blocks(page);
  ok(b3.length === 1 && b3[0].state === "pending" && b3[0].matches === 1, "один блок, одно совпадение", J(b3));
  const blockTxt = await text(page, T("lineage-candidate"));
  ok(has(blockTxt, `концепция-родитель „${PARENT_NAME}“`) && has(blockTxt, "В базе найдено"), "текст блока: «В файле указана концепция-родитель „X“. В базе найдено:»", blockTxt);
  ok(has(blockTxt, PARENT_NAME) && /\d{4}/.test(blockTxt), "совпадение показано с названием и датой");
  const childId3 = await page.evaluate(() => location.pathname); // /import
  await clickDom(page, T("lineage-link"));
  await page.waitForSelector(T("lineage-link-confirm"), { timeout: 5000 });
  ok(has(await text(page, T("lineage-link-confirm")), "Точно связать"), "второй шаг: «Точно связать?»");
  ok(await page.$(T("lineage-link-cancel")) !== null, "второй шаг: «Отмена» рядом");
  await clickDom(page, T("lineage-link-confirm"));
  await waitPath(page, "/synthesis/");
  const child3 = await page.evaluate(() => location.pathname.split("/").pop());
  ok(child3 !== parentId, "после связывания — авто-переход к синтезу-ребёнку");
  const l3 = await lineageOf(child3);
  const syn3 = l3.filter((r) => r.parentType === "synthesis");
  ok(syn3.length === 1 && syn3[0].parentSynthesisId === parentId, "строка parent_type='synthesis' → родитель", J(l3));
  ok(syn3[0]?.position === 1, "position — в конец (после Юнга: 1)", syn3[0]?.position);
  await page.waitForSelector(".doc-header .doc-title", { timeout: 20000 });
  // innerText капителью (header-disclosure summary — text-transform) — сверка по textContent
  await page.waitForFunction(() => [...document.querySelectorAll(".header-disclosure summary")].some((e) => e.textContent.includes("Генеалогическое древо")), { timeout: 20000 });
  ok(true, "«Генеалогическое древо» в шапке РИСУЕТСЯ (isMetaSynthesis по parentSyntheses, 3.2 без правок)");
  await page.waitForSelector(".gen-card, .gen-phil", { timeout: 20000 });
  const tree3 = await page.evaluate(() => ({ cards: document.querySelectorAll(".gen-card").length, phils: [...document.querySelectorAll(".gen-phil-name")].map((e) => e.textContent.trim()) })); // textContent — не innerText (капитель)
  ok(tree3.cards >= 2 && tree3.phils.includes("Юнг"), "дерево: карточки ребёнка и родителя, философы (Юнг)", J(tree3));
  ok(tree3.phils.includes("Витгенштейн"), "дерево транзитивно: философы родителя видны");
  const g3 = await api(A, "GET", `/syntheses/${child3}`);
  ok(g3.json?.synthesis?.parentSyntheses?.[0]?.id === parentId, "GET /:id: parentSyntheses = [родитель]");
  ok(childId3 === "/import", "(проверка якоря) до связывания страница оставалась /import");

  /* ══ R5: два родителя ══ */
  console.log("\n■ R5: два родителя — связать одного, пропустить другого");
  const [second] = await db.insert(syntheses).values({ userId: A.id, title: SECOND_NAME, status: "ready", docNum: "T85-S2" }).returning();
  await importInBrowser(page, "/tmp/t85-two.html");
  await page.waitForFunction((n) => document.querySelectorAll(`[data-testid="lineage-candidate"]`).length === n, { timeout: 10000 }, 2);
  let b5 = await blocks(page);
  ok(b5.length === 2 && b5.every((b) => b.state === "pending" && b.matches >= 1), "два блока, у каждого совпадения", J(b5));
  const blockSel = (name) => `${T("lineage-candidate")}[data-parent-name="${name}"]`;
  // второй шаг сбрасывается кликом мимо
  await clickDom(page, `${blockSel(PARENT_NAME)} ${T("lineage-link")}`);
  await page.waitForSelector(`${blockSel(PARENT_NAME)} ${T("lineage-link-confirm")}`, { timeout: 5000 });
  await page.mouse.click(1200, 60);
  await page.waitForFunction((s) => !document.querySelector(s), { timeout: 5000 }, `${blockSel(PARENT_NAME)} ${T("lineage-link-confirm")}`);
  ok(await page.$(`${blockSel(PARENT_NAME)} ${T("lineage-link")}`) !== null, "второй шаг сброшен кликом мимо блока — «Связать» вернулась");
  // пропустить второго
  await clickDom(page, `${blockSel(SECOND_NAME)} ${T("lineage-skip")}`);
  await page.waitForSelector(`${blockSel(SECOND_NAME)}[data-state="skipped"], ${T("lineage-candidate")}[data-state="skipped"]`, { timeout: 5000 });
  b5 = await blocks(page);
  ok(b5.some((b) => b.state === "skipped") && b5.some((b) => b.state === "pending"), "отказ от одного не мешает другому", J(b5));
  ok(!(await page.evaluate(() => location.pathname.startsWith("/synthesis/"))), "после «Пропустить» перехода нет (ничего не связано)");
  // связать первого
  await clickDom(page, `${blockSel(PARENT_NAME)} ${T("lineage-link")}`);
  await page.waitForSelector(`${blockSel(PARENT_NAME)} ${T("lineage-link-confirm")}`, { timeout: 5000 });
  await clickDom(page, `${blockSel(PARENT_NAME)} ${T("lineage-link-confirm")}`);
  await waitPath(page, "/synthesis/");
  const child5 = await page.evaluate(() => location.pathname.split("/").pop());
  const l5 = (await lineageOf(child5)).filter((r) => r.parentType === "synthesis");
  ok(l5.length === 1 && l5[0].parentSynthesisId === parentId, "ровно одна строка synthesis (связанный родитель)", J(l5));
  ok(!l5.some((r) => r.parentSynthesisId === second.id), "пропущенный родитель не привязан");

  /* ══ R6: заслоны ══ */
  console.log("\n■ R6: заслоны LINEAGE_SELF / LINEAGE_CYCLE / повтор");
  const selfR = await api(A, "POST", `/syntheses/${child3}/lineage/link`, { parentName: "x", parentSynthesisId: child3 });
  ok(selfR.status === 400 && selfR.json?.code === "LINEAGE_SELF", "к самой себе → 400 LINEAGE_SELF", J(selfR));
  // parentId — родитель child3; child3 — потомок parentId → parentId ← child3 = цикл
  const cyc = await api(A, "POST", `/syntheses/${parentId}/lineage/link`, { parentName: "Вмещающий разлом", parentSynthesisId: child3 });
  ok(cyc.status === 409 && cyc.json?.code === "LINEAGE_CYCLE", "собственный потомок в родители → 409 LINEAGE_CYCLE", J(cyc));
  // транзитивный: child5 ← parentId; parentId ← child3 запрещён; проверим parentId ← child5 тоже
  const cyc2 = await api(A, "POST", `/syntheses/${parentId}/lineage/link`, { parentName: "x", parentSynthesisId: child5 });
  ok(cyc2.status === 409 && cyc2.json?.code === "LINEAGE_CYCLE", "второй потомок в родители → тоже LINEAGE_CYCLE");
  const before = (await lineageOf(child3)).length;
  const dup = await api(A, "POST", `/syntheses/${child3}/lineage/link`, { parentName: PARENT_NAME, parentSynthesisId: parentId });
  ok(dup.status === 409 && dup.json?.code === "LINEAGE_EXISTS", "повторная привязка той же пары → 409 LINEAGE_EXISTS", J(dup));
  ok((await lineageOf(child3)).length === before, "дубликата строки нет");
  ok((await lineageOf(parentId)).every((r) => r.parentType === "philosopher"), "у родителя строк synthesis не появилось");
  const bad = await api(A, "POST", `/syntheses/${child3}/lineage/link`, { parentSynthesisId: parentId });
  ok(bad.status === 400 && bad.json?.code === "VALIDATION_ERROR" && bad.json?.details?.parentName, "без parentName → 400 VALIDATION_ERROR details.parentName", J(bad));
  const nf = await api(A, "POST", `/syntheses/${child3}/lineage/link`, { parentName: "x", parentSynthesisId: "00000000-0000-4000-8000-000000000000" });
  ok(nf.status === 404, "несуществующий родитель → 404");

  /* ══ R7: чужое ══ */
  console.log("\n■ R7: чужие концепции");
  const [bPub] = await db.insert(syntheses).values({ userId: B.id, title: PARENT_NAME, status: "ready", isPublic: true, docNum: "T85-B1" }).returning();
  const f7 = await api(A, "POST", `/syntheses/${child5}/lineage/link`, { parentName: PARENT_NAME, parentSynthesisId: bPub.id });
  ok(f7.status === 403 && f7.json?.code === "FORBIDDEN", "чужая (публичная) концепция в родители → 403 FORBIDDEN", J(f7));
  ok(!(await lineageOf(child5)).some((r) => r.parentSynthesisId === bPub.id), "строка не создана");
  const f7b = await api(B, "POST", `/syntheses/${child5}/lineage/link`, { parentName: PARENT_NAME, parentSynthesisId: bPub.id });
  ok(f7b.status === 403, "чужой ребёнок (не мой синтез) → 403");
  const r7 = await importViaApi(A, "/tmp/t85-child.html");
  const m7 = r7.json.lineageCandidates?.[0]?.matches ?? [];
  ok(m7.length >= 1 && m7.every((x) => x.id !== bPub.id), "чужая одноимённая публичная концепция в matches не попадает", J(m7));
  ok(m7.some((x) => x.id === parentId), "своя одноимённая — в matches");

  /* ══ R8: файл экспорта сервиса (UUID есть) ══ */
  console.log("\n■ R8: edge — экспорт сервиса 4.2 с UUID");
  const P8 = await makeSynthesis(A.id, "Родитель для экспорта");
  const C8 = await makeSynthesis(A.id, "Ребёнок для экспорта");
  await db.insert(synthesisLineage).values([{ synthesisId: C8.id, parentType: "synthesis", parentSynthesisId: P8.id, position: 1 }]);
  const exp = await fetch(`${API}/syntheses/${C8.id}/export/html`, { headers: { Cookie: A.cookie } });
  ok(exp.status === 200, "GET /export/html → 200", String(exp.status));
  const expHtml = await exp.text();
  fs.writeFileSync("/tmp/t85-export.html", expHtml);
  ok(expHtml.includes(P8.id), "файл экспорта несёт UUID родителя");
  const r8 = await importViaApi(A, "/tmp/t85-export.html");
  ok(r8.status === 200, "импорт файла экспорта → 200", J(r8.json).slice(0, 300));
  ok((r8.json.lineageCandidates ?? []).length === 0, "lineageCandidates пуст — предложения нет");
  const l8 = await lineageOf(r8.json.id);
  ok(l8.some((r) => r.parentType === "synthesis" && r.parentSynthesisId === P8.id), "связь создана при импорте прежней веткой UUID", J(l8));
  ok(!(r8.json.warnings ?? []).some((w) => w.field === "lineage"), "предупреждения lineage нет");

  /* ══ Гигиена консоли ══ */
  const noise = /Failed to load resource|fonts\.googleapis|401|WebSocket|ws:\/\//;
  const realErrors = [...pageErrors, ...consoleErrors].filter((e) => !noise.test(e));
  ok(realErrors.length === 0, "консоль браузера без ошибок (кроме известного шума)", realErrors.slice(0, 3).join(" | "));
  ok(dialogs.length === 0, "ни одного window.confirm/alert за прогон (второй шаг кнопок, не confirm)", J(dialogs));
} catch (err) {
  failed++; fails.push("ИСКЛЮЧЕНИЕ: " + String(err));
  console.error("ИСКЛЮЧЕНИЕ сценария:", err?.stack ?? err);
  console.error("server log tail:\n" + serverLog.slice(-1500));
} finally {
  console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗`);
  if (fails.length) console.log("Провалы:\n  " + fails.join("\n  "));
  try { await Promise.race([browser?.close(), sleep(5000)]); } catch {}
  killGroup(serverProc); killGroup(viteProc);
  try { await Promise.race([closeRedis(), sleep(3000)]); } catch {}
  try { await Promise.race([closeDb(), sleep(3000)]); } catch {}
  process.exit(failed ? 1 : 0);
}
