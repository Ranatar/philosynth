#!/usr/bin/env python3
"""Патч документации по беседе 15.2 (удаление элементов и подразделов —
вручную и по рекомендации; Д-71, попутно Д-78 и Д-79; бэкенд + клиент).
ЧАСТЬ I — ПЕРВЫЙ ЗАПРОС (2026-11-03):
  A  07 — блок «По факту 15.2 (первый запрос)» после текста беседы: сверка
     текста с кодом (п.0 — перечень ссылок на элемент, решение о
     восстановлении из снимка → Огр-13, решение п.2 о перегенерации),
     пп.1–7, найденное сверх текста, сторож 2ay/4bj/5at, тесты.
  B  03 §2.3 — DELETE подраздела; §2.4 — DELETE категории/тезиса/термина;
     §2.6 — elementDeletes / subsectionDeletes в теле плана; §2.16 —
     «удалить» исполняется шагами; §4.2 — типы шагов delete_element /
     delete_subsection, free += оба.
  C  02 §2.12 — снимок удалённого элемента остаётся (восстановления нет);
     §2.13 — шаги удаления в steps; §2.32 — element_id гаснет при удалении.
  D  04 §4 — строка 15.2.
  E  05 — smoke-152-request1, patch-docs-conv152.
  F  07 §12 — строки Д-71/Д-78/Д-79: состояние «код первого запроса 15.2 —
     ждёт тестовых запросов»; новая строка Огр-13 (восстановления удалённого
     элемента из снимка версии нет).
  G  NEXT-CONTEXT — первый запрос 15.2 исполнен; серия 2ay/4bj/5at занята.
ЧАСТЬ II (H–M, 2026-11-04) — тестовые запросы 2–5 одним заходом
  (test-152-requests2-5: R2 п.1 живьём на импортированном файле-образце,
  R3 пп.3–4 планом из таблицы рекомендаций, R4 п.2 с перегенерацией на
  моке, R5 браузер Chrome 131 на сборке) и сверка доков после сжатия
  контекста: 07 «По факту 15.2 (тестовые запросы 2–5)»; дыры доков —
  01 §4.5 (типы шагов и абзац об удалениях), 03 §1.5 (строка E10),
  NEXT-CONTEXT (правило о бесплатных шагах); 05 — тест; 09 — уроки;
  переводы утверждены (черновиков 0); §12 — состояние строк.
ЧАСТЬ III (N–T, 2026-11-04) — завершение беседы: 07 «По факту 15.2
  (завершение)»; §12 строки Д-71/Д-78/Д-79 → 08 Часть IV; врезка «Фаза 15»
  — 15.2 закрыта, ближайшая 15.3; 08 Части I/II; README; 09 §2 (урок
  патча); NEXT-CONTEXT перезаписан (состояние, ближайшая — 15.3).
Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ; блок «По факту» — по
marker). Запуск из корня:
    python3 scripts/patches/patch-docs-conv152.py
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
    """Полная строка таблицы по началу («| Д-71 |») — для переноса в 08."""
    for line in (ROOT / rel).read_text(encoding="utf-8").splitlines(keepends=True):
        if line.startswith(prefix):
            return line
    return ""


print("ЧАСТЬ I — первый запрос 15.2")

# ── A. 07 — «По факту 15.2 (первый запрос)» ───────────────────────────────
_p07 = ROOT / "docs/07-conversation-protocol.md"
patch(
    "docs/07-conversation-protocol.md",
    """- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10)

---

### Беседа 15.3: Почта — обслуживание очереди и смена адреса (бэкенд + клиент)
""",
    """- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10)

**По факту 15.2 (первый запрос — 2026-11-03).** Вход: HEAD b9d24ea,
`check:dotfiles` чист, `npm install` в самом клоне, PG 16 и Redis в
песочнице (роль/БД заведены заново, миграции 0000–0014 и сиды),
`i18n:check --strict` зелёный. Порядок — п.0 сверка и перечень, затем
сервер (сервисы → маршруты → shared → планировщик → исполнитель →
рекомендации → Д-78/Д-79) → клиент → CSS → сторож → переводы → тесты.

0. **Сверка текста с кодом** (до правок). Совпало всё названное: у
   категории, тезиса и термина — только GET/PATCH, отдельно удалялось лишь
   ребро (`deleteCategoryEdge`); `rowsToPlanActions` отклонял «удалить»
   кодами `delete_element`/`delete_subsection`, клиент метил строку
   «вручную» (`costKindOf` → `manual`, `isSelectableRow` исключал);
   `removeSubsectionHtml` ищет НЕЧЁТКО (взаимное включение имён — «Анализ»
   нашёл бы «Анализ рисков»); `plan-executor` после `createPausedState`
   писал второй `pause_marker` (Д-78); `listSubsections` и
   `subsectionNamesOf` — два одинаковых тела (Д-79).
   **Перечень ссылок на категорию, тезис, термин в БД** (по `schema.ts`):
   с FK — только `category_edges.source_id/target_id` (CASCADE);
   без FK (полиморфный `element_id` либо имя):
   `element_versions.element_id` (история — остаётся),
   `element_enrichments.element_id`, `characteristic_justifications.element_id`
   (категория/связь), `recommendations.element_id` (+ `element_kind`,
   `element` — текст), `theses.related_categories` (имена категорий),
   `categories.cluster_indices` ↔ `cluster_labels.cluster_index` (кластер без
   членов), `edit_plans.steps[].target` «kind:id» (черновики планов),
   снимки в `representation_transforms` и `element_versions.data` (история,
   не трогаются). Текст разделов (`sections.html_content`) ссылается именем —
   по правилу беседы не вычищается.
   **Решение: восстанавливается ли удалённый элемент из снимка версии — НЕТ
   (Огр-13).** `rollbackToVersion` пишет `UPDATE` в живую строку
   (`loadElementRow` → NOT_FOUND без неё); восстановление потребовало бы
   пути `INSERT` со старым id для каждого вида, а рёбра, обогащения и
   обоснования всё равно не вернулись бы (их снимков нет) — не дёшево.
   Снимок остаётся историей (как у ребра с 5.1); кнопка — со вторым шагом
   и предупреждением «восстановить из снимка нельзя». Ограничение заведено
   строкой Огр-13.
   **Решение п.2 — перегенерация раздела с удалённым подразделом:**
   `regenerateSection` пишет раздел моделью заново по `subsection_map` —
   HTML раздела не источник, подраздел ВЕРНЁТСЯ (модель его напишет),
   `missingSubsectionsNote` пропуском его не сочтёт (сверяет ответ модели с
   картой). Удаление подраздела — правка текста, живёт до перегенерации
   раздела; `regen_subsection` удалённого имени тоже вернёт его
   (`spliceSubsectionHtml` при ненайденном добавляет в конец раздела).
   Поэтому удаление и перегенерация одного подраздела в одном плане —
   отказ нормализатора; промпты и карта не тронуты.

1. **`deleteElement(synthesisId, kind, id, { origin })`** (element-editor,
   образец — `deleteCategoryEdge`): одна транзакция; `createVersion`
   (`manual`, шагом плана по рекомендации — `recommendation` с `origin`);
   категория — рёбра каскадом FK (их id и соседи читаются ДО удаления:
   `recomputeReflexive` соседей, обогащения рёбер), `theses.related_categories`
   без имени (сравнение без регистра и краевых пробелов; версия `cascade` у
   тезиса), `cluster_labels` без членов — удаляются; у всех видов —
   `element_enrichments` и `characteristic_justifications` элемента (и его
   рёбер) удаляются, `recommendations.element_id` → NULL («ссылка гаснет»,
   строка остаётся): строки `new`/`stale` → `invalid` кодом
   `target_element_gone` (`withIssueTexts`, замечания-warning сохраняются),
   `planned`/`done`/`rejected` — только ссылка (исполняющий шаг сам
   переведёт в `done`). После транзакции — `renderTables` (категория:
   categories/edges/topology; тезис: theses; термин: glossary) и
   `computeElementImpact` с именем (у тезиса — метка `thesisNameOf`: прежде
   тезис имени не передавал). Ответ `DeleteElementResult { ok, cascade:
   { edgesDeleted, thesesUnlinked, clusterLabelsDeleted,
   recommendationsDetached, enrichmentsDeleted }, impact, version,
   htmlSync }`. Маршруты `DELETE /:id/categories/:catId | /theses/:thesisId |
   /glossary/:termId` — один обработчик-фабрика под `requireAuth` +
   `ownerEditGate` (владелец, активная операция → 409, не-UUID → 404).
   Черновики планов с шагом по удалённому элементу не правятся — шаг
   упадёт NOT_FOUND при исполнении (как и прежде у удалённого ребра).
   Абзац удалённого тезиса в прозе раздела theses остаётся (правило
   «не вычищать»; сводная таблица перерисовывается).

