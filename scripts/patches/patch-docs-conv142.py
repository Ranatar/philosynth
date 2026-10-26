#!/usr/bin/env python3
"""Патч документации по беседе 14.2 (хранимые тексты и их показ: Д-54, Д-55,
Д-57, Д-59, Д-62; из 14.1 — Д-76, Д-77; сервер + клиент пп.6–7).
ЧАСТЬ I — ПЕРВЫЙ ЗАПРОС (2026-10-26):
  A  07 — блок «По факту 14.2 (первый запрос)» после текста беседы: сверка
     текста с кодом (п.0) с перечнем расхождений, решения по каждому долгу,
     найденное сверх текста, адаптированные сторожа прежних бесед.
  B  03 §2.3 — DTO разделов: sectionTitle/subsectionTitles; §3.2 —
     generation_paused: reason? / rawMessage / maxTokensUsed / stuckSec.
  C  02 — paused_state (поля причины 14.2), file_genealogy (unnamed),
     generation_log.metadata (parseWarnings кодами, logLabel, error).
  D  04 — строка 14.2: parse-warnings.ts, gen-log-labels.ts,
     pauseReasonFields, sectionTitlesOf, subsection-titles.ts, placeholderNameOf,
     stripeLocale.
  E  05 — дерево: parse-warnings.ts, gen-log-labels.ts, subsection-titles.ts,
     smoke-142-request1, пометки.
  F  scripts/i18n/README — STORED_TEXT_EXCLUSIONS пуст; хранимые тексты — коды.
  G  NEXT-CONTEXT — первый запрос 14.2 исполнен, что осталось.
  Часть II (H, 2026-10-26) — тестовые запросы 2–7 одним заходом: 07 «По факту»
     (тесты, завершение, дыры документации). Часть III (I–M, 2026-10-26) —
     завершение: 07 §12 строки сняты → 08 Часть IV, врезка «Фаза 14» закрыта;
     08 Части I/II; README (Фаза 14 закрыта); 05 (test-142); 09 §2/§4/§6;
     NEXT-CONTEXT (состояние, ближайшая — 15.1, что оставила 14.2).
Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ; блоки «По факту» —
по marker). Запуск из корня:
    python3 scripts/patches/patch-docs-conv142.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
applied = skipped = failed = 0


def patch(rel: str, old: str, new: str, label: str, marker: str | None = None) -> None:
    global applied, skipped, failed
    path = ROOT / rel
    if not path.exists():
        failed += 1
        print(f"  fail  {label}: нет файла {rel}")
        return
    text = path.read_text(encoding="utf-8")
    if new in text or (marker is not None and marker in text):
        skipped += 1
        print(f"  skip  {label}")
        return
    if text.count(old) != 1:
        failed += 1
        print(f"  fail  {label}: якорь встречается {text.count(old)} раз")
        return
    path.write_text(text.replace(old, new), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


# ── A. 07 «По факту 14.2 (первый запрос)» ────────────────────────────────
PF142 = """
**По факту 14.2 (первый запрос — 2026-10-26).** Вход: HEAD e36313b,
`check:dotfiles` чист, `npm install` в самом клоне, PG 16 и Redis в
песочнице, `i18n:check --strict` на чистом клоне зелёный (2082 ключа в коде,
2495 строк таблицы; хранимых текстов по `STORED_TEXT_EXCLUSIONS` — 23 места,
безымянных литералов — 41). Порядок — п.0 сверка, затем Д-55 → Д-54 → Д-62 →
Д-57 → Д-59 → клиент (Д-54, Д-59, Д-76, Д-77) → переводы → сторож.

0. **Сверка текста с кодом** (grep по каждой названной функции, до правок).
   Совпало: `pauseFriendlyMessage` пишет готовую фразу в `pausedState.reason`
   трёх писателей (`generation-service` ×2 — стрим и `context-error`,
   `pause-resume-service` fill-missing-subs; `plan-executor` пишет `e.message`);
   `parseWarnings` — русские фразы `graph-parser` (роль, таблица, направление,
   ребро, нормализация), `resolveSubsection` (четыре исхода), `missingSubsectionsNote`,
   заметка повтора таблицы (`ensureRecommendationsTable.note`), чистка
   (`sanitizeWarningsRu` + префикс) — читатели `loadSectionParseWarnings` и
   `log-formatter` берут только строки; `section_label` — 15 писателей,
   `error_message` — 8 (`e.message` стрима и `bad` шага элемента);
   `sanitizeFileGenealogy` пишет «[безымянная концепция]» / «[безымянный
   философ]», `fileNodeToLineage` и `fileConceptParents` отдают их как есть;
   `listSubsections` и `subsectionNamesOf` (гость) — две копии одного кода,
   DTO без заголовков. Расхождения с текстом беседы и доками, найденные
   сверкой:
   (а) **«журнал в выгруженном HTML — русское зеркало» было неверно**:
   `html-exporter` звал `formatCtxLogHTML` под ALS запроса — оболочка лога
   (переведённая в 11.2) уходила в файл на языке запроса, а `isEmpty`
   сравнивался с русским литералом. Исправлено: лог и древо предков выгрузки
   собираются под `runWithLocale("ru")` — зеркало стало русским на деле;
   (б) `pauseFriendlyMessage` подставлял `max_tokens = 20 000` по умолчанию,
   тогда как писатель паузы знал `env.anthropic.maxTokens`, — в полях 14.2
   число одно (`pauseReasonFields`);
   (в) `bad` шага элемента употреблялся дважды — хранился в `error_message`
   и уходил ответом `ElementStepError` (`pointEditFailed`): теперь код в
   `metadata.error`, русская запасная строка колонки — `runWithLocale("ru")`
   той же сборки, ответ — на языке запроса;
   (г) `sectionLabel` паузы (русские `def.title`) показывался PauseModal как
   есть — не названо строкой Д-54, но лежит в той же модалке: метки теперь
   по `sectionKeys` (`tData(KEY_LABELS)`), без ключей (пауза до 12.5) —
   как прежде;
   (д) `def.title` («Исполнительное Резюме Синтеза») ≠ `KEY_LABELS`
   («Исполнительное резюме»): русская сборка подписи журнала по коду даёт
   `KEY_LABELS`-вид, а `section_label` новых записей хранит прежний
   `def.title`-вид — по тексту беседы (`tData(KEY_LABELS) + tl()`), осознанно;
   (е) запасные имена `titles.get(pid) ?? «[безымянная концепция]»` в
   `getAncestors`/`getDescendants` недостижимы (`syntheses.title NOT NULL`) —
   переведены в `tl()` для единообразия, тестом не покрываются;
   (ж) `plan-executor` пишет `pause_marker` дважды (внутри `createPausedState`
   и своим `logPauseEvent`) — существовало до 14.2, не тронуто (строка §12 —
   Д-78).

1. **Д-54 (сервер).** Shared `PauseReasonFields` (`reasonKind`, `reason?` —
   запасной текст пауз до 14.2, `rawMessage?` — сырое сообщение API/службы,
   `maxTokensUsed?`, `stuckSec?`); `PausedStateGen`/`PausedStatePlan` его
   наследуют, `WsGenerationPaused` несёт те же поля (`reason?`).
   `streaming-manager.pauseReasonFields(err)`: `max-tokens` → число,
   `stuck` → порог `env.streaming.stuckMs`/1000, `user-abort` → только вид,
   прочее (auth, billing, pre-stream, partial) → `rawMessage`. Писатели
   (`generation-service` стрим и `context-error`, `pause-resume-service`,
   `plan-executor`) раскладывают поля в `pausedState`, `pause_marker.metadata`
   и `generation_paused`; `ws/handler` при повторе шлёт `reason` только если он
   есть у старой паузы. `pauseFriendlyMessage` оставлен экспортом для консоли
   и тестов — в БД не пишется. `log-formatter` маркера паузы: «Детали» —
   `rawMessage ?? reason`.

2. **Д-55.** Shared `ParseWarning { code, params }` и закрытый список
   `PARSE_WARNING_CODES` (19 кодов: `graph_*` ×6, `subsection_*` ×4 с
   параметром `via` — intra / thesis_labels / ключ раздела, `subsections_missing`
   / `subsections_renamed`, `table_retry_composed` / `table_retry_failed`,
   `sanitize_*` ×5). Модуль `server/services/parse-warnings.ts` —
   `pw`, `withVia`, `renderParseWarning` (литеральный `tl()` на код; русские
   тексты ДОСЛОВНО равны фразам 11.1/11.2/12.3/14.1 — сторожа 4av/4bb/4bg
   проходят через русскую сборку), `renderParseWarningsRu`,
   `sanitizeParseWarnings(report)`, `parseWarningsFromMetadata` (строки
   остаются строками, объекты — кодами, мусор отбрасывается).
   `ParsedGraph.warnings`, `SaveGraphResult.warnings`, `SubsectionLookup.warning`,
   `missingSubsectionsNote`, `TableRetryResult.note`, `DocumentIndex.lookupWarnings`
   — коды; `appendParseWarnings(StoredParseWarning[])`; импорт отдаёт фразы
   ответа через `renderParseWarnings` под языком запроса импорта; `console.warn`
   — русская сборка. Читатели `loadSectionParseWarnings` и `log-formatter`
   собирают фразу под языком запроса; `SectionFull.parseWarnings` — строки,
   клиент 11.3 не тронут.

