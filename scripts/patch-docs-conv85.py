#!/usr/bin/env python3
"""Патч документации по итогам беседы 8.5 (родословная при импорте —
сопоставление родителя по имени предложением; бэкенд + клиент).
Запрос 1 (2026-09-14) — факты, ставшие постоянными:
  A  03 §2.2 — POST /syntheses/import: форма ответа += lineageCandidates;
     §2.8 — POST /syntheses/:id/lineage/link с заслонами; §4.3 — коды
     LINEAGE_SELF / LINEAGE_CYCLE / LINEAGE_EXISTS.
  B  02 §2.4 — примечание 8.5 к synthesis_lineage (файлы одностраничника
     без UUID; parent_name не пишется у parent_type='synthesis').
  C  04 §4 — строка «Новое»: сопоставление по имени + linkParent.
  D  05 — комментарии routes/lineage, lineage-service, import-service,
     api/lineage, ImportPage; .env.local.example воссоздан 8.5.
  E  07 — текст 8.5: адрес 02 §2.4 (не §2.5), роут импорта в routes/import.ts
     (не syntheses.ts); NEXT-CONTEXT/07 — блока «По факту 3.1» нет.
Блок «По факту 8.5», 08, 09, README, §12 — на ЗАВЕРШЕНИИ беседы отдельным
patch() в этом же скрипте.

Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patch-docs-conv85.py
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
applied = skipped = failed = 0


def patch(rel: str, old: str, new: str, label: str) -> None:
    global applied, skipped, failed
    path = ROOT / rel
    if not path.exists():
        failed += 1
        print(f"  fail  {label}: нет файла {rel}")
        return
    text = path.read_text(encoding="utf-8")
    if new in text:
        skipped += 1
        print(f"  skip  {label}")
        return
    if old not in text:
        failed += 1
        print(f"  fail  {label}: не найден исходный фрагмент")
        return
    if text.count(old) != 1:
        failed += 1
        print(f"  fail  {label}: фрагмент встречается {text.count(old)} раз")
        return
    path.write_text(text.replace(old, new), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


P02 = "docs/02-data-model.md"
P03 = "docs/03-specification.md"
P04 = "docs/04-code-reuse-map.md"
P05 = "docs/05-file-structure.md"
P07 = "docs/07-conversation-protocol.md"

# ── A. 03 ────────────────────────────────────────────────────────────────

patch(
    P03,
    """POST   /syntheses/import       multipart/form-data: file (HTML)
                                → { id: string, warnings: ImportWarning[] }
```""",
    """POST   /syntheses/import       multipart/form-data: file (HTML)
                                → { id: string, warnings: ImportWarning[],
                                    lineageCandidates: LineageCandidate[] }
                                // 8.5: файлы одностраничника UUID не несут
                                // (в живом файле 0 вхождений synthesisId) —
                                // ветка UUID (4.3) для них мертва. После её
                                // неудачи концепция-родитель из genealogy
                                // сопоставляется ПО ИМЕНИ среди синтезов ТОГО
                                // ЖЕ владельца (normalizeConceptTitle: схлопнуть
                                // пробелы, снять «»/""/„“, регистр) и отдаётся
                                // ПРЕДЛОЖЕНИЕМ: LineageCandidate = { parentName,
                                // position, matches: { id, title, createdAt }[] }.
                                // Связь при импорте НЕ создаётся даже при
                                // единственном совпадении (имя — не идентификатор);
                                // matches пуст — совпадений нет, предупреждение
                                // говорит о возможности привязать позже. Файлы
                                // экспорта 4.2 (с UUID) связываются прежней
                                // веткой, lineageCandidates для них пуст.
                                // Клиент (ImportPage): блок на каждого родителя,
                                // «Связать» вторым шагом кнопок → POST
                                // /syntheses/:id/lineage/link (§2.8).
```""",
    "03 §2.2: POST /import += lineageCandidates",
)

patch(
    P03,
    """GET    /lineage/search          ?philosopher=Кант&philosopher=Хайдеггер
                                → { syntheses: SynthesisPreview[] }
                                // Концепции, в генеалогии которых есть ВСЕ указанные философы
