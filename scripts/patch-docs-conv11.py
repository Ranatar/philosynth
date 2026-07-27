#!/usr/bin/env python3
"""
patch-docs-conv11.py — закрытие дыр документации, выявленных беседой 1.1.

Идемпотентный: каждая правка применяется только если old-фрагмент присутствует,
а new-фрагмент ещё нет; повторный прогон даёт skip по всем пунктам.
Только str.replace (re.sub запрещён — интерпретирует \\n; урок Фазы 0).
Точечные правки идут ПЕРВЫМИ, общих замен в этом патче нет.

Правки:
  1. 07, беседа 1.1, запрос 2 — НЕТОЧНОСТЬ: ожидание graph.required =
     ["sum:goals","sum:tensions"] при synthLevel="comparative" неверно;
     sum:tensions добавляет уровне-патч transformative/generative
     (конфиги = исходнику, байт-сверка 0.3; подтверждено test-11-request2).
  2. 07, шапка — строка ревизии «Правка 2026-07-24 (итоги 1.1)».
  3. 07, беседа 2.1 — контекст += topo-sort.ts и cost-estimator.ts.
  4. 07, беседа 2.1 — sourceOf уже портирован в 1.1 (реэкспорт из topo-sort).
  5. 07, беседа 2.1 — estimateCascadeWaveCost/formatWaveCost портируются
     здесь (отложены из 1.1: требуют каскадного анализа).
  6. 07, беседа 1.3 — канон applyBudgetPressure: перенос из временной
     приватной копии cost-estimator (TODO(1.3)).
  7. 04, §1.3 — строка таблицы разнесена по беседам 1.1 / 2.1.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
P07 = ROOT / "docs" / "07-conversation-protocol.md"
P04 = ROOT / "docs" / "04-code-reuse-map.md"

PATCHES: list[tuple[Path, str, str, str]] = [
    (
        P07,
        "1: запрос 2 беседы 1.1 — исправление ожидания (comparative vs transformative)",
        '- «Напиши юнит-тест: resolveContextDeps с params = { method: "dialectical", synthLevel: "comparative", sections: ["graph","glossary","theses"] } — проверь, что graph получает required: ["sum:goals", "sum:tensions"]»',
        '- «Напиши юнит-тест: resolveContextDeps с params = { method: "dialectical", synthLevel: "comparative", sections: ["graph","glossary","theses"] } — проверь, что graph получает required: ["sum:goals"] (BASE без патчей), а при synthLevel: "transformative" — required: ["sum:goals", "sum:tensions"] (sum:tensions добавляет уровне-патч transformative/generative, НЕ comparative; сверено с исходником в 1.1)»',
    ),
    (
        P07,
        "2: шапка 07 — строка ревизии итогов 1.1",
        "> **Правка 2026-07-24 (итоги 0.5)**: добавлена беседа 0.6 (PATCH /auth/me +\n> ProfilePage) — закрытие дыры A3 «отображаемое имя» и клиентского UI\n> смены пароля; ветка в графе §11.",
        "> **Правка 2026-07-24 (итоги 0.5)**: добавлена беседа 0.6 (PATCH /auth/me +\n> ProfilePage) — закрытие дыры A3 «отображаемое имя» и клиентского UI\n> смены пароля; ветка в графе §11.\n>\n> **Правка 2026-07-24 (итоги 1.1)**: исправлено ожидание запроса 2 беседы 1.1\n> (sum:tensions — патч transformative/generative, не comparative); беседа 2.1\n> дополнена переносом estimateCascadeWaveCost/formatWaveCost (отложены из\n> 1.1 — требуют cascade-analyzer) и реэкспортом sourceOf из topo-sort;\n> в беседу 1.3 внесён канон applyBudgetPressure (перенос копии из\n> cost-estimator, метка TODO(1.3) в коде).",
    ),
    (
        P07,
        "3: беседа 2.1 — контекст += topo-sort и cost-estimator",
        "- Из предыдущих бесед: `server/services/synthesis-engine.ts`, `server/services/section-defs-builder.ts`, `server/db/schema.ts`, `shared/types/edit-plan.ts`",
        "- Из предыдущих бесед: `server/services/synthesis-engine.ts`, `server/services/section-defs-builder.ts`, `server/db/schema.ts`, `shared/types/edit-plan.ts`, `server/utils/topo-sort.ts` (sourceOf, sortInTopoOrder-основа), `server/services/cost-estimator.ts` (дополняется wave-функциями, см. первый запрос)",
    ),
    (
        P07,
        "4: беседа 2.1 — sourceOf реэкспорт из topo-sort (портирован в 1.1)",
        "   - sourceOf(ctxKey) — из sourceOf()",
        "   - sourceOf(ctxKey) — УЖЕ портирован в 1.1 (server/utils/topo-sort.ts);\n     здесь — реэкспорт для соответствия карте 04, не дубликат",
    ),
    (
        P07,
        "5: беседа 2.1 — перенос wave-функций в cost-estimator",
        "   - estimatePlanCost(plan):\n     Вызывает estimateCost для regen+add шагов + estimateModeCost для mode шагов",
        "   - estimatePlanCost(plan):\n     Вызывает estimateCost для regen+add шагов + estimateModeCost для mode шагов\n   - Дополни server/services/cost-estimator.ts (файл из 1.1):\n     estimateCascadeWaveCost() — из estimateCascadeWaveCost(),\n     formatWaveCost() — из formatWaveCost().\n     Отложены из беседы 1.1 сознательно: требуют каскадного анализа\n     (computeDependents/волны), который появляется только здесь",
    ),
    (
        P07,
        "6: беседа 1.3 — канон applyBudgetPressure",
        "     Бюджетирование (CONTEXT_BUDGET, FRAGMENT_SHARE) — через getConfig().",
        "     Бюджетирование (CONTEXT_BUDGET, FRAGMENT_SHARE) — через getConfig().\n     Сюда же — КАНОН applyBudgetPressure() (пол 40%, 01-arch §4.13 ч. II)\n     и parentOverheadForSection(): в cost-estimator.ts (беседа 1.1) живёт\n     временная ПРИВАТНАЯ копия applyBudgetPressure с меткой TODO(1.3) —\n     после создания канона переключить cost-estimator на импорт отсюда\n     и удалить копию (проверка приватности+метки — integration-check 4h).",
    ),
    (
        P04,
        "7: 04 §1.3 — строка таблицы разнесена по беседам",
        "| `estimateSubsectionCost()`, `estimateCascadeWaveCost()`, `estimateModeCost()`, `formatWaveCost()` | там же |",
        "| `estimateSubsectionCost()`, `estimateModeCost()` | там же (беседа 1.1) |\n| `estimateCascadeWaveCost()`, `formatWaveCost()` | там же (портируются в беседе 2.1 — требуют cascade-analyzer) |",
    ),
]


def main() -> int:
    applied = skipped = failed = 0
    for path, label, old, new in PATCHES:
        text = path.read_text(encoding="utf-8")
        if new in text:
            print(f"  skip    {label}")
            skipped += 1
            continue
        if old not in text:
            print(f"  FAIL    {label}: old-фрагмент не найден в {path.name}")
            failed += 1
            continue
        if text.count(old) != 1:
            print(f"  FAIL    {label}: old-фрагмент не уникален ({text.count(old)} вхождений)")
            failed += 1
            continue
        path.write_text(text.replace(old, new), encoding="utf-8")
        print(f"  applied {label}")
        applied += 1
    print(f"\nИТОГ: applied={applied}, skip={skipped}, fail={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
