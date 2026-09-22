/**
 * Беседа 10.2 — тестовые запросы 2–11 одним харнессом.
 * Живой сервер :3000 (BILLING_ENFORCE=true) + PG16/Redis + мок Claude :3912 +
 * HTTP и WS (глобальный WebSocket Node 22). Документ — ЖИВОЙ файл
 * одностраничника (T102_FILE; без файла — пропуск): импорт 4.3 → ретрофит 10.1
 * (мок отдаёт таблицу) → постановка планов 10.2. Браузер не нужен: беседа
 * серверная, панель — 10.3.
 *
 * Пользователи: A — подписчик с квотой regenerations (видно, тратится она или
 * нет); B — БЕЗ источника оплаты (бесплатный план обязан пройти, платный — 403);
 * C — чужой.
 *
 *  R2  edit_element: готовая замена → план из одного базового шага → исполнение
 *      → определение изменено, версия 'recommendation' с origin, квота и
 *      стоимость не тронуты; то же — человеком без ключа/подписки/баланса
 *  R3  refine_element: узкий контекст у модели, значение записано, версия,
 *      квота regenerations −1, api_usage и generation_log; негодный ответ
 *      модели элемент не меняет → пауза плана → skip_step → 'rejected'
 *  R4  перевод адресов: подраздел без элемента → regen_subsection
 *      «sectionKey:Адрес»; «перегенерировать» → regen раздела
 *  R5  каскад: шаг critique появился САМ (cascadeGenerated), один раз
 *  R6  развилка: ['5б'] — один шаг; ['5а','5б'] и ['5'] → 400; planned только
 *      выбранный вариант; [] → 400 («все разом» входа не имеет)
 *  R7  раунд: planned + сменившаяся критика → 409 ROUND_IN_PROGRESS; после
 *      исполнения и перегенерации критики (confirm_step каскадного шага) parse
 *      открывает round+1
 *  R8  статусы: исполнен → done; снят в панели → rejected; invalid остаётся
 *      invalid и в план не берётся
 *  R9  оценка: два edit_element + refine_element → нулевая стоимость первых
 *      двух отдельной строкой
 *  R10 устаревание: ручная правка подраздела-адресата (9.2) → stale с
 *      предложением перечитать; после перечитки строка снова годна
 *  R11 края: элемент удалён → invalid с причиной; чужой → 403; генерация идёт
 *      → 409; без сессии → 401; раунда нет → 404
 *
 * Запуск (≈ 2 мин, в фоне): T102_FILE=… node_modules/.bin/tsx tests/test-102-requests2-11.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { parseHTML } from "linkedom";
import postgres from "postgres";

const FILE = process.env.T102_FILE;
if (!FILE || !existsSync(FILE)) { console.log("T102_FILE не задан или файла нет — ПРОПУСК"); process.exit(0); }
const ROOT = new URL("../", import.meta.url).pathname;
const BASE = "http://127.0.0.1:3000/api/v1";
const sql = postgres(process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth");
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
function ok(cond, name, extra) { if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 500) : ""}`); } }

const PROSE = "Рекомендации по улучшению", TABLE = "Таблица рекомендаций";
const HEAD = ["№", "Адрес", "Элемент", "Операция", "Готовая замена", "Основание", "Важность"];
const REPL2 = "конститутивное нарушение грамматики, произведённое в ответ на присутствие нередуцируемого содержания";
const REPL6 = "незакрываемый онтологический зазор в архетипе, переживаемый как нуминозное присутствие";
const ROWS = [
  ["1", "Таблица определений", "Самость-как-вмещение", "переопределить", "", "Верность методу синтеза", "существенная"],
  ["2", "Таблица категорий", "Индивидуация-как-практика", "уточнить формулировку", REPL2, "Верность методу синтеза", "существенная"],
  ["3", "Онтологические тезисы", "", "добавить", "", "Верность уровню синтеза", "существенная"],
  ["4", "Эпистемологические тезисы", "Э-3", "развить", "", "Слепые пятна", "существенная"],
  ["5а", "Таблица категорий", "Энантиодромия разлома", "удалить", "", "Верность методу синтеза", "блокирующая"],
  ["5б", "Таблица категорий", "Энантиодромия разлома", "переопределить", "", "Верность методу синтеза", "блокирующая"],
  ["6", "Таблица определений", "Архетипический разлом", "развить", REPL6, "Сохранение ценных аспектов", "косметическая"],
  ["7", "Новизна и ценность", "", "уточнить формулировку", "", "Сохранение ценных аспектов", "косметическая"],
  ["8", "Аналитический комментарий", "", "перегенерировать", "", "Разрешение противоречий", "косметическая"],
  ["9", "Несуществующий подраздел", "", "развить", "", "Слепые пятна", "косметическая"],
];
const tableHtml = (rows) => `<table class="doc-table"><thead><tr>${HEAD.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const wrapped = (inner) => `<div data-section="${TABLE}"><h4>${TABLE}</h4>\n${inner}\n</div>`;

/* ── Мок Claude: «ответы модели» из живого файла ─────────────────────── */
const MOCK_PORT = 3912;
const { document: liveDoc } = parseHTML(readFileSync(FILE, "utf8"));
const modelSections = [...liveDoc.querySelectorAll(".doc-section")].map((el) => {
  const names = [...el.querySelectorAll("[data-section]")].map((x) => x.getAttribute("data-section"));
  for (const junk of el.querySelectorAll('a[id^="subsec-"], a[id^="sec-"], .toc-back-btn, details.sec-disclosure')) junk.remove();
  return { names, html: el.outerHTML.replace(/<\/(p|div|table|ul|ol|h4|h5)>/g, "</$1>\n") };
}).filter((x) => x.names.length > 0);
const liveCritique = modelSections.find((s) => s.names.includes(PROSE));
function critiqueAnswer(variant) {
  let html = liveCritique.html;
  if (variant === 2) html = html.replace("<strong>Рекомендация 1:", "<strong>Рекомендация 1 (вторая редакция):");
  if (variant === 3) html = html.replace("<strong>Рекомендация 1:", "<strong>Рекомендация 1 (третья редакция):");
  const { document: d } = parseHTML(`<div id="r">${html}</div>`);
  const prose = [...d.querySelectorAll("[data-section]")].find((x) => x.getAttribute("data-section") === PROSE);
  prose.insertAdjacentHTML("afterend", "\n\n" + wrapped(tableHtml(ROWS.filter((r) => r[0] !== "9"))) + "\n");
  return d.getElementById("r").innerHTML;
}
const mock = { calls: 0, picked: [], refinePrompts: [], refineAnswer: null, refineSys: "", critiqueVariant: 1, slow: false, extractRows: ROWS, hanging: [] };
const mockSrv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", async () => {
    mock.calls++;
    let prompt = "", sys = "";
    try { const j = JSON.parse(body); const c = j.messages?.[0]?.content; prompt = typeof c === "string" ? c : J(c); sys = typeof j.system === "string" ? j.system : J(j.system); } catch {}
    let text;
    if (prompt.includes("ТОЧЕЧНАЯ ПРАВКА ОДНОГО ЭЛЕМЕНТА")) {
      // критика и точечная правка узнаются ПЕРВЫМИ — по собственному признаку (09 §4, 10.1)
      mock.refinePrompts.push(prompt); mock.refineSys = sys; mock.picked.push("(refine)");
      text = mock.refineAnswer ?? "```\n«Новое значение поля,   данное моделью»\n```";
    } else if (prompt.includes("ПЕРЕЛОЖИТЬ в таблицу")) {
      mock.picked.push("(ретрофит)");
      if (mock.slow) { mock.hanging.push(res); await sleep(3000); }
      text = wrapped(tableHtml(mock.extractRows));
    } else {
      const task = prompt.slice(Math.max(0, prompt.lastIndexOf("ЗАДАНИЕ")));
      let best = null, bestHits = 0;
      if (task.includes(`Столбцы СТРОГО: ${HEAD.join(" | ")}`)) { best = liveCritique; bestHits = 2; }
      for (const sct of modelSections) { const hits = sct.names.filter((n) => task.includes(n)).length / sct.names.length; if (hits > bestHits) { best = sct; bestHits = hits; } }
      mock.picked.push(best ? best.names[0] : "(не узнан)");
      text = best === liveCritique ? critiqueAnswer(mock.critiqueVariant) : best ? best.html : "<p>Раздел не узнан моком.</p>";
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 1000 } } });
    for (let i = 0; i < text.length; i += 1500) send({ type: "content_block_delta", delta: { type: "text_delta", text: text.slice(i, i + 1500) } });
    send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2000 } });
    send({ type: "message_stop" });
    res.end();
  });
});
await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));

