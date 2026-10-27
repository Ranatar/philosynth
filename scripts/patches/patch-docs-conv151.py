#!/usr/bin/env python3
"""Патч документации по беседе 15.1 (родословная после импорта: привязка к
узлу дерева файла — Д-68, отвязка — Д-69, целостность связей — Д-70;
бэкенд + клиент).
ЧАСТЬ I — ПЕРВЫЙ ЗАПРОС (2026-10-27):
  A  07 — блок «По факту 15.1 (первый запрос)» после текста беседы: сверка
     текста с кодом (п.0), решение по правилу «мета» с доводом, найденное
     сверх текста, сторож 2ax/4bi/5as, тесты.
  B  03 §2.8 — position в POST /lineage/link; GET …/file-node/:position/
     candidates; DELETE …/lineage/link/:parentSynthesisId; «Отвязки нет» снято.
     §4.3 — коды LINEAGE_NODE_UNAVAILABLE, LINEAGE_GENERATED; у 07 15.1
     «03 §2.1 — код» → «03 §4.3».
  C  02 §2.4 — частичный уникальный индекс uq_lineage_parent_pair (0014),
     правило отвязки, одно правило «мета-синтез».
  D  04 §4 — строка 15.1.
  E  05 — миграция 0014, LineageNodeActions.tsx, smoke-151 / test-151.
  F  07 §12 — строки Д-68/Д-69/Д-70: состояние «код первого запроса 15.1 —
     ждёт тестовых запросов»; новая строка Д-80 (связь за пределами дерева
     файла неотвязываема) — адресат не назначен.
  G  NEXT-CONTEXT — следующая миграция 0015; серия 2ax/4bi/5as занята;
     первый запрос 15.1 исполнен.
ЧАСТЬ II (H, 2026-10-27) — тестовые запросы 2–4 одним заходом: 07 «По факту
  15.1 (тестовые запросы 2–4)» (test-151-requests2-4: R2 живой импорт
  ребёнка раньше родителя, R3 гонка/миграция на копии БД/копия/удалённый
  родитель, R4 браузер), переводы утверждены (черновиков 0); 05 — тест;
  NEXT-CONTEXT — состояние.
ЧАСТЬ III (I–N, 2026-10-27) — завершение беседы: Д-80 закрыт кодом в той же
  беседе (linkParent без узла файла → LINEAGE_NODE_UNAVAILABLE; 02 §2.4,
  03 §2.8, 07 «По факту (завершение)»); §12 строки Д-68/Д-69/Д-70/Д-80 →
  08 Часть IV; Д-78/Д-79 → адресат 15.2 (пункт в её тексте); врезка
  «Фаза 15» — 15.1 закрыта; 08 Части I/II; README; 09 §2/§4/§6;
  NEXT-CONTEXT (состояние, ближайшая — 15.2).
Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ; блок «По факту» — по
marker). Запуск из корня:
    python3 scripts/patches/patch-docs-conv151.py
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
    """Полная строка таблицы по началу («| Д-68 |») — для переноса в 08."""
    for line in (ROOT / rel).read_text(encoding="utf-8").splitlines(keepends=True):
        if line.startswith(prefix):
            return line
    return ""


# ── A. 07 «По факту 15.1 (первый запрос)» ────────────────────────────────
PF151 = """
**По факту 15.1 (первый запрос — 2026-10-27).** Вход: HEAD feb1211,
`check:dotfiles` чист, `npm install` в самом клоне, PG 16 и Redis в
песочнице, миграции 0000–0013 и сиды, `i18n:check --strict` зелёный.
Порядок — п.0 сверка, затем Д-70 → Д-68 → Д-69 → клиент → переводы →
сторож → тесты.

0. **Сверка текста с кодом** (grep по каждой названной функции, до правок).
   Совпало: `linkParent` искал дубликат `SELECT`-ом вне транзакции, уникального
   ограничения на пару не было (Д-70-1); `POST /:id/duplicate` переносил строки
   родословной с позициями, но не `file_genealogy` (Д-70-2);
   `loadConceptParentFlags` считал любую строку `parent_type='synthesis'` —
   и мёртвую (SET NULL), и без оглядки на узлы файла, — а `isMetaSynthesis`
   страницы жил по `parentSyntheses` (живые) ∪ `fileConceptParents` (Д-70-3);
   отвязки не было (Д-69); действия у узла файла не было, связь создавалась
   только блоком ImportPage (Д-68); `findSameOwnerSynthesesByTitle` — есть.
   Расхождения с текстом беседы и доками, найденные сверкой:
   (а) **позиция привязки «по имени» не адресует безымянный и одноимённые
   узлы**: `linkParent` ищет неперекрытый узел файла с тем же нормализованным
   именем, но у безымянного узла (14.2, `name: ""`) имя — подстановка `tl()`,
   которая ни с чем не совпадёт, а при двух одноимённых узлах берётся первый;
   действие «у узла» обязано привязывать ИМЕННО ЭТОТ узел — в тело
   `POST /lineage/link` добавлен необязательный `position` (целое ≥ 0): узел на
   позиции обязан быть свободной концепцией, иначе 409 `LINEAGE_NODE_UNAVAILABLE`
   (`details.reason`: covered / not_concept / missing); без `position` — прежнее
   поведение 8.5/2026-09-21. ImportPage передаёт `cand.position`;
   (б) **родитель, привязанный «за пределы» дерева файла** (имя не совпало ни с
   одним узлом — строка `position = max+1`), узла файла не имеет и по правилу
   Д-69 отвязке не подлежит (409 `LINEAGE_GENERATED`), хотя документ по нему не
   генерировался. Правило оставлено как решено (снимается только связь поверх
   узла файла — ничего не теряется); расхождение записано строкой §12 (Д-80),
   адресат не назначен;
   (в) текст беседы отсылал к «03 §2.1 — код», коды ошибок живут в 03 §4.3 —
   исправлено в тексте беседы;
   (г) **повтор UUID родителя в `participants` файла** при импорте дал бы две
   строки одной пары — после индекса импорт падал бы на 23505. В ветке UUID
   (13.2) перед записью добавлена одна проверка `repeated` → кандидат с
   пустыми `matches` и предупреждением `server.importService.parentRepeated`,
   позиция сохраняется (`position++` не сбивается). Правило `allow_meta` и
   сама ветка не тронуты — это минимальное касание ради целостности;
   (д) `LineageNode` не нёс `position` и не говорил, перекрывает ли связь БД
   узел файла, — клиент не мог решить, у какого узла какое действие: тип
   расширен аддитивно (`position?`, `coversFileNode?: true`), `getAncestors`
   их проставляет; `routes/lineage` импортирует `isGenerationActive` из
   `generation-service` (цикла нет — так уже делает `routes/syntheses`).

1. **Д-70.** Миграция `0014_lineage_parent_unique` (генерат `drizzle-kit`,
   тег переименован, журнал — `idx: 14`; `drizzle-kit generate` после —
   «No schema changes»): рукописный `DELETE … USING` снимает дубли пары
   `(synthesis_id, parent_synthesis_id)` у `parent_type='synthesis'`,
   оставляя строку с меньшей `position` (при равных — меньший `id`), затем
   частичный уникальный индекс `uq_lineage_parent_pair … WHERE parent_type =
   'synthesis' AND parent_synthesis_id IS NOT NULL` (философы и мёртвые
   строки не ограничены). Проверено на живой БД: 3 дубля → 1, повторная
   вставка — 23505. `linkParent` оборачивает `INSERT` в `try/catch`:
   `pgCodeOf(err) === "23505"` (код лежит в `err.cause.code` у
   `DrizzleQueryError`) → тот же `LINEAGE_EXISTS`; предварительная проверка
   осталась (ранний отказ без обращения к индексу). Копия (`POST
   /:id/duplicate`) переносит `fileGenealogy`. **Одно правило «мета-синтез»**
   — `isMetaSynthesisRows(rows, fileGenealogy)`: живая связь-концепция в БД
   (`rowIsLive`) ЛИБО неперекрытый узел-концепция дерева файла
   (`unlinkedFileParents ∩ concept`). Им живут бейдж каталога
   (`loadConceptParentFlags` — теперь читает строки с позициями и
   `file_genealogy`) и страница (`parentSyntheses` ∪ `fileConceptParents` —
   те же два источника; выражение `isMetaSynthesis` SynthesisPage и
   `isMetaSynthesisOf` DocumentHeader не тронуты). **Строка с удалённым
   родителем (SET NULL) мета-синтезом НЕ делает.** Довод: её не видят древо
   (`getAncestors` — узел файла проступает или позиция пуста), контекст
   генерации (`loadConceptParticipants`), восстановление промпта и
   выгрузка; считать её только в каталоге значило бы показывать бейдж
   «мета» у документа, в шапке которого родителей нет. Исключение — когда на
   её позиции стоит узел-концепция файла: тогда «мета» даёт сам узел, по обоим
   правилам одинаково.

