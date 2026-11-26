#!/usr/bin/env python3
"""Патч документации: языки генерации одной таблицей (2026-11-26, вне бесед).

Идемпотентный: каждая правка проверяет marker и уходит в skip при повторе.
Отчёт applied/skip/fail. Запуск из корня репозитория:
    python3 scripts/patches/patch-docs-gen-langs.py

Правки:
  GL/A  02: synthesis_search.config — восемь словарей; 0025; syntheses.lang.
  GL/B  04: locales.ts — GEN_LANGS; новый gen-script-css.ts.
  GL/C  05: locales.ts и gen-script-css.ts в дереве; search.ts — словари из таблицы.
  GL/D  08: Часть III — врезка.
  GL/E  09: §10 — «Что оставили правки 2026-11-26».
  GL/F  NEXT-CONTEXT: дополнение 2026-11-26 (серия 2bj/4bu/5bb занята,
        следующая миграция — 0026).
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"
applied = skipped = failed = 0


def patch(path: Path, old: str, new: str, label: str, marker: str | None = None) -> None:
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


# ── GL/A  02 ────────────────────────────────────────────────────────────
patch(
    DOCS / "02-data-model.md",
    "    -- словарь документа по syntheses.lang: Russian → russian, English →\n"
    "    -- english, German → german, иной язык → simple (shared\n"
    "    -- SEARCH_TS_CONFIG_BY_LANG); нужен ts_headline при выдаче фрагмента\n",
    "    -- словарь документа по syntheses.lang — поле search таблицы языков\n"
    "    -- генерации GEN_LANGS (shared/i18n/locales; 0025, 2026-11-26): russian,\n"
    "    -- english, german, french, italian, spanish, portuguese, arabic; прочие\n"
    "    -- языки (китайский, японский, фарси, латынь, древнегреческий, вэньянь,\n"
    "    -- санскрит, введённые руками) → simple; нужен ts_headline при выдаче фрагмента\n",
    "GL/A 02 — словари по таблице языков",
    marker="поле search таблицы языков\n",
)
patch(
    DOCS / "02-data-model.md",
    "    CHECK (config IN ('russian','english','german','simple'))\n",
    "    CHECK (config IN ('russian','english','german','french','italian',\n"
    "                      'spanish','portuguese','arabic','simple'))  -- 0025\n",
    "GL/A 02 — CHECK config",
)
patch(
    DOCS / "02-data-model.md",
    "  (`config`) и `simple`. Запрос разбирается всеми четырьмя словарями и\n",
    "  (`config`) и `simple`. Запрос разбирается всеми словарями\n"
    "  (`SEARCH_TS_CONFIGS`, девять с `simple`) и\n",
    "GL/A 02 — «всеми четырьмя словарями»",
)
patch(
    DOCS / "02-data-model.md",
    "  копия сборки документа в SQL миграции разошлась бы с ней при первой\n"
    "  правке. Он же — починка после сбоя. `deploy/*` зовут его после миграций.\n",
    "  копия сборки документа в SQL миграции разошлась бы с ней при первой\n"
    "  правке. Он же — починка после сбоя. `deploy/*` зовут его после миграций.\n"
    "- **Смена словаря языка — миграция снимает строки, `--missing` их\n"
    "  возвращает** (0025, 2026-11-26): строки документов на французском,\n"
    "  итальянском, испанском, португальском и арабском, собранные прежде\n"
    "  `simple`, миграция удаляет; пересобирает их `search:reindex -- --missing`.\n",
    "GL/A 02 — 0025 и --missing",
    marker="**Смена словаря языка — миграция снимает строки",
)
patch(
    DOCS / "02-data-model.md",
    "  lang             TEXT NOT NULL DEFAULT 'Russian',\n",
    "  lang             TEXT NOT NULL DEFAULT 'Russian',  -- значение GEN_LANGS (shared/i18n/locales)\n"
    "                                             -- либо язык, введённый руками; CHECK нет\n",
    "GL/A 02 — syntheses.lang",
    marker="-- значение GEN_LANGS (shared/i18n/locales)",
)

# ── GL/B  04 ────────────────────────────────────────────────────────────
patch(
    DOCS / "04-code-reuse-map.md",
    "| `packages/shared/i18n/t.ts` (11.2) |",
    "| `packages/shared/i18n/locales.ts` (2026-11-26, вне бесед) | ДОПОЛНЕНО: `GEN_LANGS` — ОДНА таблица языков генерации (значение, самоназвание, BCP 47, направление письма, словарь поиска, суффикс имени файла, `experimental`, `promptName`); из неё выводятся `LANG_OPTIONS`, `SEARCH_TS_CONFIG_BY_LANG`, html lang экспорта (`genLangHtmlTag`; прежняя цепочка тернарников html-exporter снята), суффикс имени файла (`genLangFileSuffix`; у прежних языков — правило исходника «две буквы»), атрибуты содержимого (`genLangContentAttrs`) и имя языка для модели (`genLangPromptName`, buildSYS). 15 языков: + итальянский, португальский, арабский, фарси, древнегреческий, вэньянь, санскрит; три последних — экспериментальные (пометка и предупреждение в форме); сторожа 2bj/4bu/5bb |\n"
    "| `packages/shared/i18n/gen-script-css.ts` | НОВОЕ (2026-11-26, прародителя нет — исходник писал слева направо латиницей и кириллицей): правила письменностей — шрифты IBM Plex Sans Arabic/Devanagari запасными семействами, справа налево для `[dir=\"rtl\"]`, снятая разрядка и подросший кегль для ar/fa/sa; один текст на клиент (дословно в globals.css, сторож 4bu) и экспорт HTML |\n"
    "| `packages/shared/i18n/t.ts` (11.2) |",
    "GL/B 04 — GEN_LANGS и gen-script-css",
    marker="| `packages/shared/i18n/gen-script-css.ts` | НОВОЕ (2026-11-26",
)

# ── GL/C  05 ────────────────────────────────────────────────────────────
patch(
    DOCS / "05-file-structure.md",
    "│       │   ├── locales.ts              # UI_LOCALES, UI_TO_GEN, GEN_FALLBACK, genLangForUi (правило\n"
    "│       │   │                           # владельца интерфейс → генерация); LANG_OPTIONS формы (из\n"
    "│       │   │                           # SynthesisForm 1.5) — один список\n",
    "│       │   ├── locales.ts              # UI_LOCALES, UI_TO_GEN, GEN_FALLBACK, genLangForUi (правило\n"
    "│       │   │                           # владельца интерфейс → генерация); GEN_LANGS — таблица языков\n"
    "│       │   │                           # генерации (2026-11-26), из неё LANG_OPTIONS формы, словари\n"
    "│       │   │                           # поиска, html lang/dir, суффикс файла, имя языка для модели\n"
    "│       │   ├── gen-script-css.ts       # 2026-11-26: правила письменностей (rtl ar/fa, деванагари) —\n"
    "│       │   │                           # один текст клиенту (globals.css) и экспорту HTML\n",
    "GL/C 05 — locales.ts и gen-script-css.ts",
    marker="│       │   ├── gen-script-css.ts       # 2026-11-26",
)
patch(
    DOCS / "05-file-structure.md",
    "│       │   │                           #  словари по языку (searchTsConfigFor), пределы и порог триграмм\n",
    "│       │   │                           #  словари по языку (searchTsConfigFor — из GEN_LANGS), пределы и порог триграмм\n",
    "GL/C 05 — search.ts",
)

# ── GL/D  08 ────────────────────────────────────────────────────────────
patch(
    DOCS / "08-history.md",
    "> **Правки 2026-11-25 (вне бесед — подарок один на адрес)**:",
    "> **Правки 2026-11-26 (вне бесед — языки генерации)**: решение\n"
    "> пользователя — добавить итальянский, древнегреческий, португальский,\n"
    "> классический китайский (вэньянь), арабский, фарси и санскрит;\n"
    "> древнегреческий, вэньянь и санскрит — с пометкой «экспериментально»;\n"
    "> санскрит — деванагари; вёрстку под письмо справа налево править. Найдено\n"
    "> по ходу: сведения о языке жили в трёх расходящихся местах (список формы,\n"
    "> цепочка docLang → html lang экспортёра на восемь языков, карта словарей\n"
    "> поиска на три); язык, введённый руками, экспорт звал английским\n"
    "> (`lang=\"en\"`); у французского и испанского не было морфологии в поиске,\n"
    "> хотя словари PostgreSQL есть; в deploy/philosynth-hosting.md не было шага\n"
    "> `search:reindex`. Сделано: таблица `GEN_LANGS` (shared/i18n/locales) — из\n"
    "> неё список формы, словари поиска (+ french, italian, spanish, portuguese,\n"
    "> arabic; миграция 0025 со снятием строк, собранных `simple`), html lang и\n"
    "> направление письма тел разделов (клиент и экспорт), суффикс имени файла\n"
    "> (у прежних языков прежний), имя языка для модели (санскрит — «written in\n"
    "> Devanagari script», вэньянь — традиционные знаки, древнегреческий —\n"
    "> политоника); правила письменностей `gen-script-css.ts` (шрифты IBM Plex\n"
    "> Sans Arabic/Devanagari, справа налево, без разрядки); форма — пометка и\n"
    "> предупреждение у экспериментальных языков (en/de утверждены). Сторожа\n"
    "> 2bj/4bu/5bb; 2bg и 4ax — под новую форму без ослабления. Проверено:\n"
    "> typecheck, audit, check:integration, css-parity, i18n:check --strict,\n"
    "> test-gen-langs 30 ✓, test-gen-langs-ui 12 ✓ (Chrome 131), test-42 76 ✓,\n"
    "> test-181 38 ✓, smoke-12 152 ✓; прежние отказы smoke-111/112/113,\n"
    "> test-112, test-43 — те же на чистом дереве. Скрипт —\n"
    "> scripts/patches/patch-docs-gen-langs.py.\n"
    ">\n"
    "> **Правки 2026-11-25 (вне бесед — подарок один на адрес)**:",
    "GL/D 08 — врезка",
    marker="Правки 2026-11-26 (вне бесед — языки генерации)",
)

# ── GL/E  09 ────────────────────────────────────────────────────────────
patch(
    DOCS / "09-lessons.md",
    "### Что оставили правки 2026-11-25 (тарифная сетка; вне бесед)\n",
    "### Что оставили правки 2026-11-26 (языки генерации; вне бесед)\n"
    "\n"
    "- **Язык генерации — строка `GEN_LANGS`, и только она**\n"
    "  (`packages/shared/i18n/locales.ts`): новый язык — одна строка таблицы\n"
    "  (значение, самоназвание, BCP 47, направление, словарь, суффикс,\n"
    "  `experimental`, `promptName`). Словарь, которого нет в\n"
    "  `SEARCH_TS_CONFIGS`, — ошибка типа; новый словарь — ещё и миграция CHECK\n"
    "  `synthesis_search_config_check` со снятием строк языка, собранных\n"
    "  `simple` (образец — 0025), и сторож 4bu сверит schema.ts и миграцию.\n"
    "- **Суффиксы имён файлов прежних языков не трогать** (German → `-ge`,\n"
    "  Chinese → `-ch`, Spanish → `-sp` — правило исходника): по ним узнают уже\n"
    "  выгруженные файлы; новым языкам — код BCP 47.\n"
    "- **Направление письма — у тел документа, не у страницы**: шапка,\n"
    "  оглавление-обёртка, футер и формы правки — в направлении интерфейса;\n"
    "  форма правки подраздела внутри тела раздела ставит себе `dir=\"ltr\"`.\n"
    "  Мелкий текст модели вне тел (названия, фрагменты поиска, режимы,\n"
    "  обогащение) — `dir=\"auto\"`.\n"
    "- **Правила письменностей — один текст** (`GEN_SCRIPT_CSS`): globals.css\n"
    "  держит его дословно вне `@layer` (правила исходника не слоёные и\n"
    "  перебили бы слоёные), экспорт кладёт тот же текст; правка — в модуле,\n"
    "  затем блок globals.css между метками (4bu сверяет побайтно).\n"
    "- **`to_regconfig` в PostgreSQL 16 нет** — наличие словаря проверяется\n"
    "  по `pg_ts_config` (5bb).\n"
    "- **Шрифты Google в песочнице недоступны**: на снимках арабские заголовки\n"
    "  моноширинного набора — запасной системный шрифт; проверять стили по\n"
    "  вычисленным значениям (`getComputedStyle`), не по виду глифов.\n"
    "\n"
    "### Что оставили правки 2026-11-25 (тарифная сетка; вне бесед)\n",
    "GL/E 09 — §10, 2026-11-26",
    marker="### Что оставили правки 2026-11-26 (языки генерации; вне бесед)",
)

# ── GL/F  NEXT-CONTEXT ──────────────────────────────────────────────────
patch(
    ROOT / "NEXT-CONTEXT.md",
    "## Дополнение 2026-11-25 (вне бесед — тарифная сетка)\n",
    "## Дополнение 2026-11-26 (вне бесед — языки генерации)\n"
    "\n"
    "Языки генерации — одна таблица `GEN_LANGS` (shared/i18n/locales), 15\n"
    "языков; экспериментальные — древнегреческий, вэньянь, санскрит. Миграция\n"
    "0025 `gen_langs_search` (словари поиска +5; таблиц по-прежнему 44) —\n"
    "**следующая миграция — 0026**; после неё на стоящей службе —\n"
    "`npm run search:reindex -- --missing`. **Сторож 2bj/4bu/5bb ЗАНЯТ\n"
    "(следующая серия — 2bk/4bv/5bc).** Три новых ключа i18n\n"
    "(`synthesis.synthesisForm.experimentalLanguage*`, `customLanguagePlaceholder`)\n"
    "— en/de утверждены пользователем 2026-11-26. Харнессы `tests/test-gen-langs.mjs`,\n"
    "`tests/test-gen-langs-ui.mjs`. 09 §10, «Что оставили правки 2026-11-26».\n"
    "\n"
    "## Дополнение 2026-11-25 (вне бесед — тарифная сетка)\n",
    "GL/F NEXT-CONTEXT — дополнение 2026-11-26",
    marker="## Дополнение 2026-11-26 (вне бесед — языки генерации)",
)
patch(
    ROOT / "NEXT-CONTEXT.md",
    "18.3 — 2bi/4bt/5ba; следующая серия — 2bj/4bu/5bb)",
    "18.3 — 2bi/4bt/5ba; 2026-11-26 языки генерации — 2bj/4bu/5bb; следующая серия — 2bk/4bv/5bc)",
    "GL/F NEXT-CONTEXT — перечень серий",
)
patch(
    ROOT / "NEXT-CONTEXT.md",
    "таблиц 44) — **следующая миграция — 0025**.",
    "таблиц 44) — следующая миграция — 0025 (занята 2026-11-26, см. выше).",
    "GL/F NEXT-CONTEXT — устаревшее «следующая — 0025»",
)

print(f"\napplied={applied} skip={skipped} fail={failed}")
sys.exit(1 if failed else 0)
