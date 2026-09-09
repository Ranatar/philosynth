#!/usr/bin/env python3
"""Патч документации по итогам ЗАПРОСА 1 беседы 8.3 (тарифы — посев и
заведение Prices в Stripe). Вносит факты, ставшие постоянными
(2026-09-09); блок «По факту 8.3», хроника 08 и перезапись NEXT-CONTEXT —
при закрытии беседы, ОТДЕЛЬНЫМИ patch() (правило 8.1: применённую правку
не редактировать).
  A  02 §2.22 — откуда берутся строки subscription_plans (plans.ts,
     seed-plans, STRIPE_PRICE_*, неактивность без переменной, заслон Price
     при живых подписках); §2.29 — действие plan.seeded, цель
     subscription_plan.
  B  03 §2.10 — GET /billing/plans при пустой таблице / неактивных планах:
     { plans: [] }, не ошибка; POST /subscribe на неактивный план → 404.
  C  04 §4 — строка «Новое»: plans.ts, seed-plans.ts, stripe-create-prices.ts.
  D  05 — дерево: server/config/plans.ts, scripts/seed-plans.ts,
     scripts/stripe-create-prices.ts, STRIPE_PRICE_* в .env.example /
     .env.local.example, stripe-client += Products/Prices.
  E  README — «Быстрый старт» += seed:plans; раздел «Как поднять биллинг»
     из четырёх шагов; исправлен абзац под таблицей фаз (8.2/8.3 стояли в
     порядке ДО перестановки phase8-order).

Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patch-docs-conv83.py
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


P02 = "docs/02-data-model.md"
P03 = "docs/03-specification.md"
P04 = "docs/04-code-reuse-map.md"
P05 = "docs/05-file-structure.md"
README = "README.md"

# ── A. 02-data-model ─────────────────────────────────────────────────────

patch(
    P02,
    """### 2.22. subscription_plans

Тарифные планы.
""",
    """### 2.22. subscription_plans

Тарифные планы.

> **8.3 (2026-09-09) — откуда берутся строки.** Таблица сеется ТОЛЬКО
> `scripts/seed-plans.ts` (`npm run seed:plans`) из описания
> `server/config/plans.ts` — три тарифа (`starter`, `pro`, `academic`:
> displayName, цена, период, четыре квоты) БЕЗ `stripe_price_id`. Price
> существует лишь в аккаунте Stripe владельца: его заводит
> `scripts/stripe-create-prices.ts` (`npm run stripe:create-prices`,
> идемпотентно по `lookup_key = philosynth_<name>`) и печатает строки
> `STRIPE_PRICE_<NAME_UPPER>=price_…` для `.env`; посев читает их из
> окружения. Переменной нет → строка заводится/остаётся с
> `is_active=false` (сохранённый `stripe_price_id` не затирается — колонка
> NOT NULL, при первом посеве пишется пустая строка) и громким
> предупреждением; в `GET /billing/plans` такой план не попадает.
> Идемпотентность по `name` (UNIQUE): created / updated / skip / fail.
> Заслон: смена `stripe_price_id` у плана с подписками в статусе ≠
> `canceled` (включая `incomplete`) → fail, строка не тронута — Price
> живой подписки в Stripe сменить нельзя, а FK `user_subscriptions.plan_id`
> держит план. Квоты сверяются с ценой: `Σ quota × себестоимость операции
> (ставки cost-estimator 1.1, верхняя модель) × BILLING_MARKUP ≤ price_usd`,
> иначе fail — убыточный тариф не заводится. Каждая created/updated пишет
> `admin_audit` `plan.seeded` (actor_id NULL, §2.29).
""",
    "02 §2.22: источник строк subscription_plans",
)

patch(
    P02,
    """    -- taxonomy.type.deleted, user.role.changed, user.bootstrapped,
    -- account.deleted
  target_type TEXT NOT NULL,   -- 'prompt_template'|'synthesis_config'|'taxonomy_type'|'user'""",
    """    -- taxonomy.type.deleted, user.role.changed, user.bootstrapped,
    -- account.deleted, plan.seeded (8.3: посев тарифов, actor_id NULL)
  target_type TEXT NOT NULL,   -- 'prompt_template'|'synthesis_config'|'taxonomy_type'|'user'
                               -- |'subscription_plan' (8.3; target_id = name плана)""",
    "02 §2.29: plan.seeded / subscription_plan",
)

# ── B. 03-specification ──────────────────────────────────────────────────

patch(
    P03,
    """GET    /billing/plans            → { plans: SubscriptionPlan[] }
