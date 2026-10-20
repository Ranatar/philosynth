/**
 * smoke-132-request1 — первый запрос беседы 13.2 (утечки и лимитер: Д-65, Д-66, Д-67).
 * Живой сервер :3132 + PG16/Redis; мок Claude и браузер не нужны (беседа серверная).
 *
 *   A. Чистые функции (в процессе): metaParentAllowed — таблица истинности правила 8.6 п.8;
 *      stripParentContent — содержимое родителей снято, идентичность и философы целы;
 *      firstForwardedAddress; clientIdentity на мини-Hono — u:{userId} у проверенной сессии,
 *      ip:… без неё, одинаковый ключ у разных непроверенных cookie, X-Forwarded-For только
 *      под TRUST_PROXY; resolveSession переиспользует сессию, положенную глобальным проходом
 *      (requireAuth без БД пропускает подставленного пользователя и отвечает 401 на user=null).
 *   B. Живой сервер (RATE_LIMIT_HTTP_PER_MINUTE=6, TRUST_PROXY=false):
 *      Д-65 — концепция 'full' с паузой и приватным родителем: владельцу GET /:id несёт
 *      pausedState/pauseEstimates, чужому зарегистрированному — оба null, гостю — null;
 *      выгрузка владельца несёт pausedState и капсулу родителя в params, выгрузка чужого — нет
 *      (идентичность родителя остаётся);
 *      Д-66 — импорт файла с UUID чужой приватной / чужой full без allow_meta / своей:
 *      связь только со своей, две отклонены предупреждением и кандидатами, название чужой не
 *      раскрыто; отчёт report:lineage-parents находит строку, вставленную «по-старому», и не
 *      меняет её;
 *      Д-67 — семь запросов с разной случайной cookie с одного адреса → 429 после шестого;
 *      две сессии одного пользователя делят квоту (429 на седьмом общем); X-Forwarded-For без
 *      TRUST_PROXY квоту не обновляет; форма сброса пароля со случайными cookie упирается в
 *      mailLimiter (RATE_LIMIT_MAIL_PER_HOUR=2 → третий запрос 429).
 *
 * Запуск из корня:  node_modules/.bin/tsx tests/smoke-132-request1.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { openSync } from "node:fs";
import postgres from "postgres";
import { Hono } from "hono";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3132;
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
const TAG = Math.random().toString(36).slice(2, 8);

/* ── Модули в процессе ───────────────────────────────────────────────── */
const VIS = await import("@philosynth/shared/utils/visibility");
const HE = await import("../server/services/export/html-exporter.ts");
const CA = await import("../server/utils/client-address.ts");
const RL = await import("../server/middleware/rate-limiter.ts");
const AUTH = await import("../server/middleware/auth.ts");
const ENV = (await import("../server/env.ts")).env;

const procs = [];
function sp(args, cwd, env, logFile) {
  const log = openSync(logFile, "w");
  const p = spawn(process.execPath, args, { cwd, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...env } });
  procs.push(p);
  return p;
}
async function isUp(url) { try { return (await fetch(url)).status < 500; } catch { return false; } }
async function waitUp(url, what) { for (let i = 0; i < 120; i++) { if (await isUp(url)) return; await sleep(500); } throw new Error(`${what} не поднялся`); }

