#!/usr/bin/env python3
"""Патч документации по беседе 11.2 (язык интерфейса — сервер, кодмод, Д-16).
ЧАСТЬ I — ПЕРВЫЙ ЗАПРОС (2026-09-27): дыры 01–05, нужные реализации.
  A  02 §2.1 — users.ui_locale / gen_lang (миграция 0010).
  B  03 §2.1 — GET/PATCH /auth/me с uiLocale/genLang; язык ответов сервера;
     §2.2 POST /import — предупреждения разбора графа при нуле категорий;
     §2.3 SectionFull.parseWarnings.
  C  04 §2.4 — ядро resolveSubsection переехало в html-parser; §4 — новые
     модули (shared/i18n/locales, server/i18n/locale, subsection-order).
  D  05 — packages/shared/i18n/ (t.ts, locales.ts, strings.json, generated/),
     server/i18n/locale.ts, services/subsection-order.ts, миграция 0010,
     scripts/i18n/*, tests/smoke-112.
ЧАСТЬ II — ЗАКРЫТИЕ (2026-09-27): E 07, F 08, G 09, H README — см. ниже.
NEXT-CONTEXT переписывается целиком отдельным файлом, не патчем (07 §10).
Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patches/patch-docs-conv112.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
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
    if text.count(old) != 1:
        failed += 1
        print(f"  fail  {label}: якорь встречается {text.count(old)} раз")
        return
    path.write_text(text.replace(old, new), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


# ── A. 02 §2.1 users ────────────────────────────────────────────────────
patch(
    "docs/02-data-model.md",
    "  email_verified_at TIMESTAMPTZ,   -- 9.1 (миграция 0006): NULL — адрес не подтверждён\n",
    "  email_verified_at TIMESTAMPTZ,   -- 9.1 (миграция 0006): NULL — адрес не подтверждён\n"
    "  ui_locale     TEXT,              -- 11.2 (миграция 0010): язык интерфейса 'ru'|'en'|'de'\n"
    "                                   -- (UI_LOCALES, shared/i18n/locales); NULL — не выбирал:\n"
    "                                   -- язык запроса по cookie ui_locale и Accept-Language.\n"
    "                                   -- Проверяется кодом, не CHECK (список растёт без миграции)\n"
    "  gen_lang      TEXT,              -- 11.2 (миграция 0010): язык генерации по умолчанию\n"
    "                                   -- (значение syntheses.lang). PATCH /auth/me {uiLocale}\n"
    "                                   -- переписывает его правилом genLangForUi (интерфейс →\n"
    "                                   -- генерация); {genLang} меняет только его. NULL — не выбирал\n",
    "A 02 §2.1 users.ui_locale / gen_lang",
)

# ── B. 03 §2.1 /auth/me, язык ответов; §2.2 import; §2.3 SectionFull ────
patch(
    "docs/03-specification.md",
    "GET    /auth/me                → { user: { id, email, displayName, role, balanceUsd,\n"
    "                                            emailVerified } }\n"
    "                                // 9.1: emailVerified = users.email_verified_at\n"
    "                                // IS NOT NULL. Нужен полосе «Адрес не\n"
    "                                // подтверждён» в шапке; НИЧЕГО не ограничивает.\n"
    "\n"
    "PATCH  /auth/me                { displayName }\n"
    "                                → { user: { id, email, displayName, role, balanceUsd,\n"
    "                                            emailVerified } }\n"
    "                                // Смена отображаемого имени (A3, беседа 0.6).\n",
    "GET    /auth/me                → { user: { id, email, displayName, role, balanceUsd,\n"
    "                                            emailVerified, uiLocale, genLang } }\n"
    "                                // 9.1: emailVerified = users.email_verified_at\n"
    "                                // IS NOT NULL. Нужен полосе «Адрес не\n"
    "                                // подтверждён» в шапке; НИЧЕГО не ограничивает.\n"
    "                                // 11.2: uiLocale ('ru'|'en'|'de'|null) и genLang\n"
    "                                // (значение syntheses.lang | null) — users.ui_locale /\n"
    "                                // gen_lang; null — не выбирал. AuthUser сервера и\n"
    "                                // клиента несут оба поля (сторож 4e).\n"
    "\n"
    "PATCH  /auth/me                { displayName?, uiLocale?, genLang? }  — хотя бы одно\n"
    "                                → { user: { id, email, displayName, role, balanceUsd,\n"
    "                                            emailVerified, uiLocale, genLang } }\n"
    "                                // 11.2 — связь языков ОДНОСТОРОННЯЯ (правило\n"
    "                                // владельца, Фаза 11): {uiLocale} пишет ui_locale И\n"
    "                                // gen_lang = genLangForUi(uiLocale) (ru→Russian,\n"
    "                                // en→English, de→German, иначе English); {genLang}\n"
    "                                // пишет только gen_lang (trim, ≤ 60), ui_locale не\n"
    "                                // трогает. uiLocale вне UI_LOCALES → VALIDATION_ERROR\n"
    "                                // + details.uiLocale; genLang пустой → details.genLang;\n"
    "                                // ни одного поля → details.displayName «Обязательное поле».\n"
    "                                // Смена отображаемого имени (A3, беседа 0.6).\n",
    "B1 03 §2.1 GET/PATCH /auth/me: uiLocale, genLang",
)
patch(
    "docs/03-specification.md",
    "                                // details.displayName\n",
    "                                // details.displayName\n"
    "\n"
    "// ЯЗЫК ОТВЕТОВ СЕРВЕРА (11.2). Тексты ошибок и сообщений всех роутов\n"
    "// пишутся через tl(key, ru, params) (shared/i18n/t.ts) и отдаются на ЯЗЫКЕ\n"
    "// ЗАПРОСА: users.ui_locale вошедшего → cookie ui_locale → Accept-Language\n"
    "// (первый из UI_LOCALES по q; 'en-GB' → 'en') → ru. Контекст открывает\n"
    "// middleware requestLocale (server/i18n/locale.ts, AsyncLocalStorage) ДО\n"
    "// роутов; requireAuth/optionalAuth, найдя пользователя с ui_locale,\n"
    "// поднимают язык в том же контексте. Каталоги —\n"
    "// packages/shared/i18n/generated/<lang>.json (npm run i18n:split); нет\n"
    "// перевода → русский текст. Коды ошибок (code) и машинные значения языком\n"
    "// не меняются — клиент ветвится по code, не по тексту.\n",
    "B2 03 §2.1 язык ответов сервера",
)
patch(
    "docs/03-specification.md",
    "POST   /syntheses/import       multipart/form-data: file (HTML)\n"
    "                                → { id: string, warnings: ImportWarning[],\n"
    "                                    lineageCandidates: LineageCandidate[] }\n",
    "POST   /syntheses/import       multipart/form-data: file (HTML)\n"
    "                                → { id: string, warnings: ImportWarning[],\n"
    "                                    lineageCandidates: LineageCandidate[] }\n"
    "                                // 11.2 (Д-16): предупреждения разбора графа 11.1\n"
    "                                // (направление связи подставлено, роль вне\n"
    "                                // ROLE_MAP, «Таблица категорий»/«Таблица связей»\n"
    "                                // не найдены по data-section) доходят до\n"
    "                                // warnings (field 'graph') И при нуле категорий —\n"
    "                                // раньше ветка с пустым графом их глотала.\n",
    "B3 03 §2.2 import: предупреждения разбора при нуле категорий",
)
patch(
    "docs/03-specification.md",
    "                                 // гостя поля нет. Клиент у запертых карандаша\n"
    "                                 // НЕ рисует вовсе\n"
    "}\n",
    "                                 // гостя поля нет. Клиент у запертых карандаша\n"
    "                                 // НЕ рисует вовсе\n"
    "  parseWarnings?: string[];      // 11.2 (Д-16, аддитивно): предупреждения разбора\n"
    "                                 // раздела из генлога — metadata.parseWarnings строк\n"
    "                                 // ПОСЛЕДНЕЙ полной (пере)генерации раздела\n"
    "                                 // (source ≠ subsection_regen) и её подраздельных\n"
    "                                 // догенераций, без повторов. Пустой массив — разбор\n"
    "                                 // без потерь. Несёт GET /sections/:key; показ — 11.3\n"
    "}\n",
    "B4 03 §2.3 SectionFull.parseWarnings",
)

# ── C. 04 карта переиспользования ──────────────────────────────────────
patch(
    "docs/04-code-reuse-map.md",
    "потребители — `regenerateSubsection` (чтение и врезка по фактическому атрибуту) и pause-resume (`ps.expectedSubsections`) | `server/services/generation-service.ts` |",
    "потребители — `regenerateSubsection` (чтение и врезка по фактическому атрибуту) и pause-resume (`ps.expectedSubsections`). **11.2 (Д-16):** ядро `resolveSubsection` перенесено в `server/utils/html-parser.ts` (единственная точка linkedom; generation-service его реэкспортирует — context-builder импортировать generation-service не может, анти-цикл 2.1); потребители сверх прежних — `extractRelevantIntraSectionContext` (context-builder, опция `{ expectedOrder, warnings }`), `loadDocumentIndex`/`indexSectionSubsections`/`thesisLabelsFromHtml`/`subsectionSource` (recommendations: карта в КАНОНИЧЕСКИХ именах + `actualNameOf`), `recommendationProseOf` (planner), `refineElement` (element-step). Порядок для них — `services/subsection-order.ts` (`loadExpectedSubsectionOrder(synthesisId)`: строка syntheses + генеалогия → `buildSubsectionMap`) | `server/utils/html-parser.ts` (ядро), `server/services/generation-service.ts` (реэкспорт) |",
    "C1 04 §2.4 resolveSubsection → html-parser, потребители Д-16",
)
patch(
    "docs/04-code-reuse-map.md",
    "| `server/config/lang-templates.ts` | НОВОЕ (11.1, прародителя нет):",
    "| `packages/shared/i18n/locales.ts` | НОВОЕ (11.2): `UI_LOCALES` (ru, en, de), `UI_TO_GEN`, `GEN_FALLBACK`, `genLangForUi` — правило владельца «интерфейс → генерация»; сюда же ПЕРЕНЕСЁН `LANG_OPTIONS` формы создания (был локальным списком SynthesisForm.tsx 1.5) — один список, сторож 4aw требует `UI_TO_GEN ⊆ LANG_OPTIONS` |\n"
    "| `packages/shared/i18n/t.ts` (11.2) | `tl()` получил ICU-плюралы `{n, plural, one {…} few {…} many {…} other {…}}` (`#` — число, `=N` точные формы) с выбором формы по `Intl.PluralRules` ЯЗЫКА КАТАЛОГА; `setCatalogProvider` отдаёт `{ locale, strings }`; разбор сообщения (`parseMessage`, `placeholderNames`, `pluralFormsOf`) общий с инструментами `scripts/i18n` (сверка подстановок и полноты форм при импорте). Словоформы промптов (`shared/utils/cardinality.ts`) — отдельный механизм, не трогается |\n"
    "| `server/i18n/locale.ts` | НОВОЕ (11.2): язык запроса через AsyncLocalStorage — `requestLocale` (middleware до роутов: cookie `ui_locale` → Accept-Language → ru), `setRequestLocale` (подъём `users.ui_locale` из requireAuth/optionalAuth), `runWithLocale`, `catalogFor(locale)` читает генераты `shared/i18n/generated/<lang>.json`, `installServerCatalogProvider` ставит провайдер `tl()` |\n"
    "| `server/services/subsection-order.ts` | НОВОЕ (11.2, Д-16): `loadExpectedSubsectionOrder(synthesisId)` — ожидаемый порядок подразделов сохранённого синтеза (строка + генеалогия → `PromptParams` кардинальности → `buildSubsectionMap`); лист графа импортов, fail-open (пусто → поиск по имени как прежде) |\n"
    "| `server/config/lang-templates.ts` | НОВОЕ (11.1, прародителя нет):",
    "C2 04 §4 новые модули 11.2",
)

# ── D. 05 файловая структура ───────────────────────────────────────────
patch(
    "docs/05-file-structure.md",
    "│       ├── types/\n",
    "│       ├── i18n/                       # 11.2: перевод строк интерфейса (общий клиент + сервер)\n"
    "│       │   ├── t.ts                    # tl(key, ru, params): второй аргумент — русский текст и запасной\n"
    "│       │   │                           # вариант; ICU-плюралы по Intl.PluralRules языка каталога;\n"
    "│       │   │                           # setCatalogProvider({ locale, strings })\n"
    "│       │   ├── locales.ts              # UI_LOCALES, UI_TO_GEN, GEN_FALLBACK, genLangForUi (правило\n"
    "│       │   │                           # владельца интерфейс → генерация); LANG_OPTIONS формы (из\n"
    "│       │   │                           # SynthesisForm 1.5) — один список\n"
    "│       │   ├── strings.json            # мастер-таблица переводов (ru/en/de, from, draft, params,\n"
    "│       │   │                           # where, отметки data/static/obsolete); правится инструментами\n"
    "│       │   └── generated/              # каталоги рантайма — npm run i18n:split, руками не править;\n"
    "│       │       ├── en.json             # { locale, strings }; ru-каталога нет (ru — в коде)\n"
    "│       │       └── de.json\n"
    "│       ├── types/\n",
    "D1 05 packages/shared/i18n/",
)
patch(
    "docs/05-file-structure.md",
    "│   ├── index.ts                        # Точка входа: Hono app + WebSocket\n",
    "│   ├── index.ts                        # Точка входа: Hono app + WebSocket\n"
    "│   │                                   # 11.2: requestLocale ДО rate-limiter и роутов,\n"
    "│   │                                   # installServerCatalogProvider()\n"
    "│   ├── i18n/                           # 11.2\n"
    "│   │   └── locale.ts                   # язык запроса (AsyncLocalStorage): пользователь → cookie\n"
    "│   │                                   # ui_locale → Accept-Language → ru; каталоги generated/*;\n"
    "│   │                                   # провайдер tl() — все ответы на языке запроса\n",
    "D2 05 server/i18n/locale.ts",
)
patch(
    "docs/05-file-structure.md",
    "│   │       ├── 0009_version_origin.sql # 10.2: element_versions.origin jsonb — «почему\n"
    "│   │       │                           #  изменилось» (снимок рекомендации); генерат\n",
    "│   │       ├── 0009_version_origin.sql # 10.2: element_versions.origin jsonb — «почему\n"
    "│   │       │                           #  изменилось» (снимок рекомендации); генерат\n"
    "│   │       ├── 0010_user_locale.sql    # 11.2: users.ui_locale, users.gen_lang (text, NULL);\n"
    "│   │       │                           #  генерат, тег переименован\n",
    "D3 05 миграция 0010",
)
patch(
    "docs/05-file-structure.md",
    "│   │   ├── context-quality.ts          # getSectionContextQuality поверх context_log:\n",
    "│   │   ├── subsection-order.ts         # 11.2 (Д-16): loadExpectedSubsectionOrder(synthesisId) —\n"
    "│   │   │                               # порядок подразделов сохранённого синтеза для страховки\n"
    "│   │   │                               # по месту в recommendations / planner / element-step\n"
    "│   │   ├── context-quality.ts          # getSectionContextQuality поверх context_log:\n",
    "D4 05 services/subsection-order.ts",
)
patch(
    "docs/05-file-structure.md",
    "│   ├── checks/                         # проверки, идущие без браузера\n",
    "│   ├── i18n/                           # инструменты перевода интерфейса (сделаны вне бесед;\n"
    "│   │   │                               # впервые применены к коду в 11.2) — см. scripts/i18n/README.md\n"
    "│   │   ├── README.md\n"
    "│   │   ├── i18n-core.mjs               # таблица, names.json (+ params 11.2), сверка tl(), плюралы,\n"
    "│   │   │                               # MIRROR_EXCLUSIONS (зеркала с данными — общий список codemod/check)\n"
    "│   │   ├── ui-strings-lib.mjs          # опись литералов интерфейса (ts-morph)\n"
    "│   │   ├── names.json                  # рукописные ключи и английские черновики\n"
    "│   │   ├── i18n-init.mjs               # одноразово: опись + names → strings.json\n"
    "│   │   ├── i18n-codemod.mjs            # литералы → tl() (применён к репозиторию в 11.2)\n"
    "│   │   ├── i18n-export.mjs             # сверка кода с таблицей + файл для переводчика\n"
    "│   │   ├── i18n-import.mjs             # вливание перевода (подстановки, формы плюрала)\n"
    "│   │   ├── i18n-check.mjs              # отчёт приёмки\n"
    "│   │   ├── i18n-params.mjs             # 11.2: говорящие имена подстановок из names.json → таблица\n"
    "│   │   ├── i18n-split.mjs              # 11.2: нарезка каталогов generated/<lang>.json (--check)\n"
    "│   │   ├── extract-ui-strings.mjs      # временная оснастка (опись в один JSON)\n"
    "│   │   └── build-localized.mjs         # временная оснастка (копия проекта с переводом)\n"
    "│   ├── checks/                         # проверки, идущие без браузера\n",
    "D5 05 scripts/i18n/",
)
patch(
    "docs/05-file-structure.md",
    "    │                                   # роли (EN → предупреждения, RU → нет), resolveSubsection (без БД)\n",
    "    │                                   # роли (EN → предупреждения, RU → нет), resolveSubsection (без БД)\n"
    "    │                                   # smoke-112-request1 — чистые функции 11.2: словарь языков и\n"
    "    │                                   # genLangForUi, ICU-плюралы, каталоги ≡ нарезке, язык запроса по\n"
    "    │                                   # cookie/Accept-Language, зеркала MIRROR_EXCLUSIONS нетронуты,\n"
    "    │                                   # Д-16 на переведённых атрибутах (без БД и браузера)\n",
    "D6 05 tests/smoke-112",
)

# ══ ЧАСТЬ II — ЗАКРЫТИЕ БЕСЕДЫ (2026-09-27) ══════════════════════════════
#  E  07 — «По факту 11.2» после текста беседы; §12 — Д-16 закрыт; врезка
#     Фазы 11 — 11.2 закрыта.
#  F  08 — Часть I (абзац), Часть II (глава), Часть III (врезка), Часть IV
#     (Д-16 в архив).
#  G  09 — §2 (текст запроса против кода — 11.2, зеркала с данными), §4 (pkill
#     по слову своей команды; stdout сервера теста — в файл; section_key
#     подраздельных догенераций), §5 (strip комментариев съедает "/api/v1/*").
#  H  README — таблица фаз, абзац Фазы 11.

PO_FAKTU_112 = """**По факту 11.2 (2026-09-27) — текст запроса против кода и найденное:**

