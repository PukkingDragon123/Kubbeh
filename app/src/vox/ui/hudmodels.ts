// Bigger hero models for the floating HUD: the holo-computer, the gene capsule, the account
// ID card and the hover pads the four big buttons float above.
import * as THREE from 'three';
import { S, VoxGrid, hex, mix } from '../core';
import { buildAlien } from '../alien';
import { dressAlien } from '../cosmetics';
import { DEFAULT_LOOKS } from '../../core/state';
import type { AlienLook } from '../../core/types';
import { C, M, grid, obj, prism, stroke, vgrad } from './vkit';

/** TERMINAL — a chunky lab console with a curved CRT, glowing code, keyboard and antenna. */
export function holoComputer(): THREE.Group {
  const g = grid([-13, -12, -9], [13, 14, 11], 2.5);
  // desk body
  g.add(S.box([-11, -11.5, -7], [11, -4, 7], 1.4), vgrad(C.gun, C.steel, -11.5, -4), M.metal);
  for (let i = 0; i < 3; i++) g.add(S.box([-9.5 + i * 6.7, -10, 6.6], [-4.5 + i * 6.7, -6, 7.4], 0.4), C.dark, M.solid);
  for (let i = 0; i < 3; i++) g.add(S.box([-8.8 + i * 6.7, -8.4, 7.2], [-5.2 + i * 6.7, -7.6, 7.6]), i === 1 ? C.glob : C.steelLo, i === 1 ? M.glow : M.metal);
  // keyboard
  g.add(prism([[-9, -4], [9, -4], [8, -2.6], [-8, -2.6]], -1, 7.6, 0.4), C.steelLo, M.metal);
  for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) g.add(S.box([-7.6 + k * 1.75, -2.9 + r * 0.1, 5.8 - r * 2], [-6.4 + k * 1.75, -2.1 + r * 0.1, 6.9 - r * 2], 0.15), (k + r) % 7 === 3 ? C.pink : (k === 8 && r === 0) ? C.glob : C.dark, (k + r) % 7 === 3 || (k === 8 && r === 0) ? M.glow : M.solid);
  // monitor
  g.add(S.box([-10, -2.4, -6], [10, 12, 4.6], 2.2), vgrad(C.steelLo, C.steelHi, -2.4, 12), M.metal);
  g.carve(S.box([-8.2, -0.8, 2.6], [8.2, 10.4, 6], 1.2));
  g.add(S.box([-8.2, -0.8, 1.2], [8.2, 10.4, 3.2], 1.0), C.screen, M.gloss);
  const lines = [[13, C.glob], [8, C.glob], [11, C.cyan], [5, C.glob], [9.5, C.pink], [6, C.glob]] as const;
  lines.forEach(([w, c], i) => g.add(S.box([-6.8 + (i % 3 === 2 ? 1.4 : 0), 8.6 - i * 1.55, 2.9], [-6.8 + w, 9.3 - i * 1.55, 3.5]), c, M.glow));
  g.add(S.box([4.6, 1.2, 2.9], [6.8, 3, 3.5]), C.amber, M.glow);
  // side vents + bolts
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) g.add(S.box([sx * 10.1 - 0.4, 2 + i * 2.2, -3], [sx * 10.1 + 0.4, 3 + i * 2.2, 2]), C.dark, M.solid);
  for (const [x, y] of [[-9, 11], [9, 11], [-9, -1.6], [9, -1.6]]) g.add(S.sphere([x, y, 4.4], 0.6), C.steelHi, M.metal);
  // antenna with blinking ball
  g.add(S.capsule([7, 12, -2], [9.4, 13.6, -2], 0.4), C.steel, M.metal);
  g.add(S.sphere([9.6, 13.7, -2], 1.1), C.red, M.glow);
  // cable
  g.add(S.capsule([-10, 0, -5], [-12, -6, -4], 0.8), C.dark, M.solid);
  return obj(g);
}

/** IDEAS — Prof. Glorp himself (the real alien model), ready to wave. */
export function glorpFigure(look?: AlienLook) {
  const l = look ?? DEFAULT_LOOKS[0];
  const parts = buildAlien({ ...l, expression: 'happy' }, 0.016);
  try { dressAlien(parts, l); } catch { /* cosmetics worker may still be wiring */ }
  return parts;
}

