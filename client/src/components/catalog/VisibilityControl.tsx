/**
 * Управление публичностью концепции в карточке каталога. Беседа 8.7 (п. 5).
 *
 * Встаёт на место кнопки «Опубликовать/Скрыть» (1.6b/8.4) в строке действий
 * владельца. Три ступени переключателем (Приватная · Витрина · Публичная,
 * 02 §2.3) и галочки по ступеням:
 *  - на ВИТРИНЕ видна только «показывать авторство»; три остальные
 *    ПРЯЧУТСЯ (не рисуются неработающими) с одной строкой-пояснением;
 *    их сохранённые значения не сбрасываются — сервер хранит сырые флаги,
 *    действенность решает effectiveFlags (8.6);
 *  - на ПУБЛИЧНОЙ — все четыре;
 *  - стоимость и токены галочкой не управляются (их видит любой
 *    зарегистрированный, гость — никогда) — галочки для них нет.
 * Галочки уезжают ОДНИМ PATCH со ступенью по кнопке «Сохранить» (п. 5c);
 * отдельных запросов на каждую галочку нет. Подпись под переключателем
 * (audienceText) объясняет словами, что увидит посторонний (п. 5d), и
 * пересчитывается по черновику до сохранения.
 *
 * Сырые флаги в SynthesisPreview не приходят (03 §2.2 их превью не обещает —
 * только visibility и authorName): черновик заполняется из GET /syntheses/:id
 * при открытии панели (владельцу отдаются все поля). Пока идёт запрос —
 * «Загрузка…»; сбой — строкой, панель остаётся.
 *
 * Компонент живёт ВНУТРИ <Link> карточки: все клики гасятся (stop), как у
 * прочих кнопок 8.4. Оформление — .action-btn исходника для ступеней
 * (active — как у вкладок каталога), .visibility-* блока 8.7 в части 3
 * globals.css; палитра закрытая, углы прямые, микро-подписи капителью.
 */
import { useEffect, useState } from "react";

import type {
  SynthesisVisibility,
  VisibilityFlags,
} from "@philosynth/shared/types/synthesis";

import {
  audienceText,
  FLAG_LABELS,
  flagsShownFor,
  SHOWCASE_FLAGS_NOTE,
  VISIBILITY_DESCRIPTIONS,
  VISIBILITY_LABELS,
  VISIBILITY_STEPS,
  type VisibilityFlagKey,
} from "../../utils/visibility-text";

export interface VisibilityControlProps {
  synthesisId: string;
  /** Ступень из превью — до дотяжки флагов подсвечивается она */
  currentVisibility: SynthesisVisibility;
  /** GET /syntheses/:id — сырые флаги владельца (SynthesisFull) */
  loadFlags: (id: string) => Promise<VisibilityFlags>;
  /** Один PATCH со ступенью и флагами; строка ошибки либо null */
  onSave: (id: string, flags: VisibilityFlags) => Promise<string | null>;
  onClose: () => void;
}

function stop(e: { preventDefault(): void; stopPropagation(): void }) {
  e.preventDefault();
  e.stopPropagation();
}

/** Класс кнопки ступени — вне JSX (грабля css-parity 6.2: литералы внутри
 *  className={…} считаются классами) */
function stepClass(active: boolean): string {
  return active ? "action-btn visibility-step active" : "action-btn visibility-step";
}

export function VisibilityControl({
  synthesisId,
  currentVisibility,
  loadFlags,
  onSave,
  onClose,
}: VisibilityControlProps) {
  const [draft, setDraft] = useState<VisibilityFlags | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDraft(null);
    setLoadError(null);
    loadFlags(synthesisId)
      .then((f) => {
        if (!cancelled) setDraft(f);
      })
      .catch(() => {
        if (!cancelled)
          setLoadError("Не удалось загрузить настройки публичности.");
      });
    return () => {
      cancelled = true;
    };
  }, [synthesisId, loadFlags]);

  const setStep = (v: SynthesisVisibility) => {
    if (!draft || busy) return;
    setSaveError(null);
    // Смена ступени НЕ трогает сырые флаги — они хранятся и вернутся (8.6)
    setDraft({ ...draft, visibility: v });
  };

  const toggleFlag = (k: VisibilityFlagKey) => {
    if (!draft || busy) return;
    setSaveError(null);
    setDraft({ ...draft, [k]: !draft[k] });
  };

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setSaveError(null);
    const err = await onSave(synthesisId, draft);
    setBusy(false);
    if (err) setSaveError(err);
    else onClose();
  };

  const shownStep = draft?.visibility ?? currentVisibility;
  const shownFlags = flagsShownFor(shownStep);

  return (
    <div
      className="inline-edit-form visibility-control"
      data-testid="visibility-control"
      onClick={stop}
    >
      <div className="form-label">Публичность</div>

      <div className="visibility-steps" role="radiogroup" aria-label="Ступень публичности">
        {VISIBILITY_STEPS.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={shownStep === v}
            className={stepClass(shownStep === v)}
            disabled={!draft || busy}
            data-testid={`visibility-step-${v}`}
            onClick={(e) => {
              stop(e);
              setStep(v);
            }}
            title={VISIBILITY_DESCRIPTIONS[v]}
          >
            {VISIBILITY_LABELS[v]}
          </button>
        ))}
      </div>
      <div className="visibility-step-desc">{VISIBILITY_DESCRIPTIONS[shownStep]}</div>

      {loadError && (
        <div className="pool-status err" role="alert">
          {loadError}
        </div>
      )}
      {!draft && !loadError && <div className="pool-status">Загрузка…</div>}

      {draft && shownFlags.length > 0 && (
        <div className="visibility-flags" data-testid="visibility-flags">
          {shownFlags.map((k) => (
            <label key={k} className="visibility-flag" data-testid={`visibility-flag-${k}`}>
              <input
                type="checkbox"
                checked={draft[k]}
                disabled={busy}
                onChange={() => toggleFlag(k)}
              />
              <span>{FLAG_LABELS[k]}</span>
            </label>
          ))}
        </div>
      )}
      {draft && shownStep === "showcase" && (
        <div className="visibility-note" data-testid="visibility-showcase-note">
          {SHOWCASE_FLAGS_NOTE}
        </div>
      )}
      {draft && shownStep === "full" && (
        <div className="visibility-note">
          Стоимость и токены галочкой не управляются: их видит любой
          зарегистрированный, гость — никогда.
        </div>
      )}

      {draft && (
        <div className="visibility-audience" data-testid="visibility-audience">
          {audienceText(draft)}
        </div>
      )}

      {saveError && (
        <div className="pool-status err" role="alert" data-testid="visibility-error">
          {saveError}
        </div>
      )}

      <div className="inline-edit-actions">
        <button
          type="button"
          className="action-btn primary"
          disabled={!draft || busy}
          data-testid="visibility-save"
          onClick={(e) => {
            stop(e);
            void save();
          }}
        >
          {busy ? "Сохраняю…" : "Сохранить"}
        </button>
        <button
          type="button"
          className="action-btn"
          disabled={busy}
          onClick={(e) => {
            stop(e);
            onClose();
          }}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
