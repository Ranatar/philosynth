/**
 * API импорта (беседа 4.3; 03-spec §2.2 POST /syntheses/import).
 *
 * Обёртка api() из client.ts здесь не годится — она сериализует тело в
 * JSON, а импорт идёт multipart/form-data (Content-Type с boundary
 * выставляет браузер по FormData). Локальный fetch повторяет контракт
 * client.ts: credentials include, ошибки — ApiError с кодом сервера.
 * Глобальный обработчик 401 не дёргается (он приватен для client.ts);
 * мёртвая сессия на /import отдаст ApiError AUTH_REQUIRED — RequireAuth
 * закрывает основной сценарий ещё до страницы.
 */
import { ApiError, type ApiErrorCode } from "./client";

import type { ImportWarning } from "@philosynth/shared/types/synthesis";

export interface ImportFileResult {
  id: string;
  warnings: ImportWarning[];
}

export async function importFile(file: File): Promise<ImportFileResult> {
  const form = new FormData();
  form.append("file", file);

  let response: Response;
  try {
    response = await fetch("/api/v1/syntheses/import", {
      method: "POST",
      credentials: "include",
      body: form,
    });
  } catch {
    throw new ApiError(
      "Сервер недоступен. Проверьте соединение.",
      "NETWORK_ERROR",
      0,
    );
  }

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
    throw new ApiError(message, code, response.status, errBody.details);
  }

  return data as ImportFileResult;
}
