#!/usr/bin/env python3
"""Патч документации по итогам беседы 6.1 (Billing Service + API Key
Management, бэкенд).

Закрывает дыры, найденные при исполнении беседы (2026-09-06):
  A  07 — запись ревизии в шапке.
  B  07 — глава «По факту 6.1» после текста беседы (носитель решения —
     ручка слота; учёт в streamSection через разъём; квота один раз на
     операцию; BILLING_ENFORCE; порог резерва вместо estimatedCost;
     наценка; тонкий Stripe-клиент; один активный BYO-ключ; первая
     версия шаблона — черновик; RESTRICT/SET NULL истории; per-session
     rate-limit; грабли стенда).
  C  07 6.1 — текст запроса: ENCRYPTION_KEY → API_KEY_ENCRYPTION_SECRET,
     п.5 «списание в streamSection» дополнен решением о квотах, состав
     ретрофита middleware приведён к факту (11 роутов), тест «баланс
     $0.001» уточнён порогом.
  D  07 §12 — долги BYO-Key, per-user rate-limit, warmCache, учёт
     обогащений ЗАКРЫТЫ 6.1; новые: users.stripe_customer_id (6.2/схема),
     точная оценка для гейта POST /syntheses (6.2), удаление пользователя с
     финансовой историей (не специфицировано), форма ключа в PauseModal —
     остаётся 6.2.
  E  03 — §2.10: POST /api-key { key } (encryptedKey — синоним), topup
     отдаёт paymentIntentId/amountUsd, /usage отдаёт byMode, webhook вне
     сессии, STRIPE_UNAVAILABLE 503; §4.3: различие INSUFFICIENT_BALANCE /
     BILLING_REQUIRED / QUOTA_EXCEEDED и порог; §1.11 B4/B6/B7/B8 —
     СДЕЛАНО 6.1; §2.9 — первая версия нового ключа создаётся черновиком.
  F  05 — stripe-client.ts, пометки «СДЕЛАНО 6.1», миграция 0002.
  G  04 — ФАКТ-строки billing-check / billing-service / api-key-service;
     исправление ключей режимов mode.{…} (без .prompt).
  H  01 §6 — факты: квота на операцию, BILLING_ENFORCE, порог резерва,
     учёт каждого вызова Claude в api_usage; стек — тонкий клиент Stripe.
  I  02 §2.20–2.21 — ON DELETE SET NULL (миграция 0002) + примечание о
     RESTRICT по user_id и отсутствии stripe_customer_id.
  J  README — статус: 6.1 закрыта.

Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patch-docs-conv61.py
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
P07 = "docs/07-conversation-protocol.md"

# ── A. 07 — шапка ────────────────────────────────────────────────────────
patch(P07,
"# PhiloSynth Service — Протокол бесед\n\n> **Правки 2026-09-06 (итоги беседы 5.5)**",
"""# PhiloSynth Service — Протокол бесед

> **Правки 2026-09-06 (итоги беседы 6.1)**: Billing Service + API Key
> Management закрыт (запрос 1 + смоук tests/smoke-61-request1.mjs 54 ✓ +
> все тестовые запросы tests/test-61-requests2-11.mjs 109 ✓ против живого
> сервера с BILLING_ENFORCE=true, моком Claude SSE и моком Stripe REST;
> check:integration += 2w/4ag/5x). Дыры, закрытые этим патчем (глава
> «По факту 6.1»): носитель решения биллинга — ручка generation-слота
> (`handle.billing`), а не middleware; учёт каждого вызова Claude — разъём
> `setStreamUsageRecorder` в streamSection; квота подписки потребляется
> ОДИН раз на операцию при взятии слота (п.5 текста запроса «на каждый
> usage» противоречил квоте «синтезов»); режим `BILLING_ENFORCE` (без него
> 20 стендов бесед 1.4–5.5 требовали бы пополнения); гейт баланса —
> порог `BILLING_MIN_RESERVE_USD` (точной оценки у middleware нет);
> `api_usage`/`transactions.synthesis_id` → ON DELETE SET NULL (миграция
> 0002 — иначе DELETE оплаченного синтеза падал на FK); имя поля
> `encryptedKey` в 03 §2.10 (клиент шлёт открытый ключ — принято `key`,
> `encryptedKey` синоним); ключи шаблонов режимов в 04 — `mode.{…}` без
> `.prompt`; долги §12 BYO-Key / per-user rate-limit / warmCache / учёт
> обогащений закрыты.

