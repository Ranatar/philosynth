#!/usr/bin/env python3
"""Постскриптум беседы 12.1 (2026-10-05, решения пользователя после закрытия).
  A  Д-36 и Д-37 зачислены в 12.2: 07 — врезка «Фаза 12», текст 12.2
     (комплект, первый запрос пп.6–7, сторож → п.8, тестовый запрос),
     §12 (адресат), «По факту 12.1» п.13.
  B  Шесть ключей беседы утверждены (en/de, черновиков нет; одна правка en —
     «formulation», термин каталога): 07 «По факту 12.1» п.12.
  C  08 Часть I — постскриптум; NEXT-CONTEXT — состояние, реестр, комплект 12.2.
Идемпотентен (new-in-text либо marker проверяется ПЕРВЫМ). Запуск из корня,
ПОСЛЕ patch-docs-conv121.py:
    python3 scripts/patches/patch-docs-conv121-post.py
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
    if new in text or (marker and marker in text):
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


def insert_after_line(rel: str, prefix: str, block: str, label: str, marker: str) -> None:
    global applied, skipped, failed
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    if marker in text:
        skipped += 1
        print(f"  skip  {label}")
        return
    lines = text.split("\n")
    hits = [i for i, l in enumerate(lines) if l.startswith(prefix)]
    if len(hits) != 1:
        failed += 1
        print(f"  fail  {label}: строк с началом {prefix!r} — {len(hits)}")
        return
    lines[hits[0] + 1:hits[0] + 1] = block.rstrip("\n").split("\n")
    path.write_text("\n".join(lines), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


P07 = "docs/07-conversation-protocol.md"

# ── A. Д-36 и Д-37 → 12.2 ───────────────────────────────────────────────────
patch(
    P07,
    ">   Д-29, Д-30; сервер и клиентский граф — одной беседой, потому что\n",
    ">   Д-29, Д-30 и (зачислены 2026-10-05 по итогам 12.1) Д-36, Д-37 — разбор\n"
    ">   прозы тезисов и извлечение названия: тот же импорт и тот же файл\n"
    ">   концепции; сервер и клиентский граф — одной беседой, потому что\n",
    "A1 07: врезка «Фаза 12» — состав 12.2",
)
insert_after_line(
    P07,
    "  - `server/services/import-service.ts` (`extractSections`",
    "  - разбор прозы тезисов и название (Д-36, Д-37; зачислены из 12.1): `server/services/element-parser.ts` "
    "(`buildJustificationIndex`, `parseThesisParagraphs`, `thesisLabelOf`), `server/utils/html-parser.ts` "
    "(`replaceThesisParagraph`), `server/services/element-editor.ts` (`planThesisProseSync`, `patchThesisParagraph`), "
    "`server/services/generation-service.ts` (`extractTitleFromNameHtml`) и его копии — `resolveConceptName` в "
    "`import-service.ts` и в `client/src/utils/genealogy.ts` (дрейф-сторож 4z); образцы проверок — "
    "`tests/smoke-121-request1.mjs`, `tests/test-121-requests2-5.mjs`\n",
    "A2 07: комплект 12.2 — файлы Д-36/Д-37",
    marker="  - разбор прозы тезисов и название (Д-36, Д-37; зачислены из 12.1)",
)
patch(
    P07,
    "Закрываю долги реестра §12 с адресатом 12.2 — экспорт и граф. Сервер\n"
    "правлю в экспорте, импорте (только снятие следов оглавления) и разборе\n"
    "графа; клиент — только граф. Прочее — строка §12 с адресатом.\n",
    "Закрываю долги реестра §12 с адресатом 12.2 — экспорт и граф, а также\n"
    "два долга разбора, зачисленные из 12.1 (Д-36, Д-37). Сервер правлю в\n"
    "экспорте, импорте (только снятие следов оглавления), разборе графа,\n"
    "разборе прозы тезисов и извлечении названия; клиент — только граф и\n"
    "копия resolveConceptName. Прочее — строка §12 с адресатом.\n",
    "A3 07: первый запрос 12.2 — вводный абзац",
)
ITEMS = """6. Д-36 (зачислен из 12.1). Разбор обоснований тезисов знает одну
   раскладку — «<strong>формулировка</strong> обоснование» одним
   абзацем. Живой документ пишет иначе: <h5>Тезис О-1 (…)</h5>, абзац из
   одной жирной формулировки, следующий абзац «<strong>Обоснование.
   </strong> …»; формулировка в прозе переписана относительно сводной
   таблицы. Итог: theses.justification пуст у всех тезисов, редактор 5.2
   абзац не находит (htmlSync.pending), сведение 12.1 даёт одни
   предупреждения («По факту 12.1» п.4). Сделать ВТОРУЮ модель абзаца с
   якорем по МЕТКЕ тезиса (theses.label, 12.1) в <h5>:
   buildJustificationIndex и parseThesisParagraphs её читают,
   replaceThesisParagraph пишет обоснование в абзац «Обоснование.», а
   формулировку — в абзац формулировки, planThesisProseSync сводит блок
   тезиса по метке. Первая модель (документы службы) — без изменений;
   прочие абзацы блока («Ограничения…», списки) не трогать. Уже
   импортированные концепции с пустым justification не дозаполнять
   миграцией — только новый разбор и правка.

