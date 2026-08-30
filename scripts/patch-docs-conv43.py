#!/usr/bin/env python3
"""Правки документации по итогам беседы 4.3 (Import Service).

Идемпотентный apply/skip-скрипт (образец conv42):
 - patch(): замена old → new; повторный прогон видит marker → skip.

Запуск из корня репо: python3 scripts/patch-docs-conv43.py
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
RM = "README.md"

# ── 07: шапка — запись правок 2026-08-30 ────────────────────────────
patch("07-журнал-4.3", P7,
      "# PhiloSynth Service — Протокол бесед\n\n"
      "> **Правки 2026-08-29 (итоги беседы 4.2)**",
      "# PhiloSynth Service — Протокол бесед\n\n"
      "> **Правки 2026-08-30 (итоги беседы 4.3)**: Import Service закрыт\n"
      "> (запрос 1 + все 4 тестовых запроса tests/test-43-requests2-5.mjs\n"
      "> 64 ✓ ×2, включая roundtrip — перенесённый тест 4 беседы 4.2 — и\n"
      "> браузерный сегмент ImportPage). Дыры, закрытые этим патчем: запрос\n"
      "> 4.3 предполагал порт extractMetadata/extractSections 1:1, но экспорт\n"
      "> 4.2 рендерит шапку ПО КЛАССАМ без id и несёт в .doc-body якоря/кнопку\n"
      "> графа — адаптации не были оговорены (глава «По факту 4.3»); участники\n"
      "> сервиса type='synthesis' против 'concept' клиентского порта 3.2;\n"
      "> incomplete-доля гейта 2.3 вырождена (помечено по месту); долг §12\n"
      "> «Серверный импорт концепт-файлов» вычеркнут как ЗАКРЫТЫЙ, остаток\n"
      "> (клиентский сабмит файловых ☑-концепций) заведён отдельной строкой.\n"
      ">\n"
      "> **Правки 2026-08-29 (итоги беседы 4.2)**")

# ── 07: глава «По факту 4.3» после текста беседы 4.3 ────────────────
patch("07-по-факту-4.3", P7,
      "- «Протестируй файл без embedded state: только HTML-разделы → импорт "
      "с предупреждением \"Лог отсутствует\"»\n"
      "\n"
      "**Завершение беседы:**",
      "- «Протестируй файл без embedded state: только HTML-разделы → импорт "
      "с предупреждением \"Лог отсутствует\"»\n"
      "\n"
      "> **По факту 4.3 (2026-08-30, беседа ЗАКРЫТА).** Запрос 1 и все\n"
      "> тестовые запросы выполнены (tests/test-43-requests2-5.mjs, 64 ✓ ×2:\n"
      "> roundtrip мета-синтеза с родителем, standalone с предупреждениями,\n"
      "> IMPORT_INVALID, без embedded state; + браузерный сегмент ImportPage\n"
      "> через vite/Chromium; смоук ядер tests/smoke-43-request1.mjs 33 ✓).\n"
      "> ДВА ВХОДНЫХ ФОРМАТА: standalone-файл (шапка с id, legacy-логи:\n"
      "> `cost`/`error`/поля россыпью/маркеры `type` через дефис, без\n"
      "> createdAt) и экспорт 4.2 (шапка ПО КЛАССАМ без id, логи с полями-\n"
      "> колонками). АДАПТАЦИИ (полный список — шапка import-service.ts):\n"
      "> extractMetadata читает id → fallback классы .doc-title/.doc-subtitle/\n"
      "> .doc-meta-grid по русским подписям; extractSections кладёт в\n"
      "> html_content outerHTML самого .doc-section (parentBody.innerHTML\n"
      "> экспорта несёт якорь sec-{key} и кнопку «▦ Граф»); confirm() критических\n"
      "> предупреждений — на клиенте ДО отправки, сервер всегда импортирует и\n"
      "> отдаёт warnings; reconstructGenealogy принимает участников\n"
      "> type!=='philosopher' ('concept' исходника И 'synthesis' сервиса),\n"
      "> synthesisId узла строит synthesis_lineage; lineage — первый слой\n"
      "> (файловые родители без записи в БД → warning, глубокое дерево файла\n"
      "> живёт только в embedded state); дубликаты ключей разделов — первый\n"
      "> побеждает (UNIQUE); извлечённые ключи вне embedded sectionOrder —\n"
      "> в хвост; mode_results без токенов/стоимости (файл их не несёт).\n"
      "> КВИРКИ СОХРАНЕНЫ: капсула из ТЕКСТА шапки обёрткой doc-section\n"
      "> [21806] — sections-row 'capsule' НЕ создаётся (паритет исходника:\n"
      "> капсула вне docBodies; ключ в sectionOrder + capsule_html); ветка\n"
      "> embeddedState.capsuleHTML [21793] мертва для version:2 обеих линий;\n"
      "> validateImportMeta считает 0 философов критичным — roundtrip\n"
      "> легального свободного синтеза (v11) даёт ложно-критическое\n"
      "> предупреждение (поведение исходника, порт 1:1); subtitle мета-синтеза\n"
      "> «На основе: Кант + Концепция» сплитится по запятой в один элемент\n"
      "> (перекрывается params.phil из embedded state). ФИКС ПОРЯДКА\n"
      "> LEGACY-ЛОГОВ (найден тестом): standalone датирует только маркеры —\n"
      "> смешение реальных прошлых дат с fallback-«сейчас» ломало хронологию;\n"
      "> при неполной датировке ВСЕ записи получают синтетические t0+i\n"
      "> (порядок массива — истина; v2 с полными createdAt сохраняет даты).\n"
      "> secCtx разделов: экспорт 4.2 sec-disclosure не пишет —\n"
      "> восстанавливается из embedded params.secCtx (порт слияния).\n"
      "> НОВАЯ ГРАБЛЯ МОКОВ (в копилку 4.2): задание SUM перечисляет структуру\n"
      "> документа («…Критический анализ…») — sum обязан иметь СВОЙ маркер\n"
      "> («Точки напряжения») ПЕРЕД веткой /критическ/i, иначе перехватывается\n"
      "> (в 4.2 прошло незамеченным — содержимое sum там не проверялось).\n"
      "> Рёбра §11 фактические: 4.3 ← 4.2 (формат файла), ← 3.1/3.2\n"
      "> (lineage-модель, клиентские genealogy-порты — образцы серверных\n"
      "> копий), → 1.6b (SynthesisPage рендерит импортированный документ).\n"
      "> Дрейф двойников titleToKey/genealogy клиент↔сервер сторожит\n"
      "> integration-check 4z.\n"
      "\n"
      "**Завершение беседы:**")

# ── 07: incomplete-доля гейта 2.3 — пометка по месту ────────────────
patch("07-incomplete-факт", P7,
      "> openEditModal (API_KEY / DOC_STATE.incomplete) — до 6.1/4.3.",
      "> openEditModal (API_KEY / DOC_STATE.incomplete) — до 6.1/4.3\n"
      "> [ФАКТ 4.3: incomplete-доля ВЫРОЖДЕНА — колонки в схеме нет,\n"
      "> критичность импорта уходит клиенту в warnings ответа POST\n"
      "> /syntheses/import (подтверждение — на ImportPage ДО отправки);\n"
      "> редактирование импортированного не блокируется — паритет исходника,\n"
      "> позволявшего то же после confirm. За 6.1 остаётся только\n"
      "> API_KEY-доля].")

# ── 07: §12 — долг «Серверный импорт концепт-файлов» закрыт ─────────
patch("07-§12-импорт-закрыт", P7,
      "| Серверный импорт концепт-файлов | 4.3 | 1.5b | в тексте 4.3 |",
      "| Серверный импорт концепт-файлов | 4.3 | 1.5b | ЗАКРЫТ 4.3 "
      "(2026-08-30): POST /syntheses/import + import-service принимают "
      "standalone-файлы и экспорт сервиса (шаги a–m: syntheses/sections/граф/"
      "тезисы/глоссарий/логи/lineage/режимы, откат CASCADE при сбое); "
      "клиентский остаток — строкой ниже |\n"
      "| Авто-импорт файловых ☑-концепций при сабмите формы синтеза "
      "(SynthesisForm: файл → POST /syntheses/import → участник "
      "type='synthesis' с полученным id; снятие гейта 1.5b/3.2) | 6.2 | 4.3 "
      "| внесён 2026-08-30 |")

# ── 04 §2.6: ФАКТ-пометки ───────────────────────────────────────────
patch("04-importHTML-факт", P4,
      "| `importHTML()` | Клиент загружает файл → сервер парсит → создаёт "
      "записи в БД | `server/services/import-service.ts` |",
      "| `importHTML()` | Клиент загружает файл → сервер парсит → создаёт "
      "записи в БД — ФАКТ (4.3): шаги a–m, ДВА входных формата (standalone / "
      "экспорт 4.2), откат строки syntheses при сбое (CASCADE); критичность "
      "validateImportMeta — в warnings ответа (confirm — клиент) | "
      "`server/services/import-service.ts` |")

patch("04-extractMetadata-факт", P4,
      "| `extractMetadata()` | Серверный DOM-парсер | там же |\n"
      "| `extractSections()` | Серверный DOM-парсер | там же |\n"
      "| `extractEmbeddedState()` | Без изменений | там же |\n"
      "| `buildDocStateFromImport()` | Вместо DOC_STATE → создание записей "
      "в БД | там же |",
      "| `extractMetadata()` | Серверный DOM-парсер — ФАКТ (4.3): id "
      "standalone → fallback классы экспорта 4.2 (.doc-title/.doc-subtitle/"
      ".doc-meta-grid по русским подписям, «—»→пусто) | там же |\n"
      "| `extractSections()` | Серверный DOM-парсер — ФАКТ (4.3): "
      "html_content = outerHTML .doc-section (обвязка экспорта — якоря/"
      "кнопка графа — не попадает); secCtx из sec-disclosure родителя "
      "(standalone) либо embedded params.secCtx | там же |\n"
      "| `extractEmbeddedState()` | Без изменений | там же |\n"
      "| `buildDocStateFromImport()` | Вместо DOC_STATE → создание записей "
      "в БД — ФАКТ (4.3): sections-row 'capsule' НЕ создаётся (капсула → "
      "capsule_html + ключ в sectionOrder, паритет исходника); порядок "
      "legacy-логов — синтетические t0+i при неполной датировке | там же |")

patch("04-populateFromImport-строка", P4,
      "| `genCommon.conceptBlockSizes` |",
      "| `populateFromImport()` | ВЫРОЖДЕН (4.3): DOM-рендер исходника; его "
      "данные — поля syntheses (title/docNum/totals) и sections, отображение "
      "— SynthesisPage (1.6b) | — |\n"
      "| `genCommon.conceptBlockSizes` |")

# ── NEXT-CONTEXT: глава 4.3 ─────────────────────────────────────────
NC = "NEXT-CONTEXT.md"
patch("NC-глава-4.3", NC,
      "- ГРАБЛИ МОКА для тестов 4.3 (см. «По факту 4.2» в 07): специфичные\n"
      "  маркеры pickHtml ПЕРЕД /критическ/i; разделы мока — С каркасом\n"
      "  section-num/section-title/doc-content (иначе sec2md/просмотр пусты).",
      "- ГРАБЛИ МОКА для тестов 4.3 (см. «По факту 4.2» в 07): специфичные\n"
      "  маркеры pickHtml ПЕРЕД /критическ/i; разделы мока — С каркасом\n"
      "  section-num/section-title/doc-content (иначе sec2md/просмотр пусты).\n"
      "\n"
      "# Беседа 4.3 — Import Service [ЗАКРЫТА 2026-08-30]\n"
      "\n"
      "## Что создано\n"
      "- server/services/import-service.ts (~1000 строк): importHTML шаги a–m\n"
      "  + extractMetadata/validateImportMeta/extractSections/\n"
      "  extractEmbeddedState/extractModesFromHTML + серверные копии\n"
      "  titleToKey (concept-file.ts) и isPlaceholderConceptName/\n"
      "  resolveConceptName (FIX [а-яё])/normalizeGenealogyNames/\n"
      "  restoreCapsulesFromHTML/reconstructGenealogy (genealogy.ts) +\n"
      "  мапперы логов ДВУХ форматов; 9 АДАПТАЦИЙ — в шапке модуля.\n"
      "- server/utils/html-parser.ts += parseDocument/HtmlDocument (полный\n"
      "  документ; инвариант «единственная точка linkedom» сохранён),\n"
      "  HtmlElement += closest/outerHTML/innerHTML.\n"
      "- server/routes/import.ts: POST /syntheses/import (multipart, поле\n"
      "  file; 401/400 VALIDATION_ERROR/400 IMPORT_INVALID; лимит 25 МБ);\n"
      "  смонтирован в index.ts. shared += ImportWarning.\n"
      "- Клиент: api/import.ts (локальный multipart-fetch с контрактом\n"
      "  ApiError — api() JSON-only), ImportPage.tsx (drag&drop, проверка\n"
      "  .html, «Подтвердить импорт»/«Отмена» ДО отправки, индетерминированный\n"
      "  индикатор, warnings ⚠ critical/⚡, redirect /synthesis/:id).\n"
      "\n"
      "## Знания/грабли, добытые в 4.3\n"
      "- Экспорт 4.2 рендерит шапку ПО КЛАССАМ без id — буквальный порт\n"
      "  extractMetadata на собственном экспорте не работает; .doc-body несёт\n"
      "  якорь sec-{key} и кнопку графа — html_content брать outerHTML\n"
      "  .doc-section.\n"
      "- Порядок legacy-логов: standalone датирует только маркеры — при\n"
      "  неполной датировке ВСЕ записи получают t0+i (иначе маркер с прошлой\n"
      "  датой обгоняет свежие fallback-даты; найдено тестом R3).\n"
      "- Sections-row 'capsule' при импорте НЕ создаётся — капсула в\n"
      "  capsule_html + ключ в sectionOrder (паритет исходника; тесты\n"
      "  сравнения разделов должны исключать capsule).\n"
      "- Мок: заданию SUM нужен СВОЙ маркер («Точки напряжения») ПЕРЕД\n"
      "  /критическ/i — задание sum перечисляет структуру документа.\n"
      "- Квирк v11: validateImportMeta считает 0 философов критичным —\n"
      "  roundtrip свободного синтеза даёт ложно-критическое предупреждение\n"
      "  (порт 1:1).\n"
      "- puppeteer: кука сессии ставится page.setCookie на origin vite\n"
      "  (прокси /api сохраняет домен); Chromium /opt/pw-browsers/…\n"
      "\n"
      "## Файлы-контекст для следующих бесед\n"
      "- Беседа 6.2 (клиент): client/src/api/import.ts + ImportPage.tsx +\n"
      "  долг §12 «Авто-импорт файловых ☑-концепций при сабмите» (SynthesisForm\n"
      "  + pool-store 1.5b; participants type='synthesis' с id импорта).\n"
      "- Любая работа с импортом: server/services/import-service.ts (шапка —\n"
      "  реестр адаптаций), server/utils/html-parser.ts, tests/\n"
      "  test-43-requests2-5.mjs (харнесс с моком обоих форматов).\n")

# ── README: статус ──────────────────────────────────────────────────
patch("README-статус", RM,
      "## Статус: Фазы 0–3 завершены + 4.1, 4.2 (Фаза 2: 2.1, 2.2, 2.4, 2.3; "
      "Фаза 3: 3.1, 3.2; Фаза 4: 4.1, 4.2)",
      "## Статус: Фазы 0–4 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3; "
      "Фаза 3: 3.1, 3.2; Фаза 4: 4.1, 4.2, 4.3)")

patch("README-4.3-абзац", RM,
      "заглушки TODO(4.2). Доки пропатчены scripts/patch-docs-conv17.py.",
      "заглушки TODO(4.2). Доки пропатчены scripts/patch-docs-conv17.py.\n"
      "\n"
      "Беседа 4.3 (Import Service, 2026-08-30): POST /syntheses/import\n"
      "(multipart) + import-service (importHTML a–m; ДВА входных формата —\n"
      "standalone и экспорт 4.2; серверные копии titleToKey/genealogy-портов,\n"
      "дрейф сторожит integration-check 4z) + parseDocument в html-parser +\n"
      "ImportPage/api-import. Тесты tests/test-43-requests2-5.mjs 64 ✓ ×2\n"
      "(roundtrip с родителем-концепцией, standalone c предупреждениями,\n"
      "IMPORT_INVALID, без embedded state, браузерный сегмент ImportPage).\n"
      "Доки пропатчены scripts/patch-docs-conv43.py.",
      marker="Беседа 4.3 (Import Service, 2026-08-30)")

patch("README-integration-4.3", RM,
      "1.1–1.7, 2.1–2.4, 3.1–3.2 и 4.1–4.2 целиком; живые секции требуют",
      "1.1–1.7, 2.1–2.4, 3.1–3.2 и 4.1–4.3 целиком (4.3 — 2r/4z/5t: импорт,\n"
      "дрейф двойников titleToKey/genealogy клиент↔сервер, живой importHTML\n"
      "против БД); живые секции требуют")

print(f"applied={len(applied)} skip={len(skipped)} fail={len(failed)}")
for a in applied:
    print("  +", a)
for f_ in failed:
    print("  ✗", f_)
if failed:
    raise SystemExit(1)
