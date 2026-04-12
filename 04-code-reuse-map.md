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

| Строки исходника | Функция / объект | Целевой модуль сервиса |
|---|---|---|
| 4882–4953 | `CONTEXT_DEPS_BASE` | `server/config/context-deps.ts` (→ synthesis_configs в БД) |
| 4955–5030 | `CONTEXT_DEPS_GENETIC` | там же |
| 5032–5094 | `LEVEL_DEPS_PATCH` | там же |
| 5096–5126 | `METHOD_DEPS_PATCH` | там же |
| 5128–5148 | `ALL_CTX_KEYS`, `CTX_LABELS` | `shared/constants/ctx-keys.ts` |
| 5151–5168 | `resolveContextDeps()` | `server/services/synthesis-engine.ts` |
| 4851–4880 | `deepMergeUniq()` | `server/utils/deep-merge.ts` |
| 5171–5207 | `SUBSTITUTION_MAP` (architectural) | `server/config/substitution-map.ts` (→ БД) |
| 5209–5288 | `SUBSTITUTION_MAP_GENETIC` | там же |
| 5290–5328 | `findSubstitute()`, `getSubstituteQuality()`, `getActiveSubstitutionMap()` | `server/services/synthesis-engine.ts` |
| 5328–5370 | `buildEffectiveDeps()` | там же |
| 5370–5419 | `computePredecessors()` | `server/utils/topo-sort.ts` |
| 5419–5520 | `buildDynamicOrder()`, `topologicalSort()` | там же |
| 5813–5895 | `resolveCircularDeps()` | там же |
| 5525–5812 | `computeDependents()`, `sourceOf()`, `getIntraDependents()`, `getCrossSecDependents()`, `buildSubsectionMap()`, `getAffectedModes()`, `sortInTopoOrder()`, `buildFactualDepsMap()`, `computeFactualDependents()` | `server/services/cascade-analyzer.ts` |

### 1.2. Матрица совместимости

| Строки | Функция / объект | Целевой модуль |
|---|---|---|
| 5896–6117 | `COMPAT_MATRIX_COMPACT`, `COMPAT_KEYS` | `server/config/compat-matrix.ts` (→ БД) |
| 6129–6516 | `computeSectionRating()`, `computeMethodRating()`, `computeOverallCompat()`, `getCompatAdvice()` | `server/services/compat-advisor.ts` |

### 1.3. Оценка стоимости

| Строки | Функция / объект | Целевой модуль |
|---|---|---|
| 6518–6671 | `estimateCost()` | `server/services/cost-estimator.ts` |
| 6673–6816 | `estimateSubsectionCost()`, `estimateCascadeWaveCost()`, `estimateModeCost()`, `formatWaveCost()` | там же |

### 1.4. Версионирование

| Строки | Функция / объект | Целевой модуль |
|---|---|---|
| 4228–4332 | `parseVersion()`, `formatVersion()`, `formatVersionFilename()` | `shared/utils/version.ts` |

### 1.5. INTRA_DEPS и SUBSECTION_TO_CTX_KEYS

| Строки | Объект | Целевой модуль |
|---|---|---|
| 4335–4595 | `INTRA_DEPS` | `server/config/intra-deps.ts` (→ БД) |
| 4597–4790 | `SUBSECTION_TO_CTX_KEYS` | `server/config/subsection-ctx-keys.ts` (→ БД) |
| 4792–4849 | `TOPOLOGY_ROLES_PROCEDURAL` | `server/config/topology-roles.ts` (→ БД) |

### 1.6. Константы и метки

| Строки | Объект | Целевой модуль |
|---|---|---|
| 3932–3981 | `STATE` (списки философов, ML, SL, DL и т.д.) | `shared/constants/philosophers.ts`, `shared/constants/labels.ts` |
| 4077–4108 | `KEY_LABELS`, `SECTION_LABELS` | `shared/constants/section-labels.ts` |
| 4110–4225 | `REVERSE_ML`, `REVERSE_DL`, `REVERSE_SL`, `METHOD_CODE`, `LEVEL_CODE`, `ORDER_CODE`, `DEPTH_CODE` | `shared/constants/labels.ts` |

