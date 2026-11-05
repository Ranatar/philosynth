#!/usr/bin/env python3
"""Патч документации по беседе 15.4 (тарифы — админка редакциями и согласие
подписки с тарифом; Д-74, Д-75; бэкенд + клиент).
ЧАСТЬ I — ПЕРВЫЙ ЗАПРОС (2026-11-05):
  A  07 — блок «По факту 15.4 (первый запрос)» после текста беседы: п.0
     сверка (мок уже знал Product/Price целиком; BillingPage/LandingPage
     уже показывали только открытые; экономика жила в plans.ts и
     требовала name ∈ PLAN_NAMES; у StripeSubscription не было items;
     stripe-emit не умел --price), решения (family/edition, имя редакции
     `<family>-v<N>`, Product один на семейство, Price редакции 1 семейства
     не выключается новой редакцией, порядок Stripe → транзакция →
     выключение, новый код PLAN_HAS_SUBSCRIPTIONS 409), пп.1–6, сторож
     2ba/4bl/5av, смоук.
  B  02 §2.22 — врезка 15.4 (источник истины — БД, редакции, сид без
     перезаписи), колонки family/edition в SQL; §2.23 — plan_id по вебхуку;
     §2.29 — ADMIN_ACTIONS += plan.created/updated/edition.
  C  03 §2.10 — четыре маршрута /billing/admin/plans, GET /plans — только
     открытые редакции, вебхук переносит plan_id; §4.3 — PLAN_HAS_SUBSCRIPTIONS;
     §1.11 — строка B6 += редакции.
  D  01 §6 — абзац «Тарифы (15.4)».
  E  04 §4 — строка 15.4.
  F  05 — plan-economics.ts, plan-stripe.ts, plan-admin.ts, миграция 0016,
     seed-plans/stripe-create-prices/stripe-client/stripe-emit, api/admin.ts,
     AdminPromptsPage (вкладка «Тарифы»), smoke-154, patches (последний — conv154).
  G  07 §12 — Д-74/Д-75: состояние «код первого запроса 15.4 — ждёт
     тестовых запросов».
  H  NEXT-CONTEXT — первый запрос 15.4 исполнен; серия 2ba/4bl/5av и
     миграция 0016 заняты.
  I  09 — уроки 15.4: «/admin/*» в кавычках ломает strip() сторожей; квота
     «+1» у starter убыточна — расхождение сида проверять квотой «−1».
ЧАСТЬ II (J–N, 2026-11-05) — тестовые запросы 2–4 одним заходом
  (test-154-requests2-4: R2 Д-74 на моке живьём, R3 Д-75 сид CLI + stripe-emit,
  R4 браузер Chrome 131 на сборке) и сверка доков после сжатия контекста:
  07 «По факту 15.4 (тестовые запросы 2–4)»; CSS 15.4 += запертое поле,
  бейдж/цена без переноса, кнопки столбиком (по снимку R4); 05 — тест;
  09 — уроки харнесса; переводы утверждены (черновиков 0); NEXT-CONTEXT —
  устаревшие строки «Универсальный минимум» (32 таблицы / миграции /
  серии сторожей) приведены к 15.4.
ЧАСТЬ III (O–U, 2026-11-05) — завершение беседы: 07 «По факту 15.4
  (завершение)»; §12 строки Д-74/Д-75 → 08 Часть IV, реестр пуст; журнал
  §12; врезка «Фаза 15» — 15.4 закрыта, Фаза 15 закрыта; 08 Части I/II;
  README (строка фазы — закрыта, реестр пуст); 09 §2 (урок патча);
  NEXT-CONTEXT перезаписан (состояние; запланированных бесед нет).
Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ; блок «По факту» — по
marker). Запуск из корня:
    python3 scripts/patches/patch-docs-conv154.py
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


D01 = "docs/01-architecture.md"
D02 = "docs/02-data-model.md"
D03 = "docs/03-specification.md"
D04 = "docs/04-code-reuse-map.md"
D05 = "docs/05-file-structure.md"
D07 = "docs/07-conversation-protocol.md"
D09 = "docs/09-lessons.md"
NXT = "NEXT-CONTEXT.md"

print("ЧАСТЬ I — первый запрос 15.4")

# ── A. 07 «По факту 15.4 (первый запрос)» ──────────────────────────────
FACT_154_R1 = """
**По факту 15.4 (первый запрос — 2026-11-05).** Исполнено целиком
(пп. 0–6), одним заходом; тестовые запросы 2–4 и завершение — следующими
запросами.

0. Сверка текста с кодом (до правок). `plans.ts` читали: сид (`seedPlans`),
   `stripe-create-prices` (PLANS, lookup_key, Product), сторожа 4al/5aa,
   test-83; строку плана — `subscription-service` (`getPlans` только
   `is_active`; `createSubscription` требует активный план; `checkQuota`/
   `consumeQuota` читают квоты вживую), `toPlanDto`, `BillingPage`/
   `LandingPage` через `GET /billing/plans` — **уже показывали только
   открытые**, п.5 «сверить» выполнен без правки. Расхождения: экономика
   (`assertPlanEconomics`, опорные стоимости) жила в `plans.ts` и
   импортировала `cost-estimator`; `validatePlanDefinition` требовала
   `name ∈ PLAN_NAMES` — для редакций непригодна; мок Stripe уже нёс все
   маршруты Product/Price (8.2/8.3/14.1: `POST /v1/products/:id`, `GET
   /v1/prices/:id`, `POST /v1/prices/:id` active, lookup_keys,
   transfer_lookup_key) — **в мок ничего не добавлено**; у
   `StripeSubscription` типа не было `items`; `stripe-emit` не умел класть
   Price в событие; `countLiveSubscriptions` сида был приватным;
   `dev-billing.sh`/test-83/deploy ждали строку отчёта `created=0, updated=0,`.
1. Миграция `0016_plan_editions` (рукой, тег в журнале, снимок генератом):
   `family text` → backfill `= name` → NOT NULL; `edition integer DEFAULT 1
   NOT NULL`; `UNIQUE (family, edition)`. `name` остался уникальным
   идентификатором редакции: редакция 1 носит имя семейства (`starter`),
   следующие — `<family>-v<N>` (`starter-v2`). Экономика и структурная
   проверка — в общем `config/plan-economics.ts` (`PlanSpec`,
   `validatePlanSpec` → `{field, text}[]`, `assertPlanEconomics`,
   `PlanEconomicsError` с `planName`/`markup`, `PLAN_QUOTA_FIELDS`,
   `PLAN_NAME_RE`); `plans.ts` их реэкспортирует (прежние потребители целы),
   `validatePlanDefinition` = общая проверка + `name ∈ PLAN_NAMES`. Слой
   Stripe тарифов — `services/plan-stripe.ts` (`ensureProductForFamily`:
   Product один на семейство по `metadata.philosynth_plan = family`, имя и
   описание приводятся к открытой редакции; `createPriceForPlan`: lookup_key
   редакции, nickname, metadata; `retirePrice`; `stripeProductDescriptionFor`
   переехал сюда из скрипта); `stripe-client` += `retrievePrice`,
   `StripeSubscription.items`.
