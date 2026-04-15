# PhiloSynth Service — Стратегия разработки

## 1. Принцип: вертикальные срезы, а не горизонтальные слои

Не строим «сначала весь бэкенд, потом весь фронт». Каждая фаза доставляет работающий вертикальный срез: от кнопки в UI до записи в БД. Это позволяет тестировать на реальном использовании после каждой фазы.

---

## 2. Фазы разработки

### Фаза 0: Инфраструктура (≈3–4 сессии)

**Цель**: рабочий скелет, в который встраивается функциональность.

**Задачи:**
1. Инициализация монорепозитория (workspace: shared, server, client)
2. Drizzle ORM: схема БД (все 21 таблица), начальная миграция
3. Hono-сервер: hello world, CORS, env-переменные
4. Docker Compose: PostgreSQL 16 + Redis 7
5. Lucia Auth: регистрация, логин, logout, middleware
6. Vite + React: каркас с роутингом, Layout, заглушки страниц
7. WebSocket: базовое подключение, ping/pong, reconnect
8. `scripts/seed-prompts.ts`: извлечение всех промптов из исходника → `prompt_templates`
   > v10: список философов расширен на 36 позиций — обновить `shared/constants/philosophers.ts`
9. `scripts/seed-configs.ts`: извлечение конфигов → `synthesis_configs`
10. `scripts/seed-taxonomy.ts`: заполнение `category_type_catalog` (18 типов) и `relationship_type_catalog` (29 типов) из предыдущего проекта

**Результат**: можно зарегистрироваться, войти, увидеть пустой каталог. БД полностью готова. Промпты и конфиги загружены.

**Критический путь**: скрипты seed-prompts и seed-configs — они определяют, что остальные фазы могут читать шаблоны из Registry, а не из хардкода.

---

### Фаза 1: MVP — Генерация и просмотр (≈8–10 сессий)

**Цель**: можно создать синтез, увидеть документ, посмотреть граф.

**Порядок задач:**

**1.1. Ядро генерации (бэкенд)**

> **v10**: форма создания включает чекбокс `extGraphMetrics` (расширенные характеристики графа). Параметр передаётся в промпты и влияет на парсинг (дополнительные столбцы). Также промпты получают расширенные типы по методу (`_buildExtraTypesBlock`) и `STOP_SIGNAL`.

- `prompt-registry.ts`: getTemplate, renderTemplate, getConfig (чтение из БД + Redis-кэш)
- `synthesis-engine.ts`: перенос resolveContextDeps, buildEffectiveDeps, findSubstitute, deepMergeUniq
- `section-defs-builder.ts`: перенос buildSectionDefs, serializeParts, groupPasses — с чтением из Registry
- `prompt-builder.ts`: перенос buildSYS, baseCtx, buildQualityReinforcement
- `cost-estimator.ts`: перенос estimateCost
- `compat-advisor.ts`: перенос computeSectionRating, computeOverallCompat

**1.2. Контекстная подсистема (бэкенд)**
- `context-builder.ts`: адаптация buildContextForSection (DOM → БД)
- `context-extractor.ts`: адаптация extract-функций (поочерёдно, по мере необходимости)
- `utils/text.ts`: перенос truncateText, tableToText

**1.3. Стриминг (бэкенд + клиент)**
- `streaming-manager.ts`: Claude SSE → парсинг → буферизация
- `ws/handler.ts`: WebSocket-маршрутизация, отправка дельт клиенту
- `client/hooks/useWebSocket.ts`: подключение, типизированные сообщения
- `client/hooks/useStreamingGeneration.ts`: подписка на стриминг

**1.4. Роут генерации**
- `POST /syntheses`: создание записи, запуск генерации
- `generation-service.ts`: оркестрация (проходы, buildContext, Claude, сохранение)
- `graph-parser.ts`: parseGraph, parseTopology → categories, category_edges
- `element-parser.ts`: извлечение тезисов, глоссария из HTML