3. **Д-57.** `FileGenealogyNode.unnamed?: true` при `name: ""`;
   `sanitizeFileGenealogy` пишет так и безымянный узел, и узел со старой
   русской заглушкой на входе (`isUnnamedFileNode` — признак, пустое имя,
   «[безымянная концепция]», «[безымянный философ]»). Чтение: `fileNodeName`
   → `tl("server.lineageService.unnamedConcept|unnamedPhilosopher")`;
   `LineageNode.unnamed?: true` рядом с подставленным именем; `fileConceptParents`
   (GET /:id), `lineageCandidates`/предупреждения импорта — подстановка на
   языке запроса. Выгрузка: `lineageTreeToFileGenealogy` и `export/common`
   пишут русскую заглушку (`UNNAMED_CONCEPT_RU`, `fileNodeNameRu`) — зеркало
   11.4, импорт её распознаёт как пустое имя. `normalizeGenealogyNames`
   (порт исходника) не тронут: его заглушка снимается санацией перед записью.

4. **Д-62.** Shared `GenLogLabel` (kind: pass | common | section | regen |
   added | subsection | element_step | mode | transform | table_retry |
   table_compose | version; параметры — ключи разделов, имя подраздела, вид и
   имя элемента, поле, № и раунд рекомендации, `modeKey`/`modeTitle`/`param`,
   направление, `gap`) в `metadata.logLabel` и `GenLogError` (`stream` с
   `kind`/`raw`/`maxTokensUsed`/`stuckSec`; `element_empty_response`;
   `element_too_long` с `maxChars`) в `metadata.error`. Писатели: все 15
   мест `section_label` (включая маркеры паузы/возобновления/удаления/версии)
   и все 8 мест `error_message` (`streamLogError(e)` — сырое сообщение API
   хранится только у auth/billing/pre-stream/partial). `section_label` и
   `error_message` пишутся как прежде. Модуль `gen-log-labels.ts`:
   `renderLogLabel` (`tData(KEY_LABELS)` + `tl()`; метки режимов —
   `tData(modeTitle)`, вид/поле элемента — `tData(ELEMENT_STEP_*_LABELS)`),
   `renderLogError` (сырое — как есть; `max-tokens`/`stuck`/`user-abort` —
   фразой), `logLabelText`/`logErrorText` (без кода — колонка как есть).
   `log-formatter`: заголовки блоков, маркеры, «ОШИБКА», лог промптов — по
   кодам; пустой лог сравнивается с `tl()`, не с литералом.

5. **Д-59 (сервер).** `html-parser.sectionTitlesOf(html)` → `{ sectionTitle,
   subsectionTitles }` (linkedom; `a.toc-back-btn` и пустые якоря `subsec-*`
   сняты до чтения текста; нет `<h4>` — ключ). Несут `SectionSummary`,
   `SectionFull` (GET /sections, GET /sections/:key, вложенные разделы
   гостя), ответ PATCH подраздела (`subsectionTitles`). Копии
   `listSubsections`/`subsectionNamesOf` остались (цикл импортов
   routes/sections ↔ routes/syntheses) — Д-79.

6. **Д-54 (клиент).** `PauseModal.pauseReasonText(ps)` — порт
   `_pauseFriendlyMessage` [24653] через `tl()` по `reasonKind` (числа —
   `maxTokensUsed`, `stuckSec ?? 45`; `pre-stream` различает 429 / 5xx по
   `rawMessage`), деталь — `rawMessage` отдельной строкой (`pause-subtle`,
   `data-testid="pause-reason-detail"`); пауза с `reason` без новых полей —
   текст как есть. `ReasonBox ps={ps}` во всех пяти ветках;
   `useStreamingGeneration.pauseReasonFieldsOf(msg)` переносит поля без
   undefined-ключей. Новых классов нет.

7. **Д-59 (клиент).** `client/src/utils/subsection-titles.ts`:
   `subsectionTitleFrom(map, name)`, `subsectionTitleIn(list, key, name)`,
   `subsectionTitle(key, name)` (нереактивная), хук `useSubsectionTitle()`
   (подписан на сводки и разделы хранилища), `documentSectionTitle(summary)`
   (`.section-title`, иначе `tData(KEY_LABELS)`). Применено: оглавление
   (имена разделов и подразделов; якоря `subsectionSlugId` — по ключу),
   кнопки `EditSectionCard`, панель точечной перегенерации (кнопка, очередь,
   зависимости intra/cross, confirm режимов), `ElementEditor` («Подраздел
   {метка раздела} → {заголовок}» из составного ключа), адреса и основание
   рекомендаций. `summariesFromSections` гостя переносит оба поля.

8. **Д-76.** `placeholderNameOf(commentText)`: русский хвост — регуляркой,
   хвост на языке интерфейса — переводом `server.utils.htmlParser.placeholderTail`
   (ключ сервера читается клиентским каталогом), иначе — по последнему « — ».
   **Д-77.** `stripeLocale()` (ru/en/de из хранилища 11.3, иначе `auto`) —
   фабрике `Stripe(pk, { locale })` и каждому `elements({ …, locale })`.

9. **Переводы.** 59 новых ключей (`server.parseWarnings.*`,
   `server.genLogLabels.*`, `server.lineageService.*`,
   `synthesis.pauseModal.reason*`) — `i18n:export` → черновики en/de
   (`i18n:import --draft`) → `i18n:split`; `names.json` дополнен записями
   ключей и четырьмя `id: null` (`server.graphParser`: «Структурные роли»,
   «Процессуальные роли», «Таблица категорий», «Таблица связей» — параметры
   кодов, которые опись msg-режима видит через `warnings.push(pw(…))`).
   `EDGE_DIRECTIONS` — в `MIRROR_EXCLUSIONS` (параметр `expected`).
   `STORED_TEXT_EXCLUSIONS` пуст (механизм оставлен); `i18n:check --strict`
   зелёный: 2141 ключ в коде, 2554 строки таблицы, хранимых текстов 0.

10. **Сторож.** 2aw/4bh — экспорты новых модулей; писатели паузы без
    `pauseFriendlyMessage` и без `reason:`; предупреждения кодами (каждый код
    `PARSE_WARNING_CODES` имеет ветку `renderParseWarning`; русская сборка ≡
    фразам 11.2/12.3/14.1; под en — без кириллицы; строка как есть); родословная
    без заглушек (санация, `fileNodeName` под en/de/ru, выгрузка — русская
    заглушка, `html-exporter` под ru); коды подписей у всех писателей и
    `renderLogLabel`/`renderLogError` (ru ≡ прежним подписям, en — без
    кириллицы, запись без кода — как есть); DTO с `subsectionTitles`,
    `sectionTitlesOf` на образце с ⏫; клиент — `ReasonBox ps=`, легаси-ветка,
    `pauseSectionLabel`, помощник Д-59 в пяти компонентах, `placeholderNameOf`,
    `stripeLocale`; опись — `STORED_TEXT_EXCLUSIONS` пуст, `EDGE_DIRECTIONS`
    в зеркалах. 5ar живьём: новая запись генлога с кодами и старая фразами →
    `formatCtxLog` под en («CATEGORY GRAPH [REGENERATION]», «the model returned
    an empty response», фраза пропуска) и под ru (прежние русские), старая —
    как есть на обоих; `loadSectionParseWarnings` под en/ru; `createPausedState`
    с `pauseReasonFields(max-tokens)` → `pausedState`/`pause_marker` без
    `reason`, с числом и кодом подписи; `sanitizeFileGenealogy` → `file_genealogy`
    без кириллицы с `unnamed`, `getAncestors` под en/ru, выгрузка — заглушка.
    Адаптированы сторожа прежних бесед к новому контракту (пометки 14.2 в
    коде): 4av (предупреждения графа — через `renderParseWarningsRu`), 5w
    (JSON вместо join), 4bb-м (`missingSubsectionsNote` — через русскую
    сборку), 4bg-в (`cleanModelHtml` — `sanitizeParseWarnings`), 4ay
    (оглавление — `documentSectionTitle`, `tData` в помощнике), 4an
    (`parentName: shownName`), 5aj/4aw (типы массивов предупреждений).

**Найденное сверх текста — строки §12 с адресатом:** Д-78 двойной
`pause_marker` плана (`plan-executor` + `createPausedState`), Д-79 копии
`listSubsections`/`subsectionNamesOf` (две реализации одного перечисления).
Смоук — `tests/smoke-142-request1.mjs`.
"""

patch(
    "docs/07-conversation-protocol.md",
    """- «Протестируй Д-59 в браузере: английский документ в немецком интерфейсе → оглавление и кнопки подразделов показывают английские заголовки документа; документ без <h4> — ключи; клик по подразделу оглавления ведёт к нему (якорь по ключу)»
