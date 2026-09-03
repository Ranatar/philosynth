/**
 * Тестовые запросы 2–5 беседы 5.2 (Element Editor UI, клиент) + проверки
 * «По факту 5.2» (isOwner, htmlSync.pending в UI).
 *  R2  граф → 2D → клик узла → NodePanel → «✎ Редактировать» →
 *      CategoryEditor → сменить имя → Сохранить → «Анализ влияния» с
 *      затронутыми разделами (theses/glossary/critique) и режимом.
 *  R3  наведение на строку сводной таблицы тезисов → ✎ → ThesisEditor →
 *      сменить формулировку → Сохранить → БД и html_content обновлены,
 *      страница перечитала раздел; тезис без абзаца — justification в
 *      htmlSync.pending → предупреждение «Не отражено в документе».
 *  R4  VersionHistory: категория изменена 3 раза (UI + 2 PATCH) →
 *      история → 3 версии (+ строка «текущее») → откат к v1 → данные
 *      восстановлены, версия 4 changeSource='rollback'.
 *  R5  автозамена: переименовать → «Автозамена имён» → подтвердить →
 *      html_content тезисов/глоссария/критики и related_categories
 *      содержат новое имя.
 *  + isOwner: владелец true, чужой на публичном — false, ✎/«Изменить»
 *    у чужого не рисуются; «Перегенерировать затронутые» открывает
 *    EditModal с предотмеченными разделами (планы §2.6).
 *
 * Харнесс (как test-41): живой сервер :3000 + vite :5199 + PG16/Redis;
 * puppeteer-core с системным Chrome. Фикстура — как в test-51 (HTML «как
 * от Claude», гранулярные таблицы теми же парсерами 1.4).
 * Запуск: node_modules/.bin/tsx tests/test-52-requests2-5.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import puppeteer from "puppeteer-core";

const SERVER_PORT = 3000;
const VITE_PORT = 5199;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const UI = `http://127.0.0.1:${VITE_PORT}`;
const DB_URL = "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const CHROME = process.env.CHROME_PATH ?? "/opt/google/chrome/chrome";

process.env.DATABASE_URL ??= DB_URL;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-secret-52";
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
const { saveElementsToDb, parseThesesFromHTML, parseGlossaryFromHTML } = await import("../server/services/element-parser.js");
const { and, asc, eq } = await import("drizzle-orm");
const { syntheses, synthesisLineage, sections, categories, theses, glossaryTerms, elementVersions, modeResults } = schema;

/* ══ Фикстура ═════════════════════════════════════════════════════════ */
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
    ]) + "<p>Комментарий после таблицы.</p>") +
  sub("Таблица связей",
    tbl(["Источник", "Описание связи", "Цель", "Тип", "Направление", "Сила"], [
      ["Бытие", "порождает", "Становление", "диалектическая", "однонаправленная", "0.8"],
    ])) +
  sub("Топология графа", "<p>Кластер «Ядро».</p>") +
  sub("Топологическая таблица",
    tbl(["Категория", "Кластер", "Структурные роли", "Процессуальные роли", "Рефлексивная связь"], [
      ["Бытие", "Ядро", "центральная", "тезис", ""],
      ["Становление", "Ядро", "мост", "антитезис", ""],
    ])));
const THESES_HTML = secWrap(3, "Тезисы",
  sub("Онтологические тезисы", "<p><strong>Бытие есть становление</strong> Потому что так учил Гераклит.</p>") +
  sub("Эпистемологические тезисы", "<p><strong>Познание опосредовано</strong> Обоснование два.</p>") +
  sub("Сводная таблица тезисов",
    tbl(["№", "Формулировка тезиса", "Тип (онтол./эпистем./этич.)", "Степень новизны", "Связанные категории"], [
      ["1", "Бытие есть становление", "онтологический", "высокая", "Бытие, Становление"],
      ["2", "Познание опосредовано", "эпистемологический", "средняя", "Становление"],
      ["3", "Этика следует из Бытия", "этический", "низкая", "Бытие"], // без абзаца → pending
    ])));