2. **`deleteSubsection(synthesisId, sectionKey, name, { origin })`** —
   паритет `updateSubsection`: строка под `for update`, поиск ТОЧНЫЙ
   (новый `removeExactSubsectionHtml` в html-parser: `findExactSubsection`,
   уходит весь `<div data-section>` с вложенными, их имена возвращаются),
   замок `subsectionLockOf` проверяется у подраздела И у каждого вложенного
   (таблица рендерера / капсула → `SECTION_TABLE_LOCKED`, `details.nestedOf`
   у вложенного), капсула — до поиска; заслон после удаления (ушли ровно
   названные); версия `section` + `html_content` + `is_edited`. Маршрут
   `DELETE /:id/sections/:key/subsections/:name` → `SubsectionDeleteResult
   { ok, sectionKey, name, removedNested, version, section }` (тот же
   `section`, что у PATCH 9.2; сторож 4ar теперь ждёт ровно два пишущих
   маршрута подраздела — на тело раздела по-прежнему ни одного).

3. **Планы.** shared: `EditStepType` += `delete_element` (цель «kind:id») и
   `delete_subsection` («раздел:подраздел»), `FREE_STEP_TYPES` += оба,
   `ELEMENT_STEP_TYPES` += `delete_element`, новые `DELETE_STEP_TYPES`,
   `isDeleteStepType`, `DELETABLE_ELEMENT_KINDS`/`isDeletableElementKind`,
   `parseSubsectionStepTarget`; `CreatePlanRequest` += `elementDeletes`,
   `subsectionDeletes`; `VersionOrigin.stepType` += оба. `normalizeActions`:
   правила правки элемента (хозяин не перегенерируется/не удаляется тем же
   планом, элемент существует, один адресат — один шаг) плюс отказы
   `deleteAndEditSameElement`, `deleteAndRegenSameSubsection`,
   `notDeletableKind` (связь планом не удаляется). `assembleSteps`: шаги
   `delete_element` — РАНЬШЕ правок элементов; `delete_subsection` — на
   месте раздела-хозяина перед его `regen_subsection`. `touchedSectionsOf`
   считает каскад и от удалений. `updatePlan` переносит их
   (`elementDeletesFromSteps`/`subsectionDeletesFromSteps`;
   `elementActionsFromSteps` пропускает `delete_element`). Стоимость — 0.
   Исполнитель: ветки `delete_element`/`delete_subsection` зовут сервисы
   пп.1–2 с `origin` (`deleteOriginOf`); `touchedSectionOf` → каскад от
   хозяина; `delete_subsection` в разделе, которого больше нет, —
   `skipped`; `stepToOp` знает оба; log-formatter кладёт их в «Удалено».

4. **Рекомендации.** `rowsToPlanActions`: «удалить» с найденным элементом →
   `elementDeletes` (те же отказы `section_regenerated`/`same_target`, что у
   правок); без элемента → `subsectionDeletes` по адресу; подраздел раздела,
   идущего на regen, вливается в его довод (перегенерация вернёт его по
   карте); подраздел, который тот же выбор перегенерирует, — отказ
   `same_target` (`sameSubsectionTarget`). Коды отказа `delete_element`/
   `delete_subsection` и их ключи сняты. Клиентское зеркало: `costKindOf` →
   `free` у «удалить», вида `manual` НЕТ (тип `"free" | "paid"`,
   `.rec-cost.manual` и бейдж «исполняется вручную» сняты), пометка
   «удаление · бесплатно» (`costLabelOf`, `.rec-cost.free.delete` красным
   контуром), `isSelectableRow` — любая годная строка, `estimateSelection`
   считает удаления бесплатными и ловит конфликт «удалить + перегенерировать
   один подраздел»; сторож 4au пересчитан на новое правило.

5. **Клиент.** `ElementEditor`: «Удалить» (`.action-btn.danger`) со вторым
   шагом `useSecondStep` («Точно удалить?» + «Отмена», клик мимо снимает,
   `.transform-warn` с предупреждением по виду) — в ОБОИХ режимах (инлайн-
   редактор открывается сразу в правке, «Отмена» там закрывает его);
   только у категории/тезиса/термина (связь — панель связи графа, 8.4);
   после DELETE — состояние «удалено»: сводки и кнопок нет, блок анализа
   влияния со строкой каскада, «Перегенерировать затронутые», «Ничего»
   закрывает редактор; хозяева: `onSaved({ deleted: true, cascade })` —
   SynthesisPage перечитывает разделы (+ граф у категории), GraphModal
   закрывает панель узла. Карточка правки подраздела (SectionView,
   кнопки — часть строки HTML): «Удалить подраздел» → `delete-arm` /
   `delete-disarm` / `delete-confirm` делегированием, состояние
   `deleteArmed`/фаза `deleting` в `SubsectionEditState`, клик мимо
   `[data-subsection-editor]` снимает (эффект SynthesisPage), предупреждение
   называет вложенные; после — перечитка разделов, правка снимается.
   `EditPlanPanel`: подписи «Удалить элемент: категория «Имя»» (без поля) и
   «Удалить подраздел: Раздел → «Имя»», строка `.plan-step-delete` с красной
   кромкой, пометка «бесплатно». API: `deleteElement(kind)` (api/elements),
   `deleteSubsection` (api/sections). CSS — блок «Беседа 15.2» (часть 3,
   до `@tailwind utilities`; без hex/скруглений/теней); css-parity A/B/C = 0.

6. **Попутно.** Д-78: второй `logPauseEvent` в `runPlanSteps` снят —
   маркер паузы плана пишет только `createPausedState` (поля причины);
   импорт `logPauseEvent` из исполнителя убран. Д-79:
   `subsectionNamesOf(html, parse)` в html-parser рядом с `sectionTitlesOf`
   (парсер 1.4 — параметром, цикла нет); `listSubsections` (routes/sections)
   и `subsectionNamesOf` (routes/syntheses) — обёртки в одну строку.

7. **Сторож 2ay/4bj/5at.** 4bj: типы шагов shared ≡ ветки исполнителя ≡
   перенос updatePlan ≡ подписи панели; планировщик «удалить» не отклоняет;
   DELETE-маршруты под гейтом; deleteElement — транзакция со снимком у трёх
   видов, без чистки текста, все ссылки перечня п.0; deleteSubsection —
   точное имя, замки вложенных; один `pause_marker` (Д-78: у исполнителя
   нет `logPauseEvent`, число мест записи — 4); одно перечисление (Д-79:
   в роутах регулярки нет, html-parser не импортирует generation-service);
   клиент (второй шаг, testid, перечитка), CSS-блок, ключи. 5at (живая БД):
   каскад категории по перечню (рёбра, has_reflexive, related_categories +
   версия cascade, метки кластеров, обогащения, рекомендации new/stale →
   invalid / planned — ссылка), снимок, NOT_FOUND повтор, тезис/термин;
   подраздел — SECTION_TABLE_LOCKED (таблица, капсула), NOT_FOUND на
   нечётком, вложенные, is_edited; `rowsToPlanActions` → шаги; createPlan
   (порядок, free=3) → updatePlan → конфликты. Пересчитаны 4at
   (FREE_STEP_TYPES), 4au (зеркало без «manual»), 4ar (два пишущих
   маршрута), 4bb (отказов планировщика два, вызовов decline пять), 4bh
   (sectionTitlesOf ×4), 5ag («удалить» с элементом — бесплатный шаг).
   `INTEGRATION OK` на клоне.

**Найденное сверх текста:** (а) после `renderTables` у категории рендерер
5.1 ДОРИСОВЫВАЕТ отсутствующие «Таблица связей» и «Топологическая таблица»
в раздел graph (outcome appended/created) — поведение 5.1, не 15.2; тест
сверяет состав раздела по вхождению; (б) `elementActionsFromSteps` без
исключения `delete_element` превратил бы шаг удаления в правку при
пересборке (ELEMENT_STEP_TYPES расширен) — закрыто и застолблено 4bj.

**Переводы:** 28 новых ключей (`server.editPlanner.deleteAndEditSameElement`,
`…deleteAndRegenSameSubsection`, `…notDeletableKind`,
`server.planExecutor.badDelete*Target`,
`server.recommendationPlanner.sameSubsectionTarget`, `edit.elementEditor.delete*`,
`edit.editPlanPanel.delete*`, `document.sectionView.delete*`,
`utils.recommendations.deleteFree/elementDeleted/subsectionDeleted/
conflictDeleteRegenSubsection`, `utils.subsectionEdit.deleteFailed`) —
черновики en/de (`i18n:import --draft`), отметку снимает владелец; 9 ключей
сняты `i18n:export --prune` (отказы `delete*Declined`, `kind*Genitive`,
`manually`, `*DeletionManual`, `manualExecution`). **Тесты:**
`tests/smoke-152-request1.mjs` — 44 ✓ (чистые функции, живая БД, маршруты
через `app.request`, исполнение плана с двумя шагами удаления под
бесплатным слотом, пауза плана с одним маркером). `typecheck`, `vite build`,
`check:integration` INTEGRATION OK (2ay/4bj/5at), `check:dotfiles`,
`i18n:check --strict`, css-parity A/B/C = 0. Ждут тестовые запросы 2–5 и
завершение беседы.

---

### Беседа 15.3: Почта — обслуживание очереди и смена адреса (бэкенд + клиент)
""",
    "A1 07: «По факту 15.2 (первый запрос)»",
    marker="**По факту 15.2 (первый запрос — 2026-11-03).**",
)

# ── B. 03 — контракт ──────────────────────────────────────────────────────
patch(
    "docs/03-specification.md",
    """PATCH  /syntheses/:id/sections/:key/subsections/:name   { html }
                                → SubsectionUpdateResult
