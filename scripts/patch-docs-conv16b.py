#!/usr/bin/env python3
"""Патч документации по итогам беседы 1.6b (просмотр документа + каталог).

Идемпотентный: каждая правка проверяет наличие нового текста и уходит в
skip при повторном прогоне. Отчёт applied/skip/fail. Запуск из корня репо:
    python3 scripts/patch-docs-conv16b.py

Правки:
  16b/A  07 блок «По факту 1.6b» после «Завершение беседы» 1.6b
         (адаптации (а)–(д), грабля SectionView, судьба
         makeSectionCtxDisclosure, грабли харнесса).
  16b/B  07 §12: строка маркеров TODO(1.6b) вычеркнута (закрыты);
         внесён долг makeSectionCtxDisclosure → 2.3.
  16b/C  07 шапка: запись ревизии 2026-08-03.
  16b/D  spec 1.6-document-view.spec: дыра — disclosure-CSS
         (.header-disclosure* / .sec-disclosure) добавлен в спецификацию.
  16b/E  07 «Контекст» беседы 2.3: аннотация про makeSectionCtxDisclosure.
  16b/F  README: статус после 1.6b + абзац беседы + «Не сделано» +
         диапазон tests/.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
P07 = ROOT / "docs" / "07-conversation-protocol.md"
SPEC = ROOT / "docs" / "fragments-for-conversations" / "1.6-document-view.spec"
README = ROOT / "README.md"

applied = 0
skipped = 0
failed = 0


def patch(path: Path, old: str, new: str, label: str, marker: str | None = None,
          optional: bool = False) -> None:
    """Заменяет old → new; идемпотентность — по marker (или new) в тексте.

    Урок 16pre: если новый текст неуникален, маркер задавать явно
    многострочным блоком. optional=True — правка-переходник между
    промежуточными состояниями: отсутствие И old, И marker — законный
    skip (состояние уже минуло), а не FAIL.
    """
    global applied, skipped, failed
    text = path.read_text(encoding="utf-8")
    probe = marker if marker is not None else new
    if probe in text:
        print(f"  skip  {label}")
        skipped += 1
        return
    if optional and old not in text:
        print(f"  skip  {label} (переходное состояние не встретилось)")
        skipped += 1
        return
    if text.count(old) != 1:
        print(f"  FAIL  {label}: якорь встречается {text.count(old)} раз")
        failed += 1
        return
    path.write_text(text.replace(old, new), encoding="utf-8")
    print(f"  applied  {label}")
    applied += 1


# ── 16b/A: 07 — блок «По факту 1.6b» ─────────────────────────────────────
patch(
    P07,
    "Зафиксируй список файлов из этой беседы, которые нужно загрузить как "
    "контекст в следующие беседы»\n"
    "\n"
    "---\n"
    "\n"
    "### Беседа 1.7: Граф категорий, 3D + 2D (клиент)",
    "Зафиксируй список файлов из этой беседы, которые нужно загрузить как "
    "контекст в следующие беседы»\n"
    "\n"
    "**По факту 1.6b (2026-08-03, беседа закрыта):**\n"
    "- Все 9 пунктов запроса 1 выполнены; тесты 2–9 — одним заходом\n"
    "  (`tests/test-16b-requests2-9.mjs`, 63 проверки ×3 прогона):\n"
    "  puppeteer поверх живого сервера + vite; данные — прямыми вставками\n"
    "  в БД (мок Claude нужен только счётчиком для edge case «generating\n"
    "  не перезапускается»: 0 вызовов, generation_log не растёт).\n"
    "- ГРАБЛЯ (пойман тестом R4): пострендер-вставки в DOM под\n"
    "  dangerouslySetInnerHTML стираются — hash-навигация (клик по\n"
    "  TOC-ссылке) дёргает location → ре-рендер → React пере-применяет\n"
    "  innerHTML, а эффект с неизменными deps не перезапускается.\n"
    "  Решение: SectionView обогащает САМУ HTML-строку до рендера\n"
    "  (`enrichSectionHtml`, DOMParser в useMemo) — якоря `#subsec-*` и\n"
    "  кнопки ⏫ живут в `__html`, терять нечего. Закреплено регрессией 4p\n"
    "  (useEffect в SectionView запрещён).\n"
    "- Дыра спеки фрагмента: disclosure-CSS (.header-disclosure* /\n"
    "  .sec-disclosure, [2114–2226]) не входил в 1.6-document-view.spec,\n"
    "  а DocumentHeader без него нечитаем — портирован, spec дополнен.\n"
    "- `SynthesisFull` не несёт userId → владение клиенту заранее\n"
    "  неизвестно: ✎ (editDocTitle → prompt + PATCH title) и переключатель\n"
    "  публикации работают оптимистично, 403 → алерт «только владелец».\n"
    "- Пауза на странице просмотра: снапшот из GET /:id НЕ навязывает\n"
    "  модалку (доступна по бейджу в GenerationProgress); живая WS-пауза\n"
    "  текущего прогона открывает её сама и перекрывает снапшот.\n"
    "- actions-bar — функциональный минимум («Распечатать» + статус);\n"
    "  кнопки графа/Изменить/лога/экспорта/режимов появятся в\n"
    "  1.7/2.3/2.4/4.2/4.1 — мёртвых заглушек не рисуем.\n"
    "- Заход на страницу в середине генерации: разделы, уже лежащие в БД,\n"
    "  помечаются done в прогрессе; по section_done готовые разделы\n"
    "  дотягиваются транспортом чтения (reloadSections), по\n"
    "  generation_complete перечитывается весь синтез.\n"
    "- `makeSectionCtxDisclosure` из фрагмента НЕ портирован: секционный\n"
    "  контекст в документе не показывается до EditModal — долг → 2.3\n"
    "  (§12); `restoreCapsulesFromHTML` — прежний долг 3.2.\n"
    "- Футер: стоимость — РОВНО `totalCostUsd` (решение 1.6 соблюдено;\n"
    "  квирк updateFooterCost 3/15 $/M не перенесён, регрессия 4p).\n"
    "- Грабли харнесса (в копилку 0.4): (1) после smooth-scroll ассерт\n"
    "  |top|<ε неверен — последний раздел упирается в низ документа,\n"
    "  проверять «в viewport»; (2) сверки текста под\n"
    "  text-transform: uppercase — только textContent (innerText отдаёт\n"
    "  трансформированный, грабля 1.5 повторилась на disclosures);\n"
    "  (3) keep-alive-сокеты мок-сервера держат event loop в finally —\n"
    "  итог печатать до cleanup, race-таймауты на close, process.exit;\n"
    "  (4) кэш puppeteer в песочнице пуст — системный\n"
    "  /opt/google/chrome/chrome (грабля 0.6 повторилась).\n"
    "\n"
    "---\n"
    "\n"
    "### Беседа 1.7: Граф категорий, 3D + 2D (клиент)",
    "16b/A 07 блок «По факту 1.6b»",
    marker="**По факту 1.6b (2026-08-03, беседа закрыта):**",
)

# ── 16b/B: 07 §12 — маркеры TODO(1.6b) закрыты; долг makeSectionCtxDisclosure ──
patch(
    P07,
    "| Маркеры `TODO(1.6b)` (источник pausedState из GET /:id, наполнение "
    "SynthesisPage/CatalogPage, исключение capsule при рендере) | 1.6b | "
    "разделение беседы (серверная половина закрыта 1.6, 2026-08-02) | "
    "внесён 2026-07-30 |",
    "| `makeSectionCtxDisclosure` — disclosure секционного контекста в "
    "документе (sec_context отдаётся в SectionFull, UI не показывает) | "
    "2.3 | 1.6b | внесён 2026-08-03 |",
    "16b/B §12: TODO(1.6b) вычеркнут, долг makeSectionCtxDisclosure → 2.3",
    marker="| `makeSectionCtxDisclosure` — disclosure секционного контекста",
)

# ── 16b/C: 07 шапка — запись ревизии ─────────────────────────────────────
patch(
    P07,
    "> **Правки 2026-08-02 (итоги беседы 1.6)**:",
    "> **Правки 2026-08-03 (итоги беседы 1.6b)**: просмотр документа +\n"
    "> каталог закрыты (63 ✓ ×3); блок «По факту 1.6b» (грабля\n"
    "> dangerouslySetInnerHTML + hash-навигация → enrichSectionHtml,\n"
    "> дыра спеки disclosure-CSS, SynthesisFull без userId, снапшот-пауза\n"
    "> без модалки, минимальный actions-bar); §12 — маркеры TODO(1.6b)\n"
    "> закрыты, внесён долг makeSectionCtxDisclosure → 2.3; spec фрагмента\n"
    "> дополнен disclosure-CSS.\n"
    "\n"
    "> **Правки 2026-08-02 (итоги беседы 1.6)**:",
    "16b/C 07 шапка: запись ревизии 2026-08-03",
    marker="> **Правки 2026-08-03 (итоги беседы 1.6b)**:",
)

# ── 16b/D: spec — disclosure-CSS в спецификацию фрагмента ────────────────
patch(
    SPEC,
    "css*:.actions-bar\ncss*:.action-btn\n",
    "css*:.actions-bar\ncss*:.action-btn\n"
    "# disclosure-CSS шапки и разделов [2114–2226] — дыра спеки, найдена\n"
    "# беседой 1.6b: DocumentHeader без этих стилей нечитаем\n"
    "css*:.header-disclosure\ncss*:.sec-disclosure\n",
    "16b/D spec: disclosure-CSS (.header-disclosure*/.sec-disclosure)",
    marker="css*:.header-disclosure",
)

# ── 16b/E: 07 «Контекст» 2.3 — аннотация про makeSectionCtxDisclosure ────
patch(
    P07,
    "- Из 1.6b: `SynthesisPage.tsx`, `SectionView.tsx` — модалка "
    "открывается поверх страницы синтеза",
    "- Из 1.6b: `SynthesisPage.tsx`, `SectionView.tsx` — модалка "
    "открывается поверх страницы синтеза; долг 1.6b:\n"
    "  `makeSectionCtxDisclosure` (disclosure секционного контекста —\n"
    "  sec_context уже в SectionFull) портируется здесь (§12)",
    "16b/E 07 контекст 2.3: makeSectionCtxDisclosure",
    marker="долг 1.6b:\n  `makeSectionCtxDisclosure`",
)

# ── 16b/F: README — статус, абзац беседы, «Не сделано», диапазон tests ───
patch(
    README,
    "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.6 закрыты",
    "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.6b закрыты",
    "16b/F1 README статус-строка",
)
patch(
    README,
    "Доки пропатчены scripts/patch-docs-conv16.py (идемпотентный\n"
    "apply/skip-скрипт; дорабатывался и после закрытия беседы).\n",
    "Доки пропатчены scripts/patch-docs-conv16.py (идемпотентный\n"
    "apply/skip-скрипт; дорабатывался и после закрытия беседы).\n"
    "\n"
    "Беседа 1.6b (просмотр документа + каталог, клиент): CSS документа\n"
    "целиком в globals.css (+найденная дыра спеки — disclosure-CSS шапки),\n"
    "document/ ×5 (DocumentView без capsule, DocumentHeader с\n"
    "disclosures/капсулой/✎→PATCH, SectionView с обогащением HTML-строки —\n"
    "enrichSectionHtml через DOMParser: пострендер-вставки в\n"
    "dangerouslySetInnerHTML стираются при hash-навигации, ГРАБЛЯ беседы, —\n"
    "TableOfContents с якорями подразделов, DocumentFooter ровно из\n"
    "totalCostUsd), catalog/ ×2 + CatalogPage (вкладки, серверный ?search=,\n"
    "PATCH isPublic), synthesis-store, api/sections, viewOnly-подписка\n"
    "страницы просмотра (pausedState из GET /:id, дотяжка разделов по\n"
    "section_done). Тесты: tests/test-16b-requests2-9.mjs 63/63 ✓ ×3\n"
    "(браузерный харнесс, данные прямыми вставками), регрессия += 4p.\n"
    "Доки пропатчены scripts/patch-docs-conv16b.py.\n",
    "16b/F2 README абзац беседы 1.6b",
    marker="Беседа 1.6b (просмотр документа + каталог, клиент): CSS документа",
)
patch(
    README,
    "Не сделано (Фаза 1+): страницы синтеза/каталога/графа (1.6b, 1.7 —\n"
    "серверный транспорт готов в 1.6), applyReplacement (3.2) и точный",
    "Не сделано (Фаза 1+): страница графа (1.7 — серверный транспорт готов\n"
    "в 1.6), applyReplacement (3.2) и точный",
    "16b/F3 README «Не сделано»",
    optional=True,
)
patch(
    README,
    "tests/             ВСЕ тесты бесед (0.3b–1.6): vm-смоуки байтовой сверки",
    "tests/             ВСЕ тесты бесед (0.3b–1.6b): vm-смоуки байтовой сверки",
    "16b/F4 README диапазон tests/",
)

print(f"\nИтого: applied={applied}, skip={skipped}, fail={failed}")
sys.exit(1 if failed else 0)
