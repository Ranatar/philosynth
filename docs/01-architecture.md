# PhiloSynth Service — Архитектура

## 1. Обзор системы

PhiloSynth Service — веб-сервис для генерации, хранения, навигации и редактирования философских концепций, синтезированных с помощью Claude API. Трансформирует одиночное browser-приложение (19.8K строк, monolithic HTML) в многопользовательский сервис с персистентным хранением, каталогом концепций и графом наследования.

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
| Биллинг | Свой API-ключ, стоимость в футере | BYO-Key + баланс сервиса |

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

Payments:    Stripe (для режима «баланс сервиса»)

Deploy:      Docker Compose (dev) → VPS / managed PostgreSQL (prod)
```

## 3. Системные компоненты

```
┌─────────────────────────────────────────────────────────────────────┐
│                           КЛИЕНТ (React)                                                                          │
│                                                                                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Каталог         │ │ Редактор       │ │  Граф           │ │ Режимы          │ │ Админка        │         │
│  │концепций        │ │синтеза         │ │ 2D/3D           │ │(оппонент,       │ │промптов        │         │
│  │                 │ │                │ │                 │ │переводч.).      │ │                │         │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘         │
│          │                    │                   │                   │                    │                   │
│  ┌────┴────────────┴───────────┴────────────┴────────────┴───────┐     │
│  │              Zustand Store + WebSocket Client                                                           │     │
│  └───────────────────────────┬───────────────────────────────────┘     │
└──────────────────────────────┼──────────────────────────────────────┘
                                                    │ HTTP / WebSocket
┌──────────────────────────────┼───────────────────────────────────┐
│                        API GATEWAY (Hono)                                                                    │
│                                                                                                              │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐         │
│  │  Auth         │ │ Rate          │ │ Billing         │ │ CORS          │ │ Logging        │         │
│  │Middleware.    │ │ Limiter       │ │ Check           │ │               │ │                │         │
│  └────┬────┘ └────┬────┘ └────┬─────┘ └────┬────┘ └────┬─────┘         │
│          └───────────┴───────────┴───────────┴───────────┘                   │
│                                                  │                                                           │
│  ┌────────────────────────────┼──────────────────────────────────┐│
│  │                     ROUTE HANDLERS                                                                      ││
│  │                                                                                                         ││
│  │  /api/syntheses     CRUD, список, поиск                                                                 ││
│  │  /api/sections      Разделы: чтение, контекст                                                           ││
│  │  /api/elements      Категории, тезисы, термины: CRUD                                                    ││
│  │  /api/generation    Запуск генерации, стриминг                                                          ││
│  │  /api/plans         Планы редактирования                                                                ││
│  │  /api/modes         Оппонент, переводчик, временной срез                                                ││
│  │  /api/lineage       Граф наследования                                                                   ││
│  │  /api/prompts       Prompt Registry (админ)                                                             ││
│  │  /api/billing       Баланс, транзакции, ключи                                                           ││
│  │  /ws                WebSocket: стриминг генерации                                                       ││
│  └────────────────────────────┼──────────────────────────────────┘│
└───────────────────────────────┼──────────────────────────────────┘
                                                     │
