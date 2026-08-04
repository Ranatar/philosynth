#!/usr/bin/env python3
"""Патч документации по итогам беседы 2.1 (Cascade Analyzer + Edit Planner).

Правки (все идемпотентны — повторный прогон даёт skip):
  21/A  07: блок «По факту 2.1» после блока «Завершение беседы» беседы 2.1
  21/B  07 §12: вычеркнуты закрытые долги 2.1 (canonicalSubsectionKey;
        estimateCascadeWaveCost/formatWaveCost), внесён новый долг
        getEffectiveModeDepsFromConfig/MODE_TITLES → 4.1
  21/C  07: запись ревизии 2026-08-04 (итоги 2.1) в шапке
  21/D  04 §1.3: пометка wave-функций «портируются» → «портированы (2.1)»
  21/E1 README: статус — Фаза 2 начата, 2.1 закрыта
  21/E2 README: абзац беседы 2.1 после абзаца 1.7
  21/E3 README: tests/ 0.3b–1.7 → 0.3b–2.1

Запуск из корня репо: python3 scripts/patch-docs-conv21.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
applied, skipped, failed = [], [], []


def patch(name: str, path: Path, marker: str, old: str, new: str) -> None:
    """Заменить old→new, если marker ещё не в файле; old обязан быть уникален."""
    text = path.read_text(encoding="utf-8")
    if marker in text:
        skipped.append(name)
        return
    if text.count(old) != 1:
        failed.append(f"{name}: якорь встречается {text.count(old)} раз")
        return
    path.write_text(text.replace(old, new), encoding="utf-8")
    applied.append(name)


def patch_del(name: str, path: Path, row: str) -> None:
    """Удалить строку row; отсутствие строки — уже применено (skip)."""
    text = path.read_text(encoding="utf-8")
    if row not in text:
        skipped.append(name)
        return
    if text.count(row) != 1:
        failed.append(f"{name}: строка встречается {text.count(row)} раз")
        return
    path.write_text(text.replace(row, ""), encoding="utf-8")
    applied.append(name)


P07 = ROOT / "docs/07-conversation-protocol.md"
P04 = ROOT / "docs/04-code-reuse-map.md"
README = ROOT / "README.md"

# ── 21/A: блок «По факту 2.1» ────────────────────────────────────────────
# Якорь — последний пункт завершения 2.1 вместе с разделителем и заголовком
# 2.2 (пункты завершения одинаковы во всех беседах, уникальность даёт хвост).
FACT_21 = """**По факту 2.1 (2026-08-04):** беседа закрыта; запросы 2-5 — единым
тестом `tests/test-21-requests2-5.mjs` (сервисный уровень + HTTP-смоук
§2.6), 39 ✓ / 0 ✗ ×2; браузер не нужен. Интеграция — секции 2l/4r/5o
в `server/integration-check.mts` (INTEGRATION OK живьём). Журнал —
глава 2.1 `NEXT-CONTEXT.md`. Адаптации: (а) estimatedCost НЕ хранится
в edit_plans (02 §2.13 без колонки; 03 §4.2 отдаёт поле) — вычисляется
заново при create/GET/PATCH; (б) статусы шагов: пользовательские
confirmed, каскадные pending (01 §4.5 п.4); (в) удаление результата
режима — type='delete' с target «modeKey:index» (отдельного типа в 03
§4.2 нет); (г) remove+add одного раздела допустимы («заменить», edge
case 4), regen∩remove — VALIDATION_ERROR; (д) updatePlan пересобирает
шаги целиком с переносом решений по (type, target), снятые базовые
остаются skipped; (е) АНТИ-ЦИКЛ: cascade-analyzer грузит синтез
локально (loadSynthesisLocal), не импортируя generation-service —
иначе цикл через context-builder (getCanonicalizer появился там при
закрытии TODO(2.1)); (ж) canonicalSubsectionKey на сервере асинхронна
(варианты из Registry), sync-потребителям выдаётся getCanonicalizer();
(з) планы owner-only; создание при активной генерации допустимо —
PLAN_CONFLICT про исполнение (2.2); (и) buildPlanOrder живёт в
plan-order-builder.ts (05), в cascade-analyzer — реэкспорт (как
sourceOf). Локальные порты MODE_TITLES/getEffectiveModeDepsFromConfig —
метки TODO(4.1), долг в §12.

---

### Беседа 2.2: Plan Executor + Regeneration (бэкенд)"""

patch(
    "21/A По-факту-2.1",
    P07,
    "**По факту 2.1 (2026-08-04):**",
    """- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 2.2: Plan Executor + Regeneration (бэкенд)""",
    """- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

"""
    + FACT_21,
)

# ── 21/B: §12 — вычеркнуть закрытые долги, внести новый ─────────────────
patch_del(
    "21/B §12 canonicalSubsectionKey",
    P07,
    "| `canonicalSubsectionKey` — каноникализация ключей подразделов | 2.1 | 1.3 | в тексте 2.1 |\n",
)
patch(
    "21/B2 §12 wave-функции + новый долг 4.1",
    P07,
    "| `getEffectiveModeDepsFromConfig` / `MODE_TITLES`",
    "| `estimateCascadeWaveCost` / `formatWaveCost` | 2.1 | 1.1 | в тексте 2.1 |\n",
    "| `getEffectiveModeDepsFromConfig` / `MODE_TITLES` — локальные порты в cascade-analyzer; владелец `getEffectiveModeDeps`/`MODE_CONFIG` — mode-service (метки TODO(4.1) в коде) | 4.1 | 2.1 | внесён 2026-08-04 |\n",
)

