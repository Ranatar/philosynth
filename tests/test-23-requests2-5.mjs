/**
 * Беседа 2.3 — тестовые запросы 2–5 протокола (07, «Последующие
 * запросы») одним заходом, по команде пользователя.
 *
 * Харнесс: живой сервер (:3000 — vite-прокси захардкожен, грабля 1.6b) +
 * vite dev :5199 + PG/Redis + мок Claude API (SSE, контент по test-22) +
 * puppeteer-core с системным Chrome /opt/google/chrome/chrome.
 *
 *   R0 — API-санитария новых эндпоинтов 2.3 (превью каскада,
 *        превью подраздела, PATCH extGraphMetrics) — быстрая проверка
 *        транспорта до браузера; списки из ответов переиспользуются
 *        как ЭТАЛОН для браузерных сверок (не хардкодим конфиги).
 *   R2 — поток: открыть EditModal → отметить graph → CascadePanel
 *        показывает downstream → «отметить ↑» → чекбокс theses
 *        выставлен, пункт covered → ▶ активна.
 *        АДАПТАЦИЯ против буквы 07 («кнопка ▶ активируется» после
 *        «отметить ↑»): в реализации ▶ активна с ПЕРВОГО выбранного
 *        действия (паритет updateEditPlanUI исходника — пуск не ждёт
 *        покрытия каскада); тест сверяет: ▶ заблокирована при пустом
 *        плане и активна после отметки graph.
 *   R3 — исполнение: покрыть весь каскад → «▶ Составить план»
 *        (draft, шаги ●, стоимость в футере) → «▶ Исполнить» →
 *        live-прогресс → по завершении все шаги ✓, статус done,
 *        graph в БД перегенерирован. (Двухшаговость — одобренная
 *        адаптация workflow §4.5 вместо цепочки confirm().)
 *   R4 — подраздельная: карточка graph → «⟳ Таблица категорий» →
 *        панель показывает intra-зависимые (эталон R0), оценку «≈ $»;
 *        запуск с каскадом 1 зависимого → ОЧЕРЕДЬ последовательных
 *        POST по section_done → «✓ Готово», version_sub в БД +2.
 *   R5 — responsive: viewport 375×812 → .edit-modal на весь экран,
 *        overlay без отступов.
 *
 * Запуск: node tests/test-23-requests2-5.mjs (корень репо; PG+Redis
 * подняты, миграции+3 сида применены).
 */
import { spawn } from "node:child_process";
import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";
import puppeteer from "puppeteer-core";

const SERVER_PORT = 3000; // vite proxy → :3000
const VITE_PORT = 5199;
const MOCK_PORT = 3993;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const UI = `http://127.0.0.1:${VITE_PORT}`;
const DB_URL = "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const CHROME = "/opt/google/chrome/chrome";

const KEY_LABELS = {
  sum: "Исполнительное резюме", graph: "Граф категорий",
  glossary: "Глоссарий терминов", theses: "Корпус тезисов",
  name: "Анализ названия", history: "Историческая контекстуализация",
  origin: "Анализ происхождения", practical: "Практическое применение",
  dialogue: "Диалог между традициями", evolution: "Эволюция и перспективы",
  critique: "Критический анализ", capsule: "Капсула концепции",
};

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

/* ════ Мок Claude API (контент — по test-22) ═════════════════════════ */

const mockStats = { totalCalls: 0 };

