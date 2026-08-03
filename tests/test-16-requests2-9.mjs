/**
 * Беседа 1.6 — тестовые запросы 2–9 протокола (07, «Последующие запросы»
 * беседы 1.6) одним заходом, по команде пользователя.
 *
 * Харнесс: живой сервер (child tsx index.ts) + живые PG/Redis + мок
 * Claude API (локальный SSE; ANTHROPIC_BASE_URL) — паттерн test-14/15.
 * АДАПТАЦИЯ: план предполагал часть A на mini-Hono app.request, но сервер
 * всё равно нужен (мок для POST/doc_num, WS для R8) — весь заход ведётся
 * против живого сервера, харнесс один.
 *
 * Прочие адаптации против формулировок 07 (дыры зафиксированы в шапке):
 *  - «создай через POST два синтеза → total=2»: помимо двух POST-синтезов
 *    в списке лежат прямые вставки (paused/generating) — total проверяется
 *    по фактическому числу своих записей;
 *  - приостановленный синтез для R3 вставляется в БД напрямую
 *    (paused_state kind='gen' с валидными genParams) — честная пауза
 *    требует мок-обрыва и тянет время; computePauseEstimates при этом
 *    работает по-настоящему (rebuildInfra на живых сидах);
 *  - «synтез со status='generating'» для R8a — прямая вставка без
 *    активного прогона (иначе ветка viewOnly не отличима от подписки
 *    на живой прогон); «события доходят» — R8b на живом прогоне;
 *  - сверх протокола: смоук POST /:id/duplicate (эндпоинт пункта 7 не
 *    покрыт ни одним из восьми тестов) и GET /sections/:key/context
 *    (эндпоинт пункта 2, та же дыра) — помечены [extra].
 *
 * Запуск: node tests/test-16-requests2-9.mjs (корень репо; PG+Redis
 * подняты, миграции+сиды применены).
 */
import { spawn } from "node:child_process";
import http from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";

const SERVER_PORT = 3126;
const MOCK_PORT = 3992;
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

/* ════ Мок Claude API (по test-14; сниффинг — от lastIndexOf("ЗАДАНИЕ"),
       грабля 1.5) ═══════════════════════════════════════════════════ */

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
    `<div class="doc-section" data-section="Переопределённые термины"><p><strong>${NODE_NAMES[0]}</strong> — переосмыслен.</p></div>` +
    `<div class="doc-section" data-section="Новые термины"><p><strong>${NODE_NAMES[9]}</strong> — введён впервые.</p></div>`;
}

