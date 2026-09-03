#!/usr/bin/env python3
"""Патч документации по итогам беседы 5.1 (Element Editor + Versioning, бэкенд).

Закрывает дыры, найденные при исполнении беседы (2026-09-03):
  A  07 — запись ревизии в шапке.
  B  07 — глава «По факту 5.1» после текста беседы (адаптации против буквы
     первого запроса: replaceDocTable вместо spliceSubsectionHtml,
     synthesisId первым параметром, DELETE edge, htmlSync/version в ответах,
     impact по прежнему И новому имени, auto-rename в гранулярных полях).
  C  07 — контекст беседы 5.2: DELETE edge, htmlSync, deleteCategoryEdge.
  D  07 — §12: долг «pending-поля вне таблиц в UI» → 5.2; долг «парсер
     глоссария по th «термин» при lang ≠ Russian» → 5.5.
  E  03 §2.4 — DELETE /edges/:edgeId, поля version/htmlSync в ответах,
     расширение auto-rename, форма element в rollback, семантика severity.
  F  04 §4 — element-renderer.ts + ФАКТ-пометки editor/versioning.
  G  05 — комментарий routes/elements.ts (PATCH-часть сделана).
  H  README — статус: Фаза 5 начата, 5.1 закрыта.

Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patch-docs-conv51.py
"""
from __future__ import annotations

import sys
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


# ═══ A. 07 — шапка ═══
patch(
    "docs/07-conversation-protocol.md",
    "> **Правки 2026-08-30 (итоги беседы 4.3)**",
    """> **Правки 2026-09-03 (итоги беседы 5.1)**: Element Editor +
> Versioning закрыты (запрос 1 + смоук round-trip 40 ✓ + все тестовые
> запросы tests/test-51-requests2-6.mjs 111 ✓ ×2; check:integration +=
> 2s/4ab/5u с дрейф-контролем parser↔renderer). Дыры, закрытые этим
> патчем (глава «По факту 5.1»): текст запроса требовал врезку таблицы
> через spliceSubsectionHtml — тот заменяет ВЕСЬ <div data-section>
> вместе с <h4> и прозой, вопреки решению п.1 → новый хелпер
> replaceDocTable; сигнатуры без synthesisId при требовании проверки
> доступа по element_versions.synthesis_id; edge case «удаление связи»
> без эндпоинта → аддитивный DELETE /edges/:edgeId; форма element в
> ответе rollback не задана; auto-rename по букве §2.4 (только
> html_content + related_categories) сам создавал рассинхрон БД↔HTML —
> расширен на текстовые поля гранулярных строк; impact считался по
> НОВОМУ имени — теперь по прежнему и новому. §12: два долга внесены
> (pending-поля в UI → 5.2; парсер глоссария при lang ≠ Russian → 5.5).
> Грабля окружения: tsx — обёртка над дочерним node, SIGKILL обёртке
> оставляет сервер на порту, и следующий прогон бьёт в СТАРЫЙ код —
> спавнить detached и гасить группу процессов.
>
> **Правки 2026-08-30 (итоги беседы 4.3)**""",
    "07/A: запись ревизии 5.1 в шапке",
)

