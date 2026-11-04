/**
 * Роуты аутентификации (беседа 0.2). Контракт — 03-specification §2.1:
 *   POST /auth/register  { email, password, displayName? } → { user }
 *   POST /auth/login     { email, password }               → { user } + cookie
 *   POST /auth/logout    (no body)                         → { ok: true }
 *   GET  /auth/me                                          → { user }
 *   PATCH /auth/me       { displayName?, uiLocale?, genLang? } → { user }
 *                        (беседа 0.6, A3; 11.2: uiLocale пишет и gen_lang
 *                        правилом genLangForUi, genLang — только gen_lang):
 *     trim; пустая строка → null; длина > 100 → VALIDATION_ERROR + details)
 *   POST /auth/password-change { currentPassword, newPassword } → { ok: true }
 *     (беседа 0.5, требование A3: неверный currentPassword →
 *      401 AUTH_REQUIRED единым ответом; прочие сессии пользователя
 *      инвалидируются, текущая остаётся живой)
 *
 *   DELETE /auth/me { password } → { ok: true, deletedSyntheses,
 *     subscriptionCanceled } (беседа 7.1, долг §12 6.1): подтверждение
 *     паролем (неверный → 401 AUTH_REQUIRED единым ответом); активная
 *     генерация → 409 GENERATION_IN_PROGRESS; строка users анонимизируется
 *     (финансовая история RESTRICT остаётся), сессии/ключи/синтезы удаляются,
 *     подписка отменяется — см. services/account-deletion.ts; cookie сессии
 *     очищается.
 *
 *   Управление доступом (беседа 8.1; requireAuth + requireAdmin):
 *   GET  /auth/users ?query=&limit=&offset= → { users: AdminUserRow[], total }
 *     минимальный список для назначения роли (id, email, displayName,
 *     role, createdAt); query — подстрока email/displayName (ILIKE);
 *     анонимизированные deleted-*@deleted.invalid (7.1) не показываются.
 *   POST /auth/users/:id/role { role: 'user' | 'admin' } → { user }
 *     роль вне двух значений → 400 VALIDATION_ERROR (details.role);
 *     :id не UUID / не найден → 404 NOT_FOUND; своя роль → 409
 *     SELF_ROLE_CHANGE; понижение последнего администратора → 409
 *     LAST_ADMIN; та же роль → 200 без изменений и без строки журнала;
 *     успех → полный user + строка admin_audit user.role.changed
 *     { from, to } — той же транзакцией (services/admin-audit.ts);
 *     транзакция держит pg_advisory_xact_lock(ADMIN_SET_LOCK_KEY), чтобы
 *     две параллельные смены не насчитали лишнего администратора.
 *   GET  /auth/audit ?limit=50 → { entries: AdminAuditEntry[] } — последние
 *     строки журнала, новые первыми (limit 1..500).
 *
 *   Почта (беседа 9.1; services/auth-tokens.ts + services/mail/*):
 *   POST /auth/register — письмо с подтверждением адреса ставится в очередь
 *     В ТОЙ ЖЕ транзакции, что и создание пользователя (под точкой
 *     сохранения: сбой постановки регистрацию не отменяет, откат регистрации
 *     письма не оставляет).
 *   POST /auth/email/verify/request (requireAuth) → { ok, alreadyVerified,
 *     sent } — повторная отправка себе; адрес уже подтверждён → 200 без письма.
 *   POST /auth/email/verify/confirm { token } → { ok: true } — БЕЗ сессии
 *     (ссылку открывают и в другом браузере); негодный довод → 400
 *     TOKEN_INVALID одним кодом на просроченный/использованный/чужой.
 *   POST /auth/password-reset/request { email } → { ok: true, message } —
 *     БЕЗ сессии; ОДИНАКОВЫЙ ответ, есть такой адрес или нет.
 *   POST /auth/password-reset/confirm { token, newPassword } → { ok: true } —
 *     правила пароля те же, что при регистрации (details.newPassword);
 *     негодный довод → 400 TOKEN_INVALID; успех — смена пароля, ЗАВЕРШЕНИЕ
 *     ВСЕХ сессий пользователя и подтверждение адреса, если он ещё не
 *     подтверждён (переход по ссылке из письма доказывает владение ящиком
 *     ровно так же, как ссылка подтверждения — «По факту 9.1»).
 *   Вход при неподтверждённом адресе НЕ запрещён; подтверждение пока не
 *     ограничивает ничего — только отмечается (users.email_verified_at,
 *     AuthUser.emailVerified).
 *   Запросы, порождающие письмо по чужой воле (verify/request,
 *     password-reset/request), — под отдельным лимитом scope 'mail'
 *     (RATE_LIMIT_MAIL_PER_HOUR) сверх общего rateLimiter index.ts.
 *
 *   Беседа 15.3 (Д-72, Д-73):
 *   POST /auth/login — для несуществующего адреса сравнение bcrypt идёт с
 *     холостым хэшем (время ответа не выдаёт адрес); POST /auth/password-reset/
 *     request отвечает не раньше AUTH_MIN_RESPONSE_MS при любом исходе.
 *   POST /auth/email/change/request { newEmail, password } (requireAuth,
 *     mailLimiter) → { ok: true, message } — довод 'email_change' с новым
 *     адресом в строке и письмо на НОВЫЙ адрес; неверный пароль → 401
 *     AUTH_REQUIRED; занятый адрес → тот же 200 без письма (анти-enumeration,
 *     время — под тем же минимумом); текущий адрес → 400 details.newEmail.
 *   POST /auth/email/change/confirm { token } → { ok: true, email } — БЕЗ
 *     сессии; адрес сменён и подтверждён, доводы сброса пароля и
 *     подтверждения погашены, уведомление на ПРЕЖНИЙ адрес; негодный довод
 *     ИЛИ адрес, занятый к этому моменту, → 400 TOKEN_INVALID одним кодом.
 *   GET /auth/mail-outbox ?limit=50 (requireAdmin) → { counts, rows } —
 *     счётчики очереди по статусам и последние строки без тел.
 *
 * Правила пароля/email/имени — @philosynth/shared/constants/auth (8.1 п.1:
 * второго свода правил быть не должно — bootstrap-admin проверяет то же).
 *
 * Формат ошибок: { error, code, details? }; коды — §4.3.
 * Примечания к кодам (в §4.3 нет отдельных кодов для конфликтов/кредов):
 *   - занятый email → 409 VALIDATION_ERROR (details.email);
 *   - неверные креды → 401 AUTH_REQUIRED (сессия не выдана), текст ошибки
 *     не раскрывает, существует ли email.
 */
