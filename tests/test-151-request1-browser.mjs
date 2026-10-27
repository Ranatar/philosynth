/**
 * Беседа 15.1 — первый запрос, клиентская часть (п.4) на СБОРКЕ клиента:
 * действия у узла генеалогического древа. Живой сервер :3000 + PG16/Redis +
 * vite build под vite preview :5226 + Chrome 131 (CHROME_PATH). Модель не
 * нужна (документ сеется в БД в состоянии ready).
 *
 *  Б1 у неперекрытого узла-концепции файла верхнего уровня — «Связать с
 *     концепцией…»; панель: совпадения по имени (своя одноимённая), поиск по
 *     подстроке; привязка ВТОРЫМ шагом → узел древа становится связью
 *     (coversFileNode) с кнопкой «Отвязать», синтез и древо перечитаны;
 *  Б2 «Отвязать» вторым шагом → узел снова снимок файла с «Связать…»;
 *  Б3 у родителя без узла файла (связь за пределами дерева) — действия нет;
 *     у философа и на 2-м уровне — нет; у гостя/чужого — нет;
 *  Б4 коды: 409 LINEAGE_GENERATED (DELETE), 409 LINEAGE_NODE_UNAVAILABLE
 *     (GET candidates у философа), 404 у несвязанного, 400 у position: -1.
 *
 * Запуск (≈ 40 с): node_modules/.bin/tsx tests/test-151-request1-browser.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { homedir } from "node:os";
import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5226;
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${UI_PORT}`;
const CHROME = [process.env.CHROME_PATH, `${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`].find((p) => p && existsSync(p));
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (id) => `[data-testid="${id}"]`;
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}
const TAG = Math.random().toString(36).slice(2, 7);

const procs = [];
function sp(args, cwd, env, logFile) {
  const log = openSync(logFile, "w");
  const p = spawn(process.execPath, args, { cwd, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...env } });
  procs.push(p);
  return p;
}
async function isUp(url) { try { return (await fetch(url)).status < 500; } catch { return false; } }
async function waitUp(url, what) { for (let i = 0; i < 120; i++) { if (await isUp(url)) return; await sleep(500); } throw new Error(`${what} не поднялся: ${url}`); }

function client(cookie) {
  const api = async (method, p, body) => {
    const headers = cookie ? { Cookie: cookie } : {};
    let payload;
    if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
    const r = await fetch(BASE + p, { method, headers, body: payload });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  };
  return { api, cookie };
}
const userIds = [];
async function account(tag) {
  const email = `t151-${tag}-${Date.now()}@example.com`, password = "password-151";
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password, displayName: "Проверяющий" }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  userIds.push(u.id);
  return { ...client(cookie), id: u.id };
}
async function seedDoc(userId, title, fileGenealogy = null) {
  const [s] = await sql`insert into syntheses (user_id, seed, title, status, section_order, doc_num, method, synth_level, depth, file_genealogy)
    values (${userId}, ${"зерно 15.1 " + TAG}, ${title}, 'ready', ${sql.json(["sum"])}, ${"T151-" + Math.random().toString(36).slice(2, 7)}, 'dialectical', 'comparative', 'overview', ${fileGenealogy ? sql.json(fileGenealogy) : null}) returning id`;
  await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${s.id}, 'sum', 1, 'Резюме', ${`<div class="doc-section">\n<div class="section-num">§ 1</div>\n<div class="section-title">Резюме</div>\n<div class="doc-content">\n<p>Текст ${TAG}</p>\n</div>\n</div>`})`;
  return s.id;
}

let browser = null, lastPage = null;
async function newPage(who) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("dialog", (d) => void d.accept());
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  lastPage = page;
  return page;
}
const text = (page, sel) => page.$eval(sel, (el) => el.textContent ?? "");
const exists = async (page, sel) => (await page.$(sel)) !== null;
const click = (page, sel) => page.$eval(sel, (el) => el.click());
const waitSel = (page, sel, ms = 20000) => page.waitForSelector(sel, { timeout: ms });
const waitGone = (page, sel, ms = 20000) => page.waitForSelector(sel, { hidden: true, timeout: ms });
async function openDoc(page, id) {
  await page.goto(`${UI}/synthesis/${id}`, { waitUntil: "networkidle0" });
  await waitSel(page, ".doc-section");
  await waitSel(page, ".gen-card");
}
/** Карточки верхнего уровня древа: [{name, link, unlink}] */
const topCards = (page) => page.$$eval(".gen-tree .gen-card", (els) => els.map((el) => ({
  name: (el.querySelector(".gen-card-name")?.textContent ?? "").trim().slice(0, 60),
  fromFile: el.hasAttribute("data-from-file"),
  link: !!el.querySelector('[data-testid="lineage-node-link"]'),
  unlink: !!el.querySelector('[data-testid="lineage-node-unlink"]'),
})));

