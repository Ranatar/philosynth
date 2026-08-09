/**
 * Беседа 2.2 — тестовые запросы 2–6 протокола (07, «Последующие запросы»)
 * одним заходом, по команде пользователя.
 *
 * Харнесс: живой сервер (node --import tsx index.ts) + PG/Redis + мок
 * Claude API (SSE, ANTHROPIC_BASE_URL) — паттерн test-16/test-21.
 *
 *   R1 — синтез 5 разделов, план regen=["graph"], execute:
 *        graph перегенерирован (html изменился), genLog source='edit',
 *        ctxLog graph +1, version_base +1 / version_sub=0, version_marker.
 *   R2 — каскад: план ПРЕДЛАГАЕТ перегенерировать theses (pending
 *        cascadeGenerated шаги theses+dialogue); после execute они
 *        остаются pending; confirm_step(theses) по WS → исполнение
 *        (plan_step_started/plan_step_done), theses перегенерирован.
 *        АДАПТАЦИЯ против буквы 07 («Проверь plan_steps_added»):
 *        каскад для regen предвычисляется createPlan (беседа 2.1),
 *        поэтому после исполнения НОВЫХ каскадных шагов не возникает и
 *        plan_steps_added для theses невозможен по построению; живое
 *        plan_steps_added проверяется в R3/R4 (структурный шаг после
 *        add/delete — где шаги реально рождаются после исполнения).
 *        Дыра формулировки 07 зафиксирована для патча доков.
 *   R3 — deleteSection: план remove=["history"], execute (по WS
 *        execute_plan): sectionOrder без history, номера подряд,
 *        deletion_marker, ссылки «§ H» → «§ H [удалён]», «§ K» → K−1;
 *        plan_steps_added со структурным шагом.
 *   R4 — addSection: синтез без dialogue, план add=["dialogue"],
 *        execute (HTTP): dialogue в sectionOrder (позиция по
 *        findInsertPosition — после зависимостей), номера подряд,
 *        genLog source='edit_add'; plan_steps_added (структурный шаг);
 *        confirm_step структурного шага → «Структура документа»
 *        перегенерирована, structure_sections == section_order.
 *   R5 — edge case regenerateSubsection «Таблица связей» (INTRA_DEPS:
 *        Таблица категорий → Методология):
 *        (a) прямой вызов extractRelevantIntraSectionContext — только
 *            транзитивные источники, БЕЗ Топологии/самого подраздела;
 *        (b) HTTP POST /regenerate-subsection: врезка (нонс в html),
 *            ctxLog 'graph:Таблица связей' entries intra: только
 *            зависимые, version_sub +1.
 *
 * Запуск: npx tsx tests/test-22-requests2-6.mjs (корень репо; PG+Redis
 * подняты, миграции+3 сида применены).
 */
import { spawn } from "node:child_process";
import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";

const SERVER_PORT = 3132;
const MOCK_PORT = 3993;
const BASE = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const DB_URL = "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";

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

/* ════ Мок Claude API (по test-16; сниффинг от lastIndexOf("ЗАДАНИЕ") /
       маркера подраздельной задачи «ТОЛЬКО секцию») ════════════════════ */

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
  return `<div class="doc-section" data-section="Цели и задачи"><p>Цель синтеза — соединить критическую и диалектическую традиции.</p></div>` +
    `<div class="doc-section" data-section="Точки напряжения"><p>Напряжение между конечностью рассудка и тотальностью духа.</p></div>` +
    `<div class="doc-section" data-section="Методологическая рамка"><p>Метод — диалектическое снятие.</p></div>`;
}

/** Подраздельная перегенерация: serializeSubsectionRegen помечает задачу
 *  «…ТОЛЬКО секцию:\n\n«ИМЯ»» — возвращаем один div этого подраздела. */
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
        await sleep(8);
      }
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: Math.ceil(html.length / 4) } });
      send({ type: "message_stop" });
      res.end();
    });
  });
  return new Promise((resolve) => srv.listen(MOCK_PORT, "127.0.0.1", () => resolve(srv)));
}

