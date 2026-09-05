# PhiloSynth Service — Архитектура

## 1. Обзор системы

PhiloSynth Service — веб-сервис для генерации, хранения, навигации и редактирования философских концепций, синтезированных с помощью Claude API. Трансформирует одиночное browser-приложение (26K строк, monolithic HTML; ревизия 2026-07) в многопользовательский сервис с персистентным хранением, каталогом концепций и графом наследования.

### Ключевые отличия от standalone-файла

| Аспект | Standalone (philosynth.html) | Service |
|---|---|---|
| Состояние | DOC_STATE в памяти вкладки | PostgreSQL + Redis |
| Пользователи | Один (анонимный) | Многопользовательский, аккаунты |
| Хранение | HTML-файл с встроенным JSON | Гранулярная БД: разделы, категории, тезисы |
| Стриминг | Браузер → Claude API напрямую | Клиент ↔ WebSocket ↔ Бэкенд ↔ Claude SSE |
| Промпты | Захардкожены в JS (~7000 строк) | Prompt Registry (БД + кэш, без редеплоя) |
| Каталог | Папка файлов на диске | Поиск, фильтрация, граф наследования |
| Редактирование | Перегенерация разделов/подразделов | + ручное inline-редактирование элементов |
| Биллинг | Свой API-ключ, стоимость в футере | BYO-Key / баланс (pay-as-you-go) / подписка (Stripe Subscriptions) |

> **v10**: список философов расширен на 36 позиций — всего 106 (Демокрит, Флоренский, Шестов и др.).
>
> **v11 (2026-07)**: в исходнике добавлены подсистемы — Pause/Resume (4.12),
> селективный родительский контекст + режим бюджета (4.13), кардинальность
> участников и свободный синтез (4.14), MODE_DEPS и прочее (4.15).
> Полные спецификации подсистем инлайнированы в секции 4.12–4.15.

## 2. Стек технологий

```
Frontend:    React 19 + TypeScript + Vite
             Tailwind CSS (утилиты) + CSS-переменные (дизайн-система из исходника)
             D3.js (2D-граф) + Three.js (3D-граф)
             Zustand (состояние)

Backend:     TypeScript + Hono (HTTP-фреймворк)
             Node.js 22+

Database:    PostgreSQL 16 (основное хранение)
             Redis 7 (кэш промптов, сессии, rate limiting)

ORM:         Drizzle ORM

Real-time:   WebSocket (Hono WebSocket adapter)

Auth:        Lucia Auth (сессии в PostgreSQL)

Payments:    Stripe (Subscriptions — подписки, PaymentIntents — разовые пополнения)

Deploy:      Docker Compose (dev) → VPS / managed PostgreSQL (prod)
```

## 3. Системные компоненты

```
┌─────────────────────────────────────────────────────────────────────┐
│                           КЛИЕНТ (React)                           │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Каталог  │ │ Редактор │ │  Граф    │ │ Режимы   │ │ Админка  │ │
│  │концепций │ │синтеза   │ │ 2D/3D   │ │(оппонент,│ │промптов  │ │
│  │          │ │          │ │          │ │переводч.)│ │          │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │
│       │            │            │             │            │       │
│  ┌────┴────────────┴────────────┴─────────────┴────────────┴─────┐ │
│  │              Zustand Store + WebSocket Client                  │ │
│  └───────────────────────────┬───────────────────────────────────┘ │
└──────────────────────────────┼───────────────────────────────────┘
                               │ HTTP / WebSocket
┌──────────────────────────────┼───────────────────────────────────┐
│                        API GATEWAY (Hono)                        │
│                                                                   │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ │
│  │  Auth   │ │ Rate    │ │ Billing  │ │ CORS    │ │ Logging  │ │
│  │Middleware│ │ Limiter │ │ Check    │ │         │ │          │ │
│  └────┬────┘ └────┬────┘ └────┬─────┘ └────┬────┘ └────┬─────┘ │
│       └───────────┴───────────┴────────────┴───────────┘         │
│                               │                                   │
│  ┌────────────────────────────┼──────────────────────────────────┐│
│  │                     ROUTE HANDLERS                            ││
│  │                                                                ││
│  │  /api/syntheses     CRUD, список, поиск                       ││
│  │  /api/sections      Разделы: чтение, контекст                 ││
│  │  /api/elements      Категории, тезисы, термины: CRUD          ││
│  │  /api/generation    Запуск генерации, стриминг                ││
│  │  /api/plans         Планы редактирования                      ││
│  │  /api/modes         Оппонент, переводчик, временной срез      ││
│  │  /api/lineage       Граф наследования                         ││
│  │  /api/prompts       Prompt Registry (админ)                   ││
│  │  /api/billing       Баланс, транзакции, ключи                 ││
│  │  /ws                WebSocket: стриминг генерации             ││
│  └────────────────────────────┼──────────────────────────────────┘│
└───────────────────────────────┼──────────────────────────────────┘
                                │
┌───────────────────────────────┼──────────────────────────────────┐
│                        SERVICE LAYER                              │
│                                                                   │
│  ┌───────────────┐  ┌─────────────────┐  ┌────────────────────┐  │
│  │  Synthesis     │  │  Prompt         │  │  Context           │  │
│  │  Engine        │  │  Registry       │  │  Builder           │  │
│  │                │  │                 │  │                    │  │
│  │ buildSYS()     │  │ getTemplate()   │  │ buildContext       │  │
│  │ buildSection   │  │ renderTemplate()│  │   ForSection()     │  │
│  │   Defs()       │  │ listVersions() │  │ extractContext     │  │
│  │ resolveContext │  │ activateVer()  │  │   Fragment()       │  │
│  │   Deps()       │  │ testDraft()    │  │ budgeting          │  │
│  │ buildEffective │  │                 │  │                    │  │
│  │   Deps()       │  │                 │  │                    │  │
│  │ compatAdvisor()│  │                 │  │                    │  │
│  └───────┬───────┘  └────────┬────────┘  └─────────┬──────────┘  │
│          │                   │                      │             │
│  ┌───────┴───────┐  ┌───────┴─────────┐  ┌────────┴───────────┐  │
│  │  Edit         │  │  Streaming      │  │  Graph             │  │
│  │  Planner      │  │  Manager        │  │  Service           │  │
│  │               │  │                 │  │                    │  │
│  │ createPlan()  │  │ streamSection() │  │ parseGraph()       │  │
│  │ confirmStep() │  │ Claude SSE →    │  │ parseTopology()    │  │
│  │ cascadeAnalyze│  │   WebSocket     │  │ lineageTraversal() │  │
│  │ executePlan() │  │ resumeOnError() │  │ ancestorSearch()   │  │
│  └───────────────┘  └────────┬────────┘  └────────────────────┘  │
│                              │                                    │
└──────────────────────────────┼────────────────────────────────────┘
                               │ SSE
                    ┌──────────┴──────────┐
                    │   Claude API        │
                    │   (Anthropic)       │
                    └─────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                  │
│                                                                     │
│  ┌──────────────────────┐          ┌──────────────────────────┐    │
│  │     PostgreSQL       │          │        Redis             │    │
│  │                      │          │                          │    │
│  │  users               │          │  prompt_cache:*          │    │
│  │  sessions            │          │  config_cache:*          │    │
│  │  syntheses           │          │  session:*               │    │
│  │  sections            │          │  rate_limit:*            │    │
│  │  categories          │          │  stream_state:*          │    │
│  │  category_edges      │          │                          │    │
│  │  glossary_terms      │          └──────────────────────────┘    │
│  │  theses              │                                          │
│  │  dialogue_turns      │                                          │
│  │  synthesis_lineage   │                                          │
│  │  prompt_templates    │                                          │
│  │  synthesis_configs   │                                          │
│  │  element_versions    │                                          │
│  │  edit_plans          │                                          │
│  │  mode_results        │                                          │
│  │  api_usage           │                                          │
│  │  transactions        │                                          │
│  │  api_keys (encrypted)│                                          │
│  └──────────────────────┘                                          │
└─────────────────────────────────────────────────────────────────────┘
```

