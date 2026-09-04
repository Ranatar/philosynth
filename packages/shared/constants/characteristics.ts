/**
 * Характеристики элементов графа и их допустимые диапазоны
 * (беседа 5.3; 03-spec §1.12 EN4/EN5, edge case 07 5.3 — правка
 * 2026-09-02, п.18: диапазон зависит от поля).
 *
 * Единый источник истины для:
 *  - валидации value в POST /syntheses/:id/justify-characteristic (сервер);
 *  - CharacteristicSlider (клиент, беседа 5.4): min/max/step/подписи.
 *
 * Имена — snake_case колонок 02-data-model (§2.6 / §2.7); столбец
 * `depth_score` (02: «чтобы не конфликтовать с SQL») в API-DTO зовётся
 * `depthScore`, а в тексте 07 п.18 — `depth`; резолвер
 * `resolveCharacteristic` принимает все три написания.
 */

export type CharacteristicElementType = "category" | "edge";

export interface CharacteristicSpec {
  /** Каноническое имя (snake_case, как колонка БД) */
  key: string;
  /** Поле DTO (camelCase, как в shared/types/graph) */
  dtoField: string;
  /** Русская подпись (для UI и промпта обоснования) */
  labelRu: string;
  min: number;
  max: number;
  /** true — целое число (шаг 1), false — REAL (шаг 0.05 в UI) */
  integer: boolean;
}

/** Категории: 8 характеристик (01-arch §4.7; 02 §2.6) */
export const CATEGORY_CHARACTERISTICS: readonly CharacteristicSpec[] = [
  { key: "centrality", dtoField: "centrality", labelRu: "центральность", min: 0, max: 1, integer: false },
  { key: "certainty", dtoField: "certainty", labelRu: "определённость", min: 0, max: 1, integer: false },
  { key: "historical_significance", dtoField: "historicalSignificance", labelRu: "историческая значимость", min: 0, max: 1, integer: false },
  { key: "innovation_degree", dtoField: "innovationDegree", labelRu: "уровень инновационности", min: 1, max: 5, integer: true },
  { key: "clarity", dtoField: "clarity", labelRu: "ясность", min: 0, max: 1, integer: false },
  { key: "breadth", dtoField: "breadth", labelRu: "широта", min: 0, max: 1, integer: false },
  { key: "depth_score", dtoField: "depthScore", labelRu: "глубина", min: 0, max: 1, integer: false },
  { key: "applicability", dtoField: "applicability", labelRu: "применимость", min: 0, max: 1, integer: false },
];

/** Связи: 6 характеристик (01-arch §4.7; 02 §2.7) */
export const EDGE_CHARACTERISTICS: readonly CharacteristicSpec[] = [
  { key: "strength", dtoField: "strength", labelRu: "сила", min: 0, max: 1, integer: false },
  { key: "certainty", dtoField: "certainty", labelRu: "определённость", min: 0, max: 1, integer: false },
  { key: "historical_support", dtoField: "historicalSupport", labelRu: "историческая поддержка", min: 0, max: 1, integer: false },
  { key: "logical_necessity", dtoField: "logicalNecessity", labelRu: "логическая необходимость", min: 0, max: 1, integer: false },
  { key: "innovation_degree", dtoField: "innovationDegree", labelRu: "степень инновации", min: 1, max: 5, integer: true },
  { key: "context_dependency", dtoField: "contextDependency", labelRu: "контекстозависимость", min: 0, max: 1, integer: false },
];

export const CHARACTERISTICS_BY_TYPE: Readonly<
  Record<CharacteristicElementType, readonly CharacteristicSpec[]>
> = {
  category: CATEGORY_CHARACTERISTICS,
  edge: EDGE_CHARACTERISTICS,
};

/** Дополнительные написания → каноническое имя (07 5.3 п.18 пишет `depth`). */
const ALIASES: Readonly<Record<string, string>> = {
  depth: "depth_score",
  depthScore: "depth_score",
  historicalSignificance: "historical_significance",
  innovationDegree: "innovation_degree",
  historicalSupport: "historical_support",
  logicalNecessity: "logical_necessity",
  contextDependency: "context_dependency",
};

/**
 * Спецификация характеристики по имени (snake_case, camelCase DTO или
 * алиас) для данного типа элемента; null — характеристики нет у типа.
 */
export function resolveCharacteristic(
  elementType: CharacteristicElementType,
  name: string,
): CharacteristicSpec | null {
  const canonical = ALIASES[name] ?? name;
  return (
    CHARACTERISTICS_BY_TYPE[elementType].find((s) => s.key === canonical) ??
    null
  );
}

/**
 * Проверка значения по диапазону характеристики: конечное число внутри
 * [min, max]; для целочисленных — ещё и целое. Возвращает текст ошибки
 * (для details поля) либо null.
 */
export function validateCharacteristicValue(
  spec: CharacteristicSpec,
  value: unknown,
): string | null {
  if (typeof value !== "number" || !Number.isFinite(value))
    return "Ожидается число";
  if (spec.integer && !Number.isInteger(value))
    return `Ожидается целое число от ${spec.min} до ${spec.max}`;
  if (value < spec.min || value > spec.max)
    return `Значение вне диапазона [${spec.min}, ${spec.max}]`;
  return null;
}
