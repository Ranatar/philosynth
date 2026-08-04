# Спецификация фрагмента для беседы 2.3 (Edit Modal + Cascade Panel).
# Сборка: python3 scripts/extract-by-name.py \
#           docs/fragments-for-conversations/2.3-edit-modal-ui.spec
# Фрагмент — ТОЛЬКО визуальный референс UI (см. первый запрос 2.3):
# HTML не копируется, создаётся React.

## Состояние модалки
var:_editPlan
var:_subRegenTarget

## Модальное окно редактирования
js:openEditModal
js:closeEditModal
js:renderEditSections
js:onEditCheckChange
js:updateEditPlanUI
js:recalcEditPlan
js:updateLiveCascade
js:regenStructureFromEditModal

## Подразделовая перегенерация (SubsectionRegenPanel)
js:showSubsectionRegenUI
js:hideSubsectionRegenUI
js:toggleSubRegenInclude
js:executeSubsectionRegen

## Статическая разметка модалки и панели каскада
html:#editOverlay

## CSS модалки, карточек разделов и панели каскада — без него
## пропорции и поведение не воспроизвести (дыра, стоившая беседе 1.6b
## отдельной правки спеки)
css*:.edit-
css*:.cascade-
css*:.sec-ctx-
# составные селекторы (.edit-dep-warn .dep-icon, .sec-warning-item
# .warn-icon и т.п.) точным сравнением не берутся — только префиксом
css*:.dep-icon
css*:.rec-icon
css*:.warn-icon
css*:.step-icon

# НЕ включено: regenerateSubsection — серверная операция, беседа 2.2;
# esc() — общий хелпер, портирован в packages/shared/utils/escape.ts.
