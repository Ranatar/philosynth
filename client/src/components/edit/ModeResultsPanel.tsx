/**
 * Панель «РЕЖИМЫ» Edit Modal — карточки результатов режимов.
 * Порт блока modesPanel исходника [18556–18620] (долг §12 за 4.1):
 *  - рамка/заголовок панели и violet-акценты дословно по стилям
 *    исходника (inline, как там);
 *  - карточка .edit-sec-card: «{title} · {param}» + дата ru-RU,
 *    чекбоксы «Перегенерировать» (id editRegenMode-{mk}-{i}) и
 *    «Удалить» (editDeleteMode-{mk}-{i}) — id сохранены для тестов;
 *  - ⚡-строка затронутости из превью каскада (allAffectedModes
 *    исходника → impact.affectedModes серверного превью);
 *  - ОТСТУПЛЕНИЕ: чекбоксы взаимоисключаются (исходник позволял оба,
 *    но серверный edit-planner отвечает VALIDATION_ERROR «modeRegen и
 *    modeRemove одновременно» — клиент не должен собирать заведомо
 *    невалидный план).
 */
import type { AffectedModeDto } from "@philosynth/shared/types/edit-plan";
import type { ModeResult } from "@philosynth/shared/types/modes";

import { MODE_ORDER, MODE_UI } from "../modes/ModeModal";

export interface ModeResultsPanelProps {
  /** modeKey → результаты (порядок created_at ASC = индексы API) */
  modes: Record<string, ModeResult[]>;
  /** Затронутые режимы из превью каскада (может быть пуст) */
  affectedModes: AffectedModeDto[];
  /** Отмеченные пары `modeKey:index` */
  regenChecked: ReadonlySet<string>;
  removeChecked: ReadonlySet<string>;
  onToggleRegen: (modeKey: string, index: number, v: boolean) => void;
  onToggleRemove: (modeKey: string, index: number, v: boolean) => void;
  disabled: boolean;
}

export function ModeResultsPanel({
  modes,
  affectedModes,
  regenChecked,
  removeChecked,
  onToggleRegen,
  onToggleRemove,
  disabled,
}: ModeResultsPanelProps) {
  const withResults = MODE_ORDER.filter(
    (mk) => (modes[mk]?.length ?? 0) > 0,
  );
  if (withResults.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 12,
        padding: "14px 18px",
        border: "2px solid var(--violet)",
        background: "var(--violet-light)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 2,
          color: "var(--violet)",
          marginBottom: 10,
        }}
      >
        РЕЖИМЫ
      </div>
      {withResults.map((mk) =>
        (modes[mk] ?? []).map((r, i) => {
          const key = mk + ":" + i;
          const affected = affectedModes.filter(
            (a) => a.modeKey === mk && a.index === i,
          );
          return (
            <div
              key={key}
              className="edit-sec-card"
              style={{ borderColor: "var(--violet)" }}
            >
              <div className="edit-sec-card-header">
                <div
                  className="edit-sec-title"
                  style={{ color: "var(--violet)" }}
                >
                  {MODE_UI[mk as keyof typeof MODE_UI]?.title ?? mk} ·{" "}
                  {r.paramValue}
                </div>
                <div
                  className="edit-sec-num"
                  style={{ fontSize: 9, color: "var(--ink-dim)" }}
                >
                  {new Date(r.createdAt).toLocaleString("ru-RU")}
                </div>
              </div>
              <div className="edit-sec-checks">
                <label
                  className="edit-sec-check"
                  style={{ color: "var(--violet)" }}
                >
                  <input
                    type="checkbox"
                    id={`editRegenMode-${mk}-${i}`}
                    style={{ accentColor: "var(--violet)" }}
                    checked={regenChecked.has(key)}
                    disabled={disabled}
                    onChange={(e) => onToggleRegen(mk, i, e.target.checked)}
                  />
                  Перегенерировать
                </label>
                <label className="edit-sec-check delete-check">
                  <input
                    type="checkbox"
                    id={`editDeleteMode-${mk}-${i}`}
                    checked={removeChecked.has(key)}
                    disabled={disabled}
                    onChange={(e) => onToggleRemove(mk, i, e.target.checked)}
                  />
                  Удалить
                </label>
              </div>
              {affected.length > 0 && (
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    color: "var(--violet)",
                    background: "rgba(107,0,170,0.06)",
                    border: "1px solid rgba(107,0,170,0.15)",
                    padding: "5px 10px",
                  }}
                >
                  ⚡ {affected[0]?.reason} — рекомендуется перегенерация
                </div>
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}
