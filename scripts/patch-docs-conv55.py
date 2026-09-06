#!/usr/bin/env python3
"""Патч документации по итогам беседы 5.5 (Representation Transformer —
graph↔theses, бэкенд + клиент).

Закрывает дыры, найденные при исполнении беседы (2026-09-05/06):
  A  07 — запись ревизии в шапке.
  B  07 — глава «По факту 5.5» после текста беседы (форма результата из
     buildSectionDefs; замена html раздела целиком + перерисовка таблиц;
     семантика снимков и строки-отката по 02 §2.28; стоимость в totals и
     generation_log 'edit'; нормализация типов в saveGraphToDb; пустой
     источник → 400 синхронно; WS start_transform — альтернативный вход;
     запуск REST с собственного WS-канала; неразрушающее обновление;
     грабли стенда).
  C  07 5.5 — текст запроса и тестов: «source_snapshot» → «target_snapshot»
     (пп. c/e рollback и тест R2), п.4 «перерисовать через element-renderer»
     дополнен решением; ссылка «секция 4.10» → 4.11.
  D  07 §12 — долги «серверная нормализация типов на каталог» и «парсер
     глоссария при lang ≠ Russian» ЗАКРЫТЫ 5.5; новый долг: BYO-Key в
     трансформациях (apiKey из env, TODO(6.1)) — числится в строке BYO-Key.
  E  03 — §2.15: rollback из target_snapshot, ответ rollback несёт
     transform+summary, POST /transform/* отвечают { ok } и исполняются
     фоном, 400 при пустом источнике, состав resultSummary; §1.1 T3 —
     ЗАКРЫТО 5.5; §2.4 п.11 — факт о typeCatalogId снят.
  F  05 — client/hooks/useTransformStream.ts, server/config/
     transform-templates.ts, пометки «СДЕЛАНО 5.5».
  G  04 §4 — ФАКТ-пометки representation-transformer / routes/transforms /
     TransformPanel + строка TransformHistory/useTransformStream/api.
  H  README — статус: 5.5 закрыта.
  I  5-6-ui-kit.md — блок 9 перенесён в часть 3 globals.css (5.5).
  J  01 §4.6 — факт нормализации при парсинге снят (сделано 5.5); §4.11 —
     ФАКТ о форме результата и снимках.
  K  02 §2.28 — состав снимков (GraphSnapshot | ThesesSnapshot с
     sectionHtml) и строка-откат.

Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patch-docs-conv55.py
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
    path.write_text(text.replace(old, new, 1), encoding="utf-8")
    applied += 1
    print(f"  ok    {label}")


P07 = "docs/07-conversation-protocol.md"

# ── A. шапка 07 ─────────────────────────────────────────────────────────
patch(P07,
      "# PhiloSynth Service — Протокол бесед\n\n> **Правки 2026-09-05 (итоги беседы 5.4)**:",
      "# PhiloSynth Service — Протокол бесед\n\n"
      "> **Правки 2026-09-06 (итоги беседы 5.5)**: Representation Transformer\n"
      "> graph↔theses закрыт (запрос 1 + смоук tests/smoke-55-request1.mjs 56 ✓ +\n"
      "> все тестовые запросы tests/test-55-requests2-7.mjs 106 ✓ ×2 (живой\n"
      "> сервер + мок Claude SSE + браузер); check:integration += 2v/4af/5w с\n"
      "> дрейф-контролем «плейсхолдеры transform.* ↔ переменные сервиса», «пути\n"
      "> api/transforms ↔ роуты», «ключ стрима клиент ↔ сервер»). Дыры, закрытые\n"
      "> этим патчем (глава «По факту 5.5»): откат — из `target_snapshot`\n"
      "> (03 §2.15 и текст запроса говорили «source_snapshot» вопреки 02 §2.28);\n"
      "> «перерисовать раздел через element-renderer» оставляло бы прежние\n"
      "> обоснования при новых таблицах — раздел замещается целиком и таблицы\n"
      "> перерисовываются; форма результата — задание раздела из\n"
      "> buildSectionDefs, шаблон задаёт только режим; долги §12 «нормализация\n"
      "> типов на каталог» и «парсер глоссария при lang ≠ Russian» закрыты;\n"
      "> `start_transform` не было в `WsClientMessage`/хендлере. Грабли стенда:\n"
      "> `store.load()` после `transform_done` размонтирует панель (грабля R3\n"
      "> 2.3 повторилась) — только reloadSections + applySynthesis; ожидания\n"
      "> WS-сообщений в харнессе — с индексом «с какого момента» (`mark()`),\n"
      "> иначе подхватываются старые transform_started/done.\n"
      ">\n"
      "> **Правки 2026-09-05 (итоги беседы 5.4)**:",
      "A 07 шапка")

# ── C. текст беседы 5.5 ────────────────────────────────────────────────
patch(P07,
      "- `01-architecture.md` (секция 4.10 Representation Transformer)",
      "- `01-architecture.md` (секция 4.11 Representation Transformer)",
      "C1 07 5.5 ссылка §4.11")
patch(P07,
      "     c. Делает снимок текущих тезисов → source_snapshot\n"
      "     d. Делает снимок текущего графа → для аудита",
      "     c. Делает снимок текущих тезисов → target_snapshot (цель до замены —\n"
      "        из него откат; 02 §2.28)\n"
      "     d. Делает снимок текущего графа → source_snapshot (источник, аудит)",
      "C2 07 5.5 снимки g2t")
patch(P07,
      "     c. Снимок текущего графа → source_snapshot\n"
      "     d. Стримит → парсит HTML → parseGraphFromHTML → saveGraphToDb",
      "     c. Снимок текущего графа → target_snapshot, тезисов → source_snapshot\n"
      "     d. Стримит → парсит HTML → parseGraphFromHTML → saveGraphToDb",
      "C3 07 5.5 снимки t2g")
patch(P07,
      "     a. Загружает source_snapshot\n"
      "     b. Определяет direction: если graph_to_theses → восстанавливает тезисы\n"
      "        из source_snapshot; если theses_to_graph → восстанавливает граф",
      "     a. Загружает target_snapshot (представление-цель до замены; 02 §2.28)\n"
      "     b. Определяет direction: если graph_to_theses → восстанавливает тезисы\n"
      "        из target_snapshot; если theses_to_graph → восстанавливает граф",
      "C4 07 5.5 rollback")
patch(P07,
      "   - После замены тезисов/графа в БД перерисовать соответствующий раздел\n"
      "     в sections.html_content через element-renderer (02 §3, решение п.1):\n"
      "     иначе документ покажет прежний текст",
      "   - После замены тезисов/графа в БД перерисовать соответствующий раздел\n"
      "     в sections.html_content через element-renderer (02 §3, решение п.1):\n"
      "     иначе документ покажет прежний текст\n"
      "     (ФАКТ 5.5: html раздела-хозяина замещается ЦЕЛИКОМ сгенерированной\n"
      "     секцией — ответ и есть полный раздел, — а затем таблицы\n"
      "     перерисовываются рендерером из строк БД; см. «По факту 5.5» п.2)",
      "C5 07 5.5 п.4")
patch(P07,
      "→ новые тезисы (количество может отличаться) → старые тезисы в source_snapshot → representation_transforms содержит запись»",
      "→ новые тезисы (количество может отличаться) → старые тезисы в target_snapshot, граф в source_snapshot → representation_transforms содержит запись»",
      "C6 07 5.5 тест R2")

# ── B. «По факту 5.5» ──────────────────────────────────────────────────
FACT55 = """
Файлы 5.5 для следующих бесед (факт): `server/services/representation-transformer.ts`
(образец операции «свой снимок + замена раздела целиком»), `server/config/
transform-templates.ts` (шаблоны, которые правит админка 6.2 — плейсхолдеры
под дрейф-контролем 4af), `client/src/hooks/useTransformStream.ts` +
`client/src/components/edit/TransformPanel.tsx` (образец панели операции с
подтверждением и историей — для BillingPage/AdminPromptsPage 6.2).

