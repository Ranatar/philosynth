/**
 * WebSocket-обработчик (беседа 0.2). Endpoint — 03-spec §3:
 *   GET /ws?token={sessionToken}   (fallback — session-cookie)
 *
 * - Auth ДО upgrade: невалидный/отсутствующий токен → HTTP 401, апгрейда нет.
 * - ping → pong (§3.1/§3.2); лимит сообщений §3.4 — в connection-manager.
 * - Невалидный JSON и неизвестные типы: соединение НЕ рвётся, ошибка
 *   логируется (тест протокола 0.2).
 * - Типизация сообщений — shared/types/ws-messages.ts (WsClientMessage /
 *   WsServerMessage), единая для клиента и сервера.
 *
 * Диспетчеризация операций (subscribe_generation, start_regen, …) —
 * заглушки до бесед 1.4+ (streaming-manager / generation-service):
 * тип распознаётся, но операция пока не исполняется.
 * Reconnect-протокол §3.3 (?resume= + stream_state в Redis) — беседа 1.4.
 */
import { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import type { UpgradeWebSocket, WSContext } from "hono/ws";

import type { WsClientMessage } from "@philosynth/shared/types/ws-messages";

import {
  getSessionToken,
  validateSessionToken,
  type AuthEnv,
  type AuthUser,
} from "../middleware/auth.js";
import { connectionManager } from "./connection-manager.js";

/** Типы клиентских сообщений (валидация до диспетчеризации). */
const CLIENT_MESSAGE_TYPES: ReadonlySet<WsClientMessage["type"]> = new Set([
  "subscribe_generation",
  "start_regen",
  "start_sub_regen",
  "start_mode",
  "execute_plan",
  "confirm_step",
  "resume_generation",
  "resume_plan",
  "cancel",
  "ping",
] satisfies WsClientMessage["type"][]);

function parseClientMessage(data: unknown): WsClientMessage | null {
  if (typeof data !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !CLIENT_MESSAGE_TYPES.has((parsed as { type?: unknown }).type as never)
  ) {
    return null;
  }
  return parsed as WsClientMessage;
}

function handleMessage(ws: WSContext, user: AuthUser, msg: WsClientMessage): void {
  switch (msg.type) {
    case "ping":
      connectionManager.send(ws, { type: "pong" });
      return;

    // Операции генерации/планов — беседы 1.4+ (streaming-manager,
    // generation-service, plan-executor, pause-resume-service)
    case "subscribe_generation":
    case "start_regen":
    case "start_sub_regen":
    case "start_mode":
    case "execute_plan":
    case "confirm_step":
    case "resume_generation":
    case "resume_plan":
    case "cancel":
      console.warn(
        `[ws] user=${user.id}: тип "${msg.type}" ещё не реализован (беседы 1.4+)`,
      );
      return;
  }
}

/**
 * Регистрирует GET /ws на приложении.
 * Возвращает injectWebSocket — вызвать с http-сервером после serve().
 */
export function registerWebSocket(app: Hono<AuthEnv>): {
  injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"];
} {
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({
    app: app as unknown as Parameters<typeof createNodeWebSocket>[0]["app"],
  }) as {
    injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"];
    upgradeWebSocket: UpgradeWebSocket;
  };

  const wsRoute = upgradeWebSocket((c) => {
    // requireWsAuth (ниже) гарантирует наличие user к этому моменту
    const user = (c as unknown as { get(k: "user"): AuthUser }).get("user");

    return {
      onOpen(_evt, ws) {
        connectionManager.add(user.id, ws);
        connectionManager.startHeartbeat();
        console.log(
          `[ws] подключение user=${user.id} (соединений: ${connectionManager.connectionCount(user.id)})`,
        );
      },

      onMessage(evt, ws) {
        if (!connectionManager.allowMessage(ws)) return; // RATE_LIMIT уже отправлен

        const msg = parseClientMessage(evt.data);
        if (!msg) {
          // Соединение не рвём — только лог
          console.warn(`[ws] user=${user.id}: невалидное сообщение проигнорировано`);
          return;
        }
        handleMessage(ws, user, msg);
      },

      onClose(_evt, ws) {
        connectionManager.remove(ws);
        console.log(`[ws] отключение user=${user.id}`);
      },

      onError(evt, ws) {
        console.error(`[ws] ошибка соединения user=${user.id}:`, evt);
        connectionManager.remove(ws);
      },
    };
  });

  // Auth ДО upgrade: обычный HTTP-ответ вместо апгрейда при невалидном токене
  app.get("/ws", async (c, next) => {
    const token = c.req.query("token") ?? getSessionToken(c);
    const result = token ? await validateSessionToken(token) : null;
    if (!result) {
      return c.json(
        { error: "Требуется авторизация", code: "AUTH_REQUIRED" },
        401,
      );
    }
    c.set("user", result.user);
    c.set("session", result.session);
    return wsRoute(c, next);
  });

  return { injectWebSocket };
}
