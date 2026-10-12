/**
 * Беседа 12.4 — тестовые запросы 2–8 одним харнессом (долги интерфейса,
 * клиент). Живой сервер :3000 (прокси preview) + PG16/Redis + мок Claude :3926 + СБОРКА
 * клиента (vite build) под vite preview :5224 + браузер Chrome 131
 * (CHROME_PATH). Документы — фикстуры строками sections (гранулярные таблицы
 * парсерами 1.4), генерация и перегенерация — через мок.
 *
 *  R2  Д-2: пауза (мок: 400 «credit balance» на разделе) → «Пропустить» →
 *      ровно один window.confirm со списком разделов при skipDegrades; без
 *      skipDegrades — ни одного (перехват confirm в странице)
 *  R3  Д-17: остановка генерации, удаление аккаунта, удаление типа каталога,
 *      смена роли, удаление API-ключа — второй шаг кнопок («Точно …?» +
 *      «Отмена» + строка-предупреждение), клик мимо сбрасывает, «Отмена»
 *      сбрасывает, window.confirm не вызывается; действие исполняется только
 *      со второго шага
 *  R4  Д-14: ручная правка подраздела → «◷ История» раздела → откат к v1 →
 *      документ прежний (DOM и БД); правка капсулы ✎ → «◷» у капсулы → откат
 *      → шапка прежняя без перезагрузки; та же панель на карточке EditModal
 *  R5  Д-15: после правки подраздела «Резюме» ⟳ в оглавлении и у раздела;
 *      Д-19: превью бюджета формы берёт contextBudget из /estimate —
 *      активация новой версии context_budget меняет число без правки
 *      клиента; Д-7: план с каскадными pending → футер EditModal показывает
 *      серверную оценку взятых и ждущие отдельно (числа ≡ GET плана)
 *  R6  Д-34: правка «Итоговой рекомендации» раздела name → шапка показывает
 *      новое название без перезагрузки, заметка в форме; Д-35: инлайн-✎
 *      строки «Э-2» сводной таблицы (строка 0, тезис № 3) открывает тезис
 *      «Э-2» по метке, заголовок редактора несёт метку; Д-42: правка
 *      формулировки тезиса второй раскладки → «Отражено точечной правкой
 *      абзаца: формулировка тезиса»; Д-41: бейдж схемы родительского
 *      контекста у мета-синтеза на странице и в HTML-выгрузке, у синтеза без
 *      концепций-родителей его нет
 *  R7  Д-44: строка рекомендации с чужим «Основанием» → под ней замечание
 *      (не отказ), строка выбирается и ставится в план; Д-48: раздел, где
 *      мок пропустил подраздел → блок предупреждений с пометкой о пропуске,
 *      заголовок «Замечания к последней генерации», вводная без «Документ
 *      цел»; Д-7: футер плана называет два числа, оборота «оценка — с ними»
 *      нет
 *  R8  css-parity: A/B/C = 0
 *
 * Запуск (≈ 2 мин, в фоне): node_modules/.bin/tsx tests/test-124-requests2-8.mjs [R2 R3 …]
 * Предпосылки: PG16 + Redis, миграции и сиды; `npm i --no-save puppeteer-core@23`;
 * Chrome 131 в ~/.cache/puppeteer/chrome/linux-131.0.6778.204/ либо CHROME_PATH;
 * лог сервера — /tmp/t124-server.log.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import postgres from "postgres";

const ONLY = process.argv.slice(2);
const want = (r) => ONLY.length === 0 || ONLY.includes(r);
const ROOT = new URL("../", import.meta.url).pathname;
// Сервер — :3000: vite preview проксирует /api и /ws по server.proxy (vite.config), иного адреса сборка не знает
const PORT = 3000, UI_PORT = 5224, MOCK_PORT = 3926;
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${UI_PORT}`;
const CHROME = [process.env.CHROME_PATH, `${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`, "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome"].find((p) => p && existsSync(p));
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
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 700) : ""}`); }
}
const TAG = Math.random().toString(36).slice(2, 8);

/* ── Серверные модули в процессе харнесса (разбор фикстур, карта критики) ── */
const SDB = await import("../server/services/section-defs-builder.ts");
const GP = await import("../server/services/graph-parser.ts");
const EP = await import("../server/services/element-parser.ts");
const K = await import("@philosynth/shared/constants/recommendations");
const PROSE = K.RECOMMENDATIONS_PROSE_SUBSECTION, TABLE = K.RECOMMENDATIONS_TABLE_SUBSECTION;
const INTERLAYER = SDB.CRITIQUE_INTERLAYER_SUBSECTION;
const HEAD = K.RECOMMENDATION_COLUMNS.map((c) => c.header);
const PARAMS = { seed: "s", phil: ["Кант"], participants: [{ type: "philosopher", name: "Кант" }], method: "dialectical", synthLevel: "comparative", depth: "overview", generationOrder: "architectural", extGraphMetrics: false, ctx: "", lang: "Russian", keepFullBudget: false };
const CRIT_SUBS = (await SDB.buildSubsectionMap({ ...PARAMS, sec: ["graph", "dialogue", "critique"] })).critique;

/* ── Фикстуры «как даёт генерация» ───────────────────────────────────── */
const tbl = (h, rows) => `<table class="doc-table"><thead><tr>${h.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>\n${b}\n</div>`;
const wrap = (num, title, b) => `<div class="doc-section">\n<div class="section-num">§ ${num}</div>\n<div class="section-title">${title}</div>\n<div class="doc-content">\n${b}\n</div>\n</div>`;
const CAT_H = ["Категория", "Тип", "Определение", "Центральность", "Определённость", "Происхождение"];
const EDGE_H = ["Источник", "Описание связи", "Цель", "Тип связи", "Направление", "Сила"];
const GRAPH_BODY =
  sub("Методология построения графа", "<p>Метод построения: диалектический.</p>") +
  sub("Таблица категорий", tbl(CAT_H, [["Бытие", "онтологическая", "то, что есть", "0.9", "0.8", "Кант"], ["Ничто", "онтологическая", "то, чего нет", "0.5", "0.6", "Кант"], ["Становление", "онтологическая", "переход", "0.4", "0.5", "Кант"]])) +
  sub("Таблица связей", tbl(EDGE_H, [["Бытие", "переходит в", "Ничто", "диалектическая", "однонаправленная", "0.7"]])) +
  sub("Топология графа", "<p>Один кластер.</p>");
const SUM_SUBS = ["Цели и метод", "Портрет каждого философа", "Новизна и ценность", "Структура документа", "Индекс когерентности", "Точки напряжения", "Оценка сложности"];
const SUM_BODY = SUM_SUBS.map((n) => sub(n, `<p>Подраздел «${n}»: исходный текст.</p>`)).join("\n");
const TH = ["№", "Формулировка тезиса", "Тип (онтол./эпистем./этич.)", "Степень новизны", "Связанные категории"];
const block = (label, title, proseF, just) =>
  `<h5>Тезис ${label} (${title})</h5>` +
  `<p><strong>${proseF}</strong></p>` +
  `<p><strong>Обоснование.</strong> ${just}</p>` +
  `<p><strong>Степень новизны:</strong> порождён зерном концепции.</p>`;
