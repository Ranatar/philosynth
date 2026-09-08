#!/usr/bin/env python3
"""Патч документации по итогам ЗАПРОСА 1 беседы 8.1 (администратор —
заведение, передача, след). Вносит факты, ставшие постоянными
(2026-09-08); блок «По факту 8.1» и хроника — при закрытии беседы
(тем же скриптом, дописыванием).
  A  02 — §2.29 admin_audit (по тексту запроса п.3) + ER-диаграмма;
     §2.1 примечание о LAST_ADMIN и снятии actor_id при анонимизации.
  B  03 — §1.1 строка A7 (роли); §2.1 GET /auth/users, POST
     /auth/users/:id/role, GET /auth/audit, DELETE /auth/me += 409 LAST_ADMIN;
     §4.3 коды LAST_ADMIN, SELF_ROLE_CHANGE.
  C  05 — shared/constants/auth.ts, shared/types/admin.ts,
     services/admin-audit.ts, scripts/bootstrap-admin.ts, миграция 0004,
     client/api/admin.ts, пометки 8.1 у routes/auth.ts и AdminPromptsPage.
  D  04 — §4 «Новое»: admin-audit.ts, bootstrap-admin.ts, api/admin.ts.
  E  01 — §6 роли: admin управляет также каталогами (7.1) и ролями (8.1).
  F–I (закрытие 2026-09-08) — 07 «По факту 8.1», §1.1/§10, контекст, §12;
     08 Часть I/II; 09 грабли; README.

Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patch-docs-conv81.py
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
applied = skipped = failed = 0


def patch(rel: str, old: str, new: str, label: str) -> None:
    global applied, skipped, failed
    path = ROOT / rel
    if not path.exists():
        failed += 1
        print(f"  fail  {label}: нет файла {rel}")
        return
    text = path.read_text(encoding="utf-8")
    if new in text:
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

# ── A. 02-data-model ──────────────────────────────────────────────────────

patch(
    P02,
    """  ├── api_keys (encrypted)
  ├── transactions
  └── api_usage
  """,
    """  ├── api_keys (encrypted)
  ├── transactions
  ├── api_usage
  └── admin_audit (actor_id → users, SET NULL; 8.1)
  """,
    "02 ER-диаграмма: admin_audit",
)

patch(
    P02,
    """> **7.1:** удаление аккаунта (`DELETE /auth/me`) НЕ удаляет строку — RESTRICT
> `api_usage`/`transactions.user_id` (§2.20–2.21) сохраняет финансовую
> историю; строка анонимизируется (email `deleted-<id>@deleted.invalid`,
> случайный password_hash, display_name/stripe_customer_id → NULL,
> role → 'user'); сессии, api_keys, syntheses удаляются, подписки → canceled.
""",
    """> **7.1:** удаление аккаунта (`DELETE /auth/me`) НЕ удаляет строку — RESTRICT
> `api_usage`/`transactions.user_id` (§2.20–2.21) сохраняет финансовую
> историю; строка анонимизируется (email `deleted-<id>@deleted.invalid`,
> случайный password_hash, display_name/stripe_customer_id → NULL,
> role → 'user'); сессии, api_keys, syntheses удаляются, подписки → canceled.
>
> **8.1:** роли по-прежнему две (решение при заведении Фазы 8, 07 §8).
> Первый `admin` заводится только скриптом `scripts/bootstrap-admin.ts`
> (`npm run seed:admin`), дальнейшие — `POST /auth/users/:id/role`.
> Единственный администратор не может ни понизить себя (409
> SELF_ROLE_CHANGE — свою роль не меняет никто), ни удалить аккаунт (409
> LAST_ADMIN); проверки идут под `pg_advisory_xact_lock` в одной транзакции
> с действием. Поскольку строка users при удалении анонимизируется, а не
> удаляется, `admin_audit.actor_id … ON DELETE SET NULL` (§2.29) сам не
> срабатывает — `account-deletion` обнуляет `actor_id` строк этого
> пользователя явно, той же транзакцией: след действий остаётся,
> привязка к личности снимается.
""",
    "02 §2.1: примечание 8.1",
)

patch(
    P02,
    """## 3. Извлечение гранулярных элементов из HTML
""",
    """### 2.29. admin_audit

Журнал административных действий (беседа 8.1, миграция `0004_admin_audit`).
Пишется только через `server/services/admin-audit.ts` (`writeAudit`) — в
ТОЙ ЖЕ транзакции, что и само действие: журнал, который может разойтись с
делом, хуже отсутствующего.

