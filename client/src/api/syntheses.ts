/**
 * API-функции /syntheses. Беседа 1.5 (запрос 1, п. 8).
 *
 * Контракт: 03-specification §2.2 + server/routes/syntheses.ts (1.4/1.5).
 *  - createSynthesis → POST /syntheses (генерация стартует в фоне,
 *    клиент подключается по WebSocket — useStreamingGeneration);
 *  - estimateSynthesis → POST /syntheses/estimate (беседа 1.5; серверный
 *    estimateCost по конвейеру 1.1/1.2 — потребитель CostEstimate.tsx);
 *  - getSynthesis → GET /syntheses/:id — роут реализован серверной
 *    беседой 1.6 (SynthesisFull с pausedState и pauseEstimates).
 */
import type { ParticipantInput } from "@philosynth/shared/types/lineage";
import type { SynthesisFull } from "@philosynth/shared/types/synthesis";

import { apiGet, apiPost } from "./client";

/** Тело POST /syntheses и POST /syntheses/estimate (03-spec §2.2, v11:
 *  philosophers/participants опциональны — оба пусты = свободный синтез,
 *  тогда обязателен seed) */
export interface CreateSynthesisInput {
  seed?: string;
  philosophers?: string[];
  sections: string[];
  method: string;
  depth: string;
  synthLevel: string;
  generationOrder?: string;
  extGraphMetrics?: boolean;
  keepFullBudget?: boolean;
  context?: string;
  sectionContexts?: Record<string, string>;
  lang?: string;
  participants?: ParticipantInput[];
}

export interface CreateSynthesisResult {
  id: string;
  status: "generating";
}

export function createSynthesis(
  input: CreateSynthesisInput,
): Promise<CreateSynthesisResult> {
  return apiPost<CreateSynthesisResult>("/syntheses", input);
}

/** Ответ POST /syntheses/estimate — FullCostEstimate cost-estimator'а */
export interface SynthesisEstimate {
  inTokens: number;
  outTokens: number;
  /** USD */
  cost: number;
  passes: number;
}

export function estimateSynthesis(
  input: CreateSynthesisInput,
): Promise<SynthesisEstimate> {
  return apiPost<{ estimate: SynthesisEstimate }>(
    "/syntheses/estimate",
    input,
  ).then((r) => r.estimate);
}

/* ── POST /syntheses/advice (беседа 1.5): Advisor v2 + Section Dependency
      Warnings. icon/title считает сервер (iconForSeverity/titleForSeverity);
      CSS-классы чипов — клиент (NEXT-CONTEXT, глава 1.1) ── */

export interface SectionAdviceItem {
  icon: string;
  text: string;
  severity?: "hard-conflict" | "conflict";
}

export interface SectionAdviceDto {
  warnings: SectionAdviceItem[];
  recommendations: SectionAdviceItem[];
  substitutions: SectionAdviceItem[];
}

export interface CompatEntryDto {
  rating: string;
  severity: string;
  desc: string;
  advice: string | null;
  /** Пер-секционные рейтинги-чипы (ключ раздела → ★★★…✗✗) */
  sections: Record<string, string>;
  /** Иконка/заголовок severity — посчитаны сервером */
  icon: string;
  title: string;
}

export interface SynthesisAdviceInput {
  sections: string[];
  method: string;
  synthLevel: string;
  generationOrder?: string;
}

export interface SynthesisAdvice {
  entry: CompatEntryDto | null;
  advice: SectionAdviceDto;
}

export function fetchSynthesisAdvice(
  input: SynthesisAdviceInput,
): Promise<SynthesisAdvice> {
  return apiPost<SynthesisAdvice>("/syntheses/advice", input);
}

export function getSynthesis(id: string): Promise<SynthesisFull> {
  return apiGet<{ synthesis: SynthesisFull }>(
    `/syntheses/${encodeURIComponent(id)}`,
  ).then((r) => r.synthesis);
}
