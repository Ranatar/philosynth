# PhiloSynth Service — Протокол бесед

> **Правки 2026-09-04 (итоги беседы 5.2)**: Element Editor UI закрыт
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
> **Правки 2026-09-03 (итоги беседы 5.1)**: Element Editor +
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
> **Правки 2026-08-30 (итоги беседы 4.3)**: Import Service закрыт
> (запрос 1 + все 4 тестовых запроса tests/test-43-requests2-5.mjs
> 64 ✓ ×2, включая roundtrip — перенесённый тест 4 беседы 4.2 — и
> браузерный сегмент ImportPage). Дыры, закрытые этим патчем: запрос
> 4.3 предполагал порт extractMetadata/extractSections 1:1, но экспорт
> 4.2 рендерит шапку ПО КЛАССАМ без id и несёт в .doc-body якоря/кнопку
> графа — адаптации не были оговорены (глава «По факту 4.3»); участники
> сервиса type='synthesis' против 'concept' клиентского порта 3.2;
> incomplete-доля гейта 2.3 вырождена (помечено по месту); долг §12
> «Серверный импорт концепт-файлов» вычеркнут как ЗАКРЫТЫЙ, остаток
> (клиентский сабмит файловых ☑-концепций) заведён отдельной строкой.
>
> **Правки 2026-08-29 (итоги беседы 4.2)**: Export Service закрыт
> (запрос 1 + тесты 2–6 tests/test-42-requests2-6.mjs 76 ✓ ×2; тест 4
> протокола — roundtrip — исполняет беседа 4.3 первым тестом, инверсия
> помечена по месту). Дыры, закрытые этим патчем: первый запрос 4.2 не
> содержал md-exporter/filename/GET /export/md (роутов пять, не четыре);
> пп. 4d/4g/5b не оговаривали серверные адаптации (ассеты вместо
> fn.toString, предвычисленный лог, renderTemplate вместо
> config.buildPrompt); «Контекст» дополнен фактическим входным
> комплектом; квирк truncLabel переформулирован ("\u2026" — валидный
> литерал); графу §11 добавлены рёбра 4.2; оба долга §12 за 4.2
> вычеркнуты как ЗАКРЫТЫЕ.
>
> **Правки 2026-08-28 (итоги беседы 4.1)**: система режимов закрыта
> (запрос 1 + браузерный тест tests/test-41-requests2-5.mjs 53 ✓;
> R4 — АДАПТАЦИЯ против буквы: вход в модалку без капсулы скрыт —
> порт updateModeButtons [11799], предупреждение «без capsule»
> проверено API-уровнем, отображение ⚠/💡 — на синтезе с капсулой
> без critique/graph). Дыры, закрытые этим патчем: §2.7 не
> специфицировал транспорт checkModeDeps/estimateModeCost —
> аддитивные warnings/estimate в GET /modes/:modeKey; spec фрагмента
> 4.1 не извлекал css:#modeTabsBar [1619–1627] и @keyframes
> pulse-tab [1673] (css*:.mode- их не ловит) — дополнен, комплект
> пересобран. Отступления: DELETE результата под 409-гейтом
> (исходник removeModeResult доступен всегда); silent-перегенерация
> — UPDATE строки с СОХРАНЕНИЕМ created_at (стабильность индексов;
> исходник обновлял timestamp); source 'mode_cascade' (enum 02
> §2.15; в исходнике 'mode-cascade'). Приёмы: связь
> cascade-analyzer → mode-service ТОЛЬКО ленивым import()
> (статический замыкает цикл через generation-service); аддитивные
> экспорты streamWithRetries/bumpTotals из generation-service.
> Дрейф-контроль клиентской статики MODE_UI ↔ MODE_CONFIG — секция
> 4x integration-check (попутно дефект 4r: регексп статического
> импорта ловил пример в комментарии — сужен до ^import…/m). §12:
> долги cascade-analyzer-портов и setModeRegenerator ЗАКРЫТЫ;
> внесены открытые долги карточек режимов EditModal и каскада
> режимов SubsectionRegenPanel (за 4.1, довыполнение по команде).
>
> **Правки 2026-08-21 (итоги беседы 3.2)**: клиентская половина
> мета-синтеза и дерево генеалогии закрыты (браузерный тест
> tests/test-32-requests2-5.mjs 52 ✓ ×2). Найденные текстом 3.2
> рассогласования: (а) п.1 «пересечения по GET /lineage/ancestors»
> неприменим к ФАЙЛОВЫМ концепциям пула (их нет в БД) — реализовано
> двумя путями (каталожные — через API, файловые — по
> participant.genealogy из reconstructGenealogy); (б) «снятие
> блокировки сабмита» не оговаривало остаток: файловые концепции
> по-прежнему блокируются до серверного импорта 4.3 — снято только
> для КАТАЛОЖНЫХ ({type:'synthesis', synthesisId}); (в) механизм
> добавления каталожных концепций в пул в 07 не описан, хотя тест №1
> его требует — добавлен пикер «+ Из каталога» в ConceptPool;
> (г) SynthesisPreview не нёс признака мета-синтеза для бейджа п.5 —
> закрыто аддитивным полем hasConceptParents (прецедент — warnings
> POST из 3.1); (д) checkGenealogyOverlaps в исходнике ОПРЕДЕЛЕНА,
> но НЕ ВЫЗВАНА (мёртвый код) — предупреждение реализовано
> предполётным confirm на клиенте, серверные warnings из POST
> рисуются неблокирующе; (е) попутная починка предсуществующего
> дефекта 1.6b, найденного браузерным тестом: CreateSynthesisPage
> звал navigate() внутри апдейтера setSynthesisId (рендер-фаза
> React) — id перенесён в ref; (ж) в scripts/smoke-31.ts и
> scripts/test-31-requests2-4.ts остались 5 ошибок typecheck:scripts
> (3.1 гоняла их через tsx) — предсуществующие, за 3.1.

> **Правки 2026-08-20 (итоги беседы 3.1)**: мета-синтез и генеалогия
> закрыты (смоук 28 ✓ + тесты 16 ✓ ×2, живой конвейер промпта);
> текст 3.1 п.1: список loadConceptContext дополнен до 10 полей
> исходника (отсутствовали portraits и dialogueSynthesis — оба в
> PARENT_FIELD_ORDER), несуществующий «buildConceptContextBlock»
> заменён реальными conceptContextBlockFull/Selective (провайдер
> baseCtxParents), в п.1 вписан conceptContextBlockFull (карта 04
> §1.10 назначала его сюда, legacy 'monolithic' до миграции требует
> монолит; КВИРК исходника сохранён — монолит без portraits и
> graphEdges); адрес генеалогических функций — meta-synthesis-service
> (спека фрагмента называла lineage-service); отступления: ответ POST
> += неблокирующее warnings (M3; контракт §2.2 не имел места для
> confirm-предупреждений исходника), hasConceptParticipants гейтится
> ФЛАГОМ p.isMetaSynthesis (выставляет buildParams), стык 2.2↔3.1 —
> первая перегенерация после миграции схемы шла бы по монолиту
> (p собран до апдейта строки; починено); §12 — четыре долга 3.1
> закрыты (серверная половина участников-концепций; клиентская — 3.2).
>
> **Правки 2026-08-09 (итоги беседы 2.2)**: plan-executor и
> регенерация закрыты (53 ✓ ×2, живой сервер + мок-SSE); блок
> «По факту 2.2»; текст 2.2 п.1 расклеен (deleteSection/пост-план/
> regenStructureFromEditModal), buildDocStateFromImport помечен как
> обязанность 4.2, дубль «d.» устранён, «plan_paused» заменён на
> generation_paused kind="plan", разъём setModeRegenerator до 4.1,
> неточность теста R2 (каскад предвычислен createPlan); §12 — долги
> setPlanResumeExecutor / полного regenerateSubsection / confirm при
> skip закрыты, внесены долги regenerateModeSilent → 4.1 и
> внутрисекционного каскада → 2.3; 01 §4.5 — дубль «8.»; 03 §3.1/§3.2 —
> уточнения cancel/generation_paused (kind='plan', skipDegrades);
> 04 — факты rebuildDbMapping/refreshSumDef; заголовки фрагмента 2.2 —
> regeneration-service → generation-service.
>
> **Правки 2026-08-04 (итоги беседы 2.1)**: каскадный анализ и
> планировщик закрыты (39 ✓ ×2, сервис + HTTP §2.6); блок
> «По факту 2.1» (estimatedCost не хранится — живая оценка;
> статусы confirmed/pending; delete «modeKey:index»; полная
> пересборка updatePlan с carryOver; анти-цикл loadSynthesisLocal;
> async-каноникализация с getCanonicalizer()); §12 — долги
> canonicalSubsectionKey и wave-функций закрыты (getCanonicalizer
> в context-builder; estimateCascadeWaveCost/formatWaveCost в
> cost-estimator), внесён долг локальных портов
> режимов → 4.1; 04 §1.3 — пометка wave-функций переведена в факт.

> **Правки 2026-08-04 (итоги беседы 1.7)**: визуализация графа
> закрыта (84 ✓ ×2); блок «По факту 1.7» (дыра комплекта CSS,
> медиа-адаптация легенды по требованию запроса 9, квирк fuzzy
> typeColor, неточность R3-hex доревизии v10); §12 — долг «Экспорт
> графа MMD/PNG/JSON» → 4.2; 04 §3 — пути графовых компонентов
> приведены к client/components/graph/.

> **Правки 2026-08-04 (спецификации комплектов фаз 2–4)**: написаны
> девять `.spec` (2.1–4.3), комплекты пересобраны по именам
> (7631 → 10956 строк). В `scripts/extract-by-name.py` починены три
> дефекта, из-за которых он МОЛЧА не находил ничего после ~строки
> 16650 (кавычка без пары в строке), обрывал функцию на значении
> параметра по умолчанию (`opts = {}`) и не мог извлечь `auditCSS`
> (символьный класс регулярного выражения). Исправлена спека 1.6:
> правка беседы 1.6b стояла внутри `scope:` и не действовала —
> 174 строки disclosure-CSS в комплект не попадали. §10 дополнен
> правилом «правка спеки → пересборка → проверка кода возврата».

> **Правки 2026-08-03 (итоги беседы 1.6b)**: просмотр документа +
> каталог закрыты (63 ✓ ×3); блок «По факту 1.6b» (грабля
> dangerouslySetInnerHTML + hash-навигация → enrichSectionHtml,
> дыра спеки disclosure-CSS, SynthesisFull без userId, снапшот-пауза
> без модалки, минимальный actions-bar); §12 — маркеры TODO(1.6b)
> закрыты, внесён долг makeSectionCtxDisclosure → 2.3; spec фрагмента
> дополнен disclosure-CSS.

> **Правки 2026-08-02 (итоги беседы 1.6)**: транспорт чтения закрыт;
> parseSubsectionsFromHTML отнесён к generation-service; /:key/context —
> живой buildContextForSection; блок «По факту 1.6» (viewOnly,
> subsections из HTML, решения duplicate/DELETE); §12 — серверные
> маркеры TODO(1.6) закрыты. В 03: viewOnly в §3.1, решения
> duplicate/DELETE в §2.2, примечание per-IP в §3.4.

> **Правки 2026-07-27 (итоги беседы 1.4)**: сигнатура onDelta с инкрементом;
> _rebuildNodeColors/_rebuildEdgeStyles отнесены к клиенту (1.7); в 02 §2.3
> reasonKind += 'context-error'; в 04 §2.3 добавлены портированные функции
> 1.4 и FIX \w-бага updateDocTitleFromName [11886]; в 02 §2.15 — служебная
> строка '_genCommon'.
>
> **Ревизия 2026-07-29 (беседа 1.5)**: клиентская форма/прогресс;
> эндпоинты /syntheses/estimate и /syntheses/advice; код
> NO_PARTICIPANTS_SEED_REQUIRED в POST /syntheses.
> **Ревизия 2026-07-22**: протокол приведён к исходнику 26 024 стр. (v11):
> свободный синтез в валидации, модель стриминга _streamRespOnce, новая
> беседа 1.4b (Pause/Resume), parent-context в 1.2/1.3/3.1, Advisor v2 в 1.1.
> Спецификации подсистем v11 инлайнированы в 01-architecture §4.12–4.15.
>
> **Правки 2026-07-23 (итоги Фазы 0)**: удалён дубль беседы 1.4b (вариант
> docs/tz/); добавлена беседа 0.5 (password-change); в 0.4 добавлена задача
> useWebSocket; чек CSS-переменных 0.4 приведён к исходнику; в 5.3 добавлен
> routes/taxonomy.ts (дыра 0.3b).
>
> **Правки 2026-07-30 (аудит перед клиентскими беседами)**: проверены
> все 32 беседы. Беседа 1.6 расщеплена на серверную 1.6 и клиентскую
> 1.6b; 1.7 стала чисто клиентской, GET /categories перенесён из 5.1
> в 1.6. Назначены владельцы бесхозных модулей: routes/sections.ts и
> /sections/:key/context (1.6), routes/prompts.ts (6.1). Сняты
> инверсии 2.3←2.4 и 2.4←4.2. Пункт 1 беседы 3.2 переписан как
> дополнение пула, созданного в 1.5b. Исправлена нумерация в 2.4 и
> 6.1. Три идемпотентных скрипта: patch-docs-conv16-pre.py,
> patch-docs-conv23-pre.py, patch-docs-conv46-pre.py.
>
> Попутно узаконено фактическое: эндпоинты `POST /syntheses/estimate`
> и `POST /syntheses/advice` реализованы беседой 1.5 (03 §2.2 это
> фиксирует, протокол — не фиксировал).
>
> **Правка 2026-07-24 (итоги 0.5)**: добавлена беседа 0.6 (PATCH /auth/me +
> ProfilePage) — закрытие дыры A3 «отображаемое имя» и клиентского UI
> смены пароля; ветка в графе §11.
>
> **Правка 2026-07-24 (итоги 1.1)**: исправлено ожидание запроса 2 беседы 1.1
> (sum:tensions — патч transformative/generative, не comparative); беседа 2.1
> дополнена переносом estimateCascadeWaveCost/formatWaveCost (отложены из
> 1.1 — требуют cascade-analyzer) и реэкспортом sourceOf из topo-sort;
> в беседу 1.3 внесён канон applyBudgetPressure (перенос копии из
> cost-estimator, метка TODO(1.3) в коде).
>
> **Правка 2026-07-27 (итоги 1.3)**: беседа 1.3 — столбцы таблицы категорий
> приведены к промпту исходника (~10897, «Категория» + столбец уровня),
> из ожиданий глоссария убран столбец «Категория» (~8021 берёт два
> столбца), уточнён порог пережатия required 1.5×budget (~8419),
> extractContextFragment возвращает null, а не пустую строку (~8150);
> в первый запрос добавлены parent-context.ts и html-parser.ts;
> в беседу 2.4 добавлен context-quality.ts (дыра: модуль из 04 §2.1 и 05
> не создавался ни одной беседой) + ребро 2.3 ← 2.4 в §11.
>
> **Правка 2026-07-27 (итоги 1.2)**: groupPasses приведён к фактической
> сигнатуре исходника — groupPasses(defs), по одному разделу на проход,
> без effectiveDeps (первый запрос и тест беседы 1.2); ориентир длины
> buildSYS в тесте исправлен на факт исходника (3192 симв.).

## 1. Общие принципы работы с контекстом

### 1.1. Не загружать всё — загружать нужное

Полный `philosynth.html` — 1.3 МБ (~330K токенов, 26 024 строки). Семь проектных документов — ещё ~230 КБ. Это неэффективно: модель тратит внимание на тысячи строк CSS, HTML-разметки и Three.js-рендеринга, когда задача — написать Drizzle-миграцию.

**Правило**: в каждую беседу загружать **только то, что нужно для конкретных задач этой беседы**. Проектные документы — да, все 6 (они компактные и дают общий контекст). Исходный файл — только релевантные фрагменты.

### 1.2. Как определить, какие фрагменты исходника нужны

Документ `04-code-reuse-map.md` содержит точные номера строк для каждой функции и каждого модуля. Перед беседой:

1. Определить задачи беседы (из `06-dev-strategy.md`)
2. Найти целевые модули (из `05-file-structure.md`)
3. Найти строки исходника (из `04-code-reuse-map.md`)
4. Извлечь функции: `grep -n 'function NAME' philosynth.html` → определить диапазон → `sed -n 'START,ENDp' philosynth.html > fragment.txt`

### 1.3. Структура каждой беседы

```
[Первый запрос]
├── Контекст: проектные документы + фрагменты исходника
├── Формулировка: что сделать, какие файлы создать
└── Ограничения: что НЕ делать в этой беседе

[Запросы 2–N: итерация]
├── Компиляция / запуск → ошибки → исправление
├── Тестирование → доработка
└── Интеграция с ранее созданными модулями

[Финальный запрос]
└── Ревью: покрытие, edge cases, TODO для следующих бесед
```

### 1.4. Межсессионные зависимости

Каждая беседа после Фазы 0 зависит от файлов, созданных в предыдущих. Эти файлы нужно загружать как контекст. Правило:

- **Серверные модули** (services, utils) — загружать файлы, от которых зависит текущий модуль (импорты)
- **Роуты** — загружать сервис, который роут вызывает
- **Клиентские компоненты** — загружать типы из `shared/types/`, API-клиент, хуки
- **Никогда** не загружать файлы, которые не импортируются текущим модулем

---

### Готовые комплекты вложений

Ручное извлечение по grep-командам бесед автоматизировано:
`python3 scripts/extract-fragments.py philosynth.html fragments/`
> **ЗАМЕНЁН (2026-07-31):** скрипта `scripts/extract-fragments.py` в
> репозитории нет (шапки старых фрагментов на него ещё ссылаются —
> это исторический след). Вместо него —
> **`scripts/extract-by-name.py`**: он ищет объявления ПО ИМЕНАМ из
> карты `04-code-reuse-map.md` и сам вычисляет границы по балансу
> скобок, поэтому спецификация не устаревает при правке исходника, а
> номера строк появляются в готовом фрагменте как результат поиска.
>
> ```bash
> python3 scripts/extract-by-name.py ПУТЬ.spec [-o ФАЙЛ] [--check]
> ```
> Виды целей: `js:имяФункции`, `var:ИМЯ`, `css:.селектор`,
> `css*:.префикс` (все правила с префиксом), `html:#id`,
> `scope:начало..конец` (сузить область поиска двумя якорями),
> `lines:A-B` (только там, где именованного якоря нет).
> Образцы спецификаций — `docs/fragments-for-conversations/*.spec`.
>
> **Статус (2026-08-04):** спецификации есть у комплектов 1.6, 1.7 и
> ВСЕХ бесед фаз 2–4 (2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 4.1, 4.2, 4.3) —
> эти комплекты собираются по именам и пересобираются одной командой.
> Комплекты Фазы 0 и бесед 1.1–1.5b пока нарезаны по баннерам: их
> имеет смысл переводить на спеки по мере надобности, а не разом.
> Пересборка всех спек и проверка идемпотентности:
>
> ```bash
> for s in docs/fragments-for-conversations/*.spec; do
>   python3 scripts/extract-by-name.py "$s" || echo "FAIL $s"
> done
> ```
>
> Две ловушки сборщика, известные по фазам 2–4:
> — правила из `@media` вынимаются БЕЗ обёртки (мобильные и светлые
>   переопределения стали бы безусловными) — медиаблоки берутся
>   диапазоном целиком, а `css*:` сужается якорями `scope:`
>   (образец — `3.2-genealogy-ui.spec`);
> — одноимённые функции: в исходнике два `truncLabel`, и вложенный в
>   `buildModesExportSection` записан с литералом `"\u2026"` вместо
>   символа «…» — в генерируемом файле это ВАЛИДНЫЙ JS-литерал и
>   рендерится многоточием (формулировка «печатает
>   escape-последовательность» из прежней ревизии была преувеличена;
>   уточнено 4.2) — нужный выбирается через `scope:`
>   (образец — `4.1-mode-service.spec`).
>
> (Прежняя пометка «**ВНИМАНИЕ (2026-07-30):** скрипта
> `scripts/extract-fragments.py` в репозитории НЕТ» снята этим патчем;
> строка сохранена, чтобы повторный прогон patch-docs-conv16-pre.py
> не вписал её заново.)
генерирует по файлу на беседу (fragments/1.1-synthesis-engine.js и т.д.)
с заголовками-диапазонами строк оригинала. При обновлении исходника —
перегенерировать. grep-команды в беседах остаются документацией того,
ЧТО входит в комплект, и ориентиром для точечной сверки.

## 2. Протокол Фазы 0: Инфраструктура

### Беседа 0.1: Скелет монорепозитория + БД

**Контекст для загрузки:**
- `01-architecture.md` (стек, компоненты)
- `02-data-model.md` (все таблицы)
- `05-file-structure.md` (дерево каталогов)
- Исходник: **ДА, фрагменты констант**:
  - `STATE` (объект: PH — список философов с группировкой по эпохам, ML, SL, DL, REVERSE_*)
  - `KEY_LABELS`, `SECTION_LABELS`, `ALL_CTX_KEYS`, `CTX_LABELS`
  - `PHIL_FILENAME` (транслитерация имён)
  - `METHOD_CODE`, `LEVEL_CODE`, `ORDER_CODE`, `DEPTH_CODE`

**Извлечение фрагментов перед беседой:**
```bash
grep -n 'const ML\|const KEY_LABELS\|const CTX_LABELS\|const PHIL_FILENAME\|const METHOD_CODE' philosynth.html | head -10
# v11: STATE и ALL_CTX_KEYS удалены; философы — из чекбоксов формы:
grep -n 'checkbox-item' philosynth.html | head -3
# Извлечь каждый блок от начала до закрывающей };
```

**Первый запрос:**
```
Создай скелет монорепозитория PhiloSynth Service.

Прикреплённые файлы — проектные документы: архитектура, модель данных, файловая структура.

Задачи этой беседы:
1. Инициализация workspace (package.json root + packages/shared, server, client)
2. tsconfig.base.json + tsconfig для каждого пакета
3. docker-compose.yml (PostgreSQL 16 + Redis 7)
4. .env.example с переменными из архитектуры
5. Drizzle ORM: полная схема БД (ВСЕ таблицы из 02-data-model.md, включая v10-поля:
      ext_graph_metrics, structure_sections в syntheses;
      clarity, breadth, depth_score, applicability в categories;
      innovation_degree, context_dependency в category_edges)
   — файл server/db/schema.ts
6. drizzle.config.ts
7. server/db/index.ts (подключение)
8. Начальная миграция

НЕ делай в этой беседе: auth, роуты, клиент, WebSocket.

Стек: TypeScript, Hono, Drizzle ORM, PostgreSQL 16, Redis 7.
```

**Последующие запросы:**
- «Запусти `docker compose up -d` и `npx drizzle-kit push` — покажи результат. Проверь, что все 26+ таблиц создались (включая поля v11 из 02-data-model: keep_full_budget, parent_context_schema, paused_state; budget_mode/parent_spec в context_log): `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`»
- «Создай shared/types/ — все 11 файлов типов из файловой структуры (synthesis.ts, section.ts, graph.ts, elements.ts, lineage.ts, edit-plan.ts, generation.ts, modes.ts, billing.ts, prompts.ts, ws-messages.ts). Каждый тип должен соответствовать полям из schema.ts»
- «Создай shared/constants/ — все файлы: philosophers.ts (106 позиций; в исходнике v11 список живёт в чекбоксах формы и PHIL_FILENAME — STATE.PH больше нет, извлекать из них), labels.ts (ML, SL, DL, REVERSE_*), section-labels.ts (KEY_LABELS), ctx-keys.ts (CTX_LABELS; ALL_CTX_KEYS удалён — перечень ключей выводится из CTX_LABELS), phil-filename.ts, methods.ts, cardinality.ts (participantCardinality, participantWord/Sg)»
- «Проверь согласованность: типы в shared/types/ ↔ схема в server/db/schema.ts ↔ константы в shared/constants/. Нет ли полей, которые есть в схеме, но отсутствуют в типах? Нет ли enum-значений, которые не покрыты константами?»
- «Проверь, что `tsc --noEmit` проходит для shared/ и server/ без ошибок»
- «Edge case: убедись, что schema.ts содержит правильные ON DELETE (CASCADE для секций, SET NULL для lineage.parent_synthesis_id). Проверь все UNIQUE-constraints и индексы»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 0.2: Auth + Hono-каркас + WebSocket

**Контекст:**
- `01-architecture.md` (секция Auth, секция WebSocket)
- `03-specification.md` (секции 2.1 Auth, 3.x WebSocket)
- `05-file-structure.md`
- Из предыдущей беседы: `server/db/schema.ts`, `shared/types/ws-messages.ts`
- Исходник: НЕ НУЖЕН

**Первый запрос:**
```
Продолжаю разработку PhiloSynth Service. Прикреплены: архитектура, спецификация, 
файловая структура, и файлы из предыдущей сессии (db/schema.ts, shared/types/).

Задачи:
1. server/index.ts — Hono app с CORS, JSON middleware
2. Lucia Auth: server/middleware/auth.ts 
   — регистрация, логин, logout, GET /me
   — сессии в PostgreSQL (таблица sessions из schema.ts)
3. server/routes/auth.ts — роуты из спецификации (секция 2.1)
4. server/ws/handler.ts — WebSocket upgrade, ping/pong, типизация сообщений
5. server/ws/connection-manager.ts — управление подключениями
6. server/middleware/rate-limiter.ts — Redis-based

Формат ответов API — из спецификации. Коды ошибок — из секции 4.3.
```

**Последующие запросы:**
- «Запусти сервер и протестируй полный auth-цикл: POST /auth/register с email+password → 201, POST /auth/login → 200 + cookie, GET /auth/me → user object, POST /auth/logout → cookie удалён, GET /auth/me → 401. Покажи curl-команды и ответы»
- «Протестируй валидацию: POST /auth/register с пустым email → ошибка VALIDATION_ERROR. Регистрация с существующим email → 409. Логин с неверным паролем → 401»
- «Протестируй WebSocket: подключись через wscat, отправь {"type":"ping"} → ответ {"type":"pong"}. Отправь невалидный JSON → соединение не рвётся, ошибка логируется»
- «Протестируй rate-limiter: отправь 100 запросов за 10 секунд → после лимита ответ 429 с retryAfter. Проверь, что лимит сбрасывается через указанное время»
- «Протестируй WebSocket с auth: подключение без токена → reject. Подключение с валидным токеном → accept. Подключение с expired токеном → reject»
- «Edge case: два одновременных WebSocket-подключения от одного пользователя — оба работают (connection-manager хранит Set, не одно значение)»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 0.3: Seed-скрипты + Prompt Registry

**Контекст:**
- `01-architecture.md` (секция 4.1 Prompt Registry)
- `04-code-reuse-map.md` (секция 1.1–1.5 — какие объекты извлекать)
- `server/db/schema.ts`
- Исходник: **ДА, но только фрагменты**:
  - CONTEXT_DEPS_BASE … SUBSTITUTION_MAP_GENETIC (все конфиг-объекты зависимостей и подстановок)
  - COMPAT_MATRIX_COMPACT (матрица совместимости)
  - INTRA_DEPS, SUBSECTION_TO_CTX_KEYS, TOPOLOGY_ROLES_PROCEDURAL
  - buildSYS(), METHOD_SUM … METHOD_DIALOGUE, LEVEL_* (системный промпт и промпты методов/уровней)
  - buildSectionDefs(), serializeParts() (структура промптов разделов)