import {
  DISPLAY_NAME_MAX_LENGTH,
  EMAIL_RE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RESET_REQUESTED_MESSAGE,
  PASSWORD_TOO_SHORT_TEMPLATE,
  TOKEN_INVALID_MESSAGE,
} from "@philosynth/shared/constants/auth";
import { tData } from "@philosynth/shared/i18n/data"; // 11.4: данные по месту показа
import type { AdminUserRow, UserRole } from "@philosynth/shared/types/admin";
import { UI_LOCALES, genLangForUi, isUiLocale } from "@philosynth/shared/i18n/locales"; // 11.2
import { and, count, desc, eq, ilike, isNull, ne, notLike, or, sql } from "drizzle-orm";
import { Hono } from "hono";

import { db, schema } from "../db/index.js";
import { env } from "../env.js";
import { requireAdmin } from "../middleware/admin-only.js";
import {
  clearSessionCookie,
  createSession,
  getSessionToken,
  hashPassword,
  invalidateSession,
  requireAuth,
  sessionIdFromToken,
  setSessionCookie,
  validateSessionToken,
  verifyPassword,
  type AuthEnv,
} from "../middleware/auth.js";
import { AccountDeletionError, deleteAccount } from "../services/account-deletion.js"; // 7.1
import {
  ADMIN_ACTIONS,
  ADMIN_SET_LOCK_KEY,
  clientIpOf,
  listAudit,
  writeAudit,
} from "../services/admin-audit.js"; // 8.1
import {
  consumeToken,
  consumeTokenRow,
  isTokenUsable,
  queueEmailChangeMail,
  queueEmailChangedNotice,
  queuePasswordResetMail,
  queueVerificationMail,
  revokeTokens,
} from "../services/auth-tokens.js"; // 9.1; 15.3 — смена адреса
import { getOutboxCounts, listOutboxRows } from "../services/mail/outbox.js"; // 15.3 (Д-72 п.3)
import { rateLimiter } from "../middleware/rate-limiter.js";
import { tl } from "@philosynth/shared/i18n/t";
import { currentLocale } from "../i18n/locale.js"; // 14.1 (Д-51): язык письма при регистрации

/* ── Валидация тела запроса ──────────────────────────────────────────── */

// EMAIL_RE / PASSWORD_MIN_LENGTH / DISPLAY_NAME_MAX_LENGTH — из shared (8.1)

interface CredentialsBody {
  email: string;
  password: string;
  displayName?: string | undefined;
}

/** Разбор JSON-тела: битый JSON → null (роут ответит VALIDATION_ERROR). */
async function readJson(c: { req: { json(): Promise<unknown> } }): Promise<
  Record<string, unknown> | null
