#!/usr/bin/env python3
"""Патч документации по беседе 15.3 (почта — обслуживание очереди и смена
адреса; Д-72, Д-73; бэкенд + клиент).
ЧАСТЬ I — ПЕРВЫЙ ЗАПРОС (2026-11-04):
  A  07 — блок «По факту 15.3 (первый запрос)» после текста беседы: п.0
     сверка (комплект называет `client/src/api/auth.ts`, которого нет;
     у `auth_tokens` нет колонки под новый адрес; `getOutboxCounts` не
     считал `sent`; числа миграций в deploy/* отстали с 15.1), решения
     (ветка «минимум времени ответа», admin_audit не пишется, TTL
     email_change 1 ч, сессии не завершаются, занятый к подтверждению —
     довод сгорает после 23505), пп.1–6, сторож 2az/4bk/5au, смоук.
  B  02 §2.2 — чистка истёкших сессий проходом; §2.30 — purpose +=
     email_change, new_email, чистка погашенных/просроченных; §2.31 —
     чистка sent/failed, счётчики с sent.
  C  03 §2.1 — абзац почты 15.3: /auth/email/change/{request,confirm},
     GET /auth/mail-outbox, минимум времени ответа, холостой bcrypt;
     §4.3 — TOKEN_INVALID += смена адреса (и занятый к подтверждению).
  D  01 §6 — абзац «Почта (15.3)».
  E  04 §4 — строка 15.3.
  F  05 — .env.example (четыре переменные), миграция 0015, mail/maintenance.ts,
     templates (четыре письма), outbox (listOutboxRows), ChangeEmailPage,
     AdminPromptsPage (вкладка «Почта»), api/admin.ts (getMailOutbox),
     shared/types/admin.ts, smoke-153, patches (последний — conv153).
  G  07 §12 — Д-72/Д-73: состояние «код первого запроса 15.3 — ждёт
     тестовых запросов»; комплект 15.3 — api/auth.ts → stores/auth-store.ts.
  H  NEXT-CONTEXT — первый запрос 15.3 исполнен; серия 2az/4bk/5au и
     миграция 0015 заняты.
  I  09 — уроки 15.3: числа миграций в deploy/* отстают беседами; лимитер
     почты 13.2 копит окно между сторожем и смоуком одного часа;
     `lazyConnect` Redis — первая команда бросает, а не ждёт.
ЧАСТЬ II (J–N, 2026-11-04) — тестовые запросы 2–4 одним заходом
  (test-153-requests2-4: R2 Д-72 живьём с медианами 20 прогонов, R3 Д-73
  живьём по-немецки, R4 браузер Chrome 131 на сборке) и сверка доков после
  сжатия контекста: 07 «По факту 15.3 (тестовые запросы 2–4)»; дыры доков —
  03 §1.1 (строка A3a), 03 §1 (врезка о маршрутах без сессии); 05 — тест;
  09 — уроки харнесса; переводы утверждены (черновиков 0); §12 — состояние
  строк; NEXT-CONTEXT.
ЧАСТЬ III (O–U, 2026-11-04) — завершение беседы: 07 «По факту 15.3
  (завершение)»; §12 строки Д-72/Д-73 → 08 Часть IV; журнал §12; врезка
  «Фаза 15» — 15.3 закрыта, ближайшая 15.4; 08 Части I/II; README; 09 §2
  (урок патча — третий раз); NEXT-CONTEXT перезаписан (состояние,
  ближайшая — 15.4).
Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ; блок «По факту» — по
marker). Запуск из корня:
    python3 scripts/patches/patch-docs-conv153.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
applied = skipped = failed = 0


def patch(rel: str, old: str, new: str, label: str, marker: str | None = None) -> None:
    global applied, skipped, failed
    path = ROOT / rel
    if not path.exists():
        failed += 1
        print(f"  fail  {label}: нет файла {rel}")
        return
    text = path.read_text(encoding="utf-8")
    if new in text or (marker is not None and marker in text):
        skipped += 1
        print(f"  skip  {label}")
        return
    if text.count(old) != 1:
        failed += 1
        print(f"  fail  {label}: якорь встречается {text.count(old)} раз")
        return
    path.write_text(text.replace(old, new), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")



def row_of(rel: str, prefix: str) -> str:
    """Полная строка таблицы по началу («| Д-72 |») — для переноса в 08."""
    for line in (ROOT / rel).read_text(encoding="utf-8").splitlines(keepends=True):
        if line.startswith(prefix):
            return line
    return ""


def remove(rel: str, old: str, label: str) -> None:
    """Снять строку (блок) из файла; идемпотентно: нет строки — skip."""
    global applied, skipped, failed
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    if old not in text:
        skipped += 1
        print(f"  skip  {label}")
        return
    if text.count(old) != 1:
        failed += 1
        print(f"  fail  {label}: якорь встречается {text.count(old)} раз")
        return
    path.write_text(text.replace(old, ""), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


D07 = "docs/07-conversation-protocol.md"
D02 = "docs/02-data-model.md"
D03 = "docs/03-specification.md"
D01 = "docs/01-architecture.md"
D04 = "docs/04-code-reuse-map.md"
D05 = "docs/05-file-structure.md"
D09 = "docs/09-lessons.md"
NEXT = "NEXT-CONTEXT.md"

# ───────────────────────────── A. 07 — «По факту 15.3 (первый запрос)» ─────
FACT_153_R1 = """
**По факту 15.3 (первый запрос — 2026-11-04).** Вход: HEAD b70976b,
`check:dotfiles` чист, `npm install` в самом клоне, PG 16 и Redis в
песочнице (роль/БД заведены заново, миграции 0000–0015 и сиды),
`i18n:check --strict` зелёный. Порядок — п.0 сверка, затем сервер (env →
чистка → время ответа → вкладка → миграция → доводы/письма → маршруты) →
dotfile/deploy/README → shared → клиент → CSS → переводы → сторож → смоук.

0. **Сверка текста с кодом** (до правок). Совпало всё названное в
   «Из предыдущих бесед», кроме: (а) комплект называет
   `client/src/api/auth.ts` — такого файла нет, запросы `/auth/*` живут в
   `client/src/stores/auth-store.ts` (комплект поправлен); (б) у
   `auth_tokens` нет колонки под новый адрес — п.4 требует его «в строке
   токена», значит миграция 0015 сверх расширения CHECK добавляет
   `new_email text` (NULL у прежних назначений); (в) `getOutboxCounts`
   считал `pending`/`overdue`/`failed`, но не `sent` — вкладке нужны все
   четыре, расширен; (г) числа миграций в `deploy/philosynth-{termux,
   ubuntu}.sh` и `.md` отстали ещё с 15.1 (говорили «пятнадцать», 0014 не
   упоминали) — поправлены вместе с 0015 (09 §2: урок). Решения
   с доводом: **ветка п.2** — выбран «минимум времени ответа»
   (`withMinResponse`: ответ не раньше `AUTH_MIN_RESPONSE_MS` от начала
   обработчика при любом исходе), а не вынос письма из пути ответа —
   письмо и довод остаются под одной точкой сохранения транзакции
   (9.1 п.3), иначе отказ постановки оставил бы довод без письма;
   **admin_audit не пишется**: `ADMIN_ACTIONS` (02 §2.29) — перечень
   действий администратора и скриптов над чужими учётными записями, смена
   своего адреса — действие пользователя над собой; след — строка довода
   с `new_email` (погашенная остаётся, §2.30) и уведомление на прежний
   адрес; **TTL `email_change` — 1 ч** (как у сброса: ссылка на чужой
   пока ящик — не повод держать её трое суток); **сессии при смене адреса
   не завершаются** (пароль не менялся, подтверждал владелец с живой
   сессией либо по ссылке); **занятый к моменту подтверждения адрес** —
   `UPDATE users` ловит 23505, довод после отката гасится отдельным
   `consumeTokenRow` вне транзакции (иначе ссылка оставалась бы рабочей
   до истечения) и ответ — тот же `TOKEN_INVALID`.

1. **Д-72 (1), чистка** — `server/services/mail/maintenance.ts`:
   `runMaintenance({ now?, mailRetentionDays?, tokenRetentionDays? })` —
   три независимых `DELETE`: `mail_outbox` в `sent`/`failed` с
   `coalesce(sent_at, next_attempt_at, created_at)` старше
   `MAIL_RETENTION_DAYS` (pending — живая очередь, не трогается);
   `auth_tokens` погашенные либо просроченные с `coalesce(used_at,
   expires_at)` старше `AUTH_TOKEN_RETENTION_DAYS`; `sessions` с
   `expires_at < now()` (прежде снимались лишь при обращении). Зовёт
   работник: `tick()` начинается с `maybeMaintain()` — под своим
   `try/catch` (сбой чистки не ломает разбор очереди) и своим интервалом
   `MAINTENANCE_INTERVAL_MS` (умолчание час; `maintenanceDue(lastRunAt,
   now)` — от прошлого прохода). Умолчания сроков — 30 суток. Четыре
   переменные — в `env.ts` (`mail.retentionDays`,
   `mail.maintenanceIntervalMs`, `auth.tokenRetentionDays`,
   `auth.minResponseMs`), `.env.example`, `env.local.example`,
   `check-dotfiles`, `deploy/philosynth-hosting.md`, README.

