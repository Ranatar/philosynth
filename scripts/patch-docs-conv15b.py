#!/usr/bin/env python3
"""Патч доков по итогам беседы 1.5b (Unified Concept Pool, клиент).

Идемпотентный: каждая правка сперва проверяет наличие нового текста
(applied ранее → skip), затем наличие якоря (нет → FAIL). str.replace,
НЕ re.sub. Запуск из корня репо: python3 scripts/patch-docs-conv15b.py

Дыры, закрываемые патчем (аудит по первоисточникам после сжатия контекста):
  A. 07: факты беседы (снимки вырождены, гейт мета-синтеза до 3.1/4.3,
     pool-store/concept-file, secSynthReady/FullBudgetPreview) +
     переформулировка тестов 2/3/4 (снимков нет; alert недостижим —
     чекбокс disabled и в исходнике [5258]).
  B. 07 §11: беседы 1.5b не было в графе зависимостей — добавлена
     в обе ветки (под 1.4→1.5 и под 0.4→1.5).
  C. 05: stores/ без pool-store.ts; utils/ без concept-file.ts;
     vite-env.d.ts отсутствовал; PoolSummary.tsx реализован внутри
     ConceptPool.tsx.
  D. 04: строка пула — фактические файлы 1.5b + вырожденные функции;
     строка importConceptAsParticipant — клиентский порт файлового
     сценария.
  E. Фрагмент 1.5b-concept-pool.js: НЕ содержал 4 заявленных протоколом
     функций (toggleSynthParticipant, selectForViewing,
     snapshotCurrentState, syncConceptParticipants) — дописаны из
     исходника; блок [poolIdx] — ложное срабатывание extract-fragments
     (dash-пул СТИЛЕЙ РЁБЕР ГРАФА, не пул концепций) — помечен.
  F. NEXT-CONTEXT: глава «Беседа 1.5b … [ЗАКРЫТА]».
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

# ══ A. 07: блок «По факту беседы 1.5b» перед разделом беседы ══
patch(
    "docs/07-conversation-protocol.md",
    "### Беседа 1.5b: Unified Concept Pool (клиент)",
    """> **По факту беседы 1.5b** (реализация принята, тесты 35/35 браузерных
> + 38/38 смоук-сверок порта с исходником):
> - Состояние пула — `client/stores/pool-store.ts` (Zustand; в перечне
>   первого запроса не значился), DOM-парсинг — `client/utils/concept-file.ts`
>   (клиентские порты 1:1: parseConceptFile, importConceptAsParticipant,
>   extract-цепочка, fetchWithFallback+CORS-прокси; genealogy=null —
>   reconstructGenealogy/restoreCapsulesFromHTML отложены к 3.1/3.2).
> - **Снимки вырождены**: клиент сервиса не редактирует просматриваемую
>   концепцию локально (правки — в БД, беседы 2.x), поэтому
>   snapshotCurrentState/restoreFromPoolSnapshot НЕ портированы;
>   refreshPoolParticipant идёт по ветке «rawHTML не менялся»; просмотр
>   ◉ = read-only предпросмотр innerHTML #docOutput. Тест 2 читать как
>   «переключи просмотр → предпросмотр и индикатор переключились»;
>   тест 4 — как «prepareForGeneration (refreshAllSynthParticipants +
>   сброс ◉) отработал до POST».
> - Тест 3 читать как «☑ непригодной disabled + ⚠ с причиной, клик
>   no-op»: alert-ветка toggleSynthParticipant [4738] из UI недостижима
>   И В ИСХОДНИКЕ — чекбокс у непригодной рендерится disabled [5258].
> - **Гейт мета-синтеза**: сабмит с ☑-концепциями блокируется формой с
>   объяснением — файловые концепции не представимы в ParticipantInput
>   ({type:'synthesis',synthesisId}), сервер отклоняет их до 3.1
>   (meta-synthesis-service) и 4.3 (серверный импорт файлов).
> - SectionPicker += secSynthReady (SYNTH_READY_SECTIONS дословно [5114],
>   подсказка про «Анализ названия» [5580]); автовключение разделов —
>   эффект SynthesisForm по переходу hasSynthConcepts (React-адаптация
>   DOM-части toggleSynthParticipant [4744]); FullBudgetPreview — порт
>   renderFullBudgetPreview [10456] с клиентской копией CONTEXT_BUDGET
>   (помечена как дрейф-риск; estimate-diff — после 3.1).
> - Фрагмент 1.5b-concept-pool.js дополнен 4 функциями, заявленными
>   ниже, но не попавшими в извлечение; блок [poolIdx] в нём — ложное
>   срабатывание (dash-пул стилей рёбер графа). Появился
>   `client/src/vite-env.d.ts` (первый import.meta.env клиента).

