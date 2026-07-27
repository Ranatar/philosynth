/**
 * WebSocket-хук с reconnect. Беседа 0.4 (завершение: беседы 1.4/1.5
 * ждут этот файл «из 0.4» по протоколу 07).
 *
 * Контракты: shared/types/ws-messages.ts (WsClientMessage/WsServerMessage),
 * серверный обработчик server/ws/handler.ts (0.2): GET /ws, auth по
 * session-cookie (или ?token=), ping→pong; операции — заглушки до 1.4.
 *
 * Инфраструктурный слой: подключение, реконнект с экспоненциальной
 * задержкой, keep-alive ping (§3.4: 60 сообщ/мин — ping раз в 25 с
 * заведомо в лимите), типизированные send/подписка. Бизнес-логика
 * (подписка на генерацию, обработка дельт) — хуки бесед 1.4/1.5
 * (useStreamingGeneration) ПОВЕРХ этого.
 *
 * Reconnect-протокол §3.3 (?resume={synthesisId} + stream_state) —
 * беседа 1.4: параметр resume принимается уже сейчас (опция url).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  WsClientMessage,
  WsServerMessage,
} from "@philosynth/shared/types/ws-messages";

export type WsStatus = "connecting" | "open" | "closed";

export interface UseWebSocketOptions {
  /** URL соединения; по умолчанию same-origin /ws (dev-прокси Vite → :3000) */
  url?: string | undefined;
  /** Автоподключение при монтировании (по умолчанию true) */
  autoConnect?: boolean | undefined;
  /** Обработчик входящих сообщений сервера */
  onMessage?: ((msg: WsServerMessage) => void) | undefined;
  /** Максимум попыток реконнекта подряд (по умолчанию 8) */
  maxRetries?: number | undefined;
}

export interface UseWebSocketResult {
  status: WsStatus;
  /** Отправка типизированного сообщения; false — сокет не открыт */
  send: (msg: WsClientMessage) => boolean;
  /** Ручное подключение (если autoConnect=false или после close) */
  connect: () => void;
  /** Закрыть намеренно (реконнект не запускается) */
  close: () => void;
  /** Номер текущей попытки реконнекта (0 — соединение штатное) */
  retryCount: number;
}

const PING_INTERVAL_MS = 25_000;
/** Задержки реконнекта; хвост повторяется до maxRetries */
const RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000, 15_000];

function defaultUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

export function useWebSocket(
  options: UseWebSocketOptions = {},
): UseWebSocketResult {
  const { url, autoConnect = true, onMessage, maxRetries = 8 } = options;

  const [status, setStatus] = useState<WsStatus>("closed");
  const [retryCount, setRetryCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const closedByUserRef = useRef(false);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Свежий onMessage без пересоздания соединения при каждом рендере
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const clearTimers = useCallback(() => {
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    pingTimerRef.current = null;
    retryTimerRef.current = null;
  }, []);

  const connect = useCallback(() => {
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    closedByUserRef.current = false;
    setStatus("connecting");

    const ws = new WebSocket(url ?? defaultUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      retryRef.current = 0;
      setRetryCount(0);
      setStatus("open");
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" } satisfies WsClientMessage));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return; // не-JSON кадр игнорируется
      }
      const msg = parsed as WsServerMessage;
      if (msg && typeof msg === "object" && "type" in msg) {
        if (msg.type === "pong") return; // keep-alive гасится здесь
        onMessageRef.current?.(msg);
      }
    };

    ws.onclose = () => {
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
      setStatus("closed");
      if (closedByUserRef.current) return;
      // Реконнект с нарастающей задержкой
      if (retryRef.current >= maxRetries) return;
      const delay =
        RETRY_DELAYS_MS[Math.min(retryRef.current, RETRY_DELAYS_MS.length - 1)] ??
        15_000;
      retryRef.current += 1;
      setRetryCount(retryRef.current);
      retryTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // onclose придёт следом — реконнект решается там
    };
  }, [url, maxRetries]);

  const close = useCallback(() => {
    closedByUserRef.current = true;
    clearTimers();
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("closed");
  }, [clearTimers]);

  const send = useCallback((msg: WsClientMessage): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  useEffect(() => {
    if (autoConnect) connect();
    return () => {
      closedByUserRef.current = true;
      clearTimers();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [autoConnect, connect, clearTimers]);

  return { status, send, connect, close, retryCount };
}
