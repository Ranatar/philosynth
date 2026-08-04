# Спецификация фрагмента для беседы 3.1 (Meta-Synthesis + Lineage).
# Сборка: python3 scripts/extract-by-name.py \
#           docs/fragments-for-conversations/3.1-meta-synthesis.spec

## Родительский контекст: константы (спец. 01-architecture §4.13)
var:PARENT_FIELD_ORDER
var:PARENT_FIELD_LABELS
var:PARENT_DEPS_BASE
var:PARENT_DEPS_LEVEL
var:PARENT_INTRA_DEPS
var:PARENT_CONTEXT_SCHEMA_ID
var:PARENT_CONTEXT_SCHEMA_VERSION

## Сборка родительского контекста
js:conceptContextBlockFull
js:conceptContextBlockSelective
js:resolveParentDeps
js:resolveParentDepsForSubsection
js:parentFieldsUsedFor
js:buildParentSpecForLog
js:_validateParentDeps

## Участники-концепции
js:importConceptAsParticipant
js:isPlaceholderConceptName
js:resolveConceptName

## Генеалогия (server/services/lineage-service.ts)
js:checkGenealogyOverlaps
js:collectPhilosopherAncestors
js:normalizeGenealogyNames
js:reconstructGenealogy

# НЕ включено: parseConceptFile и refreshPoolParticipant — названы в
# первом запросе 3.1 как окружение, но портированы беседой 1.5b;
# их текст — в комплекте 1.5b-concept-pool.js.
