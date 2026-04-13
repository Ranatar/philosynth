# PhiloSynth Service — Карта переиспользования кода

## Обзор

Исходный файл: `philosynth.html` (19810 строк).
Всё содержимое разбивается на 4 категории:

- **Переносимое** — логика копируется в TypeScript-модули практически без изменений
- **Адаптируемое** — логика сохраняется, но меняется источник данных (DOM → БД) или среда (браузер → Node.js)
- **Непереносимое** — CSS, HTML-разметка, DOM-манипуляции → заменяются React-компонентами
- **Новое** — функциональность, отсутствующая в исходнике

---

## 1. Переносимое (логика → TypeScript без изменений)

### 1.1. Система зависимостей и подстановок

| Функция / объект | Целевой модуль сервиса |
|---|---|
| `CONTEXT_DEPS_BASE` | `server/config/context-deps.ts` (→ synthesis_configs в БД) |
| `CONTEXT_DEPS_GENETIC` | там же |
| `LEVEL_DEPS_PATCH` | там же |
| `METHOD_DEPS_PATCH` | там же |
| `ALL_CTX_KEYS`, `CTX_LABELS` | `shared/constants/ctx-keys.ts` |
| `resolveContextDeps()` | `server/services/synthesis-engine.ts` |
| `deepMergeUniq()` | `server/utils/deep-merge.ts` |
| `SUBSTITUTION_MAP` (architectural) | `server/config/substitution-map.ts` (→ БД) |
| `SUBSTITUTION_MAP_GENETIC` | там же |
| `findSubstitute()`, `getSubstituteQuality()`, `getActiveSubstitutionMap()` | `server/services/synthesis-engine.ts` |
| `buildEffectiveDeps()` | там же |
| `computePredecessors()` | `server/utils/topo-sort.ts` |
| `buildDynamicOrder()`, `topologicalSort()` | там же |
| `resolveCircularDeps()` | там же |
| `computeDependents()`, `sourceOf()`, `getIntraDependents()`, `getCrossSecDependents()`, `buildSubsectionMap()`, `getAffectedModes()`, `sortInTopoOrder()`, `buildFactualDepsMap()`, `computeFactualDependents()` | `server/services/cascade-analyzer.ts` |

### 1.2. Матрица совместимости

| Функция / объект | Целевой модуль |
|---|---|
| `COMPAT_MATRIX_COMPACT`, `COMPAT_KEYS` | `server/config/compat-matrix.ts` (→ БД) |
| `computeSectionRating()`, `computeMethodRating()`, `computeOverallCompat()`, `getCompatAdvice()` | `server/services/compat-advisor.ts` |

### 1.3. Оценка стоимости

| Функция / объект | Целевой модуль |
|---|---|
| `estimateCost()` | `server/services/cost-estimator.ts` |
| `estimateSubsectionCost()`, `estimateCascadeWaveCost()`, `estimateModeCost()`, `formatWaveCost()` | там же |

### 1.4. Версионирование

| Функция / объект | Целевой модуль |
|---|---|
| `parseVersion()`, `formatVersion()`, `formatVersionFilename()` | `shared/utils/version.ts` |

### 1.5. INTRA_DEPS и SUBSECTION_TO_CTX_KEYS

| Объект | Целевой модуль |
|---|---|
| `INTRA_DEPS` | `server/config/intra-deps.ts` (→ БД) |
| `SUBSECTION_TO_CTX_KEYS` | `server/config/subsection-ctx-keys.ts` (→ БД) |
| `TOPOLOGY_ROLES_PROCEDURAL` | `server/config/topology-roles.ts` (→ БД) |

### 1.6. Константы и метки

| Объект | Целевой модуль |
|---|---|
| `STATE` (списки философов, ML, SL, DL и т.д.) | `shared/constants/philosophers.ts`, `shared/constants/labels.ts` |
| `KEY_LABELS`, `SECTION_LABELS` | `shared/constants/section-labels.ts` |
| `REVERSE_ML`, `REVERSE_DL`, `REVERSE_SL`, `METHOD_CODE`, `LEVEL_CODE`, `ORDER_CODE`, `DEPTH_CODE` | `shared/constants/labels.ts` |

### 1.7. Парсинг графа

| Функция | Целевой модуль |
|---|---|
| `parseTopology()` | `server/services/graph-parser.ts` |
| `parseGraph()` | там же |
| `normalizeName()`, `normalizeType()` | `shared/utils/normalize.ts` |

### 1.8. Имена файлов

| Функция | Целевой модуль |
|---|---|
| `PHIL_FILENAME` | `shared/constants/phil-filename.ts` |
| `METHOD_CODE`, `LEVEL_CODE`, `transliterate()` | `shared/utils/transliterate.ts` |
| `getDocFilename()` | `server/services/export-service.ts` |

---

## 2. Адаптируемое (логика сохраняется, источник данных меняется)

### 2.1. Контекстная подсистема (DOM → БД)

