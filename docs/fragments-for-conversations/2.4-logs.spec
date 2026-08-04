# Спецификация фрагмента для беседы 2.4 (лог контекста и генерации).
# Сборка: python3 scripts/extract-by-name.py \
#           docs/fragments-for-conversations/2.4-logs.spec

## Форматирование лога (server/services/log-formatter.ts)
js:formatCtxLog
js:formatCtxLogHTML

## Раскраска (client/components/logs/colorize-log.ts)
js:colorizeLog

## Просмотр и выгрузка — названы в первом запросе 2.4, но в прежнем
## диапазонном комплекте их не было: срез обрывался на строке 24088
js:viewCtxLog
js:closeCtxLog
js:copyCtxLog
js:refreshCtxLogIfOpen
js:downloadPrompts

## Дамп промптов (GET /logs/prompts)
js:formatPromptsForExport
js:buildPromptSkeleton
js:_logPauseEvent

## Разметка и стили окна лога (ContextLogViewer)
html:#ctxLogOverlay
css*:.raw-

# НЕ включено намеренно: reconstructSkeleton и спутники
# (reconstructBaseCtxSkeleton/CtxMarkers/Genealogy/SectionTask) —
# fallback для записей без _promptSkeleton здесь НЕ реализуется,
# prompt-reconstruction.ts создаёт беседа 4.2 (07, первый запрос 2.4).
