/**
 * Беседа 2.4 — тестовые запросы 2–5 протокола (07, «Последующие запросы»)
 * одним заходом, по команде пользователя.
 *
 * Харнесс: живой сервер (node --import tsx index.ts, PORT=3000 — чтобы
 * vite dev-прокси клиента попадал в него) + PG/Redis + мок Claude API
 * (SSE, ANTHROPIC_BASE_URL) — паттерн test-16/test-22; для R3 —
 * vite dev (5173) + puppeteer-core (/tmp/pptr) + chrome из кэша.
 *
 *   R1 — «синтез с 3 разделами, открой лог»: POST sections=[graph,
 *        glossary] → order [sum,graph,glossary] (3 раздела); после
 *        complete GET /logs/formatted: шапка, ОБЩИЕ ЭЛЕМЕНТЫ, все 3
 *        блока «═══ LABEL ═══», структура блока как в исходнике
 *        (ВХОД → Общие элементы → Контекст/«— (первый раздел)» →
 *        Задание секции → ИТОГО → ВЫХОД → Стоимость → СЕКЦИИ),
 *        «═══ ИТОГО ═══» с «Разделов: 3 из 3» и числовой сверкой с БД.
 *   R2 — colorizeLog: в ЖИВОМ html ✓ зелёные (#4db87a), ✗ красные
 *        (#e06060), бюджеты dim (#888888), заголовки золотые; ◦/◌ —
 *        на синтетике через shared colorizeLog (в здоровом прогоне
 *        обрезок/пропусков нет — статусы truncated/skipped_budget
 *        живьём требуют исчерпания бюджета).
 *   R3 — live-обновление (браузер): мок ставится на hold → POST
 *        /regenerate/graph → страница /synthesis/:id (generating) →
 *        клик «◈ Лог» → в модалке streaming-строка «⟳ генерация»;
 *        снятие hold → БЕЗ перезагрузки страницы модалка обновляется
 *        (⟳ исчезает, второй блок ГРАФ с ✓/Стоимостью появляется) —
 *        механизм: refreshKey по существующим section_done/complete.
 *   R4 — маркеры: синтез 5 разделов, план regen=[graph]+remove=[history]
 *        → execute → в логе «ВЕРСИЯ v2» с «Перегенерировано: Граф
 *        категорий» и «Удалено: …», «✗ УДАЛЁН: § N — …»; в html ВЕРСИЯ
 *        золотая, УДАЛЁН красный; порядок маркеров относительно блоков.
 *
 * Запуск: npx tsx tests/test-24-requests2-5.mjs (корень репо; PG+Redis
 * подняты, миграции+3 сида применены; puppeteer-core в /tmp/pptr,
 * chrome в ~/.cache/puppeteer).
 */
import { spawn } from "node:child_process";
import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";

import { colorizeLog } from "@philosynth/shared/utils/colorize-log";
import { KEY_LABELS } from "@philosynth/shared/constants/section-labels";

const SERVER_PORT = 3000; // vite dev proxy → localhost:3000
const MOCK_PORT = 3993;
const VITE_PORT = 5173;
const BASE = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const DB_URL = "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const CHROME =
  "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome";

process.env.DATABASE_URL ??= DB_URL;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.ANTHROPIC_API_KEY ??= "mock-key-ok";

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

/* ════ Мок Claude API (по test-22) + управляемая задержка hold ════════ */

const mockStats = { totalCalls: 0, holdMs: 0 };

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

function historyHtml() {
  return `<div class="doc-section" data-section="Историческая линия"><p>Синтез продолжает линию немецкого идеализма, отсылая к «§ 2» предшествующих разделов.</p></div>` +
    `<div class="doc-section" data-section="Предшественники"><p>Кант и Гегель как источники.</p></div>`;
}

function sumHtml() {
  return `<div class="doc-section" data-section="Цели и задачи"><p>Цель синтеза — соединить критическую и диалектическую традиции.</p></div>` +
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
  return `<div class="doc-section" data-section="${name}"><p>Перегенерированный подраздел «${name}» (v${nonce}).</p></div>`;
}

