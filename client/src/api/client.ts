/**
 * fetch-обёртка для API PhiloSynth Service.
 * Беседа 0.4 (07 §2, «Каркас клиента»).
 *
 * Контракт сервера (03-specification §2, §4.3):
 *   - базовый URL /api/v1;
 *   - все ответы JSON; ошибки — { error: string, code: string, details? };
 *   - аутентификация cookie-based (Lucia-модель, server/middleware/auth.ts),
 *     поэтому каждый запрос идёт с credentials: "include".
 *
 * 401 AUTH_REQUIRED обрабатывается централизованно: зарегистрированный
 * обработчик (auth-store сбрасывает пользователя → RequireAuth в App
 * делает redirect на /login).
 */

const BASE_URL = "/api/v1";

/** Коды ошибок API (03-specification §4.3) + клиентские NETWORK_ERROR/BAD_RESPONSE */
export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RATE_LIMIT"
  | "INSUFFICIENT_BALANCE"
  | "API_KEY_INVALID"
  | "API_KEY_MISSING"
  | "GENERATION_IN_PROGRESS"
  | "PLAN_CONFLICT"
  | "IMPORT_INVALID"
  | "INCOMPATIBLE_SECTIONS"
  | "QUOTA_EXCEEDED"
  | "BILLING_REQUIRED"
  | "GENERATION_PAUSED"
  | "RESUME_INVALID"
  | "NO_PARTICIPANTS_SEED_REQUIRED"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR"
  | "BAD_RESPONSE"
  | (string & {});

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(
    message: string,
    code: ApiErrorCode,
    status: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Тело запроса; сериализуется в JSON */
  body?: unknown;
  /** Query-параметры; undefined-значения опускаются */
  query?: Record<string, string | number | boolean | undefined> | undefined;
  signal?: AbortSignal | undefined;
  /**
   * Не дёргать обработчик 401 (беседа 0.6): для эндпоинтов, где 401 —
   * штатный ответ формы при живой сессии (password-change: неверный
   * currentPassword), а не признак умершей сессии.
   */
  skipUnauthorizedHandler?: boolean;
}

/** Обработчик 401: регистрируется auth-store'ом (сброс сессии → redirect) */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

function buildUrl(
  path: string,
  query?: RequestOptions["query"],
): string {
  const url = path.startsWith("/") ? BASE_URL + path : `${BASE_URL}/${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Основной запрос. Возвращает распарсенный JSON типа T.
 * Бросает ApiError при любой неуспешности (сеть, не-2xx, кривой JSON).
 */
export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, query, signal, skipUnauthorizedHandler } =
    options;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : null,
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(
      "Сервер недоступен. Проверьте соединение.",
      "NETWORK_ERROR",
      0,
    );
  }

  // 204 / пустое тело
  if (response.status === 204) return undefined as T;

  let data: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new ApiError(
          "Сервер вернул не-JSON ответ",
          "BAD_RESPONSE",
          response.status,
        );
      }
      // не-JSON тело ошибки (например, прокси) — сведём к статусу ниже
    }
  }

  if (!response.ok) {
    const errBody = (data ?? {}) as {
      error?: unknown;
      code?: unknown;
      details?: unknown;
    };
    const code: ApiErrorCode =
      typeof errBody.code === "string" ? errBody.code : "INTERNAL_ERROR";
    const message =
      typeof errBody.error === "string"
        ? errBody.error
        : `Ошибка запроса (HTTP ${response.status})`;

    if (response.status === 401 && !skipUnauthorizedHandler && onUnauthorized)
      onUnauthorized();

    throw new ApiError(message, code, response.status, errBody.details);
  }

  return data as T;
}

/* ── Шорткаты ────────────────────────────────────────────────────────── */

export const apiGet = <T>(
  path: string,
  query?: RequestOptions["query"],
): Promise<T> => api<T>(path, { query });

export const apiPost = <T>(path: string, body?: unknown): Promise<T> =>
  api<T>(path, { method: "POST", body });

export const apiPatch = <T>(path: string, body?: unknown): Promise<T> =>
  api<T>(path, { method: "PATCH", body });

export const apiDelete = <T>(path: string): Promise<T> =>
  api<T>(path, { method: "DELETE" });