**Извлечение фрагментов перед беседой:**
```bash
# Извлечь конфиги: INTRA_DEPS … SUBSTITUTION_MAP
grep -n 'INTRA_DEPS' philosynth.html | head -1  # найти начало, затем извлечь блок
# Извлечь COMPAT_MATRIX_COMPACT
grep -n 'COMPAT_MATRIX_COMPACT' philosynth.html | head -1  # найти начало, затем извлечь блок
# Извлечь buildSYS … LEVEL_*
grep -n 'function buildSYS' philosynth.html | head -1  # найти начало, затем извлечь блок
# Извлечь buildSectionDefs … patchPromptsWithSecCtx
grep -n 'function buildSectionDefs' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Продолжаю PhiloSynth Service. Прикреплены: архитектура (секция Prompt Registry),
карта переиспользования, db/schema.ts, и фрагменты исходника.

Задачи:
1. scripts/seed-prompts.ts — скрипт, который:
   a. Извлекает ВСЕ промптовые шаблоны из исходника (METHOD_SUM, METHOD_GRAPH, 
      METHOD_TOPOLOGY, METHOD_GLOSSARY, METHOD_THESES, METHOD_DIALOGUE — для каждого 
      из 6 методов; LEVEL_*; buildSYS; buildQualityReinforcement; mode prompts)
   b. Преобразует каждый в запись prompt_templates с ключом вида 
      "method.dialectical.graph", "level.transformative.graph_methodology", "system"
   c. Заменяет захардкоженные значения на плейсхолдеры {{participants}}, {{method_label}} и т.д.
   d. Включает STOP_SIGNAL в конец каждого шаблона раздела (v10)
   e. Вставляет в БД

2. scripts/seed-configs.ts — скрипт, который:
   a. Извлекает все конфиг-объекты: CONTEXT_DEPS_BASE, CONTEXT_DEPS_GENETIC, 
      CONTEXT_DEPS_LEVEL, CONTEXT_DEPS_LEVEL_GENETIC, CONTEXT_DEPS_METHOD
      (бывш. LEVEL/METHOD_DEPS_PATCH), SUBSTITUTION_MAP, SUBSTITUTION_MAP_GENETIC,
      PARENT_DEPS_BASE/GENETIC/LEVEL/LEVEL_GENETIC/METHOD, PARENT_INTRA_DEPS,
      PARENT_FIELD_ORDER/LABELS, MD_BY_CARD, SD_BY_CARD, MODE_DEPS,
      COMPAT_MATRIX_COMPACT, INTRA_DEPS, SUBSECTION_TO_CTX_KEYS, TOPOLOGY_ROLES_PROCEDURAL,
      FRAGMENT_SHARE, CONTEXT_BUDGET
   b. Вставляет как JSON в synthesis_configs
   Дополнительно: _EXTRA_CATEGORY_TYPES, _EXTRA_EDGE_TYPES,
   _SYNTH_LEVEL_TYPE_PHRASING → в synthesis_configs

   Для извлечения _EXTRA_* и _buildExtraTypesBlock нужен фрагмент исходника:
   ```bash
   grep -n '_EXTRA_CATEGORY_TYPES\|_EXTRA_EDGE_TYPES\|_SYNTH_LEVEL_TYPE_PHRASING\|function _buildExtraTypesBlock' philosynth.html
   ```

3. server/services/prompt-registry.ts:
   - getTemplate(key): читает из Redis-кэша, fallback на БД
   - renderTemplate(key, vars): подставляет переменные
   - getConfig(key): аналогично для конфигов
   - invalidateCache(key): сброс кэша при обновлении
   - listVersions(key), activateVersion(key, version)

Фрагменты исходника прикреплены — используй их для извлечения точных текстов шаблонов.
```

**Последующие запросы:**
- «Запусти seed-prompts.ts — сколько шаблонов создано? Покажи `SELECT count(*) FROM prompt_templates` и `SELECT key, version, is_active, length(body) as body_len FROM prompt_templates WHERE is_active = true ORDER BY key LIMIT 30`»
- «Проверь содержимое: вызови getTemplate("method.dialectical.graph") — содержит ли плейсхолдеры {{participants}}, {{method_label}}? renderTemplate с тестовыми переменными — плейсхолдеры заменены?»
- «Запусти seed-configs.ts — проверь все конфиги: getConfig("context_deps.base") возвращает объект с ключами graph, glossary, theses и т.д., каждый с required/optional массивами?»
- «Протестируй кэширование: getTemplate("system") → первый вызов — из БД (лог запроса). Второй вызов — из Redis (нет лог запроса к БД). invalidateCache("system") → третий вызов — снова из БД»
- «Протестируй версионирование: создай вторую версию шаблона "system" → activateVersion("system", 2) → getTemplate возвращает новую версию → activateVersion("system", 1) → возврат к старой»
- «Edge case: getTemplate для несуществующего ключа → понятная ошибка, не crash. getConfig для несуществующего ключа → аналогично»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 0.3b: Seed Taxonomy (каталоги типов)

**Контекст для загрузки:**
- `02-data-model.md` (таблицы category_type_catalog, relationship_type_catalog)
- `server/db/schema.ts` (из 0.1)
- Исходник: **ДА, фрагмент** `_EXTRA_CATEGORY_TYPES`, `_EXTRA_EDGE_TYPES` — для `_buildExtraTypesBlock()`, портируемой в `element-taxonomy.ts` или `extra-types.ts`

**Первый запрос:**
```
Создаю скрипт заполнения каталогов типов категорий и связей.

Прикреплены: модель данных (таблицы category_type_catalog, relationship_type_catalog), schema.ts.

Задачи:
1. scripts/seed-taxonomy.ts:
   a. Заполняет category_type_catalog 18 типами категорий:
      ontological/Онтологическая, epistemological/Эпистемологическая,
      axiological/Аксиологическая, ethical/Этическая, aesthetic/Эстетическая,
      metaphysical/Метафизическая, logical/Логическая, practical/Практическая,
      political/Политическая, theological/Теологическая,
      anthropological/Антропологическая, social/Социальная,
      linguistic/Лингвистическая, phenomenological/Феноменологическая,
      existential/Экзистенциальная, analytical/Аналитическая,
      hermeneutical/Герменевтическая, cross_disciplinary/Междисциплинарная
   b. Заполняет relationship_type_catalog 29 типами связей:
      hierarchical, causal, dialectical, correlational, disjunctive,
      conjunctive, contradiction, complementary, emergence,
      necessary_condition, sufficient_condition, identity, analogy,
      implementation, instantiation, generalization, part_whole,
      means_end, deductive, inductive, abductive, temporal, conceptual,
      definitional, manifestation, foundational, recognition, reflexion,
      development — каждый с русским названием и описанием
   c. Все записи с is_system=true

2. server/services/element-taxonomy.ts:
   - getCategoryTypes(): список из БД + Redis-кэш
   - getRelationshipTypes(): аналогично
   - normalizeType(text, kind): маппинг свободного текста на ближайший тип из каталога
     (fuzzy match по русскому и английскому названию)
   - createCustomType(key, nameRu, description, kind, userId): пользовательский тип
```

**Последующие запросы:**
- «Запусти seed-taxonomy.ts — проверь: SELECT count(*) FROM category_type_catalog (должно быть 18), SELECT count(*) FROM relationship_type_catalog (должно быть 29)»
- «Протестируй normalizeType("диалектическая", "relationship") → match: { key: "dialectical", nameRu: "Диалектическая" }»
- «Протестируй normalizeType("причинно-следственная", "relationship") → match: { key: "causal" }»
- «Протестируй normalizeType("странный_тип_42", "category") → match: null, suggestions: [ближайшие по Levenshtein]»
- «Протестируй createCustomType → новая запись с is_system=false, created_by заполнен»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 0.4: Каркас клиента

**Контекст:**
- `05-file-structure.md` (секция client/)
- `01-architecture.md` (обзор)
- Исходник: первые ~3100 строк (CSS — **только** для извлечения цветовой палитры и дизайн-системы)

**Извлечение:**
```bash
# Только CSS-переменные и ключевые стили (не весь CSS)
grep -n 'var(--' philosynth.html | head -50 > frag-css-vars.txt
head -200 philosynth.html >> frag-css-vars.txt  # первые ~200 строк: CSS-переменные
```

**Первый запрос:**
```
Создай каркас клиента PhiloSynth Service.

Задачи:
1. Vite + React 19 + TypeScript
2. tailwind.config.ts — кастомные цвета из дизайн-системы исходника 
   (см. CSS-фрагмент: --gold, --gold-light, --ink, --off, --violet и т.д.;
   «parchment» проектных доков = --off исходника)
3. globals.css с CSS-переменными
4. React Router: маршруты Login, Register, Catalog, CreateSynthesis, 
   Synthesis/:id, Import, Billing, AdminPrompts
5. Layout.tsx с Header, Sidebar
6. Заглушки всех страниц
7. stores/auth-store.ts (Zustand): user, login(), logout()
8. api/client.ts: fetch-обёртка с cookie auth, error handling
9. hooks/useWebSocket.ts: типизированный WS-хук (shared/types/ws-messages)
   с reconnect и keep-alive ping — беседы 1.4/1.5 загружают его «из 0.4»

НЕ делай: реальные компоненты, граф, редактирование. Только скелет навигации.
```

