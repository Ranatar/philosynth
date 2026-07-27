// Фрагменты philosynth.html (26 024 стр., ревизия 2026-07) для беседы 0.3-seed-prompts-configs
// Сгенерировано extract-fragments.py; при обновлении исходника — перегенерировать.

// ───── [CONTEXT_DEPS_BASE] philosynth.html строки 5998–6065 ─────
      const CONTEXT_DEPS_BASE = {
        graph: {
          required: ["sum:goals"],
          optional:  ["sum:portraits"],
        },
       
        glossary: {
          required: ["sum:goals", "graph:nodes_compact"],
          optional:  ["graph:edges", "graph:topology", "sum:tensions"],
        },
       
        theses: {
          required: ["sum:goals", "sum:tensions", "graph:nodes_compact", "graph:edges"],
          optional:  ["sum:portraits", "sum:novelty", "graph:topology", "glossary:table"],
        },
       
        name: {
          required: ["sum:goals", "sum:novelty", "graph:nodes_compact"],
          optional:  ["sum:coherence", "sum:tensions", "theses:summary"],
        },
       
        history: {
          required: ["sum:goals", "sum:portraits"],
          optional:  ["sum:novelty", "sum:tensions", "graph:nodes_compact", "theses:summary", "name:title"],
        },
       
        origin: {
          required: ["sum:goals", "sum:portraits", "sum:tensions", "graph:nodes", "theses:full"],
          optional:  ["sum:novelty", "sum:coherence", "graph:edges", "glossary:table", "name:title"],
        },
       
        practical: {
          required: ["sum:goals", "sum:novelty", "graph:nodes_compact", "theses:summary"],
          optional:  ["glossary:table", "name:title"],
        },
       
        dialogue: {
          required: ["sum:goals", "sum:portraits", "sum:tensions", "graph:nodes_compact", "theses:summary"],
          optional:  ["sum:difficulty", "graph:edges", "glossary:table", "name:title"],
        },
       
        evolution: {
          required: ["sum:goals", "sum:novelty", "name:title", "graph:nodes_compact"],
          optional: [
            "sum:coherence", "sum:tensions", "graph:edges", "graph:topology",
            "theses:summary", "history:contemporary", "history:genealogy",
          ],
        },
       
        critique: {
          required: [
            "sum:goals", "sum:portraits", "sum:novelty",
            "sum:tensions", "sum:coherence",
            "graph:nodes", "graph:edges", "theses:full", "glossary:table",
          ],
          optional: ["graph:topology", "name:title", "history:contemporary",
                     "origin:decomposition", "practical:summary",
                     "dialogue:new_concepts", "dialogue:synthesis"],
        },

        capsule: {
          required: ["name:title", "graph:nodes_top", "theses:summary"],
          optional: [
            "graph:edges", "graph:topology", 
            "sum:novelty", "glossary:table", "critique:final_table"
            ],
        },
      };

// ───── [CONTEXT_DEPS_GENETIC] philosynth.html строки 6067–6151 ─────
      const CONTEXT_DEPS_GENETIC = {
        // Диалог — первый после резюме, зависит только от sum
        dialogue: {
          required: ["sum:goals", "sum:portraits", "sum:tensions"],
          optional: ["sum:difficulty"],
        },

        // Глоссарий — извлекает термины из диалога
        theses: {
          required: ["sum:goals", "sum:tensions", "dialogue:new_concepts",
                     "dialogue:turning_points"],
          optional: ["sum:portraits", "dialogue:synthesis"],
        },

        glossary: {
          required: ["sum:goals", "dialogue:new_concepts"],
          optional: ["dialogue:tensions_discovered", "dialogue:synthesis",
                     "theses:summary"],
        },

        // Граф — реконструируется из всего предыдущего
        graph: {
          required: ["sum:goals", "dialogue:new_concepts", "glossary:table",
                     "theses:summary"],
          optional: ["sum:portraits", "sum:tensions", "dialogue:turning_points",
                     "dialogue:synthesis"],
        },

        // Название — после тезисов (граф может отсутствовать)
        name: {
          required: ["sum:goals", "sum:novelty", "glossary:table", "theses:summary"],
          optional: ["sum:coherence", "sum:tensions", "dialogue:new_concepts",
                     "graph:nodes_compact"],
        },

        // Остальные разделы — аналогично архитектурному, но dialogue:new_concepts
        // как первичный источник вместо graph:nodes_compact
        history: {
          required: ["sum:goals", "sum:portraits"],
          optional: ["sum:novelty", "sum:tensions", "dialogue:new_concepts",
                     "theses:summary", "name:title", "graph:nodes_compact"],
        },

        origin: {
          required: ["sum:goals", "sum:portraits", "sum:tensions",
                     "theses:full", "glossary:table"],
          optional: ["sum:novelty", "sum:coherence", "dialogue:new_concepts",
                     "graph:nodes", "graph:edges", "name:title"],
        },

        practical: {
          required: ["sum:goals", "sum:novelty", "theses:summary", "glossary:table"],
          optional: ["dialogue:new_concepts", "graph:nodes_compact", "name:title"],
        },

        evolution: {
          required: ["sum:goals", "sum:novelty", "name:title", "theses:summary"],
          optional: [
            "sum:coherence", "sum:tensions", "glossary:table",
            "dialogue:new_concepts",
            "graph:nodes_compact", "graph:edges", "graph:topology",
            "history:contemporary", "history:genealogy",
          ],
        },

        critique: {
          required: [
            "sum:goals", "sum:portraits", "sum:novelty",
            "sum:tensions", "sum:coherence",
            "glossary:table", "theses:full",
            "dialogue:new_concepts", "dialogue:synthesis",
          ],
          optional: ["graph:nodes", "graph:edges", "graph:topology",
                     "name:title", "history:contemporary",
                     "origin:decomposition", "practical:summary"],
        },

        capsule: {
          required: ["name:title", "theses:summary", "glossary:table"],
          optional: [
            "dialogue:synthesis", "graph:nodes_top", "graph:edges",
            "sum:novelty", "critique:final_table",
          ],
        },
      };

// ───── [CONTEXT_DEPS_LEVEL] philosynth.html строки 6156–6201 ─────
      const CONTEXT_DEPS_LEVEL = {
        transformative: {
          graph: {
            required: ["sum:tensions"],        // напряжения — исходный материал категорий
          },
          glossary: {
            optional: ["sum:portraits", "sum:tensions"],
          },
          theses: {
            required: ["sum:portraits"], 
          },
          origin: {
            required: ["graph:edges"],         // возвращаем в required: генеалогия связей важна
          },
          practical: {
            optional: ["theses:full"],         // полные обоснования полезны при ссылках
          },
          dialogue: {
            required: ["graph:edges"],
            optional: ["glossary:table"],      // точные определения нужны в диалоге о напряжениях
          },
        },

        generative: {
          graph: {
            required: ["sum:portraits", "sum:tensions"],
          },
          glossary: {
            optional: ["sum:portraits"],       // столбец «почему ни один не мог сформулировать»
          },
          theses: {
            required: ["sum:portraits"],  
          },
          origin: {
            required: ["graph:edges"],
            optional: ["theses:summary"],      // дополнительный якорь для декомпозиции
          },
          practical: {
            optional: ["theses:full"],
          },
          dialogue: {
            required: ["graph:edges"],
            optional: ["glossary:table"],
          },
        },
      };

// ───── [CONTEXT_DEPS_LEVEL_GENETIC] philosynth.html строки 6203–6242 ─────
      const CONTEXT_DEPS_LEVEL_GENETIC = {
        transformative: {
          dialogue: {
            required: ["sum:tensions"],  // напряжения — ключевой драйвер диалога
            // НЕ graph:edges (граф ещё не существует)
          },
          glossary: {
            optional: ["sum:portraits", "sum:tensions"],
          },
          theses: {
            required: ["sum:portraits"],  // согласовано с архитектурным
          },
          origin: {
            optional: ["dialogue:turning_points"],
          },
          // graph при генетическом — последний, ему доступно всё
          graph: {
            optional: ["dialogue:tensions_discovered"],
          },
        },

        generative: {
          dialogue: {
            required: ["sum:portraits"],  // ограничения каждого — материал диалога
            // НЕ graph:edges
          },
          glossary: {
            optional: ["sum:portraits"],
          },
          theses: {
            required: ["sum:portraits"],  // согласовано с архитектурным
          },
          origin: {
            optional: ["dialogue:turning_points", "theses:summary"],
          },
          graph: {
            optional: ["dialogue:tensions_discovered"],
          },
        },
      };

// ───── [CONTEXT_DEPS_METHOD] philosynth.html строки 6247–6260 ─────
      const CONTEXT_DEPS_METHOD = {
        hermeneutical: {
          history:   { optional: ["origin:genealogy"] },
          evolution: { optional: ["origin:genealogy"] },
        },
       
        analytical: {
          theses: { optional: ["glossary:table"] },  // формализация тезисов через определения
        },
       
        //deconstructive: {
        //  critique: { optional: ["origin:decomposition"] },
        //},
      };

// ───── [SUBSTITUTION_MAP] philosynth.html строки 6287–6337 ─────
      const SUBSTITUTION_MAP = {
        "graph:nodes": [
          { key: "glossary:table",       q: 2 },
          { key: "origin:decomposition", q: 2 },
          { key: "theses:summary",       q: 1 },
        ],
        "graph:nodes_compact": [
          { key: "glossary:table", q: 2 },
          { key: "theses:summary", q: 1 },
        ],
        "graph:edges": [
          { key: "theses:full",          q: 2 },
          { key: "origin:decomposition", q: 1 }, 
        ],
        "graph:topology": [
          { key: "evolution:graph_changes", q: 1 },
          { key: "critique:full",           q: 1 }, 
        ],
        "glossary:table": [
          { key: "graph:nodes",          q: 2 },
        ],
        "theses:full": [
          { key: "origin:decomposition", q: 3 },
          { key: "dialogue:synthesis",   q: 2 },
        ],
        "theses:summary": [
          { key: "origin:decomposition", q: 2 },
          { key: "graph:nodes",          q: 2 },
          { key: "dialogue:synthesis",   q: 2 },
        ],
        "name:title": [
          { key: "history:name_context",    q: 2 },
          { key: "evolution:name_evolution", q: 1 },
          { key: "sum:goals",               q: 1 },
        ],
        "name:full": [
          { key: "history:name_context",    q: 2 },
          { key: "evolution:name_evolution", q: 2 }, 
          { key: "sum:goals",               q: 1 },
        ],
        "history:genealogy":    [ { key: "origin:genealogy",    q: 3 } ],
        "history:contemporary": [ { key: "evolution:science",   q: 2 } ],
        "history:influence": [
          { key: "evolution:directions",  q: 3 },
          { key: "practical:summary",     q: 2 },
        ],
        "history:name_context": [], 
        "origin:decomposition": [
          { key: "theses:summary",       q: 1 },
        ],
      };

// ───── [SUBSTITUTION_MAP_GENETIC] philosynth.html строки 6339–6404 ─────
      const SUBSTITUTION_MAP_GENETIC = {
        // Диалог → замены (диалог — первый, замен мало)
        "dialogue:new_concepts": [
          { key: "sum:tensions",    q: 2 },
          { key: "sum:portraits",   q: 1 },
        ],
        "dialogue:tensions_discovered": [
          { key: "sum:tensions",    q: 3 },
        ],
        "dialogue:turning_points": [
          { key: "sum:tensions",    q: 2 },
        ],
        "dialogue:synthesis": [
          { key: "sum:novelty",     q: 2 },
        ],
        // Глоссарий → из диалога (не из графа)
        "glossary:table": [
          { key: "theses:summary",        q: 3 },  
          { key: "dialogue:new_concepts", q: 2 },
          { key: "sum:tensions",          q: 1 },
        ],
        // Тезисы → из диалога
        "theses:full": [
          { key: "dialogue:synthesis",    q: 3 },
          { key: "origin:decomposition",  q: 2 },
        ],
        "theses:summary": [
          { key: "dialogue:new_concepts", q: 3 },
          { key: "origin:decomposition",  q: 2 },
        ],
        // Граф → из тезисов/глоссария (граф — последний)
        "graph:nodes": [
          { key: "glossary:table",           q: 3 },
          { key: "theses:summary",           q: 2 },
          { key: "dialogue:new_concepts",    q: 1 },
        ],
        "graph:nodes_compact": [
          { key: "glossary:table",           q: 2 },
          { key: "dialogue:new_concepts",    q: 1 },
        ],
        "graph:edges": [
          { key: "theses:full",              q: 2 },
          { key: "dialogue:turning_points",  q: 1 },
        ],
        "graph:topology": [
          { key: "dialogue:synthesis",       q: 2 },
          { key: "critique:full",            q: 1 },
        ],
        // Название
        "name:title": [
          { key: "history:name_context",    q: 2 },
          { key: "evolution:name_evolution", q: 1 },
          { key: "sum:goals",               q: 1 },
        ],
        "name:full": [
          { key: "history:name_context",    q: 2 },
          { key: "evolution:name_evolution", q: 2 },
          { key: "sum:goals",               q: 1 },
        ],
        // Остальные — из архитектурной карты
        "history:genealogy":    [ { key: "origin:genealogy",    q: 3 } ],
        "history:contemporary": [ { key: "evolution:science",   q: 2 } ],
        "history:influence":    [ { key: "evolution:directions", q: 3 }, { key: "practical:summary", q: 2 } ],
        "history:name_context": [],
        "origin:decomposition": [ { key: "theses:summary",      q: 1 } ],
      };

