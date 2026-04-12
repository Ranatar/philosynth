# PhiloSynth Service — Протокол бесед

## 1. Общие принципы работы с контекстом

### 1.1. Не загружать всё — загружать нужное

Полный `philosynth.html` — 976 КБ (~250K токенов). Шесть проектных документов — ещё ~131 КБ (~33K токенов). Итого ~283K токенов только на контекст, до единого слова запроса. Это работоспособно (окно Claude — 200K+), но неэффективно: модель тратит внимание на 19 000 строк CSS, HTML-разметки и Three.js-рендеринга, когда задача — написать Drizzle-миграцию.

**Правило**: в каждую беседу загружать **только то, что нужно для конкретных задач этой беседы**. Проектные документы — да, все 6 (они компактные и дают общий контекст). Исходный файл — только релевантные фрагменты.

### 1.2. Как определить, какие фрагменты исходника нужны

Документ `04-code-reuse-map.md` содержит точные номера строк для каждой функции и каждого модуля. Перед беседой:

1. Определить задачи беседы (из `06-dev-strategy.md`)
2. Найти целевые модули (из `05-file-structure.md`)
3. Найти строки исходника (из `04-code-reuse-map.md`)
4. Извлечь эти строки: `sed -n 'START,ENDp' philosynth.html > fragment.txt`

### 1.3. Структура каждой беседы

```
[Первый запрос]
├── Контекст: проектные документы + фрагменты исходника
├── Формулировка: что сделать, какие файлы создать
└── Ограничения: что НЕ делать в этой беседе

[Запросы 2–N: итерация]
├── Компиляция / запуск → ошибки → исправление
├── Тестирование → доработка
└── Интеграция с ранее созданными модулями

[Финальный запрос]
└── Ревью: покрытие, edge cases, TODO для следующих бесед
```

### 1.4. Межсессионные зависимости

Каждая беседа после Фазы 0 зависит от файлов, созданных в предыдущих. Эти файлы нужно загружать как контекст. Правило:

- **Серверные модули** (services, utils) — загружать файлы, от которых зависит текущий модуль (импорты)
- **Роуты** — загружать сервис, который роут вызывает
- **Клиентские компоненты** — загружать типы из `shared/types/`, API-клиент, хуки
- **Никогда** не загружать файлы, которые не импортируются текущим модулем

---

## 2. Протокол Фазы 0: Инфраструктура

### Беседа 0.1: Скелет монорепозитория + БД

**Контекст для загрузки:**
- `01-architecture.md` (стек, компоненты)
- `02-data-model.md` (все таблицы)
- `05-file-structure.md` (дерево каталогов)
- Исходник: НЕ НУЖЕН

**Первый запрос:**
```
Создай скелет монорепозитория PhiloSynth Service.

Прикреплённые файлы — проектные документы: архитектура, модель данных, файловая структура.

Задачи этой беседы:
1. Инициализация workspace (package.json root + packages/shared, server, client)
2. tsconfig.base.json + tsconfig для каждого пакета
3. docker-compose.yml (PostgreSQL 16 + Redis 7)
4. .env.example с переменными из архитектуры
5. Drizzle ORM: полная схема БД (ВСЕ 21 таблицу из 02-data-model.md)
   — файл server/db/schema.ts
6. drizzle.config.ts
7. server/db/index.ts (подключение)
8. Начальная миграция

НЕ делай в этой беседе: auth, роуты, клиент, WebSocket.

Стек: TypeScript, Hono, Drizzle ORM, PostgreSQL 16, Redis 7.
```

**Последующие запросы:**
- «Запусти `docker compose up -d` и `npx drizzle-kit push` — покажи результат. Проверь, что все 21 таблица создались: `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`»
- «Создай shared/types/ — все 11 файлов типов из файловой структуры (synthesis.ts, section.ts, graph.ts, elements.ts, lineage.ts, edit-plan.ts, generation.ts, modes.ts, billing.ts, prompts.ts, ws-messages.ts). Каждый тип должен соответствовать полям из schema.ts»
- «Создай shared/constants/ — все файлы: philosophers.ts (список из STATE.PH), labels.ts (ML, SL, DL, REVERSE_*), section-labels.ts (KEY_LABELS), ctx-keys.ts (ALL_CTX_KEYS, CTX_LABELS), phil-filename.ts, methods.ts»
- «Проверь согласованность: типы в shared/types/ ↔ схема в server/db/schema.ts ↔ константы в shared/constants/. Нет ли полей, которые есть в схеме, но отсутствуют в типах? Нет ли enum-значений, которые не покрыты константами?»
- «Проверь, что `tsc --noEmit` проходит для shared/ и server/ без ошибок»
- «Edge case: убедись, что schema.ts содержит правильные ON DELETE (CASCADE для секций, SET NULL для lineage.parent_synthesis_id). Проверь все UNIQUE-constraints и индексы»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 0.2: Auth + Hono-каркас + WebSocket

**Контекст:**
- `01-architecture.md` (секция Auth, секция WebSocket)
- `03-specification.md` (секции 2.1 Auth, 3.x WebSocket)
- `05-file-structure.md`
- Из предыдущей беседы: `server/db/schema.ts`, `shared/types/ws-messages.ts`
- Исходник: НЕ НУЖЕН

**Первый запрос:**
```
Продолжаю разработку PhiloSynth Service. Прикреплены: архитектура, спецификация, 
файловая структура, и файлы из предыдущей сессии (db/schema.ts, shared/types/).

Задачи:
1. server/index.ts — Hono app с CORS, JSON middleware
2. Lucia Auth: server/middleware/auth.ts 
   — регистрация, логин, logout, GET /me
   — сессии в PostgreSQL (таблица sessions из schema.ts)
3. server/routes/auth.ts — роуты из спецификации (секция 2.1)
4. server/ws/handler.ts — WebSocket upgrade, ping/pong, типизация сообщений
5. server/ws/connection-manager.ts — управление подключениями
6. server/middleware/rate-limiter.ts — Redis-based

Формат ответов API — из спецификации. Коды ошибок — из секции 4.3.
```

**Последующие запросы:**
- «Запусти сервер и протестируй полный auth-цикл: POST /auth/register с email+password → 201, POST /auth/login → 200 + cookie, GET /auth/me → user object, POST /auth/logout → cookie удалён, GET /auth/me → 401. Покажи curl-команды и ответы»
- «Протестируй валидацию: POST /auth/register с пустым email → ошибка VALIDATION_ERROR. Регистрация с существующим email → 409. Логин с неверным паролем → 401»
- «Протестируй WebSocket: подключись через wscat, отправь {"type":"ping"} → ответ {"type":"pong"}. Отправь невалидный JSON → соединение не рвётся, ошибка логируется»
- «Протестируй rate-limiter: отправь 100 запросов за 10 секунд → после лимита ответ 429 с retryAfter. Проверь, что лимит сбрасывается через указанное время»
- «Протестируй WebSocket с auth: подключение без токена → reject. Подключение с валидным токеном → accept. Подключение с expired токеном → reject»
- «Edge case: два одновременных WebSocket-подключения от одного пользователя — оба работают (connection-manager хранит Set, не одно значение)»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 0.3: Seed-скрипты + Prompt Registry

**Контекст:**
- `01-architecture.md` (секция 4.1 Prompt Registry)
- `04-code-reuse-map.md` (секция 1.1–1.5 — какие объекты извлекать)
- `server/db/schema.ts`
- Исходник: **ДА, но только фрагменты**:
  - Строки 4882–5288 (CONTEXT_DEPS_*, SUBSTITUTION_MAP)
  - Строки 5896–6117 (COMPAT_MATRIX_COMPACT)
  - Строки 4335–4849 (INTRA_DEPS, SUBSECTION_TO_CTX_KEYS, TOPOLOGY_ROLES)
  - Строки 7421–8056 (buildSYS, METHOD_*, LEVEL_*)
  - Строки 8825–9596 (buildSectionDefs, serializeParts — для понимания структуры промптов)

**Извлечение фрагментов перед беседой:**
```bash
sed -n '4335,5288p' philosynth.html > frag-configs.txt
sed -n '5896,6117p' philosynth.html >> frag-configs.txt
sed -n '7421,8056p' philosynth.html > frag-prompts.txt
sed -n '8825,9596p' philosynth.html >> frag-prompts.txt
```

**Первый запрос:**
```
Продолжаю PhiloSynth Service. Прикреплены: архитектура (секция Prompt Registry),
карта переиспользования, db/schema.ts, и фрагменты исходника.

Задачи:
1. scripts/seed-prompts.ts — скрипт, который:
   a. Извлекает ВСЕ промптовые шаблоны из исходника (METHOD_SUM, METHOD_GRAPH, 
      METHOD_TOPOLOGY, METHOD_GLOSSARY, METHOD_THESES, METHOD_DIALOGUE — для каждого 
      из 6 методов; LEVEL_*; buildSYS; buildQualityReinforcement; mode prompts)
   b. Преобразует каждый в запись prompt_templates с ключом вида 
      "method.dialectical.graph", "level.transformative.graph_methodology", "system"
   c. Заменяет захардкоженные значения на плейсхолдеры {{participants}}, {{method_label}} и т.д.
   d. Вставляет в БД

2. scripts/seed-configs.ts — скрипт, который:
   a. Извлекает все конфиг-объекты: CONTEXT_DEPS_BASE, CONTEXT_DEPS_GENETIC, 
      LEVEL_DEPS_PATCH, METHOD_DEPS_PATCH, SUBSTITUTION_MAP, SUBSTITUTION_MAP_GENETIC,
      COMPAT_MATRIX_COMPACT, INTRA_DEPS, SUBSECTION_TO_CTX_KEYS, TOPOLOGY_ROLES_PROCEDURAL,
      FRAGMENT_SHARE, CONTEXT_BUDGET
   b. Вставляет как JSON в synthesis_configs

3. server/services/prompt-registry.ts:
   - getTemplate(key): читает из Redis-кэша, fallback на БД
   - renderTemplate(key, vars): подставляет переменные
   - getConfig(key): аналогично для конфигов
   - invalidateCache(key): сброс кэша при обновлении
   - listVersions(key), activateVersion(key, version)

Фрагменты исходника прикреплены — используй их для извлечения точных текстов шаблонов.
```

**Последующие запросы:**
- «Запусти seed-prompts.ts — сколько шаблонов создано? Покажи `SELECT count(*) FROM prompt_templates` и `SELECT key, version, is_active, length(body) as body_len FROM prompt_templates WHERE is_active = true ORDER BY key LIMIT 30`»
- «Проверь содержимое: вызови getTemplate("method.dialectical.graph") — содержит ли плейсхолдеры {{participants}}, {{method_label}}? renderTemplate с тестовыми переменными — плейсхолдеры заменены?»
- «Запусти seed-configs.ts — проверь все конфиги: getConfig("context_deps.base") возвращает объект с ключами graph, glossary, theses и т.д., каждый с required/optional массивами?»
- «Протестируй кэширование: getTemplate("system") → первый вызов — из БД (лог запроса). Второй вызов — из Redis (нет лог запроса к БД). invalidateCache("system") → третий вызов — снова из БД»
- «Протестируй версионирование: создай вторую версию шаблона "system" → activateVersion("system", 2) → getTemplate возвращает новую версию → activateVersion("system", 1) → возврат к старой»
- «Edge case: getTemplate для несуществующего ключа → понятная ошибка, не crash. getConfig для несуществующего ключа → аналогично»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 0.3b: Seed Taxonomy (каталоги типов)

**Контекст для загрузки:**
- `02-data-model.md` (таблицы category_type_catalog, relationship_type_catalog)
- `server/db/schema.ts` (из 0.1)
- Исходник: НЕ НУЖЕН (типы берутся из предыдущего проекта, перечислены в 02-data-model.md)

**Первый запрос:**
```
Создаю скрипт заполнения каталогов типов категорий и связей.

Прикреплены: модель данных (таблицы category_type_catalog, relationship_type_catalog), schema.ts.

Задачи:
1. scripts/seed-taxonomy.ts:
   a. Заполняет category_type_catalog 18 типами категорий:
      ontological/Онтологическая, epistemological/Эпистемологическая,
      axiological/Аксиологическая, ethical/Этическая, aesthetic/Эстетическая,
      metaphysical/Метафизическая, logical/Логическая, practical/Практическая,
      political/Политическая, theological/Теологическая,
      anthropological/Антропологическая, social/Социальная,
      linguistic/Лингвистическая, phenomenological/Феноменологическая,
      existential/Экзистенциальная, analytical/Аналитическая,
      hermeneutical/Герменевтическая, cross_disciplinary/Междисциплинарная
   b. Заполняет relationship_type_catalog 29 типами связей:
      hierarchical, causal, dialectical, correlational, disjunctive,
      conjunctive, contradiction, complementary, emergence,
      necessary_condition, sufficient_condition, identity, analogy,
      implementation, instantiation, generalization, part_whole,
      means_end, deductive, inductive, abductive, temporal, conceptual,
      definitional, manifestation, foundational, recognition, reflexion,
      development — каждый с русским названием и описанием
   c. Все записи с is_system=true

2. server/services/element-taxonomy.ts:
   - getCategoryTypes(): список из БД + Redis-кэш
   - getRelationshipTypes(): аналогично
   - normalizeType(text, kind): маппинг свободного текста на ближайший тип из каталога
     (fuzzy match по русскому и английскому названию)
   - createCustomType(key, nameRu, description, kind, userId): пользовательский тип
```

