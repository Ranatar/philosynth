/**
 * Тестовые запросы 2–6 беседы 5.3 (Extended Characteristics + Enrichment
 * Service, бэкенд) одним заходом:
 *  R2  enrichCategory: POST /enrich/category/:catId {type:"description"} →
 *      стриминг через WS (enrichment_delta → enrichment_done с
 *      enrichmentId/content) → строка element_enrichments; промпт из
 *      Registry несёт категорию, контекст синтеза и связи; SYS(mode);
 *      второй запуск при активной операции → 409 GENERATION_IN_PROGRESS.
 *  R3  justifyCharacteristic: centrality=0.9 для «Бытие» → три data-section
 *      ответа разложены в justification / limitations /
 *      alternative_approaches; enrichment_done(type 'characteristic').
 *  R4  getEnrichments: после 2 обогащений одной категории (description,
 *      evolution) → 2 записи разных типов, новые первыми; фильтр
 *      ?elementType; доступ чтения (чужой 403 / публичный 200).
 *  R5  стоимость: input_tokens/output_tokens/cost_usd в строках и в WS;
 *      total_cost_usd синтеза НЕ растёт (01 §4.9); api_usage без строк
 *      (рекордер no-op до 6.1).
 *  R6  edge cases: несуществующая категория / не-UUID → 404; чужой → 403;
 *      value вне диапазона характеристики → 400 (1.2 у centrality, 3.5 у
 *      innovation_degree, характеристика не того типа, чужой тип
 *      обогащения).
 *  + WS start_enrichment (связь, edge.justification; чужой синтез →
 *    stream_error FORBIDDEN) и HTTP-смоук routes/taxonomy §2.13.
 *
 * Стенд: PG16 + Redis, миграции, три сида (в т.ч. 6 шаблонов
 * enrichment.*). Живой сервер с ANTHROPIC_BASE_URL → мок Claude (SSE) на
 * 127.0.0.1:3853, запись промптов для проверок. Фикстура графа — как в
 * test-51 (HTML «как от Claude», гранулярные таблицы теми же парсерами 1.4).
 * Запуск: node_modules/.bin/tsx tests/test-53-requests2-6.mjs
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

process.env.DATABASE_URL ??=
  "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.REDIS_URL ??= "redis://localhost:6379";

const SERVER_PORT = 3153;
const MOCK_PORT = 3853;
const BASE = `http://127.0.0.1:${SERVER_PORT}/api/v1`;

let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
const J = (x) => JSON.stringify(x);

const { db, closeDb } = await import("../server/db/index.js");
const schema = await import("../server/db/schema.js");
const { closeRedis } = await import("../server/redis.js");
const { saveGraphToDb, parseGraphFromHTML } = await import("../server/services/graph-parser.js");
const { and, asc, eq } = await import("drizzle-orm");
const {
  syntheses, synthesisLineage, sections, categories, categoryEdges,
  elementEnrichments, characteristicJustifications, apiUsage,
  categoryTypeCatalog, relationshipTypeCatalog,
} = schema;

/* ══ Мок Claude API (SSE) ═════════════════════════════════════════════ */