> **Правки 2026-09-06 (итоги беседы 5.5)**""",
"A: 07 — шапка")

# ── B. 07 — «По факту 6.1» ───────────────────────────────────────────────
patch(P07,
"""**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 6.2: Billing UI + Admin Prompts Page (клиент)""",
"""**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 6.1 (2026-09-06) — отступления от буквы первого запроса:**

1. **Носитель решения биллинга — ручка generation-слота.** Все операции
   с Claude (генерация, resume, регенерации, планы, режимы, обогащения,
   трансформации) проходят через `withGenerationSlot(synthesisId, userId,
   fn, { quota, units, estimatedCostUsd })`; под слотом вызывается
   `resolveBilling(userId, { quota, units, consume: true })` →
   `handle.billing = { billingMode, apiKey, subscriptionId?, enforced }`.
   Все бывшие `env.anthropic.apiKey` (11 точек TODO(6.1)) заменены на
   `handle.billing.apiKey` — BYO-Key закрыт одной точкой без смены
   сигнатур. Middleware `billing-check` — ПРЕДПРОВЕРКА на HTTP-границе
   (403 с кодами §4.3 до создания строк; `consume:false`), слот — гейт и
   для WS (`start_*` без оплаты → `stream_error` с кодом). Гонка
   «middleware пропустил, слот отказал» допустима — принцип
   `assertCanStartGeneration` 1.4; сама `assertCanStartGeneration` больше
   не проверяет серверный ключ (это `API_KEY_MISSING` резолвера).
2. **Учёт каждого вызова Claude — в `streamSection`** через разъём
   `setStreamUsageRecorder` (регистрирует billing-service побочным
   эффектом импорта, как `setModeRegenerator` 4.1); контекст
   `opts.billing` подставляют `streamWithRetries` и главный цикл из ручки
   слота (`billingContextOf`). Учитывается и `max-tokens` (токены
   потрачены). 'balance' → `chargeUsage`; 'subscription'/'byo' →
   `recordApiUsage`. Разъём `setUsageRecorder` 5.3 остаётся no-op — иначе
   двойной учёт обогащений; долг §12 «учёт обогащений» закрыт этим путём.
3. **Квота потребляется ОДИН раз на операцию** при взятии слота
   (`consumeQuota` — атомарный `UPDATE … WHERE used + n <= quota`, гонка
   двух стартов не пробивает квоту), а не на каждый вызов Claude: синтез
   из восьми разделов стоил бы восемь синтезов. Соответствие:
   synthesis → `syntheses`; регенерация раздела/подраздела/добавление и
   трансформация 5.5 → `regenerations`; план → `regenerations` × число
   подтверждённых шагов с вызовом Claude (`countBillableSteps`, delete
   бесплатно, каскад-дописки не предоплачиваются); режим и тихая
   перегенерация режима → `modes`; обогащение/обоснование →
   `enrichments`; resume/продолжение после паузы → без квоты
   (`quota:null`, режим и ключ определяются заново).
4. **`BILLING_ENFORCE`** (env; дефолт true в production, иначе false):
   без принуждения при отсутствии источника оплаты операция идёт
   серверным ключом в режиме 'balance' и списывается с баланса, который
   уходит в минус (учёт честный, гейта нет) — иначе двадцать стендов
   бесед 1.4–5.5 (пользователи с нулевым балансом, мок Claude)
   потребовали бы пополнения. Тесты 6.1 гоняются с `BILLING_ENFORCE=true`.
5. **Гейт баланса — порог `BILLING_MIN_RESERVE_USD`** (дефолт $0.05), а
   не estimatedCost: точная оценка есть только у POST /syntheses и
   вычисляется ПОСЛЕ разбора тела (middleware стоит до). Различие кодов:
   баланс > 0, но ниже порога → `INSUFFICIENT_BALANCE`
   (details.balanceUsd/requiredUsd); подписка есть, квота исчерпана,
   баланса нет → `QUOTA_EXCEEDED` (details.quotaType/used/quota); ничего
   нет → `BILLING_REQUIRED`. Списание — по факту после usage, баланс
   может уйти в минус на одну операцию (pre-check — порог).
