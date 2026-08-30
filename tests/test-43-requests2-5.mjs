/**
 * Беседа 4.3 — все тестовые запросы протокола (07, «Последующие
 * запросы») одним заходом, по команде пользователя.
 *
 * Харнесс — по образцу test-42: живой сервер (:3000) + PG/Redis + мок
 * Claude API (SSE) + puppeteer-core (Chromium /opt/pw-browsers).
 * Мок дополнен веткой ГЛОССАРИЯ (нужен S2-родителю: validate-
 * ConceptForMetaSynthesis требует sum/glossary/theses/critique +
 * graph|dialogue + capsule); специфичные маркеры pickHtml — ПЕРЕД
 * общим корнем /критическ/i (грабля моков 2.3/4.1, шапка 07).
 *
 *   R2 — тест 1 07 (roundtrip; он же перенесённый тест 4 беседы 4.2):
 *        мета-синтез S1 (родитель S2) → GET /export/html → POST
 *        /syntheses/import → сравнение: разделы на месте, categories/
 *        edges/clusters совпадают, theses/glossary восстановлены,
 *        genLog/ctxLog/genCommon восстановлены, lineage (философы +
 *        концепция-родитель S2), режим, параметры/secCtx/капсула;
 *        /logs/formatted работает на импортированных данных.
 *   R3 — тест 2 07: standalone-файл с нераспознанными метаданными →
 *        импорт с предупреждениями (method/depth/synthLevel), синтез
 *        создан, разделы на месте, значения по умолчанию подставлены.
 *   R4 — тест 3 07: обычный HTML (не PhiloSynth) → 400 IMPORT_INVALID.
 *   R5 — тест 4 07: файл без embedded state → импорт с предупреждением
 *        «Лог … отсутствует» (field='log'), логи пусты, параметры из
 *        шапки.
 *   R6 — браузерный сегмент (клиент этой беседы): ImportPage через vite
 *        + Chromium — выбор файла, «Подтвердить импорт», предупреждения/
 *        redirect на /synthesis/:id.
 *   R0 — санитария: без сессии → 401; без поля file → 400
 *        VALIDATION_ERROR.
 *
 * Запуск: node tests/test-43-requests2-5.mjs (корень репо; PG+Redis
 * подняты, миграции + 3 сида применены; npm i --no-save puppeteer-core
 * postgres).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";
import puppeteer from "puppeteer-core";

const SERVER_PORT = 3000;
const MOCK_PORT = 3993;
const VITE_PORT = 5199;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const DB_URL = "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const CHROME =
  process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const ROOT = new URL("..", import.meta.url).pathname;

let passed = 0;
let failed = 0;
const fails = [];
function ok(cond, name, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    fails.push(name);
    console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`);
  }
}

/* ════ Мок Claude API (SSE) — граф 8/3 + глоссарий ═══════════════════ */

