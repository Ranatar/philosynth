#!/usr/bin/env python3
"""Патч доков: раскладка тестов/патчей + актуализация README после 1.5b.

Межбеседное обслуживание (после закрытия 1.5b, по запросу пользователя):
  1. Все тесты бесед сведены в tests/ (из корня репо — 11 файлов, из
     scripts/ — 2 файла 0.3b, из server/ — smoke-1.4.mts и smoke-1.4b.mts);
     запуск по-прежнему из корня. Попутно починены 5 ЛАТЕНТНО СЛОМАННЫХ
     спецификаторов: tests/test-05-request2/3/4.mjs и
     tests/test-06-request2-api.mjs импортировали "./server/…"
     (незапускаемы со своего места), tests/test-11-request5.mjs —
     "./packages/…".
  2. tests/package.json (type=module, как в scripts/) — иначе tsc/NodeNext
     трактует tests/*.ts как CommonJS (TS1295).
  3. scripts/tsconfig.json: include += ../tests/*.ts и ../tests/*.mts
     (закрыта дыра: smoke-1.4*.mts раньше НЕ типочекались нигде),
     jsx=react-jsx (smoke-1.4b.mts импортирует PauseModal.tsx).
  4. В server/ остаются ТОЛЬКО workspace-регрессия audit.mts и
     integration-check.mts (npm-скрипты пакета, tsconfig.checks.json).
  5. README: раздел «Структура» и «Регрессионные проверки» обновлены,
     статус дополнен беседой 1.5b, «Не сделано»/«Следующая» переписаны.
  6. 05-file-structure: scripts/ пополнен фактическим составом, добавлен
     корневой блок tests/.
  7. NEXT-CONTEXT: глава межбеседного обслуживания с маппингом путей.

Идемпотентный: probe нового текста → skip; нет якоря → FAIL. str.replace.
Запуск из корня: python3 scripts/patch-docs-repo-layout.py
"""
from pathlib import Path

applied, skipped, failed = [], [], []

def patch(path: str, old: str, new: str, tag: str, marker: str | None = None) -> None:
    p = Path(path)
    s = p.read_text(encoding="utf-8")
    probe = marker if marker is not None else new
    if probe in s:
        skipped.append(tag); return
    if old not in s:
        failed.append(f"{tag}: якорь не найден в {path}"); return
    p.write_text(s.replace(old, new, 1), encoding="utf-8")
    applied.append(tag)

# ══ 1. README: Структура ══
patch(
    "README.md",
    """scripts/           extract-seed-data.mjs, seed-prompts/-configs/-taxonomy,
                   идемпотентные патч-скрипты доков, тесты 0.3b
docs/              7 проектных документов + fragments-for-conversations/
tests/             браузерные/API-тесты бесед 0.4–0.6 (puppeteer / mini-Hono)
```""",
    """scripts/           эксплуатационные скрипты: extract-seed-data.mjs,
                   extract-section-templates.mjs, seed-prompts/-configs/
                   -taxonomy, идемпотентные патч-скрипты доков
                   (patch-docs-*.py)
docs/              7 проектных документов + fragments-for-conversations/
tests/             ВСЕ тесты бесед (0.3b–1.5b): vm-смоуки байтовой сверки
                   с исходником (smoke-*.mjs/.mts), API-тесты (mini-Hono),
                   браузерные (puppeteer + системный Chromium). Запуск из
                   корня репо: `node tests/<файл>` / `npx tsx tests/<файл>`.
                   Типовое покрытие tests/*.ts и *.mts — через
                   `npm run typecheck:scripts`
```

Workspace-регрессия (`server/audit.mts`, `server/integration-check.mts`)
намеренно живёт в server/ — это npm-скрипты пакета
(`npm run audit / check:integration -w server`, tsconfig.checks.json).""",
    "L/1 README Структура: scripts/tests/server-регрессия",
    marker="ВСЕ тесты бесед (0.3b–1.5b)",
)

# ══ 2. README: Регрессионные проверки — 1.5b в покрытии ══
patch(
    "README.md",
    """`check:integration` расширяется секциями по мере бесед — 1.5 добавила
4m/5m: клиент-модули формы/прогресса, контракты и живые /estimate и
/advice (сейчас покрывает
0.1–0.6 и 1.1–1.5); живые секции требуют поднятых PG и Redis и засеянных
prompt_templates, synthesis_configs и каталогов таксономии.""",
    """`check:integration` расширяется секциями по мере бесед — 1.5b добавила
4n: модули пула (pool-store без snapshotCurrentState, concept-file,
PoolCard/ConceptPool, SYNTH_READY_SECTIONS) и контракты (гейт
мета-синтеза до 3.1/4.3, prepareForGeneration перед POST,
CONTEXT_BUDGET_PREVIEW локализован). Сейчас покрывает 0.1–0.6 и
1.1–1.5b; живые секции требуют поднятых PG и Redis и засеянных
prompt_templates, synthesis_configs и каталогов таксономии.""",
    "L/2 README Регрессия: 4n и покрытие до 1.5b",
    marker="1.5b добавила\n4n:",
)

