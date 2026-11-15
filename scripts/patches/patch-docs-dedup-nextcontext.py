#!/usr/bin/env python3
"""NEXT-CONTEXT → рабочий файл ближайшей беседы.
Остаются: шапка, последнее «Состояние», два постоянных правила, «Ближайшая беседа».
«Что N оставила знать …» → 09, новый раздел 10 (дословно, ## → ###).
Прочее (прежние снимки состояния, исполненные комплекты, межфазовые заметки)
→ 08, новая Часть V «Архив NEXT-CONTEXT» (дословно, уровни заголовков −1).
Плюс две устаревшие строки «Универсального минимума». Идемпотентен."""
import re, sys
REPO = sys.argv[1]
np_, lp, hp = f'{REPO}/NEXT-CONTEXT.md', f'{REPO}/docs/09-lessons.md', f'{REPO}/docs/08-history.md'
N, L9, H = (open(p, encoding='utf-8').read() for p in (np_, lp, hp))
res = {'applied': 0, 'skip': 0, 'fail': 0}
M9 = '## 10. Инварианты, оставленные беседами (перенесено из NEXT-CONTEXT 2026-11-15)'
M8 = '## Часть V. Архив NEXT-CONTEXT (перенесено 2026-11-15)'

def done():
    print(f"p2_nextcontext: applied={res['applied']} skip={res['skip']} fail={res['fail']}")
    sys.exit(1 if res['fail'] else 0)

if M9 in L9 and M8 in H:
    res['skip'] += 3; done()

lines = N.split('\n')
heads = [i for i, l in enumerate(lines) if l.startswith('## ')]
secs = []
for k, i in enumerate(heads):
    j = heads[k + 1] if k + 1 < len(heads) else len(lines)
    secs.append((lines[i], '\n'.join(lines[i:j]).rstrip('\n')))
pre = '\n'.join(lines[:heads[0]]).rstrip('\n')
keep, to9, to8 = [], [], []
first_state = True
for h, body in secs:
    if h.startswith('## Состояние на'):
        (keep if first_state else to8).append(body); first_state = False
    elif h.startswith('## Универсальный минимум') or h.startswith('## В завершение КАЖДОЙ беседы') \
            or h.startswith('## Ближайшая беседа — не назначена (Фаза 17'):
        keep.append(body)
    elif re.match(r'^## Что \d+\.\d+[a-z]? оставила знать', h):
        to9.append(body)
    else:
        to8.append(body)

def demote(t, by=1):
    return '\n'.join(('#' * by + l) if re.match(r'^#{2,5} ', l) else l for l in t.split('\n'))

new_pre = pre.replace(
"""До 2026-09-07 сюда складывались итоги всех бесед подряд (4946 строк,
371 КБ). Они целиком переехали в `docs/08-history.md` (Часть II) и
`docs/09-lessons.md`. Здесь остались два правила, которые не стареют,
и комплект следующей беседы.""",
"""До 2026-09-07 сюда складывались итоги всех бесед подряд (4946 строк,
371 КБ). Они целиком переехали в `docs/08-history.md` (Часть II) и
`docs/09-lessons.md`. С 2026-11-15 так же вынесено накопившееся после
свода: разделы «Что N оставила знать всем беседам» — в `docs/09-lessons.md`
§10, прежние снимки «Состояние на …» и исполненные комплекты — в
`docs/08-history.md` Часть V. Здесь — текущее состояние, два правила,
которые не стареют, и комплект ближайшей беседы. Снимок «Состояние» —
один: при завершении беседы прежний уходит в 08 Часть V, а не копится.""")
if new_pre == pre:
    res['fail'] += 1; print('fail: шапка не найдена'); done()

new_N = new_pre + '\n\n' + '\n\n'.join(keep) + '\n'
# две устаревшие строки правила
fixes = [
 ("16.1 — 0017 `discussion` (+ synthesis_members, comments, reviews, review_revisions, review_findings — 37 таблиц); следующая — 0018)",
  "16.1 — 0017 `discussion` (+ synthesis_members, comments, reviews, review_revisions, review_findings — 37 таблиц); 16.2 — 0018 `members_notifications` (+ notifications, notification_settings — 39); 17.1 — 0019 `proposals_actor` (+ proposals, proposal_events — 41); следующая — 0020)"),
 ("15.4 — 2ba/4bl/5av; следующая серия — 2bb/4bm/5aw)",
  "15.4 — 2ba/4bl/5av; 16.1 — 2bb/4bm/5aw; 16.2 — 2bc/4bn/5ax; 16.3 — 2bd/4bo (без живой секции — клиент); 17.1 — 2be/4bp/5ay; 17.2 — 2bf/4bq (без живой секции — клиент); следующая серия — 2bg/4br/5az)"),
]
for a, b in fixes:
    if new_N.count(a) != 1: res['fail'] += 1; print('fail: правка правила', a[:50]); done()
    new_N = new_N.replace(a, b)

sec9 = (f"\n---\n\n{M9}\n\n"
        "Сквозные инварианты, которые беседы оставляли «знать всем беседам» в\n"
        "`NEXT-CONTEXT.md`. Перенесены дословно, по беседе-источнику, от свежих к\n"
        "старым — как стояли там. Читать вместе с темами 1–9: это то, что держит\n"
        "сегодняшний код, а не история.\n\n" + '\n\n'.join(demote(b) for b in to9) + '\n')
sec8 = (f"\n---\n\n{M8}\n\n"
        "Накопившееся в `NEXT-CONTEXT.md` после свода 2026-09-07: прежние снимки\n"
        "«Состояние на …», комплекты уже исполненных бесед и межфазовые заметки.\n"
        "Перенесено дословно, в прежнем порядке (от свежих к старым); ссылки\n"
        "«выше/ниже» внутри — на соседей по этому архиву. Итоги бесед — Часть II.\n\n"
        + '\n\n'.join(demote(b) for b in to8) + '\n')
L9n = L9.rstrip('\n') + '\n' + sec9
Hn = H.rstrip('\n') + '\n' + sec8
# сквозная проверка: каждая непустая строка старого NEXT-CONTEXT — где-то в новых трёх файлах
pool = new_N + '\n' + L9n + '\n' + Hn
lost = []
for l in N.split('\n'):
    if not l.strip(): continue
    cand = {l, '#' + l} if l.startswith('#') else {l}
    if not any(c in pool for c in cand) and not any(l == a.split('\n')[0] for a, _ in fixes):
        lost.append(l)
lost = [l for l in lost if not any(a in l for a, _ in fixes) and l not in pre]  # правленые строки и прежняя шапка — намеренно
if lost:
    res['fail'] += 1; print('fail: потеряны строки:', *[x[:90] for x in lost[:10]], sep='\n  '); done()
open(np_, 'w', encoding='utf-8').write(new_N); open(lp, 'w', encoding='utf-8').write(L9n); open(hp, 'w', encoding='utf-8').write(Hn)
res['applied'] += 3
print(f'  NEXT-CONTEXT: {len(N.encode())//1024} → {len(new_N.encode())//1024} КБ; в 09 — {len(to9)} разделов; в 08 Часть V — {len(to8)} разделов')
done()
