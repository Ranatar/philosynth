/**
 * Тестовые запросы 2–7 беседы 5.5 (Representation Transformer — graph↔theses)
 * + проверки «По факту 5.5».
 *  R2  graph→theses: 10 категорий + 5 тезисов → новые тезисы (7) → старые в
 *      target_snapshot (цель), граф — в source_snapshot; строка
 *      representation_transforms; html раздела заменён; generation_log и
 *      totals; WS: transform_started → stream_delta "transform:…" →
 *      transform_done.
 *  R3  theses→graph: 8 тезисов → новый граф → categories заменены → типы
 *      нормализованы на каталог (typeCatalogId ≠ null) → строка истории.
 *  R4  итеративный цикл: graph→theses → PATCH тезиса №2 → theses→graph →
 *      граф изменился (категория из тезиса №2) → graph→theses → тезис,
 *      выведенный из этой категории. (На моке Claude детерминирован:
 *      категории строятся из формулировок, тезисы — из категорий.)
 *  R5  rollback после graph→theses: тезисы восстановлены из снимка (те же
 *      id и формулировки), html раздела прежний, строка отката создана.
 *  R6  UI (браузер): граф → «→ Тезисы» → TransformPanel: предупреждение →
 *      «Преобразовать» → подтверждение → прогресс → summary → история
 *      содержит запись → «Откатить» → откат в истории и БД; кнопка «→ Граф»
 *      над разделом тезисов; секция «Трансформации» в EditModal.
 *  R7  edge cases: без тезисов → 400 "No theses to transform"; без графа →
 *      400 "No graph to transform"; чужой → 403; второй запуск при активной
 *      → 409; rollback чужого/несуществующего id → 404; WS start_transform
 *      → та же операция (stream_error при 409 идемпотентно).
 *
 * Харнесс (как test-54): сервер :3000 + vite :5199 + PG16/Redis, мок Claude
 * SSE :3855 (ANTHROPIC_BASE_URL), puppeteer-core + системный Chrome.
 * Запуск: node_modules/.bin/tsx tests/test-55-requests2-7.mjs
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import puppeteer from "puppeteer-core";
import WebSocket from "ws";

const SERVER_PORT = 3000;
const VITE_PORT = 5199;
const MOCK_PORT = 3855;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const UI = `http://127.0.0.1:${VITE_PORT}`;
const DB_URL = "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const CHROME = process.env.CHROME_PATH ?? "/opt/google/chrome/chrome";

process.env.DATABASE_URL ??= DB_URL;
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.ANTHROPIC_API_KEY ??= "sk-test-not-used";

let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
const J = (x) => JSON.stringify(x);
const norm = (s) => String(s ?? "").replace(/[\s\u00a0]+/g, " ").trim().toLowerCase();
const has = (text, frag) => norm(text).includes(norm(frag));

const { db, closeDb } = await import("../server/db/index.js");
const schema = await import("../server/db/schema.js");
const { closeRedis } = await import("../server/redis.js");
const { saveGraphToDb, parseGraphFromHTML } = await import("../server/services/graph-parser.js");
const { parseThesesFromHTML, saveElementsToDb } = await import("../server/services/element-parser.js");
const { asc, desc, eq } = await import("drizzle-orm");
const { syntheses, synthesisLineage, sections, categories, categoryEdges, theses, representationTransforms, generationLog } = schema;

/* ══ Фикстура ═════════════════════════════════════════════════════════ */
const secWrap = (num, title, inner) =>
  `<div class="doc-section"><div class="section-num">§ ${num}</div>` +
  `<div class="section-title">${title}</div><div class="doc-content">${inner}</div></div>`;
