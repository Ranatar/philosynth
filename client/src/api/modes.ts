/**
 * API-функции режимов. Беседа 4.1 (запрос 1, п. 7).
 *
 * Контракты: 03-specification §2.7 + server/routes/modes.ts (4.1):
 *  - runMode    → POST   /syntheses/:id/modes/:modeKey/run → { ok }
 *                 (запуск фоном; стриминг — WebSocket: stream_delta с
 *                  sectionKey "mode:{modeKey}", завершение — mode_done)
 *  - getModes   → GET    /syntheses/:id/modes → { modes } —
 *                 Record<modeKey, ModeResult[]> (счётчики кнопок)
 *  - getModeResults → GET /syntheses/:id/modes/:modeKey →
 *                 { results, warnings, estimate } (warnings/estimate —
 *                 аддитивный транспорт ModeModal, см. shared/types/modes)
 *  - deleteMode → DELETE /syntheses/:id/modes/:modeKey/:index → { ok }
 *                 (index — позиция по created_at ASC)
 */
import type {
  ModeKeyResponse,
  ModeResult,
} from "@philosynth/shared/types/modes";

import { apiDelete, apiGet, apiPost } from "./client";

const base = (synthesisId: string): string =>
  `/syntheses/${encodeURIComponent(synthesisId)}`;

export async function runMode(
  synthesisId: string,
  modeKey: string,
  param: string,
): Promise<void> {
  await apiPost<{ ok: true }>(
    `${base(synthesisId)}/modes/${encodeURIComponent(modeKey)}/run`,
    { param },
  );
}

export async function getModes(
  synthesisId: string,
): Promise<Record<string, ModeResult[]>> {
  const res = await apiGet<{ modes: Record<string, ModeResult[]> }>(
    `${base(synthesisId)}/modes`,
  );
  return res.modes;
}

export async function getModeResults(
  synthesisId: string,
  modeKey: string,
): Promise<ModeKeyResponse> {
  return apiGet<ModeKeyResponse>(
    `${base(synthesisId)}/modes/${encodeURIComponent(modeKey)}`,
  );
}

export async function deleteMode(
  synthesisId: string,
  modeKey: string,
  index: number,
): Promise<void> {
  await apiDelete<{ ok: true }>(
    `${base(synthesisId)}/modes/${encodeURIComponent(modeKey)}/${index}`,
  );
}

/** Тихая перегенерация СУЩЕСТВУЮЩЕГО результата (его собственный
 *  param; UPDATE строки с сохранением created_at). Транспорт каскада
 *  режимов из SubsectionRegenPanel (долг §12 за 4.1); завершение —
 *  mode_done, ошибка — stream_error "mode:{modeKey}". */
export async function regenerateModeResult(
  synthesisId: string,
  modeKey: string,
  index: number,
): Promise<void> {
  await apiPost<{ ok: true }>(
    `${base(synthesisId)}/modes/${encodeURIComponent(modeKey)}/${index}/regenerate`,
    {},
  );
}
