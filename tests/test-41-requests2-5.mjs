/**
 * Беседа 4.1 — тестовые запросы 2–5 протокола (07, «Последующие
 * запросы») одним заходом, по команде пользователя.
 *
 * Харнесс: живой сервер (:3000) + vite dev :5199 + PG/Redis + мок
 * Claude API (SSE; контент по test-23 + ветки капсулы/критики/режимов) +
 * puppeteer-core с системным Chrome.
 *
 *   R0 — API-санитария §2.7 до браузера: пустые /modes, warnings/
 *        estimate в GET /modes/:modeKey, 404 неизвестного режима,
 *        400 пустого param, 403 чужому, 404 вне диапазона DELETE.
 *   R2 — тест 2 07: страница S1 (с капсулой) → «◈ Оппонент» → модалка →
 *        «Кант» → генерация (⟳-вкладка, live-контент) → результат во
 *        вкладке → закрыть/открыть — вкладка сохранена; счётчик на
 *        кнопке; БД: mode_results/genLog source='mode'/version_modes.
 *   R3 — тест 3 07: ещё 2 запуска («Маркс», «Постмодернизм») → 3
 *        вкладки → переключение на «Кант» → удаление средней («Маркс»,
 *        confirm) → 2 вкладки; БД: 2 строки в порядке created_at.
 *   R4 — тест 4 07: синтез S2 БЕЗ capsule → checkModeDeps через
 *        GET /modes/adversarial: error-предупреждения про капсулу и
 *        критический анализ. АДАПТАЦИЯ против буквы 07: в UI вход в
 *        модалку без капсулы скрыт (порт updateModeButtons [11799] —
 *        кнопки режимов видны только при капсуле, как в исходнике),
 *        поэтому предупреждение «без capsule» проверяется на
 *        API-уровне; ОТОБРАЖЕНИЕ предупреждений в модалке проверяется
 *        на S3 (капсула есть, critique/graph нет → ⚠ error + 💡 info).
 *   R5 — тест 5 07: оценка estimateModeCost отображается в ModeModal
 *   R6 — долг §12 (закрыт): панель «РЕЖИМЫ» EditModal [18556–18620] —
 *        карточки, взаимоисключение чекбоксов, план modeRegen+modeRemove
 *        → исполнение (UPDATE с сохранением created_at, genLog
 *        mode_cascade, refetch панели, счётчик кнопки).
 *   R7 — долг §12 (закрыт): подраздельный каскад режимов — волна →
 *        confirm со списком и оценкой [19022] → тихая перегенерация
 *        затронутых результатов с ИХ param (отступление: исходник звал
 *        runMode() с param из поля модалки [19034], «нужен fallback»).
 *        «≈ $X.XXXX (~NK вх. + ~MK вых.)» и совпадает с API-оценкой.
 *
 * Запуск: node tests/test-41-requests2-5.mjs (корень репо; PG+Redis
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
const CHROME = process.env.CHROME_PATH ?? "/opt/google/chrome/chrome";

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

/* ════ Мок Claude API (SSE; разделы — по test-23, + режимы) ══════════ */

const mockStats = { totalCalls: 0, modeCalls: 0 };

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

