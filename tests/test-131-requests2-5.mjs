/**
 * test-131-requests2-5 — тестовые запросы 2–5 беседы 13.1 (Д-63 stored XSS, Д-64 полнотекстовая правка).
 * Живой сервер :3000 + PG16/Redis + мок Claude :3928 + СБОРКА клиента (vite preview :5226), Chrome 131.
 *
 *   R2  Д-63 живьём: PATCH капсулы, импорт файла и ОТВЕТ МОКА Claude (режим «adversarial») с
 *       <img onerror>, <script>, <a javascript:>, атрибуты on*, style → в БД их нет; предупреждение чистки — в
 *       parseWarnings генлога режима; страница с «отравленной» строкой (как до 13.1, вставлена SQL)
 *       открывается, document.title не меняется, CSP гасит встроенный обработчик; скрипт чистки на
 *       этой записи: --dry видит, запись очищена, отчёт верен; ответы сервера несут CSP.
 *   R3  Сужение санитайзера: b/i → strong/em; sup, blockquote, br — текст остался, тегов нет; выноски и
 *       метки риска с разрешёнными классами — как есть; с чужим классом — класс снят.
 *   R4  Редактор (сборка, Chrome 131): КАЖДАЯ из 13 кнопок панели даёт свой тег; вставка из буфера с
 *       b/i/span/style → strong/em/текст; правка ячейки таблицы и «+ строка»; плашка вложенного
 *       подраздела не удаляется; «Разметка» — поле на всю ширину с переносом; сохранение → содержимое
 *       подраздела в БД ≡ тому, что было видно в редакторе (зеркало).
 *   R5  Живой файл одностраничника (sample/): правка подраздела с таблицей и подраздела с выноской
 *       проходит без потерь разметки (число таблиц, строк, выносок, меток — прежнее, текст — новый);
 *       запертые таблицы заперты (карандаша нет, PATCH → 409 SECTION_TABLE_LOCKED).
 *
 * Запуск из корня:  node_modules/.bin/tsx tests/test-131-requests2-5.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, readdirSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5226, MOCK_PORT = 3928;
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${UI_PORT}`;
const CHROME = [process.env.CHROME_PATH, `${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`].find((p) => p && existsSync(p));
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}
const TAG = Math.random().toString(36).slice(2, 8);
const POISON = `<img src=x onerror="document.title='pwned'"><script>document.title='pwned2'</script><a href="javascript:alert(1)">ссылка</a><p onclick="x()" style="color:red">стиль</p>`;
const DIRTY_RE = /onerror|onclick|<img|<script|javascript:|style=/;

const HP = await import("../server/utils/html-parser.ts");
const DM = await import("@philosynth/shared/constants/doc-markup");

const procs = [];
function sp(args, cwd, env, logFile) {
  const log = openSync(logFile, "w");
  const p = spawn(process.execPath, args, { cwd, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...env } });
  procs.push(p);
  return p;
}
async function isUp(url) { try { return (await fetch(url)).status < 500; } catch { return false; } }
async function waitUp(url, what) { for (let i = 0; i < 120; i++) { if (await isUp(url)) return; await sleep(500); } throw new Error(`${what} не поднялся: ${url}`); }

/* Мок Claude: любой запрос → абзац с ядом (режим «adversarial» примет что угодно) */
const mock = { calls: 0 };
const mockSrv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    mock.calls++;
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 10 } } });
    send({ type: "content_block_delta", delta: { type: "text_delta", text: `<p>Ответ мока <b>жирный</b> <i>курсив</i> ${POISON}</p><ul><li>пункт</li></ul>` } });
    send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 10 } });
    send({ type: "message_stop" });
    res.end();
  });
});

