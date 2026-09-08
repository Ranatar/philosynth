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
пригодность» ОТКРЫТА: задачи — `06-dev-strategy.md` §2, тексты бесед
8.1–8.3 — `07` §8, узлы графа — `07` §11. Ближайшая беседа — 8.1.

## Универсальный минимум любой серверной беседы

- `server/db/schema.ts` — 28 таблиц, единственный источник структуры БД
- `server/db/index.ts` — db/sql/closeDb (нужен всем сервисам)
- `server/env.ts` — типизированные env (нужен при касании конфигурации)
- `server/package.json`, `packages/shared/package.json`,
  `tsconfig.base.json` + tsconfig'и — при любых новых файлах/зависимостях
  (иначе беседа пересоздаст workspace по-своему)

## В завершение КАЖДОЙ беседы (регрессионные инструменты)

- `server/audit.mts` (`npm run audit`) — schema↔types↔constants
- `server/integration-check.mts` (`npm run check:integration`) —
  импорты/экспорты/async; расширять списком новых модулей беседы

## Комплект ближайшей беседы — 8.1 (администратор)

Сверх универсального минимума выше (schema.ts, db/index.ts, env.ts,
package.json + tsconfig'и):

- документы 01–05 целиком + `docs/09-lessons.md` целиком (07 §10);
  06 в беседу НЕ грузится — он для подготовительного шага;
- `server/middleware/auth.ts`, `server/middleware/admin-only.ts` (0.2);
- `server/routes/auth.ts` (0.5/0.6/7.1),
  `server/services/account-deletion.ts` (7.1);
- `server/services/prompt-registry.ts` (0.3),
  `server/services/element-taxonomy.ts` (0.3b),
  `server/routes/taxonomy.ts` (5.3/7.1) — точки записи журнала;
- миграции 0000–0003 + `meta/_journal.json` (тег миграции 0004);
- `scripts/seed-taxonomy.ts` — образец идемпотентного скрипта;
- `client/pages/AdminPromptsPage.tsx` (6.2/7.1), `client/api/prompts.ts`,
  `client/api/client.ts` — хозяин вкладки «Доступ» и коды ошибок;
- `tests/test-71-requests2-8.mjs` — харнесс (живой сервер + моки +
  браузер + отдельная БД под миграции), переиспользовать.

Исходник `philosynth.html` не нужен: беседа целиком новая.