""",
    """GET    /billing/plans            → { plans: SubscriptionPlan[] }
                                // Только is_active = true, по возрастанию
                                // цены. Пустая таблица или все планы
                                // неактивны (посев без STRIPE_PRICE_*, 8.3)
                                // → 200 { plans: [] }, НЕ ошибка: UI
                                // показывает «тарифов нет». Строки — только
                                // из npm run seed:plans (02 §2.22).
                                // POST /subscribe на неактивный/неизвестный
                                // planId → 404 NOT_FOUND (6.1).
""",
    "03 §2.10: GET /billing/plans при пустой таблице",
)

# ── C. 04-code-reuse-map ─────────────────────────────────────────────────

patch(
    P04,
    """| `scripts/bootstrap-admin.ts`, `packages/shared/constants/auth.ts` | НОВОЕ (8.1): первый администратор из командной строки (env BOOTSTRAP_ADMIN_*; created/updated/skip/fail; заслон «другой админ уже есть»); единый свод правил пароля/email/имени вместо локальных констант routes/auth.ts |
""",
    """| `scripts/bootstrap-admin.ts`, `packages/shared/constants/auth.ts` | НОВОЕ (8.1): первый администратор из командной строки (env BOOTSTRAP_ADMIN_*; created/updated/skip/fail; заслон «другой админ уже есть»); единый свод правил пароля/email/имени вместо локальных констант routes/auth.ts |
| `server/config/plans.ts`, `scripts/seed-plans.ts`, `scripts/stripe-create-prices.ts` | НОВОЕ (8.3): описание тарифов без stripe_price_id + опорные стоимости операций из констант cost-estimator и заслон экономики `assertPlanEconomics` (цена ≥ Σ квот × себестоимость × BILLING_MARKUP); четвёртый сид (STRIPE_PRICE_* из env, без переменной — is_active=false с предупреждением, заслон смены Price при живых подписках, строка admin_audit plan.seeded); заведение Product/Price ключом владельца, идемпотентно по lookup_key `philosynth_<name>`, печатает STRIPE_PRICE_*; `stripe-client.ts` += createProduct/listProducts/createPrice/updatePrice/listPrices |
""",
    "04 §4: строка 8.3",
)

# ── D. 05-file-structure ─────────────────────────────────────────────────

patch(
    P05,
    """├── .env.local.example              # 8.2: окружение ЛОКАЛЬНОГО СТЕНДА биллинга
│                                   # (мок Stripe, фиктивные ключи, BILLING_ENFORCE=true,
│                                   # пустой VITE_STRIPE_PUBLISHABLE_KEY); копируется в
│                                   # .env.local скриптом tools/dev-billing.sh
""",
    """├── .env.local.example              # 8.2: окружение ЛОКАЛЬНОГО СТЕНДА биллинга
│                                   # (мок Stripe, фиктивные ключи, BILLING_ENFORCE=true,
│                                   # пустой VITE_STRIPE_PUBLISHABLE_KEY); копируется в
│                                   # .env.local скриптом tools/dev-billing.sh.
│                                   # 8.3: + STRIPE_PRICE_*=price_mock_* — мок не проверяет
│                                   # Price, планы сеются активными (файл воссоздан 8.3:
│                                   # в HEAD 83aaf2b его не было — upload не перенёс dotfile)
""",
    "05: .env.local.example — STRIPE_PRICE_*",
)

patch(
    P05,
    """├── .env.example                    # ВСЕ переменные server/env.ts;
│                                   # пароль БД обязан совпадать с дефолтом
│                                   # env.ts — .env читает только drizzle-kit,
│                                   # tsx-скрипты берут process.env
""",
    """├── .env.example                    # ВСЕ переменные server/env.ts;
│                                   # пароль БД обязан совпадать с дефолтом
│                                   # env.ts — .env читает только drizzle-kit,
│                                   # tsx-скрипты берут process.env.
│                                   # 8.3: + STRIPE_PRICE_STARTER/PRO/ACADEMIC (читает
│                                   # seed-plans напрямую из process.env, не env.ts)
""",
    "05: .env.example — STRIPE_PRICE_*",
)

patch(
    P05,
    """│   │   ├── stripe-client.ts            # Тонкий fetch-клиент Stripe REST + проверка подписи
│   │   │                               # webhook; STRIPE_API_BASE для мока (НОВОЕ 6.1, без SDK)
""",
    """│   │   ├── stripe-client.ts            # Тонкий fetch-клиент Stripe REST + проверка подписи
│   │   │                               # webhook; STRIPE_API_BASE для мока (НОВОЕ 6.1, без SDK)
│   │   │                               # 8.3: + Products/Prices (createProduct, listProducts,
│   │   │                               # createPrice, updatePrice, listPrices) для заведения тарифов
""",
    "05: stripe-client.ts — Products/Prices",
)

patch(
    P05,
    """│   │   ├── mode-deps.ts               # MODE_DEPS (v11)