**1.5. Форма создания (клиент)**
- `CreateSynthesisPage.tsx`
- `SynthesisForm.tsx`, `PhilosopherPicker.tsx`, `SectionPicker.tsx`
- `CostEstimate.tsx`, `CompatAdvisor.tsx`
- `GenerationProgress.tsx`

**1.6. Просмотр документа (клиент)**
- `SynthesisPage.tsx`: загрузка данных, рендер
- `DocumentView.tsx`, `DocumentHeader.tsx`, `SectionView.tsx`, `TableOfContents.tsx`
- `GET /syntheses/:id`, `GET /syntheses/:id/sections`

**1.7. Граф категорий (клиент)**
- `GraphModal.tsx`, `Graph3D.tsx`, `Graph2D.tsx`
- `NodePanel.tsx`, `GraphLegend.tsx`
- `graph-utils.ts` (typeColor, edgeTypeStyle, _rebuildNodeColors, _rebuildEdgeStyles, showEdgePanel, getStructuralMarkers, clearLegendFilter — v10: динамические палитры)
- `graph-physics.ts` (tick, warmup)
- `GET /syntheses/:id/categories`

**1.8. Каталог (клиент)**
- `CatalogPage.tsx`, `SynthesisList.tsx`, `SynthesisCard.tsx`
- `GET /syntheses` (свои), `GET /syntheses/public`

**1.9. Биллинг: BYO-Key**
- `api-key-service.ts`: шифрование, хранение, проксирование
- `billing-check.ts`: middleware — проверка наличия ключа
- UI: ввод API-ключа в настройках

**Результат**: полный цикл — создание синтеза, потоковая генерация, просмотр документа с графом, каталог своих синтезов.

---

### Фаза 2: Редактирование и каскады (≈6–8 сессий)

**Цель**: можно редактировать сгенерированный синтез.

**2.1. Перегенерация разделов**
- `POST /syntheses/:id/regenerate/:sectionKey`
- Адаптация regenerateSection (regenerateSection())
- Стриминг через WebSocket

**2.2. Перегенерация подразделов**
- `POST /syntheses/:id/regenerate-subsection`
- Адаптация regenerateSubsection (regenerateSubsection())
- extractIntraSectionContext, extractRelevantIntraSectionContext

**2.3. Каскадный анализ**
- `cascade-analyzer.ts`: computeDependents, getIntraDependents, getCrossSecDependents, getAffectedModes

**2.4. Планы редактирования**
- `edit-planner.ts`: createPlan, addCascadeSteps
- `plan-executor.ts`: последовательное исполнение шагов
- `POST /plans`, `PATCH /plans`, `POST /plans/:id/execute`

> **v10**: исполнение плана использует `buildPlanOrder()` — единый топологический порядок для add+regen (вместо раздельных этапов). После плана: предложение обновить «Структура документа» + каскад для downstream.

**2.5. UI редактирования**
- `EditModal.tsx`, `EditSectionCard.tsx`
- `SubsectionRegenPanel.tsx`
- `EditPlanPanel.tsx`, `CascadePanel.tsx`
- `AddSectionPanel.tsx`
- `useEditPlan.ts` hook

**2.6. Удаление и добавление разделов**
- `DELETE` логика + перенумерация
- `addSection` логика + вставка в правильную позицию

**2.7. Трекинг «Структура документа» (v10)**
- `DOC_STATE.structureSections`: снимок `sectionOrder` при генерации подраздела
- `refreshSumDef()`: перестроение `sectionDefs["sum"]` после добавления/удаления разделов
- Карточка «Структура устарела» в EditModal + `regenStructureFromEditModal()`

**2.8. Лог контекста и генерации**
- `log-formatter.ts`: перенос formatCtxLog
- `ContextLogViewer.tsx`, `colorize-log.ts`
- `GET /syntheses/:id/logs/formatted`