2. **Д-72 (2), время ответа** — `routes/auth.ts`: `withMinResponse(fn)`
   досыпает до `AUTH_MIN_RESPONSE_MS` (300 мс) от входа в обработчик;
   под ним — `SELECT` + постановка письма формы сброса (единственный
   `ok: true` блока сохранён — сторож 4aq). Вход: для несуществующего
   адреса `verifyPassword(password, await DUMMY_PASSWORD_HASH)` против
   хэша, посчитанного при загрузке модуля, и результат отброшен — bcrypt
   идёт в обоих случаях. Смена адреса (п.4) под тем же `withMinResponse`:
   занятый адрес не ставит письмо, свободный ставит, время не выдаёт.

3. **Д-72 (3), вкладка «Почта»** — `GET /auth/mail-outbox ?limit=50`
   (requireAuth + requireAdmin) → `{ counts: { pending, overdue, sent,
   failed }, rows: MailOutboxRow[] }`; `listOutboxRows(limit)` (outbox.ts)
   — новые первыми, лимит 1..500, тел в выборке нет. Клиент — `MailTab`
   в `AdminPromptsPage.tsx`: четыре счётчика `.stat-row`
   (`mail-count-*`; «просрочено»/«отказов» ≠ 0 — `.mail-stat-alert`
   красным), таблица `.data-table` (адрес, тема, статус бейджем,
   попытки, последняя ошибка, создано/отправлено/срок), кнопка
   «Обновить»; повтора отправки нет — тела затёрты, пояснение на вкладке.
   Shared — `MailOutboxCounts`/`MailOutboxRow`/`MailOutboxView`
   (`types/admin.ts`), клиент `getMailOutbox` (`api/admin.ts`).

4. **Д-73 (сервер)** — миграция `0015_email_change` (генерат
   drizzle-kit, тег переименован): `DROP CONSTRAINT
   auth_tokens_purpose_check`, `ADD COLUMN new_email text`, `ADD
   CONSTRAINT … IN ('email_verify','password_reset','email_change')`.
   `auth-tokens.ts`: `issueToken(exec, userId, purpose, now, newEmail)`
   пишет `new_email` только у `email_change`; `consumeTokenRow` возвращает
   `{ userId, newEmail }` (`consumeToken` — обёртка); `queueTokenMail`
   выбирает шаблон и адресата (`email_change` → новый адрес);
   `queueEmailChangeMail`, `queueEmailChangedNotice` (уведомление на
   прежний адрес — под точкой сохранения, без довода). `templates.ts`:
   `htmlShell(…, link | null, …)` — письмо без кнопки; `emailChangeLetter`
   (ссылка `/change-email/<довод>`, новый адрес назван) и
   `emailChangedNoticeLetter` (ссылок нет; «вход и сброс по этому адресу
   уже невозможны — обратитесь к владельцу службы»); все фразы `tl()` под
   языком получателя (14.1). Маршруты: `POST /auth/email/change/request
   { newEmail, password }` (mailLimiter + requireAuth; форма адреса → 400
   `details.newEmail`, текущий адрес → 400 `sameEmail`, неверный пароль →
   401 `AUTH_REQUIRED`; занятый и свободный → один `{ ok, message }`);
   `POST /auth/email/change/confirm { token }` без сессии — одна
   транзакция: `consumeTokenRow`, `SELECT users FOR UPDATE`, `UPDATE
   email/email_verified_at/updated_at`, `revokeTokens(password_reset)`,
   `revokeTokens(email_verify)`, уведомление на старый адрес; ответ
   `{ ok: true, email }`.

5. **Д-73 (клиент)** — `ProfilePage.tsx`: секция «Смена адреса» (новый
   адрес + текущий пароль, `email-change-form`, статус после отправки);
   `auth-store.ts`: `requestEmailChange` (401 → ошибка у поля пароля,
   `RATE_LIMIT` → `tooManyEmails`), `confirmEmailChange` (обновляет
   `user.email`/`emailVerified` при живой сессии). `ChangeEmailPage.tsx`
   — гостевой `/change-email/:token` по образцу `VerifyEmailPage`
   (ref-заслон от двойного эффекта StrictMode, ожидание `restore()`),
   успех → `/profile` вошедшему, гостю → `/login` с пояснением «войдите
   новым адресом». Маршрут в `App.tsx`. CSS — блок «Беседа 15.3» в
   globals.css (три правила, из переменных набора); css-parity 0/586,
   A/B/C = 0. 43 новых ключа — черновики en/de через `i18n:import
   --draft`, `i18n:check --strict` зелёный (черновиков 43).

6. **Сторож** — серия 2az/4bk/5au в `integration-check.mts`: экспорты
   (maintenance, outbox, auth-tokens, templates, api/admin,
   ChangeEmailPage); текстом — `tick()` зовёт `maybeMaintain` под своим
   try/catch и интервалом реже цикла работника, три таблицы чистки,
   `maintenanceDue` от прошлого прохода, env/.env.example/check-dotfiles,
   `DUMMY_PASSWORD_HASH` во входе, `withMinResponse` вокруг формы сброса и
   запроса смены, `TOKEN_INVALID` одним местом (4aq цел), `email_change` в
   enum/CHECK схемы, `entries[15].tag === "0015_email_change"` и пара
   DROP/ADD CONSTRAINT в SQL, `/mail-outbox` под requireAdmin,
   `listOutboxRows` без тел, письма 15.3 (ссылка только в первом, без
   отписки и внешних ресурсов), deploy/README, клиент (форма, ref-заслон,
   маршрут, вкладка без тел, CSS без hex, ключи с en/de); живьём (5au) —
   `runMaintenance` на фикстурах, медианы 7 прогонов входа, форма сброса
   ≥ минимума с одним JSON, смена адреса end-to-end (письмо по-немецки у
   `ui_locale=de`, уведомление без ссылок, повтор → TOKEN_INVALID, сессии
   живы, занятый к подтверждению → 400 и адрес прежний), вкладка 403/200
   без тел. INTEGRATION OK; `smoke-153-request1` 34 ✓; `vite build`,
   `npm run typecheck`, `check:dotfiles`, `audit` зелёные. Попутно: 4aq
   ловит «9.1» в globals.css как заведённые правила — комментарий блока
   15.3 ссылается на «беседу почты» словами; лимитер почты 13.2 копит
   окно `ip:unknown` между сторожем и смоуком одного часа — оба чистят
   `rate_limit:mail:*` перед прогоном (09 §4).