""",
    """│   │   ├── mode-deps.ts               # MODE_DEPS (v11)
│   │   ├── plans.ts                   # 8.3: тарифы БЕЗ stripe_price_id (PLANS: starter/pro/
│   │   │                              # academic), priceEnvVarFor, stripeLookupKeyFor,
│   │   │                              # опорные стоимости операций из констант cost-estimator,
│   │   │                              # assertPlanEconomics (цена ≥ Σ квот × cost × наценка)
""",
    "05: server/config/plans.ts",
)

patch(
    P05,
    """│   ├── bootstrap-admin.ts              # 8.1: первый администратор (npm run seed:admin) — пароль из
│   │                                   # BOOTSTRAP_ADMIN_PASSWORD, created/updated/skip/fail, заслон
│   │                                   # «другой админ уже есть», строка user.bootstrapped
""",
    """│   ├── bootstrap-admin.ts              # 8.1: первый администратор (npm run seed:admin) — пароль из
│   │                                   # BOOTSTRAP_ADMIN_PASSWORD, created/updated/skip/fail, заслон
│   │                                   # «другой админ уже есть», строка user.bootstrapped
│   ├── seed-plans.ts                   # 8.3: четвёртый сид — subscription_plans из config/plans.ts
│   │                                   # (npm run seed:plans); stripe_price_id из STRIPE_PRICE_*,
│   │                                   # без переменной — is_active=false + громкое предупреждение;
│   │                                   # заслон смены Price при живых подписках; admin_audit plan.seeded
│   ├── stripe-create-prices.ts         # 8.3: Product+Price в Stripe по каждому тарифу ключом
│   │                                   # владельца (npm run stripe:create-prices [-- --transfer]);
│   │                                   # идемпотентно по lookup_key philosynth_<name>; печатает
│   │                                   # STRIPE_PRICE_*; пустой ключ → отказ до первого запроса
""",
    "05: scripts/seed-plans.ts, stripe-create-prices.ts",
)

# ── E. README ────────────────────────────────────────────────────────────

patch(
    README,
    """npm run seed:taxonomy         # каталоги типов: 18 категорий + 29 связей
""",
    """npm run seed:taxonomy         # каталоги типов: 18 категорий + 29 связей
npm run seed:plans            # тарифы (3 плана; активны только с STRIPE_PRICE_* — см. «Как поднять биллинг»)
""",
    "README: быстрый старт += seed:plans",
)

patch(
    README,
    """## Регрессионные проверки
""",
    """## Как поднять биллинг

Подписки требуют аккаунта Stripe владельца службы; описание тарифов живёт
в `server/config/plans.ts`, а их Price ID — только в Stripe. Четыре шага:

1. **Ключи Stripe.** В `.env` — `STRIPE_SECRET_KEY` (секретный ключ из
   Dashboard → Developers → API keys) и `STRIPE_WEBHOOK_SECRET` (подпись
   endpoint'а `POST /api/v1/billing/webhook`, события `invoice.paid`,
   `customer.subscription.updated`, `customer.subscription.deleted`); в
   клиент — `VITE_STRIPE_PUBLISHABLE_KEY` (без него BillingPage в dev-режиме).
2. **Prices.** `npm run stripe:create-prices` заводит Product и Price по
   каждому тарифу (идемпотентно: повтор находит цену по `lookup_key
   philosynth_<name>` и не создаёт второй) и печатает готовые строки.
   Пустой ключ → отказ до первого запроса. Изменили цену в `plans.ts` —
   `npm run stripe:create-prices -- --transfer` (Price в Stripe неизменяем:
   новая цена, ключ переезжает, прежняя деактивируется).
3. **`STRIPE_PRICE_*` в `.env`** — строки из шага 2
   (`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ACADEMIC`).
4. **`npm run seed:plans`** — планы попадают в `subscription_plans`
   активными; без переменной план заводится `is_active=false` с громким
   предупреждением и в `GET /billing/plans` не попадает. Повторный прогон —
   skip; правка квот/цены — updated; смена Price у плана с живыми
   подписками — fail (строка не тронута).

Без аккаунта Stripe биллинг проверяется на локальном стенде:
`bash tools/dev-billing.sh` (мок Stripe, `.env.local` с фиктивными
`STRIPE_PRICE_*`, подписку активирует `node tools/stripe-emit.mjs
invoice.paid <sub_…>`).

## Регрессионные проверки
""",
    "README: раздел «Как поднять биллинг»",
)

patch(
    README,
    """8.2 — посев тарифов и заведение Prices в Stripe (`subscription_plans`
не сеялась ничем); 8.3 — локальный стенд биллинга без аккаунта Stripe.
Тексты бесед — 07 §8, узлы — §11.""",
    """8.2 — локальный стенд биллинга без аккаунта Stripe (оснастка); 8.3 —
