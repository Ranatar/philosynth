# Спецификация фрагмента для беседы 2.1 (Cascade Analyzer + Edit Planner).
# Сборка: python3 scripts/extract-by-name.py \
#           docs/fragments-for-conversations/2.1-cascade-planner.spec
# Имена взяты из docs/04-code-reuse-map.md §1.1/§1.3/§2.4 и из первого
# запроса беседы 2.1 в 07. Номера строк НЕ входят в спецификацию —
# их вычисляет сборщик.

## Каскадный анализ (server/services/cascade-analyzer.ts)
js:computeDependents
js:getIntraDependents
js:getCrossSecDependents
js:getAffectedModes
js:sortInTopoOrder
js:buildPlanOrder
js:buildCtxKeyConsumers
js:canonicalSubsectionKey
js:buildFactualDepsMap
js:computeFactualDependents
# прообраз analyzeImpact(): DOM-часть отбрасывается, остаётся расчёт
js:updateLiveCascade

## Реэкспорт из 1.1 — не портируется заново, нужен для сверки сигнатуры
js:sourceOf

## Планирование правки (server/services/edit-planner.ts)
js:recalcEditPlan

## Волновая оценка стоимости: дополняет cost-estimator.ts из 1.1
## (отложены из 1.1 сознательно — требуют каскадного анализа)
js:estimateCascadeWaveCost
js:formatWaveCost

## Разметка панели каскада — визуальный референс для 2.3;
## updateLiveCascade без неё нечитаем
html:#cascadePanel

# НЕ включено намеренно: computeSectionWarnings — попутный груз прежнего
# диапазонного среза, портирован беседой 1.1 в compat-advisor.ts.