```""",
    """GET    /lineage/search          ?philosopher=Кант&philosopher=Хайдеггер
                                → { syntheses: SynthesisPreview[] }
                                // Концепции, в генеалогии которых есть ВСЕ указанные философы

POST   /syntheses/:id/lineage/link { parentName, parentSynthesisId }
                                → { ok: true, record: LineageRecord }
                                // Беседа 8.5. Строка synthesis_lineage
                                // parent_type='synthesis', position — в конец
                                // существующих родителей. parentName — имя из
                                // файла (обязателен, в БД НЕ пишется: parent_name
                                // модели — имя философа). Заслоны по порядку:
                                // тело без полей → 400 VALIDATION_ERROR (details);
                                // :id не найден → 404; :id не свой → 403 FORBIDDEN;
                                // :id === parentSynthesisId → 400 LINEAGE_SELF;
                                // parentSynthesisId не UUID/не найден → 404;
                                // родитель принадлежит ДРУГОМУ пользователю → 403
                                // (сопоставление шло по имени — чужая одноимённая
                                // концепция дала бы ложную связь; публичность не
                                // помогает); пара уже есть → 409 LINEAGE_EXISTS
                                // (идемпотентный отказ, строка не дублируется);
                                // parentSynthesisId среди ПОТОМКОВ :id → 409
                                // LINEAGE_CYCLE (проверяются потомки, не предки:
                                // цикл создаётся привязкой родителя, который сам
                                // происходит от нас). Отвязки (DELETE) нет.
```""",
    "03 §2.8: POST /lineage/link",
)

patch(
    P03,
    """SELF_ROLE_CHANGE    — POST /auth/users/:id/role на самого себя — 409 (8.1)
```""",
    """SELF_ROLE_CHANGE    — POST /auth/users/:id/role на самого себя — 409 (8.1)
LINEAGE_SELF        — POST /lineage/link: концепция — собственный родитель — 400 (8.5)
LINEAGE_CYCLE       — POST /lineage/link: родитель среди потомков — 409 (8.5)
LINEAGE_EXISTS      — POST /lineage/link: такая пара уже есть — 409, идемпотентный
                      отказ без дубликата строки (8.5; код не назван текстом
                      беседы — заведён по образцу пары выше)
```""",
    "03 §4.3: коды LINEAGE_*",
)

# ── B. 02 ────────────────────────────────────────────────────────────────

patch(
    P02,
    """CREATE INDEX idx_lineage_parent_name ON synthesis_lineage(parent_name) 
  WHERE parent_type = 'philosopher';
```
""",
    """CREATE INDEX idx_lineage_parent_name ON synthesis_lineage(parent_name) 
  WHERE parent_type = 'philosopher';
```

> **8.5 (2026-09-14):** у строк `parent_type='synthesis'` колонка
> `parent_name` остаётся NULL и при привязке через `POST
> /syntheses/:id/lineage/link` — имя родителя из файла в БД не пишется,
> имя даёт JOIN с `syntheses.title`. Импорт файлов одностраничника
> (без UUID) строк `synthesis` не создаёт вовсе: родителя выбирает человек по
> предложению `lineageCandidates` (03 §2.2/§2.8), `position` у такой строки —
> `max(position)+1` среди родителей синтеза.
""",
    "02 §2.4: примечание 8.5",
)

# ── C. 04 ────────────────────────────────────────────────────────────────

patch(
    P04,
    """| `scripts/bootstrap-admin.ts`, `packages/shared/constants/auth.ts` |""",
    """| `normalizeConceptTitle` / `findSameOwnerSynthesesByTitle` / `isDescendantOf` / `linkParent` в `server/services/lineage-service.ts`; `POST /:id/lineage/link` в `server/routes/lineage.ts`; `lineageCandidates` в `import-service.ts`; `linkParent` в `client/api/lineage.ts`; блок `LineageCandidateBlock` в `client/pages/ImportPage.tsx` | НОВОЕ (8.5): в исходнике генеалогия жила в объекте файла и UUID не знала — сопоставление концепции-родителя ПО ИМЕНИ среди синтезов владельца (предложением, без записи), привязка по выбору человека с заслонами LINEAGE_SELF/LINEAGE_CYCLE/LINEAGE_EXISTS (цикл — проверкой ПОТОМКОВ); ветка UUID 4.3 сохранена. Второй шаг кнопок у «Связать» — правило 8.4 (отвязки нет) |
