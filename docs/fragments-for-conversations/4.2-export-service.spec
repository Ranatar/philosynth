# Спецификация фрагмента для беседы 4.2 (Export Service).
# Сборка: python3 scripts/extract-by-name.py \
#           docs/fragments-for-conversations/4.2-export-service.spec

## Экспорт документа
js:saveHTML
js:saveMD
# saveLang — В 4.2 НЕ ВХОДИТ: UI выбора ЯЗЫКА ГЕНЕРАЦИИ (01 «Мелкое»
# п.6; не язык интерфейса). Реализован беседами 1.5 (селектор
# SynthesisForm) + 1.2 (lang_instruction) + 1.6 (syntheses.lang);
# в комплекте для чтения контекста экспорта (docLang в шапке)
js:saveLang
js:getDocFilename

## Markdown-конвертация
js:sec2md
js:node2md
js:inline2md
js:table2md
js:sig2md

## Экспорт графа и режимов
js:exportMMD
js:exportPNG
js:exportJSON
js:buildGraphExportSection
js:buildModesExportSection

## Чистка CSS перед вставкой в автономный HTML
js:auditCSS

## Реконструкция промптов (server/services/prompt-reconstruction.ts):
## fallback для записей без _promptSkeleton; беседа 2.4 оставляет
## под него TODO(4.2)
js:reconstructSkeleton
js:reconstructBaseCtxSkeleton
js:reconstructCtxMarkers
js:reconstructSectionTask
# reconstructGenealogy — В 4.2 НЕ ВХОДИТ: клиентский порт сделан 3.2
# (client/utils/genealogy.ts), серверный — беседа 4.3; в комплекте для
# чтения (формат genealogy, который экспорт кладёт в embedded state)
js:reconstructGenealogy

## Меню экспорта графа (долг из 1.7: MMD/PNG/JSON — заглушка)
css*:.gm-export-