посев тарифов и заведение Prices в Stripe (`subscription_plans` не
сеялась ничем); 8.4 — управление своим содержимым; 8.5 — родословная
при импорте. Тексты бесед — 07 §8, узлы — §11.""",
    "README: порядок 8.2/8.3 под таблицей фаз",
)

# ── F. По итогам тестовых запросов 2–8 (отдельные patch(), правило 8.1) ──

patch(
    P05,
    """│   └── dev-billing.sh                  # стенд: .env.local → мок → сервер :3000 → vite :5199;
│                                       # заслон sk_live_, --stop / --status, created/skip/fail
""",
    """│   └── dev-billing.sh                  # стенд: .env.local → мок → сервер :3000 → vite :5199;
│                                       # заслон sk_live_, --stop / --status, created/skip/fail;
│                                       # 8.3: зовёт npm run seed:plans (STRIPE_PRICE_* из .env.local),
│                                       # повтор → skip по отчёту посева (created=0, updated=0)
""",
    "05: dev-billing.sh сеет тарифы идемпотентно",
)

patch(
    P05,
    """    │                                   # test-61/62/71 берут мок Stripe из tools/stripe-mock.mjs (8.2)
""",
    """    │                                   # test-61/62/71 берут мок Stripe из tools/stripe-mock.mjs (8.2);
    │                                   # test-82/83 — против настоящего стенда dev-billing.sh; с 8.3
    │                                   # план в test-82 — из посева (starter), в test-62 — starter62
    │                                   # (не сносить посеянный starter)
""",
    "05: tests — test-83, планы test-62/82",
)

# ── G. Завершение беседы 8.3 (2026-09-09): 07 «По факту 8.3» + §12, 08, 09, README ──

P07 = "docs/07-conversation-protocol.md"
P08 = "docs/08-history.md"
P09 = "docs/09-lessons.md"

patch(
    P07,
    """- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

---

### Беседа 8.4: Управление своим содержимым — каталог, капсула, связь (клиент)
""",
    """- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 8.3 (2026-09-09) — отступления от буквы запроса и найденное:**

1. **`.env.local.example` и строка `.dev-billing/` в `.gitignore` — в HEAD
   83aaf2b отсутствовали и никогда не коммитились**: загрузка «Add files via
   upload» не переносит dotfile и не меняет уже лежащий `.gitignore`.
   На них завязаны `tools/dev-billing.sh` (`die` без образца) и секция 4ak
   `check:integration` — на чистом клоне 8.2 та падала бы двумя строками.
   Оба воссозданы 8.3; правило — 09 §2 (беседа 8.3).
2. **Экономика тарифа — верхняя модель, не измерение.** Опорные стоимости
   выводятся из констант `cost-estimator` (глубина `standard`, sum + разделы
   формы по умолчанию + capsule, каждый проход после первого — весь бюджет
   `CONTEXT_BUDGET.standard`): синтез ≈ $1.90, перегенерация ≈ $0.25, режим
   ≈ $0.07, обогащение ≈ $0.035. Правило заведения: `price ≥ Σ quota × cost
   × BILLING_MARKUP` — подписка не дешевле тех же операций по счётчику.
   Квоты подобраны с запасом 8–11 % при 1.2 (проходят и при 1.3); при
   `BILLING_MARKUP=3` все три тарифа законно падают — наценка читается при
   посеве, это требуемый отказ, не дефект.
3. **Без `STRIPE_PRICE_*` сохранённый `stripe_price_id` не затирается**
   (колонка NOT NULL; при первом посеве — пустая строка), меняется только
   `is_active=false`. «Действующая подписка» для заслона смены Price —
   статус ≠ `canceled`, включая `incomplete` (ждёт оплаты по прежнему
   Price). Посев пишет `admin_audit` `plan.seeded` (actor NULL) той же
   транзакцией на created/updated; skip и fail строк не дают.
4. **`validatePlanDefinition` ловил 79.99** как «не две цифры»
   (`79.99 × 100 = 7998.999…`) — допуск 1e-6; поймал смоук на первом же
   прогоне, до посева.
5. **Стенд 8.2 сеял тарифы не идемпотентно**: `step_seeds` рапортовал
   `ok "тарифы посеяны"` на каждом старте, и test-82 R3 («повторный
   dev-billing.sh — одни skip») упал 50/1, как только `seed:plans` появился.
   Теперь скрипт читает отчёт посева (`created=0, updated=0` → skip).
   Оснастка 8.2 правится здесь, потому что именно 8.3 сделала её вызов
   живым.