"""
patch(
    D07,
    "- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10)\n\n---\n\n### Беседа 15.4:",
    "- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10)\n" + FACT_153_R1 + "\n---\n\n### Беседа 15.4:",
    "07: «По факту 15.3 (первый запрос)»",
    marker="**По факту 15.3 (первый запрос — 2026-11-04).**",
)
patch(
    D07,
    "`client/src/api/{auth.ts,admin.ts}`, `client/src/App.tsx` (маршруты)",
    "`client/src/stores/auth-store.ts` (запросы `/auth/*` — отдельного `api/auth.ts` нет), `client/src/api/admin.ts`, `client/src/App.tsx` (маршруты)",
    "07: комплект 15.3 — api/auth.ts → auth-store",
)

# ───────────────────────────── B. 02 ───────────────────────────────────────
patch(
    D02,
    "CREATE INDEX idx_sessions_user ON sessions(user_id);\n```\n\n### 2.3. syntheses",
    "CREATE INDEX idx_sessions_user ON sessions(user_id);\n```\n\n"
    "Истёкшие строки снимаются при обращении (`middleware/auth.ts`) и, с 15.3\n"
    "(Д-72), проходом чистки работника почты (`services/mail/maintenance.ts`,\n"
    "§2.31) — иначе строки гостей, не вернувшихся за 30 дней, копились бы вечно.\n\n"
    "### 2.3. syntheses",
    "02 §2.2: чистка истёкших сессий",
)
patch(
    D02,
    "  purpose     TEXT NOT NULL CHECK (purpose IN ('email_verify','password_reset')),\n"
    "  token_hash  TEXT NOT NULL,     -- sha256(довод), hex; сам довод — только в письме\n"
    "  expires_at  TIMESTAMPTZ NOT NULL,  -- email_verify: +72 ч; password_reset: +1 ч\n",
    "  purpose     TEXT NOT NULL CHECK (purpose IN ('email_verify','password_reset','email_change')),\n"
    "                                 -- email_change — 15.3 (миграция 0015)\n"
    "  token_hash  TEXT NOT NULL,     -- sha256(довод), hex; сам довод — только в письме\n"
    "  expires_at  TIMESTAMPTZ NOT NULL,  -- email_verify: +72 ч; password_reset, email_change: +1 ч\n"
    "  new_email   TEXT,              -- 15.3: адрес, на который переводится запись (только email_change)\n",
    "02 §2.30: purpose += email_change, new_email",
)
patch(
    D02,
    "несуществующий довод неразличимы (03 §4.3 TOKEN_INVALID). Строки не\n"
    "удаляются (кроме удаления аккаунта, §2.1): погашенные — след выдачи.\n",
    "несуществующий довод неразличимы (03 §4.3 TOKEN_INVALID). Строки не\n"
    "удаляются по действию (кроме удаления аккаунта, §2.1): погашенные — след\n"
    "выдачи; с 15.3 (Д-72) погашенные и просроченные старше\n"
    "`AUTH_TOKEN_RETENTION_DAYS` (30 сут) снимает проход чистки (§2.31).\n\n"
    "**Смена адреса (15.3, Д-73).** Довод `email_change` несёт новый адрес в\n"
    "`new_email`: подтверждение по ссылке с НОВОГО ящика одной транзакцией\n"
    "гасит довод (`consumeTokenRow` возвращает `user_id` и `new_email`), ставит\n"
    "`users.email`/`email_verified_at`, гасит ждущие доводы `password_reset` и\n"
    "`email_verify` и ставит уведомление на прежний адрес. Адрес, занятый к\n"
    "этому моменту, даёт 23505 на `UPDATE users` — транзакция откатывается,\n"
    "довод гасится отдельно и ответ тот же TOKEN_INVALID. Сессии не\n"
    "завершаются: пароль не менялся. `admin_audit` не пишется — действие\n"
    "пользователя над собой; след — погашенный довод с `new_email`.\n",
    "02 §2.30: чистка доводов, смена адреса",
)
patch(
    D02,
    "ссылка лежит неизбежно — секунды до прохода работника.\n\n### 2.32. recommendations",
    "ссылка лежит неизбежно — секунды до прохода работника.\n\n"
    "**Чистка (15.3, Д-72).** `services/mail/maintenance.ts` — `runMaintenance`\n"
    "зовётся на тике работника (`maybeMaintain`) реже основного цикла\n"
    "(`MAINTENANCE_INTERVAL_MS`, час) под своим `try/catch` — сбой чистки не\n"
    "ломает разбор очереди: три независимых `DELETE` — `mail_outbox` в\n"
    "`sent`/`failed` старше `MAIL_RETENTION_DAYS` (30 сут; `pending` — живая\n"
    "очередь, не трогается), `auth_tokens` (§2.30), истёкшие `sessions` (§2.2).\n"
    "Вкладка «Почта» админки (03 §2.1 `GET /auth/mail-outbox`) показывает\n"
    "счётчики `getOutboxCounts` (pending / overdue — ждущие с наступившим\n"
    "сроком / sent / failed) и последние строки `listOutboxRows` без тел;\n"
    "повтора отправки нет — тела затёрты.\n\n"
    "### 2.32. recommendations",
    "02 §2.31: чистка и вкладка «Почта»",
)

# ───────────────────────────── C. 03 ───────────────────────────────────────
patch(
    D03,
    "// явно: строка users анонимизируется, CASCADE не срабатывает, а живой довод\n"
    "// сброса вернул бы доступ к удалённой учётной записи.\n```\n",
    "// явно: строка users анонимизируется, CASCADE не срабатывает, а живой довод\n"
    "// сброса вернул бы доступ к удалённой учётной записи.\n\n"
    "// ── Почта (беседа 15.3, Д-72/Д-73): время ответа, смена адреса, вкладка ──\n"
    "// password-reset/request и email/change/request отвечают не раньше\n"
    "// AUTH_MIN_RESPONSE_MS (300 мс) от входа в обработчик при любом исходе\n"
    "// (withMinResponse); вход для несуществующего адреса делает холостое\n"
    "// сравнение bcrypt — время ответа не выдаёт, есть ли адрес.\n\n"
    "POST   /auth/email/change/request   { newEmail, password }   // requireAuth; mailLimiter\n"
    "                                → { ok: true, message }\n"
    "                                // Довод email_change (1 ч, new_email в строке;\n"
    "                                // 02 §2.30) и письмо со ссылкой\n"
    "                                // /change-email/<довод> на НОВЫЙ адрес. Форма\n"
    "                                // адреса / пустой пароль → 400 VALIDATION_ERROR +\n"
    "                                // details; текущий адрес → 400 details.newEmail;\n"
    "                                // неверный пароль → 401 AUTH_REQUIRED. Занятый\n"
    "                                // адрес → ТОТ ЖЕ 200 { ok, message }, письма нет.\n"
    "                                // Письмо — под языком получателя (14.1).\n\n"
    "POST   /auth/email/change/confirm   { token }               // БЕЗ сессии\n"
    "                                → { ok: true, email }\n"
    "                                // Одна транзакция: довод гасится, users.email ←\n"
    "                                // new_email, email_verified_at ← now, ждущие доводы\n"
    "                                // password_reset и email_verify гасятся, уведомление\n"
    "                                // на ПРЕЖНИЙ адрес (без ссылок). Сессии не\n"
    "                                // завершаются. Негодный довод ИЛИ адрес, занятый к\n"
    "                                // этому моменту (23505; довод сгорает), → 400\n"
    "                                // TOKEN_INVALID одним кодом. admin_audit не пишется.\n\n"
    "GET    /auth/mail-outbox            ?limit=50                // requireAuth + requireAdmin\n"
    "                                → { counts: { pending, overdue, sent, failed },\n"
    "                                    rows: MailOutboxRow[] }\n"
    "                                // Вкладка «Почта» админки: счётчики по статусам\n"
    "                                // и последние строки (новые первыми, limit 1..500)\n"
    "                                // БЕЗ тел — id, toEmail, subject, status, attempts,\n"
    "                                // lastError, nextAttemptAt, createdAt, sentAt.\n"
    "                                // Повтора отправки нет (тела затёрты, 02 §2.31).\n"
    "```\n",
    "03 §2.1: маршруты 15.3",
)
patch(
    D03,
    "TOKEN_INVALID       — довод из письма (подтверждение адреса, сброс пароля)\n"
    "                      просрочен, уже использован или не существует — 400; один\n"
    "                      код и один текст на все три случая (9.1)\n",
    "TOKEN_INVALID       — довод из письма (подтверждение адреса, сброс пароля,\n"
    "                      смена адреса — 15.3) просрочен, уже использован или не\n"
    "                      существует — 400; один код и один текст на все случаи\n"
    "                      (9.1); у смены адреса тем же кодом — адрес, занятый к\n"
    "                      моменту подтверждения (15.3)\n",
    "03 §4.3: TOKEN_INVALID += смена адреса",
)


# ───────────────────────────── C′. 03 §1 — таблица A и врезка о маршрутах без сессии ─
patch(
    D03,
    "| A3 | Профиль: отображаемое имя, смена пароля | MVP |\n",
    "| A3 | Профиль: отображаемое имя, смена пароля | MVP |\n"
    "| A3a | Смена адреса почты: запрос с текущим паролем → письмо на НОВЫЙ адрес, подтверждение по ссылке (адрес сменён и подтверждён, доводы сброса погашены, уведомление на старый); занятый адрес неотличим от свободного | Фаза 15 — СДЕЛАНО 15.3 (Д-73; `POST /auth/email/change/{request,confirm}`, `ChangeEmailPage`) |\n",
    "03 §1.1: строка A3a",
)
patch(
    D03,
    "> /auth/password-reset/confirm` — ссылку из письма открывают и в браузере\n"
    "> без входа, а забывший пароль войти не может по определению.\n",
    "> /auth/password-reset/confirm` — ссылку из письма открывают и в браузере\n"
    "> без входа, а забывший пароль войти не может по определению. 15.3 добавила\n"
    "> четвёртый — `POST /auth/email/change/confirm`: ссылка приходит на НОВЫЙ\n"
    "> ящик и открывается где угодно.\n",
    "03 §1: врезка — четвёртый маршрут без сессии",
)

# ───────────────────────────── D. 01 §6 ────────────────────────────────────
patch(
    D01,
    "ходом владельца.\n\n**Три режима биллинга**",
    "ходом владельца.\n\n"
    "**Почта (беседа 15.3, Д-72/Д-73).** Смена адреса — запрос с текущим\n"
    "паролем → довод `email_change` (1 ч, новый адрес в строке) и письмо со\n"
    "ссылкой на НОВЫЙ ящик; подтверждение по ссылке меняет адрес, ставит его\n"
    "подтверждённым, гасит доводы сброса и шлёт уведомление на прежний адрес\n"
    "(03 §2.1). Ответ на занятый адрес не отличается от ответа на свободный;\n"
    "форма сброса и запрос смены отвечают не раньше `AUTH_MIN_RESPONSE_MS`,\n"
    "вход для несуществующего адреса делает холостое сравнение bcrypt — время\n"
    "ответа не выдаёт, есть ли адрес. Проход чистки `mail/maintenance.ts`\n"
    "(на тике работника, реже основного цикла, fail-open) снимает отработанные\n"
    "письма, погашенные/просроченные доводы и истёкшие сессии старше сроков\n"
    "из env (02 §2.31). Вкладка «Почта» админки — счётчики очереди и последние\n"
    "строки без тел; повтора отправки нет.\n\n"
    "**Три режима биллинга**",
    "01 §6: почта 15.3",
)

# ───────────────────────────── E. 04 §4 ────────────────────────────────────
patch(
    D04,
    "восстановления удалённого из снимка нет (Огр-13) |\n",
    "восстановления удалённого из снимка нет (Огр-13) |\n"
    "| `runMaintenance`, `maintenanceDue` в `server/services/mail/maintenance.ts`; `maybeMaintain` в `mail/worker.ts`; `listOutboxRows`, `sent` у `getOutboxCounts` (`mail/outbox.ts`); `withMinResponse`, `DUMMY_PASSWORD_HASH`, `POST /auth/email/change/{request,confirm}`, `GET /auth/mail-outbox` в `server/routes/auth.ts`; `consumeTokenRow`, `queueEmailChangeMail`, `queueEmailChangedNotice`, `newEmail` у `issueToken`/`queueTokenMail` (`services/auth-tokens.ts`); `emailChangeLetter`, `emailChangedNoticeLetter`, `htmlShell(…, link | null)` (`mail/templates.ts`); миграция `0015_email_change`; env `MAIL_RETENTION_DAYS`/`AUTH_TOKEN_RETENTION_DAYS`/`MAINTENANCE_INTERVAL_MS`/`AUTH_MIN_RESPONSE_MS`; shared `MailOutboxCounts`/`MailOutboxRow`/`MailOutboxView`; клиент — `requestEmailChange`/`confirmEmailChange` (`stores/auth-store.ts`), секция «Смена адреса» в `ProfilePage.tsx`, `pages/ChangeEmailPage.tsx` (`/change-email/:token`), `MailTab` в `AdminPromptsPage.tsx`, `getMailOutbox` (`api/admin.ts`) | НОВОЕ (15.3; Д-72, Д-73 — в исходнике ни почты, ни учётных записей нет): чистка очереди/доводов/сессий проходом работника реже основного цикла (fail-open); минимум времени ответа формы сброса и запроса смены, холостой bcrypt на входе; смена адреса доводом `email_change` с новым адресом в строке — письмо на новый, уведомление на старый, занятый адрес неотличим от свободного; вкладка «Почта» админки без тел и повтора |\n",
    "04 §4: строка 15.3",
)

# ───────────────────────────── F. 05 ───────────────────────────────────────
patch(
    D05,
    "│                                   # MAIL_WORKER_INTERVAL_MS, MAIL_RETRY_DELAYS, RATE_LIMIT_MAIL_PER_HOUR\n",
    "│                                   # MAIL_WORKER_INTERVAL_MS, MAIL_RETRY_DELAYS, RATE_LIMIT_MAIL_PER_HOUR\n"
    "│                                   # 15.3: + MAIL_RETENTION_DAYS, AUTH_TOKEN_RETENTION_DAYS (сроки чистки),\n"
    "│                                   # MAINTENANCE_INTERVAL_MS (период прохода), AUTH_MIN_RESPONSE_MS\n"
    "│                                   # (минимум времени ответа форм); все четыре — в check-dotfiles\n",
    "05: .env.example 15.3",
)
patch(
    D05,
    "│   │       ├── 0014_lineage_parent_unique.sql   # 15.1 (Д-70): чистка дублей пары + частичный уникальный\n"
    "│   │       │                           #  индекс uq_lineage_parent_pair; генерат, тег переименован\n",
    "│   │       ├── 0014_lineage_parent_unique.sql   # 15.1 (Д-70): чистка дублей пары + частичный уникальный\n"
    "│   │       │                           #  индекс uq_lineage_parent_pair; генерат, тег переименован\n"
    "│   │       ├── 0015_email_change.sql   # 15.3 (Д-73): auth_tokens.purpose += email_change (пара\n"
    "│   │       │                           #  DROP/ADD CONSTRAINT), new_email text; генерат, тег переименован\n",
    "05: миграция 0015",
)
patch(
    D05,
    "│   │   │   ├── templates.ts            # два письма, текст и HTML: подтверждение адреса, сброс пароля\n",
    "│   │   │   ├── templates.ts            # четыре письма, текст и HTML: подтверждение адреса, сброс пароля,\n"
    "│   │   │   │                           # 15.3 — подтверждение нового адреса (ссылка) и уведомление на\n"
    "│   │   │   │                           # прежний адрес (htmlShell с link=null — без кнопки и ссылки)\n",
    "05: templates 15.3",
)
patch(
    D05,
    "│   │   │   │                           # underSavepoint / tryEnqueue; getOutboxCounts\n"
    "│   │   │   └── worker.ts               # processOutbox: захват арендой, постоянный/временный отказ,\n"
    "│   │   │                               # decideRetry; startMailWorker / stopMailWorker (index.ts)\n",
    "│   │   │   │                           # underSavepoint / tryEnqueue; getOutboxCounts (15.3: + sent),\n"
    "│   │   │   │                           # listOutboxRows(limit) — строки вкладки «Почта» без тел (15.3)\n"
    "│   │   │   ├── maintenance.ts          # 15.3 (Д-72): runMaintenance — три DELETE (mail_outbox sent/failed,\n"
    "│   │   │   │                           # auth_tokens погашенные/просроченные, истёкшие sessions) старше\n"
    "│   │   │   │                           # сроков env; maintenanceDue — период от прошлого прохода\n"
    "│   │   │   └── worker.ts               # processOutbox: захват арендой, постоянный/временный отказ,\n"
    "│   │   │                               # decideRetry; startMailWorker / stopMailWorker (index.ts);\n"
    "│   │   │                               # 15.3: tick() зовёт maybeMaintain — чистка реже цикла, fail-open\n",
    "05: outbox/maintenance/worker 15.3",
)
patch(
    D05,
    "│   │   │   ├── VerifyEmailPage.tsx     # 9.1: «/verify-email/:token» — подтверждение, затем каталог\n"
    "│   │   │   │                           #  (гостю — вход с пояснением); довод гасится один раз\n",
    "│   │   │   ├── VerifyEmailPage.tsx     # 9.1: «/verify-email/:token» — подтверждение, затем каталог\n"
    "│   │   │   │                           #  (гостю — вход с пояснением); довод гасится один раз\n"
    "│   │   │   ├── ChangeEmailPage.tsx     # 15.3 (Д-73): «/change-email/:token» — подтверждение смены адреса\n"
    "│   │   │   │                           #  по образцу VerifyEmailPage; успех → профиль (гостю — вход\n"
    "│   │   │   │                           #  новым адресом с пояснением); ref-заслон от двойного эффекта\n",
    "05: ChangeEmailPage",
)
patch(
    D05,
    "8.1: + вкладка «Доступ» (поиск пользователей, роль с подтверждением, последние 50 строк admin_audit)\n",
    "8.1: + вкладка «Доступ» (поиск пользователей, роль с подтверждением, последние 50 строк admin_audit); 15.3: + вкладка «Почта» (MailTab — четыре счётчика очереди, последние 50 строк без тел, «Обновить»; повтора нет)\n",
    "05: AdminPromptsPage вкладка «Почта»",
)
patch(
    D05,
    "│   │   │   ├── admin.ts                # 8.1: listUsers / setUserRole / getAuditLog (вкладка «Доступ»)\n",
    "│   │   │   ├── admin.ts                # 8.1: listUsers / setUserRole / getAuditLog (вкладка «Доступ»);\n"
    "│   │   │   │                           # 15.3: getMailOutbox (вкладка «Почта»)\n",
    "05: api/admin getMailOutbox",
)
patch(
    D05,
    "│       │   ├── admin.ts                # 8.1: AdminAction, AdminAuditEntry, AdminUserRow, UserRole\n",
    "│       │   ├── admin.ts                # 8.1: AdminAction, AdminAuditEntry, AdminUserRow, UserRole;\n"
    "│       │   │                           # 15.3: MailOutboxCounts, MailOutboxRow, MailOutboxView\n",
    "05: shared/types/admin 15.3",
)
patch(
    D05,
    "    │                                   # smoke-152-request1 — 15.2: типы шагов, removeExactSubsectionHtml,\n",
    "    │                                   # smoke-153-request1 — 15.3: maintenanceDue, письма 15.3 (ссылка только в\n"
    "    │                                   #  первом, de под runWithLocale), TTL/путь довода, исходники (auth.ts,\n"
    "    │                                   #  worker, схема/0015, env, клиент, CSS, ключи); живая БД — runMaintenance\n"
    "    │                                   #  на фикстурах, медианы входа, форма сброса ≥ минимума, смена адреса\n"
    "    │                                   #  end-to-end через app.request (401/400/200, занятый без письма, довод с\n"
    "    │                                   #  new_email, confirm без сессии, уведомление, повтор, занятый к\n"
    "    │                                   #  подтверждению), /auth/mail-outbox 401/403/200 без тел\n"
    "    │                                   # smoke-152-request1 — 15.2: типы шагов, removeExactSubsectionHtml,\n",
    "05: smoke-153",
)
patch(
    D05,
    "│   │                                   # на беседу, patch-docs-conv<NNN>.py; последний — conv152)\n",
    "│   │                                   # на беседу, patch-docs-conv<NNN>.py; последний — conv153)\n",
    "05: patches последний — conv153",
)

# ───────────────────────────── G. 07 §12 ───────────────────────────────────
patch(
    D07,
    "Был Огр-6 (кроме смены адреса — Д-73) | ревизия ограничений 2026-10-14 (код); был Огр-6 (9.1 п.18) | 15.3 | открыт |",
    "Был Огр-6 (кроме смены адреса — Д-73) | ревизия ограничений 2026-10-14 (код); был Огр-6 (9.1 п.18) | 15.3 | код первого запроса 15.3 (2026-11-04) — `mail/maintenance.ts` на тике работника, `withMinResponse` + холостой bcrypt, `GET /auth/mail-outbox` и вкладка «Почта»; ждёт тестовых запросов |",
    "07 §12: Д-72 состояние",
    marker="При закрытии 15.3 (2026-11-04) сняты Д-72",
)
patch(
    D07,
    "Клиент — форма в ProfilePage и страница подтверждения. Был Огр-6 (смена адреса) | ревизия ограничений 2026-10-14 (код); был Огр-6 (9.1 п.18) | 15.3 | открыт |",
    "Клиент — форма в ProfilePage и страница подтверждения. Был Огр-6 (смена адреса) | ревизия ограничений 2026-10-14 (код); был Огр-6 (9.1 п.18) | 15.3 | код первого запроса 15.3 (2026-11-04) — миграция 0015, `/auth/email/change/{request,confirm}`, два письма, форма в профиле и `ChangeEmailPage`; ждёт тестовых запросов |",
    "07 §12: Д-73 состояние",
    marker="При закрытии 15.3 (2026-11-04) сняты Д-72",
)

# ───────────────────────────── H. NEXT-CONTEXT ─────────────────────────────
patch(
    NEXT,
    "утверждает владелец; новые env — в `.env.example` и deploy/* (dotfile-\nграбля).\n",
    "утверждает владелец; новые env — в `.env.example` и deploy/* (dotfile-\nграбля).\n\n"
    "**Первый запрос 15.3 исполнен 2026-11-04** («По факту 15.3 (первый\n"
    "запрос)» в 07): `mail/maintenance.ts` + `maybeMaintain` на тике\n"
    "работника; `withMinResponse` (AUTH_MIN_RESPONSE_MS) у формы сброса и\n"
    "запроса смены, `DUMMY_PASSWORD_HASH` во входе; `GET /auth/mail-outbox` и\n"
    "вкладка «Почта» (`MailTab`); миграция 0015 (`email_change`, `new_email`),\n"
    "`/auth/email/change/{request,confirm}`, письма `emailChangeLetter`/\n"
    "`emailChangedNoticeLetter`, форма в профиле, `ChangeEmailPage`\n"
    "(`/change-email/:token`); четыре env в `.env.example`/`env.local.example`/\n"
    "check-dotfiles/deploy/README; 43 ключа черновиками; сторож 2az/4bk/5au\n"
    "(INTEGRATION OK), smoke-153 34 ✓. Решения: ветка «минимум времени\n"
    "ответа» (письмо остаётся в транзакции довода), admin_audit не пишется,\n"
    "TTL email_change 1 ч, сессии не завершаются. Дальше — тестовые запросы\n"
    "2–4 (Д-72 живьём, Д-73 живьём, браузер Chrome 131 на сборке) по одному.\n",
    "NEXT: первый запрос 15.3 исполнен",
    marker="## Состояние на 2026-11-04 (15.3 ЗАКРЫТА",
)
patch(
    NEXT,
    "серия — 2az/4bk/5au); миграций нет (следующая — 0015);",
    "серия — 2az/4bk/5au — ЗАНЯТА 15.3); миграций нет (0015 — занята 15.3, следующая — 0016);",
    "NEXT: серия и миграция заняты",
    marker="## Состояние на 2026-11-04 (15.3 ЗАКРЫТА",
)

# ───────────────────────────── I. 09 ───────────────────────────────────────
patch(
    D09,
    "   по его заголовку: клик по оверлею закрывает редактор целиком.\n\n## 5. Node, TypeScript, сборка",
    "   по его заголовку: клик по оверлею закрывает редактор целиком.\n\n"
    "### Беседа 15.3 — лимитер между прогонами, Redis lazyConnect\n"
    "1. **Лимитер почты 13.2 копит окно между сторожем и смоуком одного\n"
    "   часа**: `app.request` без адреса даёт identity `ip:unknown`, 10 запросов\n"
    "   в час на `password-reset/request` + `email/change/request` выбираются\n"
    "   сторожем и смоуком вместе — второй прогон получает 429 на всё подряд\n"
    "   (и не 401 «без сессии»: `mailLimiter` стоит ПЕРЕД `requireAuth`). Тесты\n"
    "   чистят `rate_limit:mail:*` перед своей почтовой частью.\n"
    "2. **Redis клиента службы — `lazyConnect` + `enableOfflineQueue: false`**:\n"
    "   без `connect()` первая команда не ждёт, а бросает «Stream isn't\n"
    "   writeable» — лимитер при этом fail-open, и тест «проходит» без Redis;\n"
    "   но та же команда ЗАПУСКАЕТ подключение, и следующие уже считают. Перед\n"
    "   `keys`/`del` в тесте — `if (redis.status === \"wait\") await\n"
    "   redis.connect()`.\n"
    "3. **Сторож 4aq ловит строку «9.1» в globals.css** как заведённые правила\n"
    "   9.1 — комментарий нового блока не должен ссылаться на беседу почты\n"
    "   номером.\n\n"
    "## 5. Node, TypeScript, сборка",
    "09 §4: уроки 15.3",
    marker="### Беседа 15.3 — лимитер между прогонами, Redis lazyConnect",
)
patch(
    D09,
    "   «261 шаблон» в `deploy/*` пережили две беседы (9.1 добавила миграцию,\n"
    "   10.1 — миграцию и два шаблона). Добавил миграцию или шаблон —\n",
    "   «261 шаблон» в `deploy/*` пережили две беседы (9.1 добавила миграцию,\n"
    "   10.1 — миграцию и два шаблона); повторилось в 15.3 — «пятнадцать\n"
    "   миграций» без 0014, 15.1 число не тронула. Добавил миграцию или шаблон —\n",
    "09: числа миграций в deploy/* (15.3)",
)


# ═════════════════════════════ ЧАСТЬ II — тестовые запросы 2–4 ═══════════
FACT_153_R24 = """
**По факту 15.3 (тестовые запросы 2–4 — 2026-11-04, одним заходом по
просьбе пользователя; сжатие контекста пришлось на прогон сторожа после
первого запроса).** Сверка после сжатия: код первого запроса перечитан
против текста беседы (пп.0–6) — расхождений нет; доки — две дыры, 03 §1.1
(у смены адреса не было строки в таблице A) и врезка 03 §1 о маршрутах без
сессии (не знала четвёртого — `/auth/email/change/confirm`) — закрыты
частью II патча. Переводы 15.3 утверждены (43 ключа: тот же текст влит без
`--draft`, «подтверждено вычиткой 86»; `i18n:check --strict` — черновиков
0). Харнесс `tests/test-153-requests2-4.mjs` (живой сервер :3000 с
`MAIL_TRANSPORT=console`, работник 300 мс, чистка 1 с; сборка клиента под
vite preview :5229; Chrome 131): 51 ✓ ×2.

