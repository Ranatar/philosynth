# PhiloSynth Service — Спецификация

## 1. Функциональные требования

### 1.1. Управление аккаунтом

| ID | Требование | Приоритет |
|---|---|---|
| A1 | Регистрация по email + пароль | MVP |
| A2 | Вход / выход / сброс пароля | MVP |
| A3 | Профиль: отображаемое имя, смена пароля | MVP |
| A4 | Привязка Anthropic API-ключа (BYO-Key) | MVP |
| A5 | Баланс сервиса: пополнение через Stripe | Фаза 2 |
| A6 | OAuth (Google, GitHub) | Фаза 3 |

### 1.2. Каталог концепций

| ID | Требование | Приоритет |
|---|---|---|
| C1 | Список своих синтезов (сортировка по дате, методу, статусу) | MVP |
| C2 | Публичный каталог (is_public синтезы всех пользователей) | MVP |
| C3 | Поиск по названию, философам, методу | MVP |
| C4 | Карточка синтеза: метаданные, превью капсулы, граф наследования | MVP |
| C5 | Фильтры: метод, уровень, глубина, философы, наличие мета-синтеза | Фаза 2 |
| C6 | Статистика: количество тезисов, категорий, стоимость | Фаза 2 |

### 1.3. Генерация синтеза

| ID | Требование | Приоритет |
|---|---|---|
| G1 | Форма создания: философы, зерно, метод, уровень, глубина, порядок, контекст, секции | MVP |
| G2 | Выбор секций с проверкой совместимости (матрица COMPAT_MATRIX) | MVP |
| G3 | Оценка стоимости до генерации (estimateCost) | MVP |
| G4 | Потоковая генерация с отображением прогресса в реальном времени | MVP |
| G5 | Прерывание генерации | MVP |
| G6 | Доп. контекст per-section (secCtx) | MVP |
| G7 | Кнопки-подсказки для совместимости (advisors) | Фаза 2 |

### 1.4. Просмотр синтеза

| ID | Требование | Приоритет |
|---|---|---|
| V1 | Полный документ с навигацией (оглавление, якоря) | MVP |
| V2 | Граф категорий 3D (Three.js) с вращением, зумом, drag, выбором узлов | MVP |
| V3 | Граф категорий 2D (D3.js) с силовой симуляцией | MVP |
| V4 | Информационная панель узла (определение, роли, связи, кластеры) | MVP |
| V5 | Легенда графа (типы, роли, кластеры, связи) | MVP |
| V6 | Переключение структурные/процессуальные роли | MVP |
| V7 | Показ/скрытие кластеров | MVP |
| V8 | Генеалогическое дерево (для мета-синтезов) | Фаза 2 |

### 1.5. Редактирование синтеза

| ID | Требование | Приоритет |
|---|---|---|
| E1 | Перегенерация раздела целиком | MVP |
| E2 | Перегенерация подраздела | MVP |
| E3 | Удаление раздела | MVP |
| E4 | Добавление нового раздела | MVP |
| E5 | Каскадный анализ зависимостей (downstream, upstream) | MVP |
| E6 | План редактирования: просмотр, подтверждение, исполнение шагов | MVP |
| E7 | Ручное редактирование элементов (категории, тезисы, глоссарий) | Фаза 2 |
| E8 | Автозамена имён при переименовании категории | Фаза 2 |
| E9 | Версионирование элементов с откатом | Фаза 2 |

### 1.6. Мета-синтез

| ID | Требование | Приоритет |
|---|---|---|
| M1 | Добавление концепций-участников (из каталога или по ID) | MVP |
| M2 | Валидация пригодности (обязательные разделы) | MVP |
| M3 | Проверка генеалогических пересечений | MVP |
| M4 | Генерация мета-синтеза с контекстом из концепций-участников | MVP |
| M5 | Навигация потомок → родитель и наоборот | MVP |

### 1.7. Режимы

| ID | Требование | Приоритет |
|---|---|---|
| R1 | Оппонент (adversarial): ввод имени философа-критика | MVP |
| R2 | Переводчик (translator): ввод целевой традиции | MVP |
| R3 | Временной срез (timeslice): ввод эпохи/места | MVP |
| R4 | Вкладки с результатами (несколько запусков одного режима) | MVP |
| R5 | Удаление отдельного результата режима | MVP |
| R6 | Каскад: перегенерация режимов при изменении разделов | Фаза 2 |