**Последующие запросы:**
- «Запусти `npm run dev` — клиент стартует без ошибок? Открой в браузере — Layout рендерится, навигация между страницами работает?»
- «Протестируй auth-store: вызови login() → запрос к POST /auth/login → при успехе user сохраняется в store, при ошибке — error. logout() → POST /auth/logout → user = null. При перезагрузке страницы — GET /auth/me восстанавливает сессию»
- «Протестируй api/client.ts: запрос к защищённому эндпоинту без сессии → redirect на /login. Запрос с сессией → данные. Ответ 500 → error обрабатывается, не crash»
- «Проверь CSS-переменные: цвета --gold (#b8860b), --gold-light (#d4a017), --ink (#1a1814), --off (#f2f0eb; в доках «parchment» — допустим алиас --parchment: var(--off)), --violet (#6b00aa) из исходника присутствуют в globals.css и используются в tailwind.config.ts?»
  <!-- правка 2026-07-23: прежний чек называл #d4a017 «--gold» (это --gold-light)
       и требовал --parchment, которого в исходнике нет (= --off) -->
- «Проверь паритет оформления: `python3 scripts/css-parity-audit.py` — раздел A (непокрытые правила исходника) и раздел B (расхождения в совпавших правилах) обязаны быть нулевыми, раздел C — только унаследованный `gm-hint`»
- «Проверь responsive: Layout на мобильных (< 768px) — Sidebar скрыт или бургер-меню. Header адаптивный»
- «Проверь, что все маршруты из React Router имеют заглушки (не белый экран): /login, /register, /catalog, /synthesis/new, /synthesis/:id, /import, /billing, /admin/prompts»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 0.5: Смена пароля (A3)

> Добавлена правкой 2026-07-23: требование A3 «смена пароля» (03-spec §1.1,
> MVP) не имело эндпоинта в §2.1 и беседы в протоколе (дыра, зафиксирована
> в итогах 0.2). Сброс пароля по email (A2a) перенесён в Фазу 3 —
> требует почтовой инфраструктуры.

**Контекст:**
- `03-specification.md` §2.1 (POST /auth/password-change)
- Из предыдущих бесед: `server/middleware/auth.ts`, `server/routes/auth.ts` (из 0.2), `server/db/schema.ts`
- Исходник: НЕ НУЖЕН

**Первый запрос:**
```
Добавь в routes/auth.ts эндпоинт POST /auth/password-change
{ currentPassword, newPassword }:
1. requireAuth; verifyPassword(currentPassword) — при несовпадении
   401 AUTH_REQUIRED (единый ответ, анти-enumeration, как в login)
2. newPassword ≥ 8 символов, иначе VALIDATION_ERROR + details
3. Обновить password_hash; инвалидировать все сессии пользователя,
   КРОМЕ текущей (защита от угнанных сессий)
4. → { ok: true }
```

**Последующие запросы:**
- «Протестируй: смена с верным текущим паролем → 200; вход по новому паролю работает, по старому — 401»
- «Протестируй: прочие сессии пользователя инвалидированы, текущая жива»
- «Edge cases: неверный currentPassword → 401; newPassword короче 8 → VALIDATION_ERROR + details»

**Завершение беседы:**
- Стандартный блок (компиляция, интеграция, ревью)

---

### Беседа 0.6: Профиль пользователя (A3: отображаемое имя + UI смены пароля)

> Добавлена правкой 2026-07-24: серверная половина A3 (password-change)
> реализована в 0.5, но смена displayName не имела эндпоинта в §2.1,
> а клиентский UI профиля — включая форму смены пароля — отсутствовал
> в 05/07 (дыра, зафиксирована в итогах 0.5).

**Контекст:**
- `03-specification.md` §2.1 (PATCH /auth/me, POST /auth/password-change)
- Из предыдущих бесед: `server/routes/auth.ts` (0.2/0.5),
  `server/middleware/auth.ts` (0.2); клиент 0.4: `api/client.ts`,
  `stores/auth-store.ts`, `App.tsx`, `components/layout/*` (ссылка на
  профиль), Login/RegisterPage как образец форм
- Исходник: НЕ НУЖЕН

**Первый запрос:**
```
1. Добавь в routes/auth.ts эндпоинт PATCH /auth/me { displayName }:
   requireAuth; displayName — строка, trim; пустая строка → null;
   длина > 100 → VALIDATION_ERROR + details.displayName;
   → { user } (полный, как GET /auth/me)
2. Создай client/src/pages/ProfilePage.tsx (маршрут /profile;
   ссылка — имя/email пользователя в Header):
   секция «Профиль» — email (read-only), displayName + «Сохранить»;
   секция «Смена пароля» — currentPassword/newPassword/повтор,
   POST /auth/password-change; отображение details по полям,
   401 → «Неверный текущий пароль»; при успехе — уведомление
   «Пароль изменён; прочие сессии завершены»
3. Расширь stores/auth-store.ts: updateProfile(displayName),
   changePassword(current, next) — user в store обновляется
```

**Последующие запросы:**
- «Протестируй PATCH /auth/me: смена displayName видна в GET /auth/me;
  пустая строка → null; длина > 100 → VALIDATION_ERROR + details;
  без сессии → 401»
- «Браузерный тест ProfilePage (по паттерну test-04-*): обе формы
  работают, ошибки полей отображаются, user в шапке обновился»

**Завершение беседы:**
- Стандартный блок (компиляция, интеграция, ревью)

---

## 3. Протокол Фазы 1: MVP

### Беседа 1.1: Synthesis Engine — ядро

**Контекст:**
- `01-architecture.md` (секция 4.2 Synthesis Engine)
- `04-code-reuse-map.md` (секция 1.1–1.3)
- `server/services/prompt-registry.ts` (из 0.3)
- `server/db/schema.ts`
- `shared/types/synthesis.ts`
- Исходник: deepMergeUniq … resolveCircularDeps + computeSectionRating … estimateModeCost

**Извлечение:**
```bash
# Извлечь deepMergeUniq … resolveCircularDeps
grep -n 'function deepMergeUniq' philosynth.html | head -1  # найти начало, затем извлечь блок
# Извлечь computeSectionRating … estimateModeCost
grep -n 'function computeSectionRating' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Портирую ядро Synthesis Engine в TypeScript.

Прикреплены: архитектура, карта переиспользования, prompt-registry.ts, schema.ts, 
типы, и фрагмент исходника (deepMergeUniq … estimateModeCost (всё ядро engine)).

Создай файлы:
1. server/services/synthesis-engine.ts:
   - resolveContextDeps(params) — из resolveContextDeps()
   - deepMergeUniq() — из deepMergeUniq()
   - buildEffectiveDeps() — из buildEffectiveDeps()
   - findSubstitute() — из findSubstitute()
   - getSubstituteQuality() — из getSubstituteQuality()
   - getActiveSubstitutionMap() — из getActiveSubstitutionMap()
   Все конфиги (CONTEXT_DEPS_BASE и т.д.) читаются через prompt-registry.getConfig()

2. server/utils/topo-sort.ts:
   - computePredecessors() — из computePredecessors()
   - топологическая сортировка — инлайнена внутри buildDynamicOrder (Кан);
     выделить в отдельную функцию при портировании
   - buildDynamicOrder() — из buildDynamicOrder()
   - resolveCircularDeps() — из resolveCircularDeps()

3. server/services/compat-advisor.ts:
   - computeSectionRating() — из computeSectionRating()
   - Advisor v2: getCompatEntryByKey() (entry-модель level:method, severity),
     iconForSeverity/titleForSeverity/chipClassForRating
     (computeOverallCompat/computeMethodRating/getCompatAdvice удалены в v11)
   - computeSectionWarnings()/updateSectionWarnings() — живые предупреждения
   Матрица читается через getConfig("compat_matrix")

4. server/services/cost-estimator.ts:
   - estimateCost() — из estimateCost()
   - estimateSubsectionCost() — из estimateSubsectionCost()
   - estimateModeCost() — из estimateModeCost()

Логика порт 1:1, но:
- Все конфиги читаются из Prompt Registry (не хардкод)
- Типизация TypeScript (параметры, возвращаемые значения)
- async где нужно (чтение из Registry — async)
```

**Последующие запросы:**
- «Напиши юнит-тест: resolveContextDeps с params = { method: "dialectical", synthLevel: "comparative", sections: ["graph","glossary","theses"] } — проверь, что graph получает required: ["sum:goals"] (BASE без патчей), а при synthLevel: "transformative" — required: ["sum:goals", "sum:tensions"] (sum:tensions добавляет уровне-патч transformative/generative, НЕ comparative; сверено с исходником в 1.1)»
- «Проверь, что buildDynamicOrder корректно обрабатывает циклические зависимости — создай тест с graph → theses → graph (resolveCircularDeps должна разорвать цикл)»
- «Проверь estimateCost с глубиной "exhaustive" — результат должен быть ~2x от "standard". Проверь с 6 разделами vs 3 — стоимость пропорциональна»
- «Протестируй findSubstitute: sections=["graph","theses"] (нет glossary) — для тезисов, которые зависят от glossary:table, findSubstitute должен найти замену (если настроено в SUBSTITUTION_MAP). Проверь getSubstituteQuality — возвращает 1/2/3»
- «Протестируй getCompatEntryByKey("generative:creative") — entry содержит rating, severity, desc, чипы по разделам? computeSectionWarnings для sections=["theses"] без graph/glossary — предупреждения содержат недостающие источники и активные подстановки?»
- «Edge case: resolveContextDeps с пустым sections=[] — не должно crash. computePredecessors с одним разделом — корректный результат»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 1.2: Prompt Builder + Section Defs

**Контекст:**
- `server/services/prompt-registry.ts`
- `server/services/synthesis-engine.ts` (из 1.1)
- `shared/constants/labels.ts`
- Исходник: buildSYS … buildSectionDefs (вся промптовая система)

**Извлечение:**
```bash
# Извлечь buildSYS … buildSectionDefs (вся промптовая система)
grep -n 'function buildSYS' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Портирую систему сборки промптов.

Прикреплён фрагмент исходника (buildSYS … buildSectionDefs (вся промптовая система)): buildSYS, METHOD_*, LEVEL_*, 
buildSectionDefs, serializeParts, baseCtx, buildQualityReinforcement, groupPasses.

Создай:
1. server/services/prompt-builder.ts:
   - buildSYS(params) — buildSYS(). Читает шаблон "system" из Registry
   - baseCtx(p, sectionKey) = baseCtxStatic(p) + baseCtxParents(p, sectionKey)
     — параметры из аргумента; родительский блок пер-секционный (v11)
   - participantsForPrompt(p) — плейсхолдер «[свободный синтез: …]» при 0 участников
   - выбор веток шаблонов по participantCardinality(p): MD_BY_CARD/SD_BY_CARD
     из Registry (md_by_card/sd_by_card)
   - buildQualityReinforcement(params) — patchPromptsWithSecCtx()

   - STOP_SIGNAL: константа, добавляемая в конец каждого промпта раздела.
     Определить в prompt-builder.ts. Текст: «СТОП: после завершения указанного
     раздела ПРЕКРАТИ генерацию. НЕ переходи к следующим разделам.»
   - _buildExtraTypesBlock(method, synthLevel, kind): функция, расширяющая
     список типов категорий/связей в промпте в зависимости от метода.
     Читает _EXTRA_CATEGORY_TYPES / _EXTRA_EDGE_TYPES из Registry (seed-configs).

2. server/services/section-defs-builder.ts:
   - buildSectionDefs(params) — buildSectionDefs(). Каждый промпт читается из Registry:
     registry.getTemplate("method.dialectical.graph") вместо METHOD_GRAPH[...]
   - serializeParts(parts) — serializeParts()
   - groupPasses(defs) — как в исходнике: по одному разделу на проход
     (последовательная генерация). effectiveDeps НЕ принимает: порядок
     разделов определяется раньше — buildDynamicOrder (беседа 1.1)
   - patchPromptsWithSecCtx(defs, secCtx) — patchPromptsWithSecCtx()

Ключевое изменение: buildSectionDefs в исходнике содержит ~500 строк захардкоженных 
промптов. В сервисе каждый промпт — вызов registry.getTemplate(key). 
Структура ключей: "section.{sectionKey}.preamble", "method.{method}.{sectionKey}", 
"level.{level}.{aspect}".
```

**Последующие запросы:**
- «Протестируй baseCtx: результат НЕ содержит строку ВЫБРАННЫЕ РАЗДЕЛЫ (убрана). Содержит: ЗЕРНО, ФИЛОСОФЫ/КОНЦЕПЦИИ, МЕТОД, УРОВЕНЬ, ГЛУБИНА, КОНТЕКСТ (если есть). Для мета-синтеза: РЕЖИМ МЕТА-СИНТЕЗ + блок контекста концепций.»
- «Протестируй buildSYS: вызови с params = { method: "dialectical", synthLevel: "comparative", depth: "standard", phil: ["Кант","Гегель"] } — результат содержит имена философов? Длина ~3200 символов (факт исходника: 3192 для этого набора параметров; критерий — байтовое равенство с buildSYS исходника)?»
- «Протестируй buildSectionDefs: params с sections=["sum","graph","glossary","theses"] — возвращает 4 def-объекта? Каждый имеет key, num, title, prompt? prompt содержит текст из Registry (не пустой)?»
- «Протестируй groupPasses: defs с 6 разделами (их порядок уже задан buildDynamicOrder, где graph зависит от sum) — по одному разделу на проход; sum и graph попадают в разные проходы (sum — раньше)?»
- «Протестируй patchPromptsWithSecCtx: добавь secCtx = { graph: "Сделать акцент на этику" } — промпт graph содержит этот текст?»
- «Протестируй baseCtx: результат содержит все параметры в правильном формате — метод, уровень, глубина, зерно, философы?»
- «Edge case: buildSectionDefs для метода "creative" + уровня "generative" — все шаблоны найдены в Registry? Нет ли missing template ошибок?»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 1.3: Context Builder (DOM → БД)

**Контекст:**
- `01-architecture.md` (секция 4.3 Context Builder)
- `server/db/schema.ts` (таблицы sections, categories, theses, glossary_terms)
- `server/services/synthesis-engine.ts` (из 1.1)
- Исходник: extract*() + buildContextForSection

**Извлечение:**
```bash
# Извлечь extract*() + buildContextForSection
grep -n 'function extractSection' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Адаптирую контекстную подсистему: buildContextForSection и extract-функции.

В исходнике (прикреплён, extract*() + buildContextForSection) эти функции работают с DOM: 
el.querySelector('[data-section="Таблица категорий"]'). В сервисе — запросы к БД.

Создай:
1. server/services/context-builder.ts:
   - buildContextForSection(sectionKey, synthesisId, depth, effectiveDeps, resolvedDeps)
     Аналог buildContextForSection(). Вместо `generated` (map key→DOM element) — 
     запросы к таблицам sections, categories, theses, glossary_terms.
     Бюджетирование (CONTEXT_BUDGET, FRAGMENT_SHARE) — через getConfig().
     Сюда же — КАНОН applyBudgetPressure() (пол 40%, 01-arch §4.13 ч. II)
     и parentOverheadForSection(): в cost-estimator.ts (беседа 1.1) живёт
     временная ПРИВАТНАЯ копия applyBudgetPressure с меткой TODO(1.3) —
     после создания канона переключить cost-estimator на импорт отсюда
     и удалить копию (проверка приватности+метки — integration-check 4h).

2. server/services/context-extractor.ts:
   - extractContextFragment(fragmentKey, synthesisId): 
     Диспетчер, вызывающий нужную функцию по ключу.
   - extractSummaryGoals(synthesisId) — из таблицы sections WHERE key='sum', 
     парсинг HTML через linkedom
   - extractGraphNodesTable(synthesisId) — из таблицы categories (SELECT + форматирование)
   - extractGraphEdges(synthesisId) — из category_edges
   - extractGlossaryTable(synthesisId) — из glossary_terms
   - extractThesesSummary(synthesisId) — из theses
   - ... остальные extract-функции

3. server/utils/text.ts: truncateText(), tableToText() — из truncateText()

4. server/services/parent-context.ts (04 §1.10; ни одна беседа 07 его не создавала, хотя parentOverheadForSection и parentSpec в ctxLog без него не собираются):
   - resolveParentDeps(), resolveParentDepsForSubsection() — 4-слойное слияние карт parent_deps.* из Registry тем же deepMergeUniq;
   - parentFieldsUsedFor(), buildParentSpecForLog() — spec для ctxLog;
   - validateParentDeps() — порт _validateParentDeps (в исходнике вызывается при загрузке модуля; здесь явный, карты приходят из БД).
   conceptContextBlockFull/Selective — НЕ здесь (meta-synthesis-service, беседа 3.1).

5. server/utils/html-parser.ts (05-file-structure; обёртка над linkedom):
   - parseFragment(html) — контейнер-аналог generated[sectionKey];
   - innerText(el) — ПРИБЛИЖЕНИЕ браузерного innerText: linkedom даёт свой innerText ≈ textContent (склеивает блоки без переносов), поэтому нужен обход дерева с границами блоков. Это адаптация, а не дословный порт.

Приоритет extract-функций (реализовать в этой беседе):
extractSummaryGoals, extractSummaryTensions, extractGraphNodesTable, 
extractGraphEdges, extractGlossaryTable, extractThesesSummary.
Остальные — заглушки с TODO.
```

**Последующие запросы:**
- «Протестируй extractGraphNodesTable: вставь 5 записей в categories (разные типы, centrality, certainty) → extractGraphNodesTable возвращает форматированную таблицу со столбцами промпта графа (philosynth.html ~10897): Категория, Тип, Определение, Центральность, Определённость и столбец уровня (comparative → «Происхождение», transformative → «Генеалогия», generative → «Преодолённые ограничения», шаблон Registry `level.{level}.graph_last_col_name`)? При extGraphMetrics — плюс 6 столбцов (Ист. значимость, Степень инновации, Ясность, Широта, Глубина, Применимость)?»
- «Протестируй extractGlossaryTable: 3 термина в glossary_terms → таблица с колонками Термин, Определение? (extractGlossaryCompact исходника ~8021 берёт РОВНО первые два столбца — termCategory в межсекционный контекст не попадает; ячейки нормализуются как в tableToText: переносы и двойные пробелы → одиночный пробел)»
- «Протестируй buildContextForSection: для sectionKey="theses", effectiveDeps показывает required=["sum:goals","graph:nodes_top"] — результат содержит оба фрагмента? Общая длина не превышает CONTEXT_BUDGET?»
- «Протестируй бюджетирование: создай ситуацию, где суммарный контекст превышает CONTEXT_BUDGET — optional-фрагменты обрезаются, required — нет. ctxLog содержит записи со status "found", "truncated", "skipped_budget"?» ВАЖНО: «required не обрезаются» верно лишь до порога 1.5×budget — шаг 4 исходника (~8419) пережимает required при requiredLen > budget×1.5, щадя неприкосновенный набор UNTOUCHABLE (graph:nodes, graph:edges, sum:goals, sum:tensions). Проверить обе стороны порога.
- «Протестируй extractSummaryGoals: вставь HTML в sections WHERE key='sum' с data-section="Цели и задачи" → extractSummaryGoals парсит через linkedom и возвращает текст?»
- «Edge case: buildContextForSection для первого раздела (sum) — priorContext пуст, функция не crash. extractContextFragment для раздела, который ещё не сгенерирован — возвращает null (не пустую строку и не ошибку: null исходника ~8150 falsy и отличим от валидного пустого фрагмента, buildContextForSection трактует его как status="missing")»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 1.4: Streaming Manager + Generation Service

**Контекст:**
- `01-architecture.md` (секция 4.4 Streaming Manager)
- `03-specification.md` (секция 3 WebSocket-протокол)
- `server/ws/handler.ts` (из 0.2)
- `server/services/prompt-builder.ts` (из 1.2)
- `server/services/section-defs-builder.ts` (из 1.2: buildSectionDefs,
  groupPasses, patchPromptsWithSecCtx — без них проходы не собрать)
- `server/services/context-builder.ts` (из 1.3; ВОЗВРАЩАЕТ CtxLogDraft —
  писать его в context_log обязан generation-service)
- `server/services/context-extractor.ts` (из 1.3: createDbContextSource)
- `server/services/parent-context.ts` (из 1.3: реализация провайдера для
  setParentContextProvider — разъём, оставленный беседой 1.2)
- `server/services/synthesis-engine.ts` (из 1.1)
- `server/services/cost-estimator.ts` (из 1.1: sysChars = buildSYS().length,
  baseStaticChars = baseCtxStatic().length, passes = groupPasses(defs))
- `server/db/schema.ts`
- Исходник: streamResp(), generateDoc() (только логика оркестрации, без DOM)

**Извлечение:**
```bash
# Извлечь streamResp()
grep -n 'function streamResp' philosynth.html | head -1  # найти начало, затем извлечь блок
# Извлечь generateDoc(), go() (оркестрация генерации)
grep -n 'function generateDoc' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Реализую стриминг и оркестрацию генерации.

Прикреплены: спецификация WebSocket-протокола, ws/handler.ts, все сервисы из 
предыдущих бесед, фрагменты исходника (streamResp, generateDoc).

Создай:
1. server/services/streaming-manager.ts:
   - streamSection(synthesisId, sectionKey, prompt, systemPrompt, apiKey, onDelta):
     a. POST к Claude API с stream: true
     b. Парсинг SSE (content_block_delta → text)
     c. Буферизация HTML
     d. Вызов onDelta(delta, totalChars, htmlSoFar) для каждого чанка
        (исходник передавал (length, html); серверу для stream_delta §3.2
        нужен ИНКРЕМЕНТ — сигнатура расширена, зафиксировано беседой 1.4)
     e. Возврат usage (input_tokens, output_tokens)
     f. При ошибке: сохранение partial result в Redis
   - getStreamState(synthesisId, sectionKey): из Redis
   - clearStreamState(synthesisId, sectionKey)

2. server/services/generation-service.ts:
   - generateSynthesis(synthesisId, userId):
     a. Загружает synthesis из БД
     b. resolveContextDeps → buildEffectiveDeps → buildDynamicOrder
     c. buildSectionDefs из Registry
     d. groupPasses → для каждого прохода:
        - buildContextForSection
        - Собирает промпт (baseCtx + prior + section prompt)
        - streamSection через streaming-manager
        - Парсинг HTML → сохранение в sections + гранулярные таблицы
        - Отправка результата клиенту через WebSocket
     e. Записывает genCommon.conceptBlockSizes — размеры контекстных блоков
        каждой концепции-участника (для реконструкции промптов при экспорте)
     f. Пробрасывает extGraphMetrics в промпты (влияет на столбцы графа)
     g. Обновление synthesis.status → "ready"

3. Расширение ws/handler.ts:
   - Обработка subscribe_generation → запуск generateSynthesis
   - Отправка stream_delta, section_done, generation_complete

4. server/services/graph-parser.ts:
   - parseGraphFromHTML(html) → { nodes, edges, topology }
   - saveGraphToDb(synthesisId, parsedGraph) → INSERT в categories, category_edges
   Порт из parseTopology() и parseGraph(),
   но парсинг через linkedom вместо browser DOM.
   v10: парсинг поддерживает расширенные столбцы (extGraphMetrics).
   _rebuildNodeColors/_rebuildEdgeStyles — КЛИЕНТСКИЕ динамические палитры
   (04 §1.7 → client/components/graph/graph-utils.ts, беседа 1.7); на
   сервере не вызываются (сверено беседой 1.4).

5. server/services/element-parser.ts:
   - parseThesesFromHTML(html) → Thesis[]
   - parseGlossaryFromHTML(html) → GlossaryTerm[]
   - saveElementsToDb(synthesisId, sectionKey, elements)
```

**Последующие запросы:**
- «Создай роут POST /syntheses — принимает параметры из спецификации (2.2), создаёт запись в БД, запускает генерацию. Проверь: curl POST с seed, philosophers, sections, method → ответ { id, status: "generating" }»
- «Протестируй полный цикл: POST /syntheses с 2 философами (Кант, Гегель), sections=["sum","graph","glossary"], depth="overview" → подключись по WebSocket → получай stream_delta → section_done × 3 → generation_complete. Покажи финальный usage»
- «Проверь парсинг графа: после генерации раздела "graph" — SELECT count(*) FROM categories WHERE synthesis_id=X (должно быть 8–15 записей). SELECT count(*) FROM category_edges (должно быть 15–30). cluster_labels заполнены?»
- «Проверь парсинг тезисов и глоссария: после генерации — SELECT count(*) FROM theses, SELECT count(*) FROM glossary_terms. Данные содержат непустые formulation/definition?»
- «Протестируй reconnect: начни генерацию → отключи WebSocket → подключись заново с ?resume={synthesisId} → получи накопленный буфер + продолжение стрима»
- «Протестируй классификацию обрыва (v11): невалидный API-ключ → kind="auth" → generation_paused (reasonKind="auth"), synthesis.status="paused", pausedState записан, partial HTML сохранён; ошибка сети до первого токена → kind="pre-stream" → до 3 ретраев (1с/3с/8с), затем пауза»
- «Edge case: генерация с одним разделом (sections=["sum"]) — работает без зависимостей. Генерация с depth="exhaustive" — более длинный ответ, не timeout»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 1.4b: Pause / Resume (бэкенд + клиент)

**Контекст:**
- `01-architecture.md` §4.12 (полная спецификация Pause/Resume)
- `03-specification.md` (WebSocket: generation_paused, resume_generation)
- Из предыдущих бесед: `streaming-manager.ts`, `generation-service.ts` (из 1.4), `ws/handler.ts` (из 0.2), `server/db/schema.ts`
- Исходник: **ДА, фрагменты** — блок PAUSE/RESUME/ABORT + resumeGeneration

**Извлечение:**
```bash
grep -n 'PAUSE / RESUME / ABORT' philosynth.html | head -1  # начало блока (~24483)
grep -n 'async function resumeGeneration\|function _computeGenPauseEstimates\|function _resumeFromSubsection' philosynth.html
```

**Первый запрос:**
```
Реализую паузу и возобновление генерации (спецификация: 01 §4.12).

Прикреплены: ТЗ, спецификация WebSocket, streaming-manager.ts,
generation-service.ts, ws/handler.ts, фрагмент исходника.

Создай:
1. server/services/pause-resume-service.ts:
   - createPausedState(kind, ctx): снимок в syntheses.paused_state
     (gen: passIdx, partialSubsections, expectedSubsections, genParams,
     maxTokensUsed; plan: stepIdx, failedOp, remainingOps)
   - computePauseEstimates(ps): серверный аналог _computeGenPauseEstimates
     (fillMissingSubs / wholeSection / skipRemaining через cost-estimator)
   - resumeGeneration(synthesisId, mode): ветки fill-missing-subs (догенерация
     недостающих подразделов через regenerateSubsection, затем продолжение
     со следующего pass) / retry / skip / stop (финализация)
   - resumePlan(synthesisId, planId, mode)
   - запись pause_marker/resume_marker в generation_log
2. Расширение ws/handler.ts: resume_generation, resume_plan;
   отправка generation_paused (с estimates), generation_resumed
3. client/components/synthesis/PauseModal.tsx: 4 рендерера
   (gen partial/pre-stream, plan, billing, auth) с оценками стоимости
   на кнопках; бейдж паузы в шапке
```

**Последующие запросы:**
- «Протестируй max-tokens: сгенерируй раздел с maxTokens=500 → kind="max-tokens", isPartial=true, partialSubsections заполнен → resume fill-missing-subs догенерирует только недостающие, готовые идут контекстом»
- «Протестируй billing-паузу: mock 400 credit balance → generation_paused reasonKind="billing" → resume retry после «пополнения» продолжает с того же раздела»
- «Протестируй персистентность: пауза → перезапуск сервера → GET /syntheses/:id возвращает pausedState → resume работает»
- «Протестируй stop: частичный контент финализируется, status="ready", pausedState очищен, маркеры в логе»
- «Edge case: resume_generation без pausedState → RESUME_INVALID. Два resume подряд → второй отклонён»

**Завершение беседы:**
- Стандартный блок (компиляция, интеграция, ревью)

---

---

### Беседа 1.5: Форма создания + прогресс (клиент)

> **По факту беседы 1.5**: сверх перечня первого запроса в этой же беседе
> созданы `CompatAdvisor.tsx` и `SectionWarnings.tsx` (их требует тест 4)
> и серверные `POST /syntheses/estimate` + `POST /syntheses/advice`
> (03 §2.2). Из вилки «estimateCost на сервере (или клиентская копия)»
> выбран СЕРВЕР. Код свободного синтеза без seed у POST /syntheses
> приведён к §4.3 (NO_PARTICIPANTS_SEED_REQUIRED) — тест 5 ждёт его.

**Контекст:**
- `03-specification.md` (секция 1.3 Генерация)
- `05-file-structure.md` (секция client/components/synthesis/)
- `shared/types/`, `shared/constants/`
- `client/api/client.ts` (из 0.4)
- `client/hooks/useWebSocket.ts` (из 0.4)
- Исходник: HTML-разметка (формы, модальные окна, layout) (HTML формы — **только** как визуальный референс структуры)

**Извлечение:**
```bash
# Извлечь HTML-разметка (формы, модальные окна, layout)
grep -n 'body' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Создаю форму создания синтеза и панель прогресса.

Прикреплён HTML формы из исходника — как визуальный референс (какие поля, 
какие опции, структура чекбоксов). НЕ копировать HTML — создать React-компоненты.

Создай:
1. client/pages/CreateSynthesisPage.tsx
2. client/components/synthesis/SynthesisForm.tsx:
   - Поля: зерно (textarea), контекст (textarea), метод (select), 
     уровень (select), глубина (select), порядок генерации (select)
3. client/components/synthesis/PhilosopherPicker.tsx:
   - Чекбоксы из shared/constants/philosophers.ts (+36 в v10)
   - Группировка по эпохам (как в исходнике)
4. client/components/synthesis/SectionPicker.tsx:
   - Чекбоксы секций с secCtx-полями
   - Чекбокс «Расширенные характеристики» под секцией «Граф» (v10, extGraphMetrics)
5. client/components/synthesis/CostEstimate.tsx:
   - Вызывает estimateCost на сервере (или клиентская копия)
6. client/components/synthesis/GenerationProgress.tsx:
   - Подписка на WebSocket
   - Шаги: иконка (◯/⟳/✓), название раздела, количество символов
7. client/hooks/useStreamingGeneration.ts
8. client/api/syntheses.ts: createSynthesis(), getSynthesis()

Интеграция с Unified Concept Pool (из Беседы 1.5b):
- Пул встраивается в SynthesisForm как секция «Загруженные Концепции»
- Перед генерацией: refreshAllSynthParticipants(), сохранение снимка
  выбранной концепции, сброс индикатора, очистка DOC_STATE.modes
- Чекбокс extGraphMetrics: скрыт если «Граф» не выбран (sync с secGraph)
```

**Последующие запросы:**
- «Протестируй полный UI-цикл: открой /synthesis/new → заполни зерно, выбери 2 философов, отметь 3 секции, метод "dialectical" → CostEstimate показывает оценку? → нажми "Генерировать" → GenerationProgress показывает шаги с ◯/⟳/✓?»
- «Протестируй PhilosopherPicker: группировка по эпохам корректна (Античность: Пифагор–Плотин, Средневековье: Августин–Кузанский и т.д.)? Выбор/снятие работает? Счётчик выбранных обновляется?»
- «Протестируй SectionPicker: отметить "graph" → secCtx-поле появляется. Снять — скрывается. Матрица совместимости: выбрать method="creative", sections=["evolution"] → CompatAdvisor показывает предупреждение?»
- «Протестируй GenerationProgress во время реальной генерации: шаги появляются по мере стриминга? Счётчик символов обновляется в реальном времени? После завершения — redirect на /synthesis/:id?»
- «Протестируй валидацию формы (v11): без философов и концепций → ДОПУСКАЕТСЯ (свободный синтез; в промптах плейсхолдер «[свободный синтез: …]»), но тогда зерно обязательно → иначе NO_PARTICIPANTS_SEED_REQUIRED. С участниками без зерна → допускается. Без секций → ошибка. Чекбокс keepFullBudget виден только при концепциях в пуле»
- «Проверь responsive: форма на мобильных — PhilosopherPicker в 2 колонки, SectionPicker в 1 колонку. Кнопка "Генерировать" всегда видна»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

> **По факту беседы 1.5b** (реализация принята, тесты 35/35 браузерных
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

### Беседа 1.5b: Unified Concept Pool (клиент)

**Контекст:**
- `03-specification.md` (секции 1.6 Мета-синтез, 1.9 Импорт)
- `05-file-structure.md` (pool/)
- `shared/types/synthesis.ts`, `shared/types/lineage.ts`
- `client/hooks/useWebSocket.ts`, `client/api/client.ts` (из 0.4)
- `client/components/synthesis/SynthesisForm.tsx` (из 1.5)
- Исходник: **ДА, фрагмент** — Unified Concept Pool + importConceptAsParticipant + snapshotCurrentState

**Извлечение:**
```bash
# Пул: parseConceptFile … renderPoolConcepts
grep -n 'function parseConceptFile' philosynth.html | head -1
# importConceptAsParticipant (вызывается из пула)
grep -n 'function importConceptAsParticipant' philosynth.html | head -1
```

**Первый запрос:**
```
Создаю Unified Concept Pool — единый механизм загрузки, просмотра и выбора
концепций для мета-синтеза.

Прикреплён фрагмент исходника: parseConceptFile, addToPool, removeFromPool,
selectForViewing, snapshotCurrentState, restoreFromPoolSnapshot,
syncConceptParticipants, refreshPoolParticipant, renderPoolConcepts,
handlePoolFileImport, handlePoolUrlImport, toggleSynthParticipant.

Создай:
1. client/components/pool/ConceptPool.tsx:
   - Блок «Загруженные Концепции» в SynthesisForm
   - Кнопки «+ Загрузить из файла» / «+ Загрузить по URL»
   - Состояние: _loadedConcepts (массив), _selectedConceptId
   - Карточка концепции: ☑ мета-синтез, ◉ просмотр, имя, метод×уровень,
     источники контекста, кнопки ✎/✕
   - Предупреждение о непригодности к синтезу
   - Саммари: «N из M для мета-синтеза · ◉ имя — просмотр»

2. client/components/pool/PoolCard.tsx:
   - Одна карточка концепции (чекбокс, радио, инфо, кнопки)

3. Логика переключения просмотра (selectForViewing):
   - Сохранение снимка текущей (snapshotCurrentState)
   - Загрузка новой (restoreFromPoolSnapshot или importHTML)
   - Индикатор «◉ имя» в шапке

4. Логика участия в мета-синтезе (toggleSynthParticipant):
   - Проверка пригодности (participant / participantError)
   - Автовключение обязательных разделов (synthReady)
   - syncConceptParticipants → обновление _conceptParticipants

5. refreshPoolParticipant: обновление participant из снимка/DOM
   refreshAllSynthParticipants: перед генерацией

6. Обработчики импорта: handlePoolFileImport (multiple files),
   handlePoolUrlImport (fetchWithFallback)

7. Интеграция с SynthesisForm: пул вместо старых блоков импорта/концептов
```

**Последующие запросы:**
- «Протестируй: загрузи 2 файла → оба в пуле → отметь один для синтеза (☑) → отметь другой для просмотра (◉) → документ отображается → переключи просмотр → снимок сохранён, новый загружен»
- «Протестируй: ☑ непригодную концепцию (без glossary) → alert с ошибкой»
- «Протестируй: перед генерацией refreshAllSynthParticipants обновляет participant из снимка»
- «Протестируй: удалить концепцию из пула → индикатор сброшен, _conceptParticipants обновлён»

**Завершение беседы:**
- Стандартный блок (компиляция, интеграция, ревью)

---

### Беседа 1.6: Транспорт чтения (сервер) — синтезы, разделы, граф

> Разделение (2026-07-30): прежняя беседа «Просмотр документа + каталог»
> расщеплена на серверную 1.6 и клиентскую 1.6b. Причины: разные
> харнессы тестов (mini-Hono + живой PG против puppeteer + vite),
> почти непересекающиеся комплекты вложений, риск сжатия контекста в
> одном заходе. Прецедент — пара 0.5 (сервер) / 0.6 (клиент).

**Контекст:**
- `03-specification.md` (секции 2.2 Syntheses, 2.3 Sections, 2.4 Elements)
- `02-data-model.md` (syntheses, sections, categories, category_edges,
  cluster_labels, synthesis_lineage)
- Из предыдущих бесед: `server/routes/syntheses.ts` (1.4/1.5),
  `server/services/pause-resume-service.ts` (1.4b — `computePauseEstimates`),
  `server/services/generation-service.ts` (1.4 — `parseSubsectionsFromHTML`;
  до 2026-08-02 здесь ошибочно значился context-extractor.ts — функция
  живёт в generation-service, сверено беседой 1.6),
  `server/ws/handler.ts` (1.4/1.4b), `server/db/schema.ts`
- Исходник: нужен ровно один кусок — формат номера документа [12110]

**Извлечение:**
```bash
sed -n '12110,12115p' source/philosynth.html   # docNum «PS-NNNN-XXXX»
```

**Первый запрос:**
```
Достраиваю REST-слой чтения: без него клиентские беседы 1.6b и 1.7
нечем наполнить.

Создай / расширь:
1. Расширение server/routes/syntheses.ts (03 §2.2):
   - GET    /syntheses         ?page&limit&sort&order&status&method&search
                               → { items: SynthesisPreview[], total }
   - GET    /syntheses/public  ?page&limit&search&philosopher
                               → { items: SynthesisPreview[], total }
   - GET    /syntheses/:id     → { synthesis: SynthesisFull }
                                 с pausedState и pauseEstimates
                                 (computePauseEstimates, fail-open {})
   - PATCH  /syntheses/:id     { title?, isPublic? }  — только владелец
   - DELETE /syntheses/:id                            — только владелец

2. server/routes/sections.ts (03 §2.3) — модуль есть в 05, но не
   создавался ни одной беседой:
   - GET /syntheses/:id/sections       → { sections: SectionSummary[] }
   - GET /syntheses/:id/sections/:key  → { section: SectionFull }
   - GET /syntheses/:id/sections/:key/context
       → живой расчёт buildContextForSection (1.3): 03 §2.3 требует
         contextText, которого context_log НЕ хранит; поля ответа =
         CtxLogDraft билдера (формулировка «последняя запись
         context_log» была неточной — правка 2026-08-02).
     Нужен полю контекста в EditSectionCard (2.3). В первой
     редакции предпатча было сказано «остаётся беседам 2.3/2.4» —
     это оказалось допущением: ни 2.3, ни 2.4 его не создают.

3. server/routes/elements.ts — ТОЛЬКО чтение графа (03 §2.4):
   - GET /syntheses/:id/categories
       → { categories, edges, clusters, topology }
   PATCH-часть (categories/:catId, edges/:edgeId, theses, glossary)
   в этой беседе НЕ делается — она остаётся беседе 5.1.

4. POST /syntheses — заполнять doc_num при создании записи.
   Формат исходника [12110]:
   "PS-" + rand(1000..9999) + "-" + Date.now().toString(36).toUpperCase().slice(-4)

5. server/ws/handler.ts — режим «только подписка»:
   сейчас subscribe_generation при status='generating' без активного
   прогона ЗАПУСКАЕТ generateSynthesis. Страница просмотра (1.6b)
   не должна перезапускать генерацию — нужен явный флаг подписки
   без запуска либо отдельное сообщение.

6. Снимок структуры документа: заполнять syntheses.structure_sections
   при создании записи (копия sectionOrder). Колонка есть в схеме и
   в 02, но во всём server/ в неё нет НИ ОДНОЙ записи — без этого
   карточка «Структура документа устарела» (беседа 2.3) всегда
   попадает в ветку «актуальность не определена». Обновление снимка
   после исполнения плана — беседа 2.2.

7. POST /syntheses/:id/duplicate → { id: string } (03 §2.2):
   эндпоинт не был упомянут в 07 нигде (аудит 2026-07-30). Отдан этой
   беседе как владельцу routes/syntheses.ts. Копия синтеза со всеми
   разделами и элементами, новый doc_num, title += « (копия)»,
   is_public = false, запись в synthesis_lineage не создаётся —
   это копия, а не потомок.

8. Разбор маркеров TODO(1.6) в коде: их девять, и после разделения
   беседы они адресуют несуществующую беседу. Серверные закрыть здесь,
   клиентские переадресовать в TODO(1.6b), не оставляя ни одного
   TODO(1.6) в дереве.

9. Монтирование новых роутов в server/index.ts.
```

**Решения, зафиксированные до беседы (аудит 2026-07-30):**
- **Доступ:** GET /:id, /:id/sections, /:id/categories — владелец ИЛИ
  `is_public = true` (каталог «Публичные» ведёт на чужой синтез);
  иначе 403 FORBIDDEN, несуществующий id — 404 NOT_FOUND (03 §4.3).
  PATCH и DELETE — только владелец.
- **`contextQualityScore` до беседы 2.4 всегда `null`**:
  `context-quality.ts` (getSectionContextQuality) назначен 2.4, которая
  идёт позже; в роуте — `TODO(2.4)`.
- **`subsections`** в SectionSummary заполняются
  `parseSubsectionsFromHTML` (1.4) — нужны TableOfContents в 1.6b.
- **Стоимость** отдаётся из `syntheses.total_cost_usd`; роут ничего не
  пересчитывает по ставкам моделей.
- **Поиск серверный** (`?search=`, под него в схеме gin_trgm_ops по
  `title`); клиент фильтрует только уже загруженную страницу.
- **`capsule`** остаётся отдельным разделом в `sections` И полем
  `capsule_html`; роут ничего не вырезает — исключение ключа при
  рендере делает клиент (1.6b).

**Последующие запросы:**
- «Протестируй GET /syntheses: создай через POST два синтеза, запроси список → оба в items, total=2, сортировка по createdAt desc по умолчанию. Проверь ?search= (частичное совпадение title), ?status=, ?method=, ?page=&limit=»
- «Протестируй GET /syntheses/:id: возвращает SynthesisFull с sectionOrder, docNum, философами из synthesis_lineage, capsuleHtml, totalCostUsd. Для приостановленного синтеза — pausedState и pauseEstimates; для обычного — null»
- «Протестируй доступ: чужой непубличный синтез → 403 FORBIDDEN; после PATCH { isPublic: true } тот же GET от другого пользователя → 200; несуществующий id → 404 NOT_FOUND. То же для /sections и /categories»
- «Протестируй GET /syntheses/:id/sections: список SectionSummary в порядке sectionOrder, subsections заполнены из HTML, contextQualityScore = null (TODO(2.4)). GET /sections/:key возвращает SectionFull с htmlContent»
- «Протестируй GET /syntheses/:id/categories: categories с v10-метриками (clarity, breadth, depthScore, applicability, historicalSignificance, innovationDegree), edges с certainty/historicalSupport/logicalNecessity/contextDependency, clusters из cluster_labels, topology с ролями»
- «Протестируй doc_num: после POST /syntheses поле заполнено по маске PS-NNNN-XXXX и не пустое; у двух синтезов номера различаются»
- «Протестируй WS: для синтеза со status='generating' подписка в режиме просмотра НЕ приводит к вызову generateSynthesis, но события стриминга доходят»
- «Edge case: GET /syntheses?page=99 → пустой items, total корректен. GET /sections для синтеза без разделов → пустой массив, не 404. GET /categories для синтеза без графа → пустые массивы, topology с пустыми объектами»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Добавь секции в scripts/check-integration (по образцу предыдущих бесед) для новых роутов»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 1.6 (2026-08-02, беседа закрыта):**
- Все 9 пунктов запроса 1 выполнены; тесты 2–9 — одним заходом
  (`tests/test-16-requests2-9.mjs`, 84 проверки ×3 прогона), харнесс
  единый: живой сервер + мок-SSE (mini-Hono для части A не понадобился —
  сервер всё равно нужен моку и WS).
- Режим «только подписка» (пункт 5) реализован флагом
  `viewOnly?: boolean` в `subscribe_generation` (03 §3.1); без флага —
  прежнее поведение 1.4.
- `subsections` в SectionSummary/SectionFull: expected-список для
  `parseSubsectionsFromHTML` выводится из самого HTML (уникальные
  `data-section` в порядке появления) — `buildSubsectionMap` тянет
  Registry+params, а TOC (1.6b) нужны ФАКТИЧЕСКИЕ якоря.
- `POST /:id/duplicate`: доступ — только владелец (как PATCH/DELETE);
  копируются разделы/категории (ремап id рёбер)/кластеры/тезисы/
  глоссарий/диалог и генеалогия РОДИТЕЛЕЙ; lineage-связь «копия →
  оригинал» не создаётся; логи generation_log/context_log не копируются
  (история, не контент); активная генерация → 409 GENERATION_IN_PROGRESS.
- `DELETE /:id` при активной генерации → 409 (решение беседы).
- Формулировка теста «создай два синтеза → total=2» адаптирована: в
  списке также прямые вставки (paused/generating) — проверялся
  фактический total.
- Shared дополнен: `SynthesisFull.pauseEstimates`,
  `SectionSummary.subsections`, `WsSubscribeGeneration.viewOnly`;
  audit.mts: `pauseEstimates` в typeOnly (вычисляемое поле).
- Грабли харнесса: SIGTERM npx-обёртке не убивает node-ребёнка tsx
  (сирота держит порт; лечение — `node --import tsx` + преflight
  занятости порта); HTTP-лимитер ключуется по IP, окно общее между
  прогонами (лечение — поднять RATE_LIMIT_HTTP_PER_MINUTE в env теста).

---

### Беседа 1.6b: Просмотр документа + каталог (клиент)

**Контекст:**
- `03-specification.md` (секции 1.2, 1.4, 2.2, 2.3)
- `01-architecture.md` (§4.15 п.4–5: автодобавление в пул; шапка
  документа — раскрывающиеся поля, авто-заголовок из «name», капсула)
- `05-file-structure.md` (document/, catalog/)
- Из предыдущих бесед: роуты чтения из 1.6,
  `client/src/hooks/useStreamingGeneration.ts` и
  `client/src/components/synthesis/PauseModal.tsx` (1.5/1.4b — нужны для
  edge case «status=generating»), `client/api/`, `client/stores/`
- Исходник: **НУЖЕН для документа** (каталога в standalone-файле нет —
  для CatalogPage/SynthesisCard исходник действительно не нужен).
  Фрагмент: `docs/fragments-for-conversations/1.6-document-view.js`

**Извлечение (по именам из карты 04, а не по номерам строк):**
```bash
python3 scripts/extract-by-name.py \
  docs/fragments-for-conversations/1.6-document-view.spec
```
Спецификация перечисляет ИМЕНА: CSS-селекторы документа (`.doc-*`,
`#docTOC`, `.toc-*`, `.section-*`, `.callout*`, `.risk*`,
`.validity-stamp`, `.actions-bar`, `.action-btn`), разметку `#docOutput`
и функции `makeHeaderDisclosure`, `buildDocHeaderExtras`,
`buildTableOfContents`, `extractCapsuleText`, `restoreCapsulesFromHTML`,
`updateCapsuleInHeader`, `removeCapsuleFromDocBodies`,
`makeSectionCtxDisclosure`, `editDocTitle`, `updateDocTitleFromName`,
`updateFooterCost`. Границы вычисляет сборщик; номера строк попадают в
готовый фрагмент как результат поиска и не требуют сопровождения.

Два остаточных диапазона в спецификации помечены отдельно и стареют:
заполнение шапки при старте генерации и разметка панели действий —
последовательности операторов без именованных якорей. При расхождении
искать по содержимому (`docNum` начинается с «PS-»; панель действий
содержит кнопки экспорта).

`--check` показывает, что и где нашлось, ничего не записывая: полезно
после любой правки исходника.
НЕ портировать: `rebuildDbMapping` [5686] и всю индексацию `db{N}` /
`DOC_STATE.sectionDbIdx` — в React разделы адресуются по `key`;
`.output-wrap` (видимостью управляет маршрут).

**Первый запрос:**
```
Создаю страницу просмотра синтеза и каталог.

Прикреплён фрагмент исходника (1.6-document-view.js): CSS документа,
разметка-эталон шапки и футера, buildTableOfContents, шапка с
раскрывающимися полями, капсула, updateFooterCost.

Создай:
1. Перенос CSS документа в client/src/globals.css:
   .doc-header/.doc-title/.doc-subtitle/.doc-meta-*, #docTOC/.toc-*,
   .doc-section/.section-num/.section-title/.doc-content/.doc-table/
   .callout*/.risk*, .doc-footer/.validity-stamp, .actions-bar.
   Без них рендер html_content разваливается: после 0.4 в globals.css
   только палитра.

2. client/pages/SynthesisPage.tsx:
   - Загрузка синтеза по ID (GET /syntheses/:id из беседы 1.6)
   - Рендер DocumentView

3. client/components/document/:
   - DocumentView.tsx: рендер HTML-контента разделов (dangerouslySetInnerHTML),
     ключ `capsule` исключается — капсула живёт в шапке
   - DocumentHeader.tsx: номер (docNum), участники, метод, капсула,
     раскрывающиеся поля (buildDocHeaderExtras)
   - SectionView.tsx: обёртка с якорем #sec-{key} и кнопкой ⏫.
     Свой заголовок НЕ рисует: html_content хранит весь
     <div class="doc-section"> вместе с section-num и section-title
   - TableOfContents.tsx: якоря #sec-{key} и #subsec-{key}-{slug}
     (порт buildTableOfContents; подразделы из SectionSummary.subsections)
   - DocumentFooter.tsx: токены и стоимость — значение
     synthesis.totalCostUsd как есть, без пересчёта по ставкам

4. client/pages/CatalogPage.tsx:
   - Вкладки: «Мои» (GET /syntheses) / «Публичные» (GET /syntheses/public)
   - Поиск (параметр ?search=, серверный)
   - Переключатель публикации через PATCH /syntheses/:id { isPublic }

5. client/components/catalog/:
   - SynthesisList.tsx
   - SynthesisCard.tsx: превью (название, метод, уровень, философы, дата)

6. client/api/sections.ts: getSections(), getSection()
7. client/stores/synthesis-store.ts (Zustand): текущий синтез, разделы

8. SynthesisPage при status='generating' — подписка на WS через
   useStreamingGeneration (1.5) в режиме «только просмотр»:
   открытие страницы не должно запускать генерацию заново
   (режим добавлен в ws/handler в беседе 1.6).

9. Проверить, что после беседы 1.6b в дереве не осталось маркеров
   TODO(1.6): серверные закрывает беседа 1.6, клиентские переадресуются
   в TODO(1.6b) и закрываются здесь (аудит 2026-07-30 насчитал девять
   маркеров до разделения беседы).
```

**Последующие запросы:**
- «Протестируй SynthesisPage: открой /synthesis/:id для ранее созданного синтеза → DocumentHeader показывает номер, метод, уровень, философов? DocumentView рендерит HTML всех разделов? TableOfContents содержит якоря на каждый раздел?»
- «Протестируй CSS: таблицы в разделах отрисованы стилем .doc-table (рамки, зебра), callout'ы цветными блоками, .risk-метки окрашены. Сравни с исходником визуально»
- «Протестируй навигацию: клик на элемент TableOfContents → плавная прокрутка к разделу; якоря подразделов работают. Кнопка ⏫ в заголовке раздела → возврат к оглавлению»
- «Протестируй капсулу: она показана в шапке документа и НЕ продублирована среди тел разделов»
- «Протестируй CatalogPage: вкладка "Мои" → список синтезов текущего пользователя. Опубликуй синтез (PATCH /syntheses/:id { isPublic: true }) → он появляется во вкладке "Публичные". Поиск уходит на сервер параметром ?search=»
- «Протестируй SynthesisCard: отображает название, метод×уровень, список философов (через запятую), дату создания. Клик → навигация на /synthesis/:id»
- «Протестируй DocumentFooter: показывает суммарные токены (input + output) и стоимость в формате "$X.XXXX" — ровно значение synthesis.totalCostUsd, без пересчёта по ставкам модели»
- «Edge case: SynthesisPage для синтеза со status="generating" — показывает индикатор загрузки или подключается к WebSocket для стриминга, а не пустой документ; проверь, что открытие страницы НЕ запускает генерацию заново. Несуществующий ID — 404-страница; чужой непубличный синтез — 403»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 1.6b (2026-08-03, беседа закрыта):**
- Все 9 пунктов запроса 1 выполнены; тесты 2–9 — одним заходом
  (`tests/test-16b-requests2-9.mjs`, 63 проверки ×3 прогона):
  puppeteer поверх живого сервера + vite; данные — прямыми вставками
  в БД (мок Claude нужен только счётчиком для edge case «generating
  не перезапускается»: 0 вызовов, generation_log не растёт).
- ГРАБЛЯ (пойман тестом R4): пострендер-вставки в DOM под
  dangerouslySetInnerHTML стираются — hash-навигация (клик по
  TOC-ссылке) дёргает location → ре-рендер → React пере-применяет
  innerHTML, а эффект с неизменными deps не перезапускается.
  Решение: SectionView обогащает САМУ HTML-строку до рендера
  (`enrichSectionHtml`, DOMParser в useMemo) — якоря `#subsec-*` и
  кнопки ⏫ живут в `__html`, терять нечего. Закреплено регрессией 4p
  (useEffect в SectionView запрещён).
- Дыра спеки фрагмента: disclosure-CSS (.header-disclosure* /
  .sec-disclosure, [2114–2226]) не входил в 1.6-document-view.spec,
  а DocumentHeader без него нечитаем — портирован, spec дополнен.
- `SynthesisFull` не несёт userId → владение клиенту заранее
  неизвестно: ✎ (editDocTitle → prompt + PATCH title) и переключатель
  публикации работают оптимистично, 403 → алерт «только владелец».
- Пауза на странице просмотра: снапшот из GET /:id НЕ навязывает
  модалку (доступна по бейджу в GenerationProgress); живая WS-пауза
  текущего прогона открывает её сама и перекрывает снапшот.
- actions-bar — функциональный минимум («Распечатать» + статус);
  кнопки графа/Изменить/лога/экспорта/режимов появятся в
  1.7/2.3/2.4/4.2/4.1 — мёртвых заглушек не рисуем.
- Заход на страницу в середине генерации: разделы, уже лежащие в БД,
  помечаются done в прогрессе; по section_done готовые разделы
  дотягиваются транспортом чтения (reloadSections), по
  generation_complete перечитывается весь синтез.
- `makeSectionCtxDisclosure` из фрагмента НЕ портирован: секционный
  контекст в документе не показывается до EditModal — долг → 2.3
  (§12); `restoreCapsulesFromHTML` — прежний долг 3.2.
- Футер: стоимость — РОВНО `totalCostUsd` (решение 1.6 соблюдено;
  квирк updateFooterCost 3/15 $/M не перенесён, регрессия 4p).
- Грабли харнесса (в копилку 0.4): (1) после smooth-scroll ассерт
  |top|<ε неверен — последний раздел упирается в низ документа,
  проверять «в viewport»; (2) сверки текста под
  text-transform: uppercase — только textContent (innerText отдаёт
  трансформированный, грабля 1.5 повторилась на disclosures);
  (3) keep-alive-сокеты мок-сервера держат event loop в finally —
  итог печатать до cleanup, race-таймауты на close, process.exit;
  (4) кэш puppeteer в песочнице пуст — системный
  /opt/google/chrome/chrome (грабля 0.6 повторилась).

---

### Беседа 1.7: Граф категорий, 3D + 2D (клиент)

> Разделение (2026-07-30): беседа стала чисто клиентской. Роут
> `GET /syntheses/:id/categories` перенесён в серверную беседу 1.6 —
> прежде он рождался только в 5.1 (Фаза 5), то есть страницу графа
> нечем было наполнить через две фазы после её создания.

**Контекст:**
- `04-code-reuse-map.md` (секция 3 — непереносимое, graph/)
- `05-file-structure.md` (graph/)
- `03-specification.md` (секция 2.4 — GET /syntheses/:id/categories)
- Из предыдущих бесед: `shared/types/graph.ts` (Category, CategoryEdge,
  ClusterLabel, TopologyInfo, GraphData — готовы), роут categories из
  беседы 1.6, `client/pages/SynthesisPage.tsx` из 1.6b (хозяин модалки —
  кнопка графа живёт в actions-bar над документом)
- Исходник: вся визуализация графа (TC … build2D) (ВСЯ визуализация графа)

**Извлечение — здесь нужен большой фрагмент:**
```bash
# Основной фрагмент готов: 1.7-graph-viz.js [12990–16366] — внутри всё,
# что перечисляет первый запрос (graph-utils, build3D/build2D, панели,
# легенда, физика, геометрия).
grep -n 'GRAPH MODAL\|MMD EXPORT' philosynth.html | tail -3
grep -n 'function build3D\|function build2D' philosynth.html
# ВНЕ основного фрагмента (аудит 2026-07-30) — объявление graph-STATE:
# G, roleMode, legendFilter, clusterVisible, clearLegendFilter.
# Собирается по именам, без номеров строк:
python3 scripts/extract-by-name.py \
  docs/fragments-for-conversations/1.7-graph-state-extras.spec
```
> Границей извлечения служит баннер `MMD EXPORT`, поэтому `exportMMD`
> [16370] и соседние экспортёры в фрагмент НЕ входят — и не должны:
> они принадлежат беседе 4.2 (серверные `services/export/*`).

**Первый запрос:**
```
Портирую визуализацию графа категорий в React.

Прикреплён фрагмент исходника (вся визуализация графа (TC … build2D)): build3D, build2D, 
typeColor, edgeTypeStyle, showNodePanel, buildLegend, и все вспомогательные функции.

Создай:
0. Зависимости клиента (client/package.json) — их НЕТ после 0.4:
   three@0.128.x (исходник рассчитан на r128) + @types/three,
   d3@^7.8.5 + @types/d3. Исходник грузил обе библиотеки тегами
   <script> с cdnjs — в React-клиенте нужны npm-пакеты; CDN в
   песочнице закрыт egress-прокси, тесты через него не пройдут.

1. client/components/graph/graph-utils.ts:
   - `_TC_HUE_SEEDS`, `_EC_HUE_SEEDS`, `_EC_DASH_SEEDS`, CPAL (динамические палитры)
   - `_rebuildNodeColors()`, `_rebuildEdgeStyles()` — заполняют `_nodeColorMap`/`_edgeStyleMap` (v10)
   - typeColor, typeColorHex, edgeTypeStyle, _blendHex, _hexToHSL, _hslToHex
   - `getStructuralMarkers()` (возвращает массив, не один маркер) (v10)
   - `clearLegendFilter()`, `legendFilter` (v10)
   - nodeSymbolPath (D3-формы по роли)
   - nodeGeometry3D (Three.js-геометрии по роли)
   - polyPath, hexStarPath, trapezoidPath, rectPath

2. client/utils/graph-physics.ts:
   - tick(), warmup() — из tick()

3. client/utils/graph-geometry.ts:
   - nodeGeometry3D, mkSprite — из nodeGeometry3D()

4. client/components/graph/Graph3D.tsx:
   - React-обёртка над build3D
   - useEffect для инициализации Three.js scene
   - Очистка при unmount
   - Drag, orbit, zoom, hover, select
   - Торические кольца кластеров
   - Wireframe-эллипсоиды кластеров

5. client/components/graph/Graph2D.tsx:
   - React-обёртка над build2D
   - D3.js force simulation
   - SVG markers, cluster rings, hull

6. client/components/graph/GraphModal.tsx:
   - Вкладки 3D/2D
   - Кнопки экспорта (MMD, PNG, JSON) — ЗАГЛУШКИ с TODO(4.2):
     exportMMD/exportPNG/exportJSON реализуются как серверные сервисы
     в беседе 4.2 (services/export/*) и в фрагмент 1.7 не входят
     (обрыв на 16366, exportMMD с 16370). Здесь — только разметка
     кнопок и обработчики-заглушки
   - Toggle кластеров, toggle роль

7. client/components/graph/NodePanel.tsx:
   - showNodePanel → React-компонент
   - Определение, метрики, роли, связи

8. client/components/graph/GraphLegend.tsx:
   - Кликабельные элементы легенды → фильтрация графа (legendFilter)
   - clearLegendFilter() для сброса

9. client/components/graph/EdgePanel.tsx:
   - showEdgePanel(container, edgeData, allNodes, clusterLabels):
     тип, направление (→/↔/↺), сила (бар), описание,
     расширенные метрики связи (certEdge, innovDeg, histSupport, logNec, ctxDep),
     блоки обоих узлов (с метриками и кластерами)

10. client/api/elements.ts — модуль создаётся ЗДЕСЬ (в контексте
    беседы он числился готовым, но не создавался никем; беседа 5.2
    говорит о нём «расширение»):
    - getCategories(synthesisId) → { categories, edges, clusters, topology }

Дополнительные задачи:
- getStructuralMarkers(name): возвращает МАССИВ маркеров (core, generative,
  bridge, central, peripheral) с параметрами strokeWidth, strokeDash, filter,
  innerShape, emissive3d. Не один маркер, а все подходящие.
- NodePanel: секция «РАСШИРЕННЫЕ» для узлов с _extended=true
  (histSig, innovDeg, clarity, breadth, depth, applic — бары + значения)

Порт максимально близкий к исходнику — та же физика, аналогичные цвета (динамические палитры),
те же формы. roleMode по умолчанию "procedural". clearLegendFilter для сброса фильтра легенды.
```

**Последующие запросы:**
- «Протестируй Graph3D: открой GraphModal для синтеза с 10+ категориями → 3D-сцена рендерится? Узлы видны, рёбра видны? Вращение мышью, зум колёсиком, drag узлов работают?»
- «Протестируй формы узлов по ролям: synthesis → октаэдр, thesis → тетраэдр, antithesis → перевёрнутый тетраэдр, bridge → куб с wireframe. Цвета по типам совпадают с исходником (TC: онтологическая → #e74c3c, эпистемологическая → #3498db)?»
- «Протестируй Graph2D: переключи на вкладку 2D → D3 force simulation, SVG-маркеры стрелок, формы узлов (nodeSymbolPath). Drag узлов работает? Рефлексивные петли (arcPath) рендерятся?»
- «Протестируй NodePanel: клик на узел → панель справа с определением, метриками (центральность, определённость), ролями (structural + procedural), списком входящих/исходящих/рефлексивных связей. Повторный клик — снятие выделения»
- «Протестируй кластеры: кнопка Toggle Clusters → торические кольца (3D) / пунктирные окружности (2D) появляются/скрываются. Wireframe-эллипсоиды кластеров (3D) / convex hull (2D) позиционируются правильно? Спрайты-метки кластеров видны?»
- «Протестируй hover+select: навести на узел → подсветка + соседние узлы подсвечены, остальные dimmed. Клик — фиксация выделения. Клик на пустое место — сброс. Тултип с именем и типом при hover»
- «Edge case: граф с 1 узлом (без рёбер) — рендерится без ошибок. Граф без категорий вообще (пустые массивы из GET /categories) — модалка показывает пустое состояние, не падает. Граф с рефлексивной связью — петля отображается. Чужой публичный синтез — граф открывается, чужой непубличный — 403»
- «Мобильный touch: pinch-zoom, single-touch orbit, tap для select. В puppeteer это Input.dispatchTouchEvent через CDP — если харнесс не тянет, зафиксируй как ручную проверку и вынеси в TODO, не имитируй тест мышью»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 1.7 (2026-08-04):** беседа закрыта; запросы 2-9 — единым
браузерным тестом `tests/test-17-requests2-9.mjs`, 84 ✓ / 0 ✗ ×2
(живой стек + системный Chromium + SwiftShader-WebGL; журнал —
глава 1.7 `NEXT-CONTEXT.md`). Адаптации: (а) ДЫРА КОМПЛЕКТА — CSS
графа [931-1374] не входил ни в один фрагмент/спеку (спека
graph-state-extras машинная), портирован в globals.css напрямую;
(б) пустой граф открывает модалку с пустым состоянием, не alert;
(в) nodeGeometry3D/mkSprite — utils/graph-geometry.ts (по 05);
(г) панели через PanelCallbacks; (д) touchend легенды не портирован
(тач синтезирует click); (е) медиа-адаптация легенды ≤600px —
ОТКЛОНЕНИЕ от исходника по требованию запроса 9: без него легенда
богатого графа накрывала весь канвас и жесты не достигали canvas;
(ж) квирк исходника: fuzzy typeColor даёт подстрочным типам один
цвет («логическая» ⊂ «онтологическая»); (з) НЕТОЧНОСТЬ запроса 3
выше: hex #e74c3c/#3498db — статическая палитра TC доревизии v10,
динамические палитры дают hue по сидам (онтологическ→215,
эпистемологическ→145) — тест сверяет hue. Экспорт MMD/PNG/JSON —
заглушки TODO(4.2), долг внесён в §12.


## 4. Протокол Фазы 2: Редактирование и каскады

### Беседа 2.1: Cascade Analyzer + Edit Planner (бэкенд)

**Контекст для загрузки:**
- `01-architecture.md` (секция 4.5 Edit Planner)
- `02-data-model.md` (таблица edit_plans)
- `03-specification.md` (секция 2.6 Edit Plans)
- `04-code-reuse-map.md` (секция 1.1 — cascade-analyzer)
- Из предыдущих бесед: `server/services/synthesis-engine.ts`, `server/services/section-defs-builder.ts`, `server/db/schema.ts`, `shared/types/edit-plan.ts`, `server/utils/topo-sort.ts` (sourceOf, sortInTopoOrder-основа), `server/services/cost-estimator.ts` (дополняется wave-функциями, см. первый запрос)
- Исходник: computeDependents … computeFactualDependents + recalcEditPlan … updateLiveCascade

**Извлечение фрагментов перед беседой:**
```bash
# Извлечь computeDependents … computeFactualDependents
grep -n 'function computeDependents' philosynth.html | head -1  # найти начало, затем извлечь блок
# Извлечь recalcEditPlan … updateLiveCascade
grep -n 'function recalcEditPlan' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Портирую систему каскадного анализа и планирования редактирования.

Прикреплены: архитектура (Edit Planner), спецификация (Edit Plans API), карта
переиспользования, synthesis-engine.ts, section-defs-builder.ts, schema.ts, типы,
и фрагменты исходника (computeDependents … computeFactualDependents: computeDependents и т.д.; 
recalcEditPlan … updateLiveCascade: recalcEditPlan, updateLiveCascade).

Создай:
1. server/services/cascade-analyzer.ts:
   - computeDependents(effectiveDeps) — из computeDependents()
   - sourceOf(ctxKey) — УЖЕ портирован в 1.1 (server/utils/topo-sort.ts);
     здесь — реэкспорт для соответствия карте 04, не дубликат
   - getIntraDependents(sectionKey, subsectionName) — из getIntraDependents()
     Читает INTRA_DEPS через getConfig("intra_deps")
   - getCrossSecDependents(sectionKey, subsectionName) — из getCrossSecDependents()
     Читает SUBSECTION_TO_CTX_KEYS через getConfig("subsection_ctx_keys")
   - getAffectedModes(changedSections, changedSubsections?) — из getAffectedModes()
   - sortInTopoOrder(keys) — из sortInTopoOrder()
   - buildPlanOrder(plan) — единый топологический порядок add+regen (v10, НОВОЕ)
   - buildCtxKeyConsumers() — обратная карта ключ→подразделы-потребители
     (гранулярный каскад: «перегенерировать подраздел, а не весь раздел», v11)
   - canonicalSubsectionKey() — каноникализация портретных заголовков
     (варианты SUBSECTION_SUM_PORTRAIT схлопываются для карт зависимостей, v11).
     ПОТРЕБИТЕЛЬ ИЗ 1.3: extractRelevantIntraSectionContext в context-builder
     принимает её колбэком (default — тождество, метка TODO(2.1) в коде);
     после создания подставить настоящую, иначе при кардинальности ≠ multi
     имена подразделов не совпадут с каноном INTRA_DEPS.
   - buildFactualDepsMap(ctxLog) — из buildFactualDepsMap()
   - computeFactualDependents(factDeps) — из computeFactualDependents()
   - analyzeImpact(synthesisId, plan): полный каскадный анализ —
     вычисляет downstream (какие разделы затронуты), upstream (какие зависимости 
     отсутствуют для добавляемых разделов), активные подстановки, рекомендации.
     Это серверный аналог updateLiveCascade() (updateLiveCascade()).

2. server/services/edit-planner.ts:
   - createPlan(synthesisId, userId, actions): 
     Принимает { regen, remove, add, modeRegen, modeRemove },
     вызывает analyzeImpact, добавляет каскадные шаги с cascadeGenerated: true,
     сохраняет в edit_plans, возвращает EditPlan
   - updatePlan(planId, stepUpdates):
     Обновляет статусы шагов (confirmed/skipped), пересчитывает каскад
   - estimatePlanCost(plan):
     Вызывает estimateCost для regen+add шагов + estimateModeCost для mode шагов
   - Дополни server/services/cost-estimator.ts (файл из 1.1):
     estimateCascadeWaveCost() — из estimateCascadeWaveCost(),
     formatWaveCost() — из formatWaveCost().
     Отложены из беседы 1.1 сознательно: требуют каскадного анализа
     (computeDependents/волны), который появляется только здесь

3. server/routes/plans.ts:
   - POST /syntheses/:id/plans — вызывает createPlan
   - GET /syntheses/:id/plans/:planId — возвращает план
   - PATCH /syntheses/:id/plans/:planId — вызывает updatePlan
   - DELETE /syntheses/:id/plans/:planId — удаляет план

НЕ делай в этой беседе: исполнение плана (execute) — это беседа 2.2.
```

**Последующие запросы:**
- «Протестируй: создай план с regen=["graph"], remove=[] — проверь, что каскад обнаруживает downstream-зависимости (theses, dialogue и т.д.)»
- «Протестируй: план с add=["dialogue"] для синтеза, у которого нет glossary — проверь upstream-анализ: missing hard dependencies»
- «Проверь estimatePlanCost — сумма должна совпадать с суммой estimateCost для каждого раздела»
- «Edge case: план с remove=["graph"] + add=["graph"] — не должен содержать каскадных шагов для graph»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 2.1 (2026-08-04):** беседа закрыта; запросы 2-5 — единым
тестом `tests/test-21-requests2-5.mjs` (сервисный уровень + HTTP-смоук
§2.6), 39 ✓ / 0 ✗ ×2; браузер не нужен. Интеграция — секции 2l/4r/5o
в `server/integration-check.mts` (INTEGRATION OK живьём). Журнал —
глава 2.1 `NEXT-CONTEXT.md`. Адаптации: (а) estimatedCost НЕ хранится
в edit_plans (02 §2.13 без колонки; 03 §4.2 отдаёт поле) — вычисляется
заново при create/GET/PATCH; (б) статусы шагов: пользовательские
confirmed, каскадные pending (01 §4.5 п.4); (в) удаление результата
режима — type='delete' с target «modeKey:index» (отдельного типа в 03
§4.2 нет); (г) remove+add одного раздела допустимы («заменить», edge
case 4), regen∩remove — VALIDATION_ERROR; (д) updatePlan пересобирает
шаги целиком с переносом решений по (type, target), снятые базовые
остаются skipped; (е) АНТИ-ЦИКЛ: cascade-analyzer грузит синтез
локально (loadSynthesisLocal), не импортируя generation-service —
иначе цикл через context-builder (getCanonicalizer появился там при
закрытии TODO(2.1)); (ж) canonicalSubsectionKey на сервере асинхронна
(варианты из Registry), sync-потребителям выдаётся getCanonicalizer();
(з) планы owner-only; создание при активной генерации допустимо —
PLAN_CONFLICT про исполнение (2.2); (и) buildPlanOrder живёт в
plan-order-builder.ts (05), в cascade-analyzer — реэкспорт (как
sourceOf). Локальные порты MODE_TITLES/getEffectiveModeDepsFromConfig —
метки TODO(4.1), долг в §12. НЕТОЧНОСТЬ тестового запроса 3 выше:
для dialogue `glossary:table` — лишь OPTIONAL-зависимость, поэтому
«синтез без glossary» при наличии graph/theses жёстких потерь НЕ даёт
(отсутствие glossary порождает C3-рекомендацию, не C1); тест закрывает
намерение двумя фикстурами — ["sum"] (жёсткие потери graph:nodes_compact
и theses:summary, где dialogue:synthesis отсечён как self-источник) и
["sum","graph"] (theses:summary замещается graph:nodes — C2-подстановка
вместо потери).

---

### Беседа 2.2: Plan Executor + Regeneration (бэкенд)

> **Долг, переадресованный сюда (аудит 2026-07-30):** в
> `client/src/components/synthesis/PauseModal.tsx` висит открытый
> `TODO(1.5)` — «confirm деградации зависимостей при skip» [25686]:
> сейчас skip отправляется без подтверждения, потому что сервер не
> спрашивает. Беседа 1.5 закрыта, подтверждение по смыслу серверное —
> реализовать здесь и переименовать маркер в `TODO(2.2)` либо снять.

**Контекст:**
- `01-architecture.md` (секции 4.4 Streaming, 4.5 Edit Planner)
- `03-specification.md` (секция 3 WebSocket: plan_updated, plan_step_started, plan_step_done)
- Из предыдущих бесед: `server/services/cascade-analyzer.ts` (из 2.1), `server/services/streaming-manager.ts` (из 1.4), `server/services/context-builder.ts` (из 1.3), `server/services/generation-service.ts` (из 1.4), `server/services/edit-planner.ts` (из 2.1), `server/ws/handler.ts` (из 0.2)
- Исходник: executeEditPlan … regenerateSubsection + addSection, deleteSection

**Извлечение:**
```bash
# Извлечь executeEditPlan … deleteSection
grep -n 'function executeEditPlan\|function addSection' philosynth.html | head -2  # найти границы блока
```

**Первый запрос:**
```
Реализую исполнение планов редактирования и перегенерацию разделов/подразделов.

Прикреплены: streaming-manager.ts, context-builder.ts, generation-service.ts, 
cascade-analyzer.ts, edit-planner.ts, ws/handler.ts, и фрагмент исходника 
(executeEditPlan, regenerateSection, regenerateSubsection,
deleteSection, addSection).

Создай:
1. Расширение server/services/generation-service.ts:
   - regenerateSection(synthesisId, sectionKey, newCtx?, opts?):
     Адаптация regenerateSection(). v10: параметр `opts.fromPlan` подавляет TOC и каскады. Пересобирает промпт для одного раздела,
     стримит через Claude, сохраняет результат, парсит элементы,
     обновляет section в БД, записывает genLog/ctxLog.
   - regenerateSubsection(synthesisId, sectionKey, subsectionName, opts?):
     Адаптация regenerateSubsection(). extractRelevantIntraSectionContext через 
     серверный HTML-парсинг, стриминг подраздела, замена в HTML.
   - addSection(synthesisId, sectionKey, ctx?, opts?):
     Адаптация addSection(). Параметр `opts.fromPlan` подавляет TOC и каскады.

   - refreshSumDef():
     Перестраивает sectionDefs["sum"] после добавления/удаления разделов.
     Подраздел «Структура документа» содержит актуальный перечень разделов.

   Трекинг «Структура документа»:
   - DOC_STATE.structureSections: снимок sectionOrder при генерации подраздела
   - При regenerateSubsection("sum", "Структура документа"):
     structureSections = [...sectionOrder]
   - buildDocStateFromImport: восстанавливает structureSections из
     embeddedState (реализуется import-service, беседа 4.2 — там
     обязанность прописана повторно; в 2.2 модуля импорта ещё нет)

   - deleteSection(synthesisId, sectionKey):
     Адаптация deleteSection(). Удаление из sections + sectionOrder,
     перенумерация §§ и ссылок, запись deletion_marker в genLog.

   Пост-план (после всех шагов executePlan):
   - Если добавлялись/удалялись разделы → предложить обновить «Структура
     документа» (по факту 2.2 — pending-шаг regen_subsection
     «sum:Структура документа» + plan_steps_added; исполнение —
     confirm_step)
   - Если добавлялись разделы → вычислить downstream, предложить каскад
   - regenStructureFromEditModal(): кнопка в карточке «Структура
     устарела» — клиент (беседа 2.3); серверная часть =
     regenerateSubsection("sum", «Структура документа»). Хвост «Вставка
     в sectionOrder, перенумерация, генерация, сохранение» относился к
     addSection (сбой форматирования, поправлен 2.2).

2. server/services/plan-executor.ts:
   - executePlan(planId):
     a. Загружает план из БД
     b. Обновляет статус → "executing"
     c. Строит единый порядок через `buildPlanOrder()` (v10: add+regen в топо-порядке)
     d. Для каждого шага последовательно:
        - Отправляет plan_step_started через WebSocket
        - Исполняет: deleteSection / regenerateSection / addSection / 
          regenerateSubsection / regenerateModeSilent (mode-service —
          беседа 4.1; до неё — разъём setModeRegenerator: без
          регистрации шаг → failed, план продолжается — паритет modeErr)
        - Записывает result в шаг, отправляет plan_step_done
     e. После исполнения базовых шагов: пересчитывает каскад
        (cascade-analyzer) — по факту 2.2 ОДИН раз, паритет исходника
        («после каждого шага» 01 §4.5 п.8 — «может»); новые downstream →
        pending-шаги, plan_steps_added через WebSocket
     f. Обновляет synthesis.version, статус плана → "done"
   
   - cancelPlan(planId): прерывает исполнение
   - при обрыве шага (kind из таксономии стриминга): pausedState kind="plan"
     → generation_paused kind="plan" (03 §3.2; отдельного plan_paused
     нет; при user-abort сообщение не шлётся — тип исключает, клиент
     берёт паузу из GET /:id); продолжение — resumePlan из
     pause-resume-service (1.4b)

3. Расширение server/ws/handler.ts:
   - Обработка execute_plan → запуск executePlan
   - Обработка confirm_step (для пошагового режима)
   - Обработка cancel

4. server/routes/plans.ts — добавить:
   - POST /syntheses/:id/plans/:planId/execute

5. server/routes/generation.ts:
   - POST /syntheses/:id/regenerate/:sectionKey
   - POST /syntheses/:id/regenerate-subsection

6. setPlanResumeExecutor — регистрация исполнителя планов в
   pause-resume-service (долг TODO(2.2) главы 1.4b; до аудита
   2026-07-31 в протоколе не значился):
   сейчас resume_plan с retry / skip_step отдаёт RESUME_INVALID с
   пояснением, потому что исполнителя некому вызвать. После
   plan-executor.ts (пункт 2) зарегистрировать его и убрать заглушку;
   проверить, что пауза внутри исполнения плана возобновляется, а не
   только пауза внутри генерации раздела.
```

**Последующие запросы:**
- «Протестируй: создай синтез с 5 разделами, создай план regen=["graph"], запусти execute — проверь, что graph перегенерирован, genLog содержит запись, ctxLog обновлён»
- «Протестируй каскад: regen=["graph"] → после исполнения, план должен предложить перегенерировать theses (если theses зависит от graph). Проверь plan_steps_added через WebSocket»
  (по факту 2.2: каскад предвычисляется createPlan (2.1) — «предложение
  theses» = pending-шаги уже в плане при создании, после исполнения
  regen-плана НОВЫХ шагов не возникает и plan_steps_added для theses
  невозможен по построению; живое plan_steps_added тест проверяет на
  структурном пост-шаге add/delete-планов)
- «Протестируй deleteSection: удали "history", проверь что sectionOrder обновлён, номера перенумерованы»
- «Протестируй addSection: добавь "dialogue" к синтезу без dialogue, проверь позицию в sectionOrder и нумерацию»
- «Edge case: regenerateSubsection — подраздел с INTRA_DEPS. Проверь, что extractRelevantIntraSectionContext возвращает только зависимые подразделы, а не все»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 2.2 (2026-08-09):** беседа закрыта; запросы 2-6 — единым
тестом `tests/test-22-requests2-6.mjs` (живой сервер + мок-SSE + WS),
53 ✓ / 0 ✗ ×2; браузер не нужен. Интеграция — секции 2m/4s/5p в
`server/integration-check.mts`; там же исправлен ДЕФЕКТ 2.1 (финальный
гейт errs стоял до секции 4r — её ошибки не проверялись; перенесён в
конец). Журнал — глава 2.2 `NEXT-CONTEXT.md`. Адаптации: (а) executor
исполняет только confirmed, pending исполняются поштучно confirm_step
(после — done); (б) refreshSumDef на сервере упрощён (defs всегда
строятся заново); (в) renumberSectionRefs — строковая замена §N вместо
TreeWalker; (г) user-abort плана СОЗДАЁТ pausedState kind='plan'
(паритет исходника; cancelPlan = WS cancel → abort слота), WS-сообщение
при этом не шлётся; (д) разъём setModeRegenerator до 4.1; (е)
confirm деградации при skip реализован данными skipDegrades
(PausedStateGen + generation_paused) и window.confirm в PauseModal;
(ж) standalone-перегенерация не создаёт pausedState (stream_error,
паритет [20716]); (з) add/delete — только через планы; (и) спека
фрагмента относила функции к regeneration-service.ts — фактический
модуль generation-service.ts (05/07), заголовки фрагмента поправлены.

---

### Беседа 2.3: Edit Modal + Cascade Panel (клиент)

**Контекст:**
- `03-specification.md` (секции 1.5 Редактирование, 2.3 Sections, 2.6 Edit Plans, 3.2 WebSocket)
- `05-file-structure.md` (секция client/components/edit/)
- Из предыдущих бесед: `shared/types/edit-plan.ts`, `shared/types/ws-messages.ts`, `client/hooks/useWebSocket.ts`, `client/stores/synthesis-store.ts` (из 1.6b), `client/api/client.ts`, `server/routes/plans.ts` (2.1 + 2.2), `server/routes/sections.ts` (1.6 — GET /sections и /:key/context)
- Из 1.6b: `SynthesisPage.tsx`, `SectionView.tsx` — модалка открывается поверх страницы синтеза; долг 1.6b:
  `makeSectionCtxDisclosure` (disclosure секционного контекста —
  sec_context уже в SectionFull) портируется здесь (§12)
- Исходник: openEditModal … подразделовая перегенерация UI (**только** как визуальный референс UI)

> **ФАКТ 2.3 (2026-08-20)**: врезка ниже оказалась неполной — live-каскаду
> и панели подраздела транспорта НЕ хватало (CascadeImpact и
> getIntraDependents/getCrossSecDependents/estimateSubsectionCost не были
> доступны клиенту), а extGraphMetrics было некуда писать. Беседа 2.3
> добавила read-only превью POST /plans/impact и POST /subsection-impact
> (03 §2.6/§2.5) и расширила PATCH /syntheses/:id полем extGraphMetrics —
> из вилки «черновик-план на каждый клик vs превью» выбрано превью
> (надёжнее: без мусора в edit_plans и гонок). Карточки результатов
> режимов в модалке опущены до 4.1 (нет routes/modes и данных); гейты
> openEditModal (API_KEY / DOC_STATE.incomplete) — до 6.1/4.3
> [ФАКТ 4.3: incomplete-доля ВЫРОЖДЕНА — колонки в схеме нет,
> критичность импорта уходит клиенту в warnings ответа POST
> /syntheses/import (подтверждение — на ImportPage ДО отправки);
> редактирование импортированного не блокируется — паритет исходника,
> позволявшего то же после confirm. За 6.1 остаётся только
> API_KEY-доля].
>
> **Транспорт готов** (аудит 2026-07-30): `server/routes/plans.ts`
> создаёт беседа 2.1 и расширяет 2.2; `POST /syntheses/:id/regenerate-subsection`
> и WS-сообщения `regen_subsection` описаны в 03 §2.3/§3.2 и реализуются
> беседой 2.2. В отличие от 1.6/1.7, здесь клиентская беседа стоит
> после своего сервера — ничего дописывать не нужно.

**Извлечение:**
```bash
# Извлечь openEditModal … подразделовая перегенерация UI
grep -n 'function openEditModal' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Создаю UI редактирования синтеза.

Прикреплён фрагмент исходника (openEditModal … подразделовая перегенерация UI) — как визуальный референс 
структуры модального окна редактирования. НЕ копировать HTML — создать React.

Создай:
1. client/hooks/useEditPlan.ts:
   - createPlan(actions) → POST /plans → EditPlan
   - updateSteps(planId, updates) → PATCH /plans
   - executePlan(planId) → подписка на WebSocket (plan_step_started, 
     plan_step_done, plan_steps_added)
   - Zustand-состояние: currentPlan, isExecuting, stepResults

2. client/components/edit/EditModal.tsx:
   - Модальное окно на весь экран (как в исходнике)
   - Список разделов с чекбоксами "Перегенерировать" / "Удалить"
   - Поле secCtx для каждого раздела
   - Секция подразделовой перегенерации (SubsectionRegenPanel)
   - Кнопка ▶ Выполнить план
   - Футер: количество действий, оценка стоимости

3. client/components/edit/EditSectionCard.tsx:
   - Карточка одного раздела
   - Чекбоксы перегенерации/удаления (взаимоисключающие)
   - Поле контекста (скрыто, разворачивается; GET /sections/:key/context)
   - Индикатор изменённости: ФАКТ — префикс «⟳ » в заголовке карточки
     (renderEditSections [18521]: `${isEdited ? "⟳ " : ""}`; формулировка
     «✓ изменён» была приблизительной)
   - Бейдж качества контекста (contextQualityScore, ≥90 зелёный):
     ВНИМАНИЕ — до беседы 2.4 (context-quality.ts) роут отдаёт null.
     Компонент обязан корректно рисовать состояние «нет оценки»
     (бейдж скрыт либо нейтрально-серый), а не считать null нулём.
     Цветовую шкалу вводит 2.4; здесь — только место под неё.

4. client/components/edit/SubsectionRegenPanel.tsx:
   - Список подразделов текущего раздела
   - Кнопка "⟳" для каждого подраздела
   - Поле userNote
   - Чекбокс "Включить текущее содержимое"
   - Показ зависимых подразделов (intra-deps)
   - Оценка стоимости подраздела

5. client/components/edit/CascadePanel.tsx:
   - Downstream: затронутые, но не включённые в план (кнопка "отметить ↑")
   - Upstream: отсутствующие зависимости для добавляемых разделов
   - Активные подстановки
   - Затронутые режимы
   - Рекомендации по добавлению

   Карточка «Структура документа устарела»:
   - В EditModal, над списком разделов
   - Сравнение syntheses.structureSections с sectionOrder
     (в исходнике — DOC_STATE.structureSections против DOC_STATE.sectionOrder)
   - Если null (старый файл) → «актуальность не определена, рекомендуется обновить»
   - Снимок структуры заполняет беседа 1.6 (при создании синтеза) и
     обновляет 2.2 (после исполнения плана). До аудита 2026-07-30
     колонка не заполнялась НИКЕМ, и карточка всегда попадала бы в
     ветку null — если 1.6 снимок не сделала, оставить только эту ветку
     и завести TODO, не изобретая клиентский суррогат снимка.
   - Кнопка «Обновить» → regenStructureFromEditModal()
   - При перегенерации графа: чекбокс extGraphMetrics (DOC_STATE.params.extGraphMetrics)

6. client/components/edit/EditPlanPanel.tsx:
   - Визуализация плана: список шагов с иконками (◯/⟳/✓/✗)
   - Каскадные шаги выделены визуально
   - Прогресс исполнения в реальном времени (WebSocket)
   - Кнопки подтвердить/пропустить для каждого шага

7. client/components/edit/AddSectionPanel.tsx:
   - Чекбоксы доступных для добавления разделов
   - Поле контекста для каждого
   - Предупреждения о зависимостях

8. client/api/plans.ts:
   - createPlan, getPlan, updatePlan, executePlan, deletePlan
```

**Последующие запросы:**
- «Протестируй поток: открыть EditModal → отметить graph для перегенерации → CascadePanel должен показать downstream (ФАКТ по конфигам: glossary, theses, dialogue) → нажать "отметить ↑" для theses → кнопка ▶ активируется»
- «Протестируй исполнение: «▶ Составить план» (draft, шаги ●) → «▶ Исполнить» → EditPlanPanel показывает прогресс шагов → по завершении все шаги ✓» — ФАКТ 2.3: двухшаговый workflow 01 §4.5 вместо цепочки confirm() исходника (одобрено)
- «Протестируй подразделовую перегенерацию: открыть SubsectionRegenPanel для "graph" → выбрать "Таблица категорий" → показать зависимые подразделы»
- «Проверь responsive: модальное окно на мобильных (< 768px)»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 2.4: Лог контекста и генерации

**Контекст:**
- `02-data-model.md` (таблицы generation_log, context_log)
- `04-code-reuse-map.md` (секция 2.7 — mode-service; formatCtxLog/colorizeLog — таблица §3)
- `03-specification.md` (секции 2.3 Sections, 2.12 Context Log)
- Из предыдущих бесед: `server/db/schema.ts`, `shared/types/generation.ts`, `client/api/client.ts`, `client/components/document/DocumentFooter.tsx` (из 1.6b — в него добавляется кнопка лога), `server/routes/sections.ts` (1.6)
- Исходник: formatCtxLog + colorizeLog (вся система логов)

> **Порядок (аудит 2026-07-30):** беседу 2.4 стоит вести ПЕРЕД 2.3.
> `context-quality.ts` создаётся здесь, а бейдж качества контекста
> нужен уже в `EditSectionCard` (2.3) — см. §11. Если порядок
> сохраняется прежним, 2.3 рисует состояние «нет оценки» по `null`.

**Извлечение:**
```bash
# Извлечь formatCtxLog + colorizeLog (вся система логов)
grep -n 'function formatCtxLog' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Портирую систему логирования контекста и генерации.

Прикреплён фрагмент исходника (formatCtxLog + colorizeLog (вся система логов)): formatCtxLog, colorizeLog,
refreshCtxLogIfOpen, viewCtxLog, downloadPrompts.

Создай:
1. server/services/log-formatter.ts:
   - formatCtxLog(synthesisId): 
     Серверный аналог formatCtxLog(). Загружает genLog и ctxLog из БД,
     форматирует в plain text с той же структурой:
     заголовок → общие элементы → для каждого genLog entry: ВХОД/ВЫХОД/СЕКЦИИ.
     Адаптация: genCommon загружается из отдельного поля или вычисляется.
   - formatCtxLogHTML(synthesisId):
     Возвращает { text: string, html: string } — plain + colorized
     (адаптация: `formatCtxLogHTML` исходника [24090] возвращал только
     html; text добавлен формой 03 §2.12)

2. server/services/context-quality.ts (04 §2.1, 01-arch §4.15 п.3; модуль не создавался ни одной беседой — дыра, найденная в 1.3):
   - getSectionContextQuality(synthesisId, sectionKey) — по ПОСЛЕДНЕЙ записи context_log раздела: score = round(reqFound/reqTotal × 70 + min(1, totalUsed/budget) × 30) (края — порт [5571]: reqTotal=0 → reqScore=1; budget=0 → usage=0) и issues («Отсутствовали обязательные: …», «N контекст(ов) пропущено из-за бюджета», «N контекст(ов) обрезано», «N подстановок(ки)»);
   - score отдаётся в GET /syntheses/:id/sections → цветной бейдж качества на карточке раздела в Edit Modal (EditSectionCard.tsx, беседа 2.3: ≥90 зелёный). Беседа 2.3 зависит от этого модуля — см. §11.

3. server/routes/logs.ts:
   - GET /syntheses/:id/logs/generation → массив GenerationLogEntry из БД
   - GET /syntheses/:id/logs/context → массив ContextLogEntry из БД
   - GET /syntheses/:id/logs/formatted → { text, html }
   - GET /syntheses/:id/logs/prompts → текстовый дамп всех промптов
     (аналог downloadPrompts/formatPromptsForExport, formatPromptsForExport())
     v10: `formatPromptsForExport` использует `reconstructSkeleton()` как fallback
     для записей без `_promptSkeleton` (импортированные файлы).
     ВНИМАНИЕ (аудит 2026-07-30): `server/services/prompt-reconstruction.ts`
     с `reconstructSkeleton()` создаётся беседой 4.2 — на полторы фазы
     позже. Здесь fallback НЕ реализуется: записи без `_promptSkeleton`
     помечаются «промпт недоступен (импортированная запись)», ставится
     TODO(4.2), а подключение реконструкции делает сама 4.2.
     Регулярки СРЕЗА параметров v10 [24410/24443] несут маркеры
     `КОНТЕКСТ ДРУГИХ` и `Перегенерируй ТОЛЬКО`; маркер
     `КОНТЕКСТ КОНЦЕПЦИЙ-УЧАСТНИКОВ` — в регулярках СВЁРТКИ скелета
     [8546], портированных generation-service ещё беседой 1.4
     (уточнение 24/тесты: прежняя формулировка смешивала оба места).

4. client/components/logs/colorize-log.ts:
   - colorizeLog(plainText): клиентская раскраска.
     Порт colorizeLog(). Паттерны: ═══ заголовки, ✓/✗/◦/◌ записи контекста,
     ВХОД/ВЫХОД метки, стоимость, процент бюджета.
     Цветовая палитра: gold, blue, green, red, dim, violet — как в исходнике.

5. client/components/logs/ContextLogViewer.tsx:
   - Модальное окно: кнопка открытия в DocumentFooter
   - Загрузка GET /logs/formatted
   - Рендер HTML (dangerouslySetInnerHTML для colorized)
   - Кнопка "Копировать" (plain text)
   - Кнопка "Скачать промпты"
   - Информация: количество разделов, строк
   - Live-обновление при открытом окне во время генерации:
     перезапрос GET /logs/formatted по УЖЕ СУЩЕСТВУЮЩИМ событиям
     завершения раздела (см. §3.2). Отдельных WS-сообщений про лог
     в shared/types/ws-messages.ts нет и заводить их не нужно —
     иначе клиент разойдётся с сервером (аудит 2026-07-30)

6. Интеграция: добавить кнопку "◈ Лог" в DocumentFooter.tsx (из 1.6b)
```

**Последующие запросы:**
- «Протестируй: сгенерируй синтез с 3 разделами, открой лог — проверь что все 3 раздела есть, формат совпадает с исходником»
- «Проверь colorizeLog: строки с ✓ должны быть зелёные, ✗ — красные, ◦ — золотые, бюджеты — dim»
- «Протестируй live-обновление: открой лог, запусти перегенерацию раздела — лог должен обновляться в реальном времени»
- «Проверь форматирование: version-marker, deletion-marker — корректно отображаются»

> **Итоги тестов (2026-08-17, tests/test-24-requests2-5.mjs, 51 ✓ ×2):**
> 1) заголовки блоков лога — реестровые `section_label` из genLog
> (у перегенерации суффикс « [перегенерация]»), НЕ `KEY_LABELS`;
> `KEY_LABELS` — только в `actions` version-marker'а; 2) live-обновление
> потребовало ПОСТОЯННОЙ viewOnly-подписки в `SynthesisPage`
> (standalone `POST /regenerate/:key` не меняет `status` синтеза —
> условная подписка не открывала WS; аналог `refreshCtxLogIfOpen`
> [23306]); 3) standalone-перегенерация завершается `section_done` без
> `generation_complete`; 4) `WsPlanStepDone` несёт
> `{ planId, stepIndex, result }` без объекта шага — ожидания строить
> на `plan_updated` + контроле по БД; 5) порядок блоков хронологический:
> ВЕРСИЯ → УДАЛЁН → перегенерированный раздел (delete-шаги плана
> исполняются раньше regen — порядок v10, edit-planner 2.1);
> 6) интеграционная правка 2.2: `bumpVersionsForPlan` пишет
> `metadata.version` (иначе «ВЕРСИЯ vN» печатается без номера).

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

