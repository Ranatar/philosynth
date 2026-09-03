/**
 * graph-utils — состояние графа + динамические палитры + утилиты форм.
 * Беседа 1.7. Порт из philosynth.html:
 *  - graph-STATE [4389–4413] (фрагмент 1.7-graph-state-extras.js):
 *    G, roleMode="procedural", clusterVisible, clusterObjects3d/2d,
 *    graphAPI3d/2d, currentViewMode, legendFilter, clearLegendFilter;
 *  - палитры/утилиты из 1.7-graph-viz.js [13001–13707]:
 *    _TC_HUE_SEEDS/_EC_HUE_SEEDS/_EC_DASH_SEEDS/CPAL, _rebuildNodeColors,
 *    _rebuildEdgeStyles, _hexToHSL/_hslToHex/_blendHex, edgeTypeStyle,
 *    typeColor/typeColorHex, getTopRole, getStructuralMarkers(+Marker),
 *    getRolesFromLayer/getRolesForMode/getAllRoles, polyPath, hexStarPath,
 *    trapezoidPath, rectPath, nodeSymbolPath;
 *  - applyClusters3D/applyClusters2D [~16019/~16027].
 *
 * АДАПТАЦИИ (сервис):
 *  - Глобалы исходника собраны в один мутируемый объект `graphState`
 *    (ES-модули экспортируют read-only байндинги; имена полей 1:1).
 *    Сюда же — разделяемые между build3D/build2D/размонтированием
 *    renderer3d/scene3d/anim3d/sim2d/resizeObs3d (в исходнике — глобалы
 *    STATE вне фрагмента).
 *  - clearLegendFilter: вместо document.querySelectorAll(".gm-legend-clickable
 *    .active") — уведомление React-подписчика (setLegendFilterListener):
 *    active-классом легенды владеет React (грабля 1.6b — у DOM-узла один
 *    владелец).
 *  - buildGFromGraphData — НОВЫЙ адаптер: в исходнике G наполнял parseGraph
 *    из DOM; в сервисе парсер серверный (беседа 1.4), клиент получает
 *    GraphData (GET /syntheses/:id/categories, беседа 1.6) и переводит его
 *    в модель G исходника (рёбра по ИМЕНАМ узлов, топология картами
 *    имя→роли/кластеры). Флаг _extended приходит параметром
 *    (SynthesisFull.extGraphMetrics — GraphData его не несёт).
 *  - nodeGeometry3D живёт в utils/graph-geometry.ts (05-структура; в п.1
 *    первого запроса он упомянут и здесь — реэкспортом не дублируем,
 *    потребители импортируют из graph-geometry).
 */

import * as d3 from "d3";

import type * as THREE from "three";
import type { Simulation } from "d3";
import type { GraphData } from "@philosynth/shared/types/graph";

/* ══ Модель G (внутренняя модель исходника) ═══════════════════════════ */

/** Узел G — поля как в исходнике (parseGraph): name/type/def/orig/cen/cert… */
export interface GNode {
  /** id строки categories (беседа 5.2: кнопка ✎ в NodePanel → редактор
   *  категории); в исходнике узлу негде было хранить id — его не было */
  dbId?: string;
  name: string;
  type: string;
  def: string;
  orig: string;
  cen: number;
  cert: number;
  /** Индексы кластеров узла (массив, может быть пустым) */
  cluster: number[];
  _extended?: boolean;
  histSig?: number;
  innovDeg?: number;
  clarity?: number;
  breadth?: number;
  depth?: number;
  applic?: number;
}

/** Ребро G — по именам узлов (src/tgt), как в исходнике */
export interface GEdge {
  src: string;
  tgt: string;
  type: string;
  desc: string;
  dir: string;
  str: number;
  _extended?: boolean;
  certEdge?: number;
  innovDeg?: number;
  histSupport?: number;
  logNec?: number;
  ctxDep?: number;
}

