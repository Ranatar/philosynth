# PhiloSynth Service — Файловая структура

> **Ревизия 2026-07-22**: дерево дополнено модулями подсистем v11 —
> parent-context, pause/resume, кардинальность, context-quality,
> section-warnings. Спецификации — 01-architecture, §4.12–4.15.

## Монорепозиторий

```
philosynth-service/
├── package.json                    # Workspace root
├── tsconfig.base.json              # Общий TS-конфиг
├── docker-compose.yml              # PostgreSQL + Redis для dev
├── .gitignore                      # node_modules, dist, .env (пароль БД
│                                   # и ключи API), dump.rdb, архивы
├── .env.example                    # ВСЕ переменные server/env.ts;
│                                   # пароль БД обязан совпадать с дефолтом
│                                   # env.ts — .env читает только drizzle-kit,
│                                   # tsx-скрипты берут process.env
├── drizzle.config.ts               # Конфигурация Drizzle ORM
│
├── packages/
│   └── shared/                     # Общий код (клиент + сервер)
│       ├── package.json
│       ├── tsconfig.json
│       │
│       ├── constants/
│       │   ├── philosophers.ts         # Список философов — 106 позиций (+36 в v10; сверено в беседе 0.1)
│       │   ├── labels.ts               # ML, SL, DL, REVERSE_ML и т.д. (ML, SL, DL, REVERSE_*, KEY_LABELS)
│       │   ├── section-labels.ts       # KEY_LABELS, SECTION_LABELS (KEY_LABELS, SECTION_LABELS)
│       │   ├── ctx-keys.ts             # CTX_LABELS (ALL_CTX_KEYS удалён в v11; перечень ключей — из CTX_LABELS)
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
│       │                               # v11: + resume_generation/resume_plan,
│       │                               #   generation_paused (estimates), generation_resumed
│       │
│       └── utils/
│           ├── version.ts              # parseVersion, formatVersion (parseVersion(), formatVersion())
│           ├── transliterate.ts        # transliterate() (transliterate())
│           ├── normalize.ts            # normalizeName, normalizeType (normalizeName(), normalizeType())
│           ├── escape.ts               # esc() — HTML-экранирование
│           ├── cardinality.ts          # participantCardinality, participantWord/Sg,
│           │                           # hasConceptParticipants (v11, 01 §4.14)
│           └── colorize-log.ts         # colorizeLog() — единая реализация (2.4;
│                                       # клиент реэкспортирует)
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
│   │   │                               # (создаёт беседа 1.6 — до 2026-07-30
│   │   │                               #  модуль не был назначен ни одной беседе)
│   │   ├── elements.ts                 # GET/PATCH categories, theses, glossary
│   │   │                               # GET /categories — беседа 1.6 (нужен 1.7),
│   │   │                               # остальное (PATCH, theses, glossary) — 5.1
│   │   ├── transforms.ts               # POST transform graph-to-theses / theses-to-graph, history, rollback
│   │   ├── taxonomy.ts                 # GET/POST category-types, relationship-types, normalize
│   │   ├── enrichment.ts               # POST enrich/category, enrich/edge, justify-characteristic
│   │   ├── generation.ts               # POST regenerate, regenerate-subsection
│   │   ├── plans.ts                    # CRUD /plans, POST execute
│   │   ├── modes.ts                    # POST run, GET results, DELETE
│   │   ├── lineage.ts                  # GET ancestors, descendants, search
│   │   ├── prompts.ts                  # Admin: CRUD prompt_templates, synthesis_configs
│   │   │                               # (создаёт беседа 6.1 — до 2026-07-30
│   │   │                               #  модуль не был назначен ни одной беседе;
│   │   │                               #  клиентский api/prompts.ts — 6.2)
│   │   ├── billing.ts                  # API keys, topup, transactions, usage
│   │   ├── export.ts                   # GET /export/html, /mmd, /png, /json, /md
│   │   ├── import.ts                   # POST /syntheses/import
│   │   └── logs.ts                     # GET /logs/generation, /context, /formatted
│   │                                   # (создаёт беседа 2.4; /logs/prompts —
│   │                                   #  без skeleton-fallback до 4.2)
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
│   │   │                               # Модель v11: одна попытка (_streamRespOnce) +
│   │   │                               # классификация ошибок kind (auth/billing/pre-stream/
│   │   │                               # max-tokens/partial/stuck/user-abort); ретраи и
│   │   │                               # пауза — уровнем выше (pause-resume-service)
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
│   │   ├── compat-advisor.ts           # computeSectionRating + Advisor v2 (v11):
│   │   │                               # getCompatEntryByKey (entry-модель level:method,
│   │   │                               # severity, чипы) + computeSectionWarnings/
│   │   │                               # updateSectionWarnings (живые предупреждения)
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
│   │   │                               # checkGenealogyOverlaps
│   │   │                               # (importConceptAsParticipant … reconstructGenealogy)
│   │   │
│   │   ├── import-service.ts           # importHTML, extractMetadata, extractSections,
│   │   │                               # buildDocStateFromImport
│   │   │                               # (importHTML … buildDocStateFromImport)
│   │   │
│   │   ├── prompt-registry.ts          # getTemplate, renderTemplate, listVersions,
│   │   │                               # activateVersion, testDraft (НОВОЕ)
│   │   │
│   │   ├── billing-service.ts          # Stripe PaymentIntents, транзакции, проверка баланса
│   │   ├── subscription-service.ts    # Stripe Subscriptions: планы, квоты, счётчики, webhook
│   │   │
│   │   ├── api-key-service.ts          # Шифрование/дешифрование, проксирование (НОВОЕ)
│   │   │
│   │   ├── lineage-service.ts          # Рекурсивные CTE для навигации по графу (НОВОЕ)
│   │   │
│   │   ├── plan-order-builder.ts       # buildPlanOrder — единый топопорядок (v10)
│   │   ├── structure-tracker.ts        # refreshSumDef, structureSections (v10)
│   │   ├── prompt-reconstruction.ts    # reconstructBaseCtxSkeleton, reconstructCtxMarkers (v10)
│   │   │
│   │   ├── parent-context.ts           # resolveParentDeps(ForSubsection), parentFieldsUsedFor,
│   │   │                               # buildParentSpecForLog, conceptContextBlockSelective
│   │   │                               # (v11, 01 §4.13; бюджет — в context-builder)
│   │   │
│   │   ├── pause-resume-service.ts     # pausedState (gen|plan), классификация обрывов,
│   │   │                               # серверный аналог _computeGenPauseEstimates,
│   │   │                               # resume-ветки fill-missing-subs/retry/skip/stop
│   │   │                               # (v11, 01 §4.12)
│   │   │
│   │   ├── context-quality.ts          # getSectionContextQuality поверх context_log:
│   │   │                               # score + issues → бейдж в Edit Modal (v11)
│   │   │
│   │   ├── log-formatter.ts            # formatCtxLog (formatCtxLog())
│   │   │                               # v11: правила tz_budget_mode 4.8.3 (Контекст родителей,
│   │   │                               # режим бюджета, ⚠ отсутствует обязательное поле,
│   │   │                               # ↻ МИГРАЦИЯ СХЕМЫ)
│   │   │
│   │   └── export/
│   │       ├── html-exporter.ts        # saveHTML + buildGraphExportSection + buildModesExportSection
│   │       │                           # (saveHTML + buildGraphExportSection)
│   │       ├── mmd-exporter.ts         # exportMMD (exportMMD())
│   │       ├── png-exporter.ts         # exportPNG — node-canvas (exportPNG())
│   │       ├── json-exporter.ts        # exportJSON (exportJSON())
│   │       ├── md-exporter.ts          # Markdown экспорт — порт saveMD() + node2md/sec2md/
│   │       │                           # table2md из исходника (реализован, НЕ новое)
│   │       └── filename.ts             # getDocFilename() — имена файлов экспорта
│   │
│   ├── config/
│   │   ├── context-deps.ts             # Начальные значения для seed в synthesis_configs
│   │   ├── substitution-map.ts         # Начальные значения
│   │   ├── compat-matrix.ts            # Начальные значения
│   │   ├── intra-deps.ts              # Начальные значения
│   │   ├── subsection-ctx-keys.ts     # Начальные значения
│   │   ├── topology-roles.ts          # Начальные значения
│   │   ├── fragment-share.ts          # FRAGMENT_SHARE, CONTEXT_BUDGET
│   │   ├── extra-types.ts             # _EXTRA_CATEGORY_TYPES, _EXTRA_EDGE_TYPES,
│   │   │                              # _SYNTH_LEVEL_TYPE_PHRASING (v10)
│   │   ├── parent-deps.ts             # PARENT_DEPS_BASE/GENETIC/LEVEL/LEVEL_GENETIC/METHOD,
│   │   │                              # PARENT_INTRA_DEPS, PARENT_FIELD_ORDER/LABELS,
│   │   │                              # PARENT_CONTEXT_SCHEMA_ID/VERSION (v11)
│   │   ├── cardinality-prompts.ts     # MD_BY_CARD (6×3), SD_BY_CARD (3×3) (v11)
│   │   └── mode-deps.ts               # MODE_DEPS (v11)
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
│   │   │   ├── elements.ts             # создаёт беседа 1.7 (getCategories),
│   │   │   │                           # расширяет 5.2
│   │   │   ├── generation.ts
│   │   │   ├── logs.ts                 # GET /logs/* (беседа 2.4)
│   │   │   ├── plans.ts
│   │   │   ├── modes.ts
│   │   │   ├── lineage.ts
│   │   │   ├── billing.ts
│   │   │   ├── subscription.ts
│   │   │   └── export.ts
│   │   │
│   │   ├── stores/
│   │   │   ├── auth-store.ts           # Zustand: user, session
│   │   │   ├── synthesis-store.ts      # Zustand: текущий синтез, разделы, элементы
│   │   │   ├── generation-store.ts     # Zustand: состояние генерации, стриминг
│   │   │   ├── pool-store.ts           # Zustand: Unified Concept Pool (беседа 1.5b)
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
│   │   │   ├── ProfilePage.tsx         # Профиль: displayName + смена пароля (A3, беседа 0.6)
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
│   │   │   │   # ConceptParticipants.tsx заменён → pool/ConceptPool.tsx
│   │   │   │   ├── GenerationProgress.tsx  # Прогресс-панель (шаги, спиннеры)
│   │   │   │   ├── SectionWarnings.tsx     # Живые предупреждения/рекомендации/подстановки
│   │   │   │   │                           # зависимостей в форме (v11)
│   │   │   │   └── PauseModal.tsx          # Модалка паузы: 4 рендерера (gen/plan/billing/auth),
│   │   │   │                               # действия с оценками стоимости (v11, 01 §4.12)
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
│   │   │   │   ├── graph-utils.ts          # typeColor, edgeTypeStyle, polyPath, nodeSymbolPath,
│   │   │   │   │                           # _rebuildNodeColors, _rebuildEdgeStyles, getStructuralMarkers,
│   │   │   │   │                           # clearLegendFilter (v10: динамические палитры вместо TC/EC)
│   │   │   │   └── EdgePanel.tsx           # showEdgePanel — панель информации о связи (v10)
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
│   │   │   ├── pool/                        # Unified Concept Pool (v10)
│   │   │   │   ├── ConceptPool.tsx          # Пул загруженных концепций
│   │   │   │   ├── PoolCard.tsx             # Карточка концепции в пуле
│   │   │   │   └── PoolSummary.tsx          # Саммари пула (1.5b: реализован строкой внутри ConceptPool.tsx — отдельный файл не понадобился)
│   │   │   │
│   │   │   ├── catalog/
│   │   │   │   ├── SynthesisList.tsx       # Список карточек синтезов
│   │   │   │   ├── SynthesisCard.tsx       # Карточка синтеза в каталоге
│   │   │   │   └── CatalogFilters.tsx      # Фильтры и поиск (C5 — Фаза 2;
│   │   │   │                               #  в беседе 1.6b не создаётся,
│   │   │   │                               #  поиск живёт в CatalogPage)
│   │   │   │
│   │   │   ├── logs/
│   │   │   │   ├── ContextLogViewer.tsx    # Модальное окно лога
│   │   │   │   └── colorize-log.ts        # реэкспорт shared/utils/colorize-log (2.4)
│   │   │   │
│   │   │   └── shared/
│   │   │       ├── Button.tsx
│   │   │       ├── Modal.tsx
│   │   │       ├── LoadingSpinner.tsx      # первый потребитель — 1.6b
│   │   │       │                           # (status='generating', загрузка)
│   │   │       └── ErrorBoundary.tsx
│   │   │
│   │   ├── vite-env.d.ts                   # Типы import.meta.env (появился в 1.5b)
│   │   │
│   │   └── utils/
│   │       ├── concept-file.ts             # Парсинг концепт-файлов пула (1.5b, клиентские порты)
│   │       ├── graph-physics.ts            # tick(), warmup() (tick(), warmup())
│   │       ├── graph-geometry.ts           # nodeGeometry3D, mkSprite (nodeGeometry3D(), mkSprite())
│   │       └── format.ts                  # Форматирование чисел, дат
│   │
│   └── public/
│       └── favicon.svg
│
├── scripts/
│   ├── extract-by-name.py              # сборка фрагментов исходника ПО ИМЕНАМ
│   │                                   # из 04-code-reuse-map (замена утраченного
│   │                                   # extract-fragments.py); спецификации —
│   │                                   # docs/fragments-for-conversations/*.spec
│   ├── seed-prompts.ts                 # Начальное заполнение prompt_templates из исходника
│   ├── seed-configs.ts                 # Начальное заполнение synthesis_configs из исходника
│   ├── seed-taxonomy.ts                # Заполнение каталогов типов (18 категорий + 29 связей)
│   ├── extract-seed-data.mjs           # vm-извлечение конфигов/промптов из исходника
│   ├── extract-section-templates.mjs   # Генерация section.* шаблонов Registry
│   ├── patch-docs-*.py                 # Идемпотентные патчи доков по итогам бесед (skip/fail-отчёт)
│   ├── package.json                    # Маркер type=module
│   ├── tsconfig.json                   # Типочек scripts/*.ts + tests/*.ts|*.mts (typecheck:scripts)
│   └── migrate-html-files.ts           # Массовый импорт HTML-файлов в БД (Фаза 4)
│
└── tests/                              # ВСЕ тесты бесед; запуск из корня репо
    ├── smoke-*.mjs / smoke-*.mts       # vm-смоуки байтовой сверки порта с исходником
    ├── test-XX-*.mjs                   # API- и браузерные тесты запросов бесед (puppeteer)
    ├── test-*-0.3b.ts                  # Регрессионные смоуки таксономии
    └── package.json                    # Маркер type=module
```

Workspace-регрессия `audit.mts` и `integration-check.mts` — в server/
(npm-скрипты пакета + tsconfig.checks.json), не в tests/.