6. **Стоимость.** `api_usage.cost_usd` — себестоимость по ставкам
   оценщика (`PRICE_IN`/`PRICE_OUT`, та же формула, что `bumpTotals`);
   `transactions.amount_usd` для 'usage' — себестоимость ×
   `BILLING_MARKUP` (01 §6 «по себестоимости API + наценка»). В
   `GET /usage` totals.costUsd НЕ включает строки 'byo' (02 §2.21),
   добавлен `byMode`.
7. **Stripe — тонкий fetch-клиент `stripe-client.ts`** (05 его не
   называл, 01 писал «Stripe SDK»): шесть вызовов + проверка подписи
   webhook (HMAC `t.body`, допуск 300 с); база API подменяется
   `STRIPE_API_BASE` (мок в тестах). Пустой `STRIPE_SECRET_KEY` →
   пополнение/подписка отвечают 503 `STRIPE_UNAVAILABLE`, BYO и баланс
   работают. Пустой `STRIPE_WEBHOOK_SECRET` — подпись не проверяется
   только вне production. Webhook — без сессии, читает сырое тело,
   отвечает 200 и на необработанные события. `users.stripe_customer_id` в
   02 нет — Customer создаётся на каждую подписку с metadata.userId
   (долг §12 → 6.2/схема). Ретрай Stripe того же периода счётчики не
   сбрасывает (`already_current`).
8. **BYO-ключ: активный ОДИН** — новый деактивирует прежние (история
   остаётся `is_active=false`); формат валидируется (`sk-ant-…`, ≥20,
   без пробелов), живость — первым стримом (auth-пауза). Шифрование
   AES-256-GCM, ключ выводится SHA-256 из `API_KEY_ENCRYPTION_SECRET`
   (имя из env.ts 0.1; текст запроса писал `ENCRYPTION_KEY`), упаковка
   iv‖tag‖ciphertext в одну BYTEA-колонку. Тело POST /api-key принимает
   `key` (текст 6.1) и `encryptedKey` (03 §2.10) как синонимы.
9. **Реестр (03 §2.9):** `createVersion`/`createConfigVersion` создают
   черновик (`is_active=false`) — и для ПЕРВОЙ версии нового ключа (без
   ревью активный шаблон не появляется); `activateConfigVersion` — зеркало
   `activateVersion` со сбросом `config_cache`. `warmCache` подключён в
   index.ts (долг §12 0.3).
10. **Схема (миграция `0002_billing_history_set_null`):**
    `api_usage.synthesis_id` и `transactions.synthesis_id` → ON DELETE SET
    NULL — иначе DELETE /syntheses/:id оплаченного синтеза падал бы на FK
    (500). По `user_id` обе таблицы остаются RESTRICT (02): удаление
    пользователя с финансовой историей блокируется — процедура удаления
    аккаунта не специфицирована (долг §12).
11. **Per-user rate-limit (долг §12 1.6):** идентичность лимитера —
    userId (если уже есть), иначе SHA-256 cookie-сессии (лимитер стоит
    ДО requireAuth и в БД не ходит; сессия ≡ пользователю в Lucia-модели;
    разные сессии одного пользователя считаются раздельно — принято),
    иначе IP.
12. **Грабли стенда:** PG/Redis не переживают паузу между ходами —
    поднимать перед прогоном; полный прогон test-61 ≈ 3,5 мин —
    запускать в фоне с логом; уборка следов идёт `user_subscriptions →
    subscription_plans`, `api_usage/transactions → users` (FK); ключи
    шаблонов режимов — `mode.adversarial` (04 писал `mode.{…}.prompt`).

---

### Беседа 6.2: Billing UI + Admin Prompts Page (клиент)""",
"B: 07 — «По факту 6.1»")

# ── C. 07 — текст запроса 6.1 ───────────────────────────────────────────
patch(P07,
"     a. Шифрование AES-256-GCM (ключ из env ENCRYPTION_KEY)",
"     a. Шифрование AES-256-GCM (ключ из env API_KEY_ENCRYPTION_SECRET —\n"
"        имя закреплено env.ts 0.1; текст ранее писал ENCRYPTION_KEY)",
"C1: 07 6.1 — имя секрета")

