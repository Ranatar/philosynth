/**
 * Беседа 18.1 — тестовые запросы 2–4 одним заходом (сервер поиска концепций).
 * Живой сервер :3000 + мок Claude В ПРОЦЕССЕ ХАРНЕССА (нужен одной
 * трансформации) + PG16/Redis; браузер не нужен (беседа серверная). Всё — по
 * HTTP, как клиент: регистрация, импорт, правки, поиск.
 *
 * Документы: живой импорт файла-образца sample/*.html (русский) и двух его
 * вариантов — английского и немецкого. Вариант — тот же файл с заменой
 * языка генерации, названия, зерна, одного предложения капсулы, имени одной
 * категории и одного термина; разбор и индекс делает сам импорт.
 *
 *  R2  Поля и языки: название, зерно, содержание на трёх языках (русский
 *      запрос находит словоформы, английский — английские, немецкий —
 *      немецкие, и не чужие); опечатка — по триграммам; точный термин →
 *      концепция и id термина (тот же id отдаёт GET /glossary); фильтры
 *      философов all/any и direct/lineage, эпоха, метод, уровень, язык,
 *      мета, потомки, статус, дата — по одному и вместе; порядок, страницы.
 *  R3  Видимость: чужое приватное не находится ни одним полем ни в одном
 *      списке; участник находит приватное, где он участник (после принятия
 *      приглашения — всеми полями, до — только по названию); витрина — по
 *      названию, зерну и капсуле, но не по категории, термину, определению;
 *      гость — только публичное, без стоимости; смена ступени видна сразу.
 *  R4  Свежесть: правка категории, правка и удаление термина (15.2),
 *      трансформация тезисы → граф (мок) и её откат, импорт, копия, правка
 *      капсулы и названия — поиск видит новое сразу после ответа операции;
 *      сбой пересчёта (запись в индекс запрещена на уровне базы) правку не
 *      роняет, сбой — в журнале сервера, `npm run search:reindex` чинит;
 *      концепция без строки индекса находится по подстроке названия и
 *      фильтрам, `search:reindex --missing` её дописывает.
 *
 * Запуск (≈ 1 мин): node_modules/.bin/tsx tests/test-181-requests2-4.mjs [R2 R3 R4]
 * Предпосылки: PG16 + Redis, миграции (до 0020) и сиды; лог сервера —
 * /tmp/t181-server.log.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, readdirSync } from "node:fs";
import http from "node:http";
import postgres from "postgres";

const ONLY = process.argv.slice(2);
const want = (r) => ONLY.length === 0 || ONLY.includes(r);
const ROOT = new URL("../", import.meta.url).pathname;
const FILE = ROOT + "sample/" + readdirSync(ROOT + "sample").find((f) => f.endsWith(".html"));
const PORT = 3000, MOCK_PORT = 3981;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const SERVER_LOG = "/tmp/t181-server.log";
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 1300) : ""}`); }
}
const TAG = Math.random().toString(36).slice(2, 7).replace(/[0-9]/g, "x");

const { PHILOSOPHER_EPOCHS } = await import("@philosynth/shared/constants/philosophers");

/* ── Мок Claude: единственный вызов харнесса — трансформация тезисы → граф;
      ответ — раздел графа документа с переименованной категорией ── */
const mock = { calls: 0, graphHtml: "" };
const mockSrv = http.createServer((req, res) => {
  let body = ""; req.on("data", (d) => (body += d));
  req.on("end", () => {
    mock.calls++;
    const text = mock.graphHtml || "<p>мок без раздела</p>";
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 1000 } } });
    for (let i = 0; i < text.length; i += 4000) send({ type: "content_block_delta", delta: { type: "text_delta", text: text.slice(i, i + 4000) } });
    send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2000 } });
    send({ type: "message_stop" }); res.end();
  });
});
await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));

const procs = [];
function sp(args, cwd, env, logFile) {
  const log = openSync(logFile, "w");
  const p = spawn(process.execPath, args, { cwd, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...env } });
  procs.push(p);
  return p;
}
async function isUp(url) { try { return (await fetch(url)).status < 500; } catch { return false; } }
async function waitUp(url, what) { for (let i = 0; i < 120; i++) { if (await isUp(url)) return; await sleep(500); } throw new Error(`${what} не поднялся: ${url}`); }

function client(cookie) {
  const api = async (method, p, body) => {
    const headers = cookie ? { Cookie: cookie } : {};
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = J(body); }
    const r = await fetch(BASE + p, { method, headers, body: payload });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  };
  return { api, cookie };
}
const qs = (o) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) u.append(k, String(x));
  return u.toString();
};
const search = (user, o) => user.api("GET", `/syntheses/search?${qs(o)}`);
const ids = (r) => (r.json?.items ?? []).map((i) => i.id);
const item = (r, id) => (r.json?.items ?? []).find((i) => i.id === id);
const hits = (it) => (it?.fragment?.parts ?? []).filter((p) => p.hit).map((p) => p.text).join("|");
const has = async (user, o, id) => ids(await search(user, o)).includes(id);
/** Найдено СЛОВАРЁМ (не запасным ходом по похожим словам). */
const hasFts = async (user, o, id) => { const r = await search(user, o); return r.json?.match !== "fuzzy" && ids(r).includes(id); };

