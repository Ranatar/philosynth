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
  justification best-effort по <strong>; глоссарий — первый th «термин»
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