function pickHtml(prompt) {
  const task = prompt.slice(Math.max(0, prompt.lastIndexOf("ЗАДАНИЕ")));
  if (/ТОЛЬКО секцию/.test(prompt)) return subsectionHtml(prompt);
  if (task.includes("Таблица категорий")) return graphHtml();
  if (task.includes("Таблица определений") || task.includes("Термин | Принятое определение"))
    return glossaryHtml();
  if (task.includes("Сводная таблица") && /тезис/i.test(task)) return thesesHtml();
  if (/истори/i.test(task)) return historyHtml();
  return sumHtml();
}

function startMock() {
  const srv = http.createServer((req, res) => {
    if (req.url === "/stats") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(mockStats));
      return;
    }
    if (req.url === "/hold") {
      let b = "";
      req.on("data", (d) => (b += d));
      req.on("end", () => {
        try { mockStats.holdMs = JSON.parse(b).ms | 0; } catch { mockStats.holdMs = 0; }
        res.writeHead(200); res.end("ok");
      });
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
      // Первый чанк сразу (genLog-запись станет streaming с контентом),
      // затем удержание, пока /hold не сброшен — live-сценарий R3
      send({ type: "content_block_delta", delta: { type: "text_delta", text: chunks[0] } });
      const t0 = Date.now();
      while (mockStats.holdMs > 0 && Date.now() - t0 < mockStats.holdMs) {
        await sleep(150);
      }
      for (const chunk of chunks.slice(1)) {
        send({ type: "content_block_delta", delta: { type: "text_delta", text: chunk } });
        await sleep(8);
      }
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: Math.ceil(html.length / 4) } });
      send({ type: "message_stop" });
      res.end();
    });
  });
  return new Promise((resolve) => srv.listen(MOCK_PORT, "127.0.0.1", () => resolve(srv)));
}

/* ════ Обвязка сервера, vite, auth, WS (по test-22) ═══════════════════ */

let serverProc;
let serverLog = "";
let viteProc;
let viteLog = "";

async function startServer() {
  try {
    const r = await fetch(`${BASE}/health`);
    if (r.ok) {
      throw new Error(
        `порт ${SERVER_PORT} уже занят чужим сервером — убейте сироту: pkill -9 -f "[t]sx"`,
      );
    }
  } catch (e) {
    if (String(e).includes("уже занят")) throw e;
    /* ECONNREFUSED — норма */
  }
  serverProc = spawn(
    process.execPath,
    ["--import", "tsx", "index.ts"],
    {
      cwd: new URL("../server/", import.meta.url).pathname,
      env: {
        ...process.env,
        PORT: String(SERVER_PORT),
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        ANTHROPIC_API_KEY: "mock-key-ok",
        DATABASE_URL: DB_URL,
        REDIS_URL: "redis://localhost:6379",
        RATE_LIMIT_HTTP_PER_MINUTE: "100000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  serverProc.stdout.on("data", (d) => (serverLog += d));
  serverProc.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch { /* поднимается */ }
    await sleep(300);
  }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-2000));
}

