#!/usr/bin/env python3
"""Патч документации по итогам беседы 1.7 (визуализация графа, клиент).

Идемпотентный: каждая правка проверяет наличие нового текста (или явного
маркера) и уходит в skip при повторном прогоне. Отчёт applied/skip/fail.
Запуск из корня репо:
    python3 scripts/patch-docs-conv17.py

Правки:
  17/A  07 блок «По факту 1.7» после «Завершение беседы» 1.7:
        адаптации (а)-(з) — дыра комплекта CSS, пустой граф → модалка,
        PanelCallbacks, touchend легенды, медиа-адаптация легенды
        (отклонение по требованию R9), квирк typeColor, неточность
        R3-hex (доревизия v10); тест 84 ✓ ×2.
  17/B  07 шапка: запись ревизии 2026-08-04.
  17/C  04 §3: пути Graph3D/Graph2D/GraphModal приведены к подпапке
        client/components/graph/ (унификация с §1.7 и фактом).
  17/D  README: статус после 1.7 (заголовок, абзац беседы, «Не сделано»,
        «Следующие по графу», диапазон tests/).
  17/E  07 §12: долг «Экспорт графа MMD/PNG/JSON» → 4.2 (от 1.7).
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
P07 = ROOT / "docs" / "07-conversation-protocol.md"
P04 = ROOT / "docs" / "04-code-reuse-map.md"
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
    print(f"  APPLY {label}")
    applied += 1


# ══ 17/A — 07: блок «По факту 1.7» ══════════════════════════════════════

A_ANCHOR = (
    "- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) "
    "для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. "
    "Зафиксируй список файлов из этой беседы, которые нужно загрузить как "
    "контекст в следующие беседы»\n\n\n## 4. Протокол Фазы 2"
)
A_BLOCK = (
    "- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) "
    "для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. "
    "Зафиксируй список файлов из этой беседы, которые нужно загрузить как "
    "контекст в следующие беседы»\n"
    "\n"
    "**По факту 1.7 (2026-08-04):** беседа закрыта; запросы 2-9 — единым\n"
    "браузерным тестом `tests/test-17-requests2-9.mjs`, 84 ✓ / 0 ✗ ×2\n"
    "(живой стек + системный Chromium + SwiftShader-WebGL; журнал —\n"
    "глава 1.7 `NEXT-CONTEXT.md`). Адаптации: (а) ДЫРА КОМПЛЕКТА — CSS\n"
    "графа [931-1374] не входил ни в один фрагмент/спеку (спека\n"
    "graph-state-extras машинная), портирован в globals.css напрямую;\n"
    "(б) пустой граф открывает модалку с пустым состоянием, не alert;\n"
    "(в) nodeGeometry3D/mkSprite — utils/graph-geometry.ts (по 05);\n"
    "(г) панели через PanelCallbacks; (д) touchend легенды не портирован\n"
    "(тач синтезирует click); (е) медиа-адаптация легенды ≤600px —\n"
    "ОТКЛОНЕНИЕ от исходника по требованию запроса 9: без него легенда\n"
    "богатого графа накрывала весь канвас и жесты не достигали canvas;\n"
    "(ж) квирк исходника: fuzzy typeColor даёт подстрочным типам один\n"
    "цвет («логическая» ⊂ «онтологическая»); (з) НЕТОЧНОСТЬ запроса 3\n"
    "выше: hex #e74c3c/#3498db — статическая палитра TC доревизии v10,\n"
    "динамические палитры дают hue по сидам (онтологическ→215,\n"
    "эпистемологическ→145) — тест сверяет hue. Экспорт MMD/PNG/JSON —\n"
    "заглушки TODO(4.2), долг внесён в §12.\n"
    "\n\n## 4. Протокол Фазы 2"
)

# ══ 17/B — 07: запись ревизии в шапке ══════════════════════════════════

B_ANCHOR = (
    "# PhiloSynth Service — Протокол бесед\n"
    "\n"
    "> **Правки 2026-08-03 (итоги беседы 1.6b)**:"
)
B_NEW = (
    "# PhiloSynth Service — Протокол бесед\n"
    "\n"
    "> **Правки 2026-08-04 (итоги беседы 1.7)**: визуализация графа\n"
    "> закрыта (84 ✓ ×2); блок «По факту 1.7» (дыра комплекта CSS,\n"
    "> медиа-адаптация легенды по требованию запроса 9, квирк fuzzy\n"
    "> typeColor, неточность R3-hex доревизии v10); §12 — долг «Экспорт\n"
    "> графа MMD/PNG/JSON» → 4.2; 04 §3 — пути графовых компонентов\n"
    "> приведены к client/components/graph/.\n"
    "\n"
    "> **Правки 2026-08-03 (итоги беседы 1.6b)**:"
)

# ══ 17/C — 04 §3: пути графовых компонентов ════════════════════════════

C1_OLD = ("| `build3D()` — Three.js (вся 3D-логика) | "
          "`client/components/Graph3D.tsx` (React-обёртка) |")
C1_NEW = ("| `build3D()` — Three.js (вся 3D-логика) | "
          "`client/components/graph/Graph3D.tsx` (React-обёртка) |")
C2_OLD = ("| `build2D()` — D3.js (вся 2D-логика) | "
          "`client/components/Graph2D.tsx` (React-обёртка) |")
C2_NEW = ("| `build2D()` — D3.js (вся 2D-логика) | "
          "`client/components/graph/Graph2D.tsx` (React-обёртка) |")
C3_OLD = ("| `buildLegend()`, `switchView()`, `openGraph()`, `closeGraph()`, "
          "`clearLegendFilter()` | `client/components/GraphModal.tsx` |")
C3_NEW = ("| `buildLegend()`, `switchView()`, `openGraph()`, `closeGraph()`, "
          "`clearLegendFilter()` | `client/components/graph/GraphModal.tsx` |")

# ══ 17/D — README ══════════════════════════════════════════════════════

D1_OLD = "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.6b закрыты"
D1_NEW = "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.7 закрыты"

D2_ANCHOR = "Доки пропатчены scripts/patch-docs-conv16b.py.\n"
D2_NEW = (
    "Доки пропатчены scripts/patch-docs-conv16b.py.\n"
    "\n"
    "Беседа 1.7 (визуализация графа, клиент): components/graph/ ×7\n"
    "(graph-utils с динамическими палитрами и адаптером\n"
    "buildGFromGraphData, Graph3D — three r128: формы по ролям,\n"
    "drag/orbit/zoom/тач, Graph2D — d3-force: SVG-маркеры,\n"
    "рефлексивные дуги, hull кластеров, NodePanel с секцией РАСШИРЕННЫЕ,\n"
    "EdgePanel, GraphLegend с фильтрацией, GraphModal с вкладками 3D/2D),\n"
    "utils/graph-{physics,geometry}, api/elements (getCategories),\n"
    "кнопка «◈ Граф» в SynthesisPage, CSS графа целиком в globals.css\n"
    "(+медиа-адаптация легенды ≤600px — отклонение по требованию\n"
    "мобильного теста R9). Тесты: tests/test-17-requests2-9.mjs\n"
    "84/84 ✓ ×2 (модульные формы/палитры через tsx-импорт клиентских\n"
    "модулей + браузерные 3D/2D/панели/кластеры/hover/edge cases +\n"
    "честный CDP-touch: pinch/orbit/tap). Экспорт MMD/PNG/JSON —\n"
    "заглушки TODO(4.2). Доки пропатчены scripts/patch-docs-conv17.py.\n"
)

D3_OLD = (
    "Не сделано (Фаза 1+): страница графа (1.7 — серверный транспорт готов\n"
    "в 1.6), applyReplacement (3.2) и точный\n"
    "confirm деградации skip (2.2),"
)
D3_NEW = (
    "Не сделано (Фаза 2+): applyReplacement (3.2) и точный\n"
    "confirm деградации skip (2.2),"
)

D4_OLD = (
    "Следующие по графу 07 — клиентские беседы 1.6b (просмотр документа +\n"
    "каталог; закроет TODO(1.6b), включая pausedState из GET /syntheses/:id)\n"
    "и 1.7 (граф; транспорт GET `/categories` готов в 1.6). Параллельно\n"
    "можно вести 2.1 / 3.1.\n"
)
D4_NEW = (
    "Фаза 1 закрыта целиком (1.1–1.7). Следующие по графу 07 — беседы\n"
    "Фазы 2 (2.1 каскады → 2.2 plan-executor → 2.3 Edit Modal);\n"
    "параллельно можно вести 3.1 (мета-синтез).\n"
)

D5_OLD = "tests/             ВСЕ тесты бесед (0.3b–1.6b): vm-смоуки байтовой сверки"
D5_NEW = "tests/             ВСЕ тесты бесед (0.3b–1.7): vm-смоуки байтовой сверки"

# ══ 17/E — 07 §12: долг экспорта графа ═════════════════════════════════

E_ANCHOR = (
    "| `makeSectionCtxDisclosure` — disclosure секционного контекста в "
    "документе (sec_context отдаётся в SectionFull, UI не показывает) | 2.3 "
    "| 1.6b | внесён 2026-08-03 |\n"
)
E_NEW = (
    "| `makeSectionCtxDisclosure` — disclosure секционного контекста в "
    "документе (sec_context отдаётся в SectionFull, UI не показывает) | 2.3 "
    "| 1.6b | внесён 2026-08-03 |\n"
    "| Экспорт графа MMD/PNG/JSON (кнопки GraphModal — заглушки, метки "
    "TODO(4.2) в GraphModal.tsx; серверные services/export/*) | 4.2 | 1.7 "
    "| внесён 2026-08-04 |\n"
)


def main() -> None:
    print("Патч документации — итоги беседы 1.7")
    print("17/A  07: блок «По факту 1.7»")
    patch(P07, A_ANCHOR, A_BLOCK, "07 «По факту 1.7»",
          marker="**По факту 1.7 (2026-08-04):**")
    print("17/B  07: запись ревизии в шапке")
    patch(P07, B_ANCHOR, B_NEW, "07 шапка 2026-08-04",
          marker="> **Правки 2026-08-04 (итоги беседы 1.7)**")
    print("17/C  04 §3: пути графовых компонентов → graph/")
    patch(P04, C1_OLD, C1_NEW, "04 §3 Graph3D → graph/")
    patch(P04, C2_OLD, C2_NEW, "04 §3 Graph2D → graph/")
    patch(P04, C3_OLD, C3_NEW, "04 §3 GraphModal → graph/")
    print("17/D  README: статус после 1.7")
    patch(README, D1_OLD, D1_NEW, "README заголовок статуса")
    patch(README, D2_ANCHOR, D2_NEW, "README абзац беседы 1.7",
          marker="Беседа 1.7 (визуализация графа, клиент):")
    patch(README, D3_OLD, D3_NEW, "README «Не сделано»")
    patch(README, D4_OLD, D4_NEW, "README «Следующие по графу»")
    patch(README, D5_OLD, D5_NEW, "README диапазон tests/")
    print("17/E  07 §12: долг экспорта графа → 4.2")
    patch(P07, E_ANCHOR, E_NEW, "07 §12 экспорт графа",
          marker="| Экспорт графа MMD/PNG/JSON")
    print(f"\nИтог: applied={applied}, skip={skipped}, fail={failed}")
    sys.exit(1 if failed else 0)


main()
