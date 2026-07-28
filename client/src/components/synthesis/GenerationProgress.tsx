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
 */
import { PauseBadge } from "./PauseModal";
import type { SectionProgress } from "../../hooks/useStreamingGeneration";

const STEP_ICON: Record<SectionProgress["status"], string> = {
  pending: "◯",
  streaming: "⟳",
  done: "✓",
  error: "⚠",
};

const STEP_ICON_CLS: Record<SectionProgress["status"], string> = {
  pending: "text-ink-dim",
  streaming: "animate-spin text-gold",
  done: "text-green-check",
  error: "text-red",
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
    <div className="rounded border border-rule bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-3">
        <div className="text-sm font-semibold text-ink">
          {complete
            ? "✓ Синтез Философской Концепции — Завершён"
            : "⚙ Синтез Философской Концепции — В Процессе"}
        </div>
        <div className="flex items-center gap-2">
          <PauseBadge visible={paused} onClick={onPauseBadgeClick} />
          {showAbort && (
            <button
              type="button"
              onClick={onAbort}
              title="Остановить текущую генерацию"
              className="rounded border border-rule px-2 py-1 font-mono text-xs text-ink-mid hover:border-red hover:text-red"
            >
              ⏹ Остановить
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1.5 px-4 py-3">
        {sections.map((s) => (
          <div key={s.key} className="flex items-baseline gap-2 text-sm">
            <span
              className={`inline-block w-4 text-center font-mono ${STEP_ICON_CLS[s.status]}`}
            >
              {STEP_ICON[s.status]}
            </span>
            <span
              className={
                s.status === "pending" ? "text-ink-dim" : "text-ink"
              }
            >
              {s.label}
            </span>
            {s.chars > 0 && (
              <span className="ml-auto font-mono text-[11px] tabular-nums text-ink-dim">
                {s.chars.toLocaleString("ru-RU")} симв.
              </span>
            )}
            {s.status === "streaming" && s.subsections.length > 0 && (
              <span
                className="font-mono text-[10px] text-ink-dim"
                title={s.subsections.join(" · ")}
              >
                подразделов: {s.subsections.length}
              </span>
            )}
          </div>
        ))}
        {sections.length === 0 && (
          <div className="font-mono text-xs text-ink-dim">
            ожидание первых данных стрима…
          </div>
        )}
      </div>
    </div>
  );
}
