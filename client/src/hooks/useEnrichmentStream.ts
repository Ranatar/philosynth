/**
 * useEnrichmentStream — канал доставки результатов обогащений и обоснований
 * характеристик. Беседа 5.4 (запрос 1; общий для EnrichmentPanel п. 2 и
 * CharacteristicSlider п. 1).
 *
 * Модель — решение п.5 03 §3.1 («HTTP создаёт операцию, WS подписывает»),
 * как у режимов 4.1 (ModeModal): запуск — REST POST (api/enrichment),
 * который отвечает { ok: true } либо бросает ApiError (409
 * GENERATION_IN_PROGRESS, 403, 404, 400); результат приходит по
 * СОБСТВЕННОМУ WS-соединению хозяина (доставка по userId, подписываться
 * не нужно): enrichment_delta (по elementId) → enrichment_done
 * (enrichmentType, enrichmentId, content, usage); обрыв → stream_error с
 * sectionKey "enrich:{type}:{id}" | "enrich:{type}-{characteristic}:{id}".
 *
 * Одна операция за раз: обогащение занимает generation-слот синтеза
 * («По факту 5.3» п.2), поэтому второй запуск до финала первого сервер
 * отклонит 409 — хук держит одну активную операцию и ставит второй
 * запрос в очередь НЕ пытается: возвращает ошибку «дождитесь завершения».
 *
 * WS start_enrichment сознательно НЕ используется: он не покрывает
 * обоснование характеристики (долг §12 за 5.4 → решение: «только HTTP»,
 * фиксируется в 03 §3.1 патчем на завершение беседы), а REST даёт
 * синхронные коды ошибок вместо stream_error.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CategoryEnrichmentType,
  CharacteristicJustification,
  EdgeEnrichmentType,
  ElementEnrichment,
  JustifyCharacteristicInput,
} from "@philosynth/shared/types/elements";
import type {
  TokenUsage,
  WsServerMessage,
} from "@philosynth/shared/types/ws-messages";

import { ApiError } from "../api/client";
import {
  enrichCategory,
  enrichEdge,
  getEnrichments,
  getJustifications,
  justifyCharacteristic,
  type EnrichableElementKind,
} from "../api/enrichment";
import { useWebSocket, type WsStatus } from "./useWebSocket";

export type EnrichmentOperation =
  | {
      kind: "enrichment";
      elementType: EnrichableElementKind;
      elementId: string;
      enrichmentType: CategoryEnrichmentType | EdgeEnrichmentType;
    }
  | {
      kind: "justification";
      elementType: EnrichableElementKind;
      elementId: string;
      characteristic: string;
      value: number;
    };

export interface EnrichmentDoneEvent {
  operation: EnrichmentOperation;
  enrichmentId: string;
  enrichmentType: string;
  content: string;
  usage: TokenUsage;
}

export interface EnrichmentStream {
  wsStatus: WsStatus;
  /** Активная операция (null — свободно) */
  active: EnrichmentOperation | null;
  /** Накопленный текст активной операции (стриминг) */
  liveText: string;
  liveChars: number;
  /** Ошибка последнего запуска/стрима (сбрасывается новым запуском) */
  error: string | null;
  /** Последний финал (для хозяев без своей истории) */
  lastDone: EnrichmentDoneEvent | null;
  startEnrichment: (
    elementType: EnrichableElementKind,
    elementId: string,
    enrichmentType: CategoryEnrichmentType | EdgeEnrichmentType,
  ) => Promise<boolean>;
  startJustification: (input: JustifyCharacteristicInput) => Promise<boolean>;
  loadEnrichments: (
    elementId: string,
    elementType?: EnrichableElementKind,
  ) => Promise<ElementEnrichment[]>;
  loadJustifications: (
    elementId: string,
    elementType?: EnrichableElementKind,
  ) => Promise<CharacteristicJustification[]>;
  /** Подписка на финалы (хозяева: панель истории, слайдеры) */
  onDone: (cb: (ev: EnrichmentDoneEvent) => void) => () => void;
  clearError: () => void;
}

export interface UseEnrichmentStreamOptions {
  synthesisId: string;
  /** Открывать соединение (например, только пока панель видна) */
  enabled?: boolean | undefined;
}

export function messageOfEnrichmentError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "GENERATION_IN_PROGRESS")
      return "Идёт другая операция (генерация, режим или обогащение) — дождитесь её завершения";
    if (err.code === "FORBIDDEN") return "Обогащать элементы может только владелец синтеза";
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

