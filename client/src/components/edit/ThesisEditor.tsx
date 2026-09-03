/**
 * ThesisEditor — поля тезиса. Беседа 5.2 (запрос 1, п. 3). Новый код.
 *
 * Контролируемая форма: formulation (textarea), justification (textarea),
 * thesisType (select по enum ThesisType — метки как в «Сводной таблице
 * тезисов», THESIS_TYPE_LABELS element-renderer), noveltyDegree (текст).
 *
 * ВАЖНО (долг §12 за 5.2, «По факту 5.1» п.6): формулировка/тип/новизна
 * перерисовываются в сводной таблице, а обоснование правится точечно в
 * абзаце «<strong>формулировка</strong> обоснование» — если абзац не
 * найден, сервер вернёт justification в htmlSync.pending, и раздел
 * требует перегенерации. Подсказка об этом — под полем.
 */
import type {
  Thesis,
  ThesisType,
  ThesisUpdateInput,
} from "@philosynth/shared/types/elements";

import { FieldError } from "./ElementEditor";

export const THESIS_TYPE_OPTIONS: readonly { value: ThesisType; label: string }[] =
  [
    { value: "ontological", label: "онтологический" },
    { value: "epistemological", label: "эпистемологический" },
    { value: "ethical", label: "этический" },
  ];

export type ThesisDraft = Required<
  Pick<
    ThesisUpdateInput,
    "formulation" | "justification" | "thesisType" | "noveltyDegree"
  >
>;

export function thesisToDraft(t: Thesis): ThesisDraft {
  return {
    formulation: t.formulation,
    justification: t.justification,
    thesisType: t.thesisType,
    noveltyDegree: t.noveltyDegree,
  };
}

export function thesisDiff(before: ThesisDraft, after: ThesisDraft): ThesisUpdateInput {
  const out: ThesisUpdateInput = {};
  if (after.formulation !== before.formulation)
    out.formulation = after.formulation.trim();
  if (after.justification !== before.justification)
    out.justification = after.justification;
  if (after.thesisType !== before.thesisType) out.thesisType = after.thesisType;
  if (after.noveltyDegree !== before.noveltyDegree)
    out.noveltyDegree = after.noveltyDegree.trim();
  return out;
}

export interface ThesisEditorProps {
  value: ThesisDraft;
  onChange: (next: ThesisDraft) => void;
  errors?: Record<string, string> | undefined;
  disabled?: boolean | undefined;
}

export function ThesisEditor({
  value,
  onChange,
  errors = {},
  disabled = false,
}: ThesisEditorProps) {
  const set = <K extends keyof ThesisDraft>(k: K, v: ThesisDraft[K]) =>
    onChange({ ...value, [k]: v });
  return (
    <div>
      <div className="form-group full">
        <label className="form-label" htmlFor="th-ed-form">
          Формулировка
        </label>
        <textarea
          id="th-ed-form"
          className="form-textarea"
          style={{ minHeight: 60 }}
          value={value.formulation}
          disabled={disabled}
          onChange={(e) => set("formulation", e.target.value)}
        />
        <FieldError text={errors.formulation} />
      </div>
      <div className="form-group full">
        <label className="form-label" htmlFor="th-ed-just">
          Обоснование
        </label>
        <textarea
          id="th-ed-just"
          className="form-textarea"
          style={{ minHeight: 90 }}
          value={value.justification}
          disabled={disabled}
          onChange={(e) => set("justification", e.target.value)}
        />
        <div className="form-sublabel">
          Обоснование живёт вне сводной таблицы — правится точечно в абзаце
          раздела; если абзац не найден, раздел потребует перегенерации
        </div>
        <FieldError text={errors.justification} />
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label" htmlFor="th-ed-type">
            Тип тезиса
          </label>
          <select
            id="th-ed-type"
            className="form-select"
            value={value.thesisType}
            disabled={disabled}
            onChange={(e) => set("thesisType", e.target.value as ThesisType)}
          >
            {THESIS_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FieldError text={errors.thesisType} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="th-ed-nov">
            Степень новизны
          </label>
          <input
            id="th-ed-nov"
            className="form-input"
            value={value.noveltyDegree}
            disabled={disabled}
            onChange={(e) => set("noveltyDegree", e.target.value)}
          />
          <FieldError text={errors.noveltyDegree} />
        </div>
      </div>
    </div>
  );
}
