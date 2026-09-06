/**
 * Админ-роуты Prompt Registry (беседа 6.1; 03-spec §2.9 Prompts + Configs).
 * Модуль числился в 05 с беседы 0.3, но до 6.1 не создавался никем
 * (NEXT-CONTEXT «Найдено в Фазах 4–6» п.1). Потребитель — AdminPromptsPage
 * (6.2, client/api/prompts.ts).
 *
 *   GET  /prompts                  ?prefix=method.&activeOnly=true → { templates }
 *   GET  /prompts/:key/versions    → { versions: PromptVersion[] }
 *   POST /prompts/:key             { body, description? } → { template } (черновик)
 *   POST /prompts/:key/activate    { version } → { template }
 *   GET  /configs                  ?activeOnly=true → { configs }
 *   PUT  /configs/:key             { value, description? } → { config } (черновик)
 *   GET  /configs/:key/versions    → { versions }
 *   POST /configs/:key/activate    { version } → { config }
 *
 * Все — requireAuth + requireAdmin (0.2). Активация сбрасывает кэш
 * реестра (prompt_cache и config_cache — иначе генерация продолжит
 * брать старый шаблон). Ключи содержат точки (`method.dialectical.graph`) —
 * параметр :key в Hono точку пропускает; допустимые символы ключа —
 * [A-Za-z0-9._:-], иначе 400. Пустое body шаблона → 400; value конфига —
 * любой JSON, кроме undefined. Монтирование — /api/v1 (index.ts).
 */
import { Hono } from "hono";
import type { Context } from "hono";

import { requireAdmin } from "../middleware/admin-only.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  activateConfigVersion,
  activateVersion,
  createConfigVersion,
  createVersion,
  listConfigs,
  listConfigVersions,
  listTemplates,
  listVersions,
  RegistryNotFoundError,
} from "../services/prompt-registry.js";

export const promptsRoutes = new Hono<AuthEnv>();

promptsRoutes.use("/prompts/*", requireAuth, requireAdmin);
promptsRoutes.use("/prompts", requireAuth, requireAdmin);
promptsRoutes.use("/configs/*", requireAuth, requireAdmin);
promptsRoutes.use("/configs", requireAuth, requireAdmin);

const KEY_RE = /^[A-Za-z0-9._:-]{1,200}$/;

function badKey(c: Context<AuthEnv>): Response {
  return c.json(
    { error: "Невалидный ключ", code: "VALIDATION_ERROR", details: { key: "допустимы [A-Za-z0-9._:-]" } },
    400,
  );
}

async function readJson(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseVersion(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/* ── Шаблоны ─────────────────────────────────────────────────────────── */

promptsRoutes.get("/prompts", async (c) => {
  const prefix = c.req.query("prefix") ?? undefined;
  const activeOnly = c.req.query("activeOnly") !== "false";
  const templates = await listTemplates({ prefix, activeOnly });
  return c.json({ templates });
});

promptsRoutes.get("/prompts/:key/versions", async (c) => {
  const key = c.req.param("key");
  if (!KEY_RE.test(key)) return badKey(c);
  try {
    return c.json({ versions: await listVersions(key) });
  } catch (err) {
    if (err instanceof RegistryNotFoundError)
      return c.json({ error: err.message, code: "NOT_FOUND" }, 404);
    throw err;
  }
});

promptsRoutes.post("/prompts/:key", async (c) => {
  const key = c.req.param("key");
  if (!KEY_RE.test(key)) return badKey(c);
  const body = await readJson(c);
  if (typeof body.body !== "string" || !body.body.trim()) {
    return c.json(
      { error: "Тело шаблона пусто", code: "VALIDATION_ERROR", details: { body: "непустая строка" } },
      400,
    );
  }
  const description = typeof body.description === "string" ? body.description : "";
  const user = c.get("user");
  const template = await createVersion(key, body.body, description, user.id);
  return c.json({ template }, 201);
});

promptsRoutes.post("/prompts/:key/activate", async (c) => {
  const key = c.req.param("key");
  if (!KEY_RE.test(key)) return badKey(c);
  const body = await readJson(c);
  const version = parseVersion(body.version);
  if (version === null) {
    return c.json(
      { error: "version не задан", code: "VALIDATION_ERROR", details: { version: "целое ≥ 1" } },
      400,
    );
  }
  try {
    return c.json({ template: await activateVersion(key, version) });
  } catch (err) {
    if (err instanceof RegistryNotFoundError)
      return c.json({ error: err.message, code: "NOT_FOUND" }, 404);
    throw err;
  }
});

/* ── Конфиги ─────────────────────────────────────────────────────────── */

promptsRoutes.get("/configs", async (c) => {
  const activeOnly = c.req.query("activeOnly") !== "false";
  return c.json({ configs: await listConfigs(activeOnly) });
});

promptsRoutes.get("/configs/:key/versions", async (c) => {
  const key = c.req.param("key");
  if (!KEY_RE.test(key)) return badKey(c);
  try {
    return c.json({ versions: await listConfigVersions(key) });
  } catch (err) {
    if (err instanceof RegistryNotFoundError)
      return c.json({ error: err.message, code: "NOT_FOUND" }, 404);
    throw err;
  }
});

promptsRoutes.put("/configs/:key", async (c) => {
  const key = c.req.param("key");
  if (!KEY_RE.test(key)) return badKey(c);
  const body = await readJson(c);
  if (!("value" in body) || body.value === undefined) {
    return c.json(
      { error: "value не задано", code: "VALIDATION_ERROR", details: { value: "JSON-значение конфига" } },
      400,
    );
  }
  const description = typeof body.description === "string" ? body.description : "";
  const config = await createConfigVersion(key, body.value, description);
  return c.json({ config }, 201);
});

promptsRoutes.post("/configs/:key/activate", async (c) => {
  const key = c.req.param("key");
  if (!KEY_RE.test(key)) return badKey(c);
  const body = await readJson(c);
  const version = parseVersion(body.version);
  if (version === null) {
    return c.json(
      { error: "version не задан", code: "VALIDATION_ERROR", details: { version: "целое ≥ 1" } },
      400,
    );
  }
  try {
    return c.json({ config: await activateConfigVersion(key, version) });
  } catch (err) {
    if (err instanceof RegistryNotFoundError)
      return c.json({ error: err.message, code: "NOT_FOUND" }, 404);
    throw err;
  }
});