```sql
CREATE TABLE admin_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    -- SET NULL, а не CASCADE: след действий переживает актора.
    -- 7.1 анонимизирует users вместо удаления — account-deletion обнуляет
    -- actor_id явно (см. примечание 8.1 в §2.1)
  action      TEXT NOT NULL,
    -- ADMIN_ACTIONS (замороженная константа сервиса, не SQL-enum —
    -- пополнение без миграции): prompt.version.created,
    -- prompt.version.activated, config.version.created,
    -- config.version.activated, taxonomy.type.updated,
    -- taxonomy.type.deleted, user.role.changed, user.bootstrapped,
    -- account.deleted
  target_type TEXT NOT NULL,   -- 'prompt_template'|'synthesis_config'|'taxonomy_type'|'user'
  target_id   TEXT,            -- ключ шаблона/конфига, id типа, id пользователя
  details     JSONB NOT NULL DEFAULT '{}',
    -- { version, previousVersion } у активаций; { from, to, email } у смены
    -- роли; { kind, key, changed | unlinked } у каталогов; { source:
    -- 'bootstrap', outcome } у первого администратора; { deletedSyntheses,
    -- subscriptionCanceled, wasAdmin } у удаления аккаунта.
    -- jsonb не хранит порядок ключей — сверять через canonical() (09 §1)
  ip          TEXT,            -- X-Forwarded-For → X-Real-IP → адрес сокета
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_audit_actor   ON admin_audit(actor_id);
CREATE INDEX idx_admin_audit_created ON admin_audit(created_at);
```

Точки записи: `prompt-registry` (createVersion — актор = автор черновика;
activateVersion / createConfigVersion / activateConfigVersion — актор из
роута, у активации это активировавший, а не автор версии),
`element-taxonomy` (updateCustomType, deleteCustomType), смена роли
(`routes/auth.ts`), `account-deletion.ts`, `scripts/bootstrap-admin.ts`
(actor_id = самому себе). Чтение — `GET /auth/audit?limit=` (03 §2.1);
DTO `AdminAuditEntry` несёт дополнительно `actorEmail` (LEFT JOIN users по
actor_id, не колонка; null у снятого актора) — вкладка «Доступ» показывает
email вместо uuid.

## 3. Извлечение гранулярных элементов из HTML
""",
    "02 §2.29 admin_audit",
)

# ── B. 03-specification ───────────────────────────────────────────────────

patch(
    P03,
    """| A6 | OAuth (Google, GitHub) | Фаза 3 |
""",
    """| A6 | OAuth (Google, GitHub) | Фаза 3 |
| A7 | Роли: первый администратор скриптом, назначение/снятие роли администратором, журнал действий | Фаза 8 — СДЕЛАНО 8.1 (`seed:admin`, `POST /auth/users/:id/role`, `admin_audit`, вкладка «Доступ») |
""",
    "03 §1.1 A7",
)

patch(
    P03,
    """DELETE /auth/me                { password } → { ok: true, deletedSyntheses,
                                                subscriptionCanceled }
                                // Беседа 7.1. Подтверждение паролем: неверный →
                                // 401 AUTH_REQUIRED (единый ответ). Активная
                                // генерация → 409 GENERATION_IN_PROGRESS. Строка
""",
    """DELETE /auth/me                { password } → { ok: true, deletedSyntheses,
                                                subscriptionCanceled }
                                // Беседа 7.1. Подтверждение паролем: неверный →
                                // 401 AUTH_REQUIRED (единый ответ). Активная
                                // генерация → 409 GENERATION_IN_PROGRESS.
                                // 8.1: единственный администратор → 409
                                // LAST_ADMIN («сначала назначьте второго»);
                                // проверка ДО отмены подписки и повторно в
                                // транзакции удаления; пишется admin_audit
                                // account.deleted, затем actor_id всех строк
                                // пользователя → NULL (02 §2.1/§2.29). Строка
""",
    "03 §2.1 DELETE /auth/me += LAST_ADMIN",
)

patch(
    P03,
    """Формы ошибок auth (зафиксированы в 0.2, вне §4.3): неверные креды login →
401 AUTH_REQUIRED единым ответом (анти-enumeration); занятый email register →
409 VALIDATION_ERROR + details.email.
""",
    """// ── Управление доступом (беседа 8.1; requireAuth + requireAdmin) ─────────
// Роли — две ('user' | 'admin'); третья не заводится (07 §8, врезка Фазы 8).
// Первый администратор — ТОЛЬКО скриптом scripts/bootstrap-admin.ts
// (npm run seed:admin; пароль из BOOTSTRAP_ADMIN_PASSWORD, не доводом;
// заслон: другой администратор уже есть → отказ).

GET    /auth/users             ?query=&limit=20&offset=0
                                → { users: AdminUserRow[], total }
                                // AdminUserRow = { id, email, displayName, role,
                                // createdAt } — минимум для назначения роли.
                                // query — подстрока email/displayName (ILIKE);
                                // limit 1..100; анонимизированные строки
                                // deleted-*@deleted.invalid (7.1) не отдаются.

