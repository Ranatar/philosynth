// Фрагменты philosynth.html (26 024 стр., ревизия 2026-07)
// для беседы 1.7 — дополнение к 1.7-graph-viz.js.
//
// ВНИМАНИЕ: извлечено scripts/patch-docs-conv16-pre.py, а НЕ
// extract-fragments.py — того скрипта в репозитории нет. Диапазоны
// выверены аудитом 2026-07-30; при обновлении исходника перепроверить.
//
// Основной фрагмент 1.7-graph-viz.js покрывает 12990–16366 и полон.
// Вне его осталось только объявление graph-STATE: G, graphAPI3d/2d,
// roleMode, clusterVisible, legendFilter и clearLegendFilter —
// протокол требует их в graph-utils.ts, но извлечение по баннерам
// GRAPH MODAL…MMD EXPORT их не захватывало.
//
// Блок начинается с середины объявления через запятую: выше по
// тексту идут переменные STATE, к графу не относящиеся.


// ───── [graph-STATE и clearLegendFilter]
// philosynth.html строки 4389–4413 ─────
        G = {
          nodes: [], edges: [],
          topology: { clusters: {}, roles: { structural: {}, procedural: {} }, clusterLabels: [] }
        },
        //G = { nodes: [], edges: [], topology: { clusters: {}, roles: {}, clusterLabels: [] } };
        graphBodyIdx = -1,
        anim3d = null,
        renderer3d = null,
        scene3d = null,
        sim2d = null,
        resizeObs3d = null,
        clusterVisible   = false,
        roleMode         = "procedural",
        clusterObjects3d = null,
        clusterObjects2d = null,
        graphAPI3d       = null,
        graphAPI2d       = null,
        currentViewMode  = "3d",
        legendFilter     = null;

      function clearLegendFilter() {
        legendFilter = null;
        document.querySelectorAll(".gm-legend-clickable.active")
          .forEach(a => a.classList.remove("active"));
      }
