/**
 * Правки 2026-11-25 (тарифная сетка) — пробный подарок на баланс.
 *
 * Живой сервер (child tsx index.ts) + живые PG/Redis; Claude не нужен.
 *   T1 регистрация без подтверждения — подарка нет, баланс 0
 *   T2 подтверждение почты по ссылке из mail_outbox — +TRIAL_BALANCE_USD,
 *      строка transactions 'bonus' с balance_after
 *   T3 повторное подтверждение (новая ссылка) и сброс пароля — второго
 *      подарка нет (uq_transactions_trial)
 *   T4 GET /billing/plans несёт credits.trialBalanceUsd; /billing/view —
 *      режим 'balance' (подарок тратится как обычный баланс)
 *   T5 подтверждение через сброс пароля (адрес не подтверждали) — подарок
 *      тоже один
 *   T6 удаление учётной записи и новая регистрация на ТОТ ЖЕ адрес —
 *      подарка нет (trial_grants помнит адрес, миграция 0024)
 *   T7 адрес с меткой «+…» того же ящика — подарка нет
 *   T8 подарок, выданный до 0024 (в trial_grants адреса нет): удаление
 *      учётной записи записывает адрес, новая регистрация подарка не даёт
 *
 * Запуск: node --import tsx tests/test-trial-bonus.mjs (PG+Redis подняты)
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";

const SERVER_PORT = 3128;
const BASE = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const DB_URL = process.env.DATABASE_URL ?? "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";
const TRIAL = 6;

let passed = 0;
let failed = 0;
const fails = [];
function ok(cond, name, detail) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    fails.push(name);
    console.log(`  ✗ ${name}${detail === undefined ? "" : " — " + JSON.stringify(detail)}`);
  }
}

let serverProc;
let serverLog = "";
async function startServer() {
  serverProc = spawn("npx", ["tsx", "index.ts"], {
    cwd: new URL("../server/", import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      DATABASE_URL: DB_URL,
      REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
      MAIL_TRANSPORT: "console",
      TRIAL_BALANCE_USD: String(TRIAL),
      RATE_LIMIT_HTTP_PER_MINUTE: "100000",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  serverProc.stdout.on("data", (d) => (serverLog += d));
  serverProc.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch { /* поднимается */ }
    await sleep(300);
  }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-2000));
}

const sql = postgres(DB_URL, { max: 2, onnotice: () => {} });
const userIds = [];

async function post(path, body, cookie) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
}
async function get(path, cookie) {
  const r = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
  return { status: r.status, body: await r.json().catch(() => null) };
}

/** Последняя ссылка письма с доводом purpose ('verify' | 'reset') */
async function lastToken(email, re) {
  for (let i = 0; i < 20; i++) {
    const rows = await sql`select body_text from mail_outbox where to_email=${email} order by created_at desc`;
    for (const r of rows) {
      const m = r.body_text.match(re);
      if (m) return decodeURIComponent(m[1]);
    }
    await sleep(150);
  }
  return null;
}
// Ссылки — TOKEN_LINK_PATH (auth-tokens): /verify-email/<довод>, /reset-password/<довод>
const VERIFY_RE = /\/verify-email\/([A-Za-z0-9_%-]+)/;
const RESET_RE = /\/reset-password\/([A-Za-z0-9_%-]+)/;

