# NEXT-CONTEXT — контекст ближайшей беседы

Рабочий файл, а не архив: **перезаписывается** при завершении беседы,
а не дописывается. История — `docs/08-history.md`, грабли и уроки —
`docs/09-lessons.md`, протокол — `docs/07-conversation-protocol.md`.

До 2026-09-07 сюда складывались итоги всех бесед подряд (4946 строк,
371 КБ). Они целиком переехали в `docs/08-history.md` (Часть II) и
`docs/09-lessons.md`. Здесь остались два правила, которые не стареют,
и комплект следующей беседы.

## Состояние на 2026-09-15

Фазы 0–7 закрыты. Фаза 8 «Пусковая пригодность»: 8.1–8.6 ЗАКРЫТЫ (8.6 —
модель публичности и гостевой доступ, бэкенд, 2026-09-15; см. «По факту 8.6»
в 07 и главу 8.6 в 08). Осталась 8.7 (витрина — стартовая страница, гостевая
шапка и маршруты, режим просмотра, управление публичностью; клиент) — она
ТОЛЬКО после 8.6 и теперь может идти. Реестр долгов 07 §12 пуст. Ограничения
без адресата: `isPublic` в DTO и синоним в PATCH — снять в 8.7 вместе с
«Опубликовать»; pausedState чужому на 'full' отдаётся как до 8.6; отвязки
родителя нет; `gm-hint` без CSS-правила предсуществует; админского UI
тарифов нет.

Владельцу службы для запуска биллинга: README «Как поднять биллинг»
(ключи Stripe → `npm run stripe:create-prices` → `STRIPE_PRICE_*` в `.env`
→ `npm run seed:plans`).

**Dotfile после выкладки — теперь короче.** Образец стенда называется
`env.local.example` (без точки), состояние стенда — `dev-billing-state/`; 4ak
падает, если в дереве снова есть `.env.local.example`. Dotfile остались два:
`.env.example` (`grep STRIPE_PRICE_ .env.example` — три переменные) и
`.gitignore` (`grep dev-billing-state/`) — их ПРАВКИ выкладка всё ещё может
потерять; после каждой выкладки — `git ls-files -- '.*'` и
`check:integration` на свежем клоне.

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
  (8.4 — 2ab/4am; 8.5 — 2ac/4an/5ab; 8.6 — 2ad/4ao/5ac; следующая серия —
  2ae/4ap/5ad). НОВЫЕ СЕКЦИИ — `async function sectionNN()` + `await`, не
  блоками на верхнем уровне: тело модуля упёрлось в TS2563 (09 §1, 8.5).
  Проверять на СВЕЖЕМ клоне. Требует посевов prompts/configs/taxonomy в
  рабочей БД и живого Redis; ≈ 100 с — в фоне (`setsid nohup … &` + `sleep`).
- Перед любым прогоном в песочнице — `pg_ctlcluster 16 main start` +
  `redis-server --daemonize yes --save ''`; сирот `server/index`/`vite --port`
  снимать через `ps aux | grep -E … | awk | xargs kill -9`, не pkill по маске
  (09 §1, §4, §9 п.9).

## Комплект ближайшей беседы — 8.7 (витрина: стартовая страница и управление публичностью, клиент)

Сверх универсального минимума выше (серверные файлы — как КОНТРАКТЫ, не
для правки; 8.7 сервер не трогает — все гостевые пути и модель готовы в 8.6):

- документы 01–05 целиком + `docs/09-lessons.md` целиком (07 §10; «грабли
  заведомо» — в тексте 8.7); 06 в беседу НЕ грузится; из 07 — §1, §9–12,
  врезка «Фаза 8», текст 8.7 и блоки «По факту 8.6» (модель, синоним isPublic,
  что гость получает, витрина в каталоге), «По факту 1.6b» (каталог,
  DocumentView), «По факту 8.4» (строка действий карточки — переключатель
  встаёт на место «Опубликовать»; второй шаг кнопок), «По факту 6.2» (раздел
  тарифов BillingPage — разметка для страницы цен), «По факту 5.2» (гейты по
  isOwner); из 08 — главы 8.6, 1.6b, 8.4, 6.2;
- дизайн-набор 5-6-ui-kit ОБЯЗАТЕЛЕН (клиентская беседа); исходник — только
  CSS-часть, если LandingPage потребует классов, которых нет в globals.css
  (правило «Единство стилей»: новые классы — в части 3 с префиксом `app-`);
- сервер как контракт: `server/routes/syntheses.ts` (GET /public и GET /:id
  по смотрящему — гостю без стоимости/токенов/паузы, sections одним ответом
  на 'full', витрина без разделов; PATCH visibility + 4 флага, isPublic —
  синоним), `server/routes/billing.ts` (GET /plans гостю), `server/middleware/
  auth.ts` (optionalAuth: просроченная cookie = гость), `packages/shared/types/
  synthesis.ts` (visibility/флаги/authorName?/scope/sections?, cost-поля
  необязательны), `packages/shared/utils/visibility.ts` (effectiveFlags — чтобы
  UI объяснял, почему логи/мета погашены на витрине);