## 5. Протокол Фазы 3: Мета-синтез и наследование

### Беседа 3.1: Meta-Synthesis Service + Lineage Service (бэкенд)

**Контекст для загрузки:**
- `01-architecture.md` (секция 4.6 Graph Service — граф наследования)
- `02-data-model.md` (таблица synthesis_lineage + рекурсивный CTE)
- `03-specification.md` (секции 1.6 Мета-синтез, 2.3–2.4 Elements, 2.8 Lineage)
- Из предыдущих бесед: `server/services/context-extractor.ts` (из 1.3), `server/services/generation-service.ts` (из 1.4/2.2), `server/db/schema.ts`, `shared/types/lineage.ts`
- Исходник: importConceptAsParticipant, checkGenealogyOverlaps, collectPhilosopherAncestors, reconstructGenealogy
  `importConceptAsParticipant` на клиенте вызывается из `parseConceptFile()` пула.

  В generation-service (Беседа 1.4) при записи genCommon:
  - `genCommon.conceptBlockSizes` — массив { name, chars } для каждой
    концепции-участника. Используется reconstructBaseCtxSkeleton (Беседа 4.2)
    для восстановления маркеров вместо содержимого при экспорте промптов.

**Извлечение:**
```bash
# Извлечь importConceptAsParticipant … reconstructGenealogy
grep -n 'function importConceptAsParticipant' philosynth.html | head -1  # найти начало, затем извлечь блок
# Извлечь checkGenealogyOverlaps() и вспомогательные функции генеалогии
grep -n 'function checkGenealogyOverlaps' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Реализую мета-синтез и навигацию по графу наследования.

Прикреплены: архитектура (граф наследования), модель данных (synthesis_lineage + CTE),
спецификация (Мета-синтез, Lineage API), context-extractor.ts, generation-service.ts,
schema.ts, и фрагмент исходника (importConceptAsParticipant,
checkGenealogyOverlaps, collectPhilosopherAncestors, reconstructGenealogy).

Создай:
1. server/services/meta-synthesis-service.ts:
   - loadConceptContext(synthesisId):
     Загружает из БД данные для использования концепции как участника:
     capsule (из syntheses.capsule_html → extractCapsuleText),
     graphNodes (из categories → форматирование в таблицу),
     graphEdges (из category_edges),
     glossaryCompact (из glossary_terms),
     thesesSummary (из theses),
     dialogueConcepts (из sections WHERE key='dialogue' → парсинг),
     dialogueSynthesis (dialogue:synthesis — аналитический комментарий),
     goals, portraits, tensions (из sections WHERE key='sum' → парсинг).
     (Ревизия 3.1: исходник извлекает 10 полей — в списке выше
     отсутствовали portraits и dialogueSynthesis, оба входят в
     PARENT_FIELD_ORDER и уровневые PARENT_DEPS; порт — по исходнику.)
     Аналог importConceptAsParticipant (importConceptAsParticipant()), но из БД.
     v10: на клиенте данные берутся из пула (`refreshPoolParticipant()`);
     сервис загружает из БД аналогично.

   - validateConceptForMetaSynthesis(synthesisId):
     Проверяет обязательные разделы: sum, glossary, theses, critique, 
     (graph ИЛИ dialogue), capsule.
     Возвращает { valid: boolean, missing: string[], warnings: string[] }

   - checkGenealogyOverlaps(participants):
     Порт checkGenealogyOverlaps(). Находит пересечения философов-предков между 
     концепциями-участниками.
     Возвращает массив предупреждений.

   - isAncestor(synthesisIdA, synthesisIdB):
     Рекурсивная проверка через lineage CTE (серверная).

   - collectPhilosopherAncestors(synthesisId):
     Рекурсивный CTE из synthesis_lineage. Возвращает Set<string> философов.

   - conceptContextBlockFull(p): legacy-монолит для документов со
     схемой 'monolithic' до миграции (карта 04 §1.10; ревизия 3.1 —
     в запросе отсутствовал; КВИРК исходника: без portraits/graphEdges).
   - conceptContextBlockSelective(p, sectionKey, explicitSpec?):
     Формирует блок контекста концепций пер-секционно: состав полей — по
     resolveParentDeps/resolveParentDepsForSubsection (parent-context.ts,
     01 §4.13); intra-spec может только сужать section-spec.
     Плюс: applyBudgetPressure по keepFullBudget; миграция схемы
     monolithic → selective-v1 при первой перегенерации (маркер в genLog);
     buildParentSpecForLog → parent_spec в context_log.

2. server/services/lineage-service.ts:
   - getAncestors(synthesisId, maxDepth):
     Рекурсивный CTE вверх. Возвращает LineageNode (дерево).
   - getDescendants(synthesisId, maxDepth):
     Рекурсивный CTE вниз. Возвращает LineageNode[].
   - searchByPhilosophers(names: string[]):
     Находит синтезы, в генеалогии которых есть ВСЕ указанные философы.
     SQL: WITH RECURSIVE + HAVING count = names.length
   - createLineageRecords(synthesisId, participants):
     Записывает synthesis_lineage при создании синтеза.

3. server/routes/lineage.ts:
   - GET /syntheses/:id/lineage/ancestors?depth=10
   - GET /syntheses/:id/lineage/descendants?depth=5
   - GET /lineage/search?philosopher=Кант&philosopher=Хайдеггер

4. Расширение server/services/generation-service.ts:
   - В generateSynthesis: если participants содержит type="synthesis",
     вызвать loadConceptContext для каждого, добавить в промпт через
     провайдер baseCtxParents (conceptContextBlockFull для legacy
     'monolithic', иначе conceptContextBlockSelective; функции
     «buildConceptContextBlock» в исходнике нет — ревизия 3.1),
     записать synthesis_lineage.

5. Расширение server/routes/syntheses.ts:
   - POST /syntheses: принимать participants: ParticipantInput[],
     валидировать через validateConceptForMetaSynthesis,
     передавать в generateSynthesis.

6. Долги журнала, адресованные этой беседе (аудит 2026-07-31 — в
   протоколе они не значились, хотя в NEXT-CONTEXT адресованы 3.1):
   - registerParentContextProvider: заменить стаб, зарегистрированный
     беседой 1.4, настоящим провайдером родительского контекста
     (TODO(3.1) главы 1.4). Пока стоит заглушка, parent-context
     отдаёт пустоту, и мета-синтез собирает промпт без родителей.
   - Наполнение parentFieldsUsed, conceptBlockSizes и
     parentSpecBySection реальными значениями (TODO(3.1) главы 1.4;
     parentFieldsUsed до сих пор упоминался только в беседе 1.3).
   - Серверная поддержка участников-концепций: приём type="synthesis"
     в participants. Это снимает гейт мета-синтеза, поставленный
     беседой 1.5b в SynthesisForm — клиентская половина снятия
     вписана в беседу 3.2, серверная делается здесь. Без этой пары
     форма продолжит блокировать сабмит с ☑-концепциями.
   - Данные для estimate-diff в FullBudgetPreview (TODO(3.1) главы
     1.5b): оценка с учётом участников-концепций; отрисовка разницы —
     беседа 3.2.
```

