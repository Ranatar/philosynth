/**
 * smoke-141-request1 — первый запрос беседы 14.1 (довершение локализации сервера:
 * Д-58 опись, Д-52/Д-53 проверки полей и константы, Д-60 правка подраздела,
 * Д-51 письма, Д-56 PNG, Д-61 Stripe).
 * Живой сервер :3141 + PG16/Redis; мок Stripe — в процессе (tools/stripe-mock.mjs);
 * мок Claude и браузер не нужны (беседа серверная).
 *
 *   A. В процессе: опись msg-режима на пробе (шесть слепых видов Д-58 + машинные
 *      значения вне описи); `i18n:check --strict` зелёный; письма под языком получателя
 *      (ru байт-в-байт как прежде, en/de — переводом, плюрал часов, lang у <html>);
 *      html-parser — строка-места с видимым <h4> и tl()-хвостом, старый русский черновик
 *      сохраняется под en, предупреждения чистки и отказы на языке запроса, хранимая
 *      форма (sanitizeWarningsRu по report) русская; PNG под en без кириллицы (шпион
 *      fillText), под ru — как прежде; сид цен на моке Stripe: первый запуск заводит
 *      продукт с английским описанием, русское описание прежних продуктов приводится
 *      при повторном запуске (skip цены, но описание обновлено); Customer получает
 *      preferred_locales по ui_locale.
 *   B. Живой сервер: регистрация с пустым email под Accept-Language en/de → details
 *      по-английски/по-немецки; несуществующий маршрут → 404 с переведённым error;
 *      единственный администратор → 409 LAST_ADMIN на языке запроса; PATCH подраздела
 *      с <script> → warnings на языке пользователя (ui_locale первым); поле правки с
 *      вложенным подразделом → строка-место переведена, сохранение проходит; письмо
 *      из /auth/email/verify/request en-пользователя — английское в mail_outbox.
 *
 * Запуск из корня:  node_modules/.bin/tsx tests/smoke-141-request1.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { openSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3141;
const STRIPE_PORT = 3867;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
// env.ts читается один раз при импорте — Stripe на мок ДО импорта модулей сервера
process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.STRIPE_API_BASE = `http://127.0.0.1:${STRIPE_PORT}`;
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

/* ── Модули в процессе ───────────────────────────────────────────────── */
const { createStripeMock } = await import("../tools/stripe-mock.mjs");
const mock = createStripeMock({ port: STRIPE_PORT, bearer: "sk_test_mock", idTag: "s141" });
await mock.start();
const LOC = await import("../server/i18n/locale.ts");
LOC.installServerCatalogProvider();
const TPL = await import("../server/services/mail/templates.ts");
const HP = await import("../server/utils/html-parser.ts");
const DS = await import("@philosynth/shared/utils/doc-markup-sanitize");
const LIB = await import("../scripts/i18n/ui-strings-lib.mjs");
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

const ids = [];
const userIds = [];
const demotedAdmins = [];
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
  const email = `s141-${tag}-${Date.now()}@example.com`, password = "password-141";
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
  const [row] = await sql`insert into syntheses (user_id, seed, title, status, section_order)
    values (${userId}, ${"зерно " + TAG}, ${title}, 'ready', ${sql.json(["sum"])}) returning id`;
  ids.push(row.id);
  await sql`insert into sections (synthesis_id, key, section_num, title, html_content) values (${row.id}, 'sum', 1, 'Резюме', ${sectionHtml})`;
  return row.id;
}

