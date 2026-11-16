#!/usr/bin/env python3
"""Патч документации по итогам беседы 18.1 (поиск концепций — бэкенд).

Часть I — первый запрос (2026-11-16). Идемпотентный: каждая правка проверяет
наличие нового текста (marker) и уходит в skip при повторном прогоне. Отчёт
applied/skip/fail. Запуск из корня репозитория:
    python3 scripts/patches/patch-docs-conv181.py

Правки части I:
  181/A  02: ER-дерево; индекс триграмм зерна; индексы точного термина
         глоссария; новая таблица §2.42 synthesis_search.
  181/B  03: преамбула §2 — четвёртый гостевой путь; §2.2 — уточнение
         параметра philosopher публичного каталога (прямой участник, не
         «как §2.8») и неэкранированного search; §2.21 — маршрут поиска.
  181/C  01: §6 — гостевых путей четыре; поиск и видимость.
  181/D  04: строка новых модулей.
  181/E  05: файлы беседы.
  181/F  07: указатель «По факту 18.1 (первый запрос)»; §12 — Д-87, Д-88
         (адресат «не назначен»), хроника правила 3.
  181/G  08: Часть I — строка беседы; Часть II — глава «Беседа 18.1».
  181/H  09: уроки (§3, §4); §10 «Что 18.1 оставила знать всем беседам».
  181/I  (NEXT-CONTEXT — в части II.)

Часть I-б — тестовые запросы 2–4 и сверка после сжатия контекста
(2026-11-16, один заход):
  181/J  07: указатель «По факту 18.1 (тестовые запросы 2–4)»; 08: подраздел
         главы; 05: харнесс; 09: уроки §4 и недостающий блок §10
         «Что 16.1–17.2 оставили» (текст 18.1 ссылается на него, блока не было).

Часть II — завершение беседы (2026-11-16):
  181/L  07: указатель «По факту 18.1 (завершение)»; врезка «Фаза 18» —
         18.1 закрыта; §12 — журнал закрытия; пометка от 18.1 в тексте 18.2.
  181/M  08: Часть I, заголовок и подраздел главы, Часть V (прежний снимок
         состояния и комплект 18.1).
  181/N  09: урок §2 (сжатие контекста посреди запроса).
  181/O  README: строка Фазы 18.
  181/P  NEXT-CONTEXT: состояние «18.1 ЗАКРЫТА», универсальный минимум,
         перечень серий, комплект 18.2.

Часть III — долги после завершения (2026-11-16, по слову пользователя):
  181/Q  Д-87 сделан здесь же (удаление раздела снимает строки глоссария и
         тезисов и спутников элементов; без снимков версий): строка не
         остаётся в §12, а уходит в 08 Часть IV; Д-88 — адресат 18.3, вписан
         в её текст. 03 (E3), 05, 08 (подраздел главы), 09.
Доки беседы до коммита собираются ОДНИМ прогоном от HEAD (урок 17.1): тексты
частей I–II несут уже итоговое состояние.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
P01 = ROOT / "docs" / "01-architecture.md"
P02 = ROOT / "docs" / "02-data-model.md"
P03 = ROOT / "docs" / "03-specification.md"
P04 = ROOT / "docs" / "04-code-reuse-map.md"
P05 = ROOT / "docs" / "05-file-structure.md"
P07 = ROOT / "docs" / "07-conversation-protocol.md"
P08 = ROOT / "docs" / "08-history.md"
P09 = ROOT / "docs" / "09-lessons.md"
NEXT = ROOT / "NEXT-CONTEXT.md"
README = ROOT / "README.md"

applied = 0
skipped = 0
failed = 0


def patch(path: Path, old: str, new: str, label: str, marker: str | None = None) -> None:
    """Заменяет old → new; идемпотентность — по marker (или new) в тексте."""
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
    print(f"  ok    {label}")
    applied += 1


def insert_before(path: Path, anchor: str, block: str, label: str, marker: str) -> None:
    patch(path, anchor, block + anchor, label, marker=marker)


def insert_after(path: Path, anchor: str, block: str, label: str, marker: str) -> None:
    patch(path, anchor, anchor + block, label, marker=marker)


# ══ 181/A: 02 — модель данных ════════════════════════════════════════════
insert_after(
    P02,
    "  │     ├── synthesis_lineage     (граф наследования: parent ← child)\n",
    "  │     ├── synthesis_search      (18.1: индекс поиска — строка на синтез;\n"
    "  │     │                          пишет только reindexSynthesis; CASCADE)\n",
    "181/A1 02 — ER-дерево: synthesis_search",
    marker="  │     ├── synthesis_search      (18.1",
)
insert_after(
    P02,
    "CREATE INDEX idx_syntheses_title_trgm ON syntheses USING gin(title gin_trgm_ops);\n",
    "CREATE INDEX idx_syntheses_seed_trgm ON syntheses USING gin(seed gin_trgm_ops);\n"
    "  -- 18.1 (миграция 0020): поиск по зерну с опечаткой (word_similarity);\n"
    "  -- лексемы названия и зерна — в synthesis_search (§2.42)\n",
    "181/A2 02 — syntheses: триграммы зерна",
    marker="CREATE INDEX idx_syntheses_seed_trgm ON syntheses",
)
insert_after(
    P02,
    "CREATE INDEX idx_glossary_synthesis ON glossary_terms(synthesis_id);\n",
    "-- 18.1 (миграция 0020): точный поиск термина без регистра. Документ пишет\n"
    "-- термин одной ячейкой вместе с пояснением — «Имя (пояснение)», — поэтому\n"
    "-- индексов два: по термину целиком и по имени без хвостовой скобки\n"
    "-- (выражение — одно на схему, миграцию и запрос: GLOSSARY_TERM_BASE_SQL в\n"
    "-- server/services/search.ts, сторож 4br).\n"
    "CREATE INDEX idx_glossary_term_lower ON glossary_terms (lower(term));\n"
    "CREATE INDEX idx_glossary_term_base ON glossary_terms\n"
    "  (lower(btrim(regexp_replace(term, '[[:space:]]*[(][^()]*[)][[:space:]]*$', ''))));\n",
    "181/A3 02 — glossary_terms: индексы точного термина",
    marker="CREATE INDEX idx_glossary_term_lower ON glossary_terms",
)
insert_before(
    P02,
    "## 3. Извлечение гранулярных элементов из HTML\n",
    """### 2.42. synthesis_search

Индекс поиска концепций (беседа 18.1, миграция `0020_search_index`; маршрут
— 03 §2.21). Одна строка на синтез. В индекс входят **название, зерно,
капсула без разметки, имена категорий, термины глоссария и их
определения**; тезисы и тексты разделов не входят (решение пользователя
2026-11-16: держать их свежими при каждой перегенерации дорого).

```sql
CREATE TABLE synthesis_search (
  synthesis_id  UUID PRIMARY KEY REFERENCES syntheses(id) ON DELETE CASCADE,
  config        TEXT NOT NULL DEFAULT 'simple',
    -- словарь документа по syntheses.lang: Russian → russian, English →
    -- english, German → german, иной язык → simple (shared
    -- SEARCH_TS_CONFIG_BY_LANG); нужен ts_headline при выдаче фрагмента
  title_tsv     TSVECTOR NOT NULL,  -- название (вес A)
  seed_tsv      TSVECTOR NOT NULL,  -- зерно (вес B)
  capsule_tsv   TSVECTOR NOT NULL,  -- капсула: всё, что ищется у ВИТРИНЫ
  content_tsv   TSVECTOR NOT NULL,  -- капсула (B) + имена категорий и термины
                                    --  (A) + определения терминов (C)
  capsule_text  TEXT NOT NULL DEFAULT '',  -- капсула без разметки: фрагмент и триграммы
  elements_text TEXT NOT NULL DEFAULT '',  -- построчно: имена категорий, затем
                                           --  «термин — определение»
  indexed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT synthesis_search_config_check
    CHECK (config IN ('russian','english','german','simple'))
);
CREATE INDEX idx_synthesis_search_title   ON synthesis_search USING gin(title_tsv);
CREATE INDEX idx_synthesis_search_seed    ON synthesis_search USING gin(seed_tsv);
CREATE INDEX idx_synthesis_search_capsule ON synthesis_search USING gin(capsule_tsv);
CREATE INDEX idx_synthesis_search_content ON synthesis_search USING gin(content_tsv);
CREATE INDEX idx_synthesis_search_capsule_trgm  ON synthesis_search USING gin(capsule_text gin_trgm_ops);
CREATE INDEX idx_synthesis_search_elements_trgm ON synthesis_search USING gin(elements_text gin_trgm_ops);
```

- **Каждый `tsvector` — сумма двух разборов текста:** словарём документа
  (`config`) и `simple`. Запрос разбирается всеми четырьмя словарями и
  объединяется через «или» (язык запроса неизвестен), так что русский
  запрос находит словоформы в русском документе, а точное слово — в любом.
- **Отдельная таблица, а не колонки `syntheses`:** строку `syntheses` весь
  сервер читает целиком (`select()`), и четыре `tsvector` поехали бы в
  каждый ответ и каждый снимок.
- **Пишет строку одна функция** — `reindexSynthesis(id)`
  (`server/services/search-index.ts`): её зовут все писатели названия,
  зерна, капсулы, категорий и терминов СРАЗУ ПОСЛЕ фиксации своей записи.
  Триггеров нет. Сбой пересчёта операцию не роняет: строка
  `[search-index] …` в журнале сервера, индекс чинит повторный пересчёт.
  Текст капсулы снимает с разметки серверный разбор (linkedom), `tsvector`
  строит SQL (`to_tsvector`).
- **Начальное наполнение — скриптом, не миграцией:** `npm run
  search:reindex` (`scripts/maintenance/reindex-search.ts`; ключи `--dry`,
  `--missing`, `--synthesis <uuid>`) — той же функцией, что зовут писатели;
  копия сборки документа в SQL миграции разошлась бы с ней при первой
  правке. Он же — починка после сбоя. `deploy/*` зовут его после миграций.
- **Прав в индексе нет.** Кому что открыто, решается на каждом запросе по
  строкам `syntheses` и `synthesis_members` (03 §2.21); строка индекса сама
  ничего не открывает. У концепции без строки индекса (до первого
  пересчёта) работает только поиск по подстроке названия.