**Последующие запросы:**
- «Запусти seed-taxonomy.ts — проверь: SELECT count(*) FROM category_type_catalog (должно быть 18), SELECT count(*) FROM relationship_type_catalog (должно быть 29)»
- «Протестируй normalizeType("диалектическая", "relationship") → match: { key: "dialectical", nameRu: "Диалектическая" }»
- «Протестируй normalizeType("причинно-следственная", "relationship") → match: { key: "causal" }»
- «Протестируй normalizeType("странный_тип_42", "category") → match: null, suggestions: [ближайшие по Levenshtein]»
- «Протестируй createCustomType → новая запись с is_system=false, created_by заполнен»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 0.4: Каркас клиента

**Контекст:**
- `05-file-structure.md` (секция client/)
- `01-architecture.md` (обзор)
- Исходник: строки 13–3141 (CSS — **только** для извлечения цветовой палитры и дизайн-системы)

**Извлечение:**
```bash
# Только CSS-переменные и ключевые стили (не весь CSS)
grep -n 'var(--' philosynth.html | head -50 > frag-css-vars.txt
sed -n '13,200p' philosynth.html >> frag-css-vars.txt
```

**Первый запрос:**
```
Создай каркас клиента PhiloSynth Service.

Задачи:
1. Vite + React 19 + TypeScript
2. tailwind.config.ts — кастомные цвета из дизайн-системы исходника 
   (см. CSS-фрагмент: --gold, --ink, --parchment, --violet и т.д.)
3. globals.css с CSS-переменными
4. React Router: маршруты Login, Register, Catalog, CreateSynthesis, 
   Synthesis/:id, Import, Billing, AdminPrompts
5. Layout.tsx с Header, Sidebar
6. Заглушки всех страниц
7. stores/auth-store.ts (Zustand): user, login(), logout()
8. api/client.ts: fetch-обёртка с cookie auth, error handling

НЕ делай: реальные компоненты, граф, редактирование. Только скелет навигации.
```