/* ════ Обвязка сервера, auth, WS (по test-16) ════════════════════════ */

let serverProc;
let serverLog = "";

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

async function makeUser(tag) {
  const email = `t22-${tag}-${Date.now()}@test.local`;
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

async function sectionRow(sid, key) {
  const [r] = await sql`
    SELECT key, section_num, html_content, sec_context, is_edited
    FROM sections WHERE synthesis_id = ${sid} AND key = ${key}`;
  return r;
}
async function synthRow(sid) {
  const [r] = await sql`
    SELECT section_order, structure_sections, version_base, version_sub,
           status, paused_state
    FROM syntheses WHERE id = ${sid}`;
  return r;
}
async function orderedNums(sid, order) {
  const rows = await sql`
    SELECT key, section_num FROM sections WHERE synthesis_id = ${sid}`;
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.section_num]));
  return order.map((k) => byKey[k]);
}

let mockSrv;

try {
  mockSrv = await startMock();
  await startServer();
  console.log("Сервер и мок подняты.");

  const A = await makeUser("owner");
  const cA = wsConnect(A.token);
  await cA.open();

  /* ════ Подготовка: синтез S1 с 5 разделами ════ */
  console.log("\n■ Подготовка: POST-синтез S1 (5 разделов) через мок");
  const p1 = await api(A, "POST", "/syntheses", {
    seed: "Синтез для исполнения планов",
    philosophers: ["Кант", "Гегель"],
    sections: ["graph", "glossary", "theses", "history", "dialogue"],
    method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  ok(p1.status === 201 && !!p1.body?.id, "POST S1 (5 разделов) → 201");
  const S1 = p1.body.id;
  await cA.waitFor((m) => m.type === "generation_complete" && m.synthesisId === S1,
    120_000, "complete S1");
  const s1After = await synthRow(S1);
  ok(s1After.section_order.length === 6 && s1After.section_order.includes("history"),
    "S1: sectionOrder — sum + 5 разделов",
    JSON.stringify(s1After.section_order));

  /* ════ R1: план regen=["graph"] → execute (HTTP) ════ */
  console.log("\n■ R1: план regen=[\"graph\"], execute — перегенерация раздела");
  const graphBefore = await sectionRow(S1, "graph");
  const [{ count: ctxBefore }] = await sql`
    SELECT count(*)::int AS count FROM context_log
    WHERE synthesis_id = ${S1} AND section_key = 'graph'`;
  const verBefore = await synthRow(S1);

  const plan1 = await api(A, "POST", `/syntheses/${S1}/plans`, {
    regen: ["graph"], remove: [], add: [],
  });
  ok(plan1.status === 201 || plan1.status === 200, "POST план regen=[graph]");
  const P1 = plan1.body.plan;
  const graphStep = P1.steps.find((s) => s.type === "regen" && s.target === "graph");
  ok(graphStep?.status === "confirmed", "шаг graph — confirmed (пользовательский)");

  const ex1 = await api(A, "POST", `/syntheses/${S1}/plans/${P1.id}/execute`);
  ok(ex1.status === 200 && ex1.body?.ok === true, "POST execute → { ok: true }");
  const stepDone = await cA.waitFor(
    (m) => m.type === "plan_step_done" && m.planId === P1.id,
    60_000, "plan_step_done graph");
  ok(stepDone.result.inputTokens > 0 && stepDone.result.outputTokens > 0,
    "plan_step_done: result с usage");
  await cA.waitFor((m) => m.type === "plan_updated" && m.planId === P1.id,
    60_000, "plan_updated (план завершён)");

  const graphAfter = await sectionRow(S1, "graph");
  ok(graphAfter.html_content !== graphBefore.html_content &&
    graphAfter.html_content.includes("Таблица категорий"),
    "graph перегенерирован (html изменился)");
  ok(graphAfter.is_edited === true, "graph: is_edited=true");
  const [editLog] = await sql`
    SELECT status FROM generation_log
    WHERE synthesis_id = ${S1} AND section_key = 'graph' AND source = 'edit'
    ORDER BY created_at DESC LIMIT 1`;
  ok(editLog?.status === "done", "genLog: запись source='edit' status='done'");
  const [{ count: ctxAfter }] = await sql`
    SELECT count(*)::int AS count FROM context_log
    WHERE synthesis_id = ${S1} AND section_key = 'graph'`;
  ok(ctxAfter === ctxBefore + 1, "ctxLog graph обновлён (+1)",
    `${ctxBefore} → ${ctxAfter}`);
  const verAfter1 = await synthRow(S1);
  ok(verAfter1.version_base === verBefore.version_base + 1 &&
    verAfter1.version_sub === 0,
    "version_base +1, version_sub=0");
  const [vm] = await sql`
    SELECT metadata FROM generation_log
    WHERE synthesis_id = ${S1} AND log_type = 'version_marker'
    ORDER BY created_at DESC LIMIT 1`;
  ok(vm && Array.isArray(vm.metadata.actions) &&
    vm.metadata.actions.some((a) => a.includes("regen")),
    "version_marker с действиями плана");
  const p1Final = (await api(A, "GET", `/syntheses/${S1}/plans/${P1.id}`)).body.plan;
  ok(p1Final.status === "done", "план → done");

  /* ════ R2: каскад — pending-шаги + confirm_step по WS ════ */
  console.log("\n■ R2: каскад graph → theses (pending) и confirm_step");
  const cascThese = p1Final.steps.findIndex(
    (s) => s.type === "regen" && s.target === "theses");
  const cascDial = p1Final.steps.find(
    (s) => s.type === "regen" && s.target === "dialogue");
  ok(cascThese !== -1 &&
    p1Final.steps[cascThese].status === "pending" &&
    p1Final.steps[cascThese].cascadeGenerated === true,
    "план предлагает перегенерировать theses (pending, cascadeGenerated)");
  ok(!!cascDial && cascDial.status === "pending",
    "…и dialogue (downstream graph, 2.1)");
  ok(!p1Final.steps.some((s) => s.type === "regen_subsection"),
    "regen-план БЕЗ структурного шага (состав разделов не менялся)");

  const thesesBefore = await sectionRow(S1, "theses");
  cA.send({ type: "confirm_step", planId: P1.id, stepIndex: cascThese });
  await cA.waitFor(
    (m) => m.type === "plan_step_started" && m.planId === P1.id &&
      m.stepIndex === cascThese,
    30_000, "plan_step_started (confirm theses)");
  await cA.waitFor(
    (m) => m.type === "plan_step_done" && m.planId === P1.id &&
      m.stepIndex === cascThese,
    60_000, "plan_step_done (confirm theses)");
  const thesesAfter = await sectionRow(S1, "theses");
  ok(thesesAfter.html_content !== thesesBefore.html_content,
    "confirm_step исполнил каскадный шаг: theses перегенерирован");
  const p1AfterConfirm = (await api(A, "GET", `/syntheses/${S1}/plans/${P1.id}`)).body.plan;
  ok(p1AfterConfirm.steps[cascThese].status === "done",
    "шаг theses в плане → done");

  /* ════ R3: deleteSection history (WS execute_plan) ════ */
  console.log("\n■ R3: план remove=[\"history\"] — удаление, перенумерация, ссылки");
  const s1Pre = await synthRow(S1);
  const histRow = await sectionRow(S1, "history");
  const H = histRow.section_num;
  const afterKeys = s1Pre.section_order.filter(
    (k) => k !== "history" && k !== "sum");
  // Раздел с номером > H — его ссылка должна уменьшиться на 1
  const numsPre = await sql`
    SELECT key, section_num FROM sections WHERE synthesis_id = ${S1}`;
  const bigger = numsPre.find((r) => r.section_num > H);
  const K = bigger ? bigger.section_num : null;
  // Вставляем ссылки в theses (после каскадной перегенерации R2!)
  await sql`
    UPDATE sections SET html_content = html_content ||
      ${`<p>Ссылки: § ${H} и § ${K ?? H}.</p>`}
    WHERE synthesis_id = ${S1} AND key = 'theses'`;

  const plan3 = await api(A, "POST", `/syntheses/${S1}/plans`, {
    regen: [], remove: ["history"], add: [],
  });
  const P3 = plan3.body.plan;
  ok(P3.steps.some((s) => s.type === "delete" && s.target === "history" &&
    s.status === "confirmed"), "план: delete history confirmed");

  cA.send({ type: "execute_plan", synthesisId: S1, planId: P3.id });
  await cA.waitFor((m) => m.type === "plan_updated" && m.planId === P3.id,
    60_000, "plan_updated (delete-план завершён)");

  const s1Post = await synthRow(S1);
  ok(!s1Post.section_order.includes("history"),
    "sectionOrder без history", JSON.stringify(s1Post.section_order));
  const gone = await sectionRow(S1, "history");
  ok(gone === undefined, "строка sections history удалена");
  const nums = await orderedNums(S1, s1Post.section_order);
  ok(nums.every((n, i) => n === i + 1),
    "номера перенумерованы подряд (1..N по sectionOrder)",
    JSON.stringify(nums));
  const [delMark] = await sql`
    SELECT metadata FROM generation_log
    WHERE synthesis_id = ${S1} AND log_type = 'deletion_marker'
      AND section_key = 'history'`;
  ok(!!delMark && delMark.metadata.sectionNum === H,
    "deletion_marker с номером удалённого");
  const thesesFinal = await sectionRow(S1, "theses");
  ok(thesesFinal.html_content.includes(`§ ${H} [удалён]`),
    `ссылка «§ ${H}» помечена [удалён]`);
  if (K !== null && K !== H) {
    ok(thesesFinal.html_content.includes(`§ ${K - 1}.`),
      `ссылка «§ ${K}» перенумерована в «§ ${K - 1}»`);
  }
  const added3 = await cA.waitFor(
    (m) => m.type === "plan_steps_added" && m.planId === P3.id,
    20_000, "plan_steps_added после delete");
  ok(added3.newSteps.some((s) => s.type === "regen_subsection" &&
    s.target === "sum:Структура документа"),
    "plan_steps_added: структурный шаг после удаления раздела");

  /* ════ R4: addSection dialogue на синтезе без dialogue ════ */
  console.log("\n■ R4: синтез S2 без dialogue, план add=[\"dialogue\"]");
  const p2 = await api(A, "POST", "/syntheses", {
    seed: "Синтез для добавления раздела",
    philosophers: ["Кант", "Гегель"],
    sections: ["graph", "glossary", "theses"],
    method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  const S2 = p2.body.id;
  await cA.waitFor((m) => m.type === "generation_complete" && m.synthesisId === S2,
    120_000, "complete S2");
  const s2Pre = await synthRow(S2);
  ok(!s2Pre.section_order.includes("dialogue"), "S2 без dialogue");

  const plan4 = await api(A, "POST", `/syntheses/${S2}/plans`, {
    regen: [], remove: [], add: ["dialogue"],
    addContexts: { dialogue: "Сделай акцент на споре о вещи-в-себе" },
  });
  const P4 = plan4.body.plan;
  ok(P4.steps.some((s) => s.type === "add" && s.target === "dialogue" &&
    s.status === "confirmed"), "план: add dialogue confirmed");

  const ex4 = await api(A, "POST", `/syntheses/${S2}/plans/${P4.id}/execute`);
  ok(ex4.status === 200, "execute add-плана → 200");
  await cA.waitFor((m) => m.type === "plan_updated" && m.planId === P4.id,
    90_000, "plan_updated (add-план завершён)");

  const s2Post = await synthRow(S2);
  const dPos = s2Post.section_order.indexOf("dialogue");
  ok(dPos !== -1, "dialogue в sectionOrder", JSON.stringify(s2Post.section_order));
  // findInsertPosition: dialogue зависит от graph/theses — позиция после них
  ok(dPos > s2Post.section_order.indexOf("graph") &&
    dPos > s2Post.section_order.indexOf("theses"),
    "позиция dialogue — после его зависимостей (graph, theses)");
  const dRow = await sectionRow(S2, "dialogue");
  ok(dRow.section_num === dPos + 1,
    "sectionNum dialogue = позиция в sectionOrder + 1",
    `${dRow.section_num} vs ${dPos + 1}`);
  ok(dRow.sec_context.includes("вещи-в-себе"),
    "контекст addContexts сохранён в sec_context");
  const nums2 = await orderedNums(S2, s2Post.section_order);
  ok(nums2.every((n, i) => n === i + 1), "номера S2 подряд после вставки",
    JSON.stringify(nums2));
  const [addLog] = await sql`
    SELECT status FROM generation_log
    WHERE synthesis_id = ${S2} AND section_key = 'dialogue'
      AND source = 'edit_add' ORDER BY created_at DESC LIMIT 1`;
  ok(addLog?.status === "done", "genLog: source='edit_add' done");

  const added4 = await cA.waitFor(
    (m) => m.type === "plan_steps_added" && m.planId === P4.id,
    20_000, "plan_steps_added после add");
  const structIdx4 = added4.newSteps.findIndex(
    (s) => s.type === "regen_subsection" && s.target === "sum:Структура документа");
  ok(structIdx4 !== -1, "plan_steps_added: структурный шаг после добавления");

  // confirm структурного шага → «Структура документа» → снимок
  const p4Now = (await api(A, "GET", `/syntheses/${S2}/plans/${P4.id}`)).body.plan;
  const structStep = p4Now.steps.findIndex(
    (s) => s.type === "regen_subsection" &&
      s.target === "sum:Структура документа" && s.status === "pending");
  ok(structStep !== -1, "структурный шаг pending в плане");
  ok(JSON.stringify(s2Post.structure_sections) !==
    JSON.stringify(s2Post.section_order),
    "до confirm: structure_sections устарел (≠ sectionOrder)");
  cA.send({ type: "confirm_step", planId: P4.id, stepIndex: structStep });
  await cA.waitFor(
    (m) => m.type === "plan_step_done" && m.planId === P4.id &&
      m.stepIndex === structStep,
    60_000, "plan_step_done (структурный шаг)");
  const s2Final = await synthRow(S2);
  ok(JSON.stringify(s2Final.structure_sections) ===
    JSON.stringify(s2Final.section_order),
    "после confirm: structure_sections == section_order (снимок [20461])");
  const p4Done = (await api(A, "GET", `/syntheses/${S2}/plans/${P4.id}`)).body.plan;
  ok(p4Done.status === "done", "план R4 → done (pending не осталось)");

  /* ════ R5: edge case — INTRA_DEPS подраздела ════ */
  console.log("\n■ R5: regenerateSubsection «Таблица связей» — только зависимые");

  // (a) Прямой вызов extractRelevantIntraSectionContext
  const { parseFragment } = await import("../server/utils/html-parser.js");
  const { extractRelevantIntraSectionContext } =
    await import("../server/services/context-builder.js");
  const graphNow = await sectionRow(S1, "graph");
  const container = parseFragment(graphNow.html_content);
  const intra = await extractRelevantIntraSectionContext(
    container, "graph", "Таблица связей");
  ok(intra.includes("[Таблица категорий]"),
    "(a) intra содержит прямую зависимость [Таблица категорий]");
  ok(intra.includes("[Методология построения графа]"),
    "(a) intra содержит транзитивную [Методология построения графа]");
  ok(!intra.includes("[Топология графа]") &&
    !intra.includes("[Топологическая таблица]"),
    "(a) intra БЕЗ независимых (Топология) — не «все подряд»");
  ok(!intra.includes("[Таблица связей]"),
    "(a) сам перегенерируемый подраздел не включён");

  // (b) HTTP POST /regenerate-subsection — сквозной путь
  const verPre5 = await synthRow(S1);
  const r5 = await api(A, "POST", `/syntheses/${S1}/regenerate-subsection`, {
    sectionKey: "graph", subsectionName: "Таблица связей",
    userNote: "уточни направленность связей",
  });
  ok(r5.status === 200 && r5.body?.ok === true,
    "(b) POST regenerate-subsection → ok");
  // ГРАБЛЯ харнесса: waitFor ищет и по прошлым сообщениям — section_done
  // graph уже был в R1. Отсекаем историю по индексу.
  const seen5 = cA.messages.length;
  const done5 = await cA.waitFor(
    (m) => (m.type === "section_done" || m.type === "stream_error") &&
      m.synthesisId === S1 && cA.messages.indexOf(m) >= seen5,
    60_000, "section_done|stream_error (подраздел)");
  ok(done5.type === "section_done",
    "(b) пришёл section_done, не stream_error",
    done5.type === "stream_error" ? done5.error : "");
  ok(done5.html.includes("Таблица категорий"),
    "(b) раздел цел после врезки (остальные подразделы на месте)");
  const graphAfter5 = await sectionRow(S1, "graph");
  ok(graphAfter5.html_content !== graphNow.html_content,
    "(b) html graph изменился (врезка spliceSubsectionHtml)");
  const [ctx5] = await sql`
    SELECT entries FROM context_log
    WHERE synthesis_id = ${S1} AND section_key = ${"graph:Таблица связей"}
    ORDER BY created_at DESC LIMIT 1`;
  const keys5 = (ctx5?.entries ?? []).map((e) => e.key);
  ok(keys5.includes("intra:Таблица категорий"),
    "(b) ctxLog intra: Таблица категорий", JSON.stringify(keys5));
  ok(keys5.includes("intra:Методология построения графа"),
    "(b) ctxLog intra: Методология (транзитивно)");
  ok(!keys5.some((k) => k.includes("Топология")),
    "(b) ctxLog БЕЗ Топологии — только зависимые");
  const [gen5] = await sql`
    SELECT status, metadata FROM generation_log
    WHERE synthesis_id = ${S1}
      AND section_key = ${"graph:Таблица связей"}
      AND source = 'subsection_regen'
    ORDER BY created_at DESC LIMIT 1`;
  ok(gen5?.status === "done" && gen5.metadata.hasUserNote === true,
    "(b) genLog source='subsection_regen' + userNote");
  const verPost5 = await synthRow(S1);
  ok(verPost5.version_sub === verPre5.version_sub + 1,
    "(b) version_sub +1 [18811]",
    `${verPre5.version_sub} → ${verPost5.version_sub}`);

  /* ════ Итог ════ */
  console.log(`\n═══ ИТОГ: ${passed} ✓, ${failed} ✗ ═══`);
  if (failed > 0) {
    console.log("Провалы:\n  - " + fails.join("\n  - "));
    const errs = cA.messages.filter((m) => m.type === "stream_error");
    if (errs.length) console.log("stream_error:", JSON.stringify(errs, null, 1));
    console.log("Хвост лога сервера:\n" + serverLog.slice(-2500));
    process.exitCode = 1;
  }
} catch (e) {
  console.error("\nФАТАЛЬНО:", e);
  console.error("Хвост лога сервера:\n" + serverLog.slice(-3000));
  process.exitCode = 1;
} finally {
  try { serverProc?.kill("SIGKILL"); } catch { /* ок */ }
  try { mockSrv?.close(); } catch { /* ок */ }
  try { await sql.end({ timeout: 2 }); } catch { /* ок */ }
  const { closeDb } = await import("../server/db/index.js").catch(() => ({}));
  const { closeRedis } = await import("../server/redis.js").catch(() => ({}));
  try { await closeDb?.(); } catch { /* ок */ }
  try { await closeRedis?.(); } catch { /* ок */ }
}
