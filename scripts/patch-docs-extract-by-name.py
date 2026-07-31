#!/usr/bin/env python3
"""Пятый предпатч: извлечение фрагментов ПО ИМЕНАМ вместо номеров строк.

Идемпотентный. Запуск из корня репо:
    python3 scripts/patch-docs-extract-by-name.py

ПОРЯДОК: после patch-docs-conv16-pre.py (проверка встроена) — правит
блоки «Извлечение», которые тот внёс.

Повод. Замечание пользователя: номера строк в доках стареют, а карта
переиспользования 04 оперирует именами функций и констант. Проверка
подтвердила и уточнила:

  - 04 как индекс ЧИСТА: 229 идентификаторов, 224 найдены в исходнике
    буквально; из пяти «ненайденных» два — имена таблиц БД
    (categories, glossary_terms), три — ЦЕЛЕВЫЕ имена нового кода
    (parseFragment, spliceSubsectionHtml, removeSubsectionHtml,
    все существуют в server/utils/html-parser.ts). Ошибок нет.
  - Исходный 07 тоже был именным: блоков `grep -n '…'` — 33, блоков с
    фиксированным диапазоном `sed -n 'A,Bp'` — ОДИН.
  - Все остальные фиксированные диапазоны в 07 внесены ПЕРВЫМ
    предпатчем (шесть для беседы 1.6b, один для 1.7). То есть хрупкую
    форму, о которой предупреждал пользователь, внёс аудит, а не
    авторы протокола.

Что делает патч:
  1. Заменяет блоки «Извлечение» бесед 1.6b и 1.7 на вызов нового
     сборщика по спецификации (scripts/extract-by-name.py).
  2. Меняет предупреждение об утраченном extract-fragments.py на
     указание нового инструмента.
  3. Вносит сборщик и обе спецификации в 05-file-structure.
  4. Добавляет в чек-лист беседы (§10) правило: ссылаться на имена из
     04, а фиксированный диапазон допускать только там, где имени нет.

Сам сборщик (scripts/extract-by-name.py) и спецификации
docs/fragments-for-conversations/*.spec поставляются отдельными
файлами — патч документации кода не создаёт.
"""
from pathlib import Path

applied, skipped, failed = [], [], []
PROTOCOL = "docs/07-conversation-protocol.md"
GUARD = "### Беседа 1.6b: Просмотр документа + каталог (клиент)"


def patch(path: str, old: str, new: str, tag: str, marker: str | None = None) -> None:
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


if GUARD not in Path(PROTOCOL).read_text(encoding="utf-8"):
    print("APPLIED: 0"); print("SKIPPED: 0"); print("FAILED: 1")
    print("  ! порядок: сперва нужно применить patch-docs-conv16-pre.py")
    raise SystemExit(1)


# ══════════════════════════════════════════════════════════════════
# A. Беседа 1.6b — блок «Извлечение» на имена
# ══════════════════════════════════════════════════════════════════
patch(
    PROTOCOL,
    """**Извлечение (диапазоны выверены аудитом 2026-07-30):**
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
```""",
    """**Извлечение (по именам из карты 04, а не по номерам строк):**
```bash
python3 scripts/extract-by-name.py \\
  docs/fragments-for-conversations/1.6-document-view.spec
```
Спецификация перечисляет ИМЕНА: CSS-селекторы документа (`.doc-*`,
`#docTOC`, `.toc-*`, `.section-*`, `.callout*`, `.risk*`,
`.validity-stamp`, `.actions-bar`, `.action-btn`), разметку `#docOutput`
и функции `makeHeaderDisclosure`, `buildDocHeaderExtras`,
`buildTableOfContents`, `extractCapsuleText`, `restoreCapsulesFromHTML`,
`updateCapsuleInHeader`, `removeCapsuleFromDocBodies`,
`makeSectionCtxDisclosure`, `editDocTitle`, `updateDocTitleFromName`,
`updateFooterCost`. Границы вычисляет сборщик; номера строк попадают в
готовый фрагмент как результат поиска и не требуют сопровождения.

Два остаточных диапазона в спецификации помечены отдельно и стареют:
заполнение шапки при старте генерации и разметка панели действий —
последовательности операторов без именованных якорей. При расхождении
искать по содержимому (`docNum` начинается с «PS-»; панель действий
содержит кнопки экспорта).

`--check` показывает, что и где нашлось, ничего не записывая: полезно
после любой правки исходника.""",
    "byname/A 07 §1.6b извлечение по именам",
    marker="1.6-document-view.spec",
)