// ───── [COMPAT_MATRIX_COMPACT] philosynth.html строки 7012–7234 ─────
      const COMPAT_MATRIX_COMPACT = {
       
        "comparative:dialectical": {
          rating: "★", severity: "stable",
          desc: "Сравнительный уровень надёжно работает с любым методом. Диалектический метод даёт наиболее структурированный результат на этом уровне.",
          advice: null, replacements: null, sections_override: null,
        },
        "comparative:integrative": {
          rating: "★", severity: "stable",
          desc: "Сравнительный уровень надёжно работает с любым методом. Интегративный метод оптимален для поиска общих оснований между традициями.",
          advice: null, replacements: null, sections_override: null,
        },
        "comparative:deconstructive": {
          rating: "★", severity: "stable",
          desc: "Сравнительный уровень надёжно работает с любым методом. Деконструктивный метод позволяет вскрыть скрытые предпосылки каждой традиции.",
          advice: null, replacements: null, sections_override: null,
        },
        "comparative:hermeneutical": {
          rating: "★", severity: "stable",
          desc: "Сравнительный уровень надёжно работает с любым методом. Герменевтический метод даёт наиболее контекстуально богатый результат.",
          advice: null, replacements: null, sections_override: null,
        },
        "comparative:analytical": {
          rating: "★", severity: "stable",
          desc: "Сравнительный уровень надёжно работает с любым методом. Аналитический метод обеспечивает максимальную формальную строгость.",
          advice: null, replacements: null, sections_override: null,
        },
        "comparative:creative": {
          rating: "★", severity: "stable",
          desc: "Сравнительный уровень надёжно работает с любым методом. Творческий метод даёт наиболее оригинальные и неожиданные результаты.",
          advice: null, replacements: null, sections_override: null,
        },
       
        "transformative:dialectical": {
          rating: "★★★", severity: "synergy-max",
          desc: "<strong>Структурный резонанс.</strong> Оба параметра разделяют один онтологический жест — продуктивный конфликт как источник нового. «Напряжение» уровня = пара тезис↔антитезис метода. «Рождение нового из невозможности» = снятие. Два языка для одного процесса.",
          advice: "Идеальный выбор, когда философы образуют явные оппозиции и результат должен быть и исторически обоснованным, и логически необходимым.",
          replacements: null,
          sections_override: null,
        },
       
        "transformative:integrative": {
          rating: "✗✗", severity: "hard-conflict",
          desc: "<strong>Жёсткое противоречие.</strong> Преобразующий уровень строится на несовместимости как источнике нового; интегративный метод — на общих основаниях как источнике. Это взаимоисключающие онтологии синтеза. Конфликт затрагивает 5 из 6 ключевых разделов.",
          advice: null,
          replacements: {
            keepLevel: [
              { param: "method", value: "dialectical",    label: "Диалектический",    rating: "★★★" },
              { param: "method", value: "deconstructive",  label: "Деконструктивный",  rating: "★★★" },
              { param: "method", value: "analytical",      label: "Аналитический",     rating: "★★"  },
              { param: "method", value: "creative",        label: "Творческий",        rating: "★★"  },
            ],
            keepMethod: [
              { param: "level", value: "comparative", label: "Сравнительный", rating: "★" },
            ],
          },
          sections_override: {
            sum: "✗✗", graph: "✗✗", theses: "✗✗",
            dialogue: "✗✗", critique: "✗✗", origin: "✗✗",
          },
        },
       
        "transformative:deconstructive": {
          rating: "★★★", severity: "synergy-max",
          desc: "<strong>Структурный резонанс.</strong> «Напряжение между системами» (уровень) возникает именно там, где их скрытые предпосылки несовместимы (метод). Трансформация = деконструкция + пересборка. Встроенный механизм самопроверки.",
          advice: "Выбирайте, когда важна философская честность по отношению к источникам и когда синтез должен демонстрировать, почему исходные системы не могли прийти к результату самостоятельно.",
          replacements: null,
          sections_override: { sum: "★★" },
        },
       
        "transformative:hermeneutical": {
          rating: "✗", severity: "conflict",
          desc: "<strong>Умеренный конфликт.</strong> Преобразующий уровень строит на несовместимости (рождение нового из невозможности), герменевтический метод — на расширении горизонтов (нарастающая совместимость). Конфликт сосредоточен в разделе «Диалог», где два финала несовместимы.",
          advice: "При исключении раздела «Диалог» напряжение снижается до управляемого ≈. При включении диалога — рекомендуется сменить метод.",
          replacements: {
            keepLevel: [
              { param: "method", value: "dialectical",    label: "Диалектический",    rating: "★★★" },
              { param: "method", value: "deconstructive",  label: "Деконструктивный",  rating: "★★★" },
            ],
            keepMethod: [
              { param: "level", value: "comparative", label: "Сравнительный", rating: "★" },
            ],
          },
          sections_override: { dialogue: "✗" },
          orderAdvice: {
            recommended: "genetic",
            strength: "slightly-helps",
            text: "Генетический порядок немного смягчает конфликт: герменевтический круг работает естественнее, когда понимание расширяется в диалоге до формализации. Конфликт финалов (расширение vs. разрыв) остаётся."
          },
        },
       
        "transformative:analytical": {
          rating: "★★", severity: "synergy",
          desc: "<strong>Продуктивный парадокс.</strong> Аналитический метод делает претензии преобразующего уровня верифицируемыми: «эмерджентность» перестаёт быть нарративным утверждением и превращается в результат формального аудита предпосылок.",
          advice: "Выбирайте, когда нужна преобразующая глубина с аналитической строгостью и формальным доказательством эмерджентности.",
          replacements: null,
          sections_override: { name: "★★", practical: "★★" },
          orderAdvice: {
            recommended: "genetic",
            strength: "recommended",
            text: "Генетический порядок усиливает синергию: напряжения обнаруживаются в диалоге, аналитический аппарат затем верифицирует эмерджентность реально возникших категорий, а не подгоняет постфактум."
          },
        },
       
        "transformative:creative": {
          rating: "★★", severity: "synergy",
          desc: "<strong>Продуктивный парадокс.</strong> Преобразующий уровень создаёт категории с неустановленными отношениями. Разрешение творческого метода маркировать связи как гипотетические — это не слабость, а честная онтология нового.",
          advice: "Выбирайте, когда важна свобода в установлении отношений между преобразованными категориями; для синтезов в экспериментальном контексте.",
          replacements: null,
          sections_override: { name: "★★", evolution: "★★" },
          orderAdvice: {
            recommended: "genetic",
            strength: "recommended",
            text: "Генетический порядок усиливает синергию: творческая комбинаторика питается неожиданностями диалога. При архитектурном порядке творчество сводится к декорированию предзаданного каркаса."
          },
        },
       
        "generative:dialectical": {
          rating: "≈", severity: "tension",
          desc: "<strong>Управляемое напряжение.</strong> Напряжение примиримо при условии: «ограничение философа A» = тезис, «ограничение философа B» = антитезис, «порождённая категория» = снятие. Это нетривиальная переинтерпретация диалектических ролей, которую промпт не предписывает явно.",
          advice: "Рекомендуется добавить в поле «Дополнительный контекст» инструкцию: «Интерпретируй ограничения традиций как диалектические полюса, а порождённую категорию — как снятие». Эта инструкция передаётся модели через p.ctx перед каждым разделом.",
          replacements: {
            keepLevel: [
              { param: "method", value: "deconstructive", label: "Деконструктивный", rating: "★★★" },
              { param: "method", value: "analytical",     label: "Аналитический",    rating: "★★★" },
              { param: "method", value: "creative",       label: "Творческий",       rating: "★★"  },
            ],
            keepMethod: [
              { param: "level", value: "transformative", label: "Преобразующий", rating: "★★★" },
            ],
          },
          sections_override: { name: "≈", history: "≈" },
          orderAdvice: {
            recommended: "genetic",
            strength: "recommended",
            text: "Генетический порядок снижает напряжение: проблема артикулируется в диалоге, ограничения философов проявляются как тезис/антитезис органически, а не по предписанию промпта."
          },
        },
       
        "generative:integrative": {
          rating: "✗✗", severity: "hard-conflict",
          desc: "<strong>Максимальный конфликт матрицы.</strong> Порождающий уровень строит категории из проблемы, не из традиций; интегративный метод требует строить из общих оснований традиций. Взаимоисключение тотально — конфликт в 5 из 6 ключевых разделов.",
          advice: null,
          replacements: {
            keepLevel: [
              { param: "method", value: "deconstructive", label: "Деконструктивный", rating: "★★★" },
              { param: "method", value: "analytical",     label: "Аналитический",    rating: "★★★" },
              { param: "method", value: "creative",       label: "Творческий",       rating: "★★"  },
            ],
            keepMethod: [
              { param: "level", value: "comparative", label: "Сравнительный", rating: "★" },
            ],
          },
          sections_override: {
            sum: "✗✗", graph: "✗✗", glossary: "✗",
            theses: "✗✗", dialogue: "✗✗", critique: "✗✗", origin: "✗✗",
          },
        },
       
        "generative:deconstructive": {
          rating: "★★★", severity: "synergy-max",
          desc: "<strong>Максимальный критический потенциал.</strong> Оба параметра разделяют один эпистемологический жест — выявление того, чего не видно изнутри существующих систем. «Слепое пятно» (уровень) = «нераспознанная предпосылка» (метод). Единственная пара, где обе оси независимо требуют доказать невыводимость результата.",
          advice: "Выбирайте для наиболее амбициозных синтезов с высокими претензиями на оригинальность, когда зерно концепции формулирует проблему, которую ни один из философов не мог поставить в рамках своей системы.",
          replacements: null,
          sections_override: { evolution: "★★★" },
        },
       
        "generative:hermeneutical": {
          rating: "✗", severity: "conflict",
          desc: "<strong>Системный конфликт.</strong> Герменевтический метод организует граф вокруг горизонтов традиций, тогда как порождающий уровень запрещает строить категории из традиций. Четыре ключевых раздела получают несовместимые критерии организации содержания.",
          advice: "Рекомендуется избегать. Если герменевтический метод принципиален — снизить уровень до сравнительного или преобразующего.",
          replacements: {
            keepLevel: [
              { param: "method", value: "deconstructive", label: "Деконструктивный", rating: "★★★" },
              { param: "method", value: "analytical",     label: "Аналитический",    rating: "★★"  },
              { param: "method", value: "creative",       label: "Творческий",       rating: "★★"  },
            ],
            keepMethod: [
              { param: "level",  value: "comparative",   label: "Сравнительный",  rating: "★" },
              {
                param: "level",  value: "transformative", label: "Преобразующий",  rating: "✗",
                note: "Конфликт менее острый, чем с порождающим уровнем, но всё равно не рекомендуется.",
              },
            ],
          },
          sections_override: {
            graph: "✗", glossary: "✗", dialogue: "✗", critique: "✗", origin: "✗",
          },
          orderAdvice: {
            recommended: "genetic",
            strength: "slightly-helps",
            text: "Генетический порядок немного смягчает конфликт: герменевтическое " +
                  "понимание естественнее формируется в диалоге. Структурное " +
                  "противоречие (горизонты vs. проблема) остаётся."
          },
        },
       
        "generative:analytical": {
          rating: "★★★", severity: "synergy-max",
          desc: "<strong>Нарастающая синергия.</strong> Порождающий уровень заявляет о невыводимости из традиций — аналитический метод предоставляет формальный аппарат для доказательства. Пики синергии (★★★) в тезисах и критике, где нужно верифицировать претензии.",
          advice: "Выбирайте, когда синтез претендует на подлинную новизну и должен это доказать формально; для аудитории, ориентированной на аналитическую традицию.",
          replacements: null,
          sections_override: { history: "★" },
        },
       
        "generative:creative": {
          rating: "★★", severity: "synergy",
          desc: "<strong>Пики в открытых разделах.</strong> Оба параметра отказываются от закрытого финала: уровень нащупывает контуры нового языка, метод производит карту вопросов. Единственная комбинация, где оба параметра явно не требуют завершённого синтеза.",
          advice: "Для максимально экспериментальных синтезов, когда ценность — в постановке новых вопросов, а не в закрытой системе.",
          replacements: null,
          sections_override: {
            glossary: "★★★", dialogue: "★★★",
            name: "★★", evolution: "★★",
          },
          orderAdvice: {
            recommended: "genetic",
            strength: "recommended",
            text: "Генетический порядок усиливает синергию: открытый диалог " +
                  "порождает вопросы, творческий метод картографирует их. " +
                  "Наиболее органичная последовательность для этой пары."
          },
        },
      };

// ───── [COMPAT_SEC_LABELS] philosynth.html строки 7318–7322 ─────
      const COMPAT_SEC_LABELS = {
        sum: "Резюме", graph: "Граф", glossary: "Глоссарий", theses: "Тезисы",
        dialogue: "Диалог", critique: "Критика", name: "Название", history: "История",
        practical: "Практика", evolution: "Эволюция", origin: "Происхождение"
      };