| `scripts/bootstrap-admin.ts`, `packages/shared/constants/auth.ts` |""",
    "04 §4: строка 8.5",
)

# ── D. 05 ────────────────────────────────────────────────────────────────

patch(
    P05,
    """│   │   ├── lineage.ts                  # GET ancestors, descendants, search
""",
    """│   │   ├── lineage.ts                  # GET ancestors, descendants, search
│   │   │                               # 8.5: + POST /:id/lineage/link (владелец обоих,
│   │   │                               #  LINEAGE_SELF/CYCLE/EXISTS)
""",
    "05: routes/lineage.ts",
)

patch(
    P05,
    """│   │   ├── lineage-service.ts          # Рекурсивные CTE для навигации по графу (НОВОЕ)
""",
    """│   │   ├── lineage-service.ts          # Рекурсивные CTE для навигации по графу (НОВОЕ)
│   │   │                               # 8.5: + normalizeConceptTitle, findSameOwnerSynthesesByTitle
│   │   │                               #  (сопоставление родителя по имени), isDescendantOf, linkParent
""",
    "05: lineage-service.ts",
)

patch(
    P05,
    """│   │   ├── import-service.ts           # importHTML, extractMetadata, extractSections,
│   │   │                               # buildDocStateFromImport
│   │   │                               # (importHTML … buildDocStateFromImport)
""",
    """│   │   ├── import-service.ts           # importHTML, extractMetadata, extractSections,
│   │   │                               # buildDocStateFromImport
│   │   │                               # (importHTML … buildDocStateFromImport)
│   │   │                               # 8.5: ImportResult += lineageCandidates — родители без
│   │   │                               #  UUID сопоставляются по имени предложением (ветка UUID цела)
""",
    "05: import-service.ts",
)

patch(
    P05,
    """│   │   │   ├── lineage.ts
│   │   │   ├── billing.ts""",
    """│   │   │   ├── lineage.ts              # 3.2: ancestors/descendants/search; 8.5: + linkParent
│   │   │   ├── billing.ts""",
    "05: api/lineage.ts",
)

patch(
    P05,
    """│   │   │   ├── ImportPage.tsx
""",
    """│   │   │   ├── ImportPage.tsx          # 4.3; 8.5: блок предложения родителя (LineageCandidateBlock:
│   │   │   │                           #  .callout.note, «Связать» вторым шагом / «Пропустить»)
""",
    "05: ImportPage.tsx",
)

patch(
    P05,
    """│                                   # в HEAD 83aaf2b его не было — upload не перенёс dotfile;
│                                   # и СНОВА воссоздан 8.4 — в HEAD 8f9bae0 его опять нет)
""",
    """│                                   # в HEAD 83aaf2b его не было — upload не перенёс dotfile;
│                                   # и СНОВА воссоздан 8.4 — в HEAD 8f9bae0 его опять нет;
│                                   # и В ТРЕТИЙ РАЗ воссоздан 8.5 — HEAD cd46374, вместе с
│                                   # .dev-billing/ в .gitignore и STRIPE_PRICE_* в .env.example)
""",
    "05: .env.local.example воссоздан 8.5",
)

# ── E. 07 — исправления текста 8.5 ───────────────────────────────────────

patch(
    P07,
    """- `02-data-model.md` (§2.5 synthesis_lineage — `parent_type`, `parent_synthesis_id`, `position`)""",
    """- `02-data-model.md` (§2.4 synthesis_lineage — `parent_type`, `parent_synthesis_id`, `position`; текст беседы писал «§2.5» — это sections, поправлено 8.5)""",
    "07 8.5: адрес 02 §2.4",
)

patch(
    P07,
    """- `docs/fragments-for-conversations/5-6-ui-kit.md` — блок предложения родителя в ImportPage; новых классов, скорее всего, не потребуется (`.callout`, `.action-btn`), но сверить