### 1.8. Экспорт

| ID | Требование | Приоритет |
|---|---|---|
| X1 | Скачивание HTML (самодостаточный файл, как saveHTML) | MVP |
| X2 | Экспорт графа: MMD (Mermaid) | MVP |
| X3 | Экспорт графа: PNG (Canvas rendering) | MVP |
| X4 | Экспорт графа: JSON | MVP |
| X5 | Экспорт Markdown | Фаза 2 |

### 1.9. Импорт

| ID | Требование | Приоритет |
|---|---|---|
| I1 | Импорт HTML-файла PhiloSynth (загрузка файла) | MVP |
| I2 | Импорт по URL (с CORS-прокси fallback) | Фаза 2 |
| I3 | Валидация импортируемого документа с предупреждениями | MVP |

### 1.10. Prompt Registry (админ)

| ID | Требование | Приоритет |
|---|---|---|
| P1 | Список шаблонов с поиском по ключу | Фаза 2 |
| P2 | Редактирование шаблона с preview | Фаза 2 |
| P3 | Версионирование: создание версии, активация, откат | Фаза 2 |
| P4 | Тестовый запуск: генерация одного раздела с черновиком шаблона | Фаза 3 |
| P5 | Редактирование конфигов (context_deps, compat_matrix и т.д.) | Фаза 2 |

### 1.11. Биллинг

| ID | Требование | Приоритет |
|---|---|---|
| B1 | BYO-Key: пользователь вводит ключ, проксирование через бэкенд | MVP |
| B2 | Отображение стоимости в реальном времени (tokenы + USD) | MVP |
| B3 | История использования API (по синтезам, разделам) | MVP |
| B4 | Баланс сервиса: пополнение, списание, история транзакций | Фаза 2 |
| B5 | Rate limiting по пользователю | MVP |

### 1.12. Таксономия и обогащение элементов

| ID | Требование | Приоритет |
|---|---|---|
| T1 | Каталог типов категорий (18 системных + пользовательские) | Фаза 2 |
| T2 | Каталог типов связей (29 системных + пользовательские) | Фаза 2 |
| T3 | Нормализация типов при парсинге ответа Claude (маппинг на каталог) | Фаза 2 |
| T5 | Поиск и фильтрация по типам в каталоге концепций | Фаза 3 |
| EN1 | Точечное обогащение категории через Claude (описание, аналоги, трактовки) | Фаза 5 |
| EN2 | Точечное обоснование связи через Claude (философское обоснование, контраргументы) | Фаза 5 |
| EN3 | Обоснование числовой характеристики через Claude (почему centrality=0.9?) | Фаза 5 |
| EN4 | Расширенные характеристики: historical_significance, innovation_degree для категорий | Фаза 5 |
| EN5 | Расширенные характеристики: certainty, historical_support, logical_necessity для связей | Фаза 5 |
| EN6 | UI-слайдеры для каждой характеристики + кнопка «Обоснование» | Фаза 5 |
| RT1 | Трансформация graph→theses: генерация тезисов напрямую из графа БД | Фаза 5 |
| RT2 | Трансформация theses→graph: построение графа напрямую из тезисов БД | Фаза 5 |
| RT3 | Итеративный цикл: graph→theses→edit→graph→edit→theses→... | Фаза 5 |
| RT4 | История трансформаций с возможностью отката | Фаза 5 |
| RT5 | UI: кнопки «→ Тезисы» в графе и «→ Граф» в тезисах, превью изменений | Фаза 5 |

---

## 2. API-контракт

Базовый URL: `/api/v1`

Все ответы в формате JSON. Ошибки: `{ error: string, code: string, details?: any }`.
Аутентификация: cookie-based сессия (Lucia Auth). Все эндпоинты кроме auth требуют авторизации.

### 2.1. Auth

```
POST   /auth/register          { email, password, displayName? }
                                → { user: { id, email, displayName } }

POST   /auth/login             { email, password }
                                → { user: { id, email, displayName } }

POST   /auth/logout            (no body)
                                → { ok: true }

GET    /auth/me                → { user: { id, email, displayName, role, balanceUsd } }
```