- клиент: `client/src/App.tsx` (маршруты: `/` → LandingPage гостю, RequireAuth
  снимается с `/catalog` и `/synthesis/:id` — гость смотрит публичное),
  `components/layout/Header.tsx`, `Sidebar.tsx`, `Layout.tsx` (гостевая
  шапка: вход/регистрация вместо профиля), `api/client.ts` (глобальный
  401-обработчик — гостю на гостевых путях 401 не приходит, но
  `setUnauthorizedHandler` ведёт на /login: проверить, что гость не выбивается
  с публичной страницы), `stores/auth-store.ts` (restore без сессии — состояние
  «гость», не ошибка), `pages/CatalogPage.tsx` + `components/catalog/
  SynthesisCard.tsx` + `SynthesisList.tsx` (вкладка «Публичные» гостю без
  «Мои»; переключатель ступени private/showcase/full + четыре флага вместо
  «Опубликовать»; синоним isPublic снять), `pages/SynthesisPage.tsx` +
  `components/document/DocumentView.tsx`/`DocumentHeader.tsx`/
  `DocumentFooter.tsx` (режим просмотра гостя: документ из `synthesis.sections`
  одного ответа, без GET /sections, без WS/PauseModal/кнопок правки и графа;
  authorName в шапке; футер без строки стоимости — поля нет), `pages/
  BillingPage.tsx` (разметка тарифов → страница цен без входа через GET
  /plans), `client/src/globals.css` (часть 3 — классы витрины `app-landing-*`);
- харнессы-образцы: `tests/test-86-requests2-14.mjs` (что именно гость получает
  по API — ожидания браузерного теста строить от него), `tests/test-84-
  requests2-10.mjs` (браузерный стенд каталога: сервер :3000 + vite :5199,
  `data-testid` панелей, второй шаг кнопок, тихая перечитка), `tests/test-16b-
  requests2-9.mjs` (просмотр документа).

## Что 8.6 оставила знать всем беседам

- Правило чтения одно — `loadSynthesisForRead(id, userId | null)` →
  `{ viewer: owner|user|guest, scope: full|showcase }`; действенность флагов —
  ТОЛЬКО `effectiveFlags` (showLogs/showPrompts/allowMeta лишь при 'full',
  showAuthor на обеих неприватных; сырые значения не сбрасываются); отсечение
  полей — ТОЛЬКО `projectSynthesis`/`projectPreview`. Новый роут чтения обязан
  после 404/403 ставить `scope === 'showcase' → 403 showcaseForbiddenJson`,
  если отдаёт содержание.
- Гостевых путей ровно три; всё остальное под `requireAuth`. Гостю никогда —
  стоимость, токены, логи, запросы, пауза.
- `isPublic` в DTO — производное `visibility !== 'private'` (@deprecated), в
  PATCH — синоним до 8.7; колонки в БД нет.
- Экспорт HTML несёт футер-зеркало DocumentFooter (`#footerCost`,
  `#footerPhil`); безлоговая выгрузка (show_logs недейственен) — пустые
  genLog/ctxLog в embedded state, стоимость в футере.
- Патч-скрипты: правка поверх ранее применённой — только новой `patch()` с
  `superseded_by`; идемпотентность проверять на ЧИСТОЙ копии ×3 и `diff -rq`
  с рабочими доками.
- Миграция с переносом данных между ADD и DROP пишется рукой вместе со
  снапшотом; `drizzle-kit generate` после неё обязан молчать.

## Что 8.5 оставила знать всем беседам

- Сопоставление по ИМЕНИ никогда не пишет связь — только предложение
  (`lineageCandidates`); связь создаёт человек `POST /lineage/link`, и
  владельцем обоих синтезов должен быть он (публичность родителя — не право).
- Цикл родословной проверяется по ПОТОМКАМ (`isDescendantOf`), не по предкам.
- «Второй шаг кнопок» действует и для связывания (отвязки нет) — образец
  `LineageCandidateBlock` в ImportPage: сброс по `mousedown` мимо блока,
  `LINEAGE_EXISTS` = цель достигнута.
- `summary` шапки документа капителью — сверки `textContent`, не `innerText`.
- Файлы-фикстуры для генеалогии строятся из живого файла одностраничника
  правкой JSON `philosynth-state` (T85_FILE) — второго файла у бесед нет.

## Что 8.4 оставила знать всем клиентским беседам

- Подтверждение необратимого действия — ВТОРОЙ ШАГ кнопок («Точно
  удалить?» + «Отмена», клик мимо сбрасывает — `mousedown` на `document`),
  не `window.confirm`; образцы — SynthesisCard 8.4, EdgePanel 8.4,
  TransformPanel 5.5, LineageCandidateBlock 8.5.
- Перечитка списка после действия — тихая (`fetchList({ silent: true })`):
  спиннер размонтирует карточки с локальным состоянием.
- Виды графа собираются один раз; новая ссылка `data` → пересборка сменой
  `key` (GraphModal 8.4), не правкой эффектов внутри Graph2D/Graph3D.
- `status='generating'` сам по себе НЕ даёт 409 — только активная операция
  процесса; в тестах слот занимается моком, держащим SSE-стрим по маркеру
  в промпте (`SLOW84`).

## Что 8.3 оставила знать всем стендовым беседам

- `tools/dev-billing.sh` сеет тарифы сам (`npm run seed:plans`,
  `STRIPE_PRICE_*=price_mock_*` из `.env.local.example`); планы
  `starter/pro/academic` на общей БД активны — тесты их не удаляют и не
  пересоздают (test-62 — `starter62`, test-82 подписывается на посеянный
  `starter`); повторный старт стенда — одни skip (по отчёту посева).
- Сиды читают внешние ключи из `process.env` в момент запуска: дочерний
  `tsx` с явным окружением, а не правка `.env`.
- Роли — две; `admin` достижим только через `npm run seed:admin`; стендам
  проще `UPDATE users SET role='admin'` либо дочерний bootstrap с
  `DATABASE_URL` стенда.
