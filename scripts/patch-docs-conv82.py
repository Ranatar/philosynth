#!/usr/bin/env python3
"""Патч документации по итогам ЗАПРОСА 1 беседы 8.2 (локальный стенд
биллинга без Stripe — оснастка). Вносит факты, ставшие постоянными
(2026-09-08); блок «По факту 8.2», хроника 08 и перезапись NEXT-CONTEXT —
при закрытии беседы — дописаны ОТДЕЛЬНЫМИ patch() (блок C) и перезаписью
NEXT-CONTEXT (блок D).
  A  09 — новый раздел «Стенд биллинга» (п.5 запроса): почему подписка
     ...; A2 — уроки тестовых запросов 2–6 (метка id мока, связь тестов
     через общую БД, ожидания секций BillingPage, демоны песочницы).
     висит в incomplete без webhook; почему без VITE_STRIPE_PUBLISHABLE_KEY
     страница уходит в dev-режим; чем стенд не равен Stripe.
  B  05 — дерево: tools/ (stripe-mock.mjs, stripe-emit.mjs, dev-billing.sh)
     и .env.local.example; пометка у тестов 6.1/6.2/7.1 об общем моке.

Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ; применённые правки не
редактируются — урок 8.1). Запуск из корня:
    python3 scripts/patch-docs-conv82.py
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


P05 = "docs/05-file-structure.md"
P09 = "docs/09-lessons.md"

# ── A. 09-lessons — раздел «Стенд биллинга» ──────────────────────────────

patch(
    P09,
    """### Беседа 7.1
- Проверка «в выводе нет ✗» ложно срабатывает на строке итога «0 ✗».
""",
    """### Беседа 7.1
- Проверка «в выводе нет ✗» ложно срабатывает на строке итога «0 ✗».

## 9. Стенд биллинга (беседа 8.2)

Оснастка: `tools/stripe-mock.mjs` (мок Stripe REST, вынесен из
test-61; те же шесть маршрутов + `/v1/products`, `/v1/prices` под 8.3),
`tools/stripe-emit.mjs` (отправщик webhook-событий), `tools/dev-billing.sh`
(мок → сервер :3000 → vite :5199, `.env.local` из `.env.local.example`,
заслон на `sk_live_`, `--stop` гасит группы процессов). Продуктовый код
стенд не правит; всё ниже — следствия решений 6.1/6.2, а не дефекты.

1. **Подписка висит в `incomplete`, пока не пришёл webhook.** Сервер
   создаёт Stripe Subscription в режиме `default_incomplete` (6.1): первый
   инвойс ждёт оплаты, клиенту уходит `client_secret` его PaymentIntent.
   Строку `user_subscriptions` в `active` переводит ТОЛЬКО
   `handleStripeWebhook` на `invoice.paid` (он же сбрасывает счётчики и
   ставит период из `lines[0].period`); у подписки, в отличие от
   пополнения, нет confirm-эндпоинта — оплату первого инвойса Stripe
   подтверждает сам и присылает событие. Мок событий не шлёт, оплачивать
   в нём некому, поэтому на стенде «ожидает оплаты» + «Обновить» — норма;
   активирует подписку `node tools/stripe-emit.mjs invoice.paid <sub_…>`,
   отмена по концу периода — `customer.subscription.deleted`. Неизвестный
   `sub_…` → 200 `{ handled:false }` и ничего не меняется — как у
   настоящего Stripe с неинтересным службе событием.
2. **Без `VITE_STRIPE_PUBLISHABLE_KEY` страница уходит в dev-режим.**
   `stripeConfigured()` (client/utils/stripe.ts) читает publishable key
   из env vite; пустой ключ → Stripe.js не грузится вовсе, Payment Element
   не монтируется, и после `POST /billing/topup` кнопка «Подтвердить
   платёж» зовёт `POST /billing/topup/confirm` напрямую (6.2). Сервер
   там перечитывает PaymentIntent у «Stripe» и зачисляет баланс только
   при `status === 'succeeded'` — поэтому мок стенда рождает PaymentIntent
   сразу `succeeded` (`STRIPE_MOCK_PI_STATUS`), а test-61 держит
   `requires_payment_method`, чтобы проверить отказ confirm неоплаченного.
   Задать publishable key на стенде нельзя: Stripe.js пойдёт в настоящий
   `api.stripe.com` с `client_secret` от мока и упадёт.
