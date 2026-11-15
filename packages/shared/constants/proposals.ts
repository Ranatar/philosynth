/**
 * Предложения изменений (беседа 17.1; врезка «Фаза 17» в 07) — закрытые
 * списки, общие серверу и клиенту 17.2.
 *
 * Предложение документ НЕ меняет: изменение происходит только действием
 * человека с правом `edit` и только существующим путём — черновик плана
 * правок → предпросмотр с каскадом → подтверждение → исполнение. Статус
 * `accepted` ставится после ИСПОЛНЕНИЯ шага плана, не при нажатии «Принять».
 */

/** Из чего выросло предложение (source_id — id комментария / замечания
 *  рецензии / строки рекомендаций; у direct — null). */
export const PROPOSAL_SOURCES = ["direct", "comment", "review_finding", "recommendation"] as const;
export type ProposalSource = (typeof PROPOSAL_SOURCES)[number];
export const isProposalSource = (v: unknown): v is ProposalSource =>
  typeof v === "string" && (PROPOSAL_SOURCES as readonly string[]).includes(v);

/** replace — готовое значение поля элемента либо текст подраздела;
 *  note — только замечание (способ исполнения выбирает принимающий). */
export const PROPOSAL_KINDS = ["replace", "note"] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];
export const isProposalKind = (v: unknown): v is ProposalKind =>
  typeof v === "string" && (PROPOSAL_KINDS as readonly string[]).includes(v);

/**
 * open — ждёт решения (в том числе стоит в черновике плана: `planId`);
 * accepted — шаг плана ИСПОЛНЕН; rejected — отклонено человеком с правом
 * `edit`; withdrawn — снято автором; closed — закрыто без решения по
 * существу (участник исключён, заменено новым поверх текущего, закрыто
 * вручную как устаревшее). «Устарело» статусом НЕ является — вычисляется
 * при чтении (`stale`): основа ≠ текущему.
 */
export const PROPOSAL_STATUSES = ["open", "accepted", "rejected", "withdrawn", "closed"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export const isProposalStatus = (v: unknown): v is ProposalStatus =>
  typeof v === "string" && (PROPOSAL_STATUSES as readonly string[]).includes(v);

/** Причина закрытия (status = closed) — код; фраза собирается при чтении. */
export const PROPOSAL_CLOSE_REASONS = ["member_removed", "superseded", "outdated", "manual"] as const;
export type ProposalCloseReason = (typeof PROPOSAL_CLOSE_REASONS)[number];

/** Журнал событий предложения (proposal_events.type). */
export const PROPOSAL_EVENT_TYPES = [
  "created", //        предложение записано
  "plan_drafted", //   «Принять»: собран черновик плана (предложение ещё open)
  "plan_released", //  черновик удалён / шаг снят / шаг не исполнился — снова ждёт
  "accepted", //       шаг плана исполнен
  "rejected", //       отклонено человеком
  "withdrawn", //      снято автором
  "closed", //         закрыто (payload.reason)
  "rebased", //        заведено новое поверх текущего (payload.from / payload.to)
] as const;
export type ProposalEventType = (typeof PROPOSAL_EVENT_TYPES)[number];

/**
 * Способ исполнения, который выбирает принимающий. У `replace` способ
 * определён видом адреса (элемент → edit_element, подраздел →
 * edit_subsection) и не выбирается; у `note`:
 *   edit_element / edit_subsection — ручная правка (значение даёт принимающий);
 *   refine_element — точечная генерация в элемент, довод — текст предложения;
 *   regen_subsection / regen — перегенерация подраздела / раздела.
 */
export const PROPOSAL_ACCEPT_METHODS = [
  "edit_element",
  "edit_subsection",
  "refine_element",
  "regen_subsection",
  "regen",
] as const;
export type ProposalAcceptMethod = (typeof PROPOSAL_ACCEPT_METHODS)[number];
export const isProposalAcceptMethod = (v: unknown): v is ProposalAcceptMethod =>
  typeof v === "string" && (PROPOSAL_ACCEPT_METHODS as readonly string[]).includes(v);

/** Пределы текстов (обычный текст, как комментарии 16.1; значение для
 *  подраздела — разметка содержимого, чистится при исполнении). */
export const PROPOSAL_RATIONALE_MAX = 10_000;
export const PROPOSAL_VALUE_MAX = 200_000;
export const PROPOSAL_NOTE_MAX = 2_000;
export const PROPOSALS_PAGE_MAX = 200;
