/**
 * Беседа 16.1 — тестовые запросы 2–4 одним заходом (серверный слой
 * обсуждения). Живой сервер :3000 + мок Claude В ПРОЦЕССЕ ХАРНЕССА
 * (перегенерация раздела возвращает заданный HTML — так граф и тезисы
 * пересоздаются с новыми id без модели) + PG16/Redis; браузер не нужен
 * (беседа серверная; клиент не тронут). Документ — живой импорт файла-
 * образца sample/*.html через POST /syntheses/import.
 *
 *  R2  Права живьём: владелец / рецензент / редактор / приглашённый / чужой
 *      зарегистрированный / гость на private, showcase, full — кто читает
 *      концепцию (GET /:id, /sections, /categories) и обсуждение; рецензент
 *      приватной читает её и комментирует; чужой — 403/404, в том числе по
 *      прямому id комментария и по id комментария под чужим синтезом;
 *      прочие маршруты (PATCH элемента, PATCH/DELETE/duplicate синтеза,
 *      рекомендации, lineage link, перегенерация) — владелец как прежде,
 *      участник и чужой — 403. Харнессы 13.2/15.x гоняются отдельно
 *      (см. «По факту»).
 *  R3  Адреса: комментарий к категории → перегенерация графа на моке
 *      (новые id) с изменённым описанием → outdated (currentId новый);
 *      перегенерация с прежним текстом → current; связь и тезис — после
 *      перегенерации найдены по ключу; удалённая категория → deleted;
 *      комментарий к подразделу → ручная правка подраздела → outdated,
 *      выдержка показывает прежний текст; раздел после перегенерации →
 *      outdated.
 *  R4  Комментарии и рецензии по HTTP: ветка ответов, resolve/reopen,
 *      скрытие владельцем, правка своего и запрет чужого; рецензия:
 *      черновик не виден другим, публикация, правка опубликованной —
 *      редакция с сохранённой прежней, отзыв; замечания с адресами;
 *      DELETE /auth/me автора → «удалённый пользователь», членство снято.
 *
 * Запуск (≈ 1 мин): node_modules/.bin/tsx tests/test-161-requests2-4.mjs [R2 R3 R4]
 * Предпосылки: PG16 + Redis, миграции (до 0017) и сиды; лог сервера —
 * /tmp/t161-server.log.
 */
import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, readdirSync } from "node:fs";
import http from "node:http";
import postgres from "postgres";

const ONLY = process.argv.slice(2);
const want = (r) => ONLY.length === 0 || ONLY.includes(r);
const ROOT = new URL("../", import.meta.url).pathname;
const FILE = process.env.T161_FILE ?? ROOT + "sample/" + readdirSync(ROOT + "sample").find((f) => f.endsWith(".html"));
const PORT = 3000, MOCK_PORT = 3961;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}
const TAG = Math.random().toString(36).slice(2, 7);

const SDB = await import("../server/services/section-defs-builder.ts");
const ADDR = await import("@philosynth/shared/utils/discussion-address");
const { closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");

/* ── Мок Claude: раздел целиком — заданный HTML (byKey) либо подразделы карты; подраздел — один ── */
const mock = { calls: 0, picked: [], map: {}, defs: [], byKey: {} };
const sub = (n, b) => `<div data-section="${n}"><h4>${n}</h4>\n${b}\n</div>`;
const mockSrv = http.createServer((req, res) => {
  let body = ""; req.on("data", (d) => (body += d));
  req.on("end", () => {
    mock.calls++;
    let prompt = "";
    try { const j = JSON.parse(body); const c = j.messages?.[0]?.content; prompt = typeof c === "string" ? c : J(c); } catch {}
    const task = prompt.slice(Math.max(0, prompt.lastIndexOf("ЗАДАНИЕ")));
    let text;
    const subM = prompt.match(/(Перегенерируй|Доработай|Заверши) ТОЛЬКО секцию:\s*\n\s*«([^»]+)»/);
    if (subM) { mock.picked.push(`(подраздел ${subM[2]})`); text = sub(subM[2], `<p>МОК: подраздел «${subM[2]}» написан заново.</p>`); }
    else {
      const def = mock.defs.find((d) => task.includes(`— ${d.title.toUpperCase()}`));
      mock.picked.push(def ? `(раздел ${def.key})` : "?");
      if (def && mock.byKey[def.key]) text = mock.byKey[def.key];
      else {
        const names = def ? (mock.map[def.key] ?? []) : [];
        text = names.length ? names.map((n) => sub(n, `<p>МОК: подраздел «${n}» раздела «${def.key}».</p>`)).join("\n") : "<p>Раздел не узнан моком.</p>";
      }
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (o) => res.write(`data: ${J(o)}\n\n`);
    send({ type: "message_start", message: { usage: { input_tokens: 1000 } } });
    for (let i = 0; i < text.length; i += 2000) send({ type: "content_block_delta", delta: { type: "text_delta", text: text.slice(i, i + 2000) } });
    send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2000 } });
    send({ type: "message_stop" }); res.end();
  });
});
await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));

/* ── Процессы ────────────────────────────────────────────────────────── */
const procs = [];
function sp(args, cwd, env, logFile) {
  const log = openSync(logFile, "w");
  const p = spawn(process.execPath, args, { cwd, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...env } });
  procs.push(p);
  return p;
}
async function isUp(url) { try { return (await fetch(url)).status < 500; } catch { return false; } }
async function waitUp(url, what) { for (let i = 0; i < 120; i++) { if (await isUp(url)) return; await sleep(500); } throw new Error(`${what} не поднялся: ${url}`); }

