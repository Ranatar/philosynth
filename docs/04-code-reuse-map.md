# PhiloSynth Service — Карта переиспользования кода

> **Правка 2026-08-04 (сверка адресов)**: адреса приведены к фактическому размещению по итогам машинной сверки
> `scripts/check-map-04.py` — она проверяет, объявлен ли каждый
> идентификатор карты в названном ею модуле. Исправлены: `sourceOf`,
> `buildSubsectionMap`, коды `METHOD_CODE`/`LEVEL_CODE`/`ORDER_CODE`/
> `DEPTH_CODE`, `MODE_DEPS`, палитры графа (компонента `GraphViewer` не
> создавалась), `buildLegend`, `updateSectionWarnings` (переименован в
> `computeSectionAdvice`), `updateCompatAdvisor` (не портирован — долг
> беседы 3.2). Все случаи — из уже закрытых бесед: код на месте,
> неверен был только адрес.
>
> **Ревизия 2026-07-29 (беседа 1.5)**: клиентская форма/прогресс;
> эндпоинты /syntheses/estimate и /syntheses/advice; код
> NO_PARTICIPANTS_SEED_REQUIRED в POST /syntheses.
> **Ревизия 2026-07-22**: карта актуализирована по исходнику 26 024 стр.
> Спецификации подсистем v11 — 01-architecture, §4.12–4.15.
>
> **Правка 2026-07-28 (итоги 1.4b)**: строка Pause/Resume дополнена
> фактическим размещением портов (serializeSubsectionRegen →
> section-defs-builder; врезка подраздела → utils/html-parser) и
> квирком [25358].
>
> **Правка 2026-07-27 (итоги 1.2)**: в §2.2 `serializeParts` вынесен в
> отдельную строку с целевым модулем `section-defs-builder.ts`
> (фактическое размещение: функция сериализует parts, которые строит
> `buildSectionDefs`).


## Обзор

Исходный файл: `philosynth.html` (26 024 строки, ревизия 2026-07).
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
| `CONTEXT_DEPS_LEVEL`, `CONTEXT_DEPS_LEVEL_GENETIC` (бывш. LEVEL_DEPS_PATCH) | там же |
| `CONTEXT_DEPS_METHOD` (бывш. METHOD_DEPS_PATCH; применяется и к генетическому порядку) | там же |
| `CTX_LABELS` (ALL_CTX_KEYS удалён из исходника; перечень ключей выводится из CTX_LABELS) | `shared/constants/ctx-keys.ts` |
| `resolveContextDeps()` | `server/services/synthesis-engine.ts` |
| `deepMergeUniq()` | `server/utils/deep-merge.ts` |
| `SUBSTITUTION_MAP` (architectural) | `server/config/substitution-map.ts` (→ БД) |
| `SUBSTITUTION_MAP_GENETIC` | там же |
| `findSubstitute()`, `getSubstituteQuality()`, `getActiveSubstitutionMap()` | `server/services/synthesis-engine.ts` |
| `buildEffectiveDeps()` | там же |
| `computePredecessors()` | `server/utils/topo-sort.ts` |
| `buildDynamicOrder()` (topologicalSort инлайнен внутрь, алгоритм Кана) | там же |
| `resolveCircularDeps()` — итеративный разрыв циклов по слабейшему ребру: `findOneCycle()`, `getEdgeQuality()`, `removeEdge()`, `dfs()` | там же |
| `computeDependents()`, `getIntraDependents()`, `getCrossSecDependents()`, `getAffectedModes()`, `sortInTopoOrder()`, `buildFactualDepsMap()`, `computeFactualDependents()`, `buildCtxKeyConsumers()` (гранулярный каскад: ключ → подразделы-потребители), `canonicalSubsectionKey()` (каноникализация портретных заголовков) | `server/services/cascade-analyzer.ts` |
| `sourceOf()` — ФАКТ (беседа 1.1): вынесен в utils-слой, cascade-analyzer импортирует оттуда | `server/utils/topo-sort.ts` |
| `buildSubsectionMap()` — ФАКТ (беседа 1.2): строится из конфига `subsection_map` рядом с определениями разделов | `server/services/section-defs-builder.ts` |

### 1.2. Матрица совместимости

