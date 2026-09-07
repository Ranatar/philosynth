#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Свод истории разработки в два файла (идемпотентно).

  docs/08-history.md  — единственное место хроники:
      Часть I   — краткая хроника по беседам (переехала из README)
      Часть II  — подробные итоги бесед (переехали из NEXT-CONTEXT,
                  без разделов «Знания/грабли»)
      Часть III — журнал правок протокола и доков (шапка 07)

  docs/09-lessons.md  — уроки и грабли, разложенные по темам
      (переехали из 33 разделов «Знания/грабли» NEXT-CONTEXT,
      дословно, с сохранением привязки к беседе)

Из источников история удаляется:
  README.md              — раздел «Статус» (425 строк) → короткая таблица фаз
  docs/07-...protocol.md — шапка «Правки …» (342 строки) → указатель на 08
  NEXT-CONTEXT.md        — перезаписан: только живые правила и комплект
                           следующей беседы

Отчёт: applied/skip/fail + приёмка (каждый перенесённый блок ищется в
приёмнике дословно и проверяется на отсутствие в источнике).
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

README = os.path.join(ROOT, "README.md")
PROTO = os.path.join(ROOT, "docs", "07-conversation-protocol.md")
NEXTC = os.path.join(ROOT, "NEXT-CONTEXT.md")
HIST = os.path.join(ROOT, "docs", "08-history.md")
LESS = os.path.join(ROOT, "docs", "09-lessons.md")

