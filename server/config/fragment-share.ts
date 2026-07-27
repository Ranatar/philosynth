/**
 * Доли контекстного бюджета по фрагментам + базовый бюджет по глубине.
 * СГЕНЕРИРОВАНО scripts/extract-seed-data.mjs из philosynth.html
 * (ревизия 2026-07, 26 024 стр.; строки: 7566–7622; 7529–7534).
 * НЕ ПРАВИТЬ ВРУЧНУЮ — перегенерировать при обновлении исходника.
 */

/** FRAGMENT_SHARE [philosynth.html строки 7566–7622] */
export const FRAGMENT_SHARE = {
  "sum:goals": 0.12,
  "sum:portraits": 0.16,
  "sum:novelty": 0.1,
  "sum:tensions": 0.08,
  "sum:coherence": 0.08,
  "sum:difficulty": 0.13,
  "graph:nodes": 0.23,
  "graph:nodes_compact": 0.14,
  "graph:nodes_top": 0.15,
  "graph:edges": 0.18,
  "graph:topology": 0.19,
  "glossary:table": 0.27,
  "theses:full": 0.15,
  "theses:summary": 0.11,
  "name:title": 0.23,
  "name:full": 0.21,
  "history:contemporary": 0.19,
  "history:genealogy": 0.22,
  "history:influence": 0.14,
  "history:name_context": 0.18,
  "origin:decomposition": 0.14,
  "origin:genealogy": 0.2,
  "origin:novelty": 0.18,
  "evolution:directions": 0.29,
  "evolution:graph_changes": 0.18,
  "evolution:name_evolution": 0.13,
  "evolution:science": 0.2,
  "dialogue:synthesis": 0.3,
  "dialogue:new_concepts": 0.5,
  "dialogue:tensions_discovered": 0.3,
  "dialogue:turning_points": 0.4,
  "practical:summary": 0.17,
  "critique:final_table": 0.17
} as const;

/** CONTEXT_BUDGET [philosynth.html строки 7529–7534] */
export const CONTEXT_BUDGET = {
  "overview": 24000,
  "standard": 48000,
  "deep": 72000,
  "exhaustive": 100000
} as const;
