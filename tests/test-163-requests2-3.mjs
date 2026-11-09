/**
 * Тестовые запросы 2–3 беседы 16.3 — ОДНИМ заходом, в браузере на СБОРКЕ
 * клиента (vite build → vite preview :5231) под Chrome 131, живой сервер
 * :3000 с моком Claude (:3963 — перегенерация графа возвращает заданный
 * HTML):
 *   R2 — двумя пользователями: рецензент комментирует категорию, тезис и
 *        подраздел с пометок у места; владелец отвечает и решает ветку
 *        тезиса (у рецензента — свёрнута, фильтр «решённые»); перегенерация
 *        графа на моке с изменённым определением категории → в панели
 *        «относится к прежней версии» с выдержкой «как было», пометка на
 *        месте (новая строка найдена по ключу); скрытый владельцем
 *        комментарий подраздела у рецензента — «скрыто владельцем» без
 *        текста, у владельца — текст с пометкой; гость и чужой на
 *        публичной концепции вкладок и пометок не видят;
 *   R3 — рецензия: три замечания «В мою рецензию» из трёх разных панелей
 *        (категория, тезис, подраздел), страница черновика, публикация
 *        (редакция 1), правка поля → редакция 2, правка замечания →
 *        редакция 3, переход от замечания к месту в документе (панель +
 *        подсветка пометки), отзыв → «отозвана», findings уходят из
 *        сводки, владелец читает отозванную, у автора — «Опубликовать снова».
 * Запуск (≈ 3 мин): node_modules/.bin/tsx tests/test-163-requests2-3.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, readdirSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5231, MOCK_PORT = 3963;
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
const TAG = "t163b-" + Math.random().toString(36).slice(2, 6);
const PW = "password-163";
const FILE = ROOT + "sample/" + readdirSync(ROOT + "sample").find((f) => f.endsWith(".html"));

const SDB = await import("../server/services/section-defs-builder.ts");
const { closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");

/* ── Мок Claude: раздел целиком — заданный HTML (byKey) ─────────────── */
const mock = { calls: 0, picked: [], map: {}, defs: [], byKey: {} };
const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>\n${b}\n</div>`;
const mockSrv = http.createServer((req, res) => {
  let body = ""; req.on("data", (d) => (body += d));
  req.on("end", () => {
    mock.calls++;
    let prompt = "";
    try { const j = JSON.parse(body); const c = j.messages?.[0]?.content; prompt = typeof c === "string" ? c : J(c); } catch {}
    const task = prompt.slice(Math.max(0, prompt.lastIndexOf("ЗАДАНИЕ")));
    const def = mock.defs.find((d) => task.includes(`— ${d.title.toUpperCase()}`));
    mock.picked.push(def ? `(раздел ${def.key})` : "?");
    let text;
    if (def && mock.byKey[def.key]) text = mock.byKey[def.key];
    else {
      const names = def ? (mock.map[def.key] ?? []) : [];
      text = names.length ? names.map((n) => sub(n, `<p>МОК: подраздел «${n}» раздела «${def.key}».</p>`)).join("\n") : "<p>Раздел не узнан моком.</p>";
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 1000 } } });
    for (let i = 0; i < text.length; i += 2000) send({ type: "content_block_delta", delta: { type: "text_delta", text: text.slice(i, i + 2000) } });
    send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2000 } });
    send({ type: "message_stop" }); res.end();
  });
});
await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));

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
async function account(tag, name) {
  const email = `${TAG}-${tag}@example.com`;
  const reg = await call("/auth/register", { body: { email, password: PW, displayName: name } });
  if (reg.status !== 201) throw new Error("регистрация: " + reg.text.slice(0, 200));
  const [u] = await sql`update users set email_verified_at=now(), balance_usd=50 where email=${email} returning id`;
  userIds.push(u.id);
  const lr = await call("/auth/login", { body: { email, password: PW } });
  return { id: u.id, email, cookie: lr.cookie, name };
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
const waitAttr = (page, sel, name, value, ms = 20000) => page.waitForFunction((s, n, v) => document.querySelector(s)?.getAttribute(n) === v, { timeout: ms }, sel, name, value);
const markSel = (address) => `${T("addr-mark")}[data-address="${address.replace(/"/g, '\\"')}"]`;