""",
    "181/A4 02 — §2.42 synthesis_search",
    marker="### 2.42. synthesis_search",
)

# ══ 181/B: 03 — спецификация ═════════════════════════════════════════════
insert_after(
    P03,
    "> остальное (разделы, элементы, режимы, преобразования, экспорт, генерация,\n"
    "> импорт, правка) — под `requireAuth`, как прежде.\n",
    ">\n"
    "> **18.1 (2026-11-16) — четвёртый гостевой путь:** `GET /syntheses/search`\n"
    "> (§2.21). Гостю в нём открыт только список `public` — то же, что отдаёт\n"
    "> `GET /syntheses/public`, с тем же потолком (без стоимости); списки\n"
    "> `mine` и `shared` без сессии отвечают 401. Гостевых путей — четыре.\n",
    "181/B1 03 — преамбула §2: четвёртый гостевой путь",
    marker="> **18.1 (2026-11-16) — четвёртый гостевой путь:**",
)
patch(
    P03,
    "// без учёта регистра (ILIKE %…%, gin_trgm); philosopher — ТОЧНОЕ имя в\n"
    "// генеалогии (как §2.8); невалидные status/method → 400\n",
    "// без учёта регистра (ILIKE %…%, gin_trgm); philosopher — ТОЧНОЕ имя в\n"
    "// генеалогии (как §2.8); невалидные status/method → 400\n"
    "// 18.1 (сверка с кодом): philosopher у /public — ОДИН и ПРЯМОЙ участник\n"
    "// (строка synthesis_lineage самого синтеза), а не «среди предков», как\n"
    "// в §2.8; status и method у /public молча игнорируются (400 — только у\n"
    "// GET /syntheses); search в ILIKE не экранирует % и _ (они работают как\n"
    "// подстановочные знаки). Оба списка оставлены как есть — их параметры\n"
    "// сохраняют смысл; тот же набор и остальное — GET /syntheses/search\n"
    "// (§2.21), где подстрока экранируется.\n",
    "181/B2 03 — §2.2: уточнение параметров прежних списков",
    marker="// 18.1 (сверка с кодом): philosopher у /public",
)
insert_before(
    P03,
    "---\n\n## 3. WebSocket-протокол\n",
    """### 2.21. Поиск концепций (беседа 18.1)

```
GET    /syntheses/search       ?scope=mine|shared|public
                               &q=…&field=title|seed|content|term
                               &philosopher=Кант&philosopher=Гегель
                               &philMode=all|any&philArea=direct|lineage
                               &epoch=0&epoch=3
                               &method=…&synthLevel=…&lang=…&status=…
                               &meta=true|false&descendantsOf=<id>
                               &dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
                               &sort=relevance|createdAt|updatedAt|title|method|status
                               &order=desc|asc&page=1&limit=20
                                → SynthesisSearchResponse {
                                    items: SynthesisSearchItem[], total,
                                    match: 'fts' | 'fuzzy' | 'exact' | null,
                                    query: SynthesisSearchQueryEcho }
```

Один маршрут на три списка каталога (врезка «Фаза 18» в 07). Прежние
`GET /syntheses`, `/syntheses/public`, `/syntheses/shared` и
`/lineage/search` не изменены. **ГОСТЕВОЙ путь** (`optionalAuth`, четвёртый):
монтируется до `GET /syntheses/:id` (`routes/search.ts`).

**Список (`scope`).** `mine` — свои (как `GET /syntheses`); `shared` — где
смотрящий участник любого статуса, и приглашённый (как `/syntheses/shared`);
`public` — все неприватные ступени (как `/syntheses/public`). По умолчанию
вошедшему `mine`, гостю `public`; гость с иным `scope` → 401 `AUTH_REQUIRED`.

**Текст.** `q` (≤ 200 знаков) и поле `field` (умолчание `title`); прежний
параметр каталогов `search` — то же, что `q` с `field=title`. Без `q`
маршрут — список с фильтрами.

| Поле | Что ищется | Как |
|---|---|---|
| `title` | название | словарь ИЛИ подстрока без регистра (прежний смысл `?search=`, `%` и `_` экранируются) |
| `seed` | зерно | словарь |
| `content` | капсула без разметки + имена категорий + термины глоссария и их определения | словарь |
| `term` | термин глоссария | ТОЧНОЕ совпадение без регистра: с термином целиком либо с его именем без хвостовой скобки («Имя (пояснение)» находится и по «имя») |

«Словарь» — полнотекстовый поиск: запрос разбирается `websearch_to_tsquery`
четырьмя словарями (`russian`, `english`, `german`, `simple`) и объединяется
через «или»; документ несёт лексемы словаря своего языка (`syntheses.lang`)
и `simple` (02 §2.42). Слова запроса связаны «и»; работают кавычки (фраза),
`or` и минус `websearch_to_tsquery`. **Если словарь не нашёл ничего** (и у
поля не `term`) — запасной ход по триграммам: каждое слово запроса длиной от
трёх знаков должно быть похоже (`word_similarity ≥ 0.4`, pg_trgm) на место
текста — так находится запрос с опечаткой. Чем найдено, говорит `match`
(`fts` | `fuzzy` | `exact`; `null` — текста в запросе нет). Тезисы и тексты
разделов не ищутся — их нет в индексе.

**Видимость — на каждом запросе, по строкам `syntheses` и
`synthesis_members`** (SQL-зеркало модуля прав: `searchScopeSql`,
`searchReadLevelSql` в `services/capabilities.ts`; сторож 5az сверяет его с
`capabilitiesFor`). У каждой концепции списка — уровень чтения смотрящего:

| Уровень | Кто | Какие поля ищутся |
|---|---|---|
| `full` | владелец; действующий участник (на любой ступени); любой — при `visibility='full'` | все четыре |
| `showcase` | прочие при `visibility='showcase'` | `title`, `seed`, `content` — **только капсула**; по категориям, терминам и определениям витрина НЕ ищется, поле `term` её не находит |
| `none` | приглашённый в приватную концепцию, не принявший приглашение (он видит её в списке `shared`) | только `title` |

Чужая приватная концепция не попадает ни в один список и не находится ни
одним полем. Зерно у витрины ищется, потому что `GET /syntheses/:id` отдаёт
его витрине (решение 18.1; врезка называет «название, капсулу и метаданные»
— зерно отнесено к метаданным).

**Фильтры** (сочетаются между собой и с текстом через «и»).
- `philosopher` — имя философа, параметр повторяется (≤ 20); `philMode`:
  `all` (умолчание) — все названные, `any` — любой; `philArea`: `direct`
  (умолчание) — прямые участники (строки `synthesis_lineage` самого синтеза,
  как `philosopher` у `/syntheses/public`), `lineage` — вся родословная
  (транзитивно, глубина ≤ 10 — тот же обход, что `/lineage/search`;
  `philArea=lineage&philMode=all` ≡ `/lineage/search` по отбору).
- `epoch` — номер эпохи в `PHILOSOPHER_EPOCHS` с нуля, параметр повторяется:
  среди философов концепции (в области `philArea`) есть философ одной из
  названных эпох.
- `method`, `synthLevel`, `status` — значения enum'ов (иное → 400); `lang` —
  язык генерации, сравнение без регистра.
- `meta=true|false` — мета-синтез: среди родителей есть концепция (связь БД
  либо неперекрытый узел-концепция дерева файла — то же правило
  `isMetaSynthesisRows`, что у `hasConceptParents` превью).
- `descendantsOf=<id>` — потомки концепции X (глубина ≤ 10). X должна быть
  читаема смотрящим: не UUID / нет такой → 404, нет доступа → 403; дерево —
  то же, что у `GET /syntheses/:id/lineage/descendants` (невидимый посредник
  срезается вместе с поддеревом).
- `dateFrom`, `dateTo` — по дате создания, `YYYY-MM-DD`, обе границы
  включены (сутки UTC).

**Порядок и страницы.** `sort`: с текстом по умолчанию `relevance`
(`ts_rank` / сумма сходств; при равенстве — новые сверху), без текста —
`createdAt`; `order` — `desc` (умолчание) | `asc`; `page ≥ 1`, `limit`
1…100 (умолчание 20) — как у каталогов. `total` — число найденного по всем
страницам.

**Выдача.** `SynthesisSearchItem` = `SynthesisPreview` (те же `toPreview` +
`projectPreview`, что у каталогов: гостю без `totalCostUsd`) плюс:
- `fragment?: { source: 'title' | 'seed' | 'capsule' | 'category' | 'term',
  parts: { text, hit?: true }[] }` — отрывок с совпадением (`ts_headline`,
  окно ≈ 220 знаков). Это КУСКИ ТЕКСТА, а не разметка: клиент рисует их
  экранированным текстом, совпадение (`hit`) — подсветкой. У поля `content`
  источник выбирается по порядку: капсула → термин → категория;
- `term?: { id, term }` — найденный термин глоссария: у поля `term` всегда,
  у поля `content` — когда совпадение пришлось на термин либо его
  определение. `id` — для перехода прямо к термину (клиент — 18.2);
- `myRole`, `myStatus` — только в списке `shared` (как у `/syntheses/shared`).

`query` — параметры так, как их понял сервер (для адресной строки клиента).

Негодные параметры → 400 `VALIDATION_ERROR` с `details` по каждому
(допустимые значения); `page`/`limit`/`order` — как у каталогов, молча к
умолчанию.

**Свежесть.** Индекс держат свежим писатели документа — `reindexSynthesis`
(02 §2.42), сторож 4br ведёт их перепись; правка видна поиску сразу после
ответа операции.