**Результат**: полный цикл редактирования — перегенерация разделов/подразделов, каскады, планы.

---

### Фаза 3: Мета-синтез и наследование (≈4–5 сессий)

**Цель**: можно создавать мета-синтезы и навигировать по графу наследования.

**3.1. Мета-синтез**
- `meta-synthesis-service.ts`: загрузка контекста участника из БД, conceptContextBlock
- **Unified Concept Pool** (`ConceptPool.tsx`): загрузка концепций в пул, ◉ просмотр, ☑ мета-синтез
- Проверки: пригодность, генеалогические пересечения
- `checkGenealogyOverlaps` (проверка `isAncestor` — в `lineage-service`)
- synthesis_lineage: запись при создании
- v10: `genCommon.conceptBlockSizes` — размеры блоков контекста концепций (для реконструкции промптов)

**3.2. Граф наследования**
- `lineage-service.ts`: рекурсивные CTE (ancestors, descendants)
- `GET /lineage/search?philosopher=Кант`
- `GenealogyTree.tsx`: CSS org-chart рендерер
- `LineageSearch.tsx`: поиск концепций по философам-предкам

**3.3. Навигация**
- В карточке синтеза: ссылки на родителей и потомков
- В каталоге: фильтр «содержит философа X в генеалогии»

**Результат**: можно создать мета-синтез из двух концепций, видеть дерево наследования, переходить между потомками и родителями.

---

### Фаза 4: Режимы и экспорт (≈3–4 сессии)

**4.1. Режимы**
- `mode-service.ts`: buildModeContext, промпты из Registry
- `ModeModal.tsx`, `ModeTabBar.tsx`, `ModeContent.tsx`
- `POST /modes/:modeKey/run`, стриминг через WebSocket
- Хранение в `mode_results`

**4.1b. Реконструкция промптов (v10)**
- `prompt-reconstruction.ts`: `reconstructBaseCtxSkeleton`, `reconstructCtxMarkers`, `reconstructSectionTask`, `reconstructSkeleton`
- Используется в `formatPromptsForExport()` для файлов без `_promptSkeleton`

**4.2. Экспорт**
- `html-exporter.ts`: генерация самодостаточного HTML (включая JS графа)
- `mmd-exporter.ts`: Mermaid (перенос exportMMD)
- `json-exporter.ts`: граф в JSON
- `png-exporter.ts`: node-canvas рендер графа
- `GET /export/html`, `/mmd`, `/png`, `/json`

**4.3. Импорт + Unified Concept Pool**
- `import-service.ts`: парсинг HTML → создание синтеза в БД
- `ImportPage.tsx`: загрузка файла, валидация, предупреждения
- `POST /syntheses/import`

> **v10**: на клиенте раздельные блоки «Импорт файла» и «Концепции для Синтеза» заменены единым **Unified Concept Pool**. Пул позволяет загружать несколько концепций, переключаться между ними (◉ просмотр) и отмечать для мета-синтеза (☑). В сервисе это не меняет архитектуру (бэкенд по-прежнему принимает participants), но клиентский код пула — новый.

**Результат**: все режимы работают, можно экспортировать/импортировать.

---

### Фаза 5: Ручное редактирование и версионирование (≈4–5 сессий)

**5.1. Inline-редактирование элементов**
- `element-editor.ts`: PATCH-обработчики + impact analysis
- `ElementEditor.tsx`: inline-формы для категорий, тезисов, глоссария
- Интеграция с NodePanel (редактирование узла графа)

**5.2. Версионирование**
- `element-versioning.ts`: создание версий, откат
- `element_versions` таблица
- UI: история изменений элемента

**5.3. Расширенные характеристики**
- Добавить поля `historical_significance`, `innovation_degree`, `clarity`, `breadth`, `depth_score`, `applicability` в categories (v10)
- Добавить поля `certainty`, `historical_support`, `logical_necessity`, `innovation_degree`, `context_dependency` в category_edges (v10)
- `CharacteristicSlider.tsx`: UI-слайдер для каждой характеристики
- Интеграция с ElementEditor и NodePanel

