#!/usr/bin/env python3
"""Патч документации по итогам аудита фаз 5–6 (2026-09-02).

Закрывает 20 пунктов отчёта. Три из них — решения, принятые автором:

  п.1  Правка элемента доходит до документа ВАРИАНТОМ (а), но суженным:
       не «перерисовать раздел», а перерисовать ТАБЛИЦУ и врезать её в
       html_content (spliceSubsectionHtml из 1.4b). Причина сужения:
       обоснования тезисов и прозаические подразделы физически лежат
       вне таблиц — буквальная перерисовка раздела их сотрёт.
  п.3  element_versions и characteristic_justifications получают
       synthesis_id с ON DELETE CASCADE (а не ветвление по element_type):
       одна проверка доступа вместо пяти и уборка сирот; зеркалит
       element_enrichments. Схема и миграция 0001 уже применены.
  п.7  Три режима биллинга: byo | subscription | balance.

Скрипт идемпотентен: повторный прогон даёт skip по каждой правке.
Запуск из корня репозитория:
    python3 scripts/patch-docs-phase56.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

applied = skipped = failed = 0


def patch(rel: str, old: str, new: str, label: str) -> None:
    """new-in-text проверяется ПЕРВЫМ: в дописываниях old — префикс new."""
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


# ═══════════════ 02-data-model.md ═══════════════

# п.1 — направление записи
patch(
    "docs/02-data-model.md",
    "**Направление записи**: HTML → гранулярные таблицы (при генерации). "
    "При ручном редактировании элемента: гранулярная таблица обновляется, "
    "HTML в `sections.html_content` перегенерируется из гранулярных данных "
    "(server-side template).",
    """**Направление записи**: HTML → гранулярные таблицы (при генерации).

При ручном редактировании элемента (решение 2026-09-02, аудит фаз 5–6,
п.1 вариант «а» в суженной форме): гранулярная таблица обновляется, затем
`element-renderer.ts` перерисовывает ТОЛЬКО затронутую таблицу и врезает
её в `sections.html_content` через `spliceSubsectionHtml()` (утилита
беседы 1.4b, linkedom изолирован там же).

**Раздел целиком НЕ перерисовывается.** Гранулярные таблицы покрывают не
весь его текст: `parseThesesFromHTML` берёт формулировку/тип/новизну из
«Сводной таблицы тезисов», а `justification` собирает из прозаических
подразделов по индексу `<strong>формулировка</strong> текст`; у графа
вокруг «Таблицы категорий»/«Таблицы связей»/«Топологической таблицы»
живут преамбула и комментарии к кластерам. Перерисовка раздела стёрла бы
всё это.

Следствия, обязательные к соблюдению:

1. **Рендерер — точное обратное к парсеру.** Приёмка: round-trip
   `parse(render(x)) === x` на всех трёх таблицах графа, тезисах и
   глоссарии.
2. **Рендерер параметризован.** Столбцы глоссария зависят от
   `synth_level` (`extra_columns`), столбцы категорий — от
   `ext_graph_metrics`. Без параметров таблица выйдет не той ширины.
3. **Дрейф-контроль с промптами.** Форма таблиц задана шаблонами Prompt
   Registry (04 §2.3), а их правит админ в беседе 6.2 — пара
   «element-parser ↔ element-renderer» берётся под секцию
   integration-check, как `MODE_UI ↔ MODE_CONFIG` (4x) и
   `graph-style ↔ graph-utils` (4y).
