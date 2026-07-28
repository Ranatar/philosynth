/**
 * Беседа 1.4 — тестовые запросы 2–8 протокола (07 [763–785]) одним заходом.
 *
 * Живой сервер (child-процесс tsx index.ts) + живые PG/Redis + МОК Claude API
 * (локальный SSE-сервер; ANTHROPIC_BASE_URL). Реального ключа в песочнице
 * нет — мок отдаёт настоящие HTTP-ответы и настоящие обрывы, так что
 * классификация v11 (auth/pre-stream/partial) тестируется честно.
 *
 * Управление сценариями мока — маркеры в seed (попадает в промпт):
 *   [MOCK:401] → 401 invalid x-api-key        (R7: kind=auth)
 *   [MOCK:PRESTREAM] → 500 всегда, счёт вызовов (R7: 3 ретрая 1с/3с/8с)
 *   [MOCK:PARTIAL] → обрыв сокета после ~12 чанков (partial HTML сохранён)
 *   [MOCK:SLOW] → медленный стрим ~18 c        (R6: reconnect)
 *   [MOCK:LONG] → ~55k символов               (R8: exhaustive без timeout)
 * Содержимое — по типу раздела (сниффинг промпта): graph → таблицы
 * категорий/связей/топологии; glossary → таблица определений; theses →
 * сводная таблица; иначе — sum-подобный HTML.
 *
 * Запуск: node test-14-requests2-8.mjs   (PG+Redis подняты, сиды засеяны)
 */
import { execSync, spawn } from "node:child_process";
import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";

const SERVER_PORT = 3123;
const MOCK_PORT = 3987;
const BASE = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const DB_URL = "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";

let passed = 0;
let failed = 0;
const fails = [];
function ok(cond, name) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    fails.push(name);
    console.log(`  ✗ ${name}`);
  }
}

/* ════ Мок Claude API ════════════════════════════════════════════════ */

const mockStats = { prestreamCalls: 0, totalCalls: 0 };

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

function graphHtml() {
  const nodeRows = NODE_NAMES.map((n, i) =>
    `<tr><td>${n}</td><td>${i % 2 ? "Эпистемологическая" : "Онтологическая"}</td>` +
    `<td>Определение категории «${n}» в синтезе.</td><td>0.${9 - (i % 5)}</td><td>0.${8 - (i % 4)}</td>` +
    `<td>${i % 2 ? "Гегель" : "Кант"}</td></tr>`).join("");
  const edges = [];
  for (let i = 0; i < 18; i++) {
    const a = NODE_NAMES[i % 10], b = NODE_NAMES[(i + 3) % 10];
    edges.push(`<tr><td>${a}</td><td>обусловливает через опосредование</td><td>${b}</td>` +
      `<td>диалектическая</td><td>${i % 5 === 0 ? "Двунаправленная" : "однонаправленная"}</td><td>0.${5 + (i % 5)}</td></tr>`);
  }
  const topo = NODE_NAMES.map((n, i) =>
    `<tr><td>${n}</td><td>${i < 5 ? "I — Основания" : "II — Развёртывание"}${i === 3 ? " / Мост" : ""}</td>` +
    `<td>${i === 0 ? "центральная" : "периферийная"}</td><td>${i % 2 ? "антитезис" : "тезис"}</td></tr>`).join("");
  return `<div class="doc-section" data-section="Методология построения графа"><p>Граф построен диалектически.</p></div>` +
    `<div class="doc-section" data-section="Таблица категорий"><table class="doc-table"><thead><tr><th>Категория</th><th>Тип</th><th>Определение</th><th>Центральность</th><th>Определённость</th><th>Происхождение</th></tr></thead><tbody>${nodeRows}</tbody></table></div>` +
    `<div class="doc-section" data-section="Таблица связей"><table class="doc-table"><thead><tr><th>Источник</th><th>Описание</th><th>Цель</th><th>Тип</th><th>Направленность</th><th>Сила</th></tr></thead><tbody>${edges.join("")}</tbody></table></div>` +
    `<div class="doc-section" data-section="Топология графа"><div data-section="Топологическая таблица"><table class="doc-table"><thead><tr><th>Категория</th><th>Кластер</th><th>Структурные роли</th><th>Процессуальные роли</th></tr></thead><tbody>${topo}</tbody></table></div></div>`;
}

