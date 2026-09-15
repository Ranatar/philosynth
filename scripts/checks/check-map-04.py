#!/usr/bin/env python3
"""Сверка карты 04 с фактическим размещением кода в репозитории.

Карта `docs/04-code-reuse-map.md` работает как ИНДЕКС: по ней беседы
делают ревью на завершении, на неё ссылаются спецификации комплектов
(`docs/fragments-for-conversations/*.spec`). Индекс, называющий не тот
модуль, обходится дороже своей величины, поэтому размещение проверяется
машинно.

Что делает скрипт:

  1. Читает строки таблиц карты. Слева — идентификаторы в обратных
     кавычках, справа — адрес: явный путь, «там же» (наследует адрес
     предыдущей строки) или проза с именем файла.
  2. Оставляет только идентификаторы, ОБЪЯВЛЕННЫЕ в `source/philosynth.html`
     (новый код и имена таблиц БД не проверяются).
  3. Для каждого идентификатора ищет его в названных модулях. Модуль,
     которого ещё нет на диске, означает непроведённую беседу — такая
     строка идёт в раздел «ждут своей беседы», а не в ошибки.
  4. Отдельно ищет идентификатор ПО ВСЕМУ репозиторию: если он там есть,
     но не в названном модуле, — это расхождение карты с фактом, самый
     ценный улов.

Запуск из корня репо:  python3 scripts/check-map-04.py [-v]
Код возврата: 0 — расхождений нет, 1 — есть.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

MAP = Path("docs/04-code-reuse-map.md")
SRC = Path("source/philosynth.html")

CODE_DIRS = ("server", "client/src", "packages/shared", "scripts")
CODE_EXT = (".ts", ".tsx", ".mts", ".mjs")

# Правая колонка, означающая «портировать нечего»
NO_PORT = (
    "не портир", "НЕ портир", "новое", "Новое", "TODO", "удалён",
    "заменя", "React state sync", "не переносится", "запрещ",
)


DECL = ("export function", "export async function", "function", "export const",
        "const", "export class", "class", "export let", "let", "export type",
        "type", "export interface", "interface", "export enum", "enum")


def declared(name: str, text: str) -> bool:
    """Идентификатор ОБЪЯВЛЕН в тексте (а не просто упомянут в комментарии)."""
    pat = (r"(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class|type"
           r"|interface|enum)\s+" + re.escape(name) + r"\b")
    return re.search(pat, text) is not None


def repo_files() -> dict[str, str]:
    out: dict[str, str] = {}
    for d in CODE_DIRS:
        for root, _dirs, files in os.walk(d):
            if "node_modules" in root:
                continue
            for f in files:
                if f.endswith(CODE_EXT):
                    p = os.path.join(root, f)
                    out[p] = Path(p).read_text(encoding="utf-8", errors="ignore")
    return out


def resolve(path: str, files: dict[str, str]) -> str | None:
    """Путь из карты → фактический путь в репо (карта пишет client/ и
    shared/, на диске — client/src/ и packages/shared/)."""
    cands = [path]
    if path.startswith("client/") and not path.startswith("client/src/"):
        cands.append("client/src/" + path[len("client/"):])
    if path.startswith("shared/"):
        cands.append("packages/" + path)
    for c in cands:
        if c in files:
            return c
    return None


def by_basename(name: str, files: dict[str, str]) -> list[str]:
    return [p for p in files if os.path.basename(p) == name]


def main() -> int:
    verbose = "-v" in sys.argv
    files = repo_files()
    src = SRC.read_text(encoding="utf-8")
    text = MAP.read_text(encoding="utf-8")

    rows = re.findall(r"(?m)^\|([^|\n]+)\|([^|\n]+)\|\s*$", text)
    rows = [r for r in rows if not r[0].strip().startswith("---")
            and "Функция" not in r[0] and "Объект" not in r[0]]

    prev_mods: list[str] = []
    prev_raw = ""
    mismatch: list[tuple[str, str, str]] = []   # id, адрес карты, где найдено
    pending: list[tuple[str, str]] = []          # id, адрес (беседа не проведена)
    checked = 0
    unresolved: list[tuple[str, str]] = []

    for left, right in rows:
        ids = re.findall(r"`([A-Za-z_][\w$]{2,})\(?\)?`", left)
        ids = [i for i in ids
               if re.search(r"(?:function|const|let|var|class)\s+" + re.escape(i) + r"\b", src)]

        raw = right.strip()
        paths = re.findall(r"`([\w./\-]+\.tsx?)`", raw)
        # Проза без обратных кавычек: «серверная оркестрация —
        # generation-service», «React-компоненты GraphViewer, NodePanel».
        # Имена модулей и компонентов достраиваются до имён файлов.
        for kebab in re.findall(r"\b([a-z][\w]*(?:-[\w]+)+)\b", raw):
            if kebab.endswith((".ts", ".tsx")):
                continue
            if by_basename(kebab + ".ts", files):
                paths.append(kebab + ".ts")
        for camel in re.findall(r"\b([A-Z][a-zA-Z0-9]{3,})\b", raw):
            if by_basename(camel + ".tsx", files):
                paths.append(camel + ".tsx")

        mods: list[str] = []
        for p in paths:
            r = resolve(p, files)
            if r:
                mods.append(r)
            elif "/" not in p:                      # только имя файла в прозе
                mods.extend(by_basename(p, files))
            else:
                mods.append("<нет на диске: %s>" % p)

        if "там же" in raw:
            # «там же + путь» означает ОБА адреса, а не только явный
            mods = list(prev_mods) + mods
            raw = prev_raw + " + " + raw if prev_raw else raw
        elif mods:
            prev_mods, prev_raw = list(mods), raw

        if not ids:
            continue
        if any(k in raw for k in NO_PORT):
            continue
        if not mods:
            unresolved.extend((i, raw[:70]) for i in ids)
            continue

        real = [m for m in mods if not m.startswith("<")]
        blob = "\n".join(files[m] for m in real)
        for i in ids:
            checked += 1
            if real and (declared(i, blob) or re.search(r"\b" + re.escape(i) + r"\b", blob)):
                continue
            where = [p for p, t in files.items() if declared(i, t)]
            if where:
                mismatch.append((i, raw[:70], ", ".join(where[:3])))
            else:
                pending.append((i, raw[:70]))

    print(f"строк-таблиц: {len(rows)}; сверено идентификаторов: {checked}")
    print(f"расхождений карты с фактом: {len(mismatch)}")
    for i, addr, where in mismatch:
        print(f"  РАСХОЖДЕНИЕ  {i}")
        print(f"      карта:  {addr}")
        print(f"      факт:   {where}")
    print(f"ждут своей беседы (нет в коде вовсе): {len(pending)}")
    if verbose:
        for i, addr in pending:
            print(f"      {i:32} → {addr}")
    print(f"адрес не распознан: {len(unresolved)}")
    if verbose:
        for i, addr in unresolved:
            print(f"      {i:32} → {addr}")
    return 1 if mismatch else 0


if __name__ == "__main__":
    raise SystemExit(main())