# ══ 3. README: заголовок статуса ══
patch(
    "README.md",
    "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.5 закрыты",
    "## Статус: Фаза 0 завершена; Фаза 1 — беседы 1.1–1.5b закрыты",
    "L/3 README статус-заголовок 1.5b",
)

# ══ 4. README: блок 1.5b после блока 1.5 ══
patch(
    "README.md",
    """Тесты: tests/test-15-requests2-7.mjs 40/40 ✓ (браузерные, puppeteer;
БД-ассерты гранулярного парсинга внутри теста).""",
    """Тесты: tests/test-15-requests2-7.mjs 40/40 ✓ (браузерные, puppeteer;
БД-ассерты гранулярного парсинга внутри теста).

Беседа 1.5b (Unified Concept Pool, клиент): pool-store (Zustand:
☑ участие в мета-синтезе / ◉ просмотр / derived conceptParticipants),
concept-file.ts — клиентские порты 1:1 (parseConceptFile,
importConceptAsParticipant, extract-цепочка, fetchWithFallback);
ConceptPool + PoolCard в SynthesisForm, secSynthReady c автовключением
обязательных разделов, FullBudgetPreview. Снимки вырождены (локальных
правок в сервисе нет), просмотр ◉ — read-only предпросмотр; сабмит с
☑-концепциями гейтится до 3.1/4.3. Тесты: смоук байтовой сверки 38/38 ✓
(tests/smoke-15b-request1.mjs), браузерный 35/35 ✓
(tests/test-15b-requests2-5.mjs). Доки пропатчены
scripts/patch-docs-conv15b.py (11 правок, идемпотентно).""",
    "L/4 README блок беседы 1.5b",
    marker="Беседа 1.5b (Unified Concept Pool, клиент): pool-store",
)

# ══ 5. README: «Не сделано» и «Следующая» ══
patch(
    "README.md",
    """Не сделано (Фаза 1+): страницы синтеза/каталога/графа (1.6),
Unified Concept Pool + secSynthReady + превью keepFullBudget (1.5b),
applyReplacement и точный confirm деградации skip (2.x), каскады и план
редактирования (plan-executor — снимет RESUME_INVALID с resume_plan
retry/skip_step), мета-синтез, режимы, экспорт/импорт, billing,
BYO-Key (6.1 — ввод ключа в auth-модалке).
Следующая по графу 07 — беседа 1.6 (страница синтеза + каталог;
закроет TODO(1.6): pausedState из GET /syntheses/:id) либо параллельно
1.5b (Unified Concept Pool) / 2.1 (cascade-analyzer) / 2.2 (regeneration
+ plan-executor).""",
    """Не сделано (Фаза 1+): страницы синтеза/каталога/графа (1.6, 1.7),
applyReplacement и точный confirm деградации skip (2.x), каскады и план
редактирования (plan-executor — снимет RESUME_INVALID с resume_plan
retry/skip_step), мета-синтез (3.1 — снимет гейт ☑-концепций в форме и
даст estimate-diff превью бюджета), полный пул с деревом (3.2), режимы,
экспорт/импорт (4.x — серверный parseConceptFile), billing, BYO-Key
(6.1 — ввод ключа в auth-модалке).
Следующая по графу 07 — беседа 1.6 (страница синтеза + каталог;
закроет TODO(1.6): pausedState из GET /syntheses/:id и полноценный
просмотр импортированной концепции) либо параллельно 1.7 (граф) /
2.1 (cascade-analyzer) / 3.1 (мета-синтез).""",
    "L/5 README Не сделано/Следующая",
    marker="мета-синтез (3.1 — снимет гейт ☑-концепций",
)

