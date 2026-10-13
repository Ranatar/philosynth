/**
 * Беседа 12.5 — тестовые запросы одним харнессом (четыре исключения в
 * продукте: Д-40, Д-43, Д-49, Д-50). Живой сервер :3000 + PG16/Redis + мок
 * Claude :3927; для R4 — СБОРКА клиента (vite build) под vite preview :5225 и
 * Chrome 131 (CHROME_PATH). Остальные блоки — без браузера.
 *
 *  R1  Д-40: активный `section.theses.shared` несёт раскладку блока тезиса —
 *      промпт раздела тезисов у мока содержит её; мок отвечает по новой
 *      раскладке (<h5>Тезис {метка}</h5> + жирная формулировка + «Обоснование.»)
 *      → theses.justification непуст у каждого тезиса, formulation в БД =
 *      табличной = прозаической (readThesisBlock), метка = первой ячейке.
 *  R2  Д-43: файл концепции (T125_FILE, экспорт службы 10.1–10.2) импортирован;
 *      правка обоснования тезиса через PATCH /theses/:id не меняет НИ ОДНОЙ
 *      ячейки «Тип» сводной таблицы; смена типа редактором меняет ТОЛЬКО свою
 *      строку (каноническая метка), прочие — прежний текст.
 *  R3  Д-49: концепция со схемой monolithic → GET /export/html → POST /import
 *      — схема прежняя, генлог импорта без маркера миграции; selective-v1 —
 *      то же.
 *  R4  Д-50: пауза ДО подписки (мок: 400 на графе) → сырое WS-соединение с
 *      ?resume= (§3.3) → generation_paused с replay: true, skipDegrades
 *      и sectionKeys; страница, открытая в паузе: модалка сама НЕ открывается,
 *      бейдж «⏸ Приостановлено» виден; бейдж → «Пропустить» → ровно один
 *      window.confirm со списком зависимых (прямой путь без обхода samePause)
 *      → ready. Живая пауза (обрыв после подписки): replay нет, модалка
 *      открывается сама (test-124 R2 держит; здесь — сообщение без replay).
 *
 * Запуск (≈ 2–3 мин, в фоне): T125_FILE=… node_modules/.bin/tsx tests/test-125-requests2-9.mjs [R1 R2 …]
 * Предпосылки: PG16 + Redis, миграции и сиды (seed:prompts с надстройкой Д-40);
 * `npm i --no-save puppeteer-core@23`; Chrome 131 в ~/.cache/puppeteer/… либо CHROME_PATH;
 * лог сервера — /tmp/t125-server.log.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import postgres from "postgres";
import WebSocket from "ws";

const ONLY = process.argv.slice(2);
const want = (r) => ONLY.length === 0 || ONLY.includes(r);
const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5225, MOCK_PORT = 3927;
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${UI_PORT}`;
const CHROME = [process.env.CHROME_PATH, `${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`, "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome"].find((p) => p && existsSync(p));
const FILE = process.env.T125_FILE ?? process.env.T121_FILE;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
process.env.REDIS_URL ??= "redis://localhost:6379";
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 700) : ""}`); }
}
const TAG = Math.random().toString(36).slice(2, 8);

/* ── Серверные модули в процессе харнесса ────────────────────────────── */
const HP = await import("../server/utils/html-parser.ts");
const TL = await import("../server/config/thesis-layout-templates.ts");
const ER = await import("../server/services/element-renderer.ts");

/* ── Фикстуры мока ───────────────────────────────────────────────────── */
const tbl = (h, rows) => `<table class="doc-table"><thead><tr>${h.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>\n${b}\n</div>`;
const CAT_H = ["Категория", "Тип", "Определение", "Центральность", "Определённость", "Происхождение"];
const EDGE_H = ["Источник", "Описание связи", "Цель", "Тип связи", "Направление", "Сила"];
const GRAPH_BODY =
  sub("Методология построения графа", "<p>Метод построения: диалектический.</p>") +
  sub("Таблица категорий", tbl(CAT_H, [["Бытие", "онтологическая", "то, что есть", "0.9", "0.8", "Кант"], ["Ничто", "онтологическая", "то, чего нет", "0.5", "0.6", "Кант"]])) +
  sub("Таблица связей", tbl(EDGE_H, [["Бытие", "переходит в", "Ничто", "диалектическая", "однонаправленная", "0.7"]])) +
  sub("Топология графа", "<p>Один кластер.</p>");
