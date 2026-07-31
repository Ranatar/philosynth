# Дополнение к 1.7-graph-viz.js: graph-STATE, оставшийся вне основного
# фрагмента (тот резался по баннерам GRAPH MODAL…MMD EXPORT).
# Сборка: python3 scripts/extract-by-name.py \
#           docs/fragments-for-conversations/1.7-graph-state-extras.spec

## Состояние графа и сброс фильтра легенды
var:G

var:clusterVisible 

js:clearLegendFilter
