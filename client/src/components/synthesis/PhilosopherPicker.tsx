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
    <div>
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold text-ink">Философы</div>
        <div className="font-mono text-xs text-ink-dim">
          выбрано: {selected.length}
        </div>
      </div>
      <div className="mt-1 font-mono text-[10px] leading-relaxed text-ink-dim">
        Опционально: без выбранных философов синтез идёт только из зерна
        (свободный синтез).
      </div>

      <div className="mt-2 max-h-80 overflow-y-auto rounded border border-rule bg-white p-3">
        {PHILOSOPHER_EPOCHS.map((epoch) => (
          <div key={epoch.label} className="mb-3 last:mb-0">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-ink-dim">
              {epoch.label}
            </div>
            {/* responsive: 2 колонки на мобильных (07, тест responsive) */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3 md:grid-cols-4">
              {epoch.philosophers.map((name) => (
                <label
                  key={name}
                  className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-mid hover:text-ink"
                >
                  <input
                    type="checkbox"
                    checked={selectedSet.has(name)}
                    onChange={() => toggle(name)}
                    className="accent-[var(--gold)]"
                  />
                  <span className="truncate" title={name}>
                    {name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
