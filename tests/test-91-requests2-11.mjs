/**
 * Тестовые запросы беседы 9.1 (R2–R11) одним заходом: почта — подтверждение
 * адреса и сброс пароля. Живой сервер :3000 на ОТДЕЛЬНОЙ пустой БД
 * philosynth_t91 (пересоздаётся; миграции 0000–0006 — drizzle-kit), PG16 +
 * Redis, vite :5199, puppeteer-core + Chrome. Почтового узла НЕТ: фаза A
 * идёт в MAIL_TRANSPORT='console' — письма читаются из вывода сервера; фаза
 * B (R7) — второй запуск того же сервера в режиме 'smtp' против мока SMTP
 * внутри харнесса (net-сервер: 550 / 451 / 250 по адресату). Фазы идут
 * ПОСЛЕДОВАТЕЛЬНО на одной БД: два работника разобрали бы очередь друг друга.
 *
 *  R2  console: регистрация → письмо со ссылкой в выводе, mail_outbox 'sent';
 *      переход по ссылке → email_verified_at заполнен
 *  R3  сброс: существующий и несуществующий адрес → ОДИНАКОВЫЙ 200 и текст;
 *      письмо ушло только в первом случае
 *  R4  смена: ссылка → новый пароль → старым вход не работает, новым — да;
 *      прочие сессии завершены (вторая cookie → 401); вариант (а) — адрес
 *      подтверждён сбросом
 *  R5  однократность: повтор той же ссылки → 400 TOKEN_INVALID; ссылка,
 *      выданная раньше новой, → 400
 *  R6  срок: довод сброса с истёкшим expires_at → 400 TOKEN_INVALID
 *  R7  два рода отказа: мок SMTP 550 → 'failed' с последней ошибкой, повторов
 *      нет; 451 → attempts растёт, next_attempt_at сдвигается, после шестой
 *      попытки 'failed'; 250 → 'sent'
 *  R8  транзакционность: сбой постановки письма не отменяет регистрацию;
 *      откат регистрации (409) не оставляет ни письма, ни довода
 *  R9  пароль: newPassword короче минимума → 400 VALIDATION_ERROR с
 *      details.newPassword тем же текстом, что при регистрации; ссылка цела
 *  R10 браузер: «Забыли пароль?» → форма → письмо в выводе → ссылка → новый
 *      пароль → вход; полоса «адрес не подтверждён» видна до подтверждения и
 *      исчезает после; «Отправить письмо ещё раз» с защитой от повтора
 *  R11 production с пустым SMTP_HOST → сервер отказывается стартовать с
 *      внятным сообщением, порт не слушает
 *
 * Запуск из корня (PG16 + Redis подняты):
 *   CHROME_PATH=~/.cache/puppeteer/chrome/linux-131…/chrome-linux64/chrome \
 *   node tests/test-91-requests2-11.mjs
 * puppeteer-core: из node_modules либо PUPPETEER_CORE (каталог пакета).
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import net from "node:net";
import { homedir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";

const ROOT = new URL("../", import.meta.url).pathname;
const SERVER_PORT = 3000; // прокси vite зашит на :3000 (09 §4, 5.4)
const VITE_PORT = 5199;
const SMTP_PORT = 2591;
const API = `http://localhost:${SERVER_PORT}/api/v1`;
const UI = `http://localhost:${VITE_PORT}`;
const DB_NAME = "philosynth_t91";
const ADMIN_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const DB_URL = ADMIN_URL.replace(/\/[^/]+$/, `/${DB_NAME}`);
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  `${homedir()}/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome`,
  "/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome",
  "/opt/google/chrome/chrome",
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));
const RETRY_DELAYS = "300,300,300,300,300"; // пять задержек → шесть попыток

let n = 0, failed = 0;
function ok(cond, name, extra = "") {
  n++;
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name} ${extra === "" ? "" : JSON.stringify(extra)}`); }
}
const head = (t) => console.log(`\n── ${t} ──`);

/* ── Стенд ─────────────────────────────────────────────────────────── */
let serverProc = null, viteProc = null, serverLog = "", viteLog = "", browser = null, smtp = null;
const killGroup = (p) => { if (!p) return; try { process.kill(-p.pid, "SIGKILL"); } catch {} try { p.kill("SIGKILL"); } catch {} };

async function assertPortFree(url, name) {
  try { const r = await fetch(url); if (r.ok) throw new Error(`порт занят чужим ${name}`); }
  catch (e) { if (String(e).includes("порт занят")) throw e; }
}
async function startServer(extraEnv) {
  await assertPortFree(`${API}/health`, "сервером");
  serverLog = "";
  serverProc = spawn(process.execPath, ["--import", "tsx", "index.ts"], {
    cwd: ROOT + "server/",
    env: {
      ...process.env, PORT: String(SERVER_PORT), DATABASE_URL: DB_URL,
      REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379", CLIENT_ORIGIN: UI,
      NODE_ENV: "development", BILLING_ENFORCE: "false",
      RATE_LIMIT_HTTP_PER_MINUTE: "100000", RATE_LIMIT_MAIL_PER_HOUR: "100000",
      MAIL_WORKER_INTERVAL_MS: "250", PUBLIC_BASE_URL: "", ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  serverProc.stdout.on("data", (d) => (serverLog += d));
  serverProc.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`${API}/health`)).ok) return; } catch {} await sleep(300); }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-2000));
}
async function stopServer() {
  if (!serverProc) return;
  const p = serverProc; serverProc = null;
  const exited = new Promise((r) => p.once("exit", r));
  try { p.kill("SIGTERM"); } catch {}
  const graceful = await Promise.race([exited.then(() => true), sleep(8000).then(() => false)]);
  if (!graceful) killGroup(p);
  for (let i = 0; i < 40; i++) { try { await fetch(`${API}/health`); await sleep(200); } catch { break; } }
  return graceful;
}
async function startVite() {
  await assertPortFree(UI + "/", "vite");
  viteProc = spawn(process.execPath, [ROOT + "node_modules/vite/bin/vite.js", "--port", String(VITE_PORT), "--strictPort"], {
    cwd: ROOT + "client/", env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  viteProc.stdout.on("data", (d) => (viteLog += d));
  viteProc.stderr.on("data", (d) => (viteLog += d));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(UI + "/")).ok) return; } catch {} await sleep(300); }
  throw new Error("vite не поднялся:\n" + viteLog.slice(-2000));
}