- Исходник: НУЖЕН ТОЛЬКО ДЛЯ СПРАВКИ — `reconstructGenealogy` уже портирован в 3.2 (`client/utils/genealogy.ts`); заново не портировать.""",
    """- `docs/fragments-for-conversations/5-6-ui-kit.md` — блок предложения родителя в ImportPage; новых классов, скорее всего, не потребуется (`.callout`, `.action-btn`), но сверить
- Исходник: НУЖЕН ТОЛЬКО ДЛЯ СПРАВКИ — `reconstructGenealogy` уже портирован в 3.2 (`client/utils/genealogy.ts`); заново не портировать.
- Уточнение 8.5: `POST /syntheses/import` живёт в `server/routes/import.ts` (4.3), а не в `routes/syntheses.ts` — последний в этой беседе не правится; блока «По факту 3.1» в 07 нет (итоги 3.1 — глава 08).""",
    "07 8.5: routes/import.ts и «По факту 3.1»",
)

patch(
    P05,
    """    │                                   # Claude :3884 держит стрим по маркеру SLOW84 (слот занят → 409)
""",
    """    │                                   # Claude :3884 держит стрим по маркеру SLOW84 (слот занят → 409);
    │                                   # test-85 — фикстуры из живого файла одностраничника (T85_FILE),
    │                                   # без мока Claude; smoke-85 — чистые ядра + живая БД
""",
    "05: tests test-85/smoke-85",
)


# ══ ЗАВЕРШЕНИЕ БЕСЕДЫ (2026-09-14) ═══════════════════════════════════════
P08 = "docs/08-history.md"
P09 = "docs/09-lessons.md"
PRE = "README.md"

# 07 — «По факту 8.5» перед 8.6
patch(
    P07,
    """- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 8.6: Модель публичности и гостевой доступ (бэкенд)""",
    """- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 8.5 (2026-09-14) — отступления от буквы запроса и найденное:**

1. **Диагноз подтверждён на живом файле**: 0 UUID, 0 «synthesisId»; genealogy
   — «Вмещающий разлом» ← Юнг + концепция «Грамматика самоотрицания» со
   своим деревом (2 концепции ↓ 4 философа). Квирк одностраничника:
   `params.phil` файла несёт имя КОНЦЕПЦИИ в ёлочках наравне с философами —
   на сопоставление не влияет (имя берётся из genealogy), на шапку/validate
   — да (концепция считается философом).
2. **Третий код ошибки.** Текст п.3 для «пара уже есть → 409» кода не
   называл; заведён `LINEAGE_EXISTS` (03 §4.3, ApiErrorCode) — клиент
   трактует его как достигнутую цель (блок становится «связана»).
3. **Владение родителем проверяет роут, не сервис**: `linkParent` знает
   только структурные заслоны (self/exists/cycle); 403 у чужого родителя —
   `routes/lineage.ts`, публичность родителя правом НЕ считается (довод
   запроса: сопоставление шло по имени). `parentName` обязателен, но в БД не
   пишется — `parent_name` модели 02 §2.4 есть имя философа.
4. **`LineageCandidate.position`** — место родителя в participants файла, а
   строка `linkParent` получает `max(position)+1` среди родителей синтеза; на
   живом файле оба равны 1, вообще — разные числа (03 §2.2).
5. **Второй шаг кнопок у «Связать»** — отвязки нет (п. «чего не делать»),
   действие необратимо, применено правило 8.4: «Точно связать?»/«Отмена»,
   клик мимо блока сбрасывает. Текст запроса второго шага не требовал.