**По факту 5.5 (2026-09-06) — отступления от буквы первого запроса:**

1. **Форма результата — не из шаблона, а из buildSectionDefs.** П. 2
   просил шаблон «выдели категории, связи, кластеры, роли…». Описывать
   столбцы таблиц в шаблоне значило бы дублировать section-templates 1.2
   и разъехаться с парсерами при первой правке админом (6.2). Шаблон
   `transform.{direction}` задаёт ТОЛЬКО режим трансформации (источник —
   единственный вход, запрет зерна/прочих разделов, правила конверсии), а в
   `{{section_task}}` подставляется готовое задание раздела-цели из
   `buildSectionDefs` (тот же `p`, что у правок — `buildEditInfra`). SYS —
   `buildSYS(p, { outputMode: "full" })`: ответ — целый `<div
   class="doc-section">` раздела, парсится штатными
   `parseThesesFromHTML` / `parseGraphFromHTML`. Плейсхолдеры:
   `synthesis_context`, `graph_block` | `theses_block`, `section_task`.
2. **Замена html раздела целиком + перерисовка таблиц.** П. 4 велел
   «перерисовать раздел через element-renderer». Перерисовка одной таблицы
   оставила бы прежние обоснования тезисов и комментарии к кластерам при
   новых строках — тот рассинхрон, о котором 02 §3. Раздел-хозяин, если он
   есть в `sections`, замещается сгенерированной секцией (паритет
   `regenerateSection`), после чего таблицы дополнительно перерисовываются
   `applyElementUpdateToHtml` из строк БД (тождество БД↔HTML после
   нормализаций парсера; номер § берётся из существующей строки sections).
   Раздела нет (тезисы/граф никогда не генерировались) → только гранулярные
   таблицы, `resultSummary.sectionMissing = 1` (паритет htmlSync 5.1).