1. **Зеркал с данными пять, не два.** Текст велел исключить из codemod'а
   `MODE_UI` и подзаголовок документа. Пробный прогон на копии показал: codemod
   переписывал и сам `MODE_CONFIG` сервера (в режиме `msg` ключ `title:` —
   сообщение) — это и был красный 4x «заголовок режима не дословный»; а
   `defaultTitle` (DocumentHeader) и `DEFAULT_TITLE` (ContextLogViewer) «Синтез
   Философской Концепции» сравниваются с `syntheses.title` — значение, не
   надпись. Список `MIRROR_EXCLUSIONS` (i18n-core, общий для codemod и
   i18n:check) — пять записей с доводами; строки помечены `data` (перевод по
   месту показа — 11.4). Сторожа 4x/4y читают пары как есть, не ослаблены.
2. **Подстановок с неговорящими именами 32, не 33**: `amountRange` несла
   `value`+`value2` — одна строка. Имена задаёт поле `params` в `names.json`
   (по позициям `{0},{1}`), накладывает `i18n:params` ДО codemod'а.
3. **Порядок «пользователь → cookie → Accept-Language → ru» при middleware ДО
   роутов неисполним буквально** — сессия читается в `requireAuth`/`optionalAuth`.
   Сделано: `requestLocale` открывает контекст ALS по cookie/заголовку,
   `requireAuth`/`optionalAuth` поднимают `ui_locale` в том же контексте.