const sub = (name, inner) => `<div data-section="${name}"><h4>${name}</h4>${inner}</div>`;
const tbl = (heads, rows) =>
  `<table class="doc-table"><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead>` +
  `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

const CAT_NAMES = ["Бытие", "Становление", "Ничто", "Логос", "Истина", "Благо", "Свобода", "Время", "Форма", "Материя"];
const CAT_TYPES = ["онтологическая", "метафизическая", "онтологическая", "логическая", "эпистемологическая", "этическая", "этическая", "метафизическая", "онтологическая", "онтологическая"];
function graphHtml(names, types, num = 2) {
  const cats = names.map((n, i) => [n, types[i % types.length], `Определение ${n}`, (0.5 + (i % 5) / 10).toFixed(1), "0.7", `Источник ${n}`]);
  const edges = names.slice(1).map((n, i) => [names[i], `${names[i]} обусловливает ${n}`, n, i % 2 ? "каузальная" : "диалектическая", "однонаправленная", "0.8"]);
  const topo = names.map((n, i) => [n, i < names.length / 2 ? "Онтологическое ядро" : "Практический горизонт", i === 0 ? "центральная" : i === 4 ? "мост" : "", i % 2 ? "тезис" : "антитезис", ""]);
  return secWrap(num, "Граф категорий",
    sub("Методология построения графа", "<p>Методология.</p>") +
    sub("Таблица категорий", tbl(["Категория", "Тип", "Определение", "Центральность", "Определённость", "Происхождение"], cats)) +
    sub("Таблица связей", tbl(["Источник", "Описание связи", "Цель", "Тип", "Направление", "Сила"], edges)) +
    sub("Топология графа", "<p>Два кластера: <strong>Онтологическое ядро</strong> и <strong>Практический горизонт</strong>.</p>") +
    sub("Топологическая таблица", tbl(["Категория", "Кластер", "Структурные роли", "Процессуальные роли", "Рефлексивная связь"], topo)));
}
function thesesHtml(items, num = 3) {
  // items: [{ f, type, nov, cats, just }]
  const types = { ontological: "онтологический", epistemological: "эпистемологический", ethical: "этический" };
  const groups = { ontological: [], epistemological: [], ethical: [] };
  items.forEach((t, i) => groups[t.type].push(`<p><strong>${t.f}</strong> ${t.just ?? `Обоснование тезиса ${i + 1}.`}</p>`));
  return secWrap(num, "Корпус тезисов",
    sub("Онтологические тезисы", groups.ontological.join("") || "<p>—</p>") +
    sub("Эпистемологические тезисы", groups.epistemological.join("") || "<p>—</p>") +
    sub("Этические и аксиологические тезисы", groups.ethical.join("") || "<p>—</p>") +
    sub("Сводная таблица тезисов", tbl(["№", "Формулировка тезиса", "Тип", "Степень новизны", "Связанные категории"],
      items.map((t, i) => [String(i + 1), t.f, types[t.type], t.nov ?? "средняя", (t.cats ?? []).join(", ")]))));
}
const BASE_THESES = [
  { f: "Бытие первично по отношению к становлению.", type: "ontological", cats: ["Бытие", "Становление"] },
  { f: "Ничто есть предел становления.", type: "ontological", cats: ["Ничто", "Становление"] },
  { f: "Логос открывает истину как соответствие.", type: "epistemological", cats: ["Логос", "Истина"] },
  { f: "Благо познаётся через свободу.", type: "ethical", cats: ["Благо", "Свобода"] },
  { f: "Время есть мера формы.", type: "epistemological", cats: ["Время", "Форма"] },
];

async function makeSynthesis(userId, title, opts = {}) {
  const { withGraph = true, withTheses = true, isPublic = false } = opts;
  const order = ["sum", ...(withGraph ? ["graph"] : []), ...(withTheses ? ["theses"] : [])];
  const [s] = await db.insert(syntheses).values({
    userId, seed: "тестовое зерно 5.5", sectionOrder: order, status: "ready", title, isPublic,
    capsuleHtml: "<p>Капсула.</p>", synthLevel: "comparative", extGraphMetrics: false,
  }).returning();
  await db.insert(synthesisLineage).values([{ synthesisId: s.id, parentType: "philosopher", parentName: "Парменид", position: 0 }]);
  const rows = [{ synthesisId: s.id, key: "sum", sectionNum: 1, title: "Резюме", htmlContent: secWrap(1, "Резюме", sub("Цели", "<p>Цели.</p>")) }];
  if (withGraph) {
    const g = graphHtml(CAT_NAMES, CAT_TYPES, 2);
    rows.push({ synthesisId: s.id, key: "graph", sectionNum: 2, title: "Граф Категорий Концепции", htmlContent: g });
    await saveGraphToDb(s.id, parseGraphFromHTML(g), { normalizeTypes: false });
  }
  if (withTheses) {
    const t = thesesHtml(BASE_THESES, withGraph ? 3 : 2);
    rows.push({ synthesisId: s.id, key: "theses", sectionNum: withGraph ? 3 : 2, title: "Корпус Тезисов", htmlContent: t });
    await saveElementsToDb(s.id, "theses", { theses: parseThesesFromHTML(t) });
  }
  await db.insert(sections).values(rows);
  return s;
}

/* ══ Мок Claude API (SSE) — детерминированные ответы трансформаций ═══ */
const mock = { calls: [], failCount: 0, delayMs: 15 };
const CHUNK = 120;
/** graph→theses: по тезису на каждую категорию из блока графа + один сводный */
function thesesFromGraphAnswer(prompt) {
  const block = prompt.split("ГРАФ КАТЕГОРИЙ (источник трансформации):")[1]?.split("ПРАВИЛА КОНВЕРСИИ")[0] ?? "";
  const names = [...block.matchAll(/^\d+\. «([^»]+)» — тип:/gm)].map((m) => m[1]);
  const numMatch = prompt.match(/§ (\d+) — КОРПУС ТЕЗИСОВ/);
  const num = numMatch ? Number(numMatch[1]) : 3;
  const items = names.slice(0, 6).map((n, i) => ({
    f: `Категория «${n}» конституирует структуру концепции (тезис из графа).`,
    type: i % 3 === 0 ? "ontological" : i % 3 === 1 ? "epistemological" : "ethical",
    nov: "высокая", cats: [n], just: `Следует из связей категории «${n}» в графе.`,
  }));
  items.push({ f: "Граф в целом связен и выводим (сводный тезис).", type: "ontological", cats: names.slice(0, 2), just: "Итог." });
  return thesesHtml(items, num);
}
/** theses→graph: категория из первых двух слов каждой формулировки + связи цепочкой */
function graphFromThesesAnswer(prompt) {
  const block = prompt.split("КОРПУС ТЕЗИСОВ (источник трансформации):")[1]?.split("ПРАВИЛА КОНВЕРСИИ")[0] ?? "";
  const forms = [...block.matchAll(/^\d+\. \[[^\]]+\] (.+)$/gm)].map((m) => m[1]);
  const names = [...new Set(forms.map((f) => f.replace(/[«»]/g, "").split(/\s+/).slice(0, 2).join(" ").replace(/[.,;:]$/, "")))];
  const types = names.map((_, i) => i % 3 === 0 ? "онтологическая" : i % 3 === 1 ? "эпистемологическая" : "этическая");
  const numMatch = prompt.match(/§ (\d+) — ГРАФ КАТЕГОРИЙ/);
  return graphHtml(names, types, numMatch ? Number(numMatch[1]) : 2);
}
function startMock() {
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      let prompt = "", system = "";
      try { const b = JSON.parse(body); prompt = b.messages?.[0]?.content ?? ""; system = b.system ?? ""; } catch {}
      mock.calls.push({ system, prompt });
      if (mock.failCount > 0) {
        mock.failCount--;
        res.writeHead(500, { "content-type": "application/json" });
        res.end(J({ type: "error", error: { type: "api_error", message: "mock failure" } }));
        return;
      }
      const html = /граф категорий → корпус тезисов/i.test(prompt) ? thesesFromGraphAnswer(prompt)
        : /корпус тезисов → граф категорий/i.test(prompt) ? graphFromThesesAnswer(prompt)
          : "<div class=\"doc-section\"><p>?</p></div>";
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (o) => res.write(`data: ${J(o)}\n\n`);
      send({ type: "message_start", message: { usage: { input_tokens: Math.ceil(prompt.length / 4) } } });
      for (let i = 0; i < html.length; i += CHUNK) {
        send({ type: "content_block_delta", delta: { type: "text_delta", text: html.slice(i, i + CHUNK) } });
        await sleep(mock.delayMs);
      }
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: Math.ceil(html.length / 4) } });
      send({ type: "message_stop" });
      res.end();
    });
  });
  return new Promise((r) => srv.listen(MOCK_PORT, "127.0.0.1", () => r(srv)));
}

/* ══ Процессы ═════════════════════════════════════════════════════════ */
let serverProc, viteProc, browser, mockSrv;
let serverLog = "", viteLog = "";
async function assertPortFree(url, name) {
  try { const r = await fetch(url); if (r.ok) throw new Error(`порт занят чужим ${name}`); }
  catch (e) { if (String(e).includes("порт занят")) throw e; }
}
async function startServer() {
  await assertPortFree(`${API}/health`, "сервером");
  serverProc = spawn(process.execPath, ["--import", "tsx", "index.ts"], {
    cwd: new URL("../server/", import.meta.url).pathname,
    env: {
      ...process.env, PORT: String(SERVER_PORT), DATABASE_URL: DB_URL, REDIS_URL: "redis://localhost:6379",
      CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000",
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-55",
      STREAM_RETRY_DELAYS: "50",
    },
    stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  serverProc.stdout.on("data", (d) => (serverLog += d));
  serverProc.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`${API}/health`)).ok) return; } catch {} await sleep(300); }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-2000));
}
async function startVite() {
  await assertPortFree(UI + "/", "vite");
  viteProc = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort"], {
    cwd: new URL("../client/", import.meta.url).pathname,
    env: { ...process.env, PHILOSYNTH_API_PORT: String(SERVER_PORT) }, stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  viteProc.stdout.on("data", (d) => (viteLog += d));
  viteProc.stderr.on("data", (d) => (viteLog += d));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(UI + "/")).ok) return; } catch {} await sleep(300); }
  throw new Error("vite не поднялся:\n" + viteLog.slice(-2000));
}
const killGroup = (p) => { if (!p) return; try { process.kill(-p.pid, "SIGKILL"); } catch {} try { p.kill("SIGKILL"); } catch {} };

async function makeUser(tag) {
  const email = `t55-${tag}-${Date.now()}@test.local`;
  const password = "Passw0rd!123";
  let r = await fetch(`${API}/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: J({ email, password }) });
  if (!r.ok) throw new Error("register: " + (await r.text()));
  const id = (await r.json()).user.id;
  r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: J({ email, password }) });
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  return { id, email, password, cookie };
}
const api = async (u, method, path, body) => {
  const r = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", Cookie: u.cookie }, body: body === undefined ? undefined : J(body) });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};

/** WS-канал пользователя: собирает сообщения по synthesisId */
function openWs(u) {
  const ws = new WebSocket(`ws://127.0.0.1:${SERVER_PORT}/ws`, { headers: { Cookie: u.cookie } });
  const msgs = [];
  ws.on("message", (d) => { try { msgs.push(JSON.parse(String(d))); } catch {} });
  const opened = new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
  /** Ждать сообщение, удовлетворяющее pred, среди пришедших ПОСЛЕ индекса since */
  const waitFor = async (pred, timeout = 30000, since = 0) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { const m = msgs.slice(since).find(pred); if (m) return m; await sleep(100); }
    return null;
  };
  return { ws, msgs, opened, waitFor, mark: () => msgs.length };
}

