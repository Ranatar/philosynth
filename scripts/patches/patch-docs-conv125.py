#!/usr/bin/env python3
"""Патч документации по беседе 12.5 (харнессы, инструменты переводов, доки;
последняя Фазы 12).
ЧАСТЬ I — по первому запросу (2026-10-12): найденное переносится в доки
немедленно, до тестовых запросов и закрытия (09 §2, 11.3 п.3). Часть II
(закрытые строки §12 → 08 Часть IV, хроника, NEXT-CONTEXT, 09)
дописывается при завершении беседы новыми patch() ниже — применённые
правки не редактируются (09 §2, 8.1).
  A  07 — блок «По факту 12.5 (первый запрос)»: сверка текста запроса с
     кодом по тринадцати пунктам, найденное.
  B  07 §12 — состояние тринадцати строк 12.5 (сделаны первым запросом,
     закрытие — при завершении).
  C  07 — Д-28: блоки-указатели «По факту» 0.2, 0.3b, 0.6, 2.3, 2.4, 3.1;
     §10 — правило «По факту» пишется всегда.
  D  07 — шаблон «Типовая беседа L»: пункты 1 и 5 первого запроса → add-lang,
     пункт 4 — сторожа/тесты берут языки из UI_LOCALES.
  E  03 §3.1 — generation_paused += sectionKeys, replay (Д-50).
  F  04 §4 — строка 12.5.  G  05 — новые файлы.  H  NEXT-CONTEXT — строка
     состояния после первого запроса.
Скрипт идемпотентен (new-in-text либо marker проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patches/patch-docs-conv125.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
applied = skipped = failed = 0


def _load(rel: str, label: str):
    global failed
    path = ROOT / rel
    if not path.exists():
        failed += 1
        print(f"  fail  {label}: нет файла {rel}")
        return None, None
    return path, path.read_text(encoding="utf-8")


# Правки части I, чей текст закрытие беседы законно меняет (строки §12
# снимаются при закрытии): узнаются по маркеру блока завершения.
CLOSE_MARK_125 = "**По факту 12.5 (завершение — беседа закрыта"
SUPERSEDED = {
    "B1 07 §12: состояние строк 12.5",
    "B2 07 §12: преамбула — первый запрос 12.5",
    "H NEXT-CONTEXT: состояние после первого запроса 12.5",
}


def _superseded(label: str, text: str) -> bool:
    if label.startswith("H NEXT-CONTEXT"):
        return "ЗАКРЫТА 2026-10-13 — Фаза 12" in text  # часть II переписала строку состояния
    return label in SUPERSEDED and CLOSE_MARK_125 in text


def patch(rel: str, old: str, new: str, label: str, marker: str | None = None) -> None:
    global applied, skipped, failed
    path, text = _load(rel, label)
    if path is None:
        return
    if new in text or (marker and marker in text) or _superseded(label, text):
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


P07 = "docs/07-conversation-protocol.md"
P03 = "docs/03-specification.md"
P04 = "docs/04-code-reuse-map.md"
P05 = "docs/05-file-structure.md"
PNC = "NEXT-CONTEXT.md"

# ── A. 07 — «По факту 12.5» (первый запрос) ──────────────────────────────
FACT_125 = """**По факту 12.5 (первый запрос — 2026-10-12).** Сверка текста запроса с кодом
по тринадцати пунктам и найденное:

1. **Д-24.** `smoke-55` звал снятые 5.5/8.4 `transformGraphToTheses`/
   `ThesesToGraph` — переведён на `startTransformRequest(S1, kind)`; сверх
   того с 12.4 гейт `isOwner && !live` стоит на всём слоте
   `sectionActionsFor`, не на `TransformPanel` — проверка переписана под
   форму 12.4. 57 ✓.
2. **Д-25.** `is_public`/`isPublic` → `visibility` ('private'/'full') в
   16b/17/52; блок UI «Опубликовать» в 16b удалён с доводом (кнопки и
   `PATCH {isPublic}` нет с 8.6/8.7 — предмет исчез), публикация —
   `UPDATE … visibility='full'`. Найдено сверх текста: (а) харнессы
   хардкодили `/opt/google/chrome/chrome` — все девять (15, 16b, 17, 23,
   32, 41, 52, 62, 71) переведены на Chrome 131 из `~/.cache/puppeteer`
   (`CHROME_PATH` первее); (б) клиент с 11.3 открывается на языке браузера
   (en-US) — каждой странице CDP `Network.setUserAgentOverride
   {acceptLanguage: "ru-RU,ru"}` (`ruPage`); (в) test-17: проверка квирка
   Д-10 перевёрнута под исправленный `typeColor` (12.2), подсказка в
   `.gm-hint` — uppercase CSS (12.4, Д-22; сравнение без регистра), tap-select
   в R9 перенесён ДО пинча/орбиты, охота за узлом 3D получила вторую, плотную
   сетку (шаг 4 % холста) — после жестов узлы уходили с крупной; (г) test-52:
   после правки у раздела появляется `.section-actions` (12.4, Д-15) — тело
   раздела ищется как `div:not([class])`; чужой на 'full' ВИДИТ режимы для
   чтения (8.6 `modesReadOnly`) — проверка разделена; (д) test-15 без явного
   `process.exit(0)` висел на открытых дескрипторах; (е) test-55 (не в
   списке Д-25, но из «последующих запросов») — тот же `isPublic` →
   `visibility` и тот же Chrome. Итог: 16b 62 ✓, 17 84 ✓, 52 75 ✓, 15 40 ✓,
   55 60 ✓.
3. **Д-26/Д-27.** Моки 15/23/32/41 — каркас `doc-section`/`section-num`/
   `section-title`/`doc-content`, подразделы `<div data-section><h4>`,
   порядок узнавания по 09 §4 (10.1): «Таблица рекомендаций» → критика
   первой, маркеры таблиц перед `/критическ/i`, резюме по «Точки
   напряжения». Общего модуля моков нет (по тексту). 23 60 ✓, 32 52 ✓,
   41 77 ✓.
4. **Д-28.** Шесть блоков-указателей заведены этим патчем (C); правило §10
   — «По факту» пишется всегда.
5. **Д-33.** (а) `scripts/i18n/i18n-data.mjs` — `scanDataValues`: опись
   файлов-данных против таблицы (present/missing/mismatch/excluded; ключ —
   `names.json` своего ns → common → строка с тем же `ru`; подстановки описи
   приводятся к именам `params`); `i18n:check` перечисляет, `--strict`
   красит; на HEAD — 413 значений со строкой, 0 без, 0 расхождений (сторож
   на HEAD ничего не находит — доказан мутацией: новый тип «Мереологическая»
   в `seed-taxonomy` → красный со значением). (б) `i18n:export --data`
   заводит недостающие строки (`data: true`, `where`, переводы null) и
   обновляет `ru` разошедшихся; без `--data` — только перечисляет; значение
   без имени — «дополнить names.json». (в) `i18n:add-lang <xx> [--locale]
   [--dry]`: правит литералы `LANGS`/`LANG_LOCALE` в `i18n-core.mjs`,
   `meta.languages` и колонку `xx: null` каждой строке (порядок полей записи
   — из `meta.languages`: `writeTable` → `fieldOrder(langs)`), `i18n:split`;
   печатает ручной остаток (locales.ts, UI_LOCALE_NAMES, черновик,
   NEXT-CONTEXT). Проверен на копии (fr): идемпотентен, `generated/fr.json`
   пустой, `--strict` красный «нет перевода fr» у каждого ключа — по
   замыслу 11.4. Сторожа: 4aw — `UI_LOCALES` (ru первым, en/de обязательны,
   без повторов) ≡ `LANGS` ≡ `meta.languages`, `LANG_LOCALE` покрывает
   каждый язык кодом Intl, колонка у каждой строки, каталог каждого языка с
   `locale`; 4ax — самоназвание у каждого языка; 4ay — каталоги по
   `UI_LOCALES`, значения файлов-данных без строки/разошедшиеся, `export
   --data`, `check --strict`, npm-скрипт. Тесты 112/113/114 — языки из
   `UI_LOCALES` (113: regex чанков каталога и счёт запросов по списку;
   114: каталог/колонка/`from` каждого языка; утверждённость en/de — отдельной
   проверкой). Шаблон L и README — правки D и `scripts/i18n/README.md`.
6. **Д-38.** smoke-112: «строки data и obsolete не попадают» перевёрнута под
   11.4 (data ВХОДЯТ, obsolete нет); «черновики попадают» требовала
   черновика en в таблице — с 2026-09-29 черновиков нет, предмет исчез:
   заменена проверкой `splitCatalog` на синтетической строке с `draft`
   (круг на копии держит smoke-114 п.5). 88 ✓. smoke-85: файл ТОЛЬКО из
   `SMOKE85_FILE`/`T85_FILE`, род файла различается до проверок
   (`synthesisId`/UUID → экспорт службы → блок пропущен с причиной);
   `isPublic` → `visibility`. Приложенный файл концепции оказался СЫРЫМ
   одностраничником (0 UUID): без файла 32 ✓, с ним 44 ✓.
7. **Д-39.** `extract-export-assets.mjs` и `extract-section-templates.mjs`
   — ROOT на два уровня вверх, `extract-by-name.py` из `scripts/extract/`;
   оба отработали со своего места, генераты ПОБАЙТНО прежние (`git status`
   пуст). `smoke-export-assets` гоняет сам генератор (расхождение — красный
   и возврат файла); 14 ✓. Сторож 4bd-а.
8. **Д-40 (продукт).** `server/config/thesis-layout-templates.ts` —
   надстройка над генератом: `section.theses.shared` += «РАСКЛАДКА БЛОКА
   ТЕЗИСА» (`<h5>Тезис {метка} (…)</h5>`, абзац одной жирной формулировки,
   `<p><strong>Обоснование.</strong> …</p>`; метка = первой ячейке «№»
   сводной таблицы, формулировка ДОСЛОВНО табличной; слова и метки —
   машинные ключи при любом языке). `applyThesisLayoutOverrides` в
   `seed-prompts` поверх 10.1, `stripThesisLayoutAddendum` в smoke-12
   (отступление ровно одно, в конце shared-блока) — 152 ✓ (146 + 6).
   `seed:prompts` прогнан (`section.theses.shared` v2). Сторож 4bd-б
   (генерат без надстройки, активный шаблон с ней, `JUSTIFICATION_LEAD_RE`
   разбора узнаёт «Обоснование.» надстройки). Исходник и генераты не
   тронуты.