### 2.2. Syntheses

```
GET    /syntheses              ?page=1&limit=20&sort=createdAt&order=desc
                               &status=ready&method=dialectical&search=...
                                → { items: Synthesis[], total: number }

GET    /syntheses/public       ?page=1&limit=20&search=...&philosopher=Кант
                                → { items: SynthesisPreview[], total: number }

POST   /syntheses              { seed, philosophers: string[], sections: string[],
                                 method, depth, synthLevel, generationOrder?,
                                 context?, sectionContexts?: Record<string, string>,
                                 lang?, participants?: ParticipantInput[] }
                                → { id: string, status: "generating" }
                                // Генерация начинается, клиент подключается по WebSocket

GET    /syntheses/:id          → { synthesis: SynthesisFull }

DELETE /syntheses/:id          → { ok: true }

PATCH  /syntheses/:id          { title?, isPublic? }
                                → { synthesis: SynthesisFull }

POST   /syntheses/:id/duplicate → { id: string }

POST   /syntheses/import       multipart/form-data: file (HTML)
                                → { id: string, warnings: ImportWarning[] }
```

**SynthesisFull:**
```typescript
{
  id: string;
  title: string;
  seed: string;
  method: string;
  synthLevel: string;
  depth: string;
  generationOrder: string;
  context: string;
  lang: string;
  status: string;
  isPublic: boolean;
  sectionOrder: string[];
  version: { base: number, sub: number, modes: number, modeRegen: number };
  capsuleHtml: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  createdAt: string;
  updatedAt: string;
  // Связи
  philosophers: string[];
  parentSyntheses: { id: string, title: string }[];
  childSyntheses: { id: string, title: string }[];
}
```

### 2.3. Sections

```
GET    /syntheses/:id/sections
                                → { sections: SectionSummary[] }

GET    /syntheses/:id/sections/:key
                                → { section: SectionFull }

GET    /syntheses/:id/sections/:key/context
                                → { contextHtml: string, budget: number, used: number,
                                    entries: ContextEntry[] }
                                // Отладочный эндпоинт: показывает, какой контекст
                                // будет использован при (пере)генерации этого раздела
```

**SectionFull:**
```typescript
{
  key: string;
  sectionNum: number;
  title: string;
  htmlContent: string;
  secContext: string;
  isEdited: boolean;
  subsections: string[];  // имена data-section внутри HTML
}
```

### 2.4. Elements (гранулярные)

```
GET    /syntheses/:id/categories
                                → { categories: Category[], edges: CategoryEdge[],
                                    clusters: ClusterLabel[], topology: TopologyInfo }

GET    /syntheses/:id/categories/:catId
                                → { category: Category }

PATCH  /syntheses/:id/categories/:catId
                                { name?, type?, definition?, centrality?, certainty?, origin? }
                                → { category: Category, impact: ImpactAnalysis }

GET    /syntheses/:id/theses    → { theses: Thesis[] }

PATCH  /syntheses/:id/theses/:thesisId
                                { formulation?, justification?, thesisType?, noveltyDegree? }
                                → { thesis: Thesis, impact: ImpactAnalysis }

GET    /syntheses/:id/glossary  → { terms: GlossaryTerm[] }

PATCH  /syntheses/:id/glossary/:termId
                                { term?, definition?, extraColumns? }
                                → { term: GlossaryTerm, impact: ImpactAnalysis }
```

**ImpactAnalysis:**
```typescript
{
  affectedSections: string[];       // ключи разделов, ссылающихся на элемент
  affectedSubsections: string[];    // "sectionKey:subsectionName"
  affectedModes: { modeKey: string, index: number, title: string }[];
  severity: "none" | "low" | "high";
}
```

### 2.5. Generation

```
POST   /syntheses/:id/regenerate/:sectionKey
                                { context?: string }
                                → { ok: true }
                                // Стриминг через WebSocket

POST   /syntheses/:id/regenerate-subsection
                                { sectionKey: string, subsectionName: string,
                                  userNote?: string, includeCurrentContent?: boolean }
                                → { ok: true }
                                // Стриминг через WebSocket
```

