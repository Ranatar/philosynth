// Фрагменты philosynth.html (26 024 стр., ревизия 2026-07) для беседы 0.3b-seed-taxonomy
// Сгенерировано extract-fragments.py; при обновлении исходника — перегенерировать.

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