| Функция / объект | Целевой модуль |
|---|---|
| `COMPAT_MATRIX_COMPACT`, `COMPAT_SEC_LABELS` (COMPAT_KEYS удалён) | `server/config/compat-matrix.ts` (→ БД) |
| `computeSectionRating()` | `server/services/compat-advisor.ts` |
| Advisor v2 (заменил computeMethodRating/computeOverallCompat/getCompatAdvice — их больше нет): `getCompatEntry()`, `getCompatEntryByKey()` (entry-модель `level:method` с severity), `iconForSeverity()`, `titleForSeverity()`, `chipClassForRating()` | `server/services/compat-advisor.ts` + `client/components/synthesis/CompatAdvisor.tsx` и `SectionWarnings.tsx` (боксы ⚠/💡/⇄; данные — POST /syntheses/advice, беседа 1.5); `applyReplacement()` [7365] / `updateCompatAdvisor()` [7499] / `toggleCompatPanel()` — ПОРТИРОВАНЫ 3.2 в `client/components/synthesis/CompatAdvisor.tsx`: кнопки замен («СОХРАНИТЬ УРОВЕНЬ → ЗАМЕНИТЬ МЕТОД» / наоборот), блок orderAdvice, автораскрытие при conflict; onApplyReplacement — React-аналог цепочки перерисовки (пересчёт через deps эффектов формы) |
| Section Dependency Warnings (живые предупреждения/рекомендации/подстановки в форме): `computeSectionWarnings()`, `updateSectionWarnings()` → на сервере назван `computeSectionAdvice()` (ФАКТ, беседа 1.1: возвращает структуры `{icon,text,severity}` вместо правки DOM — под прежним именем в коде не искать) | там же + `client/components/synthesis/SectionWarnings.tsx` |

### 1.3. Оценка стоимости

| Функция / объект | Целевой модуль |
|---|---|
| `estimateCost()` | `server/services/cost-estimator.ts` |
| `estimateSubsectionCost()`, `estimateModeCost()` | там же (беседа 1.1) |
| `estimateCascadeWaveCost()`, `formatWaveCost()` | там же — ФАКТ: портированы беседой 2.1 (потребовали каскадного анализа; потребитель — estimatePlanCost) |

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
| `STATE` (списки философов — 106 позиций (+36 в v10), ML, SL, DL и т.д.) | `shared/constants/philosophers.ts` (106, сверено в беседе 0.1), `shared/constants/labels.ts` |
| `_EXTRA_CATEGORY_TYPES`, `_EXTRA_EDGE_TYPES`, `_SYNTH_LEVEL_TYPE_PHRASING`, `_buildExtraTypesBlock()` | `server/config/extra-types.ts` (→ БД) (v10) |
| `KEY_LABELS`, `SECTION_LABELS` | `shared/constants/section-labels.ts` |
| `REVERSE_ML`, `REVERSE_DL`, `REVERSE_SL` | `shared/constants/labels.ts` |
| `METHOD_CODE`, `LEVEL_CODE`, `ORDER_CODE`, `DEPTH_CODE` (односимвольные коды для имени файла; DEPTH — цифры, ORDER — заглавные) — ФАКТ (беседа 0.1) | `shared/constants/methods.ts` |

### 1.7. Парсинг графа

| Функция | Целевой модуль |
|---|---|
| `parseTopology()` | `server/services/graph-parser.ts` |
| `parseGraph()` | там же |
| `_rebuildNodeColors()`, `_rebuildEdgeStyles()` | `client/components/graph/graph-utils.ts` (v10) |
| `showEdgePanel()` | `client/components/graph/EdgePanel.tsx` (v10) |
| `getStructuralMarkers()` (массив маркеров) | `client/components/graph/graph-utils.ts` (v10) |
| `clearLegendFilter()`, `legendFilter` | `client/components/graph/GraphModal.tsx` (v10) |
| `normalizeName()`, `normalizeType()` | `shared/utils/normalize.ts` |

### 1.8. Имена файлов

| Функция | Целевой модуль |
|---|---|
| `PHIL_FILENAME` | `shared/constants/phil-filename.ts` |
| `transliterate()` | `shared/utils/transliterate.ts` |
| `METHOD_CODE`, `LEVEL_CODE` (используются при сборке имени файла) — ФАКТ (беседа 0.1) | `shared/constants/methods.ts` |
| `getDocFilename()` | `server/services/export/filename.ts` |

---

### 1.9. Кардинальность участников и свободный синтез (спец.: 01 §4.14)

