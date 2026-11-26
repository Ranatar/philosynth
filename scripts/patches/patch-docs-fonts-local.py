#!/usr/bin/env python3
"""Патч документации: шрифты в проекте, политоника древнегреческого, правки
проверки коммитов 2026-11-26 (вне бесед).

Идемпотентный: каждая правка проверяет marker и уходит в skip при повторе.
Отчёт applied/skip/fail. Запуск из корня репозитория:
    python3 scripts/patches/patch-docs-fonts-local.py

Правки:
  FL/A  05 — gen-script-css (политоника, :dir/:lang на элементе), fonts.css,
        client/public/fonts, useContentLangAttrs, png-fonts, server/assets/fonts,
        scripts/fonts/vendor-fonts.mjs.
  FL/B  07 §8, шаблон L, пункт 2а — новая письменность: шрифт в проект.
  FL/C  08 Часть III — строка о правках.
  FL/D  09 §10 — урок о шрифте письменности переписан; три новых урока.
  FL/E  NEXT-CONTEXT — дополнение.
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


# ── FL/A: 05 ──
d05 = DOCS / "05-file-structure.md"
patch(
    d05,
    "│       │   ├── gen-script-css.ts       # 2026-11-26: правила письменностей (rtl ar/fa, деванагари) —\n"
    "│       │   │                           # один текст клиенту (globals.css) и экспорту HTML\n",
    "│       │   ├── gen-script-css.ts       # 2026-11-26: правила письменностей (rtl ar/fa, деванагари,\n"
    "│       │   │                           # политоника grc — стеки с Noto) — один текст клиенту\n"
    "│       │   │                           # (globals.css) и экспорту HTML; правила на :dir(rtl) и на\n"
    "│       │   │                           # :lang() САМОГО элемента; GEN_SCRIPT_FONT_FAMILIES — ссылка\n"
    "│       │   │                           # шрифтов ТОЛЬКО экспортированного файла\n",
    "FL/A1 05: gen-script-css",
    marker="политоника grc — стеки с Noto",
)
patch(
    d05,
    "│   │   ├── main.tsx                    # React entry point\n",
    "│   │   ├── main.tsx                    # React entry point; fonts.css — перед globals.css\n"
    "│   │   ├── fonts.css                   # ГЕНЕРАТ scripts/fonts/vendor-fonts.mjs: @font-face шрифтов\n"
    "│   │   │                               # из client/public/fonts (2026-11-26; ссылок на Google\n"
    "│   │   │                               # Fonts в клиенте нет — сторож 4bu)\n"
    "│   │   ├── hooks/useContentLangAttrs.ts # lang/dir содержимого документа вне тел разделов\n"
    "│   │   │                               # (обогащения, просмотр преобразования) — язык из стора\n",
    "FL/A2 05: fonts.css, useContentLangAttrs",
    marker="ГЕНЕРАТ scripts/fonts/vendor-fonts.mjs: @font-face",
)
patch(
    d05,
    "│   │   └── css-parity-audit.py         # единство globals.css с блоком <style> исходника\n",
    "│   │   └── css-parity-audit.py         # единство globals.css с блоком <style> исходника\n"
    "│   ├── fonts/vendor-fonts.mjs          # 2026-11-26: сборка шрифтов клиента из пакетов @fontsource\n"
    "│   │                                   # → client/public/fonts/*.woff2 (96 файлов, ~1,4 МБ:\n"
    "│   │                                   # IBM Plex Mono/Sans, Playfair Display, IBM Plex Sans\n"
    "│   │                                   # Arabic/Devanagari, Noto Sans/Serif/Sans Mono — только\n"
    "│   │                                   # greek и greek-ext) + LICENSES.md + client/src/fonts.css\n"
    "│   # server/assets/fonts/*.ttf         # шрифты PNG-экспорта (node-canvas), регистрация —\n"
    "│   #                                   # server/services/export/png-fonts.ts (ensurePngFonts)\n",
    "FL/A3 05: vendor-fonts, server/assets/fonts",
    marker="fonts/vendor-fonts.mjs          # 2026-11-26",
)

# ── FL/B: 07, шаблон L ──
d07 = DOCS / "07-conversation-protocol.md"
patch(
    d07,
    "   шаг `search:reindex -- --missing` в deploy/*. Новая письменность —\n"
    "   семейство в `GEN_SCRIPT_FONT_FAMILIES` (и `client/index.html`),\n"
    "   правила в `GEN_SCRIPT_CSS` (блок globals.css — побайтно, 4bu).\n",
    "   шаг `search:reindex -- --missing` в deploy/*. Новая письменность —\n"
    "   шрифт В ПРОЕКТ: строка `FONT_SET` в `scripts/fonts/vendor-fonts.mjs`\n"
    "   и её прогон (файлы — `client/public/fonts`, `client/src/fonts.css` —\n"
    "   генерат), семейство в стеках `GEN_SCRIPT_CSS` (блок globals.css —\n"
    "   побайтно, 4bu) и в `GEN_SCRIPT_FONT_FAMILIES` (ссылка шрифтов\n"
    "   экспортированного файла); для PNG — TTF в `server/assets/fonts` и\n"
    "   строка `png-fonts.ts`. Ссылок на внешние службы шрифтов в клиенте нет.\n",
    "FL/B 07: шаблон L, пункт 2а — шрифт письменности в проект",
    marker="шрифт В ПРОЕКТ: строка `FONT_SET`",
)

# ── FL/C: 08 Часть III ──
d08 = DOCS / "08-history.md"
patch(
    d08,
    "> **Правки 2026-11-26 (вне бесед — кандидаты в языки интерфейса)**: к\n",
    "> **Правки 2026-11-26 (вне бесед — шрифты в проекте, политоника,\n"
    "> проверка коммитов дня)**: проверка a409fe2…a8a61cc на свежем клоне\n"
    "> нашла: check:integration красный (4bt ждал прежнюю строку NEXT-CONTEXT,\n"
    "> которую a409fe2 сам переписал — сторож теперь принимает обе); правила\n"
    "> письменностей стояли на предке (`[dir=rtl] X`, `:lang() X`) и не\n"
    "> доставались `.doc-content`, несущему lang/dir сам, — режимы получали\n"
    "> их наполовину, обогащения и просмотр преобразования (`dir=auto` без\n"
    "> lang) — не получали вовсе, окно режимов в выгрузке оставалось слева\n"
    "> направо. Поправлено: правила на `:dir(rtl)` и `:lang()` самого\n"
    "> элемента; `useContentLangAttrs` (язык открытой концепции) в\n"
    "> EnrichmentPanel и TransformPanel; `buildModesExportSection(rows, lang)`\n"
    "> — data-content-dir/-lang на `#philosynth-modes`, скрипт окна переносит\n"
    "> их на `#modeContent`; `dir=auto` — имя, определение и происхождение\n"
    "> узла, концы и описание связи, имена карточек пула. Решение\n"
    "> пользователя: шрифт с политоникой для древнегреческого и ВСЕ шрифты —\n"
    "> в проекте, не ссылкой. Клиент: `client/public/fonts` (96 woff2,\n"
    "> ~1,4 МБ, из @fontsource — `scripts/fonts/vendor-fonts.mjs`),\n"
    "> `client/src/fonts.css` (генерат), ссылка Google Fonts из index.html\n"
    "> убрана. Политоника — Noto Sans / Noto Serif / Noto Sans Mono (greek,\n"
    "> greek-ext): под `:lang(grc)` стеки начинаются с Noto, прописные\n"
    "> подзаголовков сняты. PNG — TTF в `server/assets/fonts`, регистрация\n"
    "> `png-fonts.ts` до createCanvas. Экспортированный файл HTML шрифты\n"
    "> по-прежнему берёт ссылкой (он живёт вне службы) — семейства Noto в неё\n"
    "> добавлены; вшивать ли шрифты в файл — вопрос владельцу. `tests/out/` —\n"
    "> в .gitignore. Сторож 4bu расширен; test-gen-langs 36 ✓,\n"
    "> test-gen-langs-ui 16 ✓. 05, 07 §8, 09 §10. Скрипт —\n"
    "> scripts/patches/patch-docs-fonts-local.py.\n"
    ">\n"
    "> **Правки 2026-11-26 (вне бесед — кандидаты в языки интерфейса)**: к\n",
    "FL/C 08: Часть III — шрифты в проекте",
    marker="Правки 2026-11-26 (вне бесед — шрифты в проекте, политоника",
)

# ── FL/D: 09 §10 ──
d09 = DOCS / "09-lessons.md"
patch(
    d09,
    "- **Новая письменность — ещё и шрифт**: семейство в\n"
    "  `GEN_SCRIPT_FONT_FAMILIES` (`gen-script-css.ts`) и в ссылке шрифтов\n"
    "  `client/index.html` (4bu проверяет, что она его содержит), правила — в\n"
    "  `GEN_SCRIPT_CSS`. Правила завязаны на `:lang()`, а `<html lang>` ставит\n",
    "- **Новая письменность — ещё и шрифт, и он лежит в проекте**: строка\n"
    "  `FONT_SET` в `scripts/fonts/vendor-fonts.mjs` и прогон (woff2 —\n"
    "  `client/public/fonts`, `client/src/fonts.css` — генерат, руками не\n"
    "  править), семейство — в стеках `GEN_SCRIPT_CSS` и в\n"
    "  `GEN_SCRIPT_FONT_FAMILIES` (ссылка шрифтов экспортированного файла —\n"
    "  единственное место, где шрифты ещё берутся извне); 4bu сверяет, что\n"
    "  каждое семейство стеков объявлено в fonts.css, каждый файл на месте, а\n"
    "  в index.html внешних ссылок нет. Для PNG — TTF в `server/assets/fonts`\n"
    "  и строка `png-fonts.ts` (node-canvas woff2 не читает).\n"
    "- **«Греческий есть» не значит «политоника есть»**: в IBM Plex греческий\n"
    "  только монотонический, в Playfair Display и IBM Plex Mono его нет вовсе —\n"
    "  буквы с придыханиями падали в системный шрифт вперемешку с Plex внутри\n"
    "  слова. Покрытие шрифта проверять по подмножествам (greek-ext), а не по\n"
    "  названию письменности. Noto в проекте несёт ТОЛЬКО греческие\n"
    "  подмножества, поэтому первым в стеке под `:lang(grc)` стоит безопасно.\n"
    "- **Правило письменности — на самом элементе, не на предке**:\n"
    "  `[dir=rtl] .doc-content ul` и `:lang(ar) .doc-content` молча не\n"
    "  срабатывают, когда lang/dir стоят на самом `.doc-content` (режимы,\n"
    "  обогащения), а `[dir=\"rtl\"]` не видит `dir=\"auto\"`. Писать\n"
    "  `X:dir(rtl)` и `X:lang(…)`: псевдоклассы смотрят на вычисленные\n"
    "  направление и язык, откуда бы те ни пришли.\n"
    "- **Правка NEXT-CONTEXT — прогнать check:integration ПОСЛЕ неё**: сторожа\n"
    "  прежних бесед сверяют его строки дословно (4bt — цепочку серий); a409fe2\n"
    "  дописал серию в строку и оставил сторож красным при «зелёном» отчёте.\n"
    "- **Правила письменностей и язык интерфейса**:\n"
    "  `GEN_SCRIPT_CSS` завязаны на `:lang()`, а `<html lang>` ставит\n",
    "FL/D 09: §10 — шрифт письменности в проекте, политоника, правило на элементе",
    marker="«Греческий есть» не значит «политоника есть»",
)

# ── FL/E: NEXT-CONTEXT ──
nc = ROOT / "NEXT-CONTEXT.md"
patch(
    nc,
    "`tests/test-gen-langs-ui.mjs`. 09 §10, «Что оставили правки 2026-11-26».\n",
    "`tests/test-gen-langs-ui.mjs`. 09 §10, «Что оставили правки 2026-11-26».\n"
    "\n"
    "Шрифты — в проекте (вторая правка 2026-11-26): `client/public/fonts`\n"
    "(woff2, сборка `scripts/fonts/vendor-fonts.mjs`, `client/src/fonts.css` —\n"
    "генерат), ссылок на Google Fonts в клиенте нет; политоника\n"
    "древнегреческого — Noto (стеки под `:lang(grc)`); PNG —\n"
    "`server/assets/fonts` + `png-fonts.ts`. Правила письменностей — на\n"
    "`:dir(rtl)` и `:lang()` самого элемента. Экспортированный файл HTML шрифты\n"
    "берёт ссылкой — вшивать ли их в файл, решает владелец (не решено).\n",
    "FL/E NEXT-CONTEXT: шрифты в проекте",
    marker="Шрифты — в проекте (вторая правка 2026-11-26)",
)

print(f"\napplied={applied} skip={skipped} fail={failed}")
sys.exit(1 if failed else 0)