> {
  try {
    const body = await c.req.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Проверка полей; возвращает нормализованные креды либо карту ошибок. */
function parseCredentials(
  body: Record<string, unknown> | null,
  opts: { validateStrength: boolean },
): { ok: true; value: CredentialsBody } | { ok: false; details: Record<string, string> } {
  const details: Record<string, string> = {};
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const displayNameRaw = body?.displayName;

  if (!email) details.email = tl("server.routes.auth.requiredField", "Обязательное поле");
  else if (!EMAIL_RE.test(email)) details.email = tl("server.routes.auth.invalidEmail", "Невалидный email");

  if (!password) details.password = tl("server.routes.auth.requiredField", "Обязательное поле");
  else if (opts.validateStrength && password.length < PASSWORD_MIN_LENGTH) {
    details.password = tData(PASSWORD_TOO_SHORT_TEMPLATE, { minLength: PASSWORD_MIN_LENGTH });
  }

  let displayName: string | undefined;
  if (displayNameRaw !== undefined) {
    if (typeof displayNameRaw !== "string") {
      details.displayName = tl("server.routes.auth.mustBeString", "Должно быть строкой");
    } else {
      displayName = displayNameRaw.trim() || undefined;
    }
  }

  if (Object.keys(details).length > 0) return { ok: false, details };
  return { ok: true, value: { email, password, displayName } };
}

/* ── 15.3 (Д-72 п.2): время ответа не выдаёт, есть ли адрес ──────────── */

/**
 * Холостой хэш для входа по несуществующему адресу: тот же bcrypt с тем же
 * числом раундов, что у настоящих паролей, вычислен один раз при импорте.
 * До 15.3 вход для несуществующего адреса bcrypt не звал вовсе, и разница во
 * времени (десятки мс против единиц) выдавала, зарегистрирован ли адрес.
 */
const DUMMY_PASSWORD_HASH: Promise<string> = hashPassword("philosynth-dummy-password-15.3");

/**
 * Ответ не раньше env.auth.minResponseMs от начала обработчика при ЛЮБОМ
 * исходе. У форм, где путь существующего адреса длиннее (сброс пароля:
 * savepoint, гашение прежних доводов, два INSERT; смена адреса: bcrypt и
 * постановка), минимум перекрывает разницу; мерить — медианами многих
 * прогонов, не одним (тестовый запрос 15.3).
 */
async function withMinResponse<T>(fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  const result = await fn();
  const left = env.auth.minResponseMs - (Date.now() - startedAt);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
  return result;
}

/* ── Роуты ───────────────────────────────────────────────────────────── */

export const authRoutes = new Hono<AuthEnv>();

authRoutes.post("/register", async (c) => {
  const parsed = parseCredentials(await readJson(c), { validateStrength: true });
  if (!parsed.ok) {
    return c.json(
      {
        error: tl("common.invalidData", "Невалидные данные"),
        code: "VALIDATION_ERROR",
        details: parsed.details,
      },
      400,
    );
  }
  const { email, password, displayName } = parsed.value;

  const passwordHash = await hashPassword(password);
  try {
    // 9.1: пользователь и письмо с подтверждением — ОДНОЙ транзакцией.
    // queueVerificationMail работает под точкой сохранения: сбой постановки
    // письма регистрацию не отменяет (человек нажмёт «Отправить ещё раз»),
    // а откат регистрации (23505) уносит и довод, и письмо.
    const user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.users)
        .values({ email, passwordHash, displayName: displayName ?? null })
        .returning({
          id: schema.users.id,
          email: schema.users.email,
          displayName: schema.users.displayName,
        });
      // 14.1 (Д-51): у нового пользователя ui_locale ещё нет — письмо под языком запроса
      await queueVerificationMail(tx, { ...created!, uiLocale: currentLocale() });
      return created!;
    });
    return c.json({ user }, 201);
  } catch (err) {
    // Гонка/дубль по UNIQUE(email) — postgres код 23505.
    // drizzle-orm ≥0.44 оборачивает PostgresError в DrizzleQueryError,
    // код лежит в err.cause.code — проверяем оба уровня.
    const e = err as { code?: string; cause?: { code?: string } };
    if (e.code === "23505" || e.cause?.code === "23505") {
      return c.json(
        {
          error: tl("server.routes.auth.emailTaken", "Пользователь с таким email уже зарегистрирован"),
          code: "VALIDATION_ERROR",
          details: { email: tl("server.routes.auth.alreadyRegistered", "Уже зарегистрирован") },
        },
        409,
      );
    }
    throw err;
  }
});

authRoutes.post("/login", async (c) => {
  const parsed = parseCredentials(await readJson(c), { validateStrength: false });
  if (!parsed.ok) {
    return c.json(
      {
        error: tl("common.invalidData", "Невалидные данные"),
        code: "VALIDATION_ERROR",
        details: parsed.details,
      },
      400,
    );
  }
  const { email, password } = parsed.value;

  const rows = await db.query.users.findMany({
    where: (u, { eq }) => eq(u.email, email),
    limit: 1,
  });
  const user = rows[0];
  // Единый ответ для «нет такого email» и «неверный пароль». 15.3 (Д-72):
  // и единое ВРЕМЯ — у несуществующего адреса сравнение всё равно идёт, с
  // холостым хэшем того же bcrypt; результат заведомо ложный
  const valid = user
    ? await verifyPassword(password, user.passwordHash)
    : (await verifyPassword(password, await DUMMY_PASSWORD_HASH)) && false;
  if (!user || !valid) {
    return c.json(
      { error: tl("server.routes.auth.wrongCredentials", "Неверный email или пароль"), code: "AUTH_REQUIRED" },
      401,
    );
  }

  const { token, session } = await createSession(user.id);
  setSessionCookie(c, token, session.expiresAt);
  return c.json({
    user: { id: user.id, email: user.email, displayName: user.displayName },
  });
});

