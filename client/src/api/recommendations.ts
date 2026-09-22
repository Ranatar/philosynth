/**
 * API рекомендаций критики. Беседа 10.3 (запрос 1, п. 2).
 *
 * Контракт — 03 §2.16 + server/routes/recommendations.ts (10.1/10.2):
 *  - listRecommendations   → GET  /syntheses/:id/recommendations ?round=N
 *  - parseRecommendations  → POST …/recommendations/parse   (разбор таблицы;
 *    идемпотентен в пределах раунда; 409 ROUND_IN_PROGRESS — текст критики
 *    сменился, а в раунде есть 'planned')
 *  - extractRecommendations → POST …/recommendations/extract (ретрофит: ОДНО
 *    обращение к модели, квота regenerations; запрос СИНХРОНЕН — ждёт модель)
 *  - planRecommendations   → POST …/recommendations/plan { nums, fields? } —
 *    выбранные ПОШТУЧНО рекомендации → черновик плана. Вызова «все разом» нет
 *    и быть не должно: пустой nums сервер отвергает.
 *
 * Все четыре — только владельцу (чужому 403, гостю 401): панель рисуется
 * лишь при isOwner, вызовы без него не делаются.
 *
 * withBusyRetry: статус плана `done` пишется ДО освобождения слота («По факту
 * 10.2» п.15) — запрос под гейтом правки сразу после plan_updated может
 * получить 409 GENERATION_IN_PROGRESS. Это не отказ: короткий повтор.
 */
import type {
  RecommendationsExtractResponse,
  RecommendationsParseResponse,
  RecommendationsPlanRequest,
  RecommendationsPlanResponse,
  RecommendationsResponse,
} from "@philosynth/shared/types/recommendations";

import { ApiError, apiGet, apiPost } from "./client";

const base = (synthesisId: string): string =>
  `/syntheses/${encodeURIComponent(synthesisId)}/recommendations`;

const BUSY_RETRY_DELAYS_MS = [400, 800, 1500];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Повтор на 409 GENERATION_IN_PROGRESS (слот ещё не отпущен исполнителем). */
export async function withBusyRetry<T>(
  call: () => Promise<T>,
  delays: readonly number[] = BUSY_RETRY_DELAYS_MS,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call();
    } catch (err) {
      const delay = delays[attempt];
      if (
        delay === undefined ||
        !(err instanceof ApiError) ||
        err.code !== "GENERATION_IN_PROGRESS"
      )
        throw err;
      await sleep(delay);
    }
  }
}

export function listRecommendations(
  synthesisId: string,
  round?: number,
): Promise<RecommendationsResponse> {
  return apiGet<RecommendationsResponse>(
    base(synthesisId),
    round === undefined ? undefined : { round },
  );
}

export function parseRecommendations(
  synthesisId: string,
): Promise<RecommendationsParseResponse> {
  return withBusyRetry(() =>
    apiPost<RecommendationsParseResponse>(`${base(synthesisId)}/parse`),
  );
}

export function extractRecommendations(
  synthesisId: string,
): Promise<RecommendationsExtractResponse> {
  return apiPost<RecommendationsExtractResponse>(`${base(synthesisId)}/extract`);
}

export function planRecommendations(
  synthesisId: string,
  body: RecommendationsPlanRequest,
): Promise<RecommendationsPlanResponse> {
  return withBusyRetry(() =>
    apiPost<RecommendationsPlanResponse>(`${base(synthesisId)}/plan`, body),
  );
}