patch(P07,
"""- «Протестируй недостаток баланса: баланс $0.001, попытка генерации exhaustive — ошибка INSUFFICIENT_BALANCE»""",
"""- «Протестируй недостаток баланса: баланс $0.001, попытка генерации exhaustive — ошибка INSUFFICIENT_BALANCE» (ФАКТ 6.1: порог — `BILLING_MIN_RESERVE_USD`, баланс 0 → `BILLING_REQUIRED`; строка синтеза не создаётся — middleware до INSERT)""",
"C2: 07 6.1 — тест недостатка баланса")

# ── D. 07 §12 ───────────────────────────────────────────────────────────
patch(P07,
"| BYO-Key (ключ пользователя вместо env) | 6.1 | 1.4 | в тексте 6.1; точки замены — все `env.anthropic.apiKey` с меткой TODO(6.1): generation-service, mode-service, element-enrichment (5.3), representation-transformer (5.5) |",
"| BYO-Key (ключ пользователя вместо env) | 6.1 | 1.4 | ЗАКРЫТ 6.1 (2026-09-06): все 11 точек `env.anthropic.apiKey` → `handle.billing.apiKey` (решение `resolveBilling` под слотом; см. «По факту 6.1» п.1); 4ag сторожит невозврат `env.anthropic.apiKey` в сервисы |",
"D1: §12 BYO-Key закрыт")

patch(P07,
"| Per-user HTTP-лимитирование (подсчёт после auth; сейчас фактически per-IP — 03 §3.4) | 6.1 | 1.6 | внесён 2026-08-02 |",
"| Per-user HTTP-лимитирование (подсчёт после auth; сейчас фактически per-IP — 03 §3.4) | 6.1 | 1.6 | ЗАКРЫТ 6.1 (2026-09-06): идентичность лимитера — SHA-256 cookie-сессии до auth (≡ пользователю в Lucia-модели), иначе IP («По факту 6.1» п.11) |",
"D2: §12 per-user rate-limit закрыт")

patch(P07,
"| Прогрев кэша Prompt Registry при старте (`warmCache` реализован в 0.3, в index.ts не подключён) | 6.1 | 0.3 | внесён 2026-09-02 (п.19) |",
"| Прогрев кэша Prompt Registry при старте (`warmCache` реализован в 0.3, в index.ts не подключён) | 6.1 | 0.3 | ЗАКРЫТ 6.1 (2026-09-06): `void warmCache()` в index.ts после connectRedis, fail-open с логом |",
"D3: §12 warmCache закрыт")

patch(P07,
"| Учёт обогащений в биллинге (api_usage + used_enrichments; разъём в 5.3, наполнение — после 6.1) | 6.1 | 5.3 | внесён 2026-09-02 (п.10); разъём `setUsageRecorder` (element-enrichment) СДЕЛАН 5.3 (2026-09-04), контекст несёт userId/synthesisId/streamKey/usage с посчитанной стоимостью |",
"| Учёт обогащений в биллинге (api_usage + used_enrichments; разъём в 5.3, наполнение — после 6.1) | 6.1 | 5.3 | ЗАКРЫТ 6.1 (2026-09-06) ИНЫМ ПУТЁМ: api_usage пишет универсальный разъём streamSection (`setStreamUsageRecorder`), `used_enrichments` потребляется при взятии слота (`quota: \"enrichments\"`); разъём `setUsageRecorder` 5.3 остаётся no-op (иначе двойной учёт) |\n"
"| `users.stripe_customer_id` — в 02 нет; Stripe Customer создаётся на каждую подписку (metadata.userId); добавить колонку и переиспользовать Customer (и для topup) | 6.2 | 6.1 | внесён 2026-09-06 |\n"
"| Точная оценка стоимости для гейта POST /syntheses (сейчас порог `BILLING_MIN_RESERVE_USD`; оценка вычислима роутом после разбора тела — сверять с балансом там) | 6.2 | 6.1 | внесён 2026-09-06 |\n"
"| Процедура удаления аккаунта с финансовой историей (`api_usage`/`transactions.user_id` — RESTRICT по 02; DELETE /auth/me не специфицирован) | 6.2 | 6.1 | внесён 2026-09-06 |",
"D4: §12 учёт обогащений закрыт + новые долги")

