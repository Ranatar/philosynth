# PhiloSynth Service

Веб-сервис генерации, хранения, навигации и редактирования философских
концепций (Claude API). Миграция standalone `philosynth.html` (26 024 строки,
ревизия 2026-07) в многопользовательский сервис.

Документация: `docs/01-architecture.md` … `07-conversation-protocol.md`
(ревизия 2026-07-22 + правки Фазы 0; подсистемы v11 инлайнированы в 01
§4.12–4.15). История разработки — `docs/08-history.md`, грабли и уроки —
`docs/09-lessons.md`, контекст ближайшей беседы — `NEXT-CONTEXT.md`.

## Стек

TypeScript · Hono · Drizzle ORM · PostgreSQL 16 · Redis 7 · React 19 + Vite ·
Zustand · Lucia-модель сессий · Stripe (Фаза 6).

## Структура

```
packages/shared/   общий код клиента и сервера: constants (философы 106,
                   labels, ctx-keys, methods, cardinality), types (11 файлов),
                   utils
server/            Hono-бэкенд: db/schema.ts (28 таблиц), middleware
                   (auth, admin, rate-limiter), routes/ (auth,
                   syntheses, sections, elements), ws/
                   (handler + connection-manager), services/
                   (prompt-registry, element-taxonomy), config/ (12 модулей
                   извлечённых конфигов), redis.ts;
                   регрессия: audit.mts, integration-check.mts
client/            React-клиент: маршруты + Layout/Header/Sidebar,
                   api/client.ts, stores/auth-store.ts, hooks/useWebSocket.ts,
                   страницы Login/Register/Profile — рабочие, остальные —
                   заглушки (наполняются в Фазах 1+)
scripts/           эксплуатационные скрипты: extract-seed-data.mjs,
                   extract-section-templates.mjs, seed-prompts/-configs/
                   -taxonomy, идемпотентные патч-скрипты доков
                   (patch-docs-*.py)
docs/              7 проектных документов + fragments-for-conversations/
tests/             ВСЕ тесты бесед (0.3b–3.2): vm-смоуки байтовой сверки
                   с исходником (smoke-*.mjs/.mts), API-тесты (mini-Hono),
                   браузерные (puppeteer + системный Chromium). Запуск из
                   корня репо: `node tests/<файл>` / `npx tsx tests/<файл>`.
                   Типовое покрытие tests/*.ts и *.mts — через
                   `npm run typecheck:scripts`
```

Workspace-регрессия (`server/audit.mts`, `server/integration-check.mts`)
намеренно живёт в server/ — это npm-скрипты пакета
(`npm run audit / check:integration -w server`, tsconfig.checks.json).

## Быстрый старт

```bash
npm install
cp .env.example .env          # заполнить секреты
npm run db:up                 # PostgreSQL 16 + Redis 7 (docker compose)
npm run db:migrate            # миграция 0000_initial (28 таблиц)
npm run seed:prompts          # 107 шаблонов prompt_templates
npm run seed:configs          # 26 конфигов synthesis_configs
npm run seed:taxonomy         # каталоги типов: 18 категорий + 29 связей
npm run dev:server            # http://localhost:3000/api/v1/health
npm run dev:client            # http://localhost:5173 (прокси /api и /ws → :3000)
```

Seed-скрипты идемпотентны (отчёт created/updated/skip/fail; повторный прогон —
skip). Изменение схемы: править `server/db/schema.ts` → `npm run db:generate`
→ `npm run db:migrate` (не `drizzle-kit push` — он не интроспектирует
`gin_trgm_ops`).

Примечание: миграция 0000 включает `CREATE EXTENSION pg_trgm`
(триграммный индекс поиска по `syntheses.title`) — роль БД должна иметь
право создавать расширения (в dev-контейнере — да).

## Регрессионные проверки

```bash
npm run typecheck                       # tsc -b shared+server+client + checks
npm run audit -w server                 # schema ↔ types ↔ constants
npm run check:integration -w server     # импорты/контракты/живые смоуки
npm run typecheck:scripts
```

