#!/usr/bin/env python3
"""Правки документации по итогам беседы 4.2 (Export Service).

Идемпотентный apply/skip-скрипт (образец conv41):
 - patch(): замена old → new; повторный прогон видит marker → skip.

Запуск из корня репо: python3 scripts/patch-docs-conv42.py
"""
from __future__ import annotations

import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
applied: list[str] = []
skipped: list[str] = []
failed: list[str] = []


def read(rel: str) -> str:
    return io.open(os.path.join(ROOT, rel), encoding="utf-8").read()


def write(rel: str, s: str) -> None:
    io.open(os.path.join(ROOT, rel), "w", encoding="utf-8").write(s)


def patch(name: str, rel: str, old: str, new: str,
          marker: str | None = None, optional: bool = False) -> None:
    s = read(rel)
    mk = marker if marker is not None else new
    if mk in s:
        skipped.append(name)
        return
    if old not in s:
        (skipped if optional else failed).append(
            name + ("" if optional else f": якорь не найден в {rel}"))
        return
    if s.count(old) != 1:
        failed.append(name + f": якорь неоднозначен в {rel} ({s.count(old)})")
        return
    write(rel, s.replace(old, new))
    applied.append(name)


P7 = "docs/07-conversation-protocol.md"
P4 = "docs/04-code-reuse-map.md"
SPEC = "docs/fragments-for-conversations/4.2-export-service.spec"
GEN = "packages/shared/types/generation.ts"

# ── 07: шапка — запись правок 2026-08-29 ────────────────────────────
patch("07-журнал-4.2", P7,
      "# PhiloSynth Service — Протокол бесед\n\n"
      "> **Правки 2026-08-28 (итоги беседы 4.1)**",
      "# PhiloSynth Service — Протокол бесед\n\n"
      "> **Правки 2026-08-29 (итоги беседы 4.2)**: Export Service закрыт\n"
      "> (запрос 1 + тесты 2–6 tests/test-42-requests2-6.mjs 76 ✓ ×2; тест 4\n"
      "> протокола — roundtrip — исполняет беседа 4.3 первым тестом, инверсия\n"
      "> помечена по месту). Дыры, закрытые этим патчем: первый запрос 4.2 не\n"
      "> содержал md-exporter/filename/GET /export/md (роутов пять, не четыре);\n"
      "> пп. 4d/4g/5b не оговаривали серверные адаптации (ассеты вместо\n"
      "> fn.toString, предвычисленный лог, renderTemplate вместо\n"
      "> config.buildPrompt); «Контекст» дополнен фактическим входным\n"
      "> комплектом; квирк truncLabel переформулирован (\"\\u2026\" — валидный\n"
      "> литерал); графу §11 добавлены рёбра 4.2; оба долга §12 за 4.2\n"
      "> вычеркнуты как ЗАКРЫТЫЕ.\n"
      ">\n"
      "> **Правки 2026-08-28 (итоги беседы 4.1)**",
      marker="Правки 2026-08-29 (итоги беседы 4.2)")

# ── 07: «Контекст» беседы 4.2 — фактический входной комплект ────────
patch("07-контекст-4.2", P7,
      "- `04-code-reuse-map.md` (секция 2.5 — экспорт)\n"
      "- Из предыдущих бесед: `server/db/schema.ts`, `server/services/graph-parser.ts` (из 1.4)\n"
      "- Исходник: exportMMD … auditCSS (весь экспорт) + reconstructBaseCtxSkeleton … reconstructSkeleton (реконструкция промптов)",
      "- `04-code-reuse-map.md` (секция 2.5 — экспорт)\n"
      "- Из предыдущих бесед: `server/db/schema.ts`, `server/services/graph-parser.ts` (из 1.4)\n"
      "- ФАКТ (4.2) — дополнительно потребовались: `server/services/mode-service.ts` (MODE_CONFIG для секции режимов и реконструкции), `server/services/log-formatter.ts` (снятие TODO(4.2) + предвычисление видимого лога), `server/services/section-defs-builder.ts` и `prompt-builder.ts` (reconstructSectionTask), `server/services/generation-service.ts` (buildParams/genCommon), клиентские `graph-utils.ts`/`Graph*.tsx` 1.7 (двойники graph-style/graph-physics — дрейф сторожит integration-check 4y) и `DocumentHeader.tsx` 1.6b (двойник шапки)\n"
      "- Исходник: exportMMD … auditCSS (весь экспорт) + reconstructBaseCtxSkeleton … reconstructSkeleton (реконструкция промптов) + getDocFilename [17477] + saveMD/node2md/sec2md/table2md/inline2md/sig2md (Markdown-экспорт)",
      marker="ФАКТ (4.2) — дополнительно потребовались")