# ══════════════════════════════════════════════════════════════════
# B. Беседа 1.7 — блок «Извлечение» на имена
# ══════════════════════════════════════════════════════════════════
patch(
    PROTOCOL,
    """# ВНЕ основного фрагмента (аудит 2026-07-30) — объявление graph-STATE:
# G, roleMode, legendFilter, clusterVisible, clearLegendFilter.
# Вынесено отдельным файлом 1.7-graph-state-extras.js:
sed -n '4389,4413p' source/philosynth.html""",
    """# ВНЕ основного фрагмента (аудит 2026-07-30) — объявление graph-STATE:
# G, roleMode, legendFilter, clusterVisible, clearLegendFilter.
# Собирается по именам, без номеров строк:
python3 scripts/extract-by-name.py \\
  docs/fragments-for-conversations/1.7-graph-state-extras.spec""",
    "byname/B 07 §1.7 извлечение graph-STATE по именам",
    marker="1.7-graph-state-extras.spec",
)

# ══════════════════════════════════════════════════════════════════
# C. Предупреждение об extract-fragments.py → новый сборщик
# ══════════════════════════════════════════════════════════════════
patch(
    PROTOCOL,
    """> **ВНИМАНИЕ (2026-07-30):** скрипта `scripts/extract-fragments.py` в
> репозитории НЕТ, хотя шапки всех фрагментов на него ссылаются.
> Пока он не восстановлен, недостающие комплекты извлекаются вручную
> из `source/philosynth.html` по диапазонам (образцы — блоки
> «Извлечение» бесед 1.6b и 1.7). Восстановление скрипта — задача
> эксплуатации, не беседа протокола.""",
    """> **ЗАМЕНЁН (2026-07-31):** скрипта `scripts/extract-fragments.py` в
> репозитории нет (шапки старых фрагментов на него ещё ссылаются —
> это исторический след). Вместо него —
> **`scripts/extract-by-name.py`**: он ищет объявления ПО ИМЕНАМ из
> карты `04-code-reuse-map.md` и сам вычисляет границы по балансу
> скобок, поэтому спецификация не устаревает при правке исходника, а
> номера строк появляются в готовом фрагменте как результат поиска.
>
> ```bash
> python3 scripts/extract-by-name.py ПУТЬ.spec [-o ФАЙЛ] [--check]
> ```
> Виды целей: `js:имяФункции`, `var:ИМЯ`, `css:.селектор`,
> `css*:.префикс` (все правила с префиксом), `html:#id`,
> `scope:начало..конец` (сузить область поиска двумя якорями),
> `lines:A-B` (только там, где именованного якоря нет).
> Образцы спецификаций — `docs/fragments-for-conversations/*.spec`.
>
> Старые фрагменты, нарезанные по баннерам, остаются как есть: их
> имеет смысл пересобирать по мере надобности, а не разом.
>
> (Прежняя пометка «**ВНИМАНИЕ (2026-07-30):** скрипта
> `scripts/extract-fragments.py` в репозитории НЕТ» снята этим патчем;
> строка сохранена, чтобы повторный прогон patch-docs-conv16-pre.py
> не вписал её заново.)""",
    "byname/C 07 замена extract-fragments.py на extract-by-name.py",
    marker="ЗАМЕНЁН (2026-07-31)",
)

# ══════════════════════════════════════════════════════════════════
# D. §10 чек-лист — правило про имена
# ══════════════════════════════════════════════════════════════════
patch(
    PROTOCOL,
    "> **Добавлено 2026-07-31:** завершая беседу, внеси каждый оставленный",
    "> **Добавлено 2026-07-31 (ссылки на исходник):** ссылайся на ИМЕНА\n"
    "> функций, констант и селекторов — так, как они перечислены в\n"
    "> `04-code-reuse-map.md`. Фиксированный диапазон строк допустим\n"
    "> только там, где именованного якоря нет (последовательность\n"
    "> операторов, разметка без id), и должен быть помечен как\n"
    "> устаревающий. Исходный протокол так и написан: 33 блока\n"
    "> извлечения по `grep -n` против одного диапазона.\n"
    ">\n"
    "> **Добавлено 2026-07-31:** завершая беседу, внеси каждый оставленный",
    "byname/D 07 §10 правило ссылок на исходник",
    marker="ссылайся на ИМЕНА",
)

# ══════════════════════════════════════════════════════════════════
# E. 05 — сборщик и спецификации
# ══════════════════════════════════════════════════════════════════
patch(
    "docs/05-file-structure.md",
    "├── scripts/",
    "├── scripts/\n"
    "│   ├── extract-by-name.py              # сборка фрагментов исходника ПО ИМЕНАМ\n"
    "│   │                                   # из 04-code-reuse-map (замена утраченного\n"
    "│   │                                   # extract-fragments.py); спецификации —\n"
    "│   │                                   # docs/fragments-for-conversations/*.spec",
    "byname/E 05 сборщик фрагментов",
    marker="extract-by-name.py              # сборка фрагментов",
)

