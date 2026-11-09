#!/usr/bin/env python3
"""Патч документации по беседе 16.2 (участники, приглашения, уведомления —
бэкенд + клиент; Фаза 16).
ЧАСТЬ I — ПЕРВЫЙ ЗАПРОС (2026-11-09):
  A  07 — блок «По факту 16.2 (первый запрос)» после текста беседы: п.0
     сверка (auth_tokens.user_id NOT NULL → довод приглашения на владельца с
     адресом в new_email + synthesis_id/member_role; issueToken гасит по
     пользователю → своя выдача по синтезу+адресу; mailLimiter локален →
     экспорт; DiscussionAuthor без «бывшего участника» → formerMember при
     чтении; не каждая мутация двигает updated_at → проход сверки адресов;
     03/02 без таблиц и маршрутов → заведены), решения, пп.1–5, сторож
     2bc/4bn/5ax, smoke-162 49 ✓, test-162 UI 32 ✓ (Chrome 131).
  B  02 — ER-диаграмма += notifications / notification_settings; §2.30
     auth_tokens — довод member_invite; §2.38–2.39 — две таблицы.
  C  03 §2.1 — register += inviteToken, GET /auth/invitations/:token;
     §2.18 участники; §2.19 уведомления; правило 17.1 (предложения
     исключённого закрываются с причиной); §4.3 — CONFLICT += участники.
  D  04 §4 — строка 16.2.
  E  05 — members.ts, notifications.ts (сервисы и роуты), миграция 0018,
     shared notifications.*, клиент (MembersPanel, NotificationBell,
     NotificationSettings, InvitationPage, api/members, api/notifications,
     utils/notification-text), smoke-162, test-162-request1-ui, patches.
  F  NEXT-CONTEXT — первый запрос 16.2 исполнен; серия 2bc/4bn/5ax и
     миграция 0018 заняты (следующие — 2bd/4bo/5ay, 0019).
  G  09 — уроки 16.2: сторожа прежних бесед со счётом миграций
     (альтернация); CHROME_PATH песочницы указывает не на 131; mailLimiter
     в смоуке app.request; читаемые строки без emailed_at; «класс» в
     выражении className ловится css-parity как класс разметки.
ЧАСТЬ II (H–K, 2026-11-09) — тестовые запросы 2–4 одним заходом
  (test-162-requests2-4: R2 приглашения живьём с письмом de, R3 уведомления
  на живом работнике (finding_outdated проходом, сводка), R4 браузер на
  сборке под Chrome 131) и сверка после сжатия контекста:
  H  07 «По факту 16.2 (тестовые запросы 2–4)»: 72 ✓ ×2; регресс 16.1/15.x
     зелёный; переводы утверждены (черновиков 0).
  I  05 — test-162-requests2-4.
  J  NEXT-CONTEXT — тестовые запросы исполнены; черновиков 0.
  K  09 §4 — уроки харнесса (сводка владельцу до выключения; письма
     прежних прогонов в очереди).
ЧАСТЬ III (L–P, 2026-11-09) — завершение беседы: 07 «По факту 16.2
  (завершение)»; врезка «Фаза 16» — 16.2 закрыта; §12 журнал (долгов нет);
  08 Части I/II; README (строка Фазы 16 — 16.2 закрыта); NEXT-CONTEXT
  перезаписан рукой (состояние; ближайшая — 16.3); 09 §2 — урок патча
  (marker промежуточного блока NEXT-CONTEXT пережил перезапись — часть I
  вставилась повторно; marker — на закрытое состояние).
Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ; блок «По факту» — по
marker). Запуск из корня:
    python3 scripts/patches/patch-docs-conv162.py
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


D02 = "docs/02-data-model.md"
D03 = "docs/03-specification.md"
D04 = "docs/04-code-reuse-map.md"
D05 = "docs/05-file-structure.md"
D07 = "docs/07-conversation-protocol.md"
D09 = "docs/09-lessons.md"
NXT = "NEXT-CONTEXT.md"

print("ЧАСТЬ I — первый запрос 16.2")
patch(D05, "patch-docs-conv<NNN>.py; последний — conv161)", "patch-docs-conv<NNN>.py; последний — conv162)", "E 05 patches — последний conv162")

# ── A. 07 «По факту 16.2 (первый запрос)» ──────────────────────────────
FACT_162_R1 = """
**По факту 16.2 (первый запрос — 2026-11-09).** Исполнено целиком
(пп. 0–5), одним заходом; тестовые запросы и завершение — следующими
запросами. Вход: HEAD b9f7758 (16.1 закрыта), `check:dotfiles` OK,
`npm install` в клоне, `typecheck` чистый до правок.

0. Сверка текста с кодом и «По факту 16.1» (до правок) — расхождения:
   (а) `auth_tokens.user_id NOT NULL` — довод приглашения адресу БЕЗ
   аккаунта не на кого повесить; решено: строка на ПРИГЛАШАЮЩЕГО
   (`user_id` = владелец), адрес — в `new_email` (колонка 15.3), плюс две
   новые колонки `synthesis_id` (FK CASCADE) и `member_role`; (б) `issueToken`
   гасит прежние доводы по (пользователь, назначение) — владелец, зовущий
   двоих, погасил бы первое приглашение вторым; решено: своя выдача
   `issueMemberInviteToken` с гашением по (синтез, адрес), `issueToken`
   на `member_invite` бросает; (в) `mailLimiter` — локальная константа
   `routes/auth.ts`; экспортирован и стоит на трёх роутах писем участников;
   (г) `DiscussionAuthor` не знает «бывшего участника»; решено: поле
   `formerMember` ВЫЧИСЛЯЕТСЯ при чтении (автор не владелец и не действующий
   участник; у удалённого аккаунта — false, своя пометка); (д) не каждая
   мутация документа двигает `syntheses.updated_at` (правки элементов,
   трансформации, откаты, импорт) — «объект моего замечания изменился» не
   поймать триггером; решено: ПРОХОД `scanOutdatedAddresses` на тике
   работника почты (`NOTIFY_SCAN_INTERVAL_MS`, 60 с) сверяет адреса открытых
   корней и замечаний опубликованных рецензий тем же `resolveAddress`
   16.1, дедупликация по (объект, текущий хэш) частичным уникальным
   индексом; (е) 02/03 не знали таблиц и маршрутов 16.2 — заведены этим
   запросом (§2.38–2.39, §2.18–2.19, правило 17.1 в §2.18).
1. Приглашения (`services/members.ts`, `routes/members.ts`, 03 §2.18):
   email + роль (reviewer | editor); аккаунт есть → строка
   `synthesis_members` 'invited' + письмо под языком получателя со ссылкой
   `/invitations/:synthesisId` + уведомление `member_invited`; аккаунта
   нет → довод `member_invite` (72 ч) + письмо (язык запроса) со ссылкой
   `/register?invite=…`; регистрация с `inviteToken` ТОЙ ЖЕ транзакцией
   гасит довод и заводит строку 'invited' (адрес регистрации = адрес
   приглашения, иначе довод не гасится и участия нет; ответ
   `invitation: { synthesisId } | null`); `GET /auth/invitations/:token` —
   сведения для врезки регистрации (TOKEN_INVALID на негодный). Принять /
   отклонить — сам приглашённый (отклонение удаляет строку, повторное
   приглашение возможно). Владелец: сменить роль (PATCH), отозвать
   приглашённого (DELETE строки 'invited', без уведомления), исключить
   действующего (DELETE → `member_removed`; второй шаг — на клиенте),
   повторить письмо (новый довод для адреса без аккаунта — прежняя ссылка
   гаснет), отозвать ждущий довод. Конфликты — 409 `CONFLICT`: владелец
   сам, уже участник, уже приглашён (аккаунт либо адрес). Все управляющие
   функции — через `loadManaged` → `canManageSynthesis` (сторож 4bn, ни
   одного прямого сравнения владельца).
2. Исключение: комментарии и рецензии остаются, автор показывается
   `formerMember: true`; открытые предложения Фазы 17 закрываются с
   причиной «участник исключён» — правило 17.1 записано в 03 §2.18 и
   меткой в `removeMember`.
3. Клиент: вкладка «Документ | Участники» на странице концепции (только
   владельцу; `MembersPanel`: форма приглашения, таблица участников с
   `<select>` роли, статусом, датами, «Письмо ещё раз» / «Отозвать» у
   приглашённого, «Исключить» со вторым шагом `useSecondStep` у
   действующего; ждущие приглашения адресам без аккаунта отдельными
   строками с повтором и отзывом; 409 — строкой под формой);
   `InvitationPage` `/invitations/:synthesisId` под RequireAuth (принять /
   отклонить / открыть концепцию; 404 — «приглашения нет»); каталог —
   вкладка «Со мной поделились» (`GET /syntheses/shared`, бейдж роли /
   «приглашён · роль», проп `badgeOf` списка); полоса страницы концепции
   участнику — «Вы участник концепции · роль: …» вместо «публичная»;
   `RegisterPage` читает `?invite=` — врезка с приглашением, адрес
   подставлен и заперт, после регистрации — на страницу принятия.
