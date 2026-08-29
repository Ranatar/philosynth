/**
 * graph-style — серверная копия палитр/стилей/ролей клиентского
 * client/src/components/graph/graph-utils.ts (беседа 1.7) для экспортёров
 * 4.2 (exportMMD/exportPNG). Тела функций — дословно оттуда (тот, в свою
 * очередь, — дословный порт [13001–13707] исходника).
 *
 * ЗАЧЕМ КОПИЯ. Кросс-мировые импорты клиента с сервера запрещены
 * (грабля Фазы 0: TS5097/TS6142), а клиентский модуль тянет d3 и держит
 * состояние в graphState. Прецедент копии со сторожем дрейфа —
 * MODE_UI ↔ MODE_CONFIG беседы 4.1 (integration-check 4x); секцию
 * дрейф-контроля этой пары добавит завершение беседы 4.2.
 *
 * АДАПТАЦИИ (обе — следствия конкурентности сервера):
 *  1. Модульные карты _nodeColorMap/_edgeStyleMap исходника заменены
 *     фабрикой createGraphStyle(G): карты и функции замкнуты на один
 *     конкретный граф (параллельные экспорты не гонятся за глобалы).
 *  2. getRolesFromLayer/getTopRole читали глобальный graphState.G /
 *     roleMode — здесь G и слой передаются явно (roleMode в экспортёрах
 *     исходника не участвует: они всегда ходят в конкретный слой).
 */
import type { GEdge, GModel, GNode, RoleLayer } from "./graph-model.js";

/* ── Палитра кластеров и приоритеты ролей (дословно) ─────────────────── */

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

/* ── Семена hue (дословно) ────────────────────────────────────────────── */

const _TC_HUE_SEEDS: Record<string, number> = {
  онтологическ: 215, эпистемологическ: 145, этическ: 40, аксиологическ: 42,
  метафизическ: 280, логическ: 168, практическ: 25, эстетическ: 340,
  антропологическ: 38, феноменологическ: 275, экзистенциальн: 5,
  социальн: 145, политическ: 207, теологическ: 195,
  // расширенные из MMD
  лингвистическ: 55, герменевтическ: 300, аналитическ: 190, междисциплинарн: 120,
};

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
const _EC_DASH_SEEDS: Record<string, { dash: string; pri: number }> = {
  противоречи: { dash: "7,3", pri: 7 }, // конфликт
  дизъюнктивн: { dash: "4,2", pri: 5 }, // логическое разделение
  аналоги: { dash: "12,4", pri: 3 }, // подобие — длинный штрих
  корреляционн: { dash: "2,3", pri: 2 }, // слабая связь — мелкий пунктир
};

/* ── HSL-утилиты (дословно) ───────────────────────────────────────────── */

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

/* ── Маркеры структурных ролей (дословно, MARKER_DEFS [13570]) ───────── */

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

// У клиента MARKER_DEFS объявляется ВНУТРИ getStructuralMarkers (пересоздание
// на вызов); здесь вынесен на уровень модуля — значения дословны, поведение то же.
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

export interface EdgeStyle {
  color: string;
  dash: string | null;
  dashPri?: number;
}

/** Стилевой аппарат одного графа (адаптация: карты — на экземпляр). */
export interface GraphStyle {
  typeColor(t: string): number;
  typeColorHex(t: string): string;
  edgeTypeStyle(type: string): EdgeStyle;
  getRolesFromLayer(layer: RoleLayer, name: string): Set<string>;
  getStructuralMarkers(name: string): StructuralMarker[];
}

export function createGraphStyle(G: GModel): GraphStyle {
  /* ── _rebuildNodeColors [13020] (карта — локальная) ── */
  const _nodeColorMap = new Map<string, number>();
  {
    const nodes: GNode[] = G.nodes;
    const stems = new Set<string>();
    for (const n of nodes) {
      if (!n.type) continue;
      for (const part of n.type
        .split(/[/·,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean))
        stems.add(part);
    }
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

  /* ── _rebuildEdgeStyles [13065] (карта — локальная) ── */
  const _edgeStyleMap = new Map<string, EdgeStyle>();
  {
    const edges: GEdge[] = G.edges;
    const stems = new Set<string>();
    for (const e of edges) {
      if (!e.type) continue;
      for (const part of e.type
        .split(/[/·,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean))
        stems.add(part);
    }
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

  /* ── typeColor / typeColorHex [13534] (дословно; карта — локальная) ── */
  function typeColor(t: string): number {
    if (!t) return 0x95a5a6;
    const parts = t
      .split(/[/·,;]+/)
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

  function typeColorHex(t: string): string {
    return "#" + typeColor(t).toString(16).padStart(6, "0");
  }

  /* ── edgeTypeStyle [13497] (дословно) ── */
  function edgeTypeStyle(type: string): EdgeStyle {
    if (!type) return { color: "#444", dash: "3,3" };
    const parts = type
      .split(/[/·,;]+/)
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

  /* ── getRolesFromLayer (G — параметр фабрики) ── */
  function getRolesFromLayer(layer: RoleLayer, name: string): Set<string> {
    const map = G.topology?.roles?.[layer] || {};
    const r = map[name];
    if (!r) return new Set();
    // Ветка `r instanceof Set` клиента опущена: серверная GTopology типизирует
    // слои как string[] (из БД), Set сюда попасть не может.
    if (Array.isArray(r)) return new Set(r);
    return new Set();
  }

  /* ── getStructuralMarkers [13556] ── */
  function getStructuralMarkers(name: string): StructuralMarker[] {
    const roles = getRolesFromLayer("structural", name);
    if (!roles.size) return [];
    const result: StructuralMarker[] = [];
    for (const r of STRUCTURAL_PRIORITY) {
      if (roles.has(r)) result.push(MARKER_DEFS[r]!);
    }
    return result;
  }

  return {
    typeColor,
    typeColorHex,
    edgeTypeStyle,
    getRolesFromLayer,
    getStructuralMarkers,
  };
}