try {
  /* ══ A. В процессе ══════════════════════════════════════════════════ */
  console.log("\nA. В процессе");
  // A1–A2: опись msg-режима (Д-58)
  const dir = mkdtempSync(join(tmpdir(), "s141-"));
  const probe = join(dir, "probe.ts");
  writeFileSync(probe, [
    'const HINT = "Константа подсказки";',
    'class XError extends Error { constructor() { super("Супер в классе ошибки"); } }',
    'export function f(body: unknown, c: { json(x: unknown, s: number): unknown }) {',
    '  const details: Record<string, string> = {}; const d: Record<string, string> = {}; const warnings: string[] = [];',
    '  if (!body) details.email = "Присваивание в details";',
    '  if (!body) d["field"] = "Присваивание в d";',
    '  warnings.push("Голый push в warnings");',
    '  const subject = "Собранная тема";',
    '  if (!body) throw new XError();',
    '  return c.json({ error: "Прямой литерал", subject, hint: HINT }, 400);',
    '}',
    'export function g(x: string) { if (x === "значение") return 1; switch (x) { case "ветка": return 2; } return x.includes("поиск") ? 3 : 0; }',
  ].join("\n"));
  const got = LIB.extractFile(probe, "msg").entries.map((e) => e.text);
  rmSync(dir, { recursive: true, force: true });
  const want = ["Присваивание в details", "Присваивание в d", "Голый push в warnings", "Собранная тема", "Супер в классе ошибки", "Константа подсказки", "Прямой литерал"];
  ok(want.every((t) => got.includes(t)), "A1 опись msg-режима видит details[…]/d[…]/push/subject-по-имени/super/константу (Д-58)", got);
  ok(!got.some((t) => /значение|ветка|поиск/.test(t)), "A2 сравнение/case/matcher — вне описи", got);
  const chk = spawnSync(process.execPath, ["scripts/i18n/i18n-check.mjs", "--strict"], { cwd: ROOT, encoding: "utf8" });
  ok(chk.status === 0 && /литералы без ключа — дополнить names\.json: 0/.test(chk.stdout) && /литералы с ключом — codemod не применён: 0/.test(chk.stdout), "A3 i18n:check --strict зелёный, безымянных и неприменённых литералов 0", (chk.stdout + chk.stderr).slice(-600));
  ok(/хранимые тексты сервера[^\n]*14\.2\): \d+/.test(chk.stdout) && !/хранимые тексты сервера[^\n]*: 0\n/.test(chk.stdout), "A4 хранимые тексты (14.2) печатаются отдельной строкой, не красным");

  // A5–A8: письма под языком получателя (Д-51)
  const letter = (loc, fn, input) => LOC.runWithLocale(loc, () => TPL[fn](input));
  const ru = letter("ru", "verifyEmailLetter", { displayName: "Иван", link: "https://x/y", ttlHours: 72 });
  ok(ru.subject === "PhiloSynth: подтверждение адреса" && /Ссылка действует 72 часа и срабатывает один раз\./.test(ru.text) && /<html lang="ru">/.test(ru.html) && /Подтвердить адрес/.test(ru.html) && ru.text.startsWith("Здравствуйте, Иван."), "A5 письмо ru — как прежде (тема, 72 часа, lang=ru, кнопка)");
  const en = letter("en", "verifyEmailLetter", { displayName: null, link: "https://x/y", ttlHours: 72 });
  ok(en.subject === "PhiloSynth: email address confirmation" && /72 hours/.test(en.text) && /<html lang="en">/.test(en.html) && /Confirm address/.test(en.html) && en.text.startsWith("Hello.") && !CYR.test(en.subject + en.text + en.html), "A6 письмо en — переводом, без кириллицы", en.text);
  const de = letter("de", "passwordResetLetter", { displayName: "Anna", link: "https://x/y", ttlHours: 1 });
  ok(de.subject === "PhiloSynth: Passwort zurücksetzen" && /1 Stunde und/.test(de.text) && /<html lang="de">/.test(de.html) && /Neues Passwort festlegen/.test(de.html), "A7 письмо de — переводом, плюрал «1 Stunde»", de.text);
  const hours = (loc, n) => LOC.runWithLocale(loc, () => TPL.verifyEmailLetter({ link: "https://x", ttlHours: n }).text);
  ok(/ 1 час и/.test(hours("ru", 1)) && / 2 часа и/.test(hours("ru", 2)) && / 5 часов и/.test(hours("ru", 5)) && / 21 час и/.test(hours("ru", 21)) && / 2 hours and/.test(hours("en", 2)) && / 1 hour and/.test(hours("en", 1)), "A8 плюрал часов — ru one/few/many, en one/other");

  // A9–A14: html-parser (Д-60)
  const SECTION = SEC("Резюме", "Цели", `<p>abc</p><div data-section="Вложенный"><h4>§ 1.1 Вложенный</h4><p>t</p></div>`);
  const srcRu = LOC.runWithLocale("ru", () => HP.readSubsectionSource(SECTION, "Цели"));
  const srcEn = LOC.runWithLocale("en", () => HP.readSubsectionSource(SECTION, "Цели"));
  ok(srcRu.html === "<p>abc</p>\n<!-- подраздел 1: § 1.1 Вложенный — правится отдельно, строку не удалять -->", "A9 строка-место ru: видимый заголовок <h4> вместо ключа, хвост как прежде", srcRu.html);
  ok(srcEn.html === "<p>abc</p>\n<!-- подраздел 1: § 1.1 Вложенный — edited separately, do not delete this line -->", "A10 строка-место en: машинный префикс «подраздел 1» + переведённый хвост", srcEn.html);
  const saveEn = LOC.runWithLocale("en", () => HP.replaceSubsectionContent(SECTION, "Цели", srcEn.html.replace("<p>abc</p>", "<p>new</p>")));
  const saveOld = LOC.runWithLocale("en", () => HP.replaceSubsectionContent(SECTION, "Цели", "<p>old draft</p>\n<!-- подраздел 1: Вложенный — правится отдельно, строку не удалять -->"));
  ok(saveEn.changed && /<p>new<\/p>/.test(saveEn.html) && /data-section="Вложенный"/.test(saveEn.html) && saveOld.changed && /old draft/.test(saveOld.html) && /data-section="Вложенный"/.test(saveOld.html), "A11 сохранение под en проходит и для новой строки-места, и для старого русского черновика (разбор по номеру)");
  const warnEn = LOC.runWithLocale("en", () => HP.replaceSubsectionContent(SECTION, "Цели", srcEn.html.replace("<p>abc</p>", '<p onclick="x()">b<script>1</script><b>q</b></p>')));
  ok(warnEn.warnings.length === 3 && !warnEn.warnings.some((w) => CYR.test(w)) && /<script>/.test(warnEn.warnings[0]), "A12 предупреждения чистки под en — переводом", warnEn.warnings);
  const refusals = [];
  for (const [html, code] of [["<p>x</p><h4>z</h4><!-- подраздел 1: a -->", "heading"], ['<p data-section="y">x</p><!-- подраздел 1: a -->', "anchor"], ["<p>x</p>", "placeholder"], ["<p>x</p><!-- подраздел 1: a --><!-- подраздел 1: a -->", "placeholder"], ["<p>x</p><!-- подраздел 7: a -->", "placeholder"]]) {
    try { LOC.runWithLocale("de", () => HP.replaceSubsectionContent(SECTION, "Цели", html)); refusals.push("нет отказа"); }
    catch (e) { refusals.push(`${e.problem === code ? "ok" : e.problem}:${e.message}`); }
  }
  ok(refusals.every((r) => r.startsWith("ok:") && !CYR.test(r.replace(/Вложенный|Unterabschnitt/g, ""))), "A13 отказы (heading/anchor/placeholder ×3) под de — переводом", refusals);
  const san = LOC.runWithLocale("en", () => HP.sanitizeSectionHtml('<div class="doc-section"><p onclick="x()"><b>ж</b></p><script>1</script></div>'));
  ok(san.changed && san.report && !san.warnings.some((w) => CYR.test(w)) && DS.sanitizeWarningsRu(san.report).every((w) => CYR.test(w)) && DS.sanitizeWarningsRu(san.report).length === san.warnings.length, "A14 sanitizeSectionHtml: warnings под en переводом, хранимая форма по report — русская (генлог)", { w: san.warnings, ru: DS.sanitizeWarningsRu(san.report) });

  // A15–A16: PNG (Д-56)
  const proto = canvas.CanvasRenderingContext2D.prototype;
  const origFill = proto.fillText;
  const drawn = [];
  proto.fillText = function (...a) { drawn.push(String(a[0])); return origFill.apply(this, a); };
  try {
    const { buildPNG } = await import("../server/services/export/png-exporter.ts");
    const G = {
      nodes: [{ name: "Alpha", type: "онтологическая", def: "", orig: "", cen: 0.9, cert: 0.8 }, { name: "Beta", type: "эпистемологическая", def: "", orig: "", cen: 0.6, cert: 0.5 }, { name: "Gamma", type: "", def: "", orig: "", cen: 0.5, cert: 0.5 }, { name: "Delta", type: "пользовательский тип", def: "", orig: "", cen: 0.5, cert: 0.5 }],
      edges: [{ src: "Alpha", tgt: "Beta", type: "иерархическая", desc: "", dir: "однонаправленная", str: 0.7 }, { src: "Gamma", tgt: "Gamma", type: "противоречие", desc: "", dir: "рефлексивная", str: 0.5 }],
      topology: { clusters: { Alpha: [0, 1], Beta: [0], Gamma: [1] }, roles: { structural: { Alpha: ["core"], Beta: ["bridge"] }, procedural: { Alpha: ["synthesis"], Beta: ["thesis"] } }, clusterLabels: ["I — Foundations"] },
    };
    const png = LOC.runWithLocale("en", () => buildPNG(G));
    const cyr = drawn.filter((t) => CYR.test(t));
    ok(png[0] === 0x89 && cyr.length === 1 && cyr[0] === "пользовательский тип" && ["CATEGORY TYPES", "STRUCTURAL ROLES (MARKER)", "RELATION TYPES", "CLUSTERS", "ontological", "epistemological", "hierarchical", "contradiction", "other", "Cluster 2", "→ one-way · ↔ two-way · ↺ reflexive"].every((t) => drawn.includes(t)), "A15 PNG под en: легенда без кириллицы, типы переводом, тип без ключа — как есть", cyr.concat(drawn.slice(-12)));
    drawn.length = 0;
    LOC.runWithLocale("ru", () => buildPNG(G));
    ok(["ТИПЫ КАТЕГОРИЙ", "онтологическая", "иерархическая", "другое", "Кластер 2", "→ однонаправл. · ↔ двунаправл. · ↺ рефлексив."].every((t) => drawn.includes(t)), "A16 PNG под ru — как прежде", drawn.slice(-12));
  } finally { proto.fillText = origFill; }

  // A17–A20: Stripe (Д-61)
  const r1 = await SEEDP.createPrices();
  const prods = () => [...mock.state.products.values()];
  ok(r1.counts.created === 3 && prods().length === 3 && prods().every((p) => !CYR.test(p.description ?? "") && /^PhiloSynth ".+" subscription: \d+ syntheses, /.test(p.description)), "A17 сид цен на моке: три продукта с английским описанием", prods().map((p) => p.description));
  for (const p of prods()) p.description = `Подписка PhiloSynth «${p.name}»: по-старому`;
  const r2 = await SEEDP.createPrices();
  ok(r2.counts.skip === 3 && r2.results.every((r) => r.productUpdated === true) && prods().every((p) => !CYR.test(p.description)) && mock.state.requests.filter((q) => q.method === "POST" && /^\/v1\/products\/prod_/.test(q.url)).length === 3, "A18 повторный запуск: цены skip, русское описание прежних продуктов приведено к английскому (POST /v1/products/:id)", { counts: r2.counts, desc: prods().map((p) => p.description) });
  const r3 = await SEEDP.createPrices();
  ok(r3.counts.skip === 3 && r3.results.every((r) => r.productUpdated === false), "A19 третий запуск: описание совпало — без запроса обновления");
  const [uDe] = await sql`insert into users (email, password_hash, ui_locale) values (${`s141-de-${TAG}@example.com`}, 'x', 'de') returning id`;
  userIds.push(uDe.id);
  const custId = await SUB.ensureStripeCustomer(uDe.id);
  const cust = mock.state.customers.find((c) => c.id === custId);
  ok(cust && J(cust.preferred_locales) === '["de"]', "A20 ensureStripeCustomer: preferred_locales по ui_locale покупателя", cust);

  /* ══ B. Живой сервер ════════════════════════════════════════════════ */
  console.log("\nB. Живой сервер");
  spawnSync("sh", ["-c", `ps -eo pid,args | awk '/[s]erver\\/index|tsx index.ts/ && /${PORT}/ {print $1}' | xargs -r kill -9`]);
  if (await isUp(`${BASE}/health`)) throw new Error(`порт ${PORT} занят чужим сервером`);
  sp(["--import", "tsx", "index.ts"], ROOT + "server", {
    PORT: String(PORT), RATE_LIMIT_HTTP_PER_MINUTE: "600", RATE_LIMIT_MAIL_PER_HOUR: "20", TRUST_PROXY: "false", HOST: "",
    MAIL_TRANSPORT: "console", ANTHROPIC_API_KEY: "", BILLING_ENFORCE: "false", API_KEY_ENCRYPTION_SECRET: "s141-" + "s".repeat(40),
    CLIENT_ORIGIN: "http://127.0.0.1:5199", STRIPE_SECRET_KEY: "", STRIPE_API_BASE: "https://api.stripe.com",
  }, "/tmp/s141-server.log");
  await waitUp(`${BASE}/health`, "сервер");
  spawnSync("sh", ["-c", "redis-cli --scan --pattern 'rate_limit:*' | xargs -r redis-cli del >/dev/null"]);

  // B1–B3: регистрация с пустым email — details на языке запроса (Д-52)
  const regEn = await api("/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email: "", password: "" }) }, null, "en");
  ok(regEn.status === 400 && regEn.json?.details?.email === "Required field" && regEn.json?.details?.password === "Required field" && regEn.json?.error === "Invalid data", "B1 register под en: details по-английски", regEn.json);
  const regDe = await api("/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email: "not-an-email", password: "x".repeat(20) }) }, null, "de");
  ok(regDe.status === 400 && regDe.json?.details?.email === "Ungültige E-Mail" && !CYR.test(J(regDe.json)), "B2 register под de: «Невалидный email» по-немецки", regDe.json);
  const regRu = await api("/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: J({ email: "", password: "" }) }, null, "ru");
  ok(regRu.status === 400 && regRu.json?.details?.email === "Обязательное поле", "B3 register под ru — как прежде", regRu.json);

  // B4–B5: несуществующий маршрут — 404 на языке запроса (Д-53)
  const nf = await api("/no-such-route", {}, null, "en");
  ok(nf.status === 404 && nf.json?.error === "Resource not found" && nf.json?.code === "NOT_FOUND", "B4 404 под en: «Resource not found»", nf.json);
  const nfRu = await api("/no-such-route", {}, null, "ru");
  ok(nfRu.status === 404 && nfRu.json?.error === "Ресурс не найден", "B5 404 под ru — как прежде", nfRu.json);

  // B6: единственный администратор — на языке запроса (Д-53)
  const admin = await account("admin");
  const others = await sql`select id from users where role='admin' and id<>${admin.id}`;
  for (const o of others) { demotedAdmins.push(o.id); }
  if (demotedAdmins.length) await sql`update users set role='user' where id in ${sql(demotedAdmins)}`;
  await sql`update users set role='admin' where id=${admin.id}`;
  const delEn = await api("/auth/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: J({ password: admin.password }) }, admin.cookie, "en");
  ok(delEn.status === 409 && delEn.json?.code === "LAST_ADMIN" && /^You are the only administrator/.test(delEn.json?.error ?? ""), "B6 единственный администратор под en: отказ по-английски", delEn.json);
  const delDe = await api("/auth/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: J({ password: admin.password }) }, admin.cookie, "de");
  ok(delDe.status === 409 && /^Sie sind der einzige Administrator/.test(delDe.json?.error ?? ""), "B7 то же под de", delDe.json);
  if (demotedAdmins.length) await sql`update users set role='admin' where id in ${sql(demotedAdmins)}`;
  demotedAdmins.length = 0;
  await sql`update users set role='user' where id=${admin.id}`;

  // B8–B11: правка подраздела (Д-60) — язык пользователя (ui_locale) первым
  const userEn = await account("en", "en");
  const sid = await mkSynth(userEn.id, `S-${TAG}`, SEC("Резюме", "Цели", `<p>abc</p><div data-section="Вложенный"><h4>§ 1.1 Вложенный</h4><p>t</p></div>`));
  const src = await api(`/syntheses/${sid}/sections/sum/subsections/${encodeURIComponent("Цели")}`, {}, userEn.cookie, "ru");
  ok(src.status === 200 && src.json?.html === "<p>abc</p>\n<!-- подраздел 1: § 1.1 Вложенный — edited separately, do not delete this line -->", "B8 GET подраздела en-пользователя (запрос ru): строка-место с переведённым хвостом и видимым заголовком", src.json);
  const patch = await api(`/syntheses/${sid}/sections/sum/subsections/${encodeURIComponent("Цели")}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: J({ html: src.json.html.replace("<p>abc</p>", '<p onclick="x()">new<script>1</script></p>') }) }, userEn.cookie, "ru");
  ok(patch.status === 200 && patch.json?.changed === true && patch.json?.warnings?.length === 2 && !patch.json.warnings.some((w) => CYR.test(w)) && /<p>new<\/p>/.test(patch.json.section.htmlContent) && /data-section="Вложенный"/.test(patch.json.section.htmlContent), "B9 PATCH с <script>: сохранено, вложенный подраздел на месте, warnings по-английски", patch.json?.warnings);
  const bad = await api(`/syntheses/${sid}/sections/sum/subsections/${encodeURIComponent("Цели")}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: J({ html: "<p>x</p>" }) }, userEn.cookie, "ru");
  ok(bad.status === 400 && bad.json?.code === "VALIDATION_ERROR" && /^the placeholder line for a nested subsection is missing: «Вложенный»/.test(bad.json?.details?.html ?? "") && bad.json?.details?.problem === "placeholder", "B10 потерянная строка-место: отказ по-английски", bad.json);
  const [genRow] = await sql`select 1 as x from generation_log where synthesis_id=${sid} limit 1`;
  ok(!genRow, "B11 ручная правка не пишет parseWarnings в генлог (хранимая форма — только у ответа модели)");

  // B12–B13: письмо из /auth/email/verify/request — язык получателя (Д-51)
  const vr = await api("/auth/email/verify/request", { method: "POST" }, userEn.cookie, "ru");
  const [mail] = await sql`select subject, body_text, body_html from mail_outbox where to_email=${userEn.email} order by created_at desc limit 1`;
  ok(vr.status === 200 && mail && mail.subject === "PhiloSynth: email address confirmation" && /<html lang="en">/.test(mail.body_html) && /Hello, Проверяющий\./.test(mail.body_text), "B12 письмо en-пользователю под ru-запросом — английское (язык ПОЛУЧАТЕЛЯ)", mail?.subject);
  const [regMail] = await sql`select subject from mail_outbox where to_email=${userEn.email} order by created_at asc limit 1`;
  ok(regMail && regMail.subject === "PhiloSynth: подтверждение адреса", "B13 письмо при регистрации (ui_locale ещё нет) — на языке запроса регистрации (ru)", regMail?.subject);
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
  for (const p of procs) { try { process.kill(-p.pid, "SIGKILL"); } catch {} }
  await mock.stop();
  await Promise.race([sql.end(), sleep(2000)]);
  process.exit(failed ? 1 : 0);
}
