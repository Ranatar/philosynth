#!/usr/bin/env python3
"""Патч документации по беседе 9.1 (почта: подтверждение адреса и сброс
пароля — бэкенд + клиент).
Запрос 1 (2026-09-19) — факты, ставшие постоянными, и найденные дыры:
  A  03 — §1.1 (A2a сделано, + A2b подтверждение адреса); §2.1: GET/PATCH
     /auth/me += emailVerified (ДЫРА: полосе в шапке неоткуда было узнать
     состояние — текст беседы о поле молчал), register ставит письмо,
     четыре маршрута почты вместо заглушки «A2a, Фаза 3 … беседы нет»;
     §4.3 += TOKEN_INVALID; преамбула §2 — гостевые пути auth.
  B  02 — ER-схема, §2.1 users.email_verified_at, §2.30 auth_tokens,
     §2.31 mail_outbox.
  C  01 — стек (nodemailer), §6 (подтверждение адреса, сброс, очередь).
  D  04 §4 — строки «Новое» 9.1.
  E  05 — services/mail/*, auth-tokens.ts, миграция 0006, страницы, сторож.
  F  07 — §11 (узел 0.5: A2a больше не «Фаза 3»), §12 («не долг»
     password-reset → сделан 9.1).
  T  ТЕСТОВЫЕ ЗАПРОСЫ R2–R11 (2026-09-19, tests/test-91-requests2-11.mjs,
     114 ✓ ×3): три дефекта, найденные прогоном, — в 02 §2.31 (код ответа
     решает раньше EENVELOPE), 09 §5 (пустая переменная и `??`; EENVELOPE),
     09 §6 (заслон от повторного клика — ref, не состояние), 05 (тесты).
  H  ЗАВЕРШЕНИЕ (2026-09-19): 02 §2.31 (тела писем затираются), «По факту
     9.1», врезка Фазы 9, §11, §12, 08 (Части I–III), README, NEXT-CONTEXT
     (комплект 9.1 → 9.2 + «Что 9.1 оставила знать»).
  G  09 — уроки: точка сохранения для постановки письма; nodemailer 10 со
     своими типами; EAUTH — временный отказ; одноразовый довод и StrictMode;
     микросекунды now() против Date; перекладка scripts/ 15.09 сломала
     check:integration на чистом HEAD (чинится здесь же).
Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patches/patch-docs-conv91.py
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
applied = skipped = failed = 0


def patch(rel: str, old: str, new: str, label: str, superseded_by: str | None = None) -> None:
    global applied, skipped, failed
    path = ROOT / rel
    if not path.exists():
        failed += 1
        print(f"  fail  {label}: нет файла {rel}")
        return
    text = path.read_text(encoding="utf-8")
    if new in text or (superseded_by is not None and superseded_by in text):
        skipped += 1
        print(f"  skip  {label}")
        return
    if old not in text:
        failed += 1
        print(f"  fail  {label}: не найден исходный фрагмент")
        return
    if text.count(old) != 1:
        failed += 1
        print(f"  fail  {label}: фрагмент встречается {text.count(old)} раз")
        return
    path.write_text(text.replace(old, new), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


P01 = "docs/01-architecture.md"
P02 = "docs/02-data-model.md"
P03 = "docs/03-specification.md"
P04 = "docs/04-code-reuse-map.md"
P05 = "docs/05-file-structure.md"
P07 = "docs/07-conversation-protocol.md"
P09 = "docs/09-lessons.md"

# ── A. 03 ───────────────────────────────────────────────────────
print("A. 03-specification")
patch(P03,
      "| A2a | Сброс пароля по email | Фаза 3 |\n",
      "| A2a | Сброс пароля по email | Фаза 9 — СДЕЛАНО 9.1 (очередь писем, довод на 1 ч, завершение всех сессий; прежнее «Фаза 3» — фаза продукта, беседы под неё не было) |\n"
      "| A2b | Подтверждение адреса при регистрации (письмо со ссылкой на 72 ч, повторная отправка из шапки) | Фаза 9 — СДЕЛАНО 9.1; вход при неподтверждённом адресе НЕ запрещён, подтверждение пока ничего не ограничивает |\n",
      "03 §1.1 — A2a сделано, + A2b")
patch(P03,
      """> запросы и состояние паузы — это потолок, не настройка автора. Всё
> остальное (разделы, элементы, режимы, преобразования, экспорт, генерация,
> импорт, правка) — под `requireAuth`, как прежде.
""",
      """> запросы и состояние паузы — это потолок, не настройка автора. Всё
> остальное (разделы, элементы, режимы, преобразования, экспорт, генерация,
> импорт, правка) — под `requireAuth`, как прежде.
>
> **9.1 (2026-09-19).** «Три пути» — о СОДЕРЖАНИИ службы. Маршруты входа
> сессии не требуют по своей природе (`/auth/register`, `/auth/login`,
> `/auth/logout`), и к ним 9.1 добавила три почтовых: `POST
> /auth/email/verify/confirm`, `POST /auth/password-reset/request`, `POST
> /auth/password-reset/confirm` — ссылку из письма открывают и в браузере
> без входа, а забывший пароль войти не может по определению.
""",
      "03 §2 преамбула — гостевые маршруты auth")
patch(P03,
      """POST   /auth/register          { email, password, displayName? }
                                → { user: { id, email, displayName } }
""",
      """POST   /auth/register          { email, password, displayName? }
                                → { user: { id, email, displayName } }
                                // 9.1: письмо с подтверждением адреса
                                // ставится в mail_outbox В ТОЙ ЖЕ транзакции,
                                // что и строка users, под точкой сохранения:
                                // сбой постановки регистрацию не отменяет,
                                // откат регистрации (409) письма не оставляет.
                                // Ответ от почты не зависит.
""",
      "03 §2.1 — register ставит письмо")
patch(P03,
      """GET    /auth/me                → { user: { id, email, displayName, role, balanceUsd } }

PATCH  /auth/me                { displayName }
                                → { user: { id, email, displayName, role, balanceUsd } }
""",
      """GET    /auth/me                → { user: { id, email, displayName, role, balanceUsd,
                                            emailVerified } }
                                // 9.1: emailVerified = users.email_verified_at
                                // IS NOT NULL. Нужен полосе «Адрес не
                                // подтверждён» в шапке; НИЧЕГО не ограничивает.

PATCH  /auth/me                { displayName }
                                → { user: { id, email, displayName, role, balanceUsd,
                                            emailVerified } }
""",
      "03 §2.1 — emailVerified в /auth/me")
patch(P03,
      """POST   /auth/password-reset/request  { email }              // A2a, Фаза 3
                                // ВНИМАНИЕ: «Фаза 3» здесь — фаза
                                // ПРОДУКТА (таблица возможностей §1),
                                // а не беседа протокола 07. Беседы под
                                // сброс пароля в 07 нет ни одной —
                                // при выходе за MVP её нужно завести
                                // отдельно (аудит 2026-07-30).
                                → { ok: true }              // всегда ok (анти-enumeration)
POST   /auth/password-reset/confirm  { token, newPassword } // A2a, Фаза 3
                                → { ok: true }
