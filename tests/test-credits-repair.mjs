/**
 * Правки 2026-11-17 (кредиты) — сквозная проверка правила «после сбоя службы
 * или API с баланса не списывается только ПОЧИНКА прерванного раздела».
 *
 * Живой сервер (child tsx index.ts, BILLING_ENFORCE=true) + живые PG/Redis +
 * МОК Claude API (паттерн test-14b; ANTHROPIC_BASE_URL). Плательщик — баланс
 * (подписки и своего ключа у пользователя нет). Проходы синтеза: sum → graph.
 * Сценарии — маркеры в seed:
 *   [MOCK:BILLSUM]   → sum-промпт при billingOk=false: 400 credit balance
 *                      (пауза 'billing' под серверным ключом — сбой службы)
 *   [MOCK:BILLGRAPH] → то же на graph-промпте (прерван ПОСЛЕДНИЙ проход)
 *   [MOCK:MAXTOK]    → sum оборван по max_tokens (догенерация подразделов)
 *
 *   R1 retry: повтор sum — без списания, graph после него — списан
 *   R2 skip:  пропуск sum — бесплатного нет, graph списан
 *   R3 fill-missing-subs: догенерация подразделов — без списания, graph списан
 *   R4 порог: за починкой идёт платное продолжение — пустой баланс не пускает
 *   R5 починка последнего раздела проходит и при пустом балансе, без списания
 *
 * Учёт сверяется по api_usage (вызовы 'balance') и transactions ('usage'):
 * вызов без списания — строка api_usage без транзакции; сумма транзакции —
 * себестоимость вызова × наценка.
 *
 * Запуск: node --import tsx tests/test-credits-repair.mjs
 *         (PG+Redis подняты, сиды засеяны)
 */
import { spawn } from "node:child_process";
import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";

const SERVER_PORT = 3126;
const MOCK_PORT = 3990;
const BASE = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const MARKUP = 1.2;

let passed = 0;
let failed = 0;
const fails = [];
function ok(cond, name, detail) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    fails.push(name);
    console.log(`  ✗ ${name}${detail === undefined ? "" : " — " + JSON.stringify(detail)}`);
  }
}

/* ════ Мок Claude API ════════════════════════════════════════════════ */

