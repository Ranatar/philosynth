# NEXT-CONTEXT — контекст ближайшей беседы

Рабочий файл, а не архив: **перезаписывается** при завершении беседы,
а не дописывается. История — `docs/08-history.md`, грабли и уроки —
`docs/09-lessons.md`, протокол — `docs/07-conversation-protocol.md`.

До 2026-09-07 сюда складывались итоги всех бесед подряд (4946 строк,
371 КБ). Они целиком переехали в `docs/08-history.md` (Часть II) и
`docs/09-lessons.md`. Здесь остались два правила, которые не стареют,
и комплект следующей беседы.

## Состояние на 2026-09-09

Фазы 0–7 закрыты, реестр долгов 07 §12 пуст. Фаза 8 «Пусковая
пригодность» ОТКРЫТА: 8.1 (администратор), 8.2 (локальный стенд
биллинга — оснастка) и 8.3 (тарифы: посев и заведение Prices в Stripe)
ЗАКРЫТЫ — см. «По факту 8.1» / «8.2» / «8.3» в 07 и главы 8.1–8.3 в 08.
Остались 8.4 (управление своим содержимым — клиент) и 8.5 (родословная
при импорте); они независимы от всех прочих и друг от друга — порядок
любой. Ближайшая — 8.4. Тексты — `07` §8, узлы графа — `07` §11.

Владельцу службы для запуска биллинга: README «Как поднять биллинг»
(ключи Stripe → `npm run stripe:create-prices` → `STRIPE_PRICE_*` в `.env`
→ `npm run seed:plans`).

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
  (8.1 — секции 2z/4aj/5z; 8.2 — 4ak; 8.3 — 2aa/4al/5aa; следующая серия —
  2ab/4am/5ab). Проверять на СВЕЖЕМ клоне, не в песочнице с накопленными
  файлами: 8.3 нашла, что `.env.local.example` и `.dev-billing/` в
  `.gitignore` не пережили выкладку, а 4ak на них завязана (09 §2, 8.3).
  Требует посевов prompts/configs/taxonomy в рабочей БД и живого Redis;
  ≈ 100 с — в фоне (`setsid nohup … &` + `sleep`).
- Перед любым прогоном в песочнице — `pg_ctlcluster 16 main start` (снимает
  stale pid) + `redis-server --daemonize yes --save ''`: демоны гибнут и между
  ходами, и посреди длинного хода (09 §1, §9 п.9).

## Комплект ближайшей беседы — 8.4 (управление своим содержимым, клиент)

Сервер эта беседа НЕ ПРАВИТ. Сверх универсального минимума выше (нужен
только для чтения форм ответов):

- документы 01–05 целиком + `docs/09-lessons.md` целиком (07 §10; в тексте
  8.4 перечислены грабли §2/§4/§8, которые беседа заденет заведомо); 06 в
  беседу НЕ грузится; из 07 — §1, §9–12, врезка «Фаза 8», текст 8.4 и
  блоки «По факту 1.6b», «По факту 5.4», «По факту 5.5», «По факту 7.1»;
  из 08 — главы 1.6b (каталог/просмотр), 5.4 (правка связи), 5.5
  (TransformPanel — образец подтверждения вторым шагом), 7.1
  (EdgeCreateForm, авто-импорт);
- `docs/fragments-for-conversations/5-6-ui-kit.md` + `.css` + `.html` —
  беседа вводит НОВЫЕ элементы интерфейса (строка действий карточки,
  двухшаговое подтверждение, правка по месту); сверяться обязательно;
- клиент: `client/src/pages/CatalogPage.tsx` и
  `client/src/components/catalog/SynthesisCard.tsx` (1.6b; фильтр потомков
  3.2), `client/src/api/syntheses.ts` (1.6b), `client/src/api/elements.ts`
  (5.1/5.2/5.4 — `updateCapsule`, `deleteEdge` написаны и не вызываются),
  `client/src/api/lineage.ts` (3.2 — `GET /lineage/descendants` для числа
  потомков), `client/src/api/transforms.ts` + `client/src/hooks/useTransformStream.ts`
  (5.5) и `client/src/api/prompts.ts` (6.2/7.1) — только для уборки мёртвых
  функций, `client/src/components/graph/EdgePanel.tsx` и `GraphModal.tsx`
  (1.7; правка связи — 5.4), `client/src/components/document/DocumentHeader.tsx`
  (1.6b), `client/src/components/edit/TransformPanel.tsx` (5.5);
- сервер ТОЛЬКО ДЛЯ ЧТЕНИЯ: `server/routes/syntheses.ts` (1.6 — DELETE,
  duplicate, PATCH title) и `server/routes/elements.ts` (5.1 — capsule,
  edges), `server/routes/lineage.ts` (3.1 — descendants);
- харнессы-образцы: `tests/test-62-requests2-7.mjs` и
  `tests/test-83-requests2-8.mjs` (браузер против живого сервера; клики по
  перерисованным спискам через `$eval(sel, el => el.click())`, ожидание
  каждой секции по своему `data-testid`); `python3 scripts/css-parity-audit.py` перед
  правкой оформления (05, «Единство стилей»).

Исходник `philosynth.html` не нужен: в одностраничнике управления
концепциями нет — портировать нечего, оформление из UI-кита.

## Что 8.3 оставила знать всем стендовым беседам

- `tools/dev-billing.sh` сеет тарифы сам (`npm run seed:plans`,
  `STRIPE_PRICE_*=price_mock_*` из `.env.local.example`): планы
  `starter/pro/academic` на общей БД активны — тесты их не удаляют и не
  пересоздают (test-62 — `starter62`, test-82 подписывается на посеянный
  `starter`); повторный старт стенда — одни skip (по отчёту посева).
- Сиды читают внешние ключи из `process.env` в момент запуска: дочерний
  `tsx` с явным окружением, а не правка `.env`; «без переменной» — удалить
  её из копии env.
- Мок ставит в id метку запуска; `/__mock/health` сам считается запросом
  (дельта +1); секции BillingPage грузятся своими запросами — ждать целевой
  `data-testid`, не фразу статуса (она появляется до `reload()`).
- Роли — две; `admin` достижим только через `npm run seed:admin`
  (BOOTSTRAP_ADMIN_EMAIL/PASSWORD из env). Стендам проще `UPDATE users SET
  role='admin'` (как test-71) либо дочерний запуск bootstrap с
  `DATABASE_URL` стенда (как test-81).
- Каждое админ-действие и каждый посев тарифов — строка `admin_audit`
  (`plan.seeded`, actor NULL); `TRUNCATE users CASCADE` снесёт и журнал.
