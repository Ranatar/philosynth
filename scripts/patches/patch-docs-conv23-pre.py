#!/usr/bin/env python3
"""Предпатч доков ПЕРЕД беседами 2.3, 2.4 и 3.2 (+ исправление патча 1).

Идемпотентный: каждая правка сперва проверяет наличие нового текста
(applied ранее -> skip), затем наличие якоря (нет -> FAIL). str.replace,
НЕ re.sub. Запуск из корня репо:
    python3 scripts/patch-docs-conv23-pre.py

ПОРЯДОК: этот скрипт применяется СТРОГО ПОСЛЕ
scripts/patch-docs-conv16-pre.py — часть правок опирается на текст,
внесённый им (беседа 1.6b, блок решений 1.6). Проверка порядка
встроена: без маркера первого патча скрипт останавливается.

Продолжение аудита, начатого перед 1.6. Первый предпатч закрыл дефект
«UI-беседа без транспорта» в 1.6/1.7. Здесь — три оставшихся класса,
найденных в 2.3/2.4/3.2:
  (I)   инверсии зависимостей: 2.3 ← 2.4, 2.4 ← 4.2;
  (II)  бесхозные эндпоинты и незаполняемые поля;
  (III) устаревание заданий после уже проведённых бесед (3.2 против 1.5b).

Что закрывается (перепроверено по первоисточникам):

  ИСПРАВЛЕНИЕ ПАТЧА 1
  0. Первый предпатч внёс в тесты беседы 1.6b литеральные обратные
     слэши: `вкладка \\"Мои\\"` вместо `вкладка "Мои"` (в исходном 07
     последовательность \\" не встречается ни разу). Причина: в
     Python-строке было написано \\\\" вместо \\". Косметика, но текст
     запросов копируется в беседу как есть. Три строки.

  БЕСЕДА 2.3 (Edit Modal + Cascade Panel)
  1. Инверсия 2.3 ← 2.4: EditSectionCard рисует бейдж качества
     контекста, а context-quality.ts создаётся беседой 2.4 — позже.
     Признано в тексте 2.4 и в §11, но до 2.3 не доведено.
  2. GET /syntheses/:id/sections/:key/context (03 §2.3) остался без
     владельца: ни 2.3, ни 2.4 его не создают. Первый предпатч
     утверждал «остаётся беседам 2.3/2.4» — это было допущением, а не
     проверенным фактом. Роут отдаётся беседе 1.6 вместе с остальным
     routes/sections.ts.
  3. structure_sections: колонка есть в схеме и в 02, но во всём
     server/ в неё нет ни одной записи. Карточка «Структура документа
     устарела» всегда попадала бы в ветку null. Снимок назначен
     серверной беседе 1.6 (при создании) и 2.2 (после исполнения плана).
  4. Зависимость от 1.6b (synthesis-store, SectionView, страница
     синтеза) не указана ни в контексте, ни в §11.

  БЕСЕДА 2.4 (лог контекста и генерации)
  5. Кросс-фазовая инверсия 2.4 → 4.2: formatPromptsForExport обязан
     использовать reconstructSkeleton() как fallback, а
     server/services/prompt-reconstruction.ts создаётся беседой 4.2.
  6. Сбитая нумерация первого запроса: два пункта под номером «3».
  7. «Live-обновление лога по WebSocket» без транспорта: в
     shared/types/ws-messages.ts нет ни одного сообщения про лог.
  8. Зависимость от DocumentFooter (1.6b) не указана.

  БЕСЕДА 3.2 (пул концепций + генеалогия)
  9. Пункт 1 устарел: client/components/pool/{ConceptPool,PoolCard}.tsx
     созданы беседой 1.5b и лежат в репозитории.
 10. Прямое противоречие с фактом 1.5b: 3.2 требует
     snapshotCurrentState/restoreFromPoolSnapshot, которые в 1.5b
     намеренно не портированы (снимки вырождаются — см. шапку
     pool-store.ts). Патч 15b поправил формулировки только в секции 1.5b.
 11. Фильтр «Потомки концепции X» не имеет параметра в 03 §2.2.
 12. reconstructGenealogy / restoreCapsulesFromHTML отложены в 1.5b с
     пометкой TODO(3.1/3.2), но в 3.2 не упомянуты.
 13. Зависимости от 1.6b (SynthesisPage, CatalogPage, SynthesisCard) и
     от 1.5b (pool-store, concept-file) не указаны.
"""
from pathlib import Path