POST   /auth/users/:id/role    { role: 'user' | 'admin' }
                                → { user: { id, email, displayName, role,
                                            balanceUsd, createdAt }, changed }
                                // роль вне двух значений → 400 VALIDATION_ERROR
                                //   (details.role); :id не UUID / не найден →
                                //   404 NOT_FOUND; своя роль → 409
                                //   SELF_ROLE_CHANGE (иначе единственный
                                //   администратор понижает сам себя);
                                //   понижение последнего администратора → 409
                                //   LAST_ADMIN (при requireAdmin +
                                //   SELF_ROLE_CHANGE ветка защитная: актор —
                                //   другой админ); та же роль → 200,
                                //   changed:false, строки журнала нет.
                                // Успех: UPDATE + строка admin_audit
                                //   user.role.changed { from, to, email } одной
                                //   транзакцией под pg_advisory_xact_lock
                                //   (сериализация операций над множеством
                                //   администраторов — общая с DELETE /auth/me
                                //   и bootstrap-admin).

GET    /auth/audit             ?limit=50 → { entries: AdminAuditEntry[] }
                                // Последние строки admin_audit (02 §2.29),
                                // новые первыми; limit 1..500. Потребитель —
                                // вкладка «Доступ» AdminPromptsPage.

Формы ошибок auth (зафиксированы в 0.2, вне §4.3): неверные креды login →
401 AUTH_REQUIRED единым ответом (анти-enumeration); занятый email register →
409 VALIDATION_ERROR + details.email.
""",
    "03 §2.1 эндпоинты управления доступом",
)

patch(
    P03,
    """NO_PARTICIPANTS_SEED_REQUIRED — свободный синтез без seed (v11)
```
""",
    """NO_PARTICIPANTS_SEED_REQUIRED — свободный синтез без seed (v11)
LAST_ADMIN          — понижение или удаление аккаунта последнего администратора —
                      409 (8.1; подсказка «сначала назначьте второго»)
SELF_ROLE_CHANGE    — POST /auth/users/:id/role на самого себя — 409 (8.1)
```
""",
    "03 §4.3 LAST_ADMIN, SELF_ROLE_CHANGE",
)

# ── C. 05-file-structure ──────────────────────────────────────────────────

patch(
    P05,
    """│       │   └── characteristics.ts      # Характеристики категорий (8) и связей (6) с
│       │                               # диапазонами, resolveCharacteristic (алиасы
│       │                               # depth/camelCase), validateCharacteristicValue
│       │                               # (5.3; нужны серверу и слайдерам 5.4)
│       │
""",
    """│       │   ├── characteristics.ts      # Характеристики категорий (8) и связей (6) с
│       │   │                           # диапазонами, resolveCharacteristic (алиасы
│       │   │                           # depth/camelCase), validateCharacteristicValue
│       │   │                           # (5.3; нужны серверу и слайдерам 5.4)
│       │   └── auth.ts                 # 8.1: PASSWORD_MIN_LENGTH, EMAIL_RE,
│       │                               # DISPLAY_NAME_MAX_LENGTH — единый свод правил
│       │                               # аккаунта (routes/auth, bootstrap-admin, RegisterPage)
│       │
""",
    "05 shared/constants/auth.ts",
)

patch(
    P05,
    """│       │   ├── prompts.ts              # PromptTemplate, SynthesisConfig
│       │   └── ws-messages.ts          # Все типы WebSocket-сообщений (клиент↔сервер)
""",
    """│       │   ├── prompts.ts              # PromptTemplate, SynthesisConfig
│       │   ├── admin.ts                # 8.1: AdminAction, AdminAuditEntry, AdminUserRow, UserRole
│       │   └── ws-messages.ts          # Все типы WebSocket-сообщений (клиент↔сервер)
""",
    "05 shared/types/admin.ts",
)

patch(
    P05,
    """│   │   ├── auth.ts                     # POST /auth/register, /login, /logout, GET /me
""",
    """│   │   ├── auth.ts                     # POST /auth/register, /login, /logout, GET /me
│   │   │                               # 8.1: + GET /auth/users, POST /auth/users/:id/role,
│   │   │                               #  GET /auth/audit (requireAdmin)
""",
    "05 routes/auth.ts 8.1",
)

patch(
    P05,
    """│   │   ├── account-deletion.ts        # 7.1: DELETE /auth/me — анонимизация users при сохранённой
│   │   │                               # RESTRICT-истории, удаление сессий/ключей/синтезов, отмена подписки
""",
    """│   │   ├── account-deletion.ts        # 7.1: DELETE /auth/me — анонимизация users при сохранённой
│   │   │                               # RESTRICT-истории, удаление сессий/ключей/синтезов, отмена подписки
│   │   │                               # 8.1: заслон LAST_ADMIN, строка account.deleted, actor_id → NULL
│   │   ├── admin-audit.ts             # 8.1: writeAudit(exec, …) — db или tx вызывающего, ADMIN_ACTIONS
│   │   │                               # (замороженный список), listAudit, ADMIN_SET_LOCK_KEY
""",
    "05 services/admin-audit.ts",
)

patch(
    P05,
    """│   │       ├── 0000_initial.sql
