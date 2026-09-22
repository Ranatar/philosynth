#!/usr/bin/env python3
"""Патч документации по беседе 10.2 (исполнение рекомендаций: шаг правки
элемента и раунд). ЗАВЕРШЕНИЕ (2026-09-21):
  A  01 — §4.5 (типы шагов, поля шага элемента, бесплатный слот).
  B  02 — §2.12 element_versions (origin, 'recommendation', 'rollback' в
     перечне), §2.13 edit_plans (шаги мельче раздела), §2.32 (кто и когда
     ставит статусы, ROUND_IN_PROGRESS, освобождение planned).
  C  03 — §2.4 ElementVersion.origin, §2.6 тело плана и costBreakdown, §2.16
     POST …/recommendations/plan и DTO, §4.2 EditPlan, §4.3 два кода.
  D  04 §4 — строки 10.2; 05 — новые файлы (и пропущенные 10.1 службы/роут).
  E  07 — «По факту 10.2»; номера разделов 02/03 в текстах 10.2 и 10.3;
     комплект 10.3; врезка Фазы 10; §12.
  F  08 — Часть I (строка), Часть II (глава), Часть III (врезка).
  G  09 — §2, §3, §4, §7.
  H  README (таблица фаз), deploy (десять миграций, 264 шаблона).
NEXT-CONTEXT переписывается целиком отдельным файлом, не патчем (07 §10).
Применённые правки не редактируются — только новые patch() (09 §2, 8.1).
Скрипт идемпотентен (new-in-text проверяется ПЕРВЫМ). Запуск из корня:
    python3 scripts/patches/patch-docs-conv102.py
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
    """Вставка ПЕРЕД якорем. Идемпотентность — по первой строке добавления."""
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


P02 = "docs/02-data-model.md"
P03 = "docs/03-specification.md"
P04 = "docs/04-code-reuse-map.md"
P05 = "docs/05-file-structure.md"
P07 = "docs/07-conversation-protocol.md"
P08 = "docs/08-history.md"
P09 = "docs/09-lessons.md"


P01 = "docs/01-architecture.md"
P02 = "docs/02-data-model.md"
P03 = "docs/03-specification.md"
P04 = "docs/04-code-reuse-map.md"
P05 = "docs/05-file-structure.md"
P07 = "docs/07-conversation-protocol.md"
P08 = "docs/08-history.md"
P09 = "docs/09-lessons.md"

# ── A. 01 ────────────────────────────────────────────────────────────────
print("A. 01-architecture")

patch(P01, """interface EditStep {
  type: "delete" | "regen" | "add" | "regen_subsection" | "regen_mode";
  target: string;          // sectionKey или "sectionKey:subsectionName"
  status: "pending" | "confirmed" | "running" | "done" | "skipped" | "failed";
  context?: string;        // secCtx для этого шага
""", """interface EditStep {
  type: "delete" | "regen" | "add" | "regen_subsection" | "regen_mode"
      | "edit_element" | "refine_element";     // 10.2 — шаги мельче раздела
  target: string;          // sectionKey | "sectionKey:subsectionName" |
                           // "modeKey:index" | "kind:elementId" (10.2)
  status: "pending" | "confirmed" | "running" | "done" | "skipped" | "failed";
  context?: string;        // secCtx шага; у regen_subsection — пожелание;
                           // у refine_element — довод рекомендации
  field?: string;          // 10.2: правимое поле элемента
  value?: string;          // 10.2: edit_element — готовый текст
  subsection?: string;     // 10.2: refine_element — "sectionKey:имя" для контекста
  recommendations?: StepRecommendationRef[];   // 10.2: снимок породивших рекомендаций
""", "01 §4.5: EditStep += шаги элемента")

insert_before(P01, "**Workflow:**\n1. Клиент отправляет `POST /api/plans` с набором действий (аналог `_editPlan`)\n", """**Шаги мельче раздела (беседа 10.2).** `edit_element` применяет ГОТОВЫЙ текст к
полю элемента: модель не зовётся, квота не расходуется, стоимость 0.
`refine_element` — точечная генерация В ЭЛЕМЕНТ: узкий контекст (элемент, его
подраздел, довод) → новое значение одного поля (шаблон Registry
`recommendations.refine_element`). Оба пишут значение функциями ручной правки
5.1 (версия-снимок, перерисовка одной таблицы), источник версии —
`'recommendation'`, в `element_versions.origin` — какая рекомендация правку
породила. Каскад для них и для `regen_subsection` по выбору человека считается
от РАЗДЕЛА-ХОЗЯИНА как от изменённого (`PlanActions.touched`): сам хозяин на
перегенерацию не встаёт, его downstream — pending-шагами, как всегда; руками
каскад не дополняется. Шаги элементов исполняются ПЕРВЫМИ. План без единого
платного шага идёт под БЕСПЛАТНЫМ слотом (`SlotBillingOptions.free`): ни
квоты, ни резерва, ни требования источника оплаты; предпроверка биллинга на
`execute` — условная. Рекомендации критики переводит в такой план
`recommendation-planner.buildPlanDraft` — только поштучно названные; входа
«исполнить все» нет намеренно.

""", "01 §4.5: абзац о шагах мельче раздела")

# ── B. 02 ────────────────────────────────────────────────────────────────
print("B. 02-data-model")

patch(P02, """  change_source TEXT NOT NULL DEFAULT 'manual',
    -- 'manual'|'regenerated'|'cascade'|'auto_rename'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
""", """  change_source TEXT NOT NULL DEFAULT 'manual',
    -- 'manual'|'regenerated'|'cascade'|'auto_rename'|'rollback'|'recommendation'
    -- (текст без CHECK; 'recommendation' — 10.2: правка исполнила рекомендацию критики)
  origin       JSONB,           -- 10.2 (миграция 0009): «почему изменилось» — снимок
                                -- рекомендации, породившей версию: { kind:'recommendation',
                                -- recommendationId, round, num, op, rationale, planId,
                                -- stepIndex, stepType }. NULL — правка не по рекомендации.
                                -- Снимок, а не FK: строки 'new' при перечитке таблицы
                                -- пересобираются, план может быть удалён — ответ на
                                -- «почему» обязан пережить и то и другое
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
""", "02 §2.12: origin и перечень change_source")

patch(P02, """  steps         JSONB NOT NULL DEFAULT '[]',  -- массив EditStep
""", """  steps         JSONB NOT NULL DEFAULT '[]',  -- массив EditStep; с 10.2 — и шаги мельче
                                              -- раздела: edit_element / refine_element
                                              -- (target «kind:elementId», field, value |
                                              -- context, subsection, recommendations[])
""", "02 §2.13: шаги мельче раздела")

patch(P02, """**`'stale'` заведён сразу**, хотя ставит его беседа 10.2: «текст изменился»
отдельно от 'invalid' «адрес не найден».
""", """**`'stale'` заведён сразу**, хотя ставит его беседа 10.2: «текст изменился»
отдельно от 'invalid' «адрес не найден».

**Кто ставит статусы (беседа 10.2).** Постановка плана
(`POST …/recommendations/plan`): строка → 'planned', `plan_id`, `step_index`;
хэш источника разошёлся → 'stale', адресата нет → 'invalid' с причиной — ни та
ни другая в план не идёт. Пересборка черновика (`PATCH` плана): шаг снят →
'rejected', снова подтверждён → 'planned'; `step_index` пишется заново — шаги
переставляются (`syncRecommendationSteps`). Исполнение: шаг done → 'done'; шаг
пропущен ЧЕЛОВЕКОМ после паузы (`skip_step`) → 'rejected'; пропущен СЛУЖБОЙ
(раздела больше нет) → снова 'new'. План удалён или остановлен (`stop`) — его
'planned' возвращаются в 'new' (`releaseRecommendations`): FK обнулил бы
`plan_id`, а строка осталась бы 'planned' навсегда. Перечитка того же текста
возвращает 'stale' в 'new' со свежим хэшем.

**Раунд в работе.** Пока в последнем раунде есть 'planned' с живым `plan_id`,
разбор СМЕНИВШЕГОСЯ текста нового раунда не открывает — 409
`ROUND_IN_PROGRESS` (`details`: round, planIds, nums). Перечитка того же
текста при 'planned' проходит. Осиротевшие 'planned' (`plan_id` NULL) раунд
не держат и снимаются тем же разбором.
""", "02 §2.32: статусы и раунд в работе")

# ── C. 03 ────────────────────────────────────────────────────────────────
print("C. 03-specification")

patch(P03, """  changeSource: "manual" | "regenerated" | "cascade" | "auto_rename" | "rollback";
  createdAt: string;
}
```
""", """  changeSource: "manual" | "regenerated" | "cascade" | "auto_rename" | "rollback"
              | "recommendation";  // 10.2: правка исполнила рекомендацию критики
  origin?: VersionOrigin | null;   // 10.2: «почему» — { kind: 'recommendation',
                                   // recommendationId, round, num, op, rationale,
                                   // planId, stepIndex, stepType }
  createdAt: string;
}
```
""", "03 §2.4: ElementVersion.origin")

patch(P03, """                                 modeRegen?: [string, number][],
                                 modeRemove?: [string, number][] }
                                → { plan: EditPlan }
                                // Сервер вычисляет каскад и возвращает полный план