function chunkify(s, n) {
  const out = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

const NODE_NAMES = [
  "Трансцендентальное единство", "Диалектическое снятие", "Категорический императив",
  "Абсолютный дух", "Вещь в себе", "Историчность разума",
  "Синтетическое априори", "Опосредование", "Автономия воли", "Тотальность",
];

function edgesTableHtml(nonce) {
  const edges = [];
  for (let i = 0; i < 18; i++) {
    const a = NODE_NAMES[i % 10], b = NODE_NAMES[(i + 3) % 10];
    edges.push(`<tr><td>${a}</td><td>обусловливает через опосредование (v${nonce})</td><td>${b}</td>` +
      `<td>диалектическая</td><td>${i % 5 === 0 ? "Двунаправленная" : "однонаправленная"}</td><td>0.${5 + (i % 5)}</td></tr>`);
  }
  return `<table class="doc-table"><thead><tr><th>Источник</th><th>Описание</th><th>Цель</th><th>Тип</th><th>Направленность</th><th>Сила</th></tr></thead><tbody>${edges.join("")}</tbody></table>`;
}

function graphHtml() {
  const nonce = mockStats.totalCalls;
  const nodeRows = NODE_NAMES.map((n, i) =>
    `<tr><td>${n}</td><td>${i % 2 ? "Эпистемологическая" : "Онтологическая"}</td>` +
    `<td>Определение категории «${n}» в синтезе.</td><td>0.${9 - (i % 5)}</td><td>0.${8 - (i % 4)}</td>` +
    `<td>${i % 2 ? "Гегель" : "Кант"}</td></tr>`).join("");
  const topo = NODE_NAMES.map((n, i) =>
    `<tr><td>${n}</td><td>${i < 5 ? "I — Основания" : "II — Развёртывание"}${i === 3 ? " / Мост" : ""}</td>` +
    `<td>${i === 0 ? "центральная" : "периферийная"}</td><td>${i % 2 ? "антитезис" : "тезис"}</td></tr>`).join("");
  return `<div class="doc-section" data-section="Методология построения графа"><p>Граф построен диалектически (прогон ${nonce}).</p></div>` +
    `<div class="doc-section" data-section="Таблица категорий"><table class="doc-table"><thead><tr><th>Категория</th><th>Тип</th><th>Определение</th><th>Центральность</th><th>Определённость</th><th>Происхождение</th></tr></thead><tbody>${nodeRows}</tbody></table></div>` +
    `<div class="doc-section" data-section="Таблица связей">${edgesTableHtml(nonce)}</div>` +
    `<div class="doc-section" data-section="Топология графа"><div data-section="Топологическая таблица"><table class="doc-table"><thead><tr><th>Категория</th><th>Кластер</th><th>Структурные роли</th><th>Процессуальные роли</th></tr></thead><tbody>${topo}</tbody></table></div></div>`;
}

function glossaryHtml() {
  const terms = NODE_NAMES.map((n, i) =>
    `<tr><td>${n}</td><td>Принятое в данной концепции определение термина «${n}».</td>` +
    `<td>Трансформация значения №${i + 1}.</td></tr>`).join("");
  return `<div class="doc-section" data-section="Таблица определений"><table class="doc-table"><thead><tr><th>Термин</th><th>Принятое определение в данной концепции</th><th>Трансформация значения в синтезе</th></tr></thead><tbody>${terms}</tbody></table></div>` +
    `<div class="doc-section" data-section="Переопределённые термины"><p><strong>${NODE_NAMES[0]}</strong> — переосмыслен.</p></div>` +
    `<div class="doc-section" data-section="Новые термины"><p><strong>${NODE_NAMES[9]}</strong> — введён впервые.</p></div>`;
}

function thesesHtml() {
  const nonce = mockStats.totalCalls;
  const rows = NODE_NAMES.slice(0, 6).map((n, i) =>
    `<tr><td>${i + 1}</td><td>Тезис о том, что ${n.toLowerCase()} образует ядро синтеза (v${nonce}).</td>` +
    `<td>${["онтол.", "эпистем.", "этич."][i % 3]}</td><td>высокая</td><td>${n}, ${NODE_NAMES[(i + 1) % 10]}</td></tr>`).join("");
  return `<div class="doc-section" data-section="Онтологические тезисы"><p><strong>Тезис о том, что ${NODE_NAMES[0].toLowerCase()} образует ядро синтеза.</strong> Обоснование (v${nonce}).</p></div>` +
    `<div class="doc-section" data-section="Сводная таблица тезисов"><table class="doc-table"><thead><tr><th>№</th><th>Формулировка тезиса</th><th>Тип</th><th>Степень новизны</th><th>Связанные категории</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function sumHtml() {
  const nonce = mockStats.totalCalls;
  return `<div class="doc-section" data-section="Цели и задачи"><p>Цель синтеза — соединить традиции (v${nonce}).</p></div>` +
    `<div class="doc-section" data-section="Точки напряжения"><p>Напряжение между конечностью рассудка и тотальностью духа.</p></div>` +
    `<div class="doc-section" data-section="Методологическая рамка"><p>Метод — диалектическое снятие.</p></div>`;
}

function subsectionHtml(task) {
  const m = task.match(/секцию:\s*\n\s*«([^»]+)»/);
  const name = m ? m[1] : "Подраздел";
  const nonce = mockStats.totalCalls;
  if (name === "Таблица связей") {
    return `<div class="doc-section" data-section="Таблица связей">${edgesTableHtml(nonce)}</div>`;
  }
  if (name === "Таблица категорий") {
    const nodeRows = NODE_NAMES.map((n, i) =>
      `<tr><td>${n}</td><td>${i % 2 ? "Эпистемологическая" : "Онтологическая"}</td>` +
      `<td>Определение категории «${n}» (v${nonce}).</td><td>0.${9 - (i % 5)}</td><td>0.${8 - (i % 4)}</td>` +
      `<td>${i % 2 ? "Гегель" : "Кант"}</td></tr>`).join("");
    return `<div class="doc-section" data-section="Таблица категорий"><table class="doc-table"><thead><tr><th>Категория</th><th>Тип</th><th>Определение</th><th>Центральность</th><th>Определённость</th><th>Происхождение</th></tr></thead><tbody>${nodeRows}</tbody></table></div>`;
  }
  return `<div class="doc-section" data-section="${name}"><p>Перегенерированный подраздел «${name}» (v${nonce}).</p></div>`;
}

function pickHtml(prompt) {
  const task = prompt.slice(Math.max(0, prompt.lastIndexOf("ЗАДАНИЕ")));
  if (/ТОЛЬКО секцию/.test(prompt)) return subsectionHtml(prompt);
  if (task.includes("Таблица категорий")) return graphHtml();
  if (task.includes("Таблица определений") || task.includes("Термин | Принятое определение"))
    return glossaryHtml();
  if (task.includes("Сводная таблица") && /тезис/i.test(task)) return thesesHtml();
  return sumHtml();
}

function startMock() {
  const srv = http.createServer((req, res) => {
    if (req.url === "/stats") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(mockStats));
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      mockStats.totalCalls++;
      let prompt = "";
      try {
        prompt = JSON.parse(body).messages?.[0]?.content ?? "";
      } catch { /* пустой промпт */ }
      const html = pickHtml(prompt);
      const chunks = chunkify(html, 400);
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      send({ type: "message_start", message: { usage: { input_tokens: Math.ceil(prompt.length / 4) } } });
      for (const chunk of chunks) {
        send({ type: "content_block_delta", delta: { type: "text_delta", text: chunk } });
        await sleep(5);
      }
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: Math.ceil(html.length / 4) } });
      send({ type: "message_stop" });
      res.end();
    });
  });
  return new Promise((resolve) => srv.listen(MOCK_PORT, "127.0.0.1", () => resolve(srv)));
}

/* ════ Сервер, vite, auth, WS ════════════════════════════════════════ */

let serverProc, viteProc;
let serverLog = "", viteLog = "";

async function assertPortFree(url, name) {
  try {
    const r = await fetch(url);
    if (r.ok) throw new Error(`порт занят чужим ${name} — pkill -9 -f "[t]sx|[v]ite"`);
  } catch (e) {
    if (String(e).includes("порт занят")) throw e;
    /* ECONNREFUSED — норма */
  }
}

async function startServer() {
  await assertPortFree(`${API}/health`, "сервером");
  serverProc = spawn(process.execPath, ["--import", "tsx", "index.ts"], {
    cwd: new URL("../server/", import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
      ANTHROPIC_API_KEY: "mock-key-ok",
      DATABASE_URL: DB_URL,
      REDIS_URL: "redis://localhost:6379",
      CLIENT_ORIGIN: UI,
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

async function startVite() {
  await assertPortFree(UI + "/", "vite");
  viteProc = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort"], {
    cwd: new URL("../client/", import.meta.url).pathname,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  viteProc.stdout.on("data", (d) => (viteLog += d));
  viteProc.stderr.on("data", (d) => (viteLog += d));
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(UI + "/");
      if (r.ok) return;
    } catch { /* поднимается */ }
    await sleep(300);
  }
  throw new Error("vite не поднялся:\n" + viteLog.slice(-2000));
}

async function makeUser(tag) {
  const email = `t23-${tag}-${Date.now()}@test.local`;
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
          () => reject(new Error(`timeout: ${label} (${timeoutMs}мс); получено: ` +
            messages.map((m) => m.type).join(","))),
          timeoutMs,
        );
        waiters.push({ pred, resolve, t });
      });
    },
  };
}

async function api(auth, method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie: auth.cookieHeader },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json = null;
  try { json = await r.json(); } catch { /* не-JSON */ }
  return { status: r.status, body: json };
}

/* ════ Браузерные хелперы ════════════════════════════════════════════ */

const norm = (s) => s.replace(/[\s\u00a0]+/g, " ");
const normci = (s) => norm(s).toLowerCase();
const has = (hay, needle) => normci(hay).includes(needle.toLowerCase());
const pageText = (page) => page.evaluate(() => document.body.innerText);

async function waitText(page, text, timeout = 15000) {
  await page.waitForFunction(
    (t) => document.body.innerText.replace(/[\s\u00a0]+/g, " ").toLowerCase()
      .includes(t.toLowerCase()),
    { timeout },
    text,
  );
}

async function fill(page, sel, value) {
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.click(sel, { clickCount: 3 });
  await page.type(sel, value);
}

/** Клик по кнопке с точным/префиксным текстом внутри root-селектора */
function clickButtonByText(page, rootSel, text) {
  return page.evaluate(
    (root, t) => {
      const scope = root ? document.querySelector(root) : document;
      if (!scope) return false;
      const btns = [...scope.querySelectorAll("button")];
      const normBtn = (b) => b.innerText.replace(/\s+/g, " ").trim().toLowerCase();
      const hit = btns.find((b) => normBtn(b).startsWith(t.toLowerCase()));
      if (!hit) return false;
      hit.click();
      return true;
    },
    rootSel, text,
  );
}

/* ════ Сценарии ══════════════════════════════════════════════════════ */

const sql = postgres(DB_URL, { max: 2, onnotice: () => {} });

async function sectionRow(sid, key) {
  const [r] = await sql`
    SELECT key, html_content, is_edited FROM sections
    WHERE synthesis_id = ${sid} AND key = ${key}`;
  return r;
}
async function synthRow(sid) {
  const [r] = await sql`
    SELECT section_order, version_base, version_sub, status, ext_graph_metrics
    FROM syntheses WHERE id = ${sid}`;
  return r;
}

let mockSrv, browser;

try {
  mockSrv = await startMock();
  await startServer();
  await startVite();
  console.log("Мок, сервер и vite подняты.");

  const A = await makeUser("owner");
  const cA = wsConnect(A.token);
  await cA.open();

  /* ════ Подготовка: синтез S1 (4 раздела) через мок ════ */
  console.log("\n■ Подготовка: POST-синтез S1 (graph, glossary, theses, dialogue)");
  const p1 = await api(A, "POST", "/syntheses", {
    seed: "Синтез для UI редактирования",
    philosophers: ["Кант", "Гегель"],
    sections: ["graph", "glossary", "theses", "dialogue"],
    method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  ok(p1.status === 201 && !!p1.body?.id, "POST S1 → 201");
  const S1 = p1.body.id;
  await cA.waitFor(
    (m) => m.type === "generation_complete" && m.synthesisId === S1,
    180_000, "complete S1",
  );
  const s1 = await synthRow(S1);
  // Статус завершённого синтеза — "ready" (enum схемы; не "complete")
  ok(s1.status === "ready" && s1.section_order.length === 5,
    "S1 ready, sectionOrder = sum + 4",
    `status=${s1.status} order=${JSON.stringify(s1.section_order)}`);

  /* ════ R0: API-санитария транспорта 2.3 ════ */
  console.log("\n■ R0: API-санитария /plans/impact, /subsection-impact, PATCH extGraphMetrics");
  const imp = await api(A, "POST", `/syntheses/${S1}/plans/impact`, {
    regen: ["graph"], remove: [], add: [],
  });
  ok(imp.status === 200 && Array.isArray(imp.body?.impact?.affectedSections),
    "POST /plans/impact → 200, impact.affectedSections");
  const downstream = imp.body?.impact?.affectedSections ?? [];
  ok(downstream.length > 0, "regen graph → downstream непуст", JSON.stringify(downstream));
  ok(typeof imp.body?.estimatedCost === "number" && imp.body.estimatedCost > 0,
    "estimatedCost > 0 (только выбранные действия)", String(imp.body?.estimatedCost));

  const impEmpty = await api(A, "POST", `/syntheses/${S1}/plans/impact`, {
    regen: [], remove: [], add: [],
  });
  ok(impEmpty.status === 200 && impEmpty.body?.impact?.affectedSections?.length === 0 &&
    impEmpty.body?.estimatedCost === 0,
    "пустые действия → пустой импакт, стоимость 0");

  const sub = await api(A, "POST", `/syntheses/${S1}/subsection-impact`, {
    sectionKey: "graph", subsectionName: "Таблица категорий",
  });
  ok(sub.status === 200 && Array.isArray(sub.body?.intraDependents),
    "POST /subsection-impact → 200");
  const intraDeps = sub.body?.intraDependents ?? [];
  ok(intraDeps.length > 0, "intra-зависимые «Таблицы категорий» непусты",
    JSON.stringify(intraDeps));
  ok(sub.body?.estimate && sub.body.estimate.cost > 0 &&
    sub.body.estimate.inTokens > 0 && sub.body.estimate.outTokens > 0,
    "оценка подраздела: cost/in/out > 0", JSON.stringify(sub.body?.estimate));

  const pFlag = await api(A, "PATCH", `/syntheses/${S1}`, { extGraphMetrics: true });
  ok(pFlag.status === 200 && pFlag.body?.synthesis?.extGraphMetrics === true,
    "PATCH extGraphMetrics=true → 200, флаг в SynthesisFull");
  ok((await synthRow(S1)).ext_graph_metrics === true, "ext_graph_metrics=true в БД");
  await api(A, "PATCH", `/syntheses/${S1}`, { extGraphMetrics: false });

  const B = await makeUser("stranger");
  const impB = await api(B, "POST", `/syntheses/${S1}/plans/impact`, {
    regen: ["graph"], remove: [], add: [],
  });
  ok(impB.status === 403, "превью каскада — только владелец (403 чужому)");

  /* ════ Браузер ════ */
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  // Диагностика цикла reconnect: журнал жизни всех WS страницы
  await page.evaluateOnNewDocument(() => {
    window.__wsLog = [];
    const Orig = window.WebSocket;
    let n = 0;
    window.WebSocket = function (...args) {
      const id = ++n;
      const ws = new Orig(...args);
      const stack = (new Error().stack || "").split("\n").slice(2, 5).join(" | ");
      window.__wsLog.push(`open#${id} ${args[0]} :: ${stack}`);
      ws.addEventListener("close", (e) =>
        window.__wsLog.push(`close#${id} code=${e.code} clean=${e.wasClean}`));
      return ws;
    };
    window.WebSocket.prototype = Orig.prototype;
    Object.assign(window.WebSocket, Orig);
  });
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error")
      consoleErrors.push("console: " + m.text() + " @ " + (m.location()?.url ?? "?"));
  });

  /* Сниффер запросов превью (проверка debounce R2) */
  let impactCalls = 0;
  page.on("request", (req) => {
    if (req.url().includes("/plans/impact")) impactCalls++;
  });

  await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
  await fill(page, "input[type=email]", A.email);
  await fill(page, "input[type=password]", A.password);
  await page.click("button[type=submit]");
  await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 20000 });

  /* ════ R2: поток — модалка, чекбокс, каскад, «отметить ↑», ▶ ════ */
  console.log("\n■ R2: поток EditModal → graph → CascadePanel → «отметить ↑» → ▶");
  await page.goto(`${UI}/synthesis/${S1}`, { waitUntil: "domcontentloaded" });
  await waitText(page, "ДОКУМЕНТ СГЕНЕРИРОВАН");
  ok(await clickButtonByText(page, ".actions-bar", "✎ Изменить"),
    "кнопка «✎ Изменить» в actions-bar");
  await page.waitForSelector(".edit-modal", { timeout: 10000 });
  ok(true, "модальное окно открылось");
  const t0 = await pageText(page);
  ok(has(t0, "Редактирование Разделов"), "заголовок модалки");
  ok(!(await page.$(".cascade-panel")), "каскадная панель скрыта при пустом плане");

  const runSel = ".edit-modal-footer .edit-sec-btn.primary";
  ok(await page.$eval(runSel, (b) => b.disabled), "▶ заблокирована при пустом плане");
  ok(await page.$eval(runSel, (b) => b.innerText.toLowerCase().includes("составить план")),
    "кнопка в состоянии «▶ Составить план»");

  // Карточки: 4 раздела (без sum), у каждого — взаимоисключающие чекбоксы
  const cardCount = await page.$$eval(".edit-sec-card", (els) => els.length);
  ok(cardCount === 4, "4 карточки разделов (без sum)", String(cardCount));

  const regenSel = "#editCard-graph .edit-sec-checks label:nth-child(1) input";
  const delSel = "#editCard-graph .edit-sec-checks label:nth-child(2) input";
  await page.click(regenSel);
  ok(await page.$eval(regenSel, (i) => i.checked), "чекбокс «Перегенерировать» graph отмечен");
  ok(await page.$eval(delSel, (i) => i.disabled),
    "чекбокс «Удалить» заблокирован (взаимоисключение)");

  await page.waitForSelector(".cascade-panel.visible", { timeout: 15000 });
  const t2 = await pageText(page);
  ok(has(t2, "Каскад зависимостей"), "заголовок «Каскад зависимостей»");
  ok(has(t2, "Рекомендуется отметить их для перегенерации"),
    "описание downstream — дословно");
  for (const k of downstream) {
    ok(has(t2, KEY_LABELS[k] ?? k), `downstream в панели: ${KEY_LABELS[k] ?? k}`);
  }
  const exposedCount = await page.$$eval(".cascade-item-info.exposed", (e) => e.length);
  ok(exposedCount === downstream.length, "все downstream — exposed (⚡)",
    `${exposedCount} из ${downstream.length}`);

  // «отметить ↑» для первого downstream (по 07 — theses)
  const firstDep = downstream[0];
  const firstLabel = KEY_LABELS[firstDep] ?? firstDep;
  const clicked = await page.evaluate((label) => {
    const items = [...document.querySelectorAll(".cascade-item-info")];
    const item = items.find((el) => el.innerText.includes(label));
    const btn = item?.querySelector("button");
    if (!btn) return false;
    btn.click();
    return true;
  }, firstLabel);
  ok(clicked, `клик «отметить ↑» (${firstLabel})`);
  await sleep(150);
  ok(await page.$eval(
    `#editCard-${firstDep} .edit-sec-checks label:nth-child(1) input`,
    (i) => i.checked,
  ), `чекбокс «Перегенерировать» ${firstDep} выставлен кнопкой`);
  await page.waitForFunction(
    (label) => [...document.querySelectorAll(".cascade-item-info.covered")]
      .some((el) => el.innerText.includes(label)),
    { timeout: 15000 }, firstLabel,
  );
  ok(true, `пункт ${firstLabel} стал covered (✓)`);
  ok(!(await page.$eval(runSel, (b) => b.disabled)), "▶ активна (есть действия)");

  /* ════ R3: исполнение — план, прогресс, все шаги ✓ ════ */
  console.log("\n■ R3: исполнение — «Составить план» → «Исполнить» → все шаги ✓");
  // Покрываем весь каскад (жмём «отметить ↑», пока есть exposed)
  for (let i = 0; i < 10; i++) {
    const more = await page.evaluate(() => {
      const btn = document.querySelector(".cascade-item-info.exposed button");
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!more) break;
    await sleep(600); // debounce превью
  }
  await page.waitForFunction(
    () => !document.querySelector(".cascade-item-info.exposed"),
    { timeout: 20000 },
  );
  ok(true, "каскад покрыт полностью (нет exposed)");
  const checkedCount = await page.$$eval(
    ".edit-sec-checks label:nth-child(1) input",
    (els) => els.filter((i) => i.checked).length,
  );

  const impactCallsBefore = impactCalls;
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".edit-modal-footer");
      return el && /≈ \$/.test(el.innerText);
    },
    { timeout: 15000 },
  );
  ok(true, "футер показывает оценку стоимости «≈ $»");

  await page.click(runSel);
  await waitText(page, "План редактирования", 20000);
  ok(true, "EditPlanPanel появился после «Составить план»");
  const tPlan = await pageText(page);
  ok(has(tPlan, "· draft"), "статус плана — draft");
  const iconsDraft = await page.$$eval(".step-icon", (els) => els.map((e) => e.innerText.trim()));
  ok(iconsDraft.length === checkedCount && iconsDraft.every((i) => i === "●"),
    `шаги плана: ${checkedCount} confirmed (●), каскадных pending нет`,
    JSON.stringify(iconsDraft));
  ok(await page.$eval(regenSel, (i) => i.disabled),
    "чекбоксы заморожены после составления плана");
  ok(await page.$eval(runSel, (b) => b.innerText.toLowerCase().includes("исполнить")),
    "кнопка перешла в «▶ Исполнить»");

  const graphBefore = await sectionRow(S1, "graph");
  await page.click(runSel);
  // Live-прогресс: хотя бы один шаг в состоянии ⟳
  await page.waitForFunction(
    () => [...document.querySelectorAll(".step-icon")].some((e) => e.innerText.trim() === "⟳"),
    { timeout: 60000 },
  );
  ok(true, "live-прогресс: шаг в состоянии ⟳");
  try {
    await page.waitForFunction(
      () => /· done/i.test(document.body.innerText),
      { timeout: 120000 },
    );
  } catch (e) {
    const wsLog = await page.evaluate(() => window.__wsLog ?? []);
    console.log("WS-журнал страницы:\n  " + wsLog.slice(-30).join("\n  "));
    const [planRow] = await sql`
      SELECT id, status, steps FROM edit_plans
      WHERE synthesis_id = ${S1} ORDER BY created_at DESC LIMIT 1`;
    console.log("План в БД:", planRow?.status,
      JSON.stringify(planRow?.steps?.map((x) => x.type + ":" + x.target + "=" + x.status)));
    const modalText = await page.evaluate(
      () => document.querySelector(".edit-modal")?.innerText?.slice(0, 1200));
    console.log("Текст модалки:", modalText);
    throw e;
  }
  const iconsDone = await page.$$eval(".step-icon", (els) => els.map((e) => e.innerText.trim()));
  ok(iconsDone.length === checkedCount && iconsDone.every((i) => i === "✓"),
    "по завершении все шаги ✓", JSON.stringify(iconsDone));
  const graphAfter = await sectionRow(S1, "graph");
  ok(graphAfter.html_content !== graphBefore.html_content && graphAfter.is_edited === true,
    "graph в БД перегенерирован (html изменился, is_edited)");
  ok(impactCalls === impactCallsBefore,
    "после составления плана превью каскада не дёргается", String(impactCalls - impactCallsBefore));

  // Карточки показывают «⟳ » у перегенерированных (isEdited)
  await page.waitForFunction(
    () => document.querySelector("#editCard-graph .edit-sec-title")?.innerText.includes("⟳"),
    { timeout: 20000 },
  ).catch(() => {});
  ok(await page.$eval("#editCard-graph .edit-sec-title", (e) => e.innerText.includes("⟳")),
    "индикатор «⟳ » на карточке graph (isEdited)");

  /* ════ R4: подраздельная перегенерация ════ */
  console.log("\n■ R4: SubsectionRegenPanel — «Таблица категорий», зависимые, очередь");
  await page.click(".edit-modal-header .raw-close");
  await page.waitForFunction(() => !document.querySelector(".edit-modal"), { timeout: 5000 });
  ok(true, "модалка закрыта (план сброшен)");
  await clickButtonByText(page, ".actions-bar", "✎ Изменить");
  await page.waitForSelector(".edit-modal", { timeout: 10000 });

  ok(await clickButtonByText(page, "#editCard-graph", "⟳ Таблица категорий"),
    "кнопка подраздела «⟳ Таблица категорий»");
  await waitText(page, "Также будут предложены к перегенерации:", 20000);
  const t4 = await pageText(page);
  for (const d of intraDeps) {
    ok(has(t4, `«${d}»`), `intra-зависимый показан: «${d}»`);
  }
  ok(/≈ \$\d/.test(norm(t4)), "оценка стоимости подраздела «≈ $…»");
  ok(has(t4, "вх.") && has(t4, "вых."), "оценка с токенами (вх./вых.)");

  // Очередь: отметить первого intra-зависимого → ▶ → два section_done
  const dep0 = intraDeps[0];
  const cbClicked = await page.evaluate((depName) => {
    const labels = [...document.querySelectorAll(".edit-sec-check")];
    const lab = labels.find((l) => l.innerText.includes(`«${depName}»`));
    const input = lab?.querySelector("input");
    if (!input) return false;
    input.click();
    return true;
  }, dep0);
  ok(cbClicked, `каскадный чекбокс «${dep0}» отмечен`);

  const wsCountBefore = cA.messages.filter(
    (m) => m.type === "section_done" && m.synthesisId === S1,
  ).length;
  const verBefore = await synthRow(S1);
  ok(await clickButtonByText(page, ".edit-modal", "▶ Перегенерировать"),
    "запуск подраздельной перегенерации");
  // Ждём ДВА section_done (главный + каскадный из очереди)
  await cA.waitFor(
    (m) => m.type === "section_done" && m.synthesisId === S1 &&
      cA.messages.filter((x) => x.type === "section_done" && x.synthesisId === S1).length >= wsCountBefore + 2,
    120_000, "два section_done (очередь каскада)",
  );
  await waitText(page, "✓ Готово", 30000);
  ok(true, "очередь завершилась — «✓ Готово»");
  const verAfter = await synthRow(S1);
  ok(verAfter.version_sub === verBefore.version_sub + 2,
    "version_sub +2 (две подраздельные волны)",
    `${verBefore.version_sub} → ${verAfter.version_sub}`);
  const [ctxSub] = await sql`
    SELECT count(*)::int AS count FROM context_log
    WHERE synthesis_id = ${S1} AND section_key = ${"graph:" + dep0}`;
  ok(ctxSub.count >= 1, `ctxLog каскадного подраздела «graph:${dep0}» есть`);

  /* ════ R5: responsive < 768px ════ */
  console.log("\n■ R5: responsive — модалка на весь экран при 375×812");
  await page.setViewport({ width: 375, height: 812 });
  await sleep(400);
  const box = await page.$eval(".edit-modal", (el) => {
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, x: r.x, y: r.y };
  });
  ok(Math.abs(box.w - 375) <= 1, "ширина модалки = ширине экрана", JSON.stringify(box));
  ok(Math.abs(box.h - 812) <= 1, "высота модалки = высоте экрана (100vh)");
  ok(box.x === 0 && box.y === 0, "overlay без отступов (padding 0)");
  const footerWrap = await page.$eval(".edit-modal-footer", (el) =>
    getComputedStyle(el).flexWrap);
  ok(footerWrap === "wrap", "футер переносится (flex-wrap)");
  await page.setViewport({ width: 1280, height: 900 });

  /* ════ Ошибки консоли ════ */
  // Шум окружения, не дефекты клиента:
  //  - fonts.googleapis.com 403 — egress-прокси песочницы режет внешние
  //    домены (в проде домен доступен);
  //  - /auth/me 401 на странице логина ДО входа — штатная проверка
  //    сессии (обрабатывается приложением; ×2 из-за StrictMode).
  const realErrors = consoleErrors.filter(
    (e) => !e.includes("favicon") && !e.includes("Download the React DevTools") &&
      !e.includes("fonts.googleapis.com") &&
      !(e.includes("/auth/me") && e.includes("401")),
  );
  ok(realErrors.length === 0, "нет ошибок консоли/страницы",
    realErrors.slice(0, 3).join(" | "));
} catch (err) {
  failed++;
  fails.push("FATAL: " + err.message);
  console.error("\nFATAL:", err);
  console.error("server tail:", serverLog.slice(-1500));
  console.error("vite tail:", viteLog.slice(-800));
} finally {
  try { await browser?.close(); } catch { /* — */ }
  serverProc?.kill("SIGKILL");
  viteProc?.kill("SIGKILL");
  mockSrv?.close();
  await sql.end();
}

console.log(`\n══ Итог: ${passed} ✓ / ${failed} ✗`);
if (fails.length) {
  console.log("Провалы:\n  - " + fails.join("\n  - "));
  process.exit(1);
}
process.exit(0);
