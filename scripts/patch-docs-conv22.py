#!/usr/bin/env python3
"""Правки документации по итогам беседы 2.2 (Plan Executor + Regeneration).

Идемпотентный apply/skip-скрипт (образец conv16/conv21):
 - patch(): замена old → new; повторный прогон видит marker → skip;
 - patch_del(): удаление; «строки нет» → законный skip (правило 2.1);
 - optional=True — переходник промежуточных состояний: нет ни old, ни
   marker → skip, не FAIL.

Запуск из корня репо: python3 scripts/patch-docs-conv22.py
"""
from __future__ import annotations

import io
import os
import sys

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


def patch_del(name: str, rel: str, old: str) -> None:
    """Удаление: отсутствие строки — законный skip (грабля 2.1)."""
    s = read(rel)
    if old not in s:
        skipped.append(name)
        return
    write(rel, s.replace(old, "", 1))
    applied.append(name)


P07 = "docs/07-conversation-protocol.md"
P01 = "docs/01-architecture.md"
P03 = "docs/03-specification.md"
P04 = "docs/04-code-reuse-map.md"
PRD = "README.md"
PFJ = "docs/fragments-for-conversations/2.2-plan-executor.js"
PFS = "docs/fragments-for-conversations/2.2-plan-executor.spec"

# ── 22/A: расклейка повреждённого текста п.1 (хвост addSection прирос к
#    regenStructureFromEditModal) + перенос bullet deleteSection из
#    «Пост-план» на место операций ──
patch("22/A (07: пост-план/deleteSection расклеены)", P07,
"""   Пост-план (после всех шагов executePlan):
   - Если добавлялись/удалялись разделы → предложить обновить «Структура документа»
   - Если добавлялись разделы → вычислить downstream, предложить каскад
   - regenStructureFromEditModal(): кнопка в карточке «Структура устарела» Вставка в sectionOrder, перенумерация,
     генерация, сохранение.
   - deleteSection(synthesisId, sectionKey):
     Адаптация deleteSection(). Удаление из sections + sectionOrder, 
     перенумерация, запись deletion_marker в genLog.
""",
"""   - deleteSection(synthesisId, sectionKey):
     Адаптация deleteSection(). Удаление из sections + sectionOrder,
     перенумерация §§ и ссылок, запись deletion_marker в genLog.

   Пост-план (после всех шагов executePlan):
   - Если добавлялись/удалялись разделы → предложить обновить «Структура
     документа» (по факту 2.2 — pending-шаг regen_subsection
     «sum:Структура документа» + plan_steps_added; исполнение —
     confirm_step)
   - Если добавлялись разделы → вычислить downstream, предложить каскад
   - regenStructureFromEditModal(): кнопка в карточке «Структура
     устарела» — клиент (беседа 2.3); серверная часть =
     regenerateSubsection("sum", «Структура документа»). Хвост «Вставка
     в sectionOrder, перенумерация, генерация, сохранение» относился к
     addSection (сбой форматирования, поправлен 2.2).
""",
marker="pending-шаг regen_subsection")

# ── 22/B: buildDocStateFromImport — обязанность 4.2 ──
patch("22/B (07: buildDocStateFromImport → 4.2)", P07,
"   - buildDocStateFromImport: восстанавливает structureSections из embeddedState\n",
"   - buildDocStateFromImport: восстанавливает structureSections из\n"
"     embeddedState (реализуется import-service, беседа 4.2 — там\n"
"     обязанность прописана повторно; в 2.2 модуля импорта ещё нет)\n",
marker="реализуется import-service, беседа 4.2")

# ── 22/C: дубль буквы d. в списке executePlan + факт «каскад один раз» ──
patch("22/C (07: дубль d. + каскад после базовых шагов)", P07,
"""     d. После каждого шага: пересчитывает каскад (cascade-analyzer),
        если появились новые downstream — добавляет шаги, отправляет 
        plan_steps_added через WebSocket
     e. Обновляет synthesis.version, статус плана → "done\"""",
"""     e. После исполнения базовых шагов: пересчитывает каскад
        (cascade-analyzer) — по факту 2.2 ОДИН раз, паритет исходника
        («после каждого шага» 01 §4.5 п.8 — «может»); новые downstream →
        pending-шаги, plan_steps_added через WebSocket
     f. Обновляет synthesis.version, статус плана → "done\"""",
marker="по факту 2.2 ОДИН раз")

# ── 22/D: plan_paused не существует — generation_paused kind='plan' ──
patch("22/D (07: plan_paused → generation_paused kind='plan')", P07,
"     → plan_paused; продолжение — resumePlan из pause-resume-service (1.4b)",
"     → generation_paused kind=\"plan\" (03 §3.2; отдельного plan_paused\n"
"     нет; при user-abort сообщение не шлётся — тип исключает, клиент\n"
"     берёт паузу из GET /:id); продолжение — resumePlan из\n"
"     pause-resume-service (1.4b)",
marker="отдельного plan_paused")