4. **Поля вне таблиц** (обоснование тезиса, происхождение категории,
   прозаические подразделы) рендерером таблицы не покрываются: PATCH по
   ним либо правит абзац точечно, либо помечает раздел как требующий
   перегенерации. Молча терять правку нельзя.""",
    "02 §3: правка элемента доходит до документа врезкой таблицы",
)

# п.3 — synthesis_id в element_versions
patch(
    "docs/02-data-model.md",
    """CREATE TABLE element_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  element_id   UUID NOT NULL,""",
    """CREATE TABLE element_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Владелец версии (правка 2026-09-02, аудит фаз 5–6, п.3).
  -- Нужен для двух вещей: проверка доступа в /syntheses/:id/elements/...
  -- одним WHERE вместо JOIN по пяти таблицам с ветвлением по element_type,
  -- и каскадная уборка — без него версии переживали удаление синтеза
  -- (element_id полиморфный, FK на элемент невозможен).
  -- Устройство зеркалит element_enrichments (§2.26).
  synthesis_id UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  element_id   UUID NOT NULL,""",
    "02 §2.12: element_versions += synthesis_id",
)

patch(
    "docs/02-data-model.md",
    "CREATE INDEX idx_versions_element ON element_versions(element_id, element_type);",
    "CREATE INDEX idx_versions_element ON element_versions(element_id, element_type);\n"
    "CREATE INDEX idx_versions_synthesis ON element_versions(synthesis_id);",
    "02 §2.12: индекс по synthesis_id",
)

# п.3 — synthesis_id в characteristic_justifications
patch(
    "docs/02-data-model.md",
    """CREATE TABLE characteristic_justifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  element_id        UUID NOT NULL,""",
    """CREATE TABLE characteristic_justifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Владелец обоснования — см. комментарий в element_versions §2.12
  -- (правка 2026-09-02, аудит фаз 5–6, п.3)
  synthesis_id      UUID NOT NULL REFERENCES syntheses(id) ON DELETE CASCADE,
  element_id        UUID NOT NULL,""",
    "02 §2.27: characteristic_justifications += synthesis_id",
)

patch(
    "docs/02-data-model.md",
    "CREATE INDEX idx_justifications_element ON characteristic_justifications(element_id, element_type);",
    "CREATE INDEX idx_justifications_element ON characteristic_justifications(element_id, element_type);\n"
    "CREATE INDEX idx_justifications_synthesis ON characteristic_justifications(synthesis_id);",
    "02 §2.27: индекс по synthesis_id",
)

# п.7 — три режима биллинга
patch(
    "docs/02-data-model.md",
    "  billing_mode  TEXT NOT NULL,  -- 'byo'|'service'",
    """  billing_mode  TEXT NOT NULL,  -- 'byo'|'subscription'|'balance'
    -- Правка 2026-09-02 (аудит фаз 5–6, п.7): три режима по приоритету
    -- 01 §6. Прежний enum 'byo'|'service' не различал подписку и баланс,
    -- отчего история использования (6.2) не могла показать режим.
    -- ВАЖНО: для 'byo' cost_usd несёт СЕБЕСТОИМОСТЬ (списания не было) —
    -- суммировать его с 'balance' в одном итоге нельзя.""",
    "02 §2.21: три режима биллинга",
)

# п.6 — enrichment_type
patch(
    "docs/02-data-model.md",
    "  enrichment_type TEXT NOT NULL,  -- 'description'|'justification'|'evolution'|'characteristic'",
    "  enrichment_type TEXT NOT NULL,\n"
    "    -- 'description'|'justification'|'counterarguments'|'evolution'|'characteristic'\n"
    "    -- +counterarguments (правка 2026-09-02): 03 §2.14 допускает его для\n"
    "    -- связей, а enum модели о нём не знал",
    "02 §2.26: enrichment_type += counterarguments",
)

# п.17 — target_snapshot
patch(
    "docs/02-data-model.md",
    "  target_snapshot JSONB NOT NULL,  -- граф или тезисы ПОСЛЕ (старые, которые были заменены)",
    """  target_snapshot JSONB NOT NULL,  -- целевое представление ДО замены
    -- Правка 2026-09-02 (аудит фаз 5–6, п.17): прежнее пояснение «ПОСЛЕ
    -- (старые, которые были заменены)» противоречило само себе.
    -- Семантика: source_snapshot — представление-ИСТОЧНИК на момент
    -- трансформации (для аудита), target_snapshot — представление-ЦЕЛЬ
    -- до того, как его заменили (именно из него делается откат).
    -- Для graph_to_theses: source = граф, target = прежние тезисы.""",
    "02 §2.28: семантика снимков трансформации",
)

# ═══════════════ 03-specification.md ═══════════════

# п.13 — приоритеты
patch(
    "docs/03-specification.md",
    "| E7 | Ручное редактирование элементов (категории, тезисы, глоссарий) | Фаза 2 |\n"
    "| E8 | Автозамена имён при переименовании категории | Фаза 2 |\n"
    "| E9 | Версионирование элементов с откатом | Фаза 2 |",
    "| E7 | Ручное редактирование элементов (категории, тезисы, глоссарий) | Фаза 5 |\n"
    "| E8 | Автозамена имён при переименовании категории | Фаза 5 |\n"
    "| E9 | Версионирование элементов с откатом | Фаза 5 |",
    "03 §1.5: E7–E9 → Фаза 5 (протокол делает их там)",
)

patch(
    "docs/03-specification.md",
    "| T1 | Каталог типов категорий (18 системных + пользовательские) | Фаза 2 |\n"
    "| T2 | Каталог типов связей (29 системных + пользовательские) | Фаза 2 |\n"
    "| T3 | Нормализация типов при парсинге ответа Claude (маппинг на каталог) | Фаза 2 |",
    "| T1 | Каталог типов категорий (18 системных + пользовательские) | Фаза 0 (сделано 0.3b) |\n"
    "| T2 | Каталог типов связей (29 системных + пользовательские) | Фаза 0 (сделано 0.3b) |\n"
    "| T3 | Нормализация типов при парсинге ответа Claude (маппинг на каталог) | Фаза 0 (сделано 0.3b) |",
    "03 §1.12: T1–T3 → факт (0.3b)",
)

# пп.2, 4, 11, 14 — Elements API
patch(
    "docs/03-specification.md",
    """PATCH  /syntheses/:id/glossary/:termId
                                { term?, definition?, extraColumns? }
                                → { term: GlossaryTerm, impact: ImpactAnalysis }