# ═══ B. 07 — глава «По факту 5.1» ═══
patch(
    "docs/07-conversation-protocol.md",
    """- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 5.2: Element Editor UI (клиент)""",
    """- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 5.1 (2026-09-03)** — беседа ЗАКРЫТА; отступления от буквы
первого запроса и найденные дыры:

1. **Врезка таблицы — не spliceSubsectionHtml.** Тот заменяет весь
   `<div data-section>` вместе с `<h4>` и прозой подраздела, то есть
   делает ровно то, что решение п.1 запрещает. В `html-parser.ts`
   добавлены `locateDocTable` (фактические заголовки thead),
   `replaceDocTable` (замена ОДНОЙ `table.doc-table`; ветки
   replaced/appended/created) и `replaceThesisParagraph` (точечная
   правка абзаца `<strong>формулировка</strong> обоснование`). Единственная
   точка linkedom сохранена. Заголовки thead рендерер берёт из текущего
   HTML (при `lang ≠ Russian` они переведены), шаблон Registry — fallback.
2. **`synthesisId` — первый параметр всех функций** editor/versioning
   (в тексте запроса его не было, при этом п.3 требует проверки доступа по
   `element_versions.synthesis_id`).
3. **`applyElementUpdateToHtml(synthesisId, which)`** — по имени таблицы
   (`categories|edges|topology|theses|glossary`), а не по (sectionKey,
   subsectionName): раздел-хозяин и локаторы выводятся из таблицы.
4. **Round-trip — по полям после нормализации**, не побайтно: парсеры 1.4
   нормализуют (normalizeName/Type, toLowerCase направления,
   `parseFloat(...) || 0.5`). Невосстановимы centrality/certainty/
   strength === 0 (парсер читает 0.5) — квирк исходника [12939].
5. **`DELETE /syntheses/:id/edges/:edgeId`** — аддитивно: edge case
   протокола требует удаление связи, в 03 §2.4 эндпоинта не было.
   Снимок ребра остаётся версией 'manual'; `has_reflexive` концов
   пересчитывается, топологическая таблица перерисовывается.
6. **Ответы PATCH/DELETE/rollback += `version` и `htmlSync`**
   `{ rendered, patched, pending, sectionMissing }` — реализация правила
   02 §3 п.4 «молча терять правку нельзя»: `thesis.justification`
   правится в абзаце (patched) либо уходит в pending;
   `glossary_term.termCategory` (проза категорийных подразделов) — всегда
   pending; отсутствие раздела-хозяина — `sectionMissing`.
7. **Impact считается по прежнему И новому имени** элемента: тесты
   показали, что после переименования «Бытие → Новое имя» упоминаний
   нового имени нет и severity падала до 'low', хотя документ ссылается
   на старое. `severity`: 'high' — имя упомянуто в других разделах/
   тезисах; 'low' — только структурные зависимые (getCrossSecDependents +
   analyzeImpact downstream + getAffectedModes); 'none' — ничего
   (в т.ч. раздел-хозяин отсутствует в документе).
8. **auto-rename расширен на текстовые поля гранулярных строк**
   (`theses.formulation/justification`, `glossary_terms.term/definition/
   extra_columns`, `categories.definition/origin`,
   `category_edges.description`; версии 'auto_rename'): по букве §2.4
   (только html_content + related_categories) сводная таблица тезисов в
   HTML уже говорила «Существование есть…», а строка theses — «Бытие
   есть…», и следующий PATCH тезиса не находил свой абзац. Капсула
   (`syntheses.capsule_html`) тоже переписывается, ключ 'capsule' — в
   affectedSections. Граница слова — lookaround `\\p{L}\\p{N}` (`\\b`
   для кириллицы не работает).
9. **PATCH /:id/capsule**: строка `sections 'capsule'` есть после
   генерации (1.4 сохраняет) и отсутствует после импорта (4.3) — обе точки
   держатся в синхроне; версия — по id строки либо по id синтеза.
10. **Гейт правок**: owner-only + 409 GENERATION_IN_PROGRESS (гонка с
    saveGraphToDb/saveElementsToDb, которые ЗАМЕНЯЮТ строки); не-UUID →
    404 до PG (правило 4aa). Чтение — владелец ИЛИ публичный.
11. **Валидация**: REAL-характеристики 0–1, `innovationDegree` целое 1–5,
    `direction` — три значения, `thesisType` — enum, `typeCatalogId` —
    существующая строка каталога либо `null`; details по полям.
12. **Дрейф-контроль parser↔renderer** — секция 4ab integration-check:
    биекция ROLE_MAP↔ROLE_LABELS, ширина таблиц ≡ индексам td парсеров,
    порядок столбцов ≡ строкам «Столбцы СТРОГО» section-templates,
    round-trip на чистых функциях; 5u — живая перерисовка против БД.

---

### Беседа 5.2: Element Editor UI (клиент)""",
    "07/B: глава «По факту 5.1»",
)

# ═══ C. 07 — контекст 5.2 ═══
patch(
    "docs/07-conversation-protocol.md",
    """8. client/api/elements.ts — расширение:
   - updateCategory, updateThesis, updateGlossaryTerm
   - getVersionHistory, rollbackToVersion
```""",
    """8. client/api/elements.ts — расширение:
   - updateCategory, updateThesis, updateGlossaryTerm
   - getVersionHistory, rollbackToVersion
   - По факту 5.1: также updateEdge, deleteEdge (DELETE /edges/:edgeId),
     autoRename, updateCapsule; ответы PATCH/rollback несут version и
     htmlSync — UI ОБЯЗАН показывать htmlSync.pending («поле не отражено
     в документе, раздел требует перегенерации») и sectionMissing (долг
     §12). Все PATCH → 409 при активной генерации — форма редактора
     блокируется по status='generating'.
```""",
    "07/C: контекст 5.2 — DELETE edge, htmlSync",
)

