/**
 * test-132-requests2-4 — тестовые запросы 2–4 беседы 13.2 (07): Д-65, Д-66, Д-67 живьём.
 * PG16 + Redis; мок Claude (HTTP 500 → ретрай → пауза); браузер не нужен (серверная беседа).
 *
 *   R2 (Д-65). Концепция-родитель P (приватная, полная для мета-синтеза) → POST /syntheses с
 *       participants [P] на моке, который падает → status='paused', paused_state.genParams несёт
 *       содержимое родителя. GET /syntheses/:id при visibility='full': чужим зарегистрированным —
 *       pausedState и pauseEstimates null; владельцем — как прежде (kind='gen', оценки есть);
 *       гостем — как прежде (null, без стоимости). Выгрузка HTML чужим — без pausedState в
 *       philosynth-state и без капсулы родителя в params; владельцем — с тем и другим.
 *   R3 (Д-66). Файл с UUID: чужая приватная, чужая full без allow_meta, чужая витрина, чужая
 *       full+allow_meta, своя, свой потомок (цикл — заслон зовётся, связь пишется) → связи только
 *       для своей, потомка и чужой full+allow_meta; остальные — кандидатами с предупреждением;
 *       скрипт-отчёт на КОПИИ БД (pg_dump → philosynth_copy_132) со «старой» строкой находит её
 *       и ничего не меняет (ни в копии, ни в рабочей базе).
 *   R4 (Д-67). Сервер B (лимит 50/мин, TRUST_PROXY=false): 100 запросов с разной случайной
 *       cookie (и случайным X-Forwarded-For) с одного адреса → 50×200, затем RATE_LIMIT;
 *       две сессии одного пользователя делят квоту u:; форма сброса пароля со случайными cookie
 *       упирается в mailLimiter (окно — час). Сервер C (TRUST_PROXY=true, HOST=127.0.0.1):
 *       X-Forwarded-For влияет на ключ (разные адреса — разные квоты, один адрес — 429);
 *       сервер E (TRUST_PROXY=true без HOST) предупреждает при старте.
 *
 * Запуск из корня:  node_modules/.bin/tsx tests/test-132-requests2-4.mjs
 */
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { openSync, readFileSync } from "node:fs";
import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const COPY_DB = "philosynth_copy_132";
const COPY_URL = DB_URL.replace(/\/[^/]+$/, `/${COPY_DB}`);
process.env.DATABASE_URL = DB_URL;
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TAG = Math.random().toString(36).slice(2, 8);
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}

/* ── Мок Claude: всегда HTTP 500 → pre-stream → ретрай → пауза ─────────── */
const MOCK_PORT = 3912;
const mock = { calls: 0 };
const mockSrv = http.createServer((req, res) => {
  req.on("data", () => {});
  req.on("end", () => {
    mock.calls++;
    res.writeHead(500, { "content-type": "application/json" });
    res.end(J({ type: "error", error: { type: "api_error", message: "mock 500 (13.2)" } }));
  });
});
await new Promise((r) => mockSrv.listen(MOCK_PORT, "127.0.0.1", r));

