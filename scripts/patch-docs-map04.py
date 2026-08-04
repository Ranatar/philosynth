#!/usr/bin/env python3
"""Правка карты 04 по фактическому размещению кода в репозитории.

Карта работает как ИНДЕКС: по ней беседы делают ревью на завершении, на
неё ссылаются спецификации комплектов. Расхождения найдены машинной
сверкой `scripts/check-map-04.py` (проверяет, объявлен ли идентификатор
в названном картой модуле) и ручной доразметкой двух случаев, которые
машине не видны, потому что имя при порте изменилось.

Все правки касаются УЖЕ ЗАКРЫТЫХ бесед — код на месте и работает,
неверен только адрес в карте.

  1. sourceOf() [1.1] — карта: cascade-analyzer.ts (беседа 2.1);
     факт: server/utils/topo-sort.ts (utils-слой, вынесен в 1.1).
  2. buildSubsectionMap() [1.2] — карта: cascade-analyzer.ts;
     факт: server/services/section-defs-builder.ts.
  3. METHOD_CODE/LEVEL_CODE/ORDER_CODE/DEPTH_CODE [0.1] — карта:
     shared/constants/labels.ts и shared/utils/transliterate.ts;
     факт: packages/shared/constants/methods.ts (обе строки).
  4. MODE_DEPS [1.3] — карта: mode-service.ts (беседа 4.1);
     факт: server/config/mode-deps.ts (посеян раньше).
  5. Динамические палитры графа [1.7] — карта: «React-компоненты
     GraphViewer, NodePanel, EdgePanel»; компонента GraphViewer не
     существует, палитры живут в graph-utils.ts, представления —
     Graph3D/Graph2D.
  6. buildLegend() [1.7] — карта: GraphModal.tsx; факт: отдельный
     компонент GraphLegend.tsx. clearLegendFilter() — graph-utils.ts.
  7. updateSectionWarnings() [1.1] — на сервере назван
     computeSectionAdvice(); под прежним именем в коде не найти.
  8. updateCompatAdvisor() — числится портированным, фактически долг
     беседы 3.2 (§12 протокола 07).

Идемпотентный: сперва проверяется наличие нового текста (skip), затем
якоря (нет — FAIL). str.replace, НЕ re.sub.

Запуск из корня репо:  python3 scripts/patch-docs-map04.py
"""
from pathlib import Path

applied, skipped, failed = [], [], []


def patch(path: str, old: str, new: str, tag: str) -> None:
    p = Path(path)
    if not p.exists():
        failed.append(f"{tag}: нет файла {path}")
        return
    text = p.read_text(encoding="utf-8")
    if new in text:
        skipped.append(tag)
        return
    if old not in text:
        failed.append(f"{tag}: якорь не найден в {path}")
        return
    if text.count(old) > 1:
        failed.append(f"{tag}: якорь неуникален ({text.count(old)}) в {path}")
        return
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    applied.append(tag)


M = "docs/04-code-reuse-map.md"

# ─────────────────────────────────────────────────────────────
# 1+2. Строка каскадного анализа: sourceOf и buildSubsectionMap
# ─────────────────────────────────────────────────────────────
patch(
    M,
    "| `computeDependents()`, `sourceOf()`, `getIntraDependents()`, "
    "`getCrossSecDependents()`, `buildSubsectionMap()`, `getAffectedModes()`, ",
    "| `computeDependents()`, `getIntraDependents()`, "
    "`getCrossSecDependents()`, `getAffectedModes()`, ",
    "map04/1 — sourceOf и buildSubsectionMap из строки каскада",
)
patch(
    M,
    "`canonicalSubsectionKey()` (каноникализация портретных заголовков) | "
    "`server/services/cascade-analyzer.ts` |\n",
    "`canonicalSubsectionKey()` (каноникализация портретных заголовков) | "
    "`server/services/cascade-analyzer.ts` |\n"
    "| `sourceOf()` — ФАКТ (беседа 1.1): вынесен в utils-слой, "
    "cascade-analyzer импортирует оттуда | `server/utils/topo-sort.ts` |\n"
    "| `buildSubsectionMap()` — ФАКТ (беседа 1.2): строится из конфига "
    "`subsection_map` рядом с определениями разделов | "
    "`server/services/section-defs-builder.ts` |\n",
    "map04/2 — строки фактического размещения sourceOf/buildSubsectionMap",
)

# ─────────────────────────────────────────────────────────────
# 3. Коды методов/уровней/глубины/порядка — две строки
# ─────────────────────────────────────────────────────────────
patch(
    M,
    "| `REVERSE_ML`, `REVERSE_DL`, `REVERSE_SL`, `METHOD_CODE`, `LEVEL_CODE`, "
    "`ORDER_CODE`, `DEPTH_CODE` | `shared/constants/labels.ts` |",
    "| `REVERSE_ML`, `REVERSE_DL`, `REVERSE_SL` | `shared/constants/labels.ts` |\n"
    "| `METHOD_CODE`, `LEVEL_CODE`, `ORDER_CODE`, `DEPTH_CODE` (односимвольные "
    "коды для имени файла; DEPTH — цифры, ORDER — заглавные) — ФАКТ (беседа 0.1) "
    "| `shared/constants/methods.ts` |",
    "map04/3 — коды в methods.ts (строка labels)",
)
patch(
    M,
    "| `METHOD_CODE`, `LEVEL_CODE`, `transliterate()` | "
    "`shared/utils/transliterate.ts` |",
    "| `transliterate()` | `shared/utils/transliterate.ts` |\n"
    "| `METHOD_CODE`, `LEVEL_CODE` (используются при сборке имени файла) — "
    "ФАКТ (беседа 0.1) | `shared/constants/methods.ts` |",
    "map04/4 — коды в methods.ts (строка transliterate)",
)

