#!/usr/bin/env python3
"""Патч документации по итогам беседы 5.2 (Element Editor UI, клиент).

Закрывает дыры, найденные при исполнении беседы (2026-09-03/04):
  A  07 — запись ревизии в шапке.
  B  07 — глава «По факту 5.2» после текста беседы (адаптации против буквы
     первого запроса: форма под HTML раздела, GNode.dbId, EditModal.initialRegen,
     isOwner в SynthesisFull, CATEGORY_TYPES — временно до 5.4).
  C  07 5.2 п.8 — elementType в пути versions/rollback (03 §2.4 с 2026-09-02).
  D  07 §11 — ребро 5.2 ← 2.3 (plans/useEditPlan обязательны п.7).
  E  07 §12 — долг htmlSync.pending/sectionMissing ЗАКРЫТ 5.2; новый долг
     CATEGORY_TYPES → TaxonomySelector 5.4.
  F  02 §3 — врезка через replaceDocTable, не spliceSubsectionHtml (факт 5.1,
     не пропатчено conv51).
  G  05 — element-renderer (replaceDocTable), комментарий edit/ («3.x» → 5.2/5.4/5.5).
  H  03 §2.2 — SynthesisFull += isOwner; §2.4 п.14 — PATCH /syntheses/:id правит
     также extGraphMetrics; §2.3 — устаревшая пометка TODO(2.4) снята.
  I  04 §4 — клиентские модули 5.2 (ElementEditor и др.) + факт GNode.dbId.
  J  README — статус: 5.2 закрыта.

Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patch-docs-conv52.py
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


P07 = "docs/07-conversation-protocol.md"

# ═══ A. 07 — шапка ═══
patch(P07,
    "> **Правки 2026-09-03 (итоги беседы 5.1)**",
    """> **Правки 2026-09-04 (итоги беседы 5.2)**: Element Editor UI закрыт
> (запрос 1 + смоук tests/smoke-52-request1.mjs 26 ✓ + все тестовые
> запросы tests/test-52-requests2-5.mjs 73 ✓ ×2 (браузер, Chrome);
> check:integration += 4ac; регрессия 1.6b/1.7/2.3/4.1 — как база).
> Дыры, закрытые этим патчем (глава «По факту 5.2»): «inline» внутри
> dangerouslySetInnerHTML неисполним — форма под HTML раздела; узел
> G-модели не нёс id категории → GNode.dbId; транспорта предотметки
> разделов в EditModal не было → проп initialRegen (перегенерация —
> только через планы); владение было оптимистичным («покажем всем, 403
> решит») → SynthesisFull.isOwner, гейты ✎/«Изменить»/режимов; 02 §3 и 05
> всё ещё называли spliceSubsectionHtml (факт 5.1 — replaceDocTable);
> §11 без ребра 5.2 ← 2.3; §12: долг pending-полей ЗАКРЫТ, внесён долг
> CATEGORY_TYPES → 5.4. Грабли харнесса: тройной клик puppeteer выделяет
> слово, не поле; `pkill -f "[t]sx"` из подсказки убивает и оболочку
> запуска; teardown 2.3 не гасит группу vite.
>
> **Правки 2026-09-03 (итоги беседы 5.1)**""",
    "A. 07 шапка")

# ═══ B. 07 — «По факту 5.2» ═══
patch(P07,
    """---

### Беседа 5.3: Extended Characteristics + Enrichment Service (бэкенд)""",
    """**По факту 5.2 (2026-09-04)** — беседа ЗАКРЫТА; отступления от буквы
первого запроса и найденные дыры:

1. **Форма правки строки — ПОД HTML раздела, не внутри строки.** Разметка
   раздела вставляется `dangerouslySetInnerHTML`, React-узел внутрь неё
   не поместить; кнопки ✎ добавляются в HTML-строку (`addInlineEditButtons`
   внутри `enrichSectionHtml`, дополнительный столбец `.inline-edit-cell`
   только на экране), клик ловится делегированием, `ElementEditor` рендерится
   слотом `inlineEditor` в `.doc-body` после HTML. Сопоставление строки с
   элементом БД: тезис — по «№» (fallback индекс), термин — по позиции
   (fallback текст термина).
2. **`GNode.dbId`** — G-модель 1.7 строится по именам и id категории не
   несла; `buildGFromGraphData` заполняет `dbId`, `GraphModal` открывает
   `ElementEditor variant="modal"` (`.element-editor-overlay`, z-index над
   `.gm-overlay`) поверх графа. Кнопка «✎ Редактировать» в `NodePanel` —
   проп `onEdit`.
3. **«Перегенерировать затронутые» → `EditModal.initialRegen`** — новый
   проп: разделы из `impact.affectedSections` (+ раздел-хозяин при
   `htmlSync.pending`) предотмечаются на перегенерацию; план создаётся
   штатно (createPlan/useEditPlan), второго пути запуска нет.
4. **`SynthesisFull.isOwner`** (аддитивно; сервер `buildSynthesisFull(row,
   viewerUserId)`, флаг, а не userId — публичный синтез владельца не
   раскрывает). Гейтит ✎ в таблицах, «✎ Редактировать» в NodePanel, И
   «✎ Изменить» 2.3 с кнопками режимов 4.1 — прежний оптимизм снят.
5. **`htmlSync` в UI** (долг §12 5.1 закрыт): `rendered`/`patched` —
   зелёным, `pending` и `sectionMissing` — `.callout.warning` с именем поля
   и раздела; при `pending` раздел-хозяин попадает в перегенерацию.
6. **Автозамена** — только после смены имени категории; отчёт по
   affectedSections/affectedTheses; повторная заблокирована.
7. **`CATEGORY_TYPES`** в CategoryEditor — 14 канонических типов промпта;
   ВРЕМЕННО до TaxonomySelector 5.4 (каталог 0.3b = 14 + 4 расширенных);
   секция 4ac сторожит ⊆ section-templates.
8. **Стили**: блоки 5 и 7 UI-кита (+ их часть блока 10) перенесены в
   часть 3 globals.css дословно; добавлено `@media (hover: none)` — в киte
   ✎ виден только по :hover, на касаниях кнопки не было бы.
9. **Ответы**: `element` в редакторе после PATCH/отката — из ответа;
   разделы — `reloadSections`, граф — повторный `GET /categories`.

---

### Беседа 5.3: Extended Characteristics + Enrichment Service (бэкенд)""",
    "B. 07 «По факту 5.2»")