async function startVite() {
  viteProc = spawn("npm", ["run", "dev", "-w", "client"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  viteProc.stdout.on("data", (d) => (viteLog += d));
  viteProc.stderr.on("data", (d) => (viteLog += d));
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${VITE_PORT}/`);
      if (r.ok) return;
    } catch { /* поднимается */ }
    await sleep(300);
  }
  throw new Error("vite dev не поднялся:\n" + viteLog.slice(-2000));
}

async function makeUser(tag) {
  const email = `t24-${tag}-${Date.now()}@test.local`;
  const password = "Passw0rd!123";
  let r = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error("register: " + (await r.text()));
  r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error("login: " + (await r.text()));
  const cookie = r.headers.get("set-cookie") ?? "";
  const m = cookie.match(/philosynth_session=([^;]+)/);
  if (!m) throw new Error("нет session-cookie: " + cookie);
  return { email, token: m[1], cookieHeader: `philosynth_session=${m[1]}` };
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
    send: (obj) => ws.send(JSON.stringify(obj)),
    close: () => ws.close(),
    /** Грабля test-22: seen-срез, чтобы не матчить историю прежних сценариев */
    waitFor(pred, timeoutMs, label, seen = 0) {
      const hit = messages.find((m, i) => i >= seen && pred(m));
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
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      cookie: auth.cookieHeader,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json = null;
  try { json = await r.json(); } catch { /* не-JSON */ }
  return { status: r.status, body: json };
}

/* ════ Сценарии ══════════════════════════════════════════════════════ */

const sql = postgres(DB_URL, { max: 2, onnotice: () => {} });
// Заголовки блоков лога — реестровые section_label из genLog (исходник
// печатает g.label), НЕ KEY_LABELS; KEY_LABELS — только в actions маркера
const labelCache = new Map();
async function dbLabel(sid, key) {
  const ck = sid + ":" + key;
  if (!labelCache.has(ck)) {
    const [r] = await sql`
      SELECT section_label FROM generation_log
      WHERE synthesis_id = ${sid} AND section_key = ${key}
        AND log_type = 'generation'
      ORDER BY created_at LIMIT 1`;
    labelCache.set(ck, r.section_label.replace(/ \[перегенерация\]$/u, ""));
  }
  return labelCache.get(ck);
}
const hdr = (label) => `═══ ${label.toUpperCase()}`;

let mockSrv;
let browser;

try {
  mockSrv = await startMock();
  await startServer();
  console.log("Сервер (:3000) и мок подняты.");

  const A = await makeUser("owner");
  const cA = wsConnect(A.token);
  await cA.open();

  /* ════ R1: синтез с 3 разделами → полный лог, формат исходника ════ */
  console.log("\n■ R1: синтез 3 раздела → GET /logs/formatted (формат)");
  const p1 = await api(A, "POST", "/syntheses", {
    seed: "Синтез для проверки лога",
    philosophers: ["Кант", "Гегель"],
    sections: ["graph", "glossary"],
    method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  ok(p1.status === 201 && !!p1.body?.id, "POST S1 → 201");
  const S1 = p1.body.id;
  await cA.waitFor((m) => m.type === "generation_complete" && m.synthesisId === S1,
    120_000, "complete S1");
  const [s1] = await sql`SELECT section_order, doc_num, title FROM syntheses WHERE id = ${S1}`;
  ok(s1.section_order.length === 3, "S1: ровно 3 раздела (sum+graph+glossary)",
    JSON.stringify(s1.section_order));

  const f1 = await api(A, "GET", `/syntheses/${S1}/logs/formatted`);
  ok(f1.status === 200 && typeof f1.body?.text === "string" &&
     typeof f1.body?.html === "string", "GET /logs/formatted → { text, html }");
  const T = f1.body.text;
  const H = f1.body.html;

  ok(T.startsWith("PHILOSYNTH PRO — ЛОГ КОНТЕКСТА И ГЕНЕРАЦИИ"),
    "шапка PHILOSYNTH PRO первая строка");
  ok(T.includes("ОБЩИЕ ЭЛЕМЕНТЫ ПРОМПТА:") &&
     /Системный промпт\s+[\d\s\u00a0]+ симв\.\s+\(одинаков для всех\)/.test(T) &&
     T.includes("Служебный каркас"),
    "блок ОБЩИЕ ЭЛЕМЕНТЫ (сист. промпт + каркас)");
  const L = {};
  for (const k of s1.section_order) {
    L[k] = await dbLabel(S1, k);
    ok(T.includes(hdr(L[k]) + " ═══"), `блок раздела «${L[k]}» присутствует`);
  }
  // Структура блока graph — порядок строк как в исходнике
  const gStart = T.indexOf(hdr(L.graph));
  const gEnd = T.indexOf(hdr(L.glossary));
  const gBlock = T.slice(gStart, gEnd);
  const orderIdx = [
    "ВХОД:", "Общие элементы", "Контекст пред. разделов", "Бюджет:",
    "Задание секции", "ИТОГО", "ВЫХОД:", "Стоимость: $", "СЕКЦИИ:",
  ].map((m) => gBlock.indexOf(m));
  ok(orderIdx.every((v) => v >= 0) &&
     orderIdx.every((v, i) => i === 0 || v > orderIdx[i - 1]),
    "порядок строк блока graph = формату исходника",
    JSON.stringify(orderIdx));
  const sumBlock = T.slice(T.indexOf(hdr(L.sum)), gStart);
  ok(sumBlock.includes("— (первый раздел)"),
    "первый раздел: «— (первый раздел)» вместо контекста");
  ok(/ИТОГО\s+[\d\s\u00a0]+ симв\. → [\d\s\u00a0]+ токенов \([\d.]+ с\/т\)/.test(gBlock),
    "строка ИТОГО блока: симв. → токенов (с/т)");
  ok(/✓ .+ {2,}[\d\s\u00a0]+ симв\./.test(gBlock),
    "запись контекста «✓ … N симв.» у graph");
  ok(/СЕКЦИИ:/.test(gBlock) && gBlock.includes("✓ Таблица категорий") &&
     gBlock.includes("✓ Топология графа"),
    "СЕКЦИИ: подразделы graph с ✓");

  // Итоговый блок + числовая сверка с БД
  ok(T.includes("═══ ИТОГО ═══") && T.includes("Разделов: 3 из 3"),
    "═══ ИТОГО ═══ и «Разделов: 3 из 3»");
  const [tot] = await sql`
    SELECT sum(input_chars)::int AS ic, sum(output_chars)::int AS oc,
           sum(cost_usd)::numeric AS cost
    FROM generation_log
    WHERE synthesis_id = ${S1} AND log_type = 'generation'
      AND section_key <> '_genCommon'`;
  const inLine = T.match(/^Вход: {2}([\d\s\u00a0]+) симв\./m);
  const outLine = T.match(/^Выход: ([\d\s\u00a0]+) симв\./m);
  const costLine = T.match(/^Стоимость: \$([\d.]+)/m);
  const deSp = (s) => Number(s.replace(/[\s\u00a0]/g, ""));
  ok(inLine && deSp(inLine[1]) === tot.ic, "итог «Вход» == сумме input_chars БД",
    `${inLine?.[1]} vs ${tot.ic}`);
  ok(outLine && deSp(outLine[1]) === tot.oc, "итог «Выход» == сумме output_chars БД");
  ok(costLine && Math.abs(Number(costLine[1]) - Number(tot.cost)) < 0.00005,
    "итог «Стоимость» == сумме cost_usd БД");

  /* ════ R2: colorizeLog — живой html + синтетика ════ */
  console.log("\n■ R2: colorizeLog (живой html + синтетика ◦/◌)");
  ok(H.includes('color:#4db87a">✓'), "живой html: ✓ зелёные (#4db87a)");
  ok(/color:#888888">\s*Бюджет/.test(H) || H.includes('color:#888888">    Бюджет'),
    "живой html: строки «Бюджет:» dim (#888888)");
  ok(H.includes(`color:#d4a017;font-weight:600">${hdr(L.graph)}`),
    "живой html: заголовок раздела золотой (#d4a017)");
  ok(H.includes('font-weight:700">PHILOSYNTH PRO'),
    "живой html: шапка жирная золотая");
  ok(/color:#d4a017;font-weight:600">\$[\d.]+/.test(H),
    "живой html: стоимость $ золотая");
  // glossary: optional theses:* в синтезе без theses → живые ✗ «не найден»
  const hasLiveMissing = /color:#e06060">✗/.test(H);
  ok(hasLiveMissing, "живой html: ✗ красные (#e06060) — опц. контекст без theses");
  // Синтетика для статусов, недостижимых в здоровом прогоне
  const synth = [
    "      ✗ Тезисы → Сводка                    НЕ НАЙДЕН",
    "      ◦ Глоссарий → Термины                  900 симв. [обрезан с 5000 до 900]",
    "      ◌ Диалог → Понятия                  пропущен [бюджет исчерпан]",
  ].join("\n");
  const sh = colorizeLog(synth);
  ok(sh.includes('color:#e06060">✗') &&
     sh.includes('color:#e06060;font-weight:600">НЕ НАЙДЕН'),
    "синтетика: ✗ + НЕ НАЙДЕН красные");
  ok(sh.includes('color:#d4a017">◦'), "синтетика: ◦ золотой");
  ok(/color:#d4a017">[\d\s\u00a0]*900\s+симв\./.test(sh),
    "синтетика: числа у ◦ золотые (двойной пробел '$1 $2' — паритет)");
  ok(sh.includes('color:#888888">◌') && /color:#888888">пропущен/.test(sh),
    "синтетика: ◌ и «пропущен» dim");

  /* ════ R3: live-обновление в браузере (puppeteer) ════ */
  console.log("\n■ R3: live-обновление лога (vite dev + puppeteer)");
  await startVite();
  console.log("  vite dev (:5173) поднят");

  // Мок на hold → запускаем перегенерацию graph (S1 → generating)
  await fetch(`http://127.0.0.1:${MOCK_PORT}/hold`, {
    method: "POST", body: JSON.stringify({ ms: 60_000 }),
  });
  const seenBeforeRegen = cA.messages.length;
  const rg = await api(A, "POST", `/syntheses/${S1}/regenerate/graph`);
  ok(rg.status === 200 && rg.body?.ok === true, "POST /regenerate/graph → ok");
  // Дождаться, что запись genLog стала streaming (мок держит поток)
  let streamingSeen = false;
  for (let i = 0; i < 50; i++) {
    const [r] = await sql`
      SELECT count(*)::int AS c FROM generation_log
      WHERE synthesis_id = ${S1} AND section_key = 'graph' AND status = 'streaming'`;
    if (r.c > 0) { streamingSeen = true; break; }
    await sleep(200);
  }
  ok(streamingSeen, "genLog: запись graph в статусе streaming (hold работает)");

  const pptr = await import("/tmp/pptr/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js");
  browser = await pptr.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  const pageLogs = [];
  page.on("console", (m) => pageLogs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => pageLogs.push(`[pageerror] ${e.message}`));
  await page.setViewport({ width: 1280, height: 900 });
  await page.setCookie({
    name: "philosynth_session",
    value: A.token,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
  });
  await page.goto(`http://127.0.0.1:${VITE_PORT}/synthesis/${S1}`, {
    waitUntil: "networkidle2", timeout: 30_000,
  });

  // Кнопка «◈ Лог» в футере документа
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((b) =>
      b.textContent.includes("◈ Лог")),
    { timeout: 20_000 },
  );
  ok(true, "страница /synthesis/:id загружена, кнопка «◈ Лог» есть");
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.includes("◈ Лог"));
    b.click();
  });
  await page.waitForSelector(".raw-modal-body pre", { timeout: 20_000 });
  // Дождаться загрузки контента (не «Загрузка…»)
  await page.waitForFunction(
    () => {
      const t = document.querySelector(".raw-modal-body pre")?.textContent ?? "";
      return t.includes("PHILOSYNTH PRO");
    },
    { timeout: 20_000 },
  );
  const textBefore = await page.evaluate(
    () => document.querySelector(".raw-modal-body pre").textContent);
  const cntBefore = textBefore.split(hdr(L.graph)).length - 1;
  ok(cntBefore >= 2 && textBefore.includes("⟳ генерация"),
    "модалка: старый блок ГРАФ + новая streaming-запись «⟳ генерация»",
    `вхождений=${cntBefore}`);
  const infoBefore = await page.evaluate(
    () => document.querySelector(".raw-info").textContent);
  ok(/\d+ разделов · \d+ строк/.test(infoBefore),
    "инфо-строка «N разделов · M строк»", infoBefore);

  // Снимаем hold → генерация завершается → модалка должна обновиться САМА
  await fetch(`http://127.0.0.1:${MOCK_PORT}/hold`, {
    method: "POST", body: JSON.stringify({ ms: 0 }),
  });
  // Standalone-перегенерация завершается section_done (generation_complete
  // не шлётся — одиночный раздел); плюс поллинг status='ready'
  await cA.waitFor(
    (m) => m.type === "section_done" && m.synthesisId === S1 &&
      m.sectionKey === "graph",
    60_000, "section_done graph после regen", seenBeforeRegen);
  for (let i = 0; i < 50; i++) {
    const [r] = await sql`SELECT status FROM syntheses WHERE id = ${S1}`;
    if (r.status === "ready") break;
    await sleep(200);
  }
  try {
    await page.waitForFunction(
      (marker) => {
        const t = document.querySelector(".raw-modal-body pre")?.textContent ?? "";
        const cnt = t.split(marker).length - 1;
        return cnt >= 2 && !t.includes("⟳ генерация");
      },
      { timeout: 45_000 },
      hdr(L.graph),
    );
  } catch (err) {
    const dump = await page.evaluate(() => ({
      pre: (document.querySelector(".raw-modal-body pre")?.textContent ?? "").slice(-1200),
      wsReady: !!window.WebSocket,
    }));
    console.log("  [diag] pre tail:", JSON.stringify(dump.pre.slice(-500)));
    console.log("  [diag] page console:", pageLogs.slice(-25).join("\n    "));
    console.log("  [diag] server ws lines:",
      serverLog.split("\n").filter((l) => l.includes("[ws]")).join(" | "));
    throw err;
  }
  const textAfter = await page.evaluate(
    () => document.querySelector(".raw-modal-body pre").textContent);
  ok(textAfter !== textBefore, "контент модалки ОБНОВИЛСЯ без перезагрузки");
  const graphTail = textAfter.slice(textAfter.lastIndexOf(hdr(L.graph)));
  ok(/ВЫХОД:/.test(graphTail) && /Стоимость: \$/.test(graphTail) &&
     !graphTail.includes("⟳ генерация"),
    "новый блок ГРАФ дописан: ВЫХОД + Стоимость, ⟳ исчез");
  ok((textAfter.match(/Разделов: \d+ из \d+/) ?? [""])[0].includes("из 4"),
    "итог: «Разделов: … из 4» (3 первичных + перегенерация)",
    (textAfter.match(/Разделов: .+/) ?? ["?"])[0]);

  // Копирование: кнопка есть; проверка клика (замена лейбла)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button.raw-copy")].find((b) =>
      b.textContent.includes("Скопировать лог"));
    b?.click();
  });
  await sleep(400);
  const copyLbl = await page.evaluate(
    () => [...document.querySelectorAll("button.raw-copy")]
      .map((b) => b.textContent).join("|"));
  ok(copyLbl.includes("Скопировано") || copyLbl.includes("Скопировать лог"),
    "кнопка копирования кликается (лейбл живой)", copyLbl);
  await browser.close();
  browser = null;

  /* ════ R4: version_marker + deletion_marker ════ */
  console.log("\n■ R4: маркеры версии и удаления в логе");
  const p2 = await api(A, "POST", "/syntheses", {
    seed: "Синтез для маркеров",
    philosophers: ["Кант", "Гегель"],
    sections: ["graph", "glossary", "theses", "history"],
    method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  ok(p2.status === 201, "POST S2 (5 разделов) → 201");
  const S2 = p2.body.id;
  const seenS2 = cA.messages.length;
  await cA.waitFor((m) => m.type === "generation_complete" && m.synthesisId === S2,
    180_000, "complete S2", seenS2);
  const [{ section_num: histNum }] = await sql`
    SELECT section_num FROM sections WHERE synthesis_id = ${S2} AND key = 'history'`;

  const plan = await api(A, "POST", `/syntheses/${S2}/plans`, {
    regen: ["graph"], remove: ["history"], add: [],
  });
  ok(plan.status === 201 || plan.status === 200, "POST план regen+remove");
  const P = plan.body.plan;
  const seenExec = cA.messages.length;
  const ex = await api(A, "POST", `/syntheses/${S2}/plans/${P.id}/execute`);
  ok(ex.status === 200 && ex.body?.ok === true, "execute → ok");
  // Ждём завершения плана: WsPlanStepDone несёт stepIndex/result (без
  // step-объекта) — терминальный ориентир plan_updated после исполнения
  // базовых шагов (regen graph + delete history); каскадные останутся
  // pending и плана не завершают
  await cA.waitFor(
    (m) => m.type === "plan_updated" && m.planId === P.id,
    120_000, "plan_updated после базовых шагов", seenExec);
  // Контроль по БД: оба confirmed-шага done
  {
    const [pl] = await sql`
      SELECT steps FROM edit_plans WHERE id = ${P.id}`;
    const done = pl.steps.filter((st) => st.status === "done").map((st) => st.type);
    ok(done.includes("regen") && done.includes("delete"),
      "план: шаги regen и delete в статусе done", JSON.stringify(done));
  }

  const f2 = await api(A, "GET", `/syntheses/${S2}/logs/formatted`);
  const T2 = f2.body.text;
  const H2 = f2.body.html;
  ok(T2.includes("Текущая версия: v2"), "шапка: «Текущая версия: v2»");
  const vLine = T2.match(/^\s*ВЕРСИЯ v\d+.*$/m);
  ok(!!vLine && vLine[0].includes("ВЕРСИЯ v2"),
    "version_marker: «ВЕРСИЯ v2» (metadata.version из plan-executor)", vLine?.[0]);
  ok(/Перегенерировано: .*Граф категорий/.test(T2),
    "version_marker: «Перегенерировано: Граф категорий»");
  ok(/Удалено: .*Историческая контекстуализация/.test(T2),
    "version_marker: «Удалено: Историческая контекстуализация» (KEY_LABELS)");
  const delLine = T2.match(/✗ УДАЛЁН: § (\d+) — (.+?)(?: {2}·|$)/m);
  ok(!!delLine && Number(delLine[1]) === histNum &&
     /истори/iu.test(delLine[2]),
    "deletion_marker: «✗ УДАЛЁН: § N — …» с верным номером",
    delLine ? `§ ${delLine[1]} — ${delLine[2]}` : "нет");
  // Порядок хронологический: маркер версии → маркер удаления → блок
  // перегенерированного graph. Шаги плана исполняются в порядке v10
  // (edit-planner 2.1, assembleSteps): 1) delete разделов, 2) add+regen —
  // поэтому запись удаления в логе РАНЬШЕ записи новой генерации graph.
  const gLabel2 = await dbLabel(S2, "graph");
  const idxVer = T2.search(/^\s*ВЕРСИЯ v2/m);
  const idxDel = T2.indexOf("✗ УДАЛЁН");
  const idxRegen = T2.indexOf(hdr(gLabel2), idxDel);
  ok(idxVer >= 0 && idxDel > idxVer && idxRegen > idxDel,
    "порядок: ВЕРСИЯ → УДАЛЁН → новый блок ГРАФ",
    `${idxVer}/${idxDel}/${idxRegen}`);
  // Раскраска маркеров
  ok(/font-weight:700;font-size:13px">\s*ВЕРСИЯ v2<\/span>/.test(H2),
    "html: «ВЕРСИЯ v2» золотая жирная");
  ok(H2.includes('color:#e06060;font-weight:600">УДАЛЁН:'),
    "html: «УДАЛЁН:» красный");
  ok(H2.includes('color:#7ba7e8">  Перегенерировано:'),
    "html: «Перегенерировано:» синий");
  ok(H2.includes('color:#e06060">  Удалено:'),
    "html: «Удалено:» красный");
  // /logs/prompts на S2 — дамп не пуст и содержит скелеты
  const pr = await api(A, "GET", `/syntheses/${S2}/logs/prompts`);
  ok(pr.status === 200 && typeof pr.body?.text === "string" &&
     pr.body.text.includes("# PHILOSYNTH PRO — ЭКСПОРТ ПРОМПТОВ") &&
     pr.body.text.includes("## СИСТЕМНЫЙ ПРОМПТ") &&
     pr.body.text.includes(`## ${gLabel2.toUpperCase()}`),
    "GET /logs/prompts: шапка + системный промпт + разделы");

  console.log(`\n══ ИТОГ: ${passed} ✓ / ${failed} ✗ ══`);
  if (failed) console.log("Провалы:", fails.join("; "));
} catch (e) {
  console.error("\nФАТАЛЬНО:", e);
  console.error("server tail:", serverLog.slice(-1500));
  console.error("vite tail:", viteLog.slice(-800));
  process.exitCode = 1;
} finally {
  if (browser) try { await browser.close(); } catch { /* закрыт */ }
  if (viteProc) viteProc.kill("SIGKILL");
  if (serverProc) serverProc.kill("SIGKILL");
  if (mockSrv) mockSrv.close();
  await sql.end({ timeout: 2 });
  process.exit(failed ? 1 : 0);
}
