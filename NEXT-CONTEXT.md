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
пригодность» ОТКРЫТА: 8.1 (администратор) ЗАКРЫТА 2026-09-08 — см.
«По факту 8.1» в 07 и главу 8.1 в 08. Ближайшая беседа — 8.2 (тарифы);
8.3 — только после неё. Тексты — `07` §8, узлы графа — `07` §11.

## Универсальный минимум любой серверной беседы

- `server/db/schema.ts` — 29 таблиц (с 8.1: + admin_audit), единственный
  источник структуры БД
- `server/db/index.ts` — db/sql/closeDb (нужен всем сервисам)
- `server/env.ts` — типизированные env (нужен при касании конфигурации)
- `server/package.json`, `packages/shared/package.json`,
  `tsconfig.base.json` + tsconfig'и — при любых новых файлах/зависимостях
  (иначе беседа пересоздаст workspace по-своему)

## В завершение КАЖДОЙ беседы (регрессионные инструменты)

- `server/audit.mts` (`npm run audit`) — schema↔types↔constants
- `server/integration-check.mts` (`npm run check:integration`) —
  импорты/экспорты/async; расширять списком новых модулей беседы
  (8.1 — секции 2z/4aj/5z; следующая серия — 2aa/4ak/5aa). Требует
  посевов prompts/configs/taxonomy в рабочей БД и живого Redis;
  ≈ 100 с — в фоне (`setsid nohup … &` + `sleep`).

## Комплект ближайшей беседы — 8.2 (тарифы)

Сверх универсального минимума выше (schema.ts, db/index.ts, env.ts,
package.json + tsconfig'и):

- документы 01–05 целиком + `docs/09-lessons.md` целиком (07 §10);
  06 в беседу НЕ грузится — он для подготовительного шага;
  из 07 — §1, §9–12, врезка «Фаза 8», текст 8.2 и блоки «По факту 6.1»,
  «По факту 7.1», «По факту 8.1»; из 08 — главы 6.1, 6.2, 7.1, 8.1;
- `server/services/subscription-service.ts` (6.1/7.1 — планы,
  ensureStripeCustomer), `server/services/stripe-client.ts` (6.1 — тонкий
  REST-клиент; сюда добавляются /v1/products и /v1/prices),
  `server/services/billing-service.ts` (потребитель планов);
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
- `tests/test-71-requests2-8.mjs` (мок Stripe REST: parseForm `a[b][c]`,
  шесть маршрутов) и `tests/test-81-requests2-10.mjs` (стенд на отдельной
  пустой БД с `drizzle-kit migrate`) — харнессы для переиспользования.

Исходник `philosynth.html` не нужен: беседа целиком новая.

## Что 8.1 оставила 8.2/8.3 знать

- Роли — две; `admin` достижим только через `npm run seed:admin`
  (BOOTSTRAP_ADMIN_EMAIL/PASSWORD из env). Стендам, которым нужен
  администратор, проще `UPDATE users SET role='admin'` (как test-71) либо
  дочерний запуск bootstrap с `DATABASE_URL` стенда (как test-81).
- Каждое админ-действие — строка `admin_audit`; уборка стендов:
  строки журнала на пользователя не мешают удалению (FK SET NULL), но
  `TRUNCATE users CASCADE` снесёт и журнал.
- `check:integration` падал на `PageStub.tsx` в дереве — файл удалён 8.1;
  при выкладке через «Add files via upload» проверять
  `git ls-files client/src/pages`.