applied, skipped, failed = [], [], []

PROTOCOL = "docs/07-conversation-protocol.md"
GUARD = "### Беседа 1.6b: Просмотр документа + каталог (клиент)"


def patch(path: str, old: str, new: str, tag: str, marker: str | None = None) -> None:
    """Точечная замена. probe (по умолчанию — новый текст) даёт идемпотентность.

    Если новый текст неуникален в файле, probe срабатывает ложно и правка
    молча уходит в skip — в таких местах якорь берётся многострочным
    блоком либо marker задаётся явно (грабля первого предпатча).
    """
    p = Path(path)
    if not p.exists():
        failed.append(f"{tag}: файл не найден — {path}"); return
    s = p.read_text(encoding="utf-8")
    probe = marker if marker is not None else new
    if probe in s:
        skipped.append(tag); return
    if old not in s:
        failed.append(f"{tag}: якорь не найден в {path}"); return
    p.write_text(s.replace(old, new, 1), encoding="utf-8")
    applied.append(tag)


def check_order() -> bool:
    p = Path(PROTOCOL)
    if not p.exists():
        failed.append(f"порядок: не найден {PROTOCOL}")
        return False
    if GUARD not in p.read_text(encoding="utf-8"):
        failed.append(
            "порядок: сперва нужно применить scripts/patch-docs-conv16-pre.py "
            "(в 07 нет беседы 1.6b) — этот скрипт правит его результат"
        )
        return False
    return True


# Проверка порядка ДО первой правки: правки ниже опираются на текст,
# внесённый scripts/patch-docs-conv16-pre.py.
if not check_order():
    print("APPLIED: 0")
    print("SKIPPED: 0")
    print("FAILED:", len(failed))
    for _t in failed:
        print("  !", _t)
    raise SystemExit(1)


# ══════════════════════════════════════════════════════════════════
# 0. Исправление косметики, внесённой первым предпатчем
# ══════════════════════════════════════════════════════════════════
def fix_backslashes() -> None:
    tag = "23pre/0 убрать литеральные \\\" из тестов беседы 1.6b"
    p = Path(PROTOCOL)
    s = p.read_text(encoding="utf-8")
    pairs = [
        ('вкладка \\"Мои\\"', 'вкладка "Мои"'),
        ('во вкладке \\"Публичные\\"', 'во вкладке "Публичные"'),
        ('в формате \\"$X.XXXX\\"', 'в формате "$X.XXXX"'),
        ('со status=\\"generating\\"', 'со status="generating"'),
    ]
    todo = [(o, n) for o, n in pairs if o in s]
    if not todo:
        skipped.append(tag); return
    for o, n in todo:
        s = s.replace(o, n)
    p.write_text(s, encoding="utf-8")
    applied.append(tag)


# ══════════════════════════════════════════════════════════════════
# A. Беседа 1.6 (сервер): забрать /:key/context и снимок структуры
# ══════════════════════════════════════════════════════════════════
patch(
    PROTOCOL,
    "   (GET /:key/context — отладочный, остаётся беседам 2.3/2.4)",
    "   - GET /syntheses/:id/sections/:key/context\n"
    "       → последняя запись context_log по разделу (03 §2.3).\n"
    "     Нужен полю контекста в EditSectionCard (2.3). В первой\n"
    "     редакции предпатча было сказано «остаётся беседам 2.3/2.4» —\n"
    "     это оказалось допущением: ни 2.3, ни 2.4 его не создают.",
    "23pre/A1 07 §1.6 — /:key/context отдан беседе 1.6",
    marker="это оказалось допущением: ни 2.3, ни 2.4 его не создают",
)

