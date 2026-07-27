/**
 * Проверка role === 'admin' (беседа 0.2; файл по 05-file-structure).
 * Применяется ПОСЛЕ requireAuth (нужен c.get("user")); потребители —
 * админ-роуты Prompt Registry (беседа 0.3, 03-spec §2.9).
 */
import type { MiddlewareHandler } from "hono";

import type { AuthEnv } from "./auth.js";

/** role === 'admin' → дальше; иначе 403 FORBIDDEN (03-spec §4.3). */
export const requireAdmin: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const user = c.get("user");
  if (!user || user.role !== "admin") {
    return c.json(
      { error: "Требуются права администратора", code: "FORBIDDEN" },
      403,
    );
  }
  await next();
};