const SUM_SUBS = [
  "Цели и метод",
  "Портрет каждого философа",
  "Новизна и ценность",
  "Структура документа",
  "Индекс когерентности",
  "Точки напряжения",
  "Оценка сложности",
];
function chunkify(s, n) {
  const out = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

/** Полный sum: первые 3 подраздела целиком + оборванный 4-й (≥250 симв.) */
function maxtokPartialSumHtml() {
  const done = SUM_SUBS.slice(0, 3)
    .map(
      (n, i) =>
        `<div class="doc-section" data-section="${n}"><p>ORIG-${i} «${n}»: ` +
        `соединение критической и диалектической традиций через двойное опосредование.</p></div>`,
    )
    .join("");
  const frag =
    `<div class="doc-section" data-section="${SUM_SUBS[3]}"><p>Начальный фрагмент структуры: ` +
    "перечень разделов открывается исполнительным резюме, за которым следует ".repeat(6);
  return done + frag; // div не закрыт — обрыв по лимиту токенов
}

function graphHtml() {
  const names = [
    "Трансцендентальное единство", "Диалектическое снятие", "Категорический императив",
    "Абсолютный дух", "Вещь в себе", "Историчность разума",
    "Синтетическое априори", "Опосредование", "Автономия воли", "Тотальность",
  ];
  const nodeRows = names.map((n, i) =>
    `<tr><td>${n}</td><td>${i % 2 ? "Эпистемологическая" : "Онтологическая"}</td>` +
    `<td>Определение «${n}».</td><td>0.${9 - (i % 5)}</td><td>0.${8 - (i % 4)}</td>` +
    `<td>${i % 2 ? "Гегель" : "Кант"}</td></tr>`).join("");
  const edges = [];
  for (let i = 0; i < 18; i++) {
    const a = names[i % 10], b = names[(i + 3) % 10];
    edges.push(`<tr><td>${a}</td><td>обусловливает</td><td>${b}</td>` +
      `<td>диалектическая</td><td>однонаправленная</td><td>0.${5 + (i % 5)}</td></tr>`);
  }
  const topo = names.map((n, i) =>
    `<tr><td>${n}</td><td>${i < 5 ? "I — Основания" : "II — Развёртывание"}</td>` +
    `<td>${i === 0 ? "центральная" : "периферийная"}</td><td>${i % 2 ? "антитезис" : "тезис"}</td></tr>`).join("");
  return `<div class="doc-section" data-section="Методология построения графа"><p>Диалектически.</p></div>` +
    `<div class="doc-section" data-section="Таблица категорий"><table class="doc-table"><thead><tr><th>Категория</th><th>Тип</th><th>Определение</th><th>Центральность</th><th>Определённость</th><th>Происхождение</th></tr></thead><tbody>${nodeRows}</tbody></table></div>` +
    `<div class="doc-section" data-section="Таблица связей"><table class="doc-table"><thead><tr><th>Источник</th><th>Описание</th><th>Цель</th><th>Тип</th><th>Направленность</th><th>Сила</th></tr></thead><tbody>${edges.join("")}</tbody></table></div>` +
    `<div class="doc-section" data-section="Топология графа"><div data-section="Топологическая таблица"><table class="doc-table"><thead><tr><th>Категория</th><th>Кластер</th><th>Структурные роли</th><th>Процессуальные роли</th></tr></thead><tbody>${topo}</tbody></table></div></div>`;
}

function fullSumHtml() {
  return SUM_SUBS.map(
    (n, i) =>
      `<div class="doc-section" data-section="${n}"><p>Штатный подраздел №${i} «${n}» полного объёма.</p></div>`,
  ).join("");
}


const mockState = { billingOk: true, subRegens: 0, calls: [] };

function startMock() {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      let prompt = "";
      try {
        prompt = JSON.parse(body).messages?.[0]?.content ?? "";
      } catch { /* пустой промпт */ }
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      const sse = () =>
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      const stream = async (html, stop = "end_turn") => {
        sse();
        send({ type: "message_start", message: { usage: { input_tokens: Math.ceil(prompt.length / 4) } } });
        for (const ch of chunkify(html, 220)) {
          send({ type: "content_block_delta", delta: { type: "text_delta", text: ch } });
          await sleep(15);
        }
        send({ type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: Math.ceil(html.length / 4) } });
        send({ type: "message_stop" });
        res.end();
      };
      const reject400 = () => {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({
          error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." },
        }));
      };

      /* подраздельная догенерация — ПЕРВОЙ: маркеры сценариев есть в каждом промпте */
      const subM = prompt.match(/(Перегенерируй|Доработай|Заверши) ТОЛЬКО секцию:\s*\n\s*«([^»]+)»/);
      if (subM) {
        mockState.subRegens++;
        mockState.calls.push("sub");
        await stream(`<div class="doc-section" data-section="${subM[2]}"><p>ДОГЕН «${subM[2]}»: подраздел догенерирован.</p></div>`);
        return;
      }
      const isGraph = prompt.includes("Таблица категорий");
      if (!mockState.billingOk && ((prompt.includes("[MOCK:BILLSUM]") && !isGraph) || (prompt.includes("[MOCK:BILLGRAPH]") && isGraph))) {
        mockState.calls.push(isGraph ? "graph:400" : "sum:400");
        reject400();
        return;
      }
      if (prompt.includes("[MOCK:MAXTOK]") && !isGraph) {
        mockState.calls.push("sum:maxtok");
        await stream(maxtokPartialSumHtml(), "max_tokens");
        return;
      }
      mockState.calls.push(isGraph ? "graph" : "sum");
      await stream(isGraph ? graphHtml() : fullSumHtml());
    });
  });
  return new Promise((resolve) => srv.listen(MOCK_PORT, "127.0.0.1", () => resolve(srv)));
}

/* ════ Сервер ════════════════════════════════════════════════════════ */

let serverProc = null;
let serverLog = "";

async function startServer() {
  serverProc = spawn("npx", ["tsx", "index.ts"], {
    cwd: new URL("../server/", import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
      ANTHROPIC_API_KEY: "mock-key-ok",
      DATABASE_URL: DB_URL,
      REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
      BILLING_ENFORCE: "true",
      BILLING_MARKUP: String(MARKUP),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProc.stdout.on("data", (d) => (serverLog += d));
  serverProc.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch { /* поднимается */ }
    await sleep(300);
  }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-2000));
}

const sql = postgres(DB_URL, { max: 2, onnotice: () => {} });

/** Пользователь с балансом (без подписки и своего ключа — плательщик 'balance'). */
async function makeUser(tag, balance = 5) {
  const email = `tcr-${tag}-${Date.now()}@test.local`;
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
  const [u] = await sql`UPDATE users SET balance_usd = ${balance} WHERE email = ${email} RETURNING id`;
  return { id: u.id, token: m[1], cookieHeader: `philosynth_session=${m[1]}` };
}
const setBalance = (uid, v) => sql`UPDATE users SET balance_usd = ${v} WHERE id = ${uid}`;

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