# ═══ D. 07 — §12 ═══
patch(
    "docs/07-conversation-protocol.md",
    "| Учёт обогащений в биллинге (api_usage + used_enrichments; разъём в 5.3, наполнение — после 6.1) | 6.1 | 5.3 | внесён 2026-09-02 (п.10) |",
    """| Учёт обогащений в биллинге (api_usage + used_enrichments; разъём в 5.3, наполнение — после 6.1) | 6.1 | 5.3 | внесён 2026-09-02 (п.10) |
| Показ `htmlSync.pending`/`sectionMissing` в UI редактора (обоснование тезиса без абзаца, termCategory глоссария — в html_content не отражены; сервер 5.1 отдаёт список, клиент обязан предупредить и предложить перегенерацию) | 5.2 | 5.1 | внесён 2026-09-03 |
| Парсер глоссария 1.4 ищет таблицу по первому th «термин» [8027], а рендерер 5.1 — ещё и по data-section «Таблица определений»; при `lang ≠ Russian` заголовок переведён и парсер таблицу НЕ найдёт (глоссарий такого документа не попадает в glossary_terms) — унифицировать поиск по data-section | 5.5 | 5.1 (дыра 1.4) | внесён 2026-09-03 |""",
    "07/D: §12 — два долга 5.1",
)

# ═══ E. 03 §2.4 ═══
patch(
    "docs/03-specification.md",
    """// п.4: автозамена имён (E8). Отдельный вызов, а не побочный эффект
// PATCH: пользователь решает после просмотра impact.
POST   /syntheses/:id/elements/auto-rename
                                { oldName: string, newName: string }
                                → { affectedSections: string[],
                                    affectedTheses: number }
                                // Замена в html_content всех разделов И в
                                // theses.related_categories; каждая
                                // затронутая строка получает версию с
                                // changeSource='auto_rename'
```""",
    """// п.4: автозамена имён (E8). Отдельный вызов, а не побочный эффект
// PATCH: пользователь решает после просмотра impact.
POST   /syntheses/:id/elements/auto-rename
                                { oldName: string, newName: string }
                                → { affectedSections: string[],
                                    affectedTheses: number }
                                // Замена в html_content всех разделов И в
                                // theses.related_categories; каждая
                                // затронутая строка получает версию с
                                // changeSource='auto_rename'
                                // По факту 5.1: ТАКЖЕ в капсуле
                                // (syntheses.capsule_html; ключ 'capsule'
                                // в affectedSections) и в текстовых полях
                                // гранулярных строк — theses.formulation/
                                // justification, glossary_terms.term/
                                // definition/extra_columns, categories.
                                // definition/origin, category_edges.
                                // description (иначе рассинхрон БД↔HTML:
                                // таблица тезисов в HTML переименована,
                                // строка theses — нет). Замена — целого
                                // слова (lookaround \\p{L}\\p{N}); oldName ===
                                // newName → 400 VALIDATION_ERROR.

// ── По факту 5.1 (2026-09-03) ──────────────────────────────────────────

// Удаление связи. Edge case протокола 5.1 требовал его, эндпоинта не
// было. Снимок ребра остаётся версией (elementType 'edge', 'manual');
// has_reflexive концов пересчитывается, таблицы связей/топологии
// перерисовываются. Повторное удаление → 404.
DELETE /syntheses/:id/edges/:edgeId
                                → { ok: true, impact: ImpactAnalysis,
                                    version: ElementVersion,
                                    htmlSync: HtmlSyncInfo }

// Все PATCH элементов, DELETE связи и rollback АДДИТИВНО несут
//   version: ElementVersion   — созданная версия-снимок;
//   htmlSync: HtmlSyncInfo    — синхронизация правки с html_content
//     (02 §3 п.4 «молча терять правку нельзя»):
//     { rendered: string[]   // перерисованные таблицы "graph:Таблица связей"…
//       patched: string[]    // поля вне таблиц, отражённые точечной правкой
//                            //   абзаца (thesis.justification)
//       pending: string[]    // поля, НЕ отражённые в HTML — раздел требует
//                            //   перегенерации (thesis.justification без
//                            //   абзаца; glossary_term.termCategory всегда)
//       sectionMissing: boolean } // раздела-хозяина нет в sections —
//                            //   правка сохранена только в таблице БД
// Гейты правок: только владелец (403); активная генерация → 409
// GENERATION_IN_PROGRESS (гонка с saveGraphToDb/saveElementsToDb);
// не-UUID → 404. Валидация: REAL-характеристики 0–1, innovationDegree
// целое 1–5, direction ∈ три значения, thesisType ∈ enum, typeCatalogId —
// строка каталога либо null; details по полям.
// rollback: element — DTO типа (Category | CategoryEdge | Thesis |
// GlossaryTerm; для section/dialogue_turn — снимок строки), версия
// changeSource='rollback' хранит состояние ДО отката.
// ImpactAnalysis.severity: 'high' — имя элемента (ПРЕЖНЕЕ и новое)
// текстуально упомянуто в других разделах или тезисах; 'low' — только
// структурные зависимые (cross-deps по SUBSECTION_TO_CTX_KEYS, downstream
// analyzeImpact, режимы); 'none' — ничего, в т.ч. раздел-хозяин
// отсутствует в документе.
// PATCH /:id/capsule: строка sections 'capsule' есть после генерации
// (1.4) и отсутствует после импорта (4.3) — обе точки синхронизируются;
// ответ += version.
```""",
    "03/E: §2.4 — DELETE edge, htmlSync/version, auto-rename, rollback, severity",
)