```""",
    """PATCH  /syntheses/:id/glossary/:termId
                                { term?, definition?, extraColumns? }
                                → { term: GlossaryTerm, impact: ImpactAnalysis }

// ── Дополнения 2026-09-02 (аудит фаз 5–6) ──────────────────────────────

// п.11: нормализованный тип пишется явно. PATCH категории/связи
// принимает typeCatalogId (ссылка на каталог §2.13) ЛИБО свободный
// type/edgeType. Ответ несёт оба поля — по ним TaxonomySelector (5.4)
// рисует индикатор «из каталога» / «свободный текст».
PATCH  /syntheses/:id/categories/:catId
                                { …, typeCatalogId?: string | null }
PATCH  /syntheses/:id/edges/:edgeId
                                { …, typeCatalogId?: string | null }

// п.14: топология и капсула редактируемы (01 §4.7 их перечисляет)
PATCH  /syntheses/:id/categories/:catId
                                { …, structuralRoles?, proceduralRoles?,
                                  clusterIndices? }
PATCH  /syntheses/:id/capsule   { html: string }
                                → { capsuleHtml: string }
                                // capsule_html живёт в syntheses;
                                // PATCH /syntheses/:id (§2.2) правит
                                // только title/isPublic

// п.2: версии элемента и откат (беседа 5.1; UI — VersionHistory, 5.2).
// Доступ: элемент обязан принадлежать :id — проверяется по
// element_versions.synthesis_id (колонка добавлена 2026-09-02, п.3).
GET    /syntheses/:id/elements/:elementType/:elementId/versions
                                → { versions: ElementVersion[] }
                                // elementType: category|edge|thesis|
                                //   glossary_term|dialogue_turn|section
                                // Сортировка: version DESC

POST   /syntheses/:id/elements/:elementType/:elementId/rollback
                                { version: number }
                                → { element: unknown, version: ElementVersion,
                                    impact: ImpactAnalysis }
                                // Восстанавливает данные версии, создаёт
                                // НОВУЮ версию с changeSource='rollback',
                                // перерисовывает таблицу в html_content
                                // (02 §3) и возвращает impact

// п.4: автозамена имён (E8). Отдельный вызов, а не побочный эффект
// PATCH: пользователь решает после просмотра impact.
POST   /syntheses/:id/elements/auto-rename
                                { oldName: string, newName: string }
                                → { affectedSections: string[],
                                    affectedTheses: number }
                                // Замена в html_content всех разделов И в
                                // theses.related_categories; каждая
                                // затронутая строка получает версию с
                                // changeSource='auto_rename'
```

**ElementVersion:**
```typescript
{
  id: string;
  elementType: "category" | "edge" | "thesis" | "glossary_term"
             | "dialogue_turn" | "section";
  elementId: string;
  version: number;
  data: Record<string, unknown>;   // снимок ДО изменения
  changeSource: "manual" | "regenerated" | "cascade" | "auto_rename" | "rollback";
  createdAt: string;
}
```""",
    "03 §2.4: версии, откат, автозамена, typeCatalogId, роли, капсула",
)

# п.9 — версионирование конфигов
patch(
    "docs/03-specification.md",
    """GET    /configs                 → { configs: SynthesisConfig[] }

PUT    /configs/:key            { value: any, description?: string }
                                → { config: SynthesisConfig }