patch(
    PROTOCOL,
    "6. Монтирование новых роутов в server/index.ts.",
    "6. Снимок структуры документа: заполнять syntheses.structure_sections\n"
    "   при создании записи (копия sectionOrder). Колонка есть в схеме и\n"
    "   в 02, но во всём server/ в неё нет НИ ОДНОЙ записи — без этого\n"
    "   карточка «Структура документа устарела» (беседа 2.3) всегда\n"
    "   попадает в ветку «актуальность не определена». Обновление снимка\n"
    "   после исполнения плана — беседа 2.2.\n"
    "\n"
    "7. Монтирование новых роутов в server/index.ts.",
    "23pre/A2 07 §1.6 — заполнение structure_sections",
    marker="Снимок структуры документа: заполнять syntheses.structure_sections",
)

# ══════════════════════════════════════════════════════════════════
# B. Беседа 2.3
# ══════════════════════════════════════════════════════════════════
patch(
    PROTOCOL,
    """**Контекст:**
- `03-specification.md` (секции 1.5 Редактирование, 2.6 Edit Plans, 3.2 WebSocket)
- `05-file-structure.md` (секция client/components/edit/)
- Из предыдущих бесед: `shared/types/edit-plan.ts`, `shared/types/ws-messages.ts`, `client/hooks/useWebSocket.ts`, `client/stores/synthesis-store.ts`, `client/api/client.ts`
- Исходник: openEditModal … подразделовая перегенерация UI (**только** как визуальный референс UI)
""",
    """**Контекст:**
- `03-specification.md` (секции 1.5 Редактирование, 2.3 Sections, 2.6 Edit Plans, 3.2 WebSocket)
- `05-file-structure.md` (секция client/components/edit/)
- Из предыдущих бесед: `shared/types/edit-plan.ts`, `shared/types/ws-messages.ts`, `client/hooks/useWebSocket.ts`, `client/stores/synthesis-store.ts` (из 1.6b), `client/api/client.ts`, `server/routes/plans.ts` (2.1 + 2.2), `server/routes/sections.ts` (1.6 — GET /sections и /:key/context)
- Из 1.6b: `SynthesisPage.tsx`, `SectionView.tsx` — модалка открывается поверх страницы синтеза
- Исходник: openEditModal … подразделовая перегенерация UI (**только** как визуальный референс UI)

> **Транспорт готов** (аудит 2026-07-30): `server/routes/plans.ts`
> создаёт беседа 2.1 и расширяет 2.2; `POST /syntheses/:id/regenerate-subsection`
> и WS-сообщения `regen_subsection` описаны в 03 §2.3/§3.2 и реализуются
> беседой 2.2. В отличие от 1.6/1.7, здесь клиентская беседа стоит
> после своего сервера — ничего дописывать не нужно.
""",
    "23pre/B1 07 §2.3 контекст и отметка о готовности транспорта",
    marker="**Транспорт готов** (аудит 2026-07-30)",
)

patch(
    PROTOCOL,
    """3. client/components/edit/EditSectionCard.tsx:
   - Карточка одного раздела
   - Чекбоксы перегенерации/удаления (взаимоисключающие)
   - Поле контекста (скрыто, разворачивается)
   - Индикатор: "✓ изменён" если раздел был отредактирован
""",
    """3. client/components/edit/EditSectionCard.tsx:
   - Карточка одного раздела
   - Чекбоксы перегенерации/удаления (взаимоисключающие)
   - Поле контекста (скрыто, разворачивается; GET /sections/:key/context)
   - Индикатор: "✓ изменён" если раздел был отредактирован
   - Бейдж качества контекста (contextQualityScore, ≥90 зелёный):
     ВНИМАНИЕ — до беседы 2.4 (context-quality.ts) роут отдаёт null.
     Компонент обязан корректно рисовать состояние «нет оценки»
     (бейдж скрыт либо нейтрально-серый), а не считать null нулём.
     Цветовую шкалу вводит 2.4; здесь — только место под неё.
""",
    "23pre/B2 07 §2.3 бейдж качества до беседы 2.4",
    marker="до беседы 2.4 (context-quality.ts) роут отдаёт null",
)