### Беседа 1.5b: Unified Concept Pool (клиент)""",
    "15b/A 07 «По факту беседы 1.5b»",
    marker="**По факту беседы 1.5b**",
)

# ══ B. 07 §11: беседа 1.5b в обеих ветках графа ══
patch(
    "docs/07-conversation-protocol.md",
    " │         │         ├── 1.5 (SynthesisForm, GenerationProgress, SectionWarnings — клиент)\n",
    " │         │         ├── 1.5 (SynthesisForm, GenerationProgress, SectionWarnings — клиент)\n"
    " │         │         │    └── 1.5b (Unified Concept Pool: pool-store, concept-file — клиент)\n",
    "15b/B1 07 §11 ветка 1.4→1.5→1.5b",
    marker="1.5b (Unified Concept Pool: pool-store, concept-file — клиент)",
)
patch(
    "docs/07-conversation-protocol.md",
    "      ├── 1.5 (форма + прогресс)\n",
    "      ├── 1.5 (форма + прогресс)\n"
    "      │    └── 1.5b (Unified Concept Pool)\n",
    "15b/B2 07 §11 ветка 0.4→1.5→1.5b",
    marker="└── 1.5b (Unified Concept Pool)",
)

# ══ C. 05: pool-store, concept-file, vite-env, судьба PoolSummary ══
patch(
    "docs/05-file-structure.md",
    "│   │   │   ├── generation-store.ts     # Zustand: состояние генерации, стриминг\n",
    "│   │   │   ├── generation-store.ts     # Zustand: состояние генерации, стриминг\n"
    "│   │   │   ├── pool-store.ts           # Zustand: Unified Concept Pool (беседа 1.5b)\n",
    "15b/C1 05 stores += pool-store.ts",
    marker="pool-store.ts           # Zustand: Unified Concept Pool",
)
patch(
    "docs/05-file-structure.md",
    "│   │   └── utils/\n│   │       ├── graph-physics.ts",
    "│   │   ├── vite-env.d.ts                   # Типы import.meta.env (появился в 1.5b)\n"
    "│   │   │\n"
    "│   │   └── utils/\n"
    "│   │       ├── concept-file.ts             # Парсинг концепт-файлов пула (1.5b, клиентские порты)\n"
    "│   │       ├── graph-physics.ts",
    "15b/C2 05 utils += concept-file.ts, src += vite-env.d.ts",
    marker="concept-file.ts             # Парсинг концепт-файлов пула",
)
patch(
    "docs/05-file-structure.md",
    "│   │   │   │   └── PoolSummary.tsx          # Саммари пула\n",
    "│   │   │   │   └── PoolSummary.tsx          # Саммари пула (1.5b: реализован строкой внутри ConceptPool.tsx — отдельный файл не понадобился)\n",
    "15b/C3 05 судьба PoolSummary",
    marker="реализован строкой внутри ConceptPool.tsx",
)