""",
    "181/B3 03 — §2.21 маршрут поиска",
    marker="### 2.21. Поиск концепций (беседа 18.1)",
)

# ══ 181/C: 01 — архитектура ══════════════════════════════════════════════
patch(
    P01,
    "- Гость (без сессии, `optionalAuth`): ровно три пути — публичный каталог,\n"
    "  документ, тарифы; стоимость/токены/логи/запросы/пауза — никогда\n",
    "- Гость (без сессии, `optionalAuth`): ровно четыре пути — публичный каталог,\n"
    "  документ, тарифы и (с 18.1) поиск `GET /syntheses/search` в пределах\n"
    "  списка `public`; стоимость/токены/логи/запросы/пауза — никогда\n"
    "- Поиск концепций (18.1): один маршрут на три списка; права — на каждом\n"
    "  запросе по строкам синтеза и участий (SQL-зеркало модуля прав в\n"
    "  `services/capabilities.ts`), в индексе `synthesis_search` прав нет.\n"
    "  Приватное находят владелец и действующие участники; витрина ищется по\n"
    "  названию, зерну и капсуле, но не по категориям и терминам — иначе поиск\n"
    "  был бы обходом закрытого содержания. Индекс держит свежим одна функция\n"
    "  `reindexSynthesis`, которую зовут все писатели документа (не триггеры)\n",
    "181/C1 01 — §6: гостевых путей четыре; поиск и видимость",
    marker="ровно четыре пути — публичный каталог",
)

# ══ 181/D: 04 — карта переиспользования ══════════════════════════════════
insert_before(
    P04,
    "| `metaParentAllowed` в `packages/shared/utils/visibility.ts`; `server/utils/client-address.ts`",
    "| `server/services/search-index.ts` (`buildSearchDocument`, `capsulePlainText`, `writeSearchIndex`, `reindexSynthesis`, `reindexAll`, `setSearchIndexWriter`), `server/services/search.ts` (`searchSyntheses`, `META_SYNTHESIS_SQL`, `GLOSSARY_TERM_BASE_SQL`), `server/utils/search-text.ts` (`splitHeadline`, `substringParts`, `fuzzyParts`, `clipParts`, `queryWords`, `escapeLike`), `server/routes/search.ts`; `searchScopeSql` / `searchReadLevelSql` / `searchReadLevelOf` в `services/capabilities.ts`; `packages/shared/constants/search.ts`, `types/search.ts`; `scripts/maintenance/reindex-search.ts`; миграция `0020_search_index` | НОВОЕ (18.1): в одностраничнике поиска по концепциям нет (документ один). Полнотекстовый индекс PostgreSQL (`tsvector` словаря языка + `simple`, GIN), запасной ход по триграммам, точный термин; правило чтения множеством — SQL-зеркало модуля прав. Капсулу для индекса снимает `capsulePlainText` — те же правила, что `extractCapsuleText` (context-extractor, порт исходника), но модуль-лист: импортировать его в индекс нельзя (он тянет реестр промптов и Redis) |\n",
    "181/D1 04 — новые модули поиска",
    marker="| `server/services/search-index.ts` (`buildSearchDocument`",
)

# ══ 181/E: 05 — структура файлов ═════════════════════════════════════════
insert_after(
    P05,
    "│       │   ├── proposals.ts            # 17.1: PROPOSAL_SOURCES / KINDS / STATUSES / CLOSE_REASONS /\n"
    "│       │   │                           #  EVENT_TYPES / ACCEPT_METHODS, пределы текстов и страницы\n",
    "│       │   ├── search.ts               # 18.1: SEARCH_SCOPES / FIELDS / PHIL_MODES / PHIL_AREAS / SORTS /\n"
    "│       │   │                           #  MATCH_KINDS / FRAGMENT_SOURCES / READ_LEVELS, SEARCH_FIELDS_BY_LEVEL,\n"
    "│       │   │                           #  словари по языку (searchTsConfigFor), пределы и порог триграмм\n",
    "181/E1 05 — shared/constants/search.ts",
    marker="│       │   ├── search.ts               # 18.1: SEARCH_SCOPES",
)
insert_after(
    P05,
    "│       │   │                           #  шаг edit_subsection, StepProposalRef, PlanExpectation, skipReason;\n"
    "│       │   │                           #  в elements.ts — ChangeSource 'proposal', ProposalOrigin, ActorRef\n",
    "│       │   ├── search.ts               # 18.1: SynthesisSearchItem (превью + fragment + term + моя роль),\n"
    "│       │   │                           #  SearchFragment / SearchFragmentPart, SearchTermHit,\n"
    "│       │   │                           #  SynthesisSearchQueryEcho, SynthesisSearchResponse\n",
    "181/E2 05 — shared/types/search.ts",
    marker="│       │   ├── search.ts               # 18.1: SynthesisSearchItem",
)
insert_after(
    P05,
    "│   │       ├── 0019_proposals_actor.sql  # 17.1: proposals, proposal_events; actor_user_id в\n"
    "│   │       │                           #  element_versions и generation_log (SET NULL); drizzle-kit, тег\n"
    "│   │       │                           #  переименован; только добавления\n",
    "│   │       ├── 0020_search_index.sql   # 18.1: synthesis_search (четыре tsvector, GIN; тексты для\n"
    "│   │       │                           #  фрагмента и триграмм), индексы точного термина глоссария,\n"
    "│   │       │                           #  триграммы зерна; генерат drizzle-kit с комментариями рукой, тег\n"
    "│   │       │                           #  переименован; строк не наполняет (npm run search:reindex)\n",
    "181/E3 05 — миграция 0020",
    marker="│   │       ├── 0020_search_index.sql   # 18.1",
)
insert_after(
    P05,
    "│   │   ├── proposals.ts                # 17.1: 8 маршрутов /syntheses/:id/proposals (03 §2.20) под\n"
    "│   │   │                               #  requireAuth + гейт обсуждения; принятие отдаёт черновик плана\n",
    "│   │   ├── search.ts                   # 18.1: GET /syntheses/search (03 §2.21) — optionalAuth, четвёртый\n"
    "│   │   │                               #  гостевой путь; разбор параметров, 401 гостю вне public,\n"
    "│   │   │                               #  превью через toPreview + projectPreview; монтируется ДО /:id\n",
    "181/E4 05 — routes/search.ts",
    marker="│   │   ├── search.ts                   # 18.1: GET /syntheses/search",
)
insert_before(
    P05,
    "│   │   ├── proposals.ts                # 17.1: предложения — создать (discuss), принять (edit) =\n",
    "│   │   ├── search-index.ts             # 18.1: индекс поиска — buildSearchDocument (чистая), writeSearchIndex\n"
    "│   │   │                               #  (upsert строки synthesis_search), reindexSynthesis (не бросает;\n"
    "│   │   │                               #  зовут ВСЕ писатели документа — перепись в стороже 4br),\n"
    "│   │   │                               #  reindexAll; модуль-лист (db + html-parser)\n"
    "│   │   ├── search.ts                   # 18.1: запрос поиска — список и уровень чтения из\n"
    "│   │   │                               #  services/capabilities, словарь → триграммы, фильтры, фрагменты;\n"
    "│   │   │                               #  META_SYNTHESIS_SQL, GLOSSARY_TERM_BASE_SQL\n",
    "181/E5 05 — services/search-index.ts, search.ts",
    marker="│   │   ├── search-index.ts             # 18.1",
)
insert_before(
    P05,
    "│   │   ├── client-address.ts           # 13.2 (Д-67): адрес клиента — ЕДИНСТВЕННЫЙ читатель\n",
    "│   │   ├── search-text.ts              # 18.1: текст поиска — куски фрагмента из ts_headline\n"
    "│   │   │                               # (splitHeadline), подстрока, «похожие» слова, обрезка окна,\n"
    "│   │   │                               # слова запроса, экранирование ILIKE\n",
    "181/E6 05 — utils/search-text.ts",
    marker="│   │   ├── search-text.ts              # 18.1",
)
insert_before(
    P05,
    "│   │   └── lineage-parent-access-report.ts  # 13.2 (Д-66): ОТЧЁТ о связях synthesis_lineage, где\n",
    "│   │   ├── reindex-search.ts           # 18.1: полный пересчёт индекса поиска (начальное наполнение\n"
    "│   │   │                               # после миграции 0020 и починка после сбоя); --dry, --missing,\n"
    "│   │   │                               # --synthesis; npm run search:reindex — шаг deploy/* после миграций\n",
    "181/E7 05 — scripts/maintenance/reindex-search.ts",
    marker="│   │   ├── reindex-search.ts           # 18.1",
)
patch(
    P05,
    "# на беседу, patch-docs-conv<NNN>.py; последний — conv172)",
    "# на беседу, patch-docs-conv<NNN>.py; последний — conv181)",
    "181/E8 05 — последний патч доков",
)
insert_before(
    P05,
    "    │                                   # smoke-172-request1 — 17.2: чистые функции клиента (способы ≡ серверу,\n",
    "    │                                   # smoke-181-request1 — 18.1: чистые функции (документ индекса, куски\n"
    "    │                                   #  подсветки, «похожие» слова, обрезка); живьём через app.request:\n"
    "    │                                   #  поля и три языка, опечатка, точный термин с id, фильтры,\n"
    "    │                                   #  видимость (чужое приватное, участник, приглашённый, витрина,\n"
    "    │                                   #  гость), свежесть и сбой пересчёта, Д-87, прежние списки (47 ✓)\n",
    "181/E9 05 — smoke-181-request1",
    marker="smoke-181-request1 — 18.1",
)

# ══ 181/F: 07 — протокол ═════════════════════════════════════════════════
insert_before(
    P07,
    "---\n\n### Беседа 18.2: Поиск в каталоге (клиент)\n",
    "**По факту 18.1 (первый запрос — 2026-11-16).** → `docs/08-history.md`, глава «Беседа 18.1», подраздел «По факту 18.1 (первый запрос — 2026-11-16)».\n\n",
    "181/F1 07 — указатель «По факту 18.1 (первый запрос)»",
    marker="**По факту 18.1 (первый запрос — 2026-11-16).**",
)
insert_after(
    P07,
    "   Фаза 18 «Поиск и похожие концепции» (18.1–18.3); долгов и ограничений\n"
    "   не добавлено.\n",
    "   Первым запросом 18.1 (2026-11-16) заведены Д-87 (удаление раздела\n"
    "   глоссария либо тезисов не снимает строки элементов) и Д-88 (философы\n"
    "   дерева импортированного файла глубже верхнего уровня не видны обходу\n"
    "   родословной) — оба найдены сверкой п.0, оба вне предмета беседы; обе\n"
    "   строки заведены с адресатом «не назначен».\n",
    "181/F2 07 — §12, хроника правила 3",
    marker="   Первым запросом 18.1 (2026-11-16) заведены Д-87",
)
patch(
    P07,
    "| № | Вид | Долг | Где найдено | Адресат | Состояние |\n"
    "|---|---|---|---|---|---|\n",
    "| № | Вид | Долг | Где найдено | Адресат | Состояние |\n"
    "|---|---|---|---|---|---|\n"
    "| Д-88 | недоделка | Обход родословной (`searchByPhilosophers` у `/lineage/search`, 3.1; с 18.1 — фильтр поиска `philArea=lineage` и `epoch` в этой области) идёт по строкам `synthesis_lineage`. Философы дерева импортированного файла (`syntheses.file_genealogy`) в строки попадают только с верхнего уровня (импорт 4.3); философы вложенных узлов-концепций файла обходу не видны: импортированный мета-синтез не находится по философу своего «файлового» предка. Поведение прежнее (не внесено 18.1), фильтр поиска повторяет его намеренно — чтобы два пути давали один ответ | 18.1 п.0 (сверка списков): `server/services/lineage-service.ts`, `searchByPhilosophers`; `server/services/search.ts`, `ANC_CTE` | 18.3 | открыт (адресат утверждён пользователем 2026-11-16: похожим концепциям нужны философы по родословной и общие предки — обход станет одной общей функцией) |\n",
    "181/F3 07 — §12: строка Д-88",
    marker="| Д-88 | недоделка | Обход родословной",
)
patch(
    P07,
    "> Реестр пуст с 2026-11-15 (закрытие 17.2 и Фазы 17): все строки Д-1…Д-86\n"
    "> — в 08 Часть IV; остались только ограничения «Огр-N» ниже.\n",
    "> До 2026-11-16 реестр был пуст (закрытие 17.2 и Фазы 17): строки Д-1…Д-87\n"
    "> — в 08 Часть IV. Открыт Д-88 (первый запрос 18.1), адресат — 18.3.\n",
    "181/F4 07 — §12: примечание под таблицей",
    marker="> До 2026-11-16 реестр был пуст",
)

# ══ 181/G: 08 — история ══════════════════════════════════════════════════
insert_after(
    P08,
    "по замечанию пользователя, доки сверены сплошь (16 правок 03/05); доки —\n"
    "patch-docs-conv172.py (три части). Ближайшая беседа не назначена.\n",
    "\n"
    "Беседа 18.1 (поиск концепций — бэкенд; Фаза 18) ЗАКРЫТА 2026-11-16; Фаза 18\n"
    "открыта, ближайшая — 18.2 (клиент).\n"
    "Миграция `0020_search_index` (таблица `synthesis_search`: четыре `tsvector`\n"
    "словарём языка + `simple`, GIN; индексы точного термина; триграммы зерна),\n"
    "наполнение — скриптом `npm run search:reindex`; одна функция пересчёта\n"
    "`reindexSynthesis`, её зовут все писатели названия, зерна, капсулы,\n"
    "категорий и терминов сразу после записи (сбой — в журнал, операция цела);\n"
    "маршрут `GET /syntheses/search` — три списка, четыре поля, фильтры врезки,\n"
    "фрагмент кусками текста, id термина; четвёртый гостевой путь. Права —\n"
    "SQL-зеркало модуля прав, сверенное сторожем с `capabilitiesFor`. Сторож\n"
    "2bg/4br/5az (перепись писателей, индекс без тезисов, витрина, чужое\n"
    "приватное), smoke-181 47 ✓, test-181-requests2-4 38 ✓ ×2 (живой сервер,\n"
    "три языка генерации, мок Claude). Новых строк интерфейса нет. Заведены\n"
    "Д-87 (удаление раздела не снимало строки глоссария и тезисов — сделан в\n"
    "той же беседе, без снимков версий; спутники элементов чистит общая\n"
    "`detachElementSatellites`) и Д-88 (адресат 18.3). Регресс на свежем клоне\n"
    "зелёный. Доки — patch-docs-conv181.py (четыре части).\n",
    "181/G1 08 — Часть I: строка беседы 18.1",
    marker="Беседа 18.1 (поиск концепций — бэкенд; Фаза 18) ЗАКРЫТА 2026-11-16; Фаза 18",
)

CHAPTER = """### Беседа 18.1 — Поиск концепций (бэкенд) [ЗАКРЫТА 2026-11-16; Фаза 18 открыта]

