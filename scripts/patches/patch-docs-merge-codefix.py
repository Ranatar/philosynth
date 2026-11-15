#!/usr/bin/env python3
"""Перенос исправлений по коду (units/<id>/merged.md против merged_v1.md) в 08.

  p6_codefix.py <repo> <units_dir> <diff_report.md>

Для каждой беседы, где merged.md отличается от merged_v1.md:
 - заголовки (строки «#…») обязаны совпасть — иначе fail (на подписи
   «По факту» ссылается 07);
 - merged_v1 обязан стоять в 08 ровно один раз — заменяется на merged.md;
   уже заменённое (merged.md в 08, v1 нет) — skip.
Пишет отчёт: по беседе — пословный дифф изменённых строк и число записей
в codefix.md. Идемпотентен.
"""
import difflib, os, re, sys

REPO, U, REP = sys.argv[1:4]
p8 = f'{REPO}/docs/08-history.md'
T8 = open(p8, encoding='utf-8').read()
res = {'applied': 0, 'skip': 0, 'same': 0, 'fail': 0}
out = ['# Исправления по коду: «было → стало» по беседам', '']


def key(s):
    return [int(x) for x in re.sub(r'[a-z]', '', s).split('.')] + [s.endswith('b')]


def wdiff(a, b):
    sm = difflib.SequenceMatcher(None, a.split(' '), b.split(' '))
    A, B = a.split(' '), b.split(' ')
    parts = []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == 'equal':
            seg = A[i1:i2]
            parts.append(' '.join(seg if len(seg) <= 8 else seg[:4] + ['…'] + seg[-4:]))
        else:
            if i2 > i1: parts.append('~~' + ' '.join(A[i1:i2]) + '~~')
            if j2 > j1: parts.append('**' + ' '.join(B[j1:j2]) + '**')
    return ' '.join(parts)


ids = sorted([d for d in os.listdir(U) if os.path.exists(f'{U}/{d}/merged_v1.md')], key=key)
for cid in ids:
    v1 = open(f'{U}/{cid}/merged_v1.md', encoding='utf-8').read().rstrip('\n')
    nw = open(f'{U}/{cid}/merged.md', encoding='utf-8').read().rstrip('\n')
    if v1 == nw:
        res['same'] += 1; continue
    h1 = [l for l in v1.split('\n') if l.startswith('#')]
    h2 = [l for l in nw.split('\n') if l.startswith('#')]
    if h1 != h2:
        print(f'fail: {cid}: заголовки изменены:', set(h1) ^ set(h2)); res['fail'] += 1; continue
    if nw in T8 and v1 not in T8:
        res['skip'] += 1
    elif T8.count(v1) == 1:
        T8 = T8.replace(v1, nw); res['applied'] += 1
    else:
        print(f'fail: {cid}: прежняя глава в 08 найдена {T8.count(v1)} раз'); res['fail'] += 1; continue
    cf = f'{U}/{cid}/codefix.md'
    n_cf = len(re.findall(r'^##\s', open(cf, encoding='utf-8').read(), re.M)) if os.path.exists(cf) else 0
    a = re.sub(r'\s+', ' ', v1); b = re.sub(r'\s+', ' ', nw)
    sa = re.split(r'(?<=[.;!?])\s+', a); sb = re.split(r'(?<=[.;!?])\s+', b)
    ch = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, sa, sb, autojunk=False).get_opcodes():
        if op != 'equal':
            ch.append(wdiff(' '.join(sa[i1:i2]), ' '.join(sb[j1:j2])))
    out += [f'## Беседа {cid} — записей в codefix.md: {n_cf}, изменённых мест: {len(ch)}', '']
    out += [f'- {c}' for c in ch] + ['']

if not res['fail']:
    open(p8, 'w', encoding='utf-8').write(T8)
open(REP, 'w', encoding='utf-8').write('\n'.join(out))
print(f"p6_codefix: applied={res['applied']} skip={res['skip']} без правок={res['same']} fail={res['fail']}"
      + ('' if not res['fail'] else ' — 08 не записан'))
sys.exit(1 if res['fail'] else 0)
