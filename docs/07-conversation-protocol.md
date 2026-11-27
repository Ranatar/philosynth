# PhiloSynth Service — Протокол бесед

> **Журнал правок этого документа переехал** (2026-09-07):
> все датированные врезки «Правки …» по итогам бесед 0.1–7.1 — в
> `docs/08-history.md`, Часть III. Здесь остаётся только протокол.
> Блоки «По факту N» с 2026-11-15 живут в главах 08 — подразделами
> `#### По факту N (…)`, слитые с итогами бесед; в тексте беседы здесь на
> месте каждого блока — указатель с той же подписью (на подпись смотрят
> сторожа `integration-check` и ссылки из кода «По факту N» п. M). Рядом с
> текстом запроса остаются лишь короткие пометки об отступлениях от него:
> блоки-указатели 12.5 и пометки внутри самих запросов.
>
> Грабли окружения, тестов и оснастки — `docs/09-lessons.md`; читать
> целиком перед началом любой беседы (§10).

## 1. Общие принципы работы с контекстом

### 1.1. Не загружать всё — загружать нужное

Полный `philosynth.html` — 1.3 МБ (~330K токенов, 26 024 строки). Комплект проектных документов 01–07 — ещё ~705 КБ (на 2026-09-07; история 08 и уроки 09 в беседу целиком не грузятся: 09 — да, 08 — только нужная глава). Это неэффективно: модель тратит внимание на тысячи строк CSS, HTML-разметки и Three.js-рендеринга, когда задача — написать Drizzle-миграцию.

**Правило**: в каждую беседу загружать **только то, что нужно для конкретных задач этой беседы**. Проектные документы — да: 01–05 целиком, 07 частями (§1, §9–12, текст беседы), 09 целиком, 08 — только нужные главы (главы опорных бесед несут их блоки «По факту»), 06 — не грузится (уточнено 8.1: прежнее «все 6» относилось к комплекту до появления 08/09). Исходный файл — только релевантные фрагменты.

### 1.2. Как определить, какие фрагменты исходника нужны

Документ `04-code-reuse-map.md` содержит точные номера строк для каждой функции и каждого модуля. Перед беседой:

1. Определить задачи беседы (из `06-dev-strategy.md`)
2. Найти целевые модули (из `05-file-structure.md`)
3. Найти строки исходника (из `04-code-reuse-map.md`)
4. Извлечь функции: `grep -n 'function NAME' philosynth.html` → определить диапазон → `sed -n 'START,ENDp' philosynth.html > fragment.txt`

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

### Готовые комплекты вложений

Ручное извлечение по grep-командам бесед автоматизировано:
`python3 scripts/extract-fragments.py philosynth.html fragments/`
> **ЗАМЕНЁН (2026-07-31):** скрипта `scripts/extract-fragments.py` в
> репозитории нет (шапки старых фрагментов на него ещё ссылаются —
> это исторический след). Вместо него —
> **`scripts/extract-by-name.py`**: он ищет объявления ПО ИМЕНАМ из
> карты `04-code-reuse-map.md` и сам вычисляет границы по балансу
> скобок, поэтому спецификация не устаревает при правке исходника, а
> номера строк появляются в готовом фрагменте как результат поиска.
>
> ```bash
> python3 scripts/extract-by-name.py ПУТЬ.spec [-o ФАЙЛ] [--check]
> ```
> Виды целей: `js:имяФункции`, `var:ИМЯ`, `css:.селектор`,
> `css*:.префикс` (все правила с префиксом), `html:#id`,
> `scope:начало..конец` (сузить область поиска двумя якорями),
> `lines:A-B` (только там, где именованного якоря нет).
> Образцы спецификаций — `docs/fragments-for-conversations/*.spec`.
>
> **Статус (2026-08-04):** спецификации есть у комплектов 1.6, 1.7 и
> ВСЕХ бесед фаз 2–4 (2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 4.1, 4.2, 4.3) —
> эти комплекты собираются по именам и пересобираются одной командой.
> Комплекты Фазы 0 и бесед 1.1–1.5b пока нарезаны по баннерам: их
> имеет смысл переводить на спеки по мере надобности, а не разом.
> Пересборка всех спек и проверка идемпотентности:
>
> ```bash
> for s in docs/fragments-for-conversations/*.spec; do
>   python3 scripts/extract-by-name.py "$s" || echo "FAIL $s"
> done
> ```
>
> Две ловушки сборщика, известные по фазам 2–4:
> — правила из `@media` вынимаются БЕЗ обёртки (мобильные и светлые
>   переопределения стали бы безусловными) — медиаблоки берутся
>   диапазоном целиком, а `css*:` сужается якорями `scope:`
>   (образец — `3.2-genealogy-ui.spec`);
> — одноимённые функции: в исходнике два `truncLabel`, и вложенный в
>   `buildModesExportSection` записан с литералом `"\u2026"` вместо
>   символа «…» — в генерируемом файле это ВАЛИДНЫЙ JS-литерал и
>   рендерится многоточием (формулировка «печатает
>   escape-последовательность» из прежней ревизии была преувеличена;
>   уточнено 4.2) — нужный выбирается через `scope:`
>   (образец — `4.1-mode-service.spec`).
>
> (Прежняя пометка «**ВНИМАНИЕ (2026-07-30):** скрипта
> `scripts/extract-fragments.py` в репозитории НЕТ» снята этим патчем;
> строка сохранена, чтобы повторный прогон patch-docs-conv16-pre.py
> не вписал её заново.)
генерирует по файлу на беседу (fragments/1.1-synthesis-engine.js и т.д.)
с заголовками-диапазонами строк оригинала. При обновлении исходника —
перегенерировать. grep-команды в беседах остаются документацией того,
ЧТО входит в комплект, и ориентиром для точечной сверки.

## 2. Протокол Фазы 0: Инфраструктура

### Беседа 0.1: Скелет монорепозитория + БД

**Контекст для загрузки:**
- `01-architecture.md` (стек, компоненты)
- `02-data-model.md` (все таблицы)
- `05-file-structure.md` (дерево каталогов)
- Исходник: **ДА, фрагменты констант**:
  - `STATE` (объект: PH — список философов с группировкой по эпохам, ML, SL, DL, REVERSE_*)
  - `KEY_LABELS`, `SECTION_LABELS`, `ALL_CTX_KEYS`, `CTX_LABELS`
  - `PHIL_FILENAME` (транслитерация имён)
  - `METHOD_CODE`, `LEVEL_CODE`, `ORDER_CODE`, `DEPTH_CODE`

**Извлечение фрагментов перед беседой:**
```bash
grep -n 'const ML\|const KEY_LABELS\|const CTX_LABELS\|const PHIL_FILENAME\|const METHOD_CODE' philosynth.html | head -10
# v11: STATE и ALL_CTX_KEYS удалены; философы — из чекбоксов формы:
grep -n 'checkbox-item' philosynth.html | head -3
# Извлечь каждый блок от начала до закрывающей };
```

**Первый запрос:**
```
Создай скелет монорепозитория PhiloSynth Service.

Прикреплённые файлы — проектные документы: архитектура, модель данных, файловая структура.

Задачи этой беседы:
1. Инициализация workspace (package.json root + packages/shared, server, client)
2. tsconfig.base.json + tsconfig для каждого пакета
3. docker-compose.yml (PostgreSQL 16 + Redis 7)
4. .env.example с переменными из архитектуры
5. Drizzle ORM: полная схема БД (ВСЕ таблицы из 02-data-model.md, включая v10-поля:
      ext_graph_metrics, structure_sections в syntheses;
      clarity, breadth, depth_score, applicability в categories;
      innovation_degree, context_dependency в category_edges)
   — файл server/db/schema.ts
6. drizzle.config.ts
7. server/db/index.ts (подключение)
8. Начальная миграция

НЕ делай в этой беседе: auth, роуты, клиент, WebSocket.

Стек: TypeScript, Hono, Drizzle ORM, PostgreSQL 16, Redis 7.
```

**Последующие запросы:**
- «Запусти `docker compose up -d` и `npx drizzle-kit push` — покажи результат. Проверь, что все 26+ таблиц создались (включая поля v11 из 02-data-model: keep_full_budget, parent_context_schema, paused_state; budget_mode/parent_spec в context_log): `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`»
- «Создай shared/types/ — все 11 файлов типов из файловой структуры (synthesis.ts, section.ts, graph.ts, elements.ts, lineage.ts, edit-plan.ts, generation.ts, modes.ts, billing.ts, prompts.ts, ws-messages.ts). Каждый тип должен соответствовать полям из schema.ts»
- «Создай shared/constants/ — все файлы: philosophers.ts (106 позиций; в исходнике v11 список живёт в чекбоксах формы и PHIL_FILENAME — STATE.PH больше нет, извлекать из них), labels.ts (ML, SL, DL, REVERSE_*), section-labels.ts (KEY_LABELS), ctx-keys.ts (CTX_LABELS; ALL_CTX_KEYS удалён — перечень ключей выводится из CTX_LABELS), phil-filename.ts, methods.ts, cardinality.ts (participantCardinality, participantWord/Sg)»
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

**По факту 0.2 (блок-указатель; заведён 12.5, Д-28).** Итоги и отступления
— `docs/08-history.md`, глава «Беседа 0.2 — итоги и контекст для следующих
бесед». Текст запроса опровергнут в одном: WS-операции (`subscribe_generation`,
`start_regen`, …) распознаны по union `WsClientMessage`, но исполнение —
заглушки до 1.4+; сессии — Lucia-модель в cookie (SHA-256 токена в
`sessions.id`, TTL 30 дн., скользящее продление), bcryptjs; rate-limiter —
fail-open при недоступном Redis.

---

### Беседа 0.3: Seed-скрипты + Prompt Registry

**Контекст:**
- `01-architecture.md` (секция 4.1 Prompt Registry)
- `04-code-reuse-map.md` (секция 1.1–1.5 — какие объекты извлекать)
- `server/db/schema.ts`
- Исходник: **ДА, но только фрагменты**:
  - CONTEXT_DEPS_BASE … SUBSTITUTION_MAP_GENETIC (все конфиг-объекты зависимостей и подстановок)
  - COMPAT_MATRIX_COMPACT (матрица совместимости)
  - INTRA_DEPS, SUBSECTION_TO_CTX_KEYS, TOPOLOGY_ROLES_PROCEDURAL
  - buildSYS(), METHOD_SUM … METHOD_DIALOGUE, LEVEL_* (системный промпт и промпты методов/уровней)
  - buildSectionDefs(), serializeParts() (структура промптов разделов)

**Извлечение фрагментов перед беседой:**
```bash
# Извлечь конфиги: INTRA_DEPS … SUBSTITUTION_MAP
grep -n 'INTRA_DEPS' philosynth.html | head -1  # найти начало, затем извлечь блок
# Извлечь COMPAT_MATRIX_COMPACT
grep -n 'COMPAT_MATRIX_COMPACT' philosynth.html | head -1  # найти начало, затем извлечь блок
# Извлечь buildSYS … LEVEL_*
grep -n 'function buildSYS' philosynth.html | head -1  # найти начало, затем извлечь блок
# Извлечь buildSectionDefs … patchPromptsWithSecCtx
grep -n 'function buildSectionDefs' philosynth.html | head -1  # найти начало, затем извлечь блок
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
   d. Включает STOP_SIGNAL в конец каждого шаблона раздела (v10)
   e. Вставляет в БД

2. scripts/seed-configs.ts — скрипт, который:
   a. Извлекает все конфиг-объекты: CONTEXT_DEPS_BASE, CONTEXT_DEPS_GENETIC, 
      CONTEXT_DEPS_LEVEL, CONTEXT_DEPS_LEVEL_GENETIC, CONTEXT_DEPS_METHOD
      (бывш. LEVEL/METHOD_DEPS_PATCH), SUBSTITUTION_MAP, SUBSTITUTION_MAP_GENETIC,
      PARENT_DEPS_BASE/GENETIC/LEVEL/LEVEL_GENETIC/METHOD, PARENT_INTRA_DEPS,
      PARENT_FIELD_ORDER/LABELS, MD_BY_CARD, SD_BY_CARD, MODE_DEPS,
      COMPAT_MATRIX_COMPACT, INTRA_DEPS, SUBSECTION_TO_CTX_KEYS, TOPOLOGY_ROLES_PROCEDURAL,
      FRAGMENT_SHARE, CONTEXT_BUDGET
   b. Вставляет как JSON в synthesis_configs
   Дополнительно: _EXTRA_CATEGORY_TYPES, _EXTRA_EDGE_TYPES,
   _SYNTH_LEVEL_TYPE_PHRASING → в synthesis_configs

   Для извлечения _EXTRA_* и _buildExtraTypesBlock нужен фрагмент исходника:
   ```bash
   grep -n '_EXTRA_CATEGORY_TYPES\|_EXTRA_EDGE_TYPES\|_SYNTH_LEVEL_TYPE_PHRASING\|function _buildExtraTypesBlock' philosynth.html
   ```

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
- Исходник: **ДА, фрагмент** `_EXTRA_CATEGORY_TYPES`, `_EXTRA_EDGE_TYPES` — для `_buildExtraTypesBlock()`, портируемой в `element-taxonomy.ts` или `extra-types.ts`

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

**По факту 0.3b (блок-указатель; заведён 12.5, Д-28).** Итоги —
`docs/08-history.md`, «Итоги беседы 0.3b (seed-taxonomy / element-taxonomy)».
Текст запроса опровергнут: сид каталогов идемпотентен БЕЗ версионирования
(`key UNIQUE`: created / updated-на-месте только системных / skip,
пользовательские записи не трогаются); `routes/taxonomy.ts` беседой не
создан — дыра карты 04, закрыта позже (5.4/7.1).

---

### Беседа 0.4: Каркас клиента

**Контекст:**
- `05-file-structure.md` (секция client/)
- `01-architecture.md` (обзор)
- Исходник: первые ~3100 строк (CSS — **только** для извлечения цветовой палитры и дизайн-системы)

**Извлечение:**
```bash
# Только CSS-переменные и ключевые стили (не весь CSS)
grep -n 'var(--' philosynth.html | head -50 > frag-css-vars.txt
head -200 philosynth.html >> frag-css-vars.txt  # первые ~200 строк: CSS-переменные
```

**Первый запрос:**
```
Создай каркас клиента PhiloSynth Service.

Задачи:
1. Vite + React 19 + TypeScript
2. tailwind.config.ts — кастомные цвета из дизайн-системы исходника 
   (см. CSS-фрагмент: --gold, --gold-light, --ink, --off, --violet и т.д.;
   «parchment» проектных доков = --off исходника)
3. globals.css с CSS-переменными
4. React Router: маршруты Login, Register, Catalog, CreateSynthesis, 
   Synthesis/:id, Import, Billing, AdminPrompts
   <!-- 8.7: += «/» (LandingPage) и «/explore» — гостевые, вне RequireAuth;
        «/synthesis/:id» тоже вынесен из-под RequireAuth (8.7 п.3) -->
5. Layout.tsx с Header, Sidebar
6. Заглушки всех страниц
7. stores/auth-store.ts (Zustand): user, login(), logout()
8. api/client.ts: fetch-обёртка с cookie auth, error handling
9. hooks/useWebSocket.ts: типизированный WS-хук (shared/types/ws-messages)
   с reconnect и keep-alive ping — беседы 1.4/1.5 загружают его «из 0.4»

НЕ делай: реальные компоненты, граф, редактирование. Только скелет навигации.
```

**Последующие запросы:**
- «Запусти `npm run dev` — клиент стартует без ошибок? Открой в браузере — Layout рендерится, навигация между страницами работает?»
- «Протестируй auth-store: вызови login() → запрос к POST /auth/login → при успехе user сохраняется в store, при ошибке — error. logout() → POST /auth/logout → user = null. При перезагрузке страницы — GET /auth/me восстанавливает сессию»
- «Протестируй api/client.ts: запрос к защищённому эндпоинту без сессии → redirect на /login. Запрос с сессией → данные. Ответ 500 → error обрабатывается, не crash»
- «Проверь CSS-переменные: цвета --gold (#b8860b), --gold-light (#d4a017), --ink (#1a1814), --off (#f2f0eb; в доках «parchment» — допустим алиас --parchment: var(--off)), --violet (#6b00aa) из исходника присутствуют в globals.css и используются в tailwind.config.ts?»
  <!-- правка 2026-07-23: прежний чек называл #d4a017 «--gold» (это --gold-light)
       и требовал --parchment, которого в исходнике нет (= --off) -->
- «Проверь паритет оформления: `python3 scripts/css-parity-audit.py` — раздел A (непокрытые правила исходника) и раздел B (расхождения в совпавших правилах) обязаны быть нулевыми, раздел C — только унаследованный `gm-hint`»
- «Проверь responsive: Layout на мобильных (< 768px) — Sidebar скрыт или бургер-меню. Header адаптивный»
- «Проверь, что все маршруты из React Router имеют заглушки (не белый экран): /login, /register, /catalog, /synthesis/new, /synthesis/:id, /import, /billing, /admin/prompts»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 0.5: Смена пароля (A3)

> Добавлена правкой 2026-07-23: требование A3 «смена пароля» (03-spec §1.1,
> MVP) не имело эндпоинта в §2.1 и беседы в протоколе (дыра, зафиксирована
> в итогах 0.2). Сброс пароля по email (A2a) перенесён в Фазу 3 —
> требует почтовой инфраструктуры.

**Контекст:**
- `03-specification.md` §2.1 (POST /auth/password-change)
- Из предыдущих бесед: `server/middleware/auth.ts`, `server/routes/auth.ts` (из 0.2), `server/db/schema.ts`
- Исходник: НЕ НУЖЕН

**Первый запрос:**
```
Добавь в routes/auth.ts эндпоинт POST /auth/password-change
{ currentPassword, newPassword }:
1. requireAuth; verifyPassword(currentPassword) — при несовпадении
   401 AUTH_REQUIRED (единый ответ, анти-enumeration, как в login)
2. newPassword ≥ 8 символов, иначе VALIDATION_ERROR + details
3. Обновить password_hash; инвалидировать все сессии пользователя,
   КРОМЕ текущей (защита от угнанных сессий)
4. → { ok: true }
```

**Последующие запросы:**
- «Протестируй: смена с верным текущим паролем → 200; вход по новому паролю работает, по старому — 401»
- «Протестируй: прочие сессии пользователя инвалидированы, текущая жива»
- «Edge cases: неверный currentPassword → 401; newPassword короче 8 → VALIDATION_ERROR + details»

**Завершение беседы:**
- Стандартный блок (компиляция, интеграция, ревью)

---

### Беседа 0.6: Профиль пользователя (A3: отображаемое имя + UI смены пароля)

> Добавлена правкой 2026-07-24: серверная половина A3 (password-change)
> реализована в 0.5, но смена displayName не имела эндпоинта в §2.1,
> а клиентский UI профиля — включая форму смены пароля — отсутствовал
> в 05/07 (дыра, зафиксирована в итогах 0.5).

**Контекст:**
- `03-specification.md` §2.1 (PATCH /auth/me, POST /auth/password-change)
- Из предыдущих бесед: `server/routes/auth.ts` (0.2/0.5),
  `server/middleware/auth.ts` (0.2); клиент 0.4: `api/client.ts`,
  `stores/auth-store.ts`, `App.tsx`, `components/layout/*` (ссылка на
  профиль), Login/RegisterPage как образец форм
- Исходник: НЕ НУЖЕН

**Первый запрос:**
```
1. Добавь в routes/auth.ts эндпоинт PATCH /auth/me { displayName }:
   requireAuth; displayName — строка, trim; пустая строка → null;
   длина > 100 → VALIDATION_ERROR + details.displayName;
   → { user } (полный, как GET /auth/me)
2. Создай client/src/pages/ProfilePage.tsx (маршрут /profile;
   ссылка — имя/email пользователя в Header):
   секция «Профиль» — email (read-only), displayName + «Сохранить»;
   секция «Смена пароля» — currentPassword/newPassword/повтор,
   POST /auth/password-change; отображение details по полям,
   401 → «Неверный текущий пароль»; при успехе — уведомление
   «Пароль изменён; прочие сессии завершены»
3. Расширь stores/auth-store.ts: updateProfile(displayName),
   changePassword(current, next) — user в store обновляется
```

**Последующие запросы:**
- «Протестируй PATCH /auth/me: смена displayName видна в GET /auth/me;
  пустая строка → null; длина > 100 → VALIDATION_ERROR + details;
  без сессии → 401»
- «Браузерный тест ProfilePage (по паттерну test-04-*): обе формы
  работают, ошибки полей отображаются, user в шапке обновился»

**Завершение беседы:**
- Стандартный блок (компиляция, интеграция, ревью)

**По факту 0.6 (блок-указатель; заведён 12.5, Д-28).** Итоги —
`docs/08-history.md`, «Беседа 0.6 — итоги и контекст для следующих бесед».
Отступление одно: смена пароля в живой сессии — `skipUnauthorizedHandler`
у запроса (иначе 401 на неверный старый пароль разлогинивал вместо ошибки
поля); остальное — по тексту.

---

## 3. Протокол Фазы 1: MVP

### Беседа 1.1: Synthesis Engine — ядро

**Контекст:**
- `01-architecture.md` (секция 4.2 Synthesis Engine)
- `04-code-reuse-map.md` (секция 1.1–1.3)
- `server/services/prompt-registry.ts` (из 0.3)
- `server/db/schema.ts`
- `shared/types/synthesis.ts`
- Исходник: deepMergeUniq … resolveCircularDeps + computeSectionRating … estimateModeCost

**Извлечение:**
```bash
# Извлечь deepMergeUniq … resolveCircularDeps
grep -n 'function deepMergeUniq' philosynth.html | head -1  # найти начало, затем извлечь блок
# Извлечь computeSectionRating … estimateModeCost
grep -n 'function computeSectionRating' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Портирую ядро Synthesis Engine в TypeScript.

Прикреплены: архитектура, карта переиспользования, prompt-registry.ts, schema.ts, 
типы, и фрагмент исходника (deepMergeUniq … estimateModeCost (всё ядро engine)).

Создай файлы:
1. server/services/synthesis-engine.ts:
   - resolveContextDeps(params) — из resolveContextDeps()
   - deepMergeUniq() — из deepMergeUniq()
   - buildEffectiveDeps() — из buildEffectiveDeps()
   - findSubstitute() — из findSubstitute()
   - getSubstituteQuality() — из getSubstituteQuality()
   - getActiveSubstitutionMap() — из getActiveSubstitutionMap()
   Все конфиги (CONTEXT_DEPS_BASE и т.д.) читаются через prompt-registry.getConfig()

2. server/utils/topo-sort.ts:
   - computePredecessors() — из computePredecessors()
   - топологическая сортировка — инлайнена внутри buildDynamicOrder (Кан);
     выделить в отдельную функцию при портировании
   - buildDynamicOrder() — из buildDynamicOrder()
   - resolveCircularDeps() — из resolveCircularDeps()

3. server/services/compat-advisor.ts:
   - computeSectionRating() — из computeSectionRating()
   - Advisor v2: getCompatEntryByKey() (entry-модель level:method, severity),
     iconForSeverity/titleForSeverity/chipClassForRating
     (computeOverallCompat/computeMethodRating/getCompatAdvice удалены в v11)
   - computeSectionWarnings()/updateSectionWarnings() — живые предупреждения
   Матрица читается через getConfig("compat_matrix")

4. server/services/cost-estimator.ts:
   - estimateCost() — из estimateCost()
   - estimateSubsectionCost() — из estimateSubsectionCost()
   - estimateModeCost() — из estimateModeCost()

Логика порт 1:1, но:
- Все конфиги читаются из Prompt Registry (не хардкод)
- Типизация TypeScript (параметры, возвращаемые значения)
- async где нужно (чтение из Registry — async)
```

**Последующие запросы:**
- «Напиши юнит-тест: resolveContextDeps с params = { method: "dialectical", synthLevel: "comparative", sections: ["graph","glossary","theses"] } — проверь, что graph получает required: ["sum:goals"] (BASE без патчей), а при synthLevel: "transformative" — required: ["sum:goals", "sum:tensions"] (sum:tensions добавляет уровне-патч transformative/generative, НЕ comparative; сверено с исходником в 1.1)»
- «Проверь, что buildDynamicOrder корректно обрабатывает циклические зависимости — создай тест с graph → theses → graph (resolveCircularDeps должна разорвать цикл)»
- «Проверь estimateCost с глубиной "exhaustive" — результат должен быть ~2x от "standard". Проверь с 6 разделами vs 3 — стоимость пропорциональна»
- «Протестируй findSubstitute: sections=["graph","theses"] (нет glossary) — для тезисов, которые зависят от glossary:table, findSubstitute должен найти замену (если настроено в SUBSTITUTION_MAP). Проверь getSubstituteQuality — возвращает 1/2/3»
- «Протестируй getCompatEntryByKey("generative:creative") — entry содержит rating, severity, desc, чипы по разделам? computeSectionWarnings для sections=["theses"] без graph/glossary — предупреждения содержат недостающие источники и активные подстановки?»
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
- Исходник: buildSYS … buildSectionDefs (вся промптовая система)

**Извлечение:**
```bash
# Извлечь buildSYS … buildSectionDefs (вся промптовая система)
grep -n 'function buildSYS' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Портирую систему сборки промптов.

Прикреплён фрагмент исходника (buildSYS … buildSectionDefs (вся промптовая система)): buildSYS, METHOD_*, LEVEL_*, 
buildSectionDefs, serializeParts, baseCtx, buildQualityReinforcement, groupPasses.

Создай:
1. server/services/prompt-builder.ts:
   - buildSYS(params) — buildSYS(). Читает шаблон "system" из Registry
   - baseCtx(p, sectionKey) = baseCtxStatic(p) + baseCtxParents(p, sectionKey)
     — параметры из аргумента; родительский блок пер-секционный (v11)
   - participantsForPrompt(p) — плейсхолдер «[свободный синтез: …]» при 0 участников
   - выбор веток шаблонов по participantCardinality(p): MD_BY_CARD/SD_BY_CARD
     из Registry (md_by_card/sd_by_card)
   - buildQualityReinforcement(params) — patchPromptsWithSecCtx()

   - STOP_SIGNAL: константа, добавляемая в конец каждого промпта раздела.
     Определить в prompt-builder.ts. Текст: «СТОП: после завершения указанного
     раздела ПРЕКРАТИ генерацию. НЕ переходи к следующим разделам.»
   - _buildExtraTypesBlock(method, synthLevel, kind): функция, расширяющая
     список типов категорий/связей в промпте в зависимости от метода.
     Читает _EXTRA_CATEGORY_TYPES / _EXTRA_EDGE_TYPES из Registry (seed-configs).

2. server/services/section-defs-builder.ts:
   - buildSectionDefs(params) — buildSectionDefs(). Каждый промпт читается из Registry:
     registry.getTemplate("method.dialectical.graph") вместо METHOD_GRAPH[...]
   - serializeParts(parts) — serializeParts()
   - groupPasses(defs) — как в исходнике: по одному разделу на проход
     (последовательная генерация). effectiveDeps НЕ принимает: порядок
     разделов определяется раньше — buildDynamicOrder (беседа 1.1)
   - patchPromptsWithSecCtx(defs, secCtx) — patchPromptsWithSecCtx()

Ключевое изменение: buildSectionDefs в исходнике содержит ~500 строк захардкоженных 
промптов. В сервисе каждый промпт — вызов registry.getTemplate(key). 
Структура ключей: "section.{sectionKey}.preamble", "method.{method}.{sectionKey}", 
"level.{level}.{aspect}".
```

**Последующие запросы:**
- «Протестируй baseCtx: результат НЕ содержит строку ВЫБРАННЫЕ РАЗДЕЛЫ (убрана). Содержит: ЗЕРНО, ФИЛОСОФЫ/КОНЦЕПЦИИ, МЕТОД, УРОВЕНЬ, ГЛУБИНА, КОНТЕКСТ (если есть). Для мета-синтеза: РЕЖИМ МЕТА-СИНТЕЗ + блок контекста концепций.»
- «Протестируй buildSYS: вызови с params = { method: "dialectical", synthLevel: "comparative", depth: "standard", phil: ["Кант","Гегель"] } — результат содержит имена философов? Длина ~3200 символов (факт исходника: 3192 для этого набора параметров; критерий — байтовое равенство с buildSYS исходника)?»
- «Протестируй buildSectionDefs: params с sections=["sum","graph","glossary","theses"] — возвращает 4 def-объекта? Каждый имеет key, num, title, prompt? prompt содержит текст из Registry (не пустой)?»
- «Протестируй groupPasses: defs с 6 разделами (их порядок уже задан buildDynamicOrder, где graph зависит от sum) — по одному разделу на проход; sum и graph попадают в разные проходы (sum — раньше)?»
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
- Исходник: extract*() + buildContextForSection

**Извлечение:**
```bash
# Извлечь extract*() + buildContextForSection
grep -n 'function extractSection' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Адаптирую контекстную подсистему: buildContextForSection и extract-функции.

В исходнике (прикреплён, extract*() + buildContextForSection) эти функции работают с DOM: 
el.querySelector('[data-section="Таблица категорий"]'). В сервисе — запросы к БД.

Создай:
1. server/services/context-builder.ts:
   - buildContextForSection(sectionKey, synthesisId, depth, effectiveDeps, resolvedDeps)
     Аналог buildContextForSection(). Вместо `generated` (map key→DOM element) — 
     запросы к таблицам sections, categories, theses, glossary_terms.
     Бюджетирование (CONTEXT_BUDGET, FRAGMENT_SHARE) — через getConfig().
     Сюда же — КАНОН applyBudgetPressure() (пол 40%, 01-arch §4.13 ч. II)
     и parentOverheadForSection(): в cost-estimator.ts (беседа 1.1) живёт
     временная ПРИВАТНАЯ копия applyBudgetPressure с меткой TODO(1.3) —
     после создания канона переключить cost-estimator на импорт отсюда
     и удалить копию (проверка приватности+метки — integration-check 4h).

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

3. server/utils/text.ts: truncateText(), tableToText() — из truncateText()

4. server/services/parent-context.ts (04 §1.10; ни одна беседа 07 его не создавала, хотя parentOverheadForSection и parentSpec в ctxLog без него не собираются):
   - resolveParentDeps(), resolveParentDepsForSubsection() — 4-слойное слияние карт parent_deps.* из Registry тем же deepMergeUniq;
   - parentFieldsUsedFor(), buildParentSpecForLog() — spec для ctxLog;
   - validateParentDeps() — порт _validateParentDeps (в исходнике вызывается при загрузке модуля; здесь явный, карты приходят из БД).
   conceptContextBlockFull/Selective — НЕ здесь (meta-synthesis-service, беседа 3.1).

5. server/utils/html-parser.ts (05-file-structure; обёртка над linkedom):
   - parseFragment(html) — контейнер-аналог generated[sectionKey];
   - innerText(el) — ПРИБЛИЖЕНИЕ браузерного innerText: linkedom даёт свой innerText ≈ textContent (склеивает блоки без переносов), поэтому нужен обход дерева с границами блоков. Это адаптация, а не дословный порт.

Приоритет extract-функций (реализовать в этой беседе):
extractSummaryGoals, extractSummaryTensions, extractGraphNodesTable, 
extractGraphEdges, extractGlossaryTable, extractThesesSummary.
Остальные — заглушки с TODO.
```

**Последующие запросы:**
- «Протестируй extractGraphNodesTable: вставь 5 записей в categories (разные типы, centrality, certainty) → extractGraphNodesTable возвращает форматированную таблицу со столбцами промпта графа (philosynth.html ~10897): Категория, Тип, Определение, Центральность, Определённость и столбец уровня (comparative → «Происхождение», transformative → «Генеалогия», generative → «Преодолённые ограничения», шаблон Registry `level.{level}.graph_last_col_name`)? При extGraphMetrics — плюс 6 столбцов (Ист. значимость, Степень инновации, Ясность, Широта, Глубина, Применимость)?»
- «Протестируй extractGlossaryTable: 3 термина в glossary_terms → таблица с колонками Термин, Определение? (extractGlossaryCompact исходника ~8021 берёт РОВНО первые два столбца — termCategory в межсекционный контекст не попадает; ячейки нормализуются как в tableToText: переносы и двойные пробелы → одиночный пробел)»
- «Протестируй buildContextForSection: для sectionKey="theses", effectiveDeps показывает required=["sum:goals","graph:nodes_top"] — результат содержит оба фрагмента? Общая длина не превышает CONTEXT_BUDGET?»
- «Протестируй бюджетирование: создай ситуацию, где суммарный контекст превышает CONTEXT_BUDGET — optional-фрагменты обрезаются, required — нет. ctxLog содержит записи со status "found", "truncated", "skipped_budget"?» ВАЖНО: «required не обрезаются» верно лишь до порога 1.5×budget — шаг 4 исходника (~8419) пережимает required при requiredLen > budget×1.5, щадя неприкосновенный набор UNTOUCHABLE (graph:nodes, graph:edges, sum:goals, sum:tensions). Проверить обе стороны порога.
- «Протестируй extractSummaryGoals: вставь HTML в sections WHERE key='sum' с data-section="Цели и задачи" → extractSummaryGoals парсит через linkedom и возвращает текст?»
- «Edge case: buildContextForSection для первого раздела (sum) — priorContext пуст, функция не crash. extractContextFragment для раздела, который ещё не сгенерирован — возвращает null (не пустую строку и не ошибку: null исходника ~8150 falsy и отличим от валидного пустого фрагмента, buildContextForSection трактует его как status="missing")»

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
- `server/services/section-defs-builder.ts` (из 1.2: buildSectionDefs,
  groupPasses, patchPromptsWithSecCtx — без них проходы не собрать)
- `server/services/context-builder.ts` (из 1.3; ВОЗВРАЩАЕТ CtxLogDraft —
  писать его в context_log обязан generation-service)
- `server/services/context-extractor.ts` (из 1.3: createDbContextSource)
- `server/services/parent-context.ts` (из 1.3: реализация провайдера для
  setParentContextProvider — разъём, оставленный беседой 1.2)
- `server/services/synthesis-engine.ts` (из 1.1)
- `server/services/cost-estimator.ts` (из 1.1: sysChars = buildSYS().length,
  baseStaticChars = baseCtxStatic().length, passes = groupPasses(defs))
- `server/db/schema.ts`
- Исходник: streamResp(), generateDoc() (только логика оркестрации, без DOM)

**Извлечение:**
```bash
# Извлечь streamResp()
grep -n 'function streamResp' philosynth.html | head -1  # найти начало, затем извлечь блок
# Извлечь generateDoc(), go() (оркестрация генерации)
grep -n 'function generateDoc' philosynth.html | head -1  # найти начало, затем извлечь блок
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
     d. Вызов onDelta(delta, totalChars, htmlSoFar) для каждого чанка
        (исходник передавал (length, html); серверу для stream_delta §3.2
        нужен ИНКРЕМЕНТ — сигнатура расширена, зафиксировано беседой 1.4)
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
     e. Записывает genCommon.conceptBlockSizes — размеры контекстных блоков
        каждой концепции-участника (для реконструкции промптов при экспорте)
     f. Пробрасывает extGraphMetrics в промпты (влияет на столбцы графа)
     g. Обновление synthesis.status → "ready"

3. Расширение ws/handler.ts:
   - Обработка subscribe_generation → запуск generateSynthesis
   - Отправка stream_delta, section_done, generation_complete

4. server/services/graph-parser.ts:
   - parseGraphFromHTML(html) → { nodes, edges, topology }
   - saveGraphToDb(synthesisId, parsedGraph) → INSERT в categories, category_edges
   Порт из parseTopology() и parseGraph(),
   но парсинг через linkedom вместо browser DOM.
   v10: парсинг поддерживает расширенные столбцы (extGraphMetrics).
   _rebuildNodeColors/_rebuildEdgeStyles — КЛИЕНТСКИЕ динамические палитры
   (04 §1.7 → client/components/graph/graph-utils.ts, беседа 1.7); на
   сервере не вызываются (сверено беседой 1.4).

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
- «Протестируй классификацию обрыва (v11): невалидный API-ключ → kind="auth" → generation_paused (reasonKind="auth"), synthesis.status="paused", pausedState записан, partial HTML сохранён; ошибка сети до первого токена → kind="pre-stream" → до 3 ретраев (1с/3с/8с), затем пауза»
- «Edge case: генерация с одним разделом (sections=["sum"]) — работает без зависимостей. Генерация с depth="exhaustive" — более длинный ответ, не timeout»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 1.4b: Pause / Resume (бэкенд + клиент)

**Контекст:**
- `01-architecture.md` §4.12 (полная спецификация Pause/Resume)
- `03-specification.md` (WebSocket: generation_paused, resume_generation)
- Из предыдущих бесед: `streaming-manager.ts`, `generation-service.ts` (из 1.4), `ws/handler.ts` (из 0.2), `server/db/schema.ts`
- Исходник: **ДА, фрагменты** — блок PAUSE/RESUME/ABORT + resumeGeneration

**Извлечение:**
```bash
grep -n 'PAUSE / RESUME / ABORT' philosynth.html | head -1  # начало блока (~24483)
grep -n 'async function resumeGeneration\|function _computeGenPauseEstimates\|function _resumeFromSubsection' philosynth.html
```

**Первый запрос:**
```
Реализую паузу и возобновление генерации (спецификация: 01 §4.12).

Прикреплены: ТЗ, спецификация WebSocket, streaming-manager.ts,
generation-service.ts, ws/handler.ts, фрагмент исходника.

Создай:
1. server/services/pause-resume-service.ts:
   - createPausedState(kind, ctx): снимок в syntheses.paused_state
     (gen: passIdx, partialSubsections, expectedSubsections, genParams,
     maxTokensUsed; plan: stepIdx, failedOp, remainingOps)
   - computePauseEstimates(ps): серверный аналог _computeGenPauseEstimates
     (fillMissingSubs / wholeSection / skipRemaining через cost-estimator)
   - resumeGeneration(synthesisId, mode): ветки fill-missing-subs (догенерация
     недостающих подразделов через regenerateSubsection, затем продолжение
     со следующего pass) / retry / skip / stop (финализация)
   - resumePlan(synthesisId, planId, mode)
   - запись pause_marker/resume_marker в generation_log
2. Расширение ws/handler.ts: resume_generation, resume_plan;
   отправка generation_paused (с estimates), generation_resumed
3. client/components/synthesis/PauseModal.tsx: 4 рендерера
   (gen partial/pre-stream, plan, billing, auth) с оценками стоимости
   на кнопках; бейдж паузы в шапке
```

**Последующие запросы:**
- «Протестируй max-tokens: сгенерируй раздел с maxTokens=500 → kind="max-tokens", isPartial=true, partialSubsections заполнен → resume fill-missing-subs догенерирует только недостающие, готовые идут контекстом»
- «Протестируй billing-паузу: mock 400 credit balance → generation_paused reasonKind="billing" → resume retry после «пополнения» продолжает с того же раздела»
- «Протестируй персистентность: пауза → перезапуск сервера → GET /syntheses/:id возвращает pausedState → resume работает»
- «Протестируй stop: частичный контент финализируется, status="ready", pausedState очищен, маркеры в логе»
- «Edge case: resume_generation без pausedState → RESUME_INVALID. Два resume подряд → второй отклонён»

**Завершение беседы:**
- Стандартный блок (компиляция, интеграция, ревью)

---

---

### Беседа 1.5: Форма создания + прогресс (клиент)

> **По факту беседы 1.5** → `docs/08-history.md`, глава «Беседа 1.5», подраздел «По факту беседы 1.5».

**Контекст:**
- `03-specification.md` (секция 1.3 Генерация)
- `05-file-structure.md` (секция client/components/synthesis/)
- `shared/types/`, `shared/constants/`
- `client/api/client.ts` (из 0.4)
- `client/hooks/useWebSocket.ts` (из 0.4)
- Исходник: HTML-разметка (формы, модальные окна, layout) (HTML формы — **только** как визуальный референс структуры)

**Извлечение:**
```bash
# Извлечь HTML-разметка (формы, модальные окна, layout)
grep -n 'body' philosynth.html | head -1  # найти начало, затем извлечь блок
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
   - Чекбоксы из shared/constants/philosophers.ts (+36 в v10)
   - Группировка по эпохам (как в исходнике)
4. client/components/synthesis/SectionPicker.tsx:
   - Чекбоксы секций с secCtx-полями
   - Чекбокс «Расширенные характеристики» под секцией «Граф» (v10, extGraphMetrics)
5. client/components/synthesis/CostEstimate.tsx:
   - Вызывает estimateCost на сервере (или клиентская копия)
6. client/components/synthesis/GenerationProgress.tsx:
   - Подписка на WebSocket
   - Шаги: иконка (◯/⟳/✓), название раздела, количество символов
7. client/hooks/useStreamingGeneration.ts
8. client/api/syntheses.ts: createSynthesis(), getSynthesis()

Интеграция с Unified Concept Pool (из Беседы 1.5b):
- Пул встраивается в SynthesisForm как секция «Загруженные Концепции»
- Перед генерацией: refreshAllSynthParticipants(), сохранение снимка
  выбранной концепции, сброс индикатора, очистка DOC_STATE.modes
- Чекбокс extGraphMetrics: скрыт если «Граф» не выбран (sync с secGraph)
```

**Последующие запросы:**
- «Протестируй полный UI-цикл: открой /synthesis/new → заполни зерно, выбери 2 философов, отметь 3 секции, метод "dialectical" → CostEstimate показывает оценку? → нажми "Генерировать" → GenerationProgress показывает шаги с ◯/⟳/✓?»
- «Протестируй PhilosopherPicker: группировка по эпохам корректна (Античность: Пифагор–Плотин, Средневековье: Августин–Кузанский и т.д.)? Выбор/снятие работает? Счётчик выбранных обновляется?»
- «Протестируй SectionPicker: отметить "graph" → secCtx-поле появляется. Снять — скрывается. Матрица совместимости: выбрать method="creative", sections=["evolution"] → CompatAdvisor показывает предупреждение?»
- «Протестируй GenerationProgress во время реальной генерации: шаги появляются по мере стриминга? Счётчик символов обновляется в реальном времени? После завершения — redirect на /synthesis/:id?»
- «Протестируй валидацию формы (v11): без философов и концепций → ДОПУСКАЕТСЯ (свободный синтез; в промптах плейсхолдер «[свободный синтез: …]»), но тогда зерно обязательно → иначе NO_PARTICIPANTS_SEED_REQUIRED. С участниками без зерна → допускается. Без секций → ошибка. Чекбокс keepFullBudget виден только при концепциях в пуле»
- «Проверь responsive: форма на мобильных — PhilosopherPicker в 2 колонки, SectionPicker в 1 колонку. Кнопка "Генерировать" всегда видна»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

> **По факту беседы 1.5b** → `docs/08-history.md`, глава «Беседа 1.5b», подраздел «По факту беседы 1.5b».

### Беседа 1.5b: Unified Concept Pool (клиент)

**Контекст:**
- `03-specification.md` (секции 1.6 Мета-синтез, 1.9 Импорт)
- `05-file-structure.md` (pool/)
- `shared/types/synthesis.ts`, `shared/types/lineage.ts`
- `client/hooks/useWebSocket.ts`, `client/api/client.ts` (из 0.4)
- `client/components/synthesis/SynthesisForm.tsx` (из 1.5)
- Исходник: **ДА, фрагмент** — Unified Concept Pool + importConceptAsParticipant + snapshotCurrentState

**Извлечение:**
```bash
# Пул: parseConceptFile … renderPoolConcepts
grep -n 'function parseConceptFile' philosynth.html | head -1
# importConceptAsParticipant (вызывается из пула)
grep -n 'function importConceptAsParticipant' philosynth.html | head -1
```

**Первый запрос:**
```
Создаю Unified Concept Pool — единый механизм загрузки, просмотра и выбора
концепций для мета-синтеза.

Прикреплён фрагмент исходника: parseConceptFile, addToPool, removeFromPool,
selectForViewing, snapshotCurrentState, restoreFromPoolSnapshot,
syncConceptParticipants, refreshPoolParticipant, renderPoolConcepts,
handlePoolFileImport, handlePoolUrlImport, toggleSynthParticipant.

Создай:
1. client/components/pool/ConceptPool.tsx:
   - Блок «Загруженные Концепции» в SynthesisForm
   - Кнопки «+ Загрузить из файла» / «+ Загрузить по URL»
   - Состояние: _loadedConcepts (массив), _selectedConceptId
   - Карточка концепции: ☑ мета-синтез, ◉ просмотр, имя, метод×уровень,
     источники контекста, кнопки ✎/✕
   - Предупреждение о непригодности к синтезу
   - Саммари: «N из M для мета-синтеза · ◉ имя — просмотр»

2. client/components/pool/PoolCard.tsx:
   - Одна карточка концепции (чекбокс, радио, инфо, кнопки)

3. Логика переключения просмотра (selectForViewing):
   - Сохранение снимка текущей (snapshotCurrentState)
   - Загрузка новой (restoreFromPoolSnapshot или importHTML)
   - Индикатор «◉ имя» в шапке

4. Логика участия в мета-синтезе (toggleSynthParticipant):
   - Проверка пригодности (participant / participantError)
   - Автовключение обязательных разделов (synthReady)
   - syncConceptParticipants → обновление _conceptParticipants

5. refreshPoolParticipant: обновление participant из снимка/DOM
   refreshAllSynthParticipants: перед генерацией

6. Обработчики импорта: handlePoolFileImport (multiple files),
   handlePoolUrlImport (fetchWithFallback)

7. Интеграция с SynthesisForm: пул вместо старых блоков импорта/концептов
```

**Последующие запросы:**
- «Протестируй: загрузи 2 файла → оба в пуле → отметь один для синтеза (☑) → отметь другой для просмотра (◉) → документ отображается → переключи просмотр → снимок сохранён, новый загружен»
- «Протестируй: ☑ непригодную концепцию (без glossary) → alert с ошибкой»
- «Протестируй: перед генерацией refreshAllSynthParticipants обновляет participant из снимка»
- «Протестируй: удалить концепцию из пула → индикатор сброшен, _conceptParticipants обновлён»

**Завершение беседы:**
- Стандартный блок (компиляция, интеграция, ревью)

---

### Беседа 1.6: Транспорт чтения (сервер) — синтезы, разделы, граф

> Разделение (2026-07-30): прежняя беседа «Просмотр документа + каталог»
> расщеплена на серверную 1.6 и клиентскую 1.6b. Причины: разные
> харнессы тестов (mini-Hono + живой PG против puppeteer + vite),
> почти непересекающиеся комплекты вложений, риск сжатия контекста в
> одном заходе. Прецедент — пара 0.5 (сервер) / 0.6 (клиент).

**Контекст:**
- `03-specification.md` (секции 2.2 Syntheses, 2.3 Sections, 2.4 Elements)
- `02-data-model.md` (syntheses, sections, categories, category_edges,
  cluster_labels, synthesis_lineage)
- Из предыдущих бесед: `server/routes/syntheses.ts` (1.4/1.5),
  `server/services/pause-resume-service.ts` (1.4b — `computePauseEstimates`),
  `server/services/generation-service.ts` (1.4 — `parseSubsectionsFromHTML`;
  до 2026-08-02 здесь ошибочно значился context-extractor.ts — функция
  живёт в generation-service, сверено беседой 1.6),
  `server/ws/handler.ts` (1.4/1.4b), `server/db/schema.ts`
- Исходник: нужен ровно один кусок — формат номера документа [12110]

**Извлечение:**
```bash
sed -n '12110,12115p' source/philosynth.html   # docNum «PS-NNNN-XXXX»
```

**Первый запрос:**
```
Достраиваю REST-слой чтения: без него клиентские беседы 1.6b и 1.7
нечем наполнить.

Создай / расширь:
1. Расширение server/routes/syntheses.ts (03 §2.2):
   - GET    /syntheses         ?page&limit&sort&order&status&method&search
                               → { items: SynthesisPreview[], total }
   - GET    /syntheses/public  ?page&limit&search&philosopher
                               → { items: SynthesisPreview[], total }
   - GET    /syntheses/:id     → { synthesis: SynthesisFull }
                                 с pausedState и pauseEstimates
                                 (computePauseEstimates, fail-open {})
   - PATCH  /syntheses/:id     { title?, isPublic? }  — только владелец
   - DELETE /syntheses/:id                            — только владелец

2. server/routes/sections.ts (03 §2.3) — модуль есть в 05, но не
   создавался ни одной беседой:
   - GET /syntheses/:id/sections       → { sections: SectionSummary[] }
   - GET /syntheses/:id/sections/:key  → { section: SectionFull }
   - GET /syntheses/:id/sections/:key/context
       → живой расчёт buildContextForSection (1.3): 03 §2.3 требует
         contextText, которого context_log НЕ хранит; поля ответа =
         CtxLogDraft билдера (формулировка «последняя запись
         context_log» была неточной — правка 2026-08-02).
     Нужен полю контекста в EditSectionCard (2.3). В первой
     редакции предпатча было сказано «остаётся беседам 2.3/2.4» —
     это оказалось допущением: ни 2.3, ни 2.4 его не создают.

3. server/routes/elements.ts — ТОЛЬКО чтение графа (03 §2.4):
   - GET /syntheses/:id/categories
       → { categories, edges, clusters, topology }
   PATCH-часть (categories/:catId, edges/:edgeId, theses, glossary)
   в этой беседе НЕ делается — она остаётся беседе 5.1.

4. POST /syntheses — заполнять doc_num при создании записи.
   Формат исходника [12110]:
   "PS-" + rand(1000..9999) + "-" + Date.now().toString(36).toUpperCase().slice(-4)

5. server/ws/handler.ts — режим «только подписка»:
   сейчас subscribe_generation при status='generating' без активного
   прогона ЗАПУСКАЕТ generateSynthesis. Страница просмотра (1.6b)
   не должна перезапускать генерацию — нужен явный флаг подписки
   без запуска либо отдельное сообщение.

6. Снимок структуры документа: заполнять syntheses.structure_sections
   при создании записи (копия sectionOrder). Колонка есть в схеме и
   в 02, но во всём server/ в неё нет НИ ОДНОЙ записи — без этого
   карточка «Структура документа устарела» (беседа 2.3) всегда
   попадает в ветку «актуальность не определена». Обновление снимка
   после исполнения плана — беседа 2.2.

7. POST /syntheses/:id/duplicate → { id: string } (03 §2.2):
   эндпоинт не был упомянут в 07 нигде (аудит 2026-07-30). Отдан этой
   беседе как владельцу routes/syntheses.ts. Копия синтеза со всеми
   разделами и элементами, новый doc_num, title += « (копия)»,
   is_public = false, запись в synthesis_lineage не создаётся —
   это копия, а не потомок.

8. Разбор маркеров TODO(1.6) в коде: их девять, и после разделения
   беседы они адресуют несуществующую беседу. Серверные закрыть здесь,
   клиентские переадресовать в TODO(1.6b), не оставляя ни одного
   TODO(1.6) в дереве.

9. Монтирование новых роутов в server/index.ts.
```

**Решения, зафиксированные до беседы (аудит 2026-07-30):**
- **Доступ:** GET /:id, /:id/sections, /:id/categories — владелец ИЛИ
  `is_public = true` (каталог «Публичные» ведёт на чужой синтез);
  иначе 403 FORBIDDEN, несуществующий id — 404 NOT_FOUND (03 §4.3).
  PATCH и DELETE — только владелец.
- **`contextQualityScore` до беседы 2.4 всегда `null`**:
  `context-quality.ts` (getSectionContextQuality) назначен 2.4, которая
  идёт позже; в роуте — `TODO(2.4)`.
- **`subsections`** в SectionSummary заполняются
  `parseSubsectionsFromHTML` (1.4) — нужны TableOfContents в 1.6b.
- **Стоимость** отдаётся из `syntheses.total_cost_usd`; роут ничего не
  пересчитывает по ставкам моделей.
- **Поиск серверный** (`?search=`, под него в схеме gin_trgm_ops по
  `title`); клиент фильтрует только уже загруженную страницу.
- **`capsule`** остаётся отдельным разделом в `sections` И полем
  `capsule_html`; роут ничего не вырезает — исключение ключа при
  рендере делает клиент (1.6b).

**Последующие запросы:**
- «Протестируй GET /syntheses: создай через POST два синтеза, запроси список → оба в items, total=2, сортировка по createdAt desc по умолчанию. Проверь ?search= (частичное совпадение title), ?status=, ?method=, ?page=&limit=»
- «Протестируй GET /syntheses/:id: возвращает SynthesisFull с sectionOrder, docNum, философами из synthesis_lineage, capsuleHtml, totalCostUsd. Для приостановленного синтеза — pausedState и pauseEstimates; для обычного — null»
- «Протестируй доступ: чужой непубличный синтез → 403 FORBIDDEN; после PATCH { isPublic: true } тот же GET от другого пользователя → 200; несуществующий id → 404 NOT_FOUND. То же для /sections и /categories»
- «Протестируй GET /syntheses/:id/sections: список SectionSummary в порядке sectionOrder, subsections заполнены из HTML, contextQualityScore = null (TODO(2.4)). GET /sections/:key возвращает SectionFull с htmlContent»
- «Протестируй GET /syntheses/:id/categories: categories с v10-метриками (clarity, breadth, depthScore, applicability, historicalSignificance, innovationDegree), edges с certainty/historicalSupport/logicalNecessity/contextDependency, clusters из cluster_labels, topology с ролями»
- «Протестируй doc_num: после POST /syntheses поле заполнено по маске PS-NNNN-XXXX и не пустое; у двух синтезов номера различаются»
- «Протестируй WS: для синтеза со status='generating' подписка в режиме просмотра НЕ приводит к вызову generateSynthesis, но события стриминга доходят»
- «Edge case: GET /syntheses?page=99 → пустой items, total корректен. GET /sections для синтеза без разделов → пустой массив, не 404. GET /categories для синтеза без графа → пустые массивы, topology с пустыми объектами»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Добавь секции в scripts/check-integration (по образцу предыдущих бесед) для новых роутов»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 1.6 (2026-08-02, беседа закрыта):** → `docs/08-history.md`, глава «Беседа 1.6», подраздел «По факту 1.6 (2026-08-02, беседа закрыта)».

### Беседа 1.6b: Просмотр документа + каталог (клиент)

**Контекст:**
- `03-specification.md` (секции 1.2, 1.4, 2.2, 2.3)
- `01-architecture.md` (§4.15 п.4–5: автодобавление в пул; шапка
  документа — раскрывающиеся поля, авто-заголовок из «name», капсула)
- `05-file-structure.md` (document/, catalog/)
- Из предыдущих бесед: роуты чтения из 1.6,
  `client/src/hooks/useStreamingGeneration.ts` и
  `client/src/components/synthesis/PauseModal.tsx` (1.5/1.4b — нужны для
  edge case «status=generating»), `client/api/`, `client/stores/`
- Исходник: **НУЖЕН для документа** (каталога в standalone-файле нет —
  для CatalogPage/SynthesisCard исходник действительно не нужен).
  Фрагмент: `docs/fragments-for-conversations/1.6-document-view.js`

**Извлечение (по именам из карты 04, а не по номерам строк):**
```bash
python3 scripts/extract-by-name.py \
  docs/fragments-for-conversations/1.6-document-view.spec
```
Спецификация перечисляет ИМЕНА: CSS-селекторы документа (`.doc-*`,
`#docTOC`, `.toc-*`, `.section-*`, `.callout*`, `.risk*`,
`.validity-stamp`, `.actions-bar`, `.action-btn`), разметку `#docOutput`
и функции `makeHeaderDisclosure`, `buildDocHeaderExtras`,
`buildTableOfContents`, `extractCapsuleText`, `restoreCapsulesFromHTML`,
`updateCapsuleInHeader`, `removeCapsuleFromDocBodies`,
`makeSectionCtxDisclosure`, `editDocTitle`, `updateDocTitleFromName`,
`updateFooterCost`. Границы вычисляет сборщик; номера строк попадают в
готовый фрагмент как результат поиска и не требуют сопровождения.

Два остаточных диапазона в спецификации помечены отдельно и стареют:
заполнение шапки при старте генерации и разметка панели действий —
последовательности операторов без именованных якорей. При расхождении
искать по содержимому (`docNum` начинается с «PS-»; панель действий
содержит кнопки экспорта).

`--check` показывает, что и где нашлось, ничего не записывая: полезно
после любой правки исходника.
НЕ портировать: `rebuildDbMapping` [5686] и всю индексацию `db{N}` /
`DOC_STATE.sectionDbIdx` — в React разделы адресуются по `key`;
`.output-wrap` (видимостью управляет маршрут).

**Первый запрос:**
```
Создаю страницу просмотра синтеза и каталог.

Прикреплён фрагмент исходника (1.6-document-view.js): CSS документа,
разметка-эталон шапки и футера, buildTableOfContents, шапка с
раскрывающимися полями, капсула, updateFooterCost.

Создай:
1. Перенос CSS документа в client/src/globals.css:
   .doc-header/.doc-title/.doc-subtitle/.doc-meta-*, #docTOC/.toc-*,
   .doc-section/.section-num/.section-title/.doc-content/.doc-table/
   .callout*/.risk*, .doc-footer/.validity-stamp, .actions-bar.
   Без них рендер html_content разваливается: после 0.4 в globals.css
   только палитра.

2. client/pages/SynthesisPage.tsx:
   - Загрузка синтеза по ID (GET /syntheses/:id из беседы 1.6)
   - Рендер DocumentView

3. client/components/document/:
   - DocumentView.tsx: рендер HTML-контента разделов (dangerouslySetInnerHTML),
     ключ `capsule` исключается — капсула живёт в шапке
   - DocumentHeader.tsx: номер (docNum), участники, метод, капсула,
     раскрывающиеся поля (buildDocHeaderExtras)
   - SectionView.tsx: обёртка с якорем #sec-{key} и кнопкой ⏫.
     Свой заголовок НЕ рисует: html_content хранит весь
     <div class="doc-section"> вместе с section-num и section-title
   - TableOfContents.tsx: якоря #sec-{key} и #subsec-{key}-{slug}
     (порт buildTableOfContents; подразделы из SectionSummary.subsections)
   - DocumentFooter.tsx: токены и стоимость — значение
     synthesis.totalCostUsd как есть, без пересчёта по ставкам

4. client/pages/CatalogPage.tsx:
   - Вкладки: «Мои» (GET /syntheses) / «Публичные» (GET /syntheses/public)
   - Поиск (параметр ?search=, серверный)
   - Переключатель публикации через PATCH /syntheses/:id { isPublic }

5. client/components/catalog/:
   - SynthesisList.tsx
   - SynthesisCard.tsx: превью (название, метод, уровень, философы, дата)

6. client/api/sections.ts: getSections(), getSection()
7. client/stores/synthesis-store.ts (Zustand): текущий синтез, разделы

8. SynthesisPage при status='generating' — подписка на WS через
   useStreamingGeneration (1.5) в режиме «только просмотр»:
   открытие страницы не должно запускать генерацию заново
   (режим добавлен в ws/handler в беседе 1.6).

9. Проверить, что после беседы 1.6b в дереве не осталось маркеров
   TODO(1.6): серверные закрывает беседа 1.6, клиентские переадресуются
   в TODO(1.6b) и закрываются здесь (аудит 2026-07-30 насчитал девять
   маркеров до разделения беседы).
```

**Последующие запросы:**
- «Протестируй SynthesisPage: открой /synthesis/:id для ранее созданного синтеза → DocumentHeader показывает номер, метод, уровень, философов? DocumentView рендерит HTML всех разделов? TableOfContents содержит якоря на каждый раздел?»
- «Протестируй CSS: таблицы в разделах отрисованы стилем .doc-table (рамки, зебра), callout'ы цветными блоками, .risk-метки окрашены. Сравни с исходником визуально»
- «Протестируй навигацию: клик на элемент TableOfContents → плавная прокрутка к разделу; якоря подразделов работают. Кнопка ⏫ в заголовке раздела → возврат к оглавлению»
- «Протестируй капсулу: она показана в шапке документа и НЕ продублирована среди тел разделов»
- «Протестируй CatalogPage: вкладка "Мои" → список синтезов текущего пользователя. Опубликуй синтез (PATCH /syntheses/:id { isPublic: true }) → он появляется во вкладке "Публичные". Поиск уходит на сервер параметром ?search=»
- «Протестируй SynthesisCard: отображает название, метод×уровень, список философов (через запятую), дату создания. Клик → навигация на /synthesis/:id»
- «Протестируй DocumentFooter: показывает суммарные токены (input + output) и стоимость в формате "$X.XXXX" — ровно значение synthesis.totalCostUsd, без пересчёта по ставкам модели»
- «Edge case: SynthesisPage для синтеза со status="generating" — показывает индикатор загрузки или подключается к WebSocket для стриминга, а не пустой документ; проверь, что открытие страницы НЕ запускает генерацию заново. Несуществующий ID — 404-страница; чужой непубличный синтез — 403»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 1.6b (2026-08-03, беседа закрыта):** → `docs/08-history.md`, глава «Беседа 1.6b», подраздел «По факту 1.6b (2026-08-03, беседа закрыта)».

### Беседа 1.7: Граф категорий, 3D + 2D (клиент)

> Разделение (2026-07-30): беседа стала чисто клиентской. Роут
> `GET /syntheses/:id/categories` перенесён в серверную беседу 1.6 —
> прежде он рождался только в 5.1 (Фаза 5), то есть страницу графа
> нечем было наполнить через две фазы после её создания.

**Контекст:**
- `04-code-reuse-map.md` (секция 3 — непереносимое, graph/)
- `05-file-structure.md` (graph/)
- `03-specification.md` (секция 2.4 — GET /syntheses/:id/categories)
- Из предыдущих бесед: `shared/types/graph.ts` (Category, CategoryEdge,
  ClusterLabel, TopologyInfo, GraphData — готовы), роут categories из
  беседы 1.6, `client/pages/SynthesisPage.tsx` из 1.6b (хозяин модалки —
  кнопка графа живёт в actions-bar над документом)
- Исходник: вся визуализация графа (TC … build2D) (ВСЯ визуализация графа)

**Извлечение — здесь нужен большой фрагмент:**
```bash
# Основной фрагмент готов: 1.7-graph-viz.js [12990–16366] — внутри всё,
# что перечисляет первый запрос (graph-utils, build3D/build2D, панели,
# легенда, физика, геометрия).
grep -n 'GRAPH MODAL\|MMD EXPORT' philosynth.html | tail -3
grep -n 'function build3D\|function build2D' philosynth.html
# ВНЕ основного фрагмента (аудит 2026-07-30) — объявление graph-STATE:
# G, roleMode, legendFilter, clusterVisible, clearLegendFilter.
# Собирается по именам, без номеров строк:
python3 scripts/extract-by-name.py \
  docs/fragments-for-conversations/1.7-graph-state-extras.spec
```
> Границей извлечения служит баннер `MMD EXPORT`, поэтому `exportMMD`
> [16370] и соседние экспортёры в фрагмент НЕ входят — и не должны:
> они принадлежат беседе 4.2 (серверные `services/export/*`).

**Первый запрос:**
```
Портирую визуализацию графа категорий в React.

Прикреплён фрагмент исходника (вся визуализация графа (TC … build2D)): build3D, build2D, 
typeColor, edgeTypeStyle, showNodePanel, buildLegend, и все вспомогательные функции.

Создай:
0. Зависимости клиента (client/package.json) — их НЕТ после 0.4:
   three@0.128.x (исходник рассчитан на r128) + @types/three,
   d3@^7.8.5 + @types/d3. Исходник грузил обе библиотеки тегами
   <script> с cdnjs — в React-клиенте нужны npm-пакеты; CDN в
   песочнице закрыт egress-прокси, тесты через него не пройдут.

1. client/components/graph/graph-utils.ts:
   - `_TC_HUE_SEEDS`, `_EC_HUE_SEEDS`, `_EC_DASH_SEEDS`, CPAL (динамические палитры)
   - `_rebuildNodeColors()`, `_rebuildEdgeStyles()` — заполняют `_nodeColorMap`/`_edgeStyleMap` (v10)
   - typeColor, typeColorHex, edgeTypeStyle, _blendHex, _hexToHSL, _hslToHex
   - `getStructuralMarkers()` (возвращает массив, не один маркер) (v10)
   - `clearLegendFilter()`, `legendFilter` (v10)
   - nodeSymbolPath (D3-формы по роли)
   - nodeGeometry3D (Three.js-геометрии по роли)
   - polyPath, hexStarPath, trapezoidPath, rectPath

2. client/utils/graph-physics.ts:
   - tick(), warmup() — из tick()

3. client/utils/graph-geometry.ts:
   - nodeGeometry3D, mkSprite — из nodeGeometry3D()

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
   - Кнопки экспорта (MMD, PNG, JSON) — ЗАГЛУШКИ с TODO(4.2):
     exportMMD/exportPNG/exportJSON реализуются как серверные сервисы
     в беседе 4.2 (services/export/*) и в фрагмент 1.7 не входят
     (обрыв на 16366, exportMMD с 16370). Здесь — только разметка
     кнопок и обработчики-заглушки
   - Toggle кластеров, toggle роль

7. client/components/graph/NodePanel.tsx:
   - showNodePanel → React-компонент
   - Определение, метрики, роли, связи

8. client/components/graph/GraphLegend.tsx:
   - Кликабельные элементы легенды → фильтрация графа (legendFilter)
   - clearLegendFilter() для сброса

9. client/components/graph/EdgePanel.tsx:
   - showEdgePanel(container, edgeData, allNodes, clusterLabels):
     тип, направление (→/↔/↺), сила (бар), описание,
     расширенные метрики связи (certEdge, innovDeg, histSupport, logNec, ctxDep),
     блоки обоих узлов (с метриками и кластерами)

10. client/api/elements.ts — модуль создаётся ЗДЕСЬ (в контексте
    беседы он числился готовым, но не создавался никем; беседа 5.2
    говорит о нём «расширение»):
    - getCategories(synthesisId) → { categories, edges, clusters, topology }

Дополнительные задачи:
- getStructuralMarkers(name): возвращает МАССИВ маркеров (core, generative,
  bridge, central, peripheral) с параметрами strokeWidth, strokeDash, filter,
  innerShape, emissive3d. Не один маркер, а все подходящие.
- NodePanel: секция «РАСШИРЕННЫЕ» для узлов с _extended=true
  (histSig, innovDeg, clarity, breadth, depth, applic — бары + значения)

Порт максимально близкий к исходнику — та же физика, аналогичные цвета (динамические палитры),
те же формы. roleMode по умолчанию "procedural". clearLegendFilter для сброса фильтра легенды.
```

**Последующие запросы:**
- «Протестируй Graph3D: открой GraphModal для синтеза с 10+ категориями → 3D-сцена рендерится? Узлы видны, рёбра видны? Вращение мышью, зум колёсиком, drag узлов работают?»
- «Протестируй формы узлов по ролям: synthesis → октаэдр, thesis → тетраэдр, antithesis → перевёрнутый тетраэдр, bridge → куб с wireframe. Цвета по типам совпадают с исходником (TC: онтологическая → #e74c3c, эпистемологическая → #3498db)?»
- «Протестируй Graph2D: переключи на вкладку 2D → D3 force simulation, SVG-маркеры стрелок, формы узлов (nodeSymbolPath). Drag узлов работает? Рефлексивные петли (arcPath) рендерятся?»
- «Протестируй NodePanel: клик на узел → панель справа с определением, метриками (центральность, определённость), ролями (structural + procedural), списком входящих/исходящих/рефлексивных связей. Повторный клик — снятие выделения»
- «Протестируй кластеры: кнопка Toggle Clusters → торические кольца (3D) / пунктирные окружности (2D) появляются/скрываются. Wireframe-эллипсоиды кластеров (3D) / convex hull (2D) позиционируются правильно? Спрайты-метки кластеров видны?»
- «Протестируй hover+select: навести на узел → подсветка + соседние узлы подсвечены, остальные dimmed. Клик — фиксация выделения. Клик на пустое место — сброс. Тултип с именем и типом при hover»
- «Edge case: граф с 1 узлом (без рёбер) — рендерится без ошибок. Граф без категорий вообще (пустые массивы из GET /categories) — модалка показывает пустое состояние, не падает. Граф с рефлексивной связью — петля отображается. Чужой публичный синтез — граф открывается, чужой непубличный — 403»
- «Мобильный touch: pinch-zoom, single-touch orbit, tap для select. В puppeteer это Input.dispatchTouchEvent через CDP — если харнесс не тянет, зафиксируй как ручную проверку и вынеси в TODO, не имитируй тест мышью»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 1.7 (2026-08-04):** → `docs/08-history.md`, глава «Беседа 1.7», подраздел «По факту 1.7 (2026-08-04)».


## 4. Протокол Фазы 2: Редактирование и каскады

### Беседа 2.1: Cascade Analyzer + Edit Planner (бэкенд)

**Контекст для загрузки:**
- `01-architecture.md` (секция 4.5 Edit Planner)
- `02-data-model.md` (таблица edit_plans)
- `03-specification.md` (секция 2.6 Edit Plans)
- `04-code-reuse-map.md` (секция 1.1 — cascade-analyzer)
- Из предыдущих бесед: `server/services/synthesis-engine.ts`, `server/services/section-defs-builder.ts`, `server/db/schema.ts`, `shared/types/edit-plan.ts`, `server/utils/topo-sort.ts` (sourceOf, sortInTopoOrder-основа), `server/services/cost-estimator.ts` (дополняется wave-функциями, см. первый запрос)
- Исходник: computeDependents … computeFactualDependents + recalcEditPlan … updateLiveCascade

**Извлечение фрагментов перед беседой:**
```bash
# Извлечь computeDependents … computeFactualDependents
grep -n 'function computeDependents' philosynth.html | head -1  # найти начало, затем извлечь блок
# Извлечь recalcEditPlan … updateLiveCascade
grep -n 'function recalcEditPlan' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Портирую систему каскадного анализа и планирования редактирования.

Прикреплены: архитектура (Edit Planner), спецификация (Edit Plans API), карта
переиспользования, synthesis-engine.ts, section-defs-builder.ts, schema.ts, типы,
и фрагменты исходника (computeDependents … computeFactualDependents: computeDependents и т.д.; 
recalcEditPlan … updateLiveCascade: recalcEditPlan, updateLiveCascade).

Создай:
1. server/services/cascade-analyzer.ts:
   - computeDependents(effectiveDeps) — из computeDependents()
   - sourceOf(ctxKey) — УЖЕ портирован в 1.1 (server/utils/topo-sort.ts);
     здесь — реэкспорт для соответствия карте 04, не дубликат
   - getIntraDependents(sectionKey, subsectionName) — из getIntraDependents()
     Читает INTRA_DEPS через getConfig("intra_deps")
   - getCrossSecDependents(sectionKey, subsectionName) — из getCrossSecDependents()
     Читает SUBSECTION_TO_CTX_KEYS через getConfig("subsection_ctx_keys")
   - getAffectedModes(changedSections, changedSubsections?) — из getAffectedModes()
   - sortInTopoOrder(keys) — из sortInTopoOrder()
   - buildPlanOrder(plan) — единый топологический порядок add+regen (v10, НОВОЕ)
   - buildCtxKeyConsumers() — обратная карта ключ→подразделы-потребители
     (гранулярный каскад: «перегенерировать подраздел, а не весь раздел», v11)
   - canonicalSubsectionKey() — каноникализация портретных заголовков
     (варианты SUBSECTION_SUM_PORTRAIT схлопываются для карт зависимостей, v11).
     ПОТРЕБИТЕЛЬ ИЗ 1.3: extractRelevantIntraSectionContext в context-builder
     принимает её колбэком (default — тождество, метка TODO(2.1) в коде);
     после создания подставить настоящую, иначе при кардинальности ≠ multi
     имена подразделов не совпадут с каноном INTRA_DEPS.
   - buildFactualDepsMap(ctxLog) — из buildFactualDepsMap()
   - computeFactualDependents(factDeps) — из computeFactualDependents()
   - analyzeImpact(synthesisId, plan): полный каскадный анализ —
     вычисляет downstream (какие разделы затронуты), upstream (какие зависимости 
     отсутствуют для добавляемых разделов), активные подстановки, рекомендации.
     Это серверный аналог updateLiveCascade() (updateLiveCascade()).

2. server/services/edit-planner.ts:
   - createPlan(synthesisId, userId, actions): 
     Принимает { regen, remove, add, modeRegen, modeRemove },
     вызывает analyzeImpact, добавляет каскадные шаги с cascadeGenerated: true,
     сохраняет в edit_plans, возвращает EditPlan
   - updatePlan(planId, stepUpdates):
     Обновляет статусы шагов (confirmed/skipped), пересчитывает каскад
   - estimatePlanCost(plan):
     Вызывает estimateCost для regen+add шагов + estimateModeCost для mode шагов
   - Дополни server/services/cost-estimator.ts (файл из 1.1):
     estimateCascadeWaveCost() — из estimateCascadeWaveCost(),
     formatWaveCost() — из formatWaveCost().
     Отложены из беседы 1.1 сознательно: требуют каскадного анализа
     (computeDependents/волны), который появляется только здесь

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

**По факту 2.1 (2026-08-04):** → `docs/08-history.md`, глава «Беседа 2.1», подраздел «По факту 2.1 (2026-08-04)».

### Беседа 2.2: Plan Executor + Regeneration (бэкенд)

> **Долг, переадресованный сюда (аудит 2026-07-30):** в
> `client/src/components/synthesis/PauseModal.tsx` висит открытый
> `TODO(1.5)` — «confirm деградации зависимостей при skip» [25686]:
> сейчас skip отправляется без подтверждения, потому что сервер не
> спрашивает. Беседа 1.5 закрыта, подтверждение по смыслу серверное —
> реализовать здесь и переименовать маркер в `TODO(2.2)` либо снять.

**Контекст:**
- `01-architecture.md` (секции 4.4 Streaming, 4.5 Edit Planner)
- `03-specification.md` (секция 3 WebSocket: plan_updated, plan_step_started, plan_step_done)
- Из предыдущих бесед: `server/services/cascade-analyzer.ts` (из 2.1), `server/services/streaming-manager.ts` (из 1.4), `server/services/context-builder.ts` (из 1.3), `server/services/generation-service.ts` (из 1.4), `server/services/edit-planner.ts` (из 2.1), `server/ws/handler.ts` (из 0.2)
- Исходник: executeEditPlan … regenerateSubsection + addSection, deleteSection

**Извлечение:**
```bash
# Извлечь executeEditPlan … deleteSection
grep -n 'function executeEditPlan\|function addSection' philosynth.html | head -2  # найти границы блока
```

**Первый запрос:**
```
Реализую исполнение планов редактирования и перегенерацию разделов/подразделов.

Прикреплены: streaming-manager.ts, context-builder.ts, generation-service.ts, 
cascade-analyzer.ts, edit-planner.ts, ws/handler.ts, и фрагмент исходника 
(executeEditPlan, regenerateSection, regenerateSubsection,
deleteSection, addSection).

Создай:
1. Расширение server/services/generation-service.ts:
   - regenerateSection(synthesisId, sectionKey, newCtx?, opts?):
     Адаптация regenerateSection(). v10: параметр `opts.fromPlan` подавляет TOC и каскады. Пересобирает промпт для одного раздела,
     стримит через Claude, сохраняет результат, парсит элементы,
     обновляет section в БД, записывает genLog/ctxLog.
   - regenerateSubsection(synthesisId, sectionKey, subsectionName, opts?):
     Адаптация regenerateSubsection(). extractRelevantIntraSectionContext через 
     серверный HTML-парсинг, стриминг подраздела, замена в HTML.
   - addSection(synthesisId, sectionKey, ctx?, opts?):
     Адаптация addSection(). Параметр `opts.fromPlan` подавляет TOC и каскады.

   - refreshSumDef():
     Перестраивает sectionDefs["sum"] после добавления/удаления разделов.
     Подраздел «Структура документа» содержит актуальный перечень разделов.

   Трекинг «Структура документа»:
   - DOC_STATE.structureSections: снимок sectionOrder при генерации подраздела
   - При regenerateSubsection("sum", "Структура документа"):
     structureSections = [...sectionOrder]
   - buildDocStateFromImport: восстанавливает structureSections из
     embeddedState (реализуется import-service, беседа 4.2 — там
     обязанность прописана повторно; в 2.2 модуля импорта ещё нет)

   - deleteSection(synthesisId, sectionKey):
     Адаптация deleteSection(). Удаление из sections + sectionOrder,
     перенумерация §§ и ссылок, запись deletion_marker в genLog.

   Пост-план (после всех шагов executePlan):
   - Если добавлялись/удалялись разделы → предложить обновить «Структура
     документа» (по факту 2.2 — pending-шаг regen_subsection
     «sum:Структура документа» + plan_steps_added; исполнение —
     confirm_step)
   - Если добавлялись разделы → вычислить downstream, предложить каскад
   - regenStructureFromEditModal(): кнопка в карточке «Структура
     устарела» — клиент (беседа 2.3); серверная часть =
     regenerateSubsection("sum", «Структура документа»). Хвост «Вставка
     в sectionOrder, перенумерация, генерация, сохранение» относился к
     addSection (сбой форматирования, поправлен 2.2).

2. server/services/plan-executor.ts:
   - executePlan(planId):
     a. Загружает план из БД
     b. Обновляет статус → "executing"
     c. Строит единый порядок через `buildPlanOrder()` (v10: add+regen в топо-порядке)
     d. Для каждого шага последовательно:
        - Отправляет plan_step_started через WebSocket
        - Исполняет: deleteSection / regenerateSection / addSection / 
          regenerateSubsection / regenerateModeSilent (mode-service —
          беседа 4.1; до неё — разъём setModeRegenerator: без
          регистрации шаг → failed, план продолжается — паритет modeErr)
        - Записывает result в шаг, отправляет plan_step_done
     e. После исполнения базовых шагов: пересчитывает каскад
        (cascade-analyzer) — по факту 2.2 ОДИН раз, паритет исходника
        («после каждого шага» 01 §4.5 п.8 — «может»); новые downstream →
        pending-шаги, plan_steps_added через WebSocket
     f. Обновляет synthesis.version, статус плана → "done"
   
   - cancelPlan(planId): прерывает исполнение
   - при обрыве шага (kind из таксономии стриминга): pausedState kind="plan"
     → generation_paused kind="plan" (03 §3.2; отдельного plan_paused
     нет; при user-abort сообщение не шлётся — тип исключает, клиент
     берёт паузу из GET /:id); продолжение — resumePlan из
     pause-resume-service (1.4b)

3. Расширение server/ws/handler.ts:
   - Обработка execute_plan → запуск executePlan
   - Обработка confirm_step (для пошагового режима)
   - Обработка cancel

4. server/routes/plans.ts — добавить:
   - POST /syntheses/:id/plans/:planId/execute

5. server/routes/generation.ts:
   - POST /syntheses/:id/regenerate/:sectionKey
   - POST /syntheses/:id/regenerate-subsection

6. setPlanResumeExecutor — регистрация исполнителя планов в
   pause-resume-service (долг TODO(2.2) главы 1.4b; до аудита
   2026-07-31 в протоколе не значился):
   сейчас resume_plan с retry / skip_step отдаёт RESUME_INVALID с
   пояснением, потому что исполнителя некому вызвать. После
   plan-executor.ts (пункт 2) зарегистрировать его и убрать заглушку;
   проверить, что пауза внутри исполнения плана возобновляется, а не
   только пауза внутри генерации раздела.
```

**Последующие запросы:**
- «Протестируй: создай синтез с 5 разделами, создай план regen=["graph"], запусти execute — проверь, что graph перегенерирован, genLog содержит запись, ctxLog обновлён»
- «Протестируй каскад: regen=["graph"] → после исполнения, план должен предложить перегенерировать theses (если theses зависит от graph). Проверь plan_steps_added через WebSocket»
  (по факту 2.2: каскад предвычисляется createPlan (2.1) — «предложение
  theses» = pending-шаги уже в плане при создании, после исполнения
  regen-плана НОВЫХ шагов не возникает и plan_steps_added для theses
  невозможен по построению; живое plan_steps_added тест проверяет на
  структурном пост-шаге add/delete-планов)
- «Протестируй deleteSection: удали "history", проверь что sectionOrder обновлён, номера перенумерованы»
- «Протестируй addSection: добавь "dialogue" к синтезу без dialogue, проверь позицию в sectionOrder и нумерацию»
- «Edge case: regenerateSubsection — подраздел с INTRA_DEPS. Проверь, что extractRelevantIntraSectionContext возвращает только зависимые подразделы, а не все»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 2.2 (2026-08-09):** → `docs/08-history.md`, глава «Беседа 2.2», подраздел «По факту 2.2 (2026-08-09)».

### Беседа 2.3: Edit Modal + Cascade Panel (клиент)

**Контекст:**
- `03-specification.md` (секции 1.5 Редактирование, 2.3 Sections, 2.6 Edit Plans, 3.2 WebSocket)
- `05-file-structure.md` (секция client/components/edit/)
- Из предыдущих бесед: `shared/types/edit-plan.ts`, `shared/types/ws-messages.ts`, `client/hooks/useWebSocket.ts`, `client/stores/synthesis-store.ts` (из 1.6b), `client/api/client.ts`, `server/routes/plans.ts` (2.1 + 2.2), `server/routes/sections.ts` (1.6 — GET /sections и /:key/context)
- Из 1.6b: `SynthesisPage.tsx`, `SectionView.tsx` — модалка открывается поверх страницы синтеза; долг 1.6b:
  `makeSectionCtxDisclosure` (disclosure секционного контекста —
  sec_context уже в SectionFull) портируется здесь (§12)
- Исходник: openEditModal … подразделовая перегенерация UI (**только** как визуальный референс UI)

> **ФАКТ 2.3 (2026-08-20)**: врезка ниже оказалась неполной — live-каскаду
> и панели подраздела транспорта НЕ хватало (CascadeImpact и
> getIntraDependents/getCrossSecDependents/estimateSubsectionCost не были
> доступны клиенту), а extGraphMetrics было некуда писать. Беседа 2.3
> добавила read-only превью POST /plans/impact и POST /subsection-impact
> (03 §2.6/§2.5) и расширила PATCH /syntheses/:id полем extGraphMetrics —
> из вилки «черновик-план на каждый клик vs превью» выбрано превью
> (надёжнее: без мусора в edit_plans и гонок). Карточки результатов
> режимов в модалке опущены до 4.1 (нет routes/modes и данных); гейты
> openEditModal (API_KEY / DOC_STATE.incomplete) — до 6.1/4.3
> [ФАКТ 4.3: incomplete-доля ВЫРОЖДЕНА — колонки в схеме нет,
> критичность импорта уходит клиенту в warnings ответа POST
> /syntheses/import (подтверждение — на ImportPage ДО отправки);
> редактирование импортированного не блокируется — паритет исходника,
> позволявшего то же после confirm. За 6.1 остаётся только
> API_KEY-доля].
>
> **Транспорт готов** (аудит 2026-07-30): `server/routes/plans.ts`
> создаёт беседа 2.1 и расширяет 2.2; `POST /syntheses/:id/regenerate-subsection`
> и WS-сообщения `regen_subsection` описаны в 03 §2.3/§3.2 и реализуются
> беседой 2.2. В отличие от 1.6/1.7, здесь клиентская беседа стоит
> после своего сервера — ничего дописывать не нужно.

**Извлечение:**
```bash
# Извлечь openEditModal … подразделовая перегенерация UI
grep -n 'function openEditModal' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Создаю UI редактирования синтеза.

Прикреплён фрагмент исходника (openEditModal … подразделовая перегенерация UI) — как визуальный референс 
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
   - Поле контекста (скрыто, разворачивается; GET /sections/:key/context)
   - Индикатор изменённости: ФАКТ — префикс «⟳ » в заголовке карточки
     (renderEditSections [18521]: `${isEdited ? "⟳ " : ""}`; формулировка
     «✓ изменён» была приблизительной)
   - Бейдж качества контекста (contextQualityScore, ≥90 зелёный):
     ВНИМАНИЕ — до беседы 2.4 (context-quality.ts) роут отдаёт null.
     Компонент обязан корректно рисовать состояние «нет оценки»
     (бейдж скрыт либо нейтрально-серый), а не считать null нулём.
     Цветовую шкалу вводит 2.4; здесь — только место под неё.

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

   Карточка «Структура документа устарела»:
   - В EditModal, над списком разделов
   - Сравнение syntheses.structureSections с sectionOrder
     (в исходнике — DOC_STATE.structureSections против DOC_STATE.sectionOrder)
   - Если null (старый файл) → «актуальность не определена, рекомендуется обновить»
   - Снимок структуры заполняет беседа 1.6 (при создании синтеза) и
     обновляет 2.2 (после исполнения плана). До аудита 2026-07-30
     колонка не заполнялась НИКЕМ, и карточка всегда попадала бы в
     ветку null — если 1.6 снимок не сделала, оставить только эту ветку
     и завести TODO, не изобретая клиентский суррогат снимка.
   - Кнопка «Обновить» → regenStructureFromEditModal()
   - При перегенерации графа: чекбокс extGraphMetrics (DOC_STATE.params.extGraphMetrics)

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
- «Протестируй поток: открыть EditModal → отметить graph для перегенерации → CascadePanel должен показать downstream (ФАКТ по конфигам: glossary, theses, dialogue) → нажать "отметить ↑" для theses → кнопка ▶ активируется»
- «Протестируй исполнение: «▶ Составить план» (draft, шаги ●) → «▶ Исполнить» → EditPlanPanel показывает прогресс шагов → по завершении все шаги ✓» — ФАКТ 2.3: двухшаговый workflow 01 §4.5 вместо цепочки confirm() исходника (одобрено)
- «Протестируй подразделовую перегенерацию: открыть SubsectionRegenPanel для "graph" → выбрать "Таблица категорий" → показать зависимые подразделы»
- «Проверь responsive: модальное окно на мобильных (< 768px)»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 2.3 (блок-указатель; заведён 12.5, Д-28).** Итоги —
`docs/08-history.md`, «Беседа 2.3 — Edit Modal + Cascade Panel (клиент)
[ЗАКРЫТА]». Текст запроса опровергнут в двух местах: превью-транспорт
(`POST /syntheses/:id/plans/impact`, `POST …/subsection-impact`,
`PATCH /syntheses/:id` += extGraphMetrics) — одобренное отступление «сервер в
клиентской беседе» (как viewOnly в 1.6), выбран вместо черновик-плана на
каждый клик; цепочка `confirm()` исходника заменена «Составить план» →
просмотр → «Исполнить». Реализация шла после сжатия контекста — сверена по
стенограмме.

---

### Беседа 2.4: Лог контекста и генерации

**Контекст:**
- `02-data-model.md` (таблицы generation_log, context_log)
- `04-code-reuse-map.md` (секция 2.7 — mode-service; formatCtxLog/colorizeLog — таблица §3)
- `03-specification.md` (секции 2.3 Sections, 2.12 Context Log)
- Из предыдущих бесед: `server/db/schema.ts`, `shared/types/generation.ts`, `client/api/client.ts`, `client/components/document/DocumentFooter.tsx` (из 1.6b — в него добавляется кнопка лога), `server/routes/sections.ts` (1.6)
- Исходник: formatCtxLog + colorizeLog (вся система логов)

> **Порядок (аудит 2026-07-30):** беседу 2.4 стоит вести ПЕРЕД 2.3.
> `context-quality.ts` создаётся здесь, а бейдж качества контекста
> нужен уже в `EditSectionCard` (2.3) — см. §11. Если порядок
> сохраняется прежним, 2.3 рисует состояние «нет оценки» по `null`.

**Извлечение:**
```bash
# Извлечь formatCtxLog + colorizeLog (вся система логов)
grep -n 'function formatCtxLog' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Портирую систему логирования контекста и генерации.

Прикреплён фрагмент исходника (formatCtxLog + colorizeLog (вся система логов)): formatCtxLog, colorizeLog,
refreshCtxLogIfOpen, viewCtxLog, downloadPrompts.

Создай:
1. server/services/log-formatter.ts:
   - formatCtxLog(synthesisId): 
     Серверный аналог formatCtxLog(). Загружает genLog и ctxLog из БД,
     форматирует в plain text с той же структурой:
     заголовок → общие элементы → для каждого genLog entry: ВХОД/ВЫХОД/СЕКЦИИ.
     Адаптация: genCommon загружается из отдельного поля или вычисляется.
   - formatCtxLogHTML(synthesisId):
     Возвращает { text: string, html: string } — plain + colorized
     (адаптация: `formatCtxLogHTML` исходника [24090] возвращал только
     html; text добавлен формой 03 §2.12)

2. server/services/context-quality.ts (04 §2.1, 01-arch §4.15 п.3; модуль не создавался ни одной беседой — дыра, найденная в 1.3):
   - getSectionContextQuality(synthesisId, sectionKey) — по ПОСЛЕДНЕЙ записи context_log раздела: score = round(reqFound/reqTotal × 70 + min(1, totalUsed/budget) × 30) (края — порт [5571]: reqTotal=0 → reqScore=1; budget=0 → usage=0) и issues («Отсутствовали обязательные: …», «N контекст(ов) пропущено из-за бюджета», «N контекст(ов) обрезано», «N подстановок(ки)»);
   - score отдаётся в GET /syntheses/:id/sections → цветной бейдж качества на карточке раздела в Edit Modal (EditSectionCard.tsx, беседа 2.3: ≥90 зелёный). Беседа 2.3 зависит от этого модуля — см. §11.

3. server/routes/logs.ts:
   - GET /syntheses/:id/logs/generation → массив GenerationLogEntry из БД
   - GET /syntheses/:id/logs/context → массив ContextLogEntry из БД
   - GET /syntheses/:id/logs/formatted → { text, html }
   - GET /syntheses/:id/logs/prompts → текстовый дамп всех промптов
     (аналог downloadPrompts/formatPromptsForExport, formatPromptsForExport())
     v10: `formatPromptsForExport` использует `reconstructSkeleton()` как fallback
     для записей без `_promptSkeleton` (импортированные файлы).
     ВНИМАНИЕ (аудит 2026-07-30): `server/services/prompt-reconstruction.ts`
     с `reconstructSkeleton()` создаётся беседой 4.2 — на полторы фазы
     позже. Здесь fallback НЕ реализуется: записи без `_promptSkeleton`
     помечаются «промпт недоступен (импортированная запись)», ставится
     TODO(4.2), а подключение реконструкции делает сама 4.2.
     Регулярки СРЕЗА параметров v10 [24410/24443] несут маркеры
     `КОНТЕКСТ ДРУГИХ` и `Перегенерируй ТОЛЬКО`; маркер
     `КОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ` — в регулярках СВЁРТКИ скелета
     [8546], портированных generation-service ещё беседой 1.4
     (уточнение 24/тесты: прежняя формулировка смешивала оба места).

4. client/components/logs/colorize-log.ts:
   - colorizeLog(plainText): клиентская раскраска.
     Порт colorizeLog(). Паттерны: ═══ заголовки, ✓/✗/◦/◌ записи контекста,
     ВХОД/ВЫХОД метки, стоимость, процент бюджета.
     Цветовая палитра: gold, blue, green, red, dim, violet — как в исходнике.

5. client/components/logs/ContextLogViewer.tsx:
   - Модальное окно: кнопка открытия в DocumentFooter
   - Загрузка GET /logs/formatted
   - Рендер HTML (dangerouslySetInnerHTML для colorized)
   - Кнопка "Копировать" (plain text)
   - Кнопка "Скачать промпты"
   - Информация: количество разделов, строк
   - Live-обновление при открытом окне во время генерации:
     перезапрос GET /logs/formatted по УЖЕ СУЩЕСТВУЮЩИМ событиям
     завершения раздела (см. §3.2). Отдельных WS-сообщений про лог
     в shared/types/ws-messages.ts нет и заводить их не нужно —
     иначе клиент разойдётся с сервером (аудит 2026-07-30)

6. Интеграция: добавить кнопку "◈ Лог" в DocumentFooter.tsx (из 1.6b)
```

**Последующие запросы:**
- «Протестируй: сгенерируй синтез с 3 разделами, открой лог — проверь что все 3 раздела есть, формат совпадает с исходником»
- «Проверь colorizeLog: строки с ✓ должны быть зелёные, ✗ — красные, ◦ — золотые, бюджеты — dim»
- «Протестируй live-обновление: открой лог, запусти перегенерацию раздела — лог должен обновляться в реальном времени»
- «Проверь форматирование: version-marker, deletion-marker — корректно отображаются»

> **Итоги тестов (2026-08-17, tests/test-24-requests2-5.mjs, 51 ✓ ×2):**
> 1) заголовки блоков лога — реестровые `section_label` из genLog
> (у перегенерации суффикс « [перегенерация]»), НЕ `KEY_LABELS`;
> `KEY_LABELS` — только в `actions` version-marker'а; 2) live-обновление
> потребовало ПОСТОЯННОЙ viewOnly-подписки в `SynthesisPage`
> (standalone `POST /regenerate/:key` не меняет `status` синтеза —
> условная подписка не открывала WS; аналог `refreshCtxLogIfOpen`
> [23306]); 3) standalone-перегенерация завершается `section_done` без
> `generation_complete`; 4) `WsPlanStepDone` несёт
> `{ planId, stepIndex, result }` без объекта шага — ожидания строить
> на `plan_updated` + контроле по БД; 5) порядок блоков хронологический:
> ВЕРСИЯ → УДАЛЁН → перегенерированный раздел (delete-шаги плана
> исполняются раньше regen — порядок v10, edit-planner 2.1);
> 6) интеграционная правка 2.2: `bumpVersionsForPlan` пишет
> `metadata.version` (иначе «ВЕРСИЯ vN» печатается без номера).

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 2.4 (блок-указатель; заведён 12.5, Д-28).** Итоги —
`docs/08-history.md`, «Беседа 2.4 — Лог контекста и генерации [ЗАКРЫТА]»
(в тексте беседы выше — только «Итоги тестов»). Отступления:
`reconstructSkeleton` НЕ реализован — записи без `metadata.promptSkeleton`
помечаются «промпт недоступен (импортированная запись)» (TODO → 4.2);
`rawBaseBudget` восстановлен из `context_budget[depth]` × 1.5 для критики
(fail-open); источники `subsection_regen` / `cascade` / `mode_cascade` —
адаптация к схеме.

---

## 5. Протокол Фазы 3: Мета-синтез и наследование

### Беседа 3.1: Meta-Synthesis Service + Lineage Service (бэкенд)

**Контекст для загрузки:**
- `01-architecture.md` (секция 4.6 Graph Service — граф наследования)
- `02-data-model.md` (таблица synthesis_lineage + рекурсивный CTE)
- `03-specification.md` (секции 1.6 Мета-синтез, 2.3–2.4 Elements, 2.8 Lineage)
- Из предыдущих бесед: `server/services/context-extractor.ts` (из 1.3), `server/services/generation-service.ts` (из 1.4/2.2), `server/db/schema.ts`, `shared/types/lineage.ts`
- Исходник: importConceptAsParticipant, checkGenealogyOverlaps, collectPhilosopherAncestors, reconstructGenealogy
  `importConceptAsParticipant` на клиенте вызывается из `parseConceptFile()` пула.

  В generation-service (Беседа 1.4) при записи genCommon:
  - `genCommon.conceptBlockSizes` — массив { name, chars } для каждой
    концепции-участника. Используется reconstructBaseCtxSkeleton (Беседа 4.2)
    для восстановления маркеров вместо содержимого при экспорте промптов.

**Извлечение:**
```bash
# Извлечь importConceptAsParticipant … reconstructGenealogy
grep -n 'function importConceptAsParticipant' philosynth.html | head -1  # найти начало, затем извлечь блок
# Извлечь checkGenealogyOverlaps() и вспомогательные функции генеалогии
grep -n 'function checkGenealogyOverlaps' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Реализую мета-синтез и навигацию по графу наследования.

Прикреплены: архитектура (граф наследования), модель данных (synthesis_lineage + CTE),
спецификация (Мета-синтез, Lineage API), context-extractor.ts, generation-service.ts,
schema.ts, и фрагмент исходника (importConceptAsParticipant,
checkGenealogyOverlaps, collectPhilosopherAncestors, reconstructGenealogy).

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
     dialogueSynthesis (dialogue:synthesis — аналитический комментарий),
     goals, portraits, tensions (из sections WHERE key='sum' → парсинг).
     (Ревизия 3.1: исходник извлекает 10 полей — в списке выше
     отсутствовали portraits и dialogueSynthesis, оба входят в
     PARENT_FIELD_ORDER и уровневые PARENT_DEPS; порт — по исходнику.)
     Аналог importConceptAsParticipant (importConceptAsParticipant()), но из БД.
     v10: на клиенте данные берутся из пула (`refreshPoolParticipant()`);
     сервис загружает из БД аналогично.

   - validateConceptForMetaSynthesis(synthesisId):
     Проверяет обязательные разделы: sum, glossary, theses, critique, 
     (graph ИЛИ dialogue), capsule.
     Возвращает { valid: boolean, missing: string[], warnings: string[] }

   - checkGenealogyOverlaps(participants):
     Порт checkGenealogyOverlaps(). Находит пересечения философов-предков между 
     концепциями-участниками.
     Возвращает массив предупреждений.

   - isAncestor(synthesisIdA, synthesisIdB):
     Рекурсивная проверка через lineage CTE (серверная).

   - collectPhilosopherAncestors(synthesisId):
     Рекурсивный CTE из synthesis_lineage. Возвращает Set<string> философов.

   - conceptContextBlockFull(p): legacy-монолит для документов со
     схемой 'monolithic' до миграции (карта 04 §1.10; ревизия 3.1 —
     в запросе отсутствовал; КВИРК исходника: без portraits/graphEdges).
   - conceptContextBlockSelective(p, sectionKey, explicitSpec?):
     Формирует блок контекста концепций пер-секционно: состав полей — по
     resolveParentDeps/resolveParentDepsForSubsection (parent-context.ts,
     01 §4.13); intra-spec может только сужать section-spec.
     Плюс: applyBudgetPressure по keepFullBudget; миграция схемы
     monolithic → selective-v1 при первой перегенерации (маркер в genLog);
     buildParentSpecForLog → parent_spec в context_log.

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
     провайдер baseCtxParents (conceptContextBlockFull для legacy
     'monolithic', иначе conceptContextBlockSelective; функции
     «buildConceptContextBlock» в исходнике нет — ревизия 3.1),
     записать synthesis_lineage.

5. Расширение server/routes/syntheses.ts:
   - POST /syntheses: принимать participants: ParticipantInput[],
     валидировать через validateConceptForMetaSynthesis,
     передавать в generateSynthesis.

6. Долги журнала, адресованные этой беседе (аудит 2026-07-31 — в
   протоколе они не значились, хотя в истории (08 Часть II) адресованы 3.1):
   - registerParentContextProvider: заменить стаб, зарегистрированный
     беседой 1.4, настоящим провайдером родительского контекста
     (TODO(3.1) главы 1.4). Пока стоит заглушка, parent-context
     отдаёт пустоту, и мета-синтез собирает промпт без родителей.
   - Наполнение parentFieldsUsed, conceptBlockSizes и
     parentSpecBySection реальными значениями (TODO(3.1) главы 1.4;
     parentFieldsUsed до сих пор упоминался только в беседе 1.3).
   - Серверная поддержка участников-концепций: приём type="synthesis"
     в participants. Это снимает гейт мета-синтеза, поставленный
     беседой 1.5b в SynthesisForm — клиентская половина снятия
     вписана в беседу 3.2, серверная делается здесь. Без этой пары
     форма продолжит блокировать сабмит с ☑-концепциями.
   - Данные для estimate-diff в FullBudgetPreview (TODO(3.1) главы
     1.5b): оценка с учётом участников-концепций; отрисовка разницы —
     беседа 3.2.
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

**По факту 3.1 (блок-указатель; заведён 12.5, Д-28).** Итоги —
`docs/08-history.md`, «Беседа 3.1 — Meta-Synthesis + Lineage (бэкенд)
[ЗАКРЫТА]». Адаптации против исходника: `collectPhilosopherAncestors` —
рекурсивный CTE вместо обхода объекта genealogy; `validateConceptForMetaSynthesis`
отдаёт warnings вместо `confirm`; `conceptContextBlockFull` хранит КВИРК
исходника (без portraits и graphEdges); доступ сервис не проверяет — слой
роутов. `POST /syntheses/import` живёт в `routes/import.ts` (4.3), не в
`routes/syntheses.ts` — уточнение 8.5.

---

### Беседа 3.2: Concept Participants + Genealogy Tree (клиент)

**Контекст:**
- `03-specification.md` (секции 1.6 Мета-синтез, 2.2 Syntheses, 2.8 Lineage)
- `05-file-structure.md` (synthesis/, lineage/)
- Из предыдущих бесед: `shared/types/lineage.ts`, `client/api/client.ts`, `client/stores/synthesis-store.ts` (из 1.6b), `client/components/synthesis/SynthesisForm.tsx` (из 1.5)
- **Из 1.5b (ЗАКРЫТА):** `client/components/pool/ConceptPool.tsx`, `PoolCard.tsx`, `client/stores/pool-store.ts`, `client/utils/concept-file.ts` — пул уже существует
- Из 1.6b: `SynthesisPage.tsx`, `CatalogPage.tsx`, `SynthesisCard.tsx` — точки интеграции пунктов 4–5
- Из 3.1: `server/routes/lineage.ts` (ancestors / descendants / search) — транспорт готов
- Исходник: renderGenealogyTree() (renderGenealogyTree — **визуальный** референс)

**Извлечение:**
```bash
# Извлечь renderGenealogyTree()
grep -n 'function renderGenealogyTree' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Создаю UI для мета-синтеза и генеалогического дерева.

Прикреплён фрагмент исходника: renderGenealogyTree (CSS org-chart).
Визуальный референс — не копировать HTML, создать React.

> **v10**: `ConceptParticipants.tsx` как отдельный компонент заменён **Unified Concept Pool**.
> Пул (`client/components/pool/ConceptPool.tsx`) объединяет загрузку, просмотр (◉) и выбор
> для мета-синтеза (☑). API пула: `addToPool`, `renamePoolConcept`, `removeFromPool`,
> `toggleSynthParticipant`, `selectForViewing`.
> Перед генерацией вызывается `refreshAllSynthParticipants()`.
>
> **По факту 1.5b (беседа ЗАКРЫТА):** пул уже реализован — `ConceptPool.tsx`,
> `PoolCard.tsx`, `pool-store.ts`, `concept-file.ts` лежат в репозитории.
> `snapshotCurrentState` намеренно НЕ портирован: локальных правок концепции
> в сервисе нет, снимок вырождается (см. шапку `pool-store.ts` и главу 1.5b
> в 08 Часть II). Требовать его здесь нельзя — это противоречие внутри 07,
> снятое аудитом 2026-07-30.

Создай:
1. ДОПОЛНЕНИЕ существующего пула (создан беседой 1.5b — заново НЕ создавать):
   уже есть: загрузка из файла и по URL, карточка с ☑/◉/✎/✕, проверка
   пригодности (toggleSynthParticipant), просмотр (selectForViewing),
   refreshAllSynthParticipants перед генерацией, блокировка сабмита
   с ☑-концепциями до появления серверной поддержки мета-синтеза.
   Добавить здесь:
   - Предупреждения о генеалогических пересечениях (пересечение предков
     выбранных ☑-концепций — по GET /syntheses/:id/lineage/ancestors)
     > **По факту 3.2:** формула «по GET ancestors» верна только для
     > концепций ИЗ КАТАЛОГА; файловые записи пула в БД отсутствуют —
     > их предки берутся из participant.genealogy
     > (reconstructGenealogy + restoreCapsulesFromHTML). Тексты —
     > checkGenealogyOverlaps 1:1 (дрейф-контроль клиент↔сервер —
     > integration-check 4w). В исходнике функция ОПРЕДЕЛЕНА, но не
     > ВЫЗВАНА (мёртвый код) — реализован предполётный confirm;
     > серверные warnings POST рисуются неблокирующе (синтез создан).
   - Снятие блокировки сабмита, если 3.1 уже принимает участников-концепции
     > **По факту 3.2:** снято только для КАТАЛОЖНЫХ концепций
     > (представимы в ParticipantInput {type:'synthesis', synthesisId});
     > пул дополнен пикером «+ Из каталога» (свои ready + публичные,
     > дедупликация; фабрика catalogPreviewToPoolEntry, ключ
     > дедупликации filename="catalog:<id>"). ФАЙЛОВЫЕ концепции
     > блокируются до серверного импорта (4.3) с точечным текстом
     > ошибки. Бейдж п.5 питается аддитивным SynthesisPreview.
     > hasConceptParents (loadConceptParentFlags — оба списка каталога
     > и /lineage/search).
   - Порт `reconstructGenealogy` (отложен в 1.5b с пометкой TODO(3.1/3.2)) —
     без него дерево для импортированной концепции не строится;
   - Порт `restoreCapsulesFromHTML`: журнал 1.5b адресует его ЭТОЙ
     беседе (TODO(3.2)). Второй предпатч ошибочно отложил его до 4.3 —
     исправлено аудитом 2026-07-31. За беседой 4.3 остаётся серверный
     импорт файлов, а не восстановление капсул в клиентском пуле.

2. client/components/lineage/GenealogyTree.tsx:
   - CSS org-chart (как в исходнике: .gen-tree, .gen-card, .gen-phil)
   - Рекурсивный рендер LineageNode:
     - Философ → простой блок с именем
     - Концепция → карточка (имя, метод×уровень, зерно в <details> для родителей / усечённое для корня (v10), капсула в <details>)
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
   - Фильтр "Потомки концепции X" — через GET /syntheses/:id/lineage/descendants
     (в 03 §2.2 у GET /syntheses такого параметра нет и добавлять его
      не нужно: список потомков приходит отдельным запросом, каталог
      лишь отображает пересечение — аудит 2026-07-30)
   - В карточке синтеза: badge "мета-синтез" если есть parent_synthesis_id

6. client/api/lineage.ts:
   - getAncestors(id, depth), getDescendants(id, depth), searchByPhilosophers(names)

7. Долги SynthesisForm, оставшиеся без адресата (аудит 2026-07-31):
   - updateCompatAdvisor / toggleCompatPanel / applyReplacement —
     кнопки применения замен в CompatAdvisor. Заведены беседой 1.1,
     адресованы 1.5, в 1.5 не сделаны и переадресованы в «TODO(2.x)»
     БЕЗ номера беседы; в протоколе не упоминались ни разу. Отданы
     сюда как единственной непроведённой беседе, которая правит
     SynthesisForm.tsx. Сервер (POST /syntheses/advice) готов с 1.5 —
     нужна только клиентская часть: панель, кнопка применения и
     пересчёт выбранных разделов.
   - estimate-diff в FullBudgetPreview (TODO(3.1) главы 1.5b):
     отрисовка разницы оценки с участниками-концепциями и без.
     Данные приходят из беседы 3.1.
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
- Исходник: MODE_CONFIG … regenerateModeSilent (вся система режимов)

**Извлечение:**
```bash
# Извлечь MODE_CONFIG … regenerateModeSilent (вся система режимов)
grep -n 'MODE_CONFIG' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Реализую систему режимов (оппонент, переводчик, временной срез).

Прикреплён фрагмент исходника (MODE_CONFIG … regenerateModeSilent (вся система режимов)): MODE_CONFIG, buildModeContext,
runMode, regenerateModeSilent, openModeModal, buildModeTabsBar, switchModeTab.

Создай:
1. server/services/mode-service.ts:
   - getModeConfig(modeKey):
     Возвращает конфиг режима. Промпты из Prompt Registry 
     (ключи: "mode.adversarial.prompt", "mode.translator.prompt", 
     "mode.timeslice.prompt"). Статические поля (title, desc, 
     paramLabel, paramPlaceholder, suggestions) — из конфига или хардкод.
   
   - buildModeContext(modeKey, synthesisId):
     Порт buildModeContext(). Собирает контекст из разделов синтеза:
     capsule + graphNodes + theses + glossary + dialogue + critique
     (через context-extractor).
   
   - checkModeDeps(modeKey, synthesisId):
     Проверяет наличие необходимых разделов для режима.
     Возвращает предупреждения.
   
   - runMode(synthesisId, modeKey, paramValue, apiKey):
     Порт runMode(). Собирает промпт (config.buildPrompt + context),
     стримит через streaming-manager, сохраняет в mode_results,
     записывает genLog, возвращает usage.
   
   - regenerateModeSilent(synthesisId, modeKey, resultIndex):
     Порт regenerateModeSilent(). Перегенерирует один результат по его индексу.

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

**По факту 4.1 (2026-08-28):** → `docs/08-history.md`, глава «Беседа 4.1», подраздел «По факту 4.1 (2026-08-28)».

### Беседа 4.2: Export Service

**Контекст:**
- `03-specification.md` (секции 1.8 Экспорт, 2.11 Export API)
- `04-code-reuse-map.md` (секция 2.5 — экспорт)
- Из предыдущих бесед: `server/db/schema.ts`, `server/services/graph-parser.ts` (из 1.4)
- ФАКТ (4.2) — дополнительно потребовались: `server/services/mode-service.ts` (MODE_CONFIG для секции режимов и реконструкции), `server/services/log-formatter.ts` (снятие TODO(4.2) + предвычисление видимого лога), `server/services/section-defs-builder.ts` и `prompt-builder.ts` (reconstructSectionTask), `server/services/generation-service.ts` (buildParams/genCommon), клиентские `graph-utils.ts`/`Graph*.tsx` 1.7 (двойники graph-style/graph-physics — дрейф сторожит integration-check 4y) и `DocumentHeader.tsx` 1.6b (двойник шапки)
- Исходник: exportMMD … auditCSS (весь экспорт) + reconstructBaseCtxSkeleton … reconstructSkeleton (реконструкция промптов) + getDocFilename [17477] + saveMD/node2md/sec2md/table2md/inline2md/sig2md (Markdown-экспорт)

**Извлечение:**
```bash
# Извлечь exportMMD … auditCSS (весь экспорт)
grep -n 'function exportMMD' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Реализую экспорт синтезов в различные форматы.

Прикреплён фрагмент исходника (exportMMD … auditCSS (весь экспорт)): exportMMD, exportPNG, 
exportJSON, saveHTML, buildGraphExportSection, buildModesExportSection, auditCSS.

Создай:
1. server/services/export/mmd-exporter.ts:
   - exportMMD(synthesisId):
     Порт exportMMD(). Загружает categories + edges из БД,
     строит Mermaid-диаграмму: subgraph по кластерам, формы узлов 
     по процессуальным ролям, стили по типам, linkStyle по силе связей.
     Возвращает string (Mermaid-код).

2. server/services/export/json-exporter.ts:
   - exportJSON(synthesisId):
     Порт exportJSON(). Загружает nodes, edges, clusters из БД,
     форматирует в структуру { meta, nodes, edges, clusters }.

3. server/services/export/png-exporter.ts:
   - exportPNG(synthesisId):
     Порт exportPNG(). Два варианта реализации:
     a. Серверный Canvas (node-canvas): warmup layout → рисование 
        узлов/рёбер/кластеров/легенды → PNG blob
     b. Генерация SVG → конвертация в PNG через sharp
     Выбрать вариант (a) — ближе к исходнику.

3b. server/services/export/md-exporter.ts — ФАКТ (4.2), в запросе отсутствовал:
   - exportMD(synthesisId): порт saveMD() + sec2md/node2md/inline2md/
     table2md/sig2md через html-parser (linkedom изолирован).
     Требует каркаса .section-num/.section-title/.doc-content
     в html_content (реальный вывод модели его несёт по сис-промпту;
     моки без каркаса дают пустой MD — грабля тестов 2.3/4.1).

3c. server/services/export/filename.ts — ФАКТ (4.2):
   - getDocFilename [17477] из params БД; КВИРК: paramCode
     склеивается join("") без дефисов — пример «hm-t-2» в комментарии
     исходника устарел. Общее: common.ts (ExportError NOT_FOUND/NO_GRAPH
     «Нет графа.», loadExportSynthesis, exportFilename).

4. server/services/export/html-exporter.ts:
   - exportHTML(synthesisId):
     Порт saveHTML (saveHTML()). Собирает самодостаточный HTML:
     a. Загружает synthesis + sections + capsule из БД
     b. Рендерит шаблон документа (CSS + HTML шапка + разделы)
     c. Встраивает JSON-состояние (<script type="application/json" 
        id="philosynth-state">)
     d. Встраивает graph section (buildGraphExportSection, buildGraphExportSection()):
        Three.js + D3.js CDN ссылки, сериализованные функции графа,
        клонированное модальное окно
        [ФАКТ 4.2: fn.toString()/клонирование DOM на сервере неисполнимы —
        скрипты и оверлеи берутся из статических бандлов
        server/config/export-assets.ts, генерат npm run
        extract:export-assets из исходника: fnBundle 46 функций,
        constBundle 6, gm/mode-оверлеи (минус .mode-modal-params), rawCSS;
        initScript [17773-17828] дословно]
     e. Встраивает modes section (buildModesExportSection, buildModesExportSection())
     f. auditCSS — убирает неиспользуемые стили (auditCSS())
     g. Встраивает лог контекста (details + script)
        [ФАКТ 4.2: видимый лог ПРЕДВЫЧИСЛЕН formatCtxLogHTML на сервере
        (в исходнике строился скриптом в файле); после импорта и правок
        файла пересчитается только пересохранением]

5. server/utils/css-audit.ts:
   - auditCSS(cssText, contentToCheck):
     Порт auditCSS(). Парсер CSS → консервативное удаление 
     неиспользуемых классов.

5b. server/services/prompt-reconstruction.ts (или встроить в export):
   - reconstructBaseCtxSkeleton(params, genCommon):
     Базовый контекст с маркерами вместо содержимого концептов.
     Использует genCommon.conceptBlockSizes для размеров блоков.
   - reconstructCtxMarkers(sectionKey):
     Маркеры контекста из ctxLog: inter-section и intra-section.
   - reconstructSectionTask(genEntry, params):
     Скелет задания: для режимов — config.buildPrompt; для подразделов —
     preamble_short + subsection body; для стандартных — buildSectionDefs.
   - reconstructSkeleton(genEntry):
     Полный скелет: base + ctx + task + quality.
   Фрагмент исходника: reconstructBaseCtxSkeleton … reconstructSkeleton
   [ФАКТ 4.2: все четыре — async (Registry/БД); config.buildPrompt
   исходника → renderTemplate("mode.{key}.prompt"); source
   'subsection_regen' (не 'subsection'); участники мета-синтеза
   type='synthesis' — отбор через isConceptParticipant; подключены
   fallback-ом в log-formatter (долг 2.4 §12 закрыт): rc считается
   один раз на форматирование, needsReconstruction → baseCtx+skeleton]

6. server/routes/export.ts (ФАКТ 4.2: роутов ПЯТЬ — плюс md):
   - GET /syntheses/:id/export/html → Content-Type: text/html
   - GET /syntheses/:id/export/md → Content-Type: text/markdown
   - GET /syntheses/:id/export/mmd → Content-Type: text/plain
   - GET /syntheses/:id/export/png → Content-Type: image/png
   - GET /syntheses/:id/export/json → Content-Type: application/json
   requireAuth + loadSynthesisForRead; имена файлов RFC5987;
   NO_GRAPH → 400 VALIDATION_ERROR «Нет графа.» (png/mmd/json)

7. Кнопки экспорта в SynthesisPage.tsx:
   - Выпадающее меню: HTML, Mermaid, PNG, JSON
   - Скачивание через download-ссылки
```

**Последующие запросы:**
- «Протестируй exportMMD: граф с 8 узлами, 3 кластерами — Mermaid валидный? Вставь в mermaid.live и проверь»
- «Протестируй exportJSON: структура соответствует спецификации (meta, nodes, edges, clusters)?»
- «Протестируй exportHTML: скачанный файл открывается в браузере, граф работает (3D/2D), лог контекста отображается?»
- «Протестируй exportHTML: импортируй скачанный файл обратно через POST /syntheses/import — все данные восстанавливаются?» [ФАКТ 4.2: НЕИСПОЛНИМ в 4.2 — POST /syntheses/import создаёт беседа 4.3; инверсия зависимости. Покрытие не теряется: ПЕРВЫЙ тестовый запрос беседы 4.3 — тот же roundtrip]
- «Edge case: exportPNG для синтеза без графа — корректная ошибка 400»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 4.2 (2026-08-29):** → `docs/08-history.md`, глава «Беседа 4.2», подраздел «По факту 4.2 (2026-08-29)».

### Беседа 4.3: Import Service

**Контекст:**
- `03-specification.md` (секция 1.9 Импорт)
- `04-code-reuse-map.md` (секция 2.6 — импорт)
- Из предыдущих бесед: `server/db/schema.ts`, `server/services/graph-parser.ts`, `server/services/element-parser.ts`, `server/services/lineage-service.ts` (из 3.1)
- Исходник: importHTML, extractMetadata … buildDocStateFromImport

**Извлечение:**
```bash
# Извлечь importHTML … buildDocStateFromImport
grep -n 'function importHTML' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Реализую импорт HTML-файлов PhiloSynth.

Прикреплён фрагмент исходника (importHTML … buildDocStateFromImport):
importHTML, extractMetadata, extractSections, extractEmbeddedState, extractModesFromHTML,
populateFromImport, buildDocStateFromImport, validateImportMeta.

> На клиенте загрузка идёт через Unified Concept Pool (`handlePoolFileImport`, `handlePoolUrlImport`).
> `buildDocStateFromImport` устанавливает `DOC_STATE.structureSections`
> из `embeddedState.structureSections` и вызывает `refreshSumDef()`.

Создай:
1. server/services/import-service.ts:
   - importHTML(htmlString, userId, filename?):
     Порт importHTML(). Серверный DOM-парсинг через linkedom:
     a. parseFromString(htmlString)
     b. extractMetadata(doc) — extractMetadata(): философы, метод, глубина, 
        уровень, зерно, контекст, капсула из шапки
     c. extractSections(doc) — extractSections(): .doc-section → key, num, 
        title, html, secCtx
     d. extractEmbeddedState(doc) — extractEmbeddedState(): JSON из 
        <script id="philosynth-state">
     e. validateImportMeta(meta, embeddedState) — validateImportMeta(): 
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
     Порт extractModesFromHTML(). Парсинг .philosynth-mode элементов.

   - reconstructGenealogy(meta, embeddedState, doc):
     Порт reconstructGenealogy(). Восстановление дерева наследования.

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
   > v10: на клиенте ImportPage может использовать пул для предпросмотра
   > перед серверным импортом (POST /syntheses/import по-прежнему серверный).

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

> **По факту 4.3 (2026-08-30, беседа ЗАКРЫТА).** → `docs/08-history.md`, глава «Беседа 4.3», подраздел «По факту 4.3 (2026-08-30, беседа ЗАКРЫТА)».

---

## 7. Протокол Фазы 5: Inline-редактирование элементов

### Беседа 5.1: Element Editor + Versioning (бэкенд)

**Контекст для загрузки:**
- `01-architecture.md` (секция 4.7 Element Editor)
- `02-data-model.md` (таблица element_versions, **§3 «Направление записи»** — правка элемента врезает перерисованную таблицу в html_content)
- Из предыдущих бесед: `server/services/element-parser.ts` (из 1.4 — рендерер обязан быть обратным к нему), `server/utils/html-parser.ts` (из 1.4b — `spliceSubsectionHtml`)
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
     всех sections, замена на newName. ТАКЖE замена в
     theses.related_categories (правка 2026-09-02, п.4 — иначе тезисы
     ссылаются на исчезнувшее имя). Каждая затронутая строка получает
     версию с changeSource='auto_rename'. Возвращает
     { affectedSections, affectedTheses }.
     Вызывается ОТДЕЛЬНЫМ эндпоинтом POST /syntheses/:id/elements/auto-rename
     (03 §2.4), а не побочным эффектом PATCH: решает пользователь после
     просмотра impact.

   - computeElementImpact(elementType, elementId, synthesisId):
     Общий метод вычисления "зоны поражения":
     a. Определяет, к какому разделу принадлежит элемент
     b. Через SUBSECTION_TO_CTX_KEYS находит, какие подразделы 
        используют данные этого типа
     c. Через cascade-analyzer находит downstream-секции
     d. Через getAffectedModes находит затронутые режимы
     e. Определяет severity: "none" / "low" / "high"

1b. server/services/element-renderer.ts (НОВОЕ, решение 2026-09-02, п.1):
   - renderCategoriesTable / renderEdgesTable / renderTopologyTable /
     renderThesesTable / renderGlossaryTable — точное обратное к
     element-parser.ts (1.4): из гранулярных строк собирают ту же
     разметку, что генерирует Claude по шаблонам Registry.
   - applyElementUpdateToHtml(synthesisId, sectionKey, subsectionName):
     перерисовывает ОДНУ таблицу и врезает её в sections.html_content
     через spliceSubsectionHtml (1.4b). Раздел целиком не трогается —
     обоснования тезисов и прозаические подразделы лежат вне таблиц.
   - Параметры формы таблиц: synth_level (столбцы глоссария),
     ext_graph_metrics (столбцы категорий) — берутся из syntheses.
   - Поля вне таблиц (обоснование тезиса, происхождение категории):
     точечная правка абзаца либо пометка «раздел требует перегенерации»;
     молча терять правку нельзя.
   - ПРИЁМКА: round-trip parse(render(x)) === x на всех таблицах;
     пара parser↔renderer берётся под дрейф-контроль в integration-check
     (образцы — секции 4x MODE_UI↔MODE_CONFIG и 4y graph-style↔graph-utils).

2. server/services/element-versioning.ts:
   - createVersion(synthesisId, elementId, elementType, data, changeSource):
     Вставка в element_versions с автоинкрементом version.
     ВНИМАНИЕ (правка 2026-09-02, п.3): synthesis_id — обязательная
     колонка (миграция 0001), по ней же идёт проверка доступа в роутах.
   
   - getVersionHistory(elementId, elementType):
     Все версии элемента, отсортированные по version desc.
   
   - rollbackToVersion(elementId, elementType, version):
     Восстановление данных из element_versions.
     Создаёт новую версию с changeSource="rollback".

3. server/routes/elements.ts:
   - GET /syntheses/:id/categories → список с edges, clusters, topology
   - GET /syntheses/:id/categories/:catId → одна категория
   - PATCH /syntheses/:id/categories/:catId → updateCategory
   - PATCH /syntheses/:id/edges/:edgeId → updateEdge
     (добавлен в 03 §2.4 в v10, но в этом списке отсутствовал —
      аудит 2026-07-30; поля: description, edgeType, direction,
      strength, certainty, historicalSupport, logicalNecessity,
      innovationDegree, contextDependency)
   - GET /syntheses/:id/theses → список
   - PATCH /syntheses/:id/theses/:thesisId → updateThesis
   - GET /syntheses/:id/glossary → список
   - PATCH /syntheses/:id/glossary/:termId → updateGlossaryTerm
   - GET /syntheses/:id/elements/:elementType/:elementId/versions
     → getVersionHistory (контракт — 03 §2.4, дополнен 2026-09-02;
       elementType в пути: без него нельзя ни проверить доступ, ни
       выбрать таблицу для отката)
   - POST /syntheses/:id/elements/:elementType/:elementId/rollback { version }
     → rollback (создаёт версию changeSource='rollback', перерисовывает
       таблицу в html_content, возвращает impact)
   - POST /syntheses/:id/elements/auto-rename { oldName, newName }
   - PATCH /syntheses/:id/capsule { html } (01 §4.7 числит капсулу
     редактируемой; эндпоинта не было — п.14)
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

**По факту 5.1 (2026-09-03)** → `docs/08-history.md`, глава «Беседа 5.1», подраздел «По факту 5.1 (2026-09-03)».

### Беседа 5.2: Element Editor UI (клиент)

**Контекст:**
- `03-specification.md` (секция 2.4 Elements API)
- `05-file-structure.md` (edit/ElementEditor.tsx)
- Оформление нового интерфейса: `docs/fragments-for-conversations/5-6-ui-kit.md` (бриф и таблица соответствий классам исходника), `5-6-ui-kit.css` (примитивы), `5-6-ui-kit.html` (эталон разметки)
- Из предыдущих бесед: `shared/types/graph.ts`, `shared/types/elements.ts`, `client/components/graph/NodePanel.tsx` (из 1.7), `client/components/document/SectionView.tsx` (из 1.6b), `client/api/elements.ts` (из 1.7)
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
   - ГРАБЛЯ 1.6b (предупреждение 2026-09-02, п.16): SectionView рендерит
     html_content через dangerouslySetInnerHTML, и вставки, сделанные
     эффектом ПОСЛЕ рендера, стираются при hash-навигации. Кнопки ✎
     добавляются тем же приёмом, что и прочие обогащения разметки —
     обогащением СТРОКИ до вставки (enrichSectionHtml), а не DOM после.
   - Кнопка «Перегенерировать затронутые» после impact запускается
     ТОЛЬКО через планы (03 §2.6) — в контекст беседы обязательны
     client/api/plans.ts и hooks/useEditPlan.ts (из 2.3), иначе
     появится второй путь запуска перегенерации (п.15)

8. client/api/elements.ts — расширение:
   - updateCategory, updateThesis, updateGlossaryTerm
   - getVersionHistory, rollbackToVersion (elementType — в пути:
     /elements/:elementType/:elementId/versions|rollback, 03 §2.4)
   - По факту 5.1: также updateEdge, deleteEdge (DELETE /edges/:edgeId),
     autoRename, updateCapsule; ответы PATCH/rollback несут version и
     htmlSync — UI ОБЯЗАН показывать htmlSync.pending («поле не отражено
     в документе, раздел требует перегенерации») и sectionMissing (долг
     §12). Все PATCH → 409 при активной генерации — форма редактора
     блокируется по status='generating'.
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

**По факту 5.2 (2026-09-04)** → `docs/08-history.md`, глава «Беседа 5.2», подраздел «По факту 5.2 (2026-09-04)».

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

2. Промптовые шаблоны (добавить в seed-prompts.ts или через Admin UI) —
   канон 2026-09-02, 03 §2.14, шесть ключей (по факту 5.3 — файл
   server/config/enrichment-templates.ts):
   - enrichment.category.description
   - enrichment.category.evolution
   - enrichment.category.justification
   - enrichment.edge.justification
   - enrichment.edge.counterarguments
   - enrichment.characteristic_justification
   Тип обогащения в БД — enum 02 §2.26 (в него добавлен counterarguments).

2b. Биллинг обогащений (правка 2026-09-02, п.10): enrichCategory /
   enrichEdge / justifyCharacteristic пишут строку в api_usage
   (billing_mode из контекста — byo|subscription|balance) и в режиме
   подписки инкрементируют used_enrichments. Квота quota_enrichments
   заведена в 02 §2.22 и до этой правки не тратилась никем.
   Если беседа 6.1 ещё не прошла — оставить разъём
   (setUsageRecorder / no-op по умолчанию) и внести долг в §12.

3. server/routes/enrichment.ts:
   - POST /syntheses/:id/enrich/category/:catId
   - POST /syntheses/:id/enrich/edge/:edgeId
   - POST /syntheses/:id/justify-characteristic
   - GET /syntheses/:id/enrichments/:elementId
   - GET /syntheses/:id/justifications/:elementId

4. server/routes/taxonomy.ts (§2.13; дыра доков закрыта 2026-07-23 —
   модуль числился в карте 04, но ни одна беседа его не создавала;
   тонкие обёртки над element-taxonomy.ts из 0.3b):
   - GET/POST /taxonomy/category-types
   - GET/POST /taxonomy/relationship-types
   - POST /taxonomy/normalize

5. Расширение ws/handler.ts:
   - Обработка start_enrichment → enrichCategory/enrichEdge
   - Отправка enrichment_delta, enrichment_done
```

**Последующие запросы:**
- «Протестируй enrichCategory: выбери категорию из синтеза → enrichmentType="description" → стриминг через WebSocket → результат сохранён в element_enrichments»
- «Протестируй justifyCharacteristic: centrality=0.9 для категории "Бытие" → ответ содержит философские основания, ограничения, альтернативные подходы»
- «Протестируй getEnrichments: после 2 обогащений одной категории → массив из 2 записей с разными типами»
- «Протестируй стоимость: enrichment записывает input_tokens, output_tokens, cost_usd»
- «Edge case: enrichCategory для несуществующей категории → 404.
  justifyCharacteristic с value вне ДОПУСТИМОГО ДЛЯ ЭТОЙ ХАРАКТЕРИСТИКИ
  диапазона → 400. Диапазон зависит от поля (правка 2026-09-02, п.18):
  [0,1] у centrality/certainty/clarity/breadth/depth/applicability/
  historical_significance/strength/historical_support/logical_necessity/
  context_dependency, целое [1,5] у innovation_degree»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 5.3 (2026-09-04) — отступления от буквы первого запроса:** → `docs/08-history.md`, глава «Беседа 5.3», подраздел «По факту 5.3 (2026-09-04) — отступления от буквы первого запроса».

### Беседа 5.4: Характеристики + Обогащение + Таксономия UI (клиент)

**Контекст для загрузки:**
- `03-specification.md` (секции 2.13 Taxonomy, 2.14 Enrichment)
- Оформление нового интерфейса: `docs/fragments-for-conversations/5-6-ui-kit.md` (бриф и таблица соответствий классам исходника), `5-6-ui-kit.css` (примитивы), `5-6-ui-kit.html` (эталон разметки)
- Из предыдущих бесед: `server/services/element-enrichment.ts` (из 5.3), `server/routes/enrichment.ts` и `server/routes/taxonomy.ts` (контракты §2.14/§2.13, «По факту 5.3»: POST → { ok:true }, результат — WS `enrichment_done` c enrichmentId/content), `packages/shared/constants/characteristics.ts` (диапазоны/подписи для CharacteristicSlider), `packages/shared/types/elements.ts` (входы обогащений, ElementEnrichment, CharacteristicJustification), `server/services/element-taxonomy.ts` (из 0.3b), `client/components/edit/ElementEditor.tsx` (из 5.2), `client/components/graph/NodePanel.tsx` (из 1.7)
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
   - Поддержка: centrality, certainty, historical_significance,
     clarity, breadth, depth, applicability (0–1),
     innovation_degree (1–5, целое) — v10: +4 поля категорий

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
     centrality, certainty, historical_significance, innovation_degree,
     clarity, breadth, depth, applicability (v10: +4 поля)
   - Добавить кнопку «Обогатить» → EnrichmentPanel
   - Заменить текстовый тип на TaxonomySelector

5. Интеграция с ElementEditor.tsx для связей:
   - CharacteristicSlider: strength, certainty, historical_support, logical_necessity,
     innovation_degree, context_dependency (v10: +2 поля связей)
   - TaxonomySelector для типа связи

6. client/api/taxonomy.ts:
   - getCategoryTypes, getRelationshipTypes, normalizeType, createCustomType

7. client/api/enrichment.ts:
   - enrichCategory, enrichEdge, justifyCharacteristic,
     getEnrichments, getJustifications
```

**Последующие запросы:**
- «Протестируй CharacteristicSlider: изменить centrality через слайдер → PATCH API вызван → значение обновлено. Нажать «?» → justification отображается в блоке под слайдером (по факту 5.4: не popover — правило UI-кита)»
- «Протестируй EnrichmentPanel: кнопка "Обогатить" → тип "описание" → стриминг → результат в карточке. Повторный запрос → история содержит 2 записи»
- «Протестируй TaxonomySelector: ввести "диалектическая" → автокомплит показывает "Диалектическая (dialectical)". Ввести "новый_тип" → normalize возвращает null → кнопка "Создать" появляется»
- «Протестируй интеграцию с NodePanel: открыть граф → кликнуть узел → панель содержит 8 слайдеров (v10: все характеристики категории; «4» — старый счёт) + кнопку "Обогатить" + TaxonomySelector для типа»
- «Edge case: innovation_degree — дискретный слайдер (1–5), не непрерывный. CharacteristicSlider для readOnly синтеза — disabled (по факту 5.4: readOnly = владелец при status='generating'; чужой не видит блока вовсе)»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

Файлы 5.4 для следующих бесед (факт): `client/src/hooks/useEnrichmentStream.ts`
(образец «HTTP создаёт операцию, свой WS-канал доставки» — для TransformPanel
5.5), `client/src/components/edit/EdgeEditor.tsx` + `CharacteristicSlider.tsx`
(готовые слайдеры/селектор для полей трансформированных элементов 5.5),
`client/src/components/edit/TaxonomySelector.tsx` (административные
update/delete типов — 6.2), `client/src/api/taxonomy.ts` / `api/enrichment.ts`.

**По факту 5.4 (2026-09-05) — отступления от буквы первого запроса:** → `docs/08-history.md`, глава «Беседа 5.4», подраздел «По факту 5.4 (2026-09-05) — отступления от буквы первого запроса».

### Беседа 5.5: Representation Transformer — graph↔theses (бэкенд + клиент)

**Контекст для загрузки:**
- `01-architecture.md` (секция 4.11 Representation Transformer)
- `02-data-model.md` (таблица representation_transforms)
- `03-specification.md` (секция 2.15 Transforms API, требования RT1–RT5)
- Из предыдущих бесед: `server/services/graph-parser.ts` (из 1.4), `server/services/element-parser.ts` (из 1.4), `server/services/element-taxonomy.ts` (из 0.3b), `server/services/streaming-manager.ts` (из 1.4), `server/services/prompt-registry.ts` (из 0.3), `server/db/schema.ts`
- Клиентские: `client/components/graph/GraphModal.tsx` (из 1.7), `client/components/document/SectionView.tsx` (из 1.6b)
- Оформление нового интерфейса: `docs/fragments-for-conversations/5-6-ui-kit.md` (бриф и таблица соответствий классам исходника), `5-6-ui-kit.css` (примитивы), `5-6-ui-kit.html` (эталон разметки)
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
     c. Делает снимок текущих тезисов → target_snapshot (цель до замены —
        из него откат; 02 §2.28)
     d. Делает снимок текущего графа → source_snapshot (источник, аудит)
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
     c. Снимок текущего графа → target_snapshot, тезисов → source_snapshot
     d. Стримит → парсит HTML → parseGraphFromHTML → saveGraphToDb
     e. Нормализация типов через element-taxonomy
     f. Сохраняет в representation_transforms
     g. Возвращает { summary, usage }

   - getTransformHistory(synthesisId):
     SELECT из representation_transforms ORDER BY created_at DESC

   - rollbackTransform(transformId):
     a. Загружает target_snapshot (представление-цель до замены; 02 §2.28)
     b. Определяет direction: если graph_to_theses → восстанавливает тезисы
        из target_snapshot; если theses_to_graph → восстанавливает граф
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
     (сообщение внесено в 03 §3.1 правкой 2026-09-02, п.5; операцию
     СОЗДАЁТ HTTP-роут, WS только подписывает — как в фазах 1–4)
   - Отправка stream_delta с sectionKey = "transform:{direction}"
     (образец — "mode:{modeKey}" беседы 4.1), затем transform_done
   - После замены тезисов/графа в БД перерисовать соответствующий раздел
     в sections.html_content через element-renderer (02 §3, решение п.1):
     иначе документ покажет прежний текст
     (ФАКТ 5.5: html раздела-хозяина замещается ЦЕЛИКОМ сгенерированной
     секцией — ответ и есть полный раздел, — а затем таблицы
     перерисовываются рендерером из строк БД; см. «По факту 5.5» п.2)

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

Файлы 5.5 для следующих бесед (факт): `server/services/representation-transformer.ts`
(образец операции «свой снимок + замена раздела целиком»), `server/config/
transform-templates.ts` (шаблоны, которые правит админка 6.2 — плейсхолдеры
под дрейф-контролем 4af), `client/src/hooks/useTransformStream.ts` +
`client/src/components/edit/TransformPanel.tsx` (образец панели операции с
подтверждением и историей — для BillingPage/AdminPromptsPage 6.2).

**По факту 5.5 (2026-09-06) — отступления от буквы первого запроса:** → `docs/08-history.md`, глава «Беседа 5.5», подраздел «По факту 5.5 (2026-09-06) — отступления от буквы первого запроса».

**Последующие запросы:**
- «Протестируй graph→theses: синтез с 10 категориями и 5 тезисами → трансформация → новые тезисы (количество может отличаться) → старые тезисы в target_snapshot, граф в source_snapshot → representation_transforms содержит запись»
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
     a. Шифрование AES-256-GCM (ключ из env API_KEY_ENCRYPTION_SECRET —
        имя закреплено env.ts 0.1; текст ранее писал ENCRYPTION_KEY)
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
   > **Ретрофит (аудит 2026-07-30):** middleware оборачивает роуты
   > генерации, СОЗДАННЫЕ РАНЬШЕ — POST /syntheses (1.4), POST
   > /syntheses/:id/plans/:planId/execute (2.2), POST
   > /syntheses/:id/regenerate-subsection (2.2), WS-запуск генерации
   > (ws/handler, 1.4/1.6). То есть беседа правит код закрытых бесед.
   > Уточнение 2026-09-02 (п.20): «единственный такой случай» — уже не
   > так. Чужой код правят также 5.4 (NodePanel из 1.7), 5.5 (GraphModal
   > 1.7, SectionView 1.6b, EditModal 2.3) и 6.2 (SynthesisForm 1.5b/3.2
   > и PauseModal 1.4b — оба по долгам §12). Правило то же: перед
   > правкой свериться с фактическим состоянием файла, а не с текстом
   > закрытой беседы. Перед началом свериться
   > с фактическим списком роутов в server/index.ts, а не со списком ниже.
   - Middleware для routes генерации:
     a. Определяет режим биллинга (приоритет):
        1. BYO-Key (active api_key) → mode: "byo", apiKey из расшифровки
        2. Активная подписка с остатком квоты → mode: "subscription"
        3. Баланс > estimatedCost → mode: "balance"
        4. Иначе → 403 BILLING_REQUIRED
     b. Для mode "subscription": проверяет нужную квоту
        (syntheses для POST /syntheses, regenerations для regenerate, и т.д.)
     c. Для mode "balance": проверяет достаточность баланса
     d. Прокидывает { billingMode, apiKey?, subscriptionId? } в context

4. server/services/subscription-service.ts:
   - getPlans(): список активных тарифов из subscription_plans
   - getActiveSubscription(userId): текущая подписка + план + использование
   - createSubscription(userId, planId):
     a. Stripe Subscriptions API → subscription + clientSecret
     b. Создаёт запись в user_subscriptions
   - cancelSubscription(userId): cancel_at_period_end = true
   - resumeSubscription(userId): cancel_at_period_end = false
   - incrementUsage(subscriptionId, quotaType):
     Атомарный инкремент used_syntheses / used_regenerations / …
   - checkQuota(subscriptionId, quotaType): остаток > 0?
   - resetUsageCounters(subscriptionId):
     Вызывается из webhook при invoice.paid (новый период)
   - handleStripeWebhook(event):
     Диспетчер: invoice.paid → resetUsageCounters,
     customer.subscription.updated → обновить status/period,
     customer.subscription.deleted → status = "canceled"

5. Расширение server/services/streaming-manager.ts:
   - В streamSection: после получения usage от Claude —
     billingMode === "balance" → chargeUsage (списание с баланса);
     billingMode === "subscription" → incrementUsage (квота);
     billingMode === "byo" → списания нет
     (правка 2026-09-02, п.7: режимов ТРИ — byo|subscription|balance;
      прежний литерал "service" не существовал ни в одном списке)
   - Записать в api_usage независимо от режима; для byo cost_usd несёт
     СЕБЕСТОИМОСТЬ (в итогах не суммировать с balance)

6. server/routes/prompts.ts (03 §2.9 Prompts + §2.11 Configs):
   Модуль числится в 05 («Admin: CRUD prompt_templates, synthesis_configs»),
   но до аудита 2026-07-30 не создавался НИ ОДНОЙ беседой — без него
   AdminPromptsPage из 6.2 не с чем разговаривать.
   - GET   /prompts                 → список шаблонов (key, version, isActive)
   - GET   /prompts/:key/versions   → история версий шаблона
   - POST  /prompts/:key            { body } → новая версия-черновик
   - POST  /prompts/:key/activate   { version } → активация версии
   - GET   /configs                 → synthesis_configs
   - PUT   /configs/:key            { value } → НОВАЯ версия-черновик
   - GET   /configs/:key/versions   → история версий конфига
   - POST  /configs/:key/activate   { version } → активация
     (правка 2026-09-02, п.9: 02 §2.18 обещает версионирование конфигов
      «аналогично шаблонам», 6.2 его требует — эндпоинтов не было)
   Все — только для role === 'admin' (middleware из 0.2).
   Сброс кэша prompt-registry (0.3) после активации — обязателен,
   иначе генерация продолжит брать старый шаблон.

7. server/routes/billing.ts:
   - POST /billing/api-key { key } → storeApiKey
   - DELETE /billing/api-key/:id → deleteApiKey
   - GET /billing/api-key → listApiKeys
   - POST /billing/topup { amountUsd } → createTopup (Stripe)
   - POST /billing/topup/confirm { paymentIntentId } → confirmTopup
   - GET /billing/transactions?page&limit → getTransactionHistory
   - GET /billing/usage?from&to&synthesisId → getUsageHistory

8. server/utils/crypto.ts:
   - encrypt(plaintext, key): AES-256-GCM
   - decrypt(ciphertext, iv, tag, key): AES-256-GCM
```

**Последующие запросы:**
- «Протестируй BYO-Key: сохрани ключ → getDecryptedKey возвращает оригинал → billing-check пропускает с mode "byo"»
- «Протестируй баланс: пополни $1.00 → сгенерируй раздел → баланс уменьшился на стоимость → transaction записан»
- «Протестируй недостаток баланса: баланс $0.001, попытка генерации exhaustive — ошибка INSUFFICIENT_BALANCE» (ФАКТ 6.1: порог — `BILLING_MIN_RESERVE_USD`, баланс 0 → `BILLING_REQUIRED`; строка синтеза не создаётся — middleware до INSERT)
- «Протестируй шифрование: storeApiKey → перезапуск сервера → getDecryptedKey возвращает тот же ключ»
- «Edge case: пользователь с BYO-Key И балансом — приоритет BYO-Key»
- «Протестируй подписку: создать Starter план → subscribe → Stripe mock → подписка active → сгенерировать синтез → used_syntheses = 1»
- «Протестируй исчерпание квоты: used_syntheses = quota → следующий запрос → QUOTA_EXCEEDED (или fallback на баланс если есть)»
- «Протестируй webhook: отправь mock invoice.paid → счётчики сброшены, period обновлён»
- «Протестируй отмену: cancel → cancel_at_period_end = true → до конца периода работает → после — status canceled»
- «Протестируй приоритет: пользователь с BYO-Key + подписка + баланс → используется BYO-Key. Удалить ключ → подписка. Исчерпать квоту → баланс»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 6.1 (2026-09-06) — отступления от буквы первого запроса:** → `docs/08-history.md`, глава «Беседа 6.1», подраздел «По факту 6.1 (2026-09-06) — отступления от буквы первого запроса».

### Беседа 6.2: Billing UI + Admin Prompts Page (клиент)

**Контекст:**
- `03-specification.md` (секции 1.10 Prompt Registry, 1.11 Биллинг, 2.9 Prompts API, 2.10 Billing API)
- `05-file-structure.md` (client/pages/)
- Оформление нового интерфейса: `docs/fragments-for-conversations/5-6-ui-kit.md` (бриф и таблица соответствий классам исходника), `5-6-ui-kit.css` (примитивы), `5-6-ui-kit.html` (эталон разметки)
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

5. Защита роута: AdminPromptsPage доступна только для role === 'admin'.
   ФАКТ 2026-09-02: в App.tsx маршрут /admin/prompts закрыт только
   RequireAuth — ролевой проверки нет, добавить здесь (RequireAdmin либо
   параметр RequireAuth); ссылка в Sidebar уже admin-only с беседы 0.4.

5b. UI подписок (правка 2026-09-02, п.8). Бэкенд подписок готов целиком
   (02 §2.22–2.23, 03 §2.10 — шесть эндпоинтов и webhook,
   subscription-service 6.1), а интерфейса не было ни в одной беседе,
   хотя 01 §6 ставит подписку посередине приоритета биллинга. В
   BillingPage добавить секцию «Подписка»:
   - текущий план, статус, период, счётчики против квот
     (GET /billing/subscription);
   - выбор тарифа (GET /billing/plans) → POST /billing/subscribe →
     Stripe Elements;
   - отмена (cancel_at_period_end) и возобновление;
   - client/api/subscription.ts (05 его уже числит).

6. Форма ввода API-ключа в auth-модалке (долг TODO(6.1) главы 1.4b —
   задача клиентская, но была адресована серверной беседе 6.1; аудит
   2026-07-31):
   в client/src/components/synthesis/PauseModal.tsx auth-рендерер
   сейчас предлагает только «Повторить» (после замены ключа на
   сервере) и «Остановить» — порт _resumeWithNewApiKey [25028]
   опущен. После BYO-Key из 6.1 ключ становится пользовательским,
   и форму можно показать прямо в модалке паузы.
```

**По факту 6.2 (2026-09-07) — отступления от буквы запроса и найденное:** → `docs/08-history.md`, глава «Беседа 6.2», подраздел «По факту 6.2 (2026-09-07) — отступления от буквы запроса и найденное».

**Последующие запросы:**
- «Протестируй BYO-Key UI: ввести ключ → сохранение → отображается prefix → удалить → "Не задан"»
- «Протестируй пополнение: нажать $5 → Stripe mock → баланс обновлён → транзакция в истории»
- «Протестируй историю использования: после нескольких генераций → таблица заполнена → фильтр по синтезу работает → итоги совпадают»
- «Протестируй AdminPromptsPage: изменить шаблон "system" → сохранить как черновик → активировать → проверить что генерация использует новый шаблон»
- «Протестируй diff: две версии шаблона → визуальное сравнение показывает изменения»
- «Проверь доступ: обычный пользователь → /admin/prompts → redirect на 403 или каталог» (ФАКТ 6.2: redirect на `/catalog` — страницы 403 нет; серверные роуты §2.9 → 403 FORBIDDEN)

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Фаза 7 (добавлена 2026-09-07 по итогам 6.2): долги и доводка

> Нумерация §9–12 сохранена намеренно — на них ссылаются шапки всех
> бесед; Фаза 7 живёт внутри §8 как продолжение биллингового блока.
> Заведена потому, что реестр §12 к концу Фазы 6 накопил долги, у
> которых адресат — уже проведённая беседа: серверная работа в
> клиентских беседах (6.2) не делалась, а следующей серверной беседы
> в графе не было.

### Беседа 7.1: Долги реестра §12 и доводка (бэкенд + клиент)

**Контекст:**
- `07-conversation-protocol.md` §12 — строки с адресатом 7.1 (источник задач)
- `02-data-model.md` (§2.1 users, §2.17–2.18 created_by, §2.20–2.23 биллинг)
- `03-specification.md` (§2.1 auth, §2.4 edges, §2.9, §2.10, §2.13)
- Из предыдущих бесед: `server/db/schema.ts` + миграции 0000–0002,
  `routes/prompts.ts`, `routes/elements.ts`, `routes/taxonomy.ts`,
  `element-taxonomy.ts`, `billing-service.ts`, `subscription-service.ts`,
  `stripe-client.ts`, `client/api/prompts.ts` (обход /versions),
  `client/pages/AdminPromptsPage.tsx`, `client/components/form/SynthesisForm.tsx`
  (гейт файловых ☑-концепций 1.5b/3.2), `client/components/edit/EdgeEditor.tsx`,
  `scripts/test-31-requests2-4.ts`
- Исходник: НЕ НУЖЕН (кроме `addEdge`-логики для `POST /edges`, если решится портировать)

**Первый запрос:**
```
Закрываю долги реестра §12 с адресатом 7.1 (по одному запросу на группу):

1. Схема: миграция 0003 — ON DELETE SET NULL для prompt_templates.created_by и
   synthesis_configs.created_by; колонка users.stripe_customer_id (nullable,
   unique) — createTopup/createSubscription переиспользуют Customer.
2. Prompt Registry: тела в GET /prompts/:key/versions (или
   GET /prompts/:key/versions/:version) и value в /configs/:key/versions;
   убрать обход getTemplateVersions/getConfigVersionsFull в client/api/prompts.ts.
3. Каталоги типов: PATCH/DELETE /taxonomy/{category|relationship}-types/:id
   (admin; is_system → 403; удаление при ссылках categories/edges → SET NULL
   typeCatalogId) + вкладка «Каталоги» в AdminPromptsPage.
4. Связи: POST /syntheses/:id/edges (владелец, валидация концов, impact) +
   создание связи из EdgeEditor/GraphModal.
5. Форма синтеза: авто-импорт файловых ☑-концепций при сабмите
   (POST /syntheses/import → участник type='synthesis') — снять гейт 1.5b/3.2.
6. Биллинг: точная оценка стоимости в гейте POST /syntheses (после разбора
   тела, сверка с балансом вместо порога); DELETE /auth/me с финансовой
   историей (анонимизация users + RESTRICT-история остаётся).
7. Инструменты: починить scripts/test-31-requests2-4.ts и включить
   typecheck:scripts в корневой typecheck.
```

**Последующие запросы:** по одному тесту на пункт 1–7 (миграция на живом PG16;
diff версий без обхода; CRUD типов с гейтом is_system; создание связи из UI;
сабмит формы с файловой концепцией; гейт оценки; удаление аккаунта; typecheck).

**Завершение беседы:** стандартное (§10) + вычеркнуть закрытые строки §12.

**По факту 7.1 (2026-09-07) — отступления от буквы запроса и найденное:** → `docs/08-history.md`, глава «Беседа 7.1», подраздел «По факту 7.1 (2026-09-07) — отступления от буквы запроса и найденное».

### Фаза 8 (добавлена 2026-09-08 по итогам прогона на чистой машине): пусковая пригодность

> Заведена не по реестру §12 — он пуст, и на момент открытия Фазы 8 в нём
> нет ни одной строки. Повод другой: служба впервые поднималась на чистой
> машине, и обнаружились пробелы, которых ни одна беседа не оставляла,
> потому что ни одна их не касалась. Долг оставляет беседа; эти — не
> оставлены, а не заведены.
>
> Нумерация §9–12 сохранена, как и при заведении Фазы 7: Фаза 8 живёт
> внутри §8 продолжением блока «биллинг и админка», потому что предмет
> у неё тот же.
>
> **Решение о ролевой модели, принятое при заведении фазы.** Ролей
> остаётся ДВЕ. Лестница viewer → editor → moderator оправдана там, где
> правится ОДИН общий объект и очередь правок к нему; в PhiloSynth
> общего объекта нет, доступ решают владение (`isOwner`) и оплата
> (`billing-check`), а чужой синтез не виден никому. Третья роль
> заводится, когда у неё появится обязанность, и такая на виду одна —
> платная поддержка, которой нужно видеть чужие `api_usage` и
> `transactions`, не видя содержания синтезов. До появления
> обязанности роль не заводится, и беседа 8.1 её не заводит.
>
> **Состав фазы (порядок уточнён 2026-09-08).** 8.1 администратор
> (проведена) · 8.2 локальный стенд биллинга (проведена) · 8.3 тарифы и
> Prices (проведена 2026-09-09) · 8.4 управление своим содержимым
> (проведена 2026-09-14) · 8.5 родословная при импорте (проведена
> 2026-09-14). Фаза в первоначальном составе закрыта; 8.6/8.7 (публичность,
> витрина) добавлены 2026-09-14; 8.6 и 8.7 проведены 2026-09-15 — фаза
> закрыта целиком.
> Перестановка 8.2 ↔ 8.3 против первоначальной: тарифы проверяются НА
> МОКЕ Stripe, а мок вынимает из тестов беседа о стенде — иначе тарифы
> заводят его шестую копию. Обратная нужда (стенду нужны тарифы) была
> ровно в одной проверке из шести, и та перенесена в 8.3.
>
> **Оговорка о 8.2.** Беседа о стенде — оснастка разработчика, а не
> пусковая пригодность: под заголовок фазы она попала потому, что без
> неё нельзя проверить биллинг, а не потому, что нужна к запуску.
> Отдельной фазы ради неё не заводим, но искать в ней смысла, которого
> нет, не следует.

---

### Беседа 8.1: Администратор — заведение, передача, след (бэкенд + клиент)

**Контекст для загрузки:**
- `02-data-model.md` (§2.1 users; новая таблица журнала — раздел заводится этой беседой)
- `03-specification.md` (§2.1 Auth API, §2.9 Prompt Registry, §2.13 каталоги типов, §4.3 коды ошибок)
- `05-file-structure.md` (`scripts/` — корневые скрипты, `server/scripts/` в проекте нет (уточнено 8.1), `server/services/`, `client/pages/`)
- Из предыдущих бесед: `server/middleware/auth.ts` и `admin-only.ts` (из 0.2), `server/routes/auth.ts` (из 0.5/0.6/7.1), `server/services/account-deletion.ts` (из 7.1), `server/services/prompt-registry.ts` (из 0.3), `server/services/element-taxonomy.ts` (из 0.3b), `server/routes/taxonomy.ts` (из 5.3/7.1), `server/db/schema.ts` + миграции 0000–0003, `scripts/seed-taxonomy.ts` (образец идемпотентного скрипта), `client/pages/AdminPromptsPage.tsx` (из 6.2/7.1), `client/api/prompts.ts`, `client/api/client.ts`
- Исходник: НЕ НУЖЕН (полностью новая функциональность)

**Грабли из 09, которые беседа заденет заведомо:**
- §3, беседа 7.1 — `drizzle-kit generate` даёт СЛУЧАЙНЫЙ тег миграции: переименовать файл И тег в `meta/_journal.json` (0004 — первая же операция беседы)
- §3, беседа 0.2 — pg-код ошибки лежит в `err.cause.code` (`DrizzleQueryError`), не в `err.code`: перехват 23505 на занятом email в bootstrap-скрипте
- §3, беседа 0.2 — формы ответов, у которых нет кода в §4.3 (единое 401 без перечисления, 409 + `details`): образец для `LAST_ADMIN` и `SELF_ROLE_CHANGE`
- §1, беседа 0.3 — jsonb НЕ хранит порядок ключей: `admin_audit.details` сверять только через `canonical()` с рекурсивной сортировкой
- §2, беседа 6.2 (п. 2–4) — капитель `.action-btn`/`.form-label` (сравнивать регистронезависимо); «Node is detached» при клике по перерисованным React-спискам (через `$eval(sel, el => el.click())`); статус успеха ставить ПОСЛЕ перечитывания списка
- §2, беседа 6.2 (п. 7) — порядок уборки стенда по FK: образец для пользователей `t81-*`, у которых теперь есть и строки журнала
- §5, беседа 7.1 — статический импорт `.tsx` в `.mts` под `typecheck:scripts`: только путём-переменной

**Первый запрос:**
```
Делаю роль администратора достижимой, непотеряемой и оставляющей след.

Роли остаются ДВЕ — 'user' и 'admin'. Лестницу viewer/editor/moderator
НЕ заводить: она отвечает на вопрос «кому позволено трогать общее», а
общего объекта в сервисе нет — синтезы принадлежат авторам, чужой не
виден никому, модерировать нечего. Доступ решают владение
(SynthesisFull.isOwner, 5.2) и оплата (billing-check, 6.1); роль
отличает не «больше прав», а другой род ответственности: шаблоны
промптов глобальны, и активированная версия меняет генерацию у всех.

Прикреплены: модель данных (§2.1 users), спецификация (§2.1, §2.9, §2.13,
§4.3), auth-middleware, admin-only, routes/auth.ts, account-deletion.ts,
prompt-registry.ts, element-taxonomy.ts, routes/taxonomy.ts, schema.ts +
миграции 0000–0003, seed-taxonomy.ts как образец скрипта,
AdminPromptsPage.tsx, api/client.ts.

Создай:

1. packages/shared/constants/auth.ts — вынести PASSWORD_MIN_LENGTH
   (сейчас локальная константа routes/auth.ts:50). Второго свода правил
   о пароле в проекте быть не должно: скрипт первого администратора
   обязан требовать ровно то же, что обычная регистрация.

2. scripts/bootstrap-admin.ts — ПЕРВЫЙ АДМИНИСТРАТОР, только из
   командной строки:
   a. Пароль — из переменной окружения BOOTSTRAP_ADMIN_PASSWORD, НЕ
      доводом командной строки (довод виден в списке процессов и
      остаётся в истории оболочки). Нет переменной → внятный отказ и
      выход с кодом 1; небезопасного умолчания нет.
   b. BOOTSTRAP_ADMIN_EMAIL обязателен, BOOTSTRAP_ADMIN_NAME — нет.
   c. Проверка пароля — та же, что при регистрации (константа из п. 1).
   d. Хэш — bcrypt через hashPassword из middleware/auth.ts.
   e. Идемпотентность в терминах остальных скриптов (created / updated /
      skip / fail): администратор с таким email уже есть → skip;
      пользователь есть, роль 'user' → updated (повышение);
      никого нет → created.
   f. ЗАСЛОН: если в базе УЖЕ есть хотя бы один администратор с ДРУГИМ
      email — отказ с подсказкой «второго назначайте
      POST /auth/users/:id/role». Открытая ветка «кто запустил скрипт,
      тот и админ» на живой базе — способ потерять службу.
   g. Запись в журнал (п. 4) с actor_id = самому себе и пометкой
      источника 'bootstrap'.
   h. npm-скрипт `seed:admin` в корневом package.json рядом с seed:*.

3. server/db/migrations/0004_admin_audit.sql + таблица в schema.ts:
   admin_audit (id uuid pk, actor_id uuid → users(id) ON DELETE SET NULL,
   action text, target_type text, target_id text null, details jsonb
   default '{}', ip text null, created_at timestamptz default now();
   индексы по actor_id и created_at).
   Внести раздел §2.29 в 02-data-model.md.
   actor_id — SET NULL, а не CASCADE: анонимизация администратора
   (DELETE /auth/me, 7.1) не должна стирать след его действий.

4. server/services/admin-audit.ts: writeAudit(exec, { actorId, action,
   targetType, targetId, details, ip }) — принимает db ИЛИ транзакцию и
   пишет В ТОЙ ЖЕ транзакции, что и само действие. Журнал, который может
   разойтись с делом, хуже отсутствующего.
   Список действий — замороженная константа ADMIN_ACTIONS (не свободная
   строка): prompt.version.created, prompt.version.activated,
   config.version.created, config.version.activated,
   taxonomy.type.updated, taxonomy.type.deleted, user.role.changed,
   user.bootstrapped, account.deleted.

5. Точки записи (вызовы writeAudit добавить, поведение не менять):
   - prompt-registry: createVersion, activateVersion, createConfigVersion,
     activateConfigVersion — актора пробрасывать из роутов
     (сейчас createdBy передаётся, activate — нет);
   - element-taxonomy: updateCustomType, deleteCustomType;
   - смена роли (п. 6) и account-deletion (п. 7).

6. server/routes/auth.ts — управление доступом (requireAuth + requireAdmin):
   - GET /auth/users?query=&limit=&offset= — минимальный список для
     назначения: id, email, displayName, role, createdAt. Без него
     назначать некого: id пользователя взять неоткуда.
   - POST /auth/users/:id/role { role: 'user' | 'admin' } —
     * роль вне двух значений → 400 VALIDATION_ERROR;
     * :id не найден → 404 NOT_FOUND;
     * СВОЮ роль менять нельзя → 409 SELF_ROLE_CHANGE (иначе
       единственный администратор понижает сам себя);
     * понижение последнего администратора → 409 LAST_ADMIN;
     * успех → полный user + строка admin_audit (user.role.changed,
       details { from, to }).

7. server/services/account-deletion.ts — заслон последнего
   администратора: удаляющийся администратор, если он единственный,
   получает 409 LAST_ADMIN с подсказкой «сначала назначьте второго».
   Проверка — в той же транзакции, что и удаление, иначе двое последних
   администраторов уйдут одновременно.

8. Коды ошибок: LAST_ADMIN и SELF_ROLE_CHANGE — в 03-spec §4.3 и в
   ApiErrorCode (client/api/client.ts).

9. Клиент: вкладка «Доступ» в AdminPromptsPage (рядом с «Каталоги»,
   7.1) — поиск по email/имени, список с ролью, переключение роли с
   подтверждением, показ последних 50 строк admin_audit
   (GET /auth/audit?limit=). client/api/admin.ts — три вызова.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не заводить третью роль и не трогать матрицу прав — её нет и не нужно;
- не заводить почту (уведомление о смене роли, подтверждение адреса) —
  почтовой подсистемы в проекте нет вовсе, это отдельная беседа;
- не заводить MFA;
- не давать администратору доступ к чужим синтезам: ось владения
  (isOwner) этой беседой не трогается.
```

**Последующие запросы:**
- «Протестируй bootstrap-admin на пустой базе: BOOTSTRAP_ADMIN_PASSWORD задан → created → вход по этому паролю работает → GET /auth/me отдаёт role='admin'»
- «Протестируй идемпотентность: повторный запуск с тем же email → skip, пароль не переписан; запуск на существующем 'user' → updated (повышение)»
- «Протестируй заслон: в базе есть админ admin@a → запуск с BOOTSTRAP_ADMIN_EMAIL=admin@b → отказ, база не изменилась»
- «Протестируй POST /auth/users/:id/role: админ повышает user → в БД role='admin', в admin_audit строка user.role.changed с from/to; обычный пользователь тем же запросом → 403 FORBIDDEN»
- «Протестируй LAST_ADMIN: единственный админ понижает себя → 409 SELF_ROLE_CHANGE; второй админ понижает первого, оставшись один, затем понижает себя → 409 SELF_ROLE_CHANGE; DELETE /auth/me единственным админом → 409 LAST_ADMIN; после назначения второго — оба действия проходят»
- «Протестируй след: активировать версию шаблона в AdminPromptsPage → строка prompt.version.activated с actor_id активировавшего (не автора версии); удалить пользовательский тип каталога → taxonomy.type.deleted. `details` сверять через canonical() — порядок ключей jsonb не сохраняется»
- «Протестируй сохранность следа: администратор, оставивший строки в admin_audit, удаляет свой аккаунт (не последний) → строки на месте, actor_id = NULL»
- «Edge case: role вне {user, admin} → 400 VALIDATION_ERROR с details.role; :id несуществующий → 404; GET /auth/users без прав администратора → 403»
- «Протестируй вкладку „Доступ“ в браузере: поиск → переключение роли → подтверждение → список обновлён → журнал показывает новую строку. Кликать через `$eval(sel, el => el.click())` (React перерисовывает список между `$` и кликом); тексты кнопок сравнивать регистронезависимо (капитель); проверку статуса ставить ПОСЛЕ перечитывания списка, иначе тест увидит новый статус при старом списке»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 8.1 (2026-09-08) — отступления от буквы запроса и найденное:** → `docs/08-history.md`, глава «Беседа 8.1», подраздел «По факту 8.1 (2026-09-08) — отступления от буквы запроса и найденное».

### Беседа 8.2: Локальный стенд биллинга без Stripe (оснастка)

**Контекст для загрузки:**
- `03-specification.md` (§2.10 — webhook, состояния подписки)
- Из предыдущих бесед: `tests/test-61-requests2-11.mjs` (мок Stripe — строки ~174–214, харнесс), `tests/test-62-requests2-7.mjs` и `tests/test-71-requests2-8.mjs` (те же моки, продублированы), `server/services/stripe-client.ts` (constructWebhookEvent), `server/routes/billing.ts` (webhook), `server/env.ts`, `.env.example`, `scripts/philosynth-termux.sh`
- Исходник: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §4, беседа 5.4 — прокси `client/vite.config.ts` ЗАШИТ на :3000: браузерный стенд поднимает сервер только на этом порту
- §4, беседа 5.2 — teardown через `SIGKILL` без группы оставляет `npx vite` на 5199 («порт занят» у следующего запуска); `pkill -9 -f "[t]sx|[v]ite"` в песочнице убивает и саму оболочку — чистить `pgrep -f` с исключением `$$`
- §2, беседа 6.2 (п. 6) — тесты под `tsx` импортируют `.tsx` без DOM, `import.meta.env` там отсутствует: `utils/stripe.ts` это учитывает, при выносе мока не ломать
- §4, беседы 6.1 и 6.2 — PG и Redis не переживают паузу между ходами; полный прогон 2,5–3,5 мин — только в фоне с логом
- §4, беседа 7.1 — точный гейт оценки сделал стенды дороже: тестовым пользователям баланс с запасом (в R6 брали $50)
- §8, беседа 7.1 — проверка «в выводе нет ✗» ложно срабатывает на строке итога «0 ✗»: сравнивать по шаблону итога

**Первый запрос:**
```
Собираю локальный стенд биллинга: весь платёжный путь должен щёлкаться
в браузере на настоящем коде, без аккаунта Stripe.

Мок Stripe уже написан и работает, но заперт внутри
tests/test-61-requests2-11.mjs и продублирован в тестах 6.2 и 7.1.

Прикреплены: три тестовых файла, stripe-client.ts, routes/billing.ts,
env.ts, .env.example, termux-скрипт.

Создай:

1. tools/stripe-mock.mjs — самостоятельный мок, вынесенный из
   test-61 без изменения поведения: POST /v1/payment_intents,
   GET /v1/payment_intents/:id, POST /v1/customers,
   POST/GET /v1/subscriptions (+ cancel_at_period_end), и новые
   /v1/products, /v1/prices под беседу 8.3 (тарифы).
   Порт и ожидаемый Bearer — из переменных окружения (умолчания те же,
   что в тестах). Флаг --verbose печатает принятые запросы.

2. tools/stripe-emit.mjs — отправщик webhook-событий, которых на стенде
   некому прислать: invoice.paid, customer.subscription.updated,
   customer.subscription.deleted. Подпись ставится, если задан
   STRIPE_WEBHOOK_SECRET, и не ставится иначе — вне production
   constructWebhookEvent подпись не проверяет (stripe-client.ts:274–281).
   Довод — id подписки или платежа; тело собирается по образцу мока.

3. Три тестовых файла переводятся на общий модуль мока (import из
   tools/), собственные копии удаляются. Прогоны test-61/62/71 обязаны
   дать те же числа, что и до правки: 109 / 101 / 105.

4. .env.local.example + tools/dev-billing.sh: поднять мок, задать
   STRIPE_API_BASE и фиктивные ключи, напомнить про seed:admin (8.1).
   Тарифы стенд НЕ сеет — это беседа 8.3; если `npm run seed:plans` уже
   существует, скрипт зовёт его, если нет — печатает, что раздел
   подписки будет пуст, и это не отказ стенда. Скрипт идемпотентен и
   ничего не делает на живой конфигурации (STRIPE_SECRET_KEY начинается
   с sk_live_ → отказ).

5. docs/09-lessons.md — раздел «Стенд биллинга»: почему подписка висит
   в incomplete без webhook; почему без VITE_STRIPE_PUBLISHABLE_KEY
   страница уходит в dev-режим подтверждения; чем стенд не равен
   настоящему Stripe (3-D Secure, идемпотентные ключи, реальные
   состояния invoice).

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не менять продуктовый код (server/, client/) вовсе. Беседа
  оснастковая: если для стенда чего-то не хватает в продукте — завести
  строку в §12 с адресатом, а не править походя.
- не сеять тарифы и не трогать subscription_plans: это беседа 8.3.
  Проверка подписки целиком (incomplete → invoice.paid → active → cancel
  → resume) тоже её: на стенде без посеянных тарифов подписывать не на
  что. Здесь проверяются пополнение, webhook, заслон на sk_live_ и
  teardown — им планы не нужны.
```

**Последующие запросы:**
- «Прогони test-61, test-62, test-71 на общем моке: 109 / 101 / 105, как до выноса»
- «Протестируй стенд руками: dev-billing.sh (сервер строго на :3000 — прокси vite зашит) → регистрация → пополнение $5 → баланс вырос → транзакция в истории»
- «Протестируй заслон: STRIPE_SECRET_KEY=sk_live_… → dev-billing.sh отказывается»
- «Edge case: stripe-emit с несуществующим id подписки → webhook отвечает 200 и ничего не меняет (так же, как настоящий Stripe на неизвестное событие)»
- «Протестируй teardown: dev-billing.sh --stop гасит мок, сервер и vite, порт 5199 свободен; повторный запуск проходит без „порт занят“»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 8.2 (2026-09-08) — отступления от буквы запроса и найденное:** → `docs/08-history.md`, глава «Беседа 8.2», подраздел «По факту 8.2 (2026-09-08) — отступления от буквы запроса и найденное».

### Беседа 8.3: Тарифы — посев и заведение Prices в Stripe (бэкенд + скрипты)

**Контекст для загрузки:**
- `02-data-model.md` (§2.22 subscription_plans, §2.23 user_subscriptions)
- `03-specification.md` (§2.10 Billing API — GET /billing/plans, POST /billing/subscribe)
- Из предыдущих бесед: `server/services/subscription-service.ts` и `stripe-client.ts` (из 6.1), `server/routes/billing.ts` (из 6.1), `server/env.ts`, `scripts/seed-configs.ts` и `seed-taxonomy.ts` (образцы идемпотентных сидов, из 0.3/0.3b), `client/pages/BillingPage.tsx` (секция «Подписка», из 6.2), `server/db/schema.ts`
- `tools/stripe-mock.mjs` и `tools/stripe-emit.mjs` (из 8.2) — на них проверяется всё, что требует Stripe; своей копии мока НЕ заводить
- `tools/dev-billing.sh` (из 8.2) — стенд для проверки тарифов руками: зовёт `npm run seed:plans`, как только он появится; `tests/test-82-requests2-6.mjs` — образец харнесса против настоящего стенда; `.env.local.example` — переменные стенда (сюда — `STRIPE_PRICE_*`, если 8.3 их заведёт)
- Исходник: НЕ НУЖЕН (в одностраничнике подписок нет)

**Грабли из 09, которые беседа заденет заведомо:**
- §3, беседа 6.1 — FK `user_subscriptions → subscription_plans`: заслон «нельзя менять Price у плана с живыми подписками» опирается не на осторожность, а на настоящий FK
- §4, беседа 6.1 — моку Stripe хватает шести маршрутов и разбора `application/x-www-form-urlencoded` С КЛЮЧАМИ `a[b][c]`: `createProduct`/`createPrice` шлют вложенные формы — с 8.2 УСТАРЕЛО в части «шести»: `/v1/products` и `/v1/prices` (`lookup_keys[]`, `transfer_lookup_key`) уже в `tools/stripe-mock.mjs` (09 §9); `recurring[interval]` разбирается тем же `parseForm`
- §5, беседа 6.1 — `env` читается ОДИН раз при импорте: `STRIPE_PRICE_*` задавать до импорта модулей, иначе прочтётся пустота
- §8, беседа 6.1 — `*/` внутри блочного комментария TS закрывает его: `used_*/quota_*` в шапке `plans.ts` писать словами
- §1, беседа 0.3 — `tsc --noEmit <файл>` игнорирует tsconfig (только `-p`/`-b`); `check:integration` запускать с `-w server`

**Первый запрос:**
```
Завожу тарифы. Сейчас subscription_plans не сеется ничем, и секция
подписки в BillingPage пуста на любой свежей базе; собственный
scripts/philosynth-termux.sh печатает об этом предупреждение.

Обязательное поле stripe_price_id существует только в аккаунте Stripe
владельца службы — поэтому шага два: описание тарифов в коде и
заведение Prices ключом владельца.

Прикреплены: модель данных (§2.22–2.23), спецификация (§2.10),
subscription-service.ts, stripe-client.ts, routes/billing.ts, env.ts,
seed-configs.ts и seed-taxonomy.ts как образцы, BillingPage.tsx.

Создай:

1. server/config/plans.ts — описание тарифов БЕЗ stripe_price_id:
   name ('starter' | 'pro' | 'academic'), displayName, priceUsd,
   billingPeriod, quotaSyntheses, quotaRegenerations, quotaModes,
   quotaEnrichments. Значения квот согласовать со стоимостью операций
   из cost-estimator (1.1) и наценкой BILLING_MARKUP — тариф, у
   которого квота дороже цены, завести нельзя.

2. scripts/seed-plans.ts — четвёртый сид, в стиле трёх существующих
   (created / updated / skip / fail, повторный прогон — skip):
   a. stripe_price_id берётся из переменной окружения
      STRIPE_PRICE_<NAME_UPPER> (STRIPE_PRICE_STARTER и т. д.).
   b. Переменной нет → план заводится с is_active=false и ГРОМКИМ
      предупреждением в выводе. Молча заводить неактивный план нельзя:
      это ровно тот случай, когда «страница пуста» не отличается от
      «скрипт не запускали».
   c. Ключ идемпотентности — name (UNIQUE в схеме). Расхождение
      displayName/цены/квот → updated; расхождение stripe_price_id у
      плана, на который уже есть действующие подписки, → fail с
      объяснением (сменить Price у живой подписки нельзя).
   d. npm-скрипт `seed:plans`.

3. Расширение server/services/stripe-client.ts: createProduct, createPrice,
   listPrices (те же приёмы, что у существующих вызовов: form-кодирование,
   STRIPE_API_BASE, StripeError).

4. scripts/stripe-create-prices.ts — заводит Product и Price по каждому
   тарифу из plans.ts ключом владельца:
   a. Идемпотентность через lookup_key = 'philosynth_' + name (Stripe
      его и хранит) — повторный запуск не плодит дубликатов, а
      сообщает найденный price_….
   b. Печатает готовые строки STRIPE_PRICE_* для вставки в .env.
   c. Пустой STRIPE_SECRET_KEY → внятный отказ, а не 503 из недр
      клиента.

5. Доки: 02 §2.22 — откуда берутся строки таблицы; 03 §2.10 — поведение
   GET /billing/plans при пустой таблице (пустой массив, не ошибка);
   README — раздел «Как поднять биллинг» из четырёх шагов (ключи Stripe →
   stripe-create-prices → STRIPE_PRICE_* в .env → seed:plans).

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не менять subscription-service и логику квот — беседа только заводит
  данные, поведение подписки сделано в 6.1;
- не трогать BillingPage: секция подписок написана в 6.2 и должна
  ожить сама, как только в таблице появятся строки. Если не ожила —
  это дефект 6.2, и он чинится здесь, но с записью в «По факту».
```

**Последующие запросы:**
- «Протестируй seed-plans без STRIPE_PRICE_*: три плана заведены с is_active=false, вывод содержит предупреждение по каждому; GET /billing/plans отдаёт пустой массив (activeOnly)»
- «Протестируй seed-plans с заданными STRIPE_PRICE_*: планы активны, GET /billing/plans отдаёт три позиции, секция „Подписка“ в BillingPage их показывает»
- «Протестируй идемпотентность: повторный прогон → skip×3; правка цены в plans.ts → updated только у одного плана»
- «Протестируй заслон: у плана есть активная подписка, STRIPE_PRICE_* изменён → fail с объяснением, строка в БД не тронута»
- «Протестируй stripe-create-prices на `tools/stripe-mock.mjs` (из 8.2): первый запуск создаёт Product+Price, второй находит по lookup_key и не создаёт второго»
- «Edge case: пустой STRIPE_SECRET_KEY → отказ скрипта до первого запроса; квота, делающая тариф убыточным при BILLING_MARKUP → отказ проверки в seed-plans»
- «Протестируй подписку целиком: subscribe → статус incomplete → stripe-emit invoice.paid → „Обновить“ → active, квоты видны; cancel → cancel_at_period_end; resume → снова active» (проверка перенесена из 8.2: подписывать не на что, пока тарифы не посеяны)

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 8.3 (2026-09-09) — отступления от буквы запроса и найденное:** → `docs/08-history.md`, глава «Беседа 8.3», подраздел «По факту 8.3 (2026-09-09) — отступления от буквы запроса и найденное».

### Беседа 8.4: Управление своим содержимым — каталог, капсула, связь (клиент)

**Контекст для загрузки:**
- `02-data-model.md` (§2.4 syntheses — CASCADE и `parent_synthesis_id` SET NULL; §2.5 synthesis_lineage — только для чтения счётчика потомков)
- `03-specification.md` (§2.2 Syntheses API — DELETE, duplicate, PATCH; §2.4 элементы — capsule, edges; §2.8 GET /lineage/descendants; §4.3 коды ошибок)
- `04-code-reuse-map.md`, `05-file-structure.md` (`client/components/catalog/`, `client/api/`)
- `docs/fragments-for-conversations/5-6-ui-kit.md` + `.css` + `.html` — беседа вводит НОВЫЕ элементы интерфейса (строка действий карточки, двухшаговое подтверждение, правка названия и капсулы по месту); сверяться с набором обязательно
- Из предыдущих бесед:
  - `client/pages/CatalogPage.tsx` (1.6b; фильтр потомков — 3.2), `client/components/catalog/SynthesisCard.tsx` (1.6b)
  - `client/api/syntheses.ts` (1.6b), `client/api/elements.ts` (5.1/5.2/5.4), `client/api/lineage.ts` (3.2)
  - `client/api/transforms.ts` и `client/hooks/useTransformStream.ts` (5.5), `client/api/prompts.ts` (6.2/7.1) — только для уборки
  - `client/components/graph/EdgePanel.tsx` и `GraphModal.tsx` (1.7; правка связи — 5.4), `client/components/document/DocumentHeader.tsx` (1.6b)
  - `client/components/edit/TransformPanel.tsx` (5.5) — образец подтверждения вторым шагом
  - `server/routes/syntheses.ts` (1.6) и `server/routes/elements.ts` (5.1) — ТОЛЬКО ДЛЯ ЧТЕНИЯ: убедиться в формах ответов; сервер эта беседа не правит
- Исходник: НЕ НУЖЕН. Одностраничник хранит концепции в браузере, управления ими в нём нет — портировать нечего, оформление берётся из UI-кита.

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседа 6.2 (п. 2–4) — капитель у `.action-btn` (сравнивать регистронезависимо); «Node is detached» при клике по перерисованным React-спискам: карточки каталога перерисовываются после КАЖДОГО действия, кликать через `$eval(sel, el => el.click())`; статус успеха ставить ПОСЛЕ перечитывания списка
- §2, беседа 6.2 (п. 7) — порядок уборки стенда по FK: пользователи `t84-*` оставляют синтезы, а те — родословную
- §4, беседа 5.4 — прокси `client/vite.config.ts` ЗАШИТ на :3000: браузерные проверки только на этом порту
- §4, беседа 5.2 — teardown `SIGKILL` без группы оставляет `npx vite` на 5199; `pkill -9 -f "[t]sx|[v]ite"` в песочнице убивает и саму оболочку
- §8, беседа 7.1 — проверка «в выводе нет ✗» ложно срабатывает на строке итога «0 ✗»

**Первый запрос:**
```
Подключаю к интерфейсу транспорты, которые готовы на сервере и не
вызываются НИ ОТКУДА. Сплошная сверка 101 серверного маршрута с вызовами
клиента дала три таких транспорта и пять мёртвых функций api/*.
Сервер эта беседа НЕ ПРАВИТ вовсе.

Прикреплены: модель данных (§2.4, §2.5), спецификация (§2.2, §2.4, §2.8,
§4.3), карта переиспользования, структура файлов, UI-кит фаз 5–6,
CatalogPage, SynthesisCard, api/syntheses, api/elements, api/lineage,
api/transforms, hooks/useTransformStream, api/prompts, EdgePanel,
GraphModal, DocumentHeader, TransformPanel, routes/syntheses,
routes/elements.

ОБЩЕЕ ПРАВИЛО ПОДТВЕРЖДЕНИЙ. Необратимые действия подтверждаются
ВТОРЫМ ШАГОМ КНОПОК на месте, а не window.confirm — как сделано в
TransformPanel (5.5) и записано в UI-ките: «подтверждение — второй шаг
кнопок, не confirm». Кнопка переходит в «Точно удалить?» + «Отмена» и
возвращается назад по клику мимо. window.confirm в VersionHistory и
TransformHistory — наследие более ранних бесед; за образец его не брать,
но и переписывать те компоненты в этой беседе не надо.

1. client/api/syntheses.ts — три функции к транспортам, готовым с 1.6 и
   не вызывавшимся ни разу:
   a. deleteSynthesis(id) → apiDelete `/syntheses/:id` → { ok: true };
   b. duplicateSynthesis(id) → apiPost `/syntheses/:id/duplicate`
      → { id: string };
   c. renameSynthesis(id, title) — тонкая обёртка над существующей
      updateSynthesis (PATCH принимает title с 1.6; поля в интерфейсе нет).

2. SynthesisCard — строка действий, ТОЛЬКО на вкладке «Мои» (признак —
   наличие onTogglePublic, как сейчас):
   «Опубликовать/Скрыть» (есть) · «Переименовать» · «Дублировать» ·
   «Удалить».
   Все кнопки живут ВНУТРИ <Link>: каждой нужны e.preventDefault() и
   e.stopPropagation(), образец в SynthesisCard.tsx:83–96, иначе клик
   уводит на /synthesis/:id.
   Оформление — .action-btn в .catalog-card-foot; кнопка удаления
   красная (--red), это единственный цвет опасности в закрытой палитре.
   Обработчики передаёт CatalogPage, как уже сделано для публикации.

3. Переименование — поле по месту в карточке (не модалка): текущее имя
   в input, «Сохранить»/«Отмена», Enter сохраняет, Esc отменяет.
   Пустое или длиннее 200 знаков → 400 VALIDATION_ERROR с details.title,
   раскладывать под полем.

4. Удаление — второй шаг кнопок (общее правило выше). Подтверждение
   обязано сказать, ЧЕМ грозит: сервер сносит CASCADE разделы, элементы,
   логи и родословную, а parent_synthesis_id потомков ставит в NULL
   (02 §2.4). Если у концепции ЕСТЬ потомки, назвать их ЧИСЛОМ:
   перед показом подтверждения спросить GET /lineage/descendants и
   написать «у концепции N потомков, они останутся без родителя».
   409 GENERATION_IN_PROGRESS — строкой в карточке, карточка не исчезает.

5. Дублирование — после ответа список перечитывается, копия появляется
   по своему createdAt; автоперехода на копию НЕТ (решение: пользователь
   остаётся в каталоге и выбирает сам).

6. Капсула — кнопка ✎ у капсулы в DocumentHeader (только владельцу,
   .doc-title-edit-btn как у названия), правка textarea по месту,
   сохранение через updateCapsule из api/elements.ts (написана в 5.1 и
   НЕ ВЫЗЫВАЛАСЬ ниоткуда). При status='generating' кнопка disabled —
   сервер ответит 409.

7. EdgePanel — кнопка «Удалить связь» в .gm-panel-edit-row рядом с
   «✎ Редактировать», тем же вторым шагом; вызов deleteEdge из
   api/elements.ts (написана в 5.4 и НЕ ВЫЗЫВАЛАСЬ). После успеха — тот
   же путь обновления, что после PATCH связи в 5.4: перерисовка графа и
   перечитывание документа. Блокировка при генерации — как у правки.

8. Уборка мёртвых функций api/* (каждая проверена: вне своего модуля не
   зовётся):
   - transformGraphToTheses, transformThesesToGraph (api/transforms.ts) —
     вытеснены startTransformRequest, через которую ходит
     useTransformStream (5.5);
   - getVersions, getConfigVersions (api/prompts.ts) — вытеснены
     getVersionsFull / getConfigVersionsFull после того, как 7.1 научила
     /versions отдавать тела;
   - getCategory (api/elements.ts) — везде берётся список.
   НЕ ТРОГАТЬ: exportUrl (api/export.ts) и invalidateTaxonomyCache
   (api/taxonomy.ts) — они зовутся ВНУТРИ своих модулей.
   После уборки tsc обязан быть чистым; если что-то отвалилось, значит
   функция была жива и удалять её нельзя.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не править сервер: все четыре транспорта готовы, беседа проверяет
  формы ответов по коду и только;
- не заводить корзину и мягкое удаление: DELETE /syntheses/:id жёсткий
  с 1.6, менять его семантику эта беседа не уполномочена;
- не приводить VersionHistory и TransformHistory к новому правилу
  подтверждений — это правка чужих бесед без повода;
- родословную при импорте не трогать: она — беседа 8.5.
```

**Последующие запросы:**
- «Протестируй удаление: создать синтез, удалить из карточки (второй шаг кнопок) → 200, карточка исчезла, GET /syntheses/:id → 404, разделы и элементы сняты CASCADE»
- «Протестируй предупреждение о потомках: у концепции с двумя потомками текст подтверждения называет число 2; после удаления у потомков parent_synthesis_id = NULL, сами потомки живы»
- «Протестируй переименование: поле по месту → Enter → PATCH → карточка и заголовок документа показывают новое имя; пустое имя → 400 с details.title под полем; Esc возвращает прежнее»
- «Протестируй дублирование: → { id }, список перечитан, копия видна, автоперехода нет; открыть копию — разделы и граф на месте»
- «Протестируй капсулу: ✎ у капсулы → правка → сохранение → DocumentHeader показывает новый текст; у чужого синтеза кнопки ✎ нет вовсе»
- «Протестируй удаление связи: панель связи → «Удалить связь» → второй шаг → граф перерисован без связи, таблица связей документа тоже»
- «Протестируй блокировку: при status='generating' кнопки удаления концепции, правки капсулы и удаления связи disabled или отвечают 409, состояние не меняется»
- «Протестируй уборку: `tsc -b packages/shared server client` чистый после удаления пяти функций; grep по client/src не находит их имён»
- «Edge case: удаление чужого синтеза прямым запросом → 403; PATCH чужой капсулы → 403»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 8.4 (2026-09-14) — отступления от буквы запроса и найденное:** → `docs/08-history.md`, глава «Беседа 8.4», подраздел «По факту 8.4 (2026-09-14) — отступления от буквы запроса и найденное».

### Беседа 8.5: Родословная при импорте — сопоставление родителя (бэкенд + клиент)

**Контекст для загрузки:**
- `02-data-model.md` (§2.4 synthesis_lineage — `parent_type`, `parent_synthesis_id`, `position`; текст беседы писал «§2.5» — это sections, поправлено 8.5)
- `03-specification.md` (§2.2 POST /syntheses/import — форма ответа; §2.8 Lineage API; §4.3 коды ошибок)
- `04-code-reuse-map.md`, `05-file-structure.md`
- Из предыдущих бесед:
  - `server/services/import-service.ts` и `client/pages/ImportPage.tsx` (4.3)
  - `server/routes/lineage.ts`, `server/services/lineage-service.ts` (3.1)
  - `client/pages/SynthesisPage.tsx` в части `isMetaSynthesis` и загрузки дерева, `client/components/lineage/GenealogyTree.tsx`, `client/utils/genealogy.ts` (3.2)
  - `client/api/lineage.ts` (3.2), `client/api/client.ts` (ApiErrorCode)
  - `packages/shared/types/lineage.ts`, `packages/shared/types/synthesis.ts`
- `docs/fragments-for-conversations/5-6-ui-kit.md` — блок предложения родителя в ImportPage; новых классов, скорее всего, не потребуется (`.callout`, `.action-btn`), но сверить
- Исходник: НУЖЕН ТОЛЬКО ДЛЯ СПРАВКИ — `reconstructGenealogy` уже портирован в 3.2 (`client/utils/genealogy.ts`); заново не портировать.
- Уточнение 8.5: `POST /syntheses/import` живёт в `server/routes/import.ts` (4.3), а не в `routes/syntheses.ts` — последний в этой беседе не правится; блока «По факту 3.1» в 07 нет (итоги 3.1 — глава 08).

**Грабли из 09, которые беседа заденет заведомо:**
- §1, беседа 0.3 — jsonb не хранит порядок ключей: встроенное состояние файла сравнивать только через `canonical()`
- §3, беседа 6.1 — FK-политика уборки стенда: `synthesis_lineage` ссылается на `syntheses` дважды, сносить в правильном порядке
- §2, беседа 6.2 (п. 2–4) — капитель, «Node is detached», гонка статуса: блок предложения перерисовывается после «Связать»
- §4, беседа 5.4 — прокси vite зашит на :3000
- §4, беседы 6.1 и 6.2 — PG и Redis не переживают паузу между ходами; импорт файла в 1,1 МБ идёт заметное время, прогон в фоне с логом
- §8, беседа 7.1 — «в выводе нет ✗» ложно срабатывает на «0 ✗»

**Первый запрос:**
```
Чиню родословную при импорте.

ДИАГНОЗ, проверенный на живом файле (PS-6933-6RIK, 1,1 МБ, импортирован
на поднятом стенде). import-service.ts:1206 сопоставляет
концепцию-родителя ТОЛЬКО по UUID (p.synthesisId), а файлы, порождённые
одностраничником, UUID не содержат вовсе: в присланном файле 0 вхождений
«synthesisId» и 0 UUID любого вида, в genealogy.participants лежат имя,
метод и вложенное дерево предков. Значит ветка UUID мертва для ВСЕХ
файлов одностраничника и связь генеалогии не создастся никогда.
Следствие: isMetaSynthesis (SynthesisPage, 3.2) считается по числу
родителей-концепций и всегда даёт false — дерево не рисуется, при том
что полное дерево из файла сохранено во встроенном состоянии.

Прикреплены: модель данных (§2.5), спецификация (§2.2, §2.8, §4.3),
import-service, ImportPage, routes/lineage, lineage-service,
SynthesisPage, GenealogyTree, utils/genealogy, api/lineage, api/client,
типы lineage и synthesis.

1. Ветку по UUID СОХРАНИТЬ без изменений: файлы, экспортированные уже из
   сервиса (4.2), UUID несут, и для них она верна. Всё ниже — ветка
   ПОСЛЕ её неудачи.

2. import-service — сопоставление по имени, ПРЕДЛОЖЕНИЕМ, а не молча.
   Искать синтезы ТОГО ЖЕ владельца с совпадающим title; сравнение с
   нормализацией: схлопнуть пробелы, снять кавычки-ёлочки и обычные,
   привести регистр. Найденное отдавать в ответе импорта:
     lineageCandidates: [{ parentName, position,
                           matches: [{ id, title, createdAt }] }]
   Связь при импорте НЕ создавать даже при ЕДИНСТВЕННОМ совпадении: имя
   не идентификатор, у пользователя может лежать две версии одной
   концепции, и тихая привязка к неверной хуже отсутствия привязки.
   Предупреждение lineage переформулировать: сейчас оно говорит «не
   найдена в базе» даже когда совпадение есть.

3. POST /syntheses/:id/lineage/link { parentName, parentSynthesisId }
   (03 §2.8) — создаёт строку synthesis_lineage с
   parent_type='synthesis', position в конец существующих. Заслоны:
   - владелец обоих синтезов — один и тот же пользователь, иначе
     403 FORBIDDEN;
   - :id === parentSynthesisId → 400 LINEAGE_SELF;
   - parentSynthesisId уже среди ПОТОМКОВ :id → 409 LINEAGE_CYCLE.
     Проверять именно потомков, а не предков: цикл создаётся привязкой
     родителя, который сам происходит от нас;
   - такая пара уже есть → 409 (идемпотентный отказ, не дубликат строки).
   Коды LINEAGE_SELF и LINEAGE_CYCLE — в 03 §4.3 и в ApiErrorCode
   (client/api/client.ts).

4. client/api/lineage.ts — linkParent(synthesisId, parentName,
   parentSynthesisId).

5. ImportPage — блок предложения после успешного импорта: «В файле
   указана концепция-родитель „X“. В базе найдено:» со списком
   совпадений (название + дата создания) и кнопками «Связать» /
   «Пропустить» у каждого. Несколько родителей — несколько блоков,
   каждый решается отдельно, отказ от одного не мешает другому.
   Совпадений нет — прежнее предупреждение, но с добавкой, что родителя
   можно импортировать и привязать позже.
   После связывания — переход к синтезу, где дерево уже рисуется.

6. Проверить сквозным прогоном, что после связывания isMetaSynthesis
   становится true и GenealogyTree отрисовывается БЕЗ правок 3.2: если
   правки понадобятся, это отдельная находка — записать в «По факту».

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не искать родителя среди ЧУЖИХ концепций: сопоставление здесь идёт ПО
  ИМЕНИ, а имя не идентификатор — чужая одноимённая концепция даст
  ложную связь. Довод именно в способе сопоставления, а НЕ в том, что
  родословная замкнута на владельца: она уже сегодня пересекает границы
  владения — POST /syntheses принимает чужую доступную концепцию в
  участники мета-синтеза (проверка через loadSynthesisForRead,
  syntheses.ts:523) и пишет строку synthesis_lineage. Явный выбор
  карточки человеком и угадывание по строке — разные вещи;
- не заводить отвязку родителя (DELETE lineage/link): обязанности пока
  нет, и она тянет вопрос о поведении дерева у потомков;
- не трогать одностраничник и формат экспорта: отсутствие UUID в файле —
  свойство исходника, а не дефект сервиса;
- каталог, капсулу и связи не трогать: это беседа 8.4.
```

**Последующие запросы:**
- «Протестируй импорт файла без совпадений: ответ содержит lineageCandidates с parentName и пустым matches; предупреждение говорит о возможности привязать позже; synthesis_lineage содержит только строки philosopher»
- «Протестируй полный путь: импортировать сначала родителя, затем ребёнка → matches с одним совпадением → „Связать“ → строка parent_type='synthesis' → открыть ребёнка: „Генеалогическое древо“ в шапке РИСУЕТСЯ»
- «Протестируй нормализацию имени: родитель в базе назван с двойным пробелом и «в ёлочках» → совпадение найдено; родитель с другим именем → не найдено»
- «Протестируй несколько родителей: файл с двумя концепциями-родителями → два блока; „Связать“ у одного и „Пропустить“ у другого → ровно одна строка synthesis_lineage»
- «Протестируй заслоны: привязать концепцию к самой себе → 400 LINEAGE_SELF; привязать в родители собственного потомка → 409 LINEAGE_CYCLE; повторная привязка той же пары → 409, дубликата нет»
- «Протестируй чужое: привязать в родители концепцию другого пользователя → 403, строка не создана; чужие одноимённые концепции в matches не попадают»
- «Edge case: файл с UUID (экспорт сервиса 4.2) — прежняя ветка работает, связь создаётся при импорте БЕЗ предложения; lineageCandidates пуст»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 8.5 (2026-09-14) — отступления от буквы запроса и найденное:** → `docs/08-history.md`, глава «Беседа 8.5», подраздел «По факту 8.5 (2026-09-14) — отступления от буквы запроса и найденное».

### Беседа 8.6: Модель публичности и гостевой доступ (бэкенд)

**Контекст для загрузки:**
- `02-data-model.md` (§2.3 syntheses — `is_public` заменяется тремя осями; §2.4 synthesis_lineage; текст писал §2.4/§2.5 — адреса сдвинуты на один, поправлено 8.5)
- `03-specification.md` (§2.2 Syntheses API, §2.8 Lineage, §2.10 Billing — `GET /plans`, §2.12 логи, §4.3 коды ошибок)
- `04-code-reuse-map.md`, `05-file-structure.md`
- Из предыдущих бесед:
  - `server/routes/syntheses.ts` (1.6; `loadSynthesisForRead` — строка 177, участники мета-синтеза — 523), `server/routes/logs.ts` (2.4), `server/routes/export.ts` (4.2), `server/routes/elements.ts`, `sections.ts`, `modes.ts`, `transforms.ts`, `enrichment.ts`, `lineage.ts` — все потребители `loadSynthesisForRead`
  - `server/middleware/auth.ts` (0.2), `server/routes/billing.ts` (6.1)
  - `server/db/schema.ts` + миграции 0000–0004, `server/integration-check.mts`
  - `packages/shared/types/synthesis.ts` (`SynthesisFull`, `SynthesisPreview`)
- Исходник: НЕ НУЖЕН (в одностраничнике публикации нет вовсе)
- Дизайн-набор: НЕ НУЖЕН (беседа серверная)

**Грабли из 09, которые беседа заденет заведомо:**
- §3, беседа 7.1 — `drizzle-kit generate` даёт СЛУЧАЙНЫЙ тег миграции: переименовать файл И тег в `meta/_journal.json` (0005 — первая операция беседы)
- §3, беседа 0.2 — pg-код ошибки в `err.cause.code`, не в `err.code`
- §3, беседа 6.1 — FK-политика уборки стенда: `synthesis_lineage` ссылается на `syntheses` дважды
- §1, беседа 0.3 — `tsc --noEmit <файл>` игнорирует tsconfig; `check:integration` с `-w server`
- §4, беседы 6.1 и 6.2 — PG и Redis не переживают паузу между ходами; прогон в фоне с логом
- §8, беседа 7.1 — «в выводе нет ✗» ложно срабатывает на «0 ✗»

**Первый запрос:**
```
Ввожу управляемую публичность вместо булева is_public и пускаю гостя к
публичному — на сервере. Клиент этой беседой не правится.

ИСХОДНОЕ СОСТОЯНИЕ, проверенное по коду. Без авторизации доступны ровно
три пути: /auth/register, /auth/login, /auth/logout. Всё остальное под
requireAuth, включая GET /syntheses/public (строка 1133) и GET
/syntheses/:id (1183). Правило чтения одно на весь транспорт —
loadSynthesisForRead (177): «владелец ИЛИ is_public». На нём стоят
документ, разделы, элементы, режимы, преобразования, обогащение,
родословная, экспорт И ЛОГИ (logs/generation, /context, /formatted,
/prompts). То есть «Опубликовать» сегодня отдаёт всем зарегистрированным
в том числе собранные тексты запросов к модели.

РЕШЕНИЯ, принятые до беседы (не пересматривать):
 - стоимость и токены ЗАРЕГИСТРИРОВАННЫМ показывать нормально и БЕЗ
   ФЛАГА: без чужих цифр человек не сложит представления, во что
   обойдётся его замысел, а число не раскрывает ни строчки текста —
   и totalCostUsd уже сегодня лежит в карточке каталога
   (SynthesisPreview), то есть виден в списке, не открывая документ;
 - ГОСТЮ не показывать стоимость, токены, логи и запросы НИКОГДА,
   независимо от флагов автора. Это потолок, а не настройка;
 - запросы (logs/prompts) зарегистрированным — только если автор открыл:
   единичный просмотр полезен, систематический сбор по многим публичным
   концепциям выносит наружу библиотеку шаблонов, ради которой заведён
   prompt_registry;
 - пригодность к мета-синтезу становится УПРАВЛЯЕМОЙ, но по умолчанию
   разрешена — сегодня она разрешена для всякой публичной концепции, и
   миграция не должна отнимать возможность у существующих;
 - ТРИ ФЛАГА ДЕЙСТВУЮТ ТОЛЬКО НА visibility='full': show_logs,
   show_prompts, allow_meta. На витрине они гасятся. Доводы:
   лог контекста содержит текст, уходивший в модель, — показывать его
   при спрятанном документе значит отдать через чёрный ход то, что
   витрина закрывает; а loadConceptContext (3.1) тянет из участника
   мета-синтеза рёбра графа, диалогическую часть, глоссарий и сводку
   тезисов и подаёт их в генерацию ребёнка — то есть разрешённый
   мета-синтез на витрине даёт машине прочесть спрятанное от человека и
   воспроизвести в порождённой концепции.
   show_author действует на обеих ступенях: имя не раскрывает содержания,
   а витрина без автора теряет смысл.

1. Миграция 0005 + schema.ts — три оси вместо булева флага:
   a. visibility text NOT NULL DEFAULT 'private'
      CHECK (visibility IN ('private','showcase','full')):
      'showcase' — капсула, метаданные, философы, дата; тела разделов и
      элементы НЕ отдаются;
      'full' — произведение целиком.
   b. show_author boolean NOT NULL DEFAULT false
   c. show_logs boolean NOT NULL DEFAULT true (ТОЛЬКО логи
      generation/context/formatted; стоимость и токены флагом не
      управляются — см. решения выше)
   d. show_prompts boolean NOT NULL DEFAULT false
   e. allow_meta boolean NOT NULL DEFAULT true
   f. ПЕРЕНОС ДАННЫХ в той же миграции:
      UPDATE syntheses SET visibility = CASE WHEN is_public THEN 'full'
      ELSE 'private' END; затем DROP COLUMN is_public.
      Два источника правды не оставлять: is_public упоминается в 26
      местах server/, все перевести.
   g. Индекс по visibility (публичный каталог фильтрует по нему).
   Разделы 02 §2.4 и 03 §2.2 переписать под новую модель.
   (Уточнение 8.6: таблица syntheses — 02 §2.3, §2.4 — synthesis_lineage;
   в §2.4 правится только примечание о видимости узлов pruneInvisible.)

2. server/middleware/auth.ts — optionalAuth рядом с requireAuth: читает
   cookie-сессию, если она есть, и НЕ отвечает 401, если её нет; кладёт
   в контекст user | null. requireAuth не трогать.

3. loadSynthesisForRead(id, userId: string | null) — переписать, вернуть
   сверх нынешнего уровень смотрящего:
     { access: 'ok', row, viewer: 'owner' | 'user' | 'guest', scope:
       'full' | 'showcase' }
   Правила:
     - владелец — всегда 'ok'/'owner'/'full';
     - visibility='private' и не владелец → 'forbidden';
     - 'showcase' → 'ok' со scope='showcase';
     - 'full' → 'ok' со scope='full';
     - userId=null даёт viewer='guest'.
   Все нынешние потребители (семь файлов роутов) продолжают работать;
   там, где они требовали requireAuth, гейт не ослаблять — эта беседа
   открывает гостю ровно два пути (п. 5).

4. effectiveFlags(row) — ОДНА функция действенности флагов, все проверки
   только через неё:
     showLogs    = row.showLogs    && row.visibility === 'full'
     showPrompts = row.showPrompts && row.visibility === 'full'
     allowMeta   = row.allowMeta   && row.visibility === 'full'
     showAuthor  = row.showAuthor  (обе неприватные ступени)
   Сырые значения в базе при понижении ступени СОХРАНЯТЬ, не сбрасывать:
   временное понижение не должно стирать настройки, иначе возврат
   заставит расставлять их заново.

5. Отсечение полей по смотрящему — ОДНОЙ функцией, не россыпью по
   роутам (иначе третий забудут): projectSynthesis(row, viewer, flags).
     - guest: totalCostUsd, totalInputTokens, totalOutputTokens — убрать
       из SynthesisFull и SynthesisPreview. Зарегистрированному они
       видны у любой неприватной концепции, флагом не управляются;
     - author: поле authorName появляется ТОЛЬКО при показанном
       show_author (effectiveFlags)
       (сегодня userId не отдаётся вовсе — «флаг, а не userId», 5.2;
       имя берётся из users.display_name, при пустом — не отдавать);
     - scope='showcase': sections, элементы, граф, тезисы, глоссарий не
       отдавать; capsuleHtml, метаданные, философы, даты — отдавать.
   Типы в packages/shared править аккуратно: поля становятся
   необязательными, а не исчезают.
   (По факту 8.6: сделано по букве — cost-поля и sections необязательны;
   единственная правка client/ — DocumentFooter рисует стоимость только при
   определённых значениях: устранение рассогласования типов, не витрина.
   Первая редакция заводила гостевые Omit-типы, посчитав запрет жёстче, чем
   он есть, — снята по обсуждению. isPublic в DTO — производное
   visibility !== 'private' (@deprecated), в PATCH — синоним; иначе
   «Опубликовать» в каталоге сломался бы на живом сервере до 8.7 — а его
   замена на переключатель ступени и есть предмет 8.7.)

6. Гостевые пути — ровно три, все через optionalAuth:
   a. GET /syntheses/public — список; для гостя сортировка и фильтры те
      же, поля урезаны п. 5;
   b. GET /syntheses/:id — документ по правилам п. 3–5;
   c. GET /billing/plans — тарифы без входа (цена службы должна быть
      видна до регистрации). Остальные billing-пути не трогать.
   Больше ничего гостю не открывать: разделы, элементы, режимы,
   преобразования, экспорт остаются под requireAuth. Гостевой просмотр
   'full' отдаёт документ ОДНИМ ответом GET /syntheses/:id — этого
   довольно, дробить транспорт под гостя не нужно.

7. Логи и запросы — гейт по effectiveFlags (routes/logs.ts, все четыре
   пути):
     - viewer='owner' → всегда, при любых флагах и любой ступени;
     - viewer='user' → generation/context/formatted при действенном
       show_logs, иначе 403; prompts при действенном show_prompts,
       иначе 403. На витрине оба гасятся, то есть 403;
     - viewer='guest' → 403 всегда (гостю эти пути и так недоступны,
       но проверку поставить — маршрут может открыться позже).

8. Мета-синтез — POST /syntheses, участники (строка 523): чужая
   концепция годится, только если allow_meta ДЕЙСТВЕНЕН (effectiveFlags,
   то есть visibility='full'); своя — всегда. Концепция-витрина в
   участники не годится никогда.
   Отказ → 403 META_NOT_ALLOWED с названием концепции в details.
   Код в 03 §4.3 и в ApiErrorCode.

9. PATCH /syntheses/:id — принимает visibility и четыре флага вместо
   isPublic; только владелец; значения вне перечисления → 400
   VALIDATION_ERROR с details.visibility.
   Флаг, присланный вместе с витриной, ПРИНИМАТЬ и хранить, а не
   отвергать четырёхсотым: иначе порядок правки станет важен и человек,
   поставивший галочку раньше ступени, получит ошибку на ровном месте.
   Действенность решает effectiveFlags при чтении.

10. Экспорт (routes/export.ts) — под requireAuth, как сейчас; но для
    невладельца: при scope='showcase' → 403; при недейственном show_logs
    убрать из выгрузки лог (стоимость остаётся: она не под флагом).
    Формат файла не менять.
    (По факту 8.6: «стоимость остаётся» было неисполнимо — экспорт 4.2
    потерял футер документа, и стоимость в файле жила только в genLog.
    Восстановлено зеркало DocumentFooter в html-exporter (renderDocFooter):
    итог из строки syntheses, как в исходнике [4202]; из трёх мест
    стоимости в файле (записи лога, итог лога, футер) флаг закрывает
    только лог.)

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не трогать client/ вовсе — витрина и управление публичностью это 8.7;
- не заводить «правку чужой концепции» и роли редакторов: совместная
  работа — отдельная тема с другой моделью (коммиты
  с рассмотрением, слиянием и откатом), а не галочка;
- не дробить публичность по разделам: три ступени человек удержит,
  пятнадцать галочек — нет;
- не открывать гостю генерацию, импорт и правку ни в каком виде.
```

**Последующие запросы:**
- «Протестируй миграцию 0005: на базе с публичными и приватными синтезами → visibility заполнен 'full'/'private' соответственно, is_public снят, allow_meta=true у всех (возможность не отнята)»
- «Протестируй гостя: без cookie GET /syntheses/public → 200, в элементах нет totalCostUsd и токенов; GET /syntheses/:id публичной → 200 без стоимости; GET приватной → 403; GET /billing/plans → 200»
- «Протестируй showcase: visibility='showcase', гость и чужой зарегистрированный получают капсулу и метаданные, sections пуст; владелец получает всё»
- «Протестируй авторство: show_author=false → в ответе нет authorName даже у зарегистрированного; true → имя есть; пустой display_name → поля нет»
- «Протестируй логи: чужой зарегистрированный при show_logs=true получает /logs/context, при false → 403; /logs/prompts при show_prompts=false → 403, при true → 200; владелец получает всё при любых флагах»
- «Протестируй гашение флагов витриной: концепция visibility='showcase' со ВСЕМИ флагами true → чужому 403 на /logs/context и /logs/prompts, в участники мета-синтеза не берётся (403 META_NOT_ALLOWED), authorName при этом отдаётся»
- «Протестируй сохранность флагов: понизить 'full' со всеми флагами до 'showcase' и вернуть обратно → флаги в базе не сброшены, действуют снова»
- «Протестируй PATCH без порядка: прислать show_prompts=true вместе с visibility='showcase' одним запросом → 200, значение сохранено, действие погашено»
- «Протестируй стоимость: зарегистрированный видит totalCostUsd и у витрины, и у публичной, при любых значениях флагов; гость не видит нигде»
- «Протестируй мета-синтез: чужая концепция с allow_meta=true в участниках → синтез создан, строка lineage есть; с allow_meta=false → 403 META_NOT_ALLOWED с названием; своя с allow_meta=false → создаётся (владельцу не запрещено)»
- «Протестируй PATCH: владелец меняет visibility и флаги → отражено; чужой → 403; visibility='mine' → 400 с details.visibility»
- «Протестируй экспорт: невладелец при недейственном show_logs получает файл без лога, но со стоимостью; при scope='showcase' → 403»
- «Edge case: гость на любом пути кроме трёх открытых → 401; cookie просроченной сессии на гостевом пути → трактуется как гость, не 401»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 8.6 (2026-09-15) — отступления от буквы запроса и найденное:** → `docs/08-history.md`, глава «Беседа 8.6», подраздел «По факту 8.6 (2026-09-15) — отступления от буквы запроса и найденное».

### Беседа 8.7: Витрина — стартовая страница и управление публичностью (клиент)

**Контекст для загрузки:**
- `03-specification.md` (§2.2 с правками 8.6, §2.10 `GET /plans`, §4.3)
- `04-code-reuse-map.md`, `05-file-structure.md`
- `docs/fragments-for-conversations/5-6-ui-kit.md` + `.css` + `.html` — беседа вводит НОВЫЕ элементы: стартовая страница, гостевая шапка, управление публичностью в карточке, полоса «режим просмотра»
- Из предыдущих бесед:
  - `client/src/App.tsx` (0.6; `RequireAuth`, редирект `/` → `/catalog`), `client/src/components/layout/Header.tsx` и `Sidebar.tsx` (1.6b), `client/src/stores/auth-store.ts` (0.6)
  - `client/src/pages/CatalogPage.tsx`, `client/src/components/catalog/SynthesisCard.tsx` и `SynthesisList.tsx` (1.6b; строка действий и подтверждения — 8.4)
  - `client/src/pages/SynthesisPage.tsx`, `client/src/components/document/*` (1.6b/5.2/8.4)
  - `client/src/pages/BillingPage.tsx` (6.2) — раздел тарифов как источник разметки для страницы цен
  - `client/src/api/syntheses.ts`, `api/client.ts` (коды ошибок)
  - из 8.6: `optionalAuth`, поля `visibility`/`show_*`/`allow_meta`, `authorName`, `META_NOT_ALLOWED`
- Исходник: НЕ НУЖЕН (публикации в одностраничнике нет); смотреть `client/src/globals.css` и имеющуюся разметку

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседа 6.2 (п. 2–4) — капитель у `.action-btn`; «Node is detached» при клике по перерисованным React-спискам (карточка каталога перерисовывается после смены публичности); статус ставить ПОСЛЕ перечитывания списка
- §2, беседа 6.2 (п. 6) — тесты под `tsx` импортируют `.tsx` без DOM, `import.meta.env` отсутствует
- §4, беседа 5.4 — прокси `client/vite.config.ts` ЗАШИТ на :3000
- §4, беседа 5.2 — teardown `SIGKILL` без группы оставляет `npx vite`; `pkill -9 -f "[t]sx|[v]ite"` убивает и оболочку
- §2, беседа 8.4 — единство стилей проверяется `css-parity`; новые классы заводить блоком, как блок 8.4
- §8, беседа 7.1 — «нет ✗» ложно ловит «0 ✗»

**Первый запрос:**
```
Делаю витрину: гостя встречает рассказ о проекте, а не форма входа.
Сервер готов беседой 8.6 — здесь только клиент.

ИСХОДНОЕ СОСТОЯНИЕ. Маршрут '/' перенаправляет на /catalog, тот под
RequireAuth, RequireAuth уводит на /login. Регистрация — мелкой ссылкой
под формой. Публичную концепцию посмотреть без входа нельзя. Цена
службы до регистрации не видна.

1. LandingPage — новая страница на '/', только для гостя
   (зарегистрированного по-прежнему перенаправлять на /catalog):
   a. что такое PhiloSynth: синтез философских концепций, граф
      категорий, мета-синтез, режимы — коротко и без маркетингового
      тона, языком документа;
   b. ЖИВАЯ витрина: три-четыре карточки из GET /syntheses/public
      (сервер отдаёт их гостю с 8.6), а не выдуманные примеры;
   c. цены: GET /billing/plans, разметку взять из раздела тарифов
      BillingPage (6.2), не изобретать вторую;
   d. КРУПНАЯ кнопка «Создать аккаунт» в теле страницы. НЕ прятать
      единственное действие гостя в угол шапки — место в правом верхнем
      углу уже показало свою незаметность (кабинет по имени
      пользователя там не находят).

2. Шапка для гостя — пара ссылок «Войти · Регистрация» текстом справа,
   на месте имени пользователя. Боковое меню гостю не показывать вовсе:
   все его пункты под RequireAuth.

3. Гостевые маршруты в App.tsx: '/' (LandingPage), '/explore' (публичный
   каталог), '/synthesis/:id' (документ). Последний УЖЕ существует под
   RequireAuth — вынести из-под него и решать доступ по ответу сервера:
   403 → страница «концепция приватна» со ссылкой на вход, 404 →
   NotFound. Гость на любом другом маршруте — редирект на '/'.
   <!-- 8.7, запрос 1 (2026-09-15): трактовка. «404 → NotFound» — ответ
        сервера на несуществующий id рисуется страницей 404 ВНУТРИ
        Layout (PageError 1.6b), как и 403; маршрут «*» гостю — редирект
        на «/» (правило «любой другой маршрут»), вошедшему — NotFoundPage.
        RequireAuth уводит гостя на «/» (не на /login) со state.from —
        LandingPage передаёт его в «Войти», LoginPage возвращает как
        прежде. -->

4. Режим просмотра в документе. Сейчас страница рассчитана только на
   своего: гейты правок стоят по isOwner (5.2), но гостя не было вовсе.
   a. полоса вверху документа: «Вы смотрите публичную концепцию» +
      кнопка «Создать аккаунт» (гостю) / ничего (зарегистрированному);
      <!-- 8.7, запрос 1: «ничего» — о кнопке; полоса рисуется всякому
           невладельцу (и зарегистрированному), у неё же — ступень и
           authorName. -->
   b. при scope='showcase' — капсула и метаданные, дальше врезка
      «Автор открыл только витрину»; вкладок разделов, графа и тезисов
      не показывать;
   c. отсутствующие у гостя поля (стоимость, токены) не показывать
      вовсе, а не рисовать нулями — их в ответе НЕТ;
   d. кнопки логов и запросов прятать, когда сервер отвечает 403, а не
      показывать неработающие.

5. Управление публичностью в карточке каталога — вместо нынешней
   кнопки «Опубликовать/Скрыть» (8.4):
   a. три ступени переключателем: Приватная · Витрина · Публичная;
   b. галочки по ступеням: на ВИТРИНЕ — только «показывать авторство»;
      на ПУБЛИЧНОЙ — она же плюс «показывать логи», «показывать запросы
      к модели», «разрешить брать в мета-синтез». Три последние на
      витрине ПРЯТАТЬ, а не показывать неработающими, и одной строкой
      объяснять, что на витрине они не применяются. Сохранённые значения
      при этом не сбрасывать (сервер их хранит) — вернув «Публичную»,
      человек получает прежние галочки;
      стоимость и токены галочкой НЕ управляются: их видит любой
      зарегистрированный, гость — никогда;
   c. галочки уезжают одним PATCH со ступенью, отдельных запросов не
      плодить;
      <!-- 8.7, запрос 1: сырых флагов в SynthesisPreview нет (03 §2.2) —
           черновик панели заполняется GET /syntheses/:id при открытии;
           сервер не правился (решаемо клиентом одним чтением). -->
   d. подпись под переключателем, объясняющая словами, что увидит
      посторонний — иначе человек не сможет ответить на этот вопрос сам.

6. Мета-синтез: при 403 META_NOT_ALLOWED в форме создания показать
   название концепции и причину («автор не разрешил»), а не общий текст
   ошибки.

7. Новые классы — блоком «8.7» в globals.css, палитра закрытая
   (UI-кит), после правки прогнать css-parity.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не править сервер: всё готово беседой 8.6, при нехватке — строка в
  §12 с адресатом, а не правка походя;
- не заводить гостю ничего, кроме чтения: ни импорта, ни экспорта, ни
  генерации, ни правки;
- не делать «публичность по разделам»;
- не переписывать LoginPage и RegisterPage сверх ссылки «на главную».
```

**Последующие запросы:**
- «Протестируй гостя в браузере: открыть '/' без cookie → стартовая страница с карточками из публичного каталога и ценами; кнопка «Создать аккаунт» в теле ведёт на /register»
- «Протестируй, что зарегистрированный на '/' по-прежнему попадает в /catalog»
- «Протестируй гостевой просмотр: перейти по карточке → документ виден, полосы «вы смотрите публичную концепцию» есть, стоимости и токенов НЕТ на странице, кнопок логов и запросов нет»
- «Протестируй showcase глазами гостя: капсула и метаданные видны, вкладок разделов и графа нет, врезка объясняет почему»
- «Протестируй приватную по прямой ссылке: гость получает страницу «концепция приватна» со ссылкой на вход, не пустой экран и не NotFound»
- «Протестируй управление публичностью: переключить карточку в «Публичная», снять «показывать логи» → один PATCH, список перечитан, подпись под переключателем изменилась; открыть ту же концепцию из другой учётной записи → логи недоступны»
- «Протестируй ступени галочек: на «Витрине» видна только «показывать авторство» и строка-пояснение; переключение на «Публичную» возвращает три спрятанные галочки с прежними значениями, а не со сброшенными»
- «Протестируй мета-синтез: выбрать чужую концепцию с запретом → сообщение с её названием и причиной; разрешённую → синтез создаётся»
- «Протестируй шапку: у гостя «Войти · Регистрация» и нет бокового меню; после входа — имя и меню»
- «Edge case: сессия истекла на открытом документе → страница не падает, полоса меняется на гостевую»
- «Прогони css-parity после добавления блока 8.7: расхождений 0»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 8.7 (2026-09-15) — отступления от буквы запроса и найденное:** → `docs/08-history.md`, глава «Беседа 8.7», подраздел «По факту 8.7 (2026-09-15) — отступления от буквы запроса и найденное».

### Фаза 9 (добавлена 2026-09-19): самостоятельность пользователя

> Заведена не по реестру §12 — он пуст. Повод: две проверки исходного
> состояния, каждая по прямому вопросу. Обе нашли не дефект работающего,
> а отсутствие целого пути, которого ни одна беседа не касалась.
>
> Общее у двух бесед — род тупика. Сегодня забывший пароль выходит из
> него только через владельца с доступом к машине, а нашедший опечатку
> в своей концепции — только через перегенерацию, то есть заплатив и
> получив другой текст вместо исправленного. Фаза убирает оба обхода.
>
> Нумерация §9–12 сохранена, как при заведении Фаз 7 и 8.
>
> **9.1 ЗАКРЫТА 2026-09-19** (почта: подтверждение адреса и сброс пароля;
> «По факту 9.1» ниже). Забывший пароль возвращается в службу сам. Осталась
> 9.2 — она от 9.1 не зависит.
>
> **9.2 ЗАКРЫТА 2026-09-20** (ручная правка подраздела; «По факту 9.2» ниже).
> Нашедший опечатку чинит её сам, не платя за перегенерацию. По решению
> пользователя правится РАЗМЕТКА подраздела, а не голый текст. Фаза 9
> закрыта целиком; открытым остался обратный путь: истории версий раздела
> в интерфейсе нет (п.14) — испорченный подраздел возвращается только по API.

---

### Беседа 9.1: Почта — подтверждение адреса и сброс пароля (бэкенд + клиент)

**Контекст для загрузки:**
- `02-data-model.md` (§2.1 users — колонка подтверждения; две новые таблицы заводятся этой беседой)
- `03-specification.md` (§1.1 — требование A2a, числится за Фазой 3 и не сделано; §2.1 Auth API; §4.3 коды ошибок)
- `04-code-reuse-map.md`, `05-file-structure.md`
- Из предыдущих бесед: `server/routes/auth.ts` и `server/middleware/auth.ts` (0.2/0.5/0.6/7.1/8.1 — `hashPassword`, `PASSWORD_MIN_LENGTH` в `packages/shared/constants/auth.ts`), `server/services/admin-audit.ts` (8.1 — образец записи в той же транзакции, что и действие), `server/db/schema.ts` + миграции 0000–0005, `server/index.ts` (монтирование, `rateLimiter`, прогрев кэша реестра промптов как образец фонового запуска), `scripts/seed/bootstrap-admin.ts` и `scripts/seed/reset-password.ts`, `client/src/pages/LoginPage.tsx`, `RegisterPage.tsx`, `ProfilePage.tsx`, `client/src/components/layout/Header.tsx`, `client/src/stores/auth-store.ts`, `client/src/api/client.ts`
- `docs/fragments-for-conversations/5-6-ui-kit.md` — две страницы и полоса-напоминание в шапке; новых классов, скорее всего, не потребуется
- Исходник: НЕ НУЖЕН (одностраничник живёт в браузере, учётных записей и почты в нём нет)

**Грабли из 09, которые беседа заденет заведомо:**
- §3, беседа 7.1 — `drizzle-kit generate` даёт СЛУЧАЙНЫЙ тег миграции: переименовать файл И тег в `meta/_journal.json`
- §3, беседа 0.2 — pg-код ошибки в `err.cause.code` (`DrizzleQueryError`), не в `err.code`
- §5, беседа 6.1 — `env` читается ОДИН раз при импорте: переменные SMTP задавать до импорта модулей
- §2, беседа 6.2 (п. 2–4) — капитель, «Node is detached», гонка статуса
- §4, беседа 5.4 — прокси vite зашит на :3000
- §8, беседа 7.1 — «в выводе нет ✗» ложно ловит «0 ✗»

**Первый запрос:**
```
Завожу почту. Сейчас её нет НИ В КАКОМ ВИДЕ: ни nodemailer, ни SMTP, ни
отправки, ни очереди, ни таблиц подтверждения адреса; почтовых пакетов
в зависимостях ноль. Адрес используется только как логин. В
спецификации это числится отложенным требованием A2a «Сброс пароля по
email — Фаза 3», но Фазой 3 был мета-синтез, и почта туда не попала.

ЧЕМ ЭТО ПЛОХО СЕЙЧАС. Регистрация открытая. Человек, забывший пароль,
не может вернуться в службу никак: обратиться некуда, потому что и
обращаться нечем. Сброс сегодня возможен только у того, кто имеет
доступ к машине (scripts/seed/reset-password.ts), то есть у владельца.
Адрес при регистрации не подтверждается, значит может быть опечаткой
или чужим — и тогда сброс не поможет даже после починки.

Прикреплены: модель данных (§2.1), спецификация (§1.1, §2.1, §4.3),
routes/auth.ts, middleware/auth.ts, admin-audit.ts, schema.ts +
миграции 0000–0005, index.ts, bootstrap-admin.ts, reset-password.ts,
LoginPage, RegisterPage, ProfilePage, Header, auth-store, api/client.

1. Зависимость nodemailer + переменные окружения в env.ts и
   .env.example: MAIL_TRANSPORT ('smtp' | 'console'), SMTP_HOST,
   SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE, MAIL_FROM,
   PUBLIC_BASE_URL (для ссылок в письмах).
   MAIL_TRANSPORT='console' печатает письмо в вывод вместо отправки —
   стенд и разработка обязаны работать БЕЗ почтового узла, тем же
   приёмом, каким tools/stripe-mock.mjs (8.2) снимает нужду в аккаунте
   Stripe. Умолчание вне production — 'console'; в production пустой
   SMTP_HOST → отказ при запуске, а не молчаливая потеря писем.

2. Миграция 0006 + schema.ts:
   a. users.email_verified_at timestamptz NULL;
   b. auth_tokens: id uuid pk, user_id uuid → users ON DELETE CASCADE,
      purpose text CHECK (purpose IN ('email_verify','password_reset')),
      token_hash text NOT NULL, expires_at timestamptz NOT NULL,
      used_at timestamptz NULL, created_at timestamptz DEFAULT now();
      индексы по (user_id, purpose) и token_hash.
      В базе лежит ХЭШ (sha256), а не сам довод: утечка таблицы не
      должна давать вход. Выдача нового токена того же назначения
      помечает прежние использованными — иначе старая ссылка из почты
      останется рабочей;
   c. mail_outbox: id uuid pk, to_email text, subject text, body_text
      text, body_html text, status text ('pending'|'sent'|'failed'),
      attempts integer DEFAULT 0, last_error text NULL, next_attempt_at
      timestamptz, created_at, sent_at NULL; индекс по
      (status, next_attempt_at).
   Разделы в 02 §2.1 и §2.30–2.31.

3. server/services/mail/ — четыре модуля с разделением обязанностей:
   a. transport.ts — только отправка (nodemailer либо вывод в консоль),
      о содержании писем не знает ничего;
   b. templates.ts — два письма, текст и HTML: подтверждение адреса и
      сброс пароля. Тон — как у документов службы, без рекламного;
   c. outbox.ts — enqueue(tx, letter): запись В ПЕРЕДАННОЙ транзакции,
      чтобы падение почты не отменяло уже совершённое действие, а откат
      действия не оставлял письмо в очереди;
   d. worker.ts — разбор очереди с ДВУМЯ РОДАМИ ОТКАЗА:
      * ПОСТОЯННЫЙ (5xx SMTP, негодный адрес) → status='failed',
        last_error, больше не пробовать;
      * ВРЕМЕННЫЙ (4xx, сеть, таймаут) → attempts+1, next_attempt_at с
        растущей задержкой (1 мин, 5, 15, 60, 6 ч), после шестой
        попытки → 'failed'.
      Довод за разделение: регистрация открытая, значит опечатка в
      адресе или бот дают постоянный отказ. Если повторять и такие
      письма, счётчик неотправленных забьётся мёртвыми — а он
      единственный признак того, что работник отстал.
      Запуск работника — интервалом из index.ts, как прогрев кэша
      реестра промптов; остановка по SIGTERM.

4. Маршруты (routes/auth.ts), все под rateLimiter:
   a. POST /auth/email/verify/request — повторная отправка себе
      (requireAuth); если адрес уже подтверждён → 200 без письма;
   b. POST /auth/email/verify/confirm { token } — подтверждает адрес,
      помечает токен использованным; просроченный или использованный →
      400 TOKEN_INVALID (одним кодом на оба случая: подсказывать, какая
      именно беда, незачем);
   c. POST /auth/password-reset/request { email } — БЕЗ авторизации.
      Отвечает 200 с ОДИНАКОВЫМ текстом независимо от того, есть такой
      адрес или нет: иначе форма становится прибором для проверки, кто
      зарегистрирован в службе;
   d. POST /auth/password-reset/confirm { token, newPassword } —
      проверка пароля та же, что при регистрации (PASSWORD_MIN_LENGTH
      из packages/shared/constants/auth.ts, второго свода правил не
      заводить); при успехе — смена пароля И ЗАВЕРШЕНИЕ ВСЕХ СЕССИЙ
      пользователя (как делает смена пароля в профиле, 0.6);
   e. при регистрации (POST /auth/register) — постановка письма с
      подтверждением в очередь В ТОЙ ЖЕ транзакции, что и создание
      пользователя.
   Срок жизни: подтверждение адреса 72 ч, сброс пароля 1 ч.

5. Вход НЕ ЗАПРЕЩАТЬ при неподтверждённом адресе. Довод: у всех
   нынешних пользователей email_verified_at пуст, и запрет вышвырнул бы
   их всех разом. Подтверждение пока НЕ ограничивает ничего — только
   отмечается; решение о том, что им закрывать, отдельное и не этой
   беседы.

6. Клиент:
   a. /reset-password — форма с адресом, всегда один и тот же ответ;
   b. /reset-password/:token — новый пароль, после успеха — на /login с
      пояснением, что прочие сессии завершены;
   c. /verify-email/:token — подтверждение, затем в каталог;
   d. ссылка «Забыли пароль?» на LoginPage рядом со ссылкой на
      регистрацию;
   e. полоса в шапке для вошедшего с неподтверждённым адресом:
      «Адрес не подтверждён» + «Отправить письмо ещё раз», с защитой от
      повторного нажатия.
   Первые три маршрута гостевые, «отправить ещё раз» — под входом.

7. README — раздел «Почта»: переменные, режим 'console' для стенда и
   отдельной строкой, что SPF, DKIM и DMARC для домена настраивает
   владелец службы; без них письма уйдут в спам, и это не дефект кода.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не заводить настройки уведомлений, дайджесты и заголовок
  List-Unsubscribe: оба письма ОПЕРАЦИОННЫЕ — ответ на действие самого
  пользователя, а отписка нужна рассылкам, которых в службе нет;
- не заводить письма о платежах: Stripe шлёт свои чеки сам;
- не запрещать вход и не ограничивать ничего неподтверждённым адресом;
- не удалять scripts/seed/reset-password.ts: он остаётся запасным
  ходом владельца на случай, когда почта не настроена.
```

**Последующие запросы:**
- «Протестируй режим console: MAIL_TRANSPORT='console', регистрация → в выводе письмо со ссылкой, в mail_outbox строка 'sent'; переход по ссылке → email_verified_at заполнен»
- «Протестируй сброс: запрос на существующий адрес и на несуществующий → ОДИНАКОВЫЙ ответ 200 и одинаковый текст; письмо ушло только в первом случае»
- «Протестируй смену: переход по ссылке → новый пароль → вход старым не работает, новым работает; прочие сессии завершены (вторая cookie той же учётной записи получает 401)»
- «Протестируй однократность: повторный переход по той же ссылке → 400 TOKEN_INVALID; ссылка, выданная раньше новой, → 400 (прежние помечены использованными)»
- «Протестируй срок: токен сброса с истёкшим expires_at → 400 TOKEN_INVALID»
- «Протестируй два рода отказа: мок SMTP отвечает 550 → строка 'failed' с последней ошибкой, повторов нет; мок отвечает 451 → attempts растёт, next_attempt_at сдвигается, после шестой попытки 'failed'»
- «Протестируй транзакционность: сбой постановки письма не отменяет регистрацию, откат регистрации не оставляет письмо в очереди»
- «Протестируй пароль: newPassword короче минимума → 400 VALIDATION_ERROR с details.newPassword, тем же текстом, что при регистрации»
- «Протестируй клиент в браузере: «Забыли пароль?» → форма → письмо в выводе → переход по ссылке → новый пароль → вход; полоса «адрес не подтверждён» видна до подтверждения и исчезает после»
- «Edge case: production с пустым SMTP_HOST → сервер отказывается стартовать с внятным сообщением, а не запускается и молча теряет письма»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 9.1 (2026-09-19) — отступления от буквы запроса и найденное:** → `docs/08-history.md`, глава «Беседа 9.1», подраздел «По факту 9.1 (2026-09-19) — отступления от буквы запроса и найденное».

### Беседа 9.2: Ручная правка текста подраздела (бэкенд + клиент)

**Контекст для загрузки:**
- `02-data-model.md` (§2.5 sections — `html_content`, `is_edited`; §2.12 element_versions)
- `03-specification.md` (§2.3 разделы — сегодня только три GET; §2.4 элементы — образец `PATCH /:id/capsule`; §4.3 коды ошибок)
- `04-code-reuse-map.md`, `05-file-structure.md`
- Из предыдущих бесед:
  - `server/routes/sections.ts` (1.6), `server/routes/elements.ts` (5.1)
  - `server/services/element-editor.ts` (5.1; **`updateCapsule` — прямой образец**, строки 1245–1281), `server/services/element-versioning.ts` (5.1), `server/services/element-renderer.ts` (5.1; `TABLE_SUBSECTIONS`, `locatorsFor`, `RenderableTable`)
  - `server/services/generation-service.ts` (1.3/2.2; **`findSubsection`, `extractSubsectionContent`, `spliceSubsectionHtml`** — готовые приборы поиска и врезки подраздела)
  - `client/src/components/document/*` и `client/src/utils/capsule-html.ts` (8.4 — правка капсулы по месту, текстом, а не сырым HTML), `client/src/components/edit/EditSectionCard.tsx` (2.3 — пометка «⟳» у изменённого раздела), `client/src/api/elements.ts`, `client/src/stores/synthesis-store.ts`
- `docs/fragments-for-conversations/5-6-ui-kit.md` — карандаш у заголовка подраздела и правка по месту
- Исходник: НЕ НУЖЕН (правка по месту — свойство службы, в одностраничнике её нет)

**Грабли из 09, которые беседа заденет заведомо:**
- §1, беседа 0.3 — jsonb не хранит порядок ключей: снимки версий сравнивать через `canonical()`
- §2, беседа 6.2 (п. 2–4) — капитель; «Node is detached» при клике по перерисованному документу; статус после перечитывания
- §2, беседа 8.4 — единство стилей проверяется `css-parity`; новые классы — отдельным блоком
- §4, беседа 5.4 — прокси vite зашит на :3000
- §4, беседа 5.2 — teardown `SIGKILL` без группы оставляет `npx vite`
- §8, беседа 7.1 — «нет ✗» ложно ловит «0 ✗»

**Первый запрос:**
```
Открываю ручную правку текста. Сегодня править можно ПЯТЬ видов
элементов (категория, связь, тезис, термин глоссария, капсула) — и
больше ничего: у routes/sections.ts три маршрута, и все GET. Значит
опечатка в прозе чинится только перегенерацией: за деньги и с другим
текстом вместо исправленного.

ЕДИНИЦА ПРАВКИ — ПОДРАЗДЕЛ, И ТОЛЬКО ОН. Тело раздела целиком не
правится ни одним маршрутом. Довод: разметка раздела несущая. Подраздел
опознаётся по data-section, и по этому же признаку его находят
перегенерация подраздела (2.2), планы правок с адресом
«sectionKey:subsectionName» (2.1), сборка контекста для следующих
генераций, врезка отрисованных таблиц (5.1) и экстракторы импорта и
экспорта (4.2/4.3). Правка тела целиком позволила бы переименовать
подраздел или удалить его — и всё перечисленное перестало бы его
находить, молча и не сразу. Поэтому правится СОДЕРЖИМОЕ подраздела, а
обёртка, якорь data-section и заголовок <h4> не трогаются — ровно так
уже устроена правка капсулы (8.4, client/src/utils/capsule-html.ts).

ЧТО УЖЕ ГОТОВО и переиспользуется целиком:
 - "section" ЕСТЬ в VersionedElementType (5.1) — слот версионирования
   разделов заведён и до сих пор использовался только капсулой;
 - updateCapsule (element-editor.ts:1245) делает РОВНО нужное для одного
   подраздела: createVersion(..., "section", снимок, "manual", tx),
   запись html_content и is_edited=true, всё в одной транзакции. Это
   образец, писать заново не надо — обобщить;
 - findSubsection, extractSubsectionContent и spliceSubsectionHtml
   (generation-service.ts:2128 и далее) уже умеют находить подраздел по
   data-section и вставлять новое содержимое обратно в HTML раздела;
   ими же пользуется перегенерация подраздела;
 - на клиенте utils/capsule-html.ts (8.4) показывает ТЕКСТ и собирает
   HTML обратно: править сырой HTML читателю философского документа
   незачем.

Прикреплены: модель данных (§2.5, §2.12), спецификация (§2.3, §2.4,
§4.3), routes/sections.ts, routes/elements.ts, element-editor.ts,
element-versioning.ts, element-renderer.ts, generation-service.ts,
компоненты документа, utils/capsule-html.ts, EditSectionCard,
api/elements.ts, synthesis-store.ts.

1. server/services/element-editor.ts — updateSubsection(synthesisId,
   sectionKey, subsectionName, text) по образцу updateCapsule: находит
   раздел, находит подраздел (findSubsection), врезает новое содержимое
   (spliceSubsectionHtml), пишет версию "section" с источником "manual"
   и снимком ДО правки, ставит is_edited=true — всё в одной транзакции.

2. ЗАСЛОН ТАБЛИЧНЫХ ПОДРАЗДЕЛОВ — главное правило беседы, и он
   ВЫЧИСЛЯЕТСЯ, а не перечисляется списком имён.
   Часть подразделов не текст, а рисунок таблиц из своих таблиц БД
   (categories, edges, theses, glossary_terms). Ручная правка там
   рассинхронизирует документ: следующий же рендер элемента затрёт
   правку, и человек решит, что служба теряет его работу.
   Но перечислять TABLE_SUBSECTIONS именами НЕЛЬЗЯ, и вот почему,
   проверено на живом документе: «Топология графа» в этом списке есть,
   однако она ЗАПАСНОЙ локатор — таблица лежит в «Топологической
   таблице», а сама «Топология графа» чистая проза и должна правиться.
   Обратный случай: раздел critique — сплошная проза, в которой восемь
   таблиц, поставленных моделью для наглядности; запрет «есть <table> →
   нельзя» запер бы почти весь раздел.
   Поэтому: для каждой из пяти RenderableTable разрешить locatorsFor
   ПРОТИВ ТЕКУЩЕГО HTML этого синтеза и запереть ровно те подразделы,
   в которые локатор попал. Список получается свой у каждой концепции и
   не расходится с рендером по построению.
   Правка запертого подраздела → 409 SECTION_TABLE_LOCKED, и отказ
   обязан сказать, ЧЕМ его править: карандаш в строке таблицы (5.2) или
   панель узла графа (5.4).
   Подраздел «Капсула» → 409 с указанием на PATCH /:id/capsule: у
   капсулы свой путь с 5.1, двух источников правды не заводить.

3. Маршрут (routes/sections.ts, requireAuth + владелец):
   PATCH /syntheses/:id/sections/:key/subsections/:name  { text }
   Отказы: чужой → 403; status='generating' → 409
   GENERATION_IN_PROGRESS; неизвестный ключ раздела → 404; подраздел не
   найден → 404 СО СПИСКОМ имеющихся data-section (иначе искать нечем).
   Код SECTION_TABLE_LOCKED — в 03 §4.3 и в ApiErrorCode.
   Маршрута на тело раздела целиком НЕТ — см. довод выше.

4. Клиент:
   a. карандаш у заголовка подраздела (тот же .inline-edit-btn, что в
      строках таблиц с 5.2) — только владельцу и только у незапертых;
   b. правка по месту в textarea ТЕКСТОМ, сборка HTML на клиенте по
      образцу capsule-html.ts (абзацы по пустой строке); заголовок и
      обёртка data-section не трогаются;
   c. «Сохранить» / «Отмена», Esc отменяет; после успеха — перечитать
      документ, показать пометку «⟳» у раздела (она уже есть в
      EditSectionCard с 2.3);
   d. у запертых подразделов карандаша НЕ показывать вовсе (не
      показывать неработающим — правило 8.7).

5. Проверить и записать в «По факту»: попадает ли ручная правка
   подраздела в историю версий, которую показывает VersionHistory
   (5.2), и откатывается ли она оттуда. Слот "section" в типах есть, но
   пользовался им до сих пор только updateCapsule — если панель
   разделы не показывает, это НАХОДКА, а не задание: записать, не
   чинить молча.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не заводить маршрут на тело раздела целиком ни под каким видом;
- не заводить визуальный редактор и разметку: правка — простой текст,
  абзацы по пустой строке, как у капсулы;
- не трогать перегенерацию и каскад: ручная правка ставит is_edited, и
  дальше всё работает как раньше;
- не разрешать правку запертых подразделов «с последующей
  синхронизацией»: разбор таблицы обратно в элементы — отдельная задача
  с собственной ценой ошибки;
- не открывать правку чужих концепций: владелец, и только он.
```

**Последующие запросы:**
- «Протестируй правку: карандаш у незапертого подраздела → правка → сохранение → в документе новый текст, у раздела появилась пометка ⟳, в element_versions строка типа section с источником manual и снимком ДО правки»
- «Протестируй сохранность обёртки: после правки подраздел находится по тому же data-section, заголовок <h4> на месте, якорь subsec-* цел; экспорт HTML (4.2) собирается, импорт получившегося файла (4.3) находит те же разделы и подразделы»
- «Протестируй вычисляемый заслон на живой концепции: в разделе graph заперты «Таблица категорий», «Таблица связей» и «Топологическая таблица», а «Топология графа» и «Методология построения графа» правятся; в theses заперта только «Сводная таблица тезисов»; в glossary — только «Таблица определений»»
- «Протестируй обратный случай: в разделе critique, где таблиц восемь и все прозаические, не заперт НИ ОДИН подраздел»
- «Протестируй отказ: PATCH запертого подраздела → 409 SECTION_TABLE_LOCKED с подсказкой, чем править; карандаша у него в интерфейсе нет»
- «Протестируй капсулу: PATCH подраздела «Капсула» → 409 с указанием на /capsule; сам /capsule продолжает работать как в 8.4»
- «Протестируй права и состояние: чужой → 403; во время генерации → 409 GENERATION_IN_PROGRESS; несуществующий подраздел → 404 со списком имеющихся»
- «Протестируй историю версий: открыть VersionHistory после ручной правки — видна ли версия и работает ли откат; если нет — записать находку, не чинить молча»
- «Прогони css-parity после добавления блока 9.2: расхождений 0»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 9.2 (2026-09-20) — отступления от буквы запроса и найденное:** → `docs/08-history.md`, глава «Беседа 9.2», подраздел «По факту 9.2 (2026-09-20) — отступления от буквы запроса и найденное».

### Фаза 10 (добавлена 2026-09-20): реализация критики

> Заведена не по реестру §12 — он пуст. Повод: у документа есть раздел,
> который говорит, что в нём поправить, и нет ничего, что бы это
> исполняло. Рекомендации читаются глазами и переносятся в правку
> вручную, а адрес рекомендации («§ Граф → Таблица категорий,
> категория „Индивидуация-как-практика“») человек отыскивает сам.
>
> **Проверено на живой концепции** (одностраничник, 11 разделов, 56
> подразделов): все рекомендации (их СЕМЬ — беседа 10.1 пересчитала; в
> первой редакции врезки стояло «пять») имеют одну и ту же тройную форму —
> адрес, операция, довод со ссылкой на подраздел критики, где проблема
> установлена. Одна содержит ГОТОВУЮ замену дословно, одна — развилку
> «устранить ИЛИ переопределить». То есть материал для машины уже
> порождается; не хватает контракта и разбора.
>
> Фаза целиком опирается на сделанное: планы правок (2.1), исполнитель
> и каскад (2.2), панель каскада (2.3), правка элементов (5.1/5.2),
> точечная генерация в элемент (прецедент — обогащение 5.3), вычисляемый
> замок подразделов (9.2).
>
> **Состояние на 2026-09-21:** 10.1 (контракт и разбор) и 10.2 (исполнение:
> два шага мельче раздела, постановка плана поштучно, раунд в работе,
> устаревание, бесплатный слот) закрыты. Осталась 10.3 — панель.
>
> **ФАЗА ЗАКРЫТА 2026-09-22 беседой 10.3** (панель рекомендаций: поштучный
> выбор, пометки стоимости, развилка, негодные с правкой 9.2, ретрофит,
> оценка по шагам, выбор поля элемента — с одной разрешённой правкой сервера,
> передача плана EditModal 2.3; входа «исполнить все» нет). Три долга 10.2
> закрыты; серверная находка о метках тезисов — §12 без адресата.

---

### Беседа 10.1: Контракт рекомендаций и разбор (бэкенд + промпты)

**Контекст для загрузки:**
- `02-data-model.md` (§2.5 sections, §2.17 prompt_templates и §2.18 synthesis_configs — номера исправлены 10.1; новая таблица заводится этой беседой — §2.32)
- `03-specification.md` (§2.3 разделы, §2.9 Prompt Registry, §4.3 коды ошибок)
- `04-code-reuse-map.md`, `05-file-structure.md`
- Из предыдущих бесед:
  - `scripts/seed/seed-prompts.ts` и `seed-configs.ts` (0.3/0.3b — где живут шаблоны и карты подразделов)
  - `server/services/prompt-registry.ts` (0.3), `server/services/context-extractor.ts` (1.3 — `tableToText`, `extractAllTablesAsText`, чтение `table.doc-table`)
  - `server/utils/html-parser.ts` (9.2 — разбор фрагмента, снятие непарных тегов)
  - `server/services/element-renderer.ts` (5.1/9.2 — `locatorsFor`, `locateDocTableHost`, `lockedSubsectionsOf`)
  - `server/services/generation-service.ts` (1.3/2.2 — `findSubsection`, `extractSubsectionContent`)
  - `server/db/schema.ts` + миграции 0000–0006, `server/routes/sections.ts` (1.6/9.2)
- Исходник `source/philosynth.html` — ТОЛЬКО для сверки: как одностраничник формулирует рекомендации сегодня; портировать нечего, инструмента там нет
- Дизайн-набор: НЕ НУЖЕН (беседа серверная)

**Грабли из 09, которые беседа заденет заведомо:**
- §3, беседа 7.1 — `drizzle-kit generate` даёт СЛУЧАЙНЫЙ тег миграции: переименовать файл И тег в `meta/_journal.json`
- §1, беседа 0.3 — jsonb не хранит порядок ключей: конфиги реестра сравнивать через `canonical()`
- §3, беседа 0.3b — сиды идемпотентны (created/updated/skip/fail); активация версии сбрасывает кэш реестра
- §8, беседа 6.1 — `*/` внутри блочного комментария TS закрывает его
- §4, беседы 6.1 и 6.2 — PG и Redis не переживают паузу между ходами; прогон в фоне с логом
- §8, беседа 7.1 — «в выводе нет ✗» ложно ловит «0 ✗»

**Первый запрос:**
```
Ввожу машиночитаемый контракт рекомендаций критики.

ИСХОДНОЕ СОСТОЯНИЕ. Шаблон section.critique.sub.recommendations — одна
строка: «Конкретные, операционализируемые шаги для усиления концепции.
Не общие пожелания, а точечные действия». Ни формата, ни адресации, ни
проверяемости. При этом в проекте есть отработанный приём: шаблон
section.graph.sub.topology_table требует ОБЯЗАТЕЛЬНУЮ таблицу со строго
заданными столбцами, закрытыми списками значений, явными запретами
(«Роли из столбца „Процессуальные“ в этом столбце — ЗАПРЕЩЕНЫ»),
правилом пустой ячейки и требованием полноты («Каждая категория —
ОБЯЗАТЕЛЬНО в отдельной строке. Пропуски недопустимы»). А
section.theses.sub.table прямо называет назначение: «Эта таблица будет
использоваться последующими разделами документа».

Делаю рекомендациям то же самое.

Прикреплены: модель данных (§2.6, §2.9), спецификация (§2.3, §2.9,
§4.3), seed-prompts.ts, seed-configs.ts, prompt-registry.ts,
context-extractor.ts, html-parser.ts, element-renderer.ts,
generation-service.ts, schema.ts + миграции 0000–0006, routes/sections.ts.

1. НОВЫЙ ПОДРАЗДЕЛ «Таблица рекомендаций» — отдельно от прозы, по
   образцу пары «Топология графа» (проза) / «Топологическая таблица»
   (машина). Правки конфигов реестра (все через сиды, не руками в БД):
   a. subsection_map.base.critique — добавить «Таблица рекомендаций»
      ПОСЛЕ «Рекомендации по улучшению»;
   b. intra_deps.critique — «Таблица рекомендаций»:
      ["Рекомендации по улучшению"] (таблица составляется ПО прозе, а не
      независимо от неё);
   c. subsection_ctx_keys.critique — «Таблица рекомендаций»: [] (свой
      контекст не нужен, хватает прозы и документа).
   Проверить, что варианты critiqueCheck и critiqueNovelty (карта
   подразделов по уровню синтеза) не потеряли новый подраздел.

2. НОВЫЙ ШАБЛОН section.critique.sub.recommendations_table — по образцу
   section.graph.sub.topology_table, той же строгости:

   «ОБЯЗАТЕЛЬНАЯ итоговая таблица. Оформить строго как
   <table class="doc-table">.
   Столбцы СТРОГО: № | Адрес | Элемент | Операция | Готовая замена |
   Основание | Важность

   — №: номер рекомендации из секции «Рекомендации по улучшению».
     Каждая рекомендация — ОБЯЗАТЕЛЬНО в отдельной строке. Пропуски
     недопустимы.
   — Адрес: ТОЧНОЕ название подраздела документа, как он там назван —
     без § , без стрелок, без кавычек. Например: «Таблица категорий»,
     «Определения», «Тезисы (полные)». Названия, которых в документе
     нет, — ЗАПРЕЩЕНЫ.
   — Элемент: ТОЧНОЕ название категории, номер тезиса или термин
     глоссария. Если рекомендация о подразделе целиком — ячейку оставить
     пустой.
   — Операция: СТРОГО одно из:
     "переопределить | уточнить формулировку | удалить | добавить |
      развить | перегенерировать".
     Слова вне списка — ЗАПРЕЩЕНЫ. «Улучшить», «усилить», «доработать»,
     «проработать» — ЗАПРЕЩЕНЫ: это не операции, а пожелания.
   — Готовая замена: ТОЧНЫЙ новый текст, если рекомендация его содержит
     дословно; иначе — пусто. Пересказ вместо дословного текста —
     ЗАПРЕЩЁН.
   — Основание: ТОЧНОЕ название подраздела критики, где проблема
     установлена. Например: «Верность методу синтеза».
   — Важность: СТРОГО одно из: "блокирующая | существенная |
     косметическая".

   ОДНА СТРОКА — ОДИН АДРЕС: рекомендация, затрагивающая два подраздела,
   разбивается на две строки с одним номером.
   РАЗВИЛКА: если рекомендация предлагает выбор («устранить ИЛИ
   переопределить»), каждый вариант — отдельной строкой с тем же
   номером; в столбце № указать «5а» и «5б». Выбор делает человек, не
   документ.
   Эта таблица используется инструментом реализации рекомендаций.»

   Шаблон завести для всех шести методов? НЕТ: это структурный шаблон,
   не методный — один section.-шаблон, как topology_table.

3. Правку прозаического шаблона section.critique.sub.recommendations
   свести к минимуму: добавить требование, что каждая рекомендация
   называет подраздел документа и ссылается на подраздел критики, где
   проблема установлена. Не переписывать: проза — для человека, строгость
   живёт в таблице.

4. Миграция 0007 + schema.ts — таблица recommendations:
   id uuid pk, synthesis_id uuid → syntheses ON DELETE CASCADE,
   round integer NOT NULL, num text NOT NULL (строкой: бывает «5а»),
   address_subsection text, element text NULL, op text, replacement text
   NULL, rationale text, severity text,
   status text ('new'|'planned'|'done'|'rejected'|'invalid') DEFAULT
   'new', invalid_reason text NULL, plan_id uuid NULL, step_index integer
   NULL, created_at timestamptz DEFAULT now();
   UNIQUE (synthesis_id, round, num); индекс по (synthesis_id, status).
   Раздел 02 §2.32.

5. server/services/recommendations.ts:
   a. parseRecommendationsTable(sectionHtml) — найти подраздел «Таблица
      рекомендаций» (findSubsection), взять из него table.doc-table
      (locateDocTableHost/tableToText уже читают именно этот класс),
      разобрать строки по заголовкам столбцов, а НЕ по их порядку:
      модель может переставить столбцы, и падать из-за этого нельзя.
      Отсутствующий или переименованный столбец — ВНЯТНЫЙ отказ с
      указанием, какого заголовка не нашлось, а не молчаливый пустой
      список: таблицу правит и человек (см. п. 5г), и пустота вместо
      причины оставит его без подсказки;
      г. ТАБЛИЦУ ПРАВЯТ РУКАМИ. Подраздел «Таблица рекомендаций» не
      рисуется из таблиц БД, значит вычисляемый замок 9.2 его не
      запирает и правка подраздела (9.2) к нему применима. Проверить,
      что это так и что правка её переживает: белый список санитайзера
      9.2 включает TABLE/THEAD/TBODY/TR/TH/TD, а class="doc-table"
      возвращается каждой таблице принудительно — то есть разбор после
      ручной правки обязан находить таблицу по-прежнему;
   b. СТОРОЖ адресов — для каждой строки проверить:
      - подраздел из «Адреса» существует в этом документе (собрать
        data-section по всем разделам);
      - «Элемент», если задан, находится среди categories / theses /
        glossary_terms этой концепции (сверка по точному названию, затем
        по нормализованному — схлопнуть пробелы, снять кавычки-ёлочки);
      - «Операция» входит в закрытый список; «Важность» тоже.
      Негодная строка НЕ роняет разбор: status='invalid' и
      invalid_reason с указанием, что именно не сошлось. Документ живой,
      модель ошибается, и разбор обязан переживать это.
   в. ХЭШ ИСТОЧНИКА: при разборе сохранять в строке хэш содержимого
      подраздела-адресата (и значение элемента, если он задан). Он нужен
      беседе 10.2, чтобы отличить рекомендацию, всё ещё относящуюся к
      нынешнему тексту, от устаревшей: ручная правка подраздела (9.2)
      между разбором и исполнением — обычное дело, а не редкость.
   c. РАУНД: round = (максимальный round этой концепции) + 1 при первом
      разборе после перегенерации критики; повторный разбор того же
      текста критики раунда НЕ увеличивает (ключ — хэш html подраздела,
      хранить в таблице раунда или сверять по составу строк).

6. Транспорт (routes/sections.ts или новый routes/recommendations.ts,
   requireAuth + владелец, гейт как у правки):
   a. GET  /syntheses/:id/recommendations — строки текущего раунда со
      статусами; ?round=N — прошлый;
   b. POST /syntheses/:id/recommendations/parse — перечитать подраздел и
      обновить строки (идемпотентно в пределах раунда).
   Чужому — 403: рекомендации касаются правки, а не чтения.

7. РЕТРОФИТ для концепций БЕЗ таблицы (все существующие):
   POST /syntheses/:id/recommendations/extract — ОДНО обращение к модели:
   «вот проза рекомендаций и вот список подразделов, категорий, тезисов
   и терминов этой концепции — составь таблицу по контракту». Результат
   вписывается подразделом «Таблица рекомендаций» в раздел critique.
   ВНИМАНИЕ: готовой функции для этого НЕТ, и обе очевидные не годятся.
   spliceSubsectionHtml (2.2) заменяет весь <div data-section> ВМЕСТЕ с
   <h4> — установлено «По факту 5.1» п. 1 и подтверждено в 9.2.
   replaceSubsectionContent (9.2, html-parser) обёртку и <h4> бережёт,
   но возвращает null, если подраздела с таким именем НЕТ, — а при
   ретрофите его как раз и нет.
   Завести рядом insertSubsectionAfter(sectionHtml, afterName, newName,
   innerHtml): собрать <div data-section="..."> с якорем subsec-* и <h4>
   по образцу соседних подразделов и поставить ПОСЛЕ названного. Если
   подраздел уже есть — не добавлять второй, а заменить содержимое через
   replaceSubsectionContent. Дальше разбор по п. 5.
   Квота — regenerations, обращение одно.
   Без ретрофита фаза не нужна ни одной уже созданной концепции — а их
   у владельца уже несколько.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не исполнять рекомендации и не трогать edit-planner: это 10.2;
- не трогать клиент: это 10.3;
- не менять шаблоны других разделов и не трогать topology_table —
  она образец, а не предмет правки;
- не пытаться разобрать прозу рекомендаций без таблицы напрямую:
  путь ретрофита ровно один — сначала составить таблицу (п. 7), потом
  разбирать её.
```

**Последующие запросы:**
- «Протестируй сиды: `seed:prompts` и `seed:configs` заводят новый шаблон и правят три конфига идемпотентно (повторный прогон — skip); активация версии сбрасывает кэш реестра»
- «Протестируй генерацию: сгенерировать критику на моке Claude → в разделе есть подраздел «Таблица рекомендаций» с `table.doc-table`, «Рекомендации по улучшению» на месте и идут ПЕРЕД ней»
- «Протестируй разбор: таблица из семи столбцов → строки в БД со всеми полями; строки с «Готовой заменой» отличимы от строк без неё»
- «Протестируй устойчивость к перестановке: та же таблица со столбцами в другом порядке разбирается так же (разбор по заголовкам, не по позиции)»
- «Протестируй сторож: строка с несуществующим подразделом → status='invalid' и invalid_reason называет адрес; строка с операцией «улучшить» → invalid с указанием на закрытый список; остальные строки разобраны нормально»
- «Протестируй нормализацию: элемент, записанный с двойным пробелом и в ёлочках, находится среди категорий»
- «Протестируй развилку: строки «5а» и «5б» разобраны как две, обе status='new', UNIQUE не нарушен»
- «Протестируй раунд: повторный parse того же текста раунда не увеличивает; перегенерация критики и parse → round+1, прежние строки остались с прежним раундом»
- «Протестируй ретрофит на ЖИВОЙ концепции (T101_FILE, как T92_FILE в 9.2): импортировать присланный файл, где таблицы рекомендаций НЕТ → extract → подраздел появился, все рекомендации прозы разобраны (в живом файле их семь, не пять — «По факту 10.1» п.9), из них одна с готовой заменой и одна развилкой»
- «Edge case: чужой синтез → 403; критика ещё не сгенерирована → 404 с внятным текстом, а не пустой список»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 10.1 (2026-09-21) — отступления от буквы запроса и найденное:** → `docs/08-history.md`, глава «Беседа 10.1», подраздел «По факту 10.1 (2026-09-21) — отступления от буквы запроса и найденное».

### Беседа 10.2: Исполнение рекомендаций — шаг правки элемента и раунд (бэкенд)

**Контекст для загрузки:**
- `02-data-model.md` (§2.12 element_versions, §2.13 edit_plans, §2.32 recommendations — из 10.1) — номера по факту 10.2; в первой редакции стояли §2.14/§2.15
- `03-specification.md` (§2.6 планы правок, §2.4 элементы, §2.10 квоты, §2.16 рекомендации, §4.3 коды ошибок) — в первой редакции планы значились §2.5
- `04-code-reuse-map.md`, `05-file-structure.md`
- Из предыдущих бесед:
  - `server/services/edit-planner.ts` (2.1 — `createPlan`, `normalizeActions`), `server/services/cascade-analyzer.ts` (2.1 — `analyzeImpact`, фактические зависимости из `context_log`), `server/services/plan-executor.ts` (2.2), `server/routes/plans.ts` (2.1/2.3)
  - `server/services/element-editor.ts` (5.1/9.2 — правка элементов и подразделов, версии), `server/services/element-versioning.ts` (5.1)
  - `server/services/element-enrichment.ts` (5.3 — ПРЕЦЕДЕНТ точечной генерации в элемент)
  - `server/middleware/billing-check.ts` (6.1), `server/services/billing-service.ts` (6.1)
  - `server/services/recommendations.ts` (10.1 — `sourceHashFor`, `loadDocumentIndex`, `parseAndStore`), `server/routes/recommendations.ts` (10.1), `packages/shared/constants/recommendations.ts` и `types/recommendations.ts` (10.1 — статусы, в т.ч. уже заведённый 'stale')
  - `packages/shared/types/edit-plan.ts`, `elements.ts`
  - ЧТО 10.1 УЖЕ СДЕЛАЛА ЗА 10.2 («По факту 10.1» пп. 5, 7): статус 'stale' в схеме и shared; столбцы `address_section` (готовый «sectionKey» адреса шага), `element_kind` / `element_id` (готовая цель «kind:elementId»); пересчёт хэша источника — `sourceHashFor(doc, row)`. Номер рекомендации в раунде НЕ уникален (одна рекомендация — несколько строк с одним №): `nums[]` выбирает ВСЕ строки номера
  - МОК CLAUDE обязан узнавать критику ПЕРВОЙ (по «Таблица рекомендаций» в задании): её задание несёт имена подразделов всех разделов документа (09 §4, 10.1)
- Исходник: НЕ НУЖЕН
- Дизайн-набор: НЕ НУЖЕН (беседа серверная)

**Грабли из 09, которые беседа заденет заведомо:**
- §1, беседа 0.3 — jsonb не хранит порядок ключей: `edit_plans.steps[]` сравнивать через `canonical()`
- §3, беседа 0.2 — pg-код ошибки в `err.cause.code`
- §3, беседа 6.1 — FK-политика уборки стенда
- §4, беседы 6.1 и 6.2 — PG и Redis не переживают паузу; прогон в фоне
- §8, беседа 7.1 — «нет ✗» ложно ловит «0 ✗»

**Первый запрос:**
```
Делаю рекомендации исполнимыми.

ИСХОДНОЕ СОСТОЯНИЕ. EditStepType знает пять шагов — delete, regen, add,
regen_subsection, regen_mode — и ВСЕ про разделы. А проверка на живой
концепции показала: из семи рекомендаций (пересчитано 10.1) две — на ЭЛЕМЕНТ
(определение категории «Индивидуация-как-практика»; категория
«Энантиодромия разлома»), одна — на тезис. Сегодня такая рекомендация
исполняется перегенерацией всей таблицы категорий: чтобы убрать предлог
«ради» в одном определении, переписываются все двенадцать.

Причём часть рекомендаций НЕ ТРЕБУЕТ МОДЕЛИ ВОВСЕ: рекомендация 2 живой
концепции содержит готовую замену дословно («конститутивное нарушение
грамматики, произведённое в ответ на присутствие нередуцируемого
содержания»). Это PATCH одного поля — бесплатно и мгновенно.

Прикреплены: модель данных (§2.14, §2.15, §2.32), спецификация (§2.5,
§2.4, §2.10, §4.3), edit-planner.ts, cascade-analyzer.ts,
plan-executor.ts, routes/plans.ts, element-editor.ts,
element-versioning.ts, element-enrichment.ts, billing-check.ts,
billing-service.ts, recommendations.ts, типы edit-plan и elements.

1. EditStepType += два шага:
   a. "edit_element" — применить ГОТОВЫЙ текст к элементу. Модель не
      зовётся, квота НЕ расходуется, стоимость 0. Цель шага —
      "kind:elementId" (category / thesis / glossary_term / edge);
      новое значение — в поле шага.
   b. "refine_element" — точечная генерация В ЭЛЕМЕНТ: модель получает
      узкий контекст (сам элемент, его подраздел, довод рекомендации) и
      возвращает новое значение поля. Квота — regenerations, как у
      прочей генерации. Образец устройства — element-enrichment (5.3):
      там уже есть обращение к модели, привязанное к элементу, с записью
      результата и версии.
   Оба шага пишут версию элемента через element-versioning.

2. ChangeSource += "recommendation". В версии сохранять, какая именно
   рекомендация её породила (номер и раунд) — через recommendations.
   plan_id/step_index, заполняемые при постановке плана. История версий
   обязана отвечать не только «что изменилось», но и «почему».

3. server/services/recommendation-planner.ts —
   buildPlanDraft(synthesisId, nums[]): взять выбранные рекомендации и
   перевести в CreatePlanRequest. Правила перевода:
   - есть «Готовая замена» → шаг edit_element;
   - элемент задан, замены нет → refine_element, довод рекомендации
     уходит в контекст шага;
   - элемент пуст, операция «добавить»/«развить» → regen_subsection с
     адресом «sectionKey:Адрес» и доводом в regenContexts;
   - операция «перегенерировать» и элемент пуст → regen раздела;
   - операция «удалить» с элементом → edit_element с пустым значением
     НЕЛЬЗЯ: удаление элемента — отдельная операция, а не пустая
     правка; оформить как delete-шаг существующего вида, если он
     адресует элемент, либо отклонить строку с внятной причиной и
     записать находку в «По факту».
   Дальше — обычный createPlan: каскад считается как всегда, по
   фактическим зависимостям.
   ВАЖНО: планировщик НЕ ВЫБИРАЕТ за человека. Развилка («5а» и «5б») в
   черновик попадает только та, которую назвали в nums[]; попытка взять
   оба варианта одной рекомендации → 400 с пояснением.

4. УСТАРЕВАНИЕ ПОСЛЕ РУЧНОЙ ПРАВКИ. Между разбором (10.1) и постановкой
   плана человек мог поправить подраздел руками — беседа 9.2 это
   разрешает, и правка там идёт РАЗМЕТКОЙ содержимого, с санитайзером и
   версией раздела. Значит текст, к которому относилась рекомендация,
   мог измениться, а довод («устранить телеологический предлог „ради“»)
   — обессмыслиться.
   Правило: перед сборкой плана сверить хэш источника, сохранённый при
   разборе (10.1, п. 5в). Разошёлся → строка переходит в 'stale', в
   план НЕ берётся, и человеку предлагается перечитать рекомендации
   (POST …/recommendations/parse), а не молча исполнить устаревшее.
   'stale' отличать от 'invalid': первое — «текст изменился», второе —
   «адрес не найден».

5. РАУНД и самореферентность. Критика — раздел того же документа, и по
   логу контекста она потребляет больше всех (на живой концепции — 9
   обязательных ключей из 9, ~72 тыс. знаков против 48 тыс. у графа).
   Значит каскад САМ добавит перегенерацию критики в план — проверить,
   что это так, и НЕ дублировать вручную.
   Правила раунда:
   - пока в раунде есть рекомендации со статусом 'planned', новый
     разбор раунда не открывается (409 ROUND_IN_PROGRESS);
   - исполнение шага → статус рекомендации 'done'; пропуск шага в
     панели каскада → 'rejected';
   - перегенерация критики завершает раунд; следующий parse (10.1)
     откроет round+1.
   Цикла «улучшение до бесконечности» не запрещать, но показывать номер
   раунда — человек должен видеть, что идёт по кругу.

6. Биллинг: edit_element — без квоты и без резерва (модель не зовётся);
   refine_element — квота regenerations, как regen_subsection. Оценка
   плана (существующая) обязана показывать нулевую стоимость шагов
   edit_element отдельно, а не прятать в общей сумме: разница между
   «бесплатно» и «за деньги» — главное, что человек хочет видеть.

7. Транспорт: POST /syntheses/:id/recommendations/plan { nums: string[] }
   → черновик EditPlan (status='draft'), рекомендации переводятся в
   'planned'. Исполнение — существующим
   POST /plans/:planId/execute, без нового пути.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не делать кнопку «исполнить все»: рекомендации пишет модель о
  собственном тексте, и сплошная самошлифовка стирает ровно те
  шероховатости, ради которых концепция и задумывалась. Выбор —
  поштучный, и это требование, а не удобство;
- не трогать клиент: это 10.3;
- не менять шаблоны и разбор: это 10.1;
- не заводить автоматическое открытие следующего раунда.
```

**Последующие запросы:**
- «Протестируй edit_element: рекомендация с готовой заменой → план из одного шага → исполнение → определение категории изменено, версия записана с источником recommendation, квота НЕ израсходована, стоимость 0»
- «Протестируй refine_element на моке Claude: рекомендация без замены → шаг зовёт модель с узким контекстом → новое значение записано, версия с источником recommendation, квота regenerations израсходована»
- «Протестируй перевод адресов: рекомендация о подразделе без элемента → regen_subsection с правильным «sectionKey:Адрес»; операция «перегенерировать» без элемента → regen раздела»
- «Протестируй каскад: после любого шага в плане САМ появился шаг перегенерации критики (cascadeGenerated=true) — не добавленный руками»
- «Протестируй развилку: nums=['5а'] → план с одним шагом; nums=['5а','5б'] → 400 с пояснением; рекомендация помечена planned только выбранным вариантом»
- «Протестируй раунд: при наличии planned новый parse → 409 ROUND_IN_PROGRESS; после исполнения и перегенерации критики parse открывает round+1»
- «Протестируй статусы: исполненный шаг → 'done'; пропущенный в панели → 'rejected'; отклонённая сторожем строка остаётся 'invalid' и в план не берётся»
- «Протестируй оценку: план из двух edit_element и одного refine_element показывает нулевую стоимость первых двух отдельной строкой»
- «Протестируй устаревание: после разбора поправить подраздел-адресат вручную (9.2) → сборка плана даёт 'stale' по этой строке с предложением перечитать; после перечитывания строка снова годна»
- «Edge case: рекомендация, чей элемент удалён между разбором и постановкой плана → шаг не создаётся, строка → 'invalid' с причиной; чужой синтез → 403; генерация идёт → 409»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 10.2 (2026-09-21) — отступления от буквы запроса и найденное:** → `docs/08-history.md`, глава «Беседа 10.2», подраздел «По факту 10.2 (2026-09-21) — отступления от буквы запроса и найденное».

### Беседа 10.3: Панель рекомендаций (клиент)

**Контекст для загрузки:**
- `03-specification.md` (§2.6 планы — тело плана с действиями мельче раздела и `costBreakdown`; §2.16 рекомендации — четыре маршрута, DTO постановки плана; §2.4 — `ElementVersion.origin`; §4.2, §4.3) — номера по факту 10.2 (в первой редакции §2.5/§2.32: §2.32 — это раздел 02, не 03)
- `04-code-reuse-map.md`, `05-file-structure.md`
- Из предыдущих бесед:
  - `client/src/components/edit/EditModal.tsx` и `CascadePanel.tsx` (2.3 — куда уходит черновик плана), `client/src/api/plans.ts`
  - `client/src/components/document/*` (1.6b/9.2 — где живёт раздел критики и правка по месту), `client/src/components/edit/EditSectionCard.tsx` (2.3)
  - `client/src/components/edit/VersionHistory.tsx` (5.2), `client/src/utils/capsule-html.ts` (8.4)
  - `client/src/stores/synthesis-store.ts`, `client/src/api/client.ts`
  - из 10.1/10.2: `packages/shared/types/recommendations.ts` (DTO четырёх маршрутов, `RecommendationsPlanResponse`, `RecommendationDecline`), `constants/recommendations.ts`, `constants/edit-steps.ts` (бесплатные типы шагов, подписи видов и полей, `planCostBreakdown` — оценка «N бесплатно, M платно» ДО сборки плана считается им же), `types/edit-plan.ts`, `types/elements.ts` (`VersionOrigin`)
  - ЧТО 10.2 ОСТАВИЛА ПАНЕЛИ («По факту 10.2»): (а) статус плана `done` пишется ДО освобождения слота — запрос под гейтом правки сразу после `plan_updated` может получить 409 GENERATION_IN_PROGRESS: повторить, отказом не считать; (б) шаг элемента правит поле ПО УМОЛЧАНИЮ (определение / формулировка) — выбора поля в таблице рекомендаций нет, §12; (в) `declined[]`, `stale[]`, `invalid[]` приходят и при 200 (часть строк вошла), и в `details` при 422 — показывать причину по строке; (г) `EditPlanPanel` и `VersionHistory` уже знают подписи новых шагов и источника версии, но шаг элемента (поле, значение, рекомендация) и `origin` версии НЕ рисуют — это работа 10.3
- `docs/fragments-for-conversations/5-6-ui-kit.md` + `.css` + `.html` — панель новая, сверяться обязательно; новые классы отдельным блоком, после правки прогнать css-parity
- Исходник: НЕ НУЖЕН (инструмента в одностраничнике нет)

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседа 6.2 (п. 2–4) — капитель; «Node is detached» при клике по перерисованному списку; статус ПОСЛЕ перечитывания
- §2, беседа 9.2 — React 19 переписывает `innerHTML` при смене ССЫЛКИ `{__html}`: мемоизировать проп по строке, набранное дублировать в ref
- §2, беседа 8.4 — `css-parity`, новые классы блоком
- §4, беседа 5.4 — прокси vite зашит на :3000
- §4, беседа 5.2 — teardown `SIGKILL` без группы оставляет `npx vite`
- §8, беседа 7.1 — «нет ✗» ложно ловит «0 ✗»

**Первый запрос:**
```
Делаю панель рекомендаций — единственное место, где человек решает, что
из критики исполнять.

Сервер готов беседами 10.1 (разбор, сторож, раунд) и 10.2 (перевод в
черновик плана, два новых шага). Здесь только клиент.

Прикреплены: спецификация (03 §2.6, §2.16, §2.4, §4.2, §4.3 — номера по факту
10.2; в первой редакции стояло «§2.5, §2.32»), EditModal, CascadePanel,
api/plans, компоненты документа, EditSectionCard, VersionHistory,
capsule-html, synthesis-store, api/client.

1. Вход в панель — кнопка у раздела «Критический анализ» в документе,
   рядом с уже имеющимися (только владельцу). Подпись — число
   неисполненных рекомендаций текущего раунда.

2. client/src/api/recommendations.ts — четыре вызова: список, разбор,
   ретрофит (extract), постановка плана.

3. Панель:
   a. строка на рекомендацию: № · важность · адрес · элемент · операция;
      разворачивается в прозу рекомендации и основание (подраздел
      критики, где проблема установлена) — довод человеку нужен не
      меньше адреса;
   b. ПОМЕТКА, стоит ли это денег: строки с готовой заменой — «правка,
      бесплатно», без замены — «генерация»; это главное различение
      панели, и оно должно читаться с одного взгляда;
   c. развилка — два варианта одной рекомендации показываются парой с
      выбором ОДНОГО; выбрать оба нельзя (сервер ответит 400, но до
      этого доводить незачем);
   d. строки status='invalid' — отдельной группой внизу, с причиной от
      сторожа и БЕЗ возможности выбора; там же кнопка «Править таблицу
      рекомендаций вручную» — подраздел «Таблица рекомендаций» не
      заперт замком 9.2, и человек может поправить адрес сам;
   e. исполненные и отклонённые прошлых раундов — свёрнутым списком с
      номером раунда.

4. Ретрофит: если у концепции нет подраздела «Таблица рекомендаций»
   (все созданные до 10.1), панель показывает не пустоту, а предложение
   «составить таблицу по имеющимся рекомендациям» с ценой одного
   обращения. Пустая панель у концепции, где рекомендации есть в прозе,
   — худшее, что тут можно сделать.

5. Выбор → «Собрать план»: POST плана, затем ПЕРЕДАТЬ управление
   существующей CascadePanel (2.3) — второй панели плана не заводить.
   Человек видит каскад, подтверждает или пропускает шаги, исполняет
   как обычно.

6. Стоимость: до сборки плана показывать оценку — сколько шагов
   бесплатных и сколько платных. Число, а не «бесплатно/платно» вообще.

7. Раунд: заголовок панели называет номер раунда. Если раунд идёт
   (есть 'planned'), панель это показывает и не даёт запустить разбор
   заново — сервер ответит 409, но объяснить надо до отказа.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- НЕТ кнопки «выбрать все» и «исполнить все» — ни в каком виде;
- не править сервер: при нехватке — строка в §12 с адресатом;
- не заводить вторую панель плана и не дублировать CascadePanel;
- не показывать рекомендации чужой концепции: панель только владельцу.
```

**Последующие запросы:**
- «Протестируй вход: у раздела критики кнопка с числом неисполненных; у чужой концепции и у гостя её нет»
- «Протестируй список: рекомендации живой концепции (семь; восемь строк с развилкой) показаны с адресами; строка с готовой заменой помечена как бесплатная, остальные — как генерация»
- «Протестируй развилку: выбор «5а» снимает «5б»; выбрать оба невозможно»
- «Протестируй негодные: строка с несуществующим адресом в отдельной группе с причиной, выбрать нельзя; кнопка правки таблицы открывает подраздел «Таблица рекомендаций» в правке по месту (9.2)»
- «Протестируй ретрофит: у концепции без таблицы панель предлагает составить её с ценой; после составления список наполнился»
- «Протестируй оценку и передачу: выбрать две рекомендации → показано «1 бесплатно, 1 платно» → «Собрать план» → открывается CascadePanel с шагами, среди них перегенерация критики как каскадная»
- «Протестируй раунд: заголовок называет номер; при идущем раунде разбор недоступен с объяснением; после исполнения список исполненных свёрнут с номером раунда»
- «Прогони css-parity после добавления блока 10.3: расхождений 0»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

**По факту 10.3 (2026-09-22) — отступления от буквы запроса и найденное:** → `docs/08-history.md`, глава «Беседа 10.3», подраздел «По факту 10.3 (2026-09-22) — отступления от буквы запроса и найденное».

### Фаза 11 (добавлена 2026-09-22): локализация интерфейса

> Заведена по требованиям владельца, записанным в беседе «Оценка объёма
> текста в репозитории» (вне протокола): там же сделаны инструменты
> (патч `philosynth-i18n-v2`), и там же составлен первоначальный план из
> трёх бесед. Этот план уточнён четырьмя находками:
>
> 1. **Codemod ломает сторожей.** `check:integration` зелён на чистом
>    HEAD и с наложенным патчем — и краснеет после `i18n:codemod
>    --in-place` группами 4x, 4y, 4au. Это дрейф-контроли зеркальных пар
>    клиент ↔ сервер, где одна сторона — данные для промптов и экспорта.
>    Codemod переписывает одну сторону и не знает о паре. В плане проверку
>    делали `tsc`, `vite build` и браузером; `check:integration`, которому
>    нужна живая база, не прогоняли.
> 2. **Вид вызова — `tl(key, ru, params)`**, а не `t("key")` плана: русский
>    текст вторым аргументом, код остаётся читаемым.
> 3. **Плюралов нет.** План обещал `Intl.PluralRules` (для русского три
>    формы), `formatMessage` патча умеет только `{имя}`.
> 4. **Нерусская генерация теряет данные молча** (см. 11.1). Правило связи
>    языков делает её умолчанием — значит защита обязана прийти раньше
>    переключателя.
>
> Порядок ЖЁСТКИЙ: 11.1 → 11.2 → 11.3 → 11.4. **11.1 ЗАКРЫТА 2026-09-23**
> (сервер; `lang-templates.ts`, graph-parser без молчания, `parseWarnings` в
> генлоге, `resolveSubsection`; см. «По факту 11.1»). **11.2 ЗАКРЫТА 2026-09-27**
> (основа локализации и сервер: `shared/i18n/locales`, плюралы в `tl()`,
> каталоги `generated/*`, `users.ui_locale/gen_lang` + `PATCH /me`, язык
> запроса `server/i18n/locale.ts`, codemod применён — 132 файла, 2268 строк,
> зеркала `MIRROR_EXCLUSIONS` литералами; Д-16 закрыт; см. «По факту 11.2»).
> **11.3 ЗАКРЫТА 2026-09-28** (клиент: `client/src/i18n/{i18n-store,useT}`,
> переключатель ru/en/de в шапке и профиле, каталоги по требованию, форма
> создания из `user.genLang`, 41 static-константа → фабрики (static = 0,
> сторож 4ax), пометка «разобран с потерями» владельцу; долг Д-31; см. «По
> факту 11.3»). **11.4 ЗАКРЫТА 2026-09-29** (данные и переводы:
> `shared/i18n/data.ts` — `tData`/`tDataLoose` по карте «значение → ключ»
> (генерат `generated/data-keys.ts`, 405 записей), константы/сиды/БД/промпты
> русские, каталоги несут data-строки, немецкий черновик 2269 строк
> (`draft`), `i18n:check --strict` требует все языки, сторож 2an/4ay; долг
> Д-32; см. «По факту 11.4»). **ФАЗА 11 ЗАКРЫТА.** Ближайшая — 12.1.
> Новые языки интерфейса — типовая беседа L (шаблон после Фазы 12, перед
> §9); утверждение переводов — работа владельца с инструментами, не беседа
> (en и de утверждены 2026-09-29).
>
> Патч `philosynth-i18n-v2` (инструменты `scripts/i18n/*`,
> `packages/shared/i18n/{t.ts,strings.json}`, `names.json` с именованными
> полями) входит в состав проекта с выкладки, открывшей фазу: codemod НЕ
> применён, `tl()` в коде нет, `typecheck` 0, `check:integration` зелёный.
>
> Сквозное правило фазы: **значения `data-section` — машинные ключи, через
> `tl()` не проходят никогда**, при любом языке интерфейса и генерации.
>
> **Добавлено 2026-09-23 (ревизия §12):** 11.2 берёт долг **Д-16** —
> опознание подраздела по факту во всех точках разбора (intra-контекст,
> рекомендации, импорт), показ `parseWarnings` — 11.3. Правило связи языков
> делает нерусскую генерацию умолчанием, и откладывать это до Фазы 12
> значило бы молча терять контекст у каждого EN/DE-пользователя.

---

### Беседа 11.1: Язык генерации — защита машинных значений (сервер)

**Контекст для загрузки:**
- `01-architecture.md` (§4.1 Registry и подстановка), `02-data-model.md` (§2.4 `syntheses.lang`)
- `03-specification.md` (§2.9 Prompt Registry, §4.3)
- `04-code-reuse-map.md`, `05-file-structure.md`
- Из предыдущих бесед:
  - `server/services/prompt-builder.ts` (1.2 — рендер `system.lang_instruction` только при `lang ≠ Russian`, строки ~190–220)
  - `server/config/prompt-templates.ts` и `section-templates.ts` — ГЕНЕРАТЫ из исходника, «НЕ ПРАВИТЬ ВРУЧНУЮ»; `server/config/recommendation-templates.ts` (10.1) — образец рукописной надстройки поверх генератов
  - `server/services/graph-parser.ts` (1.4 — `ROLE_MAP`, разбор направления ~строки 368 и 586–590), `server/services/element-parser.ts`, `packages/shared/utils/normalize.ts`
  - `scripts/seed/seed-prompts.ts` (как надстройки ложатся поверх генератов)
- Исходник `source/philosynth.html` — только для справки: языковая инструкция портирована оттуда дословно
- Дизайн-набор: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседа 10.1 — шаблоны и конфиги из исходника — ГЕНЕРАТЫ; правка рукой пропадёт при `extract:seed` и сломает байтовую сверку (smoke-12, секция 2g «146 шаблонов section.*»). Отступления службы — только рукописными надстройками
- §2, беседа 10.1 — кэш реестра в Redis бессрочный, сиды его не сбрасывают: на стенде после посева — перезапуск сервера
- §1, беседа 0.3 — jsonb не хранит порядок ключей: `canonical()`
- §8, беседа 7.1 — «нет ✗» ложно ловит «0 ✗»

**Первый запрос:**
```
Защищаю машинные значения документа от перевода при нерусской генерации.

ИСХОДНОЕ СОСТОЯНИЕ, проверенное по коду и активным шаблонам:
- system.lang_instruction (рендерится только при lang ≠ Russian)
  защищает ЛИШЬ значения атрибута data-section: «MUST remain EXACTLY as
  specified (in Russian)… Only the visible <h4> heading text… should be
  translated». И в том же тексте: «generate ALL your output strictly in
  {{lang}}. This includes … tables».
- А парсеры читают русские значения в ЯЧЕЙКАХ таблиц:
  * ROLE_MAP (graph-parser) — только русские роли («центральная»,
    «мост», «ядро»…); незнакомая роль пропадает;
  * направление связи — по подстрокам «рефлекс»/«двунаправ», всё прочее
    МОЛЧА становится «однонаправленной» (graph-parser ~586–590):
    английское «bidirectional» — это тихая порча данных, а не ошибка;
  * типы связей и категорий сводятся к русскому каталогу таксономии.
- Из 19 строгих шаблонов section.* («СТРОГО», «ТОЧНО») оговорку
  «машинные значения — по-русски при любом языке документа» имеет ОДИН:
  section.critique.sub.recommendations_table (10.1). Восемнадцать — нет.
Правило связи языков (беседа 11.2) делает нерусскую генерацию
умолчанием для каждого, кто переключит интерфейс, — значит защита
обязана прийти раньше.

Прикреплены: architecture §4.1, data-model §2.4, specification §2.9,
§4.3, prompt-builder.ts, prompt-templates.ts, section-templates.ts,
recommendation-templates.ts, graph-parser.ts, element-parser.ts,
normalize.ts, seed-prompts.ts.

1. ГЕНЕРАТЫ НЕ ТРОГАТЬ. prompt-templates.ts и section-templates.ts —
   порождены из исходника; правка рукой пропадёт при extract:seed и
   сломает байтовую сверку (smoke-12, секция 2g). Завести рукописную
   надстройку server/config/lang-templates.ts по образцу
   recommendation-templates.ts (10.1): новая версия system.lang_instruction
   поверх генерата, накладываемая сидом.

2. Текст надстройки — расширение защиты, а не замена:
   - прежнее правило о data-section сохранить дословно;
   - ДОБАВИТЬ: значения, которые задание раздела перечисляет как
     закрытый список («СТРОГО одно из», «Столбцы СТРОГО», «Тип: … / …»,
     «Направление — СТРОГО одно из трёх»), — машинные ключи; писать их
     ТОЧНО так, как в задании, по-русски, при любом языке документа.
     Заголовки столбцов обязательных таблиц — тоже;
   - ДОБАВИТЬ: названия категорий в таблице связей — ТОЧНО как в
     таблице категорий того же документа (иначе связь не найдёт концов
     на любом языке);
   - всё прочее видимое — по-прежнему на {{lang}}.
   Оговорка 10.1 в recommendations_table остаётся: она частный случай
   общего правила и противоречить ему не должна — сверить формулировки.

3. ПАРСЕРЫ ПЕРЕСТАЮТ МОЛЧАТЬ. Защита в шаблоне — просьба к модели, а
   не гарантия. Поэтому:
   a. направление связи: незнакомое значение → не «однонаправленная»
      по умолчанию, а предупреждение в результате разбора с указанием
      строки и значения; ребро сохраняется с направлением
      «однонаправленная» и ПОМЕТКОЙ, что оно подставлено;
   b. роль вне ROLE_MAP → предупреждение, а не молчаливая потеря;
   c. предупреждения доходят до генерационного лога (2.4) раздела — чтобы
      владелец увидел, что документ разобран с потерями.
   Английских и немецких синонимов в ROLE_MAP НЕ заводить: это второй
   свод правил, который разойдётся с шаблонами. Путь один — модель
   пишет ключи по-русски, парсер громко сообщает, когда она не смогла.

4. СТРАХОВКА НА СЛУЧАЙ ПЕРЕВЕДЁННЫХ АТРИБУТОВ. Запрет переводить
   data-section — тоже просьба, а не гарантия, и модели, пишущей
   английский документ, русская строка в атрибуте кажется аномалией,
   которую хочется «исправить». Сегодня такой сбой молчит: findSubsection
   (generation-service, 2.2) не находит подраздел по имени, и
   перегенерация, контекст и разбор его теряют.
   Порядок подразделов внутри раздела задан шаблоном жёстко (карта
   subsection_map с вариантами по уровню и методу). Поэтому:
   - findSubsection получает необязательный ожидаемый порядок имён
     раздела; сначала — поиск по имени, как сейчас (точное → нечёткое);
   - имя не нашлось, но число подразделов раздела СОВПАДАЕТ с картой —
     сопоставить по позиции и записать предупреждение («подраздел N
     опознан по месту: атрибут "Methodology" вместо "Методология
     построения графа"»);
   - число НЕ совпадает — честный отказ, как сейчас, но с предупреждением
     о причине, а не молча.
   Ожидаемый порядок брать из той же карты, по которой строилось задание
   раздела (с учётом вариантов critiqueCheck/critiqueNovelty и прочих),
   второго списка не заводить.
   Довод против большего: полная отвязка data-section от русского языка —
   56 файлов кода, 68 имён в карте и 146 генерированных шаблонов, а
   импорт файлов одностраничника всё равно читает русские имена вечно.
   Её уместность решат предупреждения этой беседы: если английские
   генерации ломают разметку часто — будет повод для отдельной фазы с
   цифрами; если нет — фаза сэкономлена.

5. Сторож в check:integration (следующая серия — 2ak/4av/5ai):
   - активный system.lang_instruction содержит и правило data-section,
     и правило закрытых списков;
   - каждый шаблон section.* с «СТРОГО одно из» / «Столбцы СТРОГО»
     покрыт общим правилом (проверка по тексту активной версии);
   - живьём: разбор графа с английскими направлениями даёт
     предупреждения, а не молчаливую «однонаправленную»; с русскими —
     ни одного;
   - живьём: раздел с переведёнными атрибутами при совпадающем числе
     подразделов опознаётся по позиции с предупреждением; при
     несовпадающем — отказ с предупреждением.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не трогать tl(), strings.json и клиент — это 11.2–11.4;
- не переименовывать data-section в латинские ключи: страховка п. 4 —
  всё, что эта фаза делает с разметкой; полная отвязка — только по
  итогам предупреждений, отдельной фазой;
- не править генераты prompt-templates.ts и section-templates.ts;
- не заводить синонимы машинных значений на других языках.
```

**Последующие запросы:**
- «Протестируй надстройку: `seed:prompts` → активная `system.lang_instruction` — новая версия с обоими правилами; повторный прогон — skip; генерат `prompt-templates.ts` не изменён (байтовая сверка smoke-12 и 2g зелёные)»
- «Протестируй рендер: при `lang = English` системный промпт содержит правило закрытых списков; при `lang = Russian` инструкции нет вовсе (как раньше)»
- «Протестируй разбор на моке: раздел графа с английскими направлениями («bidirectional», «reflexive») → предупреждения с номерами строк, рёбра сохранены с пометкой подстановки; тот же раздел с русскими значениями → ни одного предупреждения»
- «Протестируй роль: «Central» вместо «центральная» → предупреждение, роль не потеряна молча»
- «Протестируй лог: предупреждения разбора видны в логе генерации раздела (2.4)»
- «Протестируй страховку: раздел графа, где все пять атрибутов data-section переведены на английский, а число подразделов то же → перегенерация подраздела «Таблица связей» находит его по позиции, в логе предупреждение с обоими именами; раздел с четырьмя подразделами вместо пяти → отказ с предупреждением о несовпадении числа»
- «Протестируй сторож: снять правило закрытых списков из активной версии → `check:integration` красный с указанием, какого правила нет»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

**По факту 11.1 (2026-09-23) — текст запроса против кода и найденное:** → `docs/08-history.md`, глава «Беседа 11.1», подраздел «По факту 11.1 (2026-09-23) — текст запроса против кода и найденное».

### Беседа 11.2: Основа локализации и сервер (бэкенд + codemod)

**Контекст для загрузки:**
- `02-data-model.md` (§2.1 users; новая миграция заводится этой беседой), `03-specification.md` (§2.1 Auth API, §4.3)
- `04-code-reuse-map.md`, `05-file-structure.md`
- `scripts/i18n/README.md` и все `scripts/i18n/*.mjs` (патч `philosynth-i18n-v2`), `packages/shared/i18n/t.ts`, `strings.json`, `scripts/i18n/names.json`
- Из предыдущих бесед:
  - `server/middleware/auth.ts` (0.2/8.6 — `requireAuth`, `optionalAuth`), `server/routes/auth.ts` (`PATCH /me`, 0.6), `server/index.ts`
  - `server/db/schema.ts` + миграции 0000–0009
  - `server/integration-check.mts` — секции **4x** (4.1: `MODE_UI ≡ MODE_CONFIG`, заголовки режимов дословно), **4y** (4.2: подзаголовок клиента ≡ экспорту), **4au** (10.3: строки «удалить» показаны как ручные)
  - `server/services/mode-service.ts` (`MODE_CONFIG`), `client/src/components/modes/*` (`MODE_UI`), `server/services/export/*` (подзаголовок), `client/src/components/document/DocumentHeader.tsx`
  - `packages/shared/utils/cardinality.ts` (словоформы для промптов — сверить с плюралами)
  - долг Д-16 (§12, п.9 ниже): `server/services/context-builder.ts` (`extractRelevantIntraSectionContext`), `generation-service.ts` (`resolveSubsection`, `findSubsection`, `extractSubsectionContent`), `server/utils/html-parser.ts`, `recommendations.ts` (`thesisLabelsFromHtml`, `sourceHashFor`), `recommendation-planner.ts` (`recommendationProseOf`), `element-step.ts`, `import-service.ts`, `packages/shared/types/section.ts` (`SectionFull`)
- Исходник: НЕ НУЖЕН. Дизайн-набор: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §3, беседа 7.1 — `drizzle-kit generate` даёт СЛУЧАЙНЫЙ тег миграции (0010 — операция беседы)
- §3, беседа 0.2 — pg-код ошибки в `err.cause.code`
- §5, беседа 6.1 — `env` читается один раз при импорте
- §8, беседа 7.1 — «нет ✗» ложно ловит «0 ✗»
- Стенд: `node_modules`, подложенный ССЫЛКОЙ на соседний клон, разрешает `@philosynth/shared` в чужой пакет — `Cannot find module '@philosynth/shared/i18n/t'` на ровном месте. Ставить зависимости честно (`npm install` в самом клоне)

**Первый запрос:**
```
Подключаю локализацию к рантайму на сервере и впервые применяю codemod
ко всему репозиторию.

ИСХОДНОЕ СОСТОЯНИЕ. Инструменты и мастер-таблица в репозитории (патч
philosynth-i18n-v2). tl(key, ru, params) возвращает русский текст:
setCatalogProvider не вызывается нигде, strings.json никем не
загружается. Codemod проверен на копии: 132 файла, 2306 строк, tsc и
vite build чисты, сервер отвечает тем же русским текстом.
НО: check:integration, зелёный на чистом HEAD и с наложенным патчем,
после codemod'а КРАСНЕЕТ группами 4x, 4y, 4au. Это дрейф-контроли пар
клиент ↔ сервер, где одна сторона — данные: MODE_CONFIG уходит в
промпты, его клиентское зеркало MODE_UI сторож сверяет в обе стороны;
подзаголовок документа сверяется с экспортом; 4au ищет литерал. Codemod
переписывает одну сторону пары и о паре не знает.

Прикреплены: data-model §2.1, specification §2.1 и §4.3, README и
инструменты scripts/i18n, t.ts, strings.json, names.json, auth.ts
(middleware и routes), index.ts, schema.ts + миграции,
integration-check.mts, mode-service.ts, компоненты режимов, экспорт,
DocumentHeader.tsx, cardinality.ts.

1. packages/shared/i18n/locales.ts:
   UI_LOCALES = ["ru","en","de"]; UI_TO_GEN = { ru: "Russian",
   en: "English", de: "German" }; GEN_FALLBACK = "English";
   genLangForUi(locale) по правилу владельца. Значения языков генерации —
   те же, что в LANG_OPTIONS формы (SynthesisForm), вторым списком их не
   заводить.

2. ПЛЮРАЛЫ в formatMessage (t.ts): синтаксис — ICU-подмножество
   {n, plural, one {…} few {…} many {…} other {…}}, выбор формы через
   Intl.PluralRules языка каталога (ru: one/few/many/other; en и de:
   one/other). ICU выбран потому, что его знают переводчики.
   i18n:import обязан сверять не только подстановки, но и НАБОР форм:
   перевод с формами не своего языка — отказ.
   Сверить с cardinality.ts: там словоформы для ПРОМПТОВ — их не трогать,
   но и дубликата правил не заводить в клиенте.

3. Нарезка каталогов: i18n:split → packages/shared/i18n/generated/en.json,
   de.json (ru не нужен — он в коде вторым аргументом). Строки с draft
   в каталог попадают (черновик лучше русского), строки data — нет.

4. Миграция 0010 + schema.ts: users.ui_locale text NULL, users.gen_lang
   text NULL (NULL — «не выбирал»). 02 §2.1.

5. PATCH /auth/me (routes/auth.ts) — расширить:
   { uiLocale } → пишет ui_locale И gen_lang = genLangForUi(uiLocale);
   { genLang } → пишет ТОЛЬКО gen_lang (интерфейс не трогает).
   Это и есть правило владельца: связь односторонняя. uiLocale вне
   UI_LOCALES → 400 VALIDATION_ERROR с details.uiLocale.
   GET /auth/me отдаёт оба поля.

6. server/i18n/locale.ts — язык запроса через AsyncLocalStorage:
   пользователь (ui_locale) → cookie ui_locale → Accept-Language → ru.
   Подключить middleware в index.ts ДО роутов; setCatalogProvider(() =>
   catalogFor(currentLocale())). Гостю язык берётся из cookie и
   Accept-Language.

7. CODEMOD — ПЕРВОЕ применение, ВМЕСТЕ с переделкой сторожей, в этом
   порядке:
   a. Имена подстановок ДО применения: 33 подстановки с неговорящими
      именами (`value` ×26, `recs2`, `lc2`, `cost2`, `count2`…).
      «рекомендация {recs} · раунд {recs2}», «{d} (строка {lc}, столбец
      {lc2})» переводчик не поймёт. После применения это правка кода и
      таблицы разом, поэтому — до: необязательное поле params в записи
      names.json (строгий разбор loadNames его пока отвергает — расширить
      NAME_FIELDS) либо карта переименований в codemod'е;
   b. ЗЕРКАЛА С ДАННЫМИ codemod'ом не переписывать: MODE_UI (зеркало
      MODE_CONFIG) и подзаголовок документа (зеркало экспорта). Их
      строки — `data`: переводятся по месту показа (11.4), а сторожа 4x
      и 4y продолжают сравнивать русский текст как есть. Список
      исключений — явный, в codemod'е, с доводом в комментарии;
   c. 4au и прочие сторожа, ищущие ЛИТЕРАЛ в клиенте, научить читать
      второй аргумент tl(): сравнивается русский текст, а не исходник;
   d. i18n:codemod --in-place на весь репозиторий;
   e. check:integration ЗЕЛЁНЫЙ — условие закрытия беседы, без
      исключений. i18n:check после — одна строка (PauseModal, JSX в
      подстановке) — её переделка в 11.3.

8. Сторож в check:integration: UI_TO_GEN ⊆ значений LANG_OPTIONS формы;
   каталоги generated/* ≡ нарезке strings.json (не устарели);
   плюральные строки имеют полный набор форм своего языка.

9. ДОЛГ Д-16 (§12): НЕРУССКАЯ ГЕНЕРАЦИЯ НЕ ТЕРЯЕТ ПОДРАЗДЕЛЫ МОЛЧА.
   Правило связи языков (п.5) делает нерусскую генерацию умолчанием, а
   11.1 научила опознавать подраздел по позиции только
   regenerateSubsection и pause-resume («По факту 11.1» пп.1, 6).
   a. Ядро resolveSubsection вынести из generation-service туда, откуда
      его может импортировать context-builder (html-parser — единственная
      точка linkedom): context-builder generation-service импортировать
      не может (анти-цикл 2.1). findSubsection и перегенерация —
      прежние сигнатуры;
   b. extractRelevantIntraSectionContext (context-builder), разбор
      рекомендаций (recommendations: поиск подразделов,
      thesisLabelsFromHtml, sourceHashFor; recommendation-planner:
      recommendationProseOf) и element-step (сейчас точный
      extractSubsectionContent) ищут подраздел через resolveSubsection и
      читают по actualName; ключи карт и адреса рекомендаций остаются
      каноническими;
   c. импорт: предупреждения разбора графа (ParsedGraph.warnings) — в
      warnings ответа импорта (ImportPage их показывает);
   d. SectionFull аддитивно несёт parseWarnings раздела (из генлога) —
      показ в 11.3.
   spliceSubsectionHtml при неопознанном подразделе по-прежнему
   дописывает в конец раздела — тем же путём заполняются пропущенные
   подразделы (1.4b); не менять.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не подключать каталог на клиенте и не делать переключатель — 11.3;
- не переводить data-строки и не трогать таксономию — 11.4;
- не пропускать data-section через tl() ни в каком месте;
- не менять lang уже созданных синтезов: перегенерация, режимы и правки
  идут на языке документа, а не на текущем языке пользователя;
- не отключать и не ослаблять сторожей, чтобы они позеленели.
```

**Последующие запросы:**
- «Протестируй плюралы: `tl(…, "{n, plural, one {# рекомендация} few {# рекомендации} many {# рекомендаций} other {# рекомендации}}", {n})` при n = 1, 3, 5, 21 даёт правильные формы; в английском каталоге — one/other»
- «Протестируй import: перевод с формами не своего языка (few в английском) → отказ с указанием ключа»
- «Протестируй связь языков: PATCH uiLocale=de → ui_locale=de и gen_lang=German; PATCH genLang=French → ui_locale не изменился; PATCH uiLocale=fr → 400 с details.uiLocale»
- «Протестируй язык запроса: вошедший с ui_locale=en получает английское сообщение об ошибке; гость с Accept-Language: de — немецкое (если перевод есть) или русское; без заголовков — русское»
- «Протестируй codemod: после применения `check:integration` зелёный, `typecheck` 0, `audit` чист; MODE_UI и подзаголовок остались литералами»
- «Протестируй имена подстановок: в strings.json нет подстановок `value`, `recs2`, `lc2` — у всех говорящие имена»
- «Протестируй лог и промпты: генерация с lang=Russian после codemod'а даёт побайтово тот же системный промпт, что до него»
- «Протестируй Д-16: раздел с переведёнными атрибутами data-section при совпадающем числе подразделов → intra-контекст перегенерации соседнего подраздела не пуст, рекомендация с каноническим адресом находит подраздел, в генлоге предупреждение об опознании по месту; импорт такого файла отдаёт предупреждения разбора в ответе; SectionFull несёт parseWarnings»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 11.2 (2026-09-27) — текст запроса против кода и найденное:** → `docs/08-history.md`, глава «Беседа 11.2», подраздел «По факту 11.2 (2026-09-27) — текст запроса против кода и найденное».

### Беседа 11.3: Клиент — язык интерфейса и переключатель (клиент)

**Контекст для загрузки:**
- `03-specification.md` (§2.1 с правками 11.2), `04-code-reuse-map.md`, `05-file-structure.md`
- `docs/fragments-for-conversations/5-6-ui-kit.md` + `.css` + `.html` — переключатель языка в шапке и в профиле; палитра закрытая, новые классы отдельным блоком, после правки css-parity
- `scripts/i18n/README.md` (раздел «Что остаётся ручной работой»), отчёт `i18n:codemod` о `static`-строках
- Из предыдущих бесед:
  - `client/src/stores/auth-store.ts` (0.6), `client/src/components/layout/Header.tsx` (1.6b/8.7 — гостевая шапка), `client/src/pages/ProfilePage.tsx` (0.6/7.1)
  - `client/src/components/synthesis/SynthesisForm.tsx` (1.5 — `LANG_OPTIONS`, `langChoice` с жёстким «Russian»)
  - `client/src/components/synthesis/PauseModal.tsx` (единственная строка с JSX в подстановке)
  - из 11.2: `locales.ts`, плюралы, `generated/*.json`, поля `uiLocale`/`genLang`
- Исходник: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседа 6.2 (п. 2–4) — капитель; «Node is detached» при клике по перерисованному; статус после перечитывания
- §2, беседа 9.2 — React 19 переписывает `innerHTML` при смене ссылки `{__html}`
- §2, беседа 8.4 — `css-parity`, новые классы блоком
- §4, беседа 5.4 — прокси vite зашит на :3000
- `StrictMode` в режиме разработки удваивает эффекты: загрузка каталога обязана быть идемпотентной, а замер числа запросов — делаться на сборке, а не на `npm run dev`

**Первый запрос:**
```
Подключаю язык интерфейса на клиенте. Сервер готов беседой 11.2:
tl() с плюралами, каталоги generated/en.json и de.json, PATCH /auth/me
с правилом связи языков, язык запроса на сервере.

ИСХОДНОЕ СОСТОЯНИЕ. Код уже на tl() (codemod в 11.2), но на клиенте
каталог не подключён: всё русское. Форма создания открывается с
жёстким langChoice = "Russian". static-строки — константы уровня модуля,
вычисляемые при импорте: при смене языка они НЕ обновятся (подписи
статусов SynthesisCard, словари EditPlanPanel, CascadePanel, EditModal и
др.). Число считать ПО КОДУ: отчёт codemod'а (282), README (251) и
отметки таблицы (263) расходятся; в клиенте 11.3 нашла 242 вызова tl()
вне функций в 41 константе 28 файлов (сканер scanStaticCalls).

Прикреплены: specification §2.1, UI-кит, README и отчёт codemod'а,
auth-store, Header, ProfilePage, SynthesisForm, PauseModal, файлы 11.2.

1. client/src/i18n/i18n-store.ts: текущий язык, загрузка каталога по
   требованию (динамический import generated/<lang>.json — русский не
   грузится вовсе), setCatalogProvider. Язык: вошедший — uiLocale из
   /auth/me; гость — cookie ui_locale → navigator.language → ru.
   Смена языка перерисовывает интерфейс БЕЗ перезагрузки страницы.

2. useT() — хук-подписка на смену языка, чтобы компоненты
   перерисовывались. tl() остаётся вызовом без хука там, где он вне
   компонентов.

3. Переключатель ru / en / de — в шапке (и у гостя, и у вошедшего) и в
   профиле. Самоназвания языков («Русский», «English», «Deutsch») НЕ
   переводятся и в каталог не идут.
   Вошедший: PATCH /auth/me { uiLocale } — сервер сам ставит gen_lang.
   Гость: cookie ui_locale.

4. SynthesisForm открывается с gen_lang пользователя (из /auth/me), а не
   с «Russian»; при пустом — genLangForUi(текущий язык интерфейса).
   Смена языка в форме → PATCH /auth/me { genLang } (интерфейс НЕ
   меняется — правило владельца). Подписи LANG_OPTIONS — самоназвания,
   не переводить; «Другой…» — переводить.

5. STATIC-строки (по коду): превратить в функции, вызываемые при
   отрисовке, либо хранить ключи и звать tl() в месте показа. Правило
   выбора: если константа нужна и вне отрисовки (сравнения, отправка на
   сервер) — хранить ключи; если только для показа — функция. МАШИННЫЕ
   значения, которые codemod 11.2 обернул в tl() (имена data-section,
   операции контракта рекомендаций), — назад в литералы + MIRROR_EXCLUSIONS.
   Критерий готовности: `npm run i18n:check` — «static в клиенте: 0»
   (сканер scanStaticCalls вызовов tl() вне функций; отчёт i18n:codemod
   после применения codemod'а пуст всегда и критерием быть не может);
   то же проверяет сторож 4ax. Правка 11.3.

6. PauseModal (synthesis.pauseModal.keyInvalid): JSX-элемент в
   подстановке — разбить строку на две части вокруг элемента либо
   вынести элемент за пределы переводимого текста.

7. Сторож 4-серии: в клиенте нет вызовов tl() на уровне модуля (static
   = 0); переключатель пишет uiLocale через api, а не в обход; форма не
   содержит жёсткого "Russian" по умолчанию.

8. ДОЛГ Д-16, показ (§12): раздел с непустыми parseWarnings (SectionFull,
   11.2) — ВЛАДЕЛЬЦУ пометка «разобран с потерями» у раздела с раскрытием
   списка (текст — через tl(), классы — блоком 11.3). Чужому и гостю —
   нет: предупреждения берутся из генлога, а логи — под флагом автора.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не править сервер: при нехватке — строка в §12 с адресатом;
- не переводить data-строки — 11.4;
- не менять язык уже созданного синтеза при смене языка интерфейса;
- не переводить значения data-section, названия разделов в оглавлении,
  пришедшие из документа (они на языке генерации документа).
```

**Последующие запросы:**
- «Протестируй переключение в браузере (Chrome 131): гость меняет язык → шапка, лендинг и каталог на английском без перезагрузки; перезагрузка страницы — язык сохранился (cookie)»
- «Протестируй связь: вошедший переключает интерфейс на немецкий → форма создания открывается с German; меняет язык генерации на French → интерфейс остался немецким»
- «Протестируй static: после смены языка подписи статусов в карточках каталога, шаги плана в EditPlanPanel и заголовки EditModal — на новом языке, не на прежнем»
- «Протестируй созданный синтез: документ на русском, интерфейс переключён на английский → перегенерация раздела идёт по-русски (lang документа), интерфейс вокруг — английский»
- «Протестируй число запросов на сборке (vite build + preview): смена языка грузит каталог один раз; повторная смена на тот же язык — ни одного запроса»
- «Протестируй пометку разбора (Д-16): раздел с parseWarnings — владелец видит пометку и список предупреждений; чужой зарегистрированный и гость — нет»
- «Прогони css-parity после добавления блока 11.3: расхождений 0»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 11.3 (2026-09-28) — текст запроса против кода и найденное:** → `docs/08-history.md`, глава «Беседа 11.3», подраздел «По факту 11.3 (2026-09-28) — текст запроса против кода и найденное».

### Беседа 11.4: Данные и переводы (бэкенд + клиент + таблица)

**Контекст для загрузки:**
- `02-data-model.md` (таксономия §2.x, каталоги типов), `03-specification.md` (§2.13 таксономия)
- `04-code-reuse-map.md`, `05-file-structure.md`
- `scripts/i18n/README.md`, `strings.json` (410 ключей с отметкой `data` — по таблице после 11.3; 376 в исходном тексте устарело уже к закрытию 11.2)
- Из предыдущих бесед:
  - `server/services/element-taxonomy.ts` (0.3b/5.3), `scripts/seed/seed-taxonomy.ts`
  - `server/services/mode-service.ts` и клиентские режимы (зеркало `MODE_UI`, оставленное литералом в 11.2)
  - подзаголовок документа: `DocumentHeader.tsx` и экспорт (зеркало, оставленное литералом в 11.2)
  - `packages/shared/constants/*` — общие константы, которые читают и промпты, и интерфейс
  - `server/integration-check.mts`
- Исходник: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §3, беседа 0.3b — сиды идемпотентны; кэш реестра в Redis не сбрасывается сидами
- §1, беседа 0.3 — jsonb не хранит порядок ключей
- §8, беседа 7.1 — «нет ✗» ложно ловит «0 ✗»

**Первый запрос:**
```
Перевожу данные, которые видит человек, и заполняю переводы.

ИСХОДНОЕ СОСТОЯНИЕ. 410 строк в strings.json помечены data (считать по
таблице: `node -e` по полю data; 376 — устаревшее число): их читают
И промпты, И интерфейс (общие константы, сиды БД, зеркала MODE_UI и
подзаголовка). Переводить их в самих константах нельзя — промпты и
разбор документа получат не тот язык. Колонка de пуста; en — черновик
на все 2257 ключей.

Прикреплены: data-model, specification §2.13, README, strings.json,
element-taxonomy, seed-taxonomy, mode-service и клиентские режимы,
DocumentHeader и экспорт, shared/constants, integration-check.

1. ПЕРЕВОД ПО МЕСТУ ПОКАЗА для data-строк: в местах отрисовки —
   карта «значение → ключ» (displayKey(value)) и tl(displayKey, value).
   Константы, промпты, разбор и БД остаются русскими. Зеркала MODE_UI и
   подзаголовок — так же: сторожа 4x/4y сравнивают русский как прежде.

2. Таксономия (типы категорий и связей) — в интерфейсе через ту же
   карту; в БД и промптах — русский ключ, как и было. Пользовательские
   типы (созданные администратором) — показывать как есть, без перевода.

3. Заполнение: i18n:export --lang de → файл для переводчика;
   машинный черновик de влить с --draft (отметка черновика). Вычитка en
   и de — задача владельца: беседа выдаёт файл и описывает, как вливать
   вычитанное (i18n:import снимает отметку draft).

4. i18n:check --strict — в check:integration: у каждого ключа есть все
   языки (черновик считается), подстановки и наборы плюральных форм
   совпадают, голой кириллицы в JSX нет.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не переводить данные в константах, сидах и БД;
- не выдавать машинный перевод за вычитанный: draft снимает только
  человек;
- не трогать data-section и промпты.
```

**Последующие запросы:**
- «Протестируй data по месту показа: интерфейс на английском → типы связей в панели графа по-английски, а в БД и в промпте следующей генерации — по-русски»
- «Протестируй зеркала: режимы в английском интерфейсе подписаны по-английски, `check:integration` 4x/4y зелёные»
- «Протестируй цикл переводчика: export de → изменить три строки → import без --draft → отметка draft снята только у них»
- «Протестируй сторож: удалить перевод одного ключа → `i18n:check --strict` в `check:integration` красный с указанием ключа»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 11.4 (2026-09-28) — текст запроса против кода и найденное (первый запрос):** → `docs/08-history.md`, глава «Беседа 11.4», подраздел «По факту 11.4 (2026-09-28) — текст запроса против кода и найденное (первый запрос)».

**По факту 11.4 — тестовые запросы и закрытие (2026-09-29):** → `docs/08-history.md`, глава «Беседа 11.4», подраздел «По факту 11.4 — тестовые запросы и закрытие (2026-09-29)».

### Фаза 12 (добавлена 2026-09-23, разделена 2026-09-29): закрытие долгов

> Заведена по реестру §12, перестроенному ревизией 2026-09-23 (вне бесед):
> все блоки «По факту», прежний реестр и NEXT-CONTEXT сверены с кодом,
> дефекты и недоделки отделены от отступлений. Двадцать восемь строк
> «Д-N» — и ни у одной не было адресата: большая часть найдена задним
> числом или оставлена последней беседой фазы. Прецедент — Фаза 7
> (долги §12 и доводка), но одной беседой, как 7.1, этот объём не
> поднять.
>
> **Почему после Фазы 11.** Codemod 11.2 переписал около 2300 литералов
> клиента; клиентские правки до него (второй шаг кнопок Д-17, тексты Д-2)
> дали бы конфликты и лишний проход сторожей, после — сразу пишутся через
> `tl()`. Д-16 закрыт внутри 11.2/11.3; Фаза 11 добавила Д-31, Д-32, Д-33.
>
> **Почему пять бесед, а не три (решение пользователя 2026-09-29).** В
> прежней раскладке серверная 12.1 несла двадцать долгов из шести
> подсистем (правка элементов, импорт, экспорт, планы и рекомендации,
> биллинг, реестр промптов), клиентская — интерфейс вперемешку с графом и
> его экспортными двойниками, оснастковая — харнессы вместе с
> инструментами переводов. Беда была не в числе пунктов (больше половины
> — на несколько строк), а в ширине: каждой подсистеме нужны свои главы
> 08, свои «По факту» и свой мок, а первый запрос целиком держит всё это
> разом. Новая раскладка режет по подсистемам, чтобы контекст беседы был
> однородным:
> - **12.1 «Правка документа и импорт»** — Д-1, Д-3, Д-4, Д-5, Д-8, Д-14
>   (откат капсулы), Д-31 — **ЗАКРЫТА 2026-10-05**;
> - **12.2 «Экспорт и граф»** — Д-9 целиком (разбор и отрисовка), Д-10,
>   Д-29, Д-30 и (зачислены 2026-10-05 по итогам 12.1) Д-36, Д-37 — разбор
>   прозы тезисов и извлечение названия: тот же импорт и тот же файл
>   концепции; сервер и клиентский граф — одной беседой, потому что
>   двойники клиент ↔ экспорт сверяет сторож 4y — **ЗАКРЫТА 2026-10-06**;
> - **12.3 «Планы, рекомендации, биллинг, реестр»** — Д-6, Д-7 (сервер),
>   Д-11, Д-12, Д-13, Д-18, Д-19 (сервер), Д-20, Д-21, Д-32 и заведённые и
>   сделанные в ней же Д-46, Д-47 (Д-11 переведён в ограничения — Огр-12) —
>   **ЗАКРЫТА 2026-10-06**;
> - **12.4 «Долги интерфейса»** — Д-2, Д-7 (футер), Д-14 (вход), Д-15,
>   Д-17, Д-19 (форма), Д-22 и зачисленные по итогам 12.1 и 12.2 Д-34,
>   Д-35, Д-41, Д-42 (пп.8–11 её первого запроса);
>   по итогам 12.3 — Д-44 и Д-48 (пп.12–13) — **ЗАКРЫТА 2026-10-12**
>   (сервер правился дважды: зеркало бейджа и `id` в DTO разделов —
>   решение пользователя);
> - **12.5 «Харнессы, инструменты переводов, доки»** — Д-24…Д-28, Д-33 и
>   зачисленные по итогам 12.1 и 12.2 Д-38, Д-39, Д-40, Д-43 (пп.6–9 её
>   первого запроса); Д-40 и Д-43 правят продукт — оговорённое исключение
>   (решение пользователя 2026-10-06).
>   По итогам 12.3 зачислен Д-45 (п.10). По итогам 12.4 — Д-49 и Д-50
>   (пп.12–13; обе правят сервер — то же исключение, назначение при
>   закрытии 12.4 по вопросу пользователя), Д-45 пополнен (test-62,
>   test-71) — **ЗАКРЫТА 2026-10-13; Фаза 12 ЗАКРЫТА, реестр §12 пуст**
>   (продукт правился в четырёх названных местах; найденное харнессами —
>   перечитывание снапшота по повтору паузы — следствие Д-50).
>
> **Порядок ЖЁСТКИЙ: 12.1 → 12.2 → 12.3 → 12.4 → 12.5.** 12.2 после 12.1:
> обе трогают импорт (метки тезисов при разборе — 12.1, снятие следов
> оглавления — 12.2). 12.4 после 12.1 и 12.3: клиенту нужны признак
> обновлённой капсулы (12.1), раздельная оценка плана и бюджет контекста
> в `/estimate` (12.3). 12.5 — последней: она перепрогоняет старые
> харнессы, и их ломали бы правки, сделанные после неё; её сторож
> «значение данных без строки таблицы» (Д-33) заодно проверит строки,
> заведённые 12.1–12.4.
>
> **Квирки исходника Д-9 и Д-10 исправляются** (решение пользователя
> 2026-09-23): ноль характеристики, читаемый как 0.5, и один цвет у
> типов, чьи названия вложены друг в друга. Это отступление от исходника
> — отметить в «По факту 12.2». Там же утраты HTML-экспорта против
> исходника: оглавление (Д-29) и генеалогическое древо в шапке (Д-30).
> Д-23 (гейт активной операции в памяти процесса) — ограничение Огр-11:
> долгом становится вместе с горизонтальным масштабированием (01 §7).
>
> Сквозное правило фазы: **каждый пункт первого запроса — строка §12
> с номером**; закрытая строка уходит из §12 в 08 Часть IV с датой и
> итогом (07 §10). Нашлось по ходу новое — новая строка «Д-N» с адресатом,
> а не правка походя. Новые видимые человеку строки — через `tl()`
> (данные — `tData` по месту показа), с черновиками en/de через
> `i18n:import --draft`: `i18n:check --strict` входит в `check:integration`.

---

### Беседа 12.1: Правка документа и импорт (бэкенд)

**Контекст для загрузки:**
- `07-conversation-protocol.md` §12 — строки с адресатом 12.1 (источник задач) и «По факту» 1.6, 4.3, 5.1, 8.5, 8.6, 9.2, 10.1, 11.2, 11.3
- `02-data-model.md` (§2.3 syntheses, §2.9 theses, §2.12 element_versions), `03-specification.md` (§2.1 язык ответов, §2.3 sections, §2.4 версии и откат, импорт)
- `04-code-reuse-map.md`, `05-file-structure.md`
- Из предыдущих бесед:
  - `server/services/element-renderer.ts` (5.1 — сводная таблица тезисов, `String(t.thesisNum)`), `element-parser.ts` (1.4 — `parseInt(td[0]) || fallbackNum`), `element-editor.ts` (5.1 — `replaceThesisParagraph`; 9.2 — `updateSubsection`, `getSubsectionSource`), `element-versioning.ts` (`RESTORE_FIELDS`, откат версии `section`), `server/utils/html-parser.ts`
  - `server/services/recommendations.ts` (10.1 — `thesisLabelsFromHtml`, `guardRows`: только сведение метки с тезисом, остальное — 12.3)
  - `server/services/generation-service.ts` (`extractTitleFromNameHtml`, `applySectionSideEffects` — образец, НЕ звать)
  - `server/routes/sections.ts` (`/:key/context`, `isSectionKey`, `loadSectionParseWarnings`), `effectiveFlags`/`logsAllowed` (8.6)
  - `server/services/import-service.ts` (4.3/8.5 — `validateImportMeta`, `extractMetadata`)
  - `server/db/schema.ts` + миграции (следующая — 0011)
  - `server/integration-check.mts` — секция 4aw (строка `parseWarnings: await loadSectionParseWarnings(...)`), образец 11.x
- Живой файл одностраничника (как T103_FILE): Д-1 и Д-8 воспроизводятся только на нём
- Исходник: НЕ НУЖЕН. Дизайн-набор: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседы 10.1–11.1 — текст запроса против кода: первый ход — `grep -rn 'имя('` по каждой названной функции и выписать расхождения ДО кода
- §3, беседа 7.1 — `drizzle-kit generate` даёт случайный тег миграции
- §1, беседа 0.3 — jsonb не хранит порядок ключей: `canonical()`
- §4, беседа 11.4 — предпосылки харнесса одной командой (резолв пакетов, `tsx`, столбцы схемы) ДО написания теста
- §8, беседа 7.1 — «нет ✗» ложно ловит «0 ✗»

**Первый запрос:**
```
Закрываю долги реестра §12 с адресатом 12.1 — правка документа и
импорт. Экспорт, граф, планы, рекомендации (кроме меток тезисов),
биллинг и клиент не трогаю: при нехватке — строка §12 с адресатом.

Прикреплены: §12 и «По факту» из списка, модель данных и спецификация
(разделы в контексте беседы), файлы сервисов и роутов из списка,
integration-check.mts, живой файл.

0. ПЕРВЫЙ ХОД — сверка текста с кодом: по каждому пункту ниже grep
   названных функций; расхождения выписать ДО правок.

1. Д-1. Метки тезисов. Импортированный одностраничник нумерует тезисы
   «О-1», «Э-2»; theses.thesis_num — целое (parseInt → NaN →
   порядковый); рендерер 5.1 перерисовывает сводную таблицу с целыми
   числами, и после любой правки тезиса буквенные метки из таблицы
   пропадают — сторож 10.1 (thesisLabelsFromHtml) их больше не находит,
   рекомендации к «Э-N» в следующем раунде 'invalid'.
   Сделать: хранить метку тезиса так, как её записал документ (колонка
   theses.label text NULL — миграция; NULL у документов службы, где
   метка = номер), парсер 1.4 и импорт 4.3 её заполняют, рендерер
   рисует label ?? thesisNum, сторож сводит метку с тезисом по колонке,
   а не только по таблице. Откат версии тезиса метку сохраняет
   (RESTORE_FIELDS).

2. Д-3. Проза тезиса после ручной правки подраздела. updateSubsection
   (9.2) не трогает theses.justification — следующая правка тезиса
   редактором 5.2 (replaceThesisParagraph) перепишет абзац по старому
   значению. Сделать: после правки подраздела раздела theses разобрать
   абзацы «<strong>формулировка</strong> обоснование» и обновить
   formulation/justification СОВПАВШИХ тезисов точечно, с версией
   'manual' на каждый изменённый; applySectionSideEffects НЕ звать
   (заменяет строки — осиротеют версии и обогащения, «По факту 9.2»
   п.10). Несовпавший абзац — предупреждение в ответе, а не удаление.

3. Д-4. Правка раздела name. После updateSubsection раздела name —
   extractTitleFromNameHtml и обновление syntheses.title, НО только если
   текущее название совпадает с извлечённым из раздела ДО правки
   (владелец не переименовывал концепцию отдельно ✎ 8.4 — его выбор
   не затирать).

4. Д-5. GET …/sections/sum/context → 404: ключ проверять isSectionKey,
   как 9.2 сделала у себя. Выяснить, что buildContextForSection отдаёт
   для sum, и записать в «По факту».

5. Д-8. Импорт без ложной критичности. validateImportMeta: 0 философов
   критично, только если нет ни философов, ни участников-концепций И
   документ не свободный синтез (seed без участников легален с v11 —
   NO_PARTICIPANTS_SEED_REQUIRED). Имена в ёлочках в params.phil
   одностраничника, совпавшие с концепциями genealogy, философами не
   считать. Подзаголовок «На основе: …» мета-синтеза не резать по запятой
   в один элемент.

6. Д-14 (серверная половина). Откат версии раздела capsule
   синхронизирует syntheses.capsule_html (сегодня — только
   sections.html_content); ответ отката несёт признак, что капсула
   обновлена.

7. Д-31. parseWarnings уходит чужому читателю: GET …/sections/:key
   кладёт поле любому читателю ступени full, а предупреждения — из
   генлога, логи же — под флагом автора (8.6, logsAllowed). Отдавать
   parseWarnings владельцу и при effectiveFlags(...).showLogs, иначе поле
   опускать. Сторож 4aw проверяет строку `parseWarnings: await
   loadSectionParseWarnings(...)` — переписать под условие, не снимать.

8. Сторож в check:integration (следующая серия — по NEXT-CONTEXT): по
   пункту на долг — рендерер рисует метку, откат капсулы синхронен,
   isSectionKey в /:key/context, parseWarnings под условием; живьём —
   правка подраздела theses обновляет justification, импорт свободного
   синтеза без критичных предупреждений.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не трогать клиент (вход в историю раздела — 12.4);
- не трогать экспорт и граф (12.2), планы, рекомендации сверх меток
  тезисов, биллинг и реестр (12.3);
- не звать applySectionSideEffects при ручной правке;
- не пропускать data-section через tl().
```

**Последующие запросы:**
- «Протестируй Д-1 на живом файле (как R8 test-103): правка тезиса «Э-2» → сводная таблица сохранила буквенные метки; повторный разбор критики находит рекомендацию к «Э-3»; документ службы — метки целые, как прежде»
- «Протестируй Д-3/Д-4: правка подраздела тезисов меняет обоснование в прозе → theses.justification обновлён, версия 'manual'; затем правка того же тезиса редактором не возвращает старый текст. Правка раздела name → название концепции обновлено; после ручного переименования ✎ — не тронуто»
- «Протестируй Д-5/Д-14/Д-31: GET …/sections/sum/context → 200; откат версии капсулы → шапка документа показывает прежнюю капсулу, ответ отката несёт признак; parseWarnings — владельцу и при флаге логов, чужому без флага — поля нет»
- «Протестируй Д-8: экспорт свободного синтеза → импорт → ни одного критичного предупреждения; живой файл (T85_FILE) — концепция в ёлочках не числится философом»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`»
- «Ревью: перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»
- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10)

---

**По факту 12.1 (беседа закрыта 2026-10-05).** → `docs/08-history.md`, глава «Беседа 12.1», подраздел «По факту 12.1 (беседа закрыта 2026-10-05)».

### Беседа 12.2: Экспорт и граф (бэкенд + клиентский граф)

**Контекст для загрузки:**
- `07-conversation-protocol.md` §12 — строки с адресатом 12.2 и «По факту» 1.7, 4.2, 4.3, 5.1, 8.6, 9.2, 11.1, 12.1
- `03-specification.md` (экспорт и импорт), `04-code-reuse-map.md`, `05-file-structure.md`
- Из предыдущих бесед:
  - `server/services/export/html-exporter.ts` (шапка-зеркало, `renderDocFooter` 8.6 — образец восстановленной утраты, построение `genealogy` встроенного состояния), `server/utils/css-audit.ts` (`auditCSS`); образцы разметки — `client/src/components/document/TableOfContents.tsx` (1.6b) и `client/src/components/lineage/GenealogyTree.tsx` (3.2)
  - `server/services/import-service.ts` (`extractSections` — снятие следов оглавления), `server/services/graph-parser.ts` (`parseFloat(td[…]) || 0.5` — центральность, уверенность, сила)
  - разбор прозы тезисов и название (Д-36, Д-37; зачислены из 12.1): `server/services/element-parser.ts` (`buildJustificationIndex`, `parseThesisParagraphs`, `thesisLabelOf`), `server/utils/html-parser.ts` (`replaceThesisParagraph`), `server/services/element-editor.ts` (`planThesisProseSync`, `patchThesisParagraph`), `server/services/generation-service.ts` (`extractTitleFromNameHtml`) и его копии — `resolveConceptName` в `import-service.ts` и в `client/src/utils/genealogy.ts` (дрейф-сторож 4z); образцы проверок — `tests/smoke-121-request1.mjs`, `tests/test-121-requests2-5.mjs`
  - граф и его экспортные двойники — правятся вместе: `client/src/components/graph/graph-utils.ts` (`typeColor`, `edgeTypeStyle`, палитра по сидам), `Graph2D.tsx`, `Graph3D.tsx`, `EdgePanel.tsx`, `client/src/utils/graph-physics.ts`; `server/services/export/graph-style.ts`, `graph-physics.ts`, `mmd-exporter.ts`, `png-exporter.ts`
  - просмотрщик экспортированного файла — ГЕНЕРАТ `server/config/export-assets.ts` (`scripts/extract-export-assets.mjs`); образец надстройки над генератом — `server/config/lang-templates.ts` (11.1)
  - `server/integration-check.mts` — секция 4y (клиент ≡ экспорт), 4x/4y/4ay (экспорт-зеркала остаются русскими)
- Живой файл одностраничника (как T92_FILE): на нём проверяется снятие якорей оглавления при импорте
- Исходник: только для справки — исходник снимал `docHTML` с `#docOutput` ДО удаления оглавления (оглавление уезжало в файл), древо было раскрывающимся блоком шапки (`renderGenealogyTree`). Дизайн-набор: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседы 10.1–11.1 — текст запроса против кода: первый ход — grep по каждой названной функции
- §2, беседа 10.1 — генераты рукой не правятся; отступление — надстройкой, смоук снимает её перед байтовой сверкой
- §2, беседа 11.4 — экспорт-зеркала и константы остаются русскими: `tl()`/`tData()` в модулях экспорта ловят 4x/4y/4ay
- §4, беседа 11.3 — браузер на СБОРКЕ клиента, каждый персонаж в своём browser context
- §4, беседа 11.4 — предпосылки харнесса одной командой ДО написания теста

**Первый запрос:**
```
Закрываю долги реестра §12 с адресатом 12.2 — экспорт и граф, а также
два долга разбора, зачисленные из 12.1 (Д-36, Д-37). Сервер правлю в
экспорте, импорте (только снятие следов оглавления), разборе графа,
разборе прозы тезисов и извлечении названия; клиент — только граф и
копия resolveConceptName. Прочее — строка §12 с адресатом.

Прикреплены: §12 и «По факту» из списка, файлы экспорта, импорта, графа
клиента и его экспортных двойников, генерат ассетов и образец
надстройки, integration-check.mts, живой файл.

0. ПЕРВЫЙ ХОД — сверка текста с кодом: grep названных функций и
   сторожей 4y; расхождения выписать ДО правок.

1. Д-29. Оглавление в HTML-экспорте. Шапка html-exporter.ts ошибочно
   ссылается на исходник: тот снимал docHTML ДО удаления docTOC, и
   оглавление с ⏫ уезжало в файл. Построить оглавление по образцу
   TableOfContents (1.6b: слуг, порог «< 2», пропуск капсулы, ⏫ у
   разделов и подразделов) серверной разметкой; правила #docTOC и
   .toc-back-btn обязаны пережить auditCSS. Импорт (extractSections)
   следы оглавления снимает: ⏫ из заголовков и якоря subsec-… перед
   <h4> — так чистым становится и живой файл одностраничника («По
   факту 9.2» п.18). Комментарий в шапке html-exporter исправить.
   Дрейф-контроль слуга и порога клиент ↔ экспорт — сторожем.

2. Д-30. Генеалогическое древо в шапке HTML-экспорта — раскрывающийся
   блок «Генеалогическое древо» (header-disclosure-genealogy, как в
   исходнике) из того же дерева, что genealogy встроенного состояния;
   разметка — как GenealogyTree 3.2 в тёмной схеме шапки, капсулы
   родителей — так же, как во встроенном состоянии. Только у
   мета-синтеза (есть концепции-родители); импорт блок игнорирует
   (дерево читается из встроенного состояния). Флаги видимости 8.6 на
   древо не влияют — генеалогия есть метаданные (как parentSyntheses).

3. Д-9, РАЗБОР. graph-parser читает характеристики как
   parseFloat(ячейка) || 0.5 — ноль ложен, и законное 0 становится 0.5.
   Разбор: не число → 0.5, число (включая 0) — как есть. Отрисовка —
   п.4 этой же беседы.

4. Д-9, ОТРИСОВКА. `(x || 0.5)` → `(x ?? 0.5)` везде, где рисуется или
   считается характеристика: Graph2D, Graph3D, EdgePanel, graph-physics
   клиента и экспорта, mmd- и png-экспорт, просмотрщик экспортированного
   файла (надстройкой над генератом ассетов, генератор не править; смоук
   ассетов снимает надстройку перед сверкой с исходником — приём 11.1).
   Разбор (п.3) пишет 0 в БД. Следствие, которое проверить глазами:
   связь силой 0 — самая тонкая и не тянет концы (это и значит 0).

5. Д-10. Цвет типа. typeColor и edgeTypeStyle: сначала ТОЧНОЕ
   совпадение с ключом палитры (все типы графа в ней есть дословно),
   нечёткое «содержит» — только запасным ходом для строк, которых в
   палитре нет; базовый оттенок при построении палитры — по САМОМУ
   ДЛИННОМУ совпавшему сиду, а не по первому («феноменологическая»
   получает свой 275, а не 168 «логическ»). Одинаково в клиенте, в
   graph-style экспорта и в просмотрщике экспортированного файла
   (надстройка, как п.4); 4y — зелёный.

6. Д-36 (зачислен из 12.1). Разбор обоснований тезисов знает одну
   раскладку — «<strong>формулировка</strong> обоснование» одним
   абзацем. Живой документ пишет иначе: <h5>Тезис О-1 (…)</h5>, абзац из
   одной жирной формулировки, следующий абзац «<strong>Обоснование.
   </strong> …»; формулировка в прозе переписана относительно сводной
   таблицы. Итог: theses.justification пуст у всех тезисов, редактор 5.2
   абзац не находит (htmlSync.pending), сведение 12.1 даёт одни
   предупреждения («По факту 12.1» п.4). Сделать ВТОРУЮ модель абзаца с
   якорем по МЕТКЕ тезиса (theses.label, 12.1) в <h5>:
   buildJustificationIndex и parseThesisParagraphs её читают,
   replaceThesisParagraph пишет обоснование в абзац «Обоснование.», а
   формулировку — в абзац формулировки, planThesisProseSync сводит блок
   тезиса по метке. Первая модель (документы службы) — без изменений;
   прочие абзацы блока («Ограничения…», списки) не трогать. Уже
   импортированные концепции с пустым justification не дозаполнять
   миграцией — только новый разбор и правка.

7. Д-37 (зачислен из 12.1). extractTitleFromNameHtml на
   «<strong>«X»: подзаголовок</strong>» отдаёт «X»» — кавычки снимаются
   ДО разреза по двоеточию. Снимать и после. Те же строки — в копиях:
   resolveConceptName в import-service и в client/src/utils/genealogy.ts
   (дрейф-сторож 4z). Уже записанные названия с ёлочкой не чинить.

8. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   обе раскладки абзаца тезиса разбираются и пишутся (круг
   parse → replaceThesisParagraph → parse), название без хвостовой
   ёлочки в трёх копиях;
   оглавление и древо в выгрузке, слуг и порог оглавления ≡ клиенту,
   разбор без `|| 0.5`, `|| 0.5` у характеристик нет ни в клиенте, ни в
   экспорте, ни в надстройке просмотрщика; typeColor/edgeTypeStyle ищут
   точное совпадение первым (живьём: палитра {логическая, онтологическая,
   эпистемологическая} — три разных цвета); 4y зелёный.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не трогать клиент вне графа и копии resolveConceptName в
  utils/genealogy.ts (12.4);
- не править генератор ассетов экспорта и export-assets.ts рукой —
  только надстройкой;
- не переводить экспорт-зеркала: выгрузка остаётся русской (11.4);
- не трогать Д-23 (ограничение Огр-11).
```

**Последующие запросы:**
- «Протестируй Д-29/Д-30: экспорт мета-синтеза → в файле оглавление со ссылками на все разделы и подразделы, ⏫ ведёт к оглавлению, блок «Генеалогическое древо» в шапке с родителем и его философами; стили на месте (auditCSS не вырезал); экспорт → импорт → разделы без ⏫ и якорей оглавления, дерево прежнее; живой файл одностраничника после импорта — без якорей subsec-… в тексте подразделов»
- «Протестируй Д-9: таблица графа с центральностью «0» и силой связи «0» → в БД 0, а не 0.5; пустая ячейка и «—» → 0.5, как прежде; в браузере (Chrome 131, сборка клиента) связь силой 0 — самая тонкая в 2D и 3D, EdgePanel показывает 0.00; PNG/MMD и граф в экспортированном файле — так же»
- «Протестируй Д-10: граф с типами «логическая», «онтологическая», «феноменологическая» → три разных цвета в клиенте, в PNG и в просмотрщике экспортированного файла; `check:integration` 4y зелёный»
- «Протестируй Д-36/Д-37 на файле концепции: импорт → theses.justification непуст у каждого тезиса с абзацем «Обоснование.»; правка обоснования редактором 5.2 → абзац прозы изменён (patched, не pending), прочие абзацы блока целы; правка абзаца «Обоснование.» в подразделе → theses.justification обновлён, версия 'manual'; документ с одноабзацной раскладкой — как прежде (tests/test-121 зелёный). Название «X»: подзаголовок → «X» без ёлочки при генерации и при импорте»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/, `vite build`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, смоук ассетов экспорта (с надстройкой снятой — побайтно исходник)»
- «Ревью: перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»
- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10)

---

**По факту 12.2 (первый запрос — 2026-10-05).** → `docs/08-history.md`, глава «Беседа 12.2», подраздел «По факту 12.2 (первый запрос — 2026-10-05)».

**По факту 12.2 (тестовые запросы — 2026-10-06).** → `docs/08-history.md`, глава «Беседа 12.2», подраздел «По факту 12.2 (тестовые запросы — 2026-10-06)».

**По факту 12.2 (завершение — беседа закрыта 2026-10-06).** → `docs/08-history.md`, глава «Беседа 12.2», подраздел «По факту 12.2 (завершение — беседа закрыта 2026-10-06)».

### Беседа 12.3: Планы, рекомендации, биллинг, реестр (бэкенд)

**Контекст для загрузки:**
- `07-conversation-protocol.md` §12 — строки с адресатом 12.3 и «По факту» 2.2, 6.1, 7.1, 10.1, 10.2, 10.3, 11.1, 11.4
- `02-data-model.md` (§2.13 edit_plans, §2.32 recommendations), `03-specification.md` (§2.1 язык ответов, §2.2 `/estimate`, §2.6 планы — `estimatedCost`/`costBreakdown`, §2.16 рекомендации)
- `04-code-reuse-map.md`, `05-file-structure.md`
- Из предыдущих бесед:
  - `server/services/plan-executor.ts` (2.2/10.2 — `setPlanStatus(…, "done")` в трёх местах, `confirmStep`, `countBillableSteps`, `slotBillingFor`), `edit-planner.ts` (2.1 — `estimatePlanCost`, `planCostBreakdown`), `server/routes/plans.ts`
  - `server/services/recommendations.ts` (10.1 — `guardRows`, `roundHashOf`, `sourceHashFor`), `recommendation-planner.ts` (10.2 — `decline()`), `server/routes/recommendations.ts` (10.1/10.3 — `extract`, `plan`)
  - `server/routes/syntheses.ts` (`/estimate`, `estimateSynthesisCost`)
  - `server/services/subscription-service.ts` (7.1 — `ensureStripeCustomer`), `stripe-client.ts`; стенд Stripe — `tools/stripe-mock.mjs` (8.2)
  - `server/services/prompt-registry.ts` (`invalidateCache`, `warmCache`), `scripts/seed/seed-prompts.ts`, `seed-configs.ts`
  - `server/config/subsection-map.ts`, `intra-deps.ts`, `subsection-ctx-keys.ts` — ГЕНЕРАТЫ; `server/services/section-defs-builder.ts` (`buildSubsectionMap`)
  - `packages/shared/i18n/{t.ts,data.ts}`, `scripts/i18n/README.md` (порядок export → import → split), опись msg-режима `scripts/i18n/ui-strings-lib.mjs` (Д-32)
  - `server/integration-check.mts` — секции 4as/4at/4au (маршруты рекомендаций и планов считаются), 4n, 4ay
- Исходник: НЕ НУЖЕН. Дизайн-набор: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседы 10.1–11.1 — текст запроса против кода: первый ход — grep по каждой названной функции
- §2, беседа 10.1 — генераты рукой не правятся; отступление — надстройкой
- §7, беседы 10.1/11.1 — кэш реестра бессрочный, правка шаблона мимо API не сбрасывает Redis; `jsonb ||` по верхнему ключу заменяет массив
- §4, беседа 10.1 — мок Claude узнаёт критику ПЕРВОЙ
- §4, беседа 11.4 — предпосылки харнесса одной командой ДО написания теста
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`

**Первый запрос:**
```
Закрываю долги реестра §12 с адресатом 12.3 — планы, рекомендации,
биллинг, реестр промптов. Клиент не трогаю: футер EditModal и форма
создания переходят на серверные поля в 12.4.

Прикреплены: §12 и «По факту» из списка, модель данных и спецификация
(разделы в контексте беседы), файлы сервисов и роутов из списка,
инструменты i18n, integration-check.mts.

0. ПЕРВЫЙ ХОД — сверка текста с кодом: по каждому пункту ниже grep
   названных функций; расхождения выписать ДО правок.

1. Д-6. Статус плана done и plan_updated — ПОСЛЕ освобождения слота
   (plan-executor: три места setPlanStatus(…, "done")). withBusyRetry
   клиента остаётся защитным.

2. Д-7 (серверная половина). Оценка плана без неподтверждённых
   шагов: estimatedCost и costBreakdown считают только confirmed;
   каскадные pending — отдельным полем (число и оценка, если подтвердить
   все), 03 §2.6. Клиентский футер EditModal (10.3) переходит на
   серверные числа в 12.4.

3. Д-11. Ключ раунда рекомендаций: воспроизвести на моке «возврат прозы
   к первой редакции» (A → B → A), установить фактическое поведение и
   либо исправить (сравнение с историей раундов), либо перевести строку
   в ограничения с доводом (на живой модели дословный возврат
   недостижим).

4. Д-12. ensureStripeCustomer: ответ Stripe «No such customer» на
   сохранённый id → обнулить колонку и создать заново (условным UPDATE,
   как сейчас); мок Stripe — маршрут удалённого клиента.

5. Д-13 (сначала проверить). «Межслойная согласованность» — адаптивный
   подраздел critique (при диалоге + формальных разделах) — есть в
   intra_deps и subsection_ctx_keys, но нет в subsection_map.base.critique.
   Выяснить, что при таком составе получает buildSubsectionMap и
   страховка 11.1 по позиции, и ловится ли пропуск подраздела (1.4b).
   Есть симптом — исправить НАДСТРОЙКОЙ (subsection-map.ts — генерат),
   нет — перевести строку в ограничения с результатом проверки.

6. Д-18. Сиды сбрасывают кэш реестра: seed-prompts и seed-configs зовут
   invalidateCache по ключам created/updated (fail-open при мёртвом
   Redis, строкой в отчёте). Предупреждения в deploy/* о перезапуске
   после посева — снять или смягчить.

7. Д-19 (серверная половина). /estimate аддитивно отдаёт
   contextBudget — бюджет активного конфига context_budget для
   глубины запроса, чтобы клиентская копия CONTEXT_BUDGET_PREVIEW
   ушла в 12.4.

8. Д-20. Оценка ретрофита рекомендаций до вызова: маршрут оценки
   extract без обращения к модели (по estimateSubsectionCost 1.1).
   Сторож 4as считает маршруты рекомендаций — поправить счёт вместе с
   маршрутом.

9. Д-21. Сторож 10.1 и столбец «Основание»: основание, которого нет
   среди подразделов критики, — предупреждение строки (не 'invalid':
   основание — довод человеку, исполнению не мешает).

10. Д-32. Сообщение планировщика рекомендаций: decline(r,
    "section_regenerated", "Раздел «…» этим же планом перегенерируется
    целиком — …") — литерал без tl(), и метка раздела внутри
    (KEY_LABELS[host]) тоже не переводится. Сделать: tl(ключ,
    "…{section}…", { section: tData(KEY_LABELS[host]) }) под языком
    запроса; ключ — через i18n:export, черновики en/de — i18n:import
    --draft, затем i18n:split. Опись msg-режима (ui-strings-lib) не
    считает аргумент decline() сообщением — дописать правило, чтобы
    i18n:check видел такие тексты; заодно проверить прочие decline() и
    reason-тексты 10.2.

11. Сторож в check:integration (следующая серия — по NEXT-CONTEXT): по
    пункту на долг — «done» после слота, estimatedCost без pending,
    contextBudget в /estimate, сиды зовут invalidateCache, счёт маршрутов
    4as с оценкой ретрофита, decline() через tl().

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не трогать клиент (футер, форма, панель — 12.4);
- не трогать правку документа и импорт (12.1), экспорт и граф (12.2);
- не править генераты — только надстройки;
- не заводить «выбрать все»/«исполнить все» (правило 10.x).
```

**Последующие запросы:**
- «Протестируй Д-6/Д-7: запрос под гейтом сразу после plan_updated со статусом done → не 409; план «1 бесплатно · 1 платно + каскадные» → estimatedCost только за подтверждённые, pending — отдельным полем»
- «Протестируй Д-12/Д-18: удалить клиента в моке Stripe → пополнение проходит, колонка перезаписана; seed:prompts с изменённым шаблоном → активная версия видна БЕЗ перезапуска сервера»
- «Протестируй Д-11/Д-13 и запиши вывод в «По факту»: исправлено либо переведено в ограничения с доводом»
- «Протестируй Д-19/Д-20/Д-21/Д-32: /estimate несёт contextBudget и он меняется при активации новой версии context_budget; оценка ретрофита без вызова модели (мок не получил запроса); строка с чужим «Основанием» — предупреждение, не invalid; отказ планировщика на en/de (Accept-Language) — переведён вместе с меткой раздела»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`»
- «Ревью: перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»
- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10)

---

**По факту 12.3 (первый запрос — 2026-10-06).** → `docs/08-history.md`, глава «Беседа 12.3», подраздел «По факту 12.3 (первый запрос — 2026-10-06)».

**По факту 12.3 (тестовые запросы и доделки — 2026-10-06).** → `docs/08-history.md`, глава «Беседа 12.3», подраздел «По факту 12.3 (тестовые запросы и доделки — 2026-10-06)».

**По факту 12.3 (завершение — беседа закрыта 2026-10-06).** → `docs/08-history.md`, глава «Беседа 12.3», подраздел «По факту 12.3 (завершение — беседа закрыта 2026-10-06)».

### Беседа 12.4: Долги интерфейса (клиент)

**Контекст для загрузки:**
- `07-conversation-protocol.md` §12 — строки с адресатом 12.4; «По факту» 1.5b, 2.2, 5.2, 8.4, 10.3, 11.3, 12.1, 12.2 (пп.12, 21, 26), 12.3 (поля, которые они завели) — пп.2, 7, 9, 17, 25, 26
- `03-specification.md` (§2.2 `/estimate` с `contextBudget`, §2.4 версии и откат, §2.6 оценка плана — по факту 12.3; §2.16 — `warning` / `issues` строки рекомендации; §4.2 — `EditPlan.cascadePending`), `04-code-reuse-map.md`, `05-file-structure.md`
- `01-architecture.md` §8 — оформление клиента (единство стилей с исходником)
- `docs/fragments-for-conversations/5-6-ui-kit.md` + `.css` + `.html` — второй шаг кнопок, вход в историю раздела; палитра закрытая, новые классы отдельным блоком, после правки css-parity
- Из предыдущих бесед:
  - `client/src/pages/SynthesisPage.tsx`, `CreateSynthesisPage.tsx` (`handleResumeGeneration`, `handleAbort`), `client/src/components/synthesis/PauseModal.tsx` (2.2 — `resumeGenConfirmed`)
  - `client/src/components/edit/VersionHistory.tsx` (5.2/10.3), `ElementEditor.tsx`, `EditModal.tsx`, `EditSectionCard.tsx` (2.3), `client/src/components/document/SectionView.tsx`, `client/src/api/elements.ts`
  - образцы второго шага кнопок: `SynthesisCard.tsx` (8.4), `EdgePanel.tsx` (8.4), `TransformPanel.tsx` (5.5), `LineageCandidateBlock` в `ImportPage.tsx` (8.5)
  - `client/src/pages/ProfilePage.tsx` (удаление аккаунта), `AdminPromptsPage.tsx` (каталоги, роли), `BillingPage.tsx` (API-ключ)
  - `client/src/components/synthesis/SynthesisForm.tsx` (`CONTEXT_BUDGET_PREVIEW`, `FullBudgetPreview`)
  - `client/src/components/graph/GraphModal.tsx` (`gm-hint`), `client/src/globals.css` (часть 3)
  - `client/src/i18n/{i18n-store.ts,useT.ts}` — новые строки через `tl()`
  - зачислено по итогам 12.1 и 12.2 (Д-34, Д-35, Д-41, Д-42): `client/src/components/document/DocumentHeader.tsx` (название, капсула, место бейджа схемы), `client/src/utils/subsection-edit.ts` и `api/sections.ts` (ответ правки подраздела: `titleUpdated`, `thesesUpdated`), `SectionView.tsx` (инлайн-✎ строки тезиса: `data-edit-row`), `ElementEditor.tsx` (`HTML_SYNC_FIELD_LABELS`, заголовок «№{thesisNum}»), `packages/shared/types/{elements,section,synthesis}.ts` (`Thesis.label`, `SynthesisFull.parentContextSchema`); зеркало бейджа — `server/services/export/html-exporter.ts` (`renderDocHeader`; образцы восстановленных утрат шапки — `renderGenealogyDisclosure` 12.2, `renderDocFooter` 8.6), сторож 4y
  - зачислено по итогам 12.3 (Д-44, Д-48): `client/src/components/edit/RecommendationsPanel.tsx`, `client/src/utils/recommendations.ts`, `client/src/api/recommendations.ts`, `packages/shared/types/recommendations.ts` (`Recommendation.warning`, `issues`, `RecommendationIssue`), `packages/shared/types/edit-plan.ts` (`EditPlan.cascadePending`); `SectionView.tsx` — блок `parse-warnings` (вводная фраза и заголовок); `EditModal.tsx` — подпись футера (`edit.editModal.cascadePending`)
- Исходник: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседа 6.2 (п. 2–4) — капитель; «Node is detached» при клике по перерисованному; статус после перечитывания
- §2, беседа 9.2 — React 19 переписывает `innerHTML` при смене ССЫЛКИ `{__html}`: мемоизировать
- §2, беседа 8.4 — `css-parity`, новые классы блоком
- §4, беседа 11.3 — число запросов и каталоги — на СБОРКЕ (vite build + preview): StrictMode двоит эффекты
- §4, беседа 11.4 — предпосылки харнесса одной командой ДО написания теста
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`

**Первый запрос:**
```
Закрываю клиентские долги реестра §12 с адресатом 12.4. Сервер готов
беседами 12.1 и 12.3; граф закрыт 12.2. Сервер не правлю: при нехватке
— строка §12 с адресатом. Единственное исключение — зеркало бейджа
схемы в шапке HTML-выгрузки (п.11, Д-41): шапка клиента и её зеркало
правятся вместе.

Прикреплены: §12, «По факту 12.1» и «12.3», спецификация (разделы в
контексте), UI-кит, файлы страниц и компонентов из списка, образцы
второго шага.

0. ПЕРВЫЙ ХОД — сверка текста с кодом (grep названных функций и
   пропов), расхождения — до правок.

1. Д-2. Двойной вопрос при пропуске раздела: PauseModal спрашивает со
   списком skipDegrades (2.2), затем handleResumeGeneration страницы —
   ещё раз общим текстом (адаптация 1.5, не снятая после 2.2). Вопрос
   остаётся ОДИН — в модалке; в SynthesisPage и CreateSynthesisPage снять.
   Пустой skipDegrades — пропуск без вопроса, как в модалке.

2. Д-17. Второй шаг кнопок вместо window.confirm на НЕОБРАТИМЫХ
   действиях (правило 8.4): удаление аккаунта (ProfilePage), удаление
   типа каталога и смена роли (AdminPromptsPage), удаление API-ключа
   (BillingPage), остановка генерации без возобновления (handleAbort).
   Сброс кликом мимо (mousedown на document), тексты подтверждения —
   прежние. window.confirm на ОБРАТИМЫХ действиях (откат версии,
   активация версии шаблона, уход с несохранённого) — не трогать и
   перечислить в «По факту» с доводом.

3. Д-14. Вход в историю версий РАЗДЕЛА: у раздела в документе
   (владельцу, не при генерации) и на карточке EditModal —
   VersionHistory по элементу 'section' (GET …/elements/section/:id/
   versions, откат). После отката — перечитка разделов и, если 12.1
   ответила, что капсула обновлена, — шапки. «Почему» версии
   (origin 10.2) показывать, как у элементов.

4. Д-15. Пометка ⟳ у «Резюме»: isEdited раздела sum показывать там,
   где раздел виден (оглавление или заголовок раздела), раз карточки
   sum в EditModal нет (паритет исходника — карточку не заводить).

5. Д-19 (клиентская половина). FullBudgetPreview берёт бюджет из
   contextBudget ответа /estimate ({ estimate, contextBudget } — БАЗОВЫЙ
   бюджет глубины запроса, «По факту 12.3» п.7); CONTEXT_BUDGET_PREVIEW удалить;
   до первого ответа — без числа бюджета, а не с копией. Сторож 4n
   переписать под невозврат копии.

6. Д-7 (клиентская половина). Футер EditModal — серверные числа
   estimatedCost/costBreakdown и отдельное поле каскадных pending (12.3);
   собственный подсчёт взятого (10.3 п.7) удалить.
   По факту 12.3 (п.2): estimatedCost и costBreakdown считают только
   ВЗЯТЫЕ шаги, ждущие решения — plan.cascadePending { steps, costUsd }
   («если подтвердить все — ещё ≈ $…»). Подпись футера «N каскадных ждут
   решения (оценка — с ними)» (edit.editModal.cascadePending) с 12.3
   неверна — переписать под два числа (ключ — i18n:export, черновики
   en/de — i18n:import --draft, затем i18n:split).

7. Д-22. gm-hint: правило в части 3 globals.css по UI-киту (подсказка
   графа — микро-подпись капителью) либо класс из исходника, если
   найдётся подходящий; css-parity раздел C — 0.

8. Д-34 (зачислен из 12.1). Клиент не узнаёт о новом названии: ответ
   правки подраздела раздела name несёт titleUpdated (12.1), страница
   перечитывает только разделы. Применить titleUpdated к шапке и к
   заголовку страницы без перезагрузки; capsuleUpdated/capsuleHtml
   ответа отката — туда же (п.3).

9. Д-35 (зачислен из 12.1). Тезис — по МЕТКЕ: инлайн-✎ строки сводной
   таблицы сопоставляет строку с тезисом по Thesis.label (первая ячейка
   строки), запасной ход по индексу остаётся только для документов без
   меток; заголовок редактора пишет метку (label ?? №thesisNum).

10. Д-42 (зачислен из 12.2). Отчёт редактора: htmlSync.patched второй
    раскладки тезиса называет thesis.formulation, а
    HTML_SYNC_FIELD_LABELS знает только justification — в блоке влияния
    стоит сырой ключ. Добавить подпись через tl() (ключ — i18n:export,
    черновики en/de — i18n:import --draft, затем i18n:split).

11. Д-41 (зачислен из 12.2). Бейдж шапки «◈ родительский контекст:
    селективный v1 / монолитный (legacy)» (исходник —
    updateSchemaBadgeInHeader, 01 §4.13 п.10.3): только у мета-синтеза
    (среди участников есть концепция), значение —
    SynthesisFull.parentContextSchema. В DocumentHeader — по UI-киту
    (микро-подпись; новый класс — блоком 12.4) и ЗЕРКАЛОМ в шапке
    HTML-выгрузки (renderDocHeader; выгрузка остаётся русской — без
    tl()/tData(), сторожа 4x/4y/4ay). Импорт бейдж не читает: схема
    берётся из встроенного состояния.

12. Д-44 (зачислен из 12.3). Панель рекомендаций не показывает
    замечание строки: Recommendation.warning (сверка столбца
    «Основание», 12.3; фраза приходит уже на языке запроса) — строкой
    под рекомендацией, тоном предупреждения, не отказа; на выбор и
    постановку в план не влияет. Замечание от причины негодности
    отличать по Recommendation.issues[].level, не по тексту.

13. Д-48 (зачислен из 12.3). Блок «⚠ Разобран с потерями» раздела
    (SectionView): вводная обещает «Документ цел», а с 12.3 в списке
    бывают пропуски — «модель завершила ответ, не написав подраздел …»
    (Д-47) и «…повторное обращение не помогло» (таблица рекомендаций,
    Д-21). Вводную и заголовок переписать нейтрально (замечания службы
    к последней генерации раздела: подстановки разбора и пропуски);
    сами пометки — русская диагностика генлога, их не переводить.
    Ключи — i18n:export, черновики en/de.

14. Сторож 4-серии: страницы не зовут window.confirm перед
   resumeGeneration('skip'); на пяти необратимых действиях
   window.confirm нет; вход в историю раздела есть; копии
   CONTEXT_BUDGET нет; футер не считает pending сам; страница применяет
   titleUpdated; инлайн-✎ тезиса ищет строку по метке; карта подписей
   htmlSync несёт formulation; бейдж схемы есть в DocumentHeader и в
   renderDocHeader — только при концепциях-родителях; панель
   рекомендаций показывает warning; вводная блока предупреждений раздела
   не обещает целости документа; футер не пишет «оценка — с ними».

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не править сервер (кроме зеркала бейджа в renderDocHeader, п.11) и
  граф;
- не заводить карточку sum в EditModal;
- не менять window.confirm на обратимых действиях;
- не заводить кнопок «выбрать все»/«исполнить все» нигде (правило 10.x).
```

**Последующие запросы:**
- «Протестируй Д-2 в браузере (Chrome 131, сборка клиента): пауза со skipDegrades → «Пропустить» → ровно один вопрос со списком; без skipDegrades — ни одного»
- «Протестируй Д-17: удаление аккаунта, типа каталога, смена роли, удаление ключа, остановка генерации — второй шаг кнопок, клик мимо сбрасывает, window.confirm не вызывается (перехват в странице)»
- «Протестируй Д-14: ручная правка подраздела → вход в историю раздела → откат → документ прежний; откат версии капсулы → шапка прежняя»
- «Протестируй Д-15/Д-19/Д-7: правка подраздела «Резюме» → пометка ⟳ видна; активировать новую версию context_budget → превью формы показывает новый бюджет без правки клиента; план с каскадными pending → футер показывает серверную оценку и pending отдельно»
- «Протестируй Д-34/Д-35/Д-41/Д-42 в браузере (сборка клиента): правка «Итоговой рекомендации» раздела name → шапка показывает новое название без перезагрузки; инлайн-✎ строки «Э-2» сводной таблицы открывает тезис «Э-2» (по метке, не по индексу), заголовок редактора несёт метку; правка формулировки тезиса второй раскладки → «Отражено точечной правкой абзаца» с подписью поля, не с ключом; у мета-синтеза в шапке бейдж схемы родительского контекста, у синтеза без концепций-родителей его нет — на странице и в HTML-выгрузке»
- «Протестируй Д-44/Д-48 в браузере (сборка клиента): строка рекомендации с чужим «Основанием» → под ней замечание (не отказ), строка выбирается и ставится в план; раздел, где мок пропустил подраздел, → блок предупреждений с пометкой о пропуске, вводная без «Документ цел»; план с каскадными pending → футер называет два числа, оборота «оценка — с ними» нет»
- «Прогони css-parity после добавления блока 12.4: A/B/C = 0»

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`, `vite build`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, css-parity»
- «Ревью: перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»
- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10)

**По факту 12.4 (первый запрос — 2026-10-07).** → `docs/08-history.md`, глава «Беседа 12.4», подраздел «По факту 12.4 (первый запрос — 2026-10-07)».

**По факту 12.4 (тестовые запросы 2–8 — 2026-10-12).** → `docs/08-history.md`, глава «Беседа 12.4», подраздел «По факту 12.4 (тестовые запросы 2–8 — 2026-10-12)».

**По факту 12.4 (завершение — беседа закрыта 2026-10-12).** → `docs/08-history.md`, глава «Беседа 12.4», подраздел «По факту 12.4 (завершение — беседа закрыта 2026-10-12)».

### Беседа 12.5: Харнессы, инструменты переводов, доки (оснастка + протокол)

**Контекст для загрузки:**
- `07-conversation-protocol.md` §12 — строки с адресатом 12.5; «По факту» 12.1 (п.4), 12.2 (пп.6, 8, 9, 20), 12.3 (пп.12, 22, 27) и 12.4 (первый запрос п.10; тестовые пп.1, 3; завершение пп.10, 12); §10 (чек-лист); шаблон «Типовая беседа L» (пункты 1 и 5 первого запроса сводятся к `i18n:add-lang` после Д-33)
- `docs/08-history.md` — главы 0.2, 0.3b, 0.6, 2.3, 2.4, 3.1 (опора блоков-указателей Д-28); 1.5, 2.3, 3.2, 4.1 (устройство харнессов 15/23/32/41); 5.5, 8.4, 8.6, 10.1 (что сломало харнессы); 11.2, 11.4 (инструменты i18n, карта данных)
- `docs/09-lessons.md` §4 (харнессы и моки), §6 (инструменты i18n)
- Харнессы: `tests/smoke-55-request1.mjs`, `tests/test-16b-requests2-9.mjs`, `test-17-requests2-9.mjs`, `test-52-requests2-5.mjs`, `test-15-requests2-7.mjs`, `test-23-requests2-5.mjs`, `test-32-requests2-5.mjs`, `test-41-requests2-5.mjs`; образцы исправных моков — `test-42`, `test-43`, `test-103` (критика узнаётся первой, разделы с каркасом `wrapSection`)
- `client/src/api/transforms.ts` (8.4 — какие обёртки остались), `server/integration-check.mts` (4aw/4ax/4ay — где языки перечислены)
- `scripts/i18n/README.md` целиком и `scripts/i18n/*.mjs` (`i18n-core.mjs` — `extractProject`/`isDataFile`, `LANGS`, `LANG_LOCALE`; `i18n-export.mjs`, `i18n-import.mjs`, `i18n-check.mjs`, `i18n-split.mjs`), `packages/shared/i18n/strings.json` (только `meta` и строки-образцы), `names.json`
- Зачислено по итогам 12.1 и 12.2 (Д-38, Д-39, Д-40, Д-43): `tests/smoke-112-request1.mjs`, `tests/smoke-85-request1.mjs`; `scripts/extract/extract-export-assets.mjs`, `extract-section-templates.mjs`, `extract-seed-data.mjs` (образец верного корня), `tests/smoke-export-assets.mjs`; генерат `server/config/section-templates.ts` и образцы надстроек над генератом — `recommendation-templates.ts` (10.1), `lang-templates.ts` (11.1), `export-viewer-overrides.ts` (12.2), `scripts/seed/seed-prompts.ts`, смоук `tests/smoke-12-*.mjs`; `server/services/element-renderer.ts` (`renderThesesTable`, `THESIS_TYPE_LABELS`), `element-parser.ts` (`mapThesisType`, вторая модель абзаца тезиса), `server/utils/html-parser.ts` (`findThesisBlocks`), `element-editor.ts`; харнессы `tests/test-121-requests2-5.mjs`, `tests/test-122-requests2-5.mjs` и файл концепции
- Зачислено по итогам 12.4 (Д-45, Д-49, Д-50): `tests/test-62-requests2-7.mjs`, `tests/test-71-requests2-8.mjs`, образец второго шага — `tests/test-124-requests2-8.mjs` (R3) и `client/src/hooks/useSecondStep.ts`; `server/services/export/html-exporter.ts` (встроенное состояние `philosynth-state`, `renderSchemaBadge`), `server/services/import-service.ts` (чтение `parentContextSchema` из состояния), `tests/smoke-122-request1.mjs` (круг экспорт → импорт); `server/ws/handler.ts` (replay подписки), `client/src/hooks/useStreamingGeneration.ts` (`buildPausedState`), `client/src/pages/SynthesisPage.tsx` (обход `samePause`), `03` §3.1 (`generation_paused`)
- Зачислено по итогам 12.3 (Д-45): `tests/smoke-61-request1.mjs`, `smoke-62-request1.mjs`, `smoke-71-request1.mjs`, `smoke-102-request1.mjs`, `tests/test-112-requests2-9.mjs`, `tests/test-113-requests2-8.mjs`, `tests/test-22-requests2-6.mjs`, `tests/smoke-101-request1.mjs`, `tests/test-101-requests2-11.mjs`, `test-102-requests2-11.mjs`, `test-103-requests2-9.mjs` и файл концепции бесед 10.1–10.2 (если найдётся)
- Исходник: НЕ НУЖЕН. Дизайн-набор: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §4, беседы 4.2/4.3 — порядок веток мока: специфичные маркеры ПЕРЕД `/критическ/i`; разделы — с каркасом `doc-section`
- §4, беседа 10.1 — мок узнаёт критику первой (задание критики несёт имена ВСЕХ подразделов)
- §4, беседа 5.1 — tsx-обёртка: `detached` + `kill(-pid)`; сироты — `ps aux | grep`, не `pkill` по маске
- §2, беседа 8.7 — два пользователя в браузере — `createBrowserContext()`
- §4, беседа 11.4 — предпосылки харнесса одной командой; лимит вызова песочницы — долгий прогон отдельным коротким вызовом, опросы `sleep ≤ 95`
- §2, беседа 11.4 — карта данных и каталоги — генераты: после правки таблицы `npm run i18n:split`
- §8, беседа 7.1 — «нет ✗» ложно ловит «0 ✗»

**Первый запрос:**
```
Чиню оснастку, инструменты переводов и доки по реестру §12 (адресат
12.5). Продуктовый код не трогаю: если харнесс падает из-за дефекта
продукта, а не теста, — строка §12 с адресатом, а не правка походя.
Исключение — четыре долга, зачисленные решением пользователя
(пп.8–9: Д-40, Д-43 — 2026-10-06; пп.12–13: Д-49, Д-50 — при закрытии
12.4, 2026-10-12): узкие правки сервера, названные поимённо.

Прикреплены: §12 и §10 протокола, шаблон L, главы 08, 09 §4 и §6,
харнессы из списка, api/transforms.ts, integration-check.mts,
инструменты scripts/i18n.

1. Д-24. smoke-55: обёртки transformGraphToTheses/ThesesToGraph сняты
   8.4 (инлайн в startTransformRequest) — перевести смоук на то, что
   экспортирует api/transforms.ts сегодня; прогнать, число проверок —
   в «По факту».

2. Д-25. test-16b/17/52: SQL-вставки is_public → visibility (8.6);
   проверки кнопки «Опубликовать» и PATCH { isPublic } из test-16b
   УДАЛИТЬ — предмет покрыт test-86/87, а PATCH с isPublic с 8.7 → 400.
   Прогнать все три.

3. Д-26 и Д-27. Моки харнессов 15, 23, 32, 41 привести к исправному
   образцу (42/43/103): критика узнаётся первой, специфичные маркеры —
   перед /критическ/i, sum — по своему маркеру, разделы — с каркасом
   doc-section. Прогнать 15, 23, 32 (после 10.1 не гонялись) и 41.
   Общий модуль мока Claude по образцу tools/stripe-mock (8.2) — НЕ
   заводить здесь: это отдельное решение; если выгода очевидна по
   итогам — строка §12 с предложением.

4. Д-28. Блоки «По факту» 0.2, 0.3b, 0.6, 2.3, 2.4, 3.1 в 07 отсутствуют, а
   комплекты и NEXT-CONTEXT на них ссылаются. Завести на месте каждого
   блок-указатель (две-три строки: где итоги — глава 08, чем текст
   запроса опровергнут, если опровергнут) и добавить в §10 правило:
   беседа, закрываясь, пишет «По факту» ВСЕГДА — хотя бы строкой
   «отступлений нет».

5. Д-33. Новое значение данных не попадает в таблицу переводов само:
   i18n:export сверяет только вызовы tl(), а строку data для нового
   значения файла-данных (тип каталога в seed-taxonomy, метка в
   shared/constants/*, текст compat-matrix) заводят руками, иначе tData
   молча вернёт русский; сторож 4ay проверяет, что data-строки таблицы
   есть в карте, а не что все значения файлов-данных есть в таблице.
   Опись файлов-данных у инструментов есть (extractProject/isDataFile).
   Сделать:
   а. i18n:check — «значение файла-данных без строки таблицы» красным в
      --strict (исключения MIRROR_EXCLUSIONS по тексту);
   б. i18n:export --data — заводит недостающие строки с data: true и
      пустыми переводами (имя ключа — из names.json, иначе отчёт);
   в. i18n:add-lang <xx> — колонка в таблице + LANGS + LANG_LOCALE +
      meta.languages одной командой; списки языков в сторожах 4aw/4ax/4ay
      и в тестах 112–114 вывести из UI_LOCALES, чтобы типовая беседа L
      не правила их руками. Шаблон L в 07 — пункты 1 и 5 первого запроса
      переписать на add-lang.
   README scripts/i18n — новые команды и проверка. Прогон на живой
   таблице: сторож (а) обязан найти всё, что заведено руками или забыто,
   включая строки 12.1–12.4.

6. Д-38 (зачислен из 12.1). smoke-112: проверка «строки data и
   obsolete не попадают» красная с 11.4 (каталоги несут data-строки) —
   предмет исчез: перевернуть под правило 11.4 либо удалить с доводом.
   smoke-85 по умолчанию читает приложенный файл и ждёт сырой файл
   одностраничника («0 UUID»): различать род файла (09 §2, 12.1) либо
   требовать T85_FILE явно.

7. Д-39 (зачислен из 12.2). Генераторы extract-export-assets.mjs и
   extract-section-templates.mjs после перекладки scripts/ считают
   корнем scripts/: ROOT — на два уровня вверх (как в
   extract-seed-data.mjs), путь к extract-by-name.py — scripts/extract/.
   Прогнать оба: генераты обязаны совпасть с лежащими в репозитории
   ПОБАЙТНО (правок в генератах быть не должно).
   tests/smoke-export-assets.mjs перевести с копии генератора во
   временном дереве на сам генератор.

8. Д-40 (зачислен из 12.2; ПРАВИТ ПРОДУКТ — исключение). Задание
   раздела тезисов (section.theses.shared) раскладку не предписывает —
   модель пишет как хочет, разбор угадывает (две модели, 1.4 и 12.2).
   НАДСТРОЙКОЙ над генератом section-templates.ts (образцы 10.1, 11.1,
   12.2: сид накладывает, smoke-12 снимает перед байтовой сверкой и
   проверяет, что надстройка одна и на месте, сторож — генерат не
   тронут) дописать требование: блок тезиса — <h5>Тезис {метка}
   (…)</h5>, абзац из одной жирной формулировки, абзац
   «<strong>Обоснование.</strong> …»; формулировка в прозе ДОСЛОВНО
   равна формулировке сводной таблицы; метка в <h5> равна первой ячейке
   строки таблицы. Исходник не править (пользователь в одностраничнике
   больше не генерирует). Обе модели разбора остаются — документы,
   написанные до требования, никуда не денутся. Выкатка: seed:prompts.

9. Д-43 (зачислен из 12.2; ПРАВИТ ПРОДУКТ — исключение).
   renderThesesTable рисует столбец «Тип» канонической меткой у ВСЕХ
   строк: после правки любого тезиса «Этический / аксиологический»
   становится «этический». При перерисовке брать прежний текст ячейки
   типа у строки с той же меткой, если mapThesisType(прежний текст)
   равен типу в БД; иначе — каноническая метка (образец — сохранение
   заголовков таблицы, opts.headers). Сторож; проверка на файле
   концепции.

10. Д-45 (зачислен из 12.3). Проверки, отставшие от кода: smoke-61
    (3 ✗), smoke-62 (2 ✗), smoke-71 (4 ✗), smoke-102 (1 ✗), test-112
    (3 ✗: гость с Accept-Language de ждёт русский ответ — писался до
    каталога de; «check:integration зелёный» и счёт литералов i18n:check
    — до 11.3), test-113 (1 ✗: «каталог de пуст») — перевести на
    сегодняшний код либо удалить с доводом (предмет исчез). Гонка test-22 R5(b): ждать значения version_sub, а
    не читать один раз после section_done. test-101, test-102 и живая
    часть smoke-101 привязаны к файлу концепции 10.1–10.2: файл-образец
    рядом либо запасной путь мока с проверкой, что метка стоит (09 §4,
    12.2 п.5). test-103: CDP acceptLanguage в каждом контексте.
    Зачислено из 12.4: test-62 (удаление API-ключа) и test-71 (удаление
    типа каталога, смена роли, удаление аккаунта) ждут window.confirm —
    перевести на второй шаг кнопок (testid *-delete-confirm-*,
    access-toggle-confirm-*, кнопка «Точно удалить?»; образец — test-124
    R3); test-71 после удаления аккаунта ждёт /login, страница уходит на
    «/» (витрина 8.7).

11. Регресс: полный прогон перечисленных харнессов ×2 на свежем клоне;
   smoke-12, tests/smoke-export-assets.mjs, харнессы 12.1 и 12.2 (файл
   концепции); check:integration, check:dotfiles и i18n:check --strict
   зелёные.

12. Д-49 (зачислен из 12.4; ПРАВИТ ПРОДУКТ — исключение). Встроенное
    состояние HTML-выгрузки (html-exporter, philosynth-state) пишет
    parentContextSchema константой PARENT_CONTEXT_SCHEMA_ID, а не
    колонкой syntheses.parent_context_schema: концепция со схемой
    monolithic (legacy-импорт) после круга экспорт → импорт становится
    selective-v1 без маркера миграции. Писать row.parentContextSchema;
    проверить, что импорт 4.3 читает поле из состояния (02 §4 п.9) и
    что smoke-122 (круги) не ломается; сторож.

13. Д-50 (зачислен из 12.4; ПРАВИТ ПРОДУКТ — исключение). Replay
    подписки (server/ws/handler.ts, status='paused') шлёт
    generation_paused без skipDegrades и sectionKeys и неотличим от
    живой паузы. Класть skipDegrades: ps.skipDegrades ?? [] (и
    sectionKeys), пометить сообщение признаком replay: true (03 §3.1,
    shared/types/ws-messages); клиенту по признаку не открывать модалку
    (снапшот её не навязывает — 1.6b); обход samePause в SynthesisPage
    тогда снять, сторож 4bc-о перевернуть. Вопрос о деградации при
    «Пропустить» на странице, открытой в паузе, обязан остаться —
    test-124 R2 (первый вход) это держит.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не править продуктовый код (server/, client/src, packages/ — кроме
  таблицы переводов и генератов i18n, которые меняют сами инструменты,
  и кроме пп.8–9 и 12–13: надстройка задания тезисов с её сидом,
  renderThesesTable, встроенное состояние выгрузки, replay подписки);
- не править генераты и исходник: Д-40 — только надстройкой;
- не ослаблять проверки харнессов, чтобы они позеленели: проверка,
  чей предмет исчез, удаляется с доводом, а не смягчается;
- не переписывать закрытые блоки «По факту» — только добавлять;
- не снимать отметку draft с переводов — это делает только человек.
```

**Последующие запросы:**
- «Прогони smoke-55 и test-55 — зелёные»
- «Прогони test-16b/17/52 ×2 — зелёные; в выводе нет проверок isPublic»
- «Прогони test-15/23/32/41 ×2 — зелёные; мок узнаёт критику первой (проверка счётчиком вызовов по разделам)»
- «Проверь блоки-указатели: каждая ссылка «По факту N» из комплектов и NEXT-CONTEXT находит блок в 07»
- «Протестируй Д-33: новый тип каталога в seed-taxonomy без строки таблицы → i18n:check --strict красный с этим значением; i18n:export --data заводит строку с data: true; `i18n:add-lang xx` на копии → колонка, LANGS, meta и сторожа 4aw/4ax/4ay видят xx без правки их текста; копия удалена, таблица возвращена побайтно»
- «Протестируй Д-38/Д-39: smoke-112 и smoke-85 зелёные на экспорте службы; `npm run extract:export-assets` и `extract:sections` отрабатывают со своего места, `git status` после них пуст; smoke-export-assets гоняет сам генератор»
- «Протестируй Д-40/Д-43: после seed:prompts активный `section.theses.shared` несёт требование раскладки, smoke-12 зелёный (надстройка снята — побайтно исходник); раздел тезисов от мока по новой раскладке → `theses.justification` непуст, формулировка прозы равна табличной; на файле концепции правка обоснования тезиса не меняет ни одной ячейки «Тип», смена типа редактором меняет только свою строку»
- «Прогони smoke-61/62/71/102 и test-112 — зелёные; test-22 ×5 без единого красного прогона; test-101/102/103 на файле-образце — зелёные (test-103 — при английском языке браузера); test-62 и test-71 ×2 на втором шаге кнопок (Chrome 131)»
- «Протестируй Д-49/Д-50: концепция со схемой monolithic → экспорт → импорт — схема прежняя, генлог без ложного маркера миграции; smoke-122 зелёный; страница, открытая в паузе с skipDegrades → «Пропустить» → ровно один вопрос (test-124 R2 зелёный на прямом пути без обхода samePause); replay несёт replay: true, модалка при заходе не открывается сама, бейдж паузы виден»

**Завершение беседы:**
- «Проверь интеграцию: `check:integration`, `check:dotfiles`, `i18n:check --strict` на свежем клоне зелёные»
- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10); если реестр пуст — Фаза 12 закрыта, строка в README

**По факту 12.5 (первый запрос — 2026-10-12).** → `docs/08-history.md`, глава «Беседа 12.5», подраздел «По факту 12.5 (первый запрос — 2026-10-12)».

**По факту 12.5 (тестовые запросы — 2026-10-13).** → `docs/08-history.md`, глава «Беседа 12.5», подраздел «По факту 12.5 (тестовые запросы — 2026-10-13)».

**По факту 12.5 (завершение — беседа закрыта 2026-10-13).** → `docs/08-history.md`, глава «Беседа 12.5», подраздел «По факту 12.5 (завершение — беседа закрыта 2026-10-13)».

### Фаза 13 (добавлена 2026-10-13): безопасность и правка документа

> Заведена 2026-10-13 (вне бесед) по живой пробе ручной правки на
> импортированном файле одностраничника. Проба показала две вещи.
>
> **Хранимый XSS (Д-63).** Ручная правка подраздела (9.2) чистит разметку
> белым списком, но остальные входы HTML в документ — нет. Подтверждено в
> браузере: `PATCH /syntheses/:id/capsule` с `<img src=x onerror=…>` — код
> выполнился при открытии концепции; импорт HTML-файла с `<img onerror>` и
> ссылкой `javascript:` в подразделе — код выполнился, ссылка осталась
> рабочей. Документ рисуется разметкой (`SectionView` —
> `dangerouslySetInnerHTML`), а публичную концепцию читает любой, включая
> гостя. Ответы модели (генерация, перегенерация, режимы, трансформация)
> тоже входят без чистки — при подходящем зерне это тот же путь.
>
> **Неудобная правка (Д-64).** Поле разметки шириной ≈190 px (у
> `.form-textarea.subsection-edit-source` нет ширины — поле встаёт
> строчным рядом с подписью), высота жёстко 180 px (базовые `height` и
> `min-height` перекрывают вычисленный `rows`), без переноса строк
> (`white-space: pre` — абзац уходит вправо), таблицы — многоуровневой
> разметкой с глубокими отступами. Решение пользователя — полнотекстовая
> правка на месте подраздела с кнопками форматирования.
>
> **Почему одна беседа и почему раньше локализации.** У обоих долгов один
> предмет — HTML, входящий в документ, — и один источник правды: список
> тегов раздела «ФОРМАТИРОВАНИЕ» системного промпта. Сегодня он живёт в
> трёх местах порознь (промпт, белый список `html-parser.ts`, подсказка
> под полем правки); беседа сводит их в один общий модуль, из которого
> строятся и санитайзер всех входов, и кнопки редактора. Безопасность
> срочнее локализации — поэтому эта фаза идёт ПЕРЕД Фазой 14 (решение
> пользователя 2026-10-13; нумерация переставлена до вливания патча).
>
> **Решения пользователя 2026-10-13.**
> - Кнопки форматирования — ровно по тегам раздела «ФОРМАТИРОВАНИЕ», что
>   доступны внутри подраздела: абзац `<p>`, подзаголовок `<h5>`,
>   выделение `<strong>`, критическое предупреждение `<em>`, списки
>   `<ul>`/`<ol>`, таблица `<table class="doc-table">`, выноски
>   `callout warning | note | gold` с меткой `callout-label`, метки риска
>   `risk high | medium | low`. Структурные теги (`doc-section`,
>   `section-num`, `section-title`, `doc-content`, `data-section` с `<h4>`)
>   человек не правит — кнопок нет.
> - Санитайзер СУЖАЕТСЯ до того же списка: `b` → `strong`, `i` → `em`
>   (вставка из Word и браузера), прочее вне списка (`sup`, `sub`,
>   `blockquote`, `br`, `caption`, `tfoot` и всё неизвестное) снимается с
>   сохранением текста; опасное (`script`, `iframe`, `img`, …) — вместе с
>   содержимым, как сейчас; атрибуты — все, кроме разрешённых классов и
>   `colspan`/`rowspan`.
>
> **Беседа 13.2 (добавлена 2026-10-14).** Ревизия ограничений 2026-10-14
> (вне бесед; решение пользователя — снять всё, что снимается без
> переделки архитектуры) нашла в коде три утечки — это безопасность, а не
> ограничения: пауза генерации с содержимым родителей уходит чужому
> зарегистрированному и в чужую выгрузку (Д-65, был Огр-4), импорт
> связывает с любым синтезом по UUID из файла, минуя правило `allow_meta`
> (Д-66), лимитер запросов обходится случайной cookie (Д-67, половина
> Огр-10). Все три — сервер и малы; отдельной беседой ПОСЛЕ 13.1 (та и
> без того широкая, а `import-service.ts` правят обе) и, как она, раньше
> Фазы 14.

---

### Беседа 13.1: Безопасность входящего HTML и полнотекстовая правка (бэкенд + клиент)

**Контекст для загрузки:**
- `07-conversation-protocol.md` §12 — строки Д-63, Д-64; врезка «Фаза 13»; «По факту» 4.3, 5.1, 9.2, 12.1, 12.2, 12.4
- `01-architecture.md` (§8 — оформление клиента; безопасность и развёртывание), `02-data-model.md` (`sections.html_content`, `syntheses.capsule_html`, `mode_results`, `element_versions` — снимки разделов), `03-specification.md` (§2.2 импорт, §2.3 правка подраздела, §2.4 капсула и версии), `04`, `05`
- Системный промпт, раздел «ФОРМАТИРОВАНИЕ»: `server/config/prompt-templates.ts` (генерат — только читать)
- Из предыдущих бесед:
  - санитайзер: `server/utils/html-parser.ts` (`ALLOWED_TAGS`, `DROPPED_TAGS`, `DIV_CLASS_RE`, `SPAN_CLASS_RE`, `sanitizeTree`, `dropStrayClosers`, строки-места вложенных подразделов `PLACEHOLDER_RE`), `server/services/element-editor.ts` (`updateSubsection`, `getSubsectionSource`, `subsectionLockOf`, `updateCapsule`)
  - входы HTML: `server/services/import-service.ts`, `generation-service.ts` (запись разделов, перегенерация раздела и подраздела, `spliceSubsectionHtml`), `pause-resume-service.ts`, `mode-service.ts` (`mode_results`), `representation-transformer.ts`, `recommendations.ts` (повтор таблицы), `element-versioning.ts` (откат снимка раздела), `server/routes/elements.ts` (`PATCH /:id/capsule`)
  - показ разметки на клиенте: `client/src/components/document/SectionView.tsx` (`renderSubsectionEditor`, кнопки и форма), `ModeContent.tsx`, `TransformPanel.tsx`, `EnrichmentPanel.tsx`, `ConceptPool.tsx`; `client/src/utils/subsection-edit.ts`, `client/src/pages/SynthesisPage.tsx` (состояние правки), `client/src/globals.css` (блок 9.2 «subsection-edit»)
  - развёртывание: `server/index.ts` (заголовки ответа), `deploy/philosynth-hosting.md` (Caddy отдаёт `client/dist`), `deploy/philosynth-ubuntu.md`
  - `server/integration-check.mts`; харнессы-образцы — `tests/test-92-*` (ручная правка 9.2), `tests/test-124-requests2-8.mjs` (Chrome 131 на сборке клиента)
- Живой файл одностраничника (`PS-6933-…html`): на нём видна правка таблиц, вложенных подразделов и выносок
- `docs/fragments-for-conversations/5-6-ui-kit.md` + `.css` + `.html` — панель кнопок и режимы правки; палитра закрытая, новые классы отдельным блоком, после правки css-parity
- Исходник: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседы 10.1–11.1 — текст запроса против кода: первый ход — grep по каждой названной функции
- §2, беседа 9.2 — React 19 переписывает `innerHTML` при смене ССЫЛКИ `{__html}`: мемоизировать; разбор правки идёт внутри служебной обёртки — непарный `</div>` закрыл бы её (`dropStrayClosers`)
- §2, беседа 10.1 — генераты рукой не правятся: список тегов читается из промпта, промпт не меняется
- §4, беседа 11.3 — браузер на СБОРКЕ клиента (vite build + preview)
- §4, беседа 11.4 — предпосылки харнесса одной командой ДО написания теста
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`

**Первый запрос:**
```
Закрываю Д-63 (хранимый XSS) и Д-64 (полнотекстовая правка подраздела).
Сначала безопасность (пп.1–5), затем редактор (пп.6–10).

0. ПЕРВЫЙ ХОД — сверка текста с кодом: grep по каждой названной функции;
   перечень ВСЕХ мест, где HTML входит в sections.html_content,
   syntheses.capsule_html, mode_results и снимки element_versions, — до
   правок, в «По факту».

1. Общий модуль разрешённой разметки (packages/shared): теги, классы
   (callout warning|note|gold, callout-label, risk high|medium|low,
   doc-table), разрешённые атрибуты (class по списку, colspan/rowspan у
   td/th) — ровно по разделу «ФОРМАТИРОВАНИЕ» промпта для содержимого
   подраздела, плюс структурные теги обёртки раздела (doc-section,
   section-num, section-title, doc-content, div[data-section] с <h4>).
   Сторож сверяет модуль с текстом промпта: тег в промпте без строки
   модуля (или наоборот) — красный.

2. Санитайзер (html-parser) строится из модуля и СУЖАЕТСЯ (решение
   пользователя): b → strong, i → em; sup, sub, blockquote, br,
   caption, tfoot и прочее вне списка — снимаются с сохранением текста;
   опасное — вместе с содержимым; ссылок (<a>) в документе нет. Два
   режима: «содержимое подраздела» (правка 9.2, редактор п.6) и «раздел
   целиком» (структурная обёртка разрешена: section-num/title,
   doc-content, data-section с <h4> и якорями оглавления 12.2).

3. Чистка на ВСЕХ входах (по перечню п.0): импорт, PATCH капсулы,
   генерация и перегенерация раздела и подраздела, возобновление,
   режимы, трансформация, повтор таблицы рекомендаций, откат версии
   раздела (снимки старых версий могут нести то, что было до чистки).
   Предупреждения чистки на входах модели — в parseWarnings (их
   переведёт Фаза 14), на импорте — в warnings ответа.

4. Уже сохранённое: одноразовый скрипт scripts/ (с --dry) прогоняет
   санитайзер по sections, syntheses.capsule_html, mode_results и
   снимкам версий разделов; отчёт — сколько записей изменено и чем.
   deploy/* — шаг после обновления.

5. CSP: заголовок Content-Security-Policy без встроенных скриптов
   (script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors
   'none') — у ответов сервера (server/index.ts) и в конфигурации Caddy
   для client/dist (deploy/*); проверить, что сборка клиента и
   встроенное состояние экспорта под ним работают (выгрузка — файл, не
   страница сервиса: под CSP не попадает).

6. Редактор: правка на месте подраздела вместо поля разметки — блок
   contenteditable в типографике документа и панель кнопок ровно по
   модулю п.1 (абзац, подзаголовок h5, strong, em, ul, ol, таблица,
   три выноски с меткой, три метки риска). Выбор движка — первым ходом с
   доводом в «По факту»: собственный contenteditable поверх модуля либо
   ProseMirror/TipTap со схемой из того же модуля (критерии: размер
   сборки, вставка, таблицы, отмена правок). Сохраняется по-прежнему
   PATCH 9.2 — сервер чистит, редактор чистоте не доверяет.

7. Вставка: из буфера — через тот же список на клиенте (b → strong,
   i → em, прочее — текстом), чтобы человек сразу видел то, что
   сохранится; окончательная чистка — серверная.

8. Таблицы: текст ячеек правится на месте; строки и столбцы — кнопками
   «+ строка / + столбец / − …» панели таблицы либо переключателем
   «Разметка» (прежнее поле, но уже на всю ширину, с переносом строк и
   высотой по содержимому — Д-64 п. вёрстки). Запертые таблицы (из графа
   и тезисов) — заперты, как сейчас.

9. Строки-места вложенных подразделов — нередактируемые плашки с
   видимым заголовком подраздела; удалить или переставить их нельзя
   (сервер и так отвергает). Заголовок <h4> подраздела не правится.

10. Сторож: модуль ≡ промпту; санитайзер вызывается на каждом входе
    перечня п.0 (статически); живьём — PATCH капсулы и импорт с
    <img onerror>/javascript: сохраняются без них; CSP-заголовок у
    ответов; панель редактора не содержит кнопки вне модуля.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не менять текст системного промпта (генерат) — список читается из
  него, не наоборот;
- не трогать выгрузки (зеркала исходника) — кроме того, что их
  содержимое приходит уже чистым;
- не открывать правку структурных тегов и заголовка <h4>;
- не переводить ничего сверх новых строк редактора (через tl()) —
  переводы прочего — Фаза 14.
```

**Последующие запросы:**
- «Протестируй Д-63 живьём: PATCH капсулы, импорт файла и ответ мока Claude с `<img src=x onerror>`, `<script>`, `<a href="javascript:…">`, атрибутами `on*`/`style` → в БД их нет, в браузере код не выполняется (document.title не меняется); скрипт чистки сохранённого на копии БД со «старой» записью — запись очищена, отчёт верен; ответы сервера несут CSP»
- «Протестируй сужение санитайзера: `<b>`/`<i>` → `<strong>`/`<em>`; `<sup>`, `<blockquote>`, `<br>` — текст остался, тегов нет; выноски и метки риска с разрешёнными классами — как есть, с чужим классом — класс снят»
- «Протестируй редактор в браузере (Chrome 131, сборка клиента): каждая кнопка панели даёт свой тег; вставка из буфера HTML с b/i/span/style → strong/em/текст; правка ячейки таблицы и добавление строки; плашка вложенного подраздела не удаляется; «Разметка» — поле на всю ширину с переносом; сохранение → документ совпадает с тем, что было видно в редакторе»
- «Протестируй на живом файле одностраничника: правка подраздела с таблицей и подраздела с выноской проходит без потерь разметки; запертые таблицы заперты»

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`, `vite build`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, css-parity»
- «Ревью: перечисли оставшиеся TODO и заглушки»
- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10); строка в README

**По факту 13.1 (первый запрос — 2026-10-14).** → `docs/08-history.md`, глава «Беседа 13.1», подраздел «По факту 13.1 (первый запрос — 2026-10-14)».

**По факту 13.1 (тестовые запросы 2–5 — 2026-10-20).** → `docs/08-history.md`, глава «Беседа 13.1», подраздел «По факту 13.1 (тестовые запросы 2–5 — 2026-10-20)».

**По факту 13.1 (завершение — беседа закрыта 2026-10-20).** → `docs/08-history.md`, глава «Беседа 13.1», подраздел «По факту 13.1 (завершение — беседа закрыта 2026-10-20)».

### Беседа 13.2: Утечки и лимитер запросов (бэкенд)

**Контекст для загрузки:**
- `07-conversation-protocol.md` §12 — строки Д-65, Д-66, Д-67; врезка «Фаза 13»; «По факту» 0.2, 8.5, 8.6, 9.1, 13.1
- `01-architecture.md` (безопасность, развёртывание), `02-data-model.md` (`syntheses.paused_state`, `visibility`, `allow_meta`, `synthesis_lineage`), `03-specification.md` (§2.1 коды ошибок; GET синтеза по ступеням видимости; импорт; `/lineage/link`; `META_NOT_ALLOWED`), `04`, `05`
- Из предыдущих бесед:
  - Д-65: `server/routes/syntheses.ts` (`loadSynthesisForRead`, `buildSynthesisFull`, `projectSynthesis`, `respondSynthesisFull`), `server/routes/export.ts`, `server/services/export/html-exporter.ts` (`philosynth-state`), `packages/shared/types/synthesis.ts` (`PausedStateGen`); клиент — только сверить, что не-владельцу пауза не нужна (`SynthesisPage.tsx`, `isOwner`)
  - Д-66: `server/services/import-service.ts` (блок родословной: ветка UUID, `lineageCandidates`), `server/services/lineage-service.ts` (`linkParent`, `isDescendantOf`, `findSameOwnerSynthesesByTitle`), `server/routes/syntheses.ts` (`metaAllowedFor`, `metaNotAllowedJson`), `server/services/meta-synthesis-service.ts` (`loadConceptParticipants`, `loadConceptContext`)
  - Д-67: `server/middleware/rate-limiter.ts` (`clientIdentity`), `server/middleware/auth.ts` (`requireAuth`, `optionalAuth`, проверка сессии), `server/index.ts` (порядок `requestLocale` → `rateLimiter` → роуты; `serve`), `server/routes/auth.ts` (`mailLimiter`, вход), `server/env.ts` (`rateLimit`), `.env.example`, `env.local.example`, `deploy/*` (Caddy, `.env` установщиков)
  - `server/integration-check.mts`; харнесс-образец живого сервера — `tests/test-125-requests2-9.mjs`
- Исходник: НЕ НУЖЕН. Дизайн-набор: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседы 10.1–11.1 — текст запроса против кода: первый ход — grep по каждой названной функции
- §2, беседы 8.4–8.6 и 9.1 — dotfile-грабля выкладки: правка `.env.example` теряется при упаковке — сверять после выкладки
- §4, беседа 11.4 — предпосылки харнесса одной командой ДО написания теста
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`
- §7, беседа 10.1 — числа в установщиках и руководствах стареют молча

**Первый запрос:**
```
Закрываю долги реестра §12 с адресатом 13.2 — три утечки, найденные
ревизией ограничений 2026-10-14. Только сервер (и deploy/*).

0. ПЕРВЫЙ ХОД — сверка текста с кодом: grep по каждой названной
   функции; расхождения — до правок, в «По факту».

1. Д-65. projectSynthesis: не-владельцу на любой ступени — pausedState
   и pauseEstimates null (как витрине); шапку и комментарий функции
   привести к коду. HTML-выгрузка не-владельца — без pausedState в
   philosynth-state (выгрузка владельца — как прежде). 03 — строка о
   полях по ступеням.

2. Д-66. Ветка UUID импорта — по правилу POST /syntheses
   (metaAllowedFor: своя — всегда; чужая — только при действенном
   allow_meta; витрина и приватная — никогда) плюс проверка цикла
   (isDescendantOf). Не прошла — та же дорога, что у родителя без UUID:
   кандидат по имени среди своих, связь не пишется, предупреждение
   (tl()). Одноразовый скрипт scripts/ (--dry по умолчанию): отчёт о
   строках synthesis_lineage, где родитель чужой и сегодня не годится
   по этому правилу (ребёнок, родитель, владельцы, видимость). Строки
   не снимать — решение пользователя по отчёту.

3. Д-67. Лимитер считает по ПРОВЕРЕННОЙ сессии: пользователь — u:id
   (лимитер после optionalAuth либо проверка сессии внутри — выбор
   первым ходом, с доводом: цена лишнего запроса к БД на каждый вызов
   против порядка middleware); непроверенная или поддельная cookie
   своей квоты не даёт — счёт по адресу. x-forwarded-for — только при
   TRUST_PROXY (env, по умолчанию выключен; .env.example,
   env.local.example, установщики deploy/* — включён за Caddy), иначе
   адрес соединения. mailLimiter — по тому же правилу. Адрес, на
   котором слушает сервер за прокси, сверить с deploy/*.

4. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   projectSynthesis не отдаёт pausedState не-владельцу; html-exporter
   берёт pausedState только для владельца; ветка UUID импорта зовёт
   правило allow_meta и проверку цикла; clientIdentity не строит ключ
   из непроверенной cookie; x-forwarded-for читается только под
   TRUST_PROXY.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не трогать клиент (кроме сверки п.1) и санитайзер (13.1);
- не снимать существующие строки родословной (п.2 — только отчёт);
- не переводить сверх новых строк (через tl()) — Фаза 14;
- не браться за привязку и отвязку родителя — 15.1.
```

**Последующие запросы:**
- «Протестируй Д-65 живьём: пауза на моке у концепции с родителем → GET синтеза чужим зарегистрированным при visibility='full' — pausedState и pauseEstimates null; владельцем — как прежде; гостем — как прежде; выгрузка HTML чужим — без pausedState в philosynth-state»
- «Протестируй Д-66: файл с UUID чужой приватной концепции, чужой full без allow_meta, витрины, своей и своего потомка (цикл) → связь пишется только для своей и для чужой full+allow_meta; остальные — кандидатами с предупреждением; скрипт-отчёт на копии БД со «старой» строкой находит её и ничего не меняет»
- «Протестируй Д-67: 100 запросов с разной случайной cookie с одного адреса → RATE_LIMIT после лимита; две сессии одного пользователя делят квоту; x-forwarded-for без TRUST_PROXY не влияет на ключ, с TRUST_PROXY — влияет; форма сброса пароля со случайными cookie упирается в mailLimiter»

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`»
- «Ревью: перечисли оставшиеся TODO и заглушки»
- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10); Фаза 13 закрыта (если 13.1 закрыта), строка в README

**По факту 13.2 (первый запрос — 2026-10-20).** → `docs/08-history.md`, глава «Беседа 13.2», подраздел «По факту 13.2 (первый запрос — 2026-10-20)».

**По факту 13.2 (тестовые запросы 2–4 — 2026-10-20, одним заходом по слову пользователя).** → `docs/08-history.md`, глава «Беседа 13.2», подраздел «По факту 13.2 (тестовые запросы 2–4 — 2026-10-20, одним заходом по слову пользователя)».

### Фаза 14 (добавлена 2026-10-13): довершение локализации — ЗАКРЫТА 2026-10-26

> **Закрыта 2026-10-26:** 14.1 — 2026-10-20 (Д-51, Д-52, Д-53, Д-56, Д-58,
> Д-60, Д-61), 14.2 — 2026-10-26 (Д-54, Д-55, Д-57, Д-59, Д-62, Д-76, Д-77).
> Строк §12 с адресатом 14.x нет; Д-78/Д-79 (найдены сверкой 14.2) —
> адресат не назначен. Следующая — Фаза 15.
>
> Заведена ревизией непереведённого 2026-10-13 (вне бесед, по просьбе
> пользователя), сразу после закрытия Фазы 12; идёт после Фазы 13 (безопасность и правка документа — срочнее). Сплошной проход
> AST-сканером по всем кириллическим литералам сервера вне `tl()`/`tData()`
> (≈1200 литералов в 56 файлах) отделил конституцию Фазы 11 — промпты,
> разбор документа, машинные значения таблиц документа, русские зеркала
> выгрузок HTML/MD/MMD/JSON, алиасы таксономии, `MODE_CONFIG`, вывод в
> консоль — от того, что видит человек и что осталось русским при любом
> языке интерфейса. Это двенадцать строк §12, Д-51…Д-62.
>
> **Почему они пропущены Фазой 11.** Опись `i18n:check` в режиме `msg`
> ловит сообщение только в известных формах (`throw`, `new …Error`,
> свойства `message`/`error`/…, вызовы `fail`/`decline`/…). Мимо неё
> проходят присваивание `details[поле] = "…"`, константа уровня модуля,
> переданная по имени, файлы вне `SCOPE` (`server/index.ts`), текст,
> собранный в переменные (письма), `warnings.push(…)` в утилитах, и всё,
> что ХРАНИТСЯ готовой фразой (причина паузы, `parseWarnings`, подписи
> журнала, запасные имена родословной) — язык записи не язык чтения.
>
> **Две беседы, порядок ЖЁСТКИЙ: 14.1 → 14.2.**
> - **14.1 «Опись и сообщения ответа»** (сервер) — Д-58 первым пунктом:
>   опись учится видеть слепые виды, и её сторож сразу проверяет остальное
>   беседы; затем всё, что собирается в момент ответа: Д-52 (проверка
>   полей), Д-53 (константы и верхний уровень), Д-60 (служебные тексты
>   ручной правки), Д-51 (письма — в момент постановки), Д-56 (PNG),
>   Д-61 (описание продукта Stripe).
> - **14.2 «Хранимые тексты и их показ»** (сервер + клиент) — всё, что
>   пишется готовой фразой и читается позже, переводится на «код +
>   параметры, фраза при чтении» (образец — `recommendation-issues.ts`
>   12.3): Д-54 (причина паузы), Д-55 (`parseWarnings`), Д-57 (запасные
>   имена родословной), Д-62 (журнал генерации); и Д-59 — видимые
>   заголовки подразделов в DTO разделов и их показ вокруг документа.
>   Клиентских половин две и обе малы (PauseModal по коду; помощник имени
>   подраздела в пяти компонентах) — они продолжают серверные поля этой же
>   беседы, поэтому идут в ней (прецедент — 12.2 «Экспорт и граф»).
>
> Раскладка на две беседы — решение пользователя 2026-10-13 (сначала
> было три: сервер хранимых текстов и клиент отдельно). Сливать 14.1 и 14.2 нельзя: двенадцать
> долгов в десятке подсистем и два разных приёма — та же ширина, из-за
> которой делилась Фаза 12. 14.2 после 14.1 — её новые коды и ключи
> проходят уже исправленную опись.
>
> **Решения пользователя 2026-10-13.** Журнал генерации переводится (при
> `showLogs` его видит любой читатель концепции, это не только диагностика
> владельца). Описание продукта Stripe переводится — английским, одно на
> все языки (у Stripe нет описания по языку). Д-59 — «как проще и
> надёжнее»: имя подраздела вокруг документа = видимый `<h4>` самого
> документа, а не перевод ключа по таблице.
>
> **Сквозное правило фазы.** Значения `data-section`, машинные значения
> таблиц, промпты и русские зеркала выгрузок через `tl()`/`tData()` не
> проходят (конституция Фазы 11 не меняется). Хранимое — кодом, фраза —
> при чтении под языком запроса; старые записи без кода показываются как
> есть. Новые ключи получают черновики en/de (`i18n:import --draft`) —
> `i18n:check --strict` входит в `check:integration`. Каждый пункт первого
> запроса — строка §12 с номером; закрытая строка уходит в 08 Часть IV.

---

### Беседа 14.1: Опись и сообщения ответа (бэкенд)

**Контекст для загрузки:**
- `07-conversation-protocol.md` §12 — строки с адресатом 14.1 (Д-51, Д-52, Д-53, Д-56, Д-58, Д-60, Д-61); врезка «Фаза 14»; «По факту» 9.1, 9.2, 11.2, 11.4, 12.3, 12.5, 13.1 (новый редактор ручной правки — его тексты и санитайзер)
- `03-specification.md` §2.1 (язык ответов сервера, формат ошибок, `details`), `02-data-model.md` (`mail_outbox`, `users.ui_locale`), `04-code-reuse-map.md`, `05-file-structure.md`
- `scripts/i18n/README.md` целиком; `scripts/i18n/ui-strings-lib.mjs` (`SCOPE`, режим `msg`, `MSG_PROPS`, `MSG_CALLS`), `i18n-check.mjs`, `i18n-core.mjs` (`MIRROR_EXCLUSIONS`, `SCAN_SKIP`)
- Из предыдущих бесед:
  - Д-52: `server/routes/auth.ts`, `syntheses.ts`, `taxonomy.ts`, `enrichment.ts`, `lineage.ts`, `billing.ts`; `server/services/element-editor.ts` (`str`/`num`/… и проверки связи), `element-enrichment.ts` (`validateJustifyInput`), `edit-planner.ts` (проверка тела плана)
  - Д-53: `server/services/account-deletion.ts` (`LAST_ADMIN_MESSAGE`), `element-editor.ts` (`TABLE_LOCK_HINT`, `CAPSULE_LOCK_HINT`), `server/index.ts` (`notFound`/`onError`), `server/ws/handler.ts`, `server/routes/syntheses.ts` (запасные «Не удалось …»)
  - Д-60: `server/utils/html-parser.ts` (чистка разметки, строка-место вложенного подраздела, проверка строк-мест), `element-editor.ts` (`updateSubsection`, `getSubsectionSource`)
  - Д-51: `server/services/mail/templates.ts`, `mail/outbox.ts` (`enqueue`), `server/services/auth-tokens.ts` (`queueTokenMail`, `MailRecipient`), `server/routes/auth.ts` (кто ставит письмо), `server/i18n/locale.ts` (`runWithLocale`)
  - Д-56: `server/services/export/png-exporter.ts`, `packages/shared/i18n/data.ts` (`tData`)
  - Д-61: `scripts/seed/stripe-create-prices.ts` (`ensureProduct`, `findProduct`), `server/services/stripe-client.ts`, `server/services/subscription-service.ts` (создание Checkout), `tools/stripe-mock.mjs`, `deploy/*` (раздел о пересеве цен)
  - образец собранной при чтении фразы — `server/services/recommendation-issues.ts` (12.3)
  - `server/integration-check.mts` — секции 4aw/4ay (образцы проверок i18n), 4bd (12.5)
- Исходник: НЕ НУЖЕН. Дизайн-набор: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседы 10.1–11.1 — текст запроса против кода: первый ход — grep по каждой названной функции, расхождения ДО правок
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`; черновики — `i18n:import --draft`, затем `i18n:split`
- §2, беседа 11.4 — `tl()`/`tData()` в модулях промптов, разбора и экспорт-зеркал ловят 4x/4y/4ay: зеркала остаются русскими
- §4, беседа 11.4 — предпосылки харнесса одной командой ДО написания теста; лимит вызова песочницы — долгий прогон в фоне, опросы `sleep ≤ 95`
- §8, беседа 7.1 — «нет ✗» ложно ловит «0 ✗»

**Первый запрос:**
```
Закрываю долги реестра §12 с адресатом 14.1 — опись i18n и всё, что
сервер собирает в момент ответа. Хранимые тексты (причина паузы,
parseWarnings, журнал, родословная) и клиент — 14.2: при
нехватке — строка §12 с адресатом, а не правка походя.

0. ПЕРВЫЙ ХОД — сверка текста с кодом: grep по каждой названной
   функции и константе; расхождения выписать ДО правок.

1. Д-58 — ПЕРВЫМ. Опись i18n (ui-strings-lib.mjs, режим msg) учится
   видеть: (1) присваивание details[поле] = "…" / d[field] = …;
   (2) константу уровня модуля с кириллицей, переданную в Error или
   ответ по имени; (3) server/index.ts и прочие файлы сервера вне
   SCOPE; (4) текст, собранный в переменную и отданный свойством не из
   MSG_PROPS (subject); (5) warnings.push(…) в утилитах. Белый список —
   то, что русским остаётся по конституции Фазы 11: server/config
   (промпты), разбор документа, таблицы документа, экспорт-зеркала,
   алиасы таксономии, MODE_CONFIG, вывод в консоль, env. Прогон до
   правок пп.2–7 ОБЯЗАН найти каждое место из строк Д-51…Д-53, Д-56,
   Д-60 (счёт — в «По факту»); после них — ноль. README scripts/i18n
   («Какие строки сервера видит опись») — дописать.

2. Д-52. Тексты проверки полей (details) — через tl() под языком
   запроса; имена разделов внутри — tData(KEY_LABELS[…]). Места — по
   строке §12.

3. Д-53. LAST_ADMIN_MESSAGE, TABLE_LOCK_HINT, CAPSULE_LOCK_HINT —
   фабрики либо tl() в месте отдачи (константа уровня модуля с tl()
   вычислилась бы при импорте — «static»); notFound/onError в
   server/index.ts и запасные «Не удалось …» — tl().

4. Д-60. Ручная правка подраздела: предупреждения чистки разметки и
   отказы проверки строк-мест — tl() под языком запроса; строка-место
   вложенного подраздела в поле правки — с переведённым текстом.
   Разбор строки-места — по номеру (он и так по idx): правка текста
   строки не должна ломать сохранение старых черновиков — проверить.

5. Д-51. Письма службы собираются под языком ПОЛУЧАТЕЛЯ в момент
   постановки в mail_outbox: MailRecipient += uiLocale (users.ui_locale),
   queueTokenMail оборачивает сборку в runWithLocale; тема, текст,
   кнопка, сноска — tl(); «час/часа/часов» — плюралом {n, plural, …};
   lang у <html> — по языку. Тело в очереди хранится уже собранным —
   это и есть язык чтения для одного адресата.

6. Д-56. PNG-выгрузка — целиком на языке запроса: заголовки легенды,
   описания маркеров, «Кластер», «другое», строка направлений — tl();
   типы категорий и связей в легенде — tData (значение без ключа — как
   есть). Прочие выгрузки остаются русскими зеркалами — не трогать;
   сторожа 4y/4ay поправить так, чтобы PNG был исключением явно, а не
   по недосмотру.

7. Д-61. Описание продукта Stripe — английским, одно на все языки
   (решение пользователя). Сид обновляет описание существующего
   продукта (POST /v1/products/:id) — сейчас findProduct → skip;
   маршрут — в tools/stripe-mock.mjs; Checkout получает locale по языку
   интерфейса покупателя (ru/en/de; иначе "auto"). deploy/* — пересев.

8. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   опись с пп.1(1)–(5) находит ноль мест вне белого списка; письма под
   языком получателя (живьём: en-пользователь → тема и кнопка
   по-английски, ru — как прежде); PNG без кириллицы при языке en.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не трогать хранимые тексты (pausedState.reason, parseWarnings,
  section_label/error_message журнала, file_genealogy);
- не трогать клиент — 14.2;
- не переводить промпты, разбор, машинные значения таблиц документа и
  экспорт-зеркала HTML/MD/MMD/JSON;
- не ослаблять сторожа, чтобы опись позеленела: место либо
  переводится, либо попадает в белый список с доводом в «По факту».
```

**Последующие запросы:**
- «Протестируй Д-58: опись на коде ДО правки находит каждое место из строк Д-51…Д-53, Д-56, Д-60 (сверка со списком в «По факту»); после — ноль; новый русский литерал в details на копии → i18n:check --strict красный с этим местом»
- «Протестируй Д-52/Д-53/Д-60 при Accept-Language en и de: регистрация с пустым email → details по-английски/по-немецки; удаление единственного администратора → сообщение на языке запроса; несуществующий маршрут → 404 с переведённым error; правка подраздела с <script> → предупреждение чистки на языке запроса; поле правки с вложенным подразделом → строка-место переведена и сохранение проходит»
- «Протестируй Д-51: пользователь с ui_locale=de запрашивает сброс пароля → письмо в mail_outbox по-немецки (тема, текст, кнопка, «2 Stunden»), lang="de"; ru — побайтно как до правки (кроме lang, если менялся)»
- «Протестируй Д-56/Д-61: PNG при en — легенда без кириллицы, типы — переводом либо как есть без ключа; при ru — как прежде; сид цен на моке Stripe обновляет описание существующего продукта, Checkout получает locale»

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`»
- «Ревью: перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»
- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10)

**По факту 14.1 (первый запрос — 2026-10-20).** → `docs/08-history.md`, глава «Беседа 14.1», подраздел «По факту 14.1 (первый запрос — 2026-10-20)».

**По факту 14.1 (тестовые запросы 2–5 — 2026-10-20, одним заходом по решению пользователя).** → `docs/08-history.md`, глава «Беседа 14.1», подраздел «По факту 14.1 (тестовые запросы 2–5 — 2026-10-20, одним заходом по решению пользователя)».

### Беседа 14.2: Хранимые тексты и их показ (бэкенд + клиент)

**Контекст для загрузки:**
- `07-conversation-protocol.md` §12 — строки с адресатом 14.2 (Д-54, Д-55, Д-57, Д-59, Д-62; из 14.1 — Д-76 плашка строки-места, Д-77 `locale` Stripe Elements); врезка «Фаза 14»; «По факту» 1.4b, 2.2, 2.4, 8.5, 8.6, 11.1, 11.3, 12.3, 12.4, 14.1
- `02-data-model.md` (`syntheses.paused_state`, `generation_log` — `section_label`, `error_message`, `metadata`; `syntheses.file_genealogy`), `03-specification.md` (§2.1 язык ответов, §2.3 DTO разделов — `subsections`, `parseWarnings`; §3.2 `generation_paused`; логи), `04`, `05`
- Из предыдущих бесед:
  - Д-54: `server/services/streaming-manager.ts` (`pauseFriendlyMessage`, `classifyStreamError`), `generation-service.ts` и `pause-resume-service.ts` (запись `pausedState`), `packages/shared/types/synthesis.ts` (`PausedState`, `PauseReasonKind`), `packages/shared/types/ws-messages.ts` (`generation_paused`)
  - Д-55: `server/services/graph-parser.ts` (предупреждения 11.1), `generation-service.ts` (`missingSubsectionsNote`, `appendParseWarnings`), `recommendations.ts` (заметка повтора таблицы), `server/utils/html-parser.ts` (опознание подраздела по месту), `server/routes/sections.ts` (`loadSectionParseWarnings`), `log-formatter.ts` (показ предупреждений в логе); образец — `server/services/recommendation-issues.ts` (12.3: код + параметры, `renderIssue`)
  - Д-57: `server/services/lineage-service.ts` (`sanitizeFileGenealogy`, запасные имена), `import-service.ts` (запись `file_genealogy`); клиентский запасной путь — `client/src/utils/genealogy.ts`
  - Д-62: писатели записей журнала — `generation-service.ts`, `element-step.ts`, `mode-service.ts`, `plan-executor.ts`, `recommendations.ts`, `representation-transformer.ts`, `pause-resume-service.ts`, `import-service.ts` (чтение журнала из выгрузки); `server/services/log-formatter.ts` (`sectionLabel` в заголовках и строках), `server/routes/logs.ts`
  - Д-59: `server/routes/sections.ts` (`listSubsections`, сводка и полный раздел), `server/utils/html-parser.ts` (⏫ и якоря оглавления 12.2), `packages/shared/types/section.ts` (`SectionSummary`, `SectionFull`)
  - клиент — Д-54: `client/src/components/synthesis/PauseModal.tsx` (`ReasonBox`, ветки по `reasonKind`), `client/src/hooks/useStreamingGeneration.ts` (`buildPausedState`); Д-59: `client/src/stores/synthesis-store.ts` (сводки разделов), `client/src/components/document/TableOfContents.tsx`, `client/src/components/edit/EditSectionCard.tsx`, `SubsectionRegenPanel.tsx`, `ElementEditor.tsx` (`affectedSubsections`), `RecommendationsPanel.tsx` (`addressSubsection`), `client/src/api/sections.ts`; `client/src/i18n/{i18n-store.ts,useT.ts}`
  - `01-architecture.md` §8 — оформление клиента (новых классов, вероятно, не нужно)
  - `server/integration-check.mts` — 4aw/4ay, серия 14.1; харнесс-образец браузерной части — `tests/test-124-requests2-8.mjs` (Chrome 131 на сборке клиента)
- Исходник: НЕ НУЖЕН. Дизайн-набор: только при новых элементах показа

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседы 10.1–11.1 — текст запроса против кода: первый ход — grep по каждой названной функции
- §4, беседа 11.3 — браузер на СБОРКЕ клиента (vite build + preview): StrictMode двоит эффекты
- §2, беседа 9.2 — React 19 переписывает `innerHTML` при смене ССЫЛКИ `{__html}`: мемоизировать
- §1, беседа 0.3 — jsonb не хранит порядок ключей: сравнения через `canonical()`
- §2, беседа 12.3 — хранимый текст пишется кодом, фраза собирается при чтении; язык записи — не язык чтения
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`
- §4, беседа 11.4 — предпосылки харнесса одной командой ДО написания теста

**Первый запрос:**
```
Закрываю долги реестра §12 с адресатом 14.2 — хранимые тексты, видимые
заголовки подразделов и их показ. Сервер заводит поля, клиент их
рисует в этой же беседе (пп.6–7).

0. ПЕРВЫЙ ХОД — сверка текста с кодом; расхождения — до правок.

Общий приём пп.1–4 (образец — recommendation-issues.ts 12.3): хранить
код и параметры, фразу собирать при чтении под языком запроса; запись
без кода (всё, что написано до этой беседы, и импорт из выгрузки) —
показывать как есть. Миграций нет: хватает существующих jsonb-полей.

1. Д-54 (серверная половина). pausedState хранит reasonKind (есть) и
   сырое сообщение API отдельным полем (rawMessage — без фразы службы);
   reason остаётся для старых пауз и как запасной текст. Сервер больше
   не пишет готовую русскую фразу причины; числа (max_tokens, 45 с) —
   полями. 03 §3.2 и shared/types — поля. Показ — п.6.

2. Д-55. parseWarnings — коды с параметрами (graph-parser 11.1,
   missingSubsectionsNote, заметка повтора таблицы рекомендаций,
   опознание подраздела по месту); metadata.parseWarnings принимает и
   код, и строку (старые записи). loadSectionParseWarnings и
   log-formatter собирают фразу под языком запроса; SectionFull
   отдаёт уже собранные строки — клиенту 11.3 менять нечего.

3. Д-57. Запасные имена родословной не пишутся в file_genealogy:
   пустое имя + признак, подстановка при показе (клиент уже умеет;
   серверные ответы, где имя нужно текстом, — tl() при чтении). Старые
   записи с «[безымянная концепция]» / «[безымянный философ]» —
   распознавать при чтении как пустое имя.

4. Д-62. Журнал генерации: каждый писатель кладёт в metadata код
   подписи и параметры (ключи разделов прохода, имя подраздела, вид
   операции — перегенерация / точечная правка / по рекомендации N,
   раунд M / трансформация / каскад / повтор таблицы; код ошибки
   службы); section_label пишется как прежде (русская запасная строка
   для старых читателей и выгрузки). log-formatter собирает подпись по
   коду под языком запроса (tData(KEY_LABELS) + tl()), запись без кода
   — section_label как есть. Сообщения API Anthropic — как есть (сырые
   данные). Журнал в выгруженном HTML — русское зеркало (11.4), не
   трогать.

5. Д-59 (серверная половина). Решение пользователя — «как проще и
   надёжнее»: имя подраздела вокруг документа = видимый <h4> самого
   документа. GET /sections и полный раздел отдают рядом с subsections
   карту subsectionTitles: ключ data-section → видимый текст <h4>
   (без ⏫ и якорей оглавления; нет <h4> — ключ); раздел — его
   видимый .section-title (sectionTitle). Ключи остаются машинными:
   адреса, URL, сравнения не меняются. Перевода ключей по таблице не
   заводить. Показ — п.7.

6. Д-54 (клиент). PauseModal собирает причину паузы по reasonKind
   через tl() (числа — подстановками из полей п.1), сырое сообщение
   API — отдельной строкой как деталь; старая пауза без новых полей —
   reason как есть. useStreamingGeneration переносит новые поля.

7. Д-59 (клиент). Общий помощник поверх хранилища разделов:
   subsectionTitle(sectionKey, name) → видимый заголовок из
   subsectionTitles, нет — ключ. Им рисуются имена подразделов во ВСЕХ
   местах строки §12: оглавление, кнопки подразделов EditSectionCard,
   панель точечной перегенерации, «Подраздел …» в ElementEditor, адреса
   рекомендаций. Оглавление рядом с телом документа и имена разделов
   берёт из sectionTitle; прочий интерфейс — tData(KEY_LABELS), как
   сейчас. Ключи (сравнения, адреса, data-атрибуты, якоря) не меняются.

8. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   pauseFriendlyMessage не пишет в pausedState готовую фразу;
   parseWarnings новых записей — коды; file_genealogy без русских
   заглушек; писатели журнала кладут код подписи; DTO разделов несёт
   subsectionTitles; живьём — при en log-formatter и /sections отдают
   английские фразы по новым записям и как есть — по старым. Сторож
   4-серии клиента: PauseModal не выводит pausedState.reason при наличии
   новых полей; в перечисленных компонентах имя подраздела идёт через
   помощник, а не ключом.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не трогать клиент сверх пп.6–7;
- не переписывать старые записи БД задним числом: они показываются
  как есть;
- не переводить промпты, разбор, машинные значения и экспорт-зеркала;
- не заводить строки таблицы для имён подразделов (Д-59 — по
  видимым заголовкам).
```

**Последующие запросы:**
- «Протестируй Д-54: обрыв по max_tokens на моке → pausedState без русской фразы, reasonKind и числа полями; старая пауза с reason — читается как прежде»
- «Протестируй Д-55/Д-62: генерация с пропущенным подразделом и переведёнными атрибутами на моке → parseWarnings и подписи журнала кодами; при Accept-Language en /sections и /logs/formatted — английские фразы, при ru — побайтно прежние русские; старая запись генлога без кода — как есть»
- «Протестируй Д-57: импорт файла с безымянным предком → в file_genealogy пустое имя; старая запись с «[безымянная концепция]» показывается при en переводом»
- «Протестируй Д-59 (сервер): /sections на английском документе несёт subsectionTitles с английскими <h4> и sectionTitle; на документе без <h4> — ключи; ⏫ и якоря оглавления в заголовок не попадают»
- «Протестируй Д-54 в браузере (Chrome 131, сборка клиента): пауза по max_tokens при en → причина по-английски с числом; при ru — как прежде; старая пауза (reason без новых полей) — текст как есть»
- «Протестируй Д-59 в браузере: английский документ в немецком интерфейсе → оглавление и кнопки подразделов показывают английские заголовки документа; документ без <h4> — ключи; клик по подразделу оглавления ведёт к нему (якорь по ключу)»

**По факту 14.2 (первый запрос — 2026-10-26).** → `docs/08-history.md`, глава «Беседа 14.2», подраздел «По факту 14.2 (первый запрос — 2026-10-26)».

**По факту 14.2 (тестовые запросы 2–7 — 2026-10-26, одним заходом по решению пользователя).** → `docs/08-history.md`, глава «Беседа 14.2», подраздел «По факту 14.2 (тестовые запросы 2–7 — 2026-10-26, одним заходом по решению пользователя)».

**По факту 14.2 (завершение — 2026-10-26).** → `docs/08-history.md`, глава «Беседа 14.2», подраздел «По факту 14.2 (завершение — 2026-10-26)».

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`, `vite build`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`»
- «Ревью: перечисли оставшиеся TODO и заглушки»
- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10); если реестр пуст — Фаза 14 закрыта, строка в README

---

### Фаза 15 (добавлена 2026-10-14): снятие ограничений

> **15.1 закрыта 2026-10-27** (Д-68, Д-69, Д-70; попутно Д-80 — заведён
> и закрыт той же беседой). Д-78/Д-79 (найдены сверкой 14.2) получили
> адресат 15.2. **15.2 закрыта 2026-11-04** (Д-71; попутно Д-78, Д-79;
> ограничение Огр-13 — восстановления удалённого элемента из снимка нет).
> **15.3 закрыта 2026-11-04** (Д-72, Д-73; миграция 0015 `email_change`;
> новых долгов нет). **15.4 закрыта 2026-11-05** (Д-74, Д-75; миграция
> 0016 `plan_editions`; новых долгов нет). **Фаза 15 ЗАКРЫТА 2026-11-05;
> реестр §12 пуст** — запланированных бесед нет.
>
> Заведена ревизией ограничений 2026-10-14 (вне бесед). Вопрос
> пользователя: какие из ограничений 07 §12 устранимы без коренной
> переделки архитектуры? Ответ, принятый пользователем: все, кроме
> Огр-5 (правка чужой концепции и роли редакторов — новая модель
> доступа), Огр-11 (гейт операции в памяти процесса — снимается только
> вместе с горизонтальным масштабированием) и трёх, что долгами не
> являются (Огр-8 — защитная ветка, Огр-9 — согласованный с рендером
> вырожденный случай, Огр-12 — закреплённое решение 12.3). Сверка с
> кодом нашла попутно ещё три дефекта (Д-66, Д-70, Д-75); три утечки
> (Д-65…Д-67) ушли в 13.2 — безопасность раньше локализации.
>
> **Решения пользователя 2026-10-14** («как надёжнее» — по Огр-2 и
> Огр-7):
> - **Отвязка родителя (Д-69)** — обратная операция привязки: снимается
>   только связь, перекрывающая узел дерева файла, и узел проступает
>   снова; родителя, по которому документ сгенерирован, отвязать нельзя
>   (409 `LINEAGE_GENERATED`). Дерево потомков не трогается.
> - **Тарифы (Д-74)** — источник истины БД, правка админкой и
>   РЕДАКЦИЯМИ: у плана с живыми подписками цена и квоты не меняются на
>   месте — заводится новая редакция с новым Price, прежняя закрывается
>   для покупки, подписчики дорабатывают на своей. `plans.ts` — только
>   начальный посев.
>
> **Четыре беседы по подсистемам.** 15.1 «Родословная после импорта»
> (Д-68, Д-69, Д-70), 15.2 «Удаление элементов и подразделов» (Д-71),
> 15.3 «Почта» (Д-72, Д-73), 15.4 «Тарифы» (Д-74, Д-75). Каждая —
> сервер и клиент своей подсистемы; пересечений по файлам между 15.1 и
> 15.2 нет. Фаза идёт ПОСЛЕ Фазы 14: новые письма 15.3 и тексты всех
> четырёх бесед рождаются уже под исправленной описью и переводами.
> Миграции — 15.1 (уникальный индекс родословной), 15.3 (назначение
> токена `email_change`), 15.4 (редакции тарифов); номер — следующий
> свободный на момент беседы.

---

### Беседа 15.1: Родословная после импорта — привязка, отвязка, целостность (бэкенд + клиент)

**Контекст для загрузки:**
- `07-conversation-protocol.md` §12 — строки Д-68, Д-69, Д-70; врезка «Фаза 15»; «По факту» 3.1, 3.2, 8.5, 8.6, 12.2, 13.2
- `02-data-model.md` (`synthesis_lineage`, `syntheses.file_genealogy`), `03-specification.md` (`/lineage/*`, коды `LINEAGE_*`, копия синтеза, импорт), `04`, `05`
- Из предыдущих бесед:
  - сервер: `server/routes/lineage.ts` (`POST /lineage/link`, `/lineage/search`, `/lineage/descendants`, `pruneInvisible`), `server/services/lineage-service.ts` (`linkParent`, `isDescendantOf`, `unlinkedFileParents`, `rowIsLive`, `getAncestors`, `findSameOwnerSynthesesByTitle`, `sanitizeFileGenealogy`), `server/routes/syntheses.ts` (`buildSynthesisFull`, `loadConceptParentFlags`, копия синтеза), `server/services/import-service.ts` (блок родословной), `server/services/prompt-reconstruction.ts`, `server/db/schema.ts` (`synthesisLineage`) и журнал миграций
  - клиент: `client/src/components/lineage/GenealogyTree.tsx`, `client/src/utils/genealogy.ts`, `client/src/api/lineage.ts`, `client/src/pages/ImportPage.tsx` (`linkCandidate` — образец второго шага), `client/src/pages/SynthesisPage.tsx` (`isMetaSynthesis`, древо в шапке), `client/src/hooks/useSecondStep.ts`
  - `server/integration-check.mts`; харнессы-образцы — `tests/test-85-*` (родословная при импорте), `tests/test-124-requests2-8.mjs` (Chrome 131 на сборке клиента)
- Исходник: НЕ НУЖЕН. Дизайн-набор: только для нового действия у узла древа

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседы 10.1–11.1 — текст запроса против кода: первый ход — grep по каждой названной функции
- §2, беседа 9.1 — сторож места миграции, а не «последняя миграция — N»
- §3, беседы 7.1 и 8.6 — тег миграции drizzle-kit переименовывать; перенос данных — рукой
- §4, беседа 11.3 — браузер на СБОРКЕ клиента (vite build + preview)
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`

**Первый запрос:**
```
Закрываю долги реестра §12 с адресатом 15.1 — родословная после
импорта: привязка, отвязка, целостность связей.

0. ПЕРВЫЙ ХОД — сверка текста с кодом; расхождения — до правок.

1. Д-70 (сервер) — ПЕРВЫМ, на нём стоят пп.2–3. Миграция: чистка
   дублей пары (synthesis_id, parent_synthesis_id) при
   parent_type='synthesis' и частичный уникальный индекс; linkParent
   переводит нарушение индекса в LINEAGE_EXISTS. Копия синтеза
   переносит file_genealogy. Одно правило «мета-синтез» для
   loadConceptParentFlags и isMetaSynthesis (строка родителя, чей
   синтез удалён, — считается или нет: выбор с доводом в «По факту»).

2. Д-68 (сервер). Кандидаты для узла файла: GET (путь — по образцу
   /lineage/*) по позиции узла верхнего уровня → совпадения по имени
   среди синтезов владельца + поиск по подстроке названия среди своих;
   узел уже перекрыт или не концепция — 409. Привязка — существующий
   POST /lineage/link (позицию перекрытия linkParent ставит сам).

3. Д-69 (сервер). DELETE /syntheses/:id/lineage/link/:parentSynthesisId
   — владелец ребёнка; снимает строку ТОЛЬКО если на её позиции в
   file_genealogy стоит узел-концепция; иначе 409 LINEAGE_GENERATED
   (03 §4.3 — код). Потомки не трогаются. Активная операция над
   ребёнком — 409, как у прочих правок.

4. Клиент. В древе у неперекрытого узла-концепции верхнего уровня —
   действие «Связать с концепцией…» (кандидаты, поиск, второй шаг
   useSecondStep); у связанного родителя, перекрывающего узел файла,
   — «Отвязать» (второй шаг); у родителя без узла файла действия нет.
   После любого — перечитать синтез и древо.

5. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   уникальный индекс в схеме и миграции; linkParent ловит нарушение;
   DELETE отказывает строке без узла файла; копия переносит
   file_genealogy; одно правило «мета» на обеих сторонах.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не приписывать родителя синтезам сервиса без дерева файла;
- не трогать правило allow_meta и ветку UUID импорта (13.2);
- не переписывать сгенерированные тексты и журнал при отвязке.
```

**Последующие запросы:**
- «Протестируй Д-68/Д-69 живьём: ребёнок импортирован раньше родителя → родитель импортирован → кандидаты узла его находят → привязка → узел кликабелен, ребёнок в «Потомках» родителя и в /lineage/search; отвязка → узел файла снова снимок, «Потомки» без ребёнка; отвязка родителя мета-синтеза → 409 LINEAGE_GENERATED»
- «Протестируй Д-70: два одновременных POST /lineage/link → одна строка, второй — LINEAGE_EXISTS; миграция на копии БД с дублем — дубль снят; копия импортированного синтеза несёт file_genealogy; удалённый родитель — бейдж каталога и шапка концепции согласны»
- «Протестируй в браузере (Chrome 131, сборка клиента): связать узел через кандидата и через поиск, второй шаг обязателен; отвязать; у родителя без узла файла действия нет»

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`, `vite build`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, css-parity»
- «Ревью: перечисли оставшиеся TODO и заглушки»
- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10)

**По факту 15.1 (первый запрос — 2026-10-27).** → `docs/08-history.md`, глава «Беседа 15.1», подраздел «По факту 15.1 (первый запрос — 2026-10-27)».

**По факту 15.1 (тестовые запросы 2–4 — 2026-10-27, одним заходом по просьбе пользователя).** → `docs/08-history.md`, глава «Беседа 15.1», подраздел «По факту 15.1 (тестовые запросы 2–4 — 2026-10-27, одним заходом по просьбе пользователя)».

**По факту 15.1 (завершение — 2026-10-27).** → `docs/08-history.md`, глава «Беседа 15.1», подраздел «По факту 15.1 (завершение — 2026-10-27)».

### Беседа 15.2: Удаление элементов и подразделов — вручную и по рекомендации (бэкенд + клиент)

**Контекст для загрузки:**
- `07-conversation-protocol.md` §12 — строки Д-71, Д-78, Д-79 (адресат назначен 15.1 — попутные, малые); врезка «Фаза 15»; «По факту» 2.1, 2.2, 5.1, 5.2, 9.2, 10.1, 10.2, 10.3, 12.3, 14.2 (п.0-ж, Д-78; Д-79)
- `02-data-model.md` (`categories`, `category_edges`, `theses`, `glossary_terms`, `element_versions`, `element_enrichments`, `characteristic_justifications`, `recommendations`, `cluster_labels`, `edit_plans`), `03-specification.md` (§2.4 элементы и версии, §2.6 планы, §2.16 рекомендации), `04`, `05`
- Из предыдущих бесед:
  - сервер: `server/services/element-editor.ts` (`deleteCategoryEdge` — образец, `computeElementImpact`, `countNameMentions`, `subsectionLockOf`), `server/services/element-versioning.ts`, `server/routes/elements.ts`, `server/utils/html-parser.ts` (`removeSubsectionHtml`), `server/services/edit-planner.ts` (`normalizeActions`, `updatePlan`, `subRegensFromSteps`, `elementActionsFromSteps`, `isModeTarget`), `server/services/plan-executor.ts` (`parseModeTarget`, `touchedSectionOf`, `bumpVersionsForPlan`, `appendCascadeSteps`), `server/services/element-step.ts`, `server/services/recommendation-planner.ts` (`rowsToPlanActions`), `packages/shared/types/edit-plan.ts`, `packages/shared/constants/edit-steps.ts` (`FREE_STEP_TYPES`), `packages/shared/constants/recommendations.ts`
  - клиент: `client/src/components/edit/{ElementEditor,CategoryEditor,ThesisEditor,GlossaryTermEditor,VersionHistory,EditSectionCard,EditPlanPanel,CascadePanel,RecommendationsPanel}.tsx`, `client/src/utils/recommendations.ts` (`costKindOf`, `actionTextOf`, `isSelectableRow`), `client/src/hooks/useSecondStep.ts`
  - `server/integration-check.mts` (4au — зеркало рекомендаций); харнессы-образцы — `tests/test-102-*`, `tests/test-103-*`, `tests/test-124-requests2-8.mjs`
- Исходник: НЕ НУЖЕН. Дизайн-набор: только для кнопки удаления и строки шага в панели плана

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседы 10.1–11.1 — текст запроса против кода: первый ход — grep по каждой названной функции
- §3, беседа 10.2 — ссылки, снимки, статусы: снимок версии и ссылки на удалённое
- §1, беседа 0.3 — jsonb не хранит порядок ключей: сравнения через `canonical()`
- §4, беседа 11.3 — браузер на СБОРКЕ клиента (vite build + preview)
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`

**Первый запрос:**
```
Закрываю Д-71 — удаление элемента и подраздела вручную и шагом плана
по рекомендации «удалить».

0. ПЕРВЫЙ ХОД — сверка текста с кодом; перечень ВСЕХ таблиц и jsonb-
   полей, ссылающихся на категорию, тезис, термин (с FK и без), — до
   правок, в «По факту». Там же — решение: восстанавливается ли
   удалённый элемент из снимка версии (если дёшево — да; если нет —
   второй шаг кнопки и строка «Огр-N»).

1. Сервис deleteElement(synthesisId, kind, id), kind ∈ category |
   thesis | glossary_term: одна транзакция, снимок версии 'manual';
   рёбра — каскадом FK; висячие ссылки без FK — чистятся по перечню
   п.0 (related_categories, обогащения, обоснования, рекомендации —
   строка не удаляется, ссылка гаснет, кластеры); запертые таблицы
   перерисовываются (образец — deleteCategoryEdge); упоминания имени в
   тексте разделов — отчётом влияния (computeElementImpact), сами не
   вычищаются. Маршруты DELETE для трёх видов; активная операция —
   409, как у PATCH.

2. Удаление подраздела: removeSubsectionHtml; запертые подразделы
   (subsectionLockOf: таблицы из графа и тезисов, капсула) — отказ;
   снимок версии раздела. Что делает перегенерация раздела с удалённым
   подразделом, которого требует subsection_map (вернёт ли его модель,
   не сочтёт ли пропуском missingSubsectionsNote), — решить первым
   ходом с доводом.

3. Планы: НОВЫЕ типы шагов delete_element (цель kind:id) и
   delete_subsection (цель раздел + имя подраздела), бесплатные
   (FREE_STEP_TYPES). Не под delete — там цель различается по «:».
   normalizeActions: удаление элемента в разделе, который тем же
   планом удаляется или перегенерируется, — отказ (как у правки
   элемента); updatePlan переносит новые шаги. Исполнитель зовёт
   сервис пп.1–2; каскад — через раздел-хозяин.

4. Рекомендации: rowsToPlanActions исполняет «удалить» шагами п.3
   вместо отказа delete_element / delete_subsection; клиентское
   зеркало (costKindOf, actionTextOf, isSelectableRow) — строка
   выбирается, бесплатна; сторож 4au.

5. Клиент: кнопка «Удалить» в редакторе категории, тезиса и термина
   (второй шаг, отчёт влияния после); у подраздела в карточке правки
   — «Удалить подраздел» (второй шаг); строки новых шагов в панели
   плана и каскада.

6. Попутно (адресат назначен 15.1; оба малые, в тех же файлах):
   Д-78 — plan-executor пишет pause_marker дважды (createPausedState и
   свой logPauseEvent): оставить один маркер с полями причины; Д-79 —
   listSubsections (routes/sections) и subsectionNamesOf (routes/
   syntheses) — один помощник в server/utils/html-parser.ts рядом с
   sectionTitlesOf (парсер подразделов 1.4 — параметром, чтобы не
   замкнуть цикл импортов, из-за которого копия появилась).

7. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   типы шагов в shared ≡ ветки исполнителя ≡ updatePlan; «удалить» в
   рекомендациях не отклоняется; DELETE запертого подраздела — отказ;
   после deleteElement нет висячих ссылок по перечню п.0; один
   pause_marker у паузы плана; одно перечисление подразделов.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не вычищать упоминания удалённого элемента из текста разделов
  (только отчёт влияния и каскад);
- не менять шаг delete (раздел, результат режима);
- не трогать промпты и разбор таблицы рекомендаций.
```

**Последующие запросы:**
- «Протестируй п.1 живьём: удалить категорию с рёбрами, тезисом-ссылкой, обогащением и обоснованием → рёбер и висячих ссылок нет, таблицы перерисованы, снимок версии есть, отчёт влияния называет упоминания; тезис и термин — так же»
- «Протестируй пп.3–4: рекомендация «удалить» (элемент и подраздел) выбирается в панели, план исполняется бесплатно, документ без них; удаление в разделе, который тот же план перегенерирует, — отказ при сборке»
- «Протестируй п.2: удалить обычный подраздел → его нет в разделе, снимок раздела есть; запертый — отказ; перегенерация раздела после удаления — по решению п.2»
- «Протестируй в браузере (Chrome 131, сборка клиента): кнопки со вторым шагом, отчёт влияния, строки шагов в панели плана»

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`, `vite build`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, css-parity»
- «Ревью: перечисли оставшиеся TODO и заглушки»
- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10)

**По факту 15.2 (первый запрос — 2026-11-03).** → `docs/08-history.md`, глава «Беседа 15.2», подраздел «По факту 15.2 (первый запрос — 2026-11-03)».

**По факту 15.2 (тестовые запросы 2–5 — 2026-11-04, одним заходом по просьбе пользователя).** → `docs/08-history.md`, глава «Беседа 15.2», подраздел «По факту 15.2 (тестовые запросы 2–5 — 2026-11-04, одним заходом по просьбе пользователя)».

**По факту 15.2 (завершение — 2026-11-04).** → `docs/08-history.md`, глава «Беседа 15.2», подраздел «По факту 15.2 (завершение — 2026-11-04)».

### Беседа 15.3: Почта — обслуживание очереди и смена адреса (бэкенд + клиент)

**Контекст для загрузки:**
- `07-conversation-protocol.md` §12 — строки Д-72, Д-73; врезка «Фаза 15»; «По факту» 0.5, 8.1, 9.1, 13.2, 14.1
- `02-data-model.md` (`mail_outbox`, `auth_tokens`, `sessions`, `users.email`, `users.email_verified`), `03-specification.md` (§2.1 `/auth/*`, `TOKEN_INVALID`, письма), `04`, `05`
- Из предыдущих бесед:
  - сервер: `server/services/mail/{outbox.ts,worker.ts,templates.ts}` (`enqueue`, `processOutbox`, `SCRUBBED`, `startMailWorker`, `getOutboxCounts`), `server/services/auth-tokens.ts` (`issueToken`, `consumeToken`, `isTokenUsable`, `revokeTokens`, `TOKEN_TTL_HOURS`, `queueTokenMail`), `server/routes/auth.ts` (вход, `/password-reset/*`, `/email/verify/*`, `PATCH /me`, `mailLimiter`), `server/middleware/auth.ts` (ленивое удаление сессий), `server/env.ts` (`mail`), `server/services/admin-audit.ts`, `server/db/schema.ts` (`authTokens` — CHECK назначения) и журнал миграций
  - клиент: `client/src/pages/ProfilePage.tsx`, `VerifyEmailPage.tsx`, `ResetPasswordPage.tsx` (образцы страниц по ссылке из письма), `client/src/pages/AdminPromptsPage.tsx` (`AccessTab` — образец вкладки), `client/src/stores/auth-store.ts` (запросы `/auth/*` — отдельного `api/auth.ts` нет), `client/src/api/admin.ts`, `client/src/App.tsx` (маршруты)
  - `server/integration-check.mts`; харнесс-образец — `tests/test-91-requests2-11.mjs` (почта живьём)
- Исходник: НЕ НУЖЕН. Дизайн-набор: для формы смены адреса и вкладки «Почта»

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседы 10.1–11.1 — текст запроса против кода: первый ход — grep по каждой названной функции
- §2, беседа 9.1 — сторож места миграции, а не «последняя миграция — N»
- §3, беседы 7.1 и 8.6 — тег миграции drizzle-kit переименовывать; CHECK меняется миграцией рукой
- §2, беседы 8.4–8.6 и 9.1 — dotfile-грабля: новые переменные `.env.example` сверять после выкладки
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`

**Первый запрос:**
```
Закрываю долги реестра §12 с адресатом 15.3 — обслуживание почты и
токенов, смена адреса.

0. ПЕРВЫЙ ХОД — сверка текста с кодом; расхождения — до правок.

1. Д-72 (1). Чистка: проход работника почты реже основного цикла —
   mail_outbox sent/failed старше MAIL_RETENTION_DAYS, auth_tokens
   погашенные и просроченные старше AUTH_TOKEN_RETENTION_DAYS,
   истёкшие сессии (env, .env.example, deploy/*). Сбой прохода сервер
   не роняет (fail-open, как работник).

2. Д-72 (2). Время ответа: POST /password-reset/request отвечает не
   раньше фиксированного минимума (env) при любом исходе — либо
   постановка письма уходит из пути ответа (выбор с доводом: письмо
   должно остаться в той же транзакции, что и токен); вход для
   несуществующего адреса делает холостое сравнение bcrypt.

3. Д-72 (3). Вкладка «Почта» админки: счётчики по статусам
   (getOutboxCounts) и последние N строк без тел (адрес, тема,
   статус, попытки, последняя ошибка, даты); маршрут под requireAdmin.
   Повтора отправки нет — тела затёрты.

4. Д-73 (сервер). Миграция: auth_tokens.purpose += email_change, новый
   адрес — в строке токена. POST /auth/email/change/request {newEmail,
   password} → токен и письмо со ссылкой на НОВЫЙ адрес (ответ на
   занятый адрес — тот же, письма нет); POST /auth/email/change/confirm
   → адрес сменён, подтверждён, токены сброса пароля погашены,
   уведомление на СТАРЫЙ адрес; занятый к моменту подтверждения —
   TOKEN_INVALID. Письма — через templates под языком получателя
   (после 14.1). admin_audit не нужен (это действие самого
   пользователя) — либо нужен: решить с доводом.

5. Д-73 (клиент). Форма смены адреса в ProfilePage (новый адрес +
   пароль); страница подтверждения по ссылке из письма (образец —
   VerifyEmailPage).

6. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   работник зовёт чистку; форма сброса выравнивает время; вход для
   несуществующего адреса сравнивает bcrypt; назначение email_change в
   схеме, CHECK и миграции; маршрут вкладки «Почта» под requireAdmin.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не хранить тела отправленных писем ради повтора;
- не менять лимитер (13.2) и шаблоны прежних писем сверх общего
  помощника;
- не трогать тарифы (15.4).
```

**Последующие запросы:**
- «Протестируй Д-72 живьём: строки sent/failed и токены старше срока исчезают после прохода, моложе — остаются; время ответа формы сброса для существующего и несуществующего адреса совпадает в пределах шума (20 прогонов, медианы); вход для несуществующего адреса — время сравнимо с неверным паролем; вкладка «Почта» видна администратору, пользователю — 403»
- «Протестируй Д-73: смена адреса → письмо на новый с ссылкой, на старый — уведомление после подтверждения; вход по новому адресу; занятый адрес — ответ тот же, письма нет; повторное подтверждение — TOKEN_INVALID; пользователь с ui_locale=de получает письма по-немецки»
- «Протестируй в браузере (Chrome 131, сборка клиента): форма смены адреса, страница подтверждения, вкладка «Почта»»

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`, `vite build`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, css-parity»
- «Ревью: перечисли оставшиеся TODO и заглушки»
- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10)

**По факту 15.3 (первый запрос — 2026-11-04).** → `docs/08-history.md`, глава «Беседа 15.3», подраздел «По факту 15.3 (первый запрос — 2026-11-04)».

**По факту 15.3 (тестовые запросы 2–4 — 2026-11-04, одним заходом по просьбе пользователя; сжатие контекста пришлось на прогон сторожа после первого запроса).** → `docs/08-history.md`, глава «Беседа 15.3», подраздел «По факту 15.3 (тестовые запросы 2–4 — 2026-11-04, одним заходом по просьбе пользователя; сжатие контекста пришлось на прогон сторожа после первого запроса)».

**По факту 15.3 (завершение — 2026-11-04).** → `docs/08-history.md`, глава «Беседа 15.3», подраздел «По факту 15.3 (завершение — 2026-11-04)».

### Беседа 15.4: Тарифы — админка редакциями и согласие подписки с тарифом (бэкенд + клиент)

**Контекст для загрузки:**
- `07-conversation-protocol.md` §12 — строки Д-74, Д-75; врезка «Фаза 15»; «По факту» 6.1, 6.2, 7.1, 8.1, 8.2, 8.3, 12.3, 14.1
- `02-data-model.md` (`subscription_plans`, `user_subscriptions`, `admin_audit`), `03-specification.md` (§2.10 биллинг, вебхук), `04`, `05`; `09-lessons.md` §9 (стенд биллинга)
- Из предыдущих бесед:
  - сервер: `server/config/plans.ts` (`PLANS`, `PLAN_NAMES`, `validatePlanDefinition`, `assertPlanEconomics`, `stripeLookupKeyFor`), `scripts/seed/seed-plans.ts` (`countLiveSubscriptions`), `scripts/seed/stripe-create-prices.ts` (`ensureProduct`, `ensurePrice`, `--transfer`), `server/services/stripe-client.ts`, `server/services/subscription-service.ts` (`getPlans`, `createSubscription`, `checkQuota`, `consumeQuota`, обработчик вебхука), `server/routes/billing.ts`, `server/services/admin-audit.ts`, `tools/stripe-mock.mjs`, `server/db/schema.ts` (`subscriptionPlans`) и журнал миграций
  - клиент: `client/src/pages/AdminPromptsPage.tsx` (вкладки; карта подписей журнала — без `plan.seeded`), `client/src/pages/BillingPage.tsx`, `client/src/api/{billing.ts,subscription.ts,admin.ts}`, `client/src/hooks/useSecondStep.ts`
  - `deploy/*` и `tools/dev-billing.sh` (посев тарифов и цен; стенд различает исходы посева «created/updated/skip»); `server/integration-check.mts` (4al — посев, `STRIPE_PRICE_*` по `PLAN_NAMES`); харнессы-образцы — `tests/test-62-*`, `tests/test-71-*` (биллинг в браузере), `tests/test-82-*` (план из посева стенда)
- Исходник: НЕ НУЖЕН. Дизайн-набор: для вкладки «Тарифы»

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседы 10.1–11.1 — текст запроса против кода: первый ход — grep по каждой названной функции
- §9 — стенд биллинга: мок Stripe, `.dev-billing/`, `STRIPE_PRICE_*`
- §2, беседы 8.4–8.6 и 9.1 — dotfile-грабля: `STRIPE_PRICE_*` в `.env.example` теряется при выкладке
- §2, беседа 9.1 — сторож места миграции, а не «последняя миграция — N»
- §7, беседа 10.1 — числа в установщиках и руководствах стареют молча
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`

**Первый запрос:**
```
Закрываю долги реестра §12 с адресатом 15.4 — тарифы в админке
редакциями (решение пользователя 2026-10-14: источник истины — БД) и
согласие подписки с тарифом.

0. ПЕРВЫЙ ХОД — сверка текста с кодом; кто читает plans.ts и строку
   плана, — до правок.

1. Миграция: редакции тарифа — у строки плана семейство и номер
   редакции (name остаётся уникальным идентификатором редакции);
   существующие планы — редакция 1 своего семейства. Проверка
   экономики (assertPlanEconomics, validatePlanDefinition) — в общий
   модуль, которым пользуются и сид, и сервер.

2. Д-75 (1) + Д-74. seed:plans создаёт отсутствующие планы и НЕ
   переписывает существующие; расхождение строки с plans.ts —
   предупреждением в выводе. deploy/* — абзац о том, что тарифы
   после первого посева правятся админкой.

3. Д-74 (сервер). Маршруты под requireAdmin: список планов с числом
   живых подписок (status ≠ canceled); правка на месте — название,
   «открыт для покупки» (is_active); цена, период, квоты — на месте
   только без живых подписок (новая цена → новый Price через
   stripe-client, прежний выключается); с живыми — «новая редакция»:
   новая строка, новый Price с lookup_key редакции, прежняя
   is_active=false; квоты действующих подписчиков не меняются.
   Product — один на семейство. След — admin_audit (plan.created,
   plan.updated, plan.edition). Маршруты Product/Price — в мок.

4. Д-75 (2). Вебхук customer.subscription.updated: Price из события →
   план по stripe_price_id; найден и отличается — plan_id; не найден —
   предупреждение в журнал.

5. Клиент. Вкладка «Тарифы» админки: список (редакции, живые
   подписки, открыт/закрыт), форма правки (поля, недоступные при
   живых подписках, — заперты с подсказкой), «Новая редакция» со
   вторым шагом; карта подписей журнала += plan.*. BillingPage
   показывает только открытые для покупки — сверить.

6. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   seed:plans не переписывает существующий план; правка квот при
   живых подписках отклоняется; вебхук переносит plan_id; экономика
   проверяется одной функцией на обеих сторонах.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не переводить действующих подписчиков на новую редакцию
  (смена тарифа подписчиком — отдельное решение);
- не менять описание продукта сверх сделанного в 14.1;
- не трогать BYO-ключи и лимитер.
```

**Последующие запросы:**
- «Протестируй Д-74 на моке Stripe: план без подписок — правка цены создаёт новый Price, прежний выключен; план с подпиской — правка квот отклонена, «новая редакция» создаёт строку и Price, прежняя закрыта для покупки, подписчик сохраняет прежние квоты, новый покупатель получает новую редакцию; каждое действие — строка admin_audit»
- «Протестируй Д-75: seed:plans с изменёнными квотами в plans.ts → строка не переписана, предупреждение есть; вебхук subscription.updated с Price другой редакции → plan_id перенесён; с неизвестным Price — предупреждение, строка не тронута»
- «Протестируй в браузере (Chrome 131, сборка клиента): вкладка «Тарифы», запертые поля при живых подписках, второй шаг «Новой редакции», BillingPage без закрытых планов»

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`, `vite build`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, css-parity»
- «Ревью: перечисли оставшиеся TODO и заглушки»
- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10); если реестр пуст — Фаза 15 закрыта, строка в README

**По факту 15.4 (первый запрос — 2026-11-05).** → `docs/08-history.md`, глава «Беседа 15.4», подраздел «По факту 15.4 (первый запрос — 2026-11-05)».

**По факту 15.4 (тестовые запросы 2–4 — 2026-11-05).** → `docs/08-history.md`, глава «Беседа 15.4», подраздел «По факту 15.4 (тестовые запросы 2–4 — 2026-11-05)».

**По факту 15.4 (завершение — 2026-11-05).** → `docs/08-history.md`, глава «Беседа 15.4», подраздел «По факту 15.4 (завершение — 2026-11-05)».

### Фаза 16 (добавлена 2026-11-05): обсуждение и рецензии

> Заведена 2026-11-05 (вне бесед) по проекту спецификации социального
> функционала, присланному пользователем, и его решениям по нему. Формула
> проекта принята: обсуждение и рецензия НЕ меняют документ; изменение —
> только действием человека с правом на него и только через план правок
> и каскад (Фаза 17); у каждого изменения — происхождение; большинство
> голосов истину не устанавливает, разногласие рецензентов остаётся явным.
> Семь фаз проекта (S1–S7) сведены к двум фазам по подсистемам: Фаза 16
> (документ не меняется) и Фаза 17 (предложения и соавторство).
>
> **Решения пользователя 2026-11-05.**
> - **Круг — только приглашённые.** Рецензентов «с улицы» нет:
>   комментировать, рецензировать и предлагать могут только участники,
>   которых пригласил владелец. Отсюда — интерфейс управления правами
>   (участники, приглашения, роли) и почти не нужна модерация: в
>   закрытом круге её делают владелец (скрыть комментарий — с видимой
>   пометкой) и исключение участника.
> - **Реакций нет.** Для философской работы малоинформативны, а открытые
>   всем — инструмент спама. Вместо них — необязательный ВИД
>   комментария (вопрос, возражение, источник, неясность) внутри того же
>   закрытого круга.
> - **Квоту расходует тот, кто нажал кнопку** (Фаза 17): перегенерация,
>   режим, обогащение, исполнение плана редактором — по квоте и BYO-ключу
>   редактора; нет квоты — 402 ему, не владельцу.
>
> **Роли на уровне синтеза** (таблица `synthesis_members`, одна проверка
> прав вместо копий `ownerEditGate`/`ownerGate` и `isOwner`):
>
> | Роль | Чтение | Комментарии, рецензии, предложения | Прямая правка, генерация, принятие предложений | Участники, видимость, удаление, копия |
> |---|---|---|---|---|
> | читатель (не участник) | по видимости | — | — | — |
> | рецензент | ✓ (и приватной) | ✓ | — | — |
> | редактор (Фаза 17) | ✓ | ✓ | ✓ | — |
> | владелец | ✓ | ✓ | ✓ | ✓ |
>
> Видимость (`private`/`showcase`/`full`, `allow_meta`) остаётся прежней:
> участник видит концепцию на любой ступени; не-участнику обсуждение не
> показывается вовсе. Доступ к любому объекту обсуждения проверяется
> через родительский синтез на каждом запросе, а не по знанию id.
>
> **Устойчивый адрес — фундамент фазы.** Перегенерация графа и
> трансформация граф↔тезисы пересоздают все категории (`graph-parser.ts`,
> `representation-transformer.ts`), повторный разбор — тезисы и термины:
> адрес по одному id повис бы после первой же перегенерации. Адрес —
> вид + ключ + id + хэш: раздел — ключ; подраздел — ключ раздела и
> `data-section`; категория — имя; связь — имена концов и тип; тезис —
> метка (`label ?? thesis_num`); термин — сам термин; плюс id на момент
> записи и хэш канонического содержимого, у элементов — номер версии
> `element_versions`. После перегенерации адрес находится заново (id →
> ключ); хэш не совпал — «относится к прежней версии» (`outdated`
> вычисляется, а не ставится); объекта нет — «объект удалён». Старое
> замечание на новую версию не переносится и разрешённым не считается.
> Вместе с адресом хранится выдержка объекта на момент записи (обычный
> текст, ограниченной длины) — «как было» видно без восстановления
> снимков.
>
> **Содержимое — обычный текст.** Комментарии и поля рецензий —
> экранируемый текст с абзацами по пустой строке, без HTML и без
> Markdown-ссылок: нового входа разметки после 13.1 не открывать.
> Тексты пользователей не переводятся; надписи интерфейса — `tl()` с
> черновиками en/de.
>
> **Чего не делается** (решение пользователя 2026-11-05 по разбору
> спецификации): реакции; матрица сопоставления рецензий с машинной
> группировкой замечаний (рядом — только группировка по адресу:
> критика, комментарии и замечания рецензий к одному объекту); присутствие
> в реальном времени, мягкие блокировки и посимвольная совместная правка;
> автоматическое перебазирование предложений; слияние ветвей (это делает
> мета-синтез) и отдельное ветвление сверх существующей копии; упоминания,
> подписки на ветки, заглушение и блокировки пользователей, жалобы
> администратору; обобщение планировщика рекомендаций. Обсуждения не
> попадают в выгрузки (русские зеркала исходника) и в копию синтеза; при
> удалении синтеза уходят каскадом; удалённый аккаунт показывается как
> «удалённый пользователь».
>
> **Три беседы, порядок ЖЁСТКИЙ: 16.1 → 16.2 → 16.3.** 16.1 — сервер
> основы (адреса, участники и права, комментарии, рецензии); 16.2 —
> участники и уведомления целиком (приглашения, интерфейс прав, «Со мной
> поделились», уведомления в приложении и сводка по почте); 16.3 —
> клиент обсуждения и рецензий. Миграции — номер следующий свободный на
> момент беседы.
>
> **16.1 закрыта 2026-11-09** (миграция 0017 `discussion`; сторож
> 2bb/4bm/5aw; новых долгов нет). **16.2 закрыта 2026-11-09** (миграция
> 0018 `members_notifications`; сторож 2bc/4bn/5ax; новых долгов нет).
> **16.3 закрыта 2026-11-09** (клиент обсуждения: вкладки, пометки у
> места наложением, панель адреса, вкладки «Обсуждение»/«Рецензии»,
> страница рецензии; сторож 2bd/4bo; миграций нет; новых долгов нет).
> **Фаза 16 закрыта 2026-11-09.** Ближайшая — 17.1.

---

### Беседа 16.1: Адреса, участники и права, комментарии и рецензии (бэкенд)

**Контекст для загрузки:**
- `07-conversation-protocol.md` — врезка «Фаза 16» целиком; «По факту» 5.1, 8.6, 10.1, 12.1, 13.1, 13.2, 15.1, 15.2
- `01-architecture.md`, `02-data-model.md` (`syntheses` — видимость; `categories`, `category_edges`, `theses` — `label`, `glossary_terms`, `sections`, `element_versions`, `users`), `03-specification.md` (§2.1 коды ошибок, §2.2 доступ к синтезу по ступеням, §2.4 элементы и версии), `04`, `05`
- Из предыдущих бесед:
  - доступ: `server/routes/syntheses.ts` (`loadSynthesisForRead`, `projectSynthesis`, `buildSynthesisFull`), `server/routes/elements.ts` (`ownerEditGate`), `server/routes/enrichment.ts` и `modes.ts` (свои копии `ownerEditGate`), `server/routes/generation.ts` (`ownerGate`), `server/ws/handler.ts` (проверки владельца), `server/middleware/auth.ts`
  - адреса: `server/services/graph-parser.ts` и `representation-transformer.ts` (пересоздание категорий), `element-parser.ts` (тезисы, термины), `server/utils/html-parser.ts` (`listSubsectionNames`, `readSubsectionSource`), `server/services/element-versioning.ts`, `packages/shared/utils/normalize.ts`
  - образцы: `server/services/recommendation-issues.ts` (код при записи, фраза при чтении), `server/services/admin-audit.ts`; `server/services/account-deletion.ts` (обезличивание)
  - `server/integration-check.mts`; харнесс-образец — `tests/test-154-requests2-4.mjs`
- Исходник: НЕ НУЖЕН. Дизайн-набор: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседы 10.1–11.1 — текст запроса против кода: первый ход — grep по каждой названной функции
- §1, беседа 0.3 — jsonb не хранит порядок ключей: хэш содержимого — по `canonical()`
- §2, беседа 9.1 — сторож места миграции, а не «последняя миграция — N»
- §3, беседы 7.1 и 8.6 — тег миграции drizzle-kit переименовывать
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`

**Первый запрос:**
```
Фаза 16, беседа 16.1 — сервер основы обсуждения: устойчивые адреса,
участники и права, комментарии, рецензии. Документ не меняется ничем
из этой беседы.

0. ПЕРВЫЙ ХОД — сверка с кодом: все места, где решается «владелец ли
   это» (сервер — ownerEditGate ×3, ownerGate, проверки ws/handler,
   прочие userId === …; клиент — isOwner), и все места, где категории,
   тезисы, термины пересоздаются с новыми id, — до правок, в «По факту».

1. Миграция: synthesis_members (synthesis_id, user_id, role ∈ reviewer
   | editor, invited_by, status ∈ invited | active, даты;
   UNIQUE(synthesis_id, user_id)); роль editor заводится сразу, права
   её действуют с Фазы 17.

2. Одна проверка прав: модуль capabilities(synthesisId, userId) →
   { read, discuss, edit, manage } по врезке «Фаза 16». loadSynthesisForRead
   пускает участника на любой ступени видимости. Копии ownerEditGate и
   ownerGate сводятся к одной функции поверх capabilities — пока с
   прежним смыслом (edit = владелец); SynthesisFull отдаёт клиенту
   capabilities рядом с isOwner (isOwner остаётся). Поведение для
   владельца и чужих — побайтно прежнее.

3. Реестр адресов (packages/shared): виды synthesis | section |
   subsection | category | edge | thesis | glossary_term; адрес = вид +
   ключ + id + хэш (+ версия элемента); функции: построить адрес по
   объекту, найти объект по адресу заново (id → ключ), состояние адреса
   current | outdated | deleted. Хэш — канонического содержимого;
   выдержка — обычный текст ≤ N символов.

4. Комментарии: таблица (synthesis_id, author_id, адрес, выдержка,
   parent_id, kind ∈ question | objection | source | unclear | null,
   body — обычный текст, status ∈ open | resolved | hidden, даты);
   маршруты /syntheses/:id/comments — список с фильтрами (адрес, статус,
   автор, курсор), создание и ответ (discuss), правка и удаление своего,
   resolve/reopen (автор ветки или владелец), hide/unhide (владелец —
   скрытый виден как «скрыто владельцем»). outdated/deleted — в ответе
   вычисленным состоянием адреса.

5. Рецензии: review (synthesis_id, author_id, версия документа
   version_base…, title, summary, strengths, objections, minor,
   questions, conclusion — обычный текст; status ∈ draft | published |
   withdrawn) и review_revisions (правка опубликованной — новая
   редакция, прежняя сохраняется); findings (review_id, адрес,
   выдержка, body, kind?). Черновик виден только автору. Маршруты по
   образцу комментариев: CRUD черновика, publish, withdraw, редакции.

6. Сводка для документа: GET счётчиков по адресам (открытые
   комментарии, замечания рецензий) одним запросом — для пометок у
   элементов в 16.3.

7. Обезличивание: удаление аккаунта оставляет комментарии и рецензии
   с автором «удалённый пользователь»; участие снимается; удаление
   синтеза — каскад.

8. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   ни одного прямого сравнения с владельцем вне модуля прав (белый
   список — с доводом); каждый маршрут обсуждения проверяет доступ
   через синтез; тексты обсуждения не проходят через HTML (экранирование
   на выдаче); адрес после перегенерации графа (на моке) находит
   категорию по имени.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не давать редактору прав на правку (Фаза 17);
- не делать приглашения, уведомления и интерфейс — 16.2, 16.3;
- не заводить реакций, упоминаний, подписок, жалоб;
- не класть обсуждения в выгрузки и копию синтеза.
```

**Последующие запросы:**
- «Протестируй права живьём: владелец, рецензент, чужой зарегистрированный, гость на private/showcase/full — кто читает концепцию и обсуждение; рецензент приватной читает её и комментирует, чужой — 403/404 и по прямому id комментария; поведение владельца и чужих в прочих маршрутах — как до беседы (прогон харнессов 13.2, 15.x)»
- «Протестируй адреса: комментарий к категории → перегенерация графа на моке (новые id) → комментарий нашёл категорию по имени, состояние outdated при изменившемся описании и current при прежнем; удалённая категория → deleted; комментарий к подразделу после ручной правки подраздела → outdated; выдержка показывает прежний текст»
- «Протестируй комментарии и рецензии: ветка ответов, resolve/reopen, скрытие владельцем, правка своего и запрет чужого; рецензия: черновик не виден другим, публикация, правка опубликованной даёт редакцию с сохранённой прежней, отзыв; находки с адресами; удаление аккаунта автора → «удалённый пользователь»»

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, `audit`»
- «Ревью: перечисли оставшиеся TODO и заглушки»
- Новые таблицы и маршруты — в 02 и 03 этой же беседой; закрытие — 08 Часть II, урок — 09, NEXT-CONTEXT перезаписать (07 §10)

**По факту 16.1 (первый запрос — 2026-11-08).** → `docs/08-history.md`, глава «Беседа 16.1», подраздел «По факту 16.1 (первый запрос — 2026-11-08)».

**По факту 16.1 (тестовые запросы 2–4 — 2026-11-08, одним заходом).** → `docs/08-history.md`, глава «Беседа 16.1», подраздел «По факту 16.1 (тестовые запросы 2–4 — 2026-11-08, одним заходом)».

**По факту 16.1 (завершение — 2026-11-09).** → `docs/08-history.md`, глава «Беседа 16.1», подраздел «По факту 16.1 (завершение — 2026-11-09)».

### Беседа 16.2: Участники, приглашения, уведомления (бэкенд + клиент)

**Контекст для загрузки:**
- `07-conversation-protocol.md` — врезка «Фаза 16»; «По факту» 8.1, 9.1, 15.3, 16.1
- `02-data-model.md` (`synthesis_members` и таблицы 16.1, `auth_tokens`, `mail_outbox`, `users`), `03-specification.md` (маршруты 16.1, `/auth/*`), `04`, `05`; `01` §8 (оформление клиента)
- Из предыдущих бесед:
  - сервер: модуль прав и маршруты 16.1, `server/services/auth-tokens.ts` (`issueToken`, `consumeToken`, назначения доводов), `server/services/mail/{outbox.ts,templates.ts,worker.ts}`, `server/routes/auth.ts` (регистрация, подтверждение адреса), `server/routes/syntheses.ts` (список каталога, фильтры)
  - клиент: `client/src/pages/SynthesisPage.tsx` (шапка, действия владельца), `CatalogPage.tsx` (вкладки «Мои»/витрина), `ProfilePage.tsx`, `VerifyEmailPage.tsx` и `ChangeEmailPage.tsx` (образцы страниц по ссылке из письма), `client/src/components/layout/Header.tsx`, `client/src/hooks/useSecondStep.ts`, `client/src/api/*`
  - `docs/fragments-for-conversations/5-6-ui-kit.*` — панель участников, колокольчик уведомлений
  - `server/integration-check.mts`; харнессы-образцы — `tests/test-153-*` (почта живьём), `tests/test-124-requests2-8.mjs` (Chrome 131 на сборке клиента)
- Исходник: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседы 10.1–11.1 — текст запроса против кода: первый ход — grep
- §2, беседа 9.1 — сторож места миграции; новое назначение довода — CHECK миграцией рукой (§3, 7.1/8.6)
- §4, беседа 11.3 — браузер на СБОРКЕ клиента (vite build + preview)
- §2, беседы 8.4–8.6 и 9.1 — dotfile-грабля: новые переменные `.env.example` сверять после выкладки
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`

**Первый запрос:**
```
Фаза 16, беседа 16.2 — участники и уведомления целиком: приглашения,
интерфейс управления правами, «Со мной поделились», уведомления в
приложении и сводка по почте.

0. ПЕРВЫЙ ХОД — сверка с кодом и с «По факту 16.1»; расхождения — до
   правок.

1. Приглашение (владелец): по адресу почты и роли (reviewer | editor).
   Есть аккаунт — строка участника invited и письмо со ссылкой
   «принять»; нет аккаунта — довод приглашения (новое назначение
   auth_tokens), письмо со ссылкой на регистрацию, после регистрации по
   ней — участник invited того же синтеза. Принять / отклонить —
   приглашённый; отозвать, сменить роль, исключить — владелец (второй
   шаг). Ответ на приглашение уже участника или самого владельца — 409.
   Письма — шаблонами 14.1 под языком получателя; лимитер — mailLimiter.

2. Исключение участника: его комментарии и рецензии остаются с
   пометкой «бывший участник»; его открытые предложения (Фаза 17)
   закрываются с причиной, не «отклонены» — правило для 17.1 записать
   в 03.

3. Интерфейс прав (клиент): вкладка «Участники» у концепции (только
   владельцу) — список с ролью и статусом, приглашение (адрес + роль),
   смена роли, отзыв приглашения, исключение, повтор письма; страница
   принятия по ссылке; в каталоге — вкладка «Со мной поделились»
   (концепции, где я участник, с ролью); в шапке концепции — моя роль.

4. Уведомления: таблица (user_id, тип, synthesis_id, адрес?, ссылка на
   объект, прочитано, дата); события — приглашение, принятие, смена роли
   и исключение; новый комментарий и ответ в моей ветке; новая
   опубликованная рецензия; изменился объект моего открытого замечания
   (outdated); с Фазы 17 — предложение и решение по нему (типы
   заводятся сейчас). Колокольчик в шапке со счётчиком непрочитанного
   (опрос, без WS), список, «прочитать всё». Сводка по почте —
   проходом работника почты не чаще раза в N часов (env) по
   непрочитанному; категории отключаются в профиле.

5. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   маршруты участников — только владельцу; довод приглашения в схеме,
   CHECK и миграции; уведомление пишется для каждого типа события;
   сводка уважает отключённые категории.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не рисовать обсуждение и рецензии — 16.3;
- не давать редактору прав на правку — Фаза 17;
- не делать WS-уведомлений и упоминаний.
```

**По факту 16.2 (первый запрос — 2026-11-09).** → `docs/08-history.md`, глава «Беседа 16.2», подраздел «По факту 16.2 (первый запрос — 2026-11-09)».

**Последующие запросы:**
- «Протестируй приглашения живьём: существующий пользователь — письмо, принятие, доступ к приватной концепции; новый адрес — регистрация по ссылке и участие; отзыв, смена роли, исключение (его комментарии остаются «бывшим участником»); повторное приглашение участника — 409; письма приглашённому с ui_locale=de — по-немецки»
- «Протестируй уведомления: каждое событие из п.4 даёт строку получателю и не даёт автору события; счётчик, «прочитать всё»; сводка по почте за период, отключённая категория в сводку не входит»
- «Протестируй в браузере (Chrome 131, сборка клиента): вкладка «Участники» с приглашением и вторым шагом исключения, страница принятия, «Со мной поделились», колокольчик»

**По факту 16.2 (тестовые запросы 2–4 — 2026-11-09).** → `docs/08-history.md`, глава «Беседа 16.2», подраздел «По факту 16.2 (тестовые запросы 2–4 — 2026-11-09)».

**По факту 16.2 (завершение — 2026-11-09).** → `docs/08-history.md`, глава «Беседа 16.2», подраздел «По факту 16.2 (завершение — 2026-11-09)».

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`, `vite build`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, css-parity»
- «Ревью: перечисли оставшиеся TODO и заглушки»
- 02/03 — таблицы и маршруты этой беседы; 08 Часть II, 09, NEXT-CONTEXT (07 §10)

---

### Беседа 16.3: Обсуждение и рецензии в документе (клиент)

**Контекст для загрузки:**
- `07-conversation-protocol.md` — врезка «Фаза 16»; «По факту» 1.6b, 5.2, 9.2, 10.3, 12.4, 13.1, 16.1, 16.2
- `03-specification.md` (маршруты 16.1–16.2), `01` §8 (оформление клиента), `05`
- Из предыдущих бесед:
  - клиент: `client/src/pages/SynthesisPage.tsx`, `client/src/components/document/{DocumentView,SectionView,TableOfContents}.tsx` (`dangerouslySetInnerHTML`, карандаши подразделов — образец пометок у места), `client/src/components/edit/{ElementEditor,CategoryEditor,ThesisEditor,GlossaryTermEditor,RecommendationsPanel}.tsx`, `client/src/components/graph/*` (выбор узла и связи), `client/src/stores/synthesis-store.ts`, `client/src/hooks/useSecondStep.ts`, `client/src/i18n/*`
  - `docs/fragments-for-conversations/5-6-ui-kit.*` — вкладки, панель обсуждения, страница рецензии; палитра закрытая, новые классы отдельным блоком, после правки css-parity
  - харнесс-образец — `tests/test-124-requests2-8.mjs` (Chrome 131 на сборке клиента)
- Исходник: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседа 9.2 — React 19 переписывает `innerHTML` при смене ССЫЛКИ `{__html}`: пометки у места не должны пересоздавать тело раздела
- §4, беседа 11.3 — браузер на СБОРКЕ клиента: StrictMode двоит эффекты
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`

**Первый запрос:**
```
Фаза 16, беседа 16.3 — обсуждение и рецензии в интерфейсе концепции.
Сервер не меняется, кроме мелочей по «По факту» с доводом.

0. ПЕРВЫЙ ХОД — сверка с кодом и с «По факту 16.1–16.2».

1. Вкладки концепции: «Документ | Обсуждение | Рецензии» (последние две
   — участникам); прочее устройство страницы не трогать.

2. Пометки у места: у разделов, подразделов, категорий, связей,
   тезисов и терминов — счётчик открытых комментариев и замечаний
   рецензий по сводке 16.1; не доминирует над текстом; клик открывает
   панель обсуждения адреса.

3. Панель обсуждения адреса: название объекта, состояние адреса
   (текущая версия / «относится к прежней версии» с выдержкой «как
   было» / «объект удалён»), ветки (открытые, решённые свёрнуты),
   форма с необязательным видом (вопрос, возражение, источник,
   неясность), ответ, решить/переоткрыть, скрыть (владелец). Рядом —
   то, что о том же адресе сказали критика (рекомендации 10.x) и
   замечания рецензий: группировка ТОЛЬКО по адресу, без машинной.

4. Вкладка «Обсуждение» — все ветки концепции с фильтрами (адрес,
   вид, статус, автор). Вкладка «Рецензии» — список; рецензия — отдельная
   страница-документ (версия концепции, автор, дата, поля, замечания с
   переходом к адресу и их состоянием, редакции); редактор черновика
   рецензии с добавлением замечаний из панели обсуждения («добавить в
   мою рецензию»). Встроенная критика и рецензии людей — рядом, не
   слитно.

5. Тексты пользователей — только экранированным текстом (абзацы по
   пустой строке), никакого dangerouslySetInnerHTML.

6. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   компоненты обсуждения и рецензий не используют dangerouslySetInnerHTML;
   вкладки и панель скрыты от не-участников; пометки не меняют ссылку
   {__html} раздела.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не давать кнопок изменения документа из обсуждения — Фаза 17;
- не делать реакций и машинной группировки замечаний;
- не менять выгрузки.
```

**По факту 16.3 (первый запрос — 2026-11-09).** → `docs/08-history.md`, глава «Беседа 16.3», подраздел «По факту 16.3 (первый запрос — 2026-11-09)».

**Последующие запросы:**
- «Протестируй в браузере (Chrome 131, сборка клиента) двумя пользователями: рецензент комментирует категорию, тезис, подраздел; владелец отвечает и решает ветку; перегенерация графа на моке → пометка «к прежней версии» с выдержкой; скрытый владельцем комментарий виден как скрытый; гость и чужой не видят вкладок»
- «Протестируй рецензию: черновик с тремя замечаниями из разных панелей, публикация, правка — новая редакция, переход от замечания к месту в документе, отзыв»

**По факту 16.3 (тестовые запросы 2–3 — 2026-11-09).** → `docs/08-history.md`, глава «Беседа 16.3», подраздел «По факту 16.3 (тестовые запросы 2–3 — 2026-11-09)».

**По факту 16.3 (завершение — 2026-11-09).** → `docs/08-history.md`, глава «Беседа 16.3», подраздел «По факту 16.3 (завершение — 2026-11-09)».

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`, `vite build`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, css-parity»
- «Ревью: перечисли оставшиеся TODO и заглушки»
- Фаза 16 закрыта, строка в README; 08 Часть II, 09, NEXT-CONTEXT (07 §10)

---

### Фаза 17 (добавлена 2026-11-05): предложения и соавторство

> Вторая половина замысла 2026-11-05 (врезка «Фаза 16» — решения
> пользователя, роли, адреса, чего не делается). Здесь обсуждение
> впервые ведёт к изменению — но только действием человека с правом
> на него и только существующим путём: черновик плана правок →
> предпросмотр с каскадом → подтверждение → исполнение. Второго
> механизма исполнения нет; LLM не толкует замечание как разрешение
> переписать документ. Снимает Огр-5 («правки чужой концепции и ролей
> редакторов нет»).
>
> **Происхождение и номер версии** (решение 2026-11-05 по вопросу
> пользователя). Схема номера документа (`version_base.sub` `m`
> `modes.modeRegen`, `formatVersion`) НЕ меняется: она считает, что
> произошло с документом, а не кто это сделал. Номер версии элемента
> (`element_versions.version`) растёт как прежде, кто бы ни правил.
> Кто и почему — признаки версии: `actor_user_id` у `element_versions`
> и у `generation_log` (старые строки — NULL, читаются как владелец),
> `change_source` += `proposal`, ссылки — в `origin` (предложение,
> комментарий, рецензия и её замечание). Метка версии в журнале
> (`version_marker`) перечисляет действия вместе с исполнителем. Журнал
> показывает «запустил X», когда исполнитель — не владелец; имена
> исполнителей видят участники, читатель по `showLogs` — нет; стоимость
> строки — владелец и сам исполнитель. Основа предложения и ожидаемая
> версия правки — номер версии элемента, у раздела, подраздела и
> капсулы — хэш содержимого (как адрес Фазы 16).
>
> **Две беседы, порядок ЖЁСТКИЙ: 17.1 → 17.2**, после Фазы 16.
> **17.1 закрыта 2026-11-15** (сервер: редактор правит, платит и записан
> исполнителем тот, кто нажал; ожидаемая версия → 409 `VERSION_CONFLICT`;
> предложения исполняет только план правок; миграция 0019
> `proposals_actor`; сторож 2be/4bp/5ay; долги 17.2 — Д-81, Д-82, Д-86).
> **17.2 закрыта 2026-11-15** (клиент: правка по `capabilities.edit`,
> управление по `capabilities.manage`; каждая запись шлёт ожидание, на
> конфликт — «перечитать и повторить», «перезаписать» нет; вкладка
> «Предложения» и панель решения, «Принять» → черновик плана → модалка
> правок; происхождение в истории версий и раздела; номер версии — в DTO
> чтения; сторож 2bf/4bq; Д-81, Д-82, Д-86 закрыты). **Фаза 17 закрыта.**

---

### Беседа 17.1: Предложения, права редактора, происхождение, ожидаемая версия (бэкенд)

**Контекст для загрузки:**
- `07-conversation-protocol.md` — врезки «Фаза 16» и «Фаза 17»; «По факту» 2.1, 2.2, 5.1, 6.1, 9.2, 10.2, 12.3, 13.2, 15.2, 16.1, 16.2
- `02-data-model.md` (`element_versions`, `generation_log`, `edit_plans`, таблицы Фазы 16), `03-specification.md` (§2.4, §2.6, §2.10, §3 WS), `04`, `05`
- Из предыдущих бесед:
  - права: модуль прав 16.1 и все места «владелец ли это» из «По факту 16.1» п.0; `server/ws/handler.ts` (подписка на генерацию и пауза — только владельцу), `server/routes/syntheses.ts` (`projectSynthesis` — пауза только владельцу с 13.2)
  - исполнение: `server/services/edit-planner.ts`, `plan-executor.ts` (`bumpVersionsForPlan`, `version_marker`), `element-step.ts`, `element-editor.ts`, `element-versioning.ts`, `recommendation-planner.ts` (образец «источник → действия плана»), `generation-service.ts` (`withGenerationSlot`, запись `generation_log`), `log-formatter.ts`
  - биллинг: `server/services/billing-service.ts` (`resolveBilling`), `server/middleware/billing-check.ts`
  - `server/integration-check.mts`; харнессы-образцы — `tests/test-102-*`, `tests/test-152-*`
- Исходник: НЕ НУЖЕН. Дизайн-набор: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседы 10.1–11.1 — текст запроса против кода: первый ход — grep
- §3, беседа 10.2 — ссылки, снимки, статусы
- §1, беседа 0.3 — jsonb и `canonical()` для хэшей
- §2, беседа 9.1 — сторож места миграции
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`

**Первый запрос:**
```
Фаза 17, беседа 17.1 — сервер: права редактора, предложения изменений,
происхождение, ожидаемая версия, плательщик.

0. ПЕРВЫЙ ХОД — сверка: чей userId сегодня приходит в resolveBilling
   на каждом пути генерации и правки; все места «владелец ли это» по
   «По факту 16.1» п.0 и что из них откроется редактору; расхождения —
   до правок.

1. Права редактора: capabilities.edit = владелец | редактор на всех
   путях правки (элементы, подразделы, капсула, планы, режимы,
   обогащение, трансформация, перегенерация, рекомендации, удаление
   элементов 15.2, WS-подписка на свою генерацию, пауза и её
   возобновление). manage (участники, видимость, удаление синтеза,
   копия, привязка/отвязка родословной) — только владелец.

2. Плательщик — тот, кто нажал (решение пользователя): resolveBilling
   получает исполнителя; нет квоты/ключа — 402 исполнителю; владелец
   за редактора не платит.

3. Миграция: element_versions.actor_user_id, generation_log.actor_user_id
   (NULL — владелец), change_source += proposal; писатели версий и
   журнала кладут исполнителя; version_marker — с исполнителем;
   log-formatter: «запустил X» для не-владельца; имена — участникам,
   стоимость строки — владельцу и исполнителю.

4. Ожидаемая версия: PATCH элемента, правка подраздела, капсула,
   создание плана принимают expected (номер версии элемента либо хэш
   содержимого); не совпало — 409 VERSION_CONFLICT с текущим значением.
   Без expected — как прежде (старые клиенты), но клиент 17.2 шлёт
   всегда.

5. Предложения: таблица (synthesis_id, author_id, адрес, основа —
   версия/хэш, source ∈ direct | comment | review_finding |
   recommendation, source_id, rationale, вид ∈ replace (готовое
   значение элемента или текст подраздела) | note (только
   замечание), status ∈ open | accepted | rejected | withdrawn |
   closed, decided_by/at, note); события — журналом. Создать — discuss
   (из комментария и замечания рецензии — с ссылкой, исходник не
   меняется). stale вычисляется: основа ≠ текущему — принять нельзя
   (409), доступно «новое поверх текущего» и закрыть. Принять
   (edit): replace → черновик плана с шагом edit_element или ручной
   правкой подраздела; note → черновик плана, где способ (ручная
   правка, refine_element, перегенерация подраздела или раздела)
   выбирает принимающий; предложение accepted только после ИСПОЛНЕНИЯ
   плана; версия несёт origin с предложением и источником. Отклонить —
   только действием человека; техническая невозможность — не
   «отклонено». Исключённый участник — его открытые закрываются
   (closed) с причиной. Уведомления — типы 16.2.

6. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   один модуль прав на всех путях правки; resolveBilling получает
   исполнителя; писатели версий и журнала кладут actor; VERSION_CONFLICT
   на четырёх путях; принятие предложения идёт только через план;
   stale нельзя принять.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не менять схему номера документа (formatVersion) и правила его роста;
- не заводить второго исполнителя изменений помимо плана правок;
- не перебазировать предложения автоматически;
- не давать редактору manage.
```

**По факту 17.1 (первый запрос — 2026-11-15).** → `docs/08-history.md`, глава «Беседа 17.1», подраздел «По факту 17.1 (первый запрос — 2026-11-15)».

**Последующие запросы:**
- «Протестируй права и плательщика живьём: редактор правит элемент, перегенерирует раздел на моке, исполняет план — списывается его квота, у владельца счётчики не меняются; редактор без квоты — 402 ему; рецензент — 403 на всех путях правки; редактор — 403 на участниках, видимости, удалении, копии, родословной»
- «Протестируй происхождение: версии и журнал несут actor; «запустил X» в журнале для редактора, у владельца — без; читатель по showLogs имён не видит; номер документа растёт по прежним правилам»
- «Протестируй ожидаемую версию: два PATCH одного элемента с одинаковым expected — второй VERSION_CONFLICT; то же для подраздела и капсулы»
- «Протестируй предложения: replace из комментария → принять → план → исполнение → версия с origin; note → принимающий выбирает refine_element; stale после правки основы — принять 409, «новое поверх текущего» работает; отклонение и закрытие при исключении участника различаются»

**По факту 17.1 (тестовые запросы — 2026-11-15).** → `docs/08-history.md`, глава «Беседа 17.1», подраздел «По факту 17.1 (тестовые запросы — 2026-11-15)».

**По факту 17.1 (завершение — 2026-11-15).** → `docs/08-history.md`, глава «Беседа 17.1», подраздел «По факту 17.1 (завершение — 2026-11-15)».

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, `audit`»
- «Ревью: перечисли оставшиеся TODO и заглушки»
- 02/03 — поля, коды, маршруты; 08 Часть II, 09, NEXT-CONTEXT (07 §10)

---

### Беседа 17.2: Решение по предложению, соавторство в интерфейсе (клиент)

> **Долги 17.1 с адресатом 17.2 (§12):** Д-81 — клиент шлёт ожидаемую
> версию на всех четырёх путях и разбирает 409 `VERSION_CONFLICT`
> (решить, нужен ли номер версии в DTO элемента); Д-82 — правка на клиенте
> переводится с `isOwner` на `capabilities.edit`, интерфейс предложений,
> шаг `edit_subsection` и карточка происхождения `proposal`; Д-86 — где
> показать «почему» у перегенерации по предложению. Сервер 17.1 — «По
> факту 17.1» (три блока) и 03 §2.20.

**Контекст для загрузки:**
- `07-conversation-protocol.md` — врезки «Фаза 16» и «Фаза 17»; «По факту» 2.3, 5.2, 9.2, 10.3, 13.1, 16.3, 17.1
- `03-specification.md` (маршруты и коды 17.1), `01` §8, `05`
- Из предыдущих бесед:
  - клиент: `client/src/pages/SynthesisPage.tsx`, `client/src/components/edit/*` (все редакторы, `EditModal`, `EditPlanPanel`, `CascadePanel`, `VersionHistory`, `SectionHistory`, `RecommendationsPanel`), `client/src/components/document/SectionView.tsx` (правка подраздела 13.1), `client/src/components/logs/*`, `client/src/components/synthesis/PauseModal.tsx`, компоненты обсуждения и рецензий 16.3, `client/src/hooks/useEditPlan.ts`, `useStreamingGeneration.ts`, `client/src/api/*`
  - `docs/fragments-for-conversations/5-6-ui-kit.*` — панель решения, разница версий; новые классы отдельным блоком, css-parity
  - харнесс-образец — `tests/test-124-requests2-8.mjs` (Chrome 131 на сборке клиента)
- Исходник: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §4, беседа 11.3 — браузер на СБОРКЕ клиента: StrictMode двоит эффекты
- §2, беседа 9.2 — React 19 и ссылка `{__html}`
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`

**Первый запрос:**
```
Фаза 17, беседа 17.2 — интерфейс соавторства: редактор видит и
делает то же, что владелец (кроме управления), решение по
предложению, конфликт версий, происхождение в истории.

0. ПЕРВЫЙ ХОД — все места клиента, где правка открывается по isOwner, —
   перевести на capabilities (edit / manage) по «По факту 17.1».

1. Редактор: все средства правки, генерации, планов, режимов, паузы —
   по capabilities.edit; управление (участники, видимость, удаление,
   копия, родословная) — по manage. Каждая запись шлёт expected;
   VERSION_CONFLICT — понятное сообщение с текущим значением и выбором
   «перечитать и повторить» (не «перезаписать»).

2. Предложение: из панели обсуждения и из замечания рецензии —
   «предложить изменение» (готовое значение / текст подраздела либо
   только замечание); вкладка «Предложения» (открытые, решённые,
   устаревшие).

3. Панель решения: кто предложил, основание, источник со ссылкой,
   основа и текущая версия; разница — пополевая для элемента, текстовая
   для подраздела; влияние и каскад — существующим предпросмотром
   плана; кнопки «Принять» (→ черновик плана, подтверждение, исполнение;
   для замечания — выбор способа), «Обсудить», «Отклонить» (второй
   шаг), для устаревшего — «Новое поверх текущего» и «Закрыть».

4. Происхождение: в истории версий элемента и раздела — исполнитель и
   источник («принято предложение N пользователя X», «по рецензии Y»);
   в журнале генерации — «запустил X» по правилам 17.1.

5. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   правка в клиенте не открывается по isOwner (белый список с
   доводом); запись шлёт expected на четырёх путях; «Принять» идёт
   через план, а не прямым PATCH.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не давать «перезаписать» при конфликте;
- не делать слияния и ветвления (копия синтеза — как есть, владельцу);
- не менять выгрузки.
```

**По факту 17.2 (первый запрос — 2026-11-15).** → `docs/08-history.md`, глава «Беседа 17.2», подраздел «По факту 17.2 (первый запрос — 2026-11-15)».

**По факту 17.2 (тестовые запросы 2–3 и сплошная сверка доков — 2026-11-15).** → `docs/08-history.md`, глава «Беседа 17.2», подраздел «По факту 17.2 (тестовые запросы 2–3 и сплошная сверка доков — 2026-11-15)».

**Последующие запросы:**
- «Протестируй в браузере (Chrome 131, сборка клиента) двумя пользователями: редактор правит тезис и перегенерирует подраздел; владелец одновременно правит тот же тезис → конфликт с понятным выбором; история показывает исполнителей»
- «Протестируй предложения: рецензент предлагает замену термина из комментария; владелец видит разницу и каскад, принимает — план исполняется, версия «принято предложение»; второе предложение по тому же термину стало устаревшим — «Новое поверх текущего»; отклонение со вторым шагом»

**По факту 17.2 (завершение — 2026-11-15).** → `docs/08-history.md`, глава «Беседа 17.2», подраздел «По факту 17.2 (завершение — 2026-11-15)».

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`, `vite build`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, css-parity»
- «Ревью: перечисли оставшиеся TODO и заглушки»
- Фаза 17 закрыта, строка в README; 08 Часть II, 09, NEXT-CONTEXT (07 §10)

---

### Фаза 18 (добавлена 2026-11-16): поиск и похожие концепции

> Заведена 2026-11-16 (вне бесед) по вопросу пользователя «уместен ли
> поиск концепций и по каким параметрам». Поиск сегодня есть, но
> разрознен: свой каталог (`GET /syntheses`) — название (ILIKE с
> `gin_trgm_ops`), метод, статус; публичный (`/syntheses/public`) —
> название и ОДИН философ родословной, без метода; `/lineage/search` —
> отдельно, «все указанные философы среди предков»; «Со мной поделились»
> (`/syntheses/shared`, 16.2) — без поиска; клиент показывает только
> «Поиск по названию…» и поиск по генеалогии.
>
> **Решения пользователя 2026-11-16.**
> - Фаза нужна: структурные фильтры + текст названия и зерна +
>   полнотекстовый поиск по содержанию + точный поиск термина.
> - **Тезисы в индекс содержимого НЕ входят** — индекс: капсула, имена
>   категорий, термины глоссария (термин и определение).
> - **Похожие концепции — да**, отдельной беседой.
>
> **Устройство (принято).**
> - **Один маршрут поиска** для трёх списков (своё / со мной поделились /
>   публичное); прежние параметры `GET /syntheses` и `/syntheses/public`
>   сохраняют смысл (обратная совместимость), `/lineage/search` остаётся
>   и становится одним из фильтров поиска.
> - **Фильтры:** философы (режим «все» / «любой»; область «прямые
>   участники» / «вся родословная»; подсказки из `PHILOSOPHERS`), эпоха
>   философов (`PHILOSOPHER_EPOCHS`), метод, уровень синтеза, язык
>   генерации, мета-синтез да/нет, потомки концепции X, статус, дата.
> - **Текст** — область: название / зерно / содержание / термин.
>   Содержание — `tsvector` со словарём по `syntheses.lang` (русский,
>   английский, немецкий) плюс `simple`, GIN; запрос неизвестного языка
>   ищется обоими словарями, опечатки — подстраховка триграммами. Термин
>   — точное (без регистра) совпадение `glossary_terms.term` с переходом
>   прямо к термину. В выдаче — фрагмент с подсветкой (`ts_headline`).
> - **Свежесть индекса** — пересчёт в тех же сервисах, что пишут капсулу,
>   категории и термины (генерация, разбор, правка элемента, удаление
>   15.2, трансформация, импорт, копия), а не триггерами по документу.
> - **Видимость.** Приватное ищут только владелец и участники. У витрины
>   содержание закрыто — по ней поиск только по названию, капсуле и
>   метаданным (не по категориям и терминам), иначе поиск — обход
>   закрытого. Гость — только публичное, как сейчас.
> - **Похожие концепции.** Признаки без языка — философы (прямые и по
>   родословной), общие предки, метод, уровень, эпохи — работают через
>   границу языков; признаки текста — общие термины и имена категорий
>   (по лексемам) — только внутри одного языка. Мера — взвешенная
>   сумма пересечений (Жаккар), считается на запрос; в выдаче — «почему
>   похожи» (общие философы, термины, предки). Видимость — как у поиска.
> - **Не делается:** смысловой поиск по эмбеддингам (у Anthropic нет API
>   эмбеддингов: сторонний поставщик, расходы, хранение векторов — не
>   окупится на каталоге в сотни концепций); полнотекстовый поиск по
>   всем разделам (дорого держать свежим при каждой перегенерации);
>   тезисы в индексе. Межъязыковой поиск терминов (перевод термина на
>   языки генерации) — НЕ входит: вопрос открыт за пользователем.
>
> **Три беседы, порядок ЖЁСТКИЙ: 18.1 → 18.2 → 18.3**, после Фазы 17.
> Миграция — номер следующий свободный на момент беседы.
> **18.1 закрыта 2026-11-16** (сервер: миграция 0020 `search_index` —
> таблица `synthesis_search`, наполнение `npm run search:reindex`; одна
> функция пересчёта `reindexSynthesis` у всех писателей; маршрут
> `GET /syntheses/search` — четвёртый гостевой путь; точный термин ищется
> и по имени без скобки-пояснения; запасной ход по триграммам помечает
> ответ `match: 'fuzzy'`; сторож 2bg/4br/5az; Д-87 сделан в ней же, Д-88
> — адресат 18.3). Ближайшая — 18.2.
> **18.2 закрыта 2026-11-16** (клиент: каталог и `/explore` ходят в один
> маршрут поиска; состояние — в адресной строке, имена параметров —
> маршрута; строка поиска с выбором поля, панель фильтров, фрагмент с
> подсветкой текстом, «похожие», переход к термину
> `?term=&termKey=`; LineageSearch снят — генеалогия стала фильтром;
> маршрут получил `depth` — Д-89, единственная правка сервера; сторож
> 2bh/4bs; Д-90 — ключ пометок у рёбер-дубликатов — найден и закрыт в
> ней же). Ближайшая — 18.3.
> **18.3 закрыта 2026-11-16 — ФАЗА 18 ЗАКРЫТА** (похожие концепции:
> `GET /syntheses/:id/similar` — пятый гостевой путь; мера считается на
> запрос и не хранится, клиенту — ступень словами и причины, числа нет;
> веса признаков и пороги — `shared/constants/similarity.ts`; признаки
> текста всегда в знаменателе; термины и категории — только при уровне
> чтения `full` и одном языке генерации; блок «Похожие концепции» под
> документом; обход родословной сведён в одну функцию `lineageWalkCte`
> на четырёх потребителей — Д-88 и Д-91; сторож 2bi/4bt/5ba). Ближайшая
> беседа не назначена.

---

### Беседа 18.1: Поиск концепций (бэкенд)

**Контекст для загрузки:**
- `07-conversation-protocol.md` — врезка «Фаза 18» целиком; «По факту» 1.6, 3.1, 8.6, 13.2, 15.1, 15.2, 16.1, 16.2
- `01-architecture.md`, `02-data-model.md` (`syntheses` — `title`, `seed`, `capsule_html`, `lang`, `method`, `synth_level`, `visibility`; `synthesis_lineage`; `categories`; `glossary_terms`; `synthesis_members`), `03-specification.md` (§2.2 каталог и доступ, §2.8 `/lineage/search`, §2.18 участники), `04`, `05`
- Из предыдущих бесед:
  - списки: `server/routes/syntheses.ts` (`GET /`, `GET /public`, `parseListQuery`, `SORT_COLUMNS`, `projectPreview`, `loadSynthesisForRead`), `server/routes/members.ts` (`GET /shared`), `server/routes/lineage.ts` и `server/services/lineage-service.ts` (`searchByPhilosophers`, `getDescendants`, `escapeLike`), модуль прав 16.1 (`capabilities`)
  - писатели индексируемого: `server/services/generation-service.ts` (капсула, разделы), `graph-parser.ts`, `element-parser.ts`, `element-editor.ts` (правка, удаление 15.2), `representation-transformer.ts`, `import-service.ts`, копия синтеза в `routes/syntheses.ts`
  - `packages/shared/constants/philosophers.ts` (`PHILOSOPHERS`, `PHILOSOPHER_EPOCHS`), `packages/shared/utils/normalize.ts`
  - `server/integration-check.mts`; харнесс-образец — `tests/test-171-requests2-5.mjs`
- Исходник: НЕ НУЖЕН. Дизайн-набор: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседы 10.1–11.1 — текст запроса против кода: первый ход — grep по каждой названной функции
- §2, беседа 9.1 — сторож места миграции, а не «последняя миграция — N»
- §3, беседы 7.1 и 8.6 — тег миграции drizzle-kit переименовывать; GIN и `tsvector` — SQL миграции рукой (как `gin_trgm_ops` в 0.1)
- §10 — инварианты прав 16.1–17.2: доступ через синтез на каждом запросе

**Первый запрос:**
```
Фаза 18, беседа 18.1 — сервер поиска концепций.

0. ПЕРВЫЙ ХОД — сверка с кодом: все списки синтезов и их параметры
   (GET /syntheses, /syntheses/public, /syntheses/shared,
   /lineage/search); ВСЕ места, где пишутся капсула, категории и
   термины глоссария (генерация, разбор, правка и удаление элементов,
   трансформация, импорт, копия), — до правок, в «По факту».

1. Миграция: индекс содержимого — по синтезу tsvector названия, зерна и
   содержания (капсула без разметки + имена категорий + термины и
   определения глоссария; тезисы НЕ входят) со словарём по
   syntheses.lang и simple; GIN; индекс точного термина (lower(term)).
   Начальное наполнение — в миграции либо одноразовым скриптом (выбор
   с доводом).

2. Пересчёт индекса — одна функция reindexSynthesis(id), зовут её все
   писатели из п.0 после записи (в той же транзакции или сразу после —
   с доводом); сбой пересчёта операцию не роняет (журнал).

3. Маршрут поиска: область (mine | shared | public; гость — только
   public), текст и его поле (title | seed | content | term), фильтры
   врезки «Фаза 18» (философы: all | any, direct | lineage; эпоха;
   метод; уровень; язык; мета; потомки X; статус; дата), сортировка,
   страницы. Выдача — превью (projectPreview) + фрагмент ts_headline +
   для поля term — id термина. Правила видимости: приватное — владелец
   и участники; витрина — по содержанию НЕ ищется (только название,
   капсула, метаданные); проверка через синтез на каждом запросе.
   Прежние параметры GET /syntheses и /syntheses/public сохраняют
   смысл; /lineage/search — как прежде.

4. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   каждый писатель из п.0 зовёт reindexSynthesis; индекс не содержит
   тезисов; витрина не ищется по категориям и терминам; приватное
   чужого не находится ни одним полем.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не индексировать тексты разделов и тезисы;
- не заводить эмбеддингов и переводов терминов;
- не делать похожих концепций — 18.3; клиент — 18.2.
```

**Последующие запросы:**
- «Протестируй живьём: каждое поле текста на трёх языках генерации (русский запрос находит словоформы, немецкий — немецкие), опечатка — по триграммам; точный термин находит концепцию и id термина; фильтры философов all/any и direct/lineage, эпоха, метод, мета, потомки — по одному и вместе»
- «Протестируй видимость: чужое приватное не находится ни одним полем; участник находит приватное, где он участник; витрина находится по названию и капсуле, но не по категории и термину; гость — только публичное»
- «Протестируй свежесть: правка категории, удаление термина (15.2), трансформация, импорт, копия — поиск видит новое сразу; сбой пересчёта (подменённая функция) не роняет правку»

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, `audit`»
- «Ревью: перечисли оставшиеся TODO и заглушки»
- 02/03 — индекс и маршрут этой беседой; 08 Часть II, 09, NEXT-CONTEXT (07 §10)

**По факту 18.1 (первый запрос — 2026-11-16).** → `docs/08-history.md`, глава «Беседа 18.1», подраздел «По факту 18.1 (первый запрос — 2026-11-16)».

**По факту 18.1 (тестовые запросы 2–4 и сверка после сжатия контекста — 2026-11-16).** → `docs/08-history.md`, глава «Беседа 18.1», подраздел «По факту 18.1 (тестовые запросы 2–4 и сверка после сжатия контекста — 2026-11-16)».

**По факту 18.1 (завершение — 2026-11-16).** → `docs/08-history.md`, глава «Беседа 18.1», подраздел «По факту 18.1 (завершение — 2026-11-16)».

---

### Беседа 18.2: Поиск в каталоге (клиент)

> **От 18.1 (сервер готов, 03 §2.21):** маршрут — `GET /syntheses/search`,
> параметры `scope`, `q`, `field`, `philosopher` (повторяемый), `philMode`,
> `philArea`, `epoch` (номер эпохи с нуля, повторяемый), `method`,
> `synthLevel`, `lang`, `status`, `meta`, `descendantsOf`, `dateFrom`,
> `dateTo`, `sort`, `order`, `page`, `limit`; ответ несёт `query` — эхо
> параметров (для адресной строки) и `match`. Фрагмент выдачи — куски
> `{ text, hit? }`, НЕ разметка. `match: 'fuzzy'` — точных совпадений нет,
> найдено похожее (опечатка): показывать как «похожие». У найденного
> термина — `term.id`. Константы и типы — `shared/constants/search.ts`,
> `shared/types/search.ts`. Гость — только `scope=public` (иное → 401).
> Статус и дата сервером принимаются на любом списке; ограничить их
> «моими» — дело интерфейса (п.2 запроса).

**Контекст для загрузки:**
- `07-conversation-protocol.md` — врезка «Фаза 18»; «По факту» 1.6b, 3.2, 8.7, 16.2, 18.1
- `03-specification.md` (маршрут поиска 18.1), `01` §8 (оформление клиента), `05`
- Из предыдущих бесед:
  - клиент: `client/src/pages/CatalogPage.tsx` (вкладки mine/public/shared, дебаунс `?search=`, `descendantsOf`), `client/src/components/catalog/*` (`SynthesisCard`), `client/src/components/lineage/LineageSearch.tsx`, `client/src/components/edit/GlossaryTermEditor.tsx` и документ (переход к термину), `client/src/api/syntheses.ts`, `client/src/i18n/*`
  - `docs/fragments-for-conversations/5-6-ui-kit.*` — строка поиска с выбором поля, панель фильтров, подсветка; палитра закрытая, новые классы отдельным блоком, после правки css-parity
  - харнесс-образец — `tests/test-172-request1-ui.mjs` (Chrome 131 на сборке клиента)
- Исходник: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §4, беседа 11.3 — браузер на СБОРКЕ клиента: StrictMode двоит эффекты
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`
- §2, беседа 9.2 — подсветка фрагмента — только экранированным текстом с разметкой совпадений, не произвольным HTML

**Первый запрос:**
```
Фаза 18, беседа 18.2 — поиск в каталоге.

0. ПЕРВЫЙ ХОД — сверка с кодом и с «По факту 18.1».

1. Строка поиска каталога с выбором поля (название / зерно /
   содержание / термин) на всех трёх вкладках; дебаунс как сейчас;
   состояние поиска — в адресной строке (ссылкой можно поделиться).

2. Панель фильтров: философы с подсказками (режимы all/any,
   direct/lineage), эпоха, метод, уровень, язык, мета, потомки
   концепции (заменяет нынешнюю отдельную плашку descendantsOf), статус
   и дата — на «моих»; сброс фильтров. Поиск по генеалогии
   (LineageSearch) становится этим фильтром — отдельная кнопка уходит.

3. Выдача: карточка + фрагмент с подсветкой совпадения; для термина —
   переход прямо к термину в документе. Пустая выдача — понятное
   сообщение с подсказкой ослабить фильтры.

4. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   подсветка не идёт через dangerouslySetInnerHTML произвольного
   HTML; параметры адресной строки ≡ параметры маршрута 18.1.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не менять сервер, кроме мелочей по «По факту 18.1» с доводом;
- не делать похожих концепций — 18.3.
```

**Последующие запросы:**
- «Протестируй в браузере (Chrome 131, сборка клиента): каждое поле поиска на трёх вкладках, комбинации фильтров, ссылка с параметрами открывает тот же поиск, переход от найденного термина к термину в документе; гость видит только публичное»

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`, `vite build`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, css-parity»
- «Ревью: перечисли оставшиеся TODO и заглушки»
- 08 Часть II, 09, NEXT-CONTEXT (07 §10)

**По факту 18.2 (первый запрос — 2026-11-16).** → `docs/08-history.md`, глава «Беседа 18.2», подраздел «По факту 18.2 (первый запрос — 2026-11-16)».

**По факту 18.2 (тестовый запрос, Д-89, переводы — 2026-11-16).** → `docs/08-history.md`, глава «Беседа 18.2», подраздел «По факту 18.2 (тестовый запрос, Д-89, переводы — 2026-11-16)».

**По факту 18.2 (завершение — 2026-11-16).** → `docs/08-history.md`, глава «Беседа 18.2», подраздел «По факту 18.2 (завершение — 2026-11-16)».

**По факту 18.2 (Д-90 — 2026-11-16).** → `docs/08-history.md`, глава «Беседа 18.2», подраздел «По факту 18.2 (Д-90 — 2026-11-16)».

---

### Беседа 18.3: Похожие концепции (бэкенд + клиент)

> **Долг 18.1 с адресатом 18.3 (§12): Д-88** — обход родословной
> (`searchByPhilosophers`; фильтр поиска `philArea=lineage` и `epoch` в
> этой области — `ANC_CTE` в `services/search.ts`) идёт по строкам
> `synthesis_lineage` и не видит философов ВЛОЖЕННЫХ узлов дерева
> импортированного файла (`syntheses.file_genealogy`). Похожим концепциям
> нужны «философы по родословной» и «общие предки» — сделать ОДНУ функцию
> обхода (строки БД + дерево файла с правилом приоритета 15.1) и перевести
> на неё `/lineage/search`, фильтр поиска и сходство; сторож — три
> потребителя дают один ответ.
>
> **От 18.2 (клиент поиска готов, 03 §2.21 «Клиент»):** карточка каталога
> `SynthesisCard` принимает `fragment`, `term`, `fuzzy` и сама строит
> ссылку (`termLinkOf`); подсветка — `SearchFragmentView` (куски текста,
> `<mark>`; HTML из выдачи не вставлять — сторож 4bs). Блоку «Похожие
> концепции» причины сходства рисовать тем же способом — текстом.
> Ссылка «вся выдача по этому признаку» может вести в каталог адресом с
> параметрами маршрута (`/catalog?philosopher=…&philArea=lineage`,
> `?descendantsOf=…`): состояние каталога — адресная строка,
> `client/src/utils/catalog-search.ts` (`catalogSearchString`). Новый
> параметр маршрута поиска обязан появиться в `CATALOG_URL_PARAMS`.
> Клиентской `searchByPhilosophers` и `LineageSearch.tsx` больше нет
> (серверный `/lineage/search` жив — его и сводит Д-88). Маршрут поиска
> с 18.2 принимает `depth`. Классы — блок «Беседа 18.2» в `globals.css`
> (`.search-fragment`, `.search-hit`, `.catalog-found`, `.catalog-empty`).
> Харнесс-образец браузера — `tests/test-182-request2.mjs` (готовность
> выдачи — `data-query` контейнера, 09 §4).

**Контекст для загрузки:**
- `07-conversation-protocol.md` — врезка «Фаза 18»; «По факту» 3.1, 3.2, 15.1, 18.1, 18.2
- `02-data-model.md` (индекс 18.1, `synthesis_lineage`, `glossary_terms`, `categories`), `03-specification.md` (маршрут поиска 18.1), `01` §8, `04`, `05`
- Из предыдущих бесед:
  - сервер: индекс и маршрут поиска 18.1, `server/services/lineage-service.ts` (`getAncestors`, общие предки), модуль прав 16.1
  - клиент: `client/src/pages/SynthesisPage.tsx` (шапка, древо), `client/src/components/catalog/SynthesisCard.tsx`, компоненты поиска 18.2
  - `docs/fragments-for-conversations/5-6-ui-kit.*` — идиома для блока «Похожие концепции» с причинами сходства (готового блока в ките НЕТ — выяснено в 18.3: собран в идиоме кита, классы `.similar-*`)
  - харнессы-образцы — `tests/test-171-requests2-5.mjs`, `tests/test-172-request1-ui.mjs`, `tests/test-182-request2.mjs`
- Исходник: НЕ НУЖЕН

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседы 10.1–11.1 — текст запроса против кода: первый ход — grep
- §4, беседа 11.3 — браузер на СБОРКЕ клиента
- §4, беседа 18.2 — «адрес сменился» ≠ «выдача сменилась»; слова данных пробы не должны встречаться в образце
- §6, беседа 11.4 — новый ключ без en/de красит `i18n:check --strict`

**Первый запрос:**
```
Фаза 18, беседа 18.3 — похожие концепции.

0. ПЕРВЫЙ ХОД — сверка с кодом и с «По факту 18.1–18.2»; веса
   признаков — предложить с доводом и записать в «По факту».

1. Сервер: GET похожих для синтеза — кандидаты, видимые смотрящему по
   правилам поиска 18.1; мера — взвешенная сумма пересечений (Жаккар):
   философы прямые и по родословной, общие предки, метод, уровень,
   эпохи — для любых языков; общие термины и имена категорий (по
   лексемам индекса 18.1) — только при одном языке генерации; у витрины
   кандидата — только признаки без содержания. Выдача — N лучших с
   причинами (общие философы, термины, предки, совпавшие метод и
   уровень). Считается на запрос; потолок кандидатов — с доводом.

2. Клиент: блок «Похожие концепции» на странице концепции — карточки
   с причинами сходства и мерой словами («сильно / заметно / слабо
   похожа»), а не числом с десятыми; переход к концепции.

3. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   кандидаты проходят правила видимости поиска; признаки текста не
   сравниваются через границу языков; у витрины не читаются категории
   и термины.

ЧЕГО НЕ ДЕЛАТЬ В ЭТОЙ БЕСЕДЕ:
- не заводить эмбеддингов и переводов терминов;
- не хранить попарные меры в БД (считать на запрос).
```

**Последующие запросы:**
- «Протестируй живьём: две концепции с общими философами на разных языках — похожи по философам, термины не сравниваются; две на одном языке с общими терминами — термины в причинах; приватная чужая не появляется; витрина — без терминов в причинах»
- «Протестируй в браузере (Chrome 131, сборка клиента): блок на странице концепции, причины, переход; у концепции без соседей — понятное пустое состояние»

**Завершение беседы:**
- «Скомпилируй проект (`npm run typecheck`, `vite build`) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:check --strict`, css-parity»
- «Ревью: перечисли оставшиеся TODO и заглушки»
- Фаза 18 закрыта, строка в README; 08 Часть II, 09, NEXT-CONTEXT (07 §10)

**По факту 18.3 (первый запрос — 2026-11-16).** → `docs/08-history.md`, глава «Беседа 18.3», подраздел «По факту 18.3 (первый запрос — 2026-11-16)».

**По факту 18.3 (тестовые запросы 2–3, Д-91, переводы — 2026-11-16).** → `docs/08-history.md`, глава «Беседа 18.3», подраздел «По факту 18.3 (тестовые запросы 2–3, Д-91, переводы — 2026-11-16)».

**По факту 18.3 (завершение — 2026-11-16).** → `docs/08-history.md`, глава «Беседа 18.3», подраздел «По факту 18.3 (завершение — 2026-11-16)».

---

### Типовая беседа L: новый язык интерфейса ⟨xx⟩ (шаблон добавлен 2026-09-29)

> Не фаза, а повторяемый шаблон: каждый новый язык — одна беседа с одним и
> тем же списком правок, одинаковыми сторожами и тестами; различается только
> черновик. Нумерация — L.1, L.2, … в порядке заведения языков (L.1 — первый
> язык после de). Идёт в любой момент после Фазы 11; если к моменту беседы
> закрыт Д-33 (12.5, 2026-10-12): пункт 1 первого запроса — одна команда
> `npm run i18n:add-lang -- xx`, пункт 4 — сторожа и тесты языки берут из
> `UI_LOCALES` и не правятся, пункт 5 — только NEXT-CONTEXT; список
> проверок тот же.
> Вычитка и утверждение переводов — НЕ беседа: работа владельца с
> инструментами (`scripts/i18n/README.md`, «Утверждение переводов»).
>
> Обозначения: ⟨xx⟩ — код языка (BCP-47 без региона, как `en`/`de`),
> ⟨Name⟩ — английское имя языка для генерации (`value` строки `GEN_LANGS`
> в `packages/shared/i18n/locales.ts`; из таблицы выводится `LANG_OPTIONS`
> формы; например `French`), ⟨Самоназвание⟩ — как язык зовёт себя
> (`Français`).
>
> С 2026-11-26 языки генерации — одна таблица `GEN_LANGS` (значение,
> самоназвание, BCP 47, направление, словарь поиска, суффикс файла,
> experimental, имя для модели). Если ⟨Name⟩ в ней уже есть — беседа
> правит только интерфейс (пункт 2а пропускается). Тела документа на
> языках с `dir: "rtl"` вёрстаются справа налево по таблице; ИНТЕРФЕЙС —
> всегда слева направо (пункт 2б).

**Контекст для загрузки:**
- `07-conversation-protocol.md` — врезка «Фаза 11», этот шаблон, «По факту» 11.2, 11.3, 11.4; §12 — строки с адресатом L (если есть)
- `03-specification.md` §2.1 (язык ответов сервера, данные по месту показа), `04-code-reuse-map.md` (строки shared/i18n, client/src/i18n), `05-file-structure.md` (packages/shared/i18n, scripts/i18n)
- `scripts/i18n/README.md` целиком
- Из предыдущих бесед:
  - `scripts/i18n/i18n-core.mjs` (`LANGS`, `LANG_LOCALE`, `pluralFormProblems`), `i18n-split.mjs`, `i18n-export.mjs`, `i18n-import.mjs`, `i18n-check.mjs`
  - `packages/shared/i18n/{locales.ts,t.ts,data.ts}`, `strings.json` (только `meta` и 3–5 строк-образцов с плюралами — таблица целиком в контекст не нужна), `generated/en.json` (образец каталога)
  - `client/src/i18n/{i18n-store.ts,useT.ts}`, `client/src/components/layout/LanguageSwitch.tsx` (переключатель; `UI_LOCALE_NAMES` — в `client/src/i18n/i18n-store.ts`, поправлено L.1), `client/src/pages/ProfilePage.tsx` (секция «Язык»)
  - `server/i18n/locale.ts` (Accept-Language → язык запроса), `server/routes/auth.ts` (`PATCH /me`, `isUiLocale`)
  - `server/integration-check.mts` — секции 4aw, 4ax, 4ay (с 12.5 языки берут из `UI_LOCALES`; читать, чтобы знать, что проверяется)
  - `tests/smoke-112-request1.mjs`, `smoke-114-request1.mjs`, `test-113-requests2-8.mjs` (с 12.5 языки из `UI_LOCALES`), `smoke-113-request1.mjs`, `test-114-requests2-5.mjs`
  - `scripts/i18n/i18n-add-lang.mjs`, `i18n-data.mjs` (12.5)
- Языки генерации и письменности (2026-11-26; нужны при пунктах 2а–2в):
  `packages/shared/i18n/locales.ts` (`GEN_LANGS`, `genLangInfo`,
  `genLangContentAttrs`, `genLangPromptName`), `packages/shared/i18n/gen-script-css.ts`
  (`GEN_SCRIPT_CSS`, `GEN_SCRIPT_FONT_FAMILIES`), `packages/shared/constants/search.ts`
  (`SEARCH_TS_CONFIGS`, `searchTsConfigFor`), `server/db/migrations/0025_gen_langs_search.sql`
  (образец миграции словаря), `client/index.html` (шрифты), `client/src/globals.css`
  (блок gen-script-css), `client/src/i18n/i18n-store.ts` (`<html lang>` по языку
  интерфейса), `client/src/components/document/SectionView.tsx` (lang/dir тел,
  форма правки `dir=ltr`); integration-check 2bj/4bu; `tests/test-gen-langs.mjs`,
  `tests/test-gen-langs-ui.mjs`; глава 08 «Правки 2026-11-26 (языки генерации)»
- Исходник: НЕ НУЖЕН. Дизайн-набор: НЕ НУЖЕН (переключатель рисует языки из `UI_LOCALES`)

**Грабли из 09, которые беседа заденет заведомо:**
- §2, беседа 11.4 — карта данных и каталоги — генераты: после правки таблицы `npm run i18n:split`, иначе 4aw/4ay красные; числа — считать по коду
- §4, беседа 11.3 — контексты браузера и `navigator.language` через CDP; headless не читает `--lang`
- §4, беседа 11.4 — предпосылки харнесса одной командой (puppeteer-core вне клона, `tsx`, столбцы схемы); лимит вызова песочницы
- §6, беседа 11.4 — `i18n:check --strict` требует ВСЕ языки у каждого ключа: новая колонка без черновика красит всё, пока черновик не влит `--draft`
- §4 и §10, беседа L.1 — базовую линию тестов снимать на отдельном клоне со СВОИМ `npm install` (рабочие ссылки `@philosynth/*` подмешивают правки); граф гостю не рисуется — панель графа смотрит вошедший читатель; сторож «утверждённых» языков (4bt) язык беседы L по имени не держит — утверждённым считает язык без черновиков вне `catalog.similar.*`, черновик нового языка — не возврат пометки; числа и даты — `uiIntlLocale`, плюралы — только ICU
- §10, правки после L.1 (сторож 4bv) — хвостовые пробелы подписей журнала `server.logFormatter.*` значимы: один сдвиг ширины на язык; «#» плюрала печатается с разделителями языка; у французских «ёлочек» и подобной типографики пробел неразрывный; NEXT-CONTEXT переписывается одним снимком, блоком не дописывается
- §4, беседа L.2 — браузер харнессов: `CHROME_PATH` песочницы ведёт на Chrome 153; все харнессы берут кэш puppeteer 131 первым, `test-L-requests` сверяет версию — читать строку «(браузер: …)»; подписи журнала — короче, а не шире: сдвиг 4bv задаёт самая длинная подпись, длинный перевод сдвигает колонку для всех (L.2 сократила две подписи вместо сдвига +7)
- §4, беседа L.3 — PostgreSQL и Redis песочницы между ходами беседы гаснут: перед харнессом поднять заново (`pg_ctlcluster 16 main start`, `redis-server --daemonize yes --save ''`); сжатие контекста посреди перевода — решения и термины в файле заметок вне контекста, после сжатия — сверка всего столбца языка поиском

**Первый запрос:**
```
Добавляю язык интерфейса ⟨xx⟩ (⟨Самоназвание⟩; язык генерации по
умолчанию — ⟨Name⟩). Порядок — как в беседе 11.4 (данные по месту
показа), конституция Фазы 11 не меняется: значения data-section и
машинные значения через tl()/tData не проходят; константы, сиды, БД и
промпты остаются русскими.

1. Таблица и инструменты: `npm run i18n:add-lang -- ⟨xx⟩` (иной код Intl —
   `--locale`): `LANGS`/`LANG_LOCALE` в scripts/i18n/i18n-core.mjs, `meta.languages`
   и колонка ⟨xx⟩: null у каждой строки strings.json, `i18n:split` →
   generated/⟨xx⟩.json — всё одной командой, рукой ничего. Команда печатает
   формы плюрала ⟨xx⟩ (Intl.PluralRules) и ручной остаток (пункты 2–3).
2. Словари языков: packages/shared/i18n/locales.ts — `UI_LOCALES` += ⟨xx⟩,
   `UI_TO_GEN[⟨xx⟩] = ⟨Name⟩` (значение обязано быть `value` строки
   `GEN_LANGS` — сторож 4aw; ⟨Name⟩ в таблице нет — сначала пункт 2а);
   `UI_LOCALE_NAMES[⟨xx⟩] = ⟨Самоназвание⟩` в
   `client/src/i18n/i18n-store.ts` (не переводится, в каталог не идёт —
   MIRROR_EXCLUSIONS по тексту).
   Переключатель, cookie ui_locale, PATCH /me (`isUiLocale`),
   Accept-Language сервера и import.meta.glob каталогов подхватывают язык
   из этих списков — правок в компонентах быть не должно; если правка
   понадобилась — это дыра, записать в «По факту».
2а. Только если ⟨Name⟩ нет в `GEN_LANGS`. Язык генерации — строка
   таблицы, а не пара в `LANG_OPTIONS` (4bu запрещает второй список):
   value, label (самоназвание), bcp47, dir, search (словарь snowball
   PostgreSQL или null — тогда `simple`), fileSuffix (код BCP 47; правило
   «две буквы» — только у прежних языков), experimental, promptName при
   нужде (письменность, орфография, норма). Состав таблицы — решение
   владельца: строку и флаг experimental ПРЕДЛОЖИТЬ и дождаться
   подтверждения, затем дописать язык в ожидаемый список 4bu (сторож
   закрепляет решение — это не ослабление). Словарь поиска есть —
   `SEARCH_TS_CONFIGS`, CHECK `synthesis_search_config_check` новой
   миграцией по образцу 0025 (со снятием строк, собранных `simple`) и
   шаг `search:reindex -- --missing` в deploy/*. Новая письменность —
   шрифт В ПРОЕКТ: строка `FONT_SET` в `scripts/fonts/vendor-fonts.mjs`
   и её прогон (файлы — `client/public/fonts`, `client/src/fonts.css` —
   генерат), семейство в стеках `GEN_SCRIPT_CSS` (блок globals.css —
   побайтно, 4bu) и в `GEN_SCRIPT_FONT_FAMILIES` (ссылка шрифтов
   экспортированного файла); для PNG — TTF в `server/assets/fonts` и
   строка `png-fonts.ts`. Ссылок на внешние службы шрифтов в клиенте нет.
2б. Язык ИНТЕРФЕЙСА пишется справа налево (ar, fa, he, ur…). С правки
   2026-11-26 основа готова: `uiLocaleDir` (shared/i18n/locales,
   `RTL_UI_LANGS`) → `<html dir>` рядом с `<html lang>` (i18n-store,
   `applyDocumentLocale`); стороны в globals.css — логическими свойствами
   (`scripts/checks/css_logical.py`, сторож 4bu зовёт `--check`); блок
   «ui-dir» части 3 — то, что логическими свойствами не выражается; окно
   графа, исходный код и построчные сравнения — острова слева направо;
   тело документа несёт направление СВОЕГО языка, форма правки подраздела
   — направление интерфейса. Беседе остаётся: (а) язык есть в
   `RTL_UI_LANGS` — иначе дописать; (б) снимки `tests/dir-snapshots.mjs
   --lang ⟨xx⟩` всех страниц глазами — зеркальность, обрезанные подписи,
   стрелки и значки, смотрящие «назад»; находки — правилом в блок ui-dir
   либо строкой `LOGICAL_POSITION` (координата left/right зеркалится только
   у перечисленных там селекторов); (в) кегль 9–10 px моноширинных
   подписей интерфейса для вязи мал — решение о кегле за владельцем
   (разрядка для языков арабского письма уже снята); (г) новые встроенные
   стили — только `marginInlineStart` и т. п. (4bu). Вид слева направо
   при этом меняться не должен: снимки до и после — `png-diff.py`, ноль
   отличий.
2в. Письменность интерфейса — не латиница и не кириллица (CJK, деванагари,
   арабская вязь): правила gen-script-css завязаны на `:lang(ar|fa|sa)`, а
   `<html lang>` ставит язык ИНТЕРФЕЙСА — проверить, что документ на языке,
   введённом руками (`dir=auto` без lang), не получает оформление языка
   интерфейса; на сборке глазами — шапка, кнопки, заголовки не рвутся и не
   падают в квадраты (шрифты CJK — системные).
3. Черновик: `i18n:export --lang ⟨xx⟩ --dry --out i18n-request.⟨xx⟩.json`
   (все строки, ⟨xx⟩ пуст) → машинный перевод ВСЕХ строк с сохранением
   {подстановок} и своих форм плюралов → `i18n:import … --draft` (0
   отклонений) → `i18n:split` → `i18n:check --strict` чист (черновик
   ⟨xx⟩ = числу живых ключей). Утверждает владелец — описать в README
   ничего нового не нужно, порядок общий. Выровненные подписи журнала
   (`server.logFormatter.*` — список в секции 4bv) после перевода добить
   пробелами до одного сдвига ширины относительно русских: 4bv красит
   разнобой, и это правка перевода, а не сторожа. Сдвиг задаёт самая
   длинная подпись — длинные сокращать, а не раздувать остальные (L.2: +7 →
   +4; L.3: 0).
4. Сторожа и тесты: секции 4aw/4ax/4ay integration-check и тесты
   112/113/114 берут языки из `UI_LOCALES` (12.5, Д-33) — после пункта 2
   они проверяют ⟨xx⟩ сами (каталог ⟨xx⟩ ≡ нарезке, каждый живой ключ и
   data-строки в каталоге, колонка у каждой строки, один запрос чанка на
   язык). Прогнать; если какой-то пришлось править руками — дыра, в
   «По факту» и строку §12. Добавить ⟨xx⟩ в проверку tData на
   «Диалектический»/«Онтологическая» (smoke-114 п.3) — единственное
   место с текстами перевода. Не ослаблять. Тестовые запросы ниже — харнесс
   `tests/test-L-requests.mjs --lang ⟨xx⟩` (L.2): ожидания он берёт из
   каталога ⟨xx⟩ и `DATA_KEYS`, плюралы — из ветвей ICU по
   `Intl.PluralRules`; правок под язык не требует. При пункте 2а — ещё 4bu и
   `tests/test-gen-langs.mjs`, `test-gen-langs-ui.mjs` (состав таблицы в
   них — по решению владельца, остальное не править).
5. Доки: NEXT-CONTEXT (состояние языков). 02, 03 §2.1, 04 и 05 языки по
   имени не перечисляют (ссылка на `UI_LOCALES`/`meta.languages`; до L.1
   перечисляли ru/en/de, после L.1 — снова «и fr» в 04 и строка fr.json в
   05; исправлено патчами L.1 и L.2) — язык беседы в них НЕ дописывать;
   строка утверждения в scripts/i18n/README — при утверждении владельцем.

Прикреплены: файлы из списка контекста. Каждый пункт — отдельным
сообщением-отчётом внутри одного запроса не дробить; докладывать по
итогу первого запроса целиком.
```

**Тестовые запросы (по одному; с L.2 все пять — один прогон
`node_modules/.bin/tsx tests/test-L-requests.mjs --lang ⟨xx⟩`):**
- «Гость выбирает ⟨xx⟩ в шапке: язык меняется без перезагрузки, cookie ui_locale=⟨xx⟩, после перезагрузки — ⟨xx⟩; 401 от сервера — на ⟨xx⟩; для перевода данных — метки метода/уровня в шапке документа и типы связей в панели графа на ⟨xx⟩, в БД и промпте — русские. Браузер: Chrome 131 на СБОРКЕ клиента, каждый персонаж в своём browser context»
- «Вошедший переключается на ⟨xx⟩: users.ui_locale=⟨xx⟩, gen_lang=⟨Name⟩, форма создания синтеза предлагает ⟨Name⟩; смена генерации на другой язык интерфейс не трогает; вход с другого браузера — сразу ⟨xx⟩»
- «Плюралы: три строки с {n, plural, …} на ⟨xx⟩ для n = 1, 2, 5, 21 и 10⁶ (форма many у fr/es/it — только на миллионах) дают формы по Intl.PluralRules(⟨xx⟩); import отвергает форму чужого языка»
- «Каталоги по требованию: шесть переключений ru→⟨xx⟩→en→⟨xx⟩→de→⟨xx⟩ — ровно один запрос чанка ⟨xx⟩ (счётчик page.on("request"))»
- «Сторож: удалить перевод одного ключа на ⟨xx⟩ → i18n:check --strict красный с ключом → check:integration красный (4ay), таблица возвращена побайтно»
- (только при пункте 2а) «Язык генерации ⟨Name⟩: форма предлагает его (с пометкой, если experimental), промпт называет его promptName, экспорт — lang/dir и суффикс по таблице, поиск — его словарём (после reindex)»
- (только при пунктах 2б–2в) «Интерфейс на ⟨xx⟩ при документе на русском и на языке, введённом руками: оформление документа — по языку документа, не интерфейса; шапка и кнопки целы (Chrome 131, сборка)»

**Завершение беседы:**
- «Проверь компиляцию: `npm run typecheck`, `vite build` (чанк ⟨xx⟩ отдельный)»
- «Проверь интеграцию: `check:integration` INTEGRATION OK на свежем клоне, `check:dotfiles`, `i18n:split --check`, `i18n:check --strict`»
- «Патч доков `scripts/patches/patch-docs-convL⟨n⟩.py`: 07 — «По факту L.⟨n⟩» (дыры: компоненты, где язык пришлось назвать руками; сторожа, где языки перечислены; число строк); 08 Часть I и Часть II; 09 — новые грабли; README таблица языков; NEXT-CONTEXT — ПЕРЕПИСАТЬ снимок «Состояние» (прежний — в 08 Часть V), блоком «Беседа L.⟨n⟩ … ЗАКРЫТА» не дописывать (07 §10; 4bv). Списком — файлы беседы»
- «Реестр §12: сторожа 4aw/4ax/4ay и тесты 112–114 берут языки из `UI_LOCALES` (12.5, Д-33); если какой-то из них всё же пришлось править руками — строка §12 с адресатом: вывести из `UI_LOCALES`»

**По факту L.1 (язык интерфейса fr — первый запрос, тестовые запросы, завершение — 2026-11-26).** → `docs/08-history.md`, глава «Беседа L.1», подразделы «По факту L.1 (первый запрос)», «По факту L.1 (тестовые запросы)», «По факту L.1 (завершение)».

**По факту L.2 (язык интерфейса es — первый запрос, тестовые запросы, завершение — 2026-11-26…27).** → `docs/08-history.md`, глава «Беседа L.2», подразделы «По факту L.2 (первый запрос)», «По факту L.2 (тестовые запросы)», «По факту L.2 (завершение)».

**По факту L.3 (язык интерфейса it — первый запрос, тестовые запросы, завершение — 2026-11-27).** → `docs/08-history.md`, глава «Беседа L.3», подразделы «По факту L.3 (первый запрос)», «По факту L.3 (тестовые запросы)», «По факту L.3 (завершение)».

#### Кандидаты в языки интерфейса (справка к шаблону L, 2026-11-26)

> Факты — подстановки, выбор абзацев открывающего текста и формы плюрала
> (`Intl.PluralRules`, ICU Node 22 / Chrome 131) — проверяются перед
> беседой заново; столбец «Очерёдность» — ПРЕДЛОЖЕНИЕ, не решение
> владельца. Вариант «ЯЗЫК ГЕНЕРАЦИИ»: А — ⟨Name⟩ уже есть в `GEN_LANGS`,
> Б — строка таблицы предлагается владельцу (пункт 2а). Предел — не код, а
> вычитка: черновик остаётся черновиком, пока его не прочёл человек,
> читающий язык.

| Очерёдность | ⟨xx⟩ | ⟨Самоназвание⟩ | ⟨Name⟩ | Язык генерации | Справа налево | Письменность | Формы плюрала | Замечание |
|---|---|---|---|---|---|---|---|---|
| L.1 — ЗАКРЫТА 2026-11-26 | `fr` | Français | French | А | — | — | one / many / other | сделано: черновик утверждён владельцем в той же беседе; 08 «Беседа L.1» |
| L.2 — ЗАКРЫТА 2026-11-27 | `es` | Español | Spanish | А | — | — | one / many / other | сделано: черновик утверждён владельцем на следующий день; тестовые запросы — общий харнесс `tests/test-L-requests.mjs`; 08 «Беседа L.2» |
| L.3 — ЗАКРЫТА 2026-11-27 | `it` | Italiano | Italian | А | — | — | one / many / other | сделано: черновик утверждён владельцем тем же днём; харнесс `tests/test-L-requests.mjs` — без правок (59 ✓); подписи журнала — сдвиг 0; 08 «Беседа L.3» |
| L.4 | `pt` | Português | Portuguese | А | — | — | one / many / other | норму перевода (бразильская / европейская) решить до беседы; иная — `--locale` |
| L.5 | `zh` | 中文 | Chinese | А | — | да | other | первая проверка 2в: CJK-шрифты системные, длинные подписи без пробелов |
| L.6 | `ja` | 日本語 | Japanese | А | — | да | other | как `zh` |
| позже | `pl` | Polski | Polish | Б | — | — | one / few / many / other | словаря поиска в PostgreSQL нет — `simple` |
| позже | `ko` | 한국어 | Korean | Б | — | да | other | словаря нет — `simple` |
| позже | `tr` | Türkçe | Turkish | Б | — | — | one / other | словарь `turkish` есть — миграция CHECK по образцу 0025 |
| отдельной работой | `ar` | العربية | Arabic | А | да | да | zero / one / two / few / many / other | основа интерфейса справа налево готова (2б) — снимки всех страниц и вычитка; кегль подписей для вязи — решение владельца |
| отдельной работой | `fa` | فارسی | Persian | А | да | да | one / other | как `ar`; после вычитки вёрстки для одного второй почти даром |
| отдельной работой | `he` | עברית | Hebrew | Б | да | да | one / two / other | как `ar`; словаря поиска в PostgreSQL нет — `simple`; шрифт письменности — в проект (пункт 2а) |

- **Формы плюрала — из `Intl.PluralRules(⟨xx⟩)`, не по образцу.** У
  романских языков в нынешнем ICU есть `many` (миллионы: «1 000 000 de …»)
  — черновик без неё `i18n:import` не отвергнет, но формы не будет; у
  польского форм четыре (`other` — дробные, обязательна); у иврита — три
  (`one` / `two` / `other`).
- **Языки учёной традиции** (латынь, древнегреческий, вэньянь, санскрит) —
  языки документа, в кандидаты интерфейса не внесены.

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

> **Добавлено 2026-09-07 (свод истории):** история проекта живёт в ОДНОМ
> месте — `docs/08-history.md`. Ритуал завершения беседы, писавший одно
> и то же в README, в шапку 07 и в `NEXT-CONTEXT.md`, отменён: он и
> породил тройную хронику. Урок, годный вне даты, идёт в
> `docs/09-lessons.md`; блок «По факту N» остаётся здесь, рядом с
> текстом запроса, который он опровергает.
>
> **Добавлено 2026-10-12 (12.5, Д-28):** беседа, закрываясь, пишет блок
> «По факту N» ВСЕГДА — хотя бы строкой «отступлений нет; итоги — глава
> 08». Комплекты и NEXT-CONTEXT ссылаются только на существующие блоки;
> у бесед, закрытых до правила (0.2, 0.3b, 0.6, 2.3, 2.4, 3.1), стоят
> блоки-указатели на главы 08.
>
> **Добавлено 2026-11-15 (слияние «По факту» с главами 08):** одна беседа
> описывалась дважды — подробным отчётом «По факту N» здесь и пересказом
> того же в главе 08. Отчёты 52 бесед слиты с главами: предложения «По
> факту» перенесены дословно, подпись блока стала заголовком
> `#### По факту N (…)` с прежней нумерацией пунктов, из главы влито то,
> чего в отчёте не было, повторы сняты (сборщик
> `scripts/patches/patch-docs-merge-byfact.py`). Здесь на месте каждого
> блока — указатель `**По факту N (…).** → docs/08-history.md, глава
> «Беседа N», подраздел «…»`. С этого дня беседа, закрываясь, пишет отчёт
> по запросам СРАЗУ в свою главу 08 этими подразделами, а сюда ставит
> только указатель с той же подписью (и, если текст запроса опровергнут,
> короткую пометку об этом рядом с ним — как блоки-указатели 12.5).

> **Добавлено 2026-07-31 (ссылки на исходник):** ссылайся на ИМЕНА
> функций, констант и селекторов — так, как они перечислены в
> `04-code-reuse-map.md`. Фиксированный диапазон строк допустим
> только там, где именованного якоря нет (последовательность
> операторов, разметка без id), и должен быть помечен как
> устаревающий. Исходный протокол так и написан: 33 блока
> извлечения по `grep -n` против одного диапазона.
>
> **Добавлено 2026-08-04 (спеки комплектов):** правка `.spec` без
> пересборки фрагмента НЕ считается выполненной. После любой правки
> спецификации запусти `python3 scripts/extract-by-name.py ПУТЬ.spec`
> и проверь код возврата: при ненайденной цели сборщик пишет
> «фрагмент не записан» и ОСТАВЛЯЕТ прежний файл — со стороны это
> неотличимо от успеха. Именно так правка беседы 1.6b (disclosure-CSS)
> простояла в спеке 1.6 недействующей: цель стояла внутри `scope:`,
> не покрывавшего нужные строки.
>
> **Добавлено 2026-07-31:** завершая беседу, внеси каждый оставленный
> долг в §12 «Реестр открытых долгов» с ЯВНЫМ номером беседы-адресата,
> а закрытый — перенеси из §12 в 08 Часть IV с датой и итогом (правка
> 2026-09-23: вычеркнутых строк в §12 не держим). Записи только в главе истории (08 Часть II)
> недостаточно: именно так семь долгов потеряли адресата.

Перед началом:
- [ ] Определил задачи беседы (из текста беседы в 07 §8 — комплект,
      первый запрос, тесты, завершение; 06 в беседу не грузится — 8.1)
- [ ] Определил нужные фрагменты исходника (из 04-code-reuse-map.md)
- [ ] Извлёк фрагменты: при наличии `.spec` —
      `python3 scripts/extract-by-name.py docs/fragments-for-conversations/N.spec`
      (для бесед без спеки — вручную из `source/`)
- [ ] Собрал файлы из предыдущих бесед (только прямые зависимости)
- [ ] Загрузил проектные документы: 01–05 целиком, 07 частями (§1,
      §9–12, текст беседы), 09 целиком; история 08 — только нужные главы
      (в главах опорных бесед — их «По факту»); 06 — не грузится (уточнено 8.1)
- [ ] Прочитал `docs/09-lessons.md` целиком — грабли
      окружения, тестов и оснастки (иначе беседа наступит
      на них заново)

В процессе:
- [ ] Все файлы созданы (из 05-file-structure.md)
- [ ] TypeScript компилируется без ошибок
- [ ] Эндпоинты протестированы (curl / клиент)
- [ ] Данные корректно сохраняются в БД

После:
- [ ] Ревью: все функции из карты портированы
- [ ] Список файлов для следующей беседы зафиксирован
- [ ] TODO задокументированы
- [ ] Хроника беседы дописана в `docs/08-history.md` (Часть I — строка,
      Часть II — глава, отчёт по запросам — её подразделами
      `#### По факту N (…)`); в 07 на месте отчёта — указатель с той же
      подписью; в README правится только таблица фаз
- [ ] Новые грабли внесены в `docs/09-lessons.md` по темам
- [ ] `NEXT-CONTEXT.md` ПЕРЕЗАПИСАН под следующую беседу, а не дописан
- [ ] Факты, ставшие постоянными, внесены в 01–05 патч-скриптом

---

## 11. Граф зависимостей бесед

```
0.1 (скелет, БД, типы, константы)
 ├── 0.2 (auth, Hono, WS, rate-limiter)
 │    └── 0.5 (password-change; A2a reset — сделан 9.1)
 │         └── 0.6 (PATCH /auth/me + ProfilePage — требует также 0.4)
 ├── 0.3 (seed-prompts, seed-configs, prompt-registry)
 │    ├── 0.3b (seed-taxonomy, element-taxonomy)
 │    └── 1.1 (synthesis-engine, topo-sort, compat-advisor, cost-estimator)
 │         ├── 1.2 (prompt-builder, section-defs-builder)
 │         │    └── 1.4 (streaming-manager, generation-service, graph-parser, element-parser)
 │         │         ├── 1.4b (pause-resume-service, PauseModal — v11)
 │         │         ├── 1.5 (SynthesisForm, GenerationProgress, SectionWarnings — клиент)
 │         │         │    └── 1.5b (Unified Concept Pool: pool-store, concept-file — клиент)
 │         │         ├── 2.2 (plan-executor, regenerateSection/Subsection, addSection, deleteSection)
 │         │         │    └── 2.3 (EditModal, CascadePanel, EditPlanPanel — клиент)
 │         │         ├── 3.1 (meta-synthesis-service, lineage-service)
 │         │         │    └── 3.2 (ConceptPool + GenealogyTree — клиент, v10)
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
 └── 0.4 (клиент каркас, роутинг, stores, api/client, useWebSocket)
      ├── 1.5 (форма + прогресс)
      │    └── 1.5b (Unified Concept Pool)
      ├── 1.6b (DocumentView, CatalogPage) ← требует также 1.6 (роуты чтения)
      ├── 1.7 (Graph3D, Graph2D, GraphModal, NodePanel) ← требует также
      │        1.6 (GET /categories) и 1.6b (SynthesisPage — хозяин модалки)
      ├── 2.3 (EditModal, CascadePanel)
      ├── 2.4 (ContextLogViewer, colorize-log)
      ├── 3.2 (ConceptPool + GenealogyTree, v10)
      ├── 5.2 (ElementEditor, CategoryEditor, VersionHistory)
      ├── 6.2 (BillingPage, AdminPromptsPage)
      └── 7.1 (долги §12: схема 0003, /versions с телами, каталоги, POST /edges, авто-импорт, гейт оценки, DELETE /auth/me)

1.6 (роуты чтения: syntheses, sections, categories) ← 1.4 (данные, WS) + 1.4b (pausedState/pauseEstimates)
2.3 (EditModal поверх страницы синтеза) ← 2.1 + 2.2 (планы) + 1.6b (SynthesisPage, SectionView, synthesis-store) + 1.6 (/sections/:key/context)
2.4 (ContextLogViewer, кнопка в футере) ← 1.6b (DocumentFooter); fallback промптов — только после 4.2 (prompt-reconstruction)
4.2 (export) ← 2.4 (log-formatter: снятие TODO(4.2), предвычисленный видимый лог) + 4.1 (MODE_CONFIG для секции режимов и реконструкции) + 1.7 (GraphModal — снятие exportStub) + 1.6b (SynthesisPage — меню «⤓ Экспорт»; DocumentHeader — двойник шапки) + 3.1 (lineage → однослойная genealogy в embedded state)
3.2 (пул + генеалогия) ← 1.5b (пул уже создан) + 3.1 (routes/lineage.ts) + 1.6b (SynthesisPage, CatalogPage, SynthesisCard)
1.6b (просмотр документа и каталог) ← 0.4 + 1.6 (роуты) + 1.5 (useStreamingGeneration, PauseModal)
1.7 (граф) ← 0.4 + 1.6 (GET /categories) + 1.6b (SynthesisPage)
2.3 (бейдж качества контекста на карточке раздела) ← 2.4 (context-quality.ts, getSectionContextQuality)
5.1 (element-editor, element-versioning) ← 0.1 (schema) + 2.1 (cascade-analyzer)
5.3 (element-enrichment) ← 5.1 + 0.3b (taxonomy) + 1.4 (streaming-manager)
5.4 (CharacteristicSlider, EnrichmentPanel, TaxonomySelector) ← 5.3 + 5.2 + 1.7 (NodePanel)
5.5 (representation-transformer, TransformPanel) ← 1.4 (graph-parser, streaming) + 0.3b (taxonomy) + 1.7 (GraphModal) + 1.6b (SectionView)
5.2 (ElementEditor UI) ← 5.1 + 1.7 (NodePanel) + 1.6b (SectionView) + 2.3 (EditModal/useEditPlan — «перегенерировать затронутые» только через планы)
6.1 (billing-service, api-key-service) ← 0.1 (schema) + 0.2 (auth) + 1.4 (streaming-manager)
6.2 (BillingPage, AdminPromptsPage) ← 6.1 + 0.4 (клиент каркас)
7.1 (долги §12) ← 6.2 (AdminPromptsPage, api/prompts) + 6.1 (биллинг, схема) + 5.4 (EdgeEditor, TaxonomySelector) + 4.3 (POST /syntheses/import) + 3.2 (гейт SynthesisForm)
8.1 (bootstrap-admin, POST /auth/users/:id/role, admin_audit, вкладка «Доступ») ← 0.2 (auth, requireAdmin) + 0.5/0.6/7.1 (routes/auth.ts, account-deletion) + 0.3 (prompt-registry — точки записи) + 0.3b/5.3 (element-taxonomy) + 6.2 (AdminPromptsPage — хозяин вкладки)
8.2 (tools/stripe-mock, stripe-emit, стенд) ← 7.1 (харнесс test-71: сервер + моки + браузер) + 6.1 (webhook, constructWebhookEvent, мок внутри test-61) + 6.2 (dev-режим BillingPage без publishable-ключа)
8.3 (config/plans.ts, seed-plans, stripe-create-prices) ← 8.2 (мок Stripe как оснастка проверки) + 6.1 (subscription-service, stripe-client) + 0.3 (образец идемпотентного сида) + 6.2 (BillingPage — потребитель)
8.4 (управление концепцией в каталоге, правка капсулы, удаление связи, уборка api/*) ← 1.6/1.6b (DELETE и duplicate на сервере, CatalogPage, SynthesisCard) + 5.1/5.4 (api/elements: updateCapsule, deleteEdge; EdgePanel) + 5.5 (TransformPanel — образец подтверждения вторым шагом) + 3.2 (GET /lineage/descendants — счёт потомков в подтверждении)
8.5 (сопоставление родителя при импорте, POST /lineage/link) ← 4.3 (import-service, ImportPage) + 3.1 (lineage-service, routes/lineage) + 3.2 (GenealogyTree, isMetaSynthesis, utils/genealogy) + 4.2 (экспорт сервиса — источник файлов с UUID)
8.6 (visibility/show_*/allow_meta, optionalAuth, гостевые пути, гейт логов) ← 1.6 (loadSynthesisForRead — предмет переписывания, и участники мета-синтеза) + 2.4 (routes/logs — четыре пути под гейт) + 4.2 (export) + 6.1 (billing/plans гостю) + 0.2 (auth middleware — рядом с requireAuth) + 3.1 (loadConceptContext — почему мета-синтез гасится на витрине) + 8.1 (миграция 0004 как образец)
8.7 (LandingPage, гостевая шапка и маршруты, режим просмотра, управление публичностью) ← 8.6 (вся модель и гостевые пути) + 1.6b (CatalogPage, SynthesisCard, Header) + 8.4 (строка действий карточки — переключатель встаёт на место «Опубликовать») + 6.2 (раздел тарифов как разметка для страницы цен) + 5.2 (гейты правок по isOwner)
9.1 (почта: transport/templates/outbox/worker, подтверждение адреса, сброс пароля) ← 0.2/0.5/0.6 (auth, сессии, смена пароля с завершением прочих) + 8.1 (admin-audit как образец записи в той же транзакции; bootstrap-admin и reset-password как запасной ход владельца) + 6.1 (env читается один раз; фоновый запуск там РАЗОВЫЙ — `void warmCache()`, интервальный работник с остановкой 9.1 завела первой) + 8.2 (режим 'console' по образцу мока Stripe) — ЗАКРЫТА 2026-09-19
9.2 (ручная правка текста подраздела) ← 5.1 (updateCapsule как образец, element-versioning, тип "section", element-renderer: locatorsFor и RenderableTable) + 2.2 (findSubsection, extractSubsectionContent, spliceSubsectionHtml) + 2.1 (адрес «sectionKey:subsectionName» — почему разметка несущая) + 8.4 (capsule-html: правка текстом, не HTML — для подраздела ОТМЕНЕНО, правится разметка) + 2.3 (пометка ⟳) + 1.6 (routes/sections) [ЗАКРЫТА 2026-09-20]
10.1 (контракт таблицы рекомендаций, разбор, сторож адресов, раунд, ретрофит) ← 0.3/0.3b (шаблоны и конфиги реестра, сиды) + 1.3 (tableToText, чтение table.doc-table) + 9.2 (html-parser: replaceSubsectionContent и санитайзер с белым списком, вычисляемый замок, правка разметкой) + 5.1 (locatorsFor, locateDocTableHost) + 4.3 (импорт живой концепции для проверки ретрофита)
10.2 (edit_element, refine_element, recommendation-planner, раунд, устаревание) ← 10.1 (разобранные строки и хэш источника) + 2.1 (createPlan, analyzeImpact) + 2.2 (plan-executor) + 5.1 (element-editor, версии) + 5.3 (element-enrichment — прецедент точечной генерации в элемент) + 6.1 (квоты и оценка)
10.3 (панель рекомендаций) ← 10.2 (черновик плана, оценка, статусы) + 2.3 (CascadePanel — управление передаётся ей) + 9.2 (правка подраздела для негодных строк) + 1.6b (документ и кнопки раздела) + 5.2 (VersionHistory — «почему изменилось»)
11.1 (защита машинных значений при нерусской генерации, страховка опознания подраздела по позиции) ← 1.2 (prompt-builder, system.lang_instruction) + 1.4 (graph-parser: ROLE_MAP, направление) + 2.2 (findSubsection) + 10.1 (recommendation-templates — образец надстройки поверх генератов) + 0.3/0.3b (сиды, генераты)
11.2 (shared/i18n, плюралы, язык запроса, users.ui_locale/gen_lang, codemod + сторожа) ← патч philosynth-i18n-v2 (вне протокола) + 11.1 (защита генерации до связи языков) + 0.2/0.6/8.6 (auth, PATCH /me, optionalAuth) + 4.1/4.2/10.3 (сторожа 4x/4y/4au — предмет переделки)
11.3 (хранилище языка, переключатель, форма с gen_lang, static) ← 11.2 (каталоги, плюралы, правило связи) + 1.5 (SynthesisForm, LANG_OPTIONS) + 8.7 (гостевая шапка) + 0.6 (профиль)
11.4 (data по месту показа, таксономия в интерфейсе, переводы, i18n:check --strict) ← 11.3 (клиентский рантайм) + 0.3b/5.3 (таксономия) + 4.1/4.2 (зеркала режимов и подзаголовка)
12.1 (правка документа и импорт: метки тезисов, проза тезисов и заголовок из name после ручной правки, sum/context, импорт без ложной критичности, откат капсулы, parseWarnings под флагом логов) ← Фаза 11 целиком (после codemod'а) + 5.1/9.2 (рендерер, правка подраздела) + 10.1 (сторож меток) + 4.3/8.5 (импорт) + 8.6 (флаги видимости)
12.2 (экспорт и граф: оглавление и древо в HTML-экспорте, ноль характеристики при разборе и отрисовке, цвет типа — с экспортными двойниками) ← 12.1 (обе трогают импорт) + 4.2/8.6 (html-exporter, восстановленный футер как образец) + 1.6b/3.2 (TableOfContents, GenealogyTree — образцы разметки) + 1.7 (граф, сторож 4y) + 11.1 (надстройка над генератом)
12.3 (планы, рекомендации, биллинг, реестр: done после слота, оценка плана без pending, ключ раунда, Stripe Customer, межслойная согласованность, сиды сбрасывают кэш, contextBudget в /estimate, оценка ретрофита, «Основание», перевод отказов планировщика) ← 2.1/2.2/10.2 (оценка, исполнитель) + 10.1/10.3 (рекомендации) + 7.1/8.2 (Stripe Customer, стенд) + 0.3 (сиды, кэш реестра) + 11.4 (tl, tData)
12.4 (долги интерфейса: один вопрос при пропуске, второй шаг кнопок на необратимом, история раздела, ⟳ у резюме, бюджет из /estimate, футер плана по серверу, gm-hint) ← 12.1 (признак капсулы) + 12.3 (оценка, бюджет) + 11.3 (tl, useT) + 8.4/5.5/8.5 (образцы второго шага) + 5.2 (VersionHistory) + 2.3/10.3 (EditModal, футер) + 1.5b (FullBudgetPreview)
12.5 (харнессы, инструменты переводов, доки: smoke-55, тесты is_public, моки 15/23/32/41, блоки «По факту»-указатели, значение данных без строки таблицы, i18n:export --data, i18n:add-lang) ← 12.4 (перепрогон после всех правок) + 8.4/8.6/10.1 (что сломало харнессы) + 4.2/4.3 (граблями моков) + 11.2/11.4 (инструменты i18n, карта данных)
13.1 (безопасность входящего HTML и полнотекстовая правка: общий модуль разрешённой разметки по разделу «ФОРМАТИРОВАНИЕ» промпта, суженный санитайзер на всех входах, чистка сохранённого, CSP; правка на месте подраздела с кнопками по тому же списку, вставка, таблицы, плашки вложенных подразделов) ← Фаза 12 целиком + 9.2 (ручная правка, санитайзер) + 4.3/12.2 (импорт, якоря оглавления) + 5.1/12.4 (капсула, версии) + 4.1/5.5 (режимы, трансформация) + 1.4b/2.2 (запись разделов моделью)
14.1 (опись и сообщения ответа: опись i18n видит details, константы, index.ts, переменные, warnings.push; проверка полей, константы и верхний уровень, служебные тексты ручной правки, письма под языком получателя, PNG на языке запроса, описание продукта Stripe) ← 13.1 (редактор и санитайзер — новые строки и тексты правки) + 11.2/11.4/12.5 (опись и инструменты i18n) + 9.1 (почта) + 9.2 (ручная правка) + 4.2 (PNG) + 6.1/7.1/8.2 (Stripe и его мок)
14.2 (хранимые тексты и их показ: причина паузы кодом и PauseModal по коду, parseWarnings кодами, запасные имена родословной, подписи журнала кодами, видимые заголовки подразделов в DTO разделов и их показ вокруг документа) ← 14.1 (исправленная опись) + 12.3 (образец recommendation-issues) + 1.4b/2.2/12.4 (пауза, PauseModal) + 11.1/11.3 (parseWarnings) + 2.4 (log-formatter) + 8.5 (file_genealogy) + 1.6/1.6b/2.3/10.3 (DTO разделов, оглавление, EditModal, панель рекомендаций)
13.2 (утечки и лимитер: пауза генерации не-владельцу и в чужую выгрузку не уходит, ветка UUID импорта по правилу allow_meta и без цикла, отчёт о записанных связях, лимитер по проверенной сессии, x-forwarded-for только под TRUST_PROXY) ← 13.1 (import-service) + 8.6 (видимость, projectSynthesis, allow_meta) + 8.5 (родословная при импорте) + 0.2/9.1 (лимитер, mailLimiter)
15.1 (родословная после импорта: кандидаты и привязка узла файла, отвязка только поверх узла файла, уникальный индекс пары, копия с деревом файла, одно правило «мета») ← Фаза 14 + 13.2 (ветка UUID) + 8.5 (дерево файла, /lineage/link) + 3.1/3.2 (родословная, древо) + 12.2 (древо в выгрузке)
15.2 (удаление элементов и подразделов: сервис со снимком и чисткой висячих ссылок, маршруты и кнопки, шаги плана delete_element/delete_subsection, «удалить» в рекомендациях) ← Фаза 14 + 5.1/5.2 (редактор элементов, версии) + 2.1/2.2 (планы) + 10.2/10.3/12.3 (рекомендации) + 9.2 (запертые подразделы)
15.3 (почта: чистка очереди, токенов и сессий, выравнивание времени ответа, вкладка «Почта», смена адреса) ← Фаза 14 (письма под языком получателя — 14.1) + 13.2 (лимитер) + 9.1 (почта, токены) + 8.1 (админка)
15.4 (тарифы: редакции в БД, сид не переписывает, вкладка «Тарифы», Price через stripe-client, вебхук переносит план) ← Фаза 14 (описание продукта — 14.1) + 15.3 (вкладка админки) + 6.1/6.2/7.1 (биллинг) + 8.2/8.3 (мок Stripe, посев тарифов)
16.1 (сервер основы обсуждения: участники и одна проверка прав, устойчивые адреса с переразрешением после перегенерации, комментарии, рецензии с редакциями и замечаниями, сводка по адресам) ← Фаза 15 + 8.6/13.2 (видимость, projectSynthesis) + 5.1/15.2 (элементы, версии, удаление) + 1.4/5.5 (пересоздание категорий) + 12.1 (метки тезисов)
16.2 (участники и уведомления: приглашения с доводом, интерфейс прав, «Со мной поделились», уведомления и сводка по почте) ← 16.1 + 9.1/15.3 (почта, доводы) + 14.1 (письма под языком получателя)
16.3 (обсуждение и рецензии в документе: вкладки, пометки у места, панель адреса, страница рецензии, критика и рецензии рядом) ← 16.2 + 1.6b/9.2/13.1 (документ, правка подраздела) + 10.3 (рекомендации) + 5.2 (редакторы элементов)
17.1 (права редактора на всех путях правки, плательщик — исполнитель, actor в версиях и журнале, ожидаемая версия, предложения через план правок) ← 16.3 + 2.1/2.2 (планы) + 10.2/12.3 (рекомендации как источник) + 6.1 (биллинг) + 2.4 (журнал)
17.2 (интерфейс соавторства: редактор по capabilities, конфликт версий, предложения и панель решения, происхождение в истории) ← 17.1 + 2.3/5.2/10.3 (EditModal, редакторы, панель рекомендаций) + 16.3 (панель обсуждения)
18.1 (сервер поиска: индекс tsvector названия, зерна и содержания — капсула, категории, термины, без тезисов; один маршрут на три списка; фильтры философов, эпох, метода, уровня, языка, мета, потомков; видимость — витрина без содержания) ← Фаза 17 + 1.6/8.6 (каталог, видимость) + 16.1/16.2 (права, «Со мной поделились») + 3.1 (родословная, /lineage/search) + 15.2 (удаление элементов)
18.2 (поиск в каталоге: строка с выбором поля, панель фильтров, подсветка, переход к термину, генеалогия как фильтр) ← 18.1 + 1.6b/8.7 (каталог) + 3.2 (LineageSearch)
18.3 (похожие концепции: мера пересечений по философам, предкам, методу, уровню, эпохам; термины и категории — внутри одного языка; причины сходства) ← 18.2 + 3.1/3.2 (родословная)
```

**Чтение графа:**
- Вертикальные линии (├──) означают «зависит от родителя И от предыдущих бесед на том же уровне»
- Стрелка `←` означает «зависит от» (для бесед вне основного дерева)
- Беседы на одном уровне можно вести параллельно (если два человека работают)

**Критический путь (самая длинная цепочка):**
0.1 → 0.3 → 1.1 → 1.2 → 1.4 → 2.2 → 2.4 → 2.3
  (2.4 перед 2.3: context-quality.ts нужен бейджу в EditSectionCard —
   иначе 2.3 работает по null; аудит 2026-07-30)

**Параллелизуемые ветки:**
- После 1.4: беседы 1.5, 3.1, 4.1, 4.2, 4.3 можно вести параллельно
- После 0.4: беседы 1.5 и 1.6 можно вести параллельно (1.6 серверная,
  от клиента не зависит). 1.6b и 1.7 — только после 1.6; 1.7 удобнее
  после 1.6b, потому что кнопка графа живёт в actions-bar документа
- Фазы 5 и 6 независимы друг от друга
- 8.3 — только после 8.2: тарифы проверяются на моке Stripe, который
  вынимает из тестов беседа о стенде (иначе шестая копия мока)
- 8.4 и 8.5 независимы друг от друга, от 8.1 и от пары 8.2/8.3 — порядок
  любой, можно вести параллельно: 8.4 сервер не правит вовсе, 8.5 не
  трогает каталог и граф, пересечений по файлам между ними нет
- 8.7 — только после 8.6: клиент витрины опирается на модель видимости,
  гостевые пути и optionalAuth, которых до 8.6 нет
- 9.1 и 9.2 независимы друг от друга и от всего проведённого; порядок
  любой, пересечений по файлам нет: 9.1 — `routes/auth.ts` и новый
  `services/mail/`, 9.2 — `routes/sections.ts` и `element-editor.ts`
- Фаза 10 — единственная с ЖЁСТКИМ порядком внутри: 10.2 только после
  10.1 (нечего исполнять без разобранных рекомендаций), 10.3 только
  после 10.2 (панель собирает черновик плана). От бесед прочих фаз
  независимы
- Фаза 11 — порядок ЖЁСТКИЙ: 11.1 → 11.2 → 11.3 → 11.4. 11.1 от патча i18n
  не зависит, но 11.2 без неё начинать нельзя: правило связи языков делает
  нерусскую генерацию умолчанием, и защита машинных значений должна прийти
  раньше
- Фаза 12 — порядок ЖЁСТКИЙ: 12.1 (ЗАКРЫТА 2026-10-05) → 12.2 (ЗАКРЫТА 2026-10-06) → 12.3 (ЗАКРЫТА 2026-10-06) → 12.4 (ЗАКРЫТА 2026-10-12) → 12.5 (ЗАКРЫТА 2026-10-13; Фаза 12 закрыта; разделена
  2026-09-29 по подсистемам), только после закрытия Фазы 11 (codemod 11.2
  переписал клиент целиком). 12.2 после 12.1 — обе трогают импорт; 12.4
  после 12.1 и 12.3 — ей нужны их поля; 12.5 последней — перепрогон
  харнессов и сторож данных без строки таблицы
- Фаза 13 — 13.1 (ЗАКРЫТА 2026-10-20) → 13.2, после закрытия Фазы 12 и ПЕРЕД Фазой 14:
  безопасность (Д-63, Д-65…Д-67) срочнее локализации; новые строки обеих
  уже идут через tl(). 13.2 после 13.1 — обе правят `import-service.ts`
  (санитайзер и ветка UUID)
- Фаза 14 — порядок ЖЁСТКИЙ: 14.1 → 14.2, после 13.2. 14.1 первой — её
  опись i18n (Д-58) проверяет новые коды и ключи 14.2
- Фаза 15 — после Фазы 14 (новые письма и тексты — под исправленной
  описью). 15.1 и 15.2 независимы друг от друга, пересечений по файлам
  нет; 15.3 → 15.4: обе добавляют вкладку админки (`AdminPromptsPage`)
- Фаза 16 — порядок ЖЁСТКИЙ: 16.1 → 16.2 → 16.3, после Фазы 15. Права и
  адреса 16.1 нужны и приглашениям, и интерфейсу; клиент обсуждения —
  последним, когда есть участники и уведомления
- Фаза 17 — порядок ЖЁСТКИЙ: 17.1 → 17.2, после Фазы 16 (предложения
  рождаются из комментариев и замечаний рецензий)
- Фаза 18 — порядок ЖЁСТКИЙ: 18.1 → 18.2 → 18.3, после Фазы 17. Индекс
  и маршрут 18.1 нужны и каталогу, и похожим концепциям
- 8.6 независима от 8.5, но обе трогают родословную с разных сторон
  (8.5 — сопоставление при импорте, 8.6 — allow_meta): если вести
  параллельно, сверить правки routes/lineage.ts и syntheses.ts

---

## 12. Реестр открытых долгов

Заведён аудитом 2026-07-31. До него адреса долгов жили только в главах
`docs/08-history.md` Часть II, и потерю адресата не ловила ни одна
проверка: долг заводится в одной беседе, адресуется другой, та его не
делает и переадресует дальше — на втором шаге адрес размывается
(«TODO(2.x)») или исчезает.

Перестроен ревизией 2026-09-23 (вне бесед, `scripts/patches/patch-docs-debts-revision.py`):
все блоки «По факту», прежний §12 и NEXT-CONTEXT сверены с кодом, дефекты
и недоделки отделены от отступлений. Закрытые строки прежней таблицы
(42 из 43) и посессионные сводки «беседа N долгов не оставила» перенесены
дословно в **08 Часть IV** — здесь только открытое.

**Правила:**

1. Беседа, оставляющая долг, вносит строку СЮДА (не только в свою главу
   08) — со следующим свободным номером `Д-N`; номера не переиспользуются.
2. Беседа, закрывающая долг, УДАЛЯЕТ строку отсюда и переносит её в 08
   Часть IV с датой и итогом закрытия. Вычеркнутых строк здесь не держим.
3. Адрес без номера беседы («2.x», «позже», «когда появится») не
   допускается. Если беседы-адресата нет (долг оставлен последней беседой
   фазы или найден вне бесед), пишется **«не назначен»** — адресата
   назначает пользователь; беседа, взявшая долг, вписывает свой номер.
   Адресаты Д-1…Д-28 назначены 2026-09-23 при заведении Фазы 12;
   Д-31 заведён беседой 11.3 (2026-09-28) с адресатом 12.1;
   2026-09-29 Фаза 12 разделена на пять бесед — адресаты переназначены
   (12.1 правка документа и импорт, 12.2 экспорт и граф, 12.3 планы,
   рекомендации, биллинг, реестр, 12.4 интерфейс, 12.5 оснастка);
   номер Д-23 выбыл (переведён в Огр-11) и не переиспользуется.
   Д-9/Д-10 (квирки исходника) исправляются решением пользователя
   2026-09-23; тогда же заведены Д-29/Д-30 (утраты HTML-экспорта).
   Д-39…Д-41 заведены первым запросом 12.2 (2026-10-05): Д-39 — адресат
   12.5, Д-40 и Д-41 ждут адресата от пользователя.
   2026-10-06: Д-40 → 12.5 решением пользователя; тестовыми запросами
   12.2 заведены Д-42 (адресат 12.4) и Д-43; адресата ждут Д-41 и Д-43.
   Тем же днём Д-43 → 12.5 решением пользователя; адресата ждёт Д-41.
   При закрытии 12.2 (2026-10-06) Д-41 → 12.4 решением пользователя;
   строк «не назначен» нет. Д-34, Д-35, Д-41, Д-42 вписаны в текст 12.4,
   Д-38, Д-39, Д-40, Д-43 — в текст 12.5.
   Д-44…Д-46 заведены первым запросом 12.3 (2026-10-06): Д-44 — адресат
   12.4, Д-45 — 12.5, Д-46 ждёт адресата от пользователя; Д-11 переведён
   в ограничения (Огр-12), номер не переиспользуется.
   Тестовыми запросами 12.3 (2026-10-06) Д-46 сделан решением
   пользователя (адресат — сама 12.3), заведён Д-47 — ждёт адресата.
   При закрытии 12.3 (2026-10-06) Д-47 сделан в ней же дешёвым путём
   (решение пользователя: пометка в генлоге, без догенерации); заведён
   Д-48 (адресат 12.4). Сняты Д-6, Д-11 (→ Огр-12), Д-12, Д-13, Д-18,
   Д-20, Д-21, Д-32, Д-46, Д-47; у Д-7 и Д-19 сделаны серверные половины —
   строки остаются за 12.4. Д-44 и Д-48 вписаны в текст 12.4, Д-45 — в
   текст 12.5; строк «не назначен» нет.
   Первым запросом 12.4 (2026-10-07) заведён Д-49 (встроенное состояние
   выгрузки пишет константу схемы) — ждёт адресата от пользователя;
   решением пользователя 2026-10-06 в 12.4 разрешено поле `id` в DTO
   разделов (вторая правка сервера сверх зеркала бейджа);
   тестовыми запросами 12.4 (2026-10-12) заведён Д-50 (replay подписки
   без skipDegrades) — ждёт адресата;
   при закрытии 12.4 (2026-10-12) Д-49 и Д-50 → 12.5 (по вопросу
   пользователя «можно назначить на 12.5?» — обе узкие); сняты Д-2, Д-7,
   Д-14, Д-15, Д-17, Д-19, Д-22, Д-34, Д-35, Д-41, Д-42, Д-44, Д-48; Д-45
   пополнен; строк «не назначен» нет.
   Первым запросом 12.5 (2026-10-12) все тринадцать строк с адресатом
   12.5 сделаны (Д-24…Д-28, Д-33, Д-38, Д-39, Д-40, Д-43, Д-45, Д-49,
   Д-50); при закрытии 12.5 (2026-10-13) сняты все тринадцать — реестр
   «Д-N» ПУСТ, Фаза 12 закрыта; новая строка заводится следующей беседой
   по правилам 1–5 с адресатом «не назначен».
   2026-10-13 (вне бесед): ревизия непереведённого — Д-51…Д-62; живая
   проба ручной правки — Д-63 (хранимый XSS) и Д-64 (полнотекстовая
   правка). Тем же днём решениями пользователя заведены Фаза 13
   «Безопасность и правка документа» (13.1 — Д-63, Д-64) и Фаза 14
   «Довершение локализации» (14.1 — Д-51, Д-52, Д-53, Д-56, Д-58, Д-60,
   Д-61; 14.2 — Д-54, Д-55, Д-57, Д-59, Д-62).
   2026-10-14 (вне бесед): ревизия ограничений — по решению пользователя
   снимается всё, что снимается без переделки архитектуры. Огр-4 → Д-65,
   половина Огр-10 → Д-67, Огр-1 → Д-68, Огр-2 → Д-69, Огр-3 → Д-71,
   Огр-6 → Д-72 и Д-73, Огр-7 → Д-74; найденные в коде попутно — Д-66,
   Д-70, Д-75. Адресаты: 13.2 (новая беседа Фазы 13) — Д-65, Д-66, Д-67;
   Фаза 15 «Снятие ограничений»: 15.1 — Д-68, Д-69, Д-70; 15.2 — Д-71;
   15.3 — Д-72, Д-73; 15.4 — Д-74, Д-75. Номера Огр-1…Огр-4, Огр-6,
   Огр-7 выбыли и не переиспользуются; Огр-5, Огр-8, Огр-9, Огр-11,
   Огр-12 и вторая половина Огр-10 остаются ограничениями.
   При закрытии 13.1 (2026-10-20) сняты Д-63 и Д-64 (в 08 Часть IV);
   новых долгов беседа не оставила, строк «не назначен» нет.
   При закрытии 15.2 (2026-11-04) сняты Д-71, Д-78, Д-79 (в 08 Часть IV);
   заведено ограничение Огр-13 (восстановления удалённого элемента из
   снимка нет); новых долгов нет, строк «не назначен» нет; в реестре —
   Д-72, Д-73 (15.3), Д-74, Д-75 (15.4).
   При закрытии 15.3 (2026-11-04) сняты Д-72, Д-73 (в 08 Часть IV); новых
   долгов и ограничений нет, строк «не назначен» нет; в реестре — Д-74,
   Д-75 (15.4).
   При закрытии 15.4 (2026-11-05) сняты Д-74, Д-75 (в 08 Часть IV); новых
   долгов и ограничений нет, строк «не назначен» нет; реестр пуст —
   Фаза 15 закрыта.
   При закрытии 16.1 (2026-11-09) новых долгов и ограничений нет, строк
   «не назначен» нет; реестр пуст.
   При закрытии 16.2 (2026-11-09) новых долгов и ограничений нет, строк
   «не назначен» нет; реестр пуст.
   При закрытии 16.3 (2026-11-09) новых долгов и ограничений нет, строк
   «не назначен» нет; реестр пуст — Фаза 16 закрыта.
   Первым запросом 17.1 (2026-11-15) заведены Д-81, Д-82, Д-86 (адресат
   17.2) и Д-83, Д-84, Д-85 — последние три сделаны тестовыми запросами
   той же беседы по решению пользователя (в 08 Часть IV); строк «не
   назначен» нет.
   При закрытии 17.1 (2026-11-15) в реестре — Д-81, Д-82, Д-86 (все —
   17.2, вписаны в её текст); ограничений не добавлено; строк «не
   назначен» нет.
   При закрытии 17.2 (2026-11-15) Д-81, Д-82, Д-86 закрыты (08 Часть
   IV); новых долгов и ограничений нет — реестр пуст, Фаза 17 закрыта.
   2026-11-16 (вне бесед): по вопросу пользователя о поиске заведена
   Фаза 18 «Поиск и похожие концепции» (18.1–18.3); долгов и ограничений
   не добавлено.
   Первым запросом 18.1 (2026-11-16) заведены Д-87 (удаление раздела
   глоссария либо тезисов не снимает строки элементов) и Д-88 (философы
   дерева импортированного файла глубже верхнего уровня не видны обходу
   родословной) — оба найдены сверкой п.0, оба вне предмета беседы; обе
   строки заведены с адресатом «не назначен».
   При закрытии 18.1 (2026-11-16) адресаты утверждены пользователем:
   Д-87 — сама 18.1 (сделан в ней же отдельным запросом, без снимков
   версий; строка — в 08 Часть IV), Д-88 — 18.3 (вписан в её текст). В
   реестре — Д-88; строк «не назначен» нет; ограничений не добавлено.
   2026-11-05 (вне бесед): по спецификации социального функционала и
   решениям пользователя заведены Фаза 16 «Обсуждение и рецензии»
   (16.1–16.3) и Фаза 17 «Предложения и соавторство» (17.1, 17.2). Огр-5
   (правки чужой концепции и ролей редакторов нет) снят — это содержание
   Фаз 16–17, а не долг; номер не переиспользуется.
   Первым запросом 18.2 (2026-11-16) заведён Д-89 (фильтра по глубине в
   поиске нет — расхождение 03 C5 с маршрутом 18.1), адресат «не
   назначен» — ждёт слова пользователя; ограничений не добавлено.
   2026-11-16, следом: пользователь назначил Д-89 самой 18.2 («глубину
   можно сделать») — сделан и закрыт в ней же (параметр `depth` маршрута
   поиска и орган панели; 08 Часть IV). При актуализации прежних
   харнессов найден Д-90 (одинаковый ключ пометок у рёбер-дубликатов) —
   пользователь назначил его той же 18.2, сделан и закрыт в ней (08
   Часть IV). В реестре — Д-88 (18.3).
   При закрытии 18.2 (2026-11-16): в реестре — Д-88 (адресат 18.3); Д-89 и
   Д-90 заведены и закрыты в 18.2; строк «не назначен» нет; ограничений
   не добавлено.
   Первым запросом 18.3 (2026-11-16) Д-88 закрыт (обход родословной — одна
   функция `lineageWalkCte`, три потребителя; 08 Часть IV). Заведён Д-91
   (четвёртый обход — `collectPhilosopherAncestors` мета-синтеза — идёт
   по одним строкам), адресат «не назначен» — ждал слова пользователя.
   2026-11-16, следом: пользователь назначил Д-91 самой 18.3 («если уместно
   в этой — сделай») — сделан и закрыт в ней же (08 Часть IV). Реестр
   пуст; ограничений не добавлено.
   При закрытии 18.3 и Фазы 18 (2026-11-16): реестр пуст; Д-88 и Д-91 закрыты
   в 18.3; строк «не назначен» нет; ограничений не добавлено.
   Беседа L.1 (2026-11-26): Д-92 (сторож 4bt) и Д-93 (test-112) — руками
   правленные проверки шаблона L, Д-94 (числа и даты по-русски при любом
   языке) и Д-95 (ручные русские плюралы) — по слову пользователя «если
   уместно в этой — сделай»; все четыре заведены и закрыты в L.1, строки
   сразу в 08 Часть IV. Реестр пуст; ограничений не добавлено.
4. Сознательное решение не делать (ограничение) — во второй таблице
   («Огр-N»), не в первой. Ограничение становится долгом, если
   пользователь решит его делать.
5. Вид строки: **дефект** (поведение неверно), **недоделка** (функция
   неполна либо нарушает принятое правило проекта), **оснастка** (тесты,
   моки), **доки**, **проверить** (подозрение без симптома).

### Открытые долги

| № | Вид | Долг | Где найдено | Адресат | Состояние |
|---|---|---|---|---|---|

> До 2026-11-16 реестр был пуст (закрытие 17.2 и Фазы 17): строки Д-1…Д-87
> — в 08 Часть IV. Открыт Д-88 (первый запрос 18.1), адресат — 18.3.
> Д-89 (первый запрос 18.2) закрыт в 18.2 — 08 Часть IV. Д-90 (18.2,
> попутная находка) закрыт в 18.2 же — 08 Часть IV.
> Д-88 закрыт первым запросом 18.3 — 08 Часть IV; им же заведён Д-91,
> закрытый в 18.3 же по слову пользователя — 08 Часть IV. Реестр пуст.
> Д-92…Д-95 (беседа L.1) заведены и закрыты в ней же — 08 Часть IV.
> Реестр пуст.

### Ограничения (сознательно не делается)

| № | Ограничение | Где решено |
|---|---|---|
| Огр-8 | `LAST_ADMIN` в `POST /auth/users/:id/role` недостижим при `requireAdmin` (ветка защитная); третья роль (платная поддержка) заводится, когда у неё появится обязанность | 8.1 п.2, врезка Фазы 8 |
| Огр-9 | В вырожденном документе без «Топологической таблицы» запасной локатор запирает «Топологию графа» даже без таблицы в ней — согласовано с рендером по построению | 9.2 п.5 |
| Огр-10 | Активный BYO-ключ — один: новый снимает прежний, удаление активного прежний не возвращает (генерация переходит на ключ службы) | 6.1 п.11; половина о лимитере (сессии одного пользователя считались раздельно) → Д-67 (2026-10-14) |
| Огр-11 | Гейт активной операции (`isGenerationActive`) живёт в памяти процесса: при нескольких инстансах не защищает ни генерацию, ни правки, ни удаление аккаунта. Становится долгом вместе с горизонтальным масштабированием (01 §7, «Фаза 3»: WebSocket через Redis pub/sub) — тогда и гейт в Redis. Был Д-23 | 7.1 п.8, 8.4 п.8; ревизия §12, Фаза 12 (2026-09-23) |
| Огр-13 | Восстановления удалённого элемента (категории, тезиса, термина) из снимка версии нет: `rollbackToVersion` пишет `UPDATE` в живую строку, восстановление потребовало бы пути `INSERT` со старым id на каждый вид, а рёбра, обогащения и обоснования всё равно не вернулись бы (их снимков нет). Снимок удалённого остаётся историей по `elementId` (как у ребра с 5.1); кнопка удаления — со вторым шагом и предупреждением. Удалённый подраздел откатом версии раздела возвращается | «По факту 15.2» п.0 |
| Огр-12 | Ключ раунда рекомендаций — проза ПОСЛЕДНЕГО сохранённого раунда (`roundHashOf`). Если проза критики вернулась дословно к его редакции (промежуточная редакция не была разобрана либо её разбор отклонён 409 `ROUND_IN_PROGRESS`), новый раунд не открывается: строки раунда и относятся к этому тексту. Возврат к редакции БОЛЕЕ раннего раунда (А → Б разобрана → А) раунд открывает, статусы не наследуются — сравнение с историей раундов вернуло бы `done` на новый текст критики и потому не делается. На живой модели дословный возврат недостижим. Поведение закреплено сторожем 5am. Был Д-11 | «По факту 12.3» п.3 |

---

## Единство стилей с исходником (правка 2026-09-02)

Перенесено 2026-09-23 в `01-architecture.md` §8 (правило работы и
отклонения сервиса) и в `09-lessons.md` §4 (следствия для тестов):
постоянное правило проекта живёт в 01, который беседы грузят целиком.
