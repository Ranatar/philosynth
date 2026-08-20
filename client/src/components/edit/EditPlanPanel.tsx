/**
 * Визуализация плана редактирования. Беседа 2.3 (запрос 1, п. 6).
 *
 * Список шагов EditPlan с иконками статусов (◯ pending / ⟳ running /
 * ✓ done / ✗ failed / − skipped / ● confirmed), каскадные шаги
 * (cascadeGenerated) выделены; прогресс в реальном времени — статусы
 * приходят plan_updated'ом (WsPlanStepDone объект шага не несёт —
 * грабля 2.4 п.3), результаты шагов — stepResults из useEditPlan.
 * Кнопки подтвердить/пропустить: draft — PATCH (updateSteps);
 * во время исполнения pending-шаги (каскад/структурный
 * «sum:Структура документа» из plan_steps_added) — WS confirm_step;
 * «пропустить» на исполнении = просто не подтверждать (2.2).
 */
import type { EditPlan, EditStep, StepResult } from "@philosynth/shared/types/edit-plan";

export interface EditPlanPanelProps {
  plan: EditPlan;
  stepResults: Record<number, StepResult>;
  runningStep: number | null;
  isExecuting: boolean;
  labels: (key: string) => string;
  onConfirmStep: (index: number) => void;
  onSkipStep: (index: number) => void;
}

const TYPE_LABEL: Record<EditStep["type"], string> = {
  regen: "Перегенерировать",
  delete: "Удалить",
  add: "Добавить",
  regen_subsection: "Перегенерировать подраздел",
  regen_mode: "Перегенерировать режим",
};

function stepIcon(step: EditStep, running: boolean): string {
  if (running) return "⟳";
  switch (step.status) {
    case "done":
      return "✓";
    case "failed":
      return "✗";
    case "skipped":
      return "−";
    case "running":
      return "⟳";
    case "confirmed":
      return "●";
    default:
      return "◯";
  }
}

function stepColor(step: EditStep, running: boolean): string {
  if (running || step.status === "running") return "var(--blue-corp)";
  switch (step.status) {
    case "done":
      return "var(--green-check)";
    case "failed":
      return "var(--red)";
    case "skipped":
      return "var(--ink-dim)";
    default:
      return "var(--ink-mid)";
  }
}

function targetLabel(
  step: EditStep,
  labels: (key: string) => string,
): string {
  const idx = step.target.indexOf(":");
  if (idx < 0) return labels(step.target);
  const head = step.target.slice(0, idx);
  const tail = step.target.slice(idx + 1);
  // regen_subsection: "sectionKey:subsectionName"; regen_mode: "modeKey:index"
  return step.type === "regen_mode"
    ? `${head} #${Number(tail) + 1}`
    : `${labels(head)} → «${tail}»`;
}

export function EditPlanPanel({
  plan,
  stepResults,
  runningStep,
  isExecuting,
  labels,
  onConfirmStep,
  onSkipStep,
}: EditPlanPanelProps) {
  return (
    <div
      style={{
        border: "1px solid var(--rule-strong)",
        background: "var(--white)",
        padding: "12px 16px",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "var(--ink-mid)",
          marginBottom: 8,
        }}
      >
        План редактирования · {plan.status}
        {plan.estimatedCost > 0 &&
          ` · ≈ $${plan.estimatedCost.toFixed(4)} (${(plan.estimatedCost * 100).toFixed(2)}¢)`}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {plan.steps.map((step, i) => {
          const running = runningStep === i;
          const result = stepResults[i];
          const pendingActionable =
            step.status === "pending" &&
            (plan.status === "draft" || isExecuting);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "var(--mono)",
                fontSize: 10,
                color: stepColor(step, running),
                padding: "4px 8px",
                border: "1px solid var(--rule)",
                background: step.cascadeGenerated ? "#fffbee" : "transparent",
                borderLeft: step.cascadeGenerated
                  ? "3px solid var(--gold)"
                  : "1px solid var(--rule)",
              }}
            >
              <span className="step-icon">{stepIcon(step, running)}</span>
              <span>
                {TYPE_LABEL[step.type]}: {targetLabel(step, labels)}
                {step.cascadeGenerated && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 9,
                      color: "var(--gold)",
                    }}
                  >
                    каскад
                  </span>
                )}
              </span>
              {result && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 9,
                    color: "var(--ink-dim)",
                  }}
                >
                  {result.outputChars.toLocaleString("ru")} симв. · $
                  {result.costUsd.toFixed(4)}
                </span>
              )}
              {pendingActionable && (
                <span
                  style={{
                    marginLeft: result ? 8 : "auto",
                    display: "flex",
                    gap: 4,
                  }}
                >
                  <button
                    type="button"
                    className="edit-sec-btn"
                    style={{ fontSize: 8, padding: "2px 8px" }}
                    onClick={() => onConfirmStep(i)}
                  >
                    подтвердить
                  </button>
                  {plan.status === "draft" && (
                    <button
                      type="button"
                      className="edit-sec-btn"
                      style={{ fontSize: 8, padding: "2px 8px" }}
                      onClick={() => onSkipStep(i)}
                    >
                      пропустить
                    </button>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
