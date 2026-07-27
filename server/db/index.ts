/**
 * Подключение к PostgreSQL через postgres.js + Drizzle ORM.
 * Схема — server/db/schema.ts (28 таблиц из 02-data-model.md).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://philosynth:philosynth_dev@localhost:5432/philosynth";

/** Низкоуровневый клиент postgres.js (для raw-SQL, рекурсивных CTE lineage). */
export const sql = postgres(DATABASE_URL, {
  max: 10,
  // Генерация длинная, но каждый запрос к БД короткий
  idle_timeout: 30,
  onnotice: () => {},
});

/** Типизированный Drizzle-клиент с полной схемой (db.query.<table>). */
export const db = drizzle(sql, { schema, casing: "snake_case" });

export type Db = typeof db;
export { schema };

/** Закрытие пула (graceful shutdown). */
export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