const F_O1 = "Логос есть мера бытия", F_E1 = "Знание есть обоснованное мнение", F_E2 = "Явление есть данность сознанию";
const THESES_BLOCKS =
  sub("Онтологические тезисы", block("О-1", "Мера", F_O1 + " — сказано в прозе.", "Первое обоснование.")) +
  sub("Эпистемологические тезисы", block("Э-1", "Знание", F_E1 + ", взятое в его данности.", "Второе обоснование.") + block("Э-2", "Явление", F_E2 + " как таковая.", "Третье обоснование."));
const THESES_ROWS = [["О-1", F_O1, "Онтологический", "порождён", "Логос, Бытие"], ["Э-1", F_E1, "Эпистемологический", "порождён", "Знание"], ["Э-2", F_E2, "Эпистемологический", "порождён", "Явление"]];
/** Порядок разбора (theses.thesis_num 1/2/3 = О-1/Э-1/Э-2) */
const thesesHtmlParsed = wrap(2, "Корпус тезисов", THESES_BLOCKS + sub("Сводная таблица тезисов", tbl(TH, THESES_ROWS)));
/** Таблица документа переставлена: строка 0 — «Э-2» (тезис № 3) — случай Д-35 */
const thesesHtmlDoc = wrap(2, "Корпус тезисов", THESES_BLOCKS + sub("Сводная таблица тезисов", tbl(TH, [THESES_ROWS[2], THESES_ROWS[0], THESES_ROWS[1]])));
const nameHtml = (num, strong) => wrap(num, "Анализ названия",
  sub("Таблица вариантов названия", tbl(["Вариант", "Довод"], [["Первый", "черновой"]])) +
  sub("Сравнительный анализ вариантов", "<p>Сравнение вариантов.</p>") +
  sub("Итоговая рекомендация", `<p><strong>${strong}</strong></p><p>Довод в пользу названия.</p>`));
const CAPSULE = (t) => `<div class="capsule"><p>${t}</p></div>`;
const REPL1 = "то, что есть, взятое в его определённости";
const ROWS = [
  ["1", "Таблица категорий", "Бытие", "уточнить формулировку", REPL1, "Слепые пятна", "существенная"],
  ["2", "Таблица категорий", "Ничто", "развить", "", "Слепые пятна", "косметическая"],
  ["3", "Методология построения графа", "", "развить", "", "Подраздел, которого нет", "косметическая"],
];
const proseHtml = (lead) => `<p>${lead}</p><p><strong>Рекомендация 1:</strong> уточнить определение бытия.</p><p><strong>Рекомендация 2:</strong> развить определение ничто.</p><p><strong>Рекомендация 3:</strong> развить методологию.</p>`;
function critiqueBody(lead, opts = {}) {
  let html = "";
  for (const n of CRIT_SUBS) {
    if (n === INTERLAYER && opts.skipInterlayer) continue;
    if (n === PROSE) html += sub(n, proseHtml(lead));
    else if (n === TABLE) html += sub(n, tbl(HEAD, ROWS));
    else html += sub(n, `<p>Подраздел «${n}»: текст критики.</p>`);
    html += "\n";
  }
  return html;
}
const DIALOGUE_BODY = sub("Диалог", "<p><strong>Кант:</strong> реплика.</p>");

