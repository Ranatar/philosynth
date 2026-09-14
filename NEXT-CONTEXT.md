# NEXT-CONTEXT — контекст ближайшей беседы

Рабочий файл, а не архив: **перезаписывается** при завершении беседы,
а не дописывается. История — `docs/08-history.md`, грабли и уроки —
`docs/09-lessons.md`, протокол — `docs/07-conversation-protocol.md`.

До 2026-09-07 сюда складывались итоги всех бесед подряд (4946 строк,
371 КБ). Они целиком переехали в `docs/08-history.md` (Часть II) и
`docs/09-lessons.md`. Здесь остались два правила, которые не стареют,
и комплект следующей беседы.

## Состояние на 2026-09-14

Фазы 0–7 закрыты. Фаза 8 «Пусковая пригодность» ОТКРЫТА: 8.1
(администратор), 8.2 (локальный стенд биллинга — оснастка), 8.3 (тарифы:
посев и заведение Prices в Stripe) и 8.4 (управление своим содержимым —
клиент) ЗАКРЫТЫ — см. «По факту 8.1» … «8.4» в 07 и главы 8.1–8.4 в 08.
Осталась ОДНА беседа — 8.5 (родословная при импорте: сопоставление
родителя по имени предложением, бэкенд + клиент); она независима от всех
прочих. Реестр долгов 07 §12 — один долг ОСНАСТКИ, адресат 8.5:
`tests/test-54-requests2-6.mjs` устарел с 5.5 (см. §12). Тексты — `07` §8,
узлы графа — `07` §11.

Владельцу службы для запуска биллинга: README «Как поднять биллинг»
(ключи Stripe → `npm run stripe:create-prices` → `STRIPE_PRICE_*` в `.env`
→ `npm run seed:plans`).

**ПЕРВОЕ ДЕЛО любой беседы после выкладки — dotfile.** Дважды подряд (HEAD
83aaf2b и 8f9bae0) загрузка «Add files via upload» теряла
`.env.local.example`, строку `.dev-billing/` в `.gitignore` и правки
`.env.example` (`STRIPE_PRICE_*`); `check:integration` (4ak/4al) на чистом
клоне падает ещё до работы беседы. Сверить `git ls-files -- '.*'` с 05 и
`grep STRIPE_PRICE_ .env.example`; чего нет — воссоздать по 05 и требованиям
4ak/4al (09 §2, беседы 8.3/8.4).

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
  (8.1 — секции 2z/4aj/5z; 8.2 — 4ak; 8.3 — 2aa/4al/5aa; 8.4 — 2ab/4am;
  следующая серия — 2ac/4an/5ab). Проверять на СВЕЖЕМ клоне, не в песочнице с накопленными
  файлами: 8.3 нашла, что `.env.local.example` и `.dev-billing/` в
  `.gitignore` не пережили выкладку, а 4ak на них завязана (09 §2, 8.3).
  Требует посевов prompts/configs/taxonomy в рабочей БД и живого Redis;
  ≈ 100 с — в фоне (`setsid nohup … &` + `sleep`).
- Перед любым прогоном в песочнице — `pg_ctlcluster 16 main start` (снимает
  stale pid) + `redis-server --daemonize yes --save ''`: демоны гибнут и между
  ходами, и посреди длинного хода (09 §1, §9 п.9).

## Комплект ближайшей беседы — 8.5 (родословная при импорте, бэкенд + клиент)

Сверх универсального минимума выше:

- документы 01–05 целиком + `docs/09-lessons.md` целиком (07 §10; в тексте
  8.5 перечислены грабли §2/§4/§8, которые беседа заденет заведомо); 06 в
  беседу НЕ грузится; из 07 — §1, §9–12, врезка «Фаза 8», текст 8.5 и блоки
  «По факту 4.3» (импорт), «По факту 3.2» (lineage, дерево; у 3.1 своего блока нет — итоги в главе 08), «По факту
  6.2» (гонка статуса, капитель — в «граблях заведомо»), «По факту 8.4»
  (образец второго шага кнопок и правка по месту, если блок предложения
  родителя потребует подтверждения); из 08 — главы 4.3 (import-service,
  ImportPage), 3.1 (lineage-service, CTE descendants/ancestors), 3.2
  (GenealogyTree, isMetaSynthesis в SynthesisPage, utils/genealogy —
  `reconstructGenealogy` уже портирован, заново НЕ портировать);
- `docs/fragments-for-conversations/5-6-ui-kit.md` (+ `.css`/`.html`) —
  блок предложения родителя в ImportPage: `.callout`, `.action-btn`;
  новых классов, скорее всего, не нужно, но сверить; `python3
  scripts/css-parity-audit.py` перед правкой оформления;
- сервер: `server/services/import-service.ts` (4.3 — ветка UUID
  `p.synthesisId` СОХРАНЯЕТСЯ; сопоставление по имени — предложением),
  `server/routes/lineage.ts` + `server/services/lineage-service.ts` (3.1 —
  новый `POST /syntheses/:id/lineage/link`), `server/routes/syntheses.ts`
  в части `POST /syntheses/import` (форма ответа += lineageCandidates);
- клиент: `client/src/pages/ImportPage.tsx` (4.3), `client/src/pages/
  SynthesisPage.tsx` в части `isMetaSynthesis` и загрузки дерева (3.2),
  `client/src/components/lineage/GenealogyTree.tsx`, `client/src/utils/
  genealogy.ts`, `client/src/api/lineage.ts` (3.2), `client/src/api/
  client.ts` (ApiErrorCode — новые коды, если появятся);
- типы: `packages/shared/types/lineage.ts`, `packages/shared/types/
  synthesis.ts`;
- харнессы-образцы: `tests/test-43-requests2-5.mjs` (импорт файла 1,1 МБ —
  в фоне с логом), `tests/test-32-requests2-5.mjs` (дерево/потомки),
  `tests/test-84-requests2-10.mjs` (браузер против живого сервера,
  второй шаг кнопок, `$eval`-клики по перерисованным спискам);
- долг оснастки §12: `tests/test-54-requests2-6.mjs` — перевернуть
  ожидания «typeCatalogId=null» под факт 5.5 («≈ из каталога»), разобрать
  таймаут R5b; беседа 8.5 — последняя в фазе, чистит стенд.

Исходник `philosynth.html` — только для справки по генеалогии; порты
готовы (3.2, 4.3).

## Что 8.4 оставила знать всем клиентским беседам

- Подтверждение необратимого действия — ВТОРОЙ ШАГ кнопок («Точно
  удалить?» + «Отмена», клик мимо сбрасывает — `mousedown` на `document`),
  не `window.confirm`; образцы — SynthesisCard 8.4, EdgePanel 8.4,
  TransformPanel 5.5.
- Перечитка списка после действия — тихая (`fetchList({ silent: true })`):
  спиннер размонтирует карточки с локальным состоянием.
- Виды графа собираются один раз; новая ссылка `data` → пересборка сменой
  `key` (GraphModal 8.4), не правкой эффектов внутри Graph2D/Graph3D.
- Капсула правится текстом; HTML собирает `utils/capsule-html.ts`,
  сохраняя обёртку секции и якорь `data-section="Капсула"`.
- `status='generating'` сам по себе НЕ даёт 409 — только активная операция
  процесса; в тестах слот занимается моком, держащим SSE-стрим по маркеру
  в промпте (`SLOW84`).
- Текстовые проверки исходников: строчные комментарии стрипать ПЕРВЫМИ
  (`// … services/export/*` в GraphModal иначе открывает ложный блок).

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
