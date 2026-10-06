/**
 * Беседа 12.3 — тестовые запросы 2–5 одним харнессом (планы, рекомендации,
 * биллинг, реестр) плюс доделки той же беседы: находки сторожа кодами (Д-46)
 * и свой повтор пропущенной таблицы рекомендаций (вторая половина Д-21).
 *
 * Живой сервер :3123 (BILLING_ENFORCE=true, лог — /tmp/t123-server.log) +
 * PG16/Redis + мок Claude :3924 + мок Stripe :3925 (tools/stripe-mock.mjs) +
 * HTTP и WS (глобальный WebSocket Node 22). Браузер не нужен: беседа
 * серверная. Документ — фикстура (свои строки БД: граф, диалог, критика со
 * всеми подразделами карты, включая «Межслойную согласованность»); файл
 * концепции — по желанию (T123_FILE): часть L идёт на нём, без файла —
 * пропуск.
 *
 *  R2  Д-6: запрос под гейтом правки СРАЗУ после plan_updated со статусом
 *      done — не 409 (execute, трижды; confirm_step — каскадная критика);
 *      Д-7: план «1 бесплатно · 1 платно + каскадные» — estimatedCost только
 *      за взятые шаги, ждущие решения — отдельным полем cascadePending;
 *      подтверждение каскадного шага переносит его оценку из одного в другое
 *  R3  Д-12: клиент удалён в моке Stripe → пополнение проходит, колонка
 *      перезаписана (и подписка — тем же путём);
 *      Д-18: seed:prompts и seed:configs на РАБОТАЮЩЕМ сервере — активная
 *      версия видна без перезапуска; при недоступном Redis посев не падает
 *      и говорит «НЕ сброшен»
 *  R4  Д-11: ключ раунда — четыре сценария на живом конвейере (перегенерация
 *      критики моком); Д-13: карта подразделов критики знает «Межслойную
 *      согласованность» — учёт подразделов, пауза max-tokens и догенерация
 *      недостающих (1.4b), страховка 11.1 по позиции
 *  R5  Д-19: /estimate несёт contextBudget и он меняется с активацией новой
 *      версии context_budget; Д-20: оценка ретрофита без обращения к модели;
 *      Д-21: чужое «Основание» — замечание, не invalid; Д-32: отказ
 *      планировщика под Accept-Language en / de — вместе с меткой раздела
 *  R6  Д-46: причины сторожа — на языке запроса (Accept-Language и язык
 *      пользователя), в БД — коды и русский вид
 *  R7  Д-21 (свой повтор): модель пропустила таблицу рекомендаций —
 *      перегенерация, шаг плана и полная генерация составляют её повторным
 *      обращением; негодный повтор генерацию не роняет
 *  R8  Д-47: успешный ответ без подраздела — пометка в генлоге раздела
 *      (перегенерация, полная генерация, добавление раздела шагом плана);
 *      догенерации нет; о таблице рекомендаций второй раз не говорится
 *  L   файл концепции (T123_FILE): разбор, язык причин, повтор таблицы
 *
 * Запуск (≈ 2 мин, в фоне): node_modules/.bin/tsx tests/test-123-requests2-5.mjs [R2 R5 …]
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import http from "node:http";
import postgres from "postgres";

import { createStripeMock } from "../tools/stripe-mock.mjs";

const ONLY = process.argv.slice(2);
const want = (r) => ONLY.length === 0 || ONLY.includes(r);
const FILE = process.env.T123_FILE;
const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3123, MOCK_PORT = 3924, STRIPE_PORT = 3925;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CYR = /[А-Яа-яЁё]/;
/** Текст вне кавычек: названия из документа и машинные значения остаются русскими. */
const outside = (t) => String(t ?? "").replace(/[«“„][^»”“]*[»”“]/g, "");
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 700) : ""}`); }
}

/* ── Служебные модули сервера в процессе харнесса (только чтение карты и разбор графа) ── */
const SDB = await import("../server/services/section-defs-builder.ts");
const GP = await import("../server/services/graph-parser.ts");
const CE = await import("../server/services/cost-estimator.ts");
const K = await import("@philosynth/shared/constants/recommendations");
const { closeDb } = await import("../server/db/index.ts");
const redisMod = await import("../server/redis.ts");

const PROSE = K.RECOMMENDATIONS_PROSE_SUBSECTION, TABLE = K.RECOMMENDATIONS_TABLE_SUBSECTION;
const INTERLAYER = SDB.CRITIQUE_INTERLAYER_SUBSECTION;
const HEAD = K.RECOMMENDATION_COLUMNS.map((c) => c.header);
const PARAMS = { seed: "s", phil: ["Кант"], participants: [{ type: "philosopher", name: "Кант" }], method: "dialectical", synthLevel: "comparative", depth: "overview", generationOrder: "architectural", extGraphMetrics: false, ctx: "", lang: "Russian", keepFullBudget: false };
const MAP = await SDB.buildSubsectionMap({ ...PARAMS, sec: ["graph", "dialogue", "critique"] });
const CRIT_SUBS = MAP.critique;
const HIST_MAP = (await SDB.buildSubsectionMap({ ...PARAMS, sec: ["graph", "dialogue", "critique", "history"] })).history;
const REPL1 = "то, что есть, взятое в его определённости";
const ROWS = [
  ["1", "Таблица категорий", "Бытие", "уточнить формулировку", REPL1, "Слепые пятна", "существенная"],
  ["2", "Таблица категорий", "Ничто", "развить", "", "Слепые пятна", "косметическая"],
  ["3", "Методология построения графа", "", "развить", "", "Подраздел, которого нет", "косметическая"],
  ["4", "Таблица категорий", "Становление", "удалить", "", "Итоговая оценка", "блокирующая"],
  ["5", "Нет такого адреса", "", "улучшить", "", "Слепые пятна", "существенная"],
  ["6", "Методология построения графа", "", "перегенерировать", "", "Слепые пятна", "косметическая"],
];
const tbl = (h, rows) => `<table class="doc-table"><thead><tr>${h.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>\n${b}\n</div>`;
const wrap = (num, title, b) => `<div class="doc-section"><div class="section-num">§ ${num}</div><div class="section-title">${title}</div><div class="doc-content">${b}</div></div>`;
const proseHtml = (lead) => `<p>${lead}</p><p><strong>Рекомендация 1:</strong> уточнить определение бытия.</p><p><strong>Рекомендация 2:</strong> развить определение ничто.</p><p><strong>Рекомендация 3:</strong> развить методологию.</p><p><strong>Рекомендация 4:</strong> удалить становление.</p><p><strong>Рекомендация 5:</strong> улучшить нечто.</p><p><strong>Рекомендация 6:</strong> перегенерировать методологию.</p>`;
const GRAPH_BODY =
  sub("Методология построения графа", "<p>Метод построения: диалектический.</p>") +
  sub("Таблица категорий", tbl(["Категория", "Тип", "Определение", "Центральность", "Определённость", "Происхождение"], [["Бытие", "онтологическая", "то, что есть", "0.9", "0.8", "Кант"], ["Ничто", "онтологическая", "то, чего нет", "0.5", "0.6", "Кант"], ["Становление", "онтологическая", "переход", "0.4", "0.5", "Кант"]])) +
  sub("Таблица связей", tbl(["Источник", "Описание связи", "Цель", "Тип связи", "Направление", "Сила"], [["Бытие", "переходит в", "Ничто", "диалектическая", "однонаправленная", "0.7"]]));
const DIALOGUE_BODY = sub("Диалог", "<p><strong>Кант:</strong> реплика.</p>");
/**
 * Ответ «модели» на задание критики: подразделы карты подряд.
 * opts.table: "full" | "none" (пропущена) | "broken" (подраздел без таблицы);
 * opts.skipInterlayer — модель пропустила адаптивный подраздел;
 * opts.skip — имена подразделов, которые модель пропустила (Д-47).
 */
function critiqueBody(lead, opts = {}) {
  const table = opts.table ?? "full";
  let html = "";
  for (const n of CRIT_SUBS) {
    if (n === INTERLAYER && opts.skipInterlayer) continue;
    if (opts.skip?.includes(n)) continue;
    if (n === PROSE) html += sub(n, proseHtml(lead));
    else if (n === TABLE) {
      if (table === "none") continue;
      html += sub(n, table === "broken" ? "<p>Таблица будет составлена позже.</p>" : tbl(HEAD, opts.rows ?? ROWS));
    } else html += sub(n, `<p>Подраздел «${n}»: текст критики.</p>`);
    html += "\n";
  }
  return html;
}

/* ── Мок Claude ──────────────────────────────────────────────────────── */
const SUM_SUBS = ["Цели и метод", "Портрет каждого философа", "Новизна и ценность", "Структура документа", "Индекс когерентности", "Точки напряжения", "Оценка сложности"];
const mock = {
  calls: 0, picked: [],
  critique: { lead: "Редакция А.", table: "full", skipInterlayer: false },
  extractCalls: 0, extractAnswer: null, extractRows: ROWS,
  subRegens: [], refinePrompts: [], plain: null,
};
const mockSrv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", async () => {
    mock.calls++;
    let prompt = "";
    try { const c = JSON.parse(body).messages?.[0]?.content; prompt = typeof c === "string" ? c : J(c); } catch {}
    const task = prompt.slice(Math.max(0, prompt.lastIndexOf("ЗАДАНИЕ")));
    let text, stop = "end_turn";
    const subM = prompt.match(/(Перегенерируй|Доработай|Заверши) ТОЛЬКО секцию:\s*\n\s*«([^»]+)»/);
    if (prompt.includes("ТОЧЕЧНАЯ ПРАВКА ОДНОГО ЭЛЕМЕНТА")) {
      // собственные признаки — ПЕРВЫМИ (09 §4, 10.1)
      mock.refinePrompts.push(prompt); mock.picked.push("(refine)");
      text = "```\n«то, чего нет, развёрнутое в определение»\n```";
    } else if (prompt.includes("ПЕРЕЛОЖИТЬ в таблицу")) {
      mock.extractCalls++; mock.picked.push("(таблица по прозе)");
      text = mock.extractAnswer ?? sub(TABLE, tbl(HEAD, mock.extractRows));
    } else if (subM) {
      mock.subRegens.push(subM[2]); mock.picked.push(`(подраздел ${subM[2]})`);
      text = subM[2] === TABLE ? sub(TABLE, tbl(HEAD, ROWS)) : sub(subM[2], `<p>ДОГЕН «${subM[2]}».</p>`);
    } else if (mock.plain) {
      // Д-47: по просьбе теста — раздел из названных подразделов (добавление раздела шагом плана)
      mock.picked.push("(заданные подразделы)");
      text = mock.plain.map((n) => sub(n, `<p>Подраздел «${n}».</p>`)).join("\n");
    } else if (task.includes(`Столбцы СТРОГО: ${HEAD.join(" | ")}`)) {
      mock.picked.push("critique");
      if (prompt.includes("[MOCK:CRITMAXTOK]")) {
        // первые три написанных подраздела (адаптивный ПРОПУЩЕН) и оборванный четвёртый
        const names = CRIT_SUBS.filter((n) => n !== INTERLAYER);
        text = names.slice(0, 3).map((n) => sub(n, `<p>ORIG «${n}».</p>`)).join("\n") + `\n<div data-section="${names[3]}"><h4>${names[3]}</h4>\n<p>` + "оборванный текст подраздела ".repeat(14);
        stop = "max_tokens";
      } else if (prompt.includes("[MOCK:CRITNOTABLE]")) text = critiqueBody("Полная генерация.", { table: "none" });
      else if (prompt.includes("[MOCK:CRITSKIPSUB]")) text = critiqueBody("Полная генерация без подраздела.", { skipInterlayer: true });
      else text = critiqueBody(mock.critique.lead, mock.critique);
    } else if (task.includes("Точки напряжения")) {
      mock.picked.push("sum");
      text = SUM_SUBS.map((n) => sub(n, `<p>Подраздел «${n}».</p>`)).join("\n");
    } else if (task.includes("Таблица связей")) { mock.picked.push("graph"); text = GRAPH_BODY; }
    else { mock.picked.push("(прочее)"); text = DIALOGUE_BODY; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 1000 } } });
    for (let i = 0; i < text.length; i += 1500) send({ type: "content_block_delta", delta: { type: "text_delta", text: text.slice(i, i + 1500) } });
    send({ type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: 2000 } });
    send({ type: "message_stop" });
    res.end();
  });
});
await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));
const stripeMock = createStripeMock({ port: STRIPE_PORT, bearer: "sk_test_mock123t", paymentIntentStatus: "succeeded", log: () => {} });
await stripeMock.start();

/* ── Сервер и клиенты ────────────────────────────────────────────────── */
let srv = null;
try { if ((await fetch(`${BASE}/health`)).ok) { console.log(`На :${PORT} уже отвечает чужой сервер — стоп (сироты: ps aux | grep 'tsx.*[i]ndex')`); process.exit(2); } } catch {}
const SERVER_ENV = {
  ...process.env, PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-123", STREAM_RETRY_DELAYS: "50", BILLING_ENFORCE: "true",
  STRIPE_SECRET_KEY: "sk_test_mock123t", STRIPE_API_BASE: `http://127.0.0.1:${STRIPE_PORT}`, STRIPE_WEBHOOK_SECRET: "",
};
const srvLog = createWriteStream("/tmp/t123-server.log");
srv = spawn(process.execPath, ["--import", "tsx", "index.ts"], { cwd: ROOT + "server", detached: true, stdio: ["ignore", "pipe", "pipe"], env: SERVER_ENV });
srv.stdout.pipe(srvLog); srv.stderr.pipe(srvLog);
async function waitHealth() { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/health`)).ok) return true; } catch {} await sleep(500); } return false; }

function client(cookie) {
  const api = async (method, path, body, extraHeaders = {}) => {
    const headers = { Cookie: cookie, ...extraHeaders };
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
    const r = await fetch(BASE + path, { method, headers, body: payload });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  return { api, cookie };
}
async function account(tag) {
  const email = `t123-${tag}-${Date.now()}@example.com`;
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-123" }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-123" }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  return { ...client(cookie), email, id: u.id, token: cookie.split("=")[1] };
}
function wsOf(user) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${user.token}`);
  const messages = [];
  const hooks = [];
  ws.addEventListener("message", (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } messages.push(m); for (const h of [...hooks]) h(m); });
  const open = new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", () => rej(new Error("ws error")), { once: true }); });
  return {
    open, messages, send: (o) => ws.send(J(o)), close: () => ws.close(),
    mark: () => messages.length,
    /** Сообщение, пришедшее ПОСЛЕ отметки since (09 §4, 5.5): предикат по типу без индекса ловит старое. */
    waitFor(pred, since, ms, label) {
      const hit = messages.slice(since).find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => { hooks.splice(hooks.indexOf(h), 1); reject(new Error(`timeout: ${label}; с отметки: ${messages.slice(since).map((m) => m.type).join(",")}`)); }, ms);
        const h = (m) => { if (pred(m)) { clearTimeout(t); hooks.splice(hooks.indexOf(h), 1); resolve(m); } };
        hooks.push(h);
      });
    },
    /** Выполнить fn(сообщение) СИНХРОННО в обработчике первого подходящего сообщения — без единого тика задержки. */
    onNext(pred, fn) {
      return new Promise((resolve) => { const h = (m) => { if (pred(m)) { hooks.splice(hooks.indexOf(h), 1); resolve(fn(m)); } }; hooks.push(h); });
    },
  };
}
const rec = (id, tail = "") => `/syntheses/${id}/recommendations${tail}`;
const planUrl = (id, planId, tail = "") => `/syntheses/${id}/plans/${planId}${tail}`;
const ids = [];
/** Фикстура: концепция с графом, диалогом и критикой (подразделы — по карте службы). */
async function makeDoc(user, opts = {}) {
  const [s] = await sql`insert into syntheses (user_id, seed, title, status, section_order, method, synth_level, depth) values (${user.id}, 'фикстура 12.3', ${"t123 " + Date.now()}, 'ready', ${sql.json(["graph", "dialogue", "critique"])}, 'dialectical', 'comparative', 'overview') returning id`;
  ids.push(s.id);
  await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${s.id}, 'philosopher', 'Кант', 0)`;
  const graph = wrap(1, "Граф категорий", GRAPH_BODY);
  await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values
    (${s.id}, 'graph', 1, 'Граф категорий', ${graph}),
    (${s.id}, 'dialogue', 2, 'Диалог', ${wrap(2, "Диалог", DIALOGUE_BODY)}),
    (${s.id}, 'critique', 3, 'Критический анализ', ${wrap(3, "Критический анализ", critiqueBody(opts.lead ?? "Редакция А.", opts))})`;
  await GP.saveGraphToDb(s.id, GP.parseGraphFromHTML(graph));
  return s.id;
}
const planRow = async (planId) => (await sql`select * from edit_plans where id=${planId}`)[0];
const critiqueHtml = async (id) => (await sql`select html_content h from sections where synthesis_id=${id} and key='critique'`)[0]?.h ?? "";
const usedRegen = async (userId) => (await sql`select used_regenerations n from user_subscriptions where user_id=${userId}`)[0]?.n ?? null;
const usageCount = async (userId) => (await sql`select count(*)::int n from api_usage where user_id=${userId}`)[0].n;
/** Перегенерация критики по HTTP; ждёт section_done этого запуска. */
async function regenCritique(user, ws, id) {
  const since = ws.mark();
  const r = await user.api("POST", `/syntheses/${id}/regenerate/critique`, {});
  if (r.status !== 200) throw new Error("regenerate critique: " + J(r));
  return ws.waitFor((m) => (m.type === "section_done" || m.type === "stream_error") && m.synthesisId === id, since, 60000, "section_done critique");
}
/** Запрос под гейтом правки с повтором, пока идёт операция (только там, где проверяется НЕ гейт). */
async function gated(fn) { for (let i = 0; i < 60; i++) { const r = await fn(); if (r.status !== 409 || r.json?.code !== "GENERATION_IN_PROGRESS") return r; await sleep(150); } return fn(); }
const waitIdle = async (user, id) => gated(() => user.api("POST", rec(id, "/parse")));
function seedRun(script, extraEnv = {}) {
  const r = spawnSync("npm", ["run", script], { cwd: ROOT, env: { ...process.env, ...extraEnv }, encoding: "utf8", timeout: 120000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
const registryBefore = {};

try {
  if (!(await waitHealth())) throw new Error("сервер не поднялся (лог — /tmp/t123-server.log)");
  await redisMod.connectRedis();
  const A = await account("a"), B = await account("b"), ADM = await account("adm");
  await sql`update users set role='admin' where id=${ADM.id}`;
  await sql`update users set balance_usd = 50 where id in (${A.id}, ${B.id}, ${ADM.id})`;
  // A — подписчик: расход квоты regenerations виден счётчиком
  const [pl] = await sql`insert into subscription_plans (name, display_name, price_usd, quota_syntheses, quota_regenerations, quota_modes, quota_enrichments, stripe_price_id, is_active) values (${"t123plan" + Date.now()}, 'T123', 10, 50, 500, 5, 5, 'price_t123', true) returning id`;
  await sql`insert into user_subscriptions (user_id, plan_id, stripe_subscription_id, status, current_period_start, current_period_end) values (${A.id}, ${pl.id}, ${"sub_t123_" + Date.now()}, 'active', now() - interval '1 day', now() + interval '20 days')`;
  const wsA = wsOf(A); await wsA.open;

  /* ════ R2: Д-6 и Д-7 ════ */
  if (want("R2")) {
    console.log("\n■ R2: Д-7 — оценка только взятых шагов; Д-6 — done после слота");
    const D = await makeDoc(A);
    const p0 = await A.api("POST", rec(D, "/parse"));
    ok(p0.status === 200 && p0.json.rows.length === 6, "фикстура разобрана: шесть строк рекомендаций", p0.json);
    const r = await A.api("POST", rec(D, "/plan"), { nums: ["1", "2"] });
    ok(r.status === 200, "план из рекомендаций 1 (готовая замена) и 2 (развить)", r.json);
    const plan = r.json.plan;
    const base = plan.steps.filter((s) => !s.cascadeGenerated), pend = plan.steps.filter((s) => s.status === "pending");
    ok(J(base.map((s) => s.type).sort()) === J(["edit_element", "refine_element"]) && base.every((s) => s.status === "confirmed"), "взятые шаги: edit_element (бесплатно) и refine_element (платно)", base.map((s) => [s.type, s.status]));
    ok(pend.length >= 1 && pend.every((s) => s.cascadeGenerated) && pend.some((s) => s.target === "critique"), "каскадные шаги ждут решения (pending), среди них критика", pend.map((s) => s.target));
    ok(plan.costBreakdown.free.steps === 1 && plan.costBreakdown.paid.steps === 1, "разбивка: 1 бесплатно · 1 платно — каскадные в неё не входят", plan.costBreakdown);
    ok(plan.estimatedCost > 0 && plan.costBreakdown.paid.costUsd === plan.estimatedCost, "estimatedCost — цена взятого платного шага", plan.estimatedCost);
    ok(plan.cascadePending && plan.cascadePending.steps === pend.length && plan.cascadePending.costUsd > 0, "cascadePending: число ждущих шагов и их оценка отдельным полем", plan.cascadePending);
    ok(plan.cascadePending.costUsd > plan.estimatedCost * 3, "ждущие шаги (перегенерации разделов) кратно дороже взятого (точечная правка) — прежде сумма была общей", [plan.estimatedCost, plan.cascadePending.costUsd]);
    const g = await A.api("GET", planUrl(D, plan.id));
    ok(J([g.json.plan.estimatedCost, g.json.plan.costBreakdown, g.json.plan.cascadePending]) === J([plan.estimatedCost, plan.costBreakdown, plan.cascadePending]), "GET плана отдаёт те же числа");
    // подтверждение каскадного шага: его оценка переходит из cascadePending в estimatedCost
    const ci = plan.steps.findIndex((s) => s.status === "pending" && s.target === "critique");
    const up = await A.api("PATCH", planUrl(D, plan.id), { steps: [{ index: ci, status: "confirmed" }] });
    const p2 = up.json?.plan;
    ok(up.status === 200 && p2.costBreakdown.paid.steps === 2 && p2.cascadePending.steps === pend.length - 1, "подтверждён каскадный шаг критики: платных взятых — 2, ждущих — на один меньше", [up.status, p2?.costBreakdown, p2?.cascadePending]);
    ok(Math.abs(p2.estimatedCost + p2.cascadePending.costUsd - (plan.estimatedCost + plan.cascadePending.costUsd)) < 1e-9 && p2.estimatedCost > plan.estimatedCost, "оценка шага перешла из «ждущих» во «взятые»: сумма двух полей прежняя", [plan.estimatedCost, plan.cascadePending.costUsd, p2.estimatedCost, p2.cascadePending.costUsd]);
    const down = await A.api("PATCH", planUrl(D, plan.id), { steps: [{ index: p2.steps.findIndex((s) => s.target === "critique"), status: "skipped" }] });
    ok(down.status === 200 && Math.abs(down.json.plan.estimatedCost - plan.estimatedCost) < 1e-9 && !down.json.plan.steps.some((s) => s.target === "critique" && s.status === "pending"), "снятый шаг — ни во взятых, ни в ждущих", [down.json?.plan?.estimatedCost, down.json?.plan?.cascadePending]);
    await A.api("DELETE", planUrl(D, plan.id));

    console.log("  — Д-6: запрос под гейтом в тот же тик, что plan_updated со статусом done");
    for (let round = 1; round <= 3; round++) {
      const Dn = await makeDoc(A);
      await A.api("POST", rec(Dn, "/parse"));
      const pr = await A.api("POST", rec(Dn, "/plan"), { nums: ["1"] });
      // запросы уходят СИНХРОННО из обработчика сообщения — раньше любого опроса БД
      const fired = wsA.onNext((m) => m.type === "plan_updated" && m.planId === pr.json.plan.id && m.plan.status === "done", (m) => Promise.all([
        A.api("POST", rec(Dn, "/parse")),
        A.api("POST", rec(Dn, "/plan"), { nums: ["2"] }),
        Promise.resolve(m),
      ]));
      const ex = await A.api("POST", planUrl(Dn, pr.json.plan.id, "/execute"));
      const [parse, next, msg] = await Promise.race([fired, sleep(30000).then(() => { throw new Error("plan_updated done не пришёл"); })]);
      ok(ex.status === 200 && parse.status === 200 && next.status === 200, `прогон ${round}: разбор и постановка следующего плана сразу после plan_updated — не 409`, [ex.status, parse.status, parse.json?.code, next.status, next.json?.code]);
      if (round === 1) {
        ok(msg.plan.estimatedCost === 0 && msg.plan.costBreakdown.free.steps === 1 && msg.plan.cascadePending.steps >= 1 && msg.plan.cascadePending.costUsd > 0, "plan_updated несёт раздельную оценку: взятое бесплатно, каскадные — в cascadePending", [msg.plan.estimatedCost, msg.plan.cascadePending]);
        ok((await planRow(pr.json.plan.id)).status === "done", "план в БД — done");
      }
      if (next.status === 200) await A.api("DELETE", planUrl(Dn, next.json.plan.id));
    }
    // Тот же вопрос глазами наблюдателя БД (так дефект и был найден — 09 §4, 10.2): статус done в
    // edit_plans → в тот же миг запрос под гейтом. До 12.3 статус писался ДО выхода из слота, и между
    // ним и освобождением слота шла оценка плана для plan_updated — десятки миллисекунд верного 409.
    for (let round = 1; round <= 3; round++) {
      const Dn = await makeDoc(A);
      await A.api("POST", rec(Dn, "/parse"));
      const pr = await A.api("POST", rec(Dn, "/plan"), { nums: ["1"] });
      await A.api("POST", planUrl(Dn, pr.json.plan.id, "/execute"));
      let parse = null;
      for (let i = 0; i < 4000 && !parse; i++) {
        const [row] = await sql`select status from edit_plans where id=${pr.json.plan.id}`;
        if (row?.status === "done") parse = await A.api("POST", rec(Dn, "/parse"));
        else await sleep(2);
      }
      ok(parse?.status === 200, `наблюдатель БД, прогон ${round}: статус done в edit_plans → запрос под гейтом сразу — не 409`, [parse?.status, parse?.json?.code]);
    }
    // confirm_step: каскадная перегенерация критики (модель зовётся), затем запрос под гейтом
    {
      const Dc = await makeDoc(A);
      await A.api("POST", rec(Dc, "/parse"));
      const pr = await A.api("POST", rec(Dc, "/plan"), { nums: ["1"] });
      const done1 = wsA.onNext((m) => m.type === "plan_updated" && m.planId === pr.json.plan.id && m.plan.status === "done", (m) => m);
      await A.api("POST", planUrl(Dc, pr.json.plan.id, "/execute"));
      const first = await done1;
      const idx = first.plan.steps.findIndex((s) => s.status === "pending" && s.target === "critique");
      mock.critique = { lead: "Редакция после правки.", table: "full" };
      const fired = wsA.onNext((m) => m.type === "plan_updated" && m.planId === pr.json.plan.id && m.plan.steps[idx]?.status === "done", (m) => Promise.all([A.api("POST", rec(Dc, "/parse")), Promise.resolve(m)]));
      wsA.send({ type: "confirm_step", planId: pr.json.plan.id, stepIndex: idx });
      const [parse, msg] = await Promise.race([fired, sleep(60000).then(() => { throw new Error("plan_updated после confirm_step не пришёл"); })]);
      ok(parse.status === 200, "confirm_step (перегенерация критики): разбор сразу после plan_updated — не 409", [parse.status, parse.json?.code]);
      ok(parse.json?.newRound === true && parse.json.round === 2, "… и открывает следующий раунд по новой критике", [parse.json?.round, parse.json?.newRound]);
      // план стал done ещё после execute (ждущие каскадные статус не держат — так с 2.2); confirm_step его не меняет
      ok(msg.plan.status === "done" && msg.plan.steps[idx].status === "done" && msg.plan.cascadePending.steps === first.plan.cascadePending.steps - 1, "plan_updated после confirm_step: шаг done, ждущих на один меньше", [msg.plan.status, msg.plan.cascadePending]);
      mock.critique = { lead: "Редакция А.", table: "full" };
    }
  }

  /* ════ R3: Д-12 и Д-18 ════ */
  if (want("R3")) {
    console.log("\n■ R3: Д-12 — удалённый в Stripe Customer; Д-18 — сиды сбрасывают кэш");
    const auth = { authorization: "Bearer sk_test_mock123t" };
    const cusOf = async () => (await sql`select stripe_customer_id c from users where id=${B.id}`)[0].c;
    const t1 = await B.api("POST", "/billing/topup", { amountUsd: 5 });
    const cus1 = await cusOf();
    ok(t1.status === 200 && !!t1.json.clientSecret && !!cus1, "первое пополнение: Customer заведён, колонка записана", [t1.status, t1.json, cus1]);
    const del = await fetch(`http://127.0.0.1:${STRIPE_PORT}/v1/customers/${cus1}`, { method: "DELETE", headers: auth });
    ok(del.status === 200 && (await del.json()).deleted === true, "клиент удалён в моке Stripe (DELETE /v1/customers/:id)");
    const before = stripeMock.state.requests.length;
    const t2 = await B.api("POST", "/billing/topup", { amountUsd: 5 });
    const cus2 = await cusOf();
    const trail = stripeMock.state.requests.slice(before).map((q) => `${q.method} ${q.url}`);
    ok(t2.status === 200 && !!t2.json.clientSecret && t2.json.paymentIntentId !== t1.json.paymentIntentId, "пополнение после удаления клиента ПРОХОДИТ", [t2.status, t2.json]);
    ok(!!cus2 && cus2 !== cus1, "колонка users.stripe_customer_id перезаписана новым Customer", [cus1, cus2]);
    ok(J(trail) === J(["POST /v1/payment_intents", "POST /v1/customers", "POST /v1/payment_intents"]), "ход: отказ «No such customer» → новый Customer → один повтор", trail);
    const conf = await B.api("POST", "/billing/topup/confirm", { paymentIntentId: t2.json.paymentIntentId });
    ok(conf.status === 200 && conf.json.balanceUsd >= 55, "платёж под новым клиентом подтверждается, баланс зачислен", conf.json);
    // подписка — тем же путём
    await fetch(`http://127.0.0.1:${STRIPE_PORT}/v1/customers/${cus2}`, { method: "DELETE", headers: auth });
    const sb = await B.api("POST", "/billing/subscribe", { planId: pl.id });
    const cus3 = await cusOf();
    ok(sb.status === 201 && !!cus3 && cus3 !== cus2, "подписка после удаления клиента оформляется под новым Customer", [sb.status, sb.json, cus3]);
    ok([...stripeMock.state.subs.values()].at(-1)?.customer === cus3, "Subscription в Stripe заведена под новым клиентом");

    console.log("  — Д-18: seed:prompts на работающем сервере");
    const EST = { seed: "оценка 12.3", philosophers: ["Кант"], sections: ["graph"], method: "dialectical", depth: "overview", synthLevel: "comparative" };
    const estIn = async () => (await A.api("POST", "/syntheses/estimate", EST)).json?.estimate?.inTokens;
    const vers = async (kind, key) => (await ADM.api("GET", `/${kind}/${key}/versions`)).json.versions;
    const sysVers = await vers("prompts", "system");
    const sysActive = sysVers.find((v) => v.isActive);
    registryBefore.system = { active: sysActive.version, max: Math.max(...sysVers.map((v) => v.version)) };
    const e0 = await estIn();
    const mk = await ADM.api("POST", "/prompts/system", { body: sysActive.body + "\n" + "Проба 12.3. ".repeat(400), description: "t123" });
    const act = await ADM.api("POST", "/prompts/system/activate", { version: mk.json.template.version });
    const e1 = await estIn();
    ok(mk.status === 201 && act.status === 200 && e1 > e0 + 500, "правленая версия шаблона system активна и видна серверу (оценка входа выросла)", [e0, e1]);
    const seed1 = seedRun("seed:prompts");
    ok(seed1.status === 0 && /updated=1,/.test(seed1.out) && /updated: system\b/.test(seed1.out), "seed:prompts вернул код шаблону: updated=1 (system)", seed1.out.slice(-600));
    ok(/Кэш реестра: сброшено ключей — 1/.test(seed1.out), "отчёт сида: «Кэш реестра: сброшено ключей — 1»", seed1.out.slice(-400));
    const e2 = await estIn();
    ok(e2 === e0, "активная версия видна БЕЗ перезапуска сервера: оценка входа вернулась к исходной", [e0, e1, e2]);
    const seed2 = seedRun("seed:prompts");
    ok(seed2.status === 0 && /updated=0,/.test(seed2.out) && /сбрасывать нечего/.test(seed2.out), "повторный посев — одни skip, кэш не трогается");
    // Redis недоступен посеву: посев не падает, сервер остаётся на прежней версии — об этом сказано
    const mk2 = await ADM.api("POST", "/prompts/system", { body: sysActive.body + "\n" + "Проба 12.3 (вторая). ".repeat(400), description: "t123" });
    await ADM.api("POST", "/prompts/system/activate", { version: mk2.json.template.version });
    const e3 = await estIn();
    const seed3 = seedRun("seed:prompts", { REDIS_URL: "redis://127.0.0.1:6399" });
    ok(seed3.status === 0 && /updated=1,/.test(seed3.out) && /Кэш реестра НЕ сброшен: Redis недоступен/.test(seed3.out) && /перезапустите сервер/.test(seed3.out), "Redis недоступен посеву: код возврата 0, в отчёте «НЕ сброшен» и что делать", seed3.out.slice(-500));
    ok((await estIn()) === e3 && e3 > e0, "… и сервер честно остался на прежней версии (кэш не сброшен) — предупреждение по делу", [e0, e3]);
    // возврат: активация через API сбрасывает кэш
    const latest = (await vers("prompts", "system")).find((v) => v.isActive);
    await ADM.api("POST", "/prompts/system/activate", { version: latest.version });
    ok((await estIn()) === e0, "активация через API по-прежнему сбрасывает кэш");

    console.log("  — Д-18: seed:configs на работающем сервере");
    const budgetOf = async () => (await A.api("POST", "/syntheses/estimate", EST)).json?.contextBudget;
    const cfgVers = await vers("configs", "context_budget");
    const cfgActive = cfgVers.find((v) => v.isActive);
    registryBefore.context_budget = { active: cfgActive.version, max: Math.max(...cfgVers.map((v) => v.version)) };
    const b0 = await budgetOf();
    const put = await ADM.api("PUT", "/configs/context_budget", { value: { ...cfgActive.value, overview: cfgActive.value.overview + 1111 }, description: "t123" });
    await ADM.api("POST", "/configs/context_budget/activate", { version: put.json.config.version });
    ok((await budgetOf()) === b0 + 1111, "правленая версия context_budget активна и видна серверу", [b0, await budgetOf()]);
    const seedC = seedRun("seed:configs");
    ok(seedC.status === 0 && /updated=1/.test(seedC.out) && /Кэш реестра: сброшено ключей — 1/.test(seedC.out), "seed:configs вернул код конфигу и сбросил его кэш", seedC.out.slice(-500));
    ok((await budgetOf()) === b0, "конфиг виден БЕЗ перезапуска сервера: contextBudget вернулся к исходному", [b0, await budgetOf()]);
  }

  /* ════ R4: Д-11 и Д-13 ════ */
  if (want("R4")) {
    console.log("\n■ R4: Д-11 — ключ раунда на живом конвейере");
    const D = await makeDoc(A);
    const leadA = "Редакция А.", leadB = "Редакция Б.";
    const regen = async (lead) => { mock.critique = { lead, table: "full" }; const m = await regenCritique(A, wsA, D); if (m.type !== "section_done") throw new Error("перегенерация критики: " + J(m)); return waitIdle(A, D); };
    // исходная редакция — тоже через конвейер: дальше сравниваются ответы одной и той же модели
    const a1 = await regen(leadA);
    ok(a1.status === 200 && a1.json.newRound === true && a1.json.round === 1, "(0) перегенерация (редакция А) + разбор — раунд 1", [a1.status, a1.json?.round]);
    const idsA = a1.json.rows.map((x) => x.id);
    const a2 = await regen(leadA);
    ok(a2.json.newRound === false && a2.json.round === 1 && J(a2.json.rows.map((x) => x.id)) === J(idsA), "(1) А → А (перегенерация дала ту же прозу): раунд прежний, строки те же", [a2.json.round, a2.json.newRound]);
    // (2) Б побывала в документе, но не разобрана; затем снова А
    mock.critique = { lead: leadB, table: "full" };
    await regenCritique(A, wsA, D);
    for (let i = 0; i < 50 && !(await critiqueHtml(D)).includes(leadB); i++) await sleep(100);
    ok((await critiqueHtml(D)).includes(leadB), "(2) редакция Б записана в документ (разбор НЕ зовётся)");
    for (let i = 0; i < 60; i++) { mock.critique = { lead: leadA, table: "full" }; const r = await A.api("POST", `/syntheses/${D}/regenerate/critique`, {}); if (r.status === 200) break; await sleep(150); }
    for (let i = 0; i < 100 && !(await critiqueHtml(D)).includes(leadA); i++) await sleep(100);
    const a3 = await waitIdle(A, D);
    ok(a3.json.newRound === false && a3.json.round === 1, "(2) А → (Б не разобрана) → А: раунд прежний — сохранённый раунд и есть этот текст", [a3.json.round, a3.json.newRound]);
    // (3) Б разобрана → возврат к А открывает третий раунд; статусы не наследуются
    await sql`update recommendations set status='done' where synthesis_id=${D} and num='1' and round=1`;
    const b = await regen(leadB);
    const a4 = await regen(leadA);
    ok(b.json.newRound === true && b.json.round === 2 && a4.json.newRound === true && a4.json.round === 3, "(3) А → Б (разобрана) → А: раунды 2 и 3 — сравнение с ПОСЛЕДНИМ раундом", [b.json.round, a4.json.round]);
    const r1 = await A.api("GET", rec(D, "?round=1"));
    ok(a4.json.rows.find((x) => x.num === "1").status === "new" && r1.json.rows.find((x) => x.num === "1").status === "done", "(3) done первой редакции на третий раунд не переходит; раунд 1 цел");
    // (4) Б отклонена 409 (в раунде есть planned), проза вернулась к А
    const pl4 = await A.api("POST", rec(D, "/plan"), { nums: ["1"] });
    mock.critique = { lead: leadB, table: "full" };
    await regenCritique(A, wsA, D);
    const refused = await gated(() => A.api("POST", rec(D, "/parse")));
    mock.critique = { lead: leadA, table: "full" };
    for (let i = 0; i < 60; i++) { const r = await A.api("POST", `/syntheses/${D}/regenerate/critique`, {}); if (r.status === 200) break; await sleep(150); }
    for (let i = 0; i < 100 && !(await critiqueHtml(D)).includes(leadA); i++) await sleep(100);
    const back = await waitIdle(A, D);
    ok(refused.status === 409 && refused.json.code === "ROUND_IN_PROGRESS" && back.status === 200 && back.json.newRound === false && back.json.round === 3 && back.json.rows.find((x) => x.num === "1").status === "planned", "(4) А → (Б отклонена: ROUND_IN_PROGRESS) → А: раунд прежний, planned цел", [refused.status, refused.json?.code, back.json?.round, back.json?.newRound]);
    await A.api("DELETE", planUrl(D, pl4.json.plan.id));
    console.log("  ВЫВОД Д-11: дефекта нет — раунд не открывается только при дословном возврате к прозе последнего сохранённого раунда; переведён в ограничения (Огр-12)");

    console.log("\n■ R4: Д-13 — «Межслойная согласованность» в карте подразделов критики");
    ok(CRIT_SUBS[1] === INTERLAYER && CRIT_SUBS.filter((n) => n === INTERLAYER).length === 1, "карта критики при диалоге и графе несёт адаптивный подраздел вторым пунктом", CRIT_SUBS);
    const D2 = await makeDoc(A);
    mock.critique = { lead: "Редакция для Д-13.", table: "full" };
    const done = await regenCritique(A, wsA, D2);
    ok(done.type === "section_done", "перегенерация критики документа с диалогом и графом прошла", done.type);
    await waitIdle(A, D2);
    const [gl] = await sql`select metadata from generation_log where synthesis_id=${D2} and section_key='critique' and log_type='generation' order by created_at desc limit 1`;
    ok(gl.metadata.expectedSubsections?.[1] === INTERLAYER && gl.metadata.subsections?.some((s) => s.name === INTERLAYER && s.status === "done") && gl.metadata.expectedSubsections.length === gl.metadata.subsections.length, "генлог: подраздел в ожидаемых и среди написанных; ожидаемых столько же, сколько написано", [gl.metadata.expectedSubsections?.length, gl.metadata.subsections?.length]);
    // страховка 11.1 по позиции: модель «перевела» атрибут — подраздел опознаётся по месту
    const translated = (await critiqueHtml(D2)).replace('data-section="Слепые пятна"', 'data-section="Blind spots"');
    await sql`update sections set html_content=${translated} where synthesis_id=${D2} and key='critique'`;
    const before = mock.subRegens.length, s2 = wsA.mark();
    const rs = await A.api("POST", `/syntheses/${D2}/regenerate-subsection`, { sectionKey: "critique", subsectionName: "Слепые пятна" });
    const sd = await wsA.waitFor((m) => (m.type === "section_done" || m.type === "stream_error") && m.synthesisId === D2, s2, 60000, "section_done подраздела");
    await waitIdle(A, D2);
    const after = await critiqueHtml(D2);
    const names = [...after.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]);
    ok(rs.status === 200 && sd.type === "section_done" && mock.subRegens.length === before + 1, "перегенерация подраздела с переведённым атрибутом прошла", [rs.status, sd.type]);
    ok(names.length === CRIT_SUBS.length && names.includes("Слепые пятна") && !names.includes("Blind spots") && names.indexOf("Слепые пятна") === CRIT_SUBS.indexOf("Слепые пятна") && after.includes("ДОГЕН «Слепые пятна»"), "подраздел опознан ПО МЕСТУ и заменён на своём месте (прежде: число подразделов не сходилось с картой — дописывался в конец)", names);
    const [gls] = await sql`select metadata from generation_log where synthesis_id=${D2} and section_key=${"critique:Слепые пятна"} order by created_at desc limit 1`;
    ok(/опознан по месту|по позиции|по месту/.test(J(gls?.metadata?.parseWarnings ?? gls?.metadata ?? {})), "в генлоге — предупреждение об опознании по месту", gls?.metadata?.parseWarnings);

    console.log("  — Д-13: обрыв критики по лимиту токенов → пауза → догенерация недостающих (1.4b)");
    const s3 = wsA.mark(), sub0 = mock.subRegens.length;
    const post = await A.api("POST", "/syntheses", { seed: "[MOCK:CRITMAXTOK] критика обрывается по лимиту", philosophers: ["Кант"], sections: ["graph", "dialogue", "critique"], method: "dialectical", depth: "overview", synthLevel: "comparative" });
    ok(post.status === 201, "полная генерация принята", post.json);
    const G = post.json.id; ids.push(G);
    const paused = await wsA.waitFor((m) => m.type === "generation_paused" && m.synthesisId === G, s3, 90000, "generation_paused (max-tokens)");
    const [psRow] = await sql`select paused_state ps from syntheses where id=${G}`;
    const ps = psRow.ps;
    ok(paused.reasonKind === "max-tokens" && ps.sectionKeys.includes("critique") && paused.isPartial === true, "пауза max-tokens на критике, частичный раздел", [paused.reasonKind, ps.sectionKeys]);
    ok((ps.expectedSubsections ?? []).includes(INTERLAYER) && !(ps.partialSubsections ?? []).includes(INTERLAYER), "ожидаемые подразделы паузы несут адаптивный подраздел; среди написанных его нет — он НЕДОСТАЮЩИЙ", [ps.expectedSubsections, ps.partialSubsections]);
    const s4 = wsA.mark();
    wsA.send({ type: "resume_generation", synthesisId: G, mode: "fill-missing-subs" });
    await wsA.waitFor((m) => m.type === "generation_complete" && m.synthesisId === G, s4, 120000, "generation_complete после догенерации");
    const filled = mock.subRegens.slice(sub0);
    ok(filled.includes(INTERLAYER), "догенерация недостающих запросила у модели «Межслойную согласованность» (до 12.3 карта его не знала, и пропуск оставался в документе)", filled);
    const gHtml = await critiqueHtml(G);
    const gNames = [...gHtml.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]);
    ok(CRIT_SUBS.every((n) => gNames.includes(n)) && gHtml.includes("ORIG «Внутренняя когерентность»"), "критика в БД: все подразделы карты на месте, написанное до обрыва цело", gNames);
    ok((await sql`select status s from syntheses where id=${G}`)[0].s === "ready", "генерация завершена: status ready");
    console.log("  ВЫВОД Д-13: симптом был (пропуск адаптивного подраздела не догенерировался, страховка по позиции отключалась) — исправлено в buildSubsectionMap");
  }

  /* ════ R5: Д-19, Д-20, Д-21, Д-32 ════ */
  let D5 = null;
  if (want("R5") || want("R6")) {
    D5 = await makeDoc(A);
    await A.api("POST", rec(D5, "/parse"));
  }
  if (want("R5")) {
    console.log("\n■ R5: Д-19 — contextBudget в /estimate");
    const EST = (depth) => ({ seed: "оценка 12.3", philosophers: ["Кант"], sections: ["graph"], method: "dialectical", depth, synthLevel: "comparative" });
    const cfgV = (await ADM.api("GET", "/configs/context_budget/versions")).json.versions;
    const cfg = cfgV.find((v) => v.isActive);
    registryBefore.context_budget ??= { active: cfg.version, max: Math.max(...cfgV.map((v) => v.version)) };
    const depths = Object.keys(cfg.value);
    const got = {};
    for (const d of depths) got[d] = (await A.api("POST", "/syntheses/estimate", EST(d))).json;
    ok(depths.length >= 3 && depths.every((d) => got[d]?.contextBudget === cfg.value[d] && got[d].estimate?.cost > 0), "/estimate несёт contextBudget активного конфига для каждой глубины, оценка на месте", depths.map((d) => [d, got[d]?.contextBudget, cfg.value[d]]));
    const put = await ADM.api("PUT", "/configs/context_budget", { value: { ...cfg.value, standard: cfg.value.standard + 7000 }, description: "t123 R5" });
    const act = await ADM.api("POST", "/configs/context_budget/activate", { version: put.json.config.version });
    const now = (await A.api("POST", "/syntheses/estimate", EST("standard"))).json;
    ok(put.status === 201 && act.status === 200 && now.contextBudget === cfg.value.standard + 7000, "активация новой версии context_budget меняет contextBudget в /estimate", [cfg.value.standard, now.contextBudget]);
    ok((await A.api("POST", "/syntheses/estimate", EST("overview"))).json.contextBudget === cfg.value.overview, "… у другой глубины — прежний");
    await ADM.api("POST", "/configs/context_budget/activate", { version: cfg.version });
    ok((await A.api("POST", "/syntheses/estimate", EST("standard"))).json.contextBudget === cfg.value.standard, "возврат прежней версии — прежний contextBudget");

    console.log("■ R5: Д-20 — оценка ретрофита без обращения к модели");
    const calls0 = mock.calls, q0 = await usedRegen(A.id), u0 = await usageCount(A.id);
    const [tot0] = await sql`select total_cost_usd c, total_input_tokens i from syntheses where id=${D5}`;
    const es = await A.api("GET", rec(D5, "/extract/estimate"));
    ok(es.status === 200 && es.json.estimate.inTokens > 0 && es.json.estimate.outTokens > 0 && es.json.estimate.cost > 0, "GET …/recommendations/extract/estimate → оценка входа, выхода и цены", es.json);
    ok(es.json.quota?.type === "regenerations" && es.json.quota.units === 1, "ответ называет, что спишется у подписчика: одна единица regenerations", es.json.quota);
    const [tot1] = await sql`select total_cost_usd c, total_input_tokens i from syntheses where id=${D5}`;
    ok(mock.calls === calls0 && (await usedRegen(A.id)) === q0 && (await usageCount(A.id)) === u0 && tot1.c === tot0.c && tot1.i === tot0.i, "мок Claude не получил запроса; квота, api_usage и итог документа не тронуты", [mock.calls - calls0, q0, await usedRegen(A.id)]);
    // оценка против настоящего вызова: вход — размер того же запроса
    const exr = await A.api("POST", rec(D5, "/extract"));
    ok(exr.status === 200 && mock.calls === calls0 + 1 && (await usedRegen(A.id)) === q0 + 1, "сам ретрофит — одно обращение и одна единица квоты (оценка её лишь называла)", [exr.status, mock.calls - calls0]);
    const [glx] = await sql`select input_chars ic, section_key k, section_label l from generation_log where synthesis_id=${D5} and source='subsection_regen' order by created_at desc limit 1`;
    ok(Math.ceil(glx.ic / CE.CHARS_PER_TOKEN) === es.json.estimate.inTokens, "оценка считала вход ТОЧНО по тому запросу, что затем ушёл модели (SYS + промпт)", [glx.ic, es.json.estimate.inTokens]);
    ok(glx.k === "critique:Таблица рекомендаций", "строка генлога ретрофита — ключом подраздела (в «фактический размер критики» оценок не попадает)", glx);
    ok((await B.api("GET", rec(D5, "/extract/estimate"))).status === 403 && (await fetch(`${BASE}${rec(D5, "/extract/estimate")}`)).status === 401, "чужому — 403, без сессии — 401");
    const bare = await makeDoc(A);
    await sql`delete from sections where synthesis_id=${bare} and key='critique'`;
    const nf = await A.api("GET", rec(bare, "/extract/estimate"));
    ok(nf.status === 404 && nf.json.details?.reason === "no_critique", "нет критики → 404 no_critique, как у самого ретрофита", nf.json);
    await waitIdle(A, D5);

    console.log("■ R5: Д-21 — чужое «Основание» — замечание, не invalid");
    const pr = (await A.api("POST", rec(D5, "/parse"))).json;
    const row3 = pr.rows.find((x) => x.num === "3"), row5 = pr.rows.find((x) => x.num === "5");
    ok(row3.status === "new" && row3.invalidReason === null && !!row3.warning?.includes("«Подраздел, которого нет»") && row3.warning.includes("«Слепые пятна»"), "строка 3: статус new, замечание называет чужой подраздел и перечень годных", row3.warning);
    ok(pr.invalidCount === 1 && row5.status === "invalid", "в счёт негодных замечание не входит (негодна только строка 5 — по адресу и операции)", [pr.invalidCount, row5.invalidReason]);
    ok(pr.rows.filter((x) => x.warning).length === 1, "у строк с годным основанием замечаний нет", pr.rows.map((x) => [x.num, x.warning]));
    const p3 = await A.api("POST", rec(D5, "/plan"), { nums: ["3"] });
    ok(p3.status === 200 && p3.json.planned[0]?.num === "3" && p3.json.planned[0].warning === row3.warning, "строка с замечанием ставится в план как обычная", [p3.status, p3.json?.declined]);
    await A.api("DELETE", planUrl(D5, p3.json.plan.id));

    console.log("■ R5: Д-32 — отказ планировщика на языке запроса");
    const decl = async (headers) => (await A.api("POST", rec(D5, "/plan"), { nums: ["2", "6"] }, headers));
    const ru = await decl({});
    const dRu = ru.json.declined?.find((x) => x.code === "section_regenerated");
    ok(ru.status === 200 && !!dRu?.reason.includes("Раздел «Граф категорий» этим же планом перегенерируется целиком"), "ru: отказ section_regenerated с русской меткой раздела", ru.json?.declined ?? ru.json);
    await A.api("DELETE", planUrl(D5, ru.json.plan.id));
    for (const [lang, label] of [["en", "Category graph"], ["de", null]]) {
      const r = await decl({ "Accept-Language": lang });
      const d = r.json.declined?.find((x) => x.code === "section_regenerated");
      ok(r.status === 200 && !!d && d.reason !== dRu.reason && !CYR.test(d.reason), `${lang} (Accept-Language): отказ переведён целиком — оборот и метка раздела`, d?.reason ?? r.json);
      if (label) ok(d.reason.includes(`“${label}”`), `${lang}: метка раздела — «${label}»`, d.reason);
      await A.api("DELETE", planUrl(D5, r.json.plan.id));
    }
    // отказ целиком (422): сообщение и причины — тоже на языке запроса
    const all = await A.api("POST", rec(D5, "/plan"), { nums: ["4"] }, { "Accept-Language": "en" });
    ok(all.status === 422 && all.json.code === "RECOMMENDATIONS_NOT_PLANNABLE" && !CYR.test(outside(all.json.error)) && all.json.details.declined[0].code === "delete_element" && /deleting a category/.test(all.json.details.declined[0].reason), "en: «удалить элемент» — 422, текст отказа английский, род элемента подставлен", all.json);
    const allDe = await A.api("POST", rec(D5, "/plan"), { nums: ["4"] }, { "Accept-Language": "de" });
    ok(/Löschen einer Kategorie/.test(allDe.json?.details?.declined?.[0]?.reason ?? ""), "de: род элемента в родительном падеже («einer Kategorie»)", allDe.json?.details?.declined);
    // подсказка о негодных (hint) — на языке запроса
    const inv = await A.api("POST", rec(D5, "/plan"), { nums: ["5"] }, { "Accept-Language": "en" });
    ok(inv.status === 422 || inv.status === 400, "негодная строка в план не берётся", [inv.status, inv.json?.code]);
  }

  /* ════ R6: Д-46 ════ */
  if (want("R6")) {
    console.log("\n■ R6: Д-46 — причины сторожа: в БД коды, человеку — на его языке");
    await waitIdle(A, D5);
    const ru = (await A.api("GET", rec(D5))).json.rows;
    const en = (await A.api("GET", rec(D5), undefined, { "Accept-Language": "en" })).json.rows;
    const de = (await A.api("GET", rec(D5), undefined, { "Accept-Language": "de-DE,de;q=0.9" })).json.rows;
    const at = (rows, num) => rows.find((x) => x.num === num);
    ok(at(ru, "5").invalidReason === "подраздела «Нет такого адреса» в документе нет; операция «улучшить» вне закрытого списка: " + K.RECOMMENDATION_OPS.join(" | "), "ru: причина негодности — прежней русской фразой (обе причины через «; »)", at(ru, "5").invalidReason);
    ok(at(en, "5").invalidReason.startsWith("there is no subsection “Нет такого адреса” in the document; the operation “улучшить” is outside the closed list: ") && at(en, "5").invalidReason.endsWith(K.RECOMMENDATION_OPS.join(" | ")), "en: фраза английская; адрес из документа и закрытый список операций — как есть", at(en, "5").invalidReason);
    ok(at(de, "5").invalidReason.startsWith("den Unterabschnitt „Нет такого адреса“ gibt es im Dokument nicht; die Operation „улучшить“"), "de: фраза немецкая", at(de, "5").invalidReason);
    ok(!CYR.test(outside(at(en, "3").warning)) && at(en, "3").warning.includes("“Подраздел, которого нет”") && !CYR.test(outside(at(de, "3").warning)) && at(de, "3").warning !== at(en, "3").warning, "замечание об основании — тоже на языке запроса", [at(en, "3").warning, at(de, "3").warning]);
    ok(J(at(en, "5").issues.map((x) => `${x.level}:${x.code}`)) === J(["invalid:address_not_found", "invalid:op_not_allowed"]) && J(at(en, "3").issues.map((x) => x.code)) === J(["rationale_unknown"]) && J(at(ru, "5").issues) === J(at(en, "5").issues), "ответ несёт находки кодами — одинаковыми при любом языке", at(en, "5").issues);
    const [db5] = await sql`select invalid_reason, warning, issues from recommendations where synthesis_id=${D5} and num='5' order by round desc limit 1`;
    ok(db5.invalid_reason === at(ru, "5").invalidReason && db5.issues.length === 2 && db5.issues[0].params.address === "Нет такого адреса", "в БД: invalid_reason — русский вид, issues — коды с параметрами", db5);
    // язык пользователя (ui_locale) сильнее заголовка
    const pm = await A.api("PATCH", "/auth/me", { uiLocale: "de" });
    const mine = (await A.api("GET", rec(D5), undefined, { "Accept-Language": "en" })).json.rows;
    ok(pm.status === 200 && at(mine, "5").invalidReason === at(de, "5").invalidReason, "язык пользователя (ui_locale = de) решает раньше Accept-Language", at(mine, "5").invalidReason);
    await sql`update users set ui_locale = null, gen_lang = null where id=${A.id}`;
    // разбор под английским запросом: в БД всё равно русский вид и те же коды
    const D6 = await makeDoc(A);
    const pe = await A.api("POST", rec(D6, "/parse"), undefined, { "Accept-Language": "en" });
    const [db6] = await sql`select invalid_reason, issues from recommendations where synthesis_id=${D6} and num='5'`;
    ok(pe.status === 200 && at(pe.json.rows, "5").invalidReason === at(en, "5").invalidReason && db6.invalid_reason === at(ru, "5").invalidReason, "разбор под en: ответ английский, в БД — русский вид (язык записи не решает язык чтения)", db6.invalid_reason);
    // строка, разобранная до 12.3 (кодов нет): отдаётся сохранённый текст
    await sql`update recommendations set issues = null where synthesis_id=${D6} and num='5'`;
    const legacy = at((await A.api("GET", rec(D6), undefined, { "Accept-Language": "en" })).json.rows, "5");
    ok(legacy.invalidReason === at(ru, "5").invalidReason && legacy.issues.length === 0, "строка без кодов (до миграции 0013) отдаёт сохранённый русский текст", legacy.invalidReason);
    // планировщик: адресат исчез — причина кодом, ответ на языке запроса
    await A.api("POST", rec(D6, "/parse"));
    await sql`delete from categories where synthesis_id=${D6} and name='Ничто'`;
    const gone = await A.api("POST", rec(D6, "/plan"), { nums: ["2"] }, { "Accept-Language": "en" });
    const [db2] = await sql`select status, invalid_reason, issues from recommendations where synthesis_id=${D6} and num='2'`;
    ok(gone.status === 422 && gone.json.details.invalid[0].reason.startsWith("the target was not found when the plan was drafted: the element “Ничто”"), "исчезнувший элемент: отказ постановки, причина — английской фразой", gone.json);
    ok(db2.status === "invalid" && db2.issues[0].code === "target_element_gone" && db2.invalid_reason === "адресат не найден при постановке плана: элемент «Ничто» удалён из концепции после разбора", "… в БД — код target_element_gone и русский вид", db2);
  }

  /* ════ R7: свой повтор пропущенной таблицы (Д-21) ════ */
  if (want("R7")) {
    console.log("\n■ R7: Д-21 — модель пропустила таблицу рекомендаций");
    const D = await makeDoc(A);
    const tableAfterProse = (html) => { const n = [...html.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]); return n.indexOf(TABLE) === n.indexOf(PROSE) + 1 && n.filter((x) => x === TABLE).length === 1; };
    // (а) перегенерация: таблица пропущена → составлена повторным обращением
    mock.critique = { lead: "Редакция без таблицы.", table: "none" };
    let c0 = mock.calls, x0 = mock.extractCalls, q0 = await usedRegen(A.id);
    let done = await regenCritique(A, wsA, D);
    ok(done.type === "section_done" && mock.calls === c0 + 2 && mock.extractCalls === x0 + 1, "перегенерация: два обращения к модели — критика и повтор «переложить в таблицу»", [done.type, mock.calls - c0, mock.extractCalls - x0]);
    ok(tableAfterProse(done.html) && done.html.includes("Редакция без таблицы."), "section_done несёт критику УЖЕ с таблицей — сразу после прозы", [...done.html.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]).slice(-3));
    await waitIdle(A, D);
    ok(tableAfterProse(await critiqueHtml(D)), "в БД критика с таблицей");
    ok((await usedRegen(A.id)) === q0 + 1, "квота: одна единица за перегенерацию — повтор своей единицы не берёт", [q0, await usedRegen(A.id)]);
    const logs = await sql`select section_key k, section_label l, status s, metadata m from generation_log where synthesis_id=${D} and log_type='generation' order by created_at desc limit 2`;
    const retryRow = logs.find((x) => x.k === "critique:Таблица рекомендаций"), critRow = logs.find((x) => x.k === "critique");
    ok(!!retryRow && retryRow.s === "done" && /повтор: пропущена моделью/.test(retryRow.l), "генлог: строка повтора ключом подраздела с подписью «повтор: пропущена моделью»", logs.map((x) => [x.k, x.l]));
    ok(/модель не написала подраздел «Таблица рекомендаций» — составлена повторным обращением/.test(J(critRow?.m?.parseWarnings ?? [])), "генлог критики: пометка владельцу о пропуске и повторе", critRow?.m?.parseWarnings);
    const pr = await A.api("POST", rec(D, "/parse"));
    ok(pr.status === 200 && pr.json.rows.length === ROWS.length, "рекомендации разбираются без ручного ретрофита", [pr.status, pr.json?.rows?.length ?? pr.json]);
    // (б) подраздел таблицы написан, но таблицы в нём нет → заменён
    mock.critique = { lead: "Редакция с негодной таблицей.", table: "broken" };
    x0 = mock.extractCalls;
    done = await regenCritique(A, wsA, D);
    await waitIdle(A, D);
    const hb = await critiqueHtml(D);
    ok(mock.extractCalls === x0 + 1 && tableAfterProse(hb) && !hb.includes("Таблица будет составлена позже") && /<table/.test(hb.slice(hb.indexOf(`data-section="${TABLE}"`))), "подраздел без таблицы — повтор заменяет его содержимое таблицей", mock.extractCalls - x0);
    const [lb] = await sql`select section_label l from generation_log where synthesis_id=${D} and section_key=${"critique:Таблица рекомендаций"} order by created_at desc limit 1`;
    ok(/повтор: негодна/.test(lb.l), "подпись строки генлога — «повтор: негодна»", lb.l);
    // (в) таблица на месте → повтора нет
    mock.critique = { lead: "Редакция с таблицей.", table: "full" };
    x0 = mock.extractCalls; c0 = mock.calls;
    await regenCritique(A, wsA, D); await waitIdle(A, D);
    ok(mock.extractCalls === x0 && mock.calls === c0 + 1, "таблица написана моделью — повторного обращения нет");
    // (г) повтор дал негодный ответ → генерация не падает, документ без таблицы, пометка
    mock.critique = { lead: "Редакция, повтор не помог.", table: "none" };
    mock.extractAnswer = "<p>Извините, таблицу составить не могу.</p>";
    x0 = mock.extractCalls;
    done = await regenCritique(A, wsA, D);
    mock.extractAnswer = null;
    await sleep(300);
    const hf = await critiqueHtml(D);
    ok(done.type === "section_done" && mock.extractCalls === x0 + 1 && hf.includes("Редакция, повтор не помог.") && !hf.includes(`data-section="${TABLE}"`), "негодный ответ повтора: перегенерация завершена (section_done), критика записана без таблицы, повтор один", [done.type, mock.extractCalls - x0]);
    const pf = await gated(() => A.api("POST", rec(D, "/parse")));
    ok(pf.status === 404 && pf.json.details?.reason === "no_table", "… разбор честно отвечает 404 no_table — остаётся ручной ретрофит", pf.json);
    const [lf] = await sql`select metadata m from generation_log where synthesis_id=${D} and section_key='critique' and log_type='generation' order by created_at desc limit 1`;
    ok(/повторное обращение не помогло/.test(J(lf.m.parseWarnings ?? [])), "генлог критики: пометка «повторное обращение не помогло»", lf.m.parseWarnings);
    const ex = await A.api("POST", rec(D, "/extract"));
    ok(ex.status === 200 && ex.json.outcome === "inserted", "ручной ретрофит после неудачного повтора работает", [ex.status, ex.json?.outcome]);
    await waitIdle(A, D);
    // (д) шаг плана: каскадная перегенерация критики тем же путём
    const Dp = await makeDoc(A);
    await A.api("POST", rec(Dp, "/parse"));
    const pp = await A.api("POST", rec(Dp, "/plan"), { nums: ["1"] });
    const first = wsA.onNext((m) => m.type === "plan_updated" && m.planId === pp.json.plan.id && m.plan.status === "done", (m) => m);
    await A.api("POST", planUrl(Dp, pp.json.plan.id, "/execute"));
    const fp = await first;
    const idx = fp.plan.steps.findIndex((s) => s.status === "pending" && s.target === "critique");
    mock.critique = { lead: "Критика шагом плана.", table: "none" };
    x0 = mock.extractCalls;
    const stepDone = wsA.onNext((m) => m.type === "plan_updated" && m.planId === pp.json.plan.id && m.plan.steps[idx]?.status === "done", (m) => m);
    wsA.send({ type: "confirm_step", planId: pp.json.plan.id, stepIndex: idx });
    await Promise.race([stepDone, sleep(60000).then(() => { throw new Error("confirm_step критики не завершился"); })]);
    ok(mock.extractCalls === x0 + 1 && tableAfterProse(await critiqueHtml(Dp)), "шаг плана (каскадная критика): таблица составлена повтором", mock.extractCalls - x0);
    mock.critique = { lead: "Редакция А.", table: "full" };
    // (е) полная генерация
    const s5 = wsA.mark(); x0 = mock.extractCalls; c0 = mock.calls;
    const post = await A.api("POST", "/syntheses", { seed: "[MOCK:CRITNOTABLE] полная генерация без таблицы", philosophers: ["Кант"], sections: ["graph", "dialogue", "critique"], method: "dialectical", depth: "overview", synthLevel: "comparative" });
    const G = post.json.id; ids.push(G);
    const fin = await wsA.waitFor((m) => (m.type === "generation_complete" || m.type === "generation_paused") && m.synthesisId === G, s5, 120000, "generation_complete");
    const sd = wsA.messages.slice(s5).find((m) => m.type === "section_done" && m.synthesisId === G && m.sectionKey === "critique");
    ok(fin.type === "generation_complete" && mock.extractCalls === x0 + 1 && tableAfterProse(await critiqueHtml(G)) && !!sd && tableAfterProse(sd.html), "полная генерация: таблица составлена повтором, section_done критики несёт её", [fin.type, mock.extractCalls - x0]);
    // Д-13: при полной генерации подраздел виден в прогрессе (subsection_found шлёт только она)
    const found = wsA.messages.slice(s5).filter((m) => m.type === "subsection_found" && m.synthesisId === G && m.sectionKey === "critique").map((m) => m.subsectionName);
    ok(found.includes(INTERLAYER) && found.indexOf(INTERLAYER) === 1, "Д-13: полная генерация — «Межслойная согласованность» учтена в прогрессе подразделов вторым пунктом", found);
    // расход повтора — в итоге документа (проход ведёт итог локально: без учёта следующий проход стёр бы его)
    const [tot] = await sql`select total_input_tokens i, total_output_tokens o from syntheses where id=${G}`;
    ok(tot.i === (mock.calls - c0) * 1000 && tot.o === (mock.calls - c0) * 2000, "итог документа считает ВСЕ обращения генерации, включая повтор таблицы", [tot, mock.calls - c0]);
    const [edited] = await sql`select is_edited e from sections where synthesis_id=${G} and key='critique'`;
    ok(edited.e === false, "повтор при генерации не помечает раздел изменённым");
    ok((await sql`select count(*)::int n from generation_log where synthesis_id=${G} and section_key='critique' and section_label like '%Таблица рекомендаций%'`)[0].n === 0, "строк генлога таблицы с ключом РАЗДЕЛА нет — оценки перегенерации критики берут размер самой критики");
    // (ж) полная генерация, повтор дал негодный ответ: генерация завершена, расход негодного обращения в итоге документа
    const s6 = wsA.mark(); x0 = mock.extractCalls; c0 = mock.calls;
    mock.extractAnswer = "<p>Таблицу составить не могу.</p>";
    const post2 = await A.api("POST", "/syntheses", { seed: "[MOCK:CRITNOTABLE] полная генерация, повтор не помог", philosophers: ["Кант"], sections: ["graph", "dialogue", "critique"], method: "dialectical", depth: "overview", synthLevel: "comparative" });
    const G2 = post2.json.id; ids.push(G2);
    const fin2 = await wsA.waitFor((m) => (m.type === "generation_complete" || m.type === "generation_paused") && m.synthesisId === G2, s6, 120000, "generation_complete (повтор не помог)");
    mock.extractAnswer = null;
    const [tot2] = await sql`select total_input_tokens i, total_output_tokens o, status s from syntheses where id=${G2}`;
    ok(fin2.type === "generation_complete" && tot2.s === "ready" && mock.extractCalls === x0 + 1 && !(await critiqueHtml(G2)).includes(`data-section="${TABLE}"`), "полная генерация при негодном повторе завершена (ready), критика без таблицы", [fin2.type, tot2.s]);
    ok(tot2.i === (mock.calls - c0) * 1000 && tot2.o === (mock.calls - c0) * 2000, "… и расход негодного обращения тоже в итоге документа", [tot2, mock.calls - c0]);
  }

  /* ════ R8: Д-47 — успешный ответ без подраздела ════ */
  if (want("R8")) {
    console.log("\n■ R8: Д-47 — успешный ответ без подраздела оставляет пометку");
    const D = await makeDoc(A);
    const genRow = async (id, key) => (await sql`select metadata m, status s from generation_log where synthesis_id=${id} and section_key=${key} and log_type='generation' order by created_at desc limit 1`)[0];
    const notes = (row) => row?.m?.parseWarnings ?? [];
    const MISS = /модель завершила ответ, не написав подраздел/;
    const N = CRIT_SUBS.length;
    // (а) перегенерация: модель дописала ответ, но подраздел пропустила
    mock.critique = { lead: "Без межслойной.", table: "full", skipInterlayer: true };
    let c0 = mock.calls, r0 = mock.subRegens.length;
    let done = await regenCritique(A, wsA, D); await waitIdle(A, D);
    let w = notes(await genRow(D, "critique"));
    ok(done.type === "section_done" && mock.calls === c0 + 1 && mock.subRegens.length === r0, "перегенерация завершена одним обращением — догенерации пропущенного нет", [done.type, mock.calls - c0]);
    ok(w.length === 1 && w[0].includes(`не написав подраздел «${INTERLAYER}» (ожидалось подразделов: ${N}, размечено: ${N - 1})`) && /перегенерируйте его, если подраздел нужен/.test(w[0]), "генлог критики: пометка называет пропущенный подраздел и счёт", w);
    ok(!(await critiqueHtml(D)).includes(`data-section="${INTERLAYER}"`), "раздел сохранён как есть — без подраздела");
    const sec = await A.api("GET", `/syntheses/${D}/sections/critique`);
    ok(sec.status === 200 && (sec.json.section.parseWarnings ?? []).some((x) => MISS.test(x) && x.includes(INTERLAYER)), "GET раздела отдаёт пометку владельцу (блок предупреждений раздела)", sec.json?.section?.parseWarnings);
    const fl = await A.api("GET", `/syntheses/${D}/logs/formatted`);
    ok(fl.status === 200 && fl.json.text.includes(`не написав подраздел «${INTERLAYER}»`), "лог генерации показывает пометку", fl.status);
    // (б) полный ответ — пометки нет, прежняя уходит вместе с прежней редакцией
    mock.critique = { lead: "Редакция полная.", table: "full" };
    await regenCritique(A, wsA, D); await waitIdle(A, D);
    w = notes(await genRow(D, "critique"));
    const sec2 = await A.api("GET", `/syntheses/${D}/sections/critique`);
    ok(w.length === 0 && Array.isArray(sec2.json.section.parseWarnings) && sec2.json.section.parseWarnings.length === 0, "все подразделы на месте — пометок нет, прежняя раздел больше не сопровождает", [w, sec2.json?.section?.parseWarnings]);
    // (в) два подраздела пропущено — множественное число, оба названы
    mock.critique = { lead: "Без двух.", table: "full", skip: ["Слепые пятна", "Итоговая оценка"] };
    await regenCritique(A, wsA, D); await waitIdle(A, D);
    w = notes(await genRow(D, "critique"));
    ok(w.length === 1 && w[0].includes("не написав подразделы «Слепые пятна», «Итоговая оценка»") && w[0].includes(`размечено: ${N - 2}`) && /если подразделы нужны/.test(w[0]), "два пропущенных подраздела названы оба", w);
    // (г) пропущены подраздел и таблица; таблицу составил повтор → в пометке только подраздел
    mock.critique = { lead: "Без межслойной и таблицы.", table: "none", skipInterlayer: true };
    let x0 = mock.extractCalls;
    await regenCritique(A, wsA, D); await waitIdle(A, D);
    w = notes(await genRow(D, "critique"));
    const miss = w.filter((x) => MISS.test(x));
    ok(mock.extractCalls === x0 + 1 && miss.length === 1 && miss[0].includes(INTERLAYER) && !miss[0].includes(TABLE) && w.some((x) => /составлена повторным обращением/.test(x)), "таблица составлена повтором — сверка называет только настоящий пропуск", w);
    // (д) таблица пропущена, повтор не помог → о таблице сказано один раз, пометкой повтора
    mock.critique = { lead: "Без таблицы, повтор не помог.", table: "none" };
    mock.extractAnswer = "<p>Таблицу составить не могу.</p>";
    await regenCritique(A, wsA, D); mock.extractAnswer = null; await sleep(300);
    await gated(() => A.api("POST", rec(D, "/parse")));
    w = notes(await genRow(D, "critique"));
    ok(w.length === 1 && /повторное обращение не помогло/.test(w[0]) && !w.some((x) => MISS.test(x)), "негодный повтор: о таблице сказано один раз — пометкой повтора, сверка её не дублирует", w);
    mock.critique = { lead: "Редакция А.", table: "full" };
    // (е) полная генерация: пометка у каждого раздела, где ответ неполон
    const s8 = wsA.mark(); r0 = mock.subRegens.length; x0 = mock.extractCalls;
    const post = await A.api("POST", "/syntheses", { seed: "[MOCK:CRITSKIPSUB] полная генерация без подраздела", philosophers: ["Кант"], sections: ["graph", "dialogue", "critique"], method: "dialectical", depth: "overview", synthLevel: "comparative" });
    const G = post.json.id; ids.push(G);
    const fin = await wsA.waitFor((m) => (m.type === "generation_complete" || m.type === "generation_paused") && m.synthesisId === G, s8, 120000, "generation_complete (Д-47)");
    const [st] = await sql`select status s from syntheses where id=${G}`;
    w = notes(await genRow(G, "critique"));
    ok(fin.type === "generation_complete" && st.s === "ready" && mock.subRegens.length === r0 && mock.extractCalls === x0, "полная генерация завершена (ready) без паузы и без догенераций", [fin.type, st.s, mock.subRegens.length - r0]);
    ok(w.length === 1 && w[0].includes(`не написав подраздел «${INTERLAYER}»`), "полная генерация: пометка в строке генлога критики", w);
    const gw = notes(await genRow(G, "graph"));
    ok(gw.some((x) => x.includes("не написав подразделы «Топология графа», «Топологическая таблица»") && x.includes("ожидалось подразделов: 5, размечено: 3")), "… и у графа: мок пишет три подраздела из пяти — названы оба недостающих", gw);
    // (ж) добавление раздела шагом плана
    const skipped = HIST_MAP[HIST_MAP.length - 2];
    mock.plain = HIST_MAP.filter((n) => n !== skipped);
    const pl = await A.api("POST", `/syntheses/${D}/plans`, { regen: [], remove: [], add: ["history"] });
    ok(pl.status === 200 && pl.json.plan.steps.some((s) => s.type === "add" && s.target === "history" && s.status === "confirmed"), "план с добавлением раздела «history»", pl.json);
    const s9 = wsA.mark();
    await gated(() => A.api("POST", planUrl(D, pl.json.plan.id, "/execute")));
    const sd = await wsA.waitFor((m) => (m.type === "section_done" || m.type === "stream_error") && m.synthesisId === D && m.sectionKey === "history", s9, 60000, "section_done history");
    await wsA.waitFor((m) => m.type === "plan_updated" && m.planId === pl.json.plan.id && m.plan.status === "done", s9, 60000, "plan done (add history)");
    mock.plain = null;
    w = notes(await genRow(D, "history"));
    ok(sd.type === "section_done" && w.length === 1 && w[0].includes(`не написав подраздел «${skipped}»`) && w[0].includes(`ожидалось подразделов: ${HIST_MAP.length}, размечено: ${HIST_MAP.length - 1}`), "добавление раздела: пометка в строке генлога нового раздела", w);
  }

  /* ════ L: файл концепции ════ */
  if (want("L")) {
    console.log("\n■ L: файл концепции (T123_FILE)");
    if (!FILE || !existsSync(FILE)) console.log("  · T123_FILE не задан или файла нет — пропуск");
    else {
      const fd = new FormData(); fd.append("file", new Blob([readFileSync(FILE, "utf8")], { type: "text/html" }), "live.html");
      const imp = await A.api("POST", "/syntheses/import", fd);
      ok(imp.status === 200 || imp.status === 201, "файл импортирован", imp.json);
      const L = imp.json.id; ids.push(L);
      const live = await critiqueHtml(L);
      const liveNames = [...live.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]);
      console.log(`  подразделы критики файла (${liveNames.length}): ${liveNames.join(" · ")}`);
      const hadTable = liveNames.includes(TABLE);
      const est = await A.api("GET", rec(L, "/extract/estimate"));
      ok(est.status === 200 && est.json.estimate.inTokens > 500, "оценка ретрофита на настоящем документе", est.json);
      if (!hadTable) {
        mock.extractRows = ROWS.slice(0, 1).map((r) => [...r.slice(0, 1), liveNames.length ? "Таблица категорий" : r[1], "", "развить", "", liveNames[0] ?? "", "косметическая"]);
        const ex = await A.api("POST", rec(L, "/extract"));
        ok(ex.status === 200, "в файле таблицы нет — ретрофит составил её", ex.json);
        mock.extractRows = ROWS;
        await waitIdle(A, L);
      }
      const pr = await A.api("POST", rec(L, "/parse"));
      ok(pr.status === 200 && pr.json.rows.length > 0, `рекомендации файла разобраны: строк ${pr.json?.rows?.length}, негодных ${pr.json?.invalidCount}`, pr.json);
      const withNotes = pr.json.rows.filter((x) => x.warning), bad = pr.json.rows.filter((x) => x.status === "invalid");
      console.log(`  замечаний об основании: ${withNotes.length}${withNotes[0] ? " — напр.: " + withNotes[0].warning.slice(0, 160) : ""}`);
      ok(pr.json.rows.every((x) => Array.isArray(x.issues) && (x.status !== "invalid" || x.issues.some((i) => i.level === "invalid"))) && withNotes.every((x) => x.issues.some((i) => i.level === "warning")), "у каждой негодной строки и каждого замечания — находка кодом");
      const en = (await A.api("GET", rec(L), undefined, { "Accept-Language": "en" })).json.rows;
      // закрытые списки операций и важности — машинные значения документа: остаются русскими после двоеточия
      const tail = (r) => (r ?? "").split("; ").map((part) => (/outside the closed list/.test(part) ? part.slice(0, part.lastIndexOf(":")) : part)).join("; ");
      ok(en.every((x) => !CYR.test(outside(tail(x.invalidReason))) && !CYR.test(outside(tail(x.warning)))), "под en причины и замечания файла — без кириллицы вне названий из документа", en.filter((x) => CYR.test(outside(tail(x.invalidReason))) || CYR.test(outside(tail(x.warning)))).map((x) => x.invalidReason ?? x.warning).slice(0, 2));
      console.log(`  негодных строк: ${bad.length}${bad[0] ? " — напр.: " + bad[0].invalidReason.slice(0, 160) : ""}`);
    }
  }

  console.log(`\nмок Claude: обращений ${mock.calls} (таблица по прозе — ${mock.extractCalls}, подразделы — ${mock.subRegens.length}); мок Stripe: запросов ${stripeMock.state.requests.length}`);
} catch (e) { failed++; fails.push("СБОЙ"); console.log("СБОЙ:", e?.stack ?? e); }
finally {
  // реестр: вернуть активные версии и убрать заведённые тестом (активация через API сбрасывает кэш)
  try {
    const ADMC = (await sql`select id from users where email like 't123-adm-%@example.com'`).map((u) => u.id);
    for (const [key, table, kind] of [["system", "prompt_templates", "prompts"], ["context_budget", "synthesis_configs", "configs"]]) {
      const b = registryBefore[key];
      if (!b) continue;
      await sql`update ${sql(table)} set is_active = (version = ${b.active}) where key=${key}`;
      await sql`delete from ${sql(table)} where key=${key} and version > ${b.max}`;
      await redisMod.redis.del(`prompt_cache:${key}`, `config_cache:${key}`).catch(() => {});
      void kind;
    }
    if (ADMC.length) { await sql`update prompt_templates set created_by = null where created_by in ${sql(ADMC)}`; }
  } catch (e) { console.log("уборка реестра:", e?.message ?? e); }
  for (const id of ids) await sql`delete from syntheses where id=${id}`.catch(() => {});
  const mine = sql`select id from users where email like 't123-%@example.com'`;
  await sql`delete from user_subscriptions where user_id in (${mine})`.catch(() => {});
  await sql`delete from subscription_plans where name like 't123plan%'`.catch(() => {});
  await sql`delete from edit_plans where user_id in (${mine})`.catch(() => {});
  await sql`delete from api_usage where user_id in (${mine})`.catch(() => {});
  await sql`delete from transactions where user_id in (${mine})`.catch(() => {});
  await sql`delete from admin_audit where actor_id in (${mine})`.catch(() => {});
  await sql`delete from users where email like 't123-%@example.com'`.catch((e) => console.log("уборка users:", e?.code ?? e?.message ?? e));
  try { if (srv) process.kill(-srv.pid, "SIGKILL"); } catch {}
  mockSrv.closeAllConnections?.(); mockSrv.close();
  await stripeMock.stop().catch(() => {});
  try { await closeDb(); } catch {}
  try { await redisMod.closeRedis(); } catch {}
  await Promise.race([sql.end({ timeout: 2 }), sleep(3000)]);
}
console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗`);
if (fails.length) console.log("Провалы:\n" + fails.map((f) => "  - " + f).join("\n"));
process.exit(failed ? 1 : 0);
