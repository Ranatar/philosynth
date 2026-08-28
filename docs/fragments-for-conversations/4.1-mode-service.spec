# Спецификация фрагмента для беседы 4.1 (Mode Service, бэкенд + клиент).
# Сборка: python3 scripts/extract-by-name.py \
#           docs/fragments-for-conversations/4.1-mode-service.spec

## Конфигурация режимов и их зависимости
var:MODE_CONFIG
var:MODE_DEPS

## Ядро (server/services/mode-service.ts)
js:buildModeContext
js:checkModeDeps
js:getEffectiveModeDeps
js:getAffectedModes
js:runMode
js:regenerateModeSilent

## Оценка стоимости режима — портирована беседой 1.1 (cost-estimator.ts),
## здесь как референс вызова
js:estimateModeCost

## UI режимов (вкладки и модалка)
js:buildModeTabsBar
js:switchModeTab
js:addModeTab
js:finalizeModeTab
js:removeModeResult
js:openModeModal
js:closeModeModal
js:updateModeButtons

## Статическая разметка модалки режимов и панели вкладок
html:#modeOverlay
html:#modeTabsBar

## Стили режимов. css*:.mode- не ловит id-правило и keyframes —
## дыра комплекта, найденная беседой 4.1 (доложено в журнал 07)
css*:.mode-
css:#modeTabsBar
css:@keyframes pulse-tab

## Обрезка подписи вкладки. В исходнике ДВА truncLabel: этот и вложенный
## в buildModesExportSection (4.2), который печатает не символ …, а
## escape-последовательность. Область сужена, чтобы взять нужный.
scope:function getAffectedModes\(..function switchModeTab\(
js:truncLabel
scope:all
