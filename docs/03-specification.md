# PhiloSynth Service — Спецификация

> **Ревизия 2026-07-29 (беседа 1.5)**: клиентская форма/прогресс;
> эндпоинты /syntheses/estimate и /syntheses/advice; код
> NO_PARTICIPANTS_SEED_REQUIRED в POST /syntheses.
> **Ревизия 2026-07-22**: спецификация дополнена под подсистемы v11 —
> pause/resume, свободный синтез (0 участников), keepFullBudget,
> селективный родительский контекст. Спецификации — 01-architecture, §4.12–4.15.
>
> **Правка 2026-07-23 (итоги Фазы 0)**: §1.1 A2 разделён (сброс пароля →
> Фаза 3), §2.1 дополнен password-change/password-reset и формами 401/409
> (дыра, зафиксированная в 0.2).
>
> **Правка 2026-07-24 (итоги 0.5)**: §2.1 дополнен PATCH /auth/me (смена
> displayName) — закрытие дыры A3 «отображаемое имя»; UI профиля
> (displayName + форма смены пароля) — новая беседа 0.6 в 07.

## 1. Функциональные требования

### 1.1. Управление аккаунтом

| ID | Требование | Приоритет |
|---|---|---|
| A1 | Регистрация по email + пароль | MVP |
| A2 | Вход / выход | MVP |
| A2a | Сброс пароля по email | Фаза 3 |
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
| G1 | Форма создания: философы (106 позиций, +36 в v10), зерно, метод, уровень, глубина, порядок, контекст, секции, extGraphMetrics, keepFullBudget (v11) | MVP |
| G1a | Свободный синтез: участники опциональны — при 0 философов/концепций синтез идёт только из зерна (participantCardinality='none', см. 01 §4.14); валидация НЕ отклоняет пустой список | MVP |
| G2 | Выбор секций с проверкой совместимости (матрица COMPAT_MATRIX) | MVP |
| G3 | Оценка стоимости до генерации (estimateCost) | MVP |
| G4 | Потоковая генерация с отображением прогресса в реальном времени | MVP |
| G5 | Прерывание генерации (user-abort, глобальный AbortController) | MVP |
| G8 | Пауза при классифицированном обрыве (auth/billing/pre-stream/max-tokens/partial/stuck): персистентное pausedState, модалка с действиями и оценкой стоимости | MVP |
| G9 | Возобновление: fill-missing-subs / retry / skip / stop; для плана — resumePlan с упавшего шага (см. 01 §4.12) | MVP |
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
| E7 | Ручное редактирование элементов (категории, тезисы, глоссарий) | Фаза 5 |
| E8 | Автозамена имён при переименовании категории | Фаза 5 |
| E9 | Версионирование элементов с откатом | Фаза 5 |

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
| R7 | Зависимости режимов декларативно: MODE_DEPS + getEffectiveModeDeps (v11) | MVP |

### 1.8. Экспорт

| ID | Требование | Приоритет |
|---|---|---|
| X1 | Скачивание HTML (самодостаточный файл, как saveHTML) | MVP |
| X2 | Экспорт графа: MMD (Mermaid) | MVP |
| X3 | Экспорт графа: PNG (Canvas rendering) | MVP |
| X4 | Экспорт графа: JSON | MVP |
| X5 | Экспорт Markdown (saveMD уже реализован в исходнике — прямой порт) | MVP |

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
| B4 | Баланс сервиса (pay-as-you-go): пополнение, списание, история транзакций | Фаза 6 |
| B6 | Подписки (Stripe Subscriptions): тарифные планы, квоты, управление подпиской | Фаза 6 |
| B7 | Приоритет биллинга: BYO-Key → подписка → баланс → ошибка | Фаза 6 |
| B8 | Webhook Stripe: обработка invoice.paid, subscription.updated/deleted | Фаза 6 |
| B5 | Rate limiting по пользователю | MVP |

### 1.12. Таксономия и обогащение элементов

