/**
 * graph-physics — серверная копия client/src/utils/graph-physics.ts
 * (беседа 1.7; тот — дословный порт tick() [13743] / warmup() [13759]
 * исходника). Нужна exportPNG (беседа 4.2): раскладка узлов «собственный
 * 2D force layout» — warmup(G.nodes, G.edges, 2) [16597].
 *
 * Копия, а не импорт: кросс-мировые импорты клиента запрещены (Фаза 0).
 * Тела 1:1; типы — на серверные GNode/GEdge (graph-model.ts). Дрейф
 * сторожит секция integration-check завершения беседы 4.2.
 */
import type { GEdge, GNode } from "./graph-model.js";

/** Узел симуляции: G-узел + позиция/скорость/индекс */
export type SimNode = GNode & {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
};

/** Ребро симуляции: G-ребро + индексы концов */
export type SimEdge = GEdge & { si: number; ti: number };

export function tick(
  ns: SimNode[],
  es: SimEdge[],
  alpha: number,
  fixedIdx: number | null = null,
): void {
  // Отталкивание
  for (let i = 0; i < ns.length; i++)
    for (let j = i + 1; j < ns.length; j++) {
      const a = ns[i]!,
        b = ns[j]!;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        dz = b.z - a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const f = (800 / (d * d)) * alpha;
      a.vx -= (dx / d) * f;
      a.vy -= (dy / d) * f;
      a.vz -= (dz / d) * f;
      b.vx += (dx / d) * f;
      b.vy += (dy / d) * f;
      b.vz += (dz / d) * f;
    }
  // Притяжение вдоль рёбер
  for (const e of es) {
    if (e.si === e.ti) continue;
    const s = ns[e.si]!,
      t = ns[e.ti]!;
    const dx = t.x - s.x,
      dy = t.y - s.y,
      dz = t.z - s.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const f = (d - 30) * 0.05 * (e.str || 0.5) * alpha;
    s.vx += (dx / d) * f;
    s.vy += (dy / d) * f;
    s.vz += (dz / d) * f;
    t.vx -= (dx / d) * f;
    t.vy -= (dy / d) * f;
    t.vz -= (dz / d) * f;
  }
  // Центрирование + интеграция
  for (const n of ns) {
    if (n.id === fixedIdx) {
      n.vx = 0;
      n.vy = 0;
      n.vz = 0;
      continue;
    }
    n.vx -= n.x * 0.01 * alpha;
    n.vy -= n.y * 0.01 * alpha;
    n.vz -= n.z * 0.01 * alpha;
    n.x += n.vx;
    n.y += n.vy;
    n.z += n.vz;
    n.vx *= 0.85;
    n.vy *= 0.85;
    n.vz *= 0.85;
  }
}

export function warmup(
  nodes: GNode[],
  edges: GEdge[],
  dim: 2 | 3,
): { ns: SimNode[]; es: SimEdge[] } {
  const ns: SimNode[] = nodes.map((n, i) => ({
    ...n,
    id: i,
    x: (Math.random() - 0.5) * 80,
    y: (Math.random() - 0.5) * 80,
    z: dim === 3 ? (Math.random() - 0.5) * 80 : 0,
    vx: 0,
    vy: 0,
    vz: 0,
  }));
  const nm: Record<string, number> = Object.fromEntries(
    nodes.map((n, i) => [n.name.toLowerCase(), i]),
  );
  const es: SimEdge[] = edges
    .map((e) => ({
      ...e,
      si: nm[e.src.toLowerCase().trim()] ?? -1,
      ti: nm[e.tgt.toLowerCase().trim()] ?? -1,
    }))
    .filter((e) => e.si >= 0 && e.ti >= 0);
  for (let it = 0; it < 300; it++) {
    tick(ns, es, Math.max(0.01, 1 - it / 300));
  }
  return { ns, es };
}
