/**
 * Беседа 1.4b — тестовые запросы 2–6 протокола (07 [837–843]) одним заходом.
 *
 * Живой сервер (child tsx index.ts) + живые PG/Redis + МОК Claude API
 * (паттерн test-14; ANTHROPIC_BASE_URL). Сценарии — маркеры в seed:
 *   [MOCK:MAXTOK]    → полный sum-промпт: частичный ответ (3 полных
 *                      подраздела + оборванный 4-й ≥250 симв.) со
 *                      stop_reason "max_tokens"          (R2)
 *   [MOCK:BILLGRAPH] → graph-промпт при billingOk=false: 400 credit
 *                      balance; «пополнение» — POST /control  (R3, R4, R6)
 *   [MOCK:PARTIAL]   → destroy сокета посреди стрима      (R5, как test-14)
 * Подраздельная перегенерация (fill-missing-subs) распознаётся по
 * «ТОЛЬКО секцию:\n\n«Имя»» — мок отвечает одним div data-section и
 * записывает свойства промпта (verb, НАЧАЛЬНЫЙ ФРАГМЕНТ, intra-контекст)
 * в /stats для проверок «готовые идут контекстом».
 *
 * R4 (персистентность): GET /syntheses/:id — беседа 1.6, роута ещё нет;
 * персистентность паузы через рестарт проверяется SQL-чтением
 * syntheses.paused_state + reconnect-протоколом §3.3 (?resume= →
 * generation_paused с estimates из pausedState) — задокументированное
 * отступление от буквы 07.
 *
 * Запуск: node tests/test-14b-requests2-6.mjs  (PG+Redis подняты, сиды засеяны)
 */
import { spawn } from "node:child_process";
import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";

const SERVER_PORT = 3124;
const MOCK_PORT = 3988;
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

const SUM_SUBS = [
  "Цели и метод",
  "Портрет каждого философа",
  "Новизна и ценность",
  "Структура документа",
  "Индекс когерентности",
  "Точки напряжения",
  "Оценка сложности",
];

const mockState = {
  billingOk: false,
  billingRejects: 0,
  subRegens: [], // { name, verb, hasInitialFragment, fragmentEcho, hasIntraCtx, intraHasOrig }
  totalCalls: 0,
};

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

