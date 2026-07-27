#!/usr/bin/env python3
"""
patch-docs-conv12.py — правки документации по итогам беседы 1.2.
Идемпотентный: каждая правка применяется через str.replace по уникальному
old-фрагменту; если old не найден, но найден new — skip; иначе — fail.
Повторный прогон должен дать skip по всем пунктам.

Правки:
  07/A  первый запрос 1.2: groupPasses(defs, effectiveDeps) → groupPasses(defs)
        (фактическая сигнатура исходника; порядок разделов задаёт
        buildDynamicOrder беседы 1.1 ДО группировки).
  07/B  тест buildSYS: ориентир длины «~5000–8000» → факт исходника 3192.
  07/C  тест groupPasses: формулировка без несуществующего аргумента
        effectiveDeps, семантика та же (sum раньше graph, разные проходы).
  07/D  шапка-ревизия 07: блок «Правка 2026-07-27 (итоги 1.2)».
  04/E  §2.2: serializeParts вынесен из строки baseCtx (prompt-builder)
        в отдельную строку с целевым модулем section-defs-builder.
  04/F  шапка-ревизия 04: строка о правке 2026-07-27.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D07 = ROOT / "docs" / "07-conversation-protocol.md"
D04 = ROOT / "docs" / "04-code-reuse-map.md"

applied, skipped, failed = [], [], []


def patch(path: Path, name: str, old: str, new: str) -> None:
    """new проверяется ПЕРВЫМ: old может быть префиксом/подстрокой new
    (правки-дописывания шапок), иначе повторный прогон дублирует блок."""
    text = path.read_text(encoding="utf-8")
    if new in text:
        skipped.append(name)
    elif old in text:
        path.write_text(text.replace(old, new, 1), encoding="utf-8")
        applied.append(name)
    else:
        failed.append(name)


# ── 07/A: сигнатура groupPasses в первом запросе беседы 1.2 ──
patch(
    D07,
    "07/A groupPasses в первом запросе 1.2",
    "   - groupPasses(defs, effectiveDeps) — как в исходнике",
    "   - groupPasses(defs) — как в исходнике: по одному разделу на проход\n"
    "     (последовательная генерация). effectiveDeps НЕ принимает: порядок\n"
    "     разделов определяется раньше — buildDynamicOrder (беседа 1.1)",
)

# ── 07/B: ориентир длины buildSYS в тесте ──
patch(
    D07,
    "07/B длина buildSYS в тесте",
    "Длина ~5000–8000 символов (как в исходнике)?»",
    "Длина ~3200 символов (факт исходника: 3192 для этого набора параметров;"
    " критерий — байтовое равенство с buildSYS исходника)?»",
)

# ── 07/C: тест groupPasses без несуществующего аргумента ──
patch(
    D07,
    "07/C формулировка теста groupPasses",
    "- «Протестируй groupPasses: defs с 6 разделами, effectiveDeps где graph "
    "зависит от sum — sum и graph попадают в разные проходы (sum — раньше)?»",
    "- «Протестируй groupPasses: defs с 6 разделами (их порядок уже задан "
    "buildDynamicOrder, где graph зависит от sum) — по одному разделу на "
    "проход; sum и graph попадают в разные проходы (sum — раньше)?»",
)

# ── 07/D: шапка-ревизия ──
patch(
    D07,
    "07/D шапка-ревизия 07",
    "> в беседу 1.3 внесён канон applyBudgetPressure (перенос копии из\n"
    "> cost-estimator, метка TODO(1.3) в коде).\n",
    "> в беседу 1.3 внесён канон applyBudgetPressure (перенос копии из\n"
    "> cost-estimator, метка TODO(1.3) в коде).\n"
    ">\n"
    "> **Правка 2026-07-27 (итоги 1.2)**: groupPasses приведён к фактической\n"
    "> сигнатуре исходника — groupPasses(defs), по одному разделу на проход,\n"
    "> без effectiveDeps (первый запрос и тест беседы 1.2); ориентир длины\n"
    "> buildSYS в тесте исправлен на факт исходника (3192 симв.).\n",
)

# ── 04/E: serializeParts → section-defs-builder ──
patch(
    D04,
    "04/E serializeParts в §2.2",
    "| `baseCtx(p, sectionKey)` = `baseCtxStatic()` + `baseCtxParents()`, "
    "`serializeParts()` | Параметры из БД; родительский контекст стал "
    "пер-секционным | `server/services/prompt-builder.ts` |",
    "| `baseCtx(p, sectionKey)` = `baseCtxStatic()` + `baseCtxParents()` | "
    "Параметры из БД; родительский контекст стал пер-секционным | "
    "`server/services/prompt-builder.ts` |\n"
    "| `serializeParts(parts)` | Без изменений в логике; живёт рядом с "
    "`buildSectionDefs`, чьи parts сериализует | "
    "`server/services/section-defs-builder.ts` |",
)

# ── 04/F: шапка-ревизия 04 ──
patch(
    D04,
    "04/F шапка-ревизия 04",
    "> **Ревизия 2026-07-22**: карта актуализирована по исходнику 26 024 стр.\n"
    "> Спецификации подсистем v11 — 01-architecture, §4.12–4.15.\n",
    "> **Ревизия 2026-07-22**: карта актуализирована по исходнику 26 024 стр.\n"
    "> Спецификации подсистем v11 — 01-architecture, §4.12–4.15.\n"
    ">\n"
    "> **Правка 2026-07-27 (итоги 1.2)**: в §2.2 `serializeParts` вынесен в\n"
    "> отдельную строку с целевым модулем `section-defs-builder.ts`\n"
    "> (фактическое размещение: функция сериализует parts, которые строит\n"
    "> `buildSectionDefs`).\n",
)

print(f"applied={len(applied)}: {', '.join(applied) or '—'}")
print(f"skipped={len(skipped)}: {', '.join(skipped) or '—'}")
print(f"failed={len(failed)}: {', '.join(failed) or '—'}")
raise SystemExit(1 if failed else 0)