# ── 21/C: запись ревизии в шапке 07 ─────────────────────────────────────
patch(
    "21/C шапка ревизии",
    P07,
    "**Правки 2026-08-04 (итоги беседы 2.1)**",
    """# PhiloSynth Service — Протокол бесед

> **Правки 2026-08-04 (итоги беседы 1.7)**""",
    """# PhiloSynth Service — Протокол бесед

> **Правки 2026-08-04 (итоги беседы 2.1)**: каскадный анализ и
> планировщик закрыты (39 ✓ ×2, сервис + HTTP §2.6); блок
> «По факту 2.1» (estimatedCost не хранится — живая оценка;
> статусы confirmed/pending; delete «modeKey:index»; полная
> пересборка updatePlan с carryOver; анти-цикл loadSynthesisLocal;
> async-каноникализация с getCanonicalizer()); §12 — долги
> canonicalSubsectionKey и wave-функций закрыты (getCanonicalizer
> в context-builder; estimateCascadeWaveCost/formatWaveCost в
> cost-estimator), внесён долг локальных портов
> режимов → 4.1; 04 §1.3 — пометка wave-функций переведена в факт.

> **Правки 2026-08-04 (итоги беседы 1.7)**""",
)

# ── 21/D: 04 §1.3 — wave-функции портированы ────────────────────────────
patch(
    "21/D 04 §1.3 wave-факт",
    P04,
    "портированы беседой 2.1",
    "| `estimateCascadeWaveCost()`, `formatWaveCost()` | там же (портируются в беседе 2.1 — требуют cascade-analyzer) |",
    "| `estimateCascadeWaveCost()`, `formatWaveCost()` | там же — ФАКТ: портированы беседой 2.1 (потребовали каскадного анализа; потребитель — estimatePlanCost) |",
)

# ── 21/F: неточность формулировки тестового запроса R3 ──────────────────
patch(
    "21/F По-факту: неточность R3",
    P07,
    "НЕТОЧНОСТЬ тестового запроса 3 выше",
    "метки TODO(4.1), долг в §12.\n\n---",
    """метки TODO(4.1), долг в §12. НЕТОЧНОСТЬ тестового запроса 3 выше:
для dialogue `glossary:table` — лишь OPTIONAL-зависимость, поэтому
«синтез без glossary» при наличии graph/theses жёстких потерь НЕ даёт
(отсутствие glossary порождает C3-рекомендацию, не C1); тест закрывает
намерение двумя фикстурами — ["sum"] (жёсткие потери graph:nodes_compact
и theses:summary, где dialogue:synthesis отсечён как self-источник) и
["sum","graph"] (theses:summary замещается graph:nodes — C2-подстановка
вместо потери).\n\n---""",
)

# ── 21/E: README ────────────────────────────────────────────────────────
patch(
    "21/E1 README статус",
    README,
    "Фаза 2 — беседа 2.1 закрыта",
    "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.7 закрыты",
    "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.7 закрыты; Фаза 2 — беседа 2.1 закрыта",
)

README_21 = """
Беседа 2.1 (каскадный анализ + планировщик, бэкенд):
services/cascade-analyzer.ts (computeDependents, каноникализация с
getCanonicalizer → закрыт TODO(2.1) в context-builder, intra/cross-sec
зависимые, getAffectedModes, фактические зависимости из context_log,
analyzeImpact = серверный updateLiveCascade), services/plan-order-builder.ts
(buildPlanOrder v10), services/edit-planner.ts (планы edit_plans:
создание/чтение/PATCH с пересборкой каскада/удаление, живая оценка
estimatePlanCost), routes/plans.ts (03 §2.6; execute — беседа 2.2),
wave-функции в cost-estimator (долг 1.1 закрыт). Тесты:
tests/test-21-requests2-5.mjs 39/39 ✓ ×2 (сервис + HTTP; без браузера).
Доки пропатчены scripts/patch-docs-conv21.py.
"""

patch(
    "21/E2 README абзац 2.1",
    README,
    "Беседа 2.1 (каскадный анализ + планировщик, бэкенд):",
    "Доки пропатчены scripts/patch-docs-conv17.py.\n",
    "Доки пропатчены scripts/patch-docs-conv17.py.\n\n"
    + README_21.strip() + "\n",
)

patch(
    "21/E3 README tests-диапазон",
    README,
    "ВСЕ тесты бесед (0.3b–2.1)",
    "ВСЕ тесты бесед (0.3b–1.7)",
    "ВСЕ тесты бесед (0.3b–2.1)",
)

print(f"applied={len(applied)} skipped={len(skipped)} failed={len(failed)}")
for n in applied:
    print("  APPLY", n)
for n in skipped:
    print("  skip ", n)
for n in failed:
    print("  FAIL ", n)
raise SystemExit(1 if failed else 0)
