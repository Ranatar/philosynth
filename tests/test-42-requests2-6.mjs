/**
 * Беседа 4.2 — тестовые запросы 2–6 протокола (07, «Последующие
 * запросы») одним заходом, по команде пользователя.
 *
 * Харнесс — по образцу test-41: живой сервер (:3000) + PG/Redis + мок
 * Claude API (SSE) + puppeteer-core (Chromium из /opt/pw-browsers).
 * Vite не нужен: тестируются серверные эндпоинты и АВТОНОМНЫЙ
 * экспортированный файл (file://).
 *
 *   R2 — тест 2 07: exportMMD на графе 8 узлов / 3 кластера.
 *        АДАПТАЦИЯ «вставь в mermaid.live»: сеть ограничена — валидность
 *        проверяется ТЕМ ЖЕ движком mermaid (npm-пакет, локальный бандл
 *        в странице puppeteer, mermaid.parse + mermaid.render).
 *   R3 — тест 3 07: exportJSON — структура meta/nodes/edges/clusters
 *        по спецификации, поля узлов/рёбер, роли, мульти-кластерность.
 *   R4 — тест 4 07: exportHTML — файл открывается в браузере (file://),
 *        граф работает (3D и 2D), лог контекста отображается, модалка
 *        режимов открывается. CDN three/d3 недоступен из контейнера —
 *        запросы к cdnjs перехватываются и отдаются ЛОКАЛЬНЫМИ копиями
 *        ТЕХ ЖЕ версий (three@0.128.0, d3@7.8.5).
 *   R5 — тест 5 07 (roundtrip-импорт): НЕИСПОЛНИМ в 4.2 — POST
 *        /syntheses/import создаёт беседа 4.3 (инверсия зафиксирована в
 *        реестре дыр доков; собственный roundtrip-тест 4.3 существует).
 *        Здесь фиксируется отсутствие роута (404) как свидетельство.
 *   R6 — тест 6 07 (edge): exportPNG синтеза без графа → 400
 *        VALIDATION_ERROR (+ mmd/json так же; md/html без графа → 200).
 *   R0 — попутная санитария доступа: 401 без сессии, 403 чужому
 *        непубличному, 404 несуществующему id.
 *
 * Запуск: node tests/test-42-requests2-6.mjs (корень репо; PG+Redis
 * подняты, миграции+3 сида применены; npm i --no-save mermaid
 * three@0.128.0 d3@7.8.5).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import puppeteer from "puppeteer-core";

const SERVER_PORT = 3000;
const MOCK_PORT = 3993;
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

/* ════ Мок Claude API (SSE) — граф 8 узлов / 3 кластера ══════════════ */

const mockStats = { totalCalls: 0, modeCalls: 0 };