## 4. Подсистемы — детальное описание

### 4.1. Prompt Registry

**Проблема**: в исходнике ~90–100 промптовых шаблонов и ~15 конфигурационных объектов захардкожены. Изменение требует редактирования JS и перезагрузки.

**Решение**: два типа хранимых объектов:

**Промптовые шаблоны** (`prompt_templates`):
- Ключ-путь: `system`, `method.dialectical.graph`, `level.transformative.graph_methodology`, `section.critique.preamble`.
  **v11**: шаблоны методов/уровней различаются по кардинальности участников (MD_BY_CARD/SD_BY_CARD, см. 4.14) — схема ключей расширяется до `method.{method}.{card}.{section}` (card: none|single|multi) либо кардинальные фрагменты подставляются рендерером
- Тело: текст с плейсхолдерами `{{participants}}`, `{{method_label}}`, `{{synth_level_desc}}`
- Функция рендеринга: Mustache-подобная подстановка (без логики в шаблонах — логика в коде)
- Версионирование: каждая правка создаёт новую версию, `is_active` — только у одной

**Конфигурации синтеза** (`synthesis_configs`):
- Ключ: `context_deps.base`, `context_deps.genetic`, `substitution_map`, `compat_matrix`, `fragment_share`, `intra_deps`, `subsection_map`, `topology_roles`
- Значение: JSON
- Версионирование: аналогично шаблонам

**Кэширование**: при старте сервера все active-шаблоны и конфиги загружаются в Redis. TTL — бесконечный, инвалидация — при обновлении через админ-API (`POST /api/prompts/{key}/activate`).

**Источник исходника**: `buildSYS()` (buildSYS()), METHOD_SUM/GRAPH/TOPOLOGY/GLOSSARY/THESES/DIALOGUE (METHOD_SUM … METHOD_DIALOGUE), LEVEL_* (LEVEL_COMPARATIVE_* … LEVEL_GENERATIVE_*), CONTEXT_DEPS_* (CONTEXT_DEPS_BASE/GENETIC, CONTEXT_DEPS_LEVEL/_LEVEL_GENETIC/_METHOD — бывш. LEVEL/METHOD_DEPS_PATCH), PARENT_DEPS_* + PARENT_INTRA_DEPS + PARENT_FIELD_* (см. 4.13), MD_BY_CARD/SD_BY_CARD (см. 4.14), MODE_DEPS, SUBSTITUTION_MAP (SUBSTITUTION_MAP (оба варианта)), COMPAT_MATRIX_COMPACT (COMPAT_MATRIX_COMPACT), и все остальные конфиг-объекты.

### 4.2. Synthesis Engine

Ядро системы. Портируется из исходника с минимальными изменениями в логике, но с заменой источников данных (DOM → БД).

**Функции, переносимые почти дословно:**
- `resolveContextDeps()` (resolveContextDeps()) — резолвер зависимостей
- `deepMergeUniq()` (deepMergeUniq()) — слияние dep-объектов
- `buildEffectiveDeps()` (buildEffectiveDeps()) — эффективные зависимости с подстановками
- `computePredecessors()` (computePredecessors()) — предшественники
- `buildDynamicOrder()` (buildDynamicOrder()) — топологическая сортировка
- `resolveCircularDeps()` (resolveCircularDeps()) — разрыв циклов: итеративно, по слабейшему ребру (`findOneCycle()` + `getEdgeQuality()`); `topologicalSort()` инлайнен в `buildDynamicOrder()` (алгоритм Кана)
- `findSubstitute()` (findSubstitute()) — поиск заменителей
- `computeSectionRating()` (computeSectionRating()) — матрица совместимости; advisor переработан в entry-модель `level:method` с severity (`getCompatEntryByKey()`, чипы по разделам) — computeMethodRating/computeOverallCompat/getCompatAdvice удалены; добавлены живые предупреждения зависимостей в форме (`computeSectionWarnings()`/`updateSectionWarnings()`)
- `estimateCost()` (estimateCost()) — оценка стоимости

**Функции, требующие адаптации:**
- `buildSectionDefs()` (buildSectionDefs()) — вместо хардкода читает шаблоны из Prompt Registry; ветвление по `participantCardinality()` (4.14)
- `baseCtx(p, sectionKey)` = `baseCtxStatic()` + `baseCtxParents()` — параметры из БД; в v10 убрана строка «ВЫБРАННЫЕ РАЗДЕЛЫ»; в v11 родительский контекст стал пер-секционным (4.13)
- `serializeParts()` (serializeParts()) — без изменений, но входные parts — из Registry
- `groupPasses()` — без изменений

### 4.3. Context Builder

Строит контекст для каждого раздела из ранее сгенерированных разделов. В исходнике это `buildContextForSection()` (buildContextForSection()) и ~20 функций `extract*()` (extractContextFragment + extract*()).

**Критическое изменение**: в исходнике `extractContextFragment()` работает с DOM:
```javascript
case "graph:nodes": return extractGraphNodesTable(el); // el = DOM element
```

В сервисе — запрос к БД:
```typescript
case "graph:nodes": return formatCategoriesAsTable(
  await db.query.categories.findMany({ where: eq(categories.synthesisId, id) })
);
```

Каждая `extract*()` функция получает эквивалент, работающий с данными из БД вместо DOM-парсинга. Бюджетирование (`CONTEXT_BUDGET`, приоритизация required/optional) переносится, но дополнено (v11): перед приоритизацией применяется давление родительского контекста — `parentOverheadForSection()` + `applyBudgetPressure()` с нижним полом 40% базового бюджета (4.13); в ctxLog пишется parentSpec, а поверх ctxLog вычисляется качество контекста раздела — `getSectionContextQuality()` → цветной бейдж на карточке раздела в Edit Modal. `FRAGMENT_SHARE` в самом `buildContextForSection` не участвует (сверено в беседе 1.3): он читается только оценщиком стоимости (`cost-estimator`, доля фрагмента в бюджете при прогнозе), поэтому context-builder тянет из конфигов лишь `context_budget`.

### 4.4. Streaming Manager

**Исходник (v11)**: `streamResp()` — retry-обёртка (ретраится только kind=pre-stream; задержки 1с/3с/8с) над `_streamRespOnce()`, который ведёт прямой SSE от Claude API (запись в DOM через `requestAnimationFrame`) и классифицирует ошибки по таксономии kind: auth / billing / pre-stream / max-tokens / partial / stuck (нет токенов 45 с) / user-abort (глобальный AbortController). Серверный Streaming Manager повторяет эту модель: одна попытка + классификация, ретраи и паузы — уровнем выше.

**Сервис**: двухзвенный стриминг.

```
Claude API ──SSE──→ Backend ──WebSocket──→ Client
                      │
                      ├─ парсит usage (input_tokens, output_tokens)
                      ├─ буферизирует HTML для сохранения в БД
                      ├─ отслеживает появление data-section для подразделового трекинга
                      └─ при обрыве: сохраняет частичный результат, 
                         позволяет retry с того же места
```

**WebSocket-протокол:**

```typescript
// Клиент → Сервер
{ type: "start_generation", synthesisId: string, sectionKey: string }
{ type: "confirm_step", planId: string, stepIndex: number }
{ type: "cancel" }

// Сервер → Клиент
{ type: "stream_delta", html: string, charsSoFar: number }
{ type: "stream_done", usage: { inputTokens, outputTokens }, sectionKey: string }
{ type: "stream_error", error: string, partialHtml: string }
{ type: "plan_updated", plan: EditPlan }
{ type: "subsection_detected", name: string, charsSoFar: number }
```