| ID | Требование | Приоритет |
|---|---|---|
| T1 | Каталог типов категорий (18 системных + пользовательские) | Фаза 0 (сделано 0.3b) |
| T2 | Каталог типов связей (29 системных + пользовательские) | Фаза 0 (сделано 0.3b) |
| T3 | Нормализация типов при парсинге ответа Claude (маппинг на каталог) | Фаза 0 (сделано 0.3b) |
| T5 | Поиск и фильтрация по типам в каталоге концепций | Фаза 3 |
| EN1 | Точечное обогащение категории через Claude (описание, аналоги, трактовки) | Фаза 5 |
| EN2 | Точечное обоснование связи через Claude (философское обоснование, контраргументы) | Фаза 5 |
| EN3 | Обоснование числовой характеристики через Claude (почему centrality=0.9?) | Фаза 5 |
| EN4 | Расширенные характеристики: historical_significance, innovation_degree, clarity, breadth, depth, applicability для категорий | Фаза 5 |
| EN5 | Расширенные характеристики: certainty, historical_support, logical_necessity, innovation_degree, context_dependency для связей | Фаза 5 |
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

PATCH  /auth/me                { displayName }
                                → { user: { id, email, displayName, role, balanceUsd } }
                                // Смена отображаемого имени (A3, беседа 0.6).
                                // Требует сессии. trim; пустая строка → null;
                                // длина > 100 → VALIDATION_ERROR +
                                // details.displayName

POST   /auth/password-change   { currentPassword, newPassword }
                                → { ok: true }
                                // Требует сессии (беседа 0.5). Неверный
                                // currentPassword → 401 AUTH_REQUIRED (единый
                                // ответ, анти-enumeration). Все прочие сессии
                                // пользователя инвалидируются, текущая живёт.

POST   /auth/password-reset/request  { email }              // A2a, Фаза 3
                                // ВНИМАНИЕ: «Фаза 3» здесь — фаза
                                // ПРОДУКТА (таблица возможностей §1),
                                // а не беседа протокола 07. Беседы под
                                // сброс пароля в 07 нет ни одной —
                                // при выходе за MVP её нужно завести
                                // отдельно (аудит 2026-07-30).
                                → { ok: true }              // всегда ok (анти-enumeration)
POST   /auth/password-reset/confirm  { token, newPassword } // A2a, Фаза 3
                                → { ok: true }
```

Формы ошибок auth (зафиксированы в 0.2, вне §4.3): неверные креды login →
401 AUTH_REQUIRED единым ответом (анти-enumeration); занятый email register →
409 VALIDATION_ERROR + details.email.

### 2.2. Syntheses

```
GET    /syntheses              ?page=1&limit=20&sort=createdAt&order=desc
                               &status=ready&method=dialectical&search=...
                                → { items: SynthesisPreview[], total: number }

GET    /syntheses/public       ?page=1&limit=20&search=...&philosopher=Кант
                                → { items: SynthesisPreview[], total: number }
// Семантика параметров (беседа 1.6): sort ∈ createdAt|updatedAt|title|
// method|status (иное молча → createdAt), order ∈ asc|desc (default
// desc), limit 1..100 (default 20), page ≥ 1; search — подстрока title
// без учёта регистра (ILIKE %…%, gin_trgm); philosopher — ТОЧНОЕ имя в
// генеалогии (как §2.8); невалидные status/method → 400
// SynthesisPreview += hasConceptParents: boolean (беседа 3.2,
// аддитивно): есть родители-концепции (parent_type='synthesis') —
// бейдж «мета-синтез» в карточке каталога; несут оба списка и
// /lineage/search (loadConceptParentFlags батчем).
// VALIDATION_ERROR. PATCH title: trim, непустая, ≤ 300 символов.
// Не-UUID в /:id повсюду → 404 (guard до запроса к PG, иначе 22P02).