const GLOSSARY_HTML = secWrap(4, "Глоссарий терминов",
  sub("Таблица определений",
    tbl(["Термин", "Принятое определение в данной концепции", "Традиционное понимание", "Почему предпочтительнее"], [
      ["Бытие", "Всё сущее как становящееся", "неподвижное у Парменида", "снимает статику"],
      ["Становление", "Переход как основа", "поток у Гераклита", "обобщает"],
    ])));
const CRITIQUE_HTML = secWrap(5, "Критический анализ",
  sub("Слабые места", "<p>Категория «Бытие» перегружена.</p>"));
const SECTION_ORDER = ["sum", "graph", "theses", "glossary", "critique"];

async function makeSynthesis(userId, title) {
  const [s] = await db.insert(syntheses).values({
    userId, seed: "тестовое зерно 5.2", sectionOrder: SECTION_ORDER, status: "ready", title,
    capsuleHtml: "<p>Капсула: Бытие как становление.</p>", synthLevel: "comparative",
  }).returning();
  await db.insert(synthesisLineage).values(["Парменид", "Гераклит"].map((name, i) => ({ synthesisId: s.id, parentType: "philosopher", parentName: name, position: i })));
  const rows = [
    ["sum", 1, "Исполнительное резюме", secWrap(1, "Исполнительное резюме", sub("Цели и метод", "<p>Синтез Бытия и Становления.</p>"))],
    ["graph", 2, "Граф категорий", GRAPH_HTML],
    ["theses", 3, "Тезисы", THESES_HTML],
    ["glossary", 4, "Глоссарий терминов", GLOSSARY_HTML],
    ["critique", 5, "Критический анализ", CRITIQUE_HTML],
  ];
  await db.insert(sections).values(rows.map(([key, sectionNum, title, htmlContent]) => ({ synthesisId: s.id, key, sectionNum, title, htmlContent })));
  await saveGraphToDb(s.id, parseGraphFromHTML(GRAPH_HTML));
  await saveElementsToDb(s.id, "theses", { theses: parseThesesFromHTML(THESES_HTML) });
  await saveElementsToDb(s.id, "glossary", { glossaryTerms: parseGlossaryFromHTML(GLOSSARY_HTML) });
  await db.insert(modeResults).values({ synthesisId: s.id, modeKey: "adversarial", paramValue: "Юм", htmlContent: "<div>возражения Юма</div>" });
  return s;
}
const secHtml = async (sid, key) =>
  (await db.select({ h: sections.htmlContent }).from(sections).where(and(eq(sections.synthesisId, sid), eq(sections.key, key))))[0].h;