3. **Чем стенд не равен Stripe.** (а) 3-D Secure и прочие `requires_action`:
   у мока PaymentIntent не проходит состояний `requires_confirmation →
   requires_action → processing`, редиректов SCA нет — ветка
   `redirect:'if_required'` в BillingPage на стенде не исполняется никогда.
   (б) Идемпотентные ключи: настоящий Stripe дедуплицирует POST по
   заголовку `Idempotency-Key`; мок каждый POST считает новым (`pi_N`,
   `sub_N`), клиент 6.1 ключей и не шлёт — повтор запроса на стенде
   даёт второй объект, в Stripe — тот же. (в) Состояния invoice: мок
   отдаёт `latest_invoice` одним снимком, у него нет `draft → open → paid
   / uncollectible / void`, продлений периода, `invoice.payment_failed` и
   `past_due`; `invoice.paid` с любым периодом принимается, проверка
   «новый ли период» — только по `current_period_start` строки БД. (г)
   `customer.subscription.updated` мок не шлёт при `cancel_at_period_end`
   — флаг в БД ставит сам роут `/subscription/cancel`, событие лишь
   подтверждает. (д) Подпись webhook: при пустом `STRIPE_WEBHOOK_SECRET`
   вне production сервер её не проверяет — стенд этим пользуется; в
   production пустой секрет → 400 на любой webhook.
4. **Порты и сироты.** Сервер стенда только на :3000 (прокси vite зашит —
   §4, 5.4); vite на :5199 (как браузерные тесты). Демоны спавнятся
   `setsid` собственными группами и гасятся группой (`kill -- -pid`) —
   иначе tsx/vite оставляют сирот на портах (§4, 1.6/5.1/5.2); чужой
   процесс на порту скрипт не убивает, а называет.
5. **Общий мок в тестах.** test-61/62/71 импортируют
   `createStripeMock({ port, bearer, paymentIntentStatus })` из `tools/`;
   `stripeState` тестов = `mock.state` (pis/subs/customers/requests —
   объединение полей трёх копий: `requests` несёт и `auth`, и `form`).
   Свою копию мока новые беседы не заводят (8.3 — на этом же модуле).
""",
    "09 — раздел 9 «Стенд биллинга»",
)


# ── A2. 09 — уроки тестовых запросов 2–6 (отдельные patch(), применённый блок не правится) ──

patch(
    P09,
    """   Свою копию мока новые беседы не заводят (8.3 — на этом же модуле).
""",
    """   Свою копию мока новые беседы не заводят (8.3 — на этом же модуле).
6. **Счётчики мока против персистентной БД.** Пока три копии жили в своих
   тестах и каждая беседа шла в свежей песочнице, никто не замечал, что
   `cus_1`/`pi_1`/`sub_1` рождаются заново в каждом процессе, а
   `users.stripe_customer_id UNIQUE` (0003) их помнит: test-71 после
   test-62 на одной базе падал 500 внутри `ensureStripeCustomer` (23505 на
   `cus_1` от оставленного t62-пользователя). Мок ставит в id метку запуска
   (`pi_<метка>_N`; `idTag`/`STRIPE_MOCK_ID_TAG`/`--id-tag`, пустая — голые
   id); тесты на точные id не завязаны и не должны быть.
7. **Тесты 61/62/71 связаны через общую БД.** test-71 оставляет план
   `starter71` (на нём подписка анонимизированного пользователя — RESTRICT
   истории, убрать нельзя), test-62 требовал «ровно одну строку тарифов» —
   в порядке 71 → 62 падал. Проверки табличных строк — по имени, не по
   счёту; «как до выноса: 109/101/105» верно на любой БД только с этой
   поправкой.
8. **Секция подписки BillingPage грузится своим `GET /billing/subscription`**:
   ожидание «Загрузка… пропала» у секции ключа не гарантирует, что подписка
   отрисована — R8 test-62 флакал на `sub-absent`; ждать нужно каждую
   секцию отдельно. Баланс проверять по `balance-value`: в секции есть
   кнопка «Пополнить на $5.00», и регексп по всему блоку зеленел до confirm.