# ── E. 03 ───────────────────────────────────────────────────────────────
patch(P03,
"""GET    /billing/usage           ?from=2026-01-01&to=2026-04-01&synthesisId=...
                                → { entries: ApiUsage[], totals: UsageTotals }

POST   /billing/api-key         { encryptedKey: string }
                                → { keyId: string, prefix: string }""",
"""GET    /billing/usage           ?from=2026-01-01&to=2026-04-01&synthesisId=...
                                → { entries: ApiUsage[], totals: UsageTotals,
                                   byMode: Record<BillingMode, UsageTotals> }
                                // ФАКТ 6.1: totals.costUsd без строк 'byo'
                                // (02 §2.21); невалидные from/to/synthesisId
                                // → 400 VALIDATION_ERROR

POST   /billing/api-key         { key: string }
                                → { keyId: string, prefix: string }   // 201
                                // ФАКТ 6.1: клиент шлёт ОТКРЫТЫЙ ключ по TLS,
                                // шифрует сервер (AES-256-GCM); прежнее имя
                                // поля encryptedKey принимается как синоним.
                                // Формат sk-ant-…, ≥20 симв. → иначе 400.
                                // Активный ключ ОДИН — новый деактивирует прежние""",
"E1: 03 §2.10 usage/api-key")

patch(P03,
"""POST   /billing/topup           { amountUsd: number }
                                → { clientSecret: string }
                                // Stripe PaymentIntent""",
"""POST   /billing/topup           { amountUsd: number }   // 1 ≤ amountUsd ≤ 1000
                                → { clientSecret: string, paymentIntentId: string,
                                   amountUsd: number }
                                // Stripe PaymentIntent; Stripe не настроен →
                                // 503 STRIPE_UNAVAILABLE (ФАКТ 6.1)""",
"E2: 03 §2.10 topup")

patch(P03,
"""POST   /billing/webhook          (Stripe webhook endpoint)
                                // invoice.paid → сброс счётчиков при новом периоде""",
"""POST   /billing/webhook          (Stripe webhook endpoint; БЕЗ сессии — единственный
                                // роут /billing вне requireAuth; подпись Stripe-Signature
                                // по СЫРОМУ телу; 400 WEBHOOK_SIGNATURE_INVALID; 200
                                // { received, handled, action? } и на необработанные)
                                // invoice.paid → сброс счётчиков при новом периоде
                                //   (ретрай того же периода — already_current)""",
"E3: 03 §2.10 webhook")

patch(P03,
"""| B4 | Баланс сервиса (pay-as-you-go): пополнение, списание, история транзакций | Фаза 6 |
| B6 | Подписки (Stripe Subscriptions): тарифные планы, квоты, управление подпиской | Фаза 6 |
| B7 | Приоритет биллинга: BYO-Key → подписка → баланс → ошибка | Фаза 6 |
| B8 | Webhook Stripe: обработка invoice.paid, subscription.updated/deleted | Фаза 6 |
| B5 | Rate limiting по пользователю | MVP |""",
"""| B4 | Баланс сервиса (pay-as-you-go): пополнение, списание, история транзакций | Фаза 6 — сервер СДЕЛАН 6.1 (2026-09-06), UI — 6.2 |
| B6 | Подписки (Stripe Subscriptions): тарифные планы, квоты, управление подпиской | Фаза 6 — сервер СДЕЛАН 6.1 (квота потребляется один раз на операцию при взятии слота), UI — 6.2 |
| B7 | Приоритет биллинга: BYO-Key → подписка → баланс → ошибка | Фаза 6 — СДЕЛАНО 6.1 (`resolveBilling`: middleware — предпроверка, generation-слот — гейт для HTTP и WS; `BILLING_ENFORCE=false` вне production — режим balance в долг) |
| B8 | Webhook Stripe: обработка invoice.paid, subscription.updated/deleted | Фаза 6 — СДЕЛАНО 6.1 |
| B5 | Rate limiting по пользователю | MVP — per-IP с 0.2; per-session (≡ per-user) с 6.1 |""",
"E4: 03 §1.11 статусы")

patch(P03,
"""INSUFFICIENT_BALANCE — недостаточно средств (режим «баланс сервиса»)""",
"""INSUFFICIENT_BALANCE — недостаточно средств (режим «баланс сервиса»): баланс > 0,
                       но ниже порога BILLING_MIN_RESERVE_USD (ФАКТ 6.1; details:
                       balanceUsd, requiredUsd)""",
"E5: 03 §4.3 INSUFFICIENT_BALANCE")

