#!/usr/bin/env python3
"""Предпатч доков ПЕРЕД клиентскими беседами Фазы 1 (1.6, 1.6b, 1.7).

Идемпотентный: каждая правка сперва проверяет наличие нового текста
(applied ранее -> skip), затем наличие якоря (нет -> FAIL). str.replace,
НЕ re.sub. Запуск из корня репо: python3 scripts/patch-docs-conv16-pre.py

Снят НЕ по итогам беседы, а по итогам аудита готовности к ней. Аудит
вскрыл системный дефект 07: клиентские беседы Фазы 1 написаны так, будто
REST-слой уже существует. Дефект повторился в 1.6, 1.7 и (в 06) в 1.8.

РЕШЕНИЕ, принятое до беседы: 1.6 разделена по шву сервер/клиент.
  1.6  — Транспорт чтения (сервер): syntheses, sections, categories
  1.6b — Просмотр документа + каталог (клиент)
  1.7  — Граф категорий (клиент), теперь чисто клиентская
Обоснование: разные харнессы тестов (mini-Hono+PG против puppeteer),
почти непересекающиеся комплекты вложений, риск сжатия контекста в
одном заходе, прецедент 0.5/0.6. GET-часть routes/elements.ts отдана
серверной беседе 1.6 (открыт тот же слой), PATCH-часть остаётся 5.1.

Дыры, закрываемые патчем (перепроверены по первоисточникам):
  БЕСЕДЫ 1.6 / 1.6b
  1. 07 §1.6 перечислял ТОЛЬКО клиент, а тесты той же беседы требовали
     GET /syntheses, /public, /:id, /:id/sections. Реализованы были
     только POST /syntheses, /estimate, /advice.
  2. server/routes/sections.ts не создавала ни одна беседа (класс
     дыры routes/taxonomy.ts).
  3. «Исходник: НЕ НУЖЕН» — неверно: в standalone-файле лежит вся
     подсистема документа; фрагмента для 1.6 не было.
  4. doc_num есть в схеме и shared-типе, но не заполняется никем и
     отсутствует в 03 §2.2.
  5. contextQualityScore обязателен в §2.3, а context-quality.ts —
     беседа 2.4 (позже).
  6. Правила доступа к чужому публичному синтезу не заданы; PATCH
     /syntheses/:id (публикация) не назначен никому.
  7. §2.2: items: Synthesis[] — несуществующий тип.
  8. TODO(1.6) требует отдавать оценки паузы, поля под них не было.
  9. TableOfContents нужен список подразделов, в SectionSummary его нет.
 10. subscribe_generation при статусе generating без активного прогона
     ЗАПУСКАЕТ генерацию — страница просмотра могла её перезапустить.
 11. Футер исходника пересчитывает стоимость из токенов, а тест требует
     совпадения с synthesis.totalCostUsd.

  БЕСЕДА 1.7
 12. GET /syntheses/:id/categories рождается только в 5.1 (Фаза 5) —
     разрыв через две фазы; 06 §1.7 при этом числит его за 1.7.
 13. client/api/elements.ts не создаёт никто (5.2 говорит «расширение»).
 14. three (r128) и d3 (7.8.5) отсутствуют в client/package.json;
     исходник грузил их с cdnjs, а CDN закрыт egress-прокси песочницы.
 15. Кнопки экспорта MMD/PNG/JSON в GraphModal конфликтуют с беседой
     4.2; в фрагмент 1.7 они не входят (обрыв на 16366, exportMMD с
     16370).
 16. Объявление graph-STATE (G, legendFilter, roleMode, clearLegend-
     Filter) лежит вне фрагмента 1.7 — в блоке STATE [4389–4413].

  ОБЩЕЕ
 17. §11 занижал зависимости обеих бесед; ссылки «(из 1.6)» в Фазе 5
     указывают на клиентские файлы и после разделения читаются как 1.6b.
 18. scripts/extract-fragments.py отсутствует в репозитории, хотя 07 и
     шапки всех фрагментов на него ссылаются.
"""
from pathlib import Path

applied, skipped, failed = [], [], []


def patch(path: str, old: str, new: str, tag: str, marker: str | None = None) -> None:
    """Точечная замена. probe (по умолчанию — новый текст) даёт идемпотентность.

    ВНИМАНИЕ (грабля прогона 1): если новый текст неуникален в файле,
    probe срабатывает ложно и правка молча уходит в skip. В таких местах
    якорь берётся многострочным блоком либо marker задаётся явно.
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


def patch_between(path: str, start: str, end: str, new: str, tag: str, marker: str) -> None:
    """Замена целого блока [start … end) — start включается, end остаётся.

    Нужна там, где секция переписывается целиком (разделение беседы 1.6):
    точечный якорь на десятки строк ловил бы концевые пробелы исходного
    текста. marker обязателен — после замены start в блоке не остаётся.
    """
    p = Path(path)
    if not p.exists():
        failed.append(f"{tag}: файл не найден — {path}"); return
    s = p.read_text(encoding="utf-8")
    if marker in s:
        skipped.append(tag); return
    i = s.find(start)
    if i < 0:
        failed.append(f"{tag}: начало блока не найдено в {path}"); return
    j = s.find(end, i + len(start))
    if j < 0:
        failed.append(f"{tag}: конец блока не найден в {path}"); return
    p.write_text(s[:i] + new + s[j:], encoding="utf-8")
    applied.append(tag)


# ══════════════════════════════════════════════════════════════════
# A. 07: беседа 1.6 → 1.6 (сервер) + 1.6b (клиент)
# ══════════════════════════════════════════════════════════════════
SECTION_16 = """### Беседа 1.6: Транспорт чтения (сервер) — синтезы, разделы, граф

> Разделение (2026-07-30): прежняя беседа «Просмотр документа + каталог»
> расщеплена на серверную 1.6 и клиентскую 1.6b. Причины: разные
> харнессы тестов (mini-Hono + живой PG против puppeteer + vite),
> почти непересекающиеся комплекты вложений, риск сжатия контекста в
> одном заходе. Прецедент — пара 0.5 (сервер) / 0.6 (клиент).

**Контекст:**
- `03-specification.md` (секции 2.2 Syntheses, 2.3 Sections, 2.4 Elements)
- `02-data-model.md` (syntheses, sections, categories, category_edges,
  cluster_labels, synthesis_lineage)
- Из предыдущих бесед: `server/routes/syntheses.ts` (1.4/1.5),
  `server/services/pause-resume-service.ts` (1.4b — `computePauseEstimates`),
  `server/services/context-extractor.ts` (1.4 — `parseSubsectionsFromHTML`),
  `server/ws/handler.ts` (1.4/1.4b), `server/db/schema.ts`
- Исходник: нужен ровно один кусок — формат номера документа [12110]

**Извлечение:**
```bash
sed -n '12110,12115p' source/philosynth.html   # docNum «PS-NNNN-XXXX»
```

