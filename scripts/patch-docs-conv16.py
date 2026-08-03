#!/usr/bin/env python3
"""Патч документации по итогам беседы 1.6 (транспорт чтения, сервер).

Идемпотентный: каждая правка проверяет наличие нового текста и уходит в
skip при повторном прогоне. Отчёт applied/skip/fail. Запуск из корня репо:
    python3 scripts/patch-docs-conv16.py

Правки:
  16/A  07 «Контекст» 1.6: parseSubsectionsFromHTML живёт в
        generation-service, а не в context-extractor (неточность).
  16/B  07 пункт 2 запроса 1.6: /:key/context — живой
        buildContextForSection (contextText в context_log не хранится).
  16/C  07 блок «По факту 1.6» после «Завершение беседы» (адаптации,
        решения duplicate/DELETE, viewOnly, грабли харнесса).
  16/D  07 §12: строка маркеров TODO(1.6) — серверная половина закрыта.
  16/E  07 шапка: запись ревизии 2026-08-02.
  16/F  03 §3.1: viewOnly в subscribe_generation.
  16/G  03 §2.2: решения duplicate (доступ, генеалогия, логи, 409).
  16/H  03 §2.2: DELETE — 409 при активной генерации.
  16/I  03 §3.4: примечание — HTTP-лимитер фактически per-IP.
  16/J  README: статус после 1.6.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
P07 = ROOT / "docs" / "07-conversation-protocol.md"
P03 = ROOT / "docs" / "03-specification.md"
README = ROOT / "README.md"

applied = 0
skipped = 0
failed = 0


def patch(path: Path, old: str, new: str, label: str, marker: str | None = None) -> None:
    """Заменяет old → new; идемпотентность — по marker (или new) в тексте.

    Урок 16pre: если новый текст неуникален, маркер задавать явно
    многострочным блоком.
    """
    global applied, skipped, failed
    text = path.read_text(encoding="utf-8")
    probe = marker if marker is not None else new
    if probe in text:
        print(f"  skip  {label}")
        skipped += 1
        return
    if text.count(old) != 1:
        print(f"  FAIL  {label}: якорь встречается {text.count(old)} раз")
        failed += 1
        return
    path.write_text(text.replace(old, new), encoding="utf-8")
    print(f"  apply {label}")
    applied += 1


# ── 16/A: parseSubsectionsFromHTML — фактический модуль ──────────────────
patch(
    P07,
    "  `server/services/context-extractor.ts` (1.4 — `parseSubsectionsFromHTML`),",
    "  `server/services/generation-service.ts` (1.4 — `parseSubsectionsFromHTML`;\n"
    "  до 2026-08-02 здесь ошибочно значился context-extractor.ts — функция\n"
    "  живёт в generation-service, сверено беседой 1.6),",
    "16/A 07 контекст 1.6: generation-service",
)

# ── 16/B: /:key/context — живой расчёт ───────────────────────────────────
patch(
    P07,
    "   - GET /syntheses/:id/sections/:key/context\n"
    "       → последняя запись context_log по разделу (03 §2.3).",
    "   - GET /syntheses/:id/sections/:key/context\n"
    "       → живой расчёт buildContextForSection (1.3): 03 §2.3 требует\n"
    "         contextText, которого context_log НЕ хранит; поля ответа =\n"
    "         CtxLogDraft билдера (формулировка «последняя запись\n"
    "         context_log» была неточной — правка 2026-08-02).",
    "16/B 07 /:key/context живой расчёт",
)

# ── 16/C: блок «По факту 1.6» ────────────────────────────────────────────
FACT_16 = """
**По факту 1.6 (2026-08-02, беседа закрыта):**
- Все 9 пунктов запроса 1 выполнены; тесты 2–9 — одним заходом
  (`tests/test-16-requests2-9.mjs`, 84 проверки ×3 прогона), харнесс
  единый: живой сервер + мок-SSE (mini-Hono для части A не понадобился —
  сервер всё равно нужен моку и WS).
- Режим «только подписка» (пункт 5) реализован флагом
  `viewOnly?: boolean` в `subscribe_generation` (03 §3.1); без флага —
  прежнее поведение 1.4.
- `subsections` в SectionSummary/SectionFull: expected-список для
  `parseSubsectionsFromHTML` выводится из самого HTML (уникальные
  `data-section` в порядке появления) — `buildSubsectionMap` тянет
  Registry+params, а TOC (1.6b) нужны ФАКТИЧЕСКИЕ якоря.
- `POST /:id/duplicate`: доступ — только владелец (как PATCH/DELETE);
  копируются разделы/категории (ремап id рёбер)/кластеры/тезисы/
  глоссарий/диалог и генеалогия РОДИТЕЛЕЙ; lineage-связь «копия →
  оригинал» не создаётся; логи generation_log/context_log не копируются
  (история, не контент); активная генерация → 409 GENERATION_IN_PROGRESS.