export function useEnrichmentStream(
  options: UseEnrichmentStreamOptions,
): EnrichmentStream {
  const { synthesisId, enabled = true } = options;

  const [active, setActive] = useState<EnrichmentOperation | null>(null);
  const [liveText, setLiveText] = useState("");
  const [liveChars, setLiveChars] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastDone, setLastDone] = useState<EnrichmentDoneEvent | null>(null);

  const activeRef = useRef<EnrichmentOperation | null>(null);
  activeRef.current = active;
  const listenersRef = useRef(new Set<(ev: EnrichmentDoneEvent) => void>());

  const finish = useCallback(() => {
    setActive(null);
    setLiveText("");
    setLiveChars(0);
  }, []);

  const handleMessage = useCallback(
    (msg: WsServerMessage) => {
      const op = activeRef.current;
      switch (msg.type) {
        case "enrichment_delta":
          if (!op || msg.synthesisId !== synthesisId || msg.elementId !== op.elementId) return;
          setLiveText((prev) => prev + msg.delta);
          setLiveChars(msg.totalChars);
          break;
        case "enrichment_done": {
          if (!op || msg.synthesisId !== synthesisId || msg.elementId !== op.elementId) return;
          const ev: EnrichmentDoneEvent = {
            operation: op,
            enrichmentId: msg.enrichmentId,
            enrichmentType: msg.enrichmentType,
            content: msg.content,
            usage: msg.usage,
          };
          finish();
          setLastDone(ev);
          for (const cb of listenersRef.current) cb(ev);
          break;
        }
        case "stream_error": {
          if (!op || msg.synthesisId !== synthesisId) return;
          const key = msg.sectionKey ?? "";
          if (!key.startsWith("enrich:") || !key.endsWith(`:${op.elementId}`)) return;
          finish();
          setError(msg.error);
          break;
        }
        default:
          break;
      }
    },
    [synthesisId, finish],
  );

  const { status: wsStatus } = useWebSocket({
    autoConnect: enabled,
    onMessage: handleMessage,
  });

  // Смена синтеза — сброс
  useEffect(() => {
    finish();
    setError(null);
    setLastDone(null);
  }, [synthesisId, finish]);

  const begin = useCallback(
    async (op: EnrichmentOperation, post: () => Promise<unknown>): Promise<boolean> => {
      if (activeRef.current) {
        setError("Предыдущее обогащение ещё не завершено — дождитесь результата");
        return false;
      }
      setError(null);
      setActive(op);
      activeRef.current = op;
      setLiveText("");
      setLiveChars(0);
      try {
        await post();
        return true;
      } catch (err) {
        finish();
        setError(messageOfEnrichmentError(err));
        return false;
      }
    },
    [finish],
  );

  const startEnrichment = useCallback<EnrichmentStream["startEnrichment"]>(
    (elementType, elementId, enrichmentType) =>
      begin({ kind: "enrichment", elementType, elementId, enrichmentType }, () =>
        elementType === "category"
          ? enrichCategory(synthesisId, elementId, enrichmentType as CategoryEnrichmentType)
          : enrichEdge(synthesisId, elementId, enrichmentType as EdgeEnrichmentType),
      ),
    [begin, synthesisId],
  );

  const startJustification = useCallback<EnrichmentStream["startJustification"]>(
    (input) =>
      begin(
        {
          kind: "justification",
          elementType: input.elementType,
          elementId: input.elementId,
          characteristic: input.characteristic,
          value: input.value,
        },
        () => justifyCharacteristic(synthesisId, input),
      ),
    [begin, synthesisId],
  );

  const loadEnrichments = useCallback<EnrichmentStream["loadEnrichments"]>(
    (elementId, elementType) => getEnrichments(synthesisId, elementId, elementType),
    [synthesisId],
  );
  const loadJustifications = useCallback<EnrichmentStream["loadJustifications"]>(
    (elementId, elementType) => getJustifications(synthesisId, elementId, elementType),
    [synthesisId],
  );

  const onDone = useCallback<EnrichmentStream["onDone"]>((cb) => {
    listenersRef.current.add(cb);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return useMemo<EnrichmentStream>(
    () => ({
      wsStatus,
      active,
      liveText,
      liveChars,
      error,
      lastDone,
      startEnrichment,
      startJustification,
      loadEnrichments,
      loadJustifications,
      onDone,
      clearError,
    }),
    [
      wsStatus, active, liveText, liveChars, error, lastDone,
      startEnrichment, startJustification, loadEnrichments, loadJustifications,
      onDone, clearError,
    ],
  );
}