function thesesHtml() {
  const nonce = mockStats.totalCalls;
  const rows = NODE_NAMES.slice(0, 6).map((n, i) =>
    `<tr><td>${i + 1}</td><td>Тезис о том, что ${n.toLowerCase()} образует ядро синтеза (v${nonce}).</td>` +
    `<td>${["онтол.", "эпистем.", "этич."][i % 3]}</td><td>высокая</td><td>${n}, ${NODE_NAMES[(i + 1) % 10]}</td></tr>`).join("");
  return `<div class="doc-section" data-section="Онтологические тезисы"><p><strong>Тезис о том, что ${NODE_NAMES[0].toLowerCase()} образует ядро синтеза.</strong> Обоснование (v${nonce}).</p></div>` +
    `<div class="doc-section" data-section="Сводная таблица тезисов"><table class="doc-table"><thead><tr><th>№</th><th>Формулировка тезиса</th><th>Тип</th><th>Степень новизны</th><th>Связанные категории</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function capsuleHtml41() {
  const nonce = mockStats.totalCalls;
  return `<div class="doc-section" data-section="Капсула концепции"><p>Капсула: синтез трансцендентального единства и диалектического снятия (v${nonce}). Концепция соединяет кантовскую архитектонику с гегелевским движением понятия. Итог — категориальный аппарат опосредованной тотальности.</p></div>`;
}

function critiqueHtml41() {
  const nonce = mockStats.totalCalls;
  const rows = NODE_NAMES.slice(0, 4).map((n, i) =>
    `<tr><td>${n}</td><td>Уязвимость №${i + 1} (v${nonce})</td><td>${i % 2 ? "высокая" : "средняя"}</td></tr>`).join("");
  // data-section «Итоговая оценка» — первичный селектор
  // critique:final_table в context-extractor [789]
  return `<div class="doc-section" data-section="Имманентная критика"><p>Внутренние напряжения синтеза (v${nonce}).</p></div>` +
    `<div class="doc-section" data-section="Итоговая оценка"><table class="doc-table"><thead><tr><th>Категория</th><th>Уязвимость</th><th>Серьёзность</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function sumHtml() {
  const nonce = mockStats.totalCalls;
  return `<div class="doc-section" data-section="Цели и задачи"><p>Цель синтеза — соединить традиции (v${nonce}).</p></div>` +
    `<div class="doc-section" data-section="Точки напряжения"><p>Напряжение между конечностью рассудка и тотальностью духа.</p></div>` +
    `<div class="doc-section" data-section="Методологическая рамка"><p>Метод — диалектическое снятие.</p></div>`;
}

/** Контр-документ/перевод/срез — маркер режима в промпте задаёт ветку */
function modeHtml(kind, param) {
  const nonce = ++mockStats.modeCalls;
  if (kind === "adversarial") {
    return `<div class="doc-content"><h4>Фундаментальное расхождение</h4>` +
      `<p>Контр-документ с позиции «${param}» (прогон ${nonce}): синтез несостоятелен изнутри данной традиции.</p>` +
      `<h4>Контр-тезисы</h4><p>Альтернативные утверждения по каждому тезису синтеза.</p>` +
      `<h4>Итоговый вердикт</h4><p>Синтез не выдерживает критики с позиции «${param}».</p></div>`;
  }
  if (kind === "translator") {
    return `<div class="doc-content"><h4>Таблица перевода терминов</h4>` +
      `<table class="doc-table"><thead><tr><th>Термин</th><th>Аналог в «${param}»</th><th>Точность</th></tr></thead>` +
      `<tbody><tr><td>${NODE_NAMES[0]}</td><td>аналог-${nonce}</td><td>7</td></tr></tbody></table>` +
      `<h4>Непереводимые элементы</h4><p>Часть категорий непереводима в «${param}».</p></div>`;
  }
  return `<div class="doc-content"><h4>Первая реакция</h4>` +
    `<p>Мыслители периода «${param}» восприняли бы концепцию с недоумением (прогон ${nonce}).</p>` +
    `<h4>Подлинная новизна</h4><p>Категориальная тотальность вне горизонта эпохи.</p></div>`;
}

function pickHtml(prompt) {
  // Режимы — ПЕРВЫМИ: их промпт несёт КОНТЕКСТ с текстом других разделов
  if (prompt.includes("философ-оппонент")) {
    const m = prompt.match(/позицию:\s*([^.\n]+)\./);
    return modeHtml("adversarial", m ? m[1].trim() : "?");
  }
  if (prompt.includes("Переведи данную концепцию")) {
    const m = prompt.match(/специалист по \(([^)]+)\)/);
    return modeHtml("translator", m ? m[1].trim() : "?");
  }
  if (prompt.includes("историк философии")) {
    const m = prompt.match(/периоде:\s*([^.\n]+)\./);
    return modeHtml("timeslice", m ? m[1].trim() : "?");
  }
  const task = prompt.slice(Math.max(0, prompt.lastIndexOf("ЗАДАНИЕ")));
  if (/ТОЛЬКО секцию/.test(prompt)) return sumHtml();
  // Капсула — ПЕРВОЙ и по имени секции в ёлочках («Капсула»): её
  // задание содержит «из критического анализа, если доступен» — корень
  // «критическ» перехватил бы её в ветку критики. В задании critique
  // строки «Капсула» в ёлочках нет. Преамбула critique — КАПСОМ
  // («КРИТИЧЕСКИЙ АНАЛИЗ СИНТЕЗА»), сверка регистронезависимая.
  if (task.includes("«Капсула»")) return capsuleHtml41();
  if (/критическ/i.test(task)) return critiqueHtml41();
  if (task.includes("Таблица категорий")) return graphHtml();
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
  const email = `t41-${tag}-${Date.now()}@test.local`;
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

/** Клик по кнопке с префиксным текстом внутри root-селектора */
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

/** Список вкладок модалки: [{label, active, adding}] */
function modeTabs(page) {
  return page.evaluate(() => {
    return [...document.querySelectorAll("#modeTabsBar .mode-tab")].map((b) => ({
      label: b.innerText.replace(/\s+/g, " ").trim(),
      active: b.classList.contains("active"),
      adding: b.classList.contains("adding"),
    }));
  });
}

/** Детерминированная установка значения контролируемого input
 *  (нативный сеттер + событие input → React onChange): triple-click
 *  на занятом поле ненадёжен — прогон дописал «Постмодернизм» к
 *  «Маркс» вместо замены. */
async function setInput(page, sel, value) {
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.evaluate(
    (s, v) => {
      const el = document.querySelector(s);
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(el), "value",
      ).set;
      setter.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    sel, value,
  );
}

/** Полный прогон генерации режима в открытой модалке; ждёт готовую вкладку */
async function runModeInModal(page, param, expectTabs) {
  await setInput(page, "#modeParamInput", param);
  await page.click("#modeRunBtn");
  // ⟳-вкладка на время генерации
  await page.waitForSelector("#modeTabsBar .mode-tab.adding", { timeout: 10000 });
  // Готово: adding исчез, вкладок ожидаемое число
  await page.waitForFunction(
    (n) =>
      !document.querySelector("#modeTabsBar .mode-tab.adding") &&
      document.querySelectorAll("#modeTabsBar .mode-tab").length === n,
    { timeout: 30000 },
    expectTabs,
  );
}

/* ════ Сценарии ══════════════════════════════════════════════════════ */

const sql = postgres(DB_URL, { max: 2, onnotice: () => {} });

async function synthRow(sid) {
  const [r] = await sql`
    SELECT section_order, status, capsule_html, version_modes, version_mode_regen
    FROM syntheses WHERE id = ${sid}`;
  return r;
}
async function modeRows(sid, mk) {
  return sql`
    SELECT param_value, html_content, input_tokens, output_tokens, cost_usd
    FROM mode_results WHERE synthesis_id = ${sid} AND mode_key = ${mk}
    ORDER BY created_at ASC`;
}
async function genRows(sid, source) {
  return sql`
    SELECT section_key, section_label, status, output_chars, metadata
    FROM generation_log WHERE synthesis_id = ${sid} AND source = ${source}
    ORDER BY created_at ASC`;
}

/** POST-синтез + ожидание generation_complete */
async function makeSynthesis(auth, conn, sections, tag) {
  const p = await api(auth, "POST", "/syntheses", {
    seed: `Синтез режимов ${tag}`,
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

let mockSrv, browser;

try {
  mockSrv = await startMock();
  await startServer();
  await startVite();
  console.log("Мок, сервер и vite подняты.");

  const A = await makeUser("owner");
  const cA = wsConnect(A.token);
  await cA.open();

  /* ════ Подготовка: S1 с капсулой (для R2/R3/R5) ════ */
  console.log("\n■ Подготовка: S1 = sum + capsule + theses + critique + graph");
  const S1 = await makeSynthesis(A, cA, ["capsule", "theses", "critique", "graph"], "S1");
  const s1 = await synthRow(S1);
  ok(s1.status === "ready" && s1.section_order.length === 5,
    "S1 ready, sectionOrder = sum + 4", `status=${s1.status}`);
  ok(!!s1.capsule_html && s1.capsule_html.includes("Капсула"),
    "capsule_html заполнен (кнопки режимов будут видны)");

  /* ════ R0: API-санитария §2.7 ════ */
  console.log("\n■ R0: API-санитария /modes");
  const m0 = await api(A, "GET", `/syntheses/${S1}/modes`);
  ok(m0.status === 200 && m0.body && typeof m0.body.modes === "object" &&
    Object.keys(m0.body.modes).length === 0,
    "GET /modes до запусков → 200, modes = {}", JSON.stringify(m0.body));

  const mk0 = await api(A, "GET", `/syntheses/${S1}/modes/adversarial`);
  ok(mk0.status === 200 && Array.isArray(mk0.body?.results) && mk0.body.results.length === 0,
    "GET /modes/adversarial → 200, results = []");
  ok(Array.isArray(mk0.body?.warnings) && mk0.body.warnings.length === 0,
    "warnings пусты (capsule/theses/critique в sectionOrder)",
    JSON.stringify(mk0.body?.warnings));
  ok(mk0.body?.estimate && mk0.body.estimate.cost > 0 &&
    mk0.body.estimate.inTokens > 0 && mk0.body.estimate.outTokens > 0,
    "estimate: cost/in/out > 0", JSON.stringify(mk0.body?.estimate));

  const unk = await api(A, "GET", `/syntheses/${S1}/modes/foo`);
  ok(unk.status === 404, "GET неизвестного режима → 404 «Режим не найден»");

  const noParam = await api(A, "POST", `/syntheses/${S1}/modes/adversarial/run`, { param: "  " });
  ok(noParam.status === 400 && noParam.body?.code === "VALIDATION_ERROR" &&
    !!noParam.body?.details?.param,
    "POST run с пустым param → 400 VALIDATION_ERROR details.param");

  const B = await makeUser("stranger");
  const runB = await api(B, "POST", `/syntheses/${S1}/modes/adversarial/run`, { param: "Кант" });
  ok(runB.status === 403, "POST run чужим → 403");
  const readB = await api(B, "GET", `/syntheses/${S1}/modes`);
  ok(readB.status === 403, "GET /modes чужим (непубличный) → 403");

  const delOut = await api(A, "DELETE", `/syntheses/${S1}/modes/adversarial/5`);
  ok(delOut.status === 404, "DELETE вне диапазона → 404");

  /* ════ Браузер ════ */
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error")
      consoleErrors.push("console: " + m.text() + " @ " + (m.location()?.url ?? "?"));
  });
  // Подтверждать confirm() удаления вкладки
  page.on("dialog", (d) => void d.accept());

  await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
  await fill(page, "input[type=email]", A.email);
  await fill(page, "input[type=password]", A.password);
  await page.click("button[type=submit]");
  await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 20000 });

  /* ════ R2: тест 2 07 — «Кант» → генерация → вкладка → persist ════ */
  console.log("\n■ R2: ModeModal adversarial → «Кант» → генерация → вкладка → переоткрытие");
  await page.goto(`${UI}/synthesis/${S1}`, { waitUntil: "domcontentloaded" });
  await waitText(page, "ДОКУМЕНТ СГЕНЕРИРОВАН");
  const bar0 = await page.$eval(".actions-bar", (el) => el.innerText);
  ok(has(bar0, "◈ Оппонент") && has(bar0, "◈ Переводчик") && has(bar0, "◈ Временной срез"),
    "кнопки трёх режимов в actions-bar (hasCapsule)", norm(bar0));

  ok(await clickButtonByText(page, ".actions-bar", "◈ Оппонент"),
    "клик «◈ Оппонент»");
  await page.waitForSelector(".mode-overlay.visible .mode-modal", { timeout: 10000 });
  const mt0 = await pageText(page);
  ok(has(mt0, "⚔ Оппонент"), "заголовок модалки «⚔ Оппонент»");
  ok(has(mt0, "Философ или традиция-оппонент"), "paramLabel виден");
  ok(has(mt0, "Генерирует контр-документ"), "desc в футере (без результатов)");
  const sugCount = await page.$$eval("#modeSuggestions button", (e) => e.length);
  ok(sugCount === 5, "5 кнопок-подсказок", String(sugCount));
  ok((await page.$$eval("#modeTabsBar .mode-tab", (e) => e.length)) === 0,
    "вкладок нет до первого запуска");

  await runModeInModal(page, "Кант", 1);
  ok(true, "генерация прошла: ⟳-вкладка появилась и снялась");
  let tabs = await modeTabs(page);
  ok(tabs.length === 1 && tabs[0].label.includes("Кант") && tabs[0].active,
    "вкладка «Кант» активна", JSON.stringify(tabs));
  const body1 = await page.$eval("#modeBody", (el) => el.innerText);
  ok(has(body1, "Контр-документ с позиции «Кант»"),
    "контент результата — контр-документ мока");
  ok(has(body1, "Фундаментальное расхождение"), "структура контр-документа (h4)");
  const info1 = await page.$eval("#modeInfo", (el) => el.innerText);
  ok(/вх\. \+ .+вых\. · \$/.test(info1), "футер usage «N вх. + M вых. · $c»", info1);

  // Счётчик на кнопке (onResultsChanged → refetch)
  try {
    await page.waitForFunction(
      // .action-btn капсит текст (text-transform: uppercase) — грабля,
      // сверки регистронезависимые
      () => (document.querySelector(".actions-bar")?.innerText ?? "")
        .toLowerCase().includes("оппонент (1)"),
      { timeout: 10000 },
    );
    ok(true, "кнопка «◈ Оппонент (1)» — счётчик обновился");
  } catch {
    const barDbg = await page.$eval(".actions-bar", (el) => el.innerText);
    ok(false, "кнопка «◈ Оппонент (1)» — счётчик обновился",
      "actions-bar=«" + norm(barDbg) + "»");
  }

  // Закрыть → открыть заново: вкладка сохранена
  await clickButtonByText(page, ".mode-modal", "✕ Закрыть");
  await page.waitForFunction(() => !document.querySelector(".mode-overlay"),
    { timeout: 5000 });
  ok(true, "модалка закрылась");
  await clickButtonByText(page, ".actions-bar", "◈ Оппонент");
  await page.waitForSelector(".mode-overlay.visible", { timeout: 10000 });
  await page.waitForFunction(
    () => document.querySelectorAll("#modeTabsBar .mode-tab").length === 1,
    { timeout: 10000 },
  );
  tabs = await modeTabs(page);
  ok(tabs.length === 1 && tabs[0].label.includes("Кант"),
    "после переоткрытия вкладка «Кант» сохранена");
  ok(has(await page.$eval("#modeBody", (el) => el.innerText), "Контр-документ с позиции «Кант»"),
    "контент сохранённого результата отображается");

  // БД после первого запуска
  let rows = await modeRows(S1, "adversarial");
  ok(rows.length === 1 && rows[0].param_value === "Кант" &&
    rows[0].html_content.includes("Контр-документ") &&
    rows[0].input_tokens > 0 && rows[0].output_tokens > 0 && Number(rows[0].cost_usd) > 0,
    "mode_results: 1 строка «Кант», usage > 0");
  let gl = await genRows(S1, "mode");
  ok(gl.length === 1 && gl[0].status === "done" &&
    gl[0].section_key === "mode:adversarial" &&
    gl[0].section_label === "⚔ Оппонент · Кант" &&
    gl[0].output_chars > 0,
    "genLog source='mode': done, label «⚔ Оппонент · Кант»", JSON.stringify(gl[0] ?? null));
  ok(!!gl[0]?.metadata?.promptSkeleton && gl[0]?.metadata?.modeParam === "Кант",
    "metadata: promptSkeleton + modeParam");
  ok((await synthRow(S1)).version_modes === 1, "version_modes = 1");
  const [ctx1] = await sql`
    SELECT entries, req_total, req_found FROM context_log
    WHERE synthesis_id = ${S1} AND section_key = ${"mode:adversarial"}
    ORDER BY created_at DESC LIMIT 1`;
  ok(!!ctx1 && ctx1.req_total === 3 && ctx1.req_found === 3,
    "ctxLog mode:adversarial — required 3/3 (capsule/theses/critique)",
    JSON.stringify(ctx1 ? { req: `${ctx1.req_found}/${ctx1.req_total}` } : null));

  /* ════ R3: тест 3 07 — три запуска, переключение, удаление средней ════ */
  console.log("\n■ R3: 3 запуска adversarial → 3 вкладки → переключение → удаление средней");
  await runModeInModal(page, "Маркс", 2);
  await runModeInModal(page, "Постмодернизм", 3);
  tabs = await modeTabs(page);
  ok(tabs.length === 3 &&
    tabs[0].label.includes("Кант") && tabs[1].label.includes("Маркс") &&
    tabs[2].label.includes("Постмодернизм"),
    "3 вкладки в порядке запусков", JSON.stringify(tabs.map((t) => t.label)));
  ok(tabs[2].active, "активна последняя («Постмодернизм»)");
  ok(has(await page.$eval("#modeBody", (el) => el.innerText), "позиции «Постмодернизм»"),
    "контент — последний результат");

  // Переключение на «Кант»
  await page.evaluate(() => {
    document.querySelectorAll("#modeTabsBar .mode-tab")[0].click();
  });
  await page.waitForFunction(
    () => document.querySelector("#modeBody")?.innerText.includes("позиции «Кант»"),
    { timeout: 5000 },
  );
  ok(true, "переключение вкладок: контент сменился на «Кант»");
  ok(has(await page.$eval("#modeInfo", (el) => el.innerText), "Кант"),
    "футер показывает параметр активной вкладки");

  // Удаление средней («Маркс», index 1) — confirm подтверждается page.on(dialog)
  await page.evaluate(() => {
    document.querySelectorAll("#modeTabsBar .mode-tab")[1]
      .querySelector(".mode-tab-close").click();
  });
  await page.waitForFunction(
    () => document.querySelectorAll("#modeTabsBar .mode-tab").length === 2,
    { timeout: 10000 },
  );
  tabs = await modeTabs(page);
  ok(tabs.length === 2 &&
    tabs[0].label.includes("Кант") && tabs[1].label.includes("Постмодернизм") &&
    !tabs.some((t) => t.label.includes("Маркс")),
    "средняя вкладка «Маркс» удалена, остались Кант и Постмодернизм",
    JSON.stringify(tabs.map((t) => t.label)));

  rows = await modeRows(S1, "adversarial");
  ok(rows.length === 2 && rows[0].param_value === "Кант" &&
    rows[1].param_value === "Постмодернизм",
    "БД: 2 строки в порядке created_at (Кант, Постмодернизм)");
  gl = await genRows(S1, "mode");
  ok(gl.length === 3, "genLog: 3 записи source='mode' (история запусков цела)");
  ok((await synthRow(S1)).version_modes === 3, "version_modes = 3");
  try {
    await page.waitForFunction(
      () => (document.querySelector(".actions-bar")?.innerText ?? "")
        .toLowerCase().includes("оппонент (2)"),
      { timeout: 10000 },
    );
    ok(true, "счётчик на кнопке после удаления: «◈ Оппонент (2)»");
  } catch {
    const barDbg = await page.$eval(".actions-bar", (el) => el.innerText);
    ok(false, "счётчик на кнопке после удаления: «◈ Оппонент (2)»",
      "actions-bar=«" + norm(barDbg) + "»");
  }
  await clickButtonByText(page, ".mode-modal", "✕ Закрыть");

  /* ════ R4: тест 4 07 — checkModeDeps без capsule ════ */
  console.log("\n■ R4: checkModeDeps для синтеза без capsule");
  const S2 = await makeSynthesis(A, cA, ["theses"], "S2-без-капсулы");
  const w2 = await api(A, "GET", `/syntheses/${S2}/modes/adversarial`);
  const warn2 = w2.body?.warnings ?? [];
  ok(w2.status === 200 && warn2.some((w) =>
    w.level === "error" && w.text.includes("Капсула концепции") &&
    w.text.includes("Обязательный контекст")),
    "warnings: error про недоступную «Капсулу концепции»", JSON.stringify(warn2));
  ok(warn2.some((w) => w.level === "error" && w.text.includes("Критический анализ")),
    "warnings: error про «Критический анализ» (critique тоже required)");
  ok(warn2.some((w) => w.level === "info" &&
    w.text.includes("Дополнительный контекст") && w.text.includes("качество может быть снижено")),
    "warnings: info про optional-контекст — текст дословный");
  // Адаптация против буквы 07: в UI кнопки режимов без капсулы скрыты
  // (порт updateModeButtons [11799]) — модалку не открыть, предупреждение
  // «без capsule» живёт на API-уровне; отображение ⚠/💡 — ниже на S3.
  await page.goto(`${UI}/synthesis/${S2}`, { waitUntil: "domcontentloaded" });
  await waitText(page, "ДОКУМЕНТ СГЕНЕРИРОВАН");
  const bar2 = await page.$eval(".actions-bar", (el) => el.innerText);
  ok(!has(bar2, "Оппонент"),
    "кнопки режимов скрыты без капсулы (порт updateModeButtons)", norm(bar2));

  /* Отображение предупреждений в модалке: S3 (капсула есть, critique/graph нет) */
  const S3 = await makeSynthesis(A, cA, ["capsule", "theses"], "S3-предупреждения");
  await page.goto(`${UI}/synthesis/${S3}`, { waitUntil: "domcontentloaded" });
  await waitText(page, "ДОКУМЕНТ СГЕНЕРИРОВАН");
  ok(await clickButtonByText(page, ".actions-bar", "◈ Оппонент"),
    "S3: кнопка режима видна (капсула есть)");
  await page.waitForSelector(".mode-overlay.visible", { timeout: 10000 });
  await page.waitForSelector("#modeDepsWarnings .sec-warning-item", { timeout: 10000 });
  const wUi = await page.evaluate(() => ({
    errors: [...document.querySelectorAll("#modeDepsWarnings .sec-warning-item")]
      .map((e) => e.innerText),
    infos: [...document.querySelectorAll("#modeDepsWarnings .sec-recommend-item")]
      .map((e) => e.innerText),
  }));
  ok(wUi.errors.some((t) => t.includes("Критический анализ")),
    "модалка S3: ⚠ error про «Критический анализ»", JSON.stringify(wUi.errors));
  ok(wUi.infos.length > 0 && wUi.infos.some((t) => t.includes("качество может быть снижено")),
    "модалка S3: 💡 info про optional-контекст", JSON.stringify(wUi.infos));

  /* ════ R5: тест 5 07 — estimateModeCost в ModeModal ════ */
  console.log("\n■ R5: оценка стоимости в ModeModal");
  const est3 = await api(A, "GET", `/syntheses/${S3}/modes/adversarial`);
  const e3 = est3.body?.estimate;
  ok(!!e3 && e3.cost > 0, "API-оценка S3 есть", JSON.stringify(e3));
  const estText = await page.$eval("#modeCostEstimate", (el) => el.innerText);
  const expected = "≈ $" + e3.cost.toFixed(4) + " (~" +
    Math.round(e3.inTokens / 1000) + "K вх. + ~" +
    Math.round(e3.outTokens / 1000) + "K вых.)";
  ok(norm(estText) === norm(expected),
    "формат «≈ $X.XXXX (~NK вх. + ~MK вых.)» совпадает с API-оценкой",
    `ui=«${estText}» api=«${expected}»`);
  // Оценка НЕ зависит от наличия разделов: estimateModeCost считает по
  // СПИСКУ deps из конфига (deps + depth + sysChars), не по факту
  // генерации — S1 и S3 дают одинаковый inTokens (поведение исходника:
  // оценка статическая, реальный контекст урежется на запуске)
  const est1 = await api(A, "GET", `/syntheses/${S1}/modes/adversarial`);
  ok(est1.body?.estimate?.inTokens === e3.inTokens && est1.body.estimate.cost > 0,
    "оценка статическая по конфигу deps: S1 == S3 (квирк исходника)",
    `S1=${est1.body?.estimate?.inTokens} S3=${e3.inTokens}`);
  await clickButtonByText(page, ".mode-modal", "✕ Закрыть");

  /* ════ R6: карточки режимов в EditModal → план → исполнение ════ */
  console.log("\n■ R6: карточки «РЕЖИМЫ» в EditModal → план modeRegen+modeRemove → исполнение");
  // Состояние S1 после R3: adversarial = [Кант(0), Постмодернизм(1)]
  await page.goto(`${UI}/synthesis/${S1}`, { waitUntil: "domcontentloaded" });
  await waitText(page, "ДОКУМЕНТ СГЕНЕРИРОВАН");
  ok(await clickButtonByText(page, ".actions-bar", "✎ Изменить"), "клик «✎ Изменить»");
  await page.waitForSelector(".edit-modal", { timeout: 10000 });
  await page.waitForSelector("#editRegenMode-adversarial-0", { timeout: 10000 });
  const mpText = await page.evaluate(() =>
    document.querySelector(".edit-modal")?.innerText ?? "");
  ok(has(mpText, "РЕЖИМЫ") && has(mpText, "⚔ Оппонент · Кант") &&
    has(mpText, "⚔ Оппонент · Постмодернизм"),
    "панель «РЕЖИМЫ»: карточки обоих результатов с параметрами", norm(mpText).slice(0, 200));

  // Взаимоисключение чекбоксов (паритет серверной валидации)
  await page.click("#editRegenMode-adversarial-0");
  await page.click("#editDeleteMode-adversarial-0");
  ok(!(await page.$eval("#editRegenMode-adversarial-0", (i) => i.checked)),
    "«Удалить» снимает «Перегенерировать» (взаимоисключение)");
  await page.click("#editRegenMode-adversarial-0"); // regen-0 назад (delete-0 снялся)
  ok(!(await page.$eval("#editDeleteMode-adversarial-0", (i) => i.checked)),
    "«Перегенерировать» снимает «Удалить»");
  await page.click("#editDeleteMode-adversarial-1"); // Постмодернизм — удалить
  const fInfo = await page.$eval(".edit-modal-footer", (el) => el.innerText);
  ok(has(fInfo, "2 режим."), "футер: «2 режим.»", norm(fInfo));

  const runSel6 = ".edit-modal-footer .edit-sec-btn.primary";
  ok(await page.$eval(runSel6, (b) => !b.disabled),
    "▶ активна при чисто режимном плане (разделы не отмечены)");
  const kantBefore = (await modeRows(S1, "adversarial"))[0];
  const [kantRow0] = await sql`
    SELECT id, created_at FROM mode_results
    WHERE synthesis_id = ${S1} AND mode_key = 'adversarial'
    ORDER BY created_at ASC LIMIT 1`;
  await page.click(runSel6);
  await waitText(page, "План редактирования", 20000);
  const icons6 = await page.$$eval(".step-icon", (els) => els.map((e) => e.innerText.trim()));
  ok(icons6.length === 2 && icons6.every((i) => i === "●"),
    "план: 2 шага режимов (● ●)", JSON.stringify(icons6));
  ok(await page.$eval(runSel6, (b) => b.innerText.toLowerCase().includes("исполнить")),
    "кнопка перешла в «▶ Исполнить»");
  await page.click(runSel6);
  await page.waitForFunction(
    () => /· done/i.test(document.querySelector(".edit-modal")?.innerText ?? ""),
    { timeout: 120000 },
  );
  ok(true, "план исполнен (· done)");

  rows = await modeRows(S1, "adversarial");
  ok(rows.length === 1 && rows[0].param_value === "Кант",
    "БД: «Постмодернизм» удалён, остался «Кант»", JSON.stringify(rows.map((r) => r.param_value)));
  ok(rows[0].html_content !== kantBefore.html_content &&
    /прогон \d+/.test(rows[0].html_content),
    "html «Канта» заменён (новый прогон мока)");
  const [kantRow1] = await sql`
    SELECT id, created_at FROM mode_results
    WHERE synthesis_id = ${S1} AND mode_key = 'adversarial'
    ORDER BY created_at ASC LIMIT 1`;
  ok(kantRow1.id === kantRow0.id &&
    Number(kantRow1.created_at) === Number(kantRow0.created_at),
    "перегенерация — UPDATE той же строки с сохранением created_at");
  let glc = await genRows(S1, "mode_cascade");
  ok(glc.length === 1 && glc[0].section_label.includes("[каскад]"),
    "genLog: 1 запись source='mode_cascade' с меткой «[каскад]»",
    JSON.stringify(glc.map((g) => g.section_label)));
  // Панель обновилась после исполнения (refetch getModes)
  await page.waitForFunction(
    /* Правка 2026-09-02: заголовки карточек режимов рисуются капителью
       исходника, а innerText отдаёт ОТРИСОВАННЫЙ текст — без регистра. */
    () => {
      const t = (document.querySelector(".edit-modal")?.innerText ?? "").toLowerCase();
      return t.includes("⚔ оппонент · кант") && !t.includes("постмодернизм");
    },
    { timeout: 15000 },
  );
  ok(true, "панель «РЕЖИМЫ» обновлена: карточка одна («Кант»)");
  await page.click(".edit-modal-header .raw-close");
  await page.waitForFunction(() => !document.querySelector(".edit-modal"), { timeout: 5000 });
  await page.waitForFunction(
    () => (document.querySelector(".actions-bar")?.innerText ?? "")
      .toLowerCase().includes("оппонент (1)"),
    { timeout: 10000 },
  );
  ok(true, "счётчик кнопки после плана: «◈ Оппонент (1)»");

  /* ════ R7: подраздельный каскад режимов — confirm → тихая перегенерация ════ */
  console.log("\n■ R7: волна подраздела → confirm каскада режимов → тихая перегенерация");
  // Кандидат подраздела theses, затрагивающий adversarial, — по превью API
  let subName = null;
  for (const cand of ["Онтологические тезисы", "Сводная таблица тезисов"]) {
    const imp = await api(A, "POST", `/syntheses/${S1}/subsection-impact`,
      { sectionKey: "theses", subsectionName: cand });
    if ((imp.body?.affectedModes?.length ?? 0) > 0) { subName = cand; break; }
  }
  ok(!!subName, "превью /subsection-impact: подраздел theses затрагивает режим", subName ?? "нет");

  // Свой dialog-хендлер: копим тексты confirm'ов
  page.removeAllListeners("dialog");
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); void d.accept(); });

  ok(await clickButtonByText(page, ".actions-bar", "✎ Изменить"), "модалка открыта заново");
  await page.waitForSelector(".edit-modal", { timeout: 10000 });
  ok(await clickButtonByText(page, ".edit-modal", "⟳ " + subName),
    "клик «⟳ " + subName + "» на карточке theses");
  await waitText(page, "Затронутые режимы", 15000);
  const kantV1 = (await modeRows(S1, "adversarial"))[0].html_content;
  ok(await clickButtonByText(page, ".edit-modal", "▶ Перегенерировать"),
    "запуск подраздельной перегенерации");
  // Волна: подраздел → confirm каскада режимов (авто-ОК) → mode_done
  await page.waitForFunction(
    () => (document.querySelector(".edit-modal")?.innerText ?? "").includes("✓ Готово"),
    { timeout: 120000 },
  );
  ok(true, "очередь дошла до «✓ Готово»");
  const cascadeDlg = dialogs.find((d) => d.includes("Затронутые режимы"));
  ok(!!cascadeDlg && cascadeDlg.includes("Перегенерировать их?") &&
    cascadeDlg.includes("⚔ Оппонент"),
    "confirm каскада: список режимов + вопрос (паритет [19022])",
    (cascadeDlg ?? "").slice(0, 160));
  ok(!!cascadeDlg && cascadeDlg.includes("Оценка стоимости: ≈ $"),
    "confirm каскада: оценка стоимости (Σ estimate)", (cascadeDlg ?? "").slice(0, 200));

  await page.waitForFunction(async () => true, {}); // yield
  for (let i = 0; i < 40; i++) {
    const r = await modeRows(S1, "adversarial");
    if (r.length === 1 && r[0].html_content !== kantV1) break;
    await sleep(500);
  }
  rows = await modeRows(S1, "adversarial");
  ok(rows.length === 1 && rows[0].param_value === "Кант" &&
    rows[0].html_content !== kantV1 && rows[0].html_content.includes("«Кант»"),
    "тихая перегенерация: html заменён, param СОБСТВЕННЫЙ («Кант»), строк по-прежнему 1");
  glc = await genRows(S1, "mode_cascade");
  ok(glc.length === 2, "genLog: вторая запись mode_cascade (подраздельный каскад)");
  await page.click(".edit-modal-header .raw-close");
  await page.waitForFunction(() => !document.querySelector(".edit-modal"), { timeout: 5000 });

  /* ════ Санитария страницы ════ */
  const wsErrors = consoleErrors.filter(
    (e) => !/favicon|ERR_ABORTED|auth\/me|fonts\.googleapis/i.test(e),
  );
  ok(wsErrors.length === 0, "pageerror/console.error отсутствуют",
    wsErrors.slice(0, 3).join(" | "));

  cA.close();
} catch (err) {
  failed++;
  fails.push("КРАХ: " + (err?.message ?? String(err)));
  console.error("\nКРАХ ПРОГОНА:", err);
  if (serverLog) console.error("── server.log (хвост) ──\n" + serverLog.slice(-1500));
} finally {
  try { await browser?.close(); } catch { /* уже закрыт */ }
  serverProc?.kill("SIGKILL");
  viteProc?.kill("SIGKILL");
  mockSrv?.close();
  await sql.end({ timeout: 2 });
}

console.log(`\n══ ИТОГ: ${passed} ✓, ${failed} ✗`);
if (fails.length) {
  console.log("Провалы:\n - " + fails.join("\n - "));
  process.exit(1);
}
process.exit(0);