### 1.7. Парсинг графа

| Строки | Функция | Целевой модуль |
|---|---|---|
| 10425–10500 | `parseTopology()` | `server/services/graph-parser.ts` |
| 10500–10691 | `parseGraph()` | там же |
| 10502–10540 | `normalizeName()`, `normalizeType()` | `shared/utils/normalize.ts` |

### 1.8. Имена файлов

| Строки | Функция | Целевой модуль |
|---|---|---|
| 13542–13613 | `PHIL_FILENAME` | `shared/constants/phil-filename.ts` |
| 13615–13658 | `METHOD_CODE`, `LEVEL_CODE`, `transliterate()` | `shared/utils/transliterate.ts` |
| 13659–13710 | `getDocFilename()` | `server/services/export-service.ts` |

---

## 2. Адаптируемое (логика сохраняется, источник данных меняется)

### 2.1. Контекстная подсистема (DOM → БД)

| Строки | Функция | Что меняется | Целевой модуль |
|---|---|---|---|
| 7178–7353 | `buildContextForSection()` | `generated[key] = document.getElementById(...)` → `generated[key] = await db.query.sections(...)` | `server/services/context-builder.ts` |
| 6818–7135 | `extractContextFragment()` + 20 extract-функций | `el.querySelector('[data-section="..."]')` → SQL-запрос к `categories`, `theses`, `glossary_terms` | `server/services/context-extractor.ts` |
| 7355–7418 | `truncateText()`, `tableToText()` | без изменений | `server/utils/text.ts` |
| 15782–15855 | `extractIntraSectionContext()`, `extractRelevantIntraSectionContext()` | DOM → серверный HTML-парсинг (linkedom/cheerio) | `server/services/context-builder.ts` |

**Ключевое**: каждая из ~20 extract-функций (строки 6818–7135) сейчас парсит DOM. В сервисе часть из них будет читать из БД (категории, тезисы, глоссарий), часть — из `sections.html_content` через серверный DOM-парсер (для тех подразделов, которые не разбиты на элементы).

### 2.2. Сборка промптов (хардкод → Prompt Registry)

| Строки | Функция | Что меняется | Целевой модуль |
|---|---|---|---|
| 7421–7475 | `buildSYS()` | Читает шаблон `system` из Registry | `server/services/prompt-builder.ts` |
| 7478–7709 | `METHOD_SUM`, `METHOD_GRAPH`, `METHOD_TOPOLOGY`, `METHOD_GLOSSARY`, `METHOD_THESES`, `METHOD_DIALOGUE` | Каждый → шаблон `method.{method}.{section}` из Registry | там же |
| 7718–8056 | `LEVEL_COMPARATIVE_*`, `LEVEL_TRANSFORMATIVE_*`, `LEVEL_GENERATIVE_*` | → шаблоны `level.{level}.{aspect}` из Registry | там же |
| 8825–9350+ | `buildSectionDefs()` | Вместо хардкоженных строк — `registry.getTemplate(key)` | `server/services/section-defs-builder.ts` |
| 8633–8714 | `baseCtx()`, `serializeParts()` | Параметры из БД (synthesis record), а не из DOM | `server/services/prompt-builder.ts` |
| 9400–9596 | `patchPromptsWithSecCtx()`, `buildQualityReinforcement()` | Без изменений в логике | там же |

### 2.3. Стриминг (прямой SSE → двухзвенный)

| Строки | Функция | Что меняется | Целевой модуль |
|---|---|---|---|
| 10327–10420 | `streamResp()` | Разделяется: бэкенд делает SSE-запрос к Claude, парсит content_block_delta, отправляет через WebSocket | `server/services/streaming-manager.ts` |
| — | — | Клиент получает дельты через WebSocket и рендерит HTML | `client/hooks/useStreamingGeneration.ts` |