2. Д-75 (1) + Д-74. `seed:plans`: исходы `created / skip / fail` — **`updated`
   нет**; существующая строка не трогается ни при каком расхождении (ни
   квоты, ни цена, ни `stripe_price_id`, ни `is_active`), расхождения
   печатаются предупреждением по полям (`diverged`, `divergedCount`) с
   отсылкой к админке; созданная строка — `family = name, edition = 1`.
   `dev-billing.sh` различает skip по `created=0, skip=`; test-83 (8.3)
   помечен историей (его R2–R5 на `updated` описывают контракт 8.3).
   deploy/* (termux/ubuntu .sh и .md, hosting.md) и README — абзац «тарифы
   после первого посева правятся админкой», миграций семнадцать (0000…0016),
   `--transfer` у `stripe-create-prices` — для цены, изменённой ДО посева.
3. Д-74 (сервер). `services/plan-admin.ts` + четыре маршрута под
   `billingRoutes.use("/admin/*", requireAdmin)` (после `requireAuth`):
   `GET /billing/admin/plans` — все редакции с числом живых подписок
   (`status ≠ canceled`, LEFT JOIN + count); `PATCH /billing/admin/plans/:id`
   — название и `isActive` всегда; цена/период/квоты — только без живых
   подписок, иначе **409 `PLAN_HAS_SUBSCRIPTIONS`** (новый код; `details:
   { lockedFields, liveSubscriptions }` — только реально изменённые поля);
   новая цена/период → новый Price (lookup_key переезжает `transfer`),
   прежний выключается ПОСЛЕ транзакции (отказ — предупреждение,
   `retiredPriceId: null`); `isActive=true` при пустом `stripe_price_id` →
   400; `POST /billing/admin/plans/:id/editions` — новая строка (`edition =
   max+1` в семействе, `name = <family>-v<N>`), новый Price под Product
   семейства, прежняя `is_active=false`; **Price прежней редакции НЕ
   выключается** (по нему продлеваются её подписчики; «закрыт для покупки»
   держит `is_active`); `POST /billing/admin/plans` — новое семейство
   (редакция 1, Product + Price; нужен админке, сиду — нет). Порядок с
   внешней системой: Price в Stripe → транзакция под `FOR UPDATE` строки с
   ПОВТОРНОЙ проверкой живых подписок → выключение прежнего; отказ
   транзакции выключает созданный Price (best effort). Экономика и
   структура — `assertPlanSpec` → `VALIDATION_ERROR` с `details` по полям
   / `details.economics`. След — `admin_audit` той же транзакцией:
   `plan.created` / `plan.updated` (`changed: {поле: {from, to}}`,
   `previousPriceId`) / `plan.edition` (`previousName`, `edition`,
   `stripePriceId`), `target_id = name`, `ip`. Stripe не настроен → 503
   `STRIPE_UNAVAILABLE` (штатный `errorResponse`); `PlanAdminError` →
   400/404/409.
4. Д-75 (2). Вебхук `customer.subscription.updated`: `items.data[0].price.id`
   → план по `stripe_price_id`; найден и отличается → `plan_id`
   (`action: "updated_plan"`); не найден → `console.warn` с id Price и
   подписки, `plan_id` на месте; без `items` — прежнее поведение.
   `tools/stripe-emit.mjs` += `--price <price_…>` (кладёт `items`).
5. Клиент. Вкладка «Тарифы» (`PlansTab`, шестая, после «Почты»): таблица
   редакций (семейство/`ред. N`, название, цена/период, квоты одной
   строкой, живые подписки, «открыт/закрыт», ✎ Править / ⧉ Новая редакция —
   у плана с подписками кнопка редакции первичная), «↻ Обновить», «+ Новый
   тариф». Форма правки под строкой (`PlanFields`): при живых подписках
   цена, период и квоты `disabled` с `title`-подсказкой и строкой-пояснением
   (`data-locked`), название и флажок «открыт для покупки» — живые.
   «Новая редакция» — форма, предзаполненная прежней редакцией, с
   пояснением (имя будущей строки) и ВТОРЫМ ШАГОМ (`useSecondStep`:
   «Завести редакцию» → предупреждение «подписчики ({live}) остаются на
   прежних условиях» → «Точно завести?»). Карта подписей журнала +=
   `plan.created/updated/edition` и `plan.seeded` (8.3, без подписи с тех
   пор). `api/admin.ts` += `listAdminPlans`/`updatePlan`/`createPlanEdition`/
   `createPlan`; shared `AdminPlanRow`/`AdminPlansView`/`PlanFieldsInput`/
   `PlanUpdateInput`/`PlanEditionInput`/`PlanCreateInput`/`AdminPlanResult`,
   `SubscriptionPlan` += `family`, `edition`; `ApiErrorCode` +=
   `PLAN_HAS_SUBSCRIPTIONS`. CSS — блок 15.4 (`.plan-form`, `.plan-field-row`,
   `.plan-quotas`, `.plan-toolbar-btns`; без hex), css-parity A/B/C = 0.
   53 новых ключа — черновики en/de (`i18n:import --draft`), `i18n:check
   --strict` зелёный.
6. Сторож 2ba/4bl/5av: экспорты и тождество экономики (`plans.ts` и
   `plan-economics` — одна функция), схема/0016/журнал миграций, сид без
   `updated` и с экономикой до чтения строки, `plan-admin` (заслон, порядок
   Stripe → tx → retire, FOR UPDATE, журнал в tx, редакция не выключает
   прежний Price), вебхук, `stripe-emit --price`, маршруты под
   `requireAdmin`, `PLAN_HAS_SUBSCRIPTIONS` в клиенте и 03 §4.3, вкладка и
   карта журнала, deploy/* (абзац и 0016), ключи с en/de; 5av живьём на
   моке Stripe в процессе (семейство → Product/Price; incomplete — живая;
   409 с lockedFields; название на месте; редакция 2 — Price, прежняя
   закрыта, подписчик на месте, Price 1 жив; вебхук неизвестный/редакции
   2; после canceled — новый Price, прежний active=false; сид skip +
   diverged; `plan.*` ×4 с актором; мок видел только Product/Price).
   Переписаны под новый контракт: 5aa (строка, бывшая в БД, не трогается;
   `updated` в отчёте — ошибка), 4al (экономика в `plan-economics.ts`,
   `transfer` в `plan-stripe.ts`, `created=0, skip=` у стенда), 4bg/2av
   (`stripeProductDescriptionFor` в `plan-stripe.ts`), 4bk (`0000…001[56]`).
   Тесты 61/62/71 (drizzle) и 102/123 (SQL) заводят план с `family` (NOT
   NULL). Смоук `tests/smoke-154-request1.mjs` — 47 ✓ (A1–A18 исходники,
   B0–B8c живьём через `app.request` + мок). INTEGRATION OK; `typecheck`,
   `vite build`, `check:dotfiles`, css-parity зелёные.
   Не сделано нарочно (протокол): действующие подписчики на новую редакцию
   не переводятся; описание продукта — как в 14.1; BYO-ключи и лимитер не
   тронуты. Миграция 0016 на непустой таблице (backfill) проверена на копии
   БД с посеянными 8.3 строками — `family = name`, `edition = 1`.
"""
patch(
    D07,
    "- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10); если реестр пуст — Фаза 15 закрыта, строка в README\n\n---\n\n### Типовая беседа L:",
    "- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10); если реестр пуст — Фаза 15 закрыта, строка в README\n" + FACT_154_R1 + "\n---\n\n### Типовая беседа L:",
    "07: «По факту 15.4 (первый запрос)»",
    marker="**По факту 15.4 (первый запрос — 2026-11-05).**",
)

# ── B. 02 ───────────────────────────────────────────────────────────────
patch(
    D02,
    "> иначе fail — убыточный тариф не заводится. Каждая created/updated пишет\n> `admin_audit` `plan.seeded` (actor_id NULL, §2.29).\n",
    "> иначе fail — убыточный тариф не заводится. Каждая created/updated пишет\n> `admin_audit` `plan.seeded` (actor_id NULL, §2.29).\n"
    ">\n"
    "> **15.4 (2026-11-05, Д-74/Д-75) — источник истины о тарифах — ЭТА ТАБЛИЦА,\n"
    "> правка админкой и редакциями.** `plans.ts` — только начальный посев: сид\n"
    "> создаёт отсутствующие строки (`family = name`, `edition = 1`) и\n"
    "> существующие НЕ переписывает ни при каком расхождении (исхода `updated`\n"
    "> нет; расхождение — предупреждением по полям). Редакция тарифа — строка:\n"
    "> `family` — семейство (`starter`), `edition` — номер в семействе (1, 2, …;\n"
    "> `UNIQUE (family, edition)`), `name` — уникальное имя редакции (редакция 1\n"
    "> носит имя семейства, следующие — `<family>-v<N>`). Product в Stripe —\n"
    "> один на семейство (`metadata.philosynth_plan = family`), Price — на\n"
    "> редакцию (`lookup_key = philosynth_<name>`). Админка (03 §2.10,\n"
    "> `services/plan-admin.ts`): название и `is_active` («открыт для покупки»)\n"
    "> правятся на месте; цена, период и квоты — на месте только у редакции без\n"
    "> живых подписок (`status ≠ canceled`; новая цена/период → новый Price,\n"
    "> прежний выключается); у редакции с подписками — «новая редакция»: новая\n"
    "> строка с новым Price, прежняя `is_active=false`, её подписчики\n"
    "> дорабатывают на своих квотах и цене (`plan_id` не меняется; Price\n"
    "> прежней редакции в Stripe остаётся активным — по нему продлеваются).\n"
    "> Экономика и структура — одной функцией с сидом\n"
    "> (`config/plan-economics.ts`). След — `admin_audit` `plan.created` /\n"
    "> `plan.updated` / `plan.edition` (§2.29).\n",
    "02 §2.22: врезка 15.4",
)
patch(
    D02,
    "  name             TEXT NOT NULL UNIQUE,   -- 'starter', 'pro', 'academic'\n  display_name     TEXT NOT NULL,          -- 'Starter', 'Pro', 'Academic'\n",
    "  name             TEXT NOT NULL UNIQUE,   -- имя РЕДАКЦИИ: 'starter' (ред. 1), 'starter-v2' … (15.4)\n"
    "  family           TEXT NOT NULL,          -- 15.4 (0016): семейство; у строк до миграции = name\n"
    "  edition          INT  NOT NULL DEFAULT 1, -- 15.4 (0016): номер редакции в семействе\n"
    "  display_name     TEXT NOT NULL,          -- 'Starter', 'Pro', 'Academic'\n",
    "02 §2.22: колонки family/edition",
)
patch(
    D02,
    "  stripe_price_id  TEXT NOT NULL,    -- Stripe Price ID\n  is_active        BOOLEAN NOT NULL DEFAULT true,\n  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n```\n\n### 2.23. user_subscriptions",
    "  stripe_price_id  TEXT NOT NULL,    -- Stripe Price ID (Price редакции)\n  is_active        BOOLEAN NOT NULL DEFAULT true,  -- «открыт для покупки» (15.4)\n  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\nCREATE UNIQUE INDEX uq_subscription_plans_family_edition ON subscription_plans(family, edition);  -- 15.4\n```\n\n### 2.23. user_subscriptions",
    "02 §2.22: индекс family/edition",
)
patch(
    D02,
    "Активные подписки пользователей.\n\n```sql\nCREATE TABLE user_subscriptions (",
    "Активные подписки пользователей.\n\n> **15.4 (Д-75):** `plan_id` следует за Price подписки в Stripe: вебхук\n> `customer.subscription.updated` берёт `items.data[0].price.id`, находит\n> план по `stripe_price_id` и переносит `plan_id`, если он отличается;\n> неизвестный Price — предупреждение в журнал сервера, `plan_id` на месте.\n> Новая редакция тарифа (§2.22) подписчиков НЕ переводит — только Stripe.\n\n```sql\nCREATE TABLE user_subscriptions (",
    "02 §2.23: plan_id по вебхуку",
)
patch(
    D02,
    "    -- account.deleted, plan.seeded (8.3: посев тарифов, actor_id NULL)\n",
    "    -- account.deleted, plan.seeded (8.3: посев тарифов, actor_id NULL),\n    -- plan.created, plan.updated, plan.edition (15.4: тарифы админкой;\n    -- target_id = name редакции; details — changed {поле: {from, to}},\n    -- previousPriceId / previousName, edition, stripePriceId)\n",
    "02 §2.29: ADMIN_ACTIONS += plan.*",
)

# ── C. 03 ───────────────────────────────────────────────────────────────
patch(
    D03,
    "                                // POST /subscribe на неактивный/неизвестный\n                                // planId → 404 NOT_FOUND (6.1).\n",
    "                                // POST /subscribe на неактивный/неизвестный\n                                // planId → 404 NOT_FOUND (6.1).\n"
    "                                // 15.4: is_active = «открыт для покупки»;\n"
    "                                // закрытые редакции (02 §2.22) сюда не\n"
    "                                // попадают — BillingPage/LandingPage видят\n"
    "                                // только открытые. SubscriptionPlan += family,\n"
    "                                // edition.\n",
    "03 §2.10: GET /plans — открытые редакции",
)
patch(
    D03,
    "                                // customer.subscription.updated → обновить статус\n                                // customer.subscription.deleted → status = 'canceled'\n\nGET    /billing/transactions    ?page=1&limit=50\n                                → { items: Transaction[], total: number }\n```\n",
    "                                // customer.subscription.updated → обновить статус;\n"
    "                                //   15.4 (Д-75): items.data[0].price.id → план по\n"
    "                                //   stripe_price_id → plan_id (action updated_plan);\n"
    "                                //   неизвестный Price → предупреждение, plan_id цел\n"
    "                                // customer.subscription.deleted → status = 'canceled'\n\n"
    "GET    /billing/transactions    ?page=1&limit=50\n                                → { items: Transaction[], total: number }\n\n"
    "// 15.4 (Д-74): тарифы админкой и редакциями — requireAuth + requireAdmin\n"
    "// (403 FORBIDDEN пользователю; услуги — services/plan-admin.ts; Stripe не\n"
    "// настроен → 503 STRIPE_UNAVAILABLE; экономика и структура — одной функцией с\n"
    "// сидом, нарушения → 400 VALIDATION_ERROR с details по полям / details.economics)\n"
    "GET    /billing/admin/plans     → { plans: AdminPlanRow[] }\n"
    "                                // ВСЕ редакции всех семейств (и закрытые), по\n"
    "                                // семейству и номеру; AdminPlanRow = SubscriptionPlan\n"
    "                                // + liveSubscriptions (status ≠ canceled)\n"
    "POST   /billing/admin/plans     PlanCreateInput { name, displayName, priceUsd,\n"
    "                                  billingPeriod, quota*, isActive? }\n"
    "                                → AdminPlanResult { plan }   // 201: новое семейство\n"
    "                                // (редакция 1): Product + Price в Stripe; занятое\n"
    "                                // имя/семейство → 400\n"
    "PATCH  /billing/admin/plans/:id PlanUpdateInput { displayName?, priceUsd?,\n"
    "                                  billingPeriod?, quota*?, isActive? }\n"
    "                                → AdminPlanResult { plan, retiredPriceId? }\n"
    "                                // правка НА МЕСТЕ: displayName/isActive — всегда;\n"
    "                                // цена, период, квоты — только без живых подписок,\n"
    "                                // иначе 409 PLAN_HAS_SUBSCRIPTIONS (details:\n"
    "                                // lockedFields — изменённые из запертых,\n"
    "                                // liveSubscriptions); новая цена/период → новый\n"
    "                                // Price (lookup_key переезжает), прежний выключен\n"
    "                                // (retiredPriceId; отказ Stripe там → null);\n"
    "                                // isActive=true без Price → 400; admin_audit\n"
    "                                // plan.updated\n"
    "POST   /billing/admin/plans/:id/editions  PlanEditionInput (поля PATCH без isActive;\n"
    "                                  незаданные — у прежней редакции)\n"
    "                                → AdminPlanResult { plan, previous }   // 201\n"
    "                                // новая редакция семейства: строка\n"
    "                                // <family>-v<N>, Price редакции под Product\n"
    "                                // семейства, открыта; prev is_active=false,\n"
    "                                // её подписчики и Price не тронуты; admin_audit\n"
    "                                // plan.edition\n"
    "```\n",
    "03 §2.10: маршруты /billing/admin/plans и вебхук",
)
patch(
    D03,
    "WEBHOOK_SIGNATURE_INVALID — подпись Stripe webhook не сходится — 400 (6.1)\n",
    "WEBHOOK_SIGNATURE_INVALID — подпись Stripe webhook не сходится — 400 (6.1)\n"
    "PLAN_HAS_SUBSCRIPTIONS — PATCH /billing/admin/plans/:id: цена, период или квоты у\n"
    "                      редакции с живыми подписками (status ≠ canceled) — 409;\n"
    "                      details: { lockedFields: string[], liveSubscriptions };\n"
    "                      путь — «новая редакция» (15.4, Д-74)\n",
    "03 §4.3: PLAN_HAS_SUBSCRIPTIONS",
)
patch(
    D03,
    "| B6 | Подписки (Stripe Subscriptions): тарифные планы, квоты, управление подпиской | Фаза 6 — сервер ",
    "| B6 | Подписки (Stripe Subscriptions): тарифные планы, квоты, управление подпиской; 15.4 (Д-74): тарифы правятся админкой и редакциями (`/billing/admin/plans`), источник истины — БД | Фаза 6 — сервер ",
    "03 §1.11: B6 += редакции",
)

# ── D. 01 §6 ─────────────────────────────────────────────────────────────
patch(
    D01,
    "**Три режима биллинга** (приоритет при определении API-ключа для запроса):\n",
    "**Тарифы (беседа 15.4, Д-74/Д-75).** Источник истины о тарифах — таблица\n"
    "`subscription_plans`, не код: `server/config/plans.ts` — только первый\n"
    "посев (сид создаёт отсутствующие, существующие не переписывает). Тариф\n"
    "правится админкой (вкладка «Тарифы») и РЕДАКЦИЯМИ: редакция — строка с\n"
    "`family`/`edition`, Product в Stripe один на семейство, Price — на редакцию;\n"
    "название и «открыт для покупки» правятся на месте, цена/период/квоты — на\n"
    "месте лишь без живых подписок (новый Price, прежний выключен), иначе новая\n"
    "редакция: прежняя закрывается для покупки, её подписчики дорабатывают на\n"
    "своих условиях (квоты читаются вживую из их строки плана, `plan_id` не\n"
    "меняется). `plan_id` следует за Price подписки по вебхуку (02 §2.23).\n"
    "Экономика тарифа (квоты не дороже цены при `BILLING_MARKUP`) — одна функция\n"
    "для сида и сервера (`config/plan-economics.ts`).\n\n"
    "**Три режима биллинга** (приоритет при определении API-ключа для запроса):\n",
    "01 §6: абзац «Тарифы (15.4)»",
)

# ── E. 04 §4 ─────────────────────────────────────────────────────────────
patch(
    D04,
    "| `runMaintenance`, `maintenanceDue` в `server/services/mail/maintenance.ts`;",
    "| `PlanSpec`, `validatePlanSpec`, `assertPlanEconomics`, `PLAN_QUOTA_FIELDS` в `server/config/plan-economics.ts` (из `plans.ts`); `ensureProductForFamily`, `createPriceForPlan`, `retirePrice`, `stripeProductDescriptionFor` в `server/services/plan-stripe.ts`; `listPlansForAdmin`, `updatePlan`, `createPlanEdition`, `createPlanFamily`, `PlanAdminError`, `PLAN_LOCKED_FIELDS` в `server/services/plan-admin.ts`; `GET/POST/PATCH /billing/admin/plans[/:id[/editions]]` в `server/routes/billing.ts`; `plan_id` по Price в `handleStripeWebhook`; `retrievePrice`, `StripeSubscription.items` (`stripe-client.ts`); миграция `0016_plan_editions`; shared `AdminPlanRow`/`AdminPlansView`/`PlanFieldsInput`/`PlanUpdateInput`/`PlanEditionInput`/`PlanCreateInput`/`AdminPlanResult`, `AdminAction` += `plan.created/updated/edition`; клиент — `PlansTab`/`PlanFields` в `AdminPromptsPage.tsx`, `listAdminPlans`/`updatePlan`/`createPlanEdition`/`createPlan` (`api/admin.ts`), `PLAN_HAS_SUBSCRIPTIONS` в `ApiErrorCode`; `tools/stripe-emit.mjs --price` | НОВОЕ (15.4; Д-74, Д-75 — в исходнике биллинга нет): тарифы правятся админкой и редакциями, источник истины — БД; сид без перезаписи; заслон живых подписок 409; вебхук переносит `plan_id` по Price |\n"
    "| `runMaintenance`, `maintenanceDue` в `server/services/mail/maintenance.ts`;",
    "04 §4: строка 15.4",
)

# ── F. 05 ────────────────────────────────────────────────────────────────
patch(
    D05,
    "│   │       ├── 0015_email_change.sql   # 15.3 (Д-73): auth_tokens.purpose += email_change (пара\n│   │       │                           #  DROP/ADD CONSTRAINT), new_email text; генерат, тег переименован\n",
    "│   │       ├── 0015_email_change.sql   # 15.3 (Д-73): auth_tokens.purpose += email_change (пара\n│   │       │                           #  DROP/ADD CONSTRAINT), new_email text; генерат, тег переименован\n"
    "│   │       ├── 0016_plan_editions.sql  # 15.4 (Д-74): subscription_plans.family (backfill = name, NOT NULL),\n"
    "│   │       │                           #  edition (DEFAULT 1), UNIQUE (family, edition); рукой, снимок генератом\n",
    "05: миграция 0016",
)
patch(
    D05,
    "│   │   ├── subscription-service.ts    # Stripe Subscriptions: планы, квоты, счётчики, webhook\n│   │   │                               # (СДЕЛАНО 6.1: + consumeQuota — атомарная проверка+инкремент;\n│   │   │                               #  7.1: ensureStripeCustomer — один Customer на пользователя)\n",
    "│   │   ├── subscription-service.ts    # Stripe Subscriptions: планы, квоты, счётчики, webhook\n│   │   │                               # (СДЕЛАНО 6.1: + consumeQuota — атомарная проверка+инкремент;\n│   │   │                               #  7.1: ensureStripeCustomer — один Customer на пользователя;\n│   │   │                               #  15.4 (Д-75): вебхук subscription.updated переносит plan_id по Price)\n"
    "│   │   ├── plan-stripe.ts             # 15.4: Product/Price тарифов — общий слой сида цен и админки\n"
    "│   │   │                               # (ensureProductForFamily — один Product на семейство по metadata,\n"
    "│   │   │                               #  createPriceForPlan — Price редакции с lookup_key, retirePrice,\n"
    "│   │   │                               #  stripeProductDescriptionFor — английское, из скрипта 8.3/14.1)\n"
    "│   │   ├── plan-admin.ts              # 15.4 (Д-74): тарифы админкой и редакциями — listPlansForAdmin\n"
    "│   │   │                               # (живые подписки), updatePlan (на месте; заслон 409\n"
    "│   │   │                               #  PLAN_HAS_SUBSCRIPTIONS; новый Price → прежний выключен),\n"
    "│   │   │                               #  createPlanEdition (<family>-v<N>, прежняя закрыта),\n"
    "│   │   │                               #  createPlanFamily; admin_audit plan.* той же транзакцией\n",
    "05: plan-stripe.ts, plan-admin.ts",
)
patch(
    D05,
    "│   │   │                               # 8.3: + Products/Prices (createProduct, listProducts,\n│   │   │                               # createPrice, updatePrice, listPrices) для заведения тарифов\n",
    "│   │   │                               # 8.3: + Products/Prices (createProduct, listProducts,\n│   │   │                               # createPrice, updatePrice, listPrices) для заведения тарифов;\n│   │   │                               # 15.4: + retrievePrice, StripeSubscription.items (Price события)\n",
    "05: stripe-client 15.4",
)
patch(
    D05,
    "│   │   ├── plans.ts                   # 8.3: тарифы БЕЗ stripe_price_id (PLANS: starter/pro/\n│   │   │                              # academic), priceEnvVarFor, stripeLookupKeyFor,\n│   │   │                              # опорные стоимости операций из констант cost-estimator,\n│   │   │                              # assertPlanEconomics (цена ≥ Σ квот × cost × наценка)\n",
    "│   │   ├── plans.ts                   # 8.3: тарифы БЕЗ stripe_price_id (PLANS: starter/pro/\n│   │   │                              # academic), priceEnvVarFor, stripeLookupKeyFor;\n│   │   │                              # 15.4: ТОЛЬКО начальный посев (БД — источник истины);\n│   │   │                              # экономика реэкспортируется из plan-economics.ts\n"
    "│   │   ├── plan-economics.ts          # 15.4: ОБЩИЙ модуль сида и сервера — PlanSpec, validatePlanSpec,\n"
    "│   │   │                              # опорные стоимости операций из констант cost-estimator,\n"
    "│   │   │                              # computePlanEconomics / assertPlanEconomics (цена ≥ Σ квот ×\n"
    "│   │   │                              # cost × наценка), PlanEconomicsError, PLAN_QUOTA_FIELDS\n",
    "05: plans.ts / plan-economics.ts",
)
patch(
    D05,
    "│   │   ├── seed-plans.ts               # 8.3: subscription_plans из config/plans.ts;\n│   │   │                               # stripe_price_id из STRIPE_PRICE_*, без них\n│   │   │                               # is_active=false + громкое предупреждение\n",
    "│   │   ├── seed-plans.ts               # 8.3: subscription_plans из config/plans.ts;\n│   │   │                               # stripe_price_id из STRIPE_PRICE_*, без них\n│   │   │                               # is_active=false + громкое предупреждение;\n│   │   │                               # 15.4 (Д-75): created/skip/fail — существующие НЕ\n│   │   │                               # переписывает, расхождение с plans.ts — предупреждением\n",
    "05: seed-plans 15.4",
)
patch(
    D05,
    "│   │   │   ├── admin.ts                # 8.1: listUsers / setUserRole / getAuditLog (вкладка «Доступ»);\n│   │   │   │                           # 15.3: getMailOutbox (вкладка «Почта»)\n",
    "│   │   │   ├── admin.ts                # 8.1: listUsers / setUserRole / getAuditLog (вкладка «Доступ»);\n│   │   │   │                           # 15.3: getMailOutbox (вкладка «Почта»); 15.4: listAdminPlans /\n│   │   │   │                           # updatePlan / createPlanEdition / createPlan (вкладка «Тарифы»)\n",
    "05: api/admin.ts 15.4",
)
patch(
    D05,
    "15.3: + вкладка «Почта» (MailTab — четыре счётчика очереди, последние 50 строк без тел, «Обновить»; повтора нет)\n",
    "15.3: + вкладка «Почта» (MailTab — четыре счётчика очереди, последние 50 строк без тел, «Обновить»; повтора нет); 15.4: + вкладка «Тарифы» (PlansTab — редакции с живыми подписками, правка на месте с запертыми полями, «Новая редакция» со вторым шагом, «Новый тариф»; карта журнала += plan.*)\n",
    "05: AdminPromptsPage 15.4",
)
patch(
    D05,
    "│   │                                   # на беседу, patch-docs-conv<NNN>.py; последний — conv153)\n",
    "│   │                                   # на беседу, patch-docs-conv<NNN>.py; последний — conv154)\n",
    "05: patches — последний conv154",
)
patch(
    D05,
    "│   │                                   # customer.subscription.updated|deleted (подпись при\n│   │                                   # непустом STRIPE_WEBHOOK_SECRET)\n",
    "│   │                                   # customer.subscription.updated|deleted (подпись при\n│   │                                   # непустом STRIPE_WEBHOOK_SECRET); 15.4: --price кладёт\n│   │                                   # items.data[0].price.id (перенос plan_id)\n",
    "05: stripe-emit --price",
)
patch(
    D05,
    "    │                                   # smoke-153-request1 — 15.3: maintenanceDue, письма 15.3 (ссылка только в\n",
    "    │                                   # smoke-154-request1 — 15.4: экономика одной функцией, схема/0016, сид без\n"
    "    │                                   #  updated, stripe-emit --price, клиент/коды/доки/deploy/CSS/ключи; живьём\n"
    "    │                                   #  через app.request + мок Stripe в процессе: 401/403/200, семейство →\n"
    "    │                                   #  Product/Price, 409 с lockedFields, название на месте, редакция -v2,\n"
    "    │                                   #  GET /plans без закрытых, вебхук (неизвестный/редакции 2/без items),\n"
    "    │                                   #  новый Price после canceled, сид skip + diverged, admin_audit plan.*\n"
    "    │                                   # smoke-153-request1 — 15.3: maintenanceDue, письма 15.3 (ссылка только в\n",
    "05: smoke-154",
)

# ── G. 07 §12 — состояние Д-74/Д-75 ─────────────────────────────────────
patch(
    D07,
    "Price и Product — через `stripe-client` (маршруты — в мок). Был Огр-7 | ревизия ограничений 2026-10-14 (код); был Огр-7 (8.3 п.10) | 15.4 | открыт |",
    "Price и Product — через `stripe-client` (маршруты — в мок). Был Огр-7 | ревизия ограничений 2026-10-14 (код); был Огр-7 (8.3 п.10) | 15.4 | код первого запроса 15.4 (2026-11-05) — ждёт тестовых запросов |",
    "07 §12: Д-74 — состояние",
    marker="При закрытии 15.4 (2026-11-05) сняты Д-74",
)
patch(
    D07,
    "найден — `plan_id`, не найден — предупреждение в журнал | ревизия ограничений 2026-10-14 (код) | 15.4 | открыт |",
    "найден — `plan_id`, не найден — предупреждение в журнал | ревизия ограничений 2026-10-14 (код) | 15.4 | код первого запроса 15.4 (2026-11-05) — ждёт тестовых запросов |",
    "07 §12: Д-75 — состояние",
    marker="При закрытии 15.4 (2026-11-05) сняты Д-74",
)

# ── H. NEXT-CONTEXT ──────────────────────────────────────────────────────
patch(
    NXT,
    "## Состояние на 2026-11-04 (15.3 ЗАКРЫТА 2026-11-04; ближайшая — 15.4; Фаза 14 закрыта)\n",
    "## Состояние на 2026-11-05 (15.4 — первый запрос ИСПОЛНЕН; 15.3 закрыта 2026-11-04)\n\n"
    "**15.4 (тарифы — админка редакциями и согласие подписки с тарифом;\n"
    "Д-74, Д-75) — первый запрос (пп. 0–6) исполнен 2026-11-05**, см. 07\n"
    "«По факту 15.4 (первый запрос)». Дальше по протоколу: тестовые запросы 2\n"
    "(Д-74 на моке), 3 (Д-75: сид и вебхук), 4 (браузер Chrome 131 на сборке:\n"
    "вкладка «Тарифы», запертые поля, второй шаг редакции, BillingPage без\n"
    "закрытых), затем завершение (typecheck/build/check:integration на свежем\n"
    "клоне/dotfiles/i18n strict/css-parity, ревью TODO, Д-74/Д-75 → 08 Часть\n"
    "IV; реестр §12 опустеет → Фаза 15 закрыта, строка в README). Инварианты\n"
    "15.4: источник истины о тарифах — БД; `plans.ts` — только посев, сид\n"
    "существующие НЕ переписывает (`created/skip/fail`, `diverged`\n"
    "предупреждением); редакция — строка `family`/`edition` (миграция 0016,\n"
    "`name` редакции 1 = семейство, далее `<family>-v<N>`); Product один на\n"
    "семейство, Price на редакцию; цена/период/квоты при живых подписках\n"
    "(`status ≠ canceled`) → 409 `PLAN_HAS_SUBSCRIPTIONS`; новая редакция\n"
    "закрывает прежнюю, подписчиков не переводит и её Price не выключает;\n"
    "вебхук переносит `plan_id` по Price события; экономика — одна функция\n"
    "(`config/plan-economics.ts`). Сторож 2ba/4bl/5av (следующая серия —\n"
    "2bb/4bm/5aw); миграция 0016 ЗАНЯТА (следующая — 0017); 53 ключа —\n"
    "ЧЕРНОВИКИ en/de (снимает владелец `i18n:import` без `--draft`); смоук\n"
    "`smoke-154-request1` 47 ✓; доки — `patch-docs-conv154.py` (часть I).\n"
    "STRIPE_PRICE_* в `.env.example` — без изменений (переменные те же три;\n"
    "после посева на них ничего не завязано).\n\n"
    "## Состояние на 2026-11-04 (15.3 ЗАКРЫТА 2026-11-04; ближайшая — 15.4; Фаза 14 закрыта)\n",
    "NEXT-CONTEXT: первый запрос 15.4",
    marker="миграция 0016 ЗАНЯТА",  # фраза живёт и в состоянии части III
)

# ── I. 09 — уроки 15.4 ───────────────────────────────────────────────────
patch(
    D09,
    "## 5. Node, TypeScript, сборка\n",
    "### Беседа 15.4 — strip() сторожей и «/admin/*», экономика в проверках сида\n"
    "1. **`strip()` сторожей (`/\\/\\*[\\s\\S]*?\\*\\//`) считает `\"/admin/*\"` в\n"
    "   кавычках началом блочного комментария** и съедает всё до ближайшего\n"
    "   `*/` — проверка `billingRoutes.use(\"/admin/*\", requireAdmin)` на\n"
    "   очищенном тексте «не находила» маршрут. Такие контракты проверять на\n"
    "   сыром файле (и помнить при любом пути с `/*` в литерале).\n"
    "2. **Расхождение сида нельзя проверять квотой «+1» у `starter`**: его\n"
    "   экономика на пределе (`$9.55 × 1.2 = $11.46` при `$9.99`), и +1 синтез\n"
    "   даёт `fail` экономики ДО чтения строки — не `skip + diverged`. Для\n"
    "   проверки «строка не переписана» квоту уменьшать или менять название.\n"
    "3. **Нужен ли `FOR UPDATE`, если внешняя система не откатывается**:\n"
    "   Price в Stripe заводится до транзакции, поэтому заслон живых подписок\n"
    "   проверяется дважды — до вызова Stripe (дёшево отказать) и под\n"
    "   `FOR UPDATE` строки плана (гонка с оформлением подписки); отказ\n"
    "   транзакции выключает уже созданный Price best effort.\n\n"
    "## 5. Node, TypeScript, сборка\n",
    "09: уроки 15.4",
    marker="### Беседа 15.4 — strip() сторожей и «/admin/*»",
)

