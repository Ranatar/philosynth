/**
 * Беседа 14.2 — тестовые запросы 2–7 одним харнессом (хранимые тексты и их
 * показ: бэкенд + клиент). Живой сервер :3000 (прокси preview) + PG16/Redis +
 * мок Claude :3927 + СБОРКА клиента (vite build) под vite preview :5225 +
 * браузер Chrome 131 (CHROME_PATH).
 *
 *  R2  Д-54: обрыв по max_tokens на моке (stop_reason max_tokens на графе,
 *      ANTHROPIC_MAX_TOKENS=4000) → pausedState без русской фразы: reasonKind
 *      и число полями, pause_marker без reason; старая пауза с reason —
 *      читается как прежде (GET /:id отдаёт reason как есть)
 *  R3  Д-55/Д-62: генерация на моке с пропущенным подразделом резюме и
 *      переведёнными атрибутами графа → metadata.parseWarnings кодами
 *      (subsections_missing, graph_table_missing), logLabel кодами у всех
 *      строк генерации; GET /sections/:key и /logs/formatted под en —
 *      английские фразы; под ru — фразы 12.3/11.1 побайтно; старая запись
 *      генлога без кода (вставлена строкой) — как есть на обоих языках
 *  R4  Д-57: импорт файла с безымянным предком (узел без name и узел со
 *      старой заглушкой) → file_genealogy пустое имя + unnamed, без
 *      кириллических заглушек; GET /:id и /lineage/ancestors под en —
 *      «[unnamed concept]», под ru — «[безымянная концепция]»; старая запись
 *      с «[безымянная концепция]» в file_genealogy — при en переводом
 *  R5  Д-59 (сервер): /sections на английском документе несёт
 *      subsectionTitles с английскими <h4> и sectionTitle; на документе без
 *      <h4> — ключи; ⏫ и якоря оглавления в заголовок не попадают; гостевой
 *      документ одним ответом (visibility full) несёт те же поля
 *  R6  Д-54 (браузер): пауза по max_tokens при en → причина по-английски с
 *      числом (ReasonBox), метка раздела по ключам; при ru — прежняя русская
 *      фраза; старая пауза (reason без новых полей) — текст как есть
 *  R7  Д-59 (браузер): английский документ в немецком интерфейсе →
 *      оглавление и кнопки подразделов EditModal показывают английские
 *      заголовки документа; документ без <h4> — ключи; клик по подразделу
 *      оглавления ведёт к нему (якорь по ключу); панель точечной
 *      перегенерации показывает заголовок
 *
 * Запуск (≈ 2 мин, в фоне): node_modules/.bin/tsx tests/test-142-requests2-7.mjs [R2 R3 …]
 * Предпосылки: PG16 + Redis, миграции и сиды; `npm i --no-save puppeteer-core@23`;
 * Chrome 131 в ~/.cache/puppeteer/chrome/linux-131.0.6778.204/ либо CHROME_PATH;
 * лог сервера — /tmp/t142-server.log.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import postgres from "postgres";

const ONLY = process.argv.slice(2);
const want = (r) => ONLY.length === 0 || ONLY.includes(r);
const ROOT = new URL("../", import.meta.url).pathname;
// Сервер — :3000: vite preview проксирует /api и /ws по server.proxy (vite.config), иного адреса сборка не знает
const PORT = 3000, UI_PORT = 5225, MOCK_PORT = 3927, MAX_TOKENS = 4000;
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${UI_PORT}`;
const CHROME = [process.env.CHROME_PATH, `${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`, "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome"].find((p) => p && existsSync(p));
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (id) => `[data-testid="${id}"]`;
const CYR = /[А-Яа-яЁё]/;
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 700) : ""}`); }
}
const TAG = Math.random().toString(36).slice(2, 8);

/* ── Серверные модули в процессе харнесса ────────────────────────────── */
const SDB = await import("../server/services/section-defs-builder.ts");
const PARAMS = { seed: "s", phil: ["Кант"], participants: [{ type: "philosopher", name: "Кант" }], method: "dialectical", synthLevel: "comparative", depth: "overview", generationOrder: "architectural", extGraphMetrics: false, ctx: "", lang: "Russian", keepFullBudget: false };
const SUBMAP = await SDB.buildSubsectionMap({ ...PARAMS, sec: ["sum", "graph", "theses"] });
const SUM_SUBS = SUBMAP.sum, GRAPH_SUBS = SUBMAP.graph;

