#!/usr/bin/env python3
"""
Аудит паритета оформления: philosynth.html (исходник) ↔ сервис (client + export).

Отвечает на четыре вопроса, каждый — механически проверяемый:

  A. Покрытие правил. Какие правила CSS исходника имеют соответствие
     в client/src/globals.css, а какие — нет. Группировка по секционным
     комментариям исходника, чтобы видеть не список селекторов, а блоки
     интерфейса.
  B. Расхождения внутри совпавших правил. Для одноимённых селекторов —
     свойства, которых нет в порте, и свойства с изменённым значением.
     Это и есть «упрощения», в отличие от «упущений» пункта A.
  C. Висячие классы. Классы в разметке клиента (не Tailwind), под которые
     нет ни одного правила: элемент рисуется браузерным дефолтом.
  D. Экспорт. Совпадает ли EXPORT_SOURCE_RAW_CSS в
     server/config/export-assets.ts с блоком <style> исходника побайтово.

Запуск из корня репозитория:  python3 css-parity-audit.py
Ключи:  --source, --client, --export, --limit
"""

from __future__ import annotations

import argparse
import collections
import json
import os
import re
import sys

# ──────────────────────────────────────────────────────────────────────────
# Разбор CSS
# ──────────────────────────────────────────────────────────────────────────

COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)


def strip_comments(text: str) -> str:
    return COMMENT_RE.sub(lambda m: "\n" * m.group(0).count("\n"), text)


def parse_css(text: str) -> list[dict]:
    """Плоский список правил: {ctx, sel, decls, line}.

    ctx — цепочка @media/@layer/@supports, в которой лежит правило.
    Достаточно для сравнения; вложенности CSS-nesting в обоих файлах нет.
    """
    css = strip_comments(text)
    rules: list[dict] = []
    stack: list[str] = []
    buf = ""
    line = 1
    i, n = 0, len(css)
    while i < n:
        ch = css[i]
        if ch == "\n":
            line += 1
        if ch == "{":
            sel = " ".join(buf.split())
            buf = ""
            if sel.startswith("@") and not sel.startswith(("@font-face", "@page")):
                stack.append(sel)
            else:
                depth, body = 1, ""
                i += 1
                while i < n and depth > 0:
                    c = css[i]
                    if c == "{":
                        depth += 1
                    elif c == "}":
                        depth -= 1
                        if depth == 0:
                            break
                    if c == "\n":
                        line += 1
                    body += c
                    i += 1
                decls: dict[str, str] = {}
                for part in body.split(";"):
                    if ":" in part:
                        prop, val = part.split(":", 1)
                        prop = prop.strip()
                        if prop:
                            decls[prop] = " ".join(val.split())
                rules.append(
                    {
                        "ctx": " ".join(stack),
                        "sel": normalize_selector(sel),
                        "decls": decls,
                        "line": line,
                    }
                )
        elif ch == "}":
            if stack:
                stack.pop()
            buf = ""
        elif ch == ";" and not buf.lstrip().startswith("@media"):
            # @tailwind / @import — директивы без блока: сбрасываем накопленный
            # селектор, иначе они прилипают к следующему правилу.
            buf = ""
        else:
            buf += ch
        i += 1
    return rules


def normalize_selector(sel: str) -> str:
    return " ".join(sel.replace(", ", ",").split())


def classes_of(sel: str) -> set[str]:
    return set(re.findall(r"\.([A-Za-z0-9_-]+)", sel))


def rule_key(rule: dict) -> tuple[str, str]:
    return (" ".join(rule["ctx"].split()), rule["sel"])


# ──────────────────────────────────────────────────────────────────────────
# Извлечение стилей исходника
# ──────────────────────────────────────────────────────────────────────────


def extract_source_css(path: str) -> str:
    html = open(path, encoding="utf-8").read()
    start = html.index("<style>") + len("<style>")
    end = html.index("</style>", start)
    return html[start:end]


def section_headers(text: str) -> list[tuple[int, str]]:
    return [(m.start(), " ".join(m.group(0)[2:-2].split())) for m in COMMENT_RE.finditer(text)]


def header_index(text: str) -> callable:
    heads = section_headers(text)
    offsets = [0]
    for line in text.split("\n"):
        offsets.append(offsets[-1] + len(line) + 1)

    def lookup(line_no: int) -> str:
        pos = offsets[max(0, line_no - 1)]
        found = "(шапка файла)"
        for start, title in heads:
            if start < pos:
                found = title
            else:
                break
        return found

    return lookup