9. **Демоны песочницы гибнут между ходами и во время длинного хода**: PG
   умер, пока test-82 стартовал (ECONNREFUSED 5432 до первой проверки) —
   перед КАЖДЫМ прогоном `pg_ctlcluster 16 main start` (снимает stale pid) +
   `redis-server --daemonize yes --save ''`.
""",
    "09 §9: уроки запросов 2–6 (п.6–9)",
)

# ── B. 05-file-structure ─────────────────────────────────────────────────

patch(
    P05,
    """│                                   # и ключи API), dump.rdb, архивы
├── .env.example                    # ВСЕ переменные server/env.ts;
""",
    """│                                   # и ключи API), dump.rdb, архивы
├── .env.local.example              # 8.2: окружение ЛОКАЛЬНОГО СТЕНДА биллинга
│                                   # (мок Stripe, фиктивные ключи, BILLING_ENFORCE=true,
│                                   # пустой VITE_STRIPE_PUBLISHABLE_KEY); копируется в
│                                   # .env.local скриптом tools/dev-billing.sh
├── .env.example                    # ВСЕ переменные server/env.ts;
""",
    "05: .env.local.example",
)

patch(
    P05,
    """└── tests/                              # ВСЕ тесты бесед; запуск из корня репо
""",
    """├── tools/                              # 8.2: оснастка разработчика (не продукт, не тесты)
│   ├── stripe-mock.mjs                 # мок Stripe REST — модуль (createStripeMock) и процесс;
│   │                                   # вынесен из test-61, + /v1/products и /v1/prices под 8.3
│   ├── stripe-emit.mjs                 # отправщик webhook-событий invoice.paid /
│   │                                   # customer.subscription.updated|deleted (подпись при
│   │                                   # непустом STRIPE_WEBHOOK_SECRET)
│   └── dev-billing.sh                  # стенд: .env.local → мок → сервер :3000 → vite :5199;
│                                       # заслон sk_live_, --stop / --status, created/skip/fail
│
└── tests/                              # ВСЕ тесты бесед; запуск из корня репо
""",
    "05: каталог tools/",
)

patch(
    P05,
    """    ├── test-XX-*.mjs                   # API- и браузерные тесты запросов бесед (puppeteer)
""",
    """    ├── test-XX-*.mjs                   # API- и браузерные тесты запросов бесед (puppeteer);
    │                                   # test-61/62/71 берут мок Stripe из tools/stripe-mock.mjs (8.2)
""",
    "05: пометка об общем моке у тестов",
)

# ── C. Закрытие беседы 8.2 (2026-09-08) ─────────────────────────────────
P07 = "docs/07-conversation-protocol.md"
P08 = "docs/08-history.md"
P03 = "docs/03-specification.md"
PREADME = "README.md"

patch(
    P07,
    """- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 8.3: Тарифы — посев и заведение Prices в Stripe (бэкенд + скрипты)
""",
    """- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 8.2 (2026-09-08) — отступления от буквы запроса и найденное:**

1. **Третья копия мока — в `test-71`, а не в `test-81`.** Контекст 8.2 в
   NEXT-CONTEXT называл `tests/test-81-requests2-10.mjs`; у него мока Stripe
   нет вовсе («По факту 8.1» п.10), три копии жили в 61/62/71. Текст беседы в
   07 был верен.
2. **Строки «~174–214» мертвы.** Мок в test-61 стоял в 163–216; после выноса
   номеров нет. Ссылаться на имена — `createStripeMock`/`startStripeMock`
   (правило §10 от 2026-07-31), не на диапазоны.
3. **«Вынести без изменения поведения» — три копии различались.** test-61
   рождал PaymentIntent `requires_payment_method` и переводил в `succeeded`
   руками (проверка отказа confirm неоплаченного), 62/71 — сразу
   `succeeded`; 71 клал в PaymentIntent `customer`; 61 писал в `requests`
   `auth`, 71 — `form`. Модуль — надмножество: статус PaymentIntent
   параметром `paymentIntentStatus`, `customer` всегда, `requests` с `auth` и
   `form`. Проверки тестов на разницу не завязаны.
