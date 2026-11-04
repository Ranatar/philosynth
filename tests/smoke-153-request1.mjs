/**
 * smoke-153-request1 — первый запрос беседы 15.3 (снятие ограничений почты:
 * Д-72 чистка/время ответа/вкладка «Почта», Д-73 смена адреса). Живая БД в
 * процессе (PG16 + Redis), сервер и браузер не нужны — браузерные проверки
 * (форма в профиле, страница /change-email/:token, вкладка «Почта») —
 * тестовые запросы 2–4 беседы.
 *
 *   A. Чистые функции и исходники: maintenanceDue (интервал от прошлого
 *      прохода), два письма 15.3 (ссылка только в первом, экранирование,
 *      новый адрес назван, по-немецки под runWithLocale), TTL/путь довода
 *      email_change, holостой хэш и withMinResponse в auth.ts, worker зовёт
 *      чистку, схема/миграция 0015, env и .env.example, клиент (ChangeEmailPage,
 *      форма профиля, маршрут App, вкладка «Почта» без тел), CSS-блок без hex.
 *   B. Живая БД: runMaintenance на фикстурах; медианы входа (несуществующий
 *      адрес ≈ неверный пароль); форма сброса — один ответ и ≥ минимума;
 *      смена адреса end-to-end (401/400/200; занятый — без письма; письмо на
 *      новый по языку получателя; довод с new_email; confirm без сессии →
 *      адрес сменён и подтверждён, сброс погашен, уведомление на старый без
 *      ссылок, сессии живы; повтор → TOKEN_INVALID; занятый к подтверждению →
 *      TOKEN_INVALID, адрес не сменён); /auth/mail-outbox (403/200, без тел).
 *
 * Запуск из корня:  node_modules/.bin/tsx tests/smoke-153-request1.mjs
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { Hono } from "hono";

const ROOT = new URL("../", import.meta.url).pathname;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
process.env.DATABASE_URL = DB_URL;
const sql = postgres(DB_URL, { onnotice: () => {} });
const J = (o) => JSON.stringify(o);
let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra !== undefined ? " — " + (typeof extra === "string" ? extra : J(extra)).slice(0, 900) : ""}`); }
}
const TAG = "s153-" + Math.random().toString(36).slice(2, 8);
const rd = (rel) => readFileSync(ROOT + rel, "utf8");
const strip = (src) => src.replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

/* ── Модули в процессе ───────────────────────────────────────────────── */
const LOC = await import("../server/i18n/locale.ts");
LOC.installServerCatalogProvider();
const MT = await import("../server/services/mail/maintenance.ts");
const OB = await import("../server/services/mail/outbox.ts");
const TPL = await import("../server/services/mail/templates.ts");
const AT = await import("../server/services/auth-tokens.ts");
const { env } = await import("../server/env.ts");
const { authRoutes } = await import("../server/routes/auth.ts");
const { hashPassword } = await import("../server/middleware/auth.ts");
const { closeDb } = await import("../server/db/index.ts");
const { closeRedis, redis } = await import("../server/redis.ts");
// лимитер почты (13.2) — 10 запросов в час на identity «ip:unknown» у app.request: окно чистим,
// иначе сторож того же часа оставит смоуку 429
try { if (redis.status === "wait") await redis.connect(); const ks = await redis.keys("rate_limit:mail:*"); if (ks.length) await redis.del(...ks); } catch { /* fail-open */ }

const app = new Hono().route("/auth", authRoutes);
const cookieOf = (r) => (r.headers.get("set-cookie") ?? "").match(/philosynth_session=[^;]+/)?.[0] ?? null;
const post = (path, body, cookie) => app.request(path, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: J(body) });
const get = (path, cookie) => app.request(path, { headers: cookie ? { cookie } : {} });
const PW = "s153-password";
const userIds = [];