2. **Д-68.** `GET /syntheses/:id/lineage/file-node/:position/candidates?q=`
   (владелец; `:position` — `^\\d+$`, иначе 400) → `FileNodeCandidates {
   node: { position, name, unnamed? }, matches, search, query }`: `matches` —
   `findSameOwnerSynthesesByTitle` по имени узла (ёлочки сняты
   `normalizeConceptTitle`; у безымянного — пусто), `search` — `ILIKE
   %q%` по `syntheses.title` среди своих, кроме самого ребёнка, новые
   первыми, не более `FILE_NODE_SEARCH_LIMIT = 20`, `%`/`_` экранированы;
   узел перекрыт / философ / позиции нет → 409 `LINEAGE_NODE_UNAVAILABLE`.
   Привязка — существующий `POST /lineage/link` с `position` (п.0-а).

3. **Д-69.** `DELETE /syntheses/:id/lineage/link/:parentSynthesisId`
   (владелец ребёнка; `isGenerationActive(id)` → 409
   `GENERATION_IN_PROGRESS`): строки нет / не UUID → 404 `NOT_FOUND`; на
   позиции строки в `file_genealogy` нет узла-концепции → 409
   `LINEAGE_GENERATED` (`details.position`); иначе строка снимается
   (`unlinkParent`), ответ `LineageUnlinkResult { ok, record, revealed:
   { position, name, unnamed? } }` — имя проступившего узла на языке
   запроса (`fileNodeName`). Тексты разделов, журнал, потомки — не
   трогаются (сторож 4bi следит, что `unlinkParent` не касается `sections`/
   `generationLog`/`contextLog`).

4. **Клиент.** `components/lineage/LineageNodeActions.tsx`:
   `lineageActionFor(node, level)` — узел верхнего уровня (`level === 1`)
   типа concept с `position`: снимок файла (`fromFile`) → «Связать с
   концепцией…», связь БД с `coversFileNode` → «Отвязать», иначе действия
   нет (родитель без узла файла, философы, глубокие узлы). Панель привязки
   на месте карточки: совпадения по имени и поиск (debounce 300 мс), выбор
   кандидата — первый шаг, подтверждение — второй (`useSecondStep` по id
   кандидата); `LINEAGE_EXISTS` показывается как успех (связь уже есть).
   Отвязка — вторым шагом с пояснением «узел снова станет снимком файла».
   После обоих — `getSynthesis` → `applySynthesis` и перечитывание древа
   (`lineageVersion`); действия только у владельца (`actions` в
   `GenealogyTree` — `isOwner ? lineageActions : undefined`), гость и чужой
   зритель их не видят. `utils/genealogy.ts` несёт `position`/
   `coversFileNode`; `api/lineage.ts` — `getFileNodeCandidates`,
   `unlinkParent`, `linkParent(…, position?)`; `ApiErrorCode` += два кода.
   CSS — отдельный блок «Беседа 15.1» в `@layer components` (классы
   `.gen-card-actions`, `.gen-card-action-btn` (+`.primary`/`.danger`),
   `.gen-link-panel`, `.gen-link-item`, `.gen-link-search`, `.gen-link-note`
   и светлые переопределения под `.gen-tree-light`): только переменные
   палитры, без hex, скруглений и теней; css-parity A/B/C = 0 (586 правил).

5. **Переводы.** 30 новых ключей (`lineage.lineageNodeActions.*`,
   `server.lineageService.{nodeCovered,nodeNotConcept,nodeMissing,notLinked,
   generatedParent}`, `server.routes.lineage.{positionInteger,invalidPosition,
   notLinked}`, `server.importService.parentRepeated`,
   `importPage.nodeUnavailable`) — en/de черновиками `i18n:import --draft`;
   `i18n:check --strict` зелёный (2171 ключ в коде, 2584 строки таблицы),
   черновиков 30/30 (утверждены тем же днём — часть II).

6. **Сторож** `check:integration` — 2ax (экспорты и типы), 4bi (индекс в
   схеме и миграции на месте 14 журнала, `DELETE` до `CREATE UNIQUE INDEX`,
   `linkParent` ловит 23505, `isMetaSynthesisRows` на обеих сторонах, копия
   с `fileGenealogy`, маршруты под `requireAuth`, `unlinkParent` снимает одну
   строку, клиентские действия/testid/CSS/ключи, `repeated` в импорте), 5as
   (живая БД: индекс применён; кандидаты; привязка по позиции →
   `coversFileNode`; гонка `Promise.allSettled` двух привязок → одна строка +
   `LINEAGE_EXISTS`; отвязка → `revealed`; `LINEAGE_NOT_LINKED`;
   `LINEAGE_GENERATED` за пределами дерева и у мета-синтеза без файла;
   безымянный узел под en; удалённый родитель — каталог ≡ страница).
   Сентинели 4an/4v прежних бесед проходят без правок. INTEGRATION OK.

7. **Тесты первого запроса.** `tests/smoke-151-request1.mjs` (tsx, живая
   БД в процессе; 24 ✓: чистые `fileNodeAt`/`isMetaSynthesisRows`/
   `unlinkedFileParents`/`lineageActionFor`/`lineageNodeToGenealogy`,
   миграция и журнал; БД — кандидаты, позиция, гонка, отвязка, безымянный
   узел, одно правило «мета», копия через `app.request` с cookie сессии —
   `sessions.id = SHA-256(token)`). `tests/test-151-request1-browser.mjs`
   (сервер :3000 + `vite build` под preview :5226 + Chrome 131; 23 ✓:
   «Связать…» только у узла файла верхнего уровня, панель — совпадение «своя
   одноимённая, чужая нет», поиск по подстроке, второй шаг, после привязки —
   «Отвязать» и строка на позиции 0; отвязка вторым шагом с отменой; гость и
   чужой действий не видят; коды API 409/404/400/403, `revealed`).
   Тестовые запросы 2–4 беседы (живой импорт ребёнка раньше родителя,
   «Потомки», `/lineage/search`, миграция на копии БД с дублем) — не
   начинались.

**Чего не делалось:** родителей синтезам сервиса без дерева файла не
приписывалось (отвязка им отказывает 409); правило `allow_meta` и логика
ветки UUID не менялись (п.0-г — только защита от повтора); тексты и журнал
при отвязке не переписываются; типы 4an-ж/4v — на месте.

"""
patch(
    "docs/07-conversation-protocol.md",
    """- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10)

---

### Беседа 15.2: Удаление элементов и подразделов — вручную и по рекомендации (бэкенд + клиент)""",
    """- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10)
""" + PF151 + """---

### Беседа 15.2: Удаление элементов и подразделов — вручную и по рекомендации (бэкенд + клиент)""",
    "A  07: «По факту 15.1 (первый запрос)»",
    marker="**По факту 15.1 (первый запрос — 2026-10-27).**",
)

# п.0-в: «03 §2.1 — код» → «03 §4.3» в тексте беседы 15.1
_p07 = ROOT / "docs/07-conversation-protocol.md"
_t07 = _p07.read_text(encoding="utf-8")
_i15 = _t07.find("### Беседа 15.1")
_i16 = _t07.find("**По факту 15.1 (первый запрос")
if _i16 < 0:
    _i16 = _t07.find("### Беседа 15.2")
_seg = _t07[_i15:_i16] if _i15 >= 0 and _i16 > _i15 else ""
if "03 §2.1 — код" in _seg:
    _p07.write_text(_t07[:_i15] + _seg.replace("03 §2.1 — код", "03 §4.3 — код", 1) + _t07[_i16:], encoding="utf-8")
    applied += 1
    print("  ok    A2 07 15.1: «03 §2.1 — код» → «03 §4.3 — код»")