**Состояние стриминга**: хранится в Redis (`stream_state:{synthesisId}:{sectionKey}`) — позволяет reconnect при обрыве WebSocket. Бэкенд продолжает получать SSE от Claude даже если клиент отключился; при переподключении отдаёт накопленный буфер.

**Пауза ≠ reconnect (v11, см. 4.12)**: reconnect-буфер закрывает только обрыв WebSocket клиента. Обрыв самого Claude-стрима (billing, auth, max-tokens, stuck, partial) переводит генерацию в персистентное pausedState с меню действий пользователя — отдельный слой поверх stream_state, переживающий сессию.

### 4.5. Edit Planner

Портирование каскадной системы из исходника. Заменяет цепочки `confirm()` → стриминг → `confirm()` на персистентные планы.

**Исходник**: `executeEditPlan()` (executeEditPlan()), `recalcEditPlan()` (recalcEditPlan()), `updateLiveCascade()`, `cascadeRegenerateOne()` (cascadeRegenerateOne()).

**Сервис**: таблица `edit_plans`.

```typescript
interface EditPlan {
  id: string;
  synthesisId: string;
  status: "draft" | "executing" | "paused" | "done" | "failed";
  steps: EditStep[];
  currentStep: number;
  createdAt: Date;
}

interface EditStep {
  type: "delete" | "regen" | "add" | "regen_subsection" | "regen_mode";
  target: string;          // sectionKey или "sectionKey:subsectionName"
  status: "pending" | "confirmed" | "running" | "done" | "skipped" | "failed";
  context?: string;        // secCtx для этого шага
  result?: {
    outputChars: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
  cascadeGenerated: boolean; // true = шаг добавлен автоматически каскадом
}
```

**Workflow:**
1. Клиент отправляет `POST /api/plans` с набором действий (аналог `_editPlan`)
2. Сервер вычисляет каскад (`computeDependents`, `getAffectedModes`) и добавляет шаги
3. Клиент получает полный план с пометками `cascadeGenerated: true`
4. Пользователь подтверждает/снимает шаги → `PATCH /api/plans/{id}`
5. Пользователь нажимает ▶ → `POST /api/plans/{id}/execute`
6. Сервер исполняет шаги в едином топологическом порядке (`buildPlanOrder`): добавления и перегенерации сортируются вместе по зависимостям, а не раздельно (v10)
7. После всех шагов: предложение обновить «Структура документа» (если добавлялись/удалялись разделы) + каскад для downstream (v10)
8. После каждого шага сервер может добавить новые шаги (по факту 2.2 —
   один пересчёт после базовых шагов, паритет исходника)
9. Клиент получает `plan_updated` и обновляет UI

### 4.6. Graph Service

Два графа:

**Граф категорий** (внутри синтеза):
- Данные: таблицы `categories` + `category_edges` + `category_topology`
- Парсинг: `parseGraph()` (parseGraph()) + нормализация типов через Element Taxonomy (4.8) и `parseTopology()` (parseTopology()) адаптируются для извлечения из HTML-ответа Claude и записи в БД. ФАКТ 5.4 (2026-09-05): нормализация на каталог в graph-parser/saveGraphToDb НЕ вызывается (только lower-case текста) — `type_catalog_id` заполняется лишь через PATCH/TaxonomySelector; долг §12 07 → 5.5
- Визуализация: D3.js (2D) + Three.js (3D) — полностью на клиенте, данные загружаются через API
- Код визуализации (`build2D()` build2D(), `build3D()` build3D()) переносится в React-компоненты
- Динамические палитры `_nodeColorMap`/`_edgeStyleMap` (hue-seeds + золотой угол); `showEdgePanel` (клик на связи); `getStructuralMarkers` (массив маркеров); `roleMode` по умолчанию `"procedural"`; `clearLegendFilter` + фильтр по легенде (`legendFilter`)

**Граф наследования** (между концепциями):
- Данные: таблица `synthesis_lineage`
- Запросы: рекурсивные CTE (`WITH RECURSIVE ancestors AS (...)`)
- Визуализация: генеалогическое дерево (`renderGenealogyTree()` renderGenealogyTree()) → React-компонент
- API: `GET /api/lineage/{id}/ancestors`, `GET /api/lineage/{id}/descendants`, `GET /api/lineage/search?philosopher=Кант`

### 4.7. Element Editor

**Новая подсистема** (отсутствует в исходнике; в v10 появился Unified Concept Pool на клиенте).

Позволяет редактировать отдельные элементы синтеза без перегенерации:
- Категории графа: имя, тип, определение, центральность, определённость, происхождение, роли
- Связи графа: описание, тип, направление, сила
- Тезисы: формулировка, обоснование, тип, степень новизны, связанные категории
- Термины глоссария: определение, столбцы по уровню синтеза
- Капсула: текст
- `structureSections`: снимок `sectionOrder` для подраздела «Структура документа» (v10)

> **v10**: ко всем промптам разделов добавляется `STOP_SIGNAL` — инструкция прекратить генерацию после последнего запрошенного раздела.

**Расширенные характеристики** (из предыдущего проекта):
- Категории: centrality, certainty + **historical_significance**, **innovation_degree** (1–5), **clarity**, **breadth**, **depth**, **applicability** (0–1) — последние 4 добавлены в v10
- Связи: strength + **certainty**, **historical_support**, **logical_necessity**, **innovation_degree** (1–5), **context_dependency** (0–1) — последние 2 добавлены в v10
- Каждая характеристика имеет UI-слайдер и кнопку «Обоснование» → точечный запрос к Claude через Element Enrichment Service

При сохранении изменения:
1. Создаётся запись в `element_versions`
2. Вычисляется «зона поражения» через `SUBSECTION_TO_CTX_KEYS` и `INTRA_DEPS`
3. Пользователю предлагается: перегенерировать затронутые подразделы, автозамена имени, ничего

### 4.8. Element Taxonomy

**Новая подсистема** (идея из предыдущего проекта).

Фиксированный каталог типов категорий и типов связей — слой нормализации поверх свободного текста Claude.

**Каталог типов категорий** (`category_type_catalog`): 18 типов из предыдущего проекта (ontological, epistemological, axiological, ethical, aesthetic, metaphysical, logical, practical, political, theological, anthropological, social, linguistic, phenomenological, existential, analytical, hermeneutical, cross_disciplinary). Каждый тип — запись с именем, русским названием, описанием. Пользователь и админ могут добавлять новые типы.

**Каталог типов связей** (`relationship_type_catalog`): 29 типов (hierarchical, causal, dialectical, correlational, disjunctive, conjunctive, contradiction, complementary, emergence, necessary_condition, sufficient_condition, identity, analogy, implementation, instantiation, generalization, part_whole, means_end, deductive, inductive, abductive, temporal, conceptual, definitional, manifestation, foundational, recognition, reflexion, development). Аналогично расширяемый.

**Расширенные типы по методу** (v10): словари `_EXTRA_CATEGORY_TYPES` и `_EXTRA_EDGE_TYPES` добавляют типы в зависимости от метода синтеза (напр., `analytical` добавляет «дедуктивная», «индуктивная» и др. связи). Фразинг зависит от уровня синтеза (`_SYNTH_LEVEL_TYPE_PHRASING`). Функция `_buildExtraTypesBlock(method, synthLevel, kind)` генерирует блок для промпта.

**Нормализация**: при парсинге HTML-ответа Claude (`graph-parser.ts`) каждый тип категории и связи маппится на ближайший элемент каталога через нечёткое сопоставление (аналог `part.includes(key)` из исходника). Промпты уже предписывают Claude фиксированные списки типов (14 для категорий, 12 для связей), поэтому нестандартные типы — редкость (только метод «творческий» допускает нестандартные типы связей). Неизвестные типы сохраняются как свободный текст и получают fallback-стилизацию при рендере.

**Преимущества**: поиск по типу («все диалектические связи во всех концепциях»), фильтрация в каталоге, сравнение графов между концепциями, статистика по типам.