/** SHOP — reuse the gacha capsule machine at a finer resolution. */
export { gacha as geneOMat } from './icons';

/** The Gene Points capsule: a glass pill with a glowing helix inside. */
export function geneCapsule(): THREE.Group {
  const g = grid([-6, -11, -6], [6, 11, 6], 2.5);
  g.add(S.capsule([0, -6, 0], [0, 6, 0], 4.6), C.glass, M.glass);
  g.carve(S.capsule([0, -6, 0], [0, 6, 0], 4.0));
  g.add(S.capsule([0, -6, 0], [0, -0.2, 0], 4.65), vgrad(C.globDeep, C.glob, -10, 0), M.jelly);
  g.add(S.cyl(0, 0, 4.9, -0.6, 0.4), C.steelHi, M.metal);
  for (let i = 0; i < 12; i++) {
    const t = i / 11, y = -7 + t * 14, a = t * Math.PI * 2;
    g.add(S.sphere([Math.cos(a) * 2, y, Math.sin(a) * 2], 0.8), C.glob, M.glow);
    g.add(S.sphere([-Math.cos(a) * 2, y, -Math.sin(a) * 2], 0.8), C.pink, M.glow);
  }
  return obj(g);
}

/** Account badge: a coloured voxel ID card with a chip, photo window and stripe. */
export function idCard(color: string): THREE.Group {
  const c = hex(color);
  const g = grid([-10, -7, -2], [10, 7, 2], 2.5);
  g.add(S.box([-9, -6, -0.8], [9, 6, 0.8], 1.2), C.white, M.solid);
  g.add(S.box([-9, 2.6, -0.9], [9, 6, 0.9], 1.0), vgrad(mix(c, 0x000000, 0.25), c, 2.6, 6), M.jelly);
  g.carve(S.box([-9, 2.6, -1], [9, 4, 1]));
  g.add(S.box([-9, 2.6, -0.9], [9, 4.4, 0.9]), c, M.jelly);
  g.add(S.box([-7.6, -4.6, 0.6], [-2.2, 1.6, 1.2], 0.4), 0x1d2a24, M.solid);
  g.add(S.sphere([-4.9, -1.4, 1.2], 2.2), 0x7be35f, M.jelly);
  g.add(S.ellipsoid([-5.8, -1.2, 2.9], [0.6, 0.9, 0.4]), 0x07090c, M.gloss);
  g.add(S.ellipsoid([-4, -1.2, 2.9], [0.6, 0.9, 0.4]), 0x07090c, M.gloss);
  g.add(S.box([0, -0.6, 0.6], [7.2, 0.2, 1.1]), 0x9aa4ae, M.solid);
  g.add(S.box([0, -2.6, 0.6], [5.2, -1.8, 1.1]), 0x9aa4ae, M.solid);
  g.add(S.box([4.4, -5, 0.6], [7.6, -3.2, 1.3], 0.2), C.gold, M.metal);
  g.add(S.box([-8.8, 4.6, 0.8], [-7, 5.6, 1.2]), C.white, M.glow);
  return obj(g);
}

/** Hover pad under the big buttons: a riveted ring with a glow channel. */
export function hoverPad(): THREE.Group {
  const g = grid([-12, -2, -12], [12, 2, 12], 2);
  g.add(S.cyl(0, 0, 10.5, -1.4, 0), vgrad(C.dark, C.gun, -1.4, 0), M.metal);
  g.add(S.torus([0, 0, 0], [0, 1, 0], 8.6, 0.6), C.steelHi, M.metal);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.add(S.sphere([Math.cos(a) * 9.8, 0, Math.sin(a) * 9.8], 0.45), C.steelLo, M.metal); }
  return obj(g, { outline: false });
}

/** A floating number plaque (brass, inked) built as a slab; numbers stay crisp DOM text on top. */
export function plaqueSlab(): THREE.Group {
  const g = grid([-8, -3, -1], [8, 3, 1], 2);
  g.add(S.box([-7.5, -2.5, -0.8], [7.5, 2.5, 0.8], 1), vgrad(C.goldDeep, C.brass, -2.5, 2.5), M.metal);
  return obj(g);
}

export { stroke, VoxGrid };