# ──────────────────────────────────────────────────────────────────────────
# Разбор разметки клиента
# ──────────────────────────────────────────────────────────────────────────

TAILWIND_RE = re.compile(
    r"^(?:[a-z]+:)*(?:-?(?:m|p)[trblxy]?-|text-|bg-|border|rounded|flex|grid|gap|items|justify"
    r"|w-|h-|min-|max-|space-|font-|leading|tracking|truncate|line-clamp|overflow|absolute"
    r"|relative|fixed|sticky|inset|top-|left-|right-|bottom-|z-|opacity|hover|focus|cursor"
    r"|select|shrink|grow|whitespace|break-|shadow|transition|accent-|list-|align-|table"
    r"|block|inline|hidden|underline|no-underline|uppercase|lowercase|capitalize|tabular-nums"
    r"|resize|appearance|placeholder|disabled|group|peer|col-|row-|order-|self-|content-"
    r"|divide-|ring-|outline|backdrop|animate|duration|ease-|scale-|rotate-|translate-"
    r"|origin-|object-|aspect-|basis-|first|last|odd|even|md|sm|lg|xl|dark|print|sr-only"
    r"|pointer-events|touch-|scroll-|snap-|caret-|fill-|stroke-|from-|to-|via-)"
)

CLASSNAME_RE = re.compile(r"className=")

STRING_RE = re.compile(r"\"([^\"\n]*)\"|'([^'\n]*)'|`([^`]*)`", re.S)


def class_literals(text: str) -> list[str]:
    """Строковые литералы из всех className= в файле.

    className={cond ? "a" : "b"} — берём только литералы, идентификаторы
    выражения (cond) классами не являются.
    """
    out: list[str] = []
    for m in CLASSNAME_RE.finditer(text):
        i = m.end()
        while i < len(text) and text[i].isspace():
            i += 1
        if i >= len(text):
            continue
        if text[i] in "\"'`":
            lit = STRING_RE.match(text, i)
            if lit:
                out.append(next(g for g in lit.groups() if g is not None))
            continue
        if text[i] != "{":
            continue
        depth, j = 1, i + 1
        while j < len(text) and depth > 0:
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
            j += 1
        for lit in STRING_RE.finditer(text[i:j]):
            out.append(next(g for g in lit.groups() if g is not None))
    return out


def markup_classes(client_dir: str) -> dict[str, set[str]]:
    used: dict[str, set[str]] = {}
    for root, _dirs, files in os.walk(client_dir):
        for name in files:
            if not name.endswith((".tsx", ".ts")):
                continue
            path = os.path.join(root, name)
            text = open(path, encoding="utf-8").read()
            for chunk in class_literals(text):
                for token in chunk.split():
                    if "[" in token or "${" in token:
                        continue
                    if not re.fullmatch(r"[a-z][a-z0-9_-]*", token):
                        continue
                    if TAILWIND_RE.match(token):
                        continue
                    used.setdefault(token, set()).add(os.path.relpath(path, client_dir))
    return used


# ──────────────────────────────────────────────────────────────────────────
# Отчёты
# ──────────────────────────────────────────────────────────────────────────


def report_coverage(source_rules, target_classes, target_keys, lookup) -> list[dict]:
    groups: "collections.OrderedDict[str, list[dict]]" = collections.OrderedDict()
    for rule in source_rules:
        groups.setdefault(lookup(rule["line"])[:52], []).append(rule)

    print("\n═══ A. Покрытие правил исходника в globals.css ═══\n")
    print(f"{'блок исходника':54} {'всего':>6} {'нет':>5}")
    missing_all: list[dict] = []
    for title, rules in groups.items():
        missing = [r for r in rules if not covered(r, target_classes, target_keys)]
        missing_all.extend(missing)
        flag = "  ←" if missing else ""
        print(f"{title:54} {len(rules):6} {len(missing):5}{flag}")
    return missing_all


def covered(rule, target_classes, target_keys) -> bool:
    if rule_key(rule) in target_keys:
        return True
    cls = classes_of(rule["sel"])
    return bool(cls) and cls <= target_classes


def report_missing(missing, lookup, limit: int) -> None:
    print("\n─── непокрытые селекторы (по блокам) ───")
    groups: "collections.OrderedDict[str, list[str]]" = collections.OrderedDict()
    for rule in missing:
        label = (rule["ctx"] + " » " if rule["ctx"] else "") + rule["sel"]
        groups.setdefault(lookup(rule["line"])[:52], []).append(label)
    for title, sels in groups.items():
        print(f"\n  {title}  ({len(sels)})")
        for sel in sels[:limit]:
            print(f"    {sel}")
        if len(sels) > limit:
            print(f"    … ещё {len(sels) - limit}")