POST   /syntheses              { seed, philosophers?: string[], sections: string[],
                                 method, depth, synthLevel, generationOrder?,
                                 extGraphMetrics?: boolean,
                                 keepFullBudget?: boolean,   // v11: tz_budget_mode
                                 context?, sectionContexts?: Record<string, string>,
                                 lang?, participants?: ParticipantInput[] }
                                // v11: philosophers и participants опциональны —
                                // оба пусты = свободный синтез (обязателен seed;
                                //   иначе 400 NO_PARTICIPANTS_SEED_REQUIRED, §4.3)
                                // 3.1: participants принимает {type:'synthesis',
                                //   synthesisId} — доступ (владелец ИЛИ публичный,
                                //   403) и пригодность (validateConceptForMeta-
                                //   Synthesis: sum/glossary/theses/critique,
                                //   graph|dialogue, capsule → 400 c missing);
                                //   дубликаты id → 400
                                → { id: string, status: "generating",
                                    warnings?: {level:'info'|'warn', text}[] }
                                // warnings (3.1, аддитивно): неблокирующие
                                // генеалогические пересечения (M3 §1.6;
                                // confirm исходника жил на клиенте)
                                // Генерация начинается, клиент подключается по WebSocket

POST   /syntheses/estimate     тело = телу POST /syntheses (беседа 1.5)
                                → { estimate: { inTokens, outTokens, cost, passes } }
                                // Оценка БЕЗ создания записей: сервер зеркалит
                                // конвейер генерации (resolveContextDeps →
                                // buildEffectiveDeps → buildDynamicOrder →
                                // buildSectionDefs → groupPasses → buildSYS/
                                // baseCtxStatic → estimateCost). Требование G3
                                // §1.3; из вилки протокола «сервер или клиентская
                                // копия» выбран сервер — копия дрейфовала бы от
                                // Registry (fragment_share/context_budget).
                                // 3.1: участники type='synthesis' учитываются —
                                // вес родителей parentOverheadForSection-колбэком
                                // (baseCtxStatic вместо baseCtx); недоступные id
                                // для оценки молча пропускаются (оценка — не гейт).
                                // estimate-diff: клиент зовёт /estimate дважды
                                // (с концепциями и без); отрисовка разницы — 3.2.

POST   /syntheses/advice       { sections: string[], method, synthLevel,
                                 generationOrder? }                (беседа 1.5)
                                → { entry: CompatEntry+{icon,title} | null,
                                    advice: { warnings, recommendations,
                                              substitutions } }
                                // Advisor v2 + Section Dependency Warnings
                                // (01 §4.15 п.1–2): getCompatEntryByKey +
                                // computeSectionAdvice; icon/title считает
                                // сервер, CSS-классы чипов — клиент.

GET    /syntheses/:id          → { synthesis: SynthesisFull }
                                // Доступ: владелец ИЛИ is_public = true
                                // (каталог «Публичные» ведёт на чужой
                                // /synthesis/:id). Иначе 403 FORBIDDEN;
                                // несуществующий id → 404 NOT_FOUND.
                                // Реализация — беседа 1.6 (сервер).

DELETE /syntheses/:id          → { ok: true }
                                // Только владелец (иначе 403).
                                // Активная генерация → 409
                                // GENERATION_IN_PROGRESS (беседа 1.6).

PATCH  /syntheses/:id          { title?, isPublic?, extGraphMetrics? }
                                → { synthesis: SynthesisFull }
                                // Только владелец. Единственный способ
                                // опубликовать синтез — без него вкладка
                                // «Публичные» недостижима из UI.
                                // extGraphMetrics добавлен беседой 2.3 —
                                // транспорт чекбокса «Расширенные
                                // характеристики» на карточке graph в
                                // EditModal (исходник писал
                                // DOC_STATE.params напрямую [18475]).