**Вход.** HEAD 1f13881 (Фаза 17 закрыта, Фаза 18 заведена 2026-11-16),
`check:dotfiles` OK, `npm install` в клоне, `typecheck` чистый до правок;
песочница без БД — роль/база, миграции 0000…0019, четыре сида. Прочитаны
целиком 01–05, 09, NEXT-CONTEXT; в 07 — §1, §9–12, врезка «Фаза 18», текст
18.1; главы 08: 1.6, 3.1, 8.6, 13.2, 15.1, 15.2, 16.1, 16.2.

Первая беседа Фазы 18 по врезке и решениям пользователя 2026-11-16: тезисы
в индекс не входят (капсула, имена категорий, термины глоссария); витрина
по содержанию не ищется, приватное — владельцу и участникам; эмбеддингов и
переводов терминов нет; индекс свежим держит одна функция пересчёта, которую
зовут писатели, а не триггеры; прежние параметры каталогов сохраняют смысл;
три языка генерации — словарь по языку концепции плюс `simple`, опечатки —
триграммами; `tsvector` и GIN — SQL миграции рукой; недостающее — строкой
§12 с адресатом.

#### По факту 18.1 (первый запрос — 2026-11-16)

Исполнено целиком (пп. 0–4), одним заходом; тестовые запросы и завершение
— следующими запросами. Клиент не тронут (18.2), похожих концепций нет
(18.3).

0. **Сверка (п.0), до правок.**

   *Списки синтезов и их параметры — как в коде на входе в беседу.*
   - `GET /syntheses` (`requireAuth`): `page ≥ 1`, `limit` 1…100 (умолчание
     20), `sort` ∈ `createdAt | updatedAt | title | method | status` (иное
     молча → `createdAt`), `order` (умолчание `desc`), `status`, `method`
     (негодные → 400), `search` — `ILIKE %…%` по названию БЕЗ экранирования
     `%` и `_`. Только свои.
   - `GET /syntheses/public` (`optionalAuth`): `page`, `limit`, `sort`,
     `order`, `search` (так же), `philosopher` — ОДНО имя, ПРЯМОЙ участник
     (`EXISTS` по строкам `synthesis_lineage` самого синтеза), не
     транзитивно; 03 §2.2 писала «как §2.8» — неточно, уточнено. `status` и
     `method` молча игнорируются. Все неприватные ступени.
   - `GET /syntheses/shared` (`requireAuth`, 16.2): без параметров и
     страниц; все участия смотрящего (`invited` и `active`) по дате участия,
     новые сверху; превью + `myRole`, `myStatus`.
   - `GET /lineage/search` (`requireAuth`, 3.1): `philosopher` × N — ВСЕ
     названные среди предков, транзитивно (глубина 10); видимость «свой
     ИЛИ неприватный» (участник приватной её здесь не видит); порядок —
     `created_at` по возрастанию; без страниц.

   *Места записи индексируемого — все, что нашёл grep по вставкам,
   обновлениям и удалениям `categories`, `glossary_terms` и по записи
   `capsule_html` / `title` / вставке `syntheses`.*
   - **Капсула:** `finalizeRun`, `applySectionSideEffects`, `deleteSection`
     (`generation-service`); `updateCapsule`, `autoRenameReferences`
     (`element-editor`); `rollbackToVersion` (`element-versioning`, два
     места — зовётся только из `rollbackElement` редактора); `importHTML`;
     копия (`POST /:id/duplicate`); `scripts/maintenance/sanitize-stored-html`.
   - **Категории:** `saveGraphToDb` (`graph-parser` — генерация,
     перегенерация, импорт, трансформация тезисы → граф); `restoreGraph`
     (откат трансформации); `updateCategory`, `deleteElement`,
     `autoRenameReferences`, `rollbackElement`; `deleteSection` (раздел
     графа); копия.
   - **Термины:** `saveElementsToDb` (`element-parser`);
     `updateGlossaryTerm`, `deleteElement`, `autoRenameReferences`,
     `rollbackElement`; копия.
   - **Название, зерно, язык:** `POST /syntheses`; `PATCH /:id`; генерация
     (название из раздела `name` — в проходе и в `applySectionSideEffects`);
     `deleteSection` (раздел `name` — название к умолчанию);
     `updateSubsection` (правка итоговой рекомендации названия);
     `importHTML`; копия.

   *Находки сверки.*
   - `deleteSection` снимает гранулярные строки только у графа; у разделов
     `glossary` и `theses` строки `glossary_terms` / `theses` остаются —
     **Д-87** (не правлено: вне предмета беседы; поиск отражает таблицу).
   - Обход родословной не видит философов вложенных узлов дерева файла —
     прежнее поведение `/lineage/search`, фильтр поиска его повторяет —
     **Д-88**.
   - Термины импортированного документа хранятся одной ячейкой с
     пояснением: «Имя (пояснение)». Точное совпадение с `lower(term)`,
     как записано в запросе, такой термин по имени не нашло бы — сделано
     два индекса и два сравнения (см. п.1, п.3).

1. **Миграция `0020_search_index`** — следующая свободная по журналу
   (место 20; сторож проверяет место, а не «последняя»). Таблица
   `synthesis_search` (02 §2.42): `title_tsv`, `seed_tsv`, `capsule_tsv`,
   `content_tsv` — каждый сумма разбора словарём документа и `simple`, с
   весами (название, имена категорий и термины — A; зерно и капсула — B;
   определения — C); `capsule_text` и `elements_text` — для фрагмента и
   триграмм; четыре GIN по `tsvector`, два `gin_trgm_ops`; индексы
   `idx_glossary_term_lower` (`lower(term)`) и `idx_glossary_term_base` (имя
   без хвостовой скобки); `idx_syntheses_seed_trgm`. SQL — генерат
   `drizzle-kit` из схемы (тип `tsvector` — `customType`), тег переименован,
   комментарии рукой; повторный `generate` — «No schema changes».
   **Отдельная таблица, а не колонки `syntheses`:** строку `syntheses`
   сервер читает целиком.
   **Начальное наполнение — скриптом** (`npm run search:reindex`), не
   миграцией. Довод: документ индекса собирает одна функция (текст капсулы
   снимается с разметки серверным разбором, не SQL); вторая реализация в
   миграции разошлась бы с ней при первой правке, а миграции не
   переписываются. Скрипт идемпотентен, он же — починка после сбоя;
   `deploy/*` зовут его после миграций (`--missing`). До первого пересчёта
   концепция находится только по подстроке названия.

2. **`reindexSynthesis(id)`** (`server/services/search-index.ts`) — одна
   функция; зовут её все писатели п.0 — 20 вызовов в восьми файлах.
   **Сразу ПОСЛЕ фиксации записи, не в той же транзакции.** Довод: условие
   «сбой пересчёта операцию не роняет» в транзакции невыполнимо без
   точки сохранения — ошибка запроса переводит транзакцию PostgreSQL в
   состояние отказа; кроме того, разбор капсулы под блокировками строк
   удлинял бы транзакции правки. Цена: между фиксацией и пересчётом индекс
   на мгновение отстаёт, а при сбое остаётся прежним до повторного
   пересчёта — права от индекса не зависят, так что отставание не
   раскрывает закрытого. Функция ждётся (`await`) — ответ операции
   приходит после пересчёта, «поиск видит новое сразу»; не бросает:
   `console.error("[search-index] …")` и `false`. Модуль — лист импортов
   (db + html-parser), иначе цикл с писателями. Разъём
   `setSearchIndexWriter` — для проверки сбоя.

3. **Маршрут `GET /syntheses/search`** (03 §2.21; `routes/search.ts`,
   `services/search.ts`). Три списка, четыре поля, фильтры врезки,
   сортировка, страницы; выдача — превью (`toPreview` + `projectPreview`),
   фрагмент, id термина, в `shared` — роль и статус.
   - **Права.** SQL-зеркало модуля прав живёт в `services/capabilities.ts`
     (`searchScopeSql`, `searchReadLevelSql`) — сравнение с владельцем
     по-прежнему только там (сторож 4bm); `searchReadLevelOf` — то же
     правило по `capabilitiesFor`, сторож 5az сверяет оба на матрице
     смотрящих и ступеней. Вычисляются на каждом запросе по строкам
     `syntheses` и `synthesis_members`; в индексе прав нет.
   - **Уровни чтения:** `full` — все поля; `showcase` — название, зерно,
     капсула (не категории, термины, определения; и не запасным ходом);
     `none` (приглашённый, не принявший) — только название.
     **Зерно у витрины ищется** — его отдаёт `GET /:id` витрине; врезка
     называет «название, капсулу и метаданные». Решение перевернуть можно
     одной строкой `SEARCH_FIELDS_BY_LEVEL` и условием в `textMatch`.
   - **Текст.** Запрос — `websearch_to_tsquery` четырьмя словарями,
     объединение «или». Словарь не нашёл ничего → триграммы
     (`word_similarity`, порог 0.4 — `SET LOCAL` в своей транзакции):
     каждое слово запроса от трёх знаков должно быть похоже на место
     текста. Порог подобран на образце: «диолектика» против «диалектики»
     — 0.43, посторонние слова — 0.14–0.17.
   - **Название** — словарь ИЛИ подстрока (прежний смысл `?search=`; `%`
     и `_` экранируются — у прежних списков нет).
   - **Термин** — точное совпадение без регистра с термином целиком либо с
     именем без хвостовой скобки; уровень `full`.
   - **Фрагмент** — куски `{ text, hit? }`, не разметка. Подсветка в два
     прохода `ts_headline` (словарём документа и `simple`): русский стеммер
     сводит «разлом» к «разл», а «разломы» — к «разлом»; строку находит
     пересечение основы запроса с точной формой документа, и подсветить
     его может только второй проход.
   - **Фильтры.** Философы `all | any` × `direct | lineage` (обход —
     зеркало `searchByPhilosophers`); эпоха — «есть философ эпохи» в той
     же области; мета — SQL-зеркало `isMetaSynthesisRows` (сторож сверяет с
     `loadConceptParentFlags`); потомки X — `getDescendants` +
     `pruneInvisible` (экспортирован, принимает гостя), X проверяется
     `loadSynthesisForRead`.
   - **Гостевой путь — четвёртый** (01 §6, 03 §2 поправлены; текст сторожа
     4ao — «ровно четыре»): гостю — только `public`, иное → 401.
   - Прежние `GET /syntheses`, `/public`, `/shared`, `/lineage/search` не
     тронуты (сторож 4br).
   - **Новых строк интерфейса нет:** ответы об ошибках — существующие
     ключи (`invalidParams`, `authRequired`, `synthesisNotFound`,
     `noSynthesisAccess`), `details` — допустимые значения параметров.
     `i18n:check --strict` — 0 без перевода, 0 черновиков.