**Первый запрос:**
```
Достраиваю REST-слой чтения: без него клиентские беседы 1.6b и 1.7
нечем наполнить.

Создай / расширь:
1. Расширение server/routes/syntheses.ts (03 §2.2):
   - GET    /syntheses         ?page&limit&sort&order&status&method&search
                               → { items: SynthesisPreview[], total }
   - GET    /syntheses/public  ?page&limit&search&philosopher
                               → { items: SynthesisPreview[], total }
   - GET    /syntheses/:id     → { synthesis: SynthesisFull }
                                 с pausedState и pauseEstimates
                                 (computePauseEstimates, fail-open {})
   - PATCH  /syntheses/:id     { title?, isPublic? }  — только владелец
   - DELETE /syntheses/:id                            — только владелец

2. server/routes/sections.ts (03 §2.3) — модуль есть в 05, но не
   создавался ни одной беседой:
   - GET /syntheses/:id/sections       → { sections: SectionSummary[] }
   - GET /syntheses/:id/sections/:key  → { section: SectionFull }
   (GET /:key/context — отладочный, остаётся беседам 2.3/2.4)

3. server/routes/elements.ts — ТОЛЬКО чтение графа (03 §2.4):
   - GET /syntheses/:id/categories
       → { categories, edges, clusters, topology }
   PATCH-часть (categories/:catId, edges/:edgeId, theses, glossary)
   в этой беседе НЕ делается — она остаётся беседе 5.1.

4. POST /syntheses — заполнять doc_num при создании записи.
   Формат исходника [12110]:
   "PS-" + rand(1000..9999) + "-" + Date.now().toString(36).toUpperCase().slice(-4)

5. server/ws/handler.ts — режим «только подписка»:
   сейчас subscribe_generation при status='generating' без активного
   прогона ЗАПУСКАЕТ generateSynthesis. Страница просмотра (1.6b)
   не должна перезапускать генерацию — нужен явный флаг подписки
   без запуска либо отдельное сообщение.

6. Монтирование новых роутов в server/index.ts.
```

**Решения, зафиксированные до беседы (аудит 2026-07-30):**
- **Доступ:** GET /:id, /:id/sections, /:id/categories — владелец ИЛИ
  `is_public = true` (каталог «Публичные» ведёт на чужой синтез);
  иначе 403 FORBIDDEN, несуществующий id — 404 NOT_FOUND (03 §4.3).
  PATCH и DELETE — только владелец.
- **`contextQualityScore` до беседы 2.4 всегда `null`**:
  `context-quality.ts` (getSectionContextQuality) назначен 2.4, которая
  идёт позже; в роуте — `TODO(2.4)`.
- **`subsections`** в SectionSummary заполняются
  `parseSubsectionsFromHTML` (1.4) — нужны TableOfContents в 1.6b.
- **Стоимость** отдаётся из `syntheses.total_cost_usd`; роут ничего не
  пересчитывает по ставкам моделей.
- **Поиск серверный** (`?search=`, под него в схеме gin_trgm_ops по
  `title`); клиент фильтрует только уже загруженную страницу.
- **`capsule`** остаётся отдельным разделом в `sections` И полем
  `capsule_html`; роут ничего не вырезает — исключение ключа при
  рендере делает клиент (1.6b).

**Последующие запросы:**
- «Протестируй GET /syntheses: создай через POST два синтеза, запроси список → оба в items, total=2, сортировка по createdAt desc по умолчанию. Проверь ?search= (частичное совпадение title), ?status=, ?method=, ?page=&limit=»
- «Протестируй GET /syntheses/:id: возвращает SynthesisFull с sectionOrder, docNum, философами из synthesis_lineage, capsuleHtml, totalCostUsd. Для приостановленного синтеза — pausedState и pauseEstimates; для обычного — null»
- «Протестируй доступ: чужой непубличный синтез → 403 FORBIDDEN; после PATCH { isPublic: true } тот же GET от другого пользователя → 200; несуществующий id → 404 NOT_FOUND. То же для /sections и /categories»
- «Протестируй GET /syntheses/:id/sections: список SectionSummary в порядке sectionOrder, subsections заполнены из HTML, contextQualityScore = null (TODO(2.4)). GET /sections/:key возвращает SectionFull с htmlContent»
- «Протестируй GET /syntheses/:id/categories: categories с v10-метриками (clarity, breadth, depthScore, applicability, historicalSignificance, innovationDegree), edges с certainty/historicalSupport/logicalNecessity/contextDependency, clusters из cluster_labels, topology с ролями»
- «Протестируй doc_num: после POST /syntheses поле заполнено по маске PS-NNNN-XXXX и не пустое; у двух синтезов номера различаются»
- «Протестируй WS: для синтеза со status='generating' подписка в режиме просмотра НЕ приводит к вызову generateSynthesis, но события стриминга доходят»
- «Edge case: GET /syntheses?page=99 → пустой items, total корректен. GET /sections для синтеза без разделов → пустой массив, не 404. GET /categories для синтеза без графа → пустые массивы, topology с пустыми объектами»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Добавь секции в scripts/check-integration (по образцу предыдущих бесед) для новых роутов»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 1.6b: Просмотр документа + каталог (клиент)

**Контекст:**
- `03-specification.md` (секции 1.2, 1.4, 2.2, 2.3)
- `01-architecture.md` (§4.15 п.4–5: автодобавление в пул; шапка
  документа — раскрывающиеся поля, авто-заголовок из «name», капсула)
- `05-file-structure.md` (document/, catalog/)
- Из предыдущих бесед: роуты чтения из 1.6,
  `client/src/hooks/useStreamingGeneration.ts` и
  `client/src/components/synthesis/PauseModal.tsx` (1.5/1.4b — нужны для
  edge case «status=generating»), `client/api/`, `client/stores/`
- Исходник: **НУЖЕН для документа** (каталога в standalone-файле нет —
  для CatalogPage/SynthesisCard исходник действительно не нужен).
  Фрагмент: `docs/fragments-for-conversations/1.6-document-view.js`

**Извлечение (диапазоны выверены аудитом 2026-07-30):**
```bash
# CSS документа: шапка, #docTOC, тела разделов, .doc-table, .callout,
# .risk, футер, actions-bar (дальше, с 931, начинается граф-модалка 1.7)
sed -n '476,929p'     source/philosynth.html
sed -n '3304,3319p'   source/philosynth.html   # .doc-title-edit-btn
# Разметка-эталон: output-wrap + #docOutput (шапка, #docBodies, футер)
sed -n '4134,4220p'   source/philosynth.html
# JS-блок «HELPER: раскрывающиеся поля шапки и разделов» целиком:
# makeHeaderDisclosure, buildDocHeaderExtras, buildTableOfContents,
# extractCapsuleText, updateCapsuleInHeader, removeCapsuleFromDocBodies,
# makeSectionCtxDisclosure, editDocTitle, updateDocTitleFromName
sed -n '11594,11892p' source/philosynth.html
# Заполнение шапки при старте: дата, ML/DL/SL, три ветки docSubtitle
sed -n '12110,12144p' source/philosynth.html
sed -n '5671,5683p'   source/philosynth.html   # updateFooterCost
```
НЕ портировать: `rebuildDbMapping` [5686] и всю индексацию `db{N}` /
`DOC_STATE.sectionDbIdx` — в React разделы адресуются по `key`;
`.output-wrap` (видимостью управляет маршрут).

