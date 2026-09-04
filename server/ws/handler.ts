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
 * Беседа 1.4b: resume_generation / resume_plan → pause-resume-service
 * (импорт которого регистрирует провайдер estimates для generation_paused).
 * Остальные операции (start_regen, execute_plan, …) — заглушки до
 * бесед 2.2 / 4.1.
 * Reconnect-протокол §3.3 (?resume= + stream_state в Redis) — запрос 6
 * беседы 1.4.
 * Беседа 5.3: start_enrichment → startEnrichment (element-enrichment);
 * enrichment_delta/enrichment_done шлёт сервис по userId; ошибки —
 * stream_error с sectionKey "enrich:{elementType}:{elementId}".
 */
import { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import type { UpgradeWebSocket, WSContext } from "hono/ws";

import type {
  ResumeGenerationMode,
  ResumePlanMode,
  WsClientMessage,
} from "@philosynth/shared/types/ws-messages";

import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { isUuid } from "../routes/syntheses.js";
import { syntheses } from "../db/schema.js";
import {
  getSessionToken,
  validateSessionToken,
  type AuthEnv,
  type AuthUser,
} from "../middleware/auth.js";
import {
  GenerationError,
  cancelGeneration,
  generateSynthesis,
  isGenerationActive,
  startSectionRegeneration,
  startSubsectionRegeneration,
} from "../services/generation-service.js";
// Импорт plan-executor регистрирует resume-разъём в pause-resume-service
// (побочный эффект — образец провайдера оценок 1.4b)
import { confirmStep, executePlan } from "../services/plan-executor.js";
import { startMode } from "../services/mode-service.js";
import {
  enrichmentStreamKey,
  startEnrichment,
} from "../services/element-enrichment.js";
import { PlanError } from "../services/edit-planner.js";
import {
  computePauseEstimates,
  PauseResumeError,
  resumeGeneration,
  resumePlan,
} from "../services/pause-resume-service.js";
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
  "start_enrichment",
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
 *
 * Беседа 1.6 (пункт 5): режим «только подписка» — viewOnly=true.
 * Страница просмотра (1.6b) подписывается на события, НЕ запуская
 * generateSynthesis при status='generating' без активного прогона
 * (иначе открытие страницы перезапускало бы генерацию). События
 * активного прогона доходят и так — по userId.
 */
async function handleSubscribeGeneration(
  ws: WSContext,
  user: AuthUser,
  synthesisId: string,
  viewOnly = false,
): Promise<void> {
  if (isGenerationActive(synthesisId)) return; // уже подписан по userId

  // Тот же дефект, что в handleResume (2026-09-02): id приходит из URL
  // страницы и может не быть uuid — сравнение с колонкой uuid валило
  // обработчик. Отвечаем как на несуществующий синтез.
  if (!isUuid(synthesisId)) {
    connectionManager.send(ws, {
      type: "stream_error",
      synthesisId,
      error: "Синтез не найден",
      recoverable: false,
    });
    return;
  }

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

  if (viewOnly) {
    // Беседа 1.6: только подписка — generateSynthesis НЕ запускается.
    // Если активный прогон есть, его события уже доставляются по userId;
    // если нет (строка зависла в 'generating') — просмотр не должен его
    // воскрешать, это делает штатный subscribe_generation без флага.
    console.log(
      `[ws] user=${user.id}: subscribe_generation ${synthesisId} viewOnly — ` +
        `подписка без запуска генерации`,
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
  // ДЕФЕКТ, найден браузерным тестом 0.4/2 (2026-09-02): ?resume= несёт
  // произвольную строку из URL страницы (/synthesis/<что угодно>), а
  // запрос ниже сравнивает её с колонкой uuid — PostgresError «invalid
  // input syntax for type uuid» валил обработчик и уводил весь сервер,
  // после чего ЛЮБОЙ запрос отвечал 500 и клиент разлогинивался.
  // Семантика та же, что строкой ниже: несуществующий — молча.
  if (!isUuid(synthesisId)) return;
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
        estimates: await computePauseEstimates(synthesisId, ps),
      });
    }
  }
}

/**
 * resume_generation / resume_plan (беседа 1.4b, 03-spec §3.1): действия
 * возобновления. generation_resumed шлёт сам pause-resume-service после
 * валидации; ошибки (RESUME_INVALID и др., §4.3) → stream_error
 * recoverable:false с кодом в тексте.
 */
async function handleResumeGeneration(
  ws: WSContext,
  user: AuthUser,
  synthesisId: string,
  mode: ResumeGenerationMode,
): Promise<void> {
  try {
    await resumeGeneration(synthesisId, user.id, mode);
  } catch (err) {
    const message =
      err instanceof PauseResumeError || err instanceof GenerationError
        ? `${err.code}: ${err.message}`
        : err instanceof Error
          ? err.message
          : "Не удалось возобновить генерацию";
    console.error(`[ws] resumeGeneration(${synthesisId}, ${mode}):`, err);
    connectionManager.send(ws, {
      type: "stream_error",
      synthesisId,
      error: message,
      recoverable: false,
    });
  }
}

