/**
 * Беседа 12.2 — тестовые запросы 2–5 одним харнессом.
 * Живой сервер :3000 + PG16/Redis + мок Claude :3922 + СБОРКА клиента (vite
 * build) под vite preview :5222 + браузер (Chrome 131 по умолчанию; путь —
 * CHROME_PATH). Документы:
 *  - фикстуры строками sections, гранулярные таблицы — парсерами 1.4 (урок 5.1);
 *  - граф «от модели» — перегенерация раздела graph через мок Claude;
 *  - ФАЙЛ концепции (T122_FILE обязателен): импорт 4.3 по HTTP.
 *
 *  R2  Д-29/Д-30: экспорт мета-синтеза → в файле оглавление со ссылками на все
 *      разделы и подразделы, ⏫ ведёт к оглавлению, блок «Генеалогическое
 *      древо» в шапке с родителем и его философами; стили на месте (в
 *      БРАУЗЕРЕ, по вычисленным стилям открытого файла); экспорт → импорт →
 *      разделы без ⏫ и якорей оглавления, дерево прежнее; файл концепции после
 *      импорта — без якорей subsec-… в тексте подразделов; страница клиента
 *      достраивает оглавление сама, без двойников
 *  R3  Д-9: таблица графа от модели с центральностью «0» и силой «0» → в БД 0;
 *      пустая ячейка и «—» → 0.5; ноль, выставленный PATCH (ползунок 5.4),
 *      переживает круг экспорт → импорт; в браузере на сборке клиента связь
 *      силой 0 — самая тонкая в 2D и самая прозрачная в 3D (вызовы WebGL),
 *      EdgePanel показывает 0.00; MMD, PNG и граф в экспортированном файле —
 *      так же
 *  R4  Д-10: типы «логическая», «онтологическая», «эпистемологическая»,
 *      «феноменологическая» → разные цвета в клиенте (2D, легенда), в PNG
 *      (пиксели) и в просмотрщике экспортированного файла, одни и те же во
 *      всех трёх
 *  R5  Д-36/Д-37 на файле концепции: theses.justification непуст у каждого
 *      тезиса с абзацем «Обоснование.»; правка обоснования РЕДАКТОРОМ 5.2 в
 *      браузере → patched, не pending, прочие абзацы блока целы; правка
 *      абзаца «Обоснование.» в подразделе → theses.justification, версия
 *      'manual'; документ с одноабзацной раскладкой — как прежде; название
 *      «X»: подзаголовок → «X» при генерации, правке раздела name и импорте
 *
 * Запуск (≈ 1,5 мин, в фоне): T122_FILE=… node_modules/.bin/tsx tests/test-122-requests2-5.mjs
 * Предпосылки: PG16 + Redis, миграции и сиды; `npm i --no-save puppeteer-core@23`
 * (либо PUPPETEER_CORE=<путь к puppeteer-core.js>); лог сервера — /tmp/t122-server.log.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";

const FILE = process.env.T122_FILE;
if (!FILE || !existsSync(FILE)) { console.log("T122_FILE не задан или файла нет — ПРОПУСК"); process.exit(0); }
const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5222, MOCK_PORT = 3922;
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${UI_PORT}`;
const CHROME = [process.env.CHROME_PATH, `${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`, "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome"].find((p) => p && existsSync(p));
const sql = postgres(process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth");
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
function ok(cond, name, extra) { if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 700) : ""}`); } }
const count = (s, frag) => s.split(frag).length - 1;
const RAW = readFileSync(FILE, "utf8");
const TAG = Math.random().toString(36).slice(2, 8);
const SCRATCH = mkdtempSync(path.join(tmpdir(), "t122-"));

/* ── Мок Claude: отвечает тем, что тест положил в очередь ─────────────── */
const mock = { calls: 0, queue: [] };
const mockSrv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    mock.calls++;
    const text = mock.queue.shift() ?? "<p>мок 12.2: очередь ответов пуста</p>";
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 1000 } } });
    for (let i = 0; i < text.length; i += 1500) send({ type: "content_block_delta", delta: { type: "text_delta", text: text.slice(i, i + 1500) } });
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
  const api = async (method, p, body) => {
    const headers = cookie ? { Cookie: cookie } : {};
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
    const r = await fetch(BASE + p, { method, headers, body: payload });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  };
  const raw = async (p) => { const r = await fetch(BASE + p, { headers: { Cookie: cookie } }); return { status: r.status, type: r.headers.get("content-type") ?? "", buf: Buffer.from(await r.arrayBuffer()) }; };
  return { api, raw, cookie };
}
async function account(tag) {
  const email = `t122-${tag}-${Date.now()}@example.com`;
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-122" }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-122" }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  return { ...client(cookie), email, id: u.id };
}
const ids = [];
async function importFile(user, html, name) {
  const fd = new FormData(); fd.append("file", new Blob([html], { type: "text/html" }), name);
  const imp = await user.api("POST", "/syntheses/import", fd);
  if (imp.status !== 200 && imp.status !== 201) throw new Error("импорт: " + imp.text.slice(0, 400));
  ids.push(imp.json.id);
  return imp.json;
}
const S = (id, tail = "") => `/syntheses/${id}${tail}`;
const subUrl = (id, key, name) => S(id, `/sections/${key}/subsections/${encodeURIComponent(name)}`);
const secHtml = async (id, key) => (await sql`select html_content h from sections where synthesis_id=${id} and key=${key}`)[0]?.h ?? "";
const secRows = (id) => sql`select key, title, html_content h from sections where synthesis_id=${id} order by section_num`;
const thesesOf = (id) => sql`select * from theses where synthesis_id=${id} order by thesis_num`;
const catsOf = (id) => sql`select * from categories where synthesis_id=${id} order by position`;
const edgesOf = (id) => sql`select * from category_edges where synthesis_id=${id} order by position`;
async function retry409(fn) { for (let i = 0; i < 40; i++) { const r = await fn(); if (r.status !== 409) return r; await sleep(300); } return fn(); }
const exportText = async (user, id, fmt) => { const r = await retry409(() => user.raw(S(id, `/export/${fmt}`))); return { ...r, text: r.buf.toString("utf8") }; };
const treeOf = async (user, id) => { const r = await user.api("GET", S(id, "/lineage/ancestors")); const strip = (n) => ({ type: n.type, name: n.name, children: (n.children ?? []).map(strip) }); return r.json?.tree ? strip(r.json.tree) : null; };

/* ── Фикстуры «как даёт генерация» ───────────────────────────────────── */
const tbl = (h, rows) => `<table class="doc-table"><thead><tr>${h.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>${b}</div>`;
const wrap = (num, title, b) => `<div class="doc-section">\n<div class="section-num">§ ${num}</div>\n<div class="section-title">${title}</div>\n<div class="doc-content">\n${b}\n</div>\n</div>`;
const CAT_H = ["Категория", "Тип", "Определение", "Центральность", "Определённость", "Происхождение"];
const EDGE_H = ["Источник", "Описание связи", "Цель", "Тип связи", "Направление", "Сила"];
/** Граф с нулями: «логическая» стоит ПЕРВОЙ — порядок, в котором проявлялся квирк Д-10 */
const CATS = [
  ["Логос", "логическая", "Мера речи", "0", "0.9", "Гераклит"],
  ["Бытие", "онтологическая", "То, что есть", "0.8", "0", "Парменид"],
  ["Знание", "эпистемологическая", "Обоснованное мнение", "", "—", "Платон"],
  ["Явление", "феноменологическая", "Данность сознанию", "0.4", "0.6", "Гуссерль"],
];
const EDGES = [
  ["Логос", "нулевая связь", "Бытие", "диалектическая", "однонаправленная", "0"],
  ["Бытие", "сильная связь", "Знание", "эмерджентная", "однонаправленная", "0.9"],
  ["Знание", "связь без силы", "Явление", "конкретизация", "однонаправленная", "—"],
];
const TYPES = CATS.map((c) => c[1]);
const graphHtml = (num, cats, edges) => wrap(num, "Граф категорий",
  sub("Методология построения графа", "<p>Категории выведены из зерна.</p>") +
  sub("Таблица категорий", tbl(CAT_H, cats)) + sub("Таблица связей", tbl(EDGE_H, edges)) +
  sub("Топология графа", "<p>Один кластер, без мостов.</p>"));