```""",
    """GET    /configs                 → { configs: SynthesisConfig[] }

PUT    /configs/:key            { value: any, description?: string }
                                → { config: SynthesisConfig }
                                // Создаёт НОВУЮ версию-черновик (не
                                // активирует) — симметрично POST /prompts/:key

// Дополнение 2026-09-02 (аудит фаз 5–6, п.9): у конфигов есть version и
// is_active (02 §2.18), «версионирование аналогично шаблонам» требует
// 6.2 — но эндпоинтов не было.
GET    /configs/:key/versions   → { versions: ConfigVersion[] }

POST   /configs/:key/activate   { version: number }
                                → { config: SynthesisConfig }
                                // Активирует версию, деактивирует прежнюю,
                                // инвалидирует config_cache:* (0.3)
```""",
    "03 §2.9: версии и активация конфигов",
)

# п.5 — топап-подтверждение
patch(
    "docs/03-specification.md",
    """POST   /billing/topup           { amountUsd: number }
                                → { clientSecret: string }
                                // Stripe PaymentIntent""",
    """POST   /billing/topup           { amountUsd: number }
                                → { clientSecret: string }
                                // Stripe PaymentIntent

POST   /billing/topup/confirm   { paymentIntentId: string }
                                → { balanceUsd: number, transaction: Transaction }
                                // Правка 2026-09-02: эндпоинт требовался
                                // беседой 6.1 (confirmTopup), в контракте
                                // его не было""",
    "03 §2.10: POST /billing/topup/confirm",
)

# п.6 — типы обогащения
patch(
    "docs/03-specification.md",
    """POST   /syntheses/:id/enrich/category/:catId
                                    { type: "description"|"evolution" }
                                    → { enrichment: ElementEnrichment }
                                    // Стриминг через WebSocket""",
    """// Канон типов обогащения (правка 2026-09-02, аудит фаз 5–6, п.6).
// Три документа расходились; принято: тип обогащения = enum модели
// (02 §2.26), ключ шаблона Registry = "enrichment.{элемент}.{тип}".
//   категория: description | evolution | justification
//   связь:     justification | counterarguments
//   характеристика: отдельный эндпоинт ниже (тип 'characteristic')
// Пять ключей Registry: enrichment.category.description,
// enrichment.category.evolution, enrichment.category.justification,
// enrichment.edge.justification, enrichment.edge.counterarguments,
// enrichment.characteristic_justification.

POST   /syntheses/:id/enrich/category/:catId
                                    { type: "description"|"evolution"|"justification" }
                                    → { enrichment: ElementEnrichment }
                                    // Стриминг через WebSocket""",
    "03 §2.14: канон типов обогащения",
)

# п.5 — WS-сообщения запуска
patch(
    "docs/03-specification.md",
    """// Пинг (keep-alive)
{ type: "ping" }
```""",
    """// Запуск обогащения элемента (беседа 5.3). Правка 2026-09-02:
// ответные enrichment_delta/enrichment_done в §3.2 были, запускающего
// сообщения не было.
{ type: "start_enrichment", synthesisId: string,
  elementType: "category" | "edge", elementId: string,
  enrichmentType: string }

// Запуск трансформации представлений (беседа 5.5)
{ type: "start_transform", synthesisId: string,
  direction: "graph_to_theses" | "theses_to_graph" }

// Пинг (keep-alive)
{ type: "ping" }
```

> **Что именно запускает операцию (решение 2026-09-02, п.5).** Как в
> фазах 1–4: HTTP-роут (§2.14 / §2.15) СОЗДАЁТ операцию и отвечает
> `{ ok: true }`, WS-сообщение только ПОДПИСЫВАЕТ на её поток. Обогащение
> и трансформация запускаются HTTP-роутом; `start_enrichment` /
> `start_transform` допустимы как альтернативный вход для клиента, уже
> держащего сокет, и обязаны быть идемпотентны при активной операции
> (иначе — `GENERATION_IN_PROGRESS`).
>
> Дельты трансформации идут `stream_delta` с `sectionKey` = `"transform:{direction}"`
> — по образцу `"mode:{modeKey}"` беседы 4.1; собственного типа дельт у
> трансформации нет.""",
    "03 §3.1: start_enrichment / start_transform + что запускает операцию",
)

# ═══════════════ 05-file-structure.md ═══════════════

patch(
    "docs/05-file-structure.md",
    """│   │   ├── element-editor.ts           # PATCH-обработчики для категорий/тезисов/глоссария
│   │   │                               # + impact analysis (НОВОЕ)""",
    """│   │   ├── element-editor.ts           # PATCH-обработчики для категорий/тезисов/глоссария
│   │   │                               # + impact analysis + autoRenameReferences (НОВОЕ)
│   │   │
│   │   ├── element-renderer.ts         # НОВОЕ (решение 2026-09-02, п.1):
│   │   │                               # обратное к element-parser — рисует
│   │   │                               # таблицу категорий/связей/топологии/
│   │   │                               # тезисов/глоссария из гранулярных
│   │   │                               # данных и врезает её в html_content
│   │   │                               # через spliceSubsectionHtml (1.4b).
│   │   │                               # Раздел целиком НЕ перерисовывается —
│   │   │                               # см. 02 §3. Приёмка: round-trip
│   │   │                               # parse(render(x)) === x""",
    "05: element-renderer.ts + autoRename в element-editor",
)