patch(
    PROTOCOL,
    """   Карточка «Структура документа устарела»:
   - В EditModal, над списком разделов
   - Сравнение DOC_STATE.structureSections с DOC_STATE.sectionOrder
   - Если null (старый файл) → «актуальность не определена, рекомендуется обновить»
""",
    """   Карточка «Структура документа устарела»:
   - В EditModal, над списком разделов
   - Сравнение syntheses.structureSections с sectionOrder
     (в исходнике — DOC_STATE.structureSections против DOC_STATE.sectionOrder)
   - Если null (старый файл) → «актуальность не определена, рекомендуется обновить»
   - Снимок структуры заполняет беседа 1.6 (при создании синтеза) и
     обновляет 2.2 (после исполнения плана). До аудита 2026-07-30
     колонка не заполнялась НИКЕМ, и карточка всегда попадала бы в
     ветку null — если 1.6 снимок не сделала, оставить только эту ветку
     и завести TODO, не изобретая клиентский суррогат снимка.
""",
    "23pre/B3 07 §2.3 карточка структуры — владелец снимка",
    marker="До аудита 2026-07-30\n     колонка не заполнялась НИКЕМ",
)

# ══════════════════════════════════════════════════════════════════
# C. Беседа 2.4
# ══════════════════════════════════════════════════════════════════
patch(
    PROTOCOL,
    """**Контекст:**
- `02-data-model.md` (таблицы generation_log, context_log)
- `04-code-reuse-map.md` (секция 2.7 — mode-service, log-formatter)
- Из предыдущих бесед: `server/db/schema.ts`, `shared/types/generation.ts`, `client/api/client.ts`
- Исходник: formatCtxLog + colorizeLog (вся система логов)
""",
    """**Контекст:**
- `02-data-model.md` (таблицы generation_log, context_log)
- `04-code-reuse-map.md` (секция 2.7 — mode-service, log-formatter)
- `03-specification.md` (секции 2.3 Sections, 2.5 Logs)
- Из предыдущих бесед: `server/db/schema.ts`, `shared/types/generation.ts`, `client/api/client.ts`, `client/components/document/DocumentFooter.tsx` (из 1.6b — в него добавляется кнопка лога), `server/routes/sections.ts` (1.6)
- Исходник: formatCtxLog + colorizeLog (вся система логов)

> **Порядок (аудит 2026-07-30):** беседу 2.4 стоит вести ПЕРЕД 2.3.
> `context-quality.ts` создаётся здесь, а бейдж качества контекста
> нужен уже в `EditSectionCard` (2.3) — см. §11. Если порядок
> сохраняется прежним, 2.3 рисует состояние «нет оценки» по `null`.
""",
    "23pre/C1 07 §2.4 контекст и рекомендация вести 2.4 перед 2.3",
    marker="беседу 2.4 стоит вести ПЕРЕД 2.3",
)

patch(
    PROTOCOL,
    """     v10: `formatPromptsForExport` использует `reconstructSkeleton()` как fallback
     для записей без `_promptSkeleton` (импортированные файлы).""",
    """     v10: `formatPromptsForExport` использует `reconstructSkeleton()` как fallback
     для записей без `_promptSkeleton` (импортированные файлы).
     ВНИМАНИЕ (аудит 2026-07-30): `server/services/prompt-reconstruction.ts`
     с `reconstructSkeleton()` создаётся беседой 4.2 — на полторы фазы
     позже. Здесь fallback НЕ реализуется: записи без `_promptSkeleton`
     помечаются «промпт недоступен (импортированная запись)», ставится
     TODO(4.2), а подключение реконструкции делает сама 4.2.""",
    "23pre/C2 07 §2.4 reconstructSkeleton — TODO(4.2), инверсия снята",
    marker="Здесь fallback НЕ реализуется",
)

patch(
    PROTOCOL,
    "3. client/components/logs/colorize-log.ts:",
    "4. client/components/logs/colorize-log.ts:",
    "23pre/C3 07 §2.4 нумерация: второй «3» → 4",
)

