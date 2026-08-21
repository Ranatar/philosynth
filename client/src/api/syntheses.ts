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
import type {
  SynthesisFull,
  SynthesisPreview,
} from "@philosynth/shared/types/synthesis";

import { apiGet, apiPatch, apiPost } from "./client";

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

/** Неблокирующее генеалогическое предупреждение (POST /syntheses,
 *  аддитивное поле из беседы 3.1 — M3 §1.6; рисует клиент 3.2) */
export interface GenealogyWarningDto {
  level: "info" | "warn";
  text: string;
}

export interface CreateSynthesisResult {
  id: string;
  status: "generating";
  warnings?: GenealogyWarningDto[];
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

/** Кнопка замены параметра (COMPAT_MATRIX_COMPACT.replacements;
 *  applyReplacement [7365] — беседа 3.2) */
export interface CompatReplacementDto {
  param: "method" | "level" | string;
  value: string;
  label: string;
  rating: string;
}

/** Рекомендация порядка генерации (entry.orderAdvice; беседа 3.2) */
export interface CompatOrderAdviceDto {
  recommended: "architectural" | "genetic";
  strength: string;
  text: string;
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
  /** Кнопки замен (беседа 3.2: сервер /advice спредит entry — поля
   *  текли с 1.5, DTO их просто не типизировал) */
  replacements?: {
    keepLevel?: CompatReplacementDto[];
    keepMethod?: CompatReplacementDto[];
  } | null;
  orderAdvice?: CompatOrderAdviceDto;
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

/* ── Каталог (беседа 1.6b): списки и публикация ───────────────────────
 *
 * Контракт: 03-spec §2.2 + server/routes/syntheses.ts (беседа 1.6).
 * Семантика параметров списков (правка 03 §2.2 по итогам 1.6):
 * sort ∈ createdAt|updatedAt|title|method|status (иное молча → createdAt),
 * order ∈ asc|desc (default desc), limit 1..100 (default 20), page ≥ 1;
 * search — подстрока title без учёта регистра (ILIKE, серверный);
 * philosopher — ТОЧНОЕ имя в генеалогии. */

export type SynthesisListSort =
  | "createdAt"
  | "updatedAt"
  | "title"
  | "method"
  | "status";

export interface SynthesisListParams {
  page?: number;
  limit?: number;
  sort?: SynthesisListSort;
  order?: "asc" | "desc";
  status?: string;
  method?: string;
  search?: string;
}

export interface PublicSynthesisListParams {
  page?: number;
  limit?: number;
  search?: string;
  /** Точное имя философа в генеалогии (как §2.8) */
  philosopher?: string;
}

export interface SynthesisListResult {
  items: SynthesisPreview[];
  total: number;
}

/** GET /syntheses — «Мои» (вкладка каталога) */
export function listSyntheses(
  params: SynthesisListParams = {},
): Promise<SynthesisListResult> {
  return apiGet<SynthesisListResult>("/syntheses", { ...params });
}

/** GET /syntheses/public — «Публичные» (is_public всех пользователей) */
export function listPublicSyntheses(
  params: PublicSynthesisListParams = {},
): Promise<SynthesisListResult> {
  return apiGet<SynthesisListResult>("/syntheses/public", { ...params });
}

/** PATCH /syntheses/:id { title?, isPublic? } — только владелец (403 иначе).
 *  Единственный способ опубликовать синтез (03 §2.2); title ≤ 300, trim. */
export function updateSynthesis(
  id: string,
  patch: { title?: string; isPublic?: boolean; extGraphMetrics?: boolean },
): Promise<SynthesisFull> {
  return apiPatch<{ synthesis: SynthesisFull }>(
    `/syntheses/${encodeURIComponent(id)}`,
    patch,
  ).then((r) => r.synthesis);
}