""", """                                 modeRegen?: [string, number][],
                                 modeRemove?: [string, number][],
                                 // 10.2 — действия мельче раздела:
                                 regenSubsections?: { target: "sectionKey:имя", note? }[],
                                 elementEdits?:   { kind, elementId, field?, value }[],
                                 elementRefines?: { kind, elementId, field?, note,
                                                    subsection? }[] }
                                → { plan: EditPlan }
                                // Сервер вычисляет каскад и возвращает полный план.
                                // 10.2: kind — category | thesis | glossary_term | edge;
                                // field по умолчанию — definition / formulation /
                                // definition / description (белый список —
                                // shared/constants/edit-steps). Пустое value → 400
                                // (удаление — не пустая правка). Каскад — от
                                // раздела-хозяина (graph / theses / glossary), сам
                                // хозяин не перегенерируется. Раздел, который тем же
                                // планом перегенерируется или удаляется целиком,
                                // шагов мельче себя не принимает → 400. Снимки
                                // рекомендаций (recommendations[]) из тела клиента
                                // ОТБРАСЫВАЮТСЯ — их ставит только служба 10.2.
""", "03 §2.6: тело плана += действия мельче раздела")

patch(P03, """     'missing_columns'); обрыв обращения — 502 GENERATION_FAILED.
     404: 'no_critique' | 'no_prose'. 403/409/429 — как у прочей генерации.