/* ── Серверы ─────────────────────────────────────────────────────────── */
const procs = [];
function startServer(port, extraEnv, logFile) {
  const log = openSync(logFile, "w");
  const p = spawn(process.execPath, ["--import", "tsx", "index.ts"], {
    cwd: ROOT + "server", detached: true, stdio: ["ignore", log, log],
    env: {
      ...process.env, PORT: String(port), MAIL_TRANSPORT: "console", BILLING_ENFORCE: "false",
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`, ANTHROPIC_API_KEY: "mock-key-132", STREAM_RETRY_DELAYS: "50",
      API_KEY_ENCRYPTION_SECRET: "s132-" + "s".repeat(40), CLIENT_ORIGIN: "http://127.0.0.1:5199",
      RATE_LIMIT_HTTP_PER_MINUTE: "100000", RATE_LIMIT_MAIL_PER_HOUR: "100000", TRUST_PROXY: "false", HOST: "",
      ...extraEnv,
    },
  });
  procs.push(p);
  return p;
}
const killAll = () => { for (const p of procs) { try { process.kill(-p.pid, "SIGKILL"); } catch {} } procs.length = 0; };
async function isUp(base) { try { return (await fetch(`${base}/health`)).status < 500; } catch { return false; } }
async function waitUp(base, what) { for (let i = 0; i < 120; i++) { if (await isUp(base)) return; await sleep(500); } throw new Error(`${what} не поднялся`); }
const flushLimiter = () => spawnSync("sh", ["-c", "redis-cli --scan --pattern 'rate_limit:*' | xargs -r redis-cli del >/dev/null"]);

function clientOf(base) {
  return async function api(path, init = {}, cookie) {
    const headers = { ...(init.headers ?? {}) };
    if (cookie) headers.cookie = cookie;
    const r = await fetch(`${base}${path}`, { ...init, headers });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text, headers: r.headers };
  };
}
const userIds = [];
async function account(base, tag) {
  const email = `t132-${tag}-${Date.now()}@example.com`, password = "password-132";
  const rr = await fetch(`${base}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  if (rr.status !== 201 && rr.status !== 200) throw new Error(`register ${rr.status}: ${await rr.text()}`);
  const cookie = await login(base, email, password);
  const [u] = await sql`select id from users where email=${email}`;
  userIds.push(u.id);
  return { cookie, email, password, id: u.id };
}
async function login(base, email, password) {
  const lr = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  if (lr.status !== 200) throw new Error(`login ${lr.status}: ${await lr.text()}`);
  return lr.headers.get("set-cookie").split(";")[0];
}

/* ── Фикстуры БД ─────────────────────────────────────────────────────── */
const ids = [];
const SEC = (num, title, subs) =>
  `<div class="doc-section"><div class="section-num">§ ${num}</div><div class="section-title">${title}</div><div class="doc-content">${subs.map(([s, b]) => `<div data-section="${s}"><h4>${s}</h4>${b}</div>`).join("")}</div></div>`;
const CAP = (t) => `<div class="doc-section"><div class="doc-content"><div data-section="Капсула"><p>Содержимое капсулы ${t}</p></div></div></div>`;
/** Концепция, годная в участники мета-синтеза (validateConceptForMetaSynthesis: sum/glossary/theses/critique + graph + капсула). */
async function mkConcept(userId, title, visibility, allowMeta, full = false) {
  const order = full ? ["sum", "graph", "glossary", "theses", "critique", "capsule"] : ["sum", "capsule"];
  const [row] = await sql`insert into syntheses (user_id, seed, title, status, visibility, allow_meta, section_order, capsule_html, method, synth_level)
    values (${userId}, ${"зерно " + title}, ${title}, 'ready', ${visibility}, ${allowMeta}, ${sql.json(order)}, ${CAP(title)}, 'dialectical', 'comparative') returning id`;
  ids.push(row.id);
  const secs = full
    ? [["sum", 1, "Резюме", [["Цели и метод", `<p>Цели ${title}</p>`], ["Портреты", `<p>Портрет ${title}</p>`], ["Напряжения", `<p>Напряжение ${title}</p>`]]],
       ["graph", 2, "Граф", [["Узлы", `<ul><li>Узел ${title}</li></ul>`], ["Рёбра", `<p>Ребро ${title}</p>`]]],
       ["glossary", 3, "Глоссарий", [["Таблица", `<table class="doc-table"><tr><td>Термин ${title}</td><td>значение</td></tr></table>`]]],
       ["theses", 4, "Тезисы", [["Сводка", `<p>Тезис ${title}</p>`]]],
       ["critique", 5, "Критика", [["Новизна", `<p>Критика ${title}</p>`]]]]
    : [["sum", 1, "Резюме", [["Цели", `<p>Цели ${title}</p>`]]]];
  for (const [key, num, label, subs] of secs) {
    await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${row.id}, ${key}, ${num}, ${label}, ${SEC(num, label, subs)})`;
  }
  return row.id;
}
const stateOf = (html) => { const m = /<script type="application\/json" id="philosynth-state">\s*([\s\S]*?)\s*<\/script>/.exec(html); return m ? JSON.parse(m[1]) : null; };
const conceptsOf = (st) => (st.params?.participants ?? []).filter((p) => p.type !== "philosopher");

try {
  flushLimiter();
  /* ═══════════════════════ R2. Д-65 живьём ════════════════════════════ */
  console.log("\n■ R2. Д-65 — пауза на моке у концепции с родителем");
  const A = "http://127.0.0.1:3132/api/v1";
  startServer(3132, {}, "/tmp/t132-A.log");
  await waitUp(A, "сервер A");
  const apiA = clientOf(A);
  const owner = await account(A, "owner");
  const other = await account(A, "other");
  const P = await mkConcept(owner.id, `родитель ${TAG}`, "private", true, true);
  const created = await apiA("/syntheses", { method: "POST", headers: { "Content-Type": "application/json" }, body: J({
    seed: `Мета-синтез с паузой ${TAG}`, philosophers: ["Гегель"], participants: [{ type: "synthesis", synthesisId: P }],
    sections: ["theses"], method: "dialectical", depth: "overview", synthLevel: "comparative",
  }) }, owner.cookie);
  ok(created.status === 201 && !!created.json?.id, "R2.1 POST /syntheses с родителем-концепцией → 201", { status: created.status, text: created.text.slice(0, 300) });
  const CH = created.json.id; ids.push(CH);
  let st = "";
  for (let i = 0; i < 120; i++) { st = (await sql`select status from syntheses where id=${CH}`)[0]?.status; if (st === "ready" || st === "error" || st === "paused") break; await sleep(500); }
  ok(st === "paused" && mock.calls >= 2, `R2.2 мок падает (HTTP 500 ×${mock.calls}) → status='paused'`, { st, calls: mock.calls });
  const [{ ps }] = await sql`select paused_state ps from syntheses where id=${CH}`;
  const psConcepts = (ps?.genParams?.conceptParticipants ?? ps?.genParams?.participants ?? []).filter((p) => p.type === "synthesis");
  ok(ps?.kind === "gen" && ps.reasonKind === "pre-stream" && psConcepts.length === 1 && typeof psConcepts[0].capsule === "string" && psConcepts[0].capsule.includes("родитель"), "R2.3 paused_state.genParams несёт содержимое родителя (капсула) — то, что не должно уйти чужому", { kind: ps?.kind, reasonKind: ps?.reasonKind, keys: psConcepts[0] && Object.keys(psConcepts[0]) });
  await sql`update syntheses set visibility='full' where id=${CH}`;
  const gOwner = await apiA(`/syntheses/${CH}`, {}, owner.cookie);
  const gOther = await apiA(`/syntheses/${CH}`, {}, other.cookie);
  const gGuest = await apiA(`/syntheses/${CH}`);
  ok(gOwner.status === 200 && gOwner.json.synthesis.pausedState?.kind === "gen" && gOwner.json.synthesis.pauseEstimates && typeof gOwner.json.synthesis.pauseEstimates === "object", "R2.4 владельцем — как прежде: pausedState kind='gen', pauseEstimates есть", { ps: !!gOwner.json?.synthesis?.pausedState, est: gOwner.json?.synthesis?.pauseEstimates });
  ok(gOther.status === 200 && gOther.json.synthesis.scope === "full" && gOther.json.synthesis.pausedState === null && gOther.json.synthesis.pauseEstimates === null && typeof gOther.json.synthesis.totalCostUsd !== "undefined", "R2.5 чужим зарегистрированным при visibility='full' — pausedState и pauseEstimates null (стоимость видна, как прежде)", { scope: gOther.json?.synthesis?.scope, ps: gOther.json?.synthesis?.pausedState });
  ok(gGuest.status === 200 && gGuest.json.synthesis.pausedState === null && gGuest.json.synthesis.pauseEstimates === null && !("totalCostUsd" in gGuest.json.synthesis), "R2.6 гостем — как прежде: null и без стоимости");
  ok(!gOther.text.includes("Содержимое капсулы родитель") && !gGuest.text.includes("Содержимое капсулы родитель") && gOwner.text.includes("Содержимое капсулы родитель"), "R2.7 капсула приватного родителя — только в ответе владельца");
  const eOwner = await apiA(`/syntheses/${CH}/export/html`, {}, owner.cookie);
  const eOther = await apiA(`/syntheses/${CH}/export/html`, {}, other.cookie);
  ok(eOwner.status === 200 && eOther.status === 200, "R2.8 выгрузка HTML владельцу и чужому → 200", { o: eOwner.status, x: eOther.status, t: eOther.text.slice(0, 200) });
  const stO = stateOf(eOwner.text), stX = stateOf(eOther.text);
  ok(stO?.pausedState?.kind === "gen" && stX && stX.pausedState === null, "R2.9 philosynth-state: pausedState у владельца есть, у чужого — null");
  ok(conceptsOf(stO).length === 1 && typeof conceptsOf(stO)[0].capsule === "string" && conceptsOf(stX).length === 1 && !("capsule" in conceptsOf(stX)[0]) && !("thesesSummary" in conceptsOf(stX)[0]) && conceptsOf(stX)[0].synthesisId === P, "R2.10 params выгрузки: содержимое родителя у владельца есть, у чужого снято (идентичность цела)");
  ok(!eOther.text.includes("Содержимое капсулы родитель") && eOwner.text.includes("Содержимое капсулы родитель"), "R2.11 в файле чужого нет капсулы приватного родителя");
  const [{ st2 }] = await sql`select status st2 from syntheses where id=${CH}`;
  ok(st2 === "paused", "R2.12 чтение невладельцем не тронуло паузу (status='paused')");

  /* ═══════════════════════ R3. Д-66 ═══════════════════════════════════ */
  console.log("\n■ R3. Д-66 — импорт файла с UUID шести родителей");
  const fPriv = await mkConcept(other.id, `чужая приватная ${TAG}`, "private", true);
  const fNoMeta = await mkConcept(other.id, `чужая без мета ${TAG}`, "full", false);
  const fShow = await mkConcept(other.id, `чужая витрина ${TAG}`, "showcase", true);
  const fMeta = await mkConcept(other.id, `чужая открытая ${TAG}`, "full", true);
  const own = await mkConcept(owner.id, `своя ${TAG}`, "private", false);
  const ownChild = await mkConcept(owner.id, `свой потомок ${TAG}`, "private", false);
  await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${ownChild}, 'synthesis', ${own}, 0)`;
  const src = await mkConcept(owner.id, `исходник ${TAG}`, "full", true);
  const eSrc = await apiA(`/syntheses/${src}/export/html`, {}, owner.cookie);
  ok(eSrc.status === 200, "R3.0 выгрузка исходника для файла → 200", eSrc.status);
  const stS = stateOf(eSrc.text);
  const FILE_NAMES = { [fPriv]: "Чужая приватная", [fNoMeta]: "Чужая без мета", [fShow]: "Чужая витрина", [fMeta]: "Чужая открытая", [own]: "Своя", [ownChild]: "Свой потомок" };
  stS.genealogy.participants = Object.entries(FILE_NAMES).map(([synthesisId, name]) => ({ type: "concept", name, synthesisId }));
  const file = eSrc.text.replace(/(<script type="application\/json" id="philosynth-state">\s*)[\s\S]*?(\s*<\/script>)/, (_m, a, b) => `${a}${J(stS)}${b}`);
  const fd = new FormData();
  fd.append("file", new Blob([file], { type: "text/html" }), `t132-${TAG}.html`);
  const ir = await apiA("/syntheses/import", { method: "POST", body: fd }, owner.cookie);
  ok(ir.status === 200 || ir.status === 201, "R3.1 импорт прошёл", { status: ir.status, text: ir.text.slice(0, 300) });
  const IMP = ir.json?.id; if (IMP) ids.push(IMP);
  const linked = IMP ? await sql`select parent_synthesis_id p, position pos from synthesis_lineage where synthesis_id=${IMP} and parent_type='synthesis' order by position` : [];
  const linkedIds = linked.map((r) => r.p);
  ok(linkedIds.length === 3 && linkedIds.includes(fMeta) && linkedIds.includes(own) && linkedIds.includes(ownChild), "R3.2 связи записаны ровно для чужой full+allow_meta, своей и своего потомка", linked);
  ok(!linkedIds.includes(fPriv) && !linkedIds.includes(fNoMeta) && !linkedIds.includes(fShow), "R3.3 приватная, full без allow_meta и витрина — связи нет");
  ok(linked.map((r) => r.pos).join() === [fMeta, own, ownChild].map((id) => Object.keys(FILE_NAMES).indexOf(id)).join(), "R3.4 позиции — индексы участников файла", linked.map((r) => r.pos));
  const lw = (ir.json?.warnings ?? []).filter((w) => w.field === "lineage" && /по правилу доступа/.test(w.message));
  ok(lw.length === 3 && ["Чужая приватная", "Чужая без мета", "Чужая витрина"].every((n) => lw.some((w) => w.message.includes(`«${n}»`))), "R3.5 три предупреждения «не годится по правилу доступа» — с именами из файла", lw.map((w) => w.message.slice(0, 60)));
  const cands = ir.json?.lineageCandidates ?? [];
  ok(cands.length === 3 && cands.every((c) => c.parentName && Array.isArray(c.matches)) && cands.map((c) => c.position).join() === "0,1,2", "R3.6 отклонённые — кандидатами по имени (связь не пишется молча)", cands);
  ok(!ir.text.includes(`чужая приватная ${TAG}`) && !ir.text.includes(`чужая витрина ${TAG}`) && !ir.text.includes(`чужая без мета ${TAG}`), "R3.7 названия чужих концепций из БД в ответе не раскрыты");
  const [{ nOwnChild }] = await sql`select count(*)::int "nOwnChild" from synthesis_lineage where synthesis_id=${ownChild}`;
  ok(nOwnChild === 1, "R3.8 родословная потомка не тронута импортом");
  // Отчёт на КОПИИ БД со «старой» строкой
  const env = { ...process.env, PGPASSWORD: "philosynth_dev" };
  spawnSync("dropdb", ["-h", "localhost", "-U", "philosynth", "--if-exists", COPY_DB], { env });
  const cr = spawnSync("createdb", ["-h", "localhost", "-U", "philosynth", COPY_DB], { env, encoding: "utf8" });
  const dump = spawnSync("sh", ["-c", `pg_dump -h localhost -U philosynth philosynth | psql -q -h localhost -U philosynth ${COPY_DB} >/dev/null`], { env, encoding: "utf8" });
  ok(cr.status === 0 && dump.status === 0, "R3.9 копия БД снята (pg_dump → philosynth_copy_132)", (cr.stderr ?? "") + (dump.stderr ?? "").slice(0, 300));
  const sqlCopy = postgres(COPY_URL, { onnotice: () => {} });
  const [legacy] = await sqlCopy`insert into syntheses (user_id, seed, title, status) values (${owner.id}, 'з', ${"legacy " + TAG}, 'ready') returning id`;
  await sqlCopy`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${legacy.id}, 'synthesis', ${fPriv}, 0)`;
  await sqlCopy`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${legacy.id}, 'synthesis', ${fShow}, 1)`;
  const [{ beforeN }] = await sqlCopy`select count(*)::int "beforeN" from synthesis_lineage`;
  const [{ mainBefore }] = await sql`select count(*)::int "mainBefore" from synthesis_lineage`;
  const runReport = (args) => spawnSync(process.execPath, ["node_modules/.bin/tsx", "scripts/maintenance/lineage-parent-access-report.ts", ...args], { cwd: ROOT, encoding: "utf8", env: { ...process.env, DATABASE_URL: COPY_URL } });
  const rep = runReport(["--json"]);
  const repJson = (() => { try { return JSON.parse(rep.stdout.trim().split("\n").pop()); } catch { return null; } })();
  const viol = repJson?.violations ?? [];
  ok(rep.status === 0 && viol.some((v) => v.child.id === legacy.id && v.parent.id === fPriv && v.reason === "private") && viol.some((v) => v.child.id === legacy.id && v.parent.id === fShow && v.reason === "showcase"), "R3.10 отчёт на копии находит обе «старые» строки (приватная, витрина) с причиной", rep.stdout.slice(-500) + rep.stderr.slice(-300));
  ok(!viol.some((v) => v.child.id === IMP) && !viol.some((v) => v.child.id === ownChild) && !viol.some((v) => v.child.id === CH), "R3.11 отчёт не считает нарушением связи, записанные по правилу (включая свой приватный родитель)", viol.map((v) => [v.child.id, v.reason]));
  const repText = runReport(["--dry"]);
  ok(repText.status === 0 && /не годится: 2/.test(repText.stdout) && /НЕ сняты/.test(repText.stdout) && repText.stdout.includes(`legacy ${TAG}`), "R3.12 текстовый отчёт (--dry): 2 нарушения, «строки НЕ сняты»", repText.stdout.slice(-400));
  const [{ afterN }] = await sqlCopy`select count(*)::int "afterN" from synthesis_lineage`;
  const [{ mainAfter }] = await sql`select count(*)::int "mainAfter" from synthesis_lineage`;
  ok(afterN === beforeN && mainAfter === mainBefore, "R3.13 отчёт ничего не изменил ни в копии, ни в рабочей базе", { beforeN, afterN, mainBefore, mainAfter });
  ok(runReport(["--unlink"]).status === 2 && runReport(["--fix"]).status === 2, "R3.14 любой ключ снятия — отказ (код 2)");
  await sqlCopy.end();
  spawnSync("dropdb", ["-h", "localhost", "-U", "philosynth", "--if-exists", COPY_DB], { env });
  killAll();

  /* ═══════════════════════ R4. Д-67 ═══════════════════════════════════ */
  console.log("\n■ R4. Д-67 — лимитер (сервер B: лимит 50/мин, TRUST_PROXY=false)");
  flushLimiter();
  const B = "http://127.0.0.1:3133/api/v1";
  startServer(3133, { RATE_LIMIT_HTTP_PER_MINUTE: "50", RATE_LIMIT_MAIL_PER_HOUR: "2" }, "/tmp/t132-B.log");
  await waitUp(B, "сервер B");
  const apiB = clientOf(B);
  // аккаунты и вторая сессия — до потопа (регистрация и вход идут по ключу ip:)
  { const w = 60000 - (Date.now() % 60000); if (w < 25000) await sleep(w + 200); }
  flushLimiter();
  const u = await account(B, "u");
  const cookie2 = await login(B, u.email, u.password);
  ok(cookie2 !== u.cookie, "R4.0 две сессии одного пользователя заведены");
  const rnd = () => `philosynth_session=${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  const statuses = [];
  for (let i = 0; i < 100; i++) {
    const r = await apiB("/syntheses/public", { headers: { "x-forwarded-for": `203.0.113.${i % 250}` } }, rnd());
    statuses.push(r.status);
    if (r.status === 429 && statuses.filter((s) => s === 429).length === 1) {
      ok(r.json?.code === "RATE_LIMIT" && typeof r.json?.details?.retryAfter === "number" && r.headers.get("retry-after") !== null, "R4.1 первый отказ — 429 RATE_LIMIT с retryAfter и Retry-After", r.json);
    }
  }
  const n200 = statuses.filter((s) => s === 200).length, n429 = statuses.filter((s) => s === 429).length;
  const spent = 3; // register + login + login — те же ip:
  ok(n200 === 50 - spent && n429 === 100 - (50 - spent) && statuses.slice(0, 50 - spent).every((s) => s === 200) && statuses.slice(50 - spent).every((s) => s === 429), `R4.2 100 запросов с разной случайной cookie (и случайным X-Forwarded-For) с одного адреса → ${50 - spent}×200, затем RATE_LIMIT`, { n200, n429, head: statuses.slice(44, 50) });
  // квота пользователя — отдельная (u:), две сессии делят её
  const sess = [];
  for (let i = 0; i < 51; i++) sess.push((await apiB("/syntheses/public", {}, i % 2 ? cookie2 : u.cookie)).status);
  ok(sess.slice(0, 50).every((s) => s === 200) && sess[50] === 429, "R4.3 две сессии одного пользователя делят одну квоту u: (50×200, 51-й → 429), квота адреса их не касается", { first429: sess.indexOf(429), tail: sess.slice(-3) });
  // mailLimiter — ждём чистое окно минуты (ip-квота исчерпана потопом)
  { const w = 60000 - (Date.now() % 60000); await sleep(w + 300); }
  const mail = [];
  for (let i = 0; i < 3; i++) mail.push(await apiB("/auth/password-reset/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email: `nobody-${i}-${TAG}@example.org` }) }, rnd()));
  ok(mail[0].status === 200 && mail[1].status === 200 && mail[2].status === 429 && mail[2].json?.code === "RATE_LIMIT" && mail[2].json?.details?.retryAfter > 60, "R4.4 форма сброса пароля со случайными cookie упирается в mailLimiter (третий — 429, окно часовое)", mail.map((m) => [m.status, m.json?.details?.retryAfter]));
  const probe = await apiB("/syntheses/public", {}, rnd());
  ok(probe.status === 200, "R4.5 общий лимит в новом окне не исчерпан — отказ выше был именно mailLimiter", probe.status);
  killAll();

  console.log("\n■ R4 (продолжение). Сервер C: TRUST_PROXY=true, HOST=127.0.0.1, лимит 5/мин");
  flushLimiter();
  const C = "http://127.0.0.1:3134/api/v1";
  startServer(3134, { RATE_LIMIT_HTTP_PER_MINUTE: "5", TRUST_PROXY: "true", HOST: "127.0.0.1" }, "/tmp/t132-C.log");
  await waitUp(C, "сервер C");
  const apiC = clientOf(C);
  const distinct = [];
  for (let i = 0; i < 20; i++) distinct.push((await apiC("/syntheses/public", { headers: { "x-forwarded-for": `198.51.100.${i + 1}, 10.0.0.1` } }, rnd())).status);
  ok(distinct.every((s) => s === 200), "R4.6 с TRUST_PROXY: 20 запросов с разными X-Forwarded-For — у каждого своя квота (все 200)", distinct);
  const same = [];
  for (let i = 0; i < 6; i++) same.push((await apiC("/syntheses/public", { headers: { "x-forwarded-for": "198.51.100.1, 10.0.0.1" } }, rnd())).status);
  ok(same.slice(0, 4).every((s) => s === 200) && same[4] === 429 && same[5] === 429, "R4.7 с TRUST_PROXY: тот же первый адрес списка — квота общая (одна единица уже потрачена, ещё 4×200, затем 429)", same);
  const real = [];
  for (let i = 0; i < 6; i++) real.push((await apiC("/syntheses/public", { headers: { "x-real-ip": "192.0.2.7" } }, rnd())).status);
  ok(real.slice(0, 5).every((s) => s === 200) && real[5] === 429, "R4.8 с TRUST_PROXY: X-Real-IP — запасной ключ (5×200, 6-й → 429)", real);
  const logC = readFileSync("/tmp/t132-C.log", "utf8");
  ok(!logC.includes("TRUST_PROXY=true, а HOST") && logC.includes("http://127.0.0.1:3134/api/v1/health"), "R4.9 HOST=127.0.0.1: слушает петлю, предупреждения нет", logC.slice(0, 300));
  killAll();

  flushLimiter();
  startServer(3135, { TRUST_PROXY: "true", HOST: "" }, "/tmp/t132-E.log");
  await waitUp("http://127.0.0.1:3135/api/v1", "сервер E");
  const logE = readFileSync("/tmp/t132-E.log", "utf8");
  ok(/TRUST_PROXY=true, а HOST=\(все интерфейсы\)/.test(logE) && logE.includes("HOST=127.0.0.1"), "R4.10 TRUST_PROXY=true без HOST — предупреждение при старте с подсказкой HOST=127.0.0.1", logE.slice(0, 400));
  killAll();
} catch (e) {
  failed++;
  fails.push("исключение сценария");
  console.error("ИСКЛЮЧЕНИЕ:", e);
} finally {
  console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  killAll();
  try {
    for (const id of ids) await sql`delete from syntheses where id=${id}`;
    for (const id of userIds) await sql`delete from syntheses where user_id=${id}`;
    for (const id of userIds) await sql`delete from users where id=${id}`;
  } catch (e) { console.error("уборка:", e); }
  spawnSync("dropdb", ["-h", "localhost", "-U", "philosynth", "--if-exists", COPY_DB], { env: { ...process.env, PGPASSWORD: "philosynth_dev" } });
  flushLimiter();
  mockSrv.close();
  await Promise.race([sql.end(), sleep(2000)]);
  process.exit(failed ? 1 : 0);
}