POST   /syntheses/:id/duplicate → { id: string }
                                // Реализация — беседа 1.6 (сервер).
                                // До аудита 2026-07-30 эндпоинт не был
                                // упомянут в протоколе 07 ни разу.
                                // Решения 1.6: доступ — только владелец;
                                // новый doc_num, title += « (копия)»,
                                // is_public=false; копируются разделы,
                                // элементы (ремап id рёбер) и генеалогия
                                // РОДИТЕЛЕЙ; lineage-связи «копия →
                                // оригинал» нет (копия, не потомок);
                                // логи не копируются; активная
                                // генерация → 409 GENERATION_IN_PROGRESS.

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
  extGraphMetrics: boolean;
  context: string;
  lang: string;
  status: string;   // v11: + 'paused'
  keepFullBudget: boolean;              // v11
  parentContextSchema: string;          // v11: 'selective-v1' | 'monolithic'
  pausedState: PausedState | null;      // v11: см. 02-data-model (syntheses.paused_state)
  pauseEstimates: PauseEstimates | null; // v11: оценки действий паузы —
                                        // computePauseEstimates(id, ps)
                                        // из pause-resume-service (1.4b),
                                        // fail-open {}; null при pausedState
                                        // = null. В NEXT-CONTEXT (гл. 1.4b)
                                        // поле названо просто estimates —
                                        // здесь развёрнуто, чтобы не путать
                                        // с оценкой стоимости /estimate
  isPublic: boolean;
  docNum: string;                       // «PS-NNNN-XXXX» — заполняется при
                                        // создании записи (формат исходника
                                        // [12110]); шапка документа
  sectionOrder: string[];
  version: { base: number, sub: number, modes: number, modeRegen: number };
  structureSections: string[] | null;  // v10: снимок sectionOrder
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
                                // Реализация — беседа 1.6 (сервер),
                                // вместе с остальным routes/sections.ts.
                                // Потребитель — поле контекста в
                                // EditSectionCard (беседа 2.3).
                                → { contextText: string, budget: number,
                                    rawBaseBudget: number, totalUsed: number,
                                    budgetMode: 'full'|'shrink',
                                    parentOverhead: number,
                                    parentSpec: ParentSpecLog | null,
                                    reqFound: number, reqTotal: number,
                                    optIncluded: number, optTotal: number,
                                    entries: ContextEntry[] }
                                // Отладочный эндпоинт: показывает, какой контекст
                                // будет использован при (пере)генерации раздела.
                                // contextText — ПЛОСКИЙ ТЕКСТ блока «КОНТЕКСТ ИЗ
                                // ПРЕДЫДУЩИХ РАЗДЕЛОВ …», а не HTML (прежнее имя
                                // contextHtml вводило в заблуждение).
                                // Поля соответствуют CtxLogDraft, который
                                // возвращает buildContextForSection (беседа 1.3);
                                // rawBaseBudget = CONTEXT_BUDGET[depth] ×
                                // (key === 'critique' ? 1.5 : 1)
```

**SectionSummary** (элемент списка GET /syntheses/:id/sections):
```typescript
{
  key: string;
  sectionNum: number;
  title: string;
  isEdited: boolean;
  htmlChars: number;              // длина html_content, симв.
  contextQualityScore: number | null;  // v11: getSectionContextQuality
                                       // (01 §4.15 п.3) — 0–100 либо null,
                                       // если ctxLog по разделу отсутствует;
                                       // цветной бейдж в Edit Modal.
                                       // ДО беседы 2.4 (context-quality.ts
                                       // ещё не создан) роут отдаёт null —
                                       // TODO(2.4)
  subsections: string[];               // имена data-section внутри HTML —
                                       // нужны TableOfContents (беседа 1.6b)
                                       // для якорей второго уровня;
                                       // parseSubsectionsFromHTML (1.4)
  updatedAt: string;
}
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
                                // Доступ: владелец ИЛИ is_public = true.
                                // Реализация — беседа 1.6 (сервер): граф
                                // нужен клиентской беседе 1.7, а остальной
                                // routes/elements.ts (PATCH категорий,
                                // связей, тезисов, глоссария) остаётся
                                // беседе 5.1 в Фазе 5.

GET    /syntheses/:id/categories/:catId
                                → { category: Category }