""",
    """- «Протестируй Д-59 в браузере: английский документ в немецком интерфейсе → оглавление и кнопки подразделов показывают английские заголовки документа; документ без <h4> — ключи; клик по подразделу оглавления ведёт к нему (якорь по ключу)»
""" + PF142,
    "A1 07: «По факту 14.2 (первый запрос)»",
    marker="**По факту 14.2 (первый запрос — 2026-10-26).**",
)

patch(
    "docs/07-conversation-protocol.md",
    """| Д-77 | недоделка | **Stripe Elements на клиенте без `locale`.**""",
    """| Д-78 | недоделка | **Двойной `pause_marker` у паузы плана.** `plan-executor` после `createPausedState` (который сам пишет маркер паузы с reasonKind и кодом подписи) пишет второй `pause_marker` своим `logPauseEvent` (без sectionKey) — в логе контекста пауза плана видна дважды. Найдено сверкой 14.2 п.0, существовало с 2.2. Путь: убрать второй вызов, оставить один маркер с полями причины | 14.2 (первый запрос) | 15.x | открыт |
| Д-79 | долг | **Две копии перечисления подразделов раздела.** `listSubsections` (`routes/sections.ts`) и `subsectionNamesOf` (`routes/syntheses.ts`, дублирован из-за цикла импортов) — один и тот же код (регулярка data-section + `parseSubsectionsFromHTML`); 14.2 добавила обоим `sectionTitlesOf`, но перечисление осталось двумя реализациями. Путь: один помощник в `server/utils/html-parser.ts` рядом с `sectionTitlesOf` (парсер подразделов 1.4 вынести из generation-service либо принять его параметром) | 14.2 (первый запрос) | 15.x | открыт |
| Д-77 | недоделка | **Stripe Elements на клиенте без `locale`.**""",
    "A2 07 §12: Д-78, Д-79",
    marker="| Д-78 | недоделка |",
)

# ── B. 03 ────────────────────────────────────────────────────────────────
patch(
    "docs/03-specification.md",
    """  subsections: string[];               // имена data-section внутри HTML —
                                       // нужны TableOfContents (беседа 1.6b)
                                       // для якорей второго уровня;
                                       // parseSubsectionsFromHTML (1.4)
  updatedAt: string;
}
```""",
    """  subsections: string[];               // имена data-section внутри HTML —
                                       // нужны TableOfContents (беседа 1.6b)
                                       // для якорей второго уровня;
                                       // parseSubsectionsFromHTML (1.4)
  sectionTitle: string | null;         // 14.2 (Д-59): видимый .section-title
                                       // документа без ⏫ и якорей (язык
                                       // генерации); нет — null
  subsectionTitles: Record<string, string>;  // 14.2 (Д-59): ключ data-section →
                                       // видимый текст первого <h4> подраздела
                                       // (без ⏫ и якорей); нет <h4> — ключ.
                                       // Ключи subsections остаются машинными
                                       // (сравнения, адреса, якоря); клиент
                                       // рисует имена по карте (helper
                                       // subsectionTitle), перевода ключей
                                       // по таблице НЕТ
  updatedAt: string;
}
```""",
    "B1 03 §2.3: SectionSummary.sectionTitle/subsectionTitles",
)

patch(
    "docs/03-specification.md",
    """  isEdited: boolean;
  subsections: string[];  // имена data-section внутри HTML
  lockedSubsections?: string[];  // 9.2: запертые для ручной правки (таблицы,""",
    """  isEdited: boolean;
  subsections: string[];  // имена data-section внутри HTML
  sectionTitle: string | null;               // 14.2 (Д-59): см. SectionSummary
  subsectionTitles: Record<string, string>;  // 14.2 (Д-59): см. SectionSummary
  lockedSubsections?: string[];  // 9.2: запертые для ручной правки (таблицы,""",
    "B2 03 §2.3: SectionFull.sectionTitle/subsectionTitles",
)

patch(
    "docs/03-specification.md",
    """                                 // своего повтора «Таблицы рекомендаций»; документ
                                 // при них сохранён как есть, догенерации нет.
                                 // Несёт GET /sections/:key; показ — 11.3:""",
    """                                 // своего повтора «Таблицы рекомендаций»; документ
                                 // при них сохранён как есть, догенерации нет.
                                 // 14.2 (Д-55): в генлоге лежат КОДЫ с параметрами
                                 // (shared ParseWarning; записи до 14.2 — строки),
                                 // сюда отдаются фразы, собранные под языком
                                 // запроса (server/services/parse-warnings.ts);
                                 // старая строка — как есть.
                                 // Несёт GET /sections/:key; показ — 11.3:""",
    "B3 03 §2.3: parseWarnings — коды в генлоге, фразы в DTO",
)

patch(
    "docs/03-specification.md",
    """  section: { key, htmlContent, isEdited?, subsections, lockedSubsections } }
```""",
    """  section: { key, htmlContent, isEdited?, subsections,
             subsectionTitles,           // 14.2 (Д-59): карта видимых заголовков после правки
             lockedSubsections } }
```""",
    "B4 03 §2.3: PATCH подраздела — subsectionTitles",
)

patch(
    "docs/03-specification.md",
    """  reasonKind: "auth"|"billing"|"pre-stream"|"max-tokens"|"partial"|"stuck",
  reason: string,
  isPartial: boolean,
  partialSubsections?: string[],""",
    """  reasonKind: "auth"|"billing"|"pre-stream"|"max-tokens"|"partial"|"stuck"
             |"context-error",
  reason?: string,           // 14.2 (Д-54): фразы причины сервер больше НЕ шлёт —
                             // клиент собирает её по reasonKind (PauseModal,
                             // tl()); поле несут только replay-сообщения пауз,
                             // записанных до 14.2 (запасной текст как есть)
  rawMessage?: string,       // 14.2 (Д-54): сырое сообщение API Anthropic /
                             // ошибки службы (auth, billing, pre-stream,
                             // partial, context-error) — деталь к причине, как есть
  maxTokensUsed?: number,    // 14.2 (Д-54): max-tokens — предел; stuck — порог
  stuckSec?: number,         //   молчания стрима, с (числа — подстановками)
  isPartial: boolean,
  partialSubsections?: string[],""",
    "B5 03 §3.2: generation_paused — поля причины 14.2",
)

# ── C. 02 ────────────────────────────────────────────────────────────────
patch(
    "docs/02-data-model.md",
    """    -- kind 'gen': { passIdx, sectionKeys, isPartial, partialSubsections,
    --   expectedSubsections, completedPasses, genParams, maxTokensUsed,
    --   reason, reasonKind, timestamp }
    -- kind 'plan': { stepIdx, totalSteps, failedOp, remainingOps, plan,
    --   regenCtx, addCtx, reason, reasonKind, timestamp }""",
    """    -- kind 'gen': { passIdx, sectionKeys, isPartial, partialSubsections,
    --   expectedSubsections, completedPasses, genParams, reasonKind,
    --   rawMessage?, maxTokensUsed?, stuckSec?, reason?, timestamp }
    -- kind 'plan': { stepIdx, totalSteps, failedOp, remainingOps, plan,
    --   regenCtx, addCtx, reasonKind, rawMessage?, maxTokensUsed?, stuckSec?,
    --   reason?, timestamp }
    -- 14.2 (Д-54): причина — ПОЛЯМИ (shared PauseReasonFields): reasonKind,
    --   rawMessage (сырое сообщение API/службы — как есть), числа
    --   (maxTokensUsed, stuckSec); готовую фразу (reason) новые паузы НЕ
    --   пишут — её собирает клиент по reasonKind; reason остаётся у пауз,
    --   записанных до 14.2 (и из выгрузки) — показывается как есть.
    --   pause_marker.metadata несёт те же поля (reason — только у старых)""",
    "C1 02 §2.3: paused_state — поля причины 14.2",
)

patch(
    "docs/02-data-model.md",
    """  -- Дерево генеалогии импортированного файла (FileGenealogyNode, миграция
  -- 0008): снимок предков, которых нет в synthesis_lineage; NULL — не из файла
  file_genealogy   JSONB,""",
    """  -- Дерево генеалогии импортированного файла (FileGenealogyNode, миграция
  -- 0008): снимок предков, которых нет в synthesis_lineage; NULL — не из файла.
  -- 14.2 (Д-57): безымянный узел — { type, name: "", unnamed: true } (до 14.2 —
  --   русская заглушка «[безымянная концепция]» / «[безымянный философ]»;
  --   читатели распознают её как пустое имя). Подстановка имени — при чтении
  --   на языке запроса (lineage-service fileNodeName → tl()); выгрузка пишет
  --   русскую заглушку (зеркало 11.4), импорт её снимает санацией
  file_genealogy   JSONB,""",
    "C2 02 §2.3: file_genealogy — unnamed",
)