4. **Сторож** (`check:integration`): **2bg** — модули и контракты (словари,
   уровни, документ индекса, куски подсветки); **4br** — перепись
   писателей (каждый файл, пишущий индексируемое, импортирует и зовёт
   `reindexSynthesis` не меньше известного числа раз; файл с новой записью
   вне переписи — ошибка), `reindexSynthesis` не бросает, сборка и запрос
   не читают таблиц тезисов и разделов, условия уровней чтения в тексте
   запроса, одно выражение имени термина в трёх местах, один
   `optionalAuth` в `routes/search.ts` и монтирование до `/:id`, миграция
   на месте 20 без триггеров и наполнения, `deploy/*`, доки; **5az**
   (живьём) — чужое приватное не находится ни одним полем ни в одном
   списке (чужому, гостю, приглашённому сверх названия), витрина — по
   названию, зерну и капсуле, но не по категории, термину, определению (и
   не по опечатке), тезисы не ищутся и в строке индекса их нет, уровень
   чтения SQL ≡ JS, списки SQL ≡ правилу, мета SQL ≡ JS, свежесть и сбой
   пересчёта, CASCADE и CHECK. Ослаблены альтернацией сторожа прежних
   бесед со счётом миграций (4bk, 4bm, 4bn, 4bp).
   `tests/smoke-181-request1.mjs` — 46 ✓.

**Проверки первого запроса.** `typecheck` (все конфиги) 0; `audit` — без
расхождений; `i18n:check --strict` зелёный; `check:dotfiles` OK;
`check:integration` — INTEGRATION OK (18.1: 2bg/4br/5az).

**Отступления от текста запроса.**
- Индекс точного термина — два (`lower(term)` и имя без скобки), а не один:
  иначе термин образца «Имя (пояснение)» по имени не находится.
- Поле `title` ищется и подстрокой — чтобы прежний `?search=` сохранил
  смысл в общем маршруте.
- Уровень `none` (приглашённый) в запросе не назван — он следует из того,
  что приглашённый видит приглашение в списке `shared` (16.2), но не
  участник.

#### По факту 18.1 (тестовые запросы 2–4 и сверка после сжатия контекста — 2026-11-16)

Три тестовых запроса — одним заходом, по слову пользователя. Харнесс —
`tests/test-181-requests2-4.mjs`: живой сервер :3000, всё по HTTP
(регистрация, импорт, приглашения, правки, поиск), мок Claude в процессе
харнесса — для одной трансформации. Документы — живой импорт образца и двух
его вариантов (английского и немецкого): тот же файл с заменой языка
генерации, названия, зерна, одного предложения капсулы, имени категории и
термина. **38 ✓ ×2.**

1. **Поля и языки (запрос 2).** Название, зерно и содержание на трёх
   языках: «вмещающие разломы», «rifts containing», «umfassenden Risse»
   находят каждая только свою концепцию; чужие словоформы чужую не находят
   («Brüchen» — только немецкую, «ruptured» — только английскую). Опечатка —
   по триграммам (`match: 'fuzzy'`) в названии на трёх языках, в капсуле и в
   зерне. Точный термин — без регистра, по имени и целиком со скобкой;
   выдача несёт id термина — тот же, что отдаёт `GET /glossary`; часть
   термина не находит. Фильтры — двадцать сочетаний на четырёх концепциях
   с родословной (философы `all | any` × `direct | lineage`, эпоха в обеих
   областях и две эпохи, метод, уровень, язык, статус, мета, потомки, дата,
   два составных); `/lineage/search` сходится с `lineage` + `all`. Знаки
   подстановки, кавычки и синтаксис `tsquery` в тексте запроса — 200.
   Концепция без строки индекса находится по подстроке названия и
   фильтрам; `search:reindex --missing` её дописывает.
2. **Видимость (запрос 3).** Десять проб (четыре поля, подстрока, опечатка,
   категория, термин, определение) × три списка: чужое приватное не
   находится ни вошедшему, ни гостю, ни по фильтру без текста; как X
   фильтра потомков — 403. Приглашённый (приглашение по HTTP) до принятия
   находит концепцию только по названию и только в списке «со мной»; после
   принятия — всеми полями; исключённый перестаёт находить сразу. Витрина —
   название (и подстрокой, и по опечатке), зерно, капсула; категория,
   термин и определение — нет, и гостю тоже. Смена ступени
   (`private → showcase → full → private`) видна поиску сразу. Гость вне
   `public` — 401; превью гостю без стоимости.
3. **Свежесть (запрос 4).** Импорт, правка категории, правка и удаление
   термина (15.2), правка капсулы и названия, трансформация тезисы → граф
   (мок) и её откат, копия, удаление концепции — поиск видит новое сразу
   после ответа операции. **Сбой пересчёта** живьём: запись в индекс
   запрещена на уровне базы (временное ограничение `CHECK … NOT VALID`) —
   три операции отвечают 200, записи на месте, в журнале сервера три строки
   `[search-index]`, индекс прежний; `npm run search:reindex --synthesis`
   чинит. Подменённая функция (`setSearchIndexWriter`) — в smoke-181 и
   стороже 5az: в живой сервер разъём снаружи не вставить.

**Находки тестов** (дефектов службы нет; три правки проб):
- Английский стеммер поглощает часть опечаток («rupturs» → «ruptur») —
  такой запрос находится словарём, не запасным ходом. Это достоинство
  поиска; проба опечатки заменена.
- Категория и определение, слова которых есть в капсуле, у витрины честно
  находятся — капсулой. Пробы «не находится» берутся среди тех, которых в
  капсуле нет (харнесс проверяет это запросом к индексу).
- Запасной ход находит похожее: «трансфигурации» — «трансформации».
  Проверки «старое ушло» смотрят `match` (внесено в 09 §10 как правило
  для клиента 18.2: находки `fuzzy` показывать как «похожие»).

**Сверка после сжатия контекста.** Сжатие пришлось на середину первого
запроса — между вызовами `reindexSynthesis` у писателей и кодом запроса
поиска. После него перечитаны текст запроса и врезка; по замечанию
пользователя — снимки инвариантов 15.2, 16.1, 16.2, 17.1 (08 Часть V) и
перепись писателей по коду. Расхождений кода с инвариантами нет. Найдено и
исправлено:
- блок «Что 18.1 оставила» в 09 §10 встал выше вводного абзаца раздела —
  якорь патча исправлен;
- в 09 §10 не было блоков 15.1–17.2 (перенос 2026-11-15 остановился на
  14.2), хотя текст 18.1 ссылается на «§10 — инварианты прав 16.1–17.2» —
  заведён блок-выжимка «Что 16.1–17.2 оставили»;
- экранирование `%` и `_` для ILIKE жило двумя копиями (`lineage-service`
  и новая `utils/search-text`) — оставлена одна, сторож 4br.

**Проверки.** `typecheck` 0; `audit`; `i18n:check --strict`;
`check:dotfiles`; `check:integration` — INTEGRATION OK; smoke-181 46 ✓;
test-181-requests2-4 38 ✓ ×2.

#### По факту 18.1 (завершение — 2026-11-16)

- **Компиляция.** `npm run typecheck` — 0 ошибок (shared, сервер, клиент,
  сторож, скрипты); `vite build` клиента проходит (типы shared пополнены,
  клиент их ещё не берёт).
- **Интеграция — на свежем клоне:** `git clone` локального репозитория +
  правки беседы (`git diff` и новые файлы) + свой `npm install`; `.env` из
  `.env.example`. `check:dotfiles` OK; `check:integration` — INTEGRATION OK
  (18.1: 2bg/4br/5az); `i18n:check --strict` — без перевода 0, черновиков 0
  (новых ключей беседа не завела); `audit` — расхождений нет.
- **Ревью.** TODO и заглушек в коде беседы нет. Чего сервер поиска
  сознательно не делает: тезисы и тексты разделов не ищутся (решение
  пользователя); эмбеддингов и перевода терминов нет; похожие концепции —
  18.3; клиент — 18.2 (до него маршрутом никто не пользуется, каталог
  ходит в прежние списки).
- **Долги.** В §12 — Д-87 (удаление раздела глоссария / тезисов не
  снимает строки элементов) и Д-88 (философы вложенных узлов дерева файла
  не видны обходу родословной); обе «не назначен» — адресата назначает
  пользователь. Предложено: Д-87 — отдельным запросом (объём малый; вопрос
  о снимках версий удаляемых элементов — за пользователем), Д-88 — к 18.3
  (ей нужны философы по родословной, функция обхода станет общей).
  Ограничений не добавлено.
- **02/03.** Индекс — 02 §2.42 (и индексы §2.2, §2.10); маршрут — 03 §2.21
  (и преамбула §2, уточнение §2.2); 01 §6, 04, 05 — частью I патча.
- **Что осталось знать 18.2** — 09 §10 «Что 18.1 оставила» и пометка в
  тексте 18.2: фрагмент — куски текста, `match: 'fuzzy'` — «похожие»,
  `query` — эхо параметров для адресной строки, id термина для перехода.
- 08 Части I, II и V, 09, врезка «Фаза 18», README, NEXT-CONTEXT
  (ближайшая — 18.2; серия сторожей 2bh/4bs/5ba, миграция 0021).

#### По факту 18.1 (Д-87 и адресаты долгов — 2026-11-16)

После блока завершения пользователь утвердил адресатов: **Д-87 — сама
18.1** (сделать сейчас, без снимков версий), **Д-88 — 18.3** (вписан в её
текст). Вся беседа, включая Д-87, — один коммит.

1. **Что было.** `deleteSection` снимал гранулярные строки только у
   раздела графа (категории, рёбра, метки кластеров). У разделов
   `glossary` и `theses` строки `glossary_terms` и `theses` оставались:
   термины удалённого глоссария отдавал `GET /glossary` и находил поиск.
   Спутников элементов без внешнего ключа — обогащения
   (`element_enrichments`), обоснования характеристик
   (`characteristic_justifications`), ссылки рекомендаций
   (`recommendations.element_id`) — удаление раздела не снимало ни у кого,
   и у графа тоже.
2. **Что сделано.** Удаление раздела графа, глоссария или тезисов снимает
   строки его элементов ОДНОЙ транзакцией вместе со спутниками: обогащения
   и обоснования удаляются; у рекомендаций гаснет ссылка, а годные к
   исполнению (`new` | `stale`) становятся негодными кодом
   `target_element_gone` — то же правило, что у поштучного удаления 15.2.
   Правило вынесено в одну функцию `detachElementSatellites`
   (`server/services/element-satellites.ts`, модуль-лист), её зовут и
   `deleteElement`, и `deleteSection`. `withIssueTexts` переехала в лист
   `recommendation-issues` (из `recommendations.ts` реэкспортируется) —
   иначе служба генерации получила бы цикл импортов. После удаления
   глоссария индекс поиска пересчитывается.