| Функция / объект | Целевой модуль сервиса |
|---|---|
| `participantCardinality()`, `participantWord()`, `participantWordSg()`, `hasConceptParticipants()` | `shared/utils/cardinality.ts` |
| `MD_BY_CARD` (6 методов × none/single/multi), `SD_BY_CARD` (3 уровня × 3) | `server/config/cardinality-prompts.ts` (→ БД) |
| `SUBSECTION_SUM_PORTRAIT()`, `_SUM_PORTRAIT_VARIANTS` | `server/services/section-defs-builder.ts` |
| `participantsForPrompt()` (плейсхолдер `[свободный синтез: …]`) | `server/services/prompt-builder.ts` |

### 1.10. Родительский контекст и бюджет (спец.: 01 §4.13)

| Функция / объект | Целевой модуль сервиса |
|---|---|
| `PARENT_FIELD_ORDER`, `PARENT_FIELD_LABELS`, `PARENT_DEPS_BASE/GENETIC/LEVEL/LEVEL_GENETIC/METHOD`, `PARENT_INTRA_DEPS`, `PARENT_CONTEXT_SCHEMA_ID/VERSION` | `server/config/parent-deps.ts` (→ БД) |
| `resolveParentDeps()`, `resolveParentDepsForSubsection()`, `parentFieldsUsedFor()`, `buildParentSpecForLog()` | `server/services/parent-context.ts` |
| `applyBudgetPressure()` (пол 40%), `parentOverheadForSection()`, `computeConceptOverhead()` | `server/services/context-builder.ts` |
| `conceptContextBlockFull()`, `conceptContextBlockSelective()` | `server/services/meta-synthesis-service.ts` |
| `checkGenealogyOverlaps()`, `collectPhilosopherAncestors()`, `isAncestor()` | `server/services/meta-synthesis-service.ts` (3.1; АДАПТАЦИЯ: предки — рекурсивный CTE по `synthesis_lineage`, в исходнике — обход объекта genealogy; тексты предупреждений 1:1) + КЛИЕНТСКАЯ копия первых двух — `client/utils/genealogy.ts` (3.2; обход объекта как в исходнике — для файловых концепций пула; тождественность текстов клиент↔сервер сторожит integration-check 4w) |

### 1.11. Зависимости режимов

| Функция / объект | Целевой модуль сервиса |
|---|---|
| `getEffectiveModeDeps()` | `server/services/mode-service.ts` (→ БД, беседа 4.1) |
| `MODE_DEPS` — ФАКТ: посеян раньше владельца, лежит отдельным конфигом | `server/config/mode-deps.ts` |

## 2. Адаптируемое (логика сохраняется, источник данных меняется)

### 2.1. Контекстная подсистема (DOM → БД)

| Функция | Что меняется | Целевой модуль |
|---|---|---|
| `buildContextForSection()` | DOM → БД; плюс новое бюджетирование: `parentOverheadForSection()` + `applyBudgetPressure()`, запись parentSpec в ctxLog | `server/services/context-builder.ts` |
| `extractContextFragment()` + 20 extract-функций | `el.querySelector('[data-section="..."]')` → SQL-запрос к `categories`, `theses`, `glossary_terms` | `server/services/context-extractor.ts` |
| `truncateText()`, `tableToText()` | без изменений | `server/utils/text.ts` |
| `extractRelevantIntraSectionContext()` | DOM → серверный HTML-парсинг (linkedom); INTRA_DEPS из Registry; `canonicalSubsectionKey` принимается колбэком до беседы 2.1 | `server/services/context-builder.ts` |
| `extractIntraSectionContext()` | Реализация живёт в DOM-слое рядом с прочими extract*(); из `context-builder` реэкспортируется — соответствие карте без дублирования кода | `server/services/context-extractor.ts` |
| `getSectionContextQuality()` | ctxLog из context_log (БД); бейдж качества на карточке раздела | `server/services/context-quality.ts` + `client/components/edit/EditSectionCard.tsx` |

**Ключевое**: каждая из ~20 extract-функций сейчас парсит DOM. В сервисе часть из них будет читать из БД (категории, тезисы, глоссарий), часть — из `sections.html_content` через серверный DOM-парсер (для тех подразделов, которые не разбиты на элементы).

### 2.2. Сборка промптов (хардкод → Prompt Registry)