`check:integration` расширяется секциями по мере бесед — 1.5b добавила
4n: модули пула (pool-store без snapshotCurrentState, concept-file,
PoolCard/ConceptPool, SYNTH_READY_SECTIONS) и контракты (гейт
мета-синтеза СУЖЕН 3.2 до файловых концепций — остаток до 4.3,
prepareForGeneration перед POST, CONTEXT_BUDGET_PREVIEW локализован,
genealogy заполняется с 3.2); 1.6 — 2k/4o/5n: роуты чтения
(makeDocNum [12110], /public ДО /:id, duplicate без lineage-связи и
логов, viewOnly ДО запуска генерации, walker «TODO(1.6)=0», живой цикл
список→Full→sections→categories→PATCH→duplicate→DELETE); 2.4 —
2n/4t/5q: лог контекста (shared colorize-log + тонкий реэкспорт,
формула [5571] с краями живьём, постоянная viewOnly-подписка
SynthesisPage, «TODO(2.4)»-walker); 3.1 — 2p/4v/5r: мета-синтез
(модули, провайдер вместо стаба, квирк Full-блока, живые CTE
генеалогии и Selective-блок); 3.2 — 4w: клиент генеалогии
(utils/genealogy + api/lineage + GenealogyTree/LineageSearch,
дрейф-контроль текстов пересечений клиент↔сервер, каталожные
концепции в пуле и participants в POST/estimate, estimate-diff
двумя вызовами, кнопки замен CompatAdvisor, анти-регресс
setState-in-render, транспорт hasConceptParents, CSS дерева с
мобильной медиа; живьём — браузерный tests/test-32-requests2-5.mjs
52 ✓ ×2). 4.1 — 4x: режимы (mode-service/routes/клиент,
дрейф-контроль MODE_UI↔MODE_CONFIG); 4.2 — 2q/4y/5s: экспорт
(экспорты модулей; дрейф-контроль graph-style/physics ↔ клиент 1.7 и
subtitleForExport ↔ DocumentHeader, бандлы ассетов, роуты,
снятие TODO(4.2)/exportStub; живой конвейер loadGModel →
MMD/JSON/PNG/MD + ExportError NO_GRAPH). Сейчас покрывает 0.1–0.6,
1.1–1.7, 2.1–2.4, 3.1–3.2 и 4.1–4.3 целиком (4.3 — 2r/4z/5t: импорт,
дрейф двойников titleToKey/genealogy клиент↔сервер, живой importHTML
против БД); живые секции требуют
поднятых PG и Redis и засеянных prompt_templates, synthesis_configs
и каталогов таксономии.

## Статус: Фазы 0–7 завершены

| Фаза | Беседы | Закрыта |
|---|---|---|
| 0 — инфраструктура | 0.1–0.6, 0.3b | 2026-07-24 |
| 1 — MVP | 1.1–1.7, 1.4b, 1.5b, 1.6b | 2026-08-04 |
| 2 — редактирование и каскады | 2.1, 2.2, 2.4, 2.3 | 2026-08-20 |
| 3 — мета-синтез и наследование | 3.1, 3.2 | 2026-08-21 |
| 4 — режимы, экспорт, импорт | 4.1, 4.2, 4.3 | 2026-08-30 |
| 5 — inline-редактирование элементов | 5.1–5.5 | 2026-09-06 |
| 6 — биллинг и админка | 6.1, 6.2 | 2026-09-07 |
| 7 — долги и доводка | 7.1 | 2026-09-07 |

Реестр открытых долгов (07 §12) пуст; протокол бесед после 7.1 пуст —
следующий шаг возможен только как открытие Фазы 8.

Подробности: `docs/08-history.md` — единственное место хроники
(Часть I — краткая по беседам, Часть II — итоги бесед, Часть III —
журнал правок доков). Грабли и уроки, годные вне даты, —
`docs/09-lessons.md`. Контекст ближайшей беседы — `NEXT-CONTEXT.md`.

## Единство стилей с исходником

`client/src/globals.css` содержит дословный порт блока `<style>`
исходника (строки 13–3528) — интерфейс сервиса оформлен классами
исходника, а не утилитами Tailwind. Проверка паритета:

```bash
python3 scripts/css-parity-audit.py
```

Разделы A (непокрытые правила) и B (расхождения в совпавших
правилах) обязаны быть нулевыми; раздел D сверяет CSS выгружаемого
документа с исходником побайтово. Подробности и список отклонений
сервиса — в `docs/07-conversation-protocol.md`, глава «Единство
стилей с исходником».
