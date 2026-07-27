/**
 * Кардинальность участников и словоформы (v11, 01-arch §4.14).
 * Порт participantCardinality / participantWord / participantWordSg /
 * hasConceptParticipants из philosynth.html (~10561–10587, ~9844).
 *
 * Авторский JSDoc исходника: «единая точка отсчёта для всех шаблонов,
 * которым небезразлично число участников».
 *
 * Расположение: shared/utils/ (05-file-structure) — нужна и клиентской
 * форме (превью), и серверу (buildSectionDefs, промпты).
 *
 * Адаптация к сервису: в исходнике участник-концепция имеет
 * type === "concept"; в API сервиса (ParticipantInput) — type === "synthesis".
 * Здесь принимаются оба варианта.
 */

import type { ParticipantCardinality } from "../types/synthesis.js";

/** Минимальный срез параметров, достаточный для подсчёта кардинальности */
export interface CardinalityParams {
  /** Список философов (p.phil в исходнике / philosophers в API) */
  phil?: readonly string[] | undefined;
  /** Участники (философы и концепции) */
  participants?: readonly { type: string }[] | undefined;
  /** Флаг мета-синтеза (гейт подсчёта концепций, как в исходнике) */
  isMetaSynthesis?: boolean | undefined;
}

/** Порт hasConceptParticipants: return p.isMetaSynthesis || false */
export function hasConceptParticipants(p: CardinalityParams): boolean {
  return p.isMetaSynthesis ?? false;
}

function isConceptType(t: string): boolean {
  // "concept" — исходник; "synthesis" — ParticipantInput сервиса
  return t === "concept" || t === "synthesis";
}

/**
 * Порт participantCardinality:
 * total = max(|phil|, философы среди participants) + концепции среди
 * participants (концепции считаются только при hasConceptParticipants).
 */
export function participantCardinality(
  p: CardinalityParams,
): ParticipantCardinality {
  const phils = Array.isArray(p.phil) ? p.phil.length : 0;
  const philsViaParticipants = p.participants
    ? p.participants.filter((x) => x.type === "philosopher").length
    : 0;
  const concepts =
    hasConceptParticipants(p) && p.participants
      ? p.participants.filter((x) => isConceptType(x.type)).length
      : 0;
  const total = Math.max(phils, philsViaParticipants) + concepts;
  if (total === 0) return "none";
  if (total === 1) return "single";
  return "multi";
}

/** Порт participantWord — род. падеж мн. числа для промптов */
export function participantWord(p: CardinalityParams): string {
  const card = participantCardinality(p);
  if (card === "none") return "традиций";
  if (hasConceptParticipants(p)) return "участников синтеза";
  return card === "single" ? "философских традиций" : "философов";
}

/** Порт participantWordSg — род. падеж ед. числа
 *  (в исходнике обе ветки single/multi дают «философа» — сохранено) */
export function participantWordSg(p: CardinalityParams): string {
  const card = participantCardinality(p);
  if (card === "none") return "традиции";
  if (hasConceptParticipants(p)) return "участника";
  return "философа";
}