```
""",
      """// ── Почта (беседа 9.1): подтверждение адреса и сброс пароля ─────────────
// Письма не отправляются из запроса: строка mail_outbox пишется транзакцией
// действия, разбирает очередь работник (02 §2.31). Довод из письма — 32
// случайных байта; в БД лежит его sha256 (02 §2.30). Срок: подтверждение
// адреса 72 ч, сброс пароля 1 ч. Выдача нового довода того же назначения
// гасит прежние. Вход при неподтверждённом адресе НЕ запрещён.

POST   /auth/email/verify/request    (no body; requireAuth)
                                → { ok: true, alreadyVerified, sent }
                                // Повторная отправка СЕБЕ. Адрес уже
                                // подтверждён → 200 { alreadyVerified: true,
                                // sent: false } без письма. Сбой постановки
                                // → 500 INTERNAL_ERROR.

POST   /auth/email/verify/confirm    { token }              // БЕЗ сессии
                                → { ok: true }
                                // Ставит users.email_verified_at (уже
                                // подтверждённому дату не двигает), гасит
                                // довод. Просроченный, использованный,
                                // несуществующий, пустой → 400 TOKEN_INVALID
                                // ОДНИМ кодом и текстом: подсказывать, какая
                                // именно беда, незачем.

POST   /auth/password-reset/request  { email }              // БЕЗ сессии (A2a)
                                → { ok: true, message }
                                // ОДИНАКОВЫЙ ответ (200, тот же message —
                                // PASSWORD_RESET_REQUESTED_MESSAGE из shared),
                                // есть такой адрес или нет: иначе форма —
                                // прибор для проверки, кто зарегистрирован.
                                // Письмо уходит только существующему; сбой
                                // постановки на ответ не влияет (лог).
                                // Отказ по ФОРМЕ адреса допустим: пустой или
                                // невалидный email → 400 VALIDATION_ERROR +
                                // details.email (существования не выдаёт).
                                // Анонимизированным deleted-*@deleted.invalid
                                // (7.1) письмо не ставится.

POST   /auth/password-reset/confirm  { token, newPassword } // БЕЗ сессии (A2a)
                                → { ok: true }
                                // Правила пароля те же, что при регистрации
                                // (PASSWORD_MIN_LENGTH, shared): короткий →
                                // 400 VALIDATION_ERROR + details.newPassword
                                // тем же текстом; проверяется ДО довода —
                                // короткий пароль ссылку не сжигает. Негодный
                                // довод → 400 TOKEN_INVALID. Успех одной
                                // транзакцией: новый password_hash, ЗАВЕРШЕНИЕ
                                // ВСЕХ сессий пользователя (в отличие от
                                // password-change «текущей» сессии нет),
                                // email_verified_at ← now, если пуст (переход
                                // по ссылке из письма доказывает владение
                                // ящиком — «По факту 9.1»), ждущие доводы
                                // подтверждения гасятся. Cookie запроса
                                // очищается.

// verify/request и password-reset/request — под отдельным лимитом scope
// 'mail' (RATE_LIMIT_MAIL_PER_HOUR = 10 в час на сессию/IP) сверх общего
// rateLimiter: форма сброса открыта без авторизации, ею нельзя давать
// засыпать чужой ящик. DELETE /auth/me (7.1) удаляет доводы пользователя
// явно: строка users анонимизируется, CASCADE не срабатывает, а живой довод
// сброса вернул бы доступ к удалённой учётной записи.
```
""",
      "03 §2.1 — четыре маршрута почты вместо заглушки A2a")
patch(P03,
      """LAST_ADMIN          — понижение или удаление аккаунта последнего администратора —""",
      """TOKEN_INVALID       — довод из письма (подтверждение адреса, сброс пароля)
                      просрочен, уже использован или не существует — 400; один
                      код и один текст на все три случая (9.1)
LAST_ADMIN          — понижение или удаление аккаунта последнего администратора —""",
      "03 §4.3 — TOKEN_INVALID")

# ── B. 02 ───────────────────────────────────────────────────────
print("B. 02-data-model")
patch(P02,
      """  ├── api_usage
  └── admin_audit (actor_id → users, SET NULL; 8.1)
""",
      """  ├── api_usage
  ├── auth_tokens (одноразовые доводы из писем; CASCADE; 9.1)
  └── admin_audit (actor_id → users, SET NULL; 8.1)

mail_outbox ───────── (очередь писем; с пользователем НЕ связана; 9.1)
""",
      "02 §1 — ER: auth_tokens, mail_outbox")
patch(P02,
      """                                   -- создаётся при первом topup/подписке (ensureStripeCustomer)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),""",
      """                                   -- создаётся при первом topup/подписке (ensureStripeCustomer)
  email_verified_at TIMESTAMPTZ,   -- 9.1 (миграция 0006): NULL — адрес не подтверждён
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),""",
      "02 §2.1 — users.email_verified_at")
patch(P02,
      """### 2.2. sessions
""",
      """> **9.1:** `email_verified_at` ставит переход по ссылке из письма — `POST
> /auth/email/verify/confirm` либо успешный `POST /auth/password-reset/confirm`
> (ссылка сброса пришла на тот же ящик). Колонка пока НЕ ограничивает ничего:
> у всех пользователей до 9.1 она пуста, и запрет входа вышвырнул бы их
> разом; решение о том, что закрывать неподтверждённым, — отдельное. При
> удалении аккаунта (7.1, анонимизация) доводы `auth_tokens` пользователя
> удаляются явно, той же транзакцией: CASCADE на живой строке не срабатывает
> (тот же урок, что `admin_audit.actor_id` 8.1).

### 2.2. sessions
""",
      "02 §2.1 — примечание 9.1")
patch(P02,
      """## 3. Извлечение гранулярных элементов из HTML
""",
      """### 2.30. auth_tokens

Одноразовые доводы из писем (беседа 9.1, миграция `0006_mail`): подтверждение
адреса и сброс пароля. Пишется только через `server/services/auth-tokens.ts`.

```sql
CREATE TABLE auth_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('email_verify','password_reset')),
  token_hash  TEXT NOT NULL,     -- sha256(довод), hex; сам довод — только в письме
  expires_at  TIMESTAMPTZ NOT NULL,  -- email_verify: +72 ч; password_reset: +1 ч
  used_at     TIMESTAMPTZ,       -- погашен переходом ЛИБО выдачей следующего
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_tokens_user_purpose ON auth_tokens(user_id, purpose);
CREATE INDEX idx_auth_tokens_hash ON auth_tokens(token_hash);
```

В базе лежит ХЭШ, а не довод: утечка таблицы не должна давать ни входа, ни
подтверждения (тот же принцип, что `sessions.id`, 0.2). `issueToken` гасит
прежние непогашенные доводы того же пользователя и назначения — иначе старая
ссылка из почты осталась бы рабочей. `consumeToken` — один условный `UPDATE …
WHERE used_at IS NULL AND expires_at > now() RETURNING user_id`: два
одновременных перехода оба не пройдут; просроченный, использованный и
несуществующий довод неразличимы (03 §4.3 TOKEN_INVALID). Строки не
удаляются (кроме удаления аккаунта, §2.1): погашенные — след выдачи.

### 2.31. mail_outbox

Очередь исходящих писем (беседа 9.1, миграция `0006_mail`). Ставит
`server/services/mail/outbox.ts`, разбирает `mail/worker.ts`.

```sql
CREATE TABLE mail_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email        TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body_text       TEXT NOT NULL,
  body_html       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending'|'sent'|'failed'
  attempts        INT NOT NULL DEFAULT 0,           -- состоявшиеся ИСХОДЫ отправки
  last_error      TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ
);

CREATE INDEX idx_mail_outbox_status_next ON mail_outbox(status, next_attempt_at);
```

**Постановка — в транзакции действия** (`enqueue(exec, letter)`, образец —
`writeAudit` 8.1): падение почты не отменяет совершённого действия (отправка
отделена очередью), откат действия не оставляет письма. Сверх этого довод и
письмо пишутся под ТОЧКОЙ СОХРАНЕНИЯ (`underSavepoint`): сбой самой
постановки откатывает только её — без savepoint любая ошибка INSERT переводит
транзакцию PostgreSQL в aborted, и несостоявшееся письмо стоило бы человеку
регистрации.