""",
    """PATCH  /syntheses/:id/sections/:key/subsections/:name   { html }
                                → SubsectionUpdateResult

// 15.2 (Д-71): удаление подраздела — тот же путь, DELETE. Только владелец
// (403), активная операция → 409 GENERATION_IN_PROGRESS; неизвестный ключ /
// нет раздела → 404; подраздел ищется ТОЧНО (нечёткое имя → 404 с
// details.available); запертый подраздел ИЛИ любой вложенный в него
// (таблица рендерера, капсула) → 409 SECTION_TABLE_LOCKED (details.reason,
// table?, subsection, nestedOf? у вложенного). Уходит весь div с
// вложенными; версия 'section' со снимком раздела ДО удаления, is_edited.
// Перегенерация раздела вернёт подраздел, если он есть в карте подразделов
// (удаление — правка текста, живёт до перегенерации); regen_subsection
// удалённого имени тоже вернёт его в конец раздела.
DELETE /syntheses/:id/sections/:key/subsections/:name
                                → SubsectionDeleteResult
                                   { ok: true, sectionKey, name,
                                     removedNested: string[],
                                     version: ElementVersion,
                                     section: { key, htmlContent, isEdited,
                                                subsections, subsectionTitles,
                                                lockedSubsections } }
                                // Клиент (15.2): «Удалить подраздел» в
                                // карточке правки подраздела, второй шаг;
                                // шаг плана delete_subsection зовёт тот же
                                // сервис (deleteSubsection).
""",
    "B1 03 §2.3: DELETE подраздела",
)
patch(
    "docs/03-specification.md",
    """// Все PATCH элементов, DELETE связи и rollback АДДИТИВНО несут
//   version: ElementVersion   — созданная версия-снимок;""",
    """// 15.2 (Д-71): удаление категории, тезиса, термина глоссария — одной
// транзакцией со снимком версии ('manual'; шагом плана по рекомендации —
// 'recommendation' с origin.stepType 'delete_element'). Гейты — как у PATCH
// (владелец, активная операция → 409, не-UUID → 404, повтор → 404). Что
// уходит вслед (каскад): рёбра категории — FK; theses.related_categories
// без имени (версия 'cascade' у тезиса); cluster_labels без членов;
// element_enrichments и characteristic_justifications элемента (и его
// рёбер); recommendations.element_id → NULL («ссылка гаснет»), строки
// new/stale → invalid (target_element_gone). Запертые таблицы
// перерисовываются (htmlSync), упоминания имени в тексте разделов — ТОЛЬКО
// отчётом влияния (impact.severity 'high'), сами не вычищаются.
// element_versions остаются; восстановления удалённого из снимка НЕТ
// (Огр-13: откат пишет UPDATE в живую строку).
DELETE /syntheses/:id/categories/:catId
DELETE /syntheses/:id/theses/:thesisId
DELETE /syntheses/:id/glossary/:termId
                                → DeleteElementResult
                                   { ok: true,
                                     cascade: { edgesDeleted, thesesUnlinked,
                                                clusterLabelsDeleted,
                                                recommendationsDetached,
                                                enrichmentsDeleted },
                                     impact: ImpactAnalysis,
                                     version: ElementVersion,
                                     htmlSync: HtmlSyncInfo }
                                // Клиент (15.2): «Удалить» в редакторе
                                // элемента (второй шаг, предупреждение по
                                // виду), после — состояние «удалено» с
                                // анализом влияния и строкой каскада;
                                // связь удаляется прежним DELETE /edges.

// Все PATCH элементов, DELETE связи и элементов, rollback АДДИТИВНО несут
//   version: ElementVersion   — созданная версия-снимок;""",
    "B2 03 §2.4: DELETE элементов",
)
patch(
    "docs/03-specification.md",
    """                                 elementRefines?: { kind, elementId, field?, note,
                                                    subsection? }[] }
                                → { plan: EditPlan }""",
    """                                 elementRefines?: { kind, elementId, field?, note,
                                                    subsection? }[],
                                 // 15.2 (Д-71) — удаления мельче раздела (бесплатно):
                                 elementDeletes?:    { kind: category|thesis|glossary_term,
                                                       elementId }[],
                                 subsectionDeletes?: { target: "sectionKey:имя" }[] }
                                → { plan: EditPlan }
                                // 15.2: шаги delete_element идут ПЕРЕД правками
                                // элементов, delete_subsection — на месте
                                // раздела-хозяина перед его regen_subsection;
                                // каскад — от хозяина. Отказы 400: элемент тем же
                                // планом и правится, и удаляется; подраздел и
                                // перегенерируется, и удаляется; вид edge (связь
                                // удаляется своим DELETE); хозяин перегенерируется
                                // или удаляется целиком; элемента/подраздела нет.""",
    "B3 03 §2.6: elementDeletes / subsectionDeletes",
)
patch(
    "docs/03-specification.md",
    """       «удалить»                       → declined (шага удаления элемента или
                                         подраздела у планов нет);""",
    """       «удалить» + элемент             → delete_element (бесплатно; 15.2);
       «удалить» без элемента          → delete_subsection адреса (бесплатно;
                                         15.2); в разделе, идущем на regen, —
                                         вливается в его довод; подраздел,
                                         который тот же выбор перегенерирует,
                                         → declined same_target;""",
    "B4 03 §2.16: «удалить» исполняется",
)
patch(
    "docs/03-specification.md",
    """    type: "delete" | "regen" | "add" | "regen_subsection" | "regen_mode"
        | "edit_element" | "refine_element";            // 10.2
    target: string;                // у шагов элемента — "kind:elementId\"""",
    """    type: "delete" | "regen" | "add" | "regen_subsection" | "regen_mode"
        | "edit_element" | "refine_element"             // 10.2
        | "delete_element" | "delete_subsection";       // 15.2 (Д-71): НЕ под
                                   // delete — у того цель различается по «:»
    target: string;                // у шагов элемента — "kind:elementId"
                                   // (delete_element — тоже); delete_subsection —
                                   // "sectionKey:имя\"""",
    "B5 03 §4.2: типы шагов",
)
patch(
    "docs/03-specification.md",
    """  // free — delete и edit_element; paid.costUsd ≡ estimatedCost""",
    """  // free — delete, edit_element и (15.2) delete_element, delete_subsection;
  // paid.costUsd ≡ estimatedCost""",
    "B6 03 §4.2: free-шаги",
)

# ── C. 02 — модель данных ────────────────────────────────────────────────
patch(
    "docs/02-data-model.md",
    """                               -- html_content и is_edited из снимка. Панель VersionHistory (5.2)
                               -- версии разделов НЕ показывает — только API (находка 9.2)""",
    """                               -- html_content и is_edited из снимка. Панель VersionHistory (5.2)
                               -- версии разделов НЕ показывает — только API (находка 9.2).
                               -- 15.2 (Д-71): deleteSubsection пишет такую же версию перед
                               -- удалением подраздела (откат вернёт его); deleteElement — снимок
                               -- удалённой категории/тезиса/термина (как ребро с 5.1): строка
                               -- версии переживает элемент, восстановления из неё НЕТ (Огр-13 —
                               -- откат пишет UPDATE в живую строку); тезис, у которого удаление
                               -- категории сняло имя из related_categories, получает версию
                               -- 'cascade'""",
    "C1 02 §2.12: снимки удаления",
)
patch(
    "docs/02-data-model.md",
    """  steps         JSONB NOT NULL DEFAULT '[]',  -- массив EditStep; с 10.2 — и шаги мельче
                                              -- раздела: edit_element / refine_element
                                              -- (target «kind:elementId», field, value |
                                              -- context, subsection, recommendations[])""",
    """  steps         JSONB NOT NULL DEFAULT '[]',  -- массив EditStep; с 10.2 — и шаги мельче
                                              -- раздела: edit_element / refine_element
                                              -- (target «kind:elementId», field, value |
                                              -- context, subsection, recommendations[]);
                                              -- с 15.2 — delete_element («kind:elementId»)
                                              -- и delete_subsection («sectionKey:имя»),
                                              -- бесплатные; черновик с шагом по уже
                                              -- удалённому элементу не правится — шаг
                                              -- падает NOT_FOUND при исполнении""",
    "C2 02 §2.13: шаги удаления",
)
patch(
    "docs/02-data-model.md",
    """**Удаление.** Синтез удаляется — строки уходят каскадом. Строка `users` в
таблице не участвует: `account-deletion` (7.1) удаляет синтезы владельца,
вопрос 9.1 о FK на users снят. План удалён — `plan_id` обнуляется.""",
    """**Удаление.** Синтез удаляется — строки уходят каскадом. Строка `users` в
таблице не участвует: `account-deletion` (7.1) удаляет синтезы владельца,
вопрос 9.1 о FK на users снят. План удалён — `plan_id` обнуляется.
**Элемент удалён (15.2, `deleteElement`)** — `element_id` → NULL («ссылка
гаснет», строка остаётся; `element_kind` и текст `element` — как были);
строки `new`/`stale` при этом → `invalid` кодом `target_element_gone` (их
бы и так отверг планировщик — `sourceHashFor` → null, — но без пометки
панель показывала бы их годными); `planned` только теряет ссылку —
исполняющий шаг (сам `delete_element` по этой рекомендации) переведёт её в
`done`.""",
    "C3 02 §2.32: element_id при удалении",
)

