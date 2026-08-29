/**
 * png-exporter — exportPNG() [16591–17264] (беседа 4.2; вариант (a)
 * первого запроса — серверный Canvas, node-canvas: «ближе к исходнику»).
 * Раскладка warmup → кластерные оболочки → рёбра → узлы (формы по
 * процессуальной роли, маркеры структурных ролей) → подписи → легенда.
 *
 * АДАПТАЦИИ DOM→БД/Node:
 *  - document.createElement("canvas") → createCanvas(W, H) node-canvas;
 *  - cv.toBlob(...) + download → canvas.toBuffer("image/png") → Buffer
 *    (роут отдаёт image/png);
 *  - G/стили/роли — loadGModel + createGraphStyle (карты на экземпляр);
 *  - warmup — серверная копия graph-physics (тела 1:1);
 *  - typeColor возвращает number (как в исходнике) — hexStr тот же;
 *  - alert("Нет графа.") → ExportError NO_GRAPH (роут: 400);
 *  - шрифты 'IBM Plex Mono/Sans' в контейнере не установлены — node-canvas
 *    возьмёт системный фолбэк (геометрия и содержание не меняются).
 * Тело рисования в остальном 1:1, включая квирки (glow через
 * shadowOffsetX=3000, неиспользуемая saved в inner-ветке — сохранена
 * комментарием).
 */
import { createCanvas } from "canvas";

import { ExportError } from "./common.js";
import { emptyTopology, loadGModel } from "./graph-model.js";
import { warmup } from "./graph-physics.js";
import {
  _hexToHSL as hexToHSL,
  _hslToHex as hslToHex,
  CPAL,
  createGraphStyle,
  PROCEDURAL_PRIORITY,
} from "./graph-style.js";

import type { CanvasRenderingContext2D } from "canvas";
import type { GModel } from "./graph-model.js";
import type { SimNode } from "./graph-physics.js";

