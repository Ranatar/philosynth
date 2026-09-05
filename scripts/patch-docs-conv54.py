#!/usr/bin/env python3
"""Патч документации по итогам беседы 5.4 (Характеристики + Обогащение +
Таксономия UI, клиент).

Закрывает дыры, найденные при исполнении беседы (2026-09-04/05):
  A  07 — запись ревизии в шапке.
  B  07 — глава «По факту 5.4» после текста беседы (EdgeEditor как новый вид
     ElementEditor; «?» под слайдером, не popover; запуск только HTTP;
     собственное WS-соединение хозяина; PATCH по отпусканию в NodePanel без
     панели impact; readOnly-блок владельца при генерации; typeCatalogId у
     сгенерированных элементов null; тип из каталога в написании документа;
     CATEGORY_TYPES снята; 4ac переписана; ретраи и мок).
  C  07 5.4 — тестовые запросы: «popover» → блок под слайдером, «4 слайдера»
     → 8; контекст для 5.5 += useEnrichmentStream/EdgeEditor.
  D  07 §12 — CATEGORY_TYPES ЗАКРЫТ 5.4; WS-запуск обоснования ЗАКРЫТ 5.4
     («только HTTP»); админские update/delete типов → переадресован 6.2 с
     причиной; новые долги: серверная нормализация typeCatalogId при парсинге
     (T3 числится сделанным, но конвейер её не делает) → 5.5; создание связи
     из UI (эндпоинта POST /edges в §2.4 нет) → 6.2.
  E  03 — §3.1 start_enrichment: решение «только HTTP» зафиксировано; §2.4
     п.11: TaxonomySelector сделан, факт о typeCatalogId=null после парсинга;
     §1.1 T3 — пометка «на деле НЕ сделано» с адресом 5.5.
  F  05 — client/hooks/useEnrichmentStream.ts, edit/EdgeEditor.tsx, пометки
     «СДЕЛАНО 5.4» у api/taxonomy, api/enrichment и трёх компонентов.
  G  04 §4 — ФАКТ-пометки CharacteristicSlider / EnrichmentPanel /
     TaxonomySelector + строка EdgeEditor/useEnrichmentStream/api-модулей.
  H  README — статус: 5.4 закрыта.
  I  5-6-ui-kit.md — блоки 1/2/8 перенесены в часть 3 globals.css (5.4).
  J  01 §4.6/§4.8 — факт: нормализация типов при парсинге в конвейере
     генерации отсутствует.

Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patch-docs-conv54.py
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
applied = skipped = failed = 0


def patch(rel: str, old: str, new: str, label: str) -> None:
    global applied, skipped, failed
    path = ROOT / rel
    if not path.exists():
        failed += 1
        print(f"  fail  {label}: нет файла {rel}")
        return
    text = path.read_text(encoding="utf-8")
    if new in text:
        skipped += 1
        print(f"  skip  {label}")
        return
    if old not in text:
        failed += 1
        print(f"  fail  {label}: не найден исходный фрагмент")
        return
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


P01 = "docs/01-architecture.md"
P03 = "docs/03-specification.md"
P04 = "docs/04-code-reuse-map.md"
P05 = "docs/05-file-structure.md"
P07 = "docs/07-conversation-protocol.md"
KIT = "docs/fragments-for-conversations/5-6-ui-kit.md"

# ═══ A. 07 — шапка ═══
patch(P07,
    "> **Правки 2026-09-04 (итоги беседы 5.3)**",
    """> **Правки 2026-09-05 (итоги беседы 5.4)**: UI характеристик, обогащения