function thesesHtml() {
  const rows = NODE_NAMES.slice(0, 6).map((n, i) =>
    `<tr><td>${i + 1}</td><td>Тезис о том, что ${n.toLowerCase()} образует ядро синтеза.</td>` +
    `<td>${["онтол.", "эпистем.", "этич."][i % 3]}</td><td>высокая</td><td>${n}, ${NODE_NAMES[(i + 1) % 10]}</td></tr>`).join("");
  return `<div class="doc-section" data-section="Онтологические тезисы"><p><strong>Тезис о том, что ${NODE_NAMES[0].toLowerCase()} образует ядро синтеза.</strong> Обоснование.</p></div>` +
    `<div class="doc-section" data-section="Сводная таблица тезисов"><table class="doc-table"><thead><tr><th>№</th><th>Формулировка тезиса</th><th>Тип</th><th>Степень новизны</th><th>Связанные категории</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function sumHtml() {
  return `<div class="doc-section" data-section="Цели и задачи"><p>Цель синтеза — соединить критическую и диалектическую традиции.</p></div>` +
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
      const chunks = chunkify(html, 300);
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      send({ type: "message_start", message: { usage: { input_tokens: Math.ceil(prompt.length / 4) } } });
      for (const chunk of chunks) {
        send({ type: "content_block_delta", delta: { type: "text_delta", text: chunk } });
        await sleep(15);
      }
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: Math.ceil(html.length / 4) } });
      send({ type: "message_stop" });
      res.end();
    });
  });
  return new Promise((resolve) => srv.listen(MOCK_PORT, "127.0.0.1", () => resolve(srv)));
}

/* ════ Обвязка сервера, auth, WS (по test-14) ════════════════════════ */

let serverProc;
let serverLog = "";

async function startServer() {
  /* Преflight: если health уже отвечает — на порту сирота от прошлого
     прогона; работать о чужой сервер нельзя (ГРАБЛЯ: SIGTERM npx-обёртке
     не убивает node-ребёнка tsx; лечится detached + kill(-pid) ниже). */
  try {
    const r = await fetch(`${BASE}/health`);
    if (r.ok) {
      throw new Error(
        `порт ${SERVER_PORT} уже занят чужим сервером — убейте сироту: ` +
        `pkill -9 -f "[t]sx"`,
      );
    }
  } catch (e) {
    if (String(e).includes("уже занят")) throw e;
    /* ECONNREFUSED — порт свободен, норма */
  }
  // node --import tsx: serverProc — САМ сервер, без npx/tsx-обёрток,
  // чей SIGTERM оставлял node-ребёнка сиротой на порту
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
      // Лимитер ключуется по IP (127.0.0.1 общий для прогонов, окно 60с):
      // один заход ~70 запросов — соседние прогоны выбивали 429 с середины.
      // Лимитер — предмет тестов 0.2; здесь поднимаем порог.
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
    } catch { /* ещё поднимается */ }
    await sleep(300);
  }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-2000));
}

async function makeUser(tag) {
  const email = `t16-${tag}-${Date.now()}@test.local`;
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

async function mockCalls() {
  const r = await fetch(`http://127.0.0.1:${MOCK_PORT}/stats`);
  return (await r.json()).totalCalls;
}

const DOC_NUM_RE = /^PS-\d{4}-[0-9A-Z]{4}$/;

/* ════ Сценарии ══════════════════════════════════════════════════════ */

const sql = postgres(DB_URL, { max: 2, onnotice: () => {} });

let mockSrv;