### 2.4. Каскадная перегенерация (confirm → план)

| Строки | Функция | Что меняется | Целевой модуль |
|---|---|---|---|
| 15147–15230 | `recalcEditPlan()`, `updateEditPlanUI()` | UI → React-компонент; логика пересчёта → серверная | `server/services/edit-planner.ts` + `client/components/EditPlanPanel.tsx` |
| 15232–15591 | `updateLiveCascade()` | Каскадный анализ → серверный, результат → через API | `server/services/cascade-analyzer.ts` |
| 15600–15777 | `executeEditPlan()` | confirm() → WebSocket confirm_step; последовательное исполнение на сервере | `server/services/plan-executor.ts` |
| 14881–15144 | `executeSubsectionRegen()` | Серия confirm() → предрассчитанный план с downstream-шагами | `server/services/plan-executor.ts` |
| 15878–16101 | `regenerateSection()` | DOM-манипуляции → запись в БД + WebSocket-стриминг | `server/services/generation-service.ts` |
| 16103–16321 | `regenerateSubsection()` | Аналогично | там же |

### 2.5. Экспорт (DOM → серверная генерация)

| Строки | Функция | Что меняется | Целевой модуль |
|---|---|---|---|
| 14173–14340 | `saveHTML()` | Генерация HTML из БД на сервере (шаблон + данные) | `server/services/export/html-exporter.ts` |
| 12808–13028 | `exportMMD()` | Вместо G.nodes → БД-запрос categories/edges | `server/services/export/mmd-exporter.ts` |
| 13030–13481 | `exportPNG()` | Canvas rendering на сервере (node-canvas) или генерация SVG | `server/services/export/png-exporter.ts` |
| 13483–13529 | `exportJSON()` | Из БД | `server/services/export/json-exporter.ts` |
| 13855–14003 | `buildGraphExportSection()` | Вставка в экспортируемый HTML | `server/services/export/html-exporter.ts` |
| 14006–14171 | `auditCSS()` | Оптимизация CSS для экспорта — переносится | `server/utils/css-audit.ts` |

### 2.6. Импорт

| Строки | Функция | Что меняется | Целевой модуль |
|---|---|---|---|
| 17122–17191 | `importHTML()` | Клиент загружает файл → сервер парсит → создаёт записи в БД | `server/services/import-service.ts` |
| 17196–17247 | `extractMetadata()` | Серверный DOM-парсер | там же |
| 17324–17369 | `extractSections()` | Серверный DOM-парсер | там же |
| 17374–17383 | `extractEmbeddedState()` | Без изменений | там же |
| 17501–17657 | `buildDocStateFromImport()` | Вместо DOC_STATE → создание записей в БД | там же |
| 17794–17951 | `importConceptAsParticipant()` | Чтение из БД вместо из DOM | `server/services/meta-synthesis-service.ts` |

### 2.7. Режимы

| Строки | Функция | Что меняется | Целевой модуль |
|---|---|---|---|
| 18360–18556 | `MODE_CONFIG`, `buildModeContext()` | Контекст из БД; промпт из Registry | `server/services/mode-service.ts` |
| 18839–18959 | `runMode()` | Стриминг через бэкенд + WebSocket | там же |
| 18961–19023 | `regenerateModeSilent()` | Аналогично | там же |

---

## 3. Непереносимое (заменяется React-компонентами)