# ── D. 04 §4 — строка 15.2 ────────────────────────────────────────────────
patch(
    "docs/04-code-reuse-map.md",
    """| `sanitizeWarnings(report)` и `SanitizeHtmlResult.report` в `server/utils/html-parser.ts`;""",
    """| `deleteElement`, `deleteSubsection` в `server/services/element-editor.ts`; `removeExactSubsectionHtml`, `subsectionNamesOf(html, parse)` в `server/utils/html-parser.ts`; `DELETE /:id/{categories,theses,glossary}/:id` (`routes/elements.ts`), `DELETE /:id/sections/:key/subsections/:name` (`routes/sections.ts`); shared `DELETE_STEP_TYPES`, `isDeleteStepType`, `DELETABLE_ELEMENT_KINDS`, `isDeletableElementKind`, `parseSubsectionStepTarget`, `ElementDeleteAction`, `SubsectionDeleteAction`, `DeleteElementResult`, `SubsectionDeleteResult`; `elementDeletes`/`subsectionDeletes` в `edit-planner.ts` (`normalizeActions`, `assembleSteps`, `elementDeletesFromSteps`, `subsectionDeletesFromSteps`), ветки `delete_element`/`delete_subsection` и `deleteOriginOf` в `plan-executor.ts`; `rowsToPlanActions` → `elementDeletes`/`subsectionDeletes`; клиент — `deleteElement` (`api/elements.ts`), `deleteSubsection` (`api/sections.ts`), второй шаг удаления в `ElementEditor.tsx` (`deleteControls`, состояние `deleted`), `delete-arm/disarm/confirm` в `SectionView.tsx` + `deleteSubsectionStep` в `SynthesisPage.tsx`, `isDeleteRow`/`costLabelOf` (`utils/recommendations.ts`), подписи шагов в `EditPlanPanel.tsx` | НОВОЕ (15.2; Д-71 — в исходнике удаления элементов и подразделов нет вовсе; попутно Д-78 — один `pause_marker` плана, Д-79 — одно перечисление подразделов): удаление категории/тезиса/термина одной транзакцией со снимком версии и каскадом по перечню ссылок без FK (рёбра, `related_categories`, метки кластеров, обогащения/обоснования, `recommendations.element_id`), упоминания в тексте — только отчётом влияния; удаление подраздела по точному имени с замками вложенных; шаги плана `delete_element`/`delete_subsection` (бесплатно, не под `delete`); рекомендация «удалить» исполняется ими; восстановления удалённого из снимка нет (Огр-13) |
| `sanitizeWarnings(report)` и `SanitizeHtmlResult.report` в `server/utils/html-parser.ts`;""",
    "D1 04 §4: строка 15.2",
)

# ── E. 05 — файлы ─────────────────────────────────────────────────────────
patch(
    "docs/05-file-structure.md",
    """    │                                   # smoke-151-request1 — 15.1: fileNodeAt/isMetaSynthesisRows, миграция 0014,""",
    """    │                                   # smoke-152-request1 — 15.2: типы шагов, removeExactSubsectionHtml,
    │                                   #  subsectionNamesOf ≡ копиям (Д-79), зеркало клиента, один pause_marker
    │                                   #  (Д-78); живая БД — DELETE категории/тезиса/термина через app.request
    │                                   #  (401/403/404/200, каскад по перечню, снимок, impact high), DELETE
    │                                   #  подраздела (409/404/403/200, вложенные), «удалить» → шаги плана,
    │                                   #  исполнение под бесплатным слотом, origin.stepType, конфликты,
    │                                   #  пауза плана с одним маркером
    │                                   # smoke-151-request1 — 15.1: fileNodeAt/isMetaSynthesisRows, миграция 0014,""",
    "E1 05: smoke-152",
)
patch(
    "docs/05-file-structure.md",
    """│   │                                   # на беседу, patch-docs-conv<NNN>.py; последний — conv142)""",
    """│   │                                   # на беседу, patch-docs-conv<NNN>.py; последний — conv152)""",
    "E2 05: последний патч — conv152",
)

# ── F. 07 §12 — состояние строк и Огр-13 ─────────────────────────────────
_t07 = _p07.read_text(encoding="utf-8")
_changed = False
for num in ("Д-71", "Д-78", "Д-79"):
    head = f"| {num} | "
    i = _t07.find(head)
    if i < 0:
        continue
    j = _t07.find("\n", i)
    row = _t07[i:j]
    if row.endswith("| 15.2 | открыт |"):
        _t07 = _t07[:i] + row[: -len("| 15.2 | открыт |")] + "| 15.2 | открыт — код первого запроса 15.2 (2026-11-03), ждёт тестовых запросов |" + _t07[j:]
        _changed = True
if _changed:
    _p07.write_text(_t07, encoding="utf-8")
    applied += 1
    print("  ok    F1 07 §12: состояние Д-71/Д-78/Д-79")
else:
    skipped += 1
    print("  skip  F1 07 §12: состояние Д-71/Д-78/Д-79")

patch(
    "docs/07-conversation-protocol.md",
    """| Огр-12 | Ключ раунда рекомендаций — проза ПОСЛЕДНЕГО сохранённого раунда""",
    """| Огр-13 | Восстановления удалённого элемента (категории, тезиса, термина) из снимка версии нет: `rollbackToVersion` пишет `UPDATE` в живую строку, восстановление потребовало бы пути `INSERT` со старым id на каждый вид, а рёбра, обогащения и обоснования всё равно не вернулись бы (их снимков нет). Снимок удалённого остаётся историей по `elementId` (как у ребра с 5.1); кнопка удаления — со вторым шагом и предупреждением. Удалённый подраздел откатом версии раздела возвращается | «По факту 15.2» п.0 |
| Огр-12 | Ключ раунда рекомендаций — проза ПОСЛЕДНЕГО сохранённого раунда""",
    "F2 07 §12: Огр-13",
)

# ── G. NEXT-CONTEXT ──────────────────────────────────────────────────────
# После части III (перезапись NEXT-CONTEXT) блоки G1/K2 неприменимы — skip
NEXT_REWRITTEN = "## Состояние на 2026-11-04 (15.2 ЗАКРЫТА" in (ROOT / "NEXT-CONTEXT.md").read_text(encoding="utf-8")
if NEXT_REWRITTEN:
    skipped += 1
    print("  skip  G1 NEXT-CONTEXT: первый запрос 15.2 исполнен")
else:
  patch(
    "NEXT-CONTEXT.md",
    """не ожидается (следующая, если понадобится, — 0015). Сторож — серия
2ay/4bj/5at. Переводы — черновики `--draft`, утверждает владелец.
""",
    """не ожидается (следующая, если понадобится, — 0015). Сторож — серия
2ay/4bj/5at. Переводы — черновики `--draft`, утверждает владелец.

**Первый запрос 15.2 исполнен 2026-11-03** («По факту 15.2 (первый
запрос)» в 07): `deleteElement`/`deleteSubsection` (element-editor),
`DELETE /:id/{categories,theses,glossary}/:id` и `DELETE
…/subsections/:name`, шаги `delete_element`/`delete_subsection` (shared,
планировщик, исполнитель, панель плана), «удалить» в рекомендациях
исполняется ими (клиентское зеркало без «manual»), кнопки со вторым
шагом (ElementEditor, карточка правки подраздела), Д-78 и Д-79 закрыты
кодом; решения п.0: восстановления из снимка нет (Огр-13), перегенерация
раздела возвращает удалённый подраздел по карте. Сторож 2ay/4bj/5at
ЗАНЯТ (следующая серия — 2az/4bk/5au); 28 ключей черновиками en/de, 9
снято `--prune`; тест `smoke-152-request1` 44 ✓. Миграций нет. Ждут
тестовые запросы 2–5 и завершение беседы.
""",
    "G1 NEXT-CONTEXT: первый запрос 15.2 исполнен",
    marker="**Первый запрос 15.2 исполнен 2026-11-03**",
  )

# ══ ЧАСТЬ II — тестовые запросы 2–5 (2026-11-04) ═══════════════════════════
print("\nЧАСТЬ II — тестовые запросы 2–5 15.2")

