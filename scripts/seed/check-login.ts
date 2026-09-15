/**
 * check-login.ts — сверить пароль со ХЭШЕМ В БАЗЕ, минуя HTTP.
 * Разделяет три причины 401: нет пользователя / не тот хэш / дело не в пароле.
 *
 * Запуск ИЗ КОРНЯ репозитория:
 *   CHECK_EMAIL=… CHECK_PASSWORD='…' npx tsx scripts/checks/check-login.ts
 */
import { eq } from "drizzle-orm";

import { closeDb, db } from "../../server/db/index.js";
import { users } from "../../server/db/schema.js";
import { verifyPassword } from "../../server/middleware/auth.js";

async function main(): Promise<void> {
  console.log("DATABASE_URL:", (process.env.DATABASE_URL ?? "(не задан — умолчание env.ts)").replace(/:[^:@]*@/, ":***@"));
  const email = (process.env.CHECK_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.CHECK_PASSWORD ?? "";
  console.log(`проверяю: «${email}», длина пароля: ${password.length}`);

  const all = await db.select({ e: users.email, r: users.role, h: users.passwordHash, u: users.updatedAt }).from(users).limit(50);
  console.log(`всего пользователей в базе: ${all.length}`);
  for (const u of all) console.log(`  «${u.e}» роль=${u.r} хэш=${u.h.slice(0, 7)}…(${u.h.length}) обновлён=${u.u?.toISOString?.() ?? u.u}`);

  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row) { console.log("ИТОГ: пользователя с таким адресом НЕТ — дело в адресе, не в пароле"); return; }
  const ok = await verifyPassword(password, row.passwordHash);
  console.log(ok
    ? "ИТОГ: пароль ПОДХОДИТ к хэшу в базе — значит 401 приходит не отсюда (не тот сервер? не та база?)"
    : "ИТОГ: пароль НЕ подходит к хэшу в базе — набран не тот пароль либо смена ушла в другую базу");
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("/check-login.ts");
if (isDirectRun) {
  main().catch((e) => { console.error("check-login: фатальная ошибка:", e); process.exitCode = 1; }).finally(() => closeDb());
}