**Два рода отказа** (`worker.ts`, род определяет `transport.classifySendError`):
постоянный (5xx SMTP, негодный адрес `EENVELOPE`) → сразу `failed` с
`last_error`, повторов нет; временный (4xx, сеть, таймаут) → `attempts+1` и
`next_attempt_at` с растущей задержкой (1 мин, 5, 15, 60 мин, 6 ч —
`MAIL_RETRY_DELAYS`), после шестой попытки → `failed`. Регистрация открытая:
опечатка в адресе или бот дают постоянный отказ, и если повторять такие
письма, число `pending` с прошедшим `next_attempt_at` — единственный признак
отставшего работника — забьётся мёртвыми. Отказ авторизации у узла (`EAUTH`,
535) и отказ на стадии соединения считаются ВРЕМЕННЫМИ вопреки коду 5xx: это
беда настройки службы, а не адресата.

**Захват — арендой**, без долгой транзакции: `UPDATE … SET next_attempt_at =
now() + 2 мин WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT 20)
RETURNING *`; разговор с узлом идёт вне транзакции. Два процесса одно письмо
не возьмут; процесс, умерший посреди отправки, вернёт письмо в очередь по
истечении аренды (доставка «не менее раза»). С пользователем строка не
связана намеренно: письмо — о совершённом действии.

## 3. Извлечение гранулярных элементов из HTML
""",
      "02 §2.30–2.31 — auth_tokens, mail_outbox",
      superseded_by="### 2.30. auth_tokens")

# ── C. 01 ───────────────────────────────────────────────────────
print("C. 01-architecture")
patch(P01,
      """Deploy:      Docker Compose (dev) → VPS / managed PostgreSQL (prod)
```""",
      """Mail:        nodemailer (SMTP) либо вывод в консоль (MAIL_TRANSPORT;
             беседа 9.1) — очередь mail_outbox + интервальный работник

Deploy:      Docker Compose (dev) → VPS / managed PostgreSQL (prod)
```""",
      "01 §2 — стек: почта")
patch(P01,
      """**Три режима биллинга** (приоритет при определении API-ключа для запроса):""",
      """**Почта (беседа 9.1).** Адрес подтверждается переходом по ссылке из письма
(`users.email_verified_at`; ссылка 72 ч), забытый пароль сбрасывается по
ссылке на 1 ч с завершением ВСЕХ сессий. Вход при неподтверждённом адресе
не запрещён, подтверждение пока ничего не ограничивает. Письма не
отправляются из запроса: `services/mail/outbox.ts` пишет строку `mail_outbox`
в транзакции действия, `mail/worker.ts` разбирает очередь интервалом из
`index.ts` (остановка — в `shutdown()` до закрытия пула) и различает
постоянный и временный отказ (02 §2.31); `mail/transport.ts` — только
отправка (`MAIL_TRANSPORT`: `smtp` | `console` — стенд работает без почтового
узла, как без аккаунта Stripe с 8.2), `mail/templates.ts` — только тексты.
Доводы — `services/auth-tokens.ts`, в БД хэшем (02 §2.30). В production
пустой `SMTP_HOST`/`MAIL_FROM` → сервер не запускается. SPF/DKIM/DMARC —
забота владельца службы. `scripts/seed/reset-password.ts` остаётся запасным
ходом владельца.

**Три режима биллинга** (приоритет при определении API-ключа для запроса):""",
      "01 §6 — почта")

# ── D. 04 ───────────────────────────────────────────────────────
print("D. 04-code-reuse-map")
patch(P04,
      """| `scripts/bootstrap-admin.ts`, `packages/shared/constants/auth.ts` |""",
      """| `server/services/mail/transport.ts`, `templates.ts`, `outbox.ts`, `worker.ts`; `server/services/auth-tokens.ts`; миграция `0006_mail` | НОВОЕ (9.1): в одностраничнике нет ни учётных записей, ни почты. Четыре модуля с разделением обязанностей: transport — только отправка (nodemailer 10 либо вывод в консоль; `classifySendError` — род отказа, EAUTH и стадия соединения — временные), templates — два письма текстом и HTML без внешних ресурсов, outbox — `enqueue(exec, letter)` исполнителем вызывающего + `underSavepoint`/`tryEnqueue`, worker — `processOutbox` (захват арендой `FOR UPDATE SKIP LOCKED`, `decideRetry` — чистая), `startMailWorker`/`stopMailWorker`. auth-tokens — `issueToken` (гасит прежние), `consumeToken` (один условный UPDATE), `isTokenUsable`, `revokeTokens`, `queueVerificationMail`/`queuePasswordResetMail` (довод + письмо под точкой сохранения), сроки 72 ч / 1 ч. routes/auth += четыре маршрута §2.1, register ставит письмо транзакцией, `AuthUser.emailVerified`; account-deletion удаляет доводы явно |
| `client/src/pages/ResetPasswordPage.tsx` (`ResetPasswordRequestPage`, `ResetPasswordConfirmPage`), `VerifyEmailPage.tsx`; полоса `UnverifiedEmailBanner` в `Header.tsx`; `auth-store` += `resendVerification`/`confirmEmail`/`requestPasswordReset`/`confirmPasswordReset` | НОВОЕ (9.1): три гостевых маршрута вне Layout (экраны `.auth-screen`), «Забыли пароль?» и `location.state.notice` на LoginPage, полоса «Адрес не подтверждён» классами полосы 8.7 (`.app-view-banner`; новых правил CSS нет) с защитой от повторного нажатия; подтверждение гасит довод один раз (ref-заслон от двойного эффекта StrictMode) |
| `scripts/bootstrap-admin.ts`, `packages/shared/constants/auth.ts` |""",
      "04 §4 — строки 9.1")

# ── E. 05 ───────────────────────────────────────────────────────
print("E. 05-file-structure")
patch(P05,
      """│   │       │                           #  интерактивно), `drizzle-kit generate` после — «No schema changes»
""",
      """│   │       │                           #  интерактивно), `drizzle-kit generate` после — «No schema changes»
│   │       ├── 0006_mail.sql           # 9.1: users.email_verified_at, auth_tokens (CHECK purpose,
│   │       │                           #  два индекса), mail_outbox (индекс status+next_attempt_at);
│   │       │                           #  генерат, тег переименован
""",
      "05 — миграция 0006")
patch(P05,
      """│   │   ├── stripe-client.ts            # Тонкий fetch-клиент Stripe REST + проверка подписи""",
      """│   │   ├── auth-tokens.ts             # 9.1: одноразовые доводы из писем (sha256 в БД): issueToken
│   │   │                               # гасит прежние, consumeToken — один условный UPDATE,
│   │   │                               # isTokenUsable, revokeTokens; queueVerificationMail /
│   │   │                               # queuePasswordResetMail — довод + письмо под точкой сохранения
│   │   ├── mail/                       # 9.1: почта — четыре модуля с разделением обязанностей
│   │   │   ├── transport.ts            # ТОЛЬКО отправка: nodemailer либо вывод в консоль
│   │   │   │                           # (MAIL_TRANSPORT); classifySendError — род отказа
│   │   │   ├── templates.ts            # два письма, текст и HTML: подтверждение адреса, сброс пароля
│   │   │   ├── outbox.ts               # enqueue(exec, letter) — запись в ПЕРЕДАННОЙ транзакции;
│   │   │   │                           # underSavepoint / tryEnqueue; getOutboxCounts
│   │   │   └── worker.ts               # processOutbox: захват арендой, постоянный/временный отказ,
│   │   │                               # decideRetry; startMailWorker / stopMailWorker (index.ts)
│   │   ├── stripe-client.ts            # Тонкий fetch-клиент Stripe REST + проверка подписи""",
      "05 — services/mail, auth-tokens")