# ─────────────────────────────────────────────────────────────
# 4. MODE_DEPS
# ─────────────────────────────────────────────────────────────
patch(
    M,
    "| `MODE_DEPS`, `getEffectiveModeDeps()` | `server/services/mode-service.ts` "
    "(→ БД) |",
    "| `getEffectiveModeDeps()` | `server/services/mode-service.ts` (→ БД, "
    "беседа 4.1) |\n"
    "| `MODE_DEPS` — ФАКТ: посеян раньше владельца, лежит отдельным конфигом "
    "| `server/config/mode-deps.ts` |",
    "map04/5 — MODE_DEPS в config/mode-deps.ts",
)

# ─────────────────────────────────────────────────────────────
# 5. Динамические палитры графа: GraphViewer не существует
# ─────────────────────────────────────────────────────────────
patch(
    M,
    "`showNodePanel()`, `showEdgePanel()` | React-компоненты GraphViewer, "
    "NodePanel, EdgePanel |",
    "`showNodePanel()`, `showEdgePanel()` | ФАКТ (беседа 1.7): палитры и сиды "
    "оттенков — `client/components/graph/graph-utils.ts`; представления — "
    "`Graph3D.tsx` и `Graph2D.tsx` (компонента `GraphViewer` не создавалась); "
    "панели — `NodePanel.tsx`, `EdgePanel.tsx` |",
    "map04/6 — палитры графа в graph-utils, без GraphViewer",
)

# ─────────────────────────────────────────────────────────────
# 6. buildLegend и clearLegendFilter
# ─────────────────────────────────────────────────────────────
patch(
    M,
    "| `buildLegend()`, `switchView()`, `openGraph()`, `closeGraph()`, "
    "`clearLegendFilter()` | `client/components/graph/GraphModal.tsx` |",
    "| `switchView()`, `openGraph()`, `closeGraph()` | "
    "`client/components/graph/GraphModal.tsx` |\n"
    "| `buildLegend()` — ФАКТ (беседа 1.7): вынесен в отдельный компонент "
    "| `client/components/graph/GraphLegend.tsx` |\n"
    "| `clearLegendFilter()` — ФАКТ (беседа 1.7): живёт рядом с состоянием "
    "графа | `client/components/graph/graph-utils.ts` |",
    "map04/7 — buildLegend в GraphLegend.tsx",
)

# ─────────────────────────────────────────────────────────────
# 7. updateSectionWarnings → computeSectionAdvice
# ─────────────────────────────────────────────────────────────
patch(
    M,
    "`computeSectionWarnings()`, `updateSectionWarnings()` | там же + "
    "`client/components/synthesis/SectionWarnings.tsx` |",
    "`computeSectionWarnings()`, `updateSectionWarnings()` → на сервере назван "
    "`computeSectionAdvice()` (ФАКТ, беседа 1.1: возвращает структуры "
    "`{icon,text,severity}` вместо правки DOM — под прежним именем в коде не "
    "искать) | там же + `client/components/synthesis/SectionWarnings.tsx` |",
    "map04/8 — updateSectionWarnings → computeSectionAdvice",
)

# ─────────────────────────────────────────────────────────────
# 8. updateCompatAdvisor — долг 3.2, а не портированное
# ─────────────────────────────────────────────────────────────
patch(
    M,
    "`chipClassForRating()`, `updateCompatAdvisor()` | "
    "`server/services/compat-advisor.ts`",
    "`chipClassForRating()` | `server/services/compat-advisor.ts`",
    "map04/9 — updateCompatAdvisor из списка портированных",
)
patch(
    M,
    "`applyReplacement()` — НЕ портирован, TODO 2.x (кнопки замен; "
    "replacements уже в entry) |",
    "`applyReplacement()` и `updateCompatAdvisor()` — НЕ портированы, долг "
    "беседы 3.2 (§12 протокола 07): кнопки замен и перерисовка советника, "
    "replacements уже в entry |",
    "map04/10 — updateCompatAdvisor в долги 3.2",
)

# ─────────────────────────────────────────────────────────────
# 9. Шапка ревизий
# ─────────────────────────────────────────────────────────────
patch(
    M,
    "> **Ревизия 2026-07-29 (беседа 1.5)**",
    "> **Правка 2026-08-04 (сверка адресов)**: адреса приведены к "
    "фактическому размещению по итогам машинной сверки\n"
    "> `scripts/check-map-04.py` — она проверяет, объявлен ли каждый\n"
    "> идентификатор карты в названном ею модуле. Исправлены: `sourceOf`,\n"
    "> `buildSubsectionMap`, коды `METHOD_CODE`/`LEVEL_CODE`/`ORDER_CODE`/\n"
    "> `DEPTH_CODE`, `MODE_DEPS`, палитры графа (компонента `GraphViewer` не\n"
    "> создавалась), `buildLegend`, `updateSectionWarnings` (переименован в\n"
    "> `computeSectionAdvice`), `updateCompatAdvisor` (не портирован — долг\n"
    "> беседы 3.2). Все случаи — из уже закрытых бесед: код на месте,\n"
    "> неверен был только адрес.\n"
    ">\n"
    "> **Ревизия 2026-07-29 (беседа 1.5)**",
    "map04/11 — запись ревизии в шапке",
)

print(f"applied={len(applied)} skipped={len(skipped)} failed={len(failed)}")
for t in applied:
    print(f"  APPLY  {t}")
for t in skipped:
    print(f"  skip   {t}")
for t in failed:
    print(f"  FAIL   {t}")
raise SystemExit(1 if failed else 0)
