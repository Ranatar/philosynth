/**
 * DTO рекомендаций критики (беседа 10.1; 02 §2.32, 03 §2.16).
 */
import type {
  RecommendationElementKind,
  RecommendationStatus,
} from "../constants/recommendations.js";
import type { EditPlan } from "./edit-plan.js";

/** Строка таблицы рекомендаций, разобранная и проверенная сторожем. */
export interface Recommendation {
  id: string;
  synthesisId: string;
  round: number;
  /** Строкой: бывает «5а» / «5б» (развилка) */
  num: string;
  /** Подраздел-адресат, как записан в таблице (после снятия § и кавычек) */
  addressSubsection: string;
  /** Раздел, в котором сторож нашёл подраздел; null — адрес не найден */
  addressSection: string | null;
  /** Элемент, как записан в таблице; null — рекомендация о подразделе целиком */
  element: string | null;
  /** Чем оказался элемент; null — элемента нет либо он не найден */
  elementKind: RecommendationElementKind | null;
  /** id строки categories / theses / glossary_terms */
  elementId: string | null;
  /** Операция, как записана (у негодной строки — вне закрытого списка) */
  op: string;
  /** Готовая замена дословно; null — рекомендация её не содержит */
  replacement: string | null;
  /** Подраздел критики, где проблема установлена */
  rationale: string;
  severity: string;
  status: RecommendationStatus;
  /** Что именно не сошлось у строки 'invalid' */
  invalidReason: string | null;
  /** Заполняет 10.2 при постановке плана */
  planId: string | null;
  stepIndex: number | null;
  createdAt: string;
}

/** Ответ GET /recommendations и POST /recommendations/parse. */
export interface RecommendationsResponse {
  /** Раунд, строки которого отданы; 0 — разборов ещё не было */
  round: number;
  /** Последний раунд концепции (для «прошлых» — ?round=N) */
  latestRound: number;
  rows: Recommendation[];
}

/** Ответ POST /recommendations/parse. */
export interface RecommendationsParseResponse extends RecommendationsResponse {
  /** true — открыт новый раунд; false — тот же текст таблицы, раунд прежний */
  newRound: boolean;
  invalidCount: number;
}

/** Ответ POST /recommendations/extract (ретрофит). */
export interface RecommendationsExtractResponse
  extends RecommendationsParseResponse {
  /** 'inserted' — подраздел добавлен; 'replaced' — заменено содержимое имевшегося */
  outcome: "inserted" | "replaced";
  /** Что сервер снял из ответа модели при чистке разметки */
  warnings: string[];
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}

/* ── Постановка плана (беседа 10.2) ──────────────────────────────────── */


/** Тело POST /syntheses/:id/recommendations/plan. */
export interface RecommendationsPlanRequest {
  /** Номера рекомендаций ПОШТУЧНО: «2», «5а». Пустой список — отказ:
   *  «все разом» службой не исполняется намеренно */
  nums: string[];
  /** 10.3: поле элемента по выбору человека — «id строки рекомендации → поле»
   *  из ELEMENT_STEP_FIELDS вида элемента. Нет записи — поле по умолчанию
   *  (определение / формулировка). Чужой id, строка без элемента или поле вне
   *  белого списка — 400 (details.fields) */
  fields?: Record<string, string>;
}

/** Строка, не вошедшая в план, и почему. */
export interface RecommendationDecline {
  id: string;
  num: string;
  position: number;
  /** already_planned | already_done | delete_element | delete_subsection |
   *  same_target | section_regenerated | no_element_for_replacement | no_address */
  code: string;
  reason: string;
}

/** Ответ POST /syntheses/:id/recommendations/plan. */
export interface RecommendationsPlanResponse {
  /** Черновик плана (status 'draft'); исполнение — POST /plans/:planId/execute */
  plan: EditPlan;
  round: number;
  /** Строки, переведённые в 'planned' */
  planned: Recommendation[];
  /** Текст адресата изменился после разбора → 'stale'; в план не взяты */
  stale: Recommendation[];
  /** Адресат исчез → 'invalid'; в план не взяты */
  invalid: Recommendation[];
  declined: RecommendationDecline[];
  /** Что делать с невошедшими (перечитать рекомендации и т.п.) */
  hint: string | null;
}