PATCH  /syntheses/:id/categories/:catId
                                { name?, type?, definition?, centrality?, certainty?, origin?,
                                  historicalSignificance?, innovationDegree?,
                                  clarity?, breadth?, depthScore?, applicability? }
                                → { category: Category, impact: ImpactAnalysis }

PATCH  /syntheses/:id/edges/:edgeId
                                { description?, edgeType?, direction?, strength?,
                                  certainty?, historicalSupport?, logicalNecessity?,
                                  innovationDegree?, contextDependency? }
                                → { edge: CategoryEdge, impact: ImpactAnalysis }
                                // v10: добавлен PATCH для связей

GET    /syntheses/:id/theses    → { theses: Thesis[] }

PATCH  /syntheses/:id/theses/:thesisId
                                { formulation?, justification?, thesisType?, noveltyDegree? }
                                → { thesis: Thesis, impact: ImpactAnalysis }

GET    /syntheses/:id/glossary  → { terms: GlossaryTerm[] }

PATCH  /syntheses/:id/glossary/:termId
                                { term?, definition?, extraColumns? }
                                → { term: GlossaryTerm, impact: ImpactAnalysis }

// ── Дополнения 2026-09-02 (аудит фаз 5–6) ──────────────────────────────

// п.11: нормализованный тип пишется явно. PATCH категории/связи
// принимает typeCatalogId (ссылка на каталог §2.13) ЛИБО свободный
// type/edgeType. Ответ несёт оба поля — по ним TaxonomySelector (5.4)
// рисует индикатор «из каталога» / «свободный текст».
PATCH  /syntheses/:id/categories/:catId
                                { …, typeCatalogId?: string | null }
PATCH  /syntheses/:id/edges/:edgeId
                                { …, typeCatalogId?: string | null }

// п.14: топология и капсула редактируемы (01 §4.7 их перечисляет)
PATCH  /syntheses/:id/categories/:catId
                                { …, structuralRoles?, proceduralRoles?,
                                  clusterIndices? }
PATCH  /syntheses/:id/capsule   { html: string }
                                → { capsuleHtml: string }
                                // capsule_html живёт в syntheses;
                                // PATCH /syntheses/:id (§2.2) правит
                                // только title/isPublic

// п.2: версии элемента и откат (беседа 5.1; UI — VersionHistory, 5.2).
// Доступ: элемент обязан принадлежать :id — проверяется по
// element_versions.synthesis_id (колонка добавлена 2026-09-02, п.3).
GET    /syntheses/:id/elements/:elementType/:elementId/versions
                                → { versions: ElementVersion[] }
                                // elementType: category|edge|thesis|
                                //   glossary_term|dialogue_turn|section
                                // Сортировка: version DESC

POST   /syntheses/:id/elements/:elementType/:elementId/rollback
                                { version: number }
                                → { element: unknown, version: ElementVersion,
                                    impact: ImpactAnalysis }
                                // Восстанавливает данные версии, создаёт
                                // НОВУЮ версию с changeSource='rollback',
                                // перерисовывает таблицу в html_content
                                // (02 §3) и возвращает impact

// п.4: автозамена имён (E8). Отдельный вызов, а не побочный эффект
// PATCH: пользователь решает после просмотра impact.
POST   /syntheses/:id/elements/auto-rename
                                { oldName: string, newName: string }
                                → { affectedSections: string[],
                                    affectedTheses: number }
                                // Замена в html_content всех разделов И в
                                // theses.related_categories; каждая
                                // затронутая строка получает версию с
                                // changeSource='auto_rename'
```

**ElementVersion:**
```typescript
{
  id: string;
  elementType: "category" | "edge" | "thesis" | "glossary_term"
             | "dialogue_turn" | "section";
  elementId: string;
  version: number;
  data: Record<string, unknown>;   // снимок ДО изменения
  changeSource: "manual" | "regenerated" | "cascade" | "auto_rename" | "rollback";
  createdAt: string;
}
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

