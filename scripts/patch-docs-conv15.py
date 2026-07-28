#!/usr/bin/env python3
"""Патч доков по итогам беседы 1.5 (форма создания + прогресс, клиент).

Идемпотентный: каждая правка сперва проверяет наличие нового текста
(applied ранее → skip), затем наличие якоря (нет → FAIL). str.replace,
НЕ re.sub. Запуск из корня репо: python3 scripts/patch-docs-conv15.py
"""
from pathlib import Path

applied, skipped, failed = [], [], []

def patch(path: str, old: str, new: str, tag: str, marker: str | None = None) -> None:
    p = Path(path)
    s = p.read_text(encoding="utf-8")
    probe = marker if marker is not None else new
    if probe in s:
        skipped.append(tag); return
    if old not in s:
        failed.append(f"{tag}: якорь не найден в {path}"); return
    p.write_text(s.replace(old, new, 1), encoding="utf-8")
    applied.append(tag)

# ── 15/A: 03 §2.2 — эндпоинты оценки и совета (созданы беседой 1.5) ──
patch(
    "docs/03-specification.md",
    "GET    /syntheses/:id          → { synthesis: SynthesisFull }",
    """POST   /syntheses/estimate     тело = телу POST /syntheses (беседа 1.5)
                                → { estimate: { inTokens, outTokens, cost, passes } }
                                // Оценка БЕЗ создания записей: сервер зеркалит
                                // конвейер генерации (resolveContextDeps →
                                // buildEffectiveDeps → buildDynamicOrder →
                                // buildSectionDefs → groupPasses → buildSYS/
                                // baseCtxStatic → estimateCost). Требование G3
                                // §1.3; из вилки протокола «сервер или клиентская
                                // копия» выбран сервер — копия дрейфовала бы от
                                // Registry (fragment_share/context_budget).

POST   /syntheses/advice       { sections: string[], method, synthLevel,
                                 generationOrder? }                (беседа 1.5)
                                → { entry: CompatEntry+{icon,title} | null,
                                    advice: { warnings, recommendations,
                                              substitutions } }
                                // Advisor v2 + Section Dependency Warnings
                                // (01 §4.15 п.1–2): getCompatEntryByKey +
                                // computeSectionAdvice; icon/title считает
                                // сервер, CSS-классы чипов — клиент.

GET    /syntheses/:id          → { synthesis: SynthesisFull }""",
    "15/A 03 §2.2 += /estimate и /advice",
    marker="POST   /syntheses/estimate",
)

# ── 15/B: 03 §2.2 — код ошибки свободного синтеза без seed у POST ──
patch(
    "docs/03-specification.md",
    "                                // оба пусты = свободный синтез (обязателен seed)",
    """                                // оба пусты = свободный синтез (обязателен seed;
                                //   иначе 400 NO_PARTICIPANTS_SEED_REQUIRED, §4.3)""",
    "15/B 03 §2.2 POST — код NO_PARTICIPANTS_SEED_REQUIRED",
    marker="иначе 400 NO_PARTICIPANTS_SEED_REQUIRED",
)

# ── 15/C: 07 беседа 1.5 — фактический состав беседы ──
patch(
    "docs/07-conversation-protocol.md",
    "### Беседа 1.5: Форма создания + прогресс (клиент)",
    """### Беседа 1.5: Форма создания + прогресс (клиент)

> **По факту беседы 1.5**: сверх перечня первого запроса в этой же беседе
> созданы `CompatAdvisor.tsx` и `SectionWarnings.tsx` (их требует тест 4)
> и серверные `POST /syntheses/estimate` + `POST /syntheses/advice`
> (03 §2.2). Из вилки «estimateCost на сервере (или клиентская копия)»
> выбран СЕРВЕР. Код свободного синтеза без seed у POST /syntheses
> приведён к §4.3 (NO_PARTICIPANTS_SEED_REQUIRED) — тест 5 ждёт его.""",
    "15/C 07 беседа 1.5 — примечание о фактическом составе",
    marker="По факту беседы 1.5",
)

# ── 15/D: 04 §1.2 — размещение SectionWarnings + судьба applyReplacement ──
patch(
    "docs/04-code-reuse-map.md",
    "`server/services/compat-advisor.ts` + `client/components/synthesis/CompatAdvisor.tsx` |",
    "`server/services/compat-advisor.ts` + `client/components/synthesis/CompatAdvisor.tsx` "
    "и `SectionWarnings.tsx` (боксы ⚠/💡/⇄; данные — POST /syntheses/advice, беседа 1.5); "
    "`applyReplacement()` — НЕ портирован, TODO 2.x (кнопки замен; replacements уже в entry) |",
    "15/D 04 §1.2 — SectionWarnings + applyReplacement TODO",
    marker="applyReplacement()` — НЕ портирован",
)

