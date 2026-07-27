/**
 * Селективный родительский контекст: словарь полей, 4-слойная карта зависимостей, intra-карта (v11, 01-arch §4.13).
 * СГЕНЕРИРОВАНО scripts/extract-seed-data.mjs из philosynth.html
 * (ревизия 2026-07, 26 024 стр.; строки: 9873–9891; 9880–9891; 9896–9921; 9927–9942; 9947–9967; 9972–9990; 9995–10018; 10023–10050).
 * НЕ ПРАВИТЬ ВРУЧНУЮ — перегенерировать при обновлении исходника.
 */

/** PARENT_FIELD_ORDER [philosynth.html строки 9873–9891] */
export const PARENT_FIELD_ORDER = [
  "capsule",
  "goals",
  "portraits",
  "tensions",
  "graphNodes",
  "graphEdges",
  "dialogueConcepts",
  "dialogueSynthesis",
  "glossaryCompact",
  "thesesSummary"
] as const;

/** PARENT_FIELD_LABELS [philosynth.html строки 9880–9891] */
export const PARENT_FIELD_LABELS = {
  "capsule": "КАПСУЛА",
  "goals": "ЦЕЛИ И МЕТОД",
  "portraits": "ПОРТРЕТЫ ФИЛОСОФОВ",
  "tensions": "НАПРЯЖЕНИЯ",
  "graphNodes": "КАТЕГОРИИ (из графа)",
  "graphEdges": "СВЯЗИ (из графа)",
  "dialogueConcepts": "ПОНЯТИЯ (из диалога)",
  "dialogueSynthesis": "АНАЛИТИЧЕСКИЙ КОММЕНТАРИЙ К ДИАЛОГУ",
  "glossaryCompact": "ТЕРМИНЫ",
  "thesesSummary": "ТЕЗИСЫ"
} as const;

/** PARENT_DEPS_BASE [philosynth.html строки 9896–9921] */
export const PARENT_DEPS_BASE = {
  "sum": {
    "required": [
      "capsule",
      "goals",
      "tensions",
      "thesesSummary",
      "graphNodes"
    ],
    "optional": [
      "graphEdges",
      "glossaryCompact",
      "dialogueSynthesis",
      "portraits"
    ]
  },
  "graph": {
    "required": [
      "capsule",
      "graphNodes",
      "graphEdges"
    ],
    "optional": [
      "glossaryCompact",
      "thesesSummary",
      "tensions"
    ]
  },
  "glossary": {
    "required": [
      "capsule",
      "glossaryCompact",
      "graphNodes"
    ],
    "optional": [
      "tensions",
      "thesesSummary"
    ]
  },
  "theses": {
    "required": [
      "capsule",
      "thesesSummary",
      "graphNodes",
      "graphEdges",
      "glossaryCompact"
    ],
    "optional": [
      "tensions",
      "goals"
    ]
  },
  "name": {
    "required": [
      "capsule",
      "goals"
    ],
    "optional": [
      "thesesSummary",
      "graphNodes"
    ]
  },
  "history": {
    "required": [
      "capsule",
      "goals",
      "portraits"
    ],
    "optional": [
      "thesesSummary",
      "tensions"
    ]
  },
  "origin": {
    "required": [
      "capsule",
      "goals",
      "portraits",
      "tensions",
      "thesesSummary"
    ],
    "optional": [
      "graphNodes",
      "glossaryCompact"
    ]
  },
  "practical": {
    "required": [
      "capsule",
      "goals",
      "thesesSummary"
    ],
    "optional": [
      "glossaryCompact",
      "graphNodes"
    ]
  },
  "dialogue": {
    "required": [
      "capsule",
      "tensions",
      "thesesSummary",
      "graphNodes"
    ],
    "optional": [
      "goals",
      "dialogueSynthesis",
      "portraits"
    ]
  },
  "evolution": {
    "required": [
      "capsule",
      "goals",
      "thesesSummary"
    ],
    "optional": [
      "graphNodes",
      "graphEdges",
      "tensions"
    ]
  },
  "critique": {
    "required": [
      "capsule",
      "goals",
      "portraits",
      "tensions",
      "thesesSummary",
      "graphNodes",
      "graphEdges",
      "glossaryCompact"
    ],
    "optional": [
      "dialogueSynthesis",
      "dialogueConcepts"
    ]
  },
  "capsule": {
    "required": [
      "capsule",
      "goals",
      "thesesSummary"
    ],
    "optional": [
      "graphNodes",
      "glossaryCompact"
    ]
  }
} as const;

