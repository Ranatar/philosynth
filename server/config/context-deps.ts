/**
 * Карты межсекционных зависимостей CONTEXT_DEPS (seed → synthesis_configs).
 * СГЕНЕРИРОВАНО scripts/extract-seed-data.mjs из philosynth.html
 * (ревизия 2026-07, 26 024 стр.; строки: 5998–6065; 6067–6151; 6156–6201; 6203–6242; 6247–6260).
 * НЕ ПРАВИТЬ ВРУЧНУЮ — перегенерировать при обновлении исходника.
 */

/** CONTEXT_DEPS_BASE [philosynth.html строки 5998–6065] */
export const CONTEXT_DEPS_BASE = {
  "graph": {
    "required": [
      "sum:goals"
    ],
    "optional": [
      "sum:portraits"
    ]
  },
  "glossary": {
    "required": [
      "sum:goals",
      "graph:nodes_compact"
    ],
    "optional": [
      "graph:edges",
      "graph:topology",
      "sum:tensions"
    ]
  },
  "theses": {
    "required": [
      "sum:goals",
      "sum:tensions",
      "graph:nodes_compact",
      "graph:edges"
    ],
    "optional": [
      "sum:portraits",
      "sum:novelty",
      "graph:topology",
      "glossary:table"
    ]
  },
  "name": {
    "required": [
      "sum:goals",
      "sum:novelty",
      "graph:nodes_compact"
    ],
    "optional": [
      "sum:coherence",
      "sum:tensions",
      "theses:summary"
    ]
  },
  "history": {
    "required": [
      "sum:goals",
      "sum:portraits"
    ],
    "optional": [
      "sum:novelty",
      "sum:tensions",
      "graph:nodes_compact",
      "theses:summary",
      "name:title"
    ]
  },
  "origin": {
    "required": [
      "sum:goals",
      "sum:portraits",
      "sum:tensions",
      "graph:nodes",
      "theses:full"
    ],
    "optional": [
      "sum:novelty",
      "sum:coherence",
      "graph:edges",
      "glossary:table",
      "name:title"
    ]
  },
  "practical": {
    "required": [
      "sum:goals",
      "sum:novelty",
      "graph:nodes_compact",
      "theses:summary"
    ],
    "optional": [
      "glossary:table",
      "name:title"
    ]
  },
  "dialogue": {
    "required": [
      "sum:goals",
      "sum:portraits",
      "sum:tensions",
      "graph:nodes_compact",
      "theses:summary"
    ],
    "optional": [
      "sum:difficulty",
      "graph:edges",
      "glossary:table",
      "name:title"
    ]
  },
  "evolution": {
    "required": [
      "sum:goals",
      "sum:novelty",
      "name:title",
      "graph:nodes_compact"
    ],
    "optional": [
      "sum:coherence",
      "sum:tensions",
      "graph:edges",
      "graph:topology",
      "theses:summary",
      "history:contemporary",
      "history:genealogy"
    ]
  },
  "critique": {
    "required": [
      "sum:goals",
      "sum:portraits",
      "sum:novelty",
      "sum:tensions",
      "sum:coherence",
      "graph:nodes",
      "graph:edges",
      "theses:full",
      "glossary:table"
    ],
    "optional": [
      "graph:topology",
      "name:title",
      "history:contemporary",
      "origin:decomposition",
      "practical:summary",
      "dialogue:new_concepts",
      "dialogue:synthesis"
    ]
  },
  "capsule": {
    "required": [
      "name:title",
      "graph:nodes_top",
      "theses:summary"
    ],
    "optional": [
      "graph:edges",
      "graph:topology",
      "sum:novelty",
      "glossary:table",
      "critique:final_table"
    ]
  }
} as const;