POST   /syntheses/:id/subsection-impact
                                { sectionKey: string, subsectionName: string }
                                → { intraDependents, crossDependents,
                                    affectedModes, estimate|null }
                                // Беседа 2.3: read-only превью подраздельной
                                // перегенерации для SubsectionRegenPanel —
                                // порт расчётной части showSubsectionRegenUI
                                // [18686] (intra → cross по всем изменяемым с
                                // dedup и фильтрами присутствия → режимы →
                                // estimateSubsectionCost fail-open null).
                                // Только владелец; БЕЗ гейта активной
                                // генерации. Закрывает транспорт долга
                                // «внутрисекционный каскад»: зависимые
                                // вычислимы по картам ДО перегенерации, а
                                // /regenerate-subsection отвечает { ok:true }
                                // фоном и вернуть affectedSubs не может.

POST   /syntheses/:id/regenerate-subsection
                                { sectionKey: string, subsectionName: string,
                                  userNote?: string, includeCurrentContent?: boolean }
                                → { ok: true }
                                // Стриминг через WebSocket
```

### 2.6. Edit Plans

```
POST   /syntheses/:id/plans/impact
                                { regen: string[], remove: string[],
                                  add: string[], modeRegen?: [string, number][] }
                                → { impact: CascadeImpactDto, estimatedCost }
                                // Беседа 2.3: read-only превью каскада для
                                // живой CascadePanel (прецеденты класса —
                                // /syntheses/advice 1.5, /:key/context 1.6).
                                // impact — серверный analyzeImpact (до этого
                                // роута CascadeImpact не был доступен клиенту
                                // вообще); estimatedCost — паритет футера
                                // updateEditPlanUI [19085]: только выбранные
                                // действия (delete = 0), fail-open 0. Только
                                // владелец; НИЧЕГО не персистит (решение
                                // беседы: превью надёжнее черновик-плана на
                                // каждый клик — без мусора в edit_plans).

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
                                // Стриминг через WebSocket: дельты
                                // sectionKey "mode:{modeKey}", финал
                                // mode_done (§3.2). Пустой param →
                                // 400 VALIDATION_ERROR (details.param);
                                // активная генерация → 409

GET    /syntheses/:id/modes     → { modes: Record<string, ModeResult[]> }

GET    /syntheses/:id/modes/:modeKey
                                → { results: ModeResult[],
                                    warnings: ModeDepsWarning[],
                                    estimate: ModeCostEstimate | null }
                                // По факту 4.1: транспорт checkModeDeps
                                // (warnings) и estimateModeCost
                                // (estimate; fail-open null) для модалки
                                // — до 4.1 §2.7 их не специфицировал.
                                // Чтение обоих GET — владелец ИЛИ
                                // публичный синтез

POST   /syntheses/:id/modes/:modeKey/:index/regenerate
                                → { ok: true }
                                // По факту 4.1 (довыполнение §12):
                                // тихая перегенерация СУЩЕСТВУЮЩЕГО
                                // результата с его собственным param
                                // (UPDATE строки, created_at сохранён);
                                // финал — mode_done, без дельт. Гейты
                                // как у DELETE. Исходник эндпоинта не
                                // имел: каскад звал runMode() с param
                                // из поля модалки [19034] — отступление

DELETE /syntheses/:id/modes/:modeKey/:index
                                → { ok: true }
                                // index — позиция по created_at ASC;
                                // вне диапазона → 404. ОТСТУПЛЕНИЕ 4.1:
                                // под 409-гейтом активной генерации
                                // (исходник removeModeResult доступен
                                // всегда)
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

Клиентские потребители (беседа 3.2): `client/api/lineage.ts`
(getAncestors/getDescendants/searchByPhilosophers); дерево на
SynthesisPage (секция «Генеалогическое древо», только для
мета-синтезов — паритет updateGenealogyInHeader); фильтр каталога
`?descendantsOf=<id>` — потомки отдельным запросом, каталог отображает
ПЕРЕСЕЧЕНИЕ (аудит 2026-07-30); LineageSearch — блок «Поиск по
генеалогии» в каталоге. Предполётная проверка пересечений формы:
каталожные участники — через getAncestors, файловые — по
participant.genealogy (клиентский checkGenealogyOverlaps, тексты ≡
серверным).

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
                                // Создаёт НОВУЮ версию-черновик (не
                                // активирует) — симметрично POST /prompts/:key