# ── 22/E: regenerateModeSilent до 4.1 — разъём ──
patch("22/E (07: разъём setModeRegenerator до 4.1)", P07,
"          regenerateSubsection / regenerateModeSilent\n",
"          regenerateSubsection / regenerateModeSilent (mode-service —\n"
"          беседа 4.1; до неё — разъём setModeRegenerator: без\n"
"          регистрации шаг → failed, план продолжается — паритет modeErr)\n",
marker="разъём setModeRegenerator")

# ── 22/F: неточность тестового запроса R2 (по образцу «По факту 1.7 (з)») ──
patch("22/F (07: R2 — plan_steps_added предвычислен)", P07,
"- «Протестируй каскад: regen=[\"graph\"] → после исполнения, план должен предложить перегенерировать theses (если theses зависит от graph). Проверь plan_steps_added через WebSocket»",
"- «Протестируй каскад: regen=[\"graph\"] → после исполнения, план должен предложить перегенерировать theses (если theses зависит от graph). Проверь plan_steps_added через WebSocket»\n"
"  (по факту 2.2: каскад предвычисляется createPlan (2.1) — «предложение\n"
"  theses» = pending-шаги уже в плане при создании, после исполнения\n"
"  regen-плана НОВЫХ шагов не возникает и plan_steps_added для theses\n"
"  невозможен по построению; живое plan_steps_added тест проверяет на\n"
"  структурном пост-шаге add/delete-планов)",
marker="невозможен по построению")

# ── 22/G: блок «По факту 2.2» перед «### Беседа 2.3» ──
_pofakt = """**По факту 2.2 (2026-08-09):** беседа закрыта; запросы 2-6 — единым
тестом `tests/test-22-requests2-6.mjs` (живой сервер + мок-SSE + WS),
53 ✓ / 0 ✗ ×2; браузер не нужен. Интеграция — секции 2m/4s/5p в
`server/integration-check.mts`; там же исправлен ДЕФЕКТ 2.1 (финальный
гейт errs стоял до секции 4r — её ошибки не проверялись; перенесён в
конец). Журнал — глава 2.2 `NEXT-CONTEXT.md`. Адаптации: (а) executor
исполняет только confirmed, pending исполняются поштучно confirm_step
(после — done); (б) refreshSumDef на сервере упрощён (defs всегда
строятся заново); (в) renumberSectionRefs — строковая замена §N вместо
TreeWalker; (г) user-abort плана СОЗДАЁТ pausedState kind='plan'
(паритет исходника; cancelPlan = WS cancel → abort слота), WS-сообщение
при этом не шлётся; (д) разъём setModeRegenerator до 4.1; (е)
confirm деградации при skip реализован данными skipDegrades
(PausedStateGen + generation_paused) и window.confirm в PauseModal;
(ж) standalone-перегенерация не создаёт pausedState (stream_error,
паритет [20716]); (з) add/delete — только через планы; (и) спека
фрагмента относила функции к regeneration-service.ts — фактический
модуль generation-service.ts (05/07), заголовки фрагмента поправлены.

---

### Беседа 2.3"""
patch("22/G (07: блок «По факту 2.2»)", P07,
"---\n\n### Беседа 2.3", _pofakt, marker="По факту 2.2 (2026-08-09)")

# ── 22/H: §12 — три долга 2.2 закрыты (вычеркнуть = удалить) ──
patch_del("22/H1 (07 §12: долг setPlanResumeExecutor закрыт)", P07,
"| `setPlanResumeExecutor` — регистрация исполнителя планов | 2.2 | 1.4b | внесён 2026-07-31 |\n")
patch_del("22/H2 (07 §12: долг полного regenerateSubsection закрыт)", P07,
"| Полный `regenerateSubsection` + plan-executor | 2.2 | 1.4b | в тексте 2.2 |\n")
patch_del("22/H3 (07 §12: долг confirm при skip закрыт)", P07,
"| `confirm` деградации зависимостей при skip | 2.2 | 1.4b (адресовался 1.5) | внесён 2026-07-30 |\n")

# ── 22/I: §12 — новые долги беседы 2.2 ──
patch("22/I (07 §12: новые долги 2.2)", P07,
"| Бейдж качества контекста (`contextQualityScore`) | 2.3 ← 2.4 | 1.3 | инверсия снята 2026-07-30 |",
"| Регистрация `regenerateModeSilent` в разъём `setModeRegenerator` (plan-executor; до неё шаги regen_mode → failed, план продолжается) | 4.1 | 2.2 | внесён 2026-08-09 |\n"
"| Внутрисекционный каскад по `affectedSubs` (regenerateSubsection возвращает зависимые подразделы; предложение/исполнение — UI) | 2.3 | 2.2 | внесён 2026-08-09 |\n"
"| Бейдж качества контекста (`contextQualityScore`) | 2.3 ← 2.4 | 1.3 | инверсия снята 2026-07-30 |",
marker="Регистрация `regenerateModeSilent` в разъём")