**Первый запрос:**
```
Создаю страницу просмотра синтеза и каталог.

Прикреплён фрагмент исходника (1.6-document-view.js): CSS документа,
разметка-эталон шапки и футера, buildTableOfContents, шапка с
раскрывающимися полями, капсула, updateFooterCost.

Создай:
1. Перенос CSS документа в client/src/globals.css:
   .doc-header/.doc-title/.doc-subtitle/.doc-meta-*, #docTOC/.toc-*,
   .doc-section/.section-num/.section-title/.doc-content/.doc-table/
   .callout*/.risk*, .doc-footer/.validity-stamp, .actions-bar.
   Без них рендер html_content разваливается: после 0.4 в globals.css
   только палитра.

2. client/pages/SynthesisPage.tsx:
   - Загрузка синтеза по ID (GET /syntheses/:id из беседы 1.6)
   - Рендер DocumentView

3. client/components/document/:
   - DocumentView.tsx: рендер HTML-контента разделов (dangerouslySetInnerHTML),
     ключ `capsule` исключается — капсула живёт в шапке
   - DocumentHeader.tsx: номер (docNum), участники, метод, капсула,
     раскрывающиеся поля (buildDocHeaderExtras)
   - SectionView.tsx: обёртка с якорем #sec-{key} и кнопкой ⏫.
     Свой заголовок НЕ рисует: html_content хранит весь
     <div class="doc-section"> вместе с section-num и section-title
   - TableOfContents.tsx: якоря #sec-{key} и #subsec-{key}-{slug}
     (порт buildTableOfContents; подразделы из SectionSummary.subsections)
   - DocumentFooter.tsx: токены и стоимость — значение
     synthesis.totalCostUsd как есть, без пересчёта по ставкам

4. client/pages/CatalogPage.tsx:
   - Вкладки: «Мои» (GET /syntheses) / «Публичные» (GET /syntheses/public)
   - Поиск (параметр ?search=, серверный)
   - Переключатель публикации через PATCH /syntheses/:id { isPublic }

5. client/components/catalog/:
   - SynthesisList.tsx
   - SynthesisCard.tsx: превью (название, метод, уровень, философы, дата)

6. client/api/sections.ts: getSections(), getSection()
7. client/stores/synthesis-store.ts (Zustand): текущий синтез, разделы

8. SynthesisPage при status='generating' — подписка на WS через
   useStreamingGeneration (1.5) в режиме «только просмотр»:
   открытие страницы не должно запускать генерацию заново
   (режим добавлен в ws/handler в беседе 1.6).
```

**Последующие запросы:**
- «Протестируй SynthesisPage: открой /synthesis/:id для ранее созданного синтеза → DocumentHeader показывает номер, метод, уровень, философов? DocumentView рендерит HTML всех разделов? TableOfContents содержит якоря на каждый раздел?»
- «Протестируй CSS: таблицы в разделах отрисованы стилем .doc-table (рамки, зебра), callout'ы цветными блоками, .risk-метки окрашены. Сравни с исходником визуально»
- «Протестируй навигацию: клик на элемент TableOfContents → плавная прокрутка к разделу; якоря подразделов работают. Кнопка ⏫ в заголовке раздела → возврат к оглавлению»
- «Протестируй капсулу: она показана в шапке документа и НЕ продублирована среди тел разделов»
- «Протестируй CatalogPage: вкладка \\"Мои\\" → список синтезов текущего пользователя. Опубликуй синтез (PATCH /syntheses/:id { isPublic: true }) → он появляется во вкладке \\"Публичные\\". Поиск уходит на сервер параметром ?search=»
- «Протестируй SynthesisCard: отображает название, метод×уровень, список философов (через запятую), дату создания. Клик → навигация на /synthesis/:id»
- «Протестируй DocumentFooter: показывает суммарные токены (input + output) и стоимость в формате \\"$X.XXXX\\" — ровно значение synthesis.totalCostUsd, без пересчёта по ставкам модели»
- «Edge case: SynthesisPage для синтеза со status=\\"generating\\" — показывает индикатор загрузки или подключается к WebSocket для стриминга, а не пустой документ; проверь, что открытие страницы НЕ запускает генерацию заново. Несуществующий ID — 404-страница; чужой непубличный синтез — 403»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

"""

patch_between(
    "docs/07-conversation-protocol.md",
    "### Беседа 1.6: Просмотр документа + каталог",
    "### Беседа 1.7: Граф категорий",
    SECTION_16,
    "16pre/A 07 §1.6 → 1.6 (сервер) + 1.6b (клиент)",
    marker="### Беседа 1.6b: Просмотр документа + каталог (клиент)",
)

# ══════════════════════════════════════════════════════════════════
# B. 07: беседа 1.7 — заголовок, контекст, извлечение
# ══════════════════════════════════════════════════════════════════
HEAD_17 = """### Беседа 1.7: Граф категорий, 3D + 2D (клиент)

> Разделение (2026-07-30): беседа стала чисто клиентской. Роут
> `GET /syntheses/:id/categories` перенесён в серверную беседу 1.6 —
> прежде он рождался только в 5.1 (Фаза 5), то есть страницу графа
> нечем было наполнить через две фазы после её создания.

**Контекст:**
- `04-code-reuse-map.md` (секция 3 — непереносимое, graph/)
- `05-file-structure.md` (graph/)
- `03-specification.md` (секция 2.4 — GET /syntheses/:id/categories)
- Из предыдущих бесед: `shared/types/graph.ts` (Category, CategoryEdge,
  ClusterLabel, TopologyInfo, GraphData — готовы), роут categories из
  беседы 1.6, `client/pages/SynthesisPage.tsx` из 1.6b (хозяин модалки —
  кнопка графа живёт в actions-bar над документом)
- Исходник: вся визуализация графа (TC … build2D) (ВСЯ визуализация графа)

**Извлечение — здесь нужен большой фрагмент:**
```bash
# Основной фрагмент готов: 1.7-graph-viz.js [12990–16366] — внутри всё,
# что перечисляет первый запрос (graph-utils, build3D/build2D, панели,
# легенда, физика, геометрия).
grep -n 'GRAPH MODAL\\|MMD EXPORT' philosynth.html | tail -3
grep -n 'function build3D\\|function build2D' philosynth.html
# ВНЕ основного фрагмента (аудит 2026-07-30) — объявление graph-STATE:
# G, roleMode, legendFilter, clusterVisible, clearLegendFilter.
# Вынесено отдельным файлом 1.7-graph-state-extras.js:
sed -n '4389,4413p' source/philosynth.html
```
> Границей извлечения служит баннер `MMD EXPORT`, поэтому `exportMMD`
> [16370] и соседние экспортёры в фрагмент НЕ входят — и не должны:
> они принадлежат беседе 4.2 (серверные `services/export/*`).

"""

patch_between(
    "docs/07-conversation-protocol.md",
    "### Беседа 1.7: Граф категорий (3D + 2D)",
    "**Первый запрос:**",
    HEAD_17,
    "16pre/B 07 §1.7 заголовок, контекст, извлечение",
    marker="### Беседа 1.7: Граф категорий, 3D + 2D (клиент)",
)

# ══════════════════════════════════════════════════════════════════
# C. 07 §1.7: зависимости three/d3 первым пунктом
# ══════════════════════════════════════════════════════════════════
patch(
    "docs/07-conversation-protocol.md",
    """Создай:
1. client/components/graph/graph-utils.ts:""",
    """Создай:
