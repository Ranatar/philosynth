/**
 * CategoryEditor — поля категории графа + предпросмотр строки таблицы.
 * Беседа 5.2 (запрос 1, п. 2). Функциональности нет в исходнике — новый
 * React-код.
 *
 * Контролируемая форма: значение — CategoryUpdateInput (только
 * редактируемые здесь поля), хозяин (ElementEditor) хранит состояние и
 * шлёт PATCH. Ошибки по полям — details ответа 400 VALIDATION_ERROR
 * (сервер 5.1 отдаёт details по именам полей).
 *
 * Поля (протокол): name, type (select), definition (textarea),
 * centrality/certainty (range 0–1, шаг 0.05), origin (textarea).
 * Расширенные характеристики (historicalSignificance…applicability) —
 * беседа 5.4 (CharacteristicSlider), здесь НЕ редактируются.
 *
 * Select типа: 14 канонических типов промпта (section-templates
 * «Тип категории: …»; тот же перечень — _TC_HUE_SEEDS graph-utils) +
 * текущее значение, если оно вне списка (метод «творческий» допускает
 * нестандартные типы; каталог 0.3b с индикатором «из каталога» — 5.4,
 * TaxonomySelector). Свободный ввод — режим «другое…».
 *
 * Предпросмотр — строка «Таблицы категорий» в том виде, в каком её рисует
 * element-renderer 5.1: Категория · Тип · Определение · Центральность ·
 * Определённость · <столбец уровня>. Заголовок последнего столбца
 * зависит от synth_level (level.{l}.graph_last_col_name) — клиенту
 * шаблон недоступен, подпись «Происхождение» условная (проп lastColName
 * позволяет передать фактическую из thead).
 */
import type { Category } from "@philosynth/shared/types/graph";
import type { CategoryUpdateInput } from "@philosynth/shared/types/elements";

import { FieldError, fmtNum } from "./ElementEditor";

/** 14 канонических типов категорий (промпт раздела «Граф»).
 *  TODO(5.4): временная клиентская копия — заменяется TaxonomySelector по
 *  каталогу 0.3b (долг §12); секция 4ac сторожит ⊆ section-templates. */
export const CATEGORY_TYPES: readonly string[] = [
  "онтологическая",
  "эпистемологическая",
  "этическая",
  "аксиологическая",
  "метафизическая",
  "логическая",
  "практическая",
  "эстетическая",
  "антропологическая",
  "феноменологическая",
  "экзистенциальная",
  "социальная",
  "политическая",
  "теологическая",
];

const OTHER = "__other__";

export type CategoryDraft = Required<
  Pick<
    CategoryUpdateInput,
    "name" | "type" | "definition" | "centrality" | "certainty" | "origin"
  >
>;

export function categoryToDraft(c: Category): CategoryDraft {
  return {
    name: c.name,
    type: c.type,
    definition: c.definition,
    centrality: c.centrality,
    certainty: c.certainty,
    origin: c.origin,
  };
}

/** Только изменившиеся поля — в тело PATCH */
export function categoryDiff(
  before: CategoryDraft,
  after: CategoryDraft,
): CategoryUpdateInput {
  const out: CategoryUpdateInput = {};
  if (after.name !== before.name) out.name = after.name.trim();
  if (after.type !== before.type) out.type = after.type.trim();
  if (after.definition !== before.definition) out.definition = after.definition;
  if (after.centrality !== before.centrality) out.centrality = after.centrality;
  if (after.certainty !== before.certainty) out.certainty = after.certainty;
  if (after.origin !== before.origin) out.origin = after.origin;
  return out;
}

export interface CategoryEditorProps {
  value: CategoryDraft;
  onChange: (next: CategoryDraft) => void;
  errors?: Record<string, string> | undefined;
  disabled?: boolean | undefined;
  /** Фактический заголовок последнего столбца таблицы (из thead) */
  lastColName?: string | undefined;
}

export function CategoryEditor({
  value,
  onChange,
  errors = {},
  disabled = false,
  lastColName = "Происхождение",
}: CategoryEditorProps) {
  const inList = CATEGORY_TYPES.includes(value.type);
  const selectValue = inList ? value.type : OTHER;
  const set = <K extends keyof CategoryDraft>(k: K, v: CategoryDraft[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label" htmlFor="cat-ed-name">
            Название категории
          </label>
          <input
            id="cat-ed-name"
            className="form-input"
            value={value.name}
            disabled={disabled}
            onChange={(e) => set("name", e.target.value)}
          />
          <FieldError text={errors.name} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="cat-ed-type">
            Тип
          </label>
          <select
            id="cat-ed-type"
            className="form-select"
            value={selectValue}
            disabled={disabled}
            onChange={(e) =>
              set("type", e.target.value === OTHER ? "" : e.target.value)
            }
          >
            {CATEGORY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value={OTHER}>другое…</option>
          </select>
          {selectValue === OTHER && (
            <input
              className="form-input"
              style={{ marginTop: 6 }}
              placeholder="тип свободным текстом"
              value={value.type}
              disabled={disabled}
              onChange={(e) => set("type", e.target.value)}
              aria-label="Тип категории (свободный текст)"
            />
          )}
          <FieldError text={errors.type} />
        </div>
      </div>

      <div className="form-group full">
        <label className="form-label" htmlFor="cat-ed-def">
          Определение
        </label>
        <textarea
          id="cat-ed-def"
          className="form-textarea"
          style={{ minHeight: 72 }}
          value={value.definition}
          disabled={disabled}
          onChange={(e) => set("definition", e.target.value)}
        />
        <FieldError text={errors.definition} />
      </div>

      <div className="form-grid">
        <RangeField
          id="cat-ed-cen"
          label="Центральность"
          value={value.centrality}
          disabled={disabled}
          error={errors.centrality}
          onChange={(v) => set("centrality", v)}
        />
        <RangeField
          id="cat-ed-cert"
          label="Определённость"
          value={value.certainty}
          disabled={disabled}
          error={errors.certainty}
          onChange={(v) => set("certainty", v)}
        />
      </div>

      <div className="form-group full">
        <label className="form-label" htmlFor="cat-ed-orig">
          {lastColName}
        </label>
        <textarea
          id="cat-ed-orig"
          className="form-textarea"
          style={{ minHeight: 56 }}
          value={value.origin}
          disabled={disabled}
          onChange={(e) => set("origin", e.target.value)}
        />
        <FieldError text={errors.origin} />
      </div>

      {/* Предпросмотр строки «Таблицы категорий» (порядок столбцов —
          THESES/CATEGORIES «Столбцы СТРОГО» section-templates ≡ element-renderer) */}
      <div className="form-label" style={{ marginTop: 10 }}>
        Предпросмотр строки таблицы графа
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="doc-table element-preview-table">
          <thead>
            <tr>
              <th>Категория</th>
              <th>Тип</th>
              <th>Определение</th>
              <th>Центральность</th>
              <th>Определённость</th>
              <th>{lastColName}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>{value.name || "—"}</strong>
              </td>
              <td>{value.type || "—"}</td>
              <td>{value.definition || "—"}</td>
              <td>{fmtNum(value.centrality)}</td>
              <td>{fmtNum(value.certainty)}</td>
              <td>{value.origin || "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RangeField({
  id,
  label,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
  error?: string | undefined;
}) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}
        <span className="form-sublabel" style={{ marginLeft: 8 }}>
          {fmtNum(value)}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
      />
      <FieldError text={error} />
    </div>
  );
}