- `DELETE /:id` при активной генерации → 409 (решение беседы).
- Формулировка теста «создай два синтеза → total=2» адаптирована: в
  списке также прямые вставки (paused/generating) — проверялся
  фактический total.
- Shared дополнен: `SynthesisFull.pauseEstimates`,
  `SectionSummary.subsections`, `WsSubscribeGeneration.viewOnly`;
  audit.mts: `pauseEstimates` в typeOnly (вычисляемое поле).
- Грабли харнесса: SIGTERM npx-обёртке не убивает node-ребёнка tsx
  (сирота держит порт; лечение — `node --import tsx` + преflight
  занятости порта); HTTP-лимитер ключуется по IP, окно общее между
  прогонами (лечение — поднять RATE_LIMIT_HTTP_PER_MINUTE в env теста).
"""
patch(
    P07,
    "- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»\n\n---\n\n### Беседа 1.6b: Просмотр документа + каталог (клиент)",
    "- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»\n"
    + FACT_16 +
    "\n---\n\n### Беседа 1.6b: Просмотр документа + каталог (клиент)",
    "16/C 07 блок «По факту 1.6»",
    marker="**По факту 1.6 (2026-08-02",
)

# ── 16/D: §12 — серверная половина маркеров закрыта ──────────────────────
patch(
    P07,
    "| Маркеры `TODO(1.6)` — развести между 1.6 и 1.6b | 1.6 + 1.6b | разделение беседы | внесён 2026-07-30 |",
    "| Маркеры `TODO(1.6)` — развести между 1.6 и 1.6b | 1.6 + 1.6b | разделение беседы | серверные закрыты 1.6 (2026-08-02), клиентские переадресованы в TODO(1.6b) — закрывает 1.6b |",
    "16/D 07 §12 маркеры TODO(1.6)",
    # 16/K переписывает эту строку целиком — маркер обязан переживать
    # обе стадии (правило пятого предпатча: новый текст следующего патча
    # содержит маркер предыдущего; здесь маркер = заголовок строки 16/K)
    marker="Маркеры `TODO(1.6b)`",
)

# ── 16/E: шапка-ревизия 07 ───────────────────────────────────────────────
patch(
    P07,
    "# PhiloSynth Service — Протокол бесед\n",
    "# PhiloSynth Service — Протокол бесед\n"
    "\n"
    "> **Правки 2026-08-02 (итоги беседы 1.6)**: транспорт чтения закрыт;\n"
    "> parseSubsectionsFromHTML отнесён к generation-service; /:key/context —\n"
    "> живой buildContextForSection; блок «По факту 1.6» (viewOnly,\n"
    "> subsections из HTML, решения duplicate/DELETE); §12 — серверные\n"
    "> маркеры TODO(1.6) закрыты. В 03: viewOnly в §3.1, решения\n"
    "> duplicate/DELETE в §2.2, примечание per-IP в §3.4.\n",
    "16/E 07 шапка-ревизия 2026-08-02",
)

# ── 16/F: 03 §3.1 — viewOnly ─────────────────────────────────────────────
patch(
    P03,
    '{ type: "subscribe_generation", synthesisId: string }',
    '{ type: "subscribe_generation", synthesisId: string,\n'
    "  viewOnly?: boolean }\n"
    "// viewOnly (беседа 1.6): «только подписка» — страница просмотра (1.6b)\n"
    "// не запускает generateSynthesis при status='generating' без активного\n"
    "// прогона; события активного прогона доходят и так (доставка по userId).\n"
    "// Без флага — прежнее поведение (запуск после POST /syntheses).",
    "16/F 03 §3.1 viewOnly",
)

# ── 16/G: 03 §2.2 — решения duplicate ────────────────────────────────────
patch(
    P03,
    "POST   /syntheses/:id/duplicate → { id: string }\n"
    "                                // Реализация — беседа 1.6 (сервер).\n"
    "                                // До аудита 2026-07-30 эндпоинт не был\n"
    "                                // упомянут в протоколе 07 ни разу.",
    "POST   /syntheses/:id/duplicate → { id: string }\n"
    "                                // Реализация — беседа 1.6 (сервер).\n"
    "                                // До аудита 2026-07-30 эндпоинт не был\n"
    "                                // упомянут в протоколе 07 ни разу.\n"
    "                                // Решения 1.6: доступ — только владелец;\n"
    "                                // новый doc_num, title += « (копия)»,\n"
    "                                // is_public=false; копируются разделы,\n"
    "                                // элементы (ремап id рёбер) и генеалогия\n"
    "                                // РОДИТЕЛЕЙ; lineage-связи «копия →\n"
    "                                // оригинал» нет (копия, не потомок);\n"
    "                                // логи не копируются; активная\n"
    "                                // генерация → 409 GENERATION_IN_PROGRESS.",
    "16/G 03 §2.2 duplicate решения",
    marker="// Решения 1.6: доступ — только владелец;",
)

# ── 16/H: 03 §2.2 — DELETE при активной генерации ────────────────────────
patch(
    P03,
    "DELETE /syntheses/:id          → { ok: true }\n"
    "                                // Только владелец (иначе 403).",
    "DELETE /syntheses/:id          → { ok: true }\n"
    "                                // Только владелец (иначе 403).\n"
    "                                // Активная генерация → 409\n"
    "                                // GENERATION_IN_PROGRESS (беседа 1.6).",
    "16/H 03 §2.2 DELETE 409",
)

# ── 16/I: 03 §3.4 — per-IP примечание ────────────────────────────────────
patch(
    P03,
    "- Максимум 60 WebSocket-сообщений в минуту от клиента\n"
    "- При превышении: `{ type: \"error\", code: \"RATE_LIMIT\", retryAfter: number }`",
    "- Максимум 60 WebSocket-сообщений в минуту от клиента\n"
    "- При превышении: `{ type: \"error\", code: \"RATE_LIMIT\", retryAfter: number }`\n"
    "\n"
    "> Примечание (наблюдение беседы 1.6): HTTP-лимитер middleware (0.2)\n"
    "> фактически ключуется по IP и для аутентифицированных запросов —\n"
    "> requireAuth срабатывает в роутах ПОСЛЕ него, поэтому identity на\n"
    "> момент подсчёта всегда IP. «Per-user» HTTP-лимитирование потребует\n"
    "> переноса подсчёта после auth (кандидат в Фазу 6 вместе с\n"
    "> billing-check).",
    "16/I 03 §3.4 per-IP примечание",
    marker="фактически ключуется по IP и для аутентифицированных",
)

# ── 16/J: README — статус после 1.6 ──────────────────────────────────────
patch(
    README,
    "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.5b закрыты",
    "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.6 закрыты\n"
    "\n"
    "- **1.6 — транспорт чтения (сервер).** GET/PATCH/DELETE `/syntheses`\n"
    "  (+`/public`, `/:id/duplicate`), новый `routes/sections.ts` (включая\n"
    "  живой `/:key/context`), GET-часть `routes/elements.ts` (граф для 1.7),\n"
    "  `doc_num` [12110] и снимок `structure_sections` в POST, режим «только\n"
    "  подписка» (`viewOnly`) в WS; shared += pauseEstimates/subsections/\n"
    "  viewOnly; маркеры TODO(1.6) разведены (клиентские → TODO(1.6b)).\n"
    "  Тесты: `tests/test-16-requests2-9.mjs` (84 ✓ ×3), регрессия +=\n"
    "  2k/4o/5n.",
    "16/J README статус 1.6",
    marker="Фаза 1 — беседы 1.1–1.6 закрыты",
)

patch(
    README,
    "Следующая по графу 07 — беседа 1.6, **серверная**: транспорт чтения\n"
    "(GET/PATCH/DELETE `/syntheses`, `routes/sections.ts`, GET\n"
    "`/syntheses/:id/categories`, заполнение `doc_num`, режим «только\n"
    "подписка» для WS). За ней клиентские 1.6b (просмотр документа +\n"
    "каталог; закроет TODO(1.6) — pausedState из GET /syntheses/:id) и 1.7\n"
    "(граф). Параллельно серверной 1.6 можно вести 1.5 / 2.1 / 3.1.",
    "Следующие по графу 07 — клиентские беседы 1.6b (просмотр документа +\n"
    "каталог; закроет TODO(1.6b), включая pausedState из GET /syntheses/:id)\n"
    "и 1.7 (граф; транспорт GET `/categories` готов в 1.6). Параллельно\n"
    "можно вести 2.1 / 3.1.",
    "16/J2 README следующая беседа",
)

# ── 16/K: §12 — адресат строки маркеров сужен до 1.6b ────────────────────
patch(
    P07,
    "| Маркеры `TODO(1.6)` — развести между 1.6 и 1.6b | 1.6 + 1.6b | "
    "разделение беседы | серверные закрыты 1.6 (2026-08-02), клиентские "
    "переадресованы в TODO(1.6b) — закрывает 1.6b |",
    "| Маркеры `TODO(1.6b)` (источник pausedState из GET /:id, наполнение "
    "SynthesisPage/CatalogPage, исключение capsule при рендере) | 1.6b | "
    "разделение беседы (серверная половина закрыта 1.6, 2026-08-02) | "
    "внесён 2026-07-30 |",
    "16/K 07 §12 адресат маркеров → 1.6b",
)

# ── 16/L: §12 — новый долг беседы 1.6: score в GET /sections ─────────────
patch(
    P07,
    "| Форма ввода ключа в auth-модалке `PauseModal` | 6.2 | 1.4b (адресовался 6.1) | внесён 2026-07-31 |",
    "| Форма ввода ключа в auth-модалке `PauseModal` | 6.2 | 1.4b (адресовался 6.1) | внесён 2026-07-31 |\n"
    "| Подстановка `contextQualityScore` в GET /sections (сейчас null, метка TODO(2.4) в routes/sections.ts) | 2.4 | 1.6 | внесён 2026-08-02 |",
    "16/L 07 §12 долг: score в GET /sections",
    marker="| Подстановка `contextQualityScore` в GET /sections",
)

# ── 16/M: §12 — новый долг беседы 1.6: per-user лимитер ──────────────────
patch(
    P07,
    "| Подстановка `contextQualityScore` в GET /sections (сейчас null, метка TODO(2.4) в routes/sections.ts) | 2.4 | 1.6 | внесён 2026-08-02 |",
    "| Подстановка `contextQualityScore` в GET /sections (сейчас null, метка TODO(2.4) в routes/sections.ts) | 2.4 | 1.6 | внесён 2026-08-02 |\n"
    "| Per-user HTTP-лимитирование (подсчёт после auth; сейчас фактически per-IP — 03 §3.4) | 6.1 | 1.6 | внесён 2026-08-02 |",
    "16/M 07 §12 долг: per-user лимитер",
    marker="| Per-user HTTP-лимитирование",
)

# ── 16/N: 03 §3.4 — примечание адресует долг номером (правило §12) ──────
patch(
    P03,
    "> переноса подсчёта после auth (кандидат в Фазу 6 вместе с\n"
    "> billing-check).",
    "> переноса подсчёта после auth — долг внесён в реестр 07 §12,\n"
    "> адресат 6.1 (вместе с billing-service).",
    "16/N 03 §3.4 адресат 6.1",
)

# ── 16/O: README — состав routes/ в описании server/ ─────────────────────
patch(
    README,
    "server/            Hono-бэкенд: db/schema.ts (28 таблиц), middleware\n"
    "                   (auth, admin, rate-limiter), routes/auth.ts, ws/",
    "server/            Hono-бэкенд: db/schema.ts (28 таблиц), middleware\n"
    "                   (auth, admin, rate-limiter), routes/ (auth,\n"
    "                   syntheses, sections, elements), ws/",
    "16/O README состав routes/",
)

# ── 16/P: README — диапазон тестов в описании tests/ ─────────────────────
patch(
    README,
    "tests/             ВСЕ тесты бесед (0.3b–1.5b): vm-смоуки байтовой сверки",
    "tests/             ВСЕ тесты бесед (0.3b–1.6): vm-смоуки байтовой сверки",
    "16/P README диапазон tests/",
)

# ── 16/Q: README — покрытие check:integration ────────────────────────────
patch(
    README,
    "CONTEXT_BUDGET_PREVIEW локализован). Сейчас покрывает 0.1–0.6 и\n"
    "1.1–1.5b; живые секции требуют поднятых PG и Redis и засеянных\n"
    "prompt_templates, synthesis_configs и каталогов таксономии.",
    "CONTEXT_BUDGET_PREVIEW локализован); 1.6 — 2k/4o/5n: роуты чтения\n"
    "(makeDocNum [12110], /public ДО /:id, duplicate без lineage-связи и\n"
    "логов, viewOnly ДО запуска генерации, walker «TODO(1.6)=0», живой цикл\n"
    "список→Full→sections→categories→PATCH→duplicate→DELETE). Сейчас\n"
    "покрывает 0.1–0.6 и 1.1–1.6; живые секции требуют поднятых PG и Redis\n"
    "и засеянных prompt_templates, synthesis_configs и каталогов таксономии.",
    "16/Q README покрытие интеграции",
    marker="Сейчас\nпокрывает 0.1–0.6 и 1.1–1.6",
)

# ── 16/R: README — «Не сделано»: страницы теперь 1.6b/1.7, адресаты §12 ──
patch(
    README,
    "Не сделано (Фаза 1+): страницы синтеза/каталога/графа (1.6, 1.7),\n"
    "applyReplacement и точный confirm деградации skip (2.x), каскады и план",
    "Не сделано (Фаза 1+): страницы синтеза/каталога/графа (1.6b, 1.7 —\n"
    "серверный транспорт готов в 1.6), applyReplacement (3.2) и точный\n"
    "confirm деградации skip (2.2), каскады и план",
    "16/R README «Не сделано»",
)

print(f"\nИтого: applied={applied}, skip={skipped}, fail={failed}")
sys.exit(1 if failed else 0)