| Функция | Что меняется | Целевой модуль |
|---|---|---|
| `buildContextForSection()` | `generated[key] = document.getElementById(...)` → `generated[key] = await db.query.sections(...)` | `server/services/context-builder.ts` |
| `extractContextFragment()` + 20 extract-функций | `el.querySelector('[data-section="..."]')` → SQL-запрос к `categories`, `theses`, `glossary_terms` | `server/services/context-extractor.ts` |
| `truncateText()`, `tableToText()` | без изменений | `server/utils/text.ts` |
| `extractIntraSectionContext()`, `extractRelevantIntraSectionContext()` | DOM → серверный HTML-парсинг (linkedom/cheerio) | `server/services/context-builder.ts` |

**Ключевое**: каждая из ~20 extract-функций сейчас парсит DOM. В сервисе часть из них будет читать из БД (категории, тезисы, глоссарий), часть — из `sections.html_content` через серверный DOM-парсер (для тех подразделов, которые не разбиты на элементы).

### 2.2. Сборка промптов (хардкод → Prompt Registry)

| Функция | Что меняется | Целевой модуль |
|---|---|---|
| `buildSYS()` | Читает шаблон `system` из Registry | `server/services/prompt-builder.ts` |
| `METHOD_SUM` … `METHOD_DIALOGUE` | Каждый → шаблон `method.{method}.{section}` из Registry | там же |
| `LEVEL_COMPARATIVE_*` … `LEVEL_GENERATIVE_*` | → шаблоны `level.{level}.{aspect}` из Registry | там же |
| `buildSectionDefs()` | Вместо хардкоженных строк — `registry.getTemplate(key)` | `server/services/section-defs-builder.ts` |
| `baseCtx()`, `serializeParts()` | Параметры из БД (synthesis record), а не из DOM | `server/services/prompt-builder.ts` |
| `patchPromptsWithSecCtx()`, `buildQualityReinforcement()` | Без изменений в логике | там же |

### 2.3. Стриминг (прямой SSE → двухзвенный)

| Функция | Что меняется | Целевой модуль |
|---|---|---|
| `streamResp()` | Разделяется: бэкенд делает SSE-запрос к Claude, парсит content_block_delta, отправляет через WebSocket | `server/services/streaming-manager.ts` |
| — | Клиент получает дельты через WebSocket и рендерит HTML | `client/hooks/useStreamingGeneration.ts` |

### 2.4. Каскадная перегенерация (confirm → план)

| Функция | Что меняется | Целевой модуль |
|---|---|---|
| `recalcEditPlan()`, `updateEditPlanUI()` | UI → React-компонент; логика пересчёта → серверная | `server/services/edit-planner.ts` + `client/components/EditPlanPanel.tsx` |
| `updateLiveCascade()` | Каскадный анализ → серверный, результат → через API | `server/services/cascade-analyzer.ts` |
| `executeEditPlan()` | confirm() → WebSocket confirm_step; последовательное исполнение на сервере | `server/services/plan-executor.ts` |
| `executeSubsectionRegen()` | Серия confirm() → предрассчитанный план с downstream-шагами | `server/services/plan-executor.ts` |
| `regenerateSection()` | DOM-манипуляции → запись в БД + WebSocket-стриминг | `server/services/generation-service.ts` |
| `regenerateSubsection()` | Аналогично | там же |

### 2.5. Экспорт (DOM → серверная генерация)

| Функция | Что меняется | Целевой модуль |
|---|---|---|
| `saveHTML()` | Генерация HTML из БД на сервере (шаблон + данные) | `server/services/export/html-exporter.ts` |
| `exportMMD()` | Вместо G.nodes → БД-запрос categories/edges | `server/services/export/mmd-exporter.ts` |
| `exportPNG()` | Canvas rendering на сервере (node-canvas) или генерация SVG | `server/services/export/png-exporter.ts` |
| `exportJSON()` | Из БД | `server/services/export/json-exporter.ts` |
| `buildGraphExportSection()` | Вставка в экспортируемый HTML | `server/services/export/html-exporter.ts` |
| `auditCSS()` | Оптимизация CSS для экспорта — переносится | `server/utils/css-audit.ts` |

### 2.6. Импорт

| Функция | Что меняется | Целевой модуль |
|---|---|---|
| `importHTML()` | Клиент загружает файл → сервер парсит → создаёт записи в БД | `server/services/import-service.ts` |
| `extractMetadata()` | Серверный DOM-парсер | там же |
| `extractSections()` | Серверный DOM-парсер | там же |
| `extractEmbeddedState()` | Без изменений | там же |
| `buildDocStateFromImport()` | Вместо DOC_STATE → создание записей в БД | там же |
| `importConceptAsParticipant()` | Чтение из БД вместо из DOM | `server/services/meta-synthesis-service.ts` |

### 2.7. Режимы

| Функция | Что меняется | Целевой модуль |
|---|---|---|
| `MODE_CONFIG`, `buildModeContext()` | Контекст из БД; промпт из Registry | `server/services/mode-service.ts` |
| `runMode()` | Стриминг через бэкенд + WebSocket | там же |
| `regenerateModeSilent()` | Аналогично | там же |