authRoutes.post("/logout", async (c) => {
  // Толерантный logout: чистим cookie всегда, сессию — если она была
  const token = getSessionToken(c);
  if (token) {
    const result = await validateSessionToken(token);
    if (result) await invalidateSession(result.session.id);
    else await invalidateSession(sessionIdFromToken(token)); // на случай истёкшей
  }
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.post("/password-change", requireAuth, async (c) => {
  // 03-spec §2.1 (беседа 0.5): смена пароля под живой сессией.
  const body = await readJson(c);
  const details: Record<string, string> = {};
  const currentPassword =
    typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword) details.currentPassword = tl("server.routes.auth.requiredField", "Обязательное поле");
  if (!newPassword) details.newPassword = tl("server.routes.auth.requiredField", "Обязательное поле");
  else if (newPassword.length < PASSWORD_MIN_LENGTH) {
    details.newPassword = tData(PASSWORD_TOO_SHORT_TEMPLATE, { minLength: PASSWORD_MIN_LENGTH });
  }
  if (Object.keys(details).length > 0) {
    return c.json(
      { error: tl("common.invalidData", "Невалидные данные"), code: "VALIDATION_ERROR", details },
      400,
    );
  }

  const user = c.get("user");
  const session = c.get("session");

  // AuthUser контекста не содержит password_hash — читаем из БД.
  const rows = await db.query.users.findMany({
    where: (u, { eq: eqOp }) => eqOp(u.id, user.id),
    limit: 1,
  });
  const dbUser = rows[0];
  // Единый ответ 401 AUTH_REQUIRED (анти-enumeration, как в login):
  // не различаем «пользователь исчез» и «пароль не совпал».
  const valid = dbUser
    ? await verifyPassword(currentPassword, dbUser.passwordHash)
    : false;
  if (!dbUser || !valid) {
    return c.json(
      { error: tl("server.routes.auth.wrongCurrentPassword", "Неверный текущий пароль"), code: "AUTH_REQUIRED" },
      401,
    );
  }

  const passwordHash = await hashPassword(newPassword);
  // Атомарно: новый хэш + инвалидация всех сессий пользователя,
  // КРОМЕ текущей (защита от угнанных сессий; текущая живёт — §2.1).
  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));
    await tx
      .delete(schema.sessions)
      .where(
        and(
          eq(schema.sessions.userId, user.id),
          ne(schema.sessions.id, session.id),
        ),
      );
  });

  return c.json({ ok: true });
});

authRoutes.delete("/me", requireAuth, async (c) => {
  // 7.1: удаление аккаунта — подтверждение текущим паролем
  const body = await readJson(c);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) {
    return c.json(
      { error: tl("common.invalidData", "Невалидные данные"), code: "VALIDATION_ERROR", details: { password: tl("server.routes.auth.requiredField", "Обязательное поле") } },
      400,
    );
  }
  const user = c.get("user");
  const rows = await db.query.users.findMany({
    where: (u, { eq: eqOp }) => eqOp(u.id, user.id),
    limit: 1,
  });
  const dbUser = rows[0];
  const valid = dbUser ? await verifyPassword(password, dbUser.passwordHash) : false;
  if (!dbUser || !valid) {
    return c.json({ error: tl("server.routes.auth.wrongPassword", "Неверный пароль"), code: "AUTH_REQUIRED" }, 401);
  }
  try {
    const result = await deleteAccount(user.id, { ip: clientIpOf(c) });
    clearSessionCookie(c);
    return c.json({
      ok: true,
      deletedSyntheses: result.deletedSyntheses,
      subscriptionCanceled: result.subscriptionCanceled,
    });
  } catch (err) {
    if (err instanceof AccountDeletionError) {
      // 8.1: LAST_ADMIN — единственный администратор не может уйти
      return c.json(
        { error: err.message, code: err.code },
        err.code === "GENERATION_IN_PROGRESS" || err.code === "LAST_ADMIN" ? 409 : 404,
      );
    }
    throw err;
  }
});

/** Полный user, как в GET /auth/me (numeric приходит строкой из postgres.js). */
function userDto(u: typeof schema.users.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    balanceUsd: Number(u.balanceUsd),
    emailVerified: u.emailVerifiedAt !== null,
    uiLocale: u.uiLocale,
    genLang: u.genLang,
  };
}

authRoutes.get("/me", requireAuth, (c) => {
  const user = c.get("user");
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      balanceUsd: user.balanceUsd,
      emailVerified: user.emailVerified,
      uiLocale: user.uiLocale, // 11.2
      genLang: user.genLang, // 11.2
    },
  });
});

