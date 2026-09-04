#!/usr/bin/env python3
"""Патч документации по итогам беседы 5.3 (Extended Characteristics +
Enrichment Service, бэкенд).

Закрывает дыры, найденные при исполнении беседы (2026-09-04):
  A  07 — запись ревизии в шапке.
  B  07 — глава «По факту 5.3» после текста беседы (ответ POST { ok: true }
     + WS вместо { enrichment }; слот; SYS(mode); без bumpTotals; парсинг
     трёх data-section; шесть ключей; WS без characteristic; defaultDirection).
  C  07 5.3 — «пять ключей» → шесть; контекст для 5.4 += characteristics
     и enrichment-templates.
  D  07 §12 — строка долга биллинга дополнена фактом (разъём setUsageRecorder
     сделан); новый долг: WS-запуск обоснования характеристики (start_enrichment
     не несёт characteristic/value) → 5.4.
  E  03 §2.14 — «пять ключей» → шесть; ответ POST — { ok: true } + WS
     (решение п.5 §3.1); enrichment_done += enrichmentId/content; GET
     ?elementType; §2.13 POST relationship-types — defaultDirection
     принимается (5.3); §3.1 — start_enrichment не покрывает
     обоснование характеристики.
  F  05 — shared/constants/characteristics.ts, server/config/enrichment-
     templates.ts, пометки «СДЕЛАНО 5.3» у routes/taxonomy и enrichment.
  G  04 §4 — ФАКТ-пометки element-enrichment / routes/taxonomy / enrichment.
  H  README — статус: 5.3 закрыта.

Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patch-docs-conv53.py
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
P03 = "docs/03-specification.md"
P04 = "docs/04-code-reuse-map.md"
P05 = "docs/05-file-structure.md"

# ═══ A. 07 — шапка ═══
patch(P07,
    "> **Правки 2026-09-04 (итоги беседы 5.2)**",
    """> **Правки 2026-09-04 (итоги беседы 5.3)**: Enrichment Service закрыт
> (запрос 1 + смоук tests/smoke-53-request1.mjs 59 ✓ + все тестовые
> запросы tests/test-53-requests2-6.mjs 87 ✓ ×2 (живой сервер + мок
> Claude SSE); check:integration += 2t/4ad/5v с дрейф-контролем
> «шаблоны enrichment.* ↔ переменные сервиса»). Дыры, закрытые этим
> патчем (глава «По факту 5.3»): 03 §2.14 обещал `POST → { enrichment }`,
> а решение п.5 §3.1 — `{ ok: true }` + WS: выбран п.5, `enrichment_done`
> += enrichmentId/content; «пять ключей Registry» при шести
> перечисленных; `createCustomType` 0.3b терял `defaultDirection`
> из §2.13; `start_enrichment` не несёт characteristic/value —
> обоснование характеристики запускается только HTTP; п.18 пишет
> `depth` при колонке `depth_score` → резолвер алиасов в
> shared/constants/characteristics. Грабля стенда: в песочнике не было
> PG/Redis — ставить apt-get (nodesource-источник удалить), БД
> philosynth/philosynth_dev создать вручную.
>
> **Правки 2026-09-04 (итоги беседы 5.2)**""",
    "A. 07 шапка")

# ═══ B. 07 — «По факту 5.3» ═══
patch(P07,
    """---