/* ── HTTP-клиенты ────────────────────────────────────────────────────── */
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
const guest = client(null);
const userIds = [];
const PW = "password-161";
async function account(tag, name) {
  const email = `t161-${tag}-${Date.now()}@example.com`;
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: PW, displayName: name ?? tag }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: PW }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  userIds.push(u.id);
  await sql`update users set balance_usd = 50 where id=${u.id}`;
  return { ...client(cookie), id: u.id, email, name: name ?? tag };
}
async function importLive(user) {
  const fd = new FormData(); fd.append("file", new Blob([readFileSync(FILE, "utf8")], { type: "text/html" }), `t161-${TAG}.html`);
  const imp = await user.api("POST", "/syntheses/import", fd);
  if (imp.status !== 200 && imp.status !== 201) throw new Error("импорт: " + imp.text.slice(0, 300));
  return imp.json.id;
}
async function armMock(id) {
  const [row] = await sql`select method, synth_level, depth, generation_order, ext_graph_metrics, lang, section_order, seed, context from syntheses where id=${id}`;
  const phils = (await sql`select parent_name from synthesis_lineage where synthesis_id=${id} and parent_type='philosopher' order by position`).map((r) => r.parent_name);
  const p = { seed: row.seed, phil: phils, participants: phils.map((name) => ({ type: "philosopher", name })), sec: row.section_order.filter((k) => k !== "sum"), method: row.method, synthLevel: row.synth_level, depth: row.depth, generationOrder: row.generation_order, extGraphMetrics: row.ext_graph_metrics, ctx: row.context, lang: row.lang };
  mock.map = await SDB.buildSubsectionMap(p);
  mock.defs = await SDB.buildSectionDefs(p);
}
const member = (S, u, role, status = "active") => sql`insert into synthesis_members (synthesis_id, user_id, role, status, invited_by, accepted_at) values (${S}, ${u.id}, ${role}, ${status}, null, ${status === "active" ? new Date() : null})`;
const setVis = (S, v) => sql`update syntheses set visibility=${v} where id=${S}`;
const secHtml = async (id, key) => (await sql`select html_content h from sections where synthesis_id=${id} and key=${key}`)[0]?.h ?? "";
const waitIdle = async (user, id) => { for (let i = 0; i < 150; i++) { const g = await user.api("GET", `/syntheses/${id}`); if (g.json?.synthesis?.status === "ready") return g.json.synthesis; await sleep(300); } throw new Error("синтез не вернулся в ready"); };
async function regen(user, id, key) {
  const since = new Date();
  const rg = await user.api("POST", `/syntheses/${id}/regenerate/${key}`, {});
  if (rg.status !== 200) throw new Error(`regenerate/${key}: ${rg.status} ${rg.text.slice(0, 200)}`);
  for (let i = 0; i < 300; i++) {
    const [g] = await sql`select status from generation_log where synthesis_id=${id} and section_key=${key} and log_type='generation' and created_at > ${since} order by created_at desc limit 1`;
    if (g && g.status !== "streaming") break;
    await sleep(300);
  }
  return waitIdle(user, id);
}
const findC = (list, id) => list.json?.comments?.find((c) => c.id === id);