│   │       └── meta/
""",
    """│   │       ├── 0000_initial.sql
│   │       ├── …                       # 0001 (5.x), 0002 (6.1), 0003 (7.1)
│   │       ├── 0004_admin_audit.sql    # 8.1: таблица admin_audit (тег переименован из генерата)
│   │       └── meta/
""",
    "05 миграция 0004",
)

patch(
    P05,
    """│   ├── seed-taxonomy.ts                # Заполнение каталогов типов (18 категорий + 29 связей)
""",
    """│   ├── seed-taxonomy.ts                # Заполнение каталогов типов (18 категорий + 29 связей)
│   ├── bootstrap-admin.ts              # 8.1: первый администратор (npm run seed:admin) — пароль из
│   │                                   # BOOTSTRAP_ADMIN_PASSWORD, created/updated/skip/fail, заслон
│   │                                   # «другой админ уже есть», строка user.bootstrapped
""",
    "05 scripts/bootstrap-admin.ts",
)

patch(
    P05,
    """│   │   │   ├── billing.ts              # 7 функций §2.10: ключ, пополнение, истории (6.2 СДЕЛАНО 2026-09-07)
""",
    """│   │   │   ├── billing.ts              # 7 функций §2.10: ключ, пополнение, истории (6.2 СДЕЛАНО 2026-09-07)
│   │   │   ├── admin.ts                # 8.1: listUsers / setUserRole / getAuditLog (вкладка «Доступ»)
""",
    "05 client/api/admin.ts",
)

patch(
    P05,
    """под RequireAdmin; 7.1: + вкладка «Каталоги» (типы категорий/связей, правка и удаление пользовательских)
""",
    """под RequireAdmin; 7.1: + вкладка «Каталоги» (типы категорий/связей, правка и удаление пользовательских); 8.1: + вкладка «Доступ» (поиск пользователей, роль с подтверждением, последние 50 строк admin_audit)
""",
    "05 AdminPromptsPage 8.1",
)

# ── D. 04-code-reuse-map ──────────────────────────────────────────────────

patch(
    P04,
    """| `scripts/seed-taxonomy.ts` | Начальное заполнение каталогов (18 типов категорий + 29 типов связей) |
""",
    """| `scripts/seed-taxonomy.ts` | Начальное заполнение каталогов (18 типов категорий + 29 типов связей) |
| `server/services/admin-audit.ts` | НОВОЕ (8.1): журнал admin_audit — `writeAudit(exec, …)` пишет транзакцией вызывающего, `ADMIN_ACTIONS` заморожен (9 действий), `listAudit`, `clientIpOf`, `ADMIN_SET_LOCK_KEY` (advisory-lock операций над множеством администраторов); точки записи — prompt-registry (4 функции получили actorId), element-taxonomy (update/delete в транзакциях), смена роли в routes/auth, account-deletion (+ заслон LAST_ADMIN), bootstrap-admin |
| `scripts/bootstrap-admin.ts`, `packages/shared/constants/auth.ts` | НОВОЕ (8.1): первый администратор из командной строки (env BOOTSTRAP_ADMIN_*; created/updated/skip/fail; заслон «другой админ уже есть»); единый свод правил пароля/email/имени вместо локальных констант routes/auth.ts |
| `client/api/admin.ts`, вкладка «Доступ» в `AdminPromptsPage.tsx` | НОВОЕ (8.1): GET /auth/users, POST /auth/users/:id/role, GET /auth/audit; поиск, переключение роли с confirm, журнал 50 строк; `packages/shared/types/admin.ts` — DTO |
""",
    "04 §4 admin-audit / bootstrap-admin / api/admin",
)

# ── E. 01-architecture ────────────────────────────────────────────────────

patch(
    P01,
    """- Роли: `user` (обычный), `admin` (управление Prompt Registry)
""",
    """- Роли: `user` (обычный), `admin` (управление Prompt Registry; с 7.1 — и каталогами типов, с 8.1 — и ролями пользователей). Третьей роли нет (07 §8, врезка Фазы 8). Первый администратор заводится скриптом `scripts/bootstrap-admin.ts`; каждое админ-действие оставляет строку `admin_audit` (02 §2.29) той же транзакцией
""",
    "01 §6 роли 8.1",
)


# ══ Закрытие беседы 8.1 (2026-09-08) ═══════════════════════════════════════
# F 07 — «По факту 8.1» после текста беседы; правки §1.1/§10 (число доков),
#   контекст 8.1 (server/scripts → scripts); §12 — запись «8.1 долгов не
#   оставила». G 08 — Часть I строка, Часть II глава. H 09 — грабли 8.1.
# I README — статус 8.1.

P07 = "docs/07-conversation-protocol.md"
P08 = "docs/08-history.md"
P09 = "docs/09-lessons.md"
README = "README.md"

patch(
    P07,
    """- `05-file-structure.md` (`server/scripts/`, `server/services/`, `client/pages/`)