### 2.6. Edit Plans

```
POST   /syntheses/:id/plans    { regen: string[], remove: string[], add: string[],
                                 regenContexts?: Record<string, string>,
                                 addContexts?: Record<string, string>,
                                 modeRegen?: [string, number][],
                                 modeRemove?: [string, number][] }
                                → { plan: EditPlan }
                                // Сервер вычисляет каскад и возвращает полный план

GET    /syntheses/:id/plans/:planId
                                → { plan: EditPlan }

PATCH  /syntheses/:id/plans/:planId
                                { steps: { index: number, status: "confirmed"|"skipped" }[] }
                                → { plan: EditPlan }

POST   /syntheses/:id/plans/:planId/execute
                                → { ok: true }
                                // Исполнение через WebSocket

DELETE /syntheses/:id/plans/:planId
                                → { ok: true }
```

### 2.7. Modes

```
POST   /syntheses/:id/modes/:modeKey/run
                                { param: string }
                                → { ok: true }
                                // Стриминг через WebSocket

GET    /syntheses/:id/modes     → { modes: Record<string, ModeResult[]> }

GET    /syntheses/:id/modes/:modeKey
                                → { results: ModeResult[] }

DELETE /syntheses/:id/modes/:modeKey/:index
                                → { ok: true }
```

### 2.8. Lineage

```
GET    /syntheses/:id/lineage/ancestors?depth=10
                                → { tree: LineageNode }

GET    /syntheses/:id/lineage/descendants?depth=5
                                → { children: LineageNode[] }

GET    /lineage/search          ?philosopher=Кант&philosopher=Хайдеггер
                                → { syntheses: SynthesisPreview[] }
                                // Концепции, в генеалогии которых есть ВСЕ указанные философы
```

### 2.9. Prompts (Admin)

```
GET    /prompts                 ?prefix=method.&activeOnly=true
                                → { templates: PromptTemplate[] }

GET    /prompts/:key/versions   → { versions: PromptVersion[] }

POST   /prompts/:key            { body: string, description?: string }
                                → { template: PromptTemplate }
                                // Создаёт новую версию (не активную)

POST   /prompts/:key/activate   { version: number }
                                → { template: PromptTemplate }
                                // Активирует версию, деактивирует предыдущую, инвалидирует кэш

GET    /configs                 → { configs: SynthesisConfig[] }

PUT    /configs/:key            { value: any, description?: string }
                                → { config: SynthesisConfig }
```

### 2.10. Billing

```
GET    /billing/usage           ?from=2026-01-01&to=2026-04-01&synthesisId=...
                                → { entries: ApiUsage[], totals: UsageTotals }

POST   /billing/api-key         { encryptedKey: string }
                                → { keyId: string, prefix: string }

DELETE /billing/api-key/:id     → { ok: true }

GET    /billing/api-key         → { keys: { id, prefix, isActive, createdAt }[] }

POST   /billing/topup           { amountUsd: number }
                                → { clientSecret: string }
                                // Stripe PaymentIntent

GET    /billing/transactions    ?page=1&limit=50
                                → { items: Transaction[], total: number }
```

### 2.11. Export

```
GET    /syntheses/:id/export/html   → text/html (самодостаточный файл)
GET    /syntheses/:id/export/mmd    → text/plain (Mermaid)
GET    /syntheses/:id/export/png    → image/png (граф)
GET    /syntheses/:id/export/json   → application/json (граф)
GET    /syntheses/:id/export/md     → text/markdown
```

### 2.12. Context Log

```
GET    /syntheses/:id/logs/generation  → { entries: GenerationLogEntry[] }
GET    /syntheses/:id/logs/context     → { entries: ContextLogEntry[] }
GET    /syntheses/:id/logs/formatted   → { text: string, html: string }
                                       // Аналог formatCtxLog() и colorizeLog()
```

### 2.13. Taxonomy (каталоги типов)