6. **test-62 и test-82 переведены на посев.** test-62 пересоздавал план
   `starter` (удаляя вместе с подписками) под `price_starter_62` — снёс бы
   посеянный; переименован в `starter62`. test-82 R5 вместо ручного insert
   `t82plan` подписывается на посеянный `starter` (как обещал текст 8.3).
   Прогоны: test-62 101 ✓, test-82 51 ✓ (+1 проверка плана).
7. **Правка цены «в plans.ts» в тесте — подмена описания** через параметр
   `seedPlans({ plans })`, не правка файла: результат тот же (`updated`
   только у одного, `changed=[priceUsd]`), а дерево остаётся чистым.
8. **Тестовые запросы выполнены одним харнессом**
   `tests/test-83-requests2-8.mjs` (88 ✓ ×3, ~2 мин) против НАСТОЯЩЕГО
   `dev-billing.sh` с браузером: сиды — дочерними `tsx` с явным окружением
   (`STRIPE_PRICE_*` читаются при запуске, не через env.ts), R8 — полный
   цикл подписки в браузере (несёт перенесённую из 8.2 проверку). Две
   грабли харнесса — 09 §4 (беседа 8.3).
9. **`stripe-client` += `updatePrice`** сверх трёх заявленных: `--transfer`
   деактивирует прежнюю цену после переезда `lookup_key` (Price в Stripe
   неизменяем — новая цена вместо старой).
10. **Реестр §12 пуст.** Известное ограничение без адресата: тарифы
   заводятся только с `name ∈ PLAN_NAMES` — новый тариф = правка
   `plans.ts` + `stripe:create-prices` + `seed:plans`, админского UI
   тарифов нет и не запрашивался.

---

---

### Беседа 8.4: Управление своим содержимым — каталог, капсула, связь (клиент)
""",
    "07: блок «По факту 8.3»",
)

patch(
    P07,
    """Беседа 8.1 (2026-09-08) долгов не оставила: реестр пуст. Известные
ограничения без адресата (не долги): `LAST_ADMIN` в `POST /auth/users/:id/role`
недостижим при `requireAdmin` (ветка защитная); третья роль (платная
поддержка с доступом к чужим `api_usage`/`transactions`) заводится, когда у
неё появится обязанность (врезка Фазы 8).
""",
    """Беседа 8.1 (2026-09-08) долгов не оставила: реестр пуст. Известные
ограничения без адресата (не долги): `LAST_ADMIN` в `POST /auth/users/:id/role`
недостижим при `requireAdmin` (ветка защитная); третья роль (платная
поддержка с доступом к чужим `api_usage`/`transactions`) заводится, когда у
неё появится обязанность (врезка Фазы 8).

Беседа 8.3 (2026-09-09) долгов не оставила: реестр пуст. Ограничение без
адресата: тарифы описываются только кодом (`server/config/plans.ts`,
`name ∈ PLAN_NAMES`), админского UI тарифов нет («По факту 8.3» п.10).
""",
    "07 §12: 8.3 без долгов",
)

patch(
    P07,
    """> **Состав фазы (порядок уточнён 2026-09-08).** 8.1 администратор
> (проведена) · 8.2 локальный стенд биллинга · 8.3 тарифы и Prices ·
> 8.4 управление своим содержимым · 8.5 родословная при импорте.""",
    """> **Состав фазы (порядок уточнён 2026-09-08).** 8.1 администратор
> (проведена) · 8.2 локальный стенд биллинга (проведена) · 8.3 тарифы и
> Prices (проведена 2026-09-09) · 8.4 управление своим содержимым · 8.5
> родословная при импорте.""",
    "07 врезка Фазы 8: 8.2/8.3 проведены",
)

patch(
    P08,
    """check:integration += 4ak; продуктовый код не тронут); доки пропатчены
scripts/patch-docs-conv82.py. Реестр долгов §12 пуст.
""",
    """check:integration += 4ak; продуктовый код не тронут); доки пропатчены
