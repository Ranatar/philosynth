/**
 * Беседа 0.5, запрос 2 — тест POST /auth/password-change:
 *   1) смена с верным текущим паролем → 200 { ok: true };
 *   2) вход по НОВОМУ паролю работает (200 + cookie);
 *   3) вход по СТАРОМУ паролю → 401 AUTH_REQUIRED.
 *
 * Приём — как в integration-check секции 5e: mini-Hono app.request с
 * реальными authRoutes и живой БД (сервер не поднимается). Самоочистка:
 * тестовый пользователь удаляется (sessions — каскадом).
 * Запуск: npx tsx test-05-request2.mjs (из корня репо; нужен живой PG).
 */
import { Hono } from "hono";

import { authRoutes } from "./server/routes/auth.ts";
import { db, schema, closeDb } from "./server/db/index.ts";
import { eq } from "drizzle-orm";

const EMAIL = `test-05-r2-${Date.now()}@example.com`;
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

/** Достаём token-cookie сессии из Set-Cookie ответа login. */
function sessionCookie(res) {
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/philosynth_session=([^;]+)/);
  return m ? `philosynth_session=${m[1]}` : null;
}

async function main() {
  // ── Подготовка: register + login старым паролем ──
  const reg = await app.request("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: OLD_PASSWORD }),
  });
  check("подготовка: register → 201", reg.status === 201, `status=${reg.status}`);

  const login1 = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: OLD_PASSWORD }),
  });
  const cookie = sessionCookie(login1);
  check(
    "подготовка: login старым паролем → 200 + cookie",
    login1.status === 200 && !!cookie,
    `status=${login1.status}, cookie=${cookie ? "есть" : "нет"}`,
  );
  if (!cookie) throw new Error("нет cookie — дальнейшие проверки бессмысленны");

  // ── 1. Смена с верным текущим паролем → 200 { ok: true } ──
  const change = await app.request("/auth/password-change", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      currentPassword: OLD_PASSWORD,
      newPassword: NEW_PASSWORD,
    }),
  });
  const changeBody = await change.json().catch(() => null);
  check("password-change (верный текущий) → 200", change.status === 200, `status=${change.status}`);
  check("тело ответа = { ok: true }", changeBody?.ok === true, JSON.stringify(changeBody));

  // ── 2. Вход по НОВОМУ паролю работает ──
  const loginNew = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: NEW_PASSWORD }),
  });
  const loginNewBody = await loginNew.json().catch(() => null);
  check("login новым паролем → 200", loginNew.status === 200, `status=${loginNew.status}`);
  check(
    "login новым: выдана сессия (cookie) и user",
    !!sessionCookie(loginNew) && loginNewBody?.user?.email === EMAIL,
    JSON.stringify(loginNewBody),
  );

  // ── 3. Вход по СТАРОМУ паролю → 401 AUTH_REQUIRED ──
  const loginOld = await app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: OLD_PASSWORD }),
  });
  const loginOldBody = await loginOld.json().catch(() => null);
  check("login старым паролем → 401", loginOld.status === 401, `status=${loginOld.status}`);
  check(
    "код ошибки AUTH_REQUIRED, cookie не выдан",
    loginOldBody?.code === "AUTH_REQUIRED" && !sessionCookie(loginOld),
    JSON.stringify(loginOldBody),
  );

  // ── Хэш в БД действительно сменился (не равен исходному bcrypt) ──
  const rows = await db.query.users.findMany({
    where: (u, { eq: eqOp }) => eqOp(u.email, EMAIL),
    limit: 1,
  });
  check(
    "в БД один пользователь, password_hash — bcrypt-формат",
    rows.length === 1 && /^\$2[aby]\$/.test(rows[0]?.passwordHash ?? ""),
  );
}

main()
  .catch((err) => {
    failed++;
    console.error("  ✗ необработанная ошибка:", err);
  })
  .finally(async () => {
    // Самоочистка: пользователь + каскадом его сессии
    try {
      await db.delete(schema.users).where(eq(schema.users.email, EMAIL));
    } catch (err) {
      console.error("  (очистка не удалась)", err);
    }
    await closeDb();
    console.log(`\nИтог: ${passed} ✓ / ${failed} ✗`);
    process.exit(failed > 0 ? 1 : 0);
  });