- **R2 (Д-72 живьём).** Фикстуры (sent/failed 40 сут, свежая sent 2 сут;
  доводы погашенный/просроченный 40 сут, погашенный 2 сут, живой;
  истёкшая и живая сессии) ставятся ДО старта — первый тик работника
  чистит: старое ушло, свежее и живое осталось, строка «[mail] чистка:
  писем N, доводов N, истёкших сессий N» в логе. Форма сброса — 20
  прогонов, медианы: существующий 304 мс, несуществующий 305 мс (Δ 1 мс),
  обе ≥ 300, тело ответа одно. Вход — медианы: несуществующий адрес 97–98
  мс против неверного пароля 92–101 мс, один 401 с одним телом. Вкладка:
  гостю 401, пользователю 403, администратору 200 с четырьмя счётчиками и
  строками без тел; письмо сброса ушло, тело затёрто.
- **R3 (Д-73 живьём, ui_locale=de).** 401 на неверный пароль, 400
  `details.newEmail` по-немецки на текущий адрес, 401 без сессии; занятый и
  свободный — один 200 (306/306 мс); письмо на НОВЫЙ адрес «PhiloSynth:
  Bestätigung der neuen Adresse» со ссылкой на клиент
  (`PUBLIC_BASE_URL ← CLIENT_ORIGIN`), на занятый — письма смены нет; строка
  sent с затёртым телом; на старый адрес до подтверждения уведомления
  нет; довод с `new_email`; confirm без сессии → адрес сменён и
  подтверждён, «PhiloSynth: Adresse des Kontos geändert» на старый без
  ссылок с новым адресом в тексте, уведомление одно; вход по новому 200,
  по старому 401; старая сессия жива, `/auth/me` отдаёт новый адрес;
  повтор → TOKEN_INVALID; занятый к подтверждению → TOKEN_INVALID, адрес
  прежний, уведомления о несостоявшейся смене нет.
