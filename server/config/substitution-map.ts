/**
 * Карты подстановок контекстных фрагментов (seed → synthesis_configs).
 * СГЕНЕРИРОВАНО scripts/extract-seed-data.mjs из philosynth.html
 * (ревизия 2026-07, 26 024 стр.; строки: 6287–6337; 6339–6404).
 * НЕ ПРАВИТЬ ВРУЧНУЮ — перегенерировать при обновлении исходника.
 */

/** SUBSTITUTION_MAP [philosynth.html строки 6287–6337] */
export const SUBSTITUTION_MAP = {
  "graph:nodes": [
    {
      "key": "glossary:table",
      "q": 2
    },
    {
      "key": "origin:decomposition",
      "q": 2
    },
    {
      "key": "theses:summary",
      "q": 1
    }
  ],
  "graph:nodes_compact": [
    {
      "key": "glossary:table",
      "q": 2
    },
    {
      "key": "theses:summary",
      "q": 1
    }
  ],
  "graph:edges": [
    {
      "key": "theses:full",
      "q": 2
    },
    {
      "key": "origin:decomposition",
      "q": 1
    }
  ],
  "graph:topology": [
    {
      "key": "evolution:graph_changes",
      "q": 1
    },
    {
      "key": "critique:full",
      "q": 1
    }
  ],
  "glossary:table": [
    {
      "key": "graph:nodes",
      "q": 2
    }
  ],
  "theses:full": [
    {
      "key": "origin:decomposition",
      "q": 3
    },
    {
      "key": "dialogue:synthesis",
      "q": 2
    }
  ],
  "theses:summary": [
    {
      "key": "origin:decomposition",
      "q": 2
    },
    {
      "key": "graph:nodes",
      "q": 2
    },
    {
      "key": "dialogue:synthesis",
      "q": 2
    }
  ],
  "name:title": [
    {
      "key": "history:name_context",
      "q": 2
    },
    {
      "key": "evolution:name_evolution",
      "q": 1
    },
    {
      "key": "sum:goals",
      "q": 1
    }
  ],
  "name:full": [
    {
      "key": "history:name_context",
      "q": 2
    },
    {
      "key": "evolution:name_evolution",
      "q": 2
    },
    {
      "key": "sum:goals",
      "q": 1
    }
  ],
  "history:genealogy": [
    {
      "key": "origin:genealogy",
      "q": 3
    }
  ],
  "history:contemporary": [
    {
      "key": "evolution:science",
      "q": 2
    }
  ],
  "history:influence": [
    {
      "key": "evolution:directions",
      "q": 3
    },
    {
      "key": "practical:summary",
      "q": 2
    }
  ],
  "history:name_context": [],
  "origin:decomposition": [
    {
      "key": "theses:summary",
      "q": 1
    }
  ]
} as const;

/** SUBSTITUTION_MAP_GENETIC [philosynth.html строки 6339–6404] */
export const SUBSTITUTION_MAP_GENETIC = {
  "dialogue:new_concepts": [
    {
      "key": "sum:tensions",
      "q": 2
    },
    {
      "key": "sum:portraits",
      "q": 1
    }
  ],
  "dialogue:tensions_discovered": [
    {
      "key": "sum:tensions",
      "q": 3
    }
  ],
  "dialogue:turning_points": [
    {
      "key": "sum:tensions",
      "q": 2
    }
  ],
  "dialogue:synthesis": [
    {
      "key": "sum:novelty",
      "q": 2
    }
  ],
  "glossary:table": [
    {
      "key": "theses:summary",
      "q": 3
    },
    {
      "key": "dialogue:new_concepts",
      "q": 2
    },
    {
      "key": "sum:tensions",
      "q": 1
    }
  ],
  "theses:full": [
    {
      "key": "dialogue:synthesis",
      "q": 3
    },
    {
      "key": "origin:decomposition",
      "q": 2
    }
  ],
  "theses:summary": [
    {
      "key": "dialogue:new_concepts",
      "q": 3
    },
    {
      "key": "origin:decomposition",
      "q": 2
    }
  ],
  "graph:nodes": [
    {
      "key": "glossary:table",
      "q": 3
    },
    {
      "key": "theses:summary",
      "q": 2
    },
    {
      "key": "dialogue:new_concepts",
      "q": 1
    }
  ],
  "graph:nodes_compact": [
    {
      "key": "glossary:table",
      "q": 2
    },
    {
      "key": "dialogue:new_concepts",
      "q": 1
    }
  ],
  "graph:edges": [
    {
      "key": "theses:full",
      "q": 2
    },
    {
      "key": "dialogue:turning_points",
      "q": 1
    }
  ],
  "graph:topology": [
    {
      "key": "dialogue:synthesis",
      "q": 2
    },
    {
      "key": "critique:full",
      "q": 1
    }
  ],
  "name:title": [
    {
      "key": "history:name_context",
      "q": 2
    },
    {
      "key": "evolution:name_evolution",
      "q": 1
    },
    {
      "key": "sum:goals",
      "q": 1
    }
  ],
  "name:full": [
    {
      "key": "history:name_context",
      "q": 2
    },
    {
      "key": "evolution:name_evolution",
      "q": 2
    },
    {
      "key": "sum:goals",
      "q": 1
    }
  ],
  "history:genealogy": [
    {
      "key": "origin:genealogy",
      "q": 3
    }
  ],
  "history:contemporary": [
    {
      "key": "evolution:science",
      "q": 2
    }
  ],
  "history:influence": [
    {
      "key": "evolution:directions",
      "q": 3
    },
    {
      "key": "practical:summary",
      "q": 2
    }
  ],
  "history:name_context": [],
  "origin:decomposition": [
    {
      "key": "theses:summary",
      "q": 1
    }
  ]
} as const;
