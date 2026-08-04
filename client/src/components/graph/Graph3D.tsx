/**
 * Graph3D — Three.js-рендерер графа категорий. Беседа 1.7.
 *
 * Ядро buildGraph3D — БЛИЗКИЙ ПОРТ build3D() [13817] из 1.7-graph-viz.js:
 * та же физика (warmup + живой tick с затуханием 0.95), та же анимация
 * появления (55 кадров easeOut³), те же материалы/маркеры/диммирование,
 * orbit с инерцией 0.96, зум 30..400, drag узлов по плоскости камеры,
 * hover/select узлов и рёбер, фильтры легенды, тач (pinch-zoom,
 * single-touch orbit, tap-select).
 *
 * АДАПТАЦИИ (react-обвязка, структура ядра не переписана):
 *  - контейнер и тултип — параметры вместо getElementById("view3d"/
 *    "graph-tooltip");
 *  - глобалы renderer3d/scene3d/anim3d/sim2d/resizeObs3d, G, legendFilter,
 *    clusterVisible — из graphState (graph-utils);
 *  - showNodePanel/showEdgePanel и снятие панели → колбэки PanelCallbacks
 *    наверх (панели — React-компоненты NodePanel/EdgePanel; у DOM один
 *    владелец — грабля 1.6b);
 *  - clearLegendFilter() уведомляет React (active-классы легенды — React);
 *  - dispose3D — 3D-часть closeGraph() [16137], вызывается при unmount.
 */

import { useEffect, useRef } from "react";

import * as THREE from "three";

import { normalizeType } from "@philosynth/shared/utils/normalize";

import { mkSprite, nodeGeometry3D } from "../../utils/graph-geometry";
import { tick, warmup } from "../../utils/graph-physics";
import {
  applyClusters3D,
  clearLegendFilter,
  getRolesForMode,
  getRolesFromLayer,
  getStructuralMarkers,
  graphState,
  typeColor,
  typeColorHex,
  _hexToHSL,
  _hslToHex,
  edgeTypeStyle,
  CPAL,
  PROCEDURAL_PRIORITY,
} from "./graph-utils";

import type { RefObject } from "react";
import type { SimEdge } from "../../utils/graph-physics";
import type { GEdge, PanelCallbacks, RoleLayer } from "./graph-utils";

/** Object3D с опциональными полями материала/света (дочерние узлов) */
type Obj3D = THREE.Object3D & {
  isLight?: boolean;
  intensity?: number;
  material?: THREE.Material & {
    map?: THREE.Texture | null;
    emissiveIntensity?: number;
    userData?: { baseOp?: number };
  };
};

type NodeMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial>;

/* ─────────────────────────────────────────────────────────────────────── */