- **R4 (браузер, сборка).** Профиль: форма «Смена адреса»; неверный
  пароль — ошибка у поля без пояснения об отправке; успех — пояснение,
  поле пароля очищено, письмо ушло (по-русски). `/change-email/:token`
  вошедшему: «Адрес изменён и подтверждён…» → `/profile`, поле Email уже
  с новым адресом без перезагрузки, ошибок страницы нет; повторно —
  ошибка довода и подсказка о форме в профиле. Гостю: → `/login` с
  «войдите новым адресом», вход новым адресом из браузера проходит.
  Админка: вкладка «Почта» — счётчик «отправлено» ≥ 2, строки с адресом и
  бейджем статуса, ссылок из тел нет; «Обновить» поднимает свежее письмо
  наверх (новые первыми; лимит 50 может быть полон); пользователю
  `/admin/prompts` закрыт.
- **Грабли харнесса** (09 §4): регистрация через API ставит письмо
  подтверждения (9.1) — считать письма по теме/назначению, не «очередь
  адресата пуста»; фаза `done` страницы подтверждения живёт 1,5 с до
  перехода — `networkidle0` её переживает, ждать `done` ИЛИ `/profile`
  без networkidle0; после смены адреса объект учётной записи харнесса
  держит прежний email — обновлять.