| Функция | Что меняется | Целевой модуль |
|---|---|---|
| `buildSYS(p, opts)` | Читает шаблон `system` из Registry; сигнатура получила `opts` | `server/services/prompt-builder.ts` |
| `METHOD_SUM` … `METHOD_DIALOGUE` | Каждый → шаблон `method.{method}.{section}` из Registry | там же |
| `LEVEL_COMPARATIVE_*` … `LEVEL_GENERATIVE_*` | → шаблоны `level.{level}.{aspect}` из Registry | там же |
| `buildSectionDefs()` | Вместо хардкоженных строк — `registry.getTemplate(key)`; ветвление по `participantCardinality()` (MD_BY_CARD/SD_BY_CARD) — схема ключей Registry должна учитывать кардинальность | `server/services/section-defs-builder.ts` |
| `baseCtx(p, sectionKey)` = `baseCtxStatic()` + `baseCtxParents()` | Параметры из БД; родительский контекст стал пер-секционным | `server/services/prompt-builder.ts` |
| `serializeParts(parts)` | Без изменений в логике; живёт рядом с `buildSectionDefs`, чьи parts сериализует | `server/services/section-defs-builder.ts` |
| `patchPromptsWithSecCtx()`, `buildQualityReinforcement()` | Без изменений в логике | там же |

### 2.3. Стриминг (прямой SSE → двухзвенный)

| Функция | Что меняется | Целевой модуль |
|---|---|---|
| `streamResp()` → `_streamRespOnce()` | В исходнике streamResp — retry-обёртка (ретраится только kind=pre-stream; задержки 1с/3с/8с; _STREAM_STUCK_MS=45с) над `_streamRespOnce` с таксономией ошибок kind: auth/billing/pre-stream/max-tokens/partial/stuck/user-abort. Бэкенд повторяет эту модель: одна попытка + классификация → WebSocket | `server/services/streaming-manager.ts` |
| `_classifyStreamError()`, `_pauseFriendlyMessage()` | Классификация обрыва и человекочитаемая причина паузы (v11) | `server/services/streaming-manager.ts` |
| `parseSubsectionsFromHTML()`, `_augmentGenEntry()` (metadata генлога), `computeFullConceptBlockSizes()`, `buildParentSpecBySection()` | Трекинг подразделов в потоке; расширение записей generation_log | `server/services/generation-service.ts` |
| Извлечение тезисов/глоссария в гранулярные таблицы | Прародителей в исходнике НЕТ (там только компактные extract* для контекста) — парсеры построены по структурам таблиц из промптов Registry (беседа 1.4) | `server/services/element-parser.ts` |
| — | Клиент получает дельты через WebSocket и рендерит HTML | `client/hooks/useStreamingGeneration.ts` |

### 2.4. Каскадная перегенерация (confirm → план)

