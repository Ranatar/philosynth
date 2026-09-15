/**
 * reset-password.ts — сменить пароль существующему пользователю.
 *
 * Нужен потому, что bootstrap-admin.ts на уже существующем администраторе
 * даёт skip и пароль НЕ трогает (строка 117): повторный прогон не спасает,
 * если пароль потерян или введён с опечаткой.
 *
 * Запуск ИЗ КОРНЯ репозитория:
 *   RESET_EMAIL=… RESET_PASSWORD='…' npx tsx scripts/seed/reset-password.ts
 *
 * Пароль — переменной окружения, а не доводом: довод виден в списке
 * процессов и оседает в истории оболочки.
 */
import { eq } from "drizzle-orm";

import { closeDb, db } from "../../server/db/index.js";
import { users } from "../../server/db/schema.js";
import { hashPassword } from "../../server/middleware/auth.js";

async function main(): Promise<void> {
  const email = (process.env.RESET_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.RESET_PASSWORD ?? "";
  if (!email || password.length < 8) {
    console.error("Нужны RESET_EMAIL и RESET_PASSWORD (минимум 8 знаков)");
    process.exitCode = 1;
    return;
  }
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!row) {
    console.error(`Пользователя ${email} в базе НЕТ. Есть такие:`);
    for (const u of await db.select({ e: users.email, r: users.role }).from(users).limit(20)) {
      console.error(`  ${u.e}  (${u.r})`);
    }
    process.exitCode = 1;
    return;
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(users.id, row.id));
  console.log(`пароль обновлён: ${email}, роль=${row.role}, длина пароля=${password.length}`);
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("/reset-password.ts");
if (isDirectRun) {
  main()
    .catch((err) => {
      console.error("reset-password: фатальная ошибка:", err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