```
GET    /taxonomy/category-types     → { types: CategoryType[] }
POST   /taxonomy/category-types     { key, nameRu, description } → { type: CategoryType }
                                    // Создание пользовательского типа

GET    /taxonomy/relationship-types → { types: RelationshipType[] }
POST   /taxonomy/relationship-types { key, nameRu, description, defaultDirection }
                                    → { type: RelationshipType }

POST   /taxonomy/normalize          { text: string, kind: "category"|"relationship" }
                                    → { match: TypeMatch | null, suggestions: TypeMatch[] }
                                    // Нормализация свободного текста → ближайший тип из каталога
```

### 2.14. Element Enrichment (точечные Claude-запросы)

```
POST   /syntheses/:id/enrich/category/:catId
                                    { type: "description"|"evolution" }
                                    → { enrichment: ElementEnrichment }
                                    // Стриминг через WebSocket

POST   /syntheses/:id/enrich/edge/:edgeId
                                    { type: "justification"|"counterarguments" }
                                    → { enrichment: ElementEnrichment }

POST   /syntheses/:id/justify-characteristic
                                    { elementId, elementType, characteristic, value }
                                    → { justification: CharacteristicJustification }

GET    /syntheses/:id/enrichments/:elementId
                                    → { enrichments: ElementEnrichment[] }

GET    /syntheses/:id/justifications/:elementId
                                    → { justifications: CharacteristicJustification[] }
```

### 2.15. Representation Transforms (graph↔theses)

```
POST   /syntheses/:id/transform/graph-to-theses
                                → { ok: true }
                                // Стриминг через WebSocket.
                                // Генерирует тезисы из текущего графа (categories + edges).
                                // Заменяет существующие тезисы. Снимок сохраняется.

POST   /syntheses/:id/transform/theses-to-graph
                                → { ok: true }
                                // Стриминг через WebSocket.
                                // Строит граф из текущих тезисов.
                                // Заменяет существующий граф. Снимок сохраняется.

GET    /syntheses/:id/transforms
                                → { transforms: RepresentationTransform[] }
                                // История трансформаций

POST   /syntheses/:id/transforms/:transformId/rollback
                                → { ok: true }
                                // Откат: восстанавливает source_snapshot
```

**RepresentationTransform:**
```typescript
{
  id: string;
  direction: "graph_to_theses" | "theses_to_graph";
  resultSummary: {
    categoriesCreated?: number;
    categoriesRemoved?: number;
    edgesCreated?: number;
    edgesRemoved?: number;
    thesesCreated?: number;
    thesesRemoved?: number;
  };
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: string;
}
```

---

## 3. WebSocket-протокол

Endpoint: `wss://host/ws?token={sessionToken}`

Подключение устанавливается один раз при открытии синтеза. Все операции генерации/стриминга идут через это соединение.

### 3.1. Сообщения клиент → сервер

```typescript
// Запуск генерации нового синтеза (после POST /syntheses)
{ type: "subscribe_generation", synthesisId: string }

// Запуск перегенерации одного раздела
{ type: "start_regen", synthesisId: string, sectionKey: string, context?: string }

// Запуск перегенерации подраздела
{ type: "start_sub_regen", synthesisId: string, sectionKey: string,
  subsectionName: string, userNote?: string, includeCurrentContent?: boolean }

// Запуск режима
{ type: "start_mode", synthesisId: string, modeKey: string, param: string }

// Запуск плана редактирования
{ type: "execute_plan", synthesisId: string, planId: string }

// Подтверждение шага плана (если план в режиме step-by-step)
{ type: "confirm_step", planId: string, stepIndex: number }

// Отмена текущей операции
{ type: "cancel", synthesisId: string }

// Пинг (keep-alive)
{ type: "ping" }
```

### 3.2. Сообщения сервер → клиент