const userIds = [];
const PW = "password-181";
async function account(tag, name) {
  const email = `t181-${tag}-${TAG}-${Date.now()}@example.com`;
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: PW, displayName: name ?? tag }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: PW }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  userIds.push(u.id);
  return { ...client(cookie), id: u.id, email, name: name ?? tag };
}
async function importHtml(user, html, name) {
  const fd = new FormData(); fd.append("file", new Blob([html], { type: "text/html" }), name);
  const imp = await user.api("POST", "/syntheses/import", fd);
  if (imp.status !== 200 && imp.status !== 201) throw new Error("импорт: " + imp.text.slice(0, 300));
  return imp.json.id;
}
/** Вариант образца на другом языке — заменой текста; каждая замена обязана сработать. */
function variant(html, lang, pairs) {
  let out = html;
  if (out.split('"lang": "Russian"').length !== 2) throw new Error("в образце нет единственной отметки языка");
  out = out.replace('"lang": "Russian"', `"lang": "${lang}"`);
  for (const [from, to] of pairs) {
    if (!out.includes(from)) throw new Error(`в образце нет «${from.slice(0, 50)}»`);
    out = out.split(from).join(to);
  }
  return out;
}
/** Концепция без документа — для фильтров родословной (SQL: генерация не нужна). */
async function bare(user, o) {
  const [s] = await sql`insert into syntheses (user_id, title, seed, lang, method, synth_level, status, visibility, created_at)
    values (${user.id}, ${o.title}, ${o.seed ?? ""}, ${o.lang ?? "Russian"}, ${o.method ?? "dialectical"}, ${o.level ?? "comparative"}, ${o.status ?? "ready"}, ${o.visibility ?? "private"}, ${o.createdAt ?? new Date().toISOString()}::timestamptz) returning id`;
  let pos = 0;
  for (const n of o.philosophers ?? []) await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_name, position) values (${s.id}, 'philosopher', ${n}, ${pos++})`;
  for (const p of o.parents ?? []) await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${s.id}, 'synthesis', ${p}, ${pos++})`;
  return s.id;
}
const reindexCli = (...args) => spawnSync("npm", ["run", "search:reindex", "--", ...args], { cwd: ROOT, encoding: "utf8", env: { ...process.env, DATABASE_URL: DB_URL } });
const serverLog = () => readFileSync(SERVER_LOG, "utf8");
const patchJson = (user, p, body) => user.api("PATCH", p, body);

const EN = { title: `The Containing Rift ${TAG}`, seed: "Are archetypes possible without a rift, and what can fill the rift once it is there", capsule: "The ruptures of the psyche are not healed but inhabited", category: "Ontological Violence", term: "Readiness for Rupture" };
const DE = { title: `Der umfassende Riss ${TAG}`, seed: "Sind Archetypen ohne den Bruch denkbar, und womit lässt sich der Bruch füllen", capsule: "Die Brüche der Seele werden nicht geheilt, sondern bewohnt", category: "Ontologische Gewalt", term: "Bereitschaft zum Bruch" };
let constraintOn = false;