3. **Чего нет — по решению пользователя.** Снимков версий удаляемых
   элементов удаление раздела не пишет: это не правка элемента,
   восстановления из снимка нет (Огр-13), след удаления — строка
   `deletion_marker` журнала. Имена удалённых категорий в
   `theses.related_categories` при удалении графа не трогаются (как и
   прежде): перегенерация графа возвращает категории под теми же именами.
4. **Проверки.** Сторож 4br (Д-87): три вызова `detachElementSatellites`
   в `deleteSection`, одна транзакция, пересчёт индекса после глоссария,
   без `createVersion`, модуль спутников — лист, `withIssueTexts` — одно
   определение; 4bj (15.2) читает правило рекомендаций из общего модуля;
   5az живьём — после удаления трёх разделов нет строк элементов и
   спутников, рекомендации `new`/`stale` негодны кодом, `done` — только без
   ссылки, термины и категории ушли из поиска. smoke-181 — 47 ✓ (E9a).
   `typecheck` 0, `check:integration` — INTEGRATION OK (и на свежем клоне),
   test-181-requests2-4 38 ✓; регресс удалений 15.2: smoke-152 44 ✓,
   test-152 запросы R2–R4 45 ✓ (серверные; браузерная R5 не гонялась —
   клиент беседой не тронут).

---

"""
insert_before(
    P08,
    "### Беседа 17.2 — Решение по предложению, соавторство в интерфейсе (клиент; одна правка сервера) [ЗАКРЫТА 2026-11-15; Фаза 17 закрыта]\n",
    CHAPTER,
    "181/G2 08 — Часть II: глава «Беседа 18.1»",
    marker="#### По факту 18.1 (первый запрос — 2026-11-16)",
)

# ══ 181/H: 09 — уроки ════════════════════════════════════════════════════
insert_before(
    P09,
    "## 4. Тесты, харнессы, браузер\n",
    """### Беседа 18.1 — полнотекстовый поиск: стеммер, подсветка, фрагменты SQL

1. **Стеммер не сводит все формы слова к одной основе.** Русский snowball:
   «разлом» → «разл», «разломы» → «разлом». Один словарь на документ и
   запрос такую пару не сводит. Работает сумма: документ = лексемы словаря
   языка + `simple`, запрос = объединение разборов всеми словарями — тогда
   основа запроса совпадает с точной формой документа. Следствие для
   `ts_headline`: он разбирает текст ОДНИМ словарём и такое совпадение не
   подсветит — подсветка идёт вторым проходом `simple` поверх первого
   (вложенные маркеры разбирает `splitHeadline`).
2. **Регулярное выражение в `sql\\`\\`` схемы теряет обратные косые** при
   генерации миграции (`\\s` → `s`): в выражениях индексов — POSIX-классы
   (`[[:space:]]`, `[(]`), а не `\\s` и `\\(`.
3. **Тип фрагмента postgres.js** — `postgres.PendingQuery<postgres.Row[]>`;
   `ReturnType<typeof sql>` берёт последнюю перегрузку (помощник списков) и
   с результатом шаблона несовместим.
4. **Порог `pg_trgm` — настройка сеанса:** оператор `<%` читает
   `pg_trgm.word_similarity_threshold`; менять его — `set_config(…, true)`
   внутри `sql.begin`, иначе значение уедет в пул соединений.
5. **Запасной ход по триграммам шумит на искусственных словах:** слово
   теста, склеенное с общей меткой прогона («терминностьабв» рядом с
   «категориальностьабв»), похоже на соседей общим хвостом. В проверках
   «не находится» брать слова без общей части с остальной фикстурой.
6. **Счёт сторожа вида «в выражении ровно N вхождений»** ломается правкой
   самой функции (`ne(syntheses.visibility, "private")` дважды в
   `pruneInvisible` после ветвления) — правку держать в форме, не меняющей
   счёт (`or(undefined, …)`), либо менять сторож вместе с ней.

""",
    "181/H1 09 — §3: уроки 18.1",
    marker="### Беседа 18.1 — полнотекстовый поиск: стеммер, подсветка, фрагменты SQL",
)
insert_before(
    P09,
    "### Что 14.2 оставила знать всем беседам\n",
    """### Что 18.1 оставила знать всем беседам

- **Кто пишет название, зерно, капсулу, категории или термины глоссария —
  зовёт `await reindexSynthesis(id)` сразу после фиксации записи**
  (`server/services/search-index.ts`). Сторож 4br ведёт перепись: файл с
  новой записью индексируемого вне переписи — ошибка. Триггеров нет и
  быть не должно. Функция не бросает; в транзакцию её не вносить.
- **Тезисы и тексты разделов в индекс поиска не входят** (решение
  пользователя). `search-index.ts` и `search.ts` таблиц тезисов и разделов
  не читают — сторож 4br.
- **Права поиска — из модуля прав.** SQL-зеркало (`searchScopeSql`,
  `searchReadLevelSql`) живёт в `services/capabilities.ts` рядом с
  `capabilitiesFor`; сторож 5az сверяет их. Новое правило чтения меняется
  в ОБОИХ местах. В индексе прав нет.
- **Витрина ищется по названию, зерну и капсуле — не по категориям,
  терминам и определениям**, в том числе запасным ходом по триграммам и
  во фрагменте выдачи. Новое поле текста обязано пройти через уровень
  чтения (`SEARCH_FIELDS_BY_LEVEL`).
- **Гостевых путей четыре:** к трём путям 8.6 добавлен
  `GET /syntheses/search` в пределах списка `public`.
- **Фрагмент выдачи — куски текста `{ text, hit? }`, не HTML.** Клиент
  (18.2) рисует их экранированным текстом.
- **Индекс наполняет скрипт**: после миграции 0020 и после любой правки
  базы мимо службы — `npm run search:reindex`.
- **Запасной ход по триграммам находит ПОХОЖЕЕ** и помечает ответ
  `match: 'fuzzy'`: «трансфигурации» находит «трансформации». Клиенту —
  показывать такие находки как «похожие», а не как точные; проверкам «не
  находится» — смотреть `match` либо брать слова без соседей.
- Миграций двадцать одна (0000…0020), следующая — 0021; серия сторожей —
  2bh/4bs/5ba.

### Что 16.1–17.2 оставили знать всем беседам (права и соавторство)

Блок заведён беседой 18.1: её текст ссылается на «§10 — инварианты прав
16.1–17.2», а при переносе 2026-11-15 сюда попали блоки только до 14.2 —
снимки 15.1–17.2 ушли в 08 Часть V («Состояние на …»). Здесь — выжимка
того, что держит сегодняшний код; подробности — в тех снимках и в главах 08.

- **«Владелец ли это» решает ОДИН модуль** — `server/services/capabilities.ts`
  (`capabilitiesFor` → `{ read, discuss, edit, manage, role }`). Прямые
  сравнения с владельцем вне модуля запрещены сторожем 4bm (белый список:
  автор плана, кто запустил, PaymentIntent). Правило множеством (списки,
  поиск) — SQL-зеркало в том же модуле (18.1).
- **Доступ — через синтез, на каждом запросе:** `loadSynthesisForRead` /
  гейты `routes/edit-gate.ts` (`editGate`, `editRightFirst`). Действующий
  участник (`synthesis_members`, reviewer | editor, status `active`) читает
  концепцию целиком на любой ступени и обсуждает; приглашённый (`invited`)
  — не участник. Исключение действует сразу.
- **Право правки** — `capabilities.edit` = владелец | действующий редактор
  (`canEditSynthesisOf` либо `editGate`; двухдоводный `canEditSynthesis` вне
  модуля запрещён сторожем 4bp). **Управление** (`manage`: участники,
  видимость и флаги, название, удаление, копия, родословная) — только
  владелец.
- **Платит и записан исполнителем тот, кто нажал** (`actor-context.ts`,
  `actor_user_id`; NULL = владелец). Отказ биллинга — 403 с кодом; право
  правки проверяется ДО биллинга.
- **Каждая запись шлёт ожидание** (`expectedVersion` / `expectedHash` /
  `expected[]`) → 409 `VERSION_CONFLICT`; на клиенте один выбор —
  «Перечитать и повторить», пути «перезаписать» нет.
- **Предложения принимаются только через план правок** (`accepted` ставит
  исполнитель плана); обсуждение документ не меняет и в копию и выгрузки не
  попадает.
- **Участники — только по приглашению владельца** (`services/members.ts`
  через `canManageSynthesis`); `GET /syntheses/shared` смонтирован до
  `/:id` (как и `GET /syntheses/search`, 18.1).
- **Уведомления — одна точка записи `notify`**: код + ссылки + `payload`,
  фраза при чтении.
- **Удаление элемента (15.2)** — одной транзакцией со снимком и каскадом по
  перечню ссылок; восстановления из снимка нет (Огр-13).

""",
    "181/H2 09 — §10: что 18.1 оставила",
    marker="### Что 18.1 оставила знать всем беседам",
)

# ══ 181/I: NEXT-CONTEXT — пишется частью II (завершение беседы) ═════════

# ══ 181/J: часть I-б — тестовые запросы 2–4 ══════════════════════════════
insert_before(
    P07,
    "---\n\n### Беседа 18.2: Поиск в каталоге (клиент)\n",
    "**По факту 18.1 (тестовые запросы 2–4 и сверка после сжатия контекста — 2026-11-16).** → `docs/08-history.md`, глава «Беседа 18.1», подраздел «По факту 18.1 (тестовые запросы 2–4 и сверка после сжатия контекста — 2026-11-16)».\n\n",
    "181/J1 07 — указатель «По факту 18.1 (тестовые запросы 2–4)»",
    marker="**По факту 18.1 (тестовые запросы 2–4 и сверка после сжатия контекста — 2026-11-16).**",
)
insert_before(
    P05,
    "    │                                   # smoke-181-request1 — 18.1: чистые функции (документ индекса, куски\n",
    "    │                                   # test-181-requests2-4 — 18.1: живой сервер, всё по HTTP; импорт образца\n"
    "    │                                   #  и двух его вариантов (английский, немецкий — заменой текста);\n"
    "    │                                   #  R2 поля и языки, опечатка, точный термин, 20 сочетаний фильтров;\n"
    "    │                                   #  R3 видимость (чужое приватное, приглашённый и участник, витрина,\n"
    "    │                                   #  гость, смена ступени); R4 свежесть (правки, удаление, трансформация\n"
    "    │                                   #  на моке и откат, копия, сбой пересчёта на уровне базы) (38 ✓ ×2)\n",
    "181/J2 05 — test-181-requests2-4",
    marker="test-181-requests2-4 — 18.1",
)
insert_before(
    P09,
    "## 5. Node, TypeScript, сборка\n",
    """### Беседа 18.1 — проверки поиска: «не находится», стеммер, сбой в живом сервере

1. **Проверка «не находится» рядом с запасным ходом по похожим словам
   хрупка.** «Трансфигурации» находит «трансформации», слово теста с общей
   меткой прогона — соседа с той же меткой. Либо смотреть `match` ответа
   (`fuzzy` — не точная находка), либо брать слова без похожих соседей.
2. **Стеммер поглощает часть опечаток** («rupturs» → «ruptur»): проба
   запасного хода обязана портить ОСНОВУ слова, не окончание, и проверять
   `match === 'fuzzy'`.
3. **«Витрина не ищется по категории» проверяется на категории, слов
   которой нет в капсуле.** Имя первой категории образца стоит в капсуле —
   витрина находится по нему законно. Харнесс подбирает пробы запросом к
   индексу (`capsule_tsv @@ …` и `word_similarity`).