const SUM_SUBS = ["Цели и метод", "Портрет каждого философа", "Новизна и ценность", "Структура документа", "Индекс когерентности", "Точки напряжения", "Оценка сложности"];
const SUM_BODY = SUM_SUBS.map((n) => sub(n, `<p>Подраздел «${n}»: текст.</p>`)).join("\n");
const TH = ["№", "Формулировка тезиса", "Тип (онтол./эпистем./этич.)", "Степень новизны", "Связанные категории"];
// Раскладка Д-40: метка = первой ячейке, формулировка прозы ДОСЛОВНО = табличной
const block = (label, title, f, just) =>
  `<h5>Тезис ${label} (${title})</h5><p><strong>${f}</strong></p><p><strong>${TL.THESIS_JUSTIFICATION_LEAD}</strong> ${just}</p><p><strong>Степень новизны:</strong> порождён зерном.</p>`;
const F_O1 = "Бытие есть становление", F_E1 = "Знание есть разлом", F_A1 = "Благо есть мера";
const THESES_BLOCKS =
  sub("Онтологические тезисы", block("О-1", "Становление", F_O1, "Первое обоснование.")) +
  sub("Эпистемологические тезисы", block("Э-1", "Разлом", F_E1, "Второе обоснование.")) +
  sub("Этические и аксиологические тезисы", block("А-1", "Мера", F_A1, "Третье обоснование."));
const THESES_ROWS = [["О-1", F_O1, "Онтологический", "порождён", "Бытие"], ["Э-1", F_E1, "Эпистемологический", "порождён", "Ничто"], ["А-1", F_A1, "Этический / аксиологический", "порождён", "Бытие"]];
const NAME_BODY = sub("Таблица вариантов названия", tbl(["Вариант", "Довод"], [["Первый", "черновой"]])) + sub("Сравнительный анализ вариантов", "<p>Сравнение.</p>") + sub("Итоговая рекомендация", "<p><strong>«Мок-название»: о мере</strong></p>");

/* ── Мок Claude ──────────────────────────────────────────────────────── */
const mock = { calls: 0, picked: [], failed: new Set(), thesesPrompts: [] };
const mockSrv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", async () => {
    mock.calls++;
    let prompt = "";
    try { const c = JSON.parse(body).messages?.[0]?.content; prompt = typeof c === "string" ? c : J(c); } catch {}
    const task = prompt.slice(Math.max(0, prompt.lastIndexOf("ЗАДАНИЕ")));
    const marker = prompt.match(/\[MOCK:([A-Z]+)(?::([a-z]+))?\]/);
    let text;
    if (task.includes("Таблица связей")) { mock.picked.push("graph"); text = GRAPH_BODY; }
    else if (task.includes("Сводная таблица")) { mock.picked.push("theses"); mock.thesesPrompts.push(prompt); text = THESES_BLOCKS + sub("Сводная таблица тезисов", tbl(TH, THESES_ROWS)); }
    else if (task.includes("Точки напряжения")) { mock.picked.push("sum"); text = SUM_BODY; }
    else if (task.includes("Итоговая рекомендация")) { mock.picked.push("name"); text = NAME_BODY; }
    else { mock.picked.push("(прочее)"); text = sub("Диалог", "<p><strong>Кант:</strong> реплика.</p>"); }
    const picked = mock.picked[mock.picked.length - 1];
    if ((marker?.[1] === "FAIL" || marker?.[1] === "FAILSLOW") && marker[2] === picked) {
      const key = marker[0] + "|" + picked + "|" + (prompt.match(/зерно-(\w+)/)?.[1] ?? "");
      if (!mock.failed.has(key)) {
        mock.failed.add(key);
        if (marker[1] === "FAILSLOW") await sleep(6000);
        res.writeHead(400, { "content-type": "application/json" });
        res.end(J({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }));
        return;
      }
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 1000 } } });
    for (let i = 0; i < text.length; i += 1500) send({ type: "content_block_delta", delta: { type: "text_delta", text: text.slice(i, i + 1500) } });
    send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2000 } });
    send({ type: "message_stop" });
    res.end();
  });
});