6. **Авто-переход к синтезу** — когда ВСЕ блоки решены и хотя бы один связан;
   при одних «Пропустить» остаёмся на странице с кнопкой «Перейти к
   синтезу» (п.5 запроса говорил только о переходе «после связывания»).
   Блоки заводятся только для родителей С совпадениями; про отсутствие
   совпадений говорит предупреждение сервера («можно импортировать и
   привязать позже»).
7. **п.6 подтверждён без правок 3.2**: после связывания `parentSyntheses`
   ребёнка непуст → `isMetaSynthesis` true → «Генеалогическое древо»
   рисуется, транзитивно с философами родителя (R3 test-85).
8. **Дыры текста беседы, исправленные патчем запроса 1**: 02 «§2.5
   synthesis_lineage» — верно §2.4 (§2.5 — sections); «`routes/syntheses.ts`
   в части POST /syntheses/import» — роут импорта живёт в `routes/import.ts`
   (4.3), syntheses.ts не правился; блока «По факту 3.1» в 07 нет (итоги 3.1
   — глава 08).
9. **Грабля «импорт файла в 1,1 МБ идёт заметное время, прогон в фоне»
   неверна как обоснование**: `importHTML` живого файла — ~0,4 с на сервере,
   переход в браузере — секунды. Фон нужен по общему лимиту вызова
   инструмента, а не из-за файла; формулировка в «граблях заведомо» выше
   оставлена как исторический след.
10. **Тестовый запрос R3 требует ФАЙЛА родителя**, которого у беседы нет:
    харнесс test-85 строит его из присланного файла (заголовок + корень
    genealogy → «Грамматика самоотрицания», участники → философы) и файл с
    двумя родителями (второй концепт в genealogy) — `T85_FILE` задаёт путь
    к живому файлу.
11. **Долг оснастки §12 (8.4) закрыт**: test-54 — ожидания «typeCatalogId=null»
    и «свободный текст» перевёрнуты под факт 5.5 («из каталога»); таймаут R5b
    был ожиданием «≈» — TaxonomySelector не зовёт normalize, когда тип уже
    из каталога, список без «≈»; R5b выбирает другой тип каталога. 80 ✓.
12. **Найдено вне беседы**: `gm-hint` в GraphModal без CSS-правила (css-parity
    раздел C) предсуществует в HEAD cd46374 — не 8.5; dotfile-грабля
    выкладки повторилась ТРЕТИЙ раз (`.env.local.example`, `.dev-billing/`,
    `STRIPE_PRICE_*`) — воссозданы первым делом беседы.
13. **integration-check упёрся в TS2563** («module body is too large for
    control flow analysis») — секции 5ab и 2ac/4an заведены async-функциями
    с `await`, не блоками; так же заводить следующие (09 §5).

---

### Беседа 8.6: Модель публичности и гостевой доступ (бэкенд)""",
    "07: «По факту 8.5»",
)

patch(
    P07,
    """> (проведена 2026-09-14) · 8.5 родословная при импорте.""",
    """> (проведена 2026-09-14) · 8.5 родословная при импорте (проведена
> 2026-09-14). Фаза в первоначальном составе закрыта; 8.6/8.7 (публичность,
> витрина) добавлены 2026-09-14 и не проведены.""",
    "07: врезка Фазы 8 — 8.5 проведена",
)