""",
    """- `05-file-structure.md` (`scripts/` — корневые скрипты, `server/scripts/` в проекте нет (уточнено 8.1), `server/services/`, `client/pages/`)
""",
    "07 контекст 8.1: scripts/ вместо server/scripts/",
)

patch(
    P07,
    """Проектные документы — да, все 6 (они компактные и дают общий контекст). Исходный файл — только релевантные фрагменты.""",
    """Проектные документы — да: 01–05 целиком, 07 частями (§1, §9–12, текст беседы и блоки «По факту» опорных бесед), 09 целиком, 08 — только нужные главы, 06 — не грузится (уточнено 8.1: прежнее «все 6» относилось к комплекту до появления 08/09). Исходный файл — только релевантные фрагменты.""",
    "07 §1.1: состав комплекта",
)

patch(
    P07,
    """- [ ] Загрузил все 7 проектных документов 01–07 (комплект
      самодостаточен; история 08 — только нужные главы)
""",
    """- [ ] Загрузил проектные документы: 01–05 целиком, 07 частями (§1,
      §9–12, текст беседы, «По факту» опорных бесед), 09 целиком; история
      08 — только нужные главы; 06 — не грузится (уточнено 8.1)
""",
    "07 §10: состав комплекта",
)

patch(
    P07,
    """- «Протестируй вкладку „Доступ“ в браузере: поиск → переключение роли → подтверждение → список обновлён → журнал показывает новую строку. Кликать через `$eval(sel, el => el.click())` (React перерисовывает список между `$` и кликом); тексты кнопок сравнивать регистронезависимо (капитель); проверку статуса ставить ПОСЛЕ перечитывания списка, иначе тест увидит новый статус при старом списке»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 8.2""",
    """- «Протестируй вкладку „Доступ“ в браузере: поиск → переключение роли → подтверждение → список обновлён → журнал показывает новую строку. Кликать через `$eval(sel, el => el.click())` (React перерисовывает список между `$` и кликом); тексты кнопок сравнивать регистронезависимо (капитель); проверку статуса ставить ПОСЛЕ перечитывания списка, иначе тест увидит новый статус при старом списке»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 8.1 (2026-09-08) — отступления от буквы запроса и найденное:**

1. **Тест «удаляет аккаунт → actor_id = NULL» против 7.1.** 7.1 строку
   users АНОНИМИЗИРУЕТ, а не удаляет — FK `admin_audit.actor_id ON DELETE
   SET NULL` (п.3 запроса) сам не сработает никогда, и обоснование п.3
   («анонимизация не должна стирать след») внутренне противоречиво:
   анонимизация ничего не стирает. Принято: `account-deletion` обнуляет
   `actor_id` строк удаляющегося той же транзакцией — воспроизводится
   эффект SET NULL при логическом удалении; след (action/target/details)
   остаётся, привязка к личности снимается (02 §2.1/§2.29). Строка
   `account.deleted` пишется до обнуления, поэтому у неё тоже actor NULL, а
   личность видна по `target_id` и `details.wasAdmin`.
2. **`LAST_ADMIN` в `POST /auth/users/:id/role` недостижим:** `requireAdmin`
   + `SELF_ROLE_CHANGE` гарантируют, что актор — ДРУГОЙ администратор, и при
   понижении цели администраторов ≥ 2. Ветка оставлена защитной (сессия
   актора могла быть понижена между запросами). Достижимый `LAST_ADMIN` —
   только у `DELETE /auth/me`; тест R6 это и проверяет (SELF у единственного,
   LAST_ADMIN у удаления).
3. **Advisory-lock.** Смена роли, удаление аккаунта и bootstrap берут
   `pg_advisory_xact_lock(ADMIN_SET_LOCK_KEY = 810001)` — иначе две
   параллельные транзакции насчитают по два администратора и понизят/удалят
   обоих. У удаления заслон стоит ДВАЖДЫ: до отмены подписки в Stripe (чтобы
   отказ не оставлял побочного эффекта) и авторитетно под lock.
4. **`GET /auth/audit`** задан в запросе только клиентским п.9 — контракт
   (limit 1..500, новые первыми) доопределён в 03 §2.1; DTO += `actorEmail`
   (LEFT JOIN users в `listAudit`, не колонка; typeOnly в audit.mts) — вкладка
   показывает email вместо uuid, когда актор не попал в отфильтрованный
   список пользователей.
