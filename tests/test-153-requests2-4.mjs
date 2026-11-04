/**
 * Беседа 15.3 — тестовые запросы 2–4 одним харнессом (почта: обслуживание
 * очереди и смена адреса; Д-72, Д-73). Живой сервер :3000 (MAIL_TRANSPORT=
 * console — письма читаются из вывода сервера, работник и проход чистки
 * частые) + PG16/Redis + СБОРКА клиента (vite build) под vite preview :5229 +
 * Chrome 131 (CHROME_PATH).
 *
 *  R2  Д-72 живьём: строки sent/failed и доводы старше срока исчезают после
 *      прохода работника (первый тик), моложе — остаются; истёкшая сессия
 *      снята, живая цела; строка «[mail] чистка» в логе; время ответа формы
 *      сброса для существующего и несуществующего адреса совпадает в пределах
 *      шума (20 прогонов, медианы) и не меньше минимума; вход для
 *      несуществующего адреса — время сравнимо с неверным паролем (20
 *      прогонов, медианы); вкладка «Почта» (маршрут) видна администратору,
 *      пользователю — 403, гостю — 401.
 *  R3  Д-73 живьём (HTTP): смена адреса → письмо на новый с ссылкой (в логе
 *      и в mail_outbox 'sent', тело затёрто), на старый — уведомление ПОСЛЕ
 *      подтверждения (до — нет); вход по новому адресу; по старому — 401;
 *      занятый адрес — ответ тот же, письма нет; повторное подтверждение —
 *      TOKEN_INVALID; пользователь с ui_locale=de получает оба письма
 *      по-немецки; старая сессия жива; неверный пароль — 401, текущий адрес
 *      — 400.
 *  R4  Браузер (Chrome 131, сборка клиента): форма смены адреса в профиле
 *      (неверный пароль — ошибка у поля; успех — пояснение, письмо ушло);
 *      страница /change-email/:token (вошедшему — «изменён» → профиль с
 *      новым адресом; гостю — → /login с пояснением; повторно — ошибка с
 *      подсказкой); вкладка «Почта» админки (счётчики, строки без тел,
 *      «Обновить»); пользователю вкладки нет (/admin/prompts недоступен).
 *
 * Запуск (≈ 2 мин): node_modules/.bin/tsx tests/test-153-requests2-4.mjs [R2 R3 R4]
 * Предпосылки: PG16 + Redis, миграции и сиды; `npm i --no-save puppeteer-core@23`;
 * Chrome 131 в ~/.cache/puppeteer/chrome/linux-131.0.6778.204/ либо CHROME_PATH;
 * лог сервера — /tmp/t153-server.log.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import postgres from "postgres";

const ONLY = process.argv.slice(2);
const want = (r) => ONLY.length === 0 || ONLY.includes(r);
const ROOT = new URL("../", import.meta.url).pathname;
const PORT = 3000, UI_PORT = 5229;
const BASE = `http://127.0.0.1:${PORT}/api/v1`, UI = `http://127.0.0.1:${UI_PORT}`;
const CHROME = [process.env.CHROME_PATH, `${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`].find((p) => p && existsSync(p));
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (id) => `[data-testid="${id}"]`;
const SERVER_LOG = "/tmp/t153-server.log";
const MIN_MS = 300;
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}
const TAG = "t153-" + Math.random().toString(36).slice(2, 7);
const PW = "password-153";
const sha = (s) => createHash("sha256").update(s).digest("hex");

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
const serverLog = () => { try { return readFileSync(SERVER_LOG, "utf8"); } catch { return ""; } };

/* ── HTTP ────────────────────────────────────────────────────────────── */
async function call(p, { method = "POST", body, cookie } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const t0 = performance.now();
  const r = await fetch(BASE + p, { method, headers, body: body !== undefined ? J(body) : undefined });
  const ms = performance.now() - t0;
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, ms, cookie: (r.headers.get("set-cookie") ?? "").split(";")[0] || null };
}
const userIds = [];
async function account(tag, { locale = "ru", role = "user" } = {}) {
  const email = `${TAG}-${tag}@example.com`;
  const reg = await call("/auth/register", { body: { email, password: PW, displayName: "Проверяющий " + tag } });
  if (reg.status !== 201 && reg.status !== 200) throw new Error("регистрация: " + reg.text.slice(0, 200));
  const [u] = await sql`update users set ui_locale=${locale}, role=${role}, email_verified_at=now() where email=${email} returning id`;
  userIds.push(u.id);
  const lr = await call("/auth/login", { body: { email, password: PW } });
  return { id: u.id, email, cookie: lr.cookie };
}
/** Письма режима console из вывода сервера: [{ to, subject, text, link }] */
function lettersInLog() {
  const out = [];
  const re = /──────── \[mail:console\] письмо ────────\n([\s\S]*?)\n──────── \[mail:console\] конец/g;
  for (const m of serverLog().matchAll(re)) {
    const block = m[1];
    out.push({
      to: (block.match(/^To: (.*)$/m) ?? [])[1],
      subject: (block.match(/^Subject: (.*)$/m) ?? [])[1],
      text: block,
      link: (block.match(/https?:\/\/\S+\/(?:verify-email|reset-password|change-email)\/\S+/) ?? [])[0] ?? null,
    });
  }
  return out;
}
async function waitLetter(to, pred, { timeout = 8000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const found = lettersInLog().filter((l) => l.to === to && pred(l));
    if (found.length) return found[found.length - 1];
    await sleep(150);
  }
  return null;
}
const tokenOf = (link) => decodeURIComponent(link.split("/").pop());
const outboxOf = (to) => sql`select * from mail_outbox where to_email = ${to} order by created_at`;
async function waitOutbox(to, pred, timeout = 10000) {
  const t0 = Date.now();
  for (;;) { const rows = await outboxOf(to); if (pred(rows)) return rows; if (Date.now() - t0 > timeout) return rows; await sleep(100); }
}
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
async function medianOf(fn, n = 20) { const t = []; for (let i = 0; i < n; i++) t.push((await fn()).ms); return median(t); }