"""
patch(
    D07,
    "   `rate_limit:mail:*` перед прогоном (09 §4).\n",
    "   `rate_limit:mail:*` перед прогоном (09 §4).\n" + FACT_153_R24,
    "07: «По факту 15.3 (тестовые запросы 2–4)»",
    marker="**По факту 15.3 (тестовые запросы 2–4 — 2026-11-04",
)
patch(
    D05,
    "    │                                   # smoke-153-request1 — 15.3: maintenanceDue, письма 15.3 (ссылка только в\n",
    "    │                                   # test-153-requests2-4 — 15.3: живой сервер (console, работник 300 мс, чистка\n"
    "    │                                   #  1 с) + сборка под preview :5229 + Chrome 131; R2 чистка на первом тике по\n"
    "    │                                   #  фикстурам, медианы 20 прогонов формы сброса и входа, вкладка 401/403/200;\n"
    "    │                                   #  R3 смена адреса end-to-end по-немецки (письма из лога, вход новым адресом,\n"
    "    │                                   #  повтор, занятый к подтверждению); R4 браузер — форма, /change-email/:token\n"
    "    │                                   #  вошедшему и гостю, вкладка «Почта» с «Обновить», пользователю закрыто\n"
    "    │                                   # smoke-153-request1 — 15.3: maintenanceDue, письма 15.3 (ссылка только в\n",
    "05: test-153",
)
patch(
    D09,
    "3. **Сторож 4aq ловит строку «9.1» в globals.css** как заведённые правила\n"
    "   9.1 — комментарий нового блока не должен ссылаться на беседу почты\n"
    "   номером.\n",
    "3. **Сторож 4aq ловит строку «9.1» в globals.css** как заведённые правила\n"
    "   9.1 — комментарий нового блока не должен ссылаться на беседу почты\n"
    "   номером.\n"
    "4. **Регистрация через API сама ставит письмо** (подтверждение адреса, 9.1):\n"
    "   проверка «на этот адрес писем нет» в харнессе почты — по теме или\n"
    "   назначению письма (ссылка `/change-email/`, `geändert`), а не по пустой\n"
    "   очереди адресата.\n"
    "5. **Фаза `done` страниц по ссылке из письма живёт 1,5 с** до перехода:\n"
    "   `page.goto(..., { waitUntil: \"networkidle0\" })` её переживает (idle\n"
    "   считается после 500 мс тишины плюс restore). Открывать с\n"
    "   `domcontentloaded` и ждать `data-phase=\"done\"` ИЛИ путь назначения.\n"
    "6. **После смены адреса объект учётной записи харнесса держит прежний\n"
    "   email** — запрос сброса на него молча ничего не ставит (анти-\n"
    "   enumeration), и ожидание свежей строки виснет. Обновлять поле сразу.\n",
    "09 §4: уроки харнесса 15.3",
)
patch(
    D07,
    "`GET /auth/mail-outbox` и вкладка «Почта»; ждёт тестовых запросов |",
    "`GET /auth/mail-outbox` и вкладка «Почта»; тестовые запросы 2–4 пройдены 2026-11-04 (test-153 51 ✓ ×2); ждёт завершения беседы |",
    "07 §12: Д-72 — тесты пройдены",
    marker="При закрытии 15.3 (2026-11-04) сняты Д-72",
)
patch(
    D07,
    "два письма, форма в профиле и `ChangeEmailPage`; ждёт тестовых запросов |",
    "два письма, форма в профиле и `ChangeEmailPage`; тестовые запросы 2–4 пройдены 2026-11-04 (test-153 51 ✓ ×2, по-немецки и в браузере); ждёт завершения беседы |",
    "07 §12: Д-73 — тесты пройдены",
    marker="При закрытии 15.3 (2026-11-04) сняты Д-72",
)
patch(
    NEXT,
    "TTL email_change 1 ч, сессии не завершаются. Дальше — тестовые запросы\n"
    "2–4 (Д-72 живьём, Д-73 живьём, браузер Chrome 131 на сборке) по одному.\n",
    "TTL email_change 1 ч, сессии не завершаются. **Тестовые запросы 2–4\n"
    "пройдены 2026-11-04 одним заходом** (`tests/test-153-requests2-4.mjs`\n"
    "51 ✓ ×2: чистка на первом тике, медианы 20 прогонов, смена адреса\n"
    "по-немецки, браузер Chrome 131 на сборке); переводы 15.3 утверждены\n"
    "(черновиков 0); дыры доков 03 §1.1/§1 закрыты. Дальше — завершение\n"
    "беседы (typecheck/vite build, check:integration на свежем клоне, ревью\n"
    "TODO, строки Д-72/Д-73 → 08 Часть IV).\n",
    "NEXT: тестовые запросы 2–4 пройдены",
    marker="## Состояние на 2026-11-04 (15.3 ЗАКРЫТА",
)


# ═════════════════════════════ ЧАСТЬ III — завершение беседы 15.3 ════════
print("\nЧАСТЬ III — завершение беседы 15.3")

PF3 = """**По факту 15.3 (завершение — 2026-11-04).** Ревью TODO и заглушек: в
файлах беседы новых меток нет (найденные `TODO(1.3)`/`TODO(2.4)` — старые,
закрытые, в сторожах). Завершение: `typecheck` 0 ошибок, `vite build`,
`check:dotfiles`, `i18n:check --strict` (черновиков 0), css-parity 0/586
(A/B/C = 0), `audit`, `check:integration` INTEGRATION OK на свежем клоне
(настоящий `npm install`, 2az/4bk/5au); smoke-153 34 ✓, test-153 51 ✓ ×2.
Строки Д-72, Д-73 → 08 Часть IV; новых долгов и ограничений беседа не
оставила. Реестр §12 — Д-74, Д-75 (15.4). Беседа 15.3 ЗАКРЫТА
2026-11-04; ближайшая — 15.4. Вся беседа — одним коммитом по просьбе
пользователя.

"""
patch(
    D07,
    """  держит прежний email — обновлять.
""",
    """  держит прежний email — обновлять.