patch(
    "docs/05-file-structure.md",
    """│   │   │   ├── elements.ts             # создаёт беседа 1.7 (getCategories),
│   │   │   │                           # расширяет 5.2""",
    """│   │   │   ├── elements.ts             # создаёт беседа 1.7 (getCategories),
│   │   │   │                           # расширяет 5.2 (PATCH, версии, откат,
│   │   │   │                           # auto-rename)
│   │   │   ├── taxonomy.ts             # каталоги типов + normalize (5.4)
│   │   │   ├── enrichment.ts           # обогащения и обоснования (5.4)
│   │   │   ├── transforms.ts           # graph↔theses, история, откат (5.5)
│   │   │   ├── prompts.ts              # админка Prompt Registry (6.2)
│   │   │   ├── import.ts               # multipart-обёртка импорта (4.3)""",
    "05: недостающие клиентские api-модули",
)

patch(
    "docs/05-file-structure.md",
    """│   │   │   │   ├── ElementEditor.tsx       # Inline-редактирование элементов (НОВОЕ)""",
    """│   │   │   │   ├── ElementEditor.tsx       # Inline-редактирование элементов (НОВОЕ)
│   │   │   │   ├── CategoryEditor.tsx      # Поля категории + предпросмотр строки (5.2)
│   │   │   │   ├── ThesisEditor.tsx        # Поля тезиса (5.2)
│   │   │   │   ├── GlossaryTermEditor.tsx  # Термин + столбцы по synth_level (5.2)
│   │   │   │   ├── VersionHistory.tsx      # Версии элемента, diff, откат (5.2)
│   │   │   │   ├── TransformHistory.tsx    # История трансформаций + откат (5.5)""",
    "05: недостающие компоненты редактирования",
)

# ═══════════════ 01-architecture.md ═══════════════

patch(
    "docs/01-architecture.md",
    "Каждый результат обогащения сохраняется в `element_enrichments` и может "
    "быть повторно запрошен с другими параметрами. Промптовые шаблоны — в "
    "Prompt Registry (ключи: `enrichment.category`, `enrichment.edge`, "
    "`enrichment.characteristic_justification`).",
    "Каждый результат обогащения сохраняется в `element_enrichments` и может "
    "быть повторно запрошен с другими параметрами. Промптовые шаблоны — в "
    "Prompt Registry; схема ключей (канон 2026-09-02, 03 §2.14): "
    "`enrichment.category.{description|evolution|justification}`, "
    "`enrichment.edge.{justification|counterarguments}`, "
    "`enrichment.characteristic_justification` — пять ключей.\n\n"
    "**Биллинг обогащений** (правка 2026-09-02, аудит фаз 5–6, п.10): каждый "
    "запрос обогащения пишет строку в `api_usage` и, в режиме подписки, "
    "инкрементирует `used_enrichments` — квота `quota_enrichments` (02 §2.22) "
    "иначе не тратится никем. Стоимость обогащений в "
    "`syntheses.total_cost_usd` НЕ входит: футер документа показывает "
    "стоимость генерации, обогащения видны в истории использования (6.2).",
    "01 §4.9: пять ключей Registry + биллинг обогащений",
)

# ═══════════════ 07-conversation-protocol.md ═══════════════

patch(
    "docs/07-conversation-protocol.md",
    "- `01-architecture.md` (секция 4.7 Element Editor)\n"
    "- `02-data-model.md` (таблица element_versions)",
    "- `01-architecture.md` (секция 4.7 Element Editor)\n"
    "- `02-data-model.md` (таблица element_versions, **§3 «Направление "
    "записи»** — правка элемента врезает перерисованную таблицу в "
    "html_content)\n"
    "- Из предыдущих бесед: `server/services/element-parser.ts` (из 1.4 — "
    "рендерер обязан быть обратным к нему), `server/utils/html-parser.ts` "
    "(из 1.4b — `spliceSubsectionHtml`)",
    "07 §5.1: контекст под решение п.1",
)

