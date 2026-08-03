# Беседа 0.1 — итоги и контекст для следующих бесед

> Зафиксировано по завершении беседы 0.1 (ревизия доков 2026-07-22).
> Полный архив: philosynth-service-skeleton.zip. Ниже — какие файлы из него
> прикладывать в какую беседу (по правилу §1.4 протокола: только прямые
> зависимости).

## Универсальный минимум любой серверной беседы

- `server/db/schema.ts` — 28 таблиц, единственный источник структуры БД
- `server/db/index.ts` — db/sql/closeDb (нужен всем сервисам)
- `server/env.ts` — типизированные env (нужен при касании конфигурации)
- `server/package.json`, `packages/shared/package.json`,
  `tsconfig.base.json` + tsconfig'и — при любых новых файлах/зависимостях
  (иначе беседа пересоздаст workspace по-своему)

## В завершение КАЖДОЙ беседы (регрессионные инструменты)

- `server/audit.mts` (`npm run audit`) — schema↔types↔constants
- `server/integration-check.mts` (`npm run check:integration`) —
  импорты/экспорты/async; расширять списком новых модулей беседы

## Помодульно

### Беседа 0.2 (Auth + Hono + WS + rate-limiter)
- `server/db/schema.ts` (users, sessions)
- `shared/types/ws-messages.ts` (полный протокол §3 уже типизирован)
- `shared/types/billing.ts` (ApiKeyInfo для GET /me не нужен, но роуты auth
  используют коды ошибок — см. 03-spec §4.3)
- `server/index.ts` + `server/env.ts` + `server/db/index.ts` —
  СУЩЕСТВУЮЩИЙ каркас (health-check, graceful shutdown с
  closeIdleConnections); расширять, не пересоздавать

### Беседа 0.3 (seed-prompts / seed-configs / prompt-registry)
- `server/db/schema.ts` (prompt_templates, synthesis_configs)
- `server/db/index.ts`
- `shared/types/prompts.ts` (PromptTemplate, SynthesisConfigKey —
  union уже включает все v11-ключи: parent_deps.*, md_by_card, sd_by_card,
  mode_deps)
- `shared/constants/labels.ts`, `shared/constants/methods.ts`
- `shared/utils/cardinality.ts` (ветки шаблонов по кардинальности)

### Беседа 0.3b (seed-taxonomy / element-taxonomy)
- `server/db/schema.ts` (category_type_catalog, relationship_type_catalog)
- `server/db/index.ts`
- `shared/types/elements.ts` (CategoryType, RelationshipType, TypeMatch —
  уже добавлены)

### Беседа 0.4 (каркас клиента)
- `packages/shared/types/*` (все 11 — для api/client.ts и stores)
- `packages/shared/constants/*` (philosophers, labels, section-labels —
  для будущих пикеров)
- `client/package.json`, `client/tsconfig.json` — существующие заготовки

### Беседа 1.1 (synthesis-engine)
- `server/db/schema.ts`, `server/db/index.ts`
- `shared/types/synthesis.ts`, `shared/types/generation.ts`
- `shared/constants/ctx-keys.ts` (CtxKey), `shared/constants/section-labels.ts`
- `shared/utils/cardinality.ts`
- из 0.3: `server/services/prompt-registry.ts`

### Беседа 1.2 (prompt-builder / section-defs-builder)
- всё из 1.1 + `shared/constants/labels.ts`, `shared/utils/version.ts`

### Беседа 1.3 (context-builder / context-extractor)
- `server/utils/text.ts` — УЖЕ СОЗДАН (truncateText дословно; tableToText
  через структурный TableLikeElement — готов к linkedom). Не пересоздавать.
- `shared/constants/ctx-keys.ts`, `shared/types/generation.ts`

### Беседа 4.2 (export)
- `shared/utils/transliterate.ts`, `shared/utils/version.ts`
  (formatVersionFilename), `shared/constants/methods.ts` (все 4 *_CODE
  сверены с исходником: DEPTH — цифры, ORDER — заглавные),
  `shared/constants/phil-filename.ts`, `shared/utils/escape.ts`
  (+ знание: в исходнике есть урезанная локальная esc [~16422])

## Открытые TODO после 0.1

1. `getDocFilename` [~17478] — НЕ портирован (по плану — беседа 4.2);
   все словари-коды для него готовы и сверены.
2. `client/` — пустая заготовка (package.json + tsconfig, src отсутствует);
   `npm run build -w client` упадёт до беседы 0.4 — ожидаемо.
3. `server/index.ts` — только health-check; CORS/JSON middleware — 0.2.
4. drizzle-kit push вечно пересоздаёт idx_syntheses_title_trgm
   (не интроспектирует gin_trgm_ops) — рабочий путь: `npm run db:migrate`.
5. Source-first exports shared (.ts) требуют Node ≥22.18 (type stripping)
   и только erasable-синтаксиса в shared (без enum/namespace).
   Альтернатива (dist-based exports) отложена сознательно.
6. `StepResult.costUsd` — унификация с API §4.2; в исходнике поле шага
   называется `cost` (задокументированное отклонение, править при порте
   executeEditPlan, если нужна дословность).
7. Тип `SectionContextQuality` есть; функция getSectionContextQuality —
   беседа 1.3 (01-arch §4.15 п.3).
8. Дубль в 07-conversation-protocol.md: блок «Беседа 1.4b Pause/Resume»
   присутствует дважды (~649 и ~701) с разницей только в ссылке на ТЗ
   (01 §4.12 vs docs/tz/) — редакторская правка протокола.

---

# Беседа 0.2 — итоги и контекст для следующих бесед

> Зафиксировано по завершении беседы 0.2 (Auth + Hono-каркас + WebSocket).

## Созданные/изменённые файлы

- `server/middleware/auth.ts` — сессии Lucia-модели (токен в cookie, SHA-256
  в sessions.id, TTL 30 дн., скользящее продление <15 дн.), bcrypt (bcryptjs),
  requireAuth; типизированный `AuthEnv` для Hono
- `server/middleware/admin-only.ts` — requireAdmin (отдельный файл по 05)
- `server/middleware/rate-limiter.ts` — Redis fixed window
  (rate_limit:{scope}:{id}:{window}), 429 + details.retryAfter + Retry-After,
  fail-open при недоступном Redis
- `server/routes/auth.ts` — register/login/logout/me по 03-spec §2.1
- `server/ws/handler.ts` — auth ДО upgrade (?token= или cookie),
  parseClientMessage по union WsClientMessage, ping→pong; типы операций
  распознаются, но исполнение — заглушки до 1.4+
- `server/ws/connection-manager.ts` — Map<userId, Set<WSContext>>,
  heartbeat 30 с, лимит 60 сообщ./мин на соединение (§3.4), sendToUser
- `server/redis.ts` — общий ioredis-клиент (lazyConnect,
  enableOfflineQueue=false → мгновенный reject для fail-open)
- `server/index.ts` — CORS(credentials)+формат ошибок {error,code},
  health ДО rate-limiter, монтирование /api/v1/auth, injectWebSocket,
  shutdown += closeAll WS + closeRedis
- `server/env.ts` += rateLimit.httpRequestsPerMinute
  (RATE_LIMIT_HTTP_PER_MINUTE=60); `.env.example` восстановлен
- `server/integration-check.mts` расширен: секции 2b/4b/5b
  (7 модулей 0.2, 5 кросс-слойных проверок, auth-цикл на живой БД)

## Помодульно: что прикладывать в следующие беседы

### Беседа 0.3 (seed + prompt-registry)
- += `server/redis.ts` (кэш prompt_cache:*/config_cache:* — 01-arch §4.1),
  `server/middleware/auth.ts` + `admin-only.ts` (админ-роуты §2.9),
  `server/index.ts` (монтирование новых роутов)

### Любая серверная беседа с роутами (1.x+)
- `server/index.ts`, `server/middleware/auth.ts` (requireAuth, AuthEnv)

### Беседа 1.4 (streaming/generation)
- `server/ws/handler.ts` (диспетчеризация — заменять заглушки),
  `server/ws/connection-manager.ts` (sendToUser для дельт),
  `server/redis.ts` (stream_state:*; создать ws/stream-state.ts)

### Беседа 6.1 (billing)
- `server/middleware/auth.ts`, `server/middleware/rate-limiter.ts`
  (создать middleware/billing-check.ts)

## Знания/грабли, добытые в 0.2

1. **drizzle-orm 0.44 оборачивает ошибки в DrizzleQueryError**: pg-код —
   в `err.cause.code`, не в `err.code`. Все будущие перехваты
   (23505 и др.) проверять оба уровня (готовый паттерн — routes/auth.ts).
2. **@hono/node-server откачен 2.x → ^1.19.11**: @hono/node-ws@1.3.1
   peer-несовместим с v2. Не поднимать до выхода node-ws под v2.
3. Формы 401/409, не имеющие кодов в §4.3: неверные креды →
   401 AUTH_REQUIRED (единый ответ, анти-enumeration), занятый email →
   409 VALIDATION_ERROR + details.
4. Fixed window допускает бёрст до 2× на стыке окон — осознанный компромисс.

## Открытые TODO после 0.2

1. WS-операции (subscribe_generation, start_regen, …) — заглушки → 1.4+;
   reconnect §3.3 (?resume= + stream_state) → 1.4.
2. `middleware/billing-check.ts` — Фаза 6 (беседа 6.1).
3. **Дыра в докax**: требования A2 «сброс пароля» и A3 «смена пароля»
   (03-spec §1.1, MVP) не имеют эндпоинтов в §2.1 — нужна правка
   спецификации (POST /auth/password-reset и т.п.), реализация отложена
   до правки.
4. OAuth (A6) — Фаза 3.
5. Горизонтальное масштабирование WS (Redis pub/sub) — Фаза 3
   (connection-manager одиночного процесса это учитывает комментарием).

---

# Беседа 0.3 — итоги и контекст для следующих бесед

> Зафиксировано по завершении беседы 0.3 (seed-prompts / seed-configs /
> prompt-registry). Все проверки протокола пройдены; audit и
> check:integration расширены и зелёные.

## Созданные/изменённые файлы

- `scripts/extract-seed-data.mjs` — генератор seed-данных: vm-исполнение
  фрагментов (docs/fragments-for-conversations/0.3-*.js) и исходника со
  стабами словоформ (participantsForPrompt → `{{participants}}`,
  participantWord → `{{participant_word}}`, participantWordSg,
  eachParticipant, mw → `{{min_words}}`) — тексты шаблонов байт-в-байт
  как в исходнике; при обновлении philosynth.html — перегенерировать
  (`npm run extract:seed`) и просмотреть diff
- `server/config/*.ts` — 12 СГЕНЕРИРОВАННЫХ модулей (не править руками):
  context-deps, substitution-map, compat-matrix (+COMPAT_SEC_LABELS),
  intra-deps, subsection-ctx-keys, topology-roles, fragment-share
  (+CONTEXT_BUDGET), extra-types (+порт buildExtraTypesBlock),
  parent-deps (+PARENT_CONTEXT_SCHEMA_ID/VERSION), cardinality-prompts
  (MD/SD_BY_CARD), mode-deps, prompt-templates (107 шаблонов)
- `scripts/seed-prompts.ts`, `scripts/seed-configs.ts` — идемпотентные
  (created/updated/skip/fail; новая версия при изменении, история
  сохраняется); `npm run seed:prompts` / `seed:configs`
- `server/services/prompt-registry.ts` — getTemplate / renderTemplate
  (strict по умолчанию; TemplateRenderError при незакрытых
  плейсхолдерах) / getConfig / invalidateCache / listVersions /
  listConfigVersions / activateVersion / warmCache;
  кэш prompt_cache:* / config_cache:* (без TTL), fail-open к БД;
  RegistryNotFoundError (code=NOT_FOUND)
- `scripts/package.json` (`type: module` — без него NodeNext даёт
  CJS/ESM-двоение типов drizzle-orm), `scripts/tsconfig.json`
  (`npm run typecheck:scripts`)
- `packages/shared/constants/ctx-keys.ts` — ДОПОЛНЕН: `critique:full`,
  `history:full` (существуют в исходнике как case-ветки
  extractContextFragment [~8223, ~8237] и заменитель в SUBSTITUTION_MAP,
  но отсутствовали в CTX_LABELS исходника; теперь ALL_CTX_KEYS = 36 и
  покрывает все ключи конфигов)
- `server/integration-check.mts` — секции 2c (13 модулей 0.3),
  4c (совместимости: SeedPromptTemplate → $inferInsert, v11-ключи ∈
  SynthesisConfigKey, listVersions → PromptVersion[]), 5c (рантайм на
  живой БД+Redis: getTemplate/render/getConfig/NOT_FOUND/инвалидация;
  ТРЕБУЕТ прогнанного seed:prompts)

## Схема ключей Prompt Registry (фактическая)

- `system` — ядро buildSYS с `{{lang_instruction}}` /
  `{{participants_note}}` / `{{output_mode_instruction}}`; подшаблоны:
  `system.lang_instruction` (`{{lang}}`), `system.participants_note`
  (`{{philosophers}}`), `system.output_mode.{full|subsection|mode}`.
  Сборка — prompt-builder (беседа 1.2): условия в коде, текст в Registry
- `method.{метод}.{sum|graph|topology|glossary|theses|dialogue|critique}`
  (42), `level.{уровень}.{18 аспектов}` (54), `mode.{adversarial|
  translator|timeslice}` (`{{param}}`, `{{context}}`),
  `quality_reinforcement` (`{{min_words}}`), `stop_signal`
- Кардинальность — НЕ в ключах: p-словоформы = плейсхолдеры, рендерер
  вычисляет через shared/utils/cardinality («кардинальные фрагменты
  подставляются рендерером», 01-arch §4.1); `{{method_label}}` в
  шаблонах НЕ используется — метка метода вставляется в baseCtx (1.2)
- synthesis_configs: 26 ключей (23 из списка беседы + compat_sec_labels,
  context_budget, extra_types)

## Помодульно: что прикладывать в следующие беседы

### Беседа 0.3b
- без изменений плана 0.1; опционально `server/config/extra-types.ts`
  (метод-зависимые типы пересекаются с таксономией)

### Беседа 1.1 (synthesis-engine)
- += `server/services/prompt-registry.ts` (getConfig для
  context_deps.* / substitution_map* / compat_matrix), `server/redis.ts`;
  перед запуском — `npm run seed:prompts && npm run seed:configs`
  (check:integration 5c требует посеянной БД)

### Беседа 1.2 (prompt-builder / section-defs-builder)
- += `server/services/prompt-registry.ts` + раздел «Схема ключей» выше
  (сборка system из 4 частей; словарь плейсхолдеров);
  сеять `subsection_map` (SUBSECTION_MAP_BASE/GLOSSARY/CRITIQUE_* +
  SUBSECTION_SUM_PORTRAIT [~9438] — канонические ключи, резолвер по
  кардинальности) — отложено из 0.3 намеренно

### Беседа 1.3 (context-builder)
- += конфиги через getConfig (fragment_share, context_budget,
  substitution_map*); ALL_CTX_KEYS теперь покрывает critique:full /
  history:full — case-ветки extract* обязаны их реализовать

### Беседа 4.1 (mode-service)
- шаблоны `mode.*` и конфиг `mode_deps` уже посеяны

## Знания/грабли, добытые в 0.3

1. **jsonb НЕ сохраняет порядок ключей объекта** (сортировка длина →
   побайтово): наивный JSON.stringify-компаратор давал ложные updated
   на каждом пересеве. Фикс — canonical() с рекурсивной сортировкой
   ключей (scripts/seed-configs.ts). Грозит ЛЮБЫМ round-trip-сравнениям
   jsonb: element_versions, paused_state, snapshots трансформаций.
2. postgres.js пишет в pg-лог `execute <unnamed>: select …`, не
   `statement:` (extended protocol) — учитывать в лог-детекторах.
3. `tsc --noEmit <файл>` игнорирует tsconfig — проверять только через
   `-p`/`-b`; check:integration запускать `npm run … -w server`.
4. Исходник: FRAGMENT_SHARE содержит дубликат ключа `dialogue:synthesis`
   (0.17 → 0.3, действует last-win 0.3); `${word}ми` при
   word='философов' даёт «философовми» — quirks оригинала, порт
   сохраняет дословно (править — осознанно и в обоих артефактах).

## Открытые TODO после 0.3

1. Админ-роуты §2.9 (`routes/prompts.ts`: список/версии/создание/
   активация шаблонов, GET/PUT configs) — Фаза 2 (P1–P5); тогда же
   createVersion в реестре (сейчас версия создаётся вставкой) и
   activateConfigVersion.
2. `warmCache()` реестра не вызывается в `server/index.ts` — подключить
   при монтировании роутов (01-arch §4.1 «при старте сервера»).
3. Шаблоны РАЗДЕЛОВ (тела из buildSectionDefs) не сеются — их
   структуру определяет section-defs-builder (беседа 1.2); STOP_SIGNAL
   посеян отдельным шаблоном (в исходнике добавляется один раз в конец
   итогового задания, не в method/level-фрагменты).
4. `subsection_map` в synthesis_configs — сеет беседа 1.2 (см. выше).

# ═══ Итоги беседы 0.3b (seed-taxonomy / element-taxonomy) ═══

## Созданные/изменённые файлы

- `scripts/seed-taxonomy.ts` — NEW: 18 типов категорий + 29 типов связей,
  is_system=true; идемпотентность БЕЗ версионирования (key UNIQUE):
  created / updated-на-месте (только системные) / skip; пользовательские
  записи не трогаются, коллизия ключа → fail. `npm run seed:taxonomy`.
- `server/services/element-taxonomy.ts` — NEW: getCategoryTypes /
  getRelationshipTypes (Redis `taxonomy_cache:*`, fail-open по паттерну
  registry), normalizeType(text, kind) → { match, suggestions } (03-spec
  §2.13), createCustomType (+TaxonomyValidationError, code=VALIDATION_ERROR),
  invalidateTaxonomyCache. Экспортирует типы TaxonomyKind, NormalizeResult.
- `scripts/test-normalize-0.3b.ts` — NEW: регрессионный смоук normalizeType
  (кейсы аргументом: dialectical / causal / unknown).
- `scripts/test-custom-type-0.3b.ts` — NEW: регрессионный смоук
  createCustomType, 13 проверок, самоочищающийся (нужен работающий Redis).
- `server/integration-check.mts` — расширен секциями 2d (экспорты), 4d
  (6 совместимостей типов), 5d (живая БД+Redis: counts, normalizeType,
  валидация, кэш-инвалидация).
- `package.json` — добавлен скрипт `seed:taxonomy`.

## Помодульно: что прикладывать в следующие беседы

### Беседа 5.3 (Enrichment, бэкенд) — по 07 требует element-taxonomy.ts
- `server/services/element-taxonomy.ts`

### Беседа 5.4 (Таксономия UI, клиент) — по 07
- `server/services/element-taxonomy.ts` (контракты функций)
- `packages/shared/types/elements.ts` (CategoryType, RelationshipType,
  TypeMatch)

### Беседа 5.5 (Representation Transformer) — по 07 («нормализация типов
### через element-taxonomy»)
- `server/services/element-taxonomy.ts`

### Прочее
- Сидинг перед интеграционной проверкой: `seed:prompts` + `seed:configs` +
  `seed:taxonomy` (секции 5c/5d проверяют посеянность и подсказывают).

## Знания/грабли, добытые в 0.3b

1. **ioredis: connect() сразу после quit() гонится со статусом сокета**
   («Redis is already connecting/connected») — при этом enableOfflineQueue=false
   превращает гонку в тихий fail-open и проверки кэша молча пропускаются.
   В integration-check секции 5c/5d делят ОДНО соединение (закрытие только
   в конце 5d), redisUp = status==="ready" || connectRedis().
2. Прямые redis-команды в тестовых скриптах требуют явного connectRedis()
   (lazyConnect): сервисные функции этого не обнаруживают — они fail-open.
3. Имя normalizeType существует ДВАЖДЫ: shared/utils/normalize.ts
   (нормализация имён/типов строк из исходника) и
   services/element-taxonomy.ts (маппинг на каталог). При совместном
   импорте — алиасить (в integration-check: txNormalize).
4. Русские name_ru связей согласованы с фиксированным списком промптов
   исходника [~10909]: causal=«Каузальная», complementary=«Дополнительность»,
   foundational=«Основание», definitional=«Определяющая»; варианты
   («причинно-следственная» и т.п.) — в RU_ALIASES внутри
   element-taxonomy.ts (в схеме БД колонки aliases НЕТ — осознанно in-code).
5. `_buildExtraTypesBlock` НЕ дублировался: уже портирован в
   server/config/extra-types.ts (беседа 0.3, конфиг extra_types) —
   беседа 0.3b допускала оба места, выбран единственный источник истины.