const mock = { calls: [] }; // { system, prompt }
const CHUNK = 60, CHUNK_DELAY_MS = 25;
function enrichmentAnswer(prompt) {
  const m = prompt.match(/КАТЕГОРИЯ: «([^»]+)»/) ?? prompt.match(/СВЯЗЬ: «([^»]+)» → «([^»]+)»/);
  const who = m ? m.slice(1).join(" → ") : "элемент";
  return `<div class="enrichment-result"><h5>Развёрнутое описание</h5><p>Категория <strong>${who}</strong> схватывает основание концепции.</p>` +
    `<h5>Альтернативные трактовки</h5><ul><li>Первая</li><li>Вторая</li><li>Третья</li></ul>` +
    `<h5>Исторические аналоги</h5><p>Парменид, Гегель, Хайдеггер.</p></div>`;
}
function justificationAnswer() {
  return `<div data-section="Основания"><h4>Основания</h4><p>Оценка обоснована центральным положением в графе: <strong>три</strong> связи.</p></div>` +
    `<div data-section="Ограничения"><h4>Ограничения</h4><ul><li>Не учтена генеалогия.</li></ul></div>` +
    `<div data-section="Альтернативные подходы"><h4>Альтернативные подходы</h4><p>По PageRank оценка дала бы 0.7.</p></div>`;
}
function startMock() {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      let prompt = "", system = "";
      try { const b = JSON.parse(body); prompt = b.messages?.[0]?.content ?? ""; system = b.system ?? ""; } catch {}
      mock.calls.push({ system, prompt, apiKey: req.headers["x-api-key"] });
      const html = /Обоснование числовой характеристики|ЭЛЕМЕНТ: /.test(prompt) ? justificationAnswer() : enrichmentAnswer(prompt);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (o) => res.write(`data: ${J(o)}\n\n`);
      send({ type: "message_start", message: { usage: { input_tokens: Math.ceil(prompt.length / 4) } } });
      for (let i = 0; i < html.length; i += CHUNK) {
        send({ type: "content_block_delta", delta: { type: "text_delta", text: html.slice(i, i + CHUNK) } });
        await sleep(CHUNK_DELAY_MS);
      }
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: Math.ceil(html.length / 4) } });
      send({ type: "message_stop" });
      res.end();
    });
  });
  return new Promise((r) => srv.listen(MOCK_PORT, "127.0.0.1", () => r(srv)));
}

/* ══ Фикстура графа (как test-51) ═════════════════════════════════════ */

const secWrap = (num, title, inner) =>
  `<div class="doc-section"><div class="section-num">§ ${num}</div><div class="section-title">${title}</div><div class="doc-content">${inner}</div></div>`;
