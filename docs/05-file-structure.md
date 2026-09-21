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
├── env.local.example               # 8.2: окружение ЛОКАЛЬНОГО СТЕНДА биллинга.
│                                   # 8.6: ИМЯ БЕЗ ВЕДУЩЕЙ ТОЧКИ (было .env.local.example):
│                                   # загрузка «Add files via upload» четыре раза подряд
│                                   # (83aaf2b, 8f9bae0, cd46374, 32171a9) теряла dotfile;
│                                   # dev-billing.sh и 4ak переведены на новое имя, старое
│                                   # в дереве — ошибка 4ak. Прежнее описание:
│                                   # (мок Stripe, фиктивные ключи, BILLING_ENFORCE=true,
│                                   # пустой VITE_STRIPE_PUBLISHABLE_KEY); копируется в
│                                   # .env.local скриптом tools/dev-billing.sh.
│                                   # 8.3: + STRIPE_PRICE_*=price_mock_* — мок не проверяет
│                                   # Price, планы сеются активными (файл воссоздан 8.3:
│                                   # в HEAD 83aaf2b его не было — upload не перенёс dotfile;
│                                   # и СНОВА воссоздан 8.4 — в HEAD 8f9bae0 его опять нет;
│                                   # и В ТРЕТИЙ РАЗ воссоздан 8.5 — HEAD cd46374, вместе с
│                                   # .dev-billing/ в .gitignore и STRIPE_PRICE_* в .env.example;
│                                   # в ЧЕТВЁРТЫЙ — 8.6, HEAD 32171a9, после чего переименован)
├── scripts/checks/check-dotfiles.mjs # 8.7: сторож правок .env.example/.gitignore/env.local.example (npm run check:dotfiles) — dotfile-грабля ×5
├── dev-billing-state/              # 8.6: pid-файлы и логи стенда (в .gitignore; было
│                                   # .dev-billing/ — строка .gitignore терялась при выкладке,
│                                   # папка без точки переживает её)
├── .env.example                    # ВСЕ переменные server/env.ts;
│                                   # пароль БД обязан совпадать с дефолтом
│                                   # env.ts — .env читает только drizzle-kit,
│                                   # tsx-скрипты берут process.env.
│                                   # 8.3: + STRIPE_PRICE_STARTER/PRO/ACADEMIC (читает
│                                   # seed-plans напрямую из process.env, не env.ts)
│                                   # 9.1: + MAIL_TRANSPORT, SMTP_*, MAIL_FROM, PUBLIC_BASE_URL,
│                                   # MAIL_WORKER_INTERVAL_MS, MAIL_RETRY_DELAYS, RATE_LIMIT_MAIL_PER_HOUR
├── drizzle.config.ts               # Конфигурация Drizzle ORM
│
├── packages/
│   └── shared/                     # Общий код (клиент + сервер)
│       ├── package.json
│       ├── tsconfig.json
│       │
│       ├── constants/
│       │   ├── philosophers.ts         # Список философов — 110 позиций (106 исходника, сверено в 0.1; + Шелер, Николай Гартман, Башляр, Семён Франк 2026-09-07)
│       │   ├── labels.ts               # ML, SL, DL, REVERSE_ML и т.д. (ML, SL, DL, REVERSE_*, KEY_LABELS)
│       │   ├── section-labels.ts       # KEY_LABELS, SECTION_LABELS (KEY_LABELS, SECTION_LABELS)
│       │   ├── ctx-keys.ts             # CTX_LABELS (ALL_CTX_KEYS удалён в v11; перечень ключей — из CTX_LABELS)
│       │   ├── phil-filename.ts        # PHIL_FILENAME (PHIL_FILENAME)
│       │   ├── methods.ts              # METHOD_CODE, LEVEL_CODE, ORDER_CODE (METHOD_CODE, LEVEL_CODE)
│       │   ├── characteristics.ts      # Характеристики категорий (8) и связей (6) с
│       │   │                           # диапазонами, resolveCharacteristic (алиасы
│       │   │                           # depth/camelCase), validateCharacteristicValue
│       │   │                           # (5.3; нужны серверу и слайдерам 5.4)
│       │   └── auth.ts                 # 8.1: PASSWORD_MIN_LENGTH, EMAIL_RE,
│       │                               # DISPLAY_NAME_MAX_LENGTH — единый свод правил
│       │                               # аккаунта (routes/auth, bootstrap-admin, RegisterPage)
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
│       │   ├── admin.ts                # 8.1: AdminAction, AdminAuditEntry, AdminUserRow, UserRole
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
│           ├── colorize-log.ts         # colorizeLog() — единая реализация (2.4;
│           │                           # клиент реэкспортирует)
│           └── visibility.ts           # 8.6: effectiveFlags(row) — ОДНА функция действенности
│                                       # флагов публичности (сервер и клиент 8.7); isPublicOf
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
│   │       ├── …                       # 0001 (5.x), 0002 (6.1), 0003 (7.1)
│   │       ├── 0004_admin_audit.sql    # 8.1: таблица admin_audit (тег переименован из генерата)
│   │       ├── 0005_visibility.sql     # 8.6: syntheses.visibility + show_author/show_logs/
│   │       │                           #  show_prompts/allow_meta, ПЕРЕНОС is_public → visibility,
│   │       │                           #  DROP is_public, idx_syntheses_visibility, CHECK; SQL и
│   │       │                           #  снапшот написаны рукой (generate спрашивал о переименовании
│   │       │                           #  интерактивно), `drizzle-kit generate` после — «No schema changes»
│   │       ├── 0006_mail.sql           # 9.1: users.email_verified_at, auth_tokens (CHECK purpose,
│   │       │                           #  два индекса), mail_outbox (индекс status+next_attempt_at);
│   │       │                           #  генерат, тег переименован
│   │       ├── 0007_recommendations.sql # 10.1: recommendations (CHECK статусов, уникальность
│   │       │                           #  по (synthesis_id, round, position), FK plan_id SET NULL);
│   │       │                           #  генерат, тег переименован
│   │       ├── 0008_file_genealogy.sql # 2026-09-21: syntheses.file_genealogy jsonb — дерево
│   │       │                           #  импортированного файла (02 §2.4); генерат
│   │       └── meta/
│   │
│   ├── middleware/
│   │   ├── auth.ts                     # Lucia Auth: проверка сессии
│   │   │                               # 8.6: + optionalAuth (сессия, если есть; иначе гость,
│   │   │                               #  не 401) и viewerOf(c) для гостевых роутов
│   │   ├── rate-limiter.ts             # Redis-based rate limiting
│   │   ├── billing-check.ts            # Проверка баланса / API-ключа перед генерацией
│   │   │                               # (СДЕЛАНО 6.1: предпроверка consume:false на 11 роутах-
│   │   │                               #  стартерах; гейт — withGenerationSlot)
│   │   └── admin-only.ts               # Проверка role === 'admin'
│   │
│   ├── routes/
│   │   ├── auth.ts                     # POST /auth/register, /login, /logout, GET /me
│   │   │                               # 8.1: + GET /auth/users, POST /auth/users/:id/role,
│   │   │                               #  GET /auth/audit (requireAdmin)
│   │   │                               # 9.1: + POST /auth/email/verify/request|confirm,
│   │   │                               #  POST /auth/password-reset/request|confirm; register
│   │   │                               #  ставит письмо в той же транзакции
│   │   ├── syntheses.ts                # CRUD /syntheses, /syntheses/:id
│   │                               # 8.6: loadSynthesisForRead → viewer/scope, projectSynthesis/
│   │                               #  projectPreview, гостевые GET /public и GET /:id (optionalAuth),
│   │                               #  PATCH visibility + флаги, META_NOT_ALLOWED в участниках
│   │   ├── sections.ts                 # GET /syntheses/:id/sections, /:key, /:key/context
│   │   │                               # 9.2: + GET/PATCH /:key/subsections/:name — ручная правка
│   │   │                               # ПОДРАЗДЕЛА; маршрута на тело раздела НЕТ (сторож 4ar)
│   │   │                               # (создаёт беседа 1.6 — до 2026-07-30
│   │   │                               #  модуль не был назначен ни одной беседе)
│   │   ├── elements.ts                 # GET/PATCH categories, theses, glossary
│   │   │                               # GET /categories — беседа 1.6 (нужен 1.7);
│   │   │                               # остальное СДЕЛАНО 5.1: PATCH категорий/
│   │   │                               # связей/тезисов/глоссария, DELETE связи,
│   │   │                               # versions/rollback, auto-rename, capsule
│   │   ├── transforms.ts               # POST transform graph-to-theses / theses-to-graph, history, rollback (5.5 СДЕЛАНО 2026-09-06)
│   │   ├── taxonomy.ts                 # GET/POST category-types, relationship-types, normalize
│   │   │                               # (СДЕЛАНО 5.3; монтируется на /api/v1/taxonomy)
│   │   ├── enrichment.ts               # POST enrich/category, enrich/edge, justify-characteristic
│   │   │                               # + GET enrichments/justifications (СДЕЛАНО 5.3;
│   │   │                               #  POST → { ok:true }, результат по WS)
│   │   ├── generation.ts               # POST regenerate, regenerate-subsection
│   │   ├── plans.ts                    # CRUD /plans, POST execute
│   │   ├── modes.ts                    # POST run, GET results, DELETE
│   │   ├── lineage.ts                  # GET ancestors, descendants, search
│   │   │                               # 8.5: + POST /:id/lineage/link (владелец обоих,
│   │   │                               #  LINEAGE_SELF/CYCLE/EXISTS)
│   │   ├── prompts.ts                  # Admin: CRUD prompt_templates, synthesis_configs
│   │   │                               # (СДЕЛАНО 6.1: 8 эндпоинтов §2.9, requireAdmin)
│   │   │                               # (создаёт беседа 6.1 — до 2026-07-30
│   │   │                               #  модуль не был назначен ни одной беседе;
│   │   │                               #  клиентский api/prompts.ts — 6.2)
│   │   ├── billing.ts                  # API keys, topup, transactions, usage (СДЕЛАНО 6.1:
│   │   │                               #  13 эндпоинтов §2.10; /webhook вне requireAuth;
│   │                               #  8.6: GET /plans под optionalAuth — тарифы гостю)
│   │   ├── export.ts                   # GET /export/html, /mmd, /png, /json, /md
│   │   ├── import.ts                   # POST /syntheses/import
│   │   └── logs.ts                     # GET /logs/generation, /context, /formatted
│   │                                   # (создаёт беседа 2.4; /logs/prompts —
│   │                                   #  без skeleton-fallback до 4.2)
│   │                                   # 8.6: logsAllowed — гейт по effectiveFlags на четырёх путях
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
│   │   │                               # + impact analysis + autoRenameReferences (НОВОЕ)
│   │   │
│   │   ├── element-renderer.ts         # НОВОЕ (решение 2026-09-02, п.1):
│   │   │                               # обратное к element-parser — рисует
│   │   │                               # таблицу категорий/связей/топологии/
│   │   │                               # тезисов/глоссария из гранулярных
│   │   │                               # данных и врезает её в html_content
│   │   │                               # через replaceDocTable (html-parser,
│   │   │                               # 5.1; spliceSubsectionHtml заменял
│   │   │                               # бы весь подраздел — факт 5.1).
│   │   │                               # Раздел целиком НЕ перерисовывается —
│   │   │                               # см. 02 §3. Приёмка: round-trip
│   │   │                               # parse(render(x)) === x
│   │   │
│   │   ├── element-versioning.ts       # Создание версий, откат (НОВОЕ)
│   │   │
│   │   ├── element-taxonomy.ts         # Каталог типов категорий/связей, нечёткая нормализация,
│   │   │                               # справочник для поиска/фильтрации (НОВОЕ, из предыдущего проекта;
│   │   │                               #  7.1: updateCustomType/deleteCustomType — админ-правки, key неизменяем)
│   │   │
│   │   ├── representation-transformer.ts # Трансформация graph↔theses: прямая конверсия
│   │   │                               # представлений без каскадной перегенерации
│   │   │                               # (5.5 СДЕЛАНО 2026-09-06: снимки, откат, слот)
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
│   │   │                               # 8.5: ImportResult += lineageCandidates — родители без
│   │   │                               #  UUID сопоставляются по имени предложением (ветка UUID цела)
│   │   │
│   │   ├── prompt-registry.ts          # getTemplate, renderTemplate, listVersions,
│   │   │                               # activateVersion, testDraft (НОВОЕ)
│   │   │
│   │   ├── billing-service.ts          # Stripe PaymentIntents, транзакции, проверка баланса
│   │   │                               # (СДЕЛАНО 6.1: + resolveBilling — единый резолвер
│   │   │                               #  приоритета, + recordStreamUsage — рекордер
│   │   │                               #  разъёма streaming-manager)
│   │   ├── subscription-service.ts    # Stripe Subscriptions: планы, квоты, счётчики, webhook
│   │   │                               # (СДЕЛАНО 6.1: + consumeQuota — атомарная проверка+инкремент;
│   │   │                               #  7.1: ensureStripeCustomer — один Customer на пользователя)
│   │   ├── account-deletion.ts        # 7.1: DELETE /auth/me — анонимизация users при сохранённой
│   │   │                               # RESTRICT-истории, удаление сессий/ключей/синтезов, отмена подписки
│   │   │                               # 8.1: заслон LAST_ADMIN, строка account.deleted, actor_id → NULL
│   │   ├── admin-audit.ts             # 8.1: writeAudit(exec, …) — db или tx вызывающего, ADMIN_ACTIONS
│   │   │                               # (замороженный список), listAudit, ADMIN_SET_LOCK_KEY
│   │   ├── auth-tokens.ts             # 9.1: одноразовые доводы из писем (sha256 в БД): issueToken
│   │   │                               # гасит прежние, consumeToken — один условный UPDATE,
│   │   │                               # isTokenUsable, revokeTokens; queueVerificationMail /
│   │   │                               # queuePasswordResetMail — довод + письмо под точкой сохранения
│   │   ├── mail/                       # 9.1: почта — четыре модуля с разделением обязанностей
│   │   │   ├── transport.ts            # ТОЛЬКО отправка: nodemailer либо вывод в консоль
│   │   │   │                           # (MAIL_TRANSPORT); classifySendError — род отказа
│   │   │   ├── templates.ts            # два письма, текст и HTML: подтверждение адреса, сброс пароля
│   │   │   ├── outbox.ts               # enqueue(exec, letter) — запись в ПЕРЕДАННОЙ транзакции;
│   │   │   │                           # underSavepoint / tryEnqueue; getOutboxCounts
│   │   │   └── worker.ts               # processOutbox: захват арендой, постоянный/временный отказ,
│   │   │                               # decideRetry; startMailWorker / stopMailWorker (index.ts)
│   │   ├── stripe-client.ts            # Тонкий fetch-клиент Stripe REST + проверка подписи
│   │   │                               # webhook; STRIPE_API_BASE для мока (НОВОЕ 6.1, без SDK)
│   │   │                               # 8.3: + Products/Prices (createProduct, listProducts,
│   │   │                               # createPrice, updatePrice, listPrices) для заведения тарифов
│   │   │
│   │   ├── api-key-service.ts          # Шифрование/дешифрование, проксирование (НОВОЕ)
│   │   │                               # (СДЕЛАНО 6.1: активный ключ один)
│   │   │
│   │   ├── lineage-service.ts          # Рекурсивные CTE для навигации по графу (НОВОЕ)
│   │   │                               # 8.5: + normalizeConceptTitle, findSameOwnerSynthesesByTitle
│   │   │                               #  (сопоставление родителя по имени), isDescendantOf, linkParent
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
│   │       │                           # 8.6: + renderDocFooter (зеркало DocumentFooter — утрачено
│   │       │                           #  4.2) и exportHTML(id, { includeLogs }) — выгрузка без лога
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
│   │   ├── mode-deps.ts               # MODE_DEPS (v11)
│   │   ├── plans.ts                   # 8.3: тарифы БЕЗ stripe_price_id (PLANS: starter/pro/
│   │   │                              # academic), priceEnvVarFor, stripeLookupKeyFor,
│   │   │                              # опорные стоимости операций из констант cost-estimator,
│   │   │                              # assertPlanEconomics (цена ≥ Σ квот × cost × наценка)
│   │   ├── enrichment-templates.ts    # 6 шаблонов enrichment.* (5.3; новые тексты,
│   │   │                              # не из исходника; JUSTIFICATION_SECTIONS)
│   │   ├── transform-templates.ts     # 2 шаблона transform.* (5.5; новые тексты —
│   │   │                              # режим трансформации; форма результата —
│   │   │                              # {{section_task}} из buildSectionDefs)
│   │   └── recommendation-templates.ts # 10.1: шаблон «Таблицы рекомендаций» и шаблон
│   │                                  # ретрофита (новые тексты из shared-констант) +
│   │                                  # НАДСТРОЙКИ над генератами: проза рекомендаций и
│   │                                  # три конфига critique; генераты рукой не правятся
│   │
│   ├── utils/
│   │   ├── deep-merge.ts               # deepMergeUniq (deepMergeUniq())
│   │   ├── topo-sort.ts                # topologicalSort, computePredecessors,
│   │   │                               # buildDynamicOrder (computePredecessors … buildDynamicOrder)
│   │   ├── text.ts                     # truncateText, tableToText (truncateText(), tableToText())
│   │   ├── css-audit.ts                # auditCSS (auditCSS())
│   │   ├── html-parser.ts              # Обёртка над linkedom для серверного DOM-парсинга
│   │   └── crypto.ts                   # AES-256-GCM шифрование API-ключей (СДЕЛАНО 6.1:
│   │   │                               #  deriveKey SHA-256 из секрета, pack iv‖tag‖ciphertext)
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
│   │   ├── globals.css                 # Три части (правка 2026-09-02):
│   │   │                               #  1) :root исходника + базовый слой;
│   │   │                               #  2) ДОСЛОВНЫЙ порт <style> [13–3528];
│   │   │                               #  3) дополнения сервиса (каркас SPA,
│   │   │                               #     каталог, вход, отклонения R9).
│   │   │                               # @tailwind utilities — В КОНЦЕ файла:
│   │   │                               # утилиты обязаны перебивать классы
│   │   │                               # исходника, а не наоборот.
│   │   │
│   │   ├── api/
│   │   │   ├── client.ts               # fetch-обёртка с auth, error handling
│   │   │   ├── syntheses.ts            # API-функции для /syntheses
│   │   │   ├── sections.ts
│   │   │   ├── elements.ts             # создаёт беседа 1.7 (getCategories),
│   │   │   │                           # расширяет 5.2 (PATCH, версии, откат,
│   │   │   │                           # auto-rename)
│   │   │   ├── taxonomy.ts             # каталоги типов + normalize + createCustomType (5.4 СДЕЛАНО 2026-09-05; кэш на сессию)
│   │   │   ├── enrichment.ts           # обогащения и обоснования — 5 функций §2.14 (5.4 СДЕЛАНО 2026-09-05)
│   │   │   ├── transforms.ts           # graph↔theses, история, откат (5.5 СДЕЛАНО 2026-09-06)
│   │   │   ├── prompts.ts              # админка Prompt Registry (6.2 СДЕЛАНО 2026-09-07: 10 функций §2.9; getTemplateVersions/getConfigVersionsFull — обход /versions без тел, долг 7.1)
│   │   │   ├── import.ts               # multipart-обёртка импорта (4.3)
│   │   │   ├── generation.ts
│   │   │   ├── logs.ts                 # GET /logs/* (беседа 2.4)
│   │   │   ├── plans.ts
│   │   │   ├── modes.ts
│   │   │   ├── lineage.ts              # 3.2: ancestors/descendants/search; 8.5: + linkParent
│   │   │   ├── billing.ts              # 7 функций §2.10: ключ, пополнение, истории (6.2 СДЕЛАНО 2026-09-07)
│   │   │   ├── admin.ts                # 8.1: listUsers / setUserRole / getAuditLog (вкладка «Доступ»)
│   │   │   ├── subscription.ts         # 5 функций §2.10: подписка/тарифы/subscribe/cancel/resume (6.2 СДЕЛАНО)
│   │   │   └── export.ts
│   │   │
│   │   ├── stores/
│   │   │   ├── auth-store.ts           # Zustand: user, session (0.6: updateProfile/changePassword; 7.1: deleteAccount)
│   │   │   ├── synthesis-store.ts      # Zustand: текущий синтез, разделы, элементы
│   │   │   ├── generation-store.ts     # Zustand: состояние генерации, стриминг
│   │   │   ├── pool-store.ts           # Zustand: Unified Concept Pool (беседа 1.5b; 7.1: attachSynthesisId — файловая → каталожная после авто-импорта)
│   │   │   └── ui-store.ts            # Zustand: модалки, sidebar, theme
│   │   │
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts         # WebSocket с reconnect, типизированные сообщения
│   │   │   ├── useStreamingGeneration.ts  # Подписка на стриминг генерации
│   │   │   ├── useEnrichmentStream.ts  # Канал обогащений/обоснований: свой WS,
│   │   │   │                           # REST-запуск, enrichment_delta/done (5.4)
│   │   │   ├── useTransformStream.ts   # Канал трансформаций graph↔theses: свой WS,
│   │   │   │                           # REST-запуск, stream_delta transform:*/done (5.5)
│   │   │   ├── useEditPlan.ts          # Состояние плана редактирования
│   │   │   └── useGraphData.ts         # Загрузка и подготовка данных графа
│   │   │
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── ResetPasswordPage.tsx   # 9.1: «/reset-password» (форма с адресом, ответ всегда один) и
│   │   │   │                           #  «/reset-password/:token» (новый пароль → /login с пояснением)
│   │   │   ├── VerifyEmailPage.tsx     # 9.1: «/verify-email/:token» — подтверждение, затем каталог
│   │   │   │                           #  (гостю — вход с пояснением); довод гасится один раз
│   │   │   ├── LandingPage.tsx         # 8.7: стартовая «/» для гостя — что это, живая
│   │   │   │                           #  витрина (GET /syntheses/public, 4 карточки), цены
│   │   │   │                           #  (PlansTable), крупная «Создать аккаунт»; вошедшего → /catalog
│   │   │   ├── CatalogPage.tsx         # Каталог (свои + публичные); 8.7: publicOnly — «/explore»
│   │   │   │                           #  (гостю; без «Мои», «Новый синтез» и LineageSearch);
│   │   │   │                           #  публичность карточки — один PATCH { visibility, флаги }
│   │   │   ├── CreateSynthesisPage.tsx  # Форма создания (НОВОЕ)
│   │   │   ├── SynthesisPage.tsx       # Просмотр синтеза; 8.7: режим просмотра — маршрут вне
│   │   │   │                           #  RequireAuth, полоса невладельца, гейты по effectiveFlags и
│   │   │   │                           #  смотрящему, WS/modes/lineage только вошедшему, 403 гостю → «приватна»
│   │   │   ├── ImportPage.tsx          # 4.3; 8.5: блок предложения родителя (LineageCandidateBlock:
│   │   │   │                           #  .callout.note, «Связать» вторым шагом / «Пропустить»)
│   │   │   ├── BillingPage.tsx         # 6.2 СДЕЛАНО: секции API-ключ / баланс (Stripe Elements или dev-режим) / подписка / история использования / транзакции
│   │   │   ├── ProfilePage.tsx         # Профиль: displayName + смена пароля (A3, беседа 0.6); 7.1: + удаление аккаунта (DELETE /auth/me)
│   │   │   └── AdminPromptsPage.tsx    # 6.2 СДЕЛАНО: вкладки «Шаблоны» (дерево, редактор, плейсхолдеры, предпросмотр, версии/diff/откат) и «Конфиги» (JSON-редактор); под RequireAdmin; 7.1: + вкладка «Каталоги» (типы категорий/связей, правка и удаление пользовательских); 8.1: + вкладка «Доступ» (поиск пользователей, роль с подтверждением, последние 50 строк admin_audit)
│   │   │
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Header.tsx              # 8.7: гостю «Войти · Регистрация», бренд → «/», выход → «/»
│   │   │   │   │                           # 9.1: полоса «Адрес не подтверждён» + «Отправить письмо ещё раз»
│   │   │   │   │                           #  (классы полосы 8.7; только при emailVerified === false)
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── Layout.tsx              # 8.7: общий каркас гостя и вошедшего; меню/бургер — только вошедшему;
│   │   │   │                               #  RequireAuth стоит на страницах, не на каркасе (гость → «/» со state.from)
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
│   │   │   │   │                           # 9.2: карандаш у <h4> незапертых подразделов и форма
│   │   │   │   │                           # правки разметки — в строке HTML, на месте подраздела
│   │   │   │   ├── TableOfContents.tsx     # Оглавление с якорями
│   │   │   │   └── DocumentFooter.tsx      # Футер (стоимость, участники); 8.6: строка стоимости
│   │   │   │                               #  только при определённых totalCostUsd/токенах (гостю их нет)
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
│   │   │   ├── edit/                       # Шесть верхних файлов — беседа 2.3 (ФАКТ):
│   │   │   │                               # плюс client/api/plans.ts и
│   │   │   │                               # client/hooks/useEditPlan.ts (zustand-store
│   │   │   │                               # внутри хука); CSS .edit-*/.cascade-* —
│   │   │   │                               # в globals.css; ElementEditor…VersionHistory —
│   │   │   │                               # 5.2 (СДЕЛАНО 2026-09-04), Characteristic/
│   │   │   │                               # Enrichment/Taxonomy/EdgeEditor — 5.4
│   │   │   │                               # (СДЕЛАНО 2026-09-05), Transform* — 5.5
│   │   │   │                               # (СДЕЛАНО 2026-09-06)
│   │   │   │   ├── EditModal.tsx           # Модальное окно редактирования
│   │   │   │   ├── EditSectionCard.tsx     # Карточка раздела (перегенерация/удаление)
│   │   │   │   ├── SubsectionRegenPanel.tsx # Перегенерация подраздела
│   │   │   │   ├── EditPlanPanel.tsx       # Визуализация плана с каскадом
│   │   │   │   ├── CascadePanel.tsx        # Панель каскадных зависимостей
│   │   │   │   ├── AddSectionPanel.tsx     # Панель добавления разделов
│   │   │   │   ├── ElementEditor.tsx       # Inline-редактирование элементов (НОВОЕ)
│   │   │   │   ├── CategoryEditor.tsx      # Поля категории + предпросмотр строки (5.2)
│   │   │   │   ├── ThesisEditor.tsx        # Поля тезиса (5.2)
│   │   │   │   ├── GlossaryTermEditor.tsx  # Термин + столбцы по synth_level (5.2)
│   │   │   │   ├── VersionHistory.tsx      # Версии элемента, diff, откат (5.2)
│   │   │   │   ├── TransformHistory.tsx    # История трансформаций + откат (5.5)
│   │   │   │   ├── EdgeEditor.tsx          # Поля связи: тип (TaxonomySelector), направление,
│   │   │   │   │                           # шесть слайдеров; kind='edge' ElementEditor (5.4)
│   │   │   │   ├── EdgeCreateForm.tsx      # 7.1: создание связи поверх графа — select'ы концов +
│   │   │   │   │                           # EdgeEditor → POST /syntheses/:id/edges («+ Связь» GraphModal/NodePanel)
│   │   │   │   ├── CharacteristicSlider.tsx # Слайдер характеристики + «?» → обоснование под
│   │   │   │   │                           # слайдером; CharacteristicSliderGroup (5.4)
│   │   │   │   ├── EnrichmentPanel.tsx     # Панель обогащения: запуск по типу, стрим, история (5.4)
│   │   │   │   ├── TaxonomySelector.tsx    # Комбобокс каталога + normalize + создание типа,
│   │   │   │   │                           # индикатор «из каталога / свободный текст» (5.4)
│   │   │   │   └── TransformPanel.tsx      # Кнопки graph→theses / theses→graph, превью, история
│   │   │   │                               # (5.5; двухшаговое подтверждение, живой предпросмотр)
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
│   │   │   ├── billing/
│   │   │   │   └── PlansTable.tsx          # 8.7: таблица тарифов — вынос из BillingPage 6.2, одна на
│   │   │   │                               #  /billing и LandingPage; столбец действия — слот renderAction
│   │   │   ├── catalog/
│   │   │   │   ├── SynthesisList.tsx       # Список карточек синтезов (8.4: проброс actions; 8.7: visibility)
│   │   │   │   ├── SynthesisCard.tsx       # Карточка синтеза в каталоге; 8.4: строка действий
│   │   │   │   │                           # владельца (Переименовать по месту · Дублировать · Удалить
│   │   │   │   │                           # вторым шагом с числом потомков); 8.7: «Публичность» вместо
│   │   │   │   │                           # «Опубликовать» → VisibilityControl; бейджи ступени и автора
│   │   │   │   ├── VisibilityControl.tsx   # 8.7: три ступени + галочки по ступеням (витрина — только
│   │   │   │   │                           #  авторство, остальные спрятаны со строкой-пояснением), флаги
│   │   │   │   │                           #  из GET /:id, ОДИН PATCH по «Сохранить», подпись audienceText
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
│   │       ├── concept-file.ts             # Парсинг концепт-файлов пула (1.5b, клиентские порты;
│   │       │                               # 3.2: += catalogPreviewToPoolEntry, genealogy заполняется)
│   │       ├── visibility-text.ts          # 8.7: тексты ступеней/галочек, flagsShownFor,
│   │       │                               #  audienceText (через effectiveFlags shared), visibilityBadge
│   │       ├── capsule-html.ts             # 8.4: пересборка HTML капсулы из текста
│   │       │                               # (обёртка секции и <h4> сохраняются, содержимое → <p>)
│   │       ├── subsection-edit.ts          # 9.2: состояние правки подраздела и тексты отказов
│   │       │                               # (клиент разметку НЕ собирает и НЕ чистит — сервер)
│   │       ├── genealogy.ts                # Порты генеалогии (3.2): reconstructGenealogy,
│   │       │                               # restoreCapsulesFromHTML, checkGenealogyOverlaps,
│   │       │                               # resolveConceptName (FIX [а-яё]), lineageNodeToGenealogy
│   │       ├── graph-physics.ts            # tick(), warmup() (tick(), warmup())
│   │       ├── graph-geometry.ts           # nodeGeometry3D, mkSprite (nodeGeometry3D(), mkSprite())
│   │       ├── format.ts                  # Форматирование чисел, дат (создан 6.2: fmtUsd/fmtMoney/fmtInt/fmtDateShort/fmtDateLong/toIsoDate)
│   │       ├── text-diff.ts               # Построчный LCS-diff со свёрткой контекста (6.2; версии шаблонов и конфигов)
│   │       ├── template-placeholders.ts   # {{плейсхолдеры}} шаблонов: PLACEHOLDER_RE ≡ реестру, SAMPLE_VALUES предпросмотра (6.2)
│   │       └── stripe.ts                  # Загрузчик Stripe.js без npm + VITE_STRIPE_PUBLISHABLE_KEY + appearance (6.2)
│   │
│   └── public/
│       └── favicon.svg
│
├── scripts/                            # ПЕРЕЛОЖЕНО 2026-09-15: было 73 файла вповалку,
│   │                                   # из них 50 — одноразовые патчи доков
│   ├── seed/                           # наполнение базы (все — npm run seed:*)
│   │   ├── seed-prompts.ts             # prompt_templates из исходника
│   │   ├── seed-configs.ts             # synthesis_configs из исходника
│   │   ├── seed-taxonomy.ts            # каталоги типов (18 категорий + 29 связей)
│   │   ├── seed-plans.ts               # 8.3: subscription_plans из config/plans.ts;
│   │   │                               # stripe_price_id из STRIPE_PRICE_*, без них
│   │   │                               # is_active=false + громкое предупреждение
│   │   ├── bootstrap-admin.ts          # 8.1: первый администратор (npm run seed:admin);
│   │   │                               # пароль из BOOTSTRAP_ADMIN_PASSWORD, заслон
│   │   │                               # «другой админ уже есть»
│   │   └── stripe-create-prices.ts     # 8.3: Product+Price в Stripe ключом владельца,
│   │                                   # идемпотентно по lookup_key philosynth_<name>
│   ├── checks/                         # проверки, идущие без браузера
│   │   ├── check-dotfiles.mjs          # 8.7: сторож правок .env.example/.gitignore
│   │   │                               # 9.1: + восемь переменных почты и MAIL_TRANSPORT стенда
│   │   ├── check-map-04.py             # сходимость карты 04 с фактом
│   │   └── css-parity-audit.py         # единство globals.css с блоком <style> исходника
│   ├── extract/                        # извлечение из одностраничника
│   │   ├── extract-by-name.py          # фрагменты ПО ИМЕНАМ из 04-code-reuse-map;
│   │   │                               # спецификации — docs/fragments-for-conversations/*.spec
│   │   ├── extract-seed-data.mjs       # vm-извлечение конфигов и промптов
│   │   ├── extract-section-templates.mjs
│   │   └── extract-export-assets.mjs
│   ├── patches/                        # 50 идемпотентных патчей доков по итогам бесед
│   │   ├── patch-docs-*.py             # запускаются ИЗ КОРНЯ репозитория;
│   │   │                               # осторожно с повторным прогоном старого патча:
│   │   │                               # доки с тех пор менялись, и якорь может совпасть
│   │   │                               # снова — тогда текст вставится вторично
│   │   └── verify-patch-regression.py
│   ├── package.json                    # Маркер type=module
│   └── tsconfig.json                   # Типочек scripts/seed/*.ts + tests/*.ts|*.mts
│
├── tools/                              # 8.2: оснастка разработчика (не продукт, не тесты)
│   ├── stripe-mock.mjs                 # мок Stripe REST — модуль (createStripeMock) и процесс;
│   │                                   # вынесен из test-61, + /v1/products и /v1/prices под 8.3
│   ├── stripe-emit.mjs                 # отправщик webhook-событий invoice.paid /
│   │                                   # customer.subscription.updated|deleted (подпись при
│   │                                   # непустом STRIPE_WEBHOOK_SECRET)
│   └── dev-billing.sh                  # стенд: .env.local → мок → сервер :3000 → vite :5199;
│                                       # заслон sk_live_, --stop / --status, created/skip/fail;
│                                       # 8.3: зовёт npm run seed:plans (STRIPE_PRICE_* из .env.local),
│                                       # повтор → skip по отчёту посева (created=0, updated=0)
│
└── tests/                              # ВСЕ тесты бесед; запуск из корня репо
    ├── smoke-*.mjs / smoke-*.mts       # vm-смоуки байтовой сверки порта с исходником
    ├── test-XX-*.mjs                   # API- и браузерные тесты запросов бесед (puppeteer);
    │                                   # test-61/62/71 берут мок Stripe из tools/stripe-mock.mjs (8.2);
    │                                   # test-82/83 — против настоящего стенда dev-billing.sh; с 8.3
    │                                   # план в test-82 — из посева (starter), в test-62 — starter62
    │                                   # (не сносить посеянный starter);
    │                                   # test-84 — браузер против сервера :3000 + vite :5199, мок
    │                                   # Claude :3884 держит стрим по маркеру SLOW84 (слот занят → 409);
    │                                   # test-85 — фикстуры из живого файла одностраничника (T85_FILE),
    │                                   # без мока Claude; smoke-85 — чистые ядра + живая БД
    │                                   # test-91 — почта БЕЗ почтового узла: фаза console (письма
    │                                   # читаются из вывода сервера) и фаза smtp против мока SMTP
    │                                   # внутри харнесса (net: 550/451/250 по адресату), отдельная
    │                                   # пустая БД philosynth_t91, Chrome 131 из ~/.cache/puppeteer,
    │                                   # puppeteer-core — из node_modules либо PUPPETEER_CORE
    │                                   # test-92 — «живая концепция» из test-92-fixture.mjs через
    │                                   # экспорт 4.2 → импорт 4.3 (таблицы наполняют парсеры), мок
    │                                   # Claude :3892 (SLOW92 держит слот), Chrome 131; рабочая БД
    │                                   # test-92-live-file — та же правка на ЖИВОМ файле одностраничника
    │                                   # (T92_FILE; без файла — пропуск): все незапертые подразделы
    │                                   # в ДВУХ происхождениях — импорт файла и генерация службой
    │                                   # (мок Claude :3893 отдаёт разделы файла как ответ модели)
    │                                   # test-101 (10.1) — контракт рекомендаций: сиды на базе с
    │                                   # прежними версиями, генерация критики, разбор, сторож,
    │                                   # раунд, ретрофит на ЖИВОМ файле (T101_FILE; без файла —
    │                                   # пропуск), края; мок Claude :3911; запуск через tsx;
    │                                   # smoke-101-request1 — чистые функции + Registry
    │                                   # test-file-genealogy — дерево импортированного файла: запись,
    │                                   # подшивка в getAncestors, правило приоритета, SET NULL,
    │                                   # экспорт и roundtrip; живая БД, живой файл (TFG_FILE;
    │                                   # без файла — пропуск), запуск через tsx
    │                                   # test-import-modes — режимы в файле одностраничника: разметка
    │                                   # buildModesExportSection дословно, импорт и два круга экспорт →
    │                                   # импорт побайтно; живой файл (TIM_FILE), запуск через tsx
    │                                   # modes-fixture — общая фикстура блока режимов (разметка
    │                                   # buildModesExportSection дословно) для двух тестов выше/ниже
    │                                   # test-modes-readonly — режимы невладельцу только для просмотра:
    │                                   # владелец / чужой на 'full' / витрина / гость, run и DELETE
    │                                   # чужим → 403; против ПОДНЯТОГО стенда (dev-billing.sh), без
    │                                   # стенда — пропуск; CHROME_PATH, живой файл (TMR_FILE)
    ├── test-*-0.3b.ts                  # Регрессионные смоуки таксономии
    └── package.json                    # Маркер type=module
```

Workspace-регрессия `audit.mts` и `integration-check.mts` — в server/
(npm-скрипты пакета + tsconfig.checks.json), не в tests/.
