/**
 * Graph2D — D3.js-рендерер графа категорий. Беседа 1.7.
 *
 * Ядро buildGraph2D — БЛИЗКИЙ ПОРТ build2D() [14240] из 1.7-graph-viz.js:
 * та же силовая симуляция (link 260/str·0.18, charge −650, collide
 * 16+cen·26), SVG-маркеры стрелок по цветам рёбер (fwd / bi-end /
 * bi-start), формы узлов nodeSymbolPath + структурные маркеры (обводка /
 * пунктир / glow-gen / внутренний силуэт core), рефлексивные дуги
 * arcPath, кольца и hull-оболочки кластеров с метками, drag узлов,
 * hover-подсветка окрестности, клик-выделение узла/связи с диммированием,
 * фильтры легенды, зум 0.2..5.
 *
 * АДАПТАЦИИ (react-обвязка, структура ядра не переписана):
 *  - контейнер — параметр вместо getElementById("view2d");
 *  - глобалы sim2d/anim3d/resizeObs3d, G, legendFilter, clusterVisible,
 *    clusterObjects2d, graphAPI2d — из graphState (graph-utils);
 *  - showNodePanel/showEdgePanel и снятие панели → колбэки PanelCallbacks
 *    (панели — React-компоненты; у DOM один владелец — грабля 1.6b);
 *  - dispose2D — 2D-часть closeGraph(): stop симуляции + очистка контейнера.
 */

import { useEffect, useRef } from "react";

import * as d3 from "d3";

import {
  applyClusters2D,
  clearLegendFilter,
  edgeTypeStyle,
  getRolesFromLayer,
  getRolesForMode,
  getStructuralMarkers,
  getTopRole,
  graphState,
  nodeSymbolPath,
  typeColor,
  typeColorHex,
  _hexToHSL,
  _hslToHex,
  CPAL,
} from "./graph-utils";

import type {
  GEdge,
  GNode,
  PanelCallbacks,
  PanelLink,
  PanelNodeData,
  RoleLayer,
} from "./graph-utils";

/** Узел 2D-симуляции: G-узел + композиция ролей + поля d3 */
type Node2D = GNode &
  d3.SimulationNodeDatum & {
    id: number;
    cluster: number[];
    roles: Set<string>;
    structuralRoles: Set<string>;
    proceduralRoles: Set<string>;
  };

/** Ребро 2D: до старта симуляции — индексы, после — узлы (мутирует d3) */
interface Link2D {
  source: number | Node2D;
  target: number | Node2D;
  type: string;
  dir: string;
  str: number;
  desc: string;
}

/* ─────────────────────────────────────────────────────────────────────── */