4. **«109 / 101 / 105, как до выноса» верно только на свежей БД.** На одной
   базе тесты связаны: test-62 оставляет пользователя с `stripe_customer_id =
   cus_1`, а мок в каждом процессе начинает счёт с `cus_1` → test-71 падал 500
   (23505 в `ensureStripeCustomer`, UNIQUE 0003); test-71 оставляет план
   `starter71` (RESTRICT — подписка анонимизированного), а test-62 требовал
   «ровно одну строку тарифов». Принято: мок ставит в id метку запуска
   (`pi_<метка>_N`, `--id-tag`/`STRIPE_MOCK_ID_TAG`, пустая — как было);
   test-62 ищет строку «Starter» по имени и ждёт «Загрузка…» у секции
   подписки отдельно (флак R8 — `GET /billing/subscription` свой запрос). В
   прошлых беседах не ловилось: каждая шла в свежей песочнице (09 §9 п.6–8).
5. **Мок расширен маршрутами 8.3 сверх шести:** `POST/GET /v1/products[/:id]`,
   `POST/GET /v1/prices[/:id]`, `GET /v1/prices?lookup_keys[]=…` (обе записи
   списка Stripe), `lookup_key` с отказом на дубликат и
   `transfer_lookup_key`. Грабля 09 §4 «хватает шести маршрутов» для 8.3
   устарела — ей нужны эти.
6. **Заслон `sk_live_` действует и на `--stop`:** окружение читается первым,
   поэтому под живым ключом скрипт отказывает целиком, поднятый стенд не
   трогает. Принято как поведение (test-82 R4).
7. **Подсказка о dev-режиме появляется ПОСЛЕ `POST /topup`** (внутри блока
   намерения), а не на странице сразу; 03 §2.10 «при пустом значении
   BillingPage работает в dev-режиме» читалось как «страница помечена» —
   уточнено там же. «Баланс вырос» проверять по `balance-value`: в секции есть
   кнопка «Пополнить на $5.00», грубый регексп зеленел до confirm.
8. **Тестовые запросы выполнены одним харнессом** `tests/test-82-requests2-6.mjs`
   (50 ✓ ×2, ~2,5 мин) против НАСТОЯЩЕГО `tools/dev-billing.sh`, не мимо
   него: стенд руками через puppeteer, заслон, emit с неизвестным id (200
   `handled:false`, строки те же) и с настоящим (`incomplete → active →
   canceled` — план заведён в БД руками, тарифы не сеялись), teardown с
   проверкой сирот. Первый прогон упал до проверок: PG умер между ходами
   (09 §1) — 09 §9 п.9.
9. **`npm run audit` в корне нет** — только `-w server` (как и
   `check:integration`); NEXT-CONTEXT называл его без воркспейса.
10. **Продуктовый код не тронут;** `server/integration-check.mts` — секция
   4ak (оснастка). Реестр долгов §12 пуст: ничего для стенда в продукте не
   понадобилось.

---

### Беседа 8.3: Тарифы — посев и заведение Prices в Stripe (бэкенд + скрипты)
""",
    "07: блок «По факту 8.2»",
)

patch(
    P07,
    """- `tools/stripe-mock.mjs` и `tools/stripe-emit.mjs` (из 8.2) — на них проверяется всё, что требует Stripe; своей копии мока НЕ заводить
- Исходник: НЕ НУЖЕН (в одностраничнике подписок нет)
""",
    """- `tools/stripe-mock.mjs` и `tools/stripe-emit.mjs` (из 8.2) — на них проверяется всё, что требует Stripe; своей копии мока НЕ заводить
- `tools/dev-billing.sh` (из 8.2) — стенд для проверки тарифов руками: зовёт `npm run seed:plans`, как только он появится; `tests/test-82-requests2-6.mjs` — образец харнесса против настоящего стенда; `.env.local.example` — переменные стенда (сюда — `STRIPE_PRICE_*`, если 8.3 их заведёт)
- Исходник: НЕ НУЖЕН (в одностраничнике подписок нет)
""",
    "07: контекст 8.3 += dev-billing / test-82 / .env.local.example",
)

patch(
    P07,
    """- §4, беседа 6.1 — моку Stripe хватает шести маршрутов и разбора `application/x-www-form-urlencoded` С КЛЮЧАМИ `a[b][c]`: `createProduct`/`createPrice` шлют вложенные формы