export interface GTopology {
  /** имя узла → индексы кластеров */
  clusters: Record<string, number[]>;
  roles: {
    structural: Record<string, string[]>;
    procedural: Record<string, string[]>;
  };
  clusterLabels: string[];
}

export interface GModel {
  nodes: GNode[];
  edges: GEdge[];
  topology: GTopology;
}

export type RoleLayer = "structural" | "procedural";

export type LegendFilter =
  | { type: "role"; key: string; layer: RoleLayer }
  | { type: "cluster"; idx: number }
  | null;

/** API, которое build3D/build2D отдают легенде (graphAPI3d/2d исходника) */
export interface GraphViewAPI {
  applyRoleFilter: (roleKey: string, layer: RoleLayer) => void;
  applyClusterFilter: (clusterIdx: number) => void;
  clearSelection: () => void;
}

/* ── Данные панелей узла/связи (react-обвязка showNodePanel/showEdgePanel) ── */

export interface PanelLinkEnd {
  id: number;
  name: string;
}

/** Связь для списков панели узла (2D-links и links3d исходника) */
export interface PanelLink {
  source: PanelLinkEnd | number;
  target: PanelLinkEnd | number;
  type: string;
  dir: string;
  str: number;
  desc: string;
}

/** Узел для панели: G-узел + композиция ролей/кластеров (nodeData исходника) */
export type PanelNodeData = GNode & {
  id: number;
  cluster: number[];
  roles: Set<string>;
  structuralRoles: Set<string>;
  proceduralRoles: Set<string>;
};

/** Колбэки рендер-ядер вместо прямых showNodePanel/showEdgePanel исходника */
export interface PanelCallbacks {
  onShowNode: (d: PanelNodeData, links: PanelLink[]) => void;
  onShowEdge: (e: GEdge) => void;
  onHidePanel: () => void;
}

export interface ClusterObjects3D {
  shells: { mesh: THREE.Object3D; clusterIdx: number }[];
  labelSprites: { sprite: THREE.Object3D; clusterIdx: number }[];
}

export interface ClusterObjects2D {
  // d3-selections; типизируем ослабленно — метод-синтаксис (бивариантность)
  hull: { attr(name: string, value: unknown): unknown };
  label: { attr(name: string, value: unknown): unknown };
}

/* ══ graph-STATE [4389–4413] ══════════════════════════════════════════ */

interface GraphSharedState {
  G: GModel;
  clusterVisible: boolean;
  roleMode: RoleLayer;
  clusterObjects3d: ClusterObjects3D | null;
  clusterObjects2d: ClusterObjects2D | null;
  graphAPI3d: GraphViewAPI | null;
  graphAPI2d: GraphViewAPI | null;
  currentViewMode: "3d" | "2d";
  legendFilter: LegendFilter;
  /* — разделяемые ресурсы рендереров (глобалы STATE исходника) — */
  renderer3d: THREE.WebGLRenderer | null;
  scene3d: THREE.Scene | null;
  anim3d: number | null;
  sim2d: Simulation<d3.SimulationNodeDatum, undefined> | null;
  resizeObs3d: ResizeObserver | null;
}

export const graphState: GraphSharedState = {
  G: {
    nodes: [],
    edges: [],
    topology: {
      clusters: {},
      roles: { structural: {}, procedural: {} },
      clusterLabels: [],
    },
  },
  clusterVisible: false,
  roleMode: "procedural",
  clusterObjects3d: null,
  clusterObjects2d: null,
  graphAPI3d: null,
  graphAPI2d: null,
  currentViewMode: "3d",
  legendFilter: null,
  renderer3d: null,
  scene3d: null,
  anim3d: null,
  sim2d: null,
  resizeObs3d: null,
};

/** React-подписчик на сброс/смену фильтра легенды (адаптация clearLegendFilter) */
let _legendFilterListener: ((f: LegendFilter) => void) | null = null;

export function setLegendFilterListener(
  fn: ((f: LegendFilter) => void) | null,
): void {
  _legendFilterListener = fn;
}