patch(P03,
"""QUOTA_EXCEEDED      — исчерпана квота подписки (тип квоты в details)
BILLING_REQUIRED    — нет ни ключа, ни подписки, ни баланса""",
"""QUOTA_EXCEEDED      — исчерпана квота подписки (тип квоты в details) И баланса
                      нет (при балансе ≥ порога — fallback на balance); details:
                      quotaType, used, quota (ФАКТ 6.1)
BILLING_REQUIRED    — нет ни ключа, ни подписки, ни баланса (баланс = 0)
STRIPE_UNAVAILABLE  — Stripe не настроен (STRIPE_SECRET_KEY пуст) — 503 у
                      пополнения/подписки (6.1)
WEBHOOK_SIGNATURE_INVALID — подпись Stripe webhook не сходится — 400 (6.1)""",
"E6: 03 §4.3 QUOTA_EXCEEDED/BILLING_REQUIRED + новые коды")

patch(P03,
"""POST   /prompts/:key            { body: string, description?: string }
                                → { template: PromptTemplate }
                                // Создаёт новую версию (не активную)""",
"""POST   /prompts/:key            { body: string, description?: string }
                                → { template: PromptTemplate }   // 201
                                // Создаёт новую версию (не активную) — и для
                                // ПЕРВОЙ версии нового ключа (ФАКТ 6.1: без
                                // ревью активный шаблон не появляется);
                                // пустое body → 400; ключ [A-Za-z0-9._:-]""",
"E7: 03 §2.9 черновик")

# ── F. 05 ───────────────────────────────────────────────────────────────
patch(P05,
"""│   │   ├── billing-service.ts          # Stripe PaymentIntents, транзакции, проверка баланса
│   │   ├── subscription-service.ts    # Stripe Subscriptions: планы, квоты, счётчики, webhook
│   │   │
│   │   ├── api-key-service.ts          # Шифрование/дешифрование, проксирование (НОВОЕ)""",
"""│   │   ├── billing-service.ts          # Stripe PaymentIntents, транзакции, проверка баланса
│   │   │                               # (СДЕЛАНО 6.1: + resolveBilling — единый резолвер
│   │   │                               #  приоритета, + recordStreamUsage — рекордер
│   │   │                               #  разъёма streaming-manager)
│   │   ├── subscription-service.ts    # Stripe Subscriptions: планы, квоты, счётчики, webhook
│   │   │                               # (СДЕЛАНО 6.1: + consumeQuota — атомарная проверка+инкремент)
│   │   ├── stripe-client.ts            # Тонкий fetch-клиент Stripe REST + проверка подписи
│   │   │                               # webhook; STRIPE_API_BASE для мока (НОВОЕ 6.1, без SDK)
│   │   │
│   │   ├── api-key-service.ts          # Шифрование/дешифрование, проксирование (НОВОЕ)
│   │   │                               # (СДЕЛАНО 6.1: активный ключ один)""",
"F1: 05 services")

patch(P05,
"""│   │   ├── prompts.ts                  # Admin: CRUD prompt_templates, synthesis_configs
│   │   │                               # (создаёт беседа 6.1 — до 2026-07-30""",
"""│   │   ├── prompts.ts                  # Admin: CRUD prompt_templates, synthesis_configs
│   │   │                               # (СДЕЛАНО 6.1: 8 эндпоинтов §2.9, requireAdmin)
│   │   │                               # (создаёт беседа 6.1 — до 2026-07-30""",
"F2: 05 routes/prompts")

patch(P05,
"│   │   ├── billing.ts                  # API keys, topup, transactions, usage\n",
"│   │   ├── billing.ts                  # API keys, topup, transactions, usage (СДЕЛАНО 6.1:\n"
"│   │   │                               #  13 эндпоинтов §2.10; /webhook вне requireAuth)\n",
"F3: 05 routes/billing")

patch(P05,
"│   │   └── crypto.ts                   # AES-256 шифрование API-ключей\n",
"│   │   └── crypto.ts                   # AES-256-GCM шифрование API-ключей (СДЕЛАНО 6.1:\n"
"│   │   │                               #  deriveKey SHA-256 из секрета, pack iv‖tag‖ciphertext)\n",
"F4: 05 utils/crypto")