const TH = ["№", "Формулировка тезиса", "Тип (онтол./эпистем./этич.)", "Степень новизны", "Связанные категории"];
const block = (label, title, proseF, just) =>
  `<h5>Тезис ${label} (${title})</h5>` +
  `<p><strong>${proseF}</strong></p>` +
  `<p><strong>Обоснование.</strong> ${just}</p>` +
  `<p><strong>Ограничения, преодолеваемые тезисом.</strong></p><ul><li><em>Ограничение Юнга:</em> текст ограничения ${label}.</li></ul>` +
  `<p><strong>Степень новизны:</strong> порождён зерном концепции.</p>`;
const thesesBlockHtml = wrap(2, "Корпус тезисов",
  sub("Онтологические тезисы", block("О-1", "Мера", "Логос есть мера бытия — в прозе сказано иначе, чем в таблице.", "Первое обоснование.")) +
  sub("Эпистемологические тезисы", block("Э-1", "Знание", "Знание есть обоснованное мнение о явлении, взятое в его данности.", "Второе обоснование.")) +
  sub("Сводная таблица тезисов", tbl(TH, [["О-1", "Логос есть мера бытия", "Онтологический", "порождён", "Логос, Бытие"], ["Э-1", "Знание есть обоснованное мнение", "Эпистемологический", "порождён", "Знание"]])));
const OLD_J = "Потому что различие первично относительно тождества (§ Граф категорий).";
const thesesInlineHtml = wrap(2, "Корпус тезисов",
  sub("Онтологические тезисы", `<p><strong>Бытие есть событие различия</strong> ${OLD_J}</p><p><strong>Ничто не предшествует бытию</strong> Обоснование второго тезиса.</p>`) +
  sub("Сводная таблица тезисов", tbl(TH, [["1", "Бытие есть событие различия", "Онтологический", "высокая", "Бытие"], ["2", "Ничто не предшествует бытию", "Онтологический", "средняя", "Ничто"]])));
const sumHtml = wrap(1, "Исполнительное резюме", sub("Цели и метод", "<p>Цель синтеза — прояснить меру.</p>") + sub("Новизна и ценность", "<p>Новизна — в мере.</p>"));
const nameHtml = (num, strong) => wrap(num, "Анализ названия",
  sub("Таблица вариантов названия", tbl(["Вариант", "Довод"], [["Первый", "черновой"]])) +
  sub("Сравнительный анализ вариантов", "<p>Сравнение вариантов.</p>") +
  sub("Итоговая рекомендация", `<p><strong>${strong}</strong></p><p>Довод в пользу названия.</p>`));