print("\nЧАСТЬ II — тестовые запросы 2–4")

FACT_154_R24 = """
**По факту 15.4 (тестовые запросы 2–4 — 2026-11-05).** Три запроса одним
харнессом `tests/test-154-requests2-4.mjs` (живой сервер :3000 с моком
Stripe В ПРОЦЕССЕ харнесса, `STRIPE_WEBHOOK_SECRET` пуст; PG16/Redis;
сборка клиента под vite preview :5230; Chrome 131) — **49 ✓ ×4**.

- R2 (Д-74 на моке). Семейство заведено админкой (201; Product по
  metadata, Price с lookup_key); план без подписок — правка цены → новый
  Price с переехавшим lookup_key, прежний `active=false`; подписка
  оформлена `POST /billing/subscribe` через мок (`incomplete`) — в списке
  админки живая; правка квот → 409 `PLAN_HAS_SUBSCRIPTIONS` с
  `lockedFields` (только изменённые), правка цены → 409 и Price в Stripe не
  заведён; название на месте — 200; «новая редакция» → `-v2` с Price под
  тем же Product, прежняя закрыта (`GET /billing/plans` без неё,
  `/subscribe` → 404), Price редакции 1 жив; подписчик в `GET
  /billing/subscription` — прежняя редакция и квоты; новый покупатель
  получает `-v2`; `admin_audit` — `plan.created ×1`, `plan.updated ×2`
  (`previousPriceId`, `changed`), `plan.edition ×1` (`previousName`), все с
  актором; 403 пользователю / 401 гостю.
- R3 (Д-75). `npm run seed:plans` дочерним процессом при `academic`,
  переименованном админкой: rc 0, `skip=3 (расходятся с plans.ts: 1)`,
  исхода `updated` нет, предупреждение по полю (`academic.displayName: в
  БД … (154), в plans.ts Academic`) с отсылкой к админке, строка не
  переписана; `seedPlans` с изменёнными квотами (как `plans.ts`) → skip +
  `diverged` по квоте. `node tools/stripe-emit.mjs customer.subscription.
  updated <sub> --price <Price -v2>` → `action: updated_plan`, `plan_id`
  перенесён, подписчик видит квоты редакции 2; с неизвестным Price —
  `handled`, `plan_id` цел, предупреждение `… не соответствует ни одному
  тарифу …` в логе сервера; без `--price` — статус обновлён, `plan_id` цел.
- R4 (браузер). Вкладка «Тарифы»: строки обеих редакций с живыми
  подписками и «открыт/закрыт», счётчик; форма правки плана с подпиской —
  шесть полей `disabled` с `title` о живых подписках и строкой-пояснением,
  название правится и сохраняется (статус «сохранено», строка обновилась);
  план без подписок — ни одного запертого поля; «Новая редакция» называет
  будущее имя `-v3`, первый клик — предупреждение «подписчики (1) … никто
  не переводит» и «Точно завести?», «Отмена» закрывает без создания,
  подтверждение — `-v3` открыта с новыми квотами, `-v2` закрыта с
  подпиской на ней (БД и мок: Price `-v3`); журнал «Доступ» подписывает
  `plan.created/updated/edition`; стартовая страница и выбор тарифа на
  BillingPage — только открытая `-v3`; подписчик видит свою закрытую
  редакцию в карточке подписки; пользователю вкладки нет; ошибок JS нет.
  По снимку R4 поправлен CSS 15.4: запертое поле было неотличимо от
  живого (у `.form-input` нет своего `:disabled`) — фон `--off`, цвет
  `--ink-dim`; бейдж «ред. N» и цена не переносятся; две кнопки строки —
  столбиком (в строку таблица вылезала за рамку при 1400px).
- Переводы 53 ключей 15.4 **утверждены владельцем 2026-11-05**
  (`i18n:import` без `--draft`; черновиков 0). Сверка после сжатия
  контекста: текст первого запроса (пп. 0–6 и «чего не делать») против
  кода и «По факту» — расхождений нет; найдены и закрыты дыры доков —
  устаревшие строки NEXT-CONTEXT «Универсальный минимум» (число таблиц,
  последняя миграция, серии сторожей не обновлялись с 14.1).
"""
patch(
    D07,
    "   БД с посеянными 8.3 строками — `family = name`, `edition = 1`.\n\n---\n\n### Типовая беседа L:",
    "   БД с посеянными 8.3 строками — `family = name`, `edition = 1`.\n" + FACT_154_R24 + "\n---\n\n### Типовая беседа L:",
    "07: «По факту 15.4 (тестовые запросы 2–4)»",
    marker="**По факту 15.4 (тестовые запросы 2–4 — 2026-11-05).**",
)
patch(
    D05,
    "    │                                   # smoke-154-request1 — 15.4: экономика одной функцией, схема/0016, сид без\n",
    "    │                                   # test-154-requests2-4 — 15.4: живой сервер + мок Stripe в процессе харнесса +\n"
    "    │                                   #  сборка под preview :5230 + Chrome 131; R2 Д-74 на моке (цена без подписок,\n"
    "    │                                   #  409 с подпиской, редакция -v2, подписчик/новый покупатель, admin_audit);\n"
    "    │                                   #  R3 Д-75 (seed:plans CLI с расхождением, seedPlans с квотами, stripe-emit\n"
    "    │                                   #  --price неизвестный/редакции 2/без); R4 браузер — вкладка «Тарифы», запертые\n"
    "    │                                   #  поля, второй шаг редакции, журнал, стартовая и BillingPage без закрытых\n"
    "    │                                   # smoke-154-request1 — 15.4: экономика одной функцией, схема/0016, сид без\n",
    "05: test-154",
)
patch(
    NXT,
    "ЧЕРНОВИКИ en/de (снимает владелец `i18n:import` без `--draft`); смоук\n`smoke-154-request1` 47 ✓; доки — `patch-docs-conv154.py` (часть I).",
    "УТВЕРЖДЕНЫ 2026-11-05 (черновиков 0); смоук `smoke-154-request1` 47 ✓,\n`test-154-requests2-4` 49 ✓ ×4 (тестовые запросы 2–4 исполнены; дальше —\nзавершение беседы); доки — `patch-docs-conv154.py` (части I–II).",
    "NEXT-CONTEXT: тестовые запросы 2–4 исполнены, переводы утверждены",
    marker="test-154-requests2-4",
)
patch(
    NXT,
    "15.1 — миграция 0014 `uq_lineage_parent_pair`; следующая — 0015), единственный",
    "15.1 — миграция 0014 `uq_lineage_parent_pair`; 15.3 — 0015 `email_change`; 15.4 — 0016 `plan_editions` (family/edition); следующая — 0017), единственный",
    "NEXT-CONTEXT: универсальный минимум — миграции",
)
patch(
    NXT,
    "14.1 — 2av/4bg/5aq; следующая серия — 2aw/4bh/5ar). Секции 5xx с живой БД —",
    "14.1 — 2av/4bg/5aq; 14.2 — 2aw/4bh/5ar; 15.1 — 2ax/4bi/5as; 15.2 — 2ay/4bj/5at; 15.3 — 2az/4bk/5au; 15.4 — 2ba/4bl/5av; следующая серия — 2bb/4bm/5aw). Секции 5xx с живой БД —",
    "NEXT-CONTEXT: универсальный минимум — серии сторожей",
)
patch(
    "scripts/i18n/README.md",
    "(тем же днём, вливание без `--draft`). Черновиков в каталогах нет. Новые",
    "(тем же днём, вливание без `--draft`); 53 ключа беседы 15.4 (вкладка «Тарифы»,\n`server.services.planAdmin.*`) — утверждены владельцем 2026-11-05. Черновиков в каталогах нет. Новые",
    "scripts/i18n/README: переводы 15.4 утверждены",
)
patch(
    D09,
    "   транзакции выключает уже созданный Price best effort.\n\n## 5. Node, TypeScript, сборка\n",
    "   транзакции выключает уже созданный Price best effort.\n4. **`subscriptionId` ответа `POST /billing/subscribe` — id подписки в\n"
    "   Stripe (`sub_…`), не UUID строки** (03 §2.10 так и говорит, но харнесс\n"
    "   первым делом подставил его в `where id = …` → 22P02). Строку искать по\n"
    "   `stripe_subscription_id`.\n"
    "5. **Список тарифов на BillingPage грузится своим запросом после клика\n"
    "   «выбрать»** — `waitForSelector(sub-plans)` не значит, что строки уже\n"
    "   есть (R4 test-154 один раз получил `[]`); ждать первую строку\n"
    "   `[data-testid^=\"sub-plan-\"]` (та же грабля, что 09 §9 п.8).\n"
    "6. **Запертое поле надо показывать**: у `.form-input`/`.form-select`\n"
    "   исходника нет `:disabled` — `disabled` поле выглядело живым, и только\n"
    "   снимок браузерного прогона это выдал. Правила для запертых полей — в\n"
    "   блок беседы; снимок вкладки — часть браузерного теста.\n\n## 5. Node, TypeScript, сборка\n",
    "09: уроки харнесса 15.4",
    marker="`subscriptionId` ответа `POST /billing/subscribe` — id подписки",
)

