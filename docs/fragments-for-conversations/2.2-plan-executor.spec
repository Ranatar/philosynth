# Спецификация фрагмента для беседы 2.2 (Plan Executor + Regeneration).
# Сборка: python3 scripts/extract-by-name.py \
#           docs/fragments-for-conversations/2.2-plan-executor.spec
# Имена — из docs/04-code-reuse-map.md §2.4 и первого запроса беседы 2.2.

## Исполнение плана (server/services/plan-executor.ts)
js:executeEditPlan
js:resumePlan
var:_planPollInterval

## Операции над разделами (server/services/regeneration-service.ts)
js:regenerateSection
js:regenerateSubsection
js:addSection
js:deleteSection
js:buildDeletionReplacements
js:getAvailableSectionsToAdd

## Пересборка подраздела «Структура документа» после add/delete.
## Дыра прежнего комплекта: функция названа в первом запросе 2.2,
## но её текст лежал только в комплекте 4.3.
js:refreshSumDef

## Кнопка «Обновить» карточки «Структура устарела»: серверную часть
## вызывает она. UI-порт — беседа 2.3, здесь как референс контракта.
js:regenStructureFromEditModal