/** Мок SMTP: исход RCPT TO — по адресату (perm550 / temp451 / иначе 250). */
function startSmtpMock() {
  const state = { rcpt: [], delivered: [] };
  const server = net.createServer((sock) => {
    let buf = "", inData = false, current = null;
    const say = (l) => sock.write(l + "\r\n");
    say("220 mock.test ESMTP t91");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end < 0) return;
          state.delivered.push({ to: current, body: buf.slice(0, end) });
          buf = buf.slice(end + 5); inData = false; say("250 2.0.0 queued");
          continue;
        }
        const nl = buf.indexOf("\r\n");
        if (nl < 0) return;
        const line = buf.slice(0, nl); buf = buf.slice(nl + 2);
        const up = line.toUpperCase();
        if (up.startsWith("EHLO")) { sock.write("250-mock.test\r\n250 8BITMIME\r\n"); }
        else if (up.startsWith("HELO")) say("250 mock.test");
        else if (up.startsWith("MAIL FROM")) say("250 2.1.0 ok");
        else if (up.startsWith("RCPT TO")) {
          const addr = (line.match(/<([^>]*)>/) ?? [])[1] ?? "";
          state.rcpt.push(addr); current = addr;
          if (addr.includes("perm550")) say("550 5.1.1 No such user here");
          else if (addr.includes("temp451")) say("451 4.3.0 Mailbox busy, try again later");
          else say("250 2.1.5 ok");
        }
        else if (up === "DATA") { say("354 go ahead"); inData = true; }
        else if (up === "RSET") say("250 ok");
        else if (up === "QUIT") { say("221 bye"); sock.end(); }
        else say("250 ok");
      }
    });
    sock.on("error", () => {});
  });
  return new Promise((res) => server.listen(SMTP_PORT, "127.0.0.1", () => res({ server, state })));
}

/* ── Хелперы API ───────────────────────────────────────────────────── */
let sql = null;
const TAG = `t91${Date.now().toString(36)}`;
const mail = (name) => `${name}-${TAG}@example.org`;
async function call(path, { method = "POST", body, cookie } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  const set = res.headers.get("set-cookie");
  return { status: res.status, json, text, cookie: set ? set.split(";")[0] : null };
}
const register = (email, password = "password-one") => call("/auth/register", { body: { email, password } });
async function login(email, password) { const r = await call("/auth/login", { body: { email, password } }); return r.cookie; }

/** Письма режима console из вывода сервера: [{ to, subject, text, link }] */
function lettersInLog() {
  const out = [];
  const re = /──────── \[mail:console\] письмо ────────\n([\s\S]*?)\n──────── \[mail:console\] конец/g;
  for (const m of serverLog.matchAll(re)) {
    const block = m[1];
    out.push({
      to: (block.match(/^To: (.*)$/m) ?? [])[1],
      subject: (block.match(/^Subject: (.*)$/m) ?? [])[1],
      text: block,
      link: (block.match(/https?:\/\/\S+\/(?:verify-email|reset-password)\/\S+/) ?? [])[0] ?? null,
    });
  }
  return out;
}
async function waitLetter(to, kind, { skip = 0, timeout = 8000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const found = lettersInLog().filter((l) => l.to === to && l.link?.includes(`/${kind}/`));
    if (found.length > skip) return found[skip];
    await sleep(150);
  }
  return null;
}
const tokenOf = (link) => decodeURIComponent(link.split("/").pop());
const outboxOf = (to) => sql`select * from mail_outbox where to_email = ${to} order by created_at`;
async function waitOutbox(to, pred, timeout = 15000) {
  const t0 = Date.now();
  for (;;) {
    const rows = await outboxOf(to);
    if (pred(rows)) return rows;
    if (Date.now() - t0 > timeout) return rows;
    await sleep(100);
  }
}