/** PARENT_DEPS_GENETIC [philosynth.html строки 9927–9942] */
export const PARENT_DEPS_GENETIC = {
  "dialogue": {
    "required": [
      "tensions",
      "thesesSummary",
      "dialogueConcepts"
    ],
    "optional": [
      "goals",
      "dialogueSynthesis"
    ]
  },
  "theses": {
    "required": [
      "dialogueConcepts",
      "dialogueSynthesis"
    ],
    "optional": [
      "tensions",
      "goals"
    ]
  },
  "glossary": {
    "required": [
      "dialogueConcepts"
    ],
    "optional": [
      "tensions"
    ]
  },
  "graph": {
    "required": [
      "dialogueConcepts",
      "thesesSummary"
    ],
    "optional": [
      "tensions"
    ]
  },
  "critique": {
    "required": [
      "dialogueSynthesis",
      "dialogueConcepts"
    ],
    "optional": []
  },
  "capsule": {
    "required": [
      "dialogueSynthesis"
    ],
    "optional": [
      "dialogueConcepts"
    ]
  },
  "name": {
    "required": [],
    "optional": [
      "dialogueConcepts",
      "dialogueSynthesis"
    ]
  }
} as const;

/** PARENT_DEPS_LEVEL [philosynth.html строки 9947–9967] */
export const PARENT_DEPS_LEVEL = {
  "transformative": {
    "graph": {
      "required": [
        "tensions",
        "graphEdges"
      ]
    },
    "glossary": {
      "required": [
        "tensions"
      ]
    },
    "theses": {
      "required": [
        "tensions"
      ],
      "optional": [
        "portraits"
      ]
    },
    "origin": {
      "required": [
        "tensions"
      ]
    },
    "dialogue": {
      "required": [
        "graphEdges"
      ],
      "optional": [
        "tensions"
      ]
    },
    "critique": {
      "required": [
        "tensions"
      ]
    },
    "evolution": {
      "optional": [
        "tensions"
      ]
    }
  },
  "generative": {
    "graph": {
      "required": [
        "portraits",
        "tensions"
      ]
    },
    "glossary": {
      "optional": [
        "portraits"
      ]
    },
    "theses": {
      "required": [
        "portraits"
      ]
    },
    "origin": {
      "required": [
        "portraits"
      ],
      "optional": [
        "thesesSummary"
      ]
    },
    "dialogue": {
      "required": [
        "portraits"
      ],
      "optional": [
        "tensions"
      ]
    },
    "critique": {
      "required": [
        "portraits"
      ]
    },
    "practical": {
      "optional": [
        "thesesSummary"
      ]
    }
  }
} as const;

/** PARENT_DEPS_LEVEL_GENETIC [philosynth.html строки 9972–9990] */
export const PARENT_DEPS_LEVEL_GENETIC = {
  "transformative": {
    "dialogue": {
      "required": [
        "tensions"
      ]
    },
    "glossary": {
      "required": [
        "tensions"
      ]
    },
    "theses": {
      "required": [
        "tensions"
      ],
      "optional": [
        "portraits"
      ]
    },
    "origin": {
      "required": [
        "tensions"
      ]
    },
    "graph": {
      "required": [
        "tensions"
      ],
      "optional": [
        "graphEdges"
      ]
    },
    "critique": {
      "required": [
        "tensions"
      ]
    }
  },
  "generative": {
    "dialogue": {
      "required": [
        "portraits"
      ],
      "optional": [
        "tensions"
      ]
    },
    "glossary": {
      "optional": [
        "portraits"
      ]
    },
    "theses": {
      "required": [
        "portraits"
      ]
    },
    "origin": {
      "required": [
        "portraits"
      ],
      "optional": [
        "thesesSummary"
      ]
    },
    "graph": {
      "required": [
        "portraits"
      ],
      "optional": [
        "tensions"
      ]
    },
    "critique": {
      "required": [
        "portraits"
      ]
    }
  }
} as const;