""" + PF3,
    "O1 07: «По факту 15.3 (завершение)»",
    marker="**По факту 15.3 (завершение — 2026-11-04).**",
)

CLOSED = {
    "| Д-72 |": "ЗАКРЫТ 15.3 (2026-11-04): (1) `services/mail/maintenance.ts` — `runMaintenance` на тике работника реже основного цикла (`MAINTENANCE_INTERVAL_MS`, fail-open): `mail_outbox` sent/failed старше `MAIL_RETENTION_DAYS`, `auth_tokens` погашенные/просроченные старше `AUTH_TOKEN_RETENTION_DAYS`, истёкшие `sessions`; (2) `withMinResponse` (`AUTH_MIN_RESPONSE_MS`) у формы сброса и запроса смены адреса, холостой bcrypt (`DUMMY_PASSWORD_HASH`) при входе для несуществующего адреса — медианы 20 прогонов 304/305 мс и 97/92 мс; (3) `GET /auth/mail-outbox` (requireAdmin) и вкладка «Почта» — четыре счётчика, последние строки без тел, повтора нет; env в `.env.example`/`env.local.example`/check-dotfiles/deploy/README; сторож 2az/4bk/5au, smoke-153, test-153 R2/R4",
    "| Д-73 |": "ЗАКРЫТ 15.3 (2026-11-04): миграция `0015_email_change` (`purpose += email_change`, `new_email`); `POST /auth/email/change/request {newEmail, password}` (requireAuth + mailLimiter, под минимумом времени; занятый адрес — тот же ответ, письма нет) → довод 1 ч и письмо `emailChangeLetter` на НОВЫЙ адрес; `POST /auth/email/change/confirm` без сессии — одна транзакция: адрес сменён и подтверждён, доводы сброса/подтверждения погашены, уведомление `emailChangedNoticeLetter` на СТАРЫЙ адрес без ссылок; занятый к подтверждению — 23505 → довод сгорает, TOKEN_INVALID; сессии живы, admin_audit не пишется (действие пользователя над собой); письма под языком получателя; клиент — форма в `ProfilePage`, `ChangeEmailPage` (`/change-email/:token`); test-153 R3 (по-немецки) и R4 (браузер)",
}
rows_08 = []
for prefix, verdict in CLOSED.items():
    row = row_of(D07, prefix)
    if not row:
        continue
    cells = [c.strip() for c in row.strip().strip("|").split("|")]
    short = cells[2].split("**")[1] if "**" in cells[2] else cells[2][:120]
    rows_08.append(f"| {cells[0]} — {short.rstrip('.')} | 15.3 | {cells[3]} | {verdict} |\n")
if rows_08:
    _p08 = ROOT / "docs/08-history.md"
    _t08 = _p08.read_text(encoding="utf-8")
    _anchor = row_of("docs/08-history.md", "| Д-79 — ")
    if _anchor and "| Д-72 — " not in _t08:
        _p08.write_text(_t08.replace(_anchor, _anchor + "".join(rows_08), 1), encoding="utf-8")
        applied += 1
        print("  ok    P1 08 Часть IV: закрытые строки 15.3")
    else:
        skipped += 1
        print("  skip  P1 08 Часть IV: закрытые строки 15.3")
else:
    skipped += 1
    print("  skip  P1 08 Часть IV: закрытые строки 15.3")
for prefix in CLOSED:
    row = row_of(D07, prefix)
    if row:
        remove(D07, row, f"P2 07 §12: снята строка {prefix.strip('| ')}")
    else:
        skipped += 1
        print(f"  skip  P2 07 §12: снята строка {prefix.strip('| ')}")

patch(
    D07,
    """   снимка нет); новых долгов нет, строк «не назначен» нет; в реестре —
   Д-72, Д-73 (15.3), Д-74, Д-75 (15.4).
""",
    """   снимка нет); новых долгов нет, строк «не назначен» нет; в реестре —
   Д-72, Д-73 (15.3), Д-74, Д-75 (15.4).
   При закрытии 15.3 (2026-11-04) сняты Д-72, Д-73 (в 08 Часть IV); новых
   долгов и ограничений нет, строк «не назначен» нет; в реестре — Д-74,
   Д-75 (15.4).
""",
    "P3 07 §12: журнал — закрытие 15.3",
)
patch(
    D07,
    """> адресат 15.2. **15.2 закрыта 2026-11-04** (Д-71; попутно Д-78, Д-79;
> ограничение Огр-13 — восстановления удалённого элемента из снимка нет).
> Ближайшая — 15.3.
>""",
    """> адресат 15.2. **15.2 закрыта 2026-11-04** (Д-71; попутно Д-78, Д-79;
> ограничение Огр-13 — восстановления удалённого элемента из снимка нет).
> **15.3 закрыта 2026-11-04** (Д-72, Д-73; миграция 0015 `email_change`;
> новых долгов нет). Ближайшая — 15.4.
>""",
    "Q1 07: врезка «Фаза 15» — 15.3 закрыта",
)
patch(
    "docs/08-history.md",
    """03 §1.5; доки — patch-docs-conv152.py (три части); ближайшая — 15.3.
""",
    """03 §1.5; доки — patch-docs-conv152.py (три части); ближайшая — 15.3.
Беседа 15.3 (почта — обслуживание очереди и смена адреса; бэкенд +
клиент) ЗАКРЫТА 2026-11-04. Д-72: проход чистки `mail/maintenance.ts` на
тике работника реже основного цикла (письма sent/failed, доводы
погашенные/просроченные, истёкшие сессии — сроки env, fail-open);
`withMinResponse` у формы сброса и запроса смены адреса, холостой bcrypt
при входе для несуществующего адреса; `GET /auth/mail-outbox` и вкладка
«Почта» (счётчики, строки без тел, повтора нет). Д-73: миграция 0015
(`email_change`, `new_email`), `/auth/email/change/{request,confirm}`,
письмо на новый адрес и уведомление на старый под языком получателя,
занятый адрес неотличим от свободного, занятый к подтверждению —
TOKEN_INVALID; форма в профиле и `ChangeEmailPage`. Решения: письмо
остаётся в транзакции довода (минимум времени ответа, не вынос),
admin_audit не пишется, TTL 1 ч, сессии живы. 43 ключа (утверждены),
сторож 2az/4bk/5au, smoke-153 34 ✓, test-153 51 ✓ ×2; сверка после сжатия
контекста закрыла дыры 03 §1.1/§1; доки — patch-docs-conv153.py (три
части); ближайшая — 15.4.
""",
    "R1 08 Часть I: 15.3 закрыта",
    marker="Беседа 15.3 (почта — обслуживание очереди и смена адреса; бэкенд +",
)

CH153 = """### Беседа 15.3 — Почта: обслуживание очереди и смена адреса (бэкенд + клиент) [ЗАКРЫТА 2026-11-04]

**Вход:** HEAD b70976b, `check:dotfiles` чист, `npm install` в самом клоне,
PG 16 и Redis в песочнице (роль/БД заведены заново, миграции 0000–0015),
Chrome 131 из `chrome/` (CHROME_PATH окружения указывал на системный —
задан явно). Третья беседа Фазы 15: Д-72, Д-73 (оба — бывший Огр-6).
Требования пользователя: время ответа формы сброса и входа не выдаёт
адрес (мерить медианами многих прогонов); тела писем ради повтора не
хранить; смена адреса — с текущим паролем, ссылка на новый адрес,
уведомление на старый, занятый адрес неотличим от свободного; письма
через шаблоны 14.1 под языком получателя; новые env — в `.env.example` и
после выкладки сверить отдельно; браузер — на сборке; переводы —
черновики, утверждает владелец; вся беседа — одним коммитом.

**Ход.** П.0: комплект называл несуществующий `api/auth.ts`
(auth-store), у `auth_tokens` не было колонки под новый адрес (миграция
0015 добавила `new_email`), `getOutboxCounts` не считал `sent`, числа
миграций в `deploy/*` отстали с 15.1. Решения с доводом: ветка «минимум
времени ответа» (`withMinResponse` от входа в обработчик), письмо и довод
остаются под одной точкой сохранения; admin_audit не пишется — действие
пользователя над собой, след — погашенный довод с `new_email` и
уведомление; TTL `email_change` 1 ч; сессии не завершаются; занятый к
подтверждению адрес — 23505 → откат, довод гасится отдельно, тот же
TOKEN_INVALID. Сервер: `mail/maintenance.ts` (три DELETE, `maybeMaintain`
на тике работника под своим try/catch и интервалом), холостой bcrypt во
входе, `GET /auth/mail-outbox` + `listOutboxRows` без тел, миграция
`0015_email_change`, `consumeTokenRow`/`queueEmailChangeMail`/
`queueEmailChangedNotice`, `emailChangeLetter`/`emailChangedNoticeLetter`
(`htmlShell` с `link = null`), маршруты `/auth/email/change/{request,
confirm}`; четыре env в `.env.example`/`env.local.example`/check-dotfiles/
deploy/README. Клиент: секция «Смена адреса» в профиле, `ChangeEmailPage`
(`/change-email/:token`, ref-заслон), `MailTab` админки; CSS блоком 15.3
(три правила). Сторож 2az/4bk/5au; 4aq ловит «9.1» в globals.css —
комментарий словами. Сверка после сжатия контекста (пришлось на прогон
сторожа): код против текста беседы — расхождений нет; доки — закрыты
03 §1.1 (A3a) и врезка §1 (четвёртый маршрут без сессии). Переводы: 43
ключа утверждены.