# ── H. 07 — «По факту 15.2 (тестовые запросы 2–5)» ───────────────────────
patch(
    "docs/07-conversation-protocol.md",
    """`i18n:check --strict`, css-parity A/B/C = 0. Ждут тестовые запросы 2–5 и
завершение беседы.

---

### Беседа 15.3: Почта — обслуживание очереди и смена адреса (бэкенд + клиент)
""",
    """`i18n:check --strict`, css-parity A/B/C = 0. Ждут тестовые запросы 2–5 и
завершение беседы.

**По факту 15.2 (тестовые запросы 2–5 — 2026-11-04, одним заходом по
просьбе пользователя).** Харнесс `tests/test-152-requests2-5.mjs` — живой
сервер :3000 + мок Claude (ретрофит таблицы рекомендаций; перегенерация
раздела — все подразделы карты службы для импортированного документа,
подраздела — один) + сборка клиента под `vite preview` :5228 + Chrome 131;
документ — живой импорт файла-образца `sample/PS-6933-…html`. 75 ✓ ×2.
- **R2 (п.1 живьём, HTTP).** Категория с рёбрами и тезисом-ссылкой (из
  файла: «Архетипический разлом», четыре ребра), подсаженные обогащение и
  обоснование → `DELETE /categories/:id`: 200, снимок `manual`, каскад
  (все рёбра, тезис отвязан, обогащение и обоснование ушли), `severity
  high`, `htmlSync.rendered` — таблицы категорий и связей; в таблице
  строки нет, проза раздела с именем цела; по перечню п.0 висячих ссылок
  нет (рёбра, обогащения, `related_categories`, метки кластеров);
  `GET /categories` без категории и рёбер; повтор → 404, чужой → 403.
  Тезис О-1 и термин глоссария — так же (сводная таблица и таблица
  определений перерисованы из БД).
- **R3 (пп.3–4).** Таблица рекомендаций с четырьмя «удалить» (две категории,
  термин, подраздел «Новизна и ценность» в sum) и «перегенерировать»
  методологию графа. № 4 + № 5 → удаление в перегенерируемом тем же планом
  разделе отклонено `section_regenerated`, план — только regen. № 1–3 →
  план: два `delete_element` и `delete_subsection` первыми, подтверждены,
  с рекомендациями, оценка 0 / free 3; `POST execute` — 200 под бесплатным
  слотом, план `done`, элементов нет, подраздела нет (раздел `is_edited`),
  документ без строк таблиц, рекомендации 1–3 `done` с погашенными
  ссылками, версии `recommendation` с `origin.stepType`
  `delete_element`/`delete_subsection`, `api_usage` не вырос. Удаление и
  перегенерация одного подраздела в одном выборе — удаление отклонено
  `same_target`, перегенерация поставлена.
- **R4 (п.2).** Запертый подраздел («Таблица категорий») → 409
  `SECTION_TABLE_LOCKED`; нечёткое имя → 404 с `details.available`;
  обычный подраздел sum удалён (версия `section` +1, в снимке подраздел
  ещё есть — откат вернёт). `POST /regenerate/sum` после удаления:
  подраздел вернулся вместе со всеми подразделами карты, пометки
  `subsections_missing/renamed` в генлоге нет — решение п.2 подтверждено
  живьём. `POST /regenerate-subsection` удалённого имени возвращает его
  последним в разделе (`spliceSubsectionHtml` при ненайденном —
  в конец).
- **R5 (браузер).** Категория — через граф (таблица категорий заперта:
  «◈ Граф» → 2D → узел → «✎ Редактировать» → модальный редактор):
  «Удалить» → «Точно удалить?» + предупреждение; первый клик не удаляет;
  клик мимо кнопок снимает второй шаг; подтверждение → состояние
  «удалено» со строкой каскада («связей — N»), сводки и кнопок правки нет,
  панель узла закрылась, «Ничего» закрывает редактор, граф перечитан
  (узлов меньше), строка ушла из таблицы категорий документа. Панель
  рекомендаций: строка «удалить» помечена «удаление · бесплатно»
  (`.rec-cost.free.delete`), выбираема, пометок «вручную» нет; выбор
  № 1 + № 2 → «2 шага: 2 бесплатно, 0 платно»; «Собрать план» → модалка с
  рядами `delete_element` («Удалить элемент: категория «…»», «бесплатно»,
  № 1, `.plan-step-delete`; термин — «термин глоссария»), футер «2
  бесплатно». Термин — инлайн-редактором по карандашу (клик мимо снимает,
  строка уходит из таблицы определений, «Ничего» закрывает). Подраздел —
  карточка правки: «Удалить подраздел» → второй шаг с предупреждением,
  клик мимо карточки снимает, подтверждение → подраздела нет ни на
  странице, ни в БД, карточка закрыта, пометка «⟳ изменён». Чужому — ни
  карандашей, ни входа. Ошибок страницы нет.

**Сверка после сжатия контекста** (контекст беседы сжимался на чтении
сторожа, до написания кода; по просьбе пользователя перечитаны места,
от которых зависело сделанное) — найдено и закрыто: (а) `VersionHistory`
для версии с `origin.stepType` `delete_*` писал «значение написано
моделью» (ветка 10.3 знала два типа) — добавлена подпись «удалено (снимок
— состояние до удаления)», ключ
`edit.versionHistory.deletedByRecommendation`; (б) `PauseModal` плана
ждал действие `remove`, а исполнитель кладёт в `failedOp`/`remainingOps`
ТИП шага (`stepToOp`: `delete`) — удаление раздела с 2.2 подписывалось
«Перегенерация:», шаги элементов — сырым «kind:uuid»; теперь `delete` /
`delete_element` / `delete_subsection` — «Удаление:», правки элементов —
«Правка элемента:» (`synthesis.pauseModal.stepElementEdit`), цель элемента
— видом, подраздела — «Раздел → «Имя»». Дыры доков: 01 §4.5 (типы шагов
и абзац 10.2 без удалений), 03 §1.5 (требования без удаления элемента и
подраздела), NEXT-CONTEXT (правило «бесплатные — delete и edit_element»)
— правлены этой частью патча. Остальное (02/03/04/05, сторож, тесты)
сошлось с кодом. Переводы 15.2 утверждены владельцем (черновиков 0; два
ключа сверки — утверждены вместе). Грабли харнесса — 09 §4/§6.

---

### Беседа 15.3: Почта — обслуживание очереди и смена адреса (бэкенд + клиент)
""",
    "H1 07: «По факту 15.2 (тестовые запросы 2–5)»",
    marker="**По факту 15.2 (тестовые запросы 2–5 — 2026-11-04",
)

# ── I. 01 §4.5 — типы шагов и абзац об удалениях ─────────────────────────
patch(
    "docs/01-architecture.md",
    """  type: "delete" | "regen" | "add" | "regen_subsection" | "regen_mode"
      | "edit_element" | "refine_element";     // 10.2 — шаги мельче раздела
  target: string;          // sectionKey | "sectionKey:subsectionName" |
                           // "modeKey:index" | "kind:elementId" (10.2)""",
    """  type: "delete" | "regen" | "add" | "regen_subsection" | "regen_mode"
      | "edit_element" | "refine_element"      // 10.2 — шаги мельче раздела
      | "delete_element" | "delete_subsection"; // 15.2 — удаления мельче раздела
  target: string;          // sectionKey | "sectionKey:subsectionName" |
                           // "modeKey:index" | "kind:elementId" (10.2, 15.2)""",
    "I1 01 §4.5: типы шагов",
)
patch(
    "docs/01-architecture.md",
    """**Шаги мельче раздела (беседа 10.2).** `edit_element` применяет ГОТОВЫЙ текст к""",
    """**Удаления мельче раздела (беседа 15.2, Д-71).** `delete_element`
(категория, тезис, термин глоссария — цель «kind:elementId») и
`delete_subsection` («sectionKey:имя») — отдельные типы, НЕ под `delete`:
у того цель различается по «:» (раздел либо результат режима), и шаг
элемента был бы принят за режимный. Оба бесплатны (`FREE_STEP_TYPES`),
зовут те же сервисы, что кнопки редактора (`deleteElement` — транзакция со
снимком версии и каскадом по ссылкам без FK; `deleteSubsection` — точное
имя, замки вложенных, версия раздела); каскад — от раздела-хозяина;
`delete_element` исполняется раньше правок элементов, `delete_subsection`
— на месте хозяина перед его `regen_subsection`. Рекомендация «удалить»
исполняется ими. Запрещено одним планом: правка и удаление одного
элемента, перегенерация и удаление одного подраздела, удаление в разделе,
который тот же план перегенерирует или удаляет целиком. Восстановления
удалённого элемента из снимка нет (Огр-13); удалённый подраздел
перегенерация раздела возвращает по карте подразделов.

**Шаги мельче раздела (беседа 10.2).** `edit_element` применяет ГОТОВЫЙ текст к""",
    "I2 01 §4.5: абзац об удалениях",
)

# ── J. 03 §1.5 — требование E10 ──────────────────────────────────────────
patch(
    "docs/03-specification.md",
    """| E9 | Версионирование элементов с откатом | Фаза 5 |
""",
    """| E9 | Версионирование элементов с откатом | Фаза 5 |
| E10 | Удаление элемента (категория, тезис, термин) и подраздела — вручную (кнопка со вторым шагом, отчёт влияния) и шагом плана по рекомендации «удалить» (`delete_element` / `delete_subsection`, бесплатно); снимок версии остаётся, восстановления из него нет (Огр-13); запертые подразделы не удаляются; упоминания в тексте не вычищаются | Фаза 15 — СДЕЛАНО 15.2 |
""",
    "J1 03 §1.5: E10",
)

