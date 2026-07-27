/**
 * Streaming Manager (беседа 1.4; 01-architecture §4.4, §4.12 п. 2–3).
 *
 * Модель v11 — _streamRespOnce [philosynth.html 12463–12640]: ОДНА попытка
 * SSE-стрима от Claude API + классификация ошибок по таксономии err.kind
 * (auth / billing / pre-stream / max-tokens / partial / stuck / user-abort).
 * Ретраи (только pre-stream, задержки streamResp [12642]) и создание паузы —
 * УРОВНЕМ ВЫШЕ: generation-service (эта беседа) и pause-resume-service (1.4b).
 *
 * Адаптации DOM → сервис (задокументированные отступления):
 *  - контейнер/requestAnimationFrame/stream-cursor исходника — браузерный
 *    рендер; серверный аналог — колбэк onDelta, транслирующий дельты в
 *    WebSocket (generation-service);
 *  - onDelta исходника получал (html.length, html); серверу для
 *    stream_delta (03-spec §3.2) нужен ИНКРЕМЕНТ — сигнатура расширена до
 *    (delta, totalChars, htmlSoFar);
 *  - API-ключ — параметром (BYO-Key проксируется через бэкенд, 01-arch §6),
 *    заголовок anthropic-dangerous-direct-browser-access не нужен;
 *  - stuck-детектор: reader.cancel(...) браузера → AbortController с
 *    пометкой _stuckAbort (сам приём исходника сохранён);
 *  - частичный результат при обрыве пишется в Redis (ws/stream-state) —
 *    п. f первого запроса 1.4; периодические записи держат reconnect-буфер
 *    §3.3 актуальным и во время штатного стрима.
 */
import { env } from "../env.js";
import {
  clearStreamState,
  getStreamState,
  saveStreamState,
} from "../ws/stream-state.js";

export { getStreamState, clearStreamState };
export type { StreamState } from "../ws/stream-state.js";

/* ── Таксономия ошибок (01-arch §4.12 п. 2) ──────────────────────────── */

/** err.kind стрима. 'context-error' сюда не входит — он присваивается
 *  оркестратором при сбое построения контекста, не стримом. */
export type StreamErrorKind =
  | "auth"
  | "billing"
  | "pre-stream"
  | "max-tokens"
  | "partial"
  | "stuck"
  | "user-abort";

/** Типизированная ошибка стрима (аналог err с полями kind/_usage). */
export class StreamError extends Error {
  kind: StreamErrorKind;
  /** HTTP-статус ответа API (если ошибка до стрима) */
  status?: number | undefined;
  /** max-tokens: какой лимит уже был использован */
  maxTokensUsed?: number | undefined;
  /** Токены, реально потраченные до обрыва (max-tokens: err._usage) */
  usage?: StreamUsage | undefined;

  constructor(message: string, kind: StreamErrorKind) {
    super(message);
    this.name = "StreamError";
    this.kind = kind;
  }
}

export interface StreamUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Порт _classifyStreamError(err, hasStreamedAnyContent) [12429]:
 *  - уже типизированная (StreamError) — как есть;
 *  - AbortError → 'stuck' (abort по таймеру) либо 'user-abort';
 *  - 401/unauthorized/invalid api key в сообщении → 'auth';
 *  - иначе: был контент → 'partial', не был → 'pre-stream'.
 */
export function classifyStreamError(
  err: unknown,
  hasStreamedAnyContent: boolean,
  opts: { stuckAbort?: boolean } = {},
): StreamError {
  if (err instanceof StreamError) return err;
  const msg =
    (err as { message?: string } | null)?.message ?? String(err ?? "");
  if ((err as { name?: string } | null)?.name === "AbortError") {
    return new StreamError(msg, opts.stuckAbort ? "stuck" : "user-abort");
  }
  if (/401|unauthorized|authentication|invalid.*api.*key/i.test(msg)) {
    return new StreamError(msg, "auth");
  }
  return new StreamError(msg, hasStreamedAnyContent ? "partial" : "pre-stream");
}

/* ── SSE-стрим одного раздела ────────────────────────────────────────── */

export type OnDelta = (
  delta: string,
  totalChars: number,
  htmlSoFar: string,
) => void;

export interface StreamSectionOptions {
  /** Внешний AbortController активной генерации (user-abort / cancel) */
  signal?: AbortSignal | undefined;
  model?: string | undefined;
  maxTokens?: number | undefined;
  /** Порог stuck-детектора, мс (дефолт env.streaming.stuckMs = 45 000) */
  stuckMs?: number | undefined;
}