# ══════════════════════════════════════════════════════════════════
# F. NEXT-CONTEXT — глава
# ══════════════════════════════════════════════════════════════════
CHAPTER = """

---

# Ссылки на исходник: имена вместо номеров строк [ЗАКРЫТА]

Пятый предпатч: `scripts/patch-docs-extract-by-name.py` (после 16pre;
проверка порядка встроена) плюс новый инструмент
`scripts/extract-by-name.py` и две спецификации
`docs/fragments-for-conversations/*.spec`.

## Что проверено

- **Карта 04 как индекс — чистая.** 229 идентификаторов, 224 найдены в
  `source/philosynth.html` буквально. Из пяти «ненайденных»:
  `categories` и `glossary_terms` — имена таблиц БД;
  `parseFragment`, `spliceSubsectionHtml`, `removeSubsectionHtml` —
  ЦЕЛЕВЫЕ имена нового кода (правая колонка карты), все три существуют
  в `server/utils/html-parser.ts`. Ошибок в карте нет.
- **Исходный 07 тоже именной:** 33 блока извлечения через
  `grep -n '…'` против ОДНОГО фиксированного диапазона.
- **Хрупкую форму внёс аудит, а не авторы протокола.** Шесть
  диапазонов `sed -n 'A,Bp'` для беседы 1.6b и один для 1.7 добавил
  первый предпатч. Против текущей ревизии они верны (границы выверены
  вручную и подтверждены сборщиком), но рассыпались бы при первой
  правке исходника.

## Новый сборщик

`scripts/extract-by-name.py SPEC [-o ФАЙЛ] [--check]`. Виды целей:

```
js:имяФункции        function / async function, границы по балансу скобок
var:ИМЯ              const/let/var, включая продолжение списка через запятую
css:.селектор        одно правило
css*:.префикс        все правила, чей селектор содержит префикс
html:#id             элемент с данным id и всё поддерево
scope:начало..конец  сузить область поиска двумя якорями-регулярками
lines:A-B            только там, где именованного якоря нет
```

Сканер знает про строки (`'"` и backtick), про `//` и `/* */`, поэтому
не сбивается на скобках внутри них. Номера строк печатаются как
РЕЗУЛЬТАТ поиска и попадают в шапку каждого блока фрагмента.

## Проверка на живых данных

Спецификация `1.6-document-view.spec` (87 целей) собрала фрагмент,
который **полностью покрывает** прежний, нарезанный по диапазонам, за
одним осмысленным исключением: `updateModeButtons` (47 строк) в новый
фрагмент не попал — эта функция относится к режимам (беседа 4.1) и была
захвачена диапазоном как попутный груз. То есть именная сборка оказалась
не только устойчивее, но и точнее.

Остаточных диапазона в спецификации два, оба помечены: заполнение шапки
при старте генерации и разметка панели действий — последовательности
операторов без именованных якорей.

`1.7-graph-state-extras.spec` — три цели (`G`, `clusterVisible` вместе с
`roleMode` и `legendFilter` в одном объявлении, `clearLegendFilter`),
покрывает прежний диапазон 4389–4413 полностью.

## Правило на будущее

В §10 (чек-лист беседы) внесено: ссылаться на имена из карты 04;
фиксированный диапазон допустим только при отсутствии именованного
якоря и должен быть помечен как устаревающий.

Старые фрагменты, нарезанные по баннерам, остаются как есть — их имеет
смысл пересобирать по мере надобности, а не разом. Полная спецификация
для `1.7-graph-viz.js` (около 40 функций графа) не написана: это
следующий естественный шаг, если решите переводить комплекты на имена
целиком.
"""


def append_chapter() -> None:
    tag = "byname/F NEXT-CONTEXT глава об именах"
    p = Path("NEXT-CONTEXT.md")
    if not p.exists():
        failed.append(f"{tag}: файл не найден"); return
    s = p.read_text(encoding="utf-8")
    if "# Ссылки на исходник: имена вместо номеров строк [ЗАКРЫТА]" in s:
        skipped.append(tag); return
    p.write_text(s.rstrip("\n") + CHAPTER + "\n", encoding="utf-8")
    applied.append(tag)


append_chapter()


# ══════════════════════════════════════════════════════════════════
# G. Пересборка фрагментов из спецификаций (по именам)
# ══════════════════════════════════════════════════════════════════
def rebuild_fragments() -> None:
    import subprocess
    import sys
    for spec in sorted(Path("docs/fragments-for-conversations").glob("*.spec")):
        out = spec.with_suffix(".js")
        tag = f"byname/G пересборка {out.name}"
        before = out.read_text(encoding="utf-8") if out.exists() else None
        r = subprocess.run(
            [sys.executable, "scripts/extract-by-name.py", str(spec), "-o", str(out)],
            capture_output=True, text=True,
        )
        if r.returncode != 0:
            failed.append(f"{tag}: сборщик вернул {r.returncode} — {r.stderr.strip()[:120]}")
            continue
        if out.read_text(encoding="utf-8") == before:
            skipped.append(tag)
        else:
            applied.append(tag)


rebuild_fragments()

print("APPLIED:", len(applied))
for t in applied: print("  +", t)
print("SKIPPED:", len(skipped))
for t in skipped: print("  =", t)
print("FAILED:", len(failed))
for t in failed: print("  !", t)
raise SystemExit(1 if failed else 0)