patch(P05,
"│   │   ├── billing-check.ts            # Проверка баланса / API-ключа перед генерацией\n",
"│   │   ├── billing-check.ts            # Проверка баланса / API-ключа перед генерацией\n"
"│   │   │                               # (СДЕЛАНО 6.1: предпроверка consume:false на 11 роутах-\n"
"│   │   │                               #  стартерах; гейт — withGenerationSlot)\n",
"F5: 05 middleware/billing-check")

# ── G. 04 ───────────────────────────────────────────────────────────────
patch(P04,
"| `server/middleware/billing-check.ts` | Проверка баланса / наличия API-ключа |",
"| `server/middleware/billing-check.ts` | Проверка баланса / наличия API-ключа — ФАКТ (6.1): `billingCheck({ quota })` — предпроверка `resolveBilling(consume:false)` → 403 с кодами §4.3 до создания строк; решение в `c.get(\"billing\")` (apiKey только для BYO); гейт и потребление квоты — `withGenerationSlot` (generation-service) |",
"G1: 04 billing-check")

patch(P04,
"| `server/services/billing-service.ts` | Stripe интеграция, транзакции |\n| `server/services/api-key-service.ts` | Шифрование/дешифрование API-ключей, проксирование |",
"| `server/services/billing-service.ts` | Stripe интеграция, транзакции — ФАКТ (6.1): getBalance/createTopup/confirmTopup (идемпотентно по stripe_id)/chargeUsage (себестоимость по PRICE_IN/PRICE_OUT оценщика, списание × BILLING_MARKUP)/recordApiUsage/getUsageHistory (byMode, byo вне totals)/getTransactionHistory + `resolveBilling` (приоритет BYO → подписка с квотой → баланс ≥ порог → ошибка; `BILLING_ENFORCE`) + `recordStreamUsage`, регистрируемый в разъём `setStreamUsageRecorder` streaming-manager импортом; Stripe — тонкий клиент `stripe-client.ts` |\n| `server/services/subscription-service.ts` | НОВОЕ (6.1): планы, `findBillableSubscription` (active/trialing, period_end > now), createSubscription (Customer на подписку + default_incomplete → clientSecret), cancel/resume, checkQuota/incrementUsage/`consumeQuota` (атомарный), resetUsageCounters, handleStripeWebhook (invoice.paid — сброс при новом периоде; subscription.updated/deleted) |\n| `server/services/api-key-service.ts` | Шифрование/дешифрование API-ключей — ФАКТ (6.1): storeApiKey (валидация формата, один активный), getDecryptedKey, deleteApiKey (NOT_FOUND), listApiKeys; «проксирование» — не отдельный слой: ключ идёт в `handle.billing.apiKey` слота |",
"G2: 04 billing-service/api-key-service")

patch(P04,
"промпты mode.{adversarial,translator,timeslice}.prompt;",
"промпты `mode.{adversarial,translator,timeslice}` (ФАКТ: без суффикса `.prompt`);",
"G3: 04 ключи режимов")

# ── H. 01 ───────────────────────────────────────────────────────────────
patch(P01,
"Приоритет middleware: BYO-Key → активная подписка с остатком квоты → положительный баланс → ошибка `BILLING_REQUIRED`.",
"""Приоритет middleware: BYO-Key → активная подписка с остатком квоты → положительный баланс → ошибка `BILLING_REQUIRED`.

**ФАКТ 6.1 (2026-09-06):** решение принимает `resolveBilling` (billing-service) — дважды: middleware `billing-check` (предпроверка, квоту не трогает, 403 до создания строк) и `withGenerationSlot` (гейт и для WS; здесь квота потребляется атомарно ОДИН раз на операцию, ключ ложится в `handle.billing.apiKey`). Учёт каждого вызова Claude — в `streamSection` через разъём `setStreamUsageRecorder`: `api_usage` пишется во всех режимах (для 'byo' — себестоимость без списания), 'balance' списывает себестоимость × `BILLING_MARKUP`. «Положительный баланс» = баланс ≥ `BILLING_MIN_RESERVE_USD` (порог; точная оценка у middleware недоступна). `BILLING_ENFORCE=false` (дефолт вне production) — без источника оплаты операция идёт серверным ключом в режиме balance в долг. Stripe — тонкий fetch-клиент (`stripe-client.ts`, `STRIPE_API_BASE` для мока), без SDK.""",
"H1: 01 §6 факт")

