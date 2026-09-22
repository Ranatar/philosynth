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
 *
 * Беседа 10.3: отрисовка шагов мельче раздела (10.2) — у шага элемента
 * видны вид, имя, правимое поле, у edit_element — готовый текст (разворотом),
 * у любого шага из рекомендаций — их номера и раунд; бесплатный шаг помечен.
 * Имя элемента шаг не несёт (target «kind:id») — оно приходит пропом
 * elementNames от панели рекомендаций; нет имени — показывается вид.
 */
import {
  ELEMENT_STEP_FIELD_LABELS,
  ELEMENT_STEP_KIND_LABELS,
  defaultElementStepField,
  isElementStepType,
  isFreeStepType,
  parseElementStepTarget,
} from "@philosynth/shared/constants/edit-steps";
import type { EditPlan, EditStep, StepResult } from "@philosynth/shared/types/edit-plan";

export interface EditPlanPanelProps {
  plan: EditPlan;
  stepResults: Record<number, StepResult>;
  runningStep: number | null;
  isExecuting: boolean;
  labels: (key: string) => string;
  /** 10.3: id элемента → имя (шаги edit_element / refine_element) */
  elementNames?: Readonly<Record<string, string>> | undefined;
  onConfirmStep: (index: number) => void;
  onSkipStep: (index: number) => void;
}

const TYPE_LABEL: Record<EditStep["type"], string> = {
  regen: "Перегенерировать",
  delete: "Удалить",
  add: "Добавить",
  regen_subsection: "Перегенерировать подраздел",
  regen_mode: "Перегенерировать режим",
  // 10.2: подписи новых шагов — чтобы тип оставался исчерпывающим; отрисовка
  // шагов элемента (поле, значение, рекомендация) — панель 10.3
  edit_element: "Применить готовую замену",
  refine_element: "Уточнить элемент",
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
  elementNames: Readonly<Record<string, string>> | undefined,
): string {
  if (isElementStepType(step.type)) {
    // 10.3: «категория «Имя» · определение»
    const parsed = parseElementStepTarget(step.target);
    if (!parsed) return step.target;
    const name = elementNames?.[parsed.elementId];
    const field = step.field ?? defaultElementStepField(parsed.kind);
    return (
      ELEMENT_STEP_KIND_LABELS[parsed.kind] +
      (name ? ` «${name}»` : "") +
      ` · ${ELEMENT_STEP_FIELD_LABELS[field] ?? field}`
    );
  }
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
  elementNames,
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
          const recs = step.recommendations ?? [];
          return (
            <div key={i} data-testid="plan-step" data-step-type={step.type}>
            <div
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
                {TYPE_LABEL[step.type]}: {targetLabel(step, labels, elementNames)}
                {recs.length > 0 && (
                  <span className="plan-step-rec" data-testid="plan-step-rec">
                    рекомендация {recs.map((r) => `№ ${r.num}`).join(", ")} · раунд {recs[0]?.round}
                  </span>
                )}
                {isFreeStepType(step.type) && (
                  <span className="plan-step-free" data-testid="plan-step-free">бесплатно</span>
                )}
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
            {step.type === "edit_element" && step.value && (
              <details className="sec-disclosure plan-step-value" data-testid="plan-step-value">
                <summary>Готовая замена</summary>
                <div className="disclosure-body">{step.value}</div>
              </details>
            )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