3. **Снимки — по 02 §2.28, а не по 03 §2.15.** `source_snapshot` —
   представление-ИСТОЧНИК на момент трансформации, `target_snapshot` —
   представление-ЦЕЛЬ до замены; откат — из `target_snapshot` (03 и текст
   запроса говорили «source_snapshot»; исправлено этим патчем). Снимок несёт
   строки БД целиком (с id — откат восстанавливает прежние id, и
   полиморфные ссылки `element_versions` / `element_enrichments` снова
   живы) и `sectionHtml` раздела-хозяина (откат возвращает и прозу):
   `GraphSnapshot { kind:"graph", categories, edges, clusters, sectionHtml }`
   | `ThesesSnapshot { kind:"theses", theses, sectionHtml }`.
4. **Строка-откат** пишется с тем же `direction`, `resultSummary.rollback = 1`,
   токены 0; её `source_snapshot` — восстановленный снимок (вход отката),
   `target_snapshot` — состояние цели ДО отката. Поэтому откат строки-отката
   возвращает состояние до неё («откат отката»). Ответ `POST …/rollback`
   аддитивно к `{ ok: true }` несёт `transform` (строку-откат) и `summary`.
5. **Стоимость.** 01 §4.9 исключает из `total_cost_usd` только обогащения;
   трансформация замещает раздел документа → входит в totals (`bumpTotals`)
   и пишет `generation_log` с `source: 'edit'` (enum иного не даёт) и меткой
   «[трансформация граф → тезисы]» в `section_label`; `section_key` —
   раздел-цель. Ключ API — из env (BYO-Key — 6.1, как у всех операций).
6. **Нормализация типов на каталог — в saveGraphToDb**, не только в
   трансформациях: `normalizeGraphTypesToCatalog(synthesisId)` после
   транзакции вставки (fail-open, текст типа не меняется, опция
   `{ normalizeTypes: false }` для round-trip-смоуков). Закрыт долг §12
   (T3 03 §1.1) для генерации, импорта и трансформаций сразу.
7. **Пустой источник → 400 синхронно** на роуте (`hasSourceRepresentation`),
   до запуска фона: `{ error: "No theses to transform" | "No graph to
   transform", code: VALIDATION_ERROR }`. Гейты как у обогащений: не-UUID →
   404, чужой → 403, активная операция → 409 `GENERATION_IN_PROGRESS`
   (и на rollback — гонка с генерацией). GET истории — владелец ИЛИ
   публичный синтез.
8. **WS `start_transform`** не был в `WsClientMessage` и в
   `CLIENT_MESSAGE_TYPES` хендлера (03 §3.1 его описывал) — добавлен как
   альтернативный вход с проверкой владельца; при активной операции даёт
   `stream_error` с `sectionKey "transform:{direction}"`, второй операции не
   создаёт. Клиент запускает REST (`POST /transform/*` → `{ ok }`), ответ
   слушает по собственному WS-каналу (`useTransformStream`, паритет
   `useEnrichmentStream` 5.4): `transform_started` → `stream_delta
   "transform:{direction}"` (живой предпросмотр HTML) → `transform_done`
   (summary, usage); обрыв → `stream_error`. Guard `transform:` добавлен в
   `useStreamingGeneration`.
9. **Подтверждение в панели — явный второй шаг** («Преобразовать» → «Да,
   преобразовать»), не `window.confirm`: решение о перезаписи целого
   раздела заслуживает видимого предупреждения с превью потерь (счётчики
   тезисов / категорий и связей из GET /theses, GET /categories). Откат в
   истории — `window.confirm` (паритет VersionHistory 5.2). Закрытие панели
   во время стрима заблокировано.
