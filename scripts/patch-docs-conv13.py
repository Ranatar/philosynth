#!/usr/bin/env python3
"""
Идемпотентный патч проектных документов по итогам беседы 1.3
(context-builder / context-extractor / parent-context).

Закрывает найденные при реализации и тестировании расхождения:

  07/A  беседа 1.3, запрос 2: столбец «Имя» → «Категория» (промпт графа
        philosynth.html ~10897 задаёт «Категория»), + столбец уровня.
  07/B  беседа 1.3, запрос 3: убран ожидаемый столбец «Категория» —
        extractGlossaryCompact [~8021] берёт РОВНО первые два столбца.
  07/C  беседа 1.3, запрос 4 (бюджетирование): уточнён порог — required
        не обрезаются лишь до 1.5×budget, дальше работает шаг 4 [~8419].
  07/D  беседа 1.3, edge case: extractContextFragment возвращает null,
        а не пустую строку [~8150].
  07/E  беседа 1.3, первый запрос: в список создаваемых файлов добавлены
        server/services/parent-context.ts и server/utils/html-parser.ts
        (04 §1.10 и 05 их предполагают, 07 не создавал ни в одной беседе).
  07/F  беседа 2.4: добавлен server/services/context-quality.ts
        (getSectionContextQuality, 04 §2.1 + 01-arch §4.15 п.3) —
        модуль не создавался ни одной беседой; + ребро 2.3 ← 2.4 в §11.
  07/G  шапка-ревизия.

Вторая волна (сплошная сверка доков с реализацией 1.3):

  03/H  §2.3: добавлен SectionSummary (shared/types/section.ts его уже
        содержит, спецификация — нет), включая contextQualityScore,
        требуемый 01-arch §4.15 п.3.
  03/I  §2.3: ответ /sections/:key/context приведён к реальности —
        contextHtml → contextText (блок ПЛОСКИЙ ТЕКСТ, не HTML) + поля
        v11 (budgetMode, parentOverhead, parentSpec, счётчики).
  02/J  §2.16: уточнено описание parent_spec (структура ОДНА на раздел с
        разбивкой perParent, а не карта по родителям) + примечание о
        rawBaseBudget/conceptOverheadApplied (восстановимы, колонок не надо).
  01/K  §4.3: FRAGMENT_SHARE убран из описания buildContextForSection —
        он участвует только в оценке стоимости (cost-estimator).
  04/L  §2.1: уточнено размещение extractIntraSectionContext (реализация в
        context-extractor, реэкспорт из context-builder).
  04/M  §4: добавлен server/utils/html-parser.ts (новый модуль, в исходнике
        отсутствует — единственная точка входа linkedom).
  07/N  беседа 1.4: контекст дополнен section-defs-builder / cost-estimator /
        context-extractor / parent-context (без них оркестрация не собирается).
  07/O  беседа 2.1: отмечено, что canonicalSubsectionKey ждёт колбэком
        context-builder (TODO(2.1) в коде).
  05/P  корень дерева: добавлен .gitignore (в репозитории отсутствовал —
        .env с паролем БД и ключами API ничем не защищён).

Сопутствующие правки репозитория (не docs, но следствие сверки):
  создан .env.example — числился в 05, но в репозитории отсутствовал;
  сверен с server/env.ts: покрыты ВСЕ 16 переменных;
  создан .gitignore;
  packages/shared/types/section.ts — SectionContextPreview приведён к 03/I
  (contextHtml → contextText + поля v11): тип из беседы 0.1 отстал от
  исправленной спецификации, потребителей ещё нет.

Четвёртая волна — README.md (корень репо): статус остановился на Фазе 0,
хотя беседы 1.1–1.3 закрыты.

УРОК ПРЕДЫДУЩИХ ПАТЧЕЙ (соблюдён): проверять `new in text` ПЕРВЫМ —
в правках-дописываниях old является префиксом new.
Только str.replace, никаких re.sub (интерпретирует \\n).

Запуск: python3 scripts/patch-docs-conv13.py [--docs docs]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

applied = 0
skipped = 0
failed = 0


def patch(path: Path, label: str, old: str, new: str) -> None:
    global applied, skipped, failed
    text = path.read_text(encoding="utf-8")
    if new in text:  # ПЕРВЫМ: повторный прогон
        print(f"  skip   {label}")
        skipped += 1
        return
    if old not in text:
        print(f"  FAIL   {label}: якорь не найден")
        failed += 1
        return
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"  applied {label}")
    applied += 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--docs", default="docs")
    args = ap.parse_args()
    docs = Path(args.docs)
    p07 = docs / "07-conversation-protocol.md"
    if not p07.exists():
        print(f"нет файла {p07}", file=sys.stderr)
        return 2

    print("Патч документов по итогам беседы 1.3:")

    # ── 07/A: столбцы таблицы категорий ──
    patch(
        p07,
        "07/A запрос 2 беседы 1.3 — столбцы таблицы категорий",
        "- «Протестируй extractGraphNodesTable: вставь 5 записей в categories "
        "(разные типы, centrality, certainty) → extractGraphNodesTable возвращает "
        "форматированную таблицу с колонками Имя, Тип, Определение, Центральность, "
        "Определённость?»",
        "- «Протестируй extractGraphNodesTable: вставь 5 записей в categories "
        "(разные типы, centrality, certainty) → extractGraphNodesTable возвращает "
        "форматированную таблицу со столбцами промпта графа (philosynth.html ~10897): "
        "Категория, Тип, Определение, Центральность, Определённость и столбец уровня "
        "(comparative → «Происхождение», transformative → «Генеалогия», "
        "generative → «Преодолённые ограничения», шаблон Registry "
        "`level.{level}.graph_last_col_name`)? При extGraphMetrics — плюс 6 столбцов "
        "(Ист. значимость, Степень инновации, Ясность, Широта, Глубина, Применимость)?»",
    )

    # ── 07/B: глоссарий — ровно два столбца ──
    patch(
        p07,
        "07/B запрос 3 беседы 1.3 — глоссарий без столбца «Категория»",
        "- «Протестируй extractGlossaryTable: 3 термина в glossary_terms → "
        "таблица с колонками Термин, Определение, Категория?»",
        "- «Протестируй extractGlossaryTable: 3 термина в glossary_terms → "
        "таблица с колонками Термин, Определение? (extractGlossaryCompact "
        "исходника ~8021 берёт РОВНО первые два столбца — termCategory в "
        "межсекционный контекст не попадает; ячейки нормализуются как в "
        "tableToText: переносы и двойные пробелы → одиночный пробел)»",
    )

    # ── 07/C: порог пережатия required ──
    patch(
        p07,
        "07/C запрос 4 беседы 1.3 — порог 1.5×budget",
        "- «Протестируй бюджетирование: создай ситуацию, где суммарный контекст "
        "превышает CONTEXT_BUDGET — optional-фрагменты обрезаются, required — нет. "
        'ctxLog содержит записи со status "found", "truncated", "skipped_budget"?»',
        "- «Протестируй бюджетирование: создай ситуацию, где суммарный контекст "
        "превышает CONTEXT_BUDGET — optional-фрагменты обрезаются, required — нет. "
        'ctxLog содержит записи со status "found", "truncated", "skipped_budget"?» '
        "ВАЖНО: «required не обрезаются» верно лишь до порога 1.5×budget — шаг 4 "
        "исходника (~8419) пережимает required при requiredLen > budget×1.5, щадя "
        "неприкосновенный набор UNTOUCHABLE (graph:nodes, graph:edges, sum:goals, "
        "sum:tensions). Проверить обе стороны порога.",
    )

    # ── 07/D: null вместо пустой строки ──
    patch(
        p07,
        "07/D edge case беседы 1.3 — null вместо пустой строки",
        "- «Edge case: buildContextForSection для первого раздела (sum) — "
        "priorContext пуст, функция не crash. extractContextFragment для раздела, "
        "который ещё не сгенерирован — возвращает пустую строку, не ошибку»",
        "- «Edge case: buildContextForSection для первого раздела (sum) — "
        "priorContext пуст, функция не crash. extractContextFragment для раздела, "
        "который ещё не сгенерирован — возвращает null (не пустую строку и не "
        "ошибку: null исходника ~8150 falsy и отличим от валидного пустого "
        "фрагмента, buildContextForSection трактует его как status=\"missing\")»",
    )

    # ── 07/E: недостающие файлы первого запроса 1.3 ──
    patch(
        p07,
        "07/E первый запрос беседы 1.3 — parent-context.ts и html-parser.ts",
        "3. server/utils/text.ts: truncateText(), tableToText() — из truncateText()",
        "3. server/utils/text.ts: truncateText(), tableToText() — из truncateText()\n"
        "\n"
        "4. server/services/parent-context.ts (04 §1.10; ни одна беседа 07 его не "
        "создавала, хотя parentOverheadForSection и parentSpec в ctxLog без него не "
        "собираются):\n"
        "   - resolveParentDeps(), resolveParentDepsForSubsection() — 4-слойное "
        "слияние карт parent_deps.* из Registry тем же deepMergeUniq;\n"
        "   - parentFieldsUsedFor(), buildParentSpecForLog() — spec для ctxLog;\n"
        "   - validateParentDeps() — порт _validateParentDeps (в исходнике "
        "вызывается при загрузке модуля; здесь явный, карты приходят из БД).\n"
        "   conceptContextBlockFull/Selective — НЕ здесь (meta-synthesis-service, "
        "беседа 3.1).\n"
        "\n"
        "5. server/utils/html-parser.ts (05-file-structure; обёртка над linkedom):\n"
        "   - parseFragment(html) — контейнер-аналог generated[sectionKey];\n"
        "   - innerText(el) — ПРИБЛИЖЕНИЕ браузерного innerText: linkedom даёт свой "
        "innerText ≈ textContent (склеивает блоки без переносов), поэтому нужен "
        "обход дерева с границами блоков. Это адаптация, а не дословный порт.",
    )

    # ── 07/F: context-quality.ts в беседе 2.4 ──
    patch(
        p07,
        "07/F беседа 2.4 — context-quality.ts",
        "2. server/routes/logs.ts:",
        "2. server/services/context-quality.ts (04 §2.1, 01-arch §4.15 п.3; модуль "
        "не создавался ни одной беседой — дыра, найденная в 1.3):\n"
        "   - getSectionContextQuality(synthesisId, sectionKey) — по ПОСЛЕДНЕЙ "
        "записи context_log раздела: score = round(reqFound/reqTotal × 70 + "
        "min(1, totalUsed/budget) × 30) и issues («Отсутствовали обязательные: …», "
        "«N контекст(ов) пропущено из-за бюджета», «N контекст(ов) обрезано», "
        "«N подстановок(ки)»);\n"
        "   - score отдаётся в GET /syntheses/:id/sections → цветной бейдж качества "
        "на карточке раздела в Edit Modal (EditSectionCard.tsx, беседа 2.3: ≥90 "
        "зелёный). Беседа 2.3 зависит от этого модуля — см. §11.\n"
        "\n"
        "3. server/routes/logs.ts:",
    )

    patch(
        p07,
        "07/F(2) §11 — ребро 2.3 ← 2.4",
        "5.1 (element-editor, element-versioning) ← 0.1 (schema) + 2.1 (cascade-analyzer)",
        "2.3 (бейдж качества контекста на карточке раздела) ← 2.4 "
        "(context-quality.ts, getSectionContextQuality)\n"
        "5.1 (element-editor, element-versioning) ← 0.1 (schema) + 2.1 (cascade-analyzer)",
    )

    # ── 07/G: шапка-ревизия ──
    patch(
        p07,
        "07/G шапка-ревизия",
        "> **Правка 2026-07-27 (итоги 1.2)**: groupPasses приведён к фактической",
        "> **Правка 2026-07-27 (итоги 1.3)**: беседа 1.3 — столбцы таблицы категорий\n"
        "> приведены к промпту исходника (~10897, «Категория» + столбец уровня),\n"
        "> из ожиданий глоссария убран столбец «Категория» (~8021 берёт два\n"
        "> столбца), уточнён порог пережатия required 1.5×budget (~8419),\n"
        "> extractContextFragment возвращает null, а не пустую строку (~8150);\n"
        "> в первый запрос добавлены parent-context.ts и html-parser.ts;\n"
        "> в беседу 2.4 добавлен context-quality.ts (дыра: модуль из 04 §2.1 и 05\n"
        "> не создавался ни одной беседой) + ребро 2.3 ← 2.4 в §11.\n"
        ">\n"
        "> **Правка 2026-07-27 (итоги 1.2)**: groupPasses приведён к фактической",
    )


    # ═══ Вторая волна: сплошная сверка доков с реализацией 1.3 ═══

    p01 = docs / "01-architecture.md"
    p02 = docs / "02-data-model.md"
    p03 = docs / "03-specification.md"
    p04 = docs / "04-code-reuse-map.md"

    # ── 03/H: SectionSummary в спецификации ──
    patch(
        p03,
        "03/H §2.3 — SectionSummary",
        "**SectionFull:**\n```typescript\n{\n  key: string;\n  sectionNum: number;\n  title: string;\n  htmlContent: string;",
        "**SectionSummary** (элемент списка GET /syntheses/:id/sections):\n"
        "```typescript\n"
        "{\n"
        "  key: string;\n"
        "  sectionNum: number;\n"
        "  title: string;\n"
        "  isEdited: boolean;\n"
        "  htmlChars: number;              // длина html_content, симв.\n"
        "  contextQualityScore: number | null;  // v11: getSectionContextQuality\n"
        "                                       // (01 §4.15 п.3) — 0–100 либо null,\n"
        "                                       // если ctxLog по разделу отсутствует;\n"
        "                                       // цветной бейдж в Edit Modal\n"
        "  updatedAt: string;\n"
        "}\n"
        "```\n"
        "\n"
        "**SectionFull:**\n```typescript\n{\n  key: string;\n  sectionNum: number;\n  title: string;\n  htmlContent: string;",
    )

    # ── 03/I: ответ отладочного эндпоинта контекста ──
    patch(
        p03,
        "03/I §2.3 — /sections/:key/context",
        "GET    /syntheses/:id/sections/:key/context\n"
        "                                → { contextHtml: string, budget: number, used: number,\n"
        "                                    entries: ContextEntry[] }\n"
        "                                // Отладочный эндпоинт: показывает, какой контекст\n"
        "                                // будет использован при (пере)генерации этого раздела",
        "GET    /syntheses/:id/sections/:key/context\n"
        "                                → { contextText: string, budget: number,\n"
        "                                    rawBaseBudget: number, totalUsed: number,\n"
        "                                    budgetMode: 'full'|'shrink',\n"
        "                                    parentOverhead: number,\n"
        "                                    parentSpec: ParentSpecLog | null,\n"
        "                                    reqFound: number, reqTotal: number,\n"
        "                                    optIncluded: number, optTotal: number,\n"
        "                                    entries: ContextEntry[] }\n"
        "                                // Отладочный эндпоинт: показывает, какой контекст\n"
        "                                // будет использован при (пере)генерации раздела.\n"
        "                                // contextText — ПЛОСКИЙ ТЕКСТ блока «КОНТЕКСТ ИЗ\n"
        "                                // ПРЕДЫДУЩИХ РАЗДЕЛОВ …», а не HTML (прежнее имя\n"
        "                                // contextHtml вводило в заблуждение).\n"
        "                                // Поля соответствуют CtxLogDraft, который\n"
        "                                // возвращает buildContextForSection (беседа 1.3);\n"
        "                                // rawBaseBudget = CONTEXT_BUDGET[depth] ×\n"
        "                                // (key === 'critique' ? 1.5 : 1)",
    )

    # ── 02/J: описание parent_spec + примечание о производных полях ──
    patch(
        p02,
        "02/J §2.16 — структура parent_spec и производные поля бюджета",
        "  parent_spec   JSONB,  -- per-parent spec: required/optional поля, missingRequired, опущенные",
        "  parent_spec   JSONB,  -- spec родительского контекста РАЗДЕЛА (не карта по\n"
        "                        -- родителям): { required, optional, perParent[], totalChars },\n"
        "                        -- где perParent[i] = { name, includedFields, omittedFields,\n"
        "                        -- missingRequired, chars } — buildParentSpecForLog [~10197]\n"
        "  -- ПРИМЕЧАНИЕ (беседа 1.3): ctxLog исходника несёт ещё rawBaseBudget и\n"
        "  -- conceptOverheadApplied. Колонок они НЕ требуют — оба восстановимы:\n"
        "  --   rawBaseBudget = CONTEXT_BUDGET[depth] × (section_key='critique' ? 1.5 : 1),\n"
        "  --   conceptOverheadApplied = rawBaseBudget − budget.\n"
        "  -- parent_overhead хранит СЫРОЙ вес родителей (parentOverheadForSection),\n"
        "  -- а не величину ужатия — это разные числа.",
    )

    # ── 01/K: FRAGMENT_SHARE не участвует в buildContextForSection ──
    patch(
        p01,
        "01/K §4.3 — FRAGMENT_SHARE только в оценщике",
        "Бюджетирование (`CONTEXT_BUDGET`, `FRAGMENT_SHARE`, приоритизация required/optional) переносится, но дополнено (v11)",
        "Бюджетирование (`CONTEXT_BUDGET`, приоритизация required/optional) переносится, но дополнено (v11)",
    )

    patch(
        p01,
        "01/K(2) §4.3 — где живёт FRAGMENT_SHARE",
        "бейдж на карточке раздела в Edit Modal.",
        "бейдж на карточке раздела в Edit Modal. `FRAGMENT_SHARE` в самом "
        "`buildContextForSection` не участвует (сверено в беседе 1.3): он читается "
        "только оценщиком стоимости (`cost-estimator`, доля фрагмента в бюджете при "
        "прогнозе), поэтому context-builder тянет из конфигов лишь `context_budget`.",
    )

    # ── 04/L: размещение extractIntraSectionContext ──
    patch(
        p04,
        "04/L §2.1 — размещение extractIntraSectionContext",
        "| `extractIntraSectionContext()`, `extractRelevantIntraSectionContext()` | DOM → серверный HTML-парсинг (linkedom/cheerio) | `server/services/context-builder.ts` |",
        "| `extractRelevantIntraSectionContext()` | DOM → серверный HTML-парсинг (linkedom); INTRA_DEPS из Registry; `canonicalSubsectionKey` принимается колбэком до беседы 2.1 | `server/services/context-builder.ts` |\n"
        "| `extractIntraSectionContext()` | Реализация живёт в DOM-слое рядом с прочими extract*(); из `context-builder` реэкспортируется — соответствие карте без дублирования кода | `server/services/context-extractor.ts` |",
    )

    # ── 04/M: html-parser в списке нового ──
    patch(
        p04,
        "04/M §4 — server/utils/html-parser.ts",
        "| `client/hooks/useWebSocket.ts` | WebSocket-hook с reconnect |",
        "| `client/hooks/useWebSocket.ts` | WebSocket-hook с reconnect |\n"
        "| `server/utils/html-parser.ts` | Обёртка над linkedom: `parseFragment` (контейнер-аналог `generated[key]`) + `innerText` — ПРИБЛИЖЕНИЕ браузерного innerText (linkedom даёт свой ≈ textContent). Единственная точка входа linkedom (беседа 1.3) |",
    )

    # ── 07/N: контекст беседы 1.4 ──
    patch(
        p07,
        "07/N беседа 1.4 — недостающий контекст",
        "- `server/services/prompt-builder.ts` (из 1.2)\n"
        "- `server/services/context-builder.ts` (из 1.3)\n"
        "- `server/services/synthesis-engine.ts` (из 1.1)\n"
        "- `server/db/schema.ts`\n"
        "- Исходник: streamResp(), generateDoc() (только логика оркестрации, без DOM)",
        "- `server/services/prompt-builder.ts` (из 1.2)\n"
        "- `server/services/section-defs-builder.ts` (из 1.2: buildSectionDefs,\n"
        "  groupPasses, patchPromptsWithSecCtx — без них проходы не собрать)\n"
        "- `server/services/context-builder.ts` (из 1.3; ВОЗВРАЩАЕТ CtxLogDraft —\n"
        "  писать его в context_log обязан generation-service)\n"
        "- `server/services/context-extractor.ts` (из 1.3: createDbContextSource)\n"
        "- `server/services/parent-context.ts` (из 1.3: реализация провайдера для\n"
        "  setParentContextProvider — разъём, оставленный беседой 1.2)\n"
        "- `server/services/synthesis-engine.ts` (из 1.1)\n"
        "- `server/services/cost-estimator.ts` (из 1.1: sysChars = buildSYS().length,\n"
        "  baseStaticChars = baseCtxStatic().length, passes = groupPasses(defs))\n"
        "- `server/db/schema.ts`\n"
        "- Исходник: streamResp(), generateDoc() (только логика оркестрации, без DOM)",
    )

    # ── 07/O: canonicalSubsectionKey — потребитель из 1.3 ──
    patch(
        p07,
        "07/O беседа 2.1 — потребитель canonicalSubsectionKey",
        "   - canonicalSubsectionKey() — каноникализация портретных заголовков\n"
        "     (варианты SUBSECTION_SUM_PORTRAIT схлопываются для карт зависимостей, v11)",
        "   - canonicalSubsectionKey() — каноникализация портретных заголовков\n"
        "     (варианты SUBSECTION_SUM_PORTRAIT схлопываются для карт зависимостей, v11).\n"
        "     ПОТРЕБИТЕЛЬ ИЗ 1.3: extractRelevantIntraSectionContext в context-builder\n"
        "     принимает её колбэком (default — тождество, метка TODO(2.1) в коде);\n"
        "     после создания подставить настоящую, иначе при кардинальности ≠ multi\n"
        "     имена подразделов не совпадут с каноном INTRA_DEPS.",
    )


    p05 = docs / "05-file-structure.md"

    # ── 05/P: .gitignore в дереве монорепозитория ──
    patch(
        p05,
        "05/P корень — .gitignore",
        "├── docker-compose.yml              # PostgreSQL + Redis для dev\n"
        "├── .env.example",
        "├── docker-compose.yml              # PostgreSQL + Redis для dev\n"
        "├── .gitignore                      # node_modules, dist, .env (пароль БД\n"
        "│                                   # и ключи API), dump.rdb, архивы\n"
        "├── .env.example                    # ВСЕ переменные server/env.ts;\n"
        "│                                   # пароль БД обязан совпадать с дефолтом\n"
        "│                                   # env.ts — .env читает только drizzle-kit,\n"
        "│                                   # tsx-скрипты берут process.env",
    )


    # ═══ README.md (корень репозитория) ═══

    readme = docs.parent / "README.md"
    if readme.exists():
        patch(
            readme,
            "README/Q — покрытие check:integration",
            "`check:integration` расширяется секциями по мере бесед (сейчас покрывает\n0.1–0.6); живые секции требуют поднятых PG и Redis и засеянных\nprompt_templates.",
            "`check:integration` расширяется секциями по мере бесед (сейчас покрывает\n0.1–0.6 и 1.1–1.3); живые секции требуют поднятых PG и Redis и засеянных\nprompt_templates, synthesis_configs и каталогов таксономии.",
        )
        patch(
            readme,
            "README/R — заголовок статуса",
            "## Статус: Фаза 0 завершена (беседы 0.1–0.6 + 0.3b)",
            "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.3 закрыты",
        )
        patch(
            readme,
            "README/S — беседы 1.1–1.3 и актуальный «не сделано»",
            "Не сделано (Фаза 1+): synthesis engine, prompt/context builder, streaming\nи pause/resume, страницы синтеза/каталога/графа, billing. Следующая по\nграфу 07 — беседа 1.1 (критический путь) или клиентские ветки.",
            "- **1.1 — synthesis engine.** utils/deep-merge (deepMergeUniq) и\n"
            "  utils/topo-sort (computePredecessors, buildDynamicOrder, разрыв циклов\n"
            "  по слабейшему ребру); services/synthesis-engine (resolveContextDeps,\n"
            "  buildEffectiveDeps, findSubstitute — конфиги из Registry);\n"
            "  compat-advisor по entry-модели `level:method` с чипами и живыми\n"
            "  предупреждениями зависимостей; cost-estimator (константы и формулы\n"
            "  исходника дословно).\n"
            "- **1.2 — prompt builder + section defs.** extract-section-templates.mjs\n"
            "  сгенерировал 146 шаблонов `section.*` (итого 253 в Registry);\n"
            "  prompt-builder (buildSYS из четырёх частей, baseCtx = static + parents\n"
            "  через подключаемый провайдер, словоформы кардинальности) и\n"
            "  section-defs-builder (buildSectionDefs / serializeParts / groupPasses /\n"
            "  patchPromptsWithSecCtx); байтовая сверка с исходником 121/121 ✓.\n"
            "- **1.3 — context builder (DOM → БД).** buildContextForSection с полным\n"
            "  бюджетированием (пол 40% под давлением родительских концепций,\n"
            "  пережатие required за порогом 1.5×, статусы ctxLog); context-extractor\n"
            "  (все ветки диспетчера: приоритетные ключи из гранулярных таблиц,\n"
            "  остальные — из HTML раздела через linkedom); parent-context\n"
            "  (селективный родительский контекст, 4-слойные карты из Registry);\n"
            "  utils/html-parser — единственная точка входа linkedom.\n"
            "\n"
            "Не сделано (Фаза 1+): streaming и pause/resume, оркестрация генерации,\n"
            "парсеры графа и элементов, страницы синтеза/каталога/графа, каскады и\n"
            "план редактирования, мета-синтез, режимы, экспорт/импорт, billing.\n"
            "Следующая по графу 07 — беседа 1.4 (критический путь: в ней сходятся\n"
            "1.2 и 1.3) либо 2.1 параллельно.",
        )

    print(
        f"\nИтог: applied={applied}, skip={skipped}, fail={failed}"
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
