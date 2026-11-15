/**
 * Беседа 17.1 — тестовые запросы 2–5 одним заходом (совместная правка,
 * серверный слой). Живой сервер :3000 под BILLING_ENFORCE=true + мок Claude
 * В ПРОЦЕССЕ ХАРНЕССА + PG16/Redis; браузер не нужен (беседа серверная).
 * Документ — живой импорт файла-образца sample/*.html.
 *
 *  R2  Права и плательщик: редактор правит элемент, перегенерирует раздел
 *      на моке, исполняет план — списывается ЕГО квота и пишется ЕГО
 *      api_usage, счётчики владельца не меняются; редактор без квоты и
 *      баланса — 402 ему (владелец при этом генерирует); рецензент — 403
 *      на всех путях правки (и под принуждением биллинга: 403, не 402 —
 *      Д-83); редактор — 403 на участниках, видимости, названии, удалении,
 *      копии, родословной; чужой черновик плана владельцу открыт на чтение
 *      и удаление, исполнять его может только автор (Д-84).
 *  R3  Происхождение: версии и журнал несут actor; «Запустил: X» в журнале
 *      у строк редактора, у строк владельца — без; читатель по show_logs
 *      имён не видит и стоимость чужой строки ему скрыта; выгрузка HTML
 *      имён не несёт, стоимость чужой строки в ней — по выгружающему
 *      (Д-85); номер документа растёт по прежним правилам.
 *  R4  Ожидаемая версия: два ОДНОВРЕМЕННЫХ PATCH одного элемента с одним
 *      expected — ровно один 200, второй 409 VERSION_CONFLICT; то же для
 *      подраздела и капсулы; план с устаревшим ожиданием — 409.
 *  R5  Предложения: replace из комментария → принять → план → исполнение →
 *      версия с origin (предложение + комментарий); из замечания рецензии —
 *      origin несёт и рецензию; note → принимающий выбирает refine_element
 *      (мок, квота принявшего); stale после правки основы (и после правки
 *      ДРУГОГО поля элемента — основа элемента — номер версии) — принять
 *      409, «новое поверх текущего» работает; отклонение (человек, слово
 *      решившего) и закрытие при исключении участника различаются.
 *
 * Запуск (≈ 1 мин): node_modules/.bin/tsx tests/test-171-requests2-5.mjs [R2 R3 R4 R5]
 * Предпосылки: PG16 + Redis, миграции (до 0019) и сиды; лог сервера —
 * /tmp/t171-server.log.
 */
import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, readdirSync } from "node:fs";
import http from "node:http";
import postgres from "postgres";