patch(P05,
      """│   │   │                               #  GET /auth/audit (requireAdmin)
""",
      """│   │   │                               #  GET /auth/audit (requireAdmin)
│   │   │                               # 9.1: + POST /auth/email/verify/request|confirm,
│   │   │                               #  POST /auth/password-reset/request|confirm; register
│   │   │                               #  ставит письмо в той же транзакции
""",
      "05 — routes/auth 9.1")
patch(P05,
      """│   │   │   ├── RegisterPage.tsx
""",
      """│   │   │   ├── RegisterPage.tsx
│   │   │   ├── ResetPasswordPage.tsx   # 9.1: «/reset-password» (форма с адресом, ответ всегда один) и
│   │   │   │                           #  «/reset-password/:token» (новый пароль → /login с пояснением)
│   │   │   ├── VerifyEmailPage.tsx     # 9.1: «/verify-email/:token» — подтверждение, затем каталог
│   │   │   │                           #  (гостю — вход с пояснением); довод гасится один раз
""",
      "05 — страницы 9.1")
patch(P05,
      """│   │   │   │   ├── Header.tsx              # 8.7: гостю «Войти · Регистрация», бренд → «/», выход → «/»
""",
      """│   │   │   │   ├── Header.tsx              # 8.7: гостю «Войти · Регистрация», бренд → «/», выход → «/»
│   │   │   │   │                           # 9.1: полоса «Адрес не подтверждён» + «Отправить письмо ещё раз»
│   │   │   │   │                           #  (классы полосы 8.7; только при emailVerified === false)
""",
      "05 — Header 9.1")
patch(P05,
      """│   │   ├── check-dotfiles.mjs          # 8.7: сторож правок .env.example/.gitignore
""",
      """│   │   ├── check-dotfiles.mjs          # 8.7: сторож правок .env.example/.gitignore
│   │   │                               # 9.1: + восемь переменных почты и MAIL_TRANSPORT стенда
""",
      "05 — сторож dotfiles 9.1")
patch(P05,
      """│                                   # 8.3: + STRIPE_PRICE_STARTER/PRO/ACADEMIC (читает
│                                   # seed-plans напрямую из process.env, не env.ts)
""",
      """│                                   # 8.3: + STRIPE_PRICE_STARTER/PRO/ACADEMIC (читает
│                                   # seed-plans напрямую из process.env, не env.ts)
│                                   # 9.1: + MAIL_TRANSPORT, SMTP_*, MAIL_FROM, PUBLIC_BASE_URL,
│                                   # MAIL_WORKER_INTERVAL_MS, MAIL_RETRY_DELAYS, RATE_LIMIT_MAIL_PER_HOUR
""",
      "05 — .env.example 9.1")

# ── F. 07 ───────────────────────────────────────────────────────
print("F. 07-conversation-protocol")
patch(P07,
      " │    └── 0.5 (password-change; A2a reset — Фаза 3)\n",
      " │    └── 0.5 (password-change; A2a reset — сделан 9.1)\n",
      "07 §11 — узел 0.5")
patch(P07,
      """Долги, снятые как «не долг»: `POST /auth/password-reset/*` — вне MVP,
помечено в 03 §2.1;""",
      """Долги, снятые как «не долг»: `POST /auth/password-reset/*` — вне MVP,
помечено в 03 §2.1 (РЕАЛИЗОВАНЫ беседой 9.1 вместе с подтверждением адреса —
пометка в 03 снята);""",
      "07 §12 — password-reset реализован 9.1")

# ── G. 09 ───────────────────────────────────────────────────────
print("G. 09-lessons")
patch(P09,
      """## 4. Тесты, харнессы, браузер
""",
      """### Беседа 9.1
- **«Запись в той же транзакции» не значит «сбой записи безвреден».** Любая
  ошибка INSERT переводит транзакцию PostgreSQL в aborted — письмо, не
  вставшее в очередь, унесло бы с собой регистрацию. Побочная запись,
  которая НЕ должна отменять действие, идёт под точкой сохранения: вложенный
  `tx.transaction(...)` drizzle = SAVEPOINT (`underSavepoint`, mail/outbox.ts).
  У writeAudit 8.1 наоборот: журнал и дело неразделимы, savepoint не нужен.
- **Каскад FK молчит при анонимизации — второй раз** (первый — actor_id 8.1):
  `auth_tokens.user_id ON DELETE CASCADE` не снял бы довод сброса пароля у
  удалённого 7.1 аккаунта, и ссылка из старого письма вернула бы к нему
  доступ. Каждая новая таблица с FK на users — вопрос к account-deletion.

## 4. Тесты, харнессы, браузер
""",
      "09 §3 — уроки 9.1 (savepoint, каскад при анонимизации)",
      # ниже в этот же блок дописывается урок о часах базы — без наследника
      # повторный прогон вставил бы блок вторично (09 §2, 8.6)
      superseded_by="- **«Запись в той же транзакции» не значит «сбой записи безвреден».**")
patch(P09,
      """## 6. Клиент: React, состояние, CSS
""",
      """### Беседа 9.1
- **nodemailer 10 несёт собственные типы** (`dist/cjs/nodemailer.d.ts`);
  `@types/nodemailer` отстаёт на две мажорные версии (8.x) — не ставить.
  Импорт именованный: `import { createTransport } from "nodemailer"`.
- **Код 5xx ≠ «адресат негоден».** `EAUTH` (535) и отказ на стадии
  соединения — беда настройки службы; считать их постоянными значит одной
  опечаткой в SMTP_PASSWORD похоронить всю очередь (`classifySendError`).

## 6. Клиент: React, состояние, CSS
""",
      "09 §5 — уроки 9.1 (nodemailer, EAUTH)",
      superseded_by="- **nodemailer 10 несёт собственные типы**")
patch(P09,
      """## 7. Сервер: стрим, WS, Redis, Registry
""",
      """### Беседа 9.1
- **Одноразовый запрос в эффекте против StrictMode.** Эффект монтирования в
  dev исполняется дважды; если он гасит одноразовый довод (подтверждение
  адреса по ссылке), второй вызов получает TOKEN_INVALID и затирает успех
  ошибкой. Заслон — `useRef(false)`: ref переживает имитацию размонтирования
  (в отличие от restore() 0.4, этот запрос НЕ идемпотентен).

## 7. Сервер: стрим, WS, Redis, Registry
""",
      "09 §6 — урок 9.1 (StrictMode и одноразовый довод)",
      superseded_by="- **Одноразовый запрос в эффекте против StrictMode.**")

patch(P09,
      """  доступ. Каждая новая таблица с FK на users — вопрос к account-deletion.
""",
      """  доступ. Каждая новая таблица с FK на users — вопрос к account-deletion.
- **Часы базы против часов процесса.** `DEFAULT now()` пишет микросекунды,
  `new Date()` — миллисекунды: строка, вставленная за миг до выборки
  `next_attempt_at <= $jsNow`, оказывается «в будущем» (…,123456 > …,123) и
  ждёт лишний проход; в смоуке это давало флак 1 из 3. Срок, поставленный
  базой, сверять с `now()` базы, а не с часами процесса (mail/worker.ts).
""",
      "09 §3 — урок 9.1 (микросекунды now() против Date)")