5. **Единый свод правил** (п.1) вынесен шире буквы: не только
   `PASSWORD_MIN_LENGTH`, но и `EMAIL_RE`, `DISPLAY_NAME_MAX_LENGTH` —
   bootstrap принимает те же три поля, что регистрация; RegisterPage
   подписывает поле из константы.
6. **Та же роль → 200 `changed:false` без строки журнала**; список `GET
   /auth/users` не отдаёт анонимизированные `deleted-*@deleted.invalid`
   (назначать им нечего). Пустой PATCH типа каталога строки не пишет —
   действия не было.
7. **Актор активации ≠ автор версии** — `activateVersion`/
   `activateConfigVersion` получили `actorId`; `createVersion` журналит
   `createdBy` (у `synthesis_configs` колонки `created_by` нет — 7.1 —
   поэтому у конфигов актор только в журнале). details активаций несут
   `previousVersion`.
8. **`server/scripts/` в контексте беседы** не существует — скрипты живут в
   корневом `scripts/` (сам запрос писал верно); §1.1/§10 07 считали доков
   «6»/«7» при девяти и отправляли в 06 — исправлено этим патчем.
9. **`PageStub.tsx`** числился удалённым в 6.2 и повторно в 7.1, но лежал в
   HEAD a8bbf09 (загрузка «Add files via upload» удаление не переносит) —
   `check:integration` 4ah падал на чистом клоне. Удалён; регресс 4ai под
   новый `deleteAccount(user.id, { ip })`.
10. **Стенд 8.1** — живой сервер на ОТДЕЛЬНОЙ пустой БД `philosynth_t81`
    (пересоздаётся, миграции `drizzle-kit migrate`): «пустая база» R2
    буквальна, посевы не нужны, моки Claude/Stripe не подняты (Stripe у
    DELETE fail-open при пустом ключе). 107 ✓ ×3 за ~20 с.

---

### Беседа 8.2""",
    "07 «По факту 8.1»",
)

patch(
    P07,
    """Долги, снятые как «не долг»: `POST /auth/password-reset/*` — вне MVP,
помечено в 03 §2.1; `POST /syntheses/estimate` и `/advice` — реализованы
беседой 1.5, зафиксировано записью ревизии.
""",
    """Долги, снятые как «не долг»: `POST /auth/password-reset/*` — вне MVP,
помечено в 03 §2.1; `POST /syntheses/estimate` и `/advice` — реализованы
беседой 1.5, зафиксировано записью ревизии.

Беседа 8.1 (2026-09-08) долгов не оставила: реестр пуст. Известные
ограничения без адресата (не долги): `LAST_ADMIN` в `POST /auth/users/:id/role`
недостижим при `requireAdmin` (ветка защитная); третья роль (платная
поддержка с доступом к чужим `api_usage`/`transactions`) заводится, когда у
неё появится обязанность (врезка Фазы 8).
""",
    "07 §12: 8.1 без долгов",
)

# ── G. 08-history ─────────────────────────────────────────────────────────

patch(
    P08,
    """браузером; check:integration += 2y/4ai/5y); доки пропатчены
scripts/patch-docs-conv71.py. Реестр долгов §12 пуст.
""",
    """браузером; check:integration += 2y/4ai/5y); доки пропатчены
scripts/patch-docs-conv71.py. Реестр долгов §12 пуст.
Беседа 8.1 (администратор — заведение, передача, след) ЗАКРЫТА 2026-09-08:
shared/constants/auth (единый свод правил аккаунта), миграция 0004
admin_audit + services/admin-audit (writeAudit транзакцией вызывающего,
ADMIN_ACTIONS ×9, advisory-lock), журнал в prompt-registry/element-taxonomy/
смене роли/account-deletion, GET /auth/users + POST /auth/users/:id/role +
GET /auth/audit, LAST_ADMIN у DELETE /auth/me, scripts/bootstrap-admin
(seed:admin), client/api/admin + вкладка «Доступ» (смоук 87 ✓,
tests/test-81-requests2-10.mjs 107 ✓ ×3 против живого сервера на отдельной
пустой БД + браузер; check:integration += 2z/4aj/5z; PageStub.tsx, лежавший в
HEAD вопреки 6.2/7.1, удалён); доки пропатчены scripts/patch-docs-conv81.py.
Реестр долгов §12 пуст.
""",
    "08 Часть I: 8.1",
)