const transformsOf = (sid) => db.select().from(representationTransforms).where(eq(representationTransforms.synthesisId, sid)).orderBy(desc(representationTransforms.createdAt));
const thesesOf = (sid) => db.select().from(theses).where(eq(theses.synthesisId, sid)).orderBy(asc(theses.thesisNum));
const catsOf = (sid) => db.select().from(categories).where(eq(categories.synthesisId, sid)).orderBy(asc(categories.position));
const sectionHtml = async (sid, key) => (await db.select({ h: sections.htmlContent }).from(sections).where(eq(sections.synthesisId, sid)))[0] && (await db.select({ h: sections.htmlContent, k: sections.key }).from(sections).where(eq(sections.synthesisId, sid))).find((r) => r.k === key)?.h;
async function waitTransforms(sid, count, timeout = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const rows = await transformsOf(sid); if (rows.length >= count) return rows; await sleep(150); }
  return transformsOf(sid);
}

/* ══ Хелперы браузера ═════════════════════════════════════════════════ */
async function fill(page, sel, value) {
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.click(sel);
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type(sel, value);
}
async function clickBtn(page, rootSel, text) {
  return page.evaluate(([root, t]) => {
    const r = root ? document.querySelector(root) : document;
    if (!r) return "no-root";
    const n = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const b = [...r.querySelectorAll("button")].find((x) => n(x.innerText).includes(n(t)));
    if (!b) return "no-btn";
    if (b.disabled) return "disabled";
    b.click(); return "ok";
  }, [rootSel, text]);
}
const textOf = (page, sel) => page.$eval(sel, (el) => el.innerText).catch(() => "");
async function waitText(page, sel, frag, timeout = 30000) {
  await page.waitForFunction(([s, f]) => {
    const el = document.querySelector(s);
    const n = (x) => String(x ?? "").replace(/[\s\u00a0]+/g, " ").trim().toLowerCase();
    return !!el && n(el.innerText).includes(n(f));
  }, { timeout }, [sel, frag]);
}
const consoleErrors = [], pageErrors = [];

