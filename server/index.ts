import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env.js";
import { closeDb } from "./db/index.js";

const app = new Hono();

// ── Middleware ────────────────────────────────────────
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);

// ── Health check ─────────────────────────────────────
app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() }),
);

// ── Routes placeholder ──────────────────────────────
// TODO: auth, syntheses, sections, elements, generation, plans,
//       modes, lineage, prompts, billing, export, import, logs

// ── Start server ────────────────────────────────────
const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`🏛️  PhiloSynth Service running on http://localhost:${info.port}`);
});

// ── Graceful shutdown ───────────────────────────────
function shutdown() {
  console.log("\nShutting down...");
  closeDb().then(() => {
    server.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export default app;
