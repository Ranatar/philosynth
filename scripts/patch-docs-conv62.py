#!/usr/bin/env python3
"""Патч документации по итогам беседы 6.2 (Billing UI + Admin Prompts
Page, клиент).

Закрывает дыры, найденные при исполнении беседы (2026-09-07):
  A  07 — запись ревизии в шапке.
  B  07 — глава «По факту 6.2» после текста беседы (обход /versions без
     тел; Stripe.js без npm и dev-режим подтверждения; PauseModal с одним
     вызовом API; RequireAdmin → каталог; статусы после перечитывания;
     validateJson под новый формат V8; css-parity и литералы в className;
     капитель кнопок в браузерных тестах; латентный конфликт 5k/4ag;
     FK prompt_templates.created_by; грабли стенда).
  C  07 6.2 — тест доступа: «403 или каталог» → каталог (ФАКТ).
  D  07 §12 — ЗАКРЫТЫ 6.2: форма ключа в PauseModal, ролевая защита
     /admin/prompts, UI подписок; переадресованы 7.1: авто-импорт
     файловых ☑-концепций, update/delete типов каталога,
     users.stripe_customer_id, точная оценка гейта, удаление аккаунта,
     POST /edges; новые (7.1): FK created_by без SET NULL, /versions без
     тел, typecheck:scripts сломан test-31.
  E  07 — Фаза 7: беседа 7.1 «Долги и доводка» (внутри §8, без сдвига
     нумерации §9–12) + узел 7.1 в графе §11.
  F  03 — §1.10 P1/P2/P3/P5 и §1.11 B1/B3/B4/B6 — UI СДЕЛАН 6.2; §2.9 —
     ФАКТ: /versions без тел и обход клиента; §2.10 — publishable key и
     dev-режим.
  G  05 — utils/text-diff, template-placeholders, stripe; пометки
     «СДЕЛАНО 6.2» у api/billing, subscription, prompts, страниц и
     format.ts.
  H  04 §4 — строки BillingPage/AdminPromptsPage/api/utils + порт
     _resumeWithNewApiKey в PauseModal.
  I  02 §2.17 — примечание: created_by без ON DELETE SET NULL (долг 7.1).
  J  README — статус: 6.2 закрыта, Фаза 6 закрыта.

Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patch-docs-conv62.py
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

# ── A. 07 шапка ─────────────────────────────────────────────────────────
patch(P07,
"# PhiloSynth Service — Протокол бесед\n\n> **Правки 2026-09-06 (итоги беседы 6.1)**",
"# PhiloSynth Service — Протокол бесед\n\n"
"> **Правки 2026-09-07 (итоги беседы 6.2)**: Billing UI + Admin Prompts Page\n"
"> закрыт (запрос 1 + смоук tests/smoke-62-request1.mjs 84 ✓ + все тестовые\n"
"> запросы tests/test-62-requests2-7.mjs 101 ✓ ×2 в браузере против живого\n"
"> сервера с BILLING_ENFORCE=true, моком Claude SSE и моком Stripe REST;\n"
"> check:integration += 2x/4ah). Дыры, закрытые этим патчем (глава «По\n"
"> факту 6.2»): `GET /prompts/:key/versions` и `/configs/:key/versions` без\n"
"> тел — diff версий строится через `GET /prompts?prefix=key&activeOnly=false`\n"
"> (обход, долг 7.1); publishable key Stripe — `VITE_STRIPE_PUBLISHABLE_KEY`\n"
"> (пусто → dev-режим подтверждения `POST /topup/confirm`); PauseModal\n"
"> делает ОДИН вызов API (storeApiKey) — отступление от 1.4b; RequireAdmin\n"
"> → `/catalog` (страницы 403 нет); долги 6.2 с серверной работой →\n"
"> Фаза 7 (беседа 7.1); FK `prompt_templates.created_by` без SET NULL и\n"
"> латентный конфликт 5k↔4ag integration-check.\n"
">\n"
"> **Правки 2026-09-06 (итоги беседы 6.1)**",
"A: шапка-ревизия 07")

# ── B. 07 «По факту 6.2» ────────────────────────────────────────────────
patch(P07,
"   опущен. После BYO-Key из 6.1 ключ становится пользовательским,\n"
"   и форму можно показать прямо в модалке паузы.\n"
"```\n\n"
"**Последующие запросы:**\n"
"- «Протестируй BYO-Key UI:",
"   опущен. После BYO-Key из 6.1 ключ становится пользовательским,\n"
"   и форму можно показать прямо в модалке паузы.\n"
"```\n\n"
"**По факту 6.2 (2026-09-07) — отступления от буквы запроса и найденное:**\n\n"
"1. **Diff версий против контракта §2.9.** `GET /prompts/:key/versions`\n"
"   отдаёт метаданные без тел (`PromptVersion`), `/configs/:key/versions` —\n"
"   без `value`; требуемый diff двух версий по этим эндпоинтам невозможен.\n"
"   Клиент берёт тела через `GET /prompts?prefix=<key>&activeOnly=false`\n"
"   (LIKE захватывает и более длинные ключи — фильтрация по точному ключу\n"
"   в `getTemplateVersions`), конфиги — `GET /configs?activeOnly=false`\n"
"   целиком (`getConfigVersionsFull`). Сервер не менялся; долг 7.1 — тела\n"
"   в `/versions` либо `GET /…/:key/versions/:version`.\n"
"2. **Stripe Elements.** Publishable key нигде не был специфицирован;\n"
"   введён `VITE_STRIPE_PUBLISHABLE_KEY` (.env.example, vite-env.d.ts).\n"
"   Stripe.js грузится вставкой `<script src=js.stripe.com/v3>` без\n"
"   npm-зависимости (`client/utils/stripe.ts`; @stripe/stripe-js делает то\n"
"   же). Ключа нет → dev-режим: после `POST /topup` кнопка «Подтвердить\n"
"   платёж» зовёт `POST /topup/confirm` напрямую — так работает мок Stripe\n"
"   стенда (PaymentIntent сразу `succeeded`). У подписки confirm-эндпоинта\n"
"   нет: статус `incomplete` меняет только webhook, UI показывает\n"
"   «ожидает оплаты» + «Обновить».\n"
"3. **PauseModal ходит в API.** Контракт 1.4b «модалка не ходит в API сама»\n"
"   нарушен ровно одним вызовом `storeApiKey` из auth-рендерера (порт\n"
"   `_resumeWithNewApiKey`: сохранить → `retry`); иначе форму пришлось бы\n"
"   прокидывать через три хоста. Сброс `reasonKind` исходника не нужен —\n"
"   сервер переопределяет режим/ключ при каждом resume («По факту 6.1» п.3).\n"
"   Хуки формы стоят ДО раннего `return null`.\n"
"4. **RequireAdmin → `/catalog`.** Страницы 403 в приложении нет; серверные\n"
"   роуты §2.9 отвечают 403 FORBIDDEN независимо от клиента.\n"
"5. **Утилиты вне 05.** Созданы `client/utils/text-diff.ts` (построчный\n"
"   LCS-diff — `diffSnapshots` VersionHistory пополевой и не годится),\n"
"   `template-placeholders.ts` (`PLACEHOLDER_RE` ≡ регексу `renderTemplate`\n"
"   реестра — дрейф-контроль 4ah; `SAMPLE_VALUES` предпросмотра покрывают\n"
"   все плейсхолдеры `server/config/*` — 4ah), `stripe.ts`; `format.ts` из\n"
"   05 создан впервые. `PageStub.tsx` удалён (потребителей не осталось).\n"
"6. **Подсветка JSON** конфигов — без библиотеки: `.code-editor` + `.invalid`\n"
"   + текст ошибки с позицией; V8 с 2023 пишет `(line N column M)` вместо\n"
"   `at position N` — `validateJson` понимает оба формата.\n"
"7. **Статусы после перечитывания.** «Черновик сохранён» / «активирована»\n"
"   выставляются ПОСЛЕ `loadList`/`loadVersions`, иначе тест видит статус\n"
"   при старом списке версий (гонка, пойманная R5/R6).\n"
"8. **css-parity-audit и className.** Аудит считает классами ВСЕ строковые\n"
"   литералы внутри выражения `className={…}` — сравнения вида\n"
"   `t.type === \"topup\"` дают ложные «классы без правил». Литералы\n"
"   вынесены в хелперы (`badgeClass`, `tabClass`). Итог аудита 0/586.\n"
"9. **Капитель в браузерных тестах.** `.action-btn`, `.code-status`,\n"
"   `.form-label` рендерятся `text-transform: uppercase` — `innerText`\n"
"   возвращает КАПИТЕЛЬ; сравнения только регистронезависимые. Клики по\n"
"   перерисовываемым спискам — через DOM (`el.click()`), handle puppeteer\n"
"   отвязывается («Node is detached»).\n"
"10. **Латентный конфликт integration-check 6.1.** Ветка 5k «без ключа →\n"
"    API_KEY_MISSING» исполнялась только при пустом ANTHROPIC_API_KEY в\n"
"    окружении и противоречила 4ag (гейт ключа — у биллинга с 6.1); 5m при\n"
"    пустом ключе получал 403 от billingCheck до валидации тела. Снято:\n"
"    5k проверяет отсутствие исключения, 5m подставляет серверный ключ на\n"
"    время запроса (как 5x).\n"
"11. **FK `prompt_templates.created_by`** (02 §2.17) без ON DELETE SET NULL:\n"
"    удаление админа, создавшего черновик, падает по 23503 — тот же класс,\n"
"    что 6.1 чинила миграцией 0002. Долг 7.1 (миграция 0003); стенд\n"
"    обходит `UPDATE created_by = NULL`.\n"
"12. **Стенд.** PG/Redis не переживают паузу между ходами; полный прогон\n"
"    ≈ 2,5 мин — только в фоне с логом в файл; уборка: `t62-*`\n"
"    пользователи (сначала `user_subscriptions`, `created_by`), версии\n"
"    `system`/`context_budget` > 1 удаляются, v1 активируется.\n"
"13. **Долги §12 с адресатом 6.2, требующие сервера** (авто-импорт\n"
"    файловых ☑-концепций, update/delete типов каталога, `POST /edges`,\n"
"    `users.stripe_customer_id`, точная оценка гейта, удаление аккаунта) в\n"
"    6.2 не делались — переадресованы беседе 7.1 (Фаза 7, ниже).\n\n"
"**Последующие запросы:**\n"
"- «Протестируй BYO-Key UI:",
"B: глава «По факту 6.2»")

# ── C. 07 тест доступа ──────────────────────────────────────────────────
patch(P07,
"- «Проверь доступ: обычный пользователь → /admin/prompts → redirect на 403 или каталог»\n",
"- «Проверь доступ: обычный пользователь → /admin/prompts → redirect на 403 или каталог» (ФАКТ 6.2: redirect на `/catalog` — страницы 403 нет; серверные роуты §2.9 → 403 FORBIDDEN)\n",
"C: тест доступа 6.2 → каталог")

# ── D. 07 §12 ───────────────────────────────────────────────────────────
patch(P07,
"| Форма ввода ключа в auth-модалке `PauseModal` | 6.2 | 1.4b (адресовался 6.1) | внесён 2026-07-31 |",
"| Форма ввода ключа в auth-модалке `PauseModal` | 6.2 | 1.4b (адресовался 6.1) | ЗАКРЫТ 6.2 (2026-09-07): auth-рендерер — поле ключа + «✓ Сохранить и продолжить» (storeApiKey → resume retry; порт `_resumeWithNewApiKey`), «Повторить»/«Остановить» сохранены; R9 test-62 — пауза auth → новый ключ → синтез ready |",
"D1: §12 форма ключа PauseModal закрыта")
patch(P07,
"| Ролевая защита маршрута `/admin/prompts` на клиенте (сейчас только RequireAuth) | 6.2 | 0.4 | внесён 2026-09-02 (п.19) |",
"| Ролевая защита маршрута `/admin/prompts` на клиенте (сейчас только RequireAuth) | 6.2 | 0.4 | ЗАКРЫТ 6.2 (2026-09-07): `RequireAdmin` в App.tsx поверх RequireAuth → `/catalog`; 4ah сторожит |",
"D2: §12 RequireAdmin закрыт")
patch(P07,
"| UI подписок в BillingPage (бэкенд готов: 02 §2.22–2.23, 03 §2.10, subscription-service 6.1) | 6.2 | 6.1 | внесён 2026-09-02 (п.8) |",
"| UI подписок в BillingPage (бэкенд готов: 02 §2.22–2.23, 03 §2.10, subscription-service 6.1) | 6.2 | 6.1 | ЗАКРЫТ 6.2 (2026-09-07): секция «Подписка» (план/статус/период, квоты, тарифы → subscribe → Elements или «ожидает оплаты» до webhook, отмена/возобновление) + `client/api/subscription.ts`; R8 test-62 |",
"D3: §12 UI подписок закрыт")
patch(P07,
"снятие гейта 1.5b/3.2) | 6.2 | 4.3 | внесён 2026-08-30 |",
"снятие гейта 1.5b/3.2) | 7.1 | 4.3 | внесён 2026-08-30; 6.2 НЕ делала (2026-09-07): требует правки SynthesisForm 1.5b/3.2 — переадресован 7.1 |",
"D4: §12 авто-импорт → 7.1")
patch(P07,
"в TaxonomySelector — только создание |",
"в TaxonomySelector — только создание; 6.2 НЕ делала (2026-09-07): серверных эндпоинтов и спецификации по-прежнему нет — переадресован 7.1 (сервер + вкладка «Каталоги» AdminPromptsPage) |",
"D5: §12 update/delete типов → 7.1")
patch(P07,
"добавить колонку и переиспользовать Customer (и для topup) | 6.2 | 6.1 | внесён 2026-09-06 |",
"добавить колонку и переиспользовать Customer (и для topup) | 7.1 | 6.1 | внесён 2026-09-06; 6.2 НЕ делала (клиентская беседа) — переадресован 7.1 |",
"D6: §12 stripe_customer_id → 7.1")
patch(P07,
"оценка вычислима роутом после разбора тела — сверять с балансом там) | 6.2 | 6.1 | внесён 2026-09-06 |",
"оценка вычислима роутом после разбора тела — сверять с балансом там) | 7.1 | 6.1 | внесён 2026-09-06; 6.2 НЕ делала (клиентская беседа) — переадресован 7.1 |",
"D7: §12 точная оценка гейта → 7.1")
patch(P07,
"DELETE /auth/me не специфицирован) | 6.2 | 6.1 | внесён 2026-09-06 |",
"DELETE /auth/me не специфицирован) | 7.1 | 6.1 | внесён 2026-09-06; 6.2 НЕ делала — переадресован 7.1 (вместе с FK created_by ниже) |",
"D8: §12 удаление аккаунта → 7.1")
patch(P07,
"концы связи менять нельзя, только удалить и создать) | 6.2 | 5.4 | внесён 2026-09-05 |",
"концы связи менять нельзя, только удалить и создать) | 7.1 | 5.4 | внесён 2026-09-05; 6.2 НЕ делала (нужен серверный эндпоинт §2.4) — переадресован 7.1 |\n"
"| `prompt_templates.created_by` (и `synthesis_configs.created_by`, 02 §2.17–2.18) — голые REFERENCES users(id): удаление админа, создавшего черновик, падает по FK 23503 (класс миграции 0002) → миграция 0003 ON DELETE SET NULL | 7.1 | 6.2 | внесён 2026-09-07 («По факту 6.2» п.11) |\n"
"| `GET /prompts/:key/versions` и `GET /configs/:key/versions` без тел/значений — diff версий в AdminPromptsPage строится обходом (`?prefix=key&activeOnly=false`); дать тела в `/versions` либо `GET /…/:key/versions/:version` и убрать обход из `client/api/prompts.ts` | 7.1 | 6.2 | внесён 2026-09-07 («По факту 6.2» п.1) |\n"
"| `npm run typecheck:scripts` сломан: `scripts/test-31-requests2-4.ts` — 5× TS2769 (`userId` в insert syntheses после правок схемы); в корневой `typecheck` не входит, регресс не ловится — починить и включить в `typecheck` | 7.1 | 6.2 (дефект ≥ 5.x) | внесён 2026-09-07 |",
"D9: §12 POST /edges → 7.1 + три новых долга")

# ── E. 07 Фаза 7 + граф ─────────────────────────────────────────────────
patch(P07,
"**Завершение беседы:**\n"
"- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»\n"
"- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»\n"
"- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»\n\n"
"---\n\n"
"---\n\n"
"## 9. Ситуативные шаблоны запросов",
"**Завершение беседы:**\n"
"- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»\n"
"- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»\n"
"- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»\n\n"
"---\n\n"
"### Фаза 7 (добавлена 2026-09-07 по итогам 6.2): долги и доводка\n\n"
"> Нумерация §9–12 сохранена намеренно — на них ссылаются шапки всех\n"
"> бесед; Фаза 7 живёт внутри §8 как продолжение биллингового блока.\n"
"> Заведена потому, что реестр §12 к концу Фазы 6 накопил долги, у\n"
"> которых адресат — уже проведённая беседа: серверная работа в\n"
"> клиентских беседах (6.2) не делалась, а следующей серверной беседы\n"
"> в графе не было.\n\n"
"### Беседа 7.1: Долги реестра §12 и доводка (бэкенд + клиент)\n\n"
"**Контекст:**\n"
"- `07-conversation-protocol.md` §12 — строки с адресатом 7.1 (источник задач)\n"
"- `02-data-model.md` (§2.1 users, §2.17–2.18 created_by, §2.20–2.23 биллинг)\n"
"- `03-specification.md` (§2.1 auth, §2.4 edges, §2.9, §2.10, §2.13)\n"
"- Из предыдущих бесед: `server/db/schema.ts` + миграции 0000–0002,\n"
"  `routes/prompts.ts`, `routes/elements.ts`, `routes/taxonomy.ts`,\n"
"  `element-taxonomy.ts`, `billing-service.ts`, `subscription-service.ts`,\n"
"  `stripe-client.ts`, `client/api/prompts.ts` (обход /versions),\n"
"  `client/pages/AdminPromptsPage.tsx`, `client/components/form/SynthesisForm.tsx`\n"
"  (гейт файловых ☑-концепций 1.5b/3.2), `client/components/edit/EdgeEditor.tsx`,\n"
"  `scripts/test-31-requests2-4.ts`\n"
"- Исходник: НЕ НУЖЕН (кроме `addEdge`-логики для `POST /edges`, если решится портировать)\n\n"
"**Первый запрос:**\n"
"```\n"
"Закрываю долги реестра §12 с адресатом 7.1 (по одному запросу на группу):\n\n"
"1. Схема: миграция 0003 — ON DELETE SET NULL для prompt_templates.created_by и\n"
"   synthesis_configs.created_by; колонка users.stripe_customer_id (nullable,\n"
"   unique) — createTopup/createSubscription переиспользуют Customer.\n"
"2. Prompt Registry: тела в GET /prompts/:key/versions (или\n"
"   GET /prompts/:key/versions/:version) и value в /configs/:key/versions;\n"
"   убрать обход getTemplateVersions/getConfigVersionsFull в client/api/prompts.ts.\n"
"3. Каталоги типов: PATCH/DELETE /taxonomy/{category|relationship}-types/:id\n"
"   (admin; is_system → 403; удаление при ссылках categories/edges → SET NULL\n"
"   typeCatalogId) + вкладка «Каталоги» в AdminPromptsPage.\n"
"4. Связи: POST /syntheses/:id/edges (владелец, валидация концов, impact) +\n"
"   создание связи из EdgeEditor/GraphModal.\n"
"5. Форма синтеза: авто-импорт файловых ☑-концепций при сабмите\n"
"   (POST /syntheses/import → участник type='synthesis') — снять гейт 1.5b/3.2.\n"
"6. Биллинг: точная оценка стоимости в гейте POST /syntheses (после разбора\n"
"   тела, сверка с балансом вместо порога); DELETE /auth/me с финансовой\n"
"   историей (анонимизация users + RESTRICT-история остаётся).\n"
"7. Инструменты: починить scripts/test-31-requests2-4.ts и включить\n"
"   typecheck:scripts в корневой typecheck.\n"
"```\n\n"
"**Последующие запросы:** по одному тесту на пункт 1–7 (миграция на живом PG16;\n"
"diff версий без обхода; CRUD типов с гейтом is_system; создание связи из UI;\n"
"сабмит формы с файловой концепцией; гейт оценки; удаление аккаунта; typecheck).\n\n"
"**Завершение беседы:** стандартное (§10) + вычеркнуть закрытые строки §12.\n\n"
"---\n\n"
"---\n\n"
"## 9. Ситуативные шаблоны запросов",
"E1: Фаза 7 / беседа 7.1")
patch(P07,
"      └── 6.2 (BillingPage, AdminPromptsPage)\n",
"      ├── 6.2 (BillingPage, AdminPromptsPage)\n"
"      └── 7.1 (долги §12: схема 0003, /versions с телами, каталоги, POST /edges, авто-импорт, гейт оценки, DELETE /auth/me)\n",
"E2: граф §11 — узел 7.1")
patch(P07,
"6.2 (BillingPage, AdminPromptsPage) ← 6.1 + 0.4 (клиент каркас)\n",
"6.2 (BillingPage, AdminPromptsPage) ← 6.1 + 0.4 (клиент каркас)\n"
"7.1 (долги §12) ← 6.2 (AdminPromptsPage, api/prompts) + 6.1 (биллинг, схема) + 5.4 (EdgeEditor, TaxonomySelector) + 4.3 (POST /syntheses/import) + 3.2 (гейт SynthesisForm)\n",
"E3: граф §11 — зависимости 7.1")

# ── F. 03 ───────────────────────────────────────────────────────────────
patch(P03,
"| P1 | Список шаблонов с поиском по ключу | Фаза 2 |\n"
"| P2 | Редактирование шаблона с preview | Фаза 2 |\n"
"| P3 | Версионирование: создание версии, активация, откат | Фаза 2 |\n"
"| P4 | Тестовый запуск: генерация одного раздела с черновиком шаблона | Фаза 3 |\n"
"| P5 | Редактирование конфигов (context_deps, compat_matrix и т.д.) | Фаза 2 |",
"| P1 | Список шаблонов с поиском по ключу | Фаза 2 — СДЕЛАНО 6.2 (дерево ключей по родительскому сегменту, поиск, activeOnly) |\n"
"| P2 | Редактирование шаблона с preview | Фаза 2 — СДЕЛАНО 6.2 (чипы плейсхолдеров, предпросмотр на тестовых значениях SAMPLE_VALUES) |\n"
"| P3 | Версионирование: создание версии, активация, откат | Фаза 2 — СДЕЛАНО 6.2 (черновик → активация → откат, построчный diff; тела версий — обходом, см. §2.9) |\n"
"| P4 | Тестовый запуск: генерация одного раздела с черновиком шаблона | Фаза 3 — не сделано (не в тексте 6.2; адресата нет) |\n"
"| P5 | Редактирование конфигов (context_deps, compat_matrix и т.д.) | Фаза 2 — СДЕЛАНО 6.2 (JSON-редактор с валидацией/позицией ошибки, версии/diff/активация) |",
"F1: 03 §1.10 P1–P5")
patch(P03,
"| B1 | BYO-Key: пользователь вводит ключ, проксирование через бэкенд | MVP |",
"| B1 | BYO-Key: пользователь вводит ключ, проксирование через бэкенд | MVP — сервер 6.1, UI СДЕЛАН 6.2 (секция «API-ключ» BillingPage + форма ключа в PauseModal auth) |",
"F2: 03 §1.11 B1")
patch(P03,
"| B3 | История использования API (по синтезам, разделам) | MVP |",
"| B3 | История использования API (по синтезам, разделам) | MVP — сервер 6.1, UI СДЕЛАН 6.2 (фильтры период/синтез, итоги, byMode) |",
"F3: 03 §1.11 B3")
patch(P03,
"| B4 | Баланс сервиса (pay-as-you-go): пополнение, списание, история транзакций | Фаза 6 — сервер СДЕЛАН 6.1 (2026-09-06), UI — 6.2 |",
"| B4 | Баланс сервиса (pay-as-you-go): пополнение, списание, история транзакций | Фаза 6 — сервер СДЕЛАН 6.1 (2026-09-06), UI СДЕЛАН 6.2 (Stripe Payment Element при `VITE_STRIPE_PUBLISHABLE_KEY`, иначе dev-режим подтверждения) |",
"F4: 03 §1.11 B4")
patch(P03,
"| B6 | Подписки (Stripe Subscriptions): тарифные планы, квоты, управление подпиской | Фаза 6 — сервер СДЕЛАН 6.1 (квота потребляется один раз на операцию при взятии слота), UI — 6.2 |",
"| B6 | Подписки (Stripe Subscriptions): тарифные планы, квоты, управление подпиской | Фаза 6 — сервер СДЕЛАН 6.1 (квота потребляется один раз на операцию при взятии слота), UI СДЕЛАН 6.2 (секция «Подписка») |",
"F5: 03 §1.11 B6")
patch(P03,
"GET    /prompts/:key/versions   → { versions: PromptVersion[] }\n\n"
"POST   /prompts/:key            { body: string, description?: string }",
"GET    /prompts/:key/versions   → { versions: PromptVersion[] }\n"
"                                // ФАКТ 6.2: метаданные БЕЗ тел — diff версий\n"
"                                // в админке строится обходом\n"
"                                // GET /prompts?prefix=key&activeOnly=false\n"
"                                // (точная фильтрация по key на клиенте);\n"
"                                // долг 7.1 — тела здесь либо\n"
"                                // GET /prompts/:key/versions/:version\n\n"
"POST   /prompts/:key            { body: string, description?: string }",
"F6: 03 §2.9 /versions без тел")
patch(P03,
"GET    /configs/:key/versions   → { versions: ConfigVersion[] }\n",
"GET    /configs/:key/versions   → { versions: ConfigVersion[] }\n"
"                                // ФАКТ 6.2: без value — обход\n"
"                                // GET /configs?activeOnly=false (долг 7.1)\n",
"F7: 03 §2.9 /configs versions")
patch(P03,
"### 2.10. Billing\n",
"### 2.10. Billing\n\n"
"> **ФАКТ 6.2 (клиент):** publishable key Stripe — `VITE_STRIPE_PUBLISHABLE_KEY`\n"
"> (env vite, `.env.example`); при пустом значении BillingPage работает в\n"
"> dev-режиме: `POST /topup` → кнопка «Подтвердить платёж» → `POST /topup/confirm`\n"
"> без Elements (мок Stripe отдаёт PaymentIntent `succeeded`). Подписка\n"
"> confirm-эндпоинта не имеет — статус меняет webhook, UI перечитывает\n"
"> `GET /billing/subscription` по кнопке «Обновить».\n",
"F8: 03 §2.10 publishable key")

# ── G. 05 ───────────────────────────────────────────────────────────────
patch(P05,
"│   │   │   ├── prompts.ts              # админка Prompt Registry (6.2)\n",
"│   │   │   ├── prompts.ts              # админка Prompt Registry (6.2 СДЕЛАНО 2026-09-07: 10 функций §2.9; getTemplateVersions/getConfigVersionsFull — обход /versions без тел, долг 7.1)\n",
"G1: 05 api/prompts")
patch(P05,
"│   │   │   ├── billing.ts\n│   │   │   ├── subscription.ts\n│   │   │   └── export.ts\n",
"│   │   │   ├── billing.ts              # 7 функций §2.10: ключ, пополнение, истории (6.2 СДЕЛАНО 2026-09-07)\n"
"│   │   │   ├── subscription.ts         # 5 функций §2.10: подписка/тарифы/subscribe/cancel/resume (6.2 СДЕЛАНО)\n"
"│   │   │   └── export.ts\n",
"G2: 05 api/billing+subscription")
patch(P05,
"│   │   │   ├── BillingPage.tsx\n",
"│   │   │   ├── BillingPage.tsx         # 6.2 СДЕЛАНО: секции API-ключ / баланс (Stripe Elements или dev-режим) / подписка / история использования / транзакции\n",
"G3: 05 BillingPage")
patch(P05,
"│   │   │   └── AdminPromptsPage.tsx\n",
"│   │   │   └── AdminPromptsPage.tsx    # 6.2 СДЕЛАНО: вкладки «Шаблоны» (дерево, редактор, плейсхолдеры, предпросмотр, версии/diff/откат) и «Конфиги» (JSON-редактор); под RequireAdmin\n",
"G4: 05 AdminPromptsPage")
patch(P05,
"│   │       └── format.ts                  # Форматирование чисел, дат\n",
"│   │       ├── format.ts                  # Форматирование чисел, дат (создан 6.2: fmtUsd/fmtMoney/fmtInt/fmtDateShort/fmtDateLong/toIsoDate)\n"
"│   │       ├── text-diff.ts               # Построчный LCS-diff со свёрткой контекста (6.2; версии шаблонов и конфигов)\n"
"│   │       ├── template-placeholders.ts   # {{плейсхолдеры}} шаблонов: PLACEHOLDER_RE ≡ реестру, SAMPLE_VALUES предпросмотра (6.2)\n"
"│   │       └── stripe.ts                  # Загрузчик Stripe.js без npm + VITE_STRIPE_PUBLISHABLE_KEY + appearance (6.2)\n",
"G5: 05 utils 6.2")

# ── H. 04 §4 ────────────────────────────────────────────────────────────
patch(P04,
"| `client/hooks/useWebSocket.ts` | WebSocket-hook с reconnect |\n",
"| `client/hooks/useWebSocket.ts` | WebSocket-hook с reconnect |\n"
"| `client/pages/BillingPage.tsx`, `client/api/billing.ts`, `client/api/subscription.ts` | НОВОЕ (6.2, ФАКТ 2026-09-07): BYO-Key (маска prefix+•••, один активный), баланс (суммы $1/$5/$10/своя → PaymentIntent → Payment Element при `VITE_STRIPE_PUBLISHABLE_KEY`, иначе dev-подтверждение `/topup/confirm`), подписка (план/статус/период/квоты, тарифы, отмена/возобновление, «ожидает оплаты» до webhook), история использования (фильтры период/синтез, tfoot-итоги ≡ totals, byMode, byo вне итога), транзакции с пагинацией; названия разделов — KEY_LABELS, служебные ключи (`mode:…`) как есть |\n"
"| `client/pages/AdminPromptsPage.tsx`, `client/api/prompts.ts`, `client/utils/text-diff.ts`, `client/utils/template-placeholders.ts` | НОВОЕ (6.2, ФАКТ 2026-09-07): дерево ключей (группа = ключ без последнего сегмента), поиск/activeOnly, редактор тела с чипами `{{…}}` (`PLACEHOLDER_RE` ≡ реестру) и предпросмотром на `SAMPLE_VALUES`, «Сохранить как черновик»/«Активировать» («Сохранить и активировать» при правках), версии с построчным LCS-diff и откатом; конфиги — JSON-редактор с валидацией (позиция ошибки в обоих форматах V8), версии/diff/активация; тела версий — обходом `?prefix=key&activeOnly=false` (долг 7.1) |\n"
"| `client/components/synthesis/PauseModal.tsx` (auth-рендерер, 6.2) | ФАКТ (6.2): порт `_resumeWithNewApiKey` [25028] — поле ключа + «✓ Сохранить и продолжить» → `storeApiKey` (BYO-Key 6.1) → resume `retry`; сброс reasonKind не нужен — режим/ключ переопределяет сервер при resume; единственный вызов API из модалки (отступление от 1.4b) |\n"
"| `client/utils/stripe.ts`, `client/utils/format.ts` | НОВОЕ (6.2): загрузчик Stripe.js вставкой `<script>` (без npm; минимальные типы Payment Element/confirmPayment), `stripeConfigured()` по `VITE_STRIPE_PUBLISHABLE_KEY`; форматирование денег (`$X.XXXX` как футер документа)/целых/дат |\n",
"H: 04 §4 строки 6.2")

# ── I. 02 §2.17 ─────────────────────────────────────────────────────────
patch(P02,
"### 2.17. prompt_templates\n",
"### 2.17. prompt_templates\n\n"
"> **Примечание 6.2 (2026-09-07):** `created_by UUID REFERENCES users(id)` без\n"
"> `ON DELETE SET NULL` — удаление админа, создавшего хоть один черновик,\n"
"> падает по FK 23503 (тот же класс, что миграция 0002 закрыла для\n"
"> `api_usage`/`transactions.synthesis_id`). То же у `synthesis_configs`\n"
"> (§2.18). Долг 7.1 — миграция 0003 `ON DELETE SET NULL`.\n",
"I: 02 §2.17 created_by")

# ── J. README ───────────────────────────────────────────────────────────
patch("README.md",
"## Статус: Фазы 0–5 завершены + 6.1 (Фаза 2: 2.1, 2.2, 2.4, 2.3; Фаза 3: 3.1, 3.2; Фаза 4: 4.1, 4.2, 4.3; Фаза 5: 5.1–5.5, закрыта 2026-09-06; Фаза 6: 6.1 закрыта 2026-09-06)",
"## Статус: Фазы 0–6 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3; Фаза 3: 3.1, 3.2; Фаза 4: 4.1, 4.2, 4.3; Фаза 5: 5.1–5.5, закрыта 2026-09-06; Фаза 6: 6.1 закрыта 2026-09-06, 6.2 закрыта 2026-09-07); впереди Фаза 7 (7.1 — долги §12)",
"J1: README статус")
patch("README.md",
"BILLING_MIN_RESERVE_USD, STRIPE_API_BASE. Следующая по графу 07 — 6.2\n"
"(Billing UI + Admin Prompts Page).\n",
"BILLING_MIN_RESERVE_USD, STRIPE_API_BASE.\n"
"Беседа 6.2 (Billing UI + Admin Prompts Page, клиент) ЗАКРЫТА 2026-09-07:\n"
"BillingPage (API-ключ, баланс с Stripe Payment Element / dev-режимом,\n"
"подписка, история использования, транзакции) + AdminPromptsPage (дерево\n"
"ключей, редактор с плейсхолдерами и предпросмотром, версии/diff/откат,\n"
"JSON-конфиги) + api/billing, api/subscription, api/prompts + utils\n"
"text-diff/template-placeholders/format/stripe + RequireAdmin +\n"
"форма ключа в PauseModal (порт _resumeWithNewApiKey) + блоки 3/4/6 UI-кита\n"
"(смоук 84 ✓, tests/test-62-requests2-7.mjs 101 ✓ ×2 в браузере против\n"
"живого сервера с моками Claude/Stripe; check:integration += 2x/4ah;\n"
"долги §12 форма ключа / RequireAdmin / UI подписок закрыты); доки\n"
"пропатчены scripts/patch-docs-conv62.py. Новый env клиента:\n"
"VITE_STRIPE_PUBLISHABLE_KEY. Долги 6.2 с серверной работой → Фаза 7,\n"
"беседа 7.1 (07 §8, §11, §12).\n",
"J2: README глава 6.2")

print(f"\napplied={applied} skipped={skipped} failed={failed}")
raise SystemExit(1 if failed else 0)