┌───────────────────────────────┼──────────────────────────────────┐
│                        SERVICE LAYER                                                                         │
│                                                                                                              │
│  ┌───────────────┐  ┌─────────────────┐  ┌────────────────────┐       │
│  │  Synthesis              │  │  Prompt                    │  │  Context                         │       │
│  │  Engine                 │  │  Registry                  │  │  Builder                         │       │
│  │                         │  │                            │  │                                  │       │
│  │ buildSYS()              │  │ getTemplate()              │  │ buildContext                     │       │
│  │ buildSection            │  │ renderTemplate()           │  │   ForSection()                   │       │
│  │   Defs()                │  │ listVersions()             │  │ extractContext                   │       │
│  │ resolveContext.         │  │ activateVer()              │  │   Fragment()                     │       │
│  │   Deps()                │  │ testDraft()                │  │ budgeting                        │       │
│  │ buildEffective          │  │                            │  │                                  │       │
│  │   Deps()                │  │                            │  │                                  │       │
│  │ compatAdvisor()         │  │                            │  │                                  │       │
│  └───────┬───────┘  └────────┬────────┘  └─────────┬──────────┘       │
│               │                              │                                  │                          │
│  ┌───────┴───────┐  ┌───────┴─────────┐  ┌────────┴───────────┐       │
│  │  Edit                   │  │  Streaming                 │  │  Graph                           │       │
│  │  Planner                │  │  Manager                   │  │  Service                         │       │
│  │                         │  │                            │  │                                  │       │
│  │ createPlan()            │  │ streamSection()            │  │ parseGraph()                     │       │
│  │ confirmStep()           │  │ Claude SSE →              │  │ parseTopology()                  │       │
│  │ cascadeAnalyze          │  │   WebSocket                │  │ lineageTraversal()               │       │
│  │ executePlan()           │  │ resumeOnError()            │  │ ancestorSearch()                 │       │
│  └───────────────┘  └────────┬────────┘  └────────────────────┘       │
│                                                │                                                            │
└──────────────────────────────┼───────────────────────────────────┘
                                                    │ SSE
                                 ┌──────────┴──────────┐
                                 │   Claude API                      │
                                 │   (Anthropic)                     │
                                 └─────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                                                                │
│                                                                                                                   │
│  ┌──────────────────────┐          ┌──────────────────────────┐                │
│  │     PostgreSQL       │             │        Redis                                          │                │
│  │                      │             │                                                       │                │
│  │  users               │             │  prompt_cache:*                                       │                │
│  │  sessions            │             │  config_cache:*                                       │                │
│  │  syntheses           │             │  session:*                                            │                │
│  │  sections            │             │  rate_limit:*                                         │                │
│  │  categories          │             │  stream_state:*                                       │                │
│  │  category_edges      │             │                                                       │                │
│  │  glossary_terms      │             └─────────────────────────────────┘                │
│  │  theses              │                                                                                       │
│  │  dialogue_turns      │                                                                                       │
│  │  synthesis_lineage   │                                                                                       │
│  │  prompt_templates    │                                                                                       │
│  │  synthesis_configs   │                                                                                       │
│  │  element_versions    │                                                                                       │
│  │  edit_plans          │                                                                                       │
│  │  mode_results        │                                                                                       │
│  │  api_usage           │                                                                                       │
│  │  transactions        │                                                                                       │
│  │  api_keys (encrypted)│                                                                                       │
│  └─────────────┘                                                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

## 4. Подсистемы — детальное описание

### 4.1. Prompt Registry

**Проблема**: в исходнике ~90–100 промптовых шаблонов и ~15 конфигурационных объектов захардкожены. Изменение требует редактирования JS и перезагрузки.

**Решение**: два типа хранимых объектов:

**Промптовые шаблоны** (`prompt_templates`):
- Ключ-путь: `system`, `method.dialectical.graph`, `level.transformative.graph_methodology`, `section.critique.preamble`
- Тело: текст с плейсхолдерами `{{participants}}`, `{{method_label}}`, `{{synth_level_desc}}`
- Функция рендеринга: Mustache-подобная подстановка (без логики в шаблонах — логика в коде)
- Версионирование: каждая правка создаёт новую версию, `is_active` — только у одной

**Конфигурации синтеза** (`synthesis_configs`):
- Ключ: `context_deps.base`, `context_deps.genetic`, `substitution_map`, `compat_matrix`, `fragment_share`, `intra_deps`, `subsection_map`, `topology_roles`
- Значение: JSON
- Версионирование: аналогично шаблонам

**Кэширование**: при старте сервера все active-шаблоны и конфиги загружаются в Redis. TTL — бесконечный, инвалидация — при обновлении через админ-API (`POST /api/prompts/{key}/activate`).

**Источник исходника**: `buildSYS()` (buildSYS()), METHOD_SUM/GRAPH/TOPOLOGY/GLOSSARY/THESES/DIALOGUE (METHOD_SUM … METHOD_DIALOGUE), LEVEL_* (LEVEL_COMPARATIVE_* … LEVEL_GENERATIVE_*), CONTEXT_DEPS_* (CONTEXT_DEPS_BASE … METHOD_DEPS_PATCH), SUBSTITUTION_MAP (SUBSTITUTION_MAP (оба варианта)), COMPAT_MATRIX_COMPACT (COMPAT_MATRIX_COMPACT), и все остальные конфиг-объекты.

