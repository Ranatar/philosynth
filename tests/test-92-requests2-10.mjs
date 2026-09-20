/**
 * Тестовые запросы R2–R10 беседы 9.2 (ручная правка подраздела) — одним
 * харнессом: живой сервер :3000 + vite :5199 + Chrome 131 + PG/Redis, мок
 * Claude :3892 держит стрим по маркеру SLOW92 (операция под слотом → 409).
 *
 * «Живая концепция» (R4) строится так, как её строит служба: фикстура
 * tests/test-92-fixture.mjs кладётся строками sections, выгружается экспортом
 * 4.2 и заводится импортом 4.3 — гранулярные таблицы наполняют ПАРСЕРЫ 1.4,
 * а не руки (урок 5.1). Тот же круг во второй раз — запрос R3 (экспорт
 * правленого документа собирается, импорт находит те же разделы и подразделы).
 *
 * Перед прогоном: pg_ctlcluster 16 main start; redis-server --daemonize yes
 * --save ''; посевы prompts/configs/taxonomy (режим для слота — из Registry).
 * Запуск из корня:  node tests/test-92-requests2-10.mjs
 *   CHROME_PATH / PUPPETEER_CORE — как у test-91 (Chrome 131, puppeteer-core 23).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import postgres from "postgres";

import { CAPSULE, SECTIONS, SECTION_ORDER } from "./test-92-fixture.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, VITE_PORT = 5199, MOCK_PORT = 3892;
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${VITE_PORT}`;
const CHROME = [process.env.CHROME_PATH, `${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`, "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome"].find((p) => p && existsSync(p));
const sql = postgres(process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth");
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (s, needle) => String(s ?? "").toLowerCase().includes(needle.toLowerCase());

let passed = 0, failed = 0;
const findings = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? " — " + String(extra).slice(0, 400) : ""}`); }
}

/* ── Мок Claude: SLOW92 в промпте → стрим висит (операция под слотом) ── */
const claude = { calls: 0, hanging: [] };
function startClaudeMock() {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      claude.calls++;
      let prompt = "";
      try { prompt = JSON.parse(body).messages?.[0]?.content ?? ""; } catch {}
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (o) => res.write(`data: ${J(o)}\n\n`);
      send({ type: "message_start", message: { usage: { input_tokens: 100 } } });
      send({ type: "content_block_delta", delta: { type: "text_delta", text: "<p>Начало…" } });
      if (/SLOW92/.test(typeof prompt === "string" ? prompt : J(prompt))) { claude.hanging.push(res); return; }
      send({ type: "content_block_delta", delta: { type: "text_delta", text: " конец.</p>" } });
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 20 } });
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
  if (busy) throw new Error(`порт занят чужим ${name} — снимите сирот (09 §4, 8.5)`);
}

/* ── HTTP ── */
async function api(who, method, path, body, raw = false) {
  const headers = {};
  if (who) headers.Cookie = who.cookie;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
  const r = await fetch(BASE + path, { method, headers, body: payload });
  if (raw) return { status: r.status, text: await r.text() };
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function mkUser(tag) {
  const email = `t92-${tag}-${Date.now()}@example.com`;
  await api(null, "POST", "/auth/register", { email, password: "password-92", displayName: `T92 ${tag}` });
  const r = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-92" }) });
  const cookie = r.headers.get("set-cookie").split(";")[0];
  return { email, cookie, id: (await r.json()).user.id };
}
const subPath = (id, key, name) => `/syntheses/${id}/sections/${key}/subsections/${encodeURIComponent(name)}`;
async function insertFixture(user, title, extra = {}) {
  const [syn] = await sql`insert into syntheses (user_id, seed, title, status, section_order, capsule_html, doc_num)
    values (${user.id}, 'зерно 9.2', ${title}, ${extra.status ?? "ready"}, ${sql.json(SECTION_ORDER)}, ${CAPSULE}, 'PS-0092-TEST') returning id`;
  for (const s of SECTIONS)
    await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${syn.id}, ${s.key}, ${s.num}, ${s.title}, ${s.html})`;
  return syn.id;
}
async function exportImport(user, id) {
  const ex = await api(user, "GET", `/syntheses/${id}/export/html`, undefined, true);
  const fd = new FormData();
  fd.append("file", new Blob([ex.text], { type: "text/html" }), "t92.html");
  const im = await api(user, "POST", "/syntheses/import", fd);
  return { exportStatus: ex.status, exportLen: ex.text.length, importStatus: im.status, id: im.json?.id, file: ex.text };
}
const sectionOf = async (user, id, key) => (await api(user, "GET", `/syntheses/${id}/sections/${key}`)).json?.section;
const dbSection = async (id, key) => (await sql`select id, html_content, is_edited from sections where synthesis_id=${id} and key=${key}`)[0];
const versionsOf = (id) => sql`select element_id, element_type, change_source, version, data from element_versions where synthesis_id=${id} order by created_at, version`;

/* ── Браузер ── */
async function openSynth(page, id) {
  await page.goto(`${UI}/synthesis/${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".doc-section", { timeout: 30000 });
}
const pencilsIn = (page, key) => page.evaluate((k) => {
  const anchor = document.getElementById("sec-" + k);
  const body = anchor?.closest(".doc-body");
  return body ? [...body.querySelectorAll("button[data-edit-subsection]")].map((b) => b.getAttribute("data-edit-subsection")) : null;
}, key);
const clickPencil = (page, name) => page.evaluate((n) => {
  const b = [...document.querySelectorAll("button[data-edit-subsection]")].find((x) => x.getAttribute("data-edit-subsection") === n);
  b?.click();
  return !!b;
}, name);
const AREA = "textarea[data-subsection-source]";
async function setArea(page, fn, arg) {
  // нативный сеттер + input: так набранное доходит и до ref хозяина (09 §1, 0.6)
  await page.$eval(AREA, (t, src, a) => {
    const next = new Function("v", "a", `return (${src})(v, a)`)(t.value, a);
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(t, next);
    t.dispatchEvent(new Event("input", { bubbles: true }));
  }, fn.toString(), arg);
}
async function waitArea(page) {
  try { await page.waitForSelector(`${AREA}:not([disabled])`, { timeout: 15000 }); }
  catch (e) {
    const form = await page.evaluate(() => document.querySelector("[data-subsection-editor]")?.textContent ?? "(формы нет)");
    throw new Error(`поле правки не открылось; форма: ${form}`);
  }
}
const clickAction = (page, which) => page.$eval(`button[data-subsection-action="${which}"]`, (b) => b.click());