else:
    skipped += 1
    print("  skip  A2 07 15.1: «03 §2.1 — код» → «03 §4.3 — код»")

# ── B. 03 §2.8 и §4.3 ─────────────────────────────────────────────────────
patch(
    "docs/03-specification.md",
    """                                // происходит от нас). Отвязки (DELETE) нет.
```""",
    """                                // происходит от нас).
                                // 15.1 (Д-68): необязательный position —
                                // целое ≥ 0 (иначе 400 VALIDATION_ERROR,
                                // details.position): связь ставится на
                                // ЭТОТ узел файла; узел перекрыт / философ /
                                // позиции нет → 409 LINEAGE_NODE_UNAVAILABLE
                                // (details: { position, reason: covered |
                                // not_concept | missing }). Без position —
                                // поиск по имени, как выше. Гонка двух
                                // одинаковых запросов: частичный уникальный
                                // индекс uq_lineage_parent_pair (02 §2.4) —
                                // второй получает тот же 409 LINEAGE_EXISTS.

GET    /syntheses/:id/lineage/file-node/:position/candidates?q=подстрока
                                → FileNodeCandidates { node: { position, name,
                                  unnamed? }, matches: SynthesisPreview[],
                                  search: SynthesisPreview[], query }
                                // 15.1 (Д-68): кандидаты для узла-концепции
                                // ВЕРХНЕГО уровня file_genealogy (владелец;
                                // :position — целое, иначе 400). matches —
                                // совпадения по имени узла среди синтезов
                                // владельца (findSameOwnerSynthesesByTitle; у
                                // безымянного узла — пусто), search — ILIKE по
                                // названию среди своих, кроме самого :id,
                                // новые первыми, ≤ 20 (q пустой → []). Узел
                                // перекрыт связью / философ / позиции нет →
                                // 409 LINEAGE_NODE_UNAVAILABLE.

DELETE /syntheses/:id/lineage/link/:parentSynthesisId
                                → LineageUnlinkResult { ok: true, record,
                                  revealed: { position, name, unnamed? } }
                                // 15.1 (Д-69): отвязка — обратная операция
                                // привязки, ничего не теряет. Владелец :id;
                                // активная операция → 409 GENERATION_IN_PROGRESS;
                                // связи нет / не UUID → 404 NOT_FOUND; на
                                // позиции строки в file_genealogy НЕТ
                                // узла-концепции (родитель генерации — участник
                                // POST /syntheses, либо связь за пределами
                                // дерева файла) → 409 LINEAGE_GENERATED
                                // (details.position). Иначе строка снимается,
                                // узел файла снова проступает снимком (revealed
                                // — его имя на языке запроса). Тексты разделов,
                                // журнал и дерево потомков не трогаются.
```""",
    "B1 03 §2.8: position, GET candidates, DELETE link",
)
patch(
    "docs/03-specification.md",
    """LINEAGE_EXISTS      — POST /lineage/link: такая пара уже есть — 409, идемпотентный
                      отказ без дубликата строки (8.5; код не назван текстом
                      беседы — заведён по образцу пары выше)""",
    """LINEAGE_EXISTS      — POST /lineage/link: такая пара уже есть — 409, идемпотентный
                      отказ без дубликата строки (8.5; код не назван текстом
                      беседы — заведён по образцу пары выше). 15.1: тот же код
                      из нарушения уникального индекса при гонке
LINEAGE_NODE_UNAVAILABLE — POST /lineage/link с position и GET
                      …/file-node/:position/candidates: узел дерева файла
                      перекрыт связью, философ либо позиции нет — 409;
                      details: { position, reason: covered | not_concept |
                      missing } (15.1, Д-68)
LINEAGE_GENERATED   — DELETE /lineage/link/:parentSynthesisId: на позиции
                      связи нет узла-концепции файла — по этому родителю
                      документ сгенерирован, отвязать нельзя — 409;
                      details: { position } (15.1, Д-69)""",
    "B2 03 §4.3: LINEAGE_NODE_UNAVAILABLE, LINEAGE_GENERATED",
)

# ── C. 02 §2.4 ────────────────────────────────────────────────────────────
patch(
    "docs/02-data-model.md",
    """  WHERE parent_type = 'philosopher';
```
""",
    """  WHERE parent_type = 'philosopher';
-- 15.1 (Д-70), миграция 0014_lineage_parent_unique: одна пара «ребёнок —
-- родитель-концепция»; философы и строки с удалённым родителем (NULL) не
-- ограничены. Миграция сначала снимает дубли (остаётся строка с меньшей
-- position, при равных — меньший id).
CREATE UNIQUE INDEX uq_lineage_parent_pair
  ON synthesis_lineage(synthesis_id, parent_synthesis_id)
  WHERE parent_type = 'synthesis' AND parent_synthesis_id IS NOT NULL;
```

> **15.1 (Д-68, Д-69, Д-70; 2026-10-27):** `linkParent` переводит нарушение
> `uq_lineage_parent_pair` (23505) в тот же `LINEAGE_EXISTS` — гонка двух
> привязок даёт одну строку. `POST /lineage/link` принимает `position`
> узла файла (связь ставится на ЭТОТ узел, он обязан быть свободной
> концепцией). **Отвязка** (`DELETE …/lineage/link/:parentSynthesisId`)
> снимает строку `parent_type='synthesis'` ТОЛЬКО если на её `position` в
> `file_genealogy` стоит узел-концепция — он снова проступает по ПРАВИЛУ
> ПРИОРИТЕТА; строку без узла файла (родитель генерации; связь за
> пределами `participants`) снять нельзя — 409 `LINEAGE_GENERATED`;
> потомки, тексты и журнал не трогаются. Копия синтеза переносит
> `file_genealogy` вместе со строками (иначе их позиции ничего не
> перекрывали). **Одно правило «мета-синтез»** (`isMetaSynthesisRows`,
> lineage-service): живая связь-концепция (`parent_synthesis_id` не NULL)
> ЛИБО неперекрытый узел-концепция дерева файла; им живут бейдж каталога
> (`loadConceptParentFlags`) и страница (`parentSyntheses` ∪
> `fileConceptParents`). Строка с удалённым родителем (SET NULL) сама по
> себе «мета» не даёт — её не видят древо, контекст генерации,
> восстановление промпта и выгрузка.
""",
    "C  02 §2.4: уникальный индекс, отвязка, одно правило «мета»",
)

# ── D. 04 §4 ──────────────────────────────────────────────────────────────
patch(
    "docs/04-code-reuse-map.md",
    """| `sanitizeWarnings(report)` и `SanitizeHtmlResult.report` в `server/utils/html-parser.ts`;""",
    """| `fileNodeAt`, `isMetaSynthesisRows`, `rowIsLive`, `fileNodeCandidates`, `searchOwnerSynthesesByTitle`, `unlinkParent`, `linkParent(…, { position })` в `server/services/lineage-service.ts`; `GET /:id/lineage/file-node/:position/candidates`, `DELETE /:id/lineage/link/:parentSynthesisId`, `position` у `POST /:id/lineage/link` в `server/routes/lineage.ts`; `loadConceptParentFlags` на `isMetaSynthesisRows` и `fileGenealogy` у `POST /:id/duplicate` (`routes/syntheses.ts`); `repeated` в ветке UUID `import-service.ts`; миграция `0014_lineage_parent_unique`; shared `FileNodeState`, `FileNodeCandidates`, `LineageUnlinkResult`, `LineageNode.position`/`coversFileNode`; клиент — `components/lineage/LineageNodeActions.tsx` (`lineageActionFor`, `LineageNodeActions`), `GenealogyTree.actions`, `getFileNodeCandidates`/`unlinkParent` (`api/lineage.ts`), `lineageNodeToGenealogy` с `position`/`coversFileNode` | НОВОЕ (15.1; Д-68, Д-69, Д-70 — прародителей нет: в исходнике генеалогия жила в объекте файла, связей, отвязок и каталога не было; файлы — `server/services/lineage-service.ts`, `server/routes/lineage.ts`, `server/routes/syntheses.ts`, `server/services/import-service.ts`, `server/db/schema.ts`, `client/src/components/lineage/LineageNodeActions.tsx`, `client/src/components/lineage/GenealogyTree.tsx`, `client/src/pages/SynthesisPage.tsx`): пара «ребёнок — родитель-концепция» единственна (частичный уникальный индекс, 23505 → `LINEAGE_EXISTS`); действие у узла дерева файла верхнего уровня — «Связать с концепцией…» (кандидаты по имени и поиск, второй шаг, привязка по `position`) и «Отвязать» у связи, перекрывающей узел файла (иначе 409 `LINEAGE_GENERATED`); одно правило «мета-синтез» на обеих сторонах |
| `sanitizeWarnings(report)` и `SanitizeHtmlResult.report` в `server/utils/html-parser.ts`;""",
    "D  04 §4: строка 15.1",
)