/** Открыть панель адреса с пометки, набрать текст и нажать кнопку */
async function postFromPanel(page, mark, body, kind, button = "discussion-send") {
  await click(page, mark);
  await waitSel(page, T("discussion-panel"));
  await waitAttr(page, T("discussion-panel"), "data-address", await attr(page, mark, "data-address"));
  await page.waitForFunction(() => !/Загрузка/.test(document.querySelector('[data-testid="discussion-threads"]')?.textContent ?? ""), { timeout: 15000 });
  await typeInto(page, T("discussion-input"), body);
  if (kind) await page.select(T("discussion-kind"), kind);
  await click(page, T(button));
  if (button === "discussion-send") await page.waitForFunction((b) => [...document.querySelectorAll('[data-testid="thread"]')].some((t) => (t.textContent ?? "").includes(b)), { timeout: 15000 }, body.slice(0, 30));
  else await waitSel(page, T("discussion-form-note"));
}
const secHtml = async (id, key) => (await sql`select html_content h from sections where synthesis_id=${id} and key=${key}`)[0]?.h ?? "";
async function armMock(id) {
  const [row] = await sql`select method, synth_level, depth, generation_order, ext_graph_metrics, lang, section_order, seed, context from syntheses where id=${id}`;
  const phils = (await sql`select parent_name from synthesis_lineage where synthesis_id=${id} and parent_type='philosopher' order by position`).map((r) => r.parent_name);
  const p = { seed: row.seed, phil: phils, participants: phils.map((name) => ({ type: "philosopher", name })), sec: row.section_order.filter((k) => k !== "sum"), method: row.method, synthLevel: row.synth_level, depth: row.depth, generationOrder: row.generation_order, extGraphMetrics: row.ext_graph_metrics, ctx: row.context, lang: row.lang };
  mock.map = await SDB.buildSubsectionMap(p);
  mock.defs = await SDB.buildSectionDefs(p);
}
async function regen(owner, id, key) {
  const since = new Date();
  const rg = await call(`/syntheses/${id}/regenerate/${key}`, { body: {}, cookie: owner.cookie });
  if (rg.status !== 200) throw new Error(`regenerate/${key}: ${rg.status} ${rg.text.slice(0, 200)}`);
  for (let i = 0; i < 300; i++) {
    const [g] = await sql`select status from generation_log where synthesis_id=${id} and section_key=${key} and log_type='generation' and created_at > ${since} order by created_at desc limit 1`;
    if (g && g.status !== "streaming") break;
    await sleep(300);
  }
  for (let i = 0; i < 150; i++) { const g = await call(`/syntheses/${id}`, { method: "GET", cookie: owner.cookie }); if (g.json?.synthesis?.status === "ready") return; await sleep(300); }
  throw new Error("синтез не вернулся в ready");
}