# ── 15/E: шапки-ревизии ──
for doc, tag in [
    ("docs/03-specification.md", "15/E 03 ревизия"),
    ("docs/04-code-reuse-map.md", "15/E 04 ревизия"),
    ("docs/07-conversation-protocol.md", "15/E 07 ревизия"),
]:
    patch(
        doc,
        "> **Ревизия 2026-07-22**",
        "> **Ревизия 2026-07-29 (беседа 1.5)**: клиентская форма/прогресс;\n"
        "> эндпоинты /syntheses/estimate и /syntheses/advice; код\n"
        "> NO_PARTICIPANTS_SEED_REQUIRED в POST /syntheses.\n"
        "> **Ревизия 2026-07-22**",
        tag,
        marker="Ревизия 2026-07-29 (беседа 1.5)",
    )

# ── 15/F: README ──
patch(
    "README.md",
    "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.4b закрыты",
    "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.5 закрыты",
    "15/F README статус",
)
patch(
    "README.md",
    "  (max-tokens/billing/персистентность через рестарт/stop/edge cases).",
    """  (max-tokens/billing/персистентность через рестарт/stop/edge cases).

Беседа 1.5 (форма + прогресс, клиент): SynthesisForm со всеми полями и
валидацией v11 (свободный синтез без seed → NO_PARTICIPANTS_SEED_REQUIRED),
PhilosopherPicker (эпохи), SectionPicker (secCtx, extGraphMetrics),
CostEstimate → POST /syntheses/estimate (серверное зеркало конвейера
оценки), CompatAdvisor + SectionWarnings → POST /syntheses/advice,
GenerationProgress (◯/⟳/✓/⚠, живой счётчик), useStreamingGeneration
(?resume= §3.3), интеграция PauseModal в CreateSynthesisPage.
Тесты: tests/test-15-requests2-7.mjs 40/40 ✓ (браузерные, puppeteer;
БД-ассерты гранулярного парсинга внутри теста).""",
    "15/F README блок 1.5",
    marker="Беседа 1.5 (форма + прогресс, клиент):",
)
patch(
    "README.md",
    "Не сделано (Фаза 1+): страницы синтеза/каталога/графа, каскады и план",
    "Не сделано (Фаза 1+): страницы синтеза/каталога/графа (1.6),\n"
    "Unified Concept Pool + secSynthReady + превью keepFullBudget (1.5b),\n"
    "applyReplacement и точный confirm деградации skip (2.x), каскады и план",
    "15/F README «не сделано»",
    marker="Unified Concept Pool + secSynthReady",
)
patch(
    "README.md",
    """Следующая по графу 07 — беседа 1.5 (форма и прогресс; интеграция
PauseModal) либо 2.1 (cascade-analyzer) / 2.2 (regeneration +
plan-executor) параллельно.""",
    """Следующая по графу 07 — беседа 1.6 (страница синтеза + каталог;
закроет TODO(1.6): pausedState из GET /syntheses/:id) либо параллельно
1.5b (Unified Concept Pool) / 2.1 (cascade-analyzer) / 2.2 (regeneration
+ plan-executor).""",
    "15/F README следующая беседа",
    marker="беседа 1.6 (страница синтеза + каталог;",
)
patch(
    "README.md",
    "`check:integration` расширяется секциями по мере бесед (сейчас покрывает",
    "`check:integration` расширяется секциями по мере бесед — 1.5 добавила\n"
    "4m/5m: клиент-модули формы/прогресса, контракты и живые /estimate и\n"
    "/advice (сейчас покрывает",
    "15/F README покрытие чека",
    marker="1.5 добавила\n4m/5m",
)

patch(
    "README.md",
    "0.1–0.6 и 1.1–1.4b); живые секции требуют поднятых PG и Redis",
    "0.1–0.6 и 1.1–1.5); живые секции требуют поднятых PG и Redis",
    "15/F README покрытие чека — диапазон до 1.5",
    marker="0.1–0.6 и 1.1–1.5); живые секции",
)

print("applied:", len(applied));  [print("  +", t) for t in applied]
print("skipped:", len(skipped));  [print("  =", t) for t in skipped]
if failed:
    print("FAILED:", len(failed)); [print("  !", t) for t in failed]
    raise SystemExit(1)