### 4.9. Element Enrichment Service

**Новая подсистема** (идея из предыдущего проекта).

Позволяет запрашивать у Claude точечный анализ отдельных элементов — без перегенерации всего раздела:

- **Обогащение категории**: расширенное описание, альтернативные трактовки, исторические аналоги, связанные концепты
- **Обоснование связи**: философское обоснование, контраргументы, аналоги в других системах
- **Обоснование характеристики**: почему centrality=0.9? какие философские и методологические основания?
- **Анализ эволюции элемента**: как может измениться данная категория/связь в свете современных тенденций

Каждый результат обогащения сохраняется в `element_enrichments` и может быть повторно запрошен с другими параметрами. Промптовые шаблоны — в Prompt Registry; схема ключей (канон 2026-09-02, 03 §2.14): `enrichment.category.{description|evolution|justification}`, `enrichment.edge.{justification|counterarguments}`, `enrichment.characteristic_justification` — пять ключей.

**Биллинг обогащений** (правка 2026-09-02, аудит фаз 5–6, п.10): каждый запрос обогащения пишет строку в `api_usage` и, в режиме подписки, инкрементирует `used_enrichments` — квота `quota_enrichments` (02 §2.22) иначе не тратится никем. Стоимость обогащений в `syntheses.total_cost_usd` НЕ входит: футер документа показывает стоимость генерации, обогащения видны в истории использования (6.2).

### 4.10. Prompt Skeleton Reconstruction (v10)

Система реконструкции промптов для файлов, импортированных без `_promptSkeleton`:
- `reconstructBaseCtxSkeleton(params, genCommon)` — базовый контекст с маркерами вместо содержимого концептов
- `reconstructCtxMarkers(sectionKey)` — маркеры контекста из `ctxLog`
- `reconstructSectionTask(genEntry, params)` — скелет задания раздела из определений
- `reconstructSkeleton(genEntry)` — полный скелет: base + ctx + task + quality

Используется в `formatPromptsForExport()` как fallback, когда `_promptSkeleton` отсутствует.

### 4.11. Representation Transformer (graph↔theses)

**Новая подсистема**.

Граф и тезисы — два равноправных представления одной концепции: структурное (категории + связи + роли + кластеры) и пропозициональное (утверждения + обоснования + связанные категории). Оба содержат достаточно информации, чтобы порождать друг друга без критической потери смысла. Остальные разделы (глоссарий, диалог) — либо извлечения (глоссарий = плоский список терминов), либо драматизации (диалог = тезисы в лицах), и не образуют симметричных пар.

**Операции:**

- **graph→theses**: на основе текущего графа (categories + edges + topology) сгенерировать новый набор тезисов, заменяя существующие. Промпт использует данные из БД (не HTML раздела), что отличает эту операцию от перегенерации раздела «theses» (которая строит контекст из HTML всех предыдущих разделов). Здесь контекстом служит исключительно граф — прямая трансформация.

- **theses→graph**: на основе текущих тезисов (theses + их связанные категории) построить новый граф, заменяя существующий. Claude получает список тезисов и выводит из них категории, связи, кластеры, роли. Результат парсится через graph-parser → сохраняется в БД → нормализуется через Element Taxonomy.

- **Итеративный цикл**: пользователь может: сгенерировать граф → трансформировать в тезисы → отредактировать тезис №3 → трансформировать обратно в граф → увидеть, как граф перегруппировался → отредактировать категорию → трансформировать в тезисы → и так далее.

**Отличие от каскадной перегенерации**: каскад использует раздел как *контекст* для перегенерации зависимого раздела. Трансформация использует раздел как *единственный источник* для генерации другого. Каскад сохраняет промпт раздела и добавляет контекст. Трансформация использует специальный промпт, оптимизированный для конверсии представлений.

**Версионирование**: каждая трансформация создаёт снимок в `representation_transforms` (что было до, что стало после, направление). Пользователь может откатить к любой точке.

### 4.12. Pause / Resume / Abort (v11) — полная спецификация

> Реконструированная спецификация (реверс-инжиниринг philosynth.html, 2026-07-22); [~N] — якоря строк исходника.

#### 1. Проблема и цель

Обрыв генерации (сбой сети, лимит токенов, исчерпание баланса, истёкший ключ,
зависший стрим, ручная остановка) ранее терял прогресс всего документа. Цель —
классифицировать ошибку, сохранить состояние, предложить пользователю осмысленные
действия с оценкой стоимости каждого и возобновить работу с точного места.

#### 2. Таксономия ошибок стриминга (err.kind)

Присваивается в `_streamRespOnce` [~12463] и потребителях:
- `auth` — HTTP 401 (истёкший/невалидный ключ)
- `billing` — HTTP 400 + /credit balance/i (исчерпан баланс API)
- `pre-stream` — прочие ошибки до первого токена (единственный ретраибельный вид)
- `max-tokens` — stop_reason max_tokens: контент оборван (maxTokensUsed сохраняется)
- `partial` — обрыв посреди стрима с частичным контентом
- `stuck` — нет новых токенов дольше `_STREAM_STUCK_MS` (45 000 мс)
- `user-abort` — кнопка «Остановить» (глобальный `_genAbortController`)

#### 3. Политика ретраев (уровень streamResp)

`streamResp` [~12642] — обёртка: до 1 + len(`_STREAM_RETRY_DELAYS`) попыток
(задержки [1000, 3000, 8000] мс), ретраится ТОЛЬКО `pre-stream`; auth, billing,
partial, stuck, user-abort, max-tokens пробрасываются немедленно (max-tokens
ретраить бессмысленно — тот же промпт снова упрётся в лимит). Перед ретраем
частичный контент контейнера очищается. AbortController один на «активную
генерацию»: создаётся первым вызовом, снимается в finally.

#### 4. Состояние паузы — DOC_STATE.pausedState

Два вида (kind):

**kind: "gen"** [~25474] — прервана основная генерация:
`{ passIdx, sectionKeys, sectionLabel, isPartial, reason, reasonKind,
timestamp, partialSubsections, expectedSubsections, completedPasses,
genParams: {…p, secCtx}, maxTokensUsed }`.
Ключевое: полные параметры генерации снимаются в снапшот — возобновление
не зависит от состояния формы.

**kind: "plan"** [~19813] — прерван план редактирования:
`{ stepIdx, totalSteps, failedOp, remainingOps, plan: {regen, remove, add,
modeRegen, modeRemove}, regenCtx, addCtx, reason, reasonKind, timestamp }`.

#### 5. Маркеры в genLog

`_logPauseEvent(type, data)` [~24493]: `pause-marker` | `resume-marker` |
`user-action-marker` с timestamp и деталями (kind, mode, reasonKind, шаг/раздел).
Отображаются в «Логе контекста», исключаются из «Лога промптов»
(не являются запросами к API).

#### 6. Модалка паузы — 4 рендерера

`showPauseModal` [~24700] диспетчеризует по reasonKind/kind:
- `_renderPauseContent_gen` [~24769] — прогресс (завершённые pass'ы, точка
  обрыва, для partial — список готовых/недостающих подразделов)
- `_renderPauseContent_plan` [~24908] — шаг X из Y, упавшая операция, остаток
- `_renderPauseContent_billing` [~24960] — «баланс API исчерпан», список
  завершённого, ссылка на console.anthropic.com/settings/billing,
  «ключ менять не нужно»
- `_renderPauseContent_auth` [~24998] — истёкший ключ (контекст gen или plan).
  Примечание (1.4b): форма ввода нового ключа (`_resumeWithNewApiKey`
  [~24552]) — беседа 6.1 (BYO-Key); до неё ключ серверный (env), и
  auth-рендерер сервиса предлагает «Повторить» (после замены ключа на
  сервере) / «Остановить»

Бейдж паузы в шапке (`_showPauseBadge`), персистентный до разрешения.