4. Уведомления (`services/notifications.ts`, `routes/notifications.ts`,
   02 §2.38–2.39, 03 §2.19): одна точка записи `notify` (актор себе не
   пишется; отключённая в профиле категория НЕ ПИШЕТСЯ вовсе), строка —
   код `type` + ссылки (синтез, актор, адрес, объект) + `payload` (роль,
   выдержка), фразу собирает читатель (клиент `utils/notification-text.ts`;
   сводка — `notificationText` сервера под языком получателя) — правило
   14.2. События: member_invited / accepted / declined / role_changed /
   removed; comment_new (участникам), comment_reply (автору корня);
   review_published; finding_outdated (проходом); proposal_created /
   proposal_decided — типы заведены, пишет 17.1. Колокольчик
   (`NotificationBell`): опрос `GET /notifications/unread-count` раз в
   30 с только у видимой вкладки, выпадающий список с курсором, клик —
   прочитано + переход (приглашение — на страницу принятия), «Прочитать
   всё». Сводка по почте: проход на тике работника, получатели — с
   непрочитанным, ещё не вошедшим в сводку, `emailDigest` не выключен и
   прошло ≥ `NOTIFY_DIGEST_INTERVAL_HOURS` (6) с прежней; письмо под
   языком получателя, до 20 строк + «…и ещё N», строки помечаются
   `emailed_at` той же транзакцией, что постановка письма; отключённые
   категории в сводку не входят. Профиль — раздел «Уведомления»
   (категории, сводка; PATCH сразу). Удаление аккаунта снимает
   `notifications` и `notification_settings` явно (CASCADE при анонимизации
   молчит — урок 8.1).
5. Сторож 2bc/4bn/5ax: экспорты; все маршруты участников под requireAuth +
   handler, управляющие — через `loadManaged`; mailLimiter на трёх роутах
   писем; довод в enum/CHECK схемы и миграции 0018; журнал — 0018 на
   месте 18; deploy — девятнадцать; запись каждого типа событий 16.2 в
   коде; notify исключает актора и уважает категории; дедупликация
   устаревания; сводка уважает категории / emailDigest / интервал / язык;
   `formerMember` при чтении; проход на тике работника; account-deletion;
   env и дотфайлы; порядок монтирования (`/shared` до `/:id`); клиент
   (вкладка, маршрут, каталог, колокольчик опросом с заслоном видимости,
   настройки, `?invite=`, второй шаг без `window.confirm`); CSS-блок 16.2
   без hex/скруглений/теней; ключи en/de; 02/03/07. Живьём 5ax: FORBIDDEN /
   CONFLICT / VALIDATION_ERROR приглашений; письмо приглашённому по-английски
   (ui_locale en); member_invited → accept → member_accepted; роль;
   comment_new владельцу одному, comment_reply автору корня; review_published
   с выдержкой; проход устаревания — одна строка, повтор 0; список/курсор/
   markRead чужого null/markAllRead; настройки (чужая категория —
   ошибка); отключённая категория не пишется; сводка — одна, по-английски,
   повтор в интервале нет, при emailDigest=false нет; исключение →
   member_removed, `formerMember`; адрес без аккаунта → довод → письмо →
   `invitationInfo` → повтор письма гасит прежний → регистрация с чужим
   адресом не гасит, со своим — строка 'invited', дважды нет; отклонение
   → member_declined; отзыв довода; CHECK типа; удаление аккаунта и
   синтеза. Прежние сторожа ослаблены по образцу 4bl: 4bk/4bm — счёт
   миграций и enum purpose альтернацией; 4ap — `<div\\s+className` (полоса
   стала многострочной); 4bk — тик работника с проходом уведомлений между
   чисткой и очередью.
   Тесты: `tests/smoke-162-request1.mjs` 49 ✓ (A исходники; B живьём по
   HTTP через app.request — гейты, приглашение, принятие, роль, уведомления,
   настройки, курсор, устаревание, сводка, довод и регистрация,
   исключение; smoke-161 A13 «журнал = 18» поправлен на «≥ 18 и тег на
   месте» — класс 09 §4 16.1); `tests/test-162-request1-ui.mjs` 32 ✓ — сборка клиента под
   vite preview + Chrome 131 (вкладка «Участники» с 409 под формой и вторым
   шагом исключения, колокольчик → страница принятия → баннер роли,
   «Со мной поделились» с бейджем, профиль «Уведомления», регистрация по
   ссылке с запертым адресом и негодная ссылка). `typecheck`, `vite build`,
   css-parity A/B/C = 0, `i18n:check --strict` (142 ключа, en/de черновики
   — снимает пользователь), `check:integration` INTEGRATION OK,
   `check:dotfiles` OK. Миграция `0018_members_notifications` (drizzle-kit,
   тег переименован в файле и журнале; «No schema changes» после).
   Не делалось (по протоколу): рисование обсуждения в документе (16.3),
   права редактора (17), WS-уведомления и упоминания. Долгов в §12 нет.
   Доки — `patch-docs-conv162.py` (часть I).
"""
patch(
    D07,
    """- не делать WS-уведомлений и упоминаний.
```

**Последующие запросы:**
- «Протестируй приглашения живьём: существующий пользователь — письмо, принятие, доступ к приватной концепции; новый адрес — регистрация по ссылке и участие; отзыв, смена роли, исключение (его комментарии остаются «бывшим участником»); повторное приглашение участника — 409; письма приглашённому с ui_locale=de — по-немецки»""",
    """- не делать WS-уведомлений и упоминаний.
```
"""
    + FACT_162_R1
    + """
**Последующие запросы:**
- «Протестируй приглашения живьём: существующий пользователь — письмо, принятие, доступ к приватной концепции; новый адрес — регистрация по ссылке и участие; отзыв, смена роли, исключение (его комментарии остаются «бывшим участником»); повторное приглашение участника — 409; письма приглашённому с ui_locale=de — по-немецки»""",
    "A 07 «По факту 16.2 (первый запрос)»",
    marker="**По факту 16.2 (первый запрос — 2026-11-09).**",
)

# ── B. 02 — ER, auth_tokens, §2.38–2.39 ───────────────────────────────────
patch(
    D02,
    """  ├── auth_tokens (одноразовые доводы из писем; CASCADE; 9.1)
  ├── admin_audit (actor_id → users, SET NULL; 8.1)
""",
    """  ├── auth_tokens (одноразовые доводы из писем; CASCADE; 9.1;
  │                16.2: довод приглашения member_invite — на приглашающего,
  │                адрес в new_email, synthesis_id → syntheses CASCADE)
  ├── admin_audit (actor_id → users, SET NULL; 8.1)
  ├── notifications (16.2: получатель user_id CASCADE; actor_id SET NULL;
  │                  synthesis_id CASCADE; при 7.1 — снимаются явно)
  ├── notification_settings (16.2: user_id PK, CASCADE; при 7.1 — явно)
""",
    "B 02 ER-диаграмма += notifications / notification_settings",
)
patch(
    D02,
    """  purpose     TEXT NOT NULL CHECK (purpose IN ('email_verify','password_reset','email_change')),
                                 -- email_change — 15.3 (миграция 0015)
  token_hash  TEXT NOT NULL,     -- sha256(довод), hex; сам довод — только в письме
  expires_at  TIMESTAMPTZ NOT NULL,  -- email_verify: +72 ч; password_reset, email_change: +1 ч
  new_email   TEXT,              -- 15.3: адрес, на который переводится запись (только email_change)
  used_at     TIMESTAMPTZ,       -- погашен переходом ЛИБО выдачей следующего
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_tokens_user_purpose ON auth_tokens(user_id, purpose);
CREATE INDEX idx_auth_tokens_hash ON auth_tokens(token_hash);
```
""",
    """  purpose     TEXT NOT NULL CHECK (purpose IN ('email_verify','password_reset','email_change','member_invite')),
                                 -- email_change — 15.3 (миграция 0015); member_invite — 16.2 (0018)
  token_hash  TEXT NOT NULL,     -- sha256(довод), hex; сам довод — только в письме
  expires_at  TIMESTAMPTZ NOT NULL,  -- email_verify, member_invite: +72 ч; password_reset, email_change: +1 ч
  new_email   TEXT,              -- 15.3: адрес, на который переводится запись (email_change);
                                 -- 16.2: адрес приглашённого без аккаунта (member_invite)
  synthesis_id UUID REFERENCES syntheses(id) ON DELETE CASCADE,  -- 16.2: концепция приглашения (member_invite)
  member_role TEXT CHECK (member_role IS NULL OR member_role IN ('reviewer','editor')),  -- 16.2
  used_at     TIMESTAMPTZ,       -- погашен переходом ЛИБО выдачей следующего
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_tokens_user_purpose ON auth_tokens(user_id, purpose);
CREATE INDEX idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX idx_auth_tokens_synthesis ON auth_tokens(synthesis_id);  -- 16.2
```

