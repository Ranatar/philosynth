/**
 * Панель прогресса генерации. Беседа 1.5 (запрос 1, п. 6).
 *
 * Референс — #progressPanel исходника: заголовок «⚙ … — В Процессе»,
 * бейдж паузы (клик — модалка возобновления), кнопка «⏹ Остановить»
 * (userAbortGeneration), шаги с иконкой состояния и счётчиком символов.
 * Иконки: ◯ ожидание / ⟳ стриминг / ✓ готово / ⚠ ошибка-пауза —
 * как классы progress-step исходника.
 *
 * Данные — useStreamingGeneration; компонент презентационный.
 *
 * Правка 2026-09-02 (единство стилей с исходником): разметка приведена
 * к #progressPanel [4117–4132] — .progress-panel.visible >
 * .progress-panel-header (.progress-title + .progress-panel-actions с
 * .progress-pause-badge и .progress-abort-btn) + .progress-steps >
 * .progress-step (.done/.active/.error) с .step-icon.
 */
import { PauseBadge } from "./PauseModal";
import type { SectionProgress } from "../../hooks/useStreamingGeneration";

const STEP_ICON: Record<SectionProgress["status"], string> = {
  pending: "◯",
  streaming: "⟳",
  done: "✓",
  error: "⚠",
};

/** Состояние строки → класс .progress-step исходника */
const STEP_STATE_CLS: Record<SectionProgress["status"], string> = {
  pending: "",
  streaming: "active",
  done: "done",
  error: "error",
};

export interface GenerationProgressProps {
  sections: readonly SectionProgress[];
  complete: boolean;
  paused: boolean;
  onPauseBadgeClick: () => void;
  onAbort: () => void;
  /** Кнопка «Остановить» видна пока генерация активна */
  showAbort: boolean;
}

export function GenerationProgress({
  sections,
  complete,
  paused,
  onPauseBadgeClick,
  onAbort,
  showAbort,
}: GenerationProgressProps) {
  return (
    <div className="progress-panel visible">
      <div className="progress-panel-header">
        <div className="progress-title">
          {complete
            ? "✓ Синтез Философской Концепции — Завершён"
            : "⚙ Синтез Философской Концепции — В Процессе"}
        </div>
        <div className="progress-panel-actions">
          <PauseBadge visible={paused} onClick={onPauseBadgeClick} />
          {showAbort && (
            <button
              type="button"
              onClick={onAbort}
              title="Остановить текущую генерацию"
              className="progress-abort-btn visible"
            >
              ⏹ Остановить
            </button>
          )}
        </div>
      </div>

      <div className="progress-steps">
        {sections.map((s) => (
          <div
            key={s.key}
            className={["progress-step", STEP_STATE_CLS[s.status]]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="step-icon">{STEP_ICON[s.status]}</span>
            <span>{s.label}</span>
            {s.chars > 0 && (
              <span style={{ marginLeft: "auto" }}>
                {s.chars.toLocaleString("ru-RU")} симв.
              </span>
            )}
            {s.status === "streaming" && s.subsections.length > 0 && (
              <span
                style={{ fontSize: 10, opacity: 0.7 }}
                title={s.subsections.join(" · ")}
              >
                подразделов: {s.subsections.length}
              </span>
            )}
          </div>
        ))}
        {sections.length === 0 && (
          <div className="progress-step">
            <span className="step-icon">◯</span>
            <span>ожидание первых данных стрима…</span>
          </div>
        )}
      </div>
    </div>
  );
}