4. **Сбой внутри живого сервера без разъёма в коде** — на уровне базы:
   `ALTER TABLE … ADD CONSTRAINT … CHECK (…) NOT VALID` запрещает новые
   записи, не трогая чтение и существующие строки; снимать в `finally`.
5. **Язык документа для живого теста — вариантом образца:** замена
   `"lang"` встроенного состояния, названия, зерна и нескольких строк по
   всему файлу; разбор и индекс делает сам импорт. Каждая замена обязана
   сработать (иначе харнесс падает на подготовке, а не зеленеет вхолостую).

""",
    "181/J3 09 — §4: уроки тестов 18.1",
    marker="### Беседа 18.1 — проверки поиска: «не находится», стеммер, сбой в живом сервере",
)

# ══════════════════════════ ЧАСТЬ II (завершение, 2026-11-16) ════════════
def replace_section(path: Path, start: str, end: str, new: str, label: str, marker: str) -> None:
    """Заменяет текст от заголовка start (включительно) до заголовка end
    (не включая) на new; идемпотентность — по marker."""
    global applied, skipped, failed
    text = path.read_text(encoding="utf-8")
    if marker in text:
        print(f"  skip  {label}")
        skipped += 1
        return
    if text.count(start) != 1 or text.count(end) != 1 or text.index(start) > text.index(end):
        print(f"  FAIL  {label}: якоря раздела не найдены однозначно")
        failed += 1
        return
    a, b = text.index(start), text.index(end)
    path.write_text(text[:a] + new + text[b:], encoding="utf-8")
    print(f"  ok    {label}")
    applied += 1


def section_text(path: Path, start: str, end: str) -> str | None:
    text = path.read_text(encoding="utf-8")
    if text.count(start) != 1 or text.count(end) != 1:
        return None
    return text[text.index(start):text.index(end)]


# ══ 181/L: 07 — завершение ═══════════════════════════════════════════════
insert_before(
    P07,
    "---\n\n### Беседа 18.2: Поиск в каталоге (клиент)\n",
    "**По факту 18.1 (завершение — 2026-11-16).** → `docs/08-history.md`, глава «Беседа 18.1», подраздел «По факту 18.1 (завершение — 2026-11-16)».\n\n",
    "181/L1 07 — указатель «По факту 18.1 (завершение)»",
    marker="**По факту 18.1 (завершение — 2026-11-16).**",
)
insert_after(
    P07,
    "> **Три беседы, порядок ЖЁСТКИЙ: 18.1 → 18.2 → 18.3**, после Фазы 17.\n"
    "> Миграция — номер следующий свободный на момент беседы.\n",
    "> **18.1 закрыта 2026-11-16** (сервер: миграция 0020 `search_index` —\n"
    "> таблица `synthesis_search`, наполнение `npm run search:reindex`; одна\n"
    "> функция пересчёта `reindexSynthesis` у всех писателей; маршрут\n"
    "> `GET /syntheses/search` — четвёртый гостевой путь; точный термин ищется\n"
    "> и по имени без скобки-пояснения; запасной ход по триграммам помечает\n"
    "> ответ `match: 'fuzzy'`; сторож 2bg/4br/5az; Д-87 сделан в ней же, Д-88\n"
    "> — адресат 18.3). Ближайшая — 18.2.\n",
    "181/L2 07 — врезка «Фаза 18»: 18.1 закрыта",
    marker="> **18.1 закрыта 2026-11-16** (сервер: миграция 0020",
)
insert_after(
    P07,
    "   родословной) — оба найдены сверкой п.0, оба вне предмета беседы; обе\n"
    "   строки заведены с адресатом «не назначен».\n",
    "   При закрытии 18.1 (2026-11-16) адресаты утверждены пользователем:\n"
    "   Д-87 — сама 18.1 (сделан в ней же отдельным запросом, без снимков\n"
    "   версий; строка — в 08 Часть IV), Д-88 — 18.3 (вписан в её текст). В\n"
    "   реестре — Д-88; строк «не назначен» нет; ограничений не добавлено.\n",
    "181/L3 07 — §12: журнал закрытия 18.1",
    marker="   При закрытии 18.1 (2026-11-16) адресаты утверждены пользователем",
)
insert_after(
    P07,
    "### Беседа 18.2: Поиск в каталоге (клиент)\n",
    "\n"
    "> **От 18.1 (сервер готов, 03 §2.21):** маршрут — `GET /syntheses/search`,\n"
    "> параметры `scope`, `q`, `field`, `philosopher` (повторяемый), `philMode`,\n"
    "> `philArea`, `epoch` (номер эпохи с нуля, повторяемый), `method`,\n"
    "> `synthLevel`, `lang`, `status`, `meta`, `descendantsOf`, `dateFrom`,\n"
    "> `dateTo`, `sort`, `order`, `page`, `limit`; ответ несёт `query` — эхо\n"
    "> параметров (для адресной строки) и `match`. Фрагмент выдачи — куски\n"
    "> `{ text, hit? }`, НЕ разметка. `match: 'fuzzy'` — точных совпадений нет,\n"
    "> найдено похожее (опечатка): показывать как «похожие». У найденного\n"
    "> термина — `term.id`. Константы и типы — `shared/constants/search.ts`,\n"
    "> `shared/types/search.ts`. Гость — только `scope=public` (иное → 401).\n"
    "> Статус и дата сервером принимаются на любом списке; ограничить их\n"
    "> «моими» — дело интерфейса (п.2 запроса).\n",
    "181/L4 07 — пометка от 18.1 в тексте 18.2",
    marker="> **От 18.1 (сервер готов, 03 §2.21):**",
)

# ══ 181/M: 08 Часть V — прежний снимок состояния и комплект 18.1 ═════════
_old_state = section_text(NEXT, "## Состояние на 2026-11-15 (17.2 ЗАКРЫТА 2026-11-15; ФАЗА 17 ЗАКРЫТА; реестр §12 пуст)\n", "## Универсальный минимум любой серверной беседы\n")
_old_kit = section_text(NEXT, "## Ближайшая беседа — 18.1 (поиск концепций: бэкенд; Фаза 18 заведена 2026-11-16)\n", "## До 2026-11-16 — ближайшая беседа не была назначена (Фаза 17 закрыта 2026-11-15, реестр §12 пуст)\n")
_p8 = P08.read_text(encoding="utf-8")
if "### Беседа 18.1 (ЗАКРЫТА 2026-11-16) — что было комплектом" in _p8:
    print("  skip  181/M3 08 Часть V — снимок 17.2 и комплект 18.1")
    skipped += 1
elif _old_state is None or _old_kit is None:
    print("  FAIL  181/M3 08 Часть V: в NEXT-CONTEXT нет прежнего снимка либо комплекта 18.1")
    failed += 1
else:
    _arch = (
        _old_state.replace("## Состояние на", "### Состояние на", 1).rstrip("\n") + "\n\n"
        + "### Беседа 18.1 (ЗАКРЫТА 2026-11-16) — что было комплектом\n"
        + _old_kit.split("\n", 1)[1].rstrip("\n") + "\n\n"
        + "### " + NEXT.read_text(encoding="utf-8").split("\n## До 2026-11-16", 1)[1].join(["До 2026-11-16", ""]).rstrip("\n") + "\n\n"
    )
    insert_before(
        P08,
        "### Состояние на 2026-11-15 (17.1 ЗАКРЫТА 2026-11-15; Фаза 17 открыта; ближайшая — 17.2)\n",
        _arch,
        "181/M3 08 Часть V — снимок 17.2 и комплект 18.1",
        marker="### Беседа 18.1 (ЗАКРЫТА 2026-11-16) — что было комплектом",
    )

# ══ 181/N: 09 — урок §2 ══════════════════════════════════════════════════
insert_before(
    P09,
    "## 3. PostgreSQL, Drizzle, данные\n",
    """### Беседа 18.1 — сжатие контекста посреди первого запроса

1. **Сжатие пришлось между двумя половинами кода** (писатели индекса уже
   расставлены, запрос поиска ещё не написан). Перечитаны были заметки,
   текст запроса и врезка — и работа пошла дальше; снимки инвариантов
   опорных бесед (права 16.1–17.1, удаление 15.2) перечитаны только по
   замечанию пользователя. Расхождений не нашлось, но это удача, а не
   порядок: после сжатия перечитывать и то, НА ЧТО опирается ещё не
   написанный код, — сжатая сводка правил не заменяет.
2. **Сжатые инварианты опорных бесед лежат в 08 Часть V** (снимки
   «Состояние на …») и, с 18.1, выжимкой в 09 §10. До 18.1 в §10 блоков
   15.1–17.2 не было, а тексты бесед на них ссылались.
3. **Блок, вставленный «после заголовка раздела», встаёт выше вводного
   абзаца.** Якорь вставки в раздел со вступлением — первый подзаголовок
   раздела (`insert_before`), а не его заголовок.
4. **Заметки вне контекста** (файл с пунктами запроса, решениями
   пользователя, переписью и принятыми решениями) пережили сжатие и
   сберегли п.0; вести их с первого хода, дописывать после каждого этапа.

""",
    "181/N1 09 — §2: сжатие контекста посреди запроса",
    marker="### Беседа 18.1 — сжатие контекста посреди первого запроса",
)

# ══ 181/O: README — строка Фазы 18 ═══════════════════════════════════════
patch(
    README,
    "| 18 — поиск и похожие концепции | 18.1–18.3 | заведена 2026-11-16 |",
    "| 18 — поиск и похожие концепции | 18.1–18.3 | заведена 2026-11-16; 18.1 (сервер поиска) закрыта 2026-11-16 |",
    "181/O1 README — строка Фазы 18",
)

# ══ 181/P: NEXT-CONTEXT — состояние, минимум, серии, комплект 18.2 ═══════
replace_section(
    NEXT,
    "## Состояние на 2026-11-15 (17.2 ЗАКРЫТА 2026-11-15; ФАЗА 17 ЗАКРЫТА; реестр §12 пуст)\n",
    "## Универсальный минимум любой серверной беседы\n",
    """## Состояние на 2026-11-16 (18.1 ЗАКРЫТА 2026-11-16; Фаза 18 открыта; ближайшая — 18.2)