# ── 07: пп. 3b/3c (md-exporter, filename) ───────────────────────────
patch("07-3b-3c-md-filename", P7,
      "4. server/services/export/html-exporter.ts:",
      "3b. server/services/export/md-exporter.ts — ФАКТ (4.2), в запросе отсутствовал:\n"
      "   - exportMD(synthesisId): порт saveMD() + sec2md/node2md/inline2md/\n"
      "     table2md/sig2md через html-parser (linkedom изолирован).\n"
      "     Требует каркаса .section-num/.section-title/.doc-content\n"
      "     в html_content (реальный вывод модели его несёт по сис-промпту;\n"
      "     моки без каркаса дают пустой MD — грабля тестов 2.3/4.1).\n\n"
      "3c. server/services/export/filename.ts — ФАКТ (4.2):\n"
      "   - getDocFilename [17477] из params БД; КВИРК: paramCode\n"
      "     склеивается join(\"\") без дефисов — пример «hm-t-2» в комментарии\n"
      "     исходника устарел. Общее: common.ts (ExportError NOT_FOUND/NO_GRAPH\n"
      "     «Нет графа.», loadExportSynthesis, exportFilename).\n\n"
      "4. server/services/export/html-exporter.ts:",
      marker="3b. server/services/export/md-exporter.ts")

# ── 07: пометка к 4d ────────────────────────────────────────────────
patch("07-4d-ассеты", P7,
      "     d. Встраивает graph section (buildGraphExportSection, buildGraphExportSection()):\n"
      "        Three.js + D3.js CDN ссылки, сериализованные функции графа,\n"
      "        клонированное модальное окно",
      "     d. Встраивает graph section (buildGraphExportSection, buildGraphExportSection()):\n"
      "        Three.js + D3.js CDN ссылки, сериализованные функции графа,\n"
      "        клонированное модальное окно\n"
      "        [ФАКТ 4.2: fn.toString()/клонирование DOM на сервере неисполнимы —\n"
      "        скрипты и оверлеи берутся из статических бандлов\n"
      "        server/config/export-assets.ts, генерат npm run\n"
      "        extract:export-assets из исходника: fnBundle 46 функций,\n"
      "        constBundle 6, gm/mode-оверлеи (минус .mode-modal-params), rawCSS;\n"
      "        initScript [17773-17828] дословно]",
      marker="[ФАКТ 4.2: fn.toString()/клонирование DOM на сервере неисполнимы")

# ── 07: пометка к 4g ────────────────────────────────────────────────
patch("07-4g-лог", P7,
      "     g. Встраивает лог контекста (details + script)",
      "     g. Встраивает лог контекста (details + script)\n"
      "        [ФАКТ 4.2: видимый лог ПРЕДВЫЧИСЛЕН formatCtxLogHTML на сервере\n"
      "        (в исходнике строился скриптом в файле); после импорта и правок\n"
      "        файла пересчитается только пересохранением]",
      marker="видимый лог ПРЕДВЫЧИСЛЕН formatCtxLogHTML")