const sub = (name, inner) => `<div data-section="${name}"><h4>${name}</h4>${inner}</div>`;
const tbl = (heads, rows) =>
  `<table class="doc-table"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const GRAPH_HTML = secWrap(2, "Граф категорий",
  sub("Таблица категорий", tbl(["Категория", "Тип", "Определение", "Центральность", "Определённость", "Происхождение"], [
    ["Бытие", "онтологическая", "То, что есть", "0.9", "0.8", "Парменид"],
    ["Становление", "метафизическая", "Переход", "0.7", "0.6", "Гераклит"],
  ])) +
  sub("Таблица связей", tbl(["Источник", "Описание связи", "Цель", "Тип", "Направление", "Сила"], [
    ["Бытие", "порождает", "Становление", "диалектическая", "однонаправленная", "0.8"],
  ])) +
  sub("Топология графа", "<p>Кластер «Онтологическое ядро».</p>") +
  sub("Топологическая таблица", tbl(["Категория", "Кластер", "Структурные роли", "Процессуальные роли", "Рефлексивная связь"], [
    ["Бытие", "Онтологическое ядро", "центральная, ядро", "тезис", ""],
    ["Становление", "Онтологическое ядро", "мост", "антитезис", ""],
  ])));

/* ══ Сервер ═══════════════════════════════════════════════════════════ */

const mockSrv = await startMock();
const server = spawn("node_modules/.bin/tsx", ["server/index.ts"], {
  cwd: process.cwd(),
  env: {
    ...process.env, PORT: String(SERVER_PORT), RATE_LIMIT_HTTP_PER_MINUTE: "100000",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-53",
  },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true, // грабля 5.1: tsx — обёртка, гасим группу
});
const killServer = () => { try { process.kill(-server.pid, "SIGKILL"); } catch {} try { server.kill("SIGKILL"); } catch {} };
let srvLog = "";
server.stdout.on("data", (d) => (srvLog += d));
server.stderr.on("data", (d) => (srvLog += d));

try {
  let up = false;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try { if ((await fetch(`${BASE}/health`)).ok) { up = true; break; } } catch {}
  }
  ok(up, "сервер поднялся");
  if (!up) throw new Error("сервер не поднялся: " + srvLog.slice(-800));

  async function makeSession(tag) {
    const email = `t53-${tag}-${Date.now()}@x.ru`, pw = "секрет-53-длинный";
    const reg = await (await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: pw }) })).json();
    const login = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: pw }) });
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    return { userId: reg.user.id, token: cookie.split("=")[1], auth: { Cookie: cookie, "Content-Type": "application/json" } };
  }
  const owner = await makeSession("owner"), stranger = await makeSession("stranger");
  ok(!!owner.userId && !!owner.token, "владелец и чужой залогинены");
  const api = async (method, path, body, who = owner) => {
    const r = await fetch(`${BASE}${path}`, { method, headers: who.auth, body: body === undefined ? undefined : J(body) });
    let json = null; try { json = await r.json(); } catch {}
    return { status: r.status, json };
  };

  /* WS-клиент владельца */
  function wsConnect(token) {
    const ws = new WebSocket(`ws://127.0.0.1:${SERVER_PORT}/ws?token=${token}`);
    const messages = [], waiters = [];
    ws.addEventListener("message", (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      messages.push(m);
      for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); clearTimeout(w.t); w.resolve(m); }
    });
    const openP = new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", () => rej(new Error("ws error")), { once: true }); });
    return {
      ws, messages, open: () => openP, close: () => ws.close(),
      send: (m) => ws.send(J(m)),
      waitFor(pred, timeoutMs, label) {
        const hit = messages.find(pred); if (hit) return Promise.resolve(hit);
        return new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error(`timeout: ${label}; получено: ${messages.map((m) => m.type).join(",")}`)), timeoutMs);
          waiters.push({ pred, t, resolve });
        });
      },
    };
  }
  const wsO = wsConnect(owner.token); await wsO.open();
  const wsS = wsConnect(stranger.token); await wsS.open();
  ok(true, "WS владельца и чужого открыты");

  /* Синтез + граф */
  const [synth] = await db.insert(syntheses).values({
    userId: owner.userId, seed: "тестовое зерно 5.3", sectionOrder: ["sum", "graph"], status: "ready",
    method: "dialectical", synthLevel: "transformative", title: "Синтез 5.3",
  }).returning();
  const sid = synth.id;
  await db.insert(synthesisLineage).values(["Парменид", "Гераклит"].map((name, i) => ({ synthesisId: sid, parentType: "philosopher", parentName: name, position: i })));
  await db.insert(sections).values([{ synthesisId: sid, key: "graph", sectionNum: 2, title: "Граф категорий", htmlContent: GRAPH_HTML }]);
  const g = await saveGraphToDb(sid, parseGraphFromHTML(GRAPH_HTML));
  ok(g.categoriesInserted === 2 && g.edgesInserted === 1, "фикстура: граф 2/1", J(g));
  const cats = await db.select().from(categories).where(eq(categories.synthesisId, sid)).orderBy(asc(categories.position));
  const bytie = cats.find((c) => c.name === "Бытие");
  const [edge] = await db.select().from(categoryEdges).where(eq(categoryEdges.synthesisId, sid));
  ok(!!bytie && !!edge, "фикстура: «Бытие» и связь");
  const costOf = (u) => u.inputTokens * 3 / 1e6 + u.outputTokens * 15 / 1e6;

  /* ══ R2 ═══════════════════════════════════════════════════════════════ */
  console.log("\nR2. enrichCategory description → WS → element_enrichments");
  const callsBefore = mock.calls.length;
  const r2 = await api("POST", `/syntheses/${sid}/enrich/category/${bytie.id}`, { type: "description" });
  ok(r2.status === 200 && r2.json?.ok === true, "POST → 200 { ok: true }", `${r2.status} ${J(r2.json)}`);
  // Идемпотентность при активной операции (п.5 03 §3.1): слот занят синхронно
  const r2b = await api("POST", `/syntheses/${sid}/enrich/category/${bytie.id}`, { type: "evolution" });
  ok(r2b.status === 409 && r2b.json?.code === "GENERATION_IN_PROGRESS", "повторный POST при активном обогащении → 409 GENERATION_IN_PROGRESS", `${r2b.status} ${J(r2b.json)}`);
  const done2 = await wsO.waitFor((m) => m.type === "enrichment_done" && m.elementId === bytie.id, 20000, "enrichment_done");
  const deltas2 = wsO.messages.filter((m) => m.type === "enrichment_delta" && m.elementId === bytie.id);
  ok(deltas2.length >= 3, `enrichment_delta: ≥3 дельт (${deltas2.length})`);
  ok(deltas2.every((d) => d.synthesisId === sid && typeof d.delta === "string" && typeof d.totalChars === "number"), "дельты: synthesisId/delta/totalChars");
  ok(deltas2.map((d) => d.delta).join("") === done2.content, "склейка дельт === content финала");
  ok(done2.enrichmentType === "description" && typeof done2.enrichmentId === "string" && done2.content.includes('class="enrichment-result"'), "enrichment_done: type/enrichmentId/content", J({ t: done2.enrichmentType, id: done2.enrichmentId }));
  ok(done2.content.includes("<strong>Бытие</strong>"), "ответ мока построен по категории из промпта («Бытие»)");
  const rows2 = await db.select().from(elementEnrichments).where(eq(elementEnrichments.elementId, bytie.id));
  ok(rows2.length === 1 && rows2[0].id === done2.enrichmentId, "element_enrichments: 1 строка, id = enrichmentId");
  ok(rows2[0].synthesisId === sid && rows2[0].elementType === "category" && rows2[0].enrichmentType === "description" && rows2[0].promptKey === "enrichment.category.description" && rows2[0].content === done2.content, "строка: synthesis_id/element_type/enrichment_type/prompt_key/content", J({ ...rows2[0], content: rows2[0].content.slice(0, 40) }));
  ok(rows2[0].metadata?.elementName === "Бытие", "metadata.elementName");
  const call2 = mock.calls[callsBefore];
  ok(mock.calls.length === callsBefore + 1 && !!call2, "мок: ровно один вызов Claude");
  ok(call2.apiKey === "mock-key-53", "ключ из env ушёл в x-api-key (BYO — 6.1)");
  ok(call2.prompt.includes("КАТЕГОРИЯ: «Бытие»") && call2.prompt.includes("Тип: онтологическая") && call2.prompt.includes("То, что есть") && call2.prompt.includes("Парменид"), "промпт: категория из БД (имя/тип/определение/происхождение)");
  ok(call2.prompt.includes("Зерно: тестовое зерно 5.3") && call2.prompt.includes("Метод синтеза: Диалектический; уровень: Преобразующий") && call2.prompt.includes("Участники синтеза: Парменид, Гераклит"), "промпт: контекст синтеза (зерно/метод/уровень/философы)");
  ok(call2.prompt.includes("«Бытие» → «Становление» (диалектическая): порождает"), "промпт: связи категории из графа");
  ok(call2.prompt.includes("центральная") && call2.prompt.includes("ядро") && call2.prompt.includes("центральность 0.9"), "промпт: роли (русские метки) и метрики");
  ok(!/\{\{[\w.-]+\}\}/.test(call2.prompt), "промпт без незакрытых плейсхолдеров");
  ok(call2.system.includes("Формат итогового HTML-ответа задан в инструкциях ниже") && call2.system.includes("Парменид"), "SYS = buildSYS(outputMode mode) с философами");

  /* ══ R3 ═══════════════════════════════════════════════════════════════ */
  console.log("\nR3. justifyCharacteristic centrality=0.9 для «Бытие»");
  const r3 = await api("POST", `/syntheses/${sid}/justify-characteristic`, { elementId: bytie.id, elementType: "category", characteristic: "centrality", value: 0.9 });
  ok(r3.status === 200 && r3.json?.ok === true, "POST → 200 { ok: true }", `${r3.status} ${J(r3.json)}`);
  const done3 = await wsO.waitFor((m) => m.type === "enrichment_done" && m.enrichmentType === "characteristic", 20000, "enrichment_done characteristic");
  ok(done3.elementId === bytie.id && typeof done3.enrichmentId === "string", "enrichment_done type 'characteristic', enrichmentId = id обоснования");
  const just = await db.select().from(characteristicJustifications).where(eq(characteristicJustifications.elementId, bytie.id));
  ok(just.length === 1 && just[0].id === done3.enrichmentId, "characteristic_justifications: 1 строка, id совпал");
  const j = just[0];
  ok(j.synthesisId === sid && j.elementType === "category" && j.characteristic === "centrality" && Math.abs(j.value - 0.9) < 1e-6, "строка: synthesis_id/element_type/characteristic/value");
  ok(!j.justification.includes("<") && !j.justification.startsWith("Основания") && j.justification.includes("центральным положением") && j.justification.includes("три связи"), "justification — текст секции «Основания» без h4 и тегов", j.justification);
  ok(j.limitations === "Не учтена генеалогия.", "limitations — секция «Ограничения»", j.limitations);
  ok(j.alternativeApproaches === "По PageRank оценка дала бы 0.7.", "alternative_approaches — секция «Альтернативные подходы»", j.alternativeApproaches);
  const call3 = mock.calls.at(-1);
  ok(call3.prompt.includes("характеристику «центральность» (centrality) = 0.9") && call3.prompt.includes("допустимый диапазон от 0 до 1") && call3.prompt.includes("текущее значение в документе — 0.9"), "промпт обоснования: подпись/ключ/значение/диапазон/текущее");
  ok(call3.prompt.includes('data-section="Основания"') && call3.prompt.includes('data-section="Ограничения"') && call3.prompt.includes('data-section="Альтернативные подходы"'), "промпт требует три data-section");
  ok(call3.prompt.includes("ЭЛЕМЕНТ: категория «Бытие»") && call3.prompt.includes("«Бытие» → «Становление»"), "промпт: элемент с определением и связями");

  /* ══ R4 ═══════════════════════════════════════════════════════════════ */
  console.log("\nR4. getEnrichments после двух обогащений");
  const r4a = await api("POST", `/syntheses/${sid}/enrich/category/${bytie.id}`, { type: "evolution" });
  ok(r4a.status === 200, "второе обогащение (evolution) → 200");
  const done4 = await wsO.waitFor((m) => m.type === "enrichment_done" && m.enrichmentType === "evolution", 20000, "enrichment_done evolution");
  ok(mock.calls.at(-1).prompt.includes("Векторы давления"), "промпт evolution — из своего шаблона");
  const r4 = await api("GET", `/syntheses/${sid}/enrichments/${bytie.id}`);
  ok(r4.status === 200 && r4.json?.enrichments?.length === 2, "GET → 2 записи", `${r4.status} ${J(r4.json)?.slice(0, 200)}`);
  const types = r4.json.enrichments.map((e) => e.enrichmentType);
  ok(J(types) === J(["evolution", "description"]), "разные типы, новые первыми", J(types));
  ok(r4.json.enrichments[0].id === done4.enrichmentId && r4.json.enrichments.every((e) => typeof e.costUsd === "number" && e.promptKey.startsWith("enrichment.category.")), "DTO: id/costUsd(number)/promptKey");
  const r4f = await api("GET", `/syntheses/${sid}/enrichments/${bytie.id}?elementType=edge`);
  ok(r4f.status === 200 && r4f.json.enrichments.length === 0, "?elementType=edge — фильтр отсекает записи категории");
  const r4j = await api("GET", `/syntheses/${sid}/justifications/${bytie.id}`);
  ok(r4j.status === 200 && r4j.json.justifications.length === 1 && r4j.json.justifications[0].characteristic === "centrality" && r4j.json.justifications[0].limitations === "Не учтена генеалогия.", "GET /justifications → 1 обоснование с колонками");
  const r4s = await api("GET", `/syntheses/${sid}/enrichments/${bytie.id}`, undefined, stranger);
  ok(r4s.status === 403, "чужой непубличный → 403");
  await db.update(syntheses).set({ isPublic: true }).where(eq(syntheses.id, sid));
  const r4p = await api("GET", `/syntheses/${sid}/enrichments/${bytie.id}`, undefined, stranger);
  ok(r4p.status === 200 && r4p.json.enrichments.length === 2, "публичный → чужой читает историю");
  await db.update(syntheses).set({ isPublic: false }).where(eq(syntheses.id, sid));

  /* ══ R5 ═══════════════════════════════════════════════════════════════ */
  console.log("\nR5. Стоимость");
  const e5 = (await db.select().from(elementEnrichments).where(eq(elementEnrichments.id, done2.enrichmentId)))[0];
  ok(e5.inputTokens > 0 && e5.outputTokens > 0, `input_tokens=${e5.inputTokens}, output_tokens=${e5.outputTokens} > 0`);
  ok(Math.abs(Number(e5.costUsd) - costOf(e5)) < 1e-6, "cost_usd = in·$3/M + out·$15/M", `${e5.costUsd} vs ${costOf(e5)}`);
  ok(e5.inputTokens === Math.ceil(call2.prompt.length / 4), "input_tokens — как отдал мок (usage из message_start)");
  ok(done2.usage.inputTokens === e5.inputTokens && done2.usage.outputTokens === e5.outputTokens && Math.abs(done2.usage.costUsd - Number(e5.costUsd)) < 1e-6, "WS usage === строке");
  ok(j.inputTokens > 0 && Math.abs(Number(j.costUsd) - costOf(j)) < 1e-6, "обоснование характеристики тоже несёт токены и cost_usd");
  const [s5] = await db.select({ c: syntheses.totalCostUsd, i: syntheses.totalInputTokens }).from(syntheses).where(eq(syntheses.id, sid));
  ok(Number(s5.c) === 0 && s5.i === 0, "syntheses.total_cost_usd/total_input_tokens не выросли (01 §4.9)", J(s5));
  const usageRows = await db.select().from(apiUsage).where(eq(apiUsage.userId, owner.userId));
  ok(usageRows.length === 0, "api_usage пуст: рекордер no-op до 6.1 (долг §12)");

  /* ══ WS start_enrichment (связь) ═════════════════════════════════════ */
  console.log("\nWS. start_enrichment для связи + чужой синтез");
  wsO.send({ type: "start_enrichment", synthesisId: sid, elementType: "edge", elementId: edge.id, enrichmentType: "justification" });
  const doneE = await wsO.waitFor((m) => m.type === "enrichment_done" && m.elementId === edge.id, 20000, "enrichment_done edge");
  ok(doneE.enrichmentType === "justification" && doneE.content.includes("Бытие → Становление"), "связь: enrichment_done, ответ по «Бытие → Становление»");
  const callE = mock.calls.at(-1);
  ok(callE.prompt.includes("СВЯЗЬ: «Бытие» → «Становление»") && callE.prompt.includes("Тип связи: диалектическая; направленность: однонаправленная") && callE.prompt.includes("Категория-источник «Бытие»: То, что есть") && callE.prompt.includes("сила 0.8"), "промпт связи: концы, тип, направленность, определения, метрики");
  const rowsE = await db.select().from(elementEnrichments).where(eq(elementEnrichments.elementId, edge.id));
  ok(rowsE.length === 1 && rowsE[0].elementType === "edge" && rowsE[0].promptKey === "enrichment.edge.justification" && rowsE[0].metadata?.elementName === "Бытие → Становление", "строка связи: element_type/prompt_key/metadata");
  wsO.send({ type: "start_enrichment", synthesisId: sid, elementType: "edge", elementId: edge.id, enrichmentType: "description" });
  const errE = await wsO.waitFor((m) => m.type === "stream_error" && m.sectionKey === `enrich:edge:${edge.id}`, 10000, "stream_error чужой тип");
  ok(/Неизвестный тип обогащения связи/.test(errE.error), "WS: неизвестный тип для связи → stream_error", errE.error);
  wsS.send({ type: "start_enrichment", synthesisId: sid, elementType: "category", elementId: bytie.id, enrichmentType: "description" });
  const errS = await wsS.waitFor((m) => m.type === "stream_error" && m.synthesisId === sid, 10000, "stream_error чужой");
  ok(/Нет доступа/.test(errS.error), "WS: чужой синтез → stream_error FORBIDDEN, без вызова Claude", errS.error);
  const callsNow = mock.calls.length;
  await sleep(300);
  ok(mock.calls.length === callsNow, "мок не вызывался при отказах");

  /* ══ R6 ═══════════════════════════════════════════════════════════════ */
  console.log("\nR6. Edge cases");
  const ghost = "99999999-9999-4999-8999-999999999999";
  const r6a = await api("POST", `/syntheses/${sid}/enrich/category/${ghost}`, { type: "description" });
  ok(r6a.status === 404 && r6a.json?.code === "NOT_FOUND", "несуществующая категория → 404", `${r6a.status} ${J(r6a.json)}`);
  const r6b = await api("POST", `/syntheses/${sid}/enrich/category/not-a-uuid`, { type: "description" });
  ok(r6b.status === 404, "не-UUID категории → 404");
  const r6c = await api("POST", `/syntheses/${ghost}/enrich/category/${bytie.id}`, { type: "description" });
  ok(r6c.status === 404, "несуществующий синтез → 404");
  const r6d = await api("POST", `/syntheses/${sid}/enrich/category/${bytie.id}`, { type: "description" }, stranger);
  ok(r6d.status === 403, "чужой → 403");
  const r6e = await api("POST", `/syntheses/${sid}/enrich/category/${bytie.id}`, { type: "counterarguments" });
  ok(r6e.status === 400 && r6e.json?.details?.type, "тип связи у категории → 400 details.type", J(r6e.json));
  const r6f = await api("POST", `/syntheses/${sid}/enrich/edge/${edge.id}`, { type: "description" });
  ok(r6f.status === 400 && r6f.json?.details?.type, "тип категории у связи → 400 details.type");
  const r6g = await api("POST", `/syntheses/${sid}/enrich/edge/${bytie.id}`, { type: "justification" });
  ok(r6g.status === 404, "id категории как связь → 404");
  const jv = (body) => api("POST", `/syntheses/${sid}/justify-characteristic`, body);
  const r6h = await jv({ elementId: bytie.id, elementType: "category", characteristic: "centrality", value: 1.2 });
  ok(r6h.status === 400 && /диапазона \[0, 1\]/.test(r6h.json?.details?.value ?? ""), "centrality=1.2 → 400 details.value [0,1]", J(r6h.json));
  const r6i = await jv({ elementId: bytie.id, elementType: "category", characteristic: "innovation_degree", value: 3.5 });
  ok(r6i.status === 400 && /целое/.test(r6i.json?.details?.value ?? ""), "innovation_degree=3.5 → 400 (целое 1–5)", J(r6i.json));
  const r6j = await jv({ elementId: bytie.id, elementType: "category", characteristic: "innovation_degree", value: 6 });
  ok(r6j.status === 400, "innovation_degree=6 → 400");
  const r6k = await jv({ elementId: edge.id, elementType: "edge", characteristic: "centrality", value: 0.5 });
  ok(r6k.status === 400 && /нет характеристики/.test(r6k.json?.details?.characteristic ?? ""), "centrality у связи → 400 details.characteristic");
  const r6l = await jv({ elementId: ghost, elementType: "category", characteristic: "centrality", value: 0.5 });
  ok(r6l.status === 404, "обоснование несуществующего элемента → 404");
  const r6m = await jv({ elementId: bytie.id, elementType: "category", characteristic: "centrality", value: "0.9" });
  ok(r6m.status === 400 && r6m.json?.details?.value === "Ожидается число", "value строкой → 400");
  const r6n = await jv({});
  ok(r6n.status === 400 && Object.keys(r6n.json?.details ?? {}).length >= 3, "пустое тело → 400 с details по полям", J(r6n.json));
  const r6o = await api("POST", `/syntheses/${sid}/justify-characteristic`, { elementId: edge.id, elementType: "edge", characteristic: "innovationDegree", value: 5 });
  ok(r6o.status === 200, "граница 5 у innovation_degree связи (camelCase-имя) → 200");
  const done6 = await wsO.waitFor((m) => m.type === "enrichment_done" && m.elementId === edge.id && m.enrichmentType === "characteristic", 20000, "justify edge");
  const je = (await db.select().from(characteristicJustifications).where(eq(characteristicJustifications.id, done6.enrichmentId)))[0];
  ok(je?.characteristic === "innovation_degree" && je.elementType === "edge" && je.value === 5, "обоснование связи: канонический snake_case ключ, value 5", J(je && { c: je.characteristic, v: je.value }));
  ok(mock.calls.at(-1).prompt.includes("допустимый диапазон целое от 1 до 5") && mock.calls.at(-1).prompt.includes("текущее значение в документе — 1"), "промпт: целочисленный диапазон и текущее значение связи");
  const r6q = await fetch(`${BASE}/syntheses/${sid}/enrichments/${bytie.id}`);
  ok(r6q.status === 401, "без сессии → 401");

  /* ══ Таксономия §2.13 ═══════════════════════════════════════════════ */
  console.log("\nT. routes/taxonomy §2.13");
  const t1 = await api("GET", "/taxonomy/category-types");
  ok(t1.status === 200 && t1.json.types.length >= 18 && t1.json.types.some((t) => t.key === "ontological" && t.isSystem), "GET category-types ≥18 системных");
  const t2 = await api("GET", "/taxonomy/relationship-types");
  ok(t2.status === 200 && t2.json.types.length >= 29 && t2.json.types.every((t) => typeof t.defaultDirection === "string"), "GET relationship-types ≥29, defaultDirection");
  const ck = `t53_cat_${Date.now().toString(36)}`;
  const t3 = await api("POST", "/taxonomy/category-types", { key: ck, nameRu: "Тестовая", description: "из теста 5.3" });
  ok(t3.status === 201 && t3.json.type?.key === ck && t3.json.type.isSystem === false && t3.json.type.createdBy === owner.userId, "POST category-types → 201, пользовательский", J(t3.json));
  const t3d = await api("POST", "/taxonomy/category-types", { key: ck, nameRu: "Дубль" });
  ok(t3d.status === 400 && t3d.json.code === "VALIDATION_ERROR" && t3d.json.details?.key, "дубликат ключа → 400 VALIDATION_ERROR (контракт 0.3b)");
  const t3b = await api("POST", "/taxonomy/category-types", { key: "Плохой Ключ", nameRu: "x" });
  ok(t3b.status === 400, "невалидный ключ → 400");
  const t3m = await api("POST", "/taxonomy/category-types", { description: 1 });
  ok(t3m.status === 400 && t3m.json.details.key && t3m.json.details.nameRu && t3m.json.details.description, "пустые key/nameRu, description не строка → details по трём полям");
  const rk = `t53_rel_${Date.now().toString(36)}`;
  const t4 = await api("POST", "/taxonomy/relationship-types", { key: rk, nameRu: "Тестовая связь", defaultDirection: "bidirectional" });
  ok(t4.status === 201 && t4.json.type.defaultDirection === "bidirectional", "POST relationship-types с defaultDirection → сохранён", J(t4.json));
  const [relRow] = await db.select().from(relationshipTypeCatalog).where(eq(relationshipTypeCatalog.key, rk));
  ok(relRow?.defaultDirection === "bidirectional" && relRow.description === "", "БД: default_direction bidirectional, description ''");
  const t4b = await api("POST", "/taxonomy/relationship-types", { key: rk + "x", nameRu: "y", defaultDirection: "sideways" });
  ok(t4b.status === 400 && t4b.json.details.defaultDirection, "невалидный defaultDirection → 400");
  const t5 = await api("POST", "/taxonomy/normalize", { text: "диалектическая", kind: "relationship" });
  ok(t5.status === 200 && t5.json.match?.key === "dialectical", "normalize «диалектическая» → dialectical", J(t5.json));
  const t5c = await api("POST", "/taxonomy/normalize", { text: "онтологическая", kind: "category" });
  ok(t5c.status === 200 && t5c.json.match?.key === "ontological", "normalize категории → ontological");
  const t5b = await api("POST", "/taxonomy/normalize", { text: "", kind: "thing" });
  ok(t5b.status === 400 && t5b.json.details.text && t5b.json.details.kind, "normalize: пустой text и чужой kind → 400");
  const t6 = await fetch(`${BASE}/taxonomy/category-types`);
  ok(t6.status === 401, "таксономия без сессии → 401");
  // уборка пользовательских типов
  await db.delete(categoryTypeCatalog).where(eq(categoryTypeCatalog.key, ck));
  await db.delete(relationshipTypeCatalog).where(eq(relationshipTypeCatalog.key, rk));

  wsO.close(); wsS.close();
  await db.delete(syntheses).where(eq(syntheses.id, sid));
  const left = await db.select().from(elementEnrichments).where(eq(elementEnrichments.synthesisId, sid));
  ok(left.length === 0, "CASCADE: обогащения удалены с синтезом");
} catch (err) {
  failed++;
  console.error("\n✗✗ ФАТАЛЬНО:", err);
  console.error(srvLog.slice(-1500));
} finally {
  killServer();
  mockSrv.close();
  await closeDb();
  await closeRedis();
}
console.log(`\n══ ИТОГ: ${passed} ✓, ${failed} ✗`);
if (fails.length) console.log("Провалы:", fails);
process.exit(failed ? 1 : 0);