```typescript
// Потоковое обновление HTML
{ type: "stream_delta",
  synthesisId: string,
  sectionKey: string,
  delta: string,           // инкрементальный HTML-фрагмент
  totalChars: number,      // общее количество символов
  totalHtml: string }      // полный HTML (опционально, каждые N дельт)

// Обнаружен подраздел в потоке (для трекинга прогресса)
{ type: "subsection_found",
  synthesisId: string,
  sectionKey: string,
  subsectionName: string,
  charsSoFar: number }

// Генерация раздела завершена
{ type: "section_done",
  synthesisId: string,
  sectionKey: string,
  usage: { inputTokens: number, outputTokens: number, costUsd: number },
  html: string }

// Генерация всего синтеза завершена
{ type: "generation_complete",
  synthesisId: string,
  totalUsage: { inputTokens: number, outputTokens: number, costUsd: number } }

// Ошибка генерации
{ type: "stream_error",
  synthesisId: string,
  sectionKey?: string,
  error: string,
  partialHtml?: string,
  recoverable: boolean }

// Обновление плана редактирования
{ type: "plan_updated",
  planId: string,
  plan: EditPlan }

// Шаг плана начал исполняться
{ type: "plan_step_started",
  planId: string,
  stepIndex: number }

// Шаг плана завершён
{ type: "plan_step_done",
  planId: string,
  stepIndex: number,
  result: StepResult }

// Новые шаги добавлены каскадом
{ type: "plan_steps_added",
  planId: string,
  newSteps: EditStep[],
  reason: string }

// Режим завершён
{ type: "mode_done",
  synthesisId: string,
  modeKey: string,
  index: number,
  usage: { inputTokens: number, outputTokens: number, costUsd: number },
  html: string }

// Обогащение элемента
// Трансформация graph↔theses
{ type: "transform_started",
  synthesisId: string,
  direction: "graph_to_theses" | "theses_to_graph" }

{ type: "transform_done",
  synthesisId: string,
  direction: string,
  summary: { categoriesCreated?, thesesCreated?, ... },
  usage: { inputTokens: number, outputTokens: number, costUsd: number } }

// Обогащение элемента
{ type: "enrichment_delta",
  synthesisId: string,
  elementId: string,
  delta: string,
  totalChars: number }

{ type: "enrichment_done",
  synthesisId: string,
  elementId: string,
  enrichmentType: string,
  usage: { inputTokens: number, outputTokens: number, costUsd: number } }

// Понг (keep-alive)
{ type: "pong" }
```

### 3.3. Reconnect-протокол

При обрыве WebSocket:
1. Клиент переподключается с `?token={sessionToken}&resume={synthesisId}`
2. Сервер проверяет наличие активной генерации для этого synthesisId в Redis (`stream_state:{synthesisId}`)
3. Если есть — отправляет `{ type: "resume", sectionKey, htmlSoFar, charsSoFar }` и продолжает стриминг
4. Если генерация завершилась пока клиент был отключён — отправляет `section_done` / `generation_complete` с финальными данными

### 3.4. Rate Limiting

- Максимум 3 одновременных генерации на пользователя
- Максимум 60 WebSocket-сообщений в минуту от клиента
- При превышении: `{ type: "error", code: "RATE_LIMIT", retryAfter: number }`

---

## 4. Форматы данных

### 4.1. ParticipantInput (для мета-синтеза)

```typescript
// При создании мета-синтеза
{ type: "philosopher", name: string }
| { type: "synthesis", synthesisId: string }
```

### 4.2. EditPlan

```typescript
{
  id: string;
  synthesisId: string;
  status: "draft" | "executing" | "paused" | "done" | "failed";
  currentStep: number;
  steps: Array<{
    type: "delete" | "regen" | "add" | "regen_subsection" | "regen_mode";
    target: string;
    status: "pending" | "confirmed" | "running" | "done" | "skipped" | "failed";
    context?: string;
    cascadeGenerated: boolean;
    result?: {
      outputChars: number;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    };
  }>;
  estimatedCost: number;
  createdAt: string;
}
```

### 4.3. Коды ошибок

```
AUTH_REQUIRED        — нет сессии
FORBIDDEN            — нет доступа к ресурсу
NOT_FOUND            — ресурс не найден
VALIDATION_ERROR     — невалидные данные (details содержит поля)
RATE_LIMIT           — превышен лимит запросов
INSUFFICIENT_BALANCE — недостаточно средств (режим «баланс сервиса»)
API_KEY_INVALID      — невалидный API-ключ (режим BYO-Key)
API_KEY_MISSING      — API-ключ не задан
GENERATION_IN_PROGRESS — генерация уже запущена для этого синтеза
PLAN_CONFLICT        — попытка исполнить план при активной генерации
IMPORT_INVALID       — невалидный файл импорта
INCOMPATIBLE_SECTIONS — несовместимая комбинация разделов
```