# ── 07: пометка к 5b ────────────────────────────────────────────────
patch("07-5b-адаптации", P7,
      "   - reconstructSkeleton(genEntry):\n"
      "     Полный скелет: base + ctx + task + quality.\n"
      "   Фрагмент исходника: reconstructBaseCtxSkeleton … reconstructSkeleton",
      "   - reconstructSkeleton(genEntry):\n"
      "     Полный скелет: base + ctx + task + quality.\n"
      "   Фрагмент исходника: reconstructBaseCtxSkeleton … reconstructSkeleton\n"
      "   [ФАКТ 4.2: все четыре — async (Registry/БД); config.buildPrompt\n"
      "   исходника → renderTemplate(\"mode.{key}.prompt\"); source\n"
      "   'subsection_regen' (не 'subsection'); участники мета-синтеза\n"
      "   type='synthesis' — отбор через isConceptParticipant; подключены\n"
      "   fallback-ом в log-formatter (долг 2.4 §12 закрыт): rc считается\n"
      "   один раз на форматирование, needsReconstruction → baseCtx+skeleton]",
      marker="[ФАКТ 4.2: все четыре — async (Registry/БД)")

# ── 07: роутов пять ─────────────────────────────────────────────────
patch("07-роуты-пять", P7,
      "6. server/routes/export.ts:\n"
      "   - GET /syntheses/:id/export/html → Content-Type: text/html\n"
      "   - GET /syntheses/:id/export/mmd → Content-Type: text/plain\n"
      "   - GET /syntheses/:id/export/png → Content-Type: image/png\n"
      "   - GET /syntheses/:id/export/json → Content-Type: application/json",
      "6. server/routes/export.ts (ФАКТ 4.2: роутов ПЯТЬ — плюс md):\n"
      "   - GET /syntheses/:id/export/html → Content-Type: text/html\n"
      "   - GET /syntheses/:id/export/md → Content-Type: text/markdown\n"
      "   - GET /syntheses/:id/export/mmd → Content-Type: text/plain\n"
      "   - GET /syntheses/:id/export/png → Content-Type: image/png\n"
      "   - GET /syntheses/:id/export/json → Content-Type: application/json\n"
      "   requireAuth + loadSynthesisForRead; имена файлов RFC5987;\n"
      "   NO_GRAPH → 400 VALIDATION_ERROR «Нет графа.» (png/mmd/json)",
      marker="роутов ПЯТЬ — плюс md")

# ── 07: тест roundtrip → 4.3 ────────────────────────────────────────
patch("07-тест4-roundtrip", P7,
      "- «Протестируй exportHTML: импортируй скачанный файл обратно через POST /syntheses/import — все данные восстанавливаются?»",
      "- «Протестируй exportHTML: импортируй скачанный файл обратно через POST /syntheses/import — все данные восстанавливаются?» [ФАКТ 4.2: НЕИСПОЛНИМ в 4.2 — POST /syntheses/import создаёт беседа 4.3; инверсия зависимости. Покрытие не теряется: ПЕРВЫЙ тестовый запрос беседы 4.3 — тот же roundtrip]",
      marker="НЕИСПОЛНИМ в 4.2 — POST /syntheses/import создаёт беседа 4.3")

# ── 07: глава «По факту 4.2» ────────────────────────────────────────
patch("07-по-факту-4.2", P7,
      "- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»\n\n"
      "---\n\n"
      "### Беседа 4.3: Import Service",
      "- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»\n\n"
      "**По факту 4.2 (2026-08-29):**\n"
      "- Скрипты экспортируемого файла: fn.toString()/клонирование DOM\n"
      "  неисполнимы на сервере — статические бандлы export-assets.ts\n"
      "  (генерат extract:export-assets из исходника); видимый лог\n"
      "  предвычислен formatCtxLogHTML.\n"
      "- Embedded state version:2 — genLog/ctxLog без sys/promptSkeleton\n"
      "  (паритет клиентского среза), params=buildParams, участники\n"
      "  type='synthesis' без капсул, genealogy однослойная из lineage\n"
      "  (полную строит импорт 4.3).\n"
      "- Тесты 2–6: tests/test-42-requests2-6.mjs 76 ✓ ×2. АДАПТАЦИИ:\n"
      "  mermaid.live заменён ТЕМ ЖЕ движком (npm-пакет mermaid в странице\n"
      "  puppeteer, parse+render); CDN three/d3 в file://-тесте подменены\n"
      "  локальными копиями тех же версий. Тест roundtrip (п.4) неисполним —\n"
      "  исполняет 4.3 её первым тестом.\n"
      "- ГРАБЛИ МОКА (наследие тестов 2.3/4.1, чинить в будущих моках):\n"
      "  (1) специфичные маркеры pickHtml («Таблица категорий», «Сводная\n"
      "  таблица», «„Капсула“») должны стоять ПЕРЕД общим корнем\n"
      "  /критическ/i — задание графа упоминает критический анализ, и\n"
      "  прогон 1 записал критику в раздел graph; (2) моки возвращали\n"
      "  разделы БЕЗ каркаса section-num/section-title/doc-content, который\n"
      "  системный промпт требует от настоящей модели — на таком вводе\n"
      "  sec2md даёт пустой MD; мок 4.2 оборачивает wrapSection().\n"
      "- Дрейф-контроль двойников: graph-style/graph-physics ↔ клиент 1.7,\n"
      "  subtitleForExport/docDateFor ↔ DocumentHeader — integration-check\n"
      "  4y; живой конвейер экспорта — секция 5s.\n\n"
      "---\n\n"
      "### Беседа 4.3: Import Service",
      marker="По факту 4.2 (2026-08-29)")