let S = null;
try {
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  if (!CHROME) throw new Error("браузер не найден — соберите Chrome 131 по chrome/README.md");
  console.log("■ Сборка клиента (vite build)");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8", env: { ...process.env, VITE_STRIPE_PUBLISHABLE_KEY: "" } });
  ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t163b-preview.log");
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", RATE_LIMIT_MAIL_PER_HOUR: "1000", MAIL_TRANSPORT: "console", BILLING_ENFORCE: "false", NOTIFY_SCAN_INTERVAL_MS: "600000", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-163", STREAM_RETRY_DELAYS: "50" }, "/tmp/t163b-server.log");
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");
  const puppeteer = (await import("puppeteer-core")).default;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
  const ver = await browser.version();
  ok(/131\.0\.6778/.test(ver), `браузер Chrome 131 (${ver})`);

  const owner = await account("owner", "Владелец"), rev = await account("rev", "Рецензент"), str = await account("str", "Чужой");
  const fd = new FormData(); fd.append("file", new Blob([readFileSync(FILE, "utf8")], { type: "text/html" }), `${TAG}.html`);
  const imp = await call("/syntheses/import", { body: fd, cookie: owner.cookie });
  S = imp.json?.id;
  ok(!!S, "импорт образца владельцем", imp.text.slice(0, 200));
  const inv = await call(`/syntheses/${S}/members`, { body: { email: rev.email, role: "reviewer" }, cookie: owner.cookie });
  const acc = await call(`/syntheses/${S}/membership/accept`, { cookie: rev.cookie });
  const vis = await call(`/syntheses/${S}`, { method: "PATCH", body: { visibility: "full" }, cookie: owner.cookie });
  ok(inv.status === 201 && acc.status === 200 && vis.status === 200, "рецензент принят; концепция открыта (visibility=full) гостю и чужому");
  await armMock(S);
  const graph0 = await secHtml(S, "graph");
  const cats = await sql`select id, name, definition from categories where synthesis_id=${S} order by length(definition) desc`;
  const cat = cats.find((c) => c.definition && graph0.includes(c.definition.slice(0, 40))) ?? cats[0];
  ok(!!cat && graph0.includes(cat.definition.slice(0, 40)), `категория «${cat?.name}» с определением в HTML раздела graph (цель перегенерации)`);

  /* ════ R2 ═════════════════════════════════════════════════════════ */
  console.log("\n■ R2: двое в браузере — комментарии с пометок, ответ и решение, перегенерация графа, скрытие, гость/чужой");
  const pr = await newPage(rev);
  await pr.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  await waitSel(pr, T("page-tabs"));
  await waitSel(pr, T("addr-mark"));
  // пометка категории с нужным именем — по заголовку (title начинается с «Категория: имя»)
  const catAddress = await pr.$$eval(T("addr-mark"), (els, name) => els.find((e) => e.dataset.address.startsWith("category:") && (e.getAttribute("title") ?? "").startsWith("Категория: " + name))?.dataset.address ?? null, cat.name);
  ok(!!catAddress, "пометка у строки категории найдена по имени", catAddress);
  const catMark = markSel(catAddress);
  const thMark = `${T("addr-mark")}[data-address^="thesis:"]`;
  const subMark = `${T("addr-mark")}[data-address^="subsection:sum:"]`;
  ok((await exists(pr, thMark)) && (await exists(pr, subMark)), "пометки тезиса и подраздела sum на месте");
  const thAddress = await attr(pr, thMark, "data-address"), subAddress = await attr(pr, subMark, "data-address");
  await postFromPanel(pr, catMark, `Возражение к категории ${TAG}`, "objection");
  ok(/Категория: /.test(await text(pr, T("discussion-title"))) && (await count(pr, T("thread"))) === 1, "рецензент: комментарий к категории из панели пометки");
  await click(pr, T("discussion-close"));
  await postFromPanel(pr, thMark, `Вопрос к тезису ${TAG}`, "question");
  ok(/Тезис: /.test(await text(pr, T("discussion-title"))) && (await count(pr, T("thread"))) === 1, "рецензент: комментарий к тезису");
  await click(pr, T("discussion-close"));
  await postFromPanel(pr, subMark, `Неясность в подразделе ${TAG}`, "unclear");
  ok(/Подраздел: /.test(await text(pr, T("discussion-title"))) && (await count(pr, T("thread"))) === 1, "рецензент: комментарий к подразделу");
  await click(pr, T("discussion-close"));
  for (const [m, label] of [[catMark, "категории"], [markSel(thAddress), "тезиса"], [markSel(subAddress), "подраздела"]]) await waitAttr(pr, m, "data-count", "1");
  ok(true, "счётчики трёх пометок — 1");
  const summary1 = await call(`/syntheses/${S}/discussion/summary`, { method: "GET", cookie: owner.cookie });
  ok(summary1.json.totals.openComments === 3 && summary1.json.byAddress.some((a) => a.kind === "thesis") && summary1.json.byAddress.some((a) => a.kind === "subsection"), "сводка: три открытые ветки по трём видам адресов", summary1.json);

  // владелец: отвечает в ветке тезиса и решает её
  const po = await newPage(owner);
  await po.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  await waitSel(po, markSel(thAddress));
  await click(po, markSel(thAddress));
  await waitSel(po, T("thread"));
  await click(po, T("thread-reply-btn"));
  await typeInto(po, T("thread-reply-input"), "Ответ владельца: уточнение формулировки.");
  await click(po, T("thread-reply-send"));
  await waitSel(po, T("thread-reply"));
  await click(po, T("thread-resolve"));
  await waitAttr(po, T("thread"), "data-status", "resolved");
  ok((await po.$eval(T("thread"), (el) => el.tagName)) === "DETAILS", "владелец ответил и решил ветку тезиса — свёрнута");
  await click(po, T("discussion-close"));
  // у рецензента после перезагрузки: ветка тезиса решена и свёрнута, с ответом; пометка тезиса — 0
  await pr.reload({ waitUntil: "networkidle0" });
  await waitSel(pr, markSel(thAddress));
  await waitAttr(pr, markSel(thAddress), "data-count", "0");
  await click(pr, markSel(thAddress));
  await waitSel(pr, T("thread"));
  ok((await attr(pr, T("thread"), "data-status")) === "resolved" && !(await pr.$eval(T("thread"), (el) => el.open)) && (await count(pr, T("thread-reply"))) === 1 && /Ответ владельца/.test(await text(pr, T("thread"))), "у рецензента ветка тезиса решена, свёрнута, с ответом владельца; счётчик 0");
  await click(pr, T("discussion-close"));
  await click(pr, T("tab-discussion"));
  await waitSel(pr, T("discussion-list"));
  await pr.select(T("filter-status"), "resolved");
  await pr.waitForFunction((s) => document.querySelector(s)?.dataset.count === "1", { timeout: 15000 }, T("discussion-list"));
  ok(/Тезис:/.test(await text(pr, T("thread-jump"))), "вкладка «Обсуждение», фильтр «решённые» — ветка тезиса");
  await pr.select(T("filter-status"), "");
  await click(pr, T("tab-document"));

  // замечание в рецензию из панели категории — ДО перегенерации (станет outdated на странице рецензии в R3)
  await postFromPanel(pr, catMark, `Замечание рецензии к категории ${TAG}`, "objection", "discussion-to-review");
  ok(/добавлено в вашу рецензию/.test(await text(pr, T("discussion-form-note"))), "«В мою рецензию» из панели категории — черновик заведён (до перегенерации)");
  await click(pr, T("discussion-close"));

  // перегенерация графа на моке: определение категории изменено → «прежняя версия» с выдержкой
  const marker = " [ПЕРЕПИСАНО МОКОМ " + TAG + "]";
  mock.byKey.graph = graph0.replace(cat.definition, cat.definition + marker);
  ok(mock.byKey.graph !== graph0, "мок: определение категории в HTML графа изменено");
  await regen(owner, S, "graph");
  const [catA] = await sql`select id, definition from categories where synthesis_id=${S} and name=${cat.name}`;
  ok(catA && catA.id !== cat.id && catA.definition.includes(marker.trim()), "категория пересоздана: новый id, новое определение", { old: cat.id, now: catA?.id });
  await pr.reload({ waitUntil: "networkidle0" });
  await waitSel(pr, catMark);
  ok((await attr(pr, catMark, "data-count")) === "1", "пометка на НОВОЙ строке категории найдена по ключу, счётчик 1");
  await click(pr, catMark);
  await waitSel(pr, T("discussion-excerpt"));
  const excerpt = await text(pr, T("discussion-excerpt"));
  ok((await attr(pr, T("discussion-state"), "data-state")) === "outdated" && /прежней версии/.test(await text(pr, T("discussion-state"))) && /Как было/.test(excerpt) && !excerpt.includes(marker.trim()) && excerpt.includes(cat.definition.slice(0, 30)), "панель: «относится к прежней версии», выдержка «как было» — прежнее определение без текста мока", excerpt.slice(0, 200));
  ok(/прежняя версия/.test(await text(pr, T("thread"))), "в шапке ветки — «прежняя версия»");
  ok((await count(pr, T("discussion-finding"))) === 0, "замечание черновика рядом не показывается (только опубликованные)");
  await click(pr, T("discussion-close"));
  // документ в браузере обновился по WS: определение с текстом мока на странице
  ok(await pr.evaluate((m) => document.body.textContent.includes(m), marker.trim()), "перегенерированный граф виден в документе (текст мока на странице)");

  // владелец скрывает комментарий подраздела
  await po.reload({ waitUntil: "networkidle0" });
  await waitSel(po, markSel(subAddress));
  await click(po, markSel(subAddress));
  await waitSel(po, T("comment-hide"));
  await po.$eval(T("comment-hide"), (el) => el.click());
  await waitSel(po, T("comment-unhide"));
  ok(/скрыто владельцем — видно вам и автору/.test(await text(po, T("thread"))) && (await text(po, T("thread"))).includes(`Неясность в подразделе ${TAG}`), "владелец: комментарий скрыт, текст ему виден с пометкой");
  await click(po, T("discussion-close"));
  // у автора (рецензента) — текст с пометкой; у ЧУЖОГО участника текста нет — проверяем вторым рецензентом
  const rev2 = await account("rev2", "Второй рецензент");
  await call(`/syntheses/${S}/members`, { body: { email: rev2.email, role: "reviewer" }, cookie: owner.cookie });
  await call(`/syntheses/${S}/membership/accept`, { cookie: rev2.cookie });
  const p2 = await newPage(rev2);
  await p2.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  await waitSel(p2, markSel(subAddress));
  ok((await attr(p2, markSel(subAddress), "data-count")) === "0", "скрытая ветка из сводки ушла — пометка подраздела 0");
  await click(p2, markSel(subAddress));
  await waitSel(p2, T("thread"));
  const hiddenText = await text(p2, T("thread"));
  ok(/скрыто владельцем/.test(hiddenText) && !hiddenText.includes(`Неясность в подразделе ${TAG}`) && !(await exists(p2, `${T("thread")} .user-text`)), "у другого участника скрытый комментарий виден как скрытый, без текста");
  await pr.reload({ waitUntil: "networkidle0" });
  await waitSel(pr, markSel(subAddress));
  await click(pr, markSel(subAddress));
  await waitSel(pr, T("thread"));
  ok((await text(pr, T("thread"))).includes(`Неясность в подразделе ${TAG}`) && /скрыто владельцем/.test(await text(pr, T("thread"))), "автору скрытый комментарий виден с текстом и пометкой");
  await click(pr, T("discussion-close"));

  // гость и чужой — вкладок и пометок нет
  const pg = await newPage(null);
  await pg.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  await waitSel(pg, T("view-banner"));
  await waitSel(pg, ".doc-body");
  ok((await attr(pg, T("view-banner"), "data-viewer")) === "guest" && !(await exists(pg, T("page-tabs"))) && !(await exists(pg, T("addr-mark"))) && !(await exists(pg, T("discuss-synthesis"))), "гость: документ виден, вкладок/пометок/кнопки обсуждения нет");
  const ps = await newPage(str);
  await ps.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  await waitSel(ps, T("view-banner"));
  await waitSel(ps, ".doc-body");
  ok((await attr(ps, T("view-banner"), "data-viewer")) === "user" && !(await exists(ps, T("page-tabs"))) && !(await exists(ps, T("addr-mark"))), "чужой зарегистрированный: вкладок и пометок нет");
  const strSummary = await call(`/syntheses/${S}/discussion/summary`, { method: "GET", cookie: str.cookie });
  ok([403, 404].includes(strSummary.status), "чужому и сводка закрыта (403/404)");
  ok(pr.errors.length === 0 && po.errors.length === 0 && p2.errors.length === 0 && pg.errors.length === 0 && ps.errors.length === 0, "R2: страницы без ошибок JS", [...pr.errors, ...po.errors, ...p2.errors, ...pg.errors, ...ps.errors]);

  /* ════ R3 ═════════════════════════════════════════════════════════ */
  console.log("\n■ R3: рецензия — три замечания из трёх панелей, публикация, редакции, переход к месту, отзыв");
  await postFromPanel(pr, markSel(thAddress), `Замечание рецензии к тезису ${TAG}`, "question", "discussion-to-review");
  await click(pr, T("discussion-close"));
  await postFromPanel(pr, markSel(subAddress), `Замечание рецензии к подразделу ${TAG}`, null, "discussion-to-review");
  await click(pr, T("discussion-close"));
  const [draft] = await sql`select id, status from reviews where synthesis_id=${S} and author_id=${rev.id}`;
  const nF = (await sql`select count(*)::int n from review_findings where review_id=${draft?.id}`)[0]?.n;
  ok(draft?.status === "draft" && nF === 3, "один черновик с тремя замечаниями из трёх панелей (категория — до перегенерации, тезис и подраздел — после)", { draft, nF });
  const ownerList = await call(`/syntheses/${S}/reviews`, { method: "GET", cookie: owner.cookie });
  ok(ownerList.json.length === 0, "владельцу черновик не виден");
  // страница черновика
  await click(pr, T("tab-reviews"));
  await waitSel(pr, T("review-link"));
  await click(pr, T("review-link"));
  await waitSel(pr, T("review-page"));
  const kinds = await pr.$$eval(T("review-finding"), (els) => els.map((e) => [e.dataset.state, (e.querySelector('[data-testid="finding-jump"]')?.textContent ?? "").split(":")[0]]));
  ok((await count(pr, T("review-finding"))) === 3 && kinds.map((k) => k[1]).sort().join("|") === "Категория|Подраздел|Тезис" && kinds.find((k) => k[1] === "Категория")[0] === "outdated" && kinds.filter((k) => k[1] !== "Категория").every((k) => k[0] === "current"), "страница черновика: три замечания (категория — outdated после перегенерации, тезис и подраздел — current)", kinds);
  ok((await count(pr, `${T("review-finding")}[data-state="outdated"] ${T("finding-state")}`)) === 1 && /Как было/.test(await text(pr, `${T("review-finding")}[data-state="outdated"]`)), "у устаревшего замечания — состояние и выдержка «как было»");
  await typeInto(pr, T("review-input-title"), `Рецензия ${TAG}`);
  await typeInto(pr, `${T("review-field-summary")} textarea`, "Общая оценка.");
  await typeInto(pr, `${T("review-field-conclusion")} textarea`, "Заключение.");
  await click(pr, T("review-save"));
  await waitSel(pr, T("review-saved"));
  await click(pr, T("review-publish"));
  await waitAttr(pr, T("review-page"), "data-status", "published");
  ok(/редакция 1/.test(await text(pr, T("review-meta"))), "публикация → редакция 1", await text(pr, T("review-meta")));
  const sumPub = await call(`/syntheses/${S}/discussion/summary`, { method: "GET", cookie: owner.cookie });
  ok(sumPub.json.totals.reviews === 1 && sumPub.json.totals.findings === 3, "сводка: reviews 1, findings 3");
  // правка поля опубликованной → редакция 2
  await typeInto(pr, `${T("review-field-summary")} textarea`, " Дополнение после публикации.");
  await click(pr, T("review-save"));
  await waitSel(pr, T("review-saved"));
  await pr.waitForFunction(() => /редакция 2/.test(document.querySelector('[data-testid="review-meta"]')?.textContent ?? ""), { timeout: 15000 });
  ok(/редакция 2/.test(await text(pr, T("review-meta"))) && /опубликована/.test(await text(pr, T("review-status"))), "правка поля опубликованной → редакция 2, статус прежний");
  // правка замечания → редакция 3
  await pr.$$eval(T("finding-edit"), (bs) => bs[0].click());
  await waitSel(pr, `${T("review-finding")} textarea`);
  await typeInto(pr, `${T("review-finding")} textarea`, " (уточнено)");
  await pr.$$eval(`${T("review-finding")} .action-btn.primary`, (bs) => bs[0].click());
  await pr.waitForFunction(() => /редакция 3/.test(document.querySelector('[data-testid="review-meta"]')?.textContent ?? ""), { timeout: 15000 });
  ok(/\(уточнено\)/.test(await text(pr, T("review-findings"))), "правка замечания → редакция 3, текст обновлён");
  const revisions = await sql`select revision, (select count(*) from jsonb_array_elements(findings)) nf from review_revisions where review_id=${draft.id} order by revision`;
  ok(revisions.length === 3 && revisions.map((r) => Number(r.revision)).join(",") === "1,2,3" && revisions.every((r) => Number(r.nf) === 3), "в БД три редакции по три замечания", revisions);
  await pr.reload({ waitUntil: "networkidle0" });
  await waitSel(pr, T("review-revisions"));
  ok((await count(pr, T("review-revision"))) === 3, "страница показывает три редакции");
  // переход от замечания к месту: тезис
  await pr.$$eval(T("finding-jump"), (as) => as.find((a) => /Тезис:/.test(a.textContent ?? "")).click());
  await waitSel(pr, T("discussion-panel"));
  await waitSel(pr, `${T("addr-mark")}.active`);
  ok((await attr(pr, T("discussion-panel"), "data-address")) === thAddress && (await attr(pr, `${T("addr-mark")}.active`, "data-address")) === thAddress && (await count(pr, T("discussion-finding"))) === 1, "переход от замечания тезиса → документ, панель тезиса, пометка подсвечена, замечание рядом");
  await sleep(1800); // прокрутка повторяется, пока страница оседает (SETTLE_MS AddressMarks)
  const pos = await pr.$eval(`${T("addr-mark")}.active`, (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: window.innerHeight, y: window.scrollY }; });
  ok(pos.top >= 0 && pos.bottom <= pos.h, "документ прокручен к месту (пометка в окне)", pos);
  await click(pr, T("discussion-close"));
  // отзыв
  await click(pr, T("tab-reviews"));
  await waitSel(pr, T("review-link"));
  await click(pr, T("review-link"));
  await waitSel(pr, T("review-withdraw"));
  await click(pr, T("review-withdraw"));
  await waitAttr(pr, T("review-page"), "data-status", "withdrawn");
  ok(/отозвана/.test(await text(pr, T("review-status"))) && (await exists(pr, T("review-publish"))) && /Опубликовать снова/.test(await text(pr, T("review-publish"))) && !(await exists(pr, T("review-save"))), "отозвана: статус, «Опубликовать снова», редактора полей нет");
  const sumW = await call(`/syntheses/${S}/discussion/summary`, { method: "GET", cookie: owner.cookie });
  ok(sumW.json.totals.findings === 0 && sumW.json.totals.reviews === 0, "после отзыва findings и reviews в сводке — 0");
  await po.goto(`${UI}/synthesis/${S}/reviews/${draft.id}`, { waitUntil: "networkidle0" });
  await waitSel(pr, T("review-page"));
  await waitSel(po, T("review-page"));
  ok((await attr(po, T("review-page"), "data-status")) === "withdrawn" && (await count(po, T("review-finding"))) === 3 && (await count(po, T("review-revision"))) === 3 && !(await exists(po, T("review-actions"))), "владелец читает отозванную: три замечания, три редакции, без кнопок");
  await po.goto(`${UI}/synthesis/${S}`, { waitUntil: "networkidle0" });
  await waitSel(po, T("page-tabs"));
  await click(po, T("tab-reviews"));
  await waitSel(po, T("review-row"));
  ok((await attr(po, T("review-row"), "data-status")) === "withdrawn" && /отозвана/.test(await text(po, T("review-row"))), "в списке владельца — «отозвана»");
  ok(pr.errors.length === 0 && po.errors.length === 0, "R3: страницы без ошибок JS", [...pr.errors, ...po.errors]);
  ok(mock.picked.filter((p) => p === "(раздел graph)").length === 1, "мок звался на graph однажды", mock.picked);
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch {} }
  mockSrv.close();
  try {
    if (S) await sql`delete from syntheses where id=${S}`;
    for (const id of userIds) await sql`delete from sessions where user_id=${id}`;
    for (const id of userIds) await sql`delete from api_usage where user_id=${id}`; // стоимость перегенерации на моке
    for (const id of userIds) await sql`delete from transactions where user_id=${id}`;
    for (const id of userIds) await sql`delete from syntheses where user_id=${id}`;
    for (const id of userIds) await sql`delete from users where id=${id}`;
    await sql`delete from mail_outbox where to_email like ${TAG + "-%"}`;
  } catch (e) { console.error("уборка:", e); }
  await Promise.race([Promise.all([closeDb(), closeRedis()]), sleep(2000)]);
  await sql.end({ timeout: 2 });
}
console.log(`\nИТОГ test-163 (тестовые запросы 2–3): ${passed} ✓ / ${failed} ✗${fails.length ? "\n  провалы: " + fails.join(" | ") : ""}`);
process.exit(failed ? 1 : 0);