function chunkify(s, n) {
  const out = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

const N43 = [
  "Опосредованная тотальность",
  "Трансцендентальное единство",
  "Диалектическое снятие",
  "Вещь в себе",
  "Историчность разума",
  "Категорический императив",
  "Автономия воли",
  "Синтетическое априори",
];
const TYPES43 = [
  "Онтологическая", "Эпистемологическая", "Онтологическая / Эпистемологическая",
  "Метафизическая", "Эпистемологическая", "Этическая", "Этическая", "Эпистемологическая",
];
const CLUSTERS43 = [
  "I — Основания / II — Развёртывание", "I — Основания", "I — Основания",
  "II — Развёртывание", "II — Развёртывание",
  "III — Практика", "III — Практика", "III — Практика",
];
const STRUCT43 = ["ядро", "генеративная", "мост", "центральная",
  "периферийная", "периферийная", "периферийная", "периферийная"];
const PROC43 = ["синтез", "тезис", "антитезис", "тезис",
  "антитезис", "тезис", "антитезис", "тезис"];
const EDGES43 = [
  [1, 0, "диалектическая", "порождает через снятие", "однонаправленная", "0.9"],
  [2, 0, "диалектическая", "снимает противоположность", "однонаправленная", "0.8"],
  [0, 3, "иерархическая", "подчиняет как момент", "однонаправленная", "0.7"],
  [3, 4, "противоречие", "напряжение конечного и исторического", "Двунаправленная", "0.6"],
  [4, 2, "корреляционная", "слабая связь эпох", "однонаправленная", "0.2"],
  [5, 6, "иерархическая / каузальная", "обосновывает", "Двунаправленная", "0.7"],
  [6, 6, "рефлексия", "самозаконодательство", "Рефлексивная", "0.5"],
  [7, 1, "основание", "фундирует единство", "однонаправленная", "0.8"],
  [5, 0, "часть-целое", "входит в тотальность", "однонаправленная", "0.6"],
  [7, 3, "аналогия", "структурное подобие", "однонаправленная", "0.4"],
];

function wrapSection(num, title, inner) {
  return `<div class="doc-section"><div class="section-num">§ ${num}</div>` +
    `<div class="section-title">${title}</div><div class="doc-content">${inner}</div></div>`;
}

function graphHtml43() {
  const nodeRows = N43.map((n, i) =>
    `<tr><td>${n}</td><td>${TYPES43[i]}</td>` +
    `<td>Определение категории «${n}» в синтезе.</td><td>0.${9 - (i % 5)}</td><td>0.${8 - (i % 4)}</td>` +
    `<td>${i % 2 ? "Гегель" : "Кант"}</td></tr>`).join("");
  const edgeRows = EDGES43.map(([s, t, type, desc, dir, str]) =>
    `<tr><td>${N43[s]}</td><td>${desc}</td><td>${N43[t]}</td>` +
    `<td>${type}</td><td>${dir}</td><td>${str}</td></tr>`).join("");
  const topo = N43.map((n, i) =>
    `<tr><td>${n}</td><td>${CLUSTERS43[i]}</td><td>${STRUCT43[i]}</td><td>${PROC43[i]}</td></tr>`).join("");
  return wrapSection(2, "Граф категорий",
    `<div data-section="Методология построения графа"><h4>Методология построения графа</h4><p>Граф построен диалектически.</p></div>` +
    `<div data-section="Таблица категорий"><h4>Таблица категорий</h4><table class="doc-table"><thead><tr><th>Категория</th><th>Тип</th><th>Определение</th><th>Центральность</th><th>Определённость</th><th>Происхождение</th></tr></thead><tbody>${nodeRows}</tbody></table></div>` +
    `<div data-section="Таблица связей"><h4>Таблица связей</h4><table class="doc-table"><thead><tr><th>Источник</th><th>Описание</th><th>Цель</th><th>Тип</th><th>Направленность</th><th>Сила</th></tr></thead><tbody>${edgeRows}</tbody></table></div>` +
    `<div data-section="Топология графа"><h4>Топология графа</h4><div data-section="Топологическая таблица"><table class="doc-table"><thead><tr><th>Категория</th><th>Кластер</th><th>Структурные роли</th><th>Процессуальные роли</th></tr></thead><tbody>${topo}</tbody></table></div></div>`);
}

function thesesHtml() {
  const rows = N43.slice(0, 6).map((n, i) =>
    `<tr><td>${i + 1}</td><td>Тезис о том, что ${n.toLowerCase()} образует ядро синтеза.</td>` +
    `<td>${["онтол.", "эпистем.", "этич."][i % 3]}</td><td>высокая</td><td>${n}, ${N43[(i + 1) % 8]}</td></tr>`).join("");
  return wrapSection(3, "Корпус тезисов",
    `<div data-section="Онтологические тезисы"><h4>Онтологические тезисы</h4><p><strong>Тезис о том, что ${N43[0].toLowerCase()} образует ядро синтеза.</strong> Обоснование.</p></div>` +
    `<div data-section="Сводная таблица тезисов"><h4>Сводная таблица тезисов</h4><table class="doc-table"><thead><tr><th>№</th><th>Формулировка тезиса</th><th>Тип</th><th>Степень новизны</th><th>Связанные категории</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

function glossaryHtml() {
  const rows = N43.slice(0, 5).map((n) =>
    `<tr><td>${n}</td><td>Принятое определение термина «${n}».</td><td>Кант/Гегель</td></tr>`).join("");
  return wrapSection(5, "Глоссарий терминов",
    `<div data-section="Таблица определений"><h4>Таблица определений</h4><table class="doc-table"><thead><tr><th>Термин</th><th>Принятое определение</th><th>Источник</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

function capsuleHtml43() {
  return wrapSection(9, "Капсула концепции",
    `<div data-section="Капсула концепции"><h4>Капсула концепции</h4><p>Капсула: опосредованная тотальность соединяет кантовскую архитектонику с гегелевским движением понятия.</p></div>`);
}

function critiqueHtml43() {
  const rows = N43.slice(0, 4).map((n, i) =>
    `<tr><td>${n}</td><td>Уязвимость №${i + 1}</td><td>${i % 2 ? "высокая" : "средняя"}</td></tr>`).join("");
  return wrapSection(4, "Критический анализ",
    `<div data-section="Имманентная критика"><h4>Имманентная критика</h4><p>Внутренние напряжения синтеза.</p></div>` +
    `<div data-section="Итоговая оценка"><h4>Итоговая оценка</h4><table class="doc-table"><thead><tr><th>Категория</th><th>Уязвимость</th><th>Серьёзность</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

function sumHtml() {
  return wrapSection(1, "Сводное резюме",
    `<div data-section="Цели и задачи"><h4>Цели и задачи</h4><p>Цель синтеза — соединить традиции.</p></div>` +
    `<div data-section="Точки напряжения"><h4>Точки напряжения</h4><p>Напряжение между конечностью рассудка и тотальностью духа.</p></div>` +
    `<div data-section="Методологическая рамка"><h4>Методологическая рамка</h4><p>Метод — диалектическое снятие.</p></div>`);
}

let modeCalls = 0;
function modeHtml(param) {
  const nonce = ++modeCalls;
  return `<div class="doc-content"><h4>Фундаментальное расхождение</h4>` +
    `<p>Контр-документ с позиции «${param}» (прогон ${nonce}).</p>` +
    `<h4>Итоговый вердикт</h4><p>Синтез не выдерживает критики с позиции «${param}».</p></div>`;
}

function pickHtml(prompt) {
  if (prompt.includes("философ-оппонент")) {
    const m = prompt.match(/позицию:\s*([^.\n]+)\./);
    return modeHtml(m ? m[1].trim() : "?");
  }
  const task = prompt.slice(Math.max(0, prompt.lastIndexOf("ЗАДАНИЕ")));
  if (/ТОЛЬКО секцию/.test(prompt)) return sumHtml();
  // Специфичные маркеры ПЕРЕД общим корнем «критическ» (грабля моков).
  // НОВАЯ ГРАБЛЯ (найдена R2): задание SUM перечисляет структуру документа
  // («…Критический анализ…») — sum обязан иметь СВОЙ маркер до критики,
  // иначе перехватывается (в 4.2 прошло незамеченным: содержимое sum там
  // не проверялось). Маркер — подраздел «Точки напряжения».
  if (task.includes("Таблица категорий")) return graphHtml43();
  if (task.includes("Таблица определений")) return glossaryHtml();
  if (task.includes("Точки напряжения")) return sumHtml();
  if (task.includes("Сводная таблица") && /тезис/i.test(task)) return thesesHtml();
  if (task.includes("«Капсула»")) return capsuleHtml43();
  if (/критическ/i.test(task)) return critiqueHtml43();
  return sumHtml();
}

function startMock() {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      let prompt = "";
      try {
        prompt = JSON.parse(body).messages?.[0]?.content ?? "";
      } catch { /* пустой промпт */ }
      const html = pickHtml(prompt);
      const chunks = chunkify(html, 400);
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      send({ type: "message_start", message: { usage: { input_tokens: Math.ceil(prompt.length / 4) } } });
      for (const chunk of chunks) {
        send({ type: "content_block_delta", delta: { type: "text_delta", text: chunk } });
        await sleep(3);
      }
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: Math.ceil(html.length / 4) } });
      send({ type: "message_stop" });
      res.end();
    });
  });
  return new Promise((resolve) => srv.listen(MOCK_PORT, "127.0.0.1", () => resolve(srv)));
}

/* ════ Сервер / vite / auth / WS (по test-42) ════════════════════════ */

let serverProc;
let serverLog = "";

async function startServer() {
  serverProc = spawn(process.execPath, ["--import", "tsx", "index.ts"], {
    cwd: path.join(ROOT, "server"),
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
      ANTHROPIC_API_KEY: "mock-key-ok",
      DATABASE_URL: DB_URL,
      REDIS_URL: "redis://localhost:6379",
      CLIENT_ORIGIN: `http://127.0.0.1:${VITE_PORT}`,
      RATE_LIMIT_HTTP_PER_MINUTE: "100000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProc.stdout.on("data", (d) => (serverLog += d));
  serverProc.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${API}/health`);
      if (r.ok) return;
    } catch { /* поднимается */ }
    await sleep(300);
  }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-2000));
}

let viteProc;
let viteLog = "";

async function startVite() {
  viteProc = spawn(
    path.join(ROOT, "node_modules/.bin/vite"),
    ["--port", String(VITE_PORT), "--strictPort", "--host", "127.0.0.1"],
    { cwd: path.join(ROOT, "client"), stdio: ["ignore", "pipe", "pipe"] },
  );
  viteProc.stdout.on("data", (d) => (viteLog += d));
  viteProc.stderr.on("data", (d) => (viteLog += d));
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${VITE_PORT}/`);
      if (r.ok) return;
    } catch { /* поднимается */ }
    await sleep(300);
  }
  throw new Error("vite не поднялся:\n" + viteLog.slice(-1500));
}

async function makeUser(tag) {
  const email = `t43-${tag}-${Date.now()}@test.local`;
  const password = "Passw0rd!123";
  let r = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error("register: " + (await r.text()));
  r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error("login: " + (await r.text()));
  const cookie = r.headers.get("set-cookie") ?? "";
  const m = cookie.match(/philosynth_session=([^;]+)/);
  if (!m) throw new Error("нет session-cookie: " + cookie);
  return { email, password, token: m[1], cookieHeader: `philosynth_session=${m[1]}` };
}

function wsConnect(token) {
  const url = `ws://127.0.0.1:${SERVER_PORT}/ws?token=${token}`;
  const ws = new WebSocket(url);
  const messages = [];
  const waiters = [];
  ws.addEventListener("message", (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    messages.push(msg);
    for (const w of [...waiters]) {
      if (w.pred(msg)) {
        waiters.splice(waiters.indexOf(w), 1);
        clearTimeout(w.t);
        w.resolve(msg);
      }
    }
  });
  const openP = new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", () => rej(new Error("ws error")), { once: true });
  });
  return {
    ws, messages,
    open: () => openP,
    close: () => ws.close(),
    waitFor(pred, timeoutMs, label) {
      const hit = messages.find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const t = setTimeout(
          () => reject(new Error(`timeout: ${label}; получено: ` + messages.map((m) => m.type).join(","))),
          timeoutMs,
        );
        waiters.push({ pred, resolve, t });
      });
    },
  };
}

