/**
 * Беседа 0.6, тестовый запрос (часть A — API) — PATCH /auth/me:
 *   - смена displayName видна в GET /auth/me (и в ответе PATCH — полный user);
 *   - trim; пустая строка → null;
 *   - длина > 100 → 400 VALIDATION_ERROR + details.displayName;
 *   - не-строка / отсутствие поля → 400 VALIDATION_ERROR + details;
 *   - без сессии → 401 AUTH_REQUIRED;
 *   - отказы не меняют значение в БД.
 *
 * Приём — mini-Hono app.request + живая БД (как test-05-*). Самоочистка.
 * Запуск: npx tsx test-06-request2-api.mjs (корень репо).
 */
import { Hono } from "hono";

import { authRoutes } from "./server/routes/auth.ts";
import { db, schema, closeDb } from "./server/db/index.ts";
import { eq } from "drizzle-orm";

const EMAIL = `test-06-api-${Date.now()}@example.com`;
const PASSWORD = "profile-password-1";

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

function cookieOf(res) {
  const m = (res.headers.get("set-cookie") ?? "").match(
    /philosynth_session=[^;]+/,
  );
  return m ? m[0] : null;
}

async function patchMe(cookie, body) {
  const headers = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return app.request("/auth/me", {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

async function getMe(cookie) {
  const res = await app.request("/auth/me", { headers: { cookie } });
  return { res, body: await res.json().catch(() => null) };
}

async function dbDisplayName() {
  const rows = await db.query.users.findMany({
    where: (u, { eq: eqOp }) => eqOp(u.email, EMAIL),
    limit: 1,
  });
  return rows[0]?.displayName;
}

async function main() {
  // ── Подготовка ──
  await app.request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const login = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const cookie = cookieOf(login);
  check("подготовка: register+login, cookie выдан", !!cookie);
  if (!cookie) throw new Error("нет cookie");

  // ── Смена displayName → полный user в ответе и в GET /auth/me ──
  const set1 = await patchMe(cookie, { displayName: "Никанор Устюжанин" });
  const set1Body = await set1.json().catch(() => null);
  check("PATCH displayName → 200", set1.status === 200, `status=${set1.status}`);
  check(
    "ответ PATCH — полный user (displayName, role, balanceUsd:number)",
    set1Body?.user?.displayName === "Никанор Устюжанин" &&
      set1Body?.user?.email === EMAIL &&
      typeof set1Body?.user?.role === "string" &&
      typeof set1Body?.user?.balanceUsd === "number",
    JSON.stringify(set1Body),
  );
  const me1 = await getMe(cookie);
  check(
    "смена видна в GET /auth/me",
    me1.res.status === 200 && me1.body?.user?.displayName === "Никанор Устюжанин",
    JSON.stringify(me1.body?.user),
  );
  check(
    "в БД displayName обновлён",
    (await dbDisplayName()) === "Никанор Устюжанин",
  );

  // ── trim ──
  const setTrim = await patchMe(cookie, { displayName: "  Обрезанный  " });
  const setTrimBody = await setTrim.json().catch(() => null);
  check(
    "trim применяется",
    setTrim.status === 200 && setTrimBody?.user?.displayName === "Обрезанный",
    JSON.stringify(setTrimBody?.user),
  );

  // ── Пустая строка → null ──
  const setEmpty = await patchMe(cookie, { displayName: "" });
  const setEmptyBody = await setEmpty.json().catch(() => null);
  const me2 = await getMe(cookie);
  check(
    "пустая строка → displayName = null (в ответе, в /auth/me и в БД)",
    setEmpty.status === 200 &&
      setEmptyBody?.user?.displayName === null &&
      me2.body?.user?.displayName === null &&
      (await dbDisplayName()) === null,
    JSON.stringify(setEmptyBody?.user),
  );

  // Вернём имя, чтобы проверить, что отказы его не трогают
  await patchMe(cookie, { displayName: "Эталон" });

  // ── Длина > 100 → VALIDATION_ERROR + details ──
  const long = "х".repeat(101);
  const setLong = await patchMe(cookie, { displayName: long });
  const setLongBody = await setLong.json().catch(() => null);
  check(
    "101 символ → 400 VALIDATION_ERROR + details.displayName",
    setLong.status === 400 &&
      setLongBody?.code === "VALIDATION_ERROR" &&
      typeof setLongBody?.details?.displayName === "string",
    `status=${setLong.status}, ${JSON.stringify(setLongBody)}`,
  );
  // Ровно 100 — валидно (граница включительно)
  const exact = "и".repeat(100);
  const setExact = await patchMe(cookie, { displayName: exact });
  check("ровно 100 символов → 200", setExact.status === 200, `status=${setExact.status}`);
  await patchMe(cookie, { displayName: "Эталон" });

  // ── Не-строка и отсутствие поля ──
  const setNum = await patchMe(cookie, { displayName: 42 });
  const setNumBody = await setNum.json().catch(() => null);
  check(
    "не-строка → 400 VALIDATION_ERROR + details",
    setNum.status === 400 && !!setNumBody?.details?.displayName,
    JSON.stringify(setNumBody),
  );
  const setNone = await patchMe(cookie, {});
  const setNoneBody = await setNone.json().catch(() => null);
  check(
    "поле отсутствует → 400 VALIDATION_ERROR + details «Обязательное поле»",
    setNone.status === 400 && !!setNoneBody?.details?.displayName,
    JSON.stringify(setNoneBody),
  );

  // ── Без сессии → 401 ──
  const noAuth = await patchMe(null, { displayName: "Аноним" });
  const noAuthBody = await noAuth.json().catch(() => null);
  check(
    "без сессии → 401 AUTH_REQUIRED",
    noAuth.status === 401 && noAuthBody?.code === "AUTH_REQUIRED",
    `status=${noAuth.status}`,
  );

  // ── Отказы не изменили значение ──
  check(
    "после всех отказов displayName в БД = «Эталон»",
    (await dbDisplayName()) === "Эталон",
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
    console.log(`\nИтог (API): ${passed} ✓ / ${failed} ✗`);
    process.exit(failed > 0 ? 1 : 0);
  });