10. **Неразрушающее обновление после финала**: `reloadSections` +
    `getSynthesis → applySynthesis` (total_cost_usd в футере) + перечитка
    графа; `store.load()` размонтировал бы панель со summary (грабля R3 2.3
    повторилась и поймана тестом).
11. **Слот действий над разделом** — `SectionView.actions` /
    `DocumentView.sectionActionsFor` (кнопка «→ Граф» над theses у
    владельца при status ≠ generating); «→ Тезисы» в тулбаре GraphModal
    только при `editable` и непустом графе; секция «Трансформации» в
    EditModal — история с откатом (запуск оттуда не дублируется).
12. **Долг §12 «парсер глоссария при lang ≠ Russian»** закрыт попутно:
    `parseGlossaryFromHTML` сначала ищет таблицу внутри
    `[data-section="Таблица определений"]` (константа
    `GLOSSARY_TABLE_SECTION` ≡ `TABLE_SUBSECTIONS.glossary` рендерера), затем
    прежний путь по th «термин».
13. **Грабли стенда 5.5.** Ожидания WS-сообщений в харнессе обязаны быть
    «с момента» (`mark()`/`since`): без индекса подхватываются старые
    `transform_started/done` и тесты зеленеют ложно, а следующие падают
    каскадом. `pkill -f index.ts` убивает собственную оболочку — искать
    процессы `ps aux | grep "[s]erver/index"`. Мок Claude для
    трансформаций детерминирован: категории — из первых двух слов
    формулировок, тезисы — по одному на категорию из блока графа (так
    проверяется влияние правки тезиса №2).