def report_diffs(source_rules, target_rules) -> None:
    merged: dict[tuple[str, str], dict[str, str]] = {}
    for rule in target_rules:
        merged.setdefault(rule_key(rule), {}).update(rule["decls"])
    print("\n═══ B. Расхождения внутри совпавших правил ═══\n")
    count = 0
    for rule in source_rules:
        key = rule_key(rule)
        if key not in merged:
            continue
        target = merged[key]
        dropped = [p for p in rule["decls"] if p not in target]
        changed = [
            (p, rule["decls"][p], target[p])
            for p in rule["decls"]
            if p in target and target[p] != rule["decls"][p]
        ]
        if not dropped and not changed:
            continue
        count += 1
        parts = []
        if dropped:
            parts.append("нет: " + ", ".join(dropped))
        if changed:
            parts.append("иначе: " + ", ".join(f"{p} {a} → {b}" for p, a, b in changed))
        print(f"  {rule['sel']}\n      " + "\n      ".join(parts))
    print(f"\n  итого правил с расхождениями: {count}")


def report_dangling(client_dir, target_classes, source_classes) -> None:
    print("\n═══ C. Классы разметки без правил CSS ═══\n")
    used = markup_classes(client_dir)
    dangling = {k: v for k, v in used.items() if k not in target_classes}
    if not dangling:
        print("  нет")
    for name, files in sorted(dangling.items()):
        origin = "есть в исходнике" if name in source_classes else "нет и в исходнике"
        print(f"  {name:26} {origin:18} {', '.join(sorted(files)[:3])}")
    print(f"\n  классов вне Tailwind в разметке: {len(used)}, без правил: {len(dangling)}")


def report_export(export_path: str, source_css: str) -> None:
    print("\n═══ D. CSS выгружаемого документа ═══\n")
    if not os.path.exists(export_path):
        print(f"  файл не найден: {export_path}")
        return
    text = open(export_path, encoding="utf-8").read()
    # Имя встречается и в шапке модуля — ищем именно объявление.
    decl = re.search(r"EXPORT_SOURCE_RAW_CSS\s*:\s*string\s*=", text)
    if not decl:
        print("  объявление EXPORT_SOURCE_RAW_CSS не найдено")
        return
    # Регулярка для самого литерала не годится: строка содержит экранированные
    # кавычки, жадный шаблон уходит в соседние константы. Декодируем как JSON.
    quote = text.index('"', decl.end())
    exported, _end = json.JSONDecoder().raw_decode(text, quote)
    if exported.strip() == source_css.strip():
        print("  совпадает с блоком <style> исходника (с точностью до краевых пробелов)")
    elif exported.strip() in source_css:
        print("  является подстрокой исходника, но не всем блоком — проверить границы")
    else:
        print(f"  РАСХОЖДЕНИЕ: {len(exported)} симв. против {len(source_css)} в исходнике")


# ──────────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default="source/philosynth.html")
    parser.add_argument("--client", default="client/src")
    parser.add_argument("--globals", default="client/src/globals.css")
    parser.add_argument("--export", default="server/config/export-assets.ts")
    parser.add_argument("--limit", type=int, default=40, help="селекторов на блок в списке")
    args = parser.parse_args()

    source_css = extract_source_css(args.source)
    lookup = header_index(source_css)
    source_rules = parse_css(source_css)
    target_rules = parse_css(open(args.globals, encoding="utf-8").read())

    target_keys = set(map(rule_key, target_rules))
    target_classes: set[str] = set()
    for rule in target_rules:
        target_classes |= classes_of(rule["sel"])
    source_classes: set[str] = set()
    for rule in source_rules:
        source_classes |= classes_of(rule["sel"])

    print(f"правил: исходник {len(source_rules)}, globals.css {len(target_rules)}")
    print(f"классов: исходник {len(source_classes)}, globals.css {len(target_classes)}")

    missing = report_coverage(source_rules, target_classes, target_keys, lookup)
    report_missing(missing, lookup, args.limit)
    report_diffs(source_rules, target_rules)
    report_dangling(args.client, target_classes, source_classes)
    report_export(args.export, source_css)

    print(f"\nитог: непокрытых правил {len(missing)} из {len(source_rules)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