#### 7. Действия возобновления (футеры с оценкой стоимости)

`_computeGenPauseEstimates(ps)` [~24521]: временно подменяет DOC_STATE на
pausedState, вызывает штатные estimateCost/estimateSubsectionCost, откатывает
через try/finally. Возвращает {fillMissingSubs, wholeSection, skipRemaining}.

**gen, isPartial** (в т.ч. max-tokens):
- 🎯 `fill-missing-subs` (primary) — догенерировать только недостающие
  подразделы, используя готовые как контекст; для max-tokens каждый подраздел
  отдельно укладывается в лимит 20 000
- ↻ `retry` — очистить частичное, раздел заново
- ⤴ `skip` — оставить частичное, перейти к следующему разделу
- ◼ `stop` — зафиксировать текущее состояние как финальное

**gen, pre-stream**: retry / skip / stop.
**billing**: «Продолжить» (retry после пополнения) / skip / stop.
**plan**: resumePlan — продолжить с упавшего шага / пропустить шаг / стоп.

#### 8. Механика возобновления

- `resumeGeneration(mode)` [~25075]: пишет resume-marker; stop →
  `_finalizeAfterStop_gen`; fill-missing-subs → `_resumeFromSubsection(ps)`
  [~25317] (временно заполняет DOC_STATE, гонит regenerateSubsection по
  недостающим, затем `_continueAfterFilledSubs` [~25500] продолжает со
  СЛЕДУЮЩЕГО pass); retry/skip → пересборка инфраструктуры из genParams
  (resolveContextDeps → buildEffectiveDeps → buildDynamicOrder →
  buildSectionDefs → groupPasses) и запуск `_runGenPassesFromIdx` с нужного
  passIdx.
- `_runGenPassesFromIdx` [~12221] — ЕДИНЫЙ цикл pass'ов для generateDoc и
  resumeGeneration; различаются только startIdx и source.
- `resumePlan` [~25910]: аналогично для плана — восстановление _editPlan из
  снапшота, продолжение с stepIdx.

#### Следствия для philosynth-service

- Таксономия ошибок переезжает в streaming-manager; коды ошибок 03-spec §4.3
  дополнить: STREAM_STUCK, MAX_TOKENS_PARTIAL (отделить от recoverable).
- `stream_state:*` в Redis (01-arch 4.4) недостаточен: нужно персистентное
  pausedState (таблица или поле syntheses/generation_log JSONB) — пауза
  переживает сессию, в отличие от reconnect-буфера.
- WebSocket-протокол (03-spec §3): добавить сообщения generation_paused
  {kind, reasonKind, estimates}, resume_generation {mode},
  generation_paused kind="plan" / resume_plan (отдельного plan_paused
  нет — 03 §3.2); серверный аналог _computeGenPauseEstimates.
- generation_log (02-data-model 2.15): log_type дополнить
  'pause_marker'|'resume_marker'|'user_action_marker'.
- edit_plans.status 'paused' в docs УЖЕ предусмотрен — семантику наполняет
  этот документ.
- Беседа 1.4 протокола (07): streaming-manager проектировать сразу вокруг
  _streamRespOnce-модели (одна попытка + классификация), а не вокруг
  монолитного streamResp.

### 4.13. Селективный родительский контекст + режим бюджета (v11) — полная спецификация

> Реконструированная спецификация (реверс-инжиниринг philosynth.html, 2026-07-22); [~N] — якоря строк исходника.

**═══ Часть I: селективный родительский контекст ═══**

#### 1. Проблема и цель

При мета-синтезе контекст каждой концепции-родителя ранее вставлялся в промпт
**монолитно** — все поля (капсула, цели, портреты, напряжения, граф, диалог,
глоссарий, тезисы) для каждого раздела, независимо от того, нужны ли они этому
разделу. Это раздувало промпты и вытесняло полезный межсекционный контекст.

**Цель**: селективный родительский контекст — каждый раздел мета-синтеза
получает только те поля родителей, которые ему релевантны, по декларативной
карте зависимостей с патчами уровня/метода/порядка, аналогичной CONTEXT_DEPS.

#### 2. Словарь полей родителя

`PARENT_FIELD_ORDER` [~9873] — канонический порядок 10 полей:
`capsule, goals, portraits, tensions, graphNodes, graphEdges,
dialogueConcepts, dialogueSynthesis, glossaryCompact, thesesSummary`.

`PARENT_FIELD_LABELS` [~9880] — русские заголовки блоков в промпте
(КАПСУЛА, ЦЕЛИ И МЕТОД, ПОРТРЕТЫ ФИЛОСОФОВ, НАПРЯЖЕНИЯ, КАТЕГОРИИ (из графа),
СВЯЗИ (из графа), ПОНЯТИЯ (из диалога), АНАЛИТИЧЕСКИЙ КОММЕНТАРИЙ К ДИАЛОГУ,
ТЕРМИНЫ, ТЕЗИСЫ).

#### 3. Карта зависимостей

Четырёхслойная схема, зеркальная CONTEXT_DEPS:

- `PARENT_DEPS_BASE` [~9896] — по записи `{required, optional}` на каждый из
  12 разделов. Пример: `critique` требует 8 полей (capsule, goals, portraits,
  tensions, thesesSummary, graphNodes, graphEdges, glossaryCompact);
  `name` — только capsule + goals.
- `PARENT_DEPS_GENETIC` [~9928] — оверлей для генетического порядка
  (dialogue → theses → glossary → graph): смещает зависимости на
  dialogueConcepts/dialogueSynthesis.
- `PARENT_DEPS_LEVEL` / `PARENT_DEPS_LEVEL_GENETIC` [~9945, ~9970] —
  уровне-патчи (comparative/transformative/generative), раздельно для
  архитектурного и генетического порядка.
- `PARENT_DEPS_METHOD` [~9993] — метод-патчи.

Слияние — тем же `deepMergeUniq`, что и у CONTEXT_DEPS.

#### 4. Резолверы

- `resolveParentDeps(p)` [~10092]: architectural → BASE + LEVEL[level] +
  METHOD[method]; genetic → BASE + GENETIC + LEVEL_GENETIC[level] +
  METHOD[method].
- `resolveParentDepsForSubsection(p, sectionKey, subsectionName)` [~10114]:
  для подраздельной перегенерации. Смотрит `PARENT_INTRA_DEPS[key][subsection]`;
  если intra-записи нет — полный section-spec; если явный `{}` — тоже полный;
  иначе — пересечение intra-полей с section-полями (intra не может расширять
  section). Ключ секции нормализуется: `split("+")[0].split(":")[0]`.
- Fallback при отсутствии записи: `{required: ["capsule"], optional: []}`
  с console.warn [~10275].

#### 5. Сборка контекста в промпт

- `conceptContextBlockFull(p)` [~10233] — legacy-монолит: все непустые поля
  каждого родителя, шапка «═══ КОНЦЕПЦИЯ-УЧАСТНИК: «имя» ═══» + метод/уровень/
  зерно, обёртка «КОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ СИНТЕЗА … """…"""».
- `conceptContextBlockSelective(p, sectionKey, explicitSpec)` [~10260] —
  селективная версия: включает только поля из spec (required + optional);
  explicitSpec позволяет передать результат resolveParentDepsForSubsection.
- `parentFieldsUsedFor(p, sectionKey, subsectionName)` [~10182] — фактически
  использованные поля (spec ∩ непустые у родителей), в каноническом порядке.

#### 6. Экспорт промптов (лог)

**п. 6.2** [~8518]: при сворачивании блоков родителей в «Логе промптов»
маркер имеет расширенный формат — включает список использованных полей:
`[контекст «имя»: КАПСУЛА + ТЕЗИСЫ + … = N симв.]`. Заголовки полей
извлекаются регуляркой из самого содержимого блока (работает и для
селективных, и для монолитных блоков); служебные МЕТОД/УРОВЕНЬ/ЗЕРНО
игнорируются.

