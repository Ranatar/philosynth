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
│       │   ├── philosophers.ts         # Список философов (STATE.PH из строки 3935)
│       │   ├── labels.ts               # ML, SL, DL, REVERSE_ML и т.д. (строки 3955–4108)
│       │   ├── section-labels.ts       # KEY_LABELS, SECTION_LABELS (строки 4077–4108)
│       │   ├── ctx-keys.ts             # ALL_CTX_KEYS, CTX_LABELS (строки 5128–5148)
│       │   ├── phil-filename.ts        # PHIL_FILENAME (строки 13542–13613)
│       │   └── methods.ts              # METHOD_CODE, LEVEL_CODE, ORDER_CODE (строки 13615–13632)
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
│           ├── version.ts              # parseVersion, formatVersion (строки 4228–4332)
│           ├── transliterate.ts        # transliterate() (строки 13634–13657)
│           ├── normalize.ts            # normalizeName, normalizeType (строки 10502–10540)
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
│   │   │                               # (строки 4851–5520)
│   │   │
│   │   ├── section-defs-builder.ts     # buildSectionDefs, serializeParts, groupPasses
│   │   │                               # (строки 8633–9596)
│   │   │
│   │   ├── prompt-builder.ts           # buildSYS, baseCtx, buildQualityReinforcement
│   │   │                               # Читает шаблоны из Prompt Registry
│   │   │                               # (строки 7421–8056, 8633–8714, 9400–9596)
│   │   │
│   │   ├── context-builder.ts          # buildContextForSection — адаптация DOM→БД
│   │   │                               # (строки 7178–7353)
│   │   │
│   │   ├── context-extractor.ts        # extract*() функции, адаптированные для БД/HTML-парсинга
│   │   │                               # (строки 6818–7135)
│   │   │
│   │   ├── generation-service.ts       # Оркестрация генерации: создание синтеза,
│   │   │                               # проход по разделам, вызов Claude, сохранение
│   │   │                               # Адаптация generateDoc() (строки 9600–10325)
│   │   │                               # + regenerateSection (строки 15878–16101)
│   │   │                               # + regenerateSubsection (строки 16103–16321)
│   │   │
│   │   ├── streaming-manager.ts        # Claude SSE → парсинг → WebSocket-дельты
│   │   │                               # + буферизация + reconnect через Redis
│   │   │                               # Адаптация streamResp() (строки 10327–10420)
│   │   │
│   │   ├── graph-parser.ts             # parseGraph, parseTopology — серверный парсинг HTML
│   │   │                               # (строки 10425–10691)
│   │   │                               # + извлечение в categories/edges таблицы
│   │   │
│   │   ├── element-parser.ts           # Извлечение тезисов, глоссария, диалога из HTML
│   │   │                               # → запись в гранулярные таблицы
│   │   │
│   │   ├── cascade-analyzer.ts         # computeDependents, getIntraDependents,
│   │   │                               # getCrossSecDependents, getAffectedModes,
│   │   │                               # sortInTopoOrder, buildFactualDepsMap
│   │   │                               # (строки 5525–5812)
│   │   │
│   │   ├── edit-planner.ts             # createPlan, updatePlan, addCascadeSteps
│   │   │                               # Адаптация recalcEditPlan (строка 15147),
│   │   │                               # updateLiveCascade (строка 15232)
│   │   │
│   │   ├── plan-executor.ts            # executePlan — последовательное исполнение шагов
│   │   │                               # Адаптация executeEditPlan (строка 15600)
│   │   │
│   │   ├── compat-advisor.ts           # computeSectionRating, computeOverallCompat
│   │   │                               # (строки 6129–6516)
│   │   │
│   │   ├── cost-estimator.ts           # estimateCost, estimateSubsectionCost, estimateModeCost
│   │   │                               # (строки 6518–6816)
│   │   │
│   │   ├── mode-service.ts             # MODE_CONFIG (→ Registry), buildModeContext, runMode
│   │   │                               # (строки 18360–19023)
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
│   │   │                               # (строки 17794–18108)
│   │   │
│   │   ├── import-service.ts           # importHTML, extractMetadata, extractSections,
│   │   │                               # buildDocStateFromImport
│   │   │                               # (строки 16955–17657)
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
│   │   ├── log-formatter.ts            # formatCtxLog (строки 19116–19350)
│   │   │
│   │   └── export/
│   │       ├── html-exporter.ts        # saveHTML + buildGraphExportSection + buildModesExportSection
│   │       │                           # (строки 14173–14003)
│   │       ├── mmd-exporter.ts         # exportMMD (строки 12808–13028)
│   │       ├── png-exporter.ts         # exportPNG — node-canvas (строки 13030–13481)
│   │       ├── json-exporter.ts        # exportJSON (строки 13483–13529)
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
│   │   ├── deep-merge.ts               # deepMergeUniq (строка 4851)
│   │   ├── topo-sort.ts                # topologicalSort, computePredecessors,
│   │   │                               # buildDynamicOrder (строки 5370–5520)
│   │   ├── text.ts                     # truncateText, tableToText (строки 7355–7418)
│   │   ├── css-audit.ts                # auditCSS (строки 14006–14171)
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
│   │   │   │   ├── Graph3D.tsx             # Three.js рендерер (из build3D, строка 11172)
│   │   │   │   ├── Graph2D.tsx             # D3.js рендерер (из build2D, строка 12156)
│   │   │   │   ├── NodePanel.tsx           # Информационная панель узла
│   │   │   │   ├── GraphLegend.tsx         # Легенда
│   │   │   │   └── graph-utils.ts          # typeColor, edgeTypeStyle, polyPath, nodeSymbolPath
│   │   │   │                               # (строки 10700–11075)
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
│   │   │   │   └── colorize-log.ts        # colorizeLog() (строки 19352–19800)
│   │   │   │
│   │   │   └── shared/
│   │   │       ├── Button.tsx
│   │   │       ├── Modal.tsx
│   │   │       ├── LoadingSpinner.tsx
│   │   │       └── ErrorBoundary.tsx
│   │   │
│   │   └── utils/
│   │       ├── graph-physics.ts            # tick(), warmup() (строки 11098–11149)
│   │       ├── graph-geometry.ts           # nodeGeometry3D, mkSprite (строки 11077–11170)
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