| Строки | Что | Замена |
|---|---|---|
| 13–3141 | CSS (все стили) | Tailwind + CSS-модули; цветовая палитра (--gold, --ink, --parchment) → CSS-переменные |
| 3143–3930 | HTML-разметка (формы, модальные окна, layout) | React-компоненты |
| 3932–4077 | STATE (DOM-рефы, глобальные переменные) | Zustand store |
| 9600–10325 | `generateDoc()`, `go()` — DOM-оркестрация генерации | React + WebSocket hooks |
| 10700–10865 | Константы графа (TC, EC, CPAL, ROLE_REGISTRY), `showNodePanel()` | React-компоненты GraphViewer, NodePanel |
| 10865–12153 | `build3D()` — Three.js (вся 3D-логика) | `client/components/Graph3D.tsx` (React-обёртка) |
| 12156–12581 | `build2D()` — D3.js (вся 2D-логика) | `client/components/Graph2D.tsx` (React-обёртка) |
| 12582–12760 | `buildLegend()`, `switchView()`, `openGraph()`, `closeGraph()` | `client/components/GraphModal.tsx` |
| 14340–14680 | `openEditModal()`, `renderEditSections()` | `client/components/EditModal.tsx` |
| 14680–14880 | UI подразделовой перегенерации | `client/components/SubsectionRegenPanel.tsx` |
| 16325–16695 | `addSection()`, `deleteSection()`, `rebuildDbMapping()` | Серверные операции через API |
| 16955–17120 | `handleImportFile()`, `importFromUrl()`, UI импорта | `client/components/ImportPanel.tsx` |
| 17663–17783 | `syncFormFromImport()` | React state sync |
| 18177–18267 | `renderGenealogyTree()` | `client/components/GenealogyTree.tsx` |
| 18558–18698 | Mode modal UI | `client/components/ModeModal.tsx` |
| 19025–19093 | DOMContentLoaded listeners, checkbox sync | React lifecycle |
| 19095–19110 | `refreshCtxLogIfOpen()` | React state subscription |
| 19112–19350 | `formatCtxLog()` | `server/services/log-formatter.ts` (серверная) + `client/components/ContextLogViewer.tsx` |
| 19352–19800 | `colorizeLog()` | `client/utils/colorize-log.ts` (клиентская) |

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
| `server/services/element-taxonomy.ts` | Каталог типов, нечёткая нормализация, справочник для поиска/фильтрации (НОВОЕ, идея из предыдущего проекта) |
| `server/services/element-enrichment.ts` | Точечные Claude-запросы для обогащения элементов (НОВОЕ, идея из предыдущего проекта) |
| `server/routes/taxonomy.ts` | API каталогов типов (НОВОЕ) |
| `server/routes/enrichment.ts` | API обогащения элементов (НОВОЕ) |
| `scripts/seed-taxonomy.ts` | Начальное заполнение каталогов (18 типов категорий + 29 типов связей) (НОВОЕ) |
| `client/components/edit/CharacteristicSlider.tsx` | Слайдер характеристики + кнопка «Обоснование» (НОВОЕ) |
| `client/components/edit/EnrichmentPanel.tsx` | Панель результатов обогащения элемента (НОВОЕ) |
| `client/components/edit/TaxonomySelector.tsx` | Выбор типа из каталога при нормализации (НОВОЕ) |
| `server/services/representation-transformer.ts` | Трансформация graph↔theses: прямая конверсия представлений (НОВОЕ, идея из предыдущего проекта) |
| `server/routes/transforms.ts` | API трансформаций + история + откат (НОВОЕ) |
| `client/components/edit/TransformPanel.tsx` | UI: кнопки трансформации, превью, история, откат (НОВОЕ) |
| `client/hooks/useWebSocket.ts` | WebSocket-hook с reconnect |

---

## 5. Сводная статистика

| Категория | Строки исходника | % от общего | Трудоёмкость портирования |
|---|---|---|---|
| Переносимое | ~4500 | 23% | Низкая (copy + TypeScript типы) |
| Адаптируемое | ~5500 | 28% | Средняя (замена DOM на БД/API) |
| Непереносимое | ~9000 | 45% | React-компоненты (переписать) |
| Только CSS/HTML | ~6000 | 30% | Tailwind + дизайн-система |
| Новое | — | — | Высокая (auth, billing, WS, API) |