#### 7. Бюджетирование (интеграция с частью II)

- `parentOverheadForSection(participants, sectionKey, order, synthLevel,
  method, subsectionName)` [~10150]: суммарный вес родительского контекста
  для раздела = Σ длин выбранных полей по всем концепциям + 200 симв.
  сервисной обёртки на концепцию.
- Вызывается из `buildContextForSection` [~8334] перед `applyBudgetPressure`.
- `buildParentSpecForLog(…)` [~10197] — пишет в ctxLog spec с разбивкой:
  какие поля required/optional, какие отсутствуют у конкретного родителя
  (→ строка «⚠ «имя»: отсутствует обязательное поле: …» в логе [~23552]),
  какие опущены.

#### 8–9. (структура утрачена)

Пункты между 6 и 10 в комментариях не цитируются; вероятно, покрывали
детали UI и валидацию. В коде им соответствует `_validateParentDeps()`
[~10055] — самопроверка карт на неизвестные поля при загрузке.

#### 10. Версионирование схемы и миграция

Константы [~10052]: `PARENT_CONTEXT_SCHEMA_VERSION = 1`,
`PARENT_CONTEXT_SCHEMA_ID = "selective-v1"`.

**п. 10.2 — миграция** [~19979, ~21710, ~23485]:
- При импорте файла схема читается из `embeddedState.parentContextSchema`,
  fallback — `"monolithic"` (legacy-документы).
- При первой перегенерации раздела в legacy-документе с концепциями-родителями
  в genLog пишется `{type: "schema-migration-marker", fromSchema: "monolithic",
  toSchema: "selective-v1", sectionKey, timestamp}`, документ переводится на
  селективную схему, бейдж обновляется.
- В «Логе контекста» маркер рендерится строкой «↻ МИГРАЦИЯ СХЕМЫ» (фиолетовый).

**п. 10.3 — бейдж** [~10419]: `updateSchemaBadgeInHeader(schemaId)` — бейдж в
шапке документа «◈ родительский контекст: селективный v1 / монолитный (legacy)».
Показывается только для мета-синтезов (есть концепции среди участников или в
генеалогии).

#### Следствия для philosynth-service

- Новые ключи synthesis_configs: `parent_deps.base / .genetic / .level /
  .level_genetic / .method`, `parent_intra_deps`, `parent_field_order`,
  `parent_field_labels`.
- Поле схемы: `syntheses.parent_context_schema` (text, default 'selective-v1';
  'monolithic' для импортированного legacy) + миграционные маркеры в
  generation_log (log_type = 'schema_migration_marker').
- meta-synthesis-service: buildConceptContextBlock должен стать селективным
  (per-section spec), а не единым блоком, как описано в 01-architecture §5.2.

**═══ Часть II: режим бюджета секций (budget mode) ═══**

#### 1. Проблема и цель

Родительский контекст мета-синтеза (даже селективный) занимает часть окна.
Ранее межсекционный бюджет (`CONTEXT_BUDGET`) не учитывал этот вес, из-за чего
суммарный промпт мог непредсказуемо раздуваться. Нужен управляемый выбор:
**ужимать** межсекционный контекст под давлением родителей (по умолчанию)
или **сохранять полный бюджет** ценой большего промпта.

#### 2. Механика давления бюджета

- `computeConceptOverhead(participants)` [~10133] — грубый суммарный вес всех
  полей всех концепций (legacy, для монолита).
- `parentOverheadForSection(…)` [~10150] — точный вес по селективному spec
  раздела (см. часть I, п. 7).
- `applyBudgetPressure(baseBudget, conceptOverhead, keepFullBudget)` [~10141]:
  - keepFullBudget или overhead=0 → `{effectiveBudget: baseBudget, applied: 0,
    mode: 'full'|'shrink'}`;
  - иначе → `effectiveBudget = max(baseBudget − overhead, floor(baseBudget·0.4))`
    — **нижний пол 40%** базового бюджета, ужать сильнее нельзя;
  - возвращает также `applied` (на сколько ужато).
- Вызов — в `buildContextForSection` [~8334]: давление применяется к бюджету
  межсекционных фрагментов ДО приоритизации required/optional.

**п. 2.2.А — per-parent breakdown** [~23373]: в «Логе контекста», блок «Общие
элементы», печатается разбивка полного веса каждого родителя из
`genCommon.conceptBlockSizes` (имя + симв.), строка «Σ всего полного веса …
(N концепции)» и итоговая строка «Режим бюджета секций: полный (без ужимания) /
ужатый (под давлением родителей)» [~23393].

#### 3. Хранение решения

- Параметр `p.keepFullBudget` — новое поле параметров синтеза [~12020],
  снимается с чекбокса при старте генерации.
- Сохраняется в embedded state; при импорте восстанавливается в чекбокс
  [~21896].
- `genCommon.budgetMode` ('full'|'shrink') и `totalConceptOverhead` — в genLog.

#### 4. Лог и реконструкция промптов

**п. 4.8.3 — «НОВЫЕ ПРАВИЛА»** раскраски/парсинга лога [~24042], colorizeLog:
- строка «Контекст родителей …» — числа золотым;
- «Режим бюджета секций: полный» — янтарный полужирный акцент;
- «(сжат родителями на N)» — числа золотым, скобка приглушённая;
- «⚠ … отсутствует обязательное поле …» — красный;
- «Опущено: …» — мелкий серый;
- «↻ МИГРАЦИЯ СХЕМЫ» — фиолетовый (пересечение с частью I, п. 10.2).

Регулярки парсинга промптов (`formatPromptsForExport`) дополнены маркерами
«КОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ» (упомянуто и в repo docs как v10-правка).

#### 5. UI

- Чекбокс `#keepFullBudgetCb` «Сохранять полный бюджет секций — не ужимать
  из-за контекста родительских концепций» [~3839] внутри блока
  `#fullBudgetBlock`; ниже — превью `#fullBudgetPreview`.
- `renderFullBudgetPreview()` [~10456]: показывает блок только при наличии
  концепций в пуле; считает предварительный вес родителей и последствия
  каждого режима.
- `onKeepFullBudgetChange()` [~10448]: пересчёт превью + оценки стоимости.
- Показ/скрытие блока при изменениях пула [~4893].

**п. 5.3 — синхронизация** [~19520 (executeEditPlan), ~19975
(regenerateSection)]: перед каждым исполнением плана и каждой перегенерацией
`DOC_STATE.params.keepFullBudget` пересинхронизируется с текущим состоянием
чекбокса — переключение пользователем между операциями должно применяться,
а не замораживаться на значении времени первой генерации.

#### Следствия для philosynth-service

- Поле `syntheses.keep_full_budget BOOLEAN NOT NULL DEFAULT false` (02-data-model).
- `POST /syntheses` и regenerate-эндпоинты принимают `keepFullBudget`
  (03-specification, секции 2.2/2.5); WebSocket-статистика генерации получает
  budgetMode.
- context-builder сервиса обязан реализовать applyBudgetPressure с полом 40%
  и писать budgetMode/overhead/per-parent breakdown в context_log
  (новые поля entries либо metadata).
- log-formatter переносит правила 4.8.3.

### 4.14. Кардинальность участников и свободный синтез (v11) — полная спецификация

> Реконструированная спецификация (реверс-инжиниринг philosynth.html, 2026-07-22); [~N] — якоря строк исходника.

#### 1. Проблема и цель

Все промптовые шаблоны исторически формулировались в терминах «между
традициями/философами». При одном участнике это вырождается в тавтологию,
при нуле — в пустоту («из одного из ()»). Цель — сделать число участников
первоклассным измерением промптовой системы: none (свободный синтез — только
зерно), single (один философ ИЛИ одна концепция), multi (≥2 в любой
комбинации), с согласованной перестройкой формулировок, заголовков подразделов
и зависимостей.

