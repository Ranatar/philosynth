/**
 * Менеджер WebSocket-подключений (беседа 0.2).
 *
 * - Подключения хранятся Map<userId, Set<WSContext>> — у одного пользователя
 *   может быть несколько вкладок/устройств одновременно (edge case протокола
 *   0.2: «два одновременных подключения — оба работают»).
 * - Heartbeat: ws-ping каждые 30 с по raw-сокету, безответные соединения
 *   закрываются (защита от полумёртвых TCP).
 * - Пер-соединенческий лимит входящих сообщений (03-spec §3.4:
 *   60 сообщений/мин) — скользящее окно в памяти процесса; при превышении
 *   отправляется { type: "error", code: "RATE_LIMIT", retryAfter }.
 *
 * Redis pub/sub для горизонтального масштабирования — Фаза 3
 * (01-architecture §7), сейчас процесс один.
 */
import type { WSContext } from "hono/ws";
import type { WebSocket as NodeWebSocket } from "ws";

import type { WsServerMessage } from "@philosynth/shared/types/ws-messages";

import { env } from "../env.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

interface MessageWindow {
  windowStart: number;
  count: number;
}

export class ConnectionManager {
  private byUser = new Map<string, Set<WSContext>>();
  private userOf = new WeakMap<WSContext, string>();
  private msgWindows = new WeakMap<WSContext, MessageWindow>();
  private alive = new WeakSet<WSContext>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /* ── Регистрация ───────────────────────────────────────────────────── */

  add(userId: string, ws: WSContext): void {
    let set = this.byUser.get(userId);
    if (!set) {
      set = new Set();
      this.byUser.set(userId, set);
    }
    set.add(ws);
    this.userOf.set(ws, userId);
    this.alive.add(ws);

    const raw = ws.raw as NodeWebSocket | undefined;
    raw?.on("pong", () => this.alive.add(ws));
  }

  remove(ws: WSContext): void {
    const userId = this.userOf.get(ws);
    if (userId === undefined) return;
    const set = this.byUser.get(userId);
    set?.delete(ws);
    if (set && set.size === 0) this.byUser.delete(userId);
    this.userOf.delete(ws);
  }

  userIdOf(ws: WSContext): string | undefined {
    return this.userOf.get(ws);
  }

  connectionCount(userId: string): number {
    return this.byUser.get(userId)?.size ?? 0;
  }

  totalConnections(): number {
    let n = 0;
    for (const set of this.byUser.values()) n += set.size;
    return n;
  }

  /* ── Отправка ──────────────────────────────────────────────────────── */

  send(ws: WSContext, message: WsServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      console.error(`[ws] ошибка отправки: ${(err as Error).message}`);
    }
  }

  /** Всем подключениям пользователя (все вкладки видят стрим). */
  sendToUser(userId: string, message: WsServerMessage): void {
    const set = this.byUser.get(userId);
    if (!set) return;
    const payload = JSON.stringify(message);
    for (const ws of set) {
      try {
        ws.send(payload);
      } catch (err) {
        console.error(`[ws] ошибка отправки: ${(err as Error).message}`);
      }
    }
  }

  /* ── Лимит входящих сообщений (03-spec §3.4) ───────────────────────── */

  /**
   * true — сообщение допущено; false — лимит превышен, клиенту уже
   * отправлен { type: "error", code: "RATE_LIMIT", retryAfter }.
   */
  allowMessage(ws: WSContext): boolean {
    const limit = env.rateLimit.wsMessagesPerMinute;
    const now = Date.now();
    let win = this.msgWindows.get(ws);
    if (!win || now - win.windowStart >= 60_000) {
      win = { windowStart: now, count: 0 };
      this.msgWindows.set(ws, win);
    }
    win.count += 1;
    if (win.count <= limit) return true;

    const retryAfter = Math.ceil((win.windowStart + 60_000 - now) / 1000);
    this.send(ws, { type: "error", code: "RATE_LIMIT", retryAfter });
    return false;
  }

  /* ── Heartbeat ─────────────────────────────────────────────────────── */

  startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      for (const set of this.byUser.values()) {
        for (const ws of set) {
          const raw = ws.raw as NodeWebSocket | undefined;
          if (!raw) continue;
          if (!this.alive.has(ws)) {
            raw.terminate(); // onClose снимет регистрацию
            continue;
          }
          this.alive.delete(ws);
          try {
            raw.ping();
          } catch {
            raw.terminate();
          }
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref();
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Закрытие всех подключений (graceful shutdown). */
  closeAll(code = 1001, reason = "server shutting down"): void {
    for (const set of this.byUser.values()) {
      for (const ws of set) {
        try {
          ws.close(code, reason);
        } catch {
          (ws.raw as NodeWebSocket | undefined)?.terminate();
        }
      }
    }
    this.byUser.clear();
  }
}

export const connectionManager = new ConnectionManager();
