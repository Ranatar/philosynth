#!/usr/bin/env python3
"""Сборка слитых глав: «По факту» (07) + глава (08) → одна глава в 08.

  p4_merge.py <repo> <units_dir> [id …]     без id — все units с merged.md

Для каждой беседы:
 - глава Части II 08 (текст chapter.md) заменяется на merged.md;
 - каждый блок «По факту» из byfact.md в 07 заменяется указателем,
   сохраняющим подпись блока дословно (на неё смотрят сторожа
   integration-check и ссылки из кода «По факту N» п. M):
       **По факту 17.2 (первый запрос — 2026-11-15).** → `docs/08-history.md`,
       глава «Беседа 17.2», одноимённый подраздел.
Поиск — по содержимому, не по номерам строк. Идемпотентен: глава уже
заменена и указатели стоят → skip. Отчёт applied / skip / fail.
"""
import json, os, re, sys

REPO, UNITS = sys.argv[1], sys.argv[2]
only = sys.argv[3:]
p7, p8 = f'{REPO}/docs/07-conversation-protocol.md', f'{REPO}/docs/08-history.md'
T7, T8 = open(p7, encoding='utf-8').read(), open(p8, encoding='utf-8').read()
idx = json.load(open(f'{UNITS}/index.json', encoding='utf-8'))
res = {'applied': 0, 'skip': 0, 'fail': 0}
LABEL = re.compile(r'^(\s*>?\s?)\*\*(По факту[^*]*?)\*\*', re.S)   # подпись бывает в две строки
START = re.compile(r'^(\s*>?\s?)\*\*По факту')


def pointer(block, cid):
    m = LABEL.match(block)
    pre = m.group(1)
    # перенос строки внутри подписи (и цитатный «> » продолжения) → пробел
    lab = re.sub(r'\s*\n\s*(?:>\s?)?', ' ', m.group(2)).rstrip()
    lab_core = lab.rstrip('.:').rstrip()
    return (f'{pre}**{lab}** → `docs/08-history.md`, глава «Беседа {cid}», '
            f'подраздел «{lab_core}».')


def split_blocks(text):
    """byfact.md — блоки, склеенные через пустую строку; режем по подписям."""
    L = text.rstrip('\n').split('\n')
    starts = [i for i, l in enumerate(L) if START.match(l)]
    out = []
    for k, i in enumerate(starts):
        j = starts[k + 1] if k + 1 < len(starts) else len(L)
        blk = '\n'.join(L[i:j]).rstrip('\n')
        out.append(blk)
    return out


ids = only or [c for c in idx if os.path.exists(f'{UNITS}/{c}/merged.md')]
for cid in ids:
    d = f'{UNITS}/{cid}'
    try:
        chap = open(f'{d}/chapter.md', encoding='utf-8').read().rstrip('\n')
        merged = open(f'{d}/merged.md', encoding='utf-8').read().rstrip('\n')
        blocks = split_blocks(open(f'{d}/byfact.md', encoding='utf-8').read())
        # 08
        if merged in T8 and chap not in T8:
            res['skip'] += 1
        elif T8.count(chap) == 1:
            T8 = T8.replace(chap, merged); res['applied'] += 1
        elif not chap:
            # главы не было: слитая встаёт в Часть II первой (от свежих к старым)
            if merged in T8: res['skip'] += 1
            else:
                a = T8.index('## Часть II.'); a = T8.index('\n### ', a)
                T8 = T8[:a] + '\n' + merged + '\n' + T8[a:]; res['applied'] += 1
        else:
            raise RuntimeError(f'{cid}: глава 08 найдена {T8.count(chap)} раз')
        # 07
        for blk in blocks:
            ptr = pointer(blk, cid)
            if ptr in T7 and blk not in T7:
                res['skip'] += 1
            elif T7.count(blk) == 1:
                T7 = T7.replace(blk, ptr); res['applied'] += 1
            else:
                raise RuntimeError(f'{cid}: блок 07 «{blk[:50]}» найден {T7.count(blk)} раз')
    except Exception as e:
        print('fail:', e); res['fail'] += 1

if not res['fail']:
    open(p7, 'w', encoding='utf-8').write(T7); open(p8, 'w', encoding='utf-8').write(T8)
print(f"p4_merge: applied={res['applied']} skip={res['skip']} fail={res['fail']}"
      + ('' if not res['fail'] else ' — ничего не записано'))
sys.exit(1 if res['fail'] else 0)
