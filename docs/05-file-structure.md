# PhiloSynth Service — Файловая структура

## Монорепозиторий

```
philosynth-service/
├── package.json                    # Workspace root
├── tsconfig.base.json              # Общий TS-конфиг
├── docker-compose.yml              # PostgreSQL + Redis для dev
├── .env.example
├── drizzle.config.ts               # Конфигурация Drizzle ORM
│
├── packages/
│   └── shared/                     # Общий код (клиент + сервер)
│       ├── package.json
│       ├── tsconfig.json
│       │
│       ├── constants/
│       │   ├── philosophers.ts         # Список философов (STATE.PH)
│       │   ├── labels.ts               # ML, SL, DL, REVERSE_ML и т.д. (ML, SL, DL, REVERSE_*, KEY_LABELS)
│       │   ├── section-labels.ts       # KEY_LABELS, SECTION_LABELS (KEY_LABELS, SECTION_LABELS)
│       │   ├── ctx-keys.ts             # ALL_CTX_KEYS, CTX_LABELS (ALL_CTX_KEYS, CTX_LABELS)
│       │   ├── phil-filename.ts        # PHIL_FILENAME (PHIL_FILENAME)
│       │   └── methods.ts              # METHOD_CODE, LEVEL_CODE, ORDER_CODE (METHOD_CODE, LEVEL_CODE)
│       │
│       ├── types/
│       │   ├── synthesis.ts            # SynthesisParams, SynthesisFull, SynthesisPreview
│       │   ├── section.ts              # SectionDef, SectionFull, SectionSummary
│       │   ├── graph.ts                # Category, CategoryEdge, ClusterLabel, TopologyInfo
│       │   ├── elements.ts             # Thesis, GlossaryTerm, DialogueTurn
│       │   ├── lineage.ts              # LineageNode, ParticipantInput
│       │   ├── edit-plan.ts            # EditPlan, EditStep, StepResult
│       │   ├── generation.ts           # GenLogEntry, CtxLogEntry, ContextEntry
│       │   ├── modes.ts                # ModeConfig, ModeResult
│       │   ├── billing.ts              # ApiUsage, Transaction
│       │   ├── prompts.ts              # PromptTemplate, SynthesisConfig
│       │   └── ws-messages.ts          # Все типы WebSocket-сообщений (клиент↔сервер)
│       │
│       └── utils/
│           ├── version.ts              # parseVersion, formatVersion (parseVersion(), formatVersion())
│           ├── transliterate.ts        # transliterate() (transliterate())
│           ├── normalize.ts            # normalizeName, normalizeType (normalizeName(), normalizeType())
│           └── escape.ts               # esc() — HTML-экранирование
│
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   │
│   ├── index.ts                        # Точка входа: Hono app + WebSocket
│   ├── env.ts                          # Типизированные env-переменные
│   │
│   ├── db/
│   │   ├── schema.ts                   # Drizzle-схема (все таблицы из 02-data-model)
│   │   ├── index.ts                    # Подключение к БД
│   │   └── migrations/                 # SQL-миграции Drizzle
│   │       ├── 0000_initial.sql
│   │       └── meta/
│   │
│   ├── middleware/
│   │   ├── auth.ts                     # Lucia Auth: проверка сессии
│   │   ├── rate-limiter.ts             # Redis-based rate limiting
│   │   ├── billing-check.ts            # Проверка баланса / API-ключа перед генерацией
│   │   └── admin-only.ts               # Проверка role === 'admin'
│   │
│   ├── routes/
│   │   ├── auth.ts                     # POST /auth/register, /login, /logout, GET /me
│   │   ├── syntheses.ts                # CRUD /syntheses, /syntheses/:id
│   │   ├── sections.ts                 # GET /syntheses/:id/sections, /:key, /:key/context
│   │   ├── elements.ts                 # GET/PATCH categories, theses, glossary
│   │   ├── transforms.ts               # POST transform graph-to-theses / theses-to-graph, history, rollback
│   │   ├── taxonomy.ts                 # GET/POST category-types, relationship-types, normalize
│   │   ├── enrichment.ts               # POST enrich/category, enrich/edge, justify-characteristic
│   │   ├── generation.ts               # POST regenerate, regenerate-subsection
│   │   ├── plans.ts                    # CRUD /plans, POST execute
│   │   ├── modes.ts                    # POST run, GET results, DELETE
│   │   ├── lineage.ts                  # GET ancestors, descendants, search
│   │   ├── prompts.ts                  # Admin: CRUD prompt_templates, synthesis_configs
│   │   ├── billing.ts                  # API keys, topup, transactions, usage
│   │   ├── export.ts                   # GET /export/html, /mmd, /png, /json, /md
│   │   ├── import.ts                   # POST /syntheses/import
│   │   └── logs.ts                     # GET /logs/generation, /context, /formatted
│   │
│   ├── services/
│   │   ├── synthesis-engine.ts         # resolveContextDeps, buildEffectiveDeps,
│   │   │                               # findSubstitute, deepMergeUniq
│   │   │                               # (deepMergeUniq … buildDynamicOrder)
│   │   │
│   │   ├── section-defs-builder.ts     # buildSectionDefs, serializeParts, groupPasses
│   │   │                               # (baseCtx … patchPromptsWithSecCtx)
│   │   │
│   │   ├── prompt-builder.ts           # buildSYS, baseCtx, buildQualityReinforcement
│   │   │                               # Читает шаблоны из Prompt Registry
│   │   │                               # (buildSYS, baseCtx, serializeParts, patchPromptsWithSecCtx)
│   │   │
│   │   ├── context-builder.ts          # buildContextForSection — адаптация DOM→БД
│   │   │                               # (buildContextForSection())
│   │   │
│   │   ├── context-extractor.ts        # extract*() функции, адаптированные для БД/HTML-парсинга
│   │   │                               # (extractContextFragment + extract*())
│   │   │
│   │   ├── generation-service.ts       # Оркестрация генерации: создание синтеза,
│   │   │                               # проход по разделам, вызов Claude, сохранение
│   │   │                               # Адаптация generateDoc() (generateDoc(), go() (оркестрация генерации))
│   │   │                               # + regenerateSection (regenerateSection())
│   │   │                               # + regenerateSubsection (regenerateSubsection())
│   │   │
│   │   ├── streaming-manager.ts        # Claude SSE → парсинг → WebSocket-дельты
│   │   │                               # + буферизация + reconnect через Redis
│   │   │                               # Адаптация streamResp() (streamResp())
│   │   │
│   │   ├── graph-parser.ts             # parseGraph, parseTopology — серверный парсинг HTML
│   │   │                               # (parseTopology() + parseGraph())
│   │   │                               # + извлечение в categories/edges таблицы
│   │   │
│   │   ├── element-parser.ts           # Извлечение тезисов, глоссария, диалога из HTML
│   │   │                               # → запись в гранулярные таблицы
│   │   │
│   │   ├── cascade-analyzer.ts         # computeDependents, getIntraDependents,
│   │   │                               # getCrossSecDependents, getAffectedModes,
│   │   │                               # sortInTopoOrder, buildFactualDepsMap
│   │   │                               # (computeDependents … computeFactualDependents)
│   │   │
│   │   ├── edit-planner.ts             # createPlan, updatePlan, addCascadeSteps
│   │   │                               # Адаптация recalcEditPlan (recalcEditPlan()),
│   │   │                               # updateLiveCascade (updateLiveCascade())
│   │   │
│   │   ├── plan-executor.ts            # executePlan — последовательное исполнение шагов
│   │   │                               # Адаптация executeEditPlan (executeEditPlan())
│   │   │
│   │   ├── compat-advisor.ts           # computeSectionRating, computeOverallCompat
│   │   │                               # (computeSectionRating … getCompatAdvice)
│   │   │
│   │   ├── cost-estimator.ts           # estimateCost, estimateSubsectionCost, estimateModeCost
│   │   │                               # (estimateCost … estimateModeCost)
│   │   │
│   │   ├── mode-service.ts             # MODE_CONFIG (→ Registry), buildModeContext, runMode
│   │   │                               # (MODE_CONFIG … regenerateModeSilent (вся система режимов))
│   │   │
│   │   ├── element-editor.ts           # PATCH-обработчики для категорий/тезисов/глоссария
│   │   │                               # + impact analysis (НОВОЕ)
│   │   │
│   │   ├── element-versioning.ts       # Создание версий, откат (НОВОЕ)
│   │   │
│   │   ├── element-taxonomy.ts         # Каталог типов категорий/связей, нечёткая нормализация,
│   │   │                               # справочник для поиска/фильтрации (НОВОЕ, из предыдущего проекта)
│   │   │
│   │   ├── representation-transformer.ts # Трансформация graph↔theses: прямая конверсия
│   │   │                               # представлений без каскадной перегенерации
│   │   │                               # (НОВОЕ, из предыдущего проекта)
│   │   │
│   │   ├── element-enrichment.ts       # Точечные Claude-запросы: обогащение категорий,
│   │   │                               # обоснование связей, justification характеристик
│   │   │                               # (НОВОЕ, из предыдущего проекта)
│   │   │
│   │   ├── meta-synthesis-service.ts   # importConceptAsParticipant (из БД, не из DOM)
│   │   │                               # checkGenealogyOverlaps, isAncestor
│   │   │                               # (importConceptAsParticipant … isAncestor)
│   │   │
│   │   ├── import-service.ts           # importHTML, extractMetadata, extractSections,
│   │   │                               # buildDocStateFromImport
│   │   │                               # (весь импорт: handleImportFile … buildDocStateFromImport)
│   │   │
│   │   ├── prompt-registry.ts          # getTemplate, renderTemplate, listVersions,
│   │   │                               # activateVersion, testDraft (НОВОЕ)
│   │   │
│   │   ├── billing-service.ts          # Stripe, транзакции, проверка баланса (НОВОЕ)
│   │   │
│   │   ├── api-key-service.ts          # Шифрование/дешифрование, проксирование (НОВОЕ)
│   │   │
│   │   ├── lineage-service.ts          # Рекурсивные CTE для навигации по графу (НОВОЕ)
│   │   │
│   │   ├── log-formatter.ts            # formatCtxLog (formatCtxLog())
│   │   │
│   │   └── export/
│   │       ├── html-exporter.ts        # saveHTML + buildGraphExportSection + buildModesExportSection
│   │       │                           # (saveHTML + buildGraphExportSection)
│   │       ├── mmd-exporter.ts         # exportMMD (exportMMD())
│   │       ├── png-exporter.ts         # exportPNG — node-canvas (exportPNG())
│   │       ├── json-exporter.ts        # exportJSON (exportJSON())
│   │       └── md-exporter.ts          # Markdown экспорт (НОВОЕ)
│   │
│   ├── config/
│   │   ├── context-deps.ts             # Начальные значения для seed в synthesis_configs
│   │   ├── substitution-map.ts         # Начальные значения
│   │   ├── compat-matrix.ts            # Начальные значения
│   │   ├── intra-deps.ts              # Начальные значения
│   │   ├── subsection-ctx-keys.ts     # Начальные значения
│   │   ├── topology-roles.ts          # Начальные значения
│   │   └── fragment-share.ts          # FRAGMENT_SHARE, CONTEXT_BUDGET
│   │
│   ├── utils/
│   │   ├── deep-merge.ts               # deepMergeUniq (deepMergeUniq())
│   │   ├── topo-sort.ts                # topologicalSort, computePredecessors,
│   │   │                               # buildDynamicOrder (computePredecessors … buildDynamicOrder)
│   │   ├── text.ts                     # truncateText, tableToText (truncateText(), tableToText())
│   │   ├── css-audit.ts                # auditCSS (auditCSS())
│   │   ├── html-parser.ts              # Обёртка над linkedom для серверного DOM-парсинга
│   │   └── crypto.ts                   # AES-256 шифрование API-ключей
│   │
│   └── ws/
│       ├── handler.ts                  # WebSocket upgrade + маршрутизация сообщений
│       ├── connection-manager.ts       # Управление подключениями, ping/pong
│       └── stream-state.ts            # Redis: сохранение/восстановление состояния стрима
│
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── index.html
│   │
│   ├── src/
│   │   ├── main.tsx                    # React entry point
│   │   ├── App.tsx                     # Router (React Router)
│   │   ├── globals.css                 # CSS-переменные (палитра из исходника),
│   │   │                               # Tailwind директивы
│   │   │
│   │   ├── api/
│   │   │   ├── client.ts               # fetch-обёртка с auth, error handling
│   │   │   ├── syntheses.ts            # API-функции для /syntheses
│   │   │   ├── sections.ts
│   │   │   ├── elements.ts
│   │   │   ├── generation.ts
│   │   │   ├── plans.ts
│   │   │   ├── modes.ts
│   │   │   ├── lineage.ts
│   │   │   ├── billing.ts
│   │   │   └── export.ts
│   │   │
│   │   ├── stores/
│   │   │   ├── auth-store.ts           # Zustand: user, session
│   │   │   ├── synthesis-store.ts      # Zustand: текущий синтез, разделы, элементы
│   │   │   ├── generation-store.ts     # Zustand: состояние генерации, стриминг
│   │   │   └── ui-store.ts            # Zustand: модалки, sidebar, theme
│   │   │
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts         # WebSocket с reconnect, типизированные сообщения
│   │   │   ├── useStreamingGeneration.ts  # Подписка на стриминг генерации
│   │   │   ├── useEditPlan.ts          # Состояние плана редактирования
│   │   │   └── useGraphData.ts         # Загрузка и подготовка данных графа
│   │   │
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── CatalogPage.tsx         # Каталог (свои + публичные)
│   │   │   ├── CreateSynthesisPage.tsx  # Форма создания (НОВОЕ)
│   │   │   ├── SynthesisPage.tsx       # Просмотр синтеза
│   │   │   ├── ImportPage.tsx
│   │   │   ├── BillingPage.tsx
│   │   │   └── AdminPromptsPage.tsx
│   │   │
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Layout.tsx
│   │   │   │
│   │   │   ├── synthesis/
│   │   │   │   ├── SynthesisForm.tsx       # Форма параметров (философы, метод, секции...)
│   │   │   │   ├── PhilosopherPicker.tsx   # Чекбоксы философов
│   │   │   │   ├── SectionPicker.tsx       # Чекбоксы секций с compat-adviser
│   │   │   │   ├── CostEstimate.tsx        # Оценка стоимости
│   │   │   │   ├── CompatAdvisor.tsx       # Рекомендации совместимости
│   │   │   │   ├── ConceptParticipants.tsx  # Добавление концепций для мета-синтеза
│   │   │   │   └── GenerationProgress.tsx  # Прогресс-панель (шаги, спиннеры)
│   │   │   │
│   │   │   ├── document/
│   │   │   │   ├── DocumentView.tsx        # Полный документ (рендер HTML)
│   │   │   │   ├── DocumentHeader.tsx      # Шапка (номер, участники, метод, капсула)
│   │   │   │   ├── SectionView.tsx         # Один раздел
│   │   │   │   ├── TableOfContents.tsx     # Оглавление с якорями
│   │   │   │   └── DocumentFooter.tsx      # Футер (стоимость, участники)
│   │   │   │
│   │   │   ├── graph/
│   │   │   │   ├── GraphModal.tsx          # Модальное окно графа (2D/3D табы)
│   │   │   │   ├── Graph3D.tsx             # Three.js рендерер (из build3D, build3D())
│   │   │   │   ├── Graph2D.tsx             # D3.js рендерер (из build2D, build2D())
│   │   │   │   ├── NodePanel.tsx           # Информационная панель узла
│   │   │   │   ├── GraphLegend.tsx         # Легенда
│   │   │   │   └── graph-utils.ts          # typeColor, edgeTypeStyle, polyPath, nodeSymbolPath
│   │   │   │                               # (константы графа + вспомогательные функции)
│   │   │   │
│   │   │   ├── edit/
│   │   │   │   ├── EditModal.tsx           # Модальное окно редактирования
│   │   │   │   ├── EditSectionCard.tsx     # Карточка раздела (перегенерация/удаление)
│   │   │   │   ├── SubsectionRegenPanel.tsx # Перегенерация подраздела
│   │   │   │   ├── EditPlanPanel.tsx       # Визуализация плана с каскадом
│   │   │   │   ├── CascadePanel.tsx        # Панель каскадных зависимостей
│   │   │   │   ├── AddSectionPanel.tsx     # Панель добавления разделов
│   │   │   │   ├── ElementEditor.tsx       # Inline-редактирование элементов (НОВОЕ)
│   │   │   │   ├── CharacteristicSlider.tsx # Слайдер характеристики + кнопка «Обоснование»
│   │   │   │   ├── EnrichmentPanel.tsx     # Панель результатов обогащения элемента
│   │   │   │   ├── TaxonomySelector.tsx    # Выбор типа из каталога при нормализации
│   │   │   │   └── TransformPanel.tsx      # Кнопки graph→theses / theses→graph, превью, история
│   │   │   │
│   │   │   ├── modes/
│   │   │   │   ├── ModeModal.tsx           # Модальное окно режима
│   │   │   │   ├── ModeTabBar.tsx          # Вкладки результатов
│   │   │   │   └── ModeContent.tsx         # Рендер HTML-результата
│   │   │   │
│   │   │   ├── lineage/
│   │   │   │   ├── GenealogyTree.tsx       # Дерево наследования (CSS org-chart)
│   │   │   │   └── LineageSearch.tsx       # Поиск по генеалогии
│   │   │   │
│   │   │   ├── catalog/
│   │   │   │   ├── SynthesisList.tsx       # Список карточек синтезов
│   │   │   │   ├── SynthesisCard.tsx       # Карточка синтеза в каталоге
│   │   │   │   └── CatalogFilters.tsx      # Фильтры и поиск
│   │   │   │
│   │   │   ├── logs/
│   │   │   │   ├── ContextLogViewer.tsx    # Модальное окно лога
│   │   │   │   └── colorize-log.ts        # colorizeLog() (colorizeLog())
│   │   │   │
│   │   │   └── shared/
│   │   │       ├── Button.tsx
│   │   │       ├── Modal.tsx
│   │   │       ├── LoadingSpinner.tsx
│   │   │       └── ErrorBoundary.tsx
│   │   │
│   │   └── utils/
│   │       ├── graph-physics.ts            # tick(), warmup() (tick(), warmup())
│   │       ├── graph-geometry.ts           # nodeGeometry3D, mkSprite (nodeGeometry3D(), mkSprite())
│   │       └── format.ts                  # Форматирование чисел, дат
│   │
│   └── public/
│       └── favicon.svg
│
└── scripts/
    ├── seed-prompts.ts                 # Начальное заполнение prompt_templates из исходника
    ├── seed-configs.ts                 # Начальное заполнение synthesis_configs из исходника
    ├── seed-taxonomy.ts                # Заполнение каталогов типов (18 категорий + 29 связей)
    └── migrate-html-files.ts           # Массовый импорт HTML-файлов в БД
```
