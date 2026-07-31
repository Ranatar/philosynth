// Фрагмент philosynth.html (26025 строк) — собран
// scripts/extract-by-name.py по спецификации 1.7-graph-state-extras.spec.
//
// Номера строк ниже — РЕЗУЛЬТАТ поиска по именам, а не входные
// данные: при правке исходника достаточно перезапустить сборку,
// спецификация не устаревает. Имена берутся из
// docs/04-code-reuse-map.md.

// ───── Состояние графа и сброс фильтра легенды · var:G
// philosynth.html строки 4389–4392 ─────
        G = {
          nodes: [], edges: [],
          topology: { clusters: {}, roles: { structural: {}, procedural: {} }, clusterLabels: [] }
        },

// ───── Состояние графа и сброс фильтра легенды · var:clusterVisible
// philosynth.html строки 4400–4407 ─────
        clusterVisible   = false,
        roleMode         = "procedural",
        clusterObjects3d = null,
        clusterObjects2d = null,
        graphAPI3d       = null,
        graphAPI2d       = null,
        currentViewMode  = "3d",
        legendFilter     = null;

// ───── Состояние графа и сброс фильтра легенды · js:clearLegendFilter
// philosynth.html строки 4408–4413 ─────

      function clearLegendFilter() {
        legendFilter = null;
        document.querySelectorAll(".gm-legend-clickable.active")
          .forEach(a => a.classList.remove("active"));
      }