/* ══ Прогон ═════════════════════════════════════════════════════════════ */
try {
  if (!existsSync(FILE)) throw new Error("файл-образец не найден: " + FILE);
  if (await isUp(`${BASE}/health`)) throw new Error(`сервер :${PORT} уже отвечает — чужой процесс`);
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", BILLING_ENFORCE: "false", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-161", STREAM_RETRY_DELAYS: "50" }, "/tmp/t161-server.log");
  await waitUp(`${BASE}/health`, "сервер");
  const O = await account("owner", "Владелец"), R = await account("rev", "Рецензент"), E = await account("ed", "Редактор"), I = await account("inv", "Приглашённый"), X = await account("str", "Чужой");

  /* ════ R2 ════ */
  if (want("R2")) {
    console.log("\n■ R2: права живьём — владелец / рецензент / редактор / приглашённый / чужой / гость");
    const S = await importLive(O);
    const S2 = await importLive(X); // чужой синтез — для проверки «по знанию id»
    await member(S, R, "reviewer"); await member(S, E, "editor"); await member(S, I, "reviewer", "invited");
    const [cat] = await sql`select id, name from categories where synthesis_id=${S} order by name limit 1`;
    const who = { O, R, E, I, X, G: guest };
    const probe = async (S) => {
      const out = {};
      for (const [k, u] of Object.entries(who)) {
        const g = await u.api("GET", `/syntheses/${S}`), sec = await u.api("GET", `/syntheses/${S}/sections`), cats = await u.api("GET", `/syntheses/${S}/categories`), cm = await u.api("GET", `/syntheses/${S}/comments`);
        out[k] = { doc: g.status, role: g.json?.synthesis?.capabilities?.role ?? null, caps: g.json?.synthesis?.capabilities ?? null, isOwner: g.json?.synthesis?.isOwner ?? null, docSections: Array.isArray(g.json?.synthesis?.sections) ? g.json.synthesis.sections.length : null, sec: sec.status, cats: cats.status, cm: cm.status };
      }
      return out;
    };
    // private
    let p = await probe(S);
    ok(p.O.doc === 200 && p.O.isOwner === true && p.O.role === "owner" && p.O.caps.edit && p.O.caps.manage && p.O.sec === 200 && p.O.cm === 200, "private: владелец — всё (owner, edit, manage, разделы, обсуждение)", p.O);
    ok(p.R.doc === 200 && p.R.isOwner === false && p.R.role === "reviewer" && p.R.caps.discuss && !p.R.caps.edit && !p.R.caps.manage && p.R.sec === 200 && p.R.cats === 200 && p.R.cm === 200, "private: рецензент читает концепцию целиком и обсуждение, isOwner=false, edit=false", p.R);
    ok(p.E.doc === 200 && p.E.role === "editor" && p.E.caps.discuss && !p.E.caps.edit && p.E.sec === 200 && p.E.cm === 200, "private: редактор — как рецензент (edit=false до 17.1)", p.E);
    ok(p.I.doc === 403 && p.I.sec === 403 && p.I.cm === 403 && p.X.doc === 403 && p.X.sec === 403 && p.X.cats === 403 && p.X.cm === 403, "private: приглашённый (не принял) и чужой — 403 везде", { I: p.I, X: p.X });
    ok(p.G.doc === 403 && p.G.sec === 401 && p.G.cm === 401, "private: гость — 403 документ, 401 на requireAuth-маршрутах", p.G);
    // рецензент комментирует приватную; чужой — нет
    const c1 = await R.api("POST", `/syntheses/${S}/comments`, { target: { kind: "category", key: cat.name }, body: "замечание рецензента", kind: "objection" });
    ok(c1.status === 201 && c1.json.address.id === cat.id && c1.json.author.name === "Рецензент", "рецензент приватной комментирует категорию по имени (201, адрес с id)", c1.json);
    const cx = await X.api("POST", `/syntheses/${S}/comments`, { target: { kind: "category", key: cat.name }, body: "чужой" });
    const cg = await guest.api("POST", `/syntheses/${S}/comments`, { target: { kind: "category", key: cat.name }, body: "гость" });
    ok(cx.status === 403 && cx.json.code === "FORBIDDEN" && cg.status === 401, "чужой → 403 FORBIDDEN, гость → 401 на создании", { cx: cx.status, cg: cg.status });
    // по прямому id комментария
    const cid = c1.json.id;
    const direct = await Promise.all([
      X.api("PATCH", `/syntheses/${S}/comments/${cid}`, { body: "x" }), X.api("DELETE", `/syntheses/${S}/comments/${cid}`), X.api("POST", `/syntheses/${S}/comments/${cid}/resolve`), X.api("POST", `/syntheses/${S}/comments/${cid}/hide`),
      X.api("GET", `/syntheses/${S}/comments?author=${R.id}`), X.api("GET", `/syntheses/${S}/discussion/summary`), X.api("GET", `/syntheses/${S}/reviews`),
    ]);
    ok(direct.every((r) => r.status === 403), "чужой по прямому id комментария (PATCH/DELETE/resolve/hide), список, сводка, рецензии → 403", direct.map((r) => r.status));
    const viaOther = await Promise.all([X.api("PATCH", `/syntheses/${S2}/comments/${cid}`, { body: "x" }), X.api("DELETE", `/syntheses/${S2}/comments/${cid}`), X.api("POST", `/syntheses/${S2}/comments/${cid}/resolve`), X.api("POST", `/syntheses/${S2}/comments`, { parentId: cid, body: "ответ через свой синтез" })]);
    ok(viaOther.every((r) => r.status === 404), "id комментария под СВОИМ синтезом чужого → 404 (объекты обсуждения ищутся только в родительском синтезе)", viaOther.map((r) => r.status));
    const [still] = await sql`select body, status, deleted_at from comments where id=${cid}`;
    ok(still.body === "замечание рецензента" && still.status === "open" && still.deleted_at === null, "комментарий цел после попыток чужого");
    // участники не правят, чужие — тем более; владелец — как прежде
    const edits = async (u) => Promise.all([
      u.api("PATCH", `/syntheses/${S}/categories/${cat.id}`, { definition: "правка " + TAG }), u.api("PATCH", `/syntheses/${S}`, { title: "t" }), u.api("DELETE", `/syntheses/${S}`), u.api("POST", `/syntheses/${S}/duplicate`),
      u.api("GET", `/syntheses/${S}/recommendations`), u.api("POST", `/syntheses/${S}/lineage/link`, { parentName: "Чужая", parentSynthesisId: S2 }), u.api("POST", `/syntheses/${S}/regenerate/sum`, {}), u.api("GET", `/syntheses/${S}/logs/generation`),
    ]);
    const eR = await edits(R), eE = await edits(E), eX = await edits(X);
    ok(eR.slice(0, 7).every((r) => r.status === 403) && eE.slice(0, 7).every((r) => r.status === 403) && eR[7].status === 403 && eE[7].status === 403 && (await O.api("GET", `/syntheses/${S}/logs/generation`)).status === 200, "рецензент и редактор: PATCH категории/синтеза, DELETE, duplicate, рекомендации, lineage link, перегенерация → 403; логи приватной — по флагам 8.6 (private → 403 участнику, 200 владельцу)", { R: eR.map((r) => r.status), E: eE.map((r) => r.status) });
    ok(eX.slice(0, 7).every((r) => r.status === 403), "чужой: те же маршруты → 403 (как до беседы)", eX.map((r) => r.status));
    const oCat = await O.api("PATCH", `/syntheses/${S}/categories/${cat.id}`, { definition: "правка владельца " + TAG });
    const oTitle = await O.api("PATCH", `/syntheses/${S}`, { title: "Заглавие " + TAG });
    const oRec = await O.api("GET", `/syntheses/${S}/recommendations`);
    const oDup = await O.api("POST", `/syntheses/${S}/duplicate`);
    ok(oCat.status === 200 && oTitle.status === 200 && [200, 404].includes(oRec.status) && oDup.status === 201, "владелец: PATCH категории 200, PATCH синтеза 200, рекомендации 200/404, копия 201 (как до беседы)", { oCat: oCat.status, oTitle: oTitle.status, oRec: oRec.status, oDup: oDup.status });
    const dupMembers = await sql`select count(*)::int n from synthesis_members where synthesis_id=${oDup.json.id}`;
    const dupComments = await sql`select count(*)::int n from comments where synthesis_id=${oDup.json.id}`;
    ok(dupMembers[0].n === 0 && dupComments[0].n === 0, "копия синтеза без участников и без обсуждения (протокол: обсуждение в копию не кладётся)");
    const exp = await O.api("GET", `/syntheses/${S}/export/html`);
    ok(exp.status === 200 && !/замечание рецензента/.test(exp.text), "выгрузка HTML без текстов обсуждения", exp.status);
    // showcase
    await setVis(S, "showcase");
    p = await probe(S);
    ok(p.X.doc === 200 && p.X.role === "reader" && p.X.caps.read && !p.X.caps.discuss && p.X.sec === 403 && p.X.cats === 403 && p.X.cm === 403, "showcase: чужой — шапка (reader), содержание 403, обсуждение 403", p.X);
    ok(p.R.doc === 200 && p.R.sec === 200 && p.R.cats === 200 && p.R.cm === 200 && p.I.sec === 403 && p.I.cm === 403, "showcase: рецензент — целиком и обсуждение; приглашённый — как чужой", { R: p.R, I: p.I });
    ok(p.G.doc === 200 && p.G.role === "guest" && !p.G.caps.read === false && p.G.sec === 401 && p.G.cm === 401, "showcase: гость — шапка (role guest, read), остальное 401", p.G);
    // full
    await setVis(S, "full");
    p = await probe(S);
    ok(p.X.doc === 200 && p.X.role === "reader" && p.X.sec === 200 && p.X.cats === 200 && p.X.cm === 403 && p.X.docSections === null, "full: чужой зарегистрированный читает концепцию, обсуждение — 403", p.X);
    ok(p.G.doc === 200 && p.G.docSections > 0 && p.G.sec === 401 && p.G.cm === 401, "full: гость — документ одним ответом (sections вложены), обсуждение 401", p.G);
    const cx2 = await X.api("POST", `/syntheses/${S}/reviews`, { title: "x" });
    ok(cx2.status === 403, "full: чужой рецензию не создаёт (403)");
    const cR2 = await R.api("GET", `/syntheses/${S}/comments`);
    ok(cR2.status === 200 && findC(cR2, cid)?.body === "замечание рецензента", "full: рецензент видит свой комментарий");
    await setVis(S, "private");
    await O.api("DELETE", `/syntheses/${oDup.json.id}`);
  }

  /* ════ R3 ════ */
  if (want("R3")) {
    console.log("\n■ R3: адреса — перегенерация графа на моке, связь, тезис, удаление, подраздел");
    const S = await importLive(O);
    await member(S, R, "reviewer");
    await armMock(S);
    const graph0 = await secHtml(S, "graph"), theses0 = await secHtml(S, "theses"), sum0 = await secHtml(S, "sum");
    const cats = await sql`select id, name, definition from categories where synthesis_id=${S} order by length(definition) desc`;
    const cat = cats.find((c) => c.definition && graph0.includes(c.definition.slice(0, 40))) ?? cats[0];
    ok(!!cat && graph0.includes(cat.definition.slice(0, 40)), `категория «${cat?.name}» с определением, которое есть в HTML раздела graph`);
    const [edge] = await sql`select ce.id, cs.name src, ct.name tgt, ce.edge_type t from category_edges ce join categories cs on cs.id=ce.source_id join categories ct on ct.id=ce.target_id where ce.synthesis_id=${S} limit 1`;
    const [th] = await sql`select id, label, thesis_num, formulation from theses where synthesis_id=${S} limit 1`;
    const subName = (sum0.match(/data-section="([^"]+)"/g) ?? []).map((m) => m.slice(14, -1)).find((n) => n !== "Структура документа");
    ok(!!edge && !!th && !!subName, "в образце есть связь, тезис и подраздел sum", { edge: !!edge, th: !!th, subName });
    const cCat = await R.api("POST", `/syntheses/${S}/comments`, { target: { kind: "category", key: cat.name }, body: "к категории" });
    const cEdge = await R.api("POST", `/syntheses/${S}/comments`, { target: { kind: "edge", id: edge.id }, body: "к связи" });
    const cTh = await R.api("POST", `/syntheses/${S}/comments`, { target: { kind: "thesis", id: th.id }, body: "к тезису" });
    const cSub = await R.api("POST", `/syntheses/${S}/comments`, { target: { kind: "subsection", key: `sum:${subName}` }, body: "к подразделу" });
    const cSec = await R.api("POST", `/syntheses/${S}/comments`, { target: { kind: "section", key: "graph" }, body: "к разделу graph" });
    ok([cCat, cEdge, cTh, cSub, cSec].every((c) => c.status === 201 && c.json.resolution.state === "current") && cEdge.json.address.key === ADDR.edgeKey(edge.src, edge.tgt, edge.t) && cTh.json.address.key === ADDR.thesisKey(th.label, th.thesis_num) && cSub.json.address.key === `sum:${subName}` && cSub.json.excerpt.length > 0, "пять адресов записаны current: категория, связь (src→tgt|type), тезис (label), подраздел (sum:имя), раздел", [cCat, cEdge, cTh, cSub, cSec].map((c) => [c.status, c.json?.address?.key, c.json?.resolution?.state]));
    const list = async () => R.api("GET", `/syntheses/${S}/comments`);
    // (а) перегенерация графа на моке с ИЗМЕНЁННЫМ описанием категории → новые id, outdated
    const marker = " [ПЕРЕПИСАНО МОКОМ " + TAG + "]";
    mock.byKey.graph = graph0.replace(cat.definition, cat.definition + marker);
    ok(mock.byKey.graph !== graph0, "мок граф: определение категории изменено в HTML");
    await regen(O, S, "graph");
    const [catA] = await sql`select id, definition from categories where synthesis_id=${S} and name=${cat.name}`;
    const nEdges = (await sql`select count(*)::int n from category_edges where synthesis_id=${S}`)[0].n;
    ok(catA && catA.id !== cat.id && catA.definition.includes(marker.trim()), "после перегенерации категория пересоздана: новый id, новое определение", { old: cat.id, now: catA?.id });
    let L = await list();
    let r = findC(L, cCat.json.id);
    ok(r?.resolution.state === "outdated" && r.resolution.currentId === catA.id && r.address.id === cat.id && r.resolution.currentHash !== r.address.hash, "комментарий к категории: outdated, currentId новый, в адресе прежний id и хэш", r?.resolution);
    const rE = findC(L, cEdge.json.id);
    const [edgeA] = await sql`select ce.id from category_edges ce join categories cs on cs.id=ce.source_id join categories ct on ct.id=ce.target_id where ce.synthesis_id=${S} and cs.name=${edge.src} and ct.name=${edge.tgt} and ce.edge_type=${edge.t}`;
    ok(nEdges > 0 && edgeA && edgeA.id !== edge.id && rE?.resolution.state === "current" && rE.resolution.currentId === edgeA.id, "комментарий к связи: связь пересоздана (новый id), адрес нашёл её по ключу — current", { rE: rE?.resolution, edgeA: edgeA?.id, old: edge.id });
    const rS = findC(L, cSec.json.id);
    ok(rS?.resolution.state === "outdated" && rS.resolution.currentId === rS.address.id, "комментарий к разделу graph: html изменился — outdated, id раздела прежний (upsert)", rS?.resolution);
    ok(findC(L, cTh.json.id)?.resolution.state === "current" && findC(L, cSub.json.id)?.resolution.state === "current", "тезис и подраздел sum перегенерацией графа не задеты — current");
    // (б) перегенерация с ПРЕЖНИМ текстом → снова новые id, current
    mock.byKey.graph = graph0;
    await regen(O, S, "graph");
    const [catB] = await sql`select id from categories where synthesis_id=${S} and name=${cat.name}`;
    L = await list(); r = findC(L, cCat.json.id);
    ok(catB && catB.id !== catA.id && r?.resolution.state === "current" && r.resolution.currentId === catB.id && r.address.id === cat.id, "перегенерация с прежним текстом: категория снова с новым id, адрес current (хэш сошёлся), в адресе всё ещё первый id", { r: r?.resolution, catB: catB?.id });
    ok(findC(L, cSec.json.id)?.resolution.state === "current", "раздел graph вернулся к прежнему HTML — current");
    // (в) тезисы: перегенерация раздела theses прежним текстом → тезис с новым id, найден по метке
    mock.byKey.theses = theses0;
    await regen(O, S, "theses");
    const [thB] = await sql`select id from theses where synthesis_id=${S} and coalesce(label, thesis_num::text) = ${th.label ?? String(th.thesis_num)}`;
    L = await list(); const rT = findC(L, cTh.json.id);
    ok(thB && thB.id !== th.id && rT?.resolution.state === "current" && rT.resolution.currentId === thB.id, "тезис пересоздан перегенерацией раздела — адрес нашёл его по метке, current", { rT: rT?.resolution, thB: thB?.id, old: th.id });
    // (г) удалённая категория → deleted (комментарий остаётся)
    const del = await O.api("DELETE", `/syntheses/${S}/categories/${catB.id}`);
    L = await list(); r = findC(L, cCat.json.id);
    ok(del.status === 200 && r?.resolution.state === "deleted" && r.resolution.currentId === null && r.body === "к категории", "удалённая категория → deleted, комментарий на месте", { del: del.status, r: r?.resolution });
    // (д) подраздел: ручная правка → outdated, выдержка прежняя
    const oldExcerpt = cSub.json.excerpt;
    const newHtml = `<p>Новый текст подраздела ${TAG}.</p>`;
    const pz = await O.api("PATCH", `/syntheses/${S}/sections/sum/subsections/${encodeURIComponent(subName)}`, { html: newHtml });
    L = await list(); const rSub = findC(L, cSub.json.id);
    ok(pz.status === 200 && rSub?.resolution.state === "outdated" && rSub.excerpt === oldExcerpt && !rSub.excerpt.includes(TAG) && rSub.resolution.currentHash !== rSub.address.hash, "подраздел после ручной правки: outdated, выдержка показывает прежний текст", { pz: pz.status, res: rSub?.resolution, ex: rSub?.excerpt?.slice(0, 60) });
    // новый комментарий к тому же подразделу — current с новым хэшем
    const cSub2 = await R.api("POST", `/syntheses/${S}/comments`, { target: { kind: "subsection", key: `sum:${subName}` }, body: "после правки" });
    ok(cSub2.status === 201 && cSub2.json.resolution.state === "current" && cSub2.json.excerpt.includes(TAG) && cSub2.json.address.hash !== cSub.json.address.hash, "новый комментарий к правленному подразделу — current, выдержка новая");
    // (е) сводка: по адресу категории открытый комментарий считается и у удалённого объекта (адрес — ключ)
    const sum = await R.api("GET", `/syntheses/${S}/discussion/summary`);
    ok(sum.json.byAddress.some((a) => a.kind === "category" && a.key === cCat.json.address.key && a.openComments === 1) && sum.json.byAddress.some((a) => a.kind === "subsection" && a.openComments === 2), "сводка по адресам: категория 1, подраздел 2", sum.json?.byAddress);
    ok(mock.picked.filter((p) => p === "(раздел graph)").length === 2 && mock.picked.includes("(раздел theses)"), "мок звался на graph дважды и на theses однажды", mock.picked);
  }

  /* ════ R4 ════ */
  if (want("R4")) {
    console.log("\n■ R4: комментарии и рецензии по HTTP, удаление аккаунта автора");
    const S = await importLive(O);
    const A = await account("author", "Автор"); // участник, которого удалим
    await member(S, R, "reviewer"); await member(S, A, "reviewer");
    const [cat] = await sql`select id, name from categories where synthesis_id=${S} order by name limit 1`;
    const [sec] = await sql`select key from sections where synthesis_id=${S} and key <> 'capsule' order by section_num limit 1`;
    // ветка
    const root = await A.api("POST", `/syntheses/${S}/comments`, { target: { kind: "category", key: cat.name }, body: "корень", kind: "question" });
    const rep1 = await R.api("POST", `/syntheses/${S}/comments`, { parentId: root.json.id, body: "ответ рецензента" });
    const rep2 = await O.api("POST", `/syntheses/${S}/comments`, { parentId: root.json.id, body: "ответ владельца" });
    const rep3 = await A.api("POST", `/syntheses/${S}/comments`, { parentId: rep1.json.id, body: "на ответ" });
    const L1 = await O.api("GET", `/syntheses/${S}/comments?kind=category&key=${encodeURIComponent(root.json.address.key)}`);
    ok(root.status === 201 && rep1.status === 201 && rep2.status === 201 && rep3.status === 400 && findC(L1, root.json.id)?.replyCount === 2 && [rep1, rep2].every((r) => r.json.parentId === root.json.id && r.json.address.key === root.json.address.key), "ветка: два ответа наследуют адрес, replyCount 2, ответ на ответ → 400", { rep3: rep3.status, rc: findC(L1, root.json.id)?.replyCount });
    // правка своего / чужого
    const uA = await A.api("PATCH", `/syntheses/${S}/comments/${root.json.id}`, { body: "корень (правка)", kind: "unclear" });
    const uR = await R.api("PATCH", `/syntheses/${S}/comments/${root.json.id}`, { body: "чужая" });
    const uO = await O.api("PATCH", `/syntheses/${S}/comments/${root.json.id}`, { body: "даже владелец" });
    ok(uA.status === 200 && uA.json.body === "корень (правка)" && uA.json.kind === "unclear" && uA.json.edited && uR.status === 403 && uO.status === 403, "правка: автор — да (edited, kind), другой участник и владелец — 403", { uR: uR.status, uO: uO.status });
    // resolve / reopen
    const sR = await R.api("POST", `/syntheses/${S}/comments/${root.json.id}/resolve`), sO = await O.api("POST", `/syntheses/${S}/comments/${root.json.id}/resolve`), sRep = await A.api("POST", `/syntheses/${S}/comments/${rep1.json.id}/resolve`);
    const reA = await A.api("POST", `/syntheses/${S}/comments/${root.json.id}/reopen`);
    ok(sR.status === 403 && sO.status === 200 && sO.json.status === "resolved" && sO.json.resolvedAt && sRep.status === 400 && reA.status === 200 && reA.json.status === "open" && reA.json.resolvedAt === null, "resolve: другой участник 403, владелец → resolved; у ответа 400; автор переоткрывает", { sR: sR.status, sO: sO.status, sRep: sRep.status, reA: reA.status });
    const sA = await A.api("POST", `/syntheses/${S}/comments/${root.json.id}/resolve`);
    ok(sA.status === 200 && sA.json.status === "resolved", "автор ветки решает сам");
    // скрытие
    const hR = await R.api("POST", `/syntheses/${S}/comments/${rep1.json.id}/hide`), hO = await O.api("POST", `/syntheses/${S}/comments/${rep1.json.id}/hide`);
    const seenA = findC(await A.api("GET", `/syntheses/${S}/comments?status=hidden`), rep1.json.id), seenR = findC(await R.api("GET", `/syntheses/${S}/comments?status=hidden`), rep1.json.id), seenO = findC(await O.api("GET", `/syntheses/${S}/comments?status=hidden`), rep1.json.id);
    const editHidden = await R.api("PATCH", `/syntheses/${S}/comments/${rep1.json.id}`, { body: "правка скрытого" });
    ok(hR.status === 403 && hO.status === 200 && hO.json.hidden && seenA?.hidden && seenA.body === "" && seenR?.body === "ответ рецензента" && seenO?.body === "ответ рецензента" && editHidden.status === 409, "скрытие: только владелец; третьему тело пусто с пометкой, автору и владельцу видно; правка скрытого → 409", { hR: hR.status, editHidden: editHidden.status });
    const unh = await O.api("POST", `/syntheses/${S}/comments/${rep1.json.id}/unhide`);
    ok(unh.status === 200 && !unh.json.hidden && unh.json.status === "open", "возврат из скрытого");
    const unhRoot = await O.api("POST", `/syntheses/${S}/comments/${root.json.id}/hide`).then(() => O.api("POST", `/syntheses/${S}/comments/${root.json.id}/unhide`));
    ok(unhRoot.json?.status === "resolved", "решённый корень после hide/unhide остаётся resolved");
    // удаление: ответ — физически; корень с ответами — заглушка; владелец чужое не удаляет
    const dO = await O.api("DELETE", `/syntheses/${S}/comments/${root.json.id}`);
    const dRep = await R.api("DELETE", `/syntheses/${S}/comments/${rep1.json.id}`);
    const dRoot = await A.api("DELETE", `/syntheses/${S}/comments/${root.json.id}`);
    const L2 = await O.api("GET", `/syntheses/${S}/comments?kind=category&key=${encodeURIComponent(root.json.address.key)}`);
    const stub = findC(L2, root.json.id);
    ok(dO.status === 403 && dRep.json?.removed === true && dRoot.json?.removed === false && stub?.deleted && stub.body === "" && !findC(L2, rep1.json.id) && findC(L2, rep2.json.id), "удаление: владелец чужое 403; ответ исчез; корень — заглушка, оставшийся ответ на месте", { dO: dO.status, dRep: dRep.json, dRoot: dRoot.json });
    const replyToStub = await R.api("POST", `/syntheses/${S}/comments`, { parentId: root.json.id, body: "в удалённую" });
    ok(replyToStub.status === 409, "ответ в удалённую ветку → 409");
    // рецензия
    const rv = await A.api("POST", `/syntheses/${S}/reviews`, { title: "Черновик автора", summary: "итог" });
    const RID = rv.json?.id;
    const seenByO = await O.api("GET", `/syntheses/${S}/reviews/${RID}`), seenByR = await R.api("GET", `/syntheses/${S}/reviews`), seenByA = await A.api("GET", `/syntheses/${S}/reviews`);
    ok(rv.status === 201 && rv.json.status === "draft" && seenByO.status === 404 && seenByR.json.length === 0 && seenByA.json.length === 1, "черновик виден только автору (владельцу 404, рецензенту пусто)", { o: seenByO.status, r: seenByR.json?.length });
    const f1 = await A.api("POST", `/syntheses/${S}/reviews/${RID}/findings`, { target: { kind: "category", key: cat.name }, body: "замечание к категории", kind: "objection" });
    const f2 = await A.api("POST", `/syntheses/${S}/reviews/${RID}/findings`, { target: { kind: "section", key: sec.key }, body: "замечание к разделу" });
    const fBad = await A.api("POST", `/syntheses/${S}/reviews/${RID}/findings`, { target: { kind: "category", key: "нет такой " + TAG }, body: "x" });
    const fOther = await R.api("POST", `/syntheses/${S}/reviews/${RID}/findings`, { target: { kind: "section", key: sec.key }, body: "чужое" });
    ok(f1.status === 201 && f2.json?.findings?.length === 2 && f2.json.findings[0].address.id === cat.id && f2.json.findings[0].position === 1 && f2.json.findings[1].position === 2 && f2.json.revision === 0 && fBad.status === 404 && fOther.status === 404, "замечания с адресами (позиции 1, 2); нет объекта → 404; чужой к черновику → 404", { fBad: fBad.status, fOther: fOther.status });
    const pub = await A.api("POST", `/syntheses/${S}/reviews/${RID}/publish`);
    const afterPub = await O.api("GET", `/syntheses/${S}/reviews`);
    const revs1 = await O.api("GET", `/syntheses/${S}/reviews/${RID}/revisions`);
    ok(pub.status === 200 && pub.json.status === "published" && pub.json.revision === 1 && afterPub.json.length === 1 && afterPub.json[0].findings.length === 2 && revs1.json.length === 1 && revs1.json[0].fields.title === "Черновик автора" && revs1.json[0].findings.length === 2 && revs1.json[0].docVersion.base >= 1, "публикация: редакция 1 со снимком, владелец видит рецензию с замечаниями", { revs: revs1.json?.length });
    const [verRow] = await sql`select version_base, version_sub from syntheses where id=${S}`;
    ok(pub.json.docVersion.base === verRow.version_base && pub.json.docVersion.sub === verRow.version_sub, "версия документа в рецензии — текущая на момент публикации");
    const up = await A.api("PATCH", `/syntheses/${S}/reviews/${RID}`, { title: "Опубликованная", conclusion: "вывод" });
    const fUp = await A.api("PATCH", `/syntheses/${S}/reviews/${RID}/findings/${f2.json.findings[1].id}`, { body: "замечание к разделу (правка)" });
    const fDel = await A.api("DELETE", `/syntheses/${S}/reviews/${RID}/findings/${f2.json.findings[0].id}`);
    const revs2 = await R.api("GET", `/syntheses/${S}/reviews/${RID}/revisions`);
    ok(up.json?.revision === 2 && fUp.json?.revision === 3 && fDel.json?.revision === 4 && fDel.json.findings.length === 1 && revs2.json.length === 4 && revs2.json[0].revision === 4 && revs2.json[3].revision === 1 && revs2.json[3].fields.title === "Черновик автора" && revs2.json[3].findings.length === 2 && revs2.json[0].findings.length === 1, "правки опубликованной: редакции 2, 3, 4; редакция 1 сохранена с прежним заголовком и двумя замечаниями", { up: up.json?.revision, fUp: fUp.json?.revision, fDel: fDel.json?.revision, n: revs2.json?.length });
    const upO = await O.api("PATCH", `/syntheses/${S}/reviews/${RID}`, { title: "владелец" }), delPub = await A.api("DELETE", `/syntheses/${S}/reviews/${RID}`), pubAgain = await A.api("POST", `/syntheses/${S}/reviews/${RID}/publish`);
    ok(upO.status === 403 && delPub.status === 409 && pubAgain.status === 409, "владелец чужую не правит (403); опубликованную не удалить (409); повторная публикация 409");
    const sumBefore = await O.api("GET", `/syntheses/${S}/discussion/summary`);
    const wd = await A.api("POST", `/syntheses/${S}/reviews/${RID}/withdraw`);
    const upW = await A.api("PATCH", `/syntheses/${S}/reviews/${RID}`, { title: "после" });
    const sumAfter = await O.api("GET", `/syntheses/${S}/discussion/summary`);
    const lsW = await O.api("GET", `/syntheses/${S}/reviews`);
    ok(wd.json?.status === "withdrawn" && wd.json.withdrawnAt && upW.status === 409 && sumBefore.json.totals.reviews === 1 && sumBefore.json.totals.findings === 1 && sumAfter.json.totals.reviews === 0 && sumAfter.json.totals.findings === 0 && lsW.json.length === 1 && lsW.json[0].status === "withdrawn" && lsW.json[0].revision === 4, "отзыв: видна с пометкой, не правится, из сводки ушла", { sumBefore: sumBefore.json?.totals, sumAfter: sumAfter.json?.totals });
    const rePub = await A.api("POST", `/syntheses/${S}/reviews/${RID}/publish`);
    ok(rePub.status === 200 && rePub.json.revision === 5 && rePub.json.status === "published" && rePub.json.withdrawnAt === null, "повторная публикация отозванной — редакция 5");
    // валидация текстов: разметка не чистится, пустое/длинное — 400
    const html = await A.api("POST", `/syntheses/${S}/comments`, { target: { kind: "synthesis" }, body: "<script>alert(1)</script> и «<» в тексте" });
    const [rawRow] = await sql`select body from comments where id=${html.json?.id}`;
    const long = await A.api("POST", `/syntheses/${S}/comments`, { target: { kind: "synthesis" }, body: "x".repeat(10001) });
    const empty = await A.api("POST", `/syntheses/${S}/comments`, { target: { kind: "synthesis" }, body: " \n\n " });
    ok(html.status === 201 && rawRow.body === "<script>alert(1)</script> и «<» в тексте" && long.status === 400 && empty.status === 400 && empty.json.details?.body, "тексты: разметка хранится как текст (экранирует клиент), длиннее предела и пустое → 400 с details", { long: long.status, empty: empty.json });
    // удаление аккаунта автора
    const delAcc = await A.api("DELETE", "/auth/me", { password: PW });
    const [uRow] = await sql`select email from users where id=${A.id}`;
    const memLeft = (await sql`select count(*)::int n from synthesis_members where user_id=${A.id}`)[0].n;
    const L3 = await O.api("GET", `/syntheses/${S}/comments`);
    const byDeleted = L3.json.comments.filter((c) => c.author.id === null);
    const lsDel = await O.api("GET", `/syntheses/${S}/reviews`);
    ok(delAcc.status === 200 && uRow.email.endsWith("@deleted.invalid") && memLeft === 0 && byDeleted.length >= 2 && byDeleted.every((c) => c.author.deleted && c.author.name === "удалённый пользователь") && lsDel.json[0].author.deleted && lsDel.json[0].author.name === "удалённый пользователь" && lsDel.json[0].findings.length === 1, "DELETE /auth/me автора: членство снято, комментарии и рецензия с замечанием остались под «удалённый пользователь»", { delAcc: delAcc.status, memLeft, byDeleted: byDeleted.length, author: lsDel.json?.[0]?.author });
    const deAuthor = await O.api("GET", `/syntheses/${S}/reviews`).then(() => fetch(`${BASE}/syntheses/${S}/reviews`, { headers: { Cookie: O.cookie, "Accept-Language": "de" } }).then((r) => r.json()));
    ok(deAuthor[0]?.author?.name === "gelöschter Benutzer", "«удалённый пользователь» — на языке запроса (de: gelöschter Benutzer)", deAuthor[0]?.author);
    const sess = await A.api("GET", `/syntheses/${S}/comments`);
    ok(sess.status === 401, "сессия удалённого мертва (401)");
    // каскад
    const dS = await O.api("DELETE", `/syntheses/${S}`);
    const [left] = await sql`select (select count(*) from comments where synthesis_id=${S})::int c, (select count(*) from reviews where synthesis_id=${S})::int r, (select count(*) from review_findings where synthesis_id=${S})::int f, (select count(*) from review_revisions rr join reviews rv on rv.id=rr.review_id where rv.synthesis_id=${S})::int rr, (select count(*) from synthesis_members where synthesis_id=${S})::int m`;
    ok([200, 204].includes(dS.status) && left.c === 0 && left.r === 0 && left.f === 0 && left.rr === 0 && left.m === 0, "удаление синтеза — каскад уносит комментарии, рецензии, редакции, замечания, участников", left);
  }
} catch (err) {
  failed++; fails.push("исключение: " + (err?.stack ?? err));
  console.error("исключение:", err);
} finally {
  console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch {} }
  mockSrv.close();
  try {
    for (const id of userIds) await sql`delete from sessions where user_id=${id}`;
    for (const id of userIds) await sql`delete from api_usage where user_id=${id}`;
    for (const id of userIds) await sql`delete from transactions where user_id=${id}`;
    for (const id of userIds) await sql`delete from syntheses where user_id=${id}`;
    for (const id of userIds) await sql`delete from comments where author_id=${id}`;
    for (const id of userIds) await sql`delete from reviews where author_id=${id}`;
    for (const id of userIds) await sql`delete from user_subscriptions where user_id=${id}`;
    for (const id of userIds) await sql`delete from users where id=${id}`;
  } catch (e2) { console.error("уборка:", e2); }
  await Promise.race([Promise.all([closeDb(), closeRedis()]), sleep(2000)]);
  await Promise.race([sql.end(), sleep(2000)]);
  process.exit(failed ? 1 : 0);
}