/* ══ Прогон ══════════════════════════════════════════════════════════ */
let exitCode = 1;
try {
  head("Стенд: пустая БД philosynth_t91, миграции 0000–0006");
  const admin = postgres(ADMIN_URL.replace(/\/[^/]+$/, "/postgres"), { max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${DB_NAME}`);
  await admin.end();
  sql = postgres(DB_URL, { max: 3, onnotice: () => {} });
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
  const mig = spawnSync("npx", ["drizzle-kit", "migrate"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, DATABASE_URL: DB_URL }, timeout: 120000 });
  ok(mig.status === 0 && /migrations applied successfully/.test(mig.stdout + mig.stderr), "drizzle-kit migrate 0000–0006 на пустой БД", (mig.stdout + mig.stderr).slice(-300));
  const cols = await sql`select column_name from information_schema.columns where table_name = 'users' and column_name = 'email_verified_at'`;
  const tbls = await sql`select table_name from information_schema.tables where table_name in ('auth_tokens','mail_outbox')`;
  ok(cols.length === 1 && tbls.length === 2, "users.email_verified_at, auth_tokens, mail_outbox на месте");

  /* ── R11 — до подъёма стенда: порт свободен ── */
  head("R11. production с пустым SMTP_HOST → отказ при запуске");
  {
    const prodEnv = { ...process.env, NODE_ENV: "production", PORT: String(SERVER_PORT), DATABASE_URL: DB_URL, REDIS_URL: "redis://localhost:6379", CLIENT_ORIGIN: UI, SMTP_HOST: "", MAIL_FROM: "PS <a@example.org>", MAIL_TRANSPORT: "" };
    const r = spawnSync(process.execPath, ["--import", "tsx", "index.ts"], { cwd: ROOT + "server/", env: prodEnv, encoding: "utf8", timeout: 20000 });
    ok(r.status !== 0 && r.status !== null, "процесс завершился с ненулевым кодом", r.status);
    ok(/SMTP_HOST/.test(r.stderr) && /Почта не настроена/.test(r.stderr) && /не запускается/.test(r.stderr), "сообщение называет SMTP_HOST и говорит, почему сервер не стартует", r.stderr.slice(0, 300));
    ok(/README/.test(r.stderr), "сообщение отсылает к README «Почта»");
    ok(!/PhiloSynth server: http/.test(r.stdout), "сервер НЕ объявил себя запущенным (писем молча не теряет)");
    let listening = false; try { listening = (await fetch(`${API}/health`)).ok; } catch {}
    ok(!listening, "порт не слушает");
    const r2 = spawnSync(process.execPath, ["--import", "tsx", "index.ts"], { cwd: ROOT + "server/", env: { ...prodEnv, MAIL_TRANSPORT: "console" }, encoding: "utf8", timeout: 20000 });
    ok(r2.status !== 0 && /SMTP_HOST/.test(r2.stderr), "MAIL_TRANSPORT=console в production отказ не обходит");
  }

  await startServer({ MAIL_TRANSPORT: "console" });
  await startVite();
  console.log("\nСервер (console) и vite подняты.");

  /* ── R2 ── */
  head("R2. Режим console: регистрация → письмо → подтверждение");
  const uA = mail("anna");
  {
    const r = await register(uA);
    ok(r.status === 201 && r.json?.user?.email === uA, "регистрация 201");
    const letter = await waitLetter(uA, "verify-email");
    ok(!!letter, "в выводе сервера письмо с подтверждением", serverLog.slice(-400));
    ok(/подтверждение адреса/.test(letter?.subject ?? ""), "тема письма — подтверждение адреса", letter?.subject);
    ok(letter?.link?.startsWith(`${UI}/verify-email/`), "ссылка ведёт на клиент (PUBLIC_BASE_URL ← CLIENT_ORIGIN)", letter?.link);
    ok(/72 часа/.test(letter?.text ?? ""), "в письме назван срок 72 часа");
    const rows = await waitOutbox(uA, (rs) => rs.length === 1 && rs[0].status === "sent");
    ok(rows.length === 1 && rows[0].status === "sent" && rows[0].attempts === 1 && rows[0].sent_at !== null, "mail_outbox: строка 'sent', attempts=1, sent_at", rows.map((x) => x.status));
    ok(rows[0].body_text === "" && rows[0].body_html === "", "после отправки тела письма затёрты: живой ссылки в очереди нет");
    const tok = tokenOf(letter.link);
    const [leak] = await sql`select count(*)::int as c from mail_outbox where body_text like ${"%" + tok + "%"} or body_html like ${"%" + tok + "%"}`;
    ok(leak.c === 0, "довод не находится в mail_outbox ни в каком виде");
    const [trow] = await sql`select * from auth_tokens t join users u on u.id = t.user_id where u.email = ${uA}`;
    ok(trow.token_hash === createHash("sha256").update(tok).digest("hex") && trow.token_hash !== tok, "в auth_tokens лежит sha256 довода, не сам довод");
    const ttlH = (new Date(trow.expires_at) - new Date(trow.created_at)) / 3600000;
    ok(Math.abs(ttlH - 72) < 0.01, "срок жизни довода подтверждения — 72 ч", ttlH);

    const cookie = await login(uA, "password-one");
    ok(!!cookie, "вход при НЕПОДТВЕРЖДЁННОМ адресе не запрещён");
    const me0 = await call("/auth/me", { method: "GET", cookie });
    ok(me0.json?.user?.emailVerified === false, "GET /auth/me: emailVerified=false до перехода");
    const conf = await call("/auth/email/verify/confirm", { body: { token: tok } });
    ok(conf.status === 200 && conf.json?.ok === true, "переход по ссылке (confirm БЕЗ сессии) → 200");
    const [u] = await sql`select email_verified_at from users where email = ${uA}`;
    ok(u.email_verified_at !== null, "email_verified_at заполнен");
    const me1 = await call("/auth/me", { method: "GET", cookie });
    ok(me1.json?.user?.emailVerified === true, "GET /auth/me: emailVerified=true после");
    const again = await call("/auth/email/verify/request", { cookie });
    ok(again.status === 200 && again.json?.alreadyVerified === true && again.json?.sent === false, "verify/request у подтверждённого → 200 без письма");
    await sleep(700);
    ok((await outboxOf(uA)).length === 1, "…и новой строки в очереди нет");
    const noAuth = await call("/auth/email/verify/request");
    ok(noAuth.status === 401, "verify/request без сессии → 401");
  }

  /* ── R3 ── */
  head("R3. Сброс: существующий и несуществующий адрес неразличимы");
  const ghost = mail("ghost");
  {
    const a = await call("/auth/password-reset/request", { body: { email: uA } });
    const b = await call("/auth/password-reset/request", { body: { email: ghost } });
    ok(a.status === 200 && b.status === 200, "оба ответа 200", [a.status, b.status]);
    ok(a.text === b.text && a.json?.ok === true && typeof a.json?.message === "string" && a.json.message.length > 20, "тела ответов ПОБАЙТОВО одинаковы", [a.text, b.text]);
    ok(a.cookie === null && b.cookie === null, "ни один ответ не ставит cookie");
    const letter = await waitLetter(uA, "reset-password");
    ok(!!letter && /сброс пароля/.test(letter.subject), "существующему письмо ушло");
    await sleep(900);
    ok((await outboxOf(ghost)).length === 0 && !lettersInLog().some((l) => l.to === ghost), "несуществующему письма нет — ни в очереди, ни в выводе");
    const [{ c }] = await sql`select count(*)::int as c from auth_tokens where purpose = 'password_reset'`;
    ok(c === 1, "довод сброса выдан один", c);
    const upper = await call("/auth/password-reset/request", { body: { email: `  ${uA.toUpperCase()} ` } });
    ok(upper.status === 200 && upper.text === a.text, "адрес нормализуется (регистр, пробелы), ответ тот же");
    const bad = await call("/auth/password-reset/request", { body: { email: "не-адрес" } });
    ok(bad.status === 400 && bad.json?.code === "VALIDATION_ERROR" && !!bad.json?.details?.email, "отказ по ФОРМЕ адреса → 400 details.email (существования не выдаёт)");
  }

  /* ── R9 (до смены: ссылка должна остаться целой) ── */
  head("R9. Короткий пароль: тот же текст, что при регистрации; ссылка цела");
  // последнее письмо сброса для uA (после запроса с верхним регистром — второе)
  const resetLetter = await waitLetter(uA, "reset-password", { skip: 1 });
  const resetTok = tokenOf(resetLetter.link);
  {
    const regShort = await call("/auth/register", { body: { email: mail("short"), password: "1234567" } });
    const r = await call("/auth/password-reset/confirm", { body: { token: resetTok, newPassword: "1234567" } });
    ok(r.status === 400 && r.json?.code === "VALIDATION_ERROR", "newPassword короче минимума → 400 VALIDATION_ERROR", r.json);
    ok(typeof r.json?.details?.newPassword === "string" && r.json.details.newPassword === regShort.json?.details?.password, "details.newPassword — тот же текст, что details.password регистрации", [r.json?.details, regShort.json?.details]);
    const empty = await call("/auth/password-reset/confirm", { body: { token: resetTok } });
    ok(empty.status === 400 && !!empty.json?.details?.newPassword, "пустой newPassword → 400 details.newPassword");
    const [t] = await sql`select used_at from auth_tokens where token_hash = ${createHash("sha256").update(resetTok).digest("hex")}`;
    ok(t.used_at === null, "короткий пароль ссылку НЕ сжёг");
  }

  /* ── R5 (первая половина) + R4 ── */
  head("R4. Смена пароля по ссылке; R5. Однократность");
  {
    const firstLetter = await waitLetter(uA, "reset-password", { skip: 0 });
    const early = await call("/auth/password-reset/confirm", { body: { token: tokenOf(firstLetter.link), newPassword: "password-two" } });
    ok(early.status === 400 && early.json?.code === "TOKEN_INVALID", "R5: ссылка, выданная РАНЬШЕ новой, → 400 TOKEN_INVALID", early.json);

    const c1 = await login(uA, "password-one");
    const c2 = await login(uA, "password-one");
    ok(!!c1 && !!c2 && c1 !== c2, "две живые сессии одной учётной записи");
    const done = await call("/auth/password-reset/confirm", { body: { token: resetTok, newPassword: "password-two" }, cookie: c1 });
    ok(done.status === 200 && done.json?.ok === true, "R4: переход по ссылке + новый пароль → 200", done.json);
    ok((await login(uA, "password-one")) === null, "R4: вход старым паролем не работает");
    const cNew = await login(uA, "password-two");
    ok(!!cNew, "R4: вход новым паролем работает");
    const m1 = await call("/auth/me", { method: "GET", cookie: c1 });
    const m2 = await call("/auth/me", { method: "GET", cookie: c2 });
    ok(m1.status === 401 && m2.status === 401, "R4: прочие сессии завершены — ОБЕ прежние cookie → 401", [m1.status, m2.status]);
    const [{ c }] = await sql`select count(*)::int as c from sessions s join users u on u.id = s.user_id where u.email = ${uA}`;
    ok(c === 1, "R4: в БД осталась только новая сессия", c);

    const repeat = await call("/auth/password-reset/confirm", { body: { token: resetTok, newPassword: "password-three" } });
    ok(repeat.status === 400 && repeat.json?.code === "TOKEN_INVALID", "R5: повторный переход по той же ссылке → 400 TOKEN_INVALID", repeat.json);
    ok(repeat.json?.error === early.json?.error, "R5: текст отказа один на оба случая");
    ok(!!(await login(uA, "password-two")) && (await login(uA, "password-three")) === null, "R5: повтор пароль не сменил");
    const junk = await call("/auth/password-reset/confirm", { body: { token: "нет-такого-довода", newPassword: "password-three" } });
    const none = await call("/auth/password-reset/confirm", { body: { newPassword: "password-three" } });
    ok(junk.status === 400 && junk.json?.code === "TOKEN_INVALID" && none.json?.code === "TOKEN_INVALID", "R5: несуществующий и пустой довод → тот же TOKEN_INVALID");
    const cross = await call("/auth/email/verify/confirm", { body: { token: resetTok } });
    ok(cross.status === 400 && cross.json?.code === "TOKEN_INVALID", "R5: довод сброса на маршруте подтверждения не годится");

    // подтверждение адреса: та же однократность + вариант (а)
    const uB = mail("boris");
    await register(uB);
    const v1 = await waitLetter(uB, "verify-email");
    const cB = await login(uB, "password-one");
    const resend = await call("/auth/email/verify/request", { cookie: cB });
    ok(resend.status === 200 && resend.json?.sent === true && resend.json?.alreadyVerified === false, "«отправить ещё раз» → 200 sent");
    const v2 = await waitLetter(uB, "verify-email", { skip: 1 });
    ok(!!v2 && v2.link !== v1.link, "пришло второе письмо с НОВОЙ ссылкой");
    const oldV = await call("/auth/email/verify/confirm", { body: { token: tokenOf(v1.link) } });
    ok(oldV.status === 400 && oldV.json?.code === "TOKEN_INVALID", "R5: прежняя ссылка подтверждения мертва (помечена использованной)");
    const newV = await call("/auth/email/verify/confirm", { body: { token: tokenOf(v2.link) } });
    const newV2 = await call("/auth/email/verify/confirm", { body: { token: tokenOf(v2.link) } });
    ok(newV.status === 200 && newV2.status === 400 && newV2.json?.code === "TOKEN_INVALID", "R5: новая срабатывает один раз");

    const uC = mail("clara");
    await register(uC);
    await call("/auth/password-reset/request", { body: { email: uC } });
    const rc = await waitLetter(uC, "reset-password");
    await call("/auth/password-reset/confirm", { body: { token: tokenOf(rc.link), newPassword: "password-two" } });
    const [uc] = await sql`select email_verified_at from users where email = ${uC}`;
    ok(uc.email_verified_at !== null, "вариант (а): успешный сброс подтверждает адрес");
    const vc = await waitLetter(uC, "verify-email");
    const late = await call("/auth/email/verify/confirm", { body: { token: tokenOf(vc.link) } });
    ok(late.status === 400, "…и ждавшая ссылка подтверждения погашена");
  }

  /* ── R6 ── */
  head("R6. Срок: истёкший довод сброса");
  {
    const uD = mail("dina");
    await register(uD);
    await call("/auth/password-reset/request", { body: { email: uD } });
    const l = await waitLetter(uD, "reset-password");
    const tok = tokenOf(l.link);
    const h = createHash("sha256").update(tok).digest("hex");
    const [t0] = await sql`select expires_at, created_at from auth_tokens where token_hash = ${h}`;
    ok(Math.abs((new Date(t0.expires_at) - new Date(t0.created_at)) / 60000 - 60) < 0.1, "срок жизни довода сброса — 1 ч");
    await sql`update auth_tokens set expires_at = now() - interval '1 second' where token_hash = ${h}`;
    const r = await call("/auth/password-reset/confirm", { body: { token: tok, newPassword: "password-two" } });
    ok(r.status === 400 && r.json?.code === "TOKEN_INVALID", "истёкший expires_at → 400 TOKEN_INVALID", r.json);
    ok(!!(await login(uD, "password-one")) && (await login(uD, "password-two")) === null, "пароль не сменён");
    const [t1] = await sql`select used_at from auth_tokens where token_hash = ${h}`;
    ok(t1.used_at === null, "просроченный довод не помечается использованным (и не нужен: срок решает)");
    await sql`update auth_tokens set expires_at = now() - interval '1 second' where user_id = (select id from users where email = ${uD}) and purpose = 'email_verify'`;
    const lv = await waitLetter(uD, "verify-email");
    const rv = await call("/auth/email/verify/confirm", { body: { token: tokenOf(lv.link) } });
    ok(rv.status === 400 && rv.json?.code === "TOKEN_INVALID", "то же для просроченной ссылки подтверждения");
  }

  /* ── R8 ── */
  head("R8. Транзакционность постановки письма");
  {
    await sql.unsafe(`
      CREATE FUNCTION t91_fail_enqueue() RETURNS trigger AS $$
      BEGIN
        IF NEW.to_email LIKE 'failqueue-%' THEN RAISE EXCEPTION 't91: очередь писем сломана'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
      CREATE TRIGGER t91_fail_enqueue BEFORE INSERT ON mail_outbox FOR EACH ROW EXECUTE FUNCTION t91_fail_enqueue();`);
    const uF = mail("failqueue");
    const r = await register(uF);
    ok(r.status === 201, "сбой постановки письма НЕ отменяет регистрацию: 201", r.json);
    const [u] = await sql`select id from users where email = ${uF}`;
    ok(!!u && !!(await login(uF, "password-one")), "пользователь создан и входит");
    const toks = await sql`select 1 from auth_tokens where user_id = ${u.id}`;
    ok((await outboxOf(uF)).length === 0 && toks.length === 0, "ни письма, ни бесполезного довода (точка сохранения откатила оба)");
    ok(/\[mail\][^\n]*не поставлено[^\n]*t91: очередь писем сломана/.test(serverLog), "сбой записан в лог сервера с причиной");
    const cF = await login(uF, "password-one");
    const rs = await call("/auth/email/verify/request", { cookie: cF });
    ok(rs.status === 500 && rs.json?.code === "INTERNAL_ERROR", "«отправить ещё раз» при сломанной очереди честно отвечает 500");
    const rr = await call("/auth/password-reset/request", { body: { email: uF } });
    const rg = await call("/auth/password-reset/request", { body: { email: ghost } });
    ok(rr.status === 200 && rr.text === rg.text, "форма сброса и при сломанной очереди неотличима от несуществующего адреса");
    await sql.unsafe(`DROP TRIGGER t91_fail_enqueue ON mail_outbox; DROP FUNCTION t91_fail_enqueue();`);

    const before = await sql`select (select count(*)::int from mail_outbox) as m, (select count(*)::int from auth_tokens) as t, (select count(*)::int from users) as u`;
    const dup = await register(uA, "password-xyz");
    ok(dup.status === 409 && dup.json?.details?.email, "откат регистрации: занятый адрес → 409");
    await sleep(600);
    const after = await sql`select (select count(*)::int from mail_outbox) as m, (select count(*)::int from auth_tokens) as t, (select count(*)::int from users) as u`;
    ok(after[0].m === before[0].m && after[0].t === before[0].t && after[0].u === before[0].u, "откат не оставил ни письма в очереди, ни довода, ни пользователя", [before[0], after[0]]);
    ok(lettersInLog().filter((l) => l.to === uA && l.link?.includes("verify-email")).length === 1, "второго письма подтверждения на занятый адрес не ушло");
  }

  /* ── R10 ── */
  head("R10. Клиент в браузере");
  {
    let puppeteer;
    try { puppeteer = (await import("puppeteer-core")).default; }
    catch {
      const dir = process.env.PUPPETEER_CORE ?? [`${homedir()}/.npm-global`, "/home/claude/.npm-global"].map((p) => `${p}/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/puppeteer-core`).find((p) => existsSync(p));
      puppeteer = (await import(`${dir}/lib/esm/puppeteer/puppeteer-core.js`)).default;
    }
    browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    console.log(`  (браузер: ${await browser.version()})`);
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    const txt = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, " ").trim()).catch(() => null);
    const has = (sel) => page.$(sel).then((h) => !!h);
    const waitPath = (p) => page.waitForFunction((x) => location.pathname === x, { timeout: 10000 }, p);
    async function fill(sel, value) {
      await page.waitForSelector(sel, { timeout: 10000 });
      await page.$eval(sel, (el, v) => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
    }
    const submit = () => page.$eval("form button[type=submit]", (b) => b.click());

    const uE = mail("eva");
    // регистрация через форму → авто-вход → каталог с полосой
    await page.goto(`${UI}/register`, { waitUntil: "networkidle0" });
    await fill("input[type=email]", uE);
    await fill("input[type=password]", "password-one");
    await submit();
    await waitPath("/catalog");
    await page.waitForSelector('[data-testid="unverified-banner"]', { timeout: 10000 });
    ok(true, "после регистрации вошедший видит полосу");
    ok(/адрес не подтверждён/i.test(await txt('[data-testid="unverified-banner"]')) && (await txt('[data-testid="unverified-banner"]')).includes(uE), "полоса: «Адрес не подтверждён» и сам адрес");
    ok(/отправить письмо ещё раз/i.test(await txt('[data-testid="unverified-resend"]')), "кнопка «Отправить письмо ещё раз»");

    // защита от повторного нажатия: три клика подряд → один запрос, одно письмо
    let resendCalls = 0;
    page.on("request", (rq) => { if (rq.url().endsWith("/auth/email/verify/request")) resendCalls++; });
    await page.$eval('[data-testid="unverified-resend"]', (b) => { b.click(); b.click(); b.click(); });
    await page.waitForSelector('[data-testid="unverified-sent"]', { timeout: 10000 });
    ok(resendCalls === 1, "три клика подряд → ровно один запрос", resendCalls);
    ok(!(await has('[data-testid="unverified-resend"]')) && /письмо отправлено/i.test(await txt('[data-testid="unverified-sent"]')), "кнопку сменила строка «Письмо отправлено»");
    const second = await waitLetter(uE, "verify-email", { skip: 1 });
    await sleep(800);
    ok(!!second && lettersInLog().filter((l) => l.to === uE && l.link?.includes("verify-email")).length === 2, "в выводе ровно два письма подтверждения (регистрация + повтор)");

    // переход по ссылке из письма → подтверждение → каталог, полосы нет
    await page.goto(second.link, { waitUntil: "networkidle0" });
    await page.waitForSelector('[data-testid="verify-email"][data-phase="done"]', { timeout: 10000 });
    ok(/адрес подтверждён/i.test(await txt('[data-testid="verify-email"]')), "страница подтверждения: «Адрес подтверждён»");
    await waitPath("/catalog");
    await page.waitForSelector('[data-testid="topbar-right"] a', { timeout: 10000 });
    await sleep(400);
    ok(!(await has('[data-testid="unverified-banner"]')), "полоса исчезла после подтверждения");
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector('[data-testid="topbar-right"] a', { timeout: 10000 });
    ok(!(await has('[data-testid="unverified-banner"]')), "…и после перезагрузки страницы её нет");
    const [ev] = await sql`select email_verified_at from users where email = ${uE}`;
    ok(ev.email_verified_at !== null, "в БД email_verified_at заполнен");

    // использованная ссылка — в отдельном (гостевом) контексте
    const guestCtx = await browser.createBrowserContext();
    const gp = await guestCtx.newPage();
    await gp.goto(second.link, { waitUntil: "networkidle0" });
    await gp.waitForSelector('[data-testid="verify-email"][data-phase="error"]', { timeout: 10000 });
    ok(/недействительна/i.test(await gp.$eval('[data-testid="verify-email"]', (el) => el.textContent)), "повторный переход по ссылке: «ссылка недействительна»");
    await guestCtx.close();

    // выход → «Забыли пароль?»
    await page.$$eval('[data-testid="topbar-right"] button', (bs) => bs.find((b) => /выйти/i.test(b.textContent)).click());
    await waitPath("/");
    await page.goto(`${UI}/login`, { waitUntil: "networkidle0" });
    ok(/забыли пароль\?/i.test(await txt('[data-testid="forgot-password-link"]')), "LoginPage: ссылка «Забыли пароль?»");
    const near = await page.$eval('[data-testid="forgot-password-link"]', (a) => /регистрация/i.test(a.parentElement.textContent));
    ok(near, "…рядом со ссылкой на регистрацию");
    await page.$eval('[data-testid="forgot-password-link"]', (a) => a.click());
    await waitPath("/reset-password");
    // несуществующий адрес: тот же экран, тот же текст
    await fill("input[type=email]", ghost);
    await submit();
    await page.waitForSelector('[data-testid="reset-request-done"] [role=status]', { timeout: 10000 });
    const ghostText = await txt('[data-testid="reset-request-done"] [role=status]');
    await page.goto(`${UI}/reset-password`, { waitUntil: "networkidle0" });
    await fill("input[type=email]", uE);
    await submit();
    await page.waitForSelector('[data-testid="reset-request-done"] [role=status]', { timeout: 10000 });
    const realText = await txt('[data-testid="reset-request-done"] [role=status]');
    ok(!!realText && realText === ghostText, "форма сброса: один и тот же ответ на существующий и несуществующий адрес", [realText, ghostText]);
    const rl = await waitLetter(uE, "reset-password");
    ok(!!rl && rl.link.startsWith(`${UI}/reset-password/`), "письмо сброса в выводе сервера, ссылка на клиент");

    // переход по ссылке → новый пароль
    await page.goto(rl.link, { waitUntil: "networkidle0" });
    await page.waitForSelector('[data-testid="reset-confirm-form"]', { timeout: 10000 });
    await page.$$eval('[data-testid="reset-confirm-form"] input', (els) => els.forEach((e) => e.removeAttribute("required")));
    const pw = '[data-testid="reset-confirm-form"] input[type=password]';
    const fillBoth = async (a, b) => {
      await page.$$eval(pw, (els, vals) => els.forEach((el, i) => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        set.call(el, vals[i]); el.dispatchEvent(new Event("input", { bubbles: true }));
      }), [a, b]);
    };
    await fillBoth("password-new", "password-xxx");
    await submit();
    await page.waitForFunction(() => /не совпадают/i.test(document.querySelector('[data-testid="reset-confirm-form"]').textContent), { timeout: 10000 });
    ok(true, "несовпадающие пароли — ошибка у поля, запрос не ушёл");
    await fillBoth("short", "short");
    await submit();
    await page.waitForFunction(() => /минимальная длина пароля/i.test(document.querySelector('[data-testid="reset-confirm-form"]').textContent), { timeout: 10000 });
    ok(true, "короткий пароль — текст сервера у поля (details.newPassword)");
    await fillBoth("password-new", "password-new");
    await submit();
    await waitPath("/login");
    await page.waitForSelector('[data-testid="login-notice"]', { timeout: 10000 });
    ok(/сессии завершены/i.test(await txt('[data-testid="login-notice"]')), "после успеха — /login с пояснением о завершённых сессиях");

    // вход: старым — отказ, новым — каталог
    await fill("input[type=email]", uE);
    await fill("input[type=password]", "password-one");
    await submit();
    await page.waitForSelector("form [role=alert]", { timeout: 10000 });
    ok(/неверный email или пароль/i.test(await txt("form [role=alert]")), "вход старым паролем — отказ");
    await fill("input[type=password]", "password-new");
    await submit();
    await waitPath("/catalog");
    ok(true, "вход новым паролем — каталог");
    await sleep(400);
    ok(!(await has('[data-testid="unverified-banner"]')), "полосы у подтверждённого нет");

    // использованная ссылка сброса в браузере
    await page.goto(rl.link, { waitUntil: "networkidle0" });
    await fillBoth("password-zzz", "password-zzz");
    await page.$$eval('[data-testid="reset-confirm-form"] input', (els) => els.forEach((e) => e.removeAttribute("required")));
    await submit();
    await page.waitForSelector('[data-testid="reset-confirm-error"]', { timeout: 10000 });
    ok(/недействительна/i.test(await txt('[data-testid="reset-confirm-error"]')) && (await has('[data-testid="reset-confirm-error"] a[href="/reset-password"]')), "использованная ссылка: отказ + «Запросить новую ссылку»");
    ok(pageErrors.length === 0, "исключений страницы нет", pageErrors.slice(0, 3));
    await browser.close(); browser = null;
  }

  /* ── R7: фаза B — тот же сервер в режиме smtp против мока ── */
  head("R7. Два рода отказа (мок SMTP)");
  {
    const graceful = await stopServer();
    ok(graceful === true, "сервер фазы A остановился по SIGTERM сам (работник не держит процесс)");
    await sql`delete from mail_outbox where status = 'pending'`;
    smtp = await startSmtpMock();
    await startServer({ MAIL_TRANSPORT: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(SMTP_PORT), SMTP_SECURE: "false", MAIL_FROM: "PhiloSynth <no-reply@t91.test>", MAIL_RETRY_DELAYS: RETRY_DELAYS });
    ok(/транспорт 'smtp'/.test(serverLog), "сервер поднят в режиме smtp");
    const uOk = mail("fine"), uPerm = mail("perm550"), uTemp = mail("temp451");
    for (const u of [uOk, uPerm, uTemp]) ok((await register(u)).status === 201, `регистрация ${u.split("-")[0]} → 201 (ответ от почты не зависит)`);

    const okRows = await waitOutbox(uOk, (rs) => rs[0]?.status === "sent");
    ok(okRows[0]?.status === "sent" && okRows[0].attempts === 1, "250 → 'sent' с первой попытки", okRows[0]?.status);
    const got = smtp.state.delivered.find((d) => d.to === uOk);
    ok(!!got && /Subject:/i.test(got.body) && /multipart\/alternative/i.test(got.body) && /text\/plain/i.test(got.body) && /text\/html/i.test(got.body), "узел получил письмо: текст + HTML (multipart/alternative)");
    ok(/From: PhiloSynth <no-reply@t91\.test>/i.test(got?.body ?? ""), "отправитель — MAIL_FROM");
    ok(!/List-Unsubscribe/i.test(got?.body ?? ""), "заголовка List-Unsubscribe нет (письмо операционное)");
    ok(!/mail:console/.test(serverLog), "в режиме smtp письма в вывод не печатаются");

    const permRows = await waitOutbox(uPerm, (rs) => rs[0]?.status === "failed");
    ok(permRows[0]?.status === "failed", "550 → 'failed'", permRows[0]?.status);
    ok(/550/.test(permRows[0]?.last_error ?? "") && /No such user/.test(permRows[0]?.last_error ?? ""), "last_error несёт последнюю ошибку узла", permRows[0]?.last_error);
    ok(permRows[0]?.attempts === 1, "attempts=1");

    // 451: следим за ростом attempts и сдвигом next_attempt_at
    const seen = new Map();
    const t0 = Date.now();
    for (;;) {
      const [row] = await outboxOf(uTemp);
      if (row && !seen.has(row.attempts)) seen.set(row.attempts, { status: row.status, next: new Date(row.next_attempt_at).getTime(), err: row.last_error });
      if (row?.status === "failed" || Date.now() - t0 > 25000) break;
      await sleep(40);
    }
    const [tempRow] = await outboxOf(uTemp);
    const attemptsSeen = [...seen.keys()].sort((a, b) => a - b);
    ok(attemptsSeen.filter((a) => a >= 1 && a <= 5).length >= 4, "451 → attempts растёт по единице", attemptsSeen);
    const pend = attemptsSeen.filter((a) => a >= 1 && a <= 5).map((a) => seen.get(a));
    ok(pend.every((p) => p.status === "pending" && /451/.test(p.err ?? "")), "между попытками письмо 'pending' с last_error 451");
    ok(pend.every((p, i) => i === 0 || p.next > pend[i - 1].next), "next_attempt_at сдвигается вперёд с каждой попыткой", pend.map((p) => p.next - t0));
    ok(tempRow.status === "failed" && tempRow.attempts === 6, "после ШЕСТОЙ попытки → 'failed'", [tempRow.status, tempRow.attempts]);
    ok(/451/.test(tempRow.last_error ?? "") && /try again later/.test(tempRow.last_error ?? ""), "last_error — последняя ошибка 451");
    await sleep(1500);
    const rcptTemp = smtp.state.rcpt.filter((a) => a === uTemp).length;
    const rcptPerm = smtp.state.rcpt.filter((a) => a === uPerm).length;
    ok(rcptTemp === 6, "узел видел ровно 6 попыток для 451", rcptTemp);
    ok(rcptPerm === 1, "…и ровно 1 для 550: повторов НЕТ", rcptPerm);
    const [p2] = await outboxOf(uPerm);
    ok(p2.attempts === 1 && p2.status === "failed", "спустя время строка 550 не тронута");
    const pendingLeft = await sql`select count(*)::int as c from mail_outbox where status = 'pending'`;
    ok(pendingLeft[0].c === 0, "в очереди не осталось мёртвых 'pending' (счётчик отставания чист)", pendingLeft[0].c);

    // узел недоступен — временный отказ, а не потеря
    await new Promise((r) => smtp.server.close(r)); smtp = null;
    const uDown = mail("down");
    await register(uDown);
    const downRows = await waitOutbox(uDown, (rs) => (rs[0]?.attempts ?? 0) >= 1, 20000);
    ok(downRows[0]?.status !== "sent" && downRows[0]?.attempts >= 1 && !!downRows[0]?.last_error, "узел недоступен → временный отказ: письмо ждёт, ошибка записана", [downRows[0]?.status, downRows[0]?.last_error]);
  }

  exitCode = failed ? 1 : 0;
} catch (err) {
  failed++;
  console.error("\nСЦЕНАРИЙ УПАЛ:", err?.stack ?? err);
  console.error("── хвост лога сервера ──\n" + serverLog.slice(-1500));
} finally {
  console.log(`\nИТОГ: ${n - failed} ✓ / ${failed} ✗ из ${n}`);
  try { if (browser) await Promise.race([browser.close(), sleep(3000)]); } catch {}
  try { smtp?.server.close(); } catch {}
  killGroup(serverProc); killGroup(viteProc);
  try { if (sql) await Promise.race([sql.end({ timeout: 2 }), sleep(3000)]); } catch {}
  process.exit(failed ? 1 : exitCode);
}