# ── 07: квирк truncLabel — смягчение ────────────────────────────────
patch("07-квирк-truncLabel", P7,
      "> — одноимённые функции: в исходнике два `truncLabel`, и вложенный в\n"
      ">   `buildModesExportSection` печатает escape-последовательность\n"
      ">   вместо символа «…» — нужный выбирается через `scope:`\n"
      ">   (образец — `4.1-mode-service.spec`).",
      "> — одноимённые функции: в исходнике два `truncLabel`, и вложенный в\n"
      ">   `buildModesExportSection` записан с литералом `\"\\u2026\"` вместо\n"
      ">   символа «…» — в генерируемом файле это ВАЛИДНЫЙ JS-литерал и\n"
      ">   рендерится многоточием (формулировка «печатает\n"
      ">   escape-последовательность» из прежней ревизии была преувеличена;\n"
      ">   уточнено 4.2) — нужный выбирается через `scope:`\n"
      ">   (образец — `4.1-mode-service.spec`).",
      marker="рендерится многоточием")

# ── 07: граф §11 — рёбра 4.2 ────────────────────────────────────────
patch("07-граф-рёбра-4.2", P7,
      "2.4 (ContextLogViewer, кнопка в футере) ← 1.6b (DocumentFooter); fallback промптов — только после 4.2 (prompt-reconstruction)",
      "2.4 (ContextLogViewer, кнопка в футере) ← 1.6b (DocumentFooter); fallback промптов — только после 4.2 (prompt-reconstruction)\n"
      "4.2 (export) ← 2.4 (log-formatter: снятие TODO(4.2), предвычисленный видимый лог) + 4.1 (MODE_CONFIG для секции режимов и реконструкции) + 1.7 (GraphModal — снятие exportStub) + 1.6b (SynthesisPage — меню «⤓ Экспорт»; DocumentHeader — двойник шапки) + 3.1 (lineage → однослойная genealogy в embedded state)",
      marker="4.2 (export) ← 2.4 (log-formatter")

# ── 07: реестр §12 — долг реконструкции ЗАКРЫТ ──────────────────────
patch("07-§12-реконструкция", P7,
      "| `reconstructSkeleton` как fallback в `formatPromptsForExport` | 4.2 | 2.4 | 2.4 закрыта 2026-08-17: TODO(4.2) ×2 в log-formatter, записи без promptSkeleton помечаются «промпт недоступен» |",
      "| `reconstructSkeleton` как fallback в `formatPromptsForExport` | 4.2 | 2.4 | ЗАКРЫТ 4.2 (2026-08-29): `server/services/prompt-reconstruction.ts` (4 async-функции), подключён в formatPromptsForExport — rc один раз на форматирование, needsReconstruction → baseCtx+skeleton; TODO(4.2) в log-formatter сняты |",
      marker="ЗАКРЫТ 4.2 (2026-08-29): `server/services/prompt-reconstruction.ts`")