mockSrv = await startMock();
try {
  await startServer();
  await startVite();
  console.log("Мок, сервер и vite подняты.");

  const A = await makeUser("owner");
  const B = await makeUser("other");
  const S = await makeSynthesis(A.id, "Синтез 5.5 (полный)");
  const sid = S.id;
  const t0 = await thesesOf(sid);
  const c0 = await catsOf(sid);
  ok(t0.length === 5 && c0.length === 10, "фикстура: 10 категорий, 5 тезисов", `${c0.length}/${t0.length}`);
  ok(c0.every((c) => c.typeCatalogId === null), "фикстура: типы не нормализованы (normalizeTypes:false)");
  const graphHtml0 = await sectionHtml(sid, "graph");
  const thesesHtml0 = await sectionHtml(sid, "theses");
  const [synth0] = await db.select().from(syntheses).where(eq(syntheses.id, sid));

  /* ══ R2: graph→theses ══ */
  console.log("\n■ R2: graph→theses");
  const wsA = openWs(A);
  await wsA.opened;
  let r = await api(A, "POST", `/syntheses/${sid}/transform/graph-to-theses`);
  ok(r.status === 200 && r.json?.ok === true, "POST /transform/graph-to-theses → { ok: true }", J(r));
  const started = await wsA.waitFor((m) => m.type === "transform_started" && m.synthesisId === sid);
  ok(!!started && started.direction === "graph_to_theses", "WS transform_started", J(started));
  const doneMsg = await wsA.waitFor((m) => m.type === "transform_done" && m.synthesisId === sid);
  ok(!!doneMsg, "WS transform_done", J(doneMsg));
  const deltas = wsA.msgs.filter((m) => m.type === "stream_delta" && m.sectionKey === "transform:graph_to_theses");
  ok(deltas.length > 1 && deltas.every((d) => d.synthesisId === sid), `дельты stream_delta с sectionKey transform:graph_to_theses (${deltas.length})`);
  ok(doneMsg?.summary?.thesesCreated === 7 && doneMsg?.summary?.thesesRemoved === 5, "summary: создано 7, удалено 5", J(doneMsg?.summary));
  ok(doneMsg?.usage?.inputTokens > 0 && doneMsg?.usage?.costUsd > 0, "usage в transform_done");
  let tr = await waitTransforms(sid, 1);
  ok(tr.length === 1 && tr[0].direction === "graph_to_theses", "строка representation_transforms создана");
  ok(tr[0].sourceSnapshot?.kind === "graph" && tr[0].sourceSnapshot.categories?.length === 10 && tr[0].sourceSnapshot.edges?.length === 9, "source_snapshot — граф (10 категорий, 9 связей)");
  ok(tr[0].targetSnapshot?.kind === "theses" && tr[0].targetSnapshot.theses?.length === 5 && tr[0].targetSnapshot.theses[0].formulation === BASE_THESES[0].f, "target_snapshot — прежние тезисы (5, с формулировками и id)");
  ok(tr[0].targetSnapshot.sectionHtml === thesesHtml0, "target_snapshot несёт прежний html раздела theses");
  ok(Number(tr[0].costUsd) > 0 && tr[0].inputTokens > 0, "строка несёт токены и стоимость");
  const t1 = await thesesOf(sid);
  ok(t1.length === 7 && t1.every((t) => /тезис из графа|сводный тезис/.test(t.formulation)), "тезисы заменены (7 новых)", J(t1.map((t) => t.formulation)));
  ok(t1.every((t) => !t0.some((o) => o.id === t.id)), "новые тезисы — новые id");
  ok(t1[0].justification.includes("Следует из связей"), "обоснование извлечено из прозы подраздела");
  const thesesHtml1 = await sectionHtml(sid, "theses");
  ok(thesesHtml1 !== thesesHtml0 && thesesHtml1.includes("тезис из графа") && thesesHtml1.includes("§ 3"), "html раздела theses заменён целиком (номер § сохранён)");
  ok((thesesHtml1.match(/<tbody>[\s\S]*?<\/tbody>/g) ?? []).some((b) => (b.match(/<tr>/g) ?? []).length === 7), "сводная таблица в html — 7 строк (перерисована рендерером)");
  const prompt2 = mock.calls.at(-1).prompt;
  ok(/ГРАФ КАТЕГОРИЙ \(источник трансформации\)/.test(prompt2) && CAT_NAMES.every((n) => prompt2.includes(`«${n}»`)), "промпт несёт весь граф из БД");
  ok(!prompt2.includes("тестовое зерно 5.5") && !/КОНТЕКСТ ИЗ ПРЕДЫДУЩИХ РАЗДЕЛОВ/.test(prompt2), "промпт БЕЗ зерна и межсекционного контекста (01 §4.11)");
  ok(/§ 3 — КОРПУС ТЕЗИСОВ/.test(prompt2) && /Сводная таблица тезисов/.test(prompt2), "задание раздела theses из buildSectionDefs в промпте");
  ok(/Отвечай ТОЛЬКО HTML начиная с <div class="doc-section">/.test(mock.calls.at(-1).system), "SYS — outputMode full");
  const [gl] = await db.select().from(generationLog).where(eq(generationLog.synthesisId, sid)).orderBy(desc(generationLog.createdAt)).limit(1);
  ok(gl?.source === "edit" && gl.sectionKey === "theses" && /трансформация граф → тезисы/.test(gl.sectionLabel) && gl.status === "done", "generation_log: source edit, статус done", J(gl && [gl.source, gl.sectionKey, gl.sectionLabel]));
  const [synth1] = await db.select().from(syntheses).where(eq(syntheses.id, sid));
  ok(Number(synth1.totalCostUsd) > Number(synth0.totalCostUsd), "total_cost_usd вырос (трансформация — в стоимости документа)");

  /* ══ R3: theses→graph (8 тезисов) ══ */
  console.log("\n■ R3: theses→graph");
  const S3 = await makeSynthesis(A.id, "Синтез 5.5 (8 тезисов)", { withGraph: false });
  const EIGHT = [...BASE_THESES, { f: "Форма определяет материю.", type: "ontological", cats: ["Форма", "Материя"] }, { f: "Свобода есть условие блага.", type: "ethical" }, { f: "Истина открывается во времени.", type: "epistemological" }];
  const t8html = thesesHtml(EIGHT, 2);
  await db.update(sections).set({ htmlContent: t8html }).where(eq(sections.synthesisId, S3.id));
  await saveElementsToDb(S3.id, "theses", { theses: parseThesesFromHTML(t8html) });
  ok((await thesesOf(S3.id)).length === 8 && (await catsOf(S3.id)).length === 0, "фикстура R3: 8 тезисов, графа нет");
  r = await api(A, "POST", `/syntheses/${S3.id}/transform/theses-to-graph`);
  ok(r.status === 200 && r.json?.ok === true, "POST /transform/theses-to-graph → ok");
  const done3 = await wsA.waitFor((m) => m.type === "transform_done" && m.synthesisId === S3.id);
  ok(!!done3 && done3.direction === "theses_to_graph", "WS transform_done theses→graph", J(done3));
  tr = await waitTransforms(S3.id, 1);
  ok(tr.length === 1 && tr[0].direction === "theses_to_graph" && tr[0].sourceSnapshot?.kind === "theses" && tr[0].sourceSnapshot.theses.length === 8, "строка истории: source — 8 тезисов");
  ok(tr[0].targetSnapshot?.kind === "graph" && tr[0].targetSnapshot.categories.length === 0 && tr[0].targetSnapshot.sectionHtml === null, "target_snapshot — пустой граф, sectionHtml null (раздела graph не было)");
  const c3 = await catsOf(S3.id);
  ok(c3.length === 8 && c3.some((c) => c.name === "Бытие первично"), "категории созданы из тезисов (8)", J(c3.map((c) => c.name)));
  ok(c3.every((c) => c.typeCatalogId !== null), "нормализация типов через taxonomy: typeCatalogId у всех категорий", J(c3.map((c) => [c.type, c.typeCatalogId])));
  const e3 = await db.select().from(categoryEdges).where(eq(categoryEdges.synthesisId, S3.id));
  ok(e3.length === 7 && e3.every((e) => e.typeCatalogId !== null), "связи созданы (7) и нормализованы", J(e3.map((e) => [e.edgeType, e.typeCatalogId])));
  ok(done3?.summary?.categoriesCreated === 8 && done3.summary.categoriesRemoved === 0 && done3.summary.categoriesNormalized === 8 && done3.summary.sectionMissing === 1, "summary theses→graph: создано 8, нормализовано 8, sectionMissing (раздела graph нет)", J(done3?.summary));
  const prompt3 = mock.calls.at(-1).prompt;
  ok(/КОРПУС ТЕЗИСОВ \(источник трансформации\)/.test(prompt3) && EIGHT.every((t) => prompt3.includes(t.f)) && /Топологическая таблица/.test(prompt3), "промпт: все 8 тезисов + задание раздела graph");
  ok((await db.select().from(sections).where(eq(sections.synthesisId, S3.id))).every((s) => s.key !== "graph"), "раздел graph НЕ создан (только гранулярные таблицы — sectionMissing)");

  /* ══ R4: итеративный цикл на S ══ */
  console.log("\n■ R4: итеративный цикл graph→theses → PATCH №2 → theses→graph → graph→theses");
  const t4 = await thesesOf(sid);
  const th2 = t4.find((t) => t.thesisNum === 2);
  r = await api(A, "PATCH", `/syntheses/${sid}/theses/${th2.id}`, { formulation: "Маркерная Категория определяет весь строй концепции." });
  ok(r.status === 200 && r.json?.thesis?.formulation.startsWith("Маркерная Категория"), "PATCH тезиса №2", J(r.json?.error));
  const graphBefore = (await catsOf(sid)).map((c) => c.name);
  r = await api(A, "POST", `/syntheses/${sid}/transform/theses-to-graph`);
  ok(r.status === 200, "theses→graph запущена");
  ok(!!(await wsA.waitFor((m) => m.type === "transform_done" && m.synthesisId === sid && m.direction === "theses_to_graph")), "theses→graph завершена");
  const c4 = await catsOf(sid);
  ok(c4.length === 7 && J(c4.map((c) => c.name)) !== J(graphBefore), "граф изменился (7 категорий из 7 тезисов вместо 10)", J(c4.map((c) => c.name)));
  ok(c4.some((c) => c.name === "Маркерная Категория"), "категория из отредактированного тезиса №2 в графе");
  ok(mock.calls.at(-1).prompt.includes("Маркерная Категория определяет весь строй"), "промпт theses→graph нёс отредактированный тезис №2");
  const graphHtml4 = await sectionHtml(sid, "graph");
  ok(graphHtml4 !== graphHtml0 && graphHtml4.includes("Маркерная Категория") && graphHtml4.includes("§ 2"), "html раздела graph заменён (§ 2 сохранён)");
  let mk = wsA.mark();
  r = await api(A, "POST", `/syntheses/${sid}/transform/graph-to-theses`);
  ok(r.status === 200, "вторая graph→theses запущена");
  ok(!!(await wsA.waitFor((m) => m.type === "transform_done" && m.synthesisId === sid && m.direction === "graph_to_theses", 30000, mk)), "вторая graph→theses завершена");
  const t5 = await thesesOf(sid);
  ok(t5.some((t) => t.formulation.includes("«Маркерная Категория»") && t.relatedCategories.includes("Маркерная Категория")), "тезис №2 повлиял на результат: новый тезис выведен из «Маркерная Категория»", J(t5.map((t) => t.formulation)));
  ok((await transformsOf(sid)).length === 3, "история S: 3 трансформации");

  /* ══ R5: rollback ══ */
  console.log("\n■ R5: rollback после graph→theses");
  const hist = await transformsOf(sid); // новые первыми: [g2t#2, t2g, g2t#1]
  const lastG2T = hist[0];
  const thesesBeforeRb = await thesesOf(sid);
  const thesesHtmlBeforeRb = await sectionHtml(sid, "theses");
  r = await api(A, "POST", `/syntheses/${sid}/transforms/${lastG2T.id}/rollback`);
  ok(r.status === 200 && r.json?.ok === true && r.json.transform?.resultSummary?.rollback === 1, "POST rollback → { ok, transform(rollback=1), summary }", J(r.json));
  const t6 = await thesesOf(sid);
  const snapT = lastG2T.targetSnapshot.theses;
  ok(t6.length === snapT.length && t6.every((t, i) => t.id === snapT[i].id && t.formulation === snapT[i].formulation), "тезисы восстановлены из target_snapshot (те же id и формулировки)", J([t6.length, snapT.length]));
  ok(t6.some((t) => t.formulation.startsWith("Маркерная Категория")), "восстановлен и отредактированный тезис №2 (состояние до второй трансформации)");
  ok((await sectionHtml(sid, "theses")) === lastG2T.targetSnapshot.sectionHtml && (await sectionHtml(sid, "theses")) !== thesesHtmlBeforeRb, "html раздела theses восстановлен из снимка");
  const hist2 = await transformsOf(sid);
  ok(hist2.length === 4 && hist2[0].direction === "graph_to_theses" && hist2[0].resultSummary.rollback === 1 && hist2[0].inputTokens === 0, "строка отката: тот же direction, rollback=1, токены 0");
  ok(hist2[0].targetSnapshot?.kind === "theses" && hist2[0].targetSnapshot.theses.length === thesesBeforeRb.length && hist2[0].sourceSnapshot.theses.length === t6.length, "откат: target — состояние ДО отката, source — восстановленный снимок (откат отката возможен)");
  r = await api(A, "POST", `/syntheses/${sid}/transforms/${hist2[0].id}/rollback`);
  const t7 = await thesesOf(sid);
  ok(r.status === 200 && t7.length === thesesBeforeRb.length && t7[0].id === thesesBeforeRb[0].id, "откат отката возвращает результат второй трансформации");
  ok(mock.calls.length === 4, "откаты не обращаются к Claude (4 вызова мока за R2–R5)", String(mock.calls.length));

  /* ══ R7: edge cases (API) ══ */
  console.log("\n■ R7: edge cases");
  const NoTheses = await makeSynthesis(A.id, "Без тезисов", { withTheses: false });
  r = await api(A, "POST", `/syntheses/${NoTheses.id}/transform/theses-to-graph`);
  ok(r.status === 400 && r.json?.code === "VALIDATION_ERROR" && r.json.error === "No theses to transform", "без тезисов → 400 \"No theses to transform\"", J(r));
  const NoGraph = await makeSynthesis(A.id, "Без графа", { withGraph: false });
  r = await api(A, "POST", `/syntheses/${NoGraph.id}/transform/graph-to-theses`);
  ok(r.status === 400 && r.json?.error === "No graph to transform", "без графа → 400 \"No graph to transform\"", J(r));
  ok((await transformsOf(NoTheses.id)).length === 0 && (await transformsOf(NoGraph.id)).length === 0, "пустой источник: записей истории нет, мок не вызван (" + mock.calls.length + ")");
  r = await api(B, "POST", `/syntheses/${sid}/transform/graph-to-theses`);
  ok(r.status === 403, "чужой синтез → 403");
  r = await api(B, "GET", `/syntheses/${sid}/transforms`);
  ok(r.status === 403, "GET истории чужого приватного → 403");
  await db.update(syntheses).set({ isPublic: true }).where(eq(syntheses.id, sid));
  r = await api(B, "GET", `/syntheses/${sid}/transforms`);
  ok(r.status === 200 && r.json.transforms.length === 5, "GET истории публичного — доступен не-владельцу (5 записей)");
  r = await api(B, "POST", `/syntheses/${sid}/transforms/${hist2[0].id}/rollback`);
  ok(r.status === 403, "rollback чужого → 403");
  r = await api(A, "POST", `/syntheses/${sid}/transforms/00000000-0000-4000-8000-000000000000/rollback`);
  ok(r.status === 404, "rollback несуществующего id → 404");
  r = await api(A, "POST", `/syntheses/${sid}/transforms/${(await transformsOf(S3.id))[0].id}/rollback`);
  ok(r.status === 404, "rollback id из другого синтеза → 404");
  r = await api(A, "POST", `/syntheses/not-a-uuid/transform/graph-to-theses`);
  ok(r.status === 404, "не-UUID синтеза → 404");
  // 409: медленный мок, второй запуск во время первой операции
  mock.delayMs = 400;
  mk = wsA.mark();
  r = await api(A, "POST", `/syntheses/${sid}/transform/graph-to-theses`);
  ok(r.status === 200, "медленная graph→theses запущена");
  ok(!!(await wsA.waitFor((m) => m.type === "transform_started" && m.synthesisId === sid, 10000, mk)), "медленная: transform_started");
  r = await api(A, "POST", `/syntheses/${sid}/transform/theses-to-graph`);
  ok(r.status === 409 && r.json?.code === "GENERATION_IN_PROGRESS", "второй запуск при активной → 409 GENERATION_IN_PROGRESS", J(r));
  r = await api(A, "POST", `/syntheses/${sid}/transforms/${hist2[0].id}/rollback`);
  ok(r.status === 409, "rollback при активной операции → 409");
  // WS start_transform во время активной — идемпотентно: stream_error, не вторая операция
  const errCountBefore = wsA.msgs.filter((m) => m.type === "stream_error").length;
  wsA.ws.send(J({ type: "start_transform", synthesisId: sid, direction: "theses_to_graph" }));
  const wsErr = await wsA.waitFor((m) => m.type === "stream_error" && m.sectionKey === "transform:theses_to_graph", 10000);
  ok(!!wsErr && /уже запущена|Generation/i.test(wsErr.error) && wsA.msgs.filter((m) => m.type === "stream_error").length === errCountBefore + 1, "WS start_transform при активной → stream_error transform:theses_to_graph", J(wsErr));
  const slowDone = await wsA.waitFor((m) => m.type === "transform_done" && m.synthesisId === sid, 60000, mk);
  ok(!!slowDone, "медленная трансформация завершилась");
  mock.delayMs = 15;
  ok((await transformsOf(sid)).length === 6, "история S после медленной — 6 (второй запуск не создал операции)");
  // WS start_transform как альтернативный вход (свободный слот)
  mk = wsA.mark();
  wsA.ws.send(J({ type: "start_transform", synthesisId: sid, direction: "theses_to_graph" }));
  const wsDone = await wsA.waitFor((m) => m.type === "transform_done" && m.synthesisId === sid && m.direction === "theses_to_graph", 30000, mk);
  ok(!!wsDone && (await transformsOf(sid)).length === 7, "WS start_transform при свободном слоте запускает трансформацию (история 7)");
  // WS чужой синтез
  const wsB = openWs(B); await wsB.opened;
  wsB.ws.send(J({ type: "start_transform", synthesisId: sid, direction: "graph_to_theses" }));
  const wsErrB = await wsB.waitFor((m) => m.type === "stream_error", 10000);
  ok(!!wsErrB && /доступа/i.test(wsErrB.error), "WS start_transform чужого → stream_error FORBIDDEN", J(wsErrB));
  wsB.ws.close();
  // обрыв стрима: сервер падает дважды (ретрай pre-stream) → stream_error, история не растёт, тезисы целы
  mock.failCount = 2;
  const thesesBeforeFail = await thesesOf(sid);
  mk = wsA.mark();
  r = await api(A, "POST", `/syntheses/${sid}/transform/graph-to-theses`);
  ok(r.status === 200, "запуск при падающем моке принят (ошибка — по WS)");
  const failErr = await wsA.waitFor((m) => m.type === "stream_error" && m.sectionKey === "transform:graph_to_theses", 20000, mk);
  ok(!!failErr, "обрыв стрима (500×2) → stream_error transform:graph_to_theses", J(failErr));
  ok((await transformsOf(sid)).length === 7 && J((await thesesOf(sid)).map((t) => t.id)) === J(thesesBeforeFail.map((t) => t.id)), "при обрыве тезисы и история не тронуты");
  mock.failCount = 0;
  wsA.ws.close();

  /* ══ R6: UI ══ */
  console.log("\n■ R6: TransformPanel UI");
  const U = await makeSynthesis(A.id, "Синтез 5.5 (UI)");
  const uid = U.id;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push("console: " + m.text()); });
  page.on("dialog", (d) => void d.accept());
  await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
  await fill(page, "input[type=email]", A.email);
  await fill(page, "input[type=password]", A.password);
  await page.click("button[type=submit]");
  await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 20000 });
  await page.goto(`${UI}/synthesis/${uid}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".actions-bar", { timeout: 20000 });
  await page.waitForSelector("#sec-theses", { timeout: 20000 });
  ok((await page.$("[data-testid=theses-transform-btn]")) !== null, "кнопка «→ Граф» над разделом тезисов у владельца");
  ok(await clickBtn(page, ".actions-bar", "◈ Граф") === "ok", "кнопка «◈ Граф»");
  await page.waitForSelector(".gm-overlay", { timeout: 15000 });
  await page.waitForSelector("[data-testid=gm-transform-btn]", { timeout: 10000 });
  ok(has(await textOf(page, "[data-testid=gm-transform-btn]"), "→ Тезисы"), "кнопка «→ Тезисы» в тулбаре графа");
  await page.click("[data-testid=gm-transform-btn]");
  await page.waitForSelector("[data-testid=transform-panel]", { timeout: 10000 });
  ok((await page.$(".gm-overlay")) === null, "модалка графа закрыта, TransformPanel открыт");
  await waitText(page, "[data-testid=transform-warn]", "будут заменены текущие тезисы: 5");
  const warn = await textOf(page, "[data-testid=transform-warn]");
  ok(has(warn, "Раздел «Корпус тезисов» будет перезаписан") && has(warn, "доступна для отката"), "предупреждение о перезаписи + превью потерь (5 тезисов)", warn);
  ok(has(await textOf(page, "[data-testid=transform-panel] [data-direction=graph_to_theses]"), "Граф → Тезисы") && await page.$eval("[data-testid=transform-panel] [data-direction=graph_to_theses]", (b) => b.className.includes("primary")), "направление «Граф → Тезисы» выбрано");
  await waitText(page, "[data-testid=transform-history]", "Трансформаций ещё не было");
  ok(await clickBtn(page, "[data-testid=transform-panel]", "Преобразовать") === "ok", "«Преобразовать»");
  await page.waitForSelector("[data-testid=transform-confirm]", { timeout: 5000 });
  ok(has(await textOf(page, "[data-testid=transform-panel] .edit-modal-body"), "Подтвердите"), "шаг подтверждения показан");
  const callsBeforeUi = mock.calls.length;
  mock.delayMs = 60;
  await page.click("[data-testid=transform-confirm]");
  await page.waitForSelector("[data-testid=transform-progress]", { timeout: 10000 });
  await waitText(page, "[data-testid=transform-progress]", "генерируется", 20000);
  ok(true, "прогресс стриминга («генерируется… N симв.»)");
  await page.waitForSelector("[data-testid=transform-live]", { timeout: 20000 });
  ok(true, "живой предпросмотр HTML во время стрима");
  ok(await page.$eval("[data-testid=transform-panel] .raw-close", (b) => b.disabled), "закрытие заблокировано во время стрима");
  await page.waitForSelector("[data-testid=transform-summary]", { timeout: 60000 });
  mock.delayMs = 15;
  const summary = await textOf(page, "[data-testid=transform-summary]");
  ok(has(summary, "Граф → Тезисы — выполнено") && has(summary, "тезисов: создано 7, удалено 5"), "summary после трансформации", summary);
  ok(mock.calls.length === callsBeforeUi + 1, "один вызов Claude");
  await waitText(page, "[data-testid=transform-history]", "тезисов: создано 7, удалено 5");
  ok((await page.$$("[data-testid=transform-history] [data-transform-id]")).length === 1, "история содержит запись");
  await waitText(page, "[data-testid=transform-warn]", "будут заменены текущие тезисы: 7");
  ok(true, "счётчики превью перечитаны (7)");
  // документ под панелью перечитан
  await page.waitForFunction(() => document.querySelector("#sec-theses")?.parentElement.innerText.includes("тезис из графа"), { timeout: 15000 });
  ok(true, "раздел тезисов на странице обновлён (reloadSections после transform_done)");
  // rollback из истории
  ok(await clickBtn(page, "[data-testid=transform-history]", "Откатить") === "ok", "«Откатить» в истории");
  await page.waitForFunction(() => document.querySelectorAll("[data-testid=transform-history] [data-transform-id]").length === 2, { timeout: 15000 });
  ok(has(await textOf(page, "[data-testid=transform-history]"), "↶ откат"), "строка отката в истории");
  const tUi = await thesesOf(uid);
  ok(tUi.length === 5 && tUi[0].formulation === BASE_THESES[0].f, "БД: тезисы восстановлены откатом");
  await waitText(page, "[data-testid=transform-warn]", "будут заменены текущие тезисы: 5");
  await page.waitForFunction(() => document.querySelector("#sec-theses")?.parentElement.innerText.includes("Бытие первично"), { timeout: 15000 });
  ok(true, "раздел тезисов на странице восстановлен");
  // переключение направления и пустой источник
  await page.click("[data-testid=transform-panel] [data-direction=theses_to_graph]");
  await waitText(page, "[data-testid=transform-warn]", "Раздел «Граф категорий» будет перезаписан");
  ok(has(await textOf(page, "[data-testid=transform-warn]"), "категории: 10 и связи: 9"), "превью потерь для theses→graph");
  ok(await clickBtn(page, "[data-testid=transform-panel]", "К документу") === "ok", "«К документу» после summary");
  await page.waitForFunction(() => !document.querySelector("[data-testid=transform-panel]"), { timeout: 5000 });
  ok(true, "панель закрыта");
  // «→ Граф» над разделом тезисов открывает панель с направлением theses→graph
  await page.click("[data-testid=theses-transform-btn]");
  await page.waitForSelector("[data-testid=transform-panel]", { timeout: 10000 });
  ok(await page.$eval("[data-testid=transform-panel] [data-direction=theses_to_graph]", (b) => b.className.includes("primary")), "«→ Граф» открывает панель с направлением «Тезисы → Граф»");
  await page.click("[data-testid=transform-panel] .raw-close");
  await page.waitForFunction(() => !document.querySelector("[data-testid=transform-panel]"), { timeout: 5000 });
  // EditModal: секция «Трансформации»
  ok(await clickBtn(page, ".actions-bar", "✎ Изменить") === "ok", "«✎ Изменить»");
  await page.waitForSelector("[data-testid=edit-transforms]", { timeout: 10000 });
  await waitText(page, "[data-testid=edit-transforms]", "↶ откат");
  ok((await page.$$("[data-testid=edit-transforms] [data-transform-id]")).length === 2, "EditModal: секция «Трансформации» с историей (2 записи)");
  // пустой источник в UI: синтез без графа
  await page.goto(`${UI}/synthesis/${NoGraph.id}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid=theses-transform-btn]", { timeout: 20000 });
  await page.click("[data-testid=theses-transform-btn]");
  await page.waitForSelector("[data-testid=transform-panel]", { timeout: 10000 });
  await page.click("[data-testid=transform-panel] [data-direction=graph_to_theses]");
  await page.waitForSelector("[data-testid=transform-empty]", { timeout: 10000 });
  ok(has(await textOf(page, "[data-testid=transform-empty]"), "Нет графа") && await page.$eval("[data-testid=transform-arm]", (b) => b.disabled), "пустой источник в UI: пояснение, «Преобразовать» заблокирована");
  // не-владелец: кнопок нет
  await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => fetch("/api/v1/auth/logout", { method: "POST" })).catch(() => {});
  await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
  await fill(page, "input[type=email]", B.email);
  await fill(page, "input[type=password]", B.password);
  await page.click("button[type=submit]");
  await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 20000 });
  await page.goto(`${UI}/synthesis/${sid}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#sec-theses", { timeout: 20000 });
  ok((await page.$("[data-testid=theses-transform-btn]")) === null, "не-владелец: кнопки «→ Граф» нет");
  await clickBtn(page, ".actions-bar", "◈ Граф");
  await page.waitForSelector(".gm-overlay", { timeout: 15000 });
  ok((await page.$("[data-testid=gm-transform-btn]")) === null, "не-владелец: кнопки «→ Тезисы» в графе нет");

  const realErrors = [...pageErrors, ...consoleErrors].filter((e) => !/favicon|net::ERR_|Failed to load resource|WebSocket|4\d\d \(/i.test(e));
  ok(realErrors.length === 0, "без ошибок консоли/pageerror", J(realErrors.slice(0, 3)));
} catch (err) {
  failed++;
  fails.push("ИСКЛЮЧЕНИЕ: " + (err?.stack || err));
  console.log("\n✗ ИСКЛЮЧЕНИЕ:", err?.stack || err);
  console.log("server log tail:", serverLog.slice(-2500));
} finally {
  try { await browser?.close(); } catch {}
  killGroup(serverProc); killGroup(viteProc);
  try { mockSrv?.close(); } catch {}
  try { await closeRedis(); } catch {}
  try { await closeDb(); } catch {}
}
console.log(`\n══ ИТОГ: ${passed} ✓, ${failed} ✗`);
if (fails.length) { console.log("Провалы:\n - " + fails.join("\n - ")); process.exit(1); }
process.exit(0);