/** Ядро на готовой модели G — возвращает PNG-буфер. */
export function buildPNG(G: GModel): Buffer {
  if (!G.nodes.length) throw new ExportError("NO_GRAPH", "Нет графа.");
  const style = createGraphStyle(G);

  const topo = G.topology || emptyTopology();
  const clLabels = topo.clusterLabels || [];

  // ── Параметры холста ───────────────────────────────────────────
  const PAD = 120;
  const W = 2048;
  const H = 2048;
  const cv = createCanvas(W, H);
  const ctx: CanvasRenderingContext2D = cv.getContext("2d");

  // ── Раскладка (собственный 2D force layout) ────────────────────
  // КВИРК исходника [16608]: деструктурирует и `es`, но не использует
  // (рёбра рисуются из G.edges) — мёртвая переменная опущена.
  const { ns } = warmup(G.nodes, G.edges, 2);
  type LaidNode = SimNode & { px: number; py: number };

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const n of ns) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
  const offX = W / 2 - ((minX + maxX) / 2) * scale;
  const offY = H / 2 - ((minY + maxY) / 2) * scale;
  const laid: LaidNode[] = ns.map((n) =>
    Object.assign(n, {
      px: n.x * scale + offX,
      py: n.y * scale + offY,
    }),
  );

  // ── Утилиты ────────────────────────────────────────────────────
  function hexStr(hexInt: number): string {
    return "#" + hexInt.toString(16).padStart(6, "0");
  }

  function nodeR(n: { cen?: number }): number {
    return 8 + (n.cen || 0.5) * 22;
  }

  function getTopProc(name: string): string | null {
    const roles = style.getRolesFromLayer("procedural", name);
    for (const r of PROCEDURAL_PRIORITY) if (roles.has(r)) return r;
    return null;
  }

  // ── Формы процессуальных ролей (соответствуют nodeSymbolPath) ─
  function drawNodeShape(n: { px: number; py: number; cen?: number; name: string }): void {
    const x = n.px,
      y = n.py,
      r = nodeR(n);
    const proc = getTopProc(n.name);
    ctx.beginPath();
    switch (proc) {
      case "synthesis":          polygon(x, y, r, 8); break;          // октагон
      case "thesis":             polygon(x, y, r, 3); break;          // треугольник ▲
      case "antithesis":         polygon(x, y, r, 3, Math.PI / 2); break; // треугольник ▽
      case "deconstructed":      crossShape(x, y, r); break;          // крест ✚
      case "reassembled":        hexStarShape(x, y, r); break;        // ✡ звезда Давида
      case "horizon-expansion":  diamondShape(x, y, r); break;        // ромб ◇
      case "pre-horizon":        polygon(x, y, r, 7); break;          // гептагон
      case "integrating":        wyeShape(x, y, r); break;            // Y-образная ⋈
      case "foundation":         trapezoid(x, y, r); break;           // трапеция
      case "formalized":         rectShape(x, y, r); break;           // прямоугольник
      case "verifying":          starShape5(x, y, r); break;          // пятилучевая ☆
      default:                   ctx.arc(x, y, r, 0, Math.PI * 2);    // круг ●
    }
  }

  function polygon(cx: number, cy: number, r: number, sides: number, rotOffset?: number): void {
    const rot = rotOffset != null ? rotOffset : -Math.PI / 2;
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function crossShape(cx: number, cy: number, r: number): void {
    const arm = r * 0.35;
    ctx.moveTo(cx - arm, cy - r);
    ctx.lineTo(cx + arm, cy - r);
    ctx.lineTo(cx + arm, cy - arm);
    ctx.lineTo(cx + r, cy - arm);
    ctx.lineTo(cx + r, cy + arm);
    ctx.lineTo(cx + arm, cy + arm);
    ctx.lineTo(cx + arm, cy + r);
    ctx.lineTo(cx - arm, cy + r);
    ctx.lineTo(cx - arm, cy + arm);
    ctx.lineTo(cx - r, cy + arm);
    ctx.lineTo(cx - r, cy - arm);
    ctx.lineTo(cx - arm, cy - arm);
    ctx.closePath();
  }

  function hexStarShape(cx: number, cy: number, r: number): void {
    const inner = r / Math.sqrt(3);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : inner;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function diamondShape(cx: number, cy: number, r: number): void {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.6, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.6, cy);
    ctx.closePath();
  }

  function wyeShape(cx: number, cy: number, r: number): void {
    const armW = r * 0.3;
    const angles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
    // Build Y-shape: 3 arms from center
    for (let a = 0; a < 3; a++) {
      const ang = angles[a]!;
      const perp = ang + Math.PI / 2;
      const tipX = cx + Math.cos(ang) * r;
      const tipY = cy + Math.sin(ang) * r;
      const lx = tipX + Math.cos(perp) * armW;
      const ly = tipY + Math.sin(perp) * armW;
      const rx = tipX - Math.cos(perp) * armW;
      const ry = tipY - Math.sin(perp) * armW;
      const blx = cx + Math.cos(perp) * armW * 0.5;
      const bly = cy + Math.sin(perp) * armW * 0.5;
      const brx = cx - Math.cos(perp) * armW * 0.5;
      const bry = cy - Math.sin(perp) * armW * 0.5;
      ctx.moveTo(blx, bly);
      ctx.lineTo(lx, ly);
      ctx.lineTo(rx, ry);
      ctx.lineTo(brx, bry);
      ctx.closePath();
    }
  }

  function trapezoid(cx: number, cy: number, r: number): void {
    const top = r * 0.6,
      bot = r,
      h = r * 0.8;
    ctx.moveTo(cx - top, cy - h);
    ctx.lineTo(cx + top, cy - h);
    ctx.lineTo(cx + bot, cy + h);
    ctx.lineTo(cx - bot, cy + h);
    ctx.closePath();
  }

  function rectShape(cx: number, cy: number, r: number): void {
    const w = r * 1.2,
      h = r * 0.8;
    ctx.rect(cx - w, cy - h, w * 2, h * 2);
  }

  function starShape5(cx: number, cy: number, r: number): void {
    const inner = r * 0.45;
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const rad = i % 2 === 0 ? r : inner;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  // ── Стрелка на конце линии ─────────────────────────────────────
  function drawArrow(x1: number, y1: number, x2: number, y2: number, color: string): void {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = 10;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - len * Math.cos(angle - 0.35), y2 - len * Math.sin(angle - 0.35));
    ctx.lineTo(x2 - len * Math.cos(angle + 0.35), y2 - len * Math.sin(angle + 0.35));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // ── Convex hull для кластера ───────────────────────────────────
  type Pt = [number, number];
  function convexHull(points: Pt[]): Pt[] {
    if (points.length < 3) return points;
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (O: Pt, A: Pt, B: Pt): number =>
      (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
    const lower: Pt[] = [];
    for (const p of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
        lower.pop();
      lower.push(p);
    }
    const upper: Pt[] = [];
    for (const p of sorted.reverse()) {
      while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
        upper.pop();
      upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
  }

  function expandHull(hull: Pt[], pad: number): Pt[] {
    const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
    const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
    return hull.map(([x, y]) => {
      const dx = x - cx,
        dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      return [x + (dx / d) * pad, y + (dy / d) * pad];
    });
  }

  // ══════════════════════════════════════════════════════════════
  // РИСОВАНИЕ
  // ══════════════════════════════════════════════════════════════

  // Фон
  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(0, 0, W, H);

  // ── 1. Кластерные оболочки ─────────────────────────────────────
  const clusterGroups: Record<number, LaidNode[]> = {};
  laid.forEach((n) => {
    const cls = topo.clusters?.[n.name] || [];
    cls.forEach((clIdx) => {
      if (!clusterGroups[clIdx]) clusterGroups[clIdx] = [];
      clusterGroups[clIdx]!.push(n);
    });
  });

  for (const [clIdxStr, members] of Object.entries(clusterGroups)) {
    const clIdx = Number(clIdxStr);
    const clColor = CPAL[clIdx % CPAL.length]!;
    const pts: Pt[] = members.map((n) => [n.px, n.py]);
    if (pts.length < 1) continue;

    // ── Построение оболочки в зависимости от числа точек ──
    let hullPath: () => void; // функция, рисующая path в текущем ctx

    if (pts.length === 1) {
      // Один узел — окружность с паддингом
      const [x, y] = pts[0]!;
      const r = nodeR(members[0]!) + 40;
      hullPath = () => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.closePath();
      };
    } else if (pts.length === 2) {
      // Два узла — капсула (прямоугольник с полукруглыми торцами)
      const [a, b] = [pts[0]!, pts[1]!];
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len,
        uy = dy / len; // единичный вектор вдоль
      // КВИРК исходника [16849]: const nx = -uy, ny = ux (нормаль)
      // объявлялись и не использовались — мёртвый код опущен.
      const pad = 40;
      const ra = nodeR(members[0]!) + pad;
      const rb = nodeR(members[1]!) + pad;
      // Используем максимальный радиус для единообразной ширины капсулы
      const r = Math.max(ra, rb);
      hullPath = () => {
        ctx.beginPath();
        // Левая дуга вокруг a
        const angleA = Math.atan2(uy, ux);
        ctx.arc(a[0], a[1], r, angleA + Math.PI / 2, angleA - Math.PI / 2);
        // Правая дуга вокруг b
        const angleB = Math.atan2(-uy, -ux);
        ctx.arc(b[0], b[1], r, angleB + Math.PI / 2, angleB - Math.PI / 2);
        ctx.closePath();
      };
    } else {
      // Три и больше — обычный convex hull
      const hull = expandHull(convexHull(pts), 40);
      hullPath = () => {
        ctx.beginPath();
        hull.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.closePath();
      };
    }

    // ── Заливка ──
    hullPath();
    ctx.fillStyle = clColor + "15";
    ctx.fill();

    // ── Обводка ──
    hullPath();
    ctx.strokeStyle = clColor + "55";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Метка ──
    const cx = members.reduce((s, n) => s + n.px, 0) / members.length;
    const cy = members.reduce((s, n) => s + n.py, 0) / members.length - 50;
    const label = (clLabels[clIdx] || "Кластер " + (clIdx + 1))
      .replace(/^[IVXLCDM]+\s*[-–—]\s*/i, "")
      .trim();
    ctx.font = "600 13px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = clColor + "88";
    ctx.fillText(label, cx, cy);
  }

  // ── 2. Рёбра ──────────────────────────────────────────────────
  const nm: Record<string, number> = Object.fromEntries(
    G.nodes.map((n, i) => [n.name.toLowerCase(), i]),
  );

  for (const e of G.edges) {
    const si = nm[e.src.toLowerCase().trim()];
    const ti = nm[e.tgt.toLowerCase().trim()];
    if (si == null || ti == null) continue;

    const sn = laid[si]!,
      tn = laid[ti]!;
    const { color, dash } = style.edgeTypeStyle(e.type);
    const str = e.str || 0.5;
    const lw = 1 + str * 3;
    const isRefl = e.dir.includes("рефлексив") || si === ti;
    const isBi = e.dir.includes("двунаправлен");

    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.globalAlpha = 0.3 + str * 0.5;
    ctx.setLineDash(dash ? dash.split(",").map(Number) : str < 0.3 ? [4, 4] : []);

    if (isRefl) {
      // Рефлексивная петля
      const r = nodeR(sn) + 18;
      ctx.beginPath();
      ctx.arc(sn.px, sn.py - r, r, 0.3 * Math.PI, 0.7 * Math.PI);
      ctx.stroke();
    } else {
      // Обычное ребро с отступом от края узла
      const angle = Math.atan2(tn.py - sn.py, tn.px - sn.px);
      const rs = nodeR(sn) + 2;
      const rt = nodeR(tn) + 2;
      const x1 = sn.px + Math.cos(angle) * rs;
      const y1 = sn.py + Math.sin(angle) * rs;
      const x2 = tn.px - Math.cos(angle) * rt;
      const y2 = tn.py - Math.sin(angle) * rt;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Стрелки
      ctx.setLineDash([]);
      drawArrow(x1, y1, x2, y2, color);
      if (isBi) drawArrow(x2, y2, x1, y1, color);
    }

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // ── 3. Узлы ───────────────────────────────────────────────────
  for (const n of laid) {
    const r = nodeR(n);
    const hex = hexStr(style.typeColor(n.type));
    const cert = n.cert ?? 0.5;

    // Все структурные маркеры (как в build2D)
    const sms = style.getStructuralMarkers(n.name);
    let strokeW = 2;
    let strokeDash: number[] | null = null;
    let hasGlow = false;
    let hasInner = false;
    let innerScale = 0.55;
    let innerDarken = 0.35;
    for (const sm of sms) {
      if (sm.type === "central" || sm.type === "peripheral") strokeW = sm.strokeWidth;
      if (sm.strokeDash) strokeDash = sm.strokeDash.split(",").map(Number);
      if (sm.filter) hasGlow = true;
      if (sm.innerShape) {
        hasInner = true;
        innerScale = sm.innerScale ?? 0.55;
        innerDarken = sm.innerDarken ?? 0.35;
      }
    }

    // Glow (generative) — Canvas shadow (квирк исходника: объект уводится
    // за пределы холста shadowOffsetX=3000, рисуется трижды для плотности)
    if (hasGlow) {
      ctx.save();
      ctx.shadowBlur = 60;
      ctx.shadowColor = hex;
      ctx.shadowOffsetX = 3000; // уводим сам объект за пределы
      ctx.shadowOffsetY = 0;

      // Повторяем 3 раза для плотности
      for (let i = 0; i < 3; i++) {
        drawNodeShape({ ...n, px: n.px - 3000, py: n.py });
        ctx.fillStyle = hex;
        ctx.fill();
      }
      ctx.restore();
    }

    // Заливка
    drawNodeShape(n);
    ctx.fillStyle = hex;
    ctx.globalAlpha = 0.25 + cert * 0.6;
    ctx.fill();

    // Обводка
    drawNodeShape(n);
    ctx.strokeStyle = hex;
    ctx.lineWidth = strokeW;
    ctx.globalAlpha = 0.85;
    ctx.setLineDash(strokeDash || []);
    ctx.stroke();
    ctx.setLineDash([]);

    if (hasGlow) ctx.restore();
    ctx.globalAlpha = 1;

    // Внутренний силуэт (core)
    if (hasInner) {
      const hsl = hexToHSL(style.typeColor(n.type));
      const darkHex =
        "#" +
        hslToHex({
          h: hsl.h,
          s: hsl.s * 0.9,
          l: Math.max(0.08, hsl.l - innerDarken),
        })
          .toString(16)
          .padStart(6, "0");
      // КВИРК исходника [17040]: const saved = {px, py, cen} объявлялась и
      // не использовалась — опущена (мертвый код, поведения не несла).
      // Рисуем уменьшенную копию той же формы
      const innerN = { ...n, cen: n.cen * innerScale };
      ctx.beginPath();
      drawNodeShape(innerN);
      ctx.fillStyle = darkHex;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ── Кольца кластеров ──────────────────────────────────────
    const cls = topo.clusters?.[n.name] || [];
    cls.forEach((clIdx, offset) => {
      const clColor = CPAL[clIdx % CPAL.length]!;
      const ringR = r + 6 + offset * 5;
      ctx.beginPath();
      ctx.arc(n.px, n.py, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = clColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });
  }

  // ── 4. Подписи ────────────────────────────────────────────────
  ctx.font = "500 13px 'IBM Plex Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  for (const n of laid) {
    const r = nodeR(n);
    const x = n.px,
      y = n.py - r - 5;

    // Обводка текста для читаемости
    ctx.strokeStyle = "#0a0a14";
    ctx.lineWidth = 3.5;
    ctx.lineJoin = "round";
    ctx.strokeText(n.name, x, y);

    ctx.fillStyle = "#d0c8b8";
    ctx.fillText(n.name, x, y);
  }

  // ── 5. Легенда (структура как в buildLegend) ─────────────────
  // Собираем данные: только те роли/типы, что есть в графе
  const nodeTypes = new Set(G.nodes.map((n) => n.type || "другое"));
  const edgeTypes = new Set(G.edges.map((e) => e.type).filter(Boolean));

  const procRolesActive = new Set<string>();
  const procLayer = topo.roles?.procedural || {};
  for (const rl of Object.values(procLayer)) {
    // Ветка instanceof Set исходника: parseTopology браузера мог класть
    // Set; серверная модель — всегда массивы (сохранено 1:1)
    const arr = rl instanceof Set ? [...rl] : Array.isArray(rl) ? rl : [];
    arr.forEach((r) => procRolesActive.add(r));
  }
  const structRolesActive = new Set<string>();
  const structLayer = topo.roles?.structural || {};
  for (const rl of Object.values(structLayer)) {
    const arr = rl instanceof Set ? [...rl] : Array.isArray(rl) ? rl : [];
    arr.forEach((r) => structRolesActive.add(r));
  }

  interface RoleReg {
    key: string;
    label: string;
    draw: (x: number, y: number, r: number) => void;
  }
  const ROLE_REG_PNG: RoleReg[] = [
    { key: "synthesis",         label: "Синтез",           draw: (x, y, r) => polygon(x, y, r, 8) },
    { key: "thesis",            label: "Тезис",            draw: (x, y, r) => polygon(x, y, r, 3) },
    { key: "antithesis",        label: "Антитезис",        draw: (x, y, r) => polygon(x, y, r, 3, Math.PI / 2) },
    { key: "deconstructed",     label: "Деконструиров.",   draw: (x, y, r) => crossShape(x, y, r) },
    { key: "reassembled",       label: "Пересобранная",    draw: (x, y, r) => hexStarShape(x, y, r) },
    { key: "horizon-expansion", label: "Расш. горизонта",  draw: (x, y, r) => diamondShape(x, y, r) },
    { key: "pre-horizon",       label: "Предгоризонт",     draw: (x, y, r) => polygon(x, y, r, 7) },
    { key: "integrating",       label: "Интегрирующая",    draw: (x, y, r) => wyeShape(x, y, r) },
    { key: "foundation",        label: "Основание",        draw: (x, y, r) => trapezoid(x, y, r) },
    { key: "formalized",        label: "Формализованная",  draw: (x, y, r) => rectShape(x, y, r) },
    { key: "verifying",         label: "Верифицирующая",   draw: (x, y, r) => starShape5(x, y, r) },
  ];
  const activeProcRoles = ROLE_REG_PNG.filter((r) => procRolesActive.has(r.key));

  const STRUCT_REG_PNG = [
    { key: "core",       label: "Ядро",          desc: "внутренний силуэт" },
    { key: "generative", label: "Генеративная",  desc: "свечение (glow)" },
    { key: "bridge",     label: "Мост",          desc: "пунктирная обводка" },
    { key: "central",    label: "Центральная",   desc: "жирная обводка" },
    { key: "peripheral", label: "Периферийная",  desc: "тонкая обводка" },
  ];
  const activeStructRoles = STRUCT_REG_PNG.filter((s) => structRolesActive.has(s.key));

  // Подсчёт высоты легенды
  let legendRows = 0;
  legendRows += 1 + nodeTypes.size; // типы категорий
  if (activeProcRoles.length) legendRows += 1 + activeProcRoles.length; // процессуальные
  if (activeStructRoles.length) legendRows += 1 + activeStructRoles.length; // структурные
  if (edgeTypes.size) legendRows += 1 + edgeTypes.size; // связи
  if (clLabels.length) legendRows += 1 + clLabels.length; // кластеры
  legendRows += 1; // подсказка
  const ROW_H = 20;
  const legendH = legendRows * ROW_H + 30;
  const LX = 24,
    LY = H - legendH - 16;

  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#0a0a14dd";
  ctx.fillRect(LX - 10, LY - 14, 310, legendH + 10);
  ctx.strokeStyle = "#ffffff18";
  ctx.lineWidth = 1;
  ctx.strokeRect(LX - 10, LY - 14, 310, legendH + 10);

  let ly = LY;
  const secFont = "600 9px 'IBM Plex Mono', monospace";
  const itemFont = "500 10px 'IBM Plex Mono', monospace";
  const secColor = "rgba(255,255,255,0.45)";
  const txtColor = "#c8c0b0";

  function secTitle(text: string): void {
    ctx.font = secFont;
    ctx.fillStyle = secColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, LX, ly);
    ly += ROW_H;
  }

  // ── Типы категорий ──
  secTitle("ТИПЫ КАТЕГОРИЙ");
  for (const t of nodeTypes) {
    ctx.beginPath();
    ctx.arc(LX + 6, ly, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = style.typeColorHex(t);
    ctx.fill();
    ctx.font = itemFont;
    ctx.fillStyle = txtColor;
    ctx.fillText(t, LX + 18, ly);
    ly += ROW_H;
  }

  // ── Процессуальные роли (ФОРМА) ──
  if (activeProcRoles.length) {
    secTitle("ПРОЦЕССУАЛЬНЫЕ РОЛИ (ФОРМА)");
    for (const r of activeProcRoles) {
      ctx.beginPath();
      r.draw(LX + 6, ly, 7);
      ctx.fillStyle = "#888";
      ctx.fill();
      ctx.strokeStyle = "#aaa";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = itemFont;
      ctx.fillStyle = txtColor;
      ctx.fillText(r.label, LX + 20, ly);
      ly += ROW_H;
    }
  }

  // ── Структурные роли (МАРКЕР) ──
  if (activeStructRoles.length) {
    secTitle("СТРУКТУРНЫЕ РОЛИ (МАРКЕР)");
    for (const s of activeStructRoles) {
      const sm = {
        core:       { sw: 2.5, d: null as number[] | null, glow: false, inner: true },
        generative: { sw: 2,   d: null, glow: true,  inner: false },
        bridge:     { sw: 2,   d: [4, 2.5], glow: false, inner: false },
        central:    { sw: 4,   d: null, glow: false, inner: false },
        peripheral: { sw: 1,   d: null, glow: false, inner: false },
      }[s.key]!;
      ctx.beginPath();
      ctx.arc(LX + 6, ly, 6, 0, Math.PI * 2);
      ctx.strokeStyle = "#aaa";
      ctx.lineWidth = sm.sw;
      ctx.setLineDash(sm.d || []);
      ctx.stroke();
      ctx.setLineDash([]);
      if (sm.inner) {
        ctx.beginPath();
        ctx.arc(LX + 6, ly, 3.3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fill();
      }
      if (sm.glow) {
        ctx.beginPath();
        ctx.arc(LX + 6, ly, 8, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,200,50,0.2)";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.font = itemFont;
      ctx.fillStyle = txtColor;
      ctx.fillText(s.label + " — " + s.desc, LX + 20, ly);
      ly += ROW_H;
    }
  }

  // ── Типы связей ──
  if (edgeTypes.size) {
    secTitle("ТИПЫ СВЯЗЕЙ");
    for (const t of edgeTypes) {
      const { color, dash } = style.edgeTypeStyle(t);
      ctx.beginPath();
      ctx.moveTo(LX, ly);
      ctx.lineTo(LX + 16, ly);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dash ? dash.split(",").map(Number) : []);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = itemFont;
      ctx.fillStyle = txtColor;
      ctx.fillText(t, LX + 22, ly);
      ly += ROW_H;
    }
  }

  // ── Кластеры ──
  if (clLabels.length) {
    secTitle("КЛАСТЕРЫ");
    clLabels.forEach((label, i) => {
      const c = CPAL[i % CPAL.length]!;
      ctx.beginPath();
      ctx.arc(LX + 6, ly, 4, 0, Math.PI * 2);
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 1.5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = itemFont;
      ctx.fillStyle = txtColor;
      ctx.fillText(label, LX + 18, ly);
      ly += ROW_H;
    });
  }

  // ── Подсказка ──
  ctx.font = "500 9px 'IBM Plex Mono', monospace";
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillText("→ однонаправл. · ↔ двунаправл. · ↺ рефлексив.", LX, ly);

  ctx.globalAlpha = 1;

  // ── Экспорт ───────────────────────────────────────────────────
  return cv.toBuffer("image/png");
}

/** exportPNG(synthesisId) — контракт первого запроса 4.2. */
export async function exportPNG(synthesisId: string): Promise<Buffer> {
  return buildPNG(await loadGModel(synthesisId));
}