patch(
    PROTOCOL,
    "4. client/components/logs/ContextLogViewer.tsx:",
    "5. client/components/logs/ContextLogViewer.tsx:",
    "23pre/C4 07 §2.4 нумерация: 4 → 5",
)

patch(
    PROTOCOL,
    '5. Интеграция: добавить кнопку "◈ Лог" в DocumentFooter.tsx',
    '6. Интеграция: добавить кнопку "◈ Лог" в DocumentFooter.tsx (из 1.6b)',
    "23pre/C5 07 §2.4 нумерация: 5 → 6",
)

patch(
    PROTOCOL,
    "   - Live-обновление при открытом окне во время генерации (WebSocket)",
    "   - Live-обновление при открытом окне во время генерации:\n"
    "     перезапрос GET /logs/formatted по УЖЕ СУЩЕСТВУЮЩИМ событиям\n"
    "     завершения раздела (см. §3.2). Отдельных WS-сообщений про лог\n"
    "     в shared/types/ws-messages.ts нет и заводить их не нужно —\n"
    "     иначе клиент разойдётся с сервером (аудит 2026-07-30)",
    "23pre/C6 07 §2.4 механизм live-обновления лога",
    marker="Отдельных WS-сообщений про лог",
)

# ══════════════════════════════════════════════════════════════════
# D. Беседа 3.2
# ══════════════════════════════════════════════════════════════════
patch(
    PROTOCOL,
    """**Контекст:**
- `03-specification.md` (секции 1.6 Мета-синтез, 2.8 Lineage)
- `05-file-structure.md` (synthesis/, lineage/)
- Из предыдущих бесед: `shared/types/lineage.ts`, `client/api/client.ts`, `client/stores/synthesis-store.ts`, `client/components/synthesis/SynthesisForm.tsx` (из 1.5)
- Исходник: renderGenealogyTree() (renderGenealogyTree — **визуальный** референс)
""",
    """**Контекст:**
- `03-specification.md` (секции 1.6 Мета-синтез, 2.2 Syntheses, 2.8 Lineage)
- `05-file-structure.md` (synthesis/, lineage/)
- Из предыдущих бесед: `shared/types/lineage.ts`, `client/api/client.ts`, `client/stores/synthesis-store.ts` (из 1.6b), `client/components/synthesis/SynthesisForm.tsx` (из 1.5)
- **Из 1.5b (ЗАКРЫТА):** `client/components/pool/ConceptPool.tsx`, `PoolCard.tsx`, `client/stores/pool-store.ts`, `client/utils/concept-file.ts` — пул уже существует
- Из 1.6b: `SynthesisPage.tsx`, `CatalogPage.tsx`, `SynthesisCard.tsx` — точки интеграции пунктов 4–5
- Из 3.1: `server/routes/lineage.ts` (ancestors / descendants / search) — транспорт готов
- Исходник: renderGenealogyTree() (renderGenealogyTree — **визуальный** референс)
""",
    "23pre/D1 07 §3.2 контекст (пул из 1.5b, страницы из 1.6b, роуты из 3.1)",
    marker="**Из 1.5b (ЗАКРЫТА):**",
)