/** Предел длины языка генерации, введённого руками («Другой…» в форме). */
const GEN_LANG_MAX_LENGTH = 60;

authRoutes.patch("/me", requireAuth, async (c) => {
  // 03-spec §2.1 (беседа 0.6, A3): смена отображаемого имени.
  // 11.2: + { uiLocale } — язык интерфейса И язык генерации по правилу
  // владельца (genLangForUi); { genLang } — только язык генерации, интерфейс
  // не трогается. Связь односторонняя. Поля независимы и необязательны, но
  // хотя бы одно обязано быть.
  const body = await readJson(c);
  const details: Record<string, string> = {};
  const patch: Partial<typeof schema.users.$inferInsert> = {};

  const rawName = body?.displayName;
  if (rawName !== undefined) {
    if (typeof rawName !== "string") details.displayName = tl("server.routes.auth.mustBeString", "Должно быть строкой");
    else {
      const trimmed = rawName.trim();
      if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
        details.displayName = tl("server.routes.auth.maxLength", "Максимальная длина — {maxLength} символов", { maxLength: DISPLAY_NAME_MAX_LENGTH });
      } else patch.displayName = trimmed || null; // пустая строка = сброс имени
    }
  }

  const rawUi = body?.uiLocale;
  if (rawUi !== undefined) {
    if (!isUiLocale(rawUi)) {
      details.uiLocale = tl("server.routes.auth.uiLocaleAllowed", "Допустимые языки интерфейса: {locales}", { locales: UI_LOCALES.join(", ") });
    } else {
      patch.uiLocale = rawUi;
      patch.genLang = genLangForUi(rawUi); // правило владельца: интерфейс → генерация
    }
  }

  const rawGen = body?.genLang;
  if (rawGen !== undefined) {
    if (typeof rawGen !== "string" || !rawGen.trim()) details.genLang = tl("server.routes.auth.mustBeNonEmptyString", "Должно быть непустой строкой");
    else if (rawGen.trim().length > GEN_LANG_MAX_LENGTH) details.genLang = tl("server.routes.auth.maxLength", "Максимальная длина — {maxLength} символов", { maxLength: GEN_LANG_MAX_LENGTH });
    else patch.genLang = rawGen.trim(); // интерфейс НЕ меняется
  }

  if (rawName === undefined && rawUi === undefined && rawGen === undefined) {
    details.displayName = tl("server.routes.auth.requiredField", "Обязательное поле");
  }
  if (Object.keys(details).length) {
    return c.json({ error: tl("common.invalidData", "Невалидные данные"), code: "VALIDATION_ERROR", details }, 400);
  }

  const sessionUser = c.get("user");
  const [updated] = await db
    .update(schema.users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.users.id, sessionUser.id))
    .returning();
  if (!updated) {
    // Пользователь исчез под живой сессией — единый 401, как везде в auth
    return c.json(
      { error: tl("common.authRequired", "Требуется авторизация"), code: "AUTH_REQUIRED" },
      401,
    );
  }
  return c.json({ user: userDto(updated) });
});

/* ── Почта: подтверждение адреса и сброс пароля (беседа 9.1) ─────────── */

/** Лимит на запросы, порождающие письмо (сверх общего лимитера index.ts):
 *  форма сброса открыта без авторизации — ею нельзя давать засыпать ящик */
const mailLimiter = rateLimiter({
  scope: "mail",
  limit: env.rateLimit.mailRequestsPerHour,
  windowSec: 3600,
});

/** Адреса анонимизированных 7.1 строк — писать туда некому */
const DELETED_EMAIL_SUFFIX = "@deleted.invalid";

function tokenInvalid(c: { json: (body: unknown, status: 400) => Response }): Response {
  return c.json({ error: tData(TOKEN_INVALID_MESSAGE), code: "TOKEN_INVALID" }, 400);
}

authRoutes.post("/email/verify/request", mailLimiter, requireAuth, async (c) => {
  const user = c.get("user");
  if (user.emailVerified) {
    return c.json({ ok: true, alreadyVerified: true, sent: false });
  }
  const sent = await queueVerificationMail(db, {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    uiLocale: user.uiLocale, // 14.1 (Д-51): язык получателя
  });
  if (!sent) {
    return c.json(
      { error: tl("server.routes.auth.emailQueueFailed", "Не удалось поставить письмо в очередь — попробуйте позже"), code: "INTERNAL_ERROR" },
      500,
    );
  }
  return c.json({ ok: true, alreadyVerified: false, sent: true });
});

authRoutes.post("/email/verify/confirm", async (c) => {
  const body = await readJson(c);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) return tokenInvalid(c);

  const ok = await db.transaction(async (tx) => {
    const userId = await consumeToken(tx, token, "email_verify");
    if (!userId) return false;
    // Повторное подтверждение уже подтверждённого адреса дату не двигает
    await tx
      .update(schema.users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.users.id, userId), isNull(schema.users.emailVerifiedAt)));
    return true;
  });
  return ok ? c.json({ ok: true }) : tokenInvalid(c);
});