**Приглашение адресу без аккаунта (16.2).** `user_id NOT NULL`, а
приглашённого ещё нет — довод `member_invite` висит на ПРИГЛАШАЮЩЕМ
(владельце), адрес — в `new_email`, концепция и роль — в `synthesis_id` /
`member_role`. Выдача — своя (`issueMemberInviteToken`): гасит прежние
непогашенные доводы того же (синтез, адрес), а не (пользователь,
назначение) — владелец зовёт многих; `issueToken` на `member_invite`
бросает. Регистрация с `inviteToken` одной транзакцией гасит довод
(`consumeMemberInviteToken`, один условный UPDATE) и заводит строку
`synthesis_members` 'invited' — только если адрес регистрации совпал с
`new_email`. Ждущие доводы синтеза — «приглашения адресам без аккаунта»
во вкладке «Участники» (отзыв = гашение, повтор письма = новый довод).
""",
    "B 02 §2.30 auth_tokens — довод member_invite",
)
NOTIF_TABLES = """
### 2.38. notifications

Уведомления получателю (беседа 16.2; миграция `0018_members_notifications`).
Пишутся ОДНОЙ точкой `services/notifications.ts: notify` исполнителем
вызывающего под точкой сохранения (сбой записи действие не отменяет);
актор своего события строки не получает; категория, отключённая
получателем (§2.39), не пишется вовсе. Фраза НЕ хранится (правило 14.2):
только код `type`, ссылки и параметры — клиент собирает её `tl()` на
языке интерфейса, сводка по почте — под языком получателя при постановке
письма. Доставка в приложении — опросом `unread-count` (без WebSocket),
по почте — сводкой (проход работника почты, `emailed_at`).

```sql
CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,      -- получатель
  type          TEXT NOT NULL CHECK (type IN ('member_invited','member_accepted','member_declined',
                  'member_role_changed','member_removed','comment_new','comment_reply',
                  'review_published','finding_outdated','proposal_created','proposal_decided')),
  synthesis_id  UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,              -- кто совершил; null — служба
  address       JSONB,                   -- DiscussionAddress объекта (комментарий, замечание)
  ref_kind      TEXT CHECK (ref_kind IS NULL OR ref_kind IN ('member','comment','review','finding','proposal')),
  ref_id        UUID,                    -- id объекта (без FK: объект может исчезнуть)
  payload       JSONB NOT NULL DEFAULT '{}',  -- { role?, excerpt? } — параметры фразы
  dedupe_key    TEXT,                    -- finding_outdated: outdated:<refKind>:<refId>:<hash>:<userId>
  read_at       TIMESTAMPTZ,
  emailed_at    TIMESTAMPTZ,             -- вошла в сводку по почте
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_synthesis ON notifications(synthesis_id);
CREATE UNIQUE INDEX uq_notifications_dedupe ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;
```

Категория типа (`NOTIFICATION_CATEGORY_OF`, shared): membership (member_*),
comments (comment_new, comment_reply), reviews (review_published), outdated
(finding_outdated), proposals (proposal_*; пишет 17.1). Список —
новые первыми, курсор — id последней строки, сравнение кортежем
`(created_at, id)` в PG (урок 16.1). «Объект моего открытого замечания
изменился» вычисляется ПРОХОДОМ `scanOutdatedAddresses` (не каждая
мутация документа двигает `syntheses.updated_at`): открытые корни
комментариев и замечания опубликованных рецензий сверяются
`resolveAddress`, у `outdated` — строка автору (если он ещё участник) один
раз на текущий хэш (`ON CONFLICT DO NOTHING` по частичному индексу).
Удаление аккаунта снимает строки получателя явно (7.1: CASCADE при
анонимизации молчит); строки, где удаляемый — актор, остаются.

### 2.39. notification_settings

Настройки получателя (беседа 16.2): отключённые категории и почтовая
сводка. Строки нет — всё включено.

```sql
CREATE TABLE notification_settings (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  muted_categories  JSONB NOT NULL DEFAULT '[]',   -- NotificationCategory[]
  email_digest      BOOLEAN NOT NULL DEFAULT true,
  digest_sent_at    TIMESTAMPTZ,                   -- когда уходила прежняя сводка
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Сводка (`runNotificationDigest`, тик работника почты): получатели — с
непрочитанным и `emailed_at IS NULL`, `email_digest` не выключен,
`digest_sent_at` старше `NOTIFY_DIGEST_INTERVAL_HOURS` (6; 0 — сводок нет);
письмо под языком получателя (до 20 строк + «…и ещё N»), строки помечаются
`emailed_at`, `digest_sent_at` ставится — той же транзакцией, что
постановка письма. Отключённые категории в сводку не входят (и
помечаются вошедшими — иначе держали бы получателя кандидатом).
"""
patch(
    D02,
    """**Сводка для документа** (`GET /syntheses/:id/discussion/summary`, 03
§2.17) считает по `(address_kind, address_key)` открытые корни комментариев
(не удалённые) и замечания ОПУБЛИКОВАННЫХ рецензий — двумя сгруппированными
запросами; для пометок у элементов в 16.3.
""",
    """**Сводка для документа** (`GET /syntheses/:id/discussion/summary`, 03
§2.17) считает по `(address_kind, address_key)` открытые корни комментариев
(не удалённые) и замечания ОПУБЛИКОВАННЫХ рецензий — двумя сгруппированными
запросами; для пометок у элементов в 16.3.
"""
    + NOTIF_TABLES,
    "B 02 §2.38–2.39 notifications / notification_settings",
    marker="### 2.38. notifications",
)

# ── C. 03 — §2.1 register/invitations, §2.18, §2.19, §4.3 ────────────────
patch(
    D03,
    """POST   /auth/register          { email, password, displayName? }
                                → { user: { id, email, displayName } }
                                // 9.1: письмо с подтверждением адреса""",
    """POST   /auth/register          { email, password, displayName?, inviteToken? }
                                → { user: { id, email, displayName }, invitation: { synthesisId } | null }
                                // 16.2: inviteToken — довод приглашения из
                                // /register?invite=…: гасится и строка
                                // synthesis_members 'invited' заводится ТОЙ ЖЕ
                                // транзакцией; адрес регистрации ≠ адресу
                                // приглашения → довод цел, invitation null
GET    /auth/invitations/:token → InvitationInfo { synthesisId, synthesisTitle, role, email, inviterName }
                                // 16.2: врезка страницы регистрации; без сессии;
                                // негодный довод → 400 TOKEN_INVALID
                                // 9.1: письмо с подтверждением адреса""",
    "C 03 §2.1 register += inviteToken; GET /auth/invitations/:token",
)
SPEC_218_219 = """
### 2.18. Участники и приглашения (беседа 16.2)

```
GET    /syntheses/shared                       → { items: SharedSynthesisPreview[] }  (мои участия любого статуса, с myRole/myStatus)
GET    /syntheses/:id/members                  → MembersView { members: MemberView[], invitations: PendingInvitation[] }  (владелец)
POST   /syntheses/:id/members                  { email, role: reviewer | editor } → MemberInviteResult (201; владелец; mailLimiter)
                                                 kind 'member'     — аккаунт есть: строка invited + письмо + уведомление
                                                 kind 'invitation' — аккаунта нет: довод member_invite + письмо на регистрацию