print("\nЧАСТЬ III — завершение беседы")


def row_of(rel: str, prefix: str) -> str:
    """Полная строка таблицы по началу («| Д-74 |») — для переноса в 08."""
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


PF3 = """**По факту 15.4 (завершение — 2026-11-05).** Ревью TODO и заглушек: в
файлах беседы новых меток нет (12 меток `TODO(N)` в проекте — старые,
закрытые, в разъёмах 1.2–3.1 и сторожах). Завершение: `typecheck` 0
ошибок, `vite build`, `check:dotfiles`, `i18n:check --strict` (черновиков
0), css-parity 0/586 (A/B/C = 0), `audit`, `check:integration`
INTEGRATION OK на свежем клоне (настоящий `npm install`, 2ba/4bl/5av);
smoke-154 47 ✓, test-154 49 ✓ ×4. Строки Д-74, Д-75 → 08 Часть IV; новых
долгов и ограничений беседа не оставила. **Реестр §12 пуст (остались
только ограничения «Огр-N»); Фаза 15 ЗАКРЫТА 2026-11-05**; запланированных
бесед нет — следующий шаг назначает пользователь (ревизия ограничений
Огр-5/Огр-10/Огр-11 либо новая фаза). Вся беседа — одним коммитом по
просьбе пользователя.

"""
patch(
    D07,
    """  последняя миграция, серии сторожей не обновлялись с 14.1).
""",
    """  последняя миграция, серии сторожей не обновлялись с 14.1).

""" + PF3,
    "O1 07: «По факту 15.4 (завершение)»",
    marker="**По факту 15.4 (завершение — 2026-11-05).**",
)