function glossaryHtml() {
  const terms = NODE_NAMES.map((n, i) =>
    `<tr><td>${n}</td><td>Принятое в данной концепции определение термина «${n}».</td>` +
    `<td>Трансформация значения №${i + 1}.</td></tr>`).join("");
  return `<div class="doc-section" data-section="Таблица определений"><table class="doc-table"><thead><tr><th>Термин</th><th>Принятое определение в данной концепции</th><th>Трансформация значения в синтезе</th></tr></thead><tbody>${terms}</tbody></table></div>` +
    `<div class="doc-section" data-section="Переопределённые термины"><p><strong>${NODE_NAMES[0]}</strong> — переосмыслен. <strong>${NODE_NAMES[1]}</strong> — тоже.</p></div>` +
    `<div class="doc-section" data-section="Новые термины"><p><strong>${NODE_NAMES[9]}</strong> — введён впервые.</p></div>`;
}

function thesesHtml() {
  const rows = NODE_NAMES.slice(0, 6).map((n, i) =>
    `<tr><td>${i + 1}</td><td>Тезис о том, что ${n.toLowerCase()} образует ядро синтеза.</td>` +
    `<td>${["онтол.", "эпистем.", "этич."][i % 3]}</td><td>высокая</td><td>${n}, ${NODE_NAMES[(i + 1) % 10]}</td></tr>`).join("");
  return `<div class="doc-section" data-section="Онтологические тезисы"><p><strong>Тезис о том, что ${NODE_NAMES[0].toLowerCase()} образует ядро синтеза.</strong> Обоснование через двойное опосредование крайностей.</p></div>` +
    `<div class="doc-section" data-section="Сводная таблица тезисов"><table class="doc-table"><thead><tr><th>№</th><th>Формулировка тезиса</th><th>Тип</th><th>Степень новизны</th><th>Связанные категории</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function sumHtml(size = "short") {
  const pad =
    size === "long"
      ? `<div class="doc-section" data-section="Развёрнутое изложение">${`<p>${"Развёртывание синтетической позиции продолжается через опосредование. ".repeat(20)}</p>`.repeat(60)}</div>`
      : size === "medium"
        ? `<div class="doc-section" data-section="Развёрнутое изложение">${`<p>${"Медленное развёртывание позиции. ".repeat(15)}</p>`.repeat(12)}</div>`
        : "";
  return `<div class="doc-section" data-section="Цели и задачи"><p>Цель синтеза — соединить критическую и диалектическую традиции.</p></div>` +
    `<div class="doc-section" data-section="Точки напряжения"><p>Напряжение между конечностью рассудка и тотальностью духа.</p></div>` +
    `<div class="doc-section" data-section="Методологическая рамка"><p>Метод — диалектическое снятие в рамках трансцендентального вопроса.</p></div>` + pad;
}

function pickHtml(prompt, mode) {
  if (prompt.includes("Таблица категорий")) return graphHtml();
  if (prompt.includes("Термин | Принятое определение") || prompt.includes("Таблица определений"))
    return glossaryHtml();
  if (prompt.includes("Сводная таблица") && /тезис/i.test(prompt)) return thesesHtml();
  return sumHtml(mode);
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

      if (prompt.includes("[MOCK:401]")) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { type: "authentication_error", message: "invalid x-api-key" } }));
        return;
      }
      if (prompt.includes("[MOCK:PRESTREAM]")) {
        mockStats.prestreamCalls++;
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { type: "api_error", message: "Internal server error" } }));
        return;
      }

      const slow = prompt.includes("[MOCK:SLOW]");
      const partial = prompt.includes("[MOCK:PARTIAL]");
      const long = prompt.includes("[MOCK:LONG]");
      const html = pickHtml(prompt, long ? "long" : slow || partial ? "medium" : "short");
      const chunks = chunkify(html, slow ? 60 : 220);
      const delayMs = slow ? 150 : long ? 5 : 40;

      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      send({ type: "message_start", message: { usage: { input_tokens: Math.ceil(prompt.length / 4) } } });
      for (let i = 0; i < chunks.length; i++) {
        send({ type: "content_block_delta", delta: { type: "text_delta", text: chunks[i] } });
        if (partial && i >= 12) {
          res.destroy(); // настоящий обрыв соединения посреди стрима
          return;
        }
        await sleep(delayMs);
      }
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: Math.ceil(html.length / 4) } });
      send({ type: "message_stop" });
      res.end();
    });
  });
  return new Promise((resolve) => srv.listen(MOCK_PORT, "127.0.0.1", () => resolve(srv)));
}

/* ════ Обвязка сервера и WS ══════════════════════════════════════════ */

let serverProc;
let serverLog = "";

async function startServer() {
  serverProc = spawn("npx", ["tsx", "index.ts"], {
    cwd: new URL("./server/", import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
      ANTHROPIC_API_KEY: "mock-key-ok",
      DATABASE_URL: DB_URL,
      REDIS_URL: "redis://localhost:6379",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProc.stdout.on("data", (d) => (serverLog += d));
  serverProc.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch { /* ещё поднимается */ }
    await sleep(300);
  }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-2000));
}

async function makeUser() {
  const email = `t14-${Date.now()}@test.local`;
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
  return { token: m[1], cookieHeader: `philosynth_session=${m[1]}` };
}

/** WS-клиент: копит сообщения, ждёт по предикату. */
function wsConnect(token, resumeId) {
  const url = `ws://127.0.0.1:${SERVER_PORT}/ws?token=${token}` +
    (resumeId ? `&resume=${resumeId}` : "");
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

async function post(auth, body) {
  const r = await fetch(`${BASE}/syntheses`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: auth.cookieHeader },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

/* ════ Сценарии ══════════════════════════════════════════════════════ */

const sql = postgres(DB_URL, { max: 2, onnotice: () => {} });

async function main() {
  await startMock();
  await startServer();
  const auth = await makeUser();

  /* ── R2: POST /syntheses (по 07 — именно curl) ── */
  console.log("\n■ R2: POST /syntheses (curl)");
  const curlOut = execSync(
    `curl -s -w "\\n%{http_code}" -X POST ${BASE}/syntheses ` +
      `-H "content-type: application/json" -H "cookie: ${auth.cookieHeader}" ` +
      `-d '{"seed":"Синтез критики и диалектики","philosophers":["Кант","Гегель"],` +
      `"sections":[],"method":"dialectical","depth":"overview","synthLevel":"comparative"}'`,
    { encoding: "utf8" },
  ).trim().split("\n");
  const curlCode = curlOut.pop();
  const curlBody = JSON.parse(curlOut.join("\n"));
  console.log("    curl →", curlCode, JSON.stringify(curlBody));
  ok(curlCode === "201", "R2: curl POST → HTTP 201");
  ok(typeof curlBody.id === "string" && curlBody.id.length > 10, "R2: ответ содержит id");
  ok(curlBody.status === "generating", 'R2: status === "generating"');
  const [r2row] = await sql`SELECT status, section_order FROM syntheses WHERE id = ${curlBody.id}`;
  ok(!!r2row, "R2: запись создана в БД");
  ok(JSON.stringify(r2row.section_order) === '["sum"]', 'R2: sectionOrder ["sum"]');
  const lineage = await sql`SELECT parent_name FROM synthesis_lineage WHERE synthesis_id = ${curlBody.id} ORDER BY position`;
  ok(lineage.map((l) => l.parent_name).join(",") === "Кант,Гегель", "R2: генеалогия Кант,Гегель");
  const bad = await post(auth, { sections: ["sum"], method: "dialectical" });
  ok(bad.status === 400 && bad.body.code === "NO_PARTICIPANTS_SEED_REQUIRED",
    "R2: пустой seed без участников → 400 NO_PARTICIPANTS_SEED_REQUIRED (03 §4.3; код приведён беседой 1.5)");

  /* ── R3: полный цикл Кант+Гегель, sum/graph/glossary, overview ── */
  console.log("\n■ R3: полный цикл (WS: stream_delta → section_done ×3 → generation_complete)");
  const c3 = wsConnect(auth.token);
  await c3.open();
  const p3 = await post(auth, {
    seed: "Синтез трансцендентального идеализма и диалектики",
    philosophers: ["Кант", "Гегель"],
    sections: ["graph", "glossary"], // + sum автоматически = ["sum","graph","glossary"]
    method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  ok(p3.status === 201, "R3: POST принят");
  const id3 = p3.body.id;
  c3.send({ type: "subscribe_generation", synthesisId: id3 });
  const done3 = [];
  c3.ws.addEventListener("message", (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m.type === "section_done" && m.synthesisId === id3) done3.push(m.sectionKey);
    } catch { /* не JSON */ }
  });
  const complete3 = await c3.waitFor(
    (m) => m.type === "generation_complete" && m.synthesisId === id3, 60_000, "generation_complete R3");
  const deltas3 = c3.messages.filter((m) => m.type === "stream_delta" && m.synthesisId === id3);
  const dones3 = c3.messages.filter((m) => m.type === "section_done" && m.synthesisId === id3);
  ok(deltas3.length > 5, `R3: stream_delta получены (${deltas3.length})`);
  ok(deltas3.some((d) => typeof d.totalHtml === "string"), "R3: периодический totalHtml в дельтах");
  ok(dones3.length === 3, `R3: section_done × 3 (${dones3.map((d) => d.sectionKey).join(",")})`);
  ok(dones3.every((d) => d.usage && d.usage.inputTokens > 0 && d.usage.outputTokens > 0),
    "R3: usage в каждом section_done");
  ok(complete3.totalUsage.inputTokens > 0 && complete3.totalUsage.outputTokens > 0,
    "R3: финальный totalUsage > 0");
  console.log("    финальный usage:", JSON.stringify(complete3.totalUsage));
  const [row3] = await sql`SELECT status, total_input_tokens, total_output_tokens, total_cost_usd FROM syntheses WHERE id = ${id3}`;
  ok(row3.status === "ready", 'R3: syntheses.status = "ready"');
  const secs3 = await sql`SELECT key FROM sections WHERE synthesis_id = ${id3} ORDER BY section_num`;
  ok(secs3.map((s) => s.key).join(",") === "sum,graph,glossary", "R3: три раздела в sections в динамическом порядке");
  const [genCommon3] = await sql`SELECT status FROM generation_log WHERE synthesis_id = ${id3} AND section_key = '_genCommon'`;
  ok(genCommon3?.status === "common", "R3: genCommon персистирован (_genCommon/common)");
  const ctxRows3 = await sql`SELECT section_key FROM context_log WHERE synthesis_id = ${id3}`;
  ok(ctxRows3.length === 2, `R3: context_log — 2 записи (graph, glossary): ${ctxRows3.map((r) => r.section_key).join(",")}`);
  c3.close();

  /* ── R4: парсинг графа ── */
  console.log("\n■ R4: парсинг графа (SELECT)");
  const [nCat] = await sql`SELECT count(*)::int AS n FROM categories WHERE synthesis_id = ${id3}`;
  const [nEdge] = await sql`SELECT count(*)::int AS n FROM category_edges WHERE synthesis_id = ${id3}`;
  const [nClu] = await sql`SELECT count(*)::int AS n FROM cluster_labels WHERE synthesis_id = ${id3}`;
  console.log(`    categories=${nCat.n}, category_edges=${nEdge.n}, cluster_labels=${nClu.n}`);
  ok(nCat.n >= 8 && nCat.n <= 15, `R4: categories 8–15 (${nCat.n})`);
  ok(nEdge.n >= 15 && nEdge.n <= 30, `R4: category_edges 15–30 (${nEdge.n})`);
  ok(nClu.n > 0, `R4: cluster_labels заполнены (${nClu.n})`);
  const [catSample] = await sql`SELECT cluster_indices, structural_roles FROM categories WHERE synthesis_id = ${id3} AND position = 0`;
  ok(Array.isArray(catSample.cluster_indices) && catSample.cluster_indices.length > 0,
    "R4: топология привязана (cluster_indices у первой категории)");

  /* ── R5: тезисы + глоссарий ── */
  console.log("\n■ R5: парсинг тезисов и глоссария (SELECT)");
  const c5 = wsConnect(auth.token);
  await c5.open();
  const p5 = await post(auth, {
    seed: "Синтез с тезисами", philosophers: ["Кант", "Гегель"],
    sections: ["theses", "glossary"], method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  const id5 = p5.body.id;
  await c5.waitFor((m) => m.type === "generation_complete" && m.synthesisId === id5, 60_000, "complete R5");
  const [nTh] = await sql`SELECT count(*)::int AS n FROM theses WHERE synthesis_id = ${id5}`;
  const [nGl] = await sql`SELECT count(*)::int AS n FROM glossary_terms WHERE synthesis_id = ${id5}`;
  console.log(`    theses=${nTh.n}, glossary_terms=${nGl.n}`);
  ok(nTh.n > 0, `R5: theses заполнены (${nTh.n})`);
  ok(nGl.n > 0, `R5: glossary_terms заполнены (${nGl.n})`);
  const [thEmpty] = await sql`SELECT count(*)::int AS n FROM theses WHERE synthesis_id = ${id5} AND formulation = ''`;
  const [glEmpty] = await sql`SELECT count(*)::int AS n FROM glossary_terms WHERE synthesis_id = ${id5} AND (term = '' OR definition = '')`;
  ok(thEmpty.n === 0, "R5: formulation непустые");
  ok(glEmpty.n === 0, "R5: term/definition непустые");
  const [thJust] = await sql`SELECT justification, related_categories FROM theses WHERE synthesis_id = ${id5} AND thesis_num = 1`;
  ok((thJust?.justification ?? "").length > 0, "R5: justification тезиса №1 сопоставлено из подраздела");
  ok(Array.isArray(thJust?.related_categories) && thJust.related_categories.length >= 2,
    "R5: related_categories распарсены");
  const [glCat] = await sql`SELECT count(*)::int AS n FROM glossary_terms WHERE synthesis_id = ${id5} AND term_category <> ''`;
  ok(glCat.n > 0, `R5: term_category сопоставлены best-effort (${glCat.n})`);
  c5.close();

  /* ── R6: reconnect ?resume= ── */
  console.log("\n■ R6: reconnect (?resume=)");
  const c6a = wsConnect(auth.token);
  await c6a.open();
  const p6 = await post(auth, {
    seed: "[MOCK:SLOW] Медленный синтез для reconnect", philosophers: ["Кант"],
    sections: [], method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  const id6 = p6.body.id;
  await c6a.waitFor((m) => m.type === "stream_delta" && m.synthesisId === id6, 20_000, "первые дельты R6");
  await sleep(2500); // накопить буфер
  c6a.close(); // обрыв WebSocket посреди генерации
  await sleep(1200);
  const c6b = wsConnect(auth.token, id6); // переподключение с ?resume=
  await c6b.open();
  const resumeMsg = await c6b.waitFor((m) => m.type === "resume", 10_000, "resume R6");
  ok(resumeMsg.sectionKey === "sum", "R6: resume.sectionKey = sum");
  ok(resumeMsg.charsSoFar > 0 && resumeMsg.htmlSoFar.length === resumeMsg.charsSoFar,
    `R6: накопленный буфер получен (${resumeMsg.charsSoFar} симв.)`);
  await c6b.waitFor((m) => m.type === "stream_delta" && m.synthesisId === id6, 15_000, "продолжение стрима R6");
  ok(true, "R6: стрим продолжился после reconnect");
  const complete6 = await c6b.waitFor(
    (m) => m.type === "generation_complete" && m.synthesisId === id6, 40_000, "complete R6");
  ok(complete6.totalUsage.outputTokens > 0, "R6: генерация завершилась после reconnect");
  c6b.close();

  /* ── R7: классификация обрыва (v11) ── */
  console.log("\n■ R7: классификация обрыва");
  // 7a. auth: 401 от API
  const c7a = wsConnect(auth.token);
  await c7a.open();
  const p7a = await post(auth, {
    seed: "[MOCK:401] Синтез с невалидным ключом", philosophers: ["Кант"],
    sections: [], method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  const id7a = p7a.body.id;
  const paused7a = await c7a.waitFor(
    (m) => m.type === "generation_paused" && m.synthesisId === id7a, 20_000, "paused auth");
  ok(paused7a.reasonKind === "auth", 'R7a: reasonKind = "auth"');
  const [row7a] = await sql`SELECT status, paused_state FROM syntheses WHERE id = ${id7a}`;
  ok(row7a.status === "paused", 'R7a: status = "paused"');
  ok(row7a.paused_state?.reasonKind === "auth" && row7a.paused_state?.kind === "gen",
    "R7a: pausedState записан (kind=gen, reasonKind=auth)");
  const [marker7a] = await sql`SELECT count(*)::int AS n FROM generation_log WHERE synthesis_id = ${id7a} AND log_type = 'pause_marker'`;
  ok(marker7a.n === 1, "R7a: pause_marker в generation_log");
  c7a.close();

  // 7b. partial: обрыв посреди стрима → partial HTML сохранён
  const c7b = wsConnect(auth.token);
  await c7b.open();
  const p7b = await post(auth, {
    seed: "[MOCK:PARTIAL] Синтез с обрывом стрима", philosophers: ["Кант"],
    sections: [], method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  const id7b = p7b.body.id;
  const paused7b = await c7b.waitFor(
    (m) => m.type === "generation_paused" && m.synthesisId === id7b, 20_000, "paused partial");
  ok(paused7b.reasonKind === "partial", 'R7b: обрыв посреди стрима → reasonKind = "partial"');
  const [row7b] = await sql`SELECT status, paused_state FROM syntheses WHERE id = ${id7b}`;
  const [sec7b] = await sql`SELECT length(html_content)::int AS len FROM sections WHERE synthesis_id = ${id7b} AND key = 'sum'`;
  ok(row7b.status === "paused" && row7b.paused_state?.reasonKind === "partial", "R7b: пауза записана");
  ok((sec7b?.len ?? 0) > 0, `R7b: partial HTML сохранён в sections (${sec7b?.len ?? 0} симв.)`);
  c7b.close();

  // 7c. pre-stream: 500 → 3 ретрая (1с/3с/8с) → пауза
  const before = (await (await fetch(`http://127.0.0.1:${MOCK_PORT}/stats`)).json()).prestreamCalls;
  const c7c = wsConnect(auth.token);
  await c7c.open();
  const t0 = Date.now();
  const p7c = await post(auth, {
    seed: "[MOCK:PRESTREAM] Синтез с падающим API", philosophers: ["Кант"],
    sections: [], method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  const id7c = p7c.body.id;
  const paused7c = await c7c.waitFor(
    (m) => m.type === "generation_paused" && m.synthesisId === id7c, 40_000, "paused pre-stream");
  const elapsed = Date.now() - t0;
  const after = (await (await fetch(`http://127.0.0.1:${MOCK_PORT}/stats`)).json()).prestreamCalls;
  ok(paused7c.reasonKind === "pre-stream", 'R7c: reasonKind = "pre-stream"');
  ok(after - before === 4, `R7c: попыток ровно 4 (1 + 3 ретрая): ${after - before}`);
  ok(elapsed >= 11_500, `R7c: задержки ретраев 1с+3с+8с соблюдены (${(elapsed / 1000).toFixed(1)}с)`);
  const [row7c] = await sql`SELECT status FROM syntheses WHERE id = ${id7c}`;
  ok(row7c.status === "paused", "R7c: после исчерпания ретраев — пауза");
  c7c.close();

  /* ── R8: edge cases ── */
  console.log("\n■ R8: edge cases");
  // 8a. sections=["sum"] — уже проверено в R2/R6-потоке; здесь сквозной статус
  const [row8a] = await sql`SELECT status FROM syntheses WHERE id = ${curlBody.id}`;
  const [nSec8a] = await sql`SELECT count(*)::int AS n FROM sections WHERE synthesis_id = ${curlBody.id}`;
  ok(row8a.status === "ready" && nSec8a.n === 1,
    `R8a: одиночный ["sum"] без зависимостей завершился (status=${row8a.status}, sections=${nSec8a.n})`);
  // 8b. exhaustive — длинный ответ, не timeout
  const c8 = wsConnect(auth.token);
  await c8.open();
  const p8 = await post(auth, {
    seed: "[MOCK:LONG] Исчерпывающий синтез", philosophers: ["Кант", "Гегель"],
    sections: [], method: "dialectical", depth: "exhaustive", synthLevel: "comparative",
  });
  const id8 = p8.body.id;
  const complete8 = await c8.waitFor(
    (m) => m.type === "generation_complete" && m.synthesisId === id8, 60_000, "complete exhaustive");
  const [sec8] = await sql`SELECT length(html_content)::int AS len FROM sections WHERE synthesis_id = ${id8} AND key = 'sum'`;
  ok(sec8.len > 40_000, `R8b: exhaustive — длинный ответ без timeout (${sec8.len} симв.)`);
  ok(complete8.totalUsage.outputTokens > 5_000, `R8b: usage соразмерен (${complete8.totalUsage.outputTokens} out)`);
  c8.close();

  console.log(`\n${failed === 0 ? "OK" : "FAIL"}: ${passed} проверок пройдено, ${failed} провалено`);
  if (failed) console.log("Провалы:\n  - " + fails.join("\n  - "));
}

main()
  .catch((e) => {
    failed++;
    console.error("\nФАТАЛЬНО:", e);
    console.error("\n─ хвост лога сервера ─\n" + serverLog.slice(-3000));
  })
  .finally(async () => {
    serverProc?.kill("SIGTERM");
    await sleep(500);
    serverProc?.kill("SIGKILL");
    await sql.end({ timeout: 2 }).catch(() => {});
    process.exit(failed ? 1 : 0);
  });