PATCH  /syntheses/:id/members/:mid             { role } → MemberView                 (владелец; активному — member_role_changed)
DELETE /syntheses/:id/members/:mid             → { ok, removed: invited | active }   (владелец: отзыв приглашения / исключение → member_removed)
POST   /syntheses/:id/members/:mid/resend      → { ok, sent }                        (владелец; только invited; mailLimiter)
DELETE /syntheses/:id/invitations/:tid         → { ok }                              (владелец; довод гасится)
POST   /syntheses/:id/invitations/:tid/resend  → { ok, sent, invitation }            (владелец; новый довод, прежний гаснет; mailLimiter)
GET    /syntheses/:id/membership               → MyMembership                        (приглашённый/участник; нет строки → 404)
POST   /syntheses/:id/membership/accept        → MyMembership                        (invited → active; владельцу — member_accepted)
POST   /syntheses/:id/membership/decline       → { ok }                              (строка удаляется; владельцу — member_declined)
```

**Доступ**: гость → 401; не-UUID / нет строки → 404; управляющие маршруты
— только владелец (`loadManaged` → `canManageSynthesis`; сторож 4bn) →
иначе 403 `FORBIDDEN`. `GET /shared` монтируется ДО `GET /:id` (как
`/public`). Участники — только по приглашению владельца (решение
пользователя); приглашённый до принятия — читатель (16.1).

**Конфликты** — 409 `CONFLICT` с причиной в `error`: владелец приглашает
себя; адрес уже участник; уже приглашён (аккаунт — строка invited; без
аккаунта — ждущий довод) — «можно повторить письмо»; повторное принятие;
отклонение действующего («выйти может только владелец исключением»);
повтор письма действующему. Роль вне reviewer | editor и негодный адрес —
400 `VALIDATION_ERROR` (`details.role` / `details.email`).

**Письма** — шаблонами 14.1 под языком ПОЛУЧАТЕЛЯ (`users.ui_locale`;
адресу без аккаунта — язык запроса): приглашённому с аккаунтом — ссылка
на страницу принятия `/invitations/:synthesisId`; без аккаунта — ссылка
`/register?invite=<довод>` (72 ч, одноразовая; новое приглашение адресу
гасит прежнюю). Постановка под точкой сохранения — сбой письма действие
не отменяет (`sent: false`).

**Исключение участника** (DELETE активного): строка снимается; его
комментарии и рецензии ОСТАЮТСЯ, автор показывается `formerMember: true`
(вычисляется при чтении: не владелец и не действующий участник).
**Правило для 17.1**: открытые предложения исключённого закрываются с
причиной «участник исключён» той же транзакцией (`removeMember`; метка
в коде). Отзыв приглашённого (строка invited) уведомления не даёт.

**Клиент**: вкладка «Документ | Участники» страницы концепции (владельцу;
`MembersPanel`: приглашение email + роль, 409 строкой под формой, `<select>`
роли с PATCH сразу, «Письмо ещё раз» / «Отозвать» у приглашённого,
«Исключить» со вторым шагом `useSecondStep`, ждущие приглашения адресам
без аккаунта отдельными строками); `InvitationPage` `/invitations/:synthesisId`
(RequireAuth); каталог — вкладка «Со мной поделились» с бейджем роли;
полоса страницы концепции участнику — его роль; `RegisterPage` с
`?invite=` — врезка приглашения, адрес подставлен и заперт, после
регистрации — на страницу принятия.

### 2.19. Уведомления (беседа 16.2)

```
GET    /notifications                 ?unread=1&limit=30&cursor → NotificationList { items: Notification[], unread, nextCursor }
GET    /notifications/unread-count    → { unread }                                   (опрос колокольчика, 30 с, только видимая вкладка)
POST   /notifications/read-all        → { ok, marked }
POST   /notifications/:id/read        → Notification                                 (только своя; чужая/не-UUID → 404)
GET    /notifications/settings        → NotificationSettings { mutedCategories, emailDigest }
PATCH  /notifications/settings        { mutedCategories?, emailDigest? } → NotificationSettings
                                        // категория вне списка / не-boolean → 400 VALIDATION_ERROR
