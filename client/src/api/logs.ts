/**
 * API-функции логов (беседа 2.4; 03-spec §2.12 + /logs/prompts).
 * Модуль отсутствует в дереве 05 (там перечислены api/syntheses…export) —
 * дополнение по факту, в патч доков завершения беседы.
 */
import { apiGet } from "./client";

import type {
  CtxLogEntry,
  GenLogEntry,
} from "@philosynth/shared/types/generation";

export interface FormattedLog {
  text: string;
  html: string;
}

/** GET /syntheses/:id/logs/formatted — plain + colorized (03 §2.12) */
export const getFormattedLog = (synthesisId: string): Promise<FormattedLog> =>
  apiGet<FormattedLog>(`/syntheses/${synthesisId}/logs/formatted`);

/** GET /syntheses/:id/logs/prompts — дамп промптов; text=null → промптов нет */
export const getPromptsDump = (
  synthesisId: string,
): Promise<{ text: string | null }> =>
  apiGet<{ text: string | null }>(`/syntheses/${synthesisId}/logs/prompts`);

/** GET /syntheses/:id/logs/generation — сырые строки genLog */
export const getGenerationLog = (
  synthesisId: string,
): Promise<{ entries: GenLogEntry[] }> =>
  apiGet<{ entries: GenLogEntry[] }>(`/syntheses/${synthesisId}/logs/generation`);

/** GET /syntheses/:id/logs/context — сырые строки ctxLog */
export const getContextLog = (
  synthesisId: string,
): Promise<{ entries: CtxLogEntry[] }> =>
  apiGet<{ entries: CtxLogEntry[] }>(`/syntheses/${synthesisId}/logs/context`);
