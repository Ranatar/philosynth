/**
 * Беседа 11.2 — тестовые запросы R2–R9 (язык интерфейса: сервер, codemod,
 * Д-16). Живой сервер :3000 + мок Claude :3921; браузер не нужен (беседа
 * серверная). Нужны PG и Redis. Запуск ИЗ КОРНЯ через tsx:
 *   node_modules/.bin/tsx tests/test-112-requests2-9.mjs
 *
 *  R2 плюралы: tl(…, "{n, plural, …}", {n}) при n = 1, 3, 5, 21 — верные русские
 *     формы; в английском каталоге — one/other.
 *  R3 import: перевод с формами не своего языка (few в английском) → отказ с
 *     указанием ключа; таблица не изменена.
 *  R4 связь языков: PATCH uiLocale=de → ui_locale=de И gen_lang=German;
 *     PATCH genLang=French → ui_locale не изменился; PATCH uiLocale=fr → 400 +
 *     details.uiLocale.
 *  R5 язык запроса: вошедший с ui_locale=en получает английское сообщение об
 *     ошибке; гость с Accept-Language: de — русское (немецкого перевода нет),
 *     с en — английское; без заголовков — русское; cookie ui_locale гостя.
 *  R6 codemod: check:integration зелёный, typecheck 0, audit чист; MODE_UI и
 *     подзаголовок остались литералами.
 *  R7 имена подстановок: в strings.json нет value/recs2/lc2 — у всех говорящие.
 *  R8 лог и промпты: buildSYS(lang=Russian) и formatCtxLog после codemod'а
 *     побайтово равны тому, что даёт код ДО codemod'а (git worktree HEAD).
 *  R9 Д-16: раздел графа с переведёнными атрибутами → intra-контекст
 *     перегенерации «Таблицы связей» несёт содержимое «Таблицы категорий»;
 *     рекомендация с каноническим адресом находит подраздел (индекс в
 *     канонических именах, хэш источника не пуст); в генлоге и в
 *     GET /sections/graph — предупреждения; импорт файла с «Category Table» →
 *     warnings.graph в ответе.
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const BASE = "http://127.0.0.1:3000/api/v1";
const MOCK_PORT = 3921;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const sql = postgres(DB_URL);
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
function ok(cond, name, extra) { if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)) : ""}`); } }

const ORDER = ["Методология построения графа", "Таблица категорий", "Таблица связей", "Топология графа", "Топологическая таблица"];
const EN_NAMES = ["Methodology", "Category Table", "Edge Table", "Graph Topology", "Topology Table"];

/* ── HTML графа, как его отдаёт «модель» ── */
const tbl = (h, rows) => `<table class="doc-table"><thead><tr>${h.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>\n${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("\n")}\n</tbody></table>`;
const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>\n${b}\n</div>`;
const catsTable = () => tbl(["Категория", "Тип", "Определение", "Центральность", "Определённость", "Происхождение"],
  [["Бытие", "онтологическая", "Есть.", "0.9", "0.8", "Парменид"], ["Ничто", "онтологическая", "Не есть.", "0.5", "0.6", "Гегель"], ["Становление", "онтологическая", "Переход.", "0.7", "0.7", "Гераклит"]]);
const edgesTable = () => tbl(["Источник", "Описание связи", "Цель", "Тип", "Направление", "Сила"],
  [["Бытие", "снимается в", "Ничто", "диалектическая", "однонаправленная", "0.8"], ["Ничто", "возвращается к себе", "Ничто", "диалектическая", "рефлексивная", "0.4"], ["Становление", "объединяет", "Бытие", "диалектическая", "двунаправленная", "0.9"]]);
const topoTable = () => tbl(["Категория", "Кластер", "Структурные роли", "Процессуальные роли", "Рефлексивная"],
  [["Бытие", "Ядро", "центральная", "тезис", ""], ["Ничто", "Ядро", "периферийная", "антитезис", "да"], ["Становление", "Ядро", "мост", "синтез", ""]]);
function graphSection(names = ORDER) {
  const bodies = ["<p>Методология.</p>", catsTable(), edgesTable(), "<p>Топология: ядро.</p>", topoTable()];
  return `<div class="doc-section"><div class="section-num">§ 2</div><div class="section-title">Граф категорий</div><div class="doc-content">\n${names.map((n, i) => sub(n, bodies[i])).join("\n")}\n</div></div>`;
}

/* ── Мок Claude ── */
const mock = { calls: [], lastSys: "", lastPrompt: "" };
const mockSrv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    let prompt = "", sys = "";
    try { const j = JSON.parse(body); const c = j.messages?.[0]?.content; prompt = typeof c === "string" ? c : J(c); sys = typeof j.system === "string" ? j.system : J(j.system ?? ""); } catch {}
    mock.lastSys = sys; mock.lastPrompt = prompt;
    const subsectionMode = sys.includes("одного именованного подраздела");
    const html = subsectionMode ? sub("Таблица связей", edgesTable()) : graphSection();
    mock.calls.push({ subsectionMode, prompt });
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 500 } } });
    for (let i = 0; i < html.length; i += 1200) send({ type: "content_block_delta", delta: { type: "text_delta", text: html.slice(i, i + 1200) } });
    send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 800 } });
    send({ type: "message_stop" });
    res.end();
  });
});
await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));

let srv = null;
function startServer() {
  // stdout/stderr сервера — в файл: при отказе теста причина видна (урок 11.2)
  const logFd = fs.openSync(path.join(os.tmpdir(), "t112-server.log"), "a");
  srv = spawn(process.execPath, ["--import", "tsx", "index.ts"], { cwd: ROOT + "server", detached: true, stdio: ["ignore", logFd, logFd], env: { ...process.env, PORT: "3000", RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-112", STREAM_RETRY_DELAYS: "50" } });
}
function stopServer() { try { if (srv) process.kill(-srv.pid, "SIGKILL"); } catch {} srv = null; }
async function waitHealth() { for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/health`)).ok) return true; } catch {} await sleep(500); } return false; }
let cookie = "";
async function api(method, path, body, extraHeaders = {}) {
  const headers = { Cookie: cookie, ...extraHeaders };
  let payload;
  if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
  const r = await fetch(BASE + path, { method, headers, body: payload });
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function account() {
  const email = `t112-${Date.now()}@example.com`;
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-112" }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: "password-112" }) });
  cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  return u.id;
}
const ids = [];
async function synthWithGraph(userId, { lang = "Russian", html = graphSection() } = {}) {
  const [syn] = await sql`insert into syntheses (user_id, seed, title, status, section_order, lang, doc_num, method, synth_level, depth)
    values (${userId}, 'зерно 11.2', 'T112', 'ready', ${sql.json(["sum", "graph"])}, ${lang}, 'PS-0112-T112', 'dialectical', 'comparative', 'overview') returning id`;
  ids.push(syn.id);
  await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${syn.id}, 'philosopher', 'Кант', 0), (${syn.id}, 'philosopher', 'Гегель', 1)`;
  await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${syn.id}, 'sum', 1, 'Резюме', ${'<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">Резюме</div><div class="doc-content"><div data-section="Цели и метод"><p>Резюме.</p></div></div></div>'})`;
  await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${syn.id}, 'graph', 2, 'Граф категорий', ${html})`;
  return syn.id;
}
async function waitGen(synthesisId, sectionKey, sinceMs) {
  for (let i = 0; i < 120; i++) {
    // подраздельная догенерация пишет section_key «graph:Таблица связей» (2.2) — ищем по префиксу
    const [g] = await sql`select id, status, error_message, metadata, source from generation_log where synthesis_id=${synthesisId} and (section_key=${sectionKey} or section_key like ${sectionKey + ":%"}) and log_type='generation' and created_at > ${new Date(sinceMs)} order by created_at desc limit 1`;
    if (g && g.status !== "streaming") return g;
    await sleep(250);
  }
  return null;
}
const warningsOf = (g) => (g?.metadata?.parseWarnings ?? []);
const regenSub = async (id, name) => { const since = Date.now() - 50; const r = await api("POST", `/syntheses/${id}/regenerate-subsection`, { sectionKey: "graph", subsectionName: name }); if (r.status !== 200) throw new Error("regenerate-subsection: " + J(r)); await sleep(300); return waitGen(id, "graph", since); };
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

/* Дамп buildSYS + formatCtxLog — один и тот же скрипт запускается в текущем дереве
   и в worktree HEAD (код до codemod'а); сравнение — побайтовое. */
const DUMP = `
process.env.DATABASE_URL ??= ${J(DB_URL)};
const [tree, synId, out] = process.argv.slice(2);
const { buildSYS } = await import(tree + "/server/services/prompt-builder.ts");
const { formatCtxLog } = await import(tree + "/server/services/log-formatter.ts");
const { closeDb } = await import(tree + "/server/db/index.ts");
const ru = await buildSYS({ phil: ["Кант", "Гегель"], lang: "Russian" }, {});
const ruSub = await buildSYS({ phil: ["Кант", "Гегель"], lang: "Russian" }, { outputMode: "subsection" });
const en = await buildSYS({ phil: ["Кант", "Гегель"], lang: "English" }, {});
const log = await formatCtxLog(synId);
const fs = await import("node:fs");
fs.writeFileSync(out, JSON.stringify({ ru, ruSub, en, log }));
await closeDb();
process.exit(0);
`;

try {
  /* ══ R2. Плюралы ═══════════════════════════════════════════════════════ */
  console.log("\n■ R2. Плюралы в tl()");
  {
    const T = await import("../packages/shared/i18n/t.ts");
    const ru = "{n, plural, one {# рекомендация} few {# рекомендации} many {# рекомендаций} other {# рекомендации}}";
    T.setCatalogProvider(null);
    const got = [1, 3, 5, 21].map((n) => T.tl("t.rec", ru, { n }));
    ok(J(got) === J(["1 рекомендация", "3 рекомендации", "5 рекомендаций", "21 рекомендация"]), "n = 1, 3, 5, 21 → рекомендация / рекомендации / рекомендаций / рекомендация", got);
    ok(T.tl("t.rec", ru, { n: 11 }) === "11 рекомендаций" && T.tl("t.rec", ru, { n: 22 }) === "22 рекомендации", "11 → many, 22 → few (правила ru, не «последняя цифра»)");
    T.setCatalogProvider(() => ({ locale: "en", strings: { "t.rec": "{n, plural, one {# recommendation} other {# recommendations}}" } }));
    const en = [1, 3, 5, 21].map((n) => T.tl("t.rec", ru, { n }));
    ok(J(en) === J(["1 recommendation", "3 recommendations", "5 recommendations", "21 recommendations"]), "английский каталог — one/other", en);
    ok(T.tl("t.other", ru, { n: 3 }) === "3 рекомендации", "ключа нет в каталоге → русский текст с русскими правилами");
    T.setCatalogProvider(null);
  }

  /* ══ R3. import: формы не своего языка ═════════════════════════════════ */
  console.log("\n■ R3. i18n:import отвергает few в английском");
  {
    const tablePath = path.join(ROOT, "packages/shared/i18n/strings.json");
    const before = sha(fs.readFileSync(tablePath, "utf8"));
    const table = JSON.parse(fs.readFileSync(tablePath, "utf8"));
    // строка с ровно одной подстановкой: плюрал по ней — подстановки сходятся, проверяются формы
    const key = Object.keys(table.strings).find((k) => { const r = table.strings[k]; return !r.obsolete && !r.data && r.params && Object.keys(r.params).length === 1; });
    const row = table.strings[key];
    const pn = Object.keys(row.params)[0];
    const file = path.join(os.tmpdir(), `t112-import-${Date.now()}.json`);
    fs.writeFileSync(file, J({ meta: { langs: ["en"] }, strings: { [key]: { ru: row.ru, en: `{${pn}, plural, one {# item} few {# items} other {# items}}` } } }));
    const r = spawnSync("node", ["scripts/i18n/i18n-import.mjs", file], { cwd: ROOT, encoding: "utf8" });
    const outText = (r.stdout ?? "") + (r.stderr ?? "");
    ok(/отклонено 1/.test(outText), "импорт завершился с отчётом об отклонении", outText.slice(-400));
    ok(outText.includes(key) && /формы не языка «en»: few/.test(outText), `отказ называет ключ «${key}» и форму few`, outText.slice(-400));
    ok(sha(fs.readFileSync(tablePath, "utf8")) === before, "strings.json не изменён (отклонённый перевод не влит)");
    // подстановки: плюрал с другим аргументом — тоже отказ
    fs.writeFileSync(file, J({ meta: { langs: ["en"] }, strings: { [key]: { ru: row.ru, en: "{m, plural, one {#} other {#}}" } } }));
    const r2 = spawnSync("node", ["scripts/i18n/i18n-import.mjs", file], { cwd: ROOT, encoding: "utf8" });
    ok(/подстановки \{m\}/.test((r2.stdout ?? "") + (r2.stderr ?? "")), "чужой аргумент плюрала ({m}) — отказ по подстановкам");
    ok(sha(fs.readFileSync(tablePath, "utf8")) === before, "таблица по-прежнему не тронута");
    fs.unlinkSync(file);
  }

  /* ══ Сервер ══ */
  startServer();
  if (!(await waitHealth())) throw new Error("сервер не поднялся");
  const userId = await account();

  /* ══ R4. Связь языков ══════════════════════════════════════════════════ */
  console.log("\n■ R4. PATCH /auth/me: uiLocale ↔ genLang");
  {
    const me0 = await api("GET", "/auth/me");
    ok(me0.status === 200 && me0.json.user.uiLocale === null && me0.json.user.genLang === null, "новый пользователь: uiLocale и genLang — null", me0.json?.user);
    const r1 = await api("PATCH", "/auth/me", { uiLocale: "de" });
    ok(r1.status === 200 && r1.json.user.uiLocale === "de" && r1.json.user.genLang === "German", "uiLocale=de → ui_locale=de И gen_lang=German", r1.json);
    const [u1] = await sql`select ui_locale, gen_lang from users where id=${userId}`;
    ok(u1.ui_locale === "de" && u1.gen_lang === "German", "в БД то же", u1);
    const r2 = await api("PATCH", "/auth/me", { genLang: "French" });
    ok(r2.status === 200 && r2.json.user.uiLocale === "de" && r2.json.user.genLang === "French", "genLang=French → gen_lang=French, ui_locale не изменился (связь односторонняя)", r2.json);
    const r3 = await api("PATCH", "/auth/me", { uiLocale: "fr" });
    ok(r3.status === 400 && r3.json.code === "VALIDATION_ERROR" && typeof r3.json.details?.uiLocale === "string", "uiLocale=fr → 400 VALIDATION_ERROR + details.uiLocale", r3.json);
    const [u3] = await sql`select ui_locale, gen_lang from users where id=${userId}`;
    ok(u3.ui_locale === "de" && u3.gen_lang === "French", "после отказа ничего не записано", u3);
    const r4 = await api("PATCH", "/auth/me", { genLang: "   " });
    ok(r4.status === 400 && typeof r4.json.details?.genLang === "string", "genLang из пробелов → details.genLang");
    const r5 = await api("PATCH", "/auth/me", {});
    ok(r5.status === 400 && r5.json.details?.displayName, "пустое тело → 400 (хотя бы одно поле)");
    const r6 = await api("PATCH", "/auth/me", { displayName: "Иван", uiLocale: "en" });
    ok(r6.status === 200 && r6.json.user.displayName === "Иван" && r6.json.user.uiLocale === "en" && r6.json.user.genLang === "English", "displayName и uiLocale одним запросом; en → English");
    const me1 = await api("GET", "/auth/me");
    ok(me1.json.user.uiLocale === "en" && me1.json.user.genLang === "English", "GET /auth/me отдаёт оба поля");
  }

  /* ══ R5. Язык запроса ══════════════════════════════════════════════════ */
  console.log("\n■ R5. Язык ответов по ui_locale / cookie / Accept-Language");
  {
    // пользователь с ui_locale=en (поставлен в R4)
    const r = await api("PATCH", "/auth/me", {});
    ok(r.status === 400 && r.json.error === "Invalid data" && r.json.details.displayName === "Required field", "вошедший с ui_locale=en: сообщение об ошибке английское", r.json);
    const rRu = await api("PATCH", "/auth/me", {}, { "Accept-Language": "ru" });
    ok(rRu.json.error === "Invalid data", "ui_locale пользователя первее Accept-Language: ru", rRu.json);
    // гость
    const saved = cookie; cookie = "";
    const bad = { email: 42 };
    const g0 = await api("POST", "/auth/login", bad);
    ok(g0.status === 400 && g0.json.error === "Невалидные данные", "гость без заголовков — русское", g0.json);
    const gDe = await api("POST", "/auth/login", bad, { "Accept-Language": "de-DE,de;q=0.9" });
    ok(gDe.status === 400 && gDe.json.error === "Невалидные данные", "гость с Accept-Language: de — русское (немецкого перевода нет)", gDe.json);
    const gEn = await api("POST", "/auth/login", bad, { "Accept-Language": "fr, en;q=0.8" });
    ok(gEn.status === 400 && gEn.json.error === "Invalid data", "гость с Accept-Language: fr, en;q=0.8 — английское", gEn.json);
    const gCk = await api("POST", "/auth/login", bad, { "Accept-Language": "ru", Cookie: "ui_locale=en" });
    ok(gCk.json.error === "Invalid data", "cookie ui_locale=en первее Accept-Language: ru", gCk.json);
    const gBadCk = await api("POST", "/auth/login", bad, { Cookie: "ui_locale=xx" });
    ok(gBadCk.json.error === "Невалидные данные", "негодная cookie → умолчание");
    cookie = saved;
    // сброс языка пользователя на ru для дальнейших русских проверок
    const back = await api("PATCH", "/auth/me", { uiLocale: "ru" });
    ok(back.status === 200 && back.json.user.genLang === "Russian", "uiLocale=ru → gen_lang=Russian");
    ok((await api("PATCH", "/auth/me", {})).json.error === "Невалидные данные", "теперь сообщения русские");
  }

  /* ══ R7. Имена подстановок (до R6 — дёшево) ════════════════════════════ */
  console.log("\n■ R7. Говорящие имена подстановок");
  {
    const table = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/shared/i18n/strings.json"), "utf8"));
    const bad = [];
    for (const [k, r] of Object.entries(table.strings)) for (const p of Object.keys(r.params ?? {})) if (["value", "recs2", "lc2"].includes(p) || /\d$/.test(p)) bad.push(`${k}.${p}`);
    ok(bad.length === 0, "в strings.json нет value / recs2 / lc2 / имён с цифрой на конце", bad);
    ok(Object.keys(table.strings["adminPromptsPage.jsonErrorAt"].params).join() === "message,line,column", "jsonErrorAt: message, line, column");
    ok(Object.keys(table.strings["edit.editPlanPanel.recommendationRound"].params).join() === "nums,round", "recommendationRound: nums, round");
    ok(table.strings["adminPromptsPage.jsonErrorAt"].ru.includes("{line}") && table.strings["adminPromptsPage.jsonErrorAt"].en.includes("{column}"), "тексты ru/en переписаны под новые имена");
    const names = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/i18n/names.json"), "utf8"));
    ok(names.filter((n) => Array.isArray(n.params)).length === 32, "в names.json 32 записи с params");
    const dry = spawnSync("node", ["scripts/i18n/i18n-params.mjs", "--dry"], { cwd: ROOT, encoding: "utf8" });
    ok(dry.status === 0 && /переименовано строк 0, уже говорящих 32/.test(dry.stdout), "i18n:params идемпотентен (переименовано 0)", dry.stdout.slice(0, 200));
  }

  /* ══ R9. Д-16 ══════════════════════════════════════════════════════════ */
  console.log("\n■ R9. Д-16: переведённые data-section при совпадающем числе подразделов");
  let idEn;
  {
    idEn = await synthWithGraph(userId, { lang: "English", html: graphSection(EN_NAMES) });
    mock.calls = [];
    const g = await regenSub(idEn, "Таблица связей");
    if (!g) console.log("    генлог синтеза:", J(await sql`select section_key, log_type, source, status, created_at from generation_log where synthesis_id=${idEn}`));
    ok(g?.status === "done", "подраздел «Таблица связей» перегенерирован", g ? `${g.status}: ${g.error_message}` : "строки генлога нет");
    const c = mock.calls.at(-1);
    ok(c?.subsectionMode === true, "модель получила SYS одного подраздела");
    ok(c && /Парменид/.test(c.prompt) && /Category Table/.test(c.prompt), "intra-контекст НЕ пуст: несёт содержимое «Таблицы категорий» (атрибут «Category Table»)", (c?.prompt ?? "").slice(0, 300));
    const w = warningsOf(g);
    ok(w.some((x) => /подраздел 3 опознан по месту: атрибут "Edge Table" вместо "Таблица связей"/.test(x)), "генлог: предупреждение о самом подразделе", w);
    ok(w.some((x) => /intra-контекст: подраздел 2 опознан по месту: атрибут "Category Table"/.test(x)), "генлог: предупреждение о соседе intra-контекста", w);
    // SectionFull.parseWarnings
    const sec = await api("GET", `/syntheses/${idEn}/sections/graph`);
    ok(sec.status === 200 && Array.isArray(sec.json.section.parseWarnings) && sec.json.section.parseWarnings.length >= 2, "GET /sections/graph: parseWarnings непусты", sec.json?.section?.parseWarnings);
    ok(sec.json.section.parseWarnings.some((x) => /Edge Table/.test(x)), "parseWarnings несут предупреждение о подразделе");
    const secSum = await api("GET", `/syntheses/${idEn}/sections/sum`);
    ok(secSum.status === 200 && J(secSum.json.section.parseWarnings) === "[]", "раздел без генлога: parseWarnings = []");
    // индекс документа и рекомендация с каноническим адресом
    process.env.DATABASE_URL ??= DB_URL;
    const REC = await import("../server/services/recommendations.ts");
    const idRu = await synthWithGraph(userId, { lang: "English", html: graphSection(EN_NAMES) });
    const doc = await REC.loadDocumentIndex(idRu);
    ok(J(doc.subsectionsBySection.graph) === J(ORDER), "DocumentIndex.graph — КАНОНИЧЕСКИЕ имена при переведённых атрибутах", doc.subsectionsBySection.graph);
    ok(doc.actualNameOf("graph", "Таблица связей") === "Edge Table", "actualNameOf: канон → фактический атрибут");
    ok(doc.lookupWarnings.length >= 5, "предупреждения индекса — по каждому подразделу графа", doc.lookupWarnings.length);
    const src = doc.subsectionSource("graph", "Таблица связей");
    ok(typeof src === "string" && src.includes("снимается в"), "subsectionSource по каноническому имени читает переведённый подраздел");
    const raw = [{ position: 1, num: "1", address: "Таблица связей", element: "", op: "удалить", replacement: "", rationale: "тест", severity: "существенная" }];
    const g0 = REC.guardRows(raw, doc)[0];
    ok(g0 && g0.addressSection === "graph" && g0.addressSubsection === "Таблица связей", "рекомендация с каноническим адресом «Таблица связей» находит раздел graph", g0);
    ok(g0 && g0.status === "new" && g0.invalidReason === null, "строка не признана негодной", g0);
    ok(g0 && g0.sourceHash !== null, "хэш источника подраздела вычислен по фактическому атрибуту (не null)", g0);
    const g1 = REC.guardRows([{ ...raw[0], address: "Edge Table" }], doc)[0];
    ok(g1 && g1.status === "invalid", "адрес фактическим (переведённым) атрибутом — негоден: адреса канонические", g1);
    // импорт файла с «Category Table» — предупреждения в ответе
    const exp = await fetch(`${BASE}/syntheses/${idRu}/export/html`, { headers: { Cookie: cookie } });
    ok(exp.status === 200, "экспорт html для переимпорта");
    const html = await exp.text();
    const fd = new FormData();
    fd.append("file", new Blob([html], { type: "text/html" }), "t112.html");
    const imp = await fetch(`${BASE}/syntheses/import`, { method: "POST", headers: { Cookie: cookie }, body: fd });
    const impJ = await imp.json();
    if (impJ?.id) ids.push(impJ.id);
    ok(imp.status === 201 || imp.status === 200, "импорт принят", impJ);
    const gw = (impJ?.warnings ?? []).filter((x) => x.field === "graph");
    ok(gw.some((x) => /Таблица категорий/.test(x.message) && /не найден/.test(x.message)), "warnings.graph: «Таблица категорий» не найдена по data-section — категории не разобраны", impJ?.warnings);
    const [cnt] = await sql`select count(*)::int as n from categories where synthesis_id=${impJ?.id ?? "00000000-0000-0000-0000-000000000000"}`;
    ok(cnt.n === 0, "категорий у импортированной копии 0 — потеря названа, не скрыта");
  }

  /* ══ R8. Лог и промпты побайтово (worktree HEAD = код до codemod'а) ════ */
  console.log("\n■ R8. buildSYS(lang=Russian) и formatCtxLog до и после codemod'а");
  {
    const wt = path.join(os.tmpdir(), `ps-head-${Date.now()}`);
    const add = spawnSync("git", ["worktree", "add", "--detach", wt, "HEAD"], { cwd: ROOT, encoding: "utf8" });
    ok(add.status === 0, "git worktree HEAD (код до 11.2)", add.stderr);
    const inst = spawnSync("npm", ["install", "--no-audit", "--no-fund", "--prefer-offline"], { cwd: wt, encoding: "utf8", timeout: 300000 });
    ok(inst.status === 0, "npm install в worktree (в самом дереве, не ссылкой)", (inst.stderr ?? "").slice(-300));
    fs.copyFileSync(path.join(ROOT, ".env"), path.join(wt, ".env"));
    const dump = path.join(os.tmpdir(), `t112-dump-${Date.now()}.mjs`);
    fs.writeFileSync(dump, DUMP);
    const outA = dump + ".a.json", outB = dump + ".b.json";
    const run = (tree, out) => spawnSync(path.join(tree, "node_modules/.bin/tsx"), [dump, tree, idEn, out], { cwd: tree, encoding: "utf8", timeout: 120000, env: { ...process.env, DATABASE_URL: DB_URL } });
    const a = run(ROOT.replace(/\/$/, ""), outA), b = run(wt, outB);
    ok(fs.existsSync(outA) && fs.existsSync(outB), "оба дампа получены", (a.stderr ?? "").slice(-300) + (b.stderr ?? "").slice(-300));
    if (fs.existsSync(outA) && fs.existsSync(outB)) {
      const A = JSON.parse(fs.readFileSync(outA, "utf8")), B = JSON.parse(fs.readFileSync(outB, "utf8"));
      ok(A.ru === B.ru && A.ru.length > 500, `SYS (lang=Russian, раздел) побайтово тот же (${A.ru.length} знаков)`);
      ok(A.ruSub === B.ruSub, "SYS (lang=Russian, подраздел) побайтово тот же");
      ok(A.en === B.en, "SYS (lang=English) побайтово тот же");
      // единственная законная разница — строка «Дата: …» (время форматирования)
      const noDate = (t) => t.replace(/^Дата: .*$/m, "Дата: <снято>");
      ok(noDate(A.log) === noDate(B.log) && /РАЗБОР С ПОТЕРЯМИ/.test(A.log), "formatCtxLog синтеза с предупреждениями побайтово тот же (кроме строки «Дата»)", A.log.length + " / " + B.log.length);
    }
    spawnSync("git", ["worktree", "remove", "--force", wt], { cwd: ROOT });
    for (const f of [dump, outA, outB]) try { fs.unlinkSync(f); } catch {}
  }

  /* ══ R6. Codemod: сторожа, типы, аудит, зеркала ═══════════════════════ */
  console.log("\n■ R6. check:integration / typecheck / audit после codemod'а");
  {
    stopServer(); await sleep(500);
    const ic = spawnSync("npm", ["run", "check:integration", "-w", "server"], { cwd: ROOT, encoding: "utf8", timeout: 400000, env: { ...process.env, RATE_LIMIT_HTTP_PER_MINUTE: "100000" } });
    ok(ic.status === 0 && /INTEGRATION OK \(11\.2: 2al\/4aw\/5aj\)/.test(ic.stdout), "check:integration зелёный (2al/4aw/5aj)", (ic.stdout + ic.stderr).split("ПРОБЛЕМЫ")[1]?.slice(0, 600));
    const tc = spawnSync("npm", ["run", "typecheck"], { cwd: ROOT, encoding: "utf8", timeout: 400000 });
    ok(tc.status === 0, "typecheck — 0 ошибок", (tc.stdout ?? "").slice(-400));
    const au = spawnSync("npm", ["run", "audit", "-w", "server"], { cwd: ROOT, encoding: "utf8", timeout: 120000 });
    ok(au.status === 0 && /расхождений не найдено/.test(au.stdout), "audit чист", (au.stdout ?? "").slice(-300));
    const modeUi = fs.readFileSync(path.join(ROOT, "client/src/components/modes/ModeModal.tsx"), "utf8");
    const block = modeUi.slice(modeUi.indexOf("export const MODE_UI"), modeUi.indexOf("export function", modeUi.indexOf("export const MODE_UI")));
    ok(/title:\s*"⚔ Оппонент"/.test(block) && !/\btl\(/.test(block), "MODE_UI остался литералами (без tl)");
    const dh = fs.readFileSync(path.join(ROOT, "client/src/components/document/DocumentHeader.tsx"), "utf8");
    const sf = dh.slice(dh.indexOf("function subtitleFor("), dh.indexOf("\n}\n", dh.indexOf("function subtitleFor(")));
    ok(/"Свободный синтез \(на основе зерна\)"/.test(sf) && /"На основе: "/.test(sf) && !/\btl\(/.test(sf), "подзаголовок документа остался литералами (без tl)");
    const ms = fs.readFileSync(path.join(ROOT, "server/services/mode-service.ts"), "utf8");
    const mc = ms.slice(ms.indexOf("export const MODE_CONFIG"), ms.indexOf("export const MODE_KEYS"));
    ok(/title:\s*"⚔ Оппонент"/.test(mc) && !/\btl\(/.test(mc), "MODE_CONFIG сервера остался литералами (зеркало найдено сверх текста запроса)");
    const chk = spawnSync("node", ["scripts/i18n/i18n-check.mjs"], { cwd: ROOT, encoding: "utf8" });
    ok(/литералы с ключом — codemod не применён: 1\n\s+client\/src\/components\/synthesis\/PauseModal\.tsx/.test(chk.stdout) && /литералы без ключа — дополнить names\.json: 0/.test(chk.stdout), "i18n:check: единственный литерал с ключом — PauseModal (JSX в подстановке, 11.3), без ключа — 0", chk.stdout.slice(-600));
    const split = spawnSync("node", ["scripts/i18n/i18n-split.mjs", "--check"], { cwd: ROOT, encoding: "utf8" });
    ok(split.status === 0, "generated/* ≡ нарезке strings.json", split.stdout);
  }
} catch (e) {
  failed++;
  console.error("✗ СЦЕНАРИЙ ОБОРВАН:", e);
} finally {
  stopServer();
  try { for (const id of ids) await sql`delete from syntheses where id=${id}`; } catch {}
  try { await sql`delete from users where email like 't112-%@example.com'`; } catch {}
  mockSrv.closeAllConnections?.(); mockSrv.close();
  await sql.end({ timeout: 2 }).catch(() => {});
}
console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗`);
process.exit(failed ? 1 : 0);