/** Троттлинг записи reconnect-буфера в Redis, мс */
const STATE_SAVE_THROTTLE_MS = 1000;

interface SseEvent {
  type?: string;
  delta?: { text?: string; stop_reason?: string };
  message?: { usage?: { input_tokens?: number } };
  usage?: { output_tokens?: number };
}

/**
 * Одна попытка стрима раздела (порт _streamRespOnce [12463]).
 *
 * a. POST /v1/messages со stream:true;
 * b. парсинг SSE (content_block_delta → text, message_start/delta → usage);
 * c. буферизация HTML;
 * d. onDelta(delta, totalChars, htmlSoFar) на каждый чанк;
 * e. возврат usage;
 * f. при ошибке — частичный результат сохранён в Redis (stream_state),
 *    классифицированная StreamError проброшена вызывающему.
 *
 * stop_reason === "max_tokens" → StreamError kind='max-tokens' с usage
 * (токены реально потрачены — учитываются в genEntry, как err._usage
 * исходника [12613–12623]).
 */
export async function streamSection(
  synthesisId: string,
  sectionKey: string,
  prompt: string,
  systemPrompt: string,
  apiKey: string,
  onDelta?: OnDelta | null,
  opts: StreamSectionOptions = {},
): Promise<StreamUsage> {
  const model = opts.model ?? env.anthropic.model;
  const maxTokens = opts.maxTokens ?? env.anthropic.maxTokens;
  const stuckMs = opts.stuckMs ?? env.streaming.stuckMs;

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    stream: true,
    messages: [{ role: "user", content: prompt }],
  };
  if (systemPrompt) body.system = systemPrompt;

  /* Внутренний контроллер: слушает внешний signal (user-abort) и служит
     stuck-детектору (аналог reader.cancel + _stuckAbort исходника). */
  const ctrl = new AbortController();
  let stuckAborted = false;
  const onOuterAbort = (): void => ctrl.abort();
  if (opts.signal) {
    if (opts.signal.aborted) {
      throw new StreamError("Генерация остановлена", "user-abort");
    }
    opts.signal.addEventListener("abort", onOuterAbort, { once: true });
  }

  let html = "";
  let hasStreamedAnyContent = false;

  /** Троттлированная запись reconnect-буфера (fail-open внутри). */
  let lastSaveAt = 0;
  const saveState = (status: "streaming" | "error", force = false): void => {
    const now = Date.now();
    if (!force && now - lastSaveAt < STATE_SAVE_THROTTLE_MS) return;
    lastSaveAt = now;
    void saveStreamState({
      synthesisId,
      sectionKey,
      htmlSoFar: html,
      charsSoFar: html.length,
      status,
      updatedAt: new Date().toISOString(),
    });
  };

  /** Классификация + сохранение частичного результата — единая точка. */
  const failWith = (err: unknown): never => {
    const classified = classifyStreamError(err, hasStreamedAnyContent, {
      stuckAbort: stuckAborted,
    });
    if (hasStreamedAnyContent) saveState("error", true);
    throw classified;
  };

  let resp: Response;
  try {
    resp = await fetch(`${env.anthropic.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (netErr) {
    // Сеть / abort до старта [12471–12474]
    opts.signal?.removeEventListener("abort", onOuterAbort);
    return failWith(netErr);
  }

  if (!resp.ok) {
    // Классификация HTTP-ошибок [12476–12491]
    let errMsg = resp.statusText;
    try {
      const e = (await resp.json()) as { error?: { message?: string } };
      errMsg = e.error?.message || errMsg;
    } catch {
      /* тело не JSON — оставляем statusText */
    }
    opts.signal?.removeEventListener("abort", onOuterAbort);
    let kind: StreamErrorKind;
    if (resp.status === 401) kind = "auth";
    else if (resp.status === 400 && /credit balance/i.test(errMsg))
      kind = "billing";
    else kind = "pre-stream"; // 429 / 5xx — ретраится уровнем выше
    const err = new StreamError(errMsg, kind);
    err.status = resp.status;
    throw err;
  }

  if (!resp.body) {
    opts.signal?.removeEventListener("abort", onOuterAbort);
    throw new StreamError("Пустое тело ответа API", "pre-stream");
  }

  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let usageIn = 0;
  let usageOut = 0;
  let stopReason: string | null = null;

  /* Stuck-детектор [12522–12535]: abort при отсутствии токенов дольше
     stuckMs; пометка stuckAborted отличает его от user-abort. */
  let stuckTimer: ReturnType<typeof setTimeout> | null = null;
  const resetStuck = (): void => {
    if (stuckTimer) clearTimeout(stuckTimer);
    stuckTimer = setTimeout(() => {
      stuckAborted = true;
      ctrl.abort();
    }, stuckMs);
  };
  resetStuck();

  /** Обработка одного SSE-события (общая для цикла и хвоста буфера). */
  const applyEvent = (p: SseEvent): string | null => {
    let deltaText: string | null = null;
    if (p.type === "content_block_delta" && p.delta?.text) {
      deltaText = p.delta.text;
    }
    if (p.type === "message_start" && p.message?.usage) {
      usageIn = p.message.usage.input_tokens || 0;
    }
    if (p.type === "message_delta" && p.usage) {
      usageOut = p.usage.output_tokens || 0;
    }
    if (p.type === "message_delta" && p.delta?.stop_reason) {
      stopReason = p.delta.stop_reason;
    }
    return deltaText;
  };

  try {
    for (;;) {
      let chunk: { done: boolean; value?: Uint8Array | undefined };
      try {
        chunk = await reader.read();
      } catch (readErr) {
        // Обрыв стрима [12526–12531]
        return failWith(readErr);
      }
      const { done, value } = chunk;
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.startsWith("data: ")) continue;
        const d = l.slice(6).trim();
        if (d === "[DONE]") continue;
        try {
          const deltaText = applyEvent(JSON.parse(d) as SseEvent);
          if (deltaText) {
            hasStreamedAnyContent = true;
            resetStuck();
            html += deltaText;
            saveState("streaming");
            if (onDelta) onDelta(deltaText, html.length, html);
          }
        } catch (e) {
          console.warn("SSE parse error:", e, "raw:", d);
        }
      }
    }

    // Хвост буфера [12578–12603]
    if (buf.trim()) {
      const remaining = buf.trim();
      if (remaining.startsWith("data: ")) {
        const d = remaining.slice(6).trim();
        if (d !== "[DONE]") {
          try {
            const deltaText = applyEvent(JSON.parse(d) as SseEvent);
            if (deltaText) {
              hasStreamedAnyContent = true;
              html += deltaText;
              if (onDelta) onDelta(deltaText, html.length, html);
            }
          } catch (e) {
            console.warn("SSE tail parse error:", e, "raw:", d);
          }
        }
      }
    }
  } finally {
    if (stuckTimer) clearTimeout(stuckTimer);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }

  /* stop_reason max_tokens → ошибка kind='max-tokens' [12608–12623]:
     контент оборван, но токены потрачены — usage передаётся вызывающему. */
  if (stopReason === "max_tokens") {
    saveState("error", true);
    const err = new StreamError(
      `Ответ оборван по лимиту токенов (max_tokens = ${maxTokens.toLocaleString("ru")}). ` +
        "Раздел слишком объёмный для одного запроса.",
      "max-tokens",
    );
    err.maxTokensUsed = maxTokens;
    err.usage = { inputTokens: usageIn, outputTokens: usageOut };
    throw err;
  }

  // Успех: буфер раздела больше не нужен reconnect'у
  await clearStreamState(synthesisId, sectionKey);
  return { inputTokens: usageIn, outputTokens: usageOut };
}

/* ── Дружественное сообщение об обрыве ───────────────────────────────── */

/**
 * Порт _pauseFriendlyMessage(err) [24653]: человекочитаемая причина паузы
 * по kind. Используется generation-service при записи pausedState.reason.
 */
export function pauseFriendlyMessage(err: StreamError | null | undefined): string {
  if (!err) return "Неизвестная ошибка";
  const msg = err.message || String(err);
  const kind = err.kind;
  if (kind === "auth") return "API-ключ недействителен или истёк (401).";
  if (kind === "billing")
    return (
      "Недостаточно средств на балансе API. " +
      "Пополните баланс на console.anthropic.com и нажмите «Продолжить»."
    );
  if (kind === "user-abort") return "Генерация остановлена вручную.";
  if (kind === "stuck")
    return "Нет ответа от API более 45 секунд (стрим «завис»).";
  if (kind === "max-tokens") {
    const used = err.maxTokensUsed || 20000;
    return (
      "Ответ оборван по лимиту токенов (max_tokens = " +
      used.toLocaleString("ru") +
      "). Раздел слишком объёмный."
    );
  }
  if (kind === "pre-stream") {
    if (/429/.test(msg)) return "Превышен лимит запросов (429). " + msg;
    if (/5\d{2}/.test(msg)) return "Сбой сервера API. " + msg;
    return "Сбой до начала стрима: " + msg;
  }
  if (kind === "partial") return "Стрим оборвался в процессе: " + msg;
  return msg;
}
