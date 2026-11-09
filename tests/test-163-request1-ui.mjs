/**
 * Браузерный прогон беседы 16.3, первый запрос — интерфейс на СБОРКЕ
 * клиента (vite build → vite preview :5231) под Chrome 131 (из кэша
 * puppeteer ~/.cache/puppeteer/chrome/linux-131.0.6778.204, запасной —
 * CHROME_PATH), сервер :3000:
 *   U1 чужой зарегистрированный на публичной (visibility=full) концепции —
 *      вкладок, пометок и кнопки «Обсудить концепцию» нет;
 *   U2 участник (reviewer): вкладки «Документ | Обсуждение | Рецензии» без
 *      «Участники», пометки у места, панель адреса категории: комментарий →
 *      ветка + счётчик пометки, тело раздела НЕ пересобрано (маркер в DOM
 *      цел), ответ, «В мою рецензию» (черновик создан), решить → свёрнуто;
 *   U3 владелец: четыре вкладки, панель с ветками участника, «скрыть»,
 *      блоки «Замечания рецензий» и (при критике) «Встроенная критика»;
 *   U4 вкладка «Обсуждение» участника: список, фильтр статуса, «→ адрес»
 *      открывает панель на документе;
 *   U5 вкладка «Рецензии» → страница рецензии участника: поля, сохранение,
 *      замечание из панели с переходом ?discuss=, публикация; владелец видит
 *      опубликованную, без редактора; переход по замечанию открывает панель.
 * Запуск: npx tsx tests/test-163-request1-ui.mjs   (PG/Redis подняты)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5231;
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${UI_PORT}`;
const CHROME = [`${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`, process.env.CHROME_PATH].find((p) => p && existsSync(p));
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
const TAG = "t163-" + Math.random().toString(36).slice(2, 6);
const PW = "password-163";
const FILE = ROOT + "sample/" + readdirSync(ROOT + "sample").find((f) => f.endsWith(".html"));

const procs = [];
function sp(args, cwd, env, logFile) {
  const log = openSync(logFile, "w");
  const p = spawn(process.execPath, args, { cwd, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...env } });
  procs.push(p);
  return p;
}
async function isUp(url) { try { return (await fetch(url)).status < 500; } catch { return false; } }
async function waitUp(url, what) { for (let i = 0; i < 120; i++) { if (await isUp(url)) return; await sleep(500); } throw new Error(`${what} не поднялся: ${url}`); }
async function call(p, { method = "POST", body, cookie } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const r = await fetch(BASE + p, { method, headers, body: body instanceof FormData ? body : body !== undefined ? J(body) : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] || null };
}
const userIds = [];
async function account(tag) {
  const email = `${TAG}-${tag}@example.com`;
  const reg = await call("/auth/register", { body: { email, password: PW, displayName: "Тест " + tag } });
  if (reg.status !== 201) throw new Error("регистрация: " + reg.text.slice(0, 200));
  const [u] = await sql`update users set email_verified_at=now() where email=${email} returning id`;
  userIds.push(u.id);
  const lr = await call("/auth/login", { body: { email, password: PW } });
  return { id: u.id, email, cookie: lr.cookie };
}
let browser = null;
async function newPage(who) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setUserAgentOverride", { userAgent: await browser.userAgent(), acceptLanguage: "ru-RU,ru" });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("dialog", (d) => void d.accept());
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  return page;
}
const exists = async (page, sel) => (await page.$(sel)) !== null;
const click = (page, sel) => page.$eval(sel, (el) => el.click());
const text = (page, sel) => page.$eval(sel, (el) => el.textContent ?? "");
const attr = (page, sel, name) => page.$eval(sel, (el, n) => el.getAttribute(n), name);
const waitSel = (page, sel, ms = 20000) => page.waitForSelector(sel, { timeout: ms });
const waitGone = (page, sel, ms = 20000) => page.waitForSelector(sel, { hidden: true, timeout: ms });
const count = (page, sel) => page.$$eval(sel, (els) => els.length);
async function typeInto(page, sel, value) { await page.focus(sel); await page.keyboard.type(value); }
const waitCount = (page, sel, n, ms = 20000) => page.waitForFunction((s, k) => document.querySelectorAll(s).length === k, { timeout: ms }, sel, n);

let S = null;
try {
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  if (!CHROME) throw new Error("браузер не найден — соберите Chrome 131 по chrome/README.md");
  console.log("■ Сборка клиента (vite build)");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8", env: { ...process.env, VITE_STRIPE_PUBLISHABLE_KEY: "" } });
  ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t163-preview.log");
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", RATE_LIMIT_MAIL_PER_HOUR: "1000", MAIL_TRANSPORT: "console", BILLING_ENFORCE: "false", NOTIFY_SCAN_INTERVAL_MS: "600000" }, "/tmp/t163-server.log");
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");
  const puppeteer = (await import("puppeteer-core")).default;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
  const ver = await browser.version();
  ok(/131\.0\.6778/.test(ver), `браузер Chrome 131 (${ver})`);

  const owner = await account("owner"), rev = await account("rev"), str = await account("str");
  const fd = new FormData(); fd.append("file", new Blob([readFileSync(FILE, "utf8")], { type: "text/html" }), `${TAG}.html`);
  const imp = await call("/syntheses/import", { body: fd, cookie: owner.cookie });
  S = imp.json?.id;
  ok(!!S, "импорт образца владельцем (POST /syntheses/import)", imp.text.slice(0, 200));
  const inv = await call(`/syntheses/${S}/members`, { body: { email: rev.email, role: "reviewer" }, cookie: owner.cookie });
  const acc = await call(`/syntheses/${S}/membership/accept`, { cookie: rev.cookie });
  const vis = await call(`/syntheses/${S}`, { method: "PATCH", body: { visibility: "full" }, cookie: owner.cookie });
  ok(inv.status === 201 && acc.status === 200 && vis.status === 200, "участник-рецензент принят; концепция открыта (visibility=full) для чужого", { inv: inv.status, acc: acc.status, vis: vis.status });
  const hasCritique = (await sql`select 1 from sections where synthesis_id=${S} and key='critique'`).length > 0;

  /* ── U1: чужой зарегистрированный — ничего из обсуждения ── */
  console.log("\n■ U1: чужой зарегистрированный");
  const ps = await newPage(str);
  await ps.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  await waitSel(ps, T("view-banner"));
  await waitSel(ps, ".doc-body");
  ok(!(await exists(ps, T("page-tabs"))) && !(await exists(ps, T("addr-mark"))) && !(await exists(ps, T("discuss-synthesis"))), "чужому — ни вкладок, ни пометок, ни «Обсудить концепцию»");
  ok(ps.errors.length === 0, "страница чужого без ошибок JS", ps.errors);

  /* ── U2: участник — вкладки, пометки, панель ── */
  console.log("\n■ U2: участник — пометки и панель адреса");
  const pr = await newPage(rev);
  await pr.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  await waitSel(pr, T("page-tabs"));
  ok((await exists(pr, T("tab-discussion"))) && (await exists(pr, T("tab-reviews"))) && !(await exists(pr, T("tab-members"))) && (await exists(pr, T("discuss-synthesis"))), "участнику — «Документ | Обсуждение | Рецензии», без «Участники»; кнопка «Обсудить концепцию»");
  await waitSel(pr, T("addr-mark"));
  const marks0 = await count(pr, T("addr-mark"));
  const kinds = await pr.$$eval(T("addr-mark"), (els) => [...new Set(els.map((e) => e.dataset.address.split(":")[0]))].sort());
  ok(marks0 > 10 && ["category", "edge", "section", "subsection"].every((k) => kinds.includes(k)), `пометки у места: ${marks0} (разделы, подразделы, категории, связи…)`, kinds);
  const allZero = await pr.$$eval(T("addr-mark"), (els) => els.every((e) => e.dataset.count === "0"));
  ok(allZero, "до обсуждения все пометки нулевые (бледные)");
  // маркер в теле раздела: если innerHTML перепишется — пропадёт
  const catMark = `${T("addr-mark")}[data-address^="category:"]`;
  await pr.$eval(catMark, (el) => { const host = el.closest(".doc-body-host"); host.querySelector("div").setAttribute("data-probe", "alive"); });
  const catAddress = await attr(pr, catMark, "data-address");
  await click(pr, catMark);
  await waitSel(pr, T("discussion-panel"));
  ok((await attr(pr, T("discussion-panel"), "data-address")) === catAddress && /Категория: /.test(await text(pr, T("discussion-title"))) && (await attr(pr, T("discussion-state"), "data-state")) === "current", "панель адреса категории: заголовок «Категория: …», состояние current", await text(pr, T("discussion-title")));
  ok(/ещё не говорили/.test(await text(pr, T("discussion-threads"))), "веток нет — подпись «ещё не говорили»");
  await typeInto(pr, T("discussion-input"), "Первое возражение участника.\n\nВторой абзац.");
  await pr.select(T("discussion-kind"), "objection");
  await click(pr, T("discussion-send"));
  await waitSel(pr, T("thread"));
  const paras = await count(pr, `${T("thread")} .user-text p`);
  ok((await count(pr, T("thread"))) === 1 && paras === 2 && /возражение/.test(await text(pr, T("thread"))), "комментарий → одна ветка, два абзаца экранированным текстом, вид «возражение»");
  await pr.waitForFunction((s) => document.querySelector(s)?.dataset.count === "1", { timeout: 15000 }, catMark);
  ok((await attr(pr, catMark, "data-count")) === "1", "счётчик пометки стал 1");
  ok((await pr.$eval(".doc-body-host div[data-probe]", (el) => el.getAttribute("data-probe"))) === "alive", "тело раздела НЕ пересобрано: маркер в DOM цел (ссылка { __html } прежняя)");
  ok((await exists(pr, `${T("discussion-panel")} [data-testid="discussion-findings"]`)) && !(await exists(pr, T("discussion-critique"))), "рядом — блок «Замечания рецензий»; критики участнику нет (владельческий маршрут)");
  // ответ
  await click(pr, T("thread-reply-btn"));
  await typeInto(pr, T("thread-reply-input"), "И ответ самому себе.");
  await click(pr, T("thread-reply-send"));
  await waitSel(pr, T("thread-reply"));
  ok((await count(pr, T("thread-reply"))) === 1, "ответ в ветке");
  // в мою рецензию
  await typeInto(pr, T("discussion-input"), "Замечание в рецензию.");
  await click(pr, T("discussion-to-review"));
  await waitSel(pr, T("discussion-form-note"));
  ok(/добавлено в вашу рецензию/.test(await text(pr, T("discussion-form-note"))), "«В мою рецензию» → черновик создан, замечание добавлено", await text(pr, T("discussion-form-note")));
  const [draftRow] = await sql`select id, status from reviews where synthesis_id=${S} and author_id=${rev.id}`;
  ok(draftRow?.status === "draft" && (await sql`select 1 from review_findings where review_id=${draftRow.id}`).length === 1, "в БД — черновик участника с одним замечанием");
  // решить → свёрнуто
  await click(pr, T("thread-resolve"));
  await pr.waitForFunction((s) => document.querySelector(s)?.dataset.status === "resolved", { timeout: 15000 }, T("thread"));
  ok((await pr.$eval(T("thread"), (el) => el.tagName)) === "DETAILS" && !(await pr.$eval(T("thread"), (el) => el.open)), "решённая ветка — свёрнутый <details>");
  await pr.waitForFunction((s) => document.querySelector(s)?.dataset.count === "0", { timeout: 15000 }, catMark);
  ok((await attr(pr, catMark, "data-count")) === "0", "после решения счётчик пометки — 0");
  await click(pr, T("thread-reopen"));
  await pr.waitForFunction((s) => document.querySelector(s)?.dataset.status === "open", { timeout: 15000 }, T("thread"));
  ok(true, "переоткрыть — ветка снова открыта");
  // вторая ветка на связи — для вкладки
  await click(pr, T("discussion-close"));
  await waitGone(pr, T("discussion-panel"));
  const edgeMark = `${T("addr-mark")}[data-address^="edge:"]`;
  await click(pr, edgeMark);
  await waitSel(pr, T("discussion-panel"));
  ok(/Связь: .+ → /.test(await text(pr, T("discussion-title"))), "панель связи: «Связь: источник → цель»", await text(pr, T("discussion-title")));
  await typeInto(pr, T("discussion-input"), "Вопрос о связи.");
  await pr.select(T("discussion-kind"), "question");
  await click(pr, T("discussion-send"));
  await waitSel(pr, T("thread"));
  ok(pr.errors.length === 0, "страница участника без ошибок JS", pr.errors);

  /* ── U3: владелец ── */
  console.log("\n■ U3: владелец — панель, скрытие, рядом");
  const po = await newPage(owner);
  await po.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  await waitSel(po, T("page-tabs"));
  ok((await exists(po, T("tab-discussion"))) && (await exists(po, T("tab-reviews"))) && (await exists(po, T("tab-members"))), "владельцу — четыре вкладки");
  await waitSel(po, `${T("addr-mark")}[data-count="1"]`);
  await click(po, catMark);
  await waitSel(po, T("thread"));
  ok((await count(po, T("thread"))) === 1 && (await count(po, T("thread-reply"))) === 1 && (await exists(po, T("comment-hide"))), "владелец видит ветку участника с ответом и кнопку «скрыть»");
  ok(hasCritique ? await exists(po, T("discussion-critique")) : !(await exists(po, T("discussion-critique"))), hasCritique ? "блок «Встроенная критика» рядом (образец с критикой)" : "критики в образце нет — блока нет");
  await po.$eval(T("comment-hide"), (el) => el.click());
  await po.waitForFunction(() => /скрыто владельцем/.test(document.querySelector('[data-testid="thread"]')?.textContent ?? ""), { timeout: 15000 });
  ok(await exists(po, T("comment-unhide")), "скрыто — пометка и «показать»");
  await po.$eval(T("comment-unhide"), (el) => el.click());
  await waitSel(po, T("comment-hide"));
  ok(po.errors.length === 0, "страница владельца без ошибок JS", po.errors);

  /* ── U4: вкладка «Обсуждение» ── */
  console.log("\n■ U4: вкладка «Обсуждение» участника");
  await click(pr, T("discussion-close"));
  await click(pr, T("tab-discussion"));
  await waitSel(pr, T("discussion-list"));
  await pr.waitForFunction((s) => document.querySelector(s)?.dataset.count === "2", { timeout: 15000 }, T("discussion-list"));
  ok((await count(pr, `${T("discussion-list")} ${T("thread")}`)) === 2 && (await count(pr, T("thread-jump"))) === 2, "две ветки с адресами");
  await pr.select(T("filter-kind"), "question");
  await pr.waitForFunction((s) => document.querySelector(s)?.dataset.count === "1", { timeout: 15000 }, T("discussion-list"));
  ok(/Связь:/.test(await text(pr, T("thread-jump"))), "фильтр по виду «вопрос» оставил ветку связи");
  await pr.select(T("filter-kind"), "");
  await pr.select(T("filter-status"), "resolved");
  await waitSel(pr, T("discussion-empty"));
  ok(/ни одна ветка/.test(await text(pr, T("discussion-empty"))), "фильтр «решённые» — пусто с подписью");
  await pr.select(T("filter-status"), "");
  const addrOpts = await pr.$$eval(`${T("filter-address")} option`, (os) => os.length);
  ok(addrOpts === 3, "фильтр адреса — два адреса из веток");
  await pr.$$eval(T("thread-jump"), (bs) => bs.find((b) => /Категория:/.test(b.textContent ?? "")).click());
  await waitSel(pr, T("discussion-panel"));
  await waitSel(pr, `${T("addr-mark")}.active`);
  ok((await attr(pr, T("discussion-panel"), "data-address")) === catAddress && (await exists(pr, ".doc-body")) && (await attr(pr, `${T("addr-mark")}.active`, "data-address")) === catAddress, "«→ адрес» открыл документ, панель категории и подсветил пометку");

  /* ── U5: рецензии ── */
  console.log("\n■ U5: вкладка «Рецензии» и страница рецензии");
  await click(pr, T("discussion-close"));
  await click(pr, T("tab-reviews"));
  await waitSel(pr, T("reviews-list"));
  ok((await count(pr, T("review-row"))) === 1 && (await attr(pr, T("review-row"), "data-status")) === "draft" && /Продолжить мой черновик/.test(await text(pr, T("review-start"))), "в списке — мой черновик; кнопка «Продолжить мой черновик»");
  await click(pr, T("review-link"));
  await waitSel(pr, T("review-page"));
  ok(pr.url().includes(`/synthesis/${S}/reviews/${draftRow.id}`) && (await attr(pr, T("review-page"), "data-status")) === "draft" && (await count(pr, T("review-finding"))) === 1 && /Категория:/.test(await text(pr, T("finding-jump"))), "страница черновика: замечание из панели с адресом категории");
  ok((await attr(pr, T("finding-jump"), "href"))?.includes(`/synthesis/${S}?discuss=category%3A`), "ссылка замечания ведёт на ?discuss=category:…", await attr(pr, T("finding-jump"), "href"));
  await typeInto(pr, T("review-input-title"), `Рецензия ${TAG}`);
  await typeInto(pr, `${T("review-field-summary")} textarea`, "Общая оценка.\n\nВторой абзац.");
  await click(pr, T("review-save"));
  await waitSel(pr, T("review-saved"));
  ok(/Рецензия t163/.test(await text(pr, T("review-title"))), "поля сохранены, заголовок обновился", await text(pr, T("review-title")));
  await click(pr, T("review-publish"));
  await pr.waitForFunction((s) => document.querySelector(s)?.dataset.status === "published", { timeout: 15000 }, T("review-page"));
  ok(/опубликована/.test(await text(pr, T("review-status"))) && (await exists(pr, T("review-withdraw"))) && !(await exists(pr, T("review-delete"))), "опубликована: статус, «Отозвать», без «Удалить черновик»");
  // назад — вкладка рецензий с published; пометка категории — 2 (ветка + замечание)
  await click(pr, T("review-back"));
  await waitSel(pr, T("page-tabs"));
  await pr.waitForFunction((s) => document.querySelector(s)?.dataset.count === "2", { timeout: 15000 }, catMark);
  ok((await attr(pr, catMark, "data-count")) === "2", "пометка категории — 2 (открытая ветка + замечание рецензии)");
  // владелец: рецензия опубликована, читает без редактора; переход по замечанию
  await po.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  await waitSel(po, T("page-tabs"));
  await click(po, T("tab-reviews"));
  await waitSel(po, T("review-row"));
  ok((await attr(po, T("review-row"), "data-status")) === "published" && /Начать рецензию/.test(await text(po, T("review-start"))), "владелец видит опубликованную рецензию; своего черновика нет");
  await click(po, T("review-link"));
  await waitSel(po, T("review-page"));
  ok(!(await exists(po, T("review-save"))) && !(await exists(po, T("review-actions"))) && (await count(po, `${T("review-field-summary")} .user-text p`)) === 2 && (await exists(po, T("review-revisions"))), "владельцу — чтение: без редактора и кнопок, два абзаца, редакции");
  await click(po, T("finding-jump"));
  await waitSel(po, T("discussion-panel"));
  await waitSel(po, T("discussion-finding")); // рецензии грузятся отдельным запросом после сводки
  ok((await attr(po, T("discussion-panel"), "data-address")) === catAddress && (await count(po, T("discussion-finding"))) === 1, "переход по замечанию → документ, панель категории, замечание рядом");
  ok(pr.errors.length === 0 && po.errors.length === 0, "страницы без ошибок JS", [...pr.errors, ...po.errors]);
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch {} }
  try {
    if (S) await sql`delete from syntheses where id=${S}`;
    for (const id of userIds) await sql`delete from users where id=${id}`;
    await sql`delete from mail_outbox where to_email like ${TAG + "-%"}`;
  } catch (e) { console.error("уборка:", e); }
  await sql.end({ timeout: 2 });
}
console.log(`\nИТОГ test-163 (первый запрос, интерфейс): ${passed} ✓ / ${failed} ✗${fails.length ? "\n  провалы: " + fails.join(" | ") : ""}`);
process.exit(failed ? 1 : 0);