0. Зависимости клиента (client/package.json) — их НЕТ после 0.4:
   three@0.128.x (исходник рассчитан на r128) + @types/three,
   d3@^7.8.5 + @types/d3. Исходник грузил обе библиотеки тегами
   <script> с cdnjs — в React-клиенте нужны npm-пакеты; CDN в
   песочнице закрыт egress-прокси, тесты через него не пройдут.

1. client/components/graph/graph-utils.ts:""",
    "16pre/C 07 §1.7 зависимости three/d3",
    marker="0. Зависимости клиента (client/package.json)",
)

# ══════════════════════════════════════════════════════════════════
# D. 07 §1.7: кнопки экспорта — заглушки TODO(4.2)
# ══════════════════════════════════════════════════════════════════
patch(
    "docs/07-conversation-protocol.md",
    """   - Кнопки экспорта (MMD, PNG, JSON)""",
    """   - Кнопки экспорта (MMD, PNG, JSON) — ЗАГЛУШКИ с TODO(4.2):
     exportMMD/exportPNG/exportJSON реализуются как серверные сервисы
     в беседе 4.2 (services/export/*) и в фрагмент 1.7 не входят
     (обрыв на 16366, exportMMD с 16370). Здесь — только разметка
     кнопок и обработчики-заглушки""",
    "16pre/D 07 §1.7 кнопки экспорта → TODO(4.2)",
    marker="ЗАГЛУШКИ с TODO(4.2)",
)

# ══════════════════════════════════════════════════════════════════
# E. 07 §1.7: client/api/elements.ts создаётся здесь
# ══════════════════════════════════════════════════════════════════
patch(
    "docs/07-conversation-protocol.md",
    """Дополнительные задачи:
- getStructuralMarkers(name): возвращает МАССИВ маркеров""",
    """10. client/api/elements.ts — модуль создаётся ЗДЕСЬ (в контексте
    беседы он числился готовым, но не создавался никем; беседа 5.2
    говорит о нём «расширение»):
    - getCategories(synthesisId) → { categories, edges, clusters, topology }

Дополнительные задачи:
- getStructuralMarkers(name): возвращает МАССИВ маркеров""",
    "16pre/E 07 §1.7 создание client/api/elements.ts",
    marker="модуль создаётся ЗДЕСЬ (в контексте",
)

# ══════════════════════════════════════════════════════════════════
# F. 07 §1.7: edge case — пустой граф, доступ, touch
# ══════════════════════════════════════════════════════════════════
patch(
    "docs/07-conversation-protocol.md",
    """- «Edge case: граф с 1 узлом (без рёбер) — рендерится без ошибок. Граф с рефлексивной связью — петля отображается. Мобильный touch: pinch-zoom, single-touch orbit, tap для select»""",
    """- «Edge case: граф с 1 узлом (без рёбер) — рендерится без ошибок. Граф без категорий вообще (пустые массивы из GET /categories) — модалка показывает пустое состояние, не падает. Граф с рефлексивной связью — петля отображается. Чужой публичный синтез — граф открывается, чужой непубличный — 403»
- «Мобильный touch: pinch-zoom, single-touch orbit, tap для select. В puppeteer это Input.dispatchTouchEvent через CDP — если харнесс не тянет, зафиксируй как ручную проверку и вынеси в TODO, не имитируй тест мышью»""",
    "16pre/F 07 §1.7 edge case (пустой граф, доступ, touch через CDP)",
    marker="Input.dispatchTouchEvent через CDP",
)

# ══════════════════════════════════════════════════════════════════
# G. 07 §11: зависимости
# ══════════════════════════════════════════════════════════════════
patch(
    "docs/07-conversation-protocol.md",
    """      ├── 1.6 (DocumentView, CatalogPage)
      ├── 1.7 (Graph3D, Graph2D, GraphModal, NodePanel)
""",
    """      ├── 1.6b (DocumentView, CatalogPage) ← требует также 1.6 (роуты чтения)
      ├── 1.7 (Graph3D, Graph2D, GraphModal, NodePanel) ← требует также
      │        1.6 (GET /categories) и 1.6b (SynthesisPage — хозяин модалки)
""",
    "16pre/G1 07 §11 ветка 0.4",
    marker="← требует также 1.6 (роуты чтения)",
)

patch(
    "docs/07-conversation-protocol.md",
    "2.3 (бейдж качества контекста на карточке раздела) ← 2.4 (context-quality.ts, getSectionContextQuality)\n",
    "1.6 (роуты чтения: syntheses, sections, categories) ← 1.4 (данные, WS) + 1.4b (pausedState/pauseEstimates)\n"
    "1.6b (просмотр документа и каталог) ← 0.4 + 1.6 (роуты) + 1.5 (useStreamingGeneration, PauseModal)\n"
    "1.7 (граф) ← 0.4 + 1.6 (GET /categories) + 1.6b (SynthesisPage)\n"
    "2.3 (бейдж качества контекста на карточке раздела) ← 2.4 (context-quality.ts, getSectionContextQuality)\n",
    "16pre/G2 07 §11 связи вне дерева",
    marker="1.6 (роуты чтения: syntheses, sections, categories) ←",
)

patch(
    "docs/07-conversation-protocol.md",
    "- После 0.4: беседы 1.5, 1.6, 1.7 можно вести параллельно",
    "- После 0.4: беседы 1.5 и 1.6 можно вести параллельно (1.6 серверная,\n"
    "  от клиента не зависит). 1.6b и 1.7 — только после 1.6; 1.7 удобнее\n"
    "  после 1.6b, потому что кнопка графа живёт в actions-bar документа",
    "16pre/G3 07 §11 порядок после 0.4",
    marker="1.6b и 1.7 — только после 1.6",
)

# ══════════════════════════════════════════════════════════════════
# H. 07: ссылки «(из 1.6)» на клиентские файлы → 1.6b
# ══════════════════════════════════════════════════════════════════
patch(
    "docs/07-conversation-protocol.md",
    "`client/components/document/SectionView.tsx` (из 1.6), `client/api/elements.ts`",
    "`client/components/document/SectionView.tsx` (из 1.6b), `client/api/elements.ts` (из 1.7)",
    "16pre/H1 07 ссылка Фазы 5 на SectionView и api/elements",
)

patch(
    "docs/07-conversation-protocol.md",
    "- Клиентские: `client/components/graph/GraphModal.tsx` (из 1.7), `client/components/document/SectionView.tsx` (из 1.6)",
    "- Клиентские: `client/components/graph/GraphModal.tsx` (из 1.7), `client/components/document/SectionView.tsx` (из 1.6b)",
    "16pre/H2 07 ссылка 5.5 на SectionView",
)

patch(
    "docs/07-conversation-protocol.md",
    "5.5 (representation-transformer, TransformPanel) ← 1.4 (graph-parser, streaming) + 0.3b (taxonomy) + 1.7 (GraphModal) + 1.6 (SectionView)\n"
    "5.2 (ElementEditor UI) ← 5.1 + 1.7 (NodePanel) + 1.6 (SectionView)\n",
    "5.5 (representation-transformer, TransformPanel) ← 1.4 (graph-parser, streaming) + 0.3b (taxonomy) + 1.7 (GraphModal) + 1.6b (SectionView)\n"
    "5.2 (ElementEditor UI) ← 5.1 + 1.7 (NodePanel) + 1.6b (SectionView)\n",
    "16pre/H3 07 §11 ссылки 5.5/5.2 на SectionView",
)

# ══════════════════════════════════════════════════════════════════
# I. 07: предупреждение об extract-fragments.py
# ══════════════════════════════════════════════════════════════════
patch(
    "docs/07-conversation-protocol.md",
    "`python3 scripts/extract-fragments.py philosynth.html fragments/`",
    "`python3 scripts/extract-fragments.py philosynth.html fragments/`\n"
    "> **ВНИМАНИЕ (2026-07-30):** скрипта `scripts/extract-fragments.py` в\n"
    "> репозитории НЕТ, хотя шапки всех фрагментов на него ссылаются.\n"
    "> Пока он не восстановлен, недостающие комплекты извлекаются вручную\n"
    "> из `source/philosynth.html` по диапазонам (образцы — блоки\n"
    "> «Извлечение» бесед 1.6b и 1.7). Восстановление скрипта — задача\n"
    "> эксплуатации, не беседа протокола.",
    "16pre/I 07 предупреждение об extract-fragments.py",
    marker="ВНИМАНИЕ (2026-07-30):** скрипта",
)

# ══════════════════════════════════════════════════════════════════
# J–N. 03-specification
# ══════════════════════════════════════════════════════════════════
# ВНИМАНИЕ: строка «→ { items: SynthesisPreview[], total }» уже есть у
# /syntheses/public, поэтому якорь и проба берутся ТРЁХСТРОЧНЫМ блоком —
# иначе patch() ложно уходит в skip (грабля прогона 1).
patch(
    "docs/03-specification.md",
    """GET    /syntheses              ?page=1&limit=20&sort=createdAt&order=desc
                               &status=ready&method=dialectical&search=...
                                → { items: Synthesis[], total: number }""",
    """GET    /syntheses              ?page=1&limit=20&sort=createdAt&order=desc
                               &status=ready&method=dialectical&search=...
                                → { items: SynthesisPreview[], total: number }""",
    "16pre/J 03 §2.2 тип ответа GET /syntheses",
)

patch(
    "docs/03-specification.md",
    """GET    /syntheses/:id          → { synthesis: SynthesisFull }

DELETE /syntheses/:id          → { ok: true }

PATCH  /syntheses/:id          { title?, isPublic? }
                                → { synthesis: SynthesisFull }
""",
    """GET    /syntheses/:id          → { synthesis: SynthesisFull }
                                // Доступ: владелец ИЛИ is_public = true
                                // (каталог «Публичные» ведёт на чужой
                                // /synthesis/:id). Иначе 403 FORBIDDEN;
                                // несуществующий id → 404 NOT_FOUND.
                                // Реализация — беседа 1.6 (сервер).

DELETE /syntheses/:id          → { ok: true }
                                // Только владелец (иначе 403).

PATCH  /syntheses/:id          { title?, isPublic? }
                                → { synthesis: SynthesisFull }
                                // Только владелец. Единственный способ
                                // опубликовать синтез — без него вкладка
                                // «Публичные» недостижима из UI.
""",
    "16pre/K 03 §2.2 доступ к /syntheses/:id",
    marker="каталог «Публичные» ведёт на чужой",
)

patch(
    "docs/03-specification.md",
    """  pausedState: PausedState | null;      // v11: см. 02-data-model (syntheses.paused_state)
  isPublic: boolean;
  sectionOrder: string[];
""",
    """  pausedState: PausedState | null;      // v11: см. 02-data-model (syntheses.paused_state)
  pauseEstimates: PauseEstimates | null; // v11: оценки действий паузы —
                                        // computePauseEstimates(id, ps)
                                        // из pause-resume-service (1.4b),
                                        // fail-open {}; null при pausedState
                                        // = null. В NEXT-CONTEXT (гл. 1.4b)
                                        // поле названо просто estimates —
                                        // здесь развёрнуто, чтобы не путать
                                        // с оценкой стоимости /estimate
  isPublic: boolean;
  docNum: string;                       // «PS-NNNN-XXXX» — заполняется при
                                        // создании записи (формат исходника
                                        // [12110]); шапка документа
  sectionOrder: string[];
""",
    "16pre/L 03 §2.2 SynthesisFull += docNum, pauseEstimates",
    marker="pauseEstimates: PauseEstimates | null;",
)

patch(
    "docs/03-specification.md",
    """  contextQualityScore: number | null;  // v11: getSectionContextQuality
                                       // (01 §4.15 п.3) — 0–100 либо null,
                                       // если ctxLog по разделу отсутствует;
                                       // цветной бейдж в Edit Modal
  updatedAt: string;
""",
    """  contextQualityScore: number | null;  // v11: getSectionContextQuality
                                       // (01 §4.15 п.3) — 0–100 либо null,
                                       // если ctxLog по разделу отсутствует;
                                       // цветной бейдж в Edit Modal.
                                       // ДО беседы 2.4 (context-quality.ts
                                       // ещё не создан) роут отдаёт null —
                                       // TODO(2.4)
  subsections: string[];               // имена data-section внутри HTML —
                                       // нужны TableOfContents (беседа 1.6b)
                                       // для якорей второго уровня;
                                       // parseSubsectionsFromHTML (1.4)
  updatedAt: string;
""",
    "16pre/M 03 §2.3 SectionSummary (null до 2.4, subsections)",
    marker="ДО беседы 2.4 (context-quality.ts",
)

patch(
    "docs/03-specification.md",
    """GET    /syntheses/:id/categories
                                → { categories: Category[], edges: CategoryEdge[],
                                    clusters: ClusterLabel[], topology: TopologyInfo }
""",
    """GET    /syntheses/:id/categories
                                → { categories: Category[], edges: CategoryEdge[],
                                    clusters: ClusterLabel[], topology: TopologyInfo }
                                // Доступ: владелец ИЛИ is_public = true.
                                // Реализация — беседа 1.6 (сервер): граф
                                // нужен клиентской беседе 1.7, а остальной
                                // routes/elements.ts (PATCH категорий,
                                // связей, тезисов, глоссария) остаётся
                                // беседе 5.1 в Фазе 5.
""",
    "16pre/N 03 §2.4 доступ и владелец GET /categories",
    marker="Реализация — беседа 1.6 (сервер): граф",
)

# ══════════════════════════════════════════════════════════════════
# O. 04: рендер документа в карте переиспользования
# ══════════════════════════════════════════════════════════════════
patch(
    "docs/04-code-reuse-map.md",
    "| `syncFormFromImport()` | React state sync |\n",
    "| `buildTableOfContents()` [11621] — якоря `#sec-{key}` / `#subsec-{key}-{slug}`, кнопки ⏫, пропуск `capsule` | `client/components/document/TableOfContents.tsx` (беседа 1.6b) |\n"
    "| `makeHeaderDisclosure()` / `buildDocHeaderExtras()` [11599/11613], заполнение шапки [12110–12144] (docNum, дата, ML/DL/SL, три ветки подзаголовка) | `client/components/document/DocumentHeader.tsx` (1.6b); docNum генерирует сервер в беседе 1.6 |\n"
    "| `updateCapsuleInHeader()` [11773] + `removeCapsuleFromDocBodies()` [11822] — капсула живёт в шапке, а не среди тел | `DocumentHeader.tsx` + исключение ключа `capsule` в `DocumentView.tsx` (1.6b) |\n"
    "| `updateFooterCost()` [5671] — «Токены: … · Стоимость: $X.XXXX (N¢)» | `client/components/document/DocumentFooter.tsx` (1.6b); значение берётся из `syntheses.total_cost_usd`, НЕ пересчитывается по ставкам |\n"
    "| CSS документа [476–929, 3304–3319]: `.doc-header`, `#docTOC`, `.doc-section`, `.doc-content`, `.doc-table`, `.callout*`, `.risk*`, `.doc-footer` | `client/src/globals.css` (1.6b) — обязательны для рендера html_content через dangerouslySetInnerHTML |\n"
    "| graph-STATE [4389–4413]: `G`, `roleMode`, `legendFilter`, `clusterVisible`, `clearLegendFilter()` | `client/components/graph/graph-utils.ts` (1.7) — лежит ВНЕ основного фрагмента 1.7-graph-viz.js |\n"
    "| `syncFormFromImport()` | React state sync |\n",
    "16pre/O 04 §3 строки рендера документа и graph-STATE",
    marker="`buildTableOfContents()` [11621]",
)

# ══════════════════════════════════════════════════════════════════
# P. 05: владельцы файлов
# ══════════════════════════════════════════════════════════════════
patch(
    "docs/05-file-structure.md",
    "│   │   ├── sections.ts                 # GET /syntheses/:id/sections, /:key, /:key/context",
    "│   │   ├── sections.ts                 # GET /syntheses/:id/sections, /:key, /:key/context\n"
    "│   │   │                               # (создаёт беседа 1.6 — до 2026-07-30\n"
    "│   │   │                               #  модуль не был назначен ни одной беседе)",
    "16pre/P1 05 владелец routes/sections.ts",
    marker="до 2026-07-30",
)

patch(
    "docs/05-file-structure.md",
    "│   │   ├── elements.ts                 # GET/PATCH categories, theses, glossary",
    "│   │   ├── elements.ts                 # GET/PATCH categories, theses, glossary\n"
    "│   │   │                               # GET /categories — беседа 1.6 (нужен 1.7),\n"
    "│   │   │                               # остальное (PATCH, theses, glossary) — 5.1",
    "16pre/P2 05 владелец routes/elements.ts",
    marker="GET /categories — беседа 1.6 (нужен 1.7)",
)

patch(
    "docs/05-file-structure.md",
    "│   │   │   ├── elements.ts\n",
    "│   │   │   ├── elements.ts             # создаёт беседа 1.7 (getCategories),\n"
    "│   │   │   │                           # расширяет 5.2\n",
    "16pre/P3 05 владелец client/api/elements.ts",
    marker="создаёт беседа 1.7 (getCategories)",
)

patch(
    "docs/05-file-structure.md",
    "│   │   │   │   └── CatalogFilters.tsx      # Фильтры и поиск",
    "│   │   │   │   └── CatalogFilters.tsx      # Фильтры и поиск (C5 — Фаза 2;\n"
    "│   │   │   │                               #  в беседе 1.6b не создаётся,\n"
    "│   │   │   │                               #  поиск живёт в CatalogPage)",
    "16pre/P4 05 CatalogFilters вне 1.6b",
    marker="C5 — Фаза 2;",
)

patch(
    "docs/05-file-structure.md",
    "│   │   │       ├── LoadingSpinner.tsx",
    "│   │   │       ├── LoadingSpinner.tsx      # первый потребитель — 1.6b\n"
    "│   │   │       │                           # (status='generating', загрузка)",
    "16pre/P5 05 LoadingSpinner — потребитель 1.6b",
    marker="первый потребитель — 1.6b",
)

# ══════════════════════════════════════════════════════════════════
# Q. 06: синхронизация с 07
# ══════════════════════════════════════════════════════════════════
patch(
    "docs/06-dev-strategy.md",
    """**1.6. Просмотр документа (клиент)**
- `SynthesisPage.tsx`: загрузка данных, рендер
- `DocumentView.tsx`, `DocumentHeader.tsx`, `SectionView.tsx`, `TableOfContents.tsx`
- `GET /syntheses/:id`, `GET /syntheses/:id/sections`
""",
    """**1.6. Просмотр документа (клиент)**
- `SynthesisPage.tsx`: загрузка данных, рендер
- `DocumentView.tsx`, `DocumentHeader.tsx`, `SectionView.tsx`, `TableOfContents.tsx`
- `DocumentFooter.tsx`; CSS документа из исходника → `globals.css`
- `GET /syntheses/:id`, `GET /syntheses/:id/sections` (+ `server/routes/sections.ts`)

> **Соответствие протоколу (2026-07-30):** нумерация 06 и 07 в Фазе 1
> совпадает не везде. В 07 задачи 1.6 (просмотр) и 1.8 (каталог) этого
> документа объединены в клиентскую беседу **1.6b**, а весь серверный
> транспорт чтения (роуты syntheses, sections, categories) вынесен в
> отдельную беседу **1.6**. Кроме того: 06 §1.1 ≈ беседы 07 1.1+1.2,
> 06 §1.3 ≈ 07 1.4+1.4b; бесед 1.4b и 1.5b в 06 нет вовсе.
> Источник истины по составу беседы — 07.
""",
    "16pre/Q1 06 §1.6 + примечание о соответствии",
    marker="Соответствие протоколу (2026-07-30)",
)

patch(
    "docs/06-dev-strategy.md",
    """**1.8. Каталог (клиент)**
- `CatalogPage.tsx`, `SynthesisList.tsx`, `SynthesisCard.tsx`
- `GET /syntheses` (свои), `GET /syntheses/public`
""",
    """**1.8. Каталог (клиент)** — в протоколе 07 выполняется внутри беседы 1.6b
- `CatalogPage.tsx`, `SynthesisList.tsx`, `SynthesisCard.tsx`
- `GET /syntheses` (свои), `GET /syntheses/public`, `PATCH /syntheses/:id`
  (публикация — без неё вкладка «Публичные» недостижима из UI)
""",
    "16pre/Q2 06 §1.8 — внутри беседы 1.6b",
    marker="в протоколе 07 выполняется внутри беседы 1.6b",
)

patch(
    "docs/06-dev-strategy.md",
    "- `graph-physics.ts` (tick, warmup)\n- `GET /syntheses/:id/categories`\n",
    "- `graph-physics.ts` (tick, warmup)\n"
    "- `client/api/elements.ts` (getCategories) — модуль создаётся здесь\n"
    "- зависимости: three@0.128.x, d3@^7.8.5 (+ типы) — в client/package.json их нет\n"
    "- `GET /syntheses/:id/categories` — роут делает серверная беседа 07 §1.6,\n"
    "  а не эта: прежде он рождался только в 5.1, через две фазы после графа\n",
    "16pre/Q3 06 §1.7 — владелец роута и зависимости",
    marker="роут делает серверная беседа 07 §1.6",
)

# ══════════════════════════════════════════════════════════════════
# R. README
# ══════════════════════════════════════════════════════════════════
patch(
    "README.md",
    """Следующая по графу 07 — беседа 1.6 (страница синтеза + каталог;
закроет TODO(1.6): pausedState из GET /syntheses/:id и полноценный
просмотр импортированной концепции) либо параллельно 1.7 (граф) /
2.1 (cascade-analyzer) / 3.1 (мета-синтез).""",
    """Следующая по графу 07 — беседа 1.6, **серверная**: транспорт чтения
(GET/PATCH/DELETE `/syntheses`, `routes/sections.ts`, GET
`/syntheses/:id/categories`, заполнение `doc_num`, режим «только
подписка» для WS). За ней клиентские 1.6b (просмотр документа +
каталог; закроет TODO(1.6) — pausedState из GET /syntheses/:id) и 1.7
(граф). Параллельно серверной 1.6 можно вести 1.5 / 2.1 / 3.1.

Перед этой связкой снят предпатч доков
`scripts/patch-docs-conv16-pre.py` (идемпотентный). Он разделил беседу
1.6 по шву сервер/клиент, перенёс GET `/categories` из 5.1 в серверную
1.6, вписал недостающие роуты, диапазоны исходника, зависимости
three/d3 и блоки принятых решений; сгенерировал комплекты вложений
`1.6-document-view.js` и `1.7-graph-state-extras.js`. Учтите: скрипта
`scripts/extract-fragments.py`, на который ссылаются шапки фрагментов,
в репозитории нет — комплекты извлекаются вручную из `source/`.""",
    "16pre/R README — разделение 1.6 и предпатч",
    marker="Перед этой связкой снят предпатч доков",
)

# ══════════════════════════════════════════════════════════════════
# S. NEXT-CONTEXT: глава
# ══════════════════════════════════════════════════════════════════
CHAPTER = """

---

# Предподготовка бесед 1.6 / 1.6b / 1.7 — аудит и разделение [ЗАКРЫТА]

Беседы не велись: это аудит комплекта документации на готовность к
клиентским беседам Фазы 1 и предпатч по его итогам
(`scripts/patch-docs-conv16-pre.py`, идемпотентный, skip/fail-отчёт).

## Системный дефект

07 писался так, будто REST-слой чтения уже существует. Дефект
повторился трижды: 1.6 (просмотр/каталог), 1.7 (граф) и — в 06 — 1.8
(каталог). Реализованы на момент аудита были только `POST /syntheses`,
`/estimate`, `/advice`. **Проверить тем же способом 2.3, 2.4 и 3.2 до
того, как за них браться.**

## Принятое решение

Беседа 1.6 разделена по шву сервер/клиент:

| Беседа | Содержание |
|---|---|
| **1.6** | Транспорт чтения (сервер): `routes/syntheses.ts` (GET список / public / `:id`, PATCH, DELETE), новый `routes/sections.ts`, GET-часть `routes/elements.ts`, `doc_num` в POST, режим «только подписка» в `ws/handler.ts` |
| **1.6b** | Просмотр документа + каталог (клиент): CSS документа, `document/` ×5, `catalog/` ×2, `SynthesisPage`, `CatalogPage`, `api/sections.ts`, `synthesis-store.ts` |
| **1.7** | Граф категорий (клиент): теперь чисто клиентская, плюс `client/api/elements.ts` и зависимости three/d3 |

Обоснование: разные харнессы тестов (mini-Hono + живой PG против
puppeteer + vite + Chromium), почти непересекающиеся комплекты
вложений, риск сжатия контекста в одном заходе, прецедент 0.5/0.6.
GET `/categories` отдан серверной 1.6, а не 1.7: в `routes/` уже открыт
тот же слой, и одним заходом закрываются syntheses + sections +
categories. PATCH-часть `elements.ts` честно остаётся 5.1.

## Что было не так (и чем закрыто)

1. Серверной части бесед не существовало в 07 → беседа 1.6.
2. `server/routes/sections.ts` не создавала ни одна беседа (класс
   `routes/taxonomy.ts`) → беседа 1.6.
3. `GET /syntheses/:id/categories` рождался в 5.1 — через две фазы
   после графа → перенесён в 1.6.
4. `client/api/elements.ts` не создавал никто (5.2 — «расширение») →
   создаётся в 1.7.
5. `three` (r128) и `d3` (7.8.5) отсутствуют в `client/package.json`;
   исходник грузил их с cdnjs, а CDN закрыт egress-прокси → пункт 0
   первого запроса 1.7.
6. Кнопки экспорта MMD/PNG/JSON в GraphModal конфликтовали с 4.2 и в
   фрагмент 1.7 не входят (обрыв на 16366, `exportMMD` с 16370) →
   заглушки с TODO(4.2).
7. «Исходник: НЕ НУЖЕН» у 1.6 — неверно; фрагмента не было → создан
   `1.6-document-view.js`.
8. graph-STATE (`G`, `roleMode`, `legendFilter`, `clearLegendFilter`)
   лежит вне фрагмента 1.7 → создан `1.7-graph-state-extras.js`.
9. `doc_num` есть в схеме и shared-типе, но не заполнялся никем и
   отсутствовал в 03 §2.2 → пункт 4 запроса 1.6 + правка §2.2.
10. `contextQualityScore` обязателен в §2.3, а `context-quality.ts` —
    беседа 2.4 → явное `null` + TODO(2.4).
11. Правила доступа к чужому публичному синтезу не заданы; `PATCH
    /syntheses/:id` не назначен никому → §2.2/§2.4 + запрос 1.6.
12. §2.2: `items: Synthesis[]` — несуществующий тип.
13. Оценки паузы из TODO(1.6) некуда было положить → `pauseEstimates`
    в `SynthesisFull`.
14. `subsections` не было в `SectionSummary` → добавлено (нужно TOC).
15. `subscribe_generation` при `generating` без активного прогона
    ЗАПУСКАЕТ генерацию → режим «только подписка» (пункт 5 запроса 1.6).
16. Футер исходника пересчитывает стоимость из токенов → берём
    `total_cost_usd` из БД.
17. §11 занижал зависимости; ссылки «(из 1.6)» в Фазе 5 указывают на
    клиентские файлы → перенумерованы в 1.6b.
18. `scripts/extract-fragments.py` отсутствует в репозитории →
    предупреждение в 07.

## Карта исходника для 1.6b (диапазоны выверены)

- CSS документа — **476–929** (с 931 начинается граф-модалка 1.7):
  `.doc-header/.doc-type/.doc-title/.doc-subtitle/.doc-meta-*` [482–555],
  `#docTOC/.toc-*` [556–624], **ядро** `.doc-section/.section-num/
  .section-title/.doc-content/.doc-table/.callout*` [625–757],
  `.risk*` [790–814], `.doc-footer/.validity-stamp` [855–886],
  `.actions-bar/.action-btn` [887–929]; legacy `.sig-block*` [758–789]
  и `.graph-node/.graph-edge` [815–836] нужны только импортированным
  документам. Отдельно `.doc-title-edit-btn` [3304–3319],
  `.import-indicator` [2631–2650] (это уже 4.3).
- Разметка-эталон — **4134–4220**.
- JS-блок «HELPER: раскрывающиеся поля шапки и разделов» —
  **11594–11892** целиком: `makeHeaderDisclosure` [11599],
  `buildDocHeaderExtras` [11613], **`buildTableOfContents` [11621–11712]**
  (якоря `#sec-{key}` и `#subsec-{key}-{slug}` со slug'ом «не-буквенно-
  цифровое → _», пропуск `capsule`, метки `KEY_LABELS`, подразделы из
  `buildSubsectionMap`, кнопки ⏫), `extractCapsuleText` [11720]
  (уже портирован в 1.5b — `client/src/utils/concept-file.ts`),
  `updateCapsuleInHeader` [11773], `removeCapsuleFromDocBodies` [11822],
  `makeSectionCtxDisclosure` [11832], `editDocTitle` [11845],
  `updateDocTitleFromName` [11871].
- Заполнение шапки при старте — **12110–12144** (формат docNum, дата
  ru-RU, ML/DL/SL, три ветки подзаголовка, `footerPhil`).
- `updateFooterCost` — **5671–5683**.
- НЕ портировать: `rebuildDbMapping` [5686] и индексацию `db{N}` /
  `DOC_STATE.sectionDbIdx` — React адресует разделы по `key`.

## Карта исходника для 1.7

- Основной фрагмент `1.7-graph-viz.js` — **12990–16366**, и он полон:
  `_TC_HUE_SEEDS`/`_EC_*`/`CPAL` [13001–13116], `_rebuildNodeColors`
  [13010], `_rebuildEdgeStyles` [13070], `_hexToHSL`/`_blendHex`
  [13139/13176], `edgeTypeStyle` [13198], `typeColor`/`typeColorHex`
  [13534/13547], `getStructuralMarkers` [13565], `polyPath` [13649],
  `nodeSymbolPath` [13683], `nodeGeometry3D` [13707], `warmup` [13759],
  `build3D`, `build2D`, `showNodePanel`, `showEdgePanel`, `buildLegend`.
- Вне его — только graph-STATE **4389–4413** (`G`, `graphAPI3d/2d`,
  `roleMode`, `clusterVisible`, `legendFilter`, `clearLegendFilter`).
- `exportMMD` начинается с **16370** — намеренно вне фрагмента,
  принадлежит беседе 4.2.

## Что предпатч НЕ делает (задачи самих бесед)

- Реализация роутов, страниц и графа; перенос CSS в `globals.css`.
- Установка three/d3 в `client/package.json` (патч доков код не трогает).
- Заполнение `doc_num` в POST /syntheses.
- Режим «только подписка» в `ws/handler.ts`.
- Восстановление `scripts/extract-fragments.py` — задача эксплуатации.
"""


def append_chapter() -> None:
    tag = "16pre/S NEXT-CONTEXT глава предподготовки 1.6/1.6b/1.7"
    p = Path("NEXT-CONTEXT.md")
    if not p.exists():
        failed.append(f"{tag}: файл не найден"); return
    s = p.read_text(encoding="utf-8")
    if "# Предподготовка бесед 1.6 / 1.6b / 1.7 — аудит и разделение [ЗАКРЫТА]" in s:
        skipped.append(tag); return
    p.write_text(s.rstrip("\n") + CHAPTER + "\n", encoding="utf-8")
    applied.append(tag)


append_chapter()


# ══════════════════════════════════════════════════════════════════
# T–U. Генерация фрагментов из исходника
# ══════════════════════════════════════════════════════════════════
SOURCE_PATH = "source/philosynth.html"

HEADER_TMPL = """// Фрагменты philosynth.html (26 024 стр., ревизия 2026-07)
// для беседы %s.
//
// ВНИМАНИЕ: извлечено scripts/patch-docs-conv16-pre.py, а НЕ
// extract-fragments.py — того скрипта в репозитории нет. Диапазоны
// выверены аудитом 2026-07-30; при обновлении исходника перепроверить.
//
%s
"""

FRAGMENTS = [
    {
        "path": "docs/fragments-for-conversations/1.6-document-view.js",
        "tag": "16pre/T фрагмент 1.6-document-view.js",
        "title": "1.6b — просмотр документа (каталог — новый код)",
        "note": "// НЕ входит намеренно: rebuildDbMapping [5686] и индексация db{N} /\n"
                "// DOC_STATE.sectionDbIdx (в React разделы адресуются по key);\n"
                "// .output-wrap (видимостью управляет маршрут); граф-модалка (1.7).",
        "ranges": [
            ("CSS документа: шапка, #docTOC, тела разделов, .doc-table, "
             ".callout, .risk, футер, actions-bar", 476, 929),
            (".doc-title-edit-btn", 3304, 3319),
            ("Разметка-эталон: output-wrap + #docOutput (шапка, #docBodies, футер)",
             4134, 4220),
            ("updateFooterCost — формат строки стоимости в футере", 5671, 5683),
            ("HELPER: раскрывающиеся поля шапки и разделов — makeHeaderDisclosure, "
             "buildDocHeaderExtras, buildTableOfContents, extractCapsuleText, "
             "restoreCapsulesFromHTML, updateCapsuleInHeader, "
             "removeCapsuleFromDocBodies, makeSectionCtxDisclosure, editDocTitle, "
             "updateDocTitleFromName", 11594, 11892),
            ("Заполнение шапки при старте генерации: docNum, дата, ML/DL/SL, "
             "три ветки подзаголовка, footerPhil", 12110, 12144),
        ],
    },
    {
        "path": "docs/fragments-for-conversations/1.7-graph-state-extras.js",
        "tag": "16pre/U фрагмент 1.7-graph-state-extras.js",
        "title": "1.7 — дополнение к 1.7-graph-viz.js",
        "note": "// Основной фрагмент 1.7-graph-viz.js покрывает 12990–16366 и полон.\n"
                "// Вне его осталось только объявление graph-STATE: G, graphAPI3d/2d,\n"
                "// roleMode, clusterVisible, legendFilter и clearLegendFilter —\n"
                "// протокол требует их в graph-utils.ts, но извлечение по баннерам\n"
                "// GRAPH MODAL…MMD EXPORT их не захватывало.\n"
                "//\n"
                "// Блок начинается с середины объявления через запятую: выше по\n"
                "// тексту идут переменные STATE, к графу не относящиеся.",
        "ranges": [
            ("graph-STATE и clearLegendFilter", 4389, 4413),
        ],
    },
]


def build_fragments() -> None:
    src = Path(SOURCE_PATH)
    if not src.exists():
        failed.append(f"16pre/T–U: не найден {SOURCE_PATH}"); return
    lines = src.read_text(encoding="utf-8").split("\n")
    for spec in FRAGMENTS:
        tag = spec["tag"]
        parts = [HEADER_TMPL % (spec["title"], spec["note"])]
        bad = False
        for label, a, b in spec["ranges"]:
            if b > len(lines):
                failed.append(f"{tag}: диапазон {a}-{b} вне файла ({len(lines)} строк)")
                bad = True
                break
            parts.append(
                "\n// \u2500\u2500\u2500\u2500\u2500 [%s]\n// philosynth.html строки %d\u2013%d \u2500\u2500\u2500\u2500\u2500\n%s"
                % (label, a, b, "\n".join(lines[a - 1:b]))
            )
        if bad:
            continue
        content = "\n".join(parts).rstrip("\n") + "\n"
        p = Path(spec["path"])
        if p.exists() and p.read_text(encoding="utf-8") == content:
            skipped.append(tag); continue
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        applied.append(tag)


build_fragments()


print("APPLIED:", len(applied))
for t in applied: print("  +", t)
print("SKIPPED:", len(skipped))
for t in skipped: print("  =", t)
print("FAILED:", len(failed))
for t in failed: print("  !", t)
raise SystemExit(1 if failed else 0)
