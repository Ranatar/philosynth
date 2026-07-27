/**
 * Беседа 0.5, запрос 3 — тест инвалидации сессий при password-change:
 *   - у пользователя ТРИ сессии (A, B, C); смена пароля идёт под A;
 *   - после смены: A жива (GET /auth/me → 200), B и C → 401;
 *   - в БД у пользователя ровно одна сессия, и это сессия A;
 *   - сессия ДРУГОГО пользователя не затронута (инвалидация — только своих).
 *
 * Приём — как в test-05-request2.mjs: mini-Hono app.request с реальными
 * authRoutes и живой БД. Самоочистка: оба тестовых пользователя удаляются
 * (sessions — каскадом). Запуск: npx tsx test-05-request3.mjs (корень репо).
 */
import { createHash } from "node:crypto";

import { Hono } from "hono";

import { authRoutes } from "./server/routes/auth.ts";
import { db, schema, closeDb } from "./server/db/index.ts";
import { eq, inArray } from "drizzle-orm";

const STAMP = Date.now();
const EMAIL = `test-05-r3-${STAMP}@example.com`;
const EMAIL_OTHER = `test-05-r3-other-${STAMP}@example.com`;
const OLD_PASSWORD = "old-password-1";
const NEW_PASSWORD = "new-password-2";

const app = new Hono().route("/auth", authRoutes);

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

function sessionCookie(res) {
  const m = (res.headers.get("set-cookie") ?? "").match(
    /philosynth_session=([^;]+)/,
  );
  return m ? { cookie: `philosynth_session=${m[1]}`, token: m[1] } : null;
}

/** sessions.id = SHA-256(token) hex — как в middleware/auth.ts. */
function sessionIdFromToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function register(email, password) {
  return app.request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

async function login(email, password) {
  const res = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { res, session: sessionCookie(res) };
}

async function me(cookie) {
  return app.request("/auth/me", { headers: { cookie } });
}

async function main() {
  // ── Подготовка: пользователь + 3 сессии, второй пользователь + 1 сессия ──
  const reg = await register(EMAIL, OLD_PASSWORD);
  const regOther = await register(EMAIL_OTHER, OLD_PASSWORD);
  check(
    "подготовка: два register → 201",
    reg.status === 201 && regOther.status === 201,
    `status=${reg.status}/${regOther.status}`,
  );

  const a = await login(EMAIL, OLD_PASSWORD); // текущая — под ней меняем пароль
  const b = await login(EMAIL, OLD_PASSWORD);
  const cS = await login(EMAIL, OLD_PASSWORD);
  const other = await login(EMAIL_OTHER, OLD_PASSWORD);
  check(
    "подготовка: 3 сессии пользователя + 1 чужая (все login → 200)",
    [a, b, cS, other].every((x) => x.res.status === 200 && x.session),
  );
  if (![a, b, cS, other].every((x) => x.session)) {
    throw new Error("нет cookie — дальнейшие проверки бессмысленны");
  }

  // Все три сессии живы ДО смены (и различны)
  const meA0 = await me(a.session.cookie);
  const meB0 = await me(b.session.cookie);
  const meC0 = await me(cS.session.cookie);
  check(
    "до смены: A, B, C живы (me → 200), токены различны",
    meA0.status === 200 &&
      meB0.status === 200 &&
      meC0.status === 200 &&
      new Set([a.session.token, b.session.token, cS.session.token]).size === 3,
  );

  // ── Смена пароля под сессией A ──
  const change = await app.request("/auth/password-change", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: a.session.cookie },
    body: JSON.stringify({
      currentPassword: OLD_PASSWORD,
      newPassword: NEW_PASSWORD,
    }),
  });
  check("password-change под A → 200", change.status === 200, `status=${change.status}`);

  // ── Текущая сессия A жива ──
  const meA1 = await me(a.session.cookie);
  const meA1Body = await meA1.json().catch(() => null);
  check(
    "после смены: ТЕКУЩАЯ сессия A жива (me → 200, тот же user)",
    meA1.status === 200 && meA1Body?.user?.email === EMAIL,
    `status=${meA1.status}`,
  );

  // ── Прочие сессии B и C инвалидированы ──
  const meB1 = await me(b.session.cookie);
  const meB1Body = await meB1.json().catch(() => null);
  const meC1 = await me(cS.session.cookie);
  const meC1Body = await meC1.json().catch(() => null);
  check(
    "после смены: сессия B инвалидирована (me → 401 AUTH_REQUIRED)",
    meB1.status === 401 && meB1Body?.code === "AUTH_REQUIRED",
    `status=${meB1.status}, ${JSON.stringify(meB1Body)}`,
  );
  check(
    "после смены: сессия C инвалидирована (me → 401 AUTH_REQUIRED)",
    meC1.status === 401 && meC1Body?.code === "AUTH_REQUIRED",
    `status=${meC1.status}, ${JSON.stringify(meC1Body)}`,
  );

  // ── БД: у пользователя ровно одна сессия, и это A ──
  const userRows = await db.query.users.findMany({
    where: (u, { inArray: inOp }) => inOp(u.email, [EMAIL, EMAIL_OTHER]),
  });
  const user = userRows.find((u) => u.email === EMAIL);
  const otherUser = userRows.find((u) => u.email === EMAIL_OTHER);
  const sessRows = user
    ? await db.query.sessions.findMany({
        where: (s, { eq: eqOp }) => eqOp(s.userId, user.id),
      })
    : [];
  check(
    "БД: у пользователя ровно 1 сессия и её id = SHA-256(токена A)",
    sessRows.length === 1 &&
      sessRows[0]?.id === sessionIdFromToken(a.session.token),
    `rows=${sessRows.length}`,
  );

  // ── Чужая сессия не затронута ──
  const meOther = await me(other.session.cookie);
  const otherSessRows = otherUser
    ? await db.query.sessions.findMany({
        where: (s, { eq: eqOp }) => eqOp(s.userId, otherUser.id),
      })
    : [];
  check(
    "сессия ДРУГОГО пользователя жива (me → 200; в БД 1 строка)",
    meOther.status === 200 && otherSessRows.length === 1,
    `status=${meOther.status}, rows=${otherSessRows.length}`,
  );
}

main()
  .catch((err) => {
    failed++;
    console.error("  ✗ необработанная ошибка:", err);
  })
  .finally(async () => {
    try {
      await db
        .delete(schema.users)
        .where(inArray(schema.users.email, [EMAIL, EMAIL_OTHER]));
    } catch (err) {
      console.error("  (очистка не удалась)", err);
    }
    await closeDb();
    console.log(`\nИтог: ${passed} ✓ / ${failed} ✗`);
    process.exit(failed > 0 ? 1 : 0);
  });