authRoutes.post("/password-reset/request", mailLimiter, async (c) => {
  const body = await readJson(c);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email)) {
    // Формат адреса существования не выдаёт — отказ по форме допустим
    return c.json(
      {
        error: tl("common.invalidData", "Невалидные данные"),
        code: "VALIDATION_ERROR",
        details: { email: email ? tl("server.routes.auth.invalidEmail", "Невалидный email") : tl("server.routes.auth.requiredField", "Обязательное поле") },
      },
      400,
    );
  }
  // 15.3 (Д-72 п.2): ответ не раньше минимума при любом исходе — путь
  // существующего адреса (savepoint, гашение прежних доводов, два INSERT)
  // длиннее пути несуществующего (один SELECT), и время ответа выдавало адрес.
  // Постановка письма остаётся В пути ответа: довод и письмо живут под одной
  // точкой сохранения (9.1) — уносить письмо в фон значило бы либо выдавать
  // довод без письма, либо заводить вторую очередь
  await withMinResponse(async () => {
    if (!email.endsWith(DELETED_EMAIL_SUFFIX)) {
      const rows = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          displayName: schema.users.displayName,
          uiLocale: schema.users.uiLocale, // 14.1 (Д-51): язык получателя
        })
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1);
      // Сбой постановки пишется в лог; ответ от него НЕ зависит (иначе он
      // различал бы существующий адрес и несуществующий)
      if (rows[0]) await queuePasswordResetMail(db, rows[0]);
    }
  });
  // ОДИН ответ на оба случая (анти-enumeration, как login 0.2)
  return c.json({ ok: true, message: tData(PASSWORD_RESET_REQUESTED_MESSAGE) });
});

authRoutes.post("/password-reset/confirm", async (c) => {
  const body = await readJson(c);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  // Пароль проверяется ДО довода: короткий пароль не должен сжигать ссылку
  const details: Record<string, string> = {};
  if (!newPassword) details.newPassword = tl("server.routes.auth.requiredField", "Обязательное поле");
  else if (newPassword.length < PASSWORD_MIN_LENGTH) {
    details.newPassword = tData(PASSWORD_TOO_SHORT_TEMPLATE, { minLength: PASSWORD_MIN_LENGTH });
  }
  if (Object.keys(details).length > 0) {
    return c.json({ error: tl("common.invalidData", "Невалидные данные"), code: "VALIDATION_ERROR", details }, 400);
  }
  // Дешёвая предпроверка — bcrypt не гоняется на заведомо негодном доводе;
  // решает погашение в транзакции ниже
  if (!token || !(await isTokenUsable(db, token, "password_reset"))) return tokenInvalid(c);

  const passwordHash = await hashPassword(newPassword);
  const ok = await db.transaction(async (tx) => {
    const userId = await consumeToken(tx, token, "password_reset");
    if (!userId) return false;
    const now = new Date();
    await tx
      .update(schema.users)
      .set({
        passwordHash,
        updatedAt: now,
        // Вариант (а): ссылка пришла на этот ящик — владение доказано
        emailVerifiedAt: sql`coalesce(${schema.users.emailVerifiedAt}, ${now.toISOString()}::timestamptz)`,
      })
      .where(eq(schema.users.id, userId));
    // В отличие от password-change (0.5) «текущей» сессии нет: гибнут ВСЕ
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    // Адрес подтверждён этим же переходом — ждущие ссылки подтверждения не нужны
    await revokeTokens(tx, userId, "email_verify", now);
    return true;
  });
  if (!ok) return tokenInvalid(c);
  // Если запрос пришёл с cookie этого пользователя — она уже мертва
  clearSessionCookie(c);
  return c.json({ ok: true });
});

/* ── Управление доступом (беседа 8.1) ────────────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_ROLES: readonly UserRole[] = ["user", "admin"];
/** Анонимизированные 7.1 строки — назначать им нечего, из списка убраны */
const DELETED_EMAIL_PATTERN = "deleted-%@deleted.invalid";

function toAdminUserRow(u: {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  createdAt: Date;
}): AdminUserRow {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  };
}

function parseIntParam(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

authRoutes.get("/users", requireAuth, requireAdmin, async (c) => {
  const query = (c.req.query("query") ?? "").trim();
  const limit = parseIntParam(c.req.query("limit"), 20, 1, 100);
  const offset = parseIntParam(c.req.query("offset"), 0, 0, 1_000_000);

  const notDeleted = notLike(schema.users.email, DELETED_EMAIL_PATTERN);
  const where = query
    ? and(
        notDeleted,
        or(
          ilike(schema.users.email, `%${query}%`),
          ilike(schema.users.displayName, `%${query}%`),
        ),
      )
    : notDeleted;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        displayName: schema.users.displayName,
        role: schema.users.role,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(where)
      .orderBy(desc(schema.users.createdAt), desc(schema.users.id))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(schema.users).where(where),
  ]);
  return c.json({ users: rows.map(toAdminUserRow), total: Number(totalRow?.n ?? 0) });
});

