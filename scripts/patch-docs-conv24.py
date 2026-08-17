#!/usr/bin/env python3
"""Правки документации по итогам беседы 2.4 (лог контекста и генерации).

Идемпотентный apply/skip-скрипт (образец conv22):
 - patch(): замена old → new; повторный прогон видит marker → skip;
 - optional=True — переходник промежуточных состояний.

Запуск из корня репо: python3 scripts/patch-docs-conv24.py
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
        failed.append(f"{name}: якорь встречается {s.count(old)} раз в {rel}")
        return
    write(rel, s.replace(old, new))
    applied.append(name)


D04 = "docs/04-code-reuse-map.md"
D03 = "docs/03-specification.md"
D05 = "docs/05-file-structure.md"
D07 = "docs/07-conversation-protocol.md"
SPEC = "docs/fragments-for-conversations/2.4-logs.spec"

# ── 1. 04 §3: colorizeLog — единая shared-реализация + реэкспорт ──────
patch("04-colorize-shared", D04,
    "| `colorizeLog()` | `client/utils/colorize-log.ts` (клиентская) |",
    "| `colorizeLog()` | `packages/shared/utils/colorize-log.ts` (единая: "
    "нужна серверу для `/logs/formatted` и клиенту) + "
    "`client/components/logs/colorize-log.ts` (тонкий реэкспорт; 2.4) |")

# ── 2. 04 §3: formatCtxLog — фактический путь Viewer + адаптация HTML ─
patch("04-formatctxlog-path", D04,
    "| `formatCtxLog()` | `server/services/log-formatter.ts` (серверная) + "
    "`client/components/ContextLogViewer.tsx` |",
    "| `formatCtxLog()` | `server/services/log-formatter.ts` (серверная) + "
    "`client/components/logs/ContextLogViewer.tsx`; адаптация 2.4: "
    "`formatCtxLogHTML` исходника [24090] возвращал только html — форма "
    "`{ text, html }` задана 03 §2.12 |")

# ── 3. 03 §2.12: эндпоинт /logs/prompts (вводится текстом 07 2.4) ─────
patch("03-logs-prompts", D03,
    "GET    /syntheses/:id/logs/formatted   → { text: string, html: string }",
    "GET    /syntheses/:id/logs/formatted   → { text: string, html: string }\n"
    "GET    /syntheses/:id/logs/prompts     → { text: string | null } — дамп\n"
    "                                         промптов (07 2.4; аналог\n"
    "                                         downloadPrompts исходника)")

# ── 4. 07 2.4 контекст: Logs в 03 — §2.12, не §2.5 ────────────────────
patch("07-ctx-spec-section", D07,
    "- `03-specification.md` (секции 2.3 Sections, 2.5 Logs)",
    "- `03-specification.md` (секции 2.3 Sections, 2.12 Context Log)")

# ── 5. 07 2.4 контекст: log-formatter в 04 — §3 (UI-таблица) ──────────
patch("07-ctx-map-section", D07,
    "- `04-code-reuse-map.md` (секция 2.7 — mode-service, log-formatter)",
    "- `04-code-reuse-map.md` (секция 2.7 — mode-service; "
    "formatCtxLog/colorizeLog — таблица §3)")

# ── 6. Спека: getSectionContextQuality [5571] создаётся этой беседой ──
patch("spec-context-quality", SPEC,
    "## Форматирование лога (server/services/log-formatter.ts)",
    "## Качество контекста (server/services/context-quality.ts)\n"
    "js:getSectionContextQuality\n"
    "\n"
    "## Форматирование лога (server/services/log-formatter.ts)")

# ── 7. 07 2.4 п.2: края формулы — порт исходника ──────────────────────
patch("07-formula-edges", D07,
    "score = round(reqFound/reqTotal × 70 + min(1, totalUsed/budget) × 30) "
    "и issues",
    "score = round(reqFound/reqTotal × 70 + min(1, totalUsed/budget) × 30) "
    "(края — порт [5571]: reqTotal=0 → reqScore=1; budget=0 → usage=0) "
    "и issues")

# ── 8. 07 2.4 п.1: происхождение формы { text, html } ─────────────────
patch("07-html-adaptation", D07,
    "     Возвращает { text: string, html: string } — plain + colorized",
    "     Возвращает { text: string, html: string } — plain + colorized\n"
    "     (адаптация: `formatCtxLogHTML` исходника [24090] возвращал только\n"
    "     html; text добавлен формой 03 §2.12)")

# ── 9. 05: client/api/logs.ts в дереве ────────────────────────────────
patch("05-api-logs", D05,
    "│   │   │   ├── generation.ts\n"
    "│   │   │   ├── plans.ts",
    "│   │   │   ├── generation.ts\n"
    "│   │   │   ├── logs.ts                 # GET /logs/* (беседа 2.4)\n"
    "│   │   │   ├── plans.ts")

# ── 10a. 05: colorize-log клиентский — реэкспорт ──────────────────────
patch("05-colorize-reexport", D05,
    "│   │   │   │   └── colorize-log.ts        # colorizeLog() (colorizeLog())",
    "│   │   │   │   └── colorize-log.ts        # реэкспорт shared/utils/"
    "colorize-log (2.4)")

# ── 10b. 05: shared/utils/colorize-log.ts в дереве ────────────────────
patch("05-shared-colorize", D05,
    "│           └── cardinality.ts          # participantCardinality, "
    "participantWord/Sg,\n"
    "│                                       # hasConceptParticipants "
    "(v11, 01 §4.14)",
    "│           ├── cardinality.ts          # participantCardinality, "
    "participantWord/Sg,\n"
    "│           │                           # hasConceptParticipants "
    "(v11, 01 §4.14)\n"
    "│           └── colorize-log.ts         # colorizeLog() — единая "
    "реализация (2.4;\n"
    "│                                       # клиент реэкспортирует)")

# ── 11. 07: маркер «КОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ» — свёртка, не срез ─
patch("07-markers-precision", D07,
    "     Регулярки парсинга обновлены: добавлены маркеры `КОНТЕКСТ ДРУГИХ`,\n"
    "     `Перегенерируй ТОЛЬКО`, `КОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ`.",
    "     Регулярки СРЕЗА параметров v10 [24410/24443] несут маркеры\n"
    "     `КОНТЕКСТ ДРУГИХ` и `Перегенерируй ТОЛЬКО`; маркер\n"
    "     `КОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ` — в регулярках СВЁРТКИ скелета\n"
    "     [8546], портированных generation-service ещё беседой 1.4\n"
    "     (уточнение 24/тесты: прежняя формулировка смешивала оба места).",
    marker="уточнение 24/тесты", optional=True)

# ── 12. 07 2.4: примечания по итогам тестовых запросов ────────────────
patch("07-test-findings", D07,
    "- «Проверь форматирование: version-marker, deletion-marker — корректно "
    "отображаются»",
    "- «Проверь форматирование: version-marker, deletion-marker — корректно "
    "отображаются»\n"
    "\n"
    "> **Итоги тестов (2026-08-17, tests/test-24-requests2-5.mjs, 51 ✓ ×2):**\n"
    "> 1) заголовки блоков лога — реестровые `section_label` из genLog\n"
    "> (у перегенерации суффикс « [перегенерация]»), НЕ `KEY_LABELS`;\n"
    "> `KEY_LABELS` — только в `actions` version-marker'а; 2) live-обновление\n"
    "> потребовало ПОСТОЯННОЙ viewOnly-подписки в `SynthesisPage`\n"
    "> (standalone `POST /regenerate/:key` не меняет `status` синтеза —\n"
    "> условная подписка не открывала WS; аналог `refreshCtxLogIfOpen`\n"
    "> [23306]); 3) standalone-перегенерация завершается `section_done` без\n"
    "> `generation_complete`; 4) `WsPlanStepDone` несёт\n"
    "> `{ planId, stepIndex, result }` без объекта шага — ожидания строить\n"
    "> на `plan_updated` + контроле по БД; 5) порядок блоков хронологический:\n"
    "> ВЕРСИЯ → УДАЛЁН → перегенерированный раздел (delete-шаги плана\n"
    "> исполняются раньше regen — порядок v10, edit-planner 2.1);\n"
    "> 6) интеграционная правка 2.2: `bumpVersionsForPlan` пишет\n"
    "> `metadata.version` (иначе «ВЕРСИЯ vN» печатается без номера).")


# ── 13. §12: долг context-quality.ts закрыт этой беседой ──────────────
patch("07-s12-close-cq", D07,
    "| `context-quality.ts` / `getSectionContextQuality` | 2.4 | 1.3 | "
    "в тексте 2.4 |\n",
    "",
    marker="s12-cq-row-removed-24", optional=True)

# ── 14. §12: долг подстановки score в GET /sections закрыт ────────────
patch("07-s12-close-score", D07,
    "| Подстановка `contextQualityScore` в GET /sections (сейчас null, "
    "метка TODO(2.4) в routes/sections.ts) | 2.4 | 1.6 | "
    "внесён 2026-08-02 |\n",
    "",
    marker="s12-score-row-removed-24", optional=True)

# ── 15. §12: бейдж качества — серверная половина закрыта 2.4 ──────────
patch("07-s12-badge", D07,
    "| Бейдж качества контекста (`contextQualityScore`) | 2.3 ← 2.4 | 1.3 "
    "| инверсия снята 2026-07-30 |",
    "| Бейдж качества контекста (`contextQualityScore`) | 2.3 | 1.3 | "
    "серверная половина закрыта 2.4 (2026-08-17): score живой в "
    "GET /sections; осталась UI-половина (EditSectionCard) |")

# ── 16. §12: reconstructSkeleton — 2.4 закрыта, долг остался за 4.2 ───
patch("07-s12-reconstruct", D07,
    "| `reconstructSkeleton` как fallback в `formatPromptsForExport` | "
    "4.2 → 2.4 | 2.4 | инверсия снята 2026-07-30 |",
    "| `reconstructSkeleton` как fallback в `formatPromptsForExport` | "
    "4.2 | 2.4 | 2.4 закрыта 2026-08-17: TODO(4.2) ×2 в log-formatter, "
    "записи без promptSkeleton помечаются «промпт недоступен» |")

RM = "README.md"

# ── 17. README: диапазон тестов ───────────────────────────────────────
patch("readme-tests-range", RM,
    "tests/             ВСЕ тесты бесед (0.3b–2.2)",
    "tests/             ВСЕ тесты бесед (0.3b–2.4)")

# ── 18. README: integration-check += секции 2.4, охват ────────────────
patch("readme-integration", RM,
    "список→Full→sections→categories→PATCH→duplicate→DELETE). Сейчас\n"
    "покрывает 0.1–0.6 и 1.1–1.6;",
    "список→Full→sections→categories→PATCH→duplicate→DELETE); 2.4 —\n"
    "2n/4t/5q: лог контекста (shared colorize-log + тонкий реэкспорт,\n"
    "формула [5571] с краями живьём, постоянная viewOnly-подписка\n"
    "SynthesisPage, «TODO(2.4)»-walker). Сейчас покрывает 0.1–0.6,\n"
    "1.1–1.7, 2.1, 2.2 и 2.4;")

# ── 19. README: заголовок статуса (2.2 его не обновила — чиним заодно) ─
patch("readme-status-header", RM,
    "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.7 закрыты; "
    "Фаза 2 — беседа 2.1 закрыта",
    "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.7 закрыты; "
    "Фаза 2 — беседы 2.1, 2.2 и 2.4 закрыты")

# ── 20. README: запись беседы 2.4 ─────────────────────────────────────
patch("readme-conv24-entry", RM,
    "Доки пропатчены scripts/patch-docs-conv21.py.\n",
    "Доки пропатчены scripts/patch-docs-conv21.py.\n"
    "\n"
    "Беседа 2.4 (лог контекста и генерации; велась ПЕРЕД 2.3 — §11):\n"
    "packages/shared/utils/colorize-log.ts (единая раскраска, клиент —\n"
    "тонкий реэкспорт), services/log-formatter.ts (formatCtxLog [23318] /\n"
    "formatCtxLogHTML { text, html } / formatPromptsForExport [24353];\n"
    "genCommon из служебной строки '_genCommon', rawBaseBudget critique\n"
    "×1.5, записи без promptSkeleton помечаются — реконструкция TODO(4.2)),\n"
    "services/context-quality.ts (порт [5571] с краями + Map-выборка без\n"
    "N+1 — долг 1.3 закрыт, score живой в GET /sections — долг 1.6 закрыт),\n"
    "routes/logs.ts (4 GET-эндпоинта под requireAuth+loadSynthesisForRead),\n"
    "клиент api/logs.ts + ContextLogViewer (refreshKey, Blob-выгрузка\n"
    "промптов) + «◈ Лог» в DocumentFooter; интеграционные правки:\n"
    "metadata.version в version_marker (plan-executor), ПОСТОЯННАЯ\n"
    "viewOnly-подписка SynthesisPage (live-лог standalone-перегенерации).\n"
    "Тесты: tests/test-24-requests2-5.mjs 51/51 ✓ ×2 (живой сервер +\n"
    "мок-SSE + puppeteer: формат лога 3 разделов со сверкой чисел с БД,\n"
    "html-раскраска, браузерный live без перезагрузки, version/deletion-\n"
    "маркеры и /logs/prompts). Доки пропатчены scripts/patch-docs-conv24.py.\n")

# ── 21. README: хвост «в Фазе 2 закрыты…» ─────────────────────────────
patch("readme-phase2-tail", RM,
    "Фаза 1 закрыта целиком (1.1–1.7); в Фазе 2 закрыты 2.1 и 2.2.\n"
    "Следующие по графу 07 — 2.3 (Edit Modal) и 2.4 (лог контекста);",
    "Фаза 1 закрыта целиком (1.1–1.7); в Фазе 2 закрыты 2.1, 2.2 и 2.4\n"
    "(велась перед 2.3 — §11). Следующая по графу 07 — 2.3 (Edit Modal;\n"
    "бэкенд-исполнение и бейдж качества контекста готовы);")

print("── применено ──")
for n in applied:
    print("  ✓", n)
print("── пропущено (уже применено/optional) ──")
for n in skipped:
    print("  −", n)
if failed:
    print("── ПРОВАЛЫ ──")
    for n in failed:
        print("  ✗", n)
    raise SystemExit(1)
print(f"ИТОГ: {len(applied)} применено, {len(skipped)} пропущено, 0 провалов")
