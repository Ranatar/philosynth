/**
 * smoke-131-request1 — первый запрос беседы 13.1 (Д-63 stored XSS, Д-64 полнотекстовая правка).
 * Живой сервер :3000 + PG16/Redis + мок Claude :3927 + СБОРКА клиента под vite preview :5225,
 * Chrome 131 (puppeteer-core@23).
 *
 *   A. Ядро санитайзера (в процессе, linkedom через server/utils/html-parser):
 *      b/i → strong/em; sup/blockquote/br/a — сняты, текст цел; классы вне набора сняты;
 *      img/script/style/iframe удалены с содержимым; onerror/style/javascript: не остаются;
 *      caption → <p> перед таблицей; идемпотентность; чистый вход возвращается побайтно;
 *      режим section хранит обёртку, якоря TOC и data-section; модуль ≡ промпт.
 *   B. Живые входы: PATCH капсулы и импорт файла с <img onerror>/javascript: — в БД их нет;
 *      ответ PATCH несёт warnings; ответ импорта — предупреждение поля sections;
 *      CSP и прочие заголовки на ответах сервера и preview; выгрузка — вложение.
 *   C. Скрипт sanitize:stored-html --dry: видит отравленную строку, без --dry чистит, повтор — 0.
 *   D. Редактор (браузер, сборка): панель ⊆ EDITOR_TOOL_IDS; поле-зеркало скрыто; набор, Ж/К,
 *      вставка грязного HTML из буфера → чисто; таблица + строка/столбец; плашка вложенного
 *      подраздела не удаляется Backspace; переключение «Разметка» ↔ «Текст» без потерь;
 *      Ctrl+Enter сохраняет: в БД strong/em, таблица, комментарий-ссылка цел; <h4> не тронут.
 *
 * Запуск из корня:  node_modules/.bin/tsx tests/smoke-131-request1.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5225, MOCK_PORT = 3927;
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

/* ── Модули в процессе ───────────────────────────────────────────────── */
const HP = await import("../server/utils/html-parser.ts");
const DM = await import("@philosynth/shared/constants/doc-markup");
const PT = await import("../server/config/prompt-templates.ts");

const procs = [];
function sp(args, cwd, env, logFile) {
  const log = openSync(logFile, "w");
  const p = spawn(process.execPath, args, { cwd, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...env } });
  procs.push(p);
  return p;
}
async function isUp(url) { try { return (await fetch(url)).status < 500; } catch { return false; } }
async function waitUp(url, what) { for (let i = 0; i < 120; i++) { if (await isUp(url)) return; await sleep(500); } throw new Error(`${what} не поднялся: ${url}`); }

const mockSrv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 10 } } });
    send({ type: "content_block_delta", delta: { type: "text_delta", text: "<p>мок</p>" } });
    send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 10 } });
    send({ type: "message_stop" });
    res.end();
  });
});

