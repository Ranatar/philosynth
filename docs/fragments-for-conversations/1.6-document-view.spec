# Спецификация фрагмента для беседы 1.6b (просмотр документа).
# Сборка: python3 scripts/extract-by-name.py \
#           docs/fragments-for-conversations/1.6-document-view.spec
# Имена взяты из docs/04-code-reuse-map.md. Номера строк НЕ входят
# в спецификацию — их вычисляет сборщик.

## CSS документа (область: от .output-wrap до баннера граф-модалки)
scope:\.output-wrap \{..── GRAPH MODAL ──
css*:.doc-
css*:#docTOC
css*:.toc-
css*:.section-
css*:.callout
css*:.risk
css*:.validity-stamp
css*:.stream-cursor
css*:.actions-bar
css*:.action-btn
# legacy — нужны только импортированным документам (беседа 4.3),
# текущие промпты этих классов не порождают
css*:.sig-
css*:.graph-node
css*:.graph-edge
scope:all
css:.doc-title-edit-btn
## Disclosure-CSS шапки и разделов
# disclosure-CSS шапки и разделов [2114–2226] — дыра спеки, найдена
# беседой 1.6b: DocumentHeader без этих стилей нечитаем.
# ВНИМАНИЕ: эти правила лежат ВНЕ области .output-wrap…GRAPH MODAL,
# поэтому идут после scope:all. Пока они стояли внутри области,
# сборщик их не находил и молча отказывался писать фрагмент —
# правка беседы 1.6b была внесена в спеку, но не действовала.
css*:.header-disclosure
css*:.sec-disclosure

## Разметка-эталон документа
html:#docOutput

## Шапка, оглавление, капсула, футер
js:makeHeaderDisclosure
js:buildDocHeaderExtras
js:buildTableOfContents
js:extractCapsuleText
js:restoreCapsulesFromHTML
js:updateCapsuleInHeader
js:removeCapsuleFromDocBodies
js:makeSectionCtxDisclosure
js:editDocTitle
js:updateDocTitleFromName
js:updateFooterCost

## Остаточные диапазоны: именованных якорей нет — это
## последовательности операторов и разметка без id. ЕДИНСТВЕННОЕ место
## спецификации, которое стареет при правке исходника; при расхождении
## искать по содержимому (docNum «PS-», actions-bar с кнопками экспорта).
## Заполнение шапки при старте генерации: docNum, дата, ML/DL/SL,
## три ветки docSubtitle, footerPhil
lines:12110-12144
## Панель действий над документом (разметка)
lines:4134-4168