**Последующие запросы:**
- «Протестируй: создай два синтеза (Кант+Гегель и Хайдеггер+Сартр), затем мета-синтез из обоих — проверь synthesis_lineage (4 записи: 2 philosopher + 2 synthesis), проверь что контекст обоих концепций попал в промпт»
- «Протестируй searchByPhilosophers: поиск по [Кант] — должен найти и прямой синтез с Кантом, и мета-синтез (транзитивно)»
- «Протестируй checkGenealogyOverlaps: два концепта с общим философом — warning должен содержать имя философа»
- «Протестируй getAncestors для мета-синтеза — дерево должно содержать 2 уровня: концепции → философы»
- «Edge case: мета-синтез с участником, у которого нет glossary — validateConceptForMetaSynthesis возвращает { valid: false, missing: ["glossary"] }»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 3.2: Concept Participants + Genealogy Tree (клиент)

**Контекст:**
- `03-specification.md` (секции 1.6 Мета-синтез, 2.2 Syntheses, 2.8 Lineage)
- `05-file-structure.md` (synthesis/, lineage/)
- Из предыдущих бесед: `shared/types/lineage.ts`, `client/api/client.ts`, `client/stores/synthesis-store.ts` (из 1.6b), `client/components/synthesis/SynthesisForm.tsx` (из 1.5)
- **Из 1.5b (ЗАКРЫТА):** `client/components/pool/ConceptPool.tsx`, `PoolCard.tsx`, `client/stores/pool-store.ts`, `client/utils/concept-file.ts` — пул уже существует
- Из 1.6b: `SynthesisPage.tsx`, `CatalogPage.tsx`, `SynthesisCard.tsx` — точки интеграции пунктов 4–5
- Из 3.1: `server/routes/lineage.ts` (ancestors / descendants / search) — транспорт готов
- Исходник: renderGenealogyTree() (renderGenealogyTree — **визуальный** референс)

**Извлечение:**
```bash
# Извлечь renderGenealogyTree()
grep -n 'function renderGenealogyTree' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Создаю UI для мета-синтеза и генеалогического дерева.

Прикреплён фрагмент исходника: renderGenealogyTree (CSS org-chart).
Визуальный референс — не копировать HTML, создать React.

> **v10**: `ConceptParticipants.tsx` как отдельный компонент заменён **Unified Concept Pool**.
> Пул (`client/components/pool/ConceptPool.tsx`) объединяет загрузку, просмотр (◉) и выбор
> для мета-синтеза (☑). API пула: `addToPool`, `renamePoolConcept`, `removeFromPool`,
> `toggleSynthParticipant`, `selectForViewing`.
> Перед генерацией вызывается `refreshAllSynthParticipants()`.
>
> **По факту 1.5b (беседа ЗАКРЫТА):** пул уже реализован — `ConceptPool.tsx`,
> `PoolCard.tsx`, `pool-store.ts`, `concept-file.ts` лежат в репозитории.
> `snapshotCurrentState` намеренно НЕ портирован: локальных правок концепции
> в сервисе нет, снимок вырождается (см. шапку `pool-store.ts` и главу 1.5b
> в NEXT-CONTEXT). Требовать его здесь нельзя — это противоречие внутри 07,
> снятое аудитом 2026-07-30.

Создай:
1. ДОПОЛНЕНИЕ существующего пула (создан беседой 1.5b — заново НЕ создавать):
   уже есть: загрузка из файла и по URL, карточка с ☑/◉/✎/✕, проверка
   пригодности (toggleSynthParticipant), просмотр (selectForViewing),
   refreshAllSynthParticipants перед генерацией, блокировка сабмита
   с ☑-концепциями до появления серверной поддержки мета-синтеза.
   Добавить здесь:
   - Предупреждения о генеалогических пересечениях (пересечение предков
     выбранных ☑-концепций — по GET /syntheses/:id/lineage/ancestors)
     > **По факту 3.2:** формула «по GET ancestors» верна только для
     > концепций ИЗ КАТАЛОГА; файловые записи пула в БД отсутствуют —
     > их предки берутся из participant.genealogy
     > (reconstructGenealogy + restoreCapsulesFromHTML). Тексты —
     > checkGenealogyOverlaps 1:1 (дрейф-контроль клиент↔сервер —
     > integration-check 4w). В исходнике функция ОПРЕДЕЛЕНА, но не
     > ВЫЗВАНА (мёртвый код) — реализован предполётный confirm;
     > серверные warnings POST рисуются неблокирующе (синтез создан).
   - Снятие блокировки сабмита, если 3.1 уже принимает участников-концепции
     > **По факту 3.2:** снято только для КАТАЛОЖНЫХ концепций
     > (представимы в ParticipantInput {type:'synthesis', synthesisId});
     > пул дополнен пикером «+ Из каталога» (свои ready + публичные,
     > дедупликация; фабрика catalogPreviewToPoolEntry, ключ
     > дедупликации filename="catalog:<id>"). ФАЙЛОВЫЕ концепции
     > блокируются до серверного импорта (4.3) с точечным текстом
     > ошибки. Бейдж п.5 питается аддитивным SynthesisPreview.
     > hasConceptParents (loadConceptParentFlags — оба списка каталога
     > и /lineage/search).
   - Порт `reconstructGenealogy` (отложен в 1.5b с пометкой TODO(3.1/3.2)) —
     без него дерево для импортированной концепции не строится;
   - Порт `restoreCapsulesFromHTML`: журнал 1.5b адресует его ЭТОЙ
     беседе (TODO(3.2)). Второй предпатч ошибочно отложил его до 4.3 —
     исправлено аудитом 2026-07-31. За беседой 4.3 остаётся серверный
     импорт файлов, а не восстановление капсул в клиентском пуле.

2. client/components/lineage/GenealogyTree.tsx:
   - CSS org-chart (как в исходнике: .gen-tree, .gen-card, .gen-phil)
   - Рекурсивный рендер LineageNode:
     - Философ → простой блок с именем
     - Концепция → карточка (имя, метод×уровень, зерно в <details> для родителей / усечённое для корня (v10), капсула в <details>)
   - Подключаемые стили: светлый (.gen-tree-light) и тёмный
   - Вертикальная раскладка при > 4 участниках

3. client/components/lineage/LineageSearch.tsx:
   - Поиск концепций по философам-предкам
   - Мульти-селект философов
   - Результаты: список карточек SynthesisCard

4. Интеграция с SynthesisPage.tsx:
   - Секция "Генеалогия" под шапкой документа (для мета-синтезов)
   - Ссылки на родительские концепции (кликабельные)
   
5. Интеграция с CatalogPage.tsx:
   - Фильтр "Потомки концепции X" — через GET /syntheses/:id/lineage/descendants
     (в 03 §2.2 у GET /syntheses такого параметра нет и добавлять его
      не нужно: список потомков приходит отдельным запросом, каталог
      лишь отображает пересечение — аудит 2026-07-30)
   - В карточке синтеза: badge "мета-синтез" если есть parent_synthesis_id

6. client/api/lineage.ts:
   - getAncestors(id, depth), getDescendants(id, depth), searchByPhilosophers(names)

7. Долги SynthesisForm, оставшиеся без адресата (аудит 2026-07-31):
   - updateCompatAdvisor / toggleCompatPanel / applyReplacement —
     кнопки применения замен в CompatAdvisor. Заведены беседой 1.1,
     адресованы 1.5, в 1.5 не сделаны и переадресованы в «TODO(2.x)»
     БЕЗ номера беседы; в протоколе не упоминались ни разу. Отданы
     сюда как единственной непроведённой беседе, которая правит
     SynthesisForm.tsx. Сервер (POST /syntheses/advice) готов с 1.5 —
     нужна только клиентская часть: панель, кнопка применения и
     пересчёт выбранных разделов.
   - estimate-diff в FullBudgetPreview (TODO(3.1) главы 1.5b):
     отрисовка разницы оценки с участниками-концепциями и без.
     Данные приходят из беседы 3.1.
```

