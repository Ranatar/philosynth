#!/usr/bin/env python3
"""Сравнение двух версий патч-скрипта на деградацию.

Зачем: при переработке патч-скрипта легко потерять правку, диапазон или
решение, зафиксированное в предыдущей версии. Проверка «прогнал — fail=0»
этого не ловит: скрипт может успешно применить меньше, чем применял.

Что делает:
  1. Разворачивает ДВЕ чистые копии репозитория из git archive HEAD.
  2. Прогоняет в них старую и новую версии патча (каждую по два раза —
     заодно проверяется идемпотентность).
  3. Сравнивает побайтово сгенерированные фрагменты — диапазоны
     извлечения из исходника не должны «поехать».
  4. Гоняет список смысловых проб: каждая проба — подстрока, которая
     ОБЯЗАНА присутствовать в результате новой версии. Пробы пишутся
     по содержанию старой версии плюс по новым требованиям.

Запуск из корня репо:
  python3 scripts/verify-patch-regression.py OLD.py NEW.py
"""
import subprocess
import sys
import tempfile
from pathlib import Path

PROBES = [
    # ── унаследовано от версии на 21 правку ───────────────────────
    ("docs/07-conversation-protocol.md", "расширение routes/syntheses.ts",
     "Расширение server/routes/syntheses.ts (03 §2.2)"),
    ("docs/07-conversation-protocol.md", "создание routes/sections.ts",
     "server/routes/sections.ts (03 §2.3)"),
    ("docs/07-conversation-protocol.md", "GET /syntheses/public",
     "GET    /syntheses/public"),
    ("docs/07-conversation-protocol.md", "PATCH только владелец",
     "PATCH  /syntheses/:id     { title?, isPublic? }  — только владелец"),
    ("docs/07-conversation-protocol.md", "DELETE только владелец",
     "DELETE /syntheses/:id                            — только владелец"),
    ("docs/07-conversation-protocol.md", "pauseEstimates в GET :id",
     "с pausedState и pauseEstimates"),
    ("docs/07-conversation-protocol.md", "капсула вне тел разделов",
     "исключается — капсула живёт в шапке"),
    ("docs/07-conversation-protocol.md", "SectionView без своего заголовка",
     "Свой заголовок НЕ рисует"),
    ("docs/07-conversation-protocol.md", "перенос CSS документа",
     "Перенос CSS документа в client/src/globals.css"),
    ("docs/07-conversation-protocol.md", "contextQualityScore = null до 2.4",
     "contextQualityScore` до беседы 2.4 всегда `null`"),
    ("docs/07-conversation-protocol.md", "доступ 403/404",
     "иначе 403 FORBIDDEN, несуществующий id — 404 NOT_FOUND"),
    ("docs/07-conversation-protocol.md", "формат doc_num", "rand(1000..9999)"),
    ("docs/07-conversation-protocol.md", "футер из totalCostUsd",
     "без пересчёта по ставкам"),
    ("docs/07-conversation-protocol.md", "серверный поиск ?search=", "Поиск серверный"),
    ("docs/07-conversation-protocol.md", "WS без перезапуска генерации",
     "не должна перезапускать генерацию"),
    ("docs/07-conversation-protocol.md", "диапазон CSS 476-929", "sed -n '476,929p'"),
    ("docs/07-conversation-protocol.md", "диапазон .doc-title-edit-btn", "sed -n '3304,3319p'"),
    ("docs/07-conversation-protocol.md", "диапазон разметки 4134-4220", "sed -n '4134,4220p'"),
    ("docs/07-conversation-protocol.md", "диапазон HELPER 11594-11892", "sed -n '11594,11892p'"),
    ("docs/07-conversation-protocol.md", "диапазон шапки 12110-12144", "sed -n '12110,12144p'"),
    ("docs/07-conversation-protocol.md", "диапазон updateFooterCost", "sed -n '5671,5683p'"),
    ("docs/07-conversation-protocol.md", "запрет порта rebuildDbMapping", "rebuildDbMapping` [5686]"),
    ("docs/07-conversation-protocol.md", "предупреждение extract-fragments.py",
     "скрипта `scripts/extract-fragments.py` в"),
    ("docs/07-conversation-protocol.md", "тест публикации через PATCH",
     "Опубликуй синтез (PATCH /syntheses/:id { isPublic: true })"),
    ("docs/07-conversation-protocol.md", "тест: не запускать генерацию заново",
     "НЕ запускает генерацию заново"),
    ("docs/07-conversation-protocol.md", "тест чужого непубличного 403",
     "чужой непубличный синтез — 403"),
    ("docs/03-specification.md", "тип ответа GET /syntheses",
     "items: SynthesisPreview[], total: number }"),
    ("docs/03-specification.md", "SynthesisFull += docNum", "docNum: string;"),
    ("docs/03-specification.md", "SynthesisFull += pauseEstimates", "pauseEstimates: PauseEstimates"),
    ("docs/03-specification.md", "SectionSummary += subsections", "subsections: string[];"),
    ("docs/04-code-reuse-map.md", "buildTableOfContents в карте", "`buildTableOfContents()` [11621]"),
    ("docs/05-file-structure.md", "владелец routes/sections.ts", "до 2026-07-30"),
    ("docs/06-dev-strategy.md", "примечание о соответствии 06↔07",
     "Соответствие протоколу (2026-07-30)"),
    ("NEXT-CONTEXT.md", "глава предподготовки", "Предподготовка бесед"),
    ("README.md", "упоминание предпатча", "предпатч доков"),
    # ── новое: разделение бесед и правки 1.7 ──────────────────────
    ("docs/07-conversation-protocol.md", "беседа 1.6 стала серверной",
     "### Беседа 1.6: Транспорт чтения (сервер)"),
    ("docs/07-conversation-protocol.md", "появилась беседа 1.6b",
     "### Беседа 1.6b: Просмотр документа + каталог (клиент)"),
    ("docs/07-conversation-protocol.md", "1.7 стала клиентской",
     "### Беседа 1.7: Граф категорий, 3D + 2D (клиент)"),
    ("docs/07-conversation-protocol.md", "GET /categories в беседе 1.6",
     "GET /syntheses/:id/categories"),
    ("docs/07-conversation-protocol.md", "зависимости three/d3", "three@0.128.x"),
    ("docs/07-conversation-protocol.md", "api/elements.ts создаётся в 1.7",
     "модуль создаётся ЗДЕСЬ"),
    ("docs/07-conversation-protocol.md", "экспорт → TODO(4.2)", "ЗАГЛУШКИ с TODO(4.2)"),
    ("docs/07-conversation-protocol.md", "graph-STATE 4389-4413", "sed -n '4389,4413p'"),
    ("docs/03-specification.md", "владелец GET /categories",
     "Реализация — беседа 1.6 (сервер): граф"),
]