/* ── Сервер и клиенты ────────────────────────────────────────────────── */
let srv = null;
try { if ((await fetch(`${BASE}/health`)).ok) { console.log("На :3000 уже отвечает чужой сервер — стоп (сироты: ps aux | grep 'tsx.*[i]ndex')"); process.exit(2); } } catch {}
srv = spawn(process.execPath, ["--import", "tsx", "index.ts"], { cwd: ROOT + "server", detached: true, stdio: "ignore", env: { ...process.env, PORT: "3000", RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-102", STREAM_RETRY_DELAYS: "50", BILLING_ENFORCE: "true" } });
async function waitHealth() { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/health`)).ok) return true; } catch {} await sleep(500); } return false; }

function client(cookie) {
  const api = async (method, path, body) => {
    const headers = { Cookie: cookie };
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
    const r = await fetch(BASE + path, { method, headers, body: payload });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  return { api, cookie };
}
async function account(tag) {
  const email = `t102-${tag}-${Date.now()}@example.com`;
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-102" }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-102" }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  return { ...client(cookie), email, id: u.id, token: cookie.split("=")[1] };
}
function wsOf(user) {
  const ws = new WebSocket(`ws://127.0.0.1:3000/ws?token=${user.token}`);
  const messages = [];
  ws.addEventListener("message", (ev) => { try { messages.push(JSON.parse(ev.data)); } catch {} });
  const open = new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", () => rej(new Error("ws error")), { once: true }); });
  return { open, messages, send: (o) => ws.send(J(o)), close: () => ws.close() };
}
const rec = (id, tail = "") => `/syntheses/${id}/recommendations${tail}`;
const ids = [];
/** Свежий документ: импорт живого файла + ретрофит (мок отдаёт таблицу). */
async function fresh(user, rows = ROWS) {
  const fd = new FormData(); fd.append("file", new Blob([readFileSync(FILE, "utf8")], { type: "text/html" }), "live.html");
  const imp = await user.api("POST", "/syntheses/import", fd);
  if (imp.status !== 200 && imp.status !== 201) throw new Error("импорт: " + J(imp));
  const id = imp.json.id; ids.push(id);
  mock.extractRows = rows;
  const ex = await user.api("POST", rec(id, "/extract"));
  if (ex.status !== 200) throw new Error("ретрофит: " + J(ex));
  return id;
}
const recRows = (id) => sql`select * from recommendations where synthesis_id=${id} order by round, position`;
const recOf = async (id, num, round) => (await sql`select * from recommendations where synthesis_id=${id} and num=${num} and round=${round ?? sql`(select max(round) from recommendations where synthesis_id=${id})`} order by position`)[0];
const planRow = async (planId) => (await sql`select * from edit_plans where id=${planId}`)[0];
async function waitPlan(planId, pred, label, ms = 30000) {
  const t0 = Date.now();
  // статус 'done' пишется ДО освобождения слота (следом идёт plan_updated с оценкой):
  // следующий запрос под ownerEditGate без паузы ловил бы 409 GENERATION_IN_PROGRESS
  for (;;) { const p = await planRow(planId); if (p && pred(p)) { await sleep(700); return p; } if (Date.now() - t0 > ms) throw new Error(`timeout: ${label}; статус ${p?.status}, шаги ${J(p?.steps?.map((s) => `${s.type}:${s.status}`))}`); await sleep(200); }
}
const usedRegen = async (userId) => (await sql`select used_regenerations n from user_subscriptions where user_id=${userId}`)[0]?.n ?? null;
const usageCount = async (userId) => (await sql`select count(*)::int n from api_usage where user_id=${userId}`)[0].n;
const totals = async (id) => (await sql`select total_cost_usd c, total_input_tokens i from syntheses where id=${id}`)[0];
const baseSteps = (plan) => plan.steps.filter((s) => !s.cascadeGenerated);
const planUrl = (id, planId, tail = "") => `/syntheses/${id}/plans/${planId}${tail}`;

try {
  if (!(await waitHealth())) throw new Error("сервер не поднялся");
  const A = await account("a"), B = await account("b"), C = await account("c");
  // A — подписчик: квота regenerations видна счётчиком
  const [pl] = await sql`insert into subscription_plans (name, display_name, price_usd, quota_syntheses, quota_regenerations, quota_modes, quota_enrichments, stripe_price_id, is_active) values (${"t102plan" + Date.now()}, 'T102', 10, 5, 50, 5, 5, 'price_t102', false) returning id`;
  await sql`insert into user_subscriptions (user_id, plan_id, stripe_subscription_id, status, current_period_start, current_period_end) values (${A.id}, ${pl.id}, ${"sub_t102_" + Date.now()}, 'active', now() - interval '1 day', now() + interval '20 days')`;

  /* ════ R2 ════ */
  console.log("\n■ R2: edit_element — готовая замена");
  const D1 = await fresh(A);
  {
    const [cat0] = await sql`select * from categories where synthesis_id=${D1} and name ilike 'Индивидуация-как-практика'`;
    ok(/ради/.test(cat0.definition), "до правки определение несёт предлог «ради»");
    const q0 = await usedRegen(A.id), u0 = await usageCount(A.id), t0 = await totals(D1), calls0 = mock.calls;
    const r = await A.api("POST", rec(D1, "/plan"), { nums: ["2"] });
    ok(r.status === 200 && r.json.plan.status === "draft", "POST …/recommendations/plan → 200, черновик", r.json);
    const base = baseSteps(r.json.plan);
    ok(base.length === 1 && base[0].type === "edit_element" && base[0].target === `category:${cat0.id}` && base[0].field === "definition" && base[0].value === REPL2, "план из одного базового шага edit_element «category:id», значение — замена дословно", base);
    ok(r.json.plan.costBreakdown.free.steps === 1 && r.json.plan.costBreakdown.free.costUsd === 0, "стоимость шага 0 — отдельной строкой оценки");
    ok(r.json.planned.length === 1 && r.json.planned[0].status === "planned" && r.json.planned[0].planId === r.json.plan.id, "рекомендация 2 → planned с planId");
    const ex = await A.api("POST", planUrl(D1, r.json.plan.id, "/execute"));
    ok(ex.status === 200, "исполнение — существующим POST /plans/:planId/execute", ex.json);
    const p = await waitPlan(r.json.plan.id, (x) => x.status === "done", "R2 план done");
    const st = p.steps.find((s) => s.type === "edit_element");
    ok(st.status === "done" && st.result.costUsd === 0 && st.result.inputTokens === 0, "шаг done, стоимость 0, токенов 0");
    const [cat1] = await sql`select * from categories where id=${cat0.id}`;
    ok(cat1.definition === REPL2, "определение категории изменено");
    const sec = await A.api("GET", `/syntheses/${D1}/sections/graph`);
    ok(sec.json.section.htmlContent.includes("произведённое в ответ на присутствие"), "таблица категорий в документе перерисована");
    const v = await A.api("GET", `/syntheses/${D1}/elements/category/${cat0.id}/versions`);
    const v0 = v.json.versions[0];
    ok(v0.changeSource === "recommendation" && v0.origin?.num === "2" && v0.origin?.round === 1 && v0.origin?.stepType === "edit_element" && v0.origin?.planId === r.json.plan.id, "версия: источник recommendation, origin — №2, раунд 1, план и шаг («почему»)", v0);
    ok(/ради/.test(String(v0.data.definition)), "снимок версии — прежнее определение («что»)");
    ok((await usedRegen(A.id)) === q0, "квота regenerations НЕ израсходована", [q0, await usedRegen(A.id)]);
    ok((await usageCount(A.id)) === u0 && mock.calls === calls0, "api_usage не прибавилось, модель не звалась");
    const t1 = await totals(D1);
    ok(t1.c === t0.c && t1.i === t0.i, "стоимость документа не тронута");
    ok((await recOf(D1, "2")).status === "done", "рекомендация 2 → done");
  }
  console.log("  — то же человеком БЕЗ источника оплаты (BILLING_ENFORCE=true)");
  await sql`update users set balance_usd = 5 where id=${B.id}`;
  const DB = await fresh(B);
  await sql`update users set balance_usd = 0 where id=${B.id}`;
  {
    const r = await B.api("POST", rec(DB, "/plan"), { nums: ["2"] });
    const ex = await B.api("POST", planUrl(DB, r.json.plan.id, "/execute"));
    ok(r.status === 200 && ex.status === 200, "без ключа, подписки и баланса: бесплатный план ставится и исполняется", [r.status, ex.status, ex.json]);
    await waitPlan(r.json.plan.id, (x) => x.status === "done", "R2/B план done");
    ok((await sql`select definition d from categories where synthesis_id=${DB} and name ilike 'Индивидуация-как-практика'`)[0].d === REPL2, "… и определение изменено");
    const paid = await B.api("POST", rec(DB, "/plan"), { nums: ["4"] });
    const exPaid = await B.api("POST", planUrl(DB, paid.json.plan.id, "/execute"));
    ok(paid.status === 200 && exPaid.status === 403 && exPaid.json.code === "BILLING_REQUIRED", "платный план (refine_element) тем же человеком → 403 BILLING_REQUIRED", exPaid.json);
    const del = await B.api("DELETE", planUrl(DB, paid.json.plan.id));
    ok(del.status === 200 && (await recOf(DB, "4")).status === "new", "удаление плана вернуло рекомендацию 4 в new");
  }

  /* ════ R3 ════ */
  console.log("\n■ R3: refine_element на моке Claude");
  {
    const [th0] = await sql`select t.* from theses t join recommendations r on r.element_id = t.id where r.synthesis_id=${D1} and r.num='4'`;
    ok(!!th0, "рекомендация 4 указывает на тезис Э-3 в БД");
    const q0 = await usedRegen(A.id), u0 = await usageCount(A.id), t0 = await totals(D1);
    mock.refinePrompts = []; mock.refineAnswer = null;
    const r = await A.api("POST", rec(D1, "/plan"), { nums: ["4"] });
    const base = baseSteps(r.json.plan);
    ok(r.status === 200 && base.length === 1 && base[0].type === "refine_element" && base[0].target === `thesis:${th0.id}` && !("value" in base[0]), "рекомендация без замены → один базовый шаг refine_element", base);
    ok(/Операция: развить/.test(base[0].context) && /семантическ/i.test(base[0].context) && /Слепые пятна/.test(base[0].context) && base[0].subsection === "theses:Эпистемологические тезисы", "довод рекомендации (операция, основание, текст из прозы) и подраздел — в шаге");
    ok(r.json.plan.costBreakdown.free.steps === 0 && r.json.plan.estimatedCost > 0, "оценка: шаг платный");
    await A.api("POST", planUrl(D1, r.json.plan.id, "/execute"));
    const p = await waitPlan(r.json.plan.id, (x) => x.status === "done", "R3 план done");
    ok(mock.refinePrompts.length === 1, "модель позвана ровно один раз", mock.refinePrompts.length);
    const pr = mock.refinePrompts[0] ?? "";
    ok(pr.includes(th0.formulation) && pr.includes("Эпистемологические тезисы") && /Операция: развить/.test(pr) && /ПРАВИМОЕ ПОЛЕ: формулировка/.test(pr), "узкий контекст: сам элемент, его подраздел, довод рекомендации");
    ok(!pr.includes("КОНТЕКСТ ИЗ ПРЕДЫДУЩИХ РАЗДЕЛОВ") && !pr.includes("Межфилософский диалог") && pr.length < 20000, "… и ничего сверх: ни контекста разделов, ни чужих подразделов", pr.length);
    const [th1] = await sql`select * from theses where id=${th0.id}`;
    ok(th1.formulation === "Новое значение поля, данное моделью", "новое значение записано (ограда, ёлочки и лишние пробелы сняты)", th1.formulation);
    const v0 = (await A.api("GET", `/syntheses/${D1}/elements/thesis/${th0.id}/versions`)).json.versions[0];
    ok(v0.changeSource === "recommendation" && v0.origin?.num === "4" && v0.origin?.stepType === "refine_element" && v0.data.formulation === th0.formulation, "версия с источником recommendation (№4, refine_element), снимок — прежняя формулировка");
    ok((await usedRegen(A.id)) === q0 + 1, "квота regenerations израсходована: +1", [q0, await usedRegen(A.id)]);
    ok((await usageCount(A.id)) === u0 + 1, "api_usage +1 строка");
    const t1 = await totals(D1);
    ok(Number(t1.c) > Number(t0.c), "стоимость вошла в итог документа");
    const [gl] = await sql`select * from generation_log where synthesis_id=${D1} and source='edit' order by created_at desc limit 1`;
    ok(gl && gl.status === "done" && /по рекомендации 4, раунд 1/.test(gl.section_label) && gl.section_key === "theses", "строка generation_log: source edit, подпись с рекомендацией", gl?.section_label);
    const st = p.steps.find((s) => s.type === "refine_element");
    ok(st.status === "done" && st.result.costUsd > 0 && (await recOf(D1, "4")).status === "done", "шаг done со стоимостью > 0; рекомендация 4 → done");

    console.log("  — негодный ответ модели");
    const rec1 = await recOf(D1, "1");
    const tbl1 = rec1.element_kind === "category" ? "categories" : rec1.element_kind === "thesis" ? "theses" : "glossary_terms";
    const [g0] = await sql`select * from ${sql(tbl1)} where id=${rec1.element_id}`;
    console.log(`  (рекомендация 1: сторож нашёл элемент вида ${rec1.element_kind})`);
    mock.refineAnswer = "   ";
    const r1 = await A.api("POST", rec(D1, "/plan"), { nums: ["1"] });
    if (r1.status !== 200) console.log("  [отладка] план ['1']:", r1.status, J(r1.json).slice(0, 700));
    const w = wsOf(A); await w.open;
    await A.api("POST", planUrl(D1, r1.json.plan.id, "/execute"));
    const pp = await waitPlan(r1.json.plan.id, (x) => x.status === "paused", "R3 пауза плана");
    ok(pp.steps.find((s) => s.type === "refine_element").status === "failed", "пустой ответ модели → шаг failed, план на паузе");
    ok((await sql`select definition d from ${sql(tbl1)} where id=${g0.id}`)[0].d === g0.definition, "… элемент НЕ изменён");
    ok((await recOf(D1, "1")).status === "planned", "… рекомендация ждёт решения человека (planned)");
    const blocked = await A.api("POST", rec(D1, "/plan"), { nums: ["7"] });
    ok(blocked.status === 200 || blocked.status === 409, "постановка другого плана при паузе не падает 500", blocked.status);
    if (blocked.status === 200) await A.api("DELETE", planUrl(D1, blocked.json.plan.id));
    w.send({ type: "resume_plan", synthesisId: D1, planId: r1.json.plan.id, mode: "skip_step" });
    await waitPlan(r1.json.plan.id, (x) => x.status === "done", "R3 skip_step → done");
    ok((await recOf(D1, "1")).status === "rejected", "skip_step человеком → рекомендация 1 rejected");
    mock.refineAnswer = null; w.close();
  }

  /* ════ R4 + R5 ════ */
  console.log("\n■ R4: перевод адресов · R5: каскад сам ставит критику");
  const D2 = await fresh(A);
  {
    const r3 = await A.api("POST", rec(D2, "/plan"), { nums: ["3"] });
    const b3 = baseSteps(r3.json.plan);
    ok(r3.status === 200 && b3.length === 1 && b3[0].type === "regen_subsection" && b3[0].target === "theses:Онтологические тезисы" && b3[0].status === "confirmed", "подраздел без элемента → regen_subsection «theses:Онтологические тезисы»", b3);
    ok(/Операция: добавить/.test(b3[0].context) && /Незакрытые вопросы/.test(b3[0].context), "довод рекомендации — пожеланием шага (текст из прозы)");
    ok(!r3.json.plan.steps.some((s) => s.type === "regen" && s.target === "theses"), "сам раздел theses на перегенерацию не поставлен");
    const c3 = r3.json.plan.steps.filter((s) => s.target === "critique");
    ok(c3.length === 1 && c3[0].type === "regen" && c3[0].cascadeGenerated === true && c3[0].status === "pending", "R5: после шага подраздела шаг critique появился САМ (cascadeGenerated, pending)", r3.json.plan.steps.map((s) => `${s.type}:${s.target}:${s.cascadeGenerated}`));
    ok((await recOf(D2, "3")).step_index === r3.json.plan.steps.indexOf(b3[0]), "recommendations.step_index указывает на свой шаг");
    await A.api("DELETE", planUrl(D2, r3.json.plan.id));

    const r8 = await A.api("POST", rec(D2, "/plan"), { nums: ["8"] });
    const b8 = baseSteps(r8.json.plan);
    ok(r8.status === 200 && b8.length === 1 && b8[0].type === "regen" && b8[0].target === "dialogue" && /Операция: перегенерировать/.test(b8[0].context ?? ""), "«перегенерировать» без элемента → regen раздела dialogue с доводом в контексте", b8);
    ok(b8[0].recommendations?.[0]?.num === "8", "шаг раздела помнит свою рекомендацию");
    const c8 = r8.json.plan.steps.filter((s) => s.target === "critique");
    ok(c8.length === 1 && c8[0].cascadeGenerated === true, "R5: после regen раздела — critique каскадом, один раз");
    await A.api("DELETE", planUrl(D2, r8.json.plan.id));

    const r2 = await A.api("POST", rec(D2, "/plan"), { nums: ["2", "3", "8"] });
    const kinds = r2.json.plan.steps.map((s) => `${s.type}:${s.target.split(":")[0]}:${s.cascadeGenerated ? "c" : "u"}`);
    ok(r2.json.plan.steps[0].type === "edit_element", "в смешанном плане шаг элемента стоит ПЕРВЫМ", kinds);
    const crit = r2.json.plan.steps.filter((s) => s.target === "critique");
    ok(crit.length === 1 && crit[0].cascadeGenerated === true && crit[0].status === "pending", "R5: три разных шага — критика по-прежнему одна и каскадная", kinds);
    ok(r2.json.plan.steps.filter((s) => s.cascadeGenerated).every((s) => s.status === "pending" && !s.recommendations), "каскадные шаги pending и рекомендаций не несут — их решает человек");
    const imp = await A.api("POST", `/syntheses/${D2}/plans/impact`, { regen: ["graph"], remove: [], add: [] });
    ok(imp.json.impact.affectedSections.includes("critique"), "сверка: обычный анализ каскада от graph тоже даёт critique — механизм один");
    await A.api("DELETE", planUrl(D2, r2.json.plan.id));
  }

  /* ════ R6 ════ */
  console.log("\n■ R6: развилка и поштучный выбор");
  {
    const both = await A.api("POST", rec(D2, "/plan"), { nums: ["5а", "5б"] });
    ok(both.status === 400 && both.json.code === "VALIDATION_ERROR" && /исключают друг друга/.test(both.json.error) && both.json.details.fork?.length === 2, "['5а','5б'] → 400 с пояснением", both.json);
    const bare = await A.api("POST", rec(D2, "/plan"), { nums: ["5"] });
    ok(bare.status === 400 && /развилка/.test(bare.json.error) && /5а или 5б/.test(bare.json.error), "['5'] → 400: «назовите вариант» — служба не выбирает за человека", bare.json);
    const none = await A.api("POST", rec(D2, "/plan"), { nums: [] });
    const absent = await A.api("POST", rec(D2, "/plan"), {});
    const all = await A.api("POST", rec(D2, "/plan"), { nums: "all" });
    ok(none.status === 400 && absent.status === 400 && all.status === 400 && /поштучно/.test(none.json.error), "[] / без nums / «all» → 400: входа «исполнить все» нет", [none.status, absent.status, all.status]);
    ok((await sql`select count(*)::int n from edit_plans where synthesis_id=${D2}`)[0].n === 0, "… и ни один отказ плана не создал");
    const del = await A.api("POST", rec(D2, "/plan"), { nums: ["5а"] });
    ok(del.status === 422 && del.json.code === "RECOMMENDATIONS_NOT_PLANNABLE" && del.json.details.declined[0]?.code === "delete_element" && /пустая правка удалением не является/.test(del.json.error), "['5а'] («удалить» с элементом) → 422 с внятной причиной, шага нет", del.json);
    const one = await A.api("POST", rec(D2, "/plan"), { nums: ["5б"] });
    const b = baseSteps(one.json.plan);
    ok(one.status === 200 && b.length === 1 && b[0].type === "refine_element", "['5б'] → план с одним базовым шагом", b);
    const [ra, rb] = [await recOf(D2, "5а"), await recOf(D2, "5б")];
    ok(rb.status === "planned" && ra.status === "new" && ra.plan_id === null, "planned помечен только выбранный вариант", [ra.status, rb.status]);
    const again = await A.api("POST", rec(D2, "/plan"), { nums: ["5б"] });
    ok(again.status === 422 && again.json.details.declined[0]?.code === "already_planned", "повторная постановка той же рекомендации → 422 already_planned");
    await A.api("DELETE", planUrl(D2, one.json.plan.id));
  }

  /* ════ R7 ════ */
  console.log("\n■ R7: раунд");
  const D3 = await fresh(A);
  {
    const r = await A.api("POST", rec(D3, "/plan"), { nums: ["2"] });
    const same = await A.api("POST", rec(D3, "/parse"));
    ok(same.status === 200 && same.json.newRound === false && same.json.rows.find((x) => x.num === "2").status === "planned", "перечитка ТОГО ЖЕ текста при planned проходит, строка остаётся planned");
    // критика сменилась, пока рекомендация стоит в плане
    mock.critiqueVariant = 2;
    const rg = await A.api("POST", `/syntheses/${D3}/regenerate/critique`, {});
    ok(rg.status === 200, "ручная перегенерация критики запущена", rg.json);
    for (let i = 0; i < 150; i++) { const cr = await A.api("GET", `/syntheses/${D3}/sections/critique`); if (cr.json.section.htmlContent.includes("вторая редакция")) break; await sleep(200); }
    for (let i = 0; i < 50; i++) { const pr = await A.api("POST", rec(D3, "/parse")); if (pr.status !== 409 || pr.json.code !== "GENERATION_IN_PROGRESS") break; await sleep(200); }
    const blocked = await A.api("POST", rec(D3, "/parse"));
    ok(blocked.status === 409 && blocked.json.code === "ROUND_IN_PROGRESS" && blocked.json.details.planIds[0] === r.json.plan.id && blocked.json.details.nums.includes("2") && blocked.json.details.round === 1, "при planned новый раунд не открывается: 409 ROUND_IN_PROGRESS (план и номера названы)", blocked.json);
    ok((await A.api("GET", rec(D3))).json.latestRound === 1, "… раунд остался первым");
    const w = wsOf(A); await w.open;
    await A.api("POST", planUrl(D3, r.json.plan.id, "/execute"));
    let p = await waitPlan(r.json.plan.id, (x) => x.status === "done", "R7 план done");
    ok((await recOf(D3, "2", 1)).status === "done", "план исполнен: рекомендация 2 → done");
    // перегенерация критики — каскадным шагом плана, подтверждением человека
    // третья редакция прозы: вернись мок к первой — ключ раунда (хэш прозы) совпал бы с
    // раундом 1, и служба справедливо сочла бы текст прежним
    mock.critiqueVariant = 3;
    const ci = p.steps.findIndex((s) => s.target === "critique" && s.status === "pending");
    ok(ci >= 0, "каскадный шаг critique ждёт подтверждения");
    const q0 = await usedRegen(A.id);
    w.send({ type: "confirm_step", planId: r.json.plan.id, stepIndex: ci });
    p = await waitPlan(r.json.plan.id, (x) => x.steps[ci].status === "done", "R7 confirm_step critique", 60000);
    ok((await usedRegen(A.id)) === q0 + 1, "перегенерация критики — платный шаг: квота +1");
    mock.critiqueVariant = 1;
    await sleep(300);
    const opened = await A.api("POST", rec(D3, "/parse"));
    ok(opened.status === 200 && opened.json.newRound === true && opened.json.round === 2, "после исполнения и перегенерации критики parse открывает round+1", opened.json && { s: opened.status, r: opened.json.round, n: opened.json.newRound, e: opened.json.error });
    ok(opened.json.rows.every((x) => x.status === "new" || x.status === "invalid") && opened.json.rows.every((x) => x.planId === null), "статусы прошлого раунда не наследуются: строки раунда 2 — new");
    const old = await A.api("GET", rec(D3, "?round=1"));
    ok(old.json.rows.find((x) => x.num === "2").status === "done" && old.json.latestRound === 2, "раунд 1 цел: рекомендация 2 в нём done; номер раунда виден (latestRound = 2)");
    ok((await sql`select count(*)::int n from edit_plans where synthesis_id=${D3} and status='draft'`)[0].n === 0, "следующий раунд сам ничего не поставил в план (автоматики нет)");
    w.close();
  }

  /* ════ R8 ════ */
  console.log("\n■ R8: статусы");
  const D4 = await fresh(A);
  {
    const r = await A.api("POST", rec(D4, "/plan"), { nums: ["2", "6"] });
    const i6 = r.json.plan.steps.findIndex((s) => s.recommendations?.[0]?.num === "6");
    const upd = await A.api("PATCH", planUrl(D4, r.json.plan.id), { steps: [{ index: i6, status: "skipped" }] });
    const k6 = upd.json.plan.steps.find((s) => s.recommendations?.[0]?.num === "6");
    ok(upd.status === 200 && k6?.status === "skipped" && k6.value === REPL6 && k6.field === "definition", "PATCH в панели каскада: шаг edit_element пережил пересборку плана и снят", upd.json?.plan?.steps?.map((s) => `${s.type}:${s.status}`));
    ok((await recOf(D4, "6")).status === "rejected" && (await recOf(D4, "2")).status === "planned", "пропущенный в панели → rejected; сосед остался planned");
    ok(upd.json.plan.costBreakdown.free.steps === 1, "снятый шаг из оценки ушёл");
    await A.api("POST", planUrl(D4, r.json.plan.id, "/execute"));
    await waitPlan(r.json.plan.id, (x) => x.status === "done", "R8 план done");
    ok((await recOf(D4, "2")).status === "done" && (await recOf(D4, "6")).status === "rejected", "исполненный шаг → done; отклонённая осталась rejected");
    ok((await sql`select definition d from glossary_terms where synthesis_id=${D4} and term ilike 'Архетипический разлом%'`)[0].d !== REPL6, "… и снятая замена в документ не попала");
    const r9 = await recOf(D4, "9");
    ok(r9.status === "invalid" && /Несуществующий подраздел/.test(r9.invalid_reason), "отклонённая сторожем строка — invalid с причиной", r9.invalid_reason);
    const p9 = await A.api("POST", rec(D4, "/plan"), { nums: ["9"] });
    ok(p9.status === 422 && p9.json.details.invalid[0]?.num === "9" && (await recOf(D4, "9")).status === "invalid", "… в план не берётся (422) и остаётся invalid", p9.json);
    const mix = await A.api("POST", rec(D4, "/plan"), { nums: ["9", "7"] });
    ok(mix.status === 200 && mix.json.invalid.length === 1 && mix.json.planned.length === 1 && baseSteps(mix.json.plan).length === 1, "вместе с годной: годная в плане, invalid назван в ответе");
    const again = await A.api("POST", rec(D4, "/plan"), { nums: ["6"] });
    ok(again.status === 200 && (await recOf(D4, "6")).status === "planned", "отклонённую человек вправе поставить снова (rejected → planned)");
    await A.api("DELETE", planUrl(D4, mix.json.plan.id)); await A.api("DELETE", planUrl(D4, again.json.plan.id));
  }

  /* ════ R9 ════ */
  console.log("\n■ R9: оценка");
  const D5 = await fresh(A);
  {
    const r = await A.api("POST", rec(D5, "/plan"), { nums: ["2", "6", "4"] });
    const b = baseSteps(r.json.plan);
    ok(r.status === 200 && b.filter((s) => s.type === "edit_element").length === 2 && b.filter((s) => s.type === "refine_element").length === 1, "план: два edit_element и один refine_element", b.map((s) => s.type));
    ok(b[0].type === "edit_element" && b[1].type === "edit_element" && b[2].type === "refine_element", "бесплатные шаги стоят раньше платного");
    const cb = r.json.plan.costBreakdown;
    ok(cb.free.steps === 2 && cb.free.costUsd === 0, "нулевая стоимость двух edit_element — ОТДЕЛЬНОЙ строкой", cb);
    ok(cb.paid.steps >= 1 && cb.paid.costUsd === r.json.plan.estimatedCost && cb.paid.costUsd > 0, "платное — своей строкой и равно estimatedCost", cb);
    const casc = r.json.plan.steps.filter((s) => s.cascadeGenerated).map((s) => s.index);
    const skipAll = r.json.plan.steps.map((s, index) => ({ s, index })).filter((x) => x.s.cascadeGenerated).map((x) => ({ index: x.index, status: "skipped" }));
    const only = await A.api("PATCH", planUrl(D5, r.json.plan.id), { steps: skipAll });
    const cb2 = only.json.plan.costBreakdown;
    ok(cb2.paid.steps === 1 && cb2.paid.costUsd > 0 && cb2.paid.costUsd < 0.05 && cb2.free.steps === 2, "без каскада: платный шаг один — точечная правка стоит центы, не цену раздела", cb2);
    const g = await A.api("GET", planUrl(D5, r.json.plan.id));
    ok(J(g.json.plan.costBreakdown) === J(cb2), "GET плана отдаёт ту же разбивку");
    void casc;
    await A.api("DELETE", planUrl(D5, r.json.plan.id));
  }

  /* ════ R10 ════ */
  console.log("\n■ R10: устаревание после ручной правки (9.2)");
  {
    const sub = encodeURIComponent("Новизна и ценность");
    const src = await A.api("GET", `/syntheses/${D5}/sections/sum/subsections/${sub}`);
    const pt = await A.api("PATCH", `/syntheses/${D5}/sections/sum/subsections/${sub}`, { html: src.json.html + "\n<p>Абзац, дописанный человеком после разбора рекомендаций.</p>" });
    ok(src.status === 200 && pt.status === 200 && pt.json.changed === true, "подраздел-адресат рекомендации 7 поправлен вручную (9.2)", pt.json?.error);
    const st = await A.api("POST", rec(D5, "/plan"), { nums: ["7"] });
    ok(st.status === 422 && st.json.code === "RECOMMENDATIONS_NOT_PLANNABLE" && st.json.details.stale[0]?.num === "7" && /Перечитайте рекомендации/.test(st.json.error) && /parse/.test(st.json.error), "сборка плана даёт stale по этой строке с предложением перечитать", st.json);
    ok((await recOf(D5, "7")).status === "stale", "статус в БД — stale («текст изменился»), не invalid («адрес не найден»)");
    const mix = await A.api("POST", rec(D5, "/plan"), { nums: ["7", "2"] });
    ok(mix.status === 200 && mix.json.stale.length === 1 && mix.json.planned.length === 1 && /Перечитайте/.test(mix.json.hint) && !mix.json.plan.steps.some((s) => s.target.startsWith("sum:")), "в смешанном выборе: устаревшая в план НЕ взята, годная — взята, подсказка в ответе");
    await A.api("DELETE", planUrl(D5, mix.json.plan.id));
    const re = await A.api("POST", rec(D5, "/parse"));
    ok(re.status === 200 && re.json.newRound === false && re.json.rows.find((x) => x.num === "7").status === "new", "после перечитывания строка снова new, раунд прежний");
    const okp = await A.api("POST", rec(D5, "/plan"), { nums: ["7"] });
    ok(okp.status === 200 && baseSteps(okp.json.plan)[0].target === "sum:Новизна и ценность", "… и снова годна: план ставится");
    await A.api("DELETE", planUrl(D5, okp.json.plan.id));
    // сосед по элементу: исполнение одной рекомендации старит другую о том же элементе
    const hand = await A.api("PATCH", `/syntheses/${D5}/glossary/${(await recOf(D5, "6")).element_id}`, { definition: "правка рукой после разбора" });
    const s6 = await A.api("POST", rec(D5, "/plan"), { nums: ["6"] });
    ok(hand.status === 200 && s6.status === 422 && s6.json.details.stale[0]?.num === "6", "ручная правка ЭЛЕМЕНТА (5.1) старит рекомендацию о нём так же");
    ok((await recOf(D5, "1")).status === "new" && (await A.api("POST", rec(D5, "/plan"), { nums: ["1"] })).status === 200, "… а соседа по той же «Таблице определений» — нет (хэш по элементу, не по подразделу)");
  }

  /* ════ R11 ════ */
  console.log("\n■ R11: края");
  {
    const D6 = await fresh(A);
    const r5 = await recOf(D6, "5б");
    await sql`delete from categories where id=${r5.element_id}`;
    const gone = await A.api("POST", rec(D6, "/plan"), { nums: ["5б"] });
    const after = await recOf(D6, "5б");
    ok(gone.status === 422 && gone.json.details.invalid[0]?.num === "5б" && after.status === "invalid" && /удалён из концепции после разбора/.test(after.invalid_reason), "элемент удалён между разбором и постановкой → шаг не создан, строка invalid с причиной", [gone.json, after.invalid_reason]);
    ok((await sql`select count(*)::int n from edit_plans where synthesis_id=${D6}`)[0].n === 0, "… план не создан");
    const foreign = await C.api("POST", rec(D6, "/plan"), { nums: ["2"] });
    ok(foreign.status === 403, "чужой синтез → 403", foreign.status);
    const anon = await client("").api("POST", rec(D6, "/plan"), { nums: ["2"] });
    ok(anon.status === 401, "без сессии → 401", anon.status);
    ok((await A.api("POST", "/syntheses/not-a-uuid/recommendations/plan", { nums: ["2"] })).status === 404, "не-UUID → 404");
    // генерация идёт → 409
    mock.slow = true;
    const slow = A.api("POST", rec(D6, "/extract"));
    await sleep(800);
    const busy = await A.api("POST", rec(D6, "/plan"), { nums: ["2"] });
    const slowRes = await slow; mock.slow = false;
    ok(busy.status === 409 && busy.json.code === "GENERATION_IN_PROGRESS" && slowRes.status === 200, "генерация идёт → 409 GENERATION_IN_PROGRESS", [busy.status, busy.json, slowRes.status]);
    // раунда нет
    const fd = new FormData(); fd.append("file", new Blob([readFileSync(FILE, "utf8")], { type: "text/html" }), "live.html");
    const bare = (await A.api("POST", "/syntheses/import", fd)).json.id; ids.push(bare);
    const nr = await A.api("POST", rec(bare, "/plan"), { nums: ["2"] });
    ok(nr.status === 404 && nr.json.details?.reason === "no_round", "рекомендации ещё не разобраны → 404 no_round с подсказкой", nr.json);
    // ручной план с шагом элемента через общий POST /plans: чужое «почему» приписать нельзя
    const [cat] = await sql`select id from categories where synthesis_id=${D6} limit 1`;
    const manual = await A.api("POST", `/syntheses/${D6}/plans`, { regen: [], remove: [], add: [], elementEdits: [{ kind: "category", elementId: cat.id, value: "текст от человека", recommendations: [{ id: r5.id, round: 1, num: "5б", op: "x", rationale: "y" }] }] });
    ok(manual.status === 200 && baseSteps(manual.json.plan)[0].type === "edit_element" && !baseSteps(manual.json.plan)[0].recommendations, "общий POST /plans принимает шаг элемента, но снимок рекомендации из тела клиента отбрасывает");
    const empty = await A.api("POST", `/syntheses/${D6}/plans`, { regen: [], remove: [], add: [], elementEdits: [{ kind: "category", elementId: cat.id, value: "   " }] });
    ok(empty.status === 400 && /пустая правка/.test(J(empty.json.details)), "edit_element с пустым значением → 400: удаление — не пустая правка", empty.json);
    await A.api("DELETE", planUrl(D6, manual.json.plan.id));
  }
  console.log(`\nмок Claude: обращений ${mock.calls}; точечных правок ${mock.picked.filter((x) => x === "(refine)").length}`);
} catch (e) { failed++; console.log("СБОЙ:", e?.stack ?? e); }
finally {
  for (const id of ids) await sql`delete from syntheses where id=${id}`.catch(() => {});
  await sql`delete from user_subscriptions where user_id in (select id from users where email like 't102-%@example.com')`.catch(() => {});
  await sql`delete from subscription_plans where name like 't102plan%'`.catch(() => {});
  await sql`delete from edit_plans where user_id in (select id from users where email like 't102-%@example.com')`.catch(() => {});
  await sql`delete from api_usage where user_id in (select id from users where email like 't102-%@example.com')`.catch(() => {});
  await sql`delete from transactions where user_id in (select id from users where email like 't102-%@example.com')`.catch(() => {});
  await sql`delete from users where email like 't102-%@example.com'`.catch((e) => console.log("уборка users:", e?.code ?? e));
  try { if (srv) process.kill(-srv.pid, "SIGKILL"); } catch {}
  for (const r of mock.hanging) try { r.destroy(); } catch {}
  mockSrv.closeAllConnections?.(); mockSrv.close();
  await Promise.race([sql.end({ timeout: 2 }), sleep(3000)]);
}
console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗`);
process.exit(failed ? 1 : 0);
