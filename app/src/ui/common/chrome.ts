// Injects voxel-rendered chrome pieces (bolts, corner brackets) as CSS custom properties,
// so plain CSS can bolt real 3D hardware onto every panel.
import * as THREE from 'three';
import { S } from '../../vox/core';
import { photoURL, studioRenderer } from '../../vox/studio';
import { C, M, grid, obj, prism, vgrad } from '../../vox/ui/vkit';

function bolt(): THREE.Object3D {
  const g = grid([-5, -5, -3], [5, 5, 3], 3);
  g.add(S.disc([0, 0, -0.8], [0, 0, 1], 4.4, 1, 6), vgrad(C.steelLo, C.steelHi, -4, 4), M.metal);
  g.add(S.ellipsoid([0, 0, 0.4], [3.2, 3.2, 1.8]), vgrad(C.steel, C.white, -3, 3), M.metal);
  g.carve(S.box([-2.4, -0.45, 0.6], [2.4, 0.45, 3]));
  return obj(g);
}

function bracket(): THREE.Object3D {
  const g = grid([-1, -12, -2], [12, 1, 3], 3);
  g.add(prism([[0, 0], [11, 0], [11, -3], [3, -3], [3, -11], [0, -11]], -1.2, 1.2, 0.5), vgrad(C.steelLo, C.steelHi, -11, 0), M.metal);
  g.add(prism([[1, -1], [9.5, -1], [9.5, -2], [2, -2], [2, -9.5], [1, -9.5]], 1, 1.8), (x, y) => ((Math.floor((x - y) / 1.4) % 2) ? C.amber : 0x1a1408), M.solid);
  g.add(S.sphere([1.6, -1.6, 1.4], 0.9), C.steelHi, M.metal);
  return obj(g);
}

export function installChrome() {
  if (!studioRenderer()) return;
  const dpr = Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1));
  const root = document.documentElement.style;
  root.setProperty('--vx-bolt', `url("${photoURL(bolt(), Math.round(24 * dpr), Math.round(24 * dpr), { key: 'chrome:bolt', yaw: -0.1, pitch: 0.12, fill: 0.95 })}")`);
  root.setProperty('--vx-bracket', `url("${photoURL(bracket(), Math.round(40 * dpr), Math.round(40 * dpr), { key: 'chrome:bracket', yaw: -0.18, pitch: 0.16, fill: 0.98 })}")`);
}