try {
  /* ══ A. Чистые функции и исходники ══════════════════════════════════ */
  console.log("A. Чистые функции и исходники");
  ok(MT.maintenanceDue(0, 1000, 3_600_000) === false && MT.maintenanceDue(0, 3_600_000, 3_600_000) === true && MT.maintenanceDue(5000, 7000, 1000) === true && MT.maintenanceDue(5000, 5500, 1000) === false, "A1 maintenanceDue — интервал считается от прошлого прохода");
  ok(env.mail.maintenanceIntervalMs > env.mail.workerIntervalMs && env.mail.retentionDays > 0 && env.auth.tokenRetentionDays > 0 && env.auth.minResponseMs >= 0, "A2 env: чистка реже цикла работника, сроки хранения и минимум времени ответа заданы", { m: env.mail.maintenanceIntervalMs, w: env.mail.workerIntervalMs });
  const ch = TPL.emailChangeLetter({ displayName: "Иван <b>", link: "https://x/change-email/t0k", ttlHours: 1, newEmail: "new@x" });
  ok(ch.text.includes("https://x/change-email/t0k") && ch.html.includes("Иван &lt;b&gt;") && ch.text.includes("new@x") && /1 час/.test(ch.text), "A3 письмо смены — ссылка, экранирование, новый адрес, «1 час»");
  const nt = TPL.emailChangedNoticeLetter({ displayName: null, newEmail: "new@x" });
  ok(!/https?:\/\//.test(nt.text) && !/<a /.test(nt.html) && nt.text.includes("new@x") && /изменён/.test(nt.subject), "A4 уведомление на прежний адрес — без ссылок, новый адрес назван");
  const de = LOC.runWithLocale("de", () => TPL.emailChangedNoticeLetter({ newEmail: "n@x" }));
  ok(/Adresse des Kontos geändert/.test(de.subject) && /lang="de"/.test(de.html), "A5 письмо собирается под языком получателя (de)", de.subject);
  ok(!/отпис|unsubscribe|<img|<script|url\(/i.test(ch.html + nt.html), "A6 письма 15.3 — без отписки и внешних ресурсов");
  ok(AT.TOKEN_TTL_HOURS.email_change === 1 && AT.TOKEN_LINK_PATH.email_change === "/change-email/" && AT.TOKEN_TTL_HOURS.email_verify === 72 && AT.TOKEN_TTL_HOURS.password_reset === 1, "A7 TTL/путь довода email_change (прежние не тронуты)");
  const ra = strip(rd("server/routes/auth.ts"));
  ok(/DUMMY_PASSWORD_HASH/.test(ra.slice(ra.indexOf('"/login"'), ra.indexOf('"/logout"'))) && /withMinResponse\(/.test(ra.slice(ra.indexOf('"/password-reset/request"'), ra.indexOf('"/password-reset/confirm"'))) && (ra.match(/code: "TOKEN_INVALID"/g) ?? []).length === 1 && ra.includes('authRoutes.get("/mail-outbox", requireAuth, requireAdmin,'), "A8 auth.ts: холостой bcrypt во входе, минимум времени у формы сброса, TOKEN_INVALID одним местом, вкладка под requireAdmin");
  const wk = strip(rd("server/services/mail/worker.ts"));
  ok(/await maybeMaintain\(\);/.test(wk) && /maintenanceDue\(maintenanceRanAt, now\)/.test(wk) && /catch \(err\)/.test(wk.slice(wk.indexOf("async function maybeMaintain"))) && !/templates|nodemailer/.test(wk), "A9 worker зовёт чистку на тике, под своим try-catch, о шаблонах не знает");
  const sch = strip(rd("server/db/schema.ts"));
  const journal = JSON.parse(rd("server/db/migrations/meta/_journal.json"));
  const mig = rd("server/db/migrations/0015_email_change.sql");
  ok(/"email_change"/.test(sch) && /new_email/.test(sch) && journal.entries[15]?.tag === "0015_email_change" && /DROP CONSTRAINT "auth_tokens_purpose_check"/.test(mig) && /ADD COLUMN "new_email" text/.test(mig) && /'email_change'/.test(mig), "A10 схема и миграция 0015: email_change в enum/CHECK, new_email");
  const envEx = rd(".env.example"), dot = rd("scripts/checks/check-dotfiles.mjs");
  ok(["MAIL_RETENTION_DAYS", "AUTH_TOKEN_RETENTION_DAYS", "MAINTENANCE_INTERVAL_MS", "AUTH_MIN_RESPONSE_MS"].every((v) => new RegExp(`^${v}=`, "m").test(envEx) && dot.includes(v)), "A11 .env.example и check-dotfiles знают четыре переменные 15.3");
  const cep = strip(rd("client/src/pages/ChangeEmailPage.tsx")), pp = strip(rd("client/src/pages/ProfilePage.tsx")), appSrc = strip(rd("client/src/App.tsx")), ap = strip(rd("client/src/pages/AdminPromptsPage.tsx"));
  ok(/started\.current = true/.test(cep) && /confirmEmailChange\(token\)/.test(cep) && /data-testid="email-change-form"/.test(pp) && /requestEmailChange\(/.test(pp) && appSrc.includes('path="/change-email/:token"'), "A12 клиент: страница подтверждения с ref-заслоном, форма в профиле, маршрут App");
  ok(/function MailTab\(\)/.test(ap) && /data-testid="tab-mail"/.test(ap) && !/bodyText|bodyHtml/.test(ap) && !/apiPost|retryMail|resendMail|onClick=\{[^}]*(retry|resend)/i.test(ap.slice(ap.indexOf("function MailTab"), ap.indexOf("function MailTab") + 4000)), "A13 вкладка «Почта»: без тел и без повтора");
  const CSS = rd("client/src/globals.css"), b0 = CSS.indexOf("Беседа 15.3 — почта"), blk = CSS.slice(b0, CSS.indexOf("@media (max-width: 600px)", b0));
  ok(b0 > 0 && /\.stat-value\.mail-stat-alert/.test(blk) && /\.mail-error/.test(blk) && !/#[0-9a-fA-F]{3,8}\b|border-radius|box-shadow/.test(blk), "A14 CSS-блок 15.3 — из переменных набора, без hex/скруглений/теней");
  const STR = JSON.parse(rd("packages/shared/i18n/strings.json")).strings;
  ok(["server.routes.auth.emailChangeRequested", "server.mail.templates.changeSubject", "server.mail.templates.changedSubject", "profilePage.changeEmailTitle", "changeEmailPage.changedOpening", "adminPromptsPage.tabMail"].every((k) => STR[k]?.en && STR[k]?.de), "A15 ключи 15.3 в описи с en/de");

  /* ══ B. Живая БД ════════════════════════════════════════════════════ */
  console.log("B. Живая БД");
  const mk = async (email, extra = {}) => { const [u] = await sql`insert into users (email, password_hash, role, ui_locale) values (${email}, ${extra.hash ?? "x"}, ${extra.role ?? "user"}, ${extra.locale ?? "ru"}) returning id`; userIds.push(u.id); return u.id; };
  const hash = await hashPassword(PW);
  const uid = await mk(`${TAG}@s.local`, { hash, locale: "de" });
  const busy = await mk(`${TAG}-busy@s.local`);
  const adm = await mk(`${TAG}-admin@s.local`, { hash, role: "admin" });
  const day = 86_400_000, old = new Date(Date.now() - 40 * day), fresh = new Date(Date.now() - 2 * day);
  // B1 чистка
  await sql`insert into mail_outbox (to_email, subject, body_text, body_html, status, sent_at, next_attempt_at, created_at) values
    (${TAG + "-a@x"}, 'old-sent', '', '', 'sent', ${old}, ${old}, ${old}),
    (${TAG + "-b@x"}, 'old-failed', '', '', 'failed', null, ${old}, ${old}),
    (${TAG + "-c@x"}, 'fresh-sent', '', '', 'sent', ${fresh}, ${fresh}, ${fresh}),
    (${TAG + "-d@x"}, 'old-pending', 't', 'h', 'pending', null, ${old}, ${old})`;
  await sql`insert into auth_tokens (user_id, purpose, token_hash, expires_at, used_at) values
    (${uid}, 'email_verify', ${AT.hashAuthToken(TAG + "1")}, ${new Date(old.getTime() + day)}, ${old}),
    (${uid}, 'password_reset', ${AT.hashAuthToken(TAG + "2")}, ${old}, null),
    (${uid}, 'email_verify', ${AT.hashAuthToken(TAG + "3")}, ${new Date(fresh.getTime() + day)}, ${fresh}),
    (${uid}, 'email_verify', ${AT.hashAuthToken(TAG + "4")}, ${new Date(Date.now() + day)}, null)`;
  await sql`insert into sessions (id, user_id, expires_at) values (${AT.hashAuthToken(TAG + "s1")}, ${uid}, ${old}), (${AT.hashAuthToken(TAG + "s2")}, ${uid}, ${new Date(Date.now() + day)})`;
  const m = await MT.runMaintenance({ mailRetentionDays: 30, tokenRetentionDays: 30 });
  const leftMail = (await sql`select subject from mail_outbox where to_email like ${TAG + "-%@x"} order by subject`).map((r) => r.subject);
  const leftTok = (await sql`select count(*)::int as n from auth_tokens where user_id=${uid}`)[0].n;
  const leftSess = await sql`select id from sessions where user_id=${uid}`;
  ok(J(leftMail) === J(["fresh-sent", "old-pending"]) && leftTok === 2 && leftSess.length === 1 && leftSess[0].id === AT.hashAuthToken(TAG + "s2") && m.mailDeleted >= 2 && m.tokensDeleted >= 2 && m.sessionsDeleted >= 1, "B1 runMaintenance: старые sent/failed и доводы ушли, свежие/pending/живые остались, истёкшая сессия снята", { leftMail, leftTok, m });
  // B2 вход: медианы
  const median = async (fn, n = 7) => { const t = []; for (let i = 0; i < n; i++) { const s0 = performance.now(); await fn(); t.push(performance.now() - s0); } return t.sort((a, b) => a - b)[Math.floor(n / 2)]; };
  const tMissing = await median(() => post("/auth/login", { email: `${TAG}-nobody@s.local`, password: PW }));
  const tWrong = await median(() => post("/auth/login", { email: `${TAG}@s.local`, password: "wrong" }));
  ok(tMissing >= tWrong * 0.5, `B2 вход: несуществующий адрес ${tMissing.toFixed(0)} мс ≈ неверный пароль ${tWrong.toFixed(0)} мс (медианы 7)`);
  // B3 форма сброса
  const minMs = env.auth.minResponseMs;
  const t0 = performance.now(); const rNo = await post("/auth/password-reset/request", { email: `${TAG}-nobody@s.local` }); const dNo = performance.now() - t0;
  const t1 = performance.now(); const rYes = await post("/auth/password-reset/request", { email: `${TAG}@s.local` }); const dYes = performance.now() - t1;
  ok(rNo.status === 200 && rYes.status === 200 && J(await rNo.json()) === J(await rYes.json()) && dNo >= minMs - 5 && dYes >= minMs - 5, `B3 форма сброса: один ответ, ≥ ${minMs} мс (${dNo.toFixed(0)} / ${dYes.toFixed(0)})`);
  // B4 смена адреса
  const c = cookieOf(await post("/auth/login", { email: `${TAG}@s.local`, password: PW }));
  ok(!!c, "B4a вход дал cookie");
  ok((await post("/auth/email/change/request", { newEmail: `${TAG}-new@s.local`, password: "wrong" }, c)).status === 401, "B4b неверный пароль → 401");
  ok((await post("/auth/email/change/request", { newEmail: `${TAG}@s.local`, password: PW }, c)).status === 400, "B4c текущий адрес → 400");
  ok((await post("/auth/email/change/request", { newEmail: `${TAG}-new@s.local`, password: PW })).status === 401, "B4d без сессии → 401");
  const rBusy = await post("/auth/email/change/request", { newEmail: `${TAG}-busy@s.local`, password: PW }, c);
  const rFree = await post("/auth/email/change/request", { newEmail: `${TAG}-new@s.local`, password: PW }, c);
  const busyMail = (await sql`select count(*)::int as n from mail_outbox where to_email=${TAG + "-busy@s.local"}`)[0].n;
  ok(rBusy.status === 200 && rFree.status === 200 && J(await rBusy.json()) === J(await rFree.json()) && busyMail === 0, "B4e занятый и свободный адрес — один ответ; на занятый письма нет");
  const [letter] = await sql`select subject, body_text, body_html from mail_outbox where to_email=${TAG + "-new@s.local"}`;
  ok(letter && /Bestätigung der neuen Adresse/.test(letter.subject) && letter.body_text.includes("/change-email/"), "B4f письмо на новый адрес — по-немецки, со ссылкой /change-email/", letter?.subject);
  const [tokRow] = await sql`select new_email, used_at from auth_tokens where user_id=${uid} and purpose='email_change' and used_at is null`;
  ok(tokRow?.new_email === `${TAG}-new@s.local`, "B4g довод email_change несёт новый адрес в строке");
  const token = decodeURIComponent(letter?.body_text.match(/\/change-email\/([A-Za-z0-9_%-]+)/)?.[1] ?? "");
  await sql`insert into auth_tokens (user_id, purpose, token_hash, expires_at) values (${uid}, 'password_reset', ${AT.hashAuthToken(TAG + "pr")}, ${new Date(Date.now() + day)})`;
  const conf = await post("/auth/email/change/confirm", { token });
  const confJson = await conf.json();
  const [after] = await sql`select email, email_verified_at from users where id=${uid}`;
  const [pr] = await sql`select used_at from auth_tokens where token_hash=${AT.hashAuthToken(TAG + "pr")}`;
  ok(conf.status === 200 && confJson.email === `${TAG}-new@s.local` && after.email === `${TAG}-new@s.local` && after.email_verified_at && pr.used_at, "B4h confirm без сессии: адрес сменён и подтверждён, довод сброса погашен", confJson);
  const [notice] = await sql`select subject, body_text from mail_outbox where to_email=${TAG + "@s.local"} and subject like '%geändert%'`;
  ok(notice && !/change-email|reset-password|verify-email|https?:\/\//.test(notice.body_text) && notice.body_text.includes(`${TAG}-new@s.local`), "B4i уведомление на старый адрес — по-немецки, без ссылок, новый адрес назван");
  const again = await post("/auth/email/change/confirm", { token });
  ok(again.status === 400 && (await again.json()).code === "TOKEN_INVALID", "B4j повтор довода → TOKEN_INVALID");
  ok((await sql`select count(*)::int as n from sessions where user_id=${uid}`)[0].n >= 2, "B4k сессии не завершены (пароль не менялся)");
  ok((await get("/auth/me", c)).status === 200, "B4l старая сессия жива после смены адреса");
  await post("/auth/email/change/request", { newEmail: `${TAG}-late@s.local`, password: PW }, c);
  const [l2] = await sql`select body_text from mail_outbox where to_email=${TAG + "-late@s.local"}`;
  const tok2 = decodeURIComponent(l2?.body_text.match(/\/change-email\/([A-Za-z0-9_%-]+)/)?.[1] ?? "");
  await sql`update users set email=${TAG + "-late@s.local"} where id=${busy}`;
  const late = await post("/auth/email/change/confirm", { token: tok2 });
  const [still] = await sql`select email from users where id=${uid}`;
  const [burnt] = await sql`select used_at from auth_tokens where user_id=${uid} and purpose='email_change' order by created_at desc limit 1`;
  ok(late.status === 400 && (await late.json()).code === "TOKEN_INVALID" && still.email === `${TAG}-new@s.local` && burnt.used_at, "B4m занятый к моменту подтверждения → TOKEN_INVALID, адрес не сменён, довод сгорел");
  // B5 вкладка «Почта»
  ok((await get("/auth/mail-outbox", c)).status === 403 && (await get("/auth/mail-outbox")).status === 401, "B5a /auth/mail-outbox: 401 гостю, 403 пользователю");
  const ca = cookieOf(await post("/auth/login", { email: `${TAG}-admin@s.local`, password: PW }));
  const view = await (await get("/auth/mail-outbox?limit=3", ca)).json();
  const counts = await OB.getOutboxCounts();
  ok(["pending", "overdue", "sent", "failed"].every((k) => typeof view.counts?.[k] === "number" && typeof counts[k] === "number") && Array.isArray(view.rows) && view.rows.length === 3 && view.rows.every((r) => !("bodyText" in r) && !("bodyHtml" in r) && typeof r.toEmail === "string" && typeof r.status === "string"), "B5b админу: четыре счётчика, строки по лимиту, без тел", view.rows?.[0]);
  ok((await OB.listOutboxRows(2)).length === 2 && (await OB.listOutboxRows(0)).length >= 1, "B5c listOutboxRows — лимит, ноль → минимум 1");
} finally {
  await sql`delete from mail_outbox where to_email like ${TAG + "%"}`;
  if (userIds.length) await sql`delete from users where id in ${sql(userIds)}`;
  await sql.end();
  await closeDb();
  await closeRedis();
}
console.log(`\nИтог: ${passed} ✓, ${failed} ✗${failed ? "\n  " + fails.join("\n  ") : ""}`);
process.exit(failed ? 1 : 0);