try {
  if (!CHROME) throw new Error("браузер не найден — задайте CHROME_PATH (Chrome 131)");
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  console.log("■ Сборка клиента (vite build)");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8" });
  ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_API_KEY: "mock-key-151" }, "/tmp/t151-server.log");
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t151-preview.log");
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");
  const puppeteer = (await import("puppeteer-core")).default;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
  console.log(`  (браузер: ${await browser.version()}; клиент — сборка под vite preview)`);

  const A = await account("a");
  const B = await account("b");
  const P1 = await seedDoc(A.id, `Альфа ${TAG}`);
  const P2 = await seedDoc(A.id, `Гамма-подстрока ${TAG}`);
  const PB = await seedDoc(B.id, `Альфа ${TAG}`); // чужая одноимённая — не кандидат
  const PX = await seedDoc(A.id, `Икс ${TAG}`);
  const fileTree = { type: "concept", name: `Дитя ${TAG}`, participants: [
    { type: "concept", name: `«Альфа ${TAG}»`, seed: "зерно альфы", participants: [{ type: "philosopher", name: "Платон" }, { type: "concept", name: `Внук ${TAG}` }] },
    { type: "philosopher", name: "Кант" },
  ] };
  const C = await seedDoc(A.id, `Дитя ${TAG}`, fileTree);
  await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${C}, 'philosopher', 'Кант', 1)`;
  // связь за пределами дерева файла — «сгенерированный» родитель без узла
  await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${C}, 'synthesis', ${PX}, 2)`;

  console.log("\n■ Б1 — «Связать с концепцией…» у узла файла, привязка вторым шагом");
  let page = await newPage(A);
  await openDoc(page, C);
  ok(await exists(page, T("lineage-node-link")), "у узла файла верхнего уровня есть кнопка «Связать с концепцией…»");
  const cardsBefore = await topCards(page);
  ok(cardsBefore.filter((c) => c.link).length === 1 && cardsBefore.filter((c) => c.unlink).length === 0, "ровно одна кнопка «Связать», ни одной «Отвязать» (Кант, Икс, внук — без действий)", cardsBefore);
  await click(page, T("lineage-node-link"));
  await waitSel(page, T("lineage-link-panel"));
  await waitSel(page, T("lineage-node-match"));
  const matches = await page.$$eval(T("lineage-node-match"), (els) => els.map((e) => e.textContent ?? ""));
  ok(matches.length === 1 && matches[0].includes(`Альфа ${TAG}`), "совпадения по имени: одна своя «Альфа», чужая не показана", matches);
  await page.type(T("lineage-link-search"), "гамма");
  await waitSel(page, T("lineage-link-search-results") + " " + T("lineage-node-match"));
  const found = await page.$$eval(T("lineage-link-search-results") + " " + T("lineage-node-match"), (els) => els.map((e) => e.textContent ?? ""));
  ok(found.length === 1 && found[0].includes("Гамма-подстрока"), "поиск по подстроке находит «Гамма-подстрока»", found);
  // первый шаг у «Альфа» → второй шаг «подтвердить»
  await click(page, T("lineage-link-matches") + " " + T("lineage-node-link-pick"));
  await waitSel(page, T("lineage-node-link-confirm"));
  ok(await exists(page, T("lineage-node-link-cancel")), "второй шаг: «подтвердить» / «отмена»");
  await click(page, T("lineage-node-link-confirm"));
  await waitSel(page, T("lineage-node-unlink"));
  await sleep(300);
  const cardsAfter = await topCards(page);
  const rowsC = await sql`select parent_synthesis_id, position from synthesis_lineage where synthesis_id=${C} order by position`;
  ok(cardsAfter.filter((c) => c.unlink).length === 1 && cardsAfter.filter((c) => c.link).length === 0 && rowsC.some((r) => r.parent_synthesis_id === P1 && r.position === 0), "после привязки: узел — связь с «Отвязать», «Связать» нет; строка на позиции 0", { cardsAfter, rowsC });
  ok(!(await exists(page, T("lineage-link-panel"))), "панель кандидатов закрыта после привязки");
  ok(page.errors.length === 0, "без ошибок страницы", page.errors);

  console.log("\n■ Б2 — «Отвязать» вторым шагом → узел снова снимком файла");
  await click(page, T("lineage-node-unlink"));
  await waitSel(page, T("lineage-node-unlink-confirm"));
  ok(await exists(page, T("lineage-node-unlink-cancel")), "второй шаг отвязки: «подтвердить» / «отмена»");
  await click(page, T("lineage-node-unlink-cancel"));
  await sleep(200);
  ok(!(await exists(page, T("lineage-node-unlink-confirm"))) && (await exists(page, T("lineage-node-unlink"))), "отмена второго шага возвращает кнопку «Отвязать»");
  await click(page, T("lineage-node-unlink"));
  await waitSel(page, T("lineage-node-unlink-confirm"));
  await click(page, T("lineage-node-unlink-confirm"));
  await waitSel(page, T("lineage-node-link"));
  const rowsC2 = await sql`select parent_synthesis_id from synthesis_lineage where synthesis_id=${C} and parent_synthesis_id=${P1}`;
  const cardsUn = await topCards(page);
  ok(rowsC2.length === 0 && cardsUn.filter((c) => c.link).length === 1 && cardsUn.filter((c) => c.unlink).length === 0, "после отвязки строки нет, узел файла снова с «Связать»", cardsUn);
  // внук в снимке узла (2-й уровень) — без действий
  ok((await page.$$(T("lineage-node-actions"))).length === 1, "действия только у узлов верхнего уровня (внук без действий)");
  ok(page.errors.length === 0, "без ошибок страницы", page.errors);

  console.log("\n■ Б3 — у гостя и чужого действий нет; родитель без узла файла — без «Отвязать»");
  const pageB = await newPage(B);
  await sql`update syntheses set visibility='full' where id=${C}`;
  await pageB.goto(`${UI}/synthesis/${C}`, { waitUntil: "networkidle0" });
  await waitSel(pageB, ".doc-section");
  await sleep(500);
  ok(!(await exists(pageB, T("lineage-node-actions"))), "чужой зритель публичного документа действий у узлов не видит");
  const pageG = await newPage(null);
  await pageG.goto(`${UI}/synthesis/${C}`, { waitUntil: "networkidle0" });
  await sleep(800);
  ok(!(await exists(pageG, T("lineage-node-actions"))), "гость действий у узлов не видит");

  console.log("\n■ Б4 — коды API");
  const r1 = await A.api("DELETE", `/syntheses/${C}/lineage/link/${PX}`);
  ok(r1.status === 409 && r1.json?.code === "LINEAGE_GENERATED", "DELETE родителя без узла файла → 409 LINEAGE_GENERATED", r1.json);
  const r2 = await A.api("GET", `/syntheses/${C}/lineage/file-node/1/candidates`);
  ok(r2.status === 409 && r2.json?.code === "LINEAGE_NODE_UNAVAILABLE" && r2.json?.details?.reason === "covered", "GET candidates у философа со строкой → 409 LINEAGE_NODE_UNAVAILABLE (covered)", r2.json);
  const r3 = await A.api("DELETE", `/syntheses/${C}/lineage/link/${P2}`);
  ok(r3.status === 404 && r3.json?.code === "NOT_FOUND", "DELETE несвязанного → 404", r3.json);
  const r4 = await A.api("POST", `/syntheses/${C}/lineage/link`, { parentName: "x", parentSynthesisId: P2, position: -1 });
  ok(r4.status === 400 && r4.json?.code === "VALIDATION_ERROR" && r4.json?.details?.position, "POST link с position: -1 → 400 VALIDATION_ERROR", r4.json);
  const r5 = await B.api("GET", `/syntheses/${C}/lineage/file-node/0/candidates`);
  ok(r5.status === 403, "кандидаты узла чужому → 403", r5.status);
  const r6 = await A.api("GET", `/syntheses/${C}/lineage/file-node/0/candidates?q=${encodeURIComponent("гамма")}`);
  ok(r6.status === 200 && r6.json.matches.length === 1 && r6.json.matches[0].id === P1 && r6.json.search.length === 1 && r6.json.search[0].id === P2, "кандидаты владельцу: matches=Альфа, search=Гамма", r6.json);
  const r7 = await A.api("POST", `/syntheses/${C}/lineage/link`, { parentName: "x", parentSynthesisId: P1, position: 0 });
  const r8 = await A.api("POST", `/syntheses/${C}/lineage/link`, { parentName: "x", parentSynthesisId: P1, position: 0 });
  const r9 = await A.api("DELETE", `/syntheses/${C}/lineage/link/${P1}`);
  ok(r7.status === 200 && r8.status === 409 && r8.json?.code === "LINEAGE_EXISTS" && r9.status === 200 && r9.json?.revealed?.position === 0, "link по позиции 200 → повтор 409 LINEAGE_EXISTS → DELETE 200 с revealed", [r7.status, r8.json, r9.json]);
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
  if (lastPage) await lastPage.screenshot({ path: "/tmp/t151-fail.png" }).catch(() => {});
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch {} }
  for (const id of userIds) await sql`delete from syntheses where user_id=${id}`.catch(() => {});
  for (const id of userIds) await sql`delete from users where id=${id}`.catch(() => {});
  await sql.end({ timeout: 2 });
}
console.log(`\nИТОГ test-151 (запрос 1, браузер): ${passed} ✓ / ${failed} ✗${fails.length ? "\n  провалы: " + fails.join(" | ") : ""}`);
process.exit(failed ? 1 : 0);
