/**
 * Правила аккаунта, общие для регистрации, смены пароля и скрипта первого
 * администратора (беседа 8.1, запрос 1, п. 1).
 *
 * До 8.1 PASSWORD_MIN_LENGTH жила локальной константой routes/auth.ts:50 —
 * второго свода правил о пароле в проекте быть не должно: scripts/
 * bootstrap-admin.ts обязан требовать ровно то же, что POST /auth/register.
 * Вместе с ней вынесены EMAIL_RE и DISPLAY_NAME_MAX_LENGTH — те же роуты
 * проверяют их той же строкой кода, а скрипт принимает те же три поля.
 *
 * Потребители: server/routes/auth.ts, scripts/bootstrap-admin.ts,
 * client/pages/RegisterPage.tsx (подпись поля).
 */

/** Минимальная длина пароля (03-spec §2.1: register / password-change). */
export const PASSWORD_MIN_LENGTH = 8;

/** Формат email при регистрации/входе: непустые локальная часть и домен с точкой. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Максимальная длина отображаемого имени (03-spec §2.1 PATCH /auth/me, 0.6). */
export const DISPLAY_NAME_MAX_LENGTH = 100;

/** Текст ошибки короткого пароля — один и тот же у роутов и скрипта. */
export const PASSWORD_TOO_SHORT_MESSAGE = `Минимальная длина пароля — ${PASSWORD_MIN_LENGTH} символов`;