export function setLegendFilter(f: LegendFilter): void {
  graphState.legendFilter = f;
  if (_legendFilterListener) _legendFilterListener(f);
}

/** clearLegendFilter [4408] — сброс фильтра; active-классы снимает React */
export function clearLegendFilter(): void {
  setLegendFilter(null);
}

/* ══ Динамические палитры узлов/рёбер [13001–13116] ═══════════════════ */

let _nodeColorMap = new Map<string, number>(); // stem → 0xRRGGBB

// Семена hue — чтобы одинаковые типы в разных графах получали похожие оттенки.
// Но итоговый цвет определяется набором типов конкретного графа (без повторов).
const _TC_HUE_SEEDS: Record<string, number> = {
  онтологическ: 215, эпистемологическ: 145, этическ: 40, аксиологическ: 42,
  метафизическ: 280, логическ: 168, практическ: 25, эстетическ: 340,
  антропологическ: 38, феноменологическ: 275, экзистенциальн: 5,
  социальн: 145, политическ: 207, теологическ: 195,
  // расширенные из MMD
  лингвистическ: 55, герменевтическ: 300, аналитическ: 190, междисциплинарн: 120,
};

export function _rebuildNodeColors(nodes: GNode[]): void {
  const stems = new Set<string>();
  for (const n of nodes) {
    if (!n.type) continue;
    for (const part of n.type
      .split(/[\/·,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean))
      stems.add(part);
  }
  _nodeColorMap = new Map();
  const arr = [...stems];
  // Сначала пытаемся использовать seed-hue (если есть)
  const usedHues: number[] = [];
  for (const stem of arr) {
    let bestSeed: number | null = null;
    for (const [k, h] of Object.entries(_TC_HUE_SEEDS)) {
      if (stem.includes(k)) {
        bestSeed = h;
        break;
      }
    }
    if (bestSeed != null) {
      // Немного смещаем, если hue уже занят
      let h = bestSeed;
      while (
        usedHues.some((uh) => Math.abs(((uh - h + 540) % 360) - 180) < 15)
      )
        h = (h + 23) % 360;
      usedHues.push(h);
      _nodeColorMap.set(stem, _hslToHex({ h, s: 0.62, l: 0.52 }));
    }
  }
  // Типы без seed — распределяем по свободным участкам
  const GOLDEN = 137.508;
  let freeIdx = 0;
  for (const stem of arr) {
    if (_nodeColorMap.has(stem)) continue;
    let h: number;
    do {
      h = (freeIdx++ * GOLDEN + 90) % 360;
    } while (
      usedHues.some((uh) => Math.abs(((uh - h + 540) % 360) - 180) < 15)
    );
    usedHues.push(h);
    _nodeColorMap.set(stem, _hslToHex({ h, s: 0.58, l: 0.5 }));
  }
}

export interface EdgeStyle {
  color: string;
  dash: string | null;
  dashPri?: number;
}

let _edgeStyleMap = new Map<string, EdgeStyle>(); // stem → { color, dash }

const _EC_HUE_SEEDS: Record<string, number> = {
  иерархическ: 200, диалектическ: 5, каузальн: 215, корреляционн: 0,
  дополнительност: 145, противоречи: 355, эмерджентн: 48,
  часть: 280, средство: 25, основани: 168, определяющ: 20, развити: 140,
  // расширенные из MMD
  конъюнктивн: 60, дизъюнктивн: 310, необходим: 190, достаточн: 175,
  тождеств: 230, аналоги: 85, реализаци: 35, конкретизаци: 70,
  обобщени: 250, дедуктивн: 210, индуктивн: 150, абдуктивн: 110,
  временн: 95, концептуальн: 260, выражени: 330, понимани: 290,
  мышлени: 300,
};
// Приоритет: какой dash-паттерн побеждает при нескольких типах.
// Чем выше pri — тем важнее визуальный сигнал этого типа.
const _EC_DASH_SEEDS: Record<string, { dash: string; pri: number }> = {
  противоречи: { dash: "7,3", pri: 7 }, // конфликт
  дизъюнктивн: { dash: "4,2", pri: 5 }, // логическое разделение
  аналоги: { dash: "12,4", pri: 3 }, // подобие — длинный штрих
  корреляционн: { dash: "2,3", pri: 2 }, // слабая связь — мелкий пунктир
};

export function _rebuildEdgeStyles(edges: GEdge[]): void {
  const stems = new Set<string>();
  for (const e of edges) {
    if (!e.type) continue;
    for (const part of e.type
      .split(/[\/·,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean))
      stems.add(part);
  }
  _edgeStyleMap = new Map();
  const arr = [...stems];
  const usedHues: number[] = [];
  let freeHueIdx = 0; // счётчик золотого угла (только для типов без hue-сида)
  for (const stem of arr) {
    // ── Hue ──
    let bestHue: number | null = null;
    for (const [k, h] of Object.entries(_EC_HUE_SEEDS)) {
      if (stem.includes(k)) {
        bestHue = h;
        break;
      }
    }
    let h: number;
    if (bestHue != null) {
      h = bestHue;
    } else {
      do {
        h = (freeHueIdx++ * 137.508 + 30) % 360;
      } while (
        usedHues.some((uh) => Math.abs(((uh - h + 540) % 360) - 180) < 12)
      );
    }
    while (usedHues.some((uh) => Math.abs(((uh - h + 540) % 360) - 180) < 12))
      h = (h + 19) % 360;
    usedHues.push(h);
    const hex = _hslToHex({ h, s: 0.55, l: 0.48 });

    // ── Dash + приоритет ──
    let dashInfo: { dash: string; pri: number } | null = null;
    for (const [k, info] of Object.entries(_EC_DASH_SEEDS)) {
      if (stem.includes(k)) {
        dashInfo = info;
        break;
      }
    }
    const dash = dashInfo ? dashInfo.dash : null;
    const dashPri = dashInfo ? dashInfo.pri : 0;

    _edgeStyleMap.set(stem, {
      color: "#" + hex.toString(16).padStart(6, "0"),
      dash,
      dashPri,
    });
  }
}

// ── Палитра кластеров ─────────────────────────────────────────────────
export const CPAL = [
  "#4a90d9", "#e8a838", "#50c878", "#e74c3c",
  "#9b59b6", "#1abc9c", "#f39c12", "#e91e63",
];

export const STRUCTURAL_PRIORITY = [
  "core", "generative", "bridge", "central", "peripheral",
];
export const PROCEDURAL_PRIORITY = [
  "synthesis",
  // dialectical
  "thesis", "antithesis",
  // deconstructive
  "deconstructed", "reassembled",
  // hermeneutical
  "horizon-expansion", "pre-horizon",
  // integrative
  "integrating", "foundation",
  // analytical
  "formalized", "verifying",
];

/* ══ HSL-утилиты для смешивания нескольких цветов [13139–13196] ═══════ */

export function _hexToHSL(hex: number): { h: number; s: number; l: number } {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s, l };
}

export function _hslToHex({
  h,
  s,
  l,
}: {
  h: number;
  s: number;
  l: number;
}): number {
  h = ((h % 360) + 360) % 360;
  function hue2rgb(p: number, q: number, t: number): number {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  if (s === 0) {
    const v = Math.round(l * 255);
    return (v << 16) | (v << 8) | v;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return (
    (Math.round(hue2rgb(p, q, h / 360 + 1 / 3) * 255) << 16) |
    (Math.round(hue2rgb(p, q, h / 360) * 255) << 8) |
    Math.round(hue2rgb(p, q, h / 360 - 1 / 3) * 255)
  );
}

// ── Цвет узла: поддержка нескольких типов («этическая / онтологическая») ──
// Разделители: / · , ;
export function _blendHex(hexArr: (number | null)[]): number {
  const valid = hexArr.filter((c): c is number => c != null);
  if (!valid.length) return 0x95a5a6;
  if (valid.length === 1) return valid[0]!;
  let sinH = 0,
    cosH = 0,
    sumS = 0,
    sumL = 0;
  for (const c of valid) {
    const { h, s, l } = _hexToHSL(c);
    sinH += Math.sin((h * Math.PI) / 180);
    cosH += Math.cos((h * Math.PI) / 180);
    sumS += s;
    sumL += l;
  }
  return _hslToHex({
    h: (Math.atan2(sinH, cosH) * 180) / Math.PI,
    s: sumS / valid.length,
    l: sumL / valid.length,
  });
}

// ── Стиль ребра: поддержка нескольких типов ───────────────────────────
// Цвета смешиваются через _blendHex.
// Dash берётся от типа с наивысшим dashPri (семантический вес).
// Например: «противоречие / корреляционная» → dash от противоречия (pri 7 > pri 2).
export function edgeTypeStyle(type: string): EdgeStyle {
  if (!type) return { color: "#444", dash: "3,3" };
  const parts = type
    .split(/[\/·,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const matched: EdgeStyle[] = [];
  for (const part of parts) {
    const t = part.toLowerCase();
    for (const [k, v] of _edgeStyleMap)
      if (t.includes(k) || k.includes(t)) {
        matched.push(v);
        break;
      }
  }
  if (!matched.length) return { color: "#b39ddb", dash: "4,2" };
  if (matched.length === 1) return matched[0]!;
  const mixed =
    "#" +
    _blendHex(matched.map((s) => parseInt(s.color.slice(1), 16)))
      .toString(16)
      .padStart(6, "0");
  // Dash: побеждает тип с наивысшим семантическим приоритетом
  const withDash = matched.filter((s) => s.dash);
  const dash = withDash.length
    ? withDash.sort((a, b) => (b.dashPri ?? 0) - (a.dashPri ?? 0))[0]!.dash
    : null;
  return { color: mixed, dash };
}

/* ══ Цвета/роли/маркеры [13534–13707] ═════════════════════════════════ */

export function typeColor(t: string): number {
  if (!t) return 0x95a5a6;
  const parts = t
    .split(/[\/·,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const colors = parts.map((part) => {
    const lp = part.toLowerCase();
    // Ищем по ключам _nodeColorMap (fuzzy: stem.includes)
    for (const [k, v] of _nodeColorMap)
      if (lp.includes(k) || k.includes(lp)) return v;
    return null;
  });
  return _blendHex(colors);
}

export function typeColorHex(t: string): string {
  return "#" + typeColor(t).toString(16).padStart(6, "0");
}

export function getTopRole(roles: Set<string>): string | null {
  const list =
    graphState.roleMode === "structural"
      ? STRUCTURAL_PRIORITY
      : PROCEDURAL_PRIORITY;
  for (const r of list) if (roles.has(r)) return r;
  return null;
}

export interface StructuralMarker {
  type: string;
  strokeWidth: number;
  strokeDash: string | null;
  filter: string | null;
  innerShape: boolean;
  innerScale?: number;
  innerDarken?: number;
  emissive3d: number;
  lightIntensity3d?: number;
}

/**
 * Возвращает МАССИВ всех структурных маркеров для узла.
 * Каждый элемент — объект с полями type, strokeWidth, strokeDash, filter,
 * innerShape, и т.д. Если ролей нет — возвращает пустой массив.
 */
export function getStructuralMarkers(name: string): StructuralMarker[] {
  const roles = getRolesFromLayer("structural", name);
  if (!roles.size) return [];

  const MARKER_DEFS: Record<string, StructuralMarker> = {
    core: {
      type: "core",
      strokeWidth: 2.5,
      strokeDash: null,
      filter: null,
      innerShape: true,
      innerScale: 0.55,
      innerDarken: 0.35,
      emissive3d: 0.15,
    },
    generative: {
      type: "generative",
      strokeWidth: 2,
      strokeDash: null,
      filter: "url(#glow-gen)",
      innerShape: false,
      emissive3d: 0.85,
      lightIntensity3d: 3.0,
    },
    bridge: {
      type: "bridge",
      strokeWidth: 2,
      strokeDash: "4,2.5",
      filter: null,
      innerShape: false,
      emissive3d: 0.15,
    },
    central: {
      type: "central",
      strokeWidth: 3.5,
      strokeDash: null,
      filter: null,
      innerShape: false,
      emissive3d: 0.3,
    },
    peripheral: {
      type: "peripheral",
      strokeWidth: 1,
      strokeDash: null,
      filter: null,
      innerShape: false,
      emissive3d: 0.05,
    },
  };

  const result: StructuralMarker[] = [];
  for (const r of STRUCTURAL_PRIORITY) {
    if (roles.has(r)) result.push(MARKER_DEFS[r]!);
  }
  return result;
}

/** Обратная совместимость: возвращает маркер с наивысшим приоритетом (или null). */
export function getStructuralMarker(name: string): StructuralMarker | null {
  const arr = getStructuralMarkers(name);
  return arr.length ? arr[0]! : null;
}

// ── Чтение ролей из двухслойной топологии ─────────────────────────────
export function getRolesFromLayer(layer: RoleLayer, name: string): Set<string> {
  const map = graphState.G.topology?.roles?.[layer] || {};
  const r = map[name];
  if (!r) return new Set();
  if (r instanceof Set) return r;
  if (Array.isArray(r)) return new Set(r);
  return new Set();
}

export function getRolesForMode(name: string): Set<string> {
  return getRolesFromLayer(graphState.roleMode, name);
}

export function getAllRoles(name: string): Set<string> {
  const s = getRolesFromLayer("structural", name);
  const p = getRolesFromLayer("procedural", name);
  return new Set([...s, ...p]);
}

/* ══ Формы узлов (2D) [13649–13705] ═══════════════════════════════════ */

// Восьмиугольник и шестиугольник — кастомные, остальные через D3
export function polyPath(sides: number, r: number): string {
  const pts = Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * 2 * Math.PI - Math.PI / 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  return "M" + pts.map((p) => p.join(",")).join("L") + "Z";
}

export function hexStarPath(r: number): string {
  const inner = r / Math.sqrt(3);
  let d = "";
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6 - Math.PI / 2; // 30° шаг, вершина вверху
    const rad = i % 2 === 0 ? r : inner;
    d +=
      (i === 0 ? "M" : "L") +
      (Math.cos(a) * rad).toFixed(3) +
      "," +
      (Math.sin(a) * rad).toFixed(3);
  }
  return d + "Z";
}

/** Трапеция (основание шире верха) */
export function trapezoidPath(r: number): string {
  const top = r * 0.6;
  const bot = r;
  const h = r * 0.8;
  return `M${-top},${-h} L${top},${-h} L${bot},${h} L${-bot},${h} Z`;
}

/** Прямоугольник (чуть вытянутый по горизонтали) */
export function rectPath(r: number): string {
  const w = r * 1.2;
  const h = r * 0.8;
  return `M${-w},${-h} L${w},${-h} L${w},${h} L${-w},${h} Z`;
}

/** Узел с ролями для nodeSymbolPath (2D-datum) */
export interface SymbolDatum {
  cen: number;
  roles: Set<string>;
}

export function nodeSymbolPath(d: SymbolDatum): string | null {
  const r = 6 + d.cen * 14;
  const area = Math.PI * r * r; // сохраняем площадь как у circle
  const role = getTopRole(d.roles);
  switch (role) {
    case "synthesis":
      return polyPath(8, r);
    case "thesis":
      return d3.symbol(d3.symbolTriangle, area)();
    case "antithesis":
      return d3.symbol(d3.symbolTriangle, area)(); // + rotate ниже
    case "generative":
      return polyPath(6, r);
    case "core":
      return d3.symbol(d3.symbolSquare, area)();
    case "bridge":
      return d3.symbol(d3.symbolSquare, area)();
    case "central":
      return polyPath(5, r);
    case "deconstructed":
      return d3.symbol(d3.symbolCross, area)();
    case "reassembled":
      return hexStarPath(r);
    case "horizon-expansion":
      return d3.symbol(d3.symbolDiamond, area)();
    case "pre-horizon":
      return polyPath(7, r);
    case "integrating":
      return d3.symbol(d3.symbolWye, area)();
    case "foundation":
      return trapezoidPath(r);
    case "formalized":
      return rectPath(r);
    case "verifying":
      return d3.symbol(d3.symbolStar, area)();
    default:
      return null; // null → рисовать circle
  }
}

/* ══ Кластеры: применение clusterVisible [~16019–16043] ═══════════════ */

// ── Применяет clusterVisible к объектам 3D-вида ───────────────────────
export function applyClusters3D(): void {
  if (!graphState.clusterObjects3d) return;
  const v = graphState.clusterVisible;
  graphState.clusterObjects3d.shells.forEach(({ mesh }) => {
    mesh.visible = v;
  });
  graphState.clusterObjects3d.labelSprites.forEach(({ sprite }) => {
    sprite.visible = v;
  });
}

// ── Применяет clusterVisible к объектам 2D-вида ───────────────────────
export function applyClusters2D(): void {
  if (!graphState.clusterObjects2d) return;
  const d = graphState.clusterVisible ? null : "none";
  graphState.clusterObjects2d.hull.attr("display", d);
  graphState.clusterObjects2d.label.attr("display", d);
}

/**
 * toggleClusters [16046] — переключатель ◎ Кластеры.
 * АДАПТАЦИЯ: active-классом кнопки владеет React (GraphModal);
 * здесь — только состояние и применение к обоим видам.
 */
export function setClusterVisible(v: boolean): void {
  graphState.clusterVisible = v;
  applyClusters3D();
  applyClusters2D();
}

/* ══ Адаптер GraphData → G (НОВОЕ, сервисная замена parseGraph-у) ═════ */

export function buildGFromGraphData(data: GraphData, extended: boolean): void {
  const idToName = new Map<string, string>();
  for (const c of data.categories) idToName.set(c.id, c.name);

  const nodes: GNode[] = data.categories.map((c) => ({
    dbId: c.id,
    name: c.name,
    type: c.type,
    def: c.definition,
    orig: c.origin,
    cen: c.centrality,
    cert: c.certainty,
    cluster: c.clusterIndices,
    _extended: extended,
    histSig: c.historicalSignificance,
    innovDeg: c.innovationDegree,
    clarity: c.clarity,
    breadth: c.breadth,
    depth: c.depthScore,
    applic: c.applicability,
  }));

  const edges: GEdge[] = data.edges
    .map((e) => ({
      src: idToName.get(e.sourceId) ?? "",
      tgt: idToName.get(e.targetId) ?? "",
      type: e.edgeType,
      desc: e.description,
      dir: e.direction,
      str: e.strength,
      _extended: extended,
      certEdge: e.certainty,
      innovDeg: e.innovationDegree,
      histSupport: e.historicalSupport,
      logNec: e.logicalNecessity,
      ctxDep: e.contextDependency,
    }))
    .filter((e) => e.src && e.tgt);

  const clusters: Record<string, number[]> = {};
  const structural: Record<string, string[]> = {};
  const procedural: Record<string, string[]> = {};
  for (const c of data.categories) {
    if (c.clusterIndices.length) clusters[c.name] = c.clusterIndices;
    if (c.structuralRoles.length) structural[c.name] = c.structuralRoles;
    if (c.proceduralRoles.length) procedural[c.name] = c.proceduralRoles;
  }

  const clusterLabels: string[] = [];
  for (const cl of data.clusters)
    clusterLabels[cl.clusterIndex] = cl.label;

  graphState.G = {
    nodes,
    edges,
    topology: { clusters, roles: { structural, procedural }, clusterLabels },
  };

  _rebuildNodeColors(nodes);
  _rebuildEdgeStyles(edges);
}