patch(
    "docs/02-data-model.md",
    """  -- 11.1: + parseWarnings string[] — предупреждения разбора раздела
  --   (подставленное направление связи, роль вне ROLE_MAP, таблица не
  --   найдена по русскому data-section, подраздел опознан по месту /
  --   не опознан). Пишутся jsonb_set с НАКОПЛЕНИЕМ (`||` по верхнему
  --   ключу заменил бы массив); показ — log-formatter «РАЗБОР С ПОТЕРЯМИ»
  metadata       JSONB NOT NULL DEFAULT '{}',""",
    """  -- 11.1: + parseWarnings — предупреждения разбора раздела
  --   (подставленное направление связи, роль вне ROLE_MAP, таблица не
  --   найдена по русскому data-section, подраздел опознан по месту /
  --   не опознан). Пишутся jsonb_set с НАКОПЛЕНИЕМ (`||` по верхнему
  --   ключу заменил бы массив); показ — log-formatter «РАЗБОР С ПОТЕРЯМИ».
  --   14.2 (Д-55): элемент — КОД с параметрами (shared ParseWarning
  --   { code, params }, список PARSE_WARNING_CODES) либо строка (записи до
  --   14.2, журнал из выгрузки); фразу собирают читатели под языком запроса
  --   (server/services/parse-warnings.ts), строка — как есть
  -- 14.2 (Д-62): + logLabel (shared GenLogLabel — код подписи записи с
  --   параметрами: ключи разделов прохода, имя подраздела, вид операции,
  --   элемент/поле/№ рекомендации, режим/параметр, направление
  --   трансформации) и error (GenLogError — код ошибки: stream с kind и
  --   сырым raw сообщением API, element_empty_response, element_too_long).
  --   Колонки section_label и error_message пишутся КАК ПРЕЖДЕ (русская
  --   запасная строка для старых читателей и выгрузки); log-formatter собирает
  --   подпись/ошибку по коду под языком запроса (gen-log-labels.ts), запись
  --   без кода — колонки как есть. pause_marker/resume_marker несут logLabel
  --   { kind: 'pass', sections }
  metadata       JSONB NOT NULL DEFAULT '{}',""",
    "C3 02 §2.15: generation_log.metadata — parseWarnings кодами, logLabel, error",
)

# ── D. 04 ────────────────────────────────────────────────────────────────
patch(
    "docs/04-code-reuse-map.md",
    """| `sanitizeWarnings(report)` и `SanitizeHtmlResult.report` в `server/utils/html-parser.ts`; `visibleSubsectionTitle`;""",
    """| `server/services/parse-warnings.ts` (`pw`, `withVia`, `renderParseWarning`, `renderParseWarningsRu`, `sanitizeParseWarnings`, `parseWarningsFromMetadata`), `server/services/gen-log-labels.ts` (`renderLogLabel`, `renderLogError`, `streamLogError`, `logLabelText`/`logErrorText`), `pauseReasonFields` (`streaming-manager.ts`), `isUnnamedFileNode`/`fileNodeName`/`fileNodeNameRu`/`unnamedLabel` (`lineage-service.ts`), `sectionTitlesOf` (`server/utils/html-parser.ts`); shared `ParseWarning`/`PARSE_WARNING_CODES`, `GenLogLabel`/`GenLogError`, `PauseReasonFields`, `FileGenealogyNode.unnamed`, `SectionSummary.sectionTitle`/`subsectionTitles`; клиент — `PauseModal.pauseReasonText` (порт `_pauseFriendlyMessage` [24653]), `useStreamingGeneration.pauseReasonFieldsOf`, `client/src/utils/subsection-titles.ts` (`subsectionTitleFrom`, `useSubsectionTitle`, `documentSectionTitle`), `placeholderNameOf` (`subsection-rich-editor.ts`), `stripeLocale` (`utils/stripe.ts`) | НОВОЕ (14.2; Д-54, Д-55, Д-57, Д-59, Д-62, Д-76, Д-77 — прародитель только у причины паузы; файлы — `server/services/parse-warnings.ts`, `server/services/gen-log-labels.ts`, `server/services/streaming-manager.ts`, `server/services/lineage-service.ts`, `server/utils/html-parser.ts`, `client/src/components/synthesis/PauseModal.tsx`, `client/src/hooks/useStreamingGeneration.ts`, `client/src/utils/subsection-titles.ts`, `client/src/utils/subsection-rich-editor.ts`, `client/src/utils/stripe.ts`): всё, что ХРАНИТСЯ и читается позже (причина паузы, parseWarnings, подписи и ошибки журнала, безымянные узлы родословной), пишется кодом с параметрами, фраза собирается при чтении под языком запроса (образец 12.3); старые записи — как есть; колонки `section_label`/`error_message` и экспорт-зеркала остаются русскими; имена подразделов вокруг документа — видимые `<h4>`/`.section-title` самого документа, ключи `data-section` машинные |
| `sanitizeWarnings(report)` и `SanitizeHtmlResult.report` в `server/utils/html-parser.ts`; `visibleSubsectionTitle`;""",
    "D  04: строка 14.2",
    marker="| `server/services/parse-warnings.ts` (`pw`, `withVia`,",
)

# ── E. 05 ────────────────────────────────────────────────────────────────
patch(
    "docs/05-file-structure.md",
    """│   │   ├── recommendation-issues.ts    # 12.3 (Д-46): находки сторожа — кодом в БД, фразой при
│   │   │                               #  чтении под языком запроса; русский вид для колонок
""",
    """│   │   ├── recommendation-issues.ts    # 12.3 (Д-46): находки сторожа — кодом в БД, фразой при
│   │   │                               #  чтении под языком запроса; русский вид для колонок
│   │   ├── parse-warnings.ts           # 14.2 (Д-55): предупреждения разбора — коды с параметрами
│   │   │                               #  (shared ParseWarning), фраза при чтении (renderParseWarning),
│   │   │                               #  русская сборка для консоли/сторожей, коды чистки по отчёту
│   │   ├── gen-log-labels.ts           # 14.2 (Д-62): подписи и ошибки записей журнала — код в
│   │   │                               #  metadata (GenLogLabel/GenLogError), фраза при чтении;
│   │   │                               #  section_label/error_message — русская запасная строка
""",
    "E1 05: parse-warnings.ts, gen-log-labels.ts",
)

patch(
    "docs/05-file-structure.md",
    """│   │       ├── subsection-rich-editor.ts   # 13.1 (Д-64): полнотекстовая правка — contenteditable""",
    """│   │       ├── subsection-titles.ts        # 14.2 (Д-59): видимые заголовки подразделов/разделов из
│   │       │                               #  DTO (subsectionTitles/sectionTitle) — помощник и хук;
│   │       │                               #  ключи data-section остаются машинными
│   │       ├── subsection-rich-editor.ts   # 13.1 (Д-64): полнотекстовая правка — contenteditable""",
    "E2 05: client/utils/subsection-titles.ts",
)

patch(
    "docs/05-file-structure.md",
    """    │                                   # smoke-141-request1 — 14.1: опись msg-режима на пробе, i18n:check""",
    """    │                                   # smoke-142-request1 — 14.2: коды parseWarnings/подписей/причины паузы,
    │                                   #  родословная без заглушек, sectionTitlesOf, клиентские помощники (чистые)
    │                                   # smoke-141-request1 — 14.1: опись msg-режима на пробе, i18n:check""",
    "E3 05: tests/smoke-142-request1",
)

patch(
    "docs/05-file-structure.md",
    """│   │                                   # на беседу, patch-docs-conv<NNN>.py; последний — conv141)""",
    """│   │                                   # на беседу, patch-docs-conv<NNN>.py; последний — conv142)""",
    "E4 05: patches/ — последний conv142",
)

# ── F. scripts/i18n/README ───────────────────────────────────────────────
patch(
    "scripts/i18n/README.md",
    """записи — не язык чтения. `i18n:check` отделяет их по `STORED_TEXT_EXCLUSIONS`
(`i18n-core.mjs`; каждая запись носит номер долга 14.2 — Д-54/Д-55/Д-62) и печатает
строкой «хранимые тексты сервера», не красня. Если такой текст видит человек,
хранится КОД с параметрами, а фраза собирается при чтении — образец
`server/services/recommendation-issues.ts` (`renderIssue`, 12.3, Д-46) и
`sanitizeWarnings`/`sanitizeWarningsRu` (14.1, Д-60: один отчёт чистки, две сборки —
для ответа под языком запроса и для хранения по-русски). Полный вывод списков —
`I18N_CHECK_FULL=1 node scripts/i18n/i18n-check.mjs`.""",
    """записи — не язык чтения. Если такой текст видит человек, хранится КОД с
параметрами, а фраза собирается при чтении — образец
`server/services/recommendation-issues.ts` (`renderIssue`, 12.3, Д-46); с 14.2 так
живут причина паузы (`PauseReasonFields`, фразу собирает PauseModal), `parseWarnings`
(`server/services/parse-warnings.ts`), подписи и ошибки журнала
(`server/services/gen-log-labels.ts`) и безымянные узлы родословной
(`lineage-service.fileNodeName`). `STORED_TEXT_EXCLUSIONS` (`i18n-core.mjs`) с 14.2
пуст — механизм оставлен на будущие долги: запись (файл, область либо точный текст,
номер долга, довод) не красит `i18n:check`, а считается строкой «хранимые тексты
сервера». Параметры кодов — машинные значения (имена столбцов, data-section) — идут
в `names.json` записями `id: null`, константы-значения (`EDGE_DIRECTIONS`) — в
`MIRROR_EXCLUSIONS`. Полный вывод списков —
`I18N_CHECK_FULL=1 node scripts/i18n/i18n-check.mjs`.""",
    "F  scripts/i18n/README: STORED_TEXT_EXCLUSIONS пуст, хранимое — кодами",
)