# ── 22/J: шапка-ревизия 07 ──
patch("22/J (07: шапка-ревизия 2.2)", P07,
"# PhiloSynth Service — Протокол бесед\n\n> **Правки 2026-08-04 (итоги беседы 2.1)**:",
"# PhiloSynth Service — Протокол бесед\n\n"
"> **Правки 2026-08-09 (итоги беседы 2.2)**: plan-executor и\n"
"> регенерация закрыты (53 ✓ ×2, живой сервер + мок-SSE); блок\n"
"> «По факту 2.2»; текст 2.2 п.1 расклеен (deleteSection/пост-план/\n"
"> regenStructureFromEditModal), buildDocStateFromImport помечен как\n"
"> обязанность 4.2, дубль «d.» устранён, «plan_paused» заменён на\n"
"> generation_paused kind=\"plan\", разъём setModeRegenerator до 4.1,\n"
"> неточность теста R2 (каскад предвычислен createPlan); §12 — долги\n"
"> setPlanResumeExecutor / полного regenerateSubsection / confirm при\n"
"> skip закрыты, внесены долги regenerateModeSilent → 4.1 и\n"
"> внутрисекционного каскада → 2.3; 01 §4.5 — дубль «8.»; 03 §3.1/§3.2 —\n"
"> уточнения cancel/generation_paused (kind='plan', skipDegrades);\n"
"> 04 — факты rebuildDbMapping/refreshSumDef; заголовки фрагмента 2.2 —\n"
"> regeneration-service → generation-service.\n>\n"
"> **Правки 2026-08-04 (итоги беседы 2.1)**:",
marker="Правки 2026-08-09 (итоги беседы 2.2)")

# ── 22/K: 01 §4.5 — дубль «8.» ──
patch("22/K (01 §4.5: дубль 8.)", P01,
"8. После каждого шага сервер может добавить новые шаги\n8. Клиент получает `plan_updated` и обновляет UI",
"8. После каждого шага сервер может добавить новые шаги (по факту 2.2 —\n"
"   один пересчёт после базовых шагов, паритет исходника)\n"
"9. Клиент получает `plan_updated` и обновляет UI",
marker="9. Клиент получает `plan_updated`")

# ── 22/L: 01 — plan_paused упоминание ──
patch("22/L (01: plan_paused → generation_paused kind='plan')", P01,
"  plan_paused/resume_plan; серверный аналог _computeGenPauseEstimates.",
"  generation_paused kind=\"plan\" / resume_plan (отдельного plan_paused\n"
"  нет — 03 §3.2); серверный аналог _computeGenPauseEstimates.",
marker="отдельного plan_paused\n  нет")

# ── 22/M: 03 §3.1 — комментарий cancel писан для генерации ──
patch("22/M (03 §3.1: cancel — область действия)", P03,
"// Отмена текущей операции (user-abort → pausedState не создаётся,\n"
"// частичный результат финализируется по правилам stop)",
"// Отмена текущей операции. Для ГЕНЕРАЦИИ user-abort → pausedState не\n"
"// создаётся (частичный результат финализируется по правилам stop);\n"
"// обрыв шага ПЛАНА — включая user-abort — СОЗДАЁТ pausedState\n"
"// kind=\"plan\" (паритет executeEditPlan; беседа 2.2)",
marker="обрыв шага ПЛАНА")

# ── 22/N: 03 §3.2 — skipDegrades + примечание kind='plan' ──
patch("22/N (03 §3.2: generation_paused — skipDegrades/kind=plan)", P03,
"""  partialSubsections?: string[],
  expectedSubsections?: string[],
  estimates: { fillMissingSubs?: number, wholeSection?: number,
               skipRemaining?: number } }  // серверный аналог _computeGenPauseEstimates""",
"""  partialSubsections?: string[],
  expectedSubsections?: string[],
  skipDegrades?: string[],   // kind='gen': разделы, теряющие контекст
                             // пропускаемых при skip (confirm [25686], 2.2)
  estimates: { fillMissingSubs?: number, wholeSection?: number,
               skipRemaining?: number } }  // серверный аналог _computeGenPauseEstimates
// kind='plan' (2.2): plan-полей сообщение не несёт — stepIdx/totalSteps/
// failedOp клиент берёт из GET /syntheses/:id (pausedState); при
// user-abort плана сообщение НЕ отправляется (reasonKind его исключает),
// pausedState при этом создаётся""",
marker="skipDegrades?: string[]")