authRoutes.post("/users/:id/role", requireAuth, requireAdmin, async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) {
    return c.json({ error: tl("common.userNotFound", "Пользователь не найден"), code: "NOT_FOUND" }, 404);
  }
  const body = await readJson(c);
  const role = body?.role;
  if (typeof role !== "string" || !(USER_ROLES as readonly string[]).includes(role)) {
    return c.json(
      {
        error: tl("common.invalidData", "Невалидные данные"),
        code: "VALIDATION_ERROR",
        details: { role: tl("server.routes.auth.expectedRole", "Ожидается 'user' или 'admin'") },
      },
      400,
    );
  }
  const actor = c.get("user");
  if (id === actor.id) {
    // Иначе единственный администратор понижает сам себя
    return c.json(
      {
        error: tl("server.routes.auth.ownRoleForbidden", "Свою роль изменить нельзя — попросите другого администратора"),
        code: "SELF_ROLE_CHANGE",
      },
      409,
    );
  }

  type Outcome =
    | { kind: "not_found" }
    | { kind: "last_admin" }
    | { kind: "ok"; changed: boolean; user: typeof schema.users.$inferSelect };

  const outcome = await db.transaction(async (tx): Promise<Outcome> => {
    // Сериализация операций над множеством администраторов (см. admin-audit.ts)
    await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_SET_LOCK_KEY})`);
    const [target] = await tx
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .for("update")
      .limit(1);
    if (!target) return { kind: "not_found" };
    if (target.role === role) return { kind: "ok", changed: false, user: target };
    if (target.role === "admin" && role === "user") {
      const [adm] = await tx
        .select({ n: count() })
        .from(schema.users)
        .where(eq(schema.users.role, "admin"));
      if (Number(adm?.n ?? 0) <= 1) return { kind: "last_admin" };
    }
    const [updated] = await tx
      .update(schema.users)
      .set({ role: role as UserRole, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning();
    await writeAudit(tx, {
      actorId: actor.id,
      action: ADMIN_ACTIONS.USER_ROLE_CHANGED,
      targetType: "user",
      targetId: id,
      details: { from: target.role, to: role, email: target.email },
      ip: clientIpOf(c),
    });
    return { kind: "ok", changed: true, user: updated! };
  });

  if (outcome.kind === "not_found") {
    return c.json({ error: tl("common.userNotFound", "Пользователь не найден"), code: "NOT_FOUND" }, 404);
  }
  if (outcome.kind === "last_admin") {
    return c.json(
      {
        error: tl("server.routes.auth.lastAdminForbidden", "Нельзя понизить последнего администратора — сначала назначьте второго"),
        code: "LAST_ADMIN",
      },
      409,
    );
  }
  const u = outcome.user;
  return c.json({
    user: {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      balanceUsd: Number(u.balanceUsd),
      createdAt: u.createdAt.toISOString(),
    },
    changed: outcome.changed,
  });
});

authRoutes.get("/audit", requireAuth, requireAdmin, async (c) => {
  const limit = parseIntParam(c.req.query("limit"), 50, 1, 500);
  return c.json({ entries: await listAudit(limit) });
});

/* ── Очередь писем — вкладка «Почта» админки (беседа 15.3, Д-72 п.3) ──── */

authRoutes.get("/mail-outbox", requireAuth, requireAdmin, async (c) => {
  // Счётчики по статусам и последние строки БЕЗ тел: тела отправленных
  // затёрты работником (9.1), у ждущих — живая ссылка-довод; повтора
  // отправки нет по той же причине
  const limit = parseIntParam(c.req.query("limit"), 50, 1, 500);
  const [counts, rows] = await Promise.all([getOutboxCounts(), listOutboxRows(limit)]);
  return c.json({ counts, rows });
});

/* ── Смена адреса почты (беседа 15.3, Д-73) ──────────────────────────── */

/**
 * Запрос смены: текущий пароль + новый адрес → довод 'email_change' с новым
 * адресом в строке (миграция 0015) и письмо со ссылкой на НОВЫЙ адрес.
 * Ответ на занятый адрес НЕ отличается от ответа на свободный (ни кодом,
 * ни телом, ни временем — withMinResponse): иначе форма — прибор для
 * проверки, кто зарегистрирован. Письма на занятый адрес нет: его владелец
 * не просил, а подтвердить чужой адрес всё равно нельзя — confirm проверит
 * занятость ещё раз. admin_audit не пишется: действие самого пользователя
 * (журнал — для администраторов и скриптов); след — строка довода с
 * new_email и уведомление на прежний адрес после подтверждения.
 */
authRoutes.post("/email/change/request", mailLimiter, requireAuth, async (c) => {
  const body = await readJson(c);
  const details: Record<string, string> = {};
  const newEmail = typeof body?.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!newEmail) details.newEmail = tl("server.routes.auth.requiredField", "Обязательное поле");
  else if (!EMAIL_RE.test(newEmail)) details.newEmail = tl("server.routes.auth.invalidEmail", "Невалидный email");
  if (!password) details.password = tl("server.routes.auth.requiredField", "Обязательное поле");
  if (Object.keys(details).length > 0) {
    return c.json({ error: tl("common.invalidData", "Невалидные данные"), code: "VALIDATION_ERROR", details }, 400);
  }
  const user = c.get("user");
  if (newEmail === user.email) {
    return c.json(
      {
        error: tl("common.invalidData", "Невалидные данные"),
        code: "VALIDATION_ERROR",
        details: { newEmail: tl("server.routes.auth.sameEmail", "Это текущий адрес учётной записи") },
      },
      400,
    );
  }
  const outcome = await withMinResponse(async (): Promise<"wrong_password" | "ok"> => {
    const rows = await db.query.users.findMany({ where: (u, { eq: eqOp }) => eqOp(u.id, user.id), limit: 1 });
    const dbUser = rows[0];
    const valid = dbUser ? await verifyPassword(password, dbUser.passwordHash) : false;
    if (!dbUser || !valid) return "wrong_password";
    // Занят ли адрес — по той же колонке, что UNIQUE(email) у регистрации;
    // исход на ответ НЕ влияет (ни кодом, ни временем: письмо под той же
    // минимальной длительностью, что и его отсутствие)
    const taken = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, newEmail))
      .limit(1);
    if (taken.length === 0) {
      await queueEmailChangeMail(
        db,
        { id: dbUser.id, email: dbUser.email, displayName: dbUser.displayName, uiLocale: dbUser.uiLocale },
        newEmail,
      );
    }
    return "ok";
  });
  if (outcome === "wrong_password") {
    // Единый 401, как у password-change (0.5) и DELETE /me (7.1)
    return c.json({ error: tl("server.routes.auth.wrongPassword", "Неверный пароль"), code: "AUTH_REQUIRED" }, 401);
  }
  // ОДИН ответ на занятый и свободный адрес (анти-enumeration)
  return c.json({ ok: true, message: tl("server.routes.auth.emailChangeRequested", "Если адрес свободен, на него отправлено письмо со ссылкой для подтверждения — ссылка действует час") });
});

/**
 * Подтверждение по ссылке из письма — БЕЗ сессии (ссылку открывают и в
 * другом браузере). Одной транзакцией: довод гасится, адрес меняется и
 * сразу считается подтверждённым (переход с нового ящика доказывает
 * владение), доводы сброса пароля гасятся (ссылка сброса, выданная на
 * прежний адрес, не должна остаться рабочей), на ПРЕЖНИЙ адрес — уведомление.
 * Адрес, занятый к моменту подтверждения, → 400 TOKEN_INVALID (тем же кодом,
 * что негодный довод: подсказывать, что адрес занят, значило бы выдавать
 * регистрацию по ссылке); гонка двух подтверждений — UNIQUE(email) → тот же
 * ответ. Сессии НЕ завершаются: пароль не менялся, пользователь — тот же.
 */
authRoutes.post("/email/change/confirm", async (c) => {
  const body = await readJson(c);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) return tokenInvalid(c);
  let changed: { email: string } | null = null;
  try {
    changed = await db.transaction(async (tx) => {
      const row = await consumeTokenRow(tx, token, "email_change");
      if (!row || !row.newEmail) return null;
      const [u] = await tx.select().from(schema.users).where(eq(schema.users.id, row.userId)).for("update").limit(1);
      if (!u) return null;
      const now = new Date();
      const [updated] = await tx
        .update(schema.users)
        .set({ email: row.newEmail, emailVerifiedAt: now, updatedAt: now })
        .where(eq(schema.users.id, u.id))
        .returning({ email: schema.users.email });
      if (!updated) return null;
      await revokeTokens(tx, u.id, "password_reset", now);
      await revokeTokens(tx, u.id, "email_verify", now);
      await queueEmailChangedNotice(
        tx,
        { id: u.id, email: updated.email, displayName: u.displayName, uiLocale: u.uiLocale },
        u.email,
        updated.email,
      );
      return { email: updated.email };
    });
  } catch (err) {
    // Адрес заняли между запросом и подтверждением — UNIQUE(email) 23505:
    // транзакция откатилась, довод гасится отдельно (ссылка сгорает —
    // новый запрос смены выдаст новую)
    const e = err as { code?: string; cause?: { code?: string } };
    if (e.code === "23505" || e.cause?.code === "23505") {
      await consumeTokenRow(db, token, "email_change");
      return tokenInvalid(c);
    }
    throw err;
  }
  return changed ? c.json({ ok: true, email: changed.email }) : tokenInvalid(c);
});