# ── K. NEXT-CONTEXT — правило о бесплатных шагах и состояние ─────────────
patch(
    "NEXT-CONTEXT.md",
    """- **Бесплатные шаги — `delete` и `edit_element`** (`FREE_STEP_TYPES`): план без""",
    """- **Бесплатные шаги — `delete`, `edit_element` и (15.2) `delete_element`,
  `delete_subsection`** (`FREE_STEP_TYPES`): план без""",
    "K1 NEXT-CONTEXT: правило о бесплатных шагах",
)
if NEXT_REWRITTEN:
    skipped += 1
    print("  skip  K2 NEXT-CONTEXT: тестовые запросы 2–5")
else:
  patch(
    "NEXT-CONTEXT.md",
    """снято `--prune`; тест `smoke-152-request1` 44 ✓. Миграций нет. Ждут
тестовые запросы 2–5 и завершение беседы.
""",
    """снято `--prune`; тест `smoke-152-request1` 44 ✓. Миграций нет.
**Тестовые запросы 2–5 исполнены 2026-11-04** одним заходом
(`test-152-requests2-5` 75 ✓ ×2: п.1 живьём на импортированном образце,
пп.3–4 планом из таблицы рекомендаций, п.2 с перегенерацией на моке —
подраздел возвращается по карте, браузер Chrome 131 на сборке), переводы
утверждены (черновиков 0); сверкой после сжатия контекста закрыты подписи
`VersionHistory` (origin `delete_*`) и `PauseModal` (действие шага —
типом), дыры 01 §4.5 / 03 §1.5 / правило NEXT-CONTEXT. Ждёт завершение
беседы.
""",
    "K2 NEXT-CONTEXT: тестовые запросы 2–5",
  )

# ── L. 05 — тест ────────────────────────────────────────────────────────
patch(
    "docs/05-file-structure.md",
    """    │                                   # smoke-152-request1 — 15.2: типы шагов, removeExactSubsectionHtml,""",
    """    │                                   # test-152-requests2-5 — 15.2: R2 п.1 живьём на импортированном
    │                                   #  образце (каскад по перечню, перерисовка, 403/404); R3 пп.3–4 —
    │                                   #  «удалить» из таблицы рекомендаций планом (отказ section_regenerated,
    │                                   #  исполнение под бесплатным слотом, origin.stepType, same_target);
    │                                   #  R4 п.2 — замок, точное имя, перегенерация возвращает подраздел по
    │                                   #  карте (мок), regen_subsection — в конец; R5 браузер Chrome 131 на
    │                                   #  сборке — второй шаг (граф → узел, инлайн, карточка подраздела),
    │                                   #  отчёт влияния, панель рекомендаций и ряды плана
    │                                   # smoke-152-request1 — 15.2: типы шагов, removeExactSubsectionHtml,""",
    "L1 05: test-152",
)

# ── M. 09 — уроки харнесса и клиента ────────────────────────────────────
patch(
    "docs/09-lessons.md",
    """## 5. Node, TypeScript, сборка
""",
    """### Беседа 15.2 — живой образец, мок по карте, Chrome из окружения
1. **`CHROME_PATH` окружения может указывать не туда**: в песочнице он был
   задан на системный Chrome 153 — харнесс честно поднял его, и лишь
   строка «(браузер: …)» в логе выдала подмену. Перед прогоном проверять
   `echo $CHROME_PATH`; задавать его явно на
   `~/.cache/puppeteer/chrome/linux-131…/chrome` (09 §4: харнессы ждут
   ТОЛЬКО 131).
2. **Мок модели для перегенерации «любого» раздела — по карте службы**:
   `buildSectionDefs`/`buildSubsectionMap` на параметрах импортированной
   строки `syntheses` (+ философы из родословной), в задании искать
   `— TITLE` определения раздела и отвечать всеми подразделами карты.
   Так перегенерация после удаления подраздела проверяется без хардкода
   имён.
3. **Маршруты (пере)генерации отвечают 200 ДО старта**: `waitIdle` по
   `status === 'ready'` возвращается сразу, а следующий запрос ловит 409
   `GENERATION_IN_PROGRESS`. Ждать новую строку `generation_log` раздела
   (created_at > t0) не в `streaming`, потом `ready`.
4. **Имена элементов живого файла ≠ ячейкам таблицы**: термин глоссария в
   HTML — `<strong>имя</strong> <em>(пояснение)</em>`, в БД — плоский текст
   обоих; разбор 1.4 берёт термины и из соседних таблиц. Сверять по тексту
   без тегов и выбирать элемент, чья строка стоит в нужной таблице.
5. **Таблица категорий карандашей не имеет** (заперта рендерером): в
   браузере редактор категории открывается только через граф («◈ Граф» →
   2D → `.node-g` → «✎ Редактировать», панель `.gm-info-panel`); инлайн-
   карандаши — у тезисов и терминов. Клик «мимо» в модальном редакторе —
   по его заголовку: клик по оверлею закрывает редактор целиком.

## 5. Node, TypeScript, сборка
""",
    "M1 09 §4: уроки харнесса 15.2",
)
patch(
    "docs/09-lessons.md",
    """## 7. Сервер: стрим, WS, Redis, Registry
""",
    """### Беседа 15.2 — удаление в редакторе и ветки по типу шага
1. **Новый тип шага трогает все ветки `switch`/тернарии по типу, не только
   исполнитель**: `VersionHistory` (подпись origin), `PauseModal` (подпись
   действия паузы — там обнаружилось, что исполнитель шлёт ТИП шага, а
   клиент с 2.2 ждал `remove`), `EditPlanPanel`, `log-formatter`. Сторож
   4bj сверяет shared ≡ исполнитель ≡ `updatePlan` ≡ панель; подписи
   второго ряда — глазами при сверке.
2. **Кнопка удаления стоит в обоих режимах редактора**: инлайн-редактор
   открывается сразу в правке, а «Отмена» там закрывает его — кнопка только
   в просмотре была бы недостижима без сохранения.
3. **Второй шаг в строке HTML раздела** (карточка подраздела): состояние
   `deleteArmed` живёт у хозяина, кнопки — `data-subsection-action`
   делегированием, «клик мимо» — эффект `mousedown` документа с проверкой
   `closest("[data-subsection-editor]")`; `useSecondStep` там неприменим.

## 7. Сервер: стрим, WS, Redis, Registry
""",
    "M2 09 §6: уроки клиента 15.2",
)

# §12 — состояние строк после тестов
_t07b = _p07.read_text(encoding="utf-8")
_old = "| 15.2 | открыт — код первого запроса 15.2 (2026-11-03), ждёт тестовых запросов |"
_new = "| 15.2 | открыт — код и тесты 15.2 (2026-11-04), ждёт завершения беседы |"
if _old in _t07b:
    _p07.write_text(_t07b.replace(_old, _new), encoding="utf-8")
    applied += 1
    print("  ok    M3 07 §12: состояние Д-71/Д-78/Д-79 после тестов")
else:
    skipped += 1
    print("  skip  M3 07 §12: состояние Д-71/Д-78/Д-79 после тестов")

# ══ ЧАСТЬ III — завершение беседы 15.2 (2026-11-04) ═══════════════════════
print("\nЧАСТЬ III — завершение беседы 15.2")

PF3 = """**По факту 15.2 (завершение — 2026-11-04).** Ревью TODO и заглушек:
в файлах беседы новых меток нет (найденные `TODO(1.3)`, «заглушка 1.7
снята» — старые, закрытые). Завершение: `typecheck` 0 ошибок, `vite
build`, `check:dotfiles`, `i18n:check --strict` (черновиков 0),
css-parity 0/586 (A/B/C = 0), `check:integration` INTEGRATION OK на свежем
клоне (2ay/4bj/5at); smoke-152 44 ✓, test-152-requests2-5 75 ✓ ×2. Строки
Д-71, Д-78, Д-79 → 08 Часть IV; новая строка ограничений Огр-13
(восстановления удалённого элемента из снимка нет). Реестр §12 — Д-72,
Д-73 (15.3), Д-74, Д-75 (15.4). Беседа 15.2 ЗАКРЫТА 2026-11-04;
ближайшая — 15.3. Вся беседа — одним коммитом по просьбе пользователя.

"""
patch(
    "docs/07-conversation-protocol.md",
    """— правлены этой частью патча. Остальное (02/03/04/05, сторож, тесты)
сошлось с кодом. Переводы 15.2 утверждены владельцем (черновиков 0; два
ключа сверки — утверждены вместе). Грабли харнесса — 09 §4/§6.

""",
    """— правлены этой частью патча. Остальное (02/03/04/05, сторож, тесты)
сошлось с кодом. Переводы 15.2 утверждены владельцем (черновиков 0; два
ключа сверки — утверждены вместе). Грабли харнесса — 09 §4/§6.

""" + PF3,
    "N1 07: «По факту 15.2 (завершение)»",
    marker="**По факту 15.2 (завершение — 2026-11-04).**",
)

