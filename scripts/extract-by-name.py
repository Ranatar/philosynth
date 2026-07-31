#!/usr/bin/env python3
"""Извлечение фрагментов исходника ПО ИМЕНАМ, а не по номерам строк.

Замена утраченного scripts/extract-fragments.py. Разница принципиальная:
тот резал по баннерам и диапазонам, этот ищет объявления по именам из
карты переиспользования (docs/04-code-reuse-map.md) и сам вычисляет
границы. Номера строк попадают в вывод как СЛЕДСТВИЕ поиска, а не как
входные данные, поэтому фрагмент переживает любую правку исходника.

Запуск:
    python3 scripts/extract-by-name.py SPEC [-o OUT] [--source FILE] [--check]

SPEC — текстовый файл. Пустые строки и строки, начинающиеся с #,
игнорируются. Формат строки:

    js:имяФункции              function имя(…) / async function имя(…)
    var:ИМЯ                    const/let ИМЯ = … (до конца объявления)
    css:.selector              одно CSS-правило (.doc-table, #docTOC, …)
    css*:.префикс              ВСЕ правила, чей селектор содержит префикс
    html:#id                   элемент с данным id и всё его поддерево
    lines:A-B                  явный диапазон — только там, где имени нет
    ## заголовок               подпись к следующей группе

--check — не писать файл, а только доложить, что найдено и где.

Скобочный баланс считается сканером, знающим про строки ('"`),
комментарии (// и /* */) и не путающимся на скобках внутри них.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

DEFAULT_SOURCE = "source/philosynth.html"


# ────────────────────────────────────────────────────────────────
# Сканер: где в тексте «код», а где строка/комментарий
# ────────────────────────────────────────────────────────────────
def code_mask(text: str) -> list[bool]:
    """True на позициях, которые являются кодом (не строка и не комментарий)."""
    mask = [True] * len(text)
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            j = text.find("\n", i)
            j = n if j < 0 else j
            for k in range(i, j):
                mask[k] = False
            i = j
        elif c == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            for k in range(i, j):
                mask[k] = False
            i = j
        elif c in "'\"`":
            quote, j = c, i + 1
            while j < n:
                if text[j] == "\\":
                    j += 2
                    continue
                if text[j] == quote:
                    j += 1
                    break
                j += 1
            for k in range(i, min(j, n)):
                mask[k] = False
            i = j
        else:
            i += 1
    return mask


def match_block(text: str, mask: list[bool], start: int, opener: str = "{") -> int:
    """От start ищет первую opener-скобку в коде и возвращает индекс ПОСЛЕ парной."""
    closer = {"{": "}", "(": ")", "[": "]"}[opener]
    i, n = start, len(text)
    while i < n and not (text[i] == opener and mask[i]):
        i += 1
    if i >= n:
        return -1
    depth = 0
    while i < n:
        if mask[i]:
            if text[i] == opener:
                depth += 1
            elif text[i] == closer:
                depth -= 1
                if depth == 0:
                    return i + 1
        i += 1
    return -1


def stmt_end(text: str, mask: list[bool], start: int) -> int:
    """Конец объявления const/let: точка с запятой на нулевой глубине."""
    depth, i, n = 0, start, len(text)
    while i < n:
        if mask[i]:
            if text[i] in "{[(":
                depth += 1
            elif text[i] in "}])":
                depth -= 1
            elif text[i] == ";" and depth == 0:
                return i + 1
            elif text[i] == "\n" and depth == 0 and i > start:
                nxt = text[i + 1:i + 400]
                if re.match(r'\s*(?:function|const|let|var|async|/[/*]|</script)', nxt):
                    return i
        i += 1
    return n


def line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


# ────────────────────────────────────────────────────────────────
# Искатели по видам целей
# ────────────────────────────────────────────────────────────────
def find_js(text, mask, name, lo=0, hi=None):
    pat = re.compile(r'(?:^|\n)(\s*)(?:async\s+)?function\s+' + re.escape(name) + r'\s*\(')
    hi = len(text) if hi is None else hi
    for m in pat.finditer(text, lo, hi):
        beg = m.start() + 1 if text[m.start()] == "\n" else m.start()
        if not mask[beg]:
            continue
        end = match_block(text, mask, m.end() - 1, "{")
        if end > 0:
            return beg, end
    return None


def find_var(text, mask, name, lo=0, hi=None):
    pat = re.compile(r'(?:^|\n)(\s*)(?:const|let|var)\s+' + re.escape(name) + r'\s*=')
    hi = len(text) if hi is None else hi
    for m in pat.finditer(text, lo, hi):
        beg = m.start() + 1 if text[m.start()] == "\n" else m.start()
        if not mask[beg]:
            continue
        return beg, stmt_end(text, mask, m.end())
    # продолжение списка объявлений: «prev = …,\n  ИМЯ = …»
    cont = re.compile(r'\n([ \t]*)' + re.escape(name) + r'\s*=')
    for m in cont.finditer(text, lo, hi):
        beg = m.start() + 1
        if not mask[beg]:
            continue
        prev = text.rfind("\n", 0, m.start())
        prev_line = text[text.rfind("\n", 0, prev) + 1:prev].rstrip()
        if not prev_line.endswith(","):
            continue
        end = stmt_end(text, mask, m.end())
        return beg, end
    return None


CSS_RULE = re.compile(r'(?:^|\n)([ \t]*)([^\n{}]*?)\{', re.M)


def find_css(text, mask, selector, prefix, lo=0, hi=None):
    out = []
    hi = len(text) if hi is None else hi
    for m in CSS_RULE.finditer(text, lo, hi):
        sel = m.group(2).strip()
        if not sel or sel.startswith("@") or "(" in sel and "{" not in sel and "," not in sel and " " not in sel:
            pass
        hit = (selector in sel) if prefix else any(
            s.strip() == selector for s in sel.split(",")
        )
        if not hit:
            continue
        beg = m.start() + 1 if text[m.start()] == "\n" else m.start()
        end = match_block(text, mask, m.end() - 1, "{")
        if end > 0:
            out.append((beg, end))
        if not prefix and out:
            break
    return out


def find_html(text, id_, lo=0, hi=None):
    m = re.compile(r'<(\w+)[^>]*\bid="' + re.escape(id_) + r'"').search(text, lo, len(text) if hi is None else hi)
    if not m:
        return None
    tag = m.group(1)
    beg = text.rfind("\n", 0, m.start()) + 1
    depth, i = 0, m.start()
    open_pat = re.compile(r'<' + tag + r'\b', re.I)
    close_pat = re.compile(r'</' + tag + r'\s*>', re.I)
    while i < len(text):
        o = open_pat.search(text, i)
        c = close_pat.search(text, i)
        if not c:
            return None
        if o and o.start() < c.start():
            depth += 1
            i = o.end()
        else:
            depth -= 1
            i = c.end()
            if depth == 0:
                return beg, i
    return None


# ────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("-o", "--out")
    ap.add_argument("--source", default=DEFAULT_SOURCE)
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()

    src = Path(a.source)
    if not src.exists():
        print(f"нет исходника: {src}", file=sys.stderr)
        return 2
    text = src.read_text(encoding="utf-8")
    mask = code_mask(text)
    total_lines = text.count("\n") + 1

    parts, caption, missing, found = [], None, [], 0
    lo, hi = 0, len(text)
    for raw in Path(a.spec).read_text(encoding="utf-8").split("\n"):
        line = raw.strip()
        if not line or (line.startswith("#") and not line.startswith("##")):
            continue
        if line.startswith("##"):
            caption = line.lstrip("#").strip()
            continue
        if line.startswith("scope:"):
            body = line[6:].strip()
            if body == "all":
                lo, hi = 0, len(text)
            else:
                a_re, _, b_re = body.partition("..")
                ma = re.search(a_re.strip(), text)
                mb = re.search(b_re.strip(), text[ma.end():]) if ma else None
                if not ma or not mb:
                    print(f"  НЕТ  область {body}", file=sys.stderr)
                    missing.append(line); continue
                lo, hi = ma.start(), ma.end() + mb.start()
                print(f"  область: строки {line_of(text, lo)}–{line_of(text, hi)}")
            continue
        kind, _, target = line.partition(":")
        spans: list[tuple[int, int]] = []
        if kind == "js":
            r = find_js(text, mask, target, lo, hi)
            spans = [r] if r else []
        elif kind == "var":
            r = find_var(text, mask, target, lo, hi)
            spans = [r] if r else []
        elif kind in ("css", "css*"):
            spans = find_css(text, mask, target, kind == "css*", lo, hi)
        elif kind == "html":
            r = find_html(text, target.lstrip("#"), lo, hi)
            spans = [r] if r else []
        elif kind == "lines":
            lo, _, hi = target.partition("-")
            off = [0]
            for ln in text.split("\n"):
                off.append(off[-1] + len(ln) + 1)
            spans = [(off[int(lo) - 1], off[int(hi)] - 1)]
        else:
            print(f"неизвестный вид цели: {line}", file=sys.stderr)
            return 2

        if not spans:
            missing.append(line)
            continue
        for beg, end in spans:
            found += 1
            a_ln, b_ln = line_of(text, beg), line_of(text, end - 1)
            head = f"// ───── {caption + ' · ' if caption else ''}{line}"
            head += f"\n// philosynth.html строки {a_ln}–{b_ln} ─────"
            parts.append(head + "\n" + text[beg:end].rstrip("\n"))
            if a.check:
                print(f"  OK   {line:44} строки {a_ln}–{b_ln}")

    for m in missing:
        print(f"  НЕТ  {m}", file=sys.stderr)
    print(f"\nнайдено целей: {found}, не найдено: {len(missing)}"
          f" (исходник: {total_lines} строк)")

    if a.check:
        return 1 if missing else 0
    if missing:
        print("фрагмент не записан: сперва исправьте спецификацию", file=sys.stderr)
        return 1

    banner = (
        f"// Фрагмент philosynth.html ({total_lines} строк) — собран\n"
        f"// scripts/extract-by-name.py по спецификации {Path(a.spec).name}.\n"
        "//\n"
        "// Номера строк ниже — РЕЗУЛЬТАТ поиска по именам, а не входные\n"
        "// данные: при правке исходника достаточно перезапустить сборку,\n"
        "// спецификация не устаревает. Имена берутся из\n"
        "// docs/04-code-reuse-map.md.\n"
    )
    out = Path(a.out) if a.out else Path(a.spec).with_suffix(".js")
    out.write_text(banner + "\n" + "\n\n".join(parts) + "\n", encoding="utf-8")
    print(f"записано: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
