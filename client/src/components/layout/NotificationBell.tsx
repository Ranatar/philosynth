/**
 * Колокольчик уведомлений в шапке (беседа 16.2, первый запрос, п. 4).
 *
 *  - число непрочитанных — ОПРОСОМ GET /notifications/unread-count раз в
 *    POLL_MS (без WebSocket — решение беседы); опрос только у вошедшего и
 *    только пока вкладка видима (document.visibilityState) — иначе
 *    фоновые вкладки молотили бы сервер;
 *  - клик — выпадающий список последних уведомлений (GET /notifications),
 *    непрочитанные выделены; клик по строке помечает прочитанным и ведёт
 *    по ссылке (приглашение — на страницу принятия, прочее — к концепции);
 *  - «Прочитать всё» — POST /read-all; «Ещё» — следующая страница курсором;
 *  - клик мимо списка закрывает его (mousedown на document, как
 *    useSecondStep).
 * Классы — блок «Беседа 16.2» в globals.css (.notif-*), палитра закрытая.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Notification } from "@philosynth/shared/types/notifications";
import { tl } from "@philosynth/shared/i18n/t";

import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../api/notifications";
import { notificationLink, notificationText } from "../../utils/notification-text";

export const NOTIFICATIONS_POLL_MS = 30_000;
const PAGE = 20;

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return tl("notificationBell.justNow", "только что");
  if (min < 60) return tl("notificationBell.minutesAgo", "{n} мин назад", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return tl("notificationBell.hoursAgo", "{n} ч назад", { n: h });
  return new Date(iso).toLocaleDateString();
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [unread, setUnread] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const r = await getUnreadCount();
      setUnread(r.unread);
    } catch {
      /* сеть/сессия — счётчик просто не обновится; 401 обрабатывает api/client */
    }
  }, []);

  useEffect(() => {
    void poll();
    const t = setInterval(() => void poll(), NOTIFICATIONS_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  // клик мимо — закрыть
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      const el = rootRef.current;
      if (el && ev.target instanceof Node && !el.contains(ev.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const load = useCallback(async (next: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const r = await listNotifications({ limit: PAGE, cursor: next });
      setItems((prev) => (next ? [...prev, ...r.items] : r.items));
      setCursor(r.nextCursor);
      setUnread(r.unread);
    } catch {
      setError(tl("notificationBell.loadFailed", "Не удалось загрузить уведомления."));
    } finally {
      setLoading(false);
    }
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void load(null);
  }

  async function onItemClick(n: Notification) {
    if (!n.readAt) {
      try {
        const updated = await markNotificationRead(n.id);
        setItems((prev) => prev.map((it) => (it.id === n.id ? updated : it)));
        setUnread((u) => (u === null ? u : Math.max(0, u - 1)));
      } catch {
        /* переход всё равно */
      }
    }
    setOpen(false);
    navigate(notificationLink(n));
  }

  async function onReadAll() {
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((prev) => prev.map((it) => (it.readAt ? it : { ...it, readAt: now })));
      setUnread(0);
    } catch {
      setError(tl("notificationBell.readAllFailed", "Не удалось пометить прочитанным."));
    }
  }

  const count = unread ?? 0;
  return (
    <div className="notif-root" ref={rootRef} data-testid="notification-bell">
      <button
        type="button"
        className="app-topbar-btn notif-btn"
        onClick={toggle}
        aria-label={tl("notificationBell.ariaLabel", "Уведомления")}
        aria-expanded={open}
        title={tl("notificationBell.ariaLabel", "Уведомления")}
        data-testid="notification-toggle"
      >
        <span aria-hidden="true">🔔</span>
        {count > 0 && (
          <span className="notif-count" data-testid="notification-count">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <div className="notif-dropdown" role="dialog" data-testid="notification-list">
          <div className="notif-head">
            <span className="notif-title">{tl("notificationBell.title", "Уведомления")}</span>
            <button type="button" className="action-btn" onClick={() => void onReadAll()} disabled={count === 0} data-testid="notification-read-all">
              {tl("notificationBell.readAll", "Прочитать всё")}
            </button>
          </div>
          {error && (
            <div className="callout warning" style={{ margin: 8 }}>
              {error}
            </div>
          )}
          {items.length === 0 && !loading && !error && (
            <p className="notif-empty" data-testid="notification-empty">
              {tl("notificationBell.empty", "Уведомлений нет")}
            </p>
          )}
          <ul className="notif-list">
            {items.map((n) => (
              <li key={n.id} className={n.readAt ? "notif-item" : "notif-item unread"} data-testid="notification-item" data-type={n.type} data-read={n.readAt ? "1" : "0"}>
                <button type="button" className="notif-item-btn" onClick={() => void onItemClick(n)}>
                  <span className="notif-text">{notificationText(n)}</span>
                  <span className="notif-time">{timeAgo(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
          {cursor && (
            <div className="notif-foot">
              <button type="button" className="action-btn" disabled={loading} onClick={() => void load(cursor)} data-testid="notification-more">
                {loading ? tl("common.loading", "Загрузка…") : tl("notificationBell.more", "Ещё")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
