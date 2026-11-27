#!/usr/bin/env python3
"""Патч документации: правка после беседы L.2 (проверка её коммита, 2026-11-27).

Проверка коммита f110093 на свежем клоне подтвердила заявленное главой 08
«Беседа L.2»; замечание одно — девять старых харнессов не попали в правку
порядка путей браузера. Идемпотентный (marker → skip), отчёт
applied/skip/fail. Запуск из корня репозитория:
    python3 scripts/patches/patch-docs-convL2-post.py

  P/A  08 Часть III — запись о проверке и правке.
  P/B  09 §10 «Что L.2 оставила…» — порядок путей держит сторож 4bv.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
D08 = ROOT / "docs" / "08-history.md"
D09 = ROOT / "docs" / "09-lessons.md"
applied = skipped = failed = 0


def patch(path: Path, old: str, new: str, label: str, marker: str) -> None:
    global applied, skipped, failed
    text = path.read_text(encoding="utf-8")
    if marker in text:
        skipped += 1
        print(f"  skip  {label}")
    elif text.count(old) != 1:
        failed += 1
        print(f"  FAIL  {label}: якорь встречается {text.count(old)} раз")
    else:
        path.write_text(text.replace(old, new), encoding="utf-8")
        applied += 1
        print(f"  ok    {label}")


ANCHOR = "> **Правки 2026-11-26 (вне бесед — проверка коммита беседы L.1)**"
ENTRY = """> **Правки 2026-11-27 (вне бесед — проверка коммита беседы L.2)**: коммит
> f110093 проверен на свежем клоне (PostgreSQL 16, Redis, миграции
> 0000…0025, четыре сида): `typecheck` 0, `i18n:split --check` и
> `i18n:check --strict` чисты, `check:integration` — INTEGRATION OK,
> `tests/test-L-requests.mjs` 59 ✓ на es и на fr (Chrome 131), test-114
> 50 ✓, smoke-114 54 ✓; test-112 (4 ✗), test-113 (2 ✗) и смоуки 84, 103,
> 112, 113 — те же красные строки, что до беседы; в таблице, кроме колонки
> es, изменились только пять подписей журнала, названные главой; патч
> доков беседы идемпотентен. Ошибок в коде нет. Замечание одно: «все
> харнессы берут Chrome 131 первым» было неточно — девять старых
> (`test-04-request2…7`, `test-04-ws-smoke`, `test-06-request2-browser`,
> `test-15b-requests2-5`) жёстко звали `/opt/google/chrome/chrome` (в
> песочнице — Chrome 153) и в правку 41 харнесса не попали, потому что
> `CHROME_PATH` не читали. Переведены на тот же порядок: кэш puppeteer 131,
> затем `CHROME_PATH`, затем системный путь; порядок закреплён сторожем
> (4bv, по всем файлам `tests/` с запуском браузера). test-15b на 131 и на
> 153 падает одинаково (ожидание элемента, 10 с) — давно красный, не от
> браузера; харнессы 0.4/0.6 ждут поднятых руками служб и не прогонялись.
> Попутно: отслеживаемый `scripts/checks/__pycache__/*.pyc` (попал в
> 4a6110c) снят с учёта, `__pycache__/` и `*.pyc` — в `.gitignore`: прогон
> `check:integration` иной версией Python пачкал дерево. Серий сторожей и
> миграций правка не заняла. Скрипт —
> scripts/patches/patch-docs-convL2-post.py.

"""
patch(D08, ANCHOR, ENTRY + ANCHOR, "P/A  08 Часть III — проверка коммита L.2",
      marker="**Правки 2026-11-27 (вне бесед — проверка коммита беседы L.2)**")

OLD = "  — запасной (в песочнице он ведёт на Chrome 153); новый харнесс — так же.\n"
NEW = OLD + """  Порядок держит сторож 4bv по всем файлам `tests/` с запуском браузера
  (правка после L.2: девять старых харнессов 0.4/0.6/1.5b звали системный
  путь жёстко — переведены).
"""
patch(D09, OLD, NEW, "P/B  09 §10 — порядок путей браузера держит 4bv",
      marker="Порядок держит сторож 4bv по всем файлам `tests/` с запуском браузера")

print(f"applied {applied}, skip {skipped}, fail {failed}")
sys.exit(1 if failed else 0)