**Тесты.** smoke-153 34 ✓ (чистые функции, исходники, живая БД через
`app.request`: чистка на фикстурах, медианы, смена адреса end-to-end,
вкладка); test-153-requests2-4 51 ✓ ×2: R2 чистка на первом тике
работника, медианы 20 прогонов (форма сброса Δ 1 мс, вход ≈ неверный
пароль), вкладка 401/403/200; R3 смена адреса по-немецки (письма из лога
console, вход новым адресом, повтор и занятый к подтверждению); R4
браузер Chrome 131 на сборке — форма, `/change-email/:token` вошедшему и
гостю, вкладка «Почта» с «Обновить», пользователю закрыто. Грабли
харнесса — 09 §4 (регистрация ставит письмо; фаза `done` 1,5 с; лимитер
почты между прогонами; Redis `lazyConnect`).

**Завершение.** Регрессия на свежем клоне зелёная; Д-72, Д-73 → 08 Часть
IV; новых долгов нет; доки — `patch-docs-conv153.py` (три части).
Ближайшая — 15.4.

"""
patch(
    "docs/08-history.md",
    """### Беседа 15.2 — Удаление элементов и подразделов: вручную и по рекомендации (бэкенд + клиент) [ЗАКРЫТА 2026-11-04]
""",
    CH153 + """### Беседа 15.2 — Удаление элементов и подразделов: вручную и по рекомендации (бэкенд + клиент) [ЗАКРЫТА 2026-11-04]
""",
    "R2 08 Часть II: глава 15.3",
    marker="### Беседа 15.3 — Почта: обслуживание очереди и смена адреса",
)
patch(
    "README.md",
    """Д-71, попутно Д-78, Д-79; Огр-13) — закрыта 11-04; ближайшая — 15.3 |""",
    """Д-71, попутно Д-78, Д-79; Огр-13) — закрыта 11-04; 15.3 (чистка очереди/доводов/сессий проходом работника, минимум времени ответа и холостой bcrypt, вкладка «Почта», смена адреса доводом `email_change` с письмом на новый адрес и уведомлением на старый; Д-72, Д-73) — закрыта 11-04; ближайшая — 15.4 |""",
    "S1 README: 15.3 закрыта",
)
patch(
    D09,
    """   у КАЖДОГО patch(), чей `new` когда-либо станет якорем или будет
   редактироваться, — `marker` с первой строки `new`; проверка — три
   прогона подряд должны дать «применено 0».
""",
    """   у КАЖДОГО patch(), чей `new` когда-либо станет якорем или будет
   редактироваться, — `marker` с первой строки `new`; проверка — три
   прогона подряд должны дать «применено 0».
2. **15.3 — то же в третий раз, в другом месте**: часть II дописала
   «ждёт тестовых запросов» → «тесты пройдены» в строках §12 и
   заголовок урока в 09 — часть I без `marker` на втором прогоне дала
   «якорь встречается 0 раз» (fail) и один повторный вставок. Правило
   то же; проверка после КАЖДОЙ части, не только в конце.
""",
    "T1 09 §2: урок патча 15.3",
)

# NEXT-CONTEXT — перезапись: состояние и ближайшая 15.4
_pn = ROOT / NEXT
_tn = _pn.read_text(encoding="utf-8")
if "## Состояние на 2026-11-04 (15.3 ЗАКРЫТА" in _tn:
    skipped += 1
    print("  skip  U1 NEXT-CONTEXT: состояние и ближайшая 15.4")
else:
    i = _tn.index("## Ближайшая беседа — 15.3 (почта: обслуживание очереди и смена адреса; бэкенд + клиент)")
    j = _tn.index("## Беседа 15.2 (ЗАКРЫТА 2026-11-04) — что было комплектом")
    near = """## Ближайшая беседа — 15.4 (тарифы: админка редакциями и согласие подписки с тарифом; бэкенд + клиент)

Четвёртая, последняя беседа Фазы 15 — Д-74 (тарифы описаны кодом
`server/config/plans.ts`, админка их не правит — редакции тарифов в БД,
миграция 0016, вкладка «Тарифы») и Д-75 (подписка расходится с тарифом).
Текст беседы и комплект — в 07 (§12 строки Д-74, Д-75; врезка «Фаза 15»;
«По факту» 6.1, 6.2, 7.1, 8.1, 8.2, 8.3, 12.3, 14.1); 09 §9 — стенд
биллинга (мок Stripe, `.dev-billing/`, `STRIPE_PRICE_*`). Миграция — 0016
(сторож места по журналу). Сторож — серия 2ba/4bl/5av. Переводы —
черновики `--draft`, утверждает владелец; новые env — в `.env.example` и
deploy/* (dotfile-грабля). С 15.3 пересечений по файлам нет, кроме
`AdminPromptsPage.tsx` (вкладки — `MailTab` стоит последней; образец
вкладки — `AccessTab`/`MailTab`) и `shared/types/admin.ts`.

## Беседа 15.3 (ЗАКРЫТА 2026-11-04) — что было комплектом

Третья беседа Фазы 15 — Д-72 (обслуживание почты и доводов) и Д-73
(смена адреса). Первый запрос — 2026-11-04: `mail/maintenance.ts` на
тике работника, `withMinResponse` + холостой bcrypt, `GET
/auth/mail-outbox` и вкладка «Почта», миграция 0015 (`email_change`,
`new_email`), `/auth/email/change/{request,confirm}`, два письма, форма в
профиле и `ChangeEmailPage`, четыре env, 43 ключа, сторож 2az/4bk/5au,
smoke-153 34 ✓. Тестовые запросы 2–4 — 2026-11-04 одним заходом
(test-153-requests2-4 51 ✓ ×2), переводы утверждены; сверка после сжатия
контекста закрыла дыры 03 §1.1/§1. Завершение — 2026-11-04: регрессия на
свежем клоне, Д-72/Д-73 → 08 Часть IV, один коммит.

"""
    _tn = _tn[:i] + near + _tn[j:]
    state = """## Состояние на 2026-11-04 (15.3 ЗАКРЫТА 2026-11-04; ближайшая — 15.4; Фаза 14 закрыта)

**15.3 (почта — обслуживание очереди и смена адреса; бэкенд + клиент)
ЗАКРЫТА 2026-11-04.** Закрыты Д-72, Д-73; новых долгов и ограничений нет;
реестр §12 — Д-74, Д-75 (15.4). Инварианты почты с 15.3: проход чистки
(`runMaintenance`) идёт на тике работника реже основного цикла
(`MAINTENANCE_INTERVAL_MS`, час) под своим try/catch — `mail_outbox`
sent/failed старше `MAIL_RETENTION_DAYS`, `auth_tokens` погашенные/
просроченные старше `AUTH_TOKEN_RETENTION_DAYS`, истёкшие `sessions`
(pending — живая очередь, не трогается); форма сброса и запрос смены
адреса отвечают не раньше `AUTH_MIN_RESPONSE_MS` (300 мс) от входа в
обработчик, вход для несуществующего адреса делает холостой bcrypt
(`DUMMY_PASSWORD_HASH`); `GET /auth/mail-outbox` (requireAdmin) — четыре
счётчика и строки без тел, повтора отправки нет. Смена адреса: довод
`email_change` (1 ч) с `new_email` в строке, письмо на НОВЫЙ адрес,
занятый адрес — тот же ответ без письма; `confirm` без сессии одной
транзакцией (адрес, `email_verified_at`, гашение доводов сброса и
подтверждения, уведомление на СТАРЫЙ адрес без ссылок); занятый к
подтверждению — 23505 → довод сгорает, TOKEN_INVALID; сессии живы;
admin_audit не пишется. Письма 15.3 — под языком получателя. Сторож
2az/4bk/5au (следующая серия — 2ba/4bl/5av); миграция 0015 (следующая —
0016); 43 ключа утверждены; тесты smoke-153 34 ✓, test-153-requests2-4
51 ✓ ×2. Доки — `patch-docs-conv153.py` (три части).

"""
    k = _tn.index("## Состояние на 2026-11-04 (15.2 ЗАКРЫТА 2026-11-04; ближайшая — 15.3; Фаза 14 закрыта)")
    _tn = _tn[:k] + state + _tn[k:].replace("## Состояние на 2026-11-04 (15.2 ЗАКРЫТА 2026-11-04; ближайшая — 15.3; Фаза 14 закрыта)", "## Состояние на 2026-11-04 (15.2 ЗАКРЫТА 2026-11-04; Фаза 14 закрыта)", 1)
    _pn.write_text(_tn, encoding="utf-8")
    applied += 1
    print("  ok    U1 NEXT-CONTEXT: состояние и ближайшая 15.4")

print(f"\nприменено {applied}, пропущено {skipped}, ошибок {failed}")
sys.exit(1 if failed else 0)