patch(
    PROTOCOL,
    """> **v10**: `ConceptParticipants.tsx` как отдельный компонент заменён **Unified Concept Pool**.
> Пул (`client/components/pool/ConceptPool.tsx`) объединяет загрузку, просмотр (◉) и выбор
> для мета-синтеза (☑). API пула: `addToPool`, `renamePoolConcept`, `removeFromPool`,
> `toggleSynthParticipant`, `selectForViewing`, `snapshotCurrentState`.
> Перед генерацией вызывается `refreshAllSynthParticipants()`.""",
    """> **v10**: `ConceptParticipants.tsx` как отдельный компонент заменён **Unified Concept Pool**.
> Пул (`client/components/pool/ConceptPool.tsx`) объединяет загрузку, просмотр (◉) и выбор
> для мета-синтеза (☑). API пула: `addToPool`, `renamePoolConcept`, `removeFromPool`,
> `toggleSynthParticipant`, `selectForViewing`.
> Перед генерацией вызывается `refreshAllSynthParticipants()`.
>
> **По факту 1.5b (беседа ЗАКРЫТА):** пул уже реализован — `ConceptPool.tsx`,
> `PoolCard.tsx`, `pool-store.ts`, `concept-file.ts` лежат в репозитории.
> `snapshotCurrentState` намеренно НЕ портирован: локальных правок концепции
> в сервисе нет, снимок вырождается (см. шапку `pool-store.ts` и главу 1.5b
> в NEXT-CONTEXT). Требовать его здесь нельзя — это противоречие внутри 07,
> снятое аудитом 2026-07-30.""",
    "23pre/D2 07 §3.2 врезка v10 — убрать snapshotCurrentState",
    marker="**По факту 1.5b (беседа ЗАКРЫТА):** пул уже реализован",
)

patch(
    PROTOCOL,
    """1. client/components/pool/ConceptPool.tsx (v10, заменяет ConceptParticipants.tsx):
   - Пул загруженных концепций в SynthesisForm
   - Кнопки «+ Загрузить из файла» и «+ Загрузить по URL»
   - Карточка концепции: чекбокс ☑ (мета-синтез), радио ◉ (просмотр),
     имя, метод×уровень, источники контекста, кнопки ✎/✕
   - Проверка пригодности при включении в синтез (toggleSynthParticipant)
   - Снимок/восстановление при переключении просмотра (snapshotCurrentState/restoreFromPoolSnapshot)
   - Предупреждения о генеалогических пересечениях
""",
    """1. ДОПОЛНЕНИЕ существующего пула (создан беседой 1.5b — заново НЕ создавать):
   уже есть: загрузка из файла и по URL, карточка с ☑/◉/✎/✕, проверка
   пригодности (toggleSynthParticipant), просмотр (selectForViewing),
   refreshAllSynthParticipants перед генерацией, блокировка сабмита
   с ☑-концепциями до появления серверной поддержки мета-синтеза.
   Добавить здесь:
   - Предупреждения о генеалогических пересечениях (пересечение предков
     выбранных ☑-концепций — по GET /syntheses/:id/lineage/ancestors)
   - Снятие блокировки сабмита, если 3.1 уже принимает участников-концепции
   - Порт `reconstructGenealogy` (отложен в 1.5b с пометкой TODO(3.1/3.2)) —
     без него дерево для импортированной концепции не строится;
     `restoreCapsulesFromHTML` остаётся отложенным до 4.3
""",
    "23pre/D3 07 §3.2 пункт 1 — дополнение вместо повторного создания",
    marker="ДОПОЛНЕНИЕ существующего пула (создан беседой 1.5b",
)

patch(
    PROTOCOL,
    '   - Фильтр "Потомки концепции X"',
    '   - Фильтр "Потомки концепции X" — через GET /syntheses/:id/lineage/descendants\n'
    '     (в 03 §2.2 у GET /syntheses такого параметра нет и добавлять его\n'
    '      не нужно: список потомков приходит отдельным запросом, каталог\n'
    '      лишь отображает пересечение — аудит 2026-07-30)',
    "23pre/D4 07 §3.2 фильтр потомков — через lineage/descendants",
    marker="через GET /syntheses/:id/lineage/descendants",
)

# ══════════════════════════════════════════════════════════════════
# E. §11: зависимости и порядок
# ══════════════════════════════════════════════════════════════════
patch(
    PROTOCOL,
    "1.6 (роуты чтения: syntheses, sections, categories) ← 1.4 (данные, WS) + 1.4b (pausedState/pauseEstimates)\n",
    "1.6 (роуты чтения: syntheses, sections, categories) ← 1.4 (данные, WS) + 1.4b (pausedState/pauseEstimates)\n"
    "2.3 (EditModal поверх страницы синтеза) ← 2.1 + 2.2 (планы) + 1.6b (SynthesisPage, SectionView, synthesis-store) + 1.6 (/sections/:key/context)\n"
    "2.4 (ContextLogViewer, кнопка в футере) ← 1.6b (DocumentFooter); fallback промптов — только после 4.2 (prompt-reconstruction)\n"
    "3.2 (пул + генеалогия) ← 1.5b (пул уже создан) + 3.1 (routes/lineage.ts) + 1.6b (SynthesisPage, CatalogPage, SynthesisCard)\n",
    "23pre/E1 07 §11 связи 2.3 / 2.4 / 3.2",
    marker="2.3 (EditModal поверх страницы синтеза) ←",
)