""",
    """- §4, беседа 6.1 — моку Stripe хватает шести маршрутов и разбора `application/x-www-form-urlencoded` С КЛЮЧАМИ `a[b][c]`: `createProduct`/`createPrice` шлют вложенные формы — с 8.2 УСТАРЕЛО в части «шести»: `/v1/products` и `/v1/prices` (`lookup_keys[]`, `transfer_lookup_key`) уже в `tools/stripe-mock.mjs` (09 §9); `recurring[interval]` разбирается тем же `parseForm`
""",
    "07: грабля 8.3 о шести маршрутах — пометка",
)

patch(
    P03,
    """> (env vite, `.env.example`); при пустом значении BillingPage работает в
> dev-режиме: `POST /topup` → кнопка «Подтвердить платёж» → `POST /topup/confirm`
> без Elements (мок Stripe отдаёт PaymentIntent `succeeded`).""",
    """> (env vite, `.env.example`); при пустом значении BillingPage работает в
> dev-режиме: `POST /topup` → кнопка «Подтвердить платёж» → `POST /topup/confirm`
> без Elements (мок Stripe отдаёт PaymentIntent `succeeded`). Подсказка о
> dev-режиме показывается только после `POST /topup`, внутри блока намерения
> (уточнено 8.2); проверять баланс — по `balance-value`.""",
    "03 §2.10: уточнение dev-режима (8.2)",
)

patch(
    P08,
    """tests/test-81-requests2-10.mjs 107 ✓ ×3 против живого сервера на отдельной
пустой БД + браузер; check:integration += 2z/4aj/5z; PageStub.tsx, лежавший в
HEAD вопреки 6.2/7.1, удалён); доки пропатчены scripts/patch-docs-conv81.py.
Реестр долгов §12 пуст.
""",
    """tests/test-81-requests2-10.mjs 107 ✓ ×3 против живого сервера на отдельной
пустой БД + браузер; check:integration += 2z/4aj/5z; PageStub.tsx, лежавший в
HEAD вопреки 6.2/7.1, удалён); доки пропатчены scripts/patch-docs-conv81.py.
Реестр долгов §12 пуст.
Беседа 8.2 (локальный стенд биллинга без Stripe — оснастка) ЗАКРЫТА 2026-09-08:
tools/stripe-mock.mjs (единый мок Stripe REST — модуль createStripeMock +
процесс; вынесен из test-61, три копии 61/62/71 сведены в надмножество;
+ /v1/products и /v1/prices с lookup_key под 8.3; метка запуска в id),
tools/stripe-emit.mjs (webhook-события invoice.paid / subscription.updated|
deleted, подпись при непустом STRIPE_WEBHOOK_SECRET), tools/dev-billing.sh
(мок → сервер :3000 → vite :5199, .env.local из .env.local.example, заслон
sk_live_, --stop/--status, setsid-группы, seed:plans условно), 09 §9 «Стенд
биллинга» (тесты 61/62/71 на общем моке — 109/101/105 ✓ ×2; tests/
test-82-requests2-6.mjs 50 ✓ ×2 против настоящего стенда с браузером;
check:integration += 4ak; продуктовый код не тронут); доки пропатчены
scripts/patch-docs-conv82.py. Реестр долгов §12 пуст.
""",
    "08 Часть I: строка 8.2",
)

patch(
    P08,
    """### Правка каталога философов (2026-09-07, после 7.1)
""",
    """### Беседа 8.2 — Локальный стенд биллинга без Stripe (оснастка) [ЗАКРЫТА 2026-09-08]

> Запрос 1 целиком (tools/stripe-mock.mjs + tools/stripe-emit.mjs + перевод
> test-61/62/71 на общий мок + .env.local.example + tools/dev-billing.sh +
> 09 §9) + все тестовые запросы R2–R6 одним заходом: прогоны 61/62/71 на
> общем моке (109 ✓ ×2 / 101 ✓ ×2 / 105 ✓) и tests/test-82-requests2-6.mjs
> (50 ✓ ×2 за ~2,5 мин: стенд руками через puppeteer-core 23 + Chrome против
> НАСТОЯЩЕГО dev-billing.sh, заслон, emit, teardown) + завершение: typecheck
> (все конфиги) 0, audit ✓, check:integration OK (+ 4ak). Продуктовый код
> (server/, client/) не менялся. Патчи к 9f15d6d выданы по ходу:
> philosynth-conv82-request1.patch, philosynth-conv82-requests1-6.patch,
> итоговый philosynth-conv82-full.patch.