# ── G. NEXT-CONTEXT ──────────────────────────────────────────────────────
patch(
    "NEXT-CONTEXT.md",
    """Новые ключи — черновики `i18n:import --draft`, утверждает владелец.
""",
    """Новые ключи — черновики `i18n:import --draft`, утверждает владелец.

**Первый запрос 14.2 ИСПОЛНЕН (2026-10-26)** — «По факту 14.2 (первый
запрос)» в 07: сервер (Д-54 `pauseReasonFields`, Д-55
`server/services/parse-warnings.ts`, Д-62 `server/services/gen-log-labels.ts`,
Д-57 `unnamed` в `file_genealogy` + `fileNodeName`, Д-59 `sectionTitlesOf` в
DTO разделов) и клиент (PauseModal `pauseReasonText`,
`client/src/utils/subsection-titles.ts` в пяти компонентах, Д-76
`placeholderNameOf`, Д-77 `stripeLocale`); 59 новых ключей с черновиками
en/de; сторож 2aw/4bh/5ar, INTEGRATION OK; смоук
`tests/smoke-142-request1.mjs` (31 ✓); `STORED_TEXT_EXCLUSIONS` пуст.
Осталось: тестовые запросы 2–7 беседы (Д-54 на моке, Д-55/Д-62 побайтно
ru, Д-57 импорт, Д-59 сервер, Д-54 и Д-59 в браузере Chrome 131 на сборке
клиента), завершение (закрытие строк §12 → 08 Часть IV, Фаза 14, README).
Новые строки §12 из сверки — Д-78 (двойной `pause_marker` плана), Д-79
(копии `listSubsections`/`subsectionNamesOf`) — адресат 15.x.
""",
    "G  NEXT-CONTEXT: первый запрос 14.2 исполнен",
    # часть III (M2) заменяет раздел «Ближайшая беседа — 14.2» целиком — тогда блок уже не нужен
    marker="## Ближайшая беседа — 15.1",
)