/** Учёт синтеза: вызовы 'balance' по разделам и транзакции списания. */
async function ledger(id) {
  const calls = await sql`SELECT section_key, cost_usd::float8 AS cost FROM api_usage WHERE synthesis_id = ${id} AND billing_mode = 'balance' ORDER BY created_at`;
  const txs = await sql`SELECT (-amount_usd)::float8 AS usd FROM transactions WHERE synthesis_id = ${id} AND type = 'usage' ORDER BY created_at`;
  return { calls, txs, waived: calls.length - txs.length };
}
const near = (a, b) => Math.abs(a - b) <= 1e-5 + Math.abs(b) * 1e-3;
const BODY = (seed) => ({
  seed, philosophers: ["Кант", "Гегель"], sections: ["graph"],
  method: "dialectical", depth: "overview", synthLevel: "comparative",
});
const done = (c, id, label) => c.waitFor(
  (m) => m.type === "generation_complete" && m.synthesisId === id, 60_000, label);
const paused = (c, id, label) => c.waitFor(
  (m) => m.type === "generation_paused" && m.synthesisId === id, 30_000, label);

/** Синтез до паузы: возвращает id, соединение и сообщение паузы. */
async function toPause(auth, seed, label) {
  const c = wsConnect(auth.token);
  await c.open();
  const p = await post(auth, BODY(seed));
  if (p.status !== 201) throw new Error(`${label}: POST ${p.status} ${JSON.stringify(p.body)}`);
  const msg = await paused(c, p.body.id, `paused ${label}`);
  return { id: p.body.id, c, msg };
}

