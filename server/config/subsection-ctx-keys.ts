/**
 * Карта подраздел → потребляемые ctx-ключи (канонические ключи заголовков).
 * СГЕНЕРИРОВАНО scripts/extract-seed-data.mjs из philosynth.html
 * (ревизия 2026-07, 26 024 стр.; строки: 9606–9678).
 * НЕ ПРАВИТЬ ВРУЧНУЮ — перегенерировать при обновлении исходника.
 */

/** SUBSECTION_TO_CTX_KEYS [philosynth.html строки 9606–9678] */
export const SUBSECTION_TO_CTX_KEYS = {
  "graph": {
    "Таблица категорий": [
      "graph:nodes",
      "graph:nodes_top"
    ],
    "Таблица связей": [
      "graph:edges"
    ],
    "Топология графа": [
      "graph:topology"
    ],
    "Топологическая таблица": [
      "graph:topology"
    ]
  },
  "glossary": {
    "Таблица определений": [
      "glossary:table"
    ]
  },
  "theses": {
    "Онтологические тезисы": [
      "theses:full",
      "theses:summary"
    ],
    "Эпистемологические тезисы": [
      "theses:full",
      "theses:summary"
    ],
    "Этические и аксиологические тезисы": [
      "theses:full",
      "theses:summary"
    ],
    "Сводная таблица тезисов": [
      "theses:summary"
    ]
  },
  "name": {
    "Итоговая рекомендация": [
      "name:title",
      "name:full"
    ]
  },
  "sum": {
    "Цели и метод": [
      "sum:goals"
    ],
    "Портрет каждого философа": [
      "sum:portraits"
    ],
    "Новизна и ценность": [
      "sum:novelty"
    ],
    "Точки напряжения": [
      "sum:tensions"
    ],
    "Индекс когерентности": [
      "sum:coherence"
    ],
    "Оценка сложности": [
      "sum:difficulty"
    ]
  },
  "history": {
    "Исторический контекст": [],
    "Источники влияния": [],
    "Генеалогия идей": [
      "history:genealogy"
    ],
    "Современные концепции": [
      "history:contemporary"
    ],
    "Потенциальное влияние": [
      "history:influence"
    ],
    "Название в историческом контексте": [
      "history:name_context"
    ]
  },
  "origin": {
    "Идентификация родительских традиций": [
      "origin:genealogy"
    ],
    "Элементная декомпозиция": [
      "origin:decomposition"
    ],
    "Оценка оригинальности": [
      "origin:novelty"
    ],
    "Потенциальные возражения": []
  },
  "evolution": {
    "Направления развития": [
      "evolution:directions"
    ],
    "Предлагаемые изменения графа": [
      "evolution:graph_changes"
    ],
    "Эволюция названия": [
      "evolution:name_evolution"
    ],
    "Интеграция с современной наукой": [
      "evolution:science"
    ],
    "Временная карта развития": []
  },
  "dialogue": {
    "Межфилософский диалог": [
      "dialogue:new_concepts",
      "dialogue:turning_points"
    ],
    "Итоговая таблица диалога": [
      "dialogue:new_concepts",
      "dialogue:tensions_discovered"
    ],
    "Аналитический комментарий": [
      "dialogue:synthesis",
      "dialogue:tensions_discovered"
    ]
  },
  "practical": {
    "Образование": [],
    "Этика и принятие решений": [],
    "Психология и личностное развитие": [],
    "Социальные институты": [],
    "Межкультурный диалог": [],
    "Сводная таблица": [
      "practical:summary"
    ]
  },
  "critique": {
    "Внутренняя когерентность": [],
    "Верность методу синтеза": [],
    "Сохранение ценных аспектов": [],
    "Разрешение противоречий": [],
    "Слепые пятна": [],
    "Межслойная согласованность": [],
    "Итоговая оценка": [
      "critique:final_table"
    ],
    "Рекомендации по улучшению": []
  }
} as const;