# ══ Часть II: тестовые запросы 2–7 (2026-10-26, одним заходом) ═══════════
def remove(rel: str, old: str, label: str) -> None:
    """Снять строку (блок) из файла; идемпотентно: нет строки — skip."""
    global applied, skipped, failed
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    if old not in text:
        skipped += 1
        print(f"  skip  {label}")
        return
    if text.count(old) != 1:
        failed += 1
        print(f"  fail  {label}: якорь встречается {text.count(old)} раз")
        return
    path.write_text(text.replace(old, ""), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


def row_of(rel: str, prefix: str) -> str:
    """Полная строка таблицы по началу («| Д-54 |») — для переноса в 08."""
    for line in (ROOT / rel).read_text(encoding="utf-8").splitlines(keepends=True):
        if line.startswith(prefix):
            return line
    return ""


PF142_TESTS = """
**По факту 14.2 (тестовые запросы 2–7 — 2026-10-26, одним заходом по
решению пользователя).** `tests/test-142-requests2-7.mjs` — 58 ✓ ×2 (мок
Claude :3927, сервер :3000, сборка клиента под vite preview :5225, Chrome
131). Переводы 59 ключей беседы УТВЕРЖДЕНЫ владельцем тем же днём
(`i18n:export` → снят `draft` → `i18n:import` без `--draft`, подтверждено
вычиткой 118; черновиков 0).

- **R2 (Д-54).** Обрыв графа по `stop_reason: max_tokens` на моке
  (`ANTHROPIC_MAX_TOKENS=4000`, два целых подраздела до обрыва):
  `pausedState` — `reasonKind: max-tokens`, `maxTokensUsed: 4000`,
  `isPartial`, `sectionKeys`, БЕЗ `reason` и `rawMessage`; `pause_marker` —
  без `reason`, с числом и `logLabel {pass, [graph]}`; строка генлога графа
  — `metadata.error {stream, max-tokens, 4000}` без сырого текста; GET /:id
  владельцу — те же поля. Старая пауза (`reason` без новых полей, вставлена
  в `paused_state`) — GET /:id отдаёт `reason` как есть.
- **R3 (Д-55/Д-62).** Генерация резюме без «Точки напряжения» и графа с
  переведёнными атрибутами: `metadata.parseWarnings` — только объекты
  (`subsections_missing {names: [Точки напряжения], expected: 7, marked: 6}`,
  `graph_table_missing` ×2), ни одной строки-фразы; `logLabel` у всех строк
  генерации (`pass` по ключам, `common` у служебной); `section_label` —
  прежний `def.title`. Под en: `/sections/sum` — «…without writing
  subsection “Точки напряжения” (subsections expected: 7, marked up: 6)…»,
  `/sections/graph` — «subsection “Таблица категорий” not found — categories
  not parsed…», `/logs/formatted` — «═══ EXECUTIVE SUMMARY ═══», «═══ CATEGORY
  GRAPH ═══»; старая запись (строкой: подпись, ошибка, предупреждение) — как
  есть. Под ru: фразы 12.3 и 11.1 побайтно (включая список атрибутов
  `"Graph part 1", …`); подписи — `tData(KEY_LABELS)`-вид («ИСПОЛНИТЕЛЬНОЕ
  РЕЗЮМЕ», не «…СИНТЕЗА» — см. п.0(д) первого запроса).
- **R4 (Д-57).** Импорт выгрузки, в `philosynth-state.genealogy.participants`
  которой подставлены узел без `name` и узел «[безымянная концепция]» с
  веткой: `file_genealogy` — оба с `name: ""`, `unnamed: true`, кириллических
  заглушек нет; ответ импорта en-пользователю — `lineageCandidates.parentName`
  и предупреждения с «[unnamed concept]»; GET /:id `fileConceptParents` и
  `/lineage/ancestors` под en — «[unnamed concept]» с `unnamed: true`, ветка
  («Гегель») цела; под ru — «[безымянная концепция]». Старая запись
  (`file_genealogy` с русскими заглушками концепции и философа) под en —
  «[unnamed concept]» / «[unnamed philosopher]»; выгрузка под en — русские
  заглушки, «[unnamed» в файле нет.
- **R5 (Д-59, сервер).** Английский документ (`.section-title` и `<h4>`
  по-английски, атрибуты — русские ключи, в разметке ⏫ и якоря
  `subsec-*`): `/sections` — `sectionTitle: "Executive summary"`,
  `subsectionTitles[ключ] = "English title N"`, `subsections` — русские ключи;
  документ без `<h4>` (граф) — карта ведёт на ключи; ⏫/`subsec-` в ответе
  нет; `/sections/:key` — те же поля; гостевой документ одним ответом
  (`visibility: full`, без cookie) — те же поля.
- **R6 (Д-54, браузер).** Пауза R2 в браузере: en-владелец — ReasonBox «The
  response was cut off by the token limit (max_tokens = 4 000). The section
  is too large.», метка «Category graph» по ключам (не «Граф Категорий
  Концепции»), заголовок «⏸ Section interrupted midway», детали нет;
  ru-владелец — «Ответ оборван по лимиту токенов (max_tokens = 4 000).
  Раздел слишком объёмный.» (фраза прежнего `_pauseFriendlyMessage`),
  «Раздел прерван в середине»; старая пауза при en — текст `reason` как
  есть; ошибок страницы нет.
- **R7 (Д-59, браузер).** Английский документ de-пользователя (`ui_locale`,
  `<html lang="de">`, «Inhalt»): оглавление — «Executive summary»/«Corpus
  of theses»/«Category graph» и «English title N»/«Ontological theses»,
  граф без `<h4>` — ключи; `href` — `#subsec-sum-<ключ>`; клик по
  подразделу — `location.hash` по ключу, элемент с id есть, страница
  прокручена; EditModal — кнопки карточки тезисов «⟳ Ontological theses»,
  «⟳ Summary table of theses» (ключей нет), карточка графа — ключи; панель
  точечной перегенерации — «⟳ Ontological theses».

**По факту 14.2 (завершение — 2026-10-26).** `npm run typecheck` — 0;
`vite build` собран; `check:integration` на том же свежем клоне —
INTEGRATION OK (2aw/4bh/5ar); `check:dotfiles`; `i18n:check --strict`
зелёный (2141 ключ в коде, 2554 строки таблицы, черновиков 0, хранимых
текстов 0); `audit.mts` — расхождений нет (`sectionTitle`/`subsectionTitles`
внесены в `typeOnly` строки `sections` как вычисляемые из `html_content`);
`check-map-04` — адреса распознаны, расхождений прежние 2 (12.5);
css-parity — непокрытых 0 из 586. TODO/FIXME в коде беседы нет. Д-54, Д-55, Д-57, Д-59, Д-62,
Д-76, Д-77 закрыты → 08 Часть IV; новые строки Д-78 (двойной
`pause_marker` плана) и Д-79 (копии перечисления подразделов) — адресат
не назначен (Фаза 15 либо отдельная беседа — решение пользователя).
**Фаза 14 закрыта.** Доки — `patch-docs-conv142.py` (части I–III), уроки —
09 §2, §4, §6. Ближайшая — 15.1 (Фаза 15 «Снятие ограничений»).

**Дыры документации, найденные беседой** (все закрыты патчем): (1) 07 и
11.4 называли лог в HTML-выгрузке русским зеркалом — код собирал его под
языком запроса (исправлен код, не текст); (2) 03 §3.2 `generation_paused`
не перечислял `reasonKind: context-error`, который shared-тип и сервер
несут с 1.4; (3) 02 §2.3 `paused_state` описывал `reason`/`maxTokensUsed`
без семантики источника фразы; (4) 05 — счётчик патчей «последний —
conv141» (оставался ручным); (5) README инструментов i18n описывал
`STORED_TEXT_EXCLUSIONS` как вечный список с номерами долгов, хотя его
назначение — временная корзина до закрывающей беседы; (6) 07 §12 не
знал о двойном `pause_marker` плана (с 2.2) и о двух копиях
перечисления подразделов (с 8.6) — Д-78, Д-79.
"""

patch(
    "docs/07-conversation-protocol.md",
    """Смоук — `tests/smoke-142-request1.mjs`.
""",
    """Смоук — `tests/smoke-142-request1.mjs`.
""" + PF142_TESTS,
    "H1 07: «По факту 14.2 (тестовые запросы 2–7)» и «(завершение)»",
    marker="**По факту 14.2 (тестовые запросы 2–7 — 2026-10-26",
)

# §12 → 08 Часть IV
CLOSED = {
    "| Д-54 |": "ЗАКРЫТ 14.2 (2026-10-26): shared `PauseReasonFields` (`reasonKind`, `rawMessage`, `maxTokensUsed`, `stuckSec`; `reason` — только у пауз до 14.2), `pauseReasonFields(err)` у четырёх писателей и повтора WS; фразу собирает PauseModal (`pauseReasonText`, порт `_pauseFriendlyMessage`), сырое сообщение API — деталью; метки раздела — по `sectionKeys`; smoke-142 A11/A16–A18, test-142 R2/R6 (en/ru/старая пауза)",
    "| Д-55 |": "ЗАКРЫТ 14.2 (2026-10-26): shared `ParseWarning {code, params}` (19 кодов), `server/services/parse-warnings.ts` — `pw`/`withVia`/`renderParseWarning` (ru дословно 11.1/11.2/12.3/14.1), `sanitizeParseWarnings`, `parseWarningsFromMetadata`; писатели — graph-parser, `resolveSubsection`, `missingSubsectionsNote`, повтор таблицы, чистка; читатели `loadSectionParseWarnings`/log-formatter собирают фразу, строки старых записей как есть; сторож 4av/4bb/4bg через русскую сборку; test-142 R3",
    "| Д-57 |": "ЗАКРЫТ 14.2 (2026-10-26): `FileGenealogyNode.unnamed` при `name: \"\"`, санация снимает и старую заглушку; `fileNodeName` → `tl()` при чтении (`fileConceptParents`, `/lineage/ancestors`, кандидаты импорта), `LineageNode.unnamed`; выгрузка и `export/common` — русская заглушка (`fileNodeNameRu`, `UNNAMED_CONCEPT_RU`), `html-exporter` собирает древо под ru; test-142 R4",
    "| Д-59 |": "ЗАКРЫТ 14.2 (2026-10-26): `sectionTitlesOf(html)` → `sectionTitle`/`subsectionTitles` в `SectionSummary`, `SectionFull`, ответе PATCH и гостевых разделах (⏫ и якоря сняты; нет `<h4>` — ключ); клиент — `utils/subsection-titles.ts` (`subsectionTitleFrom`, `useSubsectionTitle`, `documentSectionTitle`) в оглавлении, EditSectionCard, SubsectionRegenPanel, ElementEditor, RecommendationsPanel; ключи/якоря не тронуты, перевода ключей по таблице нет; test-142 R5/R7",
    "| Д-62 |": "ЗАКРЫТ 14.2 (2026-10-26): shared `GenLogLabel`/`GenLogError` в `metadata.logLabel`/`metadata.error` у всех 15 писателей подписей и 8 писателей ошибок; `section_label`/`error_message` — как прежде; `gen-log-labels.ts` — `renderLogLabel` (`tData(KEY_LABELS)` + `tl()`), `renderLogError` (сырое API как есть), запись без кода — колонки как есть; log-formatter — заголовки, маркеры, ошибки, лог промптов по кодам; выгрузка под ru; test-142 R3",
    "| Д-76 |": "ЗАКРЫТ 14.2 (2026-10-26): `placeholderNameOf` — русский хвост регуляркой, хвост на языке интерфейса переводом `server.utils.htmlParser.placeholderTail`, иначе по последнему « — »; smoke-142 A20",
    "| Д-77 |": "ЗАКРЫТ 14.2 (2026-10-26): `stripeLocale()` (ru/en/de из хранилища 11.3, иначе `auto`) — фабрике `Stripe(pk, {locale})` и `elements({…, locale})`; smoke-142 A21",
}
rows_08 = []
for prefix, verdict in CLOSED.items():
    row = row_of("docs/07-conversation-protocol.md", prefix)
    if not row:
        continue  # уже перенесена
    cells = [c.strip() for c in row.strip().strip("|").split("|")]
    # | Д-N | вид | текст | источник | адресат | статус |
    short = cells[2].split("**")[1] if "**" in cells[2] else cells[2][:120]
    rows_08.append(f"| {cells[0]} — {short.rstrip('.')} | 14.2 | {cells[3]} | {verdict} |\n")
if rows_08:
    patch(
        "docs/08-history.md",
        """Customer — `preferred_locales` по `ui_locale` (Checkout у службы нет — `locale` Elements Д-77, 14.2); deploy/* — пересев; test-141 R5 на моке |
""",
        """Customer — `preferred_locales` по `ui_locale` (Checkout у службы нет — `locale` Elements Д-77, 14.2); deploy/* — пересев; test-141 R5 на моке |
""" + "".join(rows_08),
        "I1 08 Часть IV: закрытые строки 14.2",
        marker="| Д-54 — Причина паузы хранится русской фразой | 14.2 |",
    )
else:
    skipped += 1
    print("  skip  I1 08 Часть IV: закрытые строки 14.2")
for prefix in CLOSED:
    row = row_of("docs/07-conversation-protocol.md", prefix)
    remove("docs/07-conversation-protocol.md", row, f"I2 07 §12: снята строка {prefix.strip('| ')}") if row else print(f"  skip  I2 07 §12: снята строка {prefix.strip('| ')}")

# Д-78 / Д-79 — адресат не назначен (обе строки несут один хвост; замена всех вхождений)
_p07 = ROOT / "docs/07-conversation-protocol.md"
_t07 = _p07.read_text(encoding="utf-8")
if "| 14.2 (первый запрос) | 15.x | открыт |" in _t07:
    _p07.write_text(_t07.replace("| 14.2 (первый запрос) | 15.x | открыт |", "| 14.2 (первый запрос) | не назначен | открыт |"), encoding="utf-8")
    applied += 1
    print("  ok    I4 07 §12: Д-78/Д-79 — адресат не назначен")
else:
    skipped += 1
    print("  skip  I4 07 §12: Д-78/Д-79 — адресат не назначен")

patch(
    "docs/07-conversation-protocol.md",
    """### Фаза 14 (добавлена 2026-10-13): довершение локализации

> Заведена ревизией непереведённого 2026-10-13 (вне бесед, по просьбе""",
    """### Фаза 14 (добавлена 2026-10-13): довершение локализации — ЗАКРЫТА 2026-10-26

> **Закрыта 2026-10-26:** 14.1 — 2026-10-20 (Д-51, Д-52, Д-53, Д-56, Д-58,
> Д-60, Д-61), 14.2 — 2026-10-26 (Д-54, Д-55, Д-57, Д-59, Д-62, Д-76, Д-77).
> Строк §12 с адресатом 14.x нет; Д-78/Д-79 (найдены сверкой 14.2) —
> адресат не назначен. Следующая — Фаза 15.
>
> Заведена ревизией непереведённого 2026-10-13 (вне бесед, по просьбе""",
    "I5 07: врезка «Фаза 14» — закрыта",
)

# 08 Часть I и Часть II
patch(
    "docs/08-history.md",
    """смоук 141 33 ✓, test-141 45 ✓; новые Д-76, Д-77 → 14.2; доки —
patch-docs-conv141.py; ближайшая — 14.2.
""",
    """смоук 141 33 ✓, test-141 45 ✓; новые Д-76, Д-77 → 14.2; доки —
patch-docs-conv141.py; ближайшая — 14.2.
Беседа 14.2 (хранимые тексты и их показ; бэкенд + клиент) ЗАКРЫТА
2026-10-26 — ФАЗА 14 ЗАКРЫТА. Всё, что хранится и читается позже, — кодом
с параметрами, фраза при чтении: причина паузы (`PauseReasonFields`, фразу
собирает PauseModal), `parseWarnings` (`parse-warnings.ts`, 19 кодов),
подписи и ошибки журнала (`gen-log-labels.ts`), безымянные узлы
родословной (`unnamed`, `fileNodeName`); старые записи — как есть;
`section_label`/`error_message` и экспорт-зеркала остаются русскими
(лог и древо выгрузки — под ru на деле). Имена подразделов вокруг
документа — видимые `<h4>`/`.section-title` (`sectionTitlesOf`,
`subsection-titles.ts`), ключи машинные. Д-76 плашка, Д-77 locale Stripe.
59 ключей (en/de утверждены), `STORED_TEXT_EXCLUSIONS` пуст; сторож
2aw/4bh/5ar, смоук 142 31 ✓, test-142 58 ✓ ×2; новые Д-78, Д-79 (адресат не
назначен); доки — patch-docs-conv142.py; ближайшая — 15.1.
""",
    "J1 08 Часть I: 14.2 закрыта",
    marker="Беседа 14.2 (хранимые тексты и их показ; бэкенд + клиент) ЗАКРЫТА",
)

CH142 = """### Беседа 14.2 — Хранимые тексты и их показ (бэкенд + клиент) [ЗАКРЫТА 2026-10-26 — Фаза 14 закрыта]

**Вход:** HEAD e36313b, `check:dotfiles` чист, `npm install` в самом клоне,
PG 16 и Redis в песочнице; Chrome 131 из `chrome/` — для запросов 6–7.
Вторая и последняя беседа Фазы 14: пять долгов ревизии непереведённого
2026-10-13 (Д-54, Д-55, Д-57, Д-59, Д-62) и два из 14.1 (Д-76, Д-77).
Решения пользователя: журнал генерации переводить; имена подразделов вокруг
документа — видимые заголовки документа («как проще и надёжнее»); клиент —
только пп.6–7; старые записи БД не переписывать; переводы — черновики,
утверждает он (утвердил тем же днём); тестовые запросы — одним заходом.

**Сделано (первый запрос, 2026-10-26).** п.0 — сверка («По факту 14.2»
п.0): лог HTML-выгрузки собирался под языком запроса вопреки 11.4 (теперь
под ru вместе с древом предков); `20 000` по умолчанию в
`pauseFriendlyMessage`; двойное употребление `bad` шага элемента; русская
`sectionLabel` паузы в модалке; `def.title` ≠ `KEY_LABELS`; двойной
`pause_marker` плана и копии перечисления подразделов — Д-78/Д-79. Общий
приём 12.3 (код при записи, фраза при чтении): Д-54 `PauseReasonFields` и
`pauseReasonFields(err)`, PauseModal `pauseReasonText`; Д-55 `ParseWarning`
+ 19 кодов, `parse-warnings.ts` (ru дословно прежним фразам), писатели и
читатели; Д-62 `GenLogLabel`/`GenLogError` у всех писателей,
`gen-log-labels.ts`, log-formatter по кодам; Д-57 `unnamed` в
`file_genealogy`, `fileNodeName` при чтении, русская заглушка в выгрузке;
Д-59 `sectionTitlesOf` в DTO, клиентский помощник в пяти компонентах; Д-76
`placeholderNameOf`; Д-77 `stripeLocale`. 59 ключей, `STORED_TEXT_EXCLUSIONS`
пуст, `EDGE_DIRECTIONS` в `MIRROR_EXCLUSIONS`, четыре `id: null`
(параметры кодов). Сторож 2aw/4bh/5ar; адаптированы 4av/5w/4bb/4bg/4ay/4an/
5aj/4aw; смоук `tests/smoke-142-request1.mjs` 31 ✓.

**Тестовые запросы 2–7 (2026-10-26, одним заходом).** Переводы утверждены.
`tests/test-142-requests2-7.mjs` 58 ✓ ×2: max_tokens на моке → пауза полями
без фразы, старая пауза как есть; генерация с пропуском и переведёнными
атрибутами → коды в генлоге, en/ru фразы (ru побайтно 12.3/11.1), старая
запись как есть; импорт с безымянным предком → `unnamed`, подстановка под
en/ru, старые заглушки переводом, выгрузка — русское зеркало; `/sections`
с `subsectionTitles`/`sectionTitle` (⏫/якоря сняты, без `<h4>` — ключи,
гость); в браузере — причина паузы en/ru/старая, английский документ в
немецком интерфейсе (оглавление, якоря по ключу, EditModal, панель
перегенерации).

**Завершение (2026-10-26).** typecheck 0; vite build; check:integration OK
(2aw/4bh/5ar); dotfiles; i18n strict (черновиков 0). Д-54, Д-55, Д-57, Д-59,
Д-62, Д-76, Д-77 закрыты → Часть IV; новые Д-78, Д-79 — адресат не назначен.
Фаза 14 закрыта. Доки — `patch-docs-conv142.py` (части I–III), уроки — 09 §2,
§4, §6. Ближайшая — 15.1.

---

"""
patch(
    "docs/08-history.md",
    "### Беседа 14.1 — Опись и сообщения ответа (бэкенд) [ЗАКРЫТА 2026-10-20]\n",
    CH142 + "### Беседа 14.1 — Опись и сообщения ответа (бэкенд) [ЗАКРЫТА 2026-10-20]\n",
    "J2 08 Часть II: глава 14.2",
    marker="### Беседа 14.2 — Хранимые тексты и их показ (бэкенд + клиент) [ЗАКРЫТА 2026-10-26",
)

# README
patch(
    "README.md",
    """— закрыта 10-20; 14.2 — хранимые тексты и клиент (+ Д-76, Д-77) |""",
    """— закрыта 10-20; 14.2 (хранимые тексты кодами: причина паузы, parseWarnings, подписи и ошибки журнала, безымянные узлы родословной — фраза при чтении; видимые заголовки подразделов в DTO и интерфейсе; плашка строки-места, locale Stripe; Д-54, Д-55, Д-57, Д-59, Д-62, Д-76, Д-77) — закрыта 10-26. **Фаза закрыта 2026-10-26** |""",
    "K1 README: Фаза 14 закрыта",
)

# 05 — test-142
patch(
    "docs/05-file-structure.md",
    """    │                                   # test-141-requests2-5 — 14.1: R2 опись на коде dd1b1e0 (worktree) —""",
    """    │                                   # test-142-requests2-7 — 14.2: R2 max_tokens на моке → пауза полями, R3 коды
    │                                   #  parseWarnings/подписей en/ru + старая запись, R4 импорт с безымянным
    │                                   #  предком, R5 /sections с заголовками, R6/R7 браузер (пауза en/ru; английский
    │                                   #  документ в немецком интерфейсе) — Chrome 131 на сборке клиента
    │                                   # test-141-requests2-5 — 14.1: R2 опись на коде dd1b1e0 (worktree) —""",
    "K2 05: test-142-requests2-7",
)

# 09 — уроки
patch(
    "docs/09-lessons.md",
    """## 3. PostgreSQL, Drizzle, данные
""",
    """### Беседа 14.2 — коды вместо хранимых фраз: что ломается вокруг
1. **Смена контракта хранимого текста (строка → код) ломает сторожа прежних
   бесед по всему пути**: 4av/5w (строки предупреждений графа), 4bb-м
   (`missingSubsectionsNote`), 4bg-в (`sanitizeWarningsRu` в `cleanModelHtml`),
   4an (форма `LineageCandidate`), 4ay (`tData` ушёл в помощник), типы
   массивов в 5aj/4aw. Правятся через РУССКУЮ СБОРКУ читателя
   (`renderParseWarningsRu`), а не снятием проверки — тексты обязаны
   остаться дословными, иначе старые строки и новые коды разойдутся.
2. **Опись msg-режима видит параметры кодов**: `warnings.push(pw("…", {
   table: "Таблица категорий" }))` — литерал в контексте сообщения, хотя это
   машинное значение; белый список — `names.json` с `id: null` для
   значений и `MIRROR_EXCLUSIONS` для констант (`EDGE_DIRECTIONS`), не
   `STORED_TEXT_EXCLUSIONS` (та корзина — для фраз, которые ещё хранятся).
3. **Пустой список исключений — тоже контракт**: сторож 4bg искал записи с
   номером долга 14.2 в `STORED_TEXT_EXCLUSIONS`; после закрытия долгов он
   обязан проверять наличие механизма (`storedExclusionFor`), а не записей.
4. **Патч доков с удалением строк**: `patch(old, new="")` не идемпотентен
   (`"" in text` всегда истинно) — для снятия строк §12 нужна отдельная
   `remove()` со skip при отсутствии якоря, а перенос строки в 08 читается
   из 07 ДО снятия (`row_of`).

## 3. PostgreSQL, Drizzle, данные
""",
    "L1 09 §2: уроки 14.2",
    marker="### Беседа 14.2 — коды вместо хранимых фраз: что ломается вокруг",
)

patch(
    "docs/09-lessons.md",
    """## 5. Node, TypeScript, сборка
""",
    """### Беседа 14.2 — клиентские модули в серверном харнессе, ответы в обёртке
1. **Импорт клиентского `i18n-store` в харнессе подменяет провайдер
   каталога**: модуль ставит СВОЙ `setCatalogProvider` при импорте, и все
   последующие `runWithLocale("en", …)` сервера отвечают по-русски. После
   импорта клиентских модулей — `installServerCatalogProvider()` ещё раз
   (smoke-142 A2–A13 были красными ровно по этой причине).
2. **`toLocaleString("ru")` ставит неразрывный пробел** (U+00A0) в
   «8 000» — сравнение с литералом «8 000» (обычный пробел) красно;
   в утверждениях — регулярка с `.` на месте разряда.
3. **GET /syntheses/:id отвечает `{ synthesis: {…} }`**, не телом синтеза —
   `json.pausedState` всегда `undefined`; читать `json.synthesis.pausedState`
   (и `fileConceptParents`, `sections` гостя).
4. **`loadSectionParseWarnings` требует строки `sections`**: предупреждения
   из генлога раздела, которого нет в `sections`, GET /sections/:key не
   отдаст (404) — фикстура старой записи заводит и раздел.
5. **Интерфейс пользователя в браузере — по `users.ui_locale`**, не по
   `Accept-Language` контекста: немецкий интерфейс для теста — `update users
   set ui_locale='de'` до входа; проверка — `document.documentElement.lang`.

## 5. Node, TypeScript, сборка
""",
    "L2 09 §4: уроки 14.2",
    marker="### Беседа 14.2 — клиентские модули в серверном харнессе, ответы в обёртке",
)

patch(
    "docs/09-lessons.md",
    """## 7. Сервер: стрим, WS, Redis, Registry
""",
    """### Беседа 14.2 — видимые заголовки вместо перевода ключей
1. **Имя, которое пишет модель, не переводится таблицей** — показывается
   само: `data-section` остаётся ключом (адреса, якоря, сравнения), а
   подпись берётся из `<h4>` того же документа через карту сервера. Один
   помощник над хранилищем (`useSubsectionTitle`) вместо `tData` в пяти
   компонентах; хук подписан на сводки — смена документа перерисовывает.
2. **Составные ключи в ответах сервера («раздел:подраздел»,
   `affectedSubsections`) показываются разбором по первому `:`** — ключ
   раздела → `tData(KEY_LABELS)`, имя → карта заголовков; сам ключ не
   меняется.
3. **Старые данные без новых полей — отдельная ветка показа, а не
   `?? ""`**: пауза с `reason` и без `rawMessage`/`stuckSec` показывает
   `reason` как есть; признак «старая запись» — отсутствие НОВЫХ полей, не
   наличие старого (у старых max-tokens пауз `maxTokensUsed` тоже есть).

## 7. Сервер: стрим, WS, Redis, Registry
""",
    "L3 09 §6: уроки 14.2",
    marker="### Беседа 14.2 — видимые заголовки вместо перевода ключей",
)

# NEXT-CONTEXT — состояние и ближайшая беседа
patch(
    "NEXT-CONTEXT.md",
    """## Состояние на 2026-10-20 (Фаза 14: 14.1 ЗАКРЫТА 2026-10-20, ближайшая — 14.2; Фаза 13 закрыта; Фаза 15 ждёт)
""",
    """## Состояние на 2026-10-26 (Фаза 14 ЗАКРЫТА 2026-10-26; ближайшая — 15.1; Фаза 13 закрыта)

**14.2 (хранимые тексты и их показ; бэкенд + клиент) ЗАКРЫТА 2026-10-26 —
Фаза 14 закрыта.** Закрыты Д-54, Д-55, Д-57, Д-59, Д-62, Д-76, Д-77; новые —
Д-78 (двойной `pause_marker` плана), Д-79 (копии перечисления подразделов) —
адресат не назначен; реестр §12 — Д-68…Д-75 (Фаза 15) и Д-78, Д-79.
Правило 12.3 теперь сквозное: хранимое — кодом с параметрами (shared
`PauseReasonFields`, `ParseWarning` + `PARSE_WARNING_CODES`,
`GenLogLabel`/`GenLogError`, `FileGenealogyNode.unnamed`), фраза — при
чтении (`server/services/parse-warnings.ts`, `gen-log-labels.ts`,
`lineage-service.fileNodeName`, клиентский `PauseModal.pauseReasonText`);
записи до 14.2 — как есть; `section_label`/`error_message` и выгрузки —
русские (лог и древо выгрузки собираются под `runWithLocale("ru")`).
`STORED_TEXT_EXCLUSIONS` пуст — новая хранимая фраза красит `i18n:check`;
параметры кодов — `names.json` `id: null`. Имена подразделов и разделов
вокруг документа — `subsectionTitles`/`sectionTitle` DTO (`sectionTitlesOf`)
через `client/src/utils/subsection-titles.ts`; ключи `data-section`
машинные. Миграций нет. Тесты: smoke-142 31 ✓, test-142 58 ✓ ×2; сторож
2aw/4bh/5ar; 59 ключей, en/de утверждены. Доки — `patch-docs-conv142.py`
(части I–III).
""",
    "M1 NEXT-CONTEXT: состояние — Фаза 14 закрыта",
    marker="## Состояние на 2026-10-26 (Фаза 14 ЗАКРЫТА 2026-10-26",
)

_nc = ROOT / "NEXT-CONTEXT.md"
_t = _nc.read_text(encoding="utf-8")
_start = _t.find("## Ближайшая беседа — 14.2 (хранимые тексты и их показ; бэкенд + клиент)")
_end = _t.find("## Что 14.1 оставила знать всем беседам")
NEW151 = """## Ближайшая беседа — 15.1 (родословная после импорта: привязка, отвязка, целостность; бэкенд + клиент)

Первая беседа Фазы 15 «Снятие ограничений» — долги Д-68, Д-69, Д-70;
текст беседы и врезка «Фаза 15» — в 07 (решения пользователя 2026-10-14:
отвязка снимает только связь, перекрывающую узел дерева файла, родителя
генерации отвязать нельзя — 409 `LINEAGE_GENERATED`; миграция —
уникальный индекс родословной, номер — следующий свободный, 0014).
Комплект — по шапке 15.1 в 07: §12 строки Д-68…Д-70; «По факту» 3.1, 3.2,
8.5, 8.6, 12.2, 13.2, 14.2 (Д-57: `unnamed` в `file_genealogy`,
`fileNodeName` при чтении, `isUnnamedFileNode` — читатели родословной
обязаны идти через них); `02` §2.3–2.4, `03` (§2.7 родословная), `04`, `05`;
`lineage-service.ts`, `routes/lineage.ts`, `import-service.ts`, клиент
`GenealogyTree`/`LineageSearch`/`utils/genealogy.ts`. Переводы новых строк —
черновики `i18n:import --draft`, утверждает владелец. Сторож — следующая
серия 2ax/4bi/5as.

## Что 14.2 оставила знать всем беседам

- **Хранимый текст = код + параметры, фраза при чтении** — для ВСЕХ
  хранимых фраз (пауза, parseWarnings, журнал, родословная), не только для
  находок рекомендаций 12.3. Новая хранимая фраза в `server/` красит
  `i18n:check --strict`; временно отложить её можно только записью в
  `STORED_TEXT_EXCLUSIONS` с номером долга (список сейчас пуст).
- **Параметры кодов — машинные значения**: имена столбцов/подразделов в
  `pw(…)` описываются `names.json` `id: null`, константы — `MIRROR_EXCLUSIONS`.
- **Записи до смены контракта показываются как есть**: читатели принимают и
  код, и строку (`parseWarningsFromMetadata`, `logLabelText`, легаси-ветка
  `pauseReasonText`); старые данные не переписываются.
- **Старые сторожа при смене контракта правятся через русскую сборку
  читателя**, не снимаются (09 §2, 14.2).
- **Имена подразделов вокруг документа — из `subsectionTitles` DTO**
  (`subsectionTitleFrom`/`useSubsectionTitle`/`documentSectionTitle`), ключи
  `data-section` остаются ключами; `tData` для имён подразделов не заводить.
- **Выгрузка HTML — русское зеркало целиком**: лог и древо предков под
  `runWithLocale("ru")` в `html-exporter`; новый серверный текст в выгрузке —
  русский литерал либо `runWithLocale("ru", …)`.
- **Харнесс с клиентскими модулями** — после их импорта снова
  `installServerCatalogProvider()`; GET /syntheses/:id — `{ synthesis }`;
  немецкий интерфейс в браузере — `users.ui_locale`.

"""
if _start >= 0 and _end > _start and "## Ближайшая беседа — 15.1" not in _t:
    _nc.write_text(_t[:_start] + NEW151 + _t[_end:], encoding="utf-8")
    applied += 1
    print("  ok    M2 NEXT-CONTEXT: ближайшая — 15.1, что оставила 14.2")
else:
    skipped += 1
    print("  skip  M2 NEXT-CONTEXT: ближайшая — 15.1, что оставила 14.2")


print(f"\nприменено {applied}, пропущено {skipped}, ошибок {failed}")
sys.exit(1 if failed else 0)
