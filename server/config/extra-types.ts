/**
 * Расширенные типы категорий/связей по методу × уровню (v10) + _buildExtraTypesBlock (порт).
 * СГЕНЕРИРОВАНО scripts/extract-seed-data.mjs из philosynth.html
 * (ревизия 2026-07, 26 024 стр.; строки: 8951–8958; 8959–8970; 8971–8975).
 * НЕ ПРАВИТЬ ВРУЧНУЮ — перегенерировать при обновлении исходника.
 */

/** _EXTRA_CATEGORY_TYPES [philosynth.html строки 8951–8958] */
export const EXTRA_CATEGORY_TYPES = {
  "hermeneutical": [
    "лингвистическая",
    "герменевтическая"
  ],
  "analytical": [
    "аналитическая",
    "лингвистическая"
  ],
  "creative": [
    "лингвистическая",
    "герменевтическая",
    "аналитическая",
    "междисциплинарная"
  ],
  "dialectical": [],
  "integrative": [],
  "deconstructive": [
    "аналитическая"
  ]
} as const;

/** _EXTRA_EDGE_TYPES [philosynth.html строки 8959–8970] */
export const EXTRA_EDGE_TYPES = {
  "analytical": [
    "дедуктивная",
    "индуктивная",
    "абдуктивная",
    "необходимое условие",
    "достаточное условие",
    "тождество",
    "обобщение",
    "конкретизация"
  ],
  "hermeneutical": [
    "понимание",
    "мышление",
    "выражение"
  ],
  "creative": [
    "конъюнктивная",
    "дизъюнктивная",
    "необходимое условие",
    "достаточное условие",
    "тождество",
    "аналогия",
    "реализация",
    "конкретизация",
    "обобщение",
    "дедуктивная",
    "индуктивная",
    "абдуктивная",
    "временная",
    "концептуальная",
    "выражение",
    "понимание",
    "мышление"
  ],
  "dialectical": [],
  "integrative": [
    "аналогия"
  ],
  "deconstructive": [
    "аналогия",
    "обобщение"
  ]
} as const;

/** _SYNTH_LEVEL_TYPE_PHRASING [philosynth.html строки 8971–8975] */
export const SYNTH_LEVEL_TYPE_PHRASING = {
  "comparative": "При необходимости также допускаются: ",
  "transformative": "Наряду с основными также допускаются: ",
  "generative": ""
} as const;

/**
 * Порт _buildExtraTypesBlock(method, synthLevel, kind) [philosynth.html ~8977].
 * Генерирует добавку к списку допустимых типов в промпте графа.
 * Дословная логика исходника; типы аргументов сужены до известных ключей,
 * неизвестные значения дают "" (как в исходнике через map[method] || []).
 */
export function buildExtraTypesBlock(
  method: string,
  synthLevel: string,
  kind: "category" | "edge",
): string {
  const map: Record<string, readonly string[]> =
    kind === "category" ? EXTRA_CATEGORY_TYPES : EXTRA_EDGE_TYPES;
  const extra = map[method] || [];
  if (!extra.length) return "";
  const phrasing = (
    SYNTH_LEVEL_TYPE_PHRASING as Record<string, string>
  )[synthLevel];
  if (phrasing === undefined) return "";
  if (synthLevel === "generative") {
    // На порождающем уровне: просто добавляем в список через « / »
    return " / " + extra.join(" / ");
  }
  return "\n" + phrasing + extra.join(" / ");
}
