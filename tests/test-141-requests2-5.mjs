/**
 * test-141-requests2-5 — тестовые запросы 2–5 беседы 14.1 (одним заходом).
 * Живой сервер :3142 + PG16/Redis; мок Stripe — в процессе (tools/stripe-mock.mjs);
 * мок Claude и браузер не нужны.
 *
 *   R2 (Д-58): опись ДО правки — прогон расширенной описи на коде dd1b1e0 (git worktree
 *      с текущими scripts/i18n) находит каждое место строк Д-51…Д-53, Д-56, Д-60 и даёт
 *      тот же счёт, что «По факту» (150 красных: 140 + 10, хранимых 23); ПОСЛЕ — ноль;
 *      новый русский литерал в details (временный файл в server/routes) → i18n:check
 *      --strict красный с этим местом.
 *   R3 (Д-52/Д-53/Д-60) под Accept-Language en и de: регистрация с пустым email →
 *      details; единственный администратор → 409 на языке запроса; несуществующий
 *      маршрут → 404 с переведённым error; правка подраздела с <script> → warnings на
 *      языке пользователя; поле правки с вложенным подразделом → строка-место переведена
 *      и сохранение проходит (и старый русский черновик тоже).
 *   R4 (Д-51): пользователь с ui_locale=de запрашивает сброс пароля → письмо в
 *      mail_outbox по-немецки (тема, текст, кнопка, «1 Stunde» — TTL сброса 1 час, не 2),
 *      lang="de"; ru-пользователь — побайтно как шаблоны dd1b1e0 (git show).
 *   R5 (Д-56/Д-61): PNG при en — легенда без кириллицы, типы переводом либо как есть;
 *      при ru — как прежде; сид цен на моке Stripe обновляет описание существующего
 *      продукта; Customer получает preferred_locales (Checkout у службы нет — п.0б
 *      «По факту 14.1»).
 *
 * Запуск из корня:  node_modules/.bin/tsx tests/test-141-requests2-5.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { openSync, writeFileSync, rmSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3142;
const STRIPE_PORT = 3869;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.STRIPE_API_BASE = `http://127.0.0.1:${STRIPE_PORT}`;
const BEFORE_REV = "dd1b1e0";
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CYR = /[А-Яа-яЁё]/;
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}
const TAG = Math.random().toString(36).slice(2, 8);
const SP = mkdtempSync(join(tmpdir(), "t141-"));

const { createStripeMock } = await import("../tools/stripe-mock.mjs");
const mock = createStripeMock({ port: STRIPE_PORT, bearer: "sk_test_mock", idTag: "t141" });
await mock.start();
const LOC = await import("../server/i18n/locale.ts");
LOC.installServerCatalogProvider();
const TPL = await import("../server/services/mail/templates.ts");
const SEEDP = await import("../scripts/seed/stripe-create-prices.ts");
const SUB = await import("../server/services/subscription-service.ts");
const canvas = await import("canvas");

const procs = [];
function sp(args, cwd, env, logFile) {
  const log = openSync(logFile, "w");
  const p = spawn(process.execPath, args, { cwd, detached: true, stdio: ["ignore", log, log], env: { ...process.env, ...env } });
  procs.push(p);
  return p;
}
async function isUp(url) { try { return (await fetch(url)).status < 500; } catch { return false; } }
async function waitUp(url, what) { for (let i = 0; i < 120; i++) { if (await isUp(url)) return; await sleep(500); } throw new Error(`${what} не поднялся`); }
const ids = [], userIds = [], demotedAdmins = [];
const probeFile = join(ROOT, "server/routes/__probe141.ts");
const worktree = join(SP, "wt-before");
async function api(path, init = {}, cookie, lang) {
  const headers = { ...(init.headers ?? {}) };
  if (cookie) headers.cookie = cookie;
  if (lang) headers["accept-language"] = lang;
  const r = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
}
async function account(tag, uiLocale = null) {
  const email = `t141-${tag}-${Date.now()}@example.com`, password = "password-141";
  const rr = await api("/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password, displayName: "Проверяющий" }) });
  if (rr.status !== 201 && rr.status !== 200) throw new Error(`register ${rr.status}: ${rr.text}`);
  const lr = await fetch(`${BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email, password }) });
  const cookie = lr.headers.get("set-cookie").split(";")[0];
  const [u] = await sql`select id from users where email=${email}`;
  userIds.push(u.id);
  if (uiLocale) await sql`update users set ui_locale=${uiLocale} where id=${u.id}`;
  return { cookie, email, password, id: u.id };
}
const SEC = (title, sub, body) =>
  `<div class="doc-section"><div class="section-num">§ 1</div><div class="section-title">${title}</div><div class="doc-content"><div data-section="${sub}"><h4>${sub}</h4>${body}</div></div></div>`;
async function mkSynth(userId, title, sectionHtml) {
  const [row] = await sql`insert into syntheses (user_id, seed, title, status, section_order) values (${userId}, ${"зерно " + TAG}, ${title}, 'ready', ${sql.json(["sum"])}) returning id`;
  ids.push(row.id);
  await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${row.id}, 'sum', 1, 'Резюме', ${sectionHtml})`;
  return row.id;
}
const SUBPATH = (sid) => `/syntheses/${sid}/sections/sum/subsections/${encodeURIComponent("Цели")}`;

try {
  /* ══ R2 ═══════════════════════════════════════════════════════════ */
  console.log("\nR2. Д-58 — опись до/после, красный на новом литерале");
  const wt = spawnSync("git", ["worktree", "add", "-q", worktree, BEFORE_REV], { cwd: ROOT, encoding: "utf8" });
  ok(wt.status === 0, `R2.1 git worktree ${BEFORE_REV} поднят`, wt.stderr);
  for (const f of ["ui-strings-lib.mjs", "i18n-check.mjs", "i18n-core.mjs"]) spawnSync("cp", [join(ROOT, "scripts/i18n", f), join(worktree, "scripts/i18n", f)]);
  spawnSync("ln", ["-s", join(ROOT, "node_modules"), join(worktree, "node_modules")]);
  const before = spawnSync(process.execPath, ["scripts/i18n/i18n-check.mjs"], { cwd: worktree, encoding: "utf8", env: { ...process.env, I18N_CHECK_FULL: "1" } });
  const bOut = before.stdout + before.stderr;
  const num = (re) => Number((re.exec(bOut) ?? [])[1] ?? -1);
  const unnamed = num(/литералы без ключа — дополнить names\.json: (\d+)/), keyed = num(/литералы с ключом — codemod не применён: (\d+)/), stored = num(/хранимые тексты сервера[^:]*: (\d+)/);
  ok(unnamed === 140 && keyed === 10 && stored === 23, "R2.2 расширенная опись на коде ДО правки: 140 безымянных + 10 с ключом = 150, хранимых 23 — как в «По факту»", { unnamed, keyed, stored });
  const perFile = {};
  for (const m of bOut.matchAll(/^ {4}(server\/[\w/.-]+\.ts):\d+ /gm)) perFile[m[1]] = (perFile[m[1]] ?? 0) + 1;
  const expect = { "server/services/mail/templates.ts": 13, "server/routes/auth.ts": 6, "server/routes/syntheses.ts": 22, "server/routes/taxonomy.ts": 10, "server/routes/enrichment.ts": 2, "server/routes/lineage.ts": 2, "server/routes/billing.ts": 1, "server/services/element-editor.ts": 24, "server/services/element-enrichment.ts": 5, "server/services/edit-planner.ts": 18, "server/services/account-deletion.ts": 1, "server/index.ts": 2, "server/ws/handler.ts": 3, "server/services/export/png-exporter.ts": 12, "server/utils/html-parser.ts": 9 };
  const diff = Object.entries(expect).filter(([f, n]) => perFile[f] !== n).map(([f, n]) => `${f}: ${perFile[f] ?? 0} ≠ ${n}`);
  ok(diff.length === 0, "R2.3 каждое место строк Д-51…Д-53, Д-56, Д-60 найдено — счёт по файлам совпадает с «По факту»", diff);
  const after = spawnSync(process.execPath, ["scripts/i18n/i18n-check.mjs", "--strict"], { cwd: ROOT, encoding: "utf8" });
  ok(after.status === 0 && /без ключа — дополнить names\.json: 0/.test(after.stdout) && /codemod не применён: 0/.test(after.stdout), "R2.4 ПОСЛЕ правок: ноль безымянных и с ключом, --strict зелёный", after.stdout.slice(-400));
  writeFileSync(probeFile, 'export function probe(d: Record<string, string>, body: unknown): void {\n  if (!body) d["field"] = "пробный русский литерал 141";\n}\n');
  const red = spawnSync(process.execPath, ["scripts/i18n/i18n-check.mjs", "--strict"], { cwd: ROOT, encoding: "utf8" });
  rmSync(probeFile, { force: true });
  ok(red.status === 1 && /server\/routes\/__probe141\.ts:2 пробный русский литерал 141/.test(red.stdout), "R2.5 новый русский литерал в details → --strict красный с этим местом", red.stdout.slice(-400));

  /* ══ R4 (в процессе): ru побайтно против шаблонов dd1b1e0 ═══════════ */
  console.log("\nR4a. Д-51 — ru побайтно против шаблонов до правки");
  const oldTpl = join(ROOT, "server/services/mail/templates.__old141.ts");
  const show = spawnSync("git", ["show", `${BEFORE_REV}:server/services/mail/templates.ts`], { cwd: ROOT, encoding: "utf8" });
  writeFileSync(oldTpl, show.stdout);
  let same = true, diffs = 0;
  try {
    const OLD = await import(oldTpl);
    for (const h of [1, 2, 3, 5, 11, 21, 22, 24, 48, 72, 100, 101, 104, 111, 112]) for (const dn of ["Иван", null, "", "  ", "Мария Петровна"]) for (const fn of ["verifyEmailLetter", "passwordResetLetter"]) {
      const a = J(OLD[fn]({ displayName: dn, link: "https://x/y?t=1", ttlHours: h }));
      const b = J(LOC.runWithLocale("ru", () => TPL[fn]({ displayName: dn, link: "https://x/y?t=1", ttlHours: h })));
      if (a !== b) { same = false; diffs++; }
    }
  } finally { rmSync(oldTpl, { force: true }); }
  ok(same, "R4.1 оба письма под ru — байт в байт как до правки (15 значений часов × 5 имён)", { diffs });

  /* ══ R5 (в процессе): PNG и Stripe ═══════════════════════════════════ */
  console.log("\nR5. Д-56/Д-61 — PNG и Stripe");
  const proto = canvas.CanvasRenderingContext2D.prototype;
  const origFill = proto.fillText;
  const drawn = [];
  proto.fillText = function (...a) { drawn.push(String(a[0])); return origFill.apply(this, a); };
  try {
    const { buildPNG } = await import("../server/services/export/png-exporter.ts");
    const G = {
      nodes: [{ name: "Alpha", type: "онтологическая", def: "", orig: "", cen: 0.9, cert: 0.8 }, { name: "Beta", type: "этическая", def: "", orig: "", cen: 0.6, cert: 0.5 }, { name: "Gamma", type: "", def: "", orig: "", cen: 0.5, cert: 0.5 }, { name: "Delta", type: "свой тип 141", def: "", orig: "", cen: 0.5, cert: 0.5 }],
      edges: [{ src: "Alpha", tgt: "Beta", type: "иерархическая", desc: "", dir: "однонаправленная", str: 0.7 }, { src: "Gamma", tgt: "Gamma", type: "противоречие", desc: "", dir: "рефлексивная", str: 0.5 }, { src: "Beta", tgt: "Delta", type: "своя связь 141", desc: "", dir: "двунаправленная", str: 0.4 }],
      topology: { clusters: { Alpha: [0, 1], Beta: [0], Gamma: [1] }, roles: { structural: { Alpha: ["core"], Beta: ["bridge"], Gamma: ["central"] }, procedural: { Alpha: ["synthesis"], Beta: ["thesis"], Gamma: ["foundation"] } }, clusterLabels: ["I — Foundations"] },
    };
    const png = LOC.runWithLocale("en", () => buildPNG(G));
    const cyr = drawn.filter((t) => CYR.test(t)).sort();
    ok(png[0] === 0x89 && png[1] === 0x50 && J(cyr) === J(["свой тип 141", "своя связь 141"]), "R5.1 PNG при en: кириллица только у значений без ключа (свой тип, своя связь)", cyr);
    for (const t of ["CATEGORY TYPES", "PROCEDURAL ROLES (SHAPE)", "STRUCTURAL ROLES (MARKER)", "RELATION TYPES", "CLUSTERS", "ontological", "ethical", "hierarchical", "contradiction", "other", "Cluster 2", "→ one-way · ↔ two-way · ↺ reflexive"]) ok(drawn.includes(t), `R5.2 PNG при en рисует «${t}»`);
    ok(drawn.some((t) => /— inner silhouette$/.test(t)) && drawn.some((t) => /— dashed outline$/.test(t)) && drawn.some((t) => /— bold outline$/.test(t)), "R5.3 описания маркеров структурных ролей — переводом", drawn.filter((t) => / — /.test(t)));
    drawn.length = 0;
    LOC.runWithLocale("ru", () => buildPNG(G));
    ok(["ТИПЫ КАТЕГОРИЙ", "ПРОЦЕССУАЛЬНЫЕ РОЛИ (ФОРМА)", "СТРУКТУРНЫЕ РОЛИ (МАРКЕР)", "ТИПЫ СВЯЗЕЙ", "КЛАСТЕРЫ", "онтологическая", "иерархическая", "другое", "Кластер 2", "→ однонаправл. · ↔ двунаправл. · ↺ рефлексив."].every((t) => drawn.includes(t)) && drawn.some((t) => /— внутренний силуэт$/.test(t)), "R5.4 PNG при ru — как прежде");
    const G0 = { nodes: [], edges: [], topology: { clusters: {}, roles: { structural: {}, procedural: {} }, clusterLabels: [] } };
    let noGraph = null;
    try { LOC.runWithLocale("en", () => buildPNG(G0)); } catch (e) { noGraph = e; }
    ok(noGraph && noGraph.code === "NO_GRAPH" && !CYR.test(noGraph.message), "R5.5 пустой граф под en — NO_GRAPH без кириллицы", noGraph?.message);
  } finally { proto.fillText = origFill; }
  const r1 = await SEEDP.createPrices();
  const prods = () => [...mock.state.products.values()];
  ok(r1.counts.created === 3 && prods().every((p) => /^PhiloSynth ".+" subscription: \d+ syntheses, \d+ regenerations, \d+ modes, \d+ enrichments per (month|year)$/.test(p.description ?? "")), "R5.6 первый сид на моке: три продукта с английским описанием", prods().map((p) => p.description));
  for (const p of prods()) p.description = `Подписка PhiloSynth «${p.name}»: 20 синтезов, … за месяц`;
  const r2 = await SEEDP.createPrices();
  const updReqs = mock.state.requests.filter((q) => q.method === "POST" && /^\/v1\/products\/prod_/.test(q.url));
  ok(r2.counts.skip === 3 && r2.counts.created === 0 && r2.results.every((r) => r.productUpdated) && prods().every((p) => !CYR.test(p.description)) && updReqs.length === 3 && updReqs.every((q) => typeof q.form?.description === "string" && !CYR.test(q.form.description)), "R5.7 повторный сид: цены skip, описание существующих продуктов приведено (POST /v1/products/:id ×3)", { counts: r2.counts, upd: updReqs.length });
  const r3 = await SEEDP.createPrices();
  ok(r3.counts.skip === 3 && r3.results.every((r) => r.productUpdated === false) && mock.state.requests.filter((q) => q.method === "POST" && /^\/v1\/products\/prod_/.test(q.url)).length === 3, "R5.8 третий сид: описание совпало — без лишних запросов обновления");
  const custs = {};
  for (const loc of ["de", "en", "ru", null]) {
    const [u] = await sql`insert into users (email, password_hash, ui_locale) values (${`t141-cust-${loc ?? "none"}-${TAG}@example.com`}, 'x', ${loc}) returning id`;
    userIds.push(u.id);
    const cid = await LOC.runWithLocale("en", () => SUB.ensureStripeCustomer(u.id));
    custs[loc ?? "none"] = mock.state.customers.find((c) => c.id === cid)?.preferred_locales;
  }
  ok(J(custs) === J({ de: ["de"], en: ["en"], ru: ["ru"], none: ["en"] }), "R5.9 Customer: preferred_locales по ui_locale (без ui_locale — язык запроса)", custs);

  /* ══ Живой сервер: R3, R4b ══════════════════════════════════════════ */
  console.log("\nR3/R4b. Живой сервер");
  spawnSync("sh", ["-c", `ps -eo pid,args | awk '/[s]erver\\/index|tsx index.ts/ && /${PORT}/ {print $1}' | xargs -r kill -9`]);
  if (await isUp(`${BASE}/health`)) throw new Error(`порт ${PORT} занят чужим сервером`);
  sp(["--import", "tsx", "index.ts"], ROOT + "server", {
    PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "600", RATE_LIMIT_MAIL_PER_HOUR: "20", TRUST_PROXY: "false", HOST: "",
    MAIL_TRANSPORT: "console", ANTHROPIC_API_KEY: "", BILLING_ENFORCE: "false", API_KEY_ENCRYPTION_SECRET: "t141-" + "s".repeat(40),
    CLIENT_ORIGIN: "http://127.0.0.1:5199", STRIPE_SECRET_KEY: "", STRIPE_API_BASE: "https://api.stripe.com",
  }, "/tmp/t141-server.log");
  await waitUp(`${BASE}/health`, "сервер");
  spawnSync("sh", ["-c", "redis-cli --scan --pattern 'rate_limit:*' | xargs -r redis-cli del >/dev/null"]);

  // R3: регистрация с пустым email
  const reg = async (lang, body) => api("/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: J(body) }, null, lang);
  const rEn = await reg("en", { email: "", password: "" }), rDe = await reg("de", { email: "", password: "" }), rRu = await reg("ru", { email: "", password: "" });
  ok(rEn.status === 400 && rEn.json.error === "Invalid data" && rEn.json.details.email === "Required field" && rEn.json.details.password === "Required field", "R3.1 register, пустой email под en → details по-английски", rEn.json);
  ok(rDe.status === 400 && rDe.json.error === "Ungültige Daten" && rDe.json.details.email === "Pflichtfeld" && rDe.json.details.password === "Pflichtfeld", "R3.2 … под de → по-немецки", rDe.json);
  ok(rRu.status === 400 && rRu.json.details.email === "Обязательное поле", "R3.3 … под ru — как прежде", rRu.json);
  const rEn2 = await reg("en", { email: "bad", password: "short" });
  ok(rEn2.status === 400 && rEn2.json.details.email === "Invalid email" && /8/.test(rEn2.json.details.password) && !CYR.test(J(rEn2.json)), "R3.4 невалидный email и короткий пароль под en — оба перевода (tl + tData)", rEn2.json);
  const est = await api("/syntheses/estimate", { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ philosophers: "x", sections: ["nope"], method: "zzz", depth: "qq", synthLevel: "ww" }) }, (await account("est")).cookie, "de");
  ok(est.status === 400 && est.json?.details && Object.values(est.json.details).every((v) => !CYR.test(v)) && est.json.details.method === "unbekannte Methode", "R3.5 /syntheses/estimate под de: details тела (массив строк, разделы, метод, уровень, глубина) по-немецки", est.json);
  // R3: 404
  const nf = async (lang) => (await api("/nope/nope", {}, null, lang)).json?.error;
  ok((await nf("en")) === "Resource not found" && (await nf("de")) === "Ressource nicht gefunden" && (await nf("ru")) === "Ресурс не найден", "R3.6 несуществующий маршрут → 404 с переведённым error (en/de/ru)");
  // R3: единственный администратор
  const admin = await account("admin");
  const others = await sql`select id from users where role='admin' and id<>${admin.id}`;
  for (const o of others) demotedAdmins.push(o.id);
  if (demotedAdmins.length) await sql`update users set role='user' where id in ${sql(demotedAdmins)}`;
  await sql`update users set role='admin' where id=${admin.id}`;
  const del = async (lang) => api("/auth/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: J({ password: admin.password }) }, admin.cookie, lang);
  const dEn = await del("en"), dDe = await del("de"), dRu = await del("ru");
  ok(dEn.status === 409 && dEn.json.code === "LAST_ADMIN" && dEn.json.error === "You are the only administrator — appoint a second one first (POST /auth/users/:id/role)", "R3.7 единственный администратор под en", dEn.json);
  ok(dDe.status === 409 && dDe.json.error === "Sie sind der einzige Administrator — ernennen Sie zuerst einen zweiten (POST /auth/users/:id/role)", "R3.8 … под de", dDe.json);
  ok(dRu.status === 409 && dRu.json.error === "Вы единственный администратор — сначала назначьте второго (POST /auth/users/:id/role)", "R3.9 … под ru — как прежде", dRu.json);
  if (demotedAdmins.length) await sql`update users set role='admin' where id in ${sql(demotedAdmins)}`;
  demotedAdmins.length = 0;
  await sql`update users set role='user' where id=${admin.id}`;
  // R3: правка подраздела — пользователь de, запрос en (язык пользователя первым)
  const uDe = await account("de", "de");
  const sid = await mkSynth(uDe.id, `S-${TAG}`, SEC("Резюме", "Цели", `<p>abc</p><div data-section="Вложенный"><h4>§ 1.1 Вложенный</h4><p>t</p></div>`));
  const src = await api(SUBPATH(sid), {}, uDe.cookie, "en");
  ok(src.status === 200 && src.json.html === "<p>abc</p>\n<!-- подраздел 1: § 1.1 Вложенный — wird separat bearbeitet, Zeile nicht löschen -->", "R3.10 GET подраздела: строка-место с немецким хвостом (ui_locale первым, не Accept-Language) и видимым заголовком", src.json?.html);
  const p1 = await api(SUBPATH(sid), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: J({ html: src.json.html.replace("<p>abc</p>", '<p onclick="x()">neu<script>1</script><b>f</b></p>') }) }, uDe.cookie, "en");
  ok(p1.status === 200 && p1.json.changed && p1.json.warnings.length === 3 && p1.json.warnings.every((w) => !CYR.test(w)) && /Mitsamt Inhalt entfernt: <script>/.test(p1.json.warnings[0]) && /<p>neu<strong>f<\/strong><\/p>/.test(p1.json.section.htmlContent) && /data-section="Вложенный"/.test(p1.json.section.htmlContent), "R3.11 PATCH с <script>: warnings по-немецки, сохранено, вложенный на месте", p1.json?.warnings);
  const p2 = await api(SUBPATH(sid), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: J({ html: "<p>старый черновик</p>\n<!-- подраздел 1: Вложенный — правится отдельно, строку не удалять -->" }) }, uDe.cookie, "en");
  ok(p2.status === 200 && p2.json.changed && /старый черновик/.test(p2.json.section.htmlContent) && /data-section="Вложенный"/.test(p2.json.section.htmlContent), "R3.12 старый русский черновик строки-места сохраняется под de (разбор по номеру)");
  const p3 = await api(SUBPATH(sid), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: J({ html: "<p>x</p><!-- подраздел 1: a --><!-- подраздел 1: a -->" }) }, uDe.cookie, "en");
  ok(p3.status === 400 && p3.json.details?.problem === "placeholder" && p3.json.details.html === "Platzhalterzeile „Unterabschnitt 1“ ist doppelt", "R3.13 повторённая строка-место → отказ по-немецки", p3.json);
  const p4 = await api(SUBPATH(sid), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: J({ html: "<p>x</p><h4>z</h4><!-- подраздел 1: a -->" }) }, uDe.cookie, "en");
  ok(p4.status === 400 && p4.json.details?.problem === "heading" && /^<h4> ist hier nicht erlaubt/.test(p4.json.details.html), "R3.14 <h4> в правке → отказ heading по-немецки", p4.json);
  const [gl] = await sql`select count(*)::int as n from generation_log where synthesis_id=${sid}`;
  ok(gl.n === 0, "R3.15 ручная правка не оставила записей генлога (хранимая форма — только у ответов модели)");
  // R4b: сброс пароля de-пользователя — письмо по-немецки; ru — по-русски
  const prq = (email, lang) => api("/auth/password-reset/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email }) }, null, lang);
  const uRu = await account("ru", "ru");
  const q1 = await prq(uDe.email, "ru"), q2 = await prq(uRu.email, "en");
  const mailOf = async (email) => (await sql`select subject, body_text, body_html from mail_outbox where to_email=${email} and subject not like '%подтверждение%' and subject not like '%confirmation%' and subject not like '%Bestätigung%' order by created_at desc limit 1`)[0];
  const mDe = await mailOf(uDe.email), mRu = await mailOf(uRu.email);
  ok(q1.status === 200 && mDe && mDe.subject === "PhiloSynth: Passwort zurücksetzen" && /Guten Tag, Проверяющий\./.test(mDe.body_text) && /Der Link gilt 1 Stunde und funktioniert einmal\./.test(mDe.body_text) && /<html lang="de">/.test(mDe.body_html) && /Neues Passwort festlegen/.test(mDe.body_html) && /Falls sich die Schaltfläche nicht öffnet/.test(mDe.body_html), "R4.2 сброс пароля de-пользователя под ru-запросом: письмо по-немецки (тема, текст, кнопка, сноска, «1 Stunde» — TTL 1 час, lang=de)", mDe);
  ok(mDe && !CYR.test(mDe.subject + mDe.body_text.replace(/Проверяющий/g, "") + mDe.body_html.replace(/Проверяющий/g, "")), "R4.3 в немецком письме нет кириллицы вне имени адресата");
  ok(q2.status === 200 && mRu && mRu.subject === "PhiloSynth: сброс пароля" && /Здравствуйте, Проверяющий\./.test(mRu.body_text) && /Ссылка действует 1 час и срабатывает один раз\. После смены пароля все сеансы входа будут завершены\./.test(mRu.body_text) && /<html lang="ru">/.test(mRu.body_html) && /Задать новый пароль/.test(mRu.body_html), "R4.4 сброс пароля ru-пользователя под en-запросом: письмо по-русски, как прежде", mRu?.body_text);
  const [regDe] = await sql`select subject from mail_outbox where to_email=${uDe.email} order by created_at asc limit 1`;
  ok(regDe?.subject === "PhiloSynth: подтверждение адреса", "R4.5 письмо регистрации (ui_locale ещё не было) — на языке запроса регистрации (ru)", regDe);
} catch (e) {
  failed++; fails.push("исключение: " + (e?.stack ?? e));
  console.error("исключение:", e);
} finally {
  console.log(`\nИТОГ: ${passed} ✓, ${failed} ✗${fails.length ? "\n  " + fails.join("\n  ") : ""}`);
  try {
    if (demotedAdmins.length) await sql`update users set role='admin' where id in ${sql(demotedAdmins)}`;
    for (const id of ids) await sql`delete from syntheses where id=${id}`;
    for (const id of userIds) await sql`delete from syntheses where user_id=${id}`;
    for (const id of userIds) await sql`delete from mail_outbox where to_email in (select email from users where id=${id})`;
    for (const id of userIds) await sql`delete from users where id=${id}`;
  } catch (e) { console.error("уборка:", e); }
  rmSync(probeFile, { force: true });
  if (existsSync(worktree)) spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: ROOT });
  rmSync(SP, { recursive: true, force: true });
  for (const p of procs) { try { process.kill(-p.pid, "SIGKILL"); } catch {} }
  await mock.stop();
  await Promise.race([sql.end(), sleep(2000)]);
  process.exit(failed ? 1 : 0);
}
