/**
 * Беседа 0.5, запрос 4 — edge cases POST /auth/password-change:
 *   1) неверный currentPassword → 401 AUTH_REQUIRED;
 *   2) newPassword короче 8 → 400 VALIDATION_ERROR + details.newPassword;
 *   кромки сверх протокола:
 *   3) без сессии → 401 AUTH_REQUIRED (requireAuth);
 *   4) отсутствующие поля → VALIDATION_ERROR + details по ОБОИМ полям;
 *   5) битый JSON → VALIDATION_ERROR;
 *   6) при любом отказе НЕТ побочных эффектов: пароль не сменился
 *      (login старым → 200), вторая сессия пользователя жива.
 *
 * Приём — как в test-05-request{2,3}.mjs (mini-Hono + живая БД, самоочистка).
 * Запуск: npx tsx test-05-request4.mjs (корень репо).
 */
import { Hono } from "hono";

import { authRoutes } from "../server/routes/auth.ts";
import { db, schema, closeDb } from "../server/db/index.ts";
import { eq } from "drizzle-orm";

const EMAIL = `test-05-r4-${Date.now()}@example.com`;
const PASSWORD = "correct-password-1";

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
  return m ? `philosynth_session=${m[1]}` : null;
}

async function changePassword(cookie, body, rawBody) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return app.request("/auth/password-change", {
    method: "POST",
    headers,
    body: rawBody ?? JSON.stringify(body),
  });
}

async function main() {
  // ── Подготовка: пользователь + две сессии (рабочая и «свидетель») ──
  const reg = await app.request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginRes = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const witnessRes = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const cookie = sessionCookie(loginRes);
  const witnessCookie = sessionCookie(witnessRes);
  check(
    "подготовка: register 201, две сессии выданы",
    reg.status === 201 && !!cookie && !!witnessCookie,
  );
  if (!cookie || !witnessCookie) throw new Error("нет cookie");

  // ── 1. Неверный currentPassword → 401 AUTH_REQUIRED ──
  const wrongCur = await changePassword(cookie, {
    currentPassword: "totally-wrong-password",
    newPassword: "brand-new-password-9",
  });
  const wrongCurBody = await wrongCur.json().catch(() => null);
  check(
    "неверный currentPassword → 401",
    wrongCur.status === 401,
    `status=${wrongCur.status}`,
  );
  check(
    "код AUTH_REQUIRED, details отсутствуют (единый ответ)",
    wrongCurBody?.code === "AUTH_REQUIRED" && wrongCurBody?.details === undefined,
    JSON.stringify(wrongCurBody),
  );

  // ── 2. newPassword короче 8 → 400 VALIDATION_ERROR + details ──
  const shortNew = await changePassword(cookie, {
    currentPassword: PASSWORD,
    newPassword: "short7!",
  });
  const shortNewBody = await shortNew.json().catch(() => null);
  check(
    "newPassword короче 8 → 400",
    shortNew.status === 400,
    `status=${shortNew.status}`,
  );
  check(
    "код VALIDATION_ERROR + details.newPassword (и только он)",
    shortNewBody?.code === "VALIDATION_ERROR" &&
      typeof shortNewBody?.details?.newPassword === "string" &&
      shortNewBody?.details?.currentPassword === undefined,
    JSON.stringify(shortNewBody),
  );

  // ── 3. Без сессии → 401 AUTH_REQUIRED (requireAuth срабатывает раньше) ──
  const noAuth = await changePassword(null, {
    currentPassword: PASSWORD,
    newPassword: "brand-new-password-9",
  });
  const noAuthBody = await noAuth.json().catch(() => null);
  check(
    "без сессии → 401 AUTH_REQUIRED",
    noAuth.status === 401 && noAuthBody?.code === "AUTH_REQUIRED",
    `status=${noAuth.status}`,
  );

  // ── 4. Отсутствующие поля → details по обоим ──
  const emptyBody = await changePassword(cookie, {});
  const emptyBodyJson = await emptyBody.json().catch(() => null);
  check(
    "пустое тело → 400 VALIDATION_ERROR + details.currentPassword и details.newPassword",
    emptyBody.status === 400 &&
      emptyBodyJson?.code === "VALIDATION_ERROR" &&
      typeof emptyBodyJson?.details?.currentPassword === "string" &&
      typeof emptyBodyJson?.details?.newPassword === "string",
    JSON.stringify(emptyBodyJson),
  );

  // Нестроковые поля приравниваются к отсутствующим (typeof-фильтр)
  const badTypes = await changePassword(cookie, {
    currentPassword: 12345,
    newPassword: ["not", "a", "string"],
  });
  const badTypesJson = await badTypes.json().catch(() => null);
  check(
    "нестроковые поля → 400 VALIDATION_ERROR (оба в details)",
    badTypes.status === 400 &&
      badTypesJson?.code === "VALIDATION_ERROR" &&
      !!badTypesJson?.details?.currentPassword &&
      !!badTypesJson?.details?.newPassword,
    JSON.stringify(badTypesJson),
  );

  // ── 5. Битый JSON → VALIDATION_ERROR (readJson → null) ──
  const brokenJson = await changePassword(cookie, null, "{не json");
  const brokenJsonBody = await brokenJson.json().catch(() => null);
  check(
    "битый JSON → 400 VALIDATION_ERROR",
    brokenJson.status === 400 && brokenJsonBody?.code === "VALIDATION_ERROR",
    `status=${brokenJson.status}`,
  );

  // ── 6. Нет побочных эффектов после всех отказов ──
  const loginOld = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  check(
    "после всех отказов пароль НЕ сменился (login исходным → 200)",
    loginOld.status === 200,
    `status=${loginOld.status}`,
  );
  const witnessMe = await app.request("/auth/me", {
    headers: { cookie: witnessCookie },
  });
  const userRows = await db.query.users.findMany({
    where: (u, { eq: eqOp }) => eqOp(u.email, EMAIL),
    limit: 1,
  });
  const sessCount = userRows[0]
    ? (
        await db.query.sessions.findMany({
          where: (s, { eq: eqOp }) => eqOp(s.userId, userRows[0].id),
        })
      ).length
    : -1;
  check(
    "сессии НЕ инвалидированы отказами (свидетель me → 200; в БД 3 сессии: 2 + login выше)",
    witnessMe.status === 200 && sessCount === 3,
    `status=${witnessMe.status}, rows=${sessCount}`,
  );
}

main()
  .catch((err) => {
    failed++;
    console.error("  ✗ необработанная ошибка:", err);
  })
  .finally(async () => {
    try {
      await db.delete(schema.users).where(eq(schema.users.email, EMAIL));
    } catch (err) {
      console.error("  (очистка не удалась)", err);
    }
    await closeDb();
    console.log(`\nИтог: ${passed} ✓ / ${failed} ✗`);
    process.exit(failed > 0 ? 1 : 0);
  });