**Сделано:**

- `tools/stripe-mock.mjs` — `createStripeMock({ port, bearer,
  paymentIntentStatus, idTag, verbose })` → `{ state, start(), stop() }` и
  CLI (`--port/--bearer/--pi-status/--id-tag/--verbose`, env
  `STRIPE_MOCK_PORT/SECRET_KEY/PI_STATUS/ID_TAG`). Шесть маршрутов 6.1/7.1
  дословно (`parseForm` `a[b][c]` тот же), `GET /__mock/health` без Bearer,
  под 8.3 — `POST/GET /v1/products[/:id]`, `POST/GET /v1/prices[/:id]`,
  `GET /v1/prices?lookup_keys[]=…&active&product` (обе записи списка),
  `lookup_key` с отказом на дубликат и `transfer_lookup_key`.
- `tools/stripe-emit.mjs` — `invoice.paid` (тело с `lines[0].period` — его
  читает `invoicePeriod`), `customer.subscription.updated|deleted`,
  `payment_intent.succeeded`; `--period-days/--status/--cancel-at-period-end/
  --dry-run`; подпись HMAC как `signWebhookPayload` при непустом секрете.
- test-61/62/71 — собственные копии мока удалены (−55/−53/−54 строк),
  `stripeState = mock.state`; различия копий сведены («По факту» п.3).
- `.env.local.example` + `tools/dev-billing.sh` (`start/--stop/--status/
  --verbose`; created/skip/fail; `.env.local` из образца; заслон `sk_live_`
  до любого действия; сервер строго :3000, vite :5199; демоны `setsid`
  собственными группами, гашение группой, чужие процессы на портах
  называются, не убиваются; `seed:plans` только если есть в package.json;
  напоминание `seed:admin`); `.dev-billing/` в `.gitignore`.
- `docs/09-lessons.md` §9 «Стенд биллинга» (п.1–9); 05 += `tools/`,
  `.env.local.example`; 03 §2.10 уточнение; 07 «По факту 8.2»; всё —
  `scripts/patch-docs-conv82.py` (идемпотентен).
- `server/integration-check.mts` — секция 4ak (единственность мока,
  импорты тестов, маршруты 8.3, метка id, подпись emit ≡ stripe-client,
  заслон/порт/обёртки dev-billing, пустой publishable key в образце).

**Найдено по ходу (детали — «По факту 8.2» в 07 и 09 §9 п.6–9):** счётчики
мока против UNIQUE `users.stripe_customer_id`; связь тестов 61/62/71 через
общую БД (`starter71`, t62-пользователь); флак R8 test-62; PG гибнет
посреди длинного хода.

**Для следующих бесед:**
- **8.3 (тарифы)**: `tools/stripe-mock.mjs` (маршруты products/prices уже
  есть — `createProduct/createPrice/listPrices` в stripe-client пишутся под
  них; своей копии не заводить), `tools/dev-billing.sh` (зовёт `npm run
  seed:plans`, как только тот появится), `.env.local.example`
  (`STRIPE_PRICE_*` — сюда), `tests/test-82-requests2-6.mjs` (образец
  харнесса против стенда; R5 показывает полный цикл подписки через
  `stripe-emit` на плане, заведённом руками — 8.3 заменяет ручной insert
  посевом).
- **Все стендовые беседы**: перед прогоном — `pg_ctlcluster 16 main start`
  + `redis-server --daemonize yes --save ''`; тесты на общей БД не должны
  считать строки таблиц «ровно N» и завязываться на точные id мока.

---

### Правка каталога философов (2026-09-07, после 7.1)
""",
    "08 Часть II: глава 8.2",
)

patch(
    PREADME,
    """| 8 — пусковая пригодность | 8.1–8.5 | открыта 2026-09-08; 8.1 закрыта 2026-09-08 |
