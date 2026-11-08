/**
 * Закрытые списки социального слоя (беседа 16.1; врезка «Фаза 16» в 07):
 * роли участников синтеза, виды адресов обсуждения, виды и статусы
 * комментариев, статусы рецензий. Один источник для схемы БД (enum колонок),
 * сервисов, маршрутов и клиента 16.3.
 *
 * Роли на уровне синтеза (таблица `synthesis_members`): рецензент читает
 * концепцию на любой ступени видимости и обсуждает её; редактор (Фаза 17)
 * сверх того правит — в 16.1 роль заводится, права её НЕ действуют;
 * владелец — не строка таблицы, а `syntheses.user_id`.
 */

/** Роль участника. 'editor' заводится 16.1, права — с 17.1. */
export const MEMBER_ROLES = ["reviewer", "editor"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
export const isMemberRole = (v: unknown): v is MemberRole =>
  typeof v === "string" && (MEMBER_ROLES as readonly string[]).includes(v);

/** Состояние участия: приглашён (ещё не принял — 16.2) / действует. */
export const MEMBER_STATUSES = ["invited", "active"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/**
 * Вид адреса обсуждения — что именно обсуждается. Адрес = вид + ключ + id +
 * хэш (см. `shared/utils/discussion-address.ts`).
 */
export const ADDRESS_KINDS = [
  "synthesis",
  "section",
  "subsection",
  "category",
  "edge",
  "thesis",
  "glossary_term",
] as const;
export type AddressKind = (typeof ADDRESS_KINDS)[number];
export const isAddressKind = (v: unknown): v is AddressKind =>
  typeof v === "string" && (ADDRESS_KINDS as readonly string[]).includes(v);

/** Состояние адреса ВЫЧИСЛЯЕТСЯ при чтении (не хранится): объект найден и
 *  хэш содержимого тот же — current; найден (по id либо заново по ключу), но
 *  содержимое изменилось — outdated («относится к прежней версии»); не найден
 *  ни по id, ни по ключу — deleted. */
export const ADDRESS_STATES = ["current", "outdated", "deleted"] as const;
export type AddressState = (typeof ADDRESS_STATES)[number];

/** Необязательный вид комментария — вместо реакций (решение пользователя
 *  2026-11-05): вопрос, возражение, источник, неясность. null — без вида. */
export const COMMENT_KINDS = ["question", "objection", "source", "unclear"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];
export const isCommentKind = (v: unknown): v is CommentKind =>
  typeof v === "string" && (COMMENT_KINDS as readonly string[]).includes(v);

/** Статус ВЕТКИ (корневого комментария): открыта / решена / скрыта владельцем.
 *  У ответов статус всегда 'open' — ветку решает корень; скрыть владелец может
 *  любой комментарий. */
export const COMMENT_STATUSES = ["open", "resolved", "hidden"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];
export const isCommentStatus = (v: unknown): v is CommentStatus =>
  typeof v === "string" && (COMMENT_STATUSES as readonly string[]).includes(v);

/** Статус рецензии: черновик виден только автору; опубликованная —
 *  участникам (правка — новой редакцией); отозванная остаётся видимой с
 *  пометкой. */
export const REVIEW_STATUSES = ["draft", "published", "withdrawn"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Текстовые поля рецензии — все обычный текст (абзацы по пустой строке). */
export const REVIEW_TEXT_FIELDS = [
  "title",
  "summary",
  "strengths",
  "objections",
  "minor",
  "questions",
  "conclusion",
] as const;
export type ReviewTextField = (typeof REVIEW_TEXT_FIELDS)[number];

/** Пределы обычного текста (символов). Выдержка объекта — «как было» рядом с
 *  адресом; тела — комментария, поля рецензии, замечания. */
export const ADDRESS_EXCERPT_MAX = 300;
export const COMMENT_BODY_MAX = 10_000;
export const REVIEW_FIELD_MAX = 20_000;
export const REVIEW_TITLE_MAX = 300;
export const FINDING_BODY_MAX = 10_000;
/** Страница списка комментариев (курсор по created_at+id). */
export const COMMENTS_PAGE_DEFAULT = 50;
export const COMMENTS_PAGE_MAX = 200;
