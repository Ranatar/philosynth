/**
 * CategoryEditor — поля категории графа + предпросмотр строки таблицы.
 * Беседа 5.2 (запрос 1, п. 2); беседа 5.4 (запрос 1, пп. 1/3/4) —
 * характеристики и тип.
 *
 * Контролируемая форма: значение — CategoryDraft (редактируемые поля
 * CategoryUpdateInput), хозяин (ElementEditor) хранит состояние и шлёт
 * PATCH только изменившихся полей (categoryDiff). Ошибки по полям —
 * details ответа 400 VALIDATION_ERROR (сервер 5.1).
 *
 * 5.4:
 *  - тип — TaxonomySelector по каталогу category_type_catalog 0.3b
 *    (18 системных + пользовательские) с индикатором «из каталога /
 *    свободный текст» (03 §2.4 п.11: type + typeCatalogId). Временная
 *    клиентская копия CATEGORY_TYPES (14 типов промпта) УДАЛЕНА — долг
 *    §12 за 5.4 закрыт; расширенные по методу типы (_EXTRA_CATEGORY_TYPES)
 *    остаются свободным текстом: их каталог 0.3b не содержит, а
 *    нормализация даёт ближайший системный тип подсказкой «≈»;
 *  - centrality/certainty (RangeField 5.2) → CharacteristicSliderGroup со
 *    ВСЕМИ восемью характеристиками (CATEGORY_CHARACTERISTICS 5.3), включая
 *    дискретный innovation_degree 1–5; «?» — обоснование (justify-контекст
 *    от хозяина; в форме — по ТЕКУЩЕМУ значению ползунка).
 *
 * Предпросмотр — строка «Таблицы категорий» в том виде, в каком её рисует
 * element-renderer 5.1: Категория · Тип · Определение · Центральность ·
 * Определённость · <столбец уровня>. Заголовок последнего столбца
 * зависит от synth_level (level.{l}.graph_last_col_name) — клиенту шаблон
 * недоступен, подпись «Происхождение» условная (проп lastColName —
 * фактическая из thead). Расширенные характеристики в таблице категорий
 * появляются только при ext_graph_metrics — в предпросмотре не показаны.
 */
import type { Category } from "@philosynth/shared/types/graph";
import type { CategoryUpdateInput } from "@philosynth/shared/types/elements";

import {
  CharacteristicSliderGroup,
  type CharacteristicJustifyContext,
} from "./CharacteristicSlider";
import { FieldError, fmtNum } from "./ElementEditor";
import { TaxonomySelector } from "./TaxonomySelector";

export type CategoryDraft = Required<
  Pick<
    CategoryUpdateInput,
    | "name"
    | "type"
    | "typeCatalogId"
    | "definition"
    | "origin"
    | "centrality"
    | "certainty"
    | "historicalSignificance"
    | "innovationDegree"
    | "clarity"
    | "breadth"
    | "depthScore"
    | "applicability"
  >
>;

/** Поля-характеристики черновика (dtoField CATEGORY_CHARACTERISTICS) */
export const CATEGORY_DRAFT_CHARACTERISTICS = [
  "centrality",
  "certainty",
  "historicalSignificance",
  "innovationDegree",
  "clarity",
  "breadth",
  "depthScore",
  "applicability",
] as const;

export function categoryToDraft(c: Category): CategoryDraft {
  return {
    name: c.name,
    type: c.type,
    typeCatalogId: c.typeCatalogId,
    definition: c.definition,
    origin: c.origin,
    centrality: c.centrality,
    certainty: c.certainty,
    historicalSignificance: c.historicalSignificance,
    innovationDegree: c.innovationDegree,
    clarity: c.clarity,
    breadth: c.breadth,
    depthScore: c.depthScore,
    applicability: c.applicability,
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
  if (after.typeCatalogId !== before.typeCatalogId) out.typeCatalogId = after.typeCatalogId;
  if (after.definition !== before.definition) out.definition = after.definition;
  if (after.origin !== before.origin) out.origin = after.origin;
  for (const k of CATEGORY_DRAFT_CHARACTERISTICS) {
    if (after[k] !== before[k]) out[k] = after[k];
  }
  return out;
}

export interface CategoryEditorProps {
  value: CategoryDraft;
  onChange: (next: CategoryDraft) => void;
  errors?: Record<string, string> | undefined;
  disabled?: boolean | undefined;
  /** Фактический заголовок последнего столбца таблицы (из thead) */
  lastColName?: string | undefined;
  /** Контекст «?» слайдеров (без него кнопок обоснования нет) */
  justify?: CharacteristicJustifyContext | undefined;
}

export function CategoryEditor({
  value,
  onChange,
  errors = {},
  disabled = false,
  lastColName = "Происхождение",
  justify,
}: CategoryEditorProps) {
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
          <TaxonomySelector
            id="cat-ed-type"
            kind="category"
            value={{ type: value.type, typeCatalogId: value.typeCatalogId }}
            onChange={(v) => onChange({ ...value, type: v.type, typeCatalogId: v.typeCatalogId })}
            disabled={disabled}
            error={errors.type ?? errors.typeCatalogId}
          />
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

      <div className="form-label" style={{ marginTop: 10 }}>
        Характеристики
      </div>
      <CharacteristicSliderGroup
        elementType="category"
        idPrefix="cat-ed"
        values={value as unknown as Record<string, number>}
        onChange={(field, v) => onChange({ ...value, [field]: v })}
        readOnly={disabled}
        errors={errors}
        justify={justify}
      />

      <div className="form-group full" style={{ marginTop: 10 }}>
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
