# NEXT-CONTEXT — контекст ближайшей беседы

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
