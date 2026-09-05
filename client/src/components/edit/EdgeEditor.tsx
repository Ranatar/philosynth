/**
 * EdgeEditor — поля связи графа. Беседа 5.4 (запрос 1, п. 5).
 * Функциональности нет в исходнике — новый React-код.
 *
 * ФАКТ 5.4: п. 5 запроса («интеграция с ElementEditor для связей»)
 * предполагал редактор связи, а EditableElement 5.2 знал только
 * category | thesis | glossary_term — правки связей на клиенте не было
 * вовсе (PATCH /edges и DELETE /edges сервер 5.1 отдаёт). Редактор
 * создаётся здесь по образцу CategoryEditor; вход — EdgePanel графа
 * («✎ Редактировать», как у NodePanel 5.2) через GraphModal.
 *
 * Контролируемая форма (черновик у ElementEditor): описание (textarea),
 * тип связи — TaxonomySelector по каталогу relationship_type_catalog
 * (03 §2.4 п.11: edgeType + typeCatalogId), направление (select из трёх
 * значений схемы), шесть характеристик — CharacteristicSliderGroup
 * (strength, certainty, historical_support, logical_necessity,
 * innovation_degree 1–5, context_dependency; EDGE_CHARACTERISTICS 5.3).
 * Концы связи не редактируются (перестановка концов — удаление и новая
 * связь, эндпоинта создания у §2.4 нет).
 */
import type { CategoryEdge } from "@philosynth/shared/types/graph";
import type {
  EdgeDirectionInput,
  EdgeUpdateInput,
} from "@philosynth/shared/types/elements";

import {
  CharacteristicSliderGroup,
  type CharacteristicJustifyContext,
} from "./CharacteristicSlider";
import { FieldError } from "./ElementEditor";
import { TaxonomySelector } from "./TaxonomySelector";

export const EDGE_DIRECTIONS: readonly EdgeDirectionInput[] = [
  "однонаправленная",
  "двунаправленная",
  "рефлексивная",
];

export type EdgeDraft = Required<
  Pick<
    EdgeUpdateInput,
    | "description"
    | "edgeType"
    | "direction"
    | "strength"
    | "certainty"
    | "historicalSupport"
    | "logicalNecessity"
    | "innovationDegree"
    | "contextDependency"
    | "typeCatalogId"
  >
>;

export function edgeToDraft(e: CategoryEdge): EdgeDraft {
  return {
    description: e.description,
    edgeType: e.edgeType,
    direction: e.direction as EdgeDirectionInput,
    strength: e.strength,
    certainty: e.certainty,
    historicalSupport: e.historicalSupport,
    logicalNecessity: e.logicalNecessity,
    innovationDegree: e.innovationDegree,
    contextDependency: e.contextDependency,
    typeCatalogId: e.typeCatalogId,
  };
}

/** Только изменившиеся поля — в тело PATCH */
export function edgeDiff(before: EdgeDraft, after: EdgeDraft): EdgeUpdateInput {
  const out: EdgeUpdateInput = {};
  if (after.description !== before.description) out.description = after.description;
  if (after.edgeType !== before.edgeType) out.edgeType = after.edgeType.trim();
  if (after.typeCatalogId !== before.typeCatalogId) out.typeCatalogId = after.typeCatalogId;
  if (after.direction !== before.direction) out.direction = after.direction;
  for (const k of [
    "strength", "certainty", "historicalSupport", "logicalNecessity",
    "innovationDegree", "contextDependency",
  ] as const) {
    if (after[k] !== before[k]) out[k] = after[k];
  }
  return out;
}

export interface EdgeEditorProps {
  value: EdgeDraft;
  onChange: (next: EdgeDraft) => void;
  errors?: Record<string, string> | undefined;
  disabled?: boolean | undefined;
  /** Подписи концов («Бытие → Ничто») */
  sourceName?: string | undefined;
  targetName?: string | undefined;
  /** Контекст «?» слайдеров (без него кнопок обоснования нет) */
  justify?: CharacteristicJustifyContext | undefined;
}

export function EdgeEditor({
  value,
  onChange,
  errors = {},
  disabled = false,
  sourceName,
  targetName,
  justify,
}: EdgeEditorProps) {
  const set = <K extends keyof EdgeDraft>(k: K, v: EdgeDraft[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div data-edge-editor>
      {(sourceName || targetName) && (
        <div className="form-sublabel edge-editor-ends">
          {sourceName ?? "?"}{" "}
          {value.direction === "двунаправленная" ? "↔" : value.direction === "рефлексивная" ? "↺" : "→"}{" "}
          {value.direction === "рефлексивная" ? "" : targetName ?? "?"}
        </div>
      )}
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label" htmlFor="edge-ed-type">
            Тип связи
          </label>
          <TaxonomySelector
            id="edge-ed-type"
            kind="relationship"
            value={{ type: value.edgeType, typeCatalogId: value.typeCatalogId }}
            onChange={(v) => onChange({ ...value, edgeType: v.type, typeCatalogId: v.typeCatalogId })}
            disabled={disabled}
            error={errors.edgeType ?? errors.typeCatalogId}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="edge-ed-dir">
            Направление
          </label>
          <select
            id="edge-ed-dir"
            className="form-select"
            value={value.direction}
            disabled={disabled}
            onChange={(e) => set("direction", e.target.value as EdgeDirectionInput)}
          >
            {EDGE_DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <FieldError text={errors.direction} />
        </div>
      </div>

      <div className="form-group full">
        <label className="form-label" htmlFor="edge-ed-desc">
          Описание
        </label>
        <textarea
          id="edge-ed-desc"
          className="form-textarea"
          style={{ minHeight: 72 }}
          value={value.description}
          disabled={disabled}
          onChange={(e) => set("description", e.target.value)}
        />
        <FieldError text={errors.description} />
      </div>

      <div className="form-label" style={{ marginTop: 10 }}>
        Характеристики связи
      </div>
      <CharacteristicSliderGroup
        elementType="edge"
        idPrefix="edge-ed"
        values={value as unknown as Record<string, number>}
        onChange={(field, v) => onChange({ ...value, [field]: v })}
        readOnly={disabled}
        errors={errors}
        justify={justify}
      />
    </div>
  );
}
