#!/usr/bin/env python3
"""Патч доков по итогам беседы 1.4 (идемпотентный: applied/skip/fail).

Правки:
  14/A  02 §2.3   reasonKind += 'context-error' (исходник [~25842], outer
                  catch _runGenPassesFromIdx; тип shared уже расширен в 1.4)
  14/B  07 1.4    _rebuildNodeColors/_rebuildEdgeStyles — клиентские палитры
                  (04 §1.7, беседа 1.7); на сервере не вызываются
  14/C  07 1.4    onDelta(deltaHtml, totalChars) → (delta, totalChars,
                  htmlSoFar): серверу нужен ИНКРЕМЕНТ для stream_delta §3.2
  14/D  04 §2.3   + портированные в 1.4 функции, отсутствовавшие в карте:
                  _classifyStreamError/_pauseFriendlyMessage,
                  parseSubsectionsFromHTML/_augmentGenEntry/
                  computeFullConceptBlockSizes/buildParentSpecBySection,
                  parseTheses/parseGlossaryFromHTML (без прародителей)
  14/E  04 [176]  updateDocTitleFromName: латентный баг исходника [11886]
                  (\\w не матчит кириллицу) — порт с задокументированным FIX
  14/F  02 §2.15  примечание о служебной строке '_genCommon' (status='common')
  14/G  07        шапка-ревизия += блок 1.4
  14/H  README    заголовок статуса, покрытие check:integration, блок 1.4,
                  актуальный перечень «не сделано»
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


# ── 14/A: 02 §2.3 — reasonKind += context-error ──────────────────────────
patch(
    "docs/02-data-model.md", "14/A 02 §2.3 — reasonKind += context-error",
    "    -- reasonKind: 'auth'|'billing'|'pre-stream'|'max-tokens'|'partial'|'stuck'|'user-abort'",
    "    -- reasonKind: 'auth'|'billing'|'pre-stream'|'max-tokens'|'partial'|'stuck'|'user-abort'\n"
    "    --   |'context-error' (сбой ПОСТРОЕНИЯ контекста/промпта, outer catch\n"
    "    --   _runGenPassesFromIdx [~25842]; найдено беседой 1.4 — kind'ом стрима не является)",
)

# ── 14/B: 07 — _rebuildNodeColors клиентские ─────────────────────────────
patch(
    "docs/07-conversation-protocol.md", "14/B 07 1.4 — _rebuild* клиентские",
    "   v10: парсинг поддерживает расширенные столбцы (extGraphMetrics);\n"
    "   после парсинга вызываются _rebuildNodeColors/_rebuildEdgeStyles.",
    "   v10: парсинг поддерживает расширенные столбцы (extGraphMetrics).\n"
    "   _rebuildNodeColors/_rebuildEdgeStyles — КЛИЕНТСКИЕ динамические палитры\n"
    "   (04 §1.7 → client/components/graph/graph-utils.ts, беседа 1.7); на\n"
    "   сервере не вызываются (сверено беседой 1.4).",
)

# ── 14/C: 07 — сигнатура onDelta ─────────────────────────────────────────
patch(
    "docs/07-conversation-protocol.md", "14/C 07 1.4 — onDelta с инкрементом",
    "     d. Вызов onDelta(deltaHtml, totalChars) для каждого чанка",
    "     d. Вызов onDelta(delta, totalChars, htmlSoFar) для каждого чанка\n"
    "        (исходник передавал (length, html); серверу для stream_delta §3.2\n"
    "        нужен ИНКРЕМЕНТ — сигнатура расширена, зафиксировано беседой 1.4)",
)

# ── 14/D: 04 §2.3 — недостающие функции 1.4 ──────────────────────────────
patch(
    "docs/04-code-reuse-map.md", "14/D 04 §2.3 — функции 1.4 в карте",
    "| — | Клиент получает дельты через WebSocket и рендерит HTML | `client/hooks/useStreamingGeneration.ts` |",
    "| `_classifyStreamError()`, `_pauseFriendlyMessage()` | Классификация обрыва и человекочитаемая причина паузы (v11) | `server/services/streaming-manager.ts` |\n"
    "| `parseSubsectionsFromHTML()`, `_augmentGenEntry()` (metadata генлога), `computeFullConceptBlockSizes()`, `buildParentSpecBySection()` | Трекинг подразделов в потоке; расширение записей generation_log | `server/services/generation-service.ts` |\n"
    "| Извлечение тезисов/глоссария в гранулярные таблицы | Прародителей в исходнике НЕТ (там только компактные extract* для контекста) — парсеры построены по структурам таблиц из промптов Registry (беседа 1.4) | `server/services/element-parser.ts` |\n"
    "| — | Клиент получает дельты через WebSocket и рендерит HTML | `client/hooks/useStreamingGeneration.ts` |",
)

# ── 14/E: 04 — латентный баг updateDocTitleFromName ──────────────────────
patch(
    "docs/04-code-reuse-map.md", "14/E 04 — FIX \\w-бага [11886]",
    "| `updateDocTitleFromName()` | Авто-заголовок из раздела «name» → PATCH syntheses.title после section_done | `server/services/generation-service.ts` |",
    "| `updateDocTitleFromName()` | Авто-заголовок из раздела «name» → PATCH syntheses.title после section_done. ЛАТЕНТНЫЙ БАГ исходника [11886]: классы \\w в регекспе префиксов не матчат кириллицу в JS — срезание префиксов было мёртвым кодом; порт (беседа 1.4) несёт задокументированный FIX \\w → [а-яё] | `server/services/generation-service.ts` |",
)

# ── 14/F: 02 §2.15 — служебная строка _genCommon ─────────────────────────
patch(
    "docs/02-data-model.md", "14/F 02 §2.15 — строка _genCommon",
    "Аналог массива `genLog` из исходника.",
    "Аналог массива `genLog` из исходника.\n\n"
    "Служебная строка `section_key='_genCommon'`, `status='common'` (беседа 1.4):\n"
    "объект `genCommon` исходника (sysChars, baseChars, budgetMode,\n"
    "parentSpecBySection, conceptBlockSizes, …) хранится в `metadata` этой\n"
    "строки — отдельной колонки не требует; потребители — log-formatter (2.4)\n"
    "и экспорт промптов (4.2). Статусы строк генерации: 'streaming' (идёт) →\n"
    "'done'/'error'; 'common' — только у служебной строки.",
)

# ── 14/G: 07 — шапка-ревизия ─────────────────────────────────────────────
patch(
    "docs/07-conversation-protocol.md", "14/G 07 — шапка-ревизия 1.4",
    "> **Ревизия 2026-07-22**",
    "> **Правки 2026-07-27 (итоги беседы 1.4)**: сигнатура onDelta с инкрементом;\n"
    "> _rebuildNodeColors/_rebuildEdgeStyles отнесены к клиенту (1.7); в 02 §2.3\n"
    "> reasonKind += 'context-error'; в 04 §2.3 добавлены портированные функции\n"
    "> 1.4 и FIX \\w-бага updateDocTitleFromName [11886]; в 02 §2.15 — служебная\n"
    "> строка '_genCommon'.\n>\n"
    "> **Ревизия 2026-07-22**",
)

# ── 14/H: README ─────────────────────────────────────────────────────────
patch(
    "README.md", "14/H1 README — покрытие check:integration",
    "`check:integration` расширяется секциями по мере бесед (сейчас покрывает\n0.1–0.6 и 1.1–1.3);",
    "`check:integration` расширяется секциями по мере бесед (сейчас покрывает\n0.1–0.6 и 1.1–1.4);",
)
patch(
    "README.md", "14/H2 README — заголовок статуса",
    "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.3 закрыты",
    "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.4 закрыты",
)
patch(
    "README.md", "14/H3 README — блок 1.4 и перечень несделанного",
    "Не сделано (Фаза 1+): streaming и pause/resume, оркестрация генерации,\n"
    "парсеры графа и элементов, страницы синтеза/каталога/графа, каскады и\n"
    "план редактирования, мета-синтез, режимы, экспорт/импорт, billing.\n"
    "Следующая по графу 07 — беседа 1.4 (критический путь: в ней сходятся\n"
    "1.2 и 1.3) либо 2.1 параллельно.",
    "- **1.4 — streaming + оркестрация генерации.** streaming-manager (порт\n"
    "  _streamRespOnce: SSE, классификация auth/billing/pre-stream/max-tokens/\n"
    "  partial/stuck/user-abort, stuck-таймер 45с, reconnect-буфер в Redis);\n"
    "  generation-service (порт generateDoc/_runGenPassesFromIdx: проходы,\n"
    "  контексты в context_log, паузы с pausedState, ретраи pre-stream 1с/3с/8с,\n"
    "  genCommon в генлоге, авто-заголовок из «name»); graph-parser и\n"
    "  element-parser (гранулярные таблицы); POST /syntheses; WS\n"
    "  subscribe_generation/cancel + resume-протокол §3.3. Сквозной тест с\n"
    "  мок-SSE Claude API: test-14-requests2-8.mjs 46/46 ✓.\n\n"
    "Не сделано (Фаза 1+): pause/resume-действия (1.4b), страницы\n"
    "синтеза/каталога/графа, каскады и план редактирования, мета-синтез,\n"
    "режимы, экспорт/импорт, billing.\n"
    "Следующая по графу 07 — беседа 1.4b (Pause/Resume) либо 1.5 (форма и\n"
    "прогресс) / 2.1 (cascade-analyzer) параллельно.",
)

print(f"\nИтог: applied={applied}, skip={skipped}, fail={failed}")
raise SystemExit(1 if failed else 0)
