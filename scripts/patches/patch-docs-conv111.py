#!/usr/bin/env python3
"""Патч документации по беседе 11.1 (язык генерации — защита машинных
значений; сервер). ЗАВЕРШЕНИЕ (2026-09-23):
  A  01 §4.6 — ФАКТ 11.1: парсер графа не молчит.
  B  02 §2.15 — metadata.parseWarnings строки генлога.
  C  03 §2.5 (страховка опознания подраздела), §2.12 (блок «РАЗБОР С
     ПОТЕРЯМИ» в /logs/formatted).
  D  04 §1.7 (graph-parser 11.1), §2.4 (findSubsection/resolveSubsection),
     §4 (lang-templates.ts).
  E  05 — server/config/lang-templates.ts, тесты smoke-111/test-111.
  F  07 — «По факту 11.1» (текст запроса против кода: findSubsection),
     §12: сводка беседы без долгов; врезка Фазы 11 — 11.1 закрыта.
  G  08 — Часть I (строка), Часть II (глава), Часть III (врезка).
  H  09 — §2 (текст запроса против кода — 11.1), §7 (jsonb ||, кэш и байтовая
     сверка при надстройке).
  I  README (таблица фаз, абзац Фазы 11).
NEXT-CONTEXT переписывается целиком отдельным файлом, не патчем (07 §10).
Применённые правки не редактируются — только новые patch() (09 §2, 8.1).
Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patches/patch-docs-conv111.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
applied = skipped = failed = 0


def patch(rel: str, old: str, new: str, label: str, superseded_by: str | None = None) -> None:
    global applied, skipped, failed
    path = ROOT / rel
    if not path.exists():
        failed += 1
        print(f"  fail  {label}: нет файла {rel}")
        return
    text = path.read_text(encoding="utf-8")
    if new in text or (superseded_by is not None and superseded_by in text):
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


def insert_before(rel: str, anchor: str, addition: str, label: str) -> None:
    global applied, skipped, failed
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    marker = addition.strip().split("\n", 1)[0]
    if marker in text:
        skipped += 1
        print(f"  skip  {label}")
        return
    if text.count(anchor) != 1:
        failed += 1
        print(f"  fail  {label}: якорь встречается {text.count(anchor)} раз")
        return
    path.write_text(text.replace(anchor, addition + anchor), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


def insert_after(rel: str, anchor: str, addition: str, label: str) -> None:
    global applied, skipped, failed
    path = ROOT / rel
    text = path.read_text(encoding="utf-8")
    marker = addition.strip().split("\n", 1)[0]
    if marker in text:
        skipped += 1
        print(f"  skip  {label}")
        return
    if text.count(anchor) != 1:
        failed += 1
        print(f"  fail  {label}: якорь встречается {text.count(anchor)} раз")
        return
    path.write_text(text.replace(anchor, anchor + addition), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


# ── A. 01 §4.6 ────────────────────────────────────────────────────────────
print("A. 01 — §4.6")
patch(
    "docs/01-architecture.md",
    "- Визуализация: D3.js (2D) + Three.js (3D) — полностью на клиенте, данные загружаются через API\n",
    "- ФАКТ 11.1 (2026-09-23): парсер НЕ МОЛЧИТ. Неопознанное направление связи → «однонаправленная» с пометкой `dirSubstituted` и предупреждением (строка таблицы, значение); роль вне `ROLE_MAP` → предупреждение; отсутствие «Таблицы категорий»/«Таблицы связей» по русскому data-section → предупреждение. Предупреждения (`ParsedGraph.warnings` → `saveGraphToDb.warnings`) generation-service пишет в `generation_log.metadata.parseWarnings` строки раздела, log-formatter показывает блоком «⚠ РАЗБОР С ПОТЕРЯМИ». Синонимов машинных значений на других языках в парсере нет намеренно: модель обязана писать ключи по-русски (надстройка `system.lang_instruction`, `server/config/lang-templates.ts`)\n"
    "- Визуализация: D3.js (2D) + Three.js (3D) — полностью на клиенте, данные загружаются через API\n",
    "01/A §4.6 факт 11.1",
)

# ── B. 02 §2.15 ───────────────────────────────────────────────────────────
print("B. 02 — §2.15")
patch(
    "docs/02-data-model.md",
    "  -- Метаданные (secCtxPreview, modeParam, subsections; v11: promptSkeleton —\n  -- скелет промпта пишется при генерации, реконструкция — fallback импорта)\n  metadata       JSONB NOT NULL DEFAULT '{}',",
    "  -- Метаданные (secCtxPreview, modeParam, subsections; v11: promptSkeleton —\n  -- скелет промпта пишется при генерации, реконструкция — fallback импорта)\n"
    "  -- 11.1: + parseWarnings string[] — предупреждения разбора раздела\n"
    "  --   (подставленное направление связи, роль вне ROLE_MAP, таблица не\n"
    "  --   найдена по русскому data-section, подраздел опознан по месту /\n"
    "  --   не опознан). Пишутся jsonb_set с НАКОПЛЕНИЕМ (`||` по верхнему\n"
    "  --   ключу заменил бы массив); показ — log-formatter «РАЗБОР С ПОТЕРЯМИ»\n"
    "  metadata       JSONB NOT NULL DEFAULT '{}',",
    "02/B §2.15 parseWarnings",
)

# ── C. 03 §2.5, §2.12 ─────────────────────────────────────────────────────
print("C. 03 — §2.5, §2.12")
patch(
    "docs/03-specification.md",
    "                                  userNote?: string, includeCurrentContent?: boolean }\n                                → { ok: true }\n                                // Стриминг через WebSocket\n```",
    "                                  userNote?: string, includeCurrentContent?: boolean }\n                                → { ok: true }\n                                // Стриминг через WebSocket\n"
    "                                // 11.1: подраздел ищется по имени (точно →\n"
    "                                // нечётко), а при переведённых моделью\n"
    "                                // атрибутах data-section и СОВПАДАЮЩЕМ числе\n"
    "                                // подразделов с картой subsection_map —\n"
    "                                // ПО ПОЗИЦИИ (resolveSubsection), с\n"
    "                                // предупреждением в генлоге («подраздел N\n"
    "                                // опознан по месту: атрибут \"X\" вместо \"Y\"»);\n"
    "                                // врезка идёт по фактическому атрибуту и чинит\n"
    "                                // его ответом модели. Число не совпало —\n"
    "                                // прежнее поведение (результат дописывается в\n"
    "                                // конец) с предупреждением о причине\n"
    "```",
    "03/C §2.5 страховка",
)
patch(
    "docs/03-specification.md",
    "                                       // Аналог formatCtxLog() и colorizeLog()\n```",
    "                                       // Аналог formatCtxLog() и colorizeLog()\n"
    "                                       // 11.1: в блоке раздела — «⚠ РАЗБОР С\n"
    "                                       // ПОТЕРЯМИ (N)» + строки\n"
    "                                       // metadata.parseWarnings (02 §2.15)\n"
    "```",
    "03/C §2.12 РАЗБОР С ПОТЕРЯМИ",
)

# ── D. 04 ─────────────────────────────────────────────────────────────────
print("D. 04 — §1.7, §2.4, §4")
patch(
    "docs/04-code-reuse-map.md",
    "| `parseGraph()` | там же |\n",
    "| `parseGraph()` | там же — ФАКТ (11.1): `ParsedGraph.warnings`, `EDGE_DIRECTIONS` / `normalizeEdgeDirection` (три русских значения контракта; неопознанное → «однонаправленная» + `dirSubstituted`/`dirRaw` + предупреждение со строкой), роль вне `ROLE_MAP` → предупреждение (исходник молча терял), таблицы не найдены по data-section → предупреждение; `saveGraphToDb.warnings` ⊇ `parsed.warnings`. Синонимов на других языках нет намеренно |\n",
    "04/D §1.7 graph-parser 11.1",
)
patch(
    "docs/04-code-reuse-map.md",
    "| `regenerateSubsection()` | Аналогично | там же |\n",
    "| `regenerateSubsection()` | Аналогично | там же |\n"
    "| `findSubsection` [20390–20402] (точное имя → нечёткое включение) | 11.1: + страховка ПО ПОЗИЦИИ — `resolveSubsection(container, name, expectedOrder?)` → `{ el, actualName, byPosition, warning }`; `findSubsection(…, expectedOrder?)` — тонкая обёртка с прежней сигнатурой. Ожидаемый порядок — `buildSubsectionMap`; потребители — `regenerateSubsection` (чтение и врезка по фактическому атрибуту) и pause-resume (`ps.expectedSubsections`) | `server/services/generation-service.ts` |\n",
    "04/D §2.4 resolveSubsection",
)
patch(
    "docs/04-code-reuse-map.md",
    "| `client/components/edit/TransformPanel.tsx` | UI: кнопки трансформации, превью, история, откат",
    "| `server/config/lang-templates.ts` | НОВОЕ (11.1, прародителя нет): рукописная НАДСТРОЙКА над генератом `prompt-templates.ts` — `applyLangTemplateOverrides` дописывает `system.lang_instruction` правилом машинных значений (`LANG_INSTRUCTION_ADDENDUM`: закрытые списки «СТРОГО одно из» / «Столбцы СТРОГО» / «СТРОГО из списка» / «Тип: … / …», заголовки `<th>`, имена категорий в «Таблице связей» — по-русски при любом `{{lang}}`), прежнее правило о data-section сохранено дословно; `stripLangInstructionAddendum` снимает отступление для байтовой сверки smoke-12; сид накладывает. Образец — recommendation-templates 10.1 |\n"
    "| `server/services/generation-service.ts` — `parseAndSaveGraph`, `appendParseWarnings` | ДОПОЛНЕНО (11.1): предупреждения разбора графа → `metadata.parseWarnings` строки генлога (jsonb_set с накоплением) во всех точках разбора (основной цикл, regenerateSection, regenerateSubsection, addSection); то же в `representation-transformer` (тезисы → граф); `log-formatter` печатает «⚠ РАЗБОР С ПОТЕРЯМИ» |\n"
    "| `client/components/edit/TransformPanel.tsx` | UI: кнопки трансформации, превью, история, откат",
    "04/D §4 lang-templates",
)

# ── E. 05 ─────────────────────────────────────────────────────────────────
print("E. 05 — файлы 11.1")
patch(
    "docs/05-file-structure.md",
    "│   │   └── recommendation-templates.ts # 10.1: шаблон «Таблицы рекомендаций» и шаблон\n│   │                                  # ретрофита (новые тексты из shared-констант) +\n│   │                                  # НАДСТРОЙКИ над генератами: проза рекомендаций и\n│   │                                  # три конфига critique; генераты рукой не правятся\n",
    "│   │   ├── recommendation-templates.ts # 10.1: шаблон «Таблицы рекомендаций» и шаблон\n│   │   │                              # ретрофита (новые тексты из shared-констант) +\n│   │   │                              # НАДСТРОЙКИ над генератами: проза рекомендаций и\n│   │   │                              # три конфига critique; генераты рукой не правятся\n"
    "│   │   └── lang-templates.ts          # 11.1: НАДСТРОЙКА над генератом prompt-templates —\n"
    "│   │                                  # system.lang_instruction += правило машинных значений\n"
    "│   │                                  # (закрытые списки, <th>, имена категорий в таблице\n"
    "│   │                                  # связей — по-русски при любом lang); прежнее правило\n"
    "│   │                                  # data-section дословно; strip для smoke-12; сид накладывает\n",
    "05/E lang-templates.ts",
)
patch(
    "docs/05-file-structure.md",
    "    │                                   # test-file-genealogy — дерево импортированного файла: запись,\n",
    "    │                                   # smoke-111-request1 — чистые функции 11.1: надстройка поверх\n"
    "    │                                   # генерата, strip, обороты «СТРОГО» покрыты правилом, направление/\n"
    "    │                                   # роли (EN → предупреждения, RU → нет), resolveSubsection (без БД)\n"
    "    │                                   # test-111-requests2-8 — R2–R8 11.1 на живом сервере :3000 + мок\n"
    "    │                                   # Claude :3921 (без браузера): путь обновления сида + smoke-12,\n"
    "    │                                   # SYS по lang, английские направления/роли → генлог и /logs/\n"
    "    │                                   # formatted, страховка по позиции (5 и 4 подраздела), сторож 4av/5ai\n"
    "    │                                   # при снятом правиле (полный check:integration внутри, ≈ 100 с)\n"
    "    │                                   # test-file-genealogy — дерево импортированного файла: запись,\n",
    "05/E тесты 11.1",
)

# ── F. 07 ─────────────────────────────────────────────────────────────────
print("F. 07 — «По факту 11.1», §12, врезка Фазы 11")
insert_before(
    "docs/07-conversation-protocol.md",
    "### Беседа 11.2: Основа локализации и сервер (бэкенд + codemod)\n",
    "**По факту 11.1 (2026-09-23) — текст запроса против кода и найденное:**\n"
    "\n"
    "1. **`findSubsection` — не то место, где перегенерация теряет подраздел.**\n"
    "   Текст запроса (и комплект в NEXT-CONTEXT: «findSubsection ~2128 — туда\n"
    "   страховка») приписывал потерю одной функции; фактически её единственный\n"
    "   потребитель — pause-resume (обрывочный подраздел), а `regenerateSubsection`\n"
    "   находит подраздел тремя другими путями: `extractSubsectionContent`\n"
    "   (точный querySelector), `spliceSubsectionHtml` (свой нечёткий поиск в\n"
    "   html-parser) и `extractRelevantIntraSectionContext` (context-builder).\n"
    "   Сделано: `resolveSubsection` — ядро со страховкой по позиции, `findSubsection`\n"
    "   — обёртка с прежней сигнатурой; в `regenerateSubsection` чтение содержимого\n"
    "   и врезка идут по ФАКТИЧЕСКОМУ атрибуту (`actualName`), промпт и карты — по\n"
    "   каноническому имени; pause-resume передаёт `ps.expectedSubsections`.\n"
    "2. **Предупреждения разбора до 11.1 уходили в `console.warn`** в трёх точках\n"
    "   generation-service и в трансформаторе, `ParsedGraph` их не нёс вовсе.\n"
    "   Заведены `ParsedGraph.warnings`; `appendParseWarnings` пишет\n"
    "   `metadata.parseWarnings` через `jsonb_set` с накоплением (`||` по верхнему\n"
    "   ключу заменяет массив — первая редакция так и теряла предыдущие\n"
    "   предупреждения).\n"
    "3. **Направление молчало в двух местах**: `td[4] || \"однонаправленная\"` при\n"
    "   парсинге и тройной `includes` при записи. Канонизация вынесена в\n"
    "   `normalizeEdgeDirection` (`EDGE_DIRECTIONS`), запись берёт её же; пометка\n"
    "   подстановки — `dirSubstituted`/`dirRaw` в результате разбора и\n"
    "   предупреждение в генлоге, колонки в `category_edges` не заведено (беседа без\n"
    "   миграции).\n"
    "4. **Смоук-текст «19 строгих шаблонов»** — по коду их 18 со «СТРОГО»/«ТОЧНО»\n"
    "   (15 — интро «Оформи ТОЧНО следующие секции», 3 — таблицы графа ×ext); с\n"
    "   учётом `recommendations_table` 10.1 закрытые списки вводят 4 оборота —\n"
    "   `LANG_CLOSED_LIST_PHRASES`, сторож 4av сверяет покрытие каждого.\n"
    "5. **Граница страховки найдена тестом R7 и озвучена**: после опознания\n"
    "   «Таблицы связей» по месту гранулярные таблицы остались пустыми — «Таблица\n"
    "   категорий» того же документа по-прежнему `Category Table`, парсер её не\n"
    "   читает. Раньше — молчаливые нули; теперь `parseGraphFromElement` пишет\n"
    "   «подраздел «Таблица категорий» не найден — категории не разобраны (атрибуты\n"
    "   data-section раздела: …)». Полная отвязка data-section — не эта фаза, как\n"
    "   велено; предупреждения дадут цифры для решения о ней.\n"
    "6. **Ограничения без адресата (не долги)**: `extractRelevantIntraSectionContext`\n"
    "   (context-builder), `element-step` и `recommendations` ищут соседние\n"
    "   подразделы по каноническим именам — при переведённых атрибутах\n"
    "   intra-контекст и адресация рекомендаций теряются молча (та же природа, что\n"
    "   п. 1, вне п. 4 запроса); `spliceSubsectionHtml` при неопознанном подразделе\n"
    "   дописывает результат в конец раздела (прежнее поведение, теперь с\n"
    "   предупреждением); `import-service` разбирает граф при импорте — его\n"
    "   предупреждения в генлог не пишутся (импорт строки генлога раздела не\n"
    "   заводит); клиентский показ `parseWarnings` — только через `/logs/formatted`\n"
    "   (отдельного места в интерфейсе нет).\n"
    "7. **Тесты**: `tests/smoke-111-request1.mjs` 43 ✓; `tests/test-111-requests2-8.mjs`\n"
    "   48 ✓ ×2 (живой сервер + мок Claude :3921, без браузера; внутри — smoke-12\n"
    "   134 ✓ и сабботированный `check:integration`); check:integration += 2ak/4av/5ai;\n"
    "   audit чист; `smoke-55` падает на чистом HEAD (`transformsApi.transformGraphToTheses\n"
    "   is not a function` — обёртки api снесены 8.4) — предсуществующее, не тронуто.\n"
    "\n"
    "---\n"
    "\n",
    "07/F По факту 11.1",
)
patch(
    "docs/07-conversation-protocol.md",
    "Беседа 10.3 (2026-09-22) ЗАКРЫЛА три долга 10.2 (строки в таблице) и оставила\n",
    "Беседа 11.1 (2026-09-23) долгов с адресатом не оставила; ближайшая — 11.2\n"
    "(порядок фазы жёсткий). Ограничения без адресата — «По факту 11.1» п.6\n"
    "(intra-контекст и адресация рекомендаций по каноническим именам подразделов;\n"
    "предупреждения импорта не в генлоге; показ parseWarnings только в логе).\n"
    "Строка 10.3 о метках тезисов остаётся открытой без адресата.\n"
    "\n"
    "Беседа 10.3 (2026-09-22) ЗАКРЫЛА три долга 10.2 (строки в таблице) и оставила\n",
    "07/F §12 сводка 11.1",
)
patch(
    "docs/07-conversation-protocol.md",
    "> Порядок ЖЁСТКИЙ: 11.1 → 11.2 → 11.3 → 11.4.\n>\n> Патч `philosynth-i18n-v2`",
    "> Порядок ЖЁСТКИЙ: 11.1 → 11.2 → 11.3 → 11.4. **11.1 ЗАКРЫТА 2026-09-23**\n"
    "> (сервер; `lang-templates.ts`, graph-parser без молчания, `parseWarnings` в\n"
    "> генлоге, `resolveSubsection`; см. «По факту 11.1»). Ближайшая — 11.2.\n>\n> Патч `philosynth-i18n-v2`",
    "07/F врезка Фазы 11",
)

# ── G. 08 ─────────────────────────────────────────────────────────────────
print("G. 08 — Части I–III")
insert_after(
    "docs/08-history.md",
    "Находка: метки тезисов живого файла теряются рендерером 5.1 → §12.\n",
    "Беседа 11.1 (язык генерации — защита машинных значений; сервер) ЗАКРЫТА\n"
    "2026-09-23 — первая беседа Фазы 11. Надстройка `server/config/lang-templates.ts`\n"
    "поверх генерата (`system.lang_instruction` += правило: значения закрытых списков,\n"
    "`<th>` и имена категорий в таблице связей — по-русски при любом языке; правило\n"
    "data-section дословно; smoke-12 снимает отступление). graph-parser перестал\n"
    "молчать: неопознанное направление → «однонаправленная» с пометкой и\n"
    "предупреждением, роль вне ROLE_MAP → предупреждение, таблица не найдена по\n"
    "data-section → предупреждение; синонимов на других языках нет. Предупреждения →\n"
    "`generation_log.metadata.parseWarnings` (jsonb_set, накопление) → «⚠ РАЗБОР С\n"
    "ПОТЕРЯМИ» в логе 2.4. `resolveSubsection` — страховка опознания подраздела по\n"
    "позиции при переведённых атрибутах (regenerateSubsection, pause-resume). Смоук\n"
    "43 ✓, tests/test-111-requests2-8.mjs 48 ✓ ×2 (живой сервер + мок, без браузера),\n"
    "check:integration += 2ak/4av/5ai; доки — scripts/patches/patch-docs-conv111.py.\n"
    "Долгов нет; ближайшая — 11.2.\n",
    "08/G Часть I строка 11.1",
)
insert_before(
    "docs/08-history.md",
    "### Беседа 10.3 — Панель рекомендаций (клиент; одна правка сервера) [ЗАКРЫТА 2026-09-22 — Фаза 10 закрыта]\n",
    "### Беседа 11.1 — Язык генерации: защита машинных значений (сервер) [ЗАКРЫТА 2026-09-23]\n"
    "\n"
    "**Вход:** HEAD 83d2aaf, `check:dotfiles` чист, `npm install` в самом клоне.\n"
    "Первая беседа Фазы 11; предмет — генерация, не интерфейс (патч i18n не\n"
    "трогался).\n"
    "\n"
    "**Что сделано.** Исходная языковая инструкция берегла от перевода только\n"
    "атрибут data-section и одновременно требовала «ALL your output … including\n"
    "tables» на языке документа — а парсеры читают русские значения в ячейках.\n"
    "Отступление оформлено НАДСТРОЙКОЙ `server/config/lang-templates.ts` (образец\n"
    "10.1): `applyLangTemplateOverrides` дописывает генерату `system.lang_instruction`\n"
    "правило `CRITICAL MACHINE-VALUE RULE` — значения закрытых списков («СТРОГО одно\n"
    "из», «Столбцы СТРОГО», «СТРОГО из списка», «Тип: … / …»), заголовки `<th>`, имена\n"
    "категорий в «Таблице связей» точно как в «Таблице категорий» — по-русски при\n"
    "любом `{{lang}}`; прежний текст сохранён дословно; `stripLangInstructionAddendum`\n"
    "снимает отступление в smoke-12, и байтовая сверка с исходником осталась в\n"
    "полную силу. Оговорка 10.1 в `recommendations_table` — частный случай общего\n"
    "правила (сверено).\n"
    "\n"
    "**Парсер перестал молчать.** `ParsedGraph.warnings`; `normalizeEdgeDirection`\n"
    "/ `EDGE_DIRECTIONS` (три русских значения контракта): неопознанное →\n"
    "«однонаправленная» с `dirSubstituted`/`dirRaw` и предупреждением «таблица\n"
    "связей, строка N («A» → «B»): направление «bidirectional» не опознано…»; роль\n"
    "вне `ROLE_MAP` → предупреждение со строкой, категорией и столбцом; «Таблица\n"
    "категорий»/«Таблица связей» не найдены по data-section → предупреждение.\n"
    "`saveGraphToDb.warnings` ⊇ `parsed.warnings`. Английских синонимов нет — путь\n"
    "один: модель пишет ключи по-русски, парсер громко сообщает, когда не смогла.\n"
    "\n"
    "**Предупреждения — в генлог.** `parseAndSaveGraph` + `appendParseWarnings`\n"
    "(jsonb_set с накоплением; `||` по ключу затирал бы) во всех точках разбора\n"
    "generation-service и в трансформаторе тезисы → граф; log-formatter печатает\n"
    "«⚠ РАЗБОР С ПОТЕРЯМИ (N)».\n"
    "\n"
    "**Страховка по позиции.** `resolveSubsection(container, name, expectedOrder?)`\n"
    "→ `{ el, actualName, byPosition, warning }`: точно → нечётко → по месту при\n"
    "совпадающем числе подразделов («подраздел 3 опознан по месту: атрибут \"Edge\n"
    "Table\" вместо \"Таблица связей\"»), иначе честный отказ с причиной.\n"
    "`findSubsection` — обёртка с прежней сигнатурой. `regenerateSubsection` читает\n"
    "и врезает по фактическому атрибуту (подраздел заменяется НА МЕСТЕ и атрибут\n"
    "чинится ответом модели), промпт — по каноническому имени; pause-resume передаёт\n"
    "`ps.expectedSubsections`.\n"
    "\n"
    "**Что нашли тесты.** Первый прогон R7: после опознания по месту гранулярные\n"
    "таблицы пусты — «Таблица категорий» документа по-прежнему переведена, парсер\n"
    "её не читал МОЛЧА; теперь предупреждение (граница страховки названа). Первая\n"
    "редакция `appendParseWarnings` через `||` теряла накопленные предупреждения.\n"
    "Текст запроса писался по памяти о коде (четвёртая беседа подряд): `findSubsection`\n"
    "не был местом потери — «По факту 11.1» п.1.\n"
    "\n"
    "**Проверки.** typecheck 0; `tests/smoke-111-request1.mjs` 43 ✓;\n"
    "`tests/test-111-requests2-8.mjs` 48 ✓ ×2 (живой сервер + мок Claude :3921; R2\n"
    "путь обновления сида + smoke-12 134 ✓; R3 SYS по lang на живом пути; R4/R5\n"
    "направления и роли; R6 лог; R7 страховка 5/4 подраздела; R8 сторож при снятом\n"
    "правиле — полный check:integration красный с именем правила); check:integration\n"
    "+= 2ak/4av/5ai → OK; audit чист; smoke-1.4, smoke-51 (round-trip) зелёные;\n"
    "`smoke-55` красный на чистом HEAD (предсуществующее, 8.4).\n"
    "\n"
    "**Файлы.** Новые: `server/config/lang-templates.ts`,\n"
    "`tests/smoke-111-request1.mjs`, `tests/test-111-requests2-8.mjs`,\n"
    "`scripts/patches/patch-docs-conv111.py`. Правлены: `scripts/seed/seed-prompts.ts`,\n"
    "`server/services/graph-parser.ts`, `generation-service.ts`, `log-formatter.ts`,\n"
    "`pause-resume-service.ts`, `representation-transformer.ts`,\n"
    "`server/integration-check.mts`, `tests/smoke-12-request1.mjs`.\n"
    "\n"
    "**Контекст следующим беседам.** 11.2: `server/config/lang-templates.ts`\n"
    "(правило связи языков делает нерусскую генерацию умолчанием — защита стоит);\n"
    "любой беседе, читающей `generation_log.metadata`, — `parseWarnings`; любой\n"
    "беседе о подразделах — `resolveSubsection` (generation-service) и границы п.6\n"
    "«По факту 11.1».\n"
    "\n",
    "08/G Часть II глава 11.1",
)
insert_before(
    "docs/08-history.md",
    "> **Правки 2026-09-22 (итоги беседы 10.3)**: панель рекомендаций закрыта,\n",
    "> **Правки 2026-09-23 (итоги беседы 11.1)**: защита машинных значений при\n"
    "> нерусской генерации закрыта. 01 — §4.6 факт 11.1; 02 — §2.15\n"
    "> `metadata.parseWarnings`; 03 — §2.5 (страховка по позиции), §2.12 (блок\n"
    "> «РАЗБОР С ПОТЕРЯМИ»); 04 — §1.7, §2.4, §4 (lang-templates, parseWarnings);\n"
    "> 05 — lang-templates.ts, тесты 111; 07 — «По факту 11.1», §12 (сводка без\n"
    "> долгов), врезка Фазы 11; 08 — Части I–III; 09 — §2, §7; README. Скрипт —\n"
    "> scripts/patches/patch-docs-conv111.py.\n"
    "\n",
    "08/G Часть III врезка",
)

# ── H. 09 ─────────────────────────────────────────────────────────────────
print("H. 09 — §2, §7")
insert_before(
    "docs/09-lessons.md",
    "## 3. PostgreSQL, Drizzle, данные\n",
    "### Беседа 11.1 — текст запроса против кода (четвёртый раз) и граница страховки\n"
    "\n"
    "1. **Запрос назвал функцию — проверь, кто её зовёт.** Текст 11.1 велел ставить\n"
    "   страховку в `findSubsection`, «который не находит подраздел» при перегенерации;\n"
    "   `grep` показал одного потребителя — паузу, а перегенерация находила подраздел\n"
    "   тремя другими путями. Страховка в названном месте одном была бы мёртвой.\n"
    "   Перед правкой функции «из комплекта» — `grep -rn 'имя('` по server/.\n"
    "2. **Предупреждение о подстановке — не гарантия, что документ разобран.** Тест\n"
    "   страховки прошёл (подраздел опознан по месту, врезан, предупреждение есть), а\n"
    "   гранулярные таблицы остались пустыми: соседняя таблица того же документа\n"
    "   осталась переведённой и парсер не нашёл её МОЛЧА. Озвучивая одну потерю,\n"
    "   пройди по всем `querySelector('[data-section=\"…\"]')` того же конвейера —\n"
    "   каждое «не найдено → return []» без слова наружу той же природы.\n"
    "3. **Надстройка поверх генерата тянет за собой три места**: сид (наложение),\n"
    "   байтовый смоук (снятие перед сверкой + проверка, что отступление ровно одно и\n"
    "   на месте) и сторож (генерат не правлен рукой, посевное тело несёт добавку,\n"
    "   идемпотентность). 10.1 показала образец; 11.1 повторила по нему — забыть\n"
    "   любое из трёх значит красный smoke-12 или тихо потерянную правку.\n"
    "\n",
    "09/H §2 беседа 11.1",
)
insert_before(
    "docs/09-lessons.md",
    "## 8. Прочее\n",
    "### Беседа 11.1 — jsonb и кэш реестра при надстройке\n"
    "\n"
    "1. **`metadata || '{\"k\": […]}'::jsonb` ЗАМЕНЯЕТ значение ключа, а не дописывает\n"
    "   массив**: вторая запись предупреждений разбора в ту же строку стирала первую.\n"
    "   Накопление — `jsonb_set(metadata, '{k}', coalesce(metadata->'k', '[]'::jsonb) ||\n"
    "   $new::jsonb)`; смоук обязан писать в строку ДВАЖДЫ и сверять объединение.\n"
    "2. **Правка активного шаблона в БД мимо API не сбрасывает Redis-кэш** (урок 10.1 с\n"
    "   другой стороны): тест сторожа, снявший правило `UPDATE`-ом, увидел бы прежний\n"
    "   текст из кэша и зеленел ложно. Перед проверкой — `redis-cli flushall` (или\n"
    "   `del prompt_cache:<key>`), после восстановления — снова.\n"
    "3. **Смоук первого запроса — до тестовых запросов, но тест на живом сервере всё\n"
    "   равно нашёл дефект**, которого чистые функции не видят (п.2 §2 выше): смоук\n"
    "   проверяет функцию, тест — конвейер. Оба обязательны, замена одного другим не\n"
    "   работает.\n"
    "\n",
    "09/H §7 беседа 11.1",
)

# ── I. README ─────────────────────────────────────────────────────────────
print("I. README")
patch(
    "README.md",
    "| 11 — локализация интерфейса | 11.1–11.4 | открыта 2026-09-22 |\n",
    "| 11 — локализация интерфейса | 11.1–11.4 | открыта 2026-09-22; 11.1 (защита машинных значений при нерусской генерации) — 09-23 |\n",
    "README/I таблица фаз",
)
patch(
    "README.md",
    "(`scripts/i18n/`, мастер-таблица `strings.json`) — в составе проекта,\ncodemod не применён. Порядок жёсткий.\n",
    "(`scripts/i18n/`, мастер-таблица `strings.json`) — в составе проекта,\ncodemod не применён. Порядок жёсткий. 11.1 ЗАКРЫТА 2026-09-23: надстройка\n"
    "`lang-templates.ts` над языковой инструкцией (машинные значения — по-русски\n"
    "при любом языке документа), парсер графа предупреждает о подстановках вместо\n"
    "молчания (предупреждения — в логе генерации), подраздел с переведённым\n"
    "атрибутом опознаётся по позиции. Посев: `seed:prompts` → перезапуск (кэш\n"
    "реестра бессрочный).\n",
    "README/I абзац Фазы 11",
)

print(f"\nИтог: применено {applied}, пропущено {skipped}, ошибок {failed}")
sys.exit(1 if failed else 0)