async function seedDoc(userId, { title, order, sections, lineage = [], capsule = "" }) {
  const [s] = await sql`insert into syntheses (user_id, seed, title, status, section_order, doc_num, capsule_html, method, synth_level, depth)
    values (${userId}, ${"зерно 12.2 " + TAG}, ${title}, 'ready', ${sql.json(order)}, ${"T122-" + Math.random().toString(36).slice(2, 7)}, ${capsule}, 'dialectical', 'generative', 'standard') returning id`;
  ids.push(s.id);
  for (const x of sections) await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${s.id}, ${x.key}, ${x.num}, ${x.title}, ${x.html})`;
  let pos = 0;
  for (const l of lineage) {
    if (typeof l === "string") await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${s.id}, 'philosopher', ${l}, ${pos++})`;
    else await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${s.id}, 'synthesis', ${l.id}, ${pos++})`;
  }
  return s.id;
}

/* ── Браузер ─────────────────────────────────────────────────────────── */
/** Шпион WebGL: прозрачность (uniform `opacity` three.js) каждого вызова отрисовки ЛИНИЙ.
 *  Ребро 3D — THREE.Line (LINE_STRIP), прозрачность 0.3 + сила × 0.5. */
const GL_SPY = () => {
  const rec = (window.__gl = { strip: [] });
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const p = C.prototype;
    const names = new WeakMap(), progOpacity = new WeakMap(), current = new WeakMap();
    const gul = p.getUniformLocation;
    p.getUniformLocation = function (prog, name) { const loc = gul.call(this, prog, name); if (loc) names.set(loc, { prog, name }); return loc; };
    const u1f = p.uniform1f;
    p.uniform1f = function (loc, v) { const n = loc && names.get(loc); if (n && n.name === "opacity") progOpacity.set(n.prog, v); return u1f.call(this, loc, v); };
    const up = p.useProgram;
    p.useProgram = function (prog) { current.set(this, prog); return up.call(this, prog); };
    for (const fn of ["drawArrays", "drawElements"]) {
      const orig = p[fn];
      p[fn] = function (mode, ...rest) {
        if (mode === 3) { const pr = current.get(this); const o = pr ? progOpacity.get(pr) : undefined; rec.strip.push(o === undefined ? null : Math.round(o * 1000) / 1000); if (rec.strip.length > 4000) rec.strip.splice(0, 2000); }
        return orig.call(this, mode, ...rest);
      };
    }
  }
};
const lineOpacities = async (page) => { await page.evaluate(() => { window.__gl.strip.length = 0; }); await sleep(900); return page.evaluate(() => [...new Set(window.__gl.strip)].sort()); };
/** Состояние 2D-графа из DOM: данные d3 на элементах и нарисованные атрибуты */
const graph2d = (page) => page.evaluate(() => ({
  edges: [...document.querySelectorAll(".edge-line")].map((el) => ({ desc: el.__data__.desc, str: el.__data__.str, w: Number(el.getAttribute("stroke-width")), op: Number(el.getAttribute("stroke-opacity")), dash: el.getAttribute("stroke-dasharray"), stroke: el.getAttribute("stroke") })),
  nodes: [...document.querySelectorAll(".node-g")].map((g) => {
    const d = g.__data__;
    const shape = [...g.querySelectorAll("circle, path, polygon, rect")].find((x) => { const f = x.getAttribute("fill"); return f && f !== "none" && !x.classList.contains("node-inner"); });
    return { name: d.name, type: d.type, cen: d.cen, cert: d.cert, fill: (shape?.getAttribute("fill") ?? "").toLowerCase(), r: Number(g.querySelector(".node-circle")?.getAttribute("r") ?? NaN) };
  }),
}));
const clickEdge = (page, desc) => page.evaluate((d) => { const el = [...document.querySelectorAll(".edge-hit")].find((x) => x.__data__.desc === d); if (!el) return false; el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })); return true; }, desc);
const clickNode = (page, name) => page.evaluate((n) => { const el = [...document.querySelectorAll(".node-g")].find((x) => x.__data__.name === n); if (!el) return false; el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })); return true; }, name);
const panelState = (page) => page.evaluate(() => {
  const p = [...document.querySelectorAll(".gm-info-panel")].find((x) => x.classList.contains("visible")) ?? document.querySelector(".gm-info-panel");
  if (!p) return null;
  return { text: p.textContent, metrics: [...p.querySelectorAll(".gm-panel-metric")].map((m) => ({ label: m.querySelector("span")?.textContent ?? "", value: m.querySelector("span:last-child")?.textContent ?? "", bar: m.querySelector(".gm-panel-bar div")?.style.width ?? "" })) };
});
async function clickBtn(page, scope, label) {
  return page.evaluate((s, l) => { const b = [...document.querySelectorAll(`${s} button`)].find((x) => x.textContent.toLowerCase().includes(l.toLowerCase())); if (!b) return "no-button"; b.click(); return "ok"; }, scope, label);
}
const setTextarea = (page, sel, value) => page.$eval(sel, (el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); }, value);

let browser = null;
async function newPage(who, { gl = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  // язык интерфейса — русский (беседа 11.4: без этого headless отдаёт en-US и клиент рисует английский)
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setUserAgentOverride", { userAgent: await browser.userAgent(), acceptLanguage: "ru-RU,ru" });
  if (gl) await page.evaluateOnNewDocument(GL_SPY);
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  return page;
}
/** Экспортированный файл в браузере: CDN three/d3 — локальными копиями ТЕХ ЖЕ версий (приём 4.2) */
async function openFile(html, name) {
  const file = path.join(SCRATCH, name);
  writeFileSync(file, html);
  const page = await newPage(null, { gl: true });
  await page.setRequestInterception(true);
  page.on("request", (rq) => {
    const u = rq.url();
    if (u.includes("three.min.js")) rq.respond({ status: 200, contentType: "application/javascript", body: readFileSync(ROOT + "node_modules/three/build/three.min.js") });
    else if (u.includes("d3.min.js")) rq.respond({ status: 200, contentType: "application/javascript", body: readFileSync(ROOT + "node_modules/d3/dist/d3.min.js") });
    else if (u.startsWith("file:")) rq.continue();
    else rq.abort();
  });
  await page.goto("file://" + file, { waitUntil: "load" });
  return page;
}

/* ══ Прогон ═════════════════════════════════════════════════════════════ */
try {
  if (!CHROME) throw new Error("браузер не найден — задайте CHROME_PATH (Chrome 131)");
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс (сироты: ps aux | grep -E '[i]ndex.ts|[v]ite')`);
  await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));

  console.log("■ Сборка клиента (vite build)");
  const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8" });
  ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-122", STREAM_RETRY_DELAYS: "50", BILLING_ENFORCE: "false", CLIENT_ORIGIN: UI }, "/tmp/t122-server.log");
  sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t122-preview.log");
  await waitUp(`${BASE}/health`, "сервер");
  await waitUp(UI, "preview");
  let puppeteer;
  try { puppeteer = (await import("puppeteer-core")).default; }
  catch { const fb = process.env.PUPPETEER_CORE; if (!fb || !existsSync(fb)) throw new Error("puppeteer-core не найден — npm i --no-save puppeteer-core@23 либо PUPPETEER_CORE"); puppeteer = (await import(fb)).default; }
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU", "--enable-unsafe-swiftshader", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--allow-file-access-from-files"] });
  console.log(`  (браузер: ${await browser.version()}; клиент — сборка под vite preview)`);

  // Серверные модули — в процессе харнесса (tsx): посев гранулярных таблиц парсерами 1.4,
  // палитра экспорта и шпион вызовов canvas у PNG-экспортёра
  const gp = await import("../server/services/graph-parser.ts");
  const ep = await import("../server/services/element-parser.ts");
  const gstyle = await import("../server/services/export/graph-style.ts");
  const gmodel = await import("../server/services/export/graph-model.ts");
  const pngx = await import("../server/services/export/png-exporter.ts");
  const cv = await import("canvas");
  const en = JSON.parse(readFileSync(ROOT + "packages/shared/i18n/generated/en.json", "utf8"));
  void en;

  const A = await account("a");

  /* ── Документы ── */
  const P = await seedDoc(A.id, { title: "Родитель " + TAG, order: ["sum"], sections: [{ key: "sum", num: 1, title: "Исполнительное резюме", html: sumHtml }], lineage: ["Витгенштейн", "Шестов"] });
  const M = await seedDoc(A.id, {
    title: "Мета-синтез " + TAG, order: ["sum", "theses", "graph", "name"],
    capsule: wrap(0, "Капсула", sub("Капсула", "<p>Капсула мета-синтеза.</p>")),
    sections: [
      { key: "sum", num: 1, title: "Исполнительное резюме", html: sumHtml },
      { key: "theses", num: 2, title: "Корпус тезисов", html: thesesBlockHtml },
      { key: "graph", num: 3, title: "Граф категорий", html: graphHtml(3, CATS, EDGES) },
      { key: "name", num: 4, title: "Анализ названия", html: nameHtml(4, `«Мета-синтез ${TAG}»: о мере`) },
    ],
    lineage: ["Юнг", { id: P }],
  });
  await gp.saveGraphToDb(M, gp.parseGraphFromHTML(graphHtml(3, CATS, EDGES)));
  await ep.saveElementsToDb(M, "theses", { theses: ep.parseThesesFromHTML(thesesBlockHtml) });

  /* ════ R2: Д-29/Д-30 ════ */
  console.log("\n■ R2: Д-29/Д-30 — оглавление и древо в выгрузке мета-синтеза");
  let fileM;
  {
    const ex = await exportText(A, M, "html");
    ok(ex.status === 200 && ex.type.includes("text/html"), "GET export/html мета-синтеза → 200", ex.status);
    fileM = ex.text;
    const secs = (await A.api("GET", S(M, "/sections"))).json.sections;
    ok(secs.length === 4 && secs.every((s) => fileM.includes(`<a href="#sec-${s.key}">§ ${s.sectionNum} — `) && count(fileM, `<a id="sec-${s.key}"></a>`) === 1), "оглавление ссылается на ВСЕ разделы, у каждой ссылки один якорь", secs.map((s) => s.key));
    const subs = secs.flatMap((s) => s.subsections.map((n) => [s.key, n]));
    const linked = [...fileM.matchAll(/<p class="toc-sub-link"><a href="#(subsec-[^"]+)">([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
    ok(subs.length === 12 && linked.length === subs.length && linked.every(([id]) => count(fileM, `<a id="${id}"></a>`) === 1) && J(linked.map((l) => l[1])) === J(subs.map((s) => s[1])), `оглавление ссылается на ВСЕ подразделы (${subs.length}), у каждой ссылки ровно один якорь`, [subs.length, linked.length]);
    ok(count(fileM, '<a href="#docTOC" class="toc-back-btn"') === secs.length + subs.length, "⏫ стоит у каждого раздела и подраздела и ведёт к #docTOC", count(fileM, 'class="toc-back-btn"'));
    ok(fileM.includes('header-disclosure-genealogy" open><summary>Генеалогическое древо</summary>') && fileM.includes(`◈ Родитель ${TAG}`), "в шапке блок «Генеалогическое древо» с родителем");

    // Браузер: стили на месте — по вычисленным стилям ОТКРЫТОГО файла
    const page = await openFile(fileM, "meta.html");
    const st = await page.evaluate(() => {
      const cs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
      const toc = document.getElementById("docTOC");
      const tree = document.querySelector("details.header-disclosure-genealogy");
      return {
        tocOpen: !!toc?.open, tocBeforeFirstSection: !!toc && !!(toc.compareDocumentPosition(document.getElementById("sec-sum")) & Node.DOCUMENT_POSITION_FOLLOWING),
        tocAfterHeader: !!toc && !!(document.querySelector(".doc-header").compareDocumentPosition(toc) & Node.DOCUMENT_POSITION_FOLLOWING),
        summaryTransform: cs("#docTOC summary", "textTransform"), summaryMarker: cs("#docTOC summary", "listStyleType"),
        subPad: cs(".toc-sub-link", "paddingLeft"), secLinkDecoration: cs(".toc-section-link a", "textDecorationLine"), bodyPad: cs(".toc-body", "paddingLeft"),
        backOpacity: cs(".toc-back-btn", "opacity"), backDecoration: cs(".toc-back-btn", "textDecorationLine"),
        dead: [...document.querySelectorAll("#docTOC a")].filter((a) => !document.getElementById(a.getAttribute("href").slice(1))).length,
        links: document.querySelectorAll("#docTOC a").length,
        treeOpen: !!tree?.open, treeInHeader: !!tree?.closest(".doc-header"), treeH: tree?.getBoundingClientRect().height ?? 0,
        cards: [...document.querySelectorAll(".gen-tree .gen-card-name")].map((x) => x.textContent.trim()), phils: [...document.querySelectorAll(".gen-tree .gen-phil-name")].map((x) => x.textContent.trim()),
        cardBorder: cs(".gen-tree .gen-card", "borderTopStyle"), treeDisplay: cs(".gen-tree", "display"), ulListStyle: cs(".gen-tree ul", "listStyleType"), philPad: cs(".gen-tree .gen-phil", "paddingLeft"),
        parentPhils: [...(document.querySelectorAll(".gen-tree > ul > li")[1]?.querySelectorAll(".gen-phil-name") ?? [])].map((x) => x.textContent.trim()),
      };
    });
    ok(st.tocOpen && st.tocAfterHeader && st.tocBeforeFirstSection, "браузер: оглавление раскрыто и стоит между шапкой и первым разделом", st);
    ok(st.links === 16 && st.dead === 0, "браузер: каждая из 16 ссылок оглавления ведёт к существующему элементу", [st.links, st.dead]);
    ok(st.summaryTransform === "uppercase" && st.summaryMarker === "none" && st.subPad === "24px" && st.bodyPad === "48px" && st.secLinkDecoration === "none", "браузер: правила #docTOC, .toc-body, .toc-section-link, .toc-sub-link действуют (auditCSS не вырезал)", st);
    ok(st.backOpacity === "0.4" && st.backDecoration === "none", "браузер: правило .toc-back-btn действует", [st.backOpacity, st.backDecoration]);
    const target = linked[4][0];
    await page.evaluate((id) => document.querySelector(`#docTOC a[href="#${id}"]`).click(), target);
    await sleep(400);
    const jump = await page.evaluate((id) => ({ hash: decodeURIComponent(location.hash), top: document.getElementById(id).getBoundingClientRect().top, y: window.scrollY }), target);
    ok(jump.hash === "#" + target && jump.top > -5 && jump.top < 400 && jump.y > 100, "браузер: ссылка оглавления переводит к подразделу", jump);
    await page.evaluate((id) => document.getElementById(id).parentElement.querySelector("h4 .toc-back-btn").click(), target);
    await sleep(400);
    const back = await page.evaluate(() => ({ hash: location.hash, top: document.getElementById("docTOC").getBoundingClientRect().top }));
    ok(back.hash === "#docTOC" && back.top > -5 && back.top < 400, "браузер: ⏫ у подраздела возвращает к оглавлению", back);
    ok(st.treeOpen && st.treeInHeader && st.treeH > 60, "браузер: блок «Генеалогическое древо» раскрыт, в шапке, виден", [st.treeOpen, st.treeInHeader, st.treeH]);
    ok(J(st.cards) === J([`◈ Мета-синтез ${TAG}`, `◈ Родитель ${TAG}`]) && J(st.phils) === J(["Юнг", "Витгенштейн", "Шестов"]) && J(st.parentPhils) === J(["Витгенштейн", "Шестов"]), "браузер: в древе родитель-концепция и ЕГО философы", [st.cards, st.phils, st.parentPhils]);
    ok(st.treeDisplay !== "inline" && st.ulListStyle === "none" && st.cardBorder === "solid", "браузер: правила .gen-tree действуют (auditCSS не вырезал)", [st.treeDisplay, st.ulListStyle, st.cardBorder]);
    ok(page.errors.length === 0, "браузер: файл открылся без ошибок страницы", page.errors);
    await page.close();

    // экспорт → импорт
    const imp = await importFile(A, fileM, "meta.html");
    const rows = await secRows(imp.id);
    ok(rows.length === 4 && rows.every((r) => !r.h.includes("toc-back-btn") && !r.h.includes('id="subsec-') && !r.h.includes("⏫") && !r.title.includes("⏫")), "экспорт → импорт: в разделах нет ни ⏫, ни якорей оглавления, заголовки чисты", rows.map((r) => [r.key, r.title]));
    ok((await secHtml(imp.id, "theses")) === thesesBlockHtml && (await secHtml(imp.id, "sum")) === sumHtml, "… разметка разделов побайтно та же, что до экспорта");
    const one = (await A.api("GET", S(imp.id, "/sections/theses"))).json.section;
    ok(!one.htmlContent.includes("toc-back-btn") && one.title === "Корпус тезисов", "… GET /sections/theses отдаёт раздел без следов оглавления", one.title);
    const t0 = await treeOf(A, M), t1 = await treeOf(A, imp.id);
    ok(!!t0 && J(t1) === J(t0) && t0.children.length === 2 && t0.children[1].children.length === 2, "… дерево генеалогии прежнее (Юнг + родитель с двумя философами)", t1);
    const again = await exportText(A, imp.id, "html");
    ok(count(again.text, 'class="toc-back-btn"') === 16 && again.text.includes('header-disclosure-genealogy" open'), "… повторная выгрузка импортированного несёт то же оглавление и древо");
  }

  // Файл концепции: импорт по HTTP
  console.log("\n■ R2 (файл концепции): следы оглавления одностраничника");
  const live = await importFile(A, RAW, "live.html");
  const L = live.id;
  {
    ok(count(RAW, 'class="toc-back-btn"') > 10 && count(RAW, '<a id="subsec-') > 10, `файл несёт следы оглавления: ⏫ ×${count(RAW, 'class="toc-back-btn"')}, якорей subsec-… ×${count(RAW, '<a id="subsec-')}`);
    const rows = await secRows(L);
    ok(rows.length >= 10 && rows.every((r) => !r.h.includes("toc-back-btn") && !r.h.includes('id="subsec-') && !r.title.includes("⏫")), `после импорта в ${rows.length} разделах нет ни ⏫, ни якорей subsec-…`, rows.filter((r) => r.h.includes("subsec-") || r.title.includes("⏫")).map((r) => r.key));
    const secs = (await A.api("GET", S(L, "/sections"))).json.sections;
    const subsAll = secs.flatMap((s) => s.subsections.map((n) => [s.key, n]));
    let dirty = 0, read = 0;
    for (const [key, name] of subsAll) {
      const r = await A.api("GET", subUrl(L, key, name));
      if (r.status !== 200) continue;
      read++;
      if (/subsec-|toc-back-btn|⏫/.test(r.json.html)) dirty++;
    }
    ok(read >= 50 && dirty === 0, `исходник правки каждого из ${read} подразделов — без якорей и ⏫`, [read, dirty]);
    // Страница клиента достраивает оглавление сама — без двойников
    const page = await newPage(A);
    await page.goto(`${UI}/synthesis/${L}`, { waitUntil: "networkidle2" });
    await page.waitForSelector("#docTOC", { timeout: 20000 });
    const dom = await page.evaluate(() => {
      const idsAll = [...document.querySelectorAll('a[id^="subsec-"]')].map((a) => a.id);
      const h4 = [...document.querySelectorAll("[data-section] > h4")];
      return { anchors: idsAll.length, unique: new Set(idsAll).size, h4: h4.length, h4OneBtn: h4.filter((h) => h.querySelectorAll(".toc-back-btn").length === 1).length, tocSub: document.querySelectorAll("#docTOC .toc-sub-link").length, dead: [...document.querySelectorAll("#docTOC a")].filter((a) => !document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1)))).length };
    });
    ok(dom.anchors === dom.unique && dom.anchors === dom.tocSub && dom.h4OneBtn === dom.h4 && dom.dead === 0 && dom.tocSub >= 50, "страница клиента: якоря подразделов без двойников, у каждого <h4> ровно одна ⏫, мёртвых ссылок нет", dom);
    await page.close();
  }

  /* ════ R3: Д-9 ════ */
  console.log("\n■ R3: Д-9 — ноль характеристики: разбор");
  const G = await seedDoc(A.id, {
    title: "Граф " + TAG, order: ["sum", "theses", "graph", "name"],
    sections: [
      { key: "sum", num: 1, title: "Исполнительное резюме", html: sumHtml },
      { key: "theses", num: 2, title: "Корпус тезисов", html: thesesInlineHtml },
      { key: "graph", num: 3, title: "Граф категорий", html: graphHtml(3, [["Старое", "этическая", "Прежняя категория", "0.7", "0.7", "—"]], []) },
      { key: "name", num: 4, title: "Анализ названия", html: nameHtml(4, "Граф " + TAG) },
    ],
    lineage: ["Гераклит", "Гуссерль"],
  });
  await gp.saveGraphToDb(G, gp.parseGraphFromHTML(await secHtml(G, "graph")));
  await ep.saveElementsToDb(G, "theses", { theses: ep.parseThesesFromHTML(thesesInlineHtml) });
  let cats, eds;
  {
    // таблица графа ОТ МОДЕЛИ: перегенерация раздела через мок Claude
    mock.queue.push(graphHtml(3, CATS, EDGES));
    const rg = await retry409(() => A.api("POST", S(G, "/regenerate/graph"), {}));
    ok(rg.status === 200, "перегенерация раздела graph запущена (мок отдаёт таблицы с «0», пустой ячейкой и «—»)", rg.json);
    for (let i = 0; i < 150; i++) { cats = await catsOf(G); if (cats.length === 4 && cats[0].name === "Логос") break; await sleep(200); }
    await sleep(700); // статус пишется раньше освобождения слота (09 §4, 10.2)
    eds = await edgesOf(G);
    ok(cats.length === 4 && eds.length === 3, "граф от модели разобран: 4 категории, 3 связи", [cats.length, eds.length]);
    ok(cats[0].centrality === 0 && cats[1].certainty === 0, "центральность «0» и определённость «0» → в БД 0, а не 0.5", cats.map((c) => [c.centrality, c.certainty]));
    ok(eds[0].strength === 0, "сила связи «0» → в БД 0, а не 0.5", eds.map((e) => e.strength));
    ok(cats[2].centrality === 0.5 && cats[2].certainty === 0.5 && eds[2].strength === 0.5, "пустая ячейка и «—» → 0.5, как прежде", [cats[2].centrality, cats[2].certainty, eds[2].strength]);
    ok(Math.abs(cats[1].centrality - 0.8) < 1e-6 && Math.abs(eds[1].strength - 0.9) < 1e-6, "числа — как есть");
    const dto = (await A.api("GET", S(G, "/categories"))).json;
    ok(dto.categories.find((c) => c.name === "Логос").centrality === 0 && dto.edges.find((e) => e.description === "нулевая связь").strength === 0, "GET /categories отдаёт нули клиенту");
    // ноль, выставленный ползунком 5.4, переживает следующий разбор таблицы
    const p = await retry409(() => A.api("PATCH", S(G, `/categories/${cats[3].id}`), { certainty: 0 }));
    ok(p.status === 200 && p.json.category.certainty === 0, "PATCH категории «Явление»: определённость 0 (ползунок 5.4) → 200", p.json?.category ?? p.text.slice(0, 200));
    ok(/<td>Явление<\/td><td>феноменологическая<\/td><td>[^<]*<\/td><td>0\.4<\/td><td>0<\/td>/.test(await secHtml(G, "graph")), "… таблица раздела перерисована с «0»");
    const fileG = (await exportText(A, G, "html")).text;
    const imp = await importFile(A, fileG, "graph.html");
    const c2 = await catsOf(imp.id), e2 = await edgesOf(imp.id);
    ok(c2[0].centrality === 0 && c2[1].certainty === 0 && c2[3].certainty === 0 && e2[0].strength === 0 && c2[2].centrality === 0.5, "круг экспорт → импорт: нули остались нулями (прежде становились 0.5)", [c2.map((c) => [c.centrality, c.certainty]), e2.map((e) => e.strength)]);
  }

  // Палитра экспорта для этого графа — эталон цветов (graph-style ≡ клиенту, сторож 4ba)
  const style = gstyle.createGraphStyle(await gmodel.loadGModel(G));
  const typeHex = Object.fromEntries(TYPES.map((t) => [t, style.typeColorHex(t).toLowerCase()]));
  const edgeHex = Object.fromEntries(EDGES.map((e) => [e[1], style.edgeTypeStyle(e[3]).color.toLowerCase()]));

  console.log("\n■ R3/R4: браузер — граф на сборке клиента");
  let cliFills;
  {
    const page = await newPage(A, { gl: true });
    await page.goto(`${UI}/synthesis/${G}`, { waitUntil: "networkidle2" });
    await page.waitForSelector(".actions-bar", { timeout: 20000 });
    ok((await clickBtn(page, ".actions-bar", "Граф")) === "ok", "кнопка «◈ Граф»");
    await page.waitForSelector(".gm-overlay canvas", { timeout: 20000 });
    await sleep(1500);
    const ops3d = await lineOpacities(page);
    ok(J(ops3d) === J([0.3, 0.55, 0.75]), "3D: прозрачности линий связей — 0.3 (сила 0), 0.55 («—» = 0.5), 0.75 (0.9): связь силой 0 самая бледная", ops3d);
    ok((await clickBtn(page, ".gm-header", "2D")) === "ok", "переключение на 2D");
    await page.waitForSelector(".edge-line", { timeout: 15000 });
    await sleep(600);
    const g2 = await graph2d(page);
    const by = Object.fromEntries(g2.edges.map((e) => [e.desc, e]));
    const zero = by["нулевая связь"], strong = by["сильная связь"], dflt = by["связь без силы"];
    ok(g2.edges.length === 3 && zero.str === 0 && zero.w === 1 && Math.abs(zero.op - 0.25) < 1e-9, "2D: связь силой 0 — толщина 1, прозрачность 0.25 (прежде 2.25 и 0.525)", zero);
    ok(Math.abs(strong.w - 3.25) < 1e-9 && Math.abs(dflt.w - 2.25) < 1e-9 && zero.w < dflt.w && dflt.w < strong.w, "2D: связь силой 0 — самая тонкая (1 < 2.25 < 3.25)", g2.edges.map((e) => [e.desc, e.w]));
    ok(zero.dash === "3,3" && !strong.dash, "2D: слабая связь пунктиром, сильная сплошной", [zero.dash, strong.dash]);
    ok(J(g2.edges.map((e) => e.stroke.toLowerCase())) === J(EDGES.map((e) => edgeHex[e[1]])), "2D: цвета связей ≡ палитре экспорта", g2.edges.map((e) => e.stroke));
    const nb = Object.fromEntries(g2.nodes.map((n) => [n.name, n]));
    ok(nb["Логос"]?.cen === 0 && nb["Логос"].r === 6 && nb["Бытие"].cert === 0 && nb["Явление"].cert === 0, "2D: узел с центральностью 0 — наименьший (r = 6), определённость 0 дошла до графа", g2.nodes.map((n) => [n.name, n.cen, n.cert, n.r]));
    ok(await clickEdge(page, "нулевая связь"), "клик по связи силой 0");
    await sleep(400);
    let ps = await panelState(page);
    let m = ps?.metrics.find((x) => /сила связи/i.test(x.label));
    ok(!!m && m.value === "0.00" && m.bar === "0%", "EdgePanel: сила связи 0.00, полоса 0% (прежде 0.50 и 50%)", ps?.metrics);
    ok(await clickEdge(page, "связь без силы"), "клик по связи без силы");
    await sleep(400);
    ps = await panelState(page);
    m = ps?.metrics.find((x) => /сила связи/i.test(x.label));
    ok(!!m && m.value === "0.50" && m.bar === "50%", "EdgePanel: связь без значения — 0.50, как прежде", ps?.metrics);
    ok(await clickNode(page, "Логос"), "клик по узлу с центральностью 0");
    await sleep(400);
    ps = await panelState(page);
    // панель узла — та, чья первая метрика «Центральность» (у панели связи первой идёт «Сила связи»)
    const np = await page.evaluate(() => [...document.querySelectorAll(".gm-info-panel")].map((p) => [...p.querySelectorAll(".gm-panel-metric")].map((m) => ({ label: m.querySelector("span")?.textContent ?? "", value: m.querySelector("span:last-child")?.textContent ?? "", bar: m.querySelector(".gm-panel-bar div")?.style.width ?? "" }))).find((ms) => /центральность/i.test(ms[0]?.label ?? "")));
    ok(!!np && np[0].value === "0.00" && np[0].bar === "0%" && /определ/i.test(np[1].label) && np[1].value === "0.90", "NodePanel: центральность 0.00 с полосой 0%, определённость 0.90", np ?? ps?.metrics);

    // R4
    cliFills = Object.fromEntries(g2.nodes.map((n) => [n.type, n.fill]));
    ok(new Set(Object.values(cliFills)).size === 4 && Object.values(cliFills).every((f) => /^#[0-9a-f]{6}$/.test(f)), "R4 клиент 2D: четыре вложенных по названию типа — четыре разных цвета", cliFills);
    ok(J(cliFills) === J(typeHex), "R4 клиент 2D: цвета узлов ≡ палитре экспорта", [cliFills, typeHex]);
    const legend = await page.evaluate(() => [...document.querySelectorAll(".gm-legend-item")].map((it) => { const dot = it.querySelector(".gm-legend-dot"); return dot ? [it.textContent.trim().toLowerCase(), getComputedStyle(dot).backgroundColor] : null; }).filter(Boolean));
    const rgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
    const legendTypes = TYPES.map((t) => legend.find(([txt]) => txt.includes(t))?.[1]);
    ok(new Set(legendTypes).size === 4 && J(legendTypes) === J(TYPES.map((t) => rgb(typeHex[t]))), "R4 клиент: легенда — те же четыре разных цвета", legend);
    ok(page.errors.length === 0, "страница графа — без ошибок", page.errors);
    await page.close();
  }

  console.log("\n■ R3/R4: MMD и PNG");
  {
    const mmd = await exportText(A, G, "mmd");
    const widths = [...mmd.text.matchAll(/linkStyle (\d+) stroke:(#[0-9a-fA-F]{6}),stroke-width:([\d.]+)px([^\n]*)/g)].map((x) => ({ i: Number(x[1]), color: x[2].toLowerCase(), w: Number(x[3]), dash: x[4].includes("stroke-dasharray") }));
    ok(mmd.status === 200 && widths.length === 3 && widths[0].w === 1 && widths[0].dash && widths[1].w === 4.6 && widths[2].w === 3, "MMD: связь силой 0 — stroke-width 1.0px пунктиром (прежде 3.0px), 0.9 — 4.6px, «—» — 3.0px", widths);
    const classHex = [...mmd.text.matchAll(/classDef \S+ fill:(#[0-9a-fA-F]{6})/g)].map((x) => x[1].toLowerCase());
    ok(TYPES.every((t) => classHex.includes(typeHex[t])) && new Set(classHex).size >= 4, "R4 MMD: classDef — четыре разных цвета типов", classHex);

    const png = await retry409(() => A.raw(S(G, "/export/png")));
    ok(png.status === 200 && png.type.includes("image/png") && png.buf.subarray(1, 4).toString() === "PNG", "GET export/png → 200, image/png", [png.status, png.type]);
    const img = await cv.loadImage(png.buf);
    const c = cv.createCanvas(img.width, img.height);
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, 0);
    const data = cx.getImageData(0, 0, img.width, img.height).data;
    // Пиксель лежит на луче «фон → цвет типа»: узлы рисуются цветом типа с прозрачностью поверх #0a0a14
    const BG = [10, 10, 20];
    const rays = TYPES.map((t) => { const h = typeHex[t]; const col = [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)); const d = col.map((v, k) => v - BG[k]); return { t, d, n2: d[0] * d[0] + d[1] * d[1] + d[2] * d[2], hits: 0 }; });
    for (let i = 0; i < data.length; i += 4) {
      const p0 = data[i] - BG[0], p1 = data[i + 1] - BG[1], p2 = data[i + 2] - BG[2];
      if (p0 + p1 + p2 < 40) continue;
      for (const r of rays) {
        const tt = (p0 * r.d[0] + p1 * r.d[1] + p2 * r.d[2]) / r.n2;
        if (tt < 0.25 || tt > 1.05) continue;
        if (Math.abs(p0 - tt * r.d[0]) <= 3 && Math.abs(p1 - tt * r.d[1]) <= 3 && Math.abs(p2 - tt * r.d[2]) <= 3) { r.hits++; break; }
      }
    }
    ok(img.width === 2048 && rays.every((r) => r.hits >= 60), "R4 PNG: в картинке есть пиксели КАЖДОГО из четырёх цветов типов (при квирке все узлы были бы одного цвета)", rays.map((r) => [r.t, r.hits]));

    // Толщина линий PNG — по вызовам canvas самого экспортёра (раскладка случайна, пиксели не сравнить)
    const strokes = [];
    const proto = cv.CanvasRenderingContext2D.prototype;
    const origStroke = proto.stroke;
    proto.stroke = function (...a) { strokes.push({ color: String(this.strokeStyle).toLowerCase(), w: this.lineWidth, alpha: Math.round(this.globalAlpha * 100) / 100, dash: this.getLineDash().join(",") }); return origStroke.apply(this, a); };
    const fills = [];
    const origFill = proto.fill;
    proto.fill = function (...a) { fills.push({ color: String(this.fillStyle).toLowerCase(), alpha: Math.round(this.globalAlpha * 100) / 100 }); return origFill.apply(this, a); };
    let inProc;
    try { inProc = await pngx.exportPNG(G); } finally { proto.stroke = origStroke; proto.fill = origFill; }
    // заливка узла: цвет типа, прозрачность 0.25 + определённость × 0.6
    const NODE_ALPHA = { "логическая": 0.79, "онтологическая": 0.25, "эпистемологическая": 0.55, "феноменологическая": 0.25 };
    ok(TYPES.every((t) => fills.some((f) => f.color === typeHex[t] && f.alpha === NODE_ALPHA[t])), "R4 PNG: каждый узел залит цветом СВОЕГО типа; определённость 0 → заливка 0.25 (прежде 0.55)", TYPES.map((t) => [t, typeHex[t], fills.filter((f) => f.color === typeHex[t]).map((f) => f.alpha)]));
    const line = (desc) => strokes.find((s) => s.color === edgeHex[desc] && s.alpha !== 0.85);
    const z = line("нулевая связь"), s9 = line("сильная связь"), d5 = line("связь без силы");
    ok(inProc.length > 10000 && !!z && z.w === 1 && z.alpha === 0.3 && z.dash === "4,4", "PNG: связь силой 0 рисуется линией толщины 1, прозрачность 0.3, пунктир (прежде 2.5 и 0.55)", z ?? strokes.slice(0, 6));
    ok(!!s9 && !!d5 && Math.abs(s9.w - 3.7) < 1e-9 && d5.w === 2.5 && z.w < d5.w && d5.w < s9.w, "PNG: связь силой 0 — самая тонкая (1 < 2.5 < 3.7)", [z?.w, d5?.w, s9?.w]);
  }

  console.log("\n■ R3/R4: граф в экспортированном файле (встроенный просмотрщик)");
  {
    const fileG = (await exportText(A, G, "html")).text;
    ok(fileG.includes("/*Д-9*/") && fileG.includes("/*Д-10*/"), "выгрузка несёт надстройку просмотрщика");
    const page = await openFile(fileG, "graph.html");
    ok(await page.evaluate(() => typeof window.openGraph === "function" && typeof window.THREE === "object" && typeof window.d3 === "object"), "файл открыт: просмотрщик, three r128 и d3 7.8.5 (локальные копии) на месте");
    await page.evaluate(() => window.openGraph());
    await page.waitForSelector("#gmOverlay.visible canvas", { timeout: 20000 });
    await sleep(1500);
    const ops3d = await lineOpacities(page);
    ok(J(ops3d) === J([0.3, 0.55, 0.75]), "файл 3D: прозрачности линий связей 0.3 / 0.55 / 0.75 — связь силой 0 самая бледная", ops3d);
    await page.evaluate(() => window.switchView("2d"));
    await page.waitForSelector(".edge-line", { timeout: 15000 });
    await sleep(600);
    const g2 = await graph2d(page);
    const by = Object.fromEntries(g2.edges.map((e) => [e.desc, e]));
    ok(g2.edges.length === 3 && by["нулевая связь"].str === 0 && by["нулевая связь"].w === 1 && Math.abs(by["сильная связь"].w - 3.25) < 1e-9 && Math.abs(by["связь без силы"].w - 2.25) < 1e-9, "файл 2D: таблица разобрана с нулём, связь силой 0 — самая тонкая (1 < 2.25 < 3.25)", g2.edges.map((e) => [e.desc, e.str, e.w]));
    const nb = Object.fromEntries(g2.nodes.map((n) => [n.name, n]));
    ok(nb["Логос"]?.cen === 0 && nb["Бытие"].cert === 0 && nb["Явление"].cert === 0 && nb["Знание"].cen === 0.5, "файл 2D: центральность и определённость 0 разобраны как 0, пустая ячейка — 0.5", g2.nodes.map((n) => [n.name, n.cen, n.cert]));
    ok(await clickEdge(page, "нулевая связь"), "файл: клик по связи силой 0");
    await sleep(400);
    const ps = await panelState(page);
    const m = ps?.metrics.find((x) => /сила связи/i.test(x.label));
    ok(!!m && m.value === "0.00" && m.bar === "0%", "файл: панель связи — сила 0.00, полоса 0%", ps?.metrics);
    const fileFills = Object.fromEntries(g2.nodes.map((n) => [n.type, n.fill]));
    ok(new Set(Object.values(fileFills)).size === 4, "R4 файл: четыре типа — четыре разных цвета", fileFills);
    ok(J(fileFills) === J(cliFills), "R4 файл: цвета узлов просмотрщика ≡ клиенту", [fileFills, cliFills]);
    ok(J(g2.edges.map((e) => e.stroke.toLowerCase())) === J(EDGES.map((e) => edgeHex[e[1]])), "R4 файл: цвета связей ≡ клиенту и экспорту");
    ok(page.errors.length === 0, "файл: граф отработал без ошибок страницы", page.errors);
    await page.close();
  }

  /* ════ R5: Д-36/Д-37 ════ */
  console.log("\n■ R5: Д-36 — раскладка тезисов файла концепции");
  {
    let th = await thesesOf(L);
    const html0 = await secHtml(L, "theses");
    const nJust = count(html0, "<strong>Обоснование.</strong>");
    console.log(`    · тезисов ${th.length}: ${th.map((x) => x.label).join(", ")}; абзацев «Обоснование.» ${nJust}`);
    ok(th.length > 0 && nJust === th.length && th.every((x) => x.justification.length > 50), "theses.justification непуст у КАЖДОГО тезиса с абзацем «Обоснование.» (прежде — пуст у всех)", th.map((x) => [x.label, x.justification.length]));
    const dto = (await A.api("GET", S(L, "/theses"))).json.theses;
    ok(dto.length === th.length && dto.every((x) => x.justification), "GET /theses отдаёт обоснования редактору");

    // правка обоснования РЕДАКТОРОМ 5.2 в браузере (инлайн-✎ строки сводной таблицы)
    const ROW = 2, target = th[ROW];
    const NEW_J = `Обоснование, заменённое редактором 5.2 (${TAG}).`;
    const page = await newPage(A);
    await page.goto(`${UI}/synthesis/${L}`, { waitUntil: "networkidle2" });
    await page.waitForSelector(`button[data-edit-kind='thesis'][data-edit-row='${ROW}']`, { timeout: 20000 });
    await page.$eval(`button[data-edit-kind='thesis'][data-edit-row='${ROW}']`, (b) => b.click());
    await page.waitForSelector(".inline-edit-form #th-ed-just", { timeout: 10000 });
    const shown = await page.$eval("#th-ed-just", (el) => el.value);
    ok(shown === target.justification && shown.length > 50, `редактор 5.2 показывает обоснование тезиса ${target.label} (прежде поле было пустым)`, shown.slice(0, 80));
    await setTextarea(page, "#th-ed-just", NEW_J);
    ok((await clickBtn(page, ".inline-edit-form .inline-edit-actions", "Сохранить")) === "ok", "редактор 5.2: «Сохранить»");
    await page.waitForSelector(".inline-edit-form [data-element-impact]", { timeout: 15000 });
    const impact = await page.$eval(".inline-edit-form [data-element-impact]", (el) => ({ text: el.textContent, pending: !!el.querySelector("[data-testid='html-sync-pending']") }));
    ok(/отражено точечной правкой абзаца/i.test(impact.text) && !impact.pending, "редактор 5.2: «Отражено точечной правкой абзаца» — patched, не pending", impact.text.slice(0, 200));
    await page.close();
    const html1 = await secHtml(L, "theses");
    th = await thesesOf(L);
    ok(th[ROW].justification === NEW_J && count(html1, `<strong>Обоснование.</strong> ${NEW_J}</p>`) === 1, "абзац «Обоснование.» в прозе изменён, theses.justification обновлён", th[ROW].justification);
    const shape = (h) => [count(h, "<h5>"), count(h, "<li>"), count(h, "<strong>Обоснование.</strong>"), count(h, "<strong>Степень новизны:</strong>"), count(h, "<p>")];
    const firstStrongs = (h) => [...h.matchAll(/<\/h5>\s*<p><strong>([^<]+)<\/strong><\/p>/g)].map((x) => x[1]);
    ok(J(shape(html1)) === J(shape(html0)) && J(firstStrongs(html1)) === J(firstStrongs(html0)), "прочие абзацы блока целы: формулировки в прозе, «Ограничения…», списки, «Степень новизны» — на месте", [shape(html0), shape(html1)]);
    // раздел до и после равны побайтно, если вынуть сам абзац «Обоснование.» тезиса
    const holeAt = (h, n) => { let k = -1; return h.replace(/<p><strong>Обоснование\.<\/strong>[\s\S]*?<\/p>/g, (mm) => (++k === n ? "<p>◇</p>" : mm)); };
    // сводную таблицу редактор перерисовывает целиком из БД (5.1) — её сверяем по тексту ячеек.
    // Столбец «Тип» при этом переписывается канонической меткой у ВСЕХ строк («Этический /
    // аксиологический» → «этический») — поведение 5.1, долг Д-43; здесь не закрепляется
    const TABLE = /<table[\s\S]*?<\/table>/g;
    const TYPE_COL = 2;
    const cells = (h) => (h.match(TABLE) ?? []).flatMap((t) => [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<t[dh](?:\s[^>]*)?>([\s\S]*?)<\/t[dh]>/g)].map((x) => x[1].replace(/\s+/g, " ").trim()).filter((_, k) => k !== TYPE_COL)));
    const h0 = holeAt(html0, ROW).replace(TABLE, "<table/>"), h1 = holeAt(html1, ROW).replace(TABLE, "<table/>");
    let at = 0; while (at < h0.length && h0[at] === h1[at]) at++;
    ok(h0 === h1 && holeAt(html0, ROW) !== html0, "… изменён только свой абзац: вся проза раздела вне него побайтно прежняя", [at, h0.slice(at - 40, at + 80), h1.slice(at - 40, at + 80)]);
    ok(J(cells(html1)) === J(cells(html0)) && cells(html0).length === th.length + 1, "… сводная таблица перерисована с теми же ячейками (кроме столбца «Тип» — Д-43)", cells(html0).flat().map((c, k) => [c, cells(html1).flat()[k]]).filter(([x, y]) => x !== y).slice(0, 4));

    // правка абзаца «Обоснование.» в подразделе (9.2 → сведение 12.1 по метке)
    const eth = th.find((x) => /^Э-/.test(x.label ?? "")) ?? th[th.length - 1];
    const subName = "Эпистемологические тезисы";
    const src = (await A.api("GET", subUrl(L, "theses", subName))).json.html;
    const piece = eth.justification.slice(0, 60).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    ok(src.includes(piece), `исходник подраздела несёт обоснование тезиса ${eth.label}`, piece);
    const up = await retry409(() => A.api("PATCH", subUrl(L, "theses", subName), { html: src.replace(piece, "ИСПРАВЛЕНО В ПОДРАЗДЕЛЕ. " + piece) }));
    ok(up.status === 200 && up.json.changed && up.json.thesesUpdated?.length === 1 && up.json.thesesUpdated[0].label === eth.label && J(up.json.thesesUpdated[0].fields) === J(["justification"]) && up.json.warnings.length === 0, `правка абзаца «Обоснование.» в подразделе → сведено с тезисом ${eth.label}, без предупреждений`, up.json ? [up.json.thesesUpdated, up.json.warnings] : up.text.slice(0, 300));
    const after = (await thesesOf(L)).find((x) => x.id === eth.id);
    const vers = await sql`select change_source from element_versions where element_id=${eth.id} and element_type='thesis'`;
    ok(after.justification.startsWith("ИСПРАВЛЕНО В ПОДРАЗДЕЛЕ. ") && vers.some((v) => v.change_source === "manual"), "theses.justification обновлён, версия тезиса 'manual'", [after.justification.slice(0, 50), vers.map((v) => v.change_source)]);
    // правка формулировки редактором (HTTP): в свой абзац и в таблицу
    const o1 = th[0];
    const pf = await retry409(() => A.api("PATCH", S(L, `/theses/${o1.id}`), { formulation: "Формулировка, заменённая редактором (" + TAG + ")" }));
    const html2 = await secHtml(L, "theses");
    ok(pf.status === 200 && pf.json.htmlSync.patched.includes("thesis.formulation") && pf.json.htmlSync.pending.length === 0 && html2.includes(`<p><strong>Формулировка, заменённая редактором (${TAG})</strong></p>`) && html2.includes(`<td>Формулировка, заменённая редактором (${TAG})</td>`) && count(html2, "<strong>Обоснование.</strong>") === nJust, "правка формулировки → абзац формулировки и сводная таблица; обоснование не тронуто", pf.json?.htmlSync ?? pf.text.slice(0, 200));

    // одноабзацная раскладка — как прежде (документ G)
    const g = await thesesOf(G);
    ok(g.length === 2 && g[0].justification === OLD_J && g[0].label === null, "одноабзацная раскладка: обоснование разобрано как прежде", g.map((x) => x.justification));
    const pg = await retry409(() => A.api("PATCH", S(G, `/theses/${g[0].id}`), { justification: "Новое обоснование одной строкой." }));
    ok(pg.status === 200 && pg.json.htmlSync.patched.includes("thesis.justification") && (await secHtml(G, "theses")).includes("<p><strong>Бытие есть событие различия</strong> Новое обоснование одной строкой.</p>"), "одноабзацная раскладка: правка редактором переписывает абзац «формулировка + обоснование», как прежде", pg.json?.htmlSync);
  }

  console.log("\n■ R5: Д-37 — название без хвостовой ёлочки");
  {
    // при генерации: перегенерация раздела name, мок отдаёт «X»: подзаголовок
    mock.queue.push(nameHtml(4, `«Имя ${TAG}»: онтология паузы`));
    const rg = await retry409(() => A.api("POST", S(G, "/regenerate/name"), {}));
    let title = "";
    for (let i = 0; i < 150; i++) { title = (await sql`select title from syntheses where id=${G}`)[0].title; if (title.startsWith("Имя")) break; await sleep(200); }
    ok(rg.status === 200 && title === `Имя ${TAG}`, "генерация раздела name: «X»: подзаголовок → название «X» без ёлочки (прежде «X»»)", title);
    await sleep(700);
    // при ручной правке раздела name (12.1, Д-4) — тот же извлекатель
    const up = await retry409(() => A.api("PATCH", subUrl(G, "name", "Итоговая рекомендация"), { html: `<p><strong>«Второе имя ${TAG}»: иной подзаголовок</strong></p>` }));
    ok(up.status === 200 && up.json.titleUpdated === `Второе имя ${TAG}`, "правка раздела name: название обновлено без ёлочки", up.json ? [up.json.titleUpdated, up.json.warnings] : up.text.slice(0, 200));
    // при импорте: файл без встроенного состояния и с названием-заглушкой — имя концепции из раздела name
    const fileG = (await exportText(A, G, "html")).text;
    const bare = fileG.replace(/<script type="application\/json" id="philosynth-state">[\s\S]*?<\/script>/, "").replace(/<div class="doc-title">[^<]*<\/div>/, '<div class="doc-title">Синтез Философской Концепции</div>');
    const imp = await importFile(A, bare, "bare.html");
    const [row] = await sql`select title, file_genealogy fg from syntheses where id=${imp.id}`;
    ok(row.fg?.name === `Второе имя ${TAG}`, "импорт: имя концепции из раздела name (корень дерева файла) — без ёлочки", row.fg?.name ?? row);
  }
  console.log(`\nмок Claude: обращений ${mock.calls}, в очереди осталось ${mock.queue.length}`);
} catch (e) { failed++; console.log("СБОЙ:", e?.stack ?? e); }
finally {
  try { await Promise.race([browser?.close(), sleep(4000)]); } catch {}
  for (const id of ids) await sql`delete from syntheses where id=${id}`.catch(() => {});
  await sql`delete from api_usage where user_id in (select id from users where email like 't122-%@example.com')`.catch(() => {});
  await sql`delete from transactions where user_id in (select id from users where email like 't122-%@example.com')`.catch(() => {});
  await sql`delete from users where email like 't122-%@example.com'`.catch((e) => console.log("уборка users:", e?.code ?? e));
  for (const p of procs) { try { process.kill(-p.pid, "SIGKILL"); } catch {} }
  mockSrv.closeAllConnections?.(); mockSrv.close();
  try { rmSync(SCRATCH, { recursive: true, force: true }); } catch {}
  await Promise.race([sql.end({ timeout: 2 }), sleep(3000)]);
}
console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗`);
process.exit(failed ? 1 : 0);
