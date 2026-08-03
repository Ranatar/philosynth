/**
 * Точка входа сервера PhiloSynth.
 * Беседа 0.1: health-check + graceful shutdown.
 * Беседа 0.2: CORS, формат ошибок, auth-роуты, rate-limiter, WebSocket.
 * Дальше: syntheses/sections/… — беседы 1.x+.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { env } from "./env.js";
import { closeDb, sql } from "./db/index.js";
import { closeRedis, connectRedis } from "./redis.js";
import type { AuthEnv } from "./middleware/auth.js";
import { rateLimiter } from "./middleware/rate-limiter.js";
import { authRoutes } from "./routes/auth.js";
import { synthesesRoutes } from "./routes/syntheses.js";
import { sectionsRoutes } from "./routes/sections.js";
import { elementsRoutes } from "./routes/elements.js";
import { connectionManager } from "./ws/connection-manager.js";
import { registerWebSocket } from "./ws/handler.js";

const app = new Hono<AuthEnv>();

/* ── Глобальные middleware ───────────────────────────────────────────── */

app.use(
  "*",
  cors({
    origin: env.clientOrigin,
    credentials: true, // cookie-сессии (Lucia-модель)
  }),
);

// Единый формат ошибок { error, code } (03-spec §2, §4.3)
app.notFound((c) =>
  c.json({ error: "Ресурс не найден", code: "NOT_FOUND" }, 404),
);
app.onError((err, c) => {
  console.error(`[http] ${c.req.method} ${c.req.path}:`, err);
  return c.json(
    { error: "Внутренняя ошибка сервера", code: "INTERNAL_ERROR" },
    500,
  );
});

/* ── Health (до rate-limiter: мониторинг не лимитируем) ──────────────── */

app.get("/api/v1/health", async (c) => {
  try {
    const [row] = await sql`SELECT 1 AS ok`;
    return c.json({ ok: true, db: row?.ok === 1 });
  } catch {
    return c.json({ ok: false, db: false }, 503);
  }
});

/* ── API-роуты (под rate-limiter) ────────────────────────────────────── */

app.use("/api/v1/*", rateLimiter());
app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/syntheses", synthesesRoutes); // беседа 1.4 + 1.6
app.route("/api/v1/syntheses", sectionsRoutes); // беседа 1.6 (03 §2.3)
app.route("/api/v1/syntheses", elementsRoutes); // беседа 1.6 (03 §2.4, GET)

/* ── WebSocket (auth до upgrade — внутри registerWebSocket) ──────────── */

const { injectWebSocket } = registerWebSocket(app);

/* ── Старт ───────────────────────────────────────────────────────────── */

void connectRedis();

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`PhiloSynth server: http://localhost:${info.port}/api/v1/health`);
});

injectWebSocket(server);

/** Остановка: закрыть WS-подключения, сбросить idle keep-alive (иначе
 *  close() ждёт их до keepAliveTimeout), дождаться закрытия сервера,
 *  закрыть пул БД и Redis. Предохранитель на 10 с — на случай зависших
 *  соединений. */
async function shutdown(): Promise<never> {
  const failsafe = setTimeout(() => process.exit(1), 10_000);
  failsafe.unref();
  try {
    connectionManager.stopHeartbeat();
    connectionManager.closeAll();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
      // Node http.Server: без этого close() ждёт idle-соединения
      if ("closeIdleConnections" in server) {
        (server as { closeIdleConnections(): void }).closeIdleConnections();
      }
    });
    await closeDb();
    await closeRedis();
    process.exit(0);
  } catch {
    process.exit(1);
  }
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => void shutdown());
}