""",
    """| 8 — пусковая пригодность | 8.1–8.5 | открыта 2026-09-08; 8.1, 8.2 закрыты 2026-09-08 |
""",
    "README: таблица фаз — 8.2 закрыта",
)

# ── D. NEXT-CONTEXT — ПЕРЕЗАПИСЬ под беседу 8.3 (07 §10: не дописывать) ──

NEXT_CONTEXT = """# NEXT-CONTEXT — контекст ближайшей беседы

Рабочий файл, а не архив: **перезаписывается** при завершении беседы,
а не дописывается. История — `docs/08-history.md`, грабли и уроки —
`docs/09-lessons.md`, протокол — `docs/07-conversation-protocol.md`.

До 2026-09-07 сюда складывались итоги всех бесед подряд (4946 строк,
371 КБ). Они целиком переехали в `docs/08-history.md` (Часть II) и
`docs/09-lessons.md`. Здесь остались два правила, которые не стареют,
и комплект следующей беседы.

## Состояние на 2026-09-08

Фазы 0–7 закрыты, реестр долгов 07 §12 пуст. Фаза 8 «Пусковая
пригодность» ОТКРЫТА: 8.1 (администратор) и 8.2 (локальный стенд
биллинга — оснастка) ЗАКРЫТЫ 2026-09-08 — см. «По факту 8.1» / «По факту
8.2» в 07 и главы 8.1 / 8.2 в 08. Ближайшая беседа — 8.3 (тарифы: посев и
заведение Prices в Stripe); тарифы проверяются на моке `tools/stripe-mock.mjs`
и стенде `tools/dev-billing.sh` из 8.2. Беседы 8.4 (управление своим
содержимым) и 8.5 (родословная при импорте) независимы от всех прочих —
порядок любой. Тексты — `07` §8, узлы графа — `07` §11.

## Универсальный минимум любой серверной беседы

- `server/db/schema.ts` — 29 таблиц (с 8.1: + admin_audit), единственный
  источник структуры БД
- `server/db/index.ts` — db/sql/closeDb (нужен всем сервисам)
- `server/env.ts` — типизированные env (нужен при касании конфигурации)
- `server/package.json`, `packages/shared/package.json`,
  `tsconfig.base.json` + tsconfig'и — при любых новых файлах/зависимостях
  (иначе беседа пересоздаст workspace по-своему)

## В завершение КАЖДОЙ беседы (регрессионные инструменты)

- `server/audit.mts` (`npm run audit -w server` — в корне скрипта нет) —
  schema↔types↔constants
- `server/integration-check.mts` (`npm run check:integration -w server`) —
  импорты/экспорты/async; расширять списком новых модулей беседы
  (8.1 — секции 2z/4aj/5z; 8.2 — 4ak; следующая серия — 2aa/4al/5aa).
  Требует посевов prompts/configs/taxonomy в рабочей БД и живого Redis;
  ≈ 100 с — в фоне (`setsid nohup … &` + `sleep`).
- Перед любым прогоном в песочнице — `pg_ctlcluster 16 main start` (снимает
  stale pid) + `redis-server --daemonize yes --save ''`: демоны гибнут и между
  ходами, и посреди длинного хода (09 §1, §9 п.9).

## Комплект ближайшей беседы — 8.3 (тарифы)