// ───── [INTRA_DEPS] philosynth.html строки 9493–9560 ─────
      const INTRA_DEPS = {
        sum: {
          "Новизна и ценность": ["Портрет каждого философа"],
          "Структура документа": ["Цели и метод"],
          "Индекс когерентности": ["Портрет каждого философа", "Точки напряжения"],
          "Оценка сложности": ["Точки напряжения", "Индекс когерентности"],
        },
        graph: {
          "Таблица категорий": ["Методология построения графа"],
          "Таблица связей": ["Таблица категорий"],
          "Топология графа": ["Таблица категорий", "Таблица связей"],
          "Топологическая таблица": ["Топология графа"],
        },
        glossary: {
          // Доп. секции зависят от «Таблица определений»
          "Переопределённые термины": ["Таблица определений"],
          "Заимствованные термины": ["Таблица определений"],
          "Новые термины": ["Таблица определений"],
          "Преобразованные термины": ["Таблица определений"],
          "Эмерджентные термины": ["Таблица определений"],
          "Термины, преодолевающие ограничения": ["Таблица определений"],
          "Термины, порождённые проблемой": ["Таблица определений"],
        },
        theses: {
          "Сводная таблица тезисов": ["Онтологические тезисы", "Эпистемологические тезисы", "Этические и аксиологические тезисы"],
        },
        name: {
          "Сравнительный анализ вариантов": ["Таблица вариантов названия"],
          "Итоговая рекомендация": ["Сравнительный анализ вариантов"],
        },
        history: {
          "Генеалогия идей": ["Исторический контекст", "Источники влияния"],
          "Современные концепции": ["Генеалогия идей"],
          "Потенциальное влияние": ["Современные концепции"],
          "Название в историческом контексте": ["Генеалогия идей", "Исторический контекст"]
        },
        origin: {
          "Элементная декомпозиция": ["Идентификация родительских традиций"],
          "Оценка оригинальности": ["Элементная декомпозиция"],
          "Потенциальные возражения": ["Элементная декомпозиция", "Оценка оригинальности"],
        },
        practical: {
          "Сводная таблица": ["Образование", "Этика и принятие решений", "Психология и личностное развитие", "Социальные институты", "Межкультурный диалог"],
        },
        dialogue: {
          "Итоговая таблица диалога": ["Межфилософский диалог"],
          "Аналитический комментарий": ["Межфилософский диалог", "Итоговая таблица диалога"],
        },
        evolution: {
          "Предлагаемые изменения графа": ["Направления развития"],
          "Эволюция названия": ["Направления развития"],
          "Интеграция с современной наукой": ["Направления развития"],
          "Временная карта развития": ["Направления развития", "Предлагаемые изменения графа"],
        },
        critique: {
          "Философская новизна": ["Внутренняя когерентность"],
          "Эмерджентность концепции": ["Внутренняя когерентность"],
          "Проблемная генерация": ["Внутренняя когерентность"],
          "Верность методу синтеза": ["Внутренняя когерентность"],
          "Сохранение ценных аспектов": ["Внутренняя когерентность"],
          "Разрешение противоречий": ["Внутренняя когерентность"],
          "Слепые пятна": ["Разрешение противоречий"],
          "Итоговая оценка": ["Внутренняя когерентность", "Слепые пятна",
                       "Межслойная согласованность"],
          "Рекомендации по улучшению": ["Итоговая оценка"],
        },
        capsule: {},
      };

// ───── [SUBSECTION_TO_CTX_KEYS] philosynth.html строки 9606–9678 ─────
      const SUBSECTION_TO_CTX_KEYS = {
        "graph": {
          "Таблица категорий":     ["graph:nodes", "graph:nodes_top"],
          "Таблица связей":        ["graph:edges"],
          "Топология графа":       ["graph:topology"],
          "Топологическая таблица":["graph:topology"],
        },
        "glossary": {
          "Таблица определений":   ["glossary:table"],
        },
        "theses": {
          "Онтологические тезисы":               ["theses:full", "theses:summary"],
          "Эпистемологические тезисы":            ["theses:full", "theses:summary"],
          "Этические и аксиологические тезисы":   ["theses:full", "theses:summary"],
          "Сводная таблица тезисов":              ["theses:summary"],
        },
        "name": {
          "Итоговая рекомендация": ["name:title", "name:full"],
        },
        "sum": {
          "Цели и метод":          ["sum:goals"],
          "Портрет каждого философа":["sum:portraits"],
          "Новизна и ценность":    ["sum:novelty"],
          "Точки напряжения":      ["sum:tensions"],
          "Индекс когерентности":  ["sum:coherence"],
          "Оценка сложности":      ["sum:difficulty"],
        },
        "history": {
          "Исторический контекст":            [],  // не поставляет контекстных ключей
          "Источники влияния":                [],
          "Генеалогия идей":                  ["history:genealogy"],
          "Современные концепции":            ["history:contemporary"],
          "Потенциальное влияние":            ["history:influence"],
          "Название в историческом контексте":["history:name_context"],
        },
        "origin": {
          "Идентификация родительских традиций": ["origin:genealogy"],
          "Элементная декомпозиция":            ["origin:decomposition"],
          "Оценка оригинальности":             ["origin:novelty"],
          "Потенциальные возражения":           [],
        },
        "evolution": {
          "Направления развития":              ["evolution:directions"],
          "Предлагаемые изменения графа":      ["evolution:graph_changes"],
          "Эволюция названия":                 ["evolution:name_evolution"],
          "Интеграция с современной наукой":    ["evolution:science"],
          "Временная карта развития":           [],
        },
        "dialogue": {
          "Межфилософский диалог":             ["dialogue:new_concepts", "dialogue:turning_points"],
          "Итоговая таблица диалога":          ["dialogue:new_concepts", "dialogue:tensions_discovered"],
          "Аналитический комментарий":          ["dialogue:synthesis", "dialogue:tensions_discovered"],
        },
        "practical": {
          "Образование":                        [],
          "Этика и принятие решений":           [],
          "Психология и личностное развитие":   [],
          "Социальные институты":               [],
          "Межкультурный диалог":               [],
          "Сводная таблица":                    ["practical:summary"],
        },
        "critique": {
          "Внутренняя когерентность":           [],
          // Динамические пункты 2, 3 — не поставляют контекстных ключей
          "Верность методу синтеза":            [],
          "Сохранение ценных аспектов":         [],
          "Разрешение противоречий":            [],
          "Слепые пятна":                       [],
          "Межслойная согласованность":         [],
          "Итоговая оценка":                    ["critique:final_table"],
          "Рекомендации по улучшению":          [],
        },
      };

// ───── [TOPOLOGY_ROLES_PROCEDURAL] philosynth.html строки 8778–8817 ─────
      const TOPOLOGY_ROLES_PROCEDURAL = {
        dialectical:
      `тезис | антитезис | синтез
      Прочие роли ЗАПРЕЩЕНЫ. 
      Правило: «тезис» и «антитезис» не могут одновременно принадлежать одному узлу в рамках одного диалектического движения. Каждая синтетическая категория, снимающая противоречие, обязана иметь роль «синтез».
      Каждая категория должна получить ровно одну из этих ролей.`,
      
        deconstructive:
      `деконструированная | пересобранная
      Прочие роли ЗАПРЕЩЕНЫ. 
      Каждая категория должна получить ровно одну из этих ролей.`,
      
        integrative:
      `синтез | интегрирующая | основание
      Прочие роли ЗАПРЕЩЕНЫ. 
      «синтез» — категория, в которой достигнуто слияние ≥ 2 традиций на общем основании.
      «интегрирующая» — категория, которая активно обеспечивает связывание элементов из разных традиций (не результат, а инструмент интеграции).
      «основание» — категория, фиксирующая общее основание, из которого растут интегративные связи.
      Каждая категория должна получить ровно одну из этих ролей.`,
      
        hermeneutical:
      `синтез | расширение горизонта | предгоризонт
      Прочие роли ЗАПРЕЩЕНЫ.
      «синтез» — категория, являющаяся результатом полного слияния горизонтов (Horizontverschmelzung): она невыводима ни из одного горизонта по отдельности.
      «расширение горизонта» — категория, в которой один горизонт расширен через встречу с другим, но преобладающий исходный горизонт ещё опознаваем.
      «предгоризонт» — категория, фиксирующая условие возможности слияния: она описывает то напряжение или ту структуру, без которой слияние не состоялось бы.
      Каждая категория должна получить ровно одну из этих ролей.`,
      
        analytical:
      `синтез | формализованная | верифицирующая
      Прочие роли ЗАПРЕЩЕНЫ. 
      «синтез» — категория, в которой логические структуры нескольких традиций интегрированы в непротиворечивое целое.
      «формализованная» — категория, полученная путём формальной экспликации и уточнения понятия одной или нескольких традиций (экспликат).
      «верифицирующая» — категория, функция которой — проверка когерентности и непротиворечивости остальных категорий синтеза.
      Каждая категория должна получить ровно одну из этих ролей.`,
      
        creative:
      `тезис | антитезис | синтез | деконструированная | пересобранная | интегрирующая | основание | расширение горизонта | предгоризонт | формализованная | верифицирующая
      Правило: при использовании терминов из разных методических словарей на одном узле — обоснование в описательной части обязательно.`,
      };

// ───── [FRAGMENT_SHARE] philosynth.html строки 7566–7622 ─────
      const FRAGMENT_SHARE = {
      // ── Резюме (все фрагменты — прямая экстракция) ──
      "sum:goals":       0.12,
      "sum:portraits":   0.16,
      "sum:novelty":     0.10,
      "sum:tensions":    0.08,
      "sum:coherence":   0.08,
      "sum:difficulty":  0.13,

      // ── Граф (таблицы извлекаются через tableToText) ──
      "graph:nodes":     0.23,
      "graph:nodes_compact": 0.14,
      "graph:nodes_top":  0.15,
      "graph:edges":     0.18,
      "graph:topology":  0.19,

      // ── Глоссарий (extractGlossaryCompact — только 2 столбца!) ──
      "glossary:table":  0.27,

      // ── Тезисы (full обрезается truncateText до 6000) ──
      "theses:full":     0.15,
      "theses:summary":  0.11,

      // ── Название (extractNameTitle) ──
      "name:title":      0.23,
      "name:full":       0.21,

      // ── История ──
      "history:contemporary":  0.19,
      "history:genealogy":     0.22,
      "history:influence":     0.14,
      "history:name_context":  0.18,

      // ── Происхождение ──
      "origin:decomposition":  0.14,
      "origin:genealogy":      0.20,
      "origin:novelty":        0.18,

      // ── Эволюция ──
      "evolution:directions":     0.29,
      "evolution:graph_changes":  0.18,
      "evolution:name_evolution": 0.13,
      "evolution:science":        0.20,

      // ── Диалог ──
      "dialogue:synthesis":  0.17,
      "dialogue:new_concepts":         0.5,
      "dialogue:tensions_discovered":  0.3,
      "dialogue:turning_points":       0.4,
      "dialogue:synthesis":            0.3,

      // ── Практика ──
      "practical:summary":   0.17,

      // ── Критика ──
      "critique:final_table": 0.17,
    };

// ───── [CONTEXT_BUDGET] philosynth.html строки 7529–7534 ─────
      const CONTEXT_BUDGET = {
        overview: 24000,
        standard: 48000,
        deep: 72000,
        exhaustive: 100000,
      };

// ───── [PARENT_FIELD_ORDER] philosynth.html строки 9873–9891 ─────
      const PARENT_FIELD_ORDER = [
        "capsule", "goals", "portraits", "tensions",
        "graphNodes", "graphEdges",
        "dialogueConcepts", "dialogueSynthesis",
        "glossaryCompact", "thesesSummary",
      ];

      const PARENT_FIELD_LABELS = {
        capsule:            "КАПСУЛА",
        goals:              "ЦЕЛИ И МЕТОД",
        portraits:          "ПОРТРЕТЫ ФИЛОСОФОВ",
        tensions:           "НАПРЯЖЕНИЯ",
        graphNodes:         "КАТЕГОРИИ (из графа)",
        graphEdges:         "СВЯЗИ (из графа)",
        dialogueConcepts:   "ПОНЯТИЯ (из диалога)",
        dialogueSynthesis:  "АНАЛИТИЧЕСКИЙ КОММЕНТАРИЙ К ДИАЛОГУ",
        glossaryCompact:    "ТЕРМИНЫ",
        thesesSummary:      "ТЕЗИСЫ",
      };

// ───── [PARENT_FIELD_LABELS] philosynth.html строки 9880–9891 ─────
      const PARENT_FIELD_LABELS = {
        capsule:            "КАПСУЛА",
        goals:              "ЦЕЛИ И МЕТОД",
        portraits:          "ПОРТРЕТЫ ФИЛОСОФОВ",
        tensions:           "НАПРЯЖЕНИЯ",
        graphNodes:         "КАТЕГОРИИ (из графа)",
        graphEdges:         "СВЯЗИ (из графа)",
        dialogueConcepts:   "ПОНЯТИЯ (из диалога)",
        dialogueSynthesis:  "АНАЛИТИЧЕСКИЙ КОММЕНТАРИЙ К ДИАЛОГУ",
        glossaryCompact:    "ТЕРМИНЫ",
        thesesSummary:      "ТЕЗИСЫ",
      };

// ───── [PARENT_DEPS_BASE] philosynth.html строки 9896–9921 ─────
      const PARENT_DEPS_BASE = {
        sum:       { required: ["capsule","goals","tensions","thesesSummary","graphNodes"],
                     optional: ["graphEdges","glossaryCompact","dialogueSynthesis","portraits"] },
        graph:     { required: ["capsule","graphNodes","graphEdges"],
                     optional: ["glossaryCompact","thesesSummary","tensions"] },
        glossary:  { required: ["capsule","glossaryCompact","graphNodes"],
                     optional: ["tensions","thesesSummary"] },
        theses:    { required: ["capsule","thesesSummary","graphNodes","graphEdges","glossaryCompact"],
                     optional: ["tensions","goals"] },
        name:      { required: ["capsule","goals"],
                     optional: ["thesesSummary","graphNodes"] },
        history:   { required: ["capsule","goals","portraits"],
                     optional: ["thesesSummary","tensions"] },
        origin:    { required: ["capsule","goals","portraits","tensions","thesesSummary"],
                     optional: ["graphNodes","glossaryCompact"] },
        practical: { required: ["capsule","goals","thesesSummary"],
                     optional: ["glossaryCompact","graphNodes"] },
        dialogue:  { required: ["capsule","tensions","thesesSummary","graphNodes"],
                     optional: ["goals","dialogueSynthesis","portraits"] },
        evolution: { required: ["capsule","goals","thesesSummary"],
                     optional: ["graphNodes","graphEdges","tensions"] },
        critique:  { required: ["capsule","goals","portraits","tensions","thesesSummary","graphNodes","graphEdges","glossaryCompact"],
                     optional: ["dialogueSynthesis","dialogueConcepts"] },
        capsule:   { required: ["capsule","goals","thesesSummary"],
                     optional: ["graphNodes","glossaryCompact"] },
      };

