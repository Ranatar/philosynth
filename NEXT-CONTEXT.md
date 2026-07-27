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