async function main() {
  mockSrv = await startMock();
  await startServer();
  const A = await makeUser("owner");
  const B = await makeUser("other");
  const [uRow] = await sql`SELECT id FROM users WHERE email = ${A.email}`;
  const userAId = uRow.id;

  /* ── Данные: S1, S2 через POST (живая мок-генерация) ── */
  console.log("\n■ Подготовка: два POST-синтеза через мок");
  const cA = wsConnect(A.token);
  await cA.open();
  const p1 = await api(A, "POST", "/syntheses", {
    seed: "Синтез критики и диалектики",
    philosophers: ["Кант", "Гегель"],
    sections: ["graph", "glossary"],
    method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  ok(p1.status === 201 && !!p1.body?.id, "подготовка: POST S1 → 201");
  const S1 = p1.body.id;
  await cA.waitFor((m) => m.type === "generation_complete" && m.synthesisId === S1,
    60_000, "complete S1");
  const p2 = await api(A, "POST", "/syntheses", {
    seed: "Синтез с тезисами",
    philosophers: ["Кант"],
    sections: ["theses"],
    method: "integrative", depth: "overview", synthLevel: "comparative",
  });
  ok(p2.status === 201 && !!p2.body?.id, "подготовка: POST S2 → 201");
  const S2 = p2.body.id;
  await cA.waitFor((m) => m.type === "generation_complete" && m.synthesisId === S2,
    60_000, "complete S2");

  /* ── Данные: S3 (paused) и S4 (generating) — прямые вставки ── */
  const genParams = {
    seed: "Приостановленный синтез", phil: ["Кант", "Гегель"],
    participants: [
      { type: "philosopher", name: "Кант" },
      { type: "philosopher", name: "Гегель" },
    ],
    sec: ["graph"], method: "dialectical", synthLevel: "comparative",
    depth: "overview", generationOrder: "architectural",
    extGraphMetrics: false, ctx: "", lang: "Russian", keepFullBudget: false,
  };
  const pausedState = {
    kind: "gen", passIdx: 1, sectionKeys: ["graph"],
    sectionLabel: "Граф категорий", isPartial: false,
    reason: "Баланс API исчерпан", reasonKind: "billing",
    timestamp: Date.now(), partialSubsections: [], expectedSubsections: [],
    completedPasses: [["sum"]], genParams,
  };
  const [s3row] = await sql`
    INSERT INTO syntheses (user_id, seed, method, synth_level, depth,
      generation_order, title, doc_num, status, section_order,
      structure_sections, paused_state)
    VALUES (${userAId}, ${"Приостановленный синтез"}, 'dialectical',
      'comparative', 'overview', 'architectural',
      ${"Приостановленный синтез (S3)"}, ${"PS-1234-TEST"}, 'paused',
      ${sql.json(["sum", "graph"])}, ${sql.json(["sum", "graph"])},
      ${sql.json(pausedState)})
    RETURNING id`;
  const S3 = s3row.id;
  await sql`INSERT INTO synthesis_lineage (synthesis_id, parent_type, parent_name, position)
    VALUES (${S3}, 'philosopher', 'Кант', 0), (${S3}, 'philosopher', 'Гегель', 1)`;
  const [s4row] = await sql`
    INSERT INTO syntheses (user_id, seed, method, synth_level, depth,
      generation_order, title, doc_num, status, section_order)
    VALUES (${userAId}, ${"Зависший синтез"}, 'dialectical', 'comparative',
      'overview', 'architectural', ${"Зависший в generating (S4)"},
      ${"PS-5678-TEST"}, 'generating', ${sql.json(["sum"])})
    RETURNING id`;
  const S4 = s4row.id;

  /* ═══ R2: GET /syntheses — список своих ═══ */
  console.log("\n■ R2: GET /syntheses (список, фильтры, пагинация)");
  const list1 = await api(A, "GET", "/syntheses");
  ok(list1.status === 200, "R2: GET /syntheses → 200");
  const items1 = list1.body?.items ?? [];
  ok(items1.some((s) => s.id === S1) && items1.some((s) => s.id === S2),
    "R2: оба POST-синтеза в items");
  ok(list1.body?.total === 4, `R2: total = 4 (все свои; факт ${list1.body?.total})`);
  ok(items1[0]?.id === S4,
    "R2: сортировка по createdAt desc по умолчанию (первый — последний созданный)");
  ok(items1.every((s) => Array.isArray(s.philosophers)),
    "R2: SynthesisPreview.philosophers — массив");
  const s1prev = items1.find((s) => s.id === S1);
  ok(s1prev?.philosophers?.join(",") === "Кант,Гегель",
    "R2: философы превью — из lineage, в порядке position");

  const patched = await api(A, "PATCH", `/syntheses/${S1}`, {
    title: "Кантовско-гегелевский синтез-16",
  });
  ok(patched.status === 200 &&
    patched.body?.synthesis?.title === "Кантовско-гегелевский синтез-16",
    "R2: PATCH title (для теста поиска) → 200, title обновлён");
  const bySearch = await api(A, "GET", "/syntheses?search=гегелевский");
  ok(bySearch.body?.total === 1 && bySearch.body?.items?.[0]?.id === S1,
    "R2: ?search= частичное совпадение title");
  const byStatus = await api(A, "GET", "/syntheses?status=ready");
  ok(byStatus.body?.total === 2 &&
    byStatus.body?.items.every((s) => s.status === "ready"),
    "R2: ?status=ready → только готовые (2)");
  const byMethod = await api(A, "GET", "/syntheses?method=integrative");
  ok(byMethod.body?.total === 1 && byMethod.body?.items?.[0]?.id === S2,
    "R2: ?method= фильтр");
  const paged = await api(A, "GET", "/syntheses?page=2&limit=3");
  ok(paged.body?.items?.length === 1 && paged.body?.total === 4,
    "R2: ?page=&limit= (page=2, limit=3 → 1 остаток, total прежний)");
  const badStatus = await api(A, "GET", "/syntheses?status=bogus");
  ok(badStatus.status === 400 && badStatus.body?.code === "VALIDATION_ERROR",
    "R2: неизвестный ?status= → 400 VALIDATION_ERROR");

  /* ═══ R3: GET /syntheses/:id — SynthesisFull ═══ */
  console.log("\n■ R3: GET /syntheses/:id (SynthesisFull, пауза)");
  const full1 = (await api(A, "GET", `/syntheses/${S1}`)).body?.synthesis;
  ok(!!full1, "R3: GET S1 → synthesis");
  ok(JSON.stringify(full1?.sectionOrder) === JSON.stringify(["sum", "graph", "glossary"]),
    "R3: sectionOrder");
  ok(DOC_NUM_RE.test(full1?.docNum ?? ""), `R3: docNum по маске (${full1?.docNum})`);
  ok(full1?.philosophers?.join(",") === "Кант,Гегель", "R3: философы из lineage");
  ok(typeof full1?.capsuleHtml === "string", "R3: capsuleHtml — строка");
  ok(typeof full1?.totalCostUsd === "number" && full1.totalInputTokens > 0,
    "R3: totalCostUsd число, totalInputTokens > 0 (usage мока)");
  ok(full1?.pausedState === null && full1?.pauseEstimates === null,
    "R3: обычный синтез — pausedState и pauseEstimates = null");
  ok(full1?.status === "ready", "R3: статус ready после генерации");

  const full3 = (await api(A, "GET", `/syntheses/${S3}`)).body?.synthesis;
  ok(full3?.pausedState?.kind === "gen" &&
    full3?.pausedState?.reasonKind === "billing",
    "R3: приостановленный — pausedState kind='gen', reasonKind='billing'");
  ok(full3?.pauseEstimates !== null && typeof full3?.pauseEstimates === "object",
    "R3: pauseEstimates — объект (не null)");
  ok(typeof full3?.pauseEstimates?.wholeSection === "number",
    `R3: estimates.wholeSection — число (${full3?.pauseEstimates?.wholeSection})`);
  ok(typeof full3?.pauseEstimates?.skipRemaining === "number",
    "R3: estimates.skipRemaining — число (rebuildInfra на живых сидах)");

  /* ═══ R4: доступ (403/404, публикация) ═══ */
  console.log("\n■ R4: доступ — чужой/публичный/несуществующий");
  ok((await api(B, "GET", `/syntheses/${S1}`)).status === 403,
    "R4: чужой непубличный GET /:id → 403");
  ok((await api(B, "GET", `/syntheses/${S1}/sections`)).status === 403,
    "R4: чужой непубличный /sections → 403");
  ok((await api(B, "GET", `/syntheses/${S1}/categories`)).status === 403,
    "R4: чужой непубличный /categories → 403");
  ok((await api(B, "PATCH", `/syntheses/${S1}`, { isPublic: true })).status === 403,
    "R4: PATCH чужого → 403 (только владелец)");
  ok((await api(B, "DELETE", `/syntheses/${S1}`)).status === 403,
    "R4: DELETE чужого → 403");

  const pub = await api(A, "PATCH", `/syntheses/${S1}`, { isPublic: true });
  ok(pub.status === 200 && pub.body?.synthesis?.isPublic === true,
    "R4: владелец PATCH { isPublic: true } → 200");
  ok((await api(B, "GET", `/syntheses/${S1}`)).status === 200,
    "R4: после публикации чужой GET /:id → 200");
  ok((await api(B, "GET", `/syntheses/${S1}/sections`)).status === 200,
    "R4: после публикации /sections → 200");
  ok((await api(B, "GET", `/syntheses/${S1}/categories`)).status === 200,
    "R4: после публикации /categories → 200");
  const pubList = await api(B, "GET", "/syntheses/public");
  ok(pubList.body?.items?.some((s) => s.id === S1),
    "R4: S1 виден во вкладке «Публичные» (GET /syntheses/public)");
  const byPhil = await api(B, "GET", "/syntheses/public?philosopher=Кант");
  ok(byPhil.body?.items?.some((s) => s.id === S1),
    "R4: /public?philosopher=Кант находит S1");
  const byPhilNo = await api(B, "GET", "/syntheses/public?philosopher=Платон");
  ok(!byPhilNo.body?.items?.some((s) => s.id === S1),
    "R4: /public?philosopher=Платон S1 не находит");

  const ghost = "00000000-0000-4000-8000-000000000000";
  ok((await api(A, "GET", `/syntheses/${ghost}`)).status === 404,
    "R4: несуществующий id → 404");
  ok((await api(A, "GET", `/syntheses/${ghost}/sections`)).status === 404,
    "R4: несуществующий id /sections → 404");
  ok((await api(A, "GET", `/syntheses/${ghost}/categories`)).status === 404,
    "R4: несуществующий id /categories → 404");
  ok((await api(A, "GET", "/syntheses/not-a-uuid")).status === 404,
    "R4: невалидный id (не UUID) → 404, без 500 от PG");

  /* ═══ R5: sections ═══ */
  console.log("\n■ R5: GET /:id/sections и /:key");
  const secList = (await api(A, "GET", `/syntheses/${S1}/sections`)).body?.sections;
  ok(Array.isArray(secList) && secList.length === 3,
    `R5: три раздела (${secList?.length})`);
  ok(JSON.stringify(secList?.map((s) => s.key)) ===
    JSON.stringify(["sum", "graph", "glossary"]),
    "R5: порядок списка = sectionOrder");
  ok(secList?.every((s) => s.contextQualityScore === null),
    "R5: contextQualityScore = null (TODO(2.4))");
  ok(secList?.every((s) => s.htmlChars > 0), "R5: htmlChars > 0");
  const graphSum = secList?.find((s) => s.key === "graph");
  ok(Array.isArray(graphSum?.subsections) &&
    graphSum.subsections.includes("Таблица категорий"),
    "R5: subsections графа заполнены из HTML (есть «Таблица категорий»)");
  const secFull = (await api(A, "GET", `/syntheses/${S1}/sections/graph`)).body?.section;
  ok(secFull?.key === "graph" && secFull?.htmlContent?.includes("doc-table"),
    "R5: SectionFull.htmlContent с разметкой");
  ok(JSON.stringify(secFull?.subsections) === JSON.stringify(graphSum?.subsections),
    "R5: subsections SectionFull совпадают со сводкой");
  ok((await api(A, "GET", `/syntheses/${S1}/sections/nonexistent`)).status === 404,
    "R5: несуществующий ключ раздела → 404");
  const ctxPrev = await api(A, "GET", `/syntheses/${S1}/sections/glossary/context`);
  ok(ctxPrev.status === 200 && typeof ctxPrev.body?.contextText === "string",
    "[extra] R5: /sections/glossary/context → 200, contextText строка");
  ok(ctxPrev.body?.budget > 0 && ctxPrev.body?.rawBaseBudget > 0,
    "[extra] R5: budget/rawBaseBudget > 0 (живой buildContextForSection)");
  ok(Array.isArray(ctxPrev.body?.entries) &&
    ctxPrev.body.entries.some((e) => e.key === "graph:nodes_compact"),
    "[extra] R5: entries содержат graph:nodes_compact (required глоссария; " +
    "первый прогон ожидал graph:nodes — ошибка теста, не кода)");

  /* ═══ R6: categories ═══ */
  console.log("\n■ R6: GET /:id/categories (v10-метрики, topology)");
  const graph = (await api(A, "GET", `/syntheses/${S1}/categories`)).body;
  ok(graph?.categories?.length === 10, `R6: 10 категорий (${graph?.categories?.length})`);
  const cat0 = graph?.categories?.[0];
  ok(["clarity", "breadth", "depthScore", "applicability",
    "historicalSignificance"].every((f) => typeof cat0?.[f] === "number") &&
    typeof cat0?.innovationDegree === "number",
    "R6: v10-метрики категории — числа");
  ok(graph?.edges?.length === 18, `R6: 18 связей (${graph?.edges?.length})`);
  const e0 = graph?.edges?.[0];
  ok(["certainty", "historicalSupport", "logicalNecessity",
    "contextDependency"].every((f) => typeof e0?.[f] === "number"),
    "R6: v10-метрики связи — числа");
  ok(graph?.clusters?.length === 2 &&
    graph.clusters.map((c) => c.label).join("|").includes("Основания"),
    "R6: clusters из cluster_labels (2 кластера)");
  ok(graph?.topology?.clusters?.length === 2 &&
    graph.topology.structuralRoles.length >= 1 &&
    graph.topology.proceduralRoles.length >= 1,
    "R6: topology — кластеры и роли заполнены");
  ok(typeof graph?.topology?.hasReflexiveEdges === "boolean",
    "R6: topology.hasReflexiveEdges — boolean");

  /* ═══ R7: doc_num + снимок структуры ═══ */
  console.log("\n■ R7: doc_num и structure_sections");
  const full2 = (await api(A, "GET", `/syntheses/${S2}`)).body?.synthesis;
  ok(DOC_NUM_RE.test(full1?.docNum) && DOC_NUM_RE.test(full2?.docNum),
    "R7: оба POST-синтеза — doc_num по маске PS-NNNN-XXXX");
  ok(full1?.docNum !== full2?.docNum, "R7: номера различаются");
  ok(JSON.stringify(full1?.structureSections) ===
    JSON.stringify(full1?.sectionOrder),
    "R7: structure_sections = снимок sectionOrder при создании (пункт 6)");

  /* ═══ R8: WS «только подписка» ═══ */
  console.log("\n■ R8: WS viewOnly");
  const callsBefore = await mockCalls();
  const cView = wsConnect(A.token);
  await cView.open();
  cView.send({ type: "subscribe_generation", synthesisId: S4, viewOnly: true });
  await sleep(2500);
  const callsAfter = await mockCalls();
  ok(callsAfter === callsBefore,
    `R8a: viewOnly НЕ запускает generateSynthesis (мок: ${callsBefore}→${callsAfter})`);
  const [glS4] = await sql`SELECT count(*)::int AS n FROM generation_log WHERE synthesis_id = ${S4}`;
  ok(glS4.n === 0, "R8a: строк генлога у S4 не появилось");
  const [s4status] = await sql`SELECT status FROM syntheses WHERE id = ${S4}`;
  ok(s4status.status === "generating", "R8a: статус S4 не изменился");

  const p5 = await api(A, "POST", "/syntheses", {
    seed: "Синтез для проверки доставки событий",
    philosophers: ["Кант"], sections: [],
    method: "dialectical", depth: "overview", synthLevel: "comparative",
  });
  const S5 = p5.body.id;
  cView.send({ type: "subscribe_generation", synthesisId: S5, viewOnly: true });
  const delta = await cView.waitFor(
    (m) => m.type === "stream_delta" && m.synthesisId === S5,
    20_000, "stream_delta S5 при viewOnly");
  ok(delta.delta.length > 0,
    "R8b: события стриминга доходят viewOnly-подписчику");
  await cView.waitFor(
    (m) => m.type === "generation_complete" && m.synthesisId === S5,
    40_000, "complete S5");
  ok(true, "R8b: генерация S5 завершилась (запущена POST'ом, не подпиской)");
  cView.close();

  /* ═══ R9: edge cases ═══ */
  console.log("\n■ R9: edge cases");
  const far = await api(A, "GET", "/syntheses?page=99");
  ok(far.body?.items?.length === 0 && far.body?.total === 5,
    `R9: page=99 → items пуст, total корректен (${far.body?.total})`);
  const s3secs = await api(A, "GET", `/syntheses/${S3}/sections`);
  ok(s3secs.status === 200 && s3secs.body?.sections?.length === 0,
    "R9: /sections синтеза без разделов → 200, пустой массив (не 404)");
  const s3graph = await api(A, "GET", `/syntheses/${S3}/categories`);
  ok(s3graph.status === 200 &&
    s3graph.body?.categories?.length === 0 &&
    s3graph.body?.edges?.length === 0 &&
    s3graph.body?.clusters?.length === 0,
    "R9: /categories без графа → пустые массивы");
  ok(s3graph.body?.topology?.clusters?.length === 0 &&
    s3graph.body?.topology?.structuralRoles?.length === 0 &&
    s3graph.body?.topology?.hasReflexiveEdges === false,
    "R9: topology пустого графа — пустые роли, hasReflexiveEdges=false");

  /* ═══ [extra] Смоук POST /:id/duplicate (пункт 7 — вне восьми тестов) ═══ */
  console.log("\n■ [extra] POST /:id/duplicate");
  const dup = await api(A, "POST", `/syntheses/${S1}/duplicate`);
  ok(dup.status === 201 && !!dup.body?.id, "[extra] duplicate → 201 + id");
  const copyId = dup.body.id;
  const copy = (await api(A, "GET", `/syntheses/${copyId}`)).body?.synthesis;
  ok(copy?.title === "Кантовско-гегелевский синтез-16 (копия)",
    "[extra] title += « (копия)»");
  ok(copy?.isPublic === false, "[extra] is_public = false у копии");
  ok(DOC_NUM_RE.test(copy?.docNum) && copy?.docNum !== full1?.docNum,
    "[extra] новый doc_num");
  ok(JSON.stringify(copy?.sectionOrder) === JSON.stringify(full1?.sectionOrder),
    "[extra] sectionOrder скопирован");
  ok(copy?.philosophers?.join(",") === "Кант,Гегель",
    "[extra] генеалогия родителей скопирована");
  ok(!copy?.parentSyntheses?.some((s) => s.id === S1),
    "[extra] связи «копия → оригинал» НЕТ (копия, не потомок)");
  const [dupSec] = await sql`SELECT count(*)::int AS n FROM sections WHERE synthesis_id = ${copyId}`;
  const [dupCat] = await sql`SELECT count(*)::int AS n FROM categories WHERE synthesis_id = ${copyId}`;
  const [dupEdge] = await sql`SELECT count(*)::int AS n FROM category_edges WHERE synthesis_id = ${copyId}`;
  ok(dupSec.n === 3 && dupCat.n === 10 && dupEdge.n === 18,
    `[extra] разделы/категории/рёбра скопированы (${dupSec.n}/${dupCat.n}/${dupEdge.n})`);
  ok((await api(B, "POST", `/syntheses/${S1}/duplicate`)).status === 403,
    "[extra] duplicate чужого (даже публичного) → 403 — решение беседы");

  /* ═══ DELETE — замыкание жизненного цикла ═══ */
  const del = await api(A, "DELETE", `/syntheses/${copyId}`);
  ok(del.status === 200 && del.body?.ok === true, "DELETE копии → { ok: true }");
  ok((await api(A, "GET", `/syntheses/${copyId}`)).status === 404,
    "после DELETE — 404");
  const [orphans] = await sql`SELECT count(*)::int AS n FROM sections WHERE synthesis_id = ${copyId}`;
  ok(orphans.n === 0, "CASCADE подчистил sections копии");

  cA.close();
}

main()
  .then(() => finish())
  .catch((e) => {
    console.error("\nОШИБКА ПРОГОНА:", e);
    console.error("--- лог сервера (хвост) ---\n" + serverLog.slice(-3000));
    finish(1);
  });

async function finish(rc = 0) {
  // Убиваем всю detached-группу: SIGTERM только npx-обёртке оставляет
  // node-ребёнка tsx сиротой на порту (грабля прогонов 3–4)
  try { serverProc?.kill("SIGKILL"); } catch { /* уже мёртв */ }
  try { mockSrv?.close(); } catch { /* ок */ }
  try { await sql.end({ timeout: 3 }); } catch { /* ок */ }
  console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗`);
  if (fails.length) console.log("Провалы:\n  - " + fails.join("\n  - "));
  process.exit(rc || (failed > 0 ? 1 : 0));
}