# ── 22/O: 04 — факты 2.2 ──
patch("22/O1 (04: rebuildDbMapping вырожден)", P04,
"| `addSection()`, `deleteSection()`, `rebuildDbMapping()` | Серверные операции через API |",
"| `addSection()`, `deleteSection()`, `rebuildDbMapping()` | Серверные операции через API — ФАКТ (2.2): add/delete только через планы (§2.6), в §2.5 их эндпоинтов нет; `rebuildDbMapping` ВЫРОЖДЕН (db-индексы DOM → строки sections; перенумерация = `recalcSectionNumbers` + `renumberSectionRefs`) |",
marker="rebuildDbMapping` ВЫРОЖДЕН")
patch("22/O2 (04: structure-tracker факты)", P04,
"| `server/services/structure-tracker.ts` | `refreshSumDef()`, `regenStructureFromEditModal()`, отслеживание `structureSections` (v10) |",
"| `server/services/structure-tracker.ts` | `refreshSumDef()`, `regenStructureFromEditModal()`, отслеживание `structureSections` (v10) — ФАКТ (2.2): `refreshSumDef` упрощён (defs на сервере не персистятся и строятся заново из section_order); `regenStructureFromEditModal` — UI-половина (2.3), серверная часть = `startSubsectionRegeneration(\"sum\", «Структура документа»)` |",
marker="`refreshSumDef` упрощён")

# ── 22/P: README — абзац 2.2, диапазон тестов, «Не сделано» ──
patch("22/P1 (README: абзац 2.2)", PRD,
"tests/test-21-requests2-5.mjs 39/39 ✓ ×2 (сервис + HTTP; без браузера).",
"tests/test-21-requests2-5.mjs 39/39 ✓ ×2 (сервис + HTTP; без браузера).\n\n"
"Беседа 2.2 (plan-executor + регенерация, бэкенд):\n"
"services/plan-executor.ts (executePlan/confirmStep, версии, каскад после\n"
"базовых шагов, пауза kind='plan', resume-разъём заполнен — RESUME_INVALID\n"
"с resume_plan retry/skip_step снят, разъём setModeRegenerator до 4.1),\n"
"services/structure-tracker.ts, расширение generation-service\n"
"(regenerateSection/полный regenerateSubsection — долг 1.4b закрыт/\n"
"addSection/deleteSection/перенумерация §§), routes/generation.ts (03\n"
"§2.5) + POST execute в routes/plans, WS start_regen/start_sub_regen/\n"
"execute_plan/confirm_step, confirm деградации при skip (skipDegrades +\n"
"PauseModal). Тесты: tests/test-22-requests2-6.mjs 53/53 ✓ ×2 (живой\n"
"сервер + мок-SSE; без браузера). Доки пропатчены\n"
"scripts/patch-docs-conv22.py.",
marker="Беседа 2.2 (plan-executor + регенерация")
patch("22/P2 (README: диапазон тестов)", PRD,
"tests/             ВСЕ тесты бесед (0.3b–2.1):",
"tests/             ВСЕ тесты бесед (0.3b–2.2):",
marker="(0.3b–2.2)")
patch("22/P3 (README: «Не сделано» без 2.2)", PRD,
"confirm деградации skip (2.2), каскады и план\n"
"редактирования (plan-executor — снимет RESUME_INVALID с resume_plan\n"
"retry/skip_step), мета-синтез",
"UI планов/каскадов (2.3 Edit Modal;\nбэкенд-исполнение готово в 2.2), мета-синтез",
marker="бэкенд-исполнение готово в 2.2")
patch("22/P4 (README: следующие беседы)", PRD,
"Фаза 1 закрыта целиком (1.1–1.7). Следующие по графу 07 — беседы\nФазы 2 (2.1 каскады → 2.2 plan-executor → 2.3 Edit Modal);",
"Фаза 1 закрыта целиком (1.1–1.7); в Фазе 2 закрыты 2.1 и 2.2.\nСледующие по графу 07 — 2.3 (Edit Modal) и 2.4 (лог контекста);",
marker="в Фазе 2 закрыты 2.1 и 2.2")

# ── 22/Q: фрагмент 2.2 — regeneration-service → generation-service ──
for rel, tag in ((PFJ, "22/Q1 (фрагмент .js)"), (PFS, "22/Q2 (фрагмент .spec)")):
    s = read(rel)
    if "regeneration-service.ts" in s:
        write(rel, s.replace(
            "server/services/regeneration-service.ts",
            "server/services/generation-service.ts (расширение; факт 05/07)"))
        applied.append(tag)
    else:
        skipped.append(tag)

print("APPLIED:", len(applied))
for a in applied:
    print("  +", a)
print("SKIPPED:", len(skipped))
for a in skipped:
    print("  ~", a)
if failed:
    print("FAILED:", len(failed))
    for a in failed:
        print("  !", a)
    sys.exit(1)