scripts/patch-docs-conv82.py. Реестр долгов §12 пуст.
Беседа 8.3 (тарифы — посев и заведение Prices в Stripe) ЗАКРЫТА 2026-09-09:
server/config/plans.ts (три тарифа без stripe_price_id, опорные стоимости из
констант cost-estimator, assertPlanEconomics: цена ≥ Σ квот × себестоимость ×
BILLING_MARKUP), scripts/seed-plans.ts (четвёртый сид; STRIPE_PRICE_* из env,
без переменной — is_active=false + громкое предупреждение, заслон смены Price
при подписках ≠ canceled, admin_audit plan.seeded), scripts/stripe-create-prices.ts
(Product+Price ключом владельца, идемпотентно по lookup_key philosynth_<name>,
--transfer, печатает STRIPE_PRICE_*, отказ до запроса при пустом ключе),
stripe-client += Products/Prices, npm seed:plans / stripe:create-prices,
.env.example += STRIPE_PRICE_*, .env.local.example воссоздан (+ price_mock_*),
.gitignore += .dev-billing/, dev-billing.sh сеет идемпотентно, termux →
seed:plans, README «Как поднять биллинг»; test-62 → starter62, test-82 — план
из посева (смоук 81 ✓, tests/test-83-requests2-8.mjs 88 ✓ ×3 против стенда с
браузером; test-82 51 ✓, test-62 101 ✓; check:integration += 2aa/4al/5aa);
доки пропатчены scripts/patch-docs-conv83.py. Реестр долгов §12 пуст.
""",
    "08 Часть I: строка 8.3",
)

patch(
    P08,
    """---

### Правка каталога философов (2026-09-07, после 7.1)
""",
    """---

### Беседа 8.3 — Тарифы: посев и заведение Prices в Stripe (бэкенд + скрипты) [ЗАКРЫТА 2026-09-09]

> Запрос 1 целиком (server/config/plans.ts + scripts/seed-plans.ts +
> scripts/stripe-create-prices.ts + stripe-client Products/Prices + обвязка
> + доки) → патч philosynth-conv83-request1.patch; все тестовые запросы
> R2–R8 одним харнессом tests/test-83-requests2-8.mjs (88 ✓ ×3 за ~2 мин
> против НАСТОЯЩЕГО dev-billing.sh: сиды дочерними tsx с явным окружением,
> браузер puppeteer-core 23 + Chrome) → патч philosynth-conv83-request1-8.patch;
> завершение: typecheck (все конфиги) 0, audit ✓, check:integration OK
> (+ 2aa/4al/5aa). Продуктовый код: только stripe-client (+5 методов) и
> ADMIN_ACTIONS (+plan.seeded); subscription-service и BillingPage не
> тронуты — секция «Подписка» ожила сама, как и обещала 6.2.

**Сделано:**

- `server/config/plans.ts` — `PLANS` (starter $9.99 3/5/5/10, pro $29.99
  9/15/15/25, academic $79.99 24/35/35/80; месяц) БЕЗ `stripePriceId`;
  `priceEnvVarFor` (`STRIPE_PRICE_<NAME>`), `stripeLookupKeyFor`
  (`philosynth_<name>`); `REFERENCE_OPERATION_COST_USD` из констант
  оценщика (верхняя модель `standard`): синтез ≈ $1.90, перегенерация ≈
  $0.25, режим ≈ $0.07, обогащение ≈ $0.035; `computePlanEconomics` /
  `assertPlanEconomics` — `price ≥ Σ quota × cost × markup` (запас 8–11 %
  при 1.2; при 3 — отказ); `validatePlanDefinition` (допуск 1e-6 на цене).
- `scripts/seed-plans.ts` (`npm run seed:plans`; `seedPlans()` экспортирован)
  — created/updated/skip/fail по `name`; `stripe_price_id` только из
  `process.env` в момент запуска; без переменной — `is_active=false`, price
  не затирается, жёлтое предупреждение с именами переменных и подсказкой
  `stripe:create-prices`; заслон: смена Price у плана с подписками ≠
  `canceled` → fail, строка не тронута; экономика — до записи; каждая
  created/updated — `admin_audit` `plan.seeded` (actor NULL) в tx.
- `scripts/stripe-create-prices.ts` (`npm run stripe:create-prices
  [-- --transfer]`; `createPrices()` экспортирован) — Product
  (`metadata.philosynth_plan`) + Price (`lookup_key`) на тариф; повтор —
  skip по `GET /v1/prices?lookup_keys[]`; расхождение цены → fail с
  подсказкой `--transfer` (новая цена, ключ переезжает, прежняя
  `active=false`); печатает `STRIPE_PRICE_*=price_…`; пустой ключ → отказ
  до первого запроса; БД не нужна.
- `stripe-client.ts` += `StripeProduct/StripePrice/StripeList`, `withQuery`,
  `createProduct/listProducts/createPrice/updatePrice/listPrices`.
- `ADMIN_ACTIONS.PLAN_SEEDED` + `AdminAuditTargetType` `subscription_plan`.
- Обвязка: `.env.example` += три пустые `STRIPE_PRICE_*`;
  `.env.local.example` ВОССОЗДАН (в HEAD не было) с `price_mock_*`;
  `.gitignore` += `.dev-billing/` (тоже не было); `philosynth-termux.sh`
  зовёт `seed:plans`; `tools/dev-billing.sh` — skip посева по отчёту.