CLOSED = {
    "| Д-74 |": "ЗАКРЫТ 15.4 (2026-11-05): редакции тарифа — миграция `0016_plan_editions` (`family` backfill = name, `edition`, UNIQUE); экономика и структура одной функцией сида и сервера (`config/plan-economics.ts`); слой Stripe тарифов `services/plan-stripe.ts` (Product один на семейство по metadata, Price редакции с lookup_key, `retirePrice`); `services/plan-admin.ts` + `GET/POST/PATCH /billing/admin/plans[/:id[/editions]]` под `requireAdmin` — название и `is_active` на месте, цена/период/квоты только без живых подписок (`status ≠ canceled`; новый Price, прежний выключен) иначе 409 `PLAN_HAS_SUBSCRIPTIONS` с `lockedFields`, «новая редакция» `<family>-v<N>` закрывает прежнюю, подписчиков не переводит и её Price не выключает; `admin_audit` plan.created/updated/edition той же транзакцией; вкладка «Тарифы» (запертые поля с подсказкой, второй шаг редакции, карта журнала plan.*); 53 ключа утверждены; сторож 2ba/4bl/5av, smoke-154, test-154 R2/R4",
    "| Д-75 |": "ЗАКРЫТ 15.4 (2026-11-05): (1) `seed:plans` — только `created/skip/fail`, существующие строки не переписывает ни при каком расхождении, расхождение с `plans.ts` — предупреждением по полям с отсылкой к админке (`dev-billing.sh`, deploy/*, README — тарифы после первого посева правятся админкой; test-83 помечен историей); (2) вебхук `customer.subscription.updated` берёт `items.data[0].price.id` → план по `stripe_price_id` → `plan_id` (`action updated_plan`), неизвестный Price — предупреждение в журнал, `plan_id` цел; `tools/stripe-emit.mjs --price`; test-154 R3",
}
rows_08 = []
for prefix, verdict in CLOSED.items():
    row = row_of(D07, prefix)
    if not row:
        continue
    cells = [c.strip() for c in row.strip().strip("|").split("|")]
    short = cells[2].split("**")[1] if "**" in cells[2] else cells[2][:120]
    rows_08.append(f"| {cells[0]} — {short.rstrip('.')} | 15.4 | {cells[3]} | {verdict} |\n")