---

## 3. Непереносимое (заменяется React-компонентами)

| Что | Замена |
|---|---|
| CSS (все стили) | Tailwind + CSS-модули; цветовая палитра (--gold, --ink, --parchment) → CSS-переменные |
| HTML-разметка (формы, модальные окна, layout) | React-компоненты |
| `STATE` (DOM-рефы, глобальные переменные) | Zustand store |
| `generateDoc()`, `go()` — DOM-оркестрация генерации | React + WebSocket hooks |
| Константы графа (`TC`, `EC`, `CPAL`, `ROLE_REGISTRY`), `showNodePanel()` | React-компоненты GraphViewer, NodePanel |
| `build3D()` — Three.js (вся 3D-логика) | `client/components/Graph3D.tsx` (React-обёртка) |
| `build2D()` — D3.js (вся 2D-логика) | `client/components/Graph2D.tsx` (React-обёртка) |
| `buildLegend()`, `switchView()`, `openGraph()`, `closeGraph()` | `client/components/GraphModal.tsx` |
| `openEditModal()`, `renderEditSections()` | `client/components/EditModal.tsx` |
| UI подразделовой перегенерации | `client/components/SubsectionRegenPanel.tsx` |
| `addSection()`, `deleteSection()`, `rebuildDbMapping()` | Серверные операции через API |
| `handleImportFile()`, `importFromUrl()`, UI импорта | `client/components/ImportPanel.tsx` |
| `syncFormFromImport()` | React state sync |
| `renderGenealogyTree()` | `client/components/GenealogyTree.tsx` |
| Mode modal UI | `client/components/ModeModal.tsx` |
| DOMContentLoaded listeners, checkbox sync | React lifecycle |
| `refreshCtxLogIfOpen()` | React state subscription |
| `formatCtxLog()` | `server/services/log-formatter.ts` (серверная) + `client/components/ContextLogViewer.tsx` |
| `colorizeLog()` | `client/utils/colorize-log.ts` (клиентская) |

---

## 4. Новое (отсутствует в исходнике)

| Модуль | Описание |
|---|---|
| `server/middleware/auth.ts` | Lucia Auth: регистрация, сессии, middleware |
| `server/middleware/rate-limiter.ts` | Rate limiting (Redis) |
| `server/middleware/billing-check.ts` | Проверка баланса / наличия API-ключа |
| `server/services/element-editor.ts` | Ручное редактирование элементов + impact analysis |
| `server/services/element-versioning.ts` | Версионирование элементов |
| `server/services/billing-service.ts` | Stripe интеграция, транзакции |
| `server/services/api-key-service.ts` | Шифрование/дешифрование API-ключей, проксирование |
| `server/routes/*.ts` | Все HTTP-роуты (в исходнике нет бэкенда) |
| `server/ws/handler.ts` | WebSocket-обработчик |
| `client/pages/CatalogPage.tsx` | Каталог концепций |
| `client/pages/SynthesisPage.tsx` | Страница синтеза |
| `client/components/EditPlanPanel.tsx` | Визуализация плана редактирования |
| `client/stores/*.ts` | Zustand stores |
| `server/services/element-taxonomy.ts` | Каталог типов, нечёткая нормализация, справочник для поиска/фильтрации (идея из предыдущего проекта) |
| `server/services/element-enrichment.ts` | Точечные Claude-запросы для обогащения элементов (идея из предыдущего проекта) |
| `server/routes/taxonomy.ts` | API каталогов типов |
| `server/routes/enrichment.ts` | API обогащения элементов |
| `scripts/seed-taxonomy.ts` | Начальное заполнение каталогов (18 типов категорий + 29 типов связей) |
| `client/components/edit/CharacteristicSlider.tsx` | Слайдер характеристики + кнопка «Обоснование» |
| `client/components/edit/EnrichmentPanel.tsx` | Панель результатов обогащения элемента |
| `client/components/edit/TaxonomySelector.tsx` | Выбор типа из каталога при нормализации |
| `server/services/representation-transformer.ts` | Трансформация graph↔theses: прямая конверсия представлений (идея из предыдущего проекта) |
| `server/routes/transforms.ts` | API трансформаций + история + откат |
| `client/components/edit/TransformPanel.tsx` | UI: кнопки трансформации, превью, история, откат |
| `client/hooks/useWebSocket.ts` | WebSocket-hook с reconnect |

---

## 5. Сводная статистика

| Категория | Строк исходника (≈) | % от общего | Трудоёмкость портирования |
|---|---|---|---|
| Переносимое | ~4500 | 23% | Низкая (copy + TypeScript типы) |
| Адаптируемое | ~5500 | 28% | Средняя (замена DOM на БД/API) |
| Непереносимое | ~9000 | 45% | React-компоненты (переписать) |
| Только CSS/HTML | ~6000 | 30% | Tailwind + дизайн-система |
| Новое | — | — | Высокая (auth, billing, WS, API) |