Сверх универсального минимума выше (schema.ts, db/index.ts, env.ts,
package.json + tsconfig'и):

- документы 01–05 целиком + `docs/09-lessons.md` целиком (07 §10; §9
  «Стенд биллинга» — обязательно: мок, стенд, связь тестов через общую БД);
  06 в беседу НЕ грузится — он для подготовительного шага;
  из 07 — §1, §9–12, врезка «Фаза 8», текст 8.3 и блоки «По факту 6.1»,
  «По факту 7.1», «По факту 8.1», «По факту 8.2»; из 08 — главы 6.1, 6.2,
  7.1, 8.1, 8.2;
- `server/services/subscription-service.ts` (6.1/7.1 — планы,
  ensureStripeCustomer), `server/services/stripe-client.ts` (6.1 — тонкий
  REST-клиент; сюда добавляются `createProduct`/`createPrice`/`listPrices`
  под маршруты, которые мок 8.2 УЖЕ отдаёт: `POST /v1/products`, `POST
  /v1/prices` (`recurring[interval]`, `lookup_key`, `transfer_lookup_key`),
  `GET /v1/prices?lookup_keys[]=…`), `server/services/billing-service.ts`
  (потребитель планов);
- `server/routes/billing.ts` (GET /billing/plans — потребитель посева);
- `scripts/seed-taxonomy.ts` и `scripts/bootstrap-admin.ts` — образцы
  идемпотентных скриптов (created/updated/skip/fail, заслон, 23505 через
  `err.cause.code`); `scripts/seed-configs.ts` — `canonical()` для сверки
  jsonb;
- `server/services/admin-audit.ts` (8.1) — если посев/правка тарифов
  оставляет след: `writeAudit(tx, …)` той же транзакцией, `ADMIN_ACTIONS`
  расширяется без миграции (замороженная константа + union
  `shared/types/admin.ts`);
- `client/pages/BillingPage.tsx`, `client/api/subscription.ts` — потребитель
  тарифов в UI;
- оснастка 8.2: `tools/stripe-mock.mjs` (единственный мок Stripe — своей
  копии НЕ заводить; `createStripeMock({ port, bearer, paymentIntentStatus,
  idTag })`, `mock.state.products/prices` для проверок), `tools/stripe-emit.mjs`
  (активация подписки на стенде — `invoice.paid <sub_…>`),
  `tools/dev-billing.sh` (зовёт `npm run seed:plans`, как только он появится
  в package.json — сейчас предупреждает о пустом разделе подписки),
  `.env.local.example` (переменные стенда; `STRIPE_PRICE_*` — сюда),
  `tests/test-82-requests2-6.mjs` (харнесс против настоящего стенда с
  браузером; R5 — полный цикл подписки через emit на плане, заведённом
  руками: 8.3 заменяет ручной insert посевом) и `tests/test-61-requests2-11.mjs`
  (R7 — планы/подписки на моке, API);
- `tests/test-81-requests2-10.mjs` — стенд на отдельной пустой БД с
  `drizzle-kit migrate`, если посев проверять на чистой базе.

Исходник `philosynth.html` не нужен: беседа целиком новая.

## Что 8.2 оставила 8.3 знать

- Мок ставит в id метку запуска (`pi_<метка>_N`, `cus_…`, `sub_…`,
  `prod_…`, `price_…`): на точные id не завязываться, `--id-tag ""` даёт
  голые `pi_1` только для ручной отладки.
- Тесты на общей БД связаны: не считать строки таблиц «ровно N»
  (test-71 оставляет план `starter71`, test-62 — пользователя с
  `stripe_customer_id`); уборка планов упирается в RESTRICT-историю
  подписок — сеять под уникальными `name`, искать по имени.
- Секции BillingPage грузятся своими запросами (`GET /billing/subscription`
  отдельно от ключа и баланса): в браузерных тестах ждать каждую секцию;
  баланс — по `balance-value`, подсказка о dev-режиме — только после
  `POST /topup`.
- Роли — две; `admin` достижим только через `npm run seed:admin`
  (BOOTSTRAP_ADMIN_EMAIL/PASSWORD из env). Стендам проще `UPDATE users SET
  role='admin'` (как test-71) либо дочерний запуск bootstrap с
  `DATABASE_URL` стенда (как test-81).
- Каждое админ-действие — строка `admin_audit`; `TRUNCATE users CASCADE`
  снесёт и журнал.
"""

def rewrite_next_context() -> None:
    global applied, skipped
    path = ROOT / "NEXT-CONTEXT.md"
    if path.exists() and path.read_text(encoding="utf-8") == NEXT_CONTEXT:
        skipped += 1
        print("  skip  NEXT-CONTEXT.md под 8.3")
        return
    path.write_text(NEXT_CONTEXT, encoding="utf-8")
    applied += 1
    print("  ok    NEXT-CONTEXT.md ПЕРЕЗАПИСАН под 8.3")

rewrite_next_context()

print(f"\napplied={applied} skip={skipped} fail={failed}")
raise SystemExit(1 if failed else 0)
