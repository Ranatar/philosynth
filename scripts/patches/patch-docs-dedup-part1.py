#!/usr/bin/env python3
"""08 Часть I: порядок бесед и отбившиеся куски (тексты не меняются).
 - беседы 16.1…17.2 — в порядке бесед (стояли 17.2, 17.1, 16.3, 16.2, 16.1);
 - «Долгов нет; ближайшая — 11.3.» — обратно в конец записи 11.2;
 - абзац «Перед этой связкой снят предпатч…» (о 1.6/1.6b/1.7) — перед 1.6;
 - устаревшая строка «Статус: Фазы 0–7 завершены (…)» → вводная строка.
Идемпотентен."""
import re, sys
p = f'{sys.argv[1]}/docs/08-history.md'
H = open(p, encoding='utf-8').read()
res = {'applied': 0, 'skip': 0, 'fail': 0}
INTRO = 'По абзацу на беседу, в порядке бесед; подробно — Часть II, фазы — раздел выше.'
def out():
    print(f"p3_part1: applied={res['applied']} skip={res['skip']} fail={res['fail']}"); sys.exit(1 if res['fail'] else 0)
if INTRO in H:
    res['skip'] += 4; out()
a = H.index('\nСтатус: Фазы 0–7 завершены (')
a_end = H.index('\n', a + 1)
b = H.index('\n---\n\n## Часть II.')
body = H[a_end + 1:b]
L = body.split('\n')
START = re.compile(r'^(- \*\*(\d|Правки)|Беседа \d+\.\d+[a-z]? \(|Перед этой связкой)')
idx = [i for i, l in enumerate(L) if START.match(l)]
ents = ['\n'.join(L[i:(idx[k + 1] if k + 1 < len(idx) else len(L))]) for k, i in enumerate(idx)]
head = '\n'.join(L[:idx[0]])
def key(e):
    m = re.match(r'^(?:- \*\*|Беседа )(\d+\.\d+[a-z]?)', e); return m.group(1) if m else None
try:
    # 1) отбившаяся строка 11.2
    ORPH = 'Долгов нет; ближайшая — 11.3.'
    i161 = next(k for k, e in enumerate(ents) if key(e) == '16.1')
    assert ORPH in ents[i161].split('\n')
    ents[i161] = '\n'.join(x for x in ents[i161].split('\n') if x != ORPH)
    i112 = next(k for k, e in enumerate(ents) if key(e) == '11.2')
    assert ents[i112].count('\n') == 0, 'запись 11.2 не однострочная'
    ents[i112] = ents[i112] + '\n' + ORPH
    # 2) абзац о предпатче — перед 1.6
    ipre = next(k for k, e in enumerate(ents) if e.startswith('Перед этой связкой'))
    pre = ents.pop(ipre)
    if not pre.endswith('\n'): pre += '\n'          # пустая строка после абзаца
    if not ents[-1].endswith('\n'): ents[-1] += '\n'  # и перед «---» в конце Части I
    i16 = next(k for k, e in enumerate(ents) if key(e) == '1.6')
    if not ents[i16 - 1].endswith('\n'): ents[i16 - 1] += '\n'  # пустая строка перед абзацем
    ents.insert(i16, pre)
    # 3) 16.1…17.2 — по порядку бесед
    tail_ids = ['17.2', '17.1', '16.3', '16.2', '16.1']
    pos = [next(k for k, e in enumerate(ents) if key(e) == t) for t in tail_ids]
    assert pos == sorted(pos) and pos[-1] - pos[0] == 4, pos
    blk = [ents[k].rstrip('\n') for k in pos]
    tail_rest = ents[pos[-1]][len(ents[pos[-1]].rstrip('\n')):]
    new_blk = list(reversed(blk))
    ents[pos[0]:pos[-1] + 1] = [x + '\n' for x in new_blk[:-1]] + [new_blk[-1] + tail_rest]
    new_body = (head + '\n' if head else '') + '\n'.join(ents)
    H2 = H[:a] + '\n' + INTRO + H[a_end:a_end + 1] + new_body + H[b:]
    # сверка: та же мультимножина непустых строк (минус строка «Статус», плюс вводная)
    from collections import Counter
    old = Counter(l for l in body.split('\n') if l.strip()); new = Counter(l for l in new_body.split('\n') if l.strip())
    assert old == new, (old - new, new - old)
    assert H2[H2.index('\n---\n\n## Часть II.') - 1] == '\n', 'нет пустой строки перед ---'
    open(p, 'w', encoding='utf-8').write(H2); res['applied'] += 4
except Exception as e:
    print('fail:', repr(e)[:300]); res['fail'] += 1
out()