# ═══ C. 07 5.2 п.8 ═══
patch(P07,
    """   - getVersionHistory, rollbackToVersion
   - По факту 5.1: также updateEdge""",
    """   - getVersionHistory, rollbackToVersion (elementType — в пути:
     /elements/:elementType/:elementId/versions|rollback, 03 §2.4)
   - По факту 5.1: также updateEdge""",
    "C. 07 5.2 п.8 elementType")

# ═══ D. 07 §11 ═══
patch(P07,
    "5.2 (ElementEditor UI) ← 5.1 + 1.7 (NodePanel) + 1.6b (SectionView)",
    "5.2 (ElementEditor UI) ← 5.1 + 1.7 (NodePanel) + 1.6b (SectionView) + 2.3 (EditModal/useEditPlan — «перегенерировать затронутые» только через планы)",
    "D. 07 §11 ребро 5.2 ← 2.3")

# ═══ E. 07 §12 ═══
patch(P07,
    "| Показ `htmlSync.pending`/`sectionMissing` в UI редактора (обоснование тезиса без абзаца, termCategory глоссария — в html_content не отражены; сервер 5.1 отдаёт список, клиент обязан предупредить и предложить перегенерацию) | 5.2 | 5.1 | внесён 2026-09-03 |",
    """| Показ `htmlSync.pending`/`sectionMissing` в UI редактора (обоснование тезиса без абзаца, termCategory глоссария — в html_content не отражены; сервер 5.1 отдаёт список, клиент обязан предупредить и предложить перегенерацию) | 5.2 | 5.1 | ЗАКРЫТ 5.2 (2026-09-04): `.callout.warning` с полем и разделом в блоке «Анализ влияния» ElementEditor; раздел-хозяин добавляется в «Перегенерировать затронутые» (EditModal.initialRegen) |
| `CATEGORY_TYPES` в CategoryEditor — клиентская копия 14 типов промпта графа (select типа категории); заменить TaxonomySelector по каталогу 0.3b (18 = 14 + расширенные) с индикатором «из каталога / свободный текст»; расширенные по методу — `EXTRA_CATEGORY_TYPES` | 5.4 | 5.2 | внесён 2026-09-04 (секция 4ac сторожит ⊆ section-templates) |""",
    "E. 07 §12")

# ═══ F. 02 §3 ═══
patch("docs/02-data-model.md",
    """`element-renderer.ts` перерисовывает ТОЛЬКО затронутую таблицу и врезает
её в `sections.html_content` через `spliceSubsectionHtml()` (утилита
беседы 1.4b, linkedom изолирован там же).""",
    """`element-renderer.ts` перерисовывает ТОЛЬКО затронутую таблицу и врезает
её в `sections.html_content` через `replaceDocTable()` (html-parser,
беседа 5.1: замена ОДНОЙ `table.doc-table` внутри подраздела с сохранением
`<h4>` и прозы; `spliceSubsectionHtml` 1.4b для этого не годится — заменяет
весь подраздел. Правка 2026-09-04, беседа 5.2). linkedom изолирован там же.""",
    "F. 02 §3 replaceDocTable")

# ═══ G. 05 ═══
patch("docs/05-file-structure.md",
    """│   │   │                               # данных и врезает её в html_content
│   │   │                               # через spliceSubsectionHtml (1.4b).""",
    """│   │   │                               # данных и врезает её в html_content
│   │   │                               # через replaceDocTable (html-parser,
│   │   │                               # 5.1; spliceSubsectionHtml заменял
│   │   │                               # бы весь подраздел — факт 5.1).""",
    "G1. 05 element-renderer")
