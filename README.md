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
tests/             ВСЕ тесты бесед (0.3b–2.2): vm-смоуки байтовой сверки
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
мета-синтеза до 3.1/4.3, prepareForGeneration перед POST,
CONTEXT_BUDGET_PREVIEW локализован); 1.6 — 2k/4o/5n: роуты чтения
(makeDocNum [12110], /public ДО /:id, duplicate без lineage-связи и
логов, viewOnly ДО запуска генерации, walker «TODO(1.6)=0», живой цикл
список→Full→sections→categories→PATCH→duplicate→DELETE). Сейчас
покрывает 0.1–0.6 и 1.1–1.6; живые секции требуют поднятых PG и Redis
и засеянных prompt_templates, synthesis_configs и каталогов таксономии.

## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.7 закрыты; Фаза 2 — беседа 2.1 закрыта

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

- **1.4 — streaming + оркестрация генерации.** streaming-manager (порт
  _streamRespOnce: SSE, классификация auth/billing/pre-stream/max-tokens/
  partial/stuck/user-abort, stuck-таймер 45с, reconnect-буфер в Redis);
  generation-service (порт generateDoc/_runGenPassesFromIdx: проходы,
  контексты в context_log, паузы с pausedState, ретраи pre-stream 1с/3с/8с,
  genCommon в генлоге, авто-заголовок из «name»); graph-parser и
  element-parser (гранулярные таблицы); POST /syntheses; WS
  subscribe_generation/cancel + resume-протокол §3.3. Сквозной тест с
  мок-SSE Claude API: test-14-requests2-8.mjs 46/46 ✓.

- **1.4b — pause/resume.** pause-resume-service (маркеры генлога,
  pausedState с перегрузками gen/plan, оценки стоимости действий из
  genParams + фактических размеров done-строк; resumeGeneration:
  stop/retry/skip/fill-missing-subs с догенерацией только недостающих
  подразделов — оборванный первым, порог продолжения 250 симв.,
  готовые идут контекстом; resumePlan — каркас до 2.2); порты
  serializeSubsectionRegen/extractPreambleConstraints и врезка
  подраздела; WS resume_generation/resume_plan; клиентский PauseModal
  (4 рендерера + бейдж). Тесты: smoke-1.4b.mts 27/27 ✓ (байтовая
  сверка промптов), tests/test-14b-requests2-6.mjs 56/56 ✓
  (max-tokens/billing/персистентность через рестарт/stop/edge cases).

Беседа 1.5 (форма + прогресс, клиент): SynthesisForm со всеми полями и
валидацией v11 (свободный синтез без seed → NO_PARTICIPANTS_SEED_REQUIRED),
PhilosopherPicker (эпохи), SectionPicker (secCtx, extGraphMetrics),
CostEstimate → POST /syntheses/estimate (серверное зеркало конвейера
оценки), CompatAdvisor + SectionWarnings → POST /syntheses/advice,
GenerationProgress (◯/⟳/✓/⚠, живой счётчик), useStreamingGeneration
(?resume= §3.3), интеграция PauseModal в CreateSynthesisPage.
Тесты: tests/test-15-requests2-7.mjs 40/40 ✓ (браузерные, puppeteer;
БД-ассерты гранулярного парсинга внутри теста).

Беседа 1.5b (Unified Concept Pool, клиент): pool-store (Zustand:
☑ участие в мета-синтезе / ◉ просмотр / derived conceptParticipants),
concept-file.ts — клиентские порты 1:1 (parseConceptFile,
importConceptAsParticipant, extract-цепочка, fetchWithFallback);
ConceptPool + PoolCard в SynthesisForm, secSynthReady c автовключением
обязательных разделов, FullBudgetPreview. Снимки вырождены (локальных
правок в сервисе нет), просмотр ◉ — read-only предпросмотр; сабмит с
☑-концепциями гейтится до 3.1/4.3. Тесты: смоук байтовой сверки 38/38 ✓
(tests/smoke-15b-request1.mjs), браузерный 35/35 ✓
(tests/test-15b-requests2-5.mjs). Доки пропатчены
scripts/patch-docs-conv15b.py (11 правок, идемпотентно).

Беседа 1.6 (транспорт чтения, сервер): GET/PATCH/DELETE /syntheses
(+ /public с ?philosopher=; POST /:id/duplicate — копия с ремапом id
рёбер и генеалогией родителей, без lineage-связи с оригиналом и без
логов), новый routes/sections.ts — список в порядке sectionOrder с
subsections из HTML и живой /:key/context (buildContextForSection),
GET-часть routes/elements.ts (GraphData + topology — транспорт графа
для 1.7), doc_num [12110] и снимок structure_sections в POST, режим
«только подписка» (viewOnly) в subscribe_generation; shared +=
pauseEstimates/subsections/viewOnly; маркеры TODO(1.6) разведены
(клиентские → TODO(1.6b)). Тесты: tests/test-16-requests2-9.mjs
84/84 ✓ ×3 (живой сервер + мок-SSE Claude API; списки/доступ/sections/
categories/doc_num/WS viewOnly/edge cases), регрессия += 2k/4o/5n.
Доки пропатчены scripts/patch-docs-conv16.py (идемпотентный
apply/skip-скрипт; дорабатывался и после закрытия беседы).