### Беседа 5.4: Характеристики + Обогащение + Таксономия UI (клиент)""",
    """**По факту 5.3 (2026-09-04) — отступления от буквы первого запроса:**

1. **Ответ POST-роутов §2.14 — `{ ok: true }`, результат — по WS**
   (`enrichment_delta` → `enrichment_done`), а не `{ enrichment }` из тела
   §2.14: решение п.5 §3.1 (2026-09-02, «HTTP создаёт операцию, WS
   подписывает») и паритет режимов 4.1. Чтобы клиенту не понадобился
   повторный GET, `enrichment_done` аддитивно несёт `enrichmentId` и
   `content` (аналог `mode_done.html`).
2. **Обогащение исполняется под generation-слотом синтеза**
   (`withGenerationSlot`): второй запуск при активной операции → 409
   `GENERATION_IN_PROGRESS` (идемпотентность п.5), гонки с правками 5.1 и
   генерацией исключены. Паузы (pausedState) у обогащений нет — как у
   режимов; обрыв → `stream_error` с `sectionKey "enrich:{тип}:{id}"`.
3. **Системный промпт — `buildSYS(p, { outputMode: "mode" })`**: формат
   ответа задаёт сам шаблон; седьмого ключа `enrichment.system` канон
   §2.14 не предусматривает, поэтому не заведён. Ключей ШЕСТЬ («пять»
   в тексте — ошибка счёта). Шаблоны — `server/config/enrichment-
   templates.ts` (новые тексты, генератора нет; сеются `seed-prompts`).
4. **Стоимость** — в строке `element_enrichments` /
   `characteristic_justifications`; `bumpTotals` не вызывается (01 §4.9),
   `generation_log` не пишется (`log_type` не предусматривает).
   Биллинг — разъём `setUsageRecorder` (no-op; строку `api_usage` и
   `used_enrichments` пишет 6.1 — долг §12 внесён ранее).
5. **Обоснование характеристики** — `enrichment_done` с `enrichmentType:
   'characteristic'` и `enrichmentId` = id строки
   `characteristic_justifications` (своего финала у §3.2 нет). Ответ Claude
   — три `data-section` «Основания / Ограничения / Альтернативные подходы»
   → три колонки; без секций весь текст идёт в `justification` (fail-soft).
   Диапазон значения — по характеристике (`shared/constants/
   characteristics.ts`: 8 у категорий, 6 у связей; `innovation_degree`
   целое [1,5]); принимаются snake_case, camelCase DTO и `depth`
   (п.18) → канонический `depth_score`. WS `start_enrichment` не несёт
   `characteristic`/`value` — обоснование запускается только HTTP-роутом.
6. **`routes/taxonomy.ts`** — тонкие обёртки над 0.3b на
   `/api/v1/taxonomy`; `createCustomType` получил необязательный
   `defaultDirection` (§2.13 его требовал, сервис 0.3b терял); дубликат
   ключа → 400 VALIDATION_ERROR (контракт `TaxonomyValidationError`).
7. **Промпт обогащения** несёт контекст синтеза (зерно, метки метода/
   уровня, философы и концепции-родители из lineage), поля элемента,
   русские метки ролей (обратная `ROLE_MAP`), метрики и связи из графа.

---

### Беседа 5.4: Характеристики + Обогащение + Таксономия UI (клиент)""",
    "B. 07 «По факту 5.3»")

# ═══ C. 07 5.3 — счёт ключей; контекст 5.4 ═══
patch(P07,
    """2. Промптовые шаблоны (добавить в seed-prompts.ts или через Admin UI) —
   канон 2026-09-02, 03 §2.14, пять ключей:""",
    """2. Промптовые шаблоны (добавить в seed-prompts.ts или через Admin UI) —
   канон 2026-09-02, 03 §2.14, шесть ключей (по факту 5.3 — файл
   server/config/enrichment-templates.ts):""",
    "C1. 07 5.3 шесть ключей")
patch(P07,
    "- Из предыдущих бесед: `server/services/element-enrichment.ts` (из 5.3), `server/services/element-taxonomy.ts` (из 0.3b), `client/components/edit/ElementEditor.tsx` (из 5.2), `client/components/graph/NodePanel.tsx` (из 1.7)",
    "- Из предыдущих бесед: `server/services/element-enrichment.ts` (из 5.3), `server/routes/enrichment.ts` и `server/routes/taxonomy.ts` (контракты §2.14/§2.13, «По факту 5.3»: POST → { ok:true }, результат — WS `enrichment_done` c enrichmentId/content), `packages/shared/constants/characteristics.ts` (диапазоны/подписи для CharacteristicSlider), `packages/shared/types/elements.ts` (входы обогащений, ElementEnrichment, CharacteristicJustification), `server/services/element-taxonomy.ts` (из 0.3b), `client/components/edit/ElementEditor.tsx` (из 5.2), `client/components/graph/NodePanel.tsx` (из 1.7)",
    "C2. 07 5.4 контекст")

# ═══ D. 07 §12 ═══
patch(P07,
    "| Учёт обогащений в биллинге (api_usage + used_enrichments; разъём в 5.3, наполнение — после 6.1) | 6.1 | 5.3 | внесён 2026-09-02 (п.10) |",
    """| Учёт обогащений в биллинге (api_usage + used_enrichments; разъём в 5.3, наполнение — после 6.1) | 6.1 | 5.3 | внесён 2026-09-02 (п.10); разъём `setUsageRecorder` (element-enrichment) СДЕЛАН 5.3 (2026-09-04), контекст несёт userId/synthesisId/streamKey/usage с посчитанной стоимостью |
| Запуск обоснования характеристики по WS: `start_enrichment` (03 §3.1) не несёт characteristic/value — пока только HTTP `POST /justify-characteristic`; либо расширить сообщение в 5.4, либо зафиксировать «только HTTP» в §3.1 | 5.4 | 5.3 | внесён 2026-09-04 |""",
    "D. 07 §12")

