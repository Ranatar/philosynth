# Спецификация фрагмента для беседы 3.2 (участники-концепции + дерево
# генеалогии, клиент).
# Сборка: python3 scripts/extract-by-name.py \
#           docs/fragments-for-conversations/3.2-genealogy-ui.spec

## Дерево генеалогии
js:reconstructGenealogy
js:renderGenealogyTree
js:stripCapsulesFromGenealogy
js:updateGenealogyInHeader
js:checkGenealogyOverlaps
js:normalizeGenealogyNames

## Синхронизация участников перед генерацией (пункт 1 первого запроса:
## дополнение пула, созданного беседой 1.5b)
js:refreshAllSynthParticipants

## Стили дерева: карточки, вертикальная раскладка, соединители.
## Область обрывается ПЕРЕД медиазапросами: сборщик вынимает правила
## БЕЗ обёртки @media, и мобильные/светлые переопределения стали бы
## безусловными (грабля, родственная легенде графа в 1.7).
scope:\.gen-tree \{..@media \(prefers-color-scheme: light\)
css*:.gen-
scope:all

## Три медиазапроса (светлая схема, печать, ≤500px) — целиком, с
## обёртками. Именованных якорей у них нет: остаточный диапазон,
## как в спеке 1.6. При расхождении искать по «prefers-color-scheme»
## и «max-width: 500px».
lines:3168-3267

## Светлый контекст дерева в теле документа — идёт ПОСЛЕ медиазапросов
scope:\.gen-tree-light \.gen-card \{..\.doc-title-edit-btn
css*:.gen-
scope:all