function client(cookie) {
  const api = async (method, p, body, extraHeaders = {}) => {
    const headers = { Cookie: cookie, ...extraHeaders };
    let payload;
    if (body !== undefined && !(body instanceof FormData)) { headers["Content-Type"] = "application/json"; payload = J(body); }
    else if (body instanceof FormData) payload = body;
    const r = await fetch(BASE + p, { method, headers, body: payload });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text, headers: r.headers };
  };
  return { api, cookie };
}
async function account(tag) {
  const email = `t131-${tag}-${Date.now()}@example.com`, password = "password-131";
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  return { ...client(cookie), email, password, id: u.id };
}
const ids = [];
const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>\n${b}\n</div>`;
const wrap = (num, title, b) => `<div class="doc-section">\n<div class="section-num">§ ${num}</div>\n<div class="section-title">${title}</div>\n<div class="doc-content">\n${b}\n</div>\n</div>`;
const CAPSULE = (t) => `<div class="capsule"><p>${t}</p></div>`;
async function seedDoc(userId, { title, order, sections, capsule = "" }) {
  const [s] = await sql`insert into syntheses (user_id, seed, title, status, section_order, doc_num, capsule_html, method, synth_level, depth)
    values (${userId}, ${"зерно 13.1 " + TAG}, ${title}, 'ready', ${sql.json(order)}, ${"T131-" + Math.random().toString(36).slice(2, 7)}, ${capsule}, 'dialectical', 'comparative', 'overview') returning id`;
  ids.push(s.id);
  for (const x of sections) await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${s.id}, ${x.key}, ${x.num}, ${x.title}, ${x.html})`;
  await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${s.id}, 'philosopher', 'Кант', 0)`;
  return s.id;
}
const secHtml = async (id, key) => (await sql`select html_content h from sections where synthesis_id=${id} and key=${key}`)[0]?.h ?? null;

let browser = null;
async function newPage(who) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.cspViolations = [];
  page.on("console", (m) => { if (/Content Security Policy/.test(m.text())) page.cspViolations.push(m.text()); });
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setUserAgentOverride", { userAgent: await browser.userAgent(), acceptLanguage: "ru-RU,ru" });
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  return page;
}
const click = (page, sel) => page.$eval(sel, (el) => el.click());
const waitSel = (page, sel, ms = 20000) => page.waitForSelector(sel, { timeout: ms });
const BODY = "[data-subsection-editor-body]";
const AREA = "textarea[data-subsection-source]";
/** Каретка — в конец редактора */
const caretEnd = (page) => page.evaluate((s) => { const b = document.querySelector(s); b.focus(); const r = document.createRange(); r.selectNodeContents(b); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }, BODY);
const areaValue = (page) => page.$eval(AREA, (a) => a.value);
const bodyHtml = (page) => page.$eval(BODY, (b) => b.innerHTML);

/* ══ Прогон ═════════════════════════════════════════════════════════════ */
try {
  if (!CHROME) throw new Error("браузер не найден — задайте CHROME_PATH (Chrome 131)");
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);

  console.log("■ A. Ядро санитайзера");
  {
    const dirty = `<p onclick="x()" style="color:red">Текст <b>жирный</b> и <i>курсив</i> <a href="javascript:alert(1)">ссылка</a> <img src=x onerror="document.title='pwned'"> и <sup>2</sup><br>далее</p><blockquote>цитата</blockquote><div class="callout error"><span class="callout-label">X</span>t</div><table><caption>cap</caption><thead><tr><th colspan="2">a</th></tr></thead><tbody><tr><td rowspan="12">b</td></tr></tbody></table><script>alert(1)</script><style>p{}</style><iframe src="x"></iframe><span class="risk high">ВЫСОКИЙ</span>`;
    const r = HP.sanitizeSectionHtml(dirty);
    ok(r.changed && /<strong>жирный<\/strong>/.test(r.html) && /<em>курсив<\/em>/.test(r.html), "b/i → strong/em", r.html);
    ok(!/onclick|style=|onerror|javascript:|<img|<script|<style|<iframe|alert/.test(r.html), "обработчики, style, img/script/style/iframe и javascript: исчезли", r.html);
    ok(/ссылка/.test(r.html) && / 2 далее/.test(r.html) && /цитата/.test(r.html), "текст снятых a/sup/br/blockquote оставлен", r.html);
    ok(/<div><span class="callout-label">X<\/span>t<\/div>/.test(r.html) && !/error/.test(r.html), "класс вне набора (callout error) снят целиком, тег div и callout-label оставлены", r.html);
    ok(/<p>cap<\/p>\s*<table class="doc-table"><thead><tr><th colspan="2">a<\/th>/.test(r.html) && /rowspan="12"/.test(r.html), "caption → <p> перед таблицей, colspan/rowspan целы, таблица получила doc-table", r.html);
    ok(/<span class="risk high">ВЫСОКИЙ<\/span>/.test(r.html), "span.risk high цел", r.html);
    const again = HP.sanitizeSectionHtml(r.html);
    ok(!again.changed && again.html === r.html, "идемпотентность: второй прогон ничего не меняет");
    const clean = "<p>чисто <strong>да</strong></p>";
    const rc = HP.sanitizeSectionHtml(clean);
    ok(!rc.changed && rc.html === clean, "чистый вход возвращается побайтно, changed=false");
    const section = `<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">Резюме<a href="#docTOC" class="toc-back-btn" title="К содержанию">⏫</a></div><div class="doc-content"><div data-section="Цели"><a id="subsec-sum-Цели"></a><h4>Цели</h4><p>т</p><!-- подраздел 1: Вложенный — правится отдельно, строку не удалять --></div></div></div>`;
    const rs = HP.sanitizeSectionHtml(section);
    ok(/class="doc-section"/.test(rs.html) && /section-num/.test(rs.html) && /data-section="Цели"/.test(rs.html) && /<a id="subsec-sum-Цели"><\/a>/.test(rs.html) && /class="toc-back-btn"/.test(rs.html) && /<h4>Цели<\/h4>/.test(rs.html), "режим section: обёртка, якоря TOC, data-section, h4 целы", rs.html);
    ok(!/<!--/.test(rs.html), "режим section: комментарии сняты (в html_content их не бывает — ссылки вложенных подразделов живут только в черновике правки)", rs.html);
    const w = r.warnings.join(" | ");
    ok(/Удалены вместе с содержимым: .*<img>/.test(w) && /Заменены тегами набора: <b> → <strong>/.test(w) && /Сняты атрибуты/.test(w) && /Сняты классы вне набора/.test(w), "предупреждения чистки — по видам", w);
    const spec = DM.parsePromptFormatting(PT.SEED_PROMPT_TEMPLATES.find((t) => t.key === "system").body);
    const diff = DM.diffMarkupSpecs(spec, DM.moduleMarkupSpec());
    ok(spec.tags.length >= 10 && diff.length === 0, "модуль разметки ≡ разделу «ФОРМАТИРОВАНИЕ» промпта", diff);
  }

  await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));
  console.log("■ Сборка клиента (vite build)");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8" });
  ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-131", STREAM_RETRY_DELAYS: "50", BILLING_ENFORCE: "false", API_KEY_ENCRYPTION_SECRET: "t131-" + "s".repeat(40), CLIENT_ORIGIN: UI }, "/tmp/t131-server.log");
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t131-preview.log");
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");

  console.log("■ B. Живые входы и заголовки");
  const user = await account("owner");
  const POISON = `<img src=x onerror="document.title='pwned'">`;
  {
    const h = await fetch(`${BASE}/health`);
    const csp = h.headers.get("content-security-policy") ?? "";
    ok(/script-src 'self'/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'none'/.test(csp) && /frame-ancestors 'none'/.test(csp), "CSP на ответе сервера", csp);
    ok(h.headers.get("x-content-type-options") === "nosniff" && h.headers.get("referrer-policy") === "same-origin", "nosniff и Referrer-Policy на ответе сервера");
    const p = await fetch(UI + "/");
    ok((p.headers.get("content-security-policy") ?? "") === csp, "preview отдаёт ту же CSP, что сервер", p.headers.get("content-security-policy"));
    const srcCsp = readFileSync(ROOT + "server/security-headers.ts", "utf8").match(/CONTENT_SECURITY_POLICY =\s*"([^"]+)"/)?.[1];
    const viteCsp = readFileSync(ROOT + "client/vite.config.ts", "utf8").match(/CONTENT_SECURITY_POLICY =\s*"([^"]+)"/)?.[1];
    const caddyCsp = readFileSync(ROOT + "deploy/philosynth-hosting.md", "utf8").match(/Content-Security-Policy "([^"]+)"/)?.[1];
    ok(srcCsp && srcCsp === viteCsp && srcCsp === caddyCsp && srcCsp === csp, "три копии политики (сервер, vite, Caddy) равны и равны живому заголовку", { srcCsp, viteCsp, caddyCsp });
  }
  // Документ с подразделом, вложенным подразделом и таблицей — для PATCH капсулы и редактора
  const NESTED = "Вложенный подраздел";
  // Вложенный подраздел — ВНУТРИ внешнего (как даёт генерация): в исходнике правки
  // на его месте встаёт комментарий-ссылка (readSubsectionSource), в БД его нет
  const SUM_HTML = wrap(1, "Исполнительное резюме",
    sub("Цели и метод", `<p>Первый абзац цели.</p>\n${sub(NESTED, "<p>Текст вложенного.</p>")}\n<p>Второй абзац.</p>\n<table class="doc-table"><thead><tr><th>А</th><th>Б</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>`),
  );
  const docId = await seedDoc(user.id, { title: "Синтез " + TAG, order: ["sum", "capsule"], capsule: CAPSULE("Капсула."), sections: [
    { key: "sum", num: 1, title: "Исполнительное резюме", html: SUM_HTML },
    { key: "capsule", num: 2, title: "Капсула концепции", html: CAPSULE("Капсула.") },
  ] });
  {
    const r = await user.api("PATCH", `/syntheses/${docId}/capsule`, { html: `<div class="capsule"><p>Новая <b>капсула</b> ${POISON}<a href="javascript:alert(1)">x</a></p></div>` });
    ok(r.status === 200, "PATCH капсулы принят", r.text);
    ok(Array.isArray(r.json?.warnings) && r.json.warnings.some((w) => /<img>/.test(w)), "ответ PATCH капсулы несёт warnings чистки", r.json);
    const [row] = await sql`select capsule_html c from syntheses where id=${docId}`;
    const [sec] = await sql`select html_content h from sections where synthesis_id=${docId} and key='capsule'`;
    ok(!/onerror|<img|javascript:/.test(row.c) && /<strong>капсула<\/strong>/.test(row.c), "в БД капсула без img/onerror/javascript:, b → strong", row.c);
    ok(sec && !/onerror|<img|javascript:/.test(sec.h), "раздел capsule синхронизирован чистым", sec?.h);
  }
  {
    const files = (await import("node:fs")).readdirSync(ROOT + "sample").filter((f) => f.endsWith(".html"));
    const sample = readFileSync(ROOT + "sample/" + files[0], "utf8");
    const firstSub = sample.indexOf("<h4>");
    const h4end = sample.indexOf("</h4>", firstSub) + 5;
    const poisoned = sample.slice(0, h4end) + `<p>Импорт ${POISON}<a href="javascript:alert(2)">ссылка</a><b>ж</b></p>` + sample.slice(h4end);
    const fd = new FormData();
    fd.append("file", new Blob([poisoned], { type: "text/html" }), "poisoned.html");
    const r = await user.api("POST", "/syntheses/import", fd);
    ok(r.status === 200 || r.status === 201, "импорт отравленного файла принят", r.text.slice(0, 300));
    const impId = r.json?.id;
    if (impId) ids.push(impId);
    ok(r.json?.warnings?.some((w) => w.field === "sections" && /<img>/.test(w.message)), "ответ импорта: предупреждение поля sections о <img>", r.json?.warnings?.slice(0, 5));
    const rows = impId ? await sql`select html_content h from sections where synthesis_id=${impId}` : [];
    const all = rows.map((x) => x.h).join("");
    ok(rows.length > 0 && !/onerror|<img|javascript:/.test(all) && /ссылка/.test(all) && /<strong>ж<\/strong>/.test(all), `импорт в БД чист (${rows.length} разделов): нет img/onerror/javascript:, текст ссылки и b→strong на месте`);
    const [capRow] = impId ? await sql`select capsule_html c from syntheses where id=${impId}` : [{}];
    ok(!/onerror|<img|javascript:/.test(capRow?.c ?? ""), "капсула импорта чиста");
    const ex = await fetch(`${BASE}/syntheses/${impId}/export/html`, { headers: { Cookie: user.cookie } });
    ok(/attachment/.test(ex.headers.get("content-disposition") ?? ""), "выгрузка — вложение (Content-Disposition: attachment), под CSP страницы не попадает", ex.headers.get("content-disposition"));
  }

  console.log("■ C. Скрипт sanitize:stored-html");
  {
    const victim = await seedDoc(user.id, { title: "Жертва " + TAG, order: ["sum"], sections: [{ key: "sum", num: 1, title: "Резюме", html: wrap(1, "Резюме", sub("Цели", `<p>т ${POISON}</p>`)) }] });
    const run = (extra) => spawnSync(ROOT + "node_modules/.bin/tsx", [ROOT + "scripts/maintenance/sanitize-stored-html.ts", "--synthesis", victim, ...extra], { cwd: ROOT, encoding: "utf8", env: { ...process.env, DATABASE_URL: DB_URL } });
    const dry = run(["--dry"]);
    ok(dry.status === 0 && /ПРОБНЫЙ/.test(dry.stdout) && /sections\.html_content: просмотрено 1, изменилось бы 1/.test(dry.stdout) && /<img>/.test(dry.stdout), "--dry видит отравленную строку и называет <img>", dry.stdout + dry.stderr);
    ok(/onerror/.test(await secHtml(victim, "sum")), "--dry записи не менял");
    const wet = run([]);
    ok(wet.status === 0 && /изменено 1/.test(wet.stdout) && !/onerror|<img/.test(await secHtml(victim, "sum")), "без --dry строка очищена", wet.stdout + wet.stderr);
    const again = run(["--dry"]);
    ok(/ИТОГ: изменилось бы записей — 0/.test(again.stdout), "повторный прогон — 0 изменений", again.stdout);
  }

  console.log("■ D. Редактор в сборке");
  const puppeteer = (await import("puppeteer-core")).default;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
  console.log(`  (браузер: ${await browser.version()}; клиент — сборка под vite preview)`);
  const page = await newPage(user);
  await page.goto(`${UI}/synthesis/${docId}`, { waitUntil: "networkidle0" });
  await waitSel(page, ".doc-section");
  ok(page.cspViolations.length === 0, "сборка клиента живёт под CSP (нарушений в консоли нет)", page.cspViolations);
  await click(page, `button[data-edit-subsection="Цели и метод"]`);
  await page.waitForFunction((s) => { const b = document.querySelector(s); return !!b && b.getAttribute("contenteditable") === "true"; }, { timeout: 15000 }, BODY);
  await sleep(150);
  {
    const toolIds = await page.$$eval("[data-subsection-panel] button[data-editor-tool]", (bs) => bs.map((b) => b.getAttribute("data-editor-tool")));
    ok(toolIds.length === DM.EDITOR_TOOL_IDS.length && toolIds.every((t) => DM.EDITOR_TOOL_IDS.includes(t)), `панель — ровно EDITOR_TOOLS модуля (${toolIds.length})`, toolIds);
    const ops = await page.$$eval("[data-table-ops] button[data-table-op]", (bs) => bs.map((b) => b.getAttribute("data-table-op")));
    ok(ops.join(",") === "row-add,row-del,col-add,col-del", "кнопки строк/столбцов таблицы", ops);
    ok(await page.$eval(AREA, (a) => a.hidden && !a.disabled), "поле разметки — скрытое зеркало, не disabled");
    ok(await page.evaluate((s) => document.activeElement?.matches(s), BODY), "фокус — в редакторе");
    const html = await bodyHtml(page);
    ok(/class="rich-placeholder"/.test(html) && new RegExp(NESTED).test(html) && !/<!--/.test(html), "вложенный подраздел — плашкой с видимым названием, не комментарием", html);
    ok(await page.evaluate(() => document.querySelector("[data-subsection-editor]")?.previousElementSibling?.tagName === "H4"), "форма стоит под <h4>, заголовок вне редактора");
    ok(/<table class="doc-table">/.test(html) && /<td>1<\/td>/.test(html), "таблица подраздела — в редакторе", html);
  }
  // набор + выделение
  await caretEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("Новый абзац ");
  await click(page, 'button[data-editor-tool="strong"]');
  await page.keyboard.type("жирно");
  await click(page, 'button[data-editor-tool="strong"]');
  await page.keyboard.type(" и ");
  await click(page, 'button[data-editor-tool="em"]');
  await page.keyboard.type("курсив");
  await click(page, 'button[data-editor-tool="em"]');
  await sleep(100);
  {
    const v = await areaValue(page);
    ok(/<p>Новый абзац <strong>жирно<\/strong> и <em>курсив<\/em><\/p>/.test(v) && !/<b>|<i>|style=|<div>/.test(v), "набор + Ж/К после таблицы: зеркало несёт <p>, <strong>, <em> без b/i/style/div", v);
  }
  // вставка грязного HTML
  await caretEnd(page);
  await page.keyboard.press("Enter");
  await page.evaluate((s) => {
    const b = document.querySelector(s);
    const dt = new DataTransfer();
    dt.setData("text/html", `<meta charset="utf-8"><div style="color:red"><b>жир</b> <i>кур</i> <img src=x onerror="document.title='pwned'"><script>alert(1)</script><a href="javascript:alert(1)">ссылка</a><sup>2</sup><span class="MsoNormal">слово</span></div>`);
    dt.setData("text/plain", "жир кур ссылка2слово");
    b.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, BODY);
  await sleep(100);
  {
    const v = await areaValue(page);
    ok(/<p><strong>жир<\/strong> <em>кур<\/em> ссылка2слово<\/p>/.test(v) && !/<img|onerror|script|javascript|style|MsoNormal|<sup|<div/.test(v), "вставка: b/i → strong/em, img/script/style/класс/javascript:/div сняты, текст в <p>", v);
    ok(await page.evaluate(() => document.title !== "pwned"), "onerror из буфера не исполнился");
  }
  // таблица: каретка в ячейку «1», + строка, + столбец
  await page.evaluate((s) => { const td = document.querySelector(`${s} td`); const r = document.createRange(); r.selectNodeContents(td); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }, BODY);
  await click(page, 'button[data-table-op="row-add"]');
  await page.keyboard.type("новая");
  await click(page, 'button[data-table-op="col-add"]');
  await page.keyboard.type("столб");
  await sleep(100);
  {
    const v = await areaValue(page);
    const rows = (v.match(/<tr>/g) ?? []).length;
    ok(rows === 3 && /<tr><td>новая<\/td><td>столб<\/td><td><\/td><\/tr>/.test(v) && /<th>А<\/th><th><\/th><th>Б<\/th>/.test(v) && /<td>1<\/td><td><\/td><td>2<\/td>/.test(v), "таблица: строка после текущей и столбец после текущего, текст в ячейках, заглушки пусты", v);
  }
  // плашка: Backspace в начале блока после плашки — гасится
  await page.evaluate((s) => { const pl = document.querySelector(`${s} .rich-placeholder`); const next = pl.nextElementSibling; const r = document.createRange(); r.setStart(next, 0); r.collapse(true); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }, BODY);
  await page.keyboard.press("Backspace");
  await page.evaluate((s) => { const pl = document.querySelector(`${s} .rich-placeholder`); const r = document.createRange(); r.selectNode(pl); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }, BODY);
  await page.keyboard.press("Delete");
  await sleep(100);
  ok((await page.$$(`${BODY} .rich-placeholder`)).length === 1 && /<!-- подраздел 1: Вложенный подраздел/.test(await areaValue(page)), "плашка пережила Backspace у края и Delete выделения; в зеркале — комментарий дословно", await areaValue(page));
  // переключение видов
  await click(page, 'button[data-subsection-action="view-markup"]');
  await page.waitForFunction((s) => { const a = document.querySelector(s); return !!a && !a.hidden; }, { timeout: 5000 }, AREA);
  {
    const v = await areaValue(page);
    ok(/<strong>жирно<\/strong>/.test(v) && /<!-- подраздел 1/.test(v) && /<td>новая<\/td>/.test(v) && !(await page.$(BODY)), "«Разметка»: поле видно, несёт набранное; редактора нет", v);
    const st = await page.$eval(AREA, (a) => { const c = getComputedStyle(a); const pc = getComputedStyle(a.parentElement); return { ws: c.whiteSpace, w: a.getBoundingClientRect().width, pw: a.parentElement.clientWidth - parseFloat(pc.paddingLeft) - parseFloat(pc.paddingRight), h: a.getBoundingClientRect().height }; });
    ok(st.ws === "pre-wrap" && st.w >= st.pw - 2 && st.h > 100, "поле разметки: перенос строк, на всю ширину, высота по содержимому (Д-64)", st);
    ok(await page.evaluate((s) => document.activeElement?.matches(s), AREA), "фокус — в поле");
    await page.$eval(AREA, (a) => { const proto = HTMLTextAreaElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(a, a.value + "\n<p>Из поля <i>курсивом</i></p>"); a.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  await click(page, 'button[data-subsection-action="view-rich"]');
  await page.waitForFunction((s) => !!document.querySelector(s), { timeout: 5000 }, BODY);
  {
    const html = await bodyHtml(page);
    ok(/Из поля <em>курсивом<\/em>/.test(html) && /class="rich-placeholder"/.test(html) && /<strong>жирно<\/strong>/.test(html), "«Текст»: правка из поля пришла в редактор, i → em, плашка на месте", html);
  }
  // сохранить Ctrl+Enter
  await caretEnd(page);
  await page.keyboard.down("Control"); await page.keyboard.press("Enter"); await page.keyboard.up("Control");
  try {
    await page.waitForFunction(() => !document.querySelector("[data-subsection-editor]") || /Сохранено/.test(document.querySelector("[data-subsection-editor]").textContent), { timeout: 15000 });
  } catch (e) { console.log("  [debug] отказ: " + J(await page.evaluate(() => document.querySelector('[data-testid="subsection-edit-error"]')?.textContent)) + "\n  [debug] зеркало: " + (await areaValue(page))); throw e; }
  if (await page.$('button[data-subsection-action="cancel"]')) await click(page, 'button[data-subsection-action="cancel"]');
  await page.waitForFunction(() => !document.querySelector("[data-subsection-editor]"), { timeout: 10000 });
  {
    const h = await secHtml(docId, "sum");
    ok(/<h4>Цели и метод<\/h4>/.test(h) && /<p>Первый абзац цели.<\/p>/.test(h), "сохранено: <h4> и исходный абзац целы", h);
    ok(!/<!--/.test(h) && /<p>Первый абзац цели.<\/p>\s*<div data-section="Вложенный подраздел">/.test(h), "вложенный подраздел вернулся на место ссылки, комментария в БД нет", h);
    ok(/<strong>жирно<\/strong> и <em>курсив<\/em>/.test(h) && /<strong>жир<\/strong> <em>кур<\/em> ссылка2слово/.test(h) && /Из поля <em>курсивом<\/em>/.test(h), "набранное, вставленное и правка из поля — в БД", h);
    ok(/<td>новая<\/td>/.test(h) && /столб/.test(h) && !/onerror|<img|<script|javascript:|style=|<b>|<i>/.test(h), "таблица с новыми строкой/столбцом; грязи нет", h);
    ok(/<div data-section="Вложенный подраздел"><h4>Вложенный подраздел<\/h4>/.test(h) && /Текст вложенного/.test(h), "вложенный подраздел не тронут", h);
    ok(!/rich-placeholder|contenteditable|data-subsection/.test(h), "служебной разметки редактора в БД нет", h);
  }
  ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
  ok(page.cspViolations.length === 0, "нарушений CSP за время правки нет", page.cspViolations);
} catch (e) {
  failed++; fails.push("исключение"); console.log("  ✗ исключение: " + (e?.stack ?? e));
} finally {
  try { if (browser) await browser.close(); } catch {}
  for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch {} }
  try { mockSrv.close(); } catch {}
  try { if (ids.length) await sql`delete from syntheses where id in ${sql(ids)}`; } catch {}
  await sql.end({ timeout: 2 });
  console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  process.exit(failed ? 1 : 0);
}