# ═══ E. 03 ═══
patch(P03,
    """// Пять ключей Registry: enrichment.category.description,
// enrichment.category.evolution, enrichment.category.justification,
// enrichment.edge.justification, enrichment.edge.counterarguments,
// enrichment.characteristic_justification.""",
    """// Шесть ключей Registry (правка 5.3: прежнее «пять» — ошибка счёта):
// enrichment.category.description,
// enrichment.category.evolution, enrichment.category.justification,
// enrichment.edge.justification, enrichment.edge.counterarguments,
// enrichment.characteristic_justification.
// По факту 5.3: все POST ниже отвечают { ok: true } и исполняются фоном
// под generation-слотом (409 GENERATION_IN_PROGRESS при активной
// операции) — решение п.5 §3.1; результат — WS enrichment_delta →
// enrichment_done (§3.2, += enrichmentId/content). Прежние формы
// «→ { enrichment }» / «→ { justification }» ниже — исторические.
// GET-история принимает необязательный ?elementType=category|edge.
// justify-characteristic: value валидируется по диапазону
// ХАРАКТЕРИСТИКИ (shared/constants/characteristics — п.18); characteristic
// принимает snake_case, camelCase DTO и `depth` → depth_score.""",
    "E1. 03 §2.14 канон + ответы")
patch(P03,
    """{ type: "enrichment_done",
  synthesisId: string,
  elementId: string,
  enrichmentType: string,
  usage: { inputTokens: number, outputTokens: number, costUsd: number } }""",
    """{ type: "enrichment_done",
  synthesisId: string,
  elementId: string,
  enrichmentType: string,      // 'characteristic' — обоснование характеристики
                               // (enrichmentId тогда — id characteristic_justifications)
  usage: { inputTokens: number, outputTokens: number, costUsd: number },
  enrichmentId: string,        // По факту 5.3 (аддитивно, паритет mode_done.html):
  content: string }            // id сохранённой строки и её содержимое""",
    "E2. 03 §3.2 enrichment_done")
patch(P03,
    """{ type: "start_enrichment", synthesisId: string,
  elementType: "category" | "edge", elementId: string,
  enrichmentType: string }""",
    """{ type: "start_enrichment", synthesisId: string,
  elementType: "category" | "edge", elementId: string,
  enrichmentType: string }
// По факту 5.3: обоснование характеристики (нужны characteristic+value)
// сообщение не покрывает — только POST /justify-characteristic (§12 → 5.4).
// Владелец проверяется явно; чужой синтез → stream_error FORBIDDEN.""",
    "E3. 03 §3.1 start_enrichment")
patch(P03,
    """POST   /taxonomy/relationship-types { key, nameRu, description, defaultDirection }
                                    → { type: RelationshipType }""",
    """POST   /taxonomy/relationship-types { key, nameRu, description, defaultDirection }
                                    → { type: RelationshipType }
                                    // По факту 5.3: defaultDirection ∈
                                    // unidirectional|bidirectional|reflexive,
                                    // необязателен (дефолт схемы); до 5.3
                                    // createCustomType 0.3b его терял. Оба
                                    // POST → 201; дубликат ключа → 400
                                    // VALIDATION_ERROR (контракт 0.3b).
                                    // Роуты смонтированы на /api/v1/taxonomy.""",
    "E4. 03 §2.13 defaultDirection")

# ═══ F. 05 ═══
patch(P05,
    "│       │   └── methods.ts              # METHOD_CODE, LEVEL_CODE, ORDER_CODE (METHOD_CODE, LEVEL_CODE)",
    """│       │   ├── methods.ts              # METHOD_CODE, LEVEL_CODE, ORDER_CODE (METHOD_CODE, LEVEL_CODE)
│       │   └── characteristics.ts      # Характеристики категорий (8) и связей (6) с
│       │                               # диапазонами, resolveCharacteristic (алиасы
│       │                               # depth/camelCase), validateCharacteristicValue
│       │                               # (5.3; нужны серверу и слайдерам 5.4)""",
    "F1. 05 shared/constants/characteristics")