export function buildGraph3D(
  ct: HTMLDivElement,
  tooltip: HTMLDivElement,
  panels: PanelCallbacks,
): void {
  const gs = graphState;
  const G = gs.G;

  const old = ct.querySelector("canvas");
  if (old) old.remove();
  if (gs.renderer3d) {
    gs.renderer3d.dispose();
    gs.renderer3d = null;
  }
  if (gs.anim3d) cancelAnimationFrame(gs.anim3d);
  if (gs.sim2d) {
    gs.sim2d.stop();
    gs.sim2d = null;
  }
  if (gs.resizeObs3d) {
    gs.resizeObs3d.disconnect();
    gs.resizeObs3d = null;
  }

  if (gs.scene3d) {
    gs.scene3d.traverse((obj) => {
      const o = obj as Obj3D;
      if ((o as unknown as THREE.Mesh).geometry)
        (o as unknown as THREE.Mesh).geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    gs.scene3d = null;
  }

  const W = ct.clientWidth,
    H = ct.clientHeight;
  const { ns, es } = warmup(G.nodes, G.edges, 3);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a14);
  gs.scene3d = scene;
  const cam = new THREE.PerspectiveCamera(50, W / H, 1, 2000);
  cam.position.set(0, 0, 150);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  gs.renderer3d = renderer;
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  ct.insertBefore(renderer.domElement, ct.firstChild);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8);
  dl.position.set(50, 80, 100);
  scene.add(dl);

  const meshes: NodeMesh[] = [];
  const types = new Set<string>();
  for (const n of ns) {
    const c = typeColor(n.type);
    const cert = n.cert ?? 0.5;
    types.add(n.type || "другое");
    const r = 1.5 + n.cen * 3;

    // Процессуальная роль → геометрия (ВСЕГДА)
    const procRoles = getRolesFromLayer("procedural", n.name);
    const procRole = (() => {
      for (const pr of PROCEDURAL_PRIORITY) if (procRoles.has(pr)) return pr;
      return null;
    })();
    const geometry = nodeGeometry3D(procRole, r);

    // Структурные маркеры (все роли)
    const sms = getStructuralMarkers(n.name);
    // emissive: берём максимальный из всех маркеров
    const emissiveInt = sms.length
      ? Math.max(...sms.map((s) => s.emissive3d))
      : 0.15;

    const m: NodeMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshPhongMaterial({
        color: c,
        emissive: c,
        emissiveIntensity: emissiveInt, // ← зависит от структурной роли
        transparent: true,
        opacity: 0.2 + cert * 0.65,
      }),
    );

    // ── Специфика процессуальных ролей (как было) ──
    if (procRole === "thesis") {
      m.quaternion.setFromUnitVectors(
        new THREE.Vector3(1, 1, 1).normalize(),
        new THREE.Vector3(0, 1, 0),
      );
    }
    if (procRole === "antithesis") {
      m.quaternion.setFromUnitVectors(
        new THREE.Vector3(1, 1, 1).normalize(),
        new THREE.Vector3(0, -1, 0),
      );
    }
    if (procRole === "deconstructed") {
      m.material.opacity = 0.05;
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({
          color: c,
          transparent: true,
          opacity: 0.8,
        }),
      );
      edges.userData = { baseOpacity: 0.8, baseEmissive: 0 };
      m.add(edges);
    }
    if (procRole === "reassembled") {
      m.material.side = THREE.DoubleSide;
      const geo2 = new THREE.TetrahedronGeometry(r, 0);
      const mat2 = new THREE.MeshPhongMaterial({
        color: c,
        emissive: c,
        emissiveIntensity: emissiveInt,
        transparent: true,
        opacity: 0.2 + cert * 0.65,
        side: THREE.DoubleSide,
      });
      const m2 = new THREE.Mesh(geo2, mat2);
      m2.scale.set(1, -1, 1);
      m2.userData = { baseOpacity: 0.2 + cert * 0.65, baseEmissive: emissiveInt };
      m.add(m2);
      m.quaternion.setFromUnitVectors(
        new THREE.Vector3(1, 1, 1).normalize(),
        new THREE.Vector3(0, 1, 0),
      );
    }
    if (procRole === "verifying") {
      m.material.opacity = 0.15;
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({
          color: c,
          transparent: true,
          opacity: 0.9,
        }),
      );
      edges.userData = { baseOpacity: 0.9, baseEmissive: 0 };
      m.add(edges);
    }
    if (procRole === "foundation") {
      m.material.side = THREE.DoubleSide;
    }

    // ── Структурные маркеры ──
    const smTypes = new Set(sms.map((s) => s.type));

    // bridge — пунктирный wireframe + полупрозрачная оболочка
    if (smTypes.has("bridge")) {
      const hsl = _hexToHSL(c);
      const brightC = _hslToHex({
        h: hsl.h,
        s: Math.min(1, hsl.s * 1.2),
        l: Math.min(0.92, hsl.l + 0.3),
      });
      // Пунктирный wireframe (аналог 2D strokeDash)
      const wf = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineDashedMaterial({
          color: brightC,
          transparent: true,
          opacity: 1.0,
          dashSize: 1.2,
          gapSize: 0.6,
          linewidth: 1,
        }),
      );
      wf.computeLineDistances();
      wf.userData = { baseOpacity: 1.0, baseEmissive: 0 };
      m.add(wf);
      // Полупрозрачная оболочка чуть крупнее тела — усиливает контур
      const shellGeo = nodeGeometry3D(procRole, r * 1.18);
      const shellMat = new THREE.MeshPhongMaterial({
        color: brightC,
        emissive: brightC,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const shell = new THREE.Mesh(shellGeo, shellMat);
      shell.userData = { baseOpacity: 0.22, baseEmissive: 0.5 };
      m.add(shell);
      m.material.opacity = Math.max(0.1, m.material.opacity - 0.15);
    }

    // core — внутреннее тело
    if (smTypes.has("core")) {
      m.material.opacity = Math.max(0.12, m.material.opacity - 0.25);
      m.material.depthWrite = false;
      const innerR = r * 0.55;
      const innerGeo = nodeGeometry3D(procRole, innerR);
      const hsl = _hexToHSL(c);
      const darkC = _hslToHex({
        h: hsl.h,
        s: hsl.s * 0.9,
        l: Math.max(0.08, hsl.l - 0.35),
      });
      const innerMat = new THREE.MeshPhongMaterial({
        color: darkC,
        emissive: darkC,
        emissiveIntensity: 0.1,
        transparent: true,
        opacity: 1.0,
      });
      const innerMesh = new THREE.Mesh(innerGeo, innerMat);
      innerMesh.userData = { baseOpacity: 1.0, baseEmissive: 0.1 };
      m.add(innerMesh);
      // Stella octangula: второй перевёрнутый тетраэдр внутри
      if (procRole === "reassembled") {
        const innerGeo2 = new THREE.TetrahedronGeometry(innerR, 0);
        const innerMat2 = new THREE.MeshPhongMaterial({
          color: darkC,
          emissive: darkC,
          emissiveIntensity: 0.1,
          transparent: true,
          opacity: 1.0,
          side: THREE.DoubleSide,
        });
        const innerMesh2 = new THREE.Mesh(innerGeo2, innerMat2);
        innerMesh2.scale.set(1, -1, 1);
        innerMesh2.userData = { baseOpacity: 1.0, baseEmissive: 0.1 };
        m.add(innerMesh2);
      }
    }

    // generative — усиленный PointLight + glow-спрайт + масштаб
    if (smTypes.has("generative")) {
      const hexColor = parseInt(typeColorHex(n.type).slice(1), 16);
      const light = new THREE.PointLight(hexColor, 3.0, r * 35);
      light.position.set(0, 0, 0);
      light.userData = { baseIntensity: 3.0 };
      m.add(light);
      // Glow-спрайт с аддитивным смешиванием
      const glowCv = document.createElement("canvas");
      glowCv.width = 64;
      glowCv.height = 64;
      const gCtx = glowCv.getContext("2d")!;
      const grad = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
      const hexStr = "#" + hexColor.toString(16).padStart(6, "0");
      grad.addColorStop(0, hexStr);
      grad.addColorStop(0.4, hexStr + "88");
      grad.addColorStop(1, hexStr + "00");
      gCtx.fillStyle = grad;
      gCtx.fillRect(0, 0, 64, 64);
      const glowTex = new THREE.CanvasTexture(glowCv);
      const glowMat = new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glowSprite = new THREE.Sprite(glowMat);
      const glowSize = r * 4.5;
      glowSprite.scale.set(glowSize, glowSize, 1);
      glowSprite.userData = {
        baseOpacity: 0.7,
        baseEmissive: 0,
        baseGlowSize: glowSize,
      };
      m.add(glowSprite);
      m.scale.setScalar(m.scale.x * 1.1);
    }

    // central — масштаб вверх
    if (smTypes.has("central")) {
      m.scale.setScalar(m.scale.x * 1.15);
    }

    // peripheral — масштаб вниз
    if (smTypes.has("peripheral")) {
      m.scale.setScalar(m.scale.x * 0.8);
    }

    m.position.set(n.x, n.y, n.z);
    m.userData = {
      nodeIdx: n.id,
      baseOpacity: m.material.opacity,
      baseEmissive: emissiveInt,
      baseScale: m.scale.x,
    };
    scene.add(m);
    meshes.push(m);

    const sp = mkSprite(n.name);
    sp.position.set(n.x, n.y + r + 2.5, n.z);
    sp.userData = { labelFor: n.id };
    scene.add(sp);

    // Торические кольца кластеров — одно кольцо на каждый кластер узла.
    // Дочерние объекты mesh → следуют за узлом без ручного обновления.
    const clusterList = G.topology?.clusters?.[n.name] || [];
    clusterList.forEach((clIdx) => {
      const clColor = parseInt(
        (CPAL[clIdx % CPAL.length] || "#555555").replace("#", ""),
        16,
      );
      const torusR = r + 2.5; // фиксированный: чуть больше тела узла
      const torus = new THREE.Mesh(
        new THREE.TorusGeometry(torusR, 0.5, 6, 24),
        new THREE.LineBasicMaterial({
          color: clColor,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      // Уникальный угол наклона для каждого кластера → различимы при пересечении
      torus.rotation.x = (clIdx * 1.3) % Math.PI;
      torus.rotation.z = (clIdx * 0.9) % Math.PI;
      torus.userData = { baseOpacity: 0.55 };
      m.add(torus);
    });
  }

  interface EdgeGeoEntry {
    geo: THREE.BufferGeometry;
    si: number;
    ti: number;
    line: THREE.Line<
      THREE.BufferGeometry,
      THREE.LineBasicMaterial | THREE.LineDashedMaterial
    >;
    isDashed: boolean;
  }
  const edgeGeos: EdgeGeoEntry[] = [];
  const edgeHitMeshes: { mesh: THREE.Mesh; si: number; ti: number }[] = [];
  const reflMeshes: {
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial>;
    si: number;
  }[] = [];
  const arrowMeshes: {
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial>;
    si: number;
    ti: number;
    pointsToTi: boolean;
  }[] = [];
  const edgeMaterials: (THREE.Material & {
    userData: { baseOp?: number };
  })[] = [];

  // Обновляет позицию и ориентацию конуса-стрелки по текущим ns
  function updateCone(
    mesh: THREE.Mesh,
    si: number,
    ti: number,
    pointsToTi: boolean,
  ): void {
    const s = ns[si]!,
      t = ns[ti]!;
    const ev = new THREE.Vector3(t.x - s.x, t.y - s.y, t.z - s.z);
    const len = ev.length();
    if (len < 0.001) return;
    const dir = ev.divideScalar(len);
    if (pointsToTi) {
      const r = 1.5 + (t.cen || 0.5) * 3;
      mesh.position.copy(
        new THREE.Vector3(t.x, t.y, t.z).sub(dir.clone().multiplyScalar(r + 1.5)),
      );
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    } else {
      const r = 1.5 + (s.cen || 0.5) * 3;
      const d2 = dir.clone().negate();
      mesh.position.copy(
        new THREE.Vector3(s.x, s.y, s.z).sub(d2.clone().multiplyScalar(r + 1.5)),
      );
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d2);
    }
  }

  for (const e of es) {
    const s = ns[e.si]!,
      t = ns[e.ti]!;
    const refl = e.dir.includes("рефлексив") || e.si === e.ti;
    const bi = e.dir.includes("двунаправлен");

    // A1: цвет и пунктир по типу
    const { color: colHex, dash } = edgeTypeStyle(e.type);
    const col = parseInt(colHex.replace("#", ""), 16);
    const op = 0.3 + (e.str || 0.5) * 0.5;

    if (refl) {
      const nodeR = 1.5 + (s.cen || 0.5) * 1.5;
      const loopR = nodeR * 1.8;
      const tubeR = Math.max(0.2, nodeR * 0.1);
      const SEGS = 48;
      const GAP = Math.PI * 0.09; // ~32° разрыв у основания

      // Почти полная окружность в плоскости XY с разрывом внизу (где узел)
      const pts: THREE.Vector3[] = [];
      const startA = -Math.PI / 2 + GAP / 2;
      for (let i = 0; i <= SEGS; i++) {
        const a = startA + (i / SEGS) * (2 * Math.PI - GAP);
        pts.push(
          new THREE.Vector3(Math.cos(a) * loopR, Math.sin(a) * loopR, 0),
        );
      }
      const curve = new THREE.CatmullRomCurve3(pts, false);
      const loopGeo = new THREE.TubeGeometry(curve, SEGS, tubeR, 6, false);
      const loopMesh = new THREE.Mesh(
        loopGeo,
        new THREE.MeshPhongMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: 0.2,
          transparent: true,
          opacity: op + 0.1,
        }),
      );
      // Центр петли — над узлом, разрыв приходится на поверхность
      loopMesh.position.set(s.x, s.y + nodeR + loopR, s.z);
      scene.add(loopMesh);
      reflMeshes.push({ mesh: loopMesh, si: e.si });
      loopMesh.material.userData = { baseOp: loopMesh.material.opacity };
      edgeMaterials.push(loopMesh.material);

      // Хитбокс — вертикальный тор как приближение петли
      const loopHit = new THREE.Mesh(
        new THREE.TorusGeometry(loopR, tubeR + 1.5, 6, 16),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      loopHit.position.set(s.x, s.y + nodeR + loopR, s.z);
      loopHit.userData = { edgeData: e };
      scene.add(loopHit);
      edgeHitMeshes.push({ mesh: loopHit, si: e.si, ti: e.ti });
    } else {
      // A1: LineDashedMaterial если тип требует пунктира
      let lineMat: THREE.LineBasicMaterial | THREE.LineDashedMaterial;
      if (dash) {
        const [dashSize, gapSize] = dash.split(",").map(Number);
        lineMat = new THREE.LineDashedMaterial({
          color: col,
          transparent: true,
          opacity: op,
          dashSize: dashSize ?? 3,
          gapSize: gapSize ?? 2,
        });
      } else {
        lineMat = new THREE.LineBasicMaterial({
          color: col,
          transparent: true,
          opacity: op,
        });
      }
      lineMat.userData ??= {};
      lineMat.userData.baseOp = lineMat.opacity;
      edgeMaterials.push(lineMat);

      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(s.x, s.y, s.z),
        new THREE.Vector3(t.x, t.y, t.z),
      ]);
      const line = new THREE.Line(geo, lineMat);
      if (dash) line.computeLineDistances();
      line.userData = { si: e.si, ti: e.ti, baseOp: lineMat.opacity };
      scene.add(line);
      edgeGeos.push({ geo, si: e.si, ti: e.ti, line, isDashed: !!dash });

      // Конус к ti
      const dir = new THREE.Vector3(t.x - s.x, t.y - s.y, t.z - s.z).normalize();
      const tr = 1.5 + (ns[e.ti]!.cen || 0.5) * 3;
      const ap = new THREE.Vector3(t.x, t.y, t.z).sub(
        dir.clone().multiplyScalar(tr + 1.5),
      );
      const cn = new THREE.Mesh(
        new THREE.CylinderGeometry(0, 1, 3, 8),
        new THREE.MeshPhongMaterial({
          color: col,
          transparent: true,
          opacity: op + 0.1,
        }),
      );
      cn.position.copy(ap);
      cn.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      cn.userData = { si: e.si, ti: e.ti, baseOp: lineMat.opacity };
      scene.add(cn);
      arrowMeshes.push({ mesh: cn, si: e.si, ti: e.ti, pointsToTi: true });
      cn.material.userData = { baseOp: cn.material.opacity };
      edgeMaterials.push(cn.material);

      if (bi) {
        const d2 = dir.clone().negate();
        const sr = 1.5 + (ns[e.si]!.cen || 0.5) * 3;
        const ap2 = new THREE.Vector3(s.x, s.y, s.z).sub(
          d2.clone().multiplyScalar(sr + 1.5),
        );
        const cn2 = new THREE.Mesh(
          new THREE.CylinderGeometry(0, 1, 3, 8),
          new THREE.MeshPhongMaterial({
            color: col,
            transparent: true,
            opacity: op + 0.1,
          }),
        );
        cn2.position.copy(ap2);
        cn2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d2);
        cn2.userData = { si: e.si, ti: e.ti, baseOp: lineMat.opacity };
        scene.add(cn2);
        arrowMeshes.push({ mesh: cn2, si: e.si, ti: e.ti, pointsToTi: false });
        cn2.material.userData = { baseOp: cn2.material.opacity };
        edgeMaterials.push(cn2.material);
      }

      // Хитбокс
      const edgeVec = new THREE.Vector3(t.x - s.x, t.y - s.y, t.z - s.z);
      const edgeLen = edgeVec.length();
      const hitMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(2, 2, edgeLen, 6),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hitMesh.position.set((s.x + t.x) / 2, (s.y + t.y) / 2, (s.z + t.z) / 2);
      hitMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        edgeVec.normalize(),
      );
      hitMesh.userData = { edgeData: e, _origLen: edgeLen };
      scene.add(hitMesh);
      edgeHitMeshes.push({ mesh: hitMesh, si: e.si, ti: e.ti });
    }
  }

  // A3 — кластерные оболочки (wireframe-эллипсоид) + спрайты-метки кластеров
  // Позиция и масштаб обновляются в updateAllVisuals по bounding box.
  const clusterShells: { mesh: THREE.LineSegments; clusterIdx: number }[] = [];
  const clusterLabelSprites: { sprite: THREE.Sprite; clusterIdx: number }[] =
    [];
  {
    const topo = G.topology;
    const labels = topo?.clusterLabels || [];
    if (labels.length > 0) {
      // Группируем ns по кластерам
      const clusterNodes: Record<string, typeof ns> = {};
      for (const n of ns) {
        const clusterList = topo.clusters?.[n.name] || [];
        for (const idx of clusterList) {
          (clusterNodes[idx] ??= []).push(n);
        }
      }
      for (const idxStr of Object.keys(clusterNodes)) {
        const idx = Number(idxStr);
        const color = parseInt(
          (CPAL[idx % CPAL.length] || "#555555").replace("#", ""),
          16,
        );

        // Wireframe-эллипсоид: EdgesGeometry поверх SphereGeometry(1,…)
        // Итоговая форма задаётся через mesh.scale в updateAllVisuals
        const sphereGeo = new THREE.SphereGeometry(1, 10, 8);
        const shell = new THREE.LineSegments(
          new THREE.EdgesGeometry(sphereGeo),
          new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
          }),
        );
        shell.userData = { clusterIdx: idx };
        scene.add(shell);
        clusterShells.push({ mesh: shell, clusterIdx: idx });

        // Спрайт-метка кластера (имя без римского префикса)
        const rawLabel = labels[idx] || `Кластер ${idx + 1}`;
        const labelText = rawLabel.replace(/^[IVXLCDM]+\s*[-–—]\s*/i, "").trim();
        const labelSpr = mkSprite(labelText);
        labelSpr.userData = { clusterLabelIdx: idx };
        scene.add(labelSpr);
        clusterLabelSprites.push({ sprite: labelSpr, clusterIdx: idx });
      }
    }
  }

  // ── Живая силовая симуляция ──────────────────────────────────────────
  let simAlpha = 0;
  let fixedNodeIdx: number | null = null; // индекс перетаскиваемого узла в ns

  // Обновляет все Three.js-объекты по текущим позициям ns
  function updateAllVisuals(): void {
    // Тела узлов
    meshes.forEach((m) => {
      const n = ns[m.userData.nodeIdx as number]!;
      m.position.set(n.x, n.y, n.z);
    });
    // Метки-спрайты
    scene.children.forEach((c) => {
      if (c.userData?.labelFor != null) {
        const n = ns[c.userData.labelFor as number]!;
        const r = 1.5 + (n.cen || 0.5) * 3;
        c.position.set(n.x, n.y + r + 2.5, n.z);
      }
    });
    // Линии рёбер
    for (const eg of edgeGeos) {
      const pos = eg.geo.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, ns[eg.si]!.x, ns[eg.si]!.y, ns[eg.si]!.z);
      pos.setXYZ(1, ns[eg.ti]!.x, ns[eg.ti]!.y, ns[eg.ti]!.z);
      pos.needsUpdate = true;
      if (eg.isDashed) eg.line.computeLineDistances();
    }
    // Рефлексивные петли
    for (const { mesh, si } of reflMeshes) {
      const n = ns[si]!;
      const nodeR = 1.5 + (n.cen || 0.5) * 1.5;
      const loopR = nodeR * 1.8;
      mesh.position.set(n.x, n.y + nodeR + loopR, n.z);
    }
    // Конусы-стрелки
    for (const { mesh, si, ti, pointsToTi } of arrowMeshes) {
      updateCone(mesh, si, ti, pointsToTi);
    }
    // Хитбоксы рёбер
    for (const { mesh, si, ti } of edgeHitMeshes) {
      if (si === ti) {
        const n = ns[si]!;
        const nodeR = 1.5 + (n.cen || 0.5) * 1.5;
        const loopR = nodeR * 1.8;
        mesh.position.set(n.x, n.y + nodeR + loopR, n.z);
      } else {
        const a = ns[si]!,
          b = ns[ti]!;
        const ev = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
        const len = ev.length();
        mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        if (len > 0.001) {
          mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            ev.normalize(),
          );
          mesh.scale.y = len / (mesh.userData._origLen as number);
        }
      }
    }
    // A3: wireframe-эллипсоиды — bounding box по осям + спрайты-метки
    if (clusterShells.length) {
      const topo = G.topology;
      const PAD = 12; // отступ вокруг крайних узлов

      // Общий расчёт центроидов (нужен и для оболочек, и для меток)
      const centroids: Record<
        number,
        { cx: number; cy: number; cz: number; members: typeof ns }
      > = {};
      for (const { clusterIdx } of clusterShells) {
        const members = ns.filter((n) =>
          (topo.clusters?.[n.name] || []).includes(clusterIdx),
        );
        if (!members.length) continue;
        centroids[clusterIdx] = {
          cx: members.reduce((s, n) => s + n.x, 0) / members.length,
          cy: members.reduce((s, n) => s + n.y, 0) / members.length,
          cz: members.reduce((s, n) => s + n.z, 0) / members.length,
          members,
        };
      }

      // Wireframe-эллипсоиды: scale по полуосям bounding box
      for (const { mesh, clusterIdx } of clusterShells) {
        const c = centroids[clusterIdx];
        if (!c) continue;
        const { cx, cy, cz, members } = c;
        mesh.position.set(cx, cy, cz);

        const xs = members.map((n) => n.x);
        const ys = members.map((n) => n.y);
        const zs = members.map((n) => n.z);
        // Полуось = (max - min) / 2 + отступ; минимум PAD (для одиночных узлов)
        mesh.scale.set(
          Math.max(PAD, (Math.max(...xs) - Math.min(...xs)) / 2 + PAD),
          Math.max(PAD, (Math.max(...ys) - Math.min(...ys)) / 2 + PAD),
          Math.max(PAD, (Math.max(...zs) - Math.min(...zs)) / 2 + PAD),
        );
      }

      // Спрайты-метки: позиционируем над верхней границей эллипсоида
      for (const { sprite, clusterIdx } of clusterLabelSprites) {
        const c = centroids[clusterIdx];
        if (!c) continue;
        const ys = c.members.map((n) => n.y);
        const topY = Math.max(...ys) + PAD + 6;
        sprite.position.set(c.cx, topY, c.cz);
      }
    }
  }
  // ────────────────────────────────────────────────────────────────────

  let isOrbit = false,
    pX = 0,
    pY = 0;
  let rotX = 0,
    rotY = 0,
    zoom = 150,
    dragNode: NodeMesh | null = null;
  let orbitVX = 0,
    orbitVY = 0;
  let hoveredMesh: NodeMesh | null = null;
  let selectedMesh3d: NodeMesh | null = null;
  let selectedEdge3d: { edgeData: SimEdge; si: number; ti: number } | null =
    null;
  let mouseDownX = 0,
    mouseDownY = 0;

  // Граф соседства: nodeIdx → Set<nodeIdx>
  const neighbors: Record<number, Set<number>> = {};
  for (const n of ns) neighbors[n.id] = new Set();
  for (const e of es) {
    if (e.si !== e.ti) {
      neighbors[e.si]!.add(e.ti);
      neighbors[e.ti]!.add(e.si);
    }
  }

  const DIM_OPACITY = 0.06;
  const DIM_EMISSIVE = 0.02;

  function forEachChild(
    m: NodeMesh,
    fn: (c: Obj3D) => void,
  ): void {
    m.children.forEach((c) => fn(c as Obj3D));
  }

  function resetAll3d(): void {
    meshes.forEach((m) => {
      m.material.opacity = m.userData.baseOpacity as number;
      m.material.emissiveIntensity =
        (m.userData.baseEmissive as number) ?? 0.15; // ← из userData
      m.scale.setScalar((m.userData.baseScale as number) ?? 1);
      // Восстанавливаем дочерние объекты (кольца, каркасы, тетраэдры, inner mesh, PointLight)
      forEachChild(m, (c) => {
        if (c.isLight) {
          // PointLight (generative)
          c.intensity = (c.userData?.baseIntensity as number) ?? 0.6;
        } else if (c.material && c.userData?.baseOpacity != null) {
          c.material.opacity = c.userData.baseOpacity as number;
          if (c.material.emissiveIntensity !== undefined)
            c.material.emissiveIntensity =
              (c.userData?.baseEmissive as number) ?? 0.15;
        }
      });
    });
    edgeMaterials.forEach((mat) => {
      mat.opacity = mat.userData?.baseOp ?? mat.opacity;
    });
    scene.children.forEach((child) => {
      const c = child as Obj3D;
      if (c.userData?.labelFor != null && c.material) c.material.opacity = 0.9;
      if (
        ((c as unknown as THREE.Line).isLine ||
          (c as unknown as THREE.Mesh).isMesh) &&
        c.userData?.si !== undefined &&
        c.material
      )
        c.material.opacity = c.material.userData?.baseOp ?? c.material.opacity;
    });
  }

  function setHover(mesh: NodeMesh | null): void {
    if (hoveredMesh === mesh) return;

    // ── Сброс предыдущего hover ─────────────────────────────────────
    if (hoveredMesh) {
      const wasSelected = selectedMesh3d === hoveredMesh;
      const bs = (hoveredMesh.userData.baseScale as number) ?? 1;
      hoveredMesh.scale.setScalar(wasSelected ? bs * 1.3 : bs);
      hoveredMesh.material.emissiveIntensity = wasSelected
        ? 0.6
        : ((hoveredMesh.userData.baseEmissive as number) ?? 0.15);

      // Соседние узлы
      const prevIdx = hoveredMesh.userData.nodeIdx as number;
      const prevNbrs = neighbors[prevIdx] || new Set<number>();
      meshes.forEach((m) => {
        if (prevNbrs.has(m.userData.nodeIdx as number))
          m.material.emissiveIntensity = selectedMesh3d
            ? DIM_EMISSIVE
            : ((m.userData.baseEmissive as number) ?? 0.15);
      });

      // Рёбра — через массивы напрямую
      if (!selectedMesh3d && !selectedEdge3d && !gs.legendFilter) {
        for (const eg of edgeGeos)
          eg.line.material.opacity =
            (eg.line.material.userData?.baseOp as number) ??
            eg.line.material.opacity;
        for (const { mesh: arrow } of arrowMeshes)
          arrow.material.opacity =
            arrow.material.userData?.baseOp ?? arrow.material.opacity;
        for (const { mesh: torus } of reflMeshes)
          torus.material.opacity =
            torus.material.userData?.baseOp ?? torus.material.opacity;
      }
    }

    hoveredMesh = mesh;
    if (!mesh) {
      // Если фильтр легенды активен — восстановить его после сброса hover
      if (gs.legendFilter) {
        if (gs.legendFilter.type === "role")
          applyRoleFilter3d(gs.legendFilter.key, gs.legendFilter.layer);
        else if (gs.legendFilter.type === "cluster")
          applyClusterFilter3d(gs.legendFilter.idx);
      }
      return;
    }

    const hovIdx = mesh.userData.nodeIdx as number;
    const nbrs = neighbors[hovIdx] || new Set<number>();
    const visSet = new Set([hovIdx, ...nbrs]);

    // Подсветка соседних узлов и рёбер — только если нет активного выделения / фильтра
    if (!selectedMesh3d && !selectedEdge3d && !gs.legendFilter) {
      meshes.forEach((m) => {
        if (nbrs.has(m.userData.nodeIdx as number))
          m.material.emissiveIntensity = 0.45;
      });

      for (const eg of edgeGeos) {
        if (visSet.has(eg.si) && visSet.has(eg.ti))
          eg.line.material.opacity = Math.min(
            1,
            ((eg.line.material.userData?.baseOp as number) ?? 0.5) * 2.2,
          );
      }
      for (const { mesh: arrow, si, ti } of arrowMeshes) {
        if (visSet.has(si) && visSet.has(ti))
          arrow.material.opacity = Math.min(
            1,
            (arrow.material.userData?.baseOp ?? 0.5) * 2.2,
          );
      }
      for (const { mesh: torus, si } of reflMeshes) {
        if (si === hovIdx)
          torus.material.opacity = Math.min(
            1,
            (torus.material.userData?.baseOp ?? 0.5) * 2.2,
          );
      }
    }

    // ── Подсветка самого узла (не при фильтре легенды) ──────────
    if (!gs.legendFilter) {
      mesh.scale.setScalar(((mesh.userData.baseScale as number) ?? 1) * 1.3);
      mesh.material.emissiveIntensity = 0.6;
    }
  }

  function setEdgeHover3d(
    edgeInfo: { edgeData: SimEdge; si: number; ti: number } | null,
  ): void {
    // не ломать активное выделение / фильтр
    if (selectedMesh3d || selectedEdge3d || gs.legendFilter) return;

    if (!edgeInfo) {
      // Сброс hover → resetAll3d
      resetAll3d();
      return;
    }

    const { si, ti } = edgeInfo;
    const endpointSet = new Set([si, ti]);

    // Подсветка узлов-концов
    meshes.forEach((m) => {
      if (endpointSet.has(m.userData.nodeIdx as number))
        m.material.emissiveIntensity = 0.45;
    });

    // Подсветка связи
    for (const eg of edgeGeos) {
      if ((eg.si === si && eg.ti === ti) || (eg.si === ti && eg.ti === si))
        eg.line.material.opacity = Math.min(
          1,
          ((eg.line.material.userData?.baseOp as number) ?? 0.5) * 2.2,
        );
    }
    for (const { mesh: arrow, si: aSi, ti: aTi } of arrowMeshes) {
      if ((aSi === si && aTi === ti) || (aSi === ti && aTi === si))
        arrow.material.opacity = Math.min(
          1,
          (arrow.material.userData?.baseOp ?? 0.5) * 2.2,
        );
    }
    for (const { mesh: torus, si: rSi } of reflMeshes) {
      if (rSi === si && si === ti)
        torus.material.opacity = Math.min(
          1,
          (torus.material.userData?.baseOp ?? 0.5) * 2.2,
        );
    }
  }

  function setEdgeSelected3d(
    edgeInfo: { edgeData: SimEdge; si: number; ti: number } | null,
  ): void {
    // Снимаем предыдущее
    if (selectedMesh3d) {
      resetAll3d();
      selectedMesh3d = null;
    }
    if (selectedEdge3d) {
      resetAll3d();
      selectedEdge3d = null;
    }

    if (!edgeInfo) return;
    selectedEdge3d = edgeInfo;

    const { si, ti } = edgeInfo;
    const endpointSet = new Set([si, ti]);

    // Диммируем все узлы, кроме концов связи
    meshes.forEach((m) => {
      const idx = m.userData.nodeIdx as number;
      if (!endpointSet.has(idx)) {
        m.material.opacity = DIM_OPACITY;
        m.material.emissiveIntensity = DIM_EMISSIVE;
        forEachChild(m, (c) => {
          if (c.isLight) {
            c.intensity = DIM_EMISSIVE * 0.1;
          } else if (c.material) {
            c.material.opacity = DIM_OPACITY;
            if (c.material.emissiveIntensity !== undefined)
              c.material.emissiveIntensity = DIM_EMISSIVE;
          }
        });
      } else {
        // Подсвечиваем концы
        m.material.emissiveIntensity = Math.max(
          0.45,
          (m.userData.baseEmissive as number) ?? 0.15,
        );
      }
    });

    // Диммируем метки
    scene.children.forEach((child) => {
      const c = child as Obj3D;
      if (
        c.userData?.labelFor != null &&
        !endpointSet.has(c.userData.labelFor as number) &&
        c.material
      )
        c.material.opacity = DIM_OPACITY;
    });

    // Диммируем ВСЕ рёбра
    for (const eg of edgeGeos)
      eg.line.material.opacity =
        ((eg.line.material.userData?.baseOp as number) ??
          eg.line.material.opacity) * 0.08;
    for (const { mesh: arrow } of arrowMeshes)
      arrow.material.opacity =
        (arrow.material.userData?.baseOp ?? arrow.material.opacity) * 0.08;
    for (const { mesh: torus } of reflMeshes)
      torus.material.opacity =
        (torus.material.userData?.baseOp ?? torus.material.opacity) * 0.08;

    // Восстанавливаем только выбранное ребро
    for (const eg of edgeGeos) {
      if ((eg.si === si && eg.ti === ti) || (eg.si === ti && eg.ti === si))
        eg.line.material.opacity = Math.min(
          1,
          ((eg.line.material.userData?.baseOp as number) ?? 0.5) * 1.5,
        );
    }
    for (const { mesh: arrow, si: aSi, ti: aTi } of arrowMeshes) {
      if ((aSi === si && aTi === ti) || (aSi === ti && aTi === si))
        arrow.material.opacity = Math.min(
          1,
          (arrow.material.userData?.baseOp ?? 0.5) * 1.5,
        );
    }
    for (const { mesh: torus, si: rSi } of reflMeshes) {
      if (rSi === si && si === ti)
        torus.material.opacity = Math.min(
          1,
          (torus.material.userData?.baseOp ?? 0.5) * 1.5,
        );
    }
  }

  function setSelected(mesh: NodeMesh | null): void {
    // Снимаем старый selected
    if (selectedMesh3d) {
      resetAll3d();
      selectedMesh3d = null;
    }

    selectedMesh3d = mesh;
    if (!mesh) return;

    const selIdx = mesh.userData.nodeIdx as number;
    const nbrs = neighbors[selIdx] || new Set<number>();
    const visSet = new Set([selIdx, ...nbrs]);

    // Диммируем не-соседей (то же, что раньше делал hover)
    meshes.forEach((m) => {
      const idx = m.userData.nodeIdx as number;
      if (!visSet.has(idx)) {
        m.material.opacity = DIM_OPACITY;
        m.material.emissiveIntensity = DIM_EMISSIVE;
        // Затеняем все дочерние: inner mesh, wireframe, PointLight
        forEachChild(m, (c) => {
          if (c.isLight) {
            // Приглушаем свет (не выключаем полностью — иначе резкий скачок)
            c.intensity = DIM_EMISSIVE * 0.1;
          } else if (c.material) {
            c.material.opacity = DIM_OPACITY;
            if (c.material.emissiveIntensity !== undefined)
              c.material.emissiveIntensity = DIM_EMISSIVE;
          }
        });
      }
    });
    scene.children.forEach((child) => {
      const c = child as Obj3D;
      if (
        c.userData?.labelFor != null &&
        !visSet.has(c.userData.labelFor as number) &&
        c.material
      )
        c.material.opacity = DIM_OPACITY;
    });
    for (const eg of edgeGeos)
      eg.line.material.opacity =
        ((eg.line.material.userData?.baseOp as number) ??
          eg.line.material.opacity) * 0.08;
    for (const { mesh: arrow } of arrowMeshes)
      arrow.material.opacity =
        (arrow.material.userData?.baseOp ?? arrow.material.opacity) * 0.08;
    for (const { mesh: torus } of reflMeshes)
      torus.material.opacity =
        (torus.material.userData?.baseOp ?? torus.material.opacity) * 0.08;

    // Восстанавливаем только рёбра, непосредственно связанные с selIdx
    for (const eg of edgeGeos) {
      if (eg.si === selIdx || eg.ti === selIdx)
        eg.line.material.opacity =
          (eg.line.material.userData?.baseOp as number) ?? 0.5;
    }
    for (const { mesh: arrow, si, ti } of arrowMeshes) {
      if (si === selIdx || ti === selIdx)
        arrow.material.opacity = arrow.material.userData?.baseOp ?? 0.5;
    }
    for (const { mesh: torus, si } of reflMeshes) {
      if (si === selIdx)
        torus.material.opacity = torus.material.userData?.baseOp ?? 0.5;
    }

    // Подсвечиваем выбранный узел
    mesh.scale.setScalar(((mesh.userData.baseScale as number) ?? 1) * 1.3);
    mesh.material.emissiveIntensity = Math.max(
      0.6,
      (mesh.userData.baseEmissive as number) ?? 0.15,
    );
    // Для generative (baseEmissive = 0.85) и peripheral (0.05) визуально
    // одинаково при выделении, но формула корректна.

    // Восстанавливаем дочерние объекты выбранного узла
    forEachChild(mesh, (c) => {
      if (c.isLight) {
        c.intensity = (c.userData?.baseIntensity as number) ?? 0.6;
      } else if (c.material && c.userData?.baseOpacity != null) {
        c.material.opacity = c.userData.baseOpacity as number;
        if (c.material.emissiveIntensity !== undefined)
          c.material.emissiveIntensity =
            (c.userData?.baseEmissive as number) ?? 0.15;
      }
    });
  }

  // ── Фильтрация из легенды: роль ──────────────────────────────────────
  function applyRoleFilter3d(roleKey: string, layer: RoleLayer): void {
    resetAll3d();
    selectedMesh3d = null;
    selectedEdge3d = null;
    const matchSet = new Set<number>();
    ns.forEach((n, i) => {
      const roles = getRolesFromLayer(layer, n.name);
      if (roles.has(roleKey)) matchSet.add(i);
    });
    meshes.forEach((m) => {
      const idx = m.userData.nodeIdx as number;
      if (!matchSet.has(idx)) {
        m.material.opacity = DIM_OPACITY;
        m.material.emissiveIntensity = DIM_EMISSIVE;
        forEachChild(m, (c) => {
          if (c.isLight) c.intensity = DIM_EMISSIVE * 0.1;
          else if (c.material) {
            c.material.opacity = DIM_OPACITY;
            if (c.material.emissiveIntensity !== undefined)
              c.material.emissiveIntensity = DIM_EMISSIVE;
          }
        });
      } else {
        m.material.emissiveIntensity = Math.max(
          0.45,
          (m.userData.baseEmissive as number) ?? 0.15,
        );
      }
    });
    scene.children.forEach((child) => {
      const c = child as Obj3D;
      if (
        c.userData?.labelFor != null &&
        !matchSet.has(c.userData.labelFor as number) &&
        c.material
      )
        c.material.opacity = DIM_OPACITY;
    });
    for (const eg of edgeGeos)
      eg.line.material.opacity =
        matchSet.has(eg.si) && matchSet.has(eg.ti)
          ? ((eg.line.material.userData?.baseOp as number) ?? 0.5)
          : ((eg.line.material.userData?.baseOp as number) ?? 0.5) * 0.08;
    for (const { mesh: arrow, si, ti } of arrowMeshes)
      arrow.material.opacity =
        matchSet.has(si) && matchSet.has(ti)
          ? (arrow.material.userData?.baseOp ?? 0.5)
          : (arrow.material.userData?.baseOp ?? 0.5) * 0.08;
    for (const { mesh: torus, si } of reflMeshes)
      torus.material.opacity = matchSet.has(si)
        ? (torus.material.userData?.baseOp ?? 0.5)
        : (torus.material.userData?.baseOp ?? 0.5) * 0.08;
    // Восстановить видимость кластерных оболочек (могли быть скрыты фильтром кластера)
    applyClusters3D();
  }

  // ── Фильтрация из легенды: кластер ──────────────────────────────────
  function applyClusterFilter3d(clusterIdx: number): void {
    resetAll3d();
    selectedMesh3d = null;
    selectedEdge3d = null;
    const topo = G.topology;
    const matchSet = new Set<number>();
    ns.forEach((n, i) => {
      const cl = topo?.clusters?.[n.name] || [];
      if (cl.includes(clusterIdx)) matchSet.add(i);
    });
    meshes.forEach((m) => {
      const idx = m.userData.nodeIdx as number;
      if (!matchSet.has(idx)) {
        m.material.opacity = DIM_OPACITY;
        m.material.emissiveIntensity = DIM_EMISSIVE;
        forEachChild(m, (c) => {
          if (c.isLight) c.intensity = DIM_EMISSIVE * 0.1;
          else if (c.material) {
            c.material.opacity = DIM_OPACITY;
            if (c.material.emissiveIntensity !== undefined)
              c.material.emissiveIntensity = DIM_EMISSIVE;
          }
        });
      } else {
        m.material.emissiveIntensity = Math.max(
          0.45,
          (m.userData.baseEmissive as number) ?? 0.15,
        );
      }
    });
    scene.children.forEach((child) => {
      const c = child as Obj3D;
      if (
        c.userData?.labelFor != null &&
        !matchSet.has(c.userData.labelFor as number) &&
        c.material
      )
        c.material.opacity = DIM_OPACITY;
    });
    for (const eg of edgeGeos)
      eg.line.material.opacity =
        matchSet.has(eg.si) && matchSet.has(eg.ti)
          ? ((eg.line.material.userData?.baseOp as number) ?? 0.5)
          : ((eg.line.material.userData?.baseOp as number) ?? 0.5) * 0.08;
    for (const { mesh: arrow, si, ti } of arrowMeshes)
      arrow.material.opacity =
        matchSet.has(si) && matchSet.has(ti)
          ? (arrow.material.userData?.baseOp ?? 0.5)
          : (arrow.material.userData?.baseOp ?? 0.5) * 0.08;
    for (const { mesh: torus, si } of reflMeshes)
      torus.material.opacity = matchSet.has(si)
        ? (torus.material.userData?.baseOp ?? 0.5)
        : (torus.material.userData?.baseOp ?? 0.5) * 0.08;
    // Показать только оболочку выбранного кластера
    if (gs.clusterVisible) {
      clusterShells.forEach(({ mesh, clusterIdx: ci }) => {
        mesh.visible = ci === clusterIdx;
      });
      clusterLabelSprites.forEach(({ sprite, clusterIdx: ci }) => {
        sprite.visible = ci === clusterIdx;
      });
    }
  }

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const plane = new THREE.Plane();
  const intersection = new THREE.Vector3();
  const cv = renderer.domElement;

  /** Общий обработчик «клика/тапа» по координатам (мышь и тач) */
  function handlePick(offsetX: number, offsetY: number): void {
    clearLegendFilter();
    mouse.x = (offsetX / cv.clientWidth) * 2 - 1;
    mouse.y = -(offsetY / cv.clientHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, cam);
    const hits = raycaster.intersectObjects(meshes);

    if (hits.length > 0) {
      // ── Тап по узлу ──
      if (selectedEdge3d) {
        resetAll3d();
        selectedEdge3d = null;
      }

      const hitMesh = hits[0]!.object as NodeMesh;
      const nodeIdx = hitMesh.userData.nodeIdx as number;

      if (selectedMesh3d === hitMesh) {
        setSelected(null);
        panels.onHidePanel();
      } else {
        setSelected(hitMesh);
        const n = ns[nodeIdx]!;
        const nodeData = {
          ...G.nodes[nodeIdx]!,
          id: nodeIdx,
          cluster: G.topology?.clusters?.[n.name] ?? [],
          roles: getRolesForMode(n.name),
          structuralRoles: getRolesFromLayer("structural", n.name),
          proceduralRoles: getRolesFromLayer("procedural", n.name),
        };
        const nm = Object.fromEntries(
          G.nodes.map((nd, i) => [nd.name.toLowerCase(), i]),
        );
        const links3d = G.edges
          .map((ed) => ({
            source: { id: nm[ed.src.toLowerCase()] ?? -1, name: ed.src },
            target: { id: nm[ed.tgt.toLowerCase()] ?? -1, name: ed.tgt },
            type: ed.type,
            dir: ed.dir,
            str: ed.str,
            desc: ed.desc,
          }))
          .filter((l) => l.source.id >= 0 && l.target.id >= 0);
        panels.onShowNode(nodeData, links3d);
      }
    } else {
      // ── Проверяем тап по связи ──
      const edgeHits = raycaster.intersectObjects(
        edgeHitMeshes.map((h) => h.mesh),
      );
      if (edgeHits.length > 0) {
        const hitObj = edgeHits[0]!.object;
        const ed = hitObj.userData.edgeData as SimEdge;
        const hitEntry = edgeHitMeshes.find((h) => h.mesh === hitObj);
        if (hitEntry) {
          if (
            selectedEdge3d &&
            selectedEdge3d.si === hitEntry.si &&
            selectedEdge3d.ti === hitEntry.ti &&
            selectedEdge3d.edgeData.type === ed.type
          ) {
            setEdgeSelected3d(null);
            panels.onHidePanel();
          } else {
            if (selectedMesh3d) {
              resetAll3d();
              selectedMesh3d = null;
            }
            setEdgeSelected3d({ edgeData: ed, si: hitEntry.si, ti: hitEntry.ti });
            panels.onShowEdge(ed as GEdge);
          }
        }
      } else {
        // Тап по пустому месту — снять всё
        setSelected(null);
        setEdgeSelected3d(null);
        panels.onHidePanel();
      }
    }
  }

  cv.addEventListener("mousedown", (e) => {
    mouseDownX = e.clientX; // A6
    mouseDownY = e.clientY; // A6
    raycaster.setFromCamera(mouse, cam);
    const hits = raycaster.intersectObjects(meshes);
    if (hits.length > 0) {
      dragNode = hits[0]!.object as NodeMesh;
      fixedNodeIdx = dragNode.userData.nodeIdx as number;
      simAlpha = Math.max(simAlpha, 0.3);
      plane.setFromNormalAndCoplanarPoint(
        cam.getWorldDirection(new THREE.Vector3()).negate(),
        dragNode.position,
      );
      cv.style.cursor = "grabbing";
    } else {
      // Не ставим isOrbit, если луч попал в хитбокс связи
      const eHits = raycaster.intersectObjects(edgeHitMeshes.map((h) => h.mesh));
      if (eHits.length === 0) isOrbit = true;
    }
    pX = e.clientX;
    pY = e.clientY;
  });

  cv.addEventListener("mousemove", (e) => {
    // Hover-тултип
    if (!dragNode && !isOrbit) {
      mouse.x = (e.offsetX / cv.clientWidth) * 2 - 1;
      mouse.y = -(e.offsetY / cv.clientHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, cam);
      const nodeHits = raycaster.intersectObjects(meshes);
      if (nodeHits.length > 0) {
        const hit = nodeHits[0]!.object as NodeMesh;
        setHover(hit);
        const n = ns[hit.userData.nodeIdx as number]!;
        tooltip.style.display = "block";
        tooltip.style.left = e.clientX + 14 + "px";
        tooltip.style.top = e.clientY - 10 + "px";
        tooltip.textContent = `${n.name}\n[${normalizeType(n.type)}]\n${n.def}`;
        cv.style.cursor = "pointer";
      } else {
        setHover(null);
        const edgeHits = raycaster.intersectObjects(
          edgeHitMeshes.map((h) => h.mesh),
        );
        if (edgeHits.length > 0) {
          const hitObj = edgeHits[0]!.object;
          const ed = hitObj.userData.edgeData as SimEdge;
          // Hover-подсветка связи + концов
          const hitEntry = edgeHitMeshes.find((h) => h.mesh === hitObj);
          if (hitEntry)
            setEdgeHover3d({ edgeData: ed, si: hitEntry.si, ti: hitEntry.ti });
          tooltip.style.display = "block";
          tooltip.style.left = e.clientX + 14 + "px";
          tooltip.style.top = e.clientY - 10 + "px";
          tooltip.textContent = `${ed.desc}\n[${ed.type}]\n${ed.dir}`;
          cv.style.cursor = "pointer";
        } else {
          setEdgeHover3d(null);
          tooltip.style.display = "none";
          cv.style.cursor = "";
        }
      }
    }

    if (dragNode) {
      tooltip.style.display = "none";
      mouse.x = (e.offsetX / cv.clientWidth) * 2 - 1;
      mouse.y = -(e.offsetY / cv.clientHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, cam);
      if (raycaster.ray.intersectPlane(plane, intersection)) {
        const nodeIdx = dragNode.userData.nodeIdx as number;
        ns[nodeIdx]!.x = intersection.x; // позиция в ns — источник правды
        ns[nodeIdx]!.y = intersection.y; // updateAllVisuals в animate обновит всё
        ns[nodeIdx]!.z = intersection.z;
        simAlpha = Math.max(simAlpha, 0.3); // держим симуляцию живой
      }
    } else if (isOrbit) {
      tooltip.style.display = "none";
      const dX = (e.clientX - pX) * 0.005;
      const dY = (e.clientY - pY) * 0.005;
      orbitVX = dX;
      orbitVY = dY;
      rotY += dX;
      rotX += dY;
      rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
      pX = e.clientX;
      pY = e.clientY;
    }
  });

  cv.addEventListener("mouseup", (e) => {
    const moved = Math.hypot(e.clientX - mouseDownX, e.clientY - mouseDownY); // A6

    // A6: если движения почти не было — это клик, а не начало drag/orbit
    if (moved < 5 && !isOrbit) {
      handlePick(e.offsetX, e.offsetY);
    }

    if (moved < 5 && isOrbit) {
      clearLegendFilter();
      setSelected(null);
      setEdgeSelected3d(null);
      panels.onHidePanel();
    }

    isOrbit = false;
    dragNode = null;
    fixedNodeIdx = null;
    simAlpha = Math.max(simAlpha, 0.4);
    cv.style.cursor = "";
  });
  cv.addEventListener("mouseleave", () => {
    isOrbit = false;
    dragNode = null;
    fixedNodeIdx = null;
    setHover(null);
    tooltip.style.display = "none";
  });
  cv.addEventListener(
    "wheel",
    (e) => {
      zoom = Math.max(30, Math.min(400, zoom + e.deltaY * 0.1));
      e.preventDefault();
    },
    { passive: false },
  );
  cv.addEventListener("dblclick", () => {
    rotX = 0;
    rotY = 0;
    zoom = 150;
  });

  function getTouchPos(e: TouchEvent): {
    clientX: number;
    clientY: number;
    offsetX: number;
    offsetY: number;
  } {
    const rect = cv.getBoundingClientRect();
    const t = e.touches[0] || e.changedTouches[0]!;
    return {
      clientX: t.clientX,
      clientY: t.clientY,
      offsetX: t.clientX - rect.left,
      offsetY: t.clientY - rect.top,
    };
  }

  let lastPinchDist: number | null = null;

  cv.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        // Начало пинча — сбрасываем orbit/drag
        isOrbit = false;
        dragNode = null;
        fixedNodeIdx = null;
        const dx = e.touches[0]!.clientX - e.touches[1]!.clientX;
        const dy = e.touches[0]!.clientY - e.touches[1]!.clientY;
        lastPinchDist = Math.hypot(dx, dy);
        return;
      }
      lastPinchDist = null;
      const p = getTouchPos(e);
      mouseDownX = p.clientX;
      mouseDownY = p.clientY;
      mouse.x = (p.offsetX / cv.clientWidth) * 2 - 1;
      mouse.y = -(p.offsetY / cv.clientHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, cam);
      const hits = raycaster.intersectObjects(meshes);
      if (hits.length > 0) {
        dragNode = hits[0]!.object as NodeMesh;
        fixedNodeIdx = dragNode.userData.nodeIdx as number;
        simAlpha = Math.max(simAlpha, 0.3);
        plane.setFromNormalAndCoplanarPoint(
          cam.getWorldDirection(new THREE.Vector3()).negate(),
          dragNode.position,
        );
      } else {
        // Не ставим isOrbit, если луч попал в хитбокс связи
        const eHits = raycaster.intersectObjects(
          edgeHitMeshes.map((h) => h.mesh),
        );
        if (eHits.length === 0) isOrbit = true;
      }
      pX = p.clientX;
      pY = p.clientY;
    },
    { passive: false },
  );

  cv.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        // Пинч — только масштабирование, без вращения
        const dx = e.touches[0]!.clientX - e.touches[1]!.clientX;
        const dy = e.touches[0]!.clientY - e.touches[1]!.clientY;
        const dist = Math.hypot(dx, dy);
        if (lastPinchDist !== null) {
          zoom = Math.max(30, Math.min(400, zoom - (dist - lastPinchDist) * 0.5));
        }
        lastPinchDist = dist;
        return;
      }
      lastPinchDist = null;
      const p = getTouchPos(e);
      if (dragNode) {
        mouse.x = (p.offsetX / cv.clientWidth) * 2 - 1;
        mouse.y = -(p.offsetY / cv.clientHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, cam);
        if (raycaster.ray.intersectPlane(plane, intersection)) {
          const idx = dragNode.userData.nodeIdx as number;
          ns[idx]!.x = intersection.x;
          ns[idx]!.y = intersection.y;
          ns[idx]!.z = intersection.z;
          simAlpha = Math.max(simAlpha, 0.3);
        }
      } else if (isOrbit) {
        const dX = (p.clientX - pX) * 0.005;
        const dY = (p.clientY - pY) * 0.005;
        orbitVX = dX;
        orbitVY = dY;
        rotY += dX;
        rotX += dY;
        rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
        pX = p.clientX;
        pY = p.clientY;
      }
    },
    { passive: false },
  );

  cv.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      if (e.touches.length < 2) lastPinchDist = null;
      if (e.touches.length > 0) return;

      // Координаты из changedTouches
      const rect = cv.getBoundingClientRect();
      const touch = e.changedTouches[0]!;
      const offsetX = touch.clientX - rect.left;
      const offsetY = touch.clientY - rect.top;

      const moved = Math.hypot(
        touch.clientX - mouseDownX,
        touch.clientY - mouseDownY,
      );

      if (moved < 5 && !isOrbit) {
        handlePick(offsetX, offsetY);
      }

      if (moved < 5 && isOrbit) {
        clearLegendFilter();
        setSelected(null);
        setEdgeSelected3d(null);
        panels.onHidePanel();
      }

      isOrbit = false;
      dragNode = null;
      fixedNodeIdx = null;
      simAlpha = Math.max(simAlpha, 0.4);
    },
    { passive: false },
  );

  ns.forEach((n) => {
    n.tx = n.x;
    n.ty = n.y;
    n.tz = n.z;
    n.x = 0;
    n.y = 0;
    n.z = 0;
  });
  let appearT = 0;
  const APPEAR_DUR = 55;
  function easeOut3(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  function animate(): void {
    gs.anim3d = requestAnimationFrame(animate);
    // Анимация появления
    if (appearT < APPEAR_DUR && fixedNodeIdx === null) {
      appearT++;
      const t = easeOut3(appearT / APPEAR_DUR);
      ns.forEach((n) => {
        n.x = n.tx! * t;
        n.y = n.ty! * t;
        n.z = n.tz! * t;
      });
      meshes.forEach((m) => m.scale.setScalar(t));
      updateAllVisuals();
    } else {
      if (appearT < APPEAR_DUR) {
        // Прерываем анимацию — мгновенно к целевым позициям
        ns.forEach((n) => {
          n.x = n.tx!;
          n.y = n.ty!;
          n.z = n.tz!;
        });
        meshes.forEach((m) => m.scale.setScalar(1));
        appearT = APPEAR_DUR;
      }
      if (simAlpha > 0.001 || fixedNodeIdx !== null) {
        tick(ns, es, simAlpha, fixedNodeIdx);
        simAlpha *= 0.95;
        if (simAlpha < 0.001 && fixedNodeIdx === null) simAlpha = 0;
        updateAllVisuals();
      }
    }
    if (!isOrbit) {
      orbitVX *= 0.96;
      orbitVY *= 0.96;
      rotY += orbitVX;
      rotX += orbitVY;
      rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
    }
    cam.position.x = zoom * Math.sin(rotY) * Math.cos(rotX);
    cam.position.y = zoom * Math.sin(rotX);
    cam.position.z = zoom * Math.cos(rotY) * Math.cos(rotX);
    cam.lookAt(0, 0, 0);
    renderer.render(scene, cam);
  }
  animate();

  gs.resizeObs3d = new ResizeObserver(() => {
    if (!gs.renderer3d) return;
    const w = ct.clientWidth,
      h = ct.clientHeight;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    gs.renderer3d.setSize(w, h);
  });
  gs.resizeObs3d.observe(ct);

  // Сохраняем ссылки для toggleClusters и применяем текущее состояние
  gs.clusterObjects3d = { shells: clusterShells, labelSprites: clusterLabelSprites };
  applyClusters3D();

  // Экспорт API для легенды
  gs.graphAPI3d = {
    applyRoleFilter: applyRoleFilter3d,
    applyClusterFilter: applyClusterFilter3d,
    clearSelection() {
      selectedMesh3d = null;
      selectedEdge3d = null;
      resetAll3d();
      applyClusters3D();
      panels.onHidePanel();
    },
  };
}

