import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

/**
 * PostgreSQL connection via postgres.js driver.
 *
 * - В dev-режиме: единственный клиент, max 10 подключений
 * - В production: можно увеличить max или использовать PgBouncer
 */
const client = postgres(env.DATABASE_URL, {
  max: env.NODE_ENV === "production" ? 20 : 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });

export type Database = typeof db;

/**
 * Graceful shutdown — закрыть пул соединений.
 */
export async function closeDb() {
  await client.end();
}
