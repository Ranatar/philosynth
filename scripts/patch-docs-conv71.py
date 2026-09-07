#!/usr/bin/env python3
"""Патч документации по итогам беседы 7.1 (долги реестра §12 и доводка,
бэкенд + клиент). Закрывает дыры, найденные при исполнении (2026-09-07):
  A  07 — запись ревизии в шапке.
  B  07 — глава «По факту 7.1» после текста беседы (synthesis_configs.created_by
     не существует; SET NULL ещё у двух каталогов и type_catalog_id; key типа
     неизменяем; POST /edges без version; анонимизация вместо DELETE users;
     точный гейт только balance+enforced и fail-open; известные ограничения;
     грабли стенда).
  C  07 §12 — ЗАКРЫТЫ 7.1 девять строк (авто-импорт, update/delete типов,
     stripe_customer_id, точный гейт, удаление аккаунта, POST /edges,
     FK created_by, /versions без тел, typecheck:scripts).
  D  03 — §2.1 DELETE /auth/me; §2.2 точный гейт POST /syntheses; §2.4
     POST /edges; §2.9 ФАКТ 7.1 (тела/value); §2.10 stripe_customer_id;
     §2.13 PATCH/DELETE типов; §4.3 INSUFFICIENT_BALANCE с оценкой.
  E  02 — §2.1 users.stripe_customer_id; ON DELETE SET NULL у created_by
     (2.17, каталоги) и type_catalog_id (categories, category_edges);
     примечание 6.2 в §2.17 заменено фактом 7.1.
  F  05 — services/account-deletion.ts, components/edit/EdgeCreateForm.tsx,
     пометки 7.1 у затронутых файлов, миграция 0003.
  G  README — статус: 7.1 закрыта, Фаза 7 закрыта.

Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patch-docs-conv71.py
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


P07 = "docs/07-conversation-protocol.md"
P03 = "docs/03-specification.md"
P05 = "docs/05-file-structure.md"
P04 = "docs/04-code-reuse-map.md"
P02 = "docs/02-data-model.md"


P07 = "docs/07-conversation-protocol.md"
P03 = "docs/03-specification.md"
P05 = "docs/05-file-structure.md"
P02 = "docs/02-data-model.md"

# ── A. 07 шапка ─────────────────────────────────────────────────────────
patch(P07,
"# PhiloSynth Service — Протокол бесед\n\n> **Правки 2026-09-07 (итоги беседы 6.2)**",
"# PhiloSynth Service — Протокол бесед\n\n"
"> **Правки 2026-09-07 (итоги беседы 7.1)**: долги реестра §12 закрыты\n"
"> целиком (запрос 1 — все семь групп + смоук tests/smoke-71-request1.mjs\n"
"> 68 ✓; тестовые запросы tests/test-71-requests2-8.mjs 105 ✓ ×2 против\n"
"> живого сервера с BILLING_ENFORCE=true, моками Claude SSE/Stripe REST и\n"
"> браузерной частью; check:integration += 2y/4ai/5y). Миграция 0003:\n"
"> ON DELETE SET NULL у `created_by` (prompt_templates и ОБА каталога типов —\n"
"> `synthesis_configs.created_by` в схеме НЕТ, п.11 «По факту 6.2» ошибочен)\n"
"> и у `type_catalog_id` (categories/category_edges), `users.stripe_customer_id`\n"
"> unique; тела/value в `/versions`; PATCH/DELETE типов каталога (admin,\n"
"> is_system → 403, key неизменяем) + вкладка «Каталоги»; `POST /syntheses/:id/edges`\n"
"> (201 без version) + EdgeCreateForm; авто-импорт файловых ☑-концепций\n"
"> (гейт 1.5b/3.2 снят); точная оценка в гейте POST /syntheses (balance+enforce,\n"
"> fail-open к порогу, → слот); `DELETE /auth/me` — анонимизация users при\n"
"> сохранённой RESTRICT-истории; typecheck:scripts в корневом typecheck.\n"
"> Фаза 7 закрыта. Глава «По факту 7.1».\n"
">\n"
"> **Правки 2026-09-07 (итоги беседы 6.2)**",
"A: шапка-ревизия 07")

# ── B. 07 «По факту 7.1» ────────────────────────────────────────────────
patch(P07,
"**Завершение беседы:** стандартное (§10) + вычеркнуть закрытые строки §12.\n\n---\n\n---\n\n## 9.",
"**Завершение беседы:** стандартное (§10) + вычеркнуть закрытые строки §12.\n\n"
"**По факту 7.1 (2026-09-07) — отступления от буквы запроса и найденное:**\n\n"
"1. **`synthesis_configs.created_by` не существует** — ни в 02 §2.18, ни в\n"
"   `schema.ts`, ни в 0000_initial. Пункт 1 запроса, примечание 02 §2.17 и\n"
"   строка §12 (п.11 «По факту 6.2») ошибочны; править нечего. Зато тот же\n"
"   голый REFERENCES был у `category_type_catalog.created_by` и\n"
"   `relationship_type_catalog.created_by` — включены в 0003 как тот же класс.\n"
"   Туда же `categories.type_catalog_id` и `category_edges.type_catalog_id`:\n"
"   0000_initial давал им `no action`, что противоречило требованию п.3\n"
"   «удаление при ссылках → SET NULL». Итого 0003: пять DROP/ADD CONSTRAINT +\n"
"   `users.stripe_customer_id text UNIQUE`\n"
"   (`0003_set_null_fks_stripe_customer.sql`, тег переименован из генерата).\n"
"2. **Stripe Customer** — `ensureStripeCustomer(userId)` в subscription-service\n"
"   (billing-service его импортирует, цикла нет): читает колонку, при пустой\n"
"   создаёт Customer (email + metadata.userId) и пишет условным\n"
"   `UPDATE … WHERE stripe_customer_id IS NULL`; при гонке побеждает первый,\n"
"   лишний Customer в Stripe остаётся пустым. `createTopup` теперь шлёт\n"
"   PaymentIntent с `customer`. Известное ограничение: Customer, удалённый\n"
"   на стороне Stripe, не переоткрывается — колонку нужно обнулить руками.\n"
"3. **/versions** — вместо `/:key/versions/:version` выбраны полные строки в\n"
"   `/versions` (`PromptVersion = PromptTemplate`, `ConfigVersion =\n"
"   SynthesisConfig`); клиентские `getTemplateVersions`/`getConfigVersionsFull`\n"
"   сохранены как имена (AdminPromptsPage, 4ah), стали прямыми вызовами.\n"
"4. **Каталоги** — `key` типа неизменяем (на него завязаны алиасы\n"
"   нормализации и посев): PATCH правит nameRu/description и для связей\n"
"   defaultDirection. Удаление отвязывает ссылки самой БД (FK SET NULL);\n"
"   `unlinked` в ответе считается ДО удаления. Вкладка «Каталоги» — две\n"
"   `.data-table`, правка по месту, confirm перед удалением; системные типы\n"
"   только на чтение.\n"
"5. **POST /edges** — в ответе НЕТ `version` (состояния «до» у новой строки не\n"
"   существует) — единственное отличие от PATCH/DELETE; `SaveOutcome.version`\n"
"   клиента стал необязательным. Совпадение концов допустимо только у\n"
"   рефлексивной связи; `position = max+1`, `source_origin = 'manual'`;\n"
"   таблица связей (и топологии при петле) перерисовывается. Логика\n"
"   `addEdge` исходника не портировалась — новый код.\n"
"6. **Авто-импорт** — `pool-store.attachSynthesisId` переводит файловую запись\n"
"   в каталожную (rawHTML сохранён — предпросмотр жив); `buildInput` читает\n"
"   участников из СВЕЖЕГО состояния стора (замыкание рендера новых id не\n"
"   видит). Сбой импорта одного файла останавливает сабмит; уже\n"
"   импортированные при повторе не дублируются.\n"
"7. **Точный гейт** — конвейер оценки вынесен из `/estimate` в\n"
"   `estimateSynthesisCost` и переиспользован в POST: только при решении\n"
"   `billingCheck` `balance` под принуждением (BYO/подписка баланса не\n"
"   требуют), сверка `resolveBilling(…, estimatedCostUsd = себестоимость ×\n"
"   BILLING_MARKUP)`; `INSUFFICIENT_BALANCE` несёт `details.estimatedChargeUsd`;\n"
"   сбой оценки — fail-open к порогу. Оценка передаётся слоту\n"
"   (`GenerateSynthesisOptions.estimatedCostUsd`), чтобы повторный гейт не\n"
"   вернулся к порогу. Следствие для стендов: мета-синтез шести разделов\n"
"   дороже $1 — тестовым пользователям нужен баланс с запасом.\n"
"8. **DELETE /auth/me** — строка users НЕ удаляется (RESTRICT `api_usage`/\n"
"   `transactions.user_id` по 02 §2.20–2.21), а анонимизируется: email\n"
"   `deleted-<id>@deleted.invalid`, bcrypt-хэш случайного секрета,\n"
"   display_name/stripe_customer_id → null, role → user, balance_usd как есть;\n"
"   удаляются сессии, BYO-ключи, синтезы (CASCADE); подписка →\n"
"   cancel_at_period_end в Stripe (fail-open) + строки canceled. Активная\n"
"   генерация → 409 GENERATION_IN_PROGRESS (гейт видит только процессы\n"
"   ЭТОГО инстанса). Подтверждение паролем — единый 401, как у\n"
"   password-change; клиент шлёт с skipUnauthorizedHandler.\n"
"9. **typecheck:scripts** ломали два дефекта: невалидные enum-значения в\n"
"   `scripts/test-31-requests2-4.ts` и `scripts/smoke-31.ts`\n"
"   (`synthLevel: \"integrative\"` — это метод, `status: \"created\"`) и\n"
"   кросс-мировой статический импорт `PauseModal.tsx` из\n"
"   `tests/smoke-1.4b.mts` (грабля правок Фазы 0 — заменён путём-переменной).\n"
"10. Старые секции integration-check подправлены под новую реальность: 4m\n"
"   (срез /estimate начинается с хелпера), 4n (гейт файловых — регресс, а не\n"
"   норма), 4ag (квота слота с estimatedCostUsd); `PageStub.tsx`, объявленный\n"
"   удалённым в 6.2, всё ещё лежал в дереве — удалён.\n"
"11. Грабли стенда: демоны PG/Redis не переживают пауз между ходами;\n"
"   фоновый `npm install` гибнет с вызовом инструмента (только передний\n"
"   план); уборка `deleted-*@deleted.invalid` требует сначала снести\n"
"   `api_usage`/`transactions`; капитель `.action-btn` («◈ ГРАФ») — сравнения\n"
"   регистронезависимо; проверка «нет ✗» в выводе дочерних смоуков ложно\n"
"   ловит строку «0 ✗».\n\n"
"---\n\n---\n\n## 9.",
"B: глава «По факту 7.1»")

# ── C. 07 §12 ───────────────────────────────────────────────────────────
patch(P07,
"| 7.1 | 4.3 | внесён 2026-08-30; 6.2 НЕ делала (2026-09-07): требует правки SynthesisForm 1.5b/3.2 — переадресован 7.1 |",
"| 7.1 | 4.3 | ЗАКРЫТ 7.1 (2026-09-07): при сабмите каждая ☑-файловая концепция → importFile → `pool-store.attachSynthesisId` → участник type='synthesis'; гейт 1.5b/3.2 снят; R6 test-71 |",
"C1: §12 авто-импорт")
patch(P07,
"— переадресован 7.1 (сервер + вкладка «Каталоги» AdminPromptsPage) |",
"— ЗАКРЫТ 7.1 (2026-09-07): `updateCustomType`/`deleteCustomType` + PATCH/DELETE `/taxonomy/{category|relationship}-types/:id` под requireAdmin (is_system → 403, key неизменяем, unlinked в ответе; FK SET NULL 0003) + вкладка «Каталоги»; R4 test-71 |",
"C2: §12 update/delete типов")
patch(P07,
"переиспользовать Customer (и для topup) | 7.1 | 6.1 | внесён 2026-09-06; 6.2 НЕ делала (клиентская беседа) — переадресован 7.1 |",
"переиспользовать Customer (и для topup) | 7.1 | 6.1 | ЗАКРЫТ 7.1 (2026-09-07): миграция 0003 + `ensureStripeCustomer` (условный UPDATE, гонка безопасна), createTopup с `customer`; R2в test-71 |",
"C3: §12 stripe_customer_id")
patch(P07,
"сверять с балансом там) | 7.1 | 6.1 | внесён 2026-09-06; 6.2 НЕ делала (клиентская беседа) — переадресован 7.1 |",
"сверять с балансом там) | 7.1 | 6.1 | ЗАКРЫТ 7.1 (2026-09-07): `estimateSynthesisCost` общий для /estimate и POST; resolveBilling с оценкой×наценкой при balance+enforce, details.estimatedChargeUsd, оценка → слот; R7 test-71 |",
"C4: §12 точный гейт")
patch(P07,
"DELETE /auth/me не специфицирован) | 7.1 | 6.1 | внесён 2026-09-06; 6.2 НЕ делала — переадресован 7.1 (вместе с FK created_by ниже) |",
"DELETE /auth/me не специфицирован) | 7.1 | 6.1 | ЗАКРЫТ 7.1 (2026-09-07): `services/account-deletion.ts` — анонимизация users, удаление сессий/ключей/синтезов, отмена подписки; `DELETE /auth/me { password }`; ProfilePage; R7 test-71 |",
"C5: §12 удаление аккаунта")
patch(P07,
"только удалить и создать) | 7.1 | 5.4 | внесён 2026-09-05; 6.2 НЕ делала (нужен серверный эндпоинт §2.4) — переадресован 7.1 |",
"только удалить и создать) | 7.1 | 5.4 | ЗАКРЫТ 7.1 (2026-09-07): `createCategoryEdge` + `POST /syntheses/:id/edges` (201 без version) + EdgeCreateForm («+ Связь» в GraphModal/NodePanel); R5 test-71 |",
"C6: §12 POST /edges")
patch(P07,
"→ миграция 0003 ON DELETE SET NULL | 7.1 | 6.2 | внесён 2026-09-07 («По факту 6.2» п.11) |",
"→ миграция 0003 ON DELETE SET NULL | 7.1 | 6.2 | ЗАКРЫТ 7.1 (2026-09-07) С ПОПРАВКОЙ: `synthesis_configs.created_by` не существует; SET NULL получили prompt_templates и ОБА каталога типов + type_catalog_id категорий/связей; R2 test-71 |",
"C7: §12 FK created_by")
patch(P07,
"и убрать обход из `client/api/prompts.ts` | 7.1 | 6.2 | внесён 2026-09-07 («По факту 6.2» п.1) |",
"и убрать обход из `client/api/prompts.ts` | 7.1 | 6.2 | ЗАКРЫТ 7.1 (2026-09-07): полные строки с телами/value в `/versions`; обход снят; R3 test-71 |",
"C8: §12 /versions")
patch(P07,
"починить и включить в `typecheck` | 7.1 | 6.2 (дефект ≥ 5.x) | внесён 2026-09-07 |",
"починить и включить в `typecheck` | 7.1 | 6.2 (дефект ≥ 5.x) | ЗАКРЫТ 7.1 (2026-09-07): enum-значения в test-31/smoke-31 исправлены, кросс-мировой импорт в smoke-1.4b — путём-переменной; `typecheck:scripts` в корневом `typecheck`; R8 test-71 |",
"C9: §12 typecheck:scripts")

# ── D. 03 ───────────────────────────────────────────────────────────────
patch(P03,
"POST   /auth/password-reset/request  { email }              // A2a, Фаза 3",
"DELETE /auth/me                { password } → { ok: true, deletedSyntheses,\n"
"                                                subscriptionCanceled }\n"
"                                // Беседа 7.1. Подтверждение паролем: неверный →\n"
"                                // 401 AUTH_REQUIRED (единый ответ). Активная\n"
"                                // генерация → 409 GENERATION_IN_PROGRESS. Строка\n"
"                                // users АНОНИМИЗИРУЕТСЯ (email deleted-<id>@\n"
"                                // deleted.invalid, случайный хэш, display_name/\n"
"                                // stripe_customer_id → null, role → user) —\n"
"                                // api_usage/transactions RESTRICT остаются;\n"
"                                // сессии, BYO-ключи, синтезы удаляются, подписка\n"
"                                // → cancel_at_period_end. Cookie очищается.\n\n"
"POST   /auth/password-reset/request  { email }              // A2a, Фаза 3",
"D1: 03 §2.1 DELETE /auth/me")
patch(P03,
"                                // warnings (3.1, аддитивно): неблокирующие\n"
"                                // генеалогические пересечения (M3 §1.6;\n"
"                                // confirm исходника жил на клиенте)\n"
"                                // Генерация начинается, клиент подключается по WebSocket",
"                                // warnings (3.1, аддитивно): неблокирующие\n"
"                                // генеалогические пересечения (M3 §1.6;\n"
"                                // confirm исходника жил на клиенте)\n"
"                                // 7.1: точный гейт баланса — при решении\n"
"                                //   billingCheck 'balance' под BILLING_ENFORCE\n"
"                                //   роут считает estimateCost по параметрам\n"
"                                //   (общий конвейер с /estimate) и сверяет\n"
"                                //   баланс с себестоимость×BILLING_MARKUP →\n"
"                                //   403 INSUFFICIENT_BALANCE с details.\n"
"                                //   estimatedChargeUsd; сбой оценки — порог\n"
"                                //   BILLING_MIN_RESERVE_USD; BYO/подписка не\n"
"                                //   затронуты; оценка передаётся слоту\n"
"                                // Генерация начинается, клиент подключается по WebSocket",
"D2: 03 §2.2 точный гейт")
patch(P03,
"// Удаление связи. Edge case протокола 5.1 требовал его, эндпоинта не\n"
"// было.",
"// Создание связи (беседа 7.1; долг §12 5.4 — концы связи PATCH не меняет).\n"
"// sourceId/targetId — категории ЭТОГО синтеза (иначе 400 details по полю);\n"
"// совпадение концов только у direction 'рефлексивная'; прочие поля как в\n"
"// PATCH, незаданные берут дефолты схемы; position — следующий за максимумом,\n"
"// source_origin 'manual'; has_reflexive и таблицы связей/топологии\n"
"// пересчитываются. Ответ БЕЗ version — состояния «до» у новой строки нет.\n"
"POST   /syntheses/:id/edges     { sourceId, targetId, edgeType?, direction?,\n"
"                                  description?, strength?, certainty?,\n"
"                                  historicalSupport?, logicalNecessity?,\n"
"                                  innovationDegree?, contextDependency?,\n"
"                                  typeCatalogId? }\n"
"                                → 201 { edge: CategoryEdge, impact: ImpactAnalysis,\n"
"                                        htmlSync: HtmlSyncInfo }\n\n"
"// Удаление связи. Edge case протокола 5.1 требовал его, эндпоинта не\n"
"// было.",
"D3: 03 §2.4 POST /edges")
patch(P03,
"GET    /prompts/:key/versions   → { versions: PromptVersion[] }\n"
"                                // ФАКТ 6.2: метаданные БЕЗ тел — diff версий\n"
"                                // в админке строится обходом\n"
"                                // GET /prompts?prefix=key&activeOnly=false\n"
"                                // (точная фильтрация по key на клиенте);\n"
"                                // долг 7.1 — тела здесь либо\n"
"                                // GET /prompts/:key/versions/:version",
"GET    /prompts/:key/versions   → { versions: PromptVersion[] }\n"
"                                // ФАКТ 7.1: PromptVersion = PromptTemplate —\n"
"                                // полные строки С ТЕЛАМИ, новые первыми\n"
"                                // (до 7.1 — метаданные, и diff в админке\n"
"                                // строился обходом ?prefix=&activeOnly=false;\n"
"                                // обход снят). Ключ без версий → 404.",
"D4: 03 §2.9 prompts versions")
patch(P03,
"GET    /configs/:key/versions   → { versions: ConfigVersion[] }\n"
"                                // ФАКТ 6.2: без value — обход\n"
"                                // GET /configs?activeOnly=false (долг 7.1)",
"GET    /configs/:key/versions   → { versions: ConfigVersion[] }\n"
"                                // ФАКТ 7.1: ConfigVersion = SynthesisConfig —\n"
"                                // с value (обход через GET /configs снят)",
"D5: 03 §2.9 configs versions")
patch(P03,
"                                    // Роуты смонтированы на /api/v1/taxonomy.\n\n"
"POST   /taxonomy/normalize",
"                                    // Роуты смонтированы на /api/v1/taxonomy.\n\n"
"// Беседа 7.1 (долг §12 0.3b/5.4): правка и удаление пользовательских типов —\n"
"// только admin. key НЕИЗМЕНЯЕМ (алиасы нормализации, посев). is_system →\n"
"// 403 FORBIDDEN; неизвестный id (или не UUID) → 404 NOT_FOUND. Удаление\n"
"// обнуляет type_catalog_id у ссылающихся categories/category_edges (FK\n"
"// ON DELETE SET NULL, миграция 0003), текст type сохраняется; unlinked —\n"
"// их число; кэш каталога сбрасывается. UI — вкладка «Каталоги» AdminPromptsPage.\n"
"PATCH  /taxonomy/category-types/:id     { nameRu?, description? } → { type }\n"
"DELETE /taxonomy/category-types/:id     → { ok: true, unlinked: number }\n"
"PATCH  /taxonomy/relationship-types/:id { nameRu?, description?,\n"
"                                          defaultDirection? } → { type }\n"
"DELETE /taxonomy/relationship-types/:id → { ok: true, unlinked: number }\n\n"
"POST   /taxonomy/normalize",
"D6: 03 §2.13 PATCH/DELETE типов")
patch(P03,
"> confirm-эндпоинта не имеет — статус меняет webhook, UI перечитывает\n"
"> `GET /billing/subscription` по кнопке «Обновить».\n",
"> confirm-эндпоинта не имеет — статус меняет webhook, UI перечитывает\n"
"> `GET /billing/subscription` по кнопке «Обновить».\n"
">\n"
"> **ФАКТ 7.1:** Stripe Customer — один на пользователя\n"
"> (`users.stripe_customer_id`, миграция 0003; `ensureStripeCustomer` в\n"
"> subscription-service): `POST /topup` создаёт PaymentIntent с `customer`,\n"
"> `POST /subscribe` переиспользует его же. `DELETE /auth/me` обнуляет колонку\n"
"> (Customer остаётся у истории платежей в Stripe).\n",
"D7: 03 §2.10 stripe_customer_id")
patch(P03,
"INSUFFICIENT_BALANCE — недостаточно средств (режим «баланс сервиса»): баланс > 0,\n"
"                       но ниже порога BILLING_MIN_RESERVE_USD (ФАКТ 6.1; details:\n"
"                       balanceUsd, requiredUsd)",
"INSUFFICIENT_BALANCE — недостаточно средств (режим «баланс сервиса»): баланс > 0,\n"
"                       но ниже порога BILLING_MIN_RESERVE_USD (ФАКТ 6.1; details:\n"
"                       balanceUsd, requiredUsd); у POST /syntheses с 7.1 порог —\n"
"                       точная оценка (details += estimatedChargeUsd)",
"D8: 03 §4.3 INSUFFICIENT_BALANCE")

# ── E. 02 ───────────────────────────────────────────────────────────────
patch(P02,
"  balance_usd   NUMERIC(10, 4) NOT NULL DEFAULT 0,\n"
"  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
"  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()\n"
");\n```\n\n### 2.2. sessions",
"  balance_usd   NUMERIC(10, 4) NOT NULL DEFAULT 0,\n"
"  stripe_customer_id TEXT UNIQUE,  -- 7.1 (миграция 0003): один Stripe Customer на пользователя,\n"
"                                   -- создаётся при первом topup/подписке (ensureStripeCustomer)\n"
"  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
"  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()\n"
");\n```\n\n"
"> **7.1:** удаление аккаунта (`DELETE /auth/me`) НЕ удаляет строку — RESTRICT\n"
"> `api_usage`/`transactions.user_id` (§2.20–2.21) сохраняет финансовую\n"
"> историю; строка анонимизируется (email `deleted-<id>@deleted.invalid`,\n"
"> случайный password_hash, display_name/stripe_customer_id → NULL,\n"
"> role → 'user'); сессии, api_keys, syntheses удаляются, подписки → canceled.\n\n"
"### 2.2. sessions",
"E1: 02 §2.1 users")
patch(P02,
"  type_catalog_id  UUID REFERENCES category_type_catalog(id),  -- ссылка на каталог типов (нормализованный)",
"  type_catalog_id  UUID REFERENCES category_type_catalog(id) ON DELETE SET NULL,  -- ссылка на каталог типов (нормализованный); SET NULL — миграция 0003 (7.1)",
"E2: 02 categories.type_catalog_id")
patch(P02,
"  type_catalog_id    UUID REFERENCES relationship_type_catalog(id),",
"  type_catalog_id    UUID REFERENCES relationship_type_catalog(id) ON DELETE SET NULL,  -- SET NULL — миграция 0003 (7.1)",
"E3: 02 category_edges.type_catalog_id")
patch(P02,
"> **Примечание 6.2 (2026-09-07):** `created_by UUID REFERENCES users(id)` без\n"
"> `ON DELETE SET NULL` — удаление админа, создавшего хоть один черновик,\n"
"> падает по FK 23503 (тот же класс, что миграция 0002 закрыла для\n"
"> `api_usage`/`transactions.synthesis_id`). То же у `synthesis_configs`\n"
"> (§2.18). Долг 7.1 — миграция 0003 `ON DELETE SET NULL`.",
"> **7.1 (2026-09-07, миграция 0003):** `created_by … ON DELETE SET NULL` —\n"
"> удаление автора черновика больше не падает по FK 23503 (класс миграции\n"
"> 0002). Примечание 6.2 ошибочно относило это и к `synthesis_configs` —\n"
"> колонки `created_by` там НЕТ (§2.18); зато тот же голый REFERENCES был у\n"
"> `category_type_catalog`/`relationship_type_catalog.created_by` — исправлен\n"
"> той же миграцией.",
"E4: 02 §2.17 примечание")
patch(P02,
"  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
"  created_by  UUID REFERENCES users(id),\n"
"  \n",
"  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n"
"  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,  -- 7.1, миграция 0003\n"
"  \n",
"E5: 02 prompt_templates.created_by")
patch(P02,
"  is_system   BOOLEAN NOT NULL DEFAULT true,  -- системный (предзаполненный) или пользовательский\n"
"  created_by  UUID REFERENCES users(id),",
"  is_system   BOOLEAN NOT NULL DEFAULT true,  -- системный (предзаполненный) или пользовательский\n"
"  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,  -- 7.1, миграция 0003",
"E6: 02 category_type_catalog.created_by")
patch(P02,
"  is_system        BOOLEAN NOT NULL DEFAULT true,\n"
"  created_by       UUID REFERENCES users(id),",
"  is_system        BOOLEAN NOT NULL DEFAULT true,\n"
"  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,  -- 7.1, миграция 0003",
"E7: 02 relationship_type_catalog.created_by")

# ── F. 05 ───────────────────────────────────────────────────────────────
patch(P05,
"│   │   ├── subscription-service.ts    # Stripe Subscriptions: планы, квоты, счётчики, webhook\n"
"│   │   │                               # (СДЕЛАНО 6.1: + consumeQuota — атомарная проверка+инкремент)",
"│   │   ├── subscription-service.ts    # Stripe Subscriptions: планы, квоты, счётчики, webhook\n"
"│   │   │                               # (СДЕЛАНО 6.1: + consumeQuota — атомарная проверка+инкремент;\n"
"│   │   │                               #  7.1: ensureStripeCustomer — один Customer на пользователя)\n"
"│   │   ├── account-deletion.ts        # 7.1: DELETE /auth/me — анонимизация users при сохранённой\n"
"│   │   │                               # RESTRICT-истории, удаление сессий/ключей/синтезов, отмена подписки",
"F1: 05 account-deletion + subscription-service")
patch(P05,
"│   │   ├── element-taxonomy.ts         # Каталог типов категорий/связей, нечёткая нормализация,\n"
"│   │   │                               # справочник для поиска/фильтрации (НОВОЕ, из предыдущего проекта)",
"│   │   ├── element-taxonomy.ts         # Каталог типов категорий/связей, нечёткая нормализация,\n"
"│   │   │                               # справочник для поиска/фильтрации (НОВОЕ, из предыдущего проекта;\n"
"│   │   │                               #  7.1: updateCustomType/deleteCustomType — админ-правки, key неизменяем)",
"F2: 05 element-taxonomy")
patch(P05,
"│   │   │   │   ├── EdgeEditor.tsx          # Поля связи: тип (TaxonomySelector), направление,\n"
"│   │   │   │   │                           # шесть слайдеров; kind='edge' ElementEditor (5.4)",
"│   │   │   │   ├── EdgeEditor.tsx          # Поля связи: тип (TaxonomySelector), направление,\n"
"│   │   │   │   │                           # шесть слайдеров; kind='edge' ElementEditor (5.4)\n"
"│   │   │   │   ├── EdgeCreateForm.tsx      # 7.1: создание связи поверх графа — select'ы концов +\n"
"│   │   │   │   │                           # EdgeEditor → POST /syntheses/:id/edges («+ Связь» GraphModal/NodePanel)",
"F3: 05 EdgeCreateForm")
patch(P05,
"│   │   │   └── AdminPromptsPage.tsx    # 6.2 СДЕЛАНО: вкладки «Шаблоны» (дерево, редактор, плейсхолдеры, предпросмотр, версии/diff/откат) и «Конфиги» (JSON-редактор); под RequireAdmin",
"│   │   │   └── AdminPromptsPage.tsx    # 6.2 СДЕЛАНО: вкладки «Шаблоны» (дерево, редактор, плейсхолдеры, предпросмотр, версии/diff/откат) и «Конфиги» (JSON-редактор); под RequireAdmin; 7.1: + вкладка «Каталоги» (типы категорий/связей, правка и удаление пользовательских)",
"F4: 05 AdminPromptsPage")
patch(P05,
"│   │   │   ├── ProfilePage.tsx         # Профиль: displayName + смена пароля (A3, беседа 0.6)",
"│   │   │   ├── ProfilePage.tsx         # Профиль: displayName + смена пароля (A3, беседа 0.6); 7.1: + удаление аккаунта (DELETE /auth/me)",
"F5: 05 ProfilePage")
patch(P05,
"│   │   │   ├── auth-store.ts           # Zustand: user, session",
"│   │   │   ├── auth-store.ts           # Zustand: user, session (0.6: updateProfile/changePassword; 7.1: deleteAccount)",
"F6: 05 auth-store")
patch(P05,
"│   │   │   ├── pool-store.ts           # Zustand: Unified Concept Pool (беседа 1.5b)",
"│   │   │   ├── pool-store.ts           # Zustand: Unified Concept Pool (беседа 1.5b; 7.1: attachSynthesisId — файловая → каталожная после авто-импорта)",
"F7: 05 pool-store")

# ── G. README ───────────────────────────────────────────────────────────
patch("README.md",
"## Статус: Фазы 0–6 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3; Фаза 3: 3.1, 3.2; Фаза 4: 4.1, 4.2, 4.3; Фаза 5: 5.1–5.5, закрыта 2026-09-06; Фаза 6: 6.1 закрыта 2026-09-06, 6.2 закрыта 2026-09-07); впереди Фаза 7 (7.1 — долги §12)",
"## Статус: Фазы 0–7 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3; Фаза 3: 3.1, 3.2; Фаза 4: 4.1, 4.2, 4.3; Фаза 5: 5.1–5.5, закрыта 2026-09-06; Фаза 6: 6.1 закрыта 2026-09-06, 6.2 закрыта 2026-09-07; Фаза 7: 7.1 закрыта 2026-09-07 — реестр долгов §12 пуст)",
"G1: README статус")
patch("README.md",
"VITE_STRIPE_PUBLISHABLE_KEY. Долги 6.2 с серверной работой → Фаза 7,\n"
"беседа 7.1 (07 §8, §11, §12).\n",
"VITE_STRIPE_PUBLISHABLE_KEY. Долги 6.2 с серверной работой → Фаза 7,\n"
"беседа 7.1 (07 §8, §11, §12).\n"
"Беседа 7.1 (долги реестра §12 и доводка) ЗАКРЫТА 2026-09-07: миграция\n"
"0003 (ON DELETE SET NULL у created_by ×3 и type_catalog_id ×2,\n"
"users.stripe_customer_id) + ensureStripeCustomer; тела/value в /versions;\n"
"PATCH/DELETE типов каталога + вкладка «Каталоги»; POST /syntheses/:id/edges +\n"
"EdgeCreateForm; авто-импорт файловых ☑-концепций (гейт снят); точная\n"
"оценка в гейте POST /syntheses; DELETE /auth/me (анонимизация) +\n"
"ProfilePage; typecheck:scripts в корневом typecheck (смоук 68 ✓,\n"
"tests/test-71-requests2-8.mjs 105 ✓ ×2 против живого сервера с моками и\n"
"браузером; check:integration += 2y/4ai/5y); доки пропатчены\n"
"scripts/patch-docs-conv71.py. Реестр долгов §12 пуст.\n",
"G2: README абзац 7.1")

print(f"\nИтог: applied={applied} skip={skipped} fail={failed}")