"""
patch(P07,
      "   - transformGraphToTheses, transformThesesToGraph,\n"
      "     getTransformHistory, rollbackTransform\n"
      "```\n\n**Последующие запросы:**\n"
      "- «Протестируй graph→theses:",
      "   - transformGraphToTheses, transformThesesToGraph,\n"
      "     getTransformHistory, rollbackTransform\n"
      "```\n" + FACT55 + "\n**Последующие запросы:**\n"
      "- «Протестируй graph→theses:",
      "B 07 «По факту 5.5»")

# ── D. §12 ─────────────────────────────────────────────────────────────
patch(P07,
      "— вызывать `normalizeType` в `saveGraphToDb` (и в трансформациях) | 5.5 | 5.4 (дыра 1.4/0.3b) | внесён 2026-09-05 |",
      "— вызывать `normalizeType` в `saveGraphToDb` (и в трансформациях) | 5.5 | 5.4 (дыра 1.4/0.3b) | ЗАКРЫТ 5.5 (2026-09-06): `normalizeGraphTypesToCatalog` в graph-parser, вызывается из `saveGraphToDb` после транзакции (генерация, импорт, трансформации; fail-open; опция `normalizeTypes:false`); текст типа не меняется; 5w проверяет на посеянном каталоге |",
      "D1 §12 нормализация")
patch(P07,
      "(глоссарий такого документа не попадает в glossary_terms) — унифицировать поиск по data-section | 5.5 | 5.1 (дыра 1.4) | внесён 2026-09-03 |",
      "(глоссарий такого документа не попадает в glossary_terms) — унифицировать поиск по data-section | 5.5 | 5.1 (дыра 1.4) | ЗАКРЫТ 5.5 (2026-09-06): `parseGlossaryFromHTML` ищет сначала таблицу в `[data-section=\"Таблица определений\"]` (`GLOSSARY_TABLE_SECTION` ≡ `TABLE_SUBSECTIONS.glossary` рендерера), затем по th «термин» |",
      "D2 §12 глоссарий")
patch(P07,
      "| BYO-Key (ключ пользователя вместо env) | 6.1 | 1.4 | в тексте 6.1 |",
      "| BYO-Key (ключ пользователя вместо env) | 6.1 | 1.4 | в тексте 6.1; точки замены — все `env.anthropic.apiKey` с меткой TODO(6.1): generation-service, mode-service, element-enrichment (5.3), representation-transformer (5.5) |",
      "D3 §12 BYO-Key точки")

# ── E. 03 ──────────────────────────────────────────────────────────────
P03 = "docs/03-specification.md"
patch(P03,
      "POST   /syntheses/:id/transform/graph-to-theses\n"
      "                                → { ok: true }\n"
      "                                // Стриминг через WebSocket.\n"
      "                                // Генерирует тезисы из текущего графа (categories + edges).\n"
      "                                // Заменяет существующие тезисы. Снимок сохраняется.\n",
      "POST   /syntheses/:id/transform/graph-to-theses\n"
      "                                → { ok: true }\n"
      "                                // Стриминг через WebSocket.\n"
      "                                // Генерирует тезисы из текущего графа (categories + edges).\n"
      "                                // Заменяет существующие тезисы. Снимок сохраняется.\n"
      "                                // ФАКТ 5.5 (2026-09-06): операция исполняется ФОНОМ под\n"
      "                                // generation-слотом; гейты: не-UUID → 404, чужой → 403,\n"
      "                                // активная операция → 409 GENERATION_IN_PROGRESS, пустой\n"
      "                                // источник → 400 VALIDATION_ERROR \"No graph to transform\"\n"
      "                                // (синхронно, до запуска). Поток: transform_started →\n"
      "                                // stream_delta \"transform:{direction}\" → transform_done;\n"
      "                                // обрыв → stream_error. Раздел-хозяин замещается целиком,\n"
      "                                // таблицы перерисовываются; входит в total_cost_usd.\n",
      "E1 03 §2.15 g2t")
patch(P03,
      "                                // Строит граф из текущих тезисов.\n"
      "                                // Заменяет существующий граф. Снимок сохраняется.\n",
      "                                // Строит граф из текущих тезисов.\n"
      "                                // Заменяет существующий граф. Снимок сохраняется.\n"
      "                                // ФАКТ 5.5: те же гейты; пустой источник → 400\n"
      "                                // \"No theses to transform\"; типы нормализуются на каталог\n"
      "                                // (saveGraphToDb); без раздела graph в документе —\n"
      "                                // только таблицы, resultSummary.sectionMissing = 1.\n",
      "E2 03 §2.15 t2g")
patch(P03,
      "GET    /syntheses/:id/transforms\n"
      "                                → { transforms: RepresentationTransform[] }\n"
      "                                // История трансформаций\n"
      "\n"
      "POST   /syntheses/:id/transforms/:transformId/rollback\n"
      "                                → { ok: true }\n"
      "                                // Откат: восстанавливает source_snapshot\n",
      "GET    /syntheses/:id/transforms\n"
      "                                → { transforms: RepresentationTransform[] }\n"
      "                                // История трансформаций (новые первыми;\n"
      "                                // владелец ИЛИ публичный синтез — правило 1.6)\n"
      "\n"
      "POST   /syntheses/:id/transforms/:transformId/rollback\n"
      "                                → { ok: true, transform, summary }\n"
      "                                // Откат: восстанавливает target_snapshot (представление-\n"
      "                                // цель до замены — 02 §2.28; до правки 2026-09-06 здесь\n"
      "                                // ошибочно стояло «source_snapshot»), прежние id строк и\n"
      "                                // html раздела из снимка. Синхронно (без Claude); только\n"
      "                                // владелец, под 409-гейтом; чужой/неизвестный id → 404.\n"
      "                                // Пишется строкой-откатом (resultSummary.rollback = 1,\n"
      "                                // source = восстановленный снимок, target = состояние до\n"
      "                                // отката → откат отката возможен); ответ несёт её.\n",
      "E3 03 §2.15 rollback")
patch(P03,
      "  resultSummary: {\n"
      "    categoriesCreated?: number;\n"
      "    categoriesRemoved?: number;\n"
      "    edgesCreated?: number;\n"
      "    edgesRemoved?: number;\n"
      "    thesesCreated?: number;\n"
      "    thesesRemoved?: number;\n"
      "  };\n",
      "  resultSummary: {\n"
      "    categoriesCreated?: number;\n"
      "    categoriesRemoved?: number;\n"
      "    edgesCreated?: number;\n"
      "    edgesRemoved?: number;\n"
      "    thesesCreated?: number;\n"
      "    thesesRemoved?: number;\n"
      "    // ФАКТ 5.5: + clustersCreated, categoriesNormalized, edgesNormalized\n"
      "    // (theses→graph), sectionMissing (1 — раздела-хозяина нет в\n"
      "    // документе), rollback (1 — строка-откат)\n"
      "  };\n"
      "  // ФАКТ 5.5: DTO несёт также synthesisId, sourceSnapshot, targetSnapshot\n"
      "  // (GraphSnapshot | ThesesSnapshot, см. 02 §2.28) — shared/types/elements\n",
      "E4 03 §2.15 summary")
patch(P03,
      "| T3 | Нормализация типов при парсинге ответа Claude (маппинг на каталог) | Фаза 0 (сделано 0.3b — ТОЛЬКО сервис `normalizeType`; ФАКТ 5.4: в конвейере парсинга не вызывается, `typeCatalogId` остаётся null — долг §12 → 5.5) |",
      "| T3 | Нормализация типов при парсинге ответа Claude (маппинг на каталог) | Фаза 0 (сервис `normalizeType` — 0.3b; вызов из конвейера `saveGraphToDb` — СДЕЛАНО 5.5 (2026-09-06): `normalizeGraphTypesToCatalog`, fail-open, текст типа не меняется) |",
      "E5 03 §1.1 T3")
patch(P03,
      "// руками — typeCatalogId: null. У сгенерированных элементов typeCatalogId\n"
      "// всегда null (парсер 1.4 на каталог не нормализует — долг §12 → 5.5).\n",
      "// руками — typeCatalogId: null. У сгенерированных элементов typeCatalogId\n"
      "// с 5.5 (2026-09-06) заполняется нормализацией в saveGraphToDb (до 5.5 —\n"
      "// всегда null); нет совпадения с каталогом (порог 0.75) → null.\n",
      "E6 03 §2.4 п.11")

# ── F. 05 ──────────────────────────────────────────────────────────────
P05 = "docs/05-file-structure.md"
patch(P05,
      "│   │   │   ├── useEnrichmentStream.ts  # Канал обогащений/обоснований: свой WS,\n"
      "│   │   │   │                           # REST-запуск, enrichment_delta/done (5.4)\n",
      "│   │   │   ├── useEnrichmentStream.ts  # Канал обогащений/обоснований: свой WS,\n"
      "│   │   │   │                           # REST-запуск, enrichment_delta/done (5.4)\n"
      "│   │   │   ├── useTransformStream.ts   # Канал трансформаций graph↔theses: свой WS,\n"
      "│   │   │   │                           # REST-запуск, stream_delta transform:*/done (5.5)\n",
      "F1 05 useTransformStream")
patch(P05,
      "│   │   └── enrichment-templates.ts    # 6 шаблонов enrichment.* (5.3; новые тексты,\n"
      "│   │                                  # не из исходника; JUSTIFICATION_SECTIONS)\n",
      "│   │   ├── enrichment-templates.ts    # 6 шаблонов enrichment.* (5.3; новые тексты,\n"
      "│   │   │                              # не из исходника; JUSTIFICATION_SECTIONS)\n"
      "│   │   └── transform-templates.ts     # 2 шаблона transform.* (5.5; новые тексты —\n"
      "│   │                                  # режим трансформации; форма результата —\n"
      "│   │                                  # {{section_task}} из buildSectionDefs)\n",
      "F2 05 transform-templates")
patch(P05,
      "│   │   ├── transforms.ts               # POST transform graph-to-theses / theses-to-graph, history, rollback\n",
      "│   │   ├── transforms.ts               # POST transform graph-to-theses / theses-to-graph, history, rollback (5.5 СДЕЛАНО 2026-09-06)\n",
      "F3 05 routes/transforms")
patch(P05,
      "│   │   ├── representation-transformer.ts # Трансформация graph↔theses: прямая конверсия\n"
      "│   │   │                               # представлений без каскадной перегенерации\n",
      "│   │   ├── representation-transformer.ts # Трансформация graph↔theses: прямая конверсия\n"
      "│   │   │                               # представлений без каскадной перегенерации\n"
      "│   │   │                               # (5.5 СДЕЛАНО 2026-09-06: снимки, откат, слот)\n",
      "F4 05 representation-transformer")
patch(P05,
      "│   │   │   ├── transforms.ts           # graph↔theses, история, откат (5.5)\n",
      "│   │   │   ├── transforms.ts           # graph↔theses, история, откат (5.5 СДЕЛАНО 2026-09-06)\n",
      "F5 05 api/transforms")
patch(P05,
      "│   │   │   │                               # (СДЕЛАНО 2026-09-05), Transform* — 5.5\n",
      "│   │   │   │                               # (СДЕЛАНО 2026-09-05), Transform* — 5.5\n"
      "│   │   │   │                               # (СДЕЛАНО 2026-09-06)\n",
      "F6 05 edit/ шапка")
patch(P05,
      "│   │   │   │   └── TransformPanel.tsx      # Кнопки graph→theses / theses→graph, превью, история\n",
      "│   │   │   │   └── TransformPanel.tsx      # Кнопки graph→theses / theses→graph, превью, история\n"
      "│   │   │   │                               # (5.5; двухшаговое подтверждение, живой предпросмотр)\n",
      "F7 05 TransformPanel")

# ── G. 04 ──────────────────────────────────────────────────────────────
P04 = "docs/04-code-reuse-map.md"
patch(P04,
      "| `server/services/representation-transformer.ts` | Трансформация graph↔theses: прямая конверсия представлений (идея из предыдущего проекта) |\n"
      "| `server/routes/transforms.ts` | API трансформаций + история + откат |\n"
      "| `client/components/edit/TransformPanel.tsx` | UI: кнопки трансформации, превью, история, откат |\n",
      "| `server/services/representation-transformer.ts` | Трансформация graph↔theses: прямая конверсия представлений (идея из предыдущего проекта) — ФАКТ (5.5, 2026-09-06): шаблон Registry `transform.{direction}` задаёт режим, форма результата — задание раздела из `buildSectionDefs` (SYS outputMode full); снимки `GraphSnapshot`/`ThesesSnapshot` со строками БД и `sectionHtml`; раздел-хозяин замещается целиком + перерисовка таблиц рендерером; откат из `target_snapshot` с прежними id, строка-откат; под generation-слотом, дельты `transform:{direction}`; входит в totals, generation_log 'edit' |\n"
      "| `server/routes/transforms.ts` | API трансформаций + история + откат — ФАКТ (5.5): POST /transform/* → { ok } фоном (404/403/409, пустой источник → 400 синхронно), GET владелец/публичный, rollback синхронный → { ok, transform, summary } |\n"
      "| `server/config/transform-templates.ts` | НОВОЕ (5.5): два шаблона transform.* (плейсхолдеры synthesis_context / graph_block \\| theses_block / section_task — дрейф-контроль 4af) |\n"
      "| `client/components/edit/TransformPanel.tsx` | UI: кнопки трансформации, превью, история, откат — ФАКТ (5.5): направление, предупреждение с превью потерь, двухшаговое подтверждение, прогресс + живой предпросмотр HTML, summary, вложенная TransformHistory |\n"
      "| `client/components/edit/TransformHistory.tsx`, `client/hooks/useTransformStream.ts`, `client/api/transforms.ts` | НОВОЕ (5.5, ФАКТ 2026-09-06): история с откатом (confirm — паритет VersionHistory), канал доставки по образцу useEnrichmentStream (REST-запуск, свой WS), 5 api-функций; интеграция: `GraphModal.onTransform` («→ Тезисы»), слот `SectionView.actions` / `DocumentView.sectionActionsFor` («→ Граф» у theses), секция «Трансформации» в EditModal, guard `transform:` в useStreamingGeneration |\n",
      "G 04 §4 5.5")

# ── H. README ──────────────────────────────────────────────────────────
patch("README.md",
      "check:integration += 2u/4ae; долги §12 CATEGORY_TYPES и WS-запуск\n"
      "обоснования закрыты); доки пропатчены scripts/patch-docs-conv54.py.\n"
      "Следующие по графу 07 — 5.5 (Representation Transformer) либо 6.1.\n",
      "check:integration += 2u/4ae; долги §12 CATEGORY_TYPES и WS-запуск\n"
      "обоснования закрыты); доки пропатчены scripts/patch-docs-conv54.py.\n"
      "Беседа 5.5 (Representation Transformer graph↔theses, бэкенд + клиент)\n"
      "ЗАКРЫТА 2026-09-06: representation-transformer + routes/transforms\n"
      "§2.15 + 2 шаблона transform.* + нормализация типов на каталог в\n"
      "saveGraphToDb + WS start_transform; клиент: api/transforms +\n"
      "useTransformStream + TransformPanel/TransformHistory + «→ Тезисы» в\n"
      "графе / «→ Граф» у раздела тезисов / секция в EditModal (смоук 56 ✓,\n"
      "tests/test-55-requests2-7.mjs 106 ✓ ×2 на моке Claude + браузер,\n"
      "check:integration += 2v/4af/5w; долги §12 «нормализация типов» и\n"
      "«парсер глоссария при lang ≠ Russian» закрыты); доки пропатчены\n"
      "scripts/patch-docs-conv55.py. Фаза 5 закрыта целиком; следующая по\n"
      "графу 07 — 6.1 (Billing Service).\n",
      "H1 README статус-абзац")
patch("README.md",
      "## Статус: Фазы 0–4 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3; Фаза 3: 3.1, 3.2; Фаза 4: 4.1, 4.2, 4.3); Фаза 5 начата — 5.1, 5.2 и 5.3 закрыты (2026-09-04)",
      "## Статус: Фазы 0–5 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3; Фаза 3: 3.1, 3.2; Фаза 4: 4.1, 4.2, 4.3; Фаза 5: 5.1–5.5, закрыта 2026-09-06)",
      "H2 README заголовок статуса")

# ── I. UI-кит ──────────────────────────────────────────────────────────
PKIT = "docs/fragments-for-conversations/5-6-ui-kit.md"
patch(PKIT,
      "| 5.5 | TransformPanel (graph ↔ theses) |",
      "| 5.5 | TransformPanel (graph ↔ theses) — СДЕЛАНО 2026-09-06: блок 9 перенесён в часть 3 `globals.css` дословно; дополнения (строка истории `.transform-item` поверх `.version-item`, живой предпросмотр `.transform-live`, строка действий раздела `.section-actions`, секция `.transform-section` в модалке) — там же с комментариями |",
      "I1 кит таблица")
patch(PKIT,
      "| 9 | `.transform-row`, `.transform-arrow`, `.transform-warn` | 5.5: направление преобразования и предупреждение о перезаписи |",
      "| 9 | `.transform-row`, `.transform-arrow`, `.transform-warn` | 5.5: направление преобразования и предупреждение о перезаписи (СДЕЛАНО 2026-09-06; превью потерь — в тексте `.transform-warn`, подтверждение — второй шаг кнопок, не confirm) |",
      "I2 кит блок 9")

# ── J. 01 ──────────────────────────────────────────────────────────────
P01 = "docs/01-architecture.md"
patch(P01,
      "ФАКТ 5.4 (2026-09-05): нормализация на каталог в graph-parser/saveGraphToDb НЕ вызывается (только lower-case текста) — `type_catalog_id` заполняется лишь через PATCH/TaxonomySelector; долг §12 07 → 5.5",
      "ФАКТ 5.5 (2026-09-06): нормализация на каталог — `normalizeGraphTypesToCatalog` в graph-parser, вызывается из `saveGraphToDb` после транзакции (fail-open; текст типа не меняется; до 5.5 `type_catalog_id` заполнялся лишь через PATCH/TaxonomySelector)",
      "J1 01 §4.6 факт")
patch(P01,
      "**Версионирование**: каждая трансформация создаёт снимок в `representation_transforms` (что было до, что стало после, направление). Пользователь может откатить к любой точке.\n",
      "**Версионирование**: каждая трансформация создаёт снимок в `representation_transforms` (что было до, что стало после, направление). Пользователь может откатить к любой точке.\n"
      "\n"
      "**ФАКТ 5.5 (2026-09-06).** Промпт = шаблон Registry `transform.{direction}` (режим: источник — единственный вход, запрет зерна и прочих разделов, правила конверсии) + `{{section_task}}` — задание раздела-цели из `buildSectionDefs` (1.2), SYS с outputMode `full`: ответ — целый раздел той же формы, что при генерации, парсится штатными парсерами 1.4. Раздел-хозяин в документе замещается целиком, таблицы перерисовываются рендерером 5.1; раздела нет → только гранулярные таблицы (`sectionMissing`). Снимки: `source_snapshot` — источник на момент трансформации, `target_snapshot` — цель до замены (из него откат; строки БД целиком с id + html раздела). Операция идёт под generation-слотом синтеза (409 при любой активной), стоимость входит в `total_cost_usd`.\n",
      "J2 01 §4.11 факт")

# ── K. 02 ──────────────────────────────────────────────────────────────
P02 = "docs/02-data-model.md"
patch(P02,
      "    -- Для graph_to_theses: source = граф, target = прежние тезисы.\n",
      "    -- Для graph_to_theses: source = граф, target = прежние тезисы.\n"
      "    -- ФАКТ 5.5 (2026-09-06): форма JSON — GraphSnapshot { kind:'graph',\n"
      "    -- categories, edges, clusters, sectionHtml } | ThesesSnapshot\n"
      "    -- { kind:'theses', theses, sectionHtml }: строки БД целиком (с id —\n"
      "    -- откат восстанавливает прежние id, полиморфные ссылки\n"
      "    -- element_versions/element_enrichments снова живы) + html_content\n"
      "    -- раздела-хозяина (null — раздела не было). Строка-откат: тот же\n"
      "    -- direction, result_summary.rollback = 1, токены 0, source =\n"
      "    -- восстановленный снимок, target = состояние до отката.\n",
      "K 02 §2.28 факт")

print(f"\nИтог: applied={applied} skip={skipped} fail={failed}")
raise SystemExit(1 if failed else 0)