/* ── Процессы и клиенты ──────────────────────────────────────────────── */
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
  const api = async (method, p, body, extraHeaders = {}) => {
    const headers = { Cookie: cookie, ...extraHeaders };
    let payload;
    if (body !== undefined && !(body instanceof FormData)) { headers["Content-Type"] = "application/json"; payload = J(body); }
    else if (body instanceof FormData) payload = body;
    const r = await fetch(BASE + p, { method, headers, body: payload });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  };
  return { api, cookie };
}
async function account(tag) {
  const email = `t125-${tag}-${Date.now()}@example.com`, password = "password-125";
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  return { ...client(cookie), email, password, id: u.id, token: cookie.split("=")[1] };
}
const ids = [];
const synthRow = async (id) => (await sql`select title, status, paused_state, parent_context_schema from syntheses where id=${id}`)[0];
const secHtml = async (id, key) => (await sql`select html_content h from sections where synthesis_id=${id} and key=${key}`)[0]?.h ?? null;
async function waitStatus(id, pred, ms = 90000) {
  const t0 = Date.now();
  for (;;) { const r = await synthRow(id); if (pred(r)) return r; if (Date.now() - t0 > ms) throw new Error(`статус не дождался: ${r?.status}`); await sleep(400); }
}
const typeCells = (html) => (HP.locateDocTable(html, [{ subsection: "Сводная таблица тезисов" }])?.rows ?? []).map((r) => [r[0], r[2]]);

/* ── Браузер (только R4) ─────────────────────────────────────────────── */
let browser = null;
const CONFIRM_SPY = () => { window.__confirms = []; window.confirm = (msg) => { window.__confirms.push(String(msg)); return true; }; };
async function newPage(who) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.errors = []; page.on("pageerror", (e) => page.errors.push(String(e)));
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setUserAgentOverride", { userAgent: await browser.userAgent(), acceptLanguage: "ru-RU,ru" });
  await page.evaluateOnNewDocument(CONFIRM_SPY);
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  return page;
}
const confirms = (page) => page.evaluate(() => window.__confirms ?? []);
const exists = async (page, sel) => (await page.$(sel)) !== null;
const waitSel = (page, sel, ms = 20000) => page.waitForSelector(sel, { timeout: ms });

/** Сырое WS-соединение с ?resume={synthesisId} (§3.3 — так подключается useStreamingGeneration):
 *  повтор паузы шлёт handleResume при подключении; subscribe_generation в статусе paused стрим не запускает. */
