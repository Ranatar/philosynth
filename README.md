# PhiloSynth Service

Веб-сервис генерации, хранения, навигации и редактирования философских
концепций (Claude API). Миграция standalone `philosynth.html` (26 024 строки,
ревизия 2026-07) в многопользовательский сервис.

Документация: `docs/01-architecture.md` … `07-conversation-protocol.md`
(ревизия 2026-07-22 + правки Фазы 0; подсистемы v11 инлайнированы в 01
§4.12–4.15). Итоги бесед и комплекты контекста для следующих —
`NEXT-CONTEXT.md`.

## Стек

TypeScript · Hono · Drizzle ORM · PostgreSQL 16 · Redis 7 · React 19 + Vite ·
Zustand · Lucia-модель сессий · Stripe (Фаза 6).

## Структура

```
packages/shared/   общий код клиента и сервера: constants (философы 106,
                   labels, ctx-keys, methods, cardinality), types (11 файлов),
                   utils
server/            Hono-бэкенд: db/schema.ts (28 таблиц), middleware
                   (auth, admin, rate-limiter), routes/auth.ts, ws/
                   (handler + connection-manager), services/
                   (prompt-registry, element-taxonomy), config/ (12 модулей
                   извлечённых конфигов), redis.ts;
                   регрессия: audit.mts, integration-check.mts
client/            React-клиент: маршруты + Layout/Header/Sidebar,
                   api/client.ts, stores/auth-store.ts, hooks/useWebSocket.ts,
                   страницы Login/Register/Profile — рабочие, остальные —
                   заглушки (наполняются в Фазах 1+)
scripts/           extract-seed-data.mjs, seed-prompts/-configs/-taxonomy,
                   идемпотентные патч-скрипты доков, тесты 0.3b
docs/              7 проектных документов + fragments-for-conversations/
tests/             браузерные/API-тесты бесед 0.4–0.6 (puppeteer / mini-Hono)
```

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

`check:integration` расширяется секциями по мере бесед (сейчас покрывает
0.1–0.6 и 1.1–1.3); живые секции требуют поднятых PG и Redis и засеянных
prompt_templates, synthesis_configs и каталогов таксономии.

## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.3 закрыты

- **0.1 — скелет монорепо + БД.** Workspace (packages/shared, server,
  client), tsconfig'и, docker-compose, полная Drizzle-схема — 28 таблиц со
  всеми v10/v11-полями (ext_graph_metrics, structure_sections, clarity …
  keep_full_budget, parent_context_schema, paused_state, budget_mode,
  parent_spec), миграция 0000 (68 DDL), shared/types (11 файлов; schema.ts
  импортирует JSONB-типы из shared как источник истины), shared/constants и
  utils — сверены с исходником дословно. Проверено на живом PG16 (CTE
  генеалогии, JSONB round-trip, CASCADE/SET NULL).
- **0.2 — Auth + Hono + WebSocket.** Lucia-модель сессий (bcryptjs),
  middleware auth/admin, rate-limiter (Redis fixed window, fail-open),
  routes/auth (register/login/logout/me), WS handler + connection-manager
  (heartbeat, лимит 60/мин), CORS + единый формат ошибок §4.3.
- **0.3 — seed-скрипты + Prompt Registry.** extract-seed-data.mjs
  (vm-исполнение исходника) → 12 конфиг-модулей server/config/*;
  seed-prompts (107 шаблонов: system×6, method 42, level 54, mode×3 и др.)
  и seed-configs (26 конфигов); prompt-registry с Redis-кэшем fail-open,
  версионированием и strict-рендерингом; байтовая сверка реконструкции
  промптов 24/24.
- **0.3b — таксономия.** seed-taxonomy (18 типов категорий + 29 типов
  связей, is_system=true) и services/element-taxonomy: getCategoryTypes /
  getRelationshipTypes (Redis-кэш), normalizeType (точное совпадение →
  включение → Левенштейн 0.75, RU-алиасы промптов), createCustomType.
- **0.4 — каркас клиента.** Vite + React 19, tailwind с палитрой исходника
  (17 цветов через CSS-переменные), 8 маршрутов + RequireAuth,
  Layout/Header/Sidebar (мобильный бургер), api/client.ts (коды §4.3,
  обработчик 401), auth-store (login/register/restore), useWebSocket
  (reconnect + ping); браузерные тесты (puppeteer) и WS-смоук зелёные.
- **0.5 — смена пароля (A3, сервер).** POST /auth/password-change:
  анти-enumeration 401 единым ответом, транзакционная смена хэша +
  инвалидация всех сессий пользователя, кроме текущей; API-тесты 29 ✓.
- **0.6 — профиль (A3, финал).** PATCH /auth/me { displayName } (trim,
  пустая → null, лимит 100), ProfilePage (/profile, ссылка из Header):
  формы данных и смены пароля с пополевыми ошибками;
  skipUnauthorizedHandler для форм, где 401 штатен; API 13/13 и
  браузерный тест 16/16 ✓.
- **Правки Фазы 0.** Дыры доков закрыты идемпотентными патч-скриптами
  (scripts/patch-docs-*.py); .mts-проверки подключены к typecheck.

- **1.1 — synthesis engine.** utils/deep-merge (deepMergeUniq) и
  utils/topo-sort (computePredecessors, buildDynamicOrder, разрыв циклов
  по слабейшему ребру); services/synthesis-engine (resolveContextDeps,
  buildEffectiveDeps, findSubstitute — конфиги из Registry);
  compat-advisor по entry-модели `level:method` с чипами и живыми
  предупреждениями зависимостей; cost-estimator (константы и формулы
  исходника дословно).
- **1.2 — prompt builder + section defs.** extract-section-templates.mjs
  сгенерировал 146 шаблонов `section.*` (итого 253 в Registry);
  prompt-builder (buildSYS из четырёх частей, baseCtx = static + parents
  через подключаемый провайдер, словоформы кардинальности) и
  section-defs-builder (buildSectionDefs / serializeParts / groupPasses /
  patchPromptsWithSecCtx); байтовая сверка с исходником 121/121 ✓.
- **1.3 — context builder (DOM → БД).** buildContextForSection с полным
  бюджетированием (пол 40% под давлением родительских концепций,
  пережатие required за порогом 1.5×, статусы ctxLog); context-extractor
  (все ветки диспетчера: приоритетные ключи из гранулярных таблиц,
  остальные — из HTML раздела через linkedom); parent-context
  (селективный родительский контекст, 4-слойные карты из Registry);
  utils/html-parser — единственная точка входа linkedom.

Не сделано (Фаза 1+): streaming и pause/resume, оркестрация генерации,
парсеры графа и элементов, страницы синтеза/каталога/графа, каскады и
план редактирования, мета-синтез, режимы, экспорт/импорт, billing.
Следующая по графу 07 — беседа 1.4 (критический путь: в ней сходятся
1.2 и 1.3) либо 2.1 параллельно.
