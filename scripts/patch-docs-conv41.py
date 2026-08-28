#!/usr/bin/env python3
"""Правки документации по итогам беседы 4.1 (Mode Service, бэкенд +
клиент).

Идемпотентный apply/skip-скрипт (образец conv31/conv32):
 - patch(): замена old → new; повторный прогон видит marker → skip;
 - optional=True — переходник промежуточных состояний.

Запуск из корня репо: python3 scripts/patch-docs-conv41.py
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
P3 = "docs/03-specification.md"
P4 = "docs/04-code-reuse-map.md"
P2 = "docs/02-data-model.md"
SPEC = "docs/fragments-for-conversations/4.1-mode-service.spec"

# ── 07: запись ревизии в верхний журнал ─────────────────────────────

patch("07-журнал-4.1", P7,
      "# PhiloSynth Service — Протокол бесед\n\n"
      "> **Правки 2026-08-21 (итоги беседы 3.2)**:",
      "# PhiloSynth Service — Протокол бесед\n\n"
      "> **Правки 2026-08-28 (итоги беседы 4.1)**: система режимов закрыта\n"
      "> (запрос 1 + браузерный тест tests/test-41-requests2-5.mjs 53 ✓;\n"
      "> R4 — АДАПТАЦИЯ против буквы: вход в модалку без капсулы скрыт —\n"
      "> порт updateModeButtons [11799], предупреждение «без capsule»\n"
      "> проверено API-уровнем, отображение ⚠/💡 — на синтезе с капсулой\n"
      "> без critique/graph). Дыры, закрытые этим патчем: §2.7 не\n"
      "> специфицировал транспорт checkModeDeps/estimateModeCost —\n"
      "> аддитивные warnings/estimate в GET /modes/:modeKey; spec фрагмента\n"
      "> 4.1 не извлекал css:#modeTabsBar [1619–1627] и @keyframes\n"
      "> pulse-tab [1673] (css*:.mode- их не ловит) — дополнен, комплект\n"
      "> пересобран. Отступления: DELETE результата под 409-гейтом\n"
      "> (исходник removeModeResult доступен всегда); silent-перегенерация\n"
      "> — UPDATE строки с СОХРАНЕНИЕМ created_at (стабильность индексов;\n"
      "> исходник обновлял timestamp); source 'mode_cascade' (enum 02\n"
      "> §2.15; в исходнике 'mode-cascade'). Приёмы: связь\n"
      "> cascade-analyzer → mode-service ТОЛЬКО ленивым import()\n"
      "> (статический замыкает цикл через generation-service); аддитивные\n"
      "> экспорты streamWithRetries/bumpTotals из generation-service.\n"
      "> Дрейф-контроль клиентской статики MODE_UI ↔ MODE_CONFIG — секция\n"
      "> 4x integration-check (попутно дефект 4r: регексп статического\n"
      "> импорта ловил пример в комментарии — сужен до ^import…/m). §12:\n"
      "> долги cascade-analyzer-портов и setModeRegenerator ЗАКРЫТЫ;\n"
      "> внесены открытые долги карточек режимов EditModal и каскада\n"
      "> режимов SubsectionRegenPanel (за 4.1, довыполнение по команде).\n"
      ">\n"
      "> **Правки 2026-08-21 (итоги беседы 3.2)**:",
      marker="итоги беседы 4.1")

# ── 07: блок «По факту 4.1» в главу беседы ──────────────────────────

patch("07-по-факту-4.1", P7,
      "- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»\n"
      "\n---\n\n### Беседа 4.2: Export Service",
      "- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»\n"
      "\n"
      "**По факту 4.1 (2026-08-28):**\n"
      "- Транспорт п.2: GET /modes/:modeKey отдаёт { results, warnings,\n"
      "  estimate } — предупреждения checkModeDeps и оценка (fail-open\n"
      "  null) едут вместе с результатами, отдельных эндпоинтов нет.\n"
      "  Чтение обоих GET — владелец ИЛИ публичный синтез; run/DELETE —\n"
      "  владелец + 409-гейт активной генерации (DELETE под гейтом —\n"
      "  отступление, см. журнал).\n"
      "- runMode: дельты стрима под sectionKey \"mode:{modeKey}\"\n"
      "  (клиентский guard в useStreamingGeneration отсекает их от\n"
      "  прогресса генерации); индекс результата = позиция строки по\n"
      "  created_at ASC; квирки исходника сохранены (taskChars =\n"
      "  prompt − ctx; в silent — промпт целиком, catch без учёта\n"
      "  usage); пауз у режимов нет.\n"
      "- regenerateModeSilent зарегистрирован в setModeRegenerator\n"
      "  ПОБОЧНЫМ ЭФФЕКТОМ импорта mode-service (долг §12 закрыт) —\n"
      "  шаги regen_mode планов работают.\n"
      "- Клиентская статика MODE_UI (ModeModal) — копия MODE_CONFIG;\n"
      "  дрейф в обе стороны сторожит integration-check 4x.\n"
      "- Вне запроса 1 остались (открытые долги §12 за 4.1): карточки\n"
      "  результатов режимов в EditModal [18560–18630], каскад режимов\n"
      "  из SubsectionRegenPanel.\n"
      "\n---\n\n### Беседа 4.2: Export Service",
      marker="**По факту 4.1 (2026-08-28):**")

# ── 07 §12: закрытие двух долгов ────────────────────────────────────

patch("07-§12-долг-cascade", P7,
      "| `getEffectiveModeDepsFromConfig` / `MODE_TITLES` — локальные порты в cascade-analyzer; владелец `getEffectiveModeDeps`/`MODE_CONFIG` — mode-service (метки TODO(4.1) в коде) | 4.1 | 2.1 | внесён 2026-08-04 |",
      "| `getEffectiveModeDepsFromConfig` / `MODE_TITLES` — локальные порты в cascade-analyzer; владелец `getEffectiveModeDeps`/`MODE_CONFIG` — mode-service (метки TODO(4.1) в коде) | 4.1 | 2.1 | ЗАКРЫТ 4.1 (2026-08-28): MODE_TITLES удалён, делегаты — ленивые await import(\"./mode-service.js\") (анти-цикл через generation-service) |")

patch("07-§12-долг-регистрация", P7,
      "| Регистрация `regenerateModeSilent` в разъём `setModeRegenerator` (plan-executor; до неё шаги regen_mode → failed, план продолжается) | 4.1 | 2.2 | внесён 2026-08-09 |",
      "| Регистрация `regenerateModeSilent` в разъём `setModeRegenerator` (plan-executor; до неё шаги regen_mode → failed, план продолжается) | 4.1 | 2.2 | ЗАКРЫТ 4.1 (2026-08-28): регистрация побочным эффектом импорта mode-service |\n"
      "| Карточки результатов режимов в EditModal [18560–18630] (транспорт GET /modes готов с 4.1) | 4.1 | 4.1 | ОТКРЫТ — вне запроса 1, довыполнение по команде |\n"
      "| Каскад режимов после перегенерации подраздела (очередь runMode из SubsectionRegenPanel; mode-service готов с 4.1) | 4.1 | 4.1 | ОТКРЫТ — вне запроса 1, довыполнение по команде |",
      marker="Карточки результатов режимов в EditModal")

# ── 03 §2.7: транспорт warnings/estimate + гейты + отступление ──────

patch("03-§2.7-транспорт", P3,
      "POST   /syntheses/:id/modes/:modeKey/run\n"
      "                                { param: string }\n"
      "                                → { ok: true }\n"
      "                                // Стриминг через WebSocket\n"
      "\n"
      "GET    /syntheses/:id/modes     → { modes: Record<string, ModeResult[]> }\n"
      "\n"
      "GET    /syntheses/:id/modes/:modeKey\n"
      "                                → { results: ModeResult[] }\n"
      "\n"
      "DELETE /syntheses/:id/modes/:modeKey/:index\n"
      "                                → { ok: true }",
      "POST   /syntheses/:id/modes/:modeKey/run\n"
      "                                { param: string }\n"
      "                                → { ok: true }\n"
      "                                // Стриминг через WebSocket: дельты\n"
      "                                // sectionKey \"mode:{modeKey}\", финал\n"
      "                                // mode_done (§3.2). Пустой param →\n"
      "                                // 400 VALIDATION_ERROR (details.param);\n"
      "                                // активная генерация → 409\n"
      "\n"
      "GET    /syntheses/:id/modes     → { modes: Record<string, ModeResult[]> }\n"
      "\n"
      "GET    /syntheses/:id/modes/:modeKey\n"
      "                                → { results: ModeResult[],\n"
      "                                    warnings: ModeDepsWarning[],\n"
      "                                    estimate: ModeCostEstimate | null }\n"
      "                                // По факту 4.1: транспорт checkModeDeps\n"
      "                                // (warnings) и estimateModeCost\n"
      "                                // (estimate; fail-open null) для модалки\n"
      "                                // — до 4.1 §2.7 их не специфицировал.\n"
      "                                // Чтение обоих GET — владелец ИЛИ\n"
      "                                // публичный синтез\n"
      "\n"
      "DELETE /syntheses/:id/modes/:modeKey/:index\n"
      "                                → { ok: true }\n"
      "                                // index — позиция по created_at ASC;\n"
      "                                // вне диапазона → 404. ОТСТУПЛЕНИЕ 4.1:\n"
      "                                // под 409-гейтом активной генерации\n"
      "                                // (исходник removeModeResult доступен\n"
      "                                // всегда)",
      marker="warnings: ModeDepsWarning[]")

# ── 02 §2.14: семантика индексов и сохранение created_at ────────────

patch("02-§2.14-created_at", P2,
      "CREATE INDEX idx_modes_synthesis ON mode_results(synthesis_id);\n"
      "CREATE INDEX idx_modes_key ON mode_results(synthesis_id, mode_key);\n"
      "```\n"
      "\n"
      "### 2.15. generation_log",
      "CREATE INDEX idx_modes_synthesis ON mode_results(synthesis_id);\n"
      "CREATE INDEX idx_modes_key ON mode_results(synthesis_id, mode_key);\n"
      "```\n"
      "\n"
      "По факту 4.1: индекс результата в API (§2.7, DELETE и вкладки UI) —\n"
      "позиция строки по `created_at` ASC. Тихая перегенерация\n"
      "(regenerateModeSilent) обновляет строку С СОХРАНЕНИЕМ `created_at` —\n"
      "отступление от исходника (тот обновлял timestamp, отчего индексы и\n"
      "порядок вкладок плыли).\n"
      "\n"
      "### 2.15. generation_log",
      marker="С СОХРАНЕНИЕМ `created_at`")

# ── 04 §1.11: ФАКТ канонического порта ──────────────────────────────

patch("04-§1.11-факт", P4,
      "| `getEffectiveModeDeps()` | `server/services/mode-service.ts` (→ БД, беседа 4.1) |",
      "| `getEffectiveModeDeps()` | `server/services/mode-service.ts` — ФАКТ (4.1): канонический порт [22558] (mode_deps из Registry; генетическая подмена graph:nodes → dialogue:new_concepts при отсутствии графа); в cascade-analyzer — ЛЕНИВЫЙ делегат await import() (статический импорт замкнул бы цикл через generation-service) |")

# ── 04 §2.7: ФАКТ по трём строкам ───────────────────────────────────

patch("04-§2.7-факт", P4,
      "| `MODE_CONFIG`, `buildModeContext()` | Контекст из БД; промпт из Registry | `server/services/mode-service.ts` |\n"
      "| `runMode()` | Стриминг через бэкенд + WebSocket | там же |\n"
      "| `regenerateModeSilent()` | Аналогично | там же |",
      "| `MODE_CONFIG`, `buildModeContext()` | Контекст из БД; промпт из Registry | `server/services/mode-service.ts` — ФАКТ (4.1): статика дословно [22578], промпты mode.{adversarial,translator,timeslice}.prompt; контекст — ContextSource (не DOM), бюджет 12000, required без бюджета + optional с truncateText, ctxLog-драфт; клиентская копия статики MODE_UI (ModeModal) — дрейф сторожит integration-check 4x |\n"
      "| `runMode()` | Стриминг через бэкенд + WebSocket | там же — ФАКТ (4.1): дельты sectionKey \"mode:{modeKey}\", mode_done; индекс результата = позиция по created_at ASC; КВИРК taskChars = prompt − ctx; version_modes+1; пауз нет |\n"
      "| `regenerateModeSilent()` | Аналогично | там же — ФАКТ (4.1): source 'mode_cascade', метка «[каскад]», стрим БЕЗ дельт; КВИРКИ: taskChars = prompt целиком, catch без учёта usage; ОТСТУПЛЕНИЕ: UPDATE строки с сохранением created_at (стабильность индексов) |",
      marker="дрейф сторожит integration-check 4x")

# ── 04 §2.6: адресация остатков — открытые долги §12 ────────────────

# optional: переходник — вторая порция заменяет этот текст на ФАКТ
patch("04-§2.6-EditModal", P4,
      "карточки результатов режимов — TODO(4.1) |",
      "карточки результатов режимов — ОТКРЫТЫЙ долг §12 за 4.1 (транспорт GET /modes готов, сами карточки не перенесены) |",
      optional=True)

# optional: переходник — вторая порция заменяет этот текст на ФАКТ
patch("04-§2.6-SubsectionRegen", P4,
      "«третья волна» и каскад режимов не переносятся (повторного превью после волны нет; режимы — 4.1) |",
      "«третья волна» и каскад режимов не переносятся (повторного превью после волны нет; каскад режимов — ОТКРЫТЫЙ долг §12 за 4.1, инфраструктура готова) |",
      optional=True)

# ── spec фрагмента 4.1: дыра css*:.mode- ────────────────────────────

patch("spec-4.1-css-дыра", SPEC,
      "## Стили режимов\ncss*:.mode-",
      "## Стили режимов. css*:.mode- не ловит id-правило и keyframes —\n"
      "## дыра комплекта, найденная беседой 4.1 (доложено в журнал 07)\n"
      "css*:.mode-\n"
      "css:#modeTabsBar\n"
      "css:@keyframes pulse-tab")


# ════ Вторая порция (довыполнение 4.1: закрытие долгов §12) ═════════

# ── 07 §12: обе строки долгов — ЗАКРЫТЫ ─────────────────────────────

patch("07-§12-карточки-закрыт", P7,
      "| Карточки результатов режимов в EditModal [18560–18630] (транспорт GET /modes готов с 4.1) | 4.1 | 4.1 | ОТКРЫТ — вне запроса 1, довыполнение по команде |",
      "| Карточки результатов режимов в EditModal [18560–18630] (транспорт GET /modes готов с 4.1) | 4.1 | 4.1 | ЗАКРЫТ 4.1 (2026-08-28, довыполнение): ModeResultsPanel (панель «РЕЖИМЫ», чекбоксы с id исходника, ⚡-строки затронутости; взаимоисключение — паритет валидации edit-planner, исходник позволял оба) + план modeRegen/modeRemove из EditModal + кнопка «отметить ↑» в CascadePanel E5 [19483] + refetch панели по onPlanFinished и счётчиков SynthesisPage при закрытии модалки; тест R6 |")

patch("07-§12-каскад-закрыт", P7,
      "| Каскад режимов после перегенерации подраздела (очередь runMode из SubsectionRegenPanel; mode-service готов с 4.1) | 4.1 | 4.1 | ОТКРЫТ — вне запроса 1, довыполнение по команде |",
      "| Каскад режимов после перегенерации подраздела (очередь runMode из SubsectionRegenPanel; mode-service готов с 4.1) | 4.1 | 4.1 | ЗАКРЫТ 4.1 (2026-08-28, довыполнение) С ПЕРЕФОРМУЛИРОВКОЙ: исходник после волны спрашивал confirm со списком и оценкой [19007–19036] и звал runMode() с paramValue ИЗ ПОЛЯ МОДАЛКИ [19034] («нужен fallback» — его же комментарий; создавало НОВЫЙ результат с чужим параметром). Реализовано: confirm 1:1 [19022] → очередь тихих перегенераций СУЩЕСТВУЮЩИХ результатов с их СОБСТВЕННЫМИ param (механизм планового каскада [19756]) через новый POST /modes/:modeKey/:index/regenerate (startModeRegen, финал mode_done); тест R7 |")

# ── 03 §2.7: новый эндпоинт ─────────────────────────────────────────

patch("03-§2.7-regenerate", P3,
      "DELETE /syntheses/:id/modes/:modeKey/:index\n"
      "                                → { ok: true }\n"
      "                                // index — позиция по created_at ASC;",
      "POST   /syntheses/:id/modes/:modeKey/:index/regenerate\n"
      "                                → { ok: true }\n"
      "                                // По факту 4.1 (довыполнение §12):\n"
      "                                // тихая перегенерация СУЩЕСТВУЮЩЕГО\n"
      "                                // результата с его собственным param\n"
      "                                // (UPDATE строки, created_at сохранён);\n"
      "                                // финал — mode_done, без дельт. Гейты\n"
      "                                // как у DELETE. Исходник эндпоинта не\n"
      "                                // имел: каскад звал runMode() с param\n"
      "                                // из поля модалки [19034] — отступление\n"
      "\n"
      "DELETE /syntheses/:id/modes/:modeKey/:index\n"
      "                                → { ok: true }\n"
      "                                // index — позиция по created_at ASC;",
      marker=":index/regenerate")

# ── 04 §2.6: пометки долгов → ФАКТ ──────────────────────────────────

patch("04-§2.6-EditModal-факт", P4,
      "карточки результатов режимов — ОТКРЫТЫЙ долг §12 за 4.1 (транспорт GET /modes готов, сами карточки не перенесены) |",
      "карточки результатов режимов — ФАКТ (4.1, довыполнение §12): ModeResultsPanel + план modeRegen/modeRemove + «отметить ↑» в E5 |")

patch("04-§2.6-SubsRegen-факт", P4,
      "«третья волна» и каскад режимов не переносятся (повторного превью после волны нет; каскад режимов — ОТКРЫТЫЙ долг §12 за 4.1, инфраструктура готова) |",
      "«третья волна» не переносится (повторного превью после волны нет); каскад режимов — ФАКТ (4.1, довыполнение §12): confirm с оценкой [19022] → тихие перегенерации с СОБСТВЕННЫМ param через POST /modes/:key/:i/regenerate (отступление от runMode-из-модалки [19034]) |")

# ── 07: дополнение блока «По факту 4.1» ─────────────────────────────

patch("07-по-факту-довыполнение", P7,
      "- Вне запроса 1 остались (открытые долги §12 за 4.1): карточки\n"
      "  результатов режимов в EditModal [18560–18630], каскад режимов\n"
      "  из SubsectionRegenPanel.",
      "- Довыполнение (2026-08-28, той же беседой): оба долга §12 ЗАКРЫТЫ —\n"
      "  панель «РЕЖИМЫ» EditModal (ModeResultsPanel) с планом\n"
      "  modeRegen/modeRemove и кнопкой «отметить ↑» E5; подраздельный\n"
      "  каскад режимов через новый POST /modes/:modeKey/:index/regenerate\n"
      "  (confirm с оценкой 1:1 [19022]; отступление: тихая перегенерация\n"
      "  с СОБСТВЕННЫМ param вместо runMode-из-модалки [19034]).\n"
      "  Найдено тестом R6: счётчики режимов SynthesisPage не обновлялись\n"
      "  после плана — закрытие EditModal теперь перечитывает getModes.\n"
      "  Тест расширен до R6/R7: 77 ✓ ×2.")


# ════ Третья порция: README (упущение, доложено пользователем) ══════

RM = "README.md"

patch("README-заголовок-статуса", RM,
      "## Статус: Фазы 0–3 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3; Фаза 3: 3.1, 3.2)",
      "## Статус: Фазы 0–3 завершены + 4.1 (Фаза 2: 2.1, 2.2, 2.4, 2.3; Фаза 3: 3.1, 3.2; Фаза 4: 4.1)")

patch("README-абзац-4.1", RM,
      "  Доки пропатчены scripts/patch-docs-conv32.py.\n"
      "\n"
      "Не сделано (Фаза 4+):",
      "  Доки пропатчены scripts/patch-docs-conv32.py.\n"
      "\n"
      "- **4.1 — Mode Service (бэкенд + клиент).**\n"
      "  services/mode-service.ts — владелец режимов: MODE_CONFIG (статика\n"
      "  дословно [22578], промпты mode.* из Registry), канонический\n"
      "  getEffectiveModeDeps [22558] (делегаты cascade-analyzer — ЛЕНИВЫЙ\n"
      "  import() против цикла через generation-service; MODE_TITLES\n"
      "  удалён — долг §12 закрыт), buildModeContext (ContextSource, бюджет\n"
      "  12000, ctxLog), checkModeDeps (тексты 1:1), runMode (дельты\n"
      "  sectionKey \"mode:{key}\", индекс = позиция по created_at ASC),\n"
      "  regenerateModeSilent (source mode_cascade; отступление: UPDATE с\n"
      "  сохранением created_at) + регистрация setModeRegenerator ПОБОЧНЫМ\n"
      "  ЭФФЕКТОМ импорта (долг §12 закрыт — шаги regen_mode планов\n"
      "  работают). routes/modes.ts §2.7 (+ аддитивные warnings/estimate в\n"
      "  GET /modes/:modeKey; DELETE и новый POST\n"
      "  /modes/:modeKey/:index/regenerate под 409-гейтом). Клиент:\n"
      "  ModeModal (MODE_UI — копия статики, дрейф сторожит\n"
      "  integration-check 4x) + ModeTabBar + кнопки «◈ …» со счётчиками\n"
      "  (гейт капсулы — порт updateModeButtons [11799]); guard \"mode:*\"\n"
      "  в useStreamingGeneration. Довыполнение долгов §12 (по указанию\n"
      "  пользователя — беседа не закрывается с долгами своего объёма):\n"
      "  панель «РЕЖИМЫ» EditModal (ModeResultsPanel [18556–18620]) с\n"
      "  планом modeRegen/modeRemove и «отметить ↑» в E5 [19483];\n"
      "  подраздельный каскад режимов — confirm с Σ-оценкой 1:1 [19022] →\n"
      "  тихие перегенерации с СОБСТВЕННЫМ param (отступление от\n"
      "  runMode-из-модалки исходника [19034], «нужен fallback» — его же\n"
      "  комментарий). Найдено тестами: счётчики SynthesisPage не\n"
      "  обновлялись после плана (закрытие EditModal перечитывает\n"
      "  getModes). Тесты: tests/test-41-requests2-5.mjs R0–R7 77 ✓ ×2.\n"
      "  Доки пропатчены scripts/patch-docs-conv41.py.\n"
      "\n"
      "Не сделано (Фаза 4+):",
      marker="4.1 — Mode Service (бэкенд + клиент)")

patch("README-не-сделано", RM,
      "(4.3 — серверный импорт; гейт SynthesisForm снимать по факту), режимы\n"
      "(4.1 — карточки результатов в EditModal и каскад режимов подраздельной\n"
      "панели ждут routes/modes), экспорт/импорт (4.x — серверный",
      "(4.3 — серверный импорт; гейт SynthesisForm снимать по факту),\n"
      "экспорт/импорт (4.x — серверный")

patch("README-следующая-беседа", RM,
      "Фаза 1 закрыта целиком (1.1–1.7); Фаза 2 закрыта целиком: 2.1, 2.2,\n"
      "2.4 (велась перед 2.3 — §11) и 2.3; Фаза 3 закрыта целиком: 3.1, 3.2.\n"
      "Следующая по графу 07 — 4.1\n"
      "(Mode Service).",
      "Фаза 1 закрыта целиком (1.1–1.7); Фаза 2 закрыта целиком: 2.1, 2.2,\n"
      "2.4 (велась перед 2.3 — §11) и 2.3; Фаза 3 закрыта целиком: 3.1,\n"
      "3.2; из Фазы 4 закрыта 4.1 (включая довыполнение долгов §12).\n"
      "Следующая по графу 07 — 4.2\n"
      "(Export Service).")

# ── итог ────────────────────────────────────────────────────────────

print("applied:", len(applied))
for n in applied:
    print("  +", n)
print("skipped:", len(skipped))
for n in skipped:
    print("  =", n)
if failed:
    print("FAILED:", len(failed))
    for n in failed:
        print("  !", n)
    raise SystemExit(1)