// Дополнение 2026-09-02 (аудит фаз 5–6, п.9): у конфигов есть version и
// is_active (02 §2.18), «версионирование аналогично шаблонам» требует
// 6.2 — но эндпоинтов не было.
GET    /configs/:key/versions   → { versions: ConfigVersion[] }

POST   /configs/:key/activate   { version: number }
                                → { config: SynthesisConfig }
                                // Активирует версию, деактивирует прежнюю,
                                // инвалидирует config_cache:* (0.3)
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

POST   /billing/topup/confirm   { paymentIntentId: string }
                                → { balanceUsd: number, transaction: Transaction }
                                // Правка 2026-09-02: эндпоинт требовался
                                // беседой 6.1 (confirmTopup), в контракте
                                // его не было

GET    /billing/subscription    → { subscription: UserSubscription | null,
                                   plan: SubscriptionPlan | null,
                                   usage: { syntheses, regenerations, modes, enrichments },
                                   quotas: { syntheses, regenerations, modes, enrichments } }

GET    /billing/plans            → { plans: SubscriptionPlan[] }

POST   /billing/subscribe        { planId: string }
                                → { clientSecret: string, subscriptionId: string }
                                // Stripe Subscription + SetupIntent

POST   /billing/subscription/cancel
                                → { subscription: UserSubscription }
                                // cancel_at_period_end = true

POST   /billing/subscription/resume
                                → { subscription: UserSubscription }
                                // cancel_at_period_end = false

POST   /billing/webhook          (Stripe webhook endpoint)
                                // invoice.paid → сброс счётчиков при новом периоде
                                // customer.subscription.updated → обновить статус
                                // customer.subscription.deleted → status = 'canceled'

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
GET    /syntheses/:id/logs/prompts     → { text: string | null } — дамп
                                         промптов (07 2.4; аналог
                                         downloadPrompts исходника)
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
// Канон типов обогащения (правка 2026-09-02, аудит фаз 5–6, п.6).
// Три документа расходились; принято: тип обогащения = enum модели
// (02 §2.26), ключ шаблона Registry = "enrichment.{элемент}.{тип}".
//   категория: description | evolution | justification
//   связь:     justification | counterarguments
//   характеристика: отдельный эндпоинт ниже (тип 'characteristic')
// Пять ключей Registry: enrichment.category.description,
// enrichment.category.evolution, enrichment.category.justification,
// enrichment.edge.justification, enrichment.edge.counterarguments,
// enrichment.characteristic_justification.

POST   /syntheses/:id/enrich/category/:catId
                                    { type: "description"|"evolution"|"justification" }
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
{ type: "subscribe_generation", synthesisId: string,
  viewOnly?: boolean }
// viewOnly (беседа 1.6): «только подписка» — страница просмотра (1.6b)
// не запускает generateSynthesis при status='generating' без активного
// прогона; события активного прогона доходят и так (доставка по userId).
// Без флага — прежнее поведение (запуск после POST /syntheses).

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

// Возобновление приостановленной генерации (v11, см. 01 §4.12)
{ type: "resume_generation", synthesisId: string,
  mode: "fill-missing-subs" | "retry" | "skip" | "stop" }

// Возобновление приостановленного плана (v11)
{ type: "resume_plan", synthesisId: string, planId: string,
  mode: "retry" | "skip_step" | "stop" }

// Отмена текущей операции. Для ГЕНЕРАЦИИ user-abort → pausedState не
// создаётся (частичный результат финализируется по правилам stop);
// обрыв шага ПЛАНА — включая user-abort — СОЗДАЁТ pausedState
// kind="plan" (паритет executeEditPlan; беседа 2.2)
{ type: "cancel", synthesisId: string }