let browser;
async function main() {
  if (!CHROME) throw new Error("Chrome 131 не найден — задайте CHROME_PATH");
  await assertPortFree(`${BASE}/health`, "сервером");
  await assertPortFree(UI, "vite");
  const mock = await startClaudeMock();
  sp(["--import", "tsx", "index.ts"], ROOT + "server", {
    PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-92", STREAM_RETRY_DELAYS: "50",
  });
  sp([ROOT + "node_modules/vite/bin/vite.js", "--port", String(VITE_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {});
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "vite");

  let puppeteer;
  try { puppeteer = (await import("puppeteer-core")).default; }
  catch {
    const dir = process.env.PUPPETEER_CORE ?? [`${homedir()}/.npm-global`, "/home/claude/.npm-global"].map((p) => `${p}/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer-core`).find((p) => existsSync(p));
    puppeteer = (await import(`${dir}/lib/esm/puppeteer/puppeteer-core.js`)).default;
  }
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  console.log(`  (браузер: ${await browser.version()})`);

  const A = await mkUser("a"), B = await mkUser("b");
  const SRC = await insertFixture(A, "Т92 исходная");
  const first = await exportImport(A, SRC);
  console.log("\n■ Подготовка: живая концепция через экспорт 4.2 → импорт 4.3");
  ok(first.exportStatus === 200 && first.importStatus === 200 && !!first.id, "фикстура выгружена и заведена импортом", J(first).slice(0, 200));
  const LIVE = first.id;
  const n = async (t) => (await sql.unsafe(`select count(*)::int n from ${t} where synthesis_id='${LIVE}'`))[0].n;
  ok((await n("categories")) === 3 && (await n("category_edges")) === 2 && (await n("theses")) === 2 && (await n("glossary_terms")) === 2,
    "гранулярные таблицы наполнены парсерами 1.4 (3 категории, 2 связи, 2 тезиса, 2 термина)");

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const [cn, cv] = A.cookie.split("=");
  await page.setCookie({ name: cn, value: cv, url: UI });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  /* ═══ R2 ═══ */
  console.log("\n■ R2: карандаш → правка → сохранение → новый текст, ⟳, версия section/manual со снимком ДО");
  await openSynth(page, LIVE);
  await page.waitForSelector("button[data-edit-subsection]", { timeout: 20000 });
  const before = await dbSection(LIVE, "sum");
  ok(before.is_edited === false && (await versionsOf(LIVE)).length === 0, "до правки: is_edited=false, версий нет");
  ok(await clickPencil(page, "Цели и метод"), "карандаш у «Цели и метод» есть и нажат");
  await waitArea(page);
  const src = await page.$eval(AREA, (t) => t.value);
  ok(src.includes("<strong>станавление</strong>") && src.includes("<li>первый шаг</li>") && !src.includes("<h4") && !src.includes("data-section"),
    "в поле — разметка содержимого: <strong> и список на месте, <h4> и обёртки нет", src);
  ok(await page.evaluate((s) => document.activeElement?.matches(s), AREA), "фокус в поле");
  ok((await page.$$("button[data-edit-subsection]")).length === 0, "пока форма открыта, прочих карандашей нет");
  ok(await page.evaluate(() => { const f = document.querySelector("[data-subsection-editor]"); return f?.previousElementSibling?.tagName === "H4" && f.parentElement.getAttribute("data-section") === "Цели и метод"; }),
    "форма стоит НА МЕСТЕ подраздела, сразу под его <h4>");
  // Esc отменяет — и ничего не пишет
  await setArea(page, (v) => v.replace("станавление", "ОТМЕНЁННОЕ"));
  await page.focus(AREA); await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("[data-subsection-editor]"), { timeout: 5000 });
  ok(!(await dbSection(LIVE, "sum")).html_content.includes("ОТМЕНЁННОЕ") && (await versionsOf(LIVE)).length === 0, "Esc отменил правку: БД не тронута, версий нет");
  ok(await page.evaluate(() => document.querySelector('[data-section="Цели и метод"]').textContent.includes("станавление")), "после отмены в документе прежний текст");
  // правка и сохранение (Ctrl+Enter)
  await clickPencil(page, "Цели и метод");
  await waitArea(page);
  await setArea(page, (v) => v.replace("станавление", "становление").replace("<li>второй шаг</li>", "<li>второй шаг</li>\n  <li>третий шаг</li>"));
  await page.evaluate(() => { location.hash = "#sec-graph"; }); await sleep(300);
  ok(await page.$eval(AREA, (t) => t.value.includes("третий шаг")), "посторонний ре-рендер (hash-навигация) набранного не стирает");
  await page.focus(AREA);
  await page.keyboard.down("Control"); await page.keyboard.press("Enter"); await page.keyboard.up("Control");
  await page.waitForFunction(() => !document.querySelector("[data-subsection-editor]") && document.querySelector('[data-section="Цели и метод"]')?.textContent.includes("третий шаг"), { timeout: 15000 });
  ok(await page.evaluate(() => { const t = document.querySelector('[data-section="Цели и метод"]').textContent; return t.includes("становление") && !t.includes("станавление"); }), "в документе новый текст");
  const after = await dbSection(LIVE, "sum");
  ok(after.is_edited === true && after.html_content.includes("<strong>становление</strong>") && after.html_content.includes("<li>третий шаг</li>"), "БД: html_content обновлён, is_edited=true");
  const v1 = await versionsOf(LIVE);
  ok(v1.length === 1 && v1[0].element_type === "section" && v1[0].change_source === "manual" && v1[0].element_id === after.id, "element_versions: одна строка section / manual на id раздела", J(v1.map((v) => [v.element_type, v.change_source])));
  ok(v1[0]?.data?.htmlContent === before.html_content && v1[0]?.data?.isEdited === false, "снимок версии — строка раздела ДО правки (html и is_edited)");
  // пометка ⟳: данные — isEdited в списке разделов; показ — карточка EditSectionCard (2.3).
  // У «Резюме» карточки в EditModal нет (паритет renderEditSections исходника), поэтому ⟳
  // в интерфейсе проверяется на разделе graph — в R4, после его правки
  const sums = (await api(A, "GET", `/syntheses/${LIVE}/sections`)).json.sections;
  ok(sums.find((x) => x.key === "sum").isEdited === true && sums.find((x) => x.key === "graph").isEdited === false, "список разделов: isEdited у «Резюме» true, у нетронутого graph — false");

  /* ═══ R3 ═══ */
  console.log("\n■ R3: сохранность обёртки; экспорт собирается, импорт находит те же разделы и подразделы");
  const fixtureSum = SECTIONS.find((s) => s.key === "sum").html;
  ok(after.html_content.includes('<div data-section="Цели и метод"><h4>Цели и метод</h4>'), "обёртка data-section и <h4> на месте, без изменений");
  const names = (h) => [...h.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]);
  ok(J(names(after.html_content)) === J(names(fixtureSum)), "состав и порядок подразделов раздела прежние");
  const otherSub = fixtureSum.slice(fixtureSum.indexOf('<div data-section="Точки напряжения"'), fixtureSum.indexOf('<div data-section="Структура документа"'));
  ok(after.html_content.includes(otherSub.trim()), "соседний подраздел (с callout) побайтно цел");
  await openSynth(page, LIVE);
  await page.waitForSelector("button[data-edit-subsection]", { timeout: 20000 });
  const anchors = await page.evaluate(() => {
    const links = [...document.querySelectorAll('#docTOC a[href^="#subsec-"]')].map((a) => decodeURIComponent(a.getAttribute("href").slice(1)));
    return { links: links.length, missing: links.filter((id) => !document.getElementById(id)) };
  });
  ok(anchors.links >= 15 && anchors.missing.length === 0, `якоря subsec-* целы: все ${anchors.links} ссылок оглавления ведут к существующим якорям`, J(anchors.missing));
  const imp = await api(A, "POST", `/syntheses/${LIVE}/subsection-impact`, { sectionKey: "sum", subsectionName: "Цели и метод" });
  ok(imp.status === 200, "адрес «sum:Цели и метод» по-прежнему находится каскадным анализом (2.1/2.3)", J(imp));
  const second = await exportImport(A, LIVE);
  ok(second.exportStatus === 200 && second.file.includes("третий шаг"), "экспорт HTML (4.2) правленого документа собирается и несёт правку");
  ok(second.importStatus === 200 && !!second.id, "импорт (4.3) получившегося файла проходит");
  const RE = second.id;
  let sameAll = true; const diffs = [];
  for (const key of SECTION_ORDER.filter((k) => k !== "capsule")) {
    const a = await sectionOf(A, LIVE, key), b = await sectionOf(A, RE, key);
    if (!a || !b || J(a.subsections) !== J(b.subsections)) { sameAll = false; diffs.push(key); }
  }
  ok(sameAll, "импорт нашёл те же разделы и те же подразделы", J(diffs));
  ok((await sectionOf(A, RE, "sum")).htmlContent.includes("<li>третий шаг</li>"), "правка доехала через круг экспорт → импорт");

  /* ═══ R4 ═══ */
  console.log("\n■ R4: вычисляемый заслон на живой концепции");
  const gSec = await sectionOf(A, LIVE, "graph");
  ok(J(gSec.lockedSubsections) === J(["Таблица категорий", "Таблица связей", "Топологическая таблица"]), "graph: заперты три таблицы", J(gSec.lockedSubsections));
  ok(J((await sectionOf(A, LIVE, "theses")).lockedSubsections) === J(["Сводная таблица тезисов"]), "theses: заперта только «Сводная таблица тезисов»");
  ok(J((await sectionOf(A, LIVE, "glossary")).lockedSubsections) === J(["Таблица определений"]), "glossary: заперта только «Таблица определений»");
  ok(J((await sectionOf(A, LIVE, "sum")).lockedSubsections) === J([]), "sum: не заперто ничего");
  ok(J(await pencilsIn(page, "graph")) === J(["Методология построения графа", "Топология графа"]), "в интерфейсе graph: карандаши у «Методологии» и «Топологии графа» — и только у них", J(await pencilsIn(page, "graph")));
  ok(J(await pencilsIn(page, "theses")) === J(["Онтологические тезисы"]) && J(await pencilsIn(page, "glossary")) === J(["Новые термины"]), "theses и glossary: карандаш только у прозы");
  const topo = (await api(A, "GET", subPath(LIVE, "graph", "Топология графа"))).json;
  ok(topo.lock === null && J(topo.nested) === J(["Топологическая таблица"]) && !topo.html.includes("<table") && /<!-- подраздел 1: Топологическая таблица/.test(topo.html),
    "«Топология графа»: вложенная таблица в исходник не попала — на её месте строка-ссылка", topo.html);
  const topoPatch = await api(A, "PATCH", subPath(LIVE, "graph", "Топология графа"), { html: topo.html.replace("Кластер один", "Кластер ровно один") });
  ok(topoPatch.status === 200 && topoPatch.json.changed, "«Топология графа» правится", J(topoPatch).slice(0, 300));
  const gAfter = (await dbSection(LIVE, "graph")).html_content;
  const nestedOrig = SECTIONS.find((s) => s.key === "graph").html.match(/<div data-section="Топологическая таблица">[\s\S]*?<\/table><\/div>/)[0];
  ok(gAfter.includes("Кластер ровно один") && gAfter.includes(nestedOrig) && gAfter.indexOf("Кластер ровно один") < gAfter.indexOf(nestedOrig) && gAfter.indexOf(nestedOrig) < gAfter.indexOf("Рефлексивных связей нет"),
    "вложенная «Топологическая таблица» вернулась нетронутой на своё место между абзацами");
  ok((await api(A, "PATCH", subPath(LIVE, "graph", "Методология построения графа"), { html: "<p>Категории выведены из зерна; связи — из напряжений между ними.</p>" })).status === 200, "«Методология построения графа» правится");
  ok(J((await sectionOf(A, LIVE, "graph")).lockedSubsections) === J(gSec.lockedSubsections), "после правок замки те же");
  await openSynth(page, LIVE);
  await page.waitForSelector("button[data-edit-subsection]", { timeout: 20000 });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /✎\s*изменить/i.test(b.textContent))?.click());
  await page.waitForSelector("#editCard-graph .edit-sec-title", { timeout: 15000 });
  ok((await page.$eval("#editCard-graph .edit-sec-title", (e) => e.textContent)).trim().startsWith("⟳"), "у правленого раздела появилась пометка ⟳ в карточке EditSectionCard (2.3)");
  ok(!(await page.$eval("#editCard-glossary .edit-sec-title", (e) => e.textContent)).trim().startsWith("⟳"), "у нетронутого раздела пометки ⟳ нет");
  if (!(await page.$("#editCard-sum")))
    findings.push("НАХОДКА R2: у раздела «Резюме» (sum) карточки в EditModal нет (паритет исходника) — пометку ⟳ после правки его подразделов показать негде; isEdited в данных выставляется.");
  await page.evaluate(() => [...document.querySelectorAll(".edit-overlay button")].find((b) => /закрыть/i.test(b.textContent))?.click());
  await page.waitForFunction(() => !document.querySelector(".edit-overlay"), { timeout: 5000 });
  // довод заслона с обратной стороны: рендер элемента ручную правку прозы НЕ затирает
  const cats = (await api(A, "GET", `/syntheses/${LIVE}/categories`)).json.categories;
  const catPatch = await api(A, "PATCH", `/syntheses/${LIVE}/categories/${cats[0].id}`, { definition: "То, что есть и становится" });
  ok(catPatch.status === 200 && catPatch.json.htmlSync.rendered.length >= 1, "правка категории перерисовала таблицы (5.1)", J(catPatch.json?.htmlSync));
  const gRendered = (await dbSection(LIVE, "graph")).html_content;
  ok(gRendered.includes("То, что есть и становится") && gRendered.includes("Кластер ровно один") && gRendered.includes("из напряжений между ними"), "перерисовка таблицы ручную правку прозы не затёрла");

  /* ═══ R5 ═══ */
  console.log("\n■ R5: critique — восемь прозаических таблиц, не заперт НИ ОДИН подраздел");
  const cSec = await sectionOf(A, LIVE, "critique");
  ok((cSec.htmlContent.match(/<table/g) ?? []).length === 8 && cSec.lockedSubsections.length === 0, "восемь таблиц, lockedSubsections пуст");
  ok((await pencilsIn(page, "critique")).length === 8, "в интерфейсе карандаш у всех восьми подразделов");
  const fin = (await api(A, "GET", subPath(LIVE, "critique", "Итоговая оценка"))).json;
  ok(fin.lock === null && fin.html.includes("\n  <tr>") && fin.html.includes('<span class="risk low">'), "таблица в исходнике — построчно, разметка риска на месте");
  const finPatch = await api(A, "PATCH", subPath(LIVE, "critique", "Итоговая оценка"), { html: fin.html.replace("ответ 8", "ответ восьмой").replace('<table class="doc-table">', "<table>") });
  const cAfter = (await dbSection(LIVE, "critique")).html_content;
  ok(finPatch.status === 200 && cAfter.includes("<td>ответ восьмой</td>") && (cAfter.match(/<table class="doc-table">/g) ?? []).length === 8, "ячейка таблицы правится; class doc-table возвращён сервером (по нему таблицу находит контекст)");

  /* ═══ R6 ═══ */
  console.log("\n■ R6: отказ запертого — 409 SECTION_TABLE_LOCKED с подсказкой; карандаша нет");
  const vBefore = (await versionsOf(LIVE)).length;
  const htmlBefore = (await dbSection(LIVE, "theses")).html_content;
  const lockT = await api(A, "PATCH", subPath(LIVE, "theses", "Сводная таблица тезисов"), { html: "<p>затру таблицу</p>" });
  ok(lockT.status === 409 && lockT.json.code === "SECTION_TABLE_LOCKED" && lockT.json.details?.reason === "table" && lockT.json.details?.table === "theses", "theses → 409 SECTION_TABLE_LOCKED, details.table='theses'", J(lockT));
  ok(has(lockT.json.error, "карандаш") && has(lockT.json.error, "строке"), "отказ говорит, чем править: карандаш в строке таблицы (5.2)", lockT.json.error);
  const lockG = await api(A, "PATCH", subPath(LIVE, "graph", "Таблица связей"), { html: "<p>x</p>" });
  ok(lockG.status === 409 && has(lockG.json.error, "панел") && has(lockG.json.error, "граф"), "graph → 409, подсказка — панель графа (5.4)", lockG.json?.error);
  ok((await api(A, "PATCH", subPath(LIVE, "graph", "Топологическая таблица"), { html: "<p>x</p>" })).status === 409, "вложенная «Топологическая таблица» → 409 и напрямую");
  ok((await dbSection(LIVE, "theses")).html_content === htmlBefore && (await versionsOf(LIVE)).length === vBefore, "отказ ничего не записал: HTML прежний, версий не прибавилось");
  const lockSrc = (await api(A, "GET", subPath(LIVE, "glossary", "Таблица определений"))).json;
  ok(lockSrc.lock?.reason === "table" && has(lockSrc.lock.hint, "карандаш"), "исходник запертого несёт замок с подсказкой");
  const ui6 = await page.evaluate(() => ({
    pencilAtLocked: [...document.querySelectorAll("button[data-edit-subsection]")].some((b) => /таблица/i.test(b.getAttribute("data-edit-subsection")) && !/топология графа/i.test(b.getAttribute("data-edit-subsection"))),
    rowPencils: document.querySelectorAll('button[data-edit-kind="thesis"]').length,
    termPencils: document.querySelectorAll('button[data-edit-kind="glossary_term"]').length,
  }));
  ok(ui6.pencilAtLocked === false, "у запертых подразделов карандаша нет вовсе");
  ok(ui6.rowPencils === 2 && ui6.termPencils === 2, "зато на месте то, чем их править: ✎ в строках таблиц (5.2)", J(ui6));

  /* ═══ R7 ═══ */
  console.log("\n■ R7: капсула — 409 с указанием на /capsule; сам /capsule работает как в 8.4");
  const cap1 = await api(A, "PATCH", subPath(SRC, "capsule", "Капсула"), { html: "<p>x</p>" });
  ok(cap1.status === 409 && cap1.json.code === "SECTION_TABLE_LOCKED" && cap1.json.details?.reason === "capsule" && cap1.json.error.includes("/capsule"), "PATCH подраздела «Капсула» → 409 с указанием на PATCH /:id/capsule", J(cap1));
  const cap2 = await api(A, "PATCH", subPath(LIVE, "capsule", "Капсула"), { html: "<p>x</p>" });
  ok(cap2.status === 409 && cap2.json.details?.reason === "capsule", "после импорта (строки capsule нет) — тот же 409, а не 404");
  ok((await api(A, "PATCH", subPath(LIVE, "sum", "Капсула"), { html: "<p>x</p>" })).status === 409, "имя «Капсула» заперто в любом разделе");
  const newCap = CAPSULE.replace("удерживаемое мерой", "удерживаемое мерой и правкой 9.2");
  const capOk = await api(A, "PATCH", `/syntheses/${SRC}/capsule`, { html: newCap });
  const capRow = (await sql`select capsule_html from syntheses where id=${SRC}`)[0];
  ok(capOk.status === 200 && capRow.capsule_html.includes("правкой 9.2") && (await dbSection(SRC, "capsule")).html_content.includes("правкой 9.2"), "PATCH /capsule работает: capsule_html и строка sections в синхроне (5.1/8.4)");
  await openSynth(page, SRC);
  await page.waitForSelector('[data-testid="capsule-edit"]', { timeout: 15000 });
  ok(!(await page.evaluate(() => [...document.querySelectorAll("button[data-edit-subsection]")].some((b) => b.getAttribute("data-edit-subsection") === "Капсула"))), "в интерфейсе у капсулы карандаша подраздела нет — только свой ✎ в шапке");

  /* ═══ R8 ═══ */
  console.log("\n■ R8: права и состояние");
  const foreign = await api(B, "PATCH", subPath(LIVE, "sum", "Цели и метод"), { html: "<p>чужая правка</p>" });
  ok(foreign.status === 403 && foreign.json.code === "FORBIDDEN", "чужой → 403 FORBIDDEN");
  ok((await api(B, "GET", subPath(LIVE, "sum", "Цели и метод"))).status === 403, "чужой и исходника приватной концепции не получает → 403");
  ok((await api(null, "PATCH", subPath(LIVE, "sum", "Цели и метод"), { html: "<p>x</p>" })).status === 401, "гость → 401");
  ok(!(await dbSection(LIVE, "sum")).html_content.includes("чужая правка"), "чужая правка в БД не попала");
  // чужой смотрит ПУБЛИЧНУЮ концепцию: карандашей нет
  await api(A, "PATCH", `/syntheses/${LIVE}`, { visibility: "full" });
  const ctxB = await browser.createBrowserContext();
  const pageB = await ctxB.newPage();
  const [bn, bv] = B.cookie.split("=");
  await pageB.setCookie({ name: bn, value: bv, url: UI });
  await openSynth(pageB, LIVE);
  await sleep(1500);
  ok((await pageB.$$("button[data-edit-subsection]")).length === 0, "невладельцу публичной концепции карандаши не рисуются");
  ok((await api(B, "PATCH", subPath(LIVE, "sum", "Цели и метод"), { html: "<p>x</p>" })).status === 403, "публичность правом правки не является → 403");
  await ctxB.close();
  await api(A, "PATCH", `/syntheses/${LIVE}`, { visibility: "private" });
  // 404
  const nf = await api(A, "PATCH", subPath(LIVE, "sum", "Нет такого подраздела"), { html: "<p>x</p>" });
  ok(nf.status === 404 && J(nf.json.details?.available) === J(["Цели и метод", "Точки напряжения", "Структура документа"]), "несуществующий подраздел → 404 со списком имеющихся data-section", J(nf));
  ok((await api(A, "PATCH", subPath(LIVE, "graph", "Топология"), { html: "<p>x</p>" })).status === 404, "поиск точный: «Топология» не попадает в «Топология графа» → 404");
  ok((await api(A, "PATCH", subPath(LIVE, "bogus", "x"), { html: "<p>x</p>" })).status === 404, "неизвестный ключ раздела → 404");
  ok((await api(A, "PATCH", subPath(LIVE, "dialogue", "x"), { html: "<p>x</p>" })).status === 404, "раздела нет в документе → 404");
  ok((await api(A, "PATCH", subPath("not-a-uuid", "sum", "x"), { html: "<p>x</p>" })).status === 404, "не-UUID → 404 до PG");
  for (const [method, path] of [["PATCH", `/syntheses/${LIVE}/sections/sum`], ["PUT", `/syntheses/${LIVE}/sections/sum`], ["POST", `/syntheses/${LIVE}/sections/sum`]])
    ok([404, 405].includes((await api(A, method, path, { html: "<p>x</p>", htmlContent: "<p>x</p>" })).status), `маршрута на тело раздела нет: ${method} …/sections/sum`);
  // отказы по разметке
  const bad = async (html) => (await api(A, "PATCH", subPath(LIVE, "sum", "Точки напряжения"), { html })).json;
  ok((await bad("<h4>Новый заголовок</h4><p>x</p>")).details?.problem === "heading", "<h4> в разметке → 400, problem 'heading'");
  ok((await bad('<div data-section="Ещё один"><p>x</p></div>')).details?.problem === "anchor", "data-section в разметке → 400, problem 'anchor'");
  ok((await bad("   ")).details?.problem === "empty", "пустая разметка → 400, problem 'empty'");
  ok((await api(A, "PATCH", subPath(LIVE, "graph", "Топология графа"), { html: "<p>без строки-ссылки</p>" })).json.details?.problem === "placeholder", "пропала строка-ссылка вложенного подраздела → 400, problem 'placeholder'");
  ok((await api(A, "PATCH", subPath(LIVE, "sum", "Точки напряжения"), {})).status === 400, "тело без html → 400");
  // чистка с предупреждением — в интерфейсе
  await openSynth(page, LIVE);
  await page.waitForSelector("button[data-edit-subsection]", { timeout: 20000 });
  await clickPencil(page, "Точки напряжения");
  await waitArea(page);
  await setArea(page, (v) => v + '\n<p onclick="alert(1)">Абзац со <a href="http://x">ссылкой</a>.</p><script>alert(2)</script>');
  await clickAction(page, "save");
  await page.waitForSelector(".subsection-edit-warnings li", { timeout: 15000 });
  const warnText = await page.$eval("[data-subsection-editor]", (e) => e.textContent);
  ok(has(warnText, "<script>") && has(warnText, "<a>"), "после сохранения человек видит, что сервер снял (script, a)", warnText);
  await clickAction(page, "cancel");
  await page.waitForFunction(() => !document.querySelector("[data-subsection-editor]"), { timeout: 5000 });
  const cleaned = (await dbSection(LIVE, "sum")).html_content;
  ok(cleaned.includes("<p>Абзац со ссылкой.</p>") && !/onclick|<script|<a /.test(cleaned) && cleaned.includes('<div class="callout note"><span class="callout-label">'), "в БД: текст сохранён, script/a/onclick сняты, callout документа цел");
  // правится РАЗМЕТКА (решение пользователя в беседе): круг «прочитал → сохранил» ничего не меняет
  const vCount = (await versionsOf(LIVE)).length;
  const same = (await api(A, "GET", subPath(LIVE, "critique", "Возражение 2"))).json;
  const samePatch = await api(A, "PATCH", subPath(LIVE, "critique", "Возражение 2"), { html: same.html });
  ok(samePatch.status === 200 && samePatch.json.changed === false && samePatch.json.version === null && (await versionsOf(LIVE)).length === vCount, "сохранение прочитанного исходника без изменений — не правка: changed=false, версии нет");
  // человек без HTML просто набирает текст — получает абзацы
  await clickPencil(page, "Структура документа");
  await waitArea(page);
  await setArea(page, () => "Первый абзац без тегов, a < b & c.\n\nВторой абзац без тегов.");
  await clickAction(page, "save");
  await page.waitForFunction(() => !document.querySelector("[data-subsection-editor]"), { timeout: 15000 });
  ok((await dbSection(LIVE, "sum")).html_content.includes('<div data-section="Структура документа"><h4>Структура документа</h4><p>Первый абзац без тегов, a &lt; b &amp; c.</p>\n<p>Второй абзац без тегов.</p></div>'), "текст без тегов сервер уложил в абзацы по пустой строке, спецзнаки экранированы");
  // битая разметка обёртку не ломает
  const brokenPatch = await api(A, "PATCH", subPath(LIVE, "sum", "Структура документа"), { html: "<p>незакрытый <strong>жирный<p>второй</p></div></div><ul><li>раз<li>два</ul>" });
  const sumNow = await sectionOf(A, LIVE, "sum");
  ok(brokenPatch.status === 200 && J(sumNow.subsections) === J(["Цели и метод", "Точки напряжения", "Структура документа"]) && sumNow.htmlContent.includes("<li>раз</li>") && sumNow.htmlContent.trimEnd().endsWith("</div></div></div>"), "незакрытые теги и лишние </div> закрыты разбором: подразделы и обёртка раздела целы", sumNow.htmlContent.slice(-300));
  // отказ в интерфейсе: набранное не теряется
  await clickPencil(page, "Точки напряжения");
  await waitArea(page);
  await setArea(page, () => "<h4>Так нельзя</h4><p>но текст терять нельзя тоже</p>\n</textarea><p>и после закрывающего тега поля</p>");
  await clickAction(page, "save");
  await page.waitForSelector('[data-testid="subsection-edit-error"]', { timeout: 15000 });
  ok(has(await page.$eval('[data-testid="subsection-edit-error"]', (e) => e.textContent), "<h5>") && (await page.$eval(AREA, (t) => t.value)).endsWith("</textarea><p>и после закрывающего тега поля</p>") && (await page.$$(AREA)).length === 1, "отказ показан строкой с подсказкой; набранное цело до последнего знака, </textarea> в разметке поле не закрыл");
  await clickAction(page, "cancel");
  // во время генерации
  const gen = await insertFixture(A, "Т92 generating", { status: "generating" });
  await openSynth(page, gen);
  await sleep(2000);
  ok((await page.$$("button[data-edit-subsection]")).length === 0, "status='generating': карандашей в интерфейсе нет");
  const run = await api(A, "POST", `/syntheses/${SRC}/modes/adversarial/run`, { param: "SLOW92" });
  for (let i = 0; i < 60 && claude.hanging.length === 0; i++) await sleep(200);
  ok(run.status === 200 && claude.hanging.length === 1, "операция под слотом запущена, мок держит стрим", J(run));
  const busy = await api(A, "PATCH", subPath(SRC, "sum", "Цели и метод"), { html: "<p>во время генерации</p>" });
  ok(busy.status === 409 && busy.json.code === "GENERATION_IN_PROGRESS", "во время активной операции → 409 GENERATION_IN_PROGRESS", J(busy));
  ok(!(await dbSection(SRC, "sum")).html_content.includes("во время генерации"), "под слотом ничего не записано");
  const idle = await api(A, "PATCH", subPath(gen, "sum", "Цели и метод"), { html: "<p>статус без прогона</p>" });
  ok(idle.status === 200, "status='generating' БЕЗ активной операции 409 не даёт — гейт тот же, что у элементов (факт 8.4 п.8)", J(idle).slice(0, 200));

  /* ═══ R9 ═══ */
  console.log("\n■ R9: история версий — видна ли ручная правка и работает ли откат");
  const sumRow = await dbSection(LIVE, "sum");
  const hist = await api(A, "GET", `/syntheses/${LIVE}/elements/section/${sumRow.id}/versions`);
  ok(hist.status === 200 && hist.json.versions.length >= 2 && hist.json.versions.every((v) => v.changeSource === "manual" && v.elementType === "section"), "СЕРВЕР: ручные правки раздела видны через GET …/elements/section/:id/versions", J(hist.json?.versions?.map((v) => [v.version, v.changeSource])));
  ok(hist.json.versions[0].version > hist.json.versions.at(-1).version, "версии — по убыванию, как у элементов");
  const firstV = hist.json.versions.at(-1);
  const rb = await api(A, "POST", `/syntheses/${LIVE}/elements/section/${sumRow.id}/rollback`, { version: firstV.version });
  const rolled = await dbSection(LIVE, "sum");
  ok(rb.status === 200 && rb.json.version.changeSource === "rollback" && rolled.html_content === firstV.data.htmlContent, "СЕРВЕР: откат к первой версии возвращает HTML раздела до всех правок", J(rb).slice(0, 200));
  ok(rolled.html_content.includes("станавление") && rolled.is_edited === false, "откат вернул и текст, и is_edited из снимка (false)");
  ok(J((await sectionOf(A, LIVE, "sum")).subsections) === J(["Цели и метод", "Точки напряжения", "Структура документа"]), "после отката подразделы на месте");
  await openSynth(page, LIVE);
  await page.waitForSelector("button[data-edit-subsection]", { timeout: 20000 });
  const uiHist = await page.evaluate(() => /история версий/i.test(document.body.textContent));
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /✎\s*изменить/i.test(b.textContent))?.click());
  await page.waitForSelector("#editCard-graph", { timeout: 15000 });
  const uiHistModal = await page.evaluate(() => /история версий/i.test(document.querySelector(".edit-overlay")?.textContent ?? ""));
  if (!uiHist && !uiHistModal) {
    findings.push("НАХОДКА R9: панель VersionHistory (5.2) версии РАЗДЕЛОВ не показывает — входа в историю раздела нет ни в документе, ни в карточке раздела EditModal; версии и откат доступны только по API. Не чинится молча (п.5 первого запроса).");
    ok(true, "ИНТЕРФЕЙС: входа в историю версий раздела НЕТ — записано находкой, не чинится молча");
  } else ok(true, "ИНТЕРФЕЙС: вход в историю версий раздела есть");
  await page.evaluate(() => [...document.querySelectorAll(".edit-overlay button")].find((b) => /закрыть/i.test(b.textContent))?.click());

  /* ═══ R10 ═══ */
  console.log("\n■ R10: css-parity после блока 9.2");
  const parity = spawnSync("python3", ["scripts/checks/css-parity-audit.py"], { cwd: ROOT, encoding: "utf8" });
  const out = parity.stdout ?? "";
  ok(/непокрытых правил 0 из \d+/.test(out), "A: непокрытых правил исходника 0", out.slice(-200));
  ok(/итого правил с расхождениями: 0/.test(out), "B: правил с расхождениями 0");
  ok(/совпадает с блоком <style> исходника/.test(out), "D: CSS выгружаемого документа ≡ исходнику");
  const cBlock = out.slice(out.indexOf("═══ C."), out.indexOf("═══ D."));
  ok(!/subsection-edit|inline-edit/.test(cBlock) && /без правил: 1\b/.test(cBlock) && cBlock.includes("gm-hint"), "C: без правил только предсуществующий gm-hint — классы 9.2 покрыты");
  const formCss = await (async () => {
    await openSynth(page, LIVE);
    await page.waitForSelector("button[data-edit-subsection]", { timeout: 20000 });
    await clickPencil(page, "Цели и метод");
    await waitArea(page);
    return page.evaluate((s) => {
      const t = getComputedStyle(document.querySelector(s)), f = getComputedStyle(document.querySelector("[data-subsection-editor]"));
      return { font: t.fontFamily, radius: t.borderRadius, shadow: f.boxShadow, fRadius: f.borderRadius, left: f.borderLeftWidth };
    }, AREA);
  })();
  ok(/mono/i.test(formCss.font) && formCss.radius === "0px" && formCss.fRadius === "0px" && formCss.shadow === "none" && formCss.left === "3px", "форма в породе кита: моноширинное поле, прямые углы, без теней, синяя полоса .inline-edit-form", J(formCss));

  ok(pageErrors.length === 0, "ошибок страницы за прогон нет", J(pageErrors.slice(0, 3)));

  // уборка
  for (const id of [SRC, LIVE, RE, gen]) await sql`delete from syntheses where id=${id}`;
  for (const res of claude.hanging) { try { res.destroy(); } catch {} }
  mock.closeAllConnections?.(); mock.close();
}

let crashed = null;
try { await main(); }
catch (e) { crashed = e; console.log("\nСБОЙ СЦЕНАРИЯ:", e?.stack ?? e, "\n— хвост лога сервера —\n" + serverLog.slice(-1500)); }
console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗${crashed ? " · сценарий оборван" : ""}`);
for (const f of findings) console.log(f);
try { await Promise.race([browser?.close(), sleep(3000)]); } catch {}
for (const k of kids) { try { process.kill(-k.pid, "SIGKILL"); } catch {} }
try { await Promise.race([sql.end({ timeout: 2 }), sleep(3000)]); } catch {}
process.exit(failed || crashed ? 1 : 0);
