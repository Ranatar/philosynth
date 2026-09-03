/**
 * GlossaryTermEditor — термин, определение, динамические столбцы.
 * Беседа 5.2 (запрос 1, п. 4). Новый код.
 *
 * extraColumns зависят от synth_level (02 §2.10): ключи — заголовки
 * дополнительных столбцов «Таблицы определений». Набор ключей берётся
 * из САМОГО термина (объединение с ключами соседей передаёт хозяин через
 * columnKeys — чтобы у строки без какого-то столбца поле всё же
 * появилось). Новые столбцы не заводятся: форму таблицы задают шаблоны
 * Registry, а рендерер 5.1 рисует столбцы по thead документа.
 *
 * termCategory (redefined/borrowed/new/…) здесь не редактируется: это
 * проза категорийных подразделов глоссария, в html_content правка не
 * отражается никогда (htmlSync.pending всегда — «По факту 5.1» п.6).
 */
import type {
  GlossaryTerm,
  GlossaryTermUpdateInput,
} from "@philosynth/shared/types/elements";

import { FieldError } from "./ElementEditor";

export type GlossaryDraft = {
  term: string;
  definition: string;
  extraColumns: Record<string, string>;
};

export function glossaryToDraft(g: GlossaryTerm): GlossaryDraft {
  return {
    term: g.term,
    definition: g.definition,
    extraColumns: { ...g.extraColumns },
  };
}

export function glossaryDiff(
  before: GlossaryDraft,
  after: GlossaryDraft,
): GlossaryTermUpdateInput {
  const out: GlossaryTermUpdateInput = {};
  if (after.term !== before.term) out.term = after.term.trim();
  if (after.definition !== before.definition) out.definition = after.definition;
  const keys = new Set([
    ...Object.keys(before.extraColumns),
    ...Object.keys(after.extraColumns),
  ]);
  let extraChanged = false;
  for (const k of keys) {
    if ((before.extraColumns[k] ?? "") !== (after.extraColumns[k] ?? "")) {
      extraChanged = true;
      break;
    }
  }
  if (extraChanged) out.extraColumns = { ...after.extraColumns };
  return out;
}

export interface GlossaryTermEditorProps {
  value: GlossaryDraft;
  onChange: (next: GlossaryDraft) => void;
  /** Полный перечень доп. столбцов таблицы (объединение по строкам) */
  columnKeys?: readonly string[] | undefined;
  errors?: Record<string, string> | undefined;
  disabled?: boolean | undefined;
}

export function GlossaryTermEditor({
  value,
  onChange,
  columnKeys,
  errors = {},
  disabled = false,
}: GlossaryTermEditorProps) {
  const keys = [
    ...new Set([...(columnKeys ?? []), ...Object.keys(value.extraColumns)]),
  ];
  return (
    <div>
      <div className="form-group full">
        <label className="form-label" htmlFor="gl-ed-term">
          Термин
        </label>
        <input
          id="gl-ed-term"
          className="form-input"
          value={value.term}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, term: e.target.value })}
        />
        <FieldError text={errors.term} />
      </div>
      <div className="form-group full">
        <label className="form-label" htmlFor="gl-ed-def">
          Принятое определение в данной концепции
        </label>
        <textarea
          id="gl-ed-def"
          className="form-textarea"
          style={{ minHeight: 72 }}
          value={value.definition}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, definition: e.target.value })}
        />
        <FieldError text={errors.definition} />
      </div>
      {keys.length > 0 && (
        <>
          <div className="form-label">Столбцы уровня синтеза</div>
          <div className="form-grid">
            {keys.map((k, i) => (
              <div className="form-group" key={k}>
                <label className="form-label" htmlFor={`gl-ed-x${i}`}>
                  {k}
                </label>
                <textarea
                  id={`gl-ed-x${i}`}
                  className="form-textarea"
                  style={{ minHeight: 48 }}
                  value={value.extraColumns[k] ?? ""}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      extraColumns: { ...value.extraColumns, [k]: e.target.value },
                    })
                  }
                />
              </div>
            ))}
          </div>
          <FieldError text={errors.extraColumns} />
        </>
      )}
    </div>
  );
}