| Функция | Что меняется | Целевой модуль |
|---|---|---|
| `recalcEditPlan()`, `updateEditPlanUI()` | UI → React-компонент; логика пересчёта → серверная | `server/services/edit-planner.ts` + `client/components/EditPlanPanel.tsx` |
| `updateLiveCascade()` | Каскадный анализ → серверный, результат → через API — ФАКТ (2.3): транспорт = read-only POST /plans/impact (03 §2.6), отрисовка E1–E5 1:1 — `client/components/edit/CascadePanel.tsx`, запрос с debounce 400мс — EditModal | `server/services/cascade-analyzer.ts` + `client/components/edit/CascadePanel.tsx` |
| `executeEditPlan()` | confirm() → WebSocket confirm_step; последовательное исполнение на сервере; при обрыве — pausedState kind="plan" → `resumePlan()` | `server/services/plan-executor.ts` |
| `executeSubsectionRegen()` | Серия confirm() → предрассчитанный план с downstream-шагами | `server/services/plan-executor.ts` |
| `regenerateSection()` | DOM-манипуляции → запись в БД + WebSocket-стриминг | `server/services/generation-service.ts` |
| Pause/Resume (спец.: 01 §4.12): `resumeGeneration()`, `_resumeFromSubsection()`, `_runGenPassesFromIdx()`, `_computeGenPauseEstimates()`, `_logPauseEvent()`, `_finalizeAfterStop_gen()`, `_continueAfterFilledSubs()`, `resumePlan()`, `showPauseModal()` + 4 рендерера + `_fmtCost()` | pausedState → персистентное хранение; модалка → React (управляется пропсами); действия fill-missing-subs/retry/skip/stop с оценками стоимости; `_runGenPassesFromIdx` — общий цикл `runGenerationPasses({startIdx, source})` в generation-service. Квирк исходника (1.4b): fallback «нет parts» [25358] зовёт `resumeGeneration('retry')` ПОСЛЕ `_clearPausedState()` — мёртвый путь; в порте retry-ветка инлайнится | `server/services/pause-resume-service.ts` + `client/components/synthesis/PauseModal.tsx` |
| `serializeSubsectionRegen()` [10654], `extractPreambleConstraints()` [10727] (промпт перегенерации/доработки/продолжения ОДНОГО подраздела) | порт 1:1; живут рядом с `serializeParts` (§2.2) — сериализуют parts, которые строит `buildSectionDefs`; потребители: pause-resume-service (1.4b), regeneration/plan-executor (2.2) | `server/services/section-defs-builder.ts` |
| DOM-механика замены подраздела из `regenerateSubsection` [20384–20444] (replaceWith/append, нечёткий поиск) | порт на строках html_content: `spliceSubsectionHtml()` / `removeSubsectionHtml()`; изоляция linkedom сохраняется | `server/utils/html-parser.ts` |
| `updateDocTitleFromName()` | Авто-заголовок из раздела «name» → PATCH syntheses.title после section_done. ЛАТЕНТНЫЙ БАГ исходника [11886]: классы \w в регекспе префиксов не матчат кириллицу в JS — срезание префиксов было мёртвым кодом; порт (беседа 1.4) несёт задокументированный FIX \w → [а-яё] | `server/services/generation-service.ts` |
| `_autoAddCurrentDocToPool()` | Свежий синтез автоматически предлагается участником мета-синтеза | `client/components/pool/ConceptPool.tsx` |
| `regenerateSubsection()` | Аналогично | там же |

### 2.5. Экспорт (DOM → серверная генерация)

