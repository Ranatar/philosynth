/**
 * API уведомлений (беседа 16.2; 03 §2.19). Доставка — опросом
 * unread-count (без WebSocket, решение беседы); фразу собирает клиент
 * (notificationText) по type/payload — правило 14.2.
 */
import type {
  Notification,
  NotificationList,
  NotificationSettings,
} from "@philosynth/shared/types/notifications";

import { apiGet, apiPatch, apiPost } from "./client";

export interface NotificationListParams {
  unread?: boolean;
  limit?: number;
  cursor?: string | null;
}

export function listNotifications(params: NotificationListParams = {}): Promise<NotificationList> {
  const q = new URLSearchParams();
  if (params.unread) q.set("unread", "1");
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  const qs = q.toString();
  return apiGet<NotificationList>(`/notifications${qs ? `?${qs}` : ""}`);
}

export const getUnreadCount = (): Promise<{ unread: number }> => apiGet(`/notifications/unread-count`);

export const markNotificationRead = (id: string): Promise<Notification> => apiPost(`/notifications/${id}/read`);

export const markAllNotificationsRead = (): Promise<{ ok: true; marked: number }> => apiPost(`/notifications/read-all`);

export const getNotificationSettings = (): Promise<NotificationSettings> => apiGet(`/notifications/settings`);

export const updateNotificationSettings = (patch: Partial<NotificationSettings>): Promise<NotificationSettings> =>
  apiPatch(`/notifications/settings`, patch);