- Тесты: `tests/smoke-83-request1.mjs` (81 ✓, мок поднимается смоуком);
  `tests/test-83-requests2-8.mjs` (88 ✓ ×3); test-62 → `starter62`;
  test-82 → план из посева (51 ✓); test-62 101 ✓.
- Доки: 02 §2.22 (источник строк, заслон, экономика) и §2.29
  (`plan.seeded`); 03 §2.10 (`GET /billing/plans` пустой → `[]`); 04 §4
  строка 8.3; 05 (plans.ts, seed-plans, stripe-create-prices, env,
  stripe-client, dev-billing, tests); README (быстрый старт, раздел «Как
  поднять биллинг» из четырёх шагов, порядок 8.2/8.3 под таблицей); 07
  «По факту 8.3» + §12 + врезка; 08; 09 §2/§3/§4/§9 — всё
  `scripts/patch-docs-conv83.py` (идемпотентен).
- `server/integration-check.mts` — 2aa/4al (экспорты, контракты plans /
  seed / create-prices / обвязки, дрейф-контроль DEFAULT_SECTIONS формы ⊆
  опорного состава, тесты не сносят starter) + 5aa живьём (seedPlans на
  текущем состоянии без fail → повтор skip ×3, журнал = created+updated,
  строки ≡ plans.ts, is_active ⇔ STRIPE_PRICE_*, убыточная квота → fail
  без записи, getPlans ≡ активным строкам).

**Найдено по ходу (детали — «По факту 8.3» в 07 и 09 §2/§3/§4/§9):**
dotfile и `.gitignore`, потерянные загрузкой; float-сравнение цены;
неидемпотентный посев стенда 8.2; связь test-62 с посеянным `starter`;
статус-сообщение раньше `reload()`; `/__mock/health` считается запросом.

**Для следующих бесед:**
- **8.4 / 8.5** — тарифов не касаются; из 8.3 им ничего не нужно.
- **Владелец службы**: README «Как поднять биллинг» — ключи →
  `stripe:create-prices` → `STRIPE_PRICE_*` → `seed:plans`. Новый тариф —
  правка `plans.ts` (заслон экономики) + те же два скрипта.
- **Все стендовые беседы**: `dev-billing.sh` сеет тарифы сам
  (`price_mock_*`), тесты на общей БД планы `starter/pro/academic` не
  удаляют и не пересоздают — свои планы под уникальными `name`.

---

### Правка каталога философов (2026-09-07, после 7.1)
""",
    "08 Часть II: глава 8.3",
)

patch(
    P09,
    """### Беседа 8.1

1. **Правка `new` у уже применённой правки patch-скрипта ломает""",
    """### Беседа 8.3

- **Загрузка «Add files via upload» теряет dotfile и не правит лежащий
  `.gitignore`.** `.env.local.example` и строка `.dev-billing/` из 8.2 в
  HEAD не попали, хотя доки, `dev-billing.sh` и секция 4ak `check:integration`
  на них завязаны — на чистом клоне 8.2 проверка падала бы. После выкладки
  сверять `git ls-files -- '.*'` с 05 и запускать `check:integration` на
  свежем клоне, а не в песочнице, где файл лежит.

### Беседа 8.1

1. **Правка `new` у уже применённой правки patch-скрипта ломает""",
    "09 §2: dotfile/gitignore при загрузке",
)

patch(
    P09,
    """### Беседа 8.1
- `ON DELETE SET NULL` не срабатывает при ЛОГИЧЕСКОМ удалении: 7.1""",
    """### Беседа 8.3

- **Цена в долларах против NUMERIC(10,2) — сравнивать с допуском.**
  `Math.round(79.99 × 100) !== 79.99 × 100` (7998.999…): проверка «две
  цифры после точки» отвергала валидный тариф. Для денег в float —
  `Math.abs(round(x·100) − x·100) < 1e-6`, а в БД — `priceUsd.toFixed(2)`.
- **Идемпотентный сид с внешним ключом-из-окружения.** Обязательное поле,
  которого нет в коде (`stripe_price_id`), берётся из `process.env` в
  момент запуска (не через `env.ts` — тот читается один раз при импорте);
  отсутствие переменной — не ошибка и не пустая колонка, а `is_active=false`
  с громким предупреждением; сохранённое значение не затирается.
  Заслон на смену внешнего id — по живым зависимым строкам (подписки
  ≠ `canceled`), не по самому факту расхождения.

### Беседа 8.1
- `ON DELETE SET NULL` не срабатывает при ЛОГИЧЕСКОМ удалении: 7.1""",
    "09 §3: float цены, сид с ключом из env",
)

patch(
    P09,
    """### Беседа 8.1