const ONLY = process.argv.slice(2);
const want = (r) => ONLY.length === 0 || ONLY.includes(r);
const ROOT = new URL("../", import.meta.url).pathname;
const FILE = process.env.T171_FILE ?? ROOT + "sample/" + readdirSync(ROOT + "sample").find((f) => f.endsWith(".html"));
const PORT = 3000, MOCK_PORT = 3971;
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
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 1100) : ""}`); }
}
const TAG = Math.random().toString(36).slice(2, 7);

const SDB = await import("../server/services/section-defs-builder.ts");
const EV = await import("@philosynth/shared/utils/expected-version");
const { formatVersion } = await import("@philosynth/shared/utils/version");
const { closeDb } = await import("../server/db/index.ts");
const { closeRedis } = await import("../server/redis.ts");

/* ── Мок Claude: раздел — подразделы карты; подраздел — один; прочее (точечная
      генерация в элемент) — одна строка текста ── */
const mock = { calls: 0, picked: [], map: {}, defs: [], refine: "МОК уточнил значение поля" };
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
      if (def) {
        mock.picked.push(`(раздел ${def.key})`);
        const names = mock.map[def.key] ?? [];
        text = names.length ? names.map((n) => sub(n, `<p>МОК ${TAG}: подраздел «${n}» раздела «${def.key}».</p>`)).join("\n") : `<p>МОК ${TAG}: раздел ${def.key}.</p>`;
      } else { mock.picked.push("(элемент)"); text = mock.refine; }
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
const userIds = [];
const planIds = [];
const PW = "password-171";
async function account(tag, name) {
  const email = `t171-${tag}-${TAG}-${Date.now()}@example.com`;
  await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: PW, displayName: name ?? tag }) });
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password: PW }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  userIds.push(u.id);
  await sql`update users set balance_usd = 0 where id=${u.id}`;
  return { ...client(cookie), id: u.id, email, name: name ?? tag };
}
/** Подписка с квотой перегенераций (образец — test-123). */
async function subscribe(user, regenQuota) {
  const name = `t171plan-${TAG}-${planIds.length}`;
  const [pl] = await sql`insert into subscription_plans (name, family, display_name, price_usd, quota_syntheses, quota_regenerations, quota_modes, quota_enrichments, stripe_price_id, is_active) values (${name}, ${name}, 'T171', 10, 50, ${regenQuota}, 50, 50, ${"price_" + name}, true) returning id`;
  planIds.push(pl.id);
  await sql`insert into user_subscriptions (user_id, plan_id, stripe_subscription_id, status, current_period_start, current_period_end) values (${user.id}, ${pl.id}, ${"sub_t171_" + TAG + planIds.length}, 'active', now() - interval '1 day', now() + interval '20 days')`;
}
const usedRegen = async (u) => (await sql`select used_regenerations n from user_subscriptions where user_id=${u.id}`)[0]?.n ?? null;
const usageRows = async (u) => (await sql`select count(*)::int n from api_usage where user_id=${u.id}`)[0].n;
async function importLive(user) {
  const fd = new FormData(); fd.append("file", new Blob([readFileSync(FILE, "utf8")], { type: "text/html" }), `t171-${TAG}.html`);
  const imp = await user.api("POST", "/syntheses/import", fd);
  if (imp.status !== 200 && imp.status !== 201) throw new Error("импорт: " + imp.text.slice(0, 300));
  return imp.json.id;
}
async function armMock(id) {
  const [row] = await sql`select method, synth_level, depth, generation_order, ext_graph_metrics, lang, section_order, seed, context from syntheses where id=${id}`;
  const phils = (await sql`select parent_name from synthesis_lineage where synthesis_id=${id} and parent_type='philosopher' order by position`).map((r) => r.parent_name);
  const p = { seed: row.seed, phil: phils, participants: phils.map((name) => ({ type: "philosopher", name })), sec: row.section_order.filter((k) => k !== "sum"), method: row.method, synthLevel: row.synth_level, depth: row.depth, generationOrder: row.generation_order, extGraphMetrics: row.ext_graph_metrics, lang: row.lang, ctx: row.context ?? "", secCtx: {} };
  mock.map = await SDB.buildSubsectionMap(p);
  mock.defs = await SDB.buildSectionDefs(p);
}
const member = (S, u, role) => sql`insert into synthesis_members (synthesis_id, user_id, role, status, invited_by, accepted_at) values (${S}, ${u.id}, ${role}, 'active', null, now()) returning id`;
const synRow = async (id) => (await sql`select status, version_base b, version_sub s, version_modes m, version_mode_regen r, visibility from syntheses where id=${id}`)[0];
const verOf = async (id) => { const v = await synRow(id); return { base: v.b, sub: v.s, str: formatVersion({ base: v.b, sub: v.s, modes: v.m, modeRegen: v.r }) }; };
const waitIdle = async (user, id) => { for (let i = 0; i < 200; i++) { const g = await user.api("GET", `/syntheses/${id}`); if (g.json?.synthesis?.status === "ready") return g.json.synthesis; await sleep(300); } throw new Error("синтез не вернулся в ready"); };
async function regen(user, id, key) {
  const since = new Date();
  const rg = await user.api("POST", `/syntheses/${id}/regenerate/${key}`, {});
  if (rg.status !== 200) return rg;
  for (let i = 0; i < 300; i++) {
    const [g] = await sql`select status from generation_log where synthesis_id=${id} and section_key=${key} and log_type='generation' and created_at > ${since} order by created_at desc limit 1`;
    if (g && g.status !== "streaming") break;
    await sleep(300);
  }
  await waitIdle(user, id);
  return rg;
}
async function runPlan(user, S, planId) {
  const ex = await user.api("POST", `/syntheses/${S}/plans/${planId}/execute`);
  if (ex.status !== 200) return { ex, plan: null };
  for (let i = 0; i < 300; i++) {
    const [p] = await sql`select status, steps from edit_plans where id=${planId}`;
    if (p && !["draft", "executing"].includes(p.status)) { await waitIdle(user, S); return { ex, plan: p }; }
    await sleep(200);
  }
  return { ex, plan: (await sql`select status, steps from edit_plans where id=${planId}`)[0] };
}
/** Правимый подраздел без вложенных и без замка. */
async function findSubsection(user, S) {
  const secs = await sql`select key, html_content from sections where synthesis_id=${S} and key <> 'capsule' order by key`;
  for (const s of secs) for (const m of s.html_content.matchAll(/data-section="([^"]+)"/g)) {
    const src = await user.api("GET", `/syntheses/${S}/sections/${s.key}/subsections/${encodeURIComponent(m[1])}`);
    if (src.status === 200 && !src.json.lock && src.json.html && src.json.nested.length === 0) return { key: s.key, name: m[1], url: `/syntheses/${S}/sections/${s.key}/subsections/${encodeURIComponent(m[1])}` };
  }
  throw new Error("нет правимого подраздела");
}
const PLAIN = ["history", "practical", "origin", "evolution", "name", "dialogue"];

try {
  if (!existsSync(FILE)) throw new Error("файл-образец не найден: " + FILE);
  if (await isUp(`${BASE}/health`)) throw new Error(`сервер :${PORT} уже отвечает — чужой процесс`);
  sp(["--import", "tsx", "index.ts"], ROOT + "server", { PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "100000", MAIL_TRANSPORT: "console", BILLING_ENFORCE: "true", ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "sk-ant-mock", NODE_ENV: "development" }, "/tmp/t171-server.log");
  await waitUp(`${BASE}/health`, "сервер");
  const O = await account("owner", "Владелец"), E = await account("ed", "Редактор"), R = await account("rev", "Рецензент"), X = await account("str", "Чужой");
  await subscribe(O, 500);
  await subscribe(E, 4);
  const S = await importLive(O);
  await armMock(S);
  const [mE] = await member(S, E, "editor");
  const [mR] = await member(S, R, "reviewer");
  const order = (await sql`select section_order o from syntheses where id=${S}`)[0].o;
  const KEY = PLAIN.find((k) => order.includes(k));
  if (!KEY) throw new Error("в образце нет простого раздела для перегенерации: " + order.join(","));
  const cats = await sql`select id, name, definition from categories where synthesis_id=${S} order by name limit 6`;
  const ths = await sql`select id, formulation from theses where synthesis_id=${S} order by thesis_num limit 3`;
  const [edge] = await sql`select id from category_edges where synthesis_id=${S} limit 1`;
  const [term] = await sql`select id from glossary_terms where synthesis_id=${S} limit 1`;
  const SUB = await findSubsection(O, S);
  let editorRegenAt = null;

  /* ════ R2 ════ */
  if (want("R2") || want("R3")) {
    console.log("\n■ R2: права и плательщик");
    const o0 = { used: await usedRegen(O), usage: await usageRows(O) }, e0 = { used: await usedRegen(E), usage: await usageRows(E) };
    const v0 = await verOf(S);
    const pe = await E.api("PATCH", `/syntheses/${S}/categories/${cats[0].id}`, { definition: `редактор ${TAG}`, expectedVersion: 0 });
    ok(pe.status === 200, "редактор правит элемент (200)", pe.status);
    editorRegenAt = new Date();
    const rg = await regen(E, S, KEY);
    const e1 = { used: await usedRegen(E), usage: await usageRows(E) }, o1 = { used: await usedRegen(O), usage: await usageRows(O) };
    const [gl] = await sql`select actor_user_id, status, cost_usd from generation_log where synthesis_id=${S} and section_key=${KEY} and log_type='generation' order by created_at desc limit 1`;
    const [us] = await sql`select user_id, billing_mode from api_usage where synthesis_id=${S} order by created_at desc limit 1`;
    ok(rg.status === 200 && gl?.status === "done" && (await sql`select html_content h from sections where synthesis_id=${S} and key=${KEY}`)[0].h.includes(`МОК ${TAG}`), `редактор перегенерировал раздел «${KEY}» на моке`, { rg: rg.status, gl, picked: mock.picked });
    ok(e1.used === e0.used + 1 && e1.usage === e0.usage + 1 && us?.user_id === E.id && us.billing_mode === "subscription", "списана квота РЕДАКТОРА (+1), api_usage — на него, режим subscription", { e0, e1, us });
    ok(o1.used === o0.used && o1.usage === o0.usage, "счётчики владельца не изменились (квота и api_usage)", { o0, o1 });
    ok(gl.actor_user_id === E.id, "строка журнала несёт исполнителя — редактора");
    const v1a = await verOf(S);
    ok(v1a.str === v0.str, "номер документа: отдельная перегенерация РАЗДЕЛА номер не меняет (прежнее правило)", { v0, v1a });
    // подраздел: sub + 1 [18811]; платит тоже редактор
    const sr = await E.api("POST", `/syntheses/${S}/regenerate-subsection`, { sectionKey: SUB.key, subsectionName: SUB.name });
    for (let i = 0; i < 200 && (await usedRegen(E)) === e1.used; i++) await sleep(200);
    await waitIdle(E, S);
    const v1 = await verOf(S);
    e1.used = await usedRegen(E); e1.usage = await usageRows(E);
    ok(sr.status === 200 && v1.base === v0.base && v1.sub === v0.sub + 1 && e1.used === e0.used + 2 && (await usedRegen(O)) === o0.used, "перегенерация ПОДРАЗДЕЛА редактором: sub + 1 (прежнее правило), квота редактора +1, владельца — нет", { sr: sr.status, v0, v1, e1 });

    // план с платным шагом — исполняет и оплачивает редактор
    const pl = await E.api("POST", `/syntheses/${S}/plans`, { regen: [KEY], remove: [], add: [], regenContexts: { [KEY]: "проверка плательщика" } });
    const paidSteps = (pl.json?.plan?.steps ?? []).filter((s) => s.status === "confirmed").length;
    const oEx = await O.api("POST", `/syntheses/${S}/plans/${pl.json?.plan?.id}/execute`);
    const oGet = await O.api("GET", `/syntheses/${S}/plans/${pl.json?.plan?.id}`);
    const rGet = await R.api("GET", `/syntheses/${S}/plans/${pl.json?.plan?.id}`);
    ok([200, 201].includes(pl.status) && paidSteps === 1 && oEx.status === 403 && oGet.status === 200 && rGet.status === 403, "план редактора: владельцу открыт на чтение, исполнить его владелец НЕ может (платит автор); рецензенту закрыт (Д-84)", { pl: pl.status, oEx: oEx.status, oGet: oGet.status, rGet: rGet.status });
    const run = await runPlan(E, S, pl.json.plan.id);
    const e2 = { used: await usedRegen(E), usage: await usageRows(E) }, o2 = { used: await usedRegen(O), usage: await usageRows(O) };
    const [vm] = await sql`select actor_user_id, metadata from generation_log where synthesis_id=${S} and log_type='version_marker' order by created_at desc limit 1`;
    ok(run.plan?.status === "done" && e2.used === e1.used + 1 && e2.usage === e1.usage + 1 && o2.used === o1.used && o2.usage === o1.usage, "план с платным шагом исполнен редактором: его квота +1, у владельца без изменений", { status: run.plan?.status, e1, e2, o1, o2 });
    const v2 = await verOf(S);
    ok(vm?.actor_user_id === E.id && v2.base === v1.base + 1 && v2.sub === 0 && vm.metadata.version === v2.str, "version_marker плана — с исполнителем; номер документа: план с перегенерацией — base + 1, sub = 0 (прежнее правило)", { v1, v2, marker: vm?.metadata?.version });

    // бесплатный план номер не трогает
    const fp = await E.api("POST", `/syntheses/${S}/plans`, { regen: [], remove: [], add: [], elementEdits: [{ kind: "category", elementId: cats[1].id, field: "definition", value: `бесплатно ${TAG}` }] });
    const frun = await runPlan(E, S, fp.json.plan.id);
    const v3 = await verOf(S), e3 = await usedRegen(E);
    ok(frun.plan?.status === "done" && v3.str === v2.str && e3 === e2.used, "бесплатный план (edit_element): номер документа и квота не меняются", { v2, v3 });

    // квота редактора исчерпана (4 из 4) → отказ биллинга ЕМУ; владелец генерирует.
    // Статус — по контракту 6.1: все отказы биллинга идут 403 с кодом
    // (QUOTA_EXCEEDED / INSUFFICIENT_BALANCE); «402» текста 17.1 — оговорка
    const rg3 = await regen(E, S, KEY);
    const rg4 = await E.api("POST", `/syntheses/${S}/regenerate/${KEY}`, {});
    const eUsed = await usedRegen(E);
    ok(rg3.status === 200 && eUsed === 4 && rg4.status === 403 && rg4.json?.code === "QUOTA_EXCEEDED" && rg4.json.details?.quota === 4, "редактор без квоты и баланса — отказ биллинга ЕМУ: 403 QUOTA_EXCEEDED (его квота 4/4)", { rg3: rg3.status, eUsed, rg4: rg4.status, body: rg4.json });
    const pl402 = await E.api("POST", `/syntheses/${S}/plans`, { regen: [KEY], remove: [], add: [] });
    const ex402 = await E.api("POST", `/syntheses/${S}/plans/${pl402.json?.plan?.id}/execute`);
    ok(ex402.status === 403 && ex402.json?.code === "QUOTA_EXCEEDED", "исполнение платного плана редактором без квоты — тот же отказ биллинга ему", { s: ex402.status, c: ex402.json?.code });
    // редактор без подписки и баланса вовсе
    await sql`update user_subscriptions set status='canceled' where user_id=${E.id}`;
    const rgNo = await E.api("POST", `/syntheses/${S}/regenerate/${KEY}`, {});
    await sql`update user_subscriptions set status='active' where user_id=${E.id}`;
    ok(rgNo.status === 403 && ["INSUFFICIENT_BALANCE", "BILLING_REQUIRED"].includes(rgNo.json?.code), "редактор без подписки и баланса — отказ биллинга ему (подписка владельца не подставляется)", { s: rgNo.status, c: rgNo.json?.code });
    const delByOwner = await O.api("DELETE", `/syntheses/${S}/plans/${pl402.json?.plan?.id}`);
    ok(delByOwner.status === 200, "чужой черновик плана владелец удаляет (Д-84)", delByOwner.status);
    const oUsedBefore = await usedRegen(O);
    const rgO = await regen(O, S, KEY);
    ok(rgO.status === 200 && (await usedRegen(O)) === oUsedBefore + 1 && (await usedRegen(E)) === 4, "владелец при этом генерирует на свою квоту; за редактора он не платил");

    // рецензент: 403 на всех путях правки — и под принуждением биллинга (у него нет ни подписки, ни баланса)
    const revPaths = [
      ["PATCH", `/syntheses/${S}/categories/${cats[0].id}`, { definition: "x" }], ["PATCH", `/syntheses/${S}/edges/${edge.id}`, { description: "x" }],
      ["PATCH", `/syntheses/${S}/theses/${ths[0].id}`, { formulation: "x" }], ["PATCH", `/syntheses/${S}/glossary/${term.id}`, { definition: "x" }],
      ["DELETE", `/syntheses/${S}/categories/${cats[5].id}`], ["DELETE", `/syntheses/${S}/theses/${ths[2].id}`], ["DELETE", `/syntheses/${S}/edges/${edge.id}`],
      ["POST", `/syntheses/${S}/edges`, {}], ["POST", `/syntheses/${S}/elements/auto-rename`, {}], ["POST", `/syntheses/${S}/elements/category/${cats[0].id}/rollback`, { version: 1 }],
      ["PATCH", SUB.url, { html: "<p>x</p>" }], ["DELETE", SUB.url], ["PATCH", `/syntheses/${S}/capsule`, { html: "<p>x</p>" }],
      ["POST", `/syntheses/${S}/plans`, { regen: [KEY], remove: [], add: [] }], ["POST", `/syntheses/${S}/plans/impact`, { regen: [KEY], remove: [], add: [] }],
      ["POST", `/syntheses/${S}/regenerate/${KEY}`, {}], ["POST", `/syntheses/${S}/regenerate-subsection`, { sectionKey: SUB.key, subsectionName: SUB.name }], ["POST", `/syntheses/${S}/subsection-impact`, { sectionKey: SUB.key, subsectionName: SUB.name }],
      ["POST", `/syntheses/${S}/modes/adversarial/run`, {}], ["POST", `/syntheses/${S}/modes/adversarial/0/regenerate`, {}], ["DELETE", `/syntheses/${S}/modes/adversarial/0`],
      ["POST", `/syntheses/${S}/enrich/category/${cats[0].id}`, { type: "x" }], ["POST", `/syntheses/${S}/enrich/edge/${edge.id}`, { type: "x" }], ["POST", `/syntheses/${S}/justify-characteristic`, {}],
      ["POST", `/syntheses/${S}/transform/graph-to-theses`, {}], ["POST", `/syntheses/${S}/transform/theses-to-graph`, {}],
      ["GET", `/syntheses/${S}/recommendations`], ["POST", `/syntheses/${S}/recommendations/parse`, {}], ["POST", `/syntheses/${S}/recommendations/extract`, {}], ["POST", `/syntheses/${S}/recommendations/plan`, {}],
    ];
    const revRes = [];
    for (const [m, p, b] of revPaths) revRes.push({ m, p: p.replace(`/syntheses/${S}`, ""), s: (await R.api(m, p, b)).status });
    const notForbidden = revRes.filter((r) => r.s !== 403);
    ok(notForbidden.length === 0, `рецензент: 403 на всех ${revPaths.length} путях правки (и на платных — 403, не 402: Д-83)`, notForbidden);
    const strRes = [];
    for (const [m, p, b] of revPaths.slice(13, 26)) strRes.push({ p: p.replace(`/syntheses/${S}`, ""), s: (await X.api(m, p, b)).status });
    ok(strRes.every((r) => r.s === 403), "посторонний без оплаты на платных путях — тоже 403, не 402", strRes.filter((r) => r.s !== 403));
    const [docSame] = await sql`select definition from categories where id=${cats[0].id}`;
    ok(docSame.definition === `редактор ${TAG}`, "документ после попыток рецензента цел");

    // редактор: 403 на manage
    const S2 = await importLive(E); // своя концепция редактора — для попытки привязки родословной
    const mng = [
      ["GET", `/syntheses/${S}/members`], ["POST", `/syntheses/${S}/members`, { email: X.email, role: "reviewer" }], ["PATCH", `/syntheses/${S}/members/${mR.id}`, { role: "editor" }], ["DELETE", `/syntheses/${S}/members/${mR.id}`], ["POST", `/syntheses/${S}/members/${mR.id}/resend`],
      ["PATCH", `/syntheses/${S}`, { visibility: "full" }], ["PATCH", `/syntheses/${S}`, { title: "чужое название" }], ["PATCH", `/syntheses/${S}`, { showLogs: true }],
      ["DELETE", `/syntheses/${S}`], ["POST", `/syntheses/${S}/duplicate`],
      ["POST", `/syntheses/${S}/lineage/link`, { parentName: "Чужая", parentSynthesisId: S2 }], ["DELETE", `/syntheses/${S}/lineage/link/${S2}`],
    ];
    const mngRes = [];
    for (const [m, p, b] of mng) mngRes.push({ m, p: p.replace(`/syntheses/${S}`, "") || "/", s: (await E.api(m, p, b)).status });
    const after = await synRow(S);
    ok(mngRes.every((r) => r.s === 403) && after.visibility === "private" && (await sql`select count(*)::int n from synthesis_members where synthesis_id=${S}`)[0].n === 2, "редактор: 403 на участниках, видимости, названии, флагах, удалении, копии, родословной; ничего не изменилось", mngRes.filter((r) => r.s !== 403));
    await E.api("DELETE", `/syntheses/${S2}`);
  }

  /* ════ R3 ════ */
  if (want("R3")) {
    console.log("\n■ R3: происхождение — исполнитель в версиях и журнале");
    const vers = await sql`select element_type, version, change_source, actor_user_id from element_versions where synthesis_id=${S} and element_id=${cats[0].id} order by version`;
    ok(vers.length >= 1 && vers[0].actor_user_id === E.id, "версия правки редактора несёт actor_user_id редактора", vers);
    await O.api("PATCH", `/syntheses/${S}/categories/${cats[0].id}`, { definition: `владелец ${TAG}` });
    const vO = await O.api("GET", `/syntheses/${S}/elements/category/${cats[0].id}/versions`);
    const vR = await R.api("GET", `/syntheses/${S}/elements/category/${cats[0].id}/versions`);
    const byE = vO.json.versions.find((v) => v.version === 1), byO = vO.json.versions.find((v) => v.version === 2);
    const [rowO] = await sql`select actor_user_id from element_versions where element_id=${cats[0].id} and version=2`;
    ok(byE?.actor?.name === "Редактор" && byE.actor.isOwner === false && rowO.actor_user_id === O.id && !byO.actor && vR.json.versions.find((v) => v.version === 1)?.actor?.name === "Редактор", "история версий: у правки редактора — имя (владельцу и рецензенту), у правки владельца — без имени (в БД исполнитель записан)", { byE, byO });
    const lgO = await O.api("GET", `/syntheses/${S}/logs/generation`);
    const edRows = lgO.json.entries.filter((e) => e.actor?.name === "Редактор"), owRows = lgO.json.entries.filter((e) => e.logType === "generation" && !e.actor && new Date(e.createdAt) > editorRegenAt);
    ok(edRows.length >= 3 && edRows.every((e) => e.actor.isOwner === false && !e.costHidden) && owRows.length >= 1, "журнал владельцу: строки редактора с actor, своя перегенерация — без; стоимость видна вся", { ed: edRows.length, ow: owRows.length });
    const fO = await O.api("GET", `/syntheses/${S}/logs/formatted`);
    const blocks = fO.json.text.split("═══ ").filter((b) => b.includes("МОК") || b.includes("ВХОД:"));
    const startedCount = (fO.json.text.match(/Запустил: Редактор/g) ?? []).length;
    ok(startedCount >= 3 && !/Запустил: Владелец/.test(fO.json.text) && blocks.length > 0, "«Запустил: Редактор» в журнале у строк редактора; «Запустил: Владелец» нет нигде", { startedCount });
    const fE = await E.api("GET", `/syntheses/${S}/logs/formatted`), fR0 = await R.api("GET", `/syntheses/${S}/logs/formatted`);
    ok(fE.status === 200 && /Запустил: Редактор/.test(fE.json.text) && !/Стоимость: скрыта/.test(fE.json.text) && fR0.status === 403, "редактору журнал открыт, свои стоимости видны; рецензенту приватной — закрыт (флаги 8.6)", { fE: fE.status, fR0: fR0.status });
    await sql`update syntheses set visibility='full', show_logs=true, show_prompts=true where id=${S}`;
    const lgX = await X.api("GET", `/syntheses/${S}/logs/generation`), fX = await X.api("GET", `/syntheses/${S}/logs/formatted`), prX = await X.api("GET", `/syntheses/${S}/logs/prompts`);
    const lgR = await R.api("GET", `/syntheses/${S}/logs/generation`);
    const xEd = lgX.json.entries.filter((e) => e.costHidden);
    ok(lgX.status === 200 && lgX.json.entries.every((e) => !e.actor) && xEd.length === edRows.length && xEd.every((e) => e.costUsd === 0) && !/Запустил: /.test(fX.json.text) && /Стоимость: скрыта/.test(fX.json.text) && !/Редактор/.test(prX.json.text ?? ""), "читатель по show_logs: имён нет (журнал, текст, запросы); стоимость строк редактора скрыта", { hidden: xEd.length, expect: edRows.length });
    ok(lgR.json.entries.some((e) => e.actor?.name === "Редактор" && e.costHidden === true), "рецензент (участник) по show_logs: имя видит, стоимость чужой строки — нет");
    // выгрузка (Д-85)
    const exO = await O.api("GET", `/syntheses/${S}/export/html`), exX = await X.api("GET", `/syntheses/${S}/export/html`), exE = await E.api("GET", `/syntheses/${S}/export/html`);
    const costsOf = (html) => [...html.matchAll(/"costUsd":\s*([0-9.eE+-]+)/g)].map((m) => Number(m[1]));
    const gO = costsOf(exO.text), gX = costsOf(exX.text), gE = costsOf(exE.text);
    const costSum = (g) => g.reduce((a, x) => a + x, 0);
    ok(exO.status === 200 && exX.status === 200 && !/Запустил: /.test(exO.text) && !/Запустил: /.test(exX.text) && !/Запустил: /.test(exE.text), "выгрузка HTML имён исполнителей не несёт никому (владелец, редактор, читатель)");
    ok(gO.length > 0 && gO.length === gX.length && costSum(gX) < costSum(gO) && costSum(gE) > costSum(gX) && /Стоимость: скрыта/.test(exX.text) && !/Стоимость: скрыта/.test(exO.text), "выгрузка: стоимость строк редактора читателю нулевая и «скрыта», владельцу — полная, самому редактору его строки видны (Д-85)", { o: costSum(gO), x: costSum(gX), e: costSum(gE), n: gO.length });
    await sql`update syntheses set visibility='private', show_logs=false, show_prompts=false where id=${S}`;
  }

  /* ════ R4 ════ */
  if (want("R4")) {
    console.log("\n■ R4: ожидаемая версия — одновременные правки");
    const cid = cats[2].id;
    const cur = async () => (await sql`select coalesce(max(version),0)::int v from element_versions where element_id=${cid}`)[0].v;
    const v = await cur();
    const pair = await Promise.all([
      O.api("PATCH", `/syntheses/${S}/categories/${cid}`, { definition: `A ${TAG}`, expectedVersion: v }),
      O.api("PATCH", `/syntheses/${S}/categories/${cid}`, { definition: `B ${TAG}`, expectedVersion: v }),
    ]);
    const st = pair.map((r) => r.status).sort();
    const loser = pair.find((r) => r.status === 409), winner = pair.find((r) => r.status === 200);
    const [now] = await sql`select definition from categories where id=${cid}`;
    ok(J(st) === J([200, 409]) && loser.json.code === "VERSION_CONFLICT" && loser.json.details.current.version === v + 1 && loser.json.details.expected.version === v && now.definition === winner.json.category.definition && (await cur()) === v + 1, "элемент: два одновременных PATCH с одним expected — ровно один прошёл, второй 409 VERSION_CONFLICT с текущей версией; записана одна версия", { st, loser: loser?.json });
    const retry = await O.api("PATCH", `/syntheses/${S}/categories/${cid}`, { definition: `B ${TAG} повтор`, expectedVersion: loser.json.details.current.version });
    ok(retry.status === 200, "повтор с текущей версией из ответа 409 проходит");
    // пять одновременных
    const v5 = await cur();
    const five = await Promise.all([1, 2, 3, 4, 5].map((i) => O.api("PATCH", `/syntheses/${S}/categories/${cid}`, { definition: `гонка ${i} ${TAG}`, expectedVersion: v5 })));
    ok(five.filter((r) => r.status === 200).length === 1 && five.filter((r) => r.status === 409).length === 4 && (await cur()) === v5 + 1, "пять одновременных правок с одним expected — прошла ровно одна", five.map((r) => r.status));
    // подраздел
    const src = await O.api("GET", SUB.url);
    const sp2 = await Promise.all([
      O.api("PATCH", SUB.url, { html: `<p>подраздел A ${TAG}</p>`, expectedHash: src.json.hash }),
      E.api("PATCH", SUB.url, { html: `<p>подраздел B ${TAG}</p>`, expectedHash: src.json.hash }),
    ]);
    const sLoser = sp2.find((r) => r.status === 409);
    const srcNow = await O.api("GET", SUB.url);
    ok(J(sp2.map((r) => r.status).sort()) === J([200, 409]) && sLoser.json.code === "VERSION_CONFLICT" && sLoser.json.details.current.hash === srcNow.json.hash && srcNow.json.hash !== src.json.hash, "подраздел: владелец и редактор одновременно с одним expectedHash — один прошёл, второй 409 с текущим хэшем", sp2.map((r) => r.status));
    // капсула
    const cap0 = (await sql`select capsule_html h from syntheses where id=${S}`)[0].h;
    const h0 = await EV.sectionContentHash(cap0);
    const cp = await Promise.all([
      O.api("PATCH", `/syntheses/${S}/capsule`, { html: `<p>капсула A ${TAG}</p>`, expectedHash: h0 }),
      E.api("PATCH", `/syntheses/${S}/capsule`, { html: `<p>капсула B ${TAG}</p>`, expectedHash: h0 }),
    ]);
    const cap1 = (await sql`select capsule_html h from syntheses where id=${S}`)[0].h;
    const cLoser = cp.find((r) => r.status === 409);
    ok(J(cp.map((r) => r.status).sort()) === J([200, 409]) && cLoser.json.details.current.hash === (await EV.sectionContentHash(cap1)) && cLoser.json.details.target === "capsule", "капсула: два одновременных PATCH с одним expectedHash — один прошёл, второй 409 с текущим хэшем", cp.map((r) => r.status));
    // план
    const plBad = await O.api("POST", `/syntheses/${S}/plans`, { regen: [], remove: [], add: [], elementEdits: [{ kind: "category", elementId: cid, field: "definition", value: "x" }], expected: [{ target: `category:${cid}`, version: v }, { target: "capsule", hash: h0 }] });
    ok(plBad.status === 409 && plBad.json.code === "VERSION_CONFLICT" && plBad.json.details.conflicts.length === 2, "план с устаревшими ожиданиями — 409, названы оба расхождения");
    const noExp = await O.api("PATCH", `/syntheses/${S}/categories/${cid}`, { definition: `без ожидания ${TAG}` });
    ok(noExp.status === 200, "без expected — как прежде (200)");
  }

  /* ════ R5 ════ */
  if (want("R5")) {
    console.log("\n■ R5: предложения");
    const P = `/syntheses/${S}/proposals`;
    // пополним редактору возможность платить за refine: новая квота
    await sql`update user_subscriptions set used_regenerations = 0 where user_id=${E.id}`;
    const cA = cats[3], cB = cats[4];
    // replace из комментария
    const com = await R.api("POST", `/syntheses/${S}/comments`, { target: { kind: "category", id: cA.id }, body: "определение расплывчато", kind: "unclear" });
    const p1 = await R.api("POST", P, { kind: "replace", field: "definition", value: `из комментария ${TAG}`, rationale: "см. комментарий", source: "comment", sourceId: com.json.id });
    const [comAfter] = await sql`select body, status from comments where id=${com.json.id}`;
    ok(p1.status === 201 && p1.json.source === "comment" && p1.json.sourceId === com.json.id && p1.json.address.id === cA.id && comAfter.body === "определение расплывчато" && comAfter.status === "open", "replace из комментария: адрес — от комментария, сам комментарий не изменён", p1.json);
    const a1 = await E.api("POST", `${P}/${p1.json.id}/accept`, {});
    const [mid] = await sql`select definition from categories where id=${cA.id}`;
    ok(a1.status === 201 && a1.json.plan.status === "draft" && mid.definition === cA.definition, "принять → черновик плана; документ не изменён");
    const r1 = await runPlan(E, S, a1.json.plan.id);
    const [fin] = await sql`select definition from categories where id=${cA.id}`;
    const v1 = (await O.api("GET", `/syntheses/${S}/elements/category/${cA.id}/versions`)).json.versions[0];
    const g1 = await R.api("GET", `${P}/${p1.json.id}`);
    ok(r1.plan?.status === "done" && fin.definition === `из комментария ${TAG}` && g1.json.status === "accepted", "исполнение плана: значение вписано, предложение accepted", { plan: r1.plan?.status, g1: g1.json?.status });
    ok(v1.changeSource === "proposal" && v1.origin?.kind === "proposal" && v1.origin.proposalId === p1.json.id && v1.origin.source === "comment" && v1.origin.sourceId === com.json.id && v1.origin.authorId === R.id && v1.origin.planId === a1.json.plan.id && v1.actor?.name === "Редактор", "версия с origin: предложение, источник-комментарий, автор, план; исполнитель — редактор", v1);
    // из замечания рецензии — origin несёт рецензию
    const rv = await R.api("POST", `/syntheses/${S}/reviews`, {});
    const fd = await R.api("POST", `/syntheses/${S}/reviews/${rv.json.id}/findings`, { target: { kind: "thesis", id: ths[0].id }, body: "тезис недоказан", kind: "objection" });
    await R.api("PATCH", `/syntheses/${S}/reviews/${rv.json.id}`, { title: `Рецензия ${TAG}`, summary: "итог" });
    await R.api("POST", `/syntheses/${S}/reviews/${rv.json.id}/publish`);
    const findingId = fd.json.findings[0].id;
    const p2 = await O.api("POST", P, { kind: "replace", field: "formulation", value: `тезис по замечанию ${TAG}`, source: "review_finding", sourceId: findingId });
    const a2 = await O.api("POST", `${P}/${p2.json.id}/accept`, {});
    const r2 = await runPlan(O, S, a2.json.plan.id);
    const v2 = (await O.api("GET", `/syntheses/${S}/elements/thesis/${ths[0].id}/versions`)).json.versions[0];
    ok(p2.status === 201 && p2.json.sourceReviewId === rv.json.id && r2.plan?.status === "done" && v2.origin?.source === "review_finding" && v2.origin.sourceId === findingId && v2.origin.reviewId === rv.json.id && !v2.actor, "из замечания рецензии: origin несёт замечание И рецензию; исполнил владелец — имени исполнителя нет", { p2: p2.json?.sourceReviewId, v2 });
    // note → refine_element (мок), платит принявший
    const p3 = await R.api("POST", P, { target: { kind: "category", id: cB.id }, kind: "note", rationale: "определение стоит дать через противопоставление" });
    const eBefore = await usedRegen(E), oBefore = await usedRegen(O);
    const a3 = await E.api("POST", `${P}/${p3.json.id}/accept`, { method: "refine_element" });
    const st3 = a3.json?.plan?.steps?.[0];
    ok(a3.status === 201 && st3.type === "refine_element" && st3.context === "определение стоит дать через противопоставление" && a3.json.plan.costBreakdown?.paid?.steps === 1, "note → принимающий выбрал refine_element: платный шаг, довод модели — текст предложения", a3.json?.plan);
    mock.refine = `Мок уточнил определение ${TAG}`;
    const r3 = await runPlan(E, S, a3.json.plan.id);
    const [cBnow] = await sql`select definition from categories where id=${cB.id}`;
    const v3 = (await O.api("GET", `/syntheses/${S}/elements/category/${cB.id}/versions`)).json.versions[0];
    ok(r3.plan?.status === "done" && cBnow.definition === `Мок уточнил определение ${TAG}` && (await usedRegen(E)) === eBefore + 1 && (await usedRegen(O)) === oBefore && v3.changeSource === "proposal" && v3.origin.stepType === "refine_element" && (await R.api("GET", `${P}/${p3.json.id}`)).json.status === "accepted", "refine_element исполнен на моке: значение от модели, квота ПРИНЯВШЕГО +1, версия 'proposal', предложение accepted", { plan: r3.plan?.status, def: cBnow.definition, v3 });
    // stale
    const p4 = await R.api("POST", P, { target: { kind: "thesis", id: ths[1].id }, kind: "replace", field: "formulation", value: `устареет ${TAG}`, rationale: "r" });
    await O.api("PATCH", `/syntheses/${S}/theses/${ths[1].id}`, { formulation: `основа переписана ${TAG}` });
    const g4 = await R.api("GET", `${P}/${p4.json.id}`);
    const a4 = await E.api("POST", `${P}/${p4.json.id}/accept`, {});
    ok(g4.json.stale === true && g4.json.status === "open" && a4.status === 409 && a4.json.code === "PROPOSAL_STALE", "stale после правки основы: принять — 409 PROPOSAL_STALE, статус остаётся open");
    const rb = await R.api("POST", `${P}/${p4.json.id}/rebase`, { value: `поверх текущего ${TAG}` });
    const a4b = await E.api("POST", `${P}/${rb.json.id}/accept`, {});
    const r4 = await runPlan(E, S, a4b.json?.plan?.id);
    const [thNow] = await sql`select formulation from theses where id=${ths[1].id}`;
    const old4 = await R.api("GET", `${P}/${p4.json.id}`);
    ok(rb.status === 201 && rb.json.stale === false && old4.json.status === "closed" && old4.json.closeReason === "superseded" && old4.json.supersededBy === rb.json.id && r4.plan?.status === "done" && thNow.formulation === `поверх текущего ${TAG}`, "«новое поверх текущего»: старое closed/superseded, новое принято и исполнено", { rb: rb.status, old: old4.json?.status, plan: r4.plan?.status });
    // основа элемента — номер версии: правка ДРУГОГО поля тоже устаревает
    const p5 = await R.api("POST", P, { target: { kind: "category", id: cats[5].id }, kind: "replace", field: "definition", value: `по версии ${TAG}`, rationale: "r" });
    await O.api("PATCH", `/syntheses/${S}/categories/${cats[5].id}`, { centrality: 0.42 });
    const g5 = await R.api("GET", `${P}/${p5.json.id}`);
    const a5 = await E.api("POST", `${P}/${p5.json.id}/accept`, {});
    ok(g5.json.stale === true && g5.json.resolution.currentVersion === (g5.json.base.version ?? 0) + 1 && a5.status === 409 && a5.json.code === "PROPOSAL_STALE", "основа элемента — номер версии: правка другого поля (центральность) делает предложение устаревшим", { stale: g5.json?.stale, base: g5.json?.base, res: g5.json?.resolution });
    // отклонение и закрытие при исключении различаются
    const rj = await E.api("POST", `${P}/${p5.json.id}/reject`, { note: "уже неактуально" });
    const p6 = await R.api("POST", P, { target: { kind: "section", key: KEY }, kind: "note", rationale: "раздел многословен" });
    const rm = await O.api("DELETE", `/syntheses/${S}/members/${mR.id}`);
    const g5b = await O.api("GET", `${P}/${p5.json.id}`), g6 = await O.api("GET", `${P}/${p6.json.id}`), g1b = await O.api("GET", `${P}/${p1.json.id}`);
    ok(rj.status === 200 && g5b.json.status === "rejected" && g5b.json.note === "уже неактуально" && g5b.json.decidedBy?.name === "Редактор" && g5b.json.closeReason === null, "отклонение: статус rejected, решивший — человек, его слово записано", g5b.json);
    ok(rm.status === 200 && g6.json.status === "closed" && g6.json.closeReason === "member_removed" && g6.json.author.formerMember === true && g6.json.events.at(-1).type === "closed" && g1b.json.status === "accepted", "исключение участника: его открытое — closed/member_removed (не rejected); принятое — не тронуто; автор — «бывший участник»", { g6: g6.json?.status, reason: g6.json?.closeReason });
    const kinds = await sql`select status, close_reason, count(*)::int n from proposals where synthesis_id=${S} group by 1,2 order by 1`;
    ok(kinds.some((k) => k.status === "rejected") && kinds.some((k) => k.status === "closed" && k.close_reason === "member_removed") && kinds.some((k) => k.status === "closed" && k.close_reason === "superseded") && !kinds.some((k) => k.status === "open"), "итог по статусам: rejected, closed/member_removed, closed/superseded, accepted различимы; открытых не осталось", kinds);
    const notes = await sql`select type, payload->>'decision' d, count(*)::int n from notifications where user_id=${R.id} and synthesis_id=${S} and type='proposal_decided' group by 1,2`;
    ok(notes.some((n) => n.d === "accepted") && notes.some((n) => n.d === "rejected"), "автору приходили proposal_decided: accepted и rejected", notes);
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
    for (const id of userIds) await sql`delete from notifications where user_id=${id}`;
    for (const id of userIds) await sql`delete from api_usage where user_id=${id}`;
    for (const id of userIds) await sql`delete from transactions where user_id=${id}`;
    for (const id of userIds) await sql`delete from syntheses where user_id=${id}`;
    for (const id of userIds) await sql`delete from comments where author_id=${id}`;
    for (const id of userIds) await sql`delete from reviews where author_id=${id}`;
    for (const id of userIds) await sql`delete from user_subscriptions where user_id=${id}`;
    for (const id of planIds) await sql`delete from subscription_plans where id=${id}`;
    for (const id of userIds) await sql`delete from users where id=${id}`;
  } catch (e2) { console.error("уборка:", e2); }
  await Promise.race([Promise.all([closeDb(), closeRedis()]), sleep(2000)]);
  await Promise.race([sql.end(), sleep(2000)]);
  process.exit(failed ? 1 : 0);
}