// ───── [PARENT_DEPS_GENETIC] philosynth.html строки 9927–9942 ─────
      const PARENT_DEPS_GENETIC = {
        dialogue: { required: ["tensions","thesesSummary","dialogueConcepts"],
                    optional: ["goals","dialogueSynthesis"] },
        theses:   { required: ["dialogueConcepts","dialogueSynthesis"],
                    optional: ["tensions","goals"] },
        glossary: { required: ["dialogueConcepts"],
                    optional: ["tensions"] },
        graph:    { required: ["dialogueConcepts","thesesSummary"],
                    optional: ["tensions"] },
        critique: { required: ["dialogueSynthesis","dialogueConcepts"],
                    optional: [] },
        capsule:  { required: ["dialogueSynthesis"],
                    optional: ["dialogueConcepts"] },
        name:     { required: [],
                    optional: ["dialogueConcepts","dialogueSynthesis"] },
      };

// ───── [PARENT_DEPS_LEVEL] philosynth.html строки 9947–9967 ─────
      const PARENT_DEPS_LEVEL = {
        transformative: {
          graph:     { required: ["tensions","graphEdges"] },
          glossary:  { required: ["tensions"] },
          theses:    { required: ["tensions"], optional: ["portraits"] },
          origin:    { required: ["tensions"] },
          dialogue:  { required: ["graphEdges"], optional: ["tensions"] },
          critique:  { required: ["tensions"] },           // в BASE уже есть; deepMergeUniq дедуп.
          evolution: { optional: ["tensions"] },
        },

        generative: {
          graph:     { required: ["portraits","tensions"] },
          glossary:  { optional: ["portraits"] },
          theses:    { required: ["portraits"] },
          origin:    { required: ["portraits"], optional: ["thesesSummary"] },
          dialogue:  { required: ["portraits"], optional: ["tensions"] },
          critique:  { required: ["portraits"] },          // в BASE уже есть; дедуп.
          practical: { optional: ["thesesSummary"] },      // в BASE уже required; дедуп.
        },
      };

// ───── [PARENT_DEPS_LEVEL_GENETIC] philosynth.html строки 9972–9990 ─────
      const PARENT_DEPS_LEVEL_GENETIC = {
        transformative: {
          dialogue:  { required: ["tensions"] },           // драйвер диалога
          glossary:  { required: ["tensions"] },
          theses:    { required: ["tensions"], optional: ["portraits"] },
          origin:    { required: ["tensions"] },
          graph:     { required: ["tensions"], optional: ["graphEdges"] },
          critique:  { required: ["tensions"] },
        },

        generative: {
          dialogue:  { required: ["portraits"], optional: ["tensions"] },
          glossary:  { optional: ["portraits"] },
          theses:    { required: ["portraits"] },
          origin:    { required: ["portraits"], optional: ["thesesSummary"] },
          graph:     { required: ["portraits"], optional: ["tensions"] },
          critique:  { required: ["portraits"] },
        },
      };

// ───── [PARENT_DEPS_METHOD] philosynth.html строки 9995–10018 ─────
      const PARENT_DEPS_METHOD = {
        hermeneutical: {
          evolution: { optional: ["portraits"] },
        },

        analytical: {
          origin:    { required: ["glossaryCompact"] },
          theses:    { required: ["thesesSummary"] },      // уже required в BASE, дедуп.
        },

        dialectical: {
        },

        integrative: {
          origin:    { required: ["portraits"] },
          history:   { required: ["portraits"] },          // уже required в BASE, дедуп.
          critique:  { required: ["portraits"] },          // уже required в BASE, дедуп.
        },

        deconstructive: {
          critique:  { required: ["thesesSummary","goals"] },
          origin:    { required: ["thesesSummary"] },      // уже required в BASE, дедуп.
        },
      };

// ───── [PARENT_INTRA_DEPS] philosynth.html строки 10023–10050 ─────
      const PARENT_INTRA_DEPS = {
        graph: {
          "Методология построения графа":  { required: ["capsule","goals"] },
          "Таблица категорий":             { required: ["capsule","graphNodes","tensions"] },
          "Таблица связей":                { required: ["graphNodes","graphEdges"] },
          "Топология графа":               { required: ["graphEdges"], optional: ["graphNodes"] },
          "Топологическая таблица":        { required: ["graphEdges"], optional: ["graphNodes"] },
        },
        theses: {
          "Онтологические тезисы":            { required: ["capsule","graphNodes","thesesSummary"] },
          "Эпистемологические тезисы":         { required: ["capsule","graphNodes","thesesSummary"] },
          "Этические и аксиологические тезисы":{ required: ["capsule","thesesSummary"] },
          "Сводная таблица тезисов":          { required: ["thesesSummary"] },
        },
        critique: {
          "Внутренняя когерентность":        { required: ["capsule","thesesSummary"] },
          "Философская новизна":              { required: ["capsule","portraits"] },
          "Эмерджентность концепции":         { required: ["graphNodes","graphEdges","tensions"] },
          "Проблемная генерация":             { required: ["capsule","tensions"] },
          "Верность методу синтеза":          { required: ["capsule"] },
          "Сохранение ценных аспектов":       {},   // полный section-уровневый набор
          "Разрешение противоречий":          { required: ["tensions","thesesSummary"] },
          "Слепые пятна":                     { required: ["capsule","portraits","goals"] },
          "Межслойная согласованность":       { required: ["thesesSummary"] },
          "Итоговая оценка":                   {},   // полный section-уровневый
          "Рекомендации по улучшению":         { required: ["capsule"] },
        },
      };

// ───── [MD_BY_CARD] philosynth.html строки 4428–4471 ─────
      const MD_BY_CARD = {
        multi: {
          dialectical:
            "Движение от тезиса к антитезису и к синтезу — обнаружение внутренних противоречий между традициями и их снятие в новом единстве",
          integrative:
            "Поиск общих оснований, скрытых точек пересечения и взаимодополняющих элементов между выбранными традициями",
          deconstructive:
            "Разбор базовых предпосылок каждой традиции, обнаружение скрытых допущений и пересборка из очищенных элементов",
          hermeneutical:
            "Погружение в горизонт понимания каждой традиции и расширение собственного горизонта через слияние перспектив",
          analytical:
            "Формализация ключевых положений, выявление логической структуры и построение непротиворечивого синтеза",
          creative:
            "Свободная комбинаторика идей с упором на оригинальность, неожиданные связи и порождающий потенциал",
        },
        single: {
          dialectical:
            "Движение от тезиса к антитезису и к синтезу — внутреннее диалектическое развитие исходной позиции, обнаружение её внутренних противоречий (в том числе в свете зерна концепции) и их снятие в новом единстве",
          integrative:
            "Поиск общих оснований и взаимодополняющих элементов между исходной позицией и проблемным полем, заданным зерном; интеграция с соседними философскими горизонтами, на которые опирается зерно",
          deconstructive:
            "Разбор базовых предпосылок исходной позиции, обнаружение её скрытых допущений в свете зерна и пересборка из очищенных элементов",
          hermeneutical:
            "Погружение в горизонт понимания исходной позиции и его расширение через последовательное вчитывание зерна концепции",
          analytical:
            "Формализация ключевых положений исходной позиции, уточнение их в свете зерна концепции и построение непротиворечивого развития",
          creative:
            "Свободная комбинаторика идей исходной позиции и тем, заданных зерном, с упором на оригинальность и порождающий потенциал",
        },
        none: {
          dialectical:
            "Движение от тезиса к антитезису и к синтезу — обнаружение внутренних противоречий внутри проблемного поля, задаваемого зерном, и их снятие в новом единстве",
          integrative:
            "Поиск общих оснований, скрытых точек пересечения и взаимодополняющих элементов в проблемном поле, задаваемом зерном",
          deconstructive:
            "Разбор базовых предпосылок, лежащих в основании проблемы, обнаружение скрытых допущений и пересборка из очищенных элементов",
          hermeneutical:
            "Погружение в горизонт понимания, задаваемый зерном, и расширение этого горизонта через последовательную интерпретацию",
          analytical:
            "Формализация ключевых положений, выявление логической структуры и построение непротиворечивой концепции из зерна",
          creative:
            "Свободная комбинаторика идей с упором на оригинальность, неожиданные связи и порождающий потенциал",
        },
      };

// ───── [SD_BY_CARD] philosynth.html строки 4496–4521 ─────
      const SD_BY_CARD = {
        multi: {
          comparative:
            "Категории заимствуются из исходных философов с переопределением, дополняются синтетическими",
          transformative:
            "Каждая категория обязана возникать из напряжения между минимум двумя философами, прямое заимствование запрещено",
          generative:
            "Категории порождаются проблемой, а не философами; философы — источники ограничений, которые синтез преодолевает",
        },
        single: {
          comparative:
            "Категории заимствуются из исходной позиции с переопределением и уточнением в свете зерна концепции, дополняются синтетическими",
          transformative:
            "Каждая категория обязана возникать из напряжения между исходной позицией и проблемным полем, задаваемым зерном; прямое заимствование без переосмысления запрещено",
          generative:
            "Категории порождаются проблемой (зерном), а не исходной позицией; исходная позиция — источник ограничений, которые синтез преодолевает",
        },
        none: {
          comparative:
            "Категории разрабатываются через сопоставление нескольких возможных трактовок зерна, с переопределением ключевых понятий и построением синтетического каркаса",
          transformative:
            "Каждая категория обязана возникать из напряжения между минимум двумя различимыми трактовками/горизонтами в поле зерна; прямое заимствование из одной узнаваемой традиции запрещено",
          generative:
            "Категории порождаются проблемой (зерном), а не готовыми системами; философские традиции — лишь источники ограничений, которые синтез преодолевает",
        },
      };

// ───── [MODE_DEPS] philosynth.html строки 22543–22556 ─────
      const MODE_DEPS = {
        adversarial: {
          required: ["capsule:full", "theses:summary", "critique:final_table"],
          optional: ["graph:nodes", "theses:full"],
        },
        translator: {
          required: ["capsule:full", "graph:nodes", "glossary:table"],
          optional: ["theses:summary"],
        },
        timeslice: {
          required: ["capsule:full"],
          optional: ["history:genealogy", "history:contemporary"],
        },
      };

// ───── [_EXTRA_CATEGORY_TYPES] philosynth.html строки 8951–8958 ─────
      const _EXTRA_CATEGORY_TYPES = {
        hermeneutical: ["лингвистическая", "герменевтическая"],
        analytical:    ["аналитическая", "лингвистическая"],
        creative:      ["лингвистическая", "герменевтическая", "аналитическая", "междисциплинарная"],
        dialectical:   [],
        integrative:   [],
        deconstructive:["аналитическая"],
      };

// ───── [_EXTRA_EDGE_TYPES] philosynth.html строки 8959–8970 ─────
      const _EXTRA_EDGE_TYPES = {
        analytical:    ["дедуктивная", "индуктивная", "абдуктивная", "необходимое условие",
                        "достаточное условие", "тождество", "обобщение", "конкретизация"],
        hermeneutical: ["понимание", "мышление", "выражение"],
        creative:      ["конъюнктивная", "дизъюнктивная", "необходимое условие", "достаточное условие",
                        "тождество", "аналогия", "реализация", "конкретизация", "обобщение",
                        "дедуктивная", "индуктивная", "абдуктивная", "временная", "концептуальная",
                        "выражение", "понимание", "мышление"],
        dialectical:   [],
        integrative:   ["аналогия"],
        deconstructive:["аналогия", "обобщение"],
      };

// ───── [_SYNTH_LEVEL_TYPE_PHRASING] philosynth.html строки 8971–8975 ─────
      const _SYNTH_LEVEL_TYPE_PHRASING = {
        comparative:    "При необходимости также допускаются: ",
        transformative: "Наряду с основными также допускаются: ",
        generative:     "",  // пустой = включаются в основной список
      };