**Последующие запросы:**
- «Запусти `npm run dev` — клиент стартует без ошибок? Открой в браузере — Layout рендерится, навигация между страницами работает?»
- «Протестируй auth-store: вызови login() → запрос к POST /auth/login → при успехе user сохраняется в store, при ошибке — error. logout() → POST /auth/logout → user = null. При перезагрузке страницы — GET /auth/me восстанавливает сессию»
- «Протестируй api/client.ts: запрос к защищённому эндпоинту без сессии → redirect на /login. Запрос с сессией → данные. Ответ 500 → error обрабатывается, не crash»
- «Проверь CSS-переменные: цвета --gold (#d4a017), --ink (#1a1814), --parchment (#f2f0eb), --violet (#6b00aa) из исходника присутствуют в globals.css и используются в tailwind.config.ts?»
- «Проверь responsive: Layout на мобильных (< 768px) — Sidebar скрыт или бургер-меню. Header адаптивный»
- «Проверь, что все маршруты из React Router имеют заглушки (не белый экран): /login, /register, /catalog, /synthesis/new, /synthesis/:id, /import, /billing, /admin/prompts»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

## 3. Протокол Фазы 1: MVP

### Беседа 1.1: Synthesis Engine — ядро

**Контекст:**
- `01-architecture.md` (секция 4.2 Synthesis Engine)
- `04-code-reuse-map.md` (секция 1.1–1.3)
- `server/services/prompt-registry.ts` (из 0.3)
- `server/db/schema.ts`
- `shared/types/synthesis.ts`
- Исходник: строки 4851–5895, 6129–6816

**Извлечение:**
```bash
sed -n '4851,5895p' philosynth.html > frag-engine.txt
sed -n '6129,6816p' philosynth.html >> frag-engine.txt
```

**Первый запрос:**
```
Портирую ядро Synthesis Engine в TypeScript.

Прикреплены: архитектура, карта переиспользования, prompt-registry.ts, schema.ts, 
типы, и фрагмент исходника (строки 4851–6816).

Создай файлы:
1. server/services/synthesis-engine.ts:
   - resolveContextDeps(params) — из строки 5151
   - deepMergeUniq() — из строки 4851
   - buildEffectiveDeps() — из строки 5328
   - findSubstitute() — из строки 5307
   - getSubstituteQuality() — из строки 5313
   - getActiveSubstitutionMap() — из строки 5320
   Все конфиги (CONTEXT_DEPS_BASE и т.д.) читаются через prompt-registry.getConfig()

2. server/utils/topo-sort.ts:
   - computePredecessors() — из строки 5370
   - topologicalSort() — из строки 5450
   - buildDynamicOrder() — из строки 5419
   - resolveCircularDeps() — из строки 5813

3. server/services/compat-advisor.ts:
   - computeSectionRating() — из строки 6129
   - computeOverallCompat() — из строки 6400
   Матрица читается через getConfig("compat_matrix")

4. server/services/cost-estimator.ts:
   - estimateCost() — из строки 6518
   - estimateSubsectionCost() — из строки 6673
   - estimateModeCost() — из строки 6750

Логика порт 1:1, но:
- Все конфиги читаются из Prompt Registry (не хардкод)
- Типизация TypeScript (параметры, возвращаемые значения)
- async где нужно (чтение из Registry — async)
```

**Последующие запросы:**
- «Напиши юнит-тест: resolveContextDeps с params = { method: "dialectical", synthLevel: "comparative", sections: ["graph","glossary","theses"] } — проверь, что graph получает required: ["sum:goals", "sum:tensions"]»
- «Проверь, что buildDynamicOrder корректно обрабатывает циклические зависимости — создай тест с graph → theses → graph (resolveCircularDeps должна разорвать цикл)»
- «Проверь estimateCost с глубиной "exhaustive" — результат должен быть ~2x от "standard". Проверь с 6 разделами vs 3 — стоимость пропорциональна»
- «Протестируй findSubstitute: sections=["graph","theses"] (нет glossary) — для тезисов, которые зависят от glossary:table, findSubstitute должен найти замену (если настроено в SUBSTITUTION_MAP). Проверь getSubstituteQuality — возвращает 1/2/3»
- «Протестируй computeOverallCompat: method="creative", synthLevel="generative", sections=["graph","theses","dialogue"] — результат должен содержать rating, advice, sections_override (если есть в COMPAT_MATRIX)»
- «Edge case: resolveContextDeps с пустым sections=[] — не должно crash. computePredecessors с одним разделом — корректный результат»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 1.2: Prompt Builder + Section Defs

**Контекст:**
- `server/services/prompt-registry.ts`
- `server/services/synthesis-engine.ts` (из 1.1)
- `shared/constants/labels.ts`
- Исходник: строки 7421–9596

**Извлечение:**
```bash
sed -n '7421,9596p' philosynth.html > frag-prompts-full.txt
```

**Первый запрос:**
```
Портирую систему сборки промптов.

Прикреплён фрагмент исходника (строки 7421–9596): buildSYS, METHOD_*, LEVEL_*, 
buildSectionDefs, serializeParts, baseCtx, buildQualityReinforcement, groupPasses.

Создай:
1. server/services/prompt-builder.ts:
   - buildSYS(params) — строка 7421. Читает шаблон "system" из Registry
   - baseCtx(params) — строка 8633. Параметры из аргумента (не из DOM)
   - buildQualityReinforcement(params) — строка 9400

2. server/services/section-defs-builder.ts:
   - buildSectionDefs(params) — строка 8825. Каждый промпт читается из Registry:
     registry.getTemplate("method.dialectical.graph") вместо METHOD_GRAPH[...]
   - serializeParts(parts) — строка 8714
   - groupPasses(defs, effectiveDeps) — как в исходнике
   - patchPromptsWithSecCtx(defs, secCtx) — строка 9500

Ключевое изменение: buildSectionDefs в исходнике содержит ~500 строк захардкоженных 
промптов. В сервисе каждый промпт — вызов registry.getTemplate(key). 
Структура ключей: "section.{sectionKey}.preamble", "method.{method}.{sectionKey}", 
"level.{level}.{aspect}".
```

**Последующие запросы:**
- «Протестируй buildSYS: вызови с params = { method: "dialectical", synthLevel: "comparative", depth: "standard", phil: ["Кант","Гегель"] } — результат содержит имена философов? Длина ~5000–8000 символов (как в исходнике)?»
- «Протестируй buildSectionDefs: params с sections=["sum","graph","glossary","theses"] — возвращает 4 def-объекта? Каждый имеет key, num, title, prompt? prompt содержит текст из Registry (не пустой)?»
- «Протестируй groupPasses: defs с 6 разделами, effectiveDeps где graph зависит от sum — sum и graph попадают в разные проходы (sum — раньше)?»
- «Протестируй patchPromptsWithSecCtx: добавь secCtx = { graph: "Сделать акцент на этику" } — промпт graph содержит этот текст?»
- «Протестируй baseCtx: результат содержит все параметры в правильном формате — метод, уровень, глубина, зерно, философы?»
- «Edge case: buildSectionDefs для метода "creative" + уровня "generative" — все шаблоны найдены в Registry? Нет ли missing template ошибок?»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 1.3: Context Builder (DOM → БД)

**Контекст:**
- `01-architecture.md` (секция 4.3 Context Builder)
- `server/db/schema.ts` (таблицы sections, categories, theses, glossary_terms)
- `server/services/synthesis-engine.ts` (из 1.1)
- Исходник: строки 6818–7418

**Извлечение:**
```bash
sed -n '6818,7418p' philosynth.html > frag-context.txt
```

**Первый запрос:**
```
Адаптирую контекстную подсистему: buildContextForSection и extract-функции.

В исходнике (прикреплён, строки 6818–7418) эти функции работают с DOM: 
el.querySelector('[data-section="Таблица категорий"]'). В сервисе — запросы к БД.

Создай:
1. server/services/context-builder.ts:
   - buildContextForSection(sectionKey, synthesisId, depth, effectiveDeps, resolvedDeps)
     Аналог строки 7178. Вместо `generated` (map key→DOM element) — 
     запросы к таблицам sections, categories, theses, glossary_terms.
     Бюджетирование (CONTEXT_BUDGET, FRAGMENT_SHARE) — через getConfig().

2. server/services/context-extractor.ts:
   - extractContextFragment(fragmentKey, synthesisId): 
     Диспетчер, вызывающий нужную функцию по ключу.
   - extractSummaryGoals(synthesisId) — из таблицы sections WHERE key='sum', 
     парсинг HTML через linkedom
   - extractGraphNodesTable(synthesisId) — из таблицы categories (SELECT + форматирование)
   - extractGraphEdges(synthesisId) — из category_edges
   - extractGlossaryTable(synthesisId) — из glossary_terms
   - extractThesesSummary(synthesisId) — из theses
   - ... остальные extract-функции

3. server/utils/text.ts: truncateText(), tableToText() — из строки 7355

Приоритет extract-функций (реализовать в этой беседе):
extractSummaryGoals, extractSummaryTensions, extractGraphNodesTable, 
extractGraphEdges, extractGlossaryTable, extractThesesSummary.
Остальные — заглушки с TODO.
```

**Последующие запросы:**
- «Протестируй extractGraphNodesTable: вставь 5 записей в categories (разные типы, centrality, certainty) → extractGraphNodesTable возвращает форматированную таблицу с колонками Имя, Тип, Определение, Центральность, Определённость?»
- «Протестируй extractGlossaryTable: 3 термина в glossary_terms → таблица с колонками Термин, Определение, Категория?»
- «Протестируй buildContextForSection: для sectionKey="theses", effectiveDeps показывает required=["sum:goals","graph:nodes_top"] — результат содержит оба фрагмента? Общая длина не превышает CONTEXT_BUDGET?»
- «Протестируй бюджетирование: создай ситуацию, где суммарный контекст превышает CONTEXT_BUDGET — optional-фрагменты обрезаются, required — нет. ctxLog содержит записи со status "found", "truncated", "skipped_budget"?»
- «Протестируй extractSummaryGoals: вставь HTML в sections WHERE key='sum' с data-section="Цели и задачи" → extractSummaryGoals парсит через linkedom и возвращает текст?»
- «Edge case: buildContextForSection для первого раздела (sum) — priorContext пуст, функция не crash. extractContextFragment для раздела, который ещё не сгенерирован — возвращает пустую строку, не ошибку»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 1.4: Streaming Manager + Generation Service

**Контекст:**
- `01-architecture.md` (секция 4.4 Streaming Manager)
- `03-specification.md` (секция 3 WebSocket-протокол)
- `server/ws/handler.ts` (из 0.2)
- `server/services/prompt-builder.ts` (из 1.2)
- `server/services/context-builder.ts` (из 1.3)
- `server/services/synthesis-engine.ts` (из 1.1)
- `server/db/schema.ts`
- Исходник: строки 10327–10420 (streamResp), 9600–10325 (generateDoc — только логика оркестрации, без DOM)

**Извлечение:**
```bash
sed -n '10327,10420p' philosynth.html > frag-stream.txt
sed -n '9600,10325p' philosynth.html > frag-generate.txt
```

**Первый запрос:**
```
Реализую стриминг и оркестрацию генерации.

Прикреплены: спецификация WebSocket-протокола, ws/handler.ts, все сервисы из 
предыдущих бесед, фрагменты исходника (streamResp, generateDoc).

Создай:
1. server/services/streaming-manager.ts:
   - streamSection(synthesisId, sectionKey, prompt, systemPrompt, apiKey, onDelta):
     a. POST к Claude API с stream: true
     b. Парсинг SSE (content_block_delta → text)
     c. Буферизация HTML
     d. Вызов onDelta(deltaHtml, totalChars) для каждого чанка
     e. Возврат usage (input_tokens, output_tokens)
     f. При ошибке: сохранение partial result в Redis
   - getStreamState(synthesisId, sectionKey): из Redis
   - clearStreamState(synthesisId, sectionKey)

2. server/services/generation-service.ts:
   - generateSynthesis(synthesisId, userId):
     a. Загружает synthesis из БД
     b. resolveContextDeps → buildEffectiveDeps → buildDynamicOrder
     c. buildSectionDefs из Registry
     d. groupPasses → для каждого прохода:
        - buildContextForSection
        - Собирает промпт (baseCtx + prior + section prompt)
        - streamSection через streaming-manager
        - Парсинг HTML → сохранение в sections + гранулярные таблицы
        - Отправка результата клиенту через WebSocket
     e. Обновление synthesis.status → "ready"

3. Расширение ws/handler.ts:
   - Обработка subscribe_generation → запуск generateSynthesis
   - Отправка stream_delta, section_done, generation_complete

4. server/services/graph-parser.ts:
   - parseGraphFromHTML(html) → { nodes, edges, topology }
   - saveGraphToDb(synthesisId, parsedGraph) → INSERT в categories, category_edges
   Порт из строки 10425 (parseTopology) и 10654 (parseGraph),
   но парсинг через linkedom вместо browser DOM.

5. server/services/element-parser.ts:
   - parseThesesFromHTML(html) → Thesis[]
   - parseGlossaryFromHTML(html) → GlossaryTerm[]
   - saveElementsToDb(synthesisId, sectionKey, elements)
```

**Последующие запросы:**
- «Создай роут POST /syntheses — принимает параметры из спецификации (2.2), создаёт запись в БД, запускает генерацию. Проверь: curl POST с seed, philosophers, sections, method → ответ { id, status: "generating" }»
- «Протестируй полный цикл: POST /syntheses с 2 философами (Кант, Гегель), sections=["sum","graph","glossary"], depth="overview" → подключись по WebSocket → получай stream_delta → section_done × 3 → generation_complete. Покажи финальный usage»
- «Проверь парсинг графа: после генерации раздела "graph" — SELECT count(*) FROM categories WHERE synthesis_id=X (должно быть 8–15 записей). SELECT count(*) FROM category_edges (должно быть 15–30). cluster_labels заполнены?»
- «Проверь парсинг тезисов и глоссария: после генерации — SELECT count(*) FROM theses, SELECT count(*) FROM glossary_terms. Данные содержат непустые formulation/definition?»
- «Протестируй reconnect: начни генерацию → отключи WebSocket → подключись заново с ?resume={synthesisId} → получи накопленный буфер + продолжение стрима»
- «Протестируй обработку ошибки Claude API: подставь невалидный API-ключ → stream_error с recoverable=false, synthesis.status="error", partial HTML сохранён»
- «Edge case: генерация с одним разделом (sections=["sum"]) — работает без зависимостей. Генерация с depth="exhaustive" — более длинный ответ, не timeout»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 1.5: Форма создания + прогресс (клиент)

**Контекст:**
- `03-specification.md` (секция 1.3 Генерация)
- `05-file-structure.md` (секция client/components/synthesis/)
- `shared/types/`, `shared/constants/`
- `client/api/client.ts` (из 0.4)
- `client/hooks/useWebSocket.ts` (из 0.4)
- Исходник: строки 3143–3930 (HTML формы — **только** как визуальный референс структуры)

**Извлечение:**
```bash
sed -n '3143,3930p' philosynth.html > frag-form-html.txt
```

**Первый запрос:**
```
Создаю форму создания синтеза и панель прогресса.

Прикреплён HTML формы из исходника — как визуальный референс (какие поля, 
какие опции, структура чекбоксов). НЕ копировать HTML — создать React-компоненты.

Создай:
1. client/pages/CreateSynthesisPage.tsx
2. client/components/synthesis/SynthesisForm.tsx:
   - Поля: зерно (textarea), контекст (textarea), метод (select), 
     уровень (select), глубина (select), порядок генерации (select)
3. client/components/synthesis/PhilosopherPicker.tsx:
   - Чекбоксы из shared/constants/philosophers.ts
   - Группировка по эпохам (как в исходнике)
4. client/components/synthesis/SectionPicker.tsx:
   - Чекбоксы секций с secCtx-полями
5. client/components/synthesis/CostEstimate.tsx:
   - Вызывает estimateCost на сервере (или клиентская копия)
6. client/components/synthesis/GenerationProgress.tsx:
   - Подписка на WebSocket
   - Шаги: иконка (◯/⟳/✓), название раздела, количество символов
7. client/hooks/useStreamingGeneration.ts
8. client/api/syntheses.ts: createSynthesis(), getSynthesis()
```

**Последующие запросы:**
- «Протестируй полный UI-цикл: открой /synthesis/new → заполни зерно, выбери 2 философов, отметь 3 секции, метод "dialectical" → CostEstimate показывает оценку? → нажми "Генерировать" → GenerationProgress показывает шаги с ◯/⟳/✓?»
- «Протестируй PhilosopherPicker: группировка по эпохам корректна (Античность: Пифагор–Плотин, Средневековье: Августин–Кузанский и т.д.)? Выбор/снятие работает? Счётчик выбранных обновляется?»
- «Протестируй SectionPicker: отметить "graph" → secCtx-поле появляется. Снять — скрывается. Матрица совместимости: выбрать method="creative", sections=["evolution"] → CompatAdvisor показывает предупреждение?»
- «Протестируй GenerationProgress во время реальной генерации: шаги появляются по мере стриминга? Счётчик символов обновляется в реальном времени? После завершения — redirect на /synthesis/:id?»
- «Протестируй валидацию формы: попытка отправить без философов → ошибка. Без зерна → допускается (зерно опционально). Без секций → ошибка»
- «Проверь responsive: форма на мобильных — PhilosopherPicker в 2 колонки, SectionPicker в 1 колонку. Кнопка "Генерировать" всегда видна»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 1.6: Просмотр документа + каталог

**Контекст:**
- `03-specification.md` (секции 1.2, 1.4)
- `05-file-structure.md` (document/, catalog/)
- `client/api/`, `client/stores/`
- Исходник: **НЕ НУЖЕН** (визуализация документа — новый React-код)

**Первый запрос:**
```
Создаю страницу просмотра синтеза и каталог.

Создай:
1. client/pages/SynthesisPage.tsx:
   - Загрузка синтеза по ID
   - Рендер DocumentView

2. client/components/document/:
   - DocumentView.tsx: рендер HTML-контента разделов (dangerouslySetInnerHTML)
   - DocumentHeader.tsx: номер, участники, метод, капсула
   - SectionView.tsx: один раздел с заголовком и контентом
   - TableOfContents.tsx: якоря по разделам
   - DocumentFooter.tsx: стоимость, токены

3. client/pages/CatalogPage.tsx:
   - Вкладки: «Мои» / «Публичные»
   - Поиск по названию
   
4. client/components/catalog/:
   - SynthesisList.tsx
   - SynthesisCard.tsx: превью (название, метод, уровень, философы, дата)

5. client/api/sections.ts: getSections()
6. client/stores/synthesis-store.ts (Zustand): текущий синтез
```

**Последующие запросы:**
- «Протестируй SynthesisPage: открой /synthesis/:id для ранее созданного синтеза → DocumentHeader показывает номер, метод, уровень, философов? DocumentView рендерит HTML всех разделов? TableOfContents содержит якоря на каждый раздел?»
- «Протестируй навигацию: клик на элемент TableOfContents → плавная прокрутка к разделу. Кнопка "↑ Наверх" → прокрутка к началу»
- «Протестируй CatalogPage: вкладка "Мои" → список синтезов текущего пользователя (GET /syntheses). Вкладка "Публичные" → синтезы с is_public=true (GET /syntheses/public). Поиск по названию фильтрует в реальном времени»
- «Протестируй SynthesisCard: отображает название, метод×уровень, список философов (через запятую), дату создания. Клик → навигация на /synthesis/:id»
- «Протестируй DocumentFooter: показывает суммарные токены (input + output) и стоимость в формате "$X.XXXX". Данные совпадают с synthesis.totalCostUsd?»
- «Edge case: SynthesisPage для синтеза со status="generating" — показывает индикатор загрузки или подключается к WebSocket для стриминга, а не пустой документ. SynthesisPage для несуществующего ID — 404-страница»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 1.7: Граф категорий (3D + 2D)

**Контекст:**
- `04-code-reuse-map.md` (секция 3 — непереносимое, graph/)
- `05-file-structure.md` (graph/)
- `client/api/elements.ts`
- Исходник: строки 10700–12581 (ВСЯ визуализация графа)

**Извлечение — здесь нужен большой фрагмент:**
```bash
sed -n '10700,12581p' philosynth.html > frag-graph.txt
```

**Первый запрос:**
```
Портирую визуализацию графа категорий в React.

Прикреплён фрагмент исходника (строки 10700–12581): build3D, build2D, 
typeColor, edgeTypeStyle, showNodePanel, buildLegend, и все вспомогательные функции.

Создай:
1. client/components/graph/graph-utils.ts:
   - TC, EC, CPAL, ROLE_REGISTRY — константы (из строки 10700)
   - typeColor, typeColorHex, edgeTypeStyle, _blendHex, _hexToHSL, _hslToHex
   - nodeSymbolPath (D3-формы по роли)
   - nodeGeometry3D (Three.js-геометрии по роли)
   - polyPath, hexStarPath, trapezoidPath, rectPath

2. client/utils/graph-physics.ts:
   - tick(), warmup() — из строки 11098

3. client/utils/graph-geometry.ts:
   - nodeGeometry3D, mkSprite — из строки 11077

4. client/components/graph/Graph3D.tsx:
   - React-обёртка над build3D
   - useEffect для инициализации Three.js scene
   - Очистка при unmount
   - Drag, orbit, zoom, hover, select
   - Торические кольца кластеров
   - Wireframe-эллипсоиды кластеров

5. client/components/graph/Graph2D.tsx:
   - React-обёртка над build2D
   - D3.js force simulation
   - SVG markers, cluster rings, hull

6. client/components/graph/GraphModal.tsx:
   - Вкладки 3D/2D
   - Кнопки экспорта (MMD, PNG, JSON)
   - Toggle кластеров, toggle роль

7. client/components/graph/NodePanel.tsx:
   - showNodePanel → React-компонент
   - Определение, метрики, роли, связи

8. client/components/graph/GraphLegend.tsx

Порт максимально близкий к исходнику — та же физика, те же цвета, те же формы.
```

**Последующие запросы:**
- «Протестируй Graph3D: открой GraphModal для синтеза с 10+ категориями → 3D-сцена рендерится? Узлы видны, рёбра видны? Вращение мышью, зум колёсиком, drag узлов работают?»
- «Протестируй формы узлов по ролям: synthesis → октаэдр, thesis → тетраэдр, antithesis → перевёрнутый тетраэдр, bridge → куб с wireframe. Цвета по типам совпадают с исходником (TC: онтологическая → #e74c3c, эпистемологическая → #3498db)?»
- «Протестируй Graph2D: переключи на вкладку 2D → D3 force simulation, SVG-маркеры стрелок, формы узлов (nodeSymbolPath). Drag узлов работает? Рефлексивные петли (arcPath) рендерятся?»
- «Протестируй NodePanel: клик на узел → панель справа с определением, метриками (центральность, определённость), ролями (structural + procedural), списком входящих/исходящих/рефлексивных связей. Повторный клик — снятие выделения»
- «Протестируй кластеры: кнопка Toggle Clusters → торические кольца (3D) / пунктирные окружности (2D) появляются/скрываются. Wireframe-эллипсоиды кластеров (3D) / convex hull (2D) позиционируются правильно? Спрайты-метки кластеров видны?»
- «Протестируй hover+select: навести на узел → подсветка + соседние узлы подсвечены, остальные dimmed. Клик — фиксация выделения. Клик на пустое место — сброс. Тултип с именем и типом при hover»
- «Edge case: граф с 1 узлом (без рёбер) — рендерится без ошибок. Граф с рефлексивной связью — петля отображается. Мобильный touch: pinch-zoom, single-touch orbit, tap для select»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»


## 4. Протокол Фазы 2: Редактирование и каскады

### Беседа 2.1: Cascade Analyzer + Edit Planner (бэкенд)

**Контекст для загрузки:**
- `01-architecture.md` (секция 4.5 Edit Planner)
- `02-data-model.md` (таблица edit_plans)
- `03-specification.md` (секция 2.6 Edit Plans)
- `04-code-reuse-map.md` (секция 1.1 — cascade-analyzer)
- Из предыдущих бесед: `server/services/synthesis-engine.ts`, `server/services/section-defs-builder.ts`, `server/db/schema.ts`, `shared/types/edit-plan.ts`
- Исходник: строки 5525–5812, 15147–15591

**Извлечение фрагментов перед беседой:**
```bash
sed -n '5525,5812p' philosynth.html > frag-cascade.txt
sed -n '15147,15591p' philosynth.html >> frag-cascade.txt
```

**Первый запрос:**
```
Портирую систему каскадного анализа и планирования редактирования.

Прикреплены: архитектура (Edit Planner), спецификация (Edit Plans API), карта
переиспользования, synthesis-engine.ts, section-defs-builder.ts, schema.ts, типы,
и фрагменты исходника (строки 5525–5812: computeDependents и т.д.; 
строки 15147–15591: recalcEditPlan, updateLiveCascade).

Создай:
1. server/services/cascade-analyzer.ts:
   - computeDependents(effectiveDeps) — из строки 5525
   - sourceOf(ctxKey) — из строки 5555
   - getIntraDependents(sectionKey, subsectionName) — из строки 5570
     Читает INTRA_DEPS через getConfig("intra_deps")
   - getCrossSecDependents(sectionKey, subsectionName) — из строки 5620
     Читает SUBSECTION_TO_CTX_KEYS через getConfig("subsection_ctx_keys")
   - getAffectedModes(changedSections, changedSubsections?) — из строки 5700
   - sortInTopoOrder(keys) — из строки 5760
   - buildFactualDepsMap(ctxLog) — из строки 5780
   - computeFactualDependents(factDeps) — из строки 5800
   - analyzeImpact(synthesisId, plan): полный каскадный анализ —
     вычисляет downstream (какие разделы затронуты), upstream (какие зависимости 
     отсутствуют для добавляемых разделов), активные подстановки, рекомендации.
     Это серверный аналог updateLiveCascade() (строка 15232).

2. server/services/edit-planner.ts:
   - createPlan(synthesisId, userId, actions): 
     Принимает { regen, remove, add, modeRegen, modeRemove },
     вызывает analyzeImpact, добавляет каскадные шаги с cascadeGenerated: true,
     сохраняет в edit_plans, возвращает EditPlan
   - updatePlan(planId, stepUpdates):
     Обновляет статусы шагов (confirmed/skipped), пересчитывает каскад
   - estimatePlanCost(plan):
     Вызывает estimateCost для regen+add шагов + estimateModeCost для mode шагов

3. server/routes/plans.ts:
   - POST /syntheses/:id/plans — вызывает createPlan
   - GET /syntheses/:id/plans/:planId — возвращает план
   - PATCH /syntheses/:id/plans/:planId — вызывает updatePlan
   - DELETE /syntheses/:id/plans/:planId — удаляет план

НЕ делай в этой беседе: исполнение плана (execute) — это беседа 2.2.
```

**Последующие запросы:**
- «Протестируй: создай план с regen=["graph"], remove=[] — проверь, что каскад обнаруживает downstream-зависимости (theses, dialogue и т.д.)»
- «Протестируй: план с add=["dialogue"] для синтеза, у которого нет glossary — проверь upstream-анализ: missing hard dependencies»
- «Проверь estimatePlanCost — сумма должна совпадать с суммой estimateCost для каждого раздела»
- «Edge case: план с remove=["graph"] + add=["graph"] — не должен содержать каскадных шагов для graph»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 2.2: Plan Executor + Regeneration (бэкенд)

**Контекст:**
- `01-architecture.md` (секции 4.4 Streaming, 4.5 Edit Planner)
- `03-specification.md` (секция 3 WebSocket: plan_updated, plan_step_started, plan_step_done)
- Из предыдущих бесед: `server/services/cascade-analyzer.ts` (из 2.1), `server/services/streaming-manager.ts` (из 1.4), `server/services/context-builder.ts` (из 1.3), `server/services/generation-service.ts` (из 1.4), `server/services/edit-planner.ts` (из 2.1), `server/ws/handler.ts` (из 0.2)
- Исходник: строки 15600–16321, 16325–16952

**Извлечение:**
```bash
sed -n '15600,16952p' philosynth.html > frag-executor.txt
```

**Первый запрос:**
```
Реализую исполнение планов редактирования и перегенерацию разделов/подразделов.

Прикреплены: streaming-manager.ts, context-builder.ts, generation-service.ts, 
cascade-analyzer.ts, edit-planner.ts, ws/handler.ts, и фрагмент исходника 
(строки 15600–16952: executeEditPlan, regenerateSection, regenerateSubsection,
deleteSection, addSection).

Создай:
1. Расширение server/services/generation-service.ts:
   - regenerateSection(synthesisId, sectionKey, newCtx?):
     Адаптация строки 15878. Пересобирает промпт для одного раздела,
     стримит через Claude, сохраняет результат, парсит элементы,
     обновляет section в БД, записывает genLog/ctxLog.
   - regenerateSubsection(synthesisId, sectionKey, subsectionName, opts?):
     Адаптация строки 16103. extractRelevantIntraSectionContext через 
     серверный HTML-парсинг, стриминг подраздела, замена в HTML.
   - addSection(synthesisId, sectionKey, ctx?):
     Адаптация строки 16580. Вставка в sectionOrder, перенумерация,
     генерация, сохранение.
   - deleteSection(synthesisId, sectionKey):
     Адаптация строки 16325. Удаление из sections + sectionOrder, 
     перенумерация, запись deletion_marker в genLog.

2. server/services/plan-executor.ts:
   - executePlan(planId):
     a. Загружает план из БД
     b. Обновляет статус → "executing"
     c. Для каждого confirmed шага последовательно:
        - Отправляет plan_step_started через WebSocket
        - Исполняет: deleteSection / regenerateSection / addSection / 
          regenerateSubsection / regenerateModeSilent
        - Записывает result в шаг, отправляет plan_step_done
     d. После каждого шага: пересчитывает каскад (cascade-analyzer),
        если появились новые downstream — добавляет шаги, отправляет 
        plan_steps_added через WebSocket
     e. Обновляет synthesis.version, статус плана → "done"
   
   - cancelPlan(planId): прерывает исполнение

3. Расширение server/ws/handler.ts:
   - Обработка execute_plan → запуск executePlan
   - Обработка confirm_step (для пошагового режима)
   - Обработка cancel

4. server/routes/plans.ts — добавить:
   - POST /syntheses/:id/plans/:planId/execute

5. server/routes/generation.ts:
   - POST /syntheses/:id/regenerate/:sectionKey
   - POST /syntheses/:id/regenerate-subsection
```

**Последующие запросы:**
- «Протестируй: создай синтез с 5 разделами, создай план regen=["graph"], запусти execute — проверь, что graph перегенерирован, genLog содержит запись, ctxLog обновлён»
- «Протестируй каскад: regen=["graph"] → после исполнения, план должен предложить перегенерировать theses (если theses зависит от graph). Проверь plan_steps_added через WebSocket»
- «Протестируй deleteSection: удали "history", проверь что sectionOrder обновлён, номера перенумерованы»
- «Протестируй addSection: добавь "dialogue" к синтезу без dialogue, проверь позицию в sectionOrder и нумерацию»
- «Edge case: regenerateSubsection — подраздел с INTRA_DEPS. Проверь, что extractRelevantIntraSectionContext возвращает только зависимые подразделы, а не все»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 2.3: Edit Modal + Cascade Panel (клиент)

**Контекст:**
- `03-specification.md` (секции 1.5 Редактирование, 2.6 Edit Plans, 3.2 WebSocket)
- `05-file-structure.md` (секция client/components/edit/)
- Из предыдущих бесед: `shared/types/edit-plan.ts`, `shared/types/ws-messages.ts`, `client/hooks/useWebSocket.ts`, `client/stores/synthesis-store.ts`, `client/api/client.ts`
- Исходник: строки 14340–14880 (**только** как визуальный референс UI)

**Извлечение:**
```bash
sed -n '14340,14880p' philosynth.html > frag-edit-ui.txt
```

**Первый запрос:**
```
Создаю UI редактирования синтеза.

Прикреплён фрагмент исходника (строки 14340–14880) — как визуальный референс 
структуры модального окна редактирования. НЕ копировать HTML — создать React.

Создай:
1. client/hooks/useEditPlan.ts:
   - createPlan(actions) → POST /plans → EditPlan
   - updateSteps(planId, updates) → PATCH /plans
   - executePlan(planId) → подписка на WebSocket (plan_step_started, 
     plan_step_done, plan_steps_added)
   - Zustand-состояние: currentPlan, isExecuting, stepResults

2. client/components/edit/EditModal.tsx:
   - Модальное окно на весь экран (как в исходнике)
   - Список разделов с чекбоксами "Перегенерировать" / "Удалить"
   - Поле secCtx для каждого раздела
   - Секция подразделовой перегенерации (SubsectionRegenPanel)
   - Кнопка ▶ Выполнить план
   - Футер: количество действий, оценка стоимости

3. client/components/edit/EditSectionCard.tsx:
   - Карточка одного раздела
   - Чекбоксы перегенерации/удаления (взаимоисключающие)
   - Поле контекста (скрыто, разворачивается)
   - Индикатор: "✓ изменён" если раздел был отредактирован

4. client/components/edit/SubsectionRegenPanel.tsx:
   - Список подразделов текущего раздела
   - Кнопка "⟳" для каждого подраздела
   - Поле userNote
   - Чекбокс "Включить текущее содержимое"
   - Показ зависимых подразделов (intra-deps)
   - Оценка стоимости подраздела

5. client/components/edit/CascadePanel.tsx:
   - Downstream: затронутые, но не включённые в план (кнопка "отметить ↑")
   - Upstream: отсутствующие зависимости для добавляемых разделов
   - Активные подстановки
   - Затронутые режимы
   - Рекомендации по добавлению

6. client/components/edit/EditPlanPanel.tsx:
   - Визуализация плана: список шагов с иконками (◯/⟳/✓/✗)
   - Каскадные шаги выделены визуально
   - Прогресс исполнения в реальном времени (WebSocket)
   - Кнопки подтвердить/пропустить для каждого шага

7. client/components/edit/AddSectionPanel.tsx:
   - Чекбоксы доступных для добавления разделов
   - Поле контекста для каждого
   - Предупреждения о зависимостях

8. client/api/plans.ts:
   - createPlan, getPlan, updatePlan, executePlan, deletePlan
```

**Последующие запросы:**
- «Протестируй поток: открыть EditModal → отметить graph для перегенерации → CascadePanel должен показать downstream (theses, dialogue) → нажать "отметить ↑" для theses → кнопка ▶ активируется»
- «Протестируй исполнение: нажать ▶ → EditPlanPanel показывает прогресс шагов → по завершении все шаги ✓»
- «Протестируй подразделовую перегенерацию: открыть SubsectionRegenPanel для "graph" → выбрать "Таблица категорий" → показать зависимые подразделы»
- «Проверь responsive: модальное окно на мобильных (< 768px)»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 2.4: Лог контекста и генерации

**Контекст:**
- `02-data-model.md` (таблицы generation_log, context_log)
- `04-code-reuse-map.md` (секция 2.7 — mode-service, log-formatter)
- Из предыдущих бесед: `server/db/schema.ts`, `shared/types/generation.ts`, `client/api/client.ts`
- Исходник: строки 19116–19810

**Извлечение:**
```bash
sed -n '19116,19810p' philosynth.html > frag-log.txt
```

**Первый запрос:**
```
Портирую систему логирования контекста и генерации.

Прикреплён фрагмент исходника (строки 19116–19810): formatCtxLog, colorizeLog,
refreshCtxLogIfOpen, viewCtxLog, downloadPrompts.

Создай:
1. server/services/log-formatter.ts:
   - formatCtxLog(synthesisId): 
     Серверный аналог строки 19116. Загружает genLog и ctxLog из БД,
     форматирует в plain text с той же структурой:
     заголовок → общие элементы → для каждого genLog entry: ВХОД/ВЫХОД/СЕКЦИИ.
     Адаптация: genCommon загружается из отдельного поля или вычисляется.
   - formatCtxLogHTML(synthesisId):
     Возвращает { text: string, html: string } — plain + colorized

2. server/routes/logs.ts:
   - GET /syntheses/:id/logs/generation → массив GenerationLogEntry из БД
   - GET /syntheses/:id/logs/context → массив ContextLogEntry из БД
   - GET /syntheses/:id/logs/formatted → { text, html }
   - GET /syntheses/:id/logs/prompts → текстовый дамп всех промптов
     (аналог downloadPrompts/formatPromptsForExport, строка 19750)

3. client/components/logs/colorize-log.ts:
   - colorizeLog(plainText): клиентская раскраска.
     Порт строки 19352. Паттерны: ═══ заголовки, ✓/✗/◦/◌ записи контекста,
     ВХОД/ВЫХОД метки, стоимость, процент бюджета.
     Цветовая палитра: gold, blue, green, red, dim, violet — как в исходнике.

4. client/components/logs/ContextLogViewer.tsx:
   - Модальное окно: кнопка открытия в DocumentFooter
   - Загрузка GET /logs/formatted
   - Рендер HTML (dangerouslySetInnerHTML для colorized)
   - Кнопка "Копировать" (plain text)
   - Кнопка "Скачать промпты"
   - Информация: количество разделов, строк
   - Live-обновление при открытом окне во время генерации (WebSocket)

5. Интеграция: добавить кнопку "◈ Лог" в DocumentFooter.tsx
```

**Последующие запросы:**
- «Протестируй: сгенерируй синтез с 3 разделами, открой лог — проверь что все 3 раздела есть, формат совпадает с исходником»
- «Проверь colorizeLog: строки с ✓ должны быть зелёные, ✗ — красные, ◦ — золотые, бюджеты — dim»
- «Протестируй live-обновление: открой лог, запусти перегенерацию раздела — лог должен обновляться в реальном времени»
- «Проверь форматирование: version-marker, deletion-marker — корректно отображаются»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

## 5. Протокол Фазы 3: Мета-синтез и наследование

### Беседа 3.1: Meta-Synthesis Service + Lineage Service (бэкенд)

**Контекст для загрузки:**
- `01-architecture.md` (секция 4.6 Graph Service — граф наследования)
- `02-data-model.md` (таблица synthesis_lineage + рекурсивный CTE)
- `03-specification.md` (секции 1.6 Мета-синтез, 2.3–2.4 Elements, 2.8 Lineage)
- Из предыдущих бесед: `server/services/context-extractor.ts` (из 1.3), `server/services/generation-service.ts` (из 1.4/2.2), `server/db/schema.ts`, `shared/types/lineage.ts`
- Исходник: строки 17794–18108, 18273–18360

**Извлечение:**
```bash
sed -n '17794,18108p' philosynth.html > frag-meta.txt
sed -n '18273,18360p' philosynth.html >> frag-meta.txt
```

**Первый запрос:**
```
Реализую мета-синтез и навигацию по графу наследования.

Прикреплены: архитектура (граф наследования), модель данных (synthesis_lineage + CTE),
спецификация (Мета-синтез, Lineage API), context-extractor.ts, generation-service.ts,
schema.ts, и фрагмент исходника (строки 17794–18360: importConceptAsParticipant, 
checkGenealogyOverlaps, isAncestor, collectPhilosopherAncestors, reconstructGenealogy).

Создай:
1. server/services/meta-synthesis-service.ts:
   - loadConceptContext(synthesisId):
     Загружает из БД данные для использования концепции как участника:
     capsule (из syntheses.capsule_html → extractCapsuleText),
     graphNodes (из categories → форматирование в таблицу),
     graphEdges (из category_edges),
     glossaryCompact (из glossary_terms),
     thesesSummary (из theses),
     dialogueConcepts (из sections WHERE key='dialogue' → парсинг),
     goals, tensions (из sections WHERE key='sum' → парсинг).
     Аналог importConceptAsParticipant (строка 17794), но из БД.

   - validateConceptForMetaSynthesis(synthesisId):
     Проверяет обязательные разделы: sum, glossary, theses, critique, 
     (graph ИЛИ dialogue), capsule.
     Возвращает { valid: boolean, missing: string[], warnings: string[] }

   - checkGenealogyOverlaps(participants):
     Порт строки 18289. Находит пересечения философов-предков между 
     концепциями-участниками.
     Возвращает массив предупреждений.

   - isAncestor(nodeA, nodeB):
     Порт строки 18101. Рекурсивная проверка.

   - collectPhilosopherAncestors(synthesisId):
     Рекурсивный CTE из synthesis_lineage. Возвращает Set<string> философов.

   - buildConceptContextBlock(concept):
     Формирует текстовый блок контекста концепции для промпта мета-синтеза
     (capsule + graph + glossary + theses + goals + tensions).

2. server/services/lineage-service.ts:
   - getAncestors(synthesisId, maxDepth):
     Рекурсивный CTE вверх. Возвращает LineageNode (дерево).
   - getDescendants(synthesisId, maxDepth):
     Рекурсивный CTE вниз. Возвращает LineageNode[].
   - searchByPhilosophers(names: string[]):
     Находит синтезы, в генеалогии которых есть ВСЕ указанные философы.
     SQL: WITH RECURSIVE + HAVING count = names.length
   - createLineageRecords(synthesisId, participants):
     Записывает synthesis_lineage при создании синтеза.

3. server/routes/lineage.ts:
   - GET /syntheses/:id/lineage/ancestors?depth=10
   - GET /syntheses/:id/lineage/descendants?depth=5
   - GET /lineage/search?philosopher=Кант&philosopher=Хайдеггер

4. Расширение server/services/generation-service.ts:
   - В generateSynthesis: если participants содержит type="synthesis",
     вызвать loadConceptContext для каждого, добавить в промпт через 
     buildConceptContextBlock, записать synthesis_lineage.

5. Расширение server/routes/syntheses.ts:
   - POST /syntheses: принимать participants: ParticipantInput[],
     валидировать через validateConceptForMetaSynthesis,
     передавать в generateSynthesis.
```

**Последующие запросы:**
- «Протестируй: создай два синтеза (Кант+Гегель и Хайдеггер+Сартр), затем мета-синтез из обоих — проверь synthesis_lineage (4 записи: 2 philosopher + 2 synthesis), проверь что контекст обоих концепций попал в промпт»
- «Протестируй searchByPhilosophers: поиск по [Кант] — должен найти и прямой синтез с Кантом, и мета-синтез (транзитивно)»
- «Протестируй checkGenealogyOverlaps: два концепта с общим философом — warning должен содержать имя философа»
- «Протестируй getAncestors для мета-синтеза — дерево должно содержать 2 уровня: концепции → философы»
- «Edge case: мета-синтез с участником, у которого нет glossary — validateConceptForMetaSynthesis возвращает { valid: false, missing: ["glossary"] }»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 3.2: Concept Participants + Genealogy Tree (клиент)

**Контекст:**
- `03-specification.md` (секции 1.6 Мета-синтез, 2.8 Lineage)
- `05-file-structure.md` (synthesis/, lineage/)
- Из предыдущих бесед: `shared/types/lineage.ts`, `client/api/client.ts`, `client/stores/synthesis-store.ts`, `client/components/synthesis/SynthesisForm.tsx` (из 1.5)
- Исходник: строки 18110–18267 (renderGenealogyTree, renderConceptParticipants — **визуальный** референс)

**Извлечение:**
```bash
sed -n '18110,18267p' philosynth.html > frag-genealogy-ui.txt
```

**Первый запрос:**
```
Создаю UI для мета-синтеза и генеалогического дерева.

Прикреплён фрагмент исходника (строки 18110–18267): renderGenealogyTree 
(CSS org-chart), renderConceptParticipants (карточки концепций).
Визуальный референс — не копировать HTML, создать React.

Создай:
1. client/components/synthesis/ConceptParticipants.tsx:
   - Секция "Концепции-участники" в SynthesisForm
   - Кнопка "Добавить концепцию" → модальное окно выбора из каталога
   - Поиск по каталогу (GET /syntheses/public?search=...)
   - Карточка добавленной концепции: имя, метод×уровень, источники
     контекста (граф, диалог, глоссарий, тезисы), зерно (превью)
   - Кнопки: переименовать (✎), удалить (✕)
   - Проверка пригодности при добавлении (вызов validateConceptForMetaSynthesis)
   - Предупреждения о генеалогических пересечениях

2. client/components/lineage/GenealogyTree.tsx:
   - CSS org-chart (как в исходнике: .gen-tree, .gen-card, .gen-phil)
   - Рекурсивный рендер LineageNode:
     - Философ → простой блок с именем
     - Концепция → карточка (имя, метод×уровень, зерно, капсула в <details>)
   - Подключаемые стили: светлый (.gen-tree-light) и тёмный
   - Вертикальная раскладка при > 4 участниках

3. client/components/lineage/LineageSearch.tsx:
   - Поиск концепций по философам-предкам
   - Мульти-селект философов
   - Результаты: список карточек SynthesisCard

4. Интеграция с SynthesisPage.tsx:
   - Секция "Генеалогия" под шапкой документа (для мета-синтезов)
   - Ссылки на родительские концепции (кликабельные)
   
5. Интеграция с CatalogPage.tsx:
   - Фильтр "Потомки концепции X"
   - В карточке синтеза: badge "мета-синтез" если есть parent_synthesis_id

6. client/api/lineage.ts:
   - getAncestors(id, depth), getDescendants(id, depth), searchByPhilosophers(names)
```

**Последующие запросы:**
- «Протестируй поток: CreateSynthesis → добавить 2 концепции из каталога → проверить что карточки отображаются → создать синтез → на SynthesisPage отображается дерево генеалогии»
- «Протестируй GenealogyTree: мета-синтез 2-го уровня (мета-синтез из мета-синтезов) — дерево должно быть 3 уровня глубины»
- «Протестируй LineageSearch: ввести "Кант" → результаты включают все синтезы с Кантом в генеалогии (прямые и транзитивные)»
- «Проверь GenealogyTree на мобильных: горизонтальный скролл, вертикальная раскладка»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

## 6. Протокол Фазы 4: Режимы и экспорт

### Беседа 4.1: Mode Service (бэкенд + клиент)

**Контекст для загрузки:**
- `01-architecture.md` (секция 4.2 — режимы в Synthesis Engine)
- `02-data-model.md` (таблица mode_results)
- `03-specification.md` (секции 1.7 Режимы, 2.7 Modes API, 3.2 WebSocket — mode_done)
- Из предыдущих бесед: `server/services/streaming-manager.ts`, `server/services/context-builder.ts`, `server/services/prompt-registry.ts`, `server/ws/handler.ts`, `client/hooks/useWebSocket.ts`
- Исходник: строки 18360–19023

**Извлечение:**
```bash
sed -n '18360,19023p' philosynth.html > frag-modes.txt
```

**Первый запрос:**
```
Реализую систему режимов (оппонент, переводчик, временной срез).

Прикреплён фрагмент исходника (строки 18360–19023): MODE_CONFIG, buildModeContext,
runMode, regenerateModeSilent, openModeModal, buildModeTabsBar, switchModeTab.

Создай:
1. server/services/mode-service.ts:
   - getModeConfig(modeKey):
     Возвращает конфиг режима. Промпты из Prompt Registry 
     (ключи: "mode.adversarial.prompt", "mode.translator.prompt", 
     "mode.timeslice.prompt"). Статические поля (title, desc, 
     paramLabel, paramPlaceholder, suggestions) — из конфига или хардкод.
   
   - buildModeContext(modeKey, synthesisId):
     Порт строки 18420. Собирает контекст из разделов синтеза:
     capsule + graphNodes + theses + glossary + dialogue + critique
     (через context-extractor).
   
   - checkModeDeps(modeKey, synthesisId):
     Проверяет наличие необходимых разделов для режима.
     Возвращает предупреждения.
   
   - runMode(synthesisId, modeKey, paramValue, apiKey):
     Порт строки 18839. Собирает промпт (config.buildPrompt + context),
     стримит через streaming-manager, сохраняет в mode_results,
     записывает genLog, возвращает usage.
   
   - regenerateModeSilent(synthesisId, modeKey, resultIndex):
     Порт строки 18967. Перегенерирует один результат по его индексу.

2. server/routes/modes.ts:
   - POST /syntheses/:id/modes/:modeKey/run { param }
   - GET /syntheses/:id/modes → все режимы с результатами
   - GET /syntheses/:id/modes/:modeKey → результаты одного режима
   - DELETE /syntheses/:id/modes/:modeKey/:index

3. Расширение server/ws/handler.ts:
   - Обработка start_mode → runMode, отправка stream_delta, mode_done

4. client/components/modes/ModeModal.tsx:
   - Модальное окно: заголовок, описание, поле параметра
   - Кнопки-подсказки (suggestions)
   - Предупреждения о зависимостях
   - Кнопка "Генерировать" со спиннером
   - Оценка стоимости
   - Вкладки результатов (ModeTabBar)
   - Контент результата (ModeContent)

5. client/components/modes/ModeTabBar.tsx:
   - Вкладки: параметр + дата
   - Кнопка × для удаления вкладки
   - Спиннер для генерирующейся вкладки

6. client/components/modes/ModeContent.tsx:
   - Рендер HTML-результата (dangerouslySetInnerHTML)

7. client/api/modes.ts: runMode, getModes, deleteMode

8. Интеграция с SynthesisPage.tsx:
   - Кнопки режимов (◈ Оппонент, ◈ Переводчик, ◈ Временной срез)
   - Отображение count результатов на кнопке
```

**Последующие запросы:**
- «Протестируй: открой ModeModal "adversarial" → введи "Кант" → генерация → результат появляется во вкладке → закрой и открой заново — вкладка сохранена»
- «Протестируй несколько запусков: 3 запуска "adversarial" с разными параметрами → 3 вкладки → переключение, удаление средней»
- «Протестируй checkModeDeps: режим для синтеза без capsule — должно быть предупреждение»
- «Проверь стоимость: estimateModeCost → отображается в ModeModal»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 4.2: Export Service

**Контекст:**
- `03-specification.md` (секции 1.8 Экспорт, 2.11 Export API)
- `04-code-reuse-map.md` (секция 2.5 — экспорт)
- Из предыдущих бесед: `server/db/schema.ts`, `server/services/graph-parser.ts` (из 1.4)
- Исходник: строки 12808–14171

**Извлечение:**
```bash
sed -n '12808,14171p' philosynth.html > frag-export.txt
```

**Первый запрос:**
```
Реализую экспорт синтезов в различные форматы.

Прикреплён фрагмент исходника (строки 12808–14171): exportMMD, exportPNG, 
exportJSON, saveHTML, buildGraphExportSection, buildModesExportSection, auditCSS.

Создай:
1. server/services/export/mmd-exporter.ts:
   - exportMMD(synthesisId):
     Порт строки 12808. Загружает categories + edges из БД,
     строит Mermaid-диаграмму: subgraph по кластерам, формы узлов 
     по процессуальным ролям, стили по типам, linkStyle по силе связей.
     Возвращает string (Mermaid-код).

2. server/services/export/json-exporter.ts:
   - exportJSON(synthesisId):
     Порт строки 13483. Загружает nodes, edges, clusters из БД,
     форматирует в структуру { meta, nodes, edges, clusters }.

3. server/services/export/png-exporter.ts:
   - exportPNG(synthesisId):
     Порт строки 13030. Два варианта реализации:
     a. Серверный Canvas (node-canvas): warmup layout → рисование 
        узлов/рёбер/кластеров/легенды → PNG blob
     b. Генерация SVG → конвертация в PNG через sharp
     Выбрать вариант (a) — ближе к исходнику.

4. server/services/export/html-exporter.ts:
   - exportHTML(synthesisId):
     Порт saveHTML (строка 14173). Собирает самодостаточный HTML:
     a. Загружает synthesis + sections + capsule из БД
     b. Рендерит шаблон документа (CSS + HTML шапка + разделы)
     c. Встраивает JSON-состояние (<script type="application/json" 
        id="philosynth-state">)
     d. Встраивает graph section (buildGraphExportSection, строка 13860):
        Three.js + D3.js CDN ссылки, сериализованные функции графа,
        клонированное модальное окно
     e. Встраивает modes section (buildModesExportSection, строка 13712)
     f. auditCSS — убирает неиспользуемые стили (строка 14006)
     g. Встраивает лог контекста (details + script)

5. server/utils/css-audit.ts:
   - auditCSS(cssText, contentToCheck):
     Порт строки 14006. Парсер CSS → консервативное удаление 
     неиспользуемых классов.

6. server/routes/export.ts:
   - GET /syntheses/:id/export/html → Content-Type: text/html
   - GET /syntheses/:id/export/mmd → Content-Type: text/plain
   - GET /syntheses/:id/export/png → Content-Type: image/png
   - GET /syntheses/:id/export/json → Content-Type: application/json

7. Кнопки экспорта в SynthesisPage.tsx:
   - Выпадающее меню: HTML, Mermaid, PNG, JSON
   - Скачивание через download-ссылки
```

**Последующие запросы:**
- «Протестируй exportMMD: граф с 8 узлами, 3 кластерами — Mermaid валидный? Вставь в mermaid.live и проверь»
- «Протестируй exportJSON: структура соответствует спецификации (meta, nodes, edges, clusters)?»
- «Протестируй exportHTML: скачанный файл открывается в браузере, граф работает (3D/2D), лог контекста отображается?»
- «Протестируй exportHTML: импортируй скачанный файл обратно через POST /syntheses/import — все данные восстанавливаются?»
- «Edge case: exportPNG для синтеза без графа — корректная ошибка 400»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 4.3: Import Service

**Контекст:**
- `03-specification.md` (секция 1.9 Импорт)
- `04-code-reuse-map.md` (секция 2.6 — импорт)
- Из предыдущих бесед: `server/db/schema.ts`, `server/services/graph-parser.ts`, `server/services/element-parser.ts`, `server/services/lineage-service.ts` (из 3.1)
- Исходник: строки 16955–17657

**Извлечение:**
```bash
sed -n '16955,17657p' philosynth.html > frag-import.txt
```

**Первый запрос:**
```
Реализую импорт HTML-файлов PhiloSynth.

Прикреплён фрагмент исходника (строки 16955–17657): handleImportFile, importHTML,
extractMetadata, extractSections, extractEmbeddedState, extractModesFromHTML,
populateFromImport, buildDocStateFromImport, validateImportMeta.

Создай:
1. server/services/import-service.ts:
   - importHTML(htmlString, userId, filename?):
     Порт строки 17122. Серверный DOM-парсинг через linkedom:
     a. parseFromString(htmlString)
     b. extractMetadata(doc) — строка 17196: философы, метод, глубина, 
        уровень, зерно, контекст, капсула из шапки
     c. extractSections(doc) — строка 17324: .doc-section → key, num, 
        title, html, secCtx
     d. extractEmbeddedState(doc) — строка 17374: JSON из 
        <script id="philosynth-state">
     e. validateImportMeta(meta, embeddedState) — строка 17256: 
        проверка обязательных полей, предупреждения
     f. Создание записи в syntheses
     g. Создание записей в sections
     h. Парсинг графа → categories, category_edges, cluster_labels
     i. Парсинг тезисов → theses
     j. Парсинг глоссария → glossary_terms
     k. Восстановление genLog, ctxLog из embeddedState
     l. Построение synthesis_lineage из генеалогии
     m. Восстановление mode_results из extractModesFromHTML
     Возвращает { synthesisId, warnings }

   - extractModesFromHTML(doc):
     Порт строки 17390. Парсинг .philosynth-mode элементов.

   - reconstructGenealogy(meta, embeddedState, doc):
     Порт строки 17957. Восстановление дерева наследования.

2. server/routes/import.ts:
   - POST /syntheses/import — multipart/form-data
     Принимает HTML-файл, вызывает importHTML,
     возвращает { id, warnings }

3. client/pages/ImportPage.tsx:
   - Drag & drop зона для файла
   - Кнопка выбора файла
   - Прогресс загрузки
   - Предупреждения из validateImportMeta
   - Кнопка "Подтвердить импорт" / "Отмена"
   - Redirect на SynthesisPage после успеха

4. client/api/import.ts: importFile(file)
```

**Последующие запросы:**
- «Протестируй: экспортируй синтез через exportHTML → импортируй обратно → сравни: все разделы на месте? categories совпадают? genLog восстановлен?»
- «Протестируй с реальным файлом: загрузи файл из standalone PhiloSynth → импорт с предупреждениями (метод не распознан и т.д.) → синтез создан, разделы на месте»
- «Протестируй невалидный файл: загрузи обычный HTML (не PhiloSynth) → ошибка IMPORT_INVALID»
- «Протестируй файл без embedded state: только HTML-разделы → импорт с предупреждением "Лог отсутствует"»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

## 7. Протокол Фазы 5: Inline-редактирование элементов

### Беседа 5.1: Element Editor + Versioning (бэкенд)

**Контекст для загрузки:**
- `01-architecture.md` (секция 4.7 Element Editor)
- `02-data-model.md` (таблица element_versions)
- `03-specification.md` (секции 1.5 E7–E9, 2.4 Elements API + ImpactAnalysis)
- Из предыдущих бесед: `server/db/schema.ts`, `server/services/cascade-analyzer.ts` (из 2.1)
- Исходник: НЕ НУЖЕН (полностью новая функциональность)

**Первый запрос:**
```
Реализую ручное редактирование элементов синтеза и версионирование.

Эта функциональность ОТСУТСТВУЕТ в исходнике — полностью новый код.
Прикреплены: архитектура (Element Editor), модель данных (element_versions),
спецификация (Elements API, ImpactAnalysis), cascade-analyzer.ts.

Создай:
1. server/services/element-editor.ts:
   - updateCategory(categoryId, updates):
     a. Загружает текущую категорию
     b. Создаёт запись в element_versions (снимок до изменения)
     c. Обновляет categories
     d. Вычисляет impact: через SUBSECTION_TO_CTX_KEYS определяет, 
        какие подразделы ссылаются на эту категорию.
        Через cascade-analyzer определяет downstream-секции.
     e. Возвращает { category, impact: ImpactAnalysis }

   - updateThesis(thesisId, updates):
     Аналогично. Impact: какие разделы используют тезисы как контекст.

   - updateGlossaryTerm(termId, updates):
     Аналогично. Impact: кто использует глоссарий.

   - updateCategoryEdge(edgeId, updates):
     Обновление связи графа.

   - autoRenameReferences(synthesisId, oldName, newName):
     При переименовании категории: поиск oldName в html_content 
     всех sections, замена на newName. Возвращает список затронутых секций.

   - computeElementImpact(elementType, elementId, synthesisId):
     Общий метод вычисления "зоны поражения":
     a. Определяет, к какому разделу принадлежит элемент
     b. Через SUBSECTION_TO_CTX_KEYS находит, какие подразделы 
        используют данные этого типа
     c. Через cascade-analyzer находит downstream-секции
     d. Через getAffectedModes находит затронутые режимы
     e. Определяет severity: "none" / "low" / "high"

2. server/services/element-versioning.ts:
   - createVersion(elementId, elementType, data, changeSource):
     Вставка в element_versions с автоинкрементом version.
   
   - getVersionHistory(elementId, elementType):
     Все версии элемента, отсортированные по version desc.
   
   - rollbackToVersion(elementId, elementType, version):
     Восстановление данных из element_versions.
     Создаёт новую версию с changeSource="rollback".

3. server/routes/elements.ts:
   - GET /syntheses/:id/categories → список с edges, clusters, topology
   - GET /syntheses/:id/categories/:catId → одна категория
   - PATCH /syntheses/:id/categories/:catId → updateCategory
   - GET /syntheses/:id/theses → список
   - PATCH /syntheses/:id/theses/:thesisId → updateThesis
   - GET /syntheses/:id/glossary → список
   - PATCH /syntheses/:id/glossary/:termId → updateGlossaryTerm
   - GET /syntheses/:id/elements/:elementId/versions → getVersionHistory
   - POST /syntheses/:id/elements/:elementId/rollback { version } → rollback
```

**Последующие запросы:**
- «Протестируй: PATCH category с name="Новое имя" → element_versions содержит старое значение, impact содержит затронутые секции»
- «Протестируй autoRenameReferences: переименуй категорию "Бытие" → "Существование" → html_content всех секций обновлён»
- «Протестируй rollback: версия 1 → изменение → версия 2 → rollback к 1 → данные восстановлены, создана версия 3 с source="rollback"»
- «Протестируй computeElementImpact для категории, которая упоминается в тезисах и глоссарии — severity="high"»
- «Edge case: удаление связи (edge) — impact на подраздел "Таблица связей"»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 5.2: Element Editor UI (клиент)

**Контекст:**
- `03-specification.md` (секция 2.4 Elements API)
- `05-file-structure.md` (edit/ElementEditor.tsx)
- Из предыдущих бесед: `shared/types/graph.ts`, `shared/types/elements.ts`, `client/components/graph/NodePanel.tsx` (из 1.7), `client/components/document/SectionView.tsx` (из 1.6), `client/api/elements.ts`
- Исходник: НЕ НУЖЕН

**Первый запрос:**
```
Создаю UI для ручного редактирования элементов синтеза.

Эта функциональность ОТСУТСТВУЕТ в исходнике — новый React-код.
Прикреплены: спецификация (Elements API), types, NodePanel, SectionView.

Создай:
1. client/components/edit/ElementEditor.tsx:
   - Компонент, встраиваемый в контекст документа
   - Режим "просмотр" (по умолчанию) и "редактирование" (по клику)
   - Inline-формы для полей элемента
   - Кнопки "Сохранить" / "Отмена"
   - После сохранения: показ ImpactAnalysis (какие секции затронуты)
   - Кнопки действий: "Перегенерировать затронутые", "Автозамена имён", "Ничего"

2. client/components/edit/CategoryEditor.tsx:
   - Специализированный редактор категории:
   - Поля: name, type (select), definition (textarea), 
     centrality (slider 0–1), certainty (slider 0–1), origin (textarea)
   - Предпросмотр: как будет выглядеть в таблице графа

3. client/components/edit/ThesisEditor.tsx:
   - Поля: formulation (textarea), justification (textarea), 
     thesisType (select), noveltyDegree (текст)

4. client/components/edit/GlossaryTermEditor.tsx:
   - Поля: term, definition, extraColumns (динамические по synth_level)

5. client/components/edit/VersionHistory.tsx:
   - Список версий элемента (дата, источник изменения, превью данных)
   - Кнопка "Откатить" для каждой версии
   - Diff-view: визуальное сравнение двух версий

6. Интеграция с NodePanel.tsx (из 1.7):
   - Кнопка "✎ Редактировать" в панели информации узла
   - Клик → открытие CategoryEditor для этого узла

7. Интеграция с SectionView.tsx:
   - При наведении на строку таблицы тезисов/глоссария — кнопка "✎"
   - Клик → inline-редактирование

8. client/api/elements.ts — расширение:
   - updateCategory, updateThesis, updateGlossaryTerm
   - getVersionHistory, rollbackToVersion
```

**Последующие запросы:**
- «Протестируй поток: открыть граф → кликнуть узел → NodePanel → кнопка "Редактировать" → CategoryEditor → изменить имя → сохранить → ImpactAnalysis показывает затронутые секции»
- «Протестируй inline-редактирование тезиса: навести на строку в таблице → ✎ → ThesisEditor → изменить формулировку → сохранить»
- «Протестируй VersionHistory: изменить категорию 3 раза → открыть историю → 3 версии → откатить к первой → данные восстановлены»
- «Проверь автозамену: переименовать категорию → предложение автозамены → подтвердить → html_content обновлён»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 5.3: Extended Characteristics + Enrichment Service (бэкенд)

**Контекст для загрузки:**
- `01-architecture.md` (секции 4.8 Element Taxonomy, 4.9 Element Enrichment)
- `02-data-model.md` (таблицы element_enrichments, characteristic_justifications)
- `03-specification.md` (секции 2.14 Enrichment API, 1.12 EN1–EN6)
- Из предыдущих бесед: `server/services/element-editor.ts` (из 5.1), `server/services/streaming-manager.ts` (из 1.4), `server/services/prompt-registry.ts` (из 0.3), `server/services/element-taxonomy.ts` (из 0.3b)
- Исходник: НЕ НУЖЕН (полностью новая функциональность)

**Первый запрос:**
```
Реализую точечные Claude-запросы для обогащения элементов и обоснования характеристик.

Полностью новый код (идея из предыдущего проекта). Прикреплены: архитектура
(Element Enrichment), модель данных (element_enrichments, characteristic_justifications),
спецификация (Enrichment API), element-editor.ts, streaming-manager.ts, prompt-registry.ts.

Создай:
1. server/services/element-enrichment.ts:
   - enrichCategory(synthesisId, categoryId, enrichmentType):
     a. Загружает категорию и контекст синтеза (seed, метод, философы)
     b. Формирует промпт из Registry: "enrichment.category.description" или
        "enrichment.category.evolution"
     c. Стримит через streaming-manager
     d. Сохраняет в element_enrichments
     e. Возвращает { enrichment, usage }

   - enrichEdge(synthesisId, edgeId, enrichmentType):
     Аналогично. Промпты: "enrichment.edge.justification",
     "enrichment.edge.counterarguments"

   - justifyCharacteristic(elementId, elementType, characteristic, value):
     a. Загружает элемент + контекст
     b. Промпт: "enrichment.characteristic_justification"
        Пример: «Я определил для категории "Бытие" характеристику centrality = 0.9.
        Предложи философские основания для такой оценки, ограничения
        и альтернативные подходы»
     c. Сохраняет в characteristic_justifications
     d. Возвращает { justification, usage }

   - getEnrichments(elementId, elementType): история обогащений
   - getJustifications(elementId, elementType): история обоснований

2. Промптовые шаблоны (добавить в seed-prompts.ts или через Admin UI):
   - enrichment.category.description
   - enrichment.category.evolution
   - enrichment.edge.justification
   - enrichment.edge.counterarguments
   - enrichment.characteristic_justification

3. server/routes/enrichment.ts:
   - POST /syntheses/:id/enrich/category/:catId
   - POST /syntheses/:id/enrich/edge/:edgeId
   - POST /syntheses/:id/justify-characteristic
   - GET /syntheses/:id/enrichments/:elementId
   - GET /syntheses/:id/justifications/:elementId

4. Расширение ws/handler.ts:
   - Обработка start_enrichment → enrichCategory/enrichEdge
   - Отправка enrichment_delta, enrichment_done
```

**Последующие запросы:**
- «Протестируй enrichCategory: выбери категорию из синтеза → enrichmentType="description" → стриминг через WebSocket → результат сохранён в element_enrichments»
- «Протестируй justifyCharacteristic: centrality=0.9 для категории "Бытие" → ответ содержит философские основания, ограничения, альтернативные подходы»
- «Протестируй getEnrichments: после 2 обогащений одной категории → массив из 2 записей с разными типами»
- «Протестируй стоимость: enrichment записывает input_tokens, output_tokens, cost_usd»
- «Edge case: enrichCategory для несуществующей категории → 404. justifyCharacteristic с value вне диапазона [0,1] → 400»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 5.4: Характеристики + Обогащение + Таксономия UI (клиент)

**Контекст для загрузки:**
- `03-specification.md` (секции 2.13 Taxonomy, 2.14 Enrichment)
- Из предыдущих бесед: `server/services/element-enrichment.ts` (из 5.3), `server/services/element-taxonomy.ts` (из 0.3b), `client/components/edit/ElementEditor.tsx` (из 5.2), `client/components/graph/NodePanel.tsx` (из 1.7)
- Исходник: НЕ НУЖЕН

**Первый запрос:**
```
Создаю UI для расширенных характеристик, обогащения элементов и таксономии.

Полностью новый код. Прикреплены: спецификация (Taxonomy + Enrichment API),
element-enrichment.ts, element-taxonomy.ts, ElementEditor.tsx, NodePanel.tsx.

Создай:
1. client/components/edit/CharacteristicSlider.tsx:
   - Слайдер (range input) для числовой характеристики
   - Подпись: название характеристики + текущее значение
   - Кнопка «?» (обоснование) → запрос justifyCharacteristic → 
     показ результата в popover/tooltip
   - onChange → обновление через PATCH API
   - Поддержка: centrality, certainty, historical_significance (0–1),
     innovation_degree (1–5, целое)

2. client/components/edit/EnrichmentPanel.tsx:
   - Кнопка «Обогатить» → выбор типа обогащения (описание/эволюция/обоснование)
   - Стриминг результата через WebSocket (enrichment_delta)
   - Отображение результата в expandable карточке
   - История обогащений (GET /enrichments/:elementId)
   - Для каждого обогащения: тип, дата, стоимость, контент

3. client/components/edit/TaxonomySelector.tsx:
   - Select/Combobox: список типов из каталога
   - При вводе свободного текста → POST /taxonomy/normalize → suggestions
   - Кнопка «+ Создать новый тип» → POST /taxonomy/category-types
   - Индикатор: «из каталога» (зелёный) или «свободный текст» (серый)

4. Интеграция с NodePanel.tsx:
   - Добавить CharacteristicSlider для всех характеристик категории:
     centrality, certainty, historical_significance, innovation_degree
   - Добавить кнопку «Обогатить» → EnrichmentPanel
   - Заменить текстовый тип на TaxonomySelector

5. Интеграция с ElementEditor.tsx для связей:
   - CharacteristicSlider: strength, certainty, historical_support, logical_necessity
   - TaxonomySelector для типа связи

6. client/api/taxonomy.ts:
   - getCategoryTypes, getRelationshipTypes, normalizeType, createCustomType

7. client/api/enrichment.ts:
   - enrichCategory, enrichEdge, justifyCharacteristic,
     getEnrichments, getJustifications
```

**Последующие запросы:**
- «Протестируй CharacteristicSlider: изменить centrality через слайдер → PATCH API вызван → значение обновлено. Нажать «?» → justification отображается в popover»
- «Протестируй EnrichmentPanel: кнопка "Обогатить" → тип "описание" → стриминг → результат в карточке. Повторный запрос → история содержит 2 записи»
- «Протестируй TaxonomySelector: ввести "диалектическая" → автокомплит показывает "Диалектическая (dialectical)". Ввести "новый_тип" → normalize возвращает null → кнопка "Создать" появляется»
- «Протестируй интеграцию с NodePanel: открыть граф → кликнуть узел → панель содержит 4 слайдера + кнопку "Обогатить" + TaxonomySelector для типа»
- «Edge case: innovation_degree — дискретный слайдер (1–5), не непрерывный. CharacteristicSlider для readOnly синтеза — disabled»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 5.5: Representation Transformer — graph↔theses (бэкенд + клиент)

**Контекст для загрузки:**
- `01-architecture.md` (секция 4.10 Representation Transformer)
- `02-data-model.md` (таблица representation_transforms)
- `03-specification.md` (секция 2.15 Transforms API, требования RT1–RT5)
- Из предыдущих бесед: `server/services/graph-parser.ts` (из 1.4), `server/services/element-parser.ts` (из 1.4), `server/services/element-taxonomy.ts` (из 0.3b), `server/services/streaming-manager.ts` (из 1.4), `server/services/prompt-registry.ts` (из 0.3), `server/db/schema.ts`
- Клиентские: `client/components/graph/GraphModal.tsx` (из 1.7), `client/components/document/SectionView.tsx` (из 1.6)
- Исходник: НЕ НУЖЕН (полностью новая функциональность)

**Первый запрос:**
```
Реализую двунаправленную трансформацию graph↔theses — прямую конверсию
между структурным и пропозициональным представлением концепции.

Это НЕ каскадная перегенерация (которая использует раздел как контекст).
Это прямая трансформация: граф → тезисы или тезисы → граф, где источник —
единственный вход, а промпт оптимизирован для конверсии.

Прикреплены: архитектура (Representation Transformer), модель данных
(representation_transforms), спецификация (Transforms API), graph-parser.ts,
element-parser.ts, element-taxonomy.ts, streaming-manager.ts, prompt-registry.ts.

Создай:

БЭКЕНД:
1. server/services/representation-transformer.ts:
   - transformGraphToTheses(synthesisId):
     a. Загружает ВСЕ categories + category_edges + cluster_labels из БД
     b. Формирует промпт из Registry: "transform.graph_to_theses"
        (отличается от промпта раздела "theses" — здесь вход: чистый граф,
        без зерна/контекста/secCtx, задача: вывести утверждения из структуры)
     c. Делает снимок текущих тезисов → source_snapshot
     d. Делает снимок текущего графа → для аудита
     e. Стримит через streaming-manager
     f. Парсит результат → theses (через element-parser)
     g. Заменяет тезисы в БД (DELETE old + INSERT new)
     h. Сохраняет запись в representation_transforms
     i. Возвращает { summary, usage }

   - transformThesesToGraph(synthesisId):
     a. Загружает ВСЕ theses из БД
     b. Промпт из Registry: "transform.theses_to_graph"
        (вход: список тезисов с формулировками и обоснованиями,
        задача: вывести категории, связи, кластеры, роли)
     c. Снимок текущего графа → source_snapshot
     d. Стримит → парсит HTML → parseGraphFromHTML → saveGraphToDb
     e. Нормализация типов через element-taxonomy
     f. Сохраняет в representation_transforms
     g. Возвращает { summary, usage }

   - getTransformHistory(synthesisId):
     SELECT из representation_transforms ORDER BY created_at DESC

   - rollbackTransform(transformId):
     a. Загружает source_snapshot
     b. Определяет direction: если graph_to_theses → восстанавливает тезисы
        из source_snapshot; если theses_to_graph → восстанавливает граф
     c. Записывает rollback как новую трансформацию (для аудита)

2. Промптовые шаблоны (добавить в seed или Admin UI):
   - transform.graph_to_theses: «На основе графа категорий [ГРАФ]
     сформулируй тезисы. Каждый тезис должен логически следовать из
     структурных отношений между категориями...»
   - transform.theses_to_graph: «На основе тезисов [ТЕЗИСЫ]
     построй граф категорий. Выдели ключевые категории, установи связи,
     определи кластеры и роли...»

3. server/routes/transforms.ts:
   - POST /syntheses/:id/transform/graph-to-theses
   - POST /syntheses/:id/transform/theses-to-graph
   - GET /syntheses/:id/transforms
   - POST /syntheses/:id/transforms/:transformId/rollback

4. Расширение ws/handler.ts:
   - start_transform → transformGraphToTheses / transformThesesToGraph
   - Отправка stream_delta, transform_done

КЛИЕНТ:
5. client/components/edit/TransformPanel.tsx:
   - Две кнопки: «Граф → Тезисы» и «Тезисы → Граф»
   - Предупреждение: «Текущие [тезисы/граф] будут заменены»
   - Превью: что будет потеряно (количество тезисов/категорий)
   - Прогресс стриминга
   - После трансформации: summary (создано N, удалено M)

6. client/components/edit/TransformHistory.tsx:
   - Список трансформаций: направление, дата, summary
   - Кнопка «Откатить» для каждой записи
   - Confirmation dialog: «Восстановить [граф/тезисы] на момент [дата]?»

7. Интеграция:
   - В GraphModal.tsx: кнопка «→ Тезисы» в тулбаре
   - В SectionView.tsx для раздела theses: кнопка «→ Граф»
   - В EditModal.tsx: секция «Трансформации» с TransformHistory

8. client/api/transforms.ts:
   - transformGraphToTheses, transformThesesToGraph,
     getTransformHistory, rollbackTransform
```

**Последующие запросы:**
- «Протестируй graph→theses: синтез с 10 категориями и 5 тезисами → трансформация → новые тезисы (количество может отличаться) → старые тезисы в source_snapshot → representation_transforms содержит запись»
- «Протестируй theses→graph: синтез с 8 тезисами → трансформация → новый граф → categories заменены → нормализация типов через taxonomy → representation_transforms содержит запись»
- «Протестируй итеративный цикл: graph→theses → изменить тезис №2 (PATCH) → theses→graph → проверить что граф изменился → graph→theses → проверить что тезис №2 повлиял на результат»
- «Протестируй rollback: после graph→theses → rollback → тезисы восстановлены из snapshot → запись rollback создана»
- «Протестируй TransformPanel UI: кнопка "Граф → Тезисы" → предупреждение → подтверждение → стриминг → summary → история содержит запись → кнопка "Откатить" работает»
- «Edge case: трансформация для синтеза без тезисов (theses→graph когда тезисов 0) → ошибка 400 "No theses to transform". Трансформация без графа → аналогичная ошибка»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

## 8. Протокол Фазы 6: Биллинг и админка

### Беседа 6.1: Billing Service + API Key Management (бэкенд)

**Контекст для загрузки:**
- `01-architecture.md` (секция Масштабирование — оплата)
- `02-data-model.md` (таблицы api_keys, transactions, api_usage)
- `03-specification.md` (секции 1.11 Биллинг, 2.10 Billing API)
- Из предыдущих бесед: `server/db/schema.ts`, `server/middleware/auth.ts` (из 0.2), `server/services/streaming-manager.ts` (из 1.4)
- Исходник: НЕ НУЖЕН (полностью новая функциональность)

**Первый запрос:**
```
Реализую систему биллинга: BYO-Key + баланс сервиса.

Полностью новый код. Прикреплены: архитектура, модель данных (api_keys, 
transactions, api_usage), спецификация (Billing API), auth middleware, 
streaming-manager.

Создай:
1. server/services/api-key-service.ts:
   - storeApiKey(userId, apiKey):
     a. Шифрование AES-256-GCM (ключ из env ENCRYPTION_KEY)
     b. Сохранение encrypted_key + key_prefix (первые 14 символов)
     c. Возвращает { keyId, prefix }
   - getDecryptedKey(userId):
     Загружает активный ключ, дешифрует, возвращает plain text
   - deleteApiKey(keyId, userId)
   - listApiKeys(userId): id, prefix, isActive, createdAt (без ключа)

2. server/services/billing-service.ts:
   - getBalance(userId): из users.balance_usd
   - createTopup(userId, amountUsd):
     a. Stripe PaymentIntent
     b. Возвращает clientSecret для Stripe Elements
   - confirmTopup(userId, stripePaymentIntentId):
     a. Проверяет статус в Stripe
     b. Обновляет users.balance_usd
     c. Создаёт запись в transactions (type: "topup")
   - chargeUsage(userId, synthesisId, sectionKey, inputTokens, outputTokens):
     a. Рассчитывает стоимость (PRICE_IN * inputTokens + PRICE_OUT * outputTokens)
     b. Проверяет баланс
     c. Списывает с balance_usd
     d. Создаёт записи в transactions (type: "usage") и api_usage
   - getUsageHistory(userId, filters): фильтрация по дате, synthesisId
   - getTransactionHistory(userId, pagination)

3. server/middleware/billing-check.ts:
   - Middleware для routes генерации:
     a. Определяет режим биллинга пользователя:
        - Если есть active api_key → mode: "byo"
        - Если balance > 0 и нет api_key → mode: "service"
        - Если нет ни того ни другого → 403 API_KEY_MISSING
     b. Для mode "service": проверяет достаточность баланса 
        (estimateCost от параметров запроса)
     c. Прокидывает { billingMode, apiKey? } в context

4. Расширение server/services/streaming-manager.ts:
   - В streamSection: после получения usage от Claude,
     если billingMode === "service" → вызвать chargeUsage
   - Записать в api_usage независимо от режима

5. server/routes/billing.ts:
   - POST /billing/api-key { key } → storeApiKey
   - DELETE /billing/api-key/:id → deleteApiKey
   - GET /billing/api-key → listApiKeys
   - POST /billing/topup { amountUsd } → createTopup (Stripe)
   - POST /billing/topup/confirm { paymentIntentId } → confirmTopup
   - GET /billing/transactions?page&limit → getTransactionHistory
   - GET /billing/usage?from&to&synthesisId → getUsageHistory

6. server/utils/crypto.ts:
   - encrypt(plaintext, key): AES-256-GCM
   - decrypt(ciphertext, iv, tag, key): AES-256-GCM
```

**Последующие запросы:**
- «Протестируй BYO-Key: сохрани ключ → getDecryptedKey возвращает оригинал → billing-check пропускает с mode "byo"»
- «Протестируй баланс: пополни $1.00 → сгенерируй раздел → баланс уменьшился на стоимость → transaction записан»
- «Протестируй недостаток баланса: баланс $0.001, попытка генерации exhaustive — ошибка INSUFFICIENT_BALANCE»
- «Протестируй шифрование: storeApiKey → перезапуск сервера → getDecryptedKey возвращает тот же ключ»
- «Edge case: пользователь с BYO-Key И балансом — приоритет BYO-Key»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 6.2: Billing UI + Admin Prompts Page (клиент)

**Контекст:**
- `03-specification.md` (секции 1.10 Prompt Registry, 1.11 Биллинг, 2.9 Prompts API, 2.10 Billing API)
- `05-file-structure.md` (client/pages/)
- Из предыдущих бесед: `client/api/client.ts`, `client/stores/auth-store.ts`
- Исходник: НЕ НУЖЕН

**Первый запрос:**
```
Создаю UI для биллинга и админки промптов.

Полностью новый код. Прикреплены: спецификация (Prompt Registry, Billing API).

Создай:
1. client/pages/BillingPage.tsx:
   - Секция "API-ключ":
     a. Текущий ключ: prefix + маска (sk-ant-***...***) + кнопка удалить
     b. Форма добавления нового ключа (input type=password)
     c. Статус: "Активен" / "Не задан"
   
   - Секция "Баланс сервиса":
     a. Текущий баланс: $X.XX
     b. Кнопка "Пополнить" → Stripe Checkout / Elements
     c. Выбор суммы: $1, $5, $10, произвольная
   
   - Секция "История использования":
     a. Таблица: дата, синтез, раздел, input/output tokens, стоимость, режим
     b. Фильтры: период, синтез
     c. Итоги: суммарные токены, суммарная стоимость
   
   - Секция "Транзакции":
     a. Таблица: дата, тип (пополнение/списание), сумма, баланс после
     b. Пагинация

2. client/pages/AdminPromptsPage.tsx (role === 'admin'):
   - Список шаблонов с поиском по ключу:
     a. Дерево ключей (method.dialectical.graph, method.dialectical.theses, ...)
     b. Фильтр: activeOnly, prefix
   
   - Редактор шаблона:
     a. Textarea с телом шаблона
     b. Подсветка плейсхолдеров ({{participants}}, {{method_label}})
     c. Preview: подстановка тестовых значений → результат
     d. Кнопка "Сохранить как черновик" (создаёт новую версию, не активирует)
     e. Кнопка "Активировать" (активирует версию, инвалидирует кэш)
   
   - История версий шаблона:
     a. Список версий с датами
     b. Diff между двумя версиями
     c. Кнопка "Откатить" (активировать старую версию)
   
   - Редактор конфигов (synthesis_configs):
     a. JSON-редактор (с подсветкой синтаксиса)
     b. Валидация JSON перед сохранением
     c. Версионирование аналогично шаблонам

3. client/api/billing.ts:
   - storeApiKey, deleteApiKey, listApiKeys
   - createTopup, confirmTopup
   - getUsageHistory, getTransactionHistory

4. client/api/prompts.ts:
   - listPrompts, getVersions, createVersion, activateVersion
   - listConfigs, updateConfig

5. Защита роута: AdminPromptsPage доступна только для role === 'admin'
```

**Последующие запросы:**
- «Протестируй BYO-Key UI: ввести ключ → сохранение → отображается prefix → удалить → "Не задан"»
- «Протестируй пополнение: нажать $5 → Stripe mock → баланс обновлён → транзакция в истории»
- «Протестируй историю использования: после нескольких генераций → таблица заполнена → фильтр по синтезу работает → итоги совпадают»
- «Протестируй AdminPromptsPage: изменить шаблон "system" → сохранить как черновик → активировать → проверить что генерация использует новый шаблон»
- «Протестируй diff: две версии шаблона → визуальное сравнение показывает изменения»
- «Проверь доступ: обычный пользователь → /admin/prompts → redirect на 403 или каталог»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

---

## 9. Ситуативные шаблоны запросов

Шаблоны ниже НЕ привязаны к конкретной беседе — используются по необходимости.

Стандартные шаги (компиляция, интеграция, ревью) уже включены в каждую беседу как блок «Завершение беседы» и здесь не дублируются.

### 9.1. При ошибке стриминга/генерации

```
При генерации синтеза возникает ошибка: [текст ошибки].

Контекст:
- streaming-manager.ts: [прикладываю]
- generation-service.ts: [прикладываю]
- Логи сервера: [прикладываю]

Где проблема? Исправь.
```

### 9.2. При расхождении данных между клиентом и сервером

```
Клиент показывает [X], но в БД значение [Y]. 

Файлы:
- Роут: [прикладываю]
- Сервис: [прикладываю]  
- Клиентский компонент: [прикладываю]
- SQL-запрос и результат: [прикладываю]

Найди, где теряется или трансформируется значение.
```

### 9.3. При несовместимости типов между модулями из разных бесед

```
Файл [X.ts] из беседы [N] импортирует тип/функцию из [Y.ts] из беседы [M].
Ошибка компиляции: [текст ошибки].

Прикладываю оба файла. Определи, какой из двух файлов нужно 
скорректировать (чтобы не сломать его потребителей), и исправь.
```

### 9.4. При деградации производительности

```
Запрос GET /syntheses/:id/categories занимает [N] мс (ожидание < 100 мс).

Прикладываю:
- Роут + сервис
- EXPLAIN ANALYZE для SQL-запроса
- Количество записей в таблицах

Оптимизируй: индексы, структура запроса, кэширование.
```

---

## 10. Контрольный чек-лист для каждой беседы

Перед началом:
- [ ] Определил задачи беседы (из 06-dev-strategy.md)
- [ ] Определил нужные фрагменты исходника (из 04-code-reuse-map.md)
- [ ] Извлёк фрагменты (`sed -n ...`)
- [ ] Собрал файлы из предыдущих бесед (только прямые зависимости)
- [ ] Загрузил все 6 проектных документов

В процессе:
- [ ] Все файлы созданы (из 05-file-structure.md)
- [ ] TypeScript компилируется без ошибок
- [ ] Эндпоинты протестированы (curl / клиент)
- [ ] Данные корректно сохраняются в БД

После:
- [ ] Ревью: все функции из карты портированы
- [ ] Список файлов для следующей беседы зафиксирован
- [ ] TODO задокументированы

---

## 11. Граф зависимостей бесед

```
0.1 (скелет, БД, типы, константы)
 ├── 0.2 (auth, Hono, WS, rate-limiter)
 ├── 0.3 (seed-prompts, seed-configs, prompt-registry)
 │    ├── 0.3b (seed-taxonomy, element-taxonomy)
 │    └── 1.1 (synthesis-engine, topo-sort, compat-advisor, cost-estimator)
 │         ├── 1.2 (prompt-builder, section-defs-builder)
 │         │    └── 1.4 (streaming-manager, generation-service, graph-parser, element-parser)
 │         │         ├── 1.5 (SynthesisForm, GenerationProgress — клиент)
 │         │         ├── 2.2 (plan-executor, regenerateSection/Subsection, addSection, deleteSection)
 │         │         │    └── 2.3 (EditModal, CascadePanel, EditPlanPanel — клиент)
 │         │         ├── 3.1 (meta-synthesis-service, lineage-service)
 │         │         │    └── 3.2 (ConceptParticipants, GenealogyTree — клиент)
 │         │         ├── 4.1 (mode-service, ModeModal — бэкенд + клиент)
 │         │         ├── 4.2 (export: html, mmd, png, json)
 │         │         └── 4.3 (import-service, ImportPage)
 │         │
 │         ├── 1.3 (context-builder, context-extractor)
 │         │    └── 1.4
 │         │
 │         └── 2.1 (cascade-analyzer, edit-planner)
 │              └── 2.2
 │
 └── 0.4 (клиент каркас, роутинг, stores, api/client)
      ├── 1.5 (форма + прогресс)
      ├── 1.6 (DocumentView, CatalogPage)
      ├── 1.7 (Graph3D, Graph2D, GraphModal, NodePanel)
      ├── 2.3 (EditModal, CascadePanel)
      ├── 2.4 (ContextLogViewer, colorize-log)
      ├── 3.2 (ConceptParticipants, GenealogyTree)
      ├── 5.2 (ElementEditor, CategoryEditor, VersionHistory)
      └── 6.2 (BillingPage, AdminPromptsPage)

5.1 (element-editor, element-versioning) ← 0.1 (schema) + 2.1 (cascade-analyzer)
5.3 (element-enrichment) ← 5.1 + 0.3b (taxonomy) + 1.4 (streaming-manager)
5.4 (CharacteristicSlider, EnrichmentPanel, TaxonomySelector) ← 5.3 + 5.2 + 1.7 (NodePanel)
5.5 (representation-transformer, TransformPanel) ← 1.4 (graph-parser, streaming) + 0.3b (taxonomy) + 1.7 (GraphModal) + 1.6 (SectionView)
5.2 (ElementEditor UI) ← 5.1 + 1.7 (NodePanel) + 1.6 (SectionView)
6.1 (billing-service, api-key-service) ← 0.1 (schema) + 0.2 (auth) + 1.4 (streaming-manager)
6.2 (BillingPage, AdminPromptsPage) ← 6.1 + 0.4 (клиент каркас)
```

**Чтение графа:**
- Вертикальные линии (├──) означают «зависит от родителя И от предыдущих бесед на том же уровне»
- Стрелка `←` означает «зависит от» (для бесед вне основного дерева)
- Беседы на одном уровне можно вести параллельно (если два человека работают)

**Критический путь (самая длинная цепочка):**
0.1 → 0.3 → 1.1 → 1.2 → 1.4 → 2.2 → 2.3

**Параллелизуемые ветки:**
- После 1.4: беседы 1.5, 3.1, 4.1, 4.2, 4.3 можно вести параллельно
- После 0.4: беседы 1.5, 1.6, 1.7 можно вести параллельно
- Фазы 5 и 6 независимы друг от друга