# ══ D. 04: строки пула и importConceptAsParticipant ══
patch(
    "docs/04-code-reuse-map.md",
    "| `parseConceptFile()`, `addToPool()`, `removeFromPool()`, `selectForViewing()`, `snapshotCurrentState()`, `restoreFromPoolSnapshot()`, `syncConceptParticipants()`, `refreshPoolParticipant()`, `renderPoolConcepts()`, `handlePoolFileImport()`, `handlePoolUrlImport()` | `client/components/pool/ConceptPool.tsx` (v10, НОВОЕ) |",
    "| `parseConceptFile()`, `addToPool()`, `removeFromPool()`, `selectForViewing()`, `snapshotCurrentState()`, `restoreFromPoolSnapshot()`, `syncConceptParticipants()`, `refreshPoolParticipant()`, `renderPoolConcepts()`, `handlePoolFileImport()`, `handlePoolUrlImport()` | `client/components/pool/ConceptPool.tsx`+`PoolCard.tsx`, `client/stores/pool-store.ts`, `client/utils/concept-file.ts` (беседа 1.5b ✓; snapshotCurrentState/restoreFromPoolSnapshot вырождены — локальных правок в сервисе нет, refreshPoolParticipant по ветке «rawHTML не менялся»; renamePoolConcept/toggleSynthParticipant/setPoolStatus там же) |",
    "15b/D1 04 строка пула — фактические файлы",
    marker="беседа 1.5b ✓; snapshotCurrentState/restoreFromPoolSnapshot вырождены",
)
patch(
    "docs/04-code-reuse-map.md",
    "| `importConceptAsParticipant()` | Чтение из БД вместо из DOM | `server/services/meta-synthesis-service.ts` |",
    "| `importConceptAsParticipant()` | Чтение из БД вместо из DOM | `server/services/meta-synthesis-service.ts` (3.1); клиентский порт файлового сценария 1:1 — `client/utils/concept-file.ts` (1.5b, genealogy=null до 3.1/3.2) |",
    "15b/D2 04 importConceptAsParticipant — клиентский порт",
    marker="клиентский порт файлового сценария 1:1",
)

# ══ E. Фрагмент: пометка ложного poolIdx + 4 недостающие функции ══
patch(
    "docs/fragments-for-conversations/1.5b-concept-pool.js",
    "// ───── [poolIdx] philosynth.html строки 13081–13112 ─────",
    "// ───── [poolIdx] philosynth.html строки 13081–13112 ─────\n"
    "// ⚠ ЛОЖНОЕ СРАБАТЫВАНИЕ extract-fragments: этот блок — dash-пул\n"
    "// СТИЛЕЙ РЁБЕР ГРАФА, к Unified Concept Pool отношения не имеет.\n"
    "// Оставлен для истории; НЕ портировать в рамках 1.5b.",
    "15b/E1 фрагмент — пометка ложного poolIdx",
    marker="ЛОЖНОЕ СРАБАТЫВАНИЕ extract-fragments",
)

def append_source_functions() -> None:
    """Дописывает 4 недостающие функции из исходника в конец фрагмента."""
    tag = "15b/E2 фрагмент += toggleSynthParticipant/selectForViewing/snapshotCurrentState/syncConceptParticipants"
    frag = Path("docs/fragments-for-conversations/1.5b-concept-pool.js")
    s = frag.read_text(encoding="utf-8")
    if "[toggleSynthParticipant]" in s:
        skipped.append(tag); return
    src_lines = Path("source/philosynth.html").read_text(encoding="utf-8").split("\n")
    def sl(a: int, b: int) -> str:
        return "\n".join(src_lines[a - 1 : b])
    ranges = [
        ("toggleSynthParticipant", 4731, 4771),
        ("selectForViewing", 4776, 4828),
        ("snapshotCurrentState", 4833, 4869),
        ("syncConceptParticipants", 4881, 4897),
    ]
    # Валидация якорей извлечения (защита от сдвига исходника)
    for name, a, _b in ranges:
        if f"function {name}" not in src_lines[a - 1]:
            failed.append(f"{tag}: строка {a} исходника не начинает function {name}")
            return
    add = [
        "",
        "// ═════ Дописано патчем 1.5b (дыра извлечения: функции заявлены в",
        "// первом запросе беседы, но во фрагмент не попали) ═════",
    ]
    for name, a, b in ranges:
        add.append(f"// ───── [{name}] philosynth.html строки {a}–{b} ─────")
        add.append(sl(a, b))
        add.append("")
    frag.write_text(s.rstrip("\n") + "\n" + "\n".join(add), encoding="utf-8")
    applied.append(tag)