patch(
    PROTOCOL,
    "0.1 → 0.3 → 1.1 → 1.2 → 1.4 → 2.2 → 2.3",
    "0.1 → 0.3 → 1.1 → 1.2 → 1.4 → 2.2 → 2.4 → 2.3\n"
    "  (2.4 перед 2.3: context-quality.ts нужен бейджу в EditSectionCard —\n"
    "   иначе 2.3 работает по null; аудит 2026-07-30)",
    "23pre/E2 07 §11 критический путь — 2.4 перед 2.3",
    marker="2.4 перед 2.3: context-quality.ts нужен бейджу",
)

# ══════════════════════════════════════════════════════════════════
# F. 05: владельцы
# ══════════════════════════════════════════════════════════════════
patch(
    "docs/05-file-structure.md",
    "│   │   └── logs.ts                     # GET /logs/generation, /context, /formatted",
    "│   │   └── logs.ts                     # GET /logs/generation, /context, /formatted\n"
    "│   │                                   # (создаёт беседа 2.4; /logs/prompts —\n"
    "│   │                                   #  без skeleton-fallback до 4.2)",
    "23pre/F1 05 владелец routes/logs.ts",
    marker="создаёт беседа 2.4",
)

# ══════════════════════════════════════════════════════════════════
# G. 03: пометки о владельцах
# ══════════════════════════════════════════════════════════════════
patch(
    "docs/03-specification.md",
    "GET    /syntheses/:id/sections/:key/context",
    "GET    /syntheses/:id/sections/:key/context\n"
    "                                // Реализация — беседа 1.6 (сервер),\n"
    "                                // вместе с остальным routes/sections.ts.\n"
    "                                // Потребитель — поле контекста в\n"
    "                                // EditSectionCard (беседа 2.3).",
    "23pre/G1 03 §2.3 владелец /:key/context",
    marker="вместе с остальным routes/sections.ts",
)