patch(
    "docs/07-conversation-protocol.md",
    """   - autoRenameReferences(synthesisId, oldName, newName):
     При переименовании категории: поиск oldName в html_content 
     всех sections, замена на newName. Возвращает список затронутых секций.""",
    """   - autoRenameReferences(synthesisId, oldName, newName):
     При переименовании категории: поиск oldName в html_content
     всех sections, замена на newName. ТАКЖE замена в
     theses.related_categories (правка 2026-09-02, п.4 — иначе тезисы
     ссылаются на исчезнувшее имя). Каждая затронутая строка получает
     версию с changeSource='auto_rename'. Возвращает
     { affectedSections, affectedTheses }.
     Вызывается ОТДЕЛЬНЫМ эндпоинтом POST /syntheses/:id/elements/auto-rename
     (03 §2.4), а не побочным эффектом PATCH: решает пользователь после
     просмотра impact.""",
    "07 §5.1: autoRename — эндпоинт, тезисы, версии",
)

patch(
    "docs/07-conversation-protocol.md",
    """2. server/services/element-versioning.ts:
   - createVersion(elementId, elementType, data, changeSource):
     Вставка в element_versions с автоинкрементом version.""",
    """1b. server/services/element-renderer.ts (НОВОЕ, решение 2026-09-02, п.1):
   - renderCategoriesTable / renderEdgesTable / renderTopologyTable /
     renderThesesTable / renderGlossaryTable — точное обратное к
     element-parser.ts (1.4): из гранулярных строк собирают ту же
     разметку, что генерирует Claude по шаблонам Registry.
   - applyElementUpdateToHtml(synthesisId, sectionKey, subsectionName):
     перерисовывает ОДНУ таблицу и врезает её в sections.html_content
     через spliceSubsectionHtml (1.4b). Раздел целиком не трогается —
     обоснования тезисов и прозаические подразделы лежат вне таблиц.
   - Параметры формы таблиц: synth_level (столбцы глоссария),
     ext_graph_metrics (столбцы категорий) — берутся из syntheses.
   - Поля вне таблиц (обоснование тезиса, происхождение категории):
     точечная правка абзаца либо пометка «раздел требует перегенерации»;
     молча терять правку нельзя.
   - ПРИЁМКА: round-trip parse(render(x)) === x на всех таблицах;
     пара parser↔renderer берётся под дрейф-контроль в integration-check
     (образцы — секции 4x MODE_UI↔MODE_CONFIG и 4y graph-style↔graph-utils).

2. server/services/element-versioning.ts:
   - createVersion(synthesisId, elementId, elementType, data, changeSource):
     Вставка в element_versions с автоинкрементом version.
     ВНИМАНИЕ (правка 2026-09-02, п.3): synthesis_id — обязательная
     колонка (миграция 0001), по ней же идёт проверка доступа в роутах.""",
    "07 §5.1: element-renderer + synthesisId в версиях",
)

patch(
    "docs/07-conversation-protocol.md",
    """   - GET /syntheses/:id/elements/:elementId/versions → getVersionHistory
   - POST /syntheses/:id/elements/:elementId/rollback { version } → rollback""",
    """   - GET /syntheses/:id/elements/:elementType/:elementId/versions
     → getVersionHistory (контракт — 03 §2.4, дополнен 2026-09-02;
       elementType в пути: без него нельзя ни проверить доступ, ни
       выбрать таблицу для отката)
   - POST /syntheses/:id/elements/:elementType/:elementId/rollback { version }
     → rollback (создаёт версию changeSource='rollback', перерисовывает
       таблицу в html_content, возвращает impact)
   - POST /syntheses/:id/elements/auto-rename { oldName, newName }
   - PATCH /syntheses/:id/capsule { html } (01 §4.7 числит капсулу
     редактируемой; эндпоинта не было — п.14)""",
    "07 §5.1: роуты версий, отката, автозамены, капсулы",
)

patch(
    "docs/07-conversation-protocol.md",
    """7. Интеграция с SectionView.tsx:
   - При наведении на строку таблицы тезисов/глоссария — кнопка "✎"
   - Клик → inline-редактирование""",
    """7. Интеграция с SectionView.tsx:
   - При наведении на строку таблицы тезисов/глоссария — кнопка "✎"
   - Клик → inline-редактирование
   - ГРАБЛЯ 1.6b (предупреждение 2026-09-02, п.16): SectionView рендерит
     html_content через dangerouslySetInnerHTML, и вставки, сделанные
     эффектом ПОСЛЕ рендера, стираются при hash-навигации. Кнопки ✎
     добавляются тем же приёмом, что и прочие обогащения разметки —
     обогащением СТРОКИ до вставки (enrichSectionHtml), а не DOM после.
   - Кнопка «Перегенерировать затронутые» после impact запускается
     ТОЛЬКО через планы (03 §2.6) — в контекст беседы обязательны
     client/api/plans.ts и hooks/useEditPlan.ts (из 2.3), иначе
     появится второй путь запуска перегенерации (п.15)""",
    "07 §5.2: грабля inline-вставок + путь перегенерации",
)