if rows_08:
    _p08 = ROOT / "docs/08-history.md"
    _t08 = _p08.read_text(encoding="utf-8")
    _anchor = row_of("docs/08-history.md", "| Д-73 — ")
    if _anchor and "| Д-74 — " not in _t08:
        _p08.write_text(_t08.replace(_anchor, _anchor + "".join(rows_08), 1), encoding="utf-8")
        applied += 1
        print("  ok    P1 08 Часть IV: закрытые строки 15.4")
    else:
        skipped += 1
        print("  skip  P1 08 Часть IV: закрытые строки 15.4")
else:
    skipped += 1
    print("  skip  P1 08 Часть IV: закрытые строки 15.4")
for prefix in CLOSED:
    row = row_of(D07, prefix)
    if row:
        remove(D07, row, f"P2 07 §12: снята строка {prefix.strip('| ')}")
    else:
        skipped += 1
        print(f"  skip  P2 07 §12: снята строка {prefix.strip('| ')}")
patch(
    D07,
    """| № | Вид | Долг | Где найдено | Адресат | Состояние |
|---|---|---|---|---|---|

### Ограничения (сознательно не делается)""",
    """| № | Вид | Долг | Где найдено | Адресат | Состояние |
|---|---|---|---|---|---|

> Реестр пуст с 2026-11-05 (закрытие 15.4 и Фазы 15): все строки Д-1…Д-80
> — в 08 Часть IV; остались только ограничения «Огр-N» ниже.

### Ограничения (сознательно не делается)""",
    "P2a 07 §12: пометка «реестр пуст»",
)
patch(
    D07,
    """   При закрытии 15.3 (2026-11-04) сняты Д-72, Д-73 (в 08 Часть IV); новых
   долгов и ограничений нет, строк «не назначен» нет; в реестре — Д-74,
   Д-75 (15.4).
""",
    """   При закрытии 15.3 (2026-11-04) сняты Д-72, Д-73 (в 08 Часть IV); новых
   долгов и ограничений нет, строк «не назначен» нет; в реестре — Д-74,
   Д-75 (15.4).
   При закрытии 15.4 (2026-11-05) сняты Д-74, Д-75 (в 08 Часть IV); новых
   долгов и ограничений нет, строк «не назначен» нет; реестр пуст —
   Фаза 15 закрыта.
""",
    "P3 07 §12: журнал — закрытие 15.4",
)
patch(
    D07,
    """> **15.3 закрыта 2026-11-04** (Д-72, Д-73; миграция 0015 `email_change`;
> новых долгов нет). Ближайшая — 15.4.
>""",
    """> **15.3 закрыта 2026-11-04** (Д-72, Д-73; миграция 0015 `email_change`;
> новых долгов нет). **15.4 закрыта 2026-11-05** (Д-74, Д-75; миграция
> 0016 `plan_editions`; новых долгов нет). **Фаза 15 ЗАКРЫТА 2026-11-05;
> реестр §12 пуст** — запланированных бесед нет.
>""",
    "Q1 07: врезка «Фаза 15» — 15.4 и фаза закрыты",
)
patch(
    "docs/08-history.md",
    """контекста закрыла дыры 03 §1.1/§1; доки — patch-docs-conv153.py (три
части); ближайшая — 15.4.
""",
    """контекста закрыла дыры 03 §1.1/§1; доки — patch-docs-conv153.py (три
части); ближайшая — 15.4.
Беседа 15.4 (тарифы — админка редакциями и согласие подписки с тарифом;
бэкенд + клиент) ЗАКРЫТА 2026-11-05 — Фаза 15 закрыта, реестр §12 пуст.
Д-74: миграция 0016 (`family`/`edition`), экономика одной функцией
(`plan-economics.ts`), слой Stripe тарифов (`plan-stripe.ts`), админка
тарифов (`plan-admin.ts`, четыре маршрута `/billing/admin/plans` под
requireAdmin: название/«открыт» на месте, цена/период/квоты только без
живых подписок — иначе 409 `PLAN_HAS_SUBSCRIPTIONS`, «новая редакция»
`<family>-v<N>` закрывает прежнюю без перевода подписчиков),
`admin_audit` plan.*, вкладка «Тарифы» (запертые поля, второй шаг). Д-75:
сид без перезаписи (расхождение — предупреждением), вебхук переносит
`plan_id` по Price события, `stripe-emit --price`. Решения: Price прежней
редакции не выключается, порядок Stripe → транзакция под FOR UPDATE →
выключение прежнего, `plan.seeded` получил подпись в журнале. 53 ключа
(утверждены), сторож 2ba/4bl/5av, smoke-154 47 ✓, test-154 49 ✓ ×4; сверка
после сжатия контекста закрыла устаревшие строки NEXT-CONTEXT; доки —
patch-docs-conv154.py (три части); запланированных бесед нет.
""",
    "R1 08 Часть I: 15.4 закрыта",
    marker="Беседа 15.4 (тарифы — админка редакциями и согласие подписки с тарифом;",
)