/* ══ Процессы ═════════════════════════════════════════════════════════ */
let serverProc, viteProc, browser;
let serverLog = "", viteLog = "";
async function assertPortFree(url, name) {
  try { const r = await fetch(url); if (r.ok) throw new Error(`порт занят чужим ${name} — pkill -9 -f "[t]sx|[v]ite"`); }
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
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${API}/health`)).ok) return; } catch {} await sleep(300); }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-2000));
}
async function startVite() {
  await assertPortFree(UI + "/", "vite");
  viteProc = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort"], {
    cwd: new URL("../client/", import.meta.url).pathname, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  viteProc.stdout.on("data", (d) => (viteLog += d));
  viteProc.stderr.on("data", (d) => (viteLog += d));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(UI + "/")).ok) return; } catch {} await sleep(300); }
  throw new Error("vite не поднялся:\n" + viteLog.slice(-2000));
}
const killGroup = (p) => { if (!p) return; try { process.kill(-p.pid, "SIGKILL"); } catch {} try { p.kill("SIGKILL"); } catch {} };

async function makeUser(tag) {
  const email = `t52-${tag}-${Date.now()}@test.local`;
  const password = "Passw0rd!123";
  let r = await fetch(`${API}/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error("register: " + (await r.text()));
  const id = (await r.json()).user.id;
  r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  return { id, email, password, cookie };
}
const api = async (u, method, path, body) => {
  const r = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", Cookie: u.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};

/* ══ Хелперы браузера ═════════════════════════════════════════════════ */
async function fill(page, sel, value) {
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.click(sel);
  // тройной клик выделяет слово, не всё поле (грабля этого харнесса:
  // «Бытие» → «БытиСущее») — выделяем всё
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type(sel, value);
}
async function setTextarea(page, sel, value) {
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.$eval(sel, (el) => { el.focus(); el.select(); });
  await page.keyboard.press("Backspace");
  await page.type(sel, value);
}
/** Клик по кнопке с текстом (регистронезависимо, капитель) внутри root */
async function clickBtn(page, rootSel, text) {
  const done = await page.evaluate(([root, t]) => {
    const r = root ? document.querySelector(root) : document;
    if (!r) return "no-root";
    const n = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const b = [...r.querySelectorAll("button")].find((x) => n(x.innerText).includes(n(t)));
    if (!b) return "no-btn";
    if (b.disabled) return "disabled";
    b.click(); return "ok";
  }, [rootSel, text]);
  return done;
}
const textOf = (page, sel) => page.$eval(sel, (el) => el.innerText).catch(() => "");
async function waitText(page, sel, frag, timeout = 15000) {
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
const consoleErrors = [];

try {
  await startServer();
  await startVite();
  console.log("Сервер и vite подняты.");

  const A = await makeUser("owner");
  const B = await makeUser("stranger");
  const S = await makeSynthesis(A.id, "Синтез 5.2");
  const sid = S.id;
  const cats0 = await db.select().from(categories).where(eq(categories.synthesisId, sid)).orderBy(asc(categories.position));
  const bytie = cats0.find((c) => c.name === "Бытие");
  ok(!!bytie && cats0.length === 2, "фикстура: 2 категории", J(cats0.map((c) => c.name)));

  /* ══ isOwner (По факту 5.2) ══ */
  console.log("\n■ isOwner в SynthesisFull");
  const fullA = await api(A, "GET", `/syntheses/${sid}`);
  ok(fullA.status === 200 && fullA.json.synthesis.isOwner === true, "владелец: isOwner=true", J(fullA.json?.synthesis?.isOwner));
  ok(!("userId" in (fullA.json.synthesis ?? {})), "SynthesisFull не раскрывает userId");
  const fullB0 = await api(B, "GET", `/syntheses/${sid}`);
  ok(fullB0.status === 403, "чужой приватный → 403");
  await api(A, "PATCH", `/syntheses/${sid}`, { isPublic: true });
  const fullB = await api(B, "GET", `/syntheses/${sid}`);
  ok(fullB.status === 200 && fullB.json.synthesis.isOwner === false, "чужой на публичном: isOwner=false", J(fullB.json?.synthesis?.isOwner));

  /* ══ Браузер ══ */
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
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
    await page.waitForSelector("#sec-theses", { timeout: 20000 });
  };

  /* ══ R2: граф → узел → NodePanel → ✎ → CategoryEditor → имя → impact ══ */
  console.log("\n■ R2: граф → NodePanel → «✎ Редактировать» → CategoryEditor → Сохранить → Анализ влияния");
  await openSynth();
  ok(await clickBtn(page, ".actions-bar", "◈ Граф") === "ok", "кнопка «◈ Граф»");
  await page.waitForSelector(".gm-overlay", { timeout: 15000 });
  ok(await clickBtn(page, ".gm-header", "2D") === "ok", "переключение на 2D");
  await page.waitForSelector(".node-g", { timeout: 15000 });
  await sleep(600);
  await click2dNode(page, "Бытие");
  await page.waitForSelector(".gm-info-panel", { timeout: 10000 });
  const panelText = await textOf(page, ".gm-info-panel");
  ok(has(panelText, "Бытие") && has(panelText, "Редактировать"), "NodePanel открыт, есть «✎ Редактировать»", panelText.slice(0, 120));
  ok(await clickBtn(page, ".gm-info-panel", "Редактировать") === "ok", "клик «✎ Редактировать»");
  await page.waitForSelector(".element-editor-overlay .edit-modal", { timeout: 10000 });
  const modalTitle = await textOf(page, ".element-editor-overlay .edit-modal-title");
  ok(has(modalTitle, "Категория графа") && has(modalTitle, "Бытие"), "модалка редактора категории поверх графа", modalTitle);
  const overlayZ = await page.$eval(".element-editor-overlay", (el) => getComputedStyle(el).zIndex);
  ok(Number(overlayZ) > 9999, `z-index редактора выше .gm-overlay (${overlayZ})`);
  const preview0 = await textOf(page, ".element-preview-table");
  ok(has(preview0, "Бытие") && has(preview0, "онтологическая") && has(preview0, "0.9"), "предпросмотр строки таблицы графа", preview0);
  const saveState0 = await page.$eval(".element-editor-overlay .inline-edit-actions button", (b) => b.disabled);
  ok(saveState0 === true, "«Сохранить» неактивна без правок");
  await fill(page, "#cat-ed-name", "Сущее");
  await page.waitForSelector(".inline-edit-dirty", { timeout: 5000 });
  ok(has(await textOf(page, ".element-preview-table"), "Сущее"), "предпросмотр обновляется по вводу");
  ok(await clickBtn(page, ".element-editor-overlay .inline-edit-actions", "Сохранить") === "ok", "клик «Сохранить»");
  await page.waitForSelector(".element-editor-overlay [data-element-impact]", { timeout: 15000 });
  const impact = await textOf(page, ".element-editor-overlay [data-element-impact]");
  ok(has(impact, "Анализ влияния"), "блок «Анализ влияния»");
  ok(has(impact, "Тезисы") && has(impact, "Глоссарий"), "затронуты разделы «Тезисы», «Глоссарий»", impact.slice(0, 300));
  ok(has(impact, "Критический анализ"), "затронут «Критический анализ»");
  ok(has(impact, "Режим") && has(impact, "Юм"), "затронут результат режима «Юм»");
  ok(has(impact, "Перерисовано в документе") && has(impact, "Таблица категорий"), "htmlSync.rendered показан");
  ok(has(impact, "Автозамена имён"), "после смены имени есть кнопка «Автозамена имён»");
  ok(has(impact, "Перегенерировать затронутые") && has(impact, "Ничего"), "кнопки действий на месте");
  const [catAfter] = await db.select().from(categories).where(eq(categories.id, bytie.id));
  ok(catAfter.name === "Сущее" && catAfter.source === "manual", "БД: категория переименована, source=manual", J(catAfter.name));
  ok((await secHtml(sid, "graph")).includes("<td>Сущее</td>"), "html_content графа перерисован");
  const modalHead = await textOf(page, ".element-editor-overlay .edit-modal-title");
  ok(has(modalHead, "Сущее"), "заголовок модалки — новое имя (элемент обновлён из ответа)");

  /* ══ R5 (здесь же, пока impact открыт): автозамена ══ */
  console.log("\n■ R5: «Автозамена имён» → подтвердить → html_content обновлён");
  ok(await clickBtn(page, ".element-editor-overlay [data-element-impact]", "Автозамена имён") === "ok", "клик «Автозамена имён»");
  await waitText(page, ".element-editor-overlay [data-element-impact]", "Автозамена выполнена");
  const renameText = await textOf(page, ".element-editor-overlay [data-element-impact]");
  ok(has(renameText, "Тезисы") && has(renameText, "Глоссарий") && has(renameText, "Критический анализ"), "отчёт автозамены: затронутые разделы", renameText.slice(-200));
  ok(has(renameText, "тезисов — 2"), "отчёт автозамены: тезисов — 2");
  ok(!(await secHtml(sid, "theses")).includes("Бытие") && (await secHtml(sid, "theses")).includes("Сущее есть становление"), "html_content тезисов: «Бытие» → «Сущее»");
  ok((await secHtml(sid, "critique")).includes("«Сущее»"), "html_content критики переименован");
  const thRows = await db.select().from(theses).where(eq(theses.synthesisId, sid)).orderBy(asc(theses.thesisNum));
  ok(thRows.every((t) => !t.relatedCategories.includes("Бытие")) && thRows[0].relatedCategories.includes("Сущее"), "theses.related_categories переименованы", J(thRows.map((t) => t.relatedCategories)));
  ok(thRows[0].formulation === "Сущее есть становление", "theses.formulation переименована (по факту 5.1 п.8)");
  const renameBtnDisabled = await page.evaluate(() => [...document.querySelectorAll("[data-element-impact] button")].find((b) => b.innerText.toLowerCase().includes("автозамена"))?.disabled);
  ok(renameBtnDisabled === true, "повторная автозамена заблокирована");

  /* ══ R4: история версий (в том же редакторе) ══ */
  console.log("\n■ R4: 3 изменения → история → 3 версии → откат к v1");
  const p2 = await api(A, "PATCH", `/syntheses/${sid}/categories/${bytie.id}`, { centrality: 0.5 });
  const p3 = await api(A, "PATCH", `/syntheses/${sid}/categories/${bytie.id}`, { definition: "Иное определение" });
  ok(p2.status === 200 && p3.status === 200, "ещё два PATCH через API (изменений всего 3 + auto_rename)");
  // Модалка редактора после автозамены — в режиме просмотра; открываем историю
  ok(await clickBtn(page, ".element-editor-overlay", "История версий") === "ok", "клик «◷ История версий»");
  await page.waitForSelector(".element-editor-overlay .version-list .version-item:not(.current)", { timeout: 10000 });
  const items = await page.$$eval(".element-editor-overlay .version-list .version-item", (els) => els.map((e) => ({ cur: e.classList.contains("current"), num: e.querySelector(".version-num")?.innerText, meta: e.querySelector(".version-meta")?.innerText, prev: e.querySelector(".version-preview")?.innerText })));
  const histItems = items.filter((i) => !i.cur);
  ok(items[0]?.cur === true, "первая строка — текущее состояние");
  // Категория: v1 manual (имя), v2 auto_rename? — auto-rename переписывает definition/origin категорий только при упоминании; здесь «Бытие» в definition нет
  ok(histItems.length === 3, `три версии в истории (${histItems.length})`, J(histItems));
  ok(histItems[0].num === "v3" && histItems[2].num === "v1", "порядок DESC v3…v1", J(histItems.map((i) => i.num)));
  ok(has(histItems[2].meta, "правка вручную") && has(histItems[2].prev, "Бытие"), "v1: источник «правка вручную», превью — старое имя");
  // Выбрать v1 → diff → откат
  await page.evaluate(() => { const v1 = [...document.querySelectorAll(".version-item")].find((e) => e.querySelector(".version-num")?.innerText === "v1"); v1?.click(); });
  await page.waitForSelector(".element-editor-overlay .diff", { timeout: 5000 });
  const diffText = await textOf(page, ".element-editor-overlay .diff");
  ok(has(diffText, "Название:") && has(diffText, "Бытие") && has(diffText, "Сущее"), "diff v1 → v2: Название Бытие → Сущее", diffText);
  ok(await clickBtn(page, ".element-editor-overlay", "Откатить к v1") === "ok", "клик «Откатить к v1»");
  await waitText(page, ".element-editor-overlay .edit-modal-title", "Бытие");
  const [catRolled] = await db.select().from(categories).where(eq(categories.id, bytie.id));
  ok(catRolled.name === "Бытие" && catRolled.centrality === 0.9 && catRolled.definition === "То, что есть", "БД: данные v1 восстановлены", J([catRolled.name, catRolled.centrality, catRolled.definition]));
  const vers = await db.select().from(elementVersions).where(and(eq(elementVersions.elementId, bytie.id), eq(elementVersions.elementType, "category"))).orderBy(asc(elementVersions.version));
  ok(vers.length === 4 && vers[3].changeSource === "rollback" && vers[3].data.name === "Сущее", "версия 4 changeSource='rollback' со снимком ДО отката", J(vers.map((v) => [v.version, v.changeSource])));
  await page.waitForSelector(".element-editor-overlay .version-list .version-item:not(.current):nth-child(5)", { timeout: 10000 });
  ok(has(await textOf(page, ".element-editor-overlay [data-element-impact]"), "Анализ влияния"), "после отката — блок влияния (impact+htmlSync как у PATCH)");
  ok((await secHtml(sid, "graph")).includes("<td>Бытие</td>"), "html_content графа перерисован откатом");
  // Закрыть редактор и граф
  await page.click(".element-editor-overlay .edit-modal-footer .action-btn");
  await page.waitForSelector(".element-editor-overlay", { hidden: true, timeout: 5000 });
  await page.click(".gm-btn.close");
  await page.waitForSelector(".gm-overlay", { hidden: true, timeout: 5000 });

  /* ══ R3: inline-редактирование тезиса ══ */
  console.log("\n■ R3: строка сводной таблицы → ✎ → ThesisEditor → формулировка → Сохранить");
  await openSynth();
  const editBtns = await page.$$eval("#sec-theses ~ div button[data-edit-kind='thesis']", (els) => els.length);
  ok(editBtns === 3, `три кнопки ✎ на строках сводной таблицы (${editBtns})`);
  const glBtns = await page.$$eval("button[data-edit-kind='glossary_term']", (els) => els.length);
  ok(glBtns === 2, `две кнопки ✎ в глоссарии (${glBtns})`);
  // hover → кнопка становится видимой
  const rowBox = await page.$eval("button[data-edit-kind='thesis'][data-edit-row='0']", (b) => { const r = b.closest("tr").getBoundingClientRect(); return { x: r.x + 20, y: r.y + r.height / 2 }; });
  await page.mouse.move(rowBox.x, rowBox.y);
  await sleep(250);
  const opacity = await page.$eval("button[data-edit-kind='thesis'][data-edit-row='0']", (b) => getComputedStyle(b).opacity);
  ok(opacity === "1", `✎ появляется по наведению (opacity ${opacity})`);
  await page.click("button[data-edit-kind='thesis'][data-edit-row='0']");
  await page.waitForSelector("#sec-theses ~ .inline-edit-form", { timeout: 10000 });
  const formHead = await textOf(page, "#sec-theses ~ .inline-edit-form .element-editor-head");
  ok(has(formHead, "Тезис №1"), "форма по месту: «Тезис №1»", formHead);
  const formVal = await page.$eval("#th-ed-form", (el) => el.value);
  ok(formVal === "Сущее есть становление", "формулировка предзаполнена из БД (после автозамены)", formVal);
  await setTextarea(page, "#th-ed-form", "Бытие есть чистое становление");
  ok(await clickBtn(page, "#sec-theses ~ .inline-edit-form .inline-edit-actions", "Сохранить") === "ok", "клик «Сохранить»");
  await page.waitForSelector("#sec-theses ~ .inline-edit-form [data-element-impact]", { timeout: 15000 });
  const [th1] = await db.select().from(theses).where(and(eq(theses.synthesisId, sid), eq(theses.thesisNum, 1)));
  ok(th1.formulation === "Бытие есть чистое становление", "БД: формулировка обновлена");
  const thHtml = await secHtml(sid, "theses");
  ok(thHtml.includes("<td>Бытие есть чистое становление</td>"), "html_content: сводная таблица перерисована");
  ok(thHtml.includes("<strong>Бытие есть чистое становление</strong> Потому что так учил Гераклит."), "html_content: абзац тезиса переписан (formulation в <strong>)");
  await waitText(page, "#sec-theses ~ div", "Бытие есть чистое становление");
  ok(true, "страница перечитала раздел (reloadSections)");
  const imp3 = await textOf(page, "#sec-theses ~ .inline-edit-form [data-element-impact]");
  ok(has(imp3, "Перерисовано") && has(imp3, "Сводная таблица"), "htmlSync.rendered — сводная таблица", imp3.slice(0, 200));
  ok(!has(imp3, "Не отражено в документе"), "pending нет — предупреждения нет");
  // Тезис №3 без абзаца: обоснование → pending → предупреждение
  console.log("  · тезис без абзаца: justification → htmlSync.pending → предупреждение");
  ok(await clickBtn(page, "#sec-theses ~ .inline-edit-form", "Ничего") === "ok", "«Ничего» закрывает блок влияния");
  await page.click("#sec-theses ~ .inline-edit-form .element-editor-head .raw-close");
  await page.waitForSelector("#sec-theses ~ .inline-edit-form", { hidden: true, timeout: 5000 });
  await page.click("button[data-edit-kind='thesis'][data-edit-row='2']");
  await page.waitForSelector("#sec-theses ~ .inline-edit-form", { timeout: 10000 });
  ok(has(await textOf(page, "#sec-theses ~ .inline-edit-form .element-editor-head"), "Тезис №3"), "открыт «Тезис №3» (сопоставление по №)");
  await setTextarea(page, "#th-ed-just", "Новое обоснование третьего тезиса");
  await clickBtn(page, "#sec-theses ~ .inline-edit-form .inline-edit-actions", "Сохранить");
  await page.waitForSelector("#sec-theses ~ .inline-edit-form [data-testid='html-sync-pending']", { timeout: 15000 });
  const pend = await textOf(page, "#sec-theses ~ .inline-edit-form [data-testid='html-sync-pending']");
  ok(has(pend, "Не отражено в документе") && has(pend, "обоснование тезиса") && has(pend, "Корпус тезисов") && has(pend, "требует перегенерации"), "предупреждение pending: поле, раздел, «требует перегенерации»", pend);
  const regenEnabled = await page.evaluate(() => !([...document.querySelectorAll("[data-element-impact] button")].find((b) => b.innerText.toLowerCase().includes("перегенерировать"))?.disabled));
  ok(regenEnabled, "«Перегенерировать затронутые» активна при pending (раздел-хозяин добавлен)");
  // «Перегенерировать затронутые» → EditModal с предотметкой
  ok(await clickBtn(page, "#sec-theses ~ .inline-edit-form [data-element-impact]", "Перегенерировать затронутые") === "ok", "клик «Перегенерировать затронутые»");
  await page.waitForSelector(".edit-overlay.visible .edit-modal:not(.element-editor-overlay .edit-modal)", { timeout: 10000 });
  await sleep(300);
  const checked = await page.$$eval(".edit-modal input[type=checkbox]:checked", (els) => els.map((e) => e.id || e.name || e.closest("label")?.innerText || "?"));
  ok(checked.length >= 1, `EditModal открыт с предотмеченными разделами (${checked.length})`, J(checked));
  const editModalText = await textOf(page, ".edit-modal");
  ok(has(editModalText, "Тезисы"), "в EditModal есть раздел «Тезисы»");
  await page.keyboard.press("Escape").catch(() => {});
  await clickBtn(page, ".edit-modal", "Закрыть").catch(() => {});
  await clickBtn(page, ".edit-modal", "Отмена").catch(() => {});

  /* ══ Глоссарий: extraColumns ══ */
  console.log("\n■ Глоссарий: ✎ → GlossaryTermEditor → столбец уровня → Сохранить");
  await openSynth();
  await page.click("button[data-edit-kind='glossary_term'][data-edit-row='1']");
  await page.waitForSelector("#sec-glossary ~ .inline-edit-form", { timeout: 10000 });
  const glTerm = await page.$eval("#gl-ed-term", (el) => el.value);
  ok(glTerm === "Становление", "открыт термин «Становление» (2-я строка)", glTerm);
  const xLabels = await page.$$eval("#sec-glossary ~ .inline-edit-form label[for^='gl-ed-x']", (els) => els.map((e) => e.innerText));
  ok(xLabels.length === 2 && xLabels.join("|").toLowerCase().includes("традиционное понимание"), "динамические столбцы по synth_level", J(xLabels));
  await setTextarea(page, "#gl-ed-x0", "поток у Гераклита и Ницше");
  await clickBtn(page, "#sec-glossary ~ .inline-edit-form .inline-edit-actions", "Сохранить");
  await page.waitForSelector("#sec-glossary ~ .inline-edit-form [data-element-impact]", { timeout: 15000 });
  const [glRow] = await db.select().from(glossaryTerms).where(and(eq(glossaryTerms.synthesisId, sid), eq(glossaryTerms.term, "Становление")));
  ok(Object.values(glRow.extraColumns).includes("поток у Гераклита и Ницше"), "БД: extra_columns обновлены", J(glRow.extraColumns));
  ok((await secHtml(sid, "glossary")).includes("поток у Гераклита и Ницше"), "html_content глоссария перерисован");

  /* ══ Чужой на публичном: ✎ и «Изменить» не рисуются ══ */
  console.log("\n■ Чужой пользователь на публичном синтезе");
  await login(B);
  await openSynth();
  const barB = await textOf(page, ".actions-bar");
  ok(!has(barB, "Изменить") && !has(barB, "Оппонент"), "у чужого нет «✎ Изменить» и режимов (isOwner=false)", barB);
  ok(has(barB, "Граф") && has(barB, "Экспорт"), "чтение и экспорт доступны");
  const editBtnsB = await page.$$eval("button[data-edit-kind]", (els) => els.length);
  ok(editBtnsB === 0, "кнопок ✎ в таблицах нет");
  await clickBtn(page, ".actions-bar", "◈ Граф");
  await page.waitForSelector(".gm-overlay", { timeout: 15000 });
  await clickBtn(page, ".gm-header", "2D");
  await page.waitForSelector(".node-g", { timeout: 15000 });
  await sleep(500);
  await click2dNode(page, "Бытие");
  await page.waitForSelector(".gm-info-panel", { timeout: 10000 });
  ok(!has(await textOf(page, ".gm-info-panel"), "Редактировать"), "в NodePanel чужого нет «✎ Редактировать»");

  const realErrors = consoleErrors.filter((e) => !/favicon|net::ERR_|Failed to load resource/i.test(e));
  ok(realErrors.length === 0, "без ошибок консоли/pageerror", J(realErrors.slice(0, 3)));
} catch (err) {
  failed++;
  fails.push("ИСКЛЮЧЕНИЕ: " + (err?.stack || err));
  console.log("\n✗ ИСКЛЮЧЕНИЕ:", err?.stack || err);
  console.log("server log tail:", serverLog.slice(-1200));
} finally {
  try { await browser?.close(); } catch {}
  killGroup(serverProc); killGroup(viteProc);
  try { await closeRedis(); } catch {}
  try { await closeDb(); } catch {}
}
console.log(`\n══ ИТОГ: ${passed} ✓, ${failed} ✗`);
if (fails.length) { console.log("Провалы:\n - " + fails.join("\n - ")); process.exit(1); }
process.exit(0);