// ───── [buildSYS] philosynth.html строки 8590–8647 ─────
      function buildSYS(p, opts) {
        opts = opts || {};
        const outputMode =
          opts.outputMode === "subsection" ? "subsection" :
          opts.outputMode === "mode"       ? "mode"       : "full";
        const philList = p?.phil?.length ? p.phil.join(", ") : "";
      const lang = p?.lang || "Russian";
      const langInstruction = lang === "Russian" ? "" :
  `CRITICAL OUTPUT LANGUAGE INSTRUCTION: You MUST generate ALL your output strictly in ${lang}. ` +
  `This includes concept names, descriptions, analyses, tables, callouts, and every other piece of visible text. ` +
  `The language of this system prompt (Russian) is IRRELEVANT to your output language. ` +
  `Translate philosopher names according to the conventions of ${lang}. ` +
  `CRITICAL STRUCTURAL RULE: The data-section attribute values MUST remain EXACTLY as specified in this prompt (in Russian). ` +
  `These are machine-readable keys used by the application code — DO NOT translate them. ` +
  `Only the visible <h4> heading text inside the <div data-section="..."> should be translated. ` +
  `Example: <div data-section="Переопределённые термины"><h4>Redefined Terms</h4>...</div> — ` +
  `the attribute stays in Russian, the visible heading is in ${lang}. ` +
  `The data-section attribute MUST be present on every named section without exception.\n\n`;

      return langInstruction +  `Ты — ведущий специалист по синтезу философских концепций и архитектор философских систем. Ты создаёшь ИСКЛЮЧИТЕЛЬНО строго структурированные академические документы высочайшего качества. Педантичный академический тон. Каждое утверждение обосновано. Каждый термин определён. Каждый тезис аргументирован. Ты обладаешь глубокими знаниями истории философии от досократиков до современности, включая восточную и русскую философские традиции. Ты умеешь находить неочевидные связи между традициями, выявлять скрытые общие основания и порождать подлинно новые идеи из синтеза существующих. При этом ты строго различаешь подлинную новизну от переименования существующего. Ты уважаешь каждую традицию и не искажаешь позиции философов при синтезе. Все ссылки на предыдущие разделы документа — явные, по номерам §§ и названиям категорий.
      
      ФОРМАТИРОВАНИЕ — используй исключительно следующие HTML-теги:
      - <div class="doc-section"> — обёртка раздела
      - <div class="section-num">§ N</div> — номер раздела
      - <div class="section-title">Название</div> — заголовок
      - <div class="doc-content">...</div> — содержимое
      - <div data-section="Название секции"><h4>Название секции</h4>...содержимое...</div> — именованная секция внутри doc-content. Атрибут data-section ОБЯЗАТЕЛЕН и содержит ТОЧНОЕ название секции из задания. Тег <h4> внутри него — визуальный заголовок секции.
      - <h5>Подзаголовок</h5> — дополнительные подзаголовки ВНУТРИ секции (например, для кластеров, подпунктов). НЕ используй <h4> для этой цели — <h4> зарезервирован ИСКЛЮЧИТЕЛЬНО для заголовков именованных секций внутри <div data-section>.
      - <p>Абзац</p> — текстовые абзацы
      - <ul><li>...</li></ul> или <ol><li>...</li></ol> — списки
      - <strong>текст</strong> — выделение важного
      - <em>текст</em> — критические предупреждения (красный)
      - <table class="doc-table"><thead><tr><th>...</th></tr></thead><tbody><tr><td>...</td></tr></tbody></table> — таблицы
      - <div class="callout warning"><span class="callout-label">МЕТКА</span>текст</div> — предупреждение
      - <div class="callout note"><span class="callout-label">МЕТКА</span>текст</div> — примечание
      - <div class="callout gold"><span class="callout-label">МЕТКА</span>текст</div> — рекомендация
      - <span class="risk high">ВЫСОКИЙ</span> / <span class="risk medium">СРЕДНИЙ</span> / <span class="risk low">НИЗКИЙ</span>
      
      ТРЕБОВАНИЯ К КАЧЕСТВУ:
      - Каждый раздел — не менее указанного в задании количества слов содержательного текста
      - Таблицы — подробные, с реальным наполнением применительно к данному конкретному синтезу и выбранным участникам
      - Абсолютно серьёзный академический тон. Никаких упрощений и поверхностных обобщений
      - Все ссылки на предыдущие разделы — ЯВНЫЕ, по номерам §§ и названиям категорий (например: «как определено в §3 настоящего документа», «категория "X" из §2»)
      - Для каждого утверждения — обоснование. Для каждой оценки — аргументация` +
      (philList ? `\n- Каждый участник (${philList}) должен быть представлен корректно, без искажения его позиции` : "") +
      `
      
      ` + (outputMode === "subsection"
        ? `Отвечай ТОЛЬКО HTML одного именованного подраздела в виде <div data-section="...">...</div>. ` +
          `БЕЗ внешней обёртки <div class="doc-section">, БЕЗ <div class="section-num">, БЕЗ <div class="section-title">, ` +
          `БЕЗ <div class="doc-content"> — только сам <div data-section>. Никакого текста вне этого HTML-элемента.`
        : outputMode === "mode"
        ? `Формат итогового HTML-ответа задан в инструкциях ниже («СТРУКТУРА ОТВЕТА» / «Отвечай HTML:…»). ` +
          `Следуй им дословно. БЕЗ внешней обёртки <div class="doc-section">, БЕЗ <div class="section-num">, ` +
          `БЕЗ <div class="section-title"> (они не нужны для этого формата вывода). ` +
          `Никакого текста вне указанного в задании HTML-элемента.`
        : `Отвечай ТОЛЬКО HTML начиная с <div class="doc-section">. Никакого текста вне HTML-разметки.`);
      }