Беседа 1.6b (просмотр документа + каталог, клиент): CSS документа
целиком в globals.css (+найденная дыра спеки — disclosure-CSS шапки),
document/ ×5 (DocumentView без capsule, DocumentHeader с
disclosures/капсулой/✎→PATCH, SectionView с обогащением HTML-строки —
enrichSectionHtml через DOMParser: пострендер-вставки в
dangerouslySetInnerHTML стираются при hash-навигации, ГРАБЛЯ беседы, —
TableOfContents с якорями подразделов, DocumentFooter ровно из
totalCostUsd), catalog/ ×2 + CatalogPage (вкладки, серверный ?search=,
PATCH isPublic), synthesis-store, api/sections, viewOnly-подписка
страницы просмотра (pausedState из GET /:id, дотяжка разделов по
section_done). Тесты: tests/test-16b-requests2-9.mjs 63/63 ✓ ×3
(браузерный харнесс, данные прямыми вставками), регрессия += 4p.
Доки пропатчены scripts/patch-docs-conv16b.py.

Беседа 1.7 (визуализация графа, клиент): components/graph/ ×7
(graph-utils с динамическими палитрами и адаптером
buildGFromGraphData, Graph3D — three r128: формы по ролям,
drag/orbit/zoom/тач, Graph2D — d3-force: SVG-маркеры,
рефлексивные дуги, hull кластеров, NodePanel с секцией РАСШИРЕННЫЕ,
EdgePanel, GraphLegend с фильтрацией, GraphModal с вкладками 3D/2D),
utils/graph-{physics,geometry}, api/elements (getCategories),
кнопка «◈ Граф» в SynthesisPage, CSS графа целиком в globals.css
(+медиа-адаптация легенды ≤600px — отклонение по требованию
мобильного теста R9). Тесты: tests/test-17-requests2-9.mjs
84/84 ✓ ×2 (модульные формы/палитры через tsx-импорт клиентских
модулей + браузерные 3D/2D/панели/кластеры/hover/edge cases +
честный CDP-touch: pinch/orbit/tap). Экспорт MMD/PNG/JSON —
заглушки TODO(4.2). Доки пропатчены scripts/patch-docs-conv17.py.

Беседа 2.1 (каскадный анализ + планировщик, бэкенд):
services/cascade-analyzer.ts (computeDependents, каноникализация с
getCanonicalizer → закрыт TODO(2.1) в context-builder, intra/cross-sec
зависимые, getAffectedModes, фактические зависимости из context_log,
analyzeImpact = серверный updateLiveCascade), services/plan-order-builder.ts
(buildPlanOrder v10), services/edit-planner.ts (планы edit_plans:
создание/чтение/PATCH с пересборкой каскада/удаление, живая оценка
estimatePlanCost), routes/plans.ts (03 §2.6; execute — беседа 2.2),
wave-функции в cost-estimator (долг 1.1 закрыт). Тесты:
tests/test-21-requests2-5.mjs 39/39 ✓ ×2 (сервис + HTTP; без браузера).

Беседа 2.2 (plan-executor + регенерация, бэкенд):
services/plan-executor.ts (executePlan/confirmStep, версии, каскад после
базовых шагов, пауза kind='plan', resume-разъём заполнен — RESUME_INVALID
с resume_plan retry/skip_step снят, разъём setModeRegenerator до 4.1),
services/structure-tracker.ts, расширение generation-service
(regenerateSection/полный regenerateSubsection — долг 1.4b закрыт/
addSection/deleteSection/перенумерация §§), routes/generation.ts (03
§2.5) + POST execute в routes/plans, WS start_regen/start_sub_regen/
execute_plan/confirm_step, confirm деградации при skip (skipDegrades +
PauseModal). Тесты: tests/test-22-requests2-6.mjs 53/53 ✓ ×2 (живой
сервер + мок-SSE; без браузера). Доки пропатчены
scripts/patch-docs-conv22.py.
Доки пропатчены scripts/patch-docs-conv21.py.

Не сделано (Фаза 2+): applyReplacement (3.2) и точный
UI планов/каскадов (2.3 Edit Modal;
бэкенд-исполнение готово в 2.2), мета-синтез (3.1 — снимет гейт ☑-концепций в форме и
даст estimate-diff превью бюджета), полный пул с деревом (3.2), режимы,
экспорт/импорт (4.x — серверный parseConceptFile), billing, BYO-Key
(6.1 — ввод ключа в auth-модалке).
Фаза 1 закрыта целиком (1.1–1.7); в Фазе 2 закрыты 2.1 и 2.2.
Следующие по графу 07 — 2.3 (Edit Modal) и 2.4 (лог контекста);
параллельно можно вести 3.1 (мета-синтез).

Перед этой связкой снят предпатч доков
`scripts/patch-docs-conv16-pre.py` (идемпотентный). Он разделил беседу
1.6 по шву сервер/клиент, перенёс GET `/categories` из 5.1 в серверную
1.6, вписал недостающие роуты, диапазоны исходника, зависимости
three/d3 и блоки принятых решений; сгенерировал комплекты вложений
`1.6-document-view.js` и `1.7-graph-state-extras.js`. Учтите: скрипта
`scripts/extract-fragments.py`, на который ссылаются шапки старых
фрагментов, в репозитории нет. Его заменил
`scripts/extract-by-name.py`: комплекты 1.6, 1.7 и всех бесед фаз 2–4
описаны спецификациями `docs/fragments-for-conversations/*.spec` и
собираются по именам; остальные пока извлекаются вручную из `source/`.