async function main() {
  await startMock();
  await startServer();

  /* ══ R1: retry — повтор прерванного раздела без списания, следующий — платно ══ */
  console.log("\n■ R1: retry после сбоя — повтор sum без списания, graph списан");
  {
    const auth = await makeUser("r1");
    mockState.billingOk = false;
    const { id, c, msg } = await toPause(auth, "[MOCK:BILLSUM] Сбой на первом разделе", "R1");
    ok(msg.reasonKind === "billing" && msg.estimates?.serviceFailure === true, "R1: пауза 'billing' под серверным ключом — сбой службы (serviceFailure)", msg.estimates);
    ok(msg.estimates?.skipRemaining > 0, "R1: после прерванного раздела есть продолжение (skipRemaining > 0)", msg.estimates);
    const before = await ledger(id);
    mockState.billingOk = true;
    c.send({ type: "resume_generation", synthesisId: id, mode: "retry" });
    await done(c, id, "complete R1");
    const l = await ledger(id);
    const fresh = l.calls.slice(before.calls.length);
    ok(fresh.length === 2 && fresh[0].section_key === "sum" && fresh[1].section_key === "graph", "R1: после возобновления два вызова — sum, graph", fresh);
    ok(l.txs.length - before.txs.length === 1, "R1: списание одно (из двух вызовов)", { txs: l.txs, before: before.txs });
    ok(near(l.txs.at(-1)?.usd ?? -1, (fresh[1]?.cost ?? 0) * MARKUP), "R1: списан именно graph (себестоимость × наценка), повтор sum — без списания", { tx: l.txs.at(-1), graph: fresh[1], sum: fresh[0] });
    const ch = await (await fetch(`${BASE}/syntheses/${id}/charges`, { headers: { cookie: auth.cookieHeader } })).json();
    ok(ch.waivedCalls === 1 && near(ch.balanceUsd, l.txs.reduce((a, t) => a + t.usd, 0)), "R1: GET /charges — один вызов без списания, сумма с баланса = транзакциям", ch);
    c.close();
  }

  /* ══ R2: skip — бесплатного нет ══ */
  console.log("\n■ R2: skip после сбоя — следующий раздел списан, бесплатных вызовов нет");
  {
    const auth = await makeUser("r2");
    mockState.billingOk = false;
    const { id, c } = await toPause(auth, "[MOCK:BILLSUM] Сбой на первом разделе, пропуск", "R2");
    const before = await ledger(id);
    c.send({ type: "resume_generation", synthesisId: id, mode: "skip" });
    await done(c, id, "complete R2");
    mockState.billingOk = true;
    const l = await ledger(id);
    const fresh = l.calls.slice(before.calls.length);
    ok(fresh.length === 1 && fresh[0].section_key === "graph", "R2: после пропуска один вызов — graph", fresh);
    ok(l.txs.length - before.txs.length === 1 && near(l.txs.at(-1)?.usd ?? -1, (fresh[0]?.cost ?? 0) * MARKUP) && l.waived === before.waived, "R2: graph списан, вызовов без списания не прибавилось", { l, before });
    c.close();
  }

  /* ══ R3: fill-missing-subs — догенерация без списания, следующий раздел платно ══ */
  console.log("\n■ R3: догенерация подразделов без списания, graph списан");
  {
    const auth = await makeUser("r3");
    mockState.subRegens = 0;
    const { id, c, msg } = await toPause(auth, "[MOCK:MAXTOK] Обрыв по лимиту токенов", "R3");
    ok(msg.reasonKind === "max-tokens" && msg.isPartial === true && msg.estimates?.serviceFailure === true, "R3: пауза max-tokens, isPartial, serviceFailure", { k: msg.reasonKind, e: msg.estimates });
    const before = await ledger(id);
    ok(before.calls.length === 1 && before.txs.length === 1, "R3: оборванный вызов sum списан при первом прогоне (сбой его не обнуляет)", before);
    c.send({ type: "resume_generation", synthesisId: id, mode: "fill-missing-subs" });
    await done(c, id, "complete R3");
    const l = await ledger(id);
    const fresh = l.calls.slice(before.calls.length);
    const subs = mockState.subRegens;
    ok(subs >= 1 && fresh.length === subs + 1 && fresh.at(-1)?.section_key === "graph", `R3: вызовы после возобновления — ${subs} догенераций и graph`, fresh);
    ok(l.txs.length - before.txs.length === 1 && near(l.txs.at(-1)?.usd ?? -1, (fresh.at(-1)?.cost ?? 0) * MARKUP), "R3: списан один вызов — graph", { txs: l.txs, graph: fresh.at(-1) });
    ok(l.waived === subs, `R3: без списания — ровно догенерации (${subs})`, { waived: l.waived });
    c.close();
  }

  /* ══ R4: порог баланса, когда за починкой идёт платное продолжение ══ */
  console.log("\n■ R4: починка с платным продолжением — пустой баланс не пускает");
  {
    const auth = await makeUser("r4");
    mockState.billingOk = false;
    const { id, c } = await toPause(auth, "[MOCK:BILLSUM] Сбой, затем пустой баланс", "R4");
    mockState.billingOk = true;
    await setBalance(auth.id, 0);
    c.send({ type: "resume_generation", synthesisId: id, mode: "retry" });
    const err = await c.waitFor((m) => m.type === "stream_error" && m.synthesisId === id, 15_000, "stream_error R4");
    const [row] = await sql`SELECT status, paused_state IS NOT NULL AS has_ps FROM syntheses WHERE id = ${id}`;
    ok(/BILLING_REQUIRED|INSUFFICIENT_BALANCE/.test(err.error) && row.status === "paused" && row.has_ps, "R4: возобновление отклонено кодом биллинга, синтез остался на паузе", { err: err.error, row });
    const l0 = await ledger(id);
    await setBalance(auth.id, 5);
    c.send({ type: "resume_generation", synthesisId: id, mode: "retry" });
    await done(c, id, "complete R4");
    const l = await ledger(id);
    ok(l.calls.length - l0.calls.length === 2 && l.txs.length - l0.txs.length === 1, "R4: после пополнения — повтор sum без списания, graph списан", { l, l0 });
    c.close();
  }

  /* ══ R5: прерван последний раздел — починка без порога и без списания ══ */
  console.log("\n■ R5: починка последнего раздела — при пустом балансе, без списания");
  {
    const auth = await makeUser("r5");
    mockState.billingOk = false;
    const { id, c, msg } = await toPause(auth, "[MOCK:BILLGRAPH] Сбой на последнем разделе", "R5");
    ok(msg.estimates?.skipRemaining === 0, "R5: продолжения нет (skipRemaining = 0)", msg.estimates);
    const before = await ledger(id);
    ok(before.calls.length === 1 && before.txs.length === 1, "R5: sum первого прогона списан", before);
    mockState.billingOk = true;
    await setBalance(auth.id, 0);
    c.send({ type: "resume_generation", synthesisId: id, mode: "retry" });
    await done(c, id, "complete R5");
    const l = await ledger(id);
    const [u] = await sql`SELECT balance_usd::float8 AS b FROM users WHERE id = ${auth.id}`;
    ok(l.calls.length === 2 && l.txs.length === 1 && l.waived === 1 && u.b === 0, "R5: graph повторён без списания, баланс не тронут (0)", { l, balance: u.b });
    c.close();
  }

  console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗`);
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