patch(P01,
"Payments:    Stripe (Subscriptions — подписки, PaymentIntents — разовые пополнения)",
"Payments:    Stripe (Subscriptions — подписки, PaymentIntents — разовые пополнения;\n             ФАКТ 6.1 — тонкий REST-клиент поверх fetch, без SDK)",
"H2: 01 стек Stripe")

# ── I. 02 ───────────────────────────────────────────────────────────────
patch(P02,
"""  amount_usd    NUMERIC(10, 6) NOT NULL,
  balance_after NUMERIC(10, 4) NOT NULL,
  synthesis_id  UUID REFERENCES syntheses(id),
  section_key   TEXT,""",
"""  amount_usd    NUMERIC(10, 6) NOT NULL,
  balance_after NUMERIC(10, 4) NOT NULL,
  synthesis_id  UUID REFERENCES syntheses(id) ON DELETE SET NULL,  -- миграция 0002 (6.1): история переживает удаление синтеза
  section_key   TEXT,""",
"I1: 02 transactions SET NULL")

patch(P02,
"""  user_id       UUID NOT NULL REFERENCES users(id),
  synthesis_id  UUID REFERENCES syntheses(id),
  section_key   TEXT,
  billing_mode  TEXT NOT NULL,  -- 'byo'|'subscription'|'balance'""",
"""  user_id       UUID NOT NULL REFERENCES users(id),   -- RESTRICT: удаление аккаунта с историей блокируется (долг §12 6.2)
  synthesis_id  UUID REFERENCES syntheses(id) ON DELETE SET NULL,  -- миграция 0002 (6.1)
  section_key   TEXT,
  billing_mode  TEXT NOT NULL,  -- 'byo'|'subscription'|'balance'""",
"I2: 02 api_usage SET NULL")

# ── J. README ───────────────────────────────────────────────────────────
patch("README.md",
"## Статус: Фазы 0–5 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3; Фаза 3: 3.1, 3.2; Фаза 4: 4.1, 4.2, 4.3; Фаза 5: 5.1–5.5, закрыта 2026-09-06)",
"## Статус: Фазы 0–5 завершены + 6.1 (Фаза 2: 2.1, 2.2, 2.4, 2.3; Фаза 3: 3.1, 3.2; Фаза 4: 4.1, 4.2, 4.3; Фаза 5: 5.1–5.5, закрыта 2026-09-06; Фаза 6: 6.1 закрыта 2026-09-06)",
"J1: README статус")

patch("README.md",
"""scripts/patch-docs-conv55.py. Фаза 5 закрыта целиком; следующая по
графу 07 — 6.1 (Billing Service).""",
"""scripts/patch-docs-conv55.py. Фаза 5 закрыта целиком.
Беседа 6.1 (Billing Service + API Key Management, бэкенд) ЗАКРЫТА
2026-09-06: billing-service (resolveBilling — приоритет BYO → подписка →
баланс, chargeUsage, истории) + api-key-service (AES-256-GCM, один
активный ключ) + subscription-service (планы, атомарный consumeQuota,
webhook) + stripe-client (тонкий fetch-клиент, STRIPE_API_BASE для мока)
+ middleware/billing-check на 11 роутах-стартерах + routes/billing §2.10
(13) + routes/prompts §2.9 (8, admin) + разъём учёта в streamSection +
billing на ручке generation-слота (все `env.anthropic.apiKey` сняты) +
миграция 0002 (ON DELETE SET NULL истории) + per-session rate-limit +
warmCache (смоук 54 ✓, tests/test-61-requests2-11.mjs 109 ✓ против живого
сервера с BILLING_ENFORCE=true, моком Claude и моком Stripe;
check:integration += 2w/4ag/5x; долги §12 BYO-Key / per-user rate-limit /
warmCache / учёт обогащений закрыты); доки пропатчены
scripts/patch-docs-conv61.py. Новые env: BILLING_ENFORCE,
BILLING_MIN_RESERVE_USD, STRIPE_API_BASE. Следующая по графу 07 — 6.2
(Billing UI + Admin Prompts Page).""",
"J2: README 6.1")

print(f"\napplied={applied} skipped={skipped} failed={failed}")
raise SystemExit(1 if failed else 0)