patch(
    P07,
    """TaxonomySelector надо перевернуть под факт 5.5 («≈ из каталога»), а
таймаут R5b — разобрать. Продуктовых долгов 8.4 не оставила.
""",
    """TaxonomySelector надо перевернуть под факт 5.5 («≈ из каталога»), а
таймаут R5b — разобрать. Продуктовых долгов 8.4 не оставила.
ЗАКРЫТ 8.5 (2026-09-14): ожидания перевёрнуты («из каталога»), R5b выбирает
другой тип каталога (normalize при типе из каталога не зовётся — в этом и
был таймаут); 80 ✓ («По факту 8.5» п.11).

Беседа 8.5 (2026-09-14) долгов не оставила: реестр пуст. Ограничения без
адресата (не долги): отвязки родителя (`DELETE lineage/link`) нет — обязанность
не возникла, и она тянет вопрос о дереве потомков («чего не делать» 8.5);
`gm-hint` в GraphModal без CSS-правила предсуществует (чей — решать при
следующем касании GraphModal).
""",
    "07 §12: test-54 закрыт, 8.5 без долгов",
)

# 08 — Часть I
patch(
    P08,
    """пропатчены scripts/patch-docs-conv84.py. §12: один долг оснастки (test-54
устарел с 5.5) → 8.5.
""",
    """пропатчены scripts/patch-docs-conv84.py. §12: один долг оснастки (test-54
устарел с 5.5) → 8.5.
Беседа 8.5 (родословная при импорте — сопоставление родителя; бэкенд +
клиент) ЗАКРЫТА 2026-09-14: диагноз подтверждён на живом файле PS-6933-6RIK
(0 UUID — ветка UUID 4.3 мертва для файлов одностраничника, сохранена для
экспорта 4.2); lineage-service += normalizeConceptTitle/
findSameOwnerSynthesesByTitle/isDescendantOf/linkParent; import-service →
lineageCandidates ПРЕДЛОЖЕНИЕМ (связь по имени не пишется даже при единственном
совпадении); POST /syntheses/:id/lineage/link (владелец обоих, LINEAGE_SELF /
LINEAGE_EXISTS / LINEAGE_CYCLE по потомкам); ImportPage — блок предложения
родителя (.callout.note, «Связать» вторым шагом, «Пропустить», авто-переход);
дерево 3.2 рисуется без правок (смоук 45 ✓, tests/test-85-requests2-8.mjs
53 ✓ ×2 в браузере; check:integration += 2ac/4an/5ab; долг оснастки test-54
закрыт — 80 ✓); доки пропатчены scripts/patch-docs-conv85.py. Реестр §12
пуст. Первоначальный состав Фазы 8 (8.1–8.5) закрыт; остались 8.6/8.7.
""",
    "08 Часть I: строка 8.5",
)

