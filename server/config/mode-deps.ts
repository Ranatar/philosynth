/**
 * Декларативные зависимости режимов MODE_DEPS (v11, 01-arch §4.15 п.6).
 * СГЕНЕРИРОВАНО scripts/extract-seed-data.mjs из philosynth.html
 * (ревизия 2026-07, 26 024 стр.; строки: 22543–22556).
 * НЕ ПРАВИТЬ ВРУЧНУЮ — перегенерировать при обновлении исходника.
 */

/** MODE_DEPS [philosynth.html строки 22543–22556] */
export const MODE_DEPS = {
  "adversarial": {
    "required": [
      "capsule:full",
      "theses:summary",
      "critique:final_table"
    ],
    "optional": [
      "graph:nodes",
      "theses:full"
    ]
  },
  "translator": {
    "required": [
      "capsule:full",
      "graph:nodes",
      "glossary:table"
    ],
    "optional": [
      "theses:summary"
    ]
  },
  "timeslice": {
    "required": [
      "capsule:full"
    ],
    "optional": [
      "history:genealogy",
      "history:contemporary"
    ]
  }
} as const;