applied, skipped, failed = [], [], []


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def write(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


# ─────────────────────────────────────────────────────────────────────
# Темы для 09-lessons.md. Порядок = приоритет классификации.
# ─────────────────────────────────────────────────────────────────────
THEMES = [
    ("env", "1. Окружение, демоны, пакеты", [
        "apt-get", "nodesource", "postgres", "pg_ctlcluster", "redis-server",
        "sudo", "npm install", ".npmrc", "песочниц", "egress", "демон",
        "контейнер", "/opt/google", ".cache/puppeteer", "переживают",
        "переживает", "nohup", "фонов",
    ]),
    ("docs", "2. Патч-скрипты доков и оснастка извлечения", [
        "patch-docs", "extract-by-name", "extract-fragments", "идемпотент",
        "str.replace", "re.sub", ".spec", "патч(", "патч-скрипт", "фрагмент",
        "комплект", "баннер",
    ]),
    ("db", "3. PostgreSQL, Drizzle, данные", [
        "jsonb", "drizzle", "миграци", "ON DELETE", "RESTRICT", "CASCADE",
        "postgres.js", "CTE", "pg_trgm", "FK", "SQL", "транзакц", "схем",
        "колонк", "таблиц", "seed", "сид",
    ]),
    ("tests", "4. Тесты, харнессы, браузер", [
        "puppeteer", "браузер", "Chrome", "Chromium", "jsdom", "смоук",
        "mini-Hono", "мок", "тест", "стенд", "харнесс", "ожидан", "клик",
        "innerText", "селектор", "прогон",
    ]),
    ("ts", "5. Node, TypeScript, сборка", [
        "tsc", "tsconfig", "tsx", "typecheck", "vite", "ESM", "импорт",
        "экспорт", "strip", "NodeNext", "workspace", "package.json",
        "event loop", "зависан",
    ]),
    ("client", "6. Клиент: React, состояние, CSS", [
        "React", "StrictMode", "Tailwind", "CSS", "globals", "store",
        "компонент", "DOM", "useEffect", "setState", "рендер", "модал",
        "капител", "медиа", "шрифт",
    ]),
    ("server", "7. Сервер: стрим, WS, Redis, Registry", [
        "WebSocket", " WS", "SSE", "стрим", "Redis", "Registry", "промпт",
        "кэш", "rate-limit", "сесси", "middleware", "роут",
    ]),
    ("misc", "8. Прочее", []),
]


def classify(text):
    low = text.lower()
    for key, _title, words in THEMES:
        for w in words:
            if w.lower() in low:
                return key
    return "misc"


def split_bullets(body_lines):
    """Разбить тело раздела на блоки: маркированный пункт со всеми его
    продолжениями (или абзац до первого пункта)."""
    blocks, cur = [], []
    for line in body_lines:
        if re.match(r"^[-*] ", line):
            if cur:
                blocks.append("\n".join(cur).rstrip())
            cur = [line]
        else:
            cur.append(line)
    if cur:
        blocks.append("\n".join(cur).rstrip())
    return [b for b in blocks if b.strip()]


def chap_label(head):
    """Короткая пометка беседы-источника для 09."""
    m = re.search(r"[Бб]еседа\s+(\d+\.\d+[a-zA-Zа-я]?)", head)
    if m:
        return "Беседа " + m.group(1)
    return re.sub(r"^#+\s*", "", head).strip(" ═").strip()


def demote(line):
    """Понизить markdown-заголовок на два уровня: главы NEXT-CONTEXT
    становятся детьми «Части II» файла истории."""
    m = re.match(r"^(#{1,4}) (.*)$", line)
    return "##" + line if m else line


# ─────────────────────────────────────────────────────────────────────
def main():
    for p in (README, PROTO, NEXTC):
        if not os.path.exists(p):
            failed.append(f"нет файла {p}")
            report()
            return 1

    readme = read(README)
    proto = read(PROTO)
    nextc = read(NEXTC)

    already = os.path.exists(HIST) and os.path.exists(LESS)
    readme_clean = "- **0.1 — скелет монорепо + БД.**" not in readme
    proto_clean = "> **Правки 2026-09-07 (итоги беседы 7.1)**" not in proto
    nextc_clean = nextc.lstrip().startswith("# NEXT-CONTEXT")

    if already and readme_clean and proto_clean and nextc_clean:
        for name in ("docs/08-history.md", "docs/09-lessons.md", "README.md",
                     "docs/07-conversation-protocol.md", "NEXT-CONTEXT.md"):
            skipped.append(name)
        report()
        return 0
    if already or readme_clean or proto_clean or nextc_clean:
        failed.append("частично применённое состояние — нужен ручной разбор "
                      f"(08/09={already}, README={readme_clean}, "
                      f"07={proto_clean}, NEXT={nextc_clean})")
        report()
        return 1

    moved = []      # (метка, текст) — что должно оказаться в приёмнике
    removed = []    # (метка, текст, источник) — чего не должно остаться

    # ── 1. README: вырезать хронику ──────────────────────────────────
    r_start = readme.index("## Статус: Фазы 0–7 завершены")
    r_end = readme.index("### Единство стилей с исходником")
    readme_status_line = readme[r_start:readme.index("\n", r_start)]
    readme_chronicle = readme[readme.index("\n", r_start) + 1:r_end].strip("\n")

    new_status = """## Статус: Фазы 0–7 завершены

| Фаза | Беседы | Закрыта |
|---|---|---|
| 0 — инфраструктура | 0.1–0.6, 0.3b | 2026-07-24 |
| 1 — MVP | 1.1–1.7, 1.4b, 1.5b, 1.6b | 2026-08-04 |
| 2 — редактирование и каскады | 2.1, 2.2, 2.4, 2.3 | 2026-08-20 |
| 3 — мета-синтез и наследование | 3.1, 3.2 | 2026-08-21 |
| 4 — режимы, экспорт, импорт | 4.1, 4.2, 4.3 | 2026-08-30 |
| 5 — inline-редактирование элементов | 5.1–5.5 | 2026-09-06 |
| 6 — биллинг и админка | 6.1, 6.2 | 2026-09-07 |
| 7 — долги и доводка | 7.1 | 2026-09-07 |

Реестр открытых долгов (07 §12) пуст; протокол бесед после 7.1 пуст —
следующий шаг возможен только как открытие Фазы 8.

Подробности: `docs/08-history.md` — единственное место хроники
(Часть I — краткая по беседам, Часть II — итоги бесед, Часть III —
журнал правок доков). Грабли и уроки, годные вне даты, —
`docs/09-lessons.md`. Контекст ближайшей беседы — `NEXT-CONTEXT.md`.

"""
    readme_new = readme[:r_start] + new_status + "## Единство стилей с исходником" + \
        readme[r_end + len("### Единство стилей с исходником"):]
    readme_new = readme_new.replace(
        "Итоги бесед и комплекты контекста для следующих —\n`NEXT-CONTEXT.md`.",
        "История разработки — `docs/08-history.md`, грабли и уроки —\n"
        "`docs/09-lessons.md`, контекст ближайшей беседы — `NEXT-CONTEXT.md`.")
    moved.append(("README/хроника", readme_chronicle))
    removed.append(("README/хроника", readme_chronicle, "README.md"))

    # ── 2. 07: вырезать шапку «Правки …» ─────────────────────────────
    p_start = proto.index("> **Правки 2026-09-07 (итоги беседы 7.1)**")
    p_end = proto.index("## 1. Общие принципы работы с контекстом")
    proto_header = proto[p_start:p_end].rstrip("\n")

    proto_pointer = """> **Журнал правок этого документа переехал** (2026-09-07):
> все датированные врезки «Правки …» по итогам бесед 0.1–7.1 — в
> `docs/08-history.md`, Часть III. Здесь остаётся только протокол.
> Блоки «По факту N» внутри бесед НЕ переезжают: они опровергают текст
> запроса, рядом с которым стоят, и читаются только вместе с ним.
>
> Грабли окружения, тестов и оснастки — `docs/09-lessons.md`; читать
> целиком перед началом любой беседы (§10).

"""
    proto_new = proto[:p_start] + proto_pointer + proto[p_end:]
    moved.append(("07/шапка правок", proto_header))
    removed.append(("07/шапка правок", proto_header, "docs/07-conversation-protocol.md"))

    # ── 3. NEXT-CONTEXT: разбор по главам ────────────────────────────
    lines = nextc.split("\n")
    idx = [i for i, l in enumerate(lines) if re.match(r"^# ", l)]
    chapters = []
    for k, i in enumerate(idx):
        j = idx[k + 1] if k + 1 < len(idx) else len(lines)
        chapters.append((lines[i], lines[i + 1:j]))

    LIVE = ("## Универсальный минимум любой серверной беседы",
            "## В завершение КАЖДОЙ беседы (регрессионные инструменты)")
    live_blocks = []
    hist_chapters = []          # (заголовок, строки) — без граблей и живых правил
    lesson_items = []           # (беседа, блок)

    for head, body in chapters:
        sub = [i for i, l in enumerate(body) if re.match(r"^## ", l)]
        spans = []
        if sub:
            if sub[0] > 0:
                spans.append((None, body[:sub[0]]))
            for k, i in enumerate(sub):
                j = sub[k + 1] if k + 1 < len(sub) else len(body)
                spans.append((body[i], body[i + 1:j]))
        else:
            spans.append((None, body))

        keep = []
        for title, content in spans:
            if title is None:
                keep.append((None, content))
                continue
            if title.strip() in LIVE:
                live_blocks.append((title, content))
                continue
            if re.search(r"Знания|грабл|Грабл", title):
                chap = chap_label(head)
                for blk in split_bullets(content):
                    lesson_items.append((chap, blk))
                continue
            keep.append((title, content))
        hist_chapters.append((head, keep))

    # 08: Часть II — главы с понижением уровня заголовков
    part2 = []
    for head, spans in hist_chapters:
        part2.append(demote(head))
        for title, content in spans:
            if title is not None:
                part2.append(demote(title))
            part2.extend(demote(l) if re.match(r"^#{1,4} ", l) else l
                         for l in content)
    part2_text = "\n".join(part2).strip("\n")
    part2_text = re.sub(r"\n{4,}", "\n\n\n", part2_text)

    for head, spans in hist_chapters:
        for title, content in spans:
            body = "\n".join(demote(l) if re.match(r"^#{1,4} ", l) else l
                             for l in content).strip("\n")
            if body:
                moved.append((f"NEXT{head[:40]}", body))

    # ── 4. docs/08-history.md ────────────────────────────────────────
    hist = f"""# PhiloSynth Service — История разработки

Единственное место хроники проекта. Сведён 2026-09-07 из трёх источников:
раздела «Статус» `README.md`, глав `NEXT-CONTEXT.md` (0.1–7.1) и шапки
«Правки …» `docs/07-conversation-protocol.md`. До свода одна и та же
беседа описывалась в трёх местах разными словами.

**Правило ведения.** Завершая беседу, хронику дописывай СЮДА, в конец
соответствующей части. В README идёт только строка таблицы фаз; в 07 —
только блок «По факту N» рядом с текстом запроса, который он
опровергает; урок, годный вне даты, — в `docs/09-lessons.md` по темам;
факт, ставший постоянным, — в 01–05 патч-скриптом.

**О старых патч-скриптах.** `scripts/patch-docs-conv*.py` — одноразовые
и уже применённые. После свода их секции, целившиеся в README и
`NEXT-CONTEXT.md`, не находят якорей и при повторном прогоне дают
`fail` (например, patch-docs-conv71: applied=0 skip=32 fail=3). Это
ожидаемо: цели переехали сюда. Повторно их не запускают.

**О ссылках внутри.** В перенесённых текстах встречаются обороты вида
«глава 1.7 `NEXT-CONTEXT.md`» и «см. NEXT-CONTEXT» — это ссылки на
главы Части II ЭТОГО файла. Тексты перенесены дословно и не правились.

---

## Часть I. Краткая хроника по беседам

{readme_status_line.replace('## ', '').strip()}

{readme_chronicle}

---

## Часть II. Итоги бесед — подробно

Главы 0.1–7.1 из `NEXT-CONTEXT.md` дословно, без разделов
«Знания/грабли» (они ушли в `docs/09-lessons.md`) и без двух живых
правил («Универсальный минимум любой серверной беседы», «В завершение
КАЖДОЙ беседы») — те остались в `NEXT-CONTEXT.md`.

{part2_text}

---

## Часть III. Журнал правок протокола и доков

Шапка `docs/07-conversation-protocol.md` дословно: датированные врезки
по итогам бесед, от свежих к старым.

{proto_header}
"""

    # ── 5. docs/09-lessons.md ────────────────────────────────────────
    buckets = {key: [] for key, _t, _w in THEMES}
    for chap, blk in lesson_items:
        buckets[classify(blk)].append((chap, blk))

    parts = ["""# PhiloSynth Service — Уроки и грабли

Всё, что добыто по ходу разработки и годится ВНЕ даты: поведение
окружения, ловушки инструментов, инварианты, из-за нарушения которых
уже ломались беседы. Сведено 2026-09-07 из 33 разделов
«Знания/грабли …» `NEXT-CONTEXT.md`; хроника — в `docs/08-history.md`.

Читать **целиком** перед началом любой беседы (07 §10). Пункты
перенесены дословно; разложены по темам автоматически, по ключевым
словам, и сгруппированы внутри темы по беседе-источнику — если пункт
стоит не в своей теме, его можно переставить без потери смысла.

**Правило пополнения.** Новый урок — сюда, в свою тему, отдельным
пунктом с пометкой беседы. В главу истории урок не дублируется.

---
"""]
    for key, title, _w in THEMES:
        items = buckets[key]
        if not items:
            continue
        parts.append(f"\n## {title}\n")
        cur = None
        for chap, blk in items:
            if chap != cur:
                parts.append(f"\n### {chap}\n")
                cur = chap
            parts.append(blk + "\n")
    lessons = "".join(parts)

    for _chap, blk in lesson_items:
        moved.append(("09/пункт", blk))

    # ── 6. NEXT-CONTEXT.md — перезапись ──────────────────────────────
    live_text = []
    for title, content in live_blocks:
        live_text.append(title)
        live_text.extend(content)
    live_joined = "\n".join(live_text).strip("\n")

    nextc_new = f"""# NEXT-CONTEXT — контекст ближайшей беседы

Рабочий файл, а не архив: **перезаписывается** при завершении беседы,
а не дописывается. История — `docs/08-history.md`, грабли и уроки —
`docs/09-lessons.md`, протокол — `docs/07-conversation-protocol.md`.

До 2026-09-07 сюда складывались итоги всех бесед подряд (4946 строк,
371 КБ). Они целиком переехали в `docs/08-history.md` (Часть II) и
`docs/09-lessons.md`. Здесь остались два правила, которые не стареют,
и комплект следующей беседы.

## Состояние на 2026-09-07

Фазы 0–7 закрыты, реестр долгов 07 §12 пуст, протокол бесед после 7.1
пуст. Следующий шаг возможен только как открытие Фазы 8: сначала
задачи в `06-dev-strategy.md`, затем беседа в 07 §8+, затем комплект
вложений ниже.

{live_joined}

## Комплект ближайшей беседы

Беседа не открыта — комплект пуст. При открытии заполнить по правилу
07 §1.4 (только прямые зависимости) и по разделу «Помодульно: что
прикладывать в следующие беседы» той беседы-предшественницы, чья глава
лежит в `docs/08-history.md`, Часть II.
"""

    # ── 7. Ссылки в 07 на переехавшие главы ──────────────────────────
    ref_pairs = [
        ("глава 1.7 `NEXT-CONTEXT.md`",
         "глава 1.7 `docs/08-history.md` (Часть II)"),
        ("глава 2.1 `NEXT-CONTEXT.md`",
         "глава 2.1 `docs/08-history.md` (Часть II)"),
        ("Журнал — глава 2.2 `NEXT-CONTEXT.md`.",
         "Журнал — глава 2.2 `docs/08-history.md` (Часть II)."),
        ("в NEXT-CONTEXT адресованы 3.1",
         "в истории (08 Часть II) адресованы 3.1"),
        ("в NEXT-CONTEXT). Требовать его здесь нельзя",
         "в 08 Часть II). Требовать его здесь нельзя"),
        ("Записи только в главе NEXT-CONTEXT",
         "Записи только в главе истории (08 Часть II)"),
        ("главах `NEXT-CONTEXT.md` (разделы «Открытые TODO после X»)",
         "главах `docs/08-history.md` Часть II (разделы «Открытые TODO после X»)"),
    ]
    for old, new in ref_pairs:
        if new in proto_new:
            continue
        if old not in proto_new:
            failed.append(f"07: якорь ссылки не найден — {old[:50]}")
            continue
        proto_new = proto_new.replace(old, new)

    # ── 8. 07 §10: правило ведения истории в чек-листе ───────────────
    anchor = "- [ ] Загрузил все 7 проектных документов (комплект самодостаточен)"
    add_before = ("- [ ] Прочитал `docs/09-lessons.md` целиком — грабли\n"
                  "      окружения, тестов и оснастки (иначе беседа наступит\n"
                  "      на них заново)\n")
    if add_before not in proto_new:
        if anchor not in proto_new:
            failed.append("07 §10: якорь «Загрузил все 7 проектных документов» не найден")
        else:
            proto_new = proto_new.replace(
                anchor, anchor + "\n" + add_before.rstrip("\n"), 1)

    after_anchor = ("После:\n- [ ] Ревью: все функции из карты портированы\n"
                    "- [ ] Список файлов для следующей беседы зафиксирован\n"
                    "- [ ] TODO задокументированы")
    after_new = after_anchor + """
- [ ] Хроника беседы дописана в `docs/08-history.md` (Часть I — строка,
      Часть II — глава); в README правится только таблица фаз
- [ ] Новые грабли внесены в `docs/09-lessons.md` по темам
- [ ] `NEXT-CONTEXT.md` ПЕРЕЗАПИСАН под следующую беседу, а не дописан
- [ ] Факты, ставшие постоянными, внесены в 01–05 патч-скриптом"""
    if "Хроника беседы дописана в `docs/08-history.md`" not in proto_new:
        if after_anchor not in proto_new:
            failed.append("07 §10: якорь блока «После:» не найден")
        else:
            proto_new = proto_new.replace(after_anchor, after_new, 1)

    rule = """
> **Добавлено 2026-09-07 (свод истории):** история проекта живёт в ОДНОМ
> месте — `docs/08-history.md`. Ритуал завершения беседы, писавший одно
> и то же в README, в шапку 07 и в `NEXT-CONTEXT.md`, отменён: он и
> породил тройную хронику. Урок, годный вне даты, идёт в
> `docs/09-lessons.md`; блок «По факту N» остаётся здесь, рядом с
> текстом запроса, который он опровергает.
"""
    sec10 = "## 10. Контрольный чек-лист для каждой беседы\n"
    if "Добавлено 2026-09-07 (свод истории)" not in proto_new:
        if sec10 not in proto_new:
            failed.append("07: заголовок §10 не найден")
        else:
            proto_new = proto_new.replace(sec10, sec10 + rule, 1)

    # ── 9. verify-patch-regression.py: пробы на переехавший текст ────
    VPR = os.path.join(ROOT, "scripts", "verify-patch-regression.py")
    vpr_new = None
    if os.path.exists(VPR):
        vpr = read(VPR)
        probe_pairs = [
            ('("NEXT-CONTEXT.md", "глава предподготовки", "Предподготовка бесед")',
             '("docs/08-history.md", "глава предподготовки (переехала из NEXT-CONTEXT)",\n     "Предподготовка бесед")'),
            ('("README.md", "упоминание предпатча", "предпатч доков")',
             '("docs/08-history.md", "упоминание предпатча (переехало из README)",\n     "предпатч доков")'),
        ]
        for old, new in probe_pairs:
            if new in vpr:
                continue
            if old not in vpr:
                failed.append(f"verify-patch-regression: проба не найдена — {old[:40]}")
                continue
            vpr = vpr.replace(old, new)
        vpr_new = vpr

    # ── запись ───────────────────────────────────────────────────────
    if failed:
        report()
        return 1

    write(HIST, hist)
    write(LESS, lessons)
    write(README, readme_new)
    write(PROTO, proto_new)
    write(NEXTC, nextc_new)
    if vpr_new is not None:
        write(VPR, vpr_new)
        applied.append("scripts/verify-patch-regression.py (пробы переадресованы)")
    applied.extend(["docs/08-history.md (создан)", "docs/09-lessons.md (создан)",
                    "README.md (хроника вырезана, статус → таблица)",
                    "docs/07-conversation-protocol.md (шапка вырезана, §10 дополнен)",
                    "NEXT-CONTEXT.md (перезаписан)"])

    # ── приёмка ──────────────────────────────────────────────────────
    hist_t, less_t = read(HIST), read(LESS)
    targets = hist_t + "\n" + less_t
    sources = read(README) + "\n" + read(PROTO) + "\n" + read(NEXTC)

    lost = [lbl for lbl, txt in moved if txt.strip() and txt not in targets]
    stayed = [lbl for lbl, txt, _s in removed if txt in sources]

    def content_lines(t):
        return [l for l in t.split("\n")
                if l.strip() and not re.match(r"^#{1,6} ", l)]

    before = len(content_lines(nextc)) + len(content_lines(readme_chronicle)) \
        + len(content_lines(proto_header))
    after = len(content_lines(part2_text)) + len(content_lines(lessons)) \
        + len(content_lines(readme_chronicle)) + len(content_lines(proto_header)) \
        + len(content_lines(live_joined))

    print("── приёмка ──")
    print(f"  перенесено блоков: {len(moved)}; потеряно: {len(lost)}")
    print(f"  вырезано из источников: {len(removed)}; осталось: {len(stayed)}")
    print(f"  содержательных строк было {before}, стало {after} "
          f"(без учёта новых преамбул)")
    print(f"  уроков разложено: {len(lesson_items)} пунктов по темам: " +
          ", ".join(f"{t.split('. ')[1]}={len(buckets[k])}"
                    for k, t, _w in THEMES if buckets[k]))
    if lost:
        failed.extend(f"ПОТЕРЯН блок: {l}" for l in lost[:10])
    if stayed:
        failed.extend(f"НЕ ВЫРЕЗАН блок: {l}" for l in stayed[:10])

    report()
    return 1 if failed else 0


def report():
    print("── отчёт ──")
    for a in applied:
        print(f"  applied: {a}")
    for s in skipped:
        print(f"  skip:    {s}")
    for f in failed:
        print(f"  FAIL:    {f}")
    print(f"  итого: applied={len(applied)} skip={len(skipped)} fail={len(failed)}")


if __name__ == "__main__":
    sys.exit(main())