9. **Д-43 (продукт).** `locateDocTable` отдаёт ячейки `tbody` (`rows`);
   `renderThesesTable({ headers, priorRows })` у строки с той же меткой
   (первая ячейка) хранит прежний текст «Тип», если `mapThesisType(прежний)`
   равен типу БД (столбец ищется по заголовку «Тип…», иначе третий);
   `mapThesisType` экспортирован из `element-parser`. На файле концепции
   (26 тезисов): «Онтологический» / «Эпистемологический» / «Этический /
   аксиологический» — ни одна ячейка не меняется перерисовкой; смена типа в
   БД — каноническая метка. smoke-125 A, сторож 4bd-в.
10. **Д-45.** smoke-61 (счёт 0 у плана без платных шагов — 10.2; пути
    hono по уникальным записям — `GET /plans` с `optionalAuth` 8.6 даёт
    две; `billingCheck` плана — условный, из обработчика 10.2) 54 ✓;
    smoke-62 (имена `getTemplateVersions`/`getConfigVersionsFull` — 8.4)
    84 ✓; smoke-71 (второй шаг кнопок 12.4 у типов и аккаунта, `tl()` в
    тексте ошибки импорта 11.2, `deleteAccount(id, { ip })` и 409 с
    `LAST_ADMIN`) 68 ✓; smoke-102 (употребления ключа критики — все чтения,
    без счёта «ровно 2») 34 ✓; test-22 R5(b) ждёт значения `version_sub`
    (до 10 с) — 53 ✓; test-112 (гость de — немецкое, заголовок
    `INTEGRATION OK` с растущими сериями, литералов с ключом 0); test-113
    (слоган de, заголовок блока замечаний 12.4 «Замечания к последней
    генерации (N замечаний)» / «Notes on the last generation (N notes)»);
    test-101 (R2 сбрасывает и `section.theses.shared` — после Д-40 seed
    обновляет ДВА шаблона; обёртка нового подраздела без якорей оглавления
    — с 12.2 (Д-29) они только в выгрузке); test-102 101 ✓ на приложенном
    файле; test-103 — CDP `acceptLanguage` в `pageAs` (каждый контекст),
    находка 10.3 «метки сводной таблицы — целые» ЗАКРЫТА 12.1 (Д-1):
    проверки перевёрнуты (метки буквенные, рекомендация к «Э-3» в раунде 2
    годна, негодных одна), блок CSS 10.3 кончается следующим заголовком
    беседы (после него — 11.3, 12.4); test-62/71 — второй шаг кнопок
    (`api-key-delete-confirm`, `catalog-relationship-delete-confirm-*`,
    `delete-account-btn` дважды: первый сабмит взводит), текст кнопок
    uppercase CSS — сравнение без регистра; test-71 после удаления — «/».
    Файл концепции 10.1–10.2 («Рекомендация 1:», без таблицы) — тот, что
    приложен к беседе: smoke-101 живая часть 92 ✓, test-101/102 на нём
    зелёные; «файл-образец рядом» в репозиторий не кладётся (1,1 МБ,
    концепция пользователя) — харнессы берут его из `T101_FILE`/
    `T102_FILE`/`T103_FILE`.