# ── E. 05 ─────────────────────────────────────────────────────────────────
patch(
    "docs/05-file-structure.md",
    """│   │       ├── 0013_recommendation_issues.sql   # 12.3 (Д-46): recommendations.issues (jsonb, NULL);
│   │       │                           #  оба — генераты, теги переименованы
""",
    """│   │       ├── 0013_recommendation_issues.sql   # 12.3 (Д-46): recommendations.issues (jsonb, NULL);
│   │       │                           #  оба — генераты, теги переименованы
│   │       ├── 0014_lineage_parent_unique.sql   # 15.1 (Д-70): чистка дублей пары + частичный уникальный
│   │       │                           #  индекс uq_lineage_parent_pair; генерат, тег переименован
""",
    "E1 05: миграция 0014",
)
patch(
    "docs/05-file-structure.md",
    """│   │   │   ├── lineage/
│   │   │   │   ├── GenealogyTree.tsx       # Дерево наследования (CSS org-chart)
│   │   │   │   └── LineageSearch.tsx       # Поиск по генеалогии
""",
    """│   │   │   ├── lineage/
│   │   │   │   ├── GenealogyTree.tsx       # Дерево наследования (CSS org-chart); 15.1: actions
│   │   │   │   │                           #  владельца → действия у узлов верхнего уровня
│   │   │   │   ├── LineageNodeActions.tsx  # 15.1 (Д-68/Д-69): «Связать с концепцией…» у узла файла
│   │   │   │   │                           #  (кандидаты/поиск, второй шаг, position) и «Отвязать»
│   │   │   │   │                           #  у связи поверх узла файла (второй шаг); lineageActionFor
│   │   │   │   └── LineageSearch.tsx       # Поиск по генеалогии
""",
    "E2 05: LineageNodeActions.tsx",
)
patch(
    "docs/05-file-structure.md",
    """    │                                   # smoke-142-request1 — 14.2: коды parseWarnings/подписей/причины паузы,""",
    """    │                                   # test-151-request1-browser — 15.1 (запрос 1, клиент): действия у узла
    │                                   #  древа на сборке клиента (Chrome 131): связать через кандидата и поиск
    │                                   #  вторым шагом, отвязать, гость/чужой без действий, коды API
    │                                   # smoke-151-request1 — 15.1: fileNodeAt/isMetaSynthesisRows, миграция 0014,
    │                                   #  кандидаты узла, привязка по позиции, гонка → LINEAGE_EXISTS, отвязка/
    │                                   #  LINEAGE_GENERATED, одно правило «мета», копия с file_genealogy
    │                                   # smoke-142-request1 — 14.2: коды parseWarnings/подписей/причины паузы,""",
    "E3 05: тесты 15.1",
)

# ── F. 07 §12 — состояние строк и новая Д-80 ─────────────────────────────
_t07 = _p07.read_text(encoding="utf-8")
_changed = False
for num in ("Д-68", "Д-69", "Д-70"):
    head = f"| {num} | "
    i = _t07.find(head)
    if i < 0:
        continue
    j = _t07.find("\n", i)
    row = _t07[i:j]
    if row.endswith("| 15.1 | открыт |"):
        _t07 = _t07[:i] + row[: -len("| 15.1 | открыт |")] + "| 15.1 | открыт — код первого запроса 15.1 (2026-10-27), ждёт тестовых запросов |" + _t07[j:]
        _changed = True
if _changed:
    _p07.write_text(_t07, encoding="utf-8")
    applied += 1
    print("  ok    F1 07 §12: состояние Д-68/Д-69/Д-70")
else:
    skipped += 1
    print("  skip  F1 07 §12: состояние Д-68/Д-69/Д-70")

# Д-80 заводится в §12 только пока не перенесён в 08 Часть IV (часть III)
if "| Д-80 — " in (ROOT / "docs/08-history.md").read_text(encoding="utf-8"):
    skipped += 1
    print("  skip  F2 07 §12: Д-80 (уже в 08 Часть IV)")
else:
  patch(
    "docs/07-conversation-protocol.md",
    """| Д-78 | недоделка | **Двойной `pause_marker` у паузы плана.**""",
    """| Д-80 | наблюдение | **Связь родителя за пределами дерева файла неотвязываема.** `linkParent` без `position` при несовпадении имени ставит строку на `max(position)+1` — за пределы `participants` файла (правило 2026-09-21); у такой строки узла файла нет, и `DELETE …/lineage/link` по правилу Д-69 отвечает 409 `LINEAGE_GENERATED`, хотя документ по этому родителю не генерировался (связь поставил человек на ImportPage по имени, которого в файле нет). Найдено сверкой 15.1 п.0. Путь — решение пользователя: либо признак «привязана человеком» у строки (тогда снимать можно и её), либо ImportPage предлагает только узлы файла (с `position`) и строк «за пределы» не создаёт | 15.1 (первый запрос) | не назначен | открыт |
| Д-78 | недоделка | **Двойной `pause_marker` у паузы плана.**""",
    "F2 07 §12: Д-80",
  )

# ── G. NEXT-CONTEXT ──────────────────────────────────────────────────────
patch(
    "NEXT-CONTEXT.md",
    """12.3 — миграции 0012 `recommendations.warning` и 0013 `recommendations.issues`; следующая — 0014), единственный""",
    """12.3 — миграции 0012 `recommendations.warning` и 0013 `recommendations.issues`; 15.1 — миграция 0014 `uq_lineage_parent_pair`; следующая — 0015), единственный""",
    "G1 NEXT-CONTEXT: следующая миграция 0015",
)
patch(
    "NEXT-CONTEXT.md",
    """черновики `i18n:import --draft`, утверждает владелец. Сторож — следующая
серия 2ax/4bi/5as.
""",
    """черновики `i18n:import --draft`, утверждает владелец. Сторож — следующая
серия 2ax/4bi/5as.

**Первый запрос 15.1 исполнен 2026-10-27** (код Д-70 → Д-68 → Д-69 →
клиент; «По факту 15.1 (первый запрос)» в 07): миграция 0014, `POST
/lineage/link` с `position`, `GET …/file-node/:position/candidates`,
`DELETE …/lineage/link/:parentSynthesisId`, `isMetaSynthesisRows` на обеих
сторонах, `LineageNodeActions.tsx`; сторож 2ax/4bi/5as ЗАНЯТ (следующая
серия — 2ay/4bj/5at); 30 ключей черновиками en/de; тесты
`smoke-151-request1` (24 ✓) и `test-151-request1-browser` (23 ✓). Новая
строка §12 — Д-80 (связь за пределами дерева файла неотвязываема), адресат
не назначен. Ждут тестовые запросы 2–4 и завершение беседы.
""",
    "G2 NEXT-CONTEXT: первый запрос 15.1 исполнен",
    marker="**Первый запрос 15.1 исполнен 2026-10-27**",
)