/* ── Мок Claude ──────────────────────────────────────────────────────── */
const mock = { calls: 0, picked: [], failed: new Set(), critique: { lead: "Редакция А.", skipInterlayer: false }, refinePrompts: [] };
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
    if (prompt.includes("ТОЧЕЧНАЯ ПРАВКА ОДНОГО ЭЛЕМЕНТА")) { mock.refinePrompts.push(prompt); mock.picked.push("(refine)"); text = "```\n«то, чего нет, развёрнутое в определение»\n```"; }
    else if (task.includes(`Столбцы СТРОГО: ${HEAD.join(" | ")}`)) { mock.picked.push("critique"); text = critiqueBody(mock.critique.lead, mock.critique); }
    else if (task.includes("Таблица связей")) { mock.picked.push("graph"); text = GRAPH_BODY; }
    else if (task.includes("Сводная таблица")) { mock.picked.push("theses"); text = THESES_BLOCKS + sub("Сводная таблица тезисов", tbl(TH, THESES_ROWS)); }
    else if (task.includes("Точки напряжения")) { mock.picked.push("sum"); text = SUM_BODY; }
    else if (task.includes("Итоговая рекомендация")) { mock.picked.push("name"); text = sub("Таблица вариантов названия", tbl(["Вариант", "Довод"], [["Первый", "черновой"]])) + sub("Сравнительный анализ вариантов", "<p>Сравнение.</p>") + sub("Итоговая рекомендация", "<p><strong>«Мок-название»: о мере</strong></p>"); }
    else { mock.picked.push("(прочее)"); text = DIALOGUE_BODY; }
    const picked = mock.picked[mock.picked.length - 1];
    // R2: один раз на синтез — 400 «credit balance» на названном разделе (kind billing → пауза)
    if ((marker?.[1] === "FAIL" || marker?.[1] === "FAILSLOW") && marker[2] === picked) {
      const key = marker[0] + "|" + picked + "|" + (prompt.match(/зерно-(\w+)/)?.[1] ?? "");
      if (!mock.failed.has(key)) {
        mock.failed.add(key);
        if (marker[1] === "FAILSLOW") await sleep(6000); // страница успевает открыться и подписаться — пауза приходит живой
        res.writeHead(400, { "content-type": "application/json" });
        res.end(J({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }));
        return;
      }
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 1000 } } });
    if (marker?.[1] === "SLOW") {
      // R3: медленный стрим — генерация живёт, пока страница жмёт «Остановить»
      let i = 0, closed = false;
      req.on("close", () => { closed = true; });
      const step = Math.max(1, Math.ceil(text.length / 90));
      while (i < text.length && !closed) { send({ type: "content_block_delta", delta: { type: "text_delta", text: text.slice(i, i + step) } }); i += step; await sleep(700); }
      if (closed) { try { res.end(); } catch {} return; }
    } else {
      for (let i = 0; i < text.length; i += 1500) send({ type: "content_block_delta", delta: { type: "text_delta", text: text.slice(i, i + 1500) } });
    }
    send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2000 } });
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
    const headers = { Cookie: cookie, ...extraHeaders };
    let payload;
    if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
    const r = await fetch(BASE + p, { method, headers, body: payload });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  };
  return { api, cookie };
}
async function account(tag) {
  const email = `t124-${tag}-${Date.now()}@example.com`, password = "password-124";
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  return { ...client(cookie), email, password, id: u.id };
}
const S = (id, tail = "") => `/syntheses/${id}${tail}`;
const subUrl = (id, key, name) => S(id, `/sections/${key}/subsections/${encodeURIComponent(name)}`);
const secHtml = async (id, key) => (await sql`select html_content h, is_edited e from sections where synthesis_id=${id} and key=${key}`)[0] ?? null;
const synthRow = async (id) => (await sql`select title, status, capsule_html, paused_state from syntheses where id=${id}`)[0];
const planUrl = (id, planId, tail = "") => `/syntheses/${id}/plans/${planId}${tail}`;
const ids = [];
async function seedDoc(userId, { title, order, sections, lineage = [], capsule = "" }) {
  const [s] = await sql`insert into syntheses (user_id, seed, title, status, section_order, doc_num, capsule_html, method, synth_level, depth)
    values (${userId}, ${"зерно 12.4 " + TAG}, ${title}, 'ready', ${sql.json(order)}, ${"T124-" + Math.random().toString(36).slice(2, 7)}, ${capsule}, 'dialectical', 'comparative', 'overview') returning id`;
  ids.push(s.id);
  for (const x of sections) await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${s.id}, ${x.key}, ${x.num}, ${x.title}, ${x.html})`;
  let pos = 0;
  for (const l of lineage) {
    if (typeof l === "string") await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${s.id}, 'philosopher', ${l}, ${pos++})`;
    else await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${s.id}, 'synthesis', ${l.id}, ${pos++})`;
  }
  return s.id;
}
/** Документ R4–R6: резюме, тезисы (таблица переставлена), граф, название; капсула строкой sections. */
async function fullDoc(user, { meta = false, parent = null } = {}) {
  const title = `${meta ? "Мета-синтез" : "Синтез"} ${TAG}`;
  const id = await seedDoc(user.id, {
    title, order: ["sum", "theses", "graph", "name", "capsule"], capsule: CAPSULE("Исходный текст капсулы."),
    sections: [
      { key: "sum", num: 1, title: "Исполнительное резюме", html: wrap(1, "Исполнительное резюме", SUM_BODY) },
      { key: "theses", num: 2, title: "Корпус тезисов", html: thesesHtmlDoc },
      { key: "graph", num: 3, title: "Граф категорий", html: wrap(3, "Граф категорий", GRAPH_BODY) },
      { key: "name", num: 4, title: "Анализ названия", html: nameHtml(4, `«${title}»: о мере`) },
      { key: "capsule", num: 5, title: "Капсула концепции", html: CAPSULE("Исходный текст капсулы.") },
    ],
    lineage: meta ? ["Кант", { id: parent }] : ["Кант", "Гегель"],
  });
  await GP.saveGraphToDb(id, GP.parseGraphFromHTML(wrap(3, "Граф категорий", GRAPH_BODY)));
  await EP.saveElementsToDb(id, "theses", { theses: EP.parseThesesFromHTML(thesesHtmlParsed) });
  return id;
}
/** Документ R7: граф, диалог, критика по карте службы (фикстура 12.3). */
async function critiqueDoc(user, opts = {}) {
  const id = await seedDoc(user.id, {
    title: "Критика " + TAG, order: ["graph", "dialogue", "critique"],
    sections: [
      { key: "graph", num: 1, title: "Граф категорий", html: wrap(1, "Граф категорий", GRAPH_BODY) },
      { key: "dialogue", num: 2, title: "Диалог", html: wrap(2, "Диалог", DIALOGUE_BODY) },
      { key: "critique", num: 3, title: "Критический анализ", html: wrap(3, "Критический анализ", critiqueBody("Редакция А.", opts)) },
    ],
    lineage: ["Кант"],
  });
  await GP.saveGraphToDb(id, GP.parseGraphFromHTML(wrap(1, "Граф категорий", GRAPH_BODY)));
  return id;
}
async function waitStatus(id, pred, ms = 90000) {
  const t0 = Date.now();
  for (;;) { const r = await synthRow(id); if (pred(r)) return r; if (Date.now() - t0 > ms) throw new Error(`статус не дождался: ${r?.status}`); await sleep(400); }
}

/* ── Браузер ─────────────────────────────────────────────────────────── */
let browser = null, lastPage = null;
/** Перехват window.confirm в странице: счёт вызовов и тексты; ответ — true. */
const CONFIRM_SPY = () => {
  window.__confirms = [];
  window.confirm = (msg) => { window.__confirms.push(String(msg)); return true; };
};
async function newPage(who) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.dialogs = [];
  page.on("dialog", (d) => { page.dialogs.push(d.message()); void d.accept(); });
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setUserAgentOverride", { userAgent: await browser.userAgent(), acceptLanguage: "ru-RU,ru" });
  await page.evaluateOnNewDocument(CONFIRM_SPY);
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  lastPage = page;
  return page;
}
const confirms = (page) => page.evaluate(() => window.__confirms ?? []);
const text = (page, sel) => page.$eval(sel, (el) => el.textContent ?? "");
const exists = async (page, sel) => (await page.$(sel)) !== null;
const click = (page, sel) => page.$eval(sel, (el) => el.click());
const gone = (page, sel, ms = 20000) => page.waitForFunction((s) => !document.querySelector(s), { timeout: ms }, sel);
const waitSel = (page, sel, ms = 20000) => page.waitForSelector(sel, { timeout: ms });
const setValue = (page, sel, value) => page.$eval(sel, (el, v) => {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, value);
/** Открыть форму правки подраздела и дождаться ЗАГРУЖЕННОГО исходника: поле есть уже в фазе loading
 *  («Загрузка…»), фаза ready переписывает его (React 19 — грабля 1.6b); набранное до того теряется. */
async function openSubEditor(page, name) {
  await click(page, `button[data-edit-subsection="${name}"]`);
  await page.waitForFunction(() => { const a = document.querySelector("textarea[data-subsection-source]"); return !!a && !a.disabled && a.value !== "" && !/^Загрузка/.test(a.value); }, { timeout: 15000 });
  await sleep(100);
}
/** Правка подраздела сохранена: без предупреждений и заметок форма закрывается сама (9.2), с ними — фаза saved и «Понятно» */
async function waitSubSaved(page) {
  try {
    await page.waitForFunction(() => { const f = document.querySelector("[data-subsection-editor]"); return !f || /Сохранено|Ошибка|не удалось/i.test(f.textContent ?? ""); }, { timeout: 15000 });
  } catch (e) { console.log("  [debug] форма подраздела: " + J(await page.evaluate(() => document.querySelector("[data-subsection-editor]")?.innerText.slice(0, 400)))); throw e; }
  if (await exists(page, 'button[data-subsection-action="cancel"]')) await click(page, 'button[data-subsection-action="cancel"]');
}
/** Клик МИМО контейнера второго шага — по телу страницы (mousedown на document). */
const clickAway = (page) => page.mouse.click(5, 5);
const openDoc = async (page, id) => { await page.goto(`${UI}/synthesis/${id}`, { waitUntil: "networkidle0" }); await waitSel(page, ".doc-section"); };
/** Панель истории: выбрать v{n} → «Откатить к v{n}» (window.confirm — обратимое действие, оставлен) */
async function rollbackTo(page, panelSel, n) {
  await waitSel(page, `${panelSel} .version-item:not(.current)`);
  await page.evaluate((s, v) => { const it = [...document.querySelectorAll(`${s} .version-item:not(.current)`)].find((x) => x.querySelector(".version-num")?.textContent.trim() === `v${v}`); if (it && !it.classList.contains("selected")) it.click(); }, panelSel, n);
  await page.waitForFunction((s, v) => [...document.querySelectorAll(`${s} button`)].some((b) => b.textContent.includes(`Откатить к v${v}`)), { timeout: 10000 }, panelSel, n);
  const before = (await confirms(page)).length;
  await page.evaluate((s, v) => [...document.querySelectorAll(`${s} button`)].find((b) => b.textContent.includes(`Откатить к v${v}`)).click(), panelSel, n);
  await page.waitForFunction((s) => ![...document.querySelectorAll(`${s} button`)].some((b) => /Откат…/.test(b.textContent)), { timeout: 20000 }, panelSel);
  return (await confirms(page)).length - before;
}

/* ══ Прогон ═════════════════════════════════════════════════════════════ */
try {
  if (!CHROME) throw new Error("браузер не найден — задайте CHROME_PATH (Chrome 131)");
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс (сироты: ps aux | grep -E '[i]ndex.ts|[v]ite')`);
  await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));

  console.log("■ Сборка клиента (vite build)");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8" });
  ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-124", STREAM_RETRY_DELAYS: "50", BILLING_ENFORCE: "false", API_KEY_ENCRYPTION_SECRET: "t124-" + "s".repeat(40), CLIENT_ORIGIN: UI }, "/tmp/t124-server.log");
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t124-preview.log");
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");
  let puppeteer;
  try { puppeteer = (await import("puppeteer-core")).default; }
  catch { const fb = process.env.PUPPETEER_CORE; if (!fb || !existsSync(fb)) throw new Error("puppeteer-core не найден — npm i --no-save puppeteer-core@23 либо PUPPETEER_CORE"); puppeteer = (await import(fb)).default; }
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"] });
  console.log(`  (браузер: ${await browser.version()}; клиент — сборка под vite preview)`);

  const A = await account("a"), B = await account("b"), ADM = await account("adm");
  await sql`update users set role='admin' where id=${ADM.id}`;
  await sql`update users set balance_usd = 50 where id in (${A.id}, ${B.id}, ${ADM.id})`;

  /* ════ R2: Д-2 ════ */
  if (want("R2")) {
    console.log("\n■ R2: Д-2 — один вопрос при пропуске с skipDegrades, ни одного без");
    for (const [failKey, expectQuestion, live, label] of [
      ["graph", true, false, "обрыв на графе, страница открыта В паузе (снапшот GET)"],
      ["graph", true, true, "обрыв на графе, страница открыта ДО паузы (живая пауза по WS)"],
      ["name", false, false, "обрыв на последнем разделе (зависимых нет)"],
    ]) {
      const seed = `[MOCK:${live ? "FAILSLOW" : "FAIL"}:${failKey}] зерно-${TAG}${failKey}${live ? "l" : ""}`;
      const post = await A.api("POST", "/syntheses", { seed, philosophers: ["Кант"], sections: ["graph", "theses", "sum", "name"], method: "dialectical", depth: "overview", synthLevel: "comparative" });
      ok(post.status === 201, `${label}: POST /syntheses → 201`, post.json);
      const G = post.json.id; ids.push(G);
      const page = await newPage(A);
      if (live) { await page.goto(`${UI}/synthesis/${G}`, { waitUntil: "networkidle0" }); await waitSel(page, T("abort-btn")); }
      const paused = await waitStatus(G, (r) => r.status === "paused" || r.status === "ready" || r.status === "error");
      const ps = paused.paused_state;
      ok(paused.status === "paused" && ps?.kind === "gen" && ps.reasonKind === "billing", `${label}: пауза billing`, [paused.status, ps?.reasonKind]);
      const degr = ps?.skipDegrades ?? [];
      ok(expectQuestion ? degr.length > 0 : degr.length === 0, `${label}: skipDegrades = ${J(degr)}`);
      if (!live) { await page.goto(`${UI}/synthesis/${G}`, { waitUntil: "networkidle0" }); await waitSel(page, ".progress-panel"); }
      // модалка паузы: открывается сама по новой паузе; при открытии страницы в паузе — по бейджу
      try { await waitSel(page, ".pause-overlay.visible", 8000); } catch { await waitSel(page, ".progress-pause-badge.visible"); await click(page, ".progress-pause-badge.visible"); await waitSel(page, ".pause-overlay.visible"); }
      const skipBtn = await page.evaluate(() => { const b = [...document.querySelectorAll(".pause-overlay.visible button")].find((x) => /Пропустить/.test(x.textContent)); if (!b) return false; b.click(); return true; });
      ok(skipBtn, `${label}: кнопка «⤴ Пропустить» в модалке паузы`);
      await waitStatus(G, (r) => r.status === "ready" || r.status === "error", 120000);
      const cf = await confirms(page);
      ok(cf.length === (expectQuestion ? 1 : 0), `${label}: window.confirm вызван ${expectQuestion ? "ровно один раз" : "ни разу"} (было: ${cf.length})`, cf);
      if (expectQuestion) ok(/строятся разделы: /.test(cf[0] ?? "") && degr.every((k) => (cf[0] ?? "").includes(k)) && /Всё равно пропустить\?/.test(cf[0] ?? ""), "вопрос несёт список зависимых разделов и «Всё равно пропустить?»", cf[0]);
      ok(page.dialogs.length === 0, `${label}: нативных диалогов нет (confirm перехвачен в странице)`, page.dialogs);
      const fin = await synthRow(G);
      ok(fin.status === "ready", `${label}: генерация после пропуска завершена (ready)`, fin.status);
      ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
      await page.browserContext().close();
    }
  }

  /* ════ R3: Д-17 ════ */
  if (want("R3")) {
    console.log("\n■ R3: Д-17 — второй шаг кнопок на пяти необратимых действиях");
    // (а) остановка генерации
    {
      const post = await A.api("POST", "/syntheses", { seed: `[MOCK:SLOW] зерно-${TAG}slow`, philosophers: ["Кант"], sections: ["graph", "theses"], method: "dialectical", depth: "overview", synthLevel: "comparative" });
      const G = post.json.id; ids.push(G);
      const page = await newPage(A);
      await page.goto(`${UI}/synthesis/${G}`, { waitUntil: "networkidle0" });
      await waitSel(page, T("abort-btn"), 30000);
      ok(!(await exists(page, T("abort-confirm"))), "остановка: до клика второго шага нет");
      await click(page, T("abort-btn"));
      await waitSel(page, T("abort-confirm"));
      ok((await exists(page, T("abort-cancel"))) && (await exists(page, T("abort-warn"))) && !(await exists(page, T("abort-btn"))), "первый клик: «Точно остановить?» + «Отмена» + предупреждение на месте кнопки");
      ok(/Точно остановить\?/.test(await text(page, T("abort-confirm"))) && /зафиксирован как финальное/.test(await text(page, T("abort-warn"))), "тексты второго шага");
      await clickAway(page);
      await gone(page, T("abort-confirm"));
      ok(await exists(page, T("abort-btn")), "клик мимо сбрасывает второй шаг — снова «⏹ Остановить»");
      await click(page, T("abort-btn")); await waitSel(page, T("abort-cancel")); await click(page, T("abort-cancel")); await gone(page, T("abort-confirm"));
      ok(await exists(page, T("abort-btn")), "«Отмена» сбрасывает второй шаг");
      ok((await synthRow(G)).status === "generating", "генерация всё ещё идёт — ничего не остановлено");
      await click(page, T("abort-btn")); await waitSel(page, T("abort-confirm")); await click(page, T("abort-confirm"));
      const st = await waitStatus(G, (r) => r.status !== "generating", 30000);
      ok(st.status !== "generating", `второй клик остановил генерацию (status=${st.status})`);
      ok((await confirms(page)).length === 0 && page.dialogs.length === 0, "window.confirm не вызывался");
      ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
      await page.browserContext().close();
    }
    // (б) удаление API-ключа
    {
      const page = await newPage(A);
      const put = await A.api("POST", "/billing/api-key", { key: "sk-ant-api03-GOOD-" + "g".repeat(60) });
      ok(put.status === 201, "ключ сохранён по API", put.json);
      await page.goto(`${UI}/billing`, { waitUntil: "networkidle0" });
      await waitSel(page, T("api-key-delete"));
      await click(page, T("api-key-delete"));
      await waitSel(page, T("api-key-delete-confirm"));
      ok((await exists(page, T("api-key-delete-cancel"))) && (await exists(page, T("api-key-delete-warn"))) && /Точно удалить\?/.test(await text(page, T("api-key-delete-confirm"))), "ключ: второй шаг — «Точно удалить?» + «Отмена» + предупреждение");
      await clickAway(page); await gone(page, T("api-key-delete-confirm"));
      ok((await exists(page, T("api-key-delete"))) && (await A.api("GET", "/billing/api-key")).json.keys.length === 1, "клик мимо сбросил, ключ на месте");
      await click(page, T("api-key-delete")); await waitSel(page, T("api-key-delete-confirm")); await click(page, T("api-key-delete-confirm"));
      await waitSel(page, T("api-key-absent"));
      ok((await A.api("GET", "/billing/api-key")).json.keys.length === 0, "второй клик удалил ключ");
      ok((await confirms(page)).length === 0 && page.dialogs.length === 0, "window.confirm не вызывался");
      ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
      await page.browserContext().close();
    }
    // (в) тип каталога и (г) роль — админ
    {
      const key = `t124_${TAG}`;
      const mk = await ADM.api("POST", "/taxonomy/category-types", { key, nameRu: "пробная 12.4", description: "d" });
      ok(mk.status === 201 || mk.status === 200, "свой тип категории заведён по API", mk.json);
      const page = await newPage(ADM);
      await page.goto(`${UI}/admin/prompts`, { waitUntil: "networkidle0" });
      await waitSel(page, T("tab-catalogs")); await click(page, T("tab-catalogs"));
      const del = T(`catalog-category-delete-${key}`);
      await waitSel(page, del);
      await click(page, del);
      await waitSel(page, T(`catalog-category-delete-confirm-${key}`));
      ok((await exists(page, T(`catalog-category-delete-cancel-${key}`))) && (await exists(page, T(`catalog-category-delete-warn-${key}`))) && /Точно удалить\?/.test(await text(page, T(`catalog-category-delete-confirm-${key}`))), "тип: второй шаг в строке таблицы со строкой-предупреждением");
      ok(/Удалить тип/.test(await text(page, T(`catalog-category-delete-warn-${key}`))), "предупреждение — прежний текст confirm", await text(page, T(`catalog-category-delete-warn-${key}`)));
      await clickAway(page); await gone(page, T(`catalog-category-delete-confirm-${key}`));
      ok((await sql`select 1 from category_type_catalog where key=${key}`).length === 1, "клик мимо сбросил, тип на месте");
      await click(page, del); await waitSel(page, T(`catalog-category-delete-confirm-${key}`)); await click(page, T(`catalog-category-delete-confirm-${key}`));
      await gone(page, T(`catalog-category-row-${key}`));
      await sleep(200);
      ok((await sql`select 1 from category_type_catalog where key=${key}`).length === 0, "второй клик удалил тип");
      // роль
      await click(page, T("tab-access"));
      await waitSel(page, T("access-search"));
      await setValue(page, T("access-search"), B.email);
      await waitSel(page, T(`access-toggle-${B.email}`));
      await click(page, T(`access-toggle-${B.email}`));
      await waitSel(page, T(`access-toggle-confirm-${B.email}`));
      ok((await exists(page, T(`access-toggle-cancel-${B.email}`))) && (await exists(page, T(`access-toggle-warn-${B.email}`))) && /Точно назначить\?/.test(await text(page, T(`access-toggle-confirm-${B.email}`))), "роль: второй шаг «Точно назначить?» + «Отмена» + предупреждение");
      await click(page, T(`access-toggle-cancel-${B.email}`)); await gone(page, T(`access-toggle-confirm-${B.email}`));
      ok((await sql`select role from users where id=${B.id}`)[0].role === "user", "«Отмена» сбросила — роль прежняя");
      await waitSel(page, T(`access-toggle-${B.email}`)); await click(page, T(`access-toggle-${B.email}`)); await waitSel(page, T(`access-toggle-confirm-${B.email}`)); await click(page, T(`access-toggle-confirm-${B.email}`));
      await page.waitForFunction((e) => document.querySelector(`[data-testid="access-row-${e}"]`)?.getAttribute("data-role") === "admin", { timeout: 15000 }, B.email);
      ok((await sql`select role from users where id=${B.id}`)[0].role === "admin", "второй клик назначил админа");
      await waitSel(page, T(`access-toggle-${B.email}`)); await click(page, T(`access-toggle-${B.email}`)); await waitSel(page, T(`access-toggle-confirm-${B.email}`));
      ok(/Точно снять права\?/.test(await text(page, T(`access-toggle-confirm-${B.email}`))), "у админа второй шаг — «Точно снять права?»");
      await click(page, T(`access-toggle-confirm-${B.email}`));
      await page.waitForFunction((e) => document.querySelector(`[data-testid="access-row-${e}"]`)?.getAttribute("data-role") === "user", { timeout: 15000 }, B.email);
      ok((await sql`select role from users where id=${B.id}`)[0].role === "user", "права сняты");
      ok((await confirms(page)).length === 0 && page.dialogs.length === 0, "window.confirm не вызывался (тип и роль)");
      ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
      await page.browserContext().close();
    }
    // (д) удаление аккаунта
    {
      const C = await account("c");
      const page = await newPage(C);
      await page.goto(`${UI}/profile`, { waitUntil: "networkidle0" });
      await waitSel(page, T("delete-account-form"));
      await setValue(page, `${T("delete-account-form")} input[type=password]`, C.password);
      await click(page, T("delete-account-btn"));
      await waitSel(page, T("delete-account-cancel"));
      ok(/Точно удалить\?/.test(await text(page, T("delete-account-btn"))) && (await exists(page, T("delete-account-warn"))), "аккаунт: первый сабмит взводит кнопку — «Точно удалить?» + «Отмена» + предупреждение");
      await sleep(300);
      ok((await sql`select email from users where id=${C.id}`)[0].email === C.email, "после первого сабмита ничего не удалено");
      await clickAway(page); await gone(page, T("delete-account-cancel"));
      ok(!/Точно удалить\?/.test(await text(page, T("delete-account-btn"))), "клик мимо сбросил второй шаг");
      await click(page, T("delete-account-btn")); await waitSel(page, T("delete-account-cancel")); await click(page, T("delete-account-btn"));
      await page.waitForFunction(() => location.pathname !== "/profile", { timeout: 20000 });
      await sleep(300);
      ok(/deleted-.*@deleted\.invalid/.test((await sql`select email from users where id=${C.id}`)[0].email), `второй сабмит удалил аккаунт (анонимизирован), страница ушла с /profile (${await page.evaluate(() => location.pathname)})`);
      ok((await confirms(page)).length === 0 && page.dialogs.length === 0, "window.confirm не вызывался");
      ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
      await page.browserContext().close();
    }
  }

  /* ════ R4: Д-14 ════ */
  if (want("R4")) {
    console.log("\n■ R4: Д-14 — история раздела и капсулы с откатом");
    const D = await fullDoc(A);
    const page = await newPage(A);
    await openDoc(page, D);
    const before = await secHtml(D, "sum");
    ok(await exists(page, T("section-history-btn-sum")), "кнопка «◷ История» в строке действий раздела");
    // ручная правка подраздела «Цели и метод»
    await openSubEditor(page, "Цели и метод");
    await setValue(page, "textarea[data-subsection-source]", "<p>Цели переписаны рукой.</p>");
    await click(page, 'button[data-subsection-action="save"]');
    // без предупреждений и заметок форма закрывается сама (9.2); с ними — фаза saved и «Понятно»
    await waitSubSaved(page);
    const after = await secHtml(D, "sum");
    ok(after.h.includes("Цели переписаны рукой.") && !after.h.includes("Подраздел «Цели и метод»: исходный текст.") && after.e === true, "подраздел сохранён, раздел помечен is_edited");
    const [secRow] = await sql`select id from sections where synthesis_id=${D} and key='sum'`;
    const vers = await A.api("GET", S(D, `/elements/section/${secRow.id}/versions`));
    ok(vers.status === 200 && vers.json.versions.length === 1, "версия раздела v1 записана (elementId = sections.id)", vers.json);
    const sums = (await A.api("GET", S(D, "/sections"))).json.sections;
    ok(sums.every((s) => typeof s.id === "string" && s.id.length > 10) && sums.find((s) => s.key === "sum").id === secRow.id, "SectionSummary несёт id строки sections (решение пользователя)");
    await click(page, T("section-history-btn-sum"));
    await waitSel(page, T("section-history"));
    ok((await page.$eval(T("section-history"), (el) => el.getAttribute("data-section-id"))) === secRow.id, "панель истории открыта под разделом с его id");
    await waitSel(page, `${T("section-history")} .version-item:not(.current)`);
    const items = await page.$$eval(`${T("section-history")} .version-item`, (els) => els.map((e) => e.textContent));
    ok(items.length === 2 && /текущее состояние/.test(items[0]) && /v1/.test(items[1]) && /Цели/.test(items[1]), "список: текущее состояние + v1 с текстовым превью (без тегов)", items);
    await page.evaluate(() => [...document.querySelectorAll('[data-testid="section-history"] .version-item:not(.current)')][0].click());
    await waitSel(page, `${T("section-history")} .diff`);
    const diffTxt = await text(page, `${T("section-history")} .diff`);
    ok(/исходный текст/.test(diffTxt) && /переписаны рукой/.test(diffTxt) && !/<p>|<div/.test(diffTxt), "diff снимка раздела — текстом, без разметки", diffTxt.slice(0, 200));
    const n = await rollbackTo(page, T("section-history"), 1);
    ok(n === 1, "откат версии — window.confirm (обратимое действие, оставлен)");
    await page.waitForFunction(() => /исходный текст/.test(document.querySelector('[data-section="Цели и метод"]')?.textContent ?? "") && !/переписаны рукой/.test(document.querySelector('[data-section="Цели и метод"]')?.textContent ?? ""), { timeout: 15000 });
    ok(true, "документ на странице прежний — без перезагрузки");
    const rolled = await secHtml(D, "sum");
    ok(rolled.h === before.h, "html_content раздела в БД — побайтно прежний");
    // капсула
    const capBefore = (await synthRow(D)).capsule_html;
    await click(page, T("capsule-edit"));
    await waitSel(page, `${T("capsule-form")} textarea`);
    await setValue(page, `${T("capsule-form")} textarea`, "Капсула, переписанная рукой."); // форма ✎ принимает текст (8.4)
    await click(page, T("capsule-save"));
    await gone(page, T("capsule-form"));
    ok((await synthRow(D)).capsule_html.includes("переписанная рукой") && (await secHtml(D, "capsule")).h.includes("переписанная рукой"), "капсула ✎: обе точки обновлены");
    ok(/переписанная рукой/.test(await text(page, T("capsule-text"))), "шапка показывает новую капсулу");
    await click(page, T("capsule-history"));
    await waitSel(page, T("capsule-history-panel"));
    const [capRow] = await sql`select id from sections where synthesis_id=${D} and key='capsule'`;
    ok((await page.$eval(`${T("capsule-history-panel")} ${T("section-history")}`, (el) => el.getAttribute("data-section-id"))) === capRow.id, "панель капсулы — та же SectionHistory с id строки sections 'capsule'");
    await rollbackTo(page, T("capsule-history-panel"), 1);
    try {
      await page.waitForFunction(() => { const t = document.querySelector('[data-testid="capsule-text"]')?.textContent ?? ""; return !/переписанная рукой/.test(t) && /Исходный текст капсулы/.test(t); }, { timeout: 15000 });
    } catch (e) { console.log("  [debug] capsule-text=" + J(await page.evaluate(() => document.querySelector('[data-testid="capsule-text"]')?.outerHTML ?? null))); throw e; }
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="capsule-history-panel"] .version-item:not(.current)').length === 2, { timeout: 15000 });
    const capItems = await page.$$eval(`${T("capsule-history-panel")} .version-item`, (els) => els.map((e) => e.textContent));
    ok(capItems.length === 3 && /откат/.test(capItems[1]) && /переписанная рукой/.test(capItems[1]) && !/&lt;|<p>/.test(capItems[1]), "история капсулы: v2 — снимок до отката, превью текстом (сущности раскрыты)", capItems);
    ok((await synthRow(D)).capsule_html === capBefore, "откат капсулы: шапка прежняя без перезагрузки, syntheses.capsule_html прежний");
    // та же панель на карточке EditModal
    await page.evaluate(() => [...document.querySelectorAll(".actions-bar button")].find((b) => /изменить/i.test(b.innerText)).click());
    await waitSel(page, ".edit-modal");
    // карточки «sum» в EditModal нет (резюме не перегенерируется по месту) — панель у карточки тезисов
    await waitSel(page, T("edit-card-history-theses"));
    await click(page, T("edit-card-history-theses"));
    await waitSel(page, `.edit-modal ${T("section-history")}`);
    const [thRow] = await sql`select id from sections where synthesis_id=${D} and key='theses'`;
    ok((await page.$eval(`.edit-modal ${T("section-history")}`, (el) => el.getAttribute("data-section-id"))) === thRow.id, "карточка EditModal: та же панель истории с id строки раздела");
    await page.waitForFunction(() => /правок ещё не было|v\d/.test(document.querySelector('.edit-modal [data-testid="section-history"]')?.textContent ?? ""), { timeout: 15000 });
    ok(/правок ещё не было/.test(await text(page, `.edit-modal ${T("section-history")}`)), "у нетронутого раздела — «правок ещё не было»");
    await click(page, ".edit-modal .raw-close"); await gone(page, ".edit-modal");
    ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
    await page.browserContext().close();
  }

  /* ════ R5: Д-15, Д-19, Д-7 ════ */
  if (want("R5")) {
    console.log("\n■ R5: Д-15 — пометка ⟳; Д-19 — бюджет превью с сервера; Д-7 — футер плана");
    const D = await fullDoc(A);
    const page = await newPage(A);
    await openDoc(page, D);
    ok(!(await exists(page, T("toc-edited-sum"))) && !(await exists(page, T("section-edited-sum"))), "до правки пометки ⟳ нет");
    await openSubEditor(page, "Новизна и ценность");
    await setValue(page, "textarea[data-subsection-source]", "<p>Новизна переписана рукой.</p>");
    await click(page, 'button[data-subsection-action="save"]');
    await waitSel(page, T("section-edited-sum"));
    ok(/⟳/.test(await text(page, T("section-edited-sum"))) && /изменён/.test(await text(page, T("section-edited-sum"))), "у раздела «Резюме» пометка «⟳ изменён» — сразу, без перезагрузки");
    await waitSel(page, T("toc-edited-sum"));
    ok(/⟳/.test(await text(page, T("toc-edited-sum"))), "в оглавлении у «§ 1» — ⟳");
    ok(!(await exists(page, T("toc-edited-theses"))) && !(await exists(page, T("section-edited-theses"))), "у нетронутых разделов пометки нет");
    await page.reload({ waitUntil: "networkidle0" }); await waitSel(page, ".doc-section");
    ok((await exists(page, T("toc-edited-sum"))) && (await exists(page, T("section-edited-sum"))), "после перезагрузки пометка на месте (isEdited из БД)");
    await page.browserContext().close();

    // Д-19: превью формы — contextBudget с сервера
    const cfg = (await ADM.api("GET", "/configs/context_budget/versions")).json.versions.find((v) => v.isActive);
    const fp = await newPage(A);
    const budgetLine = async () => fp.evaluate(() => { const m = (document.body.textContent ?? "").match(/Без ужимания:\s+бюджет секций\s+([\d\s ]+)\s+симв\./); return m ? Number(m[1].replace(/[\s ]/g, "")) : null; });
    async function openForm() {
      await fp.goto(`${UI}/synthesis/new`, { waitUntil: "networkidle0" });
      await fp.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /из каталога/i.test(b.innerText)), { timeout: 20000 });
      await fp.evaluate(() => [...document.querySelectorAll("button")].find((b) => /из каталога/i.test(b.innerText)).click());
      await fp.waitForFunction(() => [...document.querySelectorAll(".pool-card-btn")].some((b) => !b.disabled), { timeout: 20000 });
      await fp.evaluate(() => [...document.querySelectorAll(".pool-card-btn")].find((b) => !b.disabled).click());
      const seedArea = await fp.$("textarea");
      if (seedArea) await setValue(fp, "textarea", "зерно для оценки " + Date.now());
      await fp.waitForFunction(() => /Без ужимания:\s+бюджет секций/.test(document.body.textContent ?? ""), { timeout: 30000 });
    }
    await openForm();
    const b0 = await budgetLine();
    const est0 = (await A.api("POST", "/syntheses/estimate", { seed: "s", sections: ["sum"], method: "dialectical", depth: "standard", synthLevel: "comparative" })).json;
    ok(b0 !== null && est0.contextBudget === b0, `превью формы показывает contextBudget сервера (${b0})`, [b0, est0.contextBudget]);
    const put = await ADM.api("PUT", "/configs/context_budget", { value: { ...cfg.value, standard: cfg.value.standard + 7000 }, description: "t124 R5" });
    const act = await ADM.api("POST", "/configs/context_budget/activate", { version: put.json.config.version });
    ok(put.status === 201 && act.status === 200, "новая версия context_budget активирована по API");
    await openForm();
    const b1 = await budgetLine();
    ok(b1 === b0 + 7000, `после активации превью показывает новый бюджет (${b1}) — клиент не правился`, [b0, b1]);
    await ADM.api("POST", "/configs/context_budget/activate", { version: cfg.version });
    ok(fp.errors.length === 0, "ошибок страницы нет", fp.errors);
    await fp.browserContext().close();

    // Д-7: план с каскадными pending — футер
    const C7 = await critiqueDoc(A);
    const cp = await newPage(A);
    await openDoc(cp, C7);
    await click(cp, T("recommendations-btn")); await waitSel(cp, T("rec-panel")); await waitSel(cp, T("rec-item"));
    for (const num of ["1", "2"]) await cp.$eval(`${T("rec-item")}[data-rec-num="${num}"] ${T("rec-pick")}`, (el) => el.click());
    await click(cp, T("rec-build-plan"));
    await waitSel(cp, T("plan-step"), 30000);
    const [planRow] = await sql`select id from edit_plans where synthesis_id=${C7} order by created_at desc limit 1`;
    const plan = (await A.api("GET", planUrl(C7, planRow.id))).json.plan;
    const footer = await text(cp, ".edit-modal-footer");
    ok(plan.cascadePending.steps > 0 && plan.estimatedCost > 0, "план: взятые шаги с оценкой и каскадные pending", [plan.estimatedCost, plan.cascadePending]);
    ok(footer.includes(`План: ${plan.costBreakdown.free.steps} бесплатно · ${plan.costBreakdown.paid.steps} платно`), "футер: «План: N бесплатно · M платно» — числа сервера", footer);
    ok(footer.includes(`${plan.cascadePending.steps} каскадных ждут решения`) && footer.includes(`ещё ≈ $${plan.cascadePending.costUsd.toFixed(4)}`), "футер: ждущие — отдельно, с их оценкой", footer);
    ok(footer.includes(`≈ $${plan.estimatedCost.toFixed(4)}`), "футер: оценка — estimatedCost плана (только взятые)", footer);
    ok(!/оценка — с ними/.test(footer), "оборота «оценка — с ними» нет");
    await click(cp, ".edit-modal .raw-close"); await gone(cp, ".edit-modal");
    await A.api("DELETE", planUrl(C7, planRow.id));
    ok(cp.errors.length === 0, "ошибок страницы нет", cp.errors);
    await cp.browserContext().close();
  }

  /* ════ R6: Д-34, Д-35, Д-41, Д-42 ════ */
  if (want("R6")) {
    console.log("\n■ R6: Д-34 название; Д-35 тезис по метке; Д-42 подпись поля; Д-41 бейдж схемы");
    const P = await fullDoc(A);
    const M = await fullDoc(A, { meta: true, parent: P });
    const page = await newPage(A);
    await openDoc(page, M);
    const title0 = (await text(page, ".doc-title")).trim();
    ok(title0.includes(`Мета-синтез ${TAG}`), "шапка: исходное название", title0);
    // Д-34
    await openSubEditor(page, "Итоговая рекомендация");
    await setValue(page, "textarea[data-subsection-source]", `<p><strong>«Онтология меры ${TAG}»: новое</strong></p><p>Довод.</p>`);
    await click(page, 'button[data-subsection-action="save"]');
    await page.waitForFunction((t) => (document.querySelector(".doc-title")?.textContent ?? "").includes(t), { timeout: 15000 }, `Онтология меры ${TAG}`);
    ok(true, "шапка показывает новое название без перезагрузки");
    const note = await text(page, "[data-subsection-editor]");
    ok(/Сохранено/.test(note) && /Название концепции обновлено/.test(note) && note.includes(`«Онтология меры ${TAG}»`), "форма: заметка «Название концепции обновлено: «…»»", note.slice(0, 200));
    ok((await synthRow(M)).title === `Онтология меры ${TAG}`, "название в БД обновлено");
    await click(page, 'button[data-subsection-action="cancel"]');
    // Д-35
    const [th3] = await sql`select id, thesis_num, label from theses where synthesis_id=${M} and label='Э-2'`;
    ok(th3?.thesis_num === 3, "фикстура: тезис «Э-2» — № 3, а в таблице документа стоит первой строкой");
    await page.$eval('[data-section="Сводная таблица тезисов"] tbody tr:first-child button[data-edit-kind="thesis"]', (el) => el.click());
    await waitSel(page, "[data-element-editor='thesis']");
    const head = await text(page, "[data-element-editor='thesis'] .element-editor-title");
    ok(/Э-2/.test(head) && !/№1\b/.test(head), "инлайн-✎ первой строки открыл тезис «Э-2» (по метке, не по индексу); заголовок несёт метку", head);
    ok((await text(page, "[data-element-editor='thesis']")).includes(F_E2), "в редакторе — формулировка «Э-2»");
    // Д-42: правка формулировки тезиса второй раскладки
    if (!(await exists(page, "#th-ed-form"))) await page.evaluate(() => [...document.querySelectorAll("[data-element-editor='thesis'] button")].find((b) => /Редактировать/.test(b.textContent))?.click());
    await waitSel(page, "#th-ed-form");
    const NEW_F = F_E2 + " — переписано";
    await setValue(page, "#th-ed-form", NEW_F);
    await page.evaluate(() => [...document.querySelectorAll("[data-element-editor='thesis'] button")].find((b) => /^Сохранить$/.test(b.textContent.trim())).click());
    await page.waitForFunction(() => /Отражено точечной правкой абзаца/.test(document.querySelector("[data-element-impact]")?.textContent ?? ""), { timeout: 20000 });
    const impact = await text(page, "[data-element-impact]");
    ok(/Отражено точечной правкой абзаца: формулировка тезиса/.test(impact) && !/formulation/.test(impact), "«Отражено точечной правкой абзаца: формулировка тезиса» — подпись поля, не ключ", impact);
    const thHtml = (await secHtml(M, "theses")).h;
    ok(thHtml.includes(`<strong>${NEW_F}`) || thHtml.includes(NEW_F), "абзац формулировки во второй раскладке подправлен в документе");
    // Д-41
    await waitSel(page, T("schema-badge"));
    const badge = await text(page, T("schema-badge"));
    ok(/^◈ родительский контекст: /.test(badge.trim()) && (await page.$eval(T("schema-badge"), (el) => el.getAttribute("data-schema"))) === "selective-v1", "мета-синтез: бейдж схемы родительского контекста в шапке", badge);
    const exM = await fetch(`${BASE}${S(M, "/export/html")}`, { headers: { Cookie: A.cookie } });
    const exMt = await exM.text();
    ok(exM.status === 200 && exMt.includes('<span class="header-schema-badge"') && exMt.includes(badge.trim()), "HTML-выгрузка мета-синтеза несёт тот же бейдж", exMt.match(/header-schema-badge[^<]*/)?.[0]);
    await openDoc(page, P);
    ok(!(await exists(page, T("schema-badge"))), "синтез без концепций-родителей: бейджа нет");
    const exP = await (await fetch(`${BASE}${S(P, "/export/html")}`, { headers: { Cookie: A.cookie } })).text();
    ok(!exP.includes("header-schema-badge"), "… и в его выгрузке тоже");
    ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
    await page.browserContext().close();
  }

  /* ════ R7: Д-44, Д-48 ════ */
  if (want("R7")) {
    console.log("\n■ R7: Д-44 — замечание строки; Д-48 — блок предупреждений; Д-7 — два числа футера");
    const D = await critiqueDoc(A);
    const page = await newPage(A);
    await openDoc(page, D);
    await click(page, T("recommendations-btn")); await waitSel(page, T("rec-panel")); await waitSel(page, T("rec-item"));
    const item3 = `${T("rec-item")}[data-rec-num="3"]`;
    await waitSel(page, `${item3} ${T("rec-warning")}`);
    const warn = await text(page, `${item3} ${T("rec-warning")}`);
    ok(/«Подраздел, которого нет»/.test(warn) && /«Слепые пятна»/.test(warn), "под строкой 3 — замечание о чужом «Основании» с перечнем годных", warn);
    ok(!(await exists(page, T("rec-invalid-row"))), "негодных строк нет — замечание не отказ");
    ok((await page.$$eval(T("rec-warning"), (els) => els.length)) === 1, "замечание только у строки 3");
    await page.$eval(`${item3} ${T("rec-pick")}`, (el) => el.click());
    ok((await page.$eval(`${item3} ${T("rec-pick")}`, (el) => el.checked)), "строка 3 выбирается");
    await page.$eval(`${T("rec-item")}[data-rec-num="1"] ${T("rec-pick")}`, (el) => el.click());
    await click(page, T("rec-build-plan"));
    await waitSel(page, T("plan-step"), 30000);
    const [planRow] = await sql`select * from edit_plans where synthesis_id=${D} order by created_at desc limit 1`;
    ok(planRow.steps.some((s) => s.recommendationNum === "3" || /№ ?3\b/.test(J(s))) || (await sql`select status from recommendations where synthesis_id=${D} and num='3'`)[0].status === "planned", "строка 3 поставлена в план (status planned)");
    const plan = (await A.api("GET", planUrl(D, planRow.id))).json.plan;
    const footer = await text(page, ".edit-modal-footer");
    ok(footer.includes(`${plan.costBreakdown.free.steps} бесплатно · ${plan.costBreakdown.paid.steps} платно`) && (plan.cascadePending.steps === 0 || footer.includes(`${plan.cascadePending.steps} каскадных ждут решения`)) && !/оценка — с ними/.test(footer), "футер: два числа (взятые и ждущие), оборота «оценка — с ними» нет", footer);
    await click(page, ".edit-modal .raw-close"); await gone(page, ".edit-modal");
    await A.api("DELETE", planUrl(D, planRow.id));
    // Д-48: мок пропустил подраздел
    mock.critique = { lead: "Без межслойной.", skipInterlayer: true };
    const rg = await A.api("POST", S(D, "/regenerate/critique"), {});
    ok(rg.status === 200, "перегенерация критики запущена", rg.json);
    // ждём строку генлога критики с пометкой о пропуске (section_done этого прогона)
    const t0 = Date.now();
    let note = [];
    for (;;) {
      const [g] = await sql`select metadata m from generation_log where synthesis_id=${D} and section_key='critique' and log_type='generation' and created_at > now() - interval '2 minutes' order by created_at desc limit 1`;
      note = g?.m?.parseWarnings ?? [];
      if (note.some((w) => /не написав подраздел/.test(w))) break;
      if (Date.now() - t0 > 60000) break;
      await sleep(400);
    }
    ok(note.length === 1 && note[0].includes(`не написав подраздел «${INTERLAYER}»`), "генлог: пометка о пропущенном подразделе (Д-47)", note);
    await waitStatus(D, (r) => r.status === "ready", 60000);
    await sleep(500);
    mock.critique = { lead: "Редакция А.", skipInterlayer: false };
    await openDoc(page, D);
    await waitSel(page, T("parse-warnings-critique"));
    const summary = await text(page, `${T("parse-warnings-critique")} summary`);
    ok(/⚠ Замечания к последней генерации \(1 замечание\)/.test(summary), "заголовок блока: «Замечания к последней генерации (1 замечание)»", summary);
    const blockTxt = await text(page, T("parse-warnings-critique"));
    ok(!/Документ цел/.test(blockTxt) && /пропуски — подразделы, которых в ответе не оказалось/.test(blockTxt), "вводная без «Документ цел», называет пропуски");
    ok(blockTxt.includes(`не написав подраздел «${INTERLAYER}»`), "пометка о пропущенном подразделе в списке", blockTxt.slice(0, 300));
    ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
    await page.browserContext().close();
  }

  /* ════ R8: css-parity ════ */
  if (want("R8")) {
    console.log("\n■ R8: css-parity");
    const r = spawnSync("python3", [ROOT + "scripts/checks/css-parity-audit.py"], { cwd: ROOT, encoding: "utf8", timeout: 120000 });
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    ok(r.status === 0 && /итого правил с расхождениями: 0/.test(out) && /без правил: 0/.test(out) && /непокрытых правил 0 из/.test(out), "css-parity: A/B/C = 0", out.split("\n").slice(-4).join(" | "));
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
  await sql.end({ timeout: 2 });
}
console.log(`\nИТОГ test-124: ${passed} ✓ / ${failed} ✗${fails.length ? "\n  провалы: " + fails.join(" | ") : ""}`);
process.exit(failed ? 1 : 0);