#### 2. Единая точка отсчёта

`participantCardinality(p)` [~10561] → 'none' | 'single' | 'multi'.
Подсчёт: max(p.phil.length, философы среди p.participants) + концепции среди
p.participants. Авторский JSDoc фиксирует принцип: «единая точка отсчёта для
всех шаблонов, которым небезразлично число участников».

Словоформы для промптов: `participantWord(p)` (род.п. мн.ч.: «традиций» /
«участников синтеза» / «философских традиций» / «философов»),
`participantWordSg(p)` [~10573].

#### 3. Кардинальные словари промптов

- `MD_BY_CARD` [~4428]: формулировка каждого из 6 методов × {multi, single,
  none}. Пример (dialectical): multi — «противоречия между традициями»;
  single — «внутреннее диалектическое развитие исходной позиции»; none —
  через трактовки зерна.
- `SD_BY_CARD` [~4496]: описание порождения категорий для 3 уровней синтеза ×
  {multi, single, none}. Пример (transformative/none): «категория обязана
  возникать из напряжения между минимум двумя различимыми трактовками/
  горизонтами в поле зерна».
- `buildSectionDefs` начинается с `const card = participantCardinality(p)`
  [~10767] и выбирает ветки шаблонов по card.

#### 4. Свободный синтез в промптах

- `participantsForPrompt(p)` [~10531]: при пустом списке возвращает
  мета-инструкцию `[свободный синтез: определи релевантные философские
  традиции самостоятельно по содержанию зерна]` — шаблоны вида `(${pp})`
  разбросаны по всем разделам, плейсхолдер предотвращает пустые скобки;
  LLM штатно интерпретирует квадратные скобки как meta-указание.
- Диалог [~11257]: «Именованных участников нет — выбери голоса самостоятельно:
  традиции, школы, типические мыслители эпохи или воображаемые представители
  подходов».

#### 5. Кардинальные заголовки подразделов

`SUBSECTION_SUM_PORTRAIT(p)` [~9438] — заголовок портретного подраздела в sum
как функция кардинальности и типа участников:
- none → «Портрет зерна концепции»
- single философ → «Портрет философа»; multi → «Портрет каждого философа»
- single концепция → «Портрет концепции-родителя»; multi с концепциями →
  «Портрет каждого участника синтеза»

Авторский JSDoc: «единая точка истины» — заголовок используется в
buildSectionDefs, SUBSECTION_MAP (через buildSubsectionMap), INTRA_DEPS,
SUBSECTION_TO_CTX_KEYS, поэтому вынесен в функцию, чтобы все места
переключались синхронно.

#### 6. Каноникализация для зависимостей

`canonicalSubsectionKey(sectionKey, subsectionName)` [~9753]: все варианты
портретного заголовка (`_SUM_PORTRAIT_VARIANTS`) схлопываются в канонический
ключ «Портрет каждого философа», чтобы каскадный анализ
(getIntraDependents, getCrossSecDependents [~9767]) и карты зависимостей
работали независимо от текущей кардинальности документа. Карты
(SUBSECTION_TO_CTX_KEYS, INTRA_DEPS) хранятся в канонических ключах.

#### 7. Взаимодействие с другими подсистемами

- Мета-синтез: концепции-родители участвуют в подсчёте кардинальности наравне
  с философами; single-концепция получает собственные формулировки.
- PARENT_DEPS (§4.13) ортогонален кардинальности, но
  портретные поля родителей (portraits) появляются только при наличии
  концепций.
- getAffectedModes/buildModeContext учитывают свободный синтез (ветки none).

#### Следствия для philosynth-service

- **ЛОМАЕТ docs**: беседа 1.5 протокола (07) прямо требует «попытка отправить
  без философов → ошибка» — валидация обязана разрешать 0 участников
  (свободный синтез). POST /syntheses: philosophers[] и participants[] оба
  опциональны; обязательным становится хотя бы seed.
- Новые ключи synthesis_configs: `md_by_card`, `sd_by_card` (вместо плоских
  METHOD_*/LEVEL_*-словарей, которые docs предписывают сеять как есть) —
  структура шаблонных ключей Prompt Registry должна включать кардинальность:
  `method.{method}.{card}.{aspect}` либо card-плейсхолдеры внутри шаблона.
- shared/constants: participantCardinality и словоформы — в shared (нужны и
  клиентской форме для превью, и серверу).
- cascade-analyzer сервиса обязан реализовать canonicalSubsectionKey;
  беседа 2.1 (07) её не упоминает.
- SUBSECTION_MAP в БД хранить в канонических ключах + функция-резолвер
  заголовка по кардинальности на рендере.

### 4.15. Прочие подсистемы v11 — полная сводка

> Реконструировано кластеризацией 253 неупомянутых функций по 69 баннерам авторского оглавления (2026-07-22).

#### 1. Section Dependency Warnings — живой анализ зависимостей в форме [~6613]

Отдельная от Compat Advisor система. При каждом изменении выбора секций:
- `computeSectionWarnings(resolvedDeps)` — какие секции требуют каких
  (по required-ключам через sourceOf, sum исключён);
- `updateSectionWarnings()` (~189 стр.) — три бокса в форме:
  `#secWarnings` (предупреждения: выбран X без нужного ему Y),
  `#secRecommendations` (рекомендации добавить), `#secSubstitutions`
  (какие подстановки будут активны);
- собственный граф-анализ: `dfs`, `findOneCycle`, `getEdgeQuality`,
  `removeEdge`.

**Уточнение семантики resolveCircularDeps** [~6934]: циклы разрываются
итеративно ПО САМОМУ СЛАБОМУ РЕБРУ — findOneCycle находит цикл,
getEdgeQuality оценивает каждое ребро, удаляется наименее качественное.
Docs описывают resolveCircularDeps без этого алгоритма.

**Для сервиса**: клиентская панель (беседа 1.5) + серверный аналог в
compat/deps-advisor; алгоритм слабейшего ребра — в topo-sort.ts.

#### 2. Compat Advisor v2 — панель серьёзности [~6961, ~7375]

Заменяет трио computeMethodRating/computeOverallCompat/getCompatAdvice
(этих функций больше нет). Новая модель:
- записи по ключу `level:method` (`getCompatEntryByKey`), у каждой —
  rating, severity, desc, пер-секционные чипы;
- UI: панель `#compatPanel` с data-severity, иконкой (`iconForSeverity`),
  заголовком (`titleForSeverity`), чипами по разделам
  (`chipClassForRating`), сворачиванием (`toggleCompatPanel`);
- `updateCompatAdvisor()` дёргается при смене метода/уровня и тянет за
  собой updateSectionWarnings.

**Для сервиса**: compat-advisor.ts проектировать по entry-модели, а не по
трио из карты 04; COMPAT_MATRIX_COMPACT остался источником данных.

#### 3. Context Quality — оценка качества контекста раздела [~5571]

`getSectionContextQuality(sectionKey)` — по последней записи ctxLog раздела:
score + issues («отсутствовали обязательные: …», «N пропущено из-за
бюджета», «N обрезано», «N подстановок»). Используется в Edit Modal
[~18445]: цветной бейдж качества на карточке раздела (≥90 зелёный, …) —
пользователь видит, какие разделы были сгенерированы с деградированным
контекстом, и может целево перегенерировать.

**Для сервиса**: сервисный аналог поверх context_log; поле score в ответе
GET /syntheses/:id/sections; бейдж в EditSectionCard.tsx (беседа 2.3).

#### 4. Автодобавление в пул [~12352]

`_autoAddCurrentDocToPool()` вызывается из `_finalizeGenerationPostloop`:
только что сгенерированный документ снимается снапшотом, парсится как
концепт-файл и появляется карточкой в Unified Concept Pool; при пригодности
сразу помечается участником мета-синтеза (isSynthParticipant = true).
Дедупликация по filename (= docNum). Замыкает цикл: сгенерировал → сразу
доступен для мета-синтеза без экспорта/импорта.