# ── H. Часть II — тестовые запросы 2–4 ───────────────────────────────────
PF2 = """
**По факту 15.1 (тестовые запросы 2–4 — 2026-10-27, одним заходом по
просьбе пользователя).** Перед тестами — повторная сверка кода с текстом
запроса и с «По факту (первый запрос)» после сжатия контекста
(diff каждого файла против HEAD прочитан заново): расхождений нет.
Переводы 30 ключей утверждены владельцем (вливание того же файла без
`--draft`: «подтверждено вычиткой 60»; черновиков 0/0).

`tests/test-151-requests2-4.mjs` (сервер :3000 + PG16/Redis + `vite build`
под preview :5227 + Chrome 131; модель не нужна — документы сеются и ходят
живым импортом через выгрузку службы; 42 ✓ ×2):
- **R2 (Д-68/Д-69 живьём).** Ребёнок импортирован раньше родителя: строка
  только у философа, кандидат узла 0 без совпадений, узел — снимок без
  `synthesisId`, `/lineage/search?philosopher=Кант` ребёнка не находит.
  Родитель импортирован позже (своим файлом с именем узла) → кандидаты узла
  находят его по имени и по подстроке (`?q=`) → привязка по позиции 0 →
  узел кликабелен (`synthesisId`, `coversFileNode`, родословная родителя из
  БД), ребёнок в «Потомках» родителя и в `/lineage/search` по Канту
  (транзитивно), `parentSyntheses` непуст. Отвязка → `revealed` узел, узел
  снова снимок со своей веткой, «Потомки» без ребёнка, поиск не находит,
  `fileConceptParents` — узел файла; текст раздела не переписан. Отвязка
  родителя мета-синтеза (без дерева файла) → 409 `LINEAGE_GENERATED`,
  строка и «Потомки» целы.
- **R3 (Д-70).** Два одновременных `POST /lineage/link` по HTTP → одна
  строка на позиции 0, второй — 409 `LINEAGE_EXISTS`. Миграция на КОПИИ БД
  (`pg_dump` → `philosynth_t151`, откат 0014: индекс снят, последняя
  запись `drizzle.__drizzle_migrations` удалена, подсажены два дубля пары
  с позициями 7 и 9 и вторая строка философа) → `drizzle-kit migrate`: три
  строки пары → одна (позиция 0), индекс создан, журнал +1, строки
  философов не тронуты, новый дубль — 23505. Копия импортированного
  синтеза (`POST /:id/duplicate`) несёт `file_genealogy`, древо копии —
  узел файла с веткой и философ, бейдж «мета» в каталоге. Удалённый
  родитель (`DELETE /syntheses/:id`): у мета-синтеза без дерева файла — ни
  бейджа каталога (`hasConceptParents`), ни шапки
  (`parentSyntheses`/`fileConceptParents`); у импортированного с узлом
  файла на той позиции — и бейдж, и шапка «мета» (узел проступил снимком) —
  согласны в обе стороны.
- **R4 (браузер, сборка клиента).** Два узла файла с «Связать…», у
  родителя без узла файла действий нет; первый клик «Связать» строки не
  пишет (второй шаг), настоящий клик мышью мимо панели снимает второй шаг
  (хук слушает `mousedown` — `el.click()` его не даёт, грабля харнесса);
  узел 0 связан через кандидата, узел 1 — через поиск; у обоих «Отвязать»;
  отвязка узла 1 вторым шагом — снова снимок с «Связать…», узел 0 остался
  связью, строка «Икса» цела; ошибок страницы нет.

Регрессия на СВЕЖЕМ клоне с рабочими изменениями: `check:dotfiles`,
`npm install`, `typecheck` (0 ошибок), `i18n:check --strict`, css-parity
0/586, `vite build`, `check:integration` — INTEGRATION OK (15.1:
2ax/4bi/5as). Ревью: TODO и заглушек в файлах 15.1 нет (слово «заглушка» в
lineage-service — термин 14.2 для русских подстановок, не долг).
Закрытие строк §12 (Д-68, Д-69, Д-70 → 08 Часть IV) — по слову пользователя.

"""
patch(
    "docs/07-conversation-protocol.md",
    """**Чего не делалось:** родителей синтезам сервиса без дерева файла не
приписывалось (отвязка им отказывает 409); правило `allow_meta` и логика
ветки UUID не менялись (п.0-г — только защита от повтора); тексты и журнал
при отвязке не переписываются; типы 4an-ж/4v — на месте.
""",
    """**Чего не делалось:** родителей синтезам сервиса без дерева файла не
приписывалось (отвязка им отказывает 409); правило `allow_meta` и логика
ветки UUID не менялись (п.0-г — только защита от повтора); тексты и журнал
при отвязке не переписываются; типы 4an-ж/4v — на месте.
""" + PF2,
    "H1 07: «По факту 15.1 (тестовые запросы 2–4)»",
    marker="**По факту 15.1 (тестовые запросы 2–4",
)
patch(
    "docs/05-file-structure.md",
    """    │                                   # test-151-request1-browser — 15.1 (запрос 1, клиент): действия у узла""",
    """    │                                   # test-151-requests2-4 — 15.1: R2 живой импорт ребёнка раньше родителя →
    │                                   #  кандидаты/привязка/«Потомки»/search/отвязка/LINEAGE_GENERATED; R3 гонка
    │                                   #  POST ×2, миграция 0014 на копии БД (pg_dump) с дублем, копия с
    │                                   #  file_genealogy, удалённый родитель — каталог ≡ шапка; R4 браузер —
    │                                   #  связать через кандидата и поиск вторым шагом, отвязать (Chrome 131)
    │                                   # test-151-request1-browser — 15.1 (запрос 1, клиент): действия у узла""",
    "H2 05: test-151-requests2-4",
)
patch(
    "NEXT-CONTEXT.md",
    """не назначен. Ждут тестовые запросы 2–4 и завершение беседы.
""",
    """не назначен. **Тестовые запросы 2–4 исполнены 2026-10-27** одним заходом
(`test-151-requests2-4` 42 ✓ ×2), переводы утверждены (черновиков 0),
регрессия на свежем клоне зелёная — ждёт только формальное завершение
(строки Д-68/Д-69/Д-70 → 08 Часть IV, врезка «Фаза 15») по слову пользователя.
""",
    "H3 NEXT-CONTEXT: тесты 2–4 исполнены",
)



# ══ ЧАСТЬ III — завершение беседы 15.1 ══════════════════════════════════
PF3 = """
**По факту 15.1 (завершение — 2026-10-27).** Вопрос пользователя о Д-80 —
когда возникает «связь за пределами дерева файла» — и его требование
«рассогласования правил быть не должно». Разбор: такая строка рождалась
ТОЛЬКО одним путём — `POST /lineage/link` без `position` с `parentName`,
которому не соответствует ни один неперекрытый узел-концепция
`file_genealogy` (правило 2026-09-21: «иначе — за пределы»). До 15.1 этим
путём ходил ImportPage, и промахнуться по имени он мог лишь у безымянного
узла (подстановка 14.2 ни с чем не совпадает) или при двух одноимённых; к
мета-синтезу генерацией и к импорту по UUID это не относится — их строки
либо без дерева файла вовсе (родитель генерации, `LINEAGE_GENERATED` по
праву), либо на позициях узлов файла. С 15.1 ImportPage и древо передают
`position`, так что «за пределы» оставался достижим лишь сырым вызовом API.
Решение — снять ветку: `linkParent` без `position` и без узла файла с таким
именем отвечает 409 `LINEAGE_NODE_UNAVAILABLE` (`reason: missing`). Инвариант
теперь полный: каждая строка `parent_type='synthesis'` либо стоит на
узле-концепции файла (поставлена человеком — отвязывается), либо не имеет
узла файла (поставлена генерацией или импортом по UUID вне узла — не
отвязывается). Д-80 закрыт в той же беседе; сторож 4an переписан под новый
контракт (прежняя ветка «в конец» — красная), 5ab (8.5) даёт синтезам
дерево файла с узлом родителя и проверяет отказ, 5as/smoke — то же.
Попутно у гонки: второй из двух одновременных вызовов `linkParent` может
прочитать строки уже после вставки первого и увидеть узел «перекрытым» —
теперь, если узел перекрыт ЭТИМ ЖЕ родителем (пара уже есть), ответ —
`LINEAGE_EXISTS`, а не `LINEAGE_NODE_UNAVAILABLE`: исход гонки не зависит от
того, кто первым дошёл до индекса (smoke B7 ×3, R3 по HTTP).

Адресаты долгам без адресата — по объёму: **Д-78** (двойной `pause_marker`
плана — снять один вызов `logPauseEvent`, строка сторожа; ≈10 строк) и
**Д-79** (две копии перечисления подразделов — один помощник в
`html-parser.ts` рядом с `sectionTitlesOf`, парсер 1.4 параметром; ≈40
строк, риск — цикл импортов, из-за которого копия и появилась) — оба в
**15.2**: она и так правит `plan-executor` (новые типы шагов) и перечисление
подразделов (`removeSubsectionHtml`, запертые подразделы); пункт добавлен в
её первый запрос.

Завершение: typecheck 0 ошибок, `vite build`, `check:dotfiles`,
`i18n:check --strict` (черновиков 0), css-parity 0/586, `check:integration`
INTEGRATION OK; smoke-151 24 ✓, test-151-request1-browser 23 ✓,
test-151-requests2-4 42 ✓ ×2. Строки Д-68, Д-69, Д-70, Д-80 → 08 Часть IV.
Беседа 15.1 ЗАКРЫТА 2026-10-27; ближайшая — 15.2.

"""
patch(
    "docs/07-conversation-protocol.md",
    """Закрытие строк §12 (Д-68, Д-69, Д-70 → 08 Часть IV) — по слову пользователя.
""",
    """Закрытие строк §12 (Д-68, Д-69, Д-70 → 08 Часть IV) — по слову пользователя.
""" + PF3,
    "I0 07: «По факту 15.1 (завершение)»",
    marker="**По факту 15.1 (завершение — 2026-10-27).**",
)