const ids = [];
const userIds = [];
async function api(path, init = {}, cookie) {
  const headers = { ...(init.headers ?? {}) };
  if (cookie) headers.cookie = cookie;
  const r = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
}
async function account(tag) {
  const email = `s132-${tag}-${Date.now()}@example.com`, password = "password-132";
  const rr = await api("/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  if (rr.status !== 201 && rr.status !== 200) throw new Error(`register ${rr.status}: ${rr.text}`);
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  userIds.push(u.id);
  return { cookie, email, password, id: u.id };
}
const SEC = (title, sub, body) =>
  `<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">${title}</div><div class="doc-content"><div data-section="${sub}"><h4>${sub}</h4>${body}</div></div></div>`;
async function mkSynth(userId, title, visibility, allowMeta, extra = {}) {
  const [row] = await sql`insert into syntheses (user_id, seed, title, status, visibility, allow_meta, section_order, capsule_html, paused_state)
    values (${userId}, ${"зерно " + TAG}, ${title}, ${extra.status ?? "ready"}, ${visibility}, ${allowMeta}, ${sql.json(["sum", "capsule"])},
      ${`<div class="doc-section"><div class="doc-content"><div data-section="Капсула"><p>Содержимое капсулы ${title}</p></div></div></div>`},
      ${extra.pausedState ? sql.json(extra.pausedState) : null}) returning id`;
  ids.push(row.id);
  await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${row.id}, 'sum', 1, 'Резюме', ${SEC("Резюме", "Цели", `<p>Цели ${title}</p>`)})`;
  return row.id;
}
const stateOf = (html) => JSON.parse(/<script type="application\/json" id="philosynth-state">\s*([\s\S]*?)\s*<\/script>/.exec(html)[1]);

try {
  /* ══ A. Чистые функции ══════════════════════════════════════════════ */
  console.log("\nA. Чистые функции");
  const row = (v, allowMeta, userId = "owner") => ({ userId, visibility: v, showAuthor: false, showLogs: false, showPrompts: false, allowMeta });
  ok(VIS.metaParentAllowed(row("private", false), "owner") && VIS.metaParentAllowed(row("showcase", false), "owner"), "A1 metaParentAllowed: своя — всегда, даже приватная без allow_meta");
  ok(!VIS.metaParentAllowed(row("private", true), "x") && !VIS.metaParentAllowed(row("showcase", true), "x"), "A2 metaParentAllowed: чужая приватная/витрина — никогда");
  ok(!VIS.metaParentAllowed(row("full", false), "x") && VIS.metaParentAllowed(row("full", true), "x"), "A3 metaParentAllowed: чужая full — только при allow_meta");
  ok(!VIS.metaParentAllowed(row("full", false), null) && VIS.metaParentAllowed(row("full", true), null), "A4 metaParentAllowed: гостю — только чужая full+allow_meta");

  const params = {
    seed: "з", phil: ["Кант"],
    participants: [{ type: "philosopher", name: "Кант" }, { type: "synthesis", synthesisId: "p1", name: "Р", method: "dialectical", synthLevel: "comparative", seed: "s", capsule: "К", goals: "Ц", thesesSummary: "Т", graphNodes: "Г" }],
    conceptParticipants: [{ type: "synthesis", synthesisId: "p1", name: "Р", method: "dialectical", synthLevel: "comparative", seed: "s", capsule: "К", glossaryCompact: "Гл" }],
    secCtx: { sum: "x" },
  };
  const stripped = HE.stripParentContent(params);
  ok(stripped.participants[0].name === "Кант" && stripped.seed === "з" && stripped.secCtx.sum === "x", "A5 stripParentContent: философы и прочие параметры целы");
  ok(!("capsule" in stripped.participants[1]) && !("goals" in stripped.participants[1]) && !("thesesSummary" in stripped.participants[1]) && !("graphNodes" in stripped.participants[1]), "A6 stripParentContent: содержимое родителя снято в participants");
  ok(stripped.participants[1].synthesisId === "p1" && stripped.participants[1].name === "Р" && stripped.participants[1].method === "dialectical" && stripped.participants[1].seed === "s", "A7 stripParentContent: идентичность родителя (type/synthesisId/name/method/synthLevel/seed) цела");
  ok(!("capsule" in stripped.conceptParticipants[0]) && !("glossaryCompact" in stripped.conceptParticipants[0]) && stripped.conceptParticipants[0].synthesisId === "p1", "A8 stripParentContent: conceptParticipants — то же");
  ok(typeof params.participants[1].capsule === "string", "A9 stripParentContent не мутирует вход");

  ok(CA.firstForwardedAddress("203.0.113.7, 10.0.0.1") === "203.0.113.7" && CA.firstForwardedAddress(" 1.2.3.4 ") === "1.2.3.4" && CA.firstForwardedAddress("") === null && CA.firstForwardedAddress(undefined) === null, "A10 firstForwardedAddress — первый адрес списка");

  const mini = new Hono();
  mini.get("/anon", (c) => c.text(RL.clientIdentity(c)));
  mini.get("/user", (c) => { c.set("user", { id: "u-" + TAG }); return c.text(RL.clientIdentity(c)); });
  const idOf = async (path, headers) => (await mini.request(path, { headers })).text();
  const kA = await idOf("/anon", { cookie: "philosynth_session=aaaa" }), kB = await idOf("/anon", { cookie: "philosynth_session=bbbb" });
  ok(kA === kB && !kA.startsWith("s:") && kA.startsWith("ip:"), "A11 clientIdentity: разные непроверенные cookie → один ключ ip:, s: больше нет", { kA, kB });
  ok((await idOf("/user", {})) === `u:u-${TAG}`, "A12 clientIdentity: проверенная сессия → u:{userId}");
  const prevTrust = ENV.trustProxy;
  ENV.trustProxy = false;
  const fwdOff = await idOf("/anon", { "x-forwarded-for": "203.0.113.7, 10.0.0.1", "x-real-ip": "198.51.100.1" });
  ENV.trustProxy = true;
  const fwdOn = await idOf("/anon", { "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
  const realOn = await idOf("/anon", { "x-real-ip": "198.51.100.1" });
  ENV.trustProxy = prevTrust;
  ok(!fwdOff.includes("203.0.113.7") && !fwdOff.includes("198.51.100.1"), "A13 без TRUST_PROXY заголовки прокси не читаются", fwdOff);
  ok(fwdOn === "ip:203.0.113.7" && realOn === "ip:198.51.100.1", "A14 под TRUST_PROXY: X-Forwarded-For первым, X-Real-IP запасным", { fwdOn, realOn });

  // resolveSession: сессия, положенная глобальным проходом, переиспользуется без БД
  const app2 = new Hono();
  app2.use("/pre/*", async (c, next) => { c.set("user", { id: "pre-" + TAG, email: "e", displayName: null, role: "user", balanceUsd: 0, emailVerified: false, uiLocale: null, genLang: null }); c.set("session", { id: "sid", userId: "pre-" + TAG, expiresAt: new Date(Date.now() + 1e6) }); await next(); });
  app2.use("/guest/*", async (c, next) => { c.set("user", null); c.set("session", null); await next(); });
  app2.get("/pre/me", AUTH.requireAuth, (c) => c.json({ id: c.get("user").id }));
  app2.get("/guest/me", AUTH.requireAuth, (c) => c.json({ id: c.get("user").id }));
  app2.get("/guest/opt", AUTH.optionalAuth, (c) => c.json({ user: c.get("user") }));
  const pre = await app2.request("/pre/me", { headers: { cookie: "philosynth_session=garbage" } });
  ok(pre.status === 200 && (await pre.json()).id === "pre-" + TAG, "A15 requireAuth переиспользует сессию глобального прохода (cookie не перепроверяется)");
  const g1 = await app2.request("/guest/me", { headers: { cookie: "philosynth_session=garbage" } });
  ok(g1.status === 401, "A16 requireAuth при user=null глобального прохода → 401 без второй проверки");
  const g2 = await app2.request("/guest/opt", { headers: { cookie: "philosynth_session=garbage" } });
  ok(g2.status === 200 && (await g2.json()).user === null, "A17 optionalAuth при user=null глобального прохода — гость");

  /* ══ B. Живой сервер ════════════════════════════════════════════════ */
  console.log("\nB. Живой сервер");
  spawnSync("sh", ["-c", `ps -eo pid,args | awk '/[s]erver\\/index|tsx index.ts/ && /${PORT}/ {print $1}' | xargs -r kill -9`]);
  if (await isUp(`${BASE}/health`)) throw new Error(`порт ${PORT} занят чужим сервером`);
  sp(["--import", "tsx", "index.ts"], ROOT + "server", {
    PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "6", RATE_LIMIT_MAIL_PER_HOUR: "2", TRUST_PROXY: "false", HOST: "",
    MAIL_TRANSPORT: "console", ANTHROPIC_API_KEY: "", BILLING_ENFORCE: "false", API_KEY_ENCRYPTION_SECRET: "s132-" + "s".repeat(40),
    CLIENT_ORIGIN: "http://127.0.0.1:5199",
  }, "/tmp/s132-server.log");
  await waitUp(`${BASE}/health`, "сервер");
  // health — вне лимитера; аккаунты заводим ДО нагрузки на лимит
  // Лимитер считает по ключу; вход/регистрация под ним же — делаем их с запасом по окнам:
  // ключ анонима в этом процессе — ip:127.0.0.1 (все аккаунты заводятся с одного адреса),
  // поэтому регистрации идут в начале, а испытание лимита — отдельным окном (ждём смены минуты).
  // регистрации и входы идут под ключом ip: — начинаем с чистого окна минуты
  const freshWindow = async () => { const w = 60000 - (Date.now() % 60000); if (w < 20000) await sleep(w + 200); };
  await freshWindow();
  // счётчики лимитера прошлых прогонов (окно mail — час) — вычищаем, чтобы счёт шёл с нуля
  spawnSync("sh", ["-c", "redis-cli --scan --pattern 'rate_limit:*' | xargs -r redis-cli del >/dev/null"]);
  const owner = await account("owner");
  const other = await account("other");
  const me = await api("/auth/me", {}, owner.cookie);
  ok(me.status === 200 && me.json.user.id === owner.id, "B0 вход и /auth/me через глобальный optionalAuth → requireAuth");

  // Д-65
  const parentPriv = await mkSynth(owner.id, `родитель ${TAG}`, "private", true);
  const paused = { kind: "gen", passIdx: 1, sectionKeys: ["graph"], sectionLabel: "Граф", isPartial: false, reason: "обрыв", reasonKind: "pre-stream", timestamp: Date.now(), partialSubsections: [], expectedSubsections: [], completedPasses: [["sum"]], genParams: { seed: "секретное зерно " + TAG, secCtx: { graph: "секрет" } } };
  const child = await mkSynth(owner.id, `ребёнок ${TAG}`, "full", true, { status: "paused", pausedState: paused });
  await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${child}, 'synthesis', ${parentPriv}, 0)`;
  const gOwner = await api(`/syntheses/${child}`, {}, owner.cookie);
  const gOther = await api(`/syntheses/${child}`, {}, other.cookie);
  const gGuest = await api(`/syntheses/${child}`);
  ok(gOwner.status === 200 && gOwner.json.synthesis.pausedState?.kind === "gen" && gOwner.json.synthesis.pauseEstimates !== null, "B1 Д-65: владельцу GET /:id несёт pausedState и pauseEstimates", gOwner.json?.synthesis?.pausedState);
  ok(gOther.status === 200 && gOther.json.synthesis.pausedState === null && gOther.json.synthesis.pauseEstimates === null && gOther.json.synthesis.scope === "full", "B2 Д-65: чужому зарегистрированному на 'full' — pausedState и pauseEstimates null", gOther.json?.synthesis?.pausedState);
  ok(gGuest.status === 200 && gGuest.json.synthesis.pausedState === null && !("totalCostUsd" in gGuest.json.synthesis), "B3 Д-65: гостю — null (и без стоимости, как прежде)");
  ok(!J(gOther.json).includes("секретное зерно") && !J(gGuest.json).includes("секретное зерно"), "B4 Д-65: зерно паузы невладельцу не уходит");
  const eOwner = await api(`/syntheses/${child}/export/html`, {}, owner.cookie);
  const eOther = await api(`/syntheses/${child}/export/html`, {}, other.cookie);
  ok(eOwner.status === 200 && eOther.status === 200, "B5 выгрузка владельцу и чужому на 'full' отвечает 200", { o: eOwner.status, x: eOther.status });
  const stO = stateOf(eOwner.text), stX = stateOf(eOther.text);
  ok(stO.pausedState?.kind === "gen" && stX.pausedState === null, "B6 Д-65: pausedState в philosynth-state — только у владельца");
  const conceptsOf = (st) => st.params.participants.filter((p) => p.type !== "philosopher");
  ok(conceptsOf(stO).length === 1 && typeof conceptsOf(stO)[0].capsule === "string" && conceptsOf(stO)[0].capsule.includes("Содержимое капсулы"), "B7 Д-65: выгрузка владельца — params с капсулой родителя (как прежде)");
  ok(conceptsOf(stX).length === 1 && !("capsule" in conceptsOf(stX)[0]) && !("thesesSummary" in conceptsOf(stX)[0]) && conceptsOf(stX)[0].synthesisId === parentPriv, "B8 Д-65: выгрузка чужого — params без содержимого родителя, идентичность цела");
  ok(!eOther.text.includes("Содержимое капсулы родитель") && !eOther.text.includes("секретное зерно"), "B9 Д-65: в файле чужого нет ни капсулы родителя, ни зерна паузы");

  // Д-66
  const foreignPriv = await mkSynth(other.id, `чужая приватная ${TAG}`, "private", true);
  const foreignNoMeta = await mkSynth(other.id, `чужая без мета ${TAG}`, "full", false);
  const own = await mkSynth(owner.id, `своя ${TAG}`, "private", false);
  const src = await mkSynth(owner.id, `исходник ${TAG}`, "full", true);
  const eSrc = await api(`/syntheses/${src}/export/html`, {}, owner.cookie);
  const st = stateOf(eSrc.text);
  st.genealogy.participants = [
    { type: "concept", name: "Чужая приватная", synthesisId: foreignPriv },
    { type: "concept", name: "Чужая без мета", synthesisId: foreignNoMeta },
    { type: "concept", name: "Своя", synthesisId: own },
  ];
  const file = eSrc.text.replace(/(<script type="application\/json" id="philosynth-state">\s*)[\s\S]*?(\s*<\/script>)/, (_m, a, b) => `${a}${J(st)}${b}`);
  const fd = new FormData();
  fd.append("file", new Blob([file], { type: "text/html" }), `s132-${TAG}.html`);
  const ir = await api("/syntheses/import", { method: "POST", body: fd }, owner.cookie);
  ok(ir.status === 200 || ir.status === 201, "B10 импорт файла с тремя UUID прошёл", { status: ir.status, text: ir.text.slice(0, 300) });
  const impId = ir.json?.id;
  if (impId) ids.push(impId);
  const linked = impId ? await sql`select parent_synthesis_id p, position pos from synthesis_lineage where synthesis_id=${impId} and parent_type='synthesis'` : [];
  ok(linked.length === 1 && linked[0].p === own && linked[0].pos === 2, "B11 Д-66: связь только со своей концепцией, позиция — индекс в participants файла", linked);
  const lw = (ir.json?.warnings ?? []).filter((w) => w.field === "lineage");
  ok(lw.filter((w) => /по правилу доступа/.test(w.message)).length === 2, "B12 Д-66: два предупреждения «не годится по правилу доступа»", lw.map((w) => w.message.slice(0, 80)));
  ok((ir.json?.lineageCandidates ?? []).length === 2, "B13 Д-66: отклонённые ушли кандидатами по имени (связь не пишется молча)");
  ok(!J(ir.json).includes(`чужая приватная ${TAG}`), "B14 Д-66: название чужой приватной концепции в ответе не раскрыто");
  // отчёт о записанном «по-старому»
  const [legacy] = await sql`insert into syntheses (user_id, seed, title, status) values (${owner.id}, 'з', ${"legacy " + TAG}, 'ready') returning id`;
  ids.push(legacy.id);
  await sql`insert into synthesis_lineage (synthesis_id, parent_type, parent_synthesis_id, position) values (${legacy.id}, 'synthesis', ${foreignPriv}, 0)`;
  const rep = spawnSync(process.execPath, ["node_modules/.bin/tsx", "scripts/maintenance/lineage-parent-access-report.ts", "--json"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, DATABASE_URL: DB_URL } });
  const repJson = (() => { try { return JSON.parse(rep.stdout.trim().split("\n").pop()); } catch { return null; } })();
  ok(rep.status === 0 && repJson && repJson.violations.some((v) => v.child.id === legacy.id && v.parent.id === foreignPriv && v.reason === "private"), "B15 отчёт report:lineage-parents находит строку с чужим приватным родителем", rep.stdout.slice(-400) + rep.stderr.slice(-400));
  ok(repJson && !repJson.violations.some((v) => v.child.id === child), "B16 отчёт не считает нарушением собственного приватного родителя");
  const [{ n }] = await sql`select count(*)::int n from synthesis_lineage where synthesis_id=${legacy.id}`;
  ok(n === 1, "B17 отчёт ничего не снял");
  const repBad = spawnSync(process.execPath, ["node_modules/.bin/tsx", "scripts/maintenance/lineage-parent-access-report.ts", "--unlink"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, DATABASE_URL: DB_URL } });
  ok(repBad.status === 2, "B18 неизвестный ключ отчёта (снятие) — отказ");

  // Д-67: ждём начала новой минуты, чтобы окно лимита было чистым
  { const w = 60000 - (Date.now() % 60000); await sleep(w + 200); }
  const statuses = [];
  for (let i = 0; i < 7; i++) {
    const r = await api("/syntheses/public", {}, `philosynth_session=${Math.random().toString(36).slice(2)}`);
    statuses.push(r.status);
  }
  ok(statuses.slice(0, 6).every((s) => s === 200) && statuses[6] === 429, "B19 Д-67: семь запросов с разной случайной cookie с одного адреса → 429 на седьмом", statuses);
  const fwd = await api("/syntheses/public", { headers: { "x-forwarded-for": "203.0.113.9" } }, `philosynth_session=${Math.random().toString(36).slice(2)}`);
  ok(fwd.status === 429, "B20 Д-67: X-Forwarded-For без TRUST_PROXY квоту не обновляет", fwd.status);
  // окно сменится — две сессии одного пользователя делят квоту
  const wait2 = 60000 - (Date.now() % 60000);
  await sleep(wait2 + 200);
  const lr2 = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email: owner.email, password: owner.password }) });
  const cookie2 = lr2.headers.get("set-cookie").split(";")[0];
  ok(lr2.status === 200 && cookie2 !== owner.cookie, "B21 вторая сессия того же пользователя заведена");
  const st2 = [];
  for (let i = 0; i < 7; i++) st2.push((await api("/syntheses/public", {}, i % 2 ? cookie2 : owner.cookie)).status);
  ok(st2.slice(0, 6).every((s) => s === 200) && st2[6] === 429, "B22 Д-67: две сессии одного пользователя делят квоту u: (шесть общих — 200, седьмой → 429)", st2);
  // гость в том же окне квоты не лишён: его ключ — адрес, а не пользователь
  const guestNow = await api("/syntheses/public");
  ok(guestNow.status === 200, "B23 ключ пользователя не задевает квоту адреса в том же окне", guestNow.status);
  // mailLimiter — по тому же правилу: третий запрос формы сброса со случайными cookie → 429
  const wait3 = 60000 - (Date.now() % 60000);
  await sleep(wait3 + 200);
  const mail = [];
  for (let i = 0; i < 3; i++) {
    const r = await api("/auth/password-reset/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email: `nobody-${i}@example.org` }) }, `philosynth_session=${Math.random().toString(36).slice(2)}`);
    mail.push(r.status);
  }
  ok(mail[0] === 200 && mail[1] === 200 && mail[2] === 429, "B24 Д-67: форма сброса пароля со случайными cookie упирается в mailLimiter", mail);
} catch (e) {
  failed++;
  fails.push("исключение сценария");
  console.error("ИСКЛЮЧЕНИЕ:", e);
} finally {
  console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  try {
    for (const id of ids) await sql`delete from syntheses where id=${id}`;
    for (const id of userIds) await sql`delete from syntheses where user_id=${id}`;
    for (const id of userIds) await sql`delete from users where id=${id}`;
  } catch (e) { console.error("уборка:", e); }
  for (const p of procs) { try { process.kill(-p.pid, "SIGKILL"); } catch {} }
  await Promise.race([sql.end(), sleep(2000)]);
  process.exit(failed ? 1 : 0);
}