**Для сервиса**: тривиально (всё уже в БД), но UX-паттерн «свежий синтез
автоматически предлагается участником» стоит перенести в ConceptPool.tsx.

#### 5. Шапка документа: раскрывающиеся поля, заголовок, капсула [~11595]

- `makeHeaderDisclosure` / `makeSectionCtxDisclosure` / `buildDocHeaderExtras`
  — сворачиваемые поля шапки и secCtx разделов;
- `editDocTitle` — ручное редактирование заголовка;
- `updateDocTitleFromName(container)` — заголовок документа автоматически
  обновляется из сгенерированного раздела «name» (5 точек вызова: генерация,
  перегенерация, план, импорт, resume);
- `updateCapsuleInHeader` + `removeCapsuleFromDocBodies` +
  `restoreCapsulesFromHTML` — капсула живёт в шапке, а не среди тел
  разделов; при импорте/экспорте переносится корректно.

**Для сервиса**: docs уже хранят capsule_html отдельно (совпало), но
авто-заголовок из name-раздела не описан — правка generation-service
(после section_done для 'name' → PATCH title) и DocumentHeader.tsx.

#### 6. Мелкое

- `MODE_DEPS` + `getEffectiveModeDeps` [~22543] — декларативные зависимости
  режимов (docs: только checkModeDeps-концепт в беседе 4.1).
- Выбор языка генерации: `initLangUI/onLangSelect/saveLang` [~5842] —
  UI для syntheses.lang (параметр в docs есть, UI не описан).
- `buildPromptSkeleton` [~8506] — скелет промпта пишется в genLog при
  генерации (docs описывают только реконструкцию как fallback).
- `saveMD` + node2md/table2md/… [~18195] — Markdown-экспорт реализован
  (docs числят Фазой 2).
- `normalizeGenealogyNames`, `isPlaceholderConceptName`,
  `resolveConceptName` [~21230] — санация имён в генеалогии при
  импорте/экспорте («[безымянная концепция]» как последний рубеж).

#### Не-системы (для полноты)

Остальные непокрытые имена — внутренние хелперы задокументированного:
41 функция GRAPH MODAL (фильтры кластеров/ролей 2d/3d, тач-обработка,
анимация — реализация задокументированных v10-фич легенды/панелей),
19 функций MMD/PNG-экспорта, раскраска лога, парсер CSS внутри auditCSS,
модалка Raw HTML, инпут-хелперы формы.

## 5. Потоки данных

### 5.1. Генерация нового синтеза

```
1. Клиент: POST /api/syntheses { seed, philosophers?, participants?, sections, method, depth, synthLevel, ctx, extGraphMetrics?, keepFullBudget? }
   // v11: philosophers/participants опциональны — 0 участников = свободный синтез
2. Сервер:
   a. Создаёт запись в `syntheses` (status: "generating")
   b. resolveContextDeps() + buildEffectiveDeps() + buildDynamicOrder()
   c. buildSectionDefs() с шаблонами из Prompt Registry
   d. groupPasses() → массив проходов
   e. Для каждого прохода:
      - buildContextForSection() из уже сохранённых разделов (из БД)
      - Собирает промпт (baseCtx + prior + section prompt)
      - Стримит через Claude SSE
      - Парсит HTML-ответ → извлекает элементы → сохраняет в БД
      - Стримит HTML клиенту через WebSocket
      - Парсит граф (если раздел "graph") → categories + category_edges
      - Записывает genLog, ctxLog (+ promptSkeleton, parentSpec, budgetMode — v11)
      - Обрыв стрима: классификация kind → персистентное pausedState,
        status "paused", клиенту generation_paused (v11, см. 4.12)
   f. Обновляет syntheses.status → "ready"; заголовок — из раздела «name»
      (updateDocTitleFromName); синтез автоматически доступен как участник
      мета-синтеза (аналог _autoAddCurrentDocToPool)
3. Клиент: рендерит документ по данным из WebSocket (аналог текущего streamResp + DOM-вставки)
```

### 5.2. Мета-синтез

```
1. Клиент: POST /api/syntheses { ..., participants: [{ type: "synthesis", id: "..." }, ...] }
2. Сервер:
   a. Для каждого участника-концепции загружает из БД: capsule, graphNodes, glossaryCompact,
      thesesSummary, goals, tensions (аналог importConceptAsParticipant, importConceptAsParticipant())
      В v10 исходник: данные берутся из Unified Concept Pool (`_loadedConcepts`),
      где каждая концепция хранит snapshot и participant; перед генерацией вызывается
      `refreshAllSynthParticipants()` для актуализации контекста.
      `genCommon.conceptBlockSizes` сохраняет размеры блоков контекста каждой
      концепции (для реконструкции промптов при экспорте)
   b. Проверяет пригодность: обязательные разделы, генеалогические пересечения
      (checkGenealogyOverlaps, checkGenealogyOverlaps())
   c. Формирует conceptContextBlockSelective() из данных БД: состав полей —
      пер-секционный по PARENT_DEPS (v11, см. 4.13); давление бюджета по
      keepFullBudget; legacy-документы (schema "monolithic") мигрируют на
      "selective-v1" при первой перегенерации (маркер в genLog)
   d. Далее — как обычная генерация, но с доп. контекстом концепций
   e. Записывает synthesis_lineage: parent_id → id участника
```

### 5.3. Ручное редактирование элемента

```
1. Клиент: PATCH /api/elements/categories/{id} { name: "Новое имя", definition: "..." }
2. Сервер:
   a. Создаёт element_version (старое значение)
   b. Обновляет categories
   c. Вычисляет impact: какие секции/подразделы ссылаются на эту категорию
      (через SUBSECTION_TO_CTX_KEYS + обратный обход ctxLog)
   d. Возвращает { updated: true, impact: [...] }
3. Клиент: показывает каскадную панель, пользователь решает
```

## 6. Аутентификация и авторизация

**Lucia Auth** с сессиями в PostgreSQL:
- Регистрация: email + пароль (bcrypt)
- OAuth: Google, GitHub (опционально, фаза 2)
- Сессия: cookie-based, `sessions` таблица
- Роли: `user` (обычный), `admin` (управление Prompt Registry)

**Три режима биллинга** (приоритет при определении API-ключа для запроса):
1. **BYO-Key**: пользователь вводит собственный Anthropic API-ключ. Запросы проксируются через бэкенд с этим ключом. Стоимость для сервиса — нулевая.
2. **Подписка** (Stripe Subscriptions): тарифные планы с ежемесячными квотами (N синтезов, M перегенераций, K режимов, L обогащений). При исчерпании квоты — fallback на баланс или блокировка. Квоты сбрасываются в начале периода.
3. **Pay-as-you-go** (баланс): пополнение через Stripe PaymentIntents, per-request списание по себестоимости API + наценка.

Приоритет middleware: BYO-Key → активная подписка с остатком квоты → положительный баланс → ошибка `BILLING_REQUIRED`.

**Авторизация ресурсов:**
- Синтез принадлежит пользователю (`syntheses.userId`)
- Публичные синтезы: `syntheses.isPublic` — доступны для просмотра и мета-синтеза всем
- Приватные — только владельцу
- Элементы синтеза наследуют доступ от синтеза

## 7. Масштабирование

**Фаза 1 (MVP)**: один сервер, один PostgreSQL, один Redis. Достаточно для ~1000 пользователей.

**Фаза 2**: 
- Вынос стриминга в отдельный worker-процесс (Claude API вызовы — CPU-light, IO-heavy)
- Connection pooling для PostgreSQL (PgBouncer)
- Redis Cluster для кэша

**Фаза 3**:
- Горизонтальное масштабирование бэкенда (stateless, WebSocket через Redis pub/sub)
- Read replicas PostgreSQL
- CDN для статики фронтенда