# Д-80 в коде: 03 §2.8 и 02 §2.4
patch(
    "docs/03-specification.md",
    """                                // на позицию неперекрытого узла file_genealogy
                                // с тем же нормализованным parentName, иначе —
                                // за пределы и связей БД, и participants файла
                                // (прежнее «в конец существующих» 8.5 заменено).""",
    """                                // на позицию неперекрытого узла file_genealogy
                                // с тем же нормализованным parentName; узла нет
                                // → 409 LINEAGE_NODE_UNAVAILABLE (reason:
                                // missing) — 15.1 (Д-80); прежнее «иначе — за
                                // пределы и связей БД, и participants файла»
                                // (2026-09-21) и «в конец существующих» (8.5)
                                // сняты: связь человека всегда стоит на узле
                                // файла, строка без узла — только от генерации
                                // или импорта по UUID.""",
    "I1 03 §2.8: Д-80 — без узла файла отказ",
)
patch(
    "docs/02-data-model.md",
    """> `max(position)+1`» ЗАМЕНЕНО: `linkParent` ставит связь на позицию
> неперекрытого узла файла с тем же (нормализованным) именем, иначе — за
> пределы и связей, и `participants` файла.""",
    """> `max(position)+1`» ЗАМЕНЕНО: `linkParent` ставит связь на позицию
> неперекрытого узла файла с тем же (нормализованным) именем (с 15.1 — по
> явному `position`); узла нет — отказ `LINEAGE_NODE_UNAVAILABLE` (15.1,
> Д-80; до того — «за пределы и связей, и `participants` файла»). Инвариант:
> строка `parent_type='synthesis'` либо стоит на узле-концепции файла
> (поставлена человеком, отвязывается), либо узла не имеет (генерация или
> импорт по UUID — не отвязывается).""",
    "I2 02 §2.4: Д-80 — инвариант",
)

# §12 → 08 Часть IV
CLOSED = {
    "| Д-68 |": "ЗАКРЫТ 15.1 (2026-10-27): `GET /syntheses/:id/lineage/file-node/:position/candidates?q=` (совпадения по имени среди своих + ILIKE-поиск, ≤20; перекрыт/философ/нет позиции → 409 LINEAGE_NODE_UNAVAILABLE), `POST /lineage/link` с `position`; древо — «Связать с концепцией…» у узла файла верхнего уровня (`LineageNodeActions`, второй шаг); test-151 R2/R4",
    "| Д-69 |": "ЗАКРЫТ 15.1 (2026-10-27): `DELETE /syntheses/:id/lineage/link/:parentSynthesisId` (владелец; активная операция → 409; без узла-концепции файла на позиции → 409 LINEAGE_GENERATED; иначе строка снята, узел проступает — `revealed`); древо — «Отвязать» вторым шагом у связи с `coversFileNode`; потомки, тексты, журнал не тронуты; test-151 R2/R4",
    "| Д-70 |": "ЗАКРЫТ 15.1 (2026-10-27): миграция `0014_lineage_parent_unique` (чистка дублей + частичный уникальный индекс `uq_lineage_parent_pair`), `linkParent` 23505 → LINEAGE_EXISTS (гонка — одна строка), копия переносит `file_genealogy`, одно правило «мета» `isMetaSynthesisRows` (живая связь либо неперекрытый узел-концепция файла; строка SET NULL не считается) у каталога и страницы; test-151 R3",
    "| Д-80 |": "ЗАКРЫТ 15.1 (2026-10-27, та же беседа): `linkParent` без `position` и без узла файла с таким именем → 409 LINEAGE_NODE_UNAVAILABLE — строк «за пределы» дерева файла больше нет; инвариант «на узле файла ⇔ поставлена человеком ⇔ отвязывается»; сторожа 4an/5ab/5as",
}
rows_08 = []
for prefix, verdict in CLOSED.items():
    row = row_of("docs/07-conversation-protocol.md", prefix)
    if not row:
        continue
    cells = [c.strip() for c in row.strip().strip("|").split("|")]
    short = cells[2].split("**")[1] if "**" in cells[2] else cells[2][:120]
    rows_08.append(f"| {cells[0]} — {short.rstrip('.')} | 15.1 | {cells[3]} | {verdict} |\n")
if rows_08:
    _p08 = ROOT / "docs/08-history.md"
    _t08 = _p08.read_text(encoding="utf-8")
    _anchor = row_of("docs/08-history.md", "| Д-77 — Stripe Elements")
    if _anchor and "| Д-68 — " not in _t08:
        _p08.write_text(_t08.replace(_anchor, _anchor + "".join(rows_08), 1), encoding="utf-8")
        applied += 1
        print("  ok    J1 08 Часть IV: закрытые строки 15.1")
    else:
        skipped += 1
        print("  skip  J1 08 Часть IV: закрытые строки 15.1")
else:
    skipped += 1
    print("  skip  J1 08 Часть IV: закрытые строки 15.1")
for prefix in CLOSED:
    row = row_of("docs/07-conversation-protocol.md", prefix)
    remove("docs/07-conversation-protocol.md", row, f"J2 07 §12: снята строка {prefix.strip('| ')}") if row else print(f"  skip  J2 07 §12: снята строка {prefix.strip('| ')}")

# Д-78 / Д-79 → 15.2
_p07 = ROOT / "docs/07-conversation-protocol.md"
_t07 = _p07.read_text(encoding="utf-8")
if "| 14.2 (первый запрос) | не назначен | открыт |" in _t07:
    _p07.write_text(_t07.replace("| 14.2 (первый запрос) | не назначен | открыт |", "| 14.2 (первый запрос) | 15.2 | открыт |"), encoding="utf-8")
    applied += 1
    print("  ok    J3 07 §12: Д-78/Д-79 → 15.2")
else:
    skipped += 1
    print("  skip  J3 07 §12: Д-78/Д-79 → 15.2")
patch(
    "docs/07-conversation-protocol.md",
    """- `07-conversation-protocol.md` §12 — строка Д-71; врезка «Фаза 15»; «По факту» 2.1, 2.2, 5.1, 5.2, 9.2, 10.1, 10.2, 10.3, 12.3""",
    """- `07-conversation-protocol.md` §12 — строки Д-71, Д-78, Д-79 (адресат назначен 15.1 — попутные, малые); врезка «Фаза 15»; «По факту» 2.1, 2.2, 5.1, 5.2, 9.2, 10.1, 10.2, 10.3, 12.3, 14.2 (п.0-ж, Д-78; Д-79)""",
    "J4 07 15.2: контекст — Д-78/Д-79",
)
patch(
    "docs/07-conversation-protocol.md",
    """6. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   типы шагов в shared ≡ ветки исполнителя ≡ updatePlan; «удалить» в
   рекомендациях не отклоняется; DELETE запертого подраздела — отказ;
   после deleteElement нет висячих ссылок по перечню п.0.
""",
    """6. Попутно (адресат назначен 15.1; оба малые, в тех же файлах):
   Д-78 — plan-executor пишет pause_marker дважды (createPausedState и
   свой logPauseEvent): оставить один маркер с полями причины; Д-79 —
   listSubsections (routes/sections) и subsectionNamesOf (routes/
   syntheses) — один помощник в server/utils/html-parser.ts рядом с
   sectionTitlesOf (парсер подразделов 1.4 — параметром, чтобы не
   замкнуть цикл импортов, из-за которого копия появилась).

7. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   типы шагов в shared ≡ ветки исполнителя ≡ updatePlan; «удалить» в
   рекомендациях не отклоняется; DELETE запертого подраздела — отказ;
   после deleteElement нет висячих ссылок по перечню п.0; один
   pause_marker у паузы плана; одно перечисление подразделов.
""",
    "J5 07 15.2: пункт Д-78/Д-79 в первом запросе",
)