| Функция | Что меняется | Целевой модуль |
|---|---|---|
| `saveHTML()` | Генерация HTML из БД на сервере (шаблон + данные) | `server/services/export/html-exporter.ts` |
| `exportMMD()` | Вместо G.nodes → БД-запрос categories/edges | `server/services/export/mmd-exporter.ts` |
| `exportPNG()` | Canvas rendering на сервере (node-canvas) или генерация SVG | `server/services/export/png-exporter.ts` |
| `exportJSON()` | Из БД | `server/services/export/json-exporter.ts` |
| `saveMD()` + `node2md()`, `sec2md()`, `table2md()`, `inline2md()`, `sig2md()` | Markdown-экспорт УЖЕ реализован в исходнике (в 03/06 ошибочно числится «Фаза 2, новое») | `server/services/export/md-exporter.ts` |
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
| `importConceptAsParticipant()` | Чтение из БД вместо из DOM | `server/services/meta-synthesis-service.ts` (3.1); клиентский порт файлового сценария 1:1 — `client/utils/concept-file.ts` (1.5b; с 3.2 participant.genealogy ЗАПОЛНЯЕТСЯ — reconstructGenealogy + restoreCapsulesFromHTML из `client/utils/genealogy.ts`) |
| `reconstructGenealogy()` [22181], `restoreCapsulesFromHTML()` [11745] | Реконструкция генеалогии участника из meta/embeddedState + восстановление капсул родителей из `.gen-card` сохранённого дерева файла | `client/utils/genealogy.ts` (3.2; долги §12 закрыты) |
| `stripCapsulesFromGenealogy()` [22321] | Очистка капсул перед сохранением | `client/utils/genealogy.ts` (3.2; потребитель — экспорт 4.2) |
| `normalizeGenealogyNames()`, `isPlaceholderConceptName()`, `resolveConceptName()` | Санация имён генеалогии («[безымянная концепция]») — без изменений | `client/utils/genealogy.ts` (3.2; resolveConceptName несёт FIX `\w`→`[а-яё]` — латентный баг регекспа префиксов исходника, та же грабля, что чинилась 1.4 в updateDocTitleFromName) + `server/services/import-service.ts` (серверная копия — беседа 4.3) |
| `genCommon.conceptBlockSizes` | Размеры контекстных блоков концепций (v10, для реконструкции промптов) | `server/services/generation-service.ts` |
| `buildPromptSkeleton()` | Скелет промпта пишется в genLog при генерации (реконструкция — fallback только для импортов) | `server/services/generation-service.ts` |

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
| `generateDoc()`, `_runGenPassesFromIdx()` (бывш. go(); единый цикл штатной генерации и возобновления) — DOM-оркестрация | React + WebSocket hooks; серверная оркестрация — generation-service |
| Динамические палитры (`_nodeColorMap`, `_edgeStyleMap`, `_TC_HUE_SEEDS`, `_EC_HUE_SEEDS`, `_EC_DASH_SEEDS`, `CPAL`), `showNodePanel()`, `showEdgePanel()` | ФАКТ (беседа 1.7): палитры и сиды оттенков — `client/components/graph/graph-utils.ts`; представления — `Graph3D.tsx` и `Graph2D.tsx` (компонента `GraphViewer` не создавалась); панели — `NodePanel.tsx`, `EdgePanel.tsx` |
| `build3D()` — Three.js (вся 3D-логика) | `client/components/graph/Graph3D.tsx` (React-обёртка) |
| `build2D()` — D3.js (вся 2D-логика) | `client/components/graph/Graph2D.tsx` (React-обёртка) |
| `switchView()`, `openGraph()`, `closeGraph()` | `client/components/graph/GraphModal.tsx` |
| `buildLegend()` — ФАКТ (беседа 1.7): вынесен в отдельный компонент | `client/components/graph/GraphLegend.tsx` |
| `clearLegendFilter()` — ФАКТ (беседа 1.7): живёт рядом с состоянием графа | `client/components/graph/graph-utils.ts` |
| `openEditModal()`, `renderEditSections()` | `client/components/edit/EditModal.tsx` + `EditSectionCard.tsx`/`AddSectionPanel.tsx`/`EditPlanPanel.tsx` — ФАКТ (2.3): двухшаговый workflow §4.5 («Составить план» → просмотр → «Исполнить») вместо цепочки confirm(); карточка «Структура устарела» — сравнение structureSections↔sectionOrder на клиенте; гейты API_KEY/incomplete не переносятся (6.1/4.3); карточки результатов режимов — TODO(4.1) |
| UI подразделовой перегенерации | `client/components/edit/SubsectionRegenPanel.tsx` — ФАКТ (2.3): зависимые/оценка — превью POST /subsection-impact; каскад = чекбоксы волны (intra+cross) + ОЧЕРЕДЬ последовательных запусков по section_done (stream_error останавливает); капсула-квирк «подраздел капсулы → весь раздел» сохранён; «третья волна» и каскад режимов не переносятся (повторного превью после волны нет; режимы — 4.1) |
| `addSection()`, `deleteSection()`, `rebuildDbMapping()` | Серверные операции через API — ФАКТ (2.2): add/delete только через планы (§2.6), в §2.5 их эндпоинтов нет; `rebuildDbMapping` ВЫРОЖДЕН (db-индексы DOM → строки sections; перенумерация = `recalcSectionNumbers` + `renumberSectionRefs`) |
| `parseConceptFile()`, `addToPool()`, `removeFromPool()`, `selectForViewing()`, `snapshotCurrentState()`, `restoreFromPoolSnapshot()`, `syncConceptParticipants()`, `refreshPoolParticipant()`, `renderPoolConcepts()`, `handlePoolFileImport()`, `handlePoolUrlImport()` | `client/components/pool/ConceptPool.tsx`+`PoolCard.tsx`, `client/stores/pool-store.ts`, `client/utils/concept-file.ts` (беседа 1.5b ✓; snapshotCurrentState/restoreFromPoolSnapshot вырождены — локальных правок в сервисе нет, refreshPoolParticipant по ветке «rawHTML не менялся»; renamePoolConcept/toggleSynthParticipant/setPoolStatus там же) |
| `buildTableOfContents()` [11621] — якоря `#sec-{key}` / `#subsec-{key}-{slug}`, кнопки ⏫, пропуск `capsule` | `client/components/document/TableOfContents.tsx` (беседа 1.6b) |
| `makeHeaderDisclosure()` / `buildDocHeaderExtras()` [11599/11613], заполнение шапки [12110–12144] (docNum, дата, ML/DL/SL, три ветки подзаголовка) | `client/components/document/DocumentHeader.tsx` (1.6b); docNum генерирует сервер в беседе 1.6 |
| `updateCapsuleInHeader()` [11773] + `removeCapsuleFromDocBodies()` [11822] — капсула живёт в шапке, а не среди тел | `DocumentHeader.tsx` + исключение ключа `capsule` в `DocumentView.tsx` (1.6b) |
| `updateFooterCost()` [5671] — «Токены: … · Стоимость: $X.XXXX (N¢)» | `client/components/document/DocumentFooter.tsx` (1.6b); значение берётся из `syntheses.total_cost_usd`, НЕ пересчитывается по ставкам |
| CSS документа [476–929, 3304–3319]: `.doc-header`, `#docTOC`, `.doc-section`, `.doc-content`, `.doc-table`, `.callout*`, `.risk*`, `.doc-footer` | `client/src/globals.css` (1.6b) — обязательны для рендера html_content через dangerouslySetInnerHTML |
| graph-STATE [4389–4413]: `G`, `roleMode`, `legendFilter`, `clusterVisible`, `clearLegendFilter()` | `client/components/graph/graph-utils.ts` (1.7) — лежит ВНЕ основного фрагмента 1.7-graph-viz.js |
| `syncFormFromImport()` | React state sync |
| `renderGenealogyTree()` | `client/components/lineage/GenealogyTree.tsx` (3.2; визуальный референс → React; АДАПТАЦИИ: узлы из GET /lineage/ancestors не несут method/seed/capsule — мета-строка опускается, узлы с synthesisId — ссылки на /synthesis/:id; CSS `.gen-*` в globals.css дословно, включая @media ≤500px и .gen-tree-light) |
| Mode modal UI | `client/components/ModeModal.tsx` |
| DOMContentLoaded listeners, checkbox sync | React lifecycle |
| `refreshCtxLogIfOpen()` | React state subscription |
| `formatCtxLog()` | `server/services/log-formatter.ts` (серверная) + `client/components/logs/ContextLogViewer.tsx`; адаптация 2.4: `formatCtxLogHTML` исходника [24090] возвращал только html — форма `{ text, html }` задана 03 §2.12 |
| `colorizeLog()` | `packages/shared/utils/colorize-log.ts` (единая: нужна серверу для `/logs/formatted` и клиенту) + `client/components/logs/colorize-log.ts` (тонкий реэкспорт; 2.4) |

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
| `server/utils/html-parser.ts` | Обёртка над linkedom: `parseFragment` (контейнер-аналог `generated[key]`) + `innerText` — ПРИБЛИЖЕНИЕ браузерного innerText (linkedom даёт свой ≈ textContent). Единственная точка входа linkedom (беседа 1.3) |
| `server/services/plan-order-builder.ts` | `buildPlanOrder()` — единый топологический порядок add+regen (v10) |
| Константа `STOP_SIGNAL` | Стоп-инструкция в конце каждого промпта раздела (v10) |
| `server/services/structure-tracker.ts` | `refreshSumDef()`, `regenStructureFromEditModal()`, отслеживание `structureSections` (v10) — ФАКТ (2.2): `refreshSumDef` упрощён (defs на сервере не персистятся и строятся заново из section_order); `regenStructureFromEditModal` — UI-половина (2.3), серверная часть = `startSubsectionRegeneration("sum", «Структура документа»)` |
| `server/services/prompt-reconstruction.ts` | `reconstructBaseCtxSkeleton()`, `reconstructCtxMarkers()`, `reconstructSectionTask()`, `reconstructSkeleton()` (v10) |
| `_EXTRA_CATEGORY_TYPES`, `_EXTRA_EDGE_TYPES`, `_buildExtraTypesBlock()` | Расширенные типы по методу/уровню (v10) |

---

## 5. Сводная статистика

> Оценки ниже — для ревизии 19 810 строк. Актуальная ревизия: 26 024
> (+~6 200: Pause/Resume ~1 500, PARENT_DEPS+бюджет ~650, кардинальные
> словари, предупреждения зависимостей, расширения граф-модалки).
> Пропорции категорий сохраняются приблизительно; точный пересчёт — при
> следующей ревизии карты.

| Категория | Строк исходника (≈) | % от общего | Трудоёмкость портирования |
|---|---|---|---|
| Переносимое | ~4500 | 23% | Низкая (copy + TypeScript типы) |
| Адаптируемое | ~5500 | 28% | Средняя (замена DOM на БД/API) |
| Непереносимое | ~9000 | 45% | React-компоненты (переписать) |
| Только CSS/HTML | ~6000 | 30% | Tailwind + дизайн-система |
| Новое | — | — | Высокая (auth, billing, WS, API) |