# ══════════════════════════════════════════════════════════════════
# H. NEXT-CONTEXT: глава
# ══════════════════════════════════════════════════════════════════
CHAPTER = """

---

# Предподготовка бесед 2.3 / 2.4 / 3.2 — аудит [ЗАКРЫТА]

Продолжение аудита, начатого перед 1.6 (см. главу «Предподготовка бесед
1.6 / 1.6b / 1.7»). Предпатч: `scripts/patch-docs-conv23-pre.py`,
идемпотентный, применяется СТРОГО ПОСЛЕ `patch-docs-conv16-pre.py`
(проверка порядка встроена).

## Гипотеза подтвердилась частично

Сплошного дефекта «UI-беседа без транспорта», как в 1.6/1.7, здесь НЕТ:
Фазы 2 и 3 спроектированы «бэкенд → клиент» и порядок держат.
`routes/plans.ts` создаёт 2.1 и расширяет 2.2; `routes/lineage.ts` —
3.1. Остались три других класса дефектов.

### I. Инверсии зависимостей

- **2.3 ← 2.4**: бейдж качества контекста в `EditSectionCard` требует
  `context-quality.ts`, который создаётся беседой 2.4. Признано в самих
  доках, но порядок не менялся. Решение: рекомендация вести 2.4 перед
  2.3 (§11, критический путь), а при сохранении прежнего порядка — 2.3
  корректно рисует состояние «нет оценки» по `null`.
- **2.4 → 4.2**: `formatPromptsForExport` обязан использовать
  `reconstructSkeleton()` как fallback, а `prompt-reconstruction.ts`
  создаётся беседой 4.2 — на полторы фазы позже. Решение: fallback в
  2.4 НЕ делается, записи без `_promptSkeleton` помечаются, TODO(4.2).

### II. Бесхозные эндпоинты и незаполняемые поля

- `GET /syntheses/:id/sections/:key/context` (03 §2.3) не создавала ни
  одна беседа. Первый предпатч утверждал «остаётся беседам 2.3/2.4» —
  **это было допущением, а не проверенным фактом**. Отдан беседе 1.6.
- `syntheses.structure_sections`: колонка есть в схеме и в 02, но во
  всём `server/` в неё нет ни одной записи. Карточка «Структура
  документа устарела» (2.3) всегда попадала бы в ветку null. Снимок
  назначен беседе 1.6 (при создании) и 2.2 (после исполнения плана).
- Live-обновление лога «по WebSocket» не имело транспорта: в
  `shared/types/ws-messages.ts` нет ни одного сообщения про лог.
  Решение: перезапрос `/logs/formatted` по существующим событиям
  завершения раздела, новых типов сообщений не вводить.

### III. Устаревание заданий после проведённых бесед

- 3.2 просила СОЗДАТЬ `ConceptPool.tsx`, который уже создан беседой
  1.5b и лежит в репозитории вместе с `PoolCard.tsx`, `pool-store.ts`,
  `concept-file.ts`. Пункт 1 переписан как ДОПОЛНЕНИЕ существующего
  пула (генеалогические пересечения, снятие блокировки сабмита, порт
  `reconstructGenealogy`).
- 3.2 требовала `snapshotCurrentState`/`restoreFromPoolSnapshot`,
  которые в 1.5b намеренно не портированы (снимки вырождаются).
  Патч `patch-docs-conv15b.py` поправил формулировки только в секции
  1.5b, из-за чего 07 противоречил сам себе. Снято.

**Это будет повторяться:** каждая закрытая беседа делает соседние
секции 07 чуть менее верными. Перед началом ЛЮБОЙ беседы имеет смысл
сверять её первый запрос с фактическим состоянием репозитория, а не
только с документами.

## Мелочи, попутно исправленные

- Сбитая нумерация первого запроса 2.4: два пункта под номером «3»
  (перенумерованы 3→4→5→6).
- Первый предпатч внёс в тесты беседы 1.6b литеральные обратные слэши
  (`вкладка \\"Мои\\"` вместо `вкладка "Мои"`) — в исходном 07 такой
  последовательности не было ни разу. Причина: `\\\\"` вместо `\\"` в
  Python-строке. Исправлено; проверка `grep -c '\\\\"' docs/07-*.md`
  должна давать 0.

## Что предпатч НЕ делает

- Не меняет фактический порядок бесед — только фиксирует рекомендацию
  и зависимости; решение за ведущим.
- Не трогает код: заполнение `structure_sections`, роут
  `/:key/context`, `context-quality.ts` — задачи соответствующих бесед.
- Не проверял беседы Фаз 4–6 (4.1, 4.3, 5.x, 6.x) — там тот же
  контроль стоит провести отдельно.
"""


def append_chapter() -> None:
    tag = "23pre/H NEXT-CONTEXT глава предподготовки 2.3/2.4/3.2"
    p = Path("NEXT-CONTEXT.md")
    if not p.exists():
        failed.append(f"{tag}: файл не найден"); return
    s = p.read_text(encoding="utf-8")
    if "# Предподготовка бесед 2.3 / 2.4 / 3.2 — аудит [ЗАКРЫТА]" in s:
        skipped.append(tag); return
    p.write_text(s.rstrip("\n") + CHAPTER + "\n", encoding="utf-8")
    applied.append(tag)


fix_backslashes()
append_chapter()

print("APPLIED:", len(applied))
for t in applied: print("  +", t)
print("SKIPPED:", len(skipped))
for t in skipped: print("  =", t)
print("FAILED:", len(failed))
for t in failed: print("  !", t)
raise SystemExit(1 if failed else 0)
