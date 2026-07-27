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
 * Беседа 1.4: subscribe_generation → запуск/подписка generateSynthesis
 * (generation-service), cancel → cancelGeneration (user-abort §3.1).
 * Остальные операции (start_regen, resume_*, execute_plan, …) — заглушки
 * до бесед 1.4b / 2.2 / 4.1.
 * Reconnect-протокол §3.3 (?resume= + stream_state в Redis) — запрос 6
 * беседы 1.4.
 */
import { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import type { UpgradeWebSocket, WSContext } from "hono/ws";

import type { WsClientMessage } from "@philosynth/shared/types/ws-messages";

import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { syntheses } from "../db/schema.js";
import {
  getSessionToken,
  validateSessionToken,
  type AuthEnv,
  type AuthUser,
} from "../middleware/auth.js";
import {
  cancelGeneration,
  generateSynthesis,
  GenerationError,
  isGenerationActive,
} from "../services/generation-service.js";
import { connectionManager } from "./connection-manager.js";
import { getStreamState } from "./stream-state.js";

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

/**
 * subscribe_generation (беседа 1.4, 03-spec §3.1): подписка на стрим
 * синтеза. WS-сессия — «канал доставки», привязка дельт идёт по userId
 * (connectionManager.sendToUser), поэтому:
 *  - генерация уже активна → просто подписан (дельты уже летят);
 *  - синтез в статусе 'generating' без активного цикла (запуск после
 *    POST /syntheses, запрос 2; или рестарт сервера) → запуск
 *    generateSynthesis в фоне;
 *  - остальные статусы → подписка «вхолостую» (ready — стримить нечего;
 *    paused — возобновление через resume_generation, беседа 1.4b).
 * Доставка накопленного htmlSoFar при reconnect (?resume=, §3.3) —
 * запрос 6 этой беседы.
 */
async function handleSubscribeGeneration(
  ws: WSContext,
  user: AuthUser,
  synthesisId: string,
): Promise<void> {
  if (isGenerationActive(synthesisId)) return; // уже подписан по userId

  const [row] = await db
    .select({ userId: syntheses.userId, status: syntheses.status })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  if (!row) {
    connectionManager.send(ws, {
      type: "stream_error",
      synthesisId,
      error: "Синтез не найден",
      recoverable: false,
    });
    return;
  }
  if (row.userId !== user.id) {
    connectionManager.send(ws, {
      type: "stream_error",
      synthesisId,
      error: "Нет доступа к синтезу",
      recoverable: false,
    });
    return;
  }
  if (row.status !== "generating") {
    console.log(
      `[ws] user=${user.id}: subscribe_generation ${synthesisId} в статусе ` +
        `"${row.status}" — стрим не запускается`,
    );
    return;
  }

  try {
    await generateSynthesis(synthesisId, user.id);
  } catch (err) {
    if (err instanceof GenerationError && err.code === "GENERATION_IN_PROGRESS") {
      return; // гонка двух subscribe — второй просто подписан
    }
    const message =
      err instanceof Error ? err.message : "Не удалось запустить генерацию";
    console.error(`[ws] generateSynthesis(${synthesisId}):`, err);
    connectionManager.send(ws, {
      type: "stream_error",
      synthesisId,
      error: message,
      recoverable: false,
    });
  }
}

/**
 * Reconnect §3.3 (беседа 1.4): при подключении с ?resume={synthesisId}
 * сервер смотрит stream_state:{synthesisId} в Redis:
 *  - активный буфер есть → { type: "resume", sectionKey, htmlSoFar,
 *    charsSoFar }, дальше живые дельты идут штатно (по userId);
 *  - буфера нет, генерация завершилась пока клиент был отключён →
 *    финальные данные: status='ready' → generation_complete,
 *    status='paused' → generation_paused из pausedState.
 */
async function handleResume(
  ws: WSContext,
  user: AuthUser,
  synthesisId: string,
): Promise<void> {
  const [row] = await db
    .select({
      userId: syntheses.userId,
      status: syntheses.status,
      pausedState: syntheses.pausedState,
      totalInputTokens: syntheses.totalInputTokens,
      totalOutputTokens: syntheses.totalOutputTokens,
      totalCostUsd: syntheses.totalCostUsd,
    })
    .from(syntheses)
    .where(eq(syntheses.id, synthesisId))
    .limit(1);
  if (!row || row.userId !== user.id) return; // чужой/несуществующий — молча

  const state = await getStreamState(synthesisId);
  if (state) {
    connectionManager.send(ws, {
      type: "resume",
      sectionKey: state.sectionKey,
      htmlSoFar: state.htmlSoFar,
      charsSoFar: state.charsSoFar,
    });
    return; // продолжение стрима придёт живыми stream_delta
  }

  if (row.status === "ready") {
    connectionManager.send(ws, {
      type: "generation_complete",
      synthesisId,
      totalUsage: {
        inputTokens: row.totalInputTokens,
        outputTokens: row.totalOutputTokens,
        costUsd: Number.parseFloat(row.totalCostUsd ?? "0") || 0,
      },
    });
    return;
  }
  if (row.status === "paused" && row.pausedState) {
    const ps = row.pausedState;
    if (ps.kind === "gen" && ps.reasonKind !== "user-abort") {
      connectionManager.send(ws, {
        type: "generation_paused",
        synthesisId,
        kind: "gen",
        reasonKind: ps.reasonKind,
        reason: ps.reason,
        isPartial: ps.isPartial,
        partialSubsections: ps.partialSubsections,
        expectedSubsections: ps.expectedSubsections,
        estimates: {}, // _computeGenPauseEstimates — беседа 1.4b
      });
    }
  }
}

function handleMessage(ws: WSContext, user: AuthUser, msg: WsClientMessage): void {
  switch (msg.type) {
    case "ping":
      connectionManager.send(ws, { type: "pong" });
      return;

    case "subscribe_generation":
      void handleSubscribeGeneration(ws, user, msg.synthesisId);
      return;

    case "cancel": {
      // §3.1: user-abort — pausedState не создаётся, частичный результат
      // финализируется по правилам stop (внутри generation-service)
      const cancelled = cancelGeneration(msg.synthesisId, user.id);
      if (!cancelled) {
        console.warn(
          `[ws] user=${user.id}: cancel ${msg.synthesisId} — активной генерации нет`,
        );
      }
      return;
    }

    // Операции регенерации/планов/возобновления — беседы 1.4b, 2.2, 4.1
    // (pause-resume-service, regeneration-service, plan-executor)
    case "start_regen":
    case "start_sub_regen":
    case "start_mode":
    case "execute_plan":
    case "confirm_step":
    case "resume_generation":
    case "resume_plan":
      console.warn(
        `[ws] user=${user.id}: тип "${msg.type}" ещё не реализован (беседы 1.4b+)`,
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
    const resumeId = c.req.query("resume"); // §3.3

    return {
      onOpen(_evt, ws) {
        connectionManager.add(user.id, ws);
        connectionManager.startHeartbeat();
        console.log(
          `[ws] подключение user=${user.id} (соединений: ${connectionManager.connectionCount(user.id)})`,
        );
        if (resumeId) void handleResume(ws, user, resumeId);
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
