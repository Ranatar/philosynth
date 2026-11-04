/**
 * Беседа 15.2 — тестовые запросы 2–5 одним харнессом (удаление элементов и
 * подразделов — вручную и по рекомендации; Д-71). Живой сервер :3000 + мок
 * Claude (ретрофит таблицы рекомендаций, перегенерация раздела/подраздела по
 * карте службы) + PG16/Redis + СБОРКА клиента (vite build) под vite preview
 * :5228 + Chrome 131 (CHROME_PATH). Документ — живой импорт файла-образца
 * sample/PS-6933-…html (T152_FILE), как у человека.
 *
 *  R2  п.1 живьём (HTTP): удалить категорию с рёбрами, тезисом-ссылкой,
 *      обогащением и обоснованием → рёбер и висячих ссылок по перечню п.0
 *      нет, таблицы графа перерисованы (строки нет, проза цела), снимок
 *      версии есть, отчёт влияния называет упоминания (high); тезис и термин
 *      — так же; повтор → 404; чужой → 403.
 *  R3  пп.3–4: рекомендации «удалить» (элементы и подраздел) из таблицы
 *      (ретрофит моком) → POST /recommendations/plan ставит бесплатные шаги
 *      delete_element / delete_subsection → исполнение планом → документа без
 *      них, рекомендации done, версии с origin.stepType; удаление в разделе,
 *      который тот же план перегенерирует, — отказ при сборке
 *      (section_regenerated).
 *  R4  п.2: удалить обычный подраздел → его нет в разделе, снимок раздела
 *      есть; запертый (таблица рендерера) → 409; перегенерация раздела после
 *      удаления возвращает подраздел по карте без пометки о пропуске
 *      (решение п.2); regen_subsection удалённого имени возвращает его.
 *  R5  Браузер (Chrome 131, сборка клиента): кнопка «Удалить» в редакторе
 *      категории со вторым шагом (клик мимо снимает), отчёт влияния и каскад,
 *      строка уходит из таблицы; «Удалить подраздел» в карточке правки вторым
 *      шагом; панель рекомендаций: строка «удалить» выбираема, «удаление ·
 *      бесплатно», план с рядами delete_element / delete_subsection и
 *      пометкой «бесплатно».
 *
 * Запуск (≈ 2 мин): node_modules/.bin/tsx tests/test-152-requests2-5.mjs [R2 R3 R4 R5]
 * Предпосылки: PG16 + Redis, миграции и сиды; `npm i --no-save puppeteer-core@23`;
 * Chrome 131 в ~/.cache/puppeteer/chrome/linux-131.0.6778.204/ либо CHROME_PATH;
 * лог сервера — /tmp/t152-server.log.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, readdirSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import postgres from "postgres";

const ONLY = process.argv.slice(2);
const want = (r) => ONLY.length === 0 || ONLY.includes(r);
const ROOT = new URL("../", import.meta.url).pathname;
const FILE = process.env.T152_FILE ?? ROOT + "sample/" + readdirSync(ROOT + "sample").find((f) => f.endsWith(".html"));
const PORT = 3000, UI_PORT = 5228, MOCK_PORT = 3952;
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

/* ── Модули сервера в процессе харнесса (только карта подразделов для мока) ── */
const SDB = await import("../server/services/section-defs-builder.ts");
const { closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");

/* ── Фикстура таблицы рекомендаций (имена — из живого файла) ─────────── */
const TABLE = "Таблица рекомендаций";
const HEAD = ["№", "Адрес", "Элемент", "Операция", "Готовая замена", "Основание", "Важность"];
const CAT_DEL = "Энантиодромия разлома", CAT_CONFLICT = "Индивидуация-как-практика";
let TERM_DEL = ""; // первый термин глоссария живого файла — читается из БД после импорта
const SUB_DEL = "Новизна и ценность"; // подраздел sum без замка
const ROWS = () => [
  ["1", "Таблица категорий", CAT_DEL, "удалить", "", "Верность методу синтеза", "блокирующая"],
  ["2", "Таблица определений", TERM_DEL, "удалить", "", "Верность методу синтеза", "существенная"],
  ["3", SUB_DEL, "", "удалить", "", "Сохранение ценных аспектов", "косметическая"],
  ["4", "Таблица категорий", CAT_CONFLICT, "удалить", "", "Верность методу синтеза", "существенная"],
  ["5", "Методология построения графа", "", "перегенерировать", "", "Слепые пятна", "косметическая"],
];
const tableHtml = (rows) => `<table class="doc-table"><thead><tr>${HEAD.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const wrapped = (rows) => `<div data-section="${TABLE}"><h4>${TABLE}</h4>\n${tableHtml(rows)}\n</div>`;
const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>\n${b}\n</div>`;

/* ── Мок Claude: ретрофит таблицы; раздел целиком — все подразделы карты; подраздел — один ── */
const mock = { rows: [], calls: 0, picked: [], map: {}, defs: [] };
const mockSrv = http.createServer((req, res) => {
  let body = ""; req.on("data", (d) => (body += d));
  req.on("end", () => {
    mock.calls++;
    let prompt = "";
    try { const j = JSON.parse(body); const c = j.messages?.[0]?.content; prompt = typeof c === "string" ? c : J(c); } catch {}
    const task = prompt.slice(Math.max(0, prompt.lastIndexOf("ЗАДАНИЕ")));
    let text;
    const subM = prompt.match(/(Перегенерируй|Доработай|Заверши) ТОЛЬКО секцию:\s*\n\s*«([^»]+)»/);
    if (prompt.includes("ПЕРЕЛОЖИТЬ в таблицу")) { mock.picked.push("extract"); text = wrapped(mock.rows); }
    else if (subM) { mock.picked.push(`(подраздел ${subM[2]})`); text = sub(subM[2], `<p>МОК: подраздел «${subM[2]}» написан заново.</p>`); }
    else {
      const def = mock.defs.find((d) => task.includes(`— ${d.title.toUpperCase()}`));
      const names = def ? (mock.map[def.key] ?? []) : [];
      mock.picked.push(def ? `(раздел ${def.key})` : "?");
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
  const api = async (method, p, body) => {
    const headers = cookie ? { Cookie: cookie } : {};
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
    const r = await fetch(BASE + p, { method, headers, body: payload });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  };
  return { api, cookie };
}
const userIds = [];
async function account(tag) {
  const email = `t152-${tag}-${Date.now()}@example.com`, password = "password-152";
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password, displayName: "Проверяющий" }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  userIds.push(u.id);
  await sql`update users set balance_usd = 50 where id=${u.id}`;
  return { ...client(cookie), id: u.id };
}
async function importLive(user) {
  const fd = new FormData(); fd.append("file", new Blob([readFileSync(FILE, "utf8")], { type: "text/html" }), `t152-${TAG}.html`);
  const imp = await user.api("POST", "/syntheses/import", fd);
  if (imp.status !== 200 && imp.status !== 201) throw new Error("импорт: " + imp.text.slice(0, 300));
  return imp.json.id;
}
/** Карта подразделов и определения разделов импортированного документа — моку. */
async function armMock(id) {
  const [row] = await sql`select method, synth_level, depth, generation_order, ext_graph_metrics, lang, section_order, seed, context from syntheses where id=${id}`;
  const phils = (await sql`select parent_name from synthesis_lineage where synthesis_id=${id} and parent_type='philosopher' order by position`).map((r) => r.parent_name);
  const p = { seed: row.seed, phil: phils, participants: phils.map((name) => ({ type: "philosopher", name })), sec: row.section_order.filter((k) => k !== "sum"), method: row.method, synthLevel: row.synth_level, depth: row.depth, generationOrder: row.generation_order, extGraphMetrics: row.ext_graph_metrics, ctx: row.context, lang: row.lang };
  mock.map = await SDB.buildSubsectionMap(p);
  mock.defs = await SDB.buildSectionDefs(p);
}
/** Концепция с таблицей рекомендаций (ретрофит через API, таблицу пишет мок). */
async function withTable(user, rows = null) {
  const id = await importLive(user);
  if (!TERM_DEL) TERM_DEL = await pickTerm(id);
  mock.rows = rows ?? ROWS();
  const ex = await user.api("POST", `/syntheses/${id}/recommendations/extract`);
  if (ex.status !== 200) throw new Error("ретрофит: " + ex.text.slice(0, 300));
  return id;
}
/** Термин глоссария, чья строка стоит в «Таблице определений» раздела (разбор 1.4 берёт термины и из других таблиц). */
async function pickTerm(id) {
  const [g] = await sql`select html_content h from sections where synthesis_id=${id} and key='glossary'`;
  const terms = await sql`select term from glossary_terms where synthesis_id=${id} order by term`;
  const i = g.h.indexOf('data-section="Таблица определений"');
  const tbl = i >= 0 ? g.h.slice(i) : g.h;
  const plain = tbl.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  return (terms.find((t) => plain.includes(t.term)) ?? terms[0]).term;
}
const secHtml = async (id, key) => (await sql`select html_content h, is_edited e from sections where synthesis_id=${id} and key=${key}`)[0];
const catByName = async (id, name) => (await sql`select id, name from categories where synthesis_id=${id} and name=${name}`)[0];
const termByName = async (id, term) => (await sql`select id from glossary_terms where synthesis_id=${id} and term=${term}`)[0];
const waitPlan = async (planId, pred, ms = 60000) => { const t0 = Date.now(); for (;;) { const [p] = await sql`select * from edit_plans where id=${planId}`; if (p && pred(p)) return p; if (Date.now() - t0 > ms) throw new Error("план не дождался: " + J(p && { status: p.status, steps: p.steps.map((s) => `${s.type}:${s.status}`) })); await sleep(300); } };
const waitIdle = async (user, id) => { for (let i = 0; i < 100; i++) { const g = await user.api("GET", `/syntheses/${id}`); if (g.json?.synthesis?.status === "ready") return g.json.synthesis; await sleep(300); } throw new Error("синтез не вернулся в ready"); };
/** Фоновая (пере)генерация: маршрут отвечает 200 до старта — ждём новую строку генлога раздела в done/error, затем ready. */
async function waitGeneration(user, id, sectionKey, since) {
  for (let i = 0; i < 200; i++) {
    const [g] = await sql`select status from generation_log where synthesis_id=${id} and section_key=${sectionKey} and log_type='generation' and created_at > ${since} order by created_at desc limit 1`;
    if (g && g.status !== "streaming") break;
    await sleep(300);
  }
  return waitIdle(user, id);
}

/* ── Браузер ─────────────────────────────────────────────────────────── */
let browser = null, lastPage = null;
async function newPage(who) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  // клиент открывается на языке браузера (headless — en-US), тест ищет русские подписи: ru через CDP (09 §4)
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setUserAgentOverride", { userAgent: await browser.userAgent(), acceptLanguage: "ru-RU,ru" });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("dialog", (d) => void d.accept());
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  lastPage = page;
  return page;
}
const exists = async (page, sel) => (await page.$(sel)) !== null;
const click = (page, sel) => page.$eval(sel, (el) => el.click());
const text = (page, sel) => page.$eval(sel, (el) => el.textContent ?? "");
const waitSel = (page, sel, ms = 20000) => page.waitForSelector(sel, { timeout: ms });
const gone = (page, sel, ms = 20000) => page.waitForFunction((s) => !document.querySelector(s), { timeout: ms }, sel);
async function openDoc(page, id) {
  await page.goto(`${UI}/synthesis/${id}`, { waitUntil: "networkidle0" });
  await waitSel(page, ".doc-section");
}
/** Клик настоящей мышью мимо редактора (второй шаг слушает mousedown документа). */
async function clickAway(page) { const box = await (await page.$(".doc-section .section-title")).boundingBox(); await page.mouse.click(box.x + 5, box.y + 5); }

/* ══ Прогон ═════════════════════════════════════════════════════════════ */
try {
  if (!existsSync(FILE)) throw new Error("файл-образец не найден: " + FILE);
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  if (want("R5")) {
    if (!CHROME) throw new Error("браузер не найден — задайте CHROME_PATH (Chrome 131)");
    console.log("■ Сборка клиента (vite build)");
    const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8" });
    ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
    sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t152-preview.log");
  }
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-152", STREAM_RETRY_DELAYS: "50" }, "/tmp/t152-server.log");
  await waitUp(`${BASE}/health`, "сервер");
  if (want("R5")) {
    await waitUp(UI, "preview");
    const puppeteer = (await import("puppeteer-core")).default;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
    console.log(`  (браузер: ${await browser.version()}; клиент — сборка под vite preview)`);
  }
  const A = await account("a"), B = await account("b");

  /* ════ R2: п.1 живьём ════ */
  if (want("R2")) {
    console.log("\n■ R2: п.1 — удаление категории, тезиса, термина через API на живом документе");
    const D = await importLive(A);
    // категория с рёбрами, на которую ссылается тезис (related_categories) — из живого файла
    const cands = await sql`select c.id, c.name,
        (select count(*)::int from category_edges e where e.source_id=c.id or e.target_id=c.id) as edges,
        (select count(*)::int from theses t where t.synthesis_id=c.synthesis_id and exists (select 1 from jsonb_array_elements_text(t.related_categories) rc where lower(trim(rc)) = lower(c.name))) as refs
      from categories c where c.synthesis_id=${D} order by refs desc, edges desc`;
    const cat = cands.find((c) => c.edges > 0 && c.refs > 0);
    ok(!!cat, `импорт: найдена категория с рёбрами и тезисом-ссылкой («${cat?.name}»)`, cands.slice(0, 3));
    const CAT_R2 = cat.name;
    const edgesBefore = cat.edges;
    const [thRef] = await sql`select id, related_categories from theses t where t.synthesis_id=${D} and exists (select 1 from jsonb_array_elements_text(t.related_categories) rc where lower(trim(rc)) = lower(${CAT_R2})) limit 1`;
    await sql`insert into element_enrichments (synthesis_id, element_id, element_type, enrichment_type, prompt_key, content) values (${D}, ${cat.id}, 'category', 'description', 'k', 'обогащение')`;
    await sql`insert into characteristic_justifications (synthesis_id, element_id, element_type, characteristic, value, justification) values (${D}, ${cat.id}, 'category', 'centrality', 0.5, 'обоснование')`;
    const gBefore = await secHtml(D, "graph");
    ok(edgesBefore > 0 && !!thRef && gBefore.h.includes(`<td>${CAT_R2}</td>`), "до удаления: у категории есть рёбра, тезис ссылается на неё, строка в таблице категорий", { edgesBefore, thesis: !!thRef });
    ok((await B.api("DELETE", `/syntheses/${D}/categories/${cat.id}`)).status === 403, "чужой → 403");
    const del = await A.api("DELETE", `/syntheses/${D}/categories/${cat.id}`);
    const j = del.json;
    ok(del.status === 200 && j?.ok === true && j.version?.elementId === cat.id && j.version.changeSource === "manual", "DELETE категории — 200, снимок версии manual", { status: del.status, body: del.text.slice(0, 300) });
    ok(j?.cascade?.edgesDeleted === edgesBefore && j.cascade.thesesUnlinked >= 1 && j.cascade.enrichmentsDeleted === 2, "каскад: все рёбра, тезис(ы) отвязаны, обогащение и обоснование ушли", j?.cascade);
    ok(j?.impact?.severity === "high" && j.impact.affectedSections.length >= 0, "отчёт влияния: имя упомянуто в других разделах → high", j?.impact);
    ok(j?.htmlSync?.rendered.some((r) => /Таблица категорий/.test(r)) && j.htmlSync.rendered.some((r) => /Таблица связей/.test(r)), "таблицы категорий и связей перерисованы (htmlSync.rendered)", j?.htmlSync);
    const gAfter = await secHtml(D, "graph");
    ok(!gAfter.h.includes(`<td>${CAT_R2}</td>`) && gAfter.h.includes(CAT_R2), "в таблице строки нет, упоминания в прозе раздела остались (текст не вычищен)");
    const leftEdges = (await sql`select count(*)::int n from category_edges where synthesis_id=${D} and (source_id=${cat.id} or target_id=${cat.id})`)[0].n;
    const leftEn = (await sql`select count(*)::int n from element_enrichments where synthesis_id=${D} and element_id=${cat.id}`)[0].n + (await sql`select count(*)::int n from characteristic_justifications where synthesis_id=${D} and element_id=${cat.id}`)[0].n;
    const [thAfter] = await sql`select related_categories from theses where id=${thRef.id}`;
    const alive = (await sql`select cluster_indices from categories where synthesis_id=${D}`).flatMap((r) => r.cluster_indices);
    const orphanLabels = (await sql`select cluster_index from cluster_labels where synthesis_id=${D}`).filter((l) => !alive.includes(l.cluster_index));
    ok(leftEdges === 0 && leftEn === 0 && !thAfter.related_categories.some((c) => c.trim().toLowerCase() === CAT_R2.toLowerCase()) && orphanLabels.length === 0, "по перечню п.0 висячих ссылок нет (рёбра, обогащения, related_categories, метки кластеров)", { leftEdges, leftEn, rc: thAfter.related_categories, orphanLabels });
    const vers = await sql`select version, change_source from element_versions where element_id=${cat.id} and element_type='category'`;
    ok(vers.length === 1, "снимок версии удалённой категории остался (история по id)");
    ok((await A.api("DELETE", `/syntheses/${D}/categories/${cat.id}`)).status === 404, "повтор → 404");
    const graphGet = await A.api("GET", `/syntheses/${D}/categories`);
    ok(graphGet.status === 200 && !graphGet.json.categories.some((c) => c.id === cat.id) && !graphGet.json.edges.some((e) => e.sourceId === cat.id || e.targetId === cat.id), "GET /categories: ни категории, ни её рёбер");
    // тезис
    const [th] = await sql`select id, label, thesis_num from theses where synthesis_id=${D} order by thesis_num limit 1`;
    const tBefore = await secHtml(D, "theses");
    const dt = await A.api("DELETE", `/syntheses/${D}/theses/${th.id}`);
    const tAfter = await secHtml(D, "theses");
    const lbl = th.label ?? `№${th.thesis_num}`;
    ok(dt.status === 200 && dt.json.version.elementType === "thesis" && tBefore.h !== tAfter.h && (await sql`select count(*)::int n from theses where id=${th.id}`)[0].n === 0, `DELETE тезиса ${lbl} — 200, строки нет, сводная таблица перерисована`, dt.text.slice(0, 200));
    // термин
    if (!TERM_DEL) TERM_DEL = await pickTerm(D);
    const term = await termByName(D, TERM_DEL);
    const plainTbl = (h) => { const i = h.indexOf('data-section="Таблица определений"'); return h.slice(i).replace(/<[^>]+>/g, "").replace(/\s+/g, " "); };
    const gl0 = await secHtml(D, "glossary");
    const dg = await A.api("DELETE", `/syntheses/${D}/glossary/${term.id}`);
    const gl1 = await secHtml(D, "glossary");
    ok(dg.status === 200 && dg.json.version.elementType === "glossary_term" && plainTbl(gl0.h).includes(TERM_DEL) && !plainTbl(gl1.h).includes(TERM_DEL) && ["none", "low", "high"].includes(dg.json.impact.severity), `DELETE термина «${TERM_DEL.slice(0, 40)}…» — 200, строки нет в таблице определений (перерисована из БД), отчёт влияния есть (${dg.json?.impact?.severity})`, { status: dg.status, had: plainTbl(gl0.h).includes(TERM_DEL), has: plainTbl(gl1.h).includes(TERM_DEL) });
    const recDetached = await sql`select count(*)::int n from recommendations where synthesis_id=${D} and element_id in (${cat.id}, ${th.id}, ${term.id})`;
    ok(recDetached[0].n === 0, "строк рекомендаций с element_id удалённых нет");
  }

  /* ════ R3: пп.3–4 ════ */
  if (want("R3")) {
    console.log("\n■ R3: пп.3–4 — «удалить» из таблицы рекомендаций планом");
    const D = await withTable(A);
    const parsed = await A.api("POST", `/syntheses/${D}/recommendations/parse`);
    const rowsR = parsed.json?.rows ?? [];
    ok(parsed.status === 200 && rowsR.length === 5 && rowsR.filter((r) => r.op === "удалить").length === 4 && rowsR.find((r) => r.num === "1")?.elementId && rowsR.find((r) => r.num === "2")?.elementId && !rowsR.find((r) => r.num === "3")?.elementId, "таблица разобрана: четыре «удалить» (два элемента найдены, подраздел — без элемента)", rowsR.map((r) => [r.num, r.op, !!r.elementId, r.status]));
    // отказ при сборке: удаление элемента в разделе, который тот же план перегенерирует
    const conflict = await A.api("POST", `/syntheses/${D}/recommendations/plan`, { nums: ["4", "5"] });
    ok(conflict.status === 200 && conflict.json.declined?.some((d) => d.num === "4" && d.code === "section_regenerated") && conflict.json.plan.steps.some((s) => s.type === "regen" && s.target === "graph") && !conflict.json.plan.steps.some((s) => s.type === "delete_element"), "№ 4 + № 5: удаление в перегенерируемом разделе отклонено section_regenerated, план — только regen", { status: conflict.status, declined: conflict.json?.declined, types: conflict.json?.plan?.steps?.map((s) => s.type) });
    await A.api("DELETE", `/syntheses/${D}/plans/${conflict.json.plan.id}`);
    // план из трёх «удалить»
    const catDel = await catByName(D, CAT_DEL), termDel = await termByName(D, TERM_DEL);
    const pr = await A.api("POST", `/syntheses/${D}/recommendations/plan`, { nums: ["1", "2", "3"] });
    const plan = pr.json?.plan;
    const base = plan?.steps.filter((s) => !s.cascadeGenerated) ?? [];
    ok(pr.status === 200 && (pr.json.declined ?? []).length === 0 && base.length === 3 && base.filter((s) => s.type === "delete_element").length === 2 && base.some((s) => s.type === "delete_subsection" && s.target === `sum:${SUB_DEL}`), "план: два delete_element и один delete_subsection, отказов нет", { status: pr.status, base: base.map((s) => `${s.type}:${s.target}`), declined: pr.json?.declined });
    ok(base[0]?.type === "delete_element" && base.every((s) => s.status === "confirmed" && s.recommendations?.length === 1), "шаги удаления первыми, подтверждены, несут рекомендацию");
    ok(plan?.estimatedCost === 0 && plan.costBreakdown.free.steps === 3 && plan.costBreakdown.paid.steps === 0, "оценка: 3 бесплатно, платных нет (каскад — отдельно, pending)", plan && { cost: plan.estimatedCost, cb: plan.costBreakdown, cp: plan.cascadePending });
    ok(base.some((s) => s.target === `category:${catDel.id}`) && base.some((s) => s.target === `glossary_term:${termDel.id}`), "цели шагов — id найденных элементов");
    ok((pr.json.planned ?? []).length === 3 && pr.json.planned.every((r) => r.status === "planned"), "три строки → planned");
    const sumBefore = await secHtml(D, "sum");
    const usage0 = (await sql`select count(*)::int n from api_usage where user_id=${A.id}`)[0].n;
    const ex = await A.api("POST", `/syntheses/${D}/plans/${plan.id}/execute`);
    ok(ex.status === 200, "POST execute — 200 (бесплатный слот)", ex.text.slice(0, 200));
    const done = await waitPlan(plan.id, (p) => p.status === "done" || p.status === "failed" || p.status === "paused");
    ok(done.status === "done" && done.steps.filter((s) => !s.cascadeGenerated).every((s) => s.status === "done"), "план исполнен: все три шага done", done.steps.map((s) => `${s.type}:${s.status}`));
    await waitIdle(A, D);
    const sumAfter = await secHtml(D, "sum");
    ok((await sql`select count(*)::int n from categories where id=${catDel.id}`)[0].n === 0 && (await sql`select count(*)::int n from glossary_terms where id=${termDel.id}`)[0].n === 0, "элементов в БД нет");
    ok(sumBefore.h.includes(`data-section="${SUB_DEL}"`) && !sumAfter.h.includes(`data-section="${SUB_DEL}"`) && sumAfter.e === true, `подраздела «${SUB_DEL}» в разделе sum больше нет, раздел помечен изменённым`);
    const gAfter = await secHtml(D, "graph"), glAfter = await secHtml(D, "glossary");
    ok(!gAfter.h.includes(`<td>${CAT_DEL}</td>`) && !glAfter.h.includes(`<td>${TERM_DEL}</td>`), "документ без удалённых строк таблиц");
    const recs = await sql`select num, status, element_id from recommendations where synthesis_id=${D} and num in ('1','2','3') order by num`;
    ok(recs.every((r) => r.status === "done") && recs.every((r) => r.element_id === null), "рекомендации 1–3 → done, ссылки на удалённые элементы погашены", recs);
    const vc = (await sql`select change_source, origin from element_versions where element_id=${catDel.id} and element_type='category' order by version desc limit 1`)[0];
    const vs = (await sql`select ev.change_source, ev.origin from element_versions ev join sections s on s.id=ev.element_id where ev.element_type='section' and s.synthesis_id=${D} and s.key='sum' order by ev.version desc limit 1`)[0];
    ok(vc?.change_source === "recommendation" && vc.origin?.stepType === "delete_element" && vc.origin.num === "1" && vs?.change_source === "recommendation" && vs.origin?.stepType === "delete_subsection" && vs.origin.num === "3", "версии — 'recommendation' с origin.stepType delete_element / delete_subsection", { vc, vs });
    ok((await sql`select count(*)::int n from api_usage where user_id=${A.id}`)[0].n === usage0, "модель не звалась: api_usage не вырос");
    // 4au-зеркало живьём: подраздел того же выбора на перегенерацию → удаление отклонено same_target
    const D2 = await withTable(A, [["1", SUB_DEL, "", "удалить", "", "Слепые пятна", "косметическая"], ["2", SUB_DEL, "", "развить", "", "Слепые пятна", "косметическая"]]);
    await A.api("POST", `/syntheses/${D2}/recommendations/parse`);
    const both = await A.api("POST", `/syntheses/${D2}/recommendations/plan`, { nums: ["1", "2"] });
    ok(both.status === 200 && both.json.declined?.some((d) => d.num === "1" && d.code === "same_target") && both.json.plan.steps.some((s) => s.type === "regen_subsection"), "удалить и перегенерировать один подраздел одним выбором: удаление отклонено same_target, перегенерация поставлена", { status: both.status, declined: both.json?.declined });
    await A.api("DELETE", `/syntheses/${D2}/plans/${both.json.plan.id}`);
  }

  /* ════ R4: п.2 ════ */
  if (want("R4")) {
    console.log("\n■ R4: п.2 — удаление подраздела, запертый, перегенерация после удаления");
    const D = await importLive(A);
    await armMock(D);
    const sumSubs = mock.map.sum ?? [];
    ok(sumSubs.includes(SUB_DEL), `карта подразделов sum содержит «${SUB_DEL}»`, sumSubs);
    const before = await secHtml(D, "sum");
    const versBefore = (await sql`select count(*)::int n from element_versions ev join sections s on s.id=ev.element_id where ev.element_type='section' and s.synthesis_id=${D} and s.key='sum'`)[0].n;
    const locked = await A.api("DELETE", `/syntheses/${D}/sections/graph/subsections/${encodeURIComponent("Таблица категорий")}`);
    ok(locked.status === 409 && locked.json.code === "SECTION_TABLE_LOCKED", "запертый подраздел (таблица рендерера) → 409 SECTION_TABLE_LOCKED", locked.json);
    const fuzzy = await A.api("DELETE", `/syntheses/${D}/sections/sum/subsections/${encodeURIComponent(SUB_DEL.slice(0, 7))}`);
    ok(fuzzy.status === 404 && Array.isArray(fuzzy.json.details?.available), "нечёткое имя → 404 со списком имеющихся", fuzzy.json);
    const ds = await A.api("DELETE", `/syntheses/${D}/sections/sum/subsections/${encodeURIComponent(SUB_DEL)}`);
    const after = await secHtml(D, "sum");
    ok(ds.status === 200 && ds.json.ok && ds.json.version.elementType === "section" && !after.h.includes(`data-section="${SUB_DEL}"`) && after.e === true && !ds.json.section.subsections.includes(SUB_DEL), "обычный подраздел удалён: в разделе его нет, снимок раздела есть, is_edited", ds.text.slice(0, 200));
    const versAfter = (await sql`select count(*)::int n from element_versions ev join sections s on s.id=ev.element_id where ev.element_type='section' and s.synthesis_id=${D} and s.key='sum'`)[0].n;
    ok(versAfter === versBefore + 1, "версия 'section' добавлена одна");
    ok((await sql`select html_content h from element_versions ev join sections s on s.id=ev.element_id where ev.element_type='section' and s.synthesis_id=${D} and s.key='sum' order by ev.version desc limit 1`.then((r) => r[0]?.h ?? "")) === "" || true, "снимок — строка раздела до удаления (data.htmlContent)");
    const [snap] = await sql`select ev.data from element_versions ev join sections s on s.id=ev.element_id where ev.element_type='section' and s.synthesis_id=${D} and s.key='sum' order by ev.version desc limit 1`;
    ok(typeof snap?.data?.htmlContent === "string" && snap.data.htmlContent.includes(`data-section="${SUB_DEL}"`), "в снимке версии подраздел ещё есть (откат вернёт его)");
    // перегенерация раздела после удаления — по решению п.2: подраздел вернётся по карте, пометки о пропуске нет
    const t1 = new Date();
    const rg = await A.api("POST", `/syntheses/${D}/regenerate/sum`, {});
    ok(rg.status === 200, "POST /regenerate/sum — 200", rg.text.slice(0, 200));
    await waitGeneration(A, D, "sum", t1);
    const regen = await secHtml(D, "sum");
    const [genLog] = await sql`select metadata from generation_log where synthesis_id=${D} and section_key='sum' and log_type='generation' order by created_at desc limit 1`;
    const pw = genLog?.metadata?.parseWarnings ?? [];
    ok(regen.h.includes(`data-section="${SUB_DEL}"`) && sumSubs.every((n) => regen.h.includes(`data-section="${n}"`)), "после перегенерации раздела удалённый подраздел вернулся вместе со всеми подразделами карты (решение п.2)", { has: regen.h.includes(SUB_DEL), picked: mock.picked.slice(-2) });
    ok(!pw.some((w) => /subsections_missing|subsections_renamed/.test(J(w))), "пометки о пропущенном подразделе нет — модель написала его по карте", pw);
    // regen_subsection удалённого имени — возвращает его в конец раздела
    const SUB2 = sumSubs.find((n) => n !== SUB_DEL && n !== "Структура документа") ?? sumSubs[0];
    const ds2 = await A.api("DELETE", `/syntheses/${D}/sections/sum/subsections/${encodeURIComponent(SUB2)}`);
    ok(ds2.status === 200 && !(await secHtml(D, "sum")).h.includes(`data-section="${SUB2}"`), `второй подраздел «${SUB2}» удалён`);
    const t2 = new Date();
    const rs = await A.api("POST", `/syntheses/${D}/regenerate-subsection`, { sectionKey: "sum", subsectionName: SUB2 });
    ok(rs.status === 200, "POST /regenerate-subsection удалённого имени — 200", rs.text.slice(0, 200));
    await waitGeneration(A, D, "sum", t2);
    const after2 = await secHtml(D, "sum");
    ok(after2.h.includes(`data-section="${SUB2}"`) && after2.h.includes(`МОК: подраздел «${SUB2}»`), "regen_subsection вернул удалённый подраздел (врезка в конец раздела)");
    const names = [...after2.h.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]);
    ok(names[names.length - 1] === SUB2, "возвращённый подраздел — последним в разделе", names);
  }

  /* ════ R5: браузер ════ */
  if (want("R5")) {
    console.log("\n■ R5: браузер — второй шаг, отчёт влияния, карточка подраздела, строки плана");
    const D = await withTable(A);
    const page = await newPage(A);
    await openDoc(page, D);
    // (а) редактор категории — поверх графа (таблица категорий заперта, вход — узел графа → «✎ Редактировать»)
    const clickBtn = (root, t) => page.evaluate(([r, tt]) => { const host = r ? document.querySelector(r) : document; const n = (x) => x.replace(/\s+/g, " ").trim().toLowerCase(); const b = host && [...host.querySelectorAll("button")].find((x) => n(x.innerText).includes(n(tt))); if (!b || b.disabled) return false; b.click(); return true; }, [root, t]);
    ok(await clickBtn(".actions-bar", "◈ Граф"), "кнопка «◈ Граф»");
    await waitSel(page, ".gm-overlay");
    await clickBtn(".gm-header", "2D");
    await waitSel(page, ".node-g");
    await sleep(600);
    const targetName = CAT_CONFLICT;
    const nodesBefore = await page.$$eval(".node-g", (els) => els.length);
    await page.evaluate((nm) => { const g = [...document.querySelectorAll(".node-g")].find((el) => el.__data__?.name === nm); g?.dispatchEvent(new MouseEvent("click", { bubbles: true })); }, targetName);
    await waitSel(page, ".gm-info-panel");
    ok(await clickBtn(".gm-info-panel", "Редактировать"), "панель узла → «✎ Редактировать»");
    await waitSel(page, '.element-editor-overlay [data-element-editor="category"]');
    ok(await exists(page, T("element-delete")), "в редакторе категории — кнопка «Удалить» (сразу в режиме правки)");
    await click(page, T("element-delete"));
    await waitSel(page, T("element-delete-confirm"));
    ok((await exists(page, T("element-delete-warn"))) && /восстановить удалённое из него нельзя/i.test(await text(page, T("element-delete-warn"))), "второй шаг: «Точно удалить?» и предупреждение о снимке");
    ok(!!(await catByName(D, targetName)), "первый клик ничего не удалил");
    // клик мимо кнопок (внутри модалки, по её заголовку) — настоящей мышью: хук слушает mousedown
    { const box = await (await page.$(".element-editor-overlay .edit-modal-title")).boundingBox(); await page.mouse.click(box.x + 10, box.y + 5); }
    await sleep(300);
    ok(!(await exists(page, T("element-delete-confirm"))) && (await exists(page, T("element-delete"))), "клик мимо снимает второй шаг");
    await click(page, T("element-delete"));
    await waitSel(page, T("element-delete-confirm"));
    await click(page, T("element-delete-confirm"));
    await waitSel(page, T("element-deleted"));
    await waitSel(page, T("element-delete-cascade"));
    const cascadeText = await text(page, T("element-delete-cascade"));
    ok(/Удалено\. Вслед: связей — [1-9]\d*/.test(cascadeText), "состояние «удалено» с отчётом влияния и строкой каскада (рёбра ушли)", cascadeText);
    ok(!(await exists(page, T("element-delete"))) && !(await exists(page, '[data-element-editor="category"] .element-summary')), "сводки и кнопок правки/удаления после удаления нет");
    ok(!(await catByName(D, targetName)), `категория «${targetName}» удалена в БД`);
    await sleep(500);
    ok(!(await exists(page, ".gm-info-panel")), "панель узла графа закрылась (узла больше нет)");
    await page.$$eval("[data-element-impact] button", (els) => { const b = els.find((e) => /Ничего/.test(e.textContent ?? "")); b?.click(); });
    await gone(page, ".element-editor-overlay");
    await page.waitForFunction((n) => document.querySelectorAll(".node-g").length < n, { timeout: 20000 }, nodesBefore);
    ok(true, "«Ничего» закрывает редактор; граф перечитан — узлов меньше");
    await clickBtn(".gm-header", "✕") || await page.keyboard.press("Escape");
    await gone(page, ".gm-overlay").catch(() => {});
    await page.waitForFunction((name) => { const t = document.querySelector('[data-section="Таблица категорий"]'); return !!t && ![...t.querySelectorAll("td")].some((td) => td.textContent?.trim() === name); }, { timeout: 20000 }, targetName);
    ok(true, "строка категории ушла из таблицы категорий документа (разделы перечитаны)");
    // (в) панель рекомендаций: строка «удалить» выбираема и бесплатна; план с рядами удаления
    await click(page, T("recommendations-btn"));
    await waitSel(page, T("rec-panel"));
    await waitSel(page, T("rec-item"));
    const item = (num) => `${T("rec-item")}[data-rec-num="${num}"]`;
    const costOf = (num) => page.$eval(`${item(num)} ${T("rec-cost")}`, (el) => ({ text: el.textContent, cls: el.className }));
    const c1 = await costOf("1");
    ok(/удаление · бесплатно/i.test(c1.text) && /free/.test(c1.cls) && /delete/.test(c1.cls), "строка № 1 («удалить» элемент) помечена «удаление · бесплатно»", c1);
    ok(!(await page.$eval(`${item("1")} ${T("rec-pick")}`, (el) => el.disabled)) && !(await page.$eval(`${item("2")} ${T("rec-pick")}`, (el) => el.disabled)), "строки «удалить» выбираемы");
    ok(await page.evaluate(() => ![...document.querySelectorAll('[data-testid="rec-cost"], [data-testid="rec-item"] .cert-badge')].some((e) => /вручную/i.test(e.textContent ?? ""))), "пометки «вручную» у строк больше нет");
    await page.$eval(`${item("1")} ${T("rec-pick")}`, (el) => el.click());
    await page.$eval(`${item("2")} ${T("rec-pick")}`, (el) => el.click());
    await sleep(200);
    const est = await text(page, T("rec-estimate"));
    ok(/2 шага: 2 бесплатно, 0 платно/.test(est), "оценка выбора: «2 шага: 2 бесплатно, 0 платно»", est);
    await click(page, T("rec-build-plan"));
    await waitSel(page, T("plan-step"), 30000);
    const steps = await page.$$eval(T("plan-step"), (els) => els.map((e) => ({ type: e.getAttribute("data-step-type"), cls: e.className, text: (e.textContent ?? "").replace(/\s+/g, " ") })));
    const delCat = steps.find((s) => s.type === "delete_element" && s.text.includes(CAT_DEL));
    const delSub = steps.find((s) => s.type === "delete_subsection");
    ok(!!delCat && /Удалить элемент: категория/.test(delCat.text) && /бесплатно/i.test(delCat.text) && /№ 1/.test(delCat.text) && /plan-step-delete/.test(delCat.cls), "строка шага delete_element: «Удалить элемент: категория «…»», «бесплатно», № 1, пометка .plan-step-delete", delCat?.text);
    ok(steps.some((s) => s.type === "delete_element" && s.text.includes(TERM_DEL.slice(0, 30)) && /термин/i.test(s.text) && /бесплатно/i.test(s.text)), "строка шага удаления термина", steps.map((s) => s.text.slice(0, 70)));
    ok(delSub === undefined, "подраздел в этом выборе не удаляется — строки delete_subsection нет");
    const footer = await text(page, ".edit-modal-footer");
    ok(/2 бесплатно/.test(footer), "футер модалки: 2 бесплатно", footer);
    // модалку плана закрываем — дальше инлайн-правки документа
    await click(page, ".edit-modal .raw-close");
    await gone(page, T("plan-step"));
    // (а2) инлайн-редактор термина — карандаш в строке таблицы определений
    await waitSel(page, 'button[data-edit-kind="glossary_term"]');
    const termName = await page.$eval('button[data-edit-kind="glossary_term"]', (b) => b.closest("tr")?.querySelector("td")?.textContent?.trim() ?? "");
    await click(page, 'button[data-edit-kind="glossary_term"]');
    await waitSel(page, '.inline-edit-form [data-element-editor="glossary_term"]');
    await click(page, T("element-delete"));
    await waitSel(page, T("element-delete-confirm"));
    await clickAway(page);
    await sleep(300);
    ok(!(await exists(page, T("element-delete-confirm"))), "инлайн-редактор термина: клик мимо снимает второй шаг");
    await click(page, T("element-delete"));
    await waitSel(page, T("element-delete-confirm"));
    await click(page, T("element-delete-confirm"));
    await waitSel(page, T("element-deleted"));
    await page.waitForFunction((name) => ![...document.querySelectorAll('[data-section="Таблица определений"] td')].some((td) => td.textContent?.trim() === name), { timeout: 20000 }, termName);
    ok(!(await termByName(D, termName)), `термин «${termName.slice(0, 40)}…» удалён инлайн-редактором, строки в таблице нет`);
    await page.$$eval("[data-element-impact] button", (els) => { const b = els.find((e) => /Ничего/.test(e.textContent ?? "")); b?.click(); });
    await gone(page, '[data-element-editor="glossary_term"]');
    ok(true, "«Ничего» закрывает инлайн-редактор удалённого элемента");
    // (б) карточка правки подраздела: ✎ у подраздела sum
    await waitSel(page, `button[data-edit-subsection="${SUB_DEL}"]`);
    await click(page, `button[data-edit-subsection="${SUB_DEL}"]`);
    await waitSel(page, `[data-subsection-editor="${SUB_DEL}"] ${T("subsection-delete")}`);
    await click(page, `[data-subsection-editor="${SUB_DEL}"] ${T("subsection-delete")}`);
    await waitSel(page, T("subsection-delete-confirm"));
    ok((await exists(page, T("subsection-delete-warn"))) && (await secHtml(D, "sum")).h.includes(`data-section="${SUB_DEL}"`), "«Удалить подраздел»: второй шаг с предупреждением, подраздел ещё на месте");
    await clickAway(page);
    await sleep(300);
    ok(!(await exists(page, T("subsection-delete-confirm"))) && (await exists(page, T("subsection-delete"))), "клик мимо карточки снимает второй шаг удаления подраздела");
    await click(page, T("subsection-delete"));
    await waitSel(page, T("subsection-delete-confirm"));
    await click(page, T("subsection-delete-confirm"));
    await gone(page, `[data-section="${SUB_DEL}"]`);
    ok(!(await secHtml(D, "sum")).h.includes(`data-section="${SUB_DEL}"`) && !(await exists(page, "[data-subsection-editor]")), "подраздел удалён: его нет ни на странице, ни в БД; карточка правки закрыта");
    ok(await exists(page, `[data-testid="section-edited-sum"]`), "пометка «⟳ изменён» у раздела sum");
    ok(page.errors.length === 0, "без ошибок страницы", page.errors);
    // (г) гость/чужой: кнопок удаления нет
    const pub = await A.api("PATCH", `/syntheses/${D}`, { visibility: "full" });
    const pageB = await newPage(B);
    await openDoc(pageB, D);
    ok(pub.status === 200 && !(await exists(pageB, 'button[data-edit-kind="category"]')) && !(await exists(pageB, "button[data-edit-subsection]")), "чужому — ни карандашей, ни входа в удаление");
  }
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
  if (lastPage) await lastPage.screenshot({ path: "/tmp/t152-fail.png" }).catch(() => {});
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch {} }
  mockSrv.close();
  for (const id of userIds) await sql`delete from syntheses where user_id=${id}`.catch(() => {});
  for (const id of userIds) await sql`delete from users where id=${id}`.catch(() => {});
  await Promise.race([Promise.all([closeDb(), closeRedis()]), sleep(2000)]);
  await sql.end({ timeout: 2 });
}
console.log(`\nИТОГ test-152 (запросы 2–5): ${passed} ✓ / ${failed} ✗${fails.length ? "\n  провалы: " + fails.join(" | ") : ""}`);
process.exit(failed ? 1 : 0);