# 08 — Часть II глава (перед главой 8.4)
patch(
    P08,
    """### Беседа 8.4 — Управление своим содержимым: каталог, капсула, связь (клиент) [ЗАКРЫТА 2026-09-14]
""",
    """### Беседа 8.5 — Родословная при импорте: сопоставление родителя (бэкенд + клиент) [ЗАКРЫТА 2026-09-14]

> Запрос 1 целиком (shared/types/lineage + lineage-service + import-service
> шаг l + routes/lineage POST link + routes/import + клиент api/lineage,
> api/import, client.ts, ImportPage + scripts/patch-docs-conv85.py, 14 правок)
> → патч philosynth-conv85-request1.patch; тестовые запросы R2–R8 одним
> харнессом tests/test-85-requests2-8.mjs (53 ✓ ×2 за ~1,5 мин: сервер :3000 +
> vite :5199 + PG16/Redis + Chrome, без мока Claude — генерация не
> запускается); блок завершения: typecheck 0, check:integration += 2ac/4an/5ab
> → INTEGRATION OK, audit/check-map/css-parity чисты (gm-hint — чужой
> предсуществующий), долг оснастки test-54 закрыт (80 ✓). Первое дело беседы —
> dotfile-грабля выкладки в третий раз (HEAD cd46374).

#### Что сделано
- `packages/shared/types/lineage.ts` += LineageCandidate/LineageCandidateMatch/
  LinkParentInput.
- `server/services/lineage-service.ts` += `normalizeConceptTitle` (ёлочки,
  лапки, обычные кавычки → пусто; пробелы схлопнуты; регистр),
  `findSameOwnerSynthesesByTitle(userId, name, excludeId)` (ТОЛЬКО тот же
  владелец; нормализация в TS — один источник истины),
  `isDescendantOf(root, candidate)` (CTE по ПОТОМКАМ, потолок 100 защитный),
  `linkParent` (position = max+1; LineageLinkError: LINEAGE_SELF →
  LINEAGE_EXISTS → LINEAGE_CYCLE).
- `server/services/import-service.ts` шаг l: ветка UUID 4.3 без изменений;
  после её неудачи — совпадения по имени → `ImportResult.lineageCandidates`,
  связь не пишется; предупреждение lineage в две ветки («N совпадений —
  выберите» / «не найдена — импортировать и привязать позже»).
- `server/routes/lineage.ts` += `POST /:id/lineage/link` — тело → 404 ребёнка
  → 403 не владелец → 400 LINEAGE_SELF → 404 родителя → 403 чужой родитель
  (публичность не право) → 409 LINEAGE_EXISTS → 409 LINEAGE_CYCLE.
- Клиент: `ApiErrorCode` += 3 кода; `api/lineage.linkParent`; `api/import`
  терпим к ответу без lineageCandidates; `ImportPage` — LineageCandidateBlock
  на классах кита (.callout.note/.action-btn): по блоку на родителя с
  совпадениями, «Связать» вторым шагом со сбросом кликом мимо, «Пропустить»,
  LINEAGE_EXISTS = связана, авто-переход при «все решены и ≥1 связан».
- integration-check 5ab (живьём) и 2ac/4an (контракты) — async-функциями
  (TS2563 у тела модуля).
- test-54 (долг §12 8.4) переведён на факт 5.5.

#### Решения (см. «По факту 8.5»)
Третий код LINEAGE_EXISTS; владение — в роуте; parentName не пишется;
второй шаг у «Связать»; авто-переход только при связи; фикстуры R3/R5 из
живого файла (T85_FILE).

#### Для следующих бесед
- **8.6** (публичность): `routes/lineage.ts` теперь несёт POST link с
  проверкой владения ОБОИХ — при переписывании loadSynthesisForRead под
  visibility эту проверку оставить владельческой (сопоставление по имени —
  чужие не идут); `pruneInvisible` потомков — под новую модель.
- Любая работа с импортом: import-service шаг l (lineageCandidates),
  ImportPage (блок), test-85 (фикстуры из живого файла).

### Беседа 8.4 — Управление своим содержимым: каталог, капсула, связь (клиент) [ЗАКРЫТА 2026-09-14]
""",
    "08 Часть II: глава 8.5",
)

# 08 — Часть III
patch(
    P08,
    """> **Правки 2026-09-14 (итоги беседы 8.4)**: управление своим содержимым""",
    """> **Правки 2026-09-14 (итоги беседы 8.5)**: родословная при импорте закрыта
> (запрос 1 + смоук tests/smoke-85-request1.mjs 45 ✓ + все тестовые запросы
> tests/test-85-requests2-8.mjs 53 ✓ ×2 в браузере; check:integration +=
> 2ac/4an/5ab). 03 §2.2 — POST /import += lineageCandidates, §2.8 — POST
> /syntheses/:id/lineage/link, §4.3 — LINEAGE_SELF/CYCLE/EXISTS; 02 §2.4 —
> примечание 8.5; 04 §4 строка 8.5; 05 — routes/lineage, lineage-service,
> import-service, api/lineage, ImportPage, tests, .env.local.example ×3; 07 —
> текст 8.5 (02 §2.4, routes/import.ts, «По факту 3.1»), «По факту 8.5»,
> врезка Фазы 8, §12 (test-54 закрыт, 8.5 без долгов); 09 §1 (TS2563 —
> секции функциями), §2 (dotfile ×3), §4 (капитель summary, фикстуры из
> живого файла), §8 («заметное время» неверно).
>
> **Правки 2026-09-14 (итоги беседы 8.4)**: управление своим содержимым""",
    "08 Часть III: правки 8.5",
)