4. **`LANG_OPTIONS` лежал в клиенте** (SynthesisForm 1.5) — сервер не
   импортирует клиент; список вынесен в `shared/i18n/locales.ts`, форма
   импортирует. `setCatalogProvider` отдавал только строки — расширен до
   `{ locale, strings }`: без языка каталога плюралы не выбрать.
5. **Сторож 4e требует тождества полей `AuthUser`** — расширен и клиентский
   тип (`uiLocale`, `genLang`), правка клиента «ценой типа» (урок 10.2).
6. **Сторож 4at** ужесточён под третье упоминание критики в планировщике
   (порядок подразделов для чтения прозы по месту); `audit` — `parseWarnings`
   в `typeOnly` (вычисляемое из генлога, колонки нет).
7. **Сообщения `PATCH /me`, положенные в `details.*`, минуют опись codemod'а**
   (`isMessageContext` знает `message/error/…`, не `details.<поле>`) —
   написаны через `tl()` руками. `synthesis.pauseModal.keyInvalid` —
   единственный литерал с ключом (JSX в подстановке), остаётся 11.3.
8. **Д-16, находка теста R9**: подраздельные догенерации пишут
   `section_key = «graph:Таблица связей»` (2.2) — `loadSectionParseWarnings`
   их не видел; отбор — по точному ключу ИЛИ префиксу «key:». Сторож 5aj и
   тест переписаны под это. Кандидаты на ICU-плюралы (не сделано, класс 11.3):
   `server.recommendations.roundInProgress` (`heldWordEnding`),
   `utils.textDiff.unchangedLines` (`linesWord`).