patch(P09,
      """## 3. PostgreSQL, Drizzle, данные
""",
      """### Беседа 9.1
- **Перекладка `scripts/` 2026-09-15 сломала `check:integration` на чистом
  HEAD** (3e73e0a): два мёртвых пути (`scripts/philosynth-termux.sh` →
  `deploy/`, `scripts/patch-docs-conv87.py` → `scripts/patches/`) и
  замороженный импорт 4aj (`"../server/…"` → `"../../server/…"` у
  bootstrap-admin). Первая же ошибка была ENOENT ДО списка проблем — то есть
  после перекладки интеграцию на свежем клоне не запускали. Любое
  перемещение файлов — `grep` путей в integration-check и прогон на клоне.
- Замороженный инвариант «последняя миграция — 0005» (4ao) падает от любой
  следующей миграции: сторожить МЕСТО своей миграции в журнале
  (`entries[5]`), а не то, что она последняя (родня урока 8.6/5.1).

## 3. PostgreSQL, Drizzle, данные
""",
      "09 §2 — уроки 9.1 (перекладка scripts/, инвариант «последняя миграция»)")

# ── T. Тестовые запросы R2–R11 ──────────────────────────────────
print("T. тестовые запросы")
patch(P02,
      """постоянный (5xx SMTP, негодный адрес `EENVELOPE`) → сразу `failed` с
`last_error`, повторов нет;""",
      """постоянный (5xx SMTP; негодный адрес — `EENVELOPE` БЕЗ ответа узла) → сразу
`failed` с `last_error`, повторов нет (код ответа узла решает ПЕРВЫМ: отказ
`RCPT TO` nodemailer помечает `EENVELOPE` при любом коде, и 451 на адресате —
временный; найдено тестом R7 на моке SMTP);""",
      "02 §2.31 — код ответа решает раньше EENVELOPE")
patch(P09,
      """  опечаткой в SMTP_PASSWORD похоронить всю очередь (`classifySendError`).
""",
      """  опечаткой в SMTP_PASSWORD похоронить всю очередь (`classifySendError`).
- **`EENVELOPE` — не род отказа.** nodemailer ставит этот код на ЛЮБОЙ отказ
  `RCPT TO`, и на 550, и на 451; род решает `responseCode`, а `EENVELOPE`
  без кода ответа — негодный адрес, отвергнутый до разговора с узлом. Первая
  редакция `classifySendError` проверяла `EENVELOPE` раньше кода и хоронила
  письма с временным 451 — поймано только моком SMTP (R7), смоук на
  придуманных объектах ошибки этого не видел: форму ошибки библиотеки брать
  с живого разговора, а не из головы.
- **Пустая переменная окружения — не `undefined`.** Строка `PUBLIC_BASE_URL=`
  (так она и стоит в `.env.example`) даёт `""`, и `process.env.X ?? fallback`
  умолчания НЕ берёт: ссылки в письмах выходили без узла
  (`/verify-email/…`). Для переменных, где пустота = «не задано», —
  `(process.env.X ?? "").trim() || fallback`.
""",
      "09 §5 — уроки R7/R2 (EENVELOPE, пустая переменная)")
patch(P09,
      """  (в отличие от restore() 0.4, этот запрос НЕ идемпотентен).
""",
      """  (в отличие от restore() 0.4, этот запрос НЕ идемпотентен).
- **Заслон от повторного нажатия — ref, а не состояние.** `if (phase !==
  "idle") return; setPhase("pending")` пропускает три клика одного тика
  тремя запросами: `setState` ещё не применён, все трое видят `idle`
  (`disabled` тоже появится лишь после рендера). Синхронный заслон —
  `useRef(false)`; R10 проверяет его тремя `click()` подряд и счётом
  запросов, а не видом кнопки.
""",
      "09 §6 — урок R10 (ref-заслон от повторного клика)")
patch(P05,
      """    │                                   # без мока Claude; smoke-85 — чистые ядра + живая БД
""",
      """    │                                   # без мока Claude; smoke-85 — чистые ядра + живая БД
    │                                   # test-91 — почта БЕЗ почтового узла: фаза console (письма
    │                                   # читаются из вывода сервера) и фаза smtp против мока SMTP
    │                                   # внутри харнесса (net: 550/451/250 по адресату), отдельная
    │                                   # пустая БД philosynth_t91, Chrome 131 из ~/.cache/puppeteer,
    │                                   # puppeteer-core — из node_modules либо PUPPETEER_CORE
""",
      "05 — tests: test-91")

# ── H. ЗАВЕРШЕНИЕ беседы (2026-09-19) ───────────────────────────
print("H. завершение")
P08 = "docs/08-history.md"
PREADME = "README.md"
PNEXT = "NEXT-CONTEXT.md"

patch(P02,
      """истечении аренды (доставка «не менее раза»). С пользователем строка не
связана намеренно: письмо — о совершённом действии.""",
      """истечении аренды (доставка «не менее раза»). С пользователем строка не
связана намеренно: письмо — о совершённом действии.

**Тела затираются.** В `body_text`/`body_html` лежит живая ссылка-довод, а
`auth_tokens` хранит довод хэшем как раз затем, чтобы утечка таблицы ничего не
давала. Поэтому при переходе в `sent` и в `failed` работник записывает в оба
поля пустую строку; остаются адресат, тема, исход и `last_error`. В `pending`
ссылка лежит неизбежно — секунды до прохода работника.""",
      "02 §2.31 — тела писем затираются")