patch(
    P08,
    """### Правка каталога философов (2026-09-07, после 7.1)
""",
    """### Беседа 8.1 — Администратор: заведение, передача, след (бэкенд + клиент) [ЗАКРЫТА 2026-09-08]

> Запрос 1 целиком + смоук tests/smoke-81-request1.mjs (87 ✓, без сервера/
> БД/браузера: единый свод правил, миграция 0004 и журнал, ADMIN_ACTIONS ≡
> union, точки записи внутри транзакций, роуты доступа, клиент, bootstrap,
> доки) + все тестовые запросы R2–R10 одним заходом
> tests/test-81-requests2-10.mjs (107 ✓ ×3 за ~20 с: живой сервер :3000 на
> ОТДЕЛЬНОЙ пустой БД philosynth_t81 (пересоздаётся, миграции drizzle-kit),
> PG16/Redis, vite :5199, puppeteer-core 23 + Chrome; моки Claude/Stripe не
> нужны) + завершение: typecheck (все конфиги) 0, audit ✓ (+ пара adminAudit
> с typeOnly actorEmail), check:integration += 2z/4aj/5z → INTEGRATION OK,
> check-map-04 0 расхождений, css-parity 0/586, vite build чисто; доки —
> scripts/patch-docs-conv81.py (запрос 1 — 17 правок, закрытие — ещё 12;
> повтор skip). Исходник не нужен: всё — новый код. Полный текст решений —
> «По факту 8.1» в 07.

#### Что создано / изменено

- `packages/shared/constants/auth.ts` — `PASSWORD_MIN_LENGTH`, `EMAIL_RE`,
  `DISPLAY_NAME_MAX_LENGTH`, `PASSWORD_TOO_SHORT_MESSAGE`; `routes/auth.ts`
  и `RegisterPage.tsx` переведены на них.
- `server/db/migrations/0004_admin_audit.sql` (+ снапшот, журнал; тег
  переименован из генерата) и `schema.adminAudit` (actor_id SET NULL,
  индексы actor_id/created_at); `packages/shared/types/admin.ts`
  (`AdminAction`, `AdminAuditEntry` += `actorEmail`, `AdminUserRow`,
  `UserRole`).
- `server/services/admin-audit.ts` — `writeAudit(exec, …)` (db или tx
  вызывающего), `ADMIN_ACTIONS` (frozen, 9), `listAudit` (LEFT JOIN users),
  `clientIpOf`, `ADMIN_SET_LOCK_KEY`.
- Точки записи: `prompt-registry` (createVersion/activateVersion/
  createConfigVersion/activateConfigVersion — `actorId`, журнал внутри tx,
  `previousVersion` у активаций; роуты передают `user.id`);
  `element-taxonomy` (`updateCustomType`/`deleteCustomType` — транзакции,
  `changed {from,to}` / `unlinked`); смена роли; `account-deletion`.
- `routes/auth.ts` += `GET /users` (ILIKE email/displayName, limit/offset,
  total, без анонимизированных), `POST /users/:id/role` (400/404/409
  SELF_ROLE_CHANGE/409 LAST_ADMIN, advisory-lock + FOR UPDATE, `changed`),
  `GET /audit`; `DELETE /me` маппит LAST_ADMIN → 409 и передаёт ip.
- `services/account-deletion.ts` — заслон LAST_ADMIN дважды (до Stripe и
  в tx под lock), строка `account.deleted`, `actor_id → NULL` у строк
  пользователя.
- `scripts/bootstrap-admin.ts` + `seed:admin` — пароль из env,
  created/updated/skip/fail, заслон «другой админ уже есть», журнал
  `user.bootstrapped`; `readBootstrapEnv`/`bootstrapAdmin` экспортированы.
- Клиент: `api/client.ts` += коды, `api/admin.ts` (3), вкладка «Доступ» в
  `AdminPromptsPage` (поиск с дебаунсом, роль с confirm, своя строка без
  кнопки, журнал 50 строк, статус после списка И журнала).
- `server/audit.mts` += пара adminAudit; `integration-check.mts` +=
  2z/4aj/5z, 4ai под новый вызов deleteAccount; `client/src/pages/PageStub.tsx`
  удалён фактически.

#### Решения/адаптации (все — в шапках модулей и «По факту 8.1» в 07)

1. actor_id обнуляется руками при анонимизации (эффект SET NULL).
2. LAST_ADMIN у смены роли — защитная ветка; достижим у DELETE /auth/me.
3. Advisory-lock на операциях над множеством администраторов.
4. actorEmail в DTO журнала; GET /auth/audit доопределён.
5. Та же роль → changed:false без строки; пустой PATCH типа без строки.
6. Стенд на отдельной пустой БД.

#### Открытые TODO после 8.1

- Реестр §12 пуст. Ограничения без адресата — в §12 (запись 8.1).

#### Помодульно: что прикладывать в следующие беседы

- **8.2 (тарифы)**: `server/services/subscription-service.ts`,
  `stripe-client.ts`, `scripts/seed-taxonomy.ts` и `scripts/bootstrap-admin.ts`
  (образцы идемпотентных скриптов с created/updated/skip/fail и заслоном),
  `services/admin-audit.ts` (если посев тарифов админом — писать журнал той же
  транзакцией; ADMIN_ACTIONS расширяется без миграции), `client/pages/
  BillingPage.tsx` + `api/subscription.ts`.
- **8.3 (стенд)**: `tests/test-81-requests2-10.mjs` — образец стенда на
  отдельной пустой БД с drizzle-kit migrate (в дополнение к test-71 с
  моками); `tests/test-71-requests2-8.mjs` — моки Claude/Stripe.

---

### Правка каталога философов (2026-09-07, после 7.1)
""",
    "08 Часть II: глава 8.1",
)

