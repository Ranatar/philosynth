/**
 * Роуты уведомлений (беседа 16.2, первый запрос; 03 §2.19).
 *
 *   GET    /notifications                 ?unread=1&limit&cursor → NotificationList
 *   GET    /notifications/unread-count                           → { unread }   (опрос колокольчика)
 *   POST   /notifications/read-all                               → { ok, marked }
 *   POST   /notifications/:id/read                               → Notification
 *   GET    /notifications/settings                               → NotificationSettings
 *   PATCH  /notifications/settings  { mutedCategories?, emailDigest? } → NotificationSettings
 *
 * Всё — только свои строки (user_id сессии); чужой id → 404. Доставка в
 * приложении — опросом unread-count (без WebSocket — решение беседы).
 * Фраза уведомления собирается КЛИЕНТОМ по type/payload (14.2); сервер
 * отдаёт код, ссылки и параметры.
 */
import { Hono } from "hono";
import type { Context } from "hono";

import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import {
  NotificationSettingsError,
  getSettings,
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
  updateSettings,
} from "../services/notifications.js";
import { isUuid, notFoundJson } from "./syntheses.js";
import { tl } from "@philosynth/shared/i18n/t";

export const notificationsRoutes = new Hono<AuthEnv>();

async function readJson(c: Context): Promise<Record<string, unknown> | Response> {
  try {
    const body = (await c.req.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body))
      return c.json({ error: tl("common.invalidData", "Невалидные данные"), code: "VALIDATION_ERROR" }, 400);
    return body as Record<string, unknown>;
  } catch {
    return c.json({ error: tl("common.invalidJson", "Невалидный JSON"), code: "VALIDATION_ERROR" }, 400);
  }
}

notificationsRoutes.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const q = c.req.query();
  const limit = q.limit ? Number.parseInt(q.limit, 10) : undefined;
  const cursor = q.cursor && isUuid(q.cursor) ? q.cursor : null;
  return c.json(
    await listNotifications(user.id, {
      unreadOnly: q.unread === "1" || q.unread === "true",
      ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
      cursor,
    }),
  );
});

notificationsRoutes.get("/unread-count", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ unread: await unreadCount(user.id) });
});

notificationsRoutes.post("/read-all", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ ok: true, marked: await markAllRead(user.id) });
});

notificationsRoutes.get("/settings", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json(await getSettings(user.id));
});

notificationsRoutes.patch("/settings", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  if (body instanceof Response) return body;
  try {
    return c.json(await updateSettings(user.id, body));
  } catch (err) {
    if (err instanceof NotificationSettingsError)
      return c.json({ error: err.message, code: "VALIDATION_ERROR", details: err.details }, 400);
    throw err;
  }
});

notificationsRoutes.post("/:id/read", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id") ?? "";
  if (!isUuid(id)) return c.json(notFoundJson, 404);
  const dto = await markRead(user.id, id);
  if (!dto) return c.json(notFoundJson, 404);
  return c.json(dto);
});