**5.4. Точечные Claude-запросы (Element Enrichment)**
- `element-enrichment.ts`: обогащение категорий, обоснование связей
- `characteristic_justifications` таблица: хранение обоснований
- Промптовые шаблоны в Registry: `enrichment.category`, `enrichment.edge`, `enrichment.characteristic_justification`
- `EnrichmentPanel.tsx`: отображение результатов обогащения
- Стриминг через WebSocket (enrichment_delta, enrichment_done)

**5.5. Таксономия типов**
- `element-taxonomy.ts`: нечёткая нормализация типов при парсинге, справочник для поиска/фильтрации
- `TaxonomySelector.tsx`: выбор типа из каталога
- Интеграция с graph-parser.ts: после парсинга HTML → нормализация типов
- Фильтрация по типам в каталоге концепций

**5.6. Трансформация представлений (graph↔theses)**
- `representation-transformer.ts`: graph→theses и theses→graph как прямая конверсия
- Специальные промпты в Registry: `transform.graph_to_theses`, `transform.theses_to_graph`
- `representation_transforms` таблица: снимки для отката
- `TransformPanel.tsx`: кнопки «→ Тезисы» / «→ Граф», превью изменений, история
- Итеративный цикл: трансформация → ручное редактирование → трансформация обратно
- Интеграция с graph-parser + element-taxonomy (нормализация при theses→graph)

**5.7. Автозамена**
- При переименовании категории: поиск упоминаний в HTML всех разделов, предложение замены

**Результат**: можно вручную изменить любой элемент синтеза, видеть историю изменений.

---

### Фаза 6: Биллинг, админка, полировка (≈3–4 сессии)

**6.1. Три режима биллинга**

Приоритет: BYO-Key → активная подписка → баланс → ошибка.

- `billing-service.ts`: пополнение баланса (Stripe PaymentIntents), per-request списание
- `subscription-service.ts`:
  - Управление планами (`subscription_plans`): Starter / Pro / Academic
  - Создание подписки (Stripe Subscriptions API)
  - Счётчики квот (`used_syntheses`, `used_regenerations`, …) в `user_subscriptions`
  - Сброс счётчиков при новом периоде (webhook `invoice.paid`)
  - Отмена / возобновление (`cancel_at_period_end`)
- `billing-check.ts` (middleware): определение режима + проверка квоты или баланса
- Stripe Webhook endpoint: `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`
- `BillingPage.tsx`: три вкладки — «Ключ API», «Подписка», «Баланс»

**6.2. Prompt Registry UI**
- `AdminPromptsPage.tsx`: список, редактирование, версионирование
- Тестовый запуск с черновиком

**6.3. Публичный каталог**
- Расширенные фильтры: метод, уровень, философы, наличие мета-синтеза
- Статистика на карточке: количество тезисов, категорий, стоимость

**6.4. Полировка**
- Rate limiting с осмысленными сообщениями
- Error boundaries, fallback UI
- Mobile-адаптивность
- Accessibility
- Оптимизация запросов (N+1, query планы)

---

## 3. Порядок переноса промптовых шаблонов

Промпты переносятся не все сразу, а по мере реализации функциональности:

| Фаза | Промпты для переноса |
|---|---|
| 0 (seed) | ВСЕ — скрипт seed-prompts.ts извлекает все шаблоны из исходника и записывает в БД |
| 1 (MVP) | Используются: system, method.*.*, level.*.*, section.*, quality_reinforcement |
| 2 (Edit) | Используются: те же + subsection_regen_wrapper |
| 3 (Meta) | Используются: + concept_context_block, meta_synthesis_preamble |
| 4 (Modes) | Используются: + mode.adversarial.*, mode.translator.*, mode.timeslice.* |