append_source_functions()

# ══ F. NEXT-CONTEXT: глава беседы 1.5b ══
CHAPTER = """

# Беседа 1.5b — Unified Concept Pool (клиент) [ЗАКРЫТА]

## Созданные/изменённые файлы

- `client/src/utils/concept-file.ts` — клиентский парсинг концепт-файлов
  (порты 1:1, DOMParser нативен): TITLE_TO_KEY/titleToKey [5413],
  truncateText/tableToText/extractSection [7953–8010], extract{Glossary
  Compact,ThesesSummary,GraphNodesTable,GraphEdgesTable}, extractContext
  Fragment (урезан до 9 ключей importConceptAsParticipant; graph:nodes_top
  = top-7 по центральности [8255]), extractCapsuleText [11720],
  extractMetadata/Sections/EmbeddedState [21356–21543],
  importConceptAsParticipant [22009] (window.confirm мягких предупреждений
  1:1), parseConceptFile [4617], fetchWithFallback+CORS_PROXIES [21227]
  (statusEl → колбэк onStatus). Отступления: genealogy=null
  (reconstructGenealogy/restoreCapsulesFromHTML — TODO(3.1/3.2));
  extractThesesSummary undefined→null нормализован.
- `client/src/stores/pool-store.ts` — Zustand-стор пула:
  concepts/selectedConceptId/derived conceptParticipants
  (syncConceptParticipants = пересчёт в commit) /status; действия
  addToPool/removeFromPool/renamePoolConcept (prompt в компоненте)/
  toggleSynthParticipant (DOM-часть secSynthReady → эффект формы)/
  selectForViewing/refreshPoolParticipant/refreshAllSynthParticipants/
  prepareForGeneration (refreshAll + сброс ◉ перед POST); dev-хук
  window.__poolStore={get} (браузерные тесты; Node-безопасный гард —
  integration-check исполняет модуль под tsx).
- `client/src/components/pool/PoolCard.tsx` — карточка: 4 колонки
  ☑ Синтез (disabled при !participant, как [5258]) / ◉ Просм. (повторный
  клик = деселект, toggle в onClick как в исходнике) / инфо
  (метод×уровень·порядок·источники; ORDER_LABELS [5023] локально) /
  ✎ ✕; строка ⚠ причины непригодности.
- `client/src/components/pool/ConceptPool.tsx` — блок «Загруженные
  Концепции»: multiple-файлы (FileReader), URL-строка (togglePoolUrlRow),
  статус, карточки, саммари «N из M для мета-синтеза · ◉ имя — просмотр»,
  индикатор ◉ в шапке, read-only предпросмотр innerHTML #docOutput
  выбранной (dangerouslySetInnerHTML; script при innerHTML не исполняется).
  PoolSummary.tsx из 05 не понадобился — саммари одна строка.
- `SectionPicker.tsx` += secSynthReady: SYNTH_READY_SECTIONS [5114]
  дословно (graph/glossary/theses/dialogue/critique/capsule), чекбокс
  «◈ Пригодность к дальнейшему синтезу», подсказка про «Анализ названия»
  [5580] (selected уже в пропсах — рендер здесь).
- `SynthesisForm.tsx` — пропс conceptParticipants ЗАМЕНЁН стором (никем
  не передавался; точка встраивания 1.5 реализована); <ConceptPool />
  после PhilosopherPicker; эффект по ПЕРЕХОДУ hasSynthConcepts (ref):
  false→true → synthReady+SYNTH_READY_SECTIONS+статус пула [4744–4750],
  →0 → снять synthReady, разделы не трогать [4760]; ГЕЙТ: сабмит с
  ☑-концепциями блокируется с объяснением (ParticipantInput не
  представляет файловые концепции; сервер отклоняет type='synthesis'
  до 3.1/4.3); FullBudgetPreview — порт renderFullBudgetPreview [10456]
  без estimate-diff (TODO(3.1)); CONTEXT_BUDGET_PREVIEW —
  задокументированная клиентская копия [7529] (дрейф-риск, канон в
  Registry).
- `CreateSynthesisPage.tsx` — usePoolStore.getState().prepareForGeneration()
  перед POST.
- `client/src/vite-env.d.ts` — создан (первый import.meta.env клиента;
  без него tsc -b client падал TS2339).
- `server/integration-check.mts` += секция 4n (модули/экспорты 1.5b +
  контракты: гейт мета-синтеза, CONTEXT_BUDGET_PREVIEW локализован,
  prepareForGeneration перед POST, снимков нет, TODO(3.1/3.2) помечен,
  browser storage запрещён).
- `tests/smoke-15b-request1.mjs` — 38 сверок порта с исходником (vm,
  ОБЕ стороны на linkedom; стабы reconstructGenealogy→null с обеих
  сторон): побайтово 13 полей участника, top-7, непригодность (тексты
  ошибок равны), confirm-отмена → null, titleToKey.
- `tests/test-15b-requests2-5.mjs` — 35 браузерных проверок (сервер
  :3000 + vite :5199 + puppeteer/Chromium; БЕЗ сидов и БЕЗ
  ANTHROPIC_API_KEY: CostEstimate деградирует в «оценка недоступна»
  (проверено), POST отбивается предпроверкой API_KEY_MISSING — генерация
  тестам не нужна, БД-страховка 0 строк).

## Адаптации DOM/DOC_STATE → сервис (решения беседы)

1. Снимки вырождены: локальных правок просматриваемой концепции в
   сервисе нет (правки — в БД, 2.x) → snapshotCurrentState/
   restoreFromPoolSnapshot не портированы; refreshPoolParticipant —
   ветка «rawHTML не менялся» (ранний return; ветка snapshot сохранена
   структурно); просмотр ◉ = read-only предпросмотр. Полный просмотр
   импортированного документа — 1.6 (SynthesisPage) + 4.3.
2. Гейт мета-синтеза: сабмит с ☑ блокируется до 3.1/4.3 (см. форму).
3. DOM-часть toggleSynthParticipant (secSynthReady+разделы) → эффект
   формы по переходу hasSynthConcepts; статусы пула сохранены.
4. renderFullBudgetPreview: React-компонент подписан на стор — явные
   вызовы из syncConceptParticipants не нужны; estimate-diff отложен
   (нужна серверная поддержка концепций — 3.1).
5. Тест 3 протокола («alert») недостижим из UI и в исходнике (disabled
   [5258]) → проверяется disabled+⚠+no-op+отсутствие alert.
6. prepareForGeneration = refreshAllSynthParticipants + сброс ◉ до
   POST (снимок текущей — N/A по п.1); очистка DOC_STATE.modes из
   первого запроса 1.5 не имеет аналога (модов у клиента ещё нет — 4.1).

## Ревью по карте 04 (доля 1.5b)

- Строка пула (11 функций): все портированы ✓, кроме вырожденных
  snapshotCurrentState/restoreFromPoolSnapshot (адаптация 1);
  renamePoolConcept/toggleSynthParticipant/setPoolStatus/
  refreshAllSynthParticipants — тоже ✓ (в строке 04 не значились).
- importConceptAsParticipant: клиентский порт файлового сценария ✓;
  серверный (из БД) — 3.1, как в 04.
- fetchWithFallback+CORS_PROXIES ✓ (в 04 отдельной строкой не значился).
- Осталось TODO: reconstructGenealogy/restoreCapsulesFromHTML (3.1/3.2);
  estimate-diff превью (3.1); кнопки замен CompatAdvisor (прежний TODO).

## Помодульно: что прикладывать в следующие беседы

- **1.6 (просмотр/каталог)**: ConceptPool.tsx (паттерн read-only
  предпросмотра → заменить на полноценный просмотр), pool-store.ts.
- **3.1 (мета-синтез, сервер)**: concept-file.ts (клиентские экстракторы
  = референс для loadConceptContext из БД; genealogy TODO), SynthesisForm
  (снять гейт: ParticipantInput расширить концепциями), FullBudgetPreview
  (подключить серверный estimate-diff).
- **3.2 (пул+дерево, клиент)**: pool-store.ts + dev-хук __poolStore;
  PoolCard/ConceptPool как база.
- **4.3 (импорт, сервер)**: parseConceptFile/importConceptAsParticipant
  из concept-file.ts — референс серверного парсера файлов.

## Знания/грабли, добытые в 1.5b

1. Эвристика «последний матчащий div» для поиска карточки в puppeteer —
   ФЛАК; детерминированный селектор: radio[name=poolView] →
   closest("div.rounded.border") → find по имени.
2. Гонка «клик в окно disabled fieldset» сразу после сабмита: input
   внутри disabled fieldset игнорирует click() при
   input.disabled===false; нестрогий матч ошибки (/ключ|key/i)
   пропускал тест раньше рендера serverError. Лечение: строгое ожидание
   «API-ключ» + fieldset.disabled===false + helper poolAct (клик с
   верификацией эффекта, до 3 попыток с логом [retry]; за финальные
   прогоны — 0 ретраев).
3. import.meta.env в клиенте: (а) требует vite-env.d.ts для tsc;
   (б) в Node (tsx, integration-check) import.meta.env — undefined:
   гард сперва typeof window, затем (import.meta as {env?}).env?.DEV.
4. linkedom-смоук: обе стороны сверки держать на ОДНОМ DOM (innerText
   ≈ textContent — грабля 1.3), стабы недостающих функций (reconstruct
   Genealogy) ставить ОБЕИМ сторонам.
5. PG/Redis не переживают пауз между bash-вызовами песочницы — поднимать
   в каждом вызове с прогоном; сиды integration-check нужны (живые
   конвейеры 5h/5i), браузерному тесту 1.5b — нет.

## Открытые TODO после 1.5b

- TODO(3.1): снять гейт мета-синтеза в SynthesisForm; серверные
  концепции-участники; estimate-diff в FullBudgetPreview;
  reconstructGenealogy.
- TODO(3.2): restoreCapsulesFromHTML; полный пул с деревом.
- TODO(1.6): полноценный просмотр импортированной концепции вместо
  read-only предпросмотра.
- TODO(4.3): серверный импорт файлов (parseConceptFile как референс).
- Прочие TODO прежних бесед — без изменений.

## Патч доков по итогам 1.5b

Снят `scripts/patch-docs-conv15b.py` (идемпотентный, skip/fail-отчёт;
прогон 2 — чистый skip): 07 «По факту 1.5b» + §11 (1.5b в обе ветки
графа), 05 (pool-store/concept-file/vite-env/судьба PoolSummary),
04 (фактические файлы пула; клиентский порт importConceptAsParticipant),
фрагмент (ложный [poolIdx] помечен; дописаны 4 недостающие функции),
эта глава. При переупаковке архивов скрипт оставлять."""

def append_chapter() -> None:
    tag = "15b/F NEXT-CONTEXT глава 1.5b"
    p = Path("NEXT-CONTEXT.md")
    s = p.read_text(encoding="utf-8")
    if "# Беседа 1.5b — Unified Concept Pool (клиент) [ЗАКРЫТА]" in s:
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
