/**
 * Тестовые запросы 2–10 беседы 8.1 (администратор — заведение, передача,
 * след) — одним заходом, против ЖИВОГО сервера на ПУСТОЙ отдельной БД
 * philosynth_t81 (пересоздаётся; миграции 0000–0004 применяются
 * drizzle-kit), с живым PG16/Redis и браузерной частью (puppeteer-core +
 * Chrome). Мок Claude/Stripe не нужны — Claude здесь не зовётся, Stripe у
 * DELETE /auth/me fail-open (пустой STRIPE_SECRET_KEY).
 *  R2  bootstrap-admin на пустой базе: без BOOTSTRAP_ADMIN_PASSWORD →
 *      exit 1 и пустая users; с паролем → created, строка admin_audit
 *      user.bootstrapped (actor = сам, source bootstrap), вход по паролю →
 *      GET /auth/me role='admin'.
 *  R3  Идемпотентность: повтор с тем же email → skip, password_hash тот же,
 *      вход работает; на существующем 'user' (при отсутствии админов) →
 *      updated, пароль пользователя не переписан.
 *  R4  Заслон: админ есть → запуск с другим email → отказ (exit 1), users и
 *      admin_audit без изменений.
 *  R5  POST /auth/users/:id/role: админ повышает user → БД role='admin',
 *      admin_audit user.role.changed { from, to } (canonical); обычный
 *      пользователь → 403 FORBIDDEN.
 *  R6  LAST_ADMIN / SELF_ROLE_CHANGE: единственный админ понижает себя →
 *      409 SELF; второй понижает первого, оставшись один, понижает себя →
 *      409 SELF; DELETE /auth/me единственным → 409 LAST_ADMIN (строка не
 *      анонимизирована, подписки не тронуты); после назначения второго —
 *      понижение чужой роли и удаление аккаунта проходят.
 *  R7  След: активация версии шаблона в AdminPromptsPage → prompt.version.
 *      activated с actor_id активировавшего (не автора); PATCH/DELETE типа
 *      каталога → taxonomy.type.updated/deleted; config.version.*;
 *      details — через canonical().
 *  R8  Сохранность следа: админ со строками в журнале удаляет аккаунт (не
 *      последний) → строки на месте, actor_id = NULL, account.deleted.
 *  R9  Edge: role вне {user, admin} → 400 details.role; чужой/не-UUID id →
 *      404; GET /auth/users и /auth/audit без прав → 403.
 *  R10 Вкладка «Доступ» в браузере: поиск → переключение роли → confirm →
 *      список обновлён → журнал показывает новую строку; клики через
 *      el.click(), сверки регистронезависимые, статус после списка.
 * Запуск: node_modules/.bin/tsx tests/test-81-requests2-10.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { join } from "node:path";

import puppeteer from "puppeteer-core";
import postgres from "postgres";

const SERVER_PORT = 3000;
const VITE_PORT = 5199;
const API = `http://127.0.0.1:${SERVER_PORT}/api/v1`;
const UI = `http://127.0.0.1:${VITE_PORT}`;
const PG_BASE = "postgres://philosynth:philosynth_dev@localhost:5432";
const DB_NAME = "philosynth_t81";
const DB_URL = `${PG_BASE}/${DB_NAME}`;
const CHROME = process.env.CHROME_PATH ?? "/opt/google/chrome/chrome";
const ROOT = new URL("../", import.meta.url).pathname;
const TSX = join(ROOT, "node_modules/.bin/tsx");

process.env.DATABASE_URL = DB_URL;
process.env.REDIS_URL ??= "redis://localhost:6379";

let passed = 0, failed = 0;
const fails = [];
function ok(cond, name, extra = "") {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; fails.push(name); console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}
const J = (x) => JSON.stringify(x);
/** jsonb не хранит порядок ключей (09 §1, 0.3) — сравнивать канонически */
function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => J(k) + ":" + canonical(v[k])).join(",") + "}";
  return J(v);
}
const sameJson = (a, b) => canonical(a) === canonical(b);

