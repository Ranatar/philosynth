/**
 * graph-geometry — Three.js-геометрии узлов по роли + текстовые спрайты.
 * Беседа 1.7. Порт nodeGeometry3D() [13707] и mkSprite() [13796] из
 * 1.7-graph-viz.js дословно (three r128 — все геометрии доступны).
 *
 * Размещение — по 05-структуре (utils/graph-geometry.ts); в п.1 первого
 * запроса 1.7 nodeGeometry3D продублирован в списке graph-utils —
 * противоречие решено в пользу 05, потребители импортируют отсюда.
 */

import * as THREE from "three";

export function nodeGeometry3D(
  role: string | null,
  r: number,
): THREE.BufferGeometry {
  switch (role) {
    case "synthesis":
      return new THREE.OctahedronGeometry(r, 0);
    case "thesis":
      return new THREE.TetrahedronGeometry(r, 0);
    case "antithesis":
      return new THREE.TetrahedronGeometry(r, 0);
    case "generative":
      return new THREE.IcosahedronGeometry(r, 0);
    case "core":
      return new THREE.OctahedronGeometry(r, 0);
    case "bridge":
      return new THREE.BoxGeometry(r * 1.6, r * 1.6, r * 1.6);
    case "central":
      return new THREE.DodecahedronGeometry(r, 0);
    case "deconstructed":
      return new THREE.IcosahedronGeometry(r, 1);
    case "reassembled":
      return new THREE.TetrahedronGeometry(r, 0);
    case "horizon-expansion":
      return new THREE.ConeGeometry(r, r * 2, 8);
    case "pre-horizon":
      return new THREE.CylinderGeometry(r, r, r * 0.5, 12);
    case "integrating":
      return new THREE.TorusGeometry(r * 0.7, r * 0.3, 8, 12);
    case "foundation":
      return new THREE.BoxGeometry(r * 2, r * 0.5, r * 2);
    case "formalized":
      return new THREE.BoxGeometry(r * 1.4, r * 1.4, r * 1.4);
    case "verifying":
      return new THREE.DodecahedronGeometry(r, 0);
    default:
      return new THREE.SphereGeometry(r, 20, 20);
  }
}

export function mkSprite(text: string): THREE.Sprite {
  const cv = document.createElement("canvas"),
    c = cv.getContext("2d")!;
  c.font = "28px IBM Plex Mono,monospace";
  const m = c.measureText(text);
  cv.width = m.width + 20;
  cv.height = 44;
  c.font = "28px IBM Plex Mono,monospace";
  c.fillStyle = "#c8c0b0";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, cv.width / 2, cv.height / 2);
  const tx = new THREE.CanvasTexture(cv);
  tx.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false }),
  );
  sp.scale.set(cv.width / 8, cv.height / 8, 1);
  return sp;
}