/* ── Фикстуры ────────────────────────────────────────────────────────── */
const tbl = (h, rows) => `<table class="doc-table"><thead><tr>${h.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const sub = (n, b, h4 = n) => `<div data-section="${n}">${h4 === null ? "" : `<h4>${h4}</h4>`}\n${b}\n</div>`;
const wrap = (num, title, b) => `<div class="doc-section">\n<div class="section-num">§ ${num}</div>\n<div class="section-title">${title}</div>\n<div class="doc-content">\n${b}\n</div>\n</div>`;
const CAT_H = ["Категория", "Тип", "Определение", "Центральность", "Определённость", "Происхождение"];
const EDGE_H = ["Источник", "Описание связи", "Цель", "Тип связи", "Направление", "Сила"];
const GRAPH_BODY =
  sub("Методология построения графа", "<p>Метод построения: диалектический.</p>") +
  sub("Таблица категорий", tbl(CAT_H, [["Бытие", "онтологическая", "то, что есть", "0.9", "0.8", "Кант"], ["Ничто", "онтологическая", "то, чего нет", "0.5", "0.6", "Гегель"]])) +
  sub("Таблица связей", tbl(EDGE_H, [["Бытие", "переходит в", "Ничто", "диалектическая", "однонаправленная", "0.7"]])) +
  sub("Топология графа", "<p>Один кластер.</p>");
/** Граф с ПЕРЕВЕДЁННЫМИ атрибутами data-section (ошибка модели 11.1): таблицы по русскому атрибуту не находятся */
const GRAPH_BODY_EN = GRAPH_SUBS.map((n, i) => sub(`Graph part ${i + 1}`, i === 1 ? tbl(CAT_H, [["Being", "онтологическая", "what is", "0.9", "0.8", ""]]) : `<p>${n} — translated attribute.</p>`, `Graph part ${i + 1}`)).join("\n");
const SUM_BODY = SUM_SUBS.map((n) => sub(n, `<p>Подраздел «${n}»: исходный текст.</p>`)).join("\n");
/** Резюме без «Точки напряжения» — пропуск модели (12.3) */
const SUM_BODY_SKIP = SUM_SUBS.filter((n) => n !== "Точки напряжения").map((n) => sub(n, `<p>Подраздел «${n}»: текст.</p>`)).join("\n");
const TH = ["№", "Формулировка тезиса", "Тип (онтол./эпистем./этич.)", "Степень новизны", "Связанные категории"];
const THESES_BODY_EN =
  sub("Онтологические тезисы", "<h5>Thesis O-1</h5><p>Being is.</p>", "Ontological theses") +
  sub("Эпистемологические тезисы", "<h5>Thesis E-1</h5><p>Knowledge is.</p>", "Epistemological theses") +
  sub("Сводная таблица тезисов", tbl(TH, [["О-1", "Being is", "Онтологический", "порождён", "Being"]]), "Summary table of theses");

/* ── Мок Claude ──────────────────────────────────────────────────────── */
const mock = { calls: 0, picked: [], maxed: new Set() };
const mockSrv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", async () => {
    mock.calls++;
    let prompt = "";
    try { const c = JSON.parse(body).messages?.[0]?.content; prompt = typeof c === "string" ? c : J(c); } catch {}
    const task = prompt.slice(Math.max(0, prompt.lastIndexOf("ЗАДАНИЕ")));
    const marker = prompt.match(/\[MOCK:([A-Z]+)(?::([a-z]+))?\]/);
    let text, picked;
    if (task.includes("Таблица связей")) { picked = "graph"; text = marker?.[1] === "TRANSL" ? GRAPH_BODY_EN : GRAPH_BODY; }
    else if (task.includes("Точки напряжения")) { picked = "sum"; text = marker?.[1] === "TRANSL" ? SUM_BODY_SKIP : SUM_BODY; }
    else { picked = "(прочее)"; text = "<div data-section=\"Диалог\"><h4>Диалог</h4><p>реплика</p></div>"; }
    mock.picked.push(picked);
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 1000 } } });
    // R2/R6: один раз на зерно — обрыв графа по max_tokens после двух целых подразделов (partial)
    let stop = "end_turn";
    if (marker?.[1] === "MAXTOK" && marker[2] === picked) {
      const key = prompt.match(/зерно-(\w+)/)?.[1] ?? "";
      if (!mock.maxed.has(key)) { mock.maxed.add(key); const cut = text.indexOf('<div data-section="Таблица связей"'); text = text.slice(0, cut) + '<div data-section="Таблица связей"><h4>Таблица связей</h4><p>обор'; stop = "max_tokens"; }
    }
    for (let i = 0; i < text.length; i += 1500) send({ type: "content_block_delta", delta: { type: "text_delta", text: text.slice(i, i + 1500) } });
    send({ type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: stop === "max_tokens" ? MAX_TOKENS : 2000 } });
    send({ type: "message_stop" });
    res.end();
  });
});

/* ── Процессы ────────────────────────────────────────────────────────── */
const procs = [];
function sp(args, cwd, env, logFile) {
  const log = openSync(logFile, "w");
  const p = spawn(process.execPath, args, { cwd, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...env } });
  procs.push(p);
  return p;
}
async function isUp(url) { try { return (await fetch(url)).status < 500; } catch { return false; } }
async function waitUp(url, what) { for (let i = 0; i < 120; i++) { if (await isUp(url)) return; await sleep(500); } throw new Error(`${what} не поднялся: ${url}`); }

/* ── HTTP-клиенты ────────────────────────────────────────────────────── */
function client(cookie) {
  const api = async (method, p, body, extraHeaders = {}) => {
    const headers = { ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders };
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
    const r = await fetch(BASE + p, { method, headers, body: payload });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  };
  return { api, cookie };
}
const guest = client(null);
const userIds = [];
async function account(tag, uiLocale) {
  const email = `t142-${tag}-${Date.now()}@example.com`, password = "password-142";
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password, displayName: "Проверяющий" }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  userIds.push(u.id);
  if (uiLocale) await sql`update users set ui_locale=${uiLocale} where id=${u.id}`;
  return { ...client(cookie), email, password, id: u.id };
}
const setLocale = (user, loc) => sql`update users set ui_locale=${loc} where id=${user.id}`;
const synthRow = async (id) => (await sql`select title, status, paused_state, file_genealogy from syntheses where id=${id}`)[0];
const ids = [];
async function seedDoc(userId, { title, order, sections, lineage = [], visibility = "private" }) {
  const [s] = await sql`insert into syntheses (user_id, seed, title, status, section_order, doc_num, method, synth_level, depth, visibility)
    values (${userId}, ${"зерно 14.2 " + TAG}, ${title}, 'ready', ${sql.json(order)}, ${"T142-" + Math.random().toString(36).slice(2, 7)}, 'dialectical', 'comparative', 'overview', ${visibility}) returning id`;
  ids.push(s.id);
  for (const x of sections) await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${s.id}, ${x.key}, ${x.num}, ${x.title}, ${x.html})`;
  let pos = 0;
  for (const l of lineage) await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${s.id}, 'philosopher', ${l}, ${pos++})`;
  return s.id;
}
async function waitStatus(id, pred, ms = 90000) {
  const t0 = Date.now();
  for (;;) { const r = await synthRow(id); if (pred(r)) return r; if (Date.now() - t0 > ms) throw new Error(`статус не дождался: ${r?.status}`); await sleep(400); }
}
async function generate(user, seed, sections) {
  const post = await user.api("POST", "/syntheses", { seed, philosophers: ["Кант"], sections, method: "dialectical", depth: "overview", synthLevel: "comparative" });
  if (post.status !== 201) throw new Error(`POST /syntheses ${post.status}: ${post.text}`);
  ids.push(post.json.id);
  return post.json.id;
}
/** Английский документ: .section-title и <h4> по-английски, атрибуты — русские ключи; с ⏫ и якорями оглавления в разметке */
const ENG_SUM = wrap(1, 'Executive summary<a href="#docTOC" class="toc-back-btn" title="К содержанию">⏫</a>',
  SUM_SUBS.map((n, i) => `<div data-section="${n}"><a id="subsec-sum-${n.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, "_")}"></a><h4>English title ${i + 1}<a href="#docTOC" class="toc-back-btn">⏫</a></h4><p>Text of «${n}».</p></div>`).join("\n"));
const ENG_THESES = wrap(2, "Corpus of theses", THESES_BODY_EN);
const NOH4_GRAPH = wrap(3, "Category graph", GRAPH_SUBS.map((n) => sub(n, `<p>${n}: no heading.</p>`, null)).join("\n"));
const OLD_REASON = "Старая фраза паузы как есть (до 14.2)";
const RU_MAXTOK = `Ответ оборван по лимиту токенов (max_tokens = ${MAX_TOKENS.toLocaleString("ru")}). Раздел слишком объёмный.`;
const EN_MAXTOK = `The response was cut off by the token limit (max_tokens = ${MAX_TOKENS.toLocaleString("ru")}). The section is too large.`;

/* ── Браузер ─────────────────────────────────────────────────────────── */
let browser = null, lastPage = null;
async function newPage(who, acceptLanguage = "ru-RU,ru") {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("dialog", (d) => void d.accept());
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setUserAgentOverride", { userAgent: await browser.userAgent(), acceptLanguage });
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  lastPage = page;
  return page;
}
const text = (page, sel) => page.$eval(sel, (el) => el.textContent ?? "");
const exists = async (page, sel) => (await page.$(sel)) !== null;
const click = (page, sel) => page.$eval(sel, (el) => el.click());
const waitSel = (page, sel, ms = 20000) => page.waitForSelector(sel, { timeout: ms });
const openDoc = async (page, id) => { await page.goto(`${UI}/synthesis/${id}`, { waitUntil: "networkidle0" }); await waitSel(page, ".doc-section"); };
async function openPauseModal(page, id) {
  await page.goto(`${UI}/synthesis/${id}`, { waitUntil: "networkidle0" });
  await waitSel(page, ".progress-panel, .doc-section");
  try { await waitSel(page, ".pause-overlay.visible", 6000); } catch { await waitSel(page, ".progress-pause-badge.visible"); await click(page, ".progress-pause-badge.visible"); await waitSel(page, ".pause-overlay.visible"); }
  await waitSel(page, T("pause-reason"));
  return { reason: (await text(page, T("pause-reason"))).trim(), modal: await text(page, ".pause-overlay.visible .pause-modal") };
}

/* ══ Прогон ═════════════════════════════════════════════════════════════ */
try {
  if (!CHROME) throw new Error("браузер не найден — задайте CHROME_PATH (Chrome 131)");
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));

  console.log("■ Сборка клиента (vite build)");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8" });
  ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-142", ANTHROPIC_MAX_TOKENS: String(MAX_TOKENS), STREAM_RETRY_DELAYS: "50", BILLING_ENFORCE: "false", API_KEY_ENCRYPTION_SECRET: "t142-" + "s".repeat(40), CLIENT_ORIGIN: UI }, "/tmp/t142-server.log");
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t142-preview.log");
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");
  let puppeteer;
  try { puppeteer = (await import("puppeteer-core")).default; }
  catch { const fb = process.env.PUPPETEER_CORE; if (!fb || !existsSync(fb)) throw new Error("puppeteer-core не найден — npm i --no-save puppeteer-core@23 либо PUPPETEER_CORE"); puppeteer = (await import(fb)).default; }
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"] });
  console.log(`  (браузер: ${await browser.version()}; клиент — сборка под vite preview)`);

  const A = await account("a", "en");
  await sql`update users set balance_usd = 50 where id = ${A.id}`;

  /* ════ R2: Д-54 на моке ════ */
  let G2 = null;
  if (want("R2") || want("R6")) {
    console.log("\n■ R2: Д-54 — обрыв по max_tokens: pausedState полями, без фразы");
    G2 = await generate(A, `[MOCK:MAXTOK:graph] зерно-${TAG}mt`, ["sum", "graph"]);
    const paused = await waitStatus(G2, (r) => r.status === "paused" || r.status === "ready" || r.status === "error");
    const ps = paused.paused_state;
    ok(paused.status === "paused" && ps?.kind === "gen" && ps.reasonKind === "max-tokens", "пауза max-tokens на графе", [paused.status, ps?.reasonKind]);
    ok(ps && !("reason" in ps) && ps.maxTokensUsed === MAX_TOKENS && !("rawMessage" in ps) && J(ps.sectionKeys) === J(["graph"]), "pausedState: нет reason, maxTokensUsed числом, sectionKeys", ps && { reason: ps.reason, maxTokensUsed: ps.maxTokensUsed, rawMessage: ps.rawMessage, isPartial: ps.isPartial });
    ok(ps?.isPartial === true && (ps.partialSubsections ?? []).length >= 1, "обрыв частичный: успевшие подразделы графа перечислены", ps?.partialSubsections);
    ok(!/Ответ оборван|оборвался|Сбой|Нет ответа/.test(J(ps)), "в pausedState нет русской фразы причины", J(ps).slice(0, 400));
    const [mk] = await sql`select metadata from generation_log where synthesis_id=${G2} and log_type='pause_marker'`;
    ok(mk && !("reason" in mk.metadata) && mk.metadata.reasonKind === "max-tokens" && mk.metadata.maxTokensUsed === MAX_TOKENS && J(mk.metadata.logLabel) === J({ kind: "pass", sections: ["graph"] }), "pause_marker: без reason, с числом и кодом подписи", mk?.metadata);
    const [gen] = await sql`select error_message, metadata from generation_log where synthesis_id=${G2} and section_key='graph' and log_type='generation'`;
    ok(gen && gen.metadata.error?.code === "stream" && gen.metadata.error?.kind === "max-tokens" && gen.metadata.error?.maxTokensUsed === MAX_TOKENS && !gen.metadata.error?.raw, "строка генлога графа: metadata.error {stream, max-tokens, число}, без сырого текста", gen?.metadata.error);
    const got = await A.api("GET", `/syntheses/${G2}`);
    const gotPs = got.json?.synthesis?.pausedState;
    ok(got.status === 200 && gotPs && gotPs.reason === undefined && gotPs.maxTokensUsed === MAX_TOKENS, "GET /:id владельцу: pausedState без reason, с числом", gotPs);
    // старая пауза (до 14.2): reason есть, новых полей нет — читается как прежде
    const O = await seedDoc(A.id, { title: `Старая пауза ${TAG}`, order: ["sum", "graph"], sections: [{ key: "sum", num: 1, title: "Резюме", html: wrap(1, "Исполнительное Резюме Синтеза", SUM_BODY) }] });
    const oldPs = { kind: "gen", passIdx: 1, sectionKeys: ["graph"], sectionLabel: "Граф Категорий Концепции", isPartial: false, reason: OLD_REASON, reasonKind: "max-tokens", maxTokensUsed: 20000, timestamp: Date.now(), partialSubsections: [], expectedSubsections: GRAPH_SUBS, completedPasses: [["sum"]], genParams: {}, skipDegrades: [] };
    await sql`update syntheses set status='paused', paused_state=${sql.json(oldPs)} where id=${O}`;
    const gotOld = await A.api("GET", `/syntheses/${O}`);
    ok(gotOld.status === 200 && gotOld.json?.synthesis?.pausedState?.reason === OLD_REASON && gotOld.json.synthesis.pausedState.reasonKind === "max-tokens", "старая пауза: GET /:id отдаёт reason как есть", gotOld.json?.synthesis?.pausedState);
    R6docs = { G2, O };
  }
  var R6docs;

  /* ════ R3: Д-55/Д-62 на моке ════ */
  if (want("R3")) {
    console.log("\n■ R3: Д-55/Д-62 — parseWarnings и подписи журнала кодами; en / ru / старая запись");
    const G3 = await generate(A, `[MOCK:TRANSL] зерно-${TAG}tr`, ["sum", "graph"]);
    const fin = await waitStatus(G3, (r) => r.status === "ready" || r.status === "error" || r.status === "paused", 120000);
    ok(fin.status === "ready", "генерация с переведёнными атрибутами и пропуском завершена (ready)", fin.status);
    const rows = await sql`select section_key k, section_label l, log_type t, source s, metadata m from generation_log where synthesis_id=${G3} order by created_at`;
    const sumRow = rows.find((r) => r.k === "sum" && r.t === "generation"), graphRow = rows.find((r) => r.k === "graph" && r.t === "generation");
    const sumPw = sumRow?.m.parseWarnings ?? [], graphPw = graphRow?.m.parseWarnings ?? [];
    ok(sumPw.some((w) => w && typeof w === "object" && w.code === "subsections_missing" && J(w.params.names) === J(["Точки напряжения"]) && w.params.expected === SUM_SUBS.length && w.params.marked === SUM_SUBS.length - 1), "резюме: пропуск подраздела — КОД subsections_missing с параметрами", sumPw);
    ok(graphPw.filter((w) => w?.code === "graph_table_missing").length === 2 && graphPw.every((w) => typeof w === "object" && !CYR.test(J(w).replace(/Таблица категорий|Таблица связей|Graph part \d|[А-Яа-яЁё ]+/g, (m) => (/^(Таблица категорий|Таблица связей)$/.test(m) ? "" : m)))), "граф: переведённые атрибуты — КОДЫ graph_table_missing ×2, фраз нет", graphPw);
    ok(sumPw.every((w) => typeof w === "object") && graphPw.every((w) => typeof w === "object"), "в parseWarnings новых записей ни одной строки-фразы");
    const genRows = rows.filter((r) => r.t === "generation");
    ok(genRows.length >= 3 && genRows.every((r) => r.m.logLabel && typeof r.m.logLabel.kind === "string"), "все строки генерации несут код подписи logLabel", genRows.map((r) => [r.k, r.m.logLabel]));
    ok(J(sumRow?.m.logLabel) === J({ kind: "pass", sections: ["sum"] }) && J(graphRow?.m.logLabel) === J({ kind: "pass", sections: ["graph"] }) && rows.find((r) => r.k === "_genCommon")?.m.logLabel?.kind === "common", "коды подписей: pass по ключам, common у служебной строки", [sumRow?.m.logLabel, graphRow?.m.logLabel]);
    ok(sumRow?.l === "Исполнительное Резюме Синтеза" && graphRow?.l === "Граф Категорий Концепции", "section_label пишется как прежде (русская запасная строка)", [sumRow?.l, graphRow?.l]);
    // старая запись без кода — строкой (раздел theses заводится строкой sections, чтобы GET /sections/theses был)
    await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${G3}, 'theses', 3, 'Тезисы', ${wrap(3, "Корпус Тезисов", THESES_BODY_EN)})`;
    await sql`insert into generation_log (synthesis_id, section_key, section_label, log_type, source, status, error_message, metadata) values (${G3}, 'theses', 'Старая подпись как есть', 'generation', 'edit', 'error', 'старая ошибка как есть', ${sql.json({ parseWarnings: ["старое предупреждение как есть"], expectedSubsections: [], subsections: [] })})`;
    // en
    const secEn = await A.api("GET", `/syntheses/${G3}/sections/sum`);
    const pwEn = secEn.json?.section?.parseWarnings ?? [];
    ok(secEn.status === 200 && pwEn.length === 1 && /without writing subsection “Точки напряжения” \(subsections expected: \d+, marked up: \d+\)/.test(pwEn[0]), "GET /sections/sum под en: фраза пропуска по-английски", pwEn);
    const gEn = (await A.api("GET", `/syntheses/${G3}/sections/graph`)).json?.section?.parseWarnings ?? [];
    ok(gEn.length >= 2 && gEn.every((w) => !CYR.test(w.replace(/Таблица категорий|Таблица связей/g, ""))) && gEn.some((w) => /subsection “Таблица категорий” not found — categories not parsed/.test(w)), "GET /sections/graph под en: предупреждения графа по-английски, имена таблиц как есть", gEn);
    const logEn = (await A.api("GET", `/syntheses/${G3}/logs/formatted`)).json?.text ?? "";
    ok(logEn.includes("═══ EXECUTIVE SUMMARY ═══") && logEn.includes("═══ CATEGORY GRAPH ═══") && /without writing subsection “Точки напряжения”/.test(logEn) && /categories not parsed/.test(logEn), "/logs/formatted под en: подписи и предупреждения по кодам — по-английски", logEn.slice(0, 400));
    ok(logEn.includes("═══ СТАРАЯ ПОДПИСЬ КАК ЕСТЬ ═══") && logEn.includes("старая ошибка как есть") && logEn.includes("старое предупреждение как есть"), "/logs/formatted под en: старая запись без кода — как есть");
    const oldEn = (await A.api("GET", `/syntheses/${G3}/sections/theses`)).json?.section?.parseWarnings ?? [];
    ok(J(oldEn) === J(["старое предупреждение как есть"]), "GET /sections/theses под en: строка старой записи как есть", oldEn);
    // ru — побайтно фразы 12.3/11.1
    await setLocale(A, "ru");
    const pwRu = (await A.api("GET", `/syntheses/${G3}/sections/sum`)).json?.section?.parseWarnings ?? [];
    ok(pwRu[0] === `модель завершила ответ, не написав подраздел «Точки напряжения» (ожидалось подразделов: ${SUM_SUBS.length}, размечено: ${SUM_SUBS.length - 1}). Раздел сохранён как есть — перегенерируйте его, если подраздел нужен`, "GET /sections/sum под ru: фраза 12.3 побайтно", pwRu);
    const gRu = (await A.api("GET", `/syntheses/${G3}/sections/graph`)).json?.section?.parseWarnings ?? [];
    const attrs = GRAPH_SUBS.map((_, i) => `"Graph part ${i + 1}"`).join(", ");
    ok(gRu.includes(`подраздел «Таблица категорий» не найден — категории не разобраны (атрибуты data-section раздела: ${attrs})`) && gRu.includes(`подраздел «Таблица связей» не найден — связи не разобраны (атрибуты data-section раздела: ${attrs})`), "GET /sections/graph под ru: фразы 11.1 побайтно", gRu);
    const logRu = (await A.api("GET", `/syntheses/${G3}/logs/formatted`)).json?.text ?? "";
    ok(logRu.includes("═══ ИСПОЛНИТЕЛЬНОЕ РЕЗЮМЕ ═══") && logRu.includes("═══ ГРАФ КАТЕГОРИЙ ═══") && logRu.includes(`⚠ ${pwRu[0]}`) && logRu.includes("═══ СТАРАЯ ПОДПИСЬ КАК ЕСТЬ ═══") && logRu.includes("старая ошибка как есть"), "/logs/formatted под ru: русские подписи по кодам (tData(KEY_LABELS)), фразы 12.3, старая запись как есть", logRu.slice(0, 400));
    await setLocale(A, "en");
  }

  /* ════ R4: Д-57 ════ */
  if (want("R4")) {
    console.log("\n■ R4: Д-57 — импорт файла с безымянным предком");
    const SRC = await seedDoc(A.id, { title: `Исходник ${TAG}`, order: ["sum"], sections: [{ key: "sum", num: 1, title: "Резюме", html: wrap(1, "Исполнительное Резюме Синтеза", SUM_BODY) }], lineage: ["Кант"] });
    const e = await A.api("GET", `/syntheses/${SRC}/export/html`);
    ok(e.status === 200 && /philosynth-state/.test(e.text), "выгрузка исходника получена");
    const stateM = e.text.match(/<script type="application\/json" id="philosynth-state">\s*([\s\S]*?)\s*<\/script>/);
    const st = JSON.parse(stateM[1]);
    st.genealogy.participants = [{ type: "philosopher", name: "Кант" }, { type: "concept" }, { type: "concept", name: "[безымянная концепция]", participants: [{ type: "philosopher", name: "Гегель" }] }];
    const file = e.text.replace(/(<script type="application\/json" id="philosynth-state">\s*)[\s\S]*?(\s*<\/script>)/, (_m, a, b) => `${a}${J(st)}${b}`);
    const fd = new FormData();
    fd.append("file", new Blob([file], { type: "text/html" }), `t142-${TAG}.html`);
    const ir = await A.api("POST", "/syntheses/import", fd);
    ok(ir.status === 200 || ir.status === 201, "импорт файла прошёл", { status: ir.status, text: ir.text.slice(0, 300) });
    const I = ir.json?.id; if (I) ids.push(I);
    const row = await synthRow(I);
    const parts = row.file_genealogy?.participants ?? [];
    ok(parts.length === 3 && parts[1]?.name === "" && parts[1]?.unnamed === true && parts[2]?.name === "" && parts[2]?.unnamed === true && !J(row.file_genealogy).includes("безымянн"), "file_genealogy: безымянные узлы — пустое имя + unnamed, русских заглушек нет", parts);
    ok((ir.json?.lineageCandidates ?? []).length === 2 && ir.json.lineageCandidates.every((c) => c.parentName === "[unnamed concept]") && (ir.json.warnings ?? []).filter((w) => w.field === "lineage").every((w) => /“\[unnamed concept\]”/.test(w.message) || /\[unnamed concept\]/.test(w.message)), "ответ импорта en-пользователю: безымянный родитель — «[unnamed concept]»", { c: ir.json?.lineageCandidates, w: (ir.json?.warnings ?? []).map((w) => w.message.slice(0, 90)) });
    const gEn = await A.api("GET", `/syntheses/${I}`);
    ok(J(gEn.json?.synthesis?.fileConceptParents) === J(["[unnamed concept]", "[unnamed concept]"]), "GET /:id под en: fileConceptParents — подстановка по-английски", gEn.json?.synthesis?.fileConceptParents);
    const ancEn = await A.api("GET", `/syntheses/${I}/lineage/ancestors?depth=5`);
    const kids = ancEn.json?.tree?.children ?? [];
    ok(kids.length === 3 && kids[1]?.name === "[unnamed concept]" && kids[1]?.unnamed === true && kids[2]?.name === "[unnamed concept]" && kids[2]?.children?.[0]?.name === "Гегель", "/lineage/ancestors под en: имя подставлено, признак unnamed, ветка файла цела", kids);
    await setLocale(A, "ru");
    const ancRu = await A.api("GET", `/syntheses/${I}/lineage/ancestors?depth=5`);
    ok(ancRu.json?.tree?.children?.[1]?.name === "[безымянная концепция]" && (await A.api("GET", `/syntheses/${I}`)).json?.synthesis?.fileConceptParents?.[0] === "[безымянная концепция]", "под ru — русская подстановка");
    await setLocale(A, "en");
    // старая запись: русская заглушка в file_genealogy (до 14.2)
    await sql`update syntheses set file_genealogy=${sql.json({ type: "concept", name: "x", participants: [{ type: "philosopher", name: "Кант" }, { type: "concept", name: "[безымянная концепция]" }, { type: "philosopher", name: "[безымянный философ]" }] })} where id=${I}`;
    const oldEn = await A.api("GET", `/syntheses/${I}/lineage/ancestors?depth=5`);
    const ok2 = oldEn.json?.tree?.children ?? [];
    ok(ok2[1]?.name === "[unnamed concept]" && ok2[1]?.unnamed === true && ok2[2]?.name === "[unnamed philosopher]" && (await A.api("GET", `/syntheses/${I}`)).json?.synthesis?.fileConceptParents?.[0] === "[unnamed concept]", "старая запись с русскими заглушками при en — переводом", ok2);
    const exp2 = await A.api("GET", `/syntheses/${I}/export/html`);
    const st2 = JSON.parse(exp2.text.match(/<script type="application\/json" id="philosynth-state">\s*([\s\S]*?)\s*<\/script>/)[1]);
    ok(st2.genealogy?.participants?.[1]?.name === "[безымянная концепция]" && st2.genealogy?.participants?.[2]?.name === "[безымянный философ]" && !/\[unnamed/.test(exp2.text), "выгрузка под en — русское зеркало: заглушки по-русски, английских нет", st2.genealogy?.participants);
  }

  /* ════ R5: Д-59 (сервер) ════ */
  let D7 = null, D7noh4 = null;
  if (want("R5") || want("R7")) {
    console.log("\n■ R5: Д-59 (сервер) — subsectionTitles/sectionTitle");
    const DE = await account("de", "de");
    D7 = await seedDoc(DE.id, { title: `English doc ${TAG}`, order: ["sum", "theses", "graph"], visibility: "full", sections: [
      { key: "sum", num: 1, title: "Executive summary", html: ENG_SUM },
      { key: "theses", num: 2, title: "Corpus of theses", html: ENG_THESES },
      { key: "graph", num: 3, title: "Category graph", html: NOH4_GRAPH },
    ], lineage: ["Кант"] });
    const list = await DE.api("GET", `/syntheses/${D7}/sections`);
    const sum = list.json?.sections?.find((s) => s.key === "sum"), th = list.json?.sections?.find((s) => s.key === "theses"), gr = list.json?.sections?.find((s) => s.key === "graph");
    ok(list.status === 200 && sum?.sectionTitle === "Executive summary" && SUM_SUBS.every((n, i) => sum.subsectionTitles[n] === `English title ${i + 1}`) && J(sum.subsections) === J(SUM_SUBS), "GET /sections: английские <h4> и .section-title без ⏫/якорей; ключи subsections русские", sum && { t: sum.sectionTitle, map: sum.subsectionTitles });
    ok(th?.subsectionTitles?.["Онтологические тезисы"] === "Ontological theses" && th?.subsectionTitles?.["Сводная таблица тезисов"] === "Summary table of theses" && th?.sectionTitle === "Corpus of theses", "тезисы: карта ключ → английский заголовок", th?.subsectionTitles);
    ok(gr && GRAPH_SUBS.every((n) => gr.subsectionTitles[n] === n) && gr.sectionTitle === "Category graph", "документ без <h4>: карта ведёт на ключи", gr?.subsectionTitles);
    ok(!/⏫|subsec-/.test(J(list.json)), "⏫ и якоря оглавления в заголовки не попали");
    const full = await DE.api("GET", `/syntheses/${D7}/sections/sum`);
    ok(full.json?.section?.sectionTitle === "Executive summary" && full.json?.section?.subsectionTitles?.[SUM_SUBS[0]] === "English title 1", "GET /sections/:key несёт те же поля");
    const g = await guest.api("GET", `/syntheses/${D7}`, undefined, { "accept-language": "de" });
    const gs = g.json?.synthesis?.sections?.find((s) => s.key === "sum");
    ok(g.status === 200 && gs?.sectionTitle === "Executive summary" && gs?.subsectionTitles?.[SUM_SUBS[0]] === "English title 1", "гостевой документ одним ответом (visibility full) несёт subsectionTitles/sectionTitle", gs && { t: gs.sectionTitle });
    D7noh4 = D7;
    R7user = DE;
  }
  var R7user;

  /* ════ R6: Д-54 (браузер) ════ */
  if (want("R6")) {
    console.log("\n■ R6: Д-54 (браузер) — причина паузы по reasonKind, en/ru, старая пауза");
    const { G2: G, O } = R6docs;
    await setLocale(A, "en");
    let page = await newPage(A);
    let m = await openPauseModal(page, G);
    ok(m.reason === EN_MAXTOK, "en: причина собрана клиентом по reasonKind с числом", m.reason);
    ok(/Category graph/.test(m.modal) && !/Граф Категорий Концепции/.test(m.modal) && /max_tokens = 4.000/.test(m.modal) && /Section interrupted midway/.test(m.modal), "en: метка раздела по ключам, подсказка max_tokens, заголовок модалки по-английски", m.modal.slice(0, 500));
    ok(!(await exists(page, T("pause-reason-detail"))), "en: у max-tokens нет строки с сырым сообщением API");
    ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
    await page.browserContext().close();
    await setLocale(A, "ru");
    page = await newPage(A);
    m = await openPauseModal(page, G);
    ok(m.reason === RU_MAXTOK, "ru: прежняя русская фраза (порт _pauseFriendlyMessage) с числом", m.reason);
    ok(/Граф категорий/.test(m.modal) && /Раздел прерван в середине/.test(m.modal), "ru: метка раздела и заголовок как прежде", m.modal.slice(0, 300));
    await page.browserContext().close();
    // старая пауза — reason как есть на любом языке интерфейса
    await setLocale(A, "en");
    page = await newPage(A);
    m = await openPauseModal(page, O);
    ok(m.reason === OLD_REASON, "старая пауза (reason без новых полей) при en — текст как есть", m.reason);
    ok(!(await exists(page, T("pause-reason-detail"))), "старая пауза: детали нет");
    ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
    await page.browserContext().close();
  }

  /* ════ R7: Д-59 (браузер) ════ */
  if (want("R7")) {
    console.log("\n■ R7: Д-59 (браузер) — английский документ в немецком интерфейсе");
    const DE = R7user;
    const page = await newPage(DE, "de-DE,de");
    await openDoc(page, D7);
    await waitSel(page, "#docTOC .toc-sub-link a");
    const tocSections = await page.$$eval("#docTOC .toc-section-link a", (els) => els.map((e) => e.textContent.trim()));
    const tocSubs = await page.$$eval("#docTOC .toc-sub-link a", (els) => els.map((e) => [e.textContent.trim(), e.getAttribute("href")]));
    ok(tocSections.some((t) => /Executive summary$/.test(t)) && tocSections.some((t) => /Corpus of theses$/.test(t)) && tocSections.some((t) => /Category graph$/.test(t)), "оглавление: имена разделов — .section-title документа (английские), не tData(KEY_LABELS)", tocSections);
    ok(SUM_SUBS.every((n, i) => tocSubs.some(([t]) => t === `English title ${i + 1}`)) && tocSubs.some(([t]) => t === "Ontological theses"), "оглавление: имена подразделов — английские <h4>", tocSubs.slice(0, 9));
    ok(GRAPH_SUBS.every((n) => tocSubs.some(([t]) => t === n)), "документ без <h4> (граф): оглавление показывает ключи", tocSubs.slice(-GRAPH_SUBS.length));
    const first = tocSubs.find(([t]) => t === "English title 1");
    ok(first && first[1] === `#subsec-sum-${SUM_SUBS[0].replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, "_")}`, "якорь ссылки — по ключу data-section, не по заголовку", first);
    const topBefore = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => [...document.querySelectorAll("#docTOC .toc-sub-link a")].find((a) => a.textContent.trim() === "English title 3").click());
    await sleep(400);
    const after = await page.evaluate((id) => ({ hash: location.hash, el: !!document.getElementById(id), y: window.scrollY }), `subsec-sum-${SUM_SUBS[2].replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, "_")}`);
    ok(after.el && decodeURIComponent(after.hash) === `#subsec-sum-${SUM_SUBS[2].replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, "_")}` && after.y > topBefore, "клик по подразделу оглавления ведёт к нему (якорь по ключу, страница прокручена)", after);
    // шапка интерфейса — по-немецки (контроль языка интерфейса)
    const uiLang = await page.evaluate(() => ({ lang: document.documentElement.lang, toc: document.querySelector("#docTOC summary")?.textContent?.trim() ?? "" }));
    ok(uiLang.lang === "de" && /Inhalt/.test(uiLang.toc), "интерфейс немецкий (ui_locale): заголовок оглавления по-немецки", uiLang);
    // EditModal: кнопки подразделов карточки тезисов — английскими заголовками
    await page.evaluate(() => [...document.querySelectorAll(".actions-bar button")].find((b) => /✎/.test(b.innerText)).click());
    await waitSel(page, ".edit-modal");
    await waitSel(page, "#editCard-theses .edit-sec-btn");
    const btns = await page.$$eval("#editCard-theses .edit-sec-btn", (els) => els.map((e) => e.textContent.trim()).filter((t) => t.startsWith("⟳")));
    ok(btns.includes("⟳ Ontological theses") && btns.includes("⟳ Summary table of theses") && !btns.includes("⟳ Онтологические тезисы"), "EditSectionCard: кнопки подразделов — английские заголовки, не ключи", btns);
    const gbtns = await page.$$eval("#editCard-graph .edit-sec-btn", (els) => els.map((e) => e.textContent.trim()).filter((t) => t.startsWith("⟳")));
    ok(GRAPH_SUBS.every((n) => gbtns.includes(`⟳ ${n}`)), "карточка графа без <h4>: кнопки — ключи", gbtns);
    await page.evaluate(() => [...document.querySelectorAll("#editCard-theses .edit-sec-btn")].find((b) => b.textContent.trim() === "⟳ Ontological theses").click());
    await page.waitForFunction(() => /⟳ Ontological theses/.test(document.querySelector("#editCard-theses")?.innerText ?? "") && /Онтологические тезисы/.test(document.querySelector("#editCard-theses")?.innerText ?? "") === false, { timeout: 10000 }).catch(() => {});
    const cardText = await text(page, "#editCard-theses");
    ok(/⟳ Ontological theses/.test(cardText) && !/Онтологические тезисы/.test(cardText.replace(/data-section/g, "")), "панель точечной перегенерации: заголовок подраздела, ключа нет в тексте", cardText.slice(0, 400));
    ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
    await page.browserContext().close();
    void D7noh4;
  }
} catch (e) {
  failed++;
  console.log("  ✗ ПРОГОН ПРЕРВАН: " + (e?.stack ?? e));
  if (lastPage && !lastPage.isClosed()) { try { console.log("  [страница] " + lastPage.url() + "\n" + (await lastPage.evaluate(() => document.body.innerText)).slice(0, 1500) + "\n  [ошибки] " + J(lastPage.errors)); } catch {} }
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch {} }
  mockSrv.close();
  for (const id of ids) await sql`delete from syntheses where id=${id}`.catch(() => {});
  for (const id of userIds) await sql`delete from syntheses where user_id=${id}`.catch(() => {});
  for (const id of userIds) await sql`delete from users where id=${id}`.catch(() => {});
  await sql.end({ timeout: 2 });
}
console.log(`\nИТОГ test-142: ${passed} ✓ / ${failed} ✗${fails.length ? "\n  провалы: " + fails.join(" | ") : ""}`);
process.exit(failed ? 1 : 0);