/** PARENT_DEPS_METHOD [philosynth.html строки 9995–10018] */
export const PARENT_DEPS_METHOD = {
  "hermeneutical": {
    "evolution": {
      "optional": [
        "portraits"
      ]
    }
  },
  "analytical": {
    "origin": {
      "required": [
        "glossaryCompact"
      ]
    },
    "theses": {
      "required": [
        "thesesSummary"
      ]
    }
  },
  "dialectical": {},
  "integrative": {
    "origin": {
      "required": [
        "portraits"
      ]
    },
    "history": {
      "required": [
        "portraits"
      ]
    },
    "critique": {
      "required": [
        "portraits"
      ]
    }
  },
  "deconstructive": {
    "critique": {
      "required": [
        "thesesSummary",
        "goals"
      ]
    },
    "origin": {
      "required": [
        "thesesSummary"
      ]
    }
  }
} as const;

/** PARENT_INTRA_DEPS [philosynth.html строки 10023–10050] */
export const PARENT_INTRA_DEPS = {
  "graph": {
    "Методология построения графа": {
      "required": [
        "capsule",
        "goals"
      ]
    },
    "Таблица категорий": {
      "required": [
        "capsule",
        "graphNodes",
        "tensions"
      ]
    },
    "Таблица связей": {
      "required": [
        "graphNodes",
        "graphEdges"
      ]
    },
    "Топология графа": {
      "required": [
        "graphEdges"
      ],
      "optional": [
        "graphNodes"
      ]
    },
    "Топологическая таблица": {
      "required": [
        "graphEdges"
      ],
      "optional": [
        "graphNodes"
      ]
    }
  },
  "theses": {
    "Онтологические тезисы": {
      "required": [
        "capsule",
        "graphNodes",
        "thesesSummary"
      ]
    },
    "Эпистемологические тезисы": {
      "required": [
        "capsule",
        "graphNodes",
        "thesesSummary"
      ]
    },
    "Этические и аксиологические тезисы": {
      "required": [
        "capsule",
        "thesesSummary"
      ]
    },
    "Сводная таблица тезисов": {
      "required": [
        "thesesSummary"
      ]
    }
  },
  "critique": {
    "Внутренняя когерентность": {
      "required": [
        "capsule",
        "thesesSummary"
      ]
    },
    "Философская новизна": {
      "required": [
        "capsule",
        "portraits"
      ]
    },
    "Эмерджентность концепции": {
      "required": [
        "graphNodes",
        "graphEdges",
        "tensions"
      ]
    },
    "Проблемная генерация": {
      "required": [
        "capsule",
        "tensions"
      ]
    },
    "Верность методу синтеза": {
      "required": [
        "capsule"
      ]
    },
    "Сохранение ценных аспектов": {},
    "Разрешение противоречий": {
      "required": [
        "tensions",
        "thesesSummary"
      ]
    },
    "Слепые пятна": {
      "required": [
        "capsule",
        "portraits",
        "goals"
      ]
    },
    "Межслойная согласованность": {
      "required": [
        "thesesSummary"
      ]
    },
    "Итоговая оценка": {},
    "Рекомендации по улучшению": {
      "required": [
        "capsule"
      ]
    }
  }
} as const;

/** Версионирование схемы родительского контекста [philosynth.html ~10052] */
export const PARENT_CONTEXT_SCHEMA_VERSION = 1 as const;
export const PARENT_CONTEXT_SCHEMA_ID = "selective-v1" as const;
