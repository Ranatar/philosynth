/**
 * useTransformStream — канал доставки трансформации graph↔theses.
 * Беседа 5.5 (запрос 1, п. 5 — прогресс стриминга и summary).
 *
 * Модель — как у useEnrichmentStream 5.4 и режимов 4.1 (решение п.5
 * 03 §3.1): запуск — REST POST (api/transforms), отвечающий { ok: true }
 * либо ApiError (409 GENERATION_IN_PROGRESS, 403, 400 «нет источника»);
 * результат — по СОБСТВЕННОМУ WS-соединению хозяина (доставка по userId,
 * подписки не нужно): transform_started → stream_delta с sectionKey
 * "transform:{direction}" (накапливается в liveHtml для показа хода
 * генерации) → transform_done (summary, usage); обрыв → stream_error с
 * тем же sectionKey.
 *
 * Одна операция за раз: трансформация занимает generation-слот синтеза;
 * второй запуск до финала отклоняется локально. WS start_transform
 * сознательно не используется — REST даёт синхронные коды ошибок.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TransformDirection } from "@philosynth/shared/types/elements";
import type { TokenUsage, WsServerMessage } from "@philosynth/shared/types/ws-messages";

import { ApiError } from "../api/client";
import { startTransformRequest } from "../api/transforms";
import { useWebSocket, type WsStatus } from "./useWebSocket";

export interface TransformDoneEvent {
  direction: TransformDirection;
  summary: Record<string, number>;
  usage: TokenUsage;
}

export interface TransformStream {
  wsStatus: WsStatus;
  /** Активное направление (null — свободно) */
  active: TransformDirection | null;
  /** Сервер подтвердил старт (transform_started) */
  started: boolean;
  /** Накопленный HTML стрима активной операции */
  liveHtml: string;
  liveChars: number;
  error: string | null;
  lastDone: TransformDoneEvent | null;
  start: (direction: TransformDirection) => Promise<boolean>;
  onDone: (cb: (ev: TransformDoneEvent) => void) => () => void;
  clearError: () => void;
  clearDone: () => void;
}

export interface UseTransformStreamOptions {
  synthesisId: string;
  enabled?: boolean | undefined;
}

export const TRANSFORM_STREAM_PREFIX = "transform:";

export function messageOfTransformError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "GENERATION_IN_PROGRESS")
      return "Идёт другая операция (генерация, режим, обогащение или трансформация) — дождитесь её завершения";
    if (err.code === "FORBIDDEN") return "Трансформировать представления может только владелец синтеза";
    if (err.code === "VALIDATION_ERROR" && err.details && typeof err.details === "object") {
      const d = Object.values(err.details as Record<string, unknown>).filter(
        (v) => typeof v === "string",
      );
      if (d.length) return d.join("; ");
    }
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export function useTransformStream(options: UseTransformStreamOptions): TransformStream {
  const { synthesisId, enabled = true } = options;

  const [active, setActive] = useState<TransformDirection | null>(null);
  const [started, setStarted] = useState(false);
  const [liveHtml, setLiveHtml] = useState("");
  const [liveChars, setLiveChars] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastDone, setLastDone] = useState<TransformDoneEvent | null>(null);

  const activeRef = useRef<TransformDirection | null>(null);
  activeRef.current = active;
  const listenersRef = useRef(new Set<(ev: TransformDoneEvent) => void>());

  const finish = useCallback(() => {
    setActive(null);
    setStarted(false);
    setLiveHtml("");
    setLiveChars(0);
  }, []);

  const handleMessage = useCallback(
    (msg: WsServerMessage) => {
      const op = activeRef.current;
      if (!op) return;
      const key = TRANSFORM_STREAM_PREFIX + op;
      switch (msg.type) {
        case "transform_started":
          if (msg.synthesisId !== synthesisId || msg.direction !== op) return;
          setStarted(true);
          break;
        case "stream_delta":
          if (msg.synthesisId !== synthesisId || msg.sectionKey !== key) return;
          setLiveHtml((prev) => prev + msg.delta);
          setLiveChars(msg.totalChars);
          break;
        case "transform_done": {
          if (msg.synthesisId !== synthesisId || msg.direction !== op) return;
          const ev: TransformDoneEvent = { direction: op, summary: msg.summary, usage: msg.usage };
          finish();
          setLastDone(ev);
          for (const cb of listenersRef.current) cb(ev);
          break;
        }
        case "stream_error":
          if (msg.synthesisId !== synthesisId || msg.sectionKey !== key) return;
          finish();
          setError(msg.error);
          break;
        default:
          break;
      }
    },
    [synthesisId, finish],
  );

  const { status: wsStatus } = useWebSocket({ autoConnect: enabled, onMessage: handleMessage });

  useEffect(() => {
    finish();
    setError(null);
    setLastDone(null);
  }, [synthesisId, finish]);

  const start = useCallback<TransformStream["start"]>(
    async (direction) => {
      if (activeRef.current) {
        setError("Предыдущая трансформация ещё не завершена — дождитесь результата");
        return false;
      }
      setError(null);
      setLastDone(null);
      setActive(direction);
      activeRef.current = direction;
      setStarted(false);
      setLiveHtml("");
      setLiveChars(0);
      try {
        await startTransformRequest(synthesisId, direction);
        return true;
      } catch (err) {
        finish();
        setError(messageOfTransformError(err));
        return false;
      }
    },
    [synthesisId, finish],
  );

  const onDone = useCallback<TransformStream["onDone"]>((cb) => {
    listenersRef.current.add(cb);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const clearDone = useCallback(() => setLastDone(null), []);

  return useMemo<TransformStream>(
    () => ({ wsStatus, active, started, liveHtml, liveChars, error, lastDone, start, onDone, clearError, clearDone }),
    [wsStatus, active, started, liveHtml, liveChars, error, lastDone, start, onDone, clearError, clearDone],
  );
}