**Последующие запросы:**
- «Протестируй поток: CreateSynthesis → добавить 2 концепции из каталога → проверить что карточки отображаются → создать синтез → на SynthesisPage отображается дерево генеалогии»
- «Протестируй GenealogyTree: мета-синтез 2-го уровня (мета-синтез из мета-синтезов) — дерево должно быть 3 уровня глубины»
- «Протестируй LineageSearch: ввести "Кант" → результаты включают все синтезы с Кантом в генеалогии (прямые и транзитивные)»
- «Проверь GenealogyTree на мобильных: горизонтальный скролл, вертикальная раскладка»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

## 6. Протокол Фазы 4: Режимы и экспорт

### Беседа 4.1: Mode Service (бэкенд + клиент)

**Контекст для загрузки:**
- `01-architecture.md` (секция 4.2 — режимы в Synthesis Engine)
- `02-data-model.md` (таблица mode_results)
- `03-specification.md` (секции 1.7 Режимы, 2.7 Modes API, 3.2 WebSocket — mode_done)
- Из предыдущих бесед: `server/services/streaming-manager.ts`, `server/services/context-builder.ts`, `server/services/prompt-registry.ts`, `server/ws/handler.ts`, `client/hooks/useWebSocket.ts`
- Исходник: MODE_CONFIG … regenerateModeSilent (вся система режимов)

**Извлечение:**
```bash
# Извлечь MODE_CONFIG … regenerateModeSilent (вся система режимов)
grep -n 'MODE_CONFIG' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Реализую систему режимов (оппонент, переводчик, временной срез).

Прикреплён фрагмент исходника (MODE_CONFIG … regenerateModeSilent (вся система режимов)): MODE_CONFIG, buildModeContext,
runMode, regenerateModeSilent, openModeModal, buildModeTabsBar, switchModeTab.

Создай:
1. server/services/mode-service.ts:
   - getModeConfig(modeKey):
     Возвращает конфиг режима. Промпты из Prompt Registry 
     (ключи: "mode.adversarial.prompt", "mode.translator.prompt", 
     "mode.timeslice.prompt"). Статические поля (title, desc, 
     paramLabel, paramPlaceholder, suggestions) — из конфига или хардкод.
   
   - buildModeContext(modeKey, synthesisId):
     Порт buildModeContext(). Собирает контекст из разделов синтеза:
     capsule + graphNodes + theses + glossary + dialogue + critique
     (через context-extractor).
   
   - checkModeDeps(modeKey, synthesisId):
     Проверяет наличие необходимых разделов для режима.
     Возвращает предупреждения.
   
   - runMode(synthesisId, modeKey, paramValue, apiKey):
     Порт runMode(). Собирает промпт (config.buildPrompt + context),
     стримит через streaming-manager, сохраняет в mode_results,
     записывает genLog, возвращает usage.
   
   - regenerateModeSilent(synthesisId, modeKey, resultIndex):
     Порт regenerateModeSilent(). Перегенерирует один результат по его индексу.

2. server/routes/modes.ts:
   - POST /syntheses/:id/modes/:modeKey/run { param }
   - GET /syntheses/:id/modes → все режимы с результатами
   - GET /syntheses/:id/modes/:modeKey → результаты одного режима
   - DELETE /syntheses/:id/modes/:modeKey/:index

3. Расширение server/ws/handler.ts:
   - Обработка start_mode → runMode, отправка stream_delta, mode_done

4. client/components/modes/ModeModal.tsx:
   - Модальное окно: заголовок, описание, поле параметра
   - Кнопки-подсказки (suggestions)
   - Предупреждения о зависимостях
   - Кнопка "Генерировать" со спиннером
   - Оценка стоимости
   - Вкладки результатов (ModeTabBar)
   - Контент результата (ModeContent)

5. client/components/modes/ModeTabBar.tsx:
   - Вкладки: параметр + дата
   - Кнопка × для удаления вкладки
   - Спиннер для генерирующейся вкладки

6. client/components/modes/ModeContent.tsx:
   - Рендер HTML-результата (dangerouslySetInnerHTML)

7. client/api/modes.ts: runMode, getModes, deleteMode

8. Интеграция с SynthesisPage.tsx:
   - Кнопки режимов (◈ Оппонент, ◈ Переводчик, ◈ Временной срез)
   - Отображение count результатов на кнопке
```

**Последующие запросы:**
- «Протестируй: открой ModeModal "adversarial" → введи "Кант" → генерация → результат появляется во вкладке → закрой и открой заново — вкладка сохранена»
- «Протестируй несколько запусков: 3 запуска "adversarial" с разными параметрами → 3 вкладки → переключение, удаление средней»
- «Протестируй checkModeDeps: режим для синтеза без capsule — должно быть предупреждение»
- «Проверь стоимость: estimateModeCost → отображается в ModeModal»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 4.1 (2026-08-28):**
- Транспорт п.2: GET /modes/:modeKey отдаёт { results, warnings,
  estimate } — предупреждения checkModeDeps и оценка (fail-open
  null) едут вместе с результатами, отдельных эндпоинтов нет.
  Чтение обоих GET — владелец ИЛИ публичный синтез; run/DELETE —
  владелец + 409-гейт активной генерации (DELETE под гейтом —
  отступление, см. журнал).
- runMode: дельты стрима под sectionKey "mode:{modeKey}"
  (клиентский guard в useStreamingGeneration отсекает их от
  прогресса генерации); индекс результата = позиция строки по
  created_at ASC; квирки исходника сохранены (taskChars =
  prompt − ctx; в silent — промпт целиком, catch без учёта
  usage); пауз у режимов нет.
- regenerateModeSilent зарегистрирован в setModeRegenerator
  ПОБОЧНЫМ ЭФФЕКТОМ импорта mode-service (долг §12 закрыт) —
  шаги regen_mode планов работают.
- Клиентская статика MODE_UI (ModeModal) — копия MODE_CONFIG;
  дрейф в обе стороны сторожит integration-check 4x.
- Довыполнение (2026-08-28, той же беседой): оба долга §12 ЗАКРЫТЫ —
  панель «РЕЖИМЫ» EditModal (ModeResultsPanel) с планом
  modeRegen/modeRemove и кнопкой «отметить ↑» E5; подраздельный
  каскад режимов через новый POST /modes/:modeKey/:index/regenerate
  (confirm с оценкой 1:1 [19022]; отступление: тихая перегенерация
  с СОБСТВЕННЫМ param вместо runMode-из-модалки [19034]).
  Найдено тестом R6: счётчики режимов SynthesisPage не обновлялись
  после плана — закрытие EditModal теперь перечитывает getModes.
  Тест расширен до R6/R7: 77 ✓ ×2.

---

### Беседа 4.2: Export Service

**Контекст:**
- `03-specification.md` (секции 1.8 Экспорт, 2.11 Export API)
- `04-code-reuse-map.md` (секция 2.5 — экспорт)
- Из предыдущих бесед: `server/db/schema.ts`, `server/services/graph-parser.ts` (из 1.4)
- ФАКТ (4.2) — дополнительно потребовались: `server/services/mode-service.ts` (MODE_CONFIG для секции режимов и реконструкции), `server/services/log-formatter.ts` (снятие TODO(4.2) + предвычисление видимого лога), `server/services/section-defs-builder.ts` и `prompt-builder.ts` (reconstructSectionTask), `server/services/generation-service.ts` (buildParams/genCommon), клиентские `graph-utils.ts`/`Graph*.tsx` 1.7 (двойники graph-style/graph-physics — дрейф сторожит integration-check 4y) и `DocumentHeader.tsx` 1.6b (двойник шапки)
- Исходник: exportMMD … auditCSS (весь экспорт) + reconstructBaseCtxSkeleton … reconstructSkeleton (реконструкция промптов) + getDocFilename [17477] + saveMD/node2md/sec2md/table2md/inline2md/sig2md (Markdown-экспорт)

**Извлечение:**
```bash
# Извлечь exportMMD … auditCSS (весь экспорт)
grep -n 'function exportMMD' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Реализую экспорт синтезов в различные форматы.

Прикреплён фрагмент исходника (exportMMD … auditCSS (весь экспорт)): exportMMD, exportPNG, 
exportJSON, saveHTML, buildGraphExportSection, buildModesExportSection, auditCSS.

Создай:
1. server/services/export/mmd-exporter.ts:
   - exportMMD(synthesisId):
     Порт exportMMD(). Загружает categories + edges из БД,
     строит Mermaid-диаграмму: subgraph по кластерам, формы узлов 
     по процессуальным ролям, стили по типам, linkStyle по силе связей.
     Возвращает string (Mermaid-код).

2. server/services/export/json-exporter.ts:
   - exportJSON(synthesisId):
     Порт exportJSON(). Загружает nodes, edges, clusters из БД,
     форматирует в структуру { meta, nodes, edges, clusters }.

3. server/services/export/png-exporter.ts:
   - exportPNG(synthesisId):
     Порт exportPNG(). Два варианта реализации:
     a. Серверный Canvas (node-canvas): warmup layout → рисование 
        узлов/рёбер/кластеров/легенды → PNG blob
     b. Генерация SVG → конвертация в PNG через sharp
     Выбрать вариант (a) — ближе к исходнику.

3b. server/services/export/md-exporter.ts — ФАКТ (4.2), в запросе отсутствовал:
   - exportMD(synthesisId): порт saveMD() + sec2md/node2md/inline2md/
     table2md/sig2md через html-parser (linkedom изолирован).
     Требует каркаса .section-num/.section-title/.doc-content
     в html_content (реальный вывод модели его несёт по сис-промпту;
     моки без каркаса дают пустой MD — грабля тестов 2.3/4.1).

3c. server/services/export/filename.ts — ФАКТ (4.2):
   - getDocFilename [17477] из params БД; КВИРК: paramCode
     склеивается join("") без дефисов — пример «hm-t-2» в комментарии
     исходника устарел. Общее: common.ts (ExportError NOT_FOUND/NO_GRAPH
     «Нет графа.», loadExportSynthesis, exportFilename).

4. server/services/export/html-exporter.ts:
   - exportHTML(synthesisId):
     Порт saveHTML (saveHTML()). Собирает самодостаточный HTML:
     a. Загружает synthesis + sections + capsule из БД
     b. Рендерит шаблон документа (CSS + HTML шапка + разделы)
     c. Встраивает JSON-состояние (<script type="application/json" 
        id="philosynth-state">)
     d. Встраивает graph section (buildGraphExportSection, buildGraphExportSection()):
        Three.js + D3.js CDN ссылки, сериализованные функции графа,
        клонированное модальное окно
        [ФАКТ 4.2: fn.toString()/клонирование DOM на сервере неисполнимы —
        скрипты и оверлеи берутся из статических бандлов
        server/config/export-assets.ts, генерат npm run
        extract:export-assets из исходника: fnBundle 46 функций,
        constBundle 6, gm/mode-оверлеи (минус .mode-modal-params), rawCSS;
        initScript [17773-17828] дословно]
     e. Встраивает modes section (buildModesExportSection, buildModesExportSection())
     f. auditCSS — убирает неиспользуемые стили (auditCSS())
     g. Встраивает лог контекста (details + script)
        [ФАКТ 4.2: видимый лог ПРЕДВЫЧИСЛЕН formatCtxLogHTML на сервере
        (в исходнике строился скриптом в файле); после импорта и правок
        файла пересчитается только пересохранением]

5. server/utils/css-audit.ts:
   - auditCSS(cssText, contentToCheck):
     Порт auditCSS(). Парсер CSS → консервативное удаление 
     неиспользуемых классов.

5b. server/services/prompt-reconstruction.ts (или встроить в export):
   - reconstructBaseCtxSkeleton(params, genCommon):
     Базовый контекст с маркерами вместо содержимого концептов.
     Использует genCommon.conceptBlockSizes для размеров блоков.
   - reconstructCtxMarkers(sectionKey):
     Маркеры контекста из ctxLog: inter-section и intra-section.
   - reconstructSectionTask(genEntry, params):
     Скелет задания: для режимов — config.buildPrompt; для подразделов —
     preamble_short + subsection body; для стандартных — buildSectionDefs.
   - reconstructSkeleton(genEntry):
     Полный скелет: base + ctx + task + quality.
   Фрагмент исходника: reconstructBaseCtxSkeleton … reconstructSkeleton
   [ФАКТ 4.2: все четыре — async (Registry/БД); config.buildPrompt
   исходника → renderTemplate("mode.{key}.prompt"); source
   'subsection_regen' (не 'subsection'); участники мета-синтеза
   type='synthesis' — отбор через isConceptParticipant; подключены
   fallback-ом в log-formatter (долг 2.4 §12 закрыт): rc считается
   один раз на форматирование, needsReconstruction → baseCtx+skeleton]

6. server/routes/export.ts (ФАКТ 4.2: роутов ПЯТЬ — плюс md):
   - GET /syntheses/:id/export/html → Content-Type: text/html
   - GET /syntheses/:id/export/md → Content-Type: text/markdown
   - GET /syntheses/:id/export/mmd → Content-Type: text/plain
   - GET /syntheses/:id/export/png → Content-Type: image/png
   - GET /syntheses/:id/export/json → Content-Type: application/json
   requireAuth + loadSynthesisForRead; имена файлов RFC5987;
   NO_GRAPH → 400 VALIDATION_ERROR «Нет графа.» (png/mmd/json)

7. Кнопки экспорта в SynthesisPage.tsx:
   - Выпадающее меню: HTML, Mermaid, PNG, JSON
   - Скачивание через download-ссылки
```

**Последующие запросы:**
- «Протестируй exportMMD: граф с 8 узлами, 3 кластерами — Mermaid валидный? Вставь в mermaid.live и проверь»
- «Протестируй exportJSON: структура соответствует спецификации (meta, nodes, edges, clusters)?»
- «Протестируй exportHTML: скачанный файл открывается в браузере, граф работает (3D/2D), лог контекста отображается?»
- «Протестируй exportHTML: импортируй скачанный файл обратно через POST /syntheses/import — все данные восстанавливаются?» [ФАКТ 4.2: НЕИСПОЛНИМ в 4.2 — POST /syntheses/import создаёт беседа 4.3; инверсия зависимости. Покрытие не теряется: ПЕРВЫЙ тестовый запрос беседы 4.3 — тот же roundtrip]
- «Edge case: exportPNG для синтеза без графа — корректная ошибка 400»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 4.2 (2026-08-29):**
- Скрипты экспортируемого файла: fn.toString()/клонирование DOM
  неисполнимы на сервере — статические бандлы export-assets.ts
  (генерат extract:export-assets из исходника); видимый лог
  предвычислен formatCtxLogHTML.
- Embedded state version:2 — genLog/ctxLog без sys/promptSkeleton
  (паритет клиентского среза), params=buildParams, участники
  type='synthesis' без капсул, genealogy однослойная из lineage
  (полную строит импорт 4.3).
- Тесты 2–6: tests/test-42-requests2-6.mjs 76 ✓ ×2. АДАПТАЦИИ:
  mermaid.live заменён ТЕМ ЖЕ движком (npm-пакет mermaid в странице
  puppeteer, parse+render); CDN three/d3 в file://-тесте подменены
  локальными копиями тех же версий. Тест roundtrip (п.4) неисполним —
  исполняет 4.3 её первым тестом.
- ГРАБЛИ МОКА (наследие тестов 2.3/4.1, чинить в будущих моках):
  (1) специфичные маркеры pickHtml («Таблица категорий», «Сводная
  таблица», «„Капсула“») должны стоять ПЕРЕД общим корнем
  /критическ/i — задание графа упоминает критический анализ, и
  прогон 1 записал критику в раздел graph; (2) моки возвращали
  разделы БЕЗ каркаса section-num/section-title/doc-content, который
  системный промпт требует от настоящей модели — на таком вводе
  sec2md даёт пустой MD; мок 4.2 оборачивает wrapSection().
- Дрейф-контроль двойников: graph-style/graph-physics ↔ клиент 1.7,
  subtitleForExport/docDateFor ↔ DocumentHeader — integration-check
  4y; живой конвейер экспорта — секция 5s.

---

### Беседа 4.3: Import Service

**Контекст:**
- `03-specification.md` (секция 1.9 Импорт)
- `04-code-reuse-map.md` (секция 2.6 — импорт)
- Из предыдущих бесед: `server/db/schema.ts`, `server/services/graph-parser.ts`, `server/services/element-parser.ts`, `server/services/lineage-service.ts` (из 3.1)
- Исходник: importHTML, extractMetadata … buildDocStateFromImport

**Извлечение:**
```bash
# Извлечь importHTML … buildDocStateFromImport
grep -n 'function importHTML' philosynth.html | head -1  # найти начало, затем извлечь блок
```

**Первый запрос:**
```
Реализую импорт HTML-файлов PhiloSynth.

Прикреплён фрагмент исходника (importHTML … buildDocStateFromImport):
importHTML, extractMetadata, extractSections, extractEmbeddedState, extractModesFromHTML,
populateFromImport, buildDocStateFromImport, validateImportMeta.

> На клиенте загрузка идёт через Unified Concept Pool (`handlePoolFileImport`, `handlePoolUrlImport`).
> `buildDocStateFromImport` устанавливает `DOC_STATE.structureSections`
> из `embeddedState.structureSections` и вызывает `refreshSumDef()`.

Создай:
1. server/services/import-service.ts:
   - importHTML(htmlString, userId, filename?):
     Порт importHTML(). Серверный DOM-парсинг через linkedom:
     a. parseFromString(htmlString)
     b. extractMetadata(doc) — extractMetadata(): философы, метод, глубина, 
        уровень, зерно, контекст, капсула из шапки
     c. extractSections(doc) — extractSections(): .doc-section → key, num, 
        title, html, secCtx
     d. extractEmbeddedState(doc) — extractEmbeddedState(): JSON из 
        <script id="philosynth-state">
     e. validateImportMeta(meta, embeddedState) — validateImportMeta(): 
        проверка обязательных полей, предупреждения
     f. Создание записи в syntheses
     g. Создание записей в sections
     h. Парсинг графа → categories, category_edges, cluster_labels
     i. Парсинг тезисов → theses
     j. Парсинг глоссария → glossary_terms
     k. Восстановление genLog, ctxLog из embeddedState
     l. Построение synthesis_lineage из генеалогии
     m. Восстановление mode_results из extractModesFromHTML
     Возвращает { synthesisId, warnings }

   - extractModesFromHTML(doc):
     Порт extractModesFromHTML(). Парсинг .philosynth-mode элементов.

   - reconstructGenealogy(meta, embeddedState, doc):
     Порт reconstructGenealogy(). Восстановление дерева наследования.

2. server/routes/import.ts:
   - POST /syntheses/import — multipart/form-data
     Принимает HTML-файл, вызывает importHTML,
     возвращает { id, warnings }

3. client/pages/ImportPage.tsx:
   - Drag & drop зона для файла
   - Кнопка выбора файла
   - Прогресс загрузки
   - Предупреждения из validateImportMeta
   - Кнопка "Подтвердить импорт" / "Отмена"
   - Redirect на SynthesisPage после успеха
   > v10: на клиенте ImportPage может использовать пул для предпросмотра
   > перед серверным импортом (POST /syntheses/import по-прежнему серверный).

4. client/api/import.ts: importFile(file)
```

**Последующие запросы:**
- «Протестируй: экспортируй синтез через exportHTML → импортируй обратно → сравни: все разделы на месте? categories совпадают? genLog восстановлен?»
- «Протестируй с реальным файлом: загрузи файл из standalone PhiloSynth → импорт с предупреждениями (метод не распознан и т.д.) → синтез создан, разделы на месте»
- «Протестируй невалидный файл: загрузи обычный HTML (не PhiloSynth) → ошибка IMPORT_INVALID»
- «Протестируй файл без embedded state: только HTML-разделы → импорт с предупреждением "Лог отсутствует"»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

> **По факту 4.3 (2026-08-30, беседа ЗАКРЫТА).** Запрос 1 и все
> тестовые запросы выполнены (tests/test-43-requests2-5.mjs, 64 ✓ ×2:
> roundtrip мета-синтеза с родителем, standalone с предупреждениями,
> IMPORT_INVALID, без embedded state; + браузерный сегмент ImportPage
> через vite/Chromium; смоук ядер tests/smoke-43-request1.mjs 33 ✓).
> ДВА ВХОДНЫХ ФОРМАТА: standalone-файл (шапка с id, legacy-логи:
> `cost`/`error`/поля россыпью/маркеры `type` через дефис, без
> createdAt) и экспорт 4.2 (шапка ПО КЛАССАМ без id, логи с полями-
> колонками). АДАПТАЦИИ (полный список — шапка import-service.ts):
> extractMetadata читает id → fallback классы .doc-title/.doc-subtitle/
> .doc-meta-grid по русским подписям; extractSections кладёт в
> html_content outerHTML самого .doc-section (parentBody.innerHTML
> экспорта несёт якорь sec-{key} и кнопку «▦ Граф»); confirm() критических
> предупреждений — на клиенте ДО отправки, сервер всегда импортирует и
> отдаёт warnings; reconstructGenealogy принимает участников
> type!=='philosopher' ('concept' исходника И 'synthesis' сервиса),
> synthesisId узла строит synthesis_lineage; lineage — первый слой
> (файловые родители без записи в БД → warning, глубокое дерево файла
> живёт только в embedded state); дубликаты ключей разделов — первый
> побеждает (UNIQUE); извлечённые ключи вне embedded sectionOrder —
> в хвост; mode_results без токенов/стоимости (файл их не несёт).
> КВИРКИ СОХРАНЕНЫ: капсула из ТЕКСТА шапки обёрткой doc-section
> [21806] — sections-row 'capsule' НЕ создаётся (паритет исходника:
> капсула вне docBodies; ключ в sectionOrder + capsule_html); ветка
> embeddedState.capsuleHTML [21793] мертва для version:2 обеих линий;
> validateImportMeta считает 0 философов критичным — roundtrip
> легального свободного синтеза (v11) даёт ложно-критическое
> предупреждение (поведение исходника, порт 1:1); subtitle мета-синтеза
> «На основе: Кант + Концепция» сплитится по запятой в один элемент
> (перекрывается params.phil из embedded state). ФИКС ПОРЯДКА
> LEGACY-ЛОГОВ (найден тестом): standalone датирует только маркеры —
> смешение реальных прошлых дат с fallback-«сейчас» ломало хронологию;
> при неполной датировке ВСЕ записи получают синтетические t0+i
> (порядок массива — истина; v2 с полными createdAt сохраняет даты).
> secCtx разделов: экспорт 4.2 sec-disclosure не пишет —
> восстанавливается из embedded params.secCtx (порт слияния).
> НОВАЯ ГРАБЛЯ МОКОВ (в копилку 4.2): задание SUM перечисляет структуру
> документа («…Критический анализ…») — sum обязан иметь СВОЙ маркер
> («Точки напряжения») ПЕРЕД веткой /критическ/i, иначе перехватывается
> (в 4.2 прошло незамеченным — содержимое sum там не проверялось).
> Рёбра §11 фактические: 4.3 ← 4.2 (формат файла), ← 3.1/3.2
> (lineage-модель, клиентские genealogy-порты — образцы серверных
> копий), → 1.6b (SynthesisPage рендерит импортированный документ).
> Дрейф двойников titleToKey/genealogy клиент↔сервер сторожит
> integration-check 4z.

---

## 7. Протокол Фазы 5: Inline-редактирование элементов

### Беседа 5.1: Element Editor + Versioning (бэкенд)

**Контекст для загрузки:**
- `01-architecture.md` (секция 4.7 Element Editor)
- `02-data-model.md` (таблица element_versions, **§3 «Направление записи»** — правка элемента врезает перерисованную таблицу в html_content)
- Из предыдущих бесед: `server/services/element-parser.ts` (из 1.4 — рендерер обязан быть обратным к нему), `server/utils/html-parser.ts` (из 1.4b — `spliceSubsectionHtml`)
- `03-specification.md` (секции 1.5 E7–E9, 2.4 Elements API + ImpactAnalysis)
- Из предыдущих бесед: `server/db/schema.ts`, `server/services/cascade-analyzer.ts` (из 2.1)
- Исходник: НЕ НУЖЕН (полностью новая функциональность)

**Первый запрос:**
```
Реализую ручное редактирование элементов синтеза и версионирование.

Эта функциональность ОТСУТСТВУЕТ в исходнике — полностью новый код.
Прикреплены: архитектура (Element Editor), модель данных (element_versions),
спецификация (Elements API, ImpactAnalysis), cascade-analyzer.ts.

Создай:
1. server/services/element-editor.ts:
   - updateCategory(categoryId, updates):
     a. Загружает текущую категорию
     b. Создаёт запись в element_versions (снимок до изменения)
     c. Обновляет categories
     d. Вычисляет impact: через SUBSECTION_TO_CTX_KEYS определяет, 
        какие подразделы ссылаются на эту категорию.
        Через cascade-analyzer определяет downstream-секции.
     e. Возвращает { category, impact: ImpactAnalysis }

   - updateThesis(thesisId, updates):
     Аналогично. Impact: какие разделы используют тезисы как контекст.

   - updateGlossaryTerm(termId, updates):
     Аналогично. Impact: кто использует глоссарий.

   - updateCategoryEdge(edgeId, updates):
     Обновление связи графа.

   - autoRenameReferences(synthesisId, oldName, newName):
     При переименовании категории: поиск oldName в html_content
     всех sections, замена на newName. ТАКЖE замена в
     theses.related_categories (правка 2026-09-02, п.4 — иначе тезисы
     ссылаются на исчезнувшее имя). Каждая затронутая строка получает
     версию с changeSource='auto_rename'. Возвращает
     { affectedSections, affectedTheses }.
     Вызывается ОТДЕЛЬНЫМ эндпоинтом POST /syntheses/:id/elements/auto-rename
     (03 §2.4), а не побочным эффектом PATCH: решает пользователь после
     просмотра impact.

   - computeElementImpact(elementType, elementId, synthesisId):
     Общий метод вычисления "зоны поражения":
     a. Определяет, к какому разделу принадлежит элемент
     b. Через SUBSECTION_TO_CTX_KEYS находит, какие подразделы 
        используют данные этого типа
     c. Через cascade-analyzer находит downstream-секции
     d. Через getAffectedModes находит затронутые режимы
     e. Определяет severity: "none" / "low" / "high"

1b. server/services/element-renderer.ts (НОВОЕ, решение 2026-09-02, п.1):
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
     колонка (миграция 0001), по ней же идёт проверка доступа в роутах.
   
   - getVersionHistory(elementId, elementType):
     Все версии элемента, отсортированные по version desc.
   
   - rollbackToVersion(elementId, elementType, version):
     Восстановление данных из element_versions.
     Создаёт новую версию с changeSource="rollback".

3. server/routes/elements.ts:
   - GET /syntheses/:id/categories → список с edges, clusters, topology
   - GET /syntheses/:id/categories/:catId → одна категория
   - PATCH /syntheses/:id/categories/:catId → updateCategory
   - PATCH /syntheses/:id/edges/:edgeId → updateEdge
     (добавлен в 03 §2.4 в v10, но в этом списке отсутствовал —
      аудит 2026-07-30; поля: description, edgeType, direction,
      strength, certainty, historicalSupport, logicalNecessity,
      innovationDegree, contextDependency)
   - GET /syntheses/:id/theses → список
   - PATCH /syntheses/:id/theses/:thesisId → updateThesis
   - GET /syntheses/:id/glossary → список
   - PATCH /syntheses/:id/glossary/:termId → updateGlossaryTerm
   - GET /syntheses/:id/elements/:elementType/:elementId/versions
     → getVersionHistory (контракт — 03 §2.4, дополнен 2026-09-02;
       elementType в пути: без него нельзя ни проверить доступ, ни
       выбрать таблицу для отката)
   - POST /syntheses/:id/elements/:elementType/:elementId/rollback { version }
     → rollback (создаёт версию changeSource='rollback', перерисовывает
       таблицу в html_content, возвращает impact)
   - POST /syntheses/:id/elements/auto-rename { oldName, newName }
   - PATCH /syntheses/:id/capsule { html } (01 §4.7 числит капсулу
     редактируемой; эндпоинта не было — п.14)
```