# ── H. 09-lessons ─────────────────────────────────────────────────────────

patch(
    P09,
    """10. Мок Claude для паузы auth: 401 JSON по конкретному x-api-key —
    streaming-manager классифицирует `resp.status === 401` как 'auth';
    модалка снапшота из БД открывается по бейджу `.progress-pause-badge`.

## 3. PostgreSQL, Drizzle, данные
""",
    """10. Мок Claude для паузы auth: 401 JSON по конкретному x-api-key —
    streaming-manager классифицирует `resp.status === 401` как 'auth';
    модалка снапшота из БД открывается по бейджу `.progress-pause-badge`.

### Беседа 8.1

1. **Правка `new` у уже применённой правки patch-скрипта ломает
   идемпотентность**: проверка «new уже в тексте» перестаёт срабатывать,
   `old` всё ещё на месте — блок вставляется ВТОРОЙ раз (§2.29 02 задвоился).
   Правило: применённую правку не редактировать; дополнение — отдельной
   `patch()` со своим `old` внутри уже вставленного текста; если всё же
   меняешь — `git checkout` доков и перенакат с нуля.
2. Загрузка репозитория «Add files via upload» удаление файлов не переносит:
   `PageStub.tsx`, удалённый 6.2/7.1, лежал в HEAD и валил
   `check:integration` 4ah на чистом клоне. Удаления проверять `git ls-files`
   после выкладки.

## 3. PostgreSQL, Drizzle, данные
""",
    "09 §2: грабли 8.1",
)

patch(
    P09,
    """  И тег в `meta/_journal.json`; сгенерированный SQL для смены FK-действия —
  пара DROP/ADD CONSTRAINT.

## 4. Тесты, харнессы, браузер
""",
    """  И тег в `meta/_journal.json`; сгенерированный SQL для смены FK-действия —
  пара DROP/ADD CONSTRAINT.

### Беседа 8.1
- `ON DELETE SET NULL` не срабатывает при ЛОГИЧЕСКОМ удалении: 7.1
  анонимизирует users, строка остаётся — FK admin_audit.actor_id молчит.
  Хочешь эффект SET NULL — обнуляй руками в той же транзакции.
- Проверки «единственный ли администратор» — под `pg_advisory_xact_lock`
  (общий ключ на смену роли/удаление/bootstrap): две параллельные транзакции
  видят по два администратора и понижают обоих.
- `drizzle-kit generate` работает без живой БД (по снапшотам) — тег
  переименовывать сразу, снапшот предыдущей миграции не дрейфует.

## 4. Тесты, харнессы, браузер
""",
    "09 §3: грабли 8.1",
)

patch(
    P09,
    """### Беседа 7.1
- Точный гейт делает старые стенды дороже: мета-синтез шести разделов
  > $1 — тестовым пользователям баланс с запасом ($50 в R6).
""",
    """### Беседа 7.1
- Точный гейт делает старые стенды дороже: мета-синтез шести разделов
  > $1 — тестовым пользователям баланс с запасом ($50 в R6).

### Беседа 8.1
- Стенд на ОТДЕЛЬНОЙ пустой БД (`DROP/CREATE DATABASE` + `CREATE EXTENSION
  pg_trgm` + `drizzle-kit migrate` с `DATABASE_URL` окружения) делает «пустую
  базу» буквальной и снимает зависимость от посевов и уборки следов; сервер
  без посевов стартует (warmCache fail-open).
- Скрипт с собственным db-синглтоном (bootstrap-admin) гонять дочерним
  процессом с `DATABASE_URL` стенда, не импортом — иначе он пишет в БД
  теста.
- Статус UI, выставляемый ПОСЛЕ нескольких перечитываний (список И журнал),
  читать `waitForFunction`, а не сразу после обновления первого списка —
  иначе флак 1/2 (R10).
- `setsid nohup … &` + `sleep` в одном вызове инструмента работает для
  прогонов до ~2 мин; полный `check:integration` ≈ 100 с — тем же приёмом.
""",
    "09 §4: грабли 8.1",
)

# ── I. README ─────────────────────────────────────────────────────────────

patch(
    README,
    """| 8 — пусковая пригодность | 8.1–8.3 | открыта 2026-09-08 |
""",
    """| 8 — пусковая пригодность | 8.1–8.3 | открыта 2026-09-08; 8.1 закрыта 2026-09-08 |
""",
    "README: статус 8.1",
)

print(f"\napplied={applied} skip={skipped} fail={failed}")
if failed:
    raise SystemExit(1)