11. **Регресс ×2 на свежем дереве** (копия рабочего дерева без
    `node_modules`/`dist`/`.git` + свой `npm install` и `npm i --no-save
    puppeteer-core@23`; порт :3000 общий — очередью, один фоновый вызов).
    Зелёные ×2: smoke-55 57, test-55 106, 16b 62, 17 84, 52 75, 15 40, 23 60,
    32 52, 41 77, smoke-12 152, smoke-export-assets 14, smoke-85 44 (с
    файлом), smoke-112 88, smoke-114 48, smoke-125 35 (с файлом), smoke-122 94,
    smoke-121 92, smoke-101 92, smoke-61 54, smoke-62 84, smoke-71 68,
    smoke-102 34, test-121 65, test-122 101, test-62 101, test-71 105,
    test-101 106, test-102 101, test-103 115, test-113 64, test-124 120;
    test-22 ×7 — 53 ✓ без единого красного (гонка R5(b) снята). Два
    артефакта среды, не кода: test-124 #1 — `abort-btn` не дождался 30 с на
    холодном первом прогоне дерева (R3 (а); #2 и три прогона в клоне — 120 ✓);
    test-112 в копии дерева красный на `git worktree HEAD` (копия — не
    git-репозиторий; в клоне 69 ✓ ×2). В дереве: `check:integration`
    INTEGRATION OK (2as/4bd/5an), `check:dotfiles`, `i18n:check --strict`,
    `i18n:split --check`, `typecheck` 0 — зелёные.
12. **Д-49 (продукт).** `html-exporter`: `parentContextSchema:
    row.parentContextSchema` (константа `PARENT_CONTEXT_SCHEMA_ID` из
    состояния ушла; версия схемы — константа). Импорт 4.3 читал поле из
    состояния и прежде (`str(embeddedState?.parentContextSchema)`, fallback
    monolithic). smoke-125 E на живой БД: monolithic и selective-v1 после
    круга экспорт → импорт прежние. smoke-122 94 ✓. Сторож 4bd-г.
13. **Д-50 (продукт).** Replay (`ws/handler`, status='paused'):
    `skipDegrades: ps.skipDegrades ?? []`, `sectionKeys: ps.sectionKeys`,
    `replay: true`; живые `generation_paused` (generation-service ×2,
    pause-resume-service) += `sectionKeys` — клиент больше не угадывает
    текущий раздел. Клиент: `StreamingPause.replay`; по признаку раздел не
    красится, модалка не открывается (снапшот не навязывает — 1.6b),
    `pausedState` — снапшот GET /:id (полнее: `completedPasses`,
    `maxTokensUsed`, `genParams`); обход `samePause` снят, сторож 4bc-о
    перевёрнут. Найдено на test-62 R9: при заходе на страницу, пока
    генерация ещё шла, GET /:id читался ДО обрыва, replay приходил после —
    без обхода ни бейджа, ни модалки; теперь повтор при снапшоте не в
    паузе перечитывает снапшот (`replayKey` → `load(id)`). 03 §3.1,
    `shared/types/ws-messages`, сторож 4bd-д.
14. **Оснастка беседы.** `tests/smoke-125-request1.mjs` (A Д-43, B Д-40,
    C Д-33, D Д-39 — чистые; E Д-49 — живая БД) 32 ✓ (с `T125_FILE` — 35); `check:integration`
    += 2as/4bd/5an (5an: активный шаблон Д-40, круг экспорт → импорт Д-49);
    typecheck 0. Контекст беседы сжимался один раз (между п.5 и п.6) — доки
    и код перечитывались. Harness-очередь: один фоновый вызов на серию
    харнессов (порт :3000 общий), опросы ≤ 95 с.
15. **Дыры доков, закрытые попутно.** `scripts/i18n/README.md` —
    «Значения файлов-данных», «Новый язык», команды `export --data` и
    `add-lang`, таблица «колонка на каждый язык `meta.languages`»;
    `tests/smoke-export-assets.mjs` — шапка про копию генератора снята.

"""
patch(
    P07,
    "**Завершение беседы:**\n- «Проверь интеграцию: `check:integration`, `check:dotfiles`, `i18n:check --strict` на свежем клоне зелёные»\n- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10); если реестр пуст — Фаза 12 закрыта, строка в README\n\n---\n",
    "**Завершение беседы:**\n- «Проверь интеграцию: `check:integration`, `check:dotfiles`, `i18n:check --strict` на свежем клоне зелёные»\n- Закрытые строки §12 — в 08 Часть IV с датой и итогом (07 §10); если реестр пуст — Фаза 12 закрыта, строка в README\n\n"
    + FACT_125
    + "---\n",
    "A 07: «По факту 12.5 (первый запрос)»",
    marker="**По факту 12.5 (первый запрос",
)


# ── B. 07 §12 — состояние строк 12.5 ─────────────────────────────────────
def row_patch(debt: str, new_cell: str) -> None:
    """Заменить последнюю ячейку («состояние») строки `| Д-N |` в §12."""
    global applied, skipped, failed
    label = f"B1 07 §12: состояние строки {debt}"
    path, text = _load(P07, label)
    if path is None:
        return
    lines = text.split("\n")
    idx = [i for i, l in enumerate(lines) if l.startswith(f"| {debt} |")]
    if not idx and CLOSE_MARK_125 in text:
        skipped += 1  # строка снята закрытием беседы (часть II)
        print(f"  skip  {label}")
        return
    if len(idx) != 1:
        failed += 1
        print(f"  fail  {label}: строк {len(idx)}")
        return
    line = lines[idx[0]]
    if new_cell in line or _superseded("B1 07 §12: состояние строк 12.5", text):
        skipped += 1
        print(f"  skip  {label}")
        return
    cells = line.split(" | ")
    if not cells[-1].startswith("открыт"):
        failed += 1
        print(f"  fail  {label}: последняя ячейка «{cells[-1]}»")
        return
    cells[-1] = new_cell + " |"
    lines[idx[0]] = " | ".join(cells)
    path.write_text("\n".join(lines), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


STATE = "сделан первым запросом 12.5 (2026-10-12); закрытие — при завершении беседы"
for debt in ["Д-24", "Д-25", "Д-26", "Д-27", "Д-28", "Д-33", "Д-38", "Д-39", "Д-40", "Д-43", "Д-45", "Д-49", "Д-50"]:
    row_patch(debt, STATE)

patch(
    P07,
    "   Д-14, Д-15, Д-17, Д-19, Д-22, Д-34, Д-35, Д-41, Д-42, Д-44, Д-48; Д-45\n   пополнен; строк «не назначен» нет.\n",
    "   Д-14, Д-15, Д-17, Д-19, Д-22, Д-34, Д-35, Д-41, Д-42, Д-44, Д-48; Д-45\n   пополнен; строк «не назначен» нет.\n"
    "   Первым запросом 12.5 (2026-10-12) все тринадцать строк с адресатом\n"
    "   12.5 сделаны (Д-24…Д-28, Д-33, Д-38, Д-39, Д-40, Д-43, Д-45, Д-49,\n"
    "   Д-50) — закрытие при завершении беседы; новых строк не заведено.\n",
    "B2 07 §12: преамбула — первый запрос 12.5",
)

# ── C. 07 — Д-28: блоки-указатели и правило §10 ──────────────────────────
POINTER_02 = """**По факту 0.2 (блок-указатель; заведён 12.5, Д-28).** Итоги и отступления
— `docs/08-history.md`, глава «Беседа 0.2 — итоги и контекст для следующих
бесед». Текст запроса опровергнут в одном: WS-операции (`subscribe_generation`,
`start_regen`, …) распознаны по union `WsClientMessage`, но исполнение —
заглушки до 1.4+; сессии — Lucia-модель в cookie (SHA-256 токена в
`sessions.id`, TTL 30 дн., скользящее продление), bcryptjs; rate-limiter —
fail-open при недоступном Redis.

"""
POINTER_03B = """**По факту 0.3b (блок-указатель; заведён 12.5, Д-28).** Итоги —
`docs/08-history.md`, «Итоги беседы 0.3b (seed-taxonomy / element-taxonomy)».
Текст запроса опровергнут: сид каталогов идемпотентен БЕЗ версионирования
(`key UNIQUE`: created / updated-на-месте только системных / skip,
пользовательские записи не трогаются); `routes/taxonomy.ts` беседой не
создан — дыра карты 04, закрыта позже (5.4/7.1).

"""
POINTER_06 = """**По факту 0.6 (блок-указатель; заведён 12.5, Д-28).** Итоги —
`docs/08-history.md`, «Беседа 0.6 — итоги и контекст для следующих бесед».
Отступление одно: смена пароля в живой сессии — `skipUnauthorizedHandler`
у запроса (иначе 401 на неверный старый пароль разлогинивал вместо ошибки
поля); остальное — по тексту.

"""
POINTER_23 = """**По факту 2.3 (блок-указатель; заведён 12.5, Д-28).** Итоги —
`docs/08-history.md`, «Беседа 2.3 — Edit Modal + Cascade Panel (клиент)
[ЗАКРЫТА]». Текст запроса опровергнут в двух местах: превью-транспорт
(`POST /syntheses/:id/plans/impact`, `POST …/subsection-impact`,
`PATCH /syntheses/:id` += extGraphMetrics) — одобренное отступление «сервер в
клиентской беседе» (как viewOnly в 1.6), выбран вместо черновик-плана на
каждый клик; цепочка `confirm()` исходника заменена «Составить план» →
просмотр → «Исполнить». Реализация шла после сжатия контекста — сверена по
стенограмме.

"""
POINTER_24 = """**По факту 2.4 (блок-указатель; заведён 12.5, Д-28).** Итоги —
`docs/08-history.md`, «Беседа 2.4 — Лог контекста и генерации [ЗАКРЫТА]»
(в тексте беседы выше — только «Итоги тестов»). Отступления:
`reconstructSkeleton` НЕ реализован — записи без `metadata.promptSkeleton`
помечаются «промпт недоступен (импортированная запись)» (TODO → 4.2);
`rawBaseBudget` восстановлен из `context_budget[depth]` × 1.5 для критики
(fail-open); источники `subsection_regen` / `cascade` / `mode_cascade` —
адаптация к схеме.

"""
POINTER_31 = """**По факту 3.1 (блок-указатель; заведён 12.5, Д-28).** Итоги —
`docs/08-history.md`, «Беседа 3.1 — Meta-Synthesis + Lineage (бэкенд)
[ЗАКРЫТА]». Адаптации против исходника: `collectPhilosopherAncestors` —
рекурсивный CTE вместо обхода объекта genealogy; `validateConceptForMetaSynthesis`
отдаёт warnings вместо `confirm`; `conceptContextBlockFull` хранит КВИРК
исходника (без portraits и graphEdges); доступ сервис не проверяет — слой
роутов. `POST /syntheses/import` живёт в `routes/import.ts` (4.3), не в
`routes/syntheses.ts` — уточнение 8.5.

"""
END_02 = "- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»\n\n---\n\n### Беседа 0.3: Seed-скрипты + Prompt Registry"
patch(
    P07,
    END_02,
    END_02.replace("\n\n---\n\n### Беседа 0.3:", "\n\n" + POINTER_02 + "---\n\n### Беседа 0.3:"),
    "C1 07: блок-указатель «По факту 0.2»",
    marker="**По факту 0.2 (блок-указатель",
)


def pointer_before_next(next_heading: str, block: str, label: str, marker: str) -> None:
    """Вставить блок перед разделителем `---`, за которым идёт заголовок следующей беседы."""
    global applied, skipped, failed
    path, text = _load(P07, label)
    if path is None:
        return
    if marker in text:
        skipped += 1
        print(f"  skip  {label}")
        return
    anchor = "\n---\n\n" + next_heading
    if text.count(anchor) != 1:
        failed += 1
        print(f"  fail  {label}: якорь встречается {text.count(anchor)} раз")
        return
    path.write_text(text.replace(anchor, "\n" + block + "---\n\n" + next_heading), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


pointer_before_next("### Беседа 0.4:", POINTER_03B, "C2 07: блок-указатель «По факту 0.3b»", "**По факту 0.3b (блок-указатель")
pointer_before_next("## 3. Протокол Фазы 1: MVP", POINTER_06, "C3 07: блок-указатель «По факту 0.6»", "**По факту 0.6 (блок-указатель")
pointer_before_next("### Беседа 2.4:", POINTER_23, "C4 07: блок-указатель «По факту 2.3»", "**По факту 2.3 (блок-указатель")
pointer_before_next("## 5. Протокол Фазы 3: Мета-синтез и наследование", POINTER_24, "C5 07: блок-указатель «По факту 2.4»", "**По факту 2.4 (блок-указатель")
pointer_before_next("### Беседа 3.2:", POINTER_31, "C6 07: блок-указатель «По факту 3.1»", "**По факту 3.1 (блок-указатель")

patch(
    P07,
    "> `docs/09-lessons.md`; блок «По факту N» остаётся здесь, рядом с\n> текстом запроса, который он опровергает.\n",
    "> `docs/09-lessons.md`; блок «По факту N» остаётся здесь, рядом с\n> текстом запроса, который он опровергает.\n"
    ">\n"
    "> **Добавлено 2026-10-12 (12.5, Д-28):** беседа, закрываясь, пишет блок\n"
    "> «По факту N» ВСЕГДА — хотя бы строкой «отступлений нет; итоги — глава\n"
    "> 08». Комплекты и NEXT-CONTEXT ссылаются только на существующие блоки;\n"
    "> у бесед, закрытых до правила (0.2, 0.3b, 0.6, 2.3, 2.4, 3.1), стоят\n"
    "> блоки-указатели на главы 08.\n",
    "C7 07 §10: правило «По факту» всегда",
)

# ── D. 07 — шаблон «Типовая беседа L» ─────────────────────────────────────
patch(
    P07,
    "> закрыт Д-33 (12.5), пункты 1 и 5 первого запроса сводятся к `npm run\n> i18n:add-lang xx` — тогда беседа короче, но список проверок тот же.\n",
    "> закрыт Д-33 (12.5, 2026-10-12): пункт 1 первого запроса — одна команда\n> `npm run i18n:add-lang -- xx`, пункт 4 — сторожа и тесты языки берут из\n> `UI_LOCALES` и не правятся, пункт 5 — только NEXT-CONTEXT; список\n> проверок тот же.\n",
    "D1 07 шаблон L: преамбула",
)
patch(
    P07,
    "  - `server/integration-check.mts` — секции 4aw, 4ax, 4ay (места, где en и de названы поимённо)\n  - `tests/smoke-112-request1.mjs`, `smoke-113-request1.mjs`, `smoke-114-request1.mjs`, `test-113-requests2-8.mjs`, `test-114-requests2-5.mjs` (места, где языки перечислены)\n",
    "  - `server/integration-check.mts` — секции 4aw, 4ax, 4ay (с 12.5 языки берут из `UI_LOCALES`; читать, чтобы знать, что проверяется)\n  - `tests/smoke-112-request1.mjs`, `smoke-114-request1.mjs`, `test-113-requests2-8.mjs` (с 12.5 языки из `UI_LOCALES`), `smoke-113-request1.mjs`, `test-114-requests2-5.mjs`\n  - `scripts/i18n/i18n-add-lang.mjs`, `i18n-data.mjs` (12.5)\n",
    "D2 07 шаблон L: контекст",
)
patch(
    P07,
    "1. Таблица и инструменты: `LANGS` и `LANG_LOCALE` в scripts/i18n/i18n-core.mjs\n   += ⟨xx⟩; strings.json — `meta.languages` += ⟨xx⟩ и колонка ⟨xx⟩: null у\n   каждой живой строки (скриптом, не рукой); `i18n:split` кладёт\n   generated/⟨xx⟩.json. Формы плюралов ⟨xx⟩ — по Intl.PluralRules\n   (pluralFormProblems сам знает категории языка; проверить на строках с\n   {n, plural, …}).\n",
    "1. Таблица и инструменты: `npm run i18n:add-lang -- ⟨xx⟩` (иной код Intl —\n   `--locale`): `LANGS`/`LANG_LOCALE` в scripts/i18n/i18n-core.mjs, `meta.languages`\n   и колонка ⟨xx⟩: null у каждой строки strings.json, `i18n:split` →\n   generated/⟨xx⟩.json — всё одной командой, рукой ничего. Команда печатает\n   формы плюрала ⟨xx⟩ (Intl.PluralRules) и ручной остаток (пункты 2–3).\n",
    "D3 07 шаблон L: п.1",
)
patch(
    P07,
    "4. Сторожа и тесты: секции 4aw/4ax/4ay integration-check, где en и de\n   названы поимённо, — расширить на ⟨xx⟩ (каталог ⟨xx⟩ ≡ нарезке, каждый\n   живой ключ в каталоге, data-строки в каталоге, tData на каталоге ⟨xx⟩\n   для «Диалектический» и «Онтологическая»); новая секция не нужна —\n   правится список языков. Смоуки 112/113/114 и харнессы 113/114 — списки\n   языков += ⟨xx⟩ (переключатель, cookie, PATCH, каталог по требованию,\n   один запрос чанка на язык). Не ослаблять.\n5. Доки: 03 §2.1, 05 (generated/⟨xx⟩.json), scripts/i18n/README.md\n   (список языков, счёт черновиков), NEXT-CONTEXT (состояние языков).\n",
    "4. Сторожа и тесты: секции 4aw/4ax/4ay integration-check и тесты\n   112/113/114 берут языки из `UI_LOCALES` (12.5, Д-33) — после пункта 2\n   они проверяют ⟨xx⟩ сами (каталог ⟨xx⟩ ≡ нарезке, каждый живой ключ и\n   data-строки в каталоге, колонка у каждой строки, один запрос чанка на\n   язык). Прогнать; если какой-то пришлось править руками — дыра, в\n   «По факту» и строку §12. Добавить ⟨xx⟩ в проверку tData на\n   «Диалектический»/«Онтологическая» (smoke-114 п.3) — единственное\n   место с текстами перевода. Не ослаблять.\n5. Доки: NEXT-CONTEXT (состояние языков). 03 §2.1, 05 и README языки по\n   имени не перечисляют (ссылка на `UI_LOCALES`/`meta.languages`) — править\n   нечего; счёт черновиков в README — при утверждении владельцем.\n",
    "D4 07 шаблон L: пп.4–5",
)
patch(
    P07,
    "- «Реестр §12: после Д-33 (12.5) сторожа 4aw/4ax/4ay и тесты 112–114 берут языки из `UI_LOCALES`; если какой-то из них всё же пришлось править руками — строка §12 с адресатом: вывести из `UI_LOCALES`»\n",
    "- «Реестр §12: сторожа 4aw/4ax/4ay и тесты 112–114 берут языки из `UI_LOCALES` (12.5, Д-33); если какой-то из них всё же пришлось править руками — строка §12 с адресатом: вывести из `UI_LOCALES`»\n",
    "D5 07 шаблон L: завершение",
)

# ── E. 03 §3.1 — generation_paused += sectionKeys, replay ────────────────
patch(
    P03,
    "  skipDegrades?: string[],   // kind='gen': разделы, теряющие контекст\n                             // пропускаемых при skip (confirm [25686], 2.2)\n  estimates: { fillMissingSubs?: number, wholeSection?: number,\n               skipRemaining?: number } }  // серверный аналог _computeGenPauseEstimates\n",
    "  skipDegrades?: string[],   // kind='gen': разделы, теряющие контекст\n                             // пропускаемых при skip (confirm [25686], 2.2)\n  sectionKeys?: string[],    // kind='gen' (12.5, Д-50): разделы прерванного\n                             // прохода (pausedState.sectionKeys)\n  replay?: true,             // 12.5 (Д-50): повтор паузы при подписке\n                             // (status='paused'), не живая пауза: клиент\n                             // модалку не открывает, pausedState берёт из\n                             // GET /syntheses/:id; живые сообщения поля не несут\n  estimates: { fillMissingSubs?: number, wholeSection?: number,\n               skipRemaining?: number } }  // серверный аналог _computeGenPauseEstimates\n",
    "E 03 §3.1: generation_paused += sectionKeys, replay",
)

# ── F. 04 §4 — строка 12.5 ────────────────────────────────────────────────
ROW_125 = "| `server/config/thesis-layout-templates.ts`; `scanDataValues` (scripts/i18n/i18n-data), `i18n-add-lang`; `priorRows` у `renderThesesTable`, `rows` у `locateDocTable`, экспорт `mapThesisType`; `replay`/`sectionKeys` у `generation_paused` | НОВОЕ/ДОПОЛНЕНО (12.5, оснастка + четыре исключения): надстройка раскладки блока тезиса над генератом section-templates (Д-40; сид накладывает, smoke-12 снимает); сканер значений файлов-данных против таблицы переводов и команда нового языка (Д-33; сторожа и тесты языки берут из `UI_LOCALES`); перерисовка сводной таблицы тезисов бережёт прежний текст «Тип» (Д-43); встроенное состояние выгрузки пишет колонку `parent_context_schema` (Д-49); replay паузы помечен и полон (Д-50). Генераты и исходник не тронуты |\n"
patch(
    P04,
    "| `client/src/hooks/useSecondStep.ts`, `client/src/components/edit/SectionHistory.tsx`; `findThesisByLabel`/`thesisLabelOf` (SynthesisPage)",
    ROW_125 + "| `client/src/hooks/useSecondStep.ts`, `client/src/components/edit/SectionHistory.tsx`; `findThesisByLabel`/`thesisLabelOf` (SynthesisPage)",
    "F 04 §4: строка 12.5",
    marker="thesis-layout-templates.ts`; `scanDataValues`",
)

# ── G. 05 — новые файлы ───────────────────────────────────────────────────
patch(
    P05,
    "│   │   ├── i18n-split.mjs              # 11.2: нарезка каталогов generated/<lang>.json (--check)\n",
    "│   │   ├── i18n-split.mjs              # 11.2: нарезка каталогов generated/<lang>.json (--check)\n"
    "│   │   ├── i18n-data.mjs               # 12.5 (Д-33): значения файлов-данных против таблицы\n"
    "│   │   │                               # (scanDataValues: present/missing/mismatch; check --strict красит,\n"
    "│   │   │                               # export --data заводит строки data)\n"
    "│   │   ├── i18n-add-lang.mjs           # 12.5 (Д-33): новый язык одной командой (LANGS/LANG_LOCALE,\n"
    "│   │   │                               # meta.languages + колонка, split; печатает ручной остаток)\n",
    "G1 05: i18n-data, i18n-add-lang",
)
patch(
    P05,
    "│   │   └── lang-templates.ts          # 11.1: НАДСТРОЙКА над генератом prompt-templates —\n",
    "│   │   ├── thesis-layout-templates.ts # 12.5 (Д-40): НАДСТРОЙКА над генератом section-templates —\n"
    "│   │   │                              # section.theses.shared += раскладка блока тезиса (<h5> с\n"
    "│   │   │                              # меткой = первой ячейке, абзац жирной формулировки = таблице,\n"
    "│   │   │                              # «Обоснование.»); сид накладывает, smoke-12 снимает, 4bd сверяет\n"
    "│   │   └── lang-templates.ts          # 11.1: НАДСТРОЙКА над генератом prompt-templates —\n",
    "G2 05: thesis-layout-templates",
)
patch(
    P05,
    "    │                                   # smoke-124-request1 — 12.4: чистые функции клиента (тезис по метке,\n",
    "    │                                   # smoke-125-request1 — 12.5: Д-43 (столбец «Тип» при перерисовке,\n"
    "    │                                   # T125_FILE — живой документ), Д-40 (надстройка), Д-33 (сканер данных,\n"
    "    │                                   # add-lang --dry), Д-39 (ROOT), Д-49 (круг экспорт → импорт, живая БД)\n"
    "    │                                   # smoke-124-request1 — 12.4: чистые функции клиента (тезис по метке,\n",
    "G3 05: smoke-125",
)
patch(
    P05,
    "│   ├── extract/                        # извлечение из одностраничника\n",
    "│   ├── extract/                        # извлечение из одностраничника (12.5, Д-39: ROOT генераторов —\n│   │   │                               # два уровня вверх, extract-by-name.py — здесь же)\n",
    "G4 05: extract ROOT",
)
patch(
    P05,
    "│   ├── patches/                        # 50 идемпотентных патчей доков по итогам бесед\n",
    "│   ├── patches/                        # 51 идемпотентный патч доков по итогам бесед\n",
    "G5 05: счёт патчей",
)

# ── H. NEXT-CONTEXT — состояние после первого запроса ────────────────────
patch(
    PNC,
    "## Состояние на 2026-10-12 (Фаза 12 «Закрытие долгов»: 12.1–12.4 ЗАКРЫТЫ; ближайшая и последняя — 12.5)\n",
    "## Состояние на 2026-10-12 (Фаза 12 «Закрытие долгов»: 12.1–12.4 ЗАКРЫТЫ; 12.5 — первый запрос сделан, тестовые и закрытие впереди)\n\n"
    "**12.5 (харнессы, инструменты переводов, доки) — первый запрос сделан\n"
    "2026-10-12.** Все тринадцать строк §12 сделаны (закрытие — при завершении):\n"
    "харнессы 15/16b/17/23/32/41/52 на Chrome 131 с `acceptLanguage` ru;\n"
    "`i18n-data.mjs` + `i18n:export --data` + `i18n:add-lang` (сторожа 4aw/4ax/4ay\n"
    "и тесты 112–114 — языки из `UI_LOCALES`); блоки-указатели «По факту» 0.2,\n"
    "0.3b, 0.6, 2.3, 2.4, 3.1 и правило §10; генераторы со своего места; четыре\n"
    "исключения в продукте — `thesis-layout-templates.ts` (seed:prompts прогнан),\n"
    "`renderThesesTable` с `priorRows`, `parentContextSchema` колонкой,\n"
    "replay паузы с `replay: true`/`skipDegrades`/`sectionKeys` (обход `samePause`\n"
    "снят, 4bc-о перевёрнут). Новое: `tests/smoke-125-request1.mjs`, сторожа\n"
    "2as/4bd/5an. Миграций нет. Доки — `scripts/patches/patch-docs-conv125.py` (часть I).\n",
    "H NEXT-CONTEXT: состояние после первого запроса 12.5",
    marker="12.5 — первый запрос сделан",
)


# ══ ЧАСТЬ I-б — тестовые запросы 12.5 (2026-10-13): дописано после первого запроса ══
FACT_125_TESTS = """**По факту 12.5 (тестовые запросы — 2026-10-13).** Девять тестовых запросов
одним заходом; один харнесс и правки оснастки по найденному:

1. **smoke-55 57 ✓, test-55 106 ✓.** test-16b/17/52 ×2 зелёные (62/84/75), в
   выводе ни одного `isPublic`/`is_public` (grep по логам: 0).
2. **Мок узнаёт критику первой — проверено счётчиком маршрутов.** В 15/23/32/41
   `pickHtml` обёрнут счётчиком веток (`routeCounts`, образцы задания для
   запасных веток); итоговая проверка: ветка `/критическ/i` не срабатывала,
   у 32/41 `critique-table ≥ 1`. Счётчик НАШЁЛ дефект мока test-32: задание
   капсулы (§ 9) несёт корень «критическ», и мок отдавал капсуле КРИТИКУ —
   заведена ветка «Капсула» (как в test-41). Умолчание `sum` для разделов без
   своего мока (диалог, название, история) — допустимо, только счёт. Итог:
   15 41 ✓, 23 61 ✓, 32 53 ✓, 41 78 ✓.
3. **Блоки-указатели.** Скриптом: 45 блоков «По факту N» в 07, 170 ссылок
   «По факту N» в 01–09 и NEXT-CONTEXT — все находят блок.
4. **Д-33 — мутация и копия.** Новый тип «Мереологическая» в seed-taxonomy →
   `i18n:check --strict` красный с обоими значениями (имя и описание, «нет
   имени в names.json»); записи в names.json → `i18n:export --data` завёл
   `data.taxonomy.mereologicalName/Desc` (`data: true`, `where`, переводы
   null; `en` из names.json черновиком НЕ берётся — перевод только через
   import) → `--strict` красный уже «ключи без перевода: 4» (цикл
   переводчика). Всё возвращено, таблица побайтно = HEAD. Копия дерева со
   СВОИМ `npm install` (симлинк `node_modules` негоден: `@philosynth/shared`
   резолвился бы в исходное дерево): `i18n:add-lang fr` → `LANGS`, `meta`,
   колонка у 2320 строк, `generated/fr.json`; п.2 беседы L рукой (locales.ts,
   `UI_LOCALE_NAMES`); черновик fr = ru с формами one/many/other → `import
   --draft` 2320, `--strict` зелёный; smoke-112 88 ✓, smoke-114 50 ✓ (с fr),
   `check:integration` INTEGRATION OK — после ОДНОЙ правки: сторож 4aw и
   smoke-112/114 брали «fr» как ЧУЖОЙ язык (`localeFromAcceptLanguage("fr")
   === null`, `genLangForUi("fr") === "English"`, «остальные строки без
   draft») — заменено первым кодом не из `UI_LOCALES` / проверкой по `de`.
   Копия удалена.
5. **Д-38/Д-39.** smoke-112 88 ✓; smoke-85 44 ✓ с файлом (он — сырой
   одностраничник, экспортом службы не является: род различён, блок
   исполнен); `extract:sections` и `extract:export-assets` со своего места,
   `git status` по генератам пуст; smoke-export-assets 14 ✓ на самом
   генераторе.
6. **Д-40/Д-43 — `tests/test-125-requests2-9.mjs` R1/R2.** Активный
   `section.theses.shared` несёт раскладку, промпт тезисов у мока — ровно
   один раз; мок по новой раскладке → `theses.justification` непуст у трёх,
   `formulation` в БД = табличной = прозаической (`readThesisBlock` по
   метке), метки = первым ячейкам, типы из таблицы. На файле концепции
   (10 тезисов, ячейки «Онтологический / Эпистемологический / Этический /
   аксиологический»): PATCH обоснования — ни одна ячейка «Тип» не
   изменилась; PATCH `thesisType` — только своя строка (каноническая
   метка), прочие прежние. smoke-12 152 ✓.
7. **п.8.** smoke-61 54, smoke-62 84, smoke-71 68, smoke-102 34; test-112
   69 ✓ (внутри — check:integration с 2as/4bd/5an); test-22 ×5 — 53 ✓ без
   красного; test-101 106 / test-102 101 / test-103 115 на приложенном файле
   (test-103 — браузер en-US, ru через CDP в каждом контексте); test-62 ×2
   101 ✓, test-71 ×2 105 ✓ на втором шаге кнопок (Chrome 131).
8. **Д-49/Д-50 — test-125 R3/R4.** monolithic и selective-v1: `GET
   /export/html` → состояние несёт схему колонки → `POST /syntheses/import`
   → схема прежняя, генлог импорта без `schema_migration_marker`; smoke-122
   94 ✓. Пауза до подписки → сырое WS с `?resume=` (так подключается
   `useStreamingGeneration`; `subscribe_generation` в паузе стрим не
   запускает и повтора не шлёт — повтор живёт в `handleResume`, §3.3):
   `generation_paused` с `replay: true`, `skipDegrades` и `sectionKeys` ≡
   `pausedState`; страница в паузе: бейдж виден, модалка сама не открылась
   (3 с), бейдж → «Пропустить» → ровно один вопрос со списком зависимых →
   ready; test-124 120 ✓ (R2 — живая пауза и снапшот без обхода
   `samePause`). test-125 39 ✓.
9. **Среда.** Между первым и тестовыми запросами PG и Redis были остановлены
   (лимит вызова песочницы) — подняты заново; харнессы, упавшие на
   «сервер не поднялся», перепрогнаны.

"""
patch(
    P07,
    "    `tests/smoke-export-assets.mjs` — шапка про копию генератора снята.\n\n---\n",
    "    `tests/smoke-export-assets.mjs` — шапка про копию генератора снята.\n\n" + FACT_125_TESTS + "---\n",
    "A2 07: «По факту 12.5 (тестовые запросы)»",
    marker="**По факту 12.5 (тестовые запросы",
)
patch(
    P05,
    "    │                                   # smoke-125-request1 — 12.5: Д-43 (столбец «Тип» при перерисовке,\n",
    "    │                                   # test-125-requests2-9 — 12.5: четыре исключения живьём: Д-40 на моке\n"
    "    │                                   # (раскладка в промпте и разборе), Д-43 на файле концепции через PATCH,\n"
    "    │                                   # Д-49 круг GET /export/html → POST /import, Д-50 replay по WS (?resume=)\n"
    "    │                                   # и страница в паузе (бейдж, не модалка; один вопрос) — Chrome 131\n"
    "    │                                   # smoke-125-request1 — 12.5: Д-43 (столбец «Тип» при перерисовке,\n",
    "G6 05: test-125",
)


# ═══════════════════════════════════════════════════════════════════════
# ЧАСТЬ II — завершение беседы 12.5 (2026-10-13): закрытые строки §12 → 08
# Часть IV, хроника, уроки, README, NEXT-CONTEXT. Применённые правки
# частей I и I-б не редактируются (09 §2, 8.1).
# ═══════════════════════════════════════════════════════════════════════
P08 = "docs/08-history.md"
P09 = "docs/09-lessons.md"
PREADME = "README.md"
CLOSE_MARK = CLOSE_MARK_125


def drop_line(rel: str, prefix: str, label: str, gone_marker: str) -> None:
    """Снять ОДНУ строку, начинающуюся с prefix (строка реестра §12)."""
    global applied, skipped, failed
    path, text = _load(rel, label)
    if path is None:
        return
    lines = text.split("\n")
    hits = [i for i, l in enumerate(lines) if l.startswith(prefix)]
    if not hits:
        if gone_marker in text:
            skipped += 1
            print(f"  skip  {label}")
        else:
            failed += 1
            print(f"  fail  {label}: строки нет, но и следа закрытия ({gone_marker!r}) нет")
        return
    if len(hits) != 1:
        failed += 1
        print(f"  fail  {label}: строк с началом {prefix!r} — {len(hits)}")
        return
    del lines[hits[0]]
    path.write_text("\n".join(lines), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


# ── K. 07 ────────────────────────────────────────────────────────────────
FACT_125_CLOSE = """**По факту 12.5 (завершение — беседа закрыта 2026-10-13).** Фаза 12 закрыта:
реестр §12 пуст (остались только ограничения «Огр-N»).

1. **Закрыты тринадцать строк:** Д-24, Д-25, Д-26, Д-27, Д-28, Д-33, Д-38,
   Д-39, Д-40, Д-43, Д-45, Д-49, Д-50 — перенесены в 08 Часть IV с датой и
   итогом. Новых строк не заведено.
2. **Регресс на свежем клоне** (git clone локального репозитория на HEAD
   беседы, свой `npm install`): `check:integration` INTEGRATION OK
   (2as/4bd/5an), `check:dotfiles`, `i18n:check --strict`, `i18n:split
   --check`, `typecheck` — зелёные. Полный прогон харнессов ×2 — «По факту»
   первого запроса п.11 (свежее дерево) и тестовых запросов.
3. **Продукт правился ровно в четырёх названных местах** (Д-40, Д-43, Д-49,
   Д-50) плюс следствие Д-50 — перечитывание снапшота по повтору паузы
   (найдено харнессом test-62 R9). Генераты, исходник, таблица переводов —
   побайтно прежние; черновиков нет (en/de утверждены ранее, новых ключей
   `tl()` беседа не внесла).
4. **Оснастка беседы:** `tests/smoke-125-request1.mjs` (32 ✓; с файлом 35),
   `tests/test-125-requests2-9.mjs` (39 ✓), сторожа 2as/4bd/5an, патч
   `scripts/patches/patch-docs-conv125.py` (части I, I-б, II — идемпотентен,
   ×2 на копии).
5. **Уроки** — 09 §1 (п.4), §2 (п.4), §4 (беседа 12.5), §6, §7.
6. **Коммиты и push.** Хук окружения требовал коммита после каждого ответа —
   коммиты на `main` (`e15e2d9` первый запрос, `dae705d` тестовые,
   завершение — следующий); push из песочницы невозможен без допуска
   репозитория к сессии (403 прокси) — вливает пользователь.
7. **Ближайшая беседа** протоколом не назначена: Фаза 12 была последней
   заведённой. Открытые пути — типовая беседа L.1 (новый язык; после Д-33
   п.1 — одна команда) либо новая фаза по решению пользователя.

"""
patch(
    P07,
    "   «сервер не поднялся», перепрогнаны.\n\n---\n",
    "   «сервер не поднялся», перепрогнаны.\n\n" + FACT_125_CLOSE + "---\n",
    "K1 07: блок «По факту 12.5 (завершение)»",
    marker=CLOSE_MARK,
)
patch(
    P07,
    ">   (пп.12–13; обе правят сервер — то же исключение, назначение при\n>   закрытии 12.4 по вопросу пользователя), Д-45 пополнен (test-62,\n>   test-71).\n",
    ">   (пп.12–13; обе правят сервер — то же исключение, назначение при\n>   закрытии 12.4 по вопросу пользователя), Д-45 пополнен (test-62,\n>   test-71) — **ЗАКРЫТА 2026-10-13; Фаза 12 ЗАКРЫТА, реестр §12 пуст**\n>   (продукт правился в четырёх названных местах; найденное харнессами —\n>   перечитывание снапшота по повтору паузы — следствие Д-50).\n",
    "K2 07: врезка «Фаза 12» — 12.5 закрыта",
)
patch(
    P07,
    "→ 12.3 (ЗАКРЫТА 2026-10-06) → 12.4 (ЗАКРЫТА 2026-10-12) → 12.5 (разделена\n",
    "→ 12.3 (ЗАКРЫТА 2026-10-06) → 12.4 (ЗАКРЫТА 2026-10-12) → 12.5 (ЗАКРЫТА 2026-10-13; Фаза 12 закрыта; разделена\n",
    "K3 07 §11: 12.5 закрыта",
)
for n in ("24", "25", "26", "27", "28", "33", "38", "39", "40", "43", "45", "49", "50"):
    drop_line(P07, f"| Д-{n} | ", f"K4 07 §12: строка Д-{n} снята", CLOSE_MARK)
patch(
    P07,
    "   Первым запросом 12.5 (2026-10-12) все тринадцать строк с адресатом\n   12.5 сделаны (Д-24…Д-28, Д-33, Д-38, Д-39, Д-40, Д-43, Д-45, Д-49,\n   Д-50) — закрытие при завершении беседы; новых строк не заведено.\n",
    "   Первым запросом 12.5 (2026-10-12) все тринадцать строк с адресатом\n   12.5 сделаны (Д-24…Д-28, Д-33, Д-38, Д-39, Д-40, Д-43, Д-45, Д-49,\n   Д-50); при закрытии 12.5 (2026-10-13) сняты все тринадцать — реестр\n   «Д-N» ПУСТ, Фаза 12 закрыта; новая строка заводится следующей беседой\n   по правилам 1–5 с адресатом «не назначен».\n",
    "K5 07 §12: преамбула — реестр пуст",
)

# ── L. 08 ────────────────────────────────────────────────────────────────
patch(
    P08,
    "check:integration += 2ar/4bc; доки — patch-docs-conv124.py; ближайшая — 12.5.\n",
    "check:integration += 2ar/4bc; доки — patch-docs-conv124.py; ближайшая — 12.5.\n"
    "Беседа 12.5 (харнессы, инструменты переводов, доки) ЗАКРЫТА 2026-10-13 —\n"
    "**Фаза 12 закрыта, реестр §12 пуст.** Харнессы 15/16b/17/23/32/41/52/55 и\n"
    "смоуки 61/62/71/85/102/112 переведены на сегодняшний код (visibility, Chrome\n"
    "131 + Accept-Language ru по CDP, второй шаг кнопок, каркас doc-section в\n"
    "моках, счётчик маршрутов мока — нашёл капсулу, уходившую в критику); гонка\n"
    "test-22 снята (Д-24…Д-27, Д-38, Д-45). Д-33: сканер значений файлов-данных\n"
    "(`i18n-data.mjs`, `i18n:check --strict`, `i18n:export --data`) и\n"
    "`i18n:add-lang`; сторожа 4aw/4ax/4ay и тесты 112–114 берут языки из\n"
    "`UI_LOCALES` (проверено `add-lang fr` на копии — INTEGRATION OK без правки\n"
    "сторожей). Д-28: блоки-указатели «По факту» 0.2/0.3b/0.6/2.3/2.4/3.1 и\n"
    "правило §10. Д-39: генераторы со своего места. Продукт — четыре исключения:\n"
    "Д-40 надстройка раскладки блока тезиса над генератом (`thesis-layout-\n"
    "templates.ts`, seed накладывает, smoke-12 снимает), Д-43 `renderThesesTable`\n"
    "бережёт прежний текст «Тип», Д-49 встроенное состояние выгрузки пишет\n"
    "колонку `parent_context_schema`, Д-50 replay паузы с `replay: true`/\n"
    "`skipDegrades`/`sectionKeys` (обход `samePause` снят; страница перечитывает\n"
    "снапшот по повтору). Смоук 32 ✓ (35 с файлом), test-125 39 ✓, регресс ×2 на\n"
    "свежем дереве, check:integration += 2as/4bd/5an; доки —\n"
    "patch-docs-conv125.py; ближайшая — не назначена (L.1 или новая фаза).\n",
    "L1 08 Часть I: строка 12.5",
)
CHAPTER_125 = """### Беседа 12.5 — Харнессы, инструменты переводов, доки [ЗАКРЫТА 2026-10-13]

**Вход:** HEAD 97bc50c, `check:dotfiles` чист, `npm install` в самом клоне,
PG 16 и Redis в песочнице, файл концепции (оказался сырым одностраничником
10.1–10.2) и архив Chrome 131 приложены. Последняя беседа Фазы 12; продукт
правился ровно в четырёх названных местах (Д-40, Д-43, Д-49, Д-50).

**Сделано (первый запрос, тринадцать пунктов).** Д-24 — smoke-55 на
`startTransformRequest` и гейт 12.4; Д-25 — 16b/17/52/55 на `visibility`,
UI-блок «Опубликовать» удалён с доводом; все браузерные харнессы — Chrome 131
из кэша puppeteer и `Network.setUserAgentOverride {acceptLanguage: ru}`;
test-17 — плотная вторая сетка охоты за узлом 3D, tap до жестов; test-52 —
`.section-actions` 12.4 и `modesReadOnly` 8.6; test-15 — явный `exit(0)`.
Д-26/Д-27 — моки 15/23/32/41 с каркасом `doc-section` и порядком узнавания
«критика первой». Д-28 — шесть блоков-указателей и правило §10. Д-33 —
`scripts/i18n/i18n-data.mjs` (`scanDataValues`: present/missing/mismatch),
`i18n:check --strict` красит, `i18n:export --data` заводит строки `data`,
`i18n:add-lang <xx>` (LANGS/LANG_LOCALE, `meta.languages` + колонка,
split, ручной остаток); `writeTable` — порядок полей из `meta.languages`;
сторожа 4aw (`UI_LOCALES` ≡ `LANGS` ≡ `meta.languages`, `LANG_LOCALE`,
каталог каждого языка), 4ax (самоназвания), 4ay (каталоги по `UI_LOCALES`,
значения файлов-данных); тесты 112/113/114 — языки из `UI_LOCALES`; README
и шаблон L переписаны (п.1 — одна команда). Д-38 — smoke-112 под 11.4,
smoke-85 различает род файла. Д-39 — ROOT генераторов, smoke-export-assets
на самом генераторе. Д-40 — `server/config/thesis-layout-templates.ts`:
`section.theses.shared` += «РАСКЛАДКА БЛОКА ТЕЗИСА» (`<h5>Тезис {метка}`,
абзац жирной формулировки = таблице, «Обоснование.»), сид накладывает,
smoke-12 снимает (152 ✓). Д-43 — `locateDocTable.rows`, `renderThesesTable
({headers, priorRows})`: прежний текст «Тип» при том же типе в БД,
`mapThesisType` экспортирован. Д-45 — smoke-61/62/71/102, test-22 (ждёт
значения `version_sub`), test-112/113/101/102/103 (CDP ru, находка 10.3
закрыта Д-1), test-62/71 (второй шаг кнопок, uppercase CSS, «/»). Д-49 —
`parentContextSchema: row.parentContextSchema`. Д-50 — replay (`handleResume`)
с `skipDegrades`/`sectionKeys`/`replay: true`, живые паузы += `sectionKeys`;
клиент: `StreamingPause.replay`, модалка не открывается, раздел не красится,
`pausedState` — снапшот; обход `samePause` снят, сторож 4bc-о перевёрнут;
повтор при снапшоте без паузы перечитывает GET /:id (найдено test-62 R9).

**Тестовые запросы (2026-10-13).** Все девять за заход: счётчик маршрутов
мока в 15/23/32/41 (нашёл: капсула test-32 уходила в критику — ветка
заведена); блоки-указатели — 170 ссылок, все находят блок; Д-33 — мутация
seed-taxonomy → красный → `--data` → строки; `add-lang fr` на копии со своим
`npm install` → INTEGRATION OK после одной правки (сторож 4aw и smoke-112/114
считали «fr» чужим языком — теперь первый код не из `UI_LOCALES`);
`tests/test-125-requests2-9.mjs` (R1 Д-40 на моке, R2 Д-43 на файле через
PATCH, R3 Д-49 круг `GET /export/html` → `POST /import` без маркера
миграции, R4 Д-50 — WS с `?resume=`, бейдж вместо модалки, один вопрос) —
39 ✓; test-22 ×5, test-62/71 ×2, test-101/102/103/112/113/124, smoke-122.

**Отступления от контекста.** Файл-образец 10.1–10.2 в репозиторий не
положен (1,1 МБ, концепция пользователя) — харнессы берут `T101_FILE`/
`T125_FILE`. Копия дерева для `add-lang` требует СВОЕГО `npm install`
(симлинк `node_modules` резолвит `@philosynth/shared` в исходное дерево).
Хук окружения требовал коммита после каждого ответа — коммиты на `main`
без push (403 прокси).

**Находки.** Replay паузы живёт в `handleResume` (`?resume=`, §3.3), не в
`subscribe_generation`; GET /:id, прочитанный до обрыва, оставлял страницу без
бейджа. hono перечисляет маршрут по записи на каждый обработчик. Текст
кнопок в uppercase CSS ломает регистрозависимые проверки. Харнесс без
`process.exit(0)` висит на открытых дескрипторах. `pickHtml` без счётчика
маршрутов прячет неверную ветку (капсула → критика). Подробно — «По факту
12.5» в 07 (три блока).

**Тесты:** `tests/smoke-125-request1.mjs` 32 ✓ (35 с `T125_FILE`; A Д-43,
B Д-40, C Д-33, D Д-39, E Д-49 на живой БД); `tests/test-125-requests2-9.mjs`
39 ✓ (сервер :3000 + мок :3927 + preview :5225 + Chrome 131);
`check:integration` INTEGRATION OK на свежем клоне (2as/4bd/5an); регресс ×2
на свежем дереве — 34 харнесса и test-22 ×7 зелёные.

**Файлы беседы:** `scripts/i18n/{i18n-data,i18n-add-lang}.mjs`,
`server/config/thesis-layout-templates.ts`, `tests/{smoke-125-request1,
test-125-requests2-9}.mjs`, `scripts/patches/patch-docs-conv125.py` (новые);
`scripts/i18n/{i18n-core,i18n-check,i18n-export}.mjs`, `scripts/i18n/README.md`,
`scripts/extract/{extract-export-assets,extract-section-templates}.mjs`,
`scripts/seed/seed-prompts.ts`, `server/services/{element-parser,
element-renderer,generation-service,pause-resume-service}.ts`,
`server/services/export/html-exporter.ts`, `server/utils/html-parser.ts`,
`server/ws/handler.ts`, `server/integration-check.mts`,
`packages/shared/types/ws-messages.ts`, `client/src/hooks/useStreamingGeneration.ts`,
`client/src/pages/SynthesisPage.tsx`, `package.json`, тесты
smoke-12/55/61/62/71/85/102/112/114/export-assets и test-15/16b/17/22/23/32/41/
52/55/62/71/101/103/112/113.

**Контекст следующим беседам:** реестр §12 пуст; новый язык — шаблон L
(п.1 — `npm run i18n:add-lang -- xx`); «По факту 12.5» — три блока.

---

"""
patch(
    P08,
    "### Беседа 12.4 — Долги интерфейса (клиент) [ЗАКРЫТА 2026-10-12]\n",
    CHAPTER_125 + "### Беседа 12.4 — Долги интерфейса (клиент) [ЗАКРЫТА 2026-10-12]\n",
    "L2 08 Часть II: глава 12.5",
    marker="### Беседа 12.5 — Харнессы, инструменты переводов, доки [ЗАКРЫТА",
)
ROWS_IV = """| Д-24 — smoke-55 звал снятые 5.5/8.4 экспорты `transformsApi` | 12.5 | 8.4 | ЗАКРЫТ 12.5 (2026-10-12): `startTransformRequest(S1, kind)`, гейт `sectionActionsFor` 12.4; 57 ✓ |
| Д-25 — test-16b/17/52 на `is_public`/`isPublic` (8.6/8.7) | 12.5 | 8.6, 8.7 | ЗАКРЫТ 12.5 (2026-10-12): `visibility`, UI-блок «Опубликовать» удалён с доводом; Chrome 131 + CDP ru во всех браузерных харнессах; 62/84/75 ✓ |
| Д-26 — харнессы 15/23/32 не перепрогонялись после 10.1 | 12.5 | 10.1 | ЗАКРЫТ 12.5 (2026-10-12): моки с порядком «критика первой», счётчик маршрутов; 41/61/53 ✓ |
| Д-27 — моки 2.3/4.1 без каркаса `doc-section` | 12.5 | 10.1 | ЗАКРЫТ 12.5 (2026-10-12): `wrapSection`/`<div data-section><h4>` в 15/23/32/41; 78 ✓ (41) |
| Д-28 — блоков «По факту» 0.2, 0.3b, 0.6, 2.3, 2.4, 3.1 в 07 нет | 12.5 | 8.5–11.4 | ЗАКРЫТ 12.5 (2026-10-12): шесть блоков-указателей на главы 08 с отступлениями; правило §10 «„По факту“ всегда»; скрипт: 170 ссылок находят блок |
| Д-33 — новое значение данных не попадает в таблицу переводов | 12.5 | «По факту 11.4» п.15 | ЗАКРЫТ 12.5 (2026-10-12): `i18n-data.mjs` (`scanDataValues`), `i18n:check --strict`, `i18n:export --data`, `i18n:add-lang`; сторожа/тесты — языки из `UI_LOCALES`; проверено мутацией и `add-lang fr` на копии |
| Д-38 — smoke-112 «data и obsolete не попадают», smoke-85 ждёт сырой файл | 12.5 | 12.1 | ЗАКРЫТ 12.5 (2026-10-12): проверки под 11.4, smoke-85 различает род файла (`T85_FILE`); 88 / 44 ✓ |
| Д-39 — генераторы extract-* считают корнем scripts/ | 12.5 | 12.2 | ЗАКРЫТ 12.5 (2026-10-12): ROOT на два уровня, `extract-by-name.py` в scripts/extract/; генераты побайтно; smoke-export-assets на самом генераторе |
| Д-40 — задание тезисов не предписывает раскладку | 12.5 | 12.2 | ЗАКРЫТ 12.5 (2026-10-12): надстройка `thesis-layout-templates.ts` над генератом, сид накладывает, smoke-12 снимает (152 ✓), сторож 4bd/5an; test-125 R1 |
| Д-43 — правка тезиса переписывает «Тип» канонической меткой | 12.5 | 12.2 | ЗАКРЫТ 12.5 (2026-10-12): `renderThesesTable({priorRows})` хранит прежний текст при том же типе; smoke-125 A, test-125 R2 на файле концепции |
| Д-45 — четыре смоука красные на HEAD, гонка test-22, харнессы 101–103/112/113, test-62/71 на confirm | 12.5 | 12.3, 12.4 | ЗАКРЫТ 12.5 (2026-10-12): все переведены на сегодняшний код (ослаблений нет; закрытые находки перевёрнуты); test-22 ×7 без красного |
| Д-49 — встроенное состояние выгрузки пишет константу схемы | 12.5 | «По факту 12.4» п.10 | ЗАКРЫТ 12.5 (2026-10-12): `parentContextSchema: row.parentContextSchema`; круг экспорт → импорт хранит monolithic без маркера (smoke-125 E, 5an, test-125 R3) |
| Д-50 — replay подписки без `skipDegrades`/`sectionKeys`, обход `samePause` | 12.5 | «По факту 12.4 (тестовые)» п.1 | ЗАКРЫТ 12.5 (2026-10-12): replay с `replay: true`/`skipDegrades`/`sectionKeys`, живые паузы += `sectionKeys`; клиент по признаку: без модалки, снапшот как источник, перечитывание при снапшоте без паузы; обход снят, 4bc-о перевёрнут; test-125 R4, test-124 120 ✓ |
"""
patch(
    P08,
    "| Д-48 — вводная блока предупреждений раздела обещает «Документ цел» | 12.4 | «По факту 12.3» п.26 | ЗАКРЫТ 12.4 (2026-10-12): заголовок «⚠ Замечания к последней генерации (N)», вводная называет подстановки и пропуски; плюрал ru/en/de |\n",
    "| Д-48 — вводная блока предупреждений раздела обещает «Документ цел» | 12.4 | «По факту 12.3» п.26 | ЗАКРЫТ 12.4 (2026-10-12): заголовок «⚠ Замечания к последней генерации (N)», вводная называет подстановки и пропуски; плюрал ru/en/de |\n" + ROWS_IV,
    "L3 08 Часть IV: закрытые строки §12 (13)",
    marker="| Д-24 — smoke-55 звал снятые",
)

# ── M. 09 ────────────────────────────────────────────────────────────────
patch(
    P09,
    "   чужой порт.\n\n## 2. Патч-скрипты доков и оснастка извлечения\n",
    "   чужой порт.\n\n### Беседа 12.5 — демоны гибнут вместе с лимитом вызова, копия дерева\n"
    "1. **PG и Redis, поднятые в песочнице, гибнут вместе с фоновыми процессами\n"
    "   при лимите вызова** — между запросами беседы проверять `pg_ctlcluster\n"
    "   status`/`redis-cli ping` и поднимать заново; харнесс тогда падает на\n"
    "   «сервер не поднялся», а не на своей проверке.\n"
    "2. **Копия дерева для пробы инструмента (add-lang) — только со СВОИМ\n"
    "   `npm install`**: симлинк `node_modules` на исходный клон резолвит\n"
    "   `@philosynth/shared` (workspace-ссылка) в ИСХОДНОЕ дерево — серверный\n"
    "   код копии читает чужие `locales.ts` и генераты, и проверки врут в обе\n"
    "   стороны. Регресс «на свежем клоне» в песочнице без доступа к origin —\n"
    "   `git clone` локального репозитория (или tar без `.git`) + свой install\n"
    "   + `npm i --no-save puppeteer-core@23`.\n\n"
    "## 2. Патч-скрипты доков и оснастка извлечения\n",
    "M1 09 §1: уроки 12.5",
)
patch(
    P09,
    "## 3. PostgreSQL, Drizzle, данные\n",
    "### Беседа 12.5 — блоки-указатели, две части одного патча\n"
    "1. **Ссылка на блок «По факту N», которого нет, — дыра, а не мелочь**: у\n"
    "   бесед, закрытых до правила, заводится блок-указатель (где итоги — глава\n"
    "   08, чем текст запроса опровергнут), и проверяется скриптом по всем докам\n"
    "   (`«По факту N` ↔ `**По факту N`). Беседа, закрываясь, пишет блок всегда.\n"
    "2. **Патч одной беседы растёт частями (I — первый запрос, I-б — тестовые,\n"
    "   II — завершение) дописью новых `patch()`**: применённые правки не\n"
    "   редактируются; числа, уточнённые позже, правятся одинаково в доке и в\n"
    "   тексте патча — иначе повторный прогон на чистой копии разойдётся.\n\n"
    "## 3. PostgreSQL, Drizzle, данные\n",
    "M2 09 §2: уроки 12.5",
)
patch(
    P09,
    "   3). Ждать `value` поля без «Загрузка…», и только потом набирать.\n\n## 5. Node, TypeScript, сборка\n",
    "   3). Ждать `value` поля без «Загрузка…», и только потом набирать.\n\n"
    "### Беседа 12.5 — чужой код в харнессах, счётчик маршрутов мока, повтор паузы\n"
    "1. **Перепрогон старых харнессов — проверка «предмет исчез или ослаблен?»\n"
    "   на каждую красную строку**: предмет исчез (кнопка «Опубликовать», confirm\n"
    "   перед удалением, находка 10.3, закрытая Д-1) — проверка удаляется или\n"
    "   переворачивается с доводом в комментарии; предмет жив — чинится код, а\n"
    "   не проверка. Хардкод среды (`/opt/google/chrome/chrome`, язык браузера)\n"
    "   — резолвер и CDP `acceptLanguage` в каждом контексте.\n"
    "2. **`pickHtml` мока обязан считать маршруты по веткам** и печатать\n"
    "   образцы запасных: без счётчика test-32 годами отдавал капсуле критику\n"
    "   (задание капсулы несёт корень «критическ»), а зелёные итоги это прятали.\n"
    "   Умолчание `sum` для разделов без своего мока — допустимо, но только\n"
    "   со счётом.\n"
    "3. **Текст кнопок второго шага — uppercase CSS**: `innerText` отдаёт\n"
    "   «ТОЧНО УДАЛИТЬ?», проверки регистрозависимыми быть не должны.\n"
    "4. **hono перечисляет `app.routes` по записи на каждый обработчик**: `GET\n"
    "   /plans` с `optionalAuth` даёт две — считать уникальные пути.\n"
    "5. **Харнесс без явного `process.exit(0)` висит на открытых дескрипторах**\n"
    "   (PG, мок) и в очереди доживает до `timeout` с кодом 137.\n"
    "6. **Охота за узлом 3D после жестов — второй, плотной сеткой** (шаг 4 %\n"
    "   холста, в границах канваса): орбита/зум/пинч уводят узлы с крупной\n"
    "   сетки ±0,4; tap-select — ДО жестов.\n"
    "7. **Повтор паузы приходит на `?resume=` при подключении, а не на\n"
    "   `subscribe_generation`** (§3.3): сырой WS-харнесс подключается с\n"
    "   `resume`, иначе ждёт сообщения зря. Первый холодный прогон нового\n"
    "   дерева может не дождаться `abort-btn` за 30 с — повторный прогон\n"
    "   обязателен прежде, чем звать это дефектом.\n"
    "8. **Файл концепции берётся из `T*_FILE`, в репозиторий не кладётся**;\n"
    "   харнесс различает род файла (сырой одностраничник / экспорт службы) до\n"
    "   проверок и пропускает блок с причиной, а не краснеет.\n\n"
    "## 5. Node, TypeScript, сборка\n",
    "M3 09 §4: уроки 12.5",
)
patch(
    P09,
    "   честно писать «ждём оценку сервера».\n\n## 7. Сервер: стрим, WS, Redis, Registry\n",
    "   честно писать «ждём оценку сервера».\n\n"
    "### Беседа 12.5 — повтор паузы и снапшот\n"
    "1. **Повтор серверного события по признаку `replay` не подменяет снапшот,\n"
    "   а дополняет его**: модалка по повтору не открывается, раздел не красится,\n"
    "   источник `pausedState` — GET /:id (он полнее); но снапшот, прочитанный ДО\n"
    "   обрыва, по повтору обязан перечитываться — иначе ни бейджа, ни модалки\n"
    "   (test-62 R9). Сличение полей живого и снапшота (`samePause`) — обход,\n"
    "   который снимается, как только сервер метит повтор.\n\n"
    "## 7. Сервер: стрим, WS, Redis, Registry\n",
    "M4 09 §6: урок 12.5",
)
patch(
    P09,
    "   (Д-50).\n\n## 8. Прочее\n",
    "   (Д-50).\n\n"
    "### Беседа 12.5 — надстройки над генератами, бережная перерисовка\n"
    "1. **Третья надстройка над генератом (раскладка тезиса) — по тому же\n"
    "   образцу**: `apply*` в сиде (идемпотентно, в конец), `strip*` в smoke-12\n"
    "   (ровно одна, в конце), сторож «генерат без неё, активный шаблон с ней»,\n"
    "   плюс сверка с разбором (`JUSTIFICATION_LEAD_RE` узнаёт «Обоснование.»\n"
    "   надстройки) — иначе задание и разбор разойдутся молча.\n"
    "2. **Перерисовка таблицы из БД бережёт текст ячеек закрытых списков**\n"
    "   (как заголовки `opts.headers`): прежняя ячейка остаётся, если читается\n"
    "   в то же значение (`mapThesisType(prev) === db`); столбец ищется по\n"
    "   заголовку, не по месту. Для этого `locateDocTable` отдаёт `rows`.\n"
    "3. **Встроенное состояние выгрузки пишет колонки, не константы службы**:\n"
    "   константа схемы делала legacy-концепцию selective-v1 после круга\n"
    "   экспорт → импорт без маркера миграции.\n\n"
    "## 8. Прочее\n",
    "M5 09 §7: уроки 12.5",
)

# ── N. README ────────────────────────────────────────────────────────────
patch(
    PREADME,
    "схемы родительского контекста с зеркалом в выгрузке, замечание строки рекомендаций и вводная блока "
    "предупреждений; Chrome 131 на сборке) — 10-12 |",
    "схемы родительского контекста с зеркалом в выгрузке, замечание строки рекомендаций и вводная блока "
    "предупреждений; Chrome 131 на сборке) — 10-12; 12.5 (харнессы на сегодняшний код, счётчик маршрутов мока, "
    "сканер значений файлов-данных и `i18n:add-lang`, блоки-указатели «По факту», генераторы со своего места; "
    "продукт — надстройка раскладки тезиса, бережный «Тип», схема в выгрузке колонкой, помеченный replay паузы) — "
    "10-13. **Фаза закрыта 2026-10-13; реестр §12 пуст** |",
    "N1 README: таблица фаз",
)
patch(
    PREADME,
    "В реестре открытых долгов (07 §12, ревизия 2026-09-23) 31 строка «Д-N» —\nдефекты, недоделки, оснастка, доки. Адресаты — Фаза 12, пять бесед:\n",
    "Реестр открытых долгов (07 §12) ПУСТ с 2026-10-13 — Фаза 12 закрыта; закрытые\nстроки — 08 Часть IV. Было (ревизия 2026-09-23) 31 строка «Д-N» —\nдефекты, недоделки, оснастка, доки. Адресаты — Фаза 12, пять бесед:\n",
    "N2 README: реестр пуст",
)

# ── O. NEXT-CONTEXT ──────────────────────────────────────────────────────
patch(
    PNC,
    "## Состояние на 2026-10-12 (Фаза 12 «Закрытие долгов»: 12.1–12.4 ЗАКРЫТЫ; 12.5 — первый запрос сделан, тестовые и закрытие впереди)\n\n"
    "**12.5 (харнессы, инструменты переводов, доки) — первый запрос сделан\n2026-10-12.**",
    "## Состояние на 2026-10-13 (Фаза 12 «Закрытие долгов» ЗАКРЫТА: 12.1–12.5; реестр §12 пуст; ближайшая беседа не назначена)\n\n"
    "**12.5 (харнессы, инструменты переводов, доки) ЗАКРЫТА 2026-10-13 — Фаза 12\nзакрыта.** Первый запрос 2026-10-12:",
    "O1 NEXT-CONTEXT: состояние — 12.5 закрыта",
)
patch(
    PNC,
    "replay паузы с `replay: true`/`skipDegrades`/`sectionKeys` (обход `samePause`\nснят, 4bc-о перевёрнут). Новое: `tests/smoke-125-request1.mjs`, сторожа\n2as/4bd/5an. Миграций нет. Доки — `scripts/patches/patch-docs-conv125.py` (часть I).\n",
    "replay паузы с `replay: true`/`skipDegrades`/`sectionKeys` (обход `samePause`\nснят, 4bc-о перевёрнут). Тестовые запросы 2026-10-13: счётчик маршрутов мока\n(нашёл капсулу, уходившую в критику в test-32), `add-lang fr` на копии —\nINTEGRATION OK без правки сторожей (одна правка: «fr» не чужой язык),\n`tests/test-125-requests2-9.mjs` 39 ✓ (Д-40/Д-43/Д-49/Д-50 живьём). Новое:\n`tests/smoke-125-request1.mjs`, сторожа 2as/4bd/5an. Миграций нет. Доки —\n`scripts/patches/patch-docs-conv125.py` (части I, I-б, II). Коммиты на `main`\nбез push (403 прокси) — вливает пользователь.\n",
    "O2 NEXT-CONTEXT: итоги 12.5",
)
patch(
    PNC,
    "2026-10-12 → 12.5 харнессы, инструменты\nпереводов, доки и четыре продуктовых долга (Д-24…Д-28, Д-33, Д-38, Д-39, Д-40, Д-43, Д-45, Д-49, Д-50:",
    "2026-10-12 → 12.5 харнессы, инструменты\nпереводов, доки и четыре продуктовых долга — ЗАКРЫТА 2026-10-13, РЕЕСТР ПУСТ (Д-24…Д-28, Д-33, Д-38, Д-39, Д-40, Д-43, Д-45, Д-49, Д-50:",
    "O3 NEXT-CONTEXT: реестр — 12.5 закрыта",
)
patch(
    PNC,
    "12.4 — 2ar/4bc (без живой секции — клиент); следующая серия — 2as/4bd/5an)",
    "12.4 — 2ar/4bc (без живой секции — клиент); 12.5 — 2as/4bd/5an; следующая серия — 2at/4be/5ao)",
    "O4 NEXT-CONTEXT: серия сторожей",
)
patch(
    PNC,
    "колонка, `UI_LOCALES`/`UI_TO_GEN`/`UI_LOCALE_NAMES`, сторожа 4aw/4ax/4ay и\nтесты 112–114 по спискам языков, черновик через `--draft`).\n",
    "колонка — одной командой `npm run i18n:add-lang -- xx` с 12.5; рукой —\n`UI_LOCALES`/`UI_TO_GEN`/`UI_LOCALE_NAMES`; сторожа 4aw/4ax/4ay и тесты\n112–114 языки берут из `UI_LOCALES`; черновик через `--draft`).\n",
    "O5 NEXT-CONTEXT: беседа L после Д-33",
)
KIT_NEXT = """## Ближайшая беседа — не назначена (Фаза 12 закрыта 2026-10-13)

Протокол 07 дальше Фазы 12 бесед не заводит. Открытые пути: типовая беседа
**L.1** (новый язык интерфейса; после Д-33 п.1 первого запроса — одна команда
`npm run i18n:add-lang -- xx`, сторожа и тесты 112–114 языки берут из
`UI_LOCALES`) либо новая фаза по решению пользователя (заводится в 07:
врезка, тексты бесед, узлы §11; долги — строками §12 с адресатом). Реестр
§12 пуст; ограничения «Огр-N» остаются. Миграций — нет (следующая — 0014).
Файл концепции для харнессов 101/102/103/121/122/125 — из `T*_FILE`, в
репозитории его нет.

## Что 12.5 оставила знать всем беседам

- **Четыре надстройки над генератами, не правки генератов**:
  `recommendation-templates` (10.1), `lang-templates` (11.1),
  `export-viewer-overrides` (12.2), `thesis-layout-templates` (12.5) — сид
  накладывает, smoke-12/smoke-export-assets снимают, сторожа сверяют
  «генерат без, активный шаблон с». Новое отступление службы от исходника —
  пятой надстройкой по тому же образцу.
- **Раскладка блока тезиса требуется заданием** (`<h5>Тезис {метка}
  (…)</h5>`, абзац одной жирной формулировки = табличной, `<p><strong>
  Обоснование.</strong> …</p>`); обе модели разбора остаются.
- **Перерисовка сводной таблицы тезисов бережёт прежний текст «Тип»**
  (`renderThesesTable({ headers, priorRows })`, `locateDocTable().rows`).
- **Replay паузы помечен**: `generation_paused { replay: true, skipDegrades,
  sectionKeys }` приходит на `?resume=` (`handleResume`, §3.3); клиент по
  признаку не открывает модалку, берёт `pausedState` из снапшота GET /:id и
  перечитывает его, если снапшот ещё не в паузе. Живые паузы несут
  `sectionKeys`. Обхода `samePause` больше нет.
- **Встроенное состояние выгрузки пишет колонку `parent_context_schema`**;
  круг экспорт → импорт хранит monolithic без маркера миграции.
- **Значения файлов-данных сверяются с таблицей переводов**
  (`scanDataValues`; `i18n:check --strict` и сторож 4ay красят, `i18n:export
  --data` заводит строки); новый язык — `i18n:add-lang`; языки в сторожах
  4aw/4ax/4ay и тестах 112–114 — из `UI_LOCALES`, «чужой» язык в проверках —
  первый код не из `UI_LOCALES` (не «fr»).
- **Харнессы**: Chrome 131 из кэша puppeteer + CDP `acceptLanguage: ru` в
  каждом контексте; `visibility`, второй шаг кнопок, uppercase CSS →
  сравнение без регистра; мок считает маршруты по веткам; явный
  `process.exit(0)`; файл концепции из `T*_FILE` с различением рода файла.
- **«По факту N» есть у каждой закрытой беседы** (блоки-указатели у
  0.2/0.3b/0.6/2.3/2.4/3.1); ссылки на блоки проверяются скриптом.

"""
patch(
    PNC,
    "## Комплект ближайшей беседы — 12.5 (харнессы, инструменты переводов, доки; последняя Фазы 12)\n",
    KIT_NEXT + "## Комплект ближайшей беседы — 12.5 (харнессы, инструменты переводов, доки; последняя Фазы 12) — ИСПОЛНЕН, беседа закрыта\n",
    "O6 NEXT-CONTEXT: ближайшая беседа и «Что 12.5 оставила»",
    marker="## Что 12.5 оставила знать всем беседам",
)
patch(
    PNC,
    "интерфейса (ЗАКРЫТА 2026-10-12) → 12.5 харнессы, инструменты переводов, доки (разделена\n2026-09-29; было три).",
    "интерфейса (ЗАКРЫТА 2026-10-12) → 12.5 харнессы, инструменты переводов, доки (ЗАКРЫТА\n2026-10-13; разделена 2026-09-29; было три). **Фаза 12 закрыта, реестр §12 пуст.**",
    "O7 NEXT-CONTEXT: раздел о Фазе 12",
)

print(f"\nприменено {applied}, пропущено {skipped}, ошибок {failed}")
sys.exit(1 if failed else 0)