# ── 07: реестр §12 — долг экспорта графа ЗАКРЫТ ─────────────────────
patch("07-§12-экспорт-графа", P7,
      "| Экспорт графа MMD/PNG/JSON (кнопки GraphModal — заглушки, метки TODO(4.2) в GraphModal.tsx; серверные services/export/*) | 4.2 | 1.7 | внесён 2026-08-04 |",
      "| Экспорт графа MMD/PNG/JSON (кнопки GraphModal — заглушки, метки TODO(4.2) в GraphModal.tsx; серверные services/export/*) | 4.2 | 1.7 | ЗАКРЫТ 4.2 (2026-08-29): серверные `services/export/*` (mmd/png/json/md/html + graph-model/style/physics/filename/common) + 5 роутов `routes/export.ts`; GraphModal → downloadExport (exportStub снят), меню «⤓ Экспорт» в SynthesisPage + `client/src/api/export.ts` |",
      marker="ЗАКРЫТ 4.2 (2026-08-29): серверные `services/export/*`")

# ── 04 §2.5: ФАКТ-пометки + строки filename/reconstruct* ────────────
patch("04-§2.5-ФАКТ", P4,
      "| Функция | Что меняется | Целевой модуль |\n"
      "|---|---|---|\n"
      "| `saveHTML()` | Генерация HTML из БД на сервере (шаблон + данные) | `server/services/export/html-exporter.ts` |\n"
      "| `exportMMD()` | Вместо G.nodes → БД-запрос categories/edges | `server/services/export/mmd-exporter.ts` |\n"
      "| `exportPNG()` | Canvas rendering на сервере (node-canvas) или генерация SVG | `server/services/export/png-exporter.ts` |\n"
      "| `exportJSON()` | Из БД | `server/services/export/json-exporter.ts` |\n"
      "| `saveMD()` + `node2md()`, `sec2md()`, `table2md()`, `inline2md()`, `sig2md()` | Markdown-экспорт УЖЕ реализован в исходнике (в 03/06 ошибочно числится «Фаза 2, новое») | `server/services/export/md-exporter.ts` |\n"
      "| `buildGraphExportSection()` | Вставка в экспортируемый HTML | `server/services/export/html-exporter.ts` |\n"
      "| `auditCSS()` | Оптимизация CSS для экспорта — переносится | `server/utils/css-audit.ts` |\n\n"
      "### 2.6. Импорт",
      "| Функция | Что меняется | Целевой модуль |\n"
      "|---|---|---|\n"
      "| `saveHTML()` | Генерация HTML из БД на сервере (шаблон + данные) | `server/services/export/html-exporter.ts` — ФАКТ (4.2): шапка-зеркало DocumentHeader (subtitleForExport/docDateFor — двойники, дрейф сторожит integration-check 4y), .doc-body с якорями sec-{key}; ЗАМЕНА fn.toString() исходника: скрипты графа/режимов — статические бандлы `server/config/export-assets.ts` (генерат `npm run extract:export-assets` из исходника: fnBundle 46 функций, constBundle 6, gm/mode-оверлеи, rawCSS); видимый лог ПРЕДВЫЧИСЛЕН formatCtxLogHTML на сервере (после импорта и правок пересчитается только внешним пересохранением); embedded state version:2 — genLog/ctxLog без sys/promptSkeleton, params=buildParams, участники type='synthesis' без капсул (stripCapsules), genealogy однослойная из lineage (полную строит импорт 4.3) |\n"
      "| `exportMMD()` | Вместо G.nodes → БД-запрос categories/edges | `server/services/export/mmd-exporter.ts` — ФАКТ (4.2): loadGModel общий (`graph-model.ts`), стиль/сиды — `graph-style.ts` (копия клиентского graph-utils 1.7, дрейф сторожит 4y); КВИРК исходника сохранён: classDef объявлены, строк class нет |\n"
      "| `exportPNG()` | Canvas rendering на сервере (node-canvas) или генерация SVG | `server/services/export/png-exporter.ts` — ФАКТ (4.2): вариант (а) node-canvas 2048×2048, PAD 120; физика — `graph-physics.ts` (клиентские константы, warmup(...,2)); квирки-опущения исходника задокументированы в шапке модуля |\n"
      "| `exportJSON()` | Из БД | `server/services/export/json-exporter.ts` — ФАКТ (4.2): meta.format \"PhiloSynth Graph\" version 1, roles нормализованы, clusters с members |\n"
      "| `saveMD()` + `node2md()`, `sec2md()`, `table2md()`, `inline2md()`, `sig2md()` | Markdown-экспорт УЖЕ реализован в исходнике (в 03/06 ошибочно числится «Фаза 2, новое») | `server/services/export/md-exporter.ts` — ФАКТ (4.2): DOM через html-parser (linkedom изолирован); требует каркаса .section-num/.section-title/.doc-content в html_content (моки без каркаса дают пустой MD — грабля тестов) |\n"
      "| `getDocFilename()` [17477] | Из params БД вместо DOC_STATE | `server/services/export/filename.ts` — ФАКТ (4.2): paramCode склейка join(\"\") без дефисов — пример «hm-t-2» в комментарии исходника устарел; RFC5987-имена в Content-Disposition (`routes/export.ts`) |\n"
      "| `reconstructBaseCtxSkeleton()`, `reconstructCtxMarkers()`, `reconstructSectionTask()`, `reconstructSkeleton()` | Fallback-реконструкция скелета промпта для записей без metadata.promptSkeleton (импорты; долг 2.4 §12) | `server/services/prompt-reconstruction.ts` — ФАКТ (4.2): все 4 async; config.buildPrompt исходника → renderTemplate из Registry; source 'subsection_regen'; участники type='synthesis' через isConceptParticipant; подключён в log-formatter (rc один раз на форматирование) |\n"
      "| `buildGraphExportSection()` | Вставка в экспортируемый HTML | `server/services/export/html-exporter.ts` — ФАКТ (4.2): initScript [17773-17828] дословно, ассеты из export-assets; buildModesExportSection — скрипт дословно |\n"
      "| `auditCSS()` | Оптимизация CSS для экспорта — переносится | `server/utils/css-audit.ts` — ФАКТ (4.2): 1:1 [17835-18001] |\n\n"
      "### 2.6. Импорт",
      marker="`server/services/export/html-exporter.ts` — ФАКТ (4.2)")