/* ── Браузер ─────────────────────────────────────────────────────────── */
let browser = null, lastPage = null;
async function newPage(who) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  const cdp = await page.createCDPSession();
  await cdp.send("Network.setUserAgentOverride", { userAgent: await browser.userAgent(), acceptLanguage: "ru-RU,ru" });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("dialog", (d) => void d.accept());
  if (who) { const [cn, cv] = who.cookie.split("="); await page.setCookie({ name: cn, value: cv, url: UI }); }
  lastPage = page;
  return page;
}
const exists = async (page, sel) => (await page.$(sel)) !== null;
const click = (page, sel) => page.$eval(sel, (el) => el.click());
const text = (page, sel) => page.$eval(sel, (el) => el.textContent ?? "");
const waitSel = (page, sel, ms = 20000) => page.waitForSelector(sel, { timeout: ms });
const waitText = (page, sel, re, ms = 20000) => page.waitForFunction((s, r) => new RegExp(r).test(document.querySelector(s)?.textContent ?? ""), { timeout: ms }, sel, re.source);
async function typeInto(page, sel, value) { await page.$eval(sel, (el) => { el.value = ""; }); await page.focus(sel); await page.keyboard.type(value); }

/* ══ Прогон ═════════════════════════════════════════════════════════════ */
const day = 86_400_000;
let fx = null; // фикстуры чистки — ставятся ДО старта сервера (первый тик чистит)
try {
  for (const [url, what] of [[`${BASE}/health`, `сервер :${PORT}`], [UI, `preview :${UI_PORT}`]]) if (await isUp(url)) throw new Error(`${what} уже отвечает — чужой процесс`);
  if (want("R2")) {
    const old = new Date(Date.now() - 40 * day), fresh = new Date(Date.now() - 2 * day);
    const [fu] = await sql`insert into users (email, password_hash) values (${TAG + "-fixture@example.com"}, 'x') returning id`;
    userIds.push(fu.id);
    const mails = await sql`insert into mail_outbox (to_email, subject, body_text, body_html, status, sent_at, next_attempt_at, created_at) values
      (${TAG + "-a@x"}, 'old-sent', '', '', 'sent', ${old}, ${old}, ${old}),
      (${TAG + "-b@x"}, 'old-failed', '', '', 'failed', null, ${old}, ${old}),
      (${TAG + "-c@x"}, 'fresh-sent', '', '', 'sent', ${fresh}, ${fresh}, ${fresh}) returning id, subject`;
    const toks = await sql`insert into auth_tokens (user_id, purpose, token_hash, expires_at, used_at) values
      (${fu.id}, 'email_verify', ${sha(TAG + "1")}, ${new Date(old.getTime() + day)}, ${old}),
      (${fu.id}, 'password_reset', ${sha(TAG + "2")}, ${old}, null),
      (${fu.id}, 'email_verify', ${sha(TAG + "3")}, ${new Date(fresh.getTime() + day)}, ${fresh}),
      (${fu.id}, 'email_verify', ${sha(TAG + "4")}, ${new Date(Date.now() + day)}, null) returning id`;
    await sql`insert into sessions (id, user_id, expires_at) values (${sha(TAG + "s1")}, ${fu.id}, ${old}), (${sha(TAG + "s2")}, ${fu.id}, ${new Date(Date.now() + day)})`;
    fx = { uid: fu.id, mails, toks };
  }
  if (want("R4")) {
    if (!CHROME) throw new Error("браузер не найден — задайте CHROME_PATH (Chrome 131)");
    console.log("■ Сборка клиента (vite build)");
    const build = spawnSync(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "build"], { cwd: ROOT + "client", encoding: "utf8" });
    ok(build.status === 0, "vite build собрал клиент", (build.stderr ?? "").slice(-400));
    sp([ROOT + "node_modules/vite/bin/vite.js", "preview", "--port", String(UI_PORT), "--strictPort", "--host", "127.0.0.1"], ROOT + "client", {}, "/tmp/t153-preview.log");
  }
  sp(["--import", "tsx", "index.ts"], ROOT + "server", {
    PORT: String(PORT), CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000", RATE_LIMIT_MAIL_PER_HOUR: "100000",
    MAIL_TRANSPORT: "console", MAIL_WORKER_INTERVAL_MS: "300", MAINTENANCE_INTERVAL_MS: "1000",
    MAIL_RETENTION_DAYS: "30", AUTH_TOKEN_RETENTION_DAYS: "30", AUTH_MIN_RESPONSE_MS: String(MIN_MS),
  }, SERVER_LOG);
  await waitUp(`${BASE}/health`, "сервер");
  if (want("R4")) {
    await waitUp(UI, "preview");
    const puppeteer = (await import("puppeteer-core")).default;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=ru-RU"] });
    console.log(`  (браузер: ${await browser.version()}; клиент — сборка под vite preview)`);
  }

  /* ════ R2: Д-72 живьём ════ */
  if (want("R2")) {
    console.log("\n■ R2: чистка проходом работника, время ответа, вкладка «Почта»");
    let line = null;
    for (let i = 0; i < 60 && !line; i++) { line = serverLog().match(/\[mail\] чистка:[^\n]*/)?.[0] ?? null; if (!line) await sleep(250); }
    ok(!!line, "лог: проход чистки состоялся на тике работника", line ?? serverLog().slice(-400));
    const leftMail = (await sql`select subject from mail_outbox where id in ${sql(fx.mails.map((m) => m.id))} order by subject`).map((r) => r.subject);
    ok(J(leftMail) === J(["fresh-sent"]), "mail_outbox: старые sent/failed исчезли, свежая sent осталась", leftMail);
    const leftTok = (await sql`select id from auth_tokens where id in ${sql(fx.toks.map((t) => t.id))}`).map((r) => r.id);
    ok(leftTok.length === 2 && leftTok.includes(fx.toks[2].id) && leftTok.includes(fx.toks[3].id), "auth_tokens: старые погашенный и просроченный исчезли, свежий погашенный и живой остались", leftTok.length);
    const sess = await sql`select id from sessions where user_id=${fx.uid}`;
    ok(sess.length === 1 && sess[0].id === sha(TAG + "s2"), "sessions: истёкшая снята, живая цела");
    ok(/чистка: писем \d+, доводов \d+, истёкших сессий \d+/.test(line ?? ""), "строка лога называет три числа", line);

    // время ответа формы сброса — 20 прогонов, медианы
    const U = await account("u");
    const tNo = await medianOf(() => call("/auth/password-reset/request", { body: { email: `${TAG}-nobody@example.com` } }));
    const tYes = await medianOf(() => call("/auth/password-reset/request", { body: { email: U.email } }));
    const diff = Math.abs(tNo - tYes);
    ok(diff <= Math.max(25, 0.12 * Math.max(tNo, tYes)), `форма сброса: медианы существующего ${tYes.toFixed(0)} мс и несуществующего ${tNo.toFixed(0)} мс совпадают в пределах шума (Δ ${diff.toFixed(0)} мс)`);
    ok(tNo >= MIN_MS - 5 && tYes >= MIN_MS - 5, `форма сброса: обе медианы не меньше минимума ${MIN_MS} мс`);
    const r1 = await call("/auth/password-reset/request", { body: { email: `${TAG}-nobody@example.com` } }), r2 = await call("/auth/password-reset/request", { body: { email: U.email } });
    ok(r1.status === 200 && r2.status === 200 && J(r1.json) === J(r2.json), "форма сброса: тело ответа одно и то же");
    // вход: несуществующий адрес против неверного пароля
    const tMissing = await medianOf(() => call("/auth/login", { body: { email: `${TAG}-nobody@example.com`, password: PW } }));
    const tWrong = await medianOf(() => call("/auth/login", { body: { email: U.email, password: "wrong-password" } }));
    ok(tMissing >= 0.6 * tWrong && tMissing <= 1.6 * tWrong, `вход: несуществующий адрес ${tMissing.toFixed(0)} мс сравним с неверным паролем ${tWrong.toFixed(0)} мс (20 прогонов, медианы)`);
    const lm = await call("/auth/login", { body: { email: `${TAG}-nobody@example.com`, password: PW } }), lw = await call("/auth/login", { body: { email: U.email, password: "wrong-password" } });
    ok(lm.status === 401 && lw.status === 401 && J(lm.json) === J(lw.json), "вход: оба ответа — один 401 с одним телом");
    // вкладка «Почта» — маршрут
    const A = await account("adm", { role: "admin" });
    const g = await call("/auth/mail-outbox?limit=10", { method: "GET" });
    const f = await call("/auth/mail-outbox?limit=10", { method: "GET", cookie: U.cookie });
    const a = await call("/auth/mail-outbox?limit=10", { method: "GET", cookie: A.cookie });
    ok(g.status === 401 && f.status === 403 && a.status === 200, `вкладка «Почта»: гостю ${g.status}, пользователю ${f.status}, администратору ${a.status}`);
    ok(a.json && ["pending", "overdue", "sent", "failed"].every((k) => typeof a.json.counts?.[k] === "number") && Array.isArray(a.json.rows) && a.json.rows.length <= 10 && a.json.rows.every((r) => !("bodyText" in r) && !("bodyHtml" in r)), "администратору: четыре счётчика и строки без тел", a.json?.counts);
    const sentLetters = await waitOutbox(U.email, (rows) => rows.some((r) => r.status === "sent"));
    ok(sentLetters.some((r) => r.status === "sent" && r.body_text === "" && r.body_html === ""), "письмо сброса ушло (console), тело затёрто");
  }

  /* ════ R3: Д-73 живьём ════ */
  let DE = null, deNewEmail = null;
  if (want("R3")) {
    console.log("\n■ R3: смена адреса end-to-end (ui_locale=de)");
    DE = await account("de", { locale: "de" });
    const BUSY = await account("busy");
    deNewEmail = `${TAG}-de-new@example.com`;
    const bad = await call("/auth/email/change/request", { body: { newEmail: deNewEmail, password: "wrong" }, cookie: DE.cookie });
    ok(bad.status === 401 && bad.json?.code === "AUTH_REQUIRED", "неверный пароль → 401 AUTH_REQUIRED", bad.json);
    const same = await call("/auth/email/change/request", { body: { newEmail: DE.email, password: PW }, cookie: DE.cookie });
    ok(same.status === 400 && same.json?.details?.newEmail, "текущий адрес как новый → 400 details.newEmail (по-немецки)", same.json);
    const noSess = await call("/auth/email/change/request", { body: { newEmail: deNewEmail, password: PW } });
    ok(noSess.status === 401, "без сессии → 401");
    const rBusy = await call("/auth/email/change/request", { body: { newEmail: BUSY.email, password: PW }, cookie: DE.cookie });
    const rFree = await call("/auth/email/change/request", { body: { newEmail: deNewEmail, password: PW }, cookie: DE.cookie });
    ok(rBusy.status === 200 && rFree.status === 200 && J(rBusy.json) === J(rFree.json), "занятый и свободный адрес — один ответ 200 с одним телом", [rBusy.json, rFree.json]);
    ok(Math.abs(rBusy.ms - rFree.ms) < 150 && rBusy.ms >= MIN_MS - 5 && rFree.ms >= MIN_MS - 5, `время ответа: занятый ${rBusy.ms.toFixed(0)} мс, свободный ${rFree.ms.toFixed(0)} мс — оба ≥ минимума`);
    const letter = await waitLetter(deNewEmail, (l) => l.link?.includes("/change-email/"));
    ok(!!letter && letter.subject === "PhiloSynth: Bestätigung der neuen Adresse" && /Georgia|neue|Adresse/i.test(letter.text), "письмо на НОВЫЙ адрес — по-немецки, со ссылкой /change-email/", letter?.subject);
    ok(letter?.link?.startsWith(`${UI}/change-email/`), "ссылка ведёт на клиент (PUBLIC_BASE_URL ← CLIENT_ORIGIN)", letter?.link);
    await sleep(700);
    // регистрация ставит письмо подтверждения (9.1) — считаем только письма смены адреса
    const changeRows = async (to) => (await outboxOf(to)).filter((r) => /neuen Adresse|нового адреса/.test(r.subject));
    const noticeRows = async (to) => (await outboxOf(to)).filter((r) => /geändert|изменён/.test(r.subject));
    ok((await changeRows(BUSY.email)).length === 0 && !lettersInLog().some((l) => l.to === BUSY.email && l.link?.includes("/change-email/")), "на занятый адрес письма смены нет (ни в очереди, ни в логе)");
    const sentRow = await waitOutbox(deNewEmail, (rows) => rows.some((r) => r.status === "sent"));
    ok(sentRow.some((r) => r.status === "sent" && r.body_text === "" && !r.body_html.includes("/change-email/")), "mail_outbox: строка sent, тело затёрто (ссылки в БД нет)");
    ok((await noticeRows(DE.email)).length === 0, "на старый адрес до подтверждения — уведомления нет");
    const [tokRow] = await sql`select new_email, used_at from auth_tokens where user_id=${DE.id} and purpose='email_change' and used_at is null`;
    ok(tokRow?.new_email === deNewEmail, "довод email_change несёт новый адрес в строке");
    // подтверждение — без сессии
    const token = tokenOf(letter.link);
    const conf = await call("/auth/email/change/confirm", { body: { token } });
    ok(conf.status === 200 && conf.json?.email === deNewEmail, "confirm без сессии → { ok, email: новый }", conf.json);
    const [u2] = await sql`select email, email_verified_at from users where id=${DE.id}`;
    ok(u2.email === deNewEmail && u2.email_verified_at, "users: адрес сменён и подтверждён");
    const notice = await waitLetter(DE.email, (l) => /geändert/.test(l.subject ?? ""));
    ok(!!notice && notice.subject === "PhiloSynth: Adresse des Kontos geändert" && !/https?:\/\//.test(notice.text.replace(/^From:.*$/m, "")) && notice.text.includes(deNewEmail), "уведомление на СТАРЫЙ адрес — по-немецки, без ссылок, новый адрес назван", notice?.subject);
    const nOld = (await waitOutbox(DE.email, (rows) => rows.some((r) => /geändert/.test(r.subject) && r.status === "sent"))).filter((r) => /geändert/.test(r.subject));
    ok(nOld.length === 1 && nOld[0].status === "sent", "mail_outbox: уведомление одно, ушло");
    const loginNew = await call("/auth/login", { body: { email: deNewEmail, password: PW } });
    const loginOld = await call("/auth/login", { body: { email: DE.email, password: PW } });
    ok(loginNew.status === 200 && loginOld.status === 401, `вход по новому адресу ${loginNew.status}, по старому ${loginOld.status}`);
    const me = await call("/auth/me", { method: "GET", cookie: DE.cookie });
    ok(me.status === 200 && me.json?.user?.email === deNewEmail && me.json?.user?.emailVerified === true, "старая сессия жива, /auth/me отдаёт новый адрес и emailVerified", me.json?.user);
    const again = await call("/auth/email/change/confirm", { body: { token } });
    ok(again.status === 400 && again.json?.code === "TOKEN_INVALID", "повторное подтверждение → 400 TOKEN_INVALID", again.json);
    // занятый к моменту подтверждения
    const late = `${TAG}-late@example.com`;
    await call("/auth/email/change/request", { body: { newEmail: late, password: PW }, cookie: DE.cookie });
    const l2 = await waitLetter(late, (l) => l.link?.includes("/change-email/"));
    await sql`update users set email=${late} where id=${BUSY.id}`;
    const lateConf = await call("/auth/email/change/confirm", { body: { token: tokenOf(l2.link) } });
    const [u3] = await sql`select email from users where id=${DE.id}`;
    ok(lateConf.status === 400 && lateConf.json?.code === "TOKEN_INVALID" && u3.email === deNewEmail, "адрес занят к моменту подтверждения → TOKEN_INVALID, адрес не сменён");
    await sleep(500);
    ok((await noticeRows(DE.email)).length === 1, "уведомления о несостоявшейся смене нет");
    DE.email = deNewEmail;
  }

  /* ════ R4: браузер ════ */
  if (want("R4")) {
    console.log("\n■ R4: браузер — форма смены адреса, страница подтверждения, вкладка «Почта»");
    const B = await account("br");
    const page = await newPage(B);
    await page.goto(`${UI}/profile`, { waitUntil: "networkidle0" });
    await waitSel(page, T("email-change-form"));
    ok(await exists(page, T("email-change-form")), "профиль: форма «Смена адреса» на месте");
    const brNew = `${TAG}-br-new@example.com`;
    await typeInto(page, `${T("email-change-form")} input[type="email"]`, brNew);
    await typeInto(page, `${T("email-change-form")} input[type="password"]`, "wrong-password");
    await click(page, T("email-change-submit"));
    await waitText(page, T("email-change-form"), /Неверный пароль/);
    ok(!(await exists(page, T("email-change-requested"))), "неверный пароль — ошибка у поля, пояснения об отправке нет");
    await typeInto(page, `${T("email-change-form")} input[type="password"]`, PW);
    await click(page, T("email-change-submit"));
    await waitSel(page, T("email-change-requested"));
    const req = await text(page, T("email-change-requested"));
    ok(/письмо|ссылк/i.test(req), "успех — пояснение под формой", req);
    const pwCleared = await page.$eval(`${T("email-change-form")} input[type="password"]`, (el) => el.value);
    ok(pwCleared === "", "поле пароля очищено после отправки");
    const letter = await waitLetter(brNew, (l) => l.link?.includes("/change-email/"));
    ok(!!letter && letter.subject === "PhiloSynth: подтверждение нового адреса", "письмо на новый адрес ушло (по-русски)", letter?.subject);
    // страница подтверждения — вошедшему
    // фаза done живёт 1,5 с до перехода — ждём её без networkidle0
    await page.goto(letter.link, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((s) => document.querySelector(s)?.dataset.phase === "done" || location.pathname === "/profile", { timeout: 20000, polling: 50 }, T("change-email"));
    const doneText = (await page.$(T("change-email"))) ? await text(page, T("change-email")) : "(уже в профиле)";
    ok(/изменён|уже в профиле/.test(doneText), "вошедшему: «Адрес изменён и подтверждён…» и переход", doneText);
    await page.waitForFunction(() => location.pathname === "/profile", { timeout: 10000 });
    await waitSel(page, T("email-change-form"));
    const shown = await page.$eval('form.input-form input[type="email"][disabled]', (el) => el.value).catch(() => null);
    ok(shown === brNew, "профиль показывает новый адрес без перезагрузки", shown);
    ok(page.errors.length === 0, "ошибок страницы нет", page.errors);
    // повторно — ошибка с подсказкой
    await page.goto(letter.link, { waitUntil: "networkidle0" });
    await waitSel(page, `${T("change-email")}[data-phase="error"]`);
    ok(/недействительна/.test(await text(page, T("change-email"))) && /час/.test(await text(page, T("change-email"))), "повторно: ошибка довода и подсказка о форме в профиле");
    // гостю — → /login с пояснением
    const G = await account("gu");
    const gNew = `${TAG}-gu-new@example.com`;
    await call("/auth/email/change/request", { body: { newEmail: gNew, password: PW }, cookie: G.cookie });
    const gl = await waitLetter(gNew, (l) => l.link?.includes("/change-email/"));
    const guest = await newPage(null);
    await guest.goto(gl.link, { waitUntil: "domcontentloaded" });
    await guest.waitForFunction(() => location.pathname === "/login", { timeout: 20000 });
    await waitSel(guest, T("login-notice"));
    ok(/новым адресом/.test(await text(guest, T("login-notice"))), "гостю: → /login с пояснением «войдите новым адресом»");
    await typeInto(guest, 'input[type="email"]', gNew);
    await typeInto(guest, 'input[type="password"]', PW);
    await click(guest, 'button[type="submit"]');
    await guest.waitForFunction(() => location.pathname !== "/login", { timeout: 10000 });
    ok(!guest.url().endsWith("/login"), "вход новым адресом из браузера прошёл", guest.url());
    // вкладка «Почта» — администратору
    const A = await account("adm2", { role: "admin" });
    const ap = await newPage(A);
    await ap.goto(`${UI}/admin/prompts`, { waitUntil: "networkidle0" });
    await waitSel(ap, T("tab-mail"));
    await click(ap, T("tab-mail"));
    await waitSel(ap, T("mail-tab"));
    await ap.waitForFunction((s) => /\d/.test(document.querySelector(s)?.textContent ?? ""), { timeout: 10000 }, T("mail-count-sent"));
    const sentN = Number((await text(ap, T("mail-count-sent"))).replace(/\D/g, ""));
    ok(sentN >= 2, `счётчик «отправлено» ≥ 2 (${sentN})`);
    await waitSel(ap, T("mail-rows") + " tbody tr");
    const rows = await ap.$$eval(T("mail-rows") + " tbody tr", (trs) => trs.map((tr) => ({ status: tr.dataset.status, text: tr.textContent })));
    ok(rows.length >= 2 && rows.every((r) => r.status) && rows.some((r) => r.text.includes(brNew)), "строки очереди: адрес, статус; тел нет", rows.slice(0, 2));
    ok(!rows.some((r) => /change-email|http/.test(r.text)), "в строках нет ссылок из тел");
    // новые первыми: после «Обновить» верхняя строка — свежее письмо сброса (лимит 50 может быть уже полон)
    await call("/auth/password-reset/request", { body: { email: brNew } }); // адрес B уже сменён
    await sleep(800);
    await click(ap, T("mail-refresh"));
    await ap.waitForFunction((s, email) => (document.querySelector(s + " tbody tr")?.textContent ?? "").includes(email) && /сброс/i.test(document.querySelector(s + " tbody tr")?.textContent ?? ""), { timeout: 10000 }, T("mail-rows"), brNew);
    ok(true, "«Обновить» подтягивает свежую строку наверх (новые первыми)");
    ok(ap.errors.length === 0, "ошибок страницы на вкладке нет", ap.errors);
    // пользователю — админки нет
    const up = await newPage(B);
    await up.goto(`${UI}/admin/prompts`, { waitUntil: "networkidle0" });
    await sleep(500);
    ok(!(await exists(up, T("tab-mail"))), "пользователю вкладка «Почта» недоступна (/admin/prompts закрыт)", up.url());
  }
} catch (err) {
  failed++; fails.push("исключение");
  console.error("исключение:", err);
  if (lastPage) await lastPage.screenshot({ path: "/tmp/t153-fail.png" }).catch(() => {});
} finally {
  if (browser) await browser.close().catch(() => {});
  for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch {} }
  await sql`delete from mail_outbox where to_email like ${TAG + "%"}`.catch(() => {});
  for (const id of userIds) await sql`delete from users where id=${id}`.catch(() => {});
  await sql.end({ timeout: 2 });
}
console.log(`\nИТОГ test-153 (запросы 2–4): ${passed} ✓ / ${failed} ✗${fails.length ? "\n  провалы: " + fails.join(" | ") : ""}`);
process.exit(failed ? 1 : 0);