### 4.2. Synthesis Engine

Ядро системы. Портируется из исходника с минимальными изменениями в логике, но с заменой источников данных (DOM → БД).

**Функции, переносимые почти дословно:**
- `resolveContextDeps()` (resolveContextDeps()) — резолвер зависимостей
- `deepMergeUniq()` (deepMergeUniq()) — слияние dep-объектов
- `buildEffectiveDeps()` (buildEffectiveDeps()) — эффективные зависимости с подстановками
- `computePredecessors()` (computePredecessors()) — предшественники
- `buildDynamicOrder()` (buildDynamicOrder()) — топологическая сортировка
- `resolveCircularDeps()` (resolveCircularDeps()) — разрыв циклов
- `findSubstitute()` (findSubstitute()) — поиск заменителей
- `computeSectionRating()` (computeSectionRating()) — матрица совместимости
- `estimateCost()` (estimateCost()) — оценка стоимости

**Функции, требующие адаптации:**
- `buildSectionDefs()` (buildSectionDefs()) — вместо хардкода читает шаблоны из Prompt Registry
- `baseCtx()` (baseCtx()) — параметры берутся из БД, а не из DOM
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

Каждая `extract*()` функция получает эквивалент, работающий с данными из БД вместо DOM-парсинга. Бюджетирование (`CONTEXT_BUDGET`, `FRAGMENT_SHARE`, приоритизация required/optional) — переносится без изменений.

### 4.4. Streaming Manager

**Исходник**: `streamResp()` (streamResp()) — прямой SSE от Claude API с записью HTML в DOM через `requestAnimationFrame`.

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
6. Сервер исполняет шаги последовательно, стримя результаты через WebSocket
7. После каждого шага сервер пересчитывает downstream → может добавить новые шаги
8. Клиент получает `plan_updated` и обновляет UI

### 4.6. Graph Service

Два графа:

**Граф категорий** (внутри синтеза):
- Данные: таблицы `categories` + `category_edges` + `category_topology`
- Парсинг: `parseGraph()` (parseGraph()) + нормализация типов через Element Taxonomy (4.8) и `parseTopology()` (parseTopology()) адаптируются для извлечения из HTML-ответа Claude и записи в БД
- Визуализация: D3.js (2D) + Three.js (3D) — полностью на клиенте, данные загружаются через API
- Код визуализации (`build2D()` build2D(), `build3D()` build3D()) переносится в React-компоненты

**Граф наследования** (между концепциями):
- Данные: таблица `synthesis_lineage`
- Запросы: рекурсивные CTE (`WITH RECURSIVE ancestors AS (...)`)
- Визуализация: генеалогическое дерево (`renderGenealogyTree()` renderGenealogyTree()) → React-компонент
- API: `GET /api/lineage/{id}/ancestors`, `GET /api/lineage/{id}/descendants`, `GET /api/lineage/search?philosopher=Кант`

### 4.7. Element Editor

**Новая подсистема** (отсутствует в исходнике).

Позволяет редактировать отдельные элементы синтеза без перегенерации:
- Категории графа: имя, тип, определение, центральность, определённость, происхождение, роли
- Связи графа: описание, тип, направление, сила
- Тезисы: формулировка, обоснование, тип, степень новизны, связанные категории
- Термины глоссария: определение, столбцы по уровню синтеза
- Капсула: текст

**Расширенные характеристики** (из предыдущего проекта):
- Категории: centrality, certainty + **historical_significance**, **innovation_degree** (1–5)
- Связи: strength + **certainty**, **historical_support**, **logical_necessity**
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

**Нормализация**: при парсинге HTML-ответа Claude (`graph-parser.ts`) каждый тип категории и связи маппится на ближайший элемент каталога через нечёткое сопоставление (аналог `part.includes(key)` из исходника). Промпты уже предписывают Claude фиксированные списки типов (14 для категорий, 12 для связей), поэтому нестандартные типы — редкость (только метод «творческий» допускает нестандартные типы связей). Неизвестные типы сохраняются как свободный текст и получают fallback-стилизацию при рендере.

