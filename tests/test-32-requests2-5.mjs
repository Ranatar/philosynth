/**
 * Беседа 3.2 — тестовые запросы 2–5 протокола (07, «Последующие
 * запросы») одним заходом, по команде пользователя.
 *
 * Харнесс — по образцу test-23-requests2-5.mjs: живой сервер :3000 +
 * vite :5199 + PG/Redis + мок Claude (SSE) + puppeteer-core с системным
 * Chrome /opt/google/chrome/chrome. Запуск из корня репо; PG+Redis
 * подняты, миграции + 3 сида применены (prompts нужен /estimate и
 * генерации).
 *
 *   R0 — API-санитария транспорта 3.2: ancestors/descendants/search
 *        (беседа 3.1) + новое hasConceptParents в превью списков.
 *        АДАПТАЦИЯ данных: родительские концепции C1 (Кант+Гегель) и
 *        C2 (Хайдеггер+Сартр) сеются ПРЯМЫМИ вставками в БД (образец —
 *        scripts/test-31): пригодность = sum/glossary/theses/critique +
 *        graph + capsule_html; философы — КАНОНИЧЕСКИМИ именами
 *        (PhilosopherPicker и LineageSearch работают со списком 106) —
 *        изоляция TAG не нужна: БД поднимается заново в этом же прогоне.
 *   R2 — поток 07 №1: CreateSynthesis → «+ Из каталога» → 2 концепции →
 *        карточки в пуле (☑, «каталог», ↗) → блок keepFullBudget +
 *        превью (+ estimate-diff) → предполётный confirm пересечения
 *        (философ Кант из генеалогии C1 выбран в форме → warn-текст
 *        «влияние будет удвоено»; отмена не отправляет) → сабмит без
 *        пересечения → генерация на мок → SynthesisPage: дерево
 *        генеалогии (карточки C1/C2, философы, ссылки).
 *   R3 — поток 07 №2: мета-синтез 2-го уровня (meta2 из meta1 через
 *        API; заодно серверные warnings POST — Кант выбран повторно) →
 *        дерево 3 уровня (.gen-tree li li li) с кликабельным meta1.
 *   R4 — поток 07 №3: LineageSearch «Кант» → прямой C1 И транзитивные
 *        meta1/meta2; бейдж «мета-синтез»; фильтр «Потомки C1»
 *        (?descendantsOf=) → пересечение = meta1+meta2, сброс.
 *   R5 — поток 07 №4: мобильный viewport 400×800 → вертикальный стек
 *        (.gen-tree ul → flex-direction: column), горизонтальный скролл
 *        контейнера (.gen-tree overflow-x: auto).
 *
 * Запуск: node tests/test-32-requests2-5.mjs
 */
import { spawn } from "node:child_process";
import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";
import puppeteer from "puppeteer-core";

const SERVER_PORT = 3000; // vite proxy → :3000 (грабля 1.6b)
const VITE_PORT = 5199;
const MOCK_PORT = 3993;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const UI = `http://127.0.0.1:${VITE_PORT}`;
const DB_URL = "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const CHROME = "/opt/google/chrome/chrome";

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

/* ════ Мок Claude API (контент — по test-22/test-23) ═════════════════ */

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