// ───── [buildSectionDefs] philosynth.html строки 10742–11515 ─────
      function buildSectionDefs(p) {
        const d = [];
        let n = 1;

        // ═══════════════════════════════════════
        // SUM — всегда первый
        // ═══════════════════════════════════════
        const sumParts = {
          preamble: `Составь § — ИСПОЛНИТЕЛЬНОЕ РЕЗЮМЕ СИНТЕЗА.

Содержательное описание целей, стратегии и ожидаемых результатов синтеза.`,
          preamble_short: `Раздел «Исполнительное резюме синтеза». Педантичный академический тон.`,
          intro: `Оформи ТОЧНО следующие секции (каждую — в <div data-section="..."> согласно правилам форматирования):`,
          subsections: [
            { name: "Цели и метод",
              body: `Зачем создаётся данный синтез, какую философскую проблему он призван решить. Описание выбранного метода (${ML[p.method]} — ${mdText(p, p.method)}) и уровня (${SL[p.synthLevel]} — ${sdText(p, p.synthLevel)}) и его применимости ${
                hasNoParticipants(p)
                  ? "к развёртыванию зерна концепции в отсутствие именованных участников-источников"
                  : "к данному набору философских систем"
              }.

              ${METHOD_SUM(p)[p.method] || ""}`,
              note_after: null },
            { name: SUBSECTION_SUM_PORTRAIT(p),
  body: (() => {
    const card = participantCardinality(p);
    const levelExtra = LEVEL_SUM_PORTRAITS(p)[p.synthLevel] || "";
    // Режим мета-синтеза (среди участников есть концепции)
    if (hasConceptParticipants(p)) {
      const lead = card === "single"
        ? `Для единственного участника синтеза:`
        : `Для каждого участника синтеза:`;
      return lead + `\n` +
        `— Для философов (${philNames(p).join(", ") || "—"}): какова его ключевая идея, ` +
        `релевантная данному синтезу? Что именно он привносит?\n` +
        `— Для концепций-участников (${conceptNames(p).join(", ")}): ` +
        `какова её центральная идея (по капсуле и категориям)? ` +
        `Какие её тезисы и категории наиболее релевантны? ` +
        `Какие внутренние напряжения она несёт из своего собственного синтеза?` +
        levelExtra;
    }
    // Свободный синтез (без участников)
    if (card === "none") {
      return `Свободный синтез — разверни содержание зерна концепции:\n` +
        `— Какова центральная проблема или интуиция, заложенная в зерне?\n` +
        `— В каких философских горизонтах и традициях имеет смысл её ставить?\n` +
        `— Какие концептуальные напряжения возникают уже при первом раскрытии зерна?\n` +
        `— Какие аспекты проблематики требуют разработки, какие — осознанно оставлены за рамками?` +
        levelExtra;
    }
    // Один философ + зерно (без концепций-участников)
    if (card === "single") {
      const name = (p.phil || [])[0] || "—";
      return `Для единственного философа-участника (${name}): какова его ключевая идея, ` +
        `релевантная данному синтезу? Что именно он привносит? Какие аспекты его ` +
        `философии будут задействованы, а какие — осознанно оставлены за рамками? ` +
        `С какими соседними философскими горизонтами (традициями, школами, позициями) ` +
        `его идеи будут соотнесены в свете зерна концепции?` +
        levelExtra;
    }
    // Несколько философов
    return `Для каждого из философов-участников (${(p.phil || []).join(", ")}): ` +
      `какова его ключевая идея, релевантная данному синтезу? Что именно он привносит? ` +
      `Какие аспекты его философии будут задействованы, а какие — осознанно ` +
      `оставлены за рамками?` + levelExtra;
  })(),
  note_after: null },
            { name: "Новизна и ценность",
              body: hasNoParticipants(p)
                ? `Что нового данный свободный синтез может внести в философское поле: какой вопрос ставится в более острой форме, чем в существующих традициях? Какой аспект реальности оказывается концептуализирован там, где прежде был слепой участок?`
                : `Что нового данный синтез может дать, чего не давали исходные философы по отдельности? Какие «слепые пятна» каждого философа компенсируются другими?`,
              note_after: null },
            { name: "Структура документа",
              body: (() => {
                const secNames = ["Исполнительное резюме (данный раздел)",
                  ...p.sec.map(k => SEC_NAMES[k] || k)];
                const secListStr = secNames.map((n, i) => (i + 1) + ". " + n).join("\n");
                const base = `Какие разделы включены и почему, как они связаны между собой.

РАЗДЕЛЫ ДОКУМЕНТА (полный перечень):
${secListStr}`;
                if (p.generationOrder === "genetic") {
                  return base + `\n\nЛогика генетического пути: от живого обсуждения к формализации.
            Каждый последующий раздел формализует материал предыдущего.`;
                }
                return base;
              })(),
              note_after: null },
            { name: "Индекс когерентности",
              body: hasNoParticipants(p)
                ? `Оценка 0–100: насколько внутренне связной и непротиворечивой получается развёртка зерна концепции. Развёрнутое обоснование оценки. (В свободном синтезе когерентность измеряется не между источниками, а внутри самой разворачиваемой проблемы.)`
                : `Оценка 0–100: насколько органично сочетаются выбранные философские системы. Развёрнутое обоснование оценки.`,
              note_after: null },
            { name: "Точки напряжения",
              body: (hasNoParticipants(p)
                ? `Какие внутренние напряжения, противоречия и нерешённые вопросы несёт в себе само зерно концепции? Какие моменты задают продуктивную проблемную ткань синтеза?`
                : `Между какими именно ${participantWord(p)}ми и по каким вопросам
            существуют фундаментальные разногласия, которые синтез должен разрешить?`) +
                (p.sec.includes("dialogue")
                  ? `\n\nЕсли раздел «Диалог» включён в план — формулируй напряжения
            как реальные разногласия, способные выдержать продуктивный спор:
            не «разные акценты», а структурные противоречия.`
                  : ""),
              note_after: null },
            { name: "Оценка сложности",
              body: `Насколько трудным является данный синтез? Какие главные препятствия предстоит преодолеть?`,
              note_after: `ВАЖНО: по завершению генерации секции «Оценка сложности» запрос считается выполненным.` },
          ],
          postamble: `Минимум ${mw(p)} слов.`,
          postamble_short: `Отвечай ТОЛЬКО HTML этой одной секции.`,
        };
        d.push({
          key: "sum", num: n++,
          title: "Исполнительное Резюме Синтеза",
          parts: sumParts,
          prompt: serializeParts(sumParts),
        });

        // ═══════════════════════════════════════
        // GRAPH
        // ═══════════════════════════════════════
        if (p.sec.includes("graph")) {
          const graphLevel = p.synthLevel || "comparative";

          // Выбор MAP-объекта методологии: зависит от порядка генерации
          const methMap = (p.generationOrder === "genetic")
            ? LEVEL_GRAPH_METHODOLOGY_GENETIC(p)
            : LEVEL_GRAPH_METHODOLOGY(p);

          const graphParts = {
            preamble: `Составь § — ГРАФ КАТЕГОРИЙ.
        КРИТИЧЕСКОЕ ТРЕБОВАНИЕ: Граф ОБЯЗАН быть связным. Каждая категория должна быть связана хотя бы с одной другой. Не должно быть изолированных категорий или фрагментов. Перед финализацией проверь связность: из любой категории должен существовать путь по связям к любой другой.

        АДАПТАЦИЯ К КОНТЕКСТУ:
        — Если в контексте есть глоссарий и/или тезисы и/или понятия из диалога:
          граф РЕКОНСТРУИРУЕТ категориальную структуру из уже имеющегося материала.
          Каждая категория должна прослеживаться к источнику в контексте.
          ЗАПРЕЩЕНО вводить категории без прообраза в предшествующих разделах.
        — Если граф генерируется первым (контекст содержит только резюме):
          граф КОНСТРУИРУЕТ категориальный аппарат на основе целей, метода
          и портретов участников.`,

            preamble_short: `Раздел «Граф категорий». Граф ОБЯЗАН быть связным. Названия — 1–4 слова.`,
            intro: `Оформи ТОЧНО следующие секции (каждую — в <div data-section="..."> согласно правилам форматирования):`,
            subsections: [
              { name: "Методология построения графа",
                body: `${methMap[graphLevel]}${METHOD_GRAPH(p)[p.method] ? METHOD_GRAPH(p)[p.method] + "\n\n" : ""}`,
                note_after: null },
              { name: "Таблица категорий",
                body: `8–15 категорий.
ТРЕБОВАНИЕ К НАЗВАНИЯМ КАТЕГОРИЙ:
- Название — строго 1–4 слова (1- хорошо, 2 - допустимо, 3 - при необходимости, 4 - в крайнем случае), именное словосочетание или существительное
- ЗАПРЕЩЕНЫ: придаточные конструкции («как», «через», «посредством»), причастные и деепричастные обороты, любые описательные фразы
- Эталон краткости (если больше одного слова): «вечное возвращение», «воля к власти», «онтическое напряжение», «трансфинитное единство»
- Название — указатель на понятие, а НЕ его определение. Определение — в столбце «Определение»
Столбцы СТРОГО: Категория | Тип | Определение | Центральность | Определённость | ${LEVEL_GRAPH_LAST_COL_NAME[graphLevel]}${p.extGraphMetrics ? "\n\nДОПОЛНИТЕЛЬНЫЕ СТОЛБЦЫ (обязательны при расширенных характеристиках):\nПосле столбца «" + LEVEL_GRAPH_LAST_COL_NAME[graphLevel] + "» добавь:\n| Ист. значимость | Степень инновации | Ясность | Широта | Глубина | Применимость\n- Все значения: числа 0.0–1.0, кроме Степени инновации (1–5: 1=традиционное, 5=революционное)" : ""}
- Тип: онтологическая / эпистемологическая / этическая / аксиологическая / метафизическая / логическая / практическая / эстетическая / антропологическая / феноменологическая / экзистенциальная / социальная / политическая / теологическая${_buildExtraTypesBlock(p.method, graphLevel, "category")}
- Центральность и Определённость: числа 0.0–1.0
        ${LEVEL_GRAPH_LAST_COL_SPEC(p)[graphLevel]}

        Если в контексте выше есть понятия из диалога — для каждой категории
        укажи момент диалога, из которого она реконструирована (если применимо).`,
                note_after: null },
              { name: "Таблица связей",
                body: `Все значимые связи.
Столбцы СТРОГО: Источник | Описание связи | Цель | Тип | Направление | Сила${p.extGraphMetrics ? "\n\nДОПОЛНИТЕЛЬНЫЕ СТОЛБЦЫ СВЯЗЕЙ (обязательны при расширенных характеристиках):\nПосле «Сила» добавь: | Определённость связи | Степень инновации | Ист. поддержка | Логическая необходимость | Контекстозависимость\n- Все значения: 0.0–1.0, кроме Степени инновации (1–5)" : ""}
- Источник и Цель: ТОЧНЫЕ названия из таблицы категорий.
- Тип: иерархическая / диалектическая / каузальная / корреляционная / дополнительность / противоречие / эмерджентность / часть-целое / средство-цель / основание / определяющая / развитие${_buildExtraTypesBlock(p.method, graphLevel, "edge")}
- При методе синтеза "творческий" возможны нестандартные типы связей
- Направление — СТРОГО одно из трёх: однонаправленная | двунаправленная | рефлексивная
  (рефлексивная = связь категории с самой собой, т.е. Источник = Цель)
- Сила: число 0.0–1.0`,
                note_after: null },
              { name: "Топология графа",
                body: `Кластеры и их содержательная характеристика, генеративные узлы, центральные и периферийные категории, мосты между кластерами, рефлексивные связи, верификация связности. Необходимо охватить каждую категорию.
        ${METHOD_TOPOLOGY[p.method]}`,
                note_after: null },
              { name: "Топологическая таблица",
                body: `ОБЯЗАТЕЛЬНАЯ итоговая таблица. Оформить строго как <table class="doc-table">.
Столбцы СТРОГО: Категория | Кластер | Структурные роли | Процессуальные роли | Рефлексивная связь

— Категория: ТОЧНОЕ название из таблицы категорий — без кавычек, без скобок, без пояснений.
  Каждая категория — ОБЯЗАТЕЛЬНО в отдельной строке. Пропуски недопустимы.

— Кластер: ПОЛНОЕ содержательное название кластера — ТОЧНО как в описательной секции «Топология графа».
  Римские цифры, сокращения и аббревиатуры вместо полных названий — ЗАПРЕЩЕНЫ.
  Если категория принадлежит нескольким кластерам — перечислить все полные названия через « / ».
  Например: «Онтологическое ядро / Эпистемический мост», НЕ «I / II».
  Мост без кластера — «мост».

— Структурные роли: одна или несколько через запятую — СТРОГО из списка:
  "центральная | периферийная | мост | генеративная | ядро"
  Если у категории нет структурной роли — ячейку оставить пустой.
  Роли из столбца «Процессуальные» в этом столбце — ЗАПРЕЩЕНЫ.
— Процессуальные роли — СТРОГО из списка метода ${ML[p.method]}:
${TOPOLOGY_ROLES_PROCEDURAL[p.method]}
${LEVEL_TOPOLOGY_NOTE(p)[graphLevel] || ""}
Если у категории нет процессуальной роли — ячейку оставить пустой.
  Структурные роли в этом столбце — ЗАПРЕЩЕНЫ.
  Роли из словаря другого метода — ЗАПРЕЩЕНЫ.

— Рефлексивная связь: «да» если категория имеет рефлексивную связь с самой собой, иначе — пусто.`,
                note_after: `Граф ОБЯЗАН быть связным. Названия категорий в таблице связей и топологии ТОЧНО совпадают с таблицей категорий.

СТРОГОЕ СООТВЕТСТВИЕ: Топологическая таблица ОБЯЗАНА точно отражать описательную секцию «Топология графа». Каждый кластер, упомянутый в описании, должен фигурировать в таблице под тем же полным названием. Каждая роль, приписанная категории в описании, должна присутствовать в соответствующей ячейке таблицы. Расхождения между описанием и таблицей — НЕДОПУСТИМЫ.` },
            ],
            postamble: `Минимум ${mw(p)} слов.`,
            postamble_short: `Отвечай ТОЛЬКО HTML этой одной секции. Граф ОБЯЗАН быть связным.`,
          };
          d.push({ key: "graph", num: n++,
            title: "Граф Категорий Концепции",
            parts: graphParts, prompt: serializeParts(graphParts) });
        }

        // ═══════════════════════════════════════
        // GLOSSARY
        // ═══════════════════════════════════════
        if (p.sec.includes("glossary")) {
          const glossaryLevel = p.synthLevel || "comparative";

          const glossaryParts = {
            preamble: `Составь § — ГЛОССАРИЙ КАТЕГОРИЙ И ОПРЕДЕЛЕНИЙ.
        Задача — дать ФИЛОСОФСКИ ТОЧНЫЕ определения всем ключевым понятиям концепции.`,
            preamble_short: `Раздел «Глоссарий». Философски точные определения.`,
            intro: `Оформи ТОЧНО следующие секции (каждую — в <div data-section="..."> согласно правилам форматирования):`,
            subsections: [
              { name: "Таблица определений",
                body: `Для каждой категории из графа концепции (ссылайся на предыдущие разделы по номерам §§) составь таблицу с ФИЛОСОФСКИ ТОЧНЫМИ определениями, принятыми для целей данного документа. Не менее 10 терминов.

        ИСТОЧНИКИ ТЕРМИНОВ (опирайся на то, что доступно в контексте выше):
        — Если в контексте есть категории из графа — определи каждую категорию.
        — Если в контексте есть понятия из диалога — определи каждое понятие,
          возникшее в диалоге, и укажи момент его рождения.
        — Если доступны оба источника — объедини: каждый термин должен быть
          прослежен и к категории графа, и к моменту диалога (где применимо).
        — Если ни графа, ни диалога нет — опирайся на цели и метод из резюме.

        Столбцы таблицы: Термин | Принятое определение в данной концепции | ${LEVEL_GLOSSARY_COL(p)[glossaryLevel]}
        ${METHOD_GLOSSARY[p.method] ? "\n" + METHOD_GLOSSARY[p.method] : ""}`,
                note_after: `ВАЖНО: после таблицы определений ОБЯЗАТЕЛЬНО оформи следующие секции.` },
              ...parseGlossarySubsections(glossaryLevel, p),
            ],
            postamble: `Мин. ${mw(p)} слов.`,
            postamble_short: `Отвечай ТОЛЬКО HTML этой одной секции.`,
          };
          d.push({ key: "glossary", num: n++,
            title: "Глоссарий Категорий И Определений",
            parts: glossaryParts, prompt: serializeParts(glossaryParts) });
        }

        // ═══════════════════════════════════════
        // THESES — со shared-блоком
        // ═══════════════════════════════════════
        if (p.sec.includes("theses")) {
          const thesesLevel = p.synthLevel || "comparative";

          const thesesParts = {
            preamble: `Составь § — КОРПУС ТЕЗИСОВ.`,
            preamble_short: `Раздел «Корпус тезисов». Тезисы должны отражать структурные отношения между категориями из графа концепции и быть выражены в академическом стиле.`,
            intro: `Оформи ТОЧНО следующие секции (каждую — в <div data-section="..."> согласно правилам форматирования):`,
            subsections: [
              // Shared: общие требования для всех трёх групп тезисов
              { type: "shared",
                body: `Тезисы выражаются в академическом стиле.

              Для КАЖДОГО тезиса обязательно:
              - Формулировка тезиса (чётко, в одном предложении, выделить жирным — <strong>)
              - Обоснование (со ссылками на §§ и конкретные категории/понятия по названию)

              АДАПТАЦИЯ К КОНТЕКСТУ:
              — Если в контексте есть категории из графа — тезисы должны отражать
                структурные отношения между категориями; укажи, из КАКИХ ИМЕННО
                категорий и связей каждый тезис логически следует.
              — Если в контексте есть понятия из диалога — тезисы формализуют то,
                что было нащупано в диалоге. Если в таблице диалога есть предварительные
                тезисы / гипотезы — для каждого: ПРИНЯТЬ и формализовать /
                ПЕРЕФОРМУЛИРОВАТЬ с обоснованием / мотивированно ОТВЕРГНУТЬ.
                Каждый финальный тезис должен быть прослежен к моменту диалога.
              — Если доступны оба — каждый тезис связан и с категорией, и с моментом диалога.
              — Если нет ни того, ни другого — тезисы опираются на цели и метод из резюме.

              ${LEVEL_THESES_CONTRIB(p)[thesesLevel]}
              ${METHOD_THESES(p)[p.method] || ""}
              ${LEVEL_THESES_NOVELTY[thesesLevel]}
              - Связанные категории / понятия (перечислить)`,
                scope: ["Онтологические тезисы", "Эпистемологические тезисы", "Этические и аксиологические тезисы"] },
              { name: "Онтологические тезисы",
                body: `Не менее 3 тезисов о природе бытия и реальности.`,
                note_after: null },
              { name: "Эпистемологические тезисы",
                body: `Не менее 3 тезисов о познании и знании.`,
                note_after: null },
              { name: "Этические и аксиологические тезисы",
                body: `Не менее 2 тезисов о ценностях и должном.`,
                note_after: null },  
              { name: "Сводная таблица тезисов",
                body: `ОБЯЗАТЕЛЬНО в конце раздела — итоговая таблица.
Столбцы: № | Формулировка тезиса | Тип (онтол./эпистем./этич.) | Степень новизны | Связанные категории
Эта таблица будет использоваться последующими разделами документа.`,
                note_after: null },
            ],
            postamble: `Мин. ${mw(p)} слов.`,
            postamble_short: `Отвечай ТОЛЬКО HTML этой одной секции.`,
          };
          d.push({
            key: "theses", num: n++,
            title: "Корпус Тезисов",
            parts: thesesParts,
            prompt: serializeParts(thesesParts),
          });
        }

        // ═══════════════════════════════════════
        // NAME
        // ═══════════════════════════════════════
        if (p.sec.includes("name")) {
          const nameParts = {
            preamble: `Составь § — НАЗВАНИЕ КОНЦЕПЦИИ И ЕГО АНАЛИЗ.`,
            preamble_short: `Раздел «Название концепции и его анализ».`,
            intro: `Оформи ТОЧНО следующие секции (каждую — в <div data-section="..."> согласно правилам форматирования):`,
            subsections: [
              { name: "Таблица вариантов названия",
                body: `Предложи 5–7 вариантов названия.
              Столбцы: Вариант | Тип | Обоснование | Сильные стороны | Слабые стороны | Оценка (1–10)
              Типы: концептуальное, метафорическое, проблемное, процессуальное,
              парадоксальное, указательное, описательное.

              Название должно отражать центральное содержание концепции.
              Если в контексте выше есть понятия из диалога — название может
              кристаллизовать ключевое понятие, родившееся в обсуждении.
              Если в контексте есть категории из графа — название может отражать
              архитектуру категорий.`,
                note_after: null },
              { name: "Сравнительный анализ вариантов",
                body: `Для каждого варианта из таблицы — развёрнутый анализ: этимология, коннотации, потенциальные ассоциации, однозначность vs двусмысленность, звучание на разных языках, соответствие традициям выбранных философов, точность отражения сути концепции.`,
                note_after: null },
              { name: "Итоговая рекомендация",
                body: `На основании проведённого сравнительного анализа определи оптимальное название. Выдели итоговое название жирным (<strong>) тегом — строго только само название, без каких-либо сопроводительных слов: правильно — \`<strong>Экспрессивная Гармониология</strong>\`, неправильно — \`<strong>Итоговая рекомендация: «Экспрессивная Гармониология»</strong>\`. В этой секции оформление итогового названия в <strong> должно быть первым. Если потребуется оформлять что-то ещё в <strong>, то этот тег должен быть уже после названия. Обоснуй выбор названия: почему именно этот вариант превосходит конкурентов, какие аспекты концепции он схватывает наилучшим образом, как соотносится с существующей философской терминологией. Отдельно: соответствие историческому контексту, методу (${ML[p.method]} — ${mdText(p, p.method)}) и уровню (${SL[p.synthLevel]} — ${sdText(p, p.synthLevel)}) синтеза.`,
                note_after: null },
            ],
            postamble: `Мин. ${mw(p)} слов.`,
            postamble_short: `Отвечай ТОЛЬКО HTML этой одной секции.`,
          };
          d.push({
            key: "name", num: n++,
            title: "Название Концепции и Его Анализ",
            parts: nameParts,
            prompt: serializeParts(nameParts),
          });
        }

        // ═══════════════════════════════════════
        // HISTORY
        // ═══════════════════════════════════════
        if (p.sec.includes("history")) {
          const historyParts = {
            preamble: `Составь § — ИСТОРИЧЕСКАЯ КОНТЕКСТУАЛИЗАЦИЯ.

Помести синтезированную концепцию в контекст истории философии. `,
            preamble_short: `Раздел «Историческая контекстуализация». Помести синтезированную концепцию в контекст истории философии.`,
            intro: `Оформи ТОЧНО следующие секции (каждую — в <div data-section="..."> согласно правилам форматирования):`,
            subsections: [
              { name: "Исторический контекст",
                body: `В какую эпоху, в какой интеллектуальный климат вписывается данная концепция. Какие философские «запросы» своего времени она могла бы удовлетворить.`,
                note_after: null },
              { name: "Источники влияния",
                body: `Таблица: ${participantWordSg(p).charAt(0).toUpperCase() + participantWordSg(p).slice(1)} | Ключевая идея | Как трансформирована в синтезе | Степень влияния (0–1). Рассмотри влияние ${eachParticipant(p)}.`,
                note_after: null },
              { name: "Генеалогия идей",
                body: `Цепочка идей от античности до современности, ведущая к данному синтезу. Какие промежуточные мыслители (не вошедшие в список выбранных) могли бы быть «предшественниками»?
${p.extGraphMetrics ? "\nЕсли в контексте таблица категорий содержит столбец «Ист. значимость» — обрати внимание на категории с наивысшей исторической значимостью: именно они наиболее вероятные точки соприкосновения с историей философии." : ""}`,
                note_after: null },
              { name: "Современные концепции",
                body: `Существуют ли в современной философии попытки аналогичного синтеза? Кто работает в схожем направлении? Таблица: Концепция/автор | Сходство | Различие.`,
                note_after: null },
              { name: "Потенциальное влияние",
                body: `На какие области и направления может повлиять. Каким образом.`,
                note_after: null },
              { name: "Название в историческом контексте",
                body: `Насколько предложенное название вписывается в историю философии. Существуют ли исторические прецеденты похожих названий.`,
                note_after: null },
            ],
            postamble: `Мин. ${mw(p)} слов.`,
            postamble_short: `Отвечай ТОЛЬКО HTML этой одной секции.`,
          };
          d.push({
            key: "history", num: n++,
            title: "Историческая Контекстуализация",
            parts: historyParts,
            prompt: serializeParts(historyParts),
          });
        }

        // ═══════════════════════════════════════
        // ORIGIN
        // ═══════════════════════════════════════
        if (p.sec.includes("origin")) {
          const originParts = {
            preamble: `Составь § — АНАЛИЗ ПРОИСХОЖДЕНИЯ И ГЕНЕАЛОГИЯ ИДЕЙ.

Проведи «обратный инжиниринг» синтезированной концепции.`,
            preamble_short: `Раздел «Анализ происхождения». «Обратный инжиниринг» синтезированной концепции.`,
            intro: `Оформи ТОЧНО следующие секции (каждую — в <div data-section="..."> согласно правилам форматирования):`,
            subsections: [
              { name: "Идентификация родительских традиций",
                body: `Какие философские традиции являются «родителями» данной концепции. Определи, является ли данная концепция синтезом существующих традиций. Укажи КОНКРЕТНЫЕ ПРИЗНАКИ, позволяющие сделать такой вывод.
Таблица: Традиция | Вклад (%) | Ключевые заимствования | Трансформации | Приблизительное соотношение влияния.`,
                note_after: null },
              { name: "Элементная декомпозиция",
                body: `Для КАЖДОЙ категории графа и КАЖДОГО тезиса: из какой традиции он происходит? Что в нём нового? Предоставь детальное обоснование.
${p.extGraphMetrics ? "\nЕсли в контексте таблица категорий содержит столбцы «Ист. значимость», «Степень инновации», «Применимость» — используй их как количественную опору для декомпозиции. Высокая степень инновации (4–5) указывает на подлинно новый элемент; низкая (1–2) — на заимствование." : ""}`,
                note_after: null },
              { name: "Оценка оригинальности",
                body: `Что в данной концепции является подлинно новым (не сводимым к исходным традициям)? Есть ли эмерджентные свойства синтеза — идеи, которые не содержатся ни в одной из исходных традиций, но возникают из их соединения?
${p.extGraphMetrics ? "\nЕсли в контексте есть расширенные характеристики связей (степень инновации, историческая поддержка) — опирайся на них: связи с низкой исторической поддержкой и высокой инновацией — кандидаты на эмерджентность." : ""}`,
                note_after: null },
              { name: "Потенциальные возражения",
                body: hasConceptParticipants(p)
  ? `Для каждого участника синтеза (${participantsForPrompt(p)}):\n` +
    `— Для философов: что бы сказал каждый, увидев, как его идеи трансформированы? ` +
    `Формулируй возражения от лица мыслителя, исходя из его собственной системы.\n` +
    `— Для концепций-участников: какие внутренние противоречия возникают между ` +
    `категориями исходных концепций при их объединении в новый синтез? ` +
    `Какие тезисы одной концепции конфликтуют с тезисами другой? ` +
    `Какие категории не совместимы и требуют переосмысления?`
  : hasNoParticipants(p)
    ? `Какие возражения наиболее убедительно могли бы выдвинуть против данной концепции представители релевантных философских традиций (опираясь на содержание зерна и полученный граф)? Формулируй возражения от лица каждой такой традиции, исходя из её собственных оснований и характерных способов аргументации.`
    : `Что бы сказал КАЖДЫЙ из выбранных философов (${(p.phil || []).join(", ")}), увидев, как его идеи трансформированы? Формулируй возражения от лица каждого мыслителя, исходя из его собственной системы.`,
                note_after: null },
            ],
            postamble: `Мин. ${mw(p)} слов.`,
            postamble_short: `Отвечай ТОЛЬКО HTML этой одной секции.`,
          };
          d.push({
            key: "origin", num: n++,
            title: "Анализ Происхождения",
            parts: originParts,
            prompt: serializeParts(originParts),
          });
        }

        // ═══════════════════════════════════════
        // PRACTICAL — со shared-блоком
        // ═══════════════════════════════════════
        if (p.sec.includes("practical")) {
          const practicalParts = {
            preamble: `Составь § — ПРАКТИЧЕСКОЕ ПРИМЕНЕНИЕ.

Проанализируй возможности практического применения в следующих областях.`,
            preamble_short: `Раздел «Практическое применение». Для КАЖДОЙ области — 5 обязательных подпунктов.`,
            intro: `Оформи ТОЧНО следующие секции (каждую — в <div data-section="..."> согласно правилам форматирования):`,
            subsections: [
              // Shared: 5 обязательных подпунктов для КАЖДОЙ области
              { type: "shared",
                body: `Для КАЖДОЙ секции обязательно 5 подпунктов:
1. Краткое описание применимости концепции в данной области
2. Релевантные тезисы и категории концепции (со ссылками на §§)
3. Конкретные способы ОПЕРАЦИОНАЛИЗАЦИИ — не абстрактные пожелания, а конкретные, реализуемые рекомендации
4. Потенциальные ТРУДНОСТИ И ОГРАНИЧЕНИЯ применения
5. Критерии ОЦЕНКИ ЭФФЕКТИВНОСТИ применения — как измерить, что концепция действительно работает`,
                scope: ["Образование", "Этика и принятие решений", "Психология и личностное развитие", "Социальные институты", "Межкультурный диалог"] },
              { name: "Образование",
                body: `Как данная концепция может трансформировать педагогические практики, дидактические методы, структуру учебных программ`,
                note_after: null },
              { name: "Этика и принятие решений",
                body: `Практические этические рекомендации, вытекающие из концепции; инструменты принятия решений в сложных ситуациях`,
                note_after: null },
              { name: "Психология и личностное развитие",
                body: `Инструменты самопознания, практики развития, терапевтическое применение`,
                note_after: null },
              { name: "Социальные институты",
                body: `Как концепция может повлиять на организацию общества, проектирование институтов, управление`,
                note_after: null },
              { name: "Межкультурный диалог",
                body: `Применимость к пониманию между культурами, религиями и традициями мысли`,
                note_after: null },
              { name: "Сводная таблица",
                body: `ОБЯЗАТЕЛЬНО в конце раздела — итоговая таблица.
Область | Релевантные категории | Способ применения | Потенциальный эффект | Ограничения | Критерии эффективности.
${p.extGraphMetrics ? "\nЕсли в контексте доступны расширенные характеристики — при заполнении «Релевантные категории» учти показатель «Применимость» и «Широта»: категории с высокой применимостью — приоритетные для каждой области." : ""}`,
                note_after: null },
            ],
            postamble: `Мин. ${mw(p)} слов.`,
            postamble_short: `Отвечай ТОЛЬКО HTML этой одной секции.`,
          };
          d.push({
            key: "practical", num: n++,
            title: "Практическое Применение",
            parts: practicalParts,
            prompt: serializeParts(practicalParts),
          });
        }

        // ═══════════════════════════════════════
        // DIALOGUE — с bridge-блоком
        // ═══════════════════════════════════════
        if (p.sec.includes("dialogue")) {
          const dialogueLevel = p.synthLevel || "comparative";

          // Выбор MAP-объекта структуры: зависит от порядка генерации
          const structMap = (p.generationOrder === "genetic")
            ? LEVEL_DIALOGUE_STRUCT_GENETIC(p)
            : LEVEL_DIALOGUE_STRUCT(p);
          const tableMap = (p.generationOrder === "genetic")
            ? LEVEL_DIALOGUE_TABLE_GENETIC(p)
            : LEVEL_DIALOGUE_TABLE(p);

          const commentMap = (p.generationOrder === "genetic")
            ? LEVEL_DIALOGUE_COMMENT_GENETIC
            : LEVEL_DIALOGUE_COMMENT;

          const dialogueParts = {
            preamble: hasNoParticipants(p)
              ? `Составь § — ДИАЛОГ МЕЖДУ ТРАДИЦИЯМИ.

        Именованных участников синтеза нет — это свободный синтез. Выбери голоса диалога самостоятельно, опираясь на содержание зерна концепции и на дополнительный контекст данного раздела (если задан). В роли голосов могут выступать философские традиции, школы, характерные позиции, «типические мыслители» эпохи или воображаемые представители подходов.
        Формат: классический философский диалог в стиле платоновских диалогов, но с современным содержанием. Придай голосам характерные черты в соответствии с избранными философскими позициями.

        АДАПТАЦИЯ К КОНТЕКСТУ:
        — Если в контексте выше приведены категории из графа и/или тезисы:
          диалог ИССЛЕДУЕТ и ПРОВЕРЯЕТ их — голоса спорят о тех же идеях,
          что формализованы в предшествующих разделах, но СВОИМ ЯЗЫКОМ, как живые
          мыслители. Они НЕ комментируют документ и НЕ ссылаются на §§ — они
          спорят о проблемах. Картирование диалога на формальные разделы выполняет
          аналитический комментарий и итоговая таблица.
        — Если граф и тезисы ещё НЕ сгенерированы (их нет в контексте выше):
          диалог ПОРОЖДАЕТ новые понятия И предварительные утверждения о них —
          голоса нащупывают категории и формулируют гипотезы,
          которые будут формализованы в последующих разделах. Каждое новое
          понятие ВЫДЕЛЯЙ при первом появлении жирным (<strong>),
          а каждое предварительное утверждение — курсивом (<em>).`
              : `Составь § — ДИАЛОГ МЕЖДУ ТРАДИЦИЯМИ.

        Создай философский диалог между участниками синтеза.
        Участники: ${participantsForPrompt(p)}.
        Философы говорят от своего лица.
        Если участник диалога - не философ, а концепция, то она представлена воображаемым «защитником концепции» — мыслителем, который опирается строго на категории, тезисы и внутреннюю логику данной концепции (приведены в контексте выше) и не выходит за их пределы. Это не автор концепции — это её адвокат.
        Формат: классический философский диалог в стиле платоновских диалогов, но с современным содержанием. Придай участникам характерные черты в соответствии с их философскими позициями (в случае философов) или с сутью соответствующих концепций.

        АДАПТАЦИЯ К КОНТЕКСТУ:
        — Если в контексте выше приведены категории из графа и/или тезисы:
          диалог ИССЛЕДУЕТ и ПРОВЕРЯЕТ их — участники спорят о тех же идеях,
          что формализованы в предшествующих разделах, но СВОИМ ЯЗЫКОМ, как живые
          мыслители. Они НЕ комментируют документ и НЕ ссылаются на §§ — они
          спорят о проблемах. Картирование диалога на формальные разделы выполняет
          аналитический комментарий и итоговая таблица.
        — Если граф и тезисы ещё НЕ сгенерированы (их нет в контексте выше):
          диалог ПОРОЖДАЕТ новые понятия И предварительные утверждения о них —
          участники нащупывают категории и формулируют гипотезы,
          которые будут формализованы в последующих разделах. Каждое новое
          понятие ВЫДЕЛЯЙ при первом появлении жирным (<strong>),
          а каждое предварительное утверждение — курсивом (<em>).`,

            preamble_short: hasNoParticipants(p)
              ? `Раздел «Диалог между традициями». Свободный синтез: голоса диалога выбираются самостоятельно по содержанию зерна и доп.контексту.`
              : `Раздел «Диалог между традициями». Участники: ${participantsForPrompt(p)}.`,
            intro: `Оформи ТОЧНО следующие секции (в <div data-section="..."> согласно правилам форматирования):`,
            subsections: [
              { name: "Межфилософский диалог",
                body: `МЕТОД ВЕДЕНИЯ ДИАЛОГА (строго соответствует методу синтеза — ${ML[p.method]}):
        ${METHOD_DIALOGUE[p.method] || ""}

        ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ДИАЛОГА из 5 частей (строго соответствует уровню синтеза — ${SL[dialogueLevel]}):
        ${structMap[dialogueLevel]}

        Диалог должен быть содержательным, а не формальным — настоящее философское исследование, а не декорация.`,
                note_after: null },
              { type: "bridge",
                body: `ПОСЛЕ ДИАЛОГА обязательны следующие секции:` },
              { name: "Итоговая таблица диалога",
                body: `Столбцы: ${tableMap[dialogueLevel]}`,
                note_after: null },
              { name: "Аналитический комментарий",
                body: (() => {
                  const base = commentMap[dialogueLevel];
                  if (p.generationOrder === "genetic") {
                    return base + `

        Если диалог породил новые понятия — перечисли их с предварительными
        определениями, предварительными тезисами и укажи, из какого
        столкновения каждое возникло.`;
                  } else {
                    return base + `

        Если диалог обнаружил новые вопросы или понятия, не отражённые
        в предшествующих формальных разделах, — перечисли их и укажи,
        какие именно разделы нуждаются в доработке.`;
                  }
                })(),
                note_after: null },
            ],
            postamble: `Мин. ${mw(p)} слов.`,
            postamble_short: `Отвечай ТОЛЬКО HTML этой одной секции.`,
          };
          d.push({ key: "dialogue", num: n++,
            title: "Диалог Между Традициями",
            parts: dialogueParts, prompt: serializeParts(dialogueParts) });
        }

        // ═══════════════════════════════════════
        // EVOLUTION
        // ═══════════════════════════════════════
        if (p.sec.includes("evolution")) {
          const evolutionParts = {
            preamble: `Составь § — ЭВОЛЮЦИЯ И ПЕРСПЕКТИВЫ КОНЦЕПЦИИ.

Предложи возможные направления эволюции синтезированной концепции в свете современных научных открытий, социальных изменений и философских тенденций.`,
            preamble_short: `Раздел «Эволюция и перспективы». Направления эволюции синтезированной концепции.`,
            intro: `Оформи ТОЧНО следующие секции (каждую — в <div data-section="..."> согласно правилам форматирования):`,
            subsections: [
              { name: "Направления развития",
                body: `3–5 возможных направлений.
Таблица: Направление | Описание | Научная основа | Социальный контекст | Какие категории графа изменятся | Прогноз реализуемости.
${p.extGraphMetrics ? "\nЕсли в контексте есть расширенные характеристики категорий — приоритизируй направления: категории с высокой применимостью и низкой глубиной — кандидаты на углубление; с высокой инновацией — точки наибольшего эволюционного потенциала." : ""}`,
                note_after: null },
              { name: "Предлагаемые изменения графа",
                body: `Какие новые категории могут появиться, какие связи переосмыслятся, какие элементы устареют. Для каждого предлагаемого изменения: конкретный механизм трансформации.`,
                note_after: null },
              { name: "Эволюция названия",
                body: `Должно ли название измениться при развитии концепции? Предложи варианты для каждого направления эволюции. Как может и должно ли сохраниться текущее название.`,
                note_after: null },
              { name: "Интеграция с современной наукой",
                body: `Как данные нейронауки, когнитивистики, физики, теории сложности, AI могут обогатить или опровергнуть элементы концепции.`,
                note_after: null },
              { name: "Временная карта развития",
                body: `- Ближайшие 10 лет: какие аспекты наиболее актуальны
- 50 лет: какие трансформации ожидаемы
- Отдалённая перспектива: к чему концепция может эволюционировать`,
                note_after: null },
            ],
            postamble: `Мин. ${mw(p)} слов.`,
            postamble_short: `Отвечай ТОЛЬКО HTML этой одной секции.`,
          };
          d.push({
            key: "evolution", num: n++,
            title: "Эволюция и Перспективы",
            parts: evolutionParts,
            prompt: serializeParts(evolutionParts),
          });
        }

        // ═══════════════════════════════════════
        // CRITIQUE — динамические подразделы по synthLevel
        // ═══════════════════════════════════════
        if (p.sec.includes("critique")) {
          const critiqueLevel = p.synthLevel || "comparative";

          const critiqueParts = {
            preamble: `Составь § — КРИТИЧЕСКИЙ АНАЛИЗ СИНТЕЗА.
        Проведи СТРОГИЙ критический анализ всего документа. Будь честен и безжалостен
        — задача этого раздела не хвалить, а выявлять проблемы.`,
            preamble_short: `Раздел «Критический анализ». СТРОГИЙ анализ. Выявлять проблемы, не хвалить.`,
            intro: `Оформи ТОЧНО следующие секции (каждую — в <div data-section="..."> согласно правилам форматирования):`,
            subsections: [
              { name: "Внутренняя когерентность",
                body: `Есть ли противоречия между тезисами, категориями, определениями?
        Таблица выявленных противоречий
        Элемент 1 | Элемент 2 | Суть противоречия | Серьёзность (1–10).`,
                note_after: null },

              // ── Адаптивная секция: межслойная согласованность ──
              // Появляется только если есть и диалог, и формальные разделы
              ...((() => {
                const hasSec = (k) => p.sec.includes(k);
                const hasDialogue = hasSec("dialogue");
                const hasFormal = hasSec("graph") || hasSec("glossary") || hasSec("theses");
                if (!hasDialogue || !hasFormal) return [];

                return [{
                  name: "Межслойная согласованность",
                  body: `Проверь согласованность между диалогом и формальными разделами.

        НАПРАВЛЕНИЕ ПРОВЕРКИ зависит от того, что сгенерировано раньше
        (видно из нумерации §§ в контексте выше):

        А. ЕСЛИ ДИАЛОГ ПРЕДШЕСТВУЕТ формальным разделам (генетический путь):
           1. Все ли ключевые понятия из диалога попали в глоссарий/тезисы/граф?
              Таблица: Понятие из диалога | Отражено в формальных разделах? | Потери
           2. Не исказила ли формализация то, что было нащупано в диалоге?
              Таблица: Термин/тезис | Значение в диалоге | Значение в формальном разделе | Расхождение (0–10)
           3. Есть ли в формальных разделах элементы, которых НЕ БЫЛО в диалоге?
              Таблица: Элемент | Раздел | Есть в диалоге? | Источник

        Б. ЕСЛИ ФОРМАЛЬНЫЕ РАЗДЕЛЫ ПРЕДШЕСТВУЮТ диалогу (архитектурный путь):
           1. Все ли категории и тезисы нашли отражение в диалоге?
              Таблица: Категория/тезис | Отражена в диалоге? | Если нет — почему
           2. Не исказил ли диалог позиции, зафиксированные в графе и тезисах?
              Таблица: Момент диалога | Соответствует каркасу? | Расхождение (0–10)
           3. Появились ли в диалоге понятия, которых нет в формальных разделах?

        Определи направление по нумерации §§ и проведи соответствующую проверку.`,
                  note_after: null }];
              })()),

              { name: SUBSECTION_CRITIQUE_NOVELTY[critiqueLevel] || "Оценка новизны",
                body: `${LEVEL_CRITIQUE_NOVELTY(p)[critiqueLevel]}`,
                note_after: null },
              { name: SUBSECTION_CRITIQUE_CHECK[critiqueLevel] || "Верность источникам",
                body: (() => {
                  const base = LEVEL_CRITIQUE_CHECK(p)[critiqueLevel];
                  if (p.sec.includes("dialogue")) {
                    return base + `\n\nЕсли в документе есть диалог, предшествующий формальным разделам:\nдля каждой категории/тезиса проверь, прослеживается ли путь\nот момента диалога к формализации.`;
                  }
                  return base;
                })(),
                note_after: null },
              { name: "Верность методу синтеза",
                body: `${METHOD_CRITIQUE(p)[p.method] || ""}`,
                note_after: null },
              { name: "Сохранение ценных аспектов",
                body: `Удалось ли сохранить то ценное, что есть в каждой исходной традиции? Что было потеряно при синтезе?`,
                note_after: null },
              { name: "Разрешение противоречий",
                body: `Насколько успешно синтез снимает противоречия между исходными традициями? Какие противоречия лишь замаскированы, а не разрешены?`,
                note_after: null },
              { name: "Слепые пятна",
                body: `Что данная концепция НЕ видит? Какие важные проблемы игнорирует? Какие контраргументы наиболее сильны?`,
                note_after: null },
              { name: "Итоговая оценка",
                body: (() => {
                  const base = "когерентность, новизна, глубина, практичность, " +
                               "верность источникам, элегантность, перспективность";
                  const extra = p.sec.includes("dialogue") &&
                    (p.sec.includes("graph") || p.sec.includes("glossary") || p.sec.includes("theses"))
                    ? ", МЕЖСЛОЙНАЯ СОГЛАСОВАННОСТЬ (между диалогом и формальными разделами)"
                    : "";
                  return `Таблица:\nКритерий | Оценка (1–10) | Комментарий.\nКритерии: ${base}${extra}.`;
                })(),
                note_after: null },
              { name: "Рекомендации по улучшению",
                body: `Конкретные, операционализируемые шаги для усиления концепции. Не общие пожелания, а точечные действия.`,
                note_after: null },
            ],
            postamble: `Мин. ${mw(p)} слов.`,
            postamble_short: `Отвечай ТОЛЬКО HTML этой одной секции. Будь честен и безжалостен.`,
          };
          d.push({ key: "critique", num: n++,
            title: "Критический Анализ",
            parts: critiqueParts, prompt: serializeParts(critiqueParts) });
        }

        // ═══════════════════════════════════════
        // CAPSULE
        // ═══════════════════════════════════════
        if (p.sec.includes("capsule")) {
          const capsuleParts = {
            preamble: `Составь КАПСУЛУ КОНЦЕПЦИИ — компактную идентификационную карточку.`,
            preamble_short: `Капсула концепции. Три абзаца, ≤300 слов, от третьего лица.`,
            intro: `ФОРМАТ: Три абзаца, не более 300 слов суммарно. Без таблиц, списков и заголовков.
Пиши от третьего лица, как описание уже существующей концепции стороннему философу.
НЕ «мы пытались синтезировать», а «данная концепция утверждает, что...».

Оформи ТОЧНО одну секцию:`,
            subsections: [
              { name: "Капсула",
                body: `СТРУКТУРА АБЗАЦЕВ:
1. Что утверждает концепция — центральные категории, их роли и взаимосвязи (если доступна информация о связях), ключевой тезис.
2. Как она это обосновывает — метод, из каких традиций исходит, что нового привносит.
3. Честная оценка — сильная сторона и главное ограничение (из критического анализа, если доступен).`,
                note_after: null },
            ],
            postamble: `Минимум 200 слов.`,
            postamble_short: `Отвечай ТОЛЬКО HTML этой одной секции. Три абзаца, ≤300 слов.`,
          };
          d.push({
            key: "capsule", num: n++,
            title: "Капсула Концепции",
            parts: capsuleParts,
            prompt: serializeParts(capsuleParts),
          });
        }

        return d;
      }