CH154 = """### Беседа 15.4 — Тарифы: админка редакциями и согласие подписки с тарифом (бэкенд + клиент) [ЗАКРЫТА 2026-11-05 — Фаза 15 закрыта]

**Вход:** HEAD 9d92274, `check:dotfiles` чист, `npm install` в самом клоне,
PG 16 и Redis в песочнице (роль/БД заведены заново, миграции 0000–0016),
Chrome 131 из `chrome/` (CHROME_PATH окружения указывал на системный —
задан явно). Четвёртая, последняя беседа Фазы 15: Д-74, Д-75 (решение
пользователя 2026-10-14 «как надёжнее»: источник истины — БД, правка
админкой и редакциями, `plans.ts` — только посев, подписчиков на новую
редакцию не переводить). Требования пользователя: мок Stripe —
`tools/stripe-mock.mjs` без своей копии; дизайн вкладки по набору 5-6 с
css-parity; новые строки через `tl()` с черновиками en/de; браузер на
сборке; один протокольный запрос за раз; доки править там, где нужны
беседе; `STRIPE_PRICE_*` в `.env.example` сверить после выкладки.

**Ход.** П.0: мок уже нёс все маршруты Product/Price (8.2/8.3/14.1) —
добавлять нечего; BillingPage/LandingPage уже показывали только открытые
(`GET /billing/plans`); экономика жила в `plans.ts` с импортом
cost-estimator и требовала `name ∈ PLAN_NAMES`; у `StripeSubscription`
не было `items`; `stripe-emit` не умел класть Price; стенд и test-83 ждали
`created=0, updated=0,`. Решения с доводом: редакция — строка с
`family`/`edition` (миграция 0016, backfill `family = name`), имя
редакции 1 = семейство, далее `<family>-v<N>`; Product один на семейство
по metadata, Price на редакцию с lookup_key; Price прежней редакции при
«новой редакции» НЕ выключается (по нему продлеваются её подписчики —
«закрыт» держит `is_active`), при правке цены на месте — выключается
после транзакции; порядок Stripe → транзакция под FOR UPDATE с повторной
проверкой живых подписок → выключение (отказ транзакции гасит созданный
Price best effort); новый код 409 `PLAN_HAS_SUBSCRIPTIONS` с
`lockedFields` только по изменённым полям; сид — `created/skip/fail` без
`updated`, расхождение печатается по полям; вебхук переносит `plan_id`
по `items.data[0].price.id`, неизвестный Price — `console.warn`. Сервер:
`config/plan-economics.ts` (общий модуль; `plans.ts` реэкспортирует),
`services/plan-stripe.ts`, `services/plan-admin.ts`, четыре маршрута под
`billingRoutes.use("/admin/*", requireAdmin)`, `retrievePrice`, шаблон
seed-plans переписан, `stripe-create-prices` на общем слое, `stripe-emit
--price`, deploy/*/README — абзац про админку и семнадцать миграций.
Клиент: `PlansTab`/`PlanFields` (таблица редакций, правка под строкой с
запертыми полями, «Новая редакция» со вторым шагом, «Новый тариф»),
карта журнала += `plan.*` (и `plan.seeded` 8.3), `api/admin.ts` ×4,
`ApiErrorCode`; CSS блоком 15.4 (восемь правил, без hex; по снимку R4 —
запертое поле, бейдж/цена без переноса, кнопки столбиком). Сторож
2ba/4bl/5av (5av — мок в процессе); 5aa/4al/4bg/4bk переписаны под новый
контракт; тесты 61/62/71/102/123 заводят план с `family`. Сверка после
сжатия контекста (пришлось на переписывание seed-plans): текст беседы
против кода — расхождений нет; закрыты устаревшие строки NEXT-CONTEXT
(«Универсальный минимум»), числа миграций в deploy/*.md. Переводы: 53
ключа утверждены.

**Тесты.** smoke-154 47 ✓ (чистые функции, исходники, живьём через
`app.request` + мок: 401/403/200, семейство → Product/Price, 409 с
lockedFields, редакция, вебхук, новый Price после canceled, сид skip +
diverged, журнал); test-154-requests2-4 49 ✓ ×4: R2 Д-74 на моке живьём
(подписка через `/billing/subscribe`, заслон, редакция, подписчик и новый
покупатель, журнал), R3 Д-75 (`npm run seed:plans` дочерним процессом с
предупреждением, `seedPlans` с квотами, `stripe-emit --price`
неизвестный/редакции 2/без), R4 браузер Chrome 131 на сборке (вкладка,
запертые поля, второй шаг, журнал «Доступ», стартовая и BillingPage без
закрытых, пользователю закрыто). Грабли — 09 §4 (strip() и «/admin/*»,
квота «+1» у starter убыточна, `subscriptionId` — id Stripe, список
тарифов грузится после клика, запертое поле надо показывать).

**Завершение.** Регрессия на свежем клоне зелёная; Д-74, Д-75 → 08 Часть
IV; новых долгов нет; реестр §12 пуст — Фаза 15 закрыта; доки —
`patch-docs-conv154.py` (три части). Запланированных бесед нет.

"""
patch(
    "docs/08-history.md",
    """### Беседа 15.3 — Почта: обслуживание очереди и смена адреса (бэкенд + клиент) [ЗАКРЫТА 2026-11-04]
""",
    CH154 + """### Беседа 15.3 — Почта: обслуживание очереди и смена адреса (бэкенд + клиент) [ЗАКРЫТА 2026-11-04]
""",
    "R2 08 Часть II: глава 15.4",
    marker="### Беседа 15.4 — Тарифы: админка редакциями и согласие подписки с тарифом",
)
patch(
    "README.md",
    """уведомлением на старый; Д-72, Д-73) — закрыта 11-04; ближайшая — 15.4 |""",
    """уведомлением на старый; Д-72, Д-73) — закрыта 11-04; 15.4 (тарифы — источник истины БД, редакции `family`/`edition` — миграция 0016, админка `/billing/admin/plans` и вкладка «Тарифы», заслон живых подписок 409, сид без перезаписи, вебхук переносит `plan_id` по Price; Д-74, Д-75) — закрыта 11-05. **Фаза закрыта 2026-11-05; реестр §12 пуст** |""",
    "S1 README: 15.4 и Фаза 15 закрыты",
)
patch(
    D09,
    """2. **15.3 — то же в третий раз, в другом месте**: часть II дописала
   «ждёт тестовых запросов» → «тесты пройдены» в строках §12 и
   заголовок урока в 09 — часть I без `marker` на втором прогоне дала
   «якорь встречается 0 раз» (fail) и один повторный вставок. Правило
   то же; проверка после КАЖДОЙ части, не только в конце.
""",
    """2. **15.3 — то же в третий раз, в другом месте**: часть II дописала
   «ждёт тестовых запросов» → «тесты пройдены» в строках §12 и
   заголовок урока в 09 — часть I без `marker` на втором прогоне дала
   «якорь встречается 0 раз» (fail) и один повторный вставок. Правило
   то же; проверка после КАЖДОЙ части, не только в конце.
3. **15.4 — порядок пунктов в списке 09**: часть II вставила уроки
   харнесса якорем «перед пунктом 3» — получилось 1, 2, 4, 5, 6, 3.
   Якорь дописываемого списка — его последняя строка (или заголовок
   следующего раздела), а не «первый пункт, который попался».
""",
    "T1 09 §2: урок патча 15.4",
)

