#!/usr/bin/env python3
"""Патч доков по итогам беседы 1.4b (идемпотентный: applied/skip/fail).

Правки:
  14b/A  02 §2.15  source += 'resume' (пишется _runGenPassesFromIdx [25573]
                   при возобновлении; enum схемы/shared-тип расширены кодом
                   1.4b; text-колонка — миграции не требует)
  14b/B  03 §4.3   примечание: resume_plan retry/skip_step до plan-executor'а
                   (беседа 2.2) отвечает RESUME_INVALID с пояснением —
                   отдельного кода «не реализовано» в протоколе нет
  14b/C  04        строка Pause/Resume: фактическое размещение портов
                   (serializeSubsectionRegen/extractPreambleConstraints →
                   section-defs-builder; врезка подраздела → html-parser;
                   клиентский путь synthesis/PauseModal.tsx) + квирк [25358]
  14b/D  01 §4.12  примечание к auth-рендереру: в сервисе до 6.1 (BYO-Key)
                   форма ввода ключа отсутствует
  14b/E  04        шапка-ревизия += блок 1.4b
  14b/F  README    покрытие check:integration, заголовок статуса, блок 1.4b,
                   перечень «не сделано», следующая беседа
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
applied = skipped = failed = 0


def patch(doc: str, tag: str, old: str, new: str) -> None:
    global applied, skipped, failed
    p = ROOT / doc
    text = p.read_text(encoding="utf-8")
    if new in text:
        skipped += 1
        print(f"  skip   {tag}")
        return
    if old not in text:
        failed += 1
        print(f"  FAIL   {tag}: якорь не найден в {doc}")
        return
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    applied += 1
    print(f"  applied {tag}")


# ── 14b/A: 02 §2.15 — source += 'resume' ─────────────────────────────────
patch(
    "docs/02-data-model.md", "14b/A 02 §2.15 — source += 'resume'",
    "    -- 'initial'|'edit'|'edit_add'|'cascade'|'subsection_regen'|'mode'|'mode_cascade'",
    "    -- 'initial'|'edit'|'edit_add'|'cascade'|'subsection_regen'|'mode'|'mode_cascade'\n"
    "    --   |'resume' (строки возобновлённой генерации — _runGenPassesFromIdx\n"
    "    --   [25573] пишет source:'resume'; найдено беседой 1.4b)",
)

# ── 14b/B: 03 §4.3 — примечание о plan-resume до 2.2 ─────────────────────
patch(
    "docs/03-specification.md", "14b/B 03 §4.3 — plan-resume до 2.2",
    "NO_PARTICIPANTS_SEED_REQUIRED — свободный синтез без seed (v11)\n```",
    "NO_PARTICIPANTS_SEED_REQUIRED — свободный синтез без seed (v11)\n```\n"
    "\n"
    "> Примечание (беседа 1.4b): отдельного кода «операция ещё не\n"
    "> реализована» в протоколе нет — до появления plan-executor'а\n"
    "> (беседа 2.2) `resume_plan` с mode `retry`/`skip_step` отвечает\n"
    "> `RESUME_INVALID` с пояснением; ветка `stop` работает полностью.\n"
    "> «Чужой mode» из WS-сообщения также даёт `RESUME_INVALID`\n"
    "> (runtime-guard: parseClientMessage валидирует только `type`).",
)

# ── 14b/C: 04 — размещение портов Pause/Resume + квирк [25358] ───────────
patch(
    "docs/04-code-reuse-map.md", "14b/C 04 — размещение портов Pause/Resume",
    "| Pause/Resume (спец.: 01 §4.12): `resumeGeneration()`, `_resumeFromSubsection()`, "
    "`_runGenPassesFromIdx()`, `_computeGenPauseEstimates()`, `_logPauseEvent()` | "
    "pausedState → персистентное хранение; модалка → React; действия "
    "fill-missing-subs/retry/skip/stop с оценками стоимости | "
    "`server/services/pause-resume-service.ts` + `client/components/PauseModal.tsx` |",
    "| Pause/Resume (спец.: 01 §4.12): `resumeGeneration()`, `_resumeFromSubsection()`, "
    "`_runGenPassesFromIdx()`, `_computeGenPauseEstimates()`, `_logPauseEvent()`, "
    "`_finalizeAfterStop_gen()`, `_continueAfterFilledSubs()`, `resumePlan()`, "
    "`showPauseModal()` + 4 рендерера + `_fmtCost()` | pausedState → персистентное "
    "хранение; модалка → React (управляется пропсами); действия "
    "fill-missing-subs/retry/skip/stop с оценками стоимости; `_runGenPassesFromIdx` — "
    "общий цикл `runGenerationPasses({startIdx, source})` в generation-service. "
    "Квирк исходника (1.4b): fallback «нет parts» [25358] зовёт "
    "`resumeGeneration('retry')` ПОСЛЕ `_clearPausedState()` — мёртвый путь; в порте "
    "retry-ветка инлайнится | `server/services/pause-resume-service.ts` + "
    "`client/components/synthesis/PauseModal.tsx` |\n"
    "| `serializeSubsectionRegen()` [10654], `extractPreambleConstraints()` [10727] "
    "(промпт перегенерации/доработки/продолжения ОДНОГО подраздела) | порт 1:1; живут "
    "рядом с `serializeParts` (§2.2) — сериализуют parts, которые строит "
    "`buildSectionDefs`; потребители: pause-resume-service (1.4b), "
    "regeneration/plan-executor (2.2) | `server/services/section-defs-builder.ts` |\n"
    "| DOM-механика замены подраздела из `regenerateSubsection` [20384–20444] "
    "(replaceWith/append, нечёткий поиск) | порт на строках html_content: "
    "`spliceSubsectionHtml()` / `removeSubsectionHtml()`; изоляция linkedom "
    "сохраняется | `server/utils/html-parser.ts` |",
)

# ── 14b/D: 01 §4.12 п.6 — auth-рендерер сервиса до 6.1 ───────────────────
patch(
    "docs/01-architecture.md", "14b/D 01 §4.12 — auth-рендерер до 6.1",
    "- `_renderPauseContent_auth` [~24998] — истёкший ключ (контекст gen или plan)",
    "- `_renderPauseContent_auth` [~24998] — истёкший ключ (контекст gen или plan).\n"
    "  Примечание (1.4b): форма ввода нового ключа (`_resumeWithNewApiKey`\n"
    "  [~24552]) — беседа 6.1 (BYO-Key); до неё ключ серверный (env), и\n"
    "  auth-рендерер сервиса предлагает «Повторить» (после замены ключа на\n"
    "  сервере) / «Остановить»",
)

# ── 14b/E: 04 — шапка-ревизия += блок 1.4b ───────────────────────────────
patch(
    "docs/04-code-reuse-map.md", "14b/E 04 — шапка-ревизия 1.4b",
    "> **Ревизия 2026-07-22**: карта актуализирована по исходнику 26 024 стр.\n"
    "> Спецификации подсистем v11 — 01-architecture, §4.12–4.15.",
    "> **Ревизия 2026-07-22**: карта актуализирована по исходнику 26 024 стр.\n"
    "> Спецификации подсистем v11 — 01-architecture, §4.12–4.15.\n"
    ">\n"
    "> **Правка 2026-07-28 (итоги 1.4b)**: строка Pause/Resume дополнена\n"
    "> фактическим размещением портов (serializeSubsectionRegen →\n"
    "> section-defs-builder; врезка подраздела → utils/html-parser) и\n"
    "> квирком [25358].",
)

# ── 14b/F: README ────────────────────────────────────────────────────────
patch(
    "README.md", "14b/F-1 README — покрытие check:integration",
    "`check:integration` расширяется секциями по мере бесед (сейчас покрывает\n"
    "0.1–0.6 и 1.1–1.4); живые секции требуют",
    "`check:integration` расширяется секциями по мере бесед (сейчас покрывает\n"
    "0.1–0.6 и 1.1–1.4b); живые секции требуют",
)
patch(
    "README.md", "14b/F-2 README — заголовок статуса",
    "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.4 закрыты",
    "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.4b закрыты",
)
patch(
    "README.md", "14b/F-3 README — блок 1.4b",
    "  subscribe_generation/cancel + resume-протокол §3.3. Сквозной тест с\n"
    "  мок-SSE Claude API: test-14-requests2-8.mjs 46/46 ✓.\n",
    "  subscribe_generation/cancel + resume-протокол §3.3. Сквозной тест с\n"
    "  мок-SSE Claude API: test-14-requests2-8.mjs 46/46 ✓.\n"
    "\n"
    "- **1.4b — pause/resume.** pause-resume-service (маркеры генлога,\n"
    "  pausedState с перегрузками gen/plan, оценки стоимости действий из\n"
    "  genParams + фактических размеров done-строк; resumeGeneration:\n"
    "  stop/retry/skip/fill-missing-subs с догенерацией только недостающих\n"
    "  подразделов — оборванный первым, порог продолжения 250 симв.,\n"
    "  готовые идут контекстом; resumePlan — каркас до 2.2); порты\n"
    "  serializeSubsectionRegen/extractPreambleConstraints и врезка\n"
    "  подраздела; WS resume_generation/resume_plan; клиентский PauseModal\n"
    "  (4 рендерера + бейдж). Тесты: smoke-1.4b.mts 27/27 ✓ (байтовая\n"
    "  сверка промптов), tests/test-14b-requests2-6.mjs 56/56 ✓\n"
    "  (max-tokens/billing/персистентность через рестарт/stop/edge cases).\n",
)
patch(
    "README.md", "14b/F-4 README — «не сделано» и следующая беседа",
    "Не сделано (Фаза 1+): pause/resume-действия (1.4b), страницы\n"
    "синтеза/каталога/графа, каскады и план редактирования, мета-синтез,\n"
    "режимы, экспорт/импорт, billing.\n"
    "Следующая по графу 07 — беседа 1.4b (Pause/Resume) либо 1.5 (форма и\n"
    "прогресс) / 2.1 (cascade-analyzer) параллельно.",
    "Не сделано (Фаза 1+): страницы синтеза/каталога/графа, каскады и план\n"
    "редактирования (plan-executor — снимет RESUME_INVALID с resume_plan\n"
    "retry/skip_step), мета-синтез, режимы, экспорт/импорт, billing,\n"
    "BYO-Key (6.1 — ввод ключа в auth-модалке).\n"
    "Следующая по графу 07 — беседа 1.5 (форма и прогресс; интеграция\n"
    "PauseModal) либо 2.1 (cascade-analyzer) / 2.2 (regeneration +\n"
    "plan-executor) параллельно.",
)

print(f"\nИтог: applied={applied}, skip={skipped}, fail={failed}")
raise SystemExit(1 if failed else 0)
