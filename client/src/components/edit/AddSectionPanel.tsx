/**
 * Панель добавления разделов. Беседа 2.3 (запрос 1, п. 7).
 *
 * Порт «Панели добавления» из renderEditSections [18277–18312]:
 * чекбоксы доступных разделов (getAvailableSectionsToAdd на сервере
 * недоступен клиенту — список считается так же: ВСЕ ключи минус текущий
 * sectionOrder; перечень известных ключей приходит пропом available от
 * EditModal), поле контекста для каждого — скрыто, появляется при
 * установке галочки (onEditCheckChange 'add'). Предупреждения о
 * зависимостях добавляемых (C1/C3) рисует CascadePanel — панель
 * добавления их не дублирует (в исходнике они тоже жили в #cascadePanel).
 */
export interface AddSectionPanelProps {
  /** Ключи, доступные к добавлению (нет в sectionOrder) */
  available: readonly string[];
  labels: (key: string) => string;
  checked: ReadonlySet<string>;
  onToggle: (key: string, checked: boolean) => void;
  addCtx: Readonly<Record<string, string>>;
  onCtxChange: (key: string, value: string) => void;
  disabled?: boolean | undefined;
}

export function AddSectionPanel({
  available,
  labels,
  checked,
  onToggle,
  addCtx,
  onCtxChange,
  disabled,
}: AddSectionPanelProps) {
  if (available.length === 0) return null;
  return (
    <div className="edit-add-panel">
      <div className="edit-add-title">+ Добавить разделы</div>
      <div className="edit-add-checks">
        {available.map((k) => (
          <label key={k} className="edit-add-check">
            <input
              type="checkbox"
              checked={checked.has(k)}
              onChange={(e) => onToggle(k, e.target.checked)}
              disabled={disabled}
            />
            + {labels(k)}
          </label>
        ))}
      </div>
      {available
        .filter((k) => checked.has(k))
        .map((k) => (
          <div key={k} className="edit-sec-ctx-row" style={{ marginTop: 8 }}>
            <div className="edit-sec-ctx-label">Контекст для «{labels(k)}»</div>
            <textarea
              className="edit-sec-ctx-field"
              placeholder="Особые требования..."
              value={addCtx[k] ?? ""}
              onChange={(e) => onCtxChange(k, e.target.value)}
              disabled={disabled}
            />
          </div>
        ))}
    </div>
  );
}