patch(
    "docs/07-conversation-protocol.md",
    """2. Промптовые шаблоны (добавить в seed-prompts.ts или через Admin UI):
   - enrichment.category.description
   - enrichment.category.evolution
   - enrichment.edge.justification
   - enrichment.edge.counterarguments
   - enrichment.characteristic_justification""",
    """2. Промптовые шаблоны (добавить в seed-prompts.ts или через Admin UI) —
   канон 2026-09-02, 03 §2.14, пять ключей:
   - enrichment.category.description
   - enrichment.category.evolution
   - enrichment.category.justification
   - enrichment.edge.justification
   - enrichment.edge.counterarguments
   - enrichment.characteristic_justification
   Тип обогащения в БД — enum 02 §2.26 (в него добавлен counterarguments).

2b. Биллинг обогащений (правка 2026-09-02, п.10): enrichCategory /
   enrichEdge / justifyCharacteristic пишут строку в api_usage
   (billing_mode из контекста — byo|subscription|balance) и в режиме
   подписки инкрементируют used_enrichments. Квота quota_enrichments
   заведена в 02 §2.22 и до этой правки не тратилась никем.
   Если беседа 6.1 ещё не прошла — оставить разъём
   (setUsageRecorder / no-op по умолчанию) и внести долг в §12.""",
    "07 §5.3: канон ключей + биллинг обогащений",
)

patch(
    "docs/07-conversation-protocol.md",
    """- «Edge case: enrichCategory для несуществующей категории → 404. justifyCharacteristic с value вне диапазона [0,1] → 400»""",
    """- «Edge case: enrichCategory для несуществующей категории → 404.
  justifyCharacteristic с value вне ДОПУСТИМОГО ДЛЯ ЭТОЙ ХАРАКТЕРИСТИКИ
  диапазона → 400. Диапазон зависит от поля (правка 2026-09-02, п.18):
  [0,1] у centrality/certainty/clarity/breadth/depth/applicability/
  historical_significance/strength/historical_support/logical_necessity/
  context_dependency, целое [1,5] у innovation_degree»""",
    "07 §5.3: диапазон зависит от характеристики",
)

patch(
    "docs/07-conversation-protocol.md",
    """4. Расширение ws/handler.ts:
   - start_transform → transformGraphToTheses / transformThesesToGraph
   - Отправка stream_delta, transform_done""",
    """4. Расширение ws/handler.ts:
   - start_transform → transformGraphToTheses / transformThesesToGraph
     (сообщение внесено в 03 §3.1 правкой 2026-09-02, п.5; операцию
     СОЗДАЁТ HTTP-роут, WS только подписывает — как в фазах 1–4)
   - Отправка stream_delta с sectionKey = "transform:{direction}"
     (образец — "mode:{modeKey}" беседы 4.1), затем transform_done
   - После замены тезисов/графа в БД перерисовать соответствующий раздел
     в sections.html_content через element-renderer (02 §3, решение п.1):
     иначе документ покажет прежний текст""",
    "07 §5.5: транспорт трансформации + перерисовка раздела",
)

patch(
    "docs/07-conversation-protocol.md",
    """5. Расширение server/services/streaming-manager.ts:
   - В streamSection: после получения usage от Claude,
     если billingMode === "service" → вызвать chargeUsage
   - Записать в api_usage независимо от режима""",
    """5. Расширение server/services/streaming-manager.ts:
   - В streamSection: после получения usage от Claude —
     billingMode === "balance" → chargeUsage (списание с баланса);
     billingMode === "subscription" → incrementUsage (квота);
     billingMode === "byo" → списания нет
     (правка 2026-09-02, п.7: режимов ТРИ — byo|subscription|balance;
      прежний литерал "service" не существовал ни в одном списке)
   - Записать в api_usage независимо от режима; для byo cost_usd несёт
     СЕБЕСТОИМОСТЬ (в итогах не суммировать с balance)""",
    "07 §6.1: три режима вместо литерала service",
)

patch(
    "docs/07-conversation-protocol.md",
    """   - GET   /configs                 → synthesis_configs
   - PUT   /configs/:key            { value } → обновление конфига""",
    """   - GET   /configs                 → synthesis_configs
   - PUT   /configs/:key            { value } → НОВАЯ версия-черновик
   - GET   /configs/:key/versions   → история версий конфига
   - POST  /configs/:key/activate   { version } → активация
     (правка 2026-09-02, п.9: 02 §2.18 обещает версионирование конфигов
      «аналогично шаблонам», 6.2 его требует — эндпоинтов не было)""",
    "07 §6.1: версионирование конфигов",
)