/** CONTEXT_DEPS_GENETIC [philosynth.html строки 6067–6151] */
export const CONTEXT_DEPS_GENETIC = {
  "dialogue": {
    "required": [
      "sum:goals",
      "sum:portraits",
      "sum:tensions"
    ],
    "optional": [
      "sum:difficulty"
    ]
  },
  "theses": {
    "required": [
      "sum:goals",
      "sum:tensions",
      "dialogue:new_concepts",
      "dialogue:turning_points"
    ],
    "optional": [
      "sum:portraits",
      "dialogue:synthesis"
    ]
  },
  "glossary": {
    "required": [
      "sum:goals",
      "dialogue:new_concepts"
    ],
    "optional": [
      "dialogue:tensions_discovered",
      "dialogue:synthesis",
      "theses:summary"
    ]
  },
  "graph": {
    "required": [
      "sum:goals",
      "dialogue:new_concepts",
      "glossary:table",
      "theses:summary"
    ],
    "optional": [
      "sum:portraits",
      "sum:tensions",
      "dialogue:turning_points",
      "dialogue:synthesis"
    ]
  },
  "name": {
    "required": [
      "sum:goals",
      "sum:novelty",
      "glossary:table",
      "theses:summary"
    ],
    "optional": [
      "sum:coherence",
      "sum:tensions",
      "dialogue:new_concepts",
      "graph:nodes_compact"
    ]
  },
  "history": {
    "required": [
      "sum:goals",
      "sum:portraits"
    ],
    "optional": [
      "sum:novelty",
      "sum:tensions",
      "dialogue:new_concepts",
      "theses:summary",
      "name:title",
      "graph:nodes_compact"
    ]
  },
  "origin": {
    "required": [
      "sum:goals",
      "sum:portraits",
      "sum:tensions",
      "theses:full",
      "glossary:table"
    ],
    "optional": [
      "sum:novelty",
      "sum:coherence",
      "dialogue:new_concepts",
      "graph:nodes",
      "graph:edges",
      "name:title"
    ]
  },
  "practical": {
    "required": [
      "sum:goals",
      "sum:novelty",
      "theses:summary",
      "glossary:table"
    ],
    "optional": [
      "dialogue:new_concepts",
      "graph:nodes_compact",
      "name:title"
    ]
  },
  "evolution": {
    "required": [
      "sum:goals",
      "sum:novelty",
      "name:title",
      "theses:summary"
    ],
    "optional": [
      "sum:coherence",
      "sum:tensions",
      "glossary:table",
      "dialogue:new_concepts",
      "graph:nodes_compact",
      "graph:edges",
      "graph:topology",
      "history:contemporary",
      "history:genealogy"
    ]
  },
  "critique": {
    "required": [
      "sum:goals",
      "sum:portraits",
      "sum:novelty",
      "sum:tensions",
      "sum:coherence",
      "glossary:table",
      "theses:full",
      "dialogue:new_concepts",
      "dialogue:synthesis"
    ],
    "optional": [
      "graph:nodes",
      "graph:edges",
      "graph:topology",
      "name:title",
      "history:contemporary",
      "origin:decomposition",
      "practical:summary"
    ]
  },
  "capsule": {
    "required": [
      "name:title",
      "theses:summary",
      "glossary:table"
    ],
    "optional": [
      "dialogue:synthesis",
      "graph:nodes_top",
      "graph:edges",
      "sum:novelty",
      "critique:final_table"
    ]
  }
} as const;

/** CONTEXT_DEPS_LEVEL [philosynth.html строки 6156–6201] */
export const CONTEXT_DEPS_LEVEL = {
  "transformative": {
    "graph": {
      "required": [
        "sum:tensions"
      ]
    },
    "glossary": {
      "optional": [
        "sum:portraits",
        "sum:tensions"
      ]
    },
    "theses": {
      "required": [
        "sum:portraits"
      ]
    },
    "origin": {
      "required": [
        "graph:edges"
      ]
    },
    "practical": {
      "optional": [
        "theses:full"
      ]
    },
    "dialogue": {
      "required": [
        "graph:edges"
      ],
      "optional": [
        "glossary:table"
      ]
    }
  },
  "generative": {
    "graph": {
      "required": [
        "sum:portraits",
        "sum:tensions"
      ]
    },
    "glossary": {
      "optional": [
        "sum:portraits"
      ]
    },
    "theses": {
      "required": [
        "sum:portraits"
      ]
    },
    "origin": {
      "required": [
        "graph:edges"
      ],
      "optional": [
        "theses:summary"
      ]
    },
    "practical": {
      "optional": [
        "theses:full"
      ]
    },
    "dialogue": {
      "required": [
        "graph:edges"
      ],
      "optional": [
        "glossary:table"
      ]
    }
  }
} as const;

/** CONTEXT_DEPS_LEVEL_GENETIC [philosynth.html строки 6203–6242] */
export const CONTEXT_DEPS_LEVEL_GENETIC = {
  "transformative": {
    "dialogue": {
      "required": [
        "sum:tensions"
      ]
    },
    "glossary": {
      "optional": [
        "sum:portraits",
        "sum:tensions"
      ]
    },
    "theses": {
      "required": [
        "sum:portraits"
      ]
    },
    "origin": {
      "optional": [
        "dialogue:turning_points"
      ]
    },
    "graph": {
      "optional": [
        "dialogue:tensions_discovered"
      ]
    }
  },
  "generative": {
    "dialogue": {
      "required": [
        "sum:portraits"
      ]
    },
    "glossary": {
      "optional": [
        "sum:portraits"
      ]
    },
    "theses": {
      "required": [
        "sum:portraits"
      ]
    },
    "origin": {
      "optional": [
        "dialogue:turning_points",
        "theses:summary"
      ]
    },
    "graph": {
      "optional": [
        "dialogue:tensions_discovered"
      ]
    }
  }
} as const;

/** CONTEXT_DEPS_METHOD [philosynth.html строки 6247–6260] */
export const CONTEXT_DEPS_METHOD = {
  "hermeneutical": {
    "history": {
      "optional": [
        "origin:genealogy"
      ]
    },
    "evolution": {
      "optional": [
        "origin:genealogy"
      ]
    }
  },
  "analytical": {
    "theses": {
      "optional": [
        "glossary:table"
      ]
    }
  }
} as const;