```
""", """     'missing_columns'); обрыв обращения — 502 GENERATION_FAILED.
     404: 'no_critique' | 'no_prose'. 403/409/429 — как у прочей генерации.

POST /syntheses/:id/recommendations/plan        (беседа 10.2)
     { nums: string[] }  → RecommendationsPlanResponse
       { plan: EditPlan (status 'draft'), round, planned[], stale[], invalid[],
         declined: { id, num, position, code, reason }[], hint }
     Выбранные ПОШТУЧНО рекомендации последнего раунда → черновик плана;
     строки → 'planned'. Исполнение — существующим POST /plans/:planId/execute.
     Входа «исполнить все» НЕТ и быть не должно: пустой nums → 400. Номер
     выбирает ВСЕ строки этого номера. Развилка: оба варианта («5а» и «5б»)
     → 400; голый «5» у рекомендации-развилки → 400 «назовите вариант» —
     служба не выбирает за человека. Перевод строки в действие:
       «удалить»                       → declined (шага удаления элемента или
                                         подраздела у планов нет);
       готовая замена + элемент        → edit_element (бесплатно);
       элемент без замены              → refine_element, довод — в context;
       без элемента, «перегенерировать» → regen РАЗДЕЛА адреса (у sum —
                                         regen_subsection);
       без элемента, прочее            → regen_subsection «sectionKey:Адрес»,
                                         довод — пожеланием (замена без
                                         элемента дописывается в довод).
     Свёртка: строки об одном подразделе — один шаг; подраздел раздела,
     идущего на regen, вливается в его довод; элемент такого раздела и второй
     шаг на тот же элемент → declined. Перед сборкой хэш источника сверяется
     с живым документом: разошёлся → 'stale' (hint предлагает перечитать),
     адресата нет → 'invalid' с причиной; в план идут только годные. Модель
     не зовётся — billingCheck нет. Гейт — владелец, нет активной операции.
     400 VALIDATION_ERROR (details.nums, details.fork | available);
     404 'no_round' (разборов ещё не было); 409 GENERATION_IN_PROGRESS;
     422 RECOMMENDATIONS_NOT_PLANNABLE — ни одна строка в план не вошла
     (details: stale[], invalid[], declined[]).
     POST …/parse и …/extract с 10.2 отвечают 409 ROUND_IN_PROGRESS, если
     текст критики сменился, а в раунде есть 'planned' (details: round,
     planIds, nums).
```
""", "03 §2.16: POST …/recommendations/plan")

patch(P03, """  planId: string | null; stepIndex: number | null;   // заполняет 10.2
""", """  planId: string | null; stepIndex: number | null;   // ставит постановка плана (10.2)
""", "03 §2.16: planId/stepIndex")

patch(P03, """  steps: Array<{
    type: "delete" | "regen" | "add" | "regen_subsection" | "regen_mode";
    target: string;
    status: "pending" | "confirmed" | "running" | "done" | "skipped" | "failed";
    context?: string;
    cascadeGenerated: boolean;
""", """  steps: Array<{
    type: "delete" | "regen" | "add" | "regen_subsection" | "regen_mode"
        | "edit_element" | "refine_element";            // 10.2
    target: string;                // у шагов элемента — "kind:elementId"
    status: "pending" | "confirmed" | "running" | "done" | "skipped" | "failed";
    context?: string;
    field?: string;                // 10.2: правимое поле элемента
    value?: string;                // 10.2: edit_element — готовый текст
    subsection?: string;           // 10.2: refine_element — "sectionKey:имя"
    recommendations?: { id, round, num, op, rationale }[];   // 10.2
    cascadeGenerated: boolean;
""", "03 §4.2: шаги элемента")

patch(P03, """  }>;
  estimatedCost: number;
  createdAt: string;
}
```

### 4.3. Коды ошибок
""", """  }>;
  estimatedCost: number;
  // 10.2: бесплатное ОТДЕЛЬНО от платного (снятые шаги не считаются);
  // free — delete и edit_element; paid.costUsd ≡ estimatedCost
  costBreakdown: { free: { steps: number; costUsd: 0 };
                   paid: { steps: number; costUsd: number } };
  createdAt: string;
}
```