9. **Тесты**: `tests/smoke-112-request1.mjs` 81 ✓ ×2 (без БД и браузера);
   `tests/test-112-requests2-9.mjs` 69 ✓ ×2 (живой сервер + мок Claude :3921,
   без браузера; внутри — `check:integration`, `typecheck`, `audit`, worktree
   HEAD для байтовой сверки `buildSYS`/`formatCtxLog` до и после codemod'а);
   `check:integration` += 2al/4aw/5aj (4x/4y/4au не ослаблены); `i18n:check` —
   один литерал с ключом (PauseModal), без ключа 0. Клиентская сторона языка
   (переключатель, cookie `ui_locale`, каталог на клиенте, показ
   `parseWarnings`) — 11.3, как задумано.

---
"""

patch(
    "docs/07-conversation-protocol.md",
    "---\n\n### Беседа 11.3: Клиент — язык интерфейса и переключатель (клиент)\n",
    PO_FAKTU_112 + "\n### Беседа 11.3: Клиент — язык интерфейса и переключатель (клиент)\n",
    "E1 07 «По факту 11.2»",
)
patch(
    "docs/07-conversation-protocol.md",
    "| «По факту 11.1» пп.5–6 | 11.2 (+ показ 11.3) | открыт |",
    "| «По факту 11.1» пп.5–6 | 11.2 (+ показ 11.3) | **ЗАКРЫТ 11.2 (2026-09-27)**, кроме показа `parseWarnings` в интерфейсе — 11.3: ядро `resolveSubsection` в html-parser, `subsection-order.ts`, потребители ищут по месту и читают `actualName`, индекс рекомендаций в канонических именах, импорт доносит предупреждения, `SectionFull.parseWarnings` (см. «По факту 11.2» п.8); перенесён в 08 Часть IV |",
    "E2 07 §12 Д-16 закрыт",
)
patch(
    "docs/07-conversation-protocol.md",
    "> генлоге, `resolveSubsection`; см. «По факту 11.1»). Ближайшая — 11.2.\n",
    "> генлоге, `resolveSubsection`; см. «По факту 11.1»). **11.2 ЗАКРЫТА 2026-09-27**\n"
    "> (основа локализации и сервер: `shared/i18n/locales`, плюралы в `tl()`,\n"
    "> каталоги `generated/*`, `users.ui_locale/gen_lang` + `PATCH /me`, язык\n"
    "> запроса `server/i18n/locale.ts`, codemod применён — 132 файла, 2268 строк,\n"
    "> зеркала `MIRROR_EXCLUSIONS` литералами; Д-16 закрыт; см. «По факту 11.2»).\n"
    "> Ближайшая — 11.3.\n",
    "E3 07 врезка Фазы 11 — 11.2 закрыта",
)

patch(
    "docs/08-history.md",
    "check:integration += 2ak/4av/5ai; доки — scripts/patches/patch-docs-conv111.py.\nДолгов нет; ближайшая — 11.2.\n",
    "check:integration += 2ak/4av/5ai; доки — scripts/patches/patch-docs-conv111.py.\nДолгов нет; ближайшая — 11.2.\n"
    "Беседа 11.2 (основа локализации и сервер; бэкенд + codemod) ЗАКРЫТА 2026-09-27.\n"
    "`shared/i18n/locales.ts` (UI_LOCALES, UI_TO_GEN, genLangForUi; LANG_OPTIONS формы\n"
    "перенесён сюда — один список); `t.ts` — ICU-плюралы по Intl.PluralRules языка\n"
    "каталога, `setCatalogProvider({ locale, strings })`; `i18n:params` (32 говорящих\n"
    "имени подстановок), `i18n:split` → `generated/en.json` (1850), `de.json` (0);\n"
    "миграция 0010 `users.ui_locale/gen_lang`, `PATCH /me` с односторонней связью\n"
    "языков; `server/i18n/locale.ts` — язык запроса (ALS: пользователь → cookie →\n"
    "Accept-Language → ru), все ответы сервера через tl() на языке запроса. Codemod\n"
    "применён к репозиторию (132 файла, 2268 строк); зеркала с данными —\n"
    "`MIRROR_EXCLUSIONS` (пять, не два: + MODE_CONFIG, два умолчания заголовка) —\n"
    "литералами; сторожа читают tl() (`unTl`); 4x/4y/4au не ослаблены. Д-16 закрыт:\n"
    "ядро `resolveSubsection` в html-parser, `subsection-order.ts`, intra-контекст /\n"
    "рекомендации / планировщик / element-step ищут подраздел по месту и читают по\n"
    "фактическому атрибуту, импорт доносит предупреждения, `SectionFull.parseWarnings`.\n"
    "Смоук 81 ✓ ×2, tests/test-112-requests2-9.mjs 69 ✓ ×2 (живой сервер + мок, без\n"
    "браузера), check:integration += 2al/4aw/5aj; доки — patch-docs-conv112.py.\n"
    "Долгов нет; ближайшая — 11.3.\n",
    "F1 08 Часть I — абзац 11.2",
)

CHAPTER_112 = """### Беседа 11.2 — Основа локализации и сервер (бэкенд + codemod) [ЗАКРЫТА 2026-09-27]

**Вход:** HEAD 5992187, `check:dotfiles` чист, `npm install` в самом клоне.
Вторая беседа Фазы 11; впервые применяет к коду инструменты `scripts/i18n/*`.
Условие закрытия — зелёный `check:integration` без ослабления 4x/4y/4au.

**Сделано (первый запрос, девять пунктов).** (1) `packages/shared/i18n/locales.ts`:
`UI_LOCALES` (ru, en, de), `UI_TO_GEN`, `GEN_FALLBACK = English`, `genLangForUi`
(правило владельца «интерфейс → генерация»); `LANG_OPTIONS` формы создания перенесён
сюда из SynthesisForm — один список (сторож 4aw: `UI_TO_GEN ⊆ LANG_OPTIONS`).
(2) `t.ts`: разбор сообщения (`parseMessage`), ICU-плюралы `{n, plural, one{} few{}
many{} other{}}` с `#` и точными `=N`, форма по `Intl.PluralRules` языка каталога;
`setCatalogProvider` отдаёт `{ locale, strings }`; `placeholderNames` /
`pluralFormsOf` общие с инструментами — `i18n:import`/`i18n:check` отвергают формы не
своего языка. (3) `i18n:split` → `generated/<lang>.json` (`{ locale, strings }`;
черновики входят, `data`/`obsolete` нет, русского каталога нет), `--check` — для
сторожа. (4) Миграция `0010_user_locale`: `users.ui_locale`, `gen_lang` (text, NULL —
не выбирал). (5) `PATCH /auth/me`: `{uiLocale}` пишет ui_locale И gen_lang =
genLangForUi; `{genLang}` — только gen_lang; неверный язык → 400 `details.uiLocale`;
`GET /me` отдаёт оба; `AuthUser` сервера и клиента расширены (4e). (6)
`server/i18n/locale.ts`: AsyncLocalStorage — `requestLocale` в index.ts ДО роутов
(cookie `ui_locale` → Accept-Language → ru), `requireAuth`/`optionalAuth` поднимают
`ui_locale` пользователя, `catalogFor(locale)` читает генераты,
`installServerCatalogProvider` ставит провайдер tl(). (7) Codemod в жёстком порядке:
`i18n:params` (поле `params` в names.json → 32 говорящих имени) → `MIRROR_EXCLUSIONS`
в i18n-core (пять зеркал с доводами) → `unTl` в сторожах (4au) → `--in-place` (132
файла, 2268 строк; 33 строки зеркал литералами с отметкой `data`) → зелёный
`check:integration`. (8) Сторож 2al/4aw/5aj. (9) Д-16: ядро `resolveSubsection` — в
`html-parser` (generation-service реэкспортирует); `services/subsection-order.ts`
(`loadExpectedSubsectionOrder`: строка + генеалогия → buildSubsectionMap);
`extractRelevantIntraSectionContext` — опция `{ expectedOrder, warnings }`,
предупреждения соседей — в генлог; `DocumentIndex` в канонических именах +
`actualNameOf`, `thesisLabelsFromHtml`, `subsectionSource`, `recommendationProseOf`,
`refineElement` — по месту, читают фактический атрибут; импорт доносит предупреждения
разбора и при нуле категорий; `SectionFull.parseWarnings` (последняя полная
(пере)генерация + подраздельные догенерации, отбор по `key` и префиксу `key:`).

**Тестовые запросы R2–R9** — `tests/test-112-requests2-9.mjs` (69 ✓ ×2): плюралы;
отказ импорта на few в английском с ключом; связь языков (de → German, French не
трогает интерфейс, fr → 400); язык ответов (ui_locale первее Accept-Language, гость:
без заголовков и с `de` — русское, с `en` — английское, cookie первее заголовка);
имена подстановок; codemod (`check:integration`, `typecheck`, `audit`, зеркала
литералами); `buildSYS` для Russian/English и `formatCtxLog` побайтово те же, что даёт
код ДО codemod'а (git worktree HEAD; единственная разница — строка «Дата»); Д-16 —
intra-контекст перегенерации при переведённых атрибутах несёт содержимое соседа,
рекомендация с каноническим адресом находит подраздел и хэш источника, адрес
фактическим атрибутом негоден, `parseWarnings` в GET /sections/graph, импорт с
«Category Table» → warnings.graph.

**Отступления и находки** — «По факту 11.2» (07 §8): пять зеркал вместо двух;
`section_key` подраздельных догенераций «key:подраздел» (найдено тестом R9); правка
клиента ценой типа `AuthUser`; сторож 4at ужесточён; сообщения `details.*` минуют
опись codemod'а. **Что осталось 11.3:** переключатель и cookie `ui_locale` на
клиенте, каталог и провайдер на клиенте, 251 `static`-строка, `PauseModal.keyInvalid`
(JSX в подстановке), показ `parseWarnings`; 11.4 — строки `data` по месту показа.

**Файлы беседы:** `packages/shared/i18n/{locales.ts,t.ts,strings.json,generated/}`,
`scripts/i18n/{i18n-core,i18n-codemod,i18n-check,i18n-import,i18n-init,i18n-params,
i18n-split,ui-strings-lib}.mjs`, `names.json`, `README.md`; `server/i18n/locale.ts`,
`server/services/subsection-order.ts`, правки `html-parser`, `generation-service`,
`context-builder`, `recommendations`, `recommendation-planner`, `element-step`,
`import-service`, `routes/{auth,sections}.ts`, `middleware/auth.ts`, `index.ts`,
`db/schema.ts`, миграция 0010, `audit.mts`, `integration-check.mts`; клиент —
codemod (132 файла), `SynthesisForm.tsx` (импорт LANG_OPTIONS), `auth-store.ts`;
тесты `smoke-112-request1.mjs`, `test-112-requests2-9.mjs`;
`scripts/patches/patch-docs-conv112.py`.

"""
patch(
    "docs/08-history.md",
    "### Беседа 10.3 — Панель рекомендаций (клиент; одна правка сервера) [ЗАКРЫТА 2026-09-22 — Фаза 10 закрыта]\n",
    CHAPTER_112 + "### Беседа 10.3 — Панель рекомендаций (клиент; одна правка сервера) [ЗАКРЫТА 2026-09-22 — Фаза 10 закрыта]\n",
    "F2 08 Часть II — глава 11.2",
)
patch(
    "docs/08-history.md",
    "> **Правки 2026-09-23 (итоги беседы 11.1)**: защита машинных значений при\n",
    "> **Правки 2026-09-27 (итоги беседы 11.2)**: основа локализации и сервер.\n"
    "> 02 — §2.1 `users.ui_locale/gen_lang`; 03 — §2.1 GET/PATCH /auth/me и язык\n"
    "> ответов сервера, §2.2 предупреждения импорта, §2.3 `SectionFull.parseWarnings`;\n"
    "> 04 — §2.4 (resolveSubsection → html-parser, потребители Д-16), §4 (locales,\n"
    "> t.ts, server/i18n/locale, subsection-order); 05 — shared/i18n/, server/i18n/,\n"
    "> subsection-order, миграция 0010, scripts/i18n/, тесты 112; 07 — «По факту 11.2»,\n"
    "> §12 (Д-16 закрыт), врезка Фазы 11; 08 — Части I–IV; 09 — §2, §4, §5; README.\n"
    "> Скрипт — scripts/patches/patch-docs-conv112.py (часть I — при первом запросе,\n"
    "> часть II — при закрытии).\n"
    "\n"
    "> **Правки 2026-09-23 (итоги беседы 11.1)**: защита машинных значений при\n",
    "F3 08 Часть III — врезка 11.2",
)
patch(
    "docs/08-history.md",
    "| Долг | Адресат | Заведён | Состояние |\n|---|---|---|---|\n",
    "| Долг | Адресат | Заведён | Состояние |\n|---|---|---|---|\n"
    "| Д-16 — нерусская генерация теряет контекст молча (intra-контекст, рекомендации, element-step ищут подразделы по каноническим именам; предупреждения импорта не доходят; parseWarnings только в /logs/formatted) | 11.2 (+ показ 11.3) | ревизия §12 2026-09-23 («По факту 11.1» пп.5–6) | ЗАКРЫТ 11.2 (2026-09-27): ядро `resolveSubsection` в html-parser, `subsection-order.ts`, потребители ищут по месту и читают `actualName`, индекс рекомендаций в канонических именах + `actualNameOf`, импорт доносит предупреждения и при нуле категорий, `SectionFull.parseWarnings` (по `key` и префиксу `key:`); показ в интерфейсе — 11.3 |\n",
    "F4 08 Часть IV — Д-16 в архив",
)

patch(
    "docs/09-lessons.md",
    "## 3. PostgreSQL, Drizzle, данные\n",
    "### Беседа 11.2 — текст запроса против кода (пятый раз): зеркала с данными\n"
    "\n"
    "1. **Пробный прогон codemod'а на копии — обязательный шаг перед `--in-place`**,\n"
    "   и читать надо не только «сколько переписано», а КАКИЕ сторожа покраснели:\n"
    "   красный 4x на копии назвал не MODE_UI (его текст беседы предвидел), а\n"
    "   `MODE_CONFIG` сервера — в режиме `msg` ключ `title:` считается сообщением.\n"
    "   Текст беседы знал два зеркала, код показал пять (ещё два умолчания\n"
    "   заголовка сравниваются с `syntheses.title`). Список исключений — один,\n"
    "   в i18n-core, с доводами; его читают и codemod, и `i18n:check`, и сторож.\n"
    "2. **Сторож, счётчиком ловящий «лишние» упоминания** (4at: ровно два\n"
    "   `RECOMMENDATIONS_SECTION_KEY`), при законном третьем упоминании\n"
    "   ужесточается регуляркой на само упоминание, а не ослабляется до «≤ 3».\n"
    "3. **`i18n:export` снимает `data` с ключа, у которого есть живой `tl()`** —\n"
    "   один текст бывает и надписью, и данными (`common.appTitle`, `common.kant`);\n"
    "   отметка `data` для зеркал ставится только ключам без живых вызовов, иначе\n"
    "   первая сверка её снимет и `i18n:check` завопит «codemod не применён».\n"
    "\n"
    "## 3. PostgreSQL, Drizzle, данные\n",
    "G1 09 §2 — 11.2",
)
patch(
    "docs/09-lessons.md",
    "## 5. Node, TypeScript, сборка\n",
    "### Беседа 11.2 — убитая оболочка, слепой сервер, префикс section_key\n"
    "\n"
    "1. **`pkill -f tsx` убивает саму оболочку инструмента**, если в её командной\n"
    "   строке есть слово `tsx` (а оно есть — команда запуска теста): вызов\n"
    "   «зависает», а правки файлов, сделанные в том же вызове, ОТКАТЫВАЮТСЯ —\n"
    "   дважды терялись правки теста. Убивать по PID из `ps -eo pid,args | awk`\n"
    "   с шаблоном, не совпадающим с собственной строкой (`test-11[2]`), и делать\n"
    "   это ОТДЕЛЬНЫМ вызовом от правок.\n"
    "2. **Сервер теста со `stdio: \"ignore\"` слеп**: причина отказа R9 (ничего не\n"
    "   найдено) была видна только по логу сервера. Писать stdout/stderr сервера в\n"
    "   файл (`/tmp/t112-server.log`) — всегда.\n"
    "3. **Подраздельная догенерация пишет `section_key = «graph:Таблица связей»`**\n"
    "   (2.2), а не `graph`: любой отбор генлога «по разделу» — точный ключ ИЛИ\n"
    "   префикс `key:` (`waitGen` теста, `loadSectionParseWarnings`, сторож 5aj).\n"
    "4. **Байтовая сверка «до/после» через `git worktree HEAD`** с `npm install` в\n"
    "   самом дереве — надёжный способ доказать, что codemod не сдвинул промпты;\n"
    "   единственная законная разница `formatCtxLog` — строка «Дата: …» (время\n"
    "   форматирования) — маскируется, не игнорируется целиком. Дамп-скрипт\n"
    "   обязан кончаться `process.exit(0)` — redis/почта держат процесс.\n"
    "\n"
    "## 5. Node, TypeScript, сборка\n",
    "G2 09 §4 — 11.2",
)
patch(
    "docs/09-lessons.md",
    "## 6. Клиент: React, состояние, CSS\n",
    "### Беседа 11.2 — strip комментариев съедает строки\n"
    "\n"
    "1. **`strip()` в сторожах (`/\\/\\*[\\s\\S]*?\\*\\//`) съедает `\"/api/v1/*\"`** как\n"
    "   начало блочного комментария: проверка порядка `app.use(\"/api/v1/*\", …)` в\n"
    "   index.ts на «очищенном» тексте не находила строку и краснела. Файлы с\n"
    "   маршрутами-глобами читать без strip либо искать по подстроке до звёздочки.\n"
    "2. **Node ≥ 22.18 срывает типы с `.ts` без флага** — `scripts/i18n/*.mjs`\n"
    "   импортируют `packages/shared/i18n/t.ts` напрямую (один разбор сообщения на\n"
    "   код и инструменты). Не работает для файлов с параметр-свойствами\n"
    "   конструктора (`html-parser.ts`, `SubsectionHtmlError`) — такие только через\n"
    "   tsx.\n"
    "\n"
    "## 6. Клиент: React, состояние, CSS\n",
    "G3 09 §5 — 11.2",
)

patch(
    "README.md",
    "| 11 — локализация интерфейса | 11.1–11.4 | открыта 2026-09-22; 11.1 (защита машинных значений при нерусской генерации) — 09-23 |",
    "| 11 — локализация интерфейса | 11.1–11.4 | открыта 2026-09-22; 11.1 (защита машинных значений при нерусской генерации) — 09-23; 11.2 (основа локализации и сервер, codemod применён, Д-16) — 09-27 |",
    "H1 README таблица фаз",
)
patch(
    "README.md",
    "атрибутом опознаётся по позиции. Посев: `seed:prompts` → перезапуск (кэш\nреестра бессрочный).\n",
    "атрибутом опознаётся по позиции. Посев: `seed:prompts` → перезапуск (кэш\nреестра бессрочный). 11.2 ЗАКРЫТА 2026-09-27: codemod применён (все\n"
    "надписи клиента и сообщения сервера — через `tl()`, зеркала с данными —\n"
    "литералами), плюралы в `tl()`, каталоги `packages/shared/i18n/generated/*`\n"
    "(`npm run i18n:split`), `users.ui_locale/gen_lang` (миграция 0010, `npm run\n"
    "db:migrate`), `PATCH /auth/me` со связью языков, ответы сервера на языке\n"
    "запроса (пользователь → cookie `ui_locale` → Accept-Language → ru); Д-16\n"
    "закрыт. Клиентская сторона (переключатель, каталог на клиенте) — 11.3.\n",
    "H2 README абзац Фазы 11",
)

print(f"\nприменено {applied}, пропущено {skipped}, отказов {failed}")
sys.exit(1 if failed else 0)