patch(
    "docs/07-conversation-protocol.md",
    """5. Защита роута: AdminPromptsPage доступна только для role === 'admin'""",
    """5. Защита роута: AdminPromptsPage доступна только для role === 'admin'.
   ФАКТ 2026-09-02: в App.tsx маршрут /admin/prompts закрыт только
   RequireAuth — ролевой проверки нет, добавить здесь (RequireAdmin либо
   параметр RequireAuth); ссылка в Sidebar уже admin-only с беседы 0.4.

5b. UI подписок (правка 2026-09-02, п.8). Бэкенд подписок готов целиком
   (02 §2.22–2.23, 03 §2.10 — шесть эндпоинтов и webhook,
   subscription-service 6.1), а интерфейса не было ни в одной беседе,
   хотя 01 §6 ставит подписку посередине приоритета биллинга. В
   BillingPage добавить секцию «Подписка»:
   - текущий план, статус, период, счётчики против квот
     (GET /billing/subscription);
   - выбор тарифа (GET /billing/plans) → POST /billing/subscribe →
     Stripe Elements;
   - отмена (cancel_at_period_end) и возобновление;
   - client/api/subscription.ts (05 его уже числит).""",
    "07 §6.2: ролевая защита + UI подписок",
)

patch(
    "docs/07-conversation-protocol.md",
    """3. server/middleware/billing-check.ts:
   > **Ретрофит (аудит 2026-07-30):** middleware оборачивает роуты
   > генерации, СОЗДАННЫЕ РАНЬШЕ — POST /syntheses (1.4), POST
   > /syntheses/:id/plans/:planId/execute (2.2), POST
   > /syntheses/:id/regenerate-subsection (2.2), WS-запуск генерации
   > (ws/handler, 1.4/1.6). То есть беседа правит код закрытых бесед;
   > это единственный такой случай в протоколе.""",
    """3. server/middleware/billing-check.ts:
   > **Ретрофит (аудит 2026-07-30):** middleware оборачивает роуты
   > генерации, СОЗДАННЫЕ РАНЬШЕ — POST /syntheses (1.4), POST
   > /syntheses/:id/plans/:planId/execute (2.2), POST
   > /syntheses/:id/regenerate-subsection (2.2), WS-запуск генерации
   > (ws/handler, 1.4/1.6). То есть беседа правит код закрытых бесед.
   > Уточнение 2026-09-02 (п.20): «единственный такой случай» — уже не
   > так. Чужой код правят также 5.4 (NodePanel из 1.7), 5.5 (GraphModal
   > 1.7, SectionView 1.6b, EditModal 2.3) и 6.2 (SynthesisForm 1.5b/3.2
   > и PauseModal 1.4b — оба по долгам §12). Правило то же: перед
   > правкой свериться с фактическим состоянием файла, а не с текстом
   > закрытой беседы.""",
    "07 §6.1: ретрофит — не единственный случай",
)

# §12 — долги
DEBTS = """| Админские update/delete пользовательских типов каталога (`POST` есть с 0.3b, изменение и удаление не специфицированы — 03 §2.13) | 5.4 | 0.3b | внесён 2026-09-02 (аудит фаз 5–6, п.19) |
| Прогрев кэша Prompt Registry при старте (`warmCache` реализован в 0.3, в index.ts не подключён) | 6.1 | 0.3 | внесён 2026-09-02 (п.19) |
| Ролевая защита маршрута `/admin/prompts` на клиенте (сейчас только RequireAuth) | 6.2 | 0.4 | внесён 2026-09-02 (п.19) |
| UI подписок в BillingPage (бэкенд готов: 02 §2.22–2.23, 03 §2.10, subscription-service 6.1) | 6.2 | 6.1 | внесён 2026-09-02 (п.8) |
| Учёт обогащений в биллинге (api_usage + used_enrichments; разъём в 5.3, наполнение — после 6.1) | 6.1 | 5.3 | внесён 2026-09-02 (п.10) |

Долги, снятые как «не долг»:"""

patch(
    "docs/07-conversation-protocol.md",
    "\nДолги, снятые как «не долг»:",
    "\n" + DEBTS,
    "07 §12: пять долгов аудита фаз 5–6",
)

print(f"\nИтог: applied={applied}, skip={skipped}, fail={failed}")
sys.exit(1 if failed else 0)