/* ══ БД: пересоздание и миграции ══════════════════════════════════════ */
console.log(`── Подготовка: пустая БД ${DB_NAME}, миграции 0000–0004 ──`);
{
  const admin = postgres(`${PG_BASE}/postgres`, { max: 1 });
  await admin`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${DB_NAME} AND pid <> pg_backend_pid()`;
  await admin.unsafe(`DROP DATABASE IF EXISTS ${DB_NAME}`);
  await admin.unsafe(`CREATE DATABASE ${DB_NAME}`);
  await admin.end();
  const fresh = postgres(DB_URL, { max: 1 });
  await fresh`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
  await fresh.end();
  const mig = spawnSync("npx", ["drizzle-kit", "migrate"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, DATABASE_URL: DB_URL }, timeout: 120000 });
  ok(mig.status === 0 && /migrations applied successfully/.test(mig.stdout + mig.stderr), "drizzle-kit migrate 0000–0004 на пустой БД", (mig.stdout + mig.stderr).slice(-300));
}

const { db, closeDb } = await import("../server/db/index.js");
const schema = await import("../server/db/schema.js");
const { closeRedis } = await import("../server/redis.js");
const { and, desc, eq, sql } = await import("drizzle-orm");
const { users, adminAudit, promptTemplates, synthesisConfigs, categoryTypeCatalog, sessions } = schema;

const journal = await db.select().from(schema.adminAudit).limit(1);
ok(journal.length === 0, "admin_audit пуста на старте");
{
  const r = await db.execute(sql`select confdeltype from pg_constraint where conname = 'admin_audit_actor_id_users_id_fk'`);
  ok(r[0]?.confdeltype === "n", "FK admin_audit.actor_id → ON DELETE SET NULL (pg_constraint)", J(r));
}

/* ══ Процессы ═════════════════════════════════════════════════════════ */
let serverProc, viteProc, browser;
let serverLog = "", viteLog = "";
const SERVER_ENV = {
  PORT: String(SERVER_PORT), DATABASE_URL: DB_URL, REDIS_URL: "redis://localhost:6379",
  CLIENT_ORIGIN: UI, RATE_LIMIT_HTTP_PER_MINUTE: "100000",
  ANTHROPIC_API_KEY: "sk-ant-server-key-81", API_KEY_ENCRYPTION_SECRET: "test-encryption-secret-81",
  STRIPE_SECRET_KEY: "", BILLING_ENFORCE: "false",
};
async function startServer() {
  serverProc = spawn(process.execPath, ["--import", "tsx", "index.ts"], {
    cwd: join(ROOT, "server"), env: { ...process.env, ...SERVER_ENV }, stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  serverProc.stdout.on("data", (d) => (serverLog += d));
  serverProc.stderr.on("data", (d) => (serverLog += d));
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`${API}/health`)).ok) return; } catch {} await sleep(300); }
  throw new Error("сервер не поднялся:\n" + serverLog.slice(-3000));
}
async function startVite() {
  viteProc = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort", "--host", "127.0.0.1"], {
    cwd: join(ROOT, "client"), env: { ...process.env, VITE_STRIPE_PUBLISHABLE_KEY: "" }, stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  viteProc.stdout.on("data", (d) => (viteLog += d));
  viteProc.stderr.on("data", (d) => (viteLog += d));
  for (let i = 0; i < 100; i++) { try { if ((await fetch(UI + "/")).ok) return; } catch {} await sleep(300); }
  throw new Error("vite не поднялся:\n" + viteLog.slice(-2000));
}
const killGroup = (p) => { if (!p) return; try { process.kill(-p.pid, "SIGKILL"); } catch {} try { p.kill("SIGKILL"); } catch {} };

/* ══ Хелперы API ══════════════════════════════════════════════════════ */
const PASSWORD = "Passw0rd!123";
async function loginOf(email, password = PASSWORD) {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: J({ email, password }) });
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  return { status: r.status, cookie };
}
async function makeUser(tag) {
  const email = `t81-${tag}@test.local`;
  let r = await fetch(`${API}/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: J({ email, password: PASSWORD, displayName: `Имя ${tag}` }) });
  if (!r.ok) throw new Error("register: " + (await r.text()));
  const id = (await r.json()).user.id;
  const { cookie } = await loginOf(email);
  return { id, email, password: PASSWORD, cookie };
}
const api = async (u, method, path, body) => {
  const r = await fetch(`${API}${path}`, { method, headers: { "content-type": "application/json", Cookie: u.cookie }, body: body === undefined ? undefined : J(body) });
  let json = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
};
const userRow = async (uid) => (await db.select().from(users).where(eq(users.id, uid)))[0];
const userByEmail = async (email) => (await db.select().from(users).where(eq(users.email, email)))[0];
const adminCount = async () => (await db.select().from(users).where(eq(users.role, "admin"))).length;
const auditAll = () => db.select().from(adminAudit).orderBy(desc(adminAudit.createdAt), desc(adminAudit.id));
const auditWhere = (action) => db.select().from(adminAudit).where(eq(adminAudit.action, action)).orderBy(desc(adminAudit.createdAt));

/** Запуск bootstrap-admin отдельным процессом (скрипт держит свой db-синглтон) */
function runBootstrap(envVars) {
  const r = spawnSync(TSX, ["scripts/bootstrap-admin.ts"], {
    cwd: ROOT, encoding: "utf8", timeout: 60000,
    env: { ...process.env, DATABASE_URL: DB_URL, ...envVars },
  });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}