- Стенд на ОТДЕЛЬНОЙ пустой БД (`DROP/CREATE DATABASE` + `CREATE EXTENSION""",
    """### Беседа 8.3

- **Статус-сообщение появляется ДО `reload()`.** После `POST /subscribe`
  BillingPage сначала пишет «…ожидает оплаты первого инвойса», затем
  перечитывает подписку: ожидание текста по всей секции зеленело до того,
  как появлялся `sub-status`. Ждать нужно целевой `data-testid`, не фразу.
- **`/__mock/health` мока Stripe сам считается запросом**: проверка «ни
  одного запроса от скрипта» — по дельте `requests` с поправкой на
  собственный опрос (+1), иначе ложный ✗.
- **Дочерние сиды в харнессе — с явным окружением**: `STRIPE_PRICE_*` и
  `BILLING_MARKUP` читаются при запуске скрипта, поэтому «без переменных»
  значит удалить их из копии `process.env`, а не полагаться на
  `.env.local` стенда (тот экспортирован `set -a` в сам стенд).
- **Правку конфига в коде тесту лучше подменять параметром** (`seedPlans({
  plans })`), а не редактировать файл в дереве: результат тот же, дерево
  чистое.

### Беседа 8.1
- Стенд на ОТДЕЛЬНОЙ пустой БД (`DROP/CREATE DATABASE` + `CREATE EXTENSION""",
    "09 §4: харнесс 8.3",
)

patch(
    P09,
    """   перед КАЖДЫМ прогоном `pg_ctlcluster 16 main start` (снимает stale pid) +
   `redis-server --daemonize yes --save ''`.
""",
    """   перед КАЖДЫМ прогоном `pg_ctlcluster 16 main start` (снимает stale pid) +
   `redis-server --daemonize yes --save ''`.
10. **Шаги стенда, зовущие идемпотентные сиды, обязаны читать их отчёт**
   (8.3): `step_seeds` рапортовал `ok "тарифы посеяны"` на каждом старте,
   и «повторный dev-billing.sh — одни skip» (test-82 R3) стал недостижим,
   как только `seed:plans` появился. Skip — по `created=0, updated=0` из
   вывода посева. С 8.3 стенд сеет `starter/pro/academic` активными с
   `price_mock_*` (мок Price не проверяет); тесты на общей БД эти планы не
   удаляют и не пересоздают (test-62 — `starter62`), test-82 подписывается
   на посеянный `starter`.
""",
    "09 §9 п.10: идемпотентный посев стенда",
)

patch(
    README,
    """| 8 — пусковая пригодность | 8.1–8.5 | открыта 2026-09-08; 8.1, 8.2 закрыты 2026-09-08 |""",
    """| 8 — пусковая пригодность | 8.1–8.5 | открыта 2026-09-08; 8.1, 8.2 закрыты 2026-09-08; 8.3 закрыта 2026-09-09 |""",
    "README: таблица фаз — 8.3 закрыта",
)

patch(
    P08,
    """Шапка `docs/07-conversation-protocol.md` дословно: датированные врезки
по итогам бесед, от свежих к старым.

""",
    """Шапка `docs/07-conversation-protocol.md` дословно: датированные врезки
по итогам бесед, от свежих к старым.

> **Правки 2026-09-09 (итоги беседы 8.3)**: тарифы — посев и заведение
> Prices в Stripe закрыты (запрос 1 + смоук tests/smoke-83-request1.mjs
> 81 ✓ + все тестовые запросы tests/test-83-requests2-8.mjs 88 ✓ ×3 против
> НАСТОЯЩЕГО стенда dev-billing.sh с браузером; check:integration +=
> 2aa/4al/5aa). 02 §2.22 — источник строк subscription_plans (plans.ts →
> seed-plans, STRIPE_PRICE_* из env, неактивность без переменной, заслон
> Price при подписках ≠ canceled, экономика цена ≥ Σ квот × себестоимость ×
> наценка), §2.29 += plan.seeded/subscription_plan; 03 §2.10 — GET
> /billing/plans при пустой таблице → []; 04 §4 строка 8.3; 05 — plans.ts,
> seed-plans.ts, stripe-create-prices.ts, STRIPE_PRICE_* в env-образцах,
> dev-billing идемпотентный посев, test-83; README — «Как поднять биллинг»,
> порядок 8.2/8.3 под таблицей исправлен; 09 §2 (dotfile при загрузке),
> §3 (float цены, сид с ключом из env), §4 (харнесс), §9 п.10. Дыры
> выкладки закрыты: .env.local.example и .dev-billing/ в .gitignore
> воссозданы. Глава «По факту 8.3».
>
""",
    "08 Часть III: правки 8.3",
)

print(f"\nИтог: applied={applied}, skip={skipped}, fail={failed}")
raise SystemExit(1 if failed else 0)