function client(cookie) {
  const api = async (method, p, body) => {
    const headers = { Cookie: cookie };
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
    const r = await fetch(BASE + p, { method, headers, body: payload });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text, headers: r.headers };
  };
  return { api, cookie };
}
async function account(tag) {
  const email = `t131b-${tag}-${Date.now()}@example.com`, password = "password-131";
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  return { ...client(cookie), email, id: u.id };
}
const ids = [];
const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>\n${b}\n</div>`;
const wrap = (num, title, b) => `<div class="doc-section">\n<div class="section-num">§ ${num}</div>\n<div class="section-title">${title}</div>\n<div class="doc-content">\n${b}\n</div>\n</div>`;
const CAPSULE = (t) => `<div class="doc-section"><div class="doc-content"><p>${t}</p></div></div>`;
async function seedDoc(userId, { title, order, sections, capsule = "" }) {
  const [s] = await sql`insert into syntheses (user_id, seed, title, status, section_order, doc_num, capsule_html, method, synth_level, depth)
    values (${userId}, ${"зерно 13.1 " + TAG}, ${title}, 'ready', ${sql.json(order)}, ${"T131-" + Math.random().toString(36).slice(2, 7)}, ${capsule}, 'dialectical', 'comparative', 'overview') returning id`;
  ids.push(s.id);
  for (const x of sections) await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${s.id}, ${x.key}, ${x.num}, ${x.title}, ${x.html})`;
  await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${s.id}, 'philosopher', 'Кант', 0)`;
  return s.id;
}
const secHtml = async (id, key) => (await sql`select html_content h from sections where synthesis_id=${id} and key=${key}`)[0]?.h ?? null;
const subUrl = (id, key, name) => `/syntheses/${id}/sections/${key}/subsections/${encodeURIComponent(name)}`;
const norm = (s) => s.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();

let browser = null;
async function newPage(who) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.csp = [];
  page.on("console", (m) => { if (/Content Security Policy/.test(m.text())) page.csp.push(m.text()); });
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setUserAgentOverride", { userAgent: await browser.userAgent(), acceptLanguage: "ru-RU,ru" });
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  return page;
}
const click = (page, sel) => page.$eval(sel, (el) => el.click());
const waitSel = (page, sel, ms = 20000) => page.waitForSelector(sel, { timeout: ms });
const BODY = "[data-subsection-editor-body]", AREA = "textarea[data-subsection-source]";
const caretEnd = (page) => page.evaluate((s) => { const b = document.querySelector(s); b.focus(); const r = document.createRange(); r.selectNodeContents(b); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }, BODY);
const caretIn = (page, sel, atEnd = true) => page.evaluate((s, e) => { const n = document.querySelector(s); const r = document.createRange(); r.selectNodeContents(n); r.collapse(!e); const x = getSelection(); x.removeAllRanges(); x.addRange(r); }, sel, atEnd);
const mirror = (page) => page.$eval(AREA, (a) => a.value);
async function openEditor(page, name) {
  await click(page, `button[data-edit-subsection="${name}"]`);
  await page.waitForFunction((s) => { const b = document.querySelector(s); return !!b && b.getAttribute("contenteditable") === "true"; }, { timeout: 20000 }, BODY);
  await sleep(150);
}
async function saveEditor(page) {
  await caretEnd(page);
  await page.keyboard.down("Control"); await page.keyboard.press("Enter"); await page.keyboard.up("Control");
  try {
    await page.waitForFunction(() => { const f = document.querySelector("[data-subsection-editor]"); return !f || /Сохранено|не принята|Ошибка/.test(f.textContent ?? ""); }, { timeout: 20000 });
  } catch (e) { console.log("  [debug] форма: " + J(await page.evaluate(() => document.querySelector("[data-subsection-editor]")?.innerText.slice(0, 500)))); throw e; }
  const err = await page.evaluate(() => document.querySelector('[data-testid="subsection-edit-error"]')?.textContent ?? null);
  if (await page.$('button[data-subsection-action="cancel"]')) await click(page, 'button[data-subsection-action="cancel"]');
  await page.waitForFunction(() => !document.querySelector("[data-subsection-editor]"), { timeout: 10000 });
  return err;
}
const openDoc = async (page, id) => { await page.goto(`${UI}/synthesis/${id}`, { waitUntil: "networkidle0" }); await waitSel(page, ".doc-section"); };

/* ══ Прогон ═════════════════════════════════════════════════════════════ */
try {
  if (!CHROME) throw new Error("браузер не найден — задайте CHROME_PATH (Chrome 131)");
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));
  console.log("■ Сборка клиента (vite build)");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8" });
  ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-131", STREAM_RETRY_DELAYS: "50", BILLING_ENFORCE: "false", API_KEY_ENCRYPTION_SECRET: "t131-" + "s".repeat(40), CLIENT_ORIGIN: UI }, "/tmp/t131b-server.log");
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t131b-preview.log");
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");
  const puppeteer = (await import("puppeteer-core")).default;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
  console.log(`  (браузер: ${await browser.version()}; клиент — сборка под vite preview)`);
  const A = await account("a");

  /* ═══ R2 ═══ */
  console.log("\n■ R2: Д-63 живьём — PATCH капсулы, импорт, ответ мока, страница с отравленной строкой, скрипт, CSP");
  const D = await seedDoc(A.id, { title: "Синтез " + TAG, order: ["sum", "capsule"], capsule: CAPSULE("Капсула."), sections: [
    { key: "sum", num: 1, title: "Исполнительное резюме", html: wrap(1, "Исполнительное резюме", sub("Цели и метод", "<p>Текст.</p>")) },
    { key: "capsule", num: 2, title: "Капсула концепции", html: CAPSULE("Капсула.") },
  ] });
  {
    const r = await A.api("PATCH", `/syntheses/${D}/capsule`, { html: `<div class="doc-section"><div class="doc-content"><p>Капсула <b>рукой</b> ${POISON}</p></div></div>` });
    ok(r.status === 200 && r.json.warnings.length >= 3, "PATCH капсулы принят, warnings чистки в ответе", r.json?.warnings);
    const [row] = await sql`select capsule_html c from syntheses where id=${D}`;
    ok(!DIRTY_RE.test(row.c) && /<strong>рукой<\/strong>/.test(row.c) && /ссылка/.test(row.c) && /<p>стиль<\/p>/.test(row.c), "капсула в БД: img/script/javascript:/onclick/style сняты, b → strong, текст ссылки и абзаца цел", row.c);
    const ex = await fetch(`${BASE}/syntheses/${D}/export/html`, { headers: { Cookie: A.cookie } });
    const file = await ex.text();
    const m = /onerror=|javascript:alert|pwned/.exec(file);
    // капсула в выгрузке — текстом в шапке (extractCapsuleText), не разметкой
    ok(ex.status === 200 && /Капсула рукой/.test(file) && !m, "выгрузка несёт уже чистую капсулу (сам экспорт не тронут)", m ? file.slice(Math.max(0, m.index - 200), m.index + 100) : /Капсула рукой/.test(file));
  }
  const files = readdirSync(ROOT + "sample").filter((f) => f.endsWith(".html"));
  const sample = readFileSync(ROOT + "sample/" + files[0], "utf8");
  let IMP = null;
  {
    const h4 = sample.indexOf("</h4>") + 5;
    const poisoned = sample.slice(0, h4) + `<p>Импорт <i>курсивом</i> ${POISON}</p>` + sample.slice(h4);
    const fd = new FormData();
    fd.append("file", new Blob([poisoned], { type: "text/html" }), "poisoned.html");
    const r = await A.api("POST", "/syntheses/import", fd);
    IMP = r.json?.id; if (IMP) ids.push(IMP);
    const rows = IMP ? await sql`select html_content h from sections where synthesis_id=${IMP}` : [];
    const all = rows.map((x) => x.h).join("");
    ok(r.status === 200 && rows.length > 5, `импорт файла принят (${rows.length} разделов)`, r.text.slice(0, 200));
    ok(!DIRTY_RE.test(all) && /<em>курсивом<\/em>/.test(all) && /ссылка/.test(all), "разделы импорта в БД чисты, i → em, текст ссылки цел");
    ok(r.json?.warnings?.some((w) => w.field === "sections" && /<img>|<script>/.test(w.message)), "warnings ответа импорта называют снятое полем sections", r.json?.warnings?.filter((w) => w.field === "sections").slice(0, 3));
  }
  {
    // ответ мока Claude — режим adversarial (фон; ждём mode_results)
    const r = await A.api("POST", `/syntheses/${D}/modes/adversarial/run`, { param: "Гегель" });
    ok(r.status === 200 && r.json?.ok, "POST /modes/adversarial/run принят", r.text);
    let rows = [];
    for (let i = 0; i < 60 && !rows.length; i++) { await sleep(500); rows = await sql`select html_content h from mode_results where synthesis_id=${D} and mode_key='adversarial'`; }
    ok(rows.length === 1 && mock.calls >= 1, "мок Claude вызван, mode_results записан");
    ok(rows[0] && !DIRTY_RE.test(rows[0].h) && /<strong>жирный<\/strong> <em>курсив<\/em>/.test(rows[0].h) && /<li>пункт<\/li>/.test(rows[0].h), "ответ модели в БД чист: b/i → strong/em, яд снят, список цел", rows[0]?.h);
    const [gl] = await sql`select metadata from generation_log where synthesis_id=${D} and source='mode' order by created_at desc limit 1`;
    const pw = gl?.metadata?.parseWarnings ?? [];
    ok(pw.some((w) => /^чистка разметки ответа модели: .*<img>/.test(w)), "предупреждение чистки — в parseWarnings генлога режима с префиксом", pw);
  }
  {
    // страница с отравленной строкой, как до 13.1 (SQL в обход API)
    const V = await seedDoc(A.id, { title: "Жертва " + TAG, order: ["sum"], sections: [{ key: "sum", num: 1, title: "Резюме", html: wrap(1, "Резюме", sub("Цели", `<p>старое ${POISON}</p>`)) }] });
    const page = await newPage(A);
    await openDoc(page, V);
    await sleep(800);
    ok(await page.evaluate(() => document.title !== "pwned" && document.title !== "pwned2"), "document.title не изменился — встроенный обработчик и <script> из старой записи не исполнились", await page.title());
    ok(page.csp.some((m) => /inline event handler|script-src/.test(m)), "консоль: CSP отказала встроенному обработчику (нарушение названо)", page.csp.slice(0, 2));
    const run = (extra) => spawnSync(ROOT + "node_modules/.bin/tsx", [ROOT + "scripts/maintenance/sanitize-stored-html.ts", "--synthesis", V, ...extra], { cwd: ROOT, encoding: "utf8", env: { ...process.env, DATABASE_URL: DB_URL } });
    const dry = run(["--dry"]);
    ok(dry.status === 0 && /sections\.html_content: просмотрено 1, изменилось бы 1/.test(dry.stdout) && /<img>/.test(dry.stdout) && /<script>/.test(dry.stdout) && /Сняты атрибуты/.test(dry.stdout) && DIRTY_RE.test(await secHtml(V, "sum")), "скрипт --dry: запись названа, в отчёте <img>/<script>/атрибуты; запись не тронута", dry.stdout + dry.stderr);
    const wet = run([]);
    const after = await secHtml(V, "sum");
    ok(wet.status === 0 && /ИТОГ: изменено записей — 1/.test(wet.stdout) && !DIRTY_RE.test(after) && /ссылка/.test(after) && /<h4>Цели<\/h4>/.test(after), "скрипт без --dry: запись очищена, текст и <h4> целы, отчёт верен", wet.stdout);
    ok(/ИТОГ: изменилось бы записей — 0/.test(run(["--dry"]).stdout), "повтор --dry: 0 изменений (идемпотентность)");
    await page.reload({ waitUntil: "networkidle0" });
    ok(!(await page.evaluate(() => !!document.querySelector(".doc-section img, .doc-section script"))), "после чистки на странице нет img/script");
    await page.browserContext().close();
    const h = await fetch(`${BASE}/health`);
    const csp = h.headers.get("content-security-policy") ?? "";
    ok(/script-src 'self' https:\/\/js\.stripe\.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'/.test(csp) && !/unsafe/.test(csp), "CSP у ответа сервера дословно по п.5 (+ js.stripe.com)", csp);
    ok((await fetch(UI + "/")).headers.get("content-security-policy") === csp, "preview отдаёт ту же CSP");
  }

  /* ═══ R3 ═══ */
  console.log("\n■ R3: сужение санитайзера");
  {
    const r1 = HP.sanitizeSectionHtml("<p><b>ж</b> и <i>к</i></p>");
    ok(r1.html === "<p><strong>ж</strong> и <em>к</em></p>", "<b>/<i> → <strong>/<em>", r1.html);
    const r2 = HP.sanitizeSectionHtml("<p>x<sup>2</sup> и<br>далее</p><blockquote>цитата</blockquote>");
    ok(!/<sup|<br|<blockquote/.test(r2.html) && /x2 и далее/.test(r2.html) && /цитата/.test(r2.html), "<sup>, <br>, <blockquote> — текст остался, тегов нет", r2.html);
    const good = `<div class="callout warning"><span class="callout-label">МЕТКА</span>текст</div><div class="callout note"><span class="callout-label">М</span>т</div><div class="callout gold"><span class="callout-label">М</span>т</div><span class="risk high">ВЫСОКИЙ</span><span class="risk medium">СРЕДНИЙ</span><span class="risk low">НИЗКИЙ</span>`;
    const r3 = HP.sanitizeSectionHtml(good);
    ok(!r3.changed && r3.html === good, "выноски и метки риска с разрешёнными классами — как есть");
    const r4 = HP.sanitizeSectionHtml(`<div class="callout danger">т</div><span class="risk extreme">x</span><span class="badge">y</span><p class="lead">z</p>`);
    ok(/<div>т<\/div><span>x<\/span><span>y<\/span><p>z<\/p>/.test(r4.html) && r4.warnings.some((w) => /Сняты классы вне набора: .*div\.callout danger/.test(w)), "чужой класс снят (div.callout danger, span.risk extreme, span.badge, p.lead) — тег остался, в warnings назван", { html: r4.html, w: r4.warnings });
    const r5 = HP.sanitizeSectionHtml(`<div class="callout  warning ">т</div>`);
    ok(r5.html === `<div class="callout warning">т</div>`, "класс с лишними пробелами приводится к точному значению набора", r5.html);
  }

  /* ═══ R4 ═══ */
  console.log("\n■ R4: редактор в сборке — 13 кнопок, вставка, таблица, плашка, «Разметка», сохранение ≡ зеркалу");
  const NESTED = "Вложенный";
  const E = await seedDoc(A.id, { title: "Редактор " + TAG, order: ["sum"], sections: [{ key: "sum", num: 1, title: "Резюме", html: wrap(1, "Резюме",
    sub("Цели и метод", `<p>Первый.</p>\n${sub(NESTED, "<p>Текст вложенного.</p>")}\n<p>Второй.</p>\n<table class="doc-table"><thead><tr><th>А</th><th>Б</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>`)) }] });
  const page = await newPage(A);
  await openDoc(page, E);
  await openEditor(page, "Цели и метод");
  const typeNewPara = async (text) => { await caretEnd(page); await page.keyboard.press("Enter"); await page.keyboard.type(text); };
  const toolExpect = [
    ["p", async () => { await typeNewPara("абзац"); await click(page, 'button[data-editor-tool="h5"]'); await click(page, 'button[data-editor-tool="p"]'); }, /<p>абзац<\/p>/],
    ["h5", async () => { await typeNewPara("подзаголовок"); await click(page, 'button[data-editor-tool="h5"]'); }, /<h5>подзаголовок<\/h5>/],
    ["strong", async () => { await typeNewPara("x "); await click(page, 'button[data-editor-tool="strong"]'); await page.keyboard.type("жирно"); await click(page, 'button[data-editor-tool="strong"]'); }, /<p>x <strong>жирно<\/strong><\/p>/],
    ["em", async () => { await typeNewPara("y "); await click(page, 'button[data-editor-tool="em"]'); await page.keyboard.type("курсив"); await click(page, 'button[data-editor-tool="em"]'); }, /<p>y <em>курсив<\/em><\/p>/],
    ["ul", async () => { await typeNewPara("пункт"); await click(page, 'button[data-editor-tool="ul"]'); }, /<ul>\s*<li>пункт<\/li>\s*<\/ul>/],
    ["ol", async () => { await typeNewPara("шаг"); await click(page, 'button[data-editor-tool="ol"]'); }, /<ol>\s*<li>шаг<\/li>\s*<\/ol>/],
    ["table", async () => { await typeNewPara(""); await click(page, 'button[data-editor-tool="table"]'); await page.keyboard.type("ячейка"); }, /<table class="doc-table">\s*<thead>\s*<tr><th>Столбец 1<\/th><th>Столбец 2<\/th><\/tr>\s*<\/thead>\s*<tbody>\s*<tr><td>ячейка<\/td><td><\/td><\/tr>/],
    ["callout-warning", async () => { await typeNewPara("опасно"); await click(page, 'button[data-editor-tool="callout-warning"]'); }, /<div class="callout warning"><span class="callout-label">ПРЕДУПРЕЖДЕНИЕ<\/span>опасно<\/div>/],
    ["callout-note", async () => { await typeNewPara("заметка"); await click(page, 'button[data-editor-tool="callout-note"]'); }, /<div class="callout note"><span class="callout-label">ПРИМЕЧАНИЕ<\/span>заметка<\/div>/],
    ["callout-gold", async () => { await typeNewPara("совет"); await click(page, 'button[data-editor-tool="callout-gold"]'); }, /<div class="callout gold"><span class="callout-label">РЕКОМЕНДАЦИЯ<\/span>совет<\/div>/],
    ["risk-high", async () => { await typeNewPara("риск "); await click(page, 'button[data-editor-tool="risk-high"]'); }, /<p>риск <span class="risk high">ВЫСОКИЙ<\/span> ?<\/p>/],
    ["risk-medium", async () => { await typeNewPara("риск "); await click(page, 'button[data-editor-tool="risk-medium"]'); }, /<p>риск <span class="risk medium">СРЕДНИЙ<\/span> ?<\/p>/],
    ["risk-low", async () => { await typeNewPara("риск "); await click(page, 'button[data-editor-tool="risk-low"]'); }, /<p>риск <span class="risk low">НИЗКИЙ<\/span> ?<\/p>/],
  ];
  ok(toolExpect.length === DM.EDITOR_TOOL_IDS.length && toolExpect.every(([id]) => DM.EDITOR_TOOL_IDS.includes(id)), "проверяются все 13 кнопок модуля");
  for (const [id, act, re] of toolExpect) {
    await act(page);
    await sleep(80);
    const v = await mirror(page);
    ok(re.test(v), `кнопка «${id}» даёт свой тег`, v.slice(-400));
  }
  {
    const v = await mirror(page);
    ok(!/<b>|<i>|style=|<div>|<span>/.test(v), "после всех кнопок в зеркале нет b/i/style/голых div/span", v);
  }
  // вставка
  await typeNewPara("");
  await page.evaluate((s) => {
    const dt = new DataTransfer();
    dt.setData("text/html", `<div style="font:12px Arial"><b>жир</b> <i>кур</i> <span style="color:red" class="MsoNormal">слово</span> <sup>2</sup></div>`);
    dt.setData("text/plain", "жир кур слово 2");
    document.querySelector(s).dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, BODY);
  await sleep(100);
  ok(/<p><strong>жир<\/strong> <em>кур<\/em> слово 2<\/p>/.test(await mirror(page)) && !/style|MsoNormal|<sup/.test(await mirror(page)), "вставка: b/i → strong/em, span/style/sup → текст", (await mirror(page)).slice(-300));
  // таблица: ячейка и + строка
  await caretIn(page, `${BODY} table.doc-table td`);
  await page.keyboard.type("0");
  await click(page, 'button[data-table-op="row-add"]');
  await page.keyboard.type("новая");
  await sleep(80);
  ok(/<tr><td>10<\/td><td>2<\/td><\/tr>\s*<tr><td>новая<\/td><td><\/td><\/tr>/.test(await mirror(page)), "ячейка правится на месте; «+ строка» добавила строку после текущей", (await mirror(page)).slice(0, 500));
  // плашка
  await page.evaluate((s) => { const pl = document.querySelector(`${s} .rich-placeholder`); const r = document.createRange(); r.setStart(pl.nextElementSibling, 0); r.collapse(true); const x = getSelection(); x.removeAllRanges(); x.addRange(r); }, BODY);
  await page.keyboard.press("Backspace");
  await page.evaluate((s) => { const pl = document.querySelector(`${s} .rich-placeholder`); const r = document.createRange(); r.setStartBefore(pl); r.setEndAfter(pl); const x = getSelection(); x.removeAllRanges(); x.addRange(r); }, BODY);
  await page.keyboard.press("Delete");
  await page.keyboard.type("z");
  await sleep(80);
  ok((await page.$$(`${BODY} .rich-placeholder`)).length === 1 && /<!-- подраздел 1: Вложенный — правится отдельно, строку не удалять -->/.test(await mirror(page)) && !/<div data-section="Вложенный"/.test(await mirror(page)), "плашка не удаляется Backspace/Delete, в зеркале — комментарий-ссылка дословно", (await mirror(page)).slice(0, 300));
  ok(await page.$eval(`${BODY} .rich-placeholder`, (el) => /Вложенный/.test(el.textContent) && el.getAttribute("contenteditable") === "false"), "плашка показывает название вложенного подраздела и не редактируется");
  // «Разметка»
  await click(page, 'button[data-subsection-action="view-markup"]');
  await page.waitForFunction((s) => { const a = document.querySelector(s); return !!a && !a.hidden; }, { timeout: 5000 }, AREA);
  const st = await page.$eval(AREA, (a) => { const c = getComputedStyle(a); const pc = getComputedStyle(a.parentElement); return { ws: c.whiteSpace, w: a.getBoundingClientRect().width, pw: a.parentElement.clientWidth - parseFloat(pc.paddingLeft) - parseFloat(pc.paddingRight), h: a.getBoundingClientRect().height, sw: a.scrollWidth, cw: a.clientWidth, lines: a.value.split("\n").length, rows: a.rows }; });
  ok(st.ws === "pre-wrap" && Math.abs(st.w - st.pw) <= 2 && st.sw <= st.cw && st.h > 200 && st.rows >= Math.min(28, st.lines), "«Разметка»: поле на всю ширину, перенос строк (без горизонтальной прокрутки), высота по содержимому", st);
  const seen = await mirror(page);
  await click(page, 'button[data-subsection-action="view-rich"]');
  await page.waitForFunction((s) => !!document.querySelector(s), { timeout: 5000 }, BODY);
  ok((await mirror(page)) === seen, "«Текст» ← «Разметка» — черновик без потерь");
  // сохранение ≡ зеркалу
  const err = await saveEditor(page);
  ok(err === null, "сохранение принято сервером", err);
  const src = await A.api("GET", subUrl(E, "sum", "Цели и метод"));
  { const a = norm(src.json?.html ?? ""), b = norm(seen); let k = 0; while (k < a.length && a[k] === b[k]) k++;
    ok(src.status === 200 && a === b, "содержимое подраздела на сервере ≡ тому, что было видно в редакторе (зеркало)", { serverTail: a.slice(Math.max(0, k - 80), k + 200), seenTail: b.slice(Math.max(0, k - 80), k + 200) }); }
  const h = await secHtml(E, "sum");
  ok(/<div data-section="Вложенный"><h4>Вложенный<\/h4>/.test(h) && /<h4>Цели и метод<\/h4>/.test(h) && !/rich-placeholder|<!--/.test(h), "в БД: вложенный подраздел вернулся на место, <h4> целы, служебной разметки нет");
  ok(page.errors.length === 0 && page.csp.length === 0, "ошибок страницы и нарушений CSP нет", { e: page.errors, c: page.csp });
  await page.browserContext().close();

  /* ═══ R5 ═══ */
  console.log("\n■ R5: живой файл одностраничника — таблица, выноска, запертые таблицы");
  {
    const clean = await (async () => { const fd = new FormData(); fd.append("file", new Blob([sample], { type: "text/html" }), files[0]); const r = await A.api("POST", "/syntheses/import", fd); if (r.json?.id) ids.push(r.json.id); return r.json?.id; })();
    ok(!!clean, "образец импортирован");
    const list = (await A.api("GET", `/syntheses/${clean}/sections`)).json;
    const secs = Array.isArray(list) ? list : list.sections ?? [];
    const full = [];
    for (const s of secs) { const r = await A.api("GET", `/syntheses/${clean}/sections/${s.key}`); if (r.status === 200 && r.json?.section?.htmlContent) full.push(r.json.section); }
    const lockedAll = full.flatMap((s) => (s.lockedSubsections ?? []).map((n) => [s.key, n]));
    ok(full.length >= 10 && lockedAll.length >= 3, `разделов ${full.length}, запертых подразделов ${lockedAll.length}`);
    const subsOf = (s) => [...s.htmlContent.matchAll(/<div data-section="([^"]+)">/g)].map((m) => m[1]);
    const inner = (s, n) => { const r = HP.readSubsectionSource(s.htmlContent, n); return r?.html ?? ""; };
    let withTable = null, withCallout = null;
    for (const s of full) for (const n of subsOf(s)) {
      if ((s.lockedSubsections ?? []).includes(n)) continue;
      const h = inner(s, n);
      if (!withTable && /<table class="doc-table">/.test(h) && !/<!--/.test(h)) withTable = { key: s.key, name: n, html: h };
      if (!withCallout && /<div class="callout (warning|note|gold)">/.test(h) && !/<!--/.test(h)) withCallout = { key: s.key, name: n, html: h };
    }
    ok(withTable && withCallout, "найдены незапертые подразделы с таблицей и с выноской", { withTable: withTable?.name, withCallout: withCallout?.name });
    const count = (h) => ({ table: (h.match(/<table/g) ?? []).length, tr: (h.match(/<tr>/g) ?? []).length, callout: (h.match(/<div class="callout/g) ?? []).length, risk: (h.match(/<span class="risk/g) ?? []).length, strong: (h.match(/<strong>/g) ?? []).length, h5: (h.match(/<h5>/g) ?? []).length, li: (h.match(/<li>/g) ?? []).length });
    const page2 = await newPage(A);
    await openDoc(page2, clean);
    for (const [label, t, where] of [["таблицей", withTable, "td"], ["выноской", withCallout, "div.callout"]]) {
      if (!t) continue;
      await page2.evaluate((n) => document.querySelector(`button[data-edit-subsection="${n}"]`)?.scrollIntoView(), t.name);
      await openEditor(page2, t.name);
      const before = count(await mirror(page2));
      ok(J(before) === J(count(t.html)), `${label}: редактор открыл разметку без потерь (${J(before)})`, { before, src: count(t.html) });
      const sel = where === "td" ? `${BODY} table.doc-table td` : `${BODY} ${where}`;
      await caretIn(page2, sel, true);
      await page2.keyboard.type(` ПРАВКА-${TAG}`);
      await sleep(80);
      const mv = await mirror(page2);
      const after = count(mv);
      ok(J(after) === J(before) && mv.includes(`ПРАВКА-${TAG}`), `${label}: после правки на месте структура прежняя, текст новый`, { before, after });
      const e = await saveEditor(page2);
      ok(e === null, `${label}: сохранено без отказа`, e);
      const srv = await A.api("GET", subUrl(clean, t.key, t.name));
      ok(srv.status === 200 && J(count(srv.json.html)) === J(before) && srv.json.html.includes(`ПРАВКА-${TAG}`) && norm(srv.json.html) === norm(mv), `${label}: на сервере разметка без потерь и ≡ зеркалу`, { srv: count(srv.json?.html ?? ""), before });
    }
    // запертые
    const [lk, ln] = lockedAll[0];
    ok((await page2.$(`button[data-edit-subsection="${ln}"]`)) === null, `запертый подраздел «${ln}» (${lk}) без карандаша`);
    const lr = await A.api("PATCH", subUrl(clean, lk, ln), { html: "<p>попытка</p>" });
    ok(lr.status === 409 && lr.json?.code === "SECTION_TABLE_LOCKED", "PATCH запертого → 409 SECTION_TABLE_LOCKED", lr.text.slice(0, 200));
    ok(page2.errors.length === 0, "ошибок страницы нет", page2.errors);
    await page2.browserContext().close();
  }
} catch (e) {
  failed++; fails.push("исключение"); console.log("  ✗ исключение: " + (e?.stack ?? e));
} finally {
  try { if (browser) await browser.close(); } catch {}
  for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch {} }
  try { mockSrv.close(); } catch {}
  try { if (ids.length) await sql`delete from syntheses where id in ${sql(ids)}`; } catch {}
  await sql.end({ timeout: 2 });
  console.log(`\nИТОГ test-131: ${passed} ✓ / ${failed} ✗${fails.length ? "\n  провалы: " + fails.join("; ") : ""}`);
  process.exit(failed ? 1 : 0);
}