patch("docs/05-file-structure.md",
    "│   │   │   │                               # в globals.css; ElementEditor и ниже — 3.x",
    "│   │   │   │                               # в globals.css; ElementEditor…VersionHistory —\n│   │   │   │                               # 5.2 (СДЕЛАНО 2026-09-04), Characteristic/\n│   │   │   │                               # Enrichment/Taxonomy — 5.4, Transform* — 5.5",
    "G2. 05 edit/ адресаты")

# ═══ H. 03 ═══
patch("docs/03-specification.md",
    """  isPublic: boolean;
  docNum: string;                       // «PS-NNNN-XXXX» — заполняется при""",
    """  isPublic: boolean;
  isOwner: boolean;                     // 5.2 («По факту 5.2»): текущий
                                        // пользователь — владелец; клиентские
                                        // гейты правок (✎, «Изменить», режимы)
                                        // вместо оптимизма «403 решит».
                                        // Флаг, а не userId — публичный
                                        // синтез владельца не раскрывает
  docNum: string;                       // «PS-NNNN-XXXX» — заполняется при""",
    "H1. 03 §2.2 isOwner")
patch("docs/03-specification.md",
    """                                // capsule_html живёт в syntheses;
                                // PATCH /syntheses/:id (§2.2) правит
                                // только title/isPublic""",
    """                                // capsule_html живёт в syntheses;
                                // PATCH /syntheses/:id (§2.2) правит
                                // только title/isPublic/extGraphMetrics
                                // (extGraphMetrics — 2.3; уточнено 5.2)""",
    "H2. 03 §2.4 п.14")
patch("docs/03-specification.md",
    """                                       // цветной бейдж в Edit Modal.
                                       // ДО беседы 2.4 (context-quality.ts
                                       // ещё не создан) роут отдаёт null —
                                       // TODO(2.4)""",
    """                                       // цветной бейдж в Edit Modal.
                                       // context-quality.ts — беседа 2.4
                                       // (сделано; пометка снята 5.2)""",
    "H3. 03 §2.3 TODO(2.4) снят")

# ═══ I. 04 §4 ═══
patch("docs/04-code-reuse-map.md",
    "| `client/components/edit/CharacteristicSlider.tsx` | Слайдер характеристики + кнопка «Обоснование» |",
    """| `client/components/edit/ElementEditor.tsx`, `CategoryEditor.tsx`, `ThesisEditor.tsx`, `GlossaryTermEditor.tsx`, `VersionHistory.tsx` | НОВОЕ (5.2, ФАКТ 2026-09-04): редактор элемента по месту (просмотр/правка, PATCH только изменившихся полей, блок «Анализ влияния» с htmlSync), специализированные формы, история версий с diff по полям и откатом; `client/api/elements.ts` += 12 функций §2.4; интеграция: `NodePanel.onEdit` + `GraphModal` (модальный редактор поверх графа, `GNode.dbId` в graph-utils), `SectionView.addInlineEditButtons` (✎ в HTML-строке) + слот `inlineEditor`, `EditModal.initialRegen`; `SynthesisFull.isOwner` (routes/syntheses) — гейты клиента |
| `client/components/edit/CharacteristicSlider.tsx` | Слайдер характеристики + кнопка «Обоснование» |""",
    "I. 04 §4 модули 5.2")

# ═══ J. README ═══
patch("README.md",
    "Следующие по графу 07 — 5.2 (Element Editor UI) либо 5.3 / 6.1.",
    """Беседа 5.2 (Element Editor UI, клиент) ЗАКРЫТА 2026-09-04:
ElementEditor/CategoryEditor/ThesisEditor/GlossaryTermEditor/VersionHistory
+ интеграция NodePanel/GraphModal/SectionView/EditModal + isOwner в
SynthesisFull (смоук 26 ✓, tests/test-52-requests2-5.mjs 73 ✓ ×2,
check:integration += 4ac); доки пропатчены scripts/patch-docs-conv52.py.
Следующие по графу 07 — 5.3 (Enrichment, бэкенд) либо 6.1.""",
    "J. README")
patch("README.md",
    "## Статус: Фазы 0–4 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3; Фаза 3: 3.1, 3.2; Фаза 4: 4.1, 4.2, 4.3); Фаза 5 начата — 5.1 закрыта (2026-09-03)",
    "## Статус: Фазы 0–4 завершены (Фаза 2: 2.1, 2.2, 2.4, 2.3; Фаза 3: 3.1, 3.2; Фаза 4: 4.1, 4.2, 4.3); Фаза 5 начата — 5.1 и 5.2 закрыты (2026-09-04)",
    "J2. README статус")

print(f"\nитог: ok={applied} skip={skipped} fail={failed}")
sys.exit(1 if failed else 0)