function pickHtml(prompt) {
  const task = prompt.slice(Math.max(0, prompt.lastIndexOf("ЗАДАНИЕ")));
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
      const chunks = chunkify(html, 600);
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
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
  const email = `t32-${tag}-${Date.now()}@test.local`;
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

async function waitText(page, text, timeout = 20000) {
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

/** Клик по label-чекбоксу философа в PhilosopherPicker (точное имя) */
function togglePhilosopher(page, name) {
  return page.evaluate((n) => {
    const labels = [...document.querySelectorAll("label")];
    const hit = labels.find((l) => {
      const cb = l.querySelector('input[type=checkbox]');
      if (!cb) return false;
      return l.innerText.replace(/\s+/g, " ").trim() === n;
    });
    if (!hit) return false;
    hit.querySelector("input").click();
    return true;
  }, name);
}

/* ════ Прямой сид БД: родительские концепции (образец — test-31) ═════ */

const sql = postgres(DB_URL, { max: 2, onnotice: () => {} });

const CONCEPT_KEYS = ["sum", "glossary", "theses", "critique", "graph"];

async function seedConcept(userId, title, phils) {
  const [row] = await sql`
    INSERT INTO syntheses (user_id, title, seed, method, synth_level, depth,
      status, section_order, capsule_html)
    VALUES (${userId}, ${title}, ${"Зерно «" + title + "»"}, 'dialectical',
      'comparative', 'overview', 'ready', ${sql.json(CONCEPT_KEYS)},
      ${'<div class="capsule"><p>Капсула «' + title + '»: несущий принцип концепции.</p></div>'})
    RETURNING id`;
  const id = row.id;
  for (let i = 0; i < CONCEPT_KEYS.length; i++) {
    const key = CONCEPT_KEYS[i];
    await sql`
      INSERT INTO sections (synthesis_id, key, section_num, title, html_content)
      VALUES (${id}, ${key}, ${i + 1}, ${key},
        ${`<section data-key="${key}"><p>Раздел ${key} «${title}».</p></section>`})`;
  }
  for (let i = 0; i < phils.length; i++) {
    await sql`
      INSERT INTO synthesis_lineage (synthesis_id, parent_type, parent_name, position)
      VALUES (${id}, 'philosopher', ${phils[i]}, ${i})`;
  }
  return id;
}

/* ════ Сценарии ══════════════════════════════════════════════════════ */

let mockSrv, browser;

try {
  mockSrv = await startMock();
  await startServer();
  await startVite();
  console.log("Мок, сервер и vite подняты.");

  const A = await makeUser("owner");
  const cA = wsConnect(A.token);
  await cA.open();
  const me = await api(A, "GET", "/auth/me");
  const userId = me.body.user.id;

  /* ── Подготовка: C1 (Кант+Гегель), C2 (Хайдеггер+Сартр) прямым сидом ── */
  console.log("\n■ Подготовка: пригодные концепции C1/C2 прямыми вставками");
  const T1 = "Трансцендентальная диалектика";
  const T2 = "Экзистенциальная аналитика";
  const C1 = await seedConcept(userId, T1, ["Кант", "Гегель"]);
  const C2 = await seedConcept(userId, T2, ["Хайдеггер", "Сартр"]);
  ok(!!C1 && !!C2, "C1 и C2 созданы");

  /* ════ R0: API-санитария транспорта генеалогии + hasConceptParents ════ */
  console.log("\n■ R0: ancestors/descendants/search + hasConceptParents");
  const anc0 = await api(A, "GET", `/syntheses/${C1}/lineage/ancestors`);
  ok(anc0.status === 200 && anc0.body?.tree?.children?.length === 2 &&
    anc0.body.tree.children.every((n) => n.type === "philosopher"),
    "ancestors C1: корень + 2 философа");
  const desc0 = await api(A, "GET", `/syntheses/${C1}/lineage/descendants`);
  ok(desc0.status === 200 && desc0.body?.children?.length === 0,
    "descendants C1 до мета-синтеза пусты");
  const search0 = await api(A, "GET", "/lineage/search?philosopher=" +
    encodeURIComponent("Кант"));
  ok(search0.status === 200 &&
    search0.body?.syntheses?.some((s) => s.id === C1) &&
    !search0.body?.syntheses?.some((s) => s.id === C2),
    "search «Кант» → C1 есть, C2 нет");
  const list0 = await api(A, "GET", "/syntheses?limit=50");
  const c1prev = list0.body?.items?.find((s) => s.id === C1);
  ok(c1prev && c1prev.hasConceptParents === false,
    "hasConceptParents=false у концепции без родителей-концепций");

  /* ════ Браузер ════ */
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "shell",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 950 });
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error")
      consoleErrors.push("console: " + m.text() + " @ " + (m.location()?.url ?? "?"));
  });

  // Диалоги (confirm пересечений): управляемая стратегия
  let dialogPlan = { accept: true }; // как реагировать на СЛЕДУЮЩИЙ диалог
  const dialogs = [];
  page.on("dialog", (d) => {
    dialogs.push({ type: d.type(), message: d.message() });
    (dialogPlan.accept ? d.accept() : d.dismiss()).catch(() => {});
  });

  await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
  await fill(page, "input[type=email]", A.email);
  await fill(page, "input[type=password]", A.password);
  await page.click("button[type=submit]");
  await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 20000 });

  /* ════ R2: поток 07 №1 — из каталога → пул → мета-синтез → дерево ════ */
  console.log("\n■ R2: CreateSynthesis → «+ Из каталога» ×2 → генерация → дерево");
  await page.goto(`${UI}/synthesis/new`, { waitUntil: "domcontentloaded" });
  await waitText(page, "Загруженные Концепции");

  ok(await clickButtonByText(page, null, "+ Из каталога"), "кнопка «+ Из каталога»");
  await waitText(page, T1); // пикер загрузил каталог
  // Добавить обе: кнопка «+ в пул» в строке с названием
  const addFromPicker = (title) => page.evaluate((t) => {
    const rows = [...document.querySelectorAll("div")].filter((d) =>
      d.querySelector("button") &&
      d.innerText.includes(t) &&
      [...d.querySelectorAll("button")].some((b) => b.innerText.includes("в пул")));
    // самый вложенный контейнер строки
    const row = rows[rows.length - 1];
    if (!row) return false;
    const btn = [...row.querySelectorAll("button")].find((b) =>
      b.innerText.trim() === "+ в пул");
    if (!btn) return false;
    btn.click();
    return true;
  }, title);
  ok(await addFromPicker(T1), "C1 добавлена из каталога");
  ok(await addFromPicker(T2), "C2 добавлена из каталога");
  await sleep(300);

  const tPool = await pageText(page);
  ok(has(tPool, "2 из 2 для мета-синтеза"), "саммари пула: 2 из 2");
  ok(has(tPool, "каталог"), "мета-строка карточки: «каталог»");
  ok(has(tPool, "Открыть"), "у каталожной записи ссылка «↗ Открыть» вместо ◉");
  const synthReadyState = await page.evaluate(() => {
    const find = (txt) => {
      const l = [...document.querySelectorAll("label")]
        .find((el) => el.innerText.replace(/\s+/g, " ").includes(txt));
      return l ? !!l.querySelector("input")?.checked : null;
    };
    return {
      ready: find("Пригодность к дальнейшему синтезу"),
      capsule: find("Капсула концепции"),
      dialogue: find("Диалог между традициями"),
    };
  });
  ok(synthReadyState.ready === true,
    "чекбокс «◈ Пригодность» автовключён (hasSynthConcepts)");
  ok(synthReadyState.capsule === true && synthReadyState.dialogue === true,
    "разделы capsule/dialogue довключены (SYNTH_READY_SECTIONS)",
    JSON.stringify(synthReadyState));
  // ☑ обеих карточек отмечены (isSynthParticipant=true при добавлении)
  /* Правка 2026-09-02 (единство стилей с исходником): в .pool-card-controls
     подпись — СОСЕД чекбокса (разметка renderPoolConcepts [5056]), а не
     обёртка, поэтому ищем по контейнеру, а не по label. */
  const checkedCount = await page.evaluate(() =>
    [...document.querySelectorAll(".pool-card-controls")]
      .filter((c) =>
        (c.querySelector("label")?.textContent ?? "")
          .trim()
          .toLowerCase()
          .startsWith("синтез"),
      )
      .filter((c) => c.querySelector('input[type="checkbox"]')?.checked).length);
  ok(checkedCount === 2, "оба чекбокса ☑ Синтез отмечены", String(checkedCount));

  // keepFullBudget-блок и превью бюджета
  ok(has(tPool, "Сохранять полный бюджет секций"), "блок keepFullBudget виден");
  ok(has(tPool, "Контекст родителей:"), "превью бюджета (renderFullBudgetPreview)");
  // estimate-diff (беседа 3.2): две серверные оценки, строка разницы
  try {
    await waitText(page, "Оценка с родителями:", 25000);
    ok(true, "estimate-diff отрисован (две оценки /estimate)");
  } catch {
    ok(false, "estimate-diff отрисован (две оценки /estimate)",
      "строка «Оценка с родителями:» не появилась");
  }

  await fill(page, "textarea", "Опыт как забота: синтез двух концепций");

  // Предполётный confirm: философ Кант (в генеалогии C1) выбран в форме
  ok(await togglePhilosopher(page, "Кант"), "чекбокс философа «Кант» отмечен");
  const [{ count: nSynthBefore }] = await sql`SELECT count(*)::int AS count FROM syntheses`;
  dialogPlan = { accept: false }; // отменяем — POST уйти не должен
  await clickButtonByText(page, null, "Синтезировать Концепцию");
  await sleep(2500); // ждём getAncestors ×2 + confirm
  const confirmDlg = dialogs.find((d) => d.type === "confirm" &&
    d.message.includes("Генеалогические пересечения"));
  ok(!!confirmDlg, "предполётный confirm пересечений показан");
  ok(!!confirmDlg && confirmDlg.message.includes("влияние будет удвоено") &&
    confirmDlg.message.includes("Кант"),
    "текст warn 1:1 (удвоение влияния, имя философа)");
  const [{ count: nSynthAfter }] = await sql`SELECT count(*)::int AS count FROM syntheses`;
  ok(page.url().includes("/synthesis/new") && nSynthAfter === nSynthBefore,
    "отмена confirm НЕ отправила форму (счётчик syntheses не вырос)");

  // Снять Канта → сабмит без пересечений → диалога нет
  ok(await togglePhilosopher(page, "Кант"), "чекбокс «Кант» снят");
  const dialogsBefore = dialogs.length;
  dialogPlan = { accept: true };
  await clickButtonByText(page, null, "Синтезировать Концепцию");
  // Ждём завершения генерации и редиректа на страницу синтеза
  await page.waitForFunction(
    () => /\/synthesis\/[0-9a-f-]{36}$/.test(location.pathname),
    { timeout: 240000 },
  );
  ok(dialogs.length === dialogsBefore,
    "без пересечения confirm не показывается");
  const meta1 = page.url().match(/\/synthesis\/([0-9a-f-]{36})/)[1];
  ok(!!meta1, "редирект на /synthesis/:id (meta1 = " + meta1.slice(0, 8) + "…)");

  await waitText(page, "ДОКУМЕНТ СГЕНЕРИРОВАН", 60000);
  await waitText(page, "Генеалогическое древо", 20000);
  await page.waitForSelector(".gen-tree", { timeout: 20000 });
  ok(true, "секция «Генеалогическое древо» с .gen-tree отрисована");

  const tree1 = await page.evaluate(() => {
    const tree = document.querySelector(".gen-tree");
    return {
      cards: tree.querySelectorAll(".gen-card").length,
      phils: [...tree.querySelectorAll(".gen-phil-name")].map((e) => e.innerText.trim()),
      names: [...tree.querySelectorAll(".gen-card-name")].map((e) => e.innerText.trim()),
      links: [...tree.querySelectorAll(".gen-card-name a")].map((a) => a.getAttribute("href")),
    };
  });
  ok(tree1.cards === 3, "3 карточки концепций (корень + C1 + C2)", JSON.stringify(tree1.names));
  ok(tree1.names.some((n) => n.includes(T1)) && tree1.names.some((n) => n.includes(T2)),
    "карточки C1 и C2 в дереве");
  ok(["Кант", "Гегель", "Хайдеггер", "Сартр"].every((p) => tree1.phils.includes(p)),
    "4 философа-предка в дереве", JSON.stringify(tree1.phils));
  ok(tree1.links.includes(`/synthesis/${C1}`) && tree1.links.includes(`/synthesis/${C2}`),
    "узлы C1/C2 — кликабельные ссылки", JSON.stringify(tree1.links));
  ok(has(await pageText(page), "Потомки этой концепции в каталоге"),
    "ссылка «Потомки в каталоге» в секции генеалогии");

  // lineage в БД: 2 записи synthesis у meta1
  const lineageMeta1 = await sql`
    SELECT parent_type, parent_synthesis_id FROM synthesis_lineage
    WHERE synthesis_id = ${meta1} ORDER BY position`;
  ok(lineageMeta1.filter((r) => r.parent_type === "synthesis").length === 2 &&
    lineageMeta1.some((r) => r.parent_synthesis_id === C1) &&
    lineageMeta1.some((r) => r.parent_synthesis_id === C2),
    "synthesis_lineage meta1: 2 записи synthesis (C1, C2)");

  /* ════ R3: поток 07 №2 — мета-синтез 2-го уровня, дерево 3 уровня ════ */
  console.log("\n■ R3: meta2 из meta1 (API) → дерево 3 уровня");
  const p2 = await api(A, "POST", "/syntheses", {
    seed: "Мета-синтез второго уровня",
    philosophers: ["Кант"], // повтор предка → серверные warnings (M3)
    participants: [{ type: "synthesis", synthesisId: meta1 }],
    sections: ["theses"],
    method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  ok(p2.status === 201 && !!p2.body?.id, "POST meta2 → 201");
  const meta2 = p2.body.id;
  ok(Array.isArray(p2.body?.warnings) &&
    p2.body.warnings.some((w) => w.level === "warn" &&
      w.text.includes("Кант") && w.text.includes("влияние будет удвоено")),
    "серверные warnings в ответе POST (Кант в генеалогии meta1, транзитивно)",
    JSON.stringify(p2.body?.warnings));
  await cA.waitFor(
    (m) => m.type === "generation_complete" && m.synthesisId === meta2,
    240000, "complete meta2",
  );

  await page.goto(`${UI}/synthesis/${meta2}`, { waitUntil: "domcontentloaded" });
  await waitText(page, "Генеалогическое древо", 30000);
  await page.waitForSelector(".gen-tree", { timeout: 20000 });
  const tree2 = await page.evaluate(() => {
    const tree = document.querySelector(".gen-tree");
    return {
      deepLi: tree.querySelectorAll("li li li").length,
      names: [...tree.querySelectorAll(".gen-card-name")].map((e) => e.innerText.trim()),
      phils: [...tree.querySelectorAll(".gen-phil-name")].map((e) => e.innerText.trim()),
      metaLink: !!tree.querySelector(".gen-card-name a"),
    };
  });
  ok(tree2.deepLi > 0, "дерево 3 уровня (.gen-tree li li li непусто)",
    String(tree2.deepLi));
  ok(tree2.names.some((n) => n.includes(T1)) && tree2.names.some((n) => n.includes(T2)),
    "C1 и C2 на 2-м уровне родителей meta2");
  ok(tree2.phils.includes("Хайдеггер"), "философы 3-го уровня (Хайдеггер)");
  ok(tree2.metaLink, "узел meta1 кликабелен");

  /* ════ R4: поток 07 №3 — LineageSearch + бейдж + фильтр потомков ════ */
  console.log("\n■ R4: LineageSearch «Кант» + бейдж «мета-синтез» + descendantsOf");
  // API-транзитивность до браузера
  const search1 = await api(A, "GET", "/lineage/search?philosopher=" +
    encodeURIComponent("Кант"));
  const foundIds = (search1.body?.syntheses ?? []).map((s) => s.id);
  ok(foundIds.includes(C1) && foundIds.includes(meta1) && foundIds.includes(meta2),
    "search «Кант»: прямой C1 + транзитивные meta1/meta2");
  const meta1Prev = search1.body.syntheses.find((s) => s.id === meta1);
  ok(meta1Prev?.hasConceptParents === true, "hasConceptParents=true у meta1");

  await page.goto(`${UI}/catalog`, { waitUntil: "domcontentloaded" });
  await waitText(page, "Каталог концепций");
  ok(await clickButtonByText(page, null, "▸ Генеалогия") ||
     await clickButtonByText(page, null, "Генеалогия"),
    "кнопка «Генеалогия» раскрывает поиск");
  await waitText(page, "Поиск по генеалогии");
  await fill(page, 'input[list="lineage-search-philosophers"]', "Кант");
  await clickButtonByText(page, null, "+ Добавить");
  await sleep(150);
  ok(has(await pageText(page), "Кант ✕") || (await page.evaluate(() =>
    [...document.querySelectorAll("span")].some((s) =>
      s.innerText.trim().startsWith("Кант")))),
    "чип «Кант» добавлен");
  await clickButtonByText(page, null, "Найти");
  await waitText(page, T1, 15000); // C1 в результатах
  const tSearch = await pageText(page);
  ok(has(tSearch, T1), "результаты: C1 (прямой)");
  // text-transform: uppercase влияет на innerText в Chrome (грабля 2.3) —
  // сверка регистронезависимая
  const badgeCount = await page.evaluate(() =>
    [...document.querySelectorAll("span")].filter((el) =>
      el.innerText.replace(/\s+/g, " ").trim().toLowerCase() ===
        "◈ мета-синтез").length);
  ok(badgeCount >= 2, "бейдж «◈ мета-синтез» у карточек meta1/meta2",
    String(badgeCount));
  const resultLinks = await page.$$eval("a[href^='/synthesis/']", (as) =>
    as.map((a) => a.getAttribute("href")));
  ok(resultLinks.includes(`/synthesis/${meta1}`) &&
    resultLinks.includes(`/synthesis/${meta2}`),
    "результаты: meta1 и meta2 (транзитивно)");

  // Фильтр «Потомки концепции C1»
  await page.goto(`${UI}/catalog?descendantsOf=${C1}`, { waitUntil: "domcontentloaded" });
  await waitText(page, "Показаны только потомки", 20000);
  // Гонка: баннер (запрос потомков) может опередить загрузку СПИСКА —
  // ждём появления карточки meta1, затем снимаем ссылки
  await page.waitForSelector(`a[href="/synthesis/${meta1}"]`, { timeout: 15000 });
  const tDesc = await pageText(page);
  ok(has(tDesc, "к концепции"), "баннер фильтра с ссылкой на концепцию");
  const cardLinks = await page.$$eval("a[href^='/synthesis/']", (as) =>
    as.map((a) => a.getAttribute("href")));
  ok(cardLinks.includes(`/synthesis/${meta1}`) && cardLinks.includes(`/synthesis/${meta2}`),
    "пересечение: meta1 и meta2 показаны");
  ok(!has(tDesc, T2), "C2 (не потомок) скрыта фильтром");
  await clickButtonByText(page, null, "✕ Сбросить фильтр");
  await page.waitForFunction(() => !location.search.includes("descendantsOf"),
    { timeout: 10000 });
  await waitText(page, T2, 15000);
  ok(true, "сброс фильтра возвращает полный список (C2 снова видна)");

  /* ════ R5: поток 07 №4 — мобильная вёрстка дерева ════ */
  console.log("\n■ R5: мобильный viewport — вертикальный стек и скролл");
  await page.setViewport({ width: 400, height: 800 });
  await page.goto(`${UI}/synthesis/${meta1}`, { waitUntil: "domcontentloaded" });
  await waitText(page, "Генеалогическое древо", 30000);
  await page.waitForSelector(".gen-tree ul", { timeout: 20000 });
  const mob = await page.evaluate(() => {
    const tree = document.querySelector(".gen-tree");
    const ul = tree.querySelector("ul");
    const cs = getComputedStyle(ul);
    return {
      flexDirection: cs.flexDirection,
      overflowX: getComputedStyle(tree).overflowX,
      liLines: [...tree.querySelectorAll("li")].map((li) =>
        getComputedStyle(li, "::after").display),
    };
  });
  ok(mob.flexDirection === "column",
    "@media ≤500px: .gen-tree ul → column (вертикальный стек)",
    mob.flexDirection);
  ok(mob.overflowX === "auto", ".gen-tree overflow-x: auto (горизонтальный скролл)",
    mob.overflowX);
  ok(mob.liLines.every((d) => d === "none"),
    "горизонтальные соединители li::after скрыты на мобильных",
    JSON.stringify(mob.liLines));

  // Консольные ошибки: фильтр шума окружения (грабля 2.3)
  const realErrors = consoleErrors.filter((e) =>
    !e.includes("fonts.googleapis.com") &&
    !e.includes("401") && !e.includes("Failed to load resource"));
  ok(realErrors.length === 0, "страница без JS-ошибок",
    realErrors.slice(0, 3).join(" | "));
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