// Запуск обогащения элемента (беседа 5.3). Правка 2026-09-02:
// ответные enrichment_delta/enrichment_done в §3.2 были, запускающего
// сообщения не было.
{ type: "start_enrichment", synthesisId: string,
  elementType: "category" | "edge", elementId: string,
  enrichmentType: string }

// Запуск трансформации представлений (беседа 5.5)
{ type: "start_transform", synthesisId: string,
  direction: "graph_to_theses" | "theses_to_graph" }

// Пинг (keep-alive)
{ type: "ping" }
```

> **Что именно запускает операцию (решение 2026-09-02, п.5).** Как в
> фазах 1–4: HTTP-роут (§2.14 / §2.15) СОЗДАЁТ операцию и отвечает
> `{ ok: true }`, WS-сообщение только ПОДПИСЫВАЕТ на её поток. Обогащение
> и трансформация запускаются HTTP-роутом; `start_enrichment` /
> `start_transform` допустимы как альтернативный вход для клиента, уже
> держащего сокет, и обязаны быть идемпотентны при активной операции
> (иначе — `GENERATION_IN_PROGRESS`).
>
> Дельты трансформации идут `stream_delta` с `sectionKey` = `"transform:{direction}"`
> — по образцу `"mode:{modeKey}"` беседы 4.1; собственного типа дельт у
> трансформации нет.

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

// Генерация приостановлена (v11): классифицированный обрыв → pausedState
{ type: "generation_paused",
  synthesisId: string,
  kind: "gen" | "plan",
  reasonKind: "auth"|"billing"|"pre-stream"|"max-tokens"|"partial"|"stuck",
  reason: string,
  isPartial: boolean,
  partialSubsections?: string[],
  expectedSubsections?: string[],
  skipDegrades?: string[],   // kind='gen': разделы, теряющие контекст
                             // пропускаемых при skip (confirm [25686], 2.2)
  estimates: { fillMissingSubs?: number, wholeSection?: number,
               skipRemaining?: number } }  // серверный аналог _computeGenPauseEstimates
// kind='plan' (2.2): plan-полей сообщение не несёт — stepIdx/totalSteps/
// failedOp клиент берёт из GET /syntheses/:id (pausedState); при
// user-abort плана сообщение НЕ отправляется (reasonKind его исключает),
// pausedState при этом создаётся

// Возобновление принято
{ type: "generation_resumed",
  synthesisId: string,
  mode: string,
  fromPassIdx?: number }

// Ошибка генерации (терминальная, без паузы — например IMPORT_INVALID)
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

> Примечание (наблюдение беседы 1.6): HTTP-лимитер middleware (0.2)
> фактически ключуется по IP и для аутентифицированных запросов —
> requireAuth срабатывает в роутах ПОСЛЕ него, поэтому identity на
> момент подсчёта всегда IP. «Per-user» HTTP-лимитирование потребует
> переноса подсчёта после auth — долг внесён в реестр 07 §12,
> адресат 6.1 (вместе с billing-service).

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
QUOTA_EXCEEDED      — исчерпана квота подписки (тип квоты в details)
BILLING_REQUIRED    — нет ни ключа, ни подписки, ни баланса
GENERATION_PAUSED   — генерация в pausedState; действия — через resume_generation (v11)
RESUME_INVALID      — resume_generation/resume_plan без pausedState или с чужим mode (v11)
NO_PARTICIPANTS_SEED_REQUIRED — свободный синтез без seed (v11)
```

> Примечание (беседа 1.4b): отдельного кода «операция ещё не
> реализована» в протоколе нет — до появления plan-executor'а
> (беседа 2.2) `resume_plan` с mode `retry`/`skip_step` отвечает
> `RESUME_INVALID` с пояснением; ветка `stop` работает полностью.
> «Чужой mode» из WS-сообщения также даёт `RESUME_INVALID`
> (runtime-guard: parseClientMessage валидирует только `type`).
