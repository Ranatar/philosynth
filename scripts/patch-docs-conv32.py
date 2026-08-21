#!/usr/bin/env python3
"""Правки документации по итогам беседы 3.2 (Concept Participants +
Genealogy Tree, клиент).

Идемпотентный apply/skip-скрипт (образец conv31):
 - patch(): замена old → new; повторный прогон видит marker → skip;
 - optional=True — переходник промежуточных состояний.

Запуск из корня репо: python3 scripts/patch-docs-conv32.py
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
P5 = "docs/05-file-structure.md"
NC = "NEXT-CONTEXT.md"

# ── 1. 07: ревизионная заметка беседы 3.2 в шапку ─────────────────────
patch("07-revision-note-32", P7,
    "# PhiloSynth Service — Протокол бесед\n\n>",
    "# PhiloSynth Service — Протокол бесед\n\n"
    "> **Правки 2026-08-21 (итоги беседы 3.2)**: клиентская половина\n"
    "> мета-синтеза и дерево генеалогии закрыты (браузерный тест\n"
    "> tests/test-32-requests2-5.mjs 52 ✓ ×2). Найденные текстом 3.2\n"
    "> рассогласования: (а) п.1 «пересечения по GET /lineage/ancestors»\n"
    "> неприменим к ФАЙЛОВЫМ концепциям пула (их нет в БД) — реализовано\n"
    "> двумя путями (каталожные — через API, файловые — по\n"
    "> participant.genealogy из reconstructGenealogy); (б) «снятие\n"
    "> блокировки сабмита» не оговаривало остаток: файловые концепции\n"
    "> по-прежнему блокируются до серверного импорта 4.3 — снято только\n"
    "> для КАТАЛОЖНЫХ ({type:'synthesis', synthesisId}); (в) механизм\n"
    "> добавления каталожных концепций в пул в 07 не описан, хотя тест №1\n"
    "> его требует — добавлен пикер «+ Из каталога» в ConceptPool;\n"
    "> (г) SynthesisPreview не нёс признака мета-синтеза для бейджа п.5 —\n"
    "> закрыто аддитивным полем hasConceptParents (прецедент — warnings\n"
    "> POST из 3.1); (д) checkGenealogyOverlaps в исходнике ОПРЕДЕЛЕНА,\n"
    "> но НЕ ВЫЗВАНА (мёртвый код) — предупреждение реализовано\n"
    "> предполётным confirm на клиенте, серверные warnings из POST\n"
    "> рисуются неблокирующе; (е) попутная починка предсуществующего\n"
    "> дефекта 1.6b, найденного браузерным тестом: CreateSynthesisPage\n"
    "> звал navigate() внутри апдейтера setSynthesisId (рендер-фаза\n"
    "> React) — id перенесён в ref; (ж) в scripts/smoke-31.ts и\n"
    "> scripts/test-31-requests2-4.ts остались 5 ошибок typecheck:scripts\n"
    "> (3.1 гоняла их через tsx) — предсуществующие, за 3.1.\n\n>")

# ── 2. 07: «По факту 3.2» в текст первого запроса ─────────────────────
patch("07-32-fact-note", P7,
    "   Добавить здесь:\n"
    "   - Предупреждения о генеалогических пересечениях (пересечение предков\n"
    "     выбранных ☑-концепций — по GET /syntheses/:id/lineage/ancestors)\n"
    "   - Снятие блокировки сабмита, если 3.1 уже принимает участников-концепции",
    "   Добавить здесь:\n"
    "   - Предупреждения о генеалогических пересечениях (пересечение предков\n"
    "     выбранных ☑-концепций — по GET /syntheses/:id/lineage/ancestors)\n"
    "     > **По факту 3.2:** формула «по GET ancestors» верна только для\n"
    "     > концепций ИЗ КАТАЛОГА; файловые записи пула в БД отсутствуют —\n"
    "     > их предки берутся из participant.genealogy\n"
    "     > (reconstructGenealogy + restoreCapsulesFromHTML). Тексты —\n"
    "     > checkGenealogyOverlaps 1:1 (дрейф-контроль клиент↔сервер —\n"
    "     > integration-check 4w). В исходнике функция ОПРЕДЕЛЕНА, но не\n"
    "     > ВЫЗВАНА (мёртвый код) — реализован предполётный confirm;\n"
    "     > серверные warnings POST рисуются неблокирующе (синтез создан).\n"
    "   - Снятие блокировки сабмита, если 3.1 уже принимает участников-концепции\n"
    "     > **По факту 3.2:** снято только для КАТАЛОЖНЫХ концепций\n"
    "     > (представимы в ParticipantInput {type:'synthesis', synthesisId});\n"
    "     > пул дополнен пикером «+ Из каталога» (свои ready + публичные,\n"
    "     > дедупликация; фабрика catalogPreviewToPoolEntry, ключ\n"
    "     > дедупликации filename=\"catalog:<id>\"). ФАЙЛОВЫЕ концепции\n"
    "     > блокируются до серверного импорта (4.3) с точечным текстом\n"
    "     > ошибки. Бейдж п.5 питается аддитивным SynthesisPreview.\n"
    "     > hasConceptParents (loadConceptParentFlags — оба списка каталога\n"
    "     > и /lineage/search).")

# ── 3. 07 §12: четыре долга закрыты ───────────────────────────────────
patch("07-s12-recon", P7,
    "| `reconstructGenealogy` | 3.2 | 1.5b | в тексте 3.2 |",
    "| `reconstructGenealogy` | 3.2 | 1.5b | ЗАКРЫТ 3.2 (2026-08-21): "
    "клиентский порт в `client/utils/genealogy.ts`; importConceptAsParticipant "
    "заполняет participant.genealogy |")
patch("07-s12-capsules", P7,
    "| `restoreCapsulesFromHTML` | 3.2 | 1.5b | адрес восстановлен 2026-07-31 |",
    "| `restoreCapsulesFromHTML` | 3.2 | 1.5b | ЗАКРЫТ 3.2 (2026-08-21): "
    "порт в `client/utils/genealogy.ts` (капсулы родителей — из .gen-card "
    "сохранённого дерева файла) |")
patch("07-s12-replace", P7,
    "| `applyReplacement` / `updateCompatAdvisor` / `toggleCompatPanel` | 3.2 | "
    "1.1 (адресовался 1.5, затем «2.x») | внесён 2026-07-31 |",
    "| `applyReplacement` / `updateCompatAdvisor` / `toggleCompatPanel` | 3.2 | "
    "1.1 (адресовался 1.5, затем «2.x») | ЗАКРЫТ 3.2 (2026-08-21): кнопки "
    "замен + orderAdvice + автораскрытие при конфликте в CompatAdvisor.tsx; "
    "onApplyReplacement меняет method/synthLevel/generationOrder формы — "
    "пересчёт советов/предупреждений/оценки через deps эффектов |")
patch("07-s12-estdiff", P7,
    "| Отрисовка `estimate-diff` в `FullBudgetPreview` | 3.2 | 1.5b | внесён 2026-07-31 |",
    "| Отрисовка `estimate-diff` в `FullBudgetPreview` | 3.2 | 1.5b | ЗАКРЫТ "
    "3.2 (2026-08-21): /estimate дважды (с участниками и без, дебаунс 600 мс), "
    "строка «Оценка с родителями: … · без: … · разница: …» |")
patch("07-s12-gate", P7,
    "серверная половина ЗАКРЫТА 3.1 (2026-08-20): POST принимает "
    "type='synthesis' с валидацией и генеалогией; клиентская (гейт "
    "SynthesisForm) — за 3.2 |",
    "серверная половина ЗАКРЫТА 3.1 (2026-08-20): POST принимает "
    "type='synthesis' с валидацией и генеалогией; клиентская ЗАКРЫТА 3.2 "
    "(2026-08-21): гейт СУЖЕН до файловых концепций (остаток — серверный "
    "импорт файлов, 4.3) |")

# ── 4. 03 §2.2: аддитивное поле hasConceptParents в превью ────────────
patch("03-preview-flag", P3,
    "// method|status (иное молча → createdAt), order ∈ asc|desc (default\n"
    "// desc), limit 1..100 (default 20), page ≥ 1; search — подстрока title\n"
    "// без учёта регистра (ILIKE %…%, gin_trgm); philosopher — ТОЧНОЕ имя в\n"
    "// генеалогии (как §2.8); невалидные status/method → 400",
    "// method|status (иное молча → createdAt), order ∈ asc|desc (default\n"
    "// desc), limit 1..100 (default 20), page ≥ 1; search — подстрока title\n"
    "// без учёта регистра (ILIKE %…%, gin_trgm); philosopher — ТОЧНОЕ имя в\n"
    "// генеалогии (как §2.8); невалидные status/method → 400\n"
    "// SynthesisPreview += hasConceptParents: boolean (беседа 3.2,\n"
    "// аддитивно): есть родители-концепции (parent_type='synthesis') —\n"
    "// бейдж «мета-синтез» в карточке каталога; несут оба списка и\n"
    "// /lineage/search (loadConceptParentFlags батчем).")

# ── 5. 03 §2.8: клиентские потребители ────────────────────────────────
patch("03-lineage-clients", P3,
    "GET    /lineage/search          ?philosopher=Кант&philosopher=Хайдеггер\n"
    "                                → { syntheses: SynthesisPreview[] }\n"
    "                                // Концепции, в генеалогии которых есть ВСЕ указанные философы\n"
    "```",
    "GET    /lineage/search          ?philosopher=Кант&philosopher=Хайдеггер\n"
    "                                → { syntheses: SynthesisPreview[] }\n"
    "                                // Концепции, в генеалогии которых есть ВСЕ указанные философы\n"
    "```\n"
    "\n"
    "Клиентские потребители (беседа 3.2): `client/api/lineage.ts`\n"
    "(getAncestors/getDescendants/searchByPhilosophers); дерево на\n"
    "SynthesisPage (секция «Генеалогическое древо», только для\n"
    "мета-синтезов — паритет updateGenealogyInHeader); фильтр каталога\n"
    "`?descendantsOf=<id>` — потомки отдельным запросом, каталог отображает\n"
    "ПЕРЕСЕЧЕНИЕ (аудит 2026-07-30); LineageSearch — блок «Поиск по\n"
    "генеалогии» в каталоге. Предполётная проверка пересечений формы:\n"
    "каталожные участники — через getAncestors, файловые — по\n"
    "participant.genealogy (клиентский checkGenealogyOverlaps, тексты ≡\n"
    "серверным).")

# ── 6. 04: Advisor v2 — долг applyReplacement закрыт ──────────────────
patch("04-advisor-closed", P4,
    "`applyReplacement()` и `updateCompatAdvisor()` — НЕ портированы, долг "
    "беседы 3.2 (§12 протокола 07): кнопки замен и перерисовка советника, "
    "replacements уже в entry |",
    "`applyReplacement()` [7365] / `updateCompatAdvisor()` [7499] / "
    "`toggleCompatPanel()` — ПОРТИРОВАНЫ 3.2 в "
    "`client/components/synthesis/CompatAdvisor.tsx`: кнопки замен "
    "(«СОХРАНИТЬ УРОВЕНЬ → ЗАМЕНИТЬ МЕТОД» / наоборот), блок orderAdvice, "
    "автораскрытие при conflict; onApplyReplacement — React-аналог цепочки "
    "перерисовки (пересчёт через deps эффектов формы) |")

# ── 7. 04: клиентская копия функций генеалогии ────────────────────────
patch("04-genealogy-client", P4,
    "| `checkGenealogyOverlaps()`, `collectPhilosopherAncestors()`, "
    "`isAncestor()` | `server/services/meta-synthesis-service.ts` (3.1; "
    "АДАПТАЦИЯ: предки — рекурсивный CTE по `synthesis_lineage`, в исходнике "
    "— обход объекта genealogy; тексты предупреждений 1:1) |",
    "| `checkGenealogyOverlaps()`, `collectPhilosopherAncestors()`, "
    "`isAncestor()` | `server/services/meta-synthesis-service.ts` (3.1; "
    "АДАПТАЦИЯ: предки — рекурсивный CTE по `synthesis_lineage`, в исходнике "
    "— обход объекта genealogy; тексты предупреждений 1:1) + КЛИЕНТСКАЯ "
    "копия первых двух — `client/utils/genealogy.ts` (3.2; обход объекта "
    "как в исходнике — для файловых концепций пула; тождественность текстов "
    "клиент↔сервер сторожит integration-check 4w) |")

# ── 8. 04: importConceptAsParticipant — genealogy заполняется ─────────
patch("04-icap-genealogy", P4,
    "клиентский порт файлового сценария 1:1 — `client/utils/concept-file.ts` "
    "(1.5b, genealogy=null до 3.1/3.2) |",
    "клиентский порт файлового сценария 1:1 — `client/utils/concept-file.ts` "
    "(1.5b; с 3.2 participant.genealogy ЗАПОЛНЯЕТСЯ — reconstructGenealogy + "
    "restoreCapsulesFromHTML из `client/utils/genealogy.ts`) |")

# ── 9. 04: санация имён — клиентский порт появился ────────────────────
patch("04-names-client", P4,
    "| `normalizeGenealogyNames()`, `isPlaceholderConceptName()`, "
    "`resolveConceptName()` | Санация имён генеалогии («[безымянная "
    "концепция]») — без изменений | `server/services/import-service.ts` |",
    "| `normalizeGenealogyNames()`, `isPlaceholderConceptName()`, "
    "`resolveConceptName()` | Санация имён генеалогии («[безымянная "
    "концепция]») — без изменений | `client/utils/genealogy.ts` (3.2; "
    "resolveConceptName несёт FIX `\\w`→`[а-яё]` — латентный баг регекспа "
    "префиксов исходника, та же грабля, что чинилась 1.4 в "
    "updateDocTitleFromName) + `server/services/import-service.ts` "
    "(серверная копия — беседа 4.3) |")

# ── 10. 04: reconstructGenealogy/restoreCapsules — строка в §2.6 ──────
patch("04-recon-row", P4,
    "| `normalizeGenealogyNames()`, `isPlaceholderConceptName()`, "
    "`resolveConceptName()` | Санация имён генеалогии",
    "| `reconstructGenealogy()` [22181], `restoreCapsulesFromHTML()` [11745] "
    "| Реконструкция генеалогии участника из meta/embeddedState + "
    "восстановление капсул родителей из `.gen-card` сохранённого дерева "
    "файла | `client/utils/genealogy.ts` (3.2; долги §12 закрыты) |\n"
    "| `stripCapsulesFromGenealogy()` [22321] | Очистка капсул перед "
    "сохранением | `client/utils/genealogy.ts` (3.2; потребитель — экспорт "
    "4.2) |\n"
    "| `normalizeGenealogyNames()`, `isPlaceholderConceptName()`, "
    "`resolveConceptName()` | Санация имён генеалогии",
    marker="| `reconstructGenealogy()` [22181], `restoreCapsulesFromHTML()` [11745] ")

# ── 11. 04: renderGenealogyTree — фактический адрес ───────────────────
patch("04-gentree-addr", P4,
    "| `renderGenealogyTree()` | `client/components/GenealogyTree.tsx` |",
    "| `renderGenealogyTree()` | `client/components/lineage/GenealogyTree.tsx` "
    "(3.2; визуальный референс → React; АДАПТАЦИИ: узлы из GET "
    "/lineage/ancestors не несут method/seed/capsule — мета-строка "
    "опускается, узлы с synthesisId — ссылки на /synthesis/:id; CSS `.gen-*` "
    "в globals.css дословно, включая @media ≤500px и .gen-tree-light) |")

# ── 12. 05: utils/genealogy.ts в клиентском дереве ────────────────────
patch("05-utils-genealogy", P5,
    "│   │       ├── concept-file.ts             # Парсинг концепт-файлов "
    "пула (1.5b, клиентские порты)",
    "│   │       ├── concept-file.ts             # Парсинг концепт-файлов "
    "пула (1.5b, клиентские порты;\n"
    "│   │       │                               # 3.2: += "
    "catalogPreviewToPoolEntry, genealogy заполняется)\n"
    "│   │       ├── genealogy.ts                # Порты генеалогии (3.2): "
    "reconstructGenealogy,\n"
    "│   │       │                               # restoreCapsulesFromHTML, "
    "checkGenealogyOverlaps,\n"
    "│   │       │                               # resolveConceptName (FIX "
    "[а-яё]), lineageNodeToGenealogy")


RM = "README.md"

# ── 13. README: диапазон тестов ───────────────────────────────────────
patch("rm-tests-range", RM,
    "tests/             ВСЕ тесты бесед (0.3b–2.3): vm-смоуки байтовой сверки",
    "tests/             ВСЕ тесты бесед (0.3b–3.2): vm-смоуки байтовой сверки")

# ── 14. README: охват integration-check ───────────────────────────────
patch("rm-icheck-4n", RM,
    "4n: модули пула (pool-store без snapshotCurrentState, concept-file,\n"
    "PoolCard/ConceptPool, SYNTH_READY_SECTIONS) и контракты (гейт\n"
    "мета-синтеза до 3.1/4.3, prepareForGeneration перед POST,\n"
    "CONTEXT_BUDGET_PREVIEW локализован);",
    "4n: модули пула (pool-store без snapshotCurrentState, concept-file,\n"
    "PoolCard/ConceptPool, SYNTH_READY_SECTIONS) и контракты (гейт\n"
    "мета-синтеза СУЖЕН 3.2 до файловых концепций — остаток до 4.3,\n"
    "prepareForGeneration перед POST, CONTEXT_BUDGET_PREVIEW локализован,\n"
    "genealogy заполняется с 3.2);")
patch("rm-icheck-scope", RM,
    "3.1 — 2p/4v/5r: мета-синтез\n"
    "(модули, провайдер вместо стаба, квирк Full-блока, живые CTE\n"
    "генеалогии и Selective-блок). Сейчас покрывает 0.1–0.6, 1.1–1.7,\n"
    "2.1–2.4 и 3.1 целиком;",
    "3.1 — 2p/4v/5r: мета-синтез\n"
    "(модули, провайдер вместо стаба, квирк Full-блока, живые CTE\n"
    "генеалогии и Selective-блок); 3.2 — 4w: клиент генеалогии\n"
    "(utils/genealogy + api/lineage + GenealogyTree/LineageSearch,\n"
    "дрейф-контроль текстов пересечений клиент↔сервер, каталожные\n"
    "концепции в пуле и participants в POST/estimate, estimate-diff\n"
    "двумя вызовами, кнопки замен CompatAdvisor, анти-регресс\n"
    "setState-in-render, транспорт hasConceptParents, CSS дерева с\n"
    "мобильной медиа; живьём — браузерный tests/test-32-requests2-5.mjs\n"
    "52 ✓ ×2). Сейчас покрывает 0.1–0.6, 1.1–1.7,\n"
    "2.1–2.4 и 3.1–3.2 целиком;")

# ── 15. README: статус ────────────────────────────────────────────────
patch("rm-status", RM,
    "## Статус: Фазы 0–2 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3); "
    "Фаза 3 — беседа 3.1 закрыта",
    "## Статус: Фазы 0–3 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3; "
    "Фаза 3: 3.1, 3.2)")

# ── 16. README: запись беседы 3.2 ─────────────────────────────────────
patch("rm-conv32", RM,
    "  28 ✓ + scripts/test-31-requests2-4.ts 16 ✓ ×2 (живой конвейер\n"
    "  промпта: обе капсулы в baseCtx). Доки пропатчены\n"
    "  scripts/patch-docs-conv31.py.\n",
    "  28 ✓ + scripts/test-31-requests2-4.ts 16 ✓ ×2 (живой конвейер\n"
    "  промпта: обе капсулы в baseCtx). Доки пропатчены\n"
    "  scripts/patch-docs-conv31.py.\n"
    "\n"
    "- **3.2 — Concept Participants + Genealogy Tree (клиент).**\n"
    "  utils/genealogy.ts (порты 1:1: reconstructGenealogy [22181] и\n"
    "  restoreCapsulesFromHTML [11745] — долги §12 закрыты;\n"
    "  checkGenealogyOverlaps ≡ серверным дословно, resolveConceptName с\n"
    "  FIX [а-яё], lineageNodeToGenealogy), api/lineage.ts,\n"
    "  components/lineage/ (GenealogyTree — React-порт renderGenealogyTree,\n"
    "  узлы с synthesisId кликабельны; LineageSearch — чипы + datalist).\n"
    "  Пул: пикер «+ Из каталога» (catalogPreviewToPoolEntry, дедуп\n"
    "  catalog:<id>), «↗ Открыть» у каталожных. Форма: гейт СУЖЕН до\n"
    "  файловых (каталожные → {type:'synthesis'} в POST и /estimate),\n"
    "  предполётный confirm пересечений, estimate-diff (долг §12 закрыт),\n"
    "  CompatAdvisor: кнопки замен + orderAdvice (долг applyReplacement\n"
    "  закрыт). SynthesisPage: секция «Генеалогическое древо»\n"
    "  (afterHeader, только мета-синтезы) + «Потомки в каталоге»;\n"
    "  CatalogPage: ?descendantsOf= пересечением + LineageSearch; бейдж\n"
    "  «◈ мета-синтез» (аддитивный SynthesisPreview.hasConceptParents).\n"
    "  Попутно починен дефект 1.6b (navigate в апдейтере setState —\n"
    "  нашёл браузерный тест). Тесты: tests/test-32-requests2-5.mjs\n"
    "  52 ✓ ×2 (полный поток: каталог → пул → confirm → генерация →\n"
    "  дерево; мета² 3 уровня; транзитивный поиск; мобильная вёрстка).\n"
    "  Доки пропатчены scripts/patch-docs-conv32.py.\n")

# ── 17. README: «Не сделано» ──────────────────────────────────────────
patch("rm-notdone", RM,
    "Не сделано (Фаза 2+): applyReplacement (3.2), клиентская половина\n"
    "мета-синтеза (3.2: снятие гейта ☑-концепций в SynthesisForm и\n"
    "отрисовка estimate-diff; сервер готов с 3.1), полный пул с деревом\n"
    "(3.2), режимы\n"
    "(4.1 — карточки результатов в EditModal и каскад режимов подраздельной\n"
    "панели ждут routes/modes), экспорт/импорт (4.x — серверный\n"
    "parseConceptFile), billing, BYO-Key (6.1 — ввод ключа в auth-модалке).\n"
    "Фаза 1 закрыта целиком (1.1–1.7); Фаза 2 закрыта целиком: 2.1, 2.2,\n"
    "2.4 (велась перед 2.3 — §11) и 2.3. Следующая по графу 07 — 3.1\n"
    "(мета-синтез).",
    "Не сделано (Фаза 4+): файловые концепции как участники мета-синтеза\n"
    "(4.3 — серверный импорт; гейт SynthesisForm снимать по факту), режимы\n"
    "(4.1 — карточки результатов в EditModal и каскад режимов подраздельной\n"
    "панели ждут routes/modes), экспорт/импорт (4.x — серверный\n"
    "parseConceptFile; потребители stripCapsulesFromGenealogy/\n"
    "normalizeGenealogyNames — экспорт 4.2), billing, BYO-Key (6.1 — ввод\n"
    "ключа в auth-модалке).\n"
    "Фаза 1 закрыта целиком (1.1–1.7); Фаза 2 закрыта целиком: 2.1, 2.2,\n"
    "2.4 (велась перед 2.3 — §11) и 2.3; Фаза 3 закрыта целиком: 3.1, 3.2.\n"
    "Следующая по графу 07 — 4.1\n"
    "(Mode Service).")

if failed:
    print("ПРОВАЛЫ:\n - " + "\n - ".join(failed))
    raise SystemExit(1)
print(f"применено: {len(applied)}; пропущено (уже есть): {len(skipped)}")
for a in applied:
    print("  +", a)