7. Д-37 (зачислен из 12.1). extractTitleFromNameHtml на
   «<strong>«X»: подзаголовок</strong>» отдаёт «X»» — кавычки снимаются
   ДО разреза по двоеточию. Снимать и после. Те же строки — в копиях:
   resolveConceptName в import-service и в client/src/utils/genealogy.ts
   (дрейф-сторож 4z). Уже записанные названия с ёлочкой не чинить.

8. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):
   обе раскладки абзаца тезиса разбираются и пишутся (круг
   parse → replaceThesisParagraph → parse), название без хвостовой
   ёлочки в трёх копиях;
   оглавление и древо в выгрузке,"""
patch(
    P07,
    "6. Сторож в check:integration (следующая серия — по NEXT-CONTEXT):\n"
    "   оглавление и древо в выгрузке,",
    ITEMS,
    "A4 07: первый запрос 12.2 — пп.6–7, сторож → п.8",
    marker="6. Д-36 (зачислен из 12.1). Разбор обоснований тезисов знает одну",
)
patch(
    P07,
    "- не трогать клиент вне графа (12.4);\n- не править генератор ассетов экспорта",
    "- не трогать клиент вне графа и копии resolveConceptName в\n  utils/genealogy.ts (12.4);\n- не править генератор ассетов экспорта",
    "A5 07: «чего не делать» 12.2",
)
insert_after_line(
    P07,
    "- «Протестируй Д-10: граф с типами",
    "- «Протестируй Д-36/Д-37 на файле концепции: импорт → theses.justification непуст у каждого тезиса с абзацем "
    "«Обоснование.»; правка обоснования редактором 5.2 → абзац прозы изменён (patched, не pending), прочие абзацы блока "
    "целы; правка абзаца «Обоснование.» в подразделе → theses.justification обновлён, версия 'manual'; документ с "
    "одноабзацной раскладкой — как прежде (tests/test-121 зелёный). Название «X»: подзаголовок → «X» без ёлочки при "
    "генерации и при импорте»\n",
    "A6 07: тестовый запрос 12.2 — Д-36/Д-37",
    marker="- «Протестируй Д-36/Д-37 на файле концепции:",
)
patch(
    P07,
    "«По факту 12.1» п.4; файл концепции | не назначен | открыт |",
    "«По факту 12.1» п.4; файл концепции | 12.2 (зачислен 2026-10-05) | открыт |",
    "A7 07 §12: Д-36 → 12.2",
)
patch(
    P07,
    "«По факту 12.1» п.13; смоук 12.1 | не назначен | открыт |",
    "«По факту 12.1» п.13; смоук 12.1 | 12.2 (зачислен 2026-10-05) | открыт |",
    "A8 07 §12: Д-37 → 12.2",
)
patch(
    P07,
    "    обоснований под раскладку с `<h5>` (Д-36) и ёлочка в названии\n"
    "    `extractTitleFromNameHtml` (Д-37) — адресат не назначен.\n",
    "    обоснований под раскладку с `<h5>` (Д-36) и ёлочка в названии\n"
    "    `extractTitleFromNameHtml` (Д-37) — зачислены в 12.2 решением\n"
    "    пользователя 2026-10-05 (пп.6–7 её первого запроса).\n",
    "A9 07: «По факту 12.1» п.13 — адресат",
)

# ── B. Переводы утверждены ──────────────────────────────────────────────────
patch(
    P07,
    "    Шесть новых строк сервера — через `tl()`, en/de черновиками (`draft`).\n",
    "    Шесть новых строк сервера — через `tl()`; en/de влиты черновиками и\n"
    "    УТВЕРЖДЕНЫ 2026-10-05 (`i18n:import` без `--draft`, черновиков 0; одна\n"
    "    правка en — «formulation» вместо «wording»: термин каталога).\n",
    "B1 07: «По факту 12.1» п.12 — переводы утверждены",
)

# ── C. 08 и NEXT-CONTEXT ────────────────────────────────────────────────────
patch(
    "docs/08-history.md",
    "patch-docs-conv121.py; ближайшая — 12.2.\n",
    "patch-docs-conv121.py; ближайшая — 12.2.\n"
    "Постскриптум 12.1 (2026-10-05): шесть ключей беседы утверждены (en/de,\n"
    "черновиков 0; одна правка en); Д-36 (вторая раскладка абзаца тезиса) и Д-37\n"
    "(ёлочка в названии) зачислены в 12.2 — пп.6–7 её первого запроса;\n"
    "patch-docs-conv121-post.py.\n",
    "C1 08 Часть I: постскриптум 12.1",
)
patch(
    "NEXT-CONTEXT.md",
    "Д-36, Д-37 (адресат не назначен), Д-38 (12.5). Миграция 0011 (`theses.label`).\n"
    "Шесть новых ключей сервера — черновики en/de (`draft`), утверждает владелец.\n",
    "Д-36, Д-37 (12.2 — зачислены 2026-10-05), Д-38 (12.5). Миграция 0011 (`theses.label`).\n"
    "Шесть новых ключей сервера УТВЕРЖДЕНЫ 2026-10-05 (en/de, черновиков нет).\n",
    "C2 NEXT-CONTEXT: состояние",
)
patch(
    "NEXT-CONTEXT.md",
    "Д-29, Д-30) → 12.3 планы",
    "Д-29, Д-30, Д-36, Д-37) → 12.3 планы",
    "C3 NEXT-CONTEXT: реестр — Д-36, Д-37 в 12.2",
)
patch(
    "NEXT-CONTEXT.md",
    "строки с адресатом 12.2 (Д-9, Д-10, Д-29, Д-30) и «По факту» 1.7, 4.2, 4.3,\n",
    "строки с адресатом 12.2 (Д-9, Д-10, Д-29, Д-30, Д-36, Д-37) и «По факту» 1.7, 4.2, 4.3,\n",
    "C4 NEXT-CONTEXT: комплект 12.2 — строки §12",
)
patch(
    "NEXT-CONTEXT.md",
    "экспорт-зеркала русские). Файл концепции (как T92_FILE): на нём проверяется\n",
    "экспорт-зеркала русские). Для Д-36/Д-37 (разбор прозы тезисов и название):\n"
    "`server/services/element-parser.ts`, `server/utils/html-parser.ts`\n"
    "(`replaceThesisParagraph`), `server/services/element-editor.ts`\n"
    "(`planThesisProseSync`), `server/services/generation-service.ts`\n"
    "(`extractTitleFromNameHtml`) и копии `resolveConceptName` (import-service,\n"
    "`client/src/utils/genealogy.ts`), тесты 12.1 как образец. Файл концепции (как\n"
    "T92_FILE и T121_FILE): на нём проверяются раскладка тезисов (Д-36) и\n",
    "C5 NEXT-CONTEXT: комплект 12.2 — файлы Д-36/Д-37",
)

print(f"\nприменено {applied}, повтор skip {skipped}, ошибок {failed}")
sys.exit(1 if failed else 0)