**Преимущества**: поиск по типу («все диалектические связи во всех концепциях»), фильтрация в каталоге, сравнение графов между концепциями, статистика по типам.

### 4.9. Element Enrichment Service

**Новая подсистема** (идея из предыдущего проекта).

Позволяет запрашивать у Claude точечный анализ отдельных элементов — без перегенерации всего раздела:

- **Обогащение категории**: расширенное описание, альтернативные трактовки, исторические аналоги, связанные концепты
- **Обоснование связи**: философское обоснование, контраргументы, аналоги в других системах
- **Обоснование характеристики**: почему centrality=0.9? какие философские и методологические основания?
- **Анализ эволюции элемента**: как может измениться данная категория/связь в свете современных тенденций

Каждый результат обогащения сохраняется в `element_enrichments` и может быть повторно запрошен с другими параметрами. Промптовые шаблоны — в Prompt Registry (ключи: `enrichment.category`, `enrichment.edge`, `enrichment.characteristic_justification`).

### 4.10. Representation Transformer (graph↔theses)

**Новая подсистема**.

Граф и тезисы — два равноправных представления одной концепции: структурное (категории + связи + роли + кластеры) и пропозициональное (утверждения + обоснования + связанные категории). Оба содержат достаточно информации, чтобы порождать друг друга без критической потери смысла. Остальные разделы (глоссарий, диалог) — либо извлечения (глоссарий = плоский список терминов), либо драматизации (диалог = тезисы в лицах), и не образуют симметричных пар.

**Операции:**

- **graph→theses**: на основе текущего графа (categories + edges + topology) сгенерировать новый набор тезисов, заменяя существующие. Промпт использует данные из БД (не HTML раздела), что отличает эту операцию от перегенерации раздела «theses» (которая строит контекст из HTML всех предыдущих разделов). Здесь контекстом служит исключительно граф — прямая трансформация.

- **theses→graph**: на основе текущих тезисов (theses + их связанные категории) построить новый граф, заменяя существующий. Claude получает список тезисов и выводит из них категории, связи, кластеры, роли. Результат парсится через graph-parser → сохраняется в БД → нормализуется через Element Taxonomy.

- **Итеративный цикл**: пользователь может: сгенерировать граф → трансформировать в тезисы → отредактировать тезис №3 → трансформировать обратно в граф → увидеть, как граф перегруппировался → отредактировать категорию → трансформировать в тезисы → и так далее.

**Отличие от каскадной перегенерации**: каскад использует раздел как *контекст* для перегенерации зависимого раздела. Трансформация использует раздел как *единственный источник* для генерации другого. Каскад сохраняет промпт раздела и добавляет контекст. Трансформация использует специальный промпт, оптимизированный для конверсии представлений.

**Версионирование**: каждая трансформация создаёт снимок в `representation_transforms` (что было до, что стало после, направление). Пользователь может откатить к любой точке.

## 5. Потоки данных

### 5.1. Генерация нового синтеза

```
1. Клиент: POST /api/syntheses { seed, philosophers, sections, method, depth, synthLevel, ctx }
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
      - Записывает genLog, ctxLog
   f. Обновляет syntheses.status → "ready"
3. Клиент: рендерит документ по данным из WebSocket (аналог текущего streamResp + DOM-вставки)
```

### 5.2. Мета-синтез

```
1. Клиент: POST /api/syntheses { ..., participants: [{ type: "synthesis", id: "..." }, ...] }
2. Сервер:
   a. Для каждого участника-концепции загружает из БД: capsule, graphNodes, glossaryCompact,
      thesesSummary, goals, tensions (аналог importConceptAsParticipant, importConceptAsParticipant())
   b. Проверяет пригодность: обязательные разделы, генеалогические пересечения
      (checkGenealogyOverlaps, checkGenealogyOverlaps())
   c. Формирует conceptContextBlock() из данных БД (вместо DOM-парсинга)
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