FRAGMENT_DIR = "docs/fragments-for-conversations"


def prepare(dst: Path) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    tar = subprocess.run(["git", "archive", "HEAD"], capture_output=True, check=True).stdout
    subprocess.run(["tar", "-x", "-C", str(dst)], input=tar, check=True)


def run_patch(root: Path, script: Path) -> tuple[str, str]:
    target = root / "scripts" / script.name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(script.read_bytes())
    out1 = subprocess.run([sys.executable, str(target)], cwd=root,
                          capture_output=True, text=True).stdout
    out2 = subprocess.run([sys.executable, str(target)], cwd=root,
                          capture_output=True, text=True).stdout
    return out1, out2


def tail(out: str) -> str:
    return " | ".join(l for l in out.strip().split("\n")
                      if l.startswith(("APPLIED:", "SKIPPED:", "FAILED:")))


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    old, new = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    tmp = Path(tempfile.mkdtemp(prefix="patchcheck-"))
    a, b = tmp / "old", tmp / "new"
    prepare(a)
    prepare(b)

    ok = True
    for label, root, script in (("СТАРАЯ", a, old), ("НОВАЯ", b, new)):
        o1, o2 = run_patch(root, script)
        print(f"{label:7} прогон 1: {tail(o1)}")
        print(f"{label:7} прогон 2: {tail(o2)}")
        if "FAILED: 0" not in o1 or "APPLIED: 0" not in o2:
            print(f"  !! {label}: прогон нечист (fail или неидемпотентность)")
            ok = False

    print("\n── фрагменты (побайтово) ──")
    fa = {p.name: p for p in (a / FRAGMENT_DIR).glob("*.js")}
    fb = {p.name: p for p in (b / FRAGMENT_DIR).glob("*.js")}
    for name in sorted(set(fa) | set(fb)):
        if name not in fa:
            print(f"  +  {name}: только в новой версии")
        elif name not in fb:
            print(f"  !! {name}: ПОТЕРЯН новой версией")
            ok = False
        else:
            la = fa[name].read_text(encoding="utf-8").split("\n")
            lb = fb[name].read_text(encoding="utf-8").split("\n")
            body_a = [l for l in la if not l.startswith("//")]
            body_b = [l for l in lb if not l.startswith("//")]
            same = "тело ИДЕНТИЧНО" if body_a == body_b else "!! ТЕЛО РАСХОДИТСЯ"
            if body_a != body_b:
                ok = False
            print(f"  =  {name}: {same} (строк: {len(la)} → {len(lb)})")

    print("\n── смысловые пробы в результате НОВОЙ версии ──")
    cache: dict[str, str] = {}
    lost = 0
    for path, name, needle in PROBES:
        text = cache.setdefault(path, (b / path).read_text(encoding="utf-8"))
        if needle not in text:
            print(f"  ПРОПАЛ  {name}  ({path})")
            lost += 1
    print(f"  пройдено {len(PROBES) - lost} из {len(PROBES)}, потеряно {lost}")
    if lost:
        ok = False

    print("\n── объём различий в результатах ──")
    for path in sorted(cache):
        d = subprocess.run(["diff", str(a / path), str(b / path)],
                           capture_output=True, text=True).stdout
        n = sum(1 for l in d.split("\n") if l[:1] in "<>")
        print(f"  {path:38} строк различий: {n}")

    print("\nИТОГ:", "деградации не обнаружено" if ok else "ЕСТЬ ПОТЕРИ, см. выше")
    print("рабочие копии:", tmp)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