# врезка «Фаза 15»
patch(
    "docs/07-conversation-protocol.md",
    """### Фаза 15 (добавлена 2026-10-14): снятие ограничений

> Заведена ревизией ограничений 2026-10-14 (вне бесед). Вопрос""",
    """### Фаза 15 (добавлена 2026-10-14): снятие ограничений

> **15.1 закрыта 2026-10-27** (Д-68, Д-69, Д-70; попутно Д-80 — заведён
> и закрыт той же беседой). Д-78/Д-79 (найдены сверкой 14.2) получили
> адресат 15.2. Ближайшая — 15.2.
>
> Заведена ревизией ограничений 2026-10-14 (вне бесед). Вопрос""",
    "J6 07: врезка «Фаза 15» — 15.1 закрыта",
)

# 08 Часть I и Часть II
patch(
    "docs/08-history.md",
    """2aw/4bh/5ar, смоук 142 31 ✓, test-142 58 ✓ ×2; новые Д-78, Д-79 (адресат не
назначен); доки — patch-docs-conv142.py; ближайшая — 15.1.
""",
    """2aw/4bh/5ar, смоук 142 31 ✓, test-142 58 ✓ ×2; новые Д-78, Д-79 (адресат не
назначен); доки — patch-docs-conv142.py; ближайшая — 15.1.
Беседа 15.1 (родословная после импорта: привязка, отвязка, целостность;
бэкенд + клиент) ЗАКРЫТА 2026-10-27 — первая беседы Фазы 15. Д-70:
миграция 0014 (чистка дублей + частичный уникальный индекс пары), 23505 →
`LINEAGE_EXISTS`, копия с `file_genealogy`, одно правило «мета»
(`isMetaSynthesisRows`: живая связь либо неперекрытый узел-концепция файла;
SET NULL не считается). Д-68: кандидаты узла файла (`GET …/file-node/
:position/candidates`), `position` у `POST /lineage/link`, действие
«Связать с концепцией…» в древе. Д-69: `DELETE …/lineage/link/:parent`
только поверх узла файла (иначе `LINEAGE_GENERATED`), «Отвязать» в древе.
Д-80 (связь «за пределы» дерева файла неотвязываема) — заведён и закрыт
той же беседой: без узла файла привязка отказана. 30 ключей (утверждены),
сторож 2ax/4bi/5as, smoke-151 24 ✓, test-151 23 ✓ + 42 ✓ ×2; Д-78/Д-79 →
15.2; доки — patch-docs-conv151.py; ближайшая — 15.2.
""",
    "K1 08 Часть I: 15.1 закрыта",
    marker="Беседа 15.1 (родословная после импорта: привязка, отвязка, целостность;",
)

CH151 = """### Беседа 15.1 — Родословная после импорта: привязка, отвязка, целостность (бэкенд + клиент) [ЗАКРЫТА 2026-10-27]

**Вход:** HEAD feb1211, `check:dotfiles` чист, `npm install` в самом клоне,
PG 16 и Redis в песочнице; Chrome 131 из `chrome/`. Первая беседа Фазы 15:
Д-68, Д-69, Д-70 (ревизия ограничений 2026-10-14). Решения пользователя:
отвязка «как надёжнее» — обратная операция привязки, только связь поверх
узла дерева файла; родителя генерации отвязать нельзя (409
`LINEAGE_GENERATED`); целостность первой; миграция — следующий свободный
номер (0014), сторож места по журналу; родителей синтезам сервиса без
дерева файла задним числом не приписывать; переводы — черновики,
утверждает владелец; браузер — на сборке клиента.

**Ход.** Сверка п.0 нашла сверх текста: привязка «по имени» не адресует
безымянный и одноимённые узлы — у `POST /lineage/link` появился `position`;
повтор UUID родителя в файле дал бы дубль пары — одна проверка в ветке
UUID; `LineageNode` получил `position`/`coversFileNode`. Д-70: миграция
`0014_lineage_parent_unique` (DELETE … USING + частичный уникальный индекс),
`linkParent` ловит 23505 → `LINEAGE_EXISTS`, копия переносит
`file_genealogy`, `isMetaSynthesisRows` — одно правило у каталога и страницы
(строка с удалённым родителем не считается: её не видят древо, контекст
генерации, выгрузка). Д-68: `fileNodeCandidates` (по имени + ILIKE среди
своих), узел перекрыт/философ/нет позиции → `LINEAGE_NODE_UNAVAILABLE`.
Д-69: `unlinkParent` + DELETE-роут (владелец, активная операция → 409,
нет связи → 404, без узла файла → 409). Клиент: `LineageNodeActions.tsx`
(«Связать с концепцией…» с панелью кандидатов/поиска и вторым шагом;
«Отвязать» вторым шагом), `GenealogyTree.actions` только владельцу,
перечитка синтеза и древа после действия; CSS отдельным блоком, палитра
закрытая. Переводы: 30 ключей, утверждены тем же днём. Сторож 2ax/4bi/5as.

**Тесты.** smoke-151 24 ✓; test-151-request1-browser 23 ✓;
test-151-requests2-4 42 ✓ ×2: R2 живой импорт ребёнка раньше родителя →
кандидаты → привязка (кликабелен, «Потомки», `/lineage/search`) → отвязка →
снимок; R3 гонка POST ×2, миграция 0014 на копии БД с дублем, копия с
`file_genealogy`, удалённый родитель — каталог ≡ шапка; R4 браузер —
связать через кандидата и поиск, второй шаг обязателен, отвязать, у
родителя без узла файла действий нет.

**Завершение.** Вопрос пользователя о Д-80 → ветка «за пределы» снята:
без узла файла привязка отказана (`LINEAGE_NODE_UNAVAILABLE`), инвариант
«на узле файла ⇔ поставлена человеком ⇔ отвязывается» полный; Д-80 закрыт
той же беседой; сторожа 4an/5ab переписаны под контракт. Д-78/Д-79 → 15.2
(малые, в её файлах). Регрессия на свежем клоне зелёная; доки —
`patch-docs-conv151.py` (три части). Ближайшая — 15.2.

"""
patch(
    "docs/08-history.md",
    """### Беседа 14.2 — Хранимые тексты и их показ (бэкенд + клиент) [ЗАКРЫТА 2026-10-26 — Фаза 14 закрыта]
""",
    CH151 + """### Беседа 14.2 — Хранимые тексты и их показ (бэкенд + клиент) [ЗАКРЫТА 2026-10-26 — Фаза 14 закрыта]
""",
    "K2 08 Часть II: глава 15.1",
    marker="### Беседа 15.1 — Родословная после импорта",
)

# README
patch(
    "README.md",
    """| 15 — снятие ограничений | 15.1–15.4 | заведена 2026-10-14 ревизией ограничений (Д-68…Д-75): родословная после импорта, удаление элементов, почта, тарифы; после Фазы 14 |""",
    """| 15 — снятие ограничений | 15.1–15.4 | заведена 2026-10-14 ревизией ограничений (Д-68…Д-75): родословная после импорта, удаление элементов, почта, тарифы; после Фазы 14. 15.1 (привязка к узлу дерева файла, отвязка поверх узла файла, уникальность пары родословной, одно правило «мета»; Д-68, Д-69, Д-70, попутно Д-80) — закрыта 10-27; ближайшая — 15.2 |""",
    "L1 README: 15.1 закрыта",
)