/* ══ Хелперы браузера ═════════════════════════════════════════════════ */
const T = (id) => `[data-testid="${id}"]`;
async function fill(page, sel, value) {
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.click(sel);
  await page.keyboard.down("Control"); await page.keyboard.press("KeyA"); await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (value) await page.type(sel, value);
}
const text = (page, sel) => page.$eval(sel, (el) => el.innerText.replace(/\s+/g, " ").trim()).catch(() => null);
const clickDom = (page, sel) => page.$eval(sel, (el) => el.click());
const waitSel = (page, sel, t = 15000) => page.waitForSelector(sel, { timeout: t });

/* ══ Прогон ═══════════════════════════════════════════════════════════ */
const t0 = Date.now();
const ADMIN_EMAIL = "t81-admin@test.local";
const ADMIN_PASSWORD = "Adm1n-Sup3r-Secret";
try {
  /* ── R2 ─────────────────────────────────────────────────────────── */
  console.log("\n── R2: bootstrap-admin на пустой базе ──");
  let b = runBootstrap({ BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD: "" });
  ok(b.code === 1 && /BOOTSTRAP_ADMIN_PASSWORD не задан/.test(b.err), "без пароля → exit 1 с внятным отказом", b.err.slice(0, 200));
  ok((await db.select().from(users)).length === 0, "users пуста после отказа");
  b = runBootstrap({ BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD: "short" });
  ok(b.code === 1 && /Минимальная длина пароля — 8/.test(b.err), "короткий пароль → отказ той же формулировкой, что register", b.err.slice(0, 200));
  b = runBootstrap({ BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD, BOOTSTRAP_ADMIN_NAME: "Первый администратор" });
  ok(b.code === 0 && /created=1, updated=0, skip=0, fail=0/.test(b.out), "с паролем → created", b.out + b.err);
  const A0 = await userByEmail(ADMIN_EMAIL);
  ok(A0?.role === "admin" && A0.displayName === "Первый администратор", "users: role='admin', display_name из BOOTSTRAP_ADMIN_NAME");
  {
    const rows = await auditWhere("user.bootstrapped");
    ok(rows.length === 1 && rows[0].actorId === A0.id && rows[0].targetType === "user" && rows[0].targetId === A0.id, "admin_audit user.bootstrapped: actor_id = самому себе, target = user");
    ok(sameJson(rows[0].details, { source: "bootstrap", outcome: "created" }), "details { source: 'bootstrap', outcome: 'created' } (canonical)", J(rows[0].details));
  }

  await startServer();
  const A = { id: A0.id, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, cookie: (await loginOf(ADMIN_EMAIL, ADMIN_PASSWORD)).cookie };
  ok(!!A.cookie, "вход по паролю из BOOTSTRAP_ADMIN_PASSWORD работает");
  let r = await api(A, "GET", "/auth/me");
  ok(r.status === 200 && r.json.user.role === "admin", "GET /auth/me → role='admin'", J(r.json));

  /* ── R3 ─────────────────────────────────────────────────────────── */
  console.log("\n── R3: идемпотентность ──");
  const hashBefore = (await userRow(A.id)).passwordHash;
  b = runBootstrap({ BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD: "Other-Passw0rd-99" });
  ok(b.code === 0 && /created=0, updated=0, skip=1, fail=0/.test(b.out), "повтор с тем же email → skip", b.out);
  ok((await userRow(A.id)).passwordHash === hashBefore, "password_hash не переписан");
  ok((await loginOf(ADMIN_EMAIL, ADMIN_PASSWORD)).status === 200, "вход прежним паролем работает");
  ok((await loginOf(ADMIN_EMAIL, "Other-Passw0rd-99")).status === 401, "новый пароль из повторного запуска НЕ действует");
  ok((await auditWhere("user.bootstrapped")).length === 1, "skip не пишет строку журнала");

  const U = await makeUser("user1");
  ok((await userRow(U.id)).role === "user", "зарегистрирован обычный пользователь");
  // updated возможен только при отсутствии администраторов — временно понижаем A напрямую в БД
  await db.update(users).set({ role: "user" }).where(eq(users.id, A.id));
  const uHash = (await userRow(U.id)).passwordHash;
  b = runBootstrap({ BOOTSTRAP_ADMIN_EMAIL: U.email, BOOTSTRAP_ADMIN_PASSWORD: "Ignored-Passw0rd-1" });
  ok(b.code === 0 && /created=0, updated=1, skip=0, fail=0/.test(b.out), "на существующем 'user' → updated (повышение)", b.out);
  ok((await userRow(U.id)).role === "admin" && (await userRow(U.id)).passwordHash === uHash, "роль 'admin', пароль пользователя не тронут");
  ok((await loginOf(U.email, PASSWORD)).status === 200, "пользователь входит своим прежним паролем");
  {
    const rows = await auditWhere("user.bootstrapped");
    const upd = rows.find((x) => x.targetId === U.id);
    ok(!!upd && upd.actorId === U.id && sameJson(upd.details, { source: "bootstrap", outcome: "updated", from: "user", to: "admin" }), "user.bootstrapped outcome 'updated' с from/to", J(upd?.details));
  }

  /* ── R4 ─────────────────────────────────────────────────────────── */
  console.log("\n── R4: заслон «второй администратор» ──");
  const usersBefore = await db.select().from(users);
  const auditBefore = await auditAll();
  b = runBootstrap({ BOOTSTRAP_ADMIN_EMAIL: "t81-admin-b@test.local", BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD });
  ok(b.code === 1 && /fail=1/.test(b.out) && /уже есть администратор/.test(b.err) && /POST \/auth\/users\/:id\/role/.test(b.err), "админ есть → другой email отклонён с подсказкой", (b.out + b.err).slice(0, 300));
  const usersAfter = await db.select().from(users);
  ok(usersAfter.length === usersBefore.length && !usersAfter.some((x) => x.email === "t81-admin-b@test.local"), "users не изменилась");
  ok(sameJson(usersAfter.map((x) => [x.id, x.role, x.passwordHash]).sort(), usersBefore.map((x) => [x.id, x.role, x.passwordHash]).sort()), "роли и хэши как были");
  ok((await auditAll()).length === auditBefore.length, "admin_audit без новых строк");
  // заслон и при существующем 'user' с другим email
  const W = await makeUser("plain");
  b = runBootstrap({ BOOTSTRAP_ADMIN_EMAIL: W.email, BOOTSTRAP_ADMIN_PASSWORD: ADMIN_PASSWORD });
  ok(b.code === 1 && (await userRow(W.id)).role === "user", "заслон действует и для существующего 'user' с другим email");

  /* ── R5 ─────────────────────────────────────────────────────────── */
  console.log("\n── R5: POST /auth/users/:id/role ──");
  // U — администратор (R3), A — понижен в БД; U возвращает A через API
  U.cookie = (await loginOf(U.email)).cookie;
  r = await api(U, "POST", `/auth/users/${A.id}/role`, { role: "admin" });
  ok(r.status === 200 && r.json.user.role === "admin" && r.json.user.id === A.id && r.json.changed === true && typeof r.json.user.balanceUsd === "number", "админ повышает user → 200, полный user", J(r.json));
  ok((await userRow(A.id)).role === "admin", "в БД role='admin'");
  {
    const rows = await auditWhere("user.role.changed");
    ok(rows.length === 1 && rows[0].actorId === U.id && rows[0].targetId === A.id && rows[0].targetType === "user", "admin_audit user.role.changed: actor = U, target = A");
    ok(sameJson(rows[0].details, { from: "user", to: "admin", email: A.email }), "details { from, to, email } (canonical)", J(rows[0].details));
    ok(typeof rows[0].ip === "string" && rows[0].ip.length > 0, "ip записан", J(rows[0].ip));
  }
  r = await api(U, "POST", `/auth/users/${A.id}/role`, { role: "admin" });
  ok(r.status === 200 && r.json.changed === false && (await auditWhere("user.role.changed")).length === 1, "та же роль → 200 changed:false, строки журнала нет");
  r = await api(W, "POST", `/auth/users/${A.id}/role`, { role: "user" });
  ok(r.status === 403 && r.json.code === "FORBIDDEN", "обычный пользователь → 403 FORBIDDEN", J(r.json));
  ok((await userRow(A.id)).role === "admin", "роль не изменилась после 403");
  r = await api(A, "GET", "/auth/users?query=t81-");
  ok(r.status === 200 && r.json.total >= 3 && r.json.users.every((x) => /^t81-/.test(x.email)) && r.json.users.some((x) => x.id === W.id && x.role === "user"), "GET /auth/users?query= — поиск по подстроке email, роли на месте", J(r.json.total));
  r = await api(A, "GET", `/auth/users?query=${encodeURIComponent("Имя plain")}`);
  ok(r.status === 200 && r.json.total === 1 && r.json.users[0].id === W.id, "поиск по displayName");
  r = await api(A, "GET", "/auth/users?limit=1&offset=1");
  ok(r.status === 200 && r.json.users.length === 1 && r.json.total >= 3, "limit/offset");

  /* ── R6 ─────────────────────────────────────────────────────────── */
  console.log("\n── R6: SELF_ROLE_CHANGE / LAST_ADMIN ──");
  ok((await adminCount()) === 2, "на входе два администратора (A, U)");
  r = await api(A, "POST", `/auth/users/${U.id}/role`, { role: "user" });
  ok(r.status === 200 && (await adminCount()) === 1, "A понижает U → остался один администратор");
  r = await api(A, "POST", `/auth/users/${A.id}/role`, { role: "user" });
  ok(r.status === 409 && r.json.code === "SELF_ROLE_CHANGE", "единственный админ понижает себя → 409 SELF_ROLE_CHANGE", J(r.json));
  ok((await userRow(A.id)).role === "admin", "роль A не изменилась");
  r = await api(A, "POST", `/auth/users/${U.id}/role`, { role: "admin" });
  U.cookie = (await loginOf(U.email)).cookie;
  r = await api(U, "POST", `/auth/users/${A.id}/role`, { role: "user" });
  ok(r.status === 200 && (await userRow(A.id)).role === "user" && (await adminCount()) === 1, "второй админ понижает первого, оставшись один → 200");
  r = await api(U, "POST", `/auth/users/${U.id}/role`, { role: "user" });
  ok(r.status === 409 && r.json.code === "SELF_ROLE_CHANGE", "…затем понижает себя → 409 SELF_ROLE_CHANGE", J(r.json));
  // DELETE /auth/me единственным админом
  const uBefore = await userRow(U.id);
  r = await api(U, "DELETE", "/auth/me", { password: PASSWORD });
  ok(r.status === 409 && r.json.code === "LAST_ADMIN" && /назначьте второго/i.test(r.json.error), "DELETE /auth/me единственным админом → 409 LAST_ADMIN с подсказкой", J(r.json));
  const uAfter = await userRow(U.id);
  ok(uAfter.email === U.email && uAfter.role === "admin" && uAfter.passwordHash === uBefore.passwordHash, "строка users не анонимизирована");
  ok((await db.select().from(sessions).where(eq(sessions.userId, U.id))).length > 0, "сессии U живы");
  ok((await auditWhere("account.deleted")).length === 0, "account.deleted не записан");
  ok((await api(U, "GET", "/auth/me")).status === 200, "cookie U по-прежнему валидна");
  // после назначения второго — оба действия проходят
  r = await api(U, "POST", `/auth/users/${A.id}/role`, { role: "admin" });
  ok(r.status === 200 && (await adminCount()) === 2, "назначен второй администратор");
  A.cookie = (await loginOf(A.email, A.password)).cookie;
  const D = await makeUser("demote");
  r = await api(U, "POST", `/auth/users/${D.id}/role`, { role: "admin" });
  r = await api(A, "POST", `/auth/users/${D.id}/role`, { role: "user" });
  ok(r.status === 200 && (await userRow(D.id)).role === "user", "понижение чужой роли при двух администраторах проходит");

  /* ── R8 (удаление U вместе с R6 «после назначения второго») ────── */
  console.log("\n── R8: сохранность следа при удалении администратора ──");
  const uRowsBefore = (await auditAll()).filter((x) => x.actorId === U.id);
  ok(uRowsBefore.length >= 3, `у U есть строки в журнале: ${uRowsBefore.length}`);
  const totalBefore = (await auditAll()).length;
  r = await api(U, "DELETE", "/auth/me", { password: PASSWORD });
  ok(r.status === 200 && r.json.ok === true, "DELETE /auth/me не последним админом → 200", J(r.json));
  const uGone = await userRow(U.id);
  ok(uGone.email === `deleted-${U.id}@deleted.invalid` && uGone.role === "user", "строка users анонимизирована, role → user");
  ok((await adminCount()) === 1, "администраторов осталось один (A)");
  {
    const all = await auditAll();
    ok(all.length === totalBefore + 1, "строки U на месте (+1 account.deleted)", J([all.length, totalBefore]));
    const kept = all.filter((x) => uRowsBefore.some((y) => y.id === x.id));
    ok(kept.length === uRowsBefore.length && kept.every((x) => x.actorId === null), "actor_id = NULL у всех строк U");
    ok(kept.every((x) => { const y = uRowsBefore.find((z) => z.id === x.id); return y && x.action === y.action && x.targetId === y.targetId && sameJson(x.details, y.details); }), "action/target/details строк не изменились");
    const del = all.find((x) => x.action === "account.deleted" && x.targetId === U.id);
    ok(!!del && del.actorId === null && del.details.wasAdmin === true && typeof del.details.deletedSyntheses === "number", "account.deleted записан (actor снят, wasAdmin: true)", J(del?.details));
    ok(all.filter((x) => x.actorId !== null).every((x) => x.actorId !== U.id), "ни одной строки с actor_id = U");
  }

  /* ── R7 ─────────────────────────────────────────────────────────── */
  console.log("\n── R7: след реестра и каталогов (API) ──");
  const B = await makeUser("admin-b");
  r = await api(A, "POST", `/auth/users/${B.id}/role`, { role: "admin" });
  B.cookie = (await loginOf(B.email)).cookie;
  const KEY = "t81.audit.probe";
  r = await api(A, "POST", `/prompts/${KEY}`, { body: "Черновик v1 {{participants}}", description: "t81" });
  ok(r.status === 201 && r.json.template.version === 1, "A создаёт v1 черновика");
  r = await api(A, "POST", `/prompts/${KEY}/activate`, { version: 1 });
  ok(r.status === 200 && r.json.template.isActive, "A активирует v1");
  r = await api(A, "POST", `/prompts/${KEY}`, { body: "Черновик v2 {{participants}}", description: "t81" });
  ok(r.status === 201 && r.json.template.version === 2, "A создаёт v2 (черновик)");
  {
    const created = (await auditWhere("prompt.version.created")).filter((x) => x.targetId === KEY);
    ok(created.length === 2 && created.every((x) => x.actorId === A.id && x.targetType === "prompt_template"), "prompt.version.created ×2, actor = автор A");
    const act = (await auditWhere("prompt.version.activated")).filter((x) => x.targetId === KEY);
    ok(act.length === 1 && act[0].actorId === A.id && sameJson(act[0].details, { version: 1, previousVersion: null }), "prompt.version.activated v1: details { version:1, previousVersion:null }", J(act[0]?.details));
    const tpl = await db.select().from(promptTemplates).where(eq(promptTemplates.key, KEY));
    ok(tpl.every((t) => t.createdBy === A.id), "created_by версий = A (актор активации — отдельное поле журнала)");
  }
  // конфиги
  r = await api(B, "PUT", "/configs/t81_probe", { value: { a: 1, b: [1, 2] }, description: "t81" });
  ok(r.status === 201 && r.json.config.version === 1, "B создаёт версию конфига");
  r = await api(B, "POST", "/configs/t81_probe/activate", { version: 1 });
  ok(r.status === 200, "B активирует конфиг");
  {
    const cc = (await auditWhere("config.version.created")).filter((x) => x.targetId === "t81_probe");
    const ca = (await auditWhere("config.version.activated")).filter((x) => x.targetId === "t81_probe");
    ok(cc.length === 1 && cc[0].actorId === B.id && cc[0].targetType === "synthesis_config" && sameJson(cc[0].details, { version: 1 }), "config.version.created actor = B");
    ok(ca.length === 1 && ca[0].actorId === B.id && sameJson(ca[0].details, { version: 1, previousVersion: null }), "config.version.activated actor = B");
  }
  // каталог: A создаёт пользовательский тип, B правит и удаляет
  r = await api(A, "POST", "/taxonomy/category-types", { key: "t81_cat", nameRu: "Пробная категория", description: "t81" });
  ok(r.status === 201, "создан пользовательский тип t81_cat");
  const typeId = r.json.type.id;
  r = await api(B, "PATCH", `/taxonomy/category-types/${typeId}`, { nameRu: "Пробная категория 2" });
  ok(r.status === 200 && r.json.type.nameRu === "Пробная категория 2", "B правит тип");
  {
    const upd = (await auditWhere("taxonomy.type.updated")).filter((x) => x.targetId === typeId);
    ok(upd.length === 1 && upd[0].actorId === B.id && upd[0].targetType === "taxonomy_type" && sameJson(upd[0].details, { kind: "category", key: "t81_cat", changed: { nameRu: { from: "Пробная категория", to: "Пробная категория 2" } } }), "taxonomy.type.updated: details { kind, key, changed }", J(upd[0]?.details));
  }
  r = await api(B, "PATCH", `/taxonomy/category-types/${typeId}`, {});
  ok(r.status === 200 && (await auditWhere("taxonomy.type.updated")).filter((x) => x.targetId === typeId).length === 1, "пустой PATCH → строки журнала нет");
  r = await api(B, "DELETE", `/taxonomy/category-types/${typeId}`);
  ok(r.status === 200 && r.json.ok && r.json.unlinked === 0, "B удаляет тип");
  {
    const del = (await auditWhere("taxonomy.type.deleted")).filter((x) => x.targetId === typeId);
    ok(del.length === 1 && del[0].actorId === B.id && sameJson(del[0].details, { kind: "category", key: "t81_cat", nameRu: "Пробная категория 2", unlinked: 0 }), "taxonomy.type.deleted: details { kind, key, nameRu, unlinked } (canonical)", J(del[0]?.details));
    ok((await db.select().from(categoryTypeCatalog).where(eq(categoryTypeCatalog.id, typeId))).length === 0, "тип удалён из каталога");
  }
  r = await api(A, "GET", "/auth/audit?limit=5");
  ok(r.status === 200 && r.json.entries.length === 5 && r.json.entries.every((e, i, arr) => i === 0 || arr[i - 1].createdAt >= e.createdAt), "GET /auth/audit?limit=5 — новые первыми");
  ok(r.json.entries[0].action === "taxonomy.type.deleted" && typeof r.json.entries[0].details === "object", "первая строка — последнее действие, details объектом");

  /* ── R9 ─────────────────────────────────────────────────────────── */
  console.log("\n── R9: edge cases ──");
  r = await api(A, "POST", `/auth/users/${W.id}/role`, { role: "moderator" });
  ok(r.status === 400 && r.json.code === "VALIDATION_ERROR" && typeof r.json.details?.role === "string", "role='moderator' → 400 VALIDATION_ERROR с details.role", J(r.json));
  r = await api(A, "POST", `/auth/users/${W.id}/role`, {});
  ok(r.status === 400 && r.json.details?.role, "без role → 400 details.role");
  r = await api(A, "POST", "/auth/users/00000000-0000-4000-8000-000000000000/role", { role: "admin" });
  ok(r.status === 404 && r.json.code === "NOT_FOUND", "несуществующий UUID → 404");
  r = await api(A, "POST", "/auth/users/not-a-uuid/role", { role: "admin" });
  ok(r.status === 404 && r.json.code === "NOT_FOUND", "не-UUID → 404 (guard до запроса к PG)");
  r = await api(W, "GET", "/auth/users");
  ok(r.status === 403 && r.json.code === "FORBIDDEN", "GET /auth/users без прав → 403");
  r = await api(W, "GET", "/auth/audit");
  ok(r.status === 403 && r.json.code === "FORBIDDEN", "GET /auth/audit без прав → 403");
  r = await fetch(`${API}/auth/users`);
  ok(r.status === 401, "GET /auth/users без сессии → 401");
  r = await api(A, "GET", "/auth/users?query=deleted-");
  ok(r.status === 200 && r.json.total === 0, "анонимизированные deleted-* в списке не показываются");
  ok((await auditWhere("user.role.changed")).every((x) => x.details.to === "admin" || x.details.to === "user"), "в журнале только допустимые роли");

  /* ── R10 + R7 (браузер) ─────────────────────────────────────────── */
  console.log("\n── Браузер: активация версии, вкладка «Доступ» ──");
  await startVite();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: "shell", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); void d.accept(); });
  const login = async (u) => {
    await page.goto(`${UI}/login`, { waitUntil: "domcontentloaded" });
    await fill(page, "input[type=email]", u.email);
    await fill(page, "input[type=password]", u.password);
    await page.click("button[type=submit]");
    await page.waitForFunction(() => location.pathname === "/catalog", { timeout: 20000 });
  };
  await login(B);
  await page.goto(`${UI}/admin/prompts`, { waitUntil: "domcontentloaded" });
  await waitSel(page, T("templates-tab"));
  // R7: B активирует v2 шаблона, созданного A
  await fill(page, T("template-search"), "t81.audit");
  const item = `${T("template-tree")} .key-tree-item[data-key="${KEY}"]`;
  await waitSel(page, item);
  await clickDom(page, item);
  await waitSel(page, `${T("version-list")} .version-item[data-version="2"]`);
  await clickDom(page, `${T("version-list")} .version-item[data-version="2"]`);
  await page.waitForFunction(() => document.querySelector('.version-item[data-version="2"]')?.classList.contains("selected"), { timeout: 5000 });
  const actBtn = await text(page, T("template-activate"));
  ok(/активировать/i.test(actBtn ?? "") && !(await page.$eval(T("template-activate"), (el) => el.disabled)), "кнопка «Активировать» доступна для черновика v2 (капитель — /i)", actBtn);
  const actBefore = (await auditWhere("prompt.version.activated")).filter((x) => x.targetId === KEY).length;
  await clickDom(page, T("template-activate"));
  await page.waitForFunction(() => document.querySelector('.version-item[data-version="2"]')?.classList.contains("current"), { timeout: 15000 });
  {
    const act = (await auditWhere("prompt.version.activated")).filter((x) => x.targetId === KEY);
    ok(act.length === actBefore + 1, "строка prompt.version.activated добавлена");
    ok(act[0].actorId === B.id && act[0].actorId !== A.id, "actor_id = активировавший B, не автор версии A");
    ok(sameJson(act[0].details, { version: 2, previousVersion: 1 }), "details { version:2, previousVersion:1 } (canonical)", J(act[0].details));
    const t2 = (await db.select().from(promptTemplates).where(and(eq(promptTemplates.key, KEY), eq(promptTemplates.version, 2))))[0];
    ok(t2.isActive && t2.createdBy === A.id, "v2 активна, created_by = A");
  }

  // R10: вкладка «Доступ»
  await clickDom(page, T("tab-access"));
  await waitSel(page, T("access-tab"));
  await waitSel(page, `${T("access-users")} table`);
  await waitSel(page, `${T("access-audit")} table`);
  const myRowBtns = await page.$eval(T(`access-row-${B.email}`), (tr) => tr.querySelectorAll("button").length).catch(() => -1);
  ok(myRowBtns === 0, "у собственной строки кнопки смены роли нет");
  await fill(page, T("access-search"), "t81-plain");
  await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 1, { timeout: 10000 }, `${T("access-users")} tbody tr`);
  const wRow = T(`access-row-${W.email}`);
  await waitSel(page, wRow);
  ok((await page.$eval(wRow, (tr) => tr.dataset.role)) === "user", "строка W найдена поиском, роль «пользователь»");
  const roleCell = await text(page, `${wRow} td:nth-child(3)`);
  ok(/пользователь/i.test(roleCell ?? ""), "бейдж роли (регистронезависимо)", roleCell);
  const auditRowsBefore = await page.$$eval(T("access-audit-row"), (trs) => trs.length);
  const toggleTxt = await text(page, T(`access-toggle-${W.email}`));
  ok(/назначить администратором/i.test(toggleTxt ?? ""), "кнопка «Назначить администратором»", toggleTxt);
  await clickDom(page, T(`access-toggle-${W.email}`));
  await page.waitForFunction((sel) => document.querySelector(sel)?.dataset.role === "admin", { timeout: 15000 }, wRow);
  ok(dialogs.length === 1 && /назначить администратором/i.test(dialogs[0]) && dialogs[0].includes(W.email), "confirm показан с email и объяснением", J(dialogs));
  ok((await userRow(W.id)).role === "admin", "в БД W → admin");
  // статус ставится ПОСЛЕ перечитывания списка И журнала — список уже
  // обновлён, статуса может ещё не быть: ждём его, а не читаем сразу
  await page.waitForFunction(() => /роль теперь/i.test(document.querySelector('[data-testid="access-status"]')?.textContent ?? ""), { timeout: 10000 });
  const statusTxt = await text(page, T("access-status"));
  ok(/роль теперь/i.test(statusTxt ?? "") && statusTxt.includes(W.email) && /администратор/i.test(statusTxt), "статус успеха после обновления списка", statusTxt);
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="access-audit-row"]').length === n + 1, { timeout: 10000 }, auditRowsBefore);
  const firstAudit = await page.$eval(T("access-audit-row"), (tr) => ({ action: tr.dataset.action, text: tr.innerText }));
  ok(firstAudit.action === "user.role.changed" && firstAudit.text.includes(W.email) && /роль изменена/i.test(firstAudit.text) && firstAudit.text.includes(B.email), "журнал: новая строка user.role.changed сверху, актор B, цель W", J(firstAudit));
  {
    const rows = (await auditWhere("user.role.changed")).filter((x) => x.targetId === W.id);
    ok(rows.length === 1 && rows[0].actorId === B.id && sameJson(rows[0].details, { from: "user", to: "admin", email: W.email }), "БД: строка user.role.changed из браузера (canonical)");
  }
  // обратное переключение
  const toggle2 = await text(page, T(`access-toggle-${W.email}`));
  ok(/снять права/i.test(toggle2 ?? ""), "кнопка сменилась на «Снять права»", toggle2);
  await clickDom(page, T(`access-toggle-${W.email}`));
  await page.waitForFunction((sel) => document.querySelector(sel)?.dataset.role === "user", { timeout: 15000 }, wRow);
  ok((await userRow(W.id)).role === "user" && dialogs.length === 2, "снятие прав через вкладку: БД role='user', второй confirm");
  ok((await auditWhere("user.role.changed")).filter((x) => x.targetId === W.id).length === 2, "две строки user.role.changed по W");
  // журнал показывает «аккаунт удалён» у строк U без актора
  const deletedActorRows = await page.$$eval(T("access-audit-row"), (trs) => trs.filter((tr) => /аккаунт удалён/i.test(tr.innerText)).length);
  ok(deletedActorRows >= 1, "строки удалившего аккаунт актора помечены «(аккаунт удалён)»", String(deletedActorRows));
  ok(pageErrors.length === 0, "ошибок страницы нет", J(pageErrors));
} catch (err) {
  failed++;
  console.error("\n!!! ИСКЛЮЧЕНИЕ:", err);
  console.error("server log tail:\n" + serverLog.slice(-2500));
} finally {
  try { await browser?.close(); } catch {}
  killGroup(serverProc); killGroup(viteProc);
  try { await closeRedis(); } catch {}
  try { await closeDb(); } catch {}
}
console.log(`\nИТОГ: ${passed} ✓ / ${failed} ✗ за ${((Date.now() - t0) / 1000).toFixed(0)} с`);
if (fails.length) console.log("Провалы:\n  - " + fails.join("\n  - "));
process.exit(failed ? 1 : 0);