function startMock() {
  const srv = http.createServer((req, res) => {
    if (req.url === "/stats") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(mockState));
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      if (req.url === "/control") {
        const c = JSON.parse(body || "{}");
        if (typeof c.billingOk === "boolean") mockState.billingOk = c.billingOk;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ billingOk: mockState.billingOk }));
        return;
      }
      mockState.totalCalls++;
      let prompt = "";
      try {
        prompt = JSON.parse(body).messages?.[0]?.content ?? "";
      } catch { /* пустой промпт */ }

      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      const sse = () =>
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });

      /* ── Подраздельная перегенерация (fill-missing-subs) — ПЕРВОЙ:
            маркеры сценариев сидят в seed и есть в каждом промпте ── */
      const subM = prompt.match(/(Перегенерируй|Доработай|Заверши) ТОЛЬКО секцию:\s*\n\s*«([^»]+)»/);
      if (subM) {
        const verb = subM[1];
        const name = subM[2];
        const fragM = prompt.match(/НАЧАЛЬНЫЙ ФРАГМЕНТ ПОДРАЗДЕЛА[^"]*"""\n([\s\S]*?)\n"""/);
        const intraM = prompt.match(/КОНТЕКСТ ДРУГИХ ПОДРАЗДЕЛОВ ЭТОГО РАЗДЕЛА[^"]*"""\n([\s\S]*?)\n"""/);
        mockState.subRegens.push({
          name,
          verb,
          hasInitialFragment: !!fragM,
          fragmentEcho: fragM ? fragM[1].slice(0, 60) : "",
          hasIntraCtx: !!intraM,
          intraHasOrig: !!intraM && intraM[1].includes("ORIG-"),
        });
        const html =
          `<div class="doc-section" data-section="${name}"><p>ДОГЕН «${name}»: ` +
          `подраздел догенерирован с учётом готовых как контекста (${verb.toLowerCase()}).</p></div>`;
        sse();
        send({ type: "message_start", message: { usage: { input_tokens: Math.ceil(prompt.length / 4) } } });
        for (const ch of chunkify(html, 120)) {
          send({ type: "content_block_delta", delta: { type: "text_delta", text: ch } });
          await sleep(25);
        }
        send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: Math.ceil(html.length / 4) } });
        send({ type: "message_stop" });
        res.end();
        return;
      }

      const isGraphPrompt = prompt.includes("Таблица категорий");

      /* ── R3/R4/R6: 400 credit balance на graph до «пополнения» ── */
      if (prompt.includes("[MOCK:BILLGRAPH]") && isGraphPrompt && !mockState.billingOk) {
        mockState.billingRejects++;
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({
          error: { type: "invalid_request_error",
            message: "Your credit balance is too low to access the Anthropic API." },
        }));
        return;
      }

      /* ── R5: обрыв сокета посреди стрима ── */
      const partial = prompt.includes("[MOCK:PARTIAL]");

      /* ── R2: stop_reason max_tokens на полном sum-промпте ── */
      if (prompt.includes("[MOCK:MAXTOK]") && !isGraphPrompt) {
        const html = maxtokPartialSumHtml();
        sse();
        send({ type: "message_start", message: { usage: { input_tokens: Math.ceil(prompt.length / 4) } } });
        for (const ch of chunkify(html, 200)) {
          send({ type: "content_block_delta", delta: { type: "text_delta", text: ch } });
          await sleep(25);
        }
        send({ type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 500 } });
        send({ type: "message_stop" });
        res.end();
        return;
      }

      /* ── Штатный ответ ── */
      const html = isGraphPrompt ? graphHtml() : fullSumHtml();
      sse();
      send({ type: "message_start", message: { usage: { input_tokens: Math.ceil(prompt.length / 4) } } });
      const chunks = chunkify(html, 220);
      for (let i = 0; i < chunks.length; i++) {
        send({ type: "content_block_delta", delta: { type: "text_delta", text: chunks[i] } });
        if (partial && i >= 3) {
          res.destroy(); // настоящий обрыв посреди стрима
          return;
        }
        await sleep(30);
      }
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: Math.ceil(html.length / 4) } });
      send({ type: "message_stop" });
      res.end();
    });
  });
  return new Promise((resolve) => srv.listen(MOCK_PORT, "127.0.0.1", () => resolve(srv)));
}

async function mockControl(billingOk) {
  await fetch(`http://127.0.0.1:${MOCK_PORT}/control`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ billingOk }),
  });
}

/* ════ Обвязка сервера и WS (паттерн test-14) ════════════════════════ */

let serverProc;
let serverLog = "";

async function startServer() {
  serverLog = "";
  serverProc = spawn("npx", ["tsx", "index.ts"], {
    cwd: new URL("../server/", import.meta.url).pathname,
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
    } catch { /* поднимается */ }
    await sleep(300);
  }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-2000));
}

async function stopServer() {
  serverProc?.kill("SIGKILL");
  await sleep(700);
}

async function makeUser(tag) {
  const email = `t14b-${tag}-${Date.now()}@test.local`;
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
  const auth = await makeUser("a");

  /* ══ R2: max-tokens → пауза isPartial → fill-missing-subs ══ */
  console.log("\n■ R2: max-tokens → fill-missing-subs");
  const c2 = wsConnect(auth.token);
  await c2.open();
  const p2 = await post(auth, {
    seed: "[MOCK:MAXTOK] Синтез, упирающийся в лимит токенов",
    philosophers: ["Кант", "Гегель"],
    sections: [], method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  ok(p2.status === 201, "R2: POST принят");
  const id2 = p2.body.id;
  const paused2 = await c2.waitFor(
    (m) => m.type === "generation_paused" && m.synthesisId === id2, 30_000, "paused max-tokens");
  ok(paused2.reasonKind === "max-tokens", 'R2: reasonKind = "max-tokens"');
  ok(paused2.isPartial === true, "R2: isPartial = true");
  ok((paused2.partialSubsections ?? []).length === 4 &&
     SUM_SUBS.slice(0, 3).every((n) => paused2.partialSubsections.includes(n)),
    `R2: partialSubsections заполнен (${(paused2.partialSubsections ?? []).length}: 3 done + оборванный)`);
  ok((paused2.expectedSubsections ?? []).length === 7,
    `R2: expectedSubsections = 7 подразделов sum (${(paused2.expectedSubsections ?? []).length})`);
  ok(typeof paused2.estimates?.fillMissingSubs === "number" && paused2.estimates.fillMissingSubs > 0,
    `R2: estimates.fillMissingSubs > 0 (${paused2.estimates?.fillMissingSubs})`);
  ok(typeof paused2.estimates?.wholeSection === "number" && paused2.estimates.wholeSection > 0,
    `R2: estimates.wholeSection > 0 (${paused2.estimates?.wholeSection})`);
  ok(paused2.estimates?.fillMissingSubs < paused2.estimates?.wholeSection,
    "R2: догенерация дешевле полной перегенерации");
  ok(paused2.estimates?.skipRemaining === 0, "R2: skipRemaining = 0 (последний pass)");
  const [row2] = await sql`SELECT status, paused_state FROM syntheses WHERE id = ${id2}`;
  ok(row2.status === "paused" && row2.paused_state?.kind === "gen", 'R2: status="paused", pausedState kind=gen');
  ok((row2.paused_state?.maxTokensUsed ?? 0) > 0,
    `R2: maxTokensUsed сохранён (${row2.paused_state?.maxTokensUsed})`);
  const [sec2] = await sql`SELECT html_content FROM sections WHERE synthesis_id = ${id2} AND key = 'sum'`;
  ok((sec2?.html_content ?? "").includes("ORIG-0"), "R2: частичный HTML (3 готовых подраздела) сохранён в sections");
  const [errRow2] = await sql`SELECT metadata FROM generation_log WHERE synthesis_id = ${id2} AND section_key = 'sum' AND status = 'error'`;
  const errSubs2 = errRow2?.metadata?.subsections ?? [];
  ok(errSubs2.some((s) => s.status === "streaming") && errSubs2.filter((s) => s.status === "done").length === 3,
    "R2: metadata.subsections error-строки: 3 done + 1 streaming");

  // Возобновление: догенерировать только недостающие
  c2.send({ type: "resume_generation", synthesisId: id2, mode: "fill-missing-subs" });
  const resumed2 = await c2.waitFor(
    (m) => m.type === "generation_resumed" && m.synthesisId === id2, 15_000, "generation_resumed R2");
  ok(resumed2.mode === "fill-missing-subs" && resumed2.fromPassIdx === 0,
    "R2: generation_resumed mode=fill-missing-subs, fromPassIdx=0");
  await c2.waitFor((m) => m.type === "generation_complete" && m.synthesisId === id2, 40_000, "complete R2");
  const dones2 = c2.messages.filter((m) => m.type === "section_done" && m.synthesisId === id2);
  ok(dones2.length === 4, `R2: section_done по каждому догенерированному подразделу (${dones2.length})`);
  const lastHtml2 = dones2[dones2.length - 1]?.html ?? "";
  ok(SUM_SUBS.every((n) => lastHtml2.includes(`data-section="${n}"`)),
    "R2: финальный html содержит все 7 подразделов");
  const [row2b] = await sql`SELECT status, paused_state FROM syntheses WHERE id = ${id2}`;
  ok(row2b.status === "ready" && row2b.paused_state === null,
    'R2: после догенерации status="ready", pausedState очищен');
  const [sec2b] = await sql`SELECT html_content FROM sections WHERE synthesis_id = ${id2} AND key = 'sum'`;
  const html2b = sec2b?.html_content ?? "";
  ok(SUM_SUBS.every((n) => html2b.includes(`data-section="${n}"`)), "R2: в БД — все 7 подразделов");
  ok(html2b.includes("ORIG-0") && html2b.includes("ORIG-1") && html2b.includes("ORIG-2"),
    "R2: готовые ДО обрыва подразделы сохранены дословно");
  ok((html2b.match(/ДОГЕН/g) ?? []).length === 4, "R2: догенерированы ровно 4 недостающих");
  ok(!html2b.includes("Начальный фрагмент структуры: перечень разделов открывается исполнительным резюме, за которым следует перечень"),
    "R2: оборванный див заменён завершённым (двойной вставки нет)");
  // «готовые идут контекстом» — по промптам мока
  const subs2 = mockState.subRegens.slice(0, 4);
  ok(subs2.length === 4 && subs2[0].name === SUM_SUBS[3] && subs2[0].verb === "Заверши" &&
     subs2[0].hasInitialFragment && subs2[0].fragmentEcho.includes("Начальный фрагмент структуры"),
    "R2: оборванный подраздел — режим «Заверши» с НАЧАЛЬНЫМ ФРАГМЕНТОМ (≥250 симв.)");
  ok(subs2.slice(1).every((s) => s.verb === "Перегенерируй" && !s.hasInitialFragment),
    "R2: остальные недостающие — с нуля («Перегенерируй»)");
  ok(subs2.every((s) => s.hasIntraCtx) && subs2[0].intraHasOrig,
    "R2: во всех промптах — КОНТЕКСТ ДРУГИХ ПОДРАЗДЕЛОВ (готовые идут контекстом)");
  ok(subs2.map((s) => s.name).join("|") === [SUM_SUBS[3], SUM_SUBS[4], SUM_SUBS[5], SUM_SUBS[6]].join("|"),
    "R2: порядок догенерации — оборванный первым, далее по expected");
  const [mk2] = await sql`SELECT
      count(*) FILTER (WHERE log_type = 'pause_marker')::int AS p,
      count(*) FILTER (WHERE log_type = 'resume_marker')::int AS r,
      count(*) FILTER (WHERE source = 'subsection_regen' AND status = 'done')::int AS s
    FROM generation_log WHERE synthesis_id = ${id2}`;
  ok(mk2.p === 1 && mk2.r === 1 && mk2.s === 4,
    `R2: маркеры и строки генлога (pause=${mk2.p}, resume=${mk2.r}, sub_regen done=${mk2.s})`);
  const intra2 = await sql`SELECT section_key FROM context_log WHERE synthesis_id = ${id2} AND section_key LIKE 'sum:%'`;
  ok(intra2.length === 4, `R2: intra-записи context_log 'sum:подраздел' ×4 (${intra2.length})`);
  c2.close();

  /* ══ R3: billing-пауза → «пополнение» → retry с того же раздела ══ */
  console.log("\n■ R3: billing-пауза → retry после пополнения");
  await mockControl(false);
  const c3 = wsConnect(auth.token);
  await c3.open();
  const p3 = await post(auth, {
    seed: "[MOCK:BILLGRAPH] Синтез с исчерпанным балансом",
    philosophers: ["Кант", "Гегель"],
    sections: ["graph"], method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  const id3 = p3.body.id;
  const paused3 = await c3.waitFor(
    (m) => m.type === "generation_paused" && m.synthesisId === id3, 30_000, "paused billing");
  ok(paused3.reasonKind === "billing", 'R3: reasonKind = "billing"');
  ok(paused3.isPartial === false, "R3: isPartial = false (обрыв до первого токена graph)");
  ok(/баланс/i.test(paused3.reason) && /console\.anthropic\.com/.test(paused3.reason),
    "R3: дружественное сообщение (_pauseFriendlyMessage) про баланс");
  const [row3] = await sql`SELECT status, paused_state FROM syntheses WHERE id = ${id3}`;
  ok(row3.paused_state?.passIdx === 1 &&
     JSON.stringify(row3.paused_state?.completedPasses) === '[["sum"]]',
    "R3: pausedState passIdx=1, completedPasses=[[sum]] (sum завершён до паузы)");
  ok(typeof paused3.estimates?.wholeSection === "number" && paused3.estimates.wholeSection > 0 &&
     paused3.estimates?.skipRemaining === 0,
    "R3: estimates — wholeSection > 0, skipRemaining = 0");
  // «пополнение баланса»
  await mockControl(true);
  c3.send({ type: "resume_generation", synthesisId: id3, mode: "retry" });
  const resumed3 = await c3.waitFor(
    (m) => m.type === "generation_resumed" && m.synthesisId === id3, 15_000, "resumed R3");
  ok(resumed3.mode === "retry" && resumed3.fromPassIdx === 1,
    "R3: generation_resumed mode=retry, fromPassIdx=1 (тот же раздел)");
  // ВАЖНО: первым section_done в накопленных сообщениях был sum (до паузы) —
  // ждём section_done именно перезапущенного graph
  const done3 = await c3.waitFor(
    (m) => m.type === "section_done" && m.synthesisId === id3 && m.sectionKey === "graph",
    30_000, "section_done R3");
  ok(done3.sectionKey === "graph", "R3: после retry сгенерирован именно graph");
  await c3.waitFor((m) => m.type === "generation_complete" && m.synthesisId === id3, 30_000, "complete R3");
  const gl3 = await sql`SELECT section_key, status, source, section_label FROM generation_log
    WHERE synthesis_id = ${id3} AND log_type = 'generation' AND section_key <> '_genCommon' ORDER BY created_at`;
  ok(gl3.filter((r) => r.section_key === "sum").length === 1,
    "R3: sum НЕ перегенерировался (одна строка генлога)");
  const graphRows3 = gl3.filter((r) => r.section_key === "graph");
  ok(graphRows3.length === 2 && graphRows3[0].status === "error" &&
     graphRows3[1].status === "done" && graphRows3[1].source === "resume" &&
     graphRows3[1].section_label.includes("[возобновление]"),
    "R3: graph — error + done(source=resume, метка [возобновление])");
  const [nCat3] = await sql`SELECT count(*)::int AS n FROM categories WHERE synthesis_id = ${id3}`;
  ok(nCat3.n >= 8, `R3: граф распарсен после возобновления (${nCat3.n} категорий)`);
  const [row3b] = await sql`SELECT status, paused_state FROM syntheses WHERE id = ${id3}`;
  ok(row3b.status === "ready" && row3b.paused_state === null, "R3: ready, pausedState очищен");
  c3.close();

  /* ══ R4: персистентность паузы через рестарт сервера ══ */
  console.log("\n■ R4: пауза переживает перезапуск сервера");
  await mockControl(false);
  const c4 = wsConnect(auth.token);
  await c4.open();
  const p4 = await post(auth, {
    seed: "[MOCK:BILLGRAPH] Персистентность паузы", philosophers: ["Кант"],
    sections: ["graph"], method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  const id4 = p4.body.id;
  await c4.waitFor((m) => m.type === "generation_paused" && m.synthesisId === id4, 30_000, "paused R4");
  c4.close();
  await stopServer(); // SIGKILL — «жёсткий» рестарт
  const [row4] = await sql`SELECT status, paused_state FROM syntheses WHERE id = ${id4}`;
  ok(row4.status === "paused" && row4.paused_state?.kind === "gen" &&
     row4.paused_state?.reasonKind === "billing" && !!row4.paused_state?.genParams,
    "R4: pausedState (kind, reasonKind, genParams) в БД после убийства сервера");
  await startServer(); // новый процесс: activeRuns пуст, Redis-буфера нет
  await mockControl(true);
  // GET /syntheses/:id — беседа 1.6; персистентность паузы клиенту отдаёт
  // reconnect-протокол §3.3: ?resume= → generation_paused из pausedState
  const c4b = wsConnect(auth.token, id4);
  await c4b.open();
  const paused4b = await c4b.waitFor(
    (m) => m.type === "generation_paused" && m.synthesisId === id4, 15_000, "paused после рестарта");
  ok(paused4b.reasonKind === "billing", "R4: после рестарта ?resume= отдаёт generation_paused из pausedState");
  ok(typeof paused4b.estimates?.wholeSection === "number" && paused4b.estimates.wholeSection > 0,
    "R4: estimates пересчитаны на новом процессе (из genParams)");
  c4b.send({ type: "resume_generation", synthesisId: id4, mode: "retry" });
  await c4b.waitFor((m) => m.type === "generation_complete" && m.synthesisId === id4, 40_000, "complete R4");
  const [row4b] = await sql`SELECT status, paused_state FROM syntheses WHERE id = ${id4}`;
  ok(row4b.status === "ready" && row4b.paused_state === null,
    "R4: resume работает после рестарта (ready, pausedState очищен)");
  c4b.close();

  /* ══ R5: stop — частичное фиксируется как финальное ══ */
  console.log("\n■ R5: stop");
  const c5 = wsConnect(auth.token);
  await c5.open();
  const p5 = await post(auth, {
    seed: "[MOCK:PARTIAL] Обрыв для остановки", philosophers: ["Кант"],
    sections: [], method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  const id5 = p5.body.id;
  const paused5 = await c5.waitFor(
    (m) => m.type === "generation_paused" && m.synthesisId === id5, 30_000, "paused R5");
  ok(paused5.reasonKind === "partial", 'R5: обрыв стрима → reasonKind = "partial"');
  const [sec5] = await sql`SELECT length(html_content)::int AS len FROM sections WHERE synthesis_id = ${id5} AND key = 'sum'`;
  const partialLen5 = sec5?.len ?? 0;
  ok(partialLen5 > 0, `R5: частичный контент в sections (${partialLen5} симв.)`);
  c5.send({ type: "resume_generation", synthesisId: id5, mode: "stop" });
  const resumed5 = await c5.waitFor(
    (m) => m.type === "generation_resumed" && m.synthesisId === id5, 15_000, "resumed R5");
  ok(resumed5.mode === "stop", "R5: generation_resumed mode=stop");
  await c5.waitFor((m) => m.type === "generation_complete" && m.synthesisId === id5, 15_000, "complete R5");
  const [row5] = await sql`SELECT status, paused_state FROM syntheses WHERE id = ${id5}`;
  const [sec5b] = await sql`SELECT length(html_content)::int AS len FROM sections WHERE synthesis_id = ${id5} AND key = 'sum'`;
  ok(row5.status === "ready", 'R5: status = "ready"');
  ok(row5.paused_state === null, "R5: pausedState очищен");
  ok((sec5b?.len ?? 0) === partialLen5, "R5: частичный контент зафиксирован как финальный (не тронут)");
  const [mk5] = await sql`SELECT
      count(*) FILTER (WHERE log_type = 'pause_marker')::int AS p,
      count(*) FILTER (WHERE log_type = 'resume_marker')::int AS r
    FROM generation_log WHERE synthesis_id = ${id5}`;
  const [rm5] = await sql`SELECT metadata FROM generation_log WHERE synthesis_id = ${id5} AND log_type = 'resume_marker'`;
  ok(mk5.p === 1 && mk5.r === 1 && rm5?.metadata?.mode === "stop",
    "R5: маркеры в логе (pause_marker + resume_marker mode=stop)");
  c5.close();

  /* ══ R6: edge cases ══ */
  console.log("\n■ R6: edge cases");
  // 6a. resume без pausedState (синтез уже ready)
  const c6 = wsConnect(auth.token);
  await c6.open();
  c6.send({ type: "resume_generation", synthesisId: id5, mode: "retry" });
  const err6a = await c6.waitFor(
    (m) => m.type === "stream_error" && m.synthesisId === id5, 10_000, "stream_error 6a");
  ok(err6a.error.includes("RESUME_INVALID"), `R6a: resume без pausedState → RESUME_INVALID («${err6a.error}»)`);
  // 6b. resume_plan на синтезе без плановой паузы
  c6.send({ type: "resume_plan", synthesisId: id5, planId: "00000000-0000-0000-0000-000000000000", mode: "retry" });
  const err6b = await c6.waitFor(
    (m) => m.type === "stream_error" && m.synthesisId === id5 && m.error !== err6a.error ||
           (m.type === "stream_error" && m.synthesisId === id5 && c6.messages.filter((x) => x.type === "stream_error").length >= 2),
    10_000, "stream_error 6b");
  ok(err6b.error.includes("RESUME_INVALID"), `R6b: resume_plan без плановой паузы → RESUME_INVALID`);
  // 6c. «чужой» mode
  const p6c = await post(auth, {
    seed: "[MOCK:PARTIAL] Пауза для чужого mode", philosophers: ["Кант"],
    sections: [], method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  const id6c = p6c.body.id;
  await c6.waitFor((m) => m.type === "generation_paused" && m.synthesisId === id6c, 30_000, "paused 6c");
  c6.send({ type: "resume_generation", synthesisId: id6c, mode: "bogus-mode" });
  const err6c = await c6.waitFor(
    (m) => m.type === "stream_error" && m.synthesisId === id6c, 10_000, "stream_error 6c");
  ok(err6c.error.includes("RESUME_INVALID"), 'R6c: «чужой» mode → RESUME_INVALID');
  // 6d. два resume подряд — второй отклонён, генерация не задвоена
  await mockControl(false);
  const p6d = await post(auth, {
    seed: "[MOCK:BILLGRAPH] Двойное возобновление", philosophers: ["Кант"],
    sections: ["graph"], method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  const id6d = p6d.body.id;
  await c6.waitFor((m) => m.type === "generation_paused" && m.synthesisId === id6d, 30_000, "paused 6d");
  await mockControl(true);
  c6.send({ type: "resume_generation", synthesisId: id6d, mode: "retry" });
  await sleep(300); // первый resume уже стримит graph (~1с)
  c6.send({ type: "resume_generation", synthesisId: id6d, mode: "retry" });
  const err6d = await c6.waitFor(
    (m) => m.type === "stream_error" && m.synthesisId === id6d, 10_000, "stream_error 6d");
  ok(/RESUME_INVALID|GENERATION_IN_PROGRESS/.test(err6d.error),
    `R6d: второй resume подряд отклонён («${err6d.error.slice(0, 60)}…»)`);
  await c6.waitFor((m) => m.type === "generation_complete" && m.synthesisId === id6d, 40_000, "complete 6d");
  const resumed6d = c6.messages.filter((m) => m.type === "generation_resumed" && m.synthesisId === id6d);
  ok(resumed6d.length === 1, `R6d: generation_resumed ровно один (${resumed6d.length})`);
  const [gr6d] = await sql`SELECT count(*)::int AS n FROM generation_log
    WHERE synthesis_id = ${id6d} AND section_key = 'graph'
      AND log_type = 'generation' AND status = 'done'`;
  ok(gr6d.n === 1, `R6d: graph сгенерирован ровно один раз (${gr6d.n})`);
  // 6e. resume чужого пользователя → FORBIDDEN
  const authB = await makeUser("b");
  const p6e = await post(authB, {
    seed: "[MOCK:PARTIAL] Чужая пауза", philosophers: ["Кант"],
    sections: [], method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  const id6e = p6e.body.id;
  const c6e = wsConnect(authB.token);
  await c6e.open();
  await c6e.waitFor((m) => m.type === "generation_paused" && m.synthesisId === id6e, 30_000, "paused 6e");
  c6.send({ type: "resume_generation", synthesisId: id6e, mode: "retry" }); // пользователь A
  const err6e = await c6.waitFor(
    (m) => m.type === "stream_error" && m.synthesisId === id6e, 10_000, "stream_error 6e");
  ok(err6e.error.includes("FORBIDDEN"), "R6e: resume чужого синтеза → FORBIDDEN");
  c6e.close();
  c6.close();

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