try {
  if (!existsSync(FILE)) throw new Error("файл-образец не найден: " + FILE);
  if (await isUp(`${BASE}/health`)) throw new Error(`сервер :${PORT} уже отвечает — чужой процесс`);
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "sk-ant-mock", NODE_ENV: "development" }, SERVER_LOG);
  await waitUp(`${BASE}/health`, "сервер");
  const O = await account("owner", "Владелец"), X = await account("str", "Чужой"), M = await account("mem", "Участник"), I = await account("inv", "Приглашённый");
  const G = client(null);

  const html = readFileSync(FILE, "utf8");
  const RU = await importHtml(O, html, `t181-ru-${TAG}.html`);
  const [ru] = await sql`select title, seed, lang from syntheses where id=${RU}`;
  const [ruIx] = await sql`select capsule_text from synthesis_search where synthesis_id=${RU}`;
  const ruCats = await sql`select id, name from categories where synthesis_id=${RU} order by position`;
  const ruTerms = await sql`select id, term, definition from glossary_terms where synthesis_id=${RU} order by position`;
  if (!ruIx) throw new Error("импорт не завёл строку индекса");
  // предложение капсулы без названия концепции — цель замены в вариантах
  const capSentence = ruIx.capsule_text.split(/(?<=[.!?])\s+/).map((s) => s.slice(0, 70)).find((s) => !s.includes(ru.title) && html.split(s).length === 2);
  const catName = ruCats.map((c) => c.name).find((n) => n === "Онтологическое насилие") ?? ruCats.at(-1).name;
  const termBase = "Матричная готовность к разрыву";
  if (!capSentence || !html.includes(termBase)) throw new Error("образец изменился: нет предложения капсулы либо термина для вариантов");
  const mk = (v, lang) => variant(html, lang, [[ru.title, v.title], [ru.seed, v.seed], [capSentence, v.capsule + ". " + capSentence], [catName, v.category], [termBase, v.term]]);
  const ENG = await importHtml(O, mk(EN, "English"), `t181-en-${TAG}.html`);
  const GER = await importHtml(O, mk(DE, "German"), `t181-de-${TAG}.html`);
  const langs = await sql`select s.id, s.lang, ss.config from syntheses s left join synthesis_search ss on ss.synthesis_id = s.id where s.id in ${sql([RU, ENG, GER])}`;
  const cfg = Object.fromEntries(langs.map((l) => [l.id, `${l.lang}/${l.config}`]));
  ok(cfg[RU] === "Russian/russian" && cfg[ENG] === "English/english" && cfg[GER] === "German/german", "подготовка: три импорта — три языка генерации, у каждого свой словарь индекса", cfg);

  /* ════ R2: поля, языки, опечатка, термин, фильтры ════ */
  if (want("R2")) {
    console.log("\n■ R2. Поля и языки, опечатка, точный термин, фильтры");
    const only = async (o, id) => { const r = await search(O, o); return ids(r).includes(id) && ids(r).filter((x) => [RU, ENG, GER].includes(x)).length === 1 ? r : null; };
    // название
    const tRu = await only({ q: "вмещающие разломы", field: "title" }, RU);
    const tEn = await only({ q: "rifts containing", field: "title" }, ENG);
    const tDe = await only({ q: "umfassenden Risse", field: "title" }, GER);
    ok(tRu && tEn && tDe && tRu.json.match === "fts" && hits(item(tRu, RU)).split("|").length === 2 && /Rift/.test(hits(item(tEn, ENG))) && /Riss/.test(hits(item(tDe, GER))), "название: словоформы на трёх языках, каждая находит только свою концепцию; подсвечены оба слова", [!!tRu, !!tEn, !!tDe, item(tRu ?? { json: {} }, RU)?.fragment]);
    // зерно
    const sRu = await only({ q: "архетипов разломами", field: "seed" }, RU);
    const sEn = await only({ q: "archetype rifts", field: "seed" }, ENG);
    const sDe = await only({ q: "Archetyp Brüche", field: "seed" }, GER);
    ok(sRu && sEn && sDe && [item(sRu, RU), item(sEn, ENG), item(sDe, GER)].every((i) => i.fragment.source === "seed" && hits(i).length > 0), "зерно: словоформы на трёх языках, фрагмент из зерна с подсветкой", [!!sRu, !!sEn, !!sDe]);
    // содержание: капсула
    const cRu = await search(O, { q: "аналитически пустые конструкции", field: "content" });
    const cEn = await only({ q: "rupture inhabit", field: "content" }, ENG);
    const cDe = await only({ q: "Bruch Seelen", field: "content" }, GER);
    ok(ids(cRu).includes(RU) && cEn && cDe && item(cEn, ENG).fragment.source === "capsule" && /ruptures/.test(hits(item(cEn, ENG))) && /Brüche/.test(hits(item(cDe, GER))), "содержание (капсула): русский запрос находит словоформы, английский — английские, немецкий — немецкие", [ids(cRu).length, !!cEn, !!cDe, item(cDe ?? { json: {} }, GER)?.fragment]);
    // содержание: категория и термин
    const kEn = await only({ q: "violence", field: "content" }, ENG);
    const kDe = await only({ q: "Gewalt", field: "content" }, GER);
    const kRu = await search(O, { q: "онтологического насилия", field: "content" });
    ok(kEn && kDe && ids(kRu).includes(RU) && !ids(kRu).includes(ENG) && !ids(kRu).includes(GER), "содержание (имя категории): на своём языке; переименованная в вариантах категория по-русски их не находит", [!!kEn, !!kDe, ids(kRu).length]);
    const dEn = await only({ q: "readiness ruptures", field: "content" }, ENG);
    ok(dEn && !!item(dEn, ENG).term?.id || (dEn && item(dEn, ENG).fragment.source === "capsule"), "содержание (термин): находится; при совпадении в термине выдача несёт его id", item(dEn ?? { json: {} }, ENG));
    // язык запроса неизвестен: один запрос — слова разных языков не смешиваются, но каждый язык находится своим
    ok(!(await has(O, { q: "Brüchen", field: "content" }, ENG)) && !(await has(O, { q: "ruptured", field: "content" }, GER)) && (await has(O, { q: "Brüchen", field: "content" }, GER)) && (await has(O, { q: "ruptured", field: "content" }, ENG)), "чужие словоформы чужую концепцию не находят (Brüchen — только немецкую, ruptured — только английскую)");
    // опечатки
    const zRu = await search(O, { q: "вмищающий розлом", field: "title" });
    const zEn = await search(O, { q: "containig rifft", field: "title" });
    const zDe = await search(O, { q: "umfasende Ris", field: "title" });
    const zC = await search(O, { q: "inhabeted rupteres", field: "content" });
    const zS = await search(O, { q: "Archetipen Bruhc", field: "seed" });
    ok([zRu, zEn, zDe, zC, zS].every((r) => r.json.match === "fuzzy") && ids(zRu).includes(RU) && ids(zEn).includes(ENG) && ids(zDe).includes(GER) && ids(zC).includes(ENG) && ids(zS).includes(GER) && hits(item(zEn, ENG)).length > 0, "опечатка — по триграммам: название на трёх языках, капсула, зерно; match = fuzzy, похожие слова подсвечены", [zRu.json.match, zEn.json.match, zDe.json.match, zC.json.match, zS.json.match, ids(zS).length]);
    const zNo = await search(O, { q: "феноменологическая редукция сознания", field: "title" });
    ok(zNo.json.total === 0, "постороннее не находится и запасным ходом", zNo.json.items?.map((i) => i.title));
    // точный термин
    const gl = (await O.api("GET", `/syntheses/${ENG}/glossary`)).json;
    const glTerms = Array.isArray(gl) ? gl : gl.terms ?? gl.items ?? [];
    const enTerm = glTerms.find((t) => t.term.startsWith(EN.term));
    const tm = await search(O, { q: EN.term.toUpperCase(), field: "term" });
    const tmFull = await search(O, { q: enTerm?.term ?? "—", field: "term" });
    const tmPart = await search(O, { q: "Readiness", field: "term" });
    const tmDe = await search(O, { q: DE.term.toLowerCase(), field: "term" });
    const tmRu = await search(O, { q: termBase, field: "term" });
    ok(!!enTerm && tm.json.match === "exact" && J(ids(tm)) === J([ENG]) && item(tm, ENG).term.id === enTerm.id && item(tmFull, ENG)?.term.id === enTerm.id && tmPart.json.total === 0 && J(ids(tmDe)) === J([GER]) && J(ids(tmRu)) === J([RU]) && item(tm, ENG).fragment.source === "term", "точный термин: без регистра, по имени и целиком со скобкой → концепция и id термина (тот же, что у GET /glossary); часть термина не находит", [enTerm?.term, ids(tm), tmPart.json.total, ids(tmDe), ids(tmRu)]);

    // фильтры: концепции без документа, родословная строками
    const A = await bare(O, { title: `Фильтр А ${TAG}`, philosophers: ["Кант", "Гегель"], method: "analytical", level: "transformative", createdAt: "2026-02-10T10:00:00Z" });
    const B = await bare(O, { title: `Фильтр Б ${TAG}`, philosophers: ["Кант", "Ницше"], method: "creative", status: "draft", createdAt: "2026-02-11T10:00:00Z" });
    const C = await bare(O, { title: `Фильтр В ${TAG}`, philosophers: ["Платон"], parents: [A], method: "analytical", lang: "English", createdAt: "2026-02-12T10:00:00Z" });
    const D = await bare(O, { title: `Фильтр Г ${TAG}`, parents: [C], createdAt: "2026-02-13T10:00:00Z" });
    const set = async (o) => ids(await search(O, { limit: 100, ...o })).filter((x) => [A, B, C, D].includes(x)).map((x) => ({ [A]: "А", [B]: "Б", [C]: "В", [D]: "Г" })[x]).sort().join("");
    const ep = (name) => PHILOSOPHER_EPOCHS.findIndex((e) => e.philosophers.includes(name));
    const f = {
      all: await set({ philosopher: ["Кант", "Гегель"] }),
      any: await set({ philosopher: ["Гегель", "Ницше"], philMode: "any" }),
      direct: await set({ philosopher: "Кант", philArea: "direct" }),
      lineage: await set({ philosopher: "Кант", philArea: "lineage" }),
      linAll: await set({ philosopher: ["Платон", "Гегель"], philArea: "lineage" }),
      linAny: await set({ philosopher: ["Платон", "Ницше"], philArea: "lineage", philMode: "any" }),
      epoch: await set({ epoch: ep("Платон") }),
      epochLin: await set({ epoch: ep("Платон"), philArea: "lineage" }),
      epoch2: await set({ epoch: [ep("Платон"), ep("Ницше")] }),
      method: await set({ method: "analytical" }),
      level: await set({ synthLevel: "transformative" }),
      lang: await set({ lang: "english" }),
      status: await set({ status: "draft" }),
      metaT: await set({ meta: "true" }),
      metaF: await set({ meta: "false" }),
      descA: await set({ descendantsOf: A }),
      descC: await set({ descendantsOf: C }),
      date: await set({ dateFrom: "2026-02-11", dateTo: "2026-02-12" }),
      combo: await set({ philosopher: "Кант", philArea: "lineage", method: "analytical", meta: "true", descendantsOf: A, dateFrom: "2026-02-12", q: "фильтр", field: "title" }),
      combo2: await set({ philosopher: ["Кант", "Ницше"], philMode: "any", status: "ready", meta: "false", epoch: ep("Гегель") }),
    };
    const expect = { all: "А", any: "АБ", direct: "АБ", lineage: "АБВГ", linAll: "ВГ", linAny: "БВГ", epoch: "В", epochLin: "ВГ", epoch2: "БВ", method: "АВ", level: "А", lang: "В", status: "Б", metaT: "ВГ", metaF: "АБ", descA: "ВГ", descC: "Г", date: "БВ", combo: "В", combo2: "А" };
    const diff = Object.keys(expect).filter((k) => f[k] !== expect[k]).map((k) => `${k}: «${f[k]}» ≠ «${expect[k]}»`);
    ok(diff.length === 0, "фильтры по одному и вместе: философы all/any × direct/lineage, эпоха (в обеих областях, две эпохи), метод, уровень, язык, статус, мета, потомки, дата", diff);
    const ls = await O.api("GET", `/lineage/search?${qs({ philosopher: ["Платон", "Гегель"] })}`);
    ok(ls.status === 200 && ls.json.syntheses.filter((s) => [A, B, C, D].includes(s.id)).map((s) => s.id).sort().join() === [C, D].sort().join(), "/lineage/search — как прежде и сходится с philArea=lineage&philMode=all");
    // мета-синтез из файла: образец несёт узел-концепцию дерева файла
    const mImp = await search(O, { meta: "true", limit: 100 });
    ok(ids(mImp).includes(RU) === item(await search(O, { q: ru.title, limit: 100 }), RU).hasConceptParents, "мета-фильтр сходится с признаком hasConceptParents у импортированного образца");
    // без индекса: фильтры и подстрока названия работают; --missing дописывает
    const noIx = (await sql`select count(*)::int n from synthesis_search where synthesis_id in ${sql([A, B, C, D])}`)[0].n;
    const subOnly = await has(O, { q: `льтр А ${TAG}` }, A);
    const cli = reindexCli("--missing");
    const afterIx = (await sql`select count(*)::int n from synthesis_search where synthesis_id in ${sql([A, B, C, D])}`)[0].n;
    ok(noIx === 0 && subOnly && cli.status === 0 && afterIx === 4 && (await has(O, { q: "фильтры", field: "title", method: "creative" }, B)), "концепция без строки индекса находится по подстроке названия и фильтрам; search:reindex --missing дописывает строки — после него находится и словоформа", [noIx, subOnly, cli.status, afterIx, (cli.stdout ?? "").slice(-200)]);
    // порядок и страницы
    const p1 = await search(O, { q: "фильтр", sort: "title", order: "asc", limit: 3, page: 1 }), p2 = await search(O, { q: "фильтр", sort: "title", order: "asc", limit: 3, page: 2 });
    const titles = [...p1.json.items, ...p2.json.items].map((i) => i.title);
    const byDate = await search(O, { q: "фильтр", sort: "createdAt", order: "asc" });
    ok(p1.json.total === 4 && p1.json.items.length === 3 && p2.json.items.length === 1 && J(titles) === J([`Фильтр А ${TAG}`, `Фильтр Б ${TAG}`, `Фильтр В ${TAG}`, `Фильтр Г ${TAG}`]) && J(ids(byDate)) === J([A, B, C, D]), "порядок (название, дата) и страницы; total по всем страницам", [p1.json.total, titles]);
    const bad = await search(O, { scope: "все", field: "тезис", q: "x", epoch: 99, meta: "да", dateTo: "вчера", synthLevel: "z" });
    const long = await search(O, { q: "я".repeat(201) });
    ok(bad.status === 400 && ["scope", "field", "epoch", "meta", "dateTo", "synthLevel"].every((k) => k in bad.json.details) && long.status === 400 && (await search(O, { q: "%_\\'\"; drop table syntheses; --", field: "title" })).status === 200 && (await search(O, { q: "((( ::: !!! &&& |||", field: "content" })).status === 200, "негодные параметры → 400 с перечнем; знаки подстановки, кавычки и синтаксис tsquery в тексте запроса — 200, не ошибка", [bad.status, long.status]);
  }

  /* ════ R3: видимость ════ */
  if (want("R3")) {
    console.log("\n■ R3. Видимость");
    const P = await importHtml(X, html, `t181-priv-${TAG}.html`); // приватная концепция Чужого
    const pTerms = await sql`select id, term, definition from glossary_terms where synthesis_id=${P} order by position`;
    const pCats = await sql`select name from categories where synthesis_id=${P} order by position`;
    // пробы по категории и определению — такие, которых НЕТ в капсуле (иначе витрина честно находится капсулой)
    const inCapsule = async (text) => (await sql`
      select (ss.capsule_tsv @@ (websearch_to_tsquery('russian', ${text}) || websearch_to_tsquery('simple', ${text})))
          or (select bool_and(word_similarity(w, ss.capsule_text) >= 0.4) from unnest(regexp_split_to_array(lower(${text}), '[^[:alnum:]]+')) w where length(w) >= 3) as hit
      from synthesis_search ss where ss.synthesis_id = ${P}`)[0].hit;
    let catProbe = null, defWords = null, defTerm = null;
    for (const c of pCats) if (!(await inCapsule(c.name))) { catProbe = c.name; break; }
    for (const t of pTerms) {
      const ws = t.definition.split(/\s+/).filter((w) => /^[а-яё]{7,}$/i.test(w));
      for (let i = 0; i + 1 < ws.length && !defWords; i++) if (!(await inCapsule(`${ws[i]} ${ws[i + 1]}`))) { defWords = `${ws[i]} ${ws[i + 1]}`; defTerm = t; }
      if (defWords) break;
    }
    if (!catProbe || !defWords || (await inCapsule(termBase))) throw new Error("образец: нет категории / определения / термина вне капсулы");
    const probes = [
      { q: "вмещающий разлом", field: "title" }, { q: "щающий раз", field: "title" }, { q: "вмищающий розлом", field: "title" },
      { q: "архетипы разлома", field: "seed" }, { q: "аналитически пустой конструкцией", field: "content" },
      { q: catProbe, field: "content" }, { q: termBase, field: "content" }, { q: defWords, field: "content" },
      { q: termBase, field: "term" }, { q: pTerms[0].term, field: "term" },
    ];
    const found = async (user, scopes = ["mine", "shared", "public"]) => {
      const out = [];
      for (const scope of scopes) for (const p of probes) { const r = await search(user, { ...p, scope, limit: 100 }); if (r.status === 200 && ids(r).includes(P)) out.push(`${scope}/${p.field}/${p.q.slice(0, 18)}`); }
      return out;
    };
    const ownerAll = await found(X, ["mine"]);
    ok(ownerAll.length === probes.length, "владелец находит свою приватную концепцию каждой пробой (все четыре поля, подстрока, опечатка)", [ownerAll.length, probes.length]);
    const leakO = await found(O), leakG = await found(G, ["public"]);
    const byFilter = ids(await search(O, { scope: "public", philosopher: "Юнг", limit: 100 })).includes(P) || ids(await search(O, { scope: "shared", limit: 100 })).includes(P);
    ok(leakO.length === 0 && leakG.length === 0 && !byFilter, "чужое приватное не находится ни одним полем ни в одном списке — ни вошедшему, ни гостю, ни по фильтру без текста", [leakO, leakG]);
    const desc = await search(O, { descendantsOf: P });
    ok(desc.status === 403, "чужая приватная как X фильтра потомков → 403", desc.status);

    // приглашение по HTTP: приглашённый до принятия — только название
    const inv1 = await X.api("POST", `/syntheses/${P}/members`, { email: M.email, role: "reviewer" });
    const inv2 = await X.api("POST", `/syntheses/${P}/members`, { email: I.email, role: "editor" });
    if (inv1.status !== 201 || inv2.status !== 201) throw new Error("приглашение: " + inv1.text.slice(0, 200) + inv2.text.slice(0, 200));
    const before = await found(M);
    const acc = await M.api("POST", `/syntheses/${P}/membership/accept`);
    const after = await found(M);
    const invited = await found(I);
    const titleOnly = (list) => list.length === 3 && list.every((x) => x.startsWith("shared/title/"));
    ok(acc.status === 200 && titleOnly(before) && titleOnly(invited) && after.length === probes.length && after.every((x) => x.startsWith("shared/")), "приглашённый до принятия находит приглашение только по названию (список «со мной»); после принятия участник находит приватное всеми полями — и только там", [acc.status, before, after.length, invited]);
    const mIt = item(await search(M, { q: termBase, field: "term", scope: "shared" }), P);
    const iIt = item(await search(I, { scope: "shared" }), P);
    ok(mIt?.myRole === "reviewer" && mIt.myStatus === "active" && !!mIt.term?.id && iIt?.myStatus === "invited" && !iIt.fragment, "выдача списка «со мной» несёт роль и статус участия", [mIt?.myRole, iIt?.myStatus]);
    // исключённый участник теряет находки сразу
    const mem = (await X.api("GET", `/syntheses/${P}/members`)).json;
    const mRow = (mem.members ?? mem).find((m) => m.user?.id === M.id || m.userId === M.id || m.email === M.email);
    const rm = await X.api("DELETE", `/syntheses/${P}/members/${mRow?.id}`);
    ok(rm.status === 200 && (await found(M)).length === 0, "исключённый участник перестаёт находить концепцию сразу (права — на каждом запросе)", [rm.status, mRow && Object.keys(mRow)]);

    // витрина
    const pv = await patchJson(X, `/syntheses/${P}`, { visibility: "showcase" });
    const show = await found(O);
    const wantShow = ["public/title/вмещающий разлом", "public/title/щающий раз", "public/title/вмищающий розлом", "public/seed/архетипы разлома", "public/content/аналитически пусто"];
    ok(pv.status === 200 && J(show) === J(wantShow), "витрина: находится по названию, зерну и капсуле; по категории, термину и определению (поля content и term) — нет", show);
    const showG = await found(G, ["public"]);
    const typoCat = await has(O, { q: catProbe.replace(/[аеио](?=[а-яё]{2})/, "ы"), field: "content", scope: "public" }, P);
    const sIt = item(await search(O, { q: "аналитически пустой конструкцией", field: "content", scope: "public" }), P);
    ok(J(showG) === J(wantShow) && !typoCat && sIt.fragment.source === "capsule" && !sIt.term && !!sIt.capsulePreview, "витрина гостю — то же; категория не находится и по опечатке; фрагмент — только из капсулы", [showG.length, typoCat, sIt?.fragment?.source]);
    // открытая
    const pf = await patchJson(X, `/syntheses/${P}`, { visibility: "full" });
    const fullO = await found(O), fullG = await found(G, ["public"]);
    ok(pf.status === 200 && fullO.length === probes.length && fullO.every((x) => x.startsWith("public/")) && fullG.length === probes.length, "открытая концепция ищется целиком — вошедшим и гостем; смена ступени видна поиску сразу", [fullO.length, fullG.length]);
    // гость
    const g1 = await search(G, { scope: "mine" }), g2 = await search(G, { scope: "shared" }), g3 = await search(G, { q: "вмещающий" });
    const uIt = item(await search(O, { q: "вмещающий", scope: "public" }), P);
    ok(g1.status === 401 && g2.status === 401 && g1.json.code === "AUTH_REQUIRED" && g3.status === 200 && g3.json.query.scope === "public" && ids(g3).includes(P) && !ids(g3).includes(RU) && g3.json.items.every((i) => !("totalCostUsd" in i)) && "totalCostUsd" in uIt, "гость: только публичное (свои и «со мной» → 401), превью без стоимости; вошедшему стоимость видна; приватная Владельца гостю не видна", [g1.status, g2.status, g3.status]);
    const back = await patchJson(X, `/syntheses/${P}`, { visibility: "private" });
    ok(back.status === 200 && (await found(O)).length === 0 && (await found(G, ["public"])).length === 0, "возврат к приватной — находки исчезают сразу");
  }

  /* ════ R4: свежесть ════ */
  if (want("R4")) {
    console.log("\n■ R4. Свежесть индекса");
    const S = await importHtml(O, html, `t181-fresh-${TAG}.html`);
    ok(await has(O, { q: "аналитически пустые конструкции", field: "content" }, S) && await has(O, { q: termBase, field: "term" }, S), "импорт: концепция находится по содержанию и термину сразу после ответа импорта");
    const cats = await sql`select id, name from categories where synthesis_id=${S} order by position`;
    const terms = await sql`select id, term from glossary_terms where synthesis_id=${S} order by position`;
    // правка категории
    const c0 = cats.find((c) => c.name === "Онтологическое насилие") ?? cats[0];
    const pc = await patchJson(O, `/syntheses/${S}/categories/${c0.id}`, { name: "Ксенологическое гостеприимство" });
    ok(pc.status === 200 && await has(O, { q: "ксенологического гостеприимства", field: "content" }, S), "правка категории: новое имя находится сразу", [pc.status, pc.text.slice(0, 200)]);
    // правка и удаление термина
    const t0 = terms.at(-1);
    const pt = await patchJson(O, `/syntheses/${S}/glossary/${t0.id}`, { term: "Кенозис формы (проба)" });
    const tHit = item(await search(O, { q: "кенозис формы", field: "term" }), S);
    const oldGone = !(await has(O, { q: t0.term, field: "term" }, S));
    const del = await O.api("DELETE", `/syntheses/${S}/glossary/${t0.id}`);
    const goneT = (await search(O, { q: "кенозис формы", field: "term" })).json.total, goneC = !(await has(O, { q: "кенозис", field: "content" }, S));
    ok(pt.status === 200 && tHit?.term?.id === t0.id && oldGone && del.status === 200 && goneT === 0 && goneC, "правка термина: новый находится точно (тот же id), прежний — нет; удаление термина (15.2): исчез из поиска сразу", [pt.status, del.status, goneT, goneC]);
    // капсула и название
    const full = (await O.api("GET", `/syntheses/${S}`)).json;
    const capHtml = (full.synthesis ?? full).capsuleHtml;
    const pcap = await patchJson(O, `/syntheses/${S}/capsule`, { html: capHtml.replace(/<\/p>/, " Апофатическая пробность капсулы.</p>") });
    const capOk = pcap.status === 200 ? await has(O, { q: "апофатической пробности", field: "content" }, S) : null;
    const ptitle = await patchJson(O, `/syntheses/${S}`, { title: `Палимпсест ${TAG}` });
    ok(pcap.status === 200 && capOk && ptitle.status === 200 && await has(O, { q: "палимпсесты" }, S) && !(await has(O, { q: "вмещающий разлом", field: "title" }, S)), "правка капсулы и названия видны поиску сразу; прежнее название не находится", [pcap.status, pcap.text.slice(0, 200), capOk, ptitle.status]);
    // трансформация тезисы → граф (мок) и откат
    const [g] = await sql`select html_content from sections where synthesis_id=${S} and key='graph'`;
    const victim = cats.find((c) => c.id !== c0.id && g.html_content.includes(c.name)).name;
    mock.graphHtml = g.html_content.split(victim).join("Палингенезис скважины");
    const before = (await O.api("GET", `/syntheses/${S}/transforms`)).json.transforms.length;
    const tr = await O.api("POST", `/syntheses/${S}/transform/theses-to-graph`, {});
    let trRow = null;
    for (let i = 0; i < 150 && !trRow; i++) { await sleep(200); const list = (await O.api("GET", `/syntheses/${S}/transforms`)).json.transforms; if (list.length > before) trRow = list[0]; }
    for (let i = 0; i < 100; i++) { const st = (await sql`select status from syntheses where id=${S}`)[0].status; if (st === "ready") break; await sleep(100); }
    const trNew = await has(O, { q: "палингенезиса скважин", field: "content" }, S);
    const trOld = await has(O, { q: `"${victim}"`, field: "content" }, S) && item(await search(O, { q: `"${victim}"`, field: "content" }), S)?.fragment?.source === "category";
    ok(tr.status === 200 && !!trRow && mock.calls >= 1 && trNew && !trOld, "трансформация тезисы → граф: категории нового графа находятся сразу, имени заменённой категории среди категорий нет", [tr.status, tr.text.slice(0, 200), !!trRow, mock.calls, trNew, trOld]);
    if (trRow) {
      const rb = await O.api("POST", `/syntheses/${S}/transforms/${trRow.id}/rollback`);
      ok(rb.status === 200 && !(await hasFts(O, { q: "палингенезиса скважин", field: "content" }, S)) && await has(O, { q: "ксенологического гостеприимства", field: "content" }, S), "откат трансформации: прежние категории возвращаются в поиск, новые уходят", [rb.status, rb.text.slice(0, 200)]);
    }
    // копия
    const dup = await O.api("POST", `/syntheses/${S}/duplicate`);
    const dupId = dup.json?.id ?? dup.json?.synthesis?.id;
    const dupHit = await search(O, { q: "ксенологического гостеприимства", field: "content" });
    ok(dup.status < 300 && !!dupId && ids(dupHit).includes(dupId) && ids(dupHit).includes(S) && !(await has(X, { q: "ксенологического гостеприимства", field: "content", scope: "public" }, dupId)), "копия: находится по содержанию сразу; чужому — нет (копия приватна)", [dup.status, dupId]);
    // сбой пересчёта: запись в индекс запрещена базой
    await sql.unsafe(`ALTER TABLE synthesis_search ADD CONSTRAINT t181_block CHECK (indexed_at < '2000-01-01') NOT VALID`);
    constraintOn = true;
    const c1 = cats.find((c) => c.id !== c0.id);
    const f1 = await patchJson(O, `/syntheses/${S}/categories/${c1.id}`, { name: "Ятрогенная фьордовость" });
    const f2 = await patchJson(O, `/syntheses/${S}`, { title: `Сбойное имя ${TAG}` });
    const f3 = await O.api("DELETE", `/syntheses/${S}/glossary/${terms[0].id}`);
    await sql.unsafe(`ALTER TABLE synthesis_search DROP CONSTRAINT t181_block`);
    constraintOn = false;
    const [catNow] = await sql`select name from categories where id=${c1.id}`;
    const [sNow] = await sql`select title from syntheses where id=${S}`;
    const termGone = (await sql`select count(*)::int n from glossary_terms where id=${terms[0].id}`)[0].n === 0;
    const logged = (serverLog().match(/\[search-index\]/g) ?? []).length;
    const stale = !(await hasFts(O, { q: "ятрогенной фьордовости", field: "content" }, S));
    const bySub = await has(O, { q: "Сбойное имя" }, S);
    ok(f1.status === 200 && f2.status === 200 && f3.status === 200 && catNow.name === "Ятрогенная фьордовость" && sNow.title === `Сбойное имя ${TAG}` && termGone && logged >= 3 && stale && bySub, "сбой пересчёта правку не роняет: три операции — 200, записи на месте, три строки [search-index] в журнале сервера; индекс прежний, название находится подстрокой", [f1.status, f2.status, f3.status, logged, stale, bySub]);
    const fix = reindexCli("--synthesis", S);
    ok(fix.status === 0 && await has(O, { q: "ятрогенной фьордовости", field: "content" }, S) && await has(O, { q: "сбойные имена", field: "title" }, S) && !(await has(O, { q: terms[0].term, field: "term" }, S)), "npm run search:reindex --synthesis чинит индекс: новое находится, удалённый термин — нет", [fix.status, (fix.stdout ?? "").slice(-200)]);
    // удаление концепции
    const delS = await O.api("DELETE", `/syntheses/${dupId}`);
    ok(delS.status === 200 && (await sql`select count(*)::int n from synthesis_search where synthesis_id=${dupId}`)[0].n === 0 && !ids(await search(O, { q: "ксенологического гостеприимства", field: "content" })).includes(dupId), "удаление концепции уносит строку индекса", delS.status);
    // прежние списки
    const l1 = await O.api("GET", `/syntheses?${qs({ search: "Сбойное", sort: "title", order: "asc" })}`);
    const l2 = await G.api("GET", `/syntheses/public?${qs({ limit: 5 })}`);
    const l3 = await O.api("GET", "/syntheses/shared");
    ok(l1.status === 200 && l1.json.items.some((i) => i.id === S) && l2.status === 200 && Array.isArray(l2.json.items) && l3.status === 200 && Array.isArray(l3.json.items) && (await O.api("GET", `/syntheses/${S}`)).status === 200, "прежние списки (GET /syntheses, /public, /shared) и GET /syntheses/:id отвечают как раньше");
  }
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
} finally {
  console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch {} }
  mockSrv.close();
  try {
    if (constraintOn) await sql.unsafe(`ALTER TABLE synthesis_search DROP CONSTRAINT IF EXISTS t181_block`);
    for (const id of userIds) await sql`delete from sessions where user_id=${id}`;
    for (const id of userIds) await sql`delete from notifications where user_id=${id}`;
    for (const id of userIds) await sql`delete from api_usage where user_id=${id}`;
    for (const id of userIds) await sql`delete from transactions where user_id=${id}`;
    for (const id of userIds) await sql`delete from syntheses where user_id=${id}`;
    for (const id of userIds) await sql`delete from users where id=${id}`;
  } catch (e2) { console.error("уборка:", e2); }
  await Promise.race([sql.end(), sleep(2000)]);
  process.exit(failed ? 1 : 0);
}
