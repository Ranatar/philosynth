# NEXT-CONTEXT — контекст ближайшей беседы

Рабочий файл, а не архив: **перезаписывается** при завершении беседы,
а не дописывается. История — `docs/08-history.md`, грабли и уроки —
`docs/09-lessons.md`, протокол — `docs/07-conversation-protocol.md`.

До 2026-09-07 сюда складывались итоги всех бесед подряд (4946 строк,
371 КБ). Они целиком переехали в `docs/08-history.md` (Часть II) и
`docs/09-lessons.md`. Здесь остались два правила, которые не стареют,
и комплект следующей беседы.

## Состояние на 2026-09-14

Фазы 0–7 закрыты. Фаза 8 «Пусковая пригодность»: первоначальный состав
8.1–8.5 ЗАКРЫТ (8.5 — родословная при импорте, 2026-09-14; см. «По факту
8.5» в 07 и главу 8.5 в 08). Добавлены 2026-09-14 и НЕ проведены: 8.6
(модель публичности и гостевой доступ — бэкенд, миграция 0005) и 8.7
(витрина — клиент, только после 8.6). Реестр долгов 07 §12 пуст.
Ограничения без адресата: отвязки родителя нет; `gm-hint` в GraphModal
без CSS-правила (предсуществует); админского UI тарифов нет.

Владельцу службы для запуска биллинга: README «Как поднять биллинг»
(ключи Stripe → `npm run stripe:create-prices` → `STRIPE_PRICE_*` в `.env`
→ `npm run seed:plans`).

**ПЕРВОЕ ДЕЛО любой беседы после выкладки — dotfile.** ТРИ раза подряд (HEAD
83aaf2b, 8f9bae0, cd46374) загрузка «Add files via upload» теряла
`.env.local.example`, строку `.dev-billing/` в `.gitignore` и правки
`.env.example` (`STRIPE_PRICE_*`); `check:integration` (4ak/4al) на чистом
клоне падает ещё до работы беседы. Сверить `git ls-files -- '.*'` с 05 и
`grep STRIPE_PRICE_ .env.example`; чего нет — воссоздать по 05 и требованиям
4ak/4al (09 §2). 8.6 стоит решить это раз и навсегда (кандидаты — 09 §2,
беседа 8.5).

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
  (8.3 — 2aa/4al/5aa; 8.4 — 2ab/4am; 8.5 — 2ac/4an/5ab; следующая серия —
  2ad/4ao/5ac). НОВЫЕ СЕКЦИИ — `async function sectionNN()` + `await`, не
  блоками на верхнем уровне: тело модуля упёрлось в TS2563 (09 §1, 8.5).
  Проверять на СВЕЖЕМ клоне. Требует посевов prompts/configs/taxonomy в
  рабочей БД и живого Redis; ≈ 100 с — в фоне (`setsid nohup … &` + `sleep`).
- Перед любым прогоном в песочнице — `pg_ctlcluster 16 main start` +
  `redis-server --daemonize yes --save ''`; сирот `server/index`/`vite --port`
  снимать через `ps aux | grep -E … | awk | xargs kill -9`, не pkill по маске
  (09 §1, §4, §9 п.9).

## Комплект ближайшей беседы — 8.6 (модель публичности и гостевой доступ, бэкенд)

Сверх универсального минимума выше:

- документы 01–05 целиком + `docs/09-lessons.md` целиком (07 §10; «грабли
  заведомо» — в тексте 8.6); 06 в беседу НЕ грузится; из 07 — §1, §9–12,
  врезка «Фаза 8», текст 8.6 и блоки «По факту 1.6» (loadSynthesisForRead,
  /public ДО /:id), «По факту 2.4» (четыре пути логов), «По факту 4.2»
  (экспорт), «По факту 6.1» (/billing/plans, resolveBilling), «По факту 8.1»
  (миграция 0004 — образец), «По факту 8.5» (POST /lineage/link проверяет
  владение ОБОИХ синтезов — под новую модель видимости оставить владельческим;
  pruneInvisible потомков — перевести на visibility); из 08 — главы 1.6, 2.4,
  8.1, 8.5;
- исходник и дизайн-набор НЕ нужны (беседа серверная, публикации в
  одностраничнике нет);
- сервер: `server/routes/syntheses.ts` (loadSynthesisForRead, GET /public,
  участники мета-синтеза), ВСЕ потребители loadSynthesisForRead —
  `routes/logs.ts`, `export.ts`, `elements.ts`, `sections.ts`, `modes.ts`,
  `transforms.ts`, `enrichment.ts`, `lineage.ts` (с 8.5 — и POST link),
  `server/middleware/auth.ts` (рядом с requireAuth — optionalAuth),
  `server/routes/billing.ts` (GET /plans гостю), `server/db/schema.ts` +
  миграции 0000–0004 (0005 — первая операция), `server/integration-check.mts`;
- типы: `packages/shared/types/synthesis.ts` (SynthesisFull/SynthesisPreview —
  is_public → visibility/show_*/allow_meta);
- харнессы-образцы: `tests/test-81-requests2-10.mjs` (отдельная пустая БД под
  миграции), `tests/test-85-requests2-8.mjs` (сервер + браузер без мока
  Claude; фикстуры из живого файла), `tests/test-16b-*`/`test-24-*` (чтение и
  логи — что должно сломаться для гостя).

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
