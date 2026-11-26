#!/usr/bin/env python3
"""Логические свойства CSS вместо привязки к стороне (2026-11-26, вне бесед).

Интерфейс зависит от направления письма (`<html dir>` по языку интерфейса),
поэтому правила клиента пишутся логическими свойствами: `margin-inline-start`
вместо `margin-left`, `text-align: start` вместо `left`. При письме слева
направо логическое свойство вычисляется в то же самое, что физическое, —
вид не меняется; справа налево сторона зеркалится сама.

Модуль — ОДНА таблица равнозначностей на два потребителя:
  * как скрипт — переписывает файлы TARGETS на месте (идемпотентно):
        python3 scripts/checks/css_logical.py            # применить
        python3 scripts/checks/css_logical.py --check    # только отчёт, код 1 при остатке
  * как модуль — `css-parity-audit.py` прогоняет через `to_logical` объявления
    ИСХОДНИКА перед сравнением: порт обязан совпасть с исходником с точностью
    до этой таблицы, и ни на что сверх неё проверка не смягчена.

Что НЕ переводится (остаётся физическим намеренно):
  * `left` / `right` / `inset` — позиционирование. Переводится только у
    селекторов LOGICAL_POSITION (выпадающие списки, счётчик, док, боковая
    панель); у прочих координата физическая: центрирование `left: 50%` с
    `translateX(-50%)`, соединители генеалогического древа, граф, рамка
    термина (её ставит скрипт по координатам);
  * блоки KEEP_BLOCKS: gen-script-css — общий текст клиента и выгрузки,
    сторож 4bu сверяет его побайтно; ui-dir — «Направление интерфейса»,
    где сторона названа физически нарочно; стили выгрузки — исходник дословно.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

SIDE = {"left": "inline-start", "right": "inline-end"}

#: Селекторы (последний составной селектор — целиком), у которых координата
#: `left`/`right`/`inset` зеркалится вместе с интерфейсом.
LOGICAL_POSITION = (
    ".app-sidebar-mobile",
    ".app-lang-switch .app-lang-menu",
    ".notif-count",
    ".notif-dropdown",
    ".discuss-dock",
)

#: Блоки, которые не переписываются: (метка начала, метка конца).
#: gen-script-css — общий текст клиента и выгрузки (4bu, побайтно); ui-dir —
#: блок «Направление интерфейса», где сторона названа физически нарочно.
KEEP_BLOCKS = (
    ("/* gen-script-css: begin", "/* gen-script-css: end */"),
    ("/* ui-dir: begin */", "/* ui-dir: end */"),
)

#: Файлы стилей клиента: globals.css и набор примитивов фаз 5–6 (его правила
#: переносятся в часть 3 дословно — сторожа 4af/4ah, поэтому запись одна).
TARGETS = (
    "client/src/globals.css",
    "docs/fragments-for-conversations/5-6-ui-kit.css",
)


def _split_important(value: str) -> tuple[str, str]:
    m = re.search(r"\s*!important\s*$", value)
    return (value[: m.start()], " !important") if m else (value, "")


def _parts(value: str) -> list[str]:
    """Значения шортката по пробелам верхнего уровня (скобки не рвутся)."""
    out, depth, cur = [], 0, ""
    for ch in value.strip():
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch.isspace() and depth == 0:
            if cur:
                out.append(cur)
                cur = ""
        else:
            cur += ch
    if cur:
        out.append(cur)
    return out


def logical_position(sel: str) -> bool:
    return any(s.strip() in LOGICAL_POSITION for s in sel.split(","))


def to_logical(prop: str, value: str, sel: str = "") -> list[tuple[str, str]] | None:
    """Логическая запись объявления либо None, если оно не привязано к стороне."""
    p = prop.strip().lower()
    val, imp = _split_important(" ".join(value.split()))

    m = re.fullmatch(r"(margin|padding)-(left|right)", p)
    if m:
        return [(f"{m.group(1)}-{SIDE[m.group(2)]}", val + imp)]
    m = re.fullmatch(r"border-(left|right)(-color|-width|-style)?", p)
    if m:
        return [(f"border-{SIDE[m.group(1)]}{m.group(2) or ''}", val + imp)]
    if p == "text-align" and val in ("left", "right"):
        return [(p, ("start" if val == "left" else "end") + imp)]
    if p in ("margin", "padding"):
        parts = _parts(val)
        if len(parts) == 4 and parts[1] != parts[3]:
            top, right, bottom, left = parts
            block = top if top == bottom else f"{top} {bottom}"
            return [(f"{p}-block", block + imp), (f"{p}-inline", f"{left} {right}" + imp)]
    if logical_position(sel):
        if p in ("left", "right"):
            return [(f"inset-{SIDE[p]}", val + imp)]
        if p == "inset":
            parts = _parts(val)
            if len(parts) == 4 and parts[1] != parts[3]:
                top, right, bottom, left = parts
                block = top if top == bottom else f"{top} {bottom}"
                return [("inset-block", block + imp), ("inset-inline", f"{left} {right}" + imp)]
    return None


def logical_decls(decls: dict[str, str], sel: str = "") -> tuple[dict[str, str], int]:
    """Объявления правила в логической записи; второе — сколько переведено."""
    out: dict[str, str] = {}
    mapped = 0
    for prop, value in decls.items():
        conv = to_logical(prop, value, sel)
        if conv is None:
            out[prop] = value
        else:
            mapped += 1
            for p, v in conv:
                out[p] = v
    return out, mapped


def rewrite(css: str) -> tuple[str, int]:
    """Переписать объявления правил логическими; блок gen-script-css — как есть."""
    masked = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), css, flags=re.S)
    kept = [(css.find(b), css.find(e)) for b, e in KEEP_BLOCKS if css.find(b) >= 0]
    edits: list[tuple[int, int, str]] = []
    for rule in re.finditer(r"([^{}]+)\{([^{}]*)\}", masked):
        if any(a <= rule.start(2) <= b for a, b in kept):  # по телу: «селектор» первого правила блока начинается до метки
            continue
        sel = " ".join(rule.group(1).split())
        if sel.startswith("@"):
            continue
        base = rule.start(2)
        for d in re.finditer(r"([A-Za-z-]+)\s*:\s*([^;{}]+?)\s*(;|$)", rule.group(2)):
            conv = to_logical(d.group(1), d.group(2), sel)
            if conv is None:
                continue
            line_start = masked.rfind("\n", 0, base + d.start(1)) + 1
            indent = re.match(r"[ \t]*", masked[line_start:]).group(0)
            text = (";\n" + indent).join(f"{p}: {v}" for p, v in conv)
            edits.append((base + d.start(1), base + d.end(2), text))
    for start, end, text in sorted(edits, reverse=True):
        css = css[:start] + text + css[end:]
    return css, len(edits)


def main() -> int:
    root = Path(__file__).resolve().parents[2]
    check = "--check" in sys.argv
    total = 0
    for rel in TARGETS:
        path = root / rel
        css = path.read_text(encoding="utf-8")
        new, n = rewrite(css)
        total += n
        if n and not check:
            path.write_text(new, encoding="utf-8")
        if n:
            print(f"  {rel}: {n}")
    print(("объявлений с привязкой к стороне: " if check else "переведено объявлений: ") + str(total))
    return 1 if check and total else 0


if __name__ == "__main__":
    sys.exit(main())