## Открытые TODO после 0.3b

1. **`server/routes/taxonomy.ts` (§2.13) — ДЫРА ДОКОВ**: числится в карте
   04 (строка 253), но НИ ОДНА беседа протокола 07 его не создаёт
   (беседа 5.4 — только клиент). Естественное место — беседа 5.3 (там
   создаётся routes/enrichment.ts; taxonomy-роуты — тонкие обёртки над
   готовым сервисом). Дополнить 07 при следующей правке доков.
2. Прогрев кэша таксономии при старте сервера не подключён (как и
   warmCache реестра — общий TODO из 0.3, закрыть одним заходом при
   монтировании роутов).
3. Админ-редактирование каталога (update/delete типов) не специфицировано
   (§2.13 — только чтение/normalize/custom-type); инвалидация кэша готова.
4. `client/components/edit/TaxonomySelector.tsx` — беседа 5.4.

---

# Беседа 0.4 — итоги и контекст для следующих бесед

> Зафиксировано по завершении беседы 0.4 (каркас клиента). Все запросы
> протокола пройдены; typecheck/audit/check:integration зелёные.

## Созданные/изменённые файлы

- **`tsconfig.base.json` (корень) — ВОССТАНОВЛЕН**: отсутствовал в архиве
  проекта (на него ссылаются все 4 tsconfig); реконструирован по паттернам
  кода 0.1–0.3b (strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess,
  NodeNext, composite, verbatimModuleSyntax), валидирован `tsc -b --force`
  всех областей. НЕ ТЕРЯТЬ при упаковке архивов.
- `client/vite.config.ts` — React-плагин; dev-прокси `/api` и `/ws` (ws:true)
  → :3000 (сквозной WS-путь проверен: браузер→прокси→Hono, ping→pong)
- `client/index.html` — шрифты IBM Plex Mono/Sans + Playfair Display (CDN),
  `client/postcss.config.js`, `client/public/favicon.svg`
- `client/tailwind.config.ts` — 17 цветов + 3 шрифта ЧЕРЕЗ CSS-переменные
  (hex живут только в globals.css); `client/src/globals.css` — :root дословно
  из исходника [14–35] + алиас `--parchment: var(--off)`
- `client/src/api/client.ts` — fetch-обёртка: BASE /api/v1, credentials
  include, ApiError{code,status,details} (коды §4.3 + NETWORK_ERROR/
  BAD_RESPONSE), setUnauthorizedHandler (401 → сброс сессии)
- `client/src/stores/auth-store.ts` — Zustand: login (с дотяжкой полного
  профиля GET /auth/me; без cookie — fallback на усечённого user), register
  (register не выдаёт сессию → авто-login), logout, restore, clearError
- `client/src/hooks/useWebSocket.ts` — типизированный WS-хук
  (WsClientMessage/WsServerMessage), reconnect с нарастающей задержкой
  (0.5с…15с, max 8), keep-alive ping 25с (в лимите §3.4), pong гасится
  внутри; ?resume= (§3.3) — через опцию url, логика — беседа 1.4
- `client/src/App.tsx` — 8 маршрутов протокола + `/`→/catalog + 404;
  RequireAuth (ждёт restore, redirect с запоминанием from); restore() однократно
- `client/src/components/layout/{Layout,Header,Sidebar}.tsx` — шапка
  (вордмарк ◈, пользователь, Выйти), двойная линейка, sidebar: desktop-колонка
  ≥768px / mobile бургер+выдвижная панель с подложкой; «Промпты» только admin
- `client/src/pages/` — Login/Register (рабочие формы), Catalog,
  CreateSynthesis, Synthesis (:id отображается), Import, Billing,
  AdminPrompts, NotFound + служебный PageStub.tsx (удалять по мере наполнения)