> и таксономии закрыт (запрос 1 + смоук tests/smoke-54-request1.mjs 36 ✓ +
> все тестовые запросы tests/test-54-requests2-6.mjs 79 ✓ ×2 (браузер +
> живой сервер + мок Claude SSE); check:integration += 2u/4ae с
> дрейф-контролем «типы обогащения панели ↔ сервис 5.3», «шаг слайдеров ↔
> characteristics», «пути api/* ↔ роуты»). Дыры, закрытые этим патчем
> (глава «По факту 5.4»): п.5 первого запроса предполагал редактор связи, а
> `EditableElement` 5.2 знал только category/thesis/glossary_term — создан
> `EdgeEditor` (kind='edge') с входом из `EdgePanel`; `typeCatalogId` у
> сгенерированных элементов всегда null — T3 «сделано 0.3b» конвейер не
> исполняет (долг → 5.5); «?» → popover заменён блоком под слайдером по
> правилу кита; запуск обоснования — только HTTP (решение долга §12,
> §3.1 зафиксирован); долг `CATEGORY_TYPES` закрыт, секция 4ac переписана.
> Грабли стенда: капитель `.gm-btn` ломает регистрозависимые ожидания
> `innerText`; пользовательские типы каталога переживают прогоны и дают
> fuzzy-match вместо «Создать»; прокси vite зашит на :3000.
>
> **Правки 2026-09-04 (итоги беседы 5.3)**""",
    "A. 07 шапка")

# ═══ B. 07 — «По факту 5.4» ═══
patch(P07,
    """---

### Беседа 5.5: Representation Transformer — graph↔theses (бэкенд + клиент)""",
    """**По факту 5.4 (2026-09-05) — отступления от буквы первого запроса:**

1. **Редактора связей на клиенте не было.** П. 5 («интеграция с
   ElementEditor для связей») предполагал его, но `EditableElement` 5.2
   знал только `category | thesis | glossary_term`. Создан
   `client/components/edit/EdgeEditor.tsx` (описание, тип связи через
   `TaxonomySelector`, направление, шесть слайдеров) как новый вид
   `kind: "edge"` в `ElementEditor` (PATCH `/edges/:edgeId`, `HOST_SECTION.edge
   = graph`); вход — `EdgePanel.onEdit` («✎ Редактировать», как у NodePanel
   5.2), связь ищется по новому `GEdge.dbId` (запасной путь — концы + тип).
   Концы связи не редактируются: эндпоинта создания связи в §2.4 нет (долг
   §12 → 6.2).
2. **«?» раскрывает обоснование ПОД слайдером** (`.char-justification`
   кита), а не «в popover/tooltip»: правило `5-6-ui-kit.md` (в документе
   всплывашке негде разместиться). Первое раскрытие показывает последнее
   сохранённое обоснование (GET `/justifications`), при его отсутствии у
   владельца запускается запрос с ТЕКУЩИМ значением ползунка (в форме —
   несохранённым: вопрос относится к рассматриваемой оценке, сервер
   проверяет диапазон); readOnly показывает только сохранённое.
3. **Запуск обогащений и обоснований — только HTTP** (POST → `{ ok: true }`),
   WS-сообщение `start_enrichment` клиент не использует: оно не покрывает
   обоснование характеристики, а REST даёт синхронные коды (409/403/404/400)
   вместо `stream_error`. Долг §12 «WS-запуск обоснования» закрыт этим
   решением, §3.1 03 зафиксирован. Доставка — `enrichment_delta` →
   `enrichment_done` (+ `stream_error` c `sectionKey "enrich:…"`) по
   СОБСТВЕННОМУ WS-соединению хозяина (`hooks/useEnrichmentStream`, паритет
   ModeModal 4.1; по одному соединению на GraphModal и на ElementEditor);
   `useStreamingGeneration` получил guard `enrich:` рядом с `mode:`.
4. **Два режима записи слайдера**: `onChange` — черновик формы
   (CategoryEditor/EdgeEditor, PATCH шлёт «Сохранить»), `onCommit` — по
   отпусканию ползунка (NodePanel: немедленный PATCH одного поля со строкой
   статуса «Сохранено · перерисовано: …», без панели «Анализ влияния» —
   числовые характеристики дают severity none/low; полный разбор влияния —
   через «✎ Редактировать»). Значения в NodePanel берутся из строки
   `categories` (по `GNode.dbId`), а не из узла G; хозяин перечитывает граф.
5. **`CategoryEditor`**: `RangeField` двух полей → `CharacteristicSliderGroup`
   всех восьми характеристик (`CATEGORY_CHARACTERISTICS`); select с
   клиентской копией `CATEGORY_TYPES` → `TaxonomySelector` — долг §12 закрыт,
   секция 4ac integration-check переписана (сторожит НЕвозврат константы).
   Расширенные по методу типы (`_EXTRA_CATEGORY_TYPES`) в каталоге 0.3b
   отсутствуют — остаются свободным текстом с подсказкой «≈».
6. **`typeCatalogId` у сгенерированных элементов всегда null**: graph-parser
   1.4 делает только lower-case текста, нормализации на каталог (01 §4.8,
   T3 «сделано 0.3b») в конвейере генерации/трансформации нет. Селектор
   при открытии с непустым свободным типом зовёт `POST /normalize` и
   предлагает привязку «≈ каталог: …»; индикатор остаётся «свободный текст»
   до сохранения. Серверная нормализация — долг §12 → 5.5.
7. **Тип из каталога пишется в написании документа**: `type = name_ru` со
   строчной первой буквой («онтологическая»), как хранит парсер 1.4 типы
   из таблиц Claude; `typeCatalogId = id` строки. Ввод руками сбрасывает
   `typeCatalogId` в null. Новый тип: ключ латиницей предлагается
   `transliterate(name_ru)` под `KEY_RE` сервера; для связей — направление
   по умолчанию из `RELATIONSHIP_DIRECTIONS`.
8. **readOnly-блок владельца при генерации**: `GraphModal` рендерит блок
   правки NodePanel и при `editDisabled` (слайдеры `.readonly`/disabled,
   «?» — только сохранённое, кнопок запуска обогащения нет); иначе edge
   case «readOnly-синтез — disabled» был мёртвым путём (`editable = isOwner
   && !live`). `SynthesisPage` сужает `editDisabled` до `isOwner && live`
   (для чужого прежнее значение ни на что не влияло).
9. **Оформление**: блоки 1/2/8 кита перенесены в часть 3 `globals.css`
   дословно (`@keyframes enrich-caret` — вне `@layer`); дополнения — части
   обоснования, строка комбобокса с индикатором, форма нового типа, шапка
   панели обогащения, переопределения для ТЁМНОЙ `.gm-info-panel`
   (примитивы кита писаны под светлый `.input-form`).

---

### Беседа 5.5: Representation Transformer — graph↔theses (бэкенд + клиент)""",
    "B. 07 «По факту 5.4»")

# ═══ C. 07 5.4 — тестовые запросы и контекст ═══
patch(P07,
    "- «Протестируй CharacteristicSlider: изменить centrality через слайдер → PATCH API вызван → значение обновлено. Нажать «?» → justification отображается в popover»",
    "- «Протестируй CharacteristicSlider: изменить centrality через слайдер → PATCH API вызван → значение обновлено. Нажать «?» → justification отображается в блоке под слайдером (по факту 5.4: не popover — правило UI-кита)»",
    "C1. 07 5.4 тест R2")
patch(P07,
    "- «Протестируй интеграцию с NodePanel: открыть граф → кликнуть узел → панель содержит 4 слайдера + кнопку \"Обогатить\" + TaxonomySelector для типа»",
    "- «Протестируй интеграцию с NodePanel: открыть граф → кликнуть узел → панель содержит 8 слайдеров (v10: все характеристики категории; «4» — старый счёт) + кнопку \"Обогатить\" + TaxonomySelector для типа»",
    "C2. 07 5.4 тест R5")
patch(P07,
    """- «Edge case: innovation_degree — дискретный слайдер (1–5), не непрерывный. CharacteristicSlider для readOnly синтеза — disabled»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 5.4""",
    """- «Edge case: innovation_degree — дискретный слайдер (1–5), не непрерывный. CharacteristicSlider для readOnly синтеза — disabled (по факту 5.4: readOnly = владелец при status='generating'; чужой не видит блока вовсе)»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

Файлы 5.4 для следующих бесед (факт): `client/src/hooks/useEnrichmentStream.ts`
(образец «HTTP создаёт операцию, свой WS-канал доставки» — для TransformPanel
5.5), `client/src/components/edit/EdgeEditor.tsx` + `CharacteristicSlider.tsx`
(готовые слайдеры/селектор для полей трансформированных элементов 5.5),
`client/src/components/edit/TaxonomySelector.tsx` (административные
update/delete типов — 6.2), `client/src/api/taxonomy.ts` / `api/enrichment.ts`.

**По факту 5.4""",
    "C3. 07 5.4 edge case + файлы для следующих бесед")

# ═══ D. 07 §12 ═══
patch(P07,
    "| Админские update/delete пользовательских типов каталога (`POST` есть с 0.3b, изменение и удаление не специфицированы — 03 §2.13) | 5.4 | 0.3b | внесён 2026-09-02 (аудит фаз 5–6, п.19) |",
    "| Админские update/delete пользовательских типов каталога (`POST` есть с 0.3b, изменение и удаление не специфицированы — 03 §2.13) | 6.2 | 0.3b | внесён 2026-09-02 (аудит фаз 5–6, п.19); 5.4 НЕ сделала (2026-09-05): эндпоинтов и спецификации нет, а UI-адресат — админка 6.2 (AdminPromptsPage/каталоги); в TaxonomySelector — только создание |",
    "D1. 07 §12 админские типы → 6.2")
patch(P07,
    "| Запуск обоснования характеристики по WS: `start_enrichment` (03 §3.1) не несёт characteristic/value — пока только HTTP `POST /justify-characteristic`; либо расширить сообщение в 5.4, либо зафиксировать «только HTTP» в §3.1 | 5.4 | 5.3 | внесён 2026-09-04 |",
    "| Запуск обоснования характеристики по WS: `start_enrichment` (03 §3.1) не несёт characteristic/value — пока только HTTP `POST /justify-characteristic`; либо расширить сообщение в 5.4, либо зафиксировать «только HTTP» в §3.1 | 5.4 | 5.3 | ЗАКРЫТ 5.4 (2026-09-05) решением «только HTTP»: клиент запускает обогащения и обоснования REST-роутами (синхронные коды ошибок), WS — только доставка; `start_enrichment` остаётся в §3.1 как необязательный путь, §3.1 зафиксирован |",
    "D2. 07 §12 WS-запуск обоснования ЗАКРЫТ")
patch(P07,
    "| `CATEGORY_TYPES` в CategoryEditor — клиентская копия 14 типов промпта графа (select типа категории); заменить TaxonomySelector по каталогу 0.3b (18 = 14 + расширенные) с индикатором «из каталога / свободный текст»; расширенные по методу — `EXTRA_CATEGORY_TYPES` | 5.4 | 5.2 | внесён 2026-09-04 (секция 4ac сторожит ⊆ section-templates) |",
    """| `CATEGORY_TYPES` в CategoryEditor — клиентская копия 14 типов промпта графа (select типа категории); заменить TaxonomySelector по каталогу 0.3b (18 = 14 + расширенные) с индикатором «из каталога / свободный текст»; расширенные по методу — `EXTRA_CATEGORY_TYPES` | 5.4 | 5.2 | ЗАКРЫТ 5.4 (2026-09-05): константа удалена, TaxonomySelector в CategoryEditor и NodePanel; 4ac сторожит невозврат константы, 4ae — селектор |
| Серверная нормализация типов на каталог при парсинге (T3 03 §1.1 числится «сделано 0.3b», но graph-parser 1.4 пишет только lower-case текста — `typeCatalogId` у всех сгенерированных категорий/связей null; клиент 5.4 предлагает привязку «≈» вручную) — вызывать `normalizeType` в `saveGraphToDb` (и в трансформациях) | 5.5 | 5.4 (дыра 1.4/0.3b) | внесён 2026-09-05 |
| Создание связи из UI (EdgeEditor правит существующие; эндпоинта `POST /syntheses/:id/edges` в §2.4 нет — концы связи менять нельзя, только удалить и создать) | 6.2 | 5.4 | внесён 2026-09-05 |""",
    "D3. 07 §12 CATEGORY_TYPES ЗАКРЫТ + два новых долга")

# ═══ E. 03 ═══
patch(P03,
    """// По факту 5.3: обоснование характеристики (нужны characteristic+value)
// сообщение не покрывает — только POST /justify-characteristic (§12 → 5.4).""",
    """// По факту 5.3: обоснование характеристики (нужны characteristic+value)
// сообщение не покрывает — только POST /justify-characteristic.
// Решение 5.4 (2026-09-05, долг §12 закрыт): клиент запускает ВСЕ
// обогащения и обоснования REST-роутами §2.14 (синхронные 409/403/404/400),
// start_enrichment не использует; WS — только доставка enrichment_delta /
// enrichment_done / stream_error("enrich:…") по любому соединению
// пользователя.""",
    "E1. 03 §3.1 start_enrichment")
patch(P03,
    """// type/edgeType. Ответ несёт оба поля — по ним TaxonomySelector (5.4)
// рисует индикатор «из каталога» / «свободный текст».""",
    """// type/edgeType. Ответ несёт оба поля — по ним TaxonomySelector (5.4)
// рисует индикатор «из каталога» / «свободный текст».
// ФАКТ 5.4 (2026-09-05): выбор из каталога пишет type = name_ru в
// написании документа (строчная первая буква) + typeCatalogId; ввод
// руками — typeCatalogId: null. У сгенерированных элементов typeCatalogId
// всегда null (парсер 1.4 на каталог не нормализует — долг §12 → 5.5).""",
    "E2. 03 §2.4 п.11")
patch(P03,
    "| T3 | Нормализация типов при парсинге ответа Claude (маппинг на каталог) | Фаза 0 (сделано 0.3b) |",
    "| T3 | Нормализация типов при парсинге ответа Claude (маппинг на каталог) | Фаза 0 (сделано 0.3b — ТОЛЬКО сервис `normalizeType`; ФАКТ 5.4: в конвейере парсинга не вызывается, `typeCatalogId` остаётся null — долг §12 → 5.5) |",
    "E3. 03 §1.1 T3")

# ═══ F. 05 ═══
patch(P05,
    """│   │   │   ├── useStreamingGeneration.ts  # Подписка на стриминг генерации
│   │   │   ├── useEditPlan.ts          # Состояние плана редактирования""",
    """│   │   │   ├── useStreamingGeneration.ts  # Подписка на стриминг генерации
│   │   │   ├── useEnrichmentStream.ts  # Канал обогащений/обоснований: свой WS,
│   │   │   │                           # REST-запуск, enrichment_delta/done (5.4)
│   │   │   ├── useEditPlan.ts          # Состояние плана редактирования""",
    "F1. 05 hooks")
patch(P05,
    """│   │   │   ├── taxonomy.ts             # каталоги типов + normalize (5.4)
│   │   │   ├── enrichment.ts           # обогащения и обоснования (5.4)""",
    """│   │   │   ├── taxonomy.ts             # каталоги типов + normalize + createCustomType (5.4 СДЕЛАНО 2026-09-05; кэш на сессию)
│   │   │   ├── enrichment.ts           # обогащения и обоснования — 5 функций §2.14 (5.4 СДЕЛАНО 2026-09-05)""",
    "F2. 05 api")
patch(P05,
    """│   │   │   │   ├── CharacteristicSlider.tsx # Слайдер характеристики + кнопка «Обоснование»
│   │   │   │   ├── EnrichmentPanel.tsx     # Панель результатов обогащения элемента
│   │   │   │   ├── TaxonomySelector.tsx    # Выбор типа из каталога при нормализации""",
    """│   │   │   │   ├── EdgeEditor.tsx          # Поля связи: тип (TaxonomySelector), направление,
│   │   │   │   │                           # шесть слайдеров; kind='edge' ElementEditor (5.4)
│   │   │   │   ├── CharacteristicSlider.tsx # Слайдер характеристики + «?» → обоснование под
│   │   │   │   │                           # слайдером; CharacteristicSliderGroup (5.4)
│   │   │   │   ├── EnrichmentPanel.tsx     # Панель обогащения: запуск по типу, стрим, история (5.4)
│   │   │   │   ├── TaxonomySelector.tsx    # Комбобокс каталога + normalize + создание типа,
│   │   │   │   │                           # индикатор «из каталога / свободный текст» (5.4)""",
    "F3. 05 edit/")
patch(P05,
    """│   │   │   │                               # 5.2 (СДЕЛАНО 2026-09-04), Characteristic/
│   │   │   │                               # Enrichment/Taxonomy — 5.4, Transform* — 5.5""",
    """│   │   │   │                               # 5.2 (СДЕЛАНО 2026-09-04), Characteristic/
│   │   │   │                               # Enrichment/Taxonomy/EdgeEditor — 5.4
│   │   │   │                               # (СДЕЛАНО 2026-09-05), Transform* — 5.5""",
    "F4. 05 пометка edit/")

# ═══ G. 04 §4 ═══
patch(P04,
    "| `client/components/edit/CharacteristicSlider.tsx` | Слайдер характеристики + кнопка «Обоснование» |",
    "| `client/components/edit/CharacteristicSlider.tsx` | Слайдер характеристики + кнопка «Обоснование» — ФАКТ (5.4): параметризован CharacteristicSpec (шаг 1 для целых с засечками, 0.05 REAL), два режима записи onChange (черновик формы) / onCommit (немедленный PATCH), «?» раскрывает обоснование ПОД слайдером (история GET → запуск POST с текущим значением), readOnly; CharacteristicSliderGroup по CHARACTERISTICS_BY_TYPE |",
    "G1. 04 CharacteristicSlider")
patch(P04,
    "| `client/components/edit/EnrichmentPanel.tsx` | Панель результатов обогащения элемента |",
    "| `client/components/edit/EnrichmentPanel.tsx` | Панель результатов обогащения элемента — ФАКТ (5.4): выбор типа по канону §2.14 (дрейф-контроль с сервисом — 4ae), REST-запуск, стриминговая карточка, история из GET + финал из enrichment_done без GET, сворачиваемые карточки (тип · дата · токены · $) |",
    "G2. 04 EnrichmentPanel")
patch(P04,
    "| `client/components/edit/TaxonomySelector.tsx` | Выбор типа из каталога при нормализации |",
    """| `client/components/edit/TaxonomySelector.tsx` | Выбор типа из каталога при нормализации — ФАКТ (5.4): комбобокс каталога + POST /normalize (debounce 300 мс, match первым с «≈»), значение — пара type+typeCatalogId (тип из каталога в написании документа), «+ Создать тип» → форма (ключ из transliterate под KEY_RE, направление для связей) → POST → выбран; предложение привязки для свободного типа сгенерированных элементов (typeCatalogId=null — дыра парсера, §12 → 5.5) |
| `client/components/edit/EdgeEditor.tsx`, `client/hooks/useEnrichmentStream.ts`, `client/api/taxonomy.ts`, `client/api/enrichment.ts` | НОВОЕ (5.4, ФАКТ 2026-09-05): редактор связи как kind='edge' ElementEditor (вход — EdgePanel.onEdit, GEdge.dbId в graph-utils); канал доставки обогащений (собственное WS-соединение хозяина, REST-запуск, одна операция за раз); api-функции §2.13/§2.14. Интеграция: NodePanel.edit (слайдеры с PATCH по отпусканию, TaxonomySelector, «✦ Обогатить» → EnrichmentPanel; readOnly у владельца при генерации), ElementEditor (EnrichmentPanel в просмотре категории/связи, «?» в формах), useStreamingGeneration guard enrich:, CSS блоков 1/2/8 кита + переопределения для тёмной .gm-info-panel |""",
    "G3. 04 TaxonomySelector + новая строка 5.4")

# ═══ H. README ═══
patch("README.md",
    """Следующие по графу 07 — 5.4 (UI характеристик/обогащения/таксономии),
5.5 либо 6.1.""",
    """Беседа 5.4 (Характеристики + Обогащение + Таксономия UI, клиент)
ЗАКРЫТА 2026-09-05: CharacteristicSlider(Group) + EnrichmentPanel +
TaxonomySelector + EdgeEditor (новый kind='edge' ElementEditor) +
useEnrichmentStream + api/taxonomy, api/enrichment + интеграция
NodePanel/EdgePanel/GraphModal/CategoryEditor (смоук 36 ✓,
tests/test-54-requests2-6.mjs 79 ✓ ×2 в браузере на моке Claude,
check:integration += 2u/4ae; долги §12 CATEGORY_TYPES и WS-запуск
обоснования закрыты); доки пропатчены scripts/patch-docs-conv54.py.
Следующие по графу 07 — 5.5 (Representation Transformer) либо 6.1.""",
    "H. README")

# ═══ I. 5-6-ui-kit.md ═══
patch(KIT,
    "| 5.4 | CharacteristicSlider, EnrichmentPanel, TaxonomySelector |",
    "| 5.4 | CharacteristicSlider, EnrichmentPanel, TaxonomySelector (+ EdgeEditor) — СДЕЛАНО 2026-09-05: блоки 1, 2, 8 перенесены в часть 3 `globals.css` дословно; дополнения (части обоснования, строка комбобокса, форма нового типа, шапка панели, тёмные переопределения `.gm-info-panel`) — там же с комментариями |",
    "I. ui-kit.md")

# ═══ J. 01 ═══
patch(P01,
    "- Парсинг: `parseGraph()` (parseGraph()) + нормализация типов через Element Taxonomy (4.8) и `parseTopology()` (parseTopology()) адаптируются для извлечения из HTML-ответа Claude и записи в БД",
    "- Парсинг: `parseGraph()` (parseGraph()) + нормализация типов через Element Taxonomy (4.8) и `parseTopology()` (parseTopology()) адаптируются для извлечения из HTML-ответа Claude и записи в БД. ФАКТ 5.4 (2026-09-05): нормализация на каталог в graph-parser/saveGraphToDb НЕ вызывается (только lower-case текста) — `type_catalog_id` заполняется лишь через PATCH/TaxonomySelector; долг §12 07 → 5.5",
    "J. 01 §4.6")

print(f"\napplied={applied} skip={skipped} fail={failed}")
raise SystemExit(1 if failed else 0)