**18.1 (поиск концепций — бэкенд) ЗАКРЫТА 2026-11-16.** В реестре §12 —
Д-88 (философы вложенных узлов дерева файла не видны обходу родословной),
адресат — 18.3 (вписан в её текст). Д-87 заведён и закрыт в 18.1:
удаление раздела графа / глоссария / тезисов снимает строки элементов
вместе со спутниками (`detachElementSatellites`,
`services/element-satellites.ts` — одна на `deleteElement` и
`deleteSection`), без снимков версий. Ограничений не добавлено. Инварианты с 18.1 (полностью — 09 §10): индекс поиска —
таблица `synthesis_search` (02 §2.42), в нём название, зерно, капсула,
имена категорий, термины и определения; тезисов и текстов разделов нет.
Свежим его держит ОДНА функция `reindexSynthesis(id)`
(`server/services/search-index.ts`): её зовёт каждый писатель
индексируемого сразу после фиксации записи (перепись — сторож 4br; новый
писатель вне переписи красит регресс); функция не бросает, в транзакцию
не вносится; триггеров нет. Наполнение и починка — `npm run
search:reindex` (`--missing`, `--synthesis <uuid>`, `--dry`); `deploy/*`
зовут его после миграций. Маршрут — `GET /syntheses/search` (03 §2.21,
`routes/search.ts`, смонтирован ДО `/:id`): три списка, четыре поля,
фильтры врезки; **четвёртый гостевой путь** (гостю — только `public`).
Права — SQL-зеркало модуля прав (`searchScopeSql`, `searchReadLevelSql` в
`services/capabilities.ts`), сверяется сторожем 5az с `capabilitiesFor`;
правило чтения меняется в ОБОИХ местах; в индексе прав нет. Уровни: `full`
— все поля; `showcase` — название, зерно, капсула (не категории, термины,
определения — и не запасным ходом); `none` (приглашённый, не принявший) —
только название. Запрос — четыре словаря через «или», документ — словарь
языка + `simple`; словарь не нашёл → триграммы (порог 0.4), ответ помечен
`match: 'fuzzy'`. Точный термин — без регистра, целиком либо по имени без
хвостовой скобки. Фрагмент — куски `{ text, hit? }`, не HTML.
Экранирование `%` и `_` для ILIKE — одно (`utils/search-text.ts`).
**Сторож 2bg/4br/5az ЗАНЯТ (следующая серия — 2bh/4bs/5ba); миграция 0020
ЗАНЯТА (следующая — 0021)**; новых ключей i18n нет; smoke-181 47 ✓,
test-181-requests2-4 38 ✓ ×2 (живой сервер, три языка генерации, мок
Claude для трансформации). Клиент не тронут: каталог ходит в прежние
списки, поиск в интерфейсе — 18.2. Доки — `patch-docs-conv181.py`
(четыре части).

""",
    "181/P1 NEXT-CONTEXT — состояние: 18.1 закрыта",
    marker="## Состояние на 2026-11-16 (18.1 ЗАКРЫТА 2026-11-16; Фаза 18 открыта; ближайшая — 18.2)",
)
patch(
    NEXT,
    "17.1 — 0019 `proposals_actor` (+ proposals, proposal_events — 41); следующая — 0020)",
    "17.1 — 0019 `proposals_actor` (+ proposals, proposal_events — 41); 18.1 — 0020 `search_index` (+ synthesis_search — 42; наполняет `npm run search:reindex`); следующая — 0021)",
    "181/P2 NEXT-CONTEXT — универсальный минимум: 42 таблицы",
)
patch(
    NEXT,
    "17.2 — 2bf/4bq (без живой секции — клиент); следующая серия — 2bg/4br/5az).",
    "17.2 — 2bf/4bq (без живой секции — клиент); 18.1 — 2bg/4br/5az; следующая серия — 2bh/4bs/5ba).",
    "181/P3 NEXT-CONTEXT — перечень серий сторожа",
)
_nx = NEXT.read_text(encoding="utf-8")
_start = "## Ближайшая беседа — 18.1 (поиск концепций: бэкенд; Фаза 18 заведена 2026-11-16)\n"
_new_kit = """## Комплект ближайшей беседы — 18.2 (поиск в каталоге: клиент)

Фаза 18 «Поиск и похожие концепции»: 18.1 закрыта 2026-11-16, порядок
жёсткий — 18.2 → 18.3. Сверх универсального минимума (по тексту 18.2 в 07
«Фаза 18»): врезка «Фаза 18» целиком и пометка «От 18.1» в тексте 18.2;
«По факту» 1.6b, 3.2, 8.7, 16.2, 18.1 (три подраздела: первый запрос,
тестовые запросы, завершение); `03` §2.21 (маршрут поиска — контракт
клиента), `01` §8 (оформление клиента), `05`; 09 §10 «Что 18.1 оставила».
Сервер 18.1 как контракт (не править без нужды): `routes/search.ts`,
`packages/shared/constants/search.ts` (списки, поля, сортировки, пределы),
`packages/shared/types/search.ts` (`SynthesisSearchItem`,
`SearchFragment`, `SynthesisSearchResponse`, `SynthesisSearchQueryEcho`).
Клиент: `client/src/pages/CatalogPage.tsx` (вкладки mine / public /
shared, дебаунс `?search=`, `descendantsOf`), `components/catalog/*`,
`components/lineage/LineageSearch.tsx`, `components/edit/
GlossaryTermEditor.tsx` и документ (переход к термину),
`client/src/api/syntheses.ts`, `client/src/i18n/*`; дизайн-набор
`docs/fragments-for-conversations/5-6-ui-kit.*`; харнесс-образец —
`tests/test-172-request1-ui.mjs` (Chrome 131 на сборке клиента), серверный
образец поиска — `tests/test-181-requests2-4.mjs`. Помнить: фрагмент —
куски текста, не разметка; `match: 'fuzzy'` — «похожие», не точные; новые
строки — `tl()` с черновиками en/de. Исходник не нужен. Серия сторожей —
2bh/4bs (без живой секции — клиент), миграций не ожидается (следующая —
0021). Открытый долг Д-88 в 18.2 не входит (адресат — 18.3).

## Беседа 18.1 (ЗАКРЫТА 2026-11-16) — что было комплектом

Перенесено в `docs/08-history.md`, Часть V (вместе со снимком состояния
на 2026-11-15).
"""
if "## Комплект ближайшей беседы — 18.2 (поиск в каталоге: клиент)" in _nx:
    print("  skip  181/P4 NEXT-CONTEXT — комплект 18.2")
    skipped += 1
elif _nx.count(_start) != 1:
    print("  FAIL  181/P4 NEXT-CONTEXT: заголовок комплекта 18.1 не найден")
    failed += 1
else:
    NEXT.write_text(_nx[: _nx.index(_start)] + _new_kit, encoding="utf-8")
    print("  ok    181/P4 NEXT-CONTEXT — комплект 18.2 (хвост файла перезаписан)")
    applied += 1

# ══════════════════════════ ЧАСТЬ III (долги, 2026-11-16) ════════════════
# ══ 181/Q: Д-87 закрыт, Д-88 → 18.3 ══════════════════════════════════════
_p8 = P08.read_text(encoding="utf-8")
_d87 = ("| Д-87 — Удаление раздела (`deleteSection`, 15.2) снимало гранулярные строки только у графа: у разделов `glossary` и `theses` строки `glossary_terms` / `theses` оставались (их отдавал `GET /glossary`, находил поиск 18.1); спутников элементов без FK (обогащения, обоснования, ссылки рекомендаций) удаление раздела не снимало ни у кого | 18.1 | 18.1 (первый запрос, сверка п.0) | ЗАКРЫТ 18.1 (2026-11-16; адресат и способ — решение пользователя: без снимков версий): удаление раздела графа / глоссария / тезисов снимает строки элементов одной транзакцией со спутниками — `detachElementSatellites` (`services/element-satellites.ts`), общая с `deleteElement` 15.2; рекомендации `new`/`stale` → `invalid` кодом `target_element_gone`; индекс поиска пересчитывается; сторожа 4br (Д-87), 4bj, 5az; smoke-181 E9a |\n")
if "| Д-87 — Удаление раздела (`deleteSection`, 15.2)" in _p8:
    print("  skip  181/Q1 08 Часть IV — Д-87")
    skipped += 1
else:
    _i = _p8.index("### Закрытые долги")
    _j = _p8.index("\n\n", _p8.index("| Долг | Адресат | Заведён | Состояние |", _i))
    P08.write_text(_p8[: _j + 1] + _d87 + _p8[_j + 1 :], encoding="utf-8")
    print("  ok    181/Q1 08 Часть IV — Д-87 (заведён и закрыт беседой 18.1)")
    applied += 1
insert_after(
    P07,
    "### Беседа 18.3: Похожие концепции (бэкенд + клиент)\n",
    "\n"
    "> **Долг 18.1 с адресатом 18.3 (§12): Д-88** — обход родословной\n"
    "> (`searchByPhilosophers`; фильтр поиска `philArea=lineage` и `epoch` в\n"
    "> этой области — `ANC_CTE` в `services/search.ts`) идёт по строкам\n"
    "> `synthesis_lineage` и не видит философов ВЛОЖЕННЫХ узлов дерева\n"
    "> импортированного файла (`syntheses.file_genealogy`). Похожим концепциям\n"
    "> нужны «философы по родословной» и «общие предки» — сделать ОДНУ функцию\n"
    "> обхода (строки БД + дерево файла с правилом приоритета 15.1) и перевести\n"
    "> на неё `/lineage/search`, фильтр поиска и сходство; сторож — три\n"
    "> потребителя дают один ответ.\n",
    "181/Q2 07 — Д-88 в тексте 18.3",
    marker="> **Долг 18.1 с адресатом 18.3 (§12): Д-88**",
)
patch(
    P03,
    "| E3 | Удаление раздела | MVP |\n",
    "| E3 | Удаление раздела | MVP |\n"
    "| | ↳ 18.1 (Д-87): раздел уносит свои гранулярные строки — граф (категории, связи, метки кластеров), глоссарий (термины), тезисы — вместе с обогащениями, обоснованиями и ссылками рекомендаций на них (рекомендации `new`/`stale` становятся `invalid`, `target_element_gone`); снимков версий не пишется; индекс поиска пересчитывается | |\n",
    "181/Q3 03 — E3: что уносит удаление раздела",
    marker="↳ 18.1 (Д-87): раздел уносит свои гранулярные строки",
)
insert_before(
    P05,
    "│   │   ├── element-versioning.ts       # Создание версий, откат (НОВОЕ)\n",
    "│   │   ├── element-satellites.ts       # 18.1 (Д-87): detachElementSatellites — обогащения, обоснования\n"
    "│   │   │                               # и ссылки рекомендаций удаляемых элементов; одна на deleteElement\n"
    "│   │   │                               # (15.2) и deleteSection; модуль-лист\n",
    "181/Q4 05 — services/element-satellites.ts",
    marker="│   │   ├── element-satellites.ts       # 18.1 (Д-87)",
)
insert_before(
    P09,
    "## 8. Прочее\n",
    """### Беседа 18.1 (Д-87) — общее правило двух путей и цикл импортов

1. **Правило, нужное двум службам, которые зависят друг от друга, —
   в модуль-лист.** Чистку спутников удалённого элемента зовут редактор
   элементов и служба генерации; редактор импортирует службу, а
   `recommendations.ts` (где жила `withIssueTexts`) — тоже. Лист
   `element-satellites` + перенос `withIssueTexts` в лист
   `recommendation-issues` с реэкспортом на прежнем месте — без цикла и
   без правки потребителей.
2. **Сторож, читающий ТЕЛО функции, ломается выносом правила** (4bj искал
   `withIssueTexts([gone, …])` в теле `deleteElement`): при выносе в общий
   модуль сторожу дать читать тело + модуль, а не снимать проверку.
3. **Порт исходника чистил то, что в исходнике жило в DOM.** Гранулярные
   строки (`glossary_terms`, `theses`) — добавление службы; у операции,
   перенесённой из исходника «как есть», проверять, что она делает со
   строками, которых в исходнике не было.

""",
    "181/Q5 09 — §7: урок Д-87",
    marker="### Беседа 18.1 (Д-87) — общее правило двух путей и цикл импортов",
)

print(f"\nИтого: applied={applied}, skip={skipped}, fail={failed}")
sys.exit(1 if failed else 0)