function chunkify(s, n) {
  const out = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

// Ровно 8 узлов (требование теста 2)
const N42 = [
  "Опосредованная тотальность",   // 0: ядро, синтез, кластеры I+II (копии в MMD)
  "Трансцендентальное единство",  // 1: генеративная, тезис, I
  "Диалектическое снятие",        // 2: мост, антитезис, I
  "Вещь в себе",                  // 3: центральная, тезис, II
  "Историчность разума",          // 4: периферийная, антитезис, II
  "Категорический императив",     // 5: периферийная, тезис, III
  "Автономия воли",               // 6: периферийная, антитезис, III
  "Синтетическое априори",        // 7: периферийная, тезис, III
];
const TYPES42 = [
  "Онтологическая", "Эпистемологическая", "Онтологическая / Эпистемологическая",
  "Метафизическая", "Эпистемологическая", "Этическая", "Этическая", "Эпистемологическая",
];
const CLUSTERS42 = [
  "I — Основания / II — Развёртывание", "I — Основания", "I — Основания",
  "II — Развёртывание", "II — Развёртывание",
  "III — Практика", "III — Практика", "III — Практика",
];
const STRUCT42 = ["ядро", "генеративная", "мост", "центральная",
  "периферийная", "периферийная", "периферийная", "периферийная"];
const PROC42 = ["синтез", "тезис", "антитезис", "тезис",
  "антитезис", "тезис", "антитезис", "тезис"];

// Рёбра: разные типы (для dash/цветов), «Двунаправленная» и «Рефлексивная»
const EDGES42 = [
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

/** Каркас раздела формата системного промпта (моки 2.3/4.1 его опускали —
 *  для saveMD/sec2md он обязателен: .section-num/.section-title/.doc-content) */
function wrapSection(num, title, inner) {
  return `<div class="doc-section"><div class="section-num">§ ${num}</div>` +
    `<div class="section-title">${title}</div><div class="doc-content">${inner}</div></div>`;
}

function graphHtml42() {
  const nodeRows = N42.map((n, i) =>
    `<tr><td>${n}</td><td>${TYPES42[i]}</td>` +
    `<td>Определение категории «${n}» в синтезе.</td><td>0.${9 - (i % 5)}</td><td>0.${8 - (i % 4)}</td>` +
    `<td>${i % 2 ? "Гегель" : "Кант"}</td></tr>`).join("");
  const edgeRows = EDGES42.map(([s, t, type, desc, dir, str]) =>
    `<tr><td>${N42[s]}</td><td>${desc}</td><td>${N42[t]}</td>` +
    `<td>${type}</td><td>${dir}</td><td>${str}</td></tr>`).join("");
  const topo = N42.map((n, i) =>
    `<tr><td>${n}</td><td>${CLUSTERS42[i]}</td><td>${STRUCT42[i]}</td><td>${PROC42[i]}</td></tr>`).join("");
  return wrapSection(2, "Граф категорий",
    `<div data-section="Методология построения графа"><h4>Методология построения графа</h4><p>Граф построен диалектически.</p></div>` +
    `<div data-section="Таблица категорий"><h4>Таблица категорий</h4><table class="doc-table"><thead><tr><th>Категория</th><th>Тип</th><th>Определение</th><th>Центральность</th><th>Определённость</th><th>Происхождение</th></tr></thead><tbody>${nodeRows}</tbody></table></div>` +
    `<div data-section="Таблица связей"><h4>Таблица связей</h4><table class="doc-table"><thead><tr><th>Источник</th><th>Описание</th><th>Цель</th><th>Тип</th><th>Направленность</th><th>Сила</th></tr></thead><tbody>${edgeRows}</tbody></table></div>` +
    `<div data-section="Топология графа"><h4>Топология графа</h4><div data-section="Топологическая таблица"><table class="doc-table"><thead><tr><th>Категория</th><th>Кластер</th><th>Структурные роли</th><th>Процессуальные роли</th></tr></thead><tbody>${topo}</tbody></table></div></div>`);
}

function thesesHtml() {
  const rows = N42.slice(0, 6).map((n, i) =>
    `<tr><td>${i + 1}</td><td>Тезис о том, что ${n.toLowerCase()} образует ядро синтеза.</td>` +
    `<td>${["онтол.", "эпистем.", "этич."][i % 3]}</td><td>высокая</td><td>${n}, ${N42[(i + 1) % 8]}</td></tr>`).join("");
  return wrapSection(3, "Корпус тезисов",
    `<div data-section="Онтологические тезисы"><h4>Онтологические тезисы</h4><p><strong>Тезис о том, что ${N42[0].toLowerCase()} образует ядро синтеза.</strong> Обоснование.</p></div>` +
    `<div data-section="Сводная таблица тезисов"><h4>Сводная таблица тезисов</h4><table class="doc-table"><thead><tr><th>№</th><th>Формулировка тезиса</th><th>Тип</th><th>Степень новизны</th><th>Связанные категории</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

function capsuleHtml42() {
  return wrapSection(9, "Капсула концепции",
    `<div data-section="Капсула концепции"><h4>Капсула концепции</h4><p>Капсула: опосредованная тотальность соединяет кантовскую архитектонику с гегелевским движением понятия.</p></div>`);
}

function critiqueHtml42() {
  const rows = N42.slice(0, 4).map((n, i) =>
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

function modeHtml(kind, param) {
  const nonce = ++mockStats.modeCalls;
  if (kind === "adversarial") {
    return `<div class="doc-content"><h4>Фундаментальное расхождение</h4>` +
      `<p>Контр-документ с позиции «${param}» (прогон ${nonce}): синтез несостоятелен изнутри данной традиции.</p>` +
      `<h4>Итоговый вердикт</h4><p>Синтез не выдерживает критики с позиции «${param}».</p></div>`;
  }
  return `<div class="doc-content"><h4>Реакция</h4><p>Позиция «${param}» (прогон ${nonce}).</p></div>`;
}

function pickHtml(prompt) {
  if (prompt.includes("философ-оппонент")) {
    const m = prompt.match(/позицию:\s*([^.\n]+)\./);
    return modeHtml("adversarial", m ? m[1].trim() : "?");
  }
  const task = prompt.slice(Math.max(0, prompt.lastIndexOf("ЗАДАНИЕ")));
  if (/ТОЛЬКО секцию/.test(prompt)) return sumHtml();
  // Специфичные маркеры — ПЕРЕД общим корнем «критическ»: задание графа
  // может упоминать критический анализ (перехват поймал прогон 1)
  if (task.includes("Таблица категорий")) return graphHtml42();
  if (task.includes("Сводная таблица") && /тезис/i.test(task)) return thesesHtml();
  if (task.includes("«Капсула»")) return capsuleHtml42();
  if (/критическ/i.test(task)) return critiqueHtml42();
  return sumHtml();
}

function startMock() {
  const srv = http.createServer((req, res) => {
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

/* ════ Сервер / auth / WS (по test-41) ═══════════════════════════════ */

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
      CLIENT_ORIGIN: "http://127.0.0.1:5199",
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

async function makeUser(tag) {
  const email = `t42-${tag}-${Date.now()}@test.local`;
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

/** GET экспорта: сырое тело + заголовки */
async function apiRaw(auth, p) {
  const r = await fetch(`${API}${p}`, { headers: { cookie: auth.cookieHeader } });
  const buf = Buffer.from(await r.arrayBuffer());
  return {
    status: r.status,
    type: r.headers.get("content-type") ?? "",
    disp: r.headers.get("content-disposition") ?? "",
    buf,
    text: buf.toString("utf8"),
  };
}

async function makeSynthesis(auth, conn, sections, tag) {
  const p = await api(auth, "POST", "/syntheses", {
    seed: `Экспортный синтез ${tag}`,
    philosophers: ["Кант", "Гегель"],
    sections,
    method: "dialectical", depth: "overview", synthLevel: "comparative",
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

const norm = (s) => s.replace(/[\s\u00a0]+/g, " ");
const has = (hay, needle) => norm(String(hay)).toLowerCase().includes(needle.toLowerCase());

/* ════════════════════════════════════════════════════════════════════ */

let mockSrv, browser;

try {
  mockSrv = await startMock();
  await startServer();
  console.log("Мок и сервер подняты.");

  const A = await makeUser("owner");
  const cA = wsConnect(A.token);
  await cA.open();

  console.log("\n■ Подготовка: S1 (граф 8/3 + капсула + режим), S2 (без графа)");
  const S1 = await makeSynthesis(A, cA, ["capsule", "theses", "critique", "graph"], "S1");
  // Режим для секции режимов в exportHTML
  const run = await api(A, "POST", `/syntheses/${S1}/modes/adversarial/run`, { param: "Кант" });
  ok(run.status === 200 || run.status === 202, "POST modes/adversarial/run «Кант» принят", `status=${run.status}`);
  let modeReady = false;
  for (let i = 0; i < 100; i++) {
    const m = await api(A, "GET", `/syntheses/${S1}/modes/adversarial`);
    if ((m.body?.results?.length ?? 0) >= 1 && m.body.results[0].htmlContent) { modeReady = true; break; }
    await sleep(500);
  }
  ok(modeReady, "mode_results: результат режима сгенерирован");

  const S2 = await makeSynthesis(A, cA, ["capsule", "theses", "critique"], "S2");
  cA.close();

  /* ════ R0: санитария доступа ════ */
  console.log("\n■ R0: доступ к /export/*");
  {
    const r401 = await fetch(`${API}/syntheses/${S1}/export/mmd`);
    ok(r401.status === 401, "без сессии → 401", `status=${r401.status}`);
    const B = await makeUser("stranger");
    const r403 = await api(B, "GET", `/syntheses/${S1}/export/mmd`);
    ok(r403.status === 403, "чужой непубличный → 403", `status=${r403.status}`);
    const r404 = await api(A, "GET", `/syntheses/00000000-0000-0000-0000-000000000000/export/mmd`);
    ok(r404.status === 404, "несуществующий id → 404", `status=${r404.status}`);
  }

  /* ════ R2: тест 2 07 — exportMMD, 8 узлов / 3 кластера ════ */
  console.log("\n■ R2 (тест 2): exportMMD — граф 8 узлов, 3 кластера");
  const mmdR = await apiRaw(A, `/syntheses/${S1}/export/mmd`);
  ok(mmdR.status === 200 && mmdR.type.startsWith("text/plain"),
    "GET /export/mmd → 200 text/plain", `${mmdR.status} ${mmdR.type}`);
  ok(/attachment; filename=".+\.mmd"/.test(mmdR.disp),
    "Content-Disposition attachment *.mmd", mmdR.disp);
  const mmd = mmdR.text;
  fs.writeFileSync("/tmp/export-42.mmd", mmd);
  ok(mmd.startsWith("graph TD"), "начинается с graph TD");
  const subgraphs = [...mmd.matchAll(/subgraph CL(\d+)\[/g)].map((m) => m[1]);
  ok(subgraphs.length === 3 && new Set(subgraphs).size === 3,
    "3 субграфа-кластера", `CL: ${subgraphs.join(",")}`);
  ok(has(mmd, "I — Основания") && has(mmd, "II — Развёртывание") && has(mmd, "III — Практика"),
    "метки кластеров из cluster_labels");
  // 8 узлов: базовые индексы N0..N7 (мульти-кластерный — копиями N?_0/N?_1)
  const baseIdx = new Set([...mmd.matchAll(/\bN(\d+)(?:_\d+)?[[({>{]/g)].map((m) => m[1]));
  ok(baseIdx.size === 8, "8 узлов объявлено", `базовых индексов: ${baseIdx.size}`);
  const copies = [...mmd.matchAll(/\bN(\d+)_(\d+)/g)];
  ok(copies.length > 0, "мульти-кластерный узел развёрнут в копии N{i}_{c}");
  ok(/N\d+_\d+ --- N\d+_\d+/.test(mmd), "связь между копиями (---)");
  ok(/-->\|"[^"]* ↺"\|/.test(mmd), "рефлексивная петля с ↺");
  ok(/<-->\|"/.test(mmd), "двунаправленное ребро <-->");
  ok(/\{\{"`/.test(mmd), "гексагон синтеза ({{…}})");
  ok(/linkStyle \d+ stroke:#/.test(mmd), "linkStyle рёбер с цветом");
  ok(/stroke-dasharray:3\b/.test(mmd), "слабое ребро (str<0.3) — пунктир");
  ok(/classDef t\d+ fill:#/.test(mmd), "classDef типов объявлены");
  ok(!/\n\s*class N/.test(mmd), "строк class нет (квирк исходника сохранён)");
  ok(/style N\d+ stroke-width:[\d.]+px,fill-opacity:[\d.]+/.test(mmd),
    "per-node style (центральность/определённость)");
  ok(/style CL\d+ fill:#[0-9a-f]{6},fill-opacity:0\.08/.test(mmd), "стили субграфов CPAL");

  // Валидность тем же движком mermaid (адаптация mermaid.live)
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  {
    const page = await browser.newPage();
    await page.setContent("<!DOCTYPE html><html><body><div id='m'></div></body></html>");
    await page.addScriptTag({ path: path.join(ROOT, "node_modules/mermaid/dist/mermaid.min.js") });
    const res = await page.evaluate(async (src) => {
      try {
        window.mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
        const p = await window.mermaid.parse(src);
        const r = await window.mermaid.render("g42", src);
        return { parsed: !!p, svg: r.svg.length, err: null };
      } catch (e) {
        return { parsed: false, svg: 0, err: String(e) };
      }
    }, mmd);
    ok(res.parsed, "mermaid.parse: диаграмма валидна", res.err ?? "");
    ok(res.svg > 5000, "mermaid.render: SVG отрисован", `svg=${res.svg} симв.`);
    await page.close();
  }

  /* ════ R3: тест 3 07 — exportJSON — структура по спецификации ════ */
  console.log("\n■ R3 (тест 3): exportJSON — структура meta/nodes/edges/clusters");
  const jr = await apiRaw(A, `/syntheses/${S1}/export/json`);
  ok(jr.status === 200 && jr.type.startsWith("application/json"),
    "GET /export/json → 200 application/json", `${jr.status} ${jr.type}`);
  const j = JSON.parse(jr.text);
  ok(j.meta?.format === "PhiloSynth Graph" && j.meta?.version === 1,
    'meta.format="PhiloSynth Graph", version=1');
  ok(typeof j.meta?.exported === "string" && !Number.isNaN(Date.parse(j.meta.exported)),
    "meta.exported — ISO-дата");
  ok(typeof j.meta?.document === "string" && j.meta.document.length > 0,
    "meta.document = docNum", String(j.meta?.document));
  ok(Array.isArray(j.nodes) && j.nodes.length === 8, "nodes: 8 узлов", `len=${j.nodes?.length}`);
  const n0 = j.nodes.find((n) => n.name === N42[0]);
  ok(!!n0 && ["type", "definition", "centrality", "certainty", "origin", "roles", "clusters"]
    .every((k) => k in n0), "поля узла по спецификации");
  ok(n0.roles.structural.includes("core") && n0.roles.procedural.includes("synthesis"),
    "роли нормализованы (core/synthesis)", JSON.stringify(n0?.roles));
  ok(n0.clusters.length === 2 && n0.clusters.every((c) => typeof c.index === "number" && c.label),
    "мульти-кластерный узел: 2 кластера с label", JSON.stringify(n0?.clusters));
  ok(Array.isArray(j.edges) && j.edges.length === EDGES42.length,
    `edges: ${EDGES42.length} рёбер`, `len=${j.edges?.length}`);
  const er = j.edges.find((e) => e.direction === "рефлексивная");
  ok(!!er && er.source === er.target, "рефлексивное ребро source===target");
  ok(j.edges.every((e) => ["source", "target", "type", "description", "direction", "strength"]
    .every((k) => k in e)), "поля ребра по спецификации");
  ok(Array.isArray(j.clusters) && j.clusters.length === 3, "clusters: 3", `len=${j.clusters?.length}`);
  const cl0 = j.clusters.find((c) => c.label.includes("Основания"));
  ok(!!cl0 && cl0.members.includes(N42[0]) && cl0.members.includes(N42[1]),
    "members кластера заполнены", JSON.stringify(cl0?.members));

  /* ════ R4: тест 4 07 — exportHTML в браузере ════ */
  console.log("\n■ R4 (тест 4): exportHTML — файл в браузере, граф 3D/2D, лог, режимы");
  const hr = await apiRaw(A, `/syntheses/${S1}/export/html`);
  ok(hr.status === 200 && hr.type.startsWith("text/html"),
    "GET /export/html → 200 text/html", `${hr.status} ${hr.type}`);
  ok(/filename\*=UTF-8''/.test(hr.disp), "Content-Disposition с RFC5987-именем", hr.disp);
  const htmlText = hr.text;
  const HTML_PATH = "/tmp/export-42.html";
  fs.writeFileSync(HTML_PATH, htmlText);
  console.log(`  (файл: ${HTML_PATH}, ${Math.round(htmlText.length / 1024)} КБ)`);

  // Серверные проверки содержимого
  ok(htmlText.includes('id="philosynth-state"'), "embedded state присутствует");
  const stateJson = htmlText.match(/<script type="application\/json" id="philosynth-state">\n([\s\S]*?)\n<\/script>/);
  let state = null;
  try { state = JSON.parse(stateJson?.[1] ?? ""); } catch { /* провалит ok ниже */ }
  ok(!!state && state.version === 2, "state.version = 2");
  ok(state?.genLog?.length > 0 && state?.ctxLog?.length > 0, "genLog/ctxLog встроены",
    `gen=${state?.genLog?.length} ctx=${state?.ctxLog?.length}`);
  ok(state?.genLog?.every((g) => !("sys" in (g.metadata ?? {})) && !("promptSkeleton" in (g.metadata ?? {}))),
    "metadata без sys/promptSkeleton (паритет среза)");
  ok(state?.params?.method === "dialectical" && Array.isArray(state?.sectionOrder),
    "params и sectionOrder встроены");
  ok(state?.genealogy?.participants?.some((p) => p.name === "Кант"),
    "genealogy построена из lineage");
  ok(htmlText.includes('id="gmOverlay"') && htmlText.includes("three.min.js") && htmlText.includes("d3.min.js"),
    "граф-секция: модалка + CDN three/d3");
  ok(htmlText.includes("▦ Граф категорий"), "кнопка «▦ Граф категорий» в разделе графа");
  ok(htmlText.includes('id="philosynth-modes"') && htmlText.includes("openExportedMode"),
    "секция режимов: данные + скрипт");
  ok(htmlText.includes("◈ Лог контекста и генерации") && htmlText.includes('id="philosynth-log-raw"'),
    "видимый лог: details + pre");
  ok(htmlText.includes("<style>") && /\.doc-header\b/.test(htmlText),
    "CSS после auditCSS содержит используемые правила");
  ok(!/\.pause-modal\b[^}]*\{/.test(htmlText.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? ""),
    "auditCSS удалил классы, отсутствующие в контенте (.pause-modal)");

  // Браузер: file:// + перехват CDN → локальные копии тех же версий
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000 });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    page.on("console", (m) => {
      // «Failed to load resource» — следствие нашего же req.abort()
      // (fonts.googleapis и пр.); ошибкой файла не является
      if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
        pageErrors.push("console: " + m.text());
    });
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("three.min.js")) {
        req.respond({ status: 200, contentType: "application/javascript",
          body: fs.readFileSync(path.join(ROOT, "node_modules/three/build/three.min.js")) });
      } else if (u.includes("d3.min.js")) {
        req.respond({ status: 200, contentType: "application/javascript",
          body: fs.readFileSync(path.join(ROOT, "node_modules/d3/dist/d3.min.js")) });
      } else if (u.startsWith("file://")) {
        req.continue();
      } else {
        req.abort(); // fonts.googleapis и прочее — офлайн
      }
    });

    await page.goto("file://" + HTML_PATH, { waitUntil: "domcontentloaded" });
    await sleep(800); // DOMContentLoaded-хук parseGraph

    const head = await page.evaluate(() => document.body.innerText.slice(0, 4000));
    ok(has(head, "PhiloSynth Pro"), "шапка документа отрисована");
    // 4 раздела тела: sum + graph + theses + critique (капсула — в шапке);
    // подразделы — div[data-section] ВНУТРИ doc-content (каркас сис-промпта)
    const secCount = await page.$$eval(".doc-section", (els) => els.length);
    const subCount = await page.$$eval(".doc-content div[data-section]", (els) => els.length);
    ok(secCount === 4 && subCount >= 10, "разделы и подразделы документа на месте",
      `doc-section: ${secCount}, подразделов: ${subCount}`);

    // Лог контекста
    const logShown = await page.evaluate(() => {
      const pre = document.getElementById("philosynth-log-raw");
      if (!pre) return null;
      pre.closest("details").open = true;
      return pre.innerText;
    });
    ok(!!logShown && has(logShown, "ЛОГ КОНТЕКСТА И ГЕНЕРАЦИИ") && has(logShown, "ОБЩИЕ ЭЛЕМЕНТЫ ПРОМПТА"),
      "лог контекста отображается (шапка + общие элементы)");
    ok(/<span style="color:/.test(await page.evaluate(() =>
      document.getElementById("philosynth-log-raw")?.innerHTML ?? "")),
      "лог раскрашен colorizeLog");

    // Граф: открыть модалку → 3D
    ok(await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Граф категорий"));
      if (!btn) return false;
      btn.click();
      return true;
    }), "клик «▦ Граф категорий»");
    await page.waitForFunction(
      () => document.getElementById("gmOverlay")?.classList.contains("visible"),
      { timeout: 10000 },
    );
    ok(true, "gm-оверлей открылся (openGraph)");
    await sleep(2500); // build3D: warmup + первый кадр
    const view3d = await page.evaluate(() => ({
      canvas: !!document.querySelector("#view3d canvas"),
      legend: (document.getElementById("gmLegend")?.innerText ?? "").length,
      hint: document.getElementById("gmHint")?.innerText ?? "",
    }));
    ok(view3d.canvas, "3D: canvas Three.js создан (WebGL/swiftshader)");
    ok(view3d.legend > 100 && has(await page.evaluate(() => document.getElementById("gmLegend").innerText), "ТИПЫ КАТЕГОРИЙ"),
      "легенда построена (buildLegend)", `len=${view3d.legend}`);

    // 2D
    await page.evaluate(() => document.getElementById("tab2d").click());
    await sleep(1500);
    const view2d = await page.evaluate(() => {
      const svg = document.querySelector("#view2d svg");
      return {
        svg: !!svg,
        nodes: svg ? svg.querySelectorAll("path, circle").length : 0,
        labels: svg ? svg.querySelectorAll("text").length : 0,
      };
    });
    ok(view2d.svg && view2d.nodes >= 8, "2D: d3-svg с узлами", JSON.stringify(view2d));
    ok(view2d.labels >= 8, "2D: подписи узлов", `text=${view2d.labels}`);

    // Экспорт-меню внутри файла: exportMMD исполняется без ошибок
    await page.evaluate(() => {
      document.querySelector("#exportWrap .gm-btn.gold").click();
      const items = [...document.querySelectorAll(".gm-export-item")];
      items.find((b) => b.textContent.trim() === "MMD")?.click();
    });
    await sleep(600);

    // Закрыть граф, открыть режимы
    await page.evaluate(() => window.closeGraph());
    ok(await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Оппонент"));
      if (!btn) return false;
      btn.click();
      return true;
    }), "клик кнопки режима «⚔ Оппонент (1)»");
    await page.waitForFunction(
      () => document.getElementById("modeOverlay")?.classList.contains("visible"),
      { timeout: 5000 },
    );
    const modeShown = await page.evaluate(() => ({
      title: document.getElementById("modeTitle")?.innerText ?? "",
      content: document.getElementById("modeContent")?.innerText ?? "",
      tabs: document.querySelectorAll("#modeTabsBar .mode-tab").length,
      info: document.getElementById("modeInfo")?.innerText ?? "",
    }));
    ok(has(modeShown.title, "Оппонент"), "модалка режима: заголовок");
    ok(has(modeShown.content, "Контр-документ") && has(modeShown.content, "Кант"),
      "модалка режима: контент результата");
    ok(modeShown.tabs === 1 && has(modeShown.info, "Кант"), "вкладка и инфо-строка",
      JSON.stringify({ tabs: modeShown.tabs, info: modeShown.info }));
    await page.evaluate(() => window.closeModeModal());

    ok(pageErrors.length === 0, "ноль ошибок страницы за весь сценарий",
      pageErrors.slice(0, 3).join(" | "));
    await page.close();
  }

  /* ════ R5: тест 5 07 — roundtrip-импорт (НЕИСПОЛНИМ до 4.3) ════ */
  console.log("\n■ R5 (тест 5): roundtrip-импорт — неисполним в 4.2 (инверсия 4.2←4.3)");
  {
    const r = await api(A, "POST", "/syntheses/import", {});
    ok(r.status === 404, "POST /syntheses/import отсутствует (роут — беседа 4.3) → 404",
      `status=${r.status}`);
    console.log("  → покрытие сохраняется: первый тестовый запрос беседы 4.3 — тот же roundtrip");
  }

  /* ════ R6: тест 6 07 — edge case: синтез без графа ════ */
  console.log("\n■ R6 (тест 6): exportPNG без графа → 400 (и смежные форматы)");
  {
    const png = await api(A, "GET", `/syntheses/${S2}/export/png`);
    ok(png.status === 400 && png.body?.code === "VALIDATION_ERROR" && has(png.body?.error, "Нет графа"),
      "PNG без графа → 400 VALIDATION_ERROR «Нет графа.»", JSON.stringify(png.body));
    const mmd2 = await api(A, "GET", `/syntheses/${S2}/export/mmd`);
    ok(mmd2.status === 400 && mmd2.body?.code === "VALIDATION_ERROR",
      "MMD без графа → 400 VALIDATION_ERROR");
    const json2 = await api(A, "GET", `/syntheses/${S2}/export/json`);
    ok(json2.status === 400 && json2.body?.code === "VALIDATION_ERROR",
      "JSON без графа → 400 VALIDATION_ERROR");
    const md2 = await apiRaw(A, `/syntheses/${S2}/export/md`);
    ok(md2.status === 200 && md2.type.startsWith("text/markdown") && md2.text.startsWith("# "),
      "MD без графа → 200 (документ не требует графа)");
    ok(has(md2.text, "PhiloSynth Pro™ · Документ сгенерирован Claude AI"),
      "MD: подпись хвоста");
    const html2 = await apiRaw(A, `/syntheses/${S2}/export/html`);
    ok(html2.status === 200 && !html2.text.includes('id="gmOverlay"'),
      "HTML без графа → 200, граф-секция отсутствует");
    ok(html2.text.includes("◈ Лог контекста и генерации"),
      "HTML без графа: лог на месте");
  }

  // PNG на S1 — валидный файл (дополнение к смоуку запроса 1: теперь из БД)
  const pngR = await apiRaw(A, `/syntheses/${S1}/export/png`);
  ok(pngR.status === 200 && pngR.type === "image/png" &&
    pngR.buf[0] === 0x89 && pngR.buf[1] === 0x50 && pngR.buf.length > 50_000,
    "PNG с графом → 200 image/png, валидная сигнатура",
    `${pngR.status} ${pngR.type} ${pngR.buf.length} байт`);
  fs.writeFileSync("/tmp/export-42.png", pngR.buf);

  // MD на S1 — таблицы/структура
  const mdR = await apiRaw(A, `/syntheses/${S1}/export/md`);
  ok(mdR.status === 200 && has(mdR.text, "| Параметр | Значение |") &&
    /^## § \d+ — /m.test(mdR.text) && has(mdR.text, "| Документ № |"),
    "MD с графом: шапка-таблица и разделы ##");
} catch (e) {
  failed++;
  fails.push("КРАХ: " + String(e).slice(0, 300));
  console.error("\nКРАХ ПРОГОНА:", e);
  console.error("server tail:", serverLog.slice(-1500));
} finally {
  if (browser) await browser.close().catch(() => {});
  serverProc?.kill("SIGKILL");
  mockSrv?.close();
}

console.log(`\n══ ИТОГ: ${passed} ✓, ${failed} ✗`);
if (fails.length) {
  console.log("Провалы:");
  for (const f of fails) console.log("  ✗ " + f);
  process.exit(1);
}
process.exit(0);