async function register(tag, emailOverride) {
  const email = emailOverride ?? `ttb-${tag}-${Date.now()}@test.local`;
  const password = "Passw0rd!123";
  const reg = await post("/auth/register", { email, password });
  if (reg.status !== 201 && reg.status !== 200) throw new Error("register: " + JSON.stringify(reg.body));
  const login = await post("/auth/login", { email, password });
  const m = (login.headers.get("set-cookie") ?? "").match(/philosynth_session=([^;]+)/);
  if (!m) throw new Error("нет session-cookie");
  const [u] = await sql`select id from users where email=${email}`;
  userIds.push(u.id);
  return { email, password, id: u.id, cookie: `philosynth_session=${m[1]}` };
}
const balanceOf = async (id) => Number((await sql`select balance_usd from users where id=${id}`)[0].balance_usd);
/** Регистрация + подтверждение почты по ссылке из письма. */
async function registerVerified(tag, emailOverride) {
  const u = await register(tag, emailOverride);
  const tok = await lastToken(u.email, VERIFY_RE);
  const conf = await post("/auth/email/verify/confirm", { token: tok });
  if (conf.status !== 200) throw new Error(`verify ${tag}: ` + JSON.stringify(conf.body));
  return u;
}
async function deleteMe(u) {
  const r = await fetch(`${BASE}/auth/me`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie: u.cookie },
    body: JSON.stringify({ password: u.password }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const STARTED = new Date();
const bonusesOf = (id) => sql`select amount_usd::float8 as amount, balance_after::float8 as after from transactions where user_id=${id} and type='bonus'`;

async function main() {
  await startServer();

  console.log("── T1–T3: подтверждение почты ──");
  const A = await register("a");
  ok((await balanceOf(A.id)) === 0 && (await bonusesOf(A.id)).length === 0, "T1 до подтверждения подарка нет, баланс 0");
  const t1 = await lastToken(A.email, VERIFY_RE);
  ok(!!t1, "письмо подтверждения со ссылкой в mail_outbox");
  const conf = await post("/auth/email/verify/confirm", { token: t1 });
  ok(conf.status === 200, "подтверждение принято", conf.body);
  const bA = await bonusesOf(A.id);
  ok((await balanceOf(A.id)) === TRIAL && bA.length === 1 && bA[0].amount === TRIAL && bA[0].after === TRIAL, `T2 +$${TRIAL}, строка bonus с balance_after`, bA);
  const tx = await get("/billing/transactions", A.cookie);
  ok(tx.status === 200 && tx.body.items.some((t) => t.type === "bonus" && t.amountUsd === TRIAL), "GET /billing/transactions показывает bonus", tx.body);

  // Сброс пароля тоже «подтверждает» адрес — второго подарка нет
  await sql`delete from mail_outbox where to_email=${A.email}`;
  const rq = await post("/auth/password-reset/request", { email: A.email });
  ok(rq.status === 200, "запрос сброса пароля", rq.body);
  const rt = await lastToken(A.email, RESET_RE);
  const rc = await post("/auth/password-reset/confirm", { token: rt, newPassword: "Passw0rd!456" });
  ok(rc.status === 200, "сброс пароля принят", rc.body);
  ok((await balanceOf(A.id)) === TRIAL && (await bonusesOf(A.id)).length === 1, "T3 после сброса пароля подарок не повторился");

  console.log("── T4: витрина и режим оплаты ──");
  const plans = await get("/billing/plans");
  ok(plans.status === 200 && plans.body.credits?.trialBalanceUsd === TRIAL, "GET /billing/plans: credits.trialBalanceUsd", plans.body.credits);
  const relog = await post("/auth/login", { email: A.email, password: "Passw0rd!456" });
  const cookieA = `philosynth_session=${(relog.headers.get("set-cookie") ?? "").match(/philosynth_session=([^;]+)/)?.[1]}`;
  const view = await get("/billing/view", cookieA);
  ok(view.status === 200 && view.body.mode === "balance", "GET /billing/view: режим 'balance'", view.body);

  console.log("── T5: первое подтверждение — сбросом пароля ──");
  const B = await register("b");
  await sql`delete from mail_outbox where to_email=${B.email}`;
  await post("/auth/password-reset/request", { email: B.email });
  const rtB = await lastToken(B.email, RESET_RE);
  const rcB = await post("/auth/password-reset/confirm", { token: rtB, newPassword: "Passw0rd!456" });
  ok(rcB.status === 200 && (await balanceOf(B.id)) === TRIAL && (await bonusesOf(B.id)).length === 1, "T5 сброс пароля неподтверждённого — подарок один", rcB.body);
  // Параллельные начисления упираются в индекс: прямой INSERT второго bonus — 23505
  let dup = null;
  try {
    await sql`insert into transactions (user_id, type, amount_usd, balance_after) values (${B.id}, 'bonus', 6, 0)`;
  } catch (e) { dup = e.code; }
  ok(dup === "23505", "uq_transactions_trial не пускает второй bonus", dup);

  console.log("── T6–T8: один подарок на адрес ──");
  const C = await registerVerified("c");
  ok((await balanceOf(C.id)) === TRIAL, "T6 первая учётная запись адреса подарок получила");
  const delC = await deleteMe(C);
  const [goneC] = await sql`select email from users where id=${C.id}`;
  ok(delC.status === 200 && goneC.email !== C.email, "T6 учётная запись удалена, адрес освобождён", { delC, goneC });
  const C2 = await registerVerified("c2", C.email);
  ok(C2.id !== C.id && (await balanceOf(C2.id)) === 0 && (await bonusesOf(C2.id)).length === 0, "T6 новая регистрация на тот же адрес — подарка нет", await bonusesOf(C2.id));
  const [verC2] = await sql`select email_verified_at is not null as v from users where id=${C2.id}`;
  ok(verC2.v === true, "T6 само подтверждение адреса при этом принято");

  const D = await registerVerified("d");
  const plusEmail = D.email.replace("@", "+second@");
  const D2 = await registerVerified("d2", plusEmail);
  ok((await balanceOf(D.id)) === TRIAL && (await balanceOf(D2.id)) === 0 && (await bonusesOf(D2.id)).length === 0, "T7 тот же ящик с меткой «+…» — подарка нет", { plusEmail });
  const E = await registerVerified("e", `ttb-e+tag-${Date.now()}@test.local`);
  ok((await balanceOf(E.id)) === TRIAL, "T7 адрес с меткой, чей ящик подарка не получал, — подарок есть");

  const F = await registerVerified("f");
  const before = (await sql`select count(*)::int as n from trial_grants`)[0].n;
  await sql`delete from trial_grants where created_at = (select max(created_at) from trial_grants)`;
  ok((await sql`select count(*)::int as n from trial_grants`)[0].n === before - 1, "T8 подготовка: адрес F убран из trial_grants (подарок «до 0024»)");
  const delF = await deleteMe(F);
  ok(delF.status === 200 && (await sql`select count(*)::int as n from trial_grants`)[0].n === before, "T8 удаление учётной записи записало адрес в trial_grants", delF);
  const F2 = await registerVerified("f2", F.email);
  ok((await balanceOf(F2.id)) === 0, "T8 новая регистрация на адрес — подарка нет");
  const raw = await sql`select count(*)::int as n from trial_grants where email_hash like '%@%'`;
  ok(raw[0].n === 0, "в trial_grants нет адресов в открытом виде");
}

try {
  await main();
} catch (e) {
  failed++;
  fails.push("исключение: " + (e?.message ?? e));
  console.log("  ✗ исключение:", e);
} finally {
  for (const id of userIds) {
    await sql`delete from mail_outbox where to_email in (select email from users where id=${id})`;
    await sql`delete from transactions where user_id=${id}`;
    await sql`delete from users where id=${id}`.catch(() => {});
  }
  await sql`delete from trial_grants where created_at >= ${STARTED}`.catch(() => {});
  await sql.end({ timeout: 2 }).catch(() => {});
  // npx порождает tsx дочерним — гасим группой, иначе процесс теста висит
  try { process.kill(-serverProc.pid, "SIGKILL"); } catch { serverProc?.kill("SIGKILL"); }
}
console.log(`ИТОГ: ${passed} ✓ / ${failed} ✗`);
if (failed) console.log("  провалы: " + fails.join(" | "));
process.exit(failed ? 1 : 0);