/** 3D-часть closeGraph() [16137] — освобождение ресурсов при unmount */
export function disposeGraph3D(ct: HTMLDivElement | null): void {
  const gs = graphState;
  if (gs.anim3d) cancelAnimationFrame(gs.anim3d);
  gs.anim3d = null;
  if (gs.resizeObs3d) {
    gs.resizeObs3d.disconnect();
    gs.resizeObs3d = null;
  }
  if (gs.scene3d) {
    gs.scene3d.traverse((obj) => {
      const o = obj as Obj3D;
      if ((o as unknown as THREE.Mesh).geometry)
        (o as unknown as THREE.Mesh).geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    gs.scene3d = null;
  }
  const c = ct?.querySelector("canvas");
  if (c) c.remove();
  if (gs.renderer3d) {
    gs.renderer3d.dispose();
    gs.renderer3d = null;
  }
  gs.clusterObjects3d = null;
  gs.graphAPI3d = null;
}

/* ── React-обвязка ──────────────────────────────────────────────────── */

export interface Graph3DProps {
  tooltipRef: RefObject<HTMLDivElement | null>;
  panels: PanelCallbacks;
}

export default function Graph3D({ tooltipRef, panels }: Graph3DProps) {
  const ref = useRef<HTMLDivElement>(null);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;

  useEffect(() => {
    const ct = ref.current;
    const tooltip = tooltipRef.current;
    if (!ct || !tooltip) return;
    // Стабильный делегат — колбэки берутся из ref на момент вызова
    const delegate: PanelCallbacks = {
      onShowNode: (d, links) => panelsRef.current.onShowNode(d, links),
      onShowEdge: (e) => panelsRef.current.onShowEdge(e),
      onHidePanel: () => panelsRef.current.onHidePanel(),
    };
    buildGraph3D(ct, tooltip, delegate);
    return () => disposeGraph3D(ct);
    // Пересборка — только при переключении вида (unmount/mount), как в исходнике
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="gm-view active" ref={ref} />;
}