### 4.3. Коды ошибок
""", "03 §4.2: costBreakdown")

patch(P03, """GENERATION_FAILED   — синхронное обращение к модели оборвалось (ретрофит
""", """ROUND_IN_PROGRESS   — разбор рекомендаций: текст критики сменился, а в текущем
                      раунде есть рекомендации 'planned' — сначала исполнить
                      либо удалить план — 409; details: round, planIds, nums (10.2)
RECOMMENDATIONS_NOT_PLANNABLE — ни одна из названных рекомендаций в план не
                      вошла — 422; details: stale[], invalid[], declined[] с
                      причиной по каждой строке (10.2)
GENERATION_FAILED   — синхронное обращение к модели оборвалось (ретрофит
""", "03 §4.3: два кода 10.2")

# ── D. 04, 05 ────────────────────────────────────────────────────────────
print("D. 04, 05")

insert_after(P04, "| `server/routes/recommendations.ts` | НОВОЕ (10.1): GET / parse / extract — только владельцу; отдельный роутер, не routes/sections (сторожа 4ao/4ar считают его маршруты) |\n",
"""| `server/services/recommendation-planner.ts` | НОВОЕ (10.2, прародителя нет): `buildPlanDraft` — выбранные поштучно рекомендации → тело `createPlan`; `validateSelection` (пустой выбор, развилка в обе стороны), `rowsToPlanActions` (пять правил перевода + свёртка), `recommendationProseOf` (довод из прозы по номеру). Раздел critique в действия плана не кладёт — её ставит каскад (сторож 4at) |
| `server/services/element-step.ts` | НОВОЕ (10.2): исполнение шагов `edit_element` / `refine_element` — запись значения функциями 5.1 с `changeSource 'recommendation'` и `origin`; `refineElement` — по образцу обогащения 5.3 (обращение к модели под слотом плана), но результат пишется В элемент; `cleanModelFieldValue`, `buildRefineVars`. Лист графа импортов |
| `packages/shared/constants/edit-steps.ts` | НОВОЕ (10.2): бесплатные типы шагов, виды и поля элементов шага, раздел-хозяин, `planCostBreakdown` — один источник для планировщика, исполнителя, оценки и панели 10.3 |
| `server/services/edit-planner.ts` — `normalizeActions`, `assembleSteps`, `updatePlan`, `deletePlan` | ДОПОЛНЕНО (10.2): действия мельче раздела (`regenSubsections`, `elementEdits`, `elementRefines`), перенос их через пересборку плана, `syncRecommendationSteps` / `releaseRecommendations`, оценка `refine_element`; в исходнике плана мельче раздела не было |
| `server/services/cascade-analyzer.ts` — `analyzeImpact` | ДОПОЛНЕНО (10.2): `PlanActions.touched` — разделы, изменённые действием мельче раздела: downstream, веса и режимы считаются от них, сами на перегенерацию не ставятся |
| `server/services/plan-executor.ts` — `runStep`, `countBillableSteps`, `slotBillingFor` | ДОПОЛНЕНО (10.2): два шага элемента, судьба рекомендаций шага, бесплатный слот для плана без платных шагов |
""", "04 §4: строки 10.2")

patch(P05, """│   │       ├── 0008_file_genealogy.sql # 2026-09-21: syntheses.file_genealogy jsonb — дерево
│   │       │                           #  импортированного файла (02 §2.4); генерат
""", """│   │       ├── 0008_file_genealogy.sql # 2026-09-21: syntheses.file_genealogy jsonb — дерево
│   │       │                           #  импортированного файла (02 §2.4); генерат
│   │       ├── 0009_version_origin.sql # 10.2: element_versions.origin jsonb — «почему
│   │       │                           #  изменилось» (снимок рекомендации); генерат
""", "05: миграция 0009")

patch(P05, """│   │   ├── plan-executor.ts            # executePlan — последовательное исполнение шагов
""", """│   │   ├── plan-executor.ts            # executePlan — последовательное исполнение шагов
│   │   ├── recommendations.ts          # 10.1: разбор «Таблицы рекомендаций», сторож адресов,
│   │   │                               #  хэш источника, раунд, ретрофит; 10.2: ROUND_IN_PROGRESS
│   │   ├── recommendation-planner.ts   # 10.2: buildPlanDraft — рекомендации (поштучно) →
│   │   │                               #  черновик плана; развилка, свёртка, устаревание
│   │   ├── element-step.ts             # 10.2: шаги плана edit_element / refine_element
│   │   │                               #  (запись функциями 5.1, версия 'recommendation' + origin)
""", "05: службы 10.1/10.2")

patch(P05, """    │                                   # smoke-101-request1 — чистые функции + Registry
""", """    │                                   # smoke-101-request1 — чистые функции + Registry
    │                                   # test-102 (10.2) — рекомендация → план → исполнение на ЖИВОМ
    │                                   # файле (T102_FILE; без файла — пропуск): сервер с
    │                                   # BILLING_ENFORCE=true, подписчик / человек без источника
    │                                   # оплаты / чужой; мок Claude :3912 (точечная правка и
    │                                   # критика узнаются первыми); HTTP + WS; запуск через tsx;
    │                                   # smoke-102-request1 — чистые функции + живой файл без модели
""", "05: тесты 10.2")

# ── E. 07 ────────────────────────────────────────────────────────────────
print("E. 07-conversation-protocol")

patch(P07, "- `02-data-model.md` (§2.14 element_versions, §2.15 edit_plans, §2.32 recommendations — из 10.1)\n- `03-specification.md` (§2.5 планы правок, §2.4 элементы, §2.10 квоты, §4.3 коды ошибок)",
"- `02-data-model.md` (§2.12 element_versions, §2.13 edit_plans, §2.32 recommendations — из 10.1) — номера по факту 10.2; в первой редакции стояли §2.14/§2.15\n- `03-specification.md` (§2.6 планы правок, §2.4 элементы, §2.10 квоты, §2.16 рекомендации, §4.3 коды ошибок) — в первой редакции планы значились §2.5",
"07: номера разделов в комплекте 10.2")

patch(P07, "- `03-specification.md` (§2.5 планы, §2.32 рекомендации — из 10.1/10.2, §4.3)",
"- `03-specification.md` (§2.6 планы — тело плана с действиями мельче раздела и `costBreakdown`; §2.16 рекомендации — четыре маршрута, DTO постановки плана; §2.4 — `ElementVersion.origin`; §4.2, §4.3) — номера по факту 10.2 (в первой редакции §2.5/§2.32: §2.32 — это раздел 02, не 03)",
"07: номера разделов в комплекте 10.3")

patch(P07, "  - из 10.1/10.2: транспорты рекомендаций, статусы, раунд, оценка\n",
"""  - из 10.1/10.2: `packages/shared/types/recommendations.ts` (DTO четырёх маршрутов, `RecommendationsPlanResponse`, `RecommendationDecline`), `constants/recommendations.ts`, `constants/edit-steps.ts` (бесплатные типы шагов, подписи видов и полей, `planCostBreakdown` — оценка «N бесплатно, M платно» ДО сборки плана считается им же), `types/edit-plan.ts`, `types/elements.ts` (`VersionOrigin`)
  - ЧТО 10.2 ОСТАВИЛА ПАНЕЛИ («По факту 10.2»): (а) статус плана `done` пишется ДО освобождения слота — запрос под гейтом правки сразу после `plan_updated` может получить 409 GENERATION_IN_PROGRESS: повторить, отказом не считать; (б) шаг элемента правит поле ПО УМОЛЧАНИЮ (определение / формулировка) — выбора поля в таблице рекомендаций нет, §12; (в) `declined[]`, `stale[]`, `invalid[]` приходят и при 200 (часть строк вошла), и в `details` при 422 — показывать причину по строке; (г) `EditPlanPanel` и `VersionHistory` уже знают подписи новых шагов и источника версии, но шаг элемента (поле, значение, рекомендация) и `origin` версии НЕ рисуют — это работа 10.3
""", "07: комплект 10.3")

insert_before(P07, "---\n\n### Беседа 10.3: Панель рекомендаций (клиент)\n", """**По факту 10.2 (2026-09-21) — отступления от буквы запроса и найденное:**

1. **Тело плана не вмещало ни одного из нужных шагов.** `CreatePlanRequest` знал
   только разделы и режимы, `normalizeActions` требовал `regen ⊆ sectionOrder`,
   шаги `regen_subsection` рождал лишь исполнитель (структурный пост-шаг).
   Правило «regen_subsection с доводом в regenContexts» буквально неисполнимо.
   Тело расширено: `regenSubsections`, `elementEdits`, `elementRefines` (03 §2.6).
2. **`updatePlan` пересобирает шаги ПО ТИПАМ** — любой PATCH панели каскада молча
   стёр бы шаги новых типов. Пересборка переносит их дословно (сторож 4at-в).
3. **Каскад считается по ОБЪЯВЛЕННЫМ зависимостям** (`computeDependents` от
   effectiveDeps); лог контекста даёт лишь весовые подсказки. Формулировка
   запроса «по фактическим зависимостям» неточна. Для шагов мельче раздела в
   каскад подаётся раздел-хозяин (`PlanActions.touched`) — так же считал impact
   ручной правки 5.1. Критику он ставит сам: проверено на живом файле и
   сторожами 4at-б / 5ag; в планировщике раздела critique среди действий нет.
4. **«Без квоты и без резерва» было недостижимо в трёх местах**: безусловный
   `billingCheck` на execute, `resolveBilling` в любом слоте,
   `countBillableSteps = max(1, n)`. Сделано: бесплатный слот
   (`SlotBillingOptions.free`), условная предпроверка, ноль без подъёма.
   Попутно исправлено старое: план из одних `delete` стоил единицу квоты.
5. **«Почему» негде было хранить** — миграция 0009, `element_versions.origin`
   (снимок, не FK: строки 'new' пересобираются при перечитке, план удаляется).
6. **Зависшие 'planned'.** Удаление плана и `stop` паузы возвращают строки в
   'new'; пропуск шага службой — тоже 'new'; человеком — 'rejected'. Иначе
   ROUND_IN_PROGRESS запирал бы раунд навсегда.
7. **«Удалить» (с элементом и без) — отклоняется** с причиной
   (`declined`, код `delete_element` / `delete_subsection`): шага удаления
   элемента у планов нет (за категорией тянутся связи, роли, ссылки), пустая
   правка удалением не является. Строка остаётся 'new' — §12.
8. **Готовая замена БЕЗ элемента** → `regen_subsection`, текст замены
   дописывается в довод: вписать её в поле некуда.
9. **«Перегенерировать» с адресом в sum** → перегенерация подраздела: раздел
   sum планом целиком не перегенерируется.
10. **Свёртка, которой в запросе нет**: строки об одном подразделе — один шаг;
    подраздел раздела, идущего на regen, вливается в его довод; элемент такого
    раздела и второй шаг на тот же элемент — `declined` («исполните по очереди»).
11. **Голый номер у развилки** (`['5']` при «5а»/«5б») — тоже 400 «назовите
    вариант»: иначе служба выбрала бы оба.
12. **`element_kind` рекомендаций знает три вида**, шаг — четыре (+ edge):
    планировщик edge не выдаёт, общий `POST /plans` принимает.
13. **Поле элемента из таблицы не выводится.** Шаг правит поле по умолчанию
    (определение / формулировка); рекомендация 4 живого файла просит развить
    АРГУМЕНТАЦИЮ тезиса, то есть обоснование. Столбца для поля в контракте
    нет — §12 (адресат 10.3: выбор поля в панели).
14. **Рекомендация 1 живого файла** (адрес «Таблица определений», элемент
    «Самость-как-вмещение») сторожем 10.1 привязана к КАТЕГОРИИ: термина с таким
    именем в глоссарии нет, а третья ступень сверки находит категорию. Шаг
    правит определение категории. Разбор — предмет 10.1, не тронут; §12.
15. **Статус плана `done` пишется ДО освобождения слота** (так с 2.2): запрос
    под гейтом правки сразу следом ловит 409 GENERATION_IN_PROGRESS. Харнесс
    ждёт 700 мс; панели 10.3 — повторить, отказом не считать.
16. **Ключ раунда сравнивается только с ПОСЛЕДНИМ раундом**: перегенерация,
    вернувшая прозу дословно прежней, раунда не откроет. На живой модели
    недостижимо; мок с возвратом к первой редакции на этом споткнулся.
17. **Клиент тронут в трёх местах — ради компиляции**: подписи двух шагов в
    `EditPlanPanel`, подпись источника в `VersionHistory` (исчерпывающие
    `Record<…>`), образцы плейсхолдеров шаблона refine (сторож 4ah).
    Отрисовка — 10.3.
18. **Снимки рекомендаций из тела клиента отбрасываются** (`trustRecommendationRefs`
    — только служба): иначе общий `POST /plans` позволил бы приписать правке
    чужое «почему».
19. **Замороженные инварианты поправлены**: 4as (маршруты ×4, гейт правки ×3),
    4ag (квоту слота плана решает `slotBillingFor`), audit (`costBreakdown` —
    вычисляемое поле, как `estimatedCost`).
20. **Дыры доков, найденные комплектом**: §2.14/§2.15 → §2.12/§2.13 (02),
    «§2.5 планы» → §2.6 (03), пять типов шагов в 01 §4.5 и 03 §4.2, перечень
    `change_source` в 02 без 'rollback', службы и роут 10.1 отсутствовали в
    дереве 05. Исправлено этим патчем.

""", "07: «По факту 10.2»")

patch(P07, """> точечная генерация в элемент (прецедент — обогащение 5.3), вычисляемый
> замок подразделов (9.2).
""", """> точечная генерация в элемент (прецедент — обогащение 5.3), вычисляемый
> замок подразделов (9.2).
>
> **Состояние на 2026-09-21:** 10.1 (контракт и разбор) и 10.2 (исполнение:
> два шага мельче раздела, постановка плана поштучно, раунд в работе,
> устаревание, бесплатный слот) закрыты. Осталась 10.3 — панель.
""", "07: врезка Фазы 10 — состояние")

# §12 — три долга; вставка после последней строки таблицы реестра
_t = (ROOT / P07).read_text(encoding="utf-8")
_i = _t.index("\n## 12. Реестр открытых долгов")
_rows = [m for m in __import__("re").finditer(r"^\| .*\|$", _t[_i:], __import__("re").M)]
_last = _t[_i:][_rows[-1].start():_rows[-1].end()] + "\n"
insert_after(P07, _last, """| Поле элемента у шага рекомендации: таблица рекомендаций не называет, какое поле править (определение или происхождение; формулировка или обоснование) — шаг берёт поле по умолчанию; сервер принимает `field`, выбирать его негде | 10.3 (выбор поля в панели перед сборкой плана; столбец «Поле» в контракте — только если панели окажется мало) | 10.2 | открыт |
| Рекомендация «удалить» (элемент либо подраздел) планом не исполняется и остаётся 'new' — каждая постановка отклоняет её заново с той же причиной | 10.3 (показывать такие строки как «исполняется вручную», без выбора; шаг удаления элемента — отдельная беседа, если понадобится) | 10.2 | открыт |
| Сторож 10.1 привязывает элемент к категории, когда адрес указывает на глоссарий, а термина с таким именем нет (рекомендация 1 живого файла): шаг правит категорию, хотя рекомендация говорит о глоссарии | 10.3 (в строке панели показывать вид найденного элемента рядом с адресом — расхождение должно быть видно человеку до выбора) | 10.2 | открыт |
""", "07 §12: три долга 10.2")

# ── F. 08 ────────────────────────────────────────────────────────────────
print("F. 08-history")

patch(P08, """check:integration += 2ah/4as/5af; доки — scripts/patches/patch-docs-conv101.py.
Ближайшая беседа — 10.2.
""", """check:integration += 2ah/4as/5af; доки — scripts/patches/patch-docs-conv101.py.
Беседа 10.2 (исполнение рекомендаций: шаг правки элемента и раунд; бэкенд)
ЗАКРЫТА 2026-09-21. Два шага плана мельче раздела — `edit_element` (готовый
текст, бесплатно, без биллинга вовсе) и `refine_element` (точечная генерация в
элемент); версия `'recommendation'` с `origin` (миграция 0009) отвечает «почему»;
`recommendation-planner` переводит ПОШТУЧНО названные рекомендации в черновик
плана — входа «исполнить все» нет; критику в план ставит каскад
(`PlanActions.touched`); устаревание 'stale', раунд в работе 409
ROUND_IN_PROGRESS. Смоук 64 ✓, tests/test-102-requests2-11.mjs 101 ✓ ×2 на
живом файле, check:integration += 2ai/4at/5ag; доки —
scripts/patches/patch-docs-conv102.py. Ближайшая беседа — 10.3 (панель).
""", "08 Часть I: строка 10.2")

insert_before(P08, "### Беседа 10.1 — Контракт рекомендаций и разбор (бэкенд + промпты) [ЗАКРЫТА 2026-09-21]\n", """### Беседа 10.2 — Исполнение рекомендаций: шаг правки элемента и раунд (бэкенд) [ЗАКРЫТА 2026-09-21]

**Что сделано.** Рекомендация критики теперь исполняется. Человек называет
номера поштучно (`POST /syntheses/:id/recommendations/plan { nums }`), служба
переводит строки в ЧЕРНОВИК обычного плана правок, дальше — существующая
механика: каскад, панель, `POST /plans/:planId/execute`. Нового пути исполнения
нет, входа «исполнить все» нет ни в каком виде (пустой `nums` — 400).

**Два шага мельче раздела.** `edit_element` — готовый текст в поле элемента:
модель не зовётся, квота не расходуется, стоимость 0, план из одних таких
шагов идёт под бесплатным слотом и исполняется человеком без ключа, подписки и
баланса. `refine_element` — точечная генерация в элемент: шаблон Registry
`recommendations.refine_element`, узкий контекст (элемент, подраздел адреса,
довод из прозы рекомендации), ответ — голый текст одного поля; негодный ответ
в элемент не пишется. Оба пишут значение функциями 5.1, версия —
`'recommendation'` с `origin` (миграция 0009): №, раунд, операция, основание,
план, шаг.

**Решения беседы.**
1. Тело плана расширено (`regenSubsections`, `elementEdits`, `elementRefines`) —
   прежнее не вмещало ни подраздела по выбору человека, ни элемента.
2. Каскад — от раздела-хозяина (`PlanActions.touched`); хозяин сам не
   перегенерируется и из затронутых не вычищается. Критику ставит каскад.
3. Шаги элементов — первыми; `regen_subsection` — на месте раздела-хозяина в
   едином топопорядке.
4. `updatePlan` переносит шаги новых типов через пересборку; `step_index` и
   статусы рекомендаций держит `syncRecommendationSteps`.
5. Бесплатное — бесплатно на всех трёх заслонах (роут, слот, счётчик квоты);
   оценка показывает его отдельной строкой (`costBreakdown`).
6. Снимок рекомендации в версии и в шаге — а не ссылка.
7. Планировщик не выбирает за человека: развилка в обе стороны, «удалить» —
   отклонение с причиной, второй шаг на тот же элемент — отклонение.
8. Раунд в работе — 409 с планом и номерами; осиротевшие 'planned' раунд не
   держат; удаление плана и `stop` паузы возвращают строки в 'new'.

**Проверено.** `tests/smoke-102-request1.mjs` 64 ✓ (чистые функции + живой
файл без модели); `tests/test-102-requests2-11.mjs` 101 ✓ ×2 подряд на общей
базе (живой сервер с BILLING_ENFORCE=true, мок Claude :3912, HTTP + WS, три
пользователя: подписчик, без источника оплаты, чужой); check:integration +=
2ai/4at/5ag; typecheck 0; audit чист; регресс smoke-101 92 ✓.

**Файлы беседы.** Новые: `server/services/recommendation-planner.ts`,
`server/services/element-step.ts`, `packages/shared/constants/edit-steps.ts`,
миграция `0009_version_origin`, два теста, патч-скрипт. Правленые:
`edit-planner`, `cascade-analyzer`, `plan-executor`, `generation-service`
(бесплатный слот), `pause-resume-service` (stop), `element-editor` и
`element-versioning` (источник и origin), `recommendations` (раунд в работе),
роуты `plans` и `recommendations`, `recommendation-templates`, схема, shared-типы
`edit-plan` / `elements` / `recommendations`; клиент — три подписи.

**Открытые TODO после 10.2** (все — в 07 §12, адресат 10.3): выбор поля
элемента; показ рекомендаций «удалить» как исполняемых вручную; показ вида
найденного элемента рядом с адресом. Заглушек и TODO в коде беседы нет.

**Контекст для 10.3** — в NEXT-CONTEXT.md.

""", "08 Часть II: глава 10.2")

insert_before(P08, "> **Правки 2026-09-21 (итоги беседы 10.1)**: контракт рекомендаций критики\n", """> **Правки 2026-09-21 (итоги беседы 10.2)**: исполнение рекомендаций закрыто.
> 01 — §4.5 (шаги мельче раздела, бесплатный слот); 02 — §2.12 (origin,
> перечень change_source), §2.13, §2.32 (кто ставит статусы, раунд в работе);
> 03 — §2.4 (origin), §2.6 (тело плана), §2.16 (POST …/plan), §4.2
> (costBreakdown, шаги элемента), §4.3 ROUND_IN_PROGRESS и
> RECOMMENDATIONS_NOT_PLANNABLE; 04 §4 — строки 10.2; 05 — миграция 0009, три
> службы (две из них — пропуск 10.1), тесты; 07 — «По факту 10.2» (20 пунктов),
> номера разделов в комплектах 10.2 и 10.3, комплект 10.3, врезка Фазы 10, §12
> (три долга, адресат 10.3); 09 — §2, §3, §4, §7; README; deploy — десять
> миграций, 264 шаблона; NEXT-CONTEXT — под 10.3.
>
""", "08 Часть III: врезка 10.2")

# ── G. 09 ────────────────────────────────────────────────────────────────
print("G. 09-lessons")

insert_before(P09, "## 3. PostgreSQL, Drizzle, данные\n", """### Беседа 10.2 — текст запроса против кода

1. **Запрос беседы писался по памяти о коде, а не по коду** — второй раз подряд
   (10.1 п.1). Здесь он трижды требовал недостижимого: «regen_subsection с
   доводом в regenContexts» (тело плана подразделов не знало), «каскад как
   всегда» для шага элемента (анализ не знал изменённого, но не
   перегенерируемого раздела), «без квоты и резерва» (три заслона биллинга
   стояли безусловно). ПЕРВЫЙ ход серверной беседы — прочитать вход и выход
   функций, которые запрос называет, и выписать расхождения ДО кода.
2. **Функция, пересобирающая структуру ПО ТИПАМ, — мина для каждого нового
   типа.** `updatePlan` собирал шаги заново из пяти известных типов; шестой и
   седьмой исчезли бы при первом же PATCH панели, без ошибки. Добавил тип в
   объединение — `grep` по всем местам, где объединение разбирается фильтром
   по `type ===`, а не только по `switch` (его ловит компилятор, фильтр — нет).
3. **Исчерпывающие `Record<Union, string>` на клиенте** — единственное, что
   заставляет серверную беседу тронуть клиент. Это не нарушение запрета, а
   цена типа: правка — подпись, отрисовка — следующей беседе; записать в
   «По факту».
4. **Номера разделов в комплекте беседы врут систематически** (9.2, 10.1, 10.2,
   и заранее — 10.3): комплект пишется до патча доков предыдущей беседы.
   Сверять `grep -n '^### 2\\.' docs/02-data-model.md docs/03-specification.md`
   при чтении комплекта и править и текущую беседу, и СЛЕДУЮЩУЮ.

""", "09 §2: беседа 10.2")

insert_before(P09, "## 4. Тесты, харнессы, браузер\n", """### Беседа 10.2 — ссылки, снимки, статусы

1. **FK `ON DELETE SET NULL` + статус, зависящий от ссылки, = вечный статус.**
   `recommendations.plan_id` обнуляется при удалении плана, а `status='planned'`
   остаётся — и запирает раунд. Если статус значит «стою в X», удаление X
   обязано статус снять явно (в той же операции, ДО удаления), а читатель
   статуса — не верить ему без живой ссылки (осиротевшие 'planned' раунд не
   держат).
2. **«Почему» хранится снимком, а не ссылкой**, когда адресат ссылки живёт
   меньше записи: строки рекомендаций пересобираются при перечитке, планы
   удаляются, а версия элемента остаётся навсегда.
3. **`change_source` — текст без CHECK**: новое значение перечисления миграции
   не требует (drizzle-enum — только типы). Перед тем как писать миграцию «ради
   значения», посмотреть DDL: `grep -n change_source server/db/migrations/*.sql`.

""", "09 §3: беседа 10.2")

insert_before(P09, "## 5. Node, TypeScript, сборка\n", """### Беседа 10.2 — гонки и моки

1. **Статус «готово» в БД — не «слот свободен».** Исполнитель пишет
   `edit_plans.status='done'`, шлёт `plan_updated` с оценкой и лишь потом
   выходит из слота. Харнесс, ждущий статус опросом БД, следующим запросом под
   гейтом правки получал 409 GENERATION_IN_PROGRESS — и падал НЕ там
   (`Cannot read properties of undefined` на ответе без `plan`). После ожидания
   статуса — пауза 700 мс либо повтор на 409.
2. **Мок, возвращающийся к прежнему ответу, ломает проверку раунда**: ключ
   раунда — хэш прозы, сравнивается с последним раундом. Вторая перегенерация
   критики обязана дать ТРЕТЬЮ редакцию прозы, а не первую.
3. **Сторож может привязать элемент не к тому виду, что ждёт тест.**
   Рекомендация 1 живого файла адресована глоссарию, а найдена категорией.
   Тест, читающий элемент рекомендации, берёт таблицу по `element_kind` строки,
   а не по своему ожиданию.
4. **Отладочная печать ответа ДО разыменования** экономит прогон: харнесс на
   живом сервере идёт две минуты, а `r.json.plan.id` у ответа-отказа падает без
   единого слова о причине. Печатать статус и тело при `status !== 200`.
5. **Принуждение биллинга в проверке** — `(env.billing as { enforce: boolean
   }).enforce = true` (поле readonly; образец — 5x беседы 6.1), вернуть в
   `finally`. В харнессе живого сервера — `BILLING_ENFORCE=true` в env дочернего
   процесса; человеку без источника оплаты для ретрофита временно дать баланс
   SQL-ом и обнулить после.

""", "09 §4: беседа 10.2")

insert_before(P09, "## 8. Прочее\n", """### Беседа 10.2 — слот и биллинг

1. **Три заслона биллинга у одной операции**: middleware роута, `resolveBilling`
   при взятии слота, счётчик единиц квоты. Бесплатная операция обязана пройти
   ВСЕ три — снять один мало. Проверять человеком без ключа, подписки и баланса
   при `BILLING_ENFORCE=true`, а не подписчиком: у подписчика ошибка молча
   превращается в списанную единицу.
2. **`Math.max(1, n)` в счётчике квоты — скрытая плата за бесплатное**: план из
   одних `delete` стоил единицу с беседы 6.1, и ни один тест этого не видел —
   тесты 6.1 мерили планы с перегенерациями.
3. **Синхронное обращение к модели внутри шага плана** (refine_element) дельты
   не шлёт: своего WS-сообщения у него нет, а чужой `stream_delta` клиент принял
   бы за генерацию раздела. Ход шага клиент видит по `plan_step_started` /
   `plan_step_done` (тот же вывод — 10.1 п.3 о ретрофите).

""", "09 §7: беседа 10.2")

# ── H. README, deploy ────────────────────────────────────────────────────
print("H. README, deploy")

patch("README.md", "| 10 — реализация критики | 10.1–10.3 | открыта 2026-09-20; 10.1 (контракт рекомендаций и разбор) закрыта 09-21; ближайшая — 10.2 |",
"| 10 — реализация критики | 10.1–10.3 | открыта 2026-09-20; 10.1 (контракт рекомендаций и разбор) и 10.2 (исполнение: шаг правки элемента, раунд) закрыты 09-21; ближайшая — 10.3 (панель) |",
"README: таблица фаз")

patch("deploy/philosynth-ubuntu.md", "Сидов четыре: 263 шаблона промптов,", "Сидов четыре: 264 шаблона промптов,", "deploy ubuntu.md: 264 шаблона")
patch("deploy/philosynth-termux.md", "девять миграций и четыре сида.", "десять миграций и четыре сида.", "deploy termux.md: десять миграций")

patch(P07, "Беседа 10.1 (2026-09-21) долгов с адресатом не оставила; ближайшая — 10.2.\n",
"""Беседа 10.2 (2026-09-21) оставила ТРИ долга, все адресованы 10.3 (строки в
таблице выше): выбор поля элемента, показ рекомендаций «удалить» как
исполняемых вручную, показ вида найденного элемента рядом с адресом. Серверных
долгов нет; ближайшая беседа — 10.3.

Беседа 10.1 (2026-09-21) долгов с адресатом не оставила; ближайшая — 10.2.
""", "07 §12: абзац о долгах 10.2")

patch("README.md", "Реестр открытых долгов (07 §12) пуст. Фаза 10 «Реализация критики»\n",
"В реестре открытых долгов (07 §12) три строки, все адресованы беседе 10.3\n(оставлены 10.2). Фаза 10 «Реализация критики»\n", "README: реестр долгов")

print(f"\nИтог: applied={applied}, skipped={skipped}, failed={failed}")
sys.exit(1 if failed else 0)