// ───── [_buildExtraTypesBlock] philosynth.html строки 8977–8988 ─────
      function _buildExtraTypesBlock(method, synthLevel, kind) {
        const map = kind === "category" ? _EXTRA_CATEGORY_TYPES : _EXTRA_EDGE_TYPES;
        const extra = map[method] || [];
        if (!extra.length) return "";
        const phrasing = _SYNTH_LEVEL_TYPE_PHRASING[synthLevel];
        if (phrasing === undefined) return "";
        if (synthLevel === "generative") {
          // На порождающем уровне: просто добавляем в список через « / »
          return " / " + extra.join(" / ");
        }
        return "\n" + phrasing + extra.join(" / ");
      }

// ───── [SUBSECTION_SUM_PORTRAIT] philosynth.html строки 9438–9448 ─────
      function SUBSECTION_SUM_PORTRAIT(p) {
        const card = participantCardinality(p);
        if (card === "none") return "Портрет зерна концепции";
        if (hasConceptParticipants(p))
          return card === "single"
            ? "Портрет концепции-родителя"
            : "Портрет каждого участника синтеза";
        return card === "single"
          ? "Портрет философа"
          : "Портрет каждого философа";
      }

// ───── [canonicalSubsectionKey] philosynth.html строки 9753–9759 ─────
      function canonicalSubsectionKey(sectionKey, subsectionName) {
        if (sectionKey === "sum" &&
            _SUM_PORTRAIT_VARIANTS.has(subsectionName)) {
          return "Портрет каждого философа";
        }
        return subsectionName;
      }

