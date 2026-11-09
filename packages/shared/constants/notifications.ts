/**
 * Уведомления и приглашения (беседа 16.2; врезка «Фаза 16» в 07; 02 §2.38–2.39).
 *
 * Тип уведомления — закрытый список: по нему клиент собирает фразу (`tl()`
 * на языке интерфейса), а сводка по почте — на языке ПОЛУЧАТЕЛЯ при постановке
 * письма; в строке хранятся ТОЛЬКО код, ссылки на объекты и параметры
 * (правило 14.2: хранимое — код + параметры, фраза — при чтении). Типы
 * предложений (Фаза 17) заводятся сейчас — `proposal_created`,
 * `proposal_decided` — строки для них пишет 17.1.
 *
 * Категория — то, что человек отключает в профиле; одна категория объединяет
 * несколько типов (приглашение и исключение — одно «участие»).
 */

export const NOTIFICATION_TYPES = [
  "member_invited", //      меня пригласили (есть аккаунт) → приглашённому
  "member_accepted", //     участник принял приглашение → владельцу
  "member_declined", //     участник отклонил приглашение → владельцу
  "member_role_changed", // владелец сменил мою роль → участнику
  "member_removed", //      владелец исключил меня → участнику
  "comment_new", //         новый корневой комментарий → владельцу и участникам, кроме автора
  "comment_reply", //       ответ в моей ветке → автору корня
  "review_published", //    опубликована рецензия → владельцу и участникам, кроме автора
  "finding_outdated", //    объект моего открытого комментария / замечания изменился → автору
  "proposal_created", //    Фаза 17: новое предложение → тем, кто решает
  "proposal_decided", //    Фаза 17: решение по моему предложению → автору
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const isNotificationType = (v: unknown): v is NotificationType =>
  typeof v === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(v);

/** Категории — единица отключения в профиле. */
export const NOTIFICATION_CATEGORIES = [
  "membership",
  "comments",
  "reviews",
  "outdated",
  "proposals",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export const isNotificationCategory = (v: unknown): v is NotificationCategory =>
  typeof v === "string" && (NOTIFICATION_CATEGORIES as readonly string[]).includes(v);

/** Категория каждого типа — ОДИН источник для записи (отключённая категория не
 *  пишется), сводки по почте (отключённая не входит) и профиля (список
 *  переключателей). Сторож 4bn требует покрытия всех типов. */
export const NOTIFICATION_CATEGORY_OF: Readonly<Record<NotificationType, NotificationCategory>> =
  Object.freeze({
    member_invited: "membership",
    member_accepted: "membership",
    member_declined: "membership",
    member_role_changed: "membership",
    member_removed: "membership",
    comment_new: "comments",
    comment_reply: "comments",
    review_published: "reviews",
    finding_outdated: "outdated",
    proposal_created: "proposals",
    proposal_decided: "proposals",
  });

/** На что ссылается уведомление (вместе с `refId`). */
export const NOTIFICATION_REF_KINDS = ["member", "comment", "review", "finding", "proposal"] as const;
export type NotificationRefKind = (typeof NOTIFICATION_REF_KINDS)[number];

/** Страница списка уведомлений. */
export const NOTIFICATIONS_PAGE_DEFAULT = 30;
export const NOTIFICATIONS_PAGE_MAX = 200;

/** Назначение довода приглашения адреса БЕЗ аккаунта (auth_tokens.purpose,
 *  миграция 0018): довод принадлежит ПРИГЛАСИВШЕМУ (user_id — владелец),
 *  несёт синтез, роль и адрес (new_email); регистрация по ссылке гасит его и
 *  заводит участника `invited` того же синтеза. */
export const MEMBER_INVITE_TOKEN_PURPOSE = "member_invite" as const;
/** Срок ссылки приглашения на регистрацию, часов (как подтверждение адреса). */
export const MEMBER_INVITE_TTL_HOURS = 72;