# NEXT-CONTEXT — перезапись: состояние; запланированных бесед нет
_pn = ROOT / NXT
_tn = _pn.read_text(encoding="utf-8")
if "## Состояние на 2026-11-05 (15.4 ЗАКРЫТА 2026-11-05; Фаза 15 ЗАКРЫТА" in _tn:
    skipped += 1
    print("  skip  U1 NEXT-CONTEXT: состояние и закрытие Фазы 15")
else:
    i = _tn.index("## Ближайшая беседа — 15.4 (тарифы: админка редакциями и согласие подписки с тарифом; бэкенд + клиент)")
    j = _tn.index("## Беседа 15.3 (ЗАКРЫТА 2026-11-04) — что было комплектом")
    near = """## Ближайшая беседа — НЕ НАЗНАЧЕНА (Фаза 15 закрыта 2026-11-05, реестр §12 пуст)

Все фазы 07 (0–15) закрыты, реестр долгов пуст; остались только
ограничения «Огр-N» (07 §12): Огр-5 (правка чужой концепции и роли
редакторов — новая модель доступа), Огр-8, Огр-9, Огр-10 (один активный
BYO-ключ), Огр-11 (гейт операции в памяти процесса — вместе с
горизонтальным масштабированием), Огр-12, Огр-13 (восстановления
удалённого элемента из снимка нет). Следующий шаг назначает
пользователь: ревизия ограничений (образец — ревизия 2026-10-14, 07
«Фаза 15»), новая фаза либо эксплуатационная работа (выкладка по
deploy/*). Любая новая беседа начинается с 07 §1, §9–12, 09 целиком и
этого файла; серия сторожей — 2bb/4bm/5aw, миграция — 0017.

## Беседа 15.4 (ЗАКРЫТА 2026-11-05) — что было комплектом

Четвёртая беседа Фазы 15 — Д-74 (тарифы только кодом) и Д-75
(подписка расходится с тарифом). Первый запрос — 2026-11-05: миграция
0016 (`family`/`edition`), `config/plan-economics.ts`,
`services/plan-stripe.ts`, `services/plan-admin.ts` + четыре маршрута
`/billing/admin/plans` под requireAdmin (409 `PLAN_HAS_SUBSCRIPTIONS`),
сид без перезаписи, вебхук переносит `plan_id`, `stripe-emit --price`,
вкладка «Тарифы», 53 ключа, сторож 2ba/4bl/5av, smoke-154 47 ✓.
Тестовые запросы 2–4 — 2026-11-05 одним заходом (test-154-requests2-4
49 ✓ ×4), переводы утверждены; сверка после сжатия контекста закрыла
устаревшие строки этого файла. Завершение — 2026-11-05: регрессия на
свежем клоне, Д-74/Д-75 → 08 Часть IV, реестр пуст, один коммит.

"""
    _tn = _tn[:i] + near + _tn[j:]
    old_head = "## Состояние на 2026-11-05 (15.4 — первый запрос ИСПОЛНЕН; 15.3 закрыта 2026-11-04)"
    k = _tn.index(old_head)
    k2 = _tn.index("## Состояние на 2026-11-04 (15.3 ЗАКРЫТА 2026-11-04; ближайшая — 15.4; Фаза 14 закрыта)")
    state = """## Состояние на 2026-11-05 (15.4 ЗАКРЫТА 2026-11-05; Фаза 15 ЗАКРЫТА; реестр §12 пуст; ближайшая беседа не назначена)

**15.4 (тарифы — админка редакциями и согласие подписки с тарифом;
бэкенд + клиент) ЗАКРЫТА 2026-11-05.** Закрыты Д-74, Д-75; новых долгов
и ограничений нет; **реестр §12 пуст — Фаза 15 закрыта**. Инварианты
тарифов с 15.4: источник истины — таблица `subscription_plans`;
`server/config/plans.ts` — только первый посев (сид `created/skip/fail`,
существующие строки НЕ переписывает, расхождение — предупреждением по
полям); редакция — строка `family`/`edition` (миграция 0016; `name`
редакции 1 = семейство, далее `<family>-v<N>`, UNIQUE(family, edition));
Product в Stripe один на семейство (`metadata.philosynth_plan`), Price —
на редакцию (`lookup_key philosynth_<name>`); админка
(`services/plan-admin.ts`, `/billing/admin/plans[/:id[/editions]]`,
requireAdmin): название и `is_active` на месте; цена/период/квоты — на
месте только без живых подписок (`status ≠ canceled`; новый Price,
прежний выключен ПОСЛЕ транзакции), иначе 409 `PLAN_HAS_SUBSCRIPTIONS`
(`details.lockedFields`); «новая редакция» закрывает прежнюю, её
подписчиков не переводит и её Price не выключает; экономика и структура
— одна функция сида и сервера (`config/plan-economics.ts`); `admin_audit`
plan.created/updated/edition той же транзакцией; вебхук
`customer.subscription.updated` переносит `plan_id` по
`items.data[0].price.id` (неизвестный Price — предупреждение);
`GET /billing/plans` — только открытые редакции. Сторож 2ba/4bl/5av
(следующая серия — 2bb/4bm/5aw); миграция 0016 ЗАНЯТА (следующая — 0017);
53 ключа утверждены; тесты smoke-154 47 ✓, test-154-requests2-4 49 ✓ ×4.
Доки — `patch-docs-conv154.py` (три части).

"""
    _tn = _tn[:k] + state + _tn[k2:].replace("## Состояние на 2026-11-04 (15.3 ЗАКРЫТА 2026-11-04; ближайшая — 15.4; Фаза 14 закрыта)", "## Состояние на 2026-11-04 (15.3 ЗАКРЫТА 2026-11-04; Фаза 14 закрыта)", 1)
    _pn.write_text(_tn, encoding="utf-8")
    applied += 1
    print("  ok    U1 NEXT-CONTEXT: состояние и закрытие Фазы 15")

print(f"\nИтог: ok {applied}, skip {skipped}, fail {failed}")
sys.exit(1 if failed else 0)