# ── Спека 4.2: saveLang вне беседы ──────────────────────────────────
patch("spec-saveLang", SPEC,
      "js:saveLang",
      "# saveLang — В 4.2 НЕ ВХОДИТ: UI выбора ЯЗЫКА ГЕНЕРАЦИИ (01 «Мелкое»\n"
      "# п.6; не язык интерфейса). Реализован беседами 1.5 (селектор\n"
      "# SynthesisForm) + 1.2 (lang_instruction) + 1.6 (syntheses.lang);\n"
      "# в комплекте для чтения контекста экспорта (docLang в шапке)\n"
      "js:saveLang",
      marker="UI выбора ЯЗЫКА ГЕНЕРАЦИИ")

# ── Спека 4.2: reconstructGenealogy вне беседы ──────────────────────
patch("spec-reconstructGenealogy", SPEC,
      "js:reconstructGenealogy",
      "# reconstructGenealogy — В 4.2 НЕ ВХОДИТ: клиентский порт сделан 3.2\n"
      "# (client/utils/genealogy.ts), серверный — беседа 4.3; в комплекте для\n"
      "# чтения (формат genealogy, который экспорт кладёт в embedded state)\n"
      "js:reconstructGenealogy",
      marker="reconstructGenealogy — В 4.2 НЕ ВХОДИТ")

# ── shared: комментарий статусов ContextEntry ───────────────────────
patch("generation-ContextEntry-статусы", GEN,
      "  /** 'included'|'truncated'|'missing'|'skipped_budget'|... */\n"
      "  status: string;",
      "  /** ФАКТИЧЕСКИЕ статусы (уточнено 4.2; прежний комментарий называл\n"
      "   *  несуществующий 'included'): 'found' | 'truncated' | 'missing' |\n"
      "   *  'skipped_budget' | 'dropped' */\n"
      "  status: string;",
      marker="несуществующий 'included'")

print("применено:", len(applied))
for n in applied:
    print("  +", n)
print("пропущено (уже применено):", len(skipped))
for n in skipped:
    print("  =", n)
if failed:
    print("ПРОВАЛЫ:", len(failed))
    for n in failed:
        print("  !", n)
    raise SystemExit(1)
print("OK")
