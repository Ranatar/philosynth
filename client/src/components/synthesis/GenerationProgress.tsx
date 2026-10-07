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
 *
 * Беседа 12.4 (Д-17): остановка без возобновления — необратима (user-abort
 * финализирует частичное как итог документа, §3.1), поэтому подтверждение —
 * ВТОРОЙ ШАГ КНОПОК (правило 8.4): «⏹ Остановить» → «Точно остановить?» +
 * «Отмена» и строка-предупреждение под шапкой; клик мимо панели действий
 * сбрасывает (useSecondStep). Прежний window.confirm страниц снят; onAbort
 * зовётся уже подтверждённым.
 */
import { PauseBadge } from "./PauseModal";
import type { SectionProgress } from "../../hooks/useStreamingGeneration";
import { useSecondStep } from "../../hooks/useSecondStep";
import { tl } from "@philosynth/shared/i18n/t";

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
  /** Остановка, уже подтверждённая вторым шагом кнопок (12.4, Д-17) */
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
  const abortStep = useSecondStep();
  const abortArmed = showAbort && abortStep.armed !== null;
  return (
    <div className="progress-panel visible">
      <div className="progress-panel-header">
        <div className="progress-title">
          {complete
            ? tl("synthesis.generationProgress.completeTitle", "✓ Синтез Философской Концепции — Завершён")
            : tl("synthesis.generationProgress.inProgressTitle", "⚙ Синтез Философской Концепции — В Процессе")}
        </div>
        <div
          className="progress-panel-actions"
          ref={(el) => {
            abortStep.ref.current = el;
          }}
          data-testid="progress-actions"
        >
          <PauseBadge visible={paused} onClick={onPauseBadgeClick} />
          {showAbort && !abortArmed && (
            <button
              type="button"
              onClick={() => abortStep.arm(true)}
              title={tl("synthesis.generationProgress.stopHint", "Остановить текущую генерацию")}
              className="progress-abort-btn visible"
              data-testid="abort-btn"
            >
              {tl("synthesis.generationProgress.stop", "⏹ Остановить")}
            </button>
          )}
          {abortArmed && (
            <>
              <button
                type="button"
                onClick={() => {
                  abortStep.disarm();
                  onAbort();
                }}
                className="progress-abort-btn visible"
                data-testid="abort-confirm"
              >
                {tl("synthesis.generationProgress.stopConfirm", "Точно остановить?")}
              </button>
              <button
                type="button"
                onClick={abortStep.disarm}
                className="progress-abort-btn visible progress-abort-cancel"
                data-testid="abort-cancel"
              >
                {tl("common.cancel", "Отмена")}
              </button>
            </>
          )}
        </div>
      </div>
      {abortArmed && (
        <div className="transform-warn progress-abort-warn" data-testid="abort-warn">
          {tl("synthesis.generationProgress.stopWarn", "Успевший контент будет зафиксирован как финальное состояние документа — без возможности возобновления.")}
        </div>
      )}

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
                {tl("synthesis.generationProgress.chars", "{chars} симв.", { chars: s.chars.toLocaleString("ru-RU") })}
              </span>
            )}
            {s.status === "streaming" && s.subsections.length > 0 && (
              <span
                style={{ fontSize: 10, opacity: 0.7 }}
                title={s.subsections.join(" · ")}
              >
                {tl("synthesis.generationProgress.subsectionsCount", "подразделов: {subsectionsCount}", { subsectionsCount: s.subsections.length })}
              </span>
            )}
          </div>
        ))}
        {sections.length === 0 && (
          <div className="progress-step">
            <span className="step-icon">◯</span>
            <span>{tl("synthesis.generationProgress.waitingStream", "ожидание первых данных стрима…")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