# §12 → 08 Часть IV
CLOSED = {
    "| Д-71 |": "ЗАКРЫТ 15.2 (2026-11-04): `deleteElement` (категория/тезис/термин — транзакция со снимком, каскад: рёбра FK, `related_categories`, метки кластеров, обогащения/обоснования, `recommendations.element_id → NULL` + invalid у new/stale; таблицы перерисованы, текст — только отчёт влияния) и `deleteSubsection` (точное имя, замки вложенных, версия section); `DELETE /:id/{categories,theses,glossary}/:id`, `DELETE …/subsections/:name`; шаги `delete_element`/`delete_subsection` (бесплатные, не под `delete`) в shared/планировщике/исполнителе/панели; «удалить» в рекомендациях исполняется ими, зеркало без «вручную»; кнопки со вторым шагом (редактор элемента в обоих режимах, карточка подраздела); восстановления из снимка нет — Огр-13; smoke-152 44 ✓, test-152 75 ✓ ×2",
    "| Д-78 |": "ЗАКРЫТ 15.2 (2026-11-04): второй `logPauseEvent` в `runPlanSteps` снят — маркер паузы плана пишет только `createPausedState` (поля причины); сторож 4bj-д (у исполнителя нет `logPauseEvent`, мест записи `pause_marker` — 4), smoke B25 — пауза плана с одним маркером",
    "| Д-79 |": "ЗАКРЫТ 15.2 (2026-11-04): `subsectionNamesOf(html, parse)` в `server/utils/html-parser.ts` рядом с `sectionTitlesOf` (парсер 1.4 — параметром, цикла нет); `listSubsections` (routes/sections) и `subsectionNamesOf` (routes/syntheses) — обёртки в строку; сторож 4bj-е (в роутах регулярки нет, html-parser не импортирует generation-service), smoke A6/A7",
}
rows_08 = []
for prefix, verdict in CLOSED.items():
    row = row_of("docs/07-conversation-protocol.md", prefix)
    if not row:
        continue
    cells = [c.strip() for c in row.strip().strip("|").split("|")]
    short = cells[2].split("**")[1] if "**" in cells[2] else cells[2][:120]
    rows_08.append(f"| {cells[0]} — {short.rstrip('.')} | 15.2 | {cells[3]} | {verdict} |\n")
if rows_08:
    _p08 = ROOT / "docs/08-history.md"
    _t08 = _p08.read_text(encoding="utf-8")
    _anchor = row_of("docs/08-history.md", "| Д-80 — ")
    if _anchor and "| Д-71 — " not in _t08:
        _p08.write_text(_t08.replace(_anchor, _anchor + "".join(rows_08), 1), encoding="utf-8")
        applied += 1
        print("  ok    O1 08 Часть IV: закрытые строки 15.2")
    else:
        skipped += 1
        print("  skip  O1 08 Часть IV: закрытые строки 15.2")
else:
    skipped += 1
    print("  skip  O1 08 Часть IV: закрытые строки 15.2")
for prefix in CLOSED:
    row = row_of("docs/07-conversation-protocol.md", prefix)
    if row:
        remove("docs/07-conversation-protocol.md", row, f"O2 07 §12: снята строка {prefix.strip('| ')}")
    else:
        skipped += 1
        print(f"  skip  O2 07 §12: снята строка {prefix.strip('| ')}")

# журнал §12 — строка о закрытии
patch(
    "docs/07-conversation-protocol.md",
    """   При закрытии 13.1 (2026-10-20) сняты Д-63 и Д-64 (в 08 Часть IV);
   новых долгов беседа не оставила, строк «не назначен» нет.
""",
    """   При закрытии 13.1 (2026-10-20) сняты Д-63 и Д-64 (в 08 Часть IV);
   новых долгов беседа не оставила, строк «не назначен» нет.
   При закрытии 15.2 (2026-11-04) сняты Д-71, Д-78, Д-79 (в 08 Часть IV);
   заведено ограничение Огр-13 (восстановления удалённого элемента из
   снимка нет); новых долгов нет, строк «не назначен» нет; в реестре —
   Д-72, Д-73 (15.3), Д-74, Д-75 (15.4).
""",
    "O3 07 §12: журнал — закрытие 15.2",
)

# врезка «Фаза 15»
patch(
    "docs/07-conversation-protocol.md",
    """> **15.1 закрыта 2026-10-27** (Д-68, Д-69, Д-70; попутно Д-80 — заведён
> и закрыт той же беседой). Д-78/Д-79 (найдены сверкой 14.2) получили
> адресат 15.2. Ближайшая — 15.2.
>""",
    """> **15.1 закрыта 2026-10-27** (Д-68, Д-69, Д-70; попутно Д-80 — заведён
> и закрыт той же беседой). Д-78/Д-79 (найдены сверкой 14.2) получили
> адресат 15.2. **15.2 закрыта 2026-11-04** (Д-71; попутно Д-78, Д-79;
> ограничение Огр-13 — восстановления удалённого элемента из снимка нет).
> Ближайшая — 15.3.
>""",
    "P1 07: врезка «Фаза 15» — 15.2 закрыта",
)

# 08 Часть I и Часть II
patch(
    "docs/08-history.md",
    """сторож 2ax/4bi/5as, smoke-151 24 ✓, test-151 23 ✓ + 42 ✓ ×2; Д-78/Д-79 →
15.2; доки — patch-docs-conv151.py; ближайшая — 15.2.
""",
    """сторож 2ax/4bi/5as, smoke-151 24 ✓, test-151 23 ✓ + 42 ✓ ×2; Д-78/Д-79 →
15.2; доки — patch-docs-conv151.py; ближайшая — 15.2.
Беседа 15.2 (удаление элементов и подразделов — вручную и по
рекомендации; бэкенд + клиент) ЗАКРЫТА 2026-11-04. Д-71: `deleteElement`
(категория/тезис/термин — одна транзакция со снимком версии, каскад по
перечню ссылок без FK: рёбра, `related_categories`, метки кластеров,
обогащения/обоснования, `recommendations.element_id`; таблицы
перерисованы, упоминания в тексте — только отчётом влияния) и
`deleteSubsection` (точное имя, замки вложенных, версия раздела);
маршруты DELETE; шаги плана `delete_element`/`delete_subsection`
(бесплатные, не под `delete`), «удалить» в рекомендациях исполняется ими;
кнопки со вторым шагом; Огр-13 — восстановления из снимка нет;
перегенерация раздела возвращает удалённый подраздел по карте. Попутно
Д-78 (один `pause_marker` плана) и Д-79 (одно перечисление подразделов —
`subsectionNamesOf`). 30 ключей (утверждены), 9 снято, сторож
2ay/4bj/5at, smoke-152 44 ✓, test-152 75 ✓ ×2; сверка после сжатия
контекста закрыла подписи `VersionHistory`/`PauseModal` и дыры 01 §4.5 /
03 §1.5; доки — patch-docs-conv152.py (три части); ближайшая — 15.3.
""",
    "Q1 08 Часть I: 15.2 закрыта",
    marker="Беседа 15.2 (удаление элементов и подразделов — вручную и по",
)

CH152 = """### Беседа 15.2 — Удаление элементов и подразделов: вручную и по рекомендации (бэкенд + клиент) [ЗАКРЫТА 2026-11-04]

**Вход:** HEAD b9d24ea, `check:dotfiles` чист, `npm install` в самом клоне,
PG 16 и Redis в песочнице (роль/БД заведены заново), Chrome 131 из
`chrome/`. Вторая беседа Фазы 15: Д-71 (был Огр-3), попутно Д-78, Д-79.
Решения пользователя: новые типы шагов `delete_element`/`delete_subsection`
отдельно от `delete`; упоминания удалённого в тексте разделов не
вычищать — только отчёт влияния и каскад; первым ходом — перечень всех
ссылок на элемент и решение о восстановлении из снимка; браузер — на
сборке; переводы — черновики, утверждает владелец; вся беседа — одним
коммитом.

**Ход.** П.0: перечень ссылок (FK — только рёбра; без FK — версии,
обогащения, обоснования, `recommendations.element_id`,
`related_categories`, `cluster_labels`, черновики планов); восстановления
удалённого из снимка нет (Огр-13: откат пишет UPDATE в живую строку);
перегенерация раздела возвращает удалённый подраздел по карте (HTML не
источник). Сервер: `deleteElement` (транзакция, снимок `manual`/
`recommendation` с origin, каскад, `renderTables`, `computeElementImpact`),
`deleteSubsection` (точное имя — новый `removeExactSubsectionHtml`, замки
подраздела и вложенных, версия `section`), маршруты DELETE под гейтом
владельца; shared — `DELETE_STEP_TYPES`, `FREE_STEP_TYPES` += оба,
`parseSubsectionStepTarget`, `ElementDeleteAction`/`SubsectionDeleteAction`;
планировщик — отказы «правка+удаление», «перегенерация+удаление
подраздела», вид edge; порядок (удаления элементов первыми); перенос в
`updatePlan`; исполнитель — ветки с `deleteOriginOf`; `rowsToPlanActions`
исполняет «удалить» (отказы `delete_*` сняты). Клиент: «Удалить» со вторым
шагом в редакторе элемента в обоих режимах и состояние «удалено» с
каскадом; «Удалить подраздел» в карточке правки (делегирование,
`deleteArmed`, клик мимо снимает); ряды плана; зеркало рекомендаций без
«вручную» («удаление · бесплатно»); CSS блоком 15.2. Д-78: второй маркер
паузы снят; Д-79: `subsectionNamesOf(html, parse)` в html-parser.
Сверка после сжатия контекста закрыла подписи `VersionHistory` (origin
`delete_*`) и `PauseModal` (действие шага — типом; с 2.2 удаление раздела
подписывалось «Перегенерация»). Сторож 2ay/4bj/5at; пересчитаны
4at/4au/4ar/4bb/4bh/5ag. Переводы: 30 ключей утверждены, 9 сняты.

**Тесты.** smoke-152 44 ✓ (чистые функции, живая БД, маршруты через
`app.request`, план с двумя шагами удаления под бесплатным слотом, пауза с
одним маркером); test-152-requests2-5 75 ✓ ×2: R2 п.1 на импортированном
файле-образце, R3 пп.3–4 планом из таблицы рекомендаций, R4 п.2 с
перегенерацией на моке по карте службы, R5 браузер (граф → узел →
редактор, инлайн-термин, карточка подраздела, панель рекомендаций и ряды
плана).

**Завершение.** Регрессия на свежем клоне зелёная; Д-71, Д-78, Д-79 → 08
Часть IV; Огр-13 заведён; доки — `patch-docs-conv152.py` (три части).
Ближайшая — 15.3.

"""
patch(
    "docs/08-history.md",
    """### Беседа 15.1 — Родословная после импорта: привязка, отвязка, целостность (бэкенд + клиент) [ЗАКРЫТА 2026-10-27]
""",
    CH152 + """### Беседа 15.1 — Родословная после импорта: привязка, отвязка, целостность (бэкенд + клиент) [ЗАКРЫТА 2026-10-27]
""",
    "Q2 08 Часть II: глава 15.2",
    marker="### Беседа 15.2 — Удаление элементов и подразделов",
)