function wsSubscribe(token, synthesisId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${token}&resume=${synthesisId}`);
    const got = [];
    const timer = setTimeout(() => { ws.close(); resolve({ got, paused: null }); }, 8000);
    ws.on("open", () => ws.send(J({ type: "subscribe_generation", synthesisId })));
    ws.on("message", (d) => {
      const m = JSON.parse(String(d));
      got.push(m);
      if (m.type === "generation_paused") { clearTimeout(timer); ws.close(); resolve({ got, paused: m }); }
    });
    ws.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

/* ══ Прогон ═════════════════════════════════════════════════════════════ */
try {
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-125", STREAM_RETRY_DELAYS: "50", BILLING_ENFORCE: "false", API_KEY_ENCRYPTION_SECRET: "t125-" + "s".repeat(40), CLIENT_ORIGIN: UI }, "/tmp/t125-server.log");
  await waitUp(`${BASE}/health`, "сервер");
  const A = await account("a");
  await sql`update users set balance_usd = 50 where id = ${A.id}`;

  /* ════ R1: Д-40 ════ */
  if (want("R1")) {
    console.log("\n■ R1: Д-40 — раскладка блока тезиса в промпте и разборе");
    const [tpl] = await sql`select body from prompt_templates where key = ${TL.THESES_SHARED_TEMPLATE_KEY} and is_active`;
    ok(!!tpl && tpl.body.endsWith(TL.THESIS_LAYOUT_ADDENDUM), "активный section.theses.shared несёт раскладку (seed:prompts)", tpl?.body.slice(-120));
    const post = await A.api("POST", "/syntheses", { seed: `зерно-${TAG}r1`, philosophers: ["Кант"], sections: ["graph", "theses"], method: "dialectical", depth: "overview", synthLevel: "comparative" });
    ok(post.status === 201, "POST /syntheses (graph + theses) → 201", post.json);
    const G = post.json.id; ids.push(G);
    const fin = await waitStatus(G, (r) => r.status === "ready" || r.status === "error" || r.status === "paused", 120000);
    ok(fin.status === "ready", "генерация на моке завершена (ready)", fin.status);
    const tp = mock.thesesPrompts[0] ?? "";
    ok(tp.includes(TL.THESIS_LAYOUT_MARKER) && tp.includes(`<h5>Тезис {метка}`) && tp.includes("ДОСЛОВНО равна формулировке в сводной таблице"), "промпт раздела тезисов у мока несёт требование раскладки", tp.slice(tp.indexOf(TL.THESIS_LAYOUT_MARKER), tp.indexOf(TL.THESIS_LAYOUT_MARKER) + 160));
    ok(tp.split(TL.THESIS_LAYOUT_MARKER).length === 2, "требование стоит в промпте ровно один раз");
    const th = await sql`select thesis_num, label, formulation, justification, thesis_type from theses where synthesis_id=${G} order by thesis_num`;
    ok(th.length === 3 && th.every((t) => t.justification && t.justification.length > 5), "theses.justification непуст у каждого тезиса (вторая модель разобрана)", th.map((t) => t.justification));
    ok(J(th.map((t) => t.label)) === J(["О-1", "Э-1", "А-1"]), "метки тезисов — первые ячейки таблицы", th.map((t) => t.label));
    const html = await secHtml(G, "theses");
    const prose = th.map((t) => HP.readThesisBlock(html, t.label));
    ok(prose.every((b, i) => b && b.formulation === th[i].formulation) && J(th.map((t) => t.formulation)) === J([F_O1, F_E1, F_A1]), "формулировка в БД = табличной = прозаической (readThesisBlock по метке)", prose.map((b) => b?.formulation));
    ok(J(th.map((t) => t.thesis_type)) === J(["ontological", "epistemological", "ethical"]), "типы разобраны из таблицы", th.map((t) => t.thesis_type));
    ok(J(prose.map((b) => b?.justification)) === J(["Первое обоснование.", "Второе обоснование.", "Третье обоснование."]), "обоснования прозы — из абзаца «Обоснование.»");
  }

  /* ════ R2: Д-43 ════ */
  if (want("R2")) {
    console.log("\n■ R2: Д-43 — столбец «Тип» при правке тезиса на файле концепции");
    if (!FILE || !existsSync(FILE)) console.log("  ~ T125_FILE не задан или файла нет — блок пропущен");
    else {
      const imp = await import("../server/services/import-service.ts");
      const res = await imp.importHTML(readFileSync(FILE, "utf8"), A.id, "concept.html");
      ids.push(res.synthesisId);
      const sid = res.synthesisId;
      const before = typeCells(await secHtml(sid, "theses"));
      ok(before.length >= 3 && before.some(([, c]) => !Object.values(ER.THESIS_TYPE_LABELS).includes(c)), `импорт: ${before.length} строк, ячейки «Тип» не канонические (есть что беречь)`, [...new Set(before.map(([, c]) => c))]);
      const list = await A.api("GET", `/syntheses/${sid}/theses`);
      ok(list.status === 200 && list.json.theses.length === before.length, "GET /theses: строк столько же, сколько в таблице", list.status);
      const target = list.json.theses.find((t) => t.thesisType === "ethical") ?? list.json.theses[0];
      const r1 = await A.api("PATCH", `/syntheses/${sid}/theses/${target.id}`, { justification: "Новое обоснование из редактора (12.5)." });
      ok(r1.status === 200, "PATCH обоснования → 200", r1.json);
      const after1 = typeCells(await secHtml(sid, "theses"));
      ok(J(after1) === J(before), "после правки обоснования НИ ОДНА ячейка «Тип» не изменилась", after1.filter((x, i) => J(x) !== J(before[i])).slice(0, 3));
      const label = target.label ?? String(target.thesisNum);
      const newType = target.thesisType === "ethical" ? "ontological" : "ethical";
      const r2 = await A.api("PATCH", `/syntheses/${sid}/theses/${target.id}`, { thesisType: newType });
      ok(r2.status === 200, `PATCH thesisType → ${newType} → 200`, r2.json);
      const after2 = typeCells(await secHtml(sid, "theses"));
      const mine = after2.find(([l]) => l === label), others = after2.filter(([l]) => l !== label);
      ok(mine?.[1] === ER.THESIS_TYPE_LABELS[newType], `строка «${label}»: ячейка «Тип» стала канонической меткой «${ER.THESIS_TYPE_LABELS[newType]}»`, mine);
      ok(J(others) === J(before.filter(([l]) => l !== label)), "прочие строки — прежний текст «Тип»", others.filter((x, i) => J(x) !== J(before.filter(([l]) => l !== label)[i])).slice(0, 3));
    }
  }

  /* ════ R3: Д-49 ════ */
  if (want("R3")) {
    console.log("\n■ R3: Д-49 — схема родительского контекста через круг экспорт → импорт");
    for (const schemaId of ["monolithic", "selective-v1"]) {
      const [s] = await sql`insert into syntheses (user_id, seed, title, status, section_order, doc_num, method, synth_level, depth, parent_context_schema)
        values (${A.id}, ${"зерно " + TAG}, ${schemaId + " " + TAG}, 'ready', ${sql.json(["sum"])}, ${"T125-" + Math.random().toString(36).slice(2, 7)}, 'dialectical', 'comparative', 'overview', ${schemaId}) returning id`;
      ids.push(s.id);
      await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${s.id}, 'sum', 1, 'Исполнительное резюме', ${`<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">Исполнительное резюме</div><div class="doc-content">${SUM_BODY}</div></div>`})`;
      await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${s.id}, 'philosopher', 'Кант', 0)`;
      const ex = await fetch(`${BASE}/syntheses/${s.id}/export/html`, { headers: { Cookie: A.cookie } });
      const file = await ex.text();
      const st = JSON.parse(/<script type="application\/json" id="philosynth-state">([\s\S]*?)<\/script>/.exec(file)?.[1] ?? "{}");
      ok(ex.status === 200 && st.parentContextSchema === schemaId, `${schemaId}: GET /export/html — встроенное состояние несёт схему колонки`, [ex.status, st.parentContextSchema]);
      const fd = new FormData();
      fd.append("file", new Blob([file], { type: "text/html" }), `${schemaId}.html`);
      const im = await A.api("POST", "/syntheses/import", fd);
      ok(im.status === 200 || im.status === 201, `${schemaId}: POST /syntheses/import принят`, im.json);
      const nid = im.json?.id ?? im.json?.synthesisId; if (nid) ids.push(nid);
      const back = nid ? await synthRow(nid) : null;
      ok(back?.parent_context_schema === schemaId, `${schemaId}: после круга схема прежняя`, back?.parent_context_schema);
      const markers = nid ? await sql`select count(*)::int n from generation_log where synthesis_id=${nid} and log_type='schema_migration_marker'` : [{ n: -1 }];
      ok(markers[0].n === 0, `${schemaId}: генлог импорта без маркера миграции`, markers[0].n);
    }
  }

  /* ════ R4: Д-50 ════ */
  if (want("R4")) {
    console.log("\n■ R4: Д-50 — replay паузы помечен и полон; страница в паузе — бейдж, не модалка");
    const post = await A.api("POST", "/syntheses", { seed: `[MOCK:FAIL:graph] зерно-${TAG}r4`, philosophers: ["Кант"], sections: ["graph", "theses", "sum", "name"], method: "dialectical", depth: "overview", synthLevel: "comparative" });
    ok(post.status === 201, "POST /syntheses с обрывом на графе → 201", post.json);
    const G = post.json.id; ids.push(G);
    const paused = await waitStatus(G, (r) => r.status === "paused" || r.status === "ready" || r.status === "error");
    const ps = paused.paused_state;
    ok(paused.status === "paused" && ps?.reasonKind === "billing" && (ps.skipDegrades ?? []).length > 0, "пауза billing до подписки, skipDegrades непуст", [paused.status, ps?.skipDegrades]);
    const { got, paused: msg } = await wsSubscribe(A.token, G);
    ok(!!msg, "подключение с ?resume= в паузе → generation_paused (replay)", got.map((m) => m.type));
    ok(msg?.replay === true, "сообщение помечено replay: true", msg);
    ok(J(msg?.skipDegrades) === J(ps.skipDegrades) && J(msg?.sectionKeys) === J(ps.sectionKeys), "replay несёт skipDegrades и sectionKeys из pausedState", [msg?.skipDegrades, msg?.sectionKeys, ps.sectionKeys]);
    ok(msg?.kind === "gen" && msg.reasonKind === "billing" && msg.estimates && typeof msg.estimates === "object", "прочие поля паузы на месте (kind, reasonKind, estimates)");

    if (!CHROME) { console.log("  ~ Chrome 131 не найден — браузерная часть пропущена"); }
    else {
      console.log("  · сборка клиента (vite build) и preview");
      const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8" });
      ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-300));
      sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t125-preview.log");
      await waitUp(UI, "preview");
      const puppeteer = (await import("puppeteer-core")).default;
      browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
      const page = await newPage(A);
      await page.goto(`${UI}/synthesis/${G}`, { waitUntil: "networkidle0" });
      await waitSel(page, ".progress-pause-badge.visible");
      ok(true, "страница в паузе: бейдж «⏸ Приостановлено» виден");
      await sleep(3000);
      ok(!(await exists(page, ".pause-overlay.visible")), "модалка паузы САМА не открылась (replay — не живая пауза; 1.6b)");
      await page.$eval(".progress-pause-badge.visible", (el) => el.click());
      await waitSel(page, ".pause-overlay.visible");
      ok(true, "бейдж открывает модалку паузы");
      const skipBtn = await page.evaluate(() => { const b = [...document.querySelectorAll(".pause-overlay.visible button")].find((x) => /Пропустить/.test(x.textContent)); if (!b) return false; b.click(); return true; });
      ok(skipBtn, "кнопка «⤴ Пропустить» в модалке");
      await waitStatus(G, (r) => r.status === "ready" || r.status === "error", 120000);
      const cf = await confirms(page);
      ok(cf.length === 1 && /Всё равно пропустить\?/.test(cf[0] ?? "") && ps.skipDegrades.every((k) => (cf[0] ?? "").includes(k)), "«Пропустить» → ровно один вопрос о деградации со списком зависимых (прямой путь, без обхода samePause)", cf);
      ok((await synthRow(G)).status === "ready", "генерация после пропуска завершена (ready)");
      ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
      await page.browserContext().close();
    }
  }
} catch (e) {
  failed++; fails.push("ПРОГОН ПРЕРВАН");
  console.log("  ✗ ПРОГОН ПРЕРВАН: " + (e?.stack ?? e));
} finally {
  try { if (browser) await browser.close(); } catch {}
  for (const p of procs) { try { process.kill(-p.pid, "SIGKILL"); } catch { try { p.kill("SIGKILL"); } catch {} } }
  mockSrv.close();
  for (const id of ids) await sql`delete from syntheses where id=${id}`.catch(() => {});
  await sql.end({ timeout: 2 }).catch(() => {});
}
console.log(`\nИТОГ test-125: ${passed} ✓ / ${failed} ✗`);
if (failed) console.log("Провалы:\n" + fails.map((f) => "  - " + f).join("\n"));
process.exit(failed ? 1 : 0);
