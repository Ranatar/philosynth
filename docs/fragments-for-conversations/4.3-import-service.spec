# Спецификация фрагмента для беседы 4.3 (Import Service).
# Сборка: python3 scripts/extract-by-name.py \
#           docs/fragments-for-conversations/4.3-import-service.spec

## Разбор импортируемого файла
js:importHTML
js:extractMetadata
js:validateImportMeta
js:extractSections
js:extractEmbeddedState
js:extractModesFromHTML

## Восстановление состояния
js:populateFromImport
js:buildDocStateFromImport
js:restoreCapsulesFromHTML
js:updateSchemaBadgeInHeader
js:normalizeGenealogyNames
js:refreshSumDef
js:resolveConceptName

## Загрузка через Unified Concept Pool (клиентские точки входа, 1.5b)
js:handlePoolFileImport
js:handlePoolUrlImport

## Индикатор импортированного документа
css*:.import-