**Последующие запросы:**
- «Протестируй: PATCH category с name="Новое имя" → element_versions содержит старое значение, impact содержит затронутые секции»
- «Протестируй autoRenameReferences: переименуй категорию "Бытие" → "Существование" → html_content всех секций обновлён»
- «Протестируй rollback: версия 1 → изменение → версия 2 → rollback к 1 → данные восстановлены, создана версия 3 с source="rollback"»
- «Протестируй computeElementImpact для категории, которая упоминается в тезисах и глоссарии — severity="high"»
- «Edge case: удаление связи (edge) — impact на подраздел "Таблица связей"»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

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
   affectedSections. Граница слова — lookaround `\p{L}\p{N}` (`\b`
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

### Беседа 5.2: Element Editor UI (клиент)

**Контекст:**
- `03-specification.md` (секция 2.4 Elements API)
- `05-file-structure.md` (edit/ElementEditor.tsx)
- Оформление нового интерфейса: `docs/fragments-for-conversations/5-6-ui-kit.md` (бриф и таблица соответствий классам исходника), `5-6-ui-kit.css` (примитивы), `5-6-ui-kit.html` (эталон разметки)
- Из предыдущих бесед: `shared/types/graph.ts`, `shared/types/elements.ts`, `client/components/graph/NodePanel.tsx` (из 1.7), `client/components/document/SectionView.tsx` (из 1.6b), `client/api/elements.ts` (из 1.7)
- Исходник: НЕ НУЖЕН

**Первый запрос:**
```
Создаю UI для ручного редактирования элементов синтеза.

Эта функциональность ОТСУТСТВУЕТ в исходнике — новый React-код.
Прикреплены: спецификация (Elements API), types, NodePanel, SectionView.

Создай:
1. client/components/edit/ElementEditor.tsx:
   - Компонент, встраиваемый в контекст документа
   - Режим "просмотр" (по умолчанию) и "редактирование" (по клику)
   - Inline-формы для полей элемента
   - Кнопки "Сохранить" / "Отмена"
   - После сохранения: показ ImpactAnalysis (какие секции затронуты)
   - Кнопки действий: "Перегенерировать затронутые", "Автозамена имён", "Ничего"

2. client/components/edit/CategoryEditor.tsx:
   - Специализированный редактор категории:
   - Поля: name, type (select), definition (textarea), 
     centrality (slider 0–1), certainty (slider 0–1), origin (textarea)
   - Предпросмотр: как будет выглядеть в таблице графа

3. client/components/edit/ThesisEditor.tsx:
   - Поля: formulation (textarea), justification (textarea), 
     thesisType (select), noveltyDegree (текст)

4. client/components/edit/GlossaryTermEditor.tsx:
   - Поля: term, definition, extraColumns (динамические по synth_level)

5. client/components/edit/VersionHistory.tsx:
   - Список версий элемента (дата, источник изменения, превью данных)
   - Кнопка "Откатить" для каждой версии
   - Diff-view: визуальное сравнение двух версий

6. Интеграция с NodePanel.tsx (из 1.7):
   - Кнопка "✎ Редактировать" в панели информации узла
   - Клик → открытие CategoryEditor для этого узла

7. Интеграция с SectionView.tsx:
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
     появится второй путь запуска перегенерации (п.15)

8. client/api/elements.ts — расширение:
   - updateCategory, updateThesis, updateGlossaryTerm
   - getVersionHistory, rollbackToVersion (elementType — в пути:
     /elements/:elementType/:elementId/versions|rollback, 03 §2.4)
   - По факту 5.1: также updateEdge, deleteEdge (DELETE /edges/:edgeId),
     autoRename, updateCapsule; ответы PATCH/rollback несут version и
     htmlSync — UI ОБЯЗАН показывать htmlSync.pending («поле не отражено
     в документе, раздел требует перегенерации») и sectionMissing (долг
     §12). Все PATCH → 409 при активной генерации — форма редактора
     блокируется по status='generating'.
```

**Последующие запросы:**
- «Протестируй поток: открыть граф → кликнуть узел → NodePanel → кнопка "Редактировать" → CategoryEditor → изменить имя → сохранить → ImpactAnalysis показывает затронутые секции»
- «Протестируй inline-редактирование тезиса: навести на строку в таблице → ✎ → ThesisEditor → изменить формулировку → сохранить»
- «Протестируй VersionHistory: изменить категорию 3 раза → открыть историю → 3 версии → откатить к первой → данные восстановлены»
- «Проверь автозамену: переименовать категорию → предложение автозамены → подтвердить → html_content обновлён»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

**По факту 5.2 (2026-09-04)** — беседа ЗАКРЫТА; отступления от буквы
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

### Беседа 5.3: Extended Characteristics + Enrichment Service (бэкенд)

**Контекст для загрузки:**
- `01-architecture.md` (секции 4.8 Element Taxonomy, 4.9 Element Enrichment)
- `02-data-model.md` (таблицы element_enrichments, characteristic_justifications)
- `03-specification.md` (секции 2.14 Enrichment API, 1.12 EN1–EN6)
- Из предыдущих бесед: `server/services/element-editor.ts` (из 5.1), `server/services/streaming-manager.ts` (из 1.4), `server/services/prompt-registry.ts` (из 0.3), `server/services/element-taxonomy.ts` (из 0.3b)
- Исходник: НЕ НУЖЕН (полностью новая функциональность)

**Первый запрос:**
```
Реализую точечные Claude-запросы для обогащения элементов и обоснования характеристик.

Полностью новый код (идея из предыдущего проекта). Прикреплены: архитектура
(Element Enrichment), модель данных (element_enrichments, characteristic_justifications),
спецификация (Enrichment API), element-editor.ts, streaming-manager.ts, prompt-registry.ts.

Создай:
1. server/services/element-enrichment.ts:
   - enrichCategory(synthesisId, categoryId, enrichmentType):
     a. Загружает категорию и контекст синтеза (seed, метод, философы)
     b. Формирует промпт из Registry: "enrichment.category.description" или
        "enrichment.category.evolution"
     c. Стримит через streaming-manager
     d. Сохраняет в element_enrichments
     e. Возвращает { enrichment, usage }

   - enrichEdge(synthesisId, edgeId, enrichmentType):
     Аналогично. Промпты: "enrichment.edge.justification",
     "enrichment.edge.counterarguments"

   - justifyCharacteristic(elementId, elementType, characteristic, value):
     a. Загружает элемент + контекст
     b. Промпт: "enrichment.characteristic_justification"
        Пример: «Я определил для категории "Бытие" характеристику centrality = 0.9.
        Предложи философские основания для такой оценки, ограничения
        и альтернативные подходы»
     c. Сохраняет в characteristic_justifications
     d. Возвращает { justification, usage }

   - getEnrichments(elementId, elementType): история обогащений
   - getJustifications(elementId, elementType): история обоснований

2. Промптовые шаблоны (добавить в seed-prompts.ts или через Admin UI) —
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
   (setUsageRecorder / no-op по умолчанию) и внести долг в §12.

3. server/routes/enrichment.ts:
   - POST /syntheses/:id/enrich/category/:catId
   - POST /syntheses/:id/enrich/edge/:edgeId
   - POST /syntheses/:id/justify-characteristic
   - GET /syntheses/:id/enrichments/:elementId
   - GET /syntheses/:id/justifications/:elementId

4. server/routes/taxonomy.ts (§2.13; дыра доков закрыта 2026-07-23 —
   модуль числился в карте 04, но ни одна беседа его не создавала;
   тонкие обёртки над element-taxonomy.ts из 0.3b):
   - GET/POST /taxonomy/category-types
   - GET/POST /taxonomy/relationship-types
   - POST /taxonomy/normalize

5. Расширение ws/handler.ts:
   - Обработка start_enrichment → enrichCategory/enrichEdge
   - Отправка enrichment_delta, enrichment_done
```

**Последующие запросы:**
- «Протестируй enrichCategory: выбери категорию из синтеза → enrichmentType="description" → стриминг через WebSocket → результат сохранён в element_enrichments»
- «Протестируй justifyCharacteristic: centrality=0.9 для категории "Бытие" → ответ содержит философские основания, ограничения, альтернативные подходы»
- «Протестируй getEnrichments: после 2 обогащений одной категории → массив из 2 записей с разными типами»
- «Протестируй стоимость: enrichment записывает input_tokens, output_tokens, cost_usd»
- «Edge case: enrichCategory для несуществующей категории → 404.
  justifyCharacteristic с value вне ДОПУСТИМОГО ДЛЯ ЭТОЙ ХАРАКТЕРИСТИКИ
  диапазона → 400. Диапазон зависит от поля (правка 2026-09-02, п.18):
  [0,1] у centrality/certainty/clarity/breadth/depth/applicability/
  historical_significance/strength/historical_support/logical_necessity/
  context_dependency, целое [1,5] у innovation_degree»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 5.4: Характеристики + Обогащение + Таксономия UI (клиент)

**Контекст для загрузки:**
- `03-specification.md` (секции 2.13 Taxonomy, 2.14 Enrichment)
- Оформление нового интерфейса: `docs/fragments-for-conversations/5-6-ui-kit.md` (бриф и таблица соответствий классам исходника), `5-6-ui-kit.css` (примитивы), `5-6-ui-kit.html` (эталон разметки)
- Из предыдущих бесед: `server/services/element-enrichment.ts` (из 5.3), `server/services/element-taxonomy.ts` (из 0.3b), `client/components/edit/ElementEditor.tsx` (из 5.2), `client/components/graph/NodePanel.tsx` (из 1.7)
- Исходник: НЕ НУЖЕН

**Первый запрос:**
```
Создаю UI для расширенных характеристик, обогащения элементов и таксономии.

Полностью новый код. Прикреплены: спецификация (Taxonomy + Enrichment API),
element-enrichment.ts, element-taxonomy.ts, ElementEditor.tsx, NodePanel.tsx.

Создай:
1. client/components/edit/CharacteristicSlider.tsx:
   - Слайдер (range input) для числовой характеристики
   - Подпись: название характеристики + текущее значение
   - Кнопка «?» (обоснование) → запрос justifyCharacteristic → 
     показ результата в popover/tooltip
   - onChange → обновление через PATCH API
   - Поддержка: centrality, certainty, historical_significance,
     clarity, breadth, depth, applicability (0–1),
     innovation_degree (1–5, целое) — v10: +4 поля категорий

2. client/components/edit/EnrichmentPanel.tsx:
   - Кнопка «Обогатить» → выбор типа обогащения (описание/эволюция/обоснование)
   - Стриминг результата через WebSocket (enrichment_delta)
   - Отображение результата в expandable карточке
   - История обогащений (GET /enrichments/:elementId)
   - Для каждого обогащения: тип, дата, стоимость, контент

3. client/components/edit/TaxonomySelector.tsx:
   - Select/Combobox: список типов из каталога
   - При вводе свободного текста → POST /taxonomy/normalize → suggestions
   - Кнопка «+ Создать новый тип» → POST /taxonomy/category-types
   - Индикатор: «из каталога» (зелёный) или «свободный текст» (серый)

4. Интеграция с NodePanel.tsx:
   - Добавить CharacteristicSlider для всех характеристик категории:
     centrality, certainty, historical_significance, innovation_degree,
     clarity, breadth, depth, applicability (v10: +4 поля)
   - Добавить кнопку «Обогатить» → EnrichmentPanel
   - Заменить текстовый тип на TaxonomySelector

5. Интеграция с ElementEditor.tsx для связей:
   - CharacteristicSlider: strength, certainty, historical_support, logical_necessity,
     innovation_degree, context_dependency (v10: +2 поля связей)
   - TaxonomySelector для типа связи

6. client/api/taxonomy.ts:
   - getCategoryTypes, getRelationshipTypes, normalizeType, createCustomType

7. client/api/enrichment.ts:
   - enrichCategory, enrichEdge, justifyCharacteristic,
     getEnrichments, getJustifications
```

**Последующие запросы:**
- «Протестируй CharacteristicSlider: изменить centrality через слайдер → PATCH API вызван → значение обновлено. Нажать «?» → justification отображается в popover»
- «Протестируй EnrichmentPanel: кнопка "Обогатить" → тип "описание" → стриминг → результат в карточке. Повторный запрос → история содержит 2 записи»
- «Протестируй TaxonomySelector: ввести "диалектическая" → автокомплит показывает "Диалектическая (dialectical)". Ввести "новый_тип" → normalize возвращает null → кнопка "Создать" появляется»
- «Протестируй интеграцию с NodePanel: открыть граф → кликнуть узел → панель содержит 4 слайдера + кнопку "Обогатить" + TaxonomySelector для типа»
- «Edge case: innovation_degree — дискретный слайдер (1–5), не непрерывный. CharacteristicSlider для readOnly синтеза — disabled»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 5.5: Representation Transformer — graph↔theses (бэкенд + клиент)

**Контекст для загрузки:**
- `01-architecture.md` (секция 4.10 Representation Transformer)
- `02-data-model.md` (таблица representation_transforms)
- `03-specification.md` (секция 2.15 Transforms API, требования RT1–RT5)
- Из предыдущих бесед: `server/services/graph-parser.ts` (из 1.4), `server/services/element-parser.ts` (из 1.4), `server/services/element-taxonomy.ts` (из 0.3b), `server/services/streaming-manager.ts` (из 1.4), `server/services/prompt-registry.ts` (из 0.3), `server/db/schema.ts`
- Клиентские: `client/components/graph/GraphModal.tsx` (из 1.7), `client/components/document/SectionView.tsx` (из 1.6b)
- Оформление нового интерфейса: `docs/fragments-for-conversations/5-6-ui-kit.md` (бриф и таблица соответствий классам исходника), `5-6-ui-kit.css` (примитивы), `5-6-ui-kit.html` (эталон разметки)
- Исходник: НЕ НУЖЕН (полностью новая функциональность)

**Первый запрос:**
```
Реализую двунаправленную трансформацию graph↔theses — прямую конверсию
между структурным и пропозициональным представлением концепции.

Это НЕ каскадная перегенерация (которая использует раздел как контекст).
Это прямая трансформация: граф → тезисы или тезисы → граф, где источник —
единственный вход, а промпт оптимизирован для конверсии.

Прикреплены: архитектура (Representation Transformer), модель данных
(representation_transforms), спецификация (Transforms API), graph-parser.ts,
element-parser.ts, element-taxonomy.ts, streaming-manager.ts, prompt-registry.ts.

Создай:

БЭКЕНД:
1. server/services/representation-transformer.ts:
   - transformGraphToTheses(synthesisId):
     a. Загружает ВСЕ categories + category_edges + cluster_labels из БД
     b. Формирует промпт из Registry: "transform.graph_to_theses"
        (отличается от промпта раздела "theses" — здесь вход: чистый граф,
        без зерна/контекста/secCtx, задача: вывести утверждения из структуры)
     c. Делает снимок текущих тезисов → source_snapshot
     d. Делает снимок текущего графа → для аудита
     e. Стримит через streaming-manager
     f. Парсит результат → theses (через element-parser)
     g. Заменяет тезисы в БД (DELETE old + INSERT new)
     h. Сохраняет запись в representation_transforms
     i. Возвращает { summary, usage }

   - transformThesesToGraph(synthesisId):
     a. Загружает ВСЕ theses из БД
     b. Промпт из Registry: "transform.theses_to_graph"
        (вход: список тезисов с формулировками и обоснованиями,
        задача: вывести категории, связи, кластеры, роли)
     c. Снимок текущего графа → source_snapshot
     d. Стримит → парсит HTML → parseGraphFromHTML → saveGraphToDb
     e. Нормализация типов через element-taxonomy
     f. Сохраняет в representation_transforms
     g. Возвращает { summary, usage }

   - getTransformHistory(synthesisId):
     SELECT из representation_transforms ORDER BY created_at DESC

   - rollbackTransform(transformId):
     a. Загружает source_snapshot
     b. Определяет direction: если graph_to_theses → восстанавливает тезисы
        из source_snapshot; если theses_to_graph → восстанавливает граф
     c. Записывает rollback как новую трансформацию (для аудита)

2. Промптовые шаблоны (добавить в seed или Admin UI):
   - transform.graph_to_theses: «На основе графа категорий [ГРАФ]
     сформулируй тезисы. Каждый тезис должен логически следовать из
     структурных отношений между категориями...»
   - transform.theses_to_graph: «На основе тезисов [ТЕЗИСЫ]
     построй граф категорий. Выдели ключевые категории, установи связи,
     определи кластеры и роли...»

3. server/routes/transforms.ts:
   - POST /syntheses/:id/transform/graph-to-theses
   - POST /syntheses/:id/transform/theses-to-graph
   - GET /syntheses/:id/transforms
   - POST /syntheses/:id/transforms/:transformId/rollback

4. Расширение ws/handler.ts:
   - start_transform → transformGraphToTheses / transformThesesToGraph
     (сообщение внесено в 03 §3.1 правкой 2026-09-02, п.5; операцию
     СОЗДАЁТ HTTP-роут, WS только подписывает — как в фазах 1–4)
   - Отправка stream_delta с sectionKey = "transform:{direction}"
     (образец — "mode:{modeKey}" беседы 4.1), затем transform_done
   - После замены тезисов/графа в БД перерисовать соответствующий раздел
     в sections.html_content через element-renderer (02 §3, решение п.1):
     иначе документ покажет прежний текст

КЛИЕНТ:
5. client/components/edit/TransformPanel.tsx:
   - Две кнопки: «Граф → Тезисы» и «Тезисы → Граф»
   - Предупреждение: «Текущие [тезисы/граф] будут заменены»
   - Превью: что будет потеряно (количество тезисов/категорий)
   - Прогресс стриминга
   - После трансформации: summary (создано N, удалено M)

6. client/components/edit/TransformHistory.tsx:
   - Список трансформаций: направление, дата, summary
   - Кнопка «Откатить» для каждой записи
   - Confirmation dialog: «Восстановить [граф/тезисы] на момент [дата]?»

7. Интеграция:
   - В GraphModal.tsx: кнопка «→ Тезисы» в тулбаре
   - В SectionView.tsx для раздела theses: кнопка «→ Граф»
   - В EditModal.tsx: секция «Трансформации» с TransformHistory

8. client/api/transforms.ts:
   - transformGraphToTheses, transformThesesToGraph,
     getTransformHistory, rollbackTransform
```

**Последующие запросы:**
- «Протестируй graph→theses: синтез с 10 категориями и 5 тезисами → трансформация → новые тезисы (количество может отличаться) → старые тезисы в source_snapshot → representation_transforms содержит запись»
- «Протестируй theses→graph: синтез с 8 тезисами → трансформация → новый граф → categories заменены → нормализация типов через taxonomy → representation_transforms содержит запись»
- «Протестируй итеративный цикл: graph→theses → изменить тезис №2 (PATCH) → theses→graph → проверить что граф изменился → graph→theses → проверить что тезис №2 повлиял на результат»
- «Протестируй rollback: после graph→theses → rollback → тезисы восстановлены из snapshot → запись rollback создана»
- «Протестируй TransformPanel UI: кнопка "Граф → Тезисы" → предупреждение → подтверждение → стриминг → summary → история содержит запись → кнопка "Откатить" работает»
- «Edge case: трансформация для синтеза без тезисов (theses→graph когда тезисов 0) → ошибка 400 "No theses to transform". Трансформация без графа → аналогичная ошибка»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

## 8. Протокол Фазы 6: Биллинг и админка

### Беседа 6.1: Billing Service + API Key Management (бэкенд)

**Контекст для загрузки:**
- `01-architecture.md` (секция Масштабирование — оплата)
- `02-data-model.md` (таблицы api_keys, transactions, api_usage)
- `03-specification.md` (секции 1.11 Биллинг, 2.10 Billing API)
- Из предыдущих бесед: `server/db/schema.ts`, `server/middleware/auth.ts` (из 0.2), `server/services/streaming-manager.ts` (из 1.4)
- Исходник: НЕ НУЖЕН (полностью новая функциональность)

**Первый запрос:**
```
Реализую систему биллинга: BYO-Key + баланс сервиса.

Полностью новый код. Прикреплены: архитектура, модель данных (api_keys, 
transactions, api_usage), спецификация (Billing API), auth middleware, 
streaming-manager.

Создай:
1. server/services/api-key-service.ts:
   - storeApiKey(userId, apiKey):
     a. Шифрование AES-256-GCM (ключ из env ENCRYPTION_KEY)
     b. Сохранение encrypted_key + key_prefix (первые 14 символов)
     c. Возвращает { keyId, prefix }
   - getDecryptedKey(userId):
     Загружает активный ключ, дешифрует, возвращает plain text
   - deleteApiKey(keyId, userId)
   - listApiKeys(userId): id, prefix, isActive, createdAt (без ключа)

2. server/services/billing-service.ts:
   - getBalance(userId): из users.balance_usd
   - createTopup(userId, amountUsd):
     a. Stripe PaymentIntent
     b. Возвращает clientSecret для Stripe Elements
   - confirmTopup(userId, stripePaymentIntentId):
     a. Проверяет статус в Stripe
     b. Обновляет users.balance_usd
     c. Создаёт запись в transactions (type: "topup")
   - chargeUsage(userId, synthesisId, sectionKey, inputTokens, outputTokens):
     a. Рассчитывает стоимость (PRICE_IN * inputTokens + PRICE_OUT * outputTokens)
     b. Проверяет баланс
     c. Списывает с balance_usd
     d. Создаёт записи в transactions (type: "usage") и api_usage
   - getUsageHistory(userId, filters): фильтрация по дате, synthesisId
   - getTransactionHistory(userId, pagination)

3. server/middleware/billing-check.ts:
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
   > закрытой беседы. Перед началом свериться
   > с фактическим списком роутов в server/index.ts, а не со списком ниже.
   - Middleware для routes генерации:
     a. Определяет режим биллинга (приоритет):
        1. BYO-Key (active api_key) → mode: "byo", apiKey из расшифровки
        2. Активная подписка с остатком квоты → mode: "subscription"
        3. Баланс > estimatedCost → mode: "balance"
        4. Иначе → 403 BILLING_REQUIRED
     b. Для mode "subscription": проверяет нужную квоту
        (syntheses для POST /syntheses, regenerations для regenerate, и т.д.)
     c. Для mode "balance": проверяет достаточность баланса
     d. Прокидывает { billingMode, apiKey?, subscriptionId? } в context

4. server/services/subscription-service.ts:
   - getPlans(): список активных тарифов из subscription_plans
   - getActiveSubscription(userId): текущая подписка + план + использование
   - createSubscription(userId, planId):
     a. Stripe Subscriptions API → subscription + clientSecret
     b. Создаёт запись в user_subscriptions
   - cancelSubscription(userId): cancel_at_period_end = true
   - resumeSubscription(userId): cancel_at_period_end = false
   - incrementUsage(subscriptionId, quotaType):
     Атомарный инкремент used_syntheses / used_regenerations / …
   - checkQuota(subscriptionId, quotaType): остаток > 0?
   - resetUsageCounters(subscriptionId):
     Вызывается из webhook при invoice.paid (новый период)
   - handleStripeWebhook(event):
     Диспетчер: invoice.paid → resetUsageCounters,
     customer.subscription.updated → обновить status/period,
     customer.subscription.deleted → status = "canceled"

5. Расширение server/services/streaming-manager.ts:
   - В streamSection: после получения usage от Claude —
     billingMode === "balance" → chargeUsage (списание с баланса);
     billingMode === "subscription" → incrementUsage (квота);
     billingMode === "byo" → списания нет
     (правка 2026-09-02, п.7: режимов ТРИ — byo|subscription|balance;
      прежний литерал "service" не существовал ни в одном списке)
   - Записать в api_usage независимо от режима; для byo cost_usd несёт
     СЕБЕСТОИМОСТЬ (в итогах не суммировать с balance)

6. server/routes/prompts.ts (03 §2.9 Prompts + §2.11 Configs):
   Модуль числится в 05 («Admin: CRUD prompt_templates, synthesis_configs»),
   но до аудита 2026-07-30 не создавался НИ ОДНОЙ беседой — без него
   AdminPromptsPage из 6.2 не с чем разговаривать.
   - GET   /prompts                 → список шаблонов (key, version, isActive)
   - GET   /prompts/:key/versions   → история версий шаблона
   - POST  /prompts/:key            { body } → новая версия-черновик
   - POST  /prompts/:key/activate   { version } → активация версии
   - GET   /configs                 → synthesis_configs
   - PUT   /configs/:key            { value } → НОВАЯ версия-черновик
   - GET   /configs/:key/versions   → история версий конфига
   - POST  /configs/:key/activate   { version } → активация
     (правка 2026-09-02, п.9: 02 §2.18 обещает версионирование конфигов
      «аналогично шаблонам», 6.2 его требует — эндпоинтов не было)
   Все — только для role === 'admin' (middleware из 0.2).
   Сброс кэша prompt-registry (0.3) после активации — обязателен,
   иначе генерация продолжит брать старый шаблон.

7. server/routes/billing.ts:
   - POST /billing/api-key { key } → storeApiKey
   - DELETE /billing/api-key/:id → deleteApiKey
   - GET /billing/api-key → listApiKeys
   - POST /billing/topup { amountUsd } → createTopup (Stripe)
   - POST /billing/topup/confirm { paymentIntentId } → confirmTopup
   - GET /billing/transactions?page&limit → getTransactionHistory
   - GET /billing/usage?from&to&synthesisId → getUsageHistory

8. server/utils/crypto.ts:
   - encrypt(plaintext, key): AES-256-GCM
   - decrypt(ciphertext, iv, tag, key): AES-256-GCM
```

**Последующие запросы:**
- «Протестируй BYO-Key: сохрани ключ → getDecryptedKey возвращает оригинал → billing-check пропускает с mode "byo"»
- «Протестируй баланс: пополни $1.00 → сгенерируй раздел → баланс уменьшился на стоимость → transaction записан»
- «Протестируй недостаток баланса: баланс $0.001, попытка генерации exhaustive — ошибка INSUFFICIENT_BALANCE»
- «Протестируй шифрование: storeApiKey → перезапуск сервера → getDecryptedKey возвращает тот же ключ»
- «Edge case: пользователь с BYO-Key И балансом — приоритет BYO-Key»
- «Протестируй подписку: создать Starter план → subscribe → Stripe mock → подписка active → сгенерировать синтез → used_syntheses = 1»
- «Протестируй исчерпание квоты: used_syntheses = quota → следующий запрос → QUOTA_EXCEEDED (или fallback на баланс если есть)»
- «Протестируй webhook: отправь mock invoice.paid → счётчики сброшены, period обновлён»
- «Протестируй отмену: cancel → cancel_at_period_end = true → до конца периода работает → после — status canceled»
- «Протестируй приоритет: пользователь с BYO-Key + подписка + баланс → используется BYO-Key. Удалить ключ → подписка. Исчерпать квоту → баланс»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

### Беседа 6.2: Billing UI + Admin Prompts Page (клиент)

**Контекст:**
- `03-specification.md` (секции 1.10 Prompt Registry, 1.11 Биллинг, 2.9 Prompts API, 2.10 Billing API)
- `05-file-structure.md` (client/pages/)
- Оформление нового интерфейса: `docs/fragments-for-conversations/5-6-ui-kit.md` (бриф и таблица соответствий классам исходника), `5-6-ui-kit.css` (примитивы), `5-6-ui-kit.html` (эталон разметки)
- Из предыдущих бесед: `client/api/client.ts`, `client/stores/auth-store.ts`
- Исходник: НЕ НУЖЕН

**Первый запрос:**
```
Создаю UI для биллинга и админки промптов.

Полностью новый код. Прикреплены: спецификация (Prompt Registry, Billing API).

Создай:
1. client/pages/BillingPage.tsx:
   - Секция "API-ключ":
     a. Текущий ключ: prefix + маска (sk-ant-***...***) + кнопка удалить
     b. Форма добавления нового ключа (input type=password)
     c. Статус: "Активен" / "Не задан"
   
   - Секция "Баланс сервиса":
     a. Текущий баланс: $X.XX
     b. Кнопка "Пополнить" → Stripe Checkout / Elements
     c. Выбор суммы: $1, $5, $10, произвольная
   
   - Секция "История использования":
     a. Таблица: дата, синтез, раздел, input/output tokens, стоимость, режим
     b. Фильтры: период, синтез
     c. Итоги: суммарные токены, суммарная стоимость
   
   - Секция "Транзакции":
     a. Таблица: дата, тип (пополнение/списание), сумма, баланс после
     b. Пагинация

2. client/pages/AdminPromptsPage.tsx (role === 'admin'):
   - Список шаблонов с поиском по ключу:
     a. Дерево ключей (method.dialectical.graph, method.dialectical.theses, ...)
     b. Фильтр: activeOnly, prefix
   
   - Редактор шаблона:
     a. Textarea с телом шаблона
     b. Подсветка плейсхолдеров ({{participants}}, {{method_label}})
     c. Preview: подстановка тестовых значений → результат
     d. Кнопка "Сохранить как черновик" (создаёт новую версию, не активирует)
     e. Кнопка "Активировать" (активирует версию, инвалидирует кэш)
   
   - История версий шаблона:
     a. Список версий с датами
     b. Diff между двумя версиями
     c. Кнопка "Откатить" (активировать старую версию)
   
   - Редактор конфигов (synthesis_configs):
     a. JSON-редактор (с подсветкой синтаксиса)
     b. Валидация JSON перед сохранением
     c. Версионирование аналогично шаблонам

3. client/api/billing.ts:
   - storeApiKey, deleteApiKey, listApiKeys
   - createTopup, confirmTopup
   - getUsageHistory, getTransactionHistory

4. client/api/prompts.ts:
   - listPrompts, getVersions, createVersion, activateVersion
   - listConfigs, updateConfig

5. Защита роута: AdminPromptsPage доступна только для role === 'admin'.
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
   - client/api/subscription.ts (05 его уже числит).

6. Форма ввода API-ключа в auth-модалке (долг TODO(6.1) главы 1.4b —
   задача клиентская, но была адресована серверной беседе 6.1; аудит
   2026-07-31):
   в client/src/components/synthesis/PauseModal.tsx auth-рендерер
   сейчас предлагает только «Повторить» (после замены ключа на
   сервере) и «Остановить» — порт _resumeWithNewApiKey [25028]
   опущен. После BYO-Key из 6.1 ключ становится пользовательским,
   и форму можно показать прямо в модалке паузы.
```

**Последующие запросы:**
- «Протестируй BYO-Key UI: ввести ключ → сохранение → отображается prefix → удалить → "Не задан"»
- «Протестируй пополнение: нажать $5 → Stripe mock → баланс обновлён → транзакция в истории»
- «Протестируй историю использования: после нескольких генераций → таблица заполнена → фильтр по синтезу работает → итоги совпадают»
- «Протестируй AdminPromptsPage: изменить шаблон "system" → сохранить как черновик → активировать → проверить что генерация использует новый шаблон»
- «Протестируй diff: две версии шаблона → визуальное сравнение показывает изменения»
- «Проверь доступ: обычный пользователь → /admin/prompts → redirect на 403 или каталог»

**Завершение беседы:**
- «Скомпилируй проект (`tsc --noEmit` для server/ и shared/) — покажи и исправь все type errors, не меняя логику»
- «Проверь интеграцию с файлами из предыдущих бесед: все импорты корректны (пути, имена экспортов)? Типы совместимы? Async/await правильно пробрасывается?»
- «Ревью: все ли функции из карты переиспользования (04-code-reuse-map.md) для этого модуля портированы? Перечисли оставшиеся TODO и заглушки. Зафиксируй список файлов из этой беседы, которые нужно загрузить как контекст в следующие беседы»

---

---

## 9. Ситуативные шаблоны запросов

Шаблоны ниже НЕ привязаны к конкретной беседе — используются по необходимости.

Стандартные шаги (компиляция, интеграция, ревью) уже включены в каждую беседу как блок «Завершение беседы» и здесь не дублируются.

### 9.1. При ошибке стриминга/генерации

```
При генерации синтеза возникает ошибка: [текст ошибки].

Контекст:
- streaming-manager.ts: [прикладываю]
- generation-service.ts: [прикладываю]
- Логи сервера: [прикладываю]

Где проблема? Исправь.
```

### 9.2. При расхождении данных между клиентом и сервером

```
Клиент показывает [X], но в БД значение [Y]. 

Файлы:
- Роут: [прикладываю]
- Сервис: [прикладываю]  
- Клиентский компонент: [прикладываю]
- SQL-запрос и результат: [прикладываю]

Найди, где теряется или трансформируется значение.
```

### 9.3. При несовместимости типов между модулями из разных бесед

```
Файл [X.ts] из беседы [N] импортирует тип/функцию из [Y.ts] из беседы [M].
Ошибка компиляции: [текст ошибки].

Прикладываю оба файла. Определи, какой из двух файлов нужно 
скорректировать (чтобы не сломать его потребителей), и исправь.
```

### 9.4. При деградации производительности

```
Запрос GET /syntheses/:id/categories занимает [N] мс (ожидание < 100 мс).

Прикладываю:
- Роут + сервис
- EXPLAIN ANALYZE для SQL-запроса
- Количество записей в таблицах

Оптимизируй: индексы, структура запроса, кэширование.
```

---

## 10. Контрольный чек-лист для каждой беседы

> **Добавлено 2026-07-31 (ссылки на исходник):** ссылайся на ИМЕНА
> функций, констант и селекторов — так, как они перечислены в
> `04-code-reuse-map.md`. Фиксированный диапазон строк допустим
> только там, где именованного якоря нет (последовательность
> операторов, разметка без id), и должен быть помечен как
> устаревающий. Исходный протокол так и написан: 33 блока
> извлечения по `grep -n` против одного диапазона.
>
> **Добавлено 2026-08-04 (спеки комплектов):** правка `.spec` без
> пересборки фрагмента НЕ считается выполненной. После любой правки
> спецификации запусти `python3 scripts/extract-by-name.py ПУТЬ.spec`
> и проверь код возврата: при ненайденной цели сборщик пишет
> «фрагмент не записан» и ОСТАВЛЯЕТ прежний файл — со стороны это
> неотличимо от успеха. Именно так правка беседы 1.6b (disclosure-CSS)
> простояла в спеке 1.6 недействующей: цель стояла внутри `scope:`,
> не покрывавшего нужные строки.
>
> **Добавлено 2026-07-31:** завершая беседу, внеси каждый оставленный
> долг в §12 «Реестр открытых долгов» с ЯВНЫМ номером беседы-адресата,
> а закрытый — вычеркни оттуда. Записи только в главе NEXT-CONTEXT
> недостаточно: именно так семь долгов потеряли адресата.

Перед началом:
- [ ] Определил задачи беседы (из 06-dev-strategy.md)
- [ ] Определил нужные фрагменты исходника (из 04-code-reuse-map.md)
- [ ] Извлёк фрагменты: при наличии `.spec` —
      `python3 scripts/extract-by-name.py docs/fragments-for-conversations/N.spec`
      (для бесед без спеки — вручную из `source/`)
- [ ] Собрал файлы из предыдущих бесед (только прямые зависимости)
- [ ] Загрузил все 7 проектных документов (комплект самодостаточен)

В процессе:
- [ ] Все файлы созданы (из 05-file-structure.md)
- [ ] TypeScript компилируется без ошибок
- [ ] Эндпоинты протестированы (curl / клиент)
- [ ] Данные корректно сохраняются в БД

После:
- [ ] Ревью: все функции из карты портированы
- [ ] Список файлов для следующей беседы зафиксирован
- [ ] TODO задокументированы

---

## 11. Граф зависимостей бесед

```
0.1 (скелет, БД, типы, константы)
 ├── 0.2 (auth, Hono, WS, rate-limiter)
 │    └── 0.5 (password-change; A2a reset — Фаза 3)
 │         └── 0.6 (PATCH /auth/me + ProfilePage — требует также 0.4)
 ├── 0.3 (seed-prompts, seed-configs, prompt-registry)
 │    ├── 0.3b (seed-taxonomy, element-taxonomy)
 │    └── 1.1 (synthesis-engine, topo-sort, compat-advisor, cost-estimator)
 │         ├── 1.2 (prompt-builder, section-defs-builder)
 │         │    └── 1.4 (streaming-manager, generation-service, graph-parser, element-parser)
 │         │         ├── 1.4b (pause-resume-service, PauseModal — v11)
 │         │         ├── 1.5 (SynthesisForm, GenerationProgress, SectionWarnings — клиент)
 │         │         │    └── 1.5b (Unified Concept Pool: pool-store, concept-file — клиент)
 │         │         ├── 2.2 (plan-executor, regenerateSection/Subsection, addSection, deleteSection)
 │         │         │    └── 2.3 (EditModal, CascadePanel, EditPlanPanel — клиент)
 │         │         ├── 3.1 (meta-synthesis-service, lineage-service)
 │         │         │    └── 3.2 (ConceptPool + GenealogyTree — клиент, v10)
 │         │         ├── 4.1 (mode-service, ModeModal — бэкенд + клиент)
 │         │         ├── 4.2 (export: html, mmd, png, json)
 │         │         └── 4.3 (import-service, ImportPage)
 │         │
 │         ├── 1.3 (context-builder, context-extractor)
 │         │    └── 1.4
 │         │
 │         └── 2.1 (cascade-analyzer, edit-planner)
 │              └── 2.2
 │
 └── 0.4 (клиент каркас, роутинг, stores, api/client, useWebSocket)
      ├── 1.5 (форма + прогресс)
      │    └── 1.5b (Unified Concept Pool)
      ├── 1.6b (DocumentView, CatalogPage) ← требует также 1.6 (роуты чтения)
      ├── 1.7 (Graph3D, Graph2D, GraphModal, NodePanel) ← требует также
      │        1.6 (GET /categories) и 1.6b (SynthesisPage — хозяин модалки)
      ├── 2.3 (EditModal, CascadePanel)
      ├── 2.4 (ContextLogViewer, colorize-log)
      ├── 3.2 (ConceptPool + GenealogyTree, v10)
      ├── 5.2 (ElementEditor, CategoryEditor, VersionHistory)
      └── 6.2 (BillingPage, AdminPromptsPage)

1.6 (роуты чтения: syntheses, sections, categories) ← 1.4 (данные, WS) + 1.4b (pausedState/pauseEstimates)
2.3 (EditModal поверх страницы синтеза) ← 2.1 + 2.2 (планы) + 1.6b (SynthesisPage, SectionView, synthesis-store) + 1.6 (/sections/:key/context)
2.4 (ContextLogViewer, кнопка в футере) ← 1.6b (DocumentFooter); fallback промптов — только после 4.2 (prompt-reconstruction)
4.2 (export) ← 2.4 (log-formatter: снятие TODO(4.2), предвычисленный видимый лог) + 4.1 (MODE_CONFIG для секции режимов и реконструкции) + 1.7 (GraphModal — снятие exportStub) + 1.6b (SynthesisPage — меню «⤓ Экспорт»; DocumentHeader — двойник шапки) + 3.1 (lineage → однослойная genealogy в embedded state)
3.2 (пул + генеалогия) ← 1.5b (пул уже создан) + 3.1 (routes/lineage.ts) + 1.6b (SynthesisPage, CatalogPage, SynthesisCard)
1.6b (просмотр документа и каталог) ← 0.4 + 1.6 (роуты) + 1.5 (useStreamingGeneration, PauseModal)
1.7 (граф) ← 0.4 + 1.6 (GET /categories) + 1.6b (SynthesisPage)
2.3 (бейдж качества контекста на карточке раздела) ← 2.4 (context-quality.ts, getSectionContextQuality)
5.1 (element-editor, element-versioning) ← 0.1 (schema) + 2.1 (cascade-analyzer)
5.3 (element-enrichment) ← 5.1 + 0.3b (taxonomy) + 1.4 (streaming-manager)
5.4 (CharacteristicSlider, EnrichmentPanel, TaxonomySelector) ← 5.3 + 5.2 + 1.7 (NodePanel)
5.5 (representation-transformer, TransformPanel) ← 1.4 (graph-parser, streaming) + 0.3b (taxonomy) + 1.7 (GraphModal) + 1.6b (SectionView)
5.2 (ElementEditor UI) ← 5.1 + 1.7 (NodePanel) + 1.6b (SectionView) + 2.3 (EditModal/useEditPlan — «перегенерировать затронутые» только через планы)
6.1 (billing-service, api-key-service) ← 0.1 (schema) + 0.2 (auth) + 1.4 (streaming-manager)
6.2 (BillingPage, AdminPromptsPage) ← 6.1 + 0.4 (клиент каркас)
```

**Чтение графа:**
- Вертикальные линии (├──) означают «зависит от родителя И от предыдущих бесед на том же уровне»
- Стрелка `←` означает «зависит от» (для бесед вне основного дерева)
- Беседы на одном уровне можно вести параллельно (если два человека работают)

**Критический путь (самая длинная цепочка):**
0.1 → 0.3 → 1.1 → 1.2 → 1.4 → 2.2 → 2.4 → 2.3
  (2.4 перед 2.3: context-quality.ts нужен бейджу в EditSectionCard —
   иначе 2.3 работает по null; аудит 2026-07-30)

**Параллелизуемые ветки:**
- После 1.4: беседы 1.5, 3.1, 4.1, 4.2, 4.3 можно вести параллельно
- После 0.4: беседы 1.5 и 1.6 можно вести параллельно (1.6 серверная,
  от клиента не зависит). 1.6b и 1.7 — только после 1.6; 1.7 удобнее
  после 1.6b, потому что кнопка графа живёт в actions-bar документа
- Фазы 5 и 6 независимы друг от друга

---

## 12. Реестр открытых долгов

Заведён аудитом 2026-07-31. До него адреса долгов жили только в семи
главах `NEXT-CONTEXT.md` (разделы «Открытые TODO после X»), и потерю
адресата не ловила ни одна проверка: долг заводится в одной беседе,
адресуется другой, та его не делает и переадресует дальше — на втором
шаге адрес размывается («TODO(2.x)») или исчезает.

**Правило:** беседа, оставляющая долг, обязана внести строку СЮДА, а не
только в свою главу журнала. Беседа, закрывающая долг, вычёркивает
строку. Адрес без номера беседы («2.x», «позже», «когда появится») не
допускается — если адресата нет, долг остаётся за текущей беседой.

| Долг | Адресат | Заведён | Состояние |
|---|---|---|---|
| `getEffectiveModeDepsFromConfig` / `MODE_TITLES` — локальные порты в cascade-analyzer; владелец `getEffectiveModeDeps`/`MODE_CONFIG` — mode-service (метки TODO(4.1) в коде) | 4.1 | 2.1 | ЗАКРЫТ 4.1 (2026-08-28): MODE_TITLES удалён, делегаты — ленивые await import("./mode-service.js") (анти-цикл через generation-service) |
| Регистрация `regenerateModeSilent` в разъём `setModeRegenerator` (plan-executor; до неё шаги regen_mode → failed, план продолжается) | 4.1 | 2.2 | ЗАКРЫТ 4.1 (2026-08-28): регистрация побочным эффектом импорта mode-service |
| Карточки результатов режимов в EditModal [18560–18630] (транспорт GET /modes готов с 4.1) | 4.1 | 4.1 | ЗАКРЫТ 4.1 (2026-08-28, довыполнение): ModeResultsPanel (панель «РЕЖИМЫ», чекбоксы с id исходника, ⚡-строки затронутости; взаимоисключение — паритет валидации edit-planner, исходник позволял оба) + план modeRegen/modeRemove из EditModal + кнопка «отметить ↑» в CascadePanel E5 [19483] + refetch панели по onPlanFinished и счётчиков SynthesisPage при закрытии модалки; тест R6 |
| Каскад режимов после перегенерации подраздела (очередь runMode из SubsectionRegenPanel; mode-service готов с 4.1) | 4.1 | 4.1 | ЗАКРЫТ 4.1 (2026-08-28, довыполнение) С ПЕРЕФОРМУЛИРОВКОЙ: исходник после волны спрашивал confirm со списком и оценкой [19007–19036] и звал runMode() с paramValue ИЗ ПОЛЯ МОДАЛКИ [19034] («нужен fallback» — его же комментарий; создавало НОВЫЙ результат с чужим параметром). Реализовано: confirm 1:1 [19022] → очередь тихих перегенераций СУЩЕСТВУЮЩИХ результатов с их СОБСТВЕННЫМИ param (механизм планового каскада [19756]) через новый POST /modes/:modeKey/:index/regenerate (startModeRegen, финал mode_done); тест R7 |
| Внутрисекционный каскад по `affectedSubs` (regenerateSubsection возвращает зависимые подразделы; предложение/исполнение — UI) | 2.3 | 2.2 | ЗАКРЫТ 2.3 (2026-08-20) с переформулировкой: буквально неисполним — роут отвечает { ok:true } фоном; зависимые вычислимы по картам ДО перегенерации → превью POST /subsection-impact + чекбоксы волны и очередь последовательных запусков по section_done в SubsectionRegenPanel |
| Бейдж качества контекста (`contextQualityScore`) | 2.3 | 1.3 | ЗАКРЫТ 2.3 (2026-08-20): бейдж на EditSectionCard, пороги исходника ≥90/≥60 [18497], null → бейдж не рисуется |
| `registerParentContextProvider` — реальный провайдер | 3.1 | 1.4 | ЗАКРЫТ 3.1 (2026-08-20): стаб заменён buildMetaParentContext (meta-synthesis-service): 'monolithic' → Full, иначе Selective + intra-spec подраздела |
| `parentFieldsUsed` / `conceptBlockSizes` / `parentSpecBySection` | 3.1 | 1.4 | ЗАКРЫТ 3.1 (2026-08-20): genCommon и проходы наполнены реальными участниками (loadConceptParticipants) |
| Серверные участники-концепции (снятие гейта мета-синтеза) | 3.1 + 3.2 | 1.5b | серверная половина ЗАКРЫТА 3.1 (2026-08-20): POST принимает type='synthesis' с валидацией и генеалогией; клиентская ЗАКРЫТА 3.2 (2026-08-21): гейт СУЖЕН до файловых концепций (остаток — серверный импорт файлов, 4.3) |
| Данные для `estimate-diff` | 3.1 | 1.5b | ЗАКРЫТ 3.1 (2026-08-20): /estimate принимает участников-концепций, вес родителей — колбэком parentOverheadForSection; отрисовка разницы — 3.2 |
| `reconstructGenealogy` | 3.2 | 1.5b | ЗАКРЫТ 3.2 (2026-08-21): клиентский порт в `client/utils/genealogy.ts`; importConceptAsParticipant заполняет participant.genealogy |
| `restoreCapsulesFromHTML` | 3.2 | 1.5b | ЗАКРЫТ 3.2 (2026-08-21): порт в `client/utils/genealogy.ts` (капсулы родителей — из .gen-card сохранённого дерева файла) |
| `applyReplacement` / `updateCompatAdvisor` / `toggleCompatPanel` | 3.2 | 1.1 (адресовался 1.5, затем «2.x») | ЗАКРЫТ 3.2 (2026-08-21): кнопки замен + orderAdvice + автораскрытие при конфликте в CompatAdvisor.tsx; onApplyReplacement меняет method/synthLevel/generationOrder формы — пересчёт советов/предупреждений/оценки через deps эффектов |
| Отрисовка `estimate-diff` в `FullBudgetPreview` | 3.2 | 1.5b | ЗАКРЫТ 3.2 (2026-08-21): /estimate дважды (с участниками и без, дебаунс 600 мс), строка «Оценка с родителями: … · без: … · разница: …» |
| Серверный импорт концепт-файлов | 4.3 | 1.5b | ЗАКРЫТ 4.3 (2026-08-30): POST /syntheses/import + import-service принимают standalone-файлы и экспорт сервиса (шаги a–m: syntheses/sections/граф/тезисы/глоссарий/логи/lineage/режимы, откат CASCADE при сбое); клиентский остаток — строкой ниже |
| Авто-импорт файловых ☑-концепций при сабмите формы синтеза (SynthesisForm: файл → POST /syntheses/import → участник type='synthesis' с полученным id; снятие гейта 1.5b/3.2) | 6.2 | 4.3 | внесён 2026-08-30 |
| `reconstructSkeleton` как fallback в `formatPromptsForExport` | 4.2 | 2.4 | ЗАКРЫТ 4.2 (2026-08-29): `server/services/prompt-reconstruction.ts` (4 async-функции), подключён в formatPromptsForExport — rc один раз на форматирование, needsReconstruction → baseCtx+skeleton; TODO(4.2) в log-formatter сняты |
| BYO-Key (ключ пользователя вместо env) | 6.1 | 1.4 | в тексте 6.1 |
| Форма ввода ключа в auth-модалке `PauseModal` | 6.2 | 1.4b (адресовался 6.1) | внесён 2026-07-31 |
| Per-user HTTP-лимитирование (подсчёт после auth; сейчас фактически per-IP — 03 §3.4) | 6.1 | 1.6 | внесён 2026-08-02 |
| `makeSectionCtxDisclosure` — disclosure секционного контекста в документе (sec_context отдаётся в SectionFull, UI не показывает) | 2.3 | 1.6b | ЗАКРЫТ 2.3 (2026-08-20): details.sec-disclosure в SectionView при непустом secContext |
| Экспорт графа MMD/PNG/JSON (кнопки GraphModal — заглушки, метки TODO(4.2) в GraphModal.tsx; серверные services/export/*) | 4.2 | 1.7 | ЗАКРЫТ 4.2 (2026-08-29): серверные `services/export/*` (mmd/png/json/md/html + graph-model/style/physics/filename/common) + 5 роутов `routes/export.ts`; GraphModal → downloadExport (exportStub снят), меню «⤓ Экспорт» в SynthesisPage + `client/src/api/export.ts` |

| Админские update/delete пользовательских типов каталога (`POST` есть с 0.3b, изменение и удаление не специфицированы — 03 §2.13) | 5.4 | 0.3b | внесён 2026-09-02 (аудит фаз 5–6, п.19) |
| Прогрев кэша Prompt Registry при старте (`warmCache` реализован в 0.3, в index.ts не подключён) | 6.1 | 0.3 | внесён 2026-09-02 (п.19) |
| Ролевая защита маршрута `/admin/prompts` на клиенте (сейчас только RequireAuth) | 6.2 | 0.4 | внесён 2026-09-02 (п.19) |
| UI подписок в BillingPage (бэкенд готов: 02 §2.22–2.23, 03 §2.10, subscription-service 6.1) | 6.2 | 6.1 | внесён 2026-09-02 (п.8) |
| Учёт обогащений в биллинге (api_usage + used_enrichments; разъём в 5.3, наполнение — после 6.1) | 6.1 | 5.3 | внесён 2026-09-02 (п.10) |
| Показ `htmlSync.pending`/`sectionMissing` в UI редактора (обоснование тезиса без абзаца, termCategory глоссария — в html_content не отражены; сервер 5.1 отдаёт список, клиент обязан предупредить и предложить перегенерацию) | 5.2 | 5.1 | ЗАКРЫТ 5.2 (2026-09-04): `.callout.warning` с полем и разделом в блоке «Анализ влияния» ElementEditor; раздел-хозяин добавляется в «Перегенерировать затронутые» (EditModal.initialRegen) |
| `CATEGORY_TYPES` в CategoryEditor — клиентская копия 14 типов промпта графа (select типа категории); заменить TaxonomySelector по каталогу 0.3b (18 = 14 + расширенные) с индикатором «из каталога / свободный текст»; расширенные по методу — `EXTRA_CATEGORY_TYPES` | 5.4 | 5.2 | внесён 2026-09-04 (секция 4ac сторожит ⊆ section-templates) |
| Парсер глоссария 1.4 ищет таблицу по первому th «термин» [8027], а рендерер 5.1 — ещё и по data-section «Таблица определений»; при `lang ≠ Russian` заголовок переведён и парсер таблицу НЕ найдёт (глоссарий такого документа не попадает в glossary_terms) — унифицировать поиск по data-section | 5.5 | 5.1 (дыра 1.4) | внесён 2026-09-03 |

Долги, снятые как «не долг»: `POST /auth/password-reset/*` — вне MVP,
помечено в 03 §2.1; `POST /syntheses/estimate` и `/advice` — реализованы
беседой 1.5, зафиксировано записью ревизии.

---

## Единство стилей с исходником (правка 2026-09-02)

До этой правки клиент нёс лишь документную часть CSS исходника, а
интерфейс «рабочего места» (форма, прогресс, советник совместимости, пул,
пауза, каскад, импорт) был переписан утилитами Tailwind. Аудит показал 228
непокрытых правил из 586, 43 правила, перенесённых с изменениями, и 6
висячих классов. Расхождение закрыто целиком.

### Правило работы

1. `client/src/globals.css` состоит из трёх частей: палитра и базовый слой
   сервиса, **дословный порт** блока `<style>` исходника [13–3528], затем
   дополнения сервиса. Часть 2 руками не правится — расхождение с
   исходником считается дефектом, а не правкой.
2. Новый интерфейсный элемент оформляется **классами исходника**. Если
   подходящего класса нет (в одностраничнике нет ни навигации, ни
   каталога, ни экранов входа), класс заводится в части 3 с префиксом
   `app-` или по смыслу блока и с комментарием, почему в исходнике его
   нет.
3. Утилиты Tailwind остаются доступными (директива `@tailwind utilities`
   стоит в конце файла и перебивает классы исходника), но не заменяют
   систему: скруглений, теней и произвольной типографики в разметке быть
   не должно — микро-подписи набираются моноширинным шрифтом капителью с
   разрядкой, углы прямые.
4. Проверка — `python3 scripts/css-parity-audit.py` из корня репозитория.
   Разделы A и B обязаны быть нулевыми; раздел D сверяет, что
   `EXPORT_SOURCE_RAW_CSS` по-прежнему побайтово равен блоку `<style>`.

### Отклонения сервиса (часть 3 globals.css)

- Каркас SPA: `.app-root`, `.app-shell`, `.app-main`, `.app-sidebar`
  (+`-desktop`/`-mobile`/`-head`/`-backdrop`), `.app-nav-*`,
  `.app-topbar-btn`/`-link`, `.app-burger`. В исходнике навигации нет —
  страница одна.
- `.topbar-right.app-topbar-right` — парная метка: в исходнике строка
  справа статична (`opacity: .5`), у сервиса в ней ссылка и кнопка.
  Правило исходника при этом остаётся дословным.
- Экраны входа и регистрации (`.auth-screen`, `.auth-card`,
  `.auth-header`), каталог (`.catalog-list`, `.catalog-card*`,
  `.catalog-filter-bar`), пикер «Из каталога» (`.pool-catalog-*`),
  drop-зона импорта (`.import-dropzone`), `.pause-content`,
  `.lineage-search`, `.synth-ready-row`.
- Анти-переполнение полей (`min-width: 0`, `max-width: 100%` на
  `.form-input`/`.form-select`/`.form-textarea`): ширина `<select>` в
  Chrome тянется по самой длинной опции и распирала страницу на 375px.
- Мобильные отклонения требования R9: легенда графа < 600px, модалка
  редактирования < 768px.

### Что это меняет в тестах

`innerText` в Chrome отдаёт **отрисованный** текст, а микро-подписи,
кнопки, чипы и заголовки карточек набраны капителью — текстовые сравнения
в браузерных тестах должны быть регистронезависимыми. Кроме того,
структурные якоря сменились: карточка пула — `.pool-card` (не
`div.rounded.border`), колонка эпохи — `.phil-col-group` (метка и чекбоксы
внутри неё, а не «метка + соседний grid»), подпись чекбокса пула —
**сосед** input'а, а не обёртка, поле контекста раздела всегда в DOM и
скрывается классом (проверять видимость, а не наличие узла), сетки
`.checkboxes-row` — `auto-fill minmax`, поэтому на 375px дают одну
колонку. Прогоны после правки: 0.4/2 — как база, 0.4/4 и 0.4/6 — все
проверки, 0.6 — 16 ✓, 1.5 — 39 ✓ (как база), 1.5b — как база, 1.6b — 63 ✓,
1.7 — 84 ✓, 2.3 — 60 ✓, 2.4 — 51 ✓, 3.2 — 52 ✓, 4.1 — 77 ✓, 4.3 — 64 ✓.