// ───── [buildSubsectionMap] philosynth.html строки 9455–9481 ─────
      function buildSubsectionMap(p) {
        const level = p?.synthLevel || "comparative";

        // Собираем critique: вставляем пункты 2 и 3 (динамические) после пункта 1
        const critiqueBase = SUBSECTION_MAP_BASE.critique;
        const critique = [
          critiqueBase[0],                                          // Внутренняя когерентность
          SUBSECTION_CRITIQUE_NOVELTY[level] || "Оценка новизны",   // пункт 2
          SUBSECTION_CRITIQUE_CHECK[level] || "Верность источникам", // пункт 3
          ...critiqueBase.slice(1),                                  // Верность методу синтеза, Сохранение..., и т.д.
        ];

        // Собираем sum: заголовок «Портрет ...» зависит от кардинальности
        // участников. Остальные подразделы берём как есть.
        const sumBase = SUBSECTION_MAP_BASE.sum;
        const portraitTitle = SUBSECTION_SUM_PORTRAIT(p);
        const sum = sumBase.map(name =>
          name === "Портрет каждого философа" ? portraitTitle : name
        );

        return {
          ...SUBSECTION_MAP_BASE,
          sum,
          glossary: SUBSECTION_MAP_GLOSSARY[level] || SUBSECTION_MAP_GLOSSARY.comparative,
          critique,
        };
      }