export function buildGraph2D(ct: HTMLDivElement, panels: PanelCallbacks): void {
  const gs = graphState;
  const G = gs.G;

  if (gs.sim2d) {
    gs.sim2d.stop();
    gs.sim2d = null;
  }
  if (gs.anim3d) {
    cancelAnimationFrame(gs.anim3d);
    gs.anim3d = null;
  }
  if (gs.resizeObs3d) {
    gs.resizeObs3d.disconnect();
    gs.resizeObs3d = null;
  }
  ct.innerHTML = "";
  const W = ct.clientWidth,
    H = ct.clientHeight;

  // ── Подготовка данных ─────────────────────────────────────────────────
  const topo = G.topology || { clusters: {}, roles: {}, clusterLabels: [] };
  const nm: Record<string, number> = Object.fromEntries(
    G.nodes.map((n, i) => [n.name.toLowerCase(), i]),
  );

  const nodes: Node2D[] = G.nodes.map((n, i) => ({
    ...n,
    id: i,
    cluster: topo.clusters[n.name] ?? [],
    roles: getRolesForMode(n.name),
    structuralRoles: getRolesFromLayer("structural", n.name),
    proceduralRoles: getRolesFromLayer("procedural", n.name),
  }));

  const links: Link2D[] = G.edges
    .map((e) => ({
      source: nm[e.src.toLowerCase().trim()] ?? -1,
      target: nm[e.tgt.toLowerCase().trim()] ?? -1,
      type: e.type,
      dir: e.dir,
      str: e.str,
      desc: e.desc,
    }))
    .filter((l) => (l.source as number) >= 0 && (l.target as number) >= 0);

  const regularLinks = links.filter((l) => !l.dir.includes("рефлексив"));
  const reflLinks = links.filter((l) => l.dir.includes("рефлексив"));

  // Плоский массив: один элемент на каждую пару (узел, кластер).
  // offset — порядковый номер кластера в списке узла (0, 1, 2…),
  // определяет смещение радиуса концентрического кольца.
  const ringData = nodes.flatMap((n) =>
    n.cluster.map((clIdx, offset) => ({ node: n, clIdx, offset })),
  );

  // Группировка узлов по кластерам (для hull и меток)
  const clusterGroups: Record<number, Node2D[]> = {};
  nodes.forEach((n) => {
    n.cluster.forEach((clIdx) => {
      (clusterGroups[clIdx] ??= []).push(n);
    });
  });
  const clusterGroupEntries = Object.entries(clusterGroups).map(
    ([idxStr, members]) => ({ clIdx: Number(idxStr), members }),
  );

  // ── SVG-сцена ─────────────────────────────────────────────────────────
  const svg = d3
    .select(ct)
    .append("svg")
    .attr("width", W)
    .attr("height", H)
    .style("background", "#0a0a14");
  const g = svg.append("g");
  svg.call(
    d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on("zoom", (e) => g.attr("transform", e.transform)),
  );

  // ── Defs ──────────────────────────────────────────────────────────────
  const defs = g.append("defs");

  const glowFilter = defs.append("filter").attr("id", "glow2");
  glowFilter
    .append("feGaussianBlur")
    .attr("stdDeviation", "4")
    .attr("result", "blur");
  glowFilter
    .append("feMerge")
    .selectAll("feMergeNode")
    .data(["blur", "SourceGraphic"])
    .enter()
    .append("feMergeNode")
    .attr("in", (d) => d);

  const glowGen = defs
    .append("filter")
    .attr("id", "glow-gen")
    .attr("x", "-100%")
    .attr("y", "-100%")
    .attr("width", "300%")
    .attr("height", "300%");

  // Широкое внешнее свечение
  glowGen
    .append("feGaussianBlur")
    .attr("in", "SourceGraphic")
    .attr("stdDeviation", "10")
    .attr("result", "blurWide");

  // Плотное ближнее свечение
  glowGen
    .append("feGaussianBlur")
    .attr("in", "SourceGraphic")
    .attr("stdDeviation", "4")
    .attr("result", "blurTight");

  // Усиливаем насыщенность и яркость широкого слоя
  glowGen
    .append("feColorMatrix")
    .attr("in", "blurWide")
    .attr("type", "matrix")
    .attr(
      "values",
      "1.0 0   0   0 0 " +
        "0   1.0 0   0 0 " +
        "0   0   1.0 0 0 " +
        "0   0   0   1.0 0",
    )
    .attr("result", "glowWide");

  glowGen
    .append("feColorMatrix")
    .attr("in", "blurTight")
    .attr("type", "matrix")
    .attr(
      "values",
      "1.0 0   0   0 0 " +
        "0   1.0 0   0 0 " +
        "0   0   1.0 0 0 " +
        "0   0   0   1.0 0",
    )
    .attr("result", "glowTight");

  // Складываем: широкое + плотное + оригинал
  const merge = glowGen.append("feMerge");
  merge.append("feMergeNode").attr("in", "glowWide");
  merge.append("feMergeNode").attr("in", "glowTight");
  merge.append("feMergeNode").attr("in", "SourceGraphic");

  function addMarker(id: string, color: string, reverse: boolean): void {
    defs
      .append("marker")
      .attr("id", id)
      .attr("viewBox", "0 -3 6 6")
      .attr("refX", 6) // ← всегда 6
      .attr("refY", 0)
      .attr("markerWidth", 4)
      .attr("markerHeight", 4)
      .attr("orient", reverse ? "auto-start-reverse" : "auto")
      .append("path")
      .attr("d", "M0,-3L6,0L0,3")
      .attr("fill", color);
  }

  // Собираем все уникальные цвета рёбер
  const markerColorSet = new Set<string>();
  links.forEach((l) => markerColorSet.add(edgeTypeStyle(l.type).color));

  // Создаём по три маркера на каждый цвет
  function colorId(hex: string): string {
    return hex.replace("#", "");
  }
  markerColorSet.forEach((color) => {
    const cid = colorId(color);
    addMarker(`arr-fwd-${cid}`, color, false);
    addMarker(`arr-bi-end-${cid}`, color, false);
    addMarker(`arr-bi-start-${cid}`, color, true);
  });

  // ── Геометрия рёбер ───────────────────────────────────────────────────
  function edgeEndpoints(d: Link2D): {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } {
    const s = d.source as Node2D,
      t = d.target as Node2D;
    const sx = s.x!,
      sy = s.y!;
    const tx = t.x!,
      ty = t.y!;
    const angle = Math.atan2(ty - sy, tx - sx);
    const rs = 6 + (s.cen || 0) * 14;
    const rt = 6 + (t.cen || 0) * 14;
    return {
      x1: sx + Math.cos(angle) * rs,
      y1: sy + Math.sin(angle) * rs,
      x2: tx - Math.cos(angle) * rt,
      y2: ty - Math.sin(angle) * rt,
    };
  }

  // Рефлексивная дуга: радиус зависит от размера узла
  function arcPath(d: Link2D): string {
    const src = typeof d.source === "object" ? d.source : nodes[d.source]!;
    const x = src.x!;
    const y = src.y!;
    const cen = src.cen || 0;
    const r = 18 + cen * 12;
    return `M${x},${y}A${r},${r},0,1,1,${x + 1},${y + 1}`;
  }

  // ── Симуляция ─────────────────────────────────────────────────────────
  const sim = d3
    .forceSimulation<Node2D>(nodes)
    .force(
      "link",
      d3
        .forceLink<Node2D, Link2D>(links)
        .id((d) => d.id)
        .distance(260)
        .strength((d) => (d.str || 0.1) * 0.18),
    )
    .force("charge", d3.forceManyBody().strength(-650))
    .force("center", d3.forceCenter(W / 2, H / 2))
    .force(
      "collision",
      d3.forceCollide<Node2D>().radius((d) => 16 + d.cen * 26),
    );
  gs.sim2d = sim as unknown as typeof gs.sim2d;

  // ── Невидимые зоны попадания ──────────────────────────────────────────
  const linkHit = g
    .selectAll(".edge-hit")
    .data(regularLinks)
    .enter()
    .append("line")
    .attr("class", "edge-hit")
    .attr("stroke", "transparent")
    .attr("stroke-width", 12)
    .style("cursor", "pointer");
  linkHit.append("title").text((d) => `${d.desc}\n[${d.type}]\n${d.dir}`);

  const arcHit = g
    .selectAll(".edge-arc-hit")
    .data(reflLinks)
    .enter()
    .append("path")
    .attr("class", "edge-arc-hit")
    .attr("fill", "none")
    .attr("stroke", "transparent")
    .attr("stroke-width", 10)
    .style("cursor", "pointer");
  arcHit.append("title").text((d) => `${d.desc}\n[${d.type}]\n${d.dir}`);

  // ── Видимые рёбра ─────────────────────────────────────────────────────
  const link = g
    .selectAll(".edge-line")
    .data(regularLinks)
    .enter()
    .append("line")
    .attr("class", "edge-line")
    .attr("stroke-linecap", "round")
    .each(function (d) {
      const { color, dash } = edgeTypeStyle(d.type);
      const cid = colorId(color);
      const isBi = d.dir.includes("двунаправлен");
      // Слабые связи (str < 0.3) всегда пунктирные, даже если тип сплошной
      const finalDash = dash || (d.str < 0.3 ? "3,3" : null);
      d3.select(this)
        .attr("stroke", color)
        .attr("stroke-opacity", 0.25 + (d.str || 0.5) * 0.55)
        .attr("stroke-width", 1 + (d.str || 0.5) * 2.5)
        .attr("stroke-dasharray", finalDash)
        .attr(
          "marker-end",
          isBi ? `url(#arr-bi-end-${cid})` : `url(#arr-fwd-${cid})`,
        )
        .attr("marker-start", isBi ? `url(#arr-bi-start-${cid})` : null);
    });

  const arc = g
    .selectAll(".edge-arc")
    .data(reflLinks)
    .enter()
    .append("path")
    .attr("class", "edge-arc")
    .attr("fill", "none")
    .each(function (d) {
      const { color } = edgeTypeStyle(d.type);
      d3.select(this)
        .attr("stroke", color)
        .attr("stroke-opacity", 0.7)
        .attr("stroke-width", 2);
    });

  // ── Кольца кластеров (под узлами) ─────────────────────────────────────
  const clusterRing = g
    .selectAll(".cluster-ring")
    .data(ringData)
    .enter()
    .append("circle")
    .attr("class", "cluster-ring")
    .attr("r", (d) => 6 + d.node.cen * 14 + 6 + d.offset * 5)
    .attr("fill", "none")
    .attr("stroke", (d) => CPAL[d.clIdx % CPAL.length]!)
    .attr("stroke-opacity", 0.5)
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "3,2")
    .attr("pointer-events", "none");

  // ── Выпуклые оболочки кластеров (под узлами) ──────────────────────────
  const clusterHull = g
    .selectAll(".cluster-hull")
    .data(clusterGroupEntries)
    .enter()
    .append("path")
    .attr("class", "cluster-hull")
    .attr("fill", (d) => CPAL[d.clIdx % CPAL.length]!)
    .attr("fill-opacity", 0.06)
    .attr("stroke", (d) => CPAL[d.clIdx % CPAL.length]!)
    .attr("stroke-opacity", 0.3)
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "6,3")
    .attr("stroke-linejoin", "round")
    .attr("pointer-events", "none")
    .attr("d", "");

  // ── Текстовые метки кластеров ─────────────────────────────────────────
  const clusterLabel2d = g
    .selectAll(".cluster-label")
    .data(clusterGroupEntries)
    .enter()
    .append("text")
    .attr("class", "cluster-label")
    .attr("font-family", "IBM Plex Mono, monospace")
    .attr("font-size", "9px")
    .attr("letter-spacing", "1px")
    .attr("fill", (d) => CPAL[d.clIdx % CPAL.length]!)
    .attr("fill-opacity", 0.55)
    .attr("text-anchor", "middle")
    .attr("pointer-events", "none")
    .text((d) => {
      const raw = topo.clusterLabels?.[d.clIdx] || `Кластер ${d.clIdx + 1}`;
      return raw.replace(/^[IVXLCDM]+\s*[-–—]\s*/i, "").trim();
    });

  // ── Узлы ──────────────────────────────────────────────────────────────
  const nodeEnter = g
    .selectAll(".node-g")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", "node-g")
    .style("cursor", "pointer");

  // Для каждого узла — circle или path в зависимости от роли
  nodeEnter.each(function (d) {
    // Процессуальная роль → форма (ВСЕГДА)
    const procRoles = getRolesFromLayer("procedural", d.name);
    const procRole = getTopRole(procRoles);
    // NB: getTopRole смотрит PROCEDURAL_PRIORITY,
    // т.к. roleMode = "procedural" зафиксирован

    const r = 6 + d.cen * 14;
    const fill = typeColorHex(d.type);
    const fillOp = 0.2 + (d.cert ?? 0.5) * 0.65;
    const sel = d3.select(this);

    // Структурный маркер → наложение
    const sms = getStructuralMarkers(d.name);

    // ── Основная фигура ──
    if (!procRole || procRole === "peripheral") {
      sel.append("circle").attr("class", "node-circle").attr("r", r);
    } else {
      const rot =
        procRole === "antithesis"
          ? "rotate(180)"
          : procRole === "core"
            ? "rotate(45)"
            : procRole === "formalized"
              ? "rotate(0)"
              : null;
      sel
        .append("path")
        .attr("class", "node-circle")
        .attr("transform", rot)
        .attr("d", nodeSymbolPath(d));
      // NB: nodeSymbolPath вызывает getTopRole(d.roles),
      // а d.roles = getRolesForMode(name) — это всегда procedural
    }

    // ── Стилизация основной фигуры: объединяем маркеры ──
    // central/peripheral → strokeWidth; bridge → strokeDash;
    // generative → filter; прочее — default
    let strokeW = 2;
    let strokeDash: string | null = null;
    let svgFilter: string | null = null;
    let hasInner = false;
    let innerScale = 0.55;
    let innerDarken = 0.35;
    for (const sm of sms) {
      if (sm.type === "central" || sm.type === "peripheral")
        strokeW = sm.strokeWidth;
      if (sm.strokeDash) strokeDash = sm.strokeDash;
      if (sm.filter) svgFilter = sm.filter;
      if (sm.innerShape) {
        hasInner = true;
        innerScale = sm.innerScale ?? 0.55;
        innerDarken = sm.innerDarken ?? 0.35;
      }
    }

    sel
      .select(".node-circle")
      .attr("fill", fill)
      .attr("fill-opacity", fillOp)
      .attr("stroke", fill)
      .attr("stroke-width", strokeW)
      .attr("stroke-dasharray", strokeDash)
      .attr("filter", svgFilter);

    sel.attr("data-base-filter", svgFilter || "");

    // ── Внутренний силуэт (core) ──
    if (hasInner) {
      const innerR = r * innerScale;
      const hsl = _hexToHSL(typeColor(d.type));
      const darkHex =
        "#" +
        _hslToHex({
          h: hsl.h,
          s: hsl.s * 0.9,
          l: Math.max(0.08, hsl.l - innerDarken),
        })
          .toString(16)
          .padStart(6, "0");

      if (!procRole || procRole === "peripheral") {
        // Основа — circle → вложенный circle
        sel
          .append("circle")
          .attr("class", "node-inner")
          .attr("r", innerR)
          .attr("fill", darkHex)
          .attr("fill-opacity", 0.85)
          .attr("stroke", "none")
          .attr("pointer-events", "none");
      } else {
        // Основа — path → вложенный path той же формы, масштабированный
        const rot =
          procRole === "antithesis"
            ? "rotate(180)"
            : procRole === "core"
              ? "rotate(45)"
              : null;
        // Временный объект с уменьшенным cen для nodeSymbolPath
        const innerD = { ...d, cen: d.cen * innerScale };
        const innerPath = nodeSymbolPath(innerD);
        if (innerPath) {
          sel
            .append("path")
            .attr("class", "node-inner")
            .attr("d", innerPath)
            .attr("transform", rot)
            .attr("fill", darkHex)
            .attr("fill-opacity", 0.85)
            .attr("stroke", "none")
            .attr("pointer-events", "none");
        } else {
          // Фолбэк — circle
          sel
            .append("circle")
            .attr("class", "node-inner")
            .attr("r", innerR)
            .attr("fill", darkHex)
            .attr("fill-opacity", 0.85)
            .attr("stroke", "none")
            .attr("pointer-events", "none");
        }
      }
    }
  });

  const node = nodeEnter; // далее весь код hover/click работает через nodeEnter

  // ── Drag ──────────────────────────────────────────────────────────────
  node.call(
    d3
      .drag<SVGGElement, Node2D>()
      .on("start", (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }),
  );

  // ── Метки ─────────────────────────────────────────────────────────────
  const label = g
    .selectAll(".node-label")
    .data(nodes)
    .enter()
    .append("text")
    .attr("class", "node-label")
    .attr("dy", (d) => -(9 + d.cen * 14))
    .attr("text-anchor", "middle")
    .attr("pointer-events", "none")
    .text((d) => d.name);

  // ── Hover: подсветка окрестности ─────────────────────────────────────

  // Переменная выбранного узла (по клику)
  let selected2d: number | null = null;
  let legendFilterActive2d = false; // флаг: фильтр легенды сейчас применён

  let selectedEdge2d: Link2D | null = null; // выбранная связь или null

  // Применяет диммирование несвязанных (вызывается при клике)
  function applyDim2d(d: Node2D): void {
    const nbrIds = new Set([d.id]);
    links.forEach((l) => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      if (s === d.id) nbrIds.add(t);
      if (t === d.id) nbrIds.add(s);
    });
    const DIM = 0.08;
    node.attr("opacity", (n) => (nbrIds.has(n.id) ? 1 : DIM));
    label.attr("opacity", (n) => (nbrIds.has(n.id) ? 1 : DIM));
    clusterRing.attr("opacity", (rd) => (nbrIds.has(rd.node.id) ? 1 : DIM));
    // Hull и метки: диммируем кластеры, не содержащие выбранный узел
    clusterHull.attr("opacity", (cd) =>
      cd.members.some((m) => nbrIds.has(m.id)) ? 1 : DIM,
    );
    clusterLabel2d.attr("opacity", (cd) =>
      cd.members.some((m) => nbrIds.has(m.id)) ? 1 : DIM,
    );
    link.attr("opacity", (l) => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      return s === d.id || t === d.id ? 1 : DIM * 0.5;
    });
    arc.attr("opacity", (l) => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      return s === d.id ? 1 : DIM * 0.5;
    });
  }

  // Снимает диммирование
  function resetDim2d(): void {
    node.attr("opacity", 1);
    label.attr("opacity", 1);
    clusterRing.attr("opacity", 1);
    clusterHull.attr("opacity", 1);
    clusterLabel2d.attr("opacity", 1);
    link.attr("opacity", null);
    arc.attr("opacity", null);
  }

  // ── Фильтрация из легенды: роль ──────────────────────────────────────
  function applyRoleFilter2d(roleKey: string, layer: RoleLayer): void {
    selected2d = null;
    selectedEdge2d = null;
    legendFilterActive2d = true;
    const matchIds = new Set<number>();
    nodes.forEach((n) => {
      const roles = getRolesFromLayer(layer, n.name);
      if (roles.has(roleKey)) matchIds.add(n.id);
    });
    const DIM = 0.08;
    node.attr("opacity", (n) => (matchIds.has(n.id) ? 1 : DIM));
    label.attr("opacity", (n) => (matchIds.has(n.id) ? 1 : DIM));
    clusterRing.attr("opacity", (rd) => (matchIds.has(rd.node.id) ? 1 : DIM));
    clusterHull.attr("opacity", (cd) =>
      cd.members.some((m) => matchIds.has(m.id)) ? 1 : DIM,
    );
    clusterLabel2d.attr("opacity", (cd) =>
      cd.members.some((m) => matchIds.has(m.id)) ? 1 : DIM,
    );
    link.attr("opacity", (l) => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      return matchIds.has(s) && matchIds.has(t) ? 1 : DIM * 0.5;
    });
    arc.attr("opacity", (l) => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      return matchIds.has(s) ? 1 : DIM * 0.5;
    });
    // Восстановить видимость hull-оболочек (могли быть скрыты фильтром кластера)
    applyClusters2D();
  }

  // ── Фильтрация из легенды: кластер ──────────────────────────────────
  function applyClusterFilter2d(clusterIdx: number): void {
    selected2d = null;
    selectedEdge2d = null;
    legendFilterActive2d = true;
    const matchIds = new Set<number>();
    nodes.forEach((n) => {
      const cl = topo?.clusters?.[n.name] || [];
      if (cl.includes(clusterIdx)) matchIds.add(n.id);
    });
    const DIM = 0.08;
    node.attr("opacity", (n) => (matchIds.has(n.id) ? 1 : DIM));
    label.attr("opacity", (n) => (matchIds.has(n.id) ? 1 : DIM));
    clusterRing.attr("opacity", (rd) => (matchIds.has(rd.node.id) ? 1 : DIM));
    link.attr("opacity", (l) => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      return matchIds.has(s) && matchIds.has(t) ? 1 : DIM * 0.5;
    });
    arc.attr("opacity", (l) => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      return matchIds.has(s) ? 1 : DIM * 0.5;
    });
    // Hull: только выбранный кластер
    if (gs.clusterVisible) {
      clusterHull
        .attr("opacity", 1)
        .attr("display", (cd) => (cd.clIdx === clusterIdx ? null : "none"));
      clusterLabel2d
        .attr("opacity", 1)
        .attr("display", (cd) => (cd.clIdx === clusterIdx ? null : "none"));
    } else {
      clusterHull.attr("opacity", (cd) =>
        cd.members.some((m) => matchIds.has(m.id)) ? 1 : DIM,
      );
      clusterLabel2d.attr("opacity", (cd) =>
        cd.members.some((m) => matchIds.has(m.id)) ? 1 : DIM,
      );
    }
  }

  // Диммирование при выборе связи
  function applyEdgeDim2d(l: Link2D): void {
    const sId = typeof l.source === "object" ? l.source.id : l.source;
    const tId = typeof l.target === "object" ? l.target.id : l.target;
    const endpointIds = new Set([sId, tId]);
    const DIM = 0.08;

    node.attr("opacity", (n) => (endpointIds.has(n.id) ? 1 : DIM));
    label.attr("opacity", (n) => (endpointIds.has(n.id) ? 1 : DIM));
    clusterRing.attr("opacity", (rd) =>
      endpointIds.has(rd.node.id) ? 1 : DIM,
    );
    clusterHull.attr("opacity", (cd) =>
      cd.members.some((m) => endpointIds.has(m.id)) ? 1 : DIM,
    );
    clusterLabel2d.attr("opacity", (cd) =>
      cd.members.some((m) => endpointIds.has(m.id)) ? 1 : DIM,
    );

    // Все связи диммим, кроме выбранной
    link.attr("opacity", (e) => {
      const es = typeof e.source === "object" ? e.source.id : e.source;
      const et = typeof e.target === "object" ? e.target.id : e.target;
      return (es === sId && et === tId) || (es === tId && et === sId)
        ? 1
        : DIM * 0.5;
    });
    arc.attr("opacity", (e) => {
      const es = typeof e.source === "object" ? e.source.id : e.source;
      return es === sId && sId === tId ? 1 : DIM * 0.5;
    });
  }

  node
    .on("mouseover", function (_event, d) {
      const nbrIds = new Set([d.id]);
      links.forEach((l) => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        if (s === d.id) nbrIds.add(t);
        if (t === d.id) nbrIds.add(s);
      });

      node.attr("filter", function (n) {
        const base = d3.select(this).attr("data-base-filter");
        if (base) return base; // свой фильтр → не трогаем
        return nbrIds.has(n.id) ? "url(#glow2)" : null;
      });

      // stroke-opacity, а не opacity
      link.attr("stroke-opacity", (l) => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        const t = typeof l.target === "object" ? l.target.id : l.target;
        return s === d.id || t === d.id ? 1 : 0.25 + (l.str || 0.5) * 0.55;
      });
      arc.attr("stroke-opacity", (l) => {
        const s = typeof l.source === "object" ? l.source.id : l.source;
        return s === d.id ? 1 : 0.7;
      });

      d3.select(this).raise();
    })
    .on("mouseout", function () {
      node.each(function () {
        const base = d3.select(this).attr("data-base-filter");
        d3.select(this).attr("filter", base || null);
      });
      // Восстанавливаем stroke-opacity явно по формуле
      link.attr("stroke-opacity", (l) => 0.25 + (l.str || 0.5) * 0.55);
      arc.attr("stroke-opacity", 0.7);
      // Снимаем opacity-диммирование от клика (если было)
      link.attr("opacity", null);
      arc.attr("opacity", null);
      // Восстанавливаем диммирование выбранного узла или фильтра легенды
      if (legendFilterActive2d && gs.legendFilter) {
        if (gs.legendFilter.type === "role")
          applyRoleFilter2d(gs.legendFilter.key, gs.legendFilter.layer);
        else if (gs.legendFilter.type === "cluster")
          applyClusterFilter2d(gs.legendFilter.idx);
      } else if (selected2d !== null) {
        const selData = nodes.find((n) => n.id === selected2d);
        if (selData) applyDim2d(selData);
      }
    });

  // ── Hover по связям ──────────────────────────────────────────────────
  function edgeHoverOn(_event: unknown, l: Link2D): void {
    const sId = typeof l.source === "object" ? l.source.id : l.source;
    const tId = typeof l.target === "object" ? l.target.id : l.target;
    const endIds = new Set([sId, tId]);

    // Подсветка узлов-концов (если нет активного выделения)
    if (!selected2d && !selectedEdge2d) {
      node.attr("filter", function (n) {
        const base = d3.select(this).attr("data-base-filter");
        if (base) return base;
        return endIds.has(n.id) ? "url(#glow2)" : null;
      });
    }

    // Подсветка самой связи
    link.attr("stroke-opacity", (e) => {
      const es = typeof e.source === "object" ? e.source.id : e.source;
      const et = typeof e.target === "object" ? e.target.id : e.target;
      if ((es === sId && et === tId) || (es === tId && et === sId)) return 1;
      return 0.25 + (e.str || 0.5) * 0.55;
    });
    arc.attr("stroke-opacity", (e) => {
      const es = typeof e.source === "object" ? e.source.id : e.source;
      return es === sId && sId === tId ? 1 : 0.7;
    });
  }

  function edgeHoverOff(): void {
    // Восстановить фильтры узлов
    node.each(function () {
      const base = d3.select(this).attr("data-base-filter");
      d3.select(this).attr("filter", base || null);
    });
    // Восстановить opacity связей
    link.attr("stroke-opacity", (l) => 0.25 + (l.str || 0.5) * 0.55);
    arc.attr("stroke-opacity", 0.7);
    link.attr("opacity", null);
    arc.attr("opacity", null);
    // Если есть фильтр легенды — восстановить его
    if (legendFilterActive2d && gs.legendFilter) {
      if (gs.legendFilter.type === "role")
        applyRoleFilter2d(gs.legendFilter.key, gs.legendFilter.layer);
      else if (gs.legendFilter.type === "cluster")
        applyClusterFilter2d(gs.legendFilter.idx);
    }
    // Если есть выделение — восстановить его dim
    else if (selectedEdge2d) applyEdgeDim2d(selectedEdge2d);
    else if (selected2d !== null) {
      const selData = nodes.find((n) => n.id === selected2d);
      if (selData) applyDim2d(selData);
    }
  }

  linkHit
    .style("cursor", "pointer")
    .on("mouseover", edgeHoverOn)
    .on("mouseout", edgeHoverOff);

  arcHit
    .style("cursor", "pointer")
    .on("mouseover", edgeHoverOn)
    .on("mouseout", edgeHoverOff);

  // ── Клик по связям ───────────────────────────────────────────────────
  function edgeClick(event: Event, l: Link2D): void {
    event.stopPropagation();
    clearLegendFilter();
    legendFilterActive2d = false;

    const sId = typeof l.source === "object" ? l.source.id : l.source;
    const tId = typeof l.target === "object" ? l.target.id : l.target;

    // Если кликнули повторно по той же связи — снять выделение
    if (
      selectedEdge2d &&
      typeof selectedEdge2d.source === "object" &&
      selectedEdge2d.source.id === sId &&
      (typeof selectedEdge2d.target === "object"
        ? selectedEdge2d.target.id
        : selectedEdge2d.target) === tId
    ) {
      selectedEdge2d = null;
      selected2d = null;
      resetDim2d();
      panels.onHidePanel();
      return;
    }

    // Снять узловое выделение, установить рёберное
    selected2d = null;
    selectedEdge2d = l;
    applyEdgeDim2d(l);

    // Восстановить исходные данные G.edges для панели
    const srcName =
      typeof l.source === "object" ? l.source.name : G.nodes[l.source]?.name;
    const tgtName =
      typeof l.target === "object" ? l.target.name : G.nodes[l.target]?.name;
    const origEdge: GEdge =
      G.edges.find(
        (e) =>
          e.src.toLowerCase().trim() === (srcName || "").toLowerCase().trim() &&
          e.tgt.toLowerCase().trim() === (tgtName || "").toLowerCase().trim() &&
          e.type === l.type,
      ) ||
      ({
        src: srcName ?? "",
        tgt: tgtName ?? "",
        type: l.type,
        dir: l.dir,
        str: l.str,
        desc: l.desc,
      } as GEdge);

    panels.onShowEdge(origEdge);
  }

  linkHit.on("click", edgeClick);
  arcHit.on("click", edgeClick);

  // ── Клик: диммирование + панель ──────────────────────────────────────
  node.on("click", function (event, d) {
    event.stopPropagation();
    clearLegendFilter();
    legendFilterActive2d = false;
    if (selected2d === d.id) {
      // Повторный клик по тому же узлу — снять выделение
      selected2d = null;
      selectedEdge2d = null;
      resetDim2d();
      panels.onHidePanel();
    } else {
      selectedEdge2d = null;
      selected2d = d.id;
      applyDim2d(d);
      panels.onShowNode(d as PanelNodeData, links as PanelLink[]);
    }
  });
  svg.on("click", () => {
    clearLegendFilter();
    legendFilterActive2d = false;
    selected2d = null;
    selectedEdge2d = null;
    resetDim2d();
    panels.onHidePanel();
  });

  // ── Tick ──────────────────────────────────────────────────────────────
  sim.on("tick", () => {
    link.each(function (d) {
      const { x1, y1, x2, y2 } = edgeEndpoints(d);
      d3.select(this).attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
    });
    linkHit.each(function (d) {
      const { x1, y1, x2, y2 } = edgeEndpoints(d);
      d3.select(this).attr("x1", x1).attr("y1", y1).attr("x2", x2).attr("y2", y2);
    });
    arc.attr("d", arcPath);
    arcHit.attr("d", arcPath);
    node.attr("transform", (d) => `translate(${d.x},${d.y})`); // ← заменяет cx/cy
    clusterRing.attr("cx", (d) => d.node.x!).attr("cy", (d) => d.node.y!);
    label.attr("x", (d) => d.x!).attr("y", (d) => d.y!);

    // Hull-оболочки и метки кластеров
    clusterHull.attr("d", (d) => {
      // Отступ вокруг каждого узла — чтобы hull не прилипал вплотную к точкам
      const PAD = 22;
      // Набираем точки с «подушкой»: для каждого узла добавляем 8 смещённых точек
      const pts: [number, number][] = [];
      d.members.forEach((n) => {
        const r = 6 + (n.cen || 0) * 14 + PAD;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * 2 * Math.PI;
          pts.push([n.x! + Math.cos(a) * r, n.y! + Math.sin(a) * r]);
        }
      });
      const hull = d3.polygonHull(pts);
      if (!hull) return "";
      return "M" + hull.map((p) => p.join(",")).join("L") + "Z";
    });

    clusterLabel2d.each(function (d) {
      // Позиция метки — над самой верхней точкой hull (минимальный y)
      const PAD = 22;
      const pts: [number, number][] = [];
      d.members.forEach((n) => {
        const r = 6 + (n.cen || 0) * 14 + PAD;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * 2 * Math.PI;
          pts.push([n.x! + Math.cos(a) * r, n.y! + Math.sin(a) * r]);
        }
      });
      const hull = d3.polygonHull(pts);
      if (!hull) return;
      const topPt = hull.reduce((a, b) => (b[1] < a[1] ? b : a));
      d3.select(this).attr("x", topPt[0]).attr("y", topPt[1] - 5);
    });
  });
  // Сохраняем ссылки для toggleClusters и применяем текущее состояние
  gs.clusterObjects2d = { hull: clusterHull, label: clusterLabel2d };
  applyClusters2D();

  // Экспорт API для легенды
  gs.graphAPI2d = {
    applyRoleFilter: applyRoleFilter2d,
    applyClusterFilter: applyClusterFilter2d,
    clearSelection() {
      selected2d = null;
      selectedEdge2d = null;
      legendFilterActive2d = false;
      resetDim2d();
      applyClusters2D();
      panels.onHidePanel();
    },
  };
}

/** 2D-часть closeGraph(): stop симуляции + очистка контейнера */
export function disposeGraph2D(ct: HTMLDivElement | null): void {
  const gs = graphState;
  if (gs.sim2d) {
    gs.sim2d.stop();
    gs.sim2d = null;
  }
  if (ct) ct.innerHTML = "";
  gs.clusterObjects2d = null;
  gs.graphAPI2d = null;
}

/* ── React-обвязка ──────────────────────────────────────────────────── */

export interface Graph2DProps {
  panels: PanelCallbacks;
}

export default function Graph2D({ panels }: Graph2DProps) {
  const ref = useRef<HTMLDivElement>(null);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;

  useEffect(() => {
    const ct = ref.current;
    if (!ct) return;
    const delegate: PanelCallbacks = {
      onShowNode: (d, links) => panelsRef.current.onShowNode(d, links),
      onShowEdge: (e) => panelsRef.current.onShowEdge(e),
      onHidePanel: () => panelsRef.current.onHidePanel(),
    };
    buildGraph2D(ct, delegate);
    return () => disposeGraph2D(ct);
    // Пересборка — только при переключении вида (unmount/mount), как в исходнике
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="gm-view active" ref={ref} />;
}