# 09 уроки
patch(
    "docs/09-lessons.md",
    """   `remove()` со skip при отсутствии якоря, а перенос строки в 08 читается
   из 07 ДО снятия (`row_of`).

## 3. PostgreSQL, Drizzle, данные""",
    """   `remove()` со skip при отсутствии якоря, а перенос строки в 08 читается
   из 07 ДО снятия (`row_of`).

### Беседа 15.1 — патч по частям и сторожа смены контракта
1. **Часть патча, зависящая от прежней части, — в конец скрипта**: блок
   «тесты 2–4» ставился перед блоком «первый запрос» и на чистой копии
   красил два якоря (их ещё не было). Порядок patch() в файле = порядок
   зависимостей; проверка — три прогона на ЧИСТОЙ копии и diff с рабочей.
2. **`new` одного patch() не должен быть якорем `old` другого без
   `marker`**: позднейший блок переписал хвост `new` первого, и на втором
   прогоне первый вставился повторно (дубль в NEXT-CONTEXT). У блока, чей
   `new` потом редактируется, — `marker`.
3. **Сверка после сжатия контекста — по diff против HEAD, не по сводке**:
   два ожидания смоука (философ со строкой — `covered`, не `not_concept`;
   `POST /lineage/link` — 200, не 201) были неверны у теста, не у кода.
4. **Снятие ветки контракта (Д-80) красит старые живые сторожа** (5ab 8.5
   линковал синтезы без дерева файла): им даётся дерево файла с узлом
   родителя и добавляется проверка отказа — сторож правится под контракт,
   не снимается; прежнее выражение (`Math.max(maxRow, fileLen - 1) + 1`)
   переводится в КРАСНЫЙ якорь.

## 3. PostgreSQL, Drizzle, данные""",
    "M1 09 §2: уроки 15.1",
)
patch(
    "docs/09-lessons.md",
    """5. **Интерфейс пользователя в браузере — по `users.ui_locale`**, не по
   `Accept-Language` контекста: немецкий интерфейс для теста — `update users
   set ui_locale='de'` до входа; проверка — `document.documentElement.lang`.

## 5. Node, TypeScript, сборка""",
    """5. **Интерфейс пользователя в браузере — по `users.ui_locale`**, не по
   `Accept-Language` контекста: немецкий интерфейс для теста — `update users
   set ui_locale='de'` до входа; проверка — `document.documentElement.lang`.

### Беседа 15.1 — живой импорт в харнессе, миграция на копии, второй шаг
1. **Живой импорт без файла-образца**: выгрузка посеянного документа
   (`GET /export/html`) → правка `philosynth-state` (genealogy) → `POST
   /syntheses/import` — ребёнок «раньше родителя» и родитель «своим файлом»
   без мока модели.
2. **Миграция проверяется на копии БД**: `pg_dump | psql` в
   `philosynth_t151`, откат — снять индекс и последнюю строку
   `drizzle.__drizzle_migrations`, подсадить дубли, `drizzle-kit migrate` с
   `DATABASE_URL` копии; `createdb -T` не годится (у источника живые
   сессии сервера).
3. **Второй шаг через `useSecondStep` слушает `mousedown`** — `el.click()`
   из `$eval` клик мимо не даёт; «клик мимо панели» — `page.mouse.click`
   по координатам.
4. **Сессия в харнессе через `app.request`**: `sessions.id` — SHA-256
   токена в hex, cookie несёт сам токен (`philosynth_session`).
5. **Постгрес песочницы умирает при простое** (дважды за беседу,
   «Removed stale pid file») — перед каждым прогоном `pg_ctlcluster 16
   main start`; упавший `check:integration` без «ПРОБЛЕМЫ» в логе — сначала
   проверить БД.

## 5. Node, TypeScript, сборка""",
    "M2 09 §4: уроки 15.1",
)
patch(
    "docs/09-lessons.md",
    """   `reason` как есть; признак «старая запись» — отсутствие НОВЫХ полей, не
   наличие старого (у старых max-tokens пауз `maxTokensUsed` тоже есть).

## 7. Сервер: стрим, WS, Redis, Registry""",
    """   `reason` как есть; признак «старая запись» — отсутствие НОВЫХ полей, не
   наличие старого (у старых max-tokens пауз `maxTokensUsed` тоже есть).

### Беседа 15.1 — действия у узла древа
1. **Перечитка после действия — неразрушающая**: `getSynthesis` →
   `applySynthesis` плюс счётчик `lineageVersion` в deps эффекта древа;
   прежнее древо не сбрасывать при том же id (иначе блок мигает списком
   родителей); `store.load` — грабля R3 2.3.
2. **Узлу нужен адрес и признак**: клиент решает «связать / отвязать /
   ничего» по `position` и `coversFileNode` из API (аддитивное расширение
   `LineageNode`), а не по имени — безымянные и одноимённые узлы по имени
   не адресуются.
3. **Панель на месте карточки, не popover**: в документе popover негде
   разместить (правило кита); список кандидатов и поиск раскрываются под
   карточкой узла, второй шаг — на строке кандидата (`useSecondStep<id>`).

## 7. Сервер: стрим, WS, Redis, Registry""",
    "M3 09 §6: уроки 15.1",
)

# NEXT-CONTEXT: состояние и ближайшая
patch(
    "NEXT-CONTEXT.md",
    """## Состояние на 2026-10-26 (Фаза 14 ЗАКРЫТА 2026-10-26; ближайшая — 15.1; Фаза 13 закрыта)
""",
    """## Состояние на 2026-10-27 (15.1 ЗАКРЫТА 2026-10-27; ближайшая — 15.2; Фаза 14 закрыта)

**15.1 (родословная после импорта; бэкенд + клиент) ЗАКРЫТА 2026-10-27 —
первая беседы Фазы 15.** Закрыты Д-68, Д-69, Д-70 и Д-80 (заведён и закрыт
той же беседой); Д-78/Д-79 → 15.2; реестр §12 — Д-71…Д-75, Д-78, Д-79.
Инвариант родословной: пара «ребёнок — родитель-концепция» единственна
(`uq_lineage_parent_pair`, миграция 0014; следующая — 0015); строка
`parent_type='synthesis'` либо стоит на узле-концепции `file_genealogy`
(поставлена человеком: `POST /lineage/link` с `position` или по имени
узла — отвязывается `DELETE …/lineage/link/:parent`), либо узла не имеет
(генерация или импорт по UUID — `LINEAGE_GENERATED`); «за пределы» дерева
файла связь не пишется (`LINEAGE_NODE_UNAVAILABLE`). Одно правило
«мета-синтез» — `isMetaSynthesisRows` (живая связь либо неперекрытый
узел-концепция файла) у каталога и страницы. Древо: `LineageNodeActions`
(«Связать с концепцией…» / «Отвязать», второй шаг) только владельцу;
`LineageNode.position`/`coversFileNode`. Сторож 2ax/4bi/5as (следующая
серия — 2ay/4bj/5at); 30 ключей утверждены; тесты smoke-151 24 ✓,
test-151-request1-browser 23 ✓, test-151-requests2-4 42 ✓ ×2. Доки —
`patch-docs-conv151.py` (три части).

## Состояние на 2026-10-26 (Фаза 14 ЗАКРЫТА 2026-10-26; Фаза 13 закрыта)
""",
    "N1 NEXT-CONTEXT: состояние — 15.1 закрыта",
    marker="## Состояние на 2026-10-27 (15.1 ЗАКРЫТА",
)
patch(
    "NEXT-CONTEXT.md",
    """## Ближайшая беседа — 15.1 (родословная после импорта: привязка, отвязка, целостность; бэкенд + клиент)
""",
    """## Ближайшая беседа — 15.2 (удаление элементов и подразделов: вручную и по рекомендации; бэкенд + клиент)

Вторая беседа Фазы 15 — Д-71 (сервис удаления элемента и подраздела, новые
типы шагов плана `delete_element`/`delete_subsection`, «удалить» в
рекомендациях исполняется ими, клиентское зеркало) и попутные Д-78 (один
`pause_marker` у паузы плана) и Д-79 (одно перечисление подразделов в
`html-parser.ts`). Текст беседы и комплект — в 07 (§12 строки Д-71, Д-78,
Д-79; «По факту» 2.1, 2.2, 5.1, 5.2, 9.2, 10.1–10.3, 12.3, 14.2). Миграций
не ожидается (следующая, если понадобится, — 0015). Сторож — серия
2ay/4bj/5at. Переводы — черновики `--draft`, утверждает владелец.

## Беседа 15.1 (ЗАКРЫТА 2026-10-27) — что было комплектом
""",
    "N2 NEXT-CONTEXT: ближайшая — 15.2",
)

print(f"\nприменено {applied}, пропущено {skipped}, ошибок {failed}")
sys.exit(1 if failed else 0)