# ══ 6. 05: scripts/ фактический состав + корневой tests/ ══
patch(
    "docs/05-file-structure.md",
    """└── scripts/
    ├── seed-prompts.ts                 # Начальное заполнение prompt_templates из исходника
    ├── seed-configs.ts                 # Начальное заполнение synthesis_configs из исходника
    ├── seed-taxonomy.ts                # Заполнение каталогов типов (18 категорий + 29 связей)
    └── migrate-html-files.ts           # Массовый импорт HTML-файлов в БД
```""",
    """├── scripts/
│   ├── seed-prompts.ts                 # Начальное заполнение prompt_templates из исходника
│   ├── seed-configs.ts                 # Начальное заполнение synthesis_configs из исходника
│   ├── seed-taxonomy.ts                # Заполнение каталогов типов (18 категорий + 29 связей)
│   ├── extract-seed-data.mjs           # vm-извлечение конфигов/промптов из исходника
│   ├── extract-section-templates.mjs   # Генерация section.* шаблонов Registry
│   ├── patch-docs-*.py                 # Идемпотентные патчи доков по итогам бесед (skip/fail-отчёт)
│   ├── package.json                    # Маркер type=module
│   ├── tsconfig.json                   # Типочек scripts/*.ts + tests/*.ts|*.mts (typecheck:scripts)
│   └── migrate-html-files.ts           # Массовый импорт HTML-файлов в БД (Фаза 4)
│
└── tests/                              # ВСЕ тесты бесед; запуск из корня репо
    ├── smoke-*.mjs / smoke-*.mts       # vm-смоуки байтовой сверки порта с исходником
    ├── test-XX-*.mjs                   # API- и браузерные тесты запросов бесед (puppeteer)
    ├── test-*-0.3b.ts                  # Регрессионные смоуки таксономии
    └── package.json                    # Маркер type=module
```

Workspace-регрессия `audit.mts` и `integration-check.mts` — в server/
(npm-скрипты пакета + tsconfig.checks.json), не в tests/.""",
    "L/6 05 scripts-состав + корневой tests/",
    marker="└── tests/                              # ВСЕ тесты бесед",
)

# ══ 7. NEXT-CONTEXT: глава межбеседного обслуживания ══
CHAPTER = """

# Межбеседное обслуживание после 1.5b — раскладка тестов [ЗАКРЫТО]

По запросу пользователя тесты/патчи сведены к единой раскладке; README
актуализирован (беседа 1.5b, структура, регрессия).

## Маппинг перемещений (старое → новое)

- Корень репо → tests/: smoke-12-request1.mjs, smoke-13-request1.mjs,
  test-11-request2…7.mjs, test-12-requests2-8.mjs,
  test-13-requests2-7.mjs, test-14-requests2-8.mjs
  (спецификаторы "./server/ → "../server/; test-11-request5 —
  и "./packages/ → "../packages/).
- scripts/ → tests/: test-custom-type-0.3b.ts, test-normalize-0.3b.ts
  (импорты не менялись — та же глубина "../server/…").
- server/ → tests/: smoke-1.4.mts, smoke-1.4b.mts ("./services|db|utils/
  → "../server/…"; чтение исходника join(here,"..","source") валиден с
  той же глубины).

## Починенные ЛАТЕНТНЫЕ поломки (существовали до переезда)

tests/test-05-request2/3/4.mjs и tests/test-06-request2-api.mjs
импортировали "./server/…" — были незапускаемы со своего места
(когда-то переехали в tests/ без правки путей). Починены; контрольный
прогон test-05-request2 — 9/9 ✓.

## Правила раскладки (для следующих бесед)

- tests/ — ВСЕ тесты бесед; запуск из корня репо (CWD-зависимые
  readFileSync("source/…") законны); файл-относительные импорты —
  строго "../server/…", "../packages/…", "../client/…".
- server/audit.mts + server/integration-check.mts — workspace-регрессия,
  остаются в server/ (npm -w server, tsconfig.checks.json).
- scripts/ — сиды, экстракторы, идемпотентные патчи доков.
- tests/package.json (type=module) обязателен: без него tests/*.ts под
  NodeNext — CommonJS (TS1295).
- scripts/tsconfig.json типочекает scripts/*.ts + ../tests/*.ts +
  ../tests/*.mts (jsx=react-jsx — smoke-1.4b.mts импортирует
  PauseModal.tsx); закрыта дыра: smoke-1.4*.mts раньше не типочекались
  нигде.

## Верификация переезда

typecheck + typecheck:scripts 0 ошибок; audit «расхождений не найдено»;
INTEGRATION OK; перемещённые: smoke-1.4 8/8, smoke-1.4b 27/27,
smoke-12 121/121, smoke-13 92/92, test-11-request2 9/9,
test-normalize-0.3b OK, test-05-request2 9/9 (латентный);
неперемещённые 1.5b: смоук 38/38, браузерный 35/35.
Доки/README — scripts/patch-docs-repo-layout.py (идемпотентный)."""

def append_chapter() -> None:
    tag = "L/7 NEXT-CONTEXT глава межбеседного обслуживания"
    p = Path("NEXT-CONTEXT.md")
    s = p.read_text(encoding="utf-8")
    if "# Межбеседное обслуживание после 1.5b — раскладка тестов [ЗАКРЫТО]" in s:
        skipped.append(tag); return
    p.write_text(s.rstrip("\n") + CHAPTER + "\n", encoding="utf-8")
    applied.append(tag)

append_chapter()

print("APPLIED:", len(applied))
for t in applied: print("  +", t)
print("SKIPPED:", len(skipped))
for t in skipped: print("  =", t)
print("FAILED:", len(failed))
for t in failed: print("  !", t)
raise SystemExit(1 if failed else 0)