patch(P07,
      """---

### Беседа 9.2: Ручная правка текста подраздела (бэкенд + клиент)""",
      """**По факту 9.1 (2026-09-19) — отступления от буквы запроса и найденное:**

1. **`emailVerified` — поле, которого запрос не называл.** Полосе в шапке
   (п. 6e) неоткуда было узнать состояние: `GET /auth/me` его не нёс. Поле
   добавлено в `AuthUser` сервера И клиента (4e сверяет наборы), в ответы
   `GET`/`PATCH /auth/me`; полоса рисуется только при строгом `false`.
2. **Сброс пароля подтверждает адрес** — решение пользователя (вариант «а»):
   переход по ссылке из письма доказывает владение ящиком так же, как ссылка
   подтверждения. `email_verified_at ← now`, если пуст; ждущие доводы
   подтверждения гасятся.
3. **«В той же транзакции» — под ТОЧКОЙ СОХРАНЕНИЯ.** Буквальная запись в
   транзакции регистрации означала бы, что сбой INSERT письма уводит
   транзакцию PostgreSQL в aborted и губит регистрацию — а тестовый запрос
   требует обратного. Довод и письмо пишутся вложенной транзакцией drizzle
   (`underSavepoint`): сбой откатывает только их, откат регистрации уносит всё.
4. **Род отказа: код ответа узла решает первым; EAUTH и стадия соединения —
   временные.** nodemailer помечает `EENVELOPE` ЛЮБОЙ отказ `RCPT TO` (и 550,
   и 451) — первая редакция хоронила временный 451 (найдено R7 на моке SMTP).
   `EAUTH` (535) и отказ на `CONN` считаются временными вопреки 5xx: это беда
   настройки службы, иначе опечатка в `SMTP_PASSWORD` хоронит всю очередь.
5. **Захват писем арендой**, без транзакции на время SMTP: `UPDATE … WHERE id
   IN (SELECT … FOR UPDATE SKIP LOCKED)` сдвигает `next_attempt_at` на 2 мин.
   `attempts` считает исходы, не захваты. Срок сверяется с `now()` БАЗЫ
   (микросекунды `DEFAULT now()` против миллисекунд `Date` давали флак).
6. **Тела писем затираются** при `sent`/`failed`: в них живая ссылка-довод, а
   `auth_tokens` прячет довод хэшем — очередь не должна сводить это на нет.
   В запросе этого нет; найдено на ревью завершения.
7. **Пароль проверяется ДО довода** (короткий пароль ссылку не сжигает), а
   перед bcrypt стоит дешёвая предпроверка `isTokenUsable` — решает всё равно
   условный UPDATE `consumeToken` в транзакции.
8. **Отказ при запуске шире буквы.** В production отказ и при пустом
   `MAIL_FROM`; `MAIL_TRANSPORT=console` в production пустой `SMTP_HOST` НЕ
   спасает (строго по тексту запроса); `MAIL_TRANSPORT=smtp` без узла — отказ
   и вне production; неизвестное значение транспорта — отказ.
9. **Переменные сверх списка п. 1:** `SMTP_SECURE`, `MAIL_WORKER_INTERVAL_MS`,
   `MAIL_RETRY_DELAYS` (приём `STREAM_RETRY_DELAYS` 1.4 — стенд R7 не ждёт
   шесть часов), `RATE_LIMIT_MAIL_PER_HOUR` (10): `verify/request` и
   `password-reset/request` под отдельным лимитом scope 'mail' — форма сброса
   открыта без авторизации, ею нельзя давать засыпать чужой ящик. Пустой
   `PUBLIC_BASE_URL` = «не задано» (`??` пустую строку пропускал — R2).
10. **Каскад при анонимизации (стык 7.1 ↔ 9.1).** `auth_tokens.user_id ON
    DELETE CASCADE` при удалении аккаунта не срабатывает — строка users
    остаётся; живая ссылка сброса вернула бы доступ к удалённой учётной
    записи. `account-deletion` удаляет доводы явно, той же транзакцией;
    адресам `@deleted.invalid` письма не ставятся.
11. **Формы ответов.** `password-reset/request` → `{ ok, message }` (текст —
    `PASSWORD_RESET_REQUESTED_MESSAGE` из shared, один на оба случая); отказ
    по ФОРМЕ адреса → 400 `details.email` (существования не выдаёт);
    `verify/request` → `{ ok, alreadyVerified, sent }`, сбой постановки → 500
    (у формы сброса сбой на ответ не влияет — иначе различал бы адреса).
12. **Пятый модуль.** Сверх четырёх `services/mail/*` — `services/auth-tokens.ts`
    (доводы + «довод и письмо одним шагом»): mail/ о доводах не знает.
    Разделение обязанностей сторожит 4aq по импортам.
13. **Клиент.** Два экрана сброса — один файл `ResetPasswordPage.tsx`;
    подтверждение гостю ведёт не в каталог (RequireAuth молча увёл бы на
    «/»), а на `/login` с пояснением; `LoginPage` читает
    `location.state.notice`. Новых правил CSS нет — полоса классами 8.7.
    Заслоны от повтора — `useRef`, не состояние: три клика одного тика
    уходили тремя запросами (R10), а эффект StrictMode сжёг бы довод дважды.
14. **nodemailer 10** несёт свои типы; `@types/nodemailer` (8.x) не ставится.
15. **Оснастка, сломанная до беседы.** `check:integration` на чистом HEAD
    3e73e0a ПАДАЛ: перекладка `scripts/` 15.09 оставила два мёртвых пути и
    замороженный импорт 4aj; 4ao требовал, чтобы 0005 была последней
    миграцией. Починено (09 §2). Сторож dotfiles += восемь переменных почты.
16. **Комплект.** Блоков «По факту 0.2» и «По факту 0.6» в 07 нет — опорой
    служили главы 08; «интервального работника 6.1» нет — в 6.1 разовый
    `void warmCache()`; работник с остановкой по SIGTERM заведён здесь первым
    (образец остановки — `stopHeartbeat` в `shutdown()`). Узел §11 уточнён.
17. **Тесты.** `tests/test-91-requests2-11.mjs` — 116 ✓ ×2: отдельная пустая БД
    `philosynth_t91`, фаза console (письма из вывода сервера) и фаза smtp
    против мока SMTP внутри харнесса (550/451/250 по адресату), фазы
    последовательно (два работника разобрали бы очередь друг друга); сбой
    постановки — триггером на `mail_outbox`; Chrome 131 + puppeteer-core 23 из
    окружения пользователя. Смоук 117 ✓; check:integration += 2af/4aq/5ad.
18. **Ограничения без адресата (не долги):** смены адреса почты нет; время
    ответа формы сброса не выравнивается (существующему адресу — две записи
    в БД, несуществующему — ни одной; bcrypt в пути нет, разница — единицы
    мс); строки `mail_outbox` и погашенные `auth_tokens` не вычищаются (тела
    затёрты, объём — строка на письмо); админского вида очереди нет —
    отставание видно запросом по `pending` с прошедшим `next_attempt_at`.

---

### Беседа 9.2: Ручная правка текста подраздела (бэкенд + клиент)""",
      "07 — «По факту 9.1»")
patch(P07,
      """> Нумерация §9–12 сохранена, как при заведении Фаз 7 и 8.
""",
      """> Нумерация §9–12 сохранена, как при заведении Фаз 7 и 8.
>
> **9.1 ЗАКРЫТА 2026-09-19** (почта: подтверждение адреса и сброс пароля;
> «По факту 9.1» ниже). Забывший пароль возвращается в службу сам. Осталась
> 9.2 — она от 9.1 не зависит.
""",
      "07 — врезка Фазы 9: 9.1 закрыта")
patch(P07,
      """+ 6.1 (интервальный работник, env читается один раз) + 8.2 (режим 'console' по образцу мока Stripe)""",
      """+ 6.1 (env читается один раз; фоновый запуск там РАЗОВЫЙ — `void warmCache()`, интервальный работник с остановкой 9.1 завела первой) + 8.2 (режим 'console' по образцу мока Stripe) — ЗАКРЫТА 2026-09-19""",
      "07 §11 — узел 9.1")
patch(P07,
      """Беседа 8.3 (2026-09-09) долгов не оставила: реестр пуст.""",
      """Беседа 9.1 (2026-09-19) долгов не оставила: реестр пуст. Ограничения без
адресата (не долги; «По факту 9.1» п.18): смены адреса почты нет; время
ответа формы сброса не выравнивается; `mail_outbox` и погашенные
`auth_tokens` не вычищаются (тела писем затёрты); админского вида очереди
писем нет.

Беседа 8.3 (2026-09-09) долгов не оставила: реестр пуст.""",
      "07 §12 — 9.1 долгов не оставила")

patch(P08,
      """Реестр §12 пуст; Фаза 8 закрыта целиком; следующая беседа не назначена.
""",
      """Реестр §12 пуст; Фаза 8 закрыта целиком; следующая беседа не назначена.
Фаза 9 «Самостоятельность пользователя» открыта 2026-09-19 (9.1, 9.2).
Беседа 9.1 (почта: подтверждение адреса и сброс пароля; бэкенд + клиент)
ЗАКРЫТА 2026-09-19: миграция 0006_mail (users.email_verified_at, auth_tokens —
довод хэшем, mail_outbox); services/mail — transport (nodemailer 10 | console),
templates, outbox (запись исполнителем вызывающего + точка сохранения), worker
(аренда SKIP LOCKED, постоянный/временный отказ, шесть попыток, тела затираются
после исхода); services/auth-tokens (72 ч / 1 ч, прежний довод гасится новым);
четыре маршрута + регистрация с письмом одной транзакцией; сброс завершает ВСЕ
сессии и подтверждает адрес (вариант «а» — решение пользователя); вход
неподтверждённому не запрещён; production без SMTP_HOST не стартует; клиент —
три гостевых маршрута, «Забыли пароль?», полоса в шапке без новых правил CSS.
Тесты нашли три дефекта первого запроса (451 на RCPT TO как постоянный, пустой
PUBLIC_BASE_URL, заслон от повтора на состоянии). Попутно починен
check:integration, падавший на чистом HEAD после перекладки scripts/ 15.09.
Смоук 117 ✓, tests/test-91-requests2-11.mjs 116 ✓ ×2 (console + мок SMTP +
Chrome 131), check:integration += 2af/4aq/5ad; доки —
scripts/patches/patch-docs-conv91.py. Реестр §12 пуст; ближайшая беседа — 9.2.
""",
      "08 Часть I — строка 9.1")