```

`Notification { id, type, category, synthesisId, synthesisTitle, actor:
{ id | null, name } | null, address, refKind, refId, payload: { role?,
excerpt? }, readAt, createdAt }` — фраза НЕ передаётся (14.2): клиент
собирает её по `type`/`payload` (`utils/notification-text.ts`), сводка по
почте — сервер под языком получателя. События и получатели: member_invited
(приглашённому), member_accepted / member_declined (владельцу),
member_role_changed / member_removed (участнику), comment_new (владелец +
действующие участники, кроме автора; при ответе — всем, кроме автора
корня), comment_reply (автору корня ветки), review_published (всем, кроме
автора), finding_outdated (автору открытого корня / замечания
опубликованной рецензии — проходом, один раз на текущий хэш объекта),
proposal_created / proposal_decided — заведены, пишет 17.1. Актор своего
события не получает; отключённая категория не пишется вовсе. Доставка —
опросом (без WebSocket) и сводкой по почте не чаще `NOTIFY_DIGEST_INTERVAL_HOURS`
(02 §2.39). Страница ≤ 200 (умолчание 30), курсор — id последней строки.
"""
patch(
    D03,
    """**Автор**: `{ id, name, deleted, isOwner }`; удалённый аккаунт (7.1) —
`id: null`, `deleted: true`, `name` = «удалённый пользователь» на языке
запроса. `isOwner` автора — через модуль прав.

---

## 3. WebSocket-протокол""",
    """**Автор**: `{ id, name, deleted, isOwner, formerMember }`; удалённый аккаунт
(7.1) — `id: null`, `deleted: true`, `name` = «удалённый пользователь» на
языке запроса. `isOwner` автора — через модуль прав; `formerMember` (16.2)
— автор не владелец и не действующий участник (исключён либо отклонил),
вычисляется при чтении.
"""
    + SPEC_218_219
    + """
---

## 3. WebSocket-протокол""",
    "C 03 §2.18–2.19 участники и уведомления",
    marker="### 2.18. Участники и приглашения (беседа 16.2)",
)
patch(
    D03,
    """                      правка или замечание у отозванной рецензии, удаление
                      опубликованной — 409; один код, причина — в error
SELF_ROLE_CHANGE""",
    """                      правка или замечание у отозванной рецензии, удаление
                      опубликованной — 409; один код, причина — в error;
                      16.2 (§2.18): владелец приглашает себя, адрес уже
                      участник / уже приглашён, повторное принятие,
                      отклонение действующего, повтор письма действующему
SELF_ROLE_CHANGE""",
    "C 03 §4.3 CONFLICT += участники",
)

# ── D. 04 §4 — строка 16.2 ────────────────────────────────────────────────
patch(
    D04,
    """| `metaParentAllowed` в `packages/shared/utils/visibility.ts`;""",
    """| `inviteMember`, `changeMemberRole`, `removeMember`, `resendMemberInvite`, `revokeInvitation`, `resendInvitation`, `myMembership`, `acceptInvitation`, `declineInvitation`, `invitationInfo`, `applyInviteOnRegister`, `listMyMemberships` в `server/services/members.ts`; `notify`, `notifySafe`, `participantsOf`, `notifyParticipants`, `listNotifications`, `markRead`, `markAllRead`, `getSettings`, `updateSettings`, `notificationText`, `scanOutdatedAddresses`, `runNotificationDigest`, `maybeRunNotificationPasses` в `server/services/notifications.ts`; `issueMemberInviteToken`, `peekMemberInviteToken`, `consumeMemberInviteToken`, `listMemberInviteTokens`, `revokeMemberInviteToken`, `queueMemberInviteRegisterMail` (`services/auth-tokens.ts`); `memberInviteLetter`, `memberInviteRegisterLetter`, `notificationDigestLetter` (`mail/templates.ts`); `routes/members.ts` (11 маршрутов §2.18), `routes/notifications.ts` (6 маршрутов §2.19), `GET /auth/invitations/:token`, `inviteToken` у register, экспорт `mailLimiter`; `formerMember` у `DiscussionAuthor`; миграция `0018_members_notifications`; env `NOTIFY_DIGEST_INTERVAL_HOURS` / `NOTIFY_SCAN_INTERVAL_MS`; shared `constants/notifications.ts`, `types/notifications.ts`; клиент — `api/members.ts`, `api/notifications.ts`, `MembersPanel.tsx`, `NotificationBell.tsx`, `NotificationSettings.tsx`, `pages/InvitationPage.tsx`, `utils/notification-text.ts`, вкладка «Со мной поделились» (`badgeOf` списка), вкладки «Документ | Участники» и полоса роли в `SynthesisPage.tsx`, `?invite=` в `RegisterPage.tsx`, `registeredInvitation` в auth-store | НОВОЕ (16.2; в исходнике ни участников, ни уведомлений): приглашения по email с ролью (аккаунт — строка invited + письмо; без аккаунта — довод на приглашающего с адресом в new_email + регистрация по ссылке), принятие/отклонение, роль/отзыв/исключение (второй шаг на клиенте), «бывший участник» при чтении; уведомления кодами без фразы (14.2) одной точкой записи (актор исключён, отключённые категории не пишутся), опрос колокольчика, проход сверки адресов для «устарело», сводка по почте под языком получателя на тике работника |
| `metaParentAllowed` в `packages/shared/utils/visibility.ts`;""",
    "D 04 §4 строка 16.2",
)

# ── E. 05 — файлы 16.2 ─────────────────────────────────────────────────────
patch(
    D05,
    """│       │   ├── discussion.ts           # 16.1: MEMBER_ROLES/STATUSES, ADDRESS_KINDS/STATES, COMMENT_KINDS/
│       │   │                           #  STATUSES, REVIEW_STATUSES, REVIEW_TEXT_FIELDS, пределы текстов и страниц
""",
    """│       │   ├── discussion.ts           # 16.1: MEMBER_ROLES/STATUSES, ADDRESS_KINDS/STATES, COMMENT_KINDS/
│       │   │                           #  STATUSES, REVIEW_STATUSES, REVIEW_TEXT_FIELDS, пределы текстов и страниц
│       │   ├── notifications.ts        # 16.2: NOTIFICATION_TYPES (11) / CATEGORIES (5) / CATEGORY_OF, REF_KINDS,
│       │   │                           #  страницы, MEMBER_INVITE_TOKEN_PURPOSE, MEMBER_INVITE_TTL_HOURS
""",
    "E 05 shared/constants/notifications.ts",
)
patch(
    D05,
    """│       │   ├── discussion.ts           # 16.1: Capabilities, SynthesisRole, DiscussionAddress/Resolution,
│       │   │                           #  Comment*, Review*, ReviewRevision, ReviewFinding, DiscussionSummary
""",
    """│       │   ├── discussion.ts           # 16.1: Capabilities, SynthesisRole, DiscussionAddress/Resolution,
│       │   │                           #  Comment*, Review*, ReviewRevision, ReviewFinding, DiscussionSummary;
│       │   │                           #  16.2: DiscussionAuthor.formerMember
│       │   ├── notifications.ts        # 16.2: MemberView, PendingInvitation, MembersView, MemberInviteResult,
│       │   │                           #  MyMembership, InvitationInfo, SharedSynthesisPreview, Notification*,
│       │   │                           #  NotificationList, NotificationSettings
""",
    "E 05 shared/types/notifications.ts",
)
patch(
    D05,
    """│   │       ├── 0017_discussion.sql     # 16.1: synthesis_members, comments, reviews, review_revisions,
│   │       │                           #  review_findings (CASCADE по синтезу, author_id SET NULL); drizzle-kit,
│   │       │                           #  тег переименован
""",
    """│   │       ├── 0017_discussion.sql     # 16.1: synthesis_members, comments, reviews, review_revisions,
│   │       │                           #  review_findings (CASCADE по синтезу, author_id SET NULL); drizzle-kit,
│   │       │                           #  тег переименован
│   │       ├── 0018_members_notifications.sql  # 16.2: notifications, notification_settings; auth_tokens +=
│   │       │                           #  purpose member_invite, synthesis_id (CASCADE), member_role (CHECK);
│   │       │                           #  частичный уникальный индекс dedupe; drizzle-kit, тег переименован
""",
    "E 05 миграция 0018",
)
patch(
    D05,
    """│   │   ├── discussion.ts               # 16.1: 18 маршрутов /syntheses/:id/comments|reviews|discussion/summary
│   │   │                               #  (03 §2.17) под requireAuth + discussGate (404 → 403 по discuss);
│   │   │                               #  hide/unhide — manage; DiscussionError → 400/403/404/409
""",
    """│   │   ├── discussion.ts               # 16.1: 18 маршрутов /syntheses/:id/comments|reviews|discussion/summary
│   │   │                               #  (03 §2.17) под requireAuth + discussGate (404 → 403 по discuss);
│   │   │                               #  hide/unhide — manage; DiscussionError → 400/403/404/409
│   │   ├── members.ts                  # 16.2: 11 маршрутов участников (03 §2.18): GET /shared (ДО /:id),
│   │   │                               #  /:id/members[/:mid[/resend]], /:id/invitations/:tid[/resend],
│   │   │                               #  /:id/membership[/accept|/decline]; письма — под mailLimiter
│   │   ├── notifications.ts            # 16.2: 6 маршрутов /notifications (03 §2.19): список с курсором,
│   │   │                               #  unread-count (опрос), read / read-all, settings GET/PATCH
""",
    "E 05 routes/members.ts, routes/notifications.ts",
)
patch(
    D05,
    """│   │   ├── discussion.ts               # 16.1: комментарии (плоские ветки, курсор, resolve/hide, мягкое
│   │   │                               #  удаление), рецензии (draft → publish → редакции → withdraw),
│   │   │                               #  замечания, сводка по адресам; plainText; автор «удалённый
│   │   │                               #  пользователь» по анонимизированному email 7.1; в документ не пишет
""",
    """│   │   ├── discussion.ts               # 16.1: комментарии (плоские ветки, курсор, resolve/hide, мягкое
│   │   │                               #  удаление), рецензии (draft → publish → редакции → withdraw),
│   │   │                               #  замечания, сводка по адресам; plainText; автор «удалённый
│   │   │                               #  пользователь» по анонимизированному email 7.1; в документ не пишет;
│   │   │                               #  16.2: уведомления comment_new/comment_reply/review_published,
│   │   │                               #  formerMember автора при чтении (activeMemberIds)
│   │   ├── members.ts                  # 16.2: участники — приглашение (аккаунт → строка invited + письмо
│   │   │                               #  под языком получателя; без аккаунта → довод member_invite + письмо
│   │   │                               #  на регистрацию), роль, отзыв/исключение, повтор письма, принятие/
│   │   │                               #  отклонение, invitationInfo, applyInviteOnRegister (транзакция
│   │   │                               #  register); все управляющие — loadManaged → canManageSynthesis;
│   │   │                               #  MembersError → 400/403/404/409
│   │   ├── notifications.ts            # 16.2: notify (одна точка записи: актор исключён, отключённые
│   │   │                               #  категории не пишутся; код + ссылки + payload, фраза при чтении —
│   │   │                               #  14.2), список/курсор/непрочитанное/прочитать, настройки,
│   │   │                               #  notificationText (сводка), scanOutdatedAddresses (проход сверки
│   │   │                               #  адресов, dedupe по хэшу), runNotificationDigest (сводка по почте
│   │   │                               #  под языком получателя, NOTIFY_DIGEST_INTERVAL_HOURS),
│   │   │                               #  maybeRunNotificationPasses — тик работника почты
""",
    "E 05 services/members.ts, services/notifications.ts",
)
patch(
    D05,
    """│   │   │   ├── VerifyEmailPage.tsx     # 9.1: «/verify-email/:token» — подтверждение, затем каталог""",
    """│   │   │   ├── InvitationPage.tsx      # 16.2: «/invitations/:synthesisId» (RequireAuth, внутри Layout) —
│   │   │   │                           #  принять / отклонить / открыть концепцию; 404 — «приглашения нет»
│   │   │   ├── VerifyEmailPage.tsx     # 9.1: «/verify-email/:token» — подтверждение, затем каталог""",
    "E 05 pages/InvitationPage.tsx",
)
patch(
    D05,
    """│   │   │   │   ├── LanguageSwitch.tsx      # 11.3: переключатель ru/en/de (topbar | form);""",
    """│   │   │   │   ├── NotificationBell.tsx    # 16.2: колокольчик — опрос unread-count (30 с, видимая вкладка),
│   │   │   │   │                           #  выпадающий список с курсором, клик → прочитано + переход,
│   │   │   │   │                           #  «Прочитать всё»; клик мимо закрывает
│   │   │   │   ├── NotificationSettings.tsx # 16.2: раздел «Уведомления» профиля — категории и сводка,
│   │   │   │   │                           #  PATCH /notifications/settings сразу
│   │   │   │   ├── LanguageSwitch.tsx      # 11.3: переключатель ru/en/de (topbar | form);""",
    "E 05 layout/NotificationBell.tsx, NotificationSettings.tsx",
)
patch(
    D05,
    """│   │   │   ├── recommendations.ts      # 10.3: list / parse / extract / plan (+ withBusyRetry на 409 после done)
│   │   │   └── export.ts
""",
    """│   │   │   ├── recommendations.ts      # 10.3: list / parse / extract / plan (+ withBusyRetry на 409 после done)
│   │   │   ├── members.ts              # 16.2: участники (§2.18) + listSharedSyntheses + getInvitationInfo
│   │   │   ├── notifications.ts        # 16.2: список/unread-count/read/read-all/settings (§2.19)
│   │   │   └── export.ts
""",
    "E 05 api/members.ts, api/notifications.ts",
)
patch(
    D05,
    """│   │       ├── visibility-text.ts          # 8.7: тексты ступеней/галочек, flagsShownFor""",
    """│   │       ├── notification-text.ts        # 16.2: фраза уведомления по type/payload на языке интерфейса
│   │       │                               #  (зеркало серверного notificationText; 14.2) + notificationLink
│   │       ├── visibility-text.ts          # 8.7: тексты ступеней/галочек, flagsShownFor""",
    "E 05 utils/notification-text.ts",
)
patch(
    D05,
    """    │                                   # smoke-161-request1 — 16.1: матрица прав (capabilitiesFor), ключи и хэши""",
    """    │                                   # smoke-162-request1 — 16.2: константы уведомлений, маршруты под requireAuth,
    │                                   #  миграция 0018, env, CSS-блок, i18n; живьём по HTTP (app.request):
    │                                   #  гейты 401/403/404/409, приглашение → письмо (en) → member_invited →
    │                                   #  принятие → роль → комментарии/уведомления → настройки → курсор/read →
    │                                   #  устаревание и сводка → довод и регистрация → исключение (49 ✓)
    │                                   # test-162-request1-ui — 16.2: сборка клиента под vite preview :5231 +
    │                                   #  Chrome 131: вкладка «Участники» (409 под формой, второй шаг
    │                                   #  исключения), колокольчик → страница принятия → полоса роли, «Со мной
    │                                   #  поделились», профиль «Уведомления», /register?invite= (32 ✓)
    │                                   # smoke-161-request1 — 16.1: матрица прав (capabilitiesFor), ключи и хэши""",
    "E 05 tests smoke-162 / test-162-ui",
)

# ── F. NEXT-CONTEXT ────────────────────────────────────────────────────────
patch(
    NXT,
    """## Состояние на 2026-11-09 (16.1 ЗАКРЫТА 2026-11-09; Фаза 16 открыта; ближайшая — 16.2)
""",
    """## Состояние на 2026-11-09, вечер (16.2 — первый запрос ИСПОЛНЕН; далее тестовые запросы 16.2)

**16.2 (участники, приглашения, уведомления — бэкенд + клиент), первый
запрос исполнен 2026-11-09** («По факту 16.2 (первый запрос)» в 07).
Инварианты 16.2: участники только по приглашению владельца — все
управляющие функции `services/members.ts` через `loadManaged` →
`canManageSynthesis` (сторож 4bn); довод приглашения адресу без аккаунта
висит на ПРИГЛАШАЮЩЕМ (`auth_tokens.user_id`), адрес — `new_email`,
концепция/роль — `synthesis_id`/`member_role`, выдача своя
(`issueMemberInviteToken`, гашение по синтезу+адресу), регистрация с
`inviteToken` гасит довод и заводит строку 'invited' ТОЙ ЖЕ транзакцией;
«бывший участник» (`formerMember`) вычисляется при чтении; уведомления —
ОДНА точка записи `notify` (актор исключён, отключённые категории не
пишутся), строка = код + ссылки + payload, фраза при чтении (14.2);
«устарело» — ПРОХОДОМ `scanOutdatedAddresses` (dedupe по хэшу), сводка по
почте — `runNotificationDigest` на тике работника (`NOTIFY_DIGEST_INTERVAL_HOURS`,
`NOTIFY_SCAN_INTERVAL_MS`), колокольчик — опросом без WS; `GET
/syntheses/shared` смонтирован ДО `/:id`. **Сторож 2bc/4bn/5ax ЗАНЯТ
(следующая серия — 2bd/4bo/5ay); миграция 0018 ЗАНЯТА (следующая —
0019)**; 142 ключа 16.2 — ЧЕРНОВИКИ en/de (снимает пользователь);
smoke-162 49 ✓, test-162-request1-ui 32 ✓ (Chrome 131 — в песочнице
`CHROME_PATH` указывал на Chrome 153: харнесс 16.2 берёт кэш 131 первым).
Прежние сторожа 4ap/4bk/4bm ослаблены альтернацией (счёт миграций, enum
purpose, многострочная полоса, тик работника). Доки —
`patch-docs-conv162.py` (часть I). Дальше по протоколу 16.2: тестовые
запросы (приглашения живьём с de-письмом, уведомления, браузер) и
завершение; 17.1 помнит правило 03 §2.18 (закрыть предложения
исключённого) и типы proposal_* в `NOTIFICATION_TYPES`.

## Состояние на 2026-11-09 (16.1 ЗАКРЫТА 2026-11-09; Фаза 16 открыта; ближайшая — 16.2)
""",
    "F NEXT-CONTEXT — первый запрос 16.2",
    marker="16.2 ЗАКРЫТА 2026-11-09",  # часть III перезаписала состояние рукой — блок части I больше не нужен (09 §2)
)

# ── G. 09 — уроки 16.2 ─────────────────────────────────────────────────────
patch(
    D09,
    """## 4. Тесты, харнессы, браузер
""",
    """### Беседа 16.2 — сторожа прежних бесед, читаемые строки, className

1. **Сторож прежней беседы, знающий счёт миграций или enum дословно,
   ломается следующей миграцией**: 4bm «ВОСЕМНАДЦАТЬ (0000…0017», 4bk
   `enum: ["email_verify", "password_reset", "email_change"]` и `0000…001[5-7]`,
   4bk тик работника «maybeMaintain → try processOutbox» — все упали на
   0018 и проходе уведомлений. Ослаблять АЛЬТЕРНАЦИЕЙ (образец 4bl:
   `0000…0016|0016_plan_editions|…`), не снимать; новый сторож пишет свою
   проверку, а старая остаётся историей. Тот же класс, что 09 §4 (16.1)
   для харнессов.
2. **Проверка «нет строк без `emailed_at`» после сводки ловит ПРОЧИТАННЫЕ
   строки**: сводка берёт только непрочитанное, прочитанная до неё строка
   так и остаётся без отметки — сторож должен фильтровать `read_at IS
   NULL` (5ax).
3. **Регулярка по исходнику клиента должна учитывать комментарий шапки**:
   `/WebSocket/` в NotificationBell сработал на «без WebSocket — решение
   беседы» в комментарии; перед проверками — `strip()` комментариев, как у
   прочих файлов секции.

## 4. Тесты, харнессы, браузер
""",
    "G 09 §3 уроки 16.2 (сторожа)",
    marker="### Беседа 16.2 — сторожа прежних бесед, читаемые строки, className",
)
patch(
    D09,
    """## 5. Node, TypeScript, сборка
""",
    """### Беседа 16.2 — CHROME_PATH песочницы, mailLimiter в смоуке

1. **`CHROME_PATH` окружения может указывать не на Chrome 131**: в
   песочнице он вёл на системный `/usr/bin/google-chrome` (153), и харнесс,
   ставящий `CHROME_PATH` первым, молча прогнал на нём («браузер:
   Chrome/153»). test-162 берёт кэш puppeteer 131 ПЕРВЫМ, `CHROME_PATH` —
   запасным; читать строку «(браузер: …)» в выводе.
2. **`mailLimiter` считает по адресу клиента, а `app.request` — один
   адрес**: десять писем в час (RATE_LIMIT_MAIL_PER_HOUR) смоук выбирает за
   минуту → 429 на приглашениях; перед импортом серверных модулей ставить
   `process.env.RATE_LIMIT_MAIL_PER_HOUR = "1000"` (env читается при
   импорте). Счётчик живёт в Redis — повторный прогон упирается в него же.
3. **Ждать не контейнер страницы, а элемент фазы**: `invitation-page`
   рисуется и в фазе loading — `$eval(invitation-lead)` падал; ждать
   `invitation-lead` / `invitation-accept`.

## 5. Node, TypeScript, сборка
""",
    "G 09 §4 уроки 16.2 (браузер)",
    marker="### Беседа 16.2 — CHROME_PATH песочницы, mailLimiter в смоуке",
)
patch(
    D09,
    """## 7. Сервер: стрим, WS, Redis, Registry
""",
    """### Беседа 16.2 — литерал в выражении className

1. **css-parity (C) берёт ВСЕ строковые литералы внутри `className={…}`**:
   `className={pageTab === "document" ? "a" : "b"}` и даже
   `className={cls("document")}` дают «класс document без правил».
   Выносить вызов в переменную до JSX (`const documentTabCls = …;
   className={documentTabCls}`) — литерал уходит из выражения.

## 7. Сервер: стрим, WS, Redis, Registry
""",
    "G 09 §6 урок 16.2 (className)",
    marker="### Беседа 16.2 — литерал в выражении className",
)


print("\nЧАСТЬ II — тестовые запросы 2–4 16.2")

FACT_162_R24 = """
**По факту 16.2 (тестовые запросы 2–4 — 2026-11-09).** Исполнены одним
заходом харнессом `tests/test-162-requests2-4.mjs` (живой сервер :3000 с
почтой в консоль, работник и проход уведомлений раз в секунду, сводка раз
в час; сборка клиента под vite preview :5231; Chrome 131 из кэша
puppeteer — харнесс проверяет версию строкой): **72 ✓ ×2**.
- R2 (приглашения живьём): приглашённый с `ui_locale=de` получает письмо
  **по-немецки** («Einladung zur Konzeption…», роль «Rezensent», ссылка на
  `/invitations/:id`); до принятия — читатель (403 на приватной и
  обсуждении), после — role reviewer, discuss без edit; повторное
  приглашение приглашённого/участника и приглашение владельца — 409;
  участник приглашать не может (403); адрес без аккаунта — письмо
  по-русски (язык запроса) со ссылкой `/register?invite=`, `GET
  /auth/invitations/:token` отдаёт сведения, повтор письма даёт новый довод
  и гасит прежний (TOKEN_INVALID), регистрация ЧУЖОГО адреса с доводом
  участия не даёт и довод не гасит, своего — участие invited того же
  синтеза, ждущее приглашение погашено, принятие → editor без edit; отзыв
  приглашённого (removed invited, 404 на membership/accept, повторное
  приглашение возможно); повтор письма приглашённому с аккаунтом; смена
  роли (400 на чужой роли, 403 не владельцу); исключение — доступ закрыт,
  комментарий и опубликованная рецензия остались с `formerMember: true`
  (владелец не помечен, действующий участник видит ту же пометку),
  исключённого можно пригласить снова; `GET /syntheses/shared`.
- R3 (уведомления): каждое событие — строка получателю и НЕ автору:
  member_invited / accepted / declined / role_changed / removed,
  comment_new (у отключившего категорию строки нет), comment_reply,
  review_published; **finding_outdated — проходом живого работника** после
  `PATCH /categories/:id` владельцем (≤ 12 с, одна строка, повторные
  проходы не дублируют, владелец-не-автор не получает); счётчик = длине
  `?unread=1`, read −1, чужая 404, «прочитать всё» → 0; **сводка** участнику
  под его языком (en) — приглашение и рецензия есть, отключённые
  комментарии нет, тема «2 new notifications», вторая сводка в пределах
  часа не уходит при новом непрочитанном, у выключивших сводку новых
  писем нет, вошедшие строки помечены `emailed_at`.
- R4 (браузер): вкладка «Участники» — приглашение, 409 под формой, строка
  адреса без аккаунта, `<select>` роли, второй шаг исключения (взвод →
  «Отмена» → взвод → исключить); колокольчик приглашённого — счётчик 1 →
  страница принятия → «Принять» → полоса «роль: рецензент»; после
  исключения — две непрочитанные (новые первыми), «Прочитать всё» снимает
  счётчик и согласуется с сервером; «Со мной поделились» — «приглашён ·
  редактор» → «редактор»; профиль — 5 категорий + сводка, переключатель
  сохраняется; регистрация по ссылке — адрес заперт, после — страница
  принятия; ошибок JS нет.
- Сверка после сжатия контекста (пользователь заметил сжатие на сервисе
  уведомлений): текст первого запроса перечитан по пунктам против кода —
  расхождений нет; решения врезки «Фаза 16» соблюдены; миграция 0018
  содержит DROP/ADD CHECK purpose, новые колонки, частичные индексы;
  набор 5-6-ui-kit классов участников/колокольчика не задаёт — свой блок
  по его правилам (единственное отступление — выпадающий список
  колокольчика в шапке: раскрыть по месту в полосе негде).
- Регресс: test-161 61 ✓, test-153 51 ✓, smoke-153 34 ✓, smoke-154 47 ✓,
  smoke-161 58 ✓, `check:integration` OK. **Переводы 16.2 утверждены**
  (284 подтверждены вычиткой, черновиков 0). Уроки харнесса — 09 §4.
  Доки — `patch-docs-conv162.py` (часть II).
"""
patch(
    D07,
    """**Последующие запросы:**
- «Протестируй приглашения живьём: существующий пользователь — письмо, принятие, доступ к приватной концепции; новый адрес — регистрация по ссылке и участие; отзыв, смена роли, исключение (его комментарии остаются «бывшим участником»); повторное приглашение участника — 409; письма приглашённому с ui_locale=de — по-немецки»
- «Протестируй уведомления: каждое событие из п.4 даёт строку получателю и не даёт автору события; счётчик, «прочитать всё»; сводка по почте за период, отключённая категория в сводку не входит»
- «Протестируй в браузере (Chrome 131, сборка клиента): вкладка «Участники» с приглашением и вторым шагом исключения, страница принятия, «Со мной поделились», колокольчик»
""",
    """**Последующие запросы:**
- «Протестируй приглашения живьём: существующий пользователь — письмо, принятие, доступ к приватной концепции; новый адрес — регистрация по ссылке и участие; отзыв, смена роли, исключение (его комментарии остаются «бывшим участником»); повторное приглашение участника — 409; письма приглашённому с ui_locale=de — по-немецки»
- «Протестируй уведомления: каждое событие из п.4 даёт строку получателю и не даёт автору события; счётчик, «прочитать всё»; сводка по почте за период, отключённая категория в сводку не входит»
- «Протестируй в браузере (Chrome 131, сборка клиента): вкладка «Участники» с приглашением и вторым шагом исключения, страница принятия, «Со мной поделились», колокольчик»
"""
    + FACT_162_R24,
    "H 07 «По факту 16.2 (тестовые запросы 2–4)»",
    marker="**По факту 16.2 (тестовые запросы 2–4 — 2026-11-09).**",
)
patch(
    D05,
    """    │                                   # test-162-request1-ui — 16.2: сборка клиента под vite preview :5231 +""",
    """    │                                   # test-162-requests2-4 — 16.2: живой сервер :3000 (почта в консоль, работник
    │                                   #  и проход уведомлений раз в секунду), preview :5231, Chrome 131: R2
    │                                   #  приглашения (письмо de, регистрация по ссылке, отзыв/роль/исключение,
    │                                   #  «бывший участник»), R3 уведомления на каждое событие не автору,
    │                                   #  finding_outdated проходом работника, счётчик/read-all, сводка под языком
    │                                   #  получателя без отключённых категорий, R4 браузер (72 ✓ ×2)
    │                                   # test-162-request1-ui — 16.2: сборка клиента под vite preview :5231 +""",
    "I 05 test-162-requests2-4",
)
patch(
    NXT,
    """142 ключа 16.2 — ЧЕРНОВИКИ en/de (снимает пользователь);
smoke-162 49 ✓, test-162-request1-ui 32 ✓ (Chrome 131 — в песочнице""",
    """142 ключа 16.2 УТВЕРЖДЕНЫ (черновиков 0); тестовые запросы 2–4
ИСПОЛНЕНЫ — test-162-requests2-4 72 ✓ ×2 (R2 письмо de, регистрация по
ссылке, исключение с «бывшим участником»; R3 все события не автору,
finding_outdated проходом живого работника, сводка под языком получателя;
R4 браузер), регресс 16.1/15.x зелёный; осталось завершение беседы
(компиляция, ревью TODO, 08 Часть II, врезка «Фаза 16», README);
smoke-162 49 ✓, test-162-request1-ui 32 ✓ (Chrome 131 — в песочнице""",
    "J NEXT-CONTEXT — тестовые запросы исполнены",
    marker="16.2 ЗАКРЫТА 2026-11-09",
)
patch(
    D09,
    """3. **Ждать не контейнер страницы, а элемент фазы**: `invitation-page`
   рисуется и в фазе loading — `$eval(invitation-lead)` падал; ждать
   `invitation-lead` / `invitation-accept`.
""",
    """3. **Ждать не контейнер страницы, а элемент фазы**: `invitation-page`
   рисуется и в фазе loading — `$eval(invitation-lead)` падал; ждать
   `invitation-lead` / `invitation-accept`.
4. **Сводка на живом работнике уходит раньше, чем тест выключит её**:
   владелец копил непрочитанное в R2, работник с часовым интервалом (и
   пустым `digest_sent_at`) отправил ему сводку на первом же тике — проверка
   «у выключивших сводку писем нет» в R3 упала на письме из R2. Считать
   письма ОТ точки выключения (счётчик до/после), а не «ноль за прогон».
5. **Очередь `mail_outbox` общей БД держит письма прежних прогонов**: с
   живым работником они уходят в лог первыми (`ic141-…` из
   check:integration 14.1) — фильтровать письма по адресу своего TAG, не
   считать «первое письмо в логе» своим.
""",
    "K 09 §4 уроки харнесса 16.2 (часть II)",
)

print("\nЧАСТЬ III — завершение 16.2")
D08 = "docs/08-history.md"
RDM = "README.md"

FACT_162_END = """
**По факту 16.2 (завершение — 2026-11-09).** Компиляция: `typecheck` 0
ошибок, `vite build`; интеграция: `check:integration` INTEGRATION OK
(2bc/4bn/5ax) на свежем клоне, `check:dotfiles` OK, `i18n:check --strict`
чист (142 ключа утверждены), css-parity A/B/C = 0. Ревью: TODO и заглушек
в коде 16.2 нет; `proposal_created` / `proposal_decided` — заведённые
типы без записи (пишет 17.1, по протоколу). Долгов и ограничений не
оставлено — реестр §12 пуст. 08 Части I/II, врезка «Фаза 16», README,
NEXT-CONTEXT (16.3 — ближайшая). Один коммит.
"""
patch(
    D07,
    """  Доки — `patch-docs-conv162.py` (часть II).
\"\"\"""" if False else """  Доки — `patch-docs-conv162.py` (часть II).
""",
    """  Доки — `patch-docs-conv162.py` (часть II).
"""
    + FACT_162_END,
    "L 07 «По факту 16.2 (завершение)»",
    marker="**По факту 16.2 (завершение — 2026-11-09).**",
)
patch(
    D07,
    """> **16.1 закрыта 2026-11-09** (миграция 0017 `discussion`; сторож
> 2bb/4bm/5aw; новых долгов нет). Ближайшая — 16.2.""",
    """> **16.1 закрыта 2026-11-09** (миграция 0017 `discussion`; сторож
> 2bb/4bm/5aw; новых долгов нет). **16.2 закрыта 2026-11-09** (миграция
> 0018 `members_notifications`; сторож 2bc/4bn/5ax; новых долгов нет).
> Ближайшая — 16.3.""",
    "M 07 врезка «Фаза 16» — 16.2 закрыта",
)
patch(
    D07,
    """   При закрытии 16.1 (2026-11-09) новых долгов и ограничений нет, строк
   «не назначен» нет; реестр пуст.
""",
    """   При закрытии 16.1 (2026-11-09) новых долгов и ограничений нет, строк
   «не назначен» нет; реестр пуст.
   При закрытии 16.2 (2026-11-09) новых долгов и ограничений нет, строк
   «не назначен» нет; реестр пуст.
""",
    "N 07 §12 журнал — 16.2",
)
patch(
    D08,
    """Беседа 16.1 (адреса, участники и права, комментарии и рецензии — сервер
основы обсуждения; Фаза 16) ЗАКРЫТА 2026-11-09.""",
    """Беседа 16.2 (участники, приглашения, уведомления — бэкенд + клиент; Фаза
16) ЗАКРЫТА 2026-11-09. Миграция 0018 (`notifications`,
`notification_settings`; `auth_tokens` += довод `member_invite` на
приглашающего с адресом в `new_email`, `synthesis_id`, `member_role`);
приглашения по email с ролью (аккаунт — строка invited + письмо под языком
получателя; без аккаунта — ссылка на регистрацию, участие заводится
транзакцией register), принятие/отклонение, роль/отзыв/исключение (второй
шаг), «бывший участник» при чтении, правило 17.1 в 03; уведомления одной
точкой записи кодами без фразы (14.2), проход сверки адресов для
«устарело», сводка по почте на тике работника, колокольчик опросом;
клиент — вкладка «Участники», страница принятия, «Со мной поделились»,
полоса роли, настройки в профиле, `?invite=`. 142 ключа (утверждены),
сторож 2bc/4bn/5ax, smoke-162 49 ✓, test-162-ui 32 ✓, test-162 72 ✓ ×2;
регресс 16.1/15.x/13.2; прежние сторожа ослаблены альтернацией; доки —
patch-docs-conv162.py (три части); долгов нет; ближайшая — 16.3.
Беседа 16.1 (адреса, участники и права, комментарии и рецензии — сервер
основы обсуждения; Фаза 16) ЗАКРЫТА 2026-11-09.""",
    "O 08 Часть I — хроника 16.2",
)
CH_162 = """### Беседа 16.2 — Участники, приглашения, уведомления (бэкенд + клиент) [ЗАКРЫТА 2026-11-09]

**Вход:** HEAD b9f7758 (16.1 закрыта), `check:dotfiles` чист, `npm install`
в самом клоне, PG 16 и Redis в песочнице (миграции 0000–0017, сиды),
Chrome 131 из `chrome/`. Вторая беседа Фазы 16 по врезке и решениям
пользователя (только приглашённые участники; интерфейс прав — главное;
уведомления в приложении опросом + сводка по почте не чаще N часов;
категории отключаются в профиле). Требования: первый ход — сверка с кодом
и «По факту 16.1»; недостающее — строкой §12, но дыры доков под 16.2
можно закрывать; новые строки `tl()` с черновиками en/de; браузер — на
сборке клиента под Chrome 131; один протокольный запрос за раз.

**Ход.** П.0 — шесть расхождений: `auth_tokens.user_id NOT NULL` (довод
приглашения адресу без аккаунта — на приглашающего, адрес в `new_email`,
новые `synthesis_id`/`member_role`); `issueToken` гасит по пользователю
(своя выдача `issueMemberInviteToken` по синтезу+адресу); `mailLimiter`
локален (экспорт); `DiscussionAuthor` без «бывшего участника»
(`formerMember` при чтении); не каждая мутация двигает `updated_at`
(проход `scanOutdatedAddresses` с dedupe по хэшу); 02/03 без таблиц и
маршрутов (заведены). Сервер: `services/members.ts` (все управляющие
функции через `loadManaged` → `canManageSynthesis`), `routes/members.ts`
(11 маршрутов; `/shared` ДО `/:id`), `services/notifications.ts` (одна
точка записи `notify`: актор исключён, отключённые категории не пишутся;
список с курсором кортежем в PG; `notificationText` для сводки;
`runNotificationDigest` под языком получателя; `maybeRunNotificationPasses`
на тике работника почты), `routes/notifications.ts` (6), регистрация с
`inviteToken` и `GET /auth/invitations/:token`, письма 14.1
(`memberInviteLetter`, `memberInviteRegisterLetter`,
`notificationDigestLetter`), хуки в `discussion.ts`, удаление аккаунта
снимает уведомления явно, env `NOTIFY_DIGEST_INTERVAL_HOURS` /
`NOTIFY_SCAN_INTERVAL_MS` в дотфайлах и check-dotfiles; миграция
`0018_members_notifications` (drizzle-kit, тег переименован). Клиент:
вкладка «Документ | Участники» (`MembersPanel` — приглашение, 409 под
формой, `<select>` роли, повтор/отзыв, исключение со вторым шагом
`useSecondStep`, ждущие приглашения адресам без аккаунта),
`InvitationPage`, вкладка «Со мной поделились» (`badgeOf`), полоса роли
участника, `NotificationBell` (опрос 30 с, видимая вкладка, «Прочитать
всё»), `NotificationSettingsSection` в профиле, `?invite=` в RegisterPage,
`utils/notification-text.ts`; CSS-блок «Беседа 16.2» (8 групп, без
hex/скруглений/теней). Сторож 2bc/4bn/5ax (5ax живьём: приглашение →
письмо en → принятие → роль → комментарии → рецензия → проход устаревания
→ список/курсор/read → настройки → сводка → исключение → довод →
регистрация → отклонение → отзыв → CHECK → удаление). Прежние сторожа
4ap/4bk/4bm ослаблены альтернацией. Сверка после сжатия контекста (на
сервисе уведомлений): текст первого запроса по пунктам против кода —
расхождений нет. 142 ключа утверждены.

**Тесты.** smoke-162 49 ✓ (A исходники; B живьём по HTTP через
`app.request`); test-162-request1-ui 32 ✓ (сборка + Chrome 131);
test-162-requests2-4 72 ✓ ×2 (живой сервер с работником раз в секунду:
R2 приглашения — письмо de, регистрация по ссылке, отзыв/роль/исключение,
«бывший участник»; R3 все события не автору, `finding_outdated` проходом
работника после `PATCH /categories/:id`, счётчик/read-all, сводка под
языком получателя без отключённых категорий и без повтора в интервале;
R4 браузер). Регресс: test-161 61 ✓, test-153 51 ✓, smoke-153 34 ✓,
smoke-154 47 ✓, smoke-132 42 ✓, smoke-161 58 ✓ (A13 «журнал = 18» → «≥
18»). Уроки — 09 §3 (сторожа со счётом миграций), §4 (CHROME_PATH
песочницы, mailLimiter в смоуке, элемент фазы, сводка до выключения,
письма прежних прогонов), §6 (литерал в className).

**Завершение.** Регрессия на свежем клоне зелёная; TODO и заглушек нет;
новых долгов нет; доки — `patch-docs-conv162.py` (три части); один
коммит. Ближайшая — 16.3.

"""
patch(
    D08,
    """### Беседа 16.1 — Адреса, участники и права, комментарии и рецензии (сервер основы обсуждения) [ЗАКРЫТА 2026-11-09]""",
    CH_162 + """### Беседа 16.1 — Адреса, участники и права, комментарии и рецензии (сервер основы обсуждения) [ЗАКРЫТА 2026-11-09]""",
    "P 08 Часть II — глава 16.2",
    marker="### Беседа 16.2 — Участники, приглашения, уведомления (бэкенд + клиент) [ЗАКРЫТА 2026-11-09]",
)
patch(
    RDM,
    """сервер обсуждения — 18 маршрутов) — закрыта 11-09 |""",
    """сервер обсуждения — 18 маршрутов) — закрыта 11-09; 16.2 (миграция 0018: уведомления и настройки, довод приглашения; приглашения по email с ролью, вкладка «Участники», страница принятия, «Со мной поделились», колокольчик опросом, сводка по почте) — закрыта 11-09 |""",
    "Q README — строка Фазы 16: 16.2 закрыта",
)

print(f"\nитого: применено {applied}, пропущено {skipped}, провалов {failed}")
sys.exit(1 if failed else 0)
