/**
 * Панель вкладок результатов режима. Беседа 4.1 (запрос 1, п. 5).
 * React-порт buildModeTabsBar/addModeTab [22874/22915]:
 *  - вкладка: параметр (truncLabel 24) + дата (toLocaleDateString ru-RU);
 *  - × удаления (stopPropagation — как в разметке исходника; confirm —
 *    у родителя, порт removeModeResult);
 *  - генерирующаяся вкладка: ⟳ + класс .adding (pulse-tab), active;
 *  - пустой список без adding — панель скрыта (bar.display = "none").
 * CSS: #modeTabsBar / .mode-tab* в globals.css дословно (id сохранён —
 * панель на странице одна, как в исходнике).
 */
export interface ModeTabItem {
  param: string;
  /** ISO createdAt результата */
  timestamp: string;
}

export interface ModeTabBarProps {
  tabs: ModeTabItem[];
  activeIndex: number;
  /** Параметр генерирующейся вкладки (⟳, .adding) либо null */
  addingParam: string | null;
  onSwitch: (index: number) => void;
  onRemove: (index: number) => void;
}

/** Порт truncLabel(s, max) [22868] */
export function truncLabel(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function ModeTabBar({
  tabs,
  activeIndex,
  addingParam,
  onSwitch,
  onRemove,
}: ModeTabBarProps) {
  if (tabs.length === 0 && addingParam === null) {
    return <div id="modeTabsBar" style={{ display: "none" }} />;
  }
  return (
    <div id="modeTabsBar">
      {tabs.map((t, i) => (
        <button
          key={`${i}-${t.timestamp}`}
          type="button"
          className={
            "mode-tab" + (addingParam === null && i === activeIndex ? " active" : "")
          }
          data-index={i}
          onClick={() => onSwitch(i)}
        >
          {truncLabel(t.param, 24)}
          <span className="mode-tab-date">
            {new Date(t.timestamp).toLocaleDateString("ru-RU")}
          </span>
          <span
            className="mode-tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(i);
            }}
          >
            ×
          </span>
        </button>
      ))}
      {addingParam !== null && (
        <button type="button" className="mode-tab active adding">
          ⟳ {truncLabel(addingParam, 24)}
        </button>
      )}
    </div>
  );
}