patch(P05,
    "│   │   ├── taxonomy.ts                 # GET/POST category-types, relationship-types, normalize",
    "│   │   ├── taxonomy.ts                 # GET/POST category-types, relationship-types, normalize\n│   │   │                               # (СДЕЛАНО 5.3; монтируется на /api/v1/taxonomy)",
    "F2. 05 routes/taxonomy")
patch(P05,
    "│   │   ├── enrichment.ts               # POST enrich/category, enrich/edge, justify-characteristic",
    "│   │   ├── enrichment.ts               # POST enrich/category, enrich/edge, justify-characteristic\n│   │   │                               # + GET enrichments/justifications (СДЕЛАНО 5.3;\n│   │   │                               #  POST → { ok:true }, результат по WS)",
    "F3. 05 routes/enrichment")
patch(P05,
    "│   │   └── mode-deps.ts               # MODE_DEPS (v11)",
    "│   │   ├── mode-deps.ts               # MODE_DEPS (v11)\n│   │   └── enrichment-templates.ts    # 6 шаблонов enrichment.* (5.3; новые тексты,\n│   │                                  # не из исходника; JUSTIFICATION_SECTIONS)",
    "F4. 05 config/enrichment-templates")

# ═══ G. 04 §4 ═══
patch(P04,
    "| `server/services/element-enrichment.ts` | Точечные Claude-запросы для обогащения элементов (идея из предыдущего проекта) |",
    "| `server/services/element-enrichment.ts` | Точечные Claude-запросы для обогащения элементов (идея из предыдущего проекта) — ФАКТ (5.3): enrichCategory/enrichEdge/justifyCharacteristic под withGenerationSlot, стрим streamWithRetries → enrichment_delta/enrichment_done, SYS = buildSYS(mode), промпты из Registry (enrichment-templates), парсинг трёх data-section обоснования, getEnrichments/getJustifications, разъём setUsageRecorder (→ 6.1); чистые ядра buildCategoryVars/buildEdgeVars/buildCharacteristicVars — дрейф-контроль с шаблонами (integration-check 4ad) |",
    "G1. 04 element-enrichment")
patch(P04,
    "| `server/routes/taxonomy.ts` | API каталогов типов |",
    "| `server/routes/taxonomy.ts` | API каталогов типов — ФАКТ (5.3): пять обёрток §2.13 над element-taxonomy 0.3b, /api/v1/taxonomy; createCustomType += defaultDirection |",
    "G2. 04 routes/taxonomy")
patch(P04,
    "| `server/routes/enrichment.ts` | API обогащения элементов |",
    "| `server/routes/enrichment.ts` | API обогащения элементов — ФАКТ (5.3): пять роутов §2.14; POST — владелец/409/синхронная валидация (диапазон по характеристике) + фон, GET — владелец или публичный |",
    "G3. 04 routes/enrichment")

# ═══ H. README ═══
patch("README.md",
    "## Статус: Фазы 0–4 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3; Фаза 3: 3.1, 3.2; Фаза 4: 4.1, 4.2, 4.3); Фаза 5 начата — 5.1 и 5.2 закрыты (2026-09-04)",
    "## Статус: Фазы 0–4 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3; Фаза 3: 3.1, 3.2; Фаза 4: 4.1, 4.2, 4.3); Фаза 5 начата — 5.1, 5.2 и 5.3 закрыты (2026-09-04)",
    "H1. README заголовок")
patch("README.md",
    "Следующие по графу 07 — 5.3 (Enrichment, бэкенд) либо 6.1.",
    """Беседа 5.3 (Extended Characteristics + Enrichment Service, бэкенд)
ЗАКРЫТА 2026-09-04: element-enrichment + routes/enrichment §2.14 +
routes/taxonomy §2.13 (дыра 0.3b) + 6 шаблонов enrichment.* +
shared/constants/characteristics (смоук 59 ✓,
tests/test-53-requests2-6.mjs 87 ✓ ×2 на моке Claude,
check:integration += 2t/4ad/5v); доки пропатчены
scripts/patch-docs-conv53.py.
Следующие по графу 07 — 5.4 (UI характеристик/обогащения/таксономии),
5.5 либо 6.1.""",
    "H2. README статус")

print(f"\nитог: ok={applied} skip={skipped} fail={failed}")
raise SystemExit(1 if failed else 0)