---

## 4. Порядок переноса extract-функций

`extractContextFragment()` вызывает ~20 специализированных функций. Переносить нужно в порядке приоритета (по частоте использования в зависимостях):

| Приоритет | Функция | Используется в разделах |
|---|---|---|
| 1 | extractSummaryGoals, extractSummaryTensions | graph, glossary, theses, dialogue, critique |
| 2 | extractGraphNodesTable, extractGraphEdges | theses, dialogue, critique, practical |
| 3 | extractGlossaryTable | theses, dialogue, critique |
| 4 | extractThesesSummary | dialogue, critique, evolution |
| 5 | extractDialogueNewConcepts, extractDialogueSynthesis | critique, evolution |
| 6 | extractCritiqueSummary | evolution, practical |
| 7 | extractPortraits | theses, dialogue |
| 8 | extractHistoryTable | critique |
| 9 | extractTopologyRoles, extractTopologyClusters | graph_topology (внутренний) |
| 10 | extractCapsuleText | modes |

---

## 5. Критические решения до начала разработки

### 5.1. Формат хранения HTML

**Решение**: дуальное хранение.
- `sections.html_content` — raw HTML (для рендеринга, экспорта)
- Гранулярные таблицы (`categories`, `theses`, `glossary_terms`) — для редактирования, контекста, поиска

При генерации: HTML → парсинг → гранулярные таблицы.
При ручном редактировании: гранулярная таблица обновляется, HTML перегенерируется из данных (серверный шаблон).

### 5.2. Серверный парсинг HTML

**Решение**: `linkedom` (легковесный серверный DOM) для парсинга HTML-ответов Claude.
Причина: `parseGraph()` и другие функции из исходника работают с DOM API (querySelector, textContent). linkedom поддерживает этот API — минимум переписывания.

### 5.3. WebSocket vs SSE для клиент-серверного стриминга

**Решение**: WebSocket.
Причина: двунаправленная связь (клиент отправляет confirm_step, cancel). SSE — только сервер → клиент.

### 5.4. Монолит vs микросервисы

**Решение**: монолит (Hono на одном процессе).
Причина: на масштабе MVP (один сервер) микросервисы — оверкилл. Hono достаточно быстр. При необходимости — вынос worker-процессов для стриминга (фаза масштабирования).

---

## 6. Миграция существующих пользователей

### 6.1. Массовый импорт

Скрипт `scripts/migrate-html-files.ts`:
1. Принимает папку с HTML-файлами
2. Для каждого файла: importHTML → создаёт запись в БД
3. Вывод: отчёт о количестве импортированных, ошибках, предупреждениях

### 6.2. Онлайн-импорт

- Страница ImportPage.tsx
- Drag & drop или кнопка выбора файла
- Превью метаданных + предупреждения до импорта
- Прогресс-бар для больших файлов

---

## 7. Оценка трудоёмкости

| Фаза | Сессий | Основные задачи |
|---|---|---|
| 0. Инфраструктура | 3–4 | Скелет, БД, Auth, WebSocket, seed |
| 1. MVP | 9–12 | Генерация, просмотр, граф, каталог, Concept Pool |
| 2. Редактирование | 6–8 | Перегенерация, каскады, планы |
| 3. Мета-синтез | 4–5 | Участники, наследование, навигация |
| 4. Режимы + экспорт | 3–4 | Режимы, HTML/MMD/PNG/JSON экспорт, импорт |
| 5. Inline-редактирование | 7–9 | Элементы, версии, характеристики, обогащение, таксономия, трансформации graph↔theses, автозамена |
| 6. Биллинг + админка | 3–4 | Stripe, Prompt Registry UI, полировка |
| **ИТОГО** | **34–45** | |

«Сессия» = одна полноценная беседа с Claude, результат которой — работающий код, покрывающий 1–3 задачи из списка.
