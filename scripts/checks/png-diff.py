#!/usr/bin/env python3
"""Сравнение двух каталогов снимков (tests/dir-snapshots.mjs) попиксельно.

    python3 scripts/checks/png-diff.py <до> <после> [--save <каталог>]

Печатает по каждому файлу: одинаковы / размер разошёлся / число и доля
отличающихся пикселей с рамкой отличий. Код возврата 1, если есть различия.
С --save кладёт туда картинки отличий (красным по снимку «после»).
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops

args = [a for a in sys.argv[1:] if not a.startswith("--")]
save = Path(sys.argv[sys.argv.index("--save") + 1]) if "--save" in sys.argv else None
if save is not None:
    args = [a for a in args if a != str(save)]
if len(args) != 2:
    print(__doc__)
    sys.exit(2)
a_dir, b_dir = Path(args[0]), Path(args[1])
bad = 0
for a in sorted(a_dir.glob("*.png")):
    b = b_dir / a.name
    if not b.exists():
        print(f"  нет пары  {a.name}")
        bad += 1
        continue
    ia, ib = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
    if ia.size != ib.size:
        print(f"  РАЗМЕР    {a.name}: {ia.size} → {ib.size}")
        bad += 1
        continue
    diff = ImageChops.difference(ia, ib)
    box = diff.getbbox()
    if box is None:
        print(f"  одинаковы {a.name}")
        continue
    mask = diff.convert("L").point(lambda v: 255 if v else 0)
    n = sum(1 for v in mask.getdata() if v)
    print(f"  ОТЛИЧИЯ   {a.name}: {n} пикс. ({100 * n / (ia.width * ia.height):.3f} %), рамка {box}")
    bad += 1
    if save is not None:
        save.mkdir(parents=True, exist_ok=True)
        out = ib.copy()
        out.paste((255, 0, 0), mask=mask)
        out.save(save / a.name)
print(f"\nфайлов с отличиями: {bad}")
sys.exit(1 if bad else 0)