patch(P08,
      """### Беседа 8.7 — Витрина: стартовая страница и управление публичностью (клиент) [ЗАКРЫТА 2026-09-15]
""",
      """### Беседа 9.1 — Почта: подтверждение адреса и сброс пароля (бэкенд + клиент) [ЗАКРЫТА 2026-09-19]

> Первая беседа Фазы 9. Исходное состояние: почты нет ни в каком виде,
> забывший пароль возвращается только через владельца с доступом к машине
> (`scripts/seed/reset-password.ts` — он ОСТАЁТСЯ запасным ходом). Почтового
> узла для разработки у пользователя нет: всё проверено в режиме `console` и
> на моке SMTP внутри харнесса. HEAD на входе — 3e73e0a.

#### Помодульно

- `server/env.ts` — `env.mail` (transport, smtp, from, publicBaseUrl,
  workerIntervalMs, retryDelaysMs) и `env.rateLimit.mailRequestsPerHour`;
  отказы при импорте: production без `SMTP_HOST`/`MAIL_FROM` (и при
  `MAIL_TRANSPORT=console`), `smtp` без узла, неизвестный транспорт. Пустая
  переменная = «не задано».
- `server/db/schema.ts` + миграция `0006_mail` (генерат, тег переименован,
  `generate` после — «No schema changes»): `users.email_verified_at`,
  `auth_tokens` (CHECK purpose, индексы (user_id, purpose) и token_hash),
  `mail_outbox` (индекс (status, next_attempt_at)). Таблиц — 31.
- `server/services/mail/transport.ts` — только отправка: `sendMail` (исход —
  значение с родом отказа, не исключение), `classifySendError`,
  `formatConsoleMail` + границы блока, `closeTransport`.
- `mail/templates.ts` — `verifyEmailLetter`, `passwordResetLetter`: текст +
  HTML без внешних ресурсов, имя экранируется, без отписки.
- `mail/outbox.ts` — `enqueue(exec, letter)`, `underSavepoint`, `tryEnqueue`,
  `getOutboxCounts`.
- `mail/worker.ts` — `processOutbox({ send, now, batchSize, onlyIds })`,
  `decideRetry` (чистая), `startMailWorker`/`stopMailWorker`, затирание тел.
- `services/auth-tokens.ts` — `issueToken`, `consumeToken`, `isTokenUsable`,
  `revokeTokens`, `tokenLink`, `queueVerificationMail`,
  `queuePasswordResetMail`, `TOKEN_TTL_HOURS`.
- `routes/auth.ts` — четыре маршрута 03 §2.1, регистрация транзакцией,
  `emailVerified` в `/me`; `middleware/auth.ts` — `AuthUser.emailVerified`;
  `account-deletion.ts` — удаление доводов; `index.ts` — запуск работника и
  остановка до `closeDb`.
- `packages/shared/constants/auth.ts` += `PASSWORD_RESET_REQUESTED_MESSAGE`,
  `TOKEN_INVALID_MESSAGE`.
- Клиент: `pages/ResetPasswordPage.tsx` (два экрана), `VerifyEmailPage.tsx`,
  `App.tsx` (три гостевых маршрута вне Layout), `LoginPage` («Забыли
  пароль?», notice), `Header` (`UnverifiedEmailBanner`), `auth-store` (четыре
  действия), `api/client.ts` (`TOKEN_INVALID`).
- Оснастка: `.env.example` и `env.local.example` (почта), сторож dotfiles,
  README «Почта», `integration-check.mts` (починка путей после перекладки
  scripts/ + 2af/4aq/5ad).

#### Решения и отступления

См. «По факту 9.1» в 07 (18 пунктов). Главные: точка сохранения вокруг
довода и письма; код ответа узла раньше `EENVELOPE`; EAUTH/CONN — временные;
аренда вместо транзакции на время SMTP; часы базы; тела писем затираются;
пароль до довода; сброс подтверждает адрес (решение пользователя);
доводы удаляются при анонимизации аккаунта.

#### Что нашли тесты

Три дефекта первого запроса, все — не видимые смоуком: (1) 451 на `RCPT TO`
классифицировался постоянным (nodemailer ставит `EENVELOPE` при любом коде) —
поймал мок SMTP; (2) `PUBLIC_BASE_URL=` пустой строкой давал ссылки без узла
(`??`) — поймал первый же прогон console; (3) три клика одного тика уходили
тремя запросами — заслон стоял на состоянии; тест считает запросы. Сверх
того: флак смоука 1 из 3 (микросекунды `now()` против миллисекунд `Date`);
патч доков задвоил блок на втором прогоне (дописывание в текст прежней
правки без `superseded_by` — урок 8.6 повторён и пойман проверкой на чистой
копии); ревью завершения нашло живые ссылки-доводы в телах `mail_outbox`.

#### Проверки

Смоук `tests/smoke-91-request1.mjs` 117 ✓; `tests/test-91-requests2-11.mjs`
116 ✓ ×2 (≈ 95 с; Chrome 131.0.6778.204, puppeteer-core 23.11.1);
typecheck 0; vite build чисто; audit ✓; css-parity 0 из 586; check-map-04 без
расхождений; `check:integration` OK c 2af/4aq/5ad; dotfiles OK;
`patch-docs-conv91.py` на чистой копии ×3 — идемпотентен, `diff -rq` сошёлся.

#### Файлы в контекст следующих бесед

Беседе 9.2 из 9.1 не нужно ничего (пересечений по файлам нет). Любой
беседе, которая шлёт письмо: `services/mail/outbox.ts` (`enqueue` в своей
транзакции; `tryEnqueue`, если письмо не должно отменять действие),
`mail/templates.ts` (новый шаблон — сюда), `services/auth-tokens.ts` (если
письму нужна одноразовая ссылка). Любой беседе с новой таблицей, имеющей FK
на users, — `services/account-deletion.ts`. Харнесс-образец почты без
почтового узла — `tests/test-91-requests2-11.mjs`.

### Беседа 8.7 — Витрина: стартовая страница и управление публичностью (клиент) [ЗАКРЫТА 2026-09-15]
""",
      "08 Часть II — глава 9.1")