# README
patch(
    "README.md",
    """15.1 (привязка к узлу дерева файла, отвязка поверх узла файла, уникальность пары родословной, одно правило «мета»; Д-68, Д-69, Д-70, попутно Д-80) — закрыта 10-27; ближайшая — 15.2 |""",
    """15.1 (привязка к узлу дерева файла, отвязка поверх узла файла, уникальность пары родословной, одно правило «мета»; Д-68, Д-69, Д-70, попутно Д-80) — закрыта 10-27; 15.2 (удаление категории/тезиса/термина и подраздела вручную и шагами плана `delete_element`/`delete_subsection`, «удалить» в рекомендациях исполняется; Д-71, попутно Д-78, Д-79; Огр-13) — закрыта 11-04; ближайшая — 15.3 |""",
    "R1 README: 15.2 закрыта",
)

# 09 §2 — урок патча
patch(
    "docs/09-lessons.md",
    """## 3. PostgreSQL, Drizzle, данные""",
    """### Беседа 15.2 — тот же дубль NEXT-CONTEXT второй раз
1. **Урок 15.1 §2 п.2 повторился буквально**: блок G1 (первый запрос) без
   `marker`, его `new` позже дописан блоком K2 — второй прогон вставил
   абзац «Первый запрос исполнен» повторно. Правило теперь механическое:
   у КАЖДОГО patch(), чей `new` когда-либо станет якорем или будет
   редактироваться, — `marker` с первой строки `new`; проверка — три
   прогона подряд должны дать «применено 0».

## 3. PostgreSQL, Drizzle, данные""",
    "S1 09 §2: урок патча 15.2",
)

# NEXT-CONTEXT — перезапись: состояние и ближайшая 15.3
_pn = ROOT / "NEXT-CONTEXT.md"
_tn = _pn.read_text(encoding="utf-8")
if "## Состояние на 2026-11-04 (15.2 ЗАКРЫТА" in _tn:
    skipped += 1
    print("  skip  T1 NEXT-CONTEXT: состояние и ближайшая 15.3")
else:
    i = _tn.index("## Ближайшая беседа — 15.2 (удаление элементов и подразделов: вручную и по рекомендации; бэкенд + клиент)")
    j = _tn.index("## Беседа 15.1 (ЗАКРЫТА 2026-10-27) — что было комплектом")
    near = """## Ближайшая беседа — 15.3 (почта: обслуживание очереди и смена адреса; бэкенд + клиент)

Третья беседа Фазы 15 — Д-72 (чистка `mail_outbox`/`auth_tokens`/
истёкших сессий проходом работника реже основного цикла, сроки — env;
выравнивание времени ответа формы сброса и холостое bcrypt на входе;
вкладка «Почта» админки — счётчики и последние строки без тел) и Д-73
(смена адреса: запрос с паролем → токен нового назначения
`auth_tokens.purpose += email_change` с новым адресом в строке токена —
миграция 0015; письмо на новый адрес и уведомление на старый;
подтверждение меняет адрес, ставит подтверждённым, гасит токены сброса;
ответ на занятый адрес неотличим от свободного; письма под языком
получателя; клиент — форма в ProfilePage и страница подтверждения). Текст
беседы и комплект — в 07 (§12 строки Д-72, Д-73; врезка «Фаза 15»; «По
факту» 0.5, 8.1, 9.1, 13.2, 14.1). Миграция — 0015 (сторож места по
журналу). Сторож — серия 2az/4bk/5au. Переводы — черновики `--draft`,
утверждает владелец; новые env — в `.env.example` и deploy/* (dotfile-
грабля).

## Беседа 15.2 (ЗАКРЫТА 2026-11-04) — что было комплектом

Вторая беседа Фазы 15 — Д-71 (удаление элемента и подраздела вручную и по
рекомендации), попутно Д-78 (один `pause_marker` плана) и Д-79 (одно
перечисление подразделов). Первый запрос — 2026-11-03: `deleteElement`/
`deleteSubsection`, DELETE-маршруты, шаги `delete_element`/
`delete_subsection`, «удалить» в рекомендациях исполняется ими, кнопки со
вторым шагом, CSS-блок 15.2, 28 ключей черновиками, сторож 2ay/4bj/5at,
smoke-152 44 ✓. Тестовые запросы 2–5 — 2026-11-04 одним заходом
(test-152-requests2-5 75 ✓ ×2), переводы утверждены; сверка после сжатия
контекста закрыла подписи `VersionHistory`/`PauseModal` и дыры 01 §4.5 /
03 §1.5 / правило NEXT-CONTEXT. Завершение — 2026-11-04: регрессия на
свежем клоне, Д-71/Д-78/Д-79 → 08 Часть IV, Огр-13, один коммит.

"""
    _tn = _tn[:i] + near + _tn[j:]
    state = """## Состояние на 2026-11-04 (15.2 ЗАКРЫТА 2026-11-04; ближайшая — 15.3; Фаза 14 закрыта)

**15.2 (удаление элементов и подразделов — вручную и по рекомендации;
бэкенд + клиент) ЗАКРЫТА 2026-11-04.** Закрыты Д-71, Д-78, Д-79; заведено
ограничение Огр-13 (восстановления удалённого элемента из снимка версии
нет — откат пишет UPDATE в живую строку); реестр §12 — Д-72, Д-73 (15.3),
Д-74, Д-75 (15.4). Инварианты удаления: категория/тезис/термин удаляются
одной транзакцией со снимком (`manual`, шагом плана — `recommendation` с
`origin.stepType delete_element`), каскад по перечню ссылок без FK (рёбра
FK + `has_reflexive` соседей, `related_categories` с версией `cascade`,
метки кластеров без членов, обогащения/обоснования, `recommendations.
element_id → NULL`, new/stale → invalid `target_element_gone`), запертые
таблицы перерисовываются, упоминания в тексте — только отчётом влияния;
подраздел удаляется по точному имени (`removeExactSubsectionHtml`),
запертый или с запертым вложенным — 409, версия `section`; перегенерация
раздела возвращает удалённый подраздел по карте, `regen_subsection`
удалённого имени — в конец раздела. Шаги `delete_element`/
`delete_subsection` — бесплатны, не под `delete`, первыми / на месте
хозяина, каскад от хозяина; запрещено одним планом правка+удаление
элемента, перегенерация+удаление подраздела, удаление в перегенерируемом
разделе, вид edge. Зеркало рекомендаций: вида «вручную» нет, «удалить» —
«удаление · бесплатно». Исполнитель кладёт в `failedOp`/`remainingOps`
ТИП шага (`PauseModal` с 15.2 это знает). Сторож 2ay/4bj/5at (следующая
серия — 2az/4bk/5au); миграций нет (следующая — 0015); 30 ключей
утверждены; тесты smoke-152 44 ✓, test-152-requests2-5 75 ✓ ×2. Доки —
`patch-docs-conv152.py` (три части).

"""
    k = _tn.index("## Состояние на 2026-10-27 (15.1 ЗАКРЫТА 2026-10-27; ближайшая — 15.2; Фаза 14 закрыта)")
    _tn = _tn[:k] + state + _tn[k:].replace("## Состояние на 2026-10-27 (15.1 ЗАКРЫТА 2026-10-27; ближайшая — 15.2; Фаза 14 закрыта)", "## Состояние на 2026-10-27 (15.1 ЗАКРЫТА 2026-10-27; Фаза 14 закрыта)", 1)
    _pn.write_text(_tn, encoding="utf-8")
    applied += 1
    print("  ok    T1 NEXT-CONTEXT: состояние и ближайшая 15.3")

print(f"\nитог: применено {applied}, пропущено {skipped}, ошибок {failed}")
sys.exit(1 if failed else 0)