# 09 — уроки
patch(
    P09,
    """## 2. Патч-скрипты доков и оснастка извлечения
""",
    """### Беседа 8.5
- **integration-check.mts упёрся в TS2563** («The containing function or
  module body is too large for control flow analysis») — после этого tsc
  теряет вывод типов и сыпет TS7006 в чужих секциях. Новые секции (с 8.5)
  заводить `async function sectionNN()` + `await sectionNN()`, не блоками
  `{ … }` на верхнем уровне; старые не переписывать.

## 2. Патч-скрипты доков и оснастка извлечения
""",
    "09 §1: TS2563 в integration-check",
)

patch(
    P09,
    """### Беседа 8.4

- **Dotfile-грабля повторилась в следующей же выкладке** (HEAD 8f9bae0):""",
    """### Беседа 8.5

- **Dotfile-грабля — ТРЕТИЙ раз подряд** (HEAD cd46374): те же три потери
  (`.env.local.example`, `.dev-billing/` в `.gitignore`, `STRIPE_PRICE_*` в
  `.env.example`). Абзацы в 09 не помогают — файлы теряются не по забывчивости,
  а способом выкладки. Кандидат в решение: держать `.env.local.example` под
  именем без точки (`env.local.example`) с копированием в dev-billing.sh, а
  `.dev-billing/` вместо `.gitignore` — в `.git/info/exclude` или переименовать
  папку стенда в `dev-billing-state/`. Решать при 8.6.

### Беседа 8.4

- **Dotfile-грабля повторилась в следующей же выкладке** (HEAD 8f9bae0):""",
    "09 §2: dotfile ×3",
)

patch(
    P09,
    """## 5. Node, TypeScript, сборка
""",
    """### Беседа 8.5
- **`summary` шапки документа (`.header-disclosure`) — капителью**:
  `innerText` отдаёт «ГЕНЕАЛОГИЧЕСКОЕ ДРЕВО», ожидание по `innerText` висит до
  таймаута; сверять `textContent` (та же грабля 1.5/6.2 в новом месте).
- **Файла родителя у беседы нет — строить из присланного**: STATE_RE по
  `<script type="application/json" id="philosynth-state">`, править
  `genealogy.name`/`participants`/`params.phil` и `id="docTitle"`; второй
  родитель — ещё один `{type:'concept'}` в `genealogy.participants`. Путь к
  живому файлу — `T85_FILE`; фикстуры кладутся в /tmp/t85-*.html.
- **Импорт файла 1,1 МБ — ~0,4 с на сервере**: фон прогона нужен по лимиту
  вызова инструмента (~2 мин), а не из-за файла.
- **Гигиена сирот перед прогоном**: `ps aux | grep -E "[s]erver/index|[v]ite
  --port" | awk '{print $2}' | xargs -r kill -9` — без pkill по маске, которая
  убивает собственную оболочку (грабли 1.7/5.2/5.5).

## 5. Node, TypeScript, сборка
""",
    "09 §4: капитель summary, фикстуры, время импорта, сироты",
)

# README — таблица фаз
patch(
    PRE,
    """8.3 закрыта 2026-09-09; 8.4 закрыта 2026-09-14 |""",
    """8.3 закрыта 2026-09-09; 8.4, 8.5 закрыты 2026-09-14; 8.6/8.7 добавлены 2026-09-14, не проведены |""",
    "README: таблица фаз",
)


patch(
    P07,
    """- `02-data-model.md` (§2.4 syntheses — `is_public` заменяется тремя осями; §2.5 synthesis_lineage)""",
    """- `02-data-model.md` (§2.3 syntheses — `is_public` заменяется тремя осями; §2.4 synthesis_lineage; текст писал §2.4/§2.5 — адреса сдвинуты на один, поправлено 8.5)""",
    "07 8.6: адреса 02 §2.3/§2.4",
)

print(f"\nИтог: applied={applied}, skip={skipped}, fail={failed}")
raise SystemExit(1 if failed else 0)