patch(P08,
      """> **Правки 2026-09-15 (итоги беседы 8.6)**:""",
      """> **Правки 2026-09-19 (итоги беседы 9.1)**: почта закрыта (запрос 1 + смоук
> tests/smoke-91-request1.mjs 117 ✓ + все тестовые запросы
> tests/test-91-requests2-11.mjs 116 ✓ ×2; check:integration += 2af/4aq/5ad).
> 03 — §1.1 (A2a сделано, + A2b), преамбула §2 (гостевые маршруты auth), §2.1
> (register ставит письмо, emailVerified в /auth/me, четыре маршрута почты
> вместо заглушки «A2a, Фаза 3»), §4.3 (TOKEN_INVALID); 02 — ER, §2.1
> (email_verified_at + примечание), §2.30 auth_tokens, §2.31 mail_outbox; 01 —
> стек, §6; 04 §4 — строки 9.1; 05 — mail/, auth-tokens, 0006, страницы,
> Header, сторож, .env.example, tests; 07 — «По факту 9.1», врезка Фазы 9,
> §11 (узлы 0.5 и 9.1), §12; 09 — §2 (перекладка scripts/, инвариант
> «последняя миграция»), §3 (savepoint, каскад при анонимизации, часы базы),
> §5 (nodemailer 10, EAUTH, EENVELOPE, пустая переменная), §6 (StrictMode и
> одноразовый довод, ref-заслон от повторного клика).
>
> **Правки 2026-09-15 (итоги беседы 8.6)**:""",
      "08 Часть III — правки 9.1")

patch(PREADME,
      """| 9 — самостоятельность пользователя | 9.1–9.2 | открыта 2026-09-19 |""",
      """| 9 — самостоятельность пользователя | 9.1–9.2 | открыта 2026-09-19; 9.1 (почта) — 09-19; осталась 9.2 |""",
      "README — таблица фаз")

# NEXT-CONTEXT перезаписывается под 9.2 (срезами: комплект и «что оставила»)
patch(PNEXT,
      """всего проведённого — порядок любой. Ближайшая — 9.1. Тексты — `07` §8,
узлы графа — `07` §11, задачи — `06` §2.""",
      """всего проведённого — порядок любой. Беседа 9.1 ЗАКРЫТА 2026-09-19 (почта —
«По факту 9.1» в 07, глава 9.1 в 08; реестр §12 пуст). Ближайшая и последняя
назначенная — 9.2. Тексты — `07` §8, узлы графа — `07` §11, задачи — `06` §2.""",
      "NEXT-CONTEXT — состояние")
patch(PNEXT,
      """`.env.example` (`grep STRIPE_PRICE_ .env.example` — три переменные) и""",
      """`.env.example` (`grep STRIPE_PRICE_ .env.example` — три переменные; с 9.1 —
ещё восемь переменных почты, сторож их знает) и""",
      "NEXT-CONTEXT — dotfile и почта")
patch(PNEXT,
      """- `server/db/schema.ts` — 29 таблиц (с 8.1: + admin_audit), единственный""",
      """- `server/db/schema.ts` — 31 таблица (с 9.1: + auth_tokens, mail_outbox), единственный""",
      "NEXT-CONTEXT — 31 таблица")
patch(PNEXT,
      """  (8.4 — 2ab/4am; 8.5 — 2ac/4an/5ab; 8.6 — 2ad/4ao/5ac; 8.7 — 2ae/4ap;
  следующая серия — 2af/4aq/5ad).""",
      """  (8.4 — 2ab/4am; 8.5 — 2ac/4an/5ab; 8.6 — 2ad/4ao/5ac; 8.7 — 2ae/4ap;
  9.1 — 2af/4aq/5ad; следующая серия — 2ag/4ar/5ae). Секции 5xx с живой БД —
  ДО closeDb: рядом с `await section5ad()`, а не в хвост файла (9.1).""",
      "NEXT-CONTEXT — серия секций")

nx_path = ROOT / PNEXT
nx = nx_path.read_text(encoding="utf-8")
KIT_OLD = "## Комплект ближайшей беседы — 9.1 (почта)"
KIT_NEW = "## Комплект ближайшей беседы — 9.2 (правка подраздела)"
NEXT_ANCHOR = "Для любой следующей клиентской беседы сверх"
LEFT_ANCHOR = "## Что 8.7 оставила знать всем беседам"
new_kit = """## Комплект ближайшей беседы — 9.2 (правка подраздела)

Сверх универсального минимума: `server/routes/sections.ts`,
`server/routes/elements.ts` (образец `PATCH /:id/capsule`),
`server/services/element-editor.ts` (**`updateCapsule`, строки 1245–1281 —
прямой образец**), `element-versioning.ts`, `element-renderer.ts`
(`locatorsFor`, `RenderableTable`, `TABLE_SUBSECTIONS`),
`server/services/generation-service.ts` (`findSubsection`,
`extractSubsectionContent`, `spliceSubsectionHtml` — строка 2128 и далее),
`client/src/utils/capsule-html.ts` (8.4), `components/document/*`,
`components/edit/EditSectionCard.tsx`, `api/elements.ts`,
`stores/synthesis-store.ts`; `docs/fragments-for-conversations/5-6-ui-kit.md`.
Исходник не нужен. Из 9.1 беседе 9.2 не нужно НИЧЕГО: пересечений по файлам
нет (9.1 — `routes/auth.ts` и `services/mail/`).

"""
left = """## Что 9.1 оставила знать всем беседам

- Письмо шлётся НЕ из запроса: `enqueue(exec, letter)` из
  `services/mail/outbox.ts` исполнителем своей транзакции; если письмо не
  должно отменять действие — `tryEnqueue`/`underSavepoint` (любая ошибка
  INSERT иначе уводит транзакцию PG в aborted). Новый шаблон — в
  `mail/templates.ts`, одноразовая ссылка — `services/auth-tokens.ts`.
- Почтового узла для разработки НЕТ: `MAIL_TRANSPORT=console` печатает письмо
  в вывод сервера между `[mail:console] письмо` и `[mail:console] конец`;
  харнесс-образец — `tests/test-91-requests2-11.mjs` (фаза console + мок SMTP
  на `net`, фазы последовательно — два работника разберут очередь друг друга).
- Проверки на ОБЩЕЙ базе работника трогают только свои строки:
  `processOutbox({ send, onlyIds })`.
- Новая таблица с FK на users — вопрос к `account-deletion.ts`: строка users
  анонимизируется, CASCADE/SET NULL молчат (8.1, 9.1).
- `AuthUser` (сервер и клиент — 4e сверяет наборы) несёт `emailVerified`;
  подтверждение адреса НИЧЕГО не ограничивает.
- Заслон от повторного действия в React — `useRef`, не состояние; одноразовый
  запрос в эффекте — тоже под ref (StrictMode). Тест считает запросы.
- Браузер для тестов — Chrome 131 из `~/.cache/puppeteer/chrome/linux-131…`
  и `puppeteer-core` 23 (в песочнице — в `node_modules` mermaid-cli под
  `~/.npm-global`; переменная `PUPPETEER_CORE`), не системный Chromium.
- Перемещение файлов — `grep` путей в `integration-check.mts` и прогон на
  свежем клоне: перекладка `scripts/` 15.09 оставила интеграцию падающей.

"""
if KIT_NEW in nx:
    skipped += 1
    print("  skip  NEXT-CONTEXT — комплект 9.1 → 9.2 + «Что 9.1 оставила»")
elif KIT_OLD in nx and NEXT_ANCHOR in nx and LEFT_ANCHOR in nx:
    a = nx.index(KIT_OLD)
    b = nx.index(NEXT_ANCHOR)
    nx = nx[:a] + new_kit + nx[b:]
    c = nx.index(LEFT_ANCHOR)
    nx = nx[:c] + left + nx[c:]
    nx_path.write_text(nx, encoding="utf-8")
    applied += 1
    print("  ok    NEXT-CONTEXT — комплект 9.1 → 9.2 + «Что 9.1 оставила»")
else:
    failed += 1
    print("  fail  NEXT-CONTEXT — якоря комплекта не найдены")

print(f"\nприменено {applied}, пропущено {skipped}, не найдено {failed}")
raise SystemExit(1 if failed else 0)