async function api(auth, method, p, body) {
  const r = await fetch(`${API}${p}`, {
    method,
    headers: { "content-type": "application/json", ...(auth ? { cookie: auth.cookieHeader } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json = null;
  try { json = await r.json(); } catch { /* не-JSON */ }
  return { status: r.status, body: json };
}

async function apiRaw(auth, p) {
  const r = await fetch(`${API}${p}`, { headers: { cookie: auth.cookieHeader } });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, text: buf.toString("utf8") };
}

/** POST /syntheses/import — multipart c HTML-строкой как файлом */
async function importHtmlString(auth, html, filename) {
  const form = new FormData();
  form.append("file", new File([html], filename, { type: "text/html" }));
  const r = await fetch(`${API}/syntheses/import`, {
    method: "POST",
    headers: { cookie: auth.cookieHeader },
    body: form,
  });
  let json = null;
  try { json = await r.json(); } catch { /* не-JSON */ }
  return { status: r.status, body: json };
}

async function makeSynthesis(auth, conn, sectionsArg, tag, participants) {
  const p = await api(auth, "POST", "/syntheses", {
    seed: `Импортный синтез ${tag}`,
    philosophers: ["Кант", "Гегель"],
    sections: sectionsArg,
    method: "dialectical", depth: "overview", synthLevel: "comparative",
    context: "Общий контекст пользователя",
    sectionContexts: { graph: "Секционный контекст графа" },
    ...(participants ? { participants } : {}),
  });
  if (p.status !== 201 || !p.body?.id) {
    throw new Error(`POST ${tag}: ${p.status} ${JSON.stringify(p.body)}`);
  }
  const id = p.body.id;
  await conn.waitFor(
    (m) => m.type === "generation_complete" && m.synthesisId === id,
    180_000, `complete ${tag}`,
  );
  return id;
}

const sql = postgres(DB_URL);
const sortBy = (arr, f) => [...arr].sort((a, b) => (f(a) < f(b) ? -1 : 1));

/* ════════════════════════════════════════════════════════════════════ */

let mockSrv, browser;

try {
  mockSrv = await startMock();
  await startServer();
  console.log("Мок и сервер подняты.");

  const A = await makeUser("owner");
  const cA = wsConnect(A.token);
  await cA.open();

  /* ── Подготовка: S2 (родитель, пригоден для мета-синтеза), S1 (мета) ── */
  console.log("\n■ Подготовка: S2 (родитель) и мета-синтез S1 (граф 8/3 + режим)");
  const S2 = await makeSynthesis(A, cA, ["capsule", "glossary", "theses", "critique", "graph"], "S2");
  const S1 = await makeSynthesis(
    A, cA, ["capsule", "glossary", "theses", "critique", "graph"], "S1",
    [{ type: "synthesis", synthesisId: S2 }],
  );
  // Режим — для восстановления mode_results при импорте
  const run = await api(A, "POST", `/syntheses/${S1}/modes/adversarial/run`, { param: "Ницше" });
  ok(run.status === 200 || run.status === 202, "режим adversarial «Ницше» запущен", `status=${run.status}`);
  let modeReady = false;
  for (let i = 0; i < 100; i++) {
    const m = await api(A, "GET", `/syntheses/${S1}/modes/adversarial`);
    if ((m.body?.results?.length ?? 0) >= 1 && m.body.results[0].htmlContent) { modeReady = true; break; }
    await sleep(500);
  }
  ok(modeReady, "результат режима готов");
  cA.close();

  /* ════ R0: санитария ════ */
  console.log("\n■ R0: санитария POST /syntheses/import");
  {
    const form = new FormData();
    form.append("file", new File(["<html></html>"], "x.html", { type: "text/html" }));
    const r401 = await fetch(`${API}/syntheses/import`, { method: "POST", body: form });
    ok(r401.status === 401, "без сессии → 401", `status=${r401.status}`);
    const rNoFile = await fetch(`${API}/syntheses/import`, {
      method: "POST",
      headers: { cookie: A.cookieHeader },
      body: new FormData(),
    });
    ok(rNoFile.status === 400, "без поля file → 400", `status=${rNoFile.status}`);
    const bNoFile = await rNoFile.json().catch(() => null);
    ok(bNoFile?.code === "VALIDATION_ERROR", "код VALIDATION_ERROR", JSON.stringify(bNoFile));
  }

  /* ════ R2 (тест 1 07): roundtrip export → import ════ */
  console.log("\n■ R2 (тест 1): roundtrip exportHTML → POST /syntheses/import");
  const exp = await apiRaw(A, `/syntheses/${S1}/export/html`);
  ok(exp.status === 200 && exp.text.includes("philosynth-state"),
    "GET /export/html → 200 c embedded state", `status=${exp.status}`);
  fs.writeFileSync("/tmp/export-43.html", exp.text);

  const imp = await importHtmlString(A, exp.text, "export-43.html");
  ok(imp.status === 200 && typeof imp.body?.id === "string",
    "POST /import → 200 { id }", `${imp.status} ${JSON.stringify(imp.body).slice(0, 300)}`);
  const S1i = imp.body.id;
  ok(S1i !== S1, "создан НОВЫЙ синтез (id отличается)");
  ok(Array.isArray(imp.body.warnings), "warnings — массив");
  ok(!imp.body.warnings.some((w) => w.critical),
    "критических предупреждений нет", JSON.stringify(imp.body.warnings));

  // Оригинал и импорт из БД
  const [o] = await sql`SELECT * FROM syntheses WHERE id = ${S1}`;
  const [n] = await sql`SELECT * FROM syntheses WHERE id = ${S1i}`;
  ok(!!n && n.status === "ready", "импортированный синтез status='ready'");
  ok(n.title === o.title, "заголовок восстановлен", `${n?.title} ≠ ${o.title}`);
  ok(n.method === "dialectical" && n.synth_level === "comparative" && n.depth === "overview",
    "method/synthLevel/depth восстановлены из params");
  ok(n.seed === o.seed && n.context === o.context, "seed и общий контекст восстановлены");
  ok(n.doc_num === o.doc_num, "docNum сохранён (не перегенерирован)", `${n?.doc_num} ≠ ${o.doc_num}`);
  ok(n.parent_context_schema === "selective-v1",
    "parentContextSchema='selective-v1' (из embedded state)", n?.parent_context_schema);
  ok(JSON.stringify(n.section_order) === JSON.stringify(o.section_order),
    "sectionOrder совпадает", `${JSON.stringify(n?.section_order)}`);
  ok(n.version_base === o.version_base && n.version_modes === o.version_modes,
    "docVersion восстановлен");
  ok(n.capsule_html.includes("опосредованная тотальность"),
    "капсула восстановлена (текст из шапки)");
  ok(n.total_input_tokens > 0 && Number(n.total_cost_usd) >= 0,
    "тоталы футера пересчитаны из genLog", `inT=${n?.total_input_tokens}`);

  // Разделы на месте. КВИРК КАПСУЛЫ (паритет исходника): экспорт не пишет
  // капсулу в тело (живёт в шапке) → у импорта нет sections-row 'capsule';
  // капсула восстановлена в capsule_html, ключ 'capsule' — в sectionOrder.
  const oSecs = await sql`SELECT key, section_num, title, html_content, sec_context, is_edited FROM sections WHERE synthesis_id = ${S1} AND key <> 'capsule' ORDER BY section_num`;
  const nSecs = await sql`SELECT key, section_num, title, html_content, sec_context, is_edited FROM sections WHERE synthesis_id = ${S1i} ORDER BY section_num`;
  ok(nSecs.length === oSecs.length && nSecs.map((s) => s.key).sort().join() === oSecs.map((s) => s.key).sort().join(),
    `все разделы тела на месте (${oSecs.length}): ${nSecs.map((s) => s.key).join(",")}`);
  ok(n.section_order.includes("capsule") && n.capsule_html.length > 0,
    "квирк капсулы: 'capsule' в sectionOrder, тело — в capsule_html (row нет)");
  ok(nSecs.every((s) => s.html_content.includes('class="doc-section"')
      && s.html_content.includes("section-title")),
    "html_content разделов несёт штатный каркас");
  ok(!nSecs.some((s) => s.html_content.includes('id="sec-')
      || s.html_content.includes("Граф категорий</button>")),
    "обвязка экспорта (якоря/кнопки) в html_content не попала");
  const nGraphSec = nSecs.find((s) => s.key === "graph");
  ok(nGraphSec?.sec_context === "Секционный контекст графа",
    "secCtx раздела graph восстановлен из embedded params", nGraphSec?.sec_context);

  // Категории/рёбра/кластеры совпадают
  const oCats = await sql`SELECT name, type, definition, centrality, certainty, origin, cluster_indices, structural_roles, procedural_roles, has_reflexive FROM categories WHERE synthesis_id = ${S1}`;
  const nCats = await sql`SELECT name, type, definition, centrality, certainty, origin, cluster_indices, structural_roles, procedural_roles, has_reflexive FROM categories WHERE synthesis_id = ${S1i}`;
  ok(nCats.length === 8 && oCats.length === 8, "категорий 8 и там, и там",
    `o=${oCats.length} n=${nCats.length}`);
  ok(JSON.stringify(sortBy(nCats, (c) => c.name)) === JSON.stringify(sortBy(oCats, (c) => c.name)),
    "categories совпадают полностью (имя/тип/центральность/топология)");
  const oEdges = await sql`
    SELECT cs.name AS src, ct.name AS tgt, e.edge_type, e.direction, e.strength, e.description
    FROM category_edges e
    JOIN categories cs ON cs.id = e.source_id
    JOIN categories ct ON ct.id = e.target_id
    WHERE e.synthesis_id = ${S1}`;
  const nEdges = await sql`
    SELECT cs.name AS src, ct.name AS tgt, e.edge_type, e.direction, e.strength, e.description
    FROM category_edges e
    JOIN categories cs ON cs.id = e.source_id
    JOIN categories ct ON ct.id = e.target_id
    WHERE e.synthesis_id = ${S1i}`;
  const edgeKey = (e) => `${e.src}→${e.tgt}|${e.edge_type}|${e.direction}|${e.strength}`;
  ok(nEdges.length === oEdges.length
      && JSON.stringify(sortBy(nEdges, edgeKey).map(edgeKey)) === JSON.stringify(sortBy(oEdges, edgeKey).map(edgeKey)),
    `рёбра совпадают (${oEdges.length})`, `n=${nEdges.length}`);
  const oCl = await sql`SELECT cluster_index, label FROM cluster_labels WHERE synthesis_id = ${S1} ORDER BY cluster_index`;
  const nCl = await sql`SELECT cluster_index, label FROM cluster_labels WHERE synthesis_id = ${S1i} ORDER BY cluster_index`;
  ok(JSON.stringify(nCl) === JSON.stringify(oCl), "cluster_labels совпадают (3 кластера)",
    JSON.stringify(nCl));

  // Тезисы и глоссарий
  const oTh = await sql`SELECT thesis_num, formulation, related_categories FROM theses WHERE synthesis_id = ${S1} ORDER BY thesis_num`;
  const nTh = await sql`SELECT thesis_num, formulation, related_categories FROM theses WHERE synthesis_id = ${S1i} ORDER BY thesis_num`;
  ok(oTh.length > 0 && JSON.stringify(nTh) === JSON.stringify(oTh),
    `theses восстановлены (${oTh.length})`, `n=${nTh.length}`);
  const oGl = await sql`SELECT term, definition FROM glossary_terms WHERE synthesis_id = ${S1} ORDER BY position`;
  const nGl = await sql`SELECT term, definition FROM glossary_terms WHERE synthesis_id = ${S1i} ORDER BY position`;
  ok(oGl.length > 0 && JSON.stringify(nGl) === JSON.stringify(oGl),
    `glossary_terms восстановлены (${oGl.length})`, `n=${nGl.length}`);

  // genLog / ctxLog / genCommon
  const oGen = await sql`SELECT section_key, log_type, source, status, input_tokens, output_tokens, cost_usd FROM generation_log WHERE synthesis_id = ${S1} AND section_key <> '_genCommon' ORDER BY created_at`;
  const nGen = await sql`SELECT section_key, log_type, source, status, input_tokens, output_tokens, cost_usd FROM generation_log WHERE synthesis_id = ${S1i} AND section_key <> '_genCommon' ORDER BY created_at`;
  ok(nGen.length === oGen.length, `genLog восстановлен: ${oGen.length} записей`, `n=${nGen.length}`);
  ok(JSON.stringify(nGen.map((g) => `${g.section_key}|${g.source}|${g.input_tokens}|${g.cost_usd}`))
      === JSON.stringify(oGen.map((g) => `${g.section_key}|${g.source}|${g.input_tokens}|${g.cost_usd}`)),
    "порядок и поля записей genLog совпадают");
  const [nCommon] = await sql`SELECT metadata, status FROM generation_log WHERE synthesis_id = ${S1i} AND section_key = '_genCommon'`;
  ok(!!nCommon && nCommon.status === "common" && nCommon.metadata?.genCommon,
    "служебная строка _genCommon восстановлена (status='common')");
  const oCtx = await sql`SELECT section_key, budget, total_used, req_found, req_total, budget_mode FROM context_log WHERE synthesis_id = ${S1} ORDER BY created_at`;
  const nCtx = await sql`SELECT section_key, budget, total_used, req_found, req_total, budget_mode FROM context_log WHERE synthesis_id = ${S1i} ORDER BY created_at`;
  ok(nCtx.length === oCtx.length
      && JSON.stringify(nCtx) === JSON.stringify(oCtx),
    `ctxLog восстановлен (${oCtx.length})`, `n=${nCtx.length}`);

  // Lineage: философы + концепция-родитель S2
  const nLin = await sql`SELECT parent_type, parent_name, parent_synthesis_id, position FROM synthesis_lineage WHERE synthesis_id = ${S1i} ORDER BY position`;
  ok(nLin.filter((l) => l.parent_type === "philosopher").map((l) => l.parent_name).join(",") === "Кант,Гегель",
    "lineage: философы Кант, Гегель", JSON.stringify(nLin));
  ok(nLin.some((l) => l.parent_type === "synthesis" && l.parent_synthesis_id === S2),
    "lineage: концепция-родитель S2 восстановлена по synthesisId");

  // Режим
  const nModes = await sql`SELECT mode_key, param_value, html_content FROM mode_results WHERE synthesis_id = ${S1i}`;
  ok(nModes.length === 1 && nModes[0].mode_key === "adversarial" && nModes[0].param_value === "Ницше"
      && nModes[0].html_content.includes("Фундаментальное расхождение"),
    "mode_results восстановлен из .philosynth-mode");

  // Совместимость с потребителями: /logs/formatted и GET /:id на импорте
  const lf = await api(A, "GET", `/syntheses/${S1i}/logs/formatted`);
  ok(lf.status === 200 && typeof lf.body?.text === "string" && lf.body.text.length > 100,
    "GET /logs/formatted работает на импортированных логах");
  const gf = await api(A, "GET", `/syntheses/${S1i}`);
  ok(gf.status === 200 && gf.body?.synthesis?.philosophers?.join(",") === "Кант,Гегель"
      && gf.body.synthesis.parentSyntheses?.some((p) => p.id === S2),
    "GET /syntheses/:id: философы и родитель S2 в связях");

  /* ════ R3 (тест 2 07): standalone-файл с предупреждениями ════ */
  console.log("\n■ R3 (тест 2): standalone-файл, метод не распознан → предупреждения");
  const standalone = `<!DOCTYPE html><html><body><div id="docOutput">
    <div id="docTitle">Квантовая диалектика</div>
    <div id="docSubtitle">На основе: Кант</div>
    <span id="docNum">PS-7777-QQQQ</span>
    <span id="docMethod">Квантовый</span>
    <span id="docDepth">Стандартная</span>
    <span id="docSynthLevel">Сравнительный</span>
    <div id="docHeaderExtras">
      <details class="header-disclosure"><summary>Зерно концепции</summary><div class="disclosure-body">квантовое зерно</div></details>
    </div>
    <div id="docBodies">
      <div class="doc-body">${sumHtml()}</div>
      <div class="doc-body">${thesesHtml()}</div>
    </div>
    <span id="footerPhil">Кант</span>
  </div>
  <script type="application/json" id="philosynth-state">${JSON.stringify({
    version: 2,
    genLog: [{ sectionKey: "sum", sectionLabel: "Резюме", status: "done", source: "initial", inputTokens: 10, outputTokens: 20, cost: 0.001, secCtxPreview: "x" },
             { type: "version-marker", version: "v2", timestamp: "2026-08-01T10:00:00Z" }],
    ctxLog: [], genCommon: { sysChars: 100 },
    sectionOrder: ["sum", "theses"],
    docVersion: 2,
    participants: [{ type: "philosopher", name: "Кант" }],
    genealogy: null,
  })}</script></body></html>`;
  const r3 = await importHtmlString(A, standalone, "standalone.html");
  ok(r3.status === 200 && r3.body?.id, "standalone-файл импортирован", `${r3.status}`);
  ok(r3.body.warnings.some((w) => w.field === "method" && w.message.includes("Квантовый")),
    "предупреждение: метод не распознан («Квантовый»)", JSON.stringify(r3.body?.warnings));
  const [r3row] = await sql`SELECT method, seed, doc_num, version_base FROM syntheses WHERE id = ${r3.body.id}`;
  ok(r3row.method === "dialectical", "подставлен метод по умолчанию (dialectical)");
  ok(r3row.seed === "квантовое зерно" && r3row.doc_num === "PS-7777-QQQQ",
    "seed из disclosure, docNum из шапки");
  ok(r3row.version_base === 2, "docVersion-число legacy распознан (base=2)");
  const r3secs = await sql`SELECT key FROM sections WHERE synthesis_id = ${r3.body.id} ORDER BY section_num`;
  ok(r3secs.map((s) => s.key).join(",") === "sum,theses", "разделы на месте: sum,theses");
  const r3gen = await sql`SELECT section_key, log_type, cost_usd FROM generation_log WHERE synthesis_id = ${r3.body.id} AND section_key <> '_genCommon' ORDER BY created_at`;
  ok(r3gen.length === 2 && r3gen[0].section_key === "sum" && Number(r3gen[0].cost_usd) === 0.001,
    "legacy genLog: поле cost → cost_usd", JSON.stringify(r3gen));
  ok(r3gen[1].log_type === "version_marker",
    "legacy маркер 'version-marker' → 'version_marker'", r3gen[1]?.log_type);

  /* ════ R4 (тест 3 07): невалидный файл → IMPORT_INVALID ════ */
  console.log("\n■ R4 (тест 3): обычный HTML → 400 IMPORT_INVALID");
  {
    const r = await importHtmlString(A, "<!DOCTYPE html><html><body><h1>Просто страница</h1></body></html>", "plain.html");
    ok(r.status === 400 && r.body?.code === "IMPORT_INVALID",
      "не-PhiloSynth → 400 IMPORT_INVALID", `${r.status} ${JSON.stringify(r.body)}`);
    ok(String(r.body?.error).includes("#docOutput"), "текст ошибки исходника (#docOutput)");
    // docOutput есть, но ни одного .doc-section
    const r2 = await importHtmlString(A, `<html><body><div id="docOutput"><p>пусто</p></div></body></html>`, "empty.html");
    ok(r2.status === 400 && r2.body?.code === "IMPORT_INVALID",
      "docOutput без разделов → 400 IMPORT_INVALID", `${r2.status}`);
    ok(String(r2.body?.error).includes("ни одного раздела"), "текст «ни одного раздела»");
  }

  /* ════ R5 (тест 4 07): файл без embedded state ════ */
  console.log("\n■ R5 (тест 4): без embedded state → предупреждение «Лог отсутствует»");
  const noState = `<!DOCTYPE html><html><body><div id="docOutput">
    <div id="docTitle">Синтез без лога</div>
    <span id="docMethod">Диалектический</span><span id="docDepth">Глубокая</span><span id="docSynthLevel">Порождающий</span>
    <div id="docBodies">
      <div class="doc-body">${sumHtml()}</div>
      <div class="doc-body">${graphHtml43()}</div>
    </div>
    <span id="footerPhil">Кант, Гегель</span>
  </div></body></html>`;
  const r5 = await importHtmlString(A, noState, "no-state.html");
  ok(r5.status === 200 && r5.body?.id, "файл без state импортирован", `${r5.status}`);
  ok(r5.body.warnings.some((w) => w.field === "log" && w.message.includes("отсутствует")),
    "предупреждение «Лог … отсутствует»", JSON.stringify(r5.body?.warnings));
  const r5gen = await sql`SELECT count(*)::int AS c FROM generation_log WHERE synthesis_id = ${r5.body.id}`;
  const r5ctx = await sql`SELECT count(*)::int AS c FROM context_log WHERE synthesis_id = ${r5.body.id}`;
  ok(r5gen[0].c === 0 && r5ctx[0].c === 0, "логи пусты (накопятся заново)");
  const [r5row] = await sql`SELECT method, depth, synth_level, section_order FROM syntheses WHERE id = ${r5.body.id}`;
  ok(r5row.method === "dialectical" && r5row.depth === "deep" && r5row.synth_level === "generative",
    "параметры из шапки (без params)");
  ok(JSON.stringify(r5row.section_order) === JSON.stringify(["sum", "graph"]),
    "sectionOrder реконструирован из разделов", JSON.stringify(r5row.section_order));
  const r5cats = await sql`SELECT count(*)::int AS c FROM categories WHERE synthesis_id = ${r5.body.id}`;
  ok(r5cats[0].c === 8, "граф распарсен и без embedded state (8 категорий)");

  /* ════ R6: браузерный сегмент — ImportPage ════ */
  console.log("\n■ R6: ImportPage в браузере (vite + Chromium)");
  await startVite();
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    // Сессия: кука на origin vite (прокси /api сохраняет домен)
    await page.goto(`http://127.0.0.1:${VITE_PORT}/login`, { waitUntil: "networkidle2" });
    await page.setCookie({
      name: "philosynth_session", value: A.token,
      url: `http://127.0.0.1:${VITE_PORT}`,
    });
    await page.goto(`http://127.0.0.1:${VITE_PORT}/import`, { waitUntil: "networkidle2" });
    ok(await page.$('input[type="file"]') !== null, "ImportPage: input файла присутствует");
    const dropZone = await page.$('[aria-label="Зона загрузки файла"]');
    ok(dropZone !== null, "drag&drop зона отрисована");

    // Невалидное расширение
    const badPath = "/tmp/plain-43.txt";
    fs.writeFileSync(badPath, "не html");
    const inputEl = await page.$('input[type="file"]');
    await inputEl.uploadFile(badPath);
    let badRejected = true;
    try {
      await page.waitForFunction(
        () => document.body.innerText.includes("Ожидается HTML-файл"),
        { timeout: 4000 },
      );
    } catch { badRejected = false; }
    ok(badRejected, "не-HTML файл отклонён на клиенте");

    // Настоящий файл экспорта → подтверждение → redirect
    await inputEl.uploadFile("/tmp/export-43.html");
    await page.waitForFunction(
      () => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Подтвердить импорт")),
      { timeout: 5000 },
    );
    ok(true, "выбран файл: кнопки «Подтвердить импорт»/«Отмена» показаны");
    await page.evaluate(() => {
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent.includes("Подтвердить импорт")).click();
    });
    // Либо мгновенный redirect (нет предупреждений), либо экран warnings
    await page.waitForFunction(
      () => window.location.pathname.startsWith("/synthesis/")
        || document.body.innerText.includes("Импорт завершён"),
      { timeout: 30_000 },
    );
    if (!(await page.evaluate(() => window.location.pathname.startsWith("/synthesis/")))) {
      ok(await page.evaluate(() => document.body.innerText.includes("⚡") || document.body.innerText.includes("⚠")),
        "экран предупреждений отображён");
      await page.evaluate(() => {
        [...document.querySelectorAll("button")]
          .find((b) => b.textContent.includes("Перейти к синтезу")).click();
      });
      await page.waitForFunction(
        () => window.location.pathname.startsWith("/synthesis/"),
        { timeout: 10_000 },
      );
    }
    const url = await page.evaluate(() => window.location.pathname);
    ok(/^\/synthesis\/[0-9a-f-]{36}$/.test(url), "redirect на /synthesis/:id", url);
    // Импортированный документ отрисовался
    await page.waitForFunction(
      () => document.body.innerText.includes("Сводное резюме")
        || document.body.innerText.includes("Граф категорий")
        || document.body.innerText.includes("Импортный синтез"),
      { timeout: 15_000 },
    );
    ok(true, "SynthesisPage показывает импортированный документ");
    await page.close();
  }
} catch (err) {
  failed++;
  fails.push("НЕОЖИДАННОЕ ИСКЛЮЧЕНИЕ");
  console.error("\n✗ НЕОЖИДАННОЕ ИСКЛЮЧЕНИЕ:", err);
  console.error("Хвост лога сервера:\n" + serverLog.slice(-1500));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (viteProc) viteProc.kill("SIGTERM");
  if (serverProc) serverProc.kill("SIGTERM");
  if (mockSrv) mockSrv.close();
  await sql.end({ timeout: 3 }).catch(() => {});
}

console.log(`\n══ Итог: ${passed} ✓, ${failed} ✗${fails.length ? " — " + fails.join("; ") : ""}`);
process.exit(failed ? 1 : 0);
