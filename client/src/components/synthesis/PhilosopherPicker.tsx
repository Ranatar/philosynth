/**
 * Выбор философов. Беседа 1.5 (запрос 1, п. 3).
 *
 * Чекбоксы из shared/constants/philosophers.ts (106 позиций, +36 в v10),
 * группировка по эпохам — как #philBox исходника (phil-group-label +
 * checkboxes-row). Разметка — React, HTML исходника только референс.
 *
 * v11: выбор ОПЦИОНАЛЕН (0 философов = свободный синтез) — компонент
 * не валидирует, только отдаёт список; валидация «0 участников → нужен
 * seed» — в SynthesisForm.
 *
 * Правка 2026-09-02 (единство стилей с исходником): разметка приведена
 * к #philBox исходника — .checkboxes-row → .phil-col-group →
 * .phil-group-label + .checkbox-item; выбранный получает ._checked.
 */
import { PHILOSOPHER_EPOCHS } from "@philosynth/shared/constants/philosophers";

export interface PhilosopherPickerProps {
  selected: readonly string[];
  onChange: (next: string[]) => void;
}

export function PhilosopherPicker({
  selected,
  onChange,
}: PhilosopherPickerProps) {
  const selectedSet = new Set(selected);

  const toggle = (name: string) => {
    if (selectedSet.has(name)) {
      onChange(selected.filter((n) => n !== name));
    } else {
      onChange([...selected, name]);
    }
  };

  return (
    <div className="form-group full">
      <div className="form-label">Философы для Синтеза</div>
      <div className="form-sublabel">
        Опционально: без выбранных философов синтез идёт только из зерна
        (свободный синтез). Рекомендуется 2–5 для лучшего результата.
        Выбрано: {selected.length}.
      </div>

      <div className="checkboxes-row">
        {PHILOSOPHER_EPOCHS.map((epoch) => (
          <div key={epoch.label} className="phil-col-group">
            <div className="phil-group-label">{epoch.label}</div>
            {epoch.philosophers.map((name) => (
              <label
                key={name}
                className={
                  selectedSet.has(name)
                    ? "checkbox-item _checked"
                    : "checkbox-item"
                }
                title={name}
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(name)}
                  onChange={() => toggle(name)}
                />
                {name}
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