async function handleResumePlan(
  ws: WSContext,
  user: AuthUser,
  synthesisId: string,
  planId: string,
  mode: ResumePlanMode,
): Promise<void> {
  try {
    await resumePlan(synthesisId, planId, user.id, mode);
  } catch (err) {
    const message =
      err instanceof PauseResumeError || err instanceof GenerationError
        ? `${err.code}: ${err.message}`
        : err instanceof Error
          ? err.message
          : "Не удалось возобновить план";
    console.error(`[ws] resumePlan(${synthesisId}, ${mode}):`, err);
    connectionManager.send(ws, {
      type: "stream_error",
      synthesisId,
      error: message,
      recoverable: false,
    });
  }
}

function handleMessage(ws: WSContext, user: AuthUser, msg: WsClientMessage): void {
  switch (msg.type) {
    case "ping":
      connectionManager.send(ws, { type: "pong" });
      return;

    case "subscribe_generation":
      void handleSubscribeGeneration(
        ws,
        user,
        msg.synthesisId,
        msg.viewOnly === true,
      );
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

    // Возобновление паузы (беседа 1.4b, 01-arch §4.12)
    case "resume_generation":
      void handleResumeGeneration(ws, user, msg.synthesisId, msg.mode);
      return;

    case "resume_plan":
      void handleResumePlan(ws, user, msg.synthesisId, msg.planId, msg.mode);
      return;

    // Регенерация и планы — беседа 2.2 (generation-service, plan-executor)
    case "start_regen":
      void handleBackground(
        ws, user, msg.synthesisId, undefined,
        () => startSectionRegeneration(
          msg.synthesisId, user.id, msg.sectionKey, msg.context ?? null,
        ),
      );
      return;

    case "start_sub_regen":
      void handleBackground(
        ws, user, msg.synthesisId, msg.sectionKey,
        () => startSubsectionRegeneration(
          msg.synthesisId, user.id, msg.sectionKey, msg.subsectionName,
          {
            ...(msg.userNote !== undefined ? { userNote: msg.userNote } : {}),
            ...(msg.includeCurrentContent !== undefined
              ? { includeCurrentContent: msg.includeCurrentContent }
              : {}),
          },
        ),
      );
      return;

    case "execute_plan":
      void handleBackground(
        ws, user, msg.synthesisId, undefined,
        () => executePlan(msg.synthesisId, msg.planId, user.id),
      );
      return;

    case "confirm_step":
      // synthesisId в WsConfirmStep нет — confirmStep вернёт его из плана
      void (async () => {
        try {
          await confirmStep(msg.planId, msg.stepIndex, user.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[ws] confirm_step(${msg.planId}):`, err);
          connectionManager.send(ws, {
            type: "stream_error",
            synthesisId: "",
            error: message,
            recoverable: err instanceof PlanError,
          });
        }
      })();
      return;

    // Режимы — беседа 4.1 (mode-service). sectionKey ошибки —
    // "mode:{modeKey}" (тот же ключ, что у stream_delta режима)
    case "start_mode":
      void handleBackground(
        ws, user, msg.synthesisId, `mode:${msg.modeKey}`,
        () => startMode(msg.synthesisId, user.id, msg.modeKey, msg.param),
      );
      return;

    // Обогащение элемента — беседа 5.3 (element-enrichment). Владелец
    // проверяется явно (паритет ownerEditGate роута §2.14): слот сам
    // владение не проверяет. 409 при активной операции даёт слот →
    // stream_error (идемпотентность п.5 03 §3.1).
    case "start_enrichment":
      void handleBackground(
        ws, user, msg.synthesisId,
        enrichmentStreamKey(msg.elementType, msg.elementId),
        async () => {
          if (msg.elementType !== "category" && msg.elementType !== "edge")
            throw new GenerationError("VALIDATION_ERROR", "elementType: ожидается category | edge");
          if (!isUuid(msg.synthesisId) || !isUuid(msg.elementId))
            throw new GenerationError("NOT_FOUND", "Синтез или элемент не найден");
          const [row] = await db
            .select({ userId: syntheses.userId })
            .from(syntheses)
            .where(eq(syntheses.id, msg.synthesisId))
            .limit(1);
          if (!row) throw new GenerationError("NOT_FOUND", "Синтез не найден");
          if (row.userId !== user.id)
            throw new GenerationError("FORBIDDEN", "Нет доступа к синтезу");
          await startEnrichment(
            msg.synthesisId, user.id, msg.elementType, msg.elementId, msg.enrichmentType,
          );
        },
      );
      return;
  }
}

/**
 * Общий фоновой запуск операций 2.2: ошибки ДО начала стрима (гейты
 * PlanError/GenerationError и пр.) — stream_error клиенту; ошибки стрима
 * внутри start*-обёрток уже обработаны (stream_error/пауза плана).
 */
async function handleBackground(
  ws: WSContext,
  user: AuthUser,
  synthesisId: string,
  sectionKey: string | undefined,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ws] user=${user.id} synthesis=${synthesisId}:`, err);
    connectionManager.send(ws, {
      type: "stream_error",
      synthesisId,
      ...(sectionKey !== undefined ? { sectionKey } : {}),
      error: message,
      recoverable: false,
    });
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