- `client/package.json` — + react-router-dom ^7, postcss, autoprefixer
- `scripts/tsconfig.json` — include: ["*.ts"] (был перечень из 2 файлов —
  seed-taxonomy и тесты 0.3b НЕ типочекались; регресс закрыт wildcard'ом)
- корневой `package.json` — typecheck расширен на client
- `server/integration-check.mts` — секции 0.4: 2e (16 клиент-модулей
  рантайм-импортом — tsx транспилирует .tsx; main.tsx НЕ импортировать,
  тянет CSS), 4e (парсинг-совместимости: AuthUser client↔server,
  ApiErrorCode ⊇ §4.3 + серверные code:"X", маршруты App↔Sidebar↔протокол,
  BASE_URL↔монтирование, эндпоинты store↔routes/auth), 5e (async-цепочка
  без браузера: globalThis.fetch → mini-Hono app.request с реальными
  authRoutes и живой БД; 5e стоит ДО секции 5 — та закрывает пул)
- `test-04-request{2..7}.mjs`, `test-04-ws-smoke.mjs` (корень) —
  dev-регрессионные браузерные тесты (puppeteer-core НЕ в deps:
  `npm i --no-save puppeteer-core`; Chrome — .cache/puppeteer)

## Помодульно: что прикладывать в следующие беседы

### Любая клиентская беседа (1.5, 1.6, 1.7, 2.3, 2.4, 3.2, 5.2, 5.4, 6.2)
- `client/src/api/client.ts` (обёртка + ApiError), `client/src/stores/auth-store.ts`
- `client/src/App.tsx` (добавление маршрутов/страниц — расширять, не пересоздавать)
- `client/tailwind.config.ts` + `client/src/globals.css` (дизайн-токены;
  hex — ТОЛЬКО в globals.css)
- `client/package.json`, `client/tsconfig.json`
- при правках навигации: `components/layout/Sidebar.tsx` (+Header/Layout)

### Беседы 1.4/1.5 (стриминг на клиенте)
- += `client/src/hooks/useWebSocket.ts` — useStreamingGeneration строить
  ПОВЕРХ него; реконнект §3.3 (?resume=) реализовать в 1.4

### Беседа 1.5 (форма) и 1.6 (каталог)
- += страницы-заглушки CreateSynthesisPage/CatalogPage (заменять содержимое,
  маршруты уже есть), `PageStub.tsx` удалять по мере вытеснения

## Знания/грабли, добытые в 0.4

1. **Tailwind JIT** генерирует только классы, найденные в content — вставка
   класса в DOM из тестов даёт ложный провал; неиспользуемые классы проверять
   генерацией CLI по probe-файлу.
2. **puppeteer + SPA**: waitForNavigation ловит pushState ДО клиентского
   replace — ждать waitForFunction(location.pathname)+waitForSelector;
   page.click(overlay inset-0) кликает в ЦЕНТР — при перекрытии панелью
   кликать page.mouse.click(координаты вне панели); фоновые процессы
   умирают между вызовами инструментов — сервисы+тест одним вызовом;
   тест-скрипты класть в корень репо (из /tmp не резолвится node_modules).
3. StrictMode двоит effect с restore() (×2 GET /auth/me) — идемпотентно,
   в prod-сборке одинарно; guard не добавлен осознанно.
4. Песочница: fonts.googleapis.com блокируется egress-прокси
   (x-deny-reason) — фоллбэки шрифтов работают; .npmrc окружения содержит
   prefix= — строку удалять перед npm install.

## Открытые TODO после 0.4

1. useWebSocket: реконнект §3.3 (?resume= + догрузка буфера) и рантайм-тест
   на реальном стриминге — беседа 1.4 (сейчас проверен путь и ping→pong).
2. Self-host шрифтов вместо Google CDN — кандидат (устойчивость к блокировкам).
3. Redirect уже залогиненных с /login и /register — не специфицирован;
   сейчас рендерится форма (не белый экран). UX-решение — при наполнении.
4. **Дыра доков (07, беседа 0.4, чек CSS)**: «--gold (#d4a017)» и
   «--parchment» не совпадают с исходником (#d4a017 = --gold-light;
   parchment = --off #f2f0eb). Код — по исходнику; поправить формулировку 07.
5. **Пред-существующий зазор**: audit.mts и integration-check.mts не входят
   ни в один tsconfig — их _t-присваивания tsc НЕ проверяет (tsx только
   транспилирует). Решить (отдельный tsconfig для *.mts) отдельной правкой.
6. stores synthesis/generation/ui (05-структура) — беседы 1.5+;
   useStreamingGeneration/useEditPlan/useGraphData — 1.4+/2.3/1.7.

---

# Правки по итогам Фазы 0 (2026-07-23)

> Закрытие дыр/недочётов доков и файлов проекта, накопленных в главах выше.
> Правки доков — scripts/patch-docs-phase0.py (идемпотентный, applied=14/
> skip/fail-отчёт; прогон 2 — чистый skip). При переупаковке архивов скрипт
> оставлять: он же — документация того, ЧТО правилось.

## Закрыто

1. **0.1/TODO-8** — дубль беседы 1.4b в 07 удалён (остался вариант со
   ссылкой на 01 §4.12; вариант docs/tz/ ссылался на несуществующий файл).
2. **0.2/TODO-3** — сброс/смена пароля: 03-spec §1.1 A2 разделён
   (A2a reset → Фаза 3, нужна почта), §2.1 дополнен POST
   /auth/password-change (+reset-эндпоинты с пометкой Фазы 3); в 07
   добавлена беседа 0.5 (password-change) + ветка в графе §11.
   Формы 401/409 (анти-enumeration) из 0.2 задокументированы в §2.1.
3. **0.3b/TODO-1** — routes/taxonomy.ts добавлен в задачи беседы 5.3
   (пункт 4; бывший 4 стал 5).
4. **0.4/TODO-4** — чек CSS-переменных беседы 0.4 в 07 приведён к
   исходнику (--gold #b8860b, --gold-light #d4a017, --off=«parchment»).
5. **0.4/зазор useWebSocket** — добавлен задачей 9 беседы 0.4 и в граф §11.
6. **04+05** — устаревшее «в репо пока 74 — обновить» → «106, сверено в 0.1».
7. **0.4/TODO-5 (.mts вне tsconfig)** — создан server/tsconfig.checks.json
   (noEmit, include audit.mts+integration-check.mts), скрипт
   `typecheck:checks` (-w server), подключён в корневой `npm run typecheck`.
   Все _t-присваивания обоих .mts ВПЕРВЫЕ проверены компилятором — чисто.
   Кросс-мировые импорты клиента в integration-check переведены на
   `clientModule(path)` (путь-переменная: NodeNext-tsc их не резолвит,
   клиентский мир проверяет tsc -b client, рантайм — tsx). ГРАБЛИ:
   статический import("…/client/….tsx") в .mts даёт TS5097/TS6142 при
   типочеке — новые клиентские импорты в checks только через clientModule.

## Осталось открытым (сознательно)

- 0.1/TODO-6 (StepResult.costUsd vs cost) — решается при порте
  executeEditPlan (беседа 2.2), как и записано.
- 0.3/TODO-1,2,4 и 0.3b/TODO-2,3 — план работ Фаз 1–2 (warmCache,
  админ-роуты §2.9, subsection_map в 1.2 и т.д.), не дыры доков.
- 0.4/TODO-1,2,3,6 — план работ (reconnect §3.3 → 1.4; self-host шрифтов;
  redirect залогиненных; stores/hooks поздних бесед).
- Беседа 0.5 (password-change) — добавлена в протокол; РЕАЛИЗОВАНА
  (см. главу «Беседа 0.5 — итоги» ниже).

---

# Беседа 0.5 — итоги и контекст для следующих бесед

> Зафиксировано по завершении беседы 0.5 (password-change, требование A3).
> Все запросы протокола пройдены; typecheck/audit/check:integration зелёные.

## Созданные/изменённые файлы

- `server/routes/auth.ts` — ДОПОЛНЕН: POST /auth/password-change
  { currentPassword, newPassword } по 03-spec §2.1: requireAuth первым;
  валидация (переиспользованы readJson и PASSWORD_MIN_LENGTH из register;
  порядок: валидация ДО verifyPassword — bcrypt не гоняется на заведомо
  невалидном запросе); хэш читается из БД (AuthUser контекста без
  password_hash); неверный currentPassword → 401 AUTH_REQUIRED единым
  ответом без details (анти-enumeration, как login); транзакция:
  UPDATE password_hash+updated_at → DELETE сессий пользователя с
  and(eq(userId), ne(текущая session.id)) — прочие сессии гибнут,
  текущая живёт; → { ok: true }. Контракт дописан в JSDoc-шапку файла.
- `test-05-request{2,3,4}.mjs` (корень) — dev-регрессионные тесты
  (mini-Hono app.request + живой PG, приём 5e; самоочищающиеся):
  r2 (9/9) — смена → 200, новый пароль работает, старый → 401;
  r3 (9/9) — 3 сессии + чужая: текущая жива, прочие → 401, в БД ровна
  1 сессия = SHA-256(токена текущей), чужой пользователь не затронут;
  r4 (11/11) — edge cases: неверный текущий → 401 без details, короткий
  новый → 400 + details.newPassword, без сессии → 401, пустое тело /
  нестроковые поля → details по обоим, битый JSON → VALIDATION_ERROR,
  отказы БЕЗ побочных эффектов (хэш и сессии не тронуты).
- `server/integration-check.mts` — секции 0.5: 4f (парсинг routes/auth.ts:
  эндпоинт с requireAuth первым; инвариант eq(userId)+ne(sessionId);
  db.transaction; PASSWORD_MIN_LENGTH — общая константа, не дубль-цифра;
  коды ошибок покрыты общим сканом 4e) и 5f (живой цикл: отказы без
  побочных эффектов → успешная смена → старый 401 / новый 200 / чужая
  сессия убита / текущая жива; стоит ДО секции 5, закрывающей пул).

## Ревью по карте 04

Вся беседа — категория «Новое» (`server/routes/*.ts`: в исходнике
бэкенда нет); портировать было нечего. §2.1 для 0.5 покрыт полностью;
password-reset (A2a) — Фаза 3 (нужна почтовая инфраструктура).

## Помодульно: что прикладывать в следующие беседы

- **Клиентская страница/модалка профиля** (беседы нет — см. TODO-1):
  `server/routes/auth.ts` (контракт password-change), паттерн форм
  Login/RegisterPage из 0.4.
- **Фаза 3, password-reset (A2a)**: `server/routes/auth.ts` +
  `server/middleware/auth.ts` — переиспользовать анти-enumeration
  (reset/request всегда ok) и инвалидацию сессий; отличие от 0.5:
  reset инвалидирует ВСЕ сессии, включая «текущую» (её нет — пользователь
  без пароля), + понадобится таблица reset-токенов (в schema её НЕТ).

## Знания/грабли

Новых граблей нет; подтверждены старые: PG-демон и тест — одним
bash-вызовом; секции интеграции с БД — строго до закрытия пула.

## Открытые TODO после 0.5

1. **ДЫРА ДОКОВ (A3, «отображаемое имя») — ЗАКРЫТА** правкой 2026-07-24
   (`scripts/patch-docs-conv05.py`, идемпотентный, applied=6/прогон 2 —
   чистый skip; при переупаковке архивов скрипт оставлять — он же
   документация правки): §2.1 += PATCH /auth/me { displayName }
   (trim, пустая → null, >100 → VALIDATION_ERROR + details),
   05 += `client/pages/ProfilePage.tsx`, 07 += беседа 0.6 (PATCH /auth/me
   + ProfilePage + расширение auth-store; ссылка из Header) + ветка
   0.5 → 0.6 в графе §11. Реализация — беседа 0.6 (после неё удалить
   /profile-заглушку из PageStub-подхода, если появится раньше).
   Исходная формулировка дыры: 03-spec §1.1 A3 (MVP) включал смену
   отображаемого имени без эндпоинта в §2.1, без ProfilePage.tsx в 05
   и без беседы UI профиля (включая клиентскую форму password-change) в 07.
2. Отдельный rate-limit на password-change не вводился — действует общий
   HTTP-лимит 60/мин (index.ts); при желании ужесточить (перебор
   currentPassword внутри угнанной сессии) — Фаза 6 / заход по безопасности.
3. Уведомление на email о смене пароля — вместе с почтовой
   инфраструктурой Фазы 3 (password-reset).

---

# Беседа 0.6 — итоги и контекст для следующих бесед

> Зафиксировано по завершении беседы 0.6 (профиль пользователя, A3).
> Все запросы протокола пройдены; typecheck/audit/check:integration зелёные.

## Созданные/изменённые файлы

- `server/routes/auth.ts` — ДОПОЛНЕН: PATCH /auth/me { displayName } по
  §2.1 (requireAuth первым; DISPLAY_NAME_MAX_LENGTH=100; trim; пустая
  строка → null; не-строка/отсутствие/длина>100 → VALIDATION_ERROR +
  details.displayName; возврат полного user как GET /auth/me,
  balanceUsd через Number — numeric приходит строкой).
- `client/src/api/client.ts` — ДОПОЛНЕН: опция
  `RequestOptions.skipUnauthorizedHandler` — 401 НЕ дёргает глобальный
  обработчик. ПРИЧИНА (конфликт 0.4↔0.5, найден в 0.6): password-change
  отвечает единым 401 AUTH_REQUIRED на неверный currentPassword при
  ЖИВОЙ сессии — без опции пользователь разлогинивался бы вместо ошибки
  на форме. Использовать для любых будущих эндпоинтов, где 401 —
  штатный ответ формы, а не смерть сессии.
- `client/src/stores/auth-store.ts` — ДОПОЛНЕН: updateProfile(displayName)
  и changePassword(current, next) → ProfileActionResult
  ({ok:true} | {ok:false, error, details?}); store.error НЕ трогается
  (принадлежит формам login/register); user обновляется из ответа PATCH;
  changePassword шлёт через api() со skipUnauthorizedHandler и переводит
  AUTH_REQUIRED в «Неверный текущий пароль».
- `client/src/pages/ProfilePage.tsx` — НОВЫЙ: секции «Данные»
  (email read-only, displayName + Сохранить → «Сохранено») и «Смена
  пароля» (3 поля, клиентская проверка повтора, details по полям,
  успех → «Пароль изменён; прочие сессии завершены» + очистка полей);
  локальный компонент Field (label + input + пополевая ошибка
  role=alert; успехи — role=status).
- `client/src/App.tsx` — маршрут /profile (защищённый);
  `client/src/components/layout/Header.tsx` — имя/email пользователя
  стало Link на /profile, ВИДИМО и на мобильных (truncate
  max-w-[40vw] / sm:max-w-xs) — иначе на телефоне в профиль не попасть.
- `test-06-request2-api.mjs` (13/13 ✓) — API-тест PATCH /auth/me
  (граница 100 включительно, отказы не меняют БД);
  `test-06-request2-browser.mjs` (16/16 ✓) — браузерный тест ProfilePage
  (обе формы, ошибки полей, имя в шапке обновляется, БЕЗ разлогина при
  неверном текущем, вход новым паролем после logout).
- `server/integration-check.mts` — секции 0.6: 2e += ProfilePage
  (17 клиент-модулей), 4g (PATCH /me с requireAuth, константа лимита,
  /profile в App и Header, skipUnauthorizedHandler объявлен и применён
  changePassword'ом, updateProfile зовёт PATCH), 5g (живой смоук:
  смена видна в /auth/me, пустая → null, 101 → 400; ДО секции 5).

## Ревью по карте 04

Вся беседа — «Новое» (ProfilePage добавлен в 05 правкой
patch-docs-conv05.py; портировать нечего). Требование A3 закрыто
ПОЛНОСТЬЮ: сервер (0.5 + 0.6) и клиентский UI (0.6).

## Помодульно: что прикладывать в следующие беседы

- Любая клиентская беседа с формами: ProfilePage.tsx — образец
  пополевых ошибок (Field + details) поверх ProfileActionResult-паттерна.
- Фаза 3 (password-reset): NEXT-CONTEXT глава 0.5 остаётся в силе;
  + опция skipUnauthorizedHandler уже готова для reset-форм.

## Знания/грабли (браузерные тесты, к копилке 0.4)

1. Читать [role=alert] сразу после submit — ловится СТАРЫЙ алерт до
   ре-рендера React: ждать исчезновения → submit → ждать появления.
2. click×3 + Backspace + type НЕНАДЁЖНО чистит контролируемый input
   (остаток значения → ложные расхождения) — заполнять нативным
   setter'ом value + dispatchEvent("input").
3. Кэш .cache/puppeteer НЕ переживает сессии песочницы; системный
   Chromium живёт в /opt/google/chrome/chrome (headless: "shell",
   --no-sandbox).

## Открытые TODO после 0.6

1. /profile отсутствует в Sidebar — осознанно (ссылка из Header по 07);
   пересмотреть при наполнении навигации.
2. Rate-limit на password-change и email-уведомления — без изменений
   (см. TODO 0.5).
3. PageStub и заглушки страниц — без изменений, вытесняются Фазой 1.

---

# Беседа 1.1 — итоги и контекст для следующих бесед

> Зафиксировано по завершении беседы 1.1 (Synthesis Engine — ядро).
> Все запросы протокола пройдены (запросы 2–7 — тестами
> test-11-request{2..7}.mjs, 9+11+9+13+15+13 ✓); typecheck (shared+server+
> client+checks+scripts), audit, check:integration — зелёные.

## Созданные/изменённые файлы

- `server/utils/deep-merge.ts` — deepMergeUniq [5967] дословно + типы
  SectionDeps / DepsMap / PartialDepsMap (нижний слой для всех dep-карт).
- `server/utils/topo-sort.ts` — sourceOf [6410], getSubstituteQuality
  (ctxKey, subMap) [6834] (карта — аргументом вместо DOC_STATE),
  SECTION_TOPO_ORDER_ARCHITECTURAL/GENETIC [6505/6520],
  computePredecessors [6486], topologicalSort (Кан выделен из
  buildDynamicOrder по протоколу), buildDynamicOrder [6535],
  resolveCircularDeps [6929] + findOneCycle/getEdgeQuality/removeEdge —
  разрыв по слабейшему ребру, q=10 у оригинальных зависимостей,
  removeEdge переносит required→optional. МУТАЦИЯ effectiveDeps
  сохранена намеренно (после возврата effectiveDeps актуален для
  buildContextForSection — беседа 1.3). substitutionMap — последний
  опциональный параметр buildDynamicOrder/resolveCircularDeps/
  getEdgeQuality (default {} → качество заменителя 1).
- `server/services/synthesis-engine.ts` — resolveContextDeps(p) async
  (context_deps.* из Registry; fallback ?? CONTEXT_DEPS_BASE исходника
  снят — resolvedDeps обязателен у потребителей),
  getActiveSubstitutionMap(generationOrder) async, findSubstitute (карта
  обязательна), buildEffectiveDeps async-обёртка + ЧИСТОЕ ЯДРО
  buildEffectiveDepsWith(sections, resolvedDeps, subMap) — для advisor,
  тестов, вызовов с уже загруженной картой (понижение required→optional
  при q заменителя < 3 — 1:1); реэкспорты deepMergeUniq/sourceOf/
  getSubstituteQuality + всех типов (состав по протоколу).
- `server/services/compat-advisor.ts` — SEC_GROUP/METHOD_SYNERGY_PEAKS/
  BASE_SECTION_RATING [6973–7010] в коде (данные матрицы — в БД,
  параметры алгоритма — в коде), computeSectionRating/computeSections,
  getCompatEntry(ByKey) async (compat_matrix из Registry) + типы
  CompatEntry/CompatMatrixEntry/CompatSeverity, chipClassForRating/
  iconForSeverity/titleForSeverity, computeSectionWarnings [6616] 1:1
  (ключи результата — DOM-id secGraph…, как в исходнике),
  computeSectionAdvice — серверный аналог updateSectionWarnings [6645]:
  те же 4 блока (зависимости / конфликты ✗✗-✗ / рекомендации /
  подстановки после разрыва циклов на клонах), тексты дословно,
  выход — структурированные {icon, text, severity} (HTML — клиент, 1.5).
- `server/services/cost-estimator.ts` — константы [7539] дословно
  (CHARS_PER_TOKEN 2.6, PRICE_IN/OUT 3/15 за MTok, HTML_OVERHEAD 1.5,
  OUTPUT_MULTIPLIER 3.5, WORDS_TO_CHARS 7, SECTION_OUTPUT_MULT), mw
  [10519], estimateCost [7634] / estimateSubsectionCost [7807] /
  estimateModeCost [22748] — async (fragment_share/context_budget из
  Registry), ядра суммирования 1:1; квирк исходника сохранён:
  в estimateModeCost srcOutput БЕЗ OUTPUT_MULTIPLIER.
- `server/integration-check.mts` — секции 1.1: 2f (5 модулей, экспорты,
  тождественность реэкспортов через Object.is), 4h (async-сигнатуры _t20–
  _t25, приватность applyBudgetPressure + TODO(1.3), константы [7539] и
  топо-таблицы дословно, документированность мутации), 5h (живой
  конвейер: resolve→effective(подстановка)→order→compat→advice→estimate;
  ДО секции 5, закрывающей пул).
- `test-11-request{2..7}.mjs` (корень) — dev-регрессионные тесты
  (npx tsx; самодостаточные, finally: closeDb + closeRedis).

## Адаптации DOM/DOC_STATE → сервис (решения беседы)

1. Оценщики НЕ вызывают buildSYS/buildSectionDefs/groupPasses (их нет до
   1.2): sysChars/baseStaticChars/passes (EstimateSectionDef[][])/parts
   подаёт вызывающий; genLog → actualOutputChars: Record<key, number>
   (правило исходника: findLast status=done, outputChars>0, не-целевые).
2. parentOverhead — колбэк/число, default 0 (не мета-синтез); появится в
   1.3 (parent-context/context-builder).
3. applyBudgetPressure (пол 40%) — ЛОКАЛЬНАЯ приватная копия в
   cost-estimator, логика [10141] 1:1. TODO(1.3): канон в
   context-builder.ts (карта 04 §1.10) → заменить на импорт, копию
   удалить. Проверка приватности+TODO — в 4h.
4. computeSectionAdvice сам тянет resolveContextDeps/subMap/compat_matrix
   (4–5 getConfig на вызов; Redis-кэш смягчает) — вход только
   {sections, synthLevel, method, generationOrder}.

## Ревью по карте 04 (§1.1–1.3)

Портировано ВСЁ из §1.1 (кроме строк cascade-analyzer — беседа 2.1) и
§1.2 (updateCompatAdvisor/toggleCompatPanel/applyReplacement — DOM-UI,
категория «непереносимое» → CompatAdvisor.tsx/SectionWarnings.tsx, 1.5).
§1.3: estimateCost/estimateSubsectionCost/estimateModeCost — да;
estimateCascadeWaveCost и formatWaveCost — НЕ портированы: требуют
каскадного анализа (computeDependents и волны) — переносятся в беседу
2.1/2.2 вместе с cascade-analyzer (дополнить состав той беседы).

## Помодульно: что прикладывать в следующие беседы

### Беседа 1.2 (prompt-builder / section-defs-builder)
- += `server/services/synthesis-engine.ts` (resolveContextDeps,
  buildEffectiveDeps), `server/utils/topo-sort.ts` (buildDynamicOrder —
  порядок для groupPasses); после появления buildSYS/buildSectionDefs/
  groupPasses подключить их выходы к estimateCost (sysChars,
  baseStaticChars, passes) — см. «Адаптации» п. 1.
### Беседа 1.3 (context-builder / context-extractor)
- += `server/utils/deep-merge.ts` (типы DepsMap), `server/utils/
  topo-sort.ts` (sourceOf), `server/services/synthesis-engine.ts`;
  ПЕРЕНЕСТИ applyBudgetPressure: канон в context-builder, cost-estimator
  переключить на импорт (метка TODO(1.3) в коде, проверка в 4h).
- ПОМНИТЬ: buildDynamicOrder уже отмутировал effectiveDeps — передавать
  в buildContextForSection именно её (семантика исходника).
### Беседа 1.4 (generation-service)
- += engine (полный конвейер resolve→effective→order) + cost-estimator
  (готовить входы из sectionDefs/genLog по «Адаптациям» п. 1).
### Беседа 1.5 (форма, клиент)
- computeSectionAdvice возвращает {icon,text,severity} — рендер и
  CSS-классы (chipClassForRating) на клиенте; типы DepsMap/SectionDeps
  живут в server/utils — при необходимости клиенту зеркалить или
  поднимать в shared (решить в 1.5).
### Беседа 2.1 (cascade-analyzer)
- sourceOf импортировать из `server/utils/topo-sort.ts` (карта 04 числит
  его в cascade-analyzer — размещён слоем ниже, реэкспортировать при
  желании соответствия карте); + портировать estimateCascadeWaveCost/
  formatWaveCost (см. ревью).

## Знания/грабли, добытые в 1.1

1. Тесты, импортирующие server/services — только через `npx tsx`: голый
   `node --experimental-strip-types` не резолвит NodeNext-импорты
   `./x.js` → `.ts`.
2. В finally тестов нужен И closeDb, И closeRedis: ленивое
   Redis-соединение реестра держит event loop → процесс висит после OK.
3. getSubstituteQuality — first-match: один ключ бывает кандидатом в
   нескольких списках с разными q, возвращается q ПЕРВОГО вхождения при
   итерации карты; sum:goals сам является кандидатом (q=1); q=3 первым
   вхождением — у origin:genealogy.
4. У capsule ЕСТЬ запись в CONTEXT_DEPS_BASE (optional sum:goals,
   sum:novelty) — «раздел без deps» для тестов брать несуществующим
   ключом.
5. Песочница: nodesource-репозиторий отдаёт 403 — `rm /etc/apt/
   sources.list.d/nodesource.list` перед apt-get update; sudo нет —
   `su -s /bin/sh postgres -c "…"`.
6. Полный check:integration требует ВСЕХ трёх сидов (prompts + configs
   + taxonomy) — секция 5d проверяет каталоги.

## Открытые TODO после 1.1

1. TODO(1.3): applyBudgetPressure → context-builder (импорт вместо копии);
   канон внесён в текст беседы 1.3 в 07 (patch-docs-conv11, п. 6).
2. ~~estimateCascadeWaveCost + formatWaveCost → 2.1~~ ЗАКРЫТО: внесено в
   07 (беседа 2.1) и 04 §1.3 патчем scripts/patch-docs-conv11.py.
3. ~~НЕТОЧНОСТЬ 07 (беседа 1.1, запрос 2)~~ ЗАКРЫТО: формулировка
   исправлена тем же патчем (comparative → ["sum:goals"]; вариант с
   sum:tensions — про transformative/generative).
4. Типы DepsMap/SectionDeps для клиента (SectionWarnings, 1.5) — зеркало
   или подъём в shared.
5. updateCompatAdvisor/toggleCompatPanel/applyReplacement — клиент, 1.5.

## Патч доков по итогам 1.1

`scripts/patch-docs-conv11.py` — идемпотентный (7 правок, повторный
прогон — skip×7): 07 — исправлен запрос 2 беседы 1.1, шапка-ревизия,
беседа 2.1 += контекст (topo-sort, cost-estimator) + sourceOf-реэкспорт
+ перенос wave-функций, беседа 1.3 += канон applyBudgetPressure;
04 §1.3 — строка оценщиков разнесена по беседам 1.1/2.1.

# Беседа 1.2 — итоги и контекст для следующих бесед

> Зафиксировано по завершении беседы 1.2 (Prompt Builder + Section Defs).
> Запрос 1 верифицирован БАЙТОВОЙ сверкой с исходником
> (smoke-12-request1.mjs, 121/121 ✓, 6 наборов параметров: multi/single/
> none/meta_single/meta_multi, genetic, ext, lang=English); тестовые
> запросы 2–8 — одним заходом (test-12-requests2-8.mjs, 46/46 ✓);
> typecheck (shared+server+client+checks+scripts), audit,
> check:integration (+= 2g/4i/5i) — зелёные.

## Созданные/изменённые файлы

- `scripts/extract-section-templates.mjs` (`npm run extract:sections`) —
  генератор section-шаблонов по механике 0.3: vm-исполнение
  buildSectionDefs из фрагмента 1.2 со стабами-плейсхолдерами; 9 профилей
  параметров покрывают все ветки; QC: покрытие частей, инвентарь
  плейсхолдеров (KNOWN_PLACEHOLDERS), пост-замены. Перегенерировать при
  обновлении исходника.
- `server/config/section-templates.ts` — СГЕНЕРИРОВАН, 146 шаблонов
  `section.{key}.{preamble|preamble_short|intro|postamble|postamble_short|
  sub.{slug}[.{variant}]|sub.{slug}.note|shared|bridge}`. Варианты:
  `.none/.ext/.genetic/.meta_single/.meta_multi/.dialogue/.none_dialogue/
  .interlayer` — ВЫБОР ВАРИАНТА в коде билдера, текст в Registry.
- `server/config/subsection-map.ts` — SUBSECTION_MAP_BASE/GLOSSARY,
  SUBSECTION_CRITIQUE_NOVELTY/CHECK, SUM_PORTRAIT_VARIANTS
  [9314–9428, 9746] (источник сидинга конфига `subsection_map`).
- `scripts/seed-prompts.ts` — += SEED_SECTION_TEMPLATES (всего 253
  шаблона); `scripts/seed-configs.ts` — += `subsection_map` (всего 27;
  закрыт TODO-4 беседы 0.3).
- `server/services/prompt-builder.ts` — buildSYS(p, opts) [8590] из 4
  частей Registry (system + условные lang_instruction/participants_note +
  output_mode.{full|subsection|mode}); baseCtx [10515] =
  baseCtxStatic [10315] + baseCtxParents [10371];
  philNames/conceptNames [9849/9857]; participantsForPrompt [10531];
  eachParticipant [10590]; hasNoParticipants; mdText/sdText [4473/4523]
  async из конфигов md_by_card/sd_by_card; buildQualityReinforcement
  [8649]; getStopSignal (шаблон stop_signal); buildExtraTypesBlock [8977]
  из конфига extra_types + чистое ядро extraTypesBlockFrom;
  participantVars (словоформы + min_words для renderTemplate, включая
  participant_word_sg_cap).
- `server/services/section-defs-builder.ts` — buildSectionDefs [10742]
  async: каждый текст из Registry (r/rm/rl-хелперы с общим vars),
  ветвление и порядок разделов 1:1 (sum всегда; далее graph, glossary,
  theses, name, history, origin, practical, dialogue, evolution,
  critique, capsule по p.sec); serializeParts [10623]; groupPasses
  [11588]; patchPromptsWithSecCtx [11570]; parseGlossarySubsections
  [11532]; SUBSECTION_SUM_PORTRAIT [9438]; buildSubsectionMap [9455] из
  конфига subsection_map; SEC_NAMES [9291] (≡ KEY_LABELS, проверяется 2g).
- `server/integration-check.mts` — += 2g (4 модуля 1.2, тождественность
  реэкспортов, 146 уникальных ключей), 4i (async-сигнатуры, структурная
  совместимость SectionParts→EstimateSectionParts и
  SectionDefFull→EstimateSectionDef, groupPasses→estimateCost.passes без
  приведения; парсинг: стоп-сигнал из Registry без хардкода, разъём
  провайдера, тексты только из Registry, посевы/скрипт/баннер), 5i
  (живой сквозной конвейер 1.1+1.2: buildSYS→baseCtxStatic→
  buildSectionDefs→groupPasses→estimateCost с реальными sysChars/
  baseStaticChars/passes→patchPromptsWithSecCtx) — закрыт хук
  «подключить выходы 1.2 к estimateCost» из главы 1.1.
- Тесты в корне: `smoke-12-request1.mjs` (байтовая сверка против vm с
  РЕАЛЬНЫМИ хелперами исходника), `test-12-requests2-8.mjs` (запросы
  2–8 протокола).

## Адаптации DOM/DOC_STATE → сервис (решения беседы)

1. Все тексты — в Registry; условия (кардинальность, мета, genetic, ext,
   ±dialogue, interlayer) — в коде. Кардинальность НЕ в ключах:
   словоформы подставляет рендерер (participantVars), кардинальные
   ФОРМУЛИРОВКИ — вариантные ключи `.none/.meta_*` и конфиги
   md_by_card/sd_by_card.
2. baseCtxParents — ПОДКЛЮЧАЕМЫЙ провайдер (setParentContextProvider):
   реализация conceptContextBlockFull/Selective +
   resolveParentDepsForSubsection принадлежит 1.3 (parent-context) и 3.1
   (meta-synthesis-service); без провайдера мета-синтез получает "" с
   console.warn. Регистрация провайдера — при старте генерационного
   слоя (1.4).
3. STOP_SIGNAL: ОТСТУПЛЕНИЕ от 07 («константа в prompt-builder») —
   текст посеян в 0.3 шаблоном `stop_signal`, здесь только getStopSignal
   (единый источник истины). Добавляет его в конец задания ВЫЗЫВАЮЩИЙ
   (оркестратор 1.4: `${sp}${quality}${STOP_SIGNAL}` как в исходнике).
4. serializeParts живёт в section-defs-builder (не в prompt-builder, как
   в карте 04): работает над parts, которые строит buildSectionDefs.
5. parseGlossarySubsections принимает ОТРЕНДЕРЕННЫЙ текст
   level.{level}.glossary_sec (в исходнике — (level, p) из замыкания).
6. buildSubsectionMap async: канонические карты — конфиг subsection_map;
   пункты 2–3 критики и портретный заголовок резолвятся в коде.
7. groupPasses: сигнатура исходника БЕЗ effectiveDeps — по одному разделу
   на проход (формулировка 07 с effectiveDeps не соответствует
   исходнику; требование «sum раньше graph в разных проходах»
   выполняется порядком defs автоматически).
8. ФАКТ для тестов: длина buildSYS (dialectical/comparative/standard,
   2 философа) — 3192 символа; ориентир 07 «5000–8000» неверен.

## Ревью по карте 04 (§1.9, §2.2)

- §2.2 портировано ПОЛНОСТЬЮ: buildSYS (+opts), METHOD_*/LEVEL_* (шаблоны
  0.3, рендер rm/rl), buildSectionDefs (Registry + кардинальность),
  baseCtx=static+parents (пер-секционный через провайдер), serializeParts,
  patchPromptsWithSecCtx, buildQualityReinforcement.
- §1.9 (доля этой беседы): SUBSECTION_SUM_PORTRAIT + _SUM_PORTRAIT_VARIANTS
  ✓ (функция в билдере, варианты в конфиге), participantsForPrompt ✓;
  MD_BY_CARD/SD_BY_CARD были посеяны в 0.3 (config/cardinality-prompts.ts),
  здесь подключены mdText/sdText.
- Остальное из §1.10 (resolveParentDeps*, applyBudgetPressure,
  conceptContextBlock*) — беседы 1.3/3.1, к 1.2 не относится.

## Помодульно: что прикладывать в следующие беседы

- **1.3 (Context Builder)**: prompt-builder.ts (семантика baseCtxParents
  и разъём провайдера), section-defs-builder.ts (SUBSECTION_SUM_PORTRAIT,
  buildSubsectionMap, parts-структура), cost-estimator.ts (перенос
  applyBudgetPressure — канон в 07), synthesis-engine.ts, topo-sort.ts.
- **1.4 (Generation Orchestrator)**: prompt-builder.ts (buildSYS, baseCtx,
  buildQualityReinforcement, getStopSignal — сборка задания
  `${sp}${quality}${STOP_SIGNAL}`), section-defs-builder.ts
  (buildSectionDefs, groupPasses, patchPromptsWithSecCtx), + весь
  комплект 1.1 (порядки, оценка: sysChars=buildSYS().length,
  baseStaticChars=baseCtxStatic().length, passes=groupPasses(defs) —
  образец в 5i integration-check).
- **2.x (перегенерация подразделов)**: section-defs-builder.ts (parts,
  serializeParts, buildSubsectionMap, parseGlossarySubsections),
  prompt-builder.ts (buildSYS outputMode="subsection",
  cost-estimator.estimateSubsectionCost принимает parts как есть).
- **3.1 (Meta-Synthesis)**: prompt-builder.ts (setParentContextProvider,
  hasConceptParticipants, участники type="concept"|"synthesis").
- **4.1 (Режимы)**: prompt-builder.ts (buildSYS outputMode="mode",
  baseCtx), конфиг mode_deps (0.3).
- **Фаза 2 (админка Registry)**: server/config/section-templates.ts —
  версионирование через listVersions/activateVersion уже работает,
  ключи section.* стабильны.

## Знания/грабли, добытые в 1.2

1. Срез исходника, обрывающий JSDoc, оставляет незакрытый `/**`, который
   «съедает» следующий срез до первого `*/` (симптом — ReferenceError на
   константе, которая «точно есть»). Для промпт-блока брать 8590–9304
   (не 9310); границы сверять по началу `/**`.
2. Внутри блочных комментариев генерируемых файлов нельзя писать
   `method.*/level.*` — `*/` закрывает комментарий (SyntaxError).
3. Сверку jsonb-конфигов с исходником делать ПОКЛЮЧЕВО: порядок ключей
   объекта в jsonb не сохраняется (JSON.stringify целиком даёт ложный
   дифф).
4. `{{participants}}` в шаблонах разворачивается ДО словоформ:
   participantVars отдаёт и participantsForPrompt(p), и словоформы —
   один vars на весь вызов buildSectionDefs (+ покейсовые extra).

## Открытые TODO после 1.2

1. TODO(1.3/3.1): реализация провайдера родительского контекста и
   вызов setParentContextProvider при старте (1.4).
2. TODO(1.4): сборка полного задания секции (sp + quality + STOP_SIGNAL)
   и передача buildSYS(p, {outputMode}) по режиму вывода.
3. TODO(1.3): applyBudgetPressure — импорт из context-builder вместо
   локальной копии cost-estimator (перенос, канон в 07).
4. ~~НЕТОЧНОСТИ 07 (длина buildSYS 3192, groupPasses без
   effectiveDeps)~~ ЗАКРЫТО: scripts/patch-docs-conv12.py (07/A–D).
5. ~~Карта 04 §2.2: serializeParts числится в prompt-builder~~ ЗАКРЫТО:
   вынесен отдельной строкой в section-defs-builder (тот же патч, 04/E–F).

## Патч доков по итогам 1.2

`scripts/patch-docs-conv12.py` — идемпотентный (6 правок, повторные
прогоны — skip×6): 07 — groupPasses приведён к фактической сигнатуре
исходника groupPasses(defs) в первом запросе и тесте беседы 1.2, ориентир
длины buildSYS исправлен на факт 3192, блок в шапке-ревизии; 04 —
serializeParts вынесен из строки baseCtx в отдельную строку §2.2 с
целевым модулем section-defs-builder.ts, строка в шапке-ревизии.
УРОК ИДЕМПОТЕНТНОСТИ: в patch() проверять `new in text` ПЕРВЫМ — в
правках-дописываниях (шапки-ревизии) old является префиксом new, и
порядок old→new дублирует блок при повторном прогоне.

---

# Беседа 1.3 — итоги (context-builder / context-extractor)

> Зафиксировано по завершении беседы 1.3. Модули: server/services/
> context-builder.ts, context-extractor.ts, parent-context.ts,
> server/utils/html-parser.ts.

## Созданные/изменённые файлы

- `server/services/context-builder.ts` — buildContextForSection [8313–8499]
  (6 шагов 1:1), КАНОН applyBudgetPressure [10141] (пол 40%),
  parentOverheadForSection [10150], computeConceptOverhead [10133],
  extractRelevantIntraSectionContext [19894], реэкспорт
  extractIntraSectionContext (карта 04 §2.1).
- `server/services/context-extractor.ts` — extractContextFragment [8150–8270]
  (ВСЕ ветки), ContextSource + createDbContextSource (мемоизация),
  extractSection [7953], extractCapsuleText [11720], extractNameTitle [8068],
  extractIntraSectionContext [19866], extractSubsectionContent [19950],
  extractAllTablesAsText [8010], DB-аналоги extractGraphNodesTable /
  Compact / Edges / GlossaryTable / ThesesSummary, обёртки
  extractSummaryGoals / extractSummaryTensions (имена из 07).
- `server/services/parent-context.ts` — resolveParentDeps [10092],
  resolveParentDepsForSubsection [10114], resolveParentSpec (общая развилка
  section/subsection), parentFieldsUsedFor [10182],
  buildParentSpecForLog [10197], validateParentDeps [10055].
- `server/utils/html-parser.ts` — parseFragment / innerText /
  innerTextTrimmed поверх linkedom (добавлен в server/package.json).
- `server/services/cost-estimator.ts` — ИЗМЕНЁН: приватная копия
  applyBudgetPressure удалена, импорт из context-builder.
- `packages/shared/types/generation.ts` — ИЗМЕНЁН: ParentSpecLog приведён
  к исходнику, добавлены ParentSpecPerParent и CtxLogDraft.
- `server/integration-check.mts` — += 2h / 4j / 5j; проверка 4h инвертирована
  под состоявшийся перенос applyBudgetPressure.
- `scripts/patch-docs-conv13.py` — идемпотентный патч 07 (8 правок).
- Тесты в корне: `smoke-13-request1.mjs` (92/92, блок B — сверка HTML-портов
  с исходником через vm), `test-13-requests2-7.mjs` (90/90, запросы 2–7).

## Адаптации DOM/DOC_STATE → сервис (решения беседы)

1. `generated` (карта sectionKey → DOM-элемент) → **ContextSource**: доступ к
   разделам и гранулярным таблицам одного синтеза с мемоизацией. Создаётся
   из synthesisId (createDbContextSource); в тестах подменяем объектом.
2. Глобального ctxLog нет: buildContextForSection **ВОЗВРАЩАЕТ**
   `{ text, ctxLog: CtxLogDraft | null }`. Персистентность в context_log —
   generation-service (1.4). ctxLog=null только при раннем выходе
   (раздела нет в картах зависимостей).
3. **Схема БД не менялась.** Поля исходника rawBaseBudget и
   conceptOverheadApplied колонок не имеют и не требуют:
   `rawBaseBudget = CONTEXT_BUDGET[depth] × (sectionKey==="critique" ? 1.5 : 1)`,
   `conceptOverheadApplied = rawBaseBudget − budget`. Колонка
   `parent_overhead` хранит СЫРОЙ вес родителей (parentOverheadForSection),
   а НЕ величину ужатия — это разные числа.
4. Сигнатура: пять позиционных параметров как в 07 + шестой `opts`
   (source / params / participants / subsectionName) вместо DOC_STATE.
   `params` по умолчанию читаются из строки syntheses; `participants` —
   параметр с дефолтом `[]` (наполнение полей — 3.1). Провайдер-заглушку,
   как в 1.2, не заводили: вызывающий рядом.
5. `innerText` — ПРИБЛИЖЕНИЕ, а не порт (см. грабли п. 1).
6. `graphLastColName` берётся из Registry (`level.{level}.graph_last_col_name`),
   фолбэк только на RegistryNotFoundError — сбои БД/Redis пробрасываются,
   чтобы контекст не деградировал молча.
7. FRAGMENT_SHARE в buildContextForSection НЕ участвует (только в оценщике) —
   из конфигов читается лишь context_budget. Формулировку 07 не меняли.

## Ревью по карте 04 (§2.1, §1.10)

- §2.1 портировано ПОЛНОСТЬЮ: buildContextForSection ✓ (+ новое
  бюджетирование: parentOverheadForSection + applyBudgetPressure, parentSpec
  в ctxLog), extractContextFragment + все extract-функции ✓,
  truncateText/tableToText — 0.1 ✓, extractIntraSectionContext ✓,
  extractRelevantIntraSectionContext ✓ (с TODO(2.1) на каноникализацию).
  НЕ портирован `getSectionContextQuality` → context-quality.ts: в тексте
  беседы 1.3 не значился; дыра доков закрыта — модуль внесён в беседу 2.4
  (patch-docs-conv13, 07/F) + ребро 2.3 ← 2.4 в §11.
- §1.10 (доля этой беседы): resolveParentDeps ✓,
  resolveParentDepsForSubsection ✓, parentFieldsUsedFor ✓,
  buildParentSpecForLog ✓, applyBudgetPressure ✓ (канон),
  parentOverheadForSection ✓, computeConceptOverhead ✓.
  Осталось на 3.1: conceptContextBlockFull / conceptContextBlockSelective
  (meta-synthesis-service) — к 1.3 не относятся.
- Конфиги PARENT_* (server/config/parent-deps.ts) посеяны ещё в 0.3;
  parent-context читает их ТОЛЬКО через Registry (проверка 4j).

## Помодульно: что прикладывать в следующие беседы

- **1.4 (streaming/generation)**: `context-builder.ts` (buildContextForSection
  — вход конвейера; возвращает ctxLog, который надо писать в context_log),
  `context-extractor.ts` (createDbContextSource), `parent-context.ts`
  (провайдер для setParentContextProvider) + весь комплект 1.1/1.2.
  ПОМНИТЬ: buildDynamicOrder уже отмутировал effectiveDeps — передавать в
  buildContextForSection именно её.
- **2.1 (cascade-analyzer)**: `context-builder.ts` (extractRelevantIntraSection
  Context ждёт canonicalSubsectionKey колбэком — подставить настоящую),
  `context-extractor.ts` (extractSubsectionContent).
- **2.2 (plan-executor / regenerateSubsection)**: `context-builder.ts`
  (opts.subsectionName → PARENT_INTRA_DEPS), `context-extractor.ts`.
- **2.4 (логи)**: `context-builder.ts` (структура CtxLogDraft — вход
  log-formatter), `shared/types/generation.ts` (CtxLogDraft, ParentSpecLog,
  ContextEntry) + новый context-quality.ts по 07/F.
- **3.1 (meta-synthesis)**: `parent-context.ts` целиком (resolveParentSpec —
  общая точка для conceptContextBlockSelective), `context-builder.ts`
  (parentOverheadForSection, computeConceptOverhead).
- **Любая беседа с серверным HTML-парсингом** (1.4 graph-parser,
  4.3 import-service): `server/utils/html-parser.ts` — единственная точка
  входа linkedom (проверяется 4j).

## Знания/грабли, добытые в 1.3

1. **linkedom определяет СВОЙ `innerText`** (≈ textContent: `<p>a</p><p>b</p>`
   → `ab`). Проверка `if (!("innerText" in node))` делает подмену молчаливым
   no-op — перекрывать безусловно. Тот же капкан ждёт любой vm-эталон,
   которому подсовывают браузерные хелперы.
2. **Соседние блоки дают ДВЕ границы** (конец предыдущего + начало
   следующего). Прямая вставка `\n` удваивает переносы. Решение: служебные
   маркеры `\u0001` (line) / `\u0002` (para) со схлопыванием серии по
   максимуму «силы». Абзацы/заголовки/таблицы дают пустую строку (в браузере
   у них вертикальные margin), div/li/tr — один перенос.
3. `buildDynamicOrder(effectiveDeps, selected, resolvedDeps, order)` —
   карта ПЕРВЫМ аргументом, не список.
4. **Дефолт DATABASE_URL в `server/env.ts` несёт пароль `philosynth_dev`**,
   а `.env` читает только drizzle-kit — tsx-скрипты его НЕ подхватывают.
   Расхождение выдаёт `28P01` под видом «Failed query», настоящая причина
   в `err.cause` (та же грабля, что в 0.2).
5. `RegistryNotFoundError` — единственный законный повод для фолбэка на
   дефолт шаблона; глухой `catch {}` превращает падение БД в тихую
   деградацию промпта.
6. Проверки-парсеры в integration-check должны вырезать комментарии: JSDoc
   портов легитимно цитирует имена исходника (`document.createElement`),
   и наивный regexp ловит их как нарушение (случилось на 4j).
7. `_t`-константы в integration-check нумеруются сквозной серией — брать
   свободный диапазон (1.3 занял `_t40`–`_t50`).

## Открытые TODO после 1.3

1. **TODO(2.1)**: `canonicalSubsectionKey` [9753] в
   extractRelevantIntraSectionContext — пока колбэк с тождеством по
   умолчанию. Без настоящей каноникализации при кардинальности ≠ multi
   портретные заголовки не совпадут с каноном INTRA_DEPS.
2. **TODO(1.4)**: запись CtxLogDraft в context_log; регистрация
   setParentContextProvider при старте генерационного слоя.
3. **TODO(3.1)**: наполнение полей концепций-родителей
   (importConceptAsParticipant), conceptContextBlockFull/Selective.
4. **TODO(2.4)**: context-quality.ts по новой формулировке 07/F.
5. ~~`.env.example` числится в 05-file-structure, но в репозитории его нет~~
   ЗАКРЫТО ниже в этой же главе (сопутствующие правки второй волны):
   файл создан. Аудит 1.4 дополнил его тремя недостающими переменными
   (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STREAM_RETRY_DELAYS) —
   итого все 19 переменных server/env.ts покрыты.

## Патч доков по итогам 1.3

`scripts/patch-docs-conv13.py` — идемпотентный (8 правок → повторный прогон
skip×8): 07/A столбцы таблицы категорий («Категория» + столбец уровня из
Registry), 07/B глоссарий без столбца «Категория», 07/C порог 1.5×budget и
UNTOUCHABLE, 07/D null вместо пустой строки, 07/E parent-context.ts +
html-parser.ts в первом запросе 1.3, 07/F context-quality.ts в беседу 2.4 +
ребро 2.3 ← 2.4 в §11, 07/G шапка-ревизия.

## Сплошная сверка доков с реализацией (вторая волна патча 1.3)

Помимо четырёх неточностей, найденных тестами, сплошная сверка семи
документов с фактическим кодом дала ещё девять расхождений — все закрыты
тем же `scripts/patch-docs-conv13.py` (итог: 18 правок, повторный прогон
skip×18):

- **03/H** §2.3 — `SectionSummary` не был описан в спецификации, хотя
  эндпоинт его возвращает, а `shared/types/section.ts` уже содержит
  `contextQualityScore` (требование 01-arch §4.15 п.3).
- **03/I** §2.3 — ответ `/sections/:key/context` назывался `contextHtml`,
  хотя возвращается ПЛОСКИЙ ТЕКСТ; поля v11 (budgetMode, parentOverhead,
  parentSpec, счётчики) отсутствовали. Приведён к `CtxLogDraft`.
- **02/J** §2.16 — описание `parent_spec` («per-parent spec») противоречило
  `buildParentSpecForLog`: структура ОДНА на раздел с разбивкой `perParent`.
  Добавлено примечание, что rawBaseBudget/conceptOverheadApplied колонок не
  требуют (восстановимы), а `parent_overhead` — сырой вес, не величина ужатия.
- **01/K** §4.3 — `FRAGMENT_SHARE` числился участником
  `buildContextForSection`; фактически он читается только оценщиком.
- **04/L** §2.1 — `extractIntraSectionContext` числился в context-builder;
  реализация в DOM-слое (context-extractor) + реэкспорт.
- **04/M** §4 — добавлен `server/utils/html-parser.ts` (новый модуль,
  единственная точка входа linkedom).
- **07/N** беседа 1.4 — в контекст добавлены section-defs-builder,
  cost-estimator, context-extractor, parent-context: без них оркестрация
  не собирается (buildSectionDefs/groupPasses, провайдер, sysChars).
- **07/O** беседа 2.1 — отмечен потребитель `canonicalSubsectionKey` из 1.3.
- **05/P** — в дерево добавлен `.gitignore` (в репозитории отсутствовал:
  `.env` с паролем БД и ключами API ничем не был защищён).

Сопутствующие правки репозитория (следствие сверки, не docs):
- создан **`.env.example`** — числился в 05, но отсутствовал; сверен с
  `server/env.ts`: покрыты ВСЕ 16 переменных, включая
  ANTHROPIC_MAX_TOKENS, STREAM_STUCK_MS, BILLING_MARKUP, три RATE_LIMIT_*;
- создан **`.gitignore`** (node_modules, dist, .env, dump.rdb, архивы).

## Обратная сверка: что из правок доков потребовало кода

Вопрос «надо ли править файлы прежних бесед» проверен адресно по каждой из
18 правок. Найден ОДИН отставший артефакт:

- **`packages/shared/types/section.ts` (беседа 0.1), `SectionContextPreview`** —
  нёс `contextHtml: string` и `used`, без единого поля v11. Правка 03/I
  переименовала поле в `contextText` (возвращается плоский текст, не HTML) и
  дополнила состав; тип приведён к `CtxLogDraft`: budget, rawBaseBudget,
  totalUsed, budgetMode, parentOverhead, parentSpec, reqFound/reqTotal/
  optIncluded/optTotal, entries. Потребителей ещё нет (routes/sections.ts —
  будущая беседа), правка безопасна и делает контракт готовым к 1.6/2.4.

Остальные правки кода не требуют — проверено, а не предположено:

- `ParentSpecLog` (02/J) — тип уже исправлен в 1.3; `schema.ts` берёт его
  через `$type<ParentSpecLog | null>()`, `parent-context` возвращает ровно
  его, audit чист.
- `SectionSummary` (03/H) — `shared/types/section.ts` уже содержал
  `contextQualityScore`; документация догоняла код, а не наоборот.
- `FRAGMENT_SHARE` (01/K) — сверено грепом: конфиг читает ТОЛЬКО
  `cost-estimator`; `context-builder` его не касается.
- 04/L, 04/M — описывают фактическое размещение модулей 1.3.
- 07/E, 07/F, 07/N, 07/O, 05/P — про будущие беседы либо про репо-файлы;
  существующего кода не касаются.

**README.md** тоже был устаревшей документацией: статус останавливался на
Фазе 0 и утверждал, что synthesis engine и context builder «не сделано».
Обновлён (правки README/Q–S): покрытие check:integration, заголовок статуса,
блоки бесед 1.1/1.2/1.3 и актуальный перечень несделанного с указанием, что
следующая по графу — 1.4.

Итог патча `scripts/patch-docs-conv13.py`: **21 правка**, повторный прогон
skip×21.

# Беседа 1.4 — итоги (streaming-manager / generation-service)

> Зафиксировано по завершении беседы 1.4. Модули: server/services/
> streaming-manager.ts, generation-service.ts, graph-parser.ts,
> element-parser.ts, server/ws/stream-state.ts, server/routes/syntheses.ts.
> Запросы 2–8 — одним заходом: test-14-requests2-8.mjs 46/46 ✓ (живой
> сервер + мок-SSE Claude API); регресс зелёный (typecheck, audit,
> INTEGRATION OK += 2i/4k/5k, smoke-13 92/92, test-13 90/90).

## Созданные/изменённые файлы

- `server/ws/stream-state.ts` — Redis reconnect-буфер: ключ раздела
  `stream_state:{id}:{key}` + указатель `stream_state:{id}` (совмещает
  формы 01 §4.4 и 03 §3.3), TTL 3600, fail-open как rate-limiter.
- `server/services/streaming-manager.ts` — порт _streamRespOnce [12463]
  (одна попытка SSE), classifyStreamError [12429], stuck-таймер через
  AbortController (45с), троттлированная запись буфера в Redis (1с),
  stop_reason max_tokens → StreamError с реально потраченным usage,
  pauseFriendlyMessage [24653]; URL — `${env.anthropic.baseUrl}/v1/messages`.
- `server/services/generation-service.ts` — порт generateDoc [11897] /
  _runGenPassesFromIdx [25573]: реестр activeRuns (лимит 3/пользователя),
  ретраи ТОЛЬКО pre-stream (env.streaming.retryDelays), паузы с
  PausedStateGen + pause_marker, user-abort → финализация БЕЗ pausedState
  (03 §3.1), outer catch → 'context-error'; CtxLogDraft ПИШЕТСЯ в
  context_log (закрыт TODO(1.4) беседы 1.3); genCommon — служебной строкой
  generation_log ('_genCommon'/'common'); registerParentContextProvider
  (стаб до 3.1); порты parseSubsectionsFromHTML [9795],
  buildPromptSkeleton [8506], extractTitleFromNameHtml [11871] (FIX
  \w-бага), computeFullConceptBlockSizes [10302], buildParentSpecBySection
  [10399]; export assertCanStartGeneration (предпроверки для POST).
- `server/services/graph-parser.ts` — порт parseTopology [12696] /
  parseGraph [12925] через html-parser; saveGraphToDb — транзакционная
  ЗАМЕНА (categories/category_edges/cluster_labels), рёбра с концами вне
  таблицы категорий → warnings (FK), has_reflexive денормализован по
  направлению рёбер; _rebuildNodeColors/EdgeStyles — клиент (1.7).
- `server/services/element-parser.ts` — прародителей НЕТ: парсеры по
  структурам таблиц промптов Registry (тезисы — «Сводная таблица»,
  justification best-effort по `<strong>`; глоссарий — первый th «термин»
  [8027], extraColumns под фактическими заголовками thead, termCategory
  best-effort по категорийным подразделам); saveElementsToDb — замена.
- `server/routes/syntheses.ts` — POST /syntheses (03 §2.2): валидация с
  details (разделы по SEC_NAMES; v11 — оба списка участников пусты →
  обязателен seed; participants type='synthesis' → VALIDATION_ERROR до
  3.1), sectionOrder=["sum",...sections], генеалогия philosophers →
  synthesis_lineage, предпроверки ДО insert, фоновый запуск; сбой старта →
  status='error' + stream_error. Остальные роуты §2.2 — 1.6/4.3.
- `server/ws/handler.ts` — subscribe_generation (подписка/запуск с
  проверкой владения и статуса), cancel → cancelGeneration; handleResume
  §3.3 (?resume= → {type:"resume", sectionKey, htmlSoFar, charsSoFar};
  буфера нет → ready→generation_complete / paused→generation_paused).
- `server/env.ts` — anthropic.baseUrl (ANTHROPIC_BASE_URL: мок в тестах,
  прокси BYO-Key); .env.example дополнен (+ ранее недостающие
  STRIPE_*, STREAM_RETRY_DELAYS — итого все 19 переменных).
- `packages/shared/types/synthesis.ts` — PauseReasonKind += 'context-error'.
- `server/integration-check.mts` — += 2i (6 модулей, тождественность
  реэкспортов stream-state), 4k (_t51–_t58; парсинг: baseUrl из env,
  ретраи только pre-stream, activeRuns.set ДО await, цены из
  cost-estimator, scaffold дословно, '_genCommon', user-abort без
  pausedState, linkedom изолирован, POST по SEC_NAMES, resume §3.3),
  5k (живьём: двойной saveGraphToDb/saveElementsToDb — идемпотентная
  замена без 23505, stream-state круговой, предохранители; ЯВНЫЙ
  connectRedis — см. грабли).
- `scripts/patch-docs-conv14.py` — идемпотентный патч (10 правок).
- Тесты: `test-14-requests2-8.mjs` (46/46; мок-SSE + child-сервер),
  `server/smoke-1.4.mts` (8 блоков чистых функций без БД).

## Адаптации DOM/DOC_STATE → сервис (решения беседы)

1. onDelta расширен до (delta, totalChars, htmlSoFar) — серверу нужен
   ИНКРЕМЕНТ для stream_delta §3.2 (исходник передавал length+html).
2. PausedStateGen — по shared-типам 0.1 (timestamp: number,
   partialSubsections: string[] имена) вопреки исходнику (ISO-строка,
   объекты); chars восстановимы из metadata.subsections генлога.
3. genEntry: insert status='streaming' → update по завершении (виден при
   reconnect); metadata несёт sys + promptSkeleton (экспорт 4.2) +
   expectedSubsections/subsections + поля _augmentGenEntry.
4. Свежий createDbContextSource на КАЖДЫЙ проход — мемоизация не должна
   прятать только что сохранённые разделы.
5. Капсула копируется в syntheses.capsule_html, строка sections
   СОХРАНЯЕТСЯ (гранулярность/перегенерация; адаптация против
   removeCapsuleFromDocBodies).
6. user-abort: pausedState НЕ создаётся, финализация по правилам stop
   (§3.1 [663]); user_action_marker в генлоге.
7. POST запускает генерацию в фоне; subscribe_generation — подписка или
   рестарт (после падения сервера); дельты идут по userId на все
   соединения пользователя.
8. API-ключ: env.anthropic.apiKey (TODO(6.1) BYO-Key через api-key-service).
9. _autoAddCurrentDocToPool: на сервере тривиально (синтез уже в БД);
   UX — ConceptPool.tsx (3.2). Валидации-confirm'ы формы — клиент (1.5).

## Ревью по карте 04 (§2.3, §1.7, доли §2.4/§2.5/§2.6)

- §2.3 портировано ПОЛНОСТЬЮ: streamResp→_streamRespOnce ✓ (модель
  1:1: одна попытка + классификация; ретраи уровнем выше);
  + добавлены в карту патчем 14/D: _classifyStreamError,
  _pauseFriendlyMessage, parseSubsectionsFromHTML, _augmentGenEntry,
  computeFullConceptBlockSizes, buildParentSpecBySection, element-parser.
- §1.7 (серверная доля): parseTopology ✓, parseGraph ✓ (все FIX'ы и
  console.warn исходника), normalizeName/Type — импорт из shared (0.1) ✓;
  клиентское (_rebuildNodeColors, showEdgePanel, getStructuralMarkers,
  legendFilter) — беседа 1.7.
- §2.4 (доля 1.4): updateDocTitleFromName ✓ [176] (с FIX \w-бага),
  _logPauseEvent ✓ (pause_marker-строки; числится в 1.4b — создание пауз
  готово, ДЕЙСТВИЯ возобновления — 1.4b); _computeGenPauseEstimates —
  1.4b (estimates:{} в generation_paused). regenerateSection [174] — 2.2.
- §2.5/§2.6: genCommon.conceptBlockSizes ✓ [203] (пустой до 3.1),
  buildPromptSkeleton ✓ [204] (пишется в metadata генлога).

## Помодульно: что прикладывать в следующие беседы

- **1.4b (pause-resume)**: generation-service.ts (реестр activeRuns,
  runGeneration-цикл — _resumeFromSubsection стартует с passIdx;
  pausedState/pause_marker уже пишутся), streaming-manager.ts,
  ws/handler.ts (заглушки resume_generation/resume_plan),
  shared PausedStateGen. Реализовать: _computeGenPauseEstimates,
  действия fill-missing-subs/retry/skip/stop, resume_marker.
- **1.5 (форма/прогресс, клиент)**: routes/syntheses.ts (контракт POST),
  ws-протокол фактический (stream_delta с периодическим totalHtml каждые
  25 дельт, subsection_found, section_done с html, resume) — образец
  клиента в test-14 (wsConnect/waitFor).
- **1.6 (просмотр/каталог)**: routes/syntheses.ts (добавлять GET/PATCH/
  DELETE в этот же файл), sections/htmlContent + capsuleHtml.
- **2.2 (plan-executor/regeneration)**: generation-service.ts (upsertSection,
  жизненный цикл genEntry, source='edit'/'cascade'), streaming-manager.
- **2.4 (логи)**: структура строк generation_log (метаданные
  expectedSubsections/subsections/promptSkeleton/sys/budgetMode/
  parentOverheadChars; служебная '_genCommon') + context_log из 1.4.
- **3.1 (meta-synthesis)**: registerParentContextProvider — ЗАМЕНИТЬ стаб
  на conceptContextBlockFull/Selective; conceptBlockSizes/
  parentSpecBySection получают реальных участников.
- **4.2 (экспорт промптов)**: metadata.sys + metadata.promptSkeleton
  генлога — реконструкция без повторной сборки.
- **6.1 (BYO-Key)**: env.anthropic.baseUrl — точка для прокси; ключ
  пользователя вместо env.anthropic.apiKey (TODO(6.1) в двух местах).

## Знания/грабли, добытые в 1.4

1. **ГОНКА ДВОЙНОГО СТАРТА**: реестры-предохранители в async-коде
   резервировать ДО первой точки переключения. activeRuns.set стоял после
   await loadSynthesis — POST-запуск и subscribe_generation в этом окне
   оба проходили has()-проверку → два параллельных цикла (симптом: 23505
   на cluster_labels от двойного saveGraphToDb). Проверка — 4k.
2. lazyConnect + enableOfflineQueue=false: без явного connectRedis ПЕРВАЯ
   команда реджектится, fail-open прячет сбой (5k ловил null из
   stream-state). В скриптах/секциях — явный await connectRedis().
3. AbortError из sleep между ретраями обязан классифицироваться как
   user-abort (classifyStreamError), а не «неизвестное → pre-stream».
4. \w в JS-регекспах НЕ матчит кириллицу — латентный баг исходника
   [11886] (срезание префиксов заголовка было мёртвым кодом); в портах
   кириллических регекспов писать [а-яё] + /i.
5. Мок-SSE: короткий контент завершается раньше точки обрыва/reconnect —
   сценарии SLOW/PARTIAL требуют контента среднего размера.
6. ReadableStreamReadResult отсутствует в серверном lib TS — типизировать
   { done, value? } вручную.
7. Тестовый паттерн «живой сервер»: child tsx index.ts + мок-SSE +
   Node 22 global WebSocket; сценарии мока управляются маркерами в seed
   (метки попадают в промпт) — не требует пересборки окружения.

## Открытые TODO после 1.4

1. TODO(1.4b): _computeGenPauseEstimates (estimates:{} в
   generation_paused); действия resume_generation (fill-missing-subs/
   retry/skip/stop); resume_marker; заглушки start_regen/start_mode/
   execute_plan/confirm_step/resume_plan в handler.
2. TODO(3.1): реальный провайдер родительского контекста (замена стаба
   registerParentContextProvider); участники-концепции в
   conceptBlockSizes/parentSpecBySection/parentFieldsUsed.
3. TODO(6.1): BYO-Key (ключ пользователя вместо env; baseUrl-прокси).
4. TODO(2.1) из 1.3 остаётся: canonicalSubsectionKey.
5. Роуты §2.2 кроме POST (GET-списки, GET/:id, PATCH, DELETE, duplicate,
   import) — беседы 1.6/4.3.

## Патч доков по итогам 1.4

`scripts/patch-docs-conv14.py` — идемпотентный (10 правок, повторный
прогон skip×10): 14/A 02 §2.3 reasonKind += 'context-error'; 14/B 07
_rebuildNodeColors/EdgeStyles — клиент (1.7); 14/C 07 onDelta с
инкрементом; 14/D 04 §2.3 += портированные функции 1.4 (в карте
отсутствовали); 14/E 04 FIX \w-бага updateDocTitleFromName [11886];
14/F 02 §2.15 служебная строка '_genCommon'; 14/G 07 шапка-ревизия;
14/H README (статус 1.1–1.4, блок 1.4, покрытие, «не сделано»,
следующая — 1.4b либо 1.5/2.1). Обратная сверка: все правки —
документация догоняет код 1.4; отставших артефактов прежних бесед нет
(Exclude<PauseReasonKind,'user-abort'> включил 'context-error'
автоматически, компиляция чиста).

# Беседа 1.4b — итоги (pause-resume-service / PauseModal)

> Зафиксировано по завершении беседы 1.4b. Модули: server/services/
> pause-resume-service.ts, порты в section-defs-builder.ts / utils/
> html-parser.ts, рефакторинг generation-service.ts, расширение
> ws/handler.ts, client/src/components/synthesis/PauseModal.tsx.
> Запросы 2–6 — одним заходом: tests/test-14b-requests2-6.mjs 56/56 ✓
> (живой сервер + мок-SSE, паттерн test-14); регресс зелёный
> (test-14 46/46, smoke-1.4b 27/27, typecheck, audit,
> INTEGRATION OK += 2j/4l/5l).

## Созданные/изменённые файлы

- `server/services/pause-resume-service.ts` — центральный модуль беседы:
  `logPauseEvent` [24504] (маркеры pause/resume/user_action в
  generation_log), `createPausedState` (перегрузки gen/plan; timestamp
  здесь), `computePauseEstimates` [24521] (rebuildInfra из genParams →
  estimateCost isEdit + actualOutputChars из done-строк генлога;
  estimateSubsectionCost по недостающим; streaming-подраздел — из
  metadata.subsections последней error-строки; fail-open {}),
  `resumeGeneration` [25075] (stop / retry / skip / fill-missing-subs;
  runtime-guard «чужого mode» → RESUME_INVALID), `finalizeAfterStopGen`
  [25405] (фолбэк на row.sectionOrder), `resumeFillMissingSubs`
  (_resumeFromSubsection [25317] + _continueAfterFilledSubs [25500];
  порог продолжения 250 симв., userNote «Заверши…» дословно),
  `regenerateSubsectionForResume` (минимальный порт regenerateSubsection
  [20236] с intra-ctxLog [20255]; TODO(2.2) объединить с полным),
  `resumePlan` [25910] (каркас: валидация + resume_marker + stop;
  retry/skip_step — разъём `setPlanResumeExecutor`, TODO(2.2)).
  Регистрация провайдера оценок — побочный эффект импорта (низ модуля).
- `server/services/generation-service.ts` — рефакторинг без изменения
  поведения 1.4: `withGenerationSlot` (синхронная резервация слота
  сохранена — грабля-гонка 1.4), `runGeneration` → export
  `runGenerationPasses(handle, …, {startIdx, source})` (условный
  _genCommon при resume, labelSuffix « [возобновление]» только в
  genEntry), экспорты `loadSynthesis`/`finalizeRun`/
  `resumeSynthesisFromPass`/`SynthesisRow`, разъём
  `setPauseEstimatesProvider` (прецедент setParentContextProvider; без
  цикла ESM), живые estimates в ОБЕИХ точках generation_paused.
- `server/services/section-defs-builder.ts` += `serializeSubsectionRegen`
  [10654] + `extractPreambleConstraints` [10727] (байтовая сверка с
  исходником — smoke-1.4b, 12 кейсов). Живут здесь по прецеденту
  serializeParts (04 §2.2): сериализуют parts, которые строит
  buildSectionDefs.
- `server/utils/html-parser.ts` += `spliceSubsectionHtml` /
  `removeSubsectionHtml` (порт DOM-механики regenerateSubsection
  [20384–20444] на строках html_content; изоляция linkedom сохранена).
- `server/db/schema.ts` + `packages/shared/types/generation.ts`:
  source += `'resume'` (пишется _runGenPassesFromIdx [25573]; дыра
  02 §2.15 закрыта патчем 14b/A; text-колонка — миграции не требует).
- `server/ws/handler.ts`: resume_generation / resume_plan →
  pause-resume-service (ошибки → stream_error c «CODE: message»,
  recoverable:false); handleResume (§3.3) отдаёт живые estimates;
  импорт модуля регистрирует провайдер оценок.
- `client/src/components/synthesis/PauseModal.tsx`: `PauseModal`
  (пропсы open/pausedState/estimates/onResumeGeneration/onResumePlan/
  onClose), 4 рендерера (gen partial/pre-stream, plan, billing, auth),
  `PauseBadge`, `fmtCost` ≡ `_fmtCost` [24634]. Интеграция в страницы —
  беседа 1.5.
- `server/smoke-1.4b.mts` (27 ✓, без БД: vm-байтовая сверка промптов и
  fmtCost + врезка подраздела), `tests/test-14b-requests2-6.mjs`
  (56 ✓: мок-маркеры [MOCK:MAXTOK]/[MOCK:BILLGRAPH]/[MOCK:PARTIAL],
  POST /control {billingOk}, /stats с записью sub-regen промптов).

## Адаптации DOM/DOC_STATE → сервис (решения беседы)

1. Оценки паузы: подмена DOC_STATE не нужна — «edit-режим»
   estimateCost({sections}) исходника = isEdit + actualOutputChars из
   последних done-строк generation_log.
2. Обрывочный подраздел (status!=='done') восстанавливается из
   metadata.subsections последней error-строки генлога (shared-тип
   хранит только имена — решение 1.4); фолбэк — expected−partial.
3. Confirm деградации зависимостей при skip [25686] — клиентское
   подтверждение (1.5); серверный skip молчит.
4. fill-missing-subs: минимальный внутренний
   regenerateSubsectionForResume вместо полного regenerateSubsection
   (принадлежит 2.2); intra-ctxLog type='intra-section' исходника →
   восстановим по sectionKey 'раздел:подраздел' и префиксу 'intra:'.
5. Очистка callout'ов [25378] не нужна: html_content хранит чистый
   частичный HTML из reconnect-буфера (1.4).
6. _resumeWithNewApiKey [24552] (ввод ключа в модалке) — TODO(6.1)
   BYO-Key; auth-рендерер: «Повторить» после замены ключа на сервере.
7. costHint [24801] опущен — те же числа несут кнопки.
8. Totals при sub-regen — SQL-инкременты (::numeric).
9. Квирк исходника: fallback «нет parts» [25358] зовёт
   resumeGeneration('retry') ПОСЛЕ _clearPausedState — мёртвый путь;
   в порте retry-ветка инлайнится (resumeRetryOrSkip).

## Ревью по карте 04 (строка Pause/Resume)

Строка «Pause/Resume (спец.: 01 §4.12)» покрывала подсистему суммарно —
патчем 14b/C дополнена фактическим размещением портов
(serializeSubsectionRegen/extractPreambleConstraints →
section-defs-builder; врезка подраздела → utils/html-parser; клиентский
путь → client/components/synthesis/PauseModal.tsx) и квирком [25358].
Не портированы намеренно: _rebuildProgressPanelForResume /
_ensureDocBodyContainers / submitBtn-механика — клиент (1.5);
_resumeWithNewApiKey — 6.1.

## Помодульно: что прикладывать в следующие беседы

- **1.5 (страницы синтеза)**: PauseModal.tsx (управляется пропсами; не
  ходит в API сам), PauseBadge; подписка на
  generation_paused/generation_resumed в useWebSocket; confirm
  деградации зависимостей при skip [25686–25740] — реализовать на
  клиенте перед отправкой resume_generation(skip).
- **1.6 (GET /syntheses/:id)**: отдавать pausedState; estimates —
  computePauseEstimates(id, ps) из pause-resume-service (fail-open {}).
- **2.2 (regeneration / plan-executor)**: объединить
  regenerateSubsectionForResume с полным regenerateSubsection [20236]
  (перегенерация по кнопке, userNote из UI, режим «Доработай»);
  реализовать исполнение шагов плана и зарегистрировать его в
  setPlanResumeExecutor (retry/skip_step перестанут отвечать
  RESUME_INVALID); плановые паузы — createPausedState(id, 'plan', …).
- **4.2 (экспорт логов)**: маркеры pause_marker/resume_marker/
  user_action_marker показываются в «Логе контекста», исключаются из
  «Лога промптов» по log_type (02 §2.15).
- **6.1 (BYO-Key)**: форма ввода ключа в auth-рендерере
  (_resumeWithNewApiKey [24552]) + resumeGeneration после смены ключа.

## Знания/грабли, добытые в 1.4b

- Маркеры генлога несут status='done' — счёт done-строк раздела ОБЯЗАН
  фильтровать log_type='generation' (иначе pause/resume_marker дают
  ложные дубли).
- waitFor теста по накопленным сообщениям берёт ПЕРВОЕ подходящее —
  предикаты сужать по sectionKey, иначе ловится section_done до паузы.
- pkill -f "строка" убивает собственную bash-команду, если паттерн есть
  в её тексте; обход — символьный класс: pkill -f "tsx [i]ndex.ts".
- Singleton Redis, переоткрытый секцией 5k integration-check, держал
  event loop после INTEGRATION OK (процесс не завершался) — фикс:
  closeRedis в teardown перед closeDb.
- После сжатия контекста посреди захода: файл на диске — первоисточник;
  аудит вести против кода (shared-типы, handler, дословные заголовки
  промпта, эталонный формат мока), а не против конспекта.
- parseClientMessage валидирует только type — mode из WS доходит до
  сервиса строкой: runtime-guard режимов обязателен (без него «bogus»
  проваливался в retry).
- parseSubsectionsFromHTML возвращает canonical-имена из expected;
  последний найденный див = 'streaming' (обрывочный див с chars>0
  попадает в partialSubsections).

## Открытые TODO после 1.4b

- TODO(2.2): полный regenerateSubsection + plan-executor +
  setPlanResumeExecutor (до этого resume_plan retry/skip_step →
  RESUME_INVALID с пояснением).
- TODO(1.5): интеграция PauseModal/PauseBadge в страницы; confirm
  деградации при skip.
- TODO(1.6): GET /syntheses/:id с pausedState + estimates.
- TODO(6.1): BYO-Key + ввод ключа в auth-модалке.
- Прочие TODO прежних бесед (3.1 провайдер родителей, 2.1
  canonicalSubsectionKey) — без изменений.

## Патч доков по итогам 1.4b

scripts/patch-docs-conv14b.py (идемпотентный): 14b/A 02 §2.15
source += 'resume'; 14b/B 03 §4.3 примечание — resume_plan
retry/skip_step до plan-executor'а (2.2) отвечает RESUME_INVALID;
14b/C 04 строка Pause/Resume — фактическое размещение портов + квирк
[25358]; 14b/D 01 §4.12 п.6 — auth-рендерер сервиса без формы ввода
ключа до 6.1; 14b/E ревизии шапок; 14b/F README (статус, блок 1.4b,
«не сделано», следующая беседа).

---

# Беседа 1.5 — форма создания + прогресс (клиент) [ЗАКРЫТА]

## Созданные/изменённые файлы

- `client/src/api/syntheses.ts` — createSynthesis / estimateSynthesis /
  getSynthesis (контракт §2.2; РОУТ GET — беседа 1.6) /
  fetchSynthesisAdvice; типы SynthesisEstimate (≡ FullCostEstimate),
  CompatEntryDto (+icon/title с сервера), SectionAdviceDto.
- `client/src/components/synthesis/`:
  - `SynthesisForm.tsx` — все поля (опции селектов дословно из исходника),
    язык с веткой «Другой…» (initLangUI, 01 §4.15 п.6), дефолт-секции
    graph/glossary/theses/history/name/critique, валидация v11
    (0 участников → зерно обязательно; 0 секций → ошибка), дебаунс-совет
    400 мс (updateCompatAdvisor→updateSectionWarnings), условный
    keepFullBudget (виден только при conceptParticipants — пул 1.5b);
  - `PhilosopherPicker.tsx` — PHILOSOPHER_EPOCHS, счётчик, 2 колонки
    на мобильных;
  - `SectionPicker.tsx` — порядок/метки SECTION_CHECKBOX_IDS/SEC_ID_TO_KEY,
    secCtx-поля по кнопке «+», extGraphMetrics sync с графом;
    secSynthReady отложен к 1.5b/3.2 (принадлежит пулу);
  - `CostEstimate.tsx` — POST /syntheses/estimate, дебаунс 600 мс,
    сбой → «оценка недоступна» (не блокирует форму);
  - `CompatAdvisor.tsx` — панель data-severity, сворачивание, чипы
    (зеркало chipClassForRating в Tailwind-токенах); applyReplacement —
    TODO (кнопки замен, entry.replacements уже приходит);
  - `SectionWarnings.tsx` — три бокса ⚠/💡/⇄ из items {icon,text,severity};
  - `GenerationProgress.tsx` — шаги ◯/⟳/✓/⚠, счётчик символов, число
    подразделов, PauseBadge, «⏹ Остановить».
- `client/src/hooks/useStreamingGeneration.ts` — поверх useWebSocket (0.4);
  соединение сразу с `?resume={id}` (handleResume §3.3 кроет и первый
  заход, и реконнект), subscribe_generation на каждом open; состояние:
  sections/complete/totalUsage/pause/error; resumeGeneration/resumePlan/
  cancel.
- `client/src/pages/CreateSynthesisPage.tsx` — заглушка 0.4 заменена;
  PauseModal/PauseBadge интегрированы (TODO(1.5) из 1.4b закрыт);
  confirm деградации при skip; redirect на /synthesis/:id через 1.2 с
  после generation_complete.
- `server/routes/syntheses.ts` += POST /syntheses/estimate (зеркало
  конвейера generation-service: resolve→effective→order→defs→passes→
  buildSYS/baseCtxStatic→estimateCost, БЕЗ записей в БД; из вилки 07
  «сервер или клиентская копия» выбран СЕРВЕР — копия дрейфовала бы от
  Registry) и POST /syntheses/advice (getCompatEntryByKey +
  computeSectionAdvice; icon/title считает сервер, CSS-чипы — клиент,
  как решено в главе 1.1); POST /syntheses: свободный синтез без seed
  теперь отвечает кодом NO_PARTICIPANTS_SEED_REQUIRED (03 §4.3; ранее —
  общий VALIDATION_ERROR; ожидание test-14 R2 обновлено).
- `tests/test-15-requests2-7.mjs` — 40 браузерных проверок (мок SSE +
  реальный сервер :3000 + vite :5199 + puppeteer/системный Chromium),
  с БД-ассертами гранулярного парсинга ВНУТРИ теста
  (categories=10/edges=18/terms=10/theses=6).

## Адаптации DOM/DOC_STATE → сервис (решения беседы)

1. pausedState для PauseModal собирается из WS generation_paused +
   локального прогресса (passIdx/completedPasses/sectionLabel из
   done-шагов; genParams={} — возобновление серверное). Полный источник —
   GET /syntheses/:id, TODO(1.6) переключить.
2. Confirm деградации при skip [25686] — обобщённый текст без списка
   затронутых: точный расчёт требует resolvedDeps/substitution_map с
   сервера (эндпоинт-кандидат; advice уже рядом — расширить при 1.6/2.1).
3. Confirm «Остановить» скорректирован против исходника [24681]:
   cancel по §3.1 финализирует как stop БЕЗ паузы.
4. kind='plan' в потоке создания не возникает до 2.2 — минимальный
   PausedStatePlan собран на будущее; onResumePlan на странице —
   заглушка с warn (planId у формы нет).
5. Шаги прогресса предзаполняются ["sum", ...sections] из формы;
   сервер может изменить порядок (buildDynamicOrder) — шаги дозаводятся
   по сообщениям.
6. renderFullBudgetPreview/onKeepFullBudgetChange (превью веса
   родителей) — вместе с пулом (1.5b/3.2): без концепций превью пусто.

## Ревью по карте 04 (доля 1.5)

- §3 «Непереносимое»: форма/чекбоксы/прогресс-панель → SynthesisForm/
  PhilosopherPicker/SectionPicker/GenerationProgress ✓; submitBtn-механика/
  _rebuildProgressPanelForResume/_ensureDocBodyContainers — React-состояние ✓.
- §1.2: updateCompatAdvisor/toggleCompatPanel → CompatAdvisor.tsx ✓
  (toggle = collapse); updateSectionWarnings → SectionWarnings.tsx +
  серверный computeSectionAdvice (1.1) ✓; applyReplacement — НЕ портирован
  (TODO: кнопки «Рекомендуемые замены»; данные replacements уже в entry).
- Pause/Resume (строка §2.4): интеграция PauseModal/PauseBadge в
  страницы ✓ (TODO(1.5) закрыт).
- initLangUI/onLangSelect/saveLang (01 §4.15 п.6) ✓ — select + custom.
- estimateCost UI (§1.3) ✓ через серверный /estimate.

## Помодульно: что прикладывать в следующие беседы

- **1.5b (пул)**: SynthesisForm.tsx (пропс conceptParticipants — точка
  встраивания пула; keepFullBudget уже условен), api/syntheses.ts
  (participants в CreateSynthesisInput).
- **1.6 (просмотр/каталог)**: useStreamingGeneration.ts + PauseModal
  (страница синтеза должна подписываться так же и брать pausedState из
  GET /syntheses/:id — закрыть адаптацию 1), api/syntheses.ts
  (getSynthesis уже готов).
- **2.1/2.2**: точный confirm skip — расширение /advice списком
  затронутых при пропуске (адаптация 2).
- **2.3 (EditModal)**: CompatAdvisor/SectionWarnings как образец
  серверных советов + клиентского рендера.

## Знания/грабли, добытые в 1.5

1. Песочница: фоновый запуск (nohup/setsid + периодический опрос) НЕ
   работает — вызовы bash с длинным sleep возвращают −1, лог не
   материализуется, процесс сиротеет; весь прогон укладывать в ОДИН
   вызов (~165 с лимит); мок ускорять (45 мс/чанк).
2. innerText отдаёт текст ПОСЛЕ CSS text-transform (uppercase-заголовки
   эпох) — маркеры ожидания puppeteer сверять по textContent.
3. Сниффинг промпта в моке — только от lastIndexOf("ЗАДАНИЕ"): контекст
   предыдущих разделов выше по промпту содержит те же маркеры; хвост
   фиксированной длины тоже ломается (задание графа длиннее 4000).
4. parseGraph/element-parser требуют table class="doc-table" — мок без
   классов даёт ТИХИЕ нули в гранулярных таблицах; страховка — БД-ассерты
   внутри браузерного теста.
5. «Ложные» ошибки консоли dev-клиента: 403 fonts.googleapis (egress),
   401 /auth/me до логина (StrictMode).
6. vite dev на нестандартном порту: CLIENT_ORIGIN сервера выставлять
   на фактический origin браузера.

## Открытые TODO после 1.5

- TODO(1.5b): пул концепций в форме; secSynthReady; превью keepFullBudget.
- TODO(1.6): pausedState/estimates из GET /syntheses/:id вместо сборки
  из WS-сообщения; SynthesisPage вместо заглушки.
- TODO(2.x): applyReplacement (кнопки замен CompatAdvisor); точный
  confirm деградации при skip.
- Прочие TODO прежних бесед — без изменений.

# Беседа 1.5b — Unified Concept Pool (клиент) [ЗАКРЫТА]

## Созданные/изменённые файлы

- `client/src/utils/concept-file.ts` — клиентский парсинг концепт-файлов
  (порты 1:1, DOMParser нативен): TITLE_TO_KEY/titleToKey [5413],
  truncateText/tableToText/extractSection [7953–8010], extract{Glossary
  Compact,ThesesSummary,GraphNodesTable,GraphEdgesTable}, extractContext
  Fragment (урезан до 9 ключей importConceptAsParticipant; graph:nodes_top
  = top-7 по центральности [8255]), extractCapsuleText [11720],
  extractMetadata/Sections/EmbeddedState [21356–21543],
  importConceptAsParticipant [22009] (window.confirm мягких предупреждений
  1:1), parseConceptFile [4617], fetchWithFallback+CORS_PROXIES [21227]
  (statusEl → колбэк onStatus). Отступления: genealogy=null
  (reconstructGenealogy/restoreCapsulesFromHTML — TODO(3.1/3.2));
  extractThesesSummary undefined→null нормализован.
- `client/src/stores/pool-store.ts` — Zustand-стор пула:
  concepts/selectedConceptId/derived conceptParticipants
  (syncConceptParticipants = пересчёт в commit) /status; действия
  addToPool/removeFromPool/renamePoolConcept (prompt в компоненте)/
  toggleSynthParticipant (DOM-часть secSynthReady → эффект формы)/
  selectForViewing/refreshPoolParticipant/refreshAllSynthParticipants/
  prepareForGeneration (refreshAll + сброс ◉ перед POST); dev-хук
  window.__poolStore={get} (браузерные тесты; Node-безопасный гард —
  integration-check исполняет модуль под tsx).
- `client/src/components/pool/PoolCard.tsx` — карточка: 4 колонки
  ☑ Синтез (disabled при !participant, как [5258]) / ◉ Просм. (повторный
  клик = деселект, toggle в onClick как в исходнике) / инфо
  (метод×уровень·порядок·источники; ORDER_LABELS [5023] локально) /
  ✎ ✕; строка ⚠ причины непригодности.
- `client/src/components/pool/ConceptPool.tsx` — блок «Загруженные
  Концепции»: multiple-файлы (FileReader), URL-строка (togglePoolUrlRow),
  статус, карточки, саммари «N из M для мета-синтеза · ◉ имя — просмотр»,
  индикатор ◉ в шапке, read-only предпросмотр innerHTML #docOutput
  выбранной (dangerouslySetInnerHTML; script при innerHTML не исполняется).
  PoolSummary.tsx из 05 не понадобился — саммари одна строка.
- `SectionPicker.tsx` += secSynthReady: SYNTH_READY_SECTIONS [5114]
  дословно (graph/glossary/theses/dialogue/critique/capsule), чекбокс
  «◈ Пригодность к дальнейшему синтезу», подсказка про «Анализ названия»
  [5580] (selected уже в пропсах — рендер здесь).
- `SynthesisForm.tsx` — пропс conceptParticipants ЗАМЕНЁН стором (никем
  не передавался; точка встраивания 1.5 реализована); <ConceptPool />
  после PhilosopherPicker; эффект по ПЕРЕХОДУ hasSynthConcepts (ref):
  false→true → synthReady+SYNTH_READY_SECTIONS+статус пула [4744–4750],
  →0 → снять synthReady, разделы не трогать [4760]; ГЕЙТ: сабмит с
  ☑-концепциями блокируется с объяснением (ParticipantInput не
  представляет файловые концепции; сервер отклоняет type='synthesis'
  до 3.1/4.3); FullBudgetPreview — порт renderFullBudgetPreview [10456]
  без estimate-diff (TODO(3.1)); CONTEXT_BUDGET_PREVIEW —
  задокументированная клиентская копия [7529] (дрейф-риск, канон в
  Registry).
- `CreateSynthesisPage.tsx` — usePoolStore.getState().prepareForGeneration()
  перед POST.
- `client/src/vite-env.d.ts` — создан (первый import.meta.env клиента;
  без него tsc -b client падал TS2339).
- `server/integration-check.mts` += секция 4n (модули/экспорты 1.5b +
  контракты: гейт мета-синтеза, CONTEXT_BUDGET_PREVIEW локализован,
  prepareForGeneration перед POST, снимков нет, TODO(3.1/3.2) помечен,
  browser storage запрещён).
- `tests/smoke-15b-request1.mjs` — 38 сверок порта с исходником (vm,
  ОБЕ стороны на linkedom; стабы reconstructGenealogy→null с обеих
  сторон): побайтово 13 полей участника, top-7, непригодность (тексты
  ошибок равны), confirm-отмена → null, titleToKey.
- `tests/test-15b-requests2-5.mjs` — 35 браузерных проверок (сервер
  :3000 + vite :5199 + puppeteer/Chromium; сиды опциональны, БЕЗ
  ANTHROPIC_API_KEY: CostEstimate проверяется среда-независимо (оценка
  «≈ $…» на посеянном Registry / «оценка недоступна» на пустом), POST
  отбивается предпроверкой API_KEY_MISSING — генерация тестам не нужна,
  БД-страховка 0 строк).

## Адаптации DOM/DOC_STATE → сервис (решения беседы)

1. Снимки вырождены: локальных правок просматриваемой концепции в
   сервисе нет (правки — в БД, 2.x) → snapshotCurrentState/
   restoreFromPoolSnapshot не портированы; refreshPoolParticipant —
   ветка «rawHTML не менялся» (ранний return; ветка snapshot сохранена
   структурно); просмотр ◉ = read-only предпросмотр. Полный просмотр
   импортированного документа — 1.6 (SynthesisPage) + 4.3.
2. Гейт мета-синтеза: сабмит с ☑ блокируется до 3.1/4.3 (см. форму).
3. DOM-часть toggleSynthParticipant (secSynthReady+разделы) → эффект
   формы по переходу hasSynthConcepts; статусы пула сохранены.
4. renderFullBudgetPreview: React-компонент подписан на стор — явные
   вызовы из syncConceptParticipants не нужны; estimate-diff отложен
   (нужна серверная поддержка концепций — 3.1).
5. Тест 3 протокола («alert») недостижим из UI и в исходнике (disabled
   [5258]) → проверяется disabled+⚠+no-op+отсутствие alert.
6. prepareForGeneration = refreshAllSynthParticipants + сброс ◉ до
   POST (снимок текущей — N/A по п.1); очистка DOC_STATE.modes из
   первого запроса 1.5 не имеет аналога (модов у клиента ещё нет — 4.1).

## Ревью по карте 04 (доля 1.5b)

- Строка пула (11 функций): все портированы ✓, кроме вырожденных
  snapshotCurrentState/restoreFromPoolSnapshot (адаптация 1);
  renamePoolConcept/toggleSynthParticipant/setPoolStatus/
  refreshAllSynthParticipants — тоже ✓ (в строке 04 не значились).
- importConceptAsParticipant: клиентский порт файлового сценария ✓;
  серверный (из БД) — 3.1, как в 04.
- fetchWithFallback+CORS_PROXIES ✓ (в 04 отдельной строкой не значился).
- Осталось TODO: reconstructGenealogy/restoreCapsulesFromHTML (3.1/3.2);
  estimate-diff превью (3.1); кнопки замен CompatAdvisor (прежний TODO).

## Помодульно: что прикладывать в следующие беседы

- **1.6 (просмотр/каталог)**: ConceptPool.tsx (паттерн read-only
  предпросмотра → заменить на полноценный просмотр), pool-store.ts.
- **3.1 (мета-синтез, сервер)**: concept-file.ts (клиентские экстракторы
  = референс для loadConceptContext из БД; genealogy TODO), SynthesisForm
  (снять гейт: ParticipantInput расширить концепциями), FullBudgetPreview
  (подключить серверный estimate-diff).
- **3.2 (пул+дерево, клиент)**: pool-store.ts + dev-хук __poolStore;
  PoolCard/ConceptPool как база.
- **4.3 (импорт, сервер)**: parseConceptFile/importConceptAsParticipant
  из concept-file.ts — референс серверного парсера файлов.

## Знания/грабли, добытые в 1.5b

1. Эвристика «последний матчащий div» для поиска карточки в puppeteer —
   ФЛАК; детерминированный селектор: radio[name=poolView] →
   closest("div.rounded.border") → find по имени.
2. Гонка «клик в окно disabled fieldset» сразу после сабмита: input
   внутри disabled fieldset игнорирует click() при
   input.disabled===false; нестрогий матч ошибки (/ключ|key/i)
   пропускал тест раньше рендера serverError. Лечение: строгое ожидание
   «API-ключ» + fieldset.disabled===false + helper poolAct (клик с
   верификацией эффекта, до 3 попыток с логом [retry]; за финальные
   прогоны — 0 ретраев).
3. import.meta.env в клиенте: (а) требует vite-env.d.ts для tsc;
   (б) в Node (tsx, integration-check) import.meta.env — undefined:
   гард сперва typeof window, затем (import.meta as {env?}).env?.DEV.
4. linkedom-смоук: обе стороны сверки держать на ОДНОМ DOM (innerText
   ≈ textContent — грабля 1.3), стабы недостающих функций (reconstruct
   Genealogy) ставить ОБЕИМ сторонам.
5. PG/Redis не переживают пауз между bash-вызовами песочницы — поднимать
   в каждом вызове с прогоном; сиды integration-check нужны (живые
   конвейеры 5h/5i), браузерному тесту 1.5b — нет.

## Открытые TODO после 1.5b

- TODO(3.1): снять гейт мета-синтеза в SynthesisForm; серверные
  концепции-участники; estimate-diff в FullBudgetPreview;
  reconstructGenealogy.
- TODO(3.2): restoreCapsulesFromHTML; полный пул с деревом.
- TODO(1.6): полноценный просмотр импортированной концепции вместо
  read-only предпросмотра.
- TODO(4.3): серверный импорт файлов (parseConceptFile как референс).
- Прочие TODO прежних бесед — без изменений.

## Патч доков по итогам 1.5b

Снят `scripts/patch-docs-conv15b.py` (идемпотентный, skip/fail-отчёт;
прогон 2 — чистый skip): 07 «По факту 1.5b» + §11 (1.5b в обе ветки
графа), 05 (pool-store/concept-file/vite-env/судьба PoolSummary),
04 (фактические файлы пула; клиентский порт importConceptAsParticipant),
фрагмент (ложный [poolIdx] помечен; дописаны 4 недостающие функции),
эта глава. При переупаковке архивов скрипт оставлять.

# Межбеседное обслуживание после 1.5b — раскладка тестов [ЗАКРЫТО]

По запросу пользователя тесты/патчи сведены к единой раскладке; README
актуализирован (беседа 1.5b, структура, регрессия).

## Маппинг перемещений (старое → новое)

- Корень репо → tests/: smoke-12-request1.mjs, smoke-13-request1.mjs,
  test-11-request2…7.mjs, test-12-requests2-8.mjs,
  test-13-requests2-7.mjs, test-14-requests2-8.mjs
  (спецификаторы "./server/ → "../server/; test-11-request5 —
  и "./packages/ → "../packages/).
- scripts/ → tests/: test-custom-type-0.3b.ts, test-normalize-0.3b.ts
  (импорты не менялись — та же глубина "../server/…").
- server/ → tests/: smoke-1.4.mts, smoke-1.4b.mts ("./services|db|utils/
  → "../server/…"; чтение исходника join(here,"..","source") валиден с
  той же глубины).

## Починенные ЛАТЕНТНЫЕ поломки (существовали до переезда)

tests/test-05-request2/3/4.mjs и tests/test-06-request2-api.mjs
импортировали "./server/…" — были незапускаемы со своего места
(когда-то переехали в tests/ без правки путей). Починены; контрольный
прогон test-05-request2 — 9/9 ✓.

## Правила раскладки (для следующих бесед)

- tests/ — ВСЕ тесты бесед; запуск из корня репо (CWD-зависимые
  readFileSync("source/…") законны); файл-относительные импорты —
  строго "../server/…", "../packages/…", "../client/…".
- server/audit.mts + server/integration-check.mts — workspace-регрессия,
  остаются в server/ (npm -w server, tsconfig.checks.json).
- scripts/ — сиды, экстракторы, идемпотентные патчи доков.
- tests/package.json (type=module) обязателен: без него tests/*.ts под
  NodeNext — CommonJS (TS1295).
- scripts/tsconfig.json типочекает scripts/*.ts + ../tests/*.ts +
  ../tests/*.mts (jsx=react-jsx — smoke-1.4b.mts импортирует
  PauseModal.tsx); закрыта дыра: smoke-1.4*.mts раньше не типочекались
  нигде.

## Верификация переезда

typecheck + typecheck:scripts 0 ошибок; audit «расхождений не найдено»;
INTEGRATION OK; перемещённые: smoke-1.4 8/8, smoke-1.4b 27/27,
smoke-12 121/121, smoke-13 92/92, test-11-request2 9/9,
test-normalize-0.3b OK, test-05-request2 9/9 (латентный);
неперемещённые 1.5b: смоук 38/38, браузерный 35/35.
Доки/README — scripts/patch-docs-repo-layout.py (идемпотентный).

---

# Предподготовка бесед 1.6 / 1.6b / 1.7 — аудит и разделение [ЗАКРЫТА]

Беседы не велись: это аудит комплекта документации на готовность к
клиентским беседам Фазы 1 и предпатч по его итогам
(`scripts/patch-docs-conv16-pre.py`, идемпотентный, skip/fail-отчёт).

## Системный дефект

07 писался так, будто REST-слой чтения уже существует. Дефект
повторился трижды: 1.6 (просмотр/каталог), 1.7 (граф) и — в 06 — 1.8
(каталог). Реализованы на момент аудита были только `POST /syntheses`,
`/estimate`, `/advice`. **Проверить тем же способом 2.3, 2.4 и 3.2 до
того, как за них браться.**

## Принятое решение

Беседа 1.6 разделена по шву сервер/клиент:

| Беседа | Содержание |
|---|---|
| **1.6** | Транспорт чтения (сервер): `routes/syntheses.ts` (GET список / public / `:id`, PATCH, DELETE), новый `routes/sections.ts`, GET-часть `routes/elements.ts`, `doc_num` в POST, режим «только подписка» в `ws/handler.ts` |
| **1.6b** | Просмотр документа + каталог (клиент): CSS документа, `document/` ×5, `catalog/` ×2, `SynthesisPage`, `CatalogPage`, `api/sections.ts`, `synthesis-store.ts` |
| **1.7** | Граф категорий (клиент): теперь чисто клиентская, плюс `client/api/elements.ts` и зависимости three/d3 |

Обоснование: разные харнессы тестов (mini-Hono + живой PG против
puppeteer + vite + Chromium), почти непересекающиеся комплекты
вложений, риск сжатия контекста в одном заходе, прецедент 0.5/0.6.
GET `/categories` отдан серверной 1.6, а не 1.7: в `routes/` уже открыт
тот же слой, и одним заходом закрываются syntheses + sections +
categories. PATCH-часть `elements.ts` честно остаётся 5.1.

## Что было не так (и чем закрыто)

1. Серверной части бесед не существовало в 07 → беседа 1.6.
2. `server/routes/sections.ts` не создавала ни одна беседа (класс
   `routes/taxonomy.ts`) → беседа 1.6.
3. `GET /syntheses/:id/categories` рождался в 5.1 — через две фазы
   после графа → перенесён в 1.6.
4. `client/api/elements.ts` не создавал никто (5.2 — «расширение») →
   создаётся в 1.7.
5. `three` (r128) и `d3` (7.8.5) отсутствуют в `client/package.json`;
   исходник грузил их с cdnjs, а CDN закрыт egress-прокси → пункт 0
   первого запроса 1.7.
6. Кнопки экспорта MMD/PNG/JSON в GraphModal конфликтовали с 4.2 и в
   фрагмент 1.7 не входят (обрыв на 16366, `exportMMD` с 16370) →
   заглушки с TODO(4.2).
7. «Исходник: НЕ НУЖЕН» у 1.6 — неверно; фрагмента не было → создан
   `1.6-document-view.js`.
8. graph-STATE (`G`, `roleMode`, `legendFilter`, `clearLegendFilter`)
   лежит вне фрагмента 1.7 → создан `1.7-graph-state-extras.js`.
9. `doc_num` есть в схеме и shared-типе, но не заполнялся никем и
   отсутствовал в 03 §2.2 → пункт 4 запроса 1.6 + правка §2.2.
10. `contextQualityScore` обязателен в §2.3, а `context-quality.ts` —
    беседа 2.4 → явное `null` + TODO(2.4).
11. Правила доступа к чужому публичному синтезу не заданы; `PATCH
    /syntheses/:id` не назначен никому → §2.2/§2.4 + запрос 1.6.
12. §2.2: `items: Synthesis[]` — несуществующий тип.
13. Оценки паузы из TODO(1.6) некуда было положить → `pauseEstimates`
    в `SynthesisFull`.
14. `subsections` не было в `SectionSummary` → добавлено (нужно TOC).
15. `subscribe_generation` при `generating` без активного прогона
    ЗАПУСКАЕТ генерацию → режим «только подписка» (пункт 5 запроса 1.6).
16. Футер исходника пересчитывает стоимость из токенов → берём
    `total_cost_usd` из БД.
17. §11 занижал зависимости; ссылки «(из 1.6)» в Фазе 5 указывают на
    клиентские файлы → перенумерованы в 1.6b.
18. `scripts/extract-fragments.py` отсутствует в репозитории →
    предупреждение в 07.

## Карта исходника для 1.6b (диапазоны выверены)

- CSS документа — **476–929** (с 931 начинается граф-модалка 1.7):
  `.doc-header/.doc-type/.doc-title/.doc-subtitle/.doc-meta-*` [482–555],
  `#docTOC/.toc-*` [556–624], **ядро** `.doc-section/.section-num/
  .section-title/.doc-content/.doc-table/.callout*` [625–757],
  `.risk*` [790–814], `.doc-footer/.validity-stamp` [855–886],
  `.actions-bar/.action-btn` [887–929]; legacy `.sig-block*` [758–789]
  и `.graph-node/.graph-edge` [815–836] нужны только импортированным
  документам. Отдельно `.doc-title-edit-btn` [3304–3319],
  `.import-indicator` [2631–2650] (это уже 4.3).
- Разметка-эталон — **4134–4220**.
- JS-блок «HELPER: раскрывающиеся поля шапки и разделов» —
  **11594–11892** целиком: `makeHeaderDisclosure` [11599],
  `buildDocHeaderExtras` [11613], **`buildTableOfContents` [11621–11712]**
  (якоря `#sec-{key}` и `#subsec-{key}-{slug}` со slug'ом «не-буквенно-
  цифровое → _», пропуск `capsule`, метки `KEY_LABELS`, подразделы из
  `buildSubsectionMap`, кнопки ⏫), `extractCapsuleText` [11720]
  (уже портирован в 1.5b — `client/src/utils/concept-file.ts`),
  `updateCapsuleInHeader` [11773], `removeCapsuleFromDocBodies` [11822],
  `makeSectionCtxDisclosure` [11832], `editDocTitle` [11845],
  `updateDocTitleFromName` [11871].
- Заполнение шапки при старте — **12110–12144** (формат docNum, дата
  ru-RU, ML/DL/SL, три ветки подзаголовка, `footerPhil`).
- `updateFooterCost` — **5671–5683**.
- НЕ портировать: `rebuildDbMapping` [5686] и индексацию `db{N}` /
  `DOC_STATE.sectionDbIdx` — React адресует разделы по `key`.

## Карта исходника для 1.7

- Основной фрагмент `1.7-graph-viz.js` — **12990–16366**, и он полон:
  `_TC_HUE_SEEDS`/`_EC_*`/`CPAL` [13001–13116], `_rebuildNodeColors`
  [13010], `_rebuildEdgeStyles` [13070], `_hexToHSL`/`_blendHex`
  [13139/13176], `edgeTypeStyle` [13198], `typeColor`/`typeColorHex`
  [13534/13547], `getStructuralMarkers` [13565], `polyPath` [13649],
  `nodeSymbolPath` [13683], `nodeGeometry3D` [13707], `warmup` [13759],
  `build3D`, `build2D`, `showNodePanel`, `showEdgePanel`, `buildLegend`.
- Вне его — только graph-STATE **4389–4413** (`G`, `graphAPI3d/2d`,
  `roleMode`, `clusterVisible`, `legendFilter`, `clearLegendFilter`).
- `exportMMD` начинается с **16370** — намеренно вне фрагмента,
  принадлежит беседе 4.2.

## Что предпатч НЕ делает (задачи самих бесед)

- Реализация роутов, страниц и графа; перенос CSS в `globals.css`.
- Установка three/d3 в `client/package.json` (патч доков код не трогает).
- Заполнение `doc_num` в POST /syntheses.
- Режим «только подписка» в `ws/handler.ts`.
- Восстановление `scripts/extract-fragments.py` — задача эксплуатации.

---

# Предподготовка бесед 2.3 / 2.4 / 3.2 — аудит [ЗАКРЫТА]

Продолжение аудита, начатого перед 1.6 (см. главу «Предподготовка бесед
1.6 / 1.6b / 1.7»). Предпатч: `scripts/patch-docs-conv23-pre.py`,
идемпотентный, применяется СТРОГО ПОСЛЕ `patch-docs-conv16-pre.py`
(проверка порядка встроена).

## Гипотеза подтвердилась частично

Сплошного дефекта «UI-беседа без транспорта», как в 1.6/1.7, здесь НЕТ:
Фазы 2 и 3 спроектированы «бэкенд → клиент» и порядок держат.
`routes/plans.ts` создаёт 2.1 и расширяет 2.2; `routes/lineage.ts` —
3.1. Остались три других класса дефектов.

### I. Инверсии зависимостей

- **2.3 ← 2.4**: бейдж качества контекста в `EditSectionCard` требует
  `context-quality.ts`, который создаётся беседой 2.4. Признано в самих
  доках, но порядок не менялся. Решение: рекомендация вести 2.4 перед
  2.3 (§11, критический путь), а при сохранении прежнего порядка — 2.3
  корректно рисует состояние «нет оценки» по `null`.
- **2.4 → 4.2**: `formatPromptsForExport` обязан использовать
  `reconstructSkeleton()` как fallback, а `prompt-reconstruction.ts`
  создаётся беседой 4.2 — на полторы фазы позже. Решение: fallback в
  2.4 НЕ делается, записи без `_promptSkeleton` помечаются, TODO(4.2).

### II. Бесхозные эндпоинты и незаполняемые поля

- `GET /syntheses/:id/sections/:key/context` (03 §2.3) не создавала ни
  одна беседа. Первый предпатч утверждал «остаётся беседам 2.3/2.4» —
  **это было допущением, а не проверенным фактом**. Отдан беседе 1.6.
- `syntheses.structure_sections`: колонка есть в схеме и в 02, но во
  всём `server/` в неё нет ни одной записи. Карточка «Структура
  документа устарела» (2.3) всегда попадала бы в ветку null. Снимок
  назначен беседе 1.6 (при создании) и 2.2 (после исполнения плана).
- Live-обновление лога «по WebSocket» не имело транспорта: в
  `shared/types/ws-messages.ts` нет ни одного сообщения про лог.
  Решение: перезапрос `/logs/formatted` по существующим событиям
  завершения раздела, новых типов сообщений не вводить.

### III. Устаревание заданий после проведённых бесед

- 3.2 просила СОЗДАТЬ `ConceptPool.tsx`, который уже создан беседой
  1.5b и лежит в репозитории вместе с `PoolCard.tsx`, `pool-store.ts`,
  `concept-file.ts`. Пункт 1 переписан как ДОПОЛНЕНИЕ существующего
  пула (генеалогические пересечения, снятие блокировки сабмита, порт
  `reconstructGenealogy`).
- 3.2 требовала `snapshotCurrentState`/`restoreFromPoolSnapshot`,
  которые в 1.5b намеренно не портированы (снимки вырождаются).
  Патч `patch-docs-conv15b.py` поправил формулировки только в секции
  1.5b, из-за чего 07 противоречил сам себе. Снято.

**Это будет повторяться:** каждая закрытая беседа делает соседние
секции 07 чуть менее верными. Перед началом ЛЮБОЙ беседы имеет смысл
сверять её первый запрос с фактическим состоянием репозитория, а не
только с документами.

## Мелочи, попутно исправленные

- Сбитая нумерация первого запроса 2.4: два пункта под номером «3»
  (перенумерованы 3→4→5→6).
- Первый предпатч внёс в тесты беседы 1.6b литеральные обратные слэши
  (`вкладка \"Мои\"` вместо `вкладка "Мои"`) — в исходном 07 такой
  последовательности не было ни разу. Причина: `\\"` вместо `\"` в
  Python-строке. Исправлено; проверка `grep -c '\\"' docs/07-*.md`
  должна давать 0.

## Что предпатч НЕ делает

- Не меняет фактический порядок бесед — только фиксирует рекомендацию
  и зависимости; решение за ведущим.
- Не трогает код: заполнение `structure_sections`, роут
  `/:key/context`, `context-quality.ts` — задачи соответствующих бесед.
- Не проверял беседы Фаз 4–6 (4.1, 4.3, 5.x, 6.x) — там тот же
  контроль стоит провести отдельно.

---

# Аудит Фаз 2–6 и сверка с репозиторием [ЗАКРЫТА]

Завершение аудита, начатого перед беседой 1.6 (см. две предыдущие
главы). Предпатч: `scripts/patch-docs-conv46-pre.py`, применяется после
`patch-docs-conv16-pre.py` и `patch-docs-conv23-pre.py` (проверка
порядка встроена).

## Метод и его граница

Механическая сверка по всем 32 беседам: пути файлов из блоков «Контекст»
против блоков «Первый запрос» (кто создаёт / кто ссылается), плюс все 83
эндпоинта 03 против текста бесед. КАЖДОЕ срабатывание проверено вручную —
доля ложных тревог была высокой из-за неоднородной нотации в 07 (где-то
`client/components/document/SectionView.tsx`, где-то просто
`SectionView.tsx`). Метод ловит наличие дыры, но не гарантирует её
отсутствие: пропуски он допускает.

## Найдено в Фазах 4–6

1. **`server/routes/prompts.ts` — бесхозный модуль.** Числится в 05, не
   создаётся никем; за ним висят пять эндпоинтов (§2.9 Prompts, §2.11
   Configs) и вся серверная часть админки промптов. Отдан беседе 6.1.
2. **`PATCH /syntheses/:id/edges/:edgeId`** (v10) отсутствовал в списке
   беседы 5.1, хотя `routes/elements.ts` создаёт она.
3. **`POST /syntheses/:id/duplicate`** не был упомянут в 07 нигде.
   Отдан серверной беседе 1.6.
4. **Сбитая нумерация в 6.1** (два пункта «4»). Вместе с 2.4 это два и
   только два таких случая на весь документ.
5. **Ретрофит `billing-check`**: middleware из 6.1 обязан обернуть роуты
   генерации из 1.4/1.6 и 2.2 — Фаза 6 правит код закрытых бесед.
   Единственный такой случай; теперь оговорён.

Инверсий уровня «2.3 ← 2.4» или «1.7 ← 5.1» в Фазах 4–6 НЕТ. 4.2 создаёт
и сервисы, и `routes/export.ts`, и кнопки; 4.3 не дублирует
`concept-file.ts` из 1.5b (там клиентский предпросмотр, здесь серверный
импорт — разные среды); 5.1→5.2→5.3→5.4 идут «бэкенд → клиент».

## Сверка репозитория с этим журналом

Прогнано в песочнице после `npm ci`:

- `npm run typecheck` (shared + server + client + tsconfig.checks) — **0 ошибок**;
- `npm run build -w client` — **чисто**, 320 кБ / 100 кБ gzip;
- `npm run audit -w server` — **«расхождений не найдено»**;
- все 115 путей, упомянутых в журнале, на месте; мнимые пропажи —
  исторические пути тестов до переезда в `tests/` и `routes/taxonomy.ts`
  (известная дыра 0.3b, отданная беседе 5.3);
- `pool-store` без `snapshotCurrentState`, `concept-file` с 16
  экспортируемыми функциями — совпадает с заявленным.

НЕ проверено: `check:integration` и браузерные тесты — в песочнице нет
PostgreSQL, Redis и Chromium. Эти утверждения журнала остаются на
прогонах разработчика.

## Долги в коде

Открытые `TODO` по будущим беседам на 2026-07-30:

```
TODO(6.1)      12      TODO(2.2)       6
TODO(3.1)      12      TODO(2.1)       6
TODO(4.2)      10      TODO(2.4)       4
TODO(3.1/3.2)  10      TODO(4.3)       1
TODO(1.6)       9      TODO(3.2)       1
```

- Девять `TODO(1.6)` после разделения беседы адресуют несуществующую
  беседу — развести между 1.6 и 1.6b (пункты добавлены в обе).
- `TODO(1.5)` в `PauseModal.tsx` («confirm деградации зависимостей при
  skip» [25686]) адресован ЗАКРЫТОЙ беседе — переадресован в 2.2.
- Упоминания `TODO(1.3)`, `TODO(1.4)`, `TODO(1.5b)` — исторические
  пометки «закрыто», а не живые долги. Проверено.

## Статусы, не требующие правок

- `POST /auth/password-reset/*`: в 03 помечены «A2a, Фаза 3» — это фаза
  ПРОДУКТА, не беседа протокола. Беседы под них нет; при выходе за MVP
  её надо завести отдельно. Статус проставлен в 03, чтобы не искать заново.
- `POST /syntheses/estimate` и `/advice`: реализованы беседой 1.5, и 03
  это фиксирует. Не знал только 07 — добавлено в запись ревизии.
- `server/audit.mts` запускается как `npm run audit -w server`; README
  это описывает. Претензия про рабочий каталог снята.

## Что осталось за пределами аудита

Проверялись состав бесед и связи между ними, а не содержательная
правильность заданий. Соответствие первых запросов исходнику
`philosynth.html` выборочно проверялось только для 1.6b и 1.7.

---

# Сверка NEXT-CONTEXT ↔ 07: потерянные адресаты [ЗАКРЫТА]

Четвёртый и последний предпатч аудита: `scripts/patch-docs-debts-pre.py`
(после 16pre → 23pre → 46pre, проверка порядка встроена).

## Почему понадобился

Первые три предпатча опирались в основном на механическую сверку — пути
файлов и эндпоинты. Она не видит долгов: те записаны в журнале именами
функций и формулировками задач («снять гейт мета-синтеза», «ввод ключа
в auth-модалке»). Ручное чтение разделов «Открытые TODO после X» всех
семи глав дало семь долгов, которых в 07 не было НИ РАЗУ.

## Механизм потери

Долг заводится беседой A, адресуется беседе B, беседа B его не делает и
переадресует беседе C. На втором шаге адрес размывается, на третьем
исчезает. Крайний случай:

    applyReplacement / updateCompatAdvisor / toggleCompatPanel
    1.1 → «клиент, 1.5» → 1.5 не сделала → «TODO(2.x)» → нигде

«2.x» — не адрес. В протоколе этих функций не было ни разу, при том что
серверная половина (`POST /syntheses/advice`) готова с беседы 1.5.

## Что внесено

| Долг | Куда отдан |
|---|---|
| `setPlanResumeExecutor` | 2.2 |
| `registerParentContextProvider`, `parentFieldsUsed`, `conceptBlockSizes`, `parentSpecBySection` | 3.1 |
| Серверные участники-концепции (снятие гейта мета-синтеза) | 3.1 (сервер) + 3.2 (клиент) |
| Данные и отрисовка `estimate-diff` | 3.1 + 3.2 |
| `applyReplacement` / `updateCompatAdvisor` / `toggleCompatPanel` | 3.2 |
| Форма ввода ключа в auth-модалке | 6.2 |

Выбор адресатов: 3.2 — единственная непроведённая беседа, правящая
`SynthesisForm.tsx`; 6.2 — единственная клиентская в Фазе 6.

## Исправление второго предпатча

`restoreCapsulesFromHTML`: журнал 1.5b адресует его беседе 3.2, а второй
предпатч написал в 07 «остаётся отложенным до 4.3» — расхождение,
внесённое без сверки с журналом. Возвращён беседе 3.2; за 4.3 остаётся
серверный импорт файлов.

## Профилактика: 07 §12 «Реестр открытых долгов»

Сводная таблица «долг → адресат → кем заведён → состояние», 20 строк.
В §10 (чек-лист беседы) добавлена обязанность вносить долг в реестр с
ЯВНЫМ номером адресата и вычёркивать закрытый. Адрес без номера
(«2.x», «позже») запрещён: если адресата нет, долг остаётся за текущей
беседой.

## Наблюдение

**Беседа 3.1 — узел накопления:** к ней адресуются главы 1.2, 1.3, 1.4 и
1.5b, а её первый запрос в 07 выглядит скромно. Начав её «как написано»,
четыре накопленных требования не всплыли бы вовсе.

## Граница аудита

Проверены состав бесед, связи между ними и адресация долгов.
Содержательная правильность заданий — соответствие первых запросов
исходнику `philosynth.html` — проверялась выборочно, только для 1.6b и
1.7. Это остаётся неохваченным.

---

# Ссылки на исходник: имена вместо номеров строк [ЗАКРЫТА]

Пятый предпатч: `scripts/patch-docs-extract-by-name.py` (после 16pre;
проверка порядка встроена) плюс новый инструмент
`scripts/extract-by-name.py` и две спецификации
`docs/fragments-for-conversations/*.spec`.

## Что проверено

- **Карта 04 как индекс — чистая.** 229 идентификаторов, 224 найдены в
  `source/philosynth.html` буквально. Из пяти «ненайденных»:
  `categories` и `glossary_terms` — имена таблиц БД;
  `parseFragment`, `spliceSubsectionHtml`, `removeSubsectionHtml` —
  ЦЕЛЕВЫЕ имена нового кода (правая колонка карты), все три существуют
  в `server/utils/html-parser.ts`. Ошибок в карте нет.
- **Исходный 07 тоже именной:** 33 блока извлечения через
  `grep -n '…'` против ОДНОГО фиксированного диапазона.
- **Хрупкую форму внёс аудит, а не авторы протокола.** Шесть
  диапазонов `sed -n 'A,Bp'` для беседы 1.6b и один для 1.7 добавил
  первый предпатч. Против текущей ревизии они верны (границы выверены
  вручную и подтверждены сборщиком), но рассыпались бы при первой
  правке исходника.

## Новый сборщик

`scripts/extract-by-name.py SPEC [-o ФАЙЛ] [--check]`. Виды целей:

```
js:имяФункции        function / async function, границы по балансу скобок
var:ИМЯ              const/let/var, включая продолжение списка через запятую
css:.селектор        одно правило
css*:.префикс        все правила, чей селектор содержит префикс
html:#id             элемент с данным id и всё поддерево
scope:начало..конец  сузить область поиска двумя якорями-регулярками
lines:A-B            только там, где именованного якоря нет
```

Сканер знает про строки (`'"` и backtick), про `//` и `/* */`, поэтому
не сбивается на скобках внутри них. Номера строк печатаются как
РЕЗУЛЬТАТ поиска и попадают в шапку каждого блока фрагмента.

## Проверка на живых данных

Спецификация `1.6-document-view.spec` (87 целей) собрала фрагмент,
который **полностью покрывает** прежний, нарезанный по диапазонам, за
одним осмысленным исключением: `updateModeButtons` (47 строк) в новый
фрагмент не попал — эта функция относится к режимам (беседа 4.1) и была
захвачена диапазоном как попутный груз. То есть именная сборка оказалась
не только устойчивее, но и точнее.

Остаточных диапазона в спецификации два, оба помечены: заполнение шапки
при старте генерации и разметка панели действий — последовательности
операторов без именованных якорей.

`1.7-graph-state-extras.spec` — три цели (`G`, `clusterVisible` вместе с
`roleMode` и `legendFilter` в одном объявлении, `clearLegendFilter`),
покрывает прежний диапазон 4389–4413 полностью.

## Правило на будущее

В §10 (чек-лист беседы) внесено: ссылаться на имена из карты 04;
фиксированный диапазон допустим только при отсутствии именованного
якоря и должен быть помечен как устаревающий.

Старые фрагменты, нарезанные по баннерам, остаются как есть — их имеет
смысл пересобирать по мере надобности, а не разом. Полная спецификация
для `1.7-graph-viz.js` (около 40 функций графа) не написана: это
следующий естественный шаг, если решите переводить комплекты на имена
целиком.


---

# Беседа 1.6 — транспорт чтения (сервер) [ЗАКРЫТА]

## Созданные/изменённые файлы

- `server/routes/syntheses.ts` (расширение): GET `/` (page/limit/sort/order/
  status/method/search; whitelist сортировок createdAt/updatedAt/title/
  method/status; ilike `%…%` по title — использует gin_trgm), GET `/public`
  (+ `?philosopher=` точным именем через EXISTS по lineage), GET `/:id`
  (SynthesisFull + pausedState + pauseEstimates), PATCH `/:id`
  {title?,isPublic?} (владелец; title trim/непустой/≤300), DELETE `/:id`
  (владелец; активная генерация → 409), POST `/:id/duplicate`; POST `/`
  += `docNum: makeDocNum()` [12110] и `structureSections: ["sum",...]`.
  Экспортированы helpers для соседних роутов: `loadSynthesisForRead`
  (владелец ИЛИ is_public → ok/notfound/forbidden; не-UUID → notfound без
  22P02), `makeDocNum`, `isUuid`, `notFoundJson`, `forbiddenJson`.
- `server/routes/sections.ts` (НОВЫЙ): GET `/:id/sections` (порядок
  sectionOrder, чужие ключи в хвост по sectionNum; contextQualityScore=null
  TODO(2.4); subsections через parseSubsectionsFromHTML с expected из
  самого HTML), GET `/:id/sections/:key` (SectionFull), GET
  `/:id/sections/:key/context` — ЖИВОЙ buildContextForSection (p из
  строки+lineage; ctxLog=null → нулевой превью; сбой → 500 fail-safe).
- `server/routes/elements.ts` (НОВЫЙ): только GET `/:id/categories` →
  GraphData; topology: роли-объединение в порядке появления,
  hasReflexiveEdges по рёбрам ИЛИ флагу категорий. PATCH-часть — 5.1.
- `server/ws/handler.ts`: `viewOnly` в subscribe_generation — подписка без
  запуска generateSynthesis (ветка ДО запуска; без флага — поведение 1.4).
- `server/index.ts`: sectionsRoutes/elementsRoutes под /api/v1/syntheses
  (после synthesesRoutes; внутри syntheses GET /public строго ДО /:id).
- shared: `SynthesisFull.pauseEstimates: PauseEstimates|null`,
  `SectionSummary.subsections: string[]`,
  `WsSubscribeGeneration.viewOnly?: boolean`.
- `server/audit.mts`: typeOnly syntheses += pauseEstimates (вычисляемое).
- `server/integration-check.mts`: секции 2k/4o/5n (+4m: срез /estimate
  ограничен началом блока 1.6 — duplicate ниже ложно срабатывал).
- Клиент (пункт 8): 8 маркеров «1.6» переадресованы в 1.6b/2.1
  (useStreamingGeneration, ConceptPool, api/syntheses, CreateSynthesisPage,
  CatalogPage×2, SynthesisPage×2); grep TODO\(1.6\) по дереву = 0
  (страховка — walker в 4o).
- `tests/test-16-requests2-9.mjs`: 84 проверки ×3 прогона (R2–R9 +
  [extra] duplicate и /:key/context).
- `scripts/patch-docs-conv16.py`: идемпотентный apply/skip-скрипт;
  11 правок на закрытии, дорабатывался после (16/K–16/W: §12 и README
  целиком, семантика параметров списков в 03 §2.2, optional-переходники
  против регресса самоподсчёта). Контроль — чистый skip по всем правкам
  на тройном прогоне чистой git-копии.

## Адаптации/решения беседы

1. `/:key/context` — живой расчёт вместо «последней записи context_log»
   (07): contextText в context_log НЕ хранится; ответ = CtxLogDraft (03
   §2.3 соблюдён дословно). Правка 07 — 16/B.
2. `subsections`: expected для parseSubsectionsFromHTML — из самого HTML
   (buildSubsectionMap тянет Registry+params; TOC нужны фактические якоря).
3. `duplicate`: только владелец; генеалогия РОДИТЕЛЕЙ копируется,
   lineage-связи с оригиналом нет; логи не копируются; pausedState
   копируется (genParams id-независимы); generating → 409.
4. viewOnly-флаг вместо отдельного WS-сообщения (обратная совместимость).
5. parseSubsectionsFromHTML в 07 числился в context-extractor — фактически
   generation-service (правка 16/A).

## Ревью по карте 04 (доля 1.6)

- Портирован единственный фрагмент исходника — формула docNum из
  заполнения шапки [12110] (строка §3 «docNum генерирует сервер в беседе
  1.6» ✓); остальная шапка [12110–12144] — клиент, 1.6b.
- Всё прочее — «новое» по §4 (routes/*.ts: в исходнике нет бэкенда);
  переиспользованы порты прежних бесед: parseSubsectionsFromHTML (1.4),
  buildContextForSection (1.3), computePauseEstimates (1.4b),
  resolveContextDeps/buildEffectiveDeps (1.1).
- Непортированных функций карты за беседой не осталось.

## Помодульно: что прикладывать в следующие беседы

- **1.6b (просмотр/каталог)**: routes/syntheses.ts + routes/sections.ts
  (контракты ответов), shared/types synthesis/section/ws-messages,
  client/api/syntheses.ts (getSynthesis готов), useStreamingGeneration +
  PauseModal (переключить источник pausedState на GET /:id — TODO(1.6b)),
  использование viewOnly при подписке страницы просмотра; исключение
  ключа capsule при рендере — клиентское.
- **1.7 (граф)**: routes/elements.ts (контракт GraphData),
  shared/types/graph.ts.
- **2.2 (plan-executor)**: обновление structure_sections после исполнения
  плана (снимок при создании уже пишется — 1.6).
- **2.3 (EditModal)**: контракт SectionContextPreview
  (/sections/:key/context) — поле контекста в EditSectionCard.
- **2.4 (context-quality)**: заменить `contextQualityScore: null` в
  routes/sections.ts на getSectionContextQuality (метка TODO(2.4) в коде).
- **4.3 (импорт)**: POST /syntheses/import — последний нереализованный
  эндпоинт §2.2; транзакция duplicate — референс копирования с ремапом id.
- **6.x**: наблюдение — HTTP-лимитер фактически per-IP (примечание в 03
  §3.4); перенос подсчёта после auth — кандидат в Фазу 6.

## Знания/грабли, добытые в 1.6

1. SIGTERM npx-обёртке НЕ убивает node-ребёнка tsx — сирота держит порт, и
   следующий тестовый прогон молча работает о ЧУЖОЙ сервер. Лечение:
   spawn(process.execPath, ["--import","tsx","index.ts"]) — процесс и есть
   сервер (SIGKILL ему), плюс преflight «health уже отвечает → стоп».
2. HTTP-лимитер (0.2) ключуется по IP даже у аутентифицированных
   (requireAuth в роутах ПОСЛЕ middleware): окно 60/мин на общем 127.0.0.1
   выбивало соседние тестовые прогоны 429-ми, маскируясь под 403/500.
   В тестовом env поднимать RATE_LIMIT_HTTP_PER_MINUTE.
3. Hono: GET /public и GET /:id оба матчат /syntheses/public — приоритет у
   зарегистрированного раньше; порядок регистрации закреплён проверкой 4o.
4. Старые «до конца файла» срезы integration-check ломаются при дописывании
   роутов в тот же файл (4m ловил duplicate как «запись из estimate») —
   срезы ограничивать якорем следующего блока.
5. drizzle: returning() сохраняет порядок values — ремап id категорий для
   рёбер по индексу корректен.

## Открытые TODO после 1.6

- TODO(2.4): contextQualityScore в routes/sections.ts (единственный
  серверный маркер беседы).
- TODO(1.6b): клиентские — источник pausedState из GET /:id, наполнение
  SynthesisPage/CatalogPage, исключение capsule при рендере.
- Прочие TODO прежних бесед — без изменений (реестр 07 §12).

# Беседа 1.6b — просмотр документа + каталог (клиент) [ЗАКРЫТА]

## Созданные/изменённые файлы

- `client/src/globals.css` (расширение): весь CSS документа из фрагмента
  [482–929, 3304] — .doc-header/.doc-title/.doc-subtitle/.doc-meta-*,
  #docTOC/.toc-*, .doc-section/.section-num/.section-title/.doc-content,
  .doc-table (зебра/рамки), .callout warning/note/gold, .risk*,
  .doc-footer/.validity-stamp, .stream-cursor (+blink-cursor),
  .actions-bar/.action-btn, legacy .sig-*/.graph-node/.graph-edge (для
  импорта 4.3), .doc-title-edit-btn; дубль `#docTOC .toc-arrow` исходника
  схлопнут; + `scroll-behavior: smooth` (плавные якоря). ДЫРА СПЕКИ:
  disclosure-CSS `.header-disclosure*`/`.sec-disclosure` [2114–2226] не
  входил в 1.6-document-view.spec — портирован, spec дополнен (16b/D).
- `client/src/components/document/` (НОВАЯ, ×5):
  - `DocumentView.tsx`: сборка Header→(TOC+разделы)→Footer в порядке
    sectionOrder; ключ `capsule` исключается (removeCapsuleFromDocBodies);
    разделы вне sectionOrder дорисовываются в хвост.
  - `DocumentHeader.tsx`: docNum, дата ru-RU, ML/DL/SL, три ветки
    подзаголовка [12126]; disclosures «Зерно концепции»/«Дополнительный
    контекст»/капсула (gold, open по умолчанию) — makeHeaderDisclosure/
    buildDocHeaderExtras/updateCapsuleInHeader декларативно;
    extractCapsuleText — реюз порта 1.5b (utils/concept-file); ✎ — порт
    editDocTitle: prompt() + PATCH title, 403 → алерт (SynthesisFull не
    несёт userId — владение клиенту заранее неизвестно).
  - `SectionView.tsx`: .doc-body + якорь #sec-{key} +
    dangerouslySetInnerHTML; `enrichSectionHtml` (ЭКСПОРТ) вносит якоря
    #subsec-{key}-{slug} и кнопки ⏫ В САМУ HTML-строку до рендера
    (DOMParser в useMemo) — вторая половина buildTableOfContents
    [11655–11710]. useEffect для вставок ЗАПРЕЩЁН (грабля ниже, регрессия
    4p). db{N}/rebuildDbMapping не портированы (адресация по key).
  - `TableOfContents.tsx`: порт buildTableOfContents [11621] — слуг
    `subsectionSlugId` (регексп `[^a-zA-Zа-яА-ЯёЁ0-9]` → `_`, ЭКСПОРТ —
    SectionView переиспользует), <2 видимых разделов → null, KEY_LABELS,
    подразделы из ФАКТИЧЕСКИХ SectionSummary.subsections (сервер 1.6).
  - `DocumentFooter.tsx`: порт updateFooterCost — «Токены: N вх. + M вых.
    · Стоимость: $X.XXXX (Y.YY¢)» РОВНО из totalCostUsd (квирк 3/15 $/M
    исходника не перенесён — решение 1.6, регрессия 4p); сессия = docNum;
    validity-stamp только при status='ready'.
- `client/src/components/catalog/` (НОВАЯ, ×2): `SynthesisCard.tsx`
  (название, ML×SL, философы или «свободный синтез», дата, статус,
  капсула-превью; кнопка Опубликовать/Скрыть с preventDefault+
  stopPropagation внутри Link), `SynthesisList.tsx` (пустые состояния).
- `client/src/components/shared/LoadingSpinner.tsx` (НОВЫЙ; 05: первый
  потребитель — 1.6b).
- `client/src/pages/SynthesisPage.tsx` (заглушка 0.4 заменена): загрузка
  через synthesis-store; NOT_FOUND → 404-состояние, FORBIDDEN → 403;
  viewOnly-подписка useStreamingGeneration при generating/paused;
  pausedState = stream.pause ?? synthesis.pausedState (снапшот из
  GET /:id — маркер 1.6b закрыт); снапшот-пауза НЕ навязывает модалку
  (по бейджу), живая WS-пауза открывает сама; по section_done — дотяжка
  reloadSections (единый источник контента — БД через REST, не WS-html);
  по complete/resumed — полный reload; разделы из БД при заходе в
  середине генерации помечаются done в прогрессе; actions-bar — минимум
  («Распечатать» + статус), кнопки графа/Изменить/лога/экспорта/режимов
  появятся в 1.7/2.3/2.4/4.2/4.1 без заглушек.
- `client/src/pages/CatalogPage.tsx` (заглушка 0.4 заменена): вкладки
  Мои (GET /syntheses) / Публичные (GET /syntheses/public), СЕРВЕРНЫЙ
  ?search= (дебаунс 400 мс, reqSeq против гонок), пагинация limit 20,
  переключатель публикации PATCH { isPublic } только на «Мои».
- `client/src/api/sections.ts` (НОВЫЙ): getSections(), getSection().
- `client/src/api/syntheses.ts` (расширение): listSyntheses,
  listPublicSyntheses, updateSynthesis (PATCH title/isPublic).
- `client/src/stores/synthesis-store.ts` (НОВЫЙ, Zustand): SynthesisFull
  + summaries + полные разделы (дотяжка getSection по ключам БЕЗ capsule),
  loadSeq против гонок StrictMode, reloadSections/applySynthesis/clear.
- `client/src/hooks/useStreamingGeneration.ts`: опция `viewOnly`
  (условный спред — exactOptionalPropertyTypes) → subscribe_generation.
- `tests/test-16b-requests2-9.mjs`: 63 проверки ×3 прогона (R2–R9).
- `server/integration-check.mts`: блок 4p (модули + контракты + walker
  «TODO(1.6b)=0» + запрет useEffect в SectionView).
- `scripts/patch-docs-conv16b.py`: 9 правок, идемпотентный; контроль —
  applied=9 → чистый skip ×2 на чистой git-копии.

## Адаптации/решения беседы

1. ГЛАВНАЯ ГРАБЛЯ: пострендер-вставки в DOM под dangerouslySetInnerHTML
   стираются при hash-навигации (клик по TOC-ссылке → location →
   ре-рендер → React пере-применяет innerHTML; эффект с неизменными deps
   не перезапускается). Решение — обогащение HTML-строки до рендера.
2. Дыра спеки фрагмента: disclosure-CSS не входил в spec (закрыто 16b/D).
3. SynthesisFull без userId → кнопки владельца оптимистичны, 403 → алерт.
4. Снапшот-пауза из БД не навязывает модалку; живая WS-пауза перекрывает.
5. actions-bar сведён к функциональному минимуму (без мёртвых заглушек).
6. makeSectionCtxDisclosure НЕ портирован — долг → 2.3 (§12);
   restoreCapsulesFromHTML — прежний долг 3.2.

## Ревью по карте 04 (доля 1.6b)

- Портированы: buildTableOfContents [11621] ОБЕ половины (TOC +
  enrichSectionHtml), makeHeaderDisclosure/buildDocHeaderExtras
  [11599/11613] + заполнение шапки [12110–12144] (docNum — с сервера),
  updateCapsuleInHeader [11773] + removeCapsuleFromDocBodies [11822]
  (декларативно: шапка + исключение ключа), updateFooterCost [5671]
  (без квирка ставок), editDocTitle, панель действий [4134–4168]
  (минимум), весь CSS документа.
- Реюз без нового порта: extractCapsuleText (1.5b, concept-file).
- Не долг 1.6b: updateDocTitleFromName — сервер (порт 1.4, FIX \w);
  restoreCapsulesFromHTML — 3.2; rebuildDbMapping/db{N}/.output-wrap —
  запрещены протоколом (в коде отсутствуют).
- Единственный оставленный долг: makeSectionCtxDisclosure → 2.3 (§12).

## Помодульно: что прикладывать в следующие беседы

- **1.7 (граф)**: `SynthesisPage.tsx` (actions-bar — сюда встаёт кнопка
  графа), `client/api/client.ts`; серверный контракт GraphData из 1.6.
- **2.3 (EditModal)**: `SynthesisPage.tsx` (хозяин модалки),
  `SectionView.tsx` (enrichSectionHtml — правки HTML разделов),
  `synthesis-store.ts` (reloadSections после сохранения); долг
  makeSectionCtxDisclosure (sec_context уже в SectionFull).
- **2.4 (лог/quality)**: `DocumentFooter.tsx` (кнопка «◈ Лог»).
- **3.2 (генеалогия/пул)**: `SynthesisPage.tsx`, `CatalogPage.tsx`,
  `SynthesisCard.tsx`, `synthesis-store.ts` — точки интеграции пунктов
  4–5 беседы 3.2.
- **4.1/4.2 (режимы/экспорт)**: actions-bar SynthesisPage.
- **4.3 (импорт)**: legacy-CSS .sig-*/.graph-node/.graph-edge уже в
  globals.css.

## Знания/грабли, добытые в 1.6b (в копилку 0.4)

1. dangerouslySetInnerHTML: НЕ мутировать содержимое пострендер —
   React владеет узлом и пере-применяет innerHTML при любом ре-рендере
   с «новой» строкой; обогащать строку до рендера (DOMParser + useMemo).
2. После smooth-scroll ассерт |top|<ε неверен: последний раздел
   упирается в низ документа (top=504 при y=1299) — проверять
   «элемент в viewport» + рост scrollY.
3. text-transform: uppercase — сверки ТОЛЬКО по textContent (innerText
   отдаёт трансформированный текст; грабля 1.5 повторилась на summary
   disclosures).
4. Keep-alive-сокеты мок-сервера держат event loop в finally: итог
   печатать ДО cleanup, race-таймауты на browser.close/sql.end,
   mock.closeAllConnections(), явный process.exit.
5. Кэш puppeteer в песочнице пуст (грабля 0.6 повторяется) — системный
   /opt/google/chrome/chrome.
6. npm install может падать ECONNRESET посреди reify — транзиентно,
   повтор с --prefer-offline добирает из кэша.

## Открытые TODO после 1.6b

- makeSectionCtxDisclosure → 2.3 (внесён в §12).
- Кнопки actions-bar — плановые интеграции 1.7/2.3/2.4/4.1/4.2 (не долг).
- onResumePlan на странице просмотра — console.warn до plan-executor 2.2
  (как в 1.5; долг 2.2 в §12 прежний).
- Прочие TODO прежних бесед — без изменений (реестр 07 §12).