# ═══ F. 04 §4 ═══
patch(
    "docs/04-code-reuse-map.md",
    """| `server/services/element-editor.ts` | Ручное редактирование элементов + impact analysis |
| `server/services/element-versioning.ts` | Версионирование элементов |""",
    """| `server/services/element-editor.ts` | Ручное редактирование элементов + impact analysis — ФАКТ (5.1): updateCategory/CategoryEdge/Thesis/GlossaryTerm, deleteCategoryEdge (аддитивно), autoRenameReferences (html_content + капсула + текстовые поля гранулярных строк), computeElementImpact (cross-deps + analyzeImpact + getAffectedModes; severity по упоминаниям прежнего И нового имени), rollbackElement, updateCapsule; ответы += version/htmlSync |
| `server/services/element-versioning.ts` | Версионирование элементов — ФАКТ (5.1): createVersion (max+1 в tx вызывающего, synthesis_id обязателен), getVersionHistory (фильтр по synthesis_id), rollbackToVersion (белый список полей типа + версия 'rollback'), loadElementRow/restoreElementData |
| `server/services/element-renderer.ts` | НОВОЕ (5.1, решение п.1): рендер пяти таблиц (категории/связи/топология/тезисы/глоссарий) — обратное к graph-parser/element-parser 1.4; applyElementUpdateToHtml перерисовывает ОДНУ таблицу через `replaceDocTable` (html-parser; заголовки thead из текущего HTML, шаблон Registry — fallback). Дрейф-контроль parser↔renderer — integration-check 4ab |
| `server/utils/html-parser.ts` += `locateDocTable`, `replaceDocTable`, `replaceThesisParagraph` | ФАКТ (5.1): точечная замена таблицы/абзаца внутри подраздела с сохранением `<h4>` и прозы (spliceSubsectionHtml для этого не годится — заменяет весь подраздел); linkedom по-прежнему только здесь |""",
    "04/F: §4 — element-renderer + ФАКТ editor/versioning/html-parser",
)

# ═══ G. 05 ═══
patch(
    "docs/05-file-structure.md",
    """│   │   ├── elements.ts                 # GET/PATCH categories, theses, glossary
│   │   │                               # GET /categories — беседа 1.6 (нужен 1.7),
│   │   │                               # остальное (PATCH, theses, glossary) — 5.1""",
    """│   │   ├── elements.ts                 # GET/PATCH categories, theses, glossary
│   │   │                               # GET /categories — беседа 1.6 (нужен 1.7);
│   │   │                               # остальное СДЕЛАНО 5.1: PATCH категорий/
│   │   │                               # связей/тезисов/глоссария, DELETE связи,
│   │   │                               # versions/rollback, auto-rename, capsule""",
    "05/G: routes/elements.ts — PATCH-часть сделана",
)

# ═══ H. README ═══
patch(
    "README.md",
    "## Статус: Фазы 0–4 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3; Фаза 3: 3.1, 3.2; Фаза 4: 4.1, 4.2, 4.3)",
    "## Статус: Фазы 0–4 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3; Фаза 3: 3.1, 3.2; Фаза 4: 4.1, 4.2, 4.3); Фаза 5 начата — 5.1 закрыта (2026-09-03)",
    "README/H1: заголовок статуса",
)
patch(
    "README.md",
    "Следующие по графу 07 — Фаза 5 (5.1) либо 6.1.",
    """Беседа 5.1 (Element Editor + Versioning, бэкенд) ЗАКРЫТА 2026-09-03:
element-editor / element-versioning / element-renderer + routes/elements
§2.4 целиком (смоук round-trip 40 ✓, tests/test-51-requests2-6.mjs
111 ✓ ×2, check:integration += 2s/4ab/5u); доки пропатчены
scripts/patch-docs-conv51.py.
Следующие по графу 07 — 5.2 (Element Editor UI) либо 5.3 / 6.1.""",
    "README/H2: абзац статуса",
)

print(f"\napplied={applied} skipped={skipped} failed={failed}")
sys.exit(1 if failed else 0)
