// The GLOB LABS mothership deck kit: modular voxel architecture (instanced), the big
// viewport, reactor, airlock, robotic arm, hydroponics, signage, and the space outside.
// All modules are built facing +z (toward the room) with their origin at bottom-centre.
import * as THREE from 'three';
import { M, S, VoxGrid, hash3, mix, shade, fbm } from '../core';
import { PAL, U, grid, mesh, plate, hazard, grateCell, plateTint, stampText, textWidth, glowMat, GLOW, GLOW_LAMP, occluderPlane } from './kit';
import { T } from '../tex';

const named = (o: THREE.Object3D, n: string) => { o.name = n; return o; };

// ── floor ────────────────────────────────────────────────────────────────────
export type TileKind = 'plate' | 'grate' | 'stripe' | 'lightline' | 'hazard';
/** 2×2 world-unit deck tile (32×32 model units), top surface at y = 0. */
export function floorTile(kind: TileKind): THREE.Object3D {
  const g = grid([0, -2, 0], [32, 1, 32], 1);
  const tint = (x: number, z: number) => plateTint(PAL.floor, x, z, 32, 32, 0.035);
  g.tex(kind === 'hazard' ? T.worn : T.tread).add(S.box([0, -2, 0], [32, 0, 32]), (x, _y, z) => tint(x, z), M.metal);
  if (kind === 'grate') {
    g.carve(S.box([4, -1, 4], [28, 0, 28]));
    g.tex(T.grate).add(S.box([4, -2, 4], [28, -1, 28]), 0x6a747c, M.metal);
    g.tex(0);
    for (let x = 6; x < 26; x += 6) for (let z = 6; z < 26; z += 6) g.set(x, -2, z, 0x2d6a3d, M.glow);     // faint machine glow far below
    g.tex(T.grate);
  }
  if (kind === 'stripe' || kind === 'hazard') {
    g.tex(T.worn);
    for (let x = 2; x < 30; x++) for (let z = 26; z < 30; z++) g.set(x, -1, z, hazard(x, z, 3), M.solid);
  }
  if (kind === 'hazard') { g.tex(T.worn); for (let x = 2; x < 30; x++) for (let z = 2; z < 26; z++) g.set(x, -1, z, hazard(x, z, 4), M.solid); }
  if (kind === 'lightline') { g.tex(0); for (const x of [6, 22]) { g.add(S.box([x, -1, 14], [x + 4, 0.2, 18]), PAL.hullDeep, M.metal); g.add(S.box([x + 1, -1, 15], [x + 3, 0.25, 17]), 0xffffff, M.glow); } }
  const o = mesh(g, { castShadow: false, occluder: occluderPlane(g, '-y') });
  if (kind === 'lightline') o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && m.userData.voxMat === M.glow) { m.material = glowMat(PAL.amber, 1.0); m.name = 'floorGlow'; } });
  return o;
}

// ── hull walls ───────────────────────────────────────────────────────────────
export type WallKind = 'plain' | 'vent' | 'pipes' | 'screen' | 'porthole' | 'locker' | 'sign';
/** Side-wall module: 32 wide × 102 tall × 8 deep model units, inner face at z = 0 (faces +z). */
export function wallPanel(kind: WallKind, seed = 0): THREE.Object3D {
  const H = 102;
  const g = grid([0, 0, -8], [32, H, 3], 1);
  const col = (x: number, y: number) => {
    if (y < 8) return y > 6.6 ? shade(PAL.hullDark, 1.2) : y < 1 ? PAL.hullDeep : PAL.hullDark;      // kick plate
    if (y > 92) return plate(shade(PAL.hull, 0.86), x, y - 92, { pw: 32, ph: 10, bolt: false });
    const p = plate(PAL.hull, x, y - 8, { pw: 16, ph: 28, grime: 26, y: y - 8 });
    return y > 40 && y < 44 ? (x > 1 && x < 31 ? PAL.paintTeal : p) : p;                         // teal waist stripe
  };
  g.tex(T.hull).add(S.box([0, 0, -8], [32, H, 0]), col, M.metal);
  g.tex(T.rubber).add(S.box([0, 0, -8], [32, 6, 0.2]), PAL.hullDeep, M.metal);
  g.tex(T.plateBig).add(S.box([0, 6, 0], [32, 8, 1.4]), shade(PAL.hullDark, 1.1), M.metal);                     // kick ledge
  g.tex(T.paint).add(S.box([0, 40, 0], [32, 44, 0.8]), PAL.paintTeal, M.metal);
  g.tex(T.plateBig);
  switch (kind) {
    case 'vent':
      g.carve(S.box([7, 14, -2], [25, 32, 1]));
      g.tex(T.vent);
      for (let y = 15; y < 32; y += 2) g.add(S.box([7, y, -1.5], [25, y + 1, 0.4]), PAL.hullDeep, M.metal);
      g.add(S.box([6, 13, 0], [26, 14, 1]), PAL.steel, M.metal); g.add(S.box([6, 32, 0], [26, 33, 1]), PAL.steel, M.metal);
      break;
    case 'pipes':
      g.tex(T.pipe);
      for (const [x, c, r] of [[6, PAL.paintTeal, 1.8], [11, PAL.steel, 1.3], [15, PAL.paintRed, 1.1]] as [number, number, number][]) {
        g.add(S.capsule([x, 2, 1.6], [x, 98, 1.6], r), (_x, y) => (Math.floor(y) % 20 < 2 ? PAL.chrome : c), M.metal);
        for (let y = 18; y < 98; y += 24) g.add(S.box([x - r - 0.8, y, -0.4], [x + r + 0.8, y + 1.6, 1.6 + r + 0.6]), PAL.steelDark, M.metal);
      }
      g.add(S.disc([22, 60, 2.2], [0, 0, 1], 3.2, 0.8, 8), PAL.paintRed, M.metal);             // valve wheel
      g.add(S.box([20, 26, 0], [28, 36, 1.6], 0.4), PAL.hullDark, M.metal);                     // gauge box
      g.add(S.disc([24, 31, 1.8], [0, 0, 1], 2.6, 0.3), 0xf4f0e0, M.solid);
      g.add(S.capsule([24, 31, 2.2], [25.6, 32.6, 2.2], 0.3), PAL.red, M.solid);
      break;
    case 'screen':
      g.tex(T.console).add(S.box([5, 50, 0], [27, 68, 1.6], 0.6), PAL.hullDeep, M.metal);
      g.tex(0);
      g.add(S.box([6.5, 51.5, 1.5], [25.5, 66.5, 1.9]), (x, y) => {
        // scan-line chart: rising bars
        const bar = Math.floor((x - 6.5) / 2.4);
        const hgt = 4 + ((hash3(bar, seed, 1) * 9) | 0);
        if ((x - 6.5) % 2.4 < 1.6 && y - 51.5 < hgt) return bar % 3 === 0 ? 0xd8a060 : 0x7ac890;
        return 0x0b1a14;
      }, M.glow);
      break;
    case 'porthole':
      g.carve(S.disc([16, 62, 0], [0, 0, 1], 9, 10));
      g.add(S.torus([16, 62, 0.6], [0, 0, 1], 9, 1.6), PAL.steel, M.metal);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.add(S.sphere([16 + Math.cos(a) * 9, 62 + Math.sin(a) * 9, 2], 0.7), PAL.chrome, M.metal); }
      break;
    case 'locker':
      g.tex(T.paint);
      for (const x0 of [2, 17]) {
        g.add(S.box([x0, 10, 0], [x0 + 13, 38, 1.2], 0.3), (x, y) => (y > 33 && y < 36 && (x - x0) % 2 < 1 ? PAL.hullDeep : x0 === 2 ? 0x4a6a8a : 0x6a4a8a), M.metal);
        g.add(S.box([x0 + 10, 20, 1.2], [x0 + 11, 26, 2]), PAL.chrome, M.metal);
      }
      break;
    case 'sign': {
      g.tex(T.worn).add(S.box([3, 54, 0], [29, 64, 1.2]), PAL.hazardY, M.solid);
      g.add(S.box([4, 55, 1.2], [28, 63, 1.4]), PAL.hazardK, M.solid);
      stampText(g, 'DECK', 6, 61.5, 1.4, 1, PAL.hazardY, M.solid, 0.6);
      stampText(g, '7', 21, 61.5, 1.4, 1, PAL.hazardY, M.solid, 0.6);
      break;
    }
  }
  return mesh(g, { castShadow: false, occluder: occluderPlane(g, '-z') });
}

/** Structural rib between wall panels: 6 wide, 102 tall, protrudes 5. */
export function rib(): THREE.Object3D {
  const g = grid([-3, 0, -2], [3, 104, 5], 1);
  g.tex(T.plateBig).add(S.box([-3, 0, -2], [3, 102, 4], 1), (x, y) => {
    if (y % 24 < 1.2) return shade(PAL.hullDark, 0.7);
    if (Math.abs(x) < 1 && y % 24 > 10 && y % 24 < 12) return PAL.chrome;
    return x < -1.5 ? shade(PAL.hullHi, 0.95) : PAL.hullHi;
  }, M.metal);
  g.tex(0).add(S.box([-1, 70, 4], [1, 72, 5]), 0xffffff, M.glow);   // tiny rib indicator LED
  const o = mesh(g, { castShadow: false });
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && m.userData.voxMat === M.glow) { m.material = glowMat(0x7fd8ff, 1.8); m.name = 'ribLight'; } });
  return o;
}

/** Back wall below the window: 32 wide × 36 tall. */
export function backLower(kind: 'plain' | 'vent' | 'conduit'): THREE.Object3D {
  const g = grid([0, 0, -8], [32, 36, 2], 1);
  g.tex(T.hull).add(S.box([0, 0, -8], [32, 36, 0]), (x, y) => (y < 7 ? PAL.hullDark : plate(PAL.hull, x, y - 7, { pw: 16, ph: 29, grime: 20, y: y - 7 })), M.metal);
  g.tex(T.rubber).add(S.box([0, 0, -8], [32, 6, 0.2]), PAL.hullDeep, M.metal);
  if (kind === 'vent') { g.tex(T.vent); for (let y = 12; y < 26; y += 2) g.add(S.box([8, y, 0], [24, y + 1, 1]), PAL.hullDeep, M.metal); }
  if (kind === 'conduit') { g.tex(T.pipe); g.add(S.capsule([0, 30, 1], [32, 30, 1], 1.4), PAL.paintTeal, M.metal); g.add(S.capsule([0, 26, 1], [32, 26, 1], 1), PAL.steel, M.metal); }
  g.tex(T.plateBig).add(S.box([0, 34, 0], [32, 36, 1.4]), PAL.hullHi, M.metal);
  return mesh(g, { castShadow: false, occluder: occluderPlane(g, '-z') });
}

/** Window bay: 64 wide × 52 tall frame (4 × 3.25 world units) — glass is separate. */
export function windowBay(): THREE.Object3D {
  const g = grid([0, 0, -6], [64, 52, 4], 1);
  const frame = (x: number, y: number) => {
    const e = Math.min(x, 64 - x, y, 52 - y);
    if (e < 1) return PAL.hullDeep;
    if (e < 2.5) return PAL.hullHi;
    return plate(PAL.hull, x, y, { pw: 64, ph: 52 });
  };
  g.tex(T.plateBig).add(S.box([0, 0, -6], [64, 52, 2]), frame, M.metal);
  g.carve(S.box([5, 5, -7], [59, 47, 3]));
  // chamfered inner lip
  for (let i = 0; i < 3; i++) g.add(S.box([5 - i, 5 - i, 2 - i], [59 + i, 47 + i, 3 - i]), shade(PAL.steel, 1 - i * 0.08), M.metal);
  g.carve(S.box([5, 5, -7], [59, 47, 3]));
  g.add(S.box([30.5, 5, -2], [33.5, 47, 2.6]), PAL.hullHi, M.metal);   // mullion
  for (let i = 0; i < 10; i++) { g.add(S.sphere([3, 5 + i * 4.6, 2.4], 0.7), PAL.chrome, M.metal); g.add(S.sphere([61, 5 + i * 4.6, 2.4], 0.7), PAL.chrome, M.metal); }
  for (let i = 0; i < 14; i++) { g.add(S.sphere([5 + i * 4.1, 2.6, 2.4], 0.7), PAL.chrome, M.metal); g.add(S.sphere([5 + i * 4.1, 49.4, 2.4], 0.7), PAL.chrome, M.metal); }
  return mesh(g, { castShadow: false, occluder: occluderPlane(g, '-z') });
}

/** Upper back trim with a cable tray and light bar: 32 wide × 20 tall. */
export function upperTrim(): THREE.Object3D {
  const g = grid([0, 0, -8], [32, 20, 6], 1);
  g.tex(T.hull).add(S.box([0, 0, -8], [32, 20, 0]), (x, y) => plate(shade(PAL.hull, 0.85), x, y, { pw: 16, ph: 20 }), M.metal);
  g.tex(T.plateBig).add(S.box([0, 4, 0], [32, 6, 5]), PAL.steelDark, M.metal);                       // tray
  for (let x = 1; x < 32; x += 4) g.add(S.box([x, 6, 0.5], [x + 0.8, 9, 5]), PAL.steelDark, M.metal);
  for (const [z, c] of [[1.6, PAL.cable], [2.8, PAL.paintRed], [4, PAL.cable]] as [number, number][]) g.add(S.capsule([0, 7, z], [32, 7.4, z], 0.6), c, M.solid);
  // a caged work light per module: metal hood, small warm bulb (a real light source)
  g.tex(T.paint).add(S.box([12, 12, 0], [20, 17, 2.6], 0.5), PAL.paintTealDark, M.metal);
  g.tex(0).add(S.box([13.5, 12.4, 2.2], [18.5, 14, 3]), 0xfff0d0, M.glow);
  for (let x = 13; x < 20; x += 2) g.add(S.box([x, 11.6, 2.6], [x + 0.6, 14.4, 3.2]), PAL.hullDeep, M.metal);
  const o = mesh(g, { castShadow: false, occluder: occluderPlane(g, '-z'), override: { [M.glow]: GLOW_LAMP } });
  return o;
}

/** A ceiling beam spanning `len` world units along x, with a hanging lamp in the middle. */
export function ceilingBeam(len: number): THREE.Object3D {
  const L = Math.round(len * 16);
  const g = grid([0, -4, -4], [L, 4, 4], 1);
  g.tex(T.plateBig).add(S.box([0, -3, -3], [L, 3, 3], 0.6), (x, y) => (Math.floor(x) % 32 < 1 ? PAL.hullDeep : y > 2 ? PAL.hullHi : PAL.hull), M.metal);
  for (let x = 4; x < L; x += 8) { g.add(S.box([x, -3.6, -3.6], [x + 1, 3.6, 3.6]), PAL.steelDark, M.metal); }
  return mesh(g, { castShadow: false });
}

/** Industrial hanging lamp (origin at the ceiling attach point). */
export function hangingLamp(): THREE.Object3D {
  const g = grid([-8, -26, -8], [8, 1, 8], 2);
  g.add(S.capsule([0, 0, 0], [0, -16, 0], 0.4), PAL.cable, M.solid);
  g.tex(T.paint).add(S.cone(0, 0, -22, -16, 7, 2), PAL.paintTeal, M.metal);
  g.carve(S.cone(0, 0, -22.2, -17, 6.2, 1.4));
  g.add(S.torus([0, -22, 0], [0, 1, 0], 7, 0.6), PAL.paintTealDark, M.metal);
  g.tex(0).add(S.ellipsoid([0, -19.6, 0], [2.6, 2.2, 2.6]), 0xfff1d2, M.glow);
  return mesh(g, { castShadow: false, override: { [M.glow]: GLOW_LAMP } });
}

// ── set pieces ───────────────────────────────────────────────────────────────
/** Reactor column (origin floor centre): containment rings + glowing core. Named: 'core', 'rings'. */
export function reactor(): THREE.Object3D {
  const root = new THREE.Group();
  const g = grid([-16, 0, -16], [16, 104, 16], 1);
  g.tex(T.hull).add(S.cyl(0, 0, 14, 0, 10), (x, y, z) => (y > 8 ? PAL.hullHi : plate(PAL.hullDark, Math.atan2(z, x) * 10, y, { pw: 6, ph: 10 })), M.metal);
  g.add(S.cyl(0, 0, 14, 90, 102), (x, y, z) => (y < 92 ? PAL.hullHi : plate(PAL.hullDark, Math.atan2(z, x) * 10, y, { pw: 6, ph: 12 })), M.metal);
  g.tex(T.pipe);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.add(S.box([Math.cos(a) * 10 - 1, 10, Math.sin(a) * 10 - 1], [Math.cos(a) * 10 + 1, 90, Math.sin(a) * 10 + 1]), PAL.steel, M.metal); }
  g.tex(T.glass).add(S.cyl(0, 0, 9, 10, 90), PAL.glass, M.glass);
  g.tex(0);
  stampText(g, 'CORE', -textWidth('CORE', 1.2) / 2, 100, 14.2, 1.2, PAL.hazardY, M.solid, 0.6);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; g.add(S.box([Math.cos(a) * 14 - 0.6, 6, Math.sin(a) * 14 - 0.6], [Math.cos(a) * 14 + 0.6, 7.4, Math.sin(a) * 14 + 0.6]), 0xffffff, M.glow); }
  root.add(mesh(g, { castShadow: false }));
  const c = grid([-6, 10, -6], [6, 90, 6], 1);
  c.add(S.cyl(0, 0, 4.6, 12, 88), (x, y, z) => (Math.sin(y * 0.4 + Math.atan2(z, x) * 2) > 0.4 ? 0xffffff : 0x9fffc0), M.glow);
  const core = mesh(c, { castShadow: false });
  core.name = 'core';
  core.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = glowMat(PAL.glob, 1.05); });
  root.add(core);
  const rings = new THREE.Group(); rings.name = 'rings';
  for (let i = 0; i < 3; i++) {
    const r = grid([-12, -2, -12], [12, 2, 12], 1);
    r.tex(T.pipe).add(S.torus([0, 0, 0], [0, 1, 0], 10.4, 1.4), PAL.steel, M.metal);
    r.tex(0);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; r.add(S.box([Math.cos(a) * 11.4 - 0.5, -0.5, Math.sin(a) * 11.4 - 0.5], [Math.cos(a) * 11.4 + 0.5, 0.5, Math.sin(a) * 11.4 + 0.5]), 0xffffff, M.glow); }
    const m = mesh(r, { castShadow: false, override: { [M.glow]: GLOW_LAMP } });
    m.position.y = (24 + i * 24) * U;
    rings.add(m);
  }
  root.add(rings);
  return root;
}

/** Round airlock hatch on a wall (built facing +z, origin bottom centre). Named 'wheel'. */
export function airlock(): THREE.Object3D {
  const root = new THREE.Group();
  const g = grid([-24, 0, -8], [24, 64, 6], 1);
  g.tex(T.hull).add(S.box([-24, 0, -8], [24, 64, 0]), (x, y) => plate(PAL.hullDark, x + 24, y, { pw: 16, ph: 32 }), M.metal);
  g.tex(T.worn).add(S.disc([0, 30, 1], [0, 0, 1], 22, 2.4, 0), (x, y) => { const r = Math.hypot(x, y - 30), a = Math.atan2(y - 30, x); return r > 19 ? (Math.floor(a * 10 / Math.PI) % 2 ? PAL.hazardY : PAL.hazardK) : PAL.hull; }, M.metal);
  g.tex(T.plateBig).add(S.disc([0, 30, 3], [0, 0, 1], 17, 1.2, 0), (x, y) => (Math.abs(x) < 0.8 ? PAL.hullDeep : plate(PAL.steel, x + 17, y, { pw: 34, ph: 34 })), M.metal);
  g.tex(0);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.add(S.sphere([Math.cos(a) * 20.6, 30 + Math.sin(a) * 20.6, 3.6], 0.9), PAL.chrome, M.metal); }
  g.add(S.box([16, 52, 0], [22, 58, 1.6], 0.4), PAL.hullDeep, M.metal);
  g.add(S.sphere([19, 55, 2], 1.6), 0xffffff, M.glow);
  stampText(g, 'AIRLOCK', -textWidth('AIRLOCK', 0.9) / 2, 61.5, 0.2, 0.9, PAL.hazardY, M.solid, 0.8);
  const base = mesh(g, { castShadow: false });
  base.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.voxMat === M.glow) { m.material = glowMat(PAL.red, 2.2); m.name = 'airlockLamp'; } });
  root.add(base);
  const w = grid([-9, -9, -1], [9, 9, 3], 2);
  w.add(S.torus([0, 0, 1], [0, 0, 1], 7, 0.9), PAL.paintRed, M.metal);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; w.add(S.capsule([0, 0, 1], [Math.cos(a) * 7, Math.sin(a) * 7, 1], 0.6), PAL.paintRed, M.metal); }
  w.add(S.sphere([0, 0, 1.4], 1.6), PAL.chrome, M.metal);
  const wheel = named(mesh(w), 'wheel'); wheel.position.set(0, 30 * U, 4.6 * U);
  root.add(wheel);
  return root;
}

/** Ceiling robotic arm (origin = ceiling mount). Named joints: 'base', 'upper', 'lower', 'hand'. */
export function roboticArm(): THREE.Object3D {
  const mk = (build: (g: VoxGrid) => void, min: [number, number, number], max: [number, number, number]) => { const g = grid(min, max, 2); g.tex(T.paint); build(g); return mesh(g); };
  const paint = (x: number, y: number) => (Math.floor(y / 6) % 2 === 0 && Math.abs(x) > 1.5 ? PAL.hazardY : PAL.amber);
  const base = named(new THREE.Group(), 'base');
  base.add(mk((g) => { g.add(S.cyl(0, 0, 6, -4, 0), PAL.hullDark, M.metal); g.add(S.cyl(0, 0, 4, -8, -4), PAL.steel, M.metal); }, [-7, -9, -7], [7, 1, 7]));
  const upper = named(new THREE.Group(), 'upper'); upper.position.y = -8 * U; base.add(upper);
  upper.add(mk((g) => { g.add(S.sphere([0, 0, 0], 3.4), PAL.steelDark, M.metal); g.add(S.box([-2.4, -26, -2.4], [2.4, 0, 2.4], 1), paint, M.metal); g.add(S.capsule([3, -2, 0], [3, -24, 0], 0.6), PAL.cable, M.solid); }, [-5, -28, -5], [5, 4, 5]));
  const lower = named(new THREE.Group(), 'lower'); lower.position.y = -26 * U; upper.add(lower);
  lower.add(mk((g) => { g.add(S.sphere([0, 0, 0], 3), PAL.steelDark, M.metal); g.add(S.box([-2, -20, -2], [2, 0, 2], 0.8), paint, M.metal); }, [-4, -22, -4], [4, 4, 4]));
  const hand = named(new THREE.Group(), 'hand'); hand.position.y = -20 * U; lower.add(hand);
  hand.add(mk((g) => {
    g.add(S.cyl(0, 0, 2.6, -2, 0), PAL.steel, M.metal);
    for (const sx of [-1, 1]) { g.add(S.box([sx * 2 - 0.7, -7, -1], [sx * 2 + 0.7, -2, 1]), PAL.chrome, M.metal); g.add(S.box([sx * 1.2 - 0.6, -8, -1], [sx * 1.2 + 0.6, -6.4, 1]), PAL.chrome, M.metal); }
    g.add(S.sphere([0, -1, 2.4], 0.8), 0xffffff, M.glow);
  }, [-4, -9, -3], [4, 1, 4]));
  return base;
}

/** Wall-mounted hydroponics rack, 48 wide (3 cells), faces +z. */
export function hydroponics(): THREE.Object3D {
  const g = grid([-24, 0, -2], [24, 72, 14], 1);
  g.tex(T.plateBig);
  for (const sx of [-1, 1]) g.add(S.box([sx * 23 - 1, 0, 0], [sx * 23 + 1, 70, 12]), PAL.steelDark, M.metal);
  for (const y of [4, 26, 48]) {
    g.tex(T.paint).add(S.box([-22, y, 1], [22, y + 6, 12], 0.6), (x, yy) => (yy > y + 4.6 ? 0x3b2a1e : PAL.paintTeal), M.metal);
    g.tex(T.plateBig).add(S.box([-22, y + 20, 1], [22, y + 21.4, 11]), PAL.steelDark, M.metal);
    g.tex(0).add(S.box([-20, y + 19, 3], [20, y + 20, 9]), 0xffffff, M.glow);                         // grow light tube
    g.tex(0);
    for (let i = 0; i < 9; i++) {
      const x = -19 + i * 4.8, h = 6 + ((hash3(i, y, 1) * 9) | 0);
      const c = [0x5fd84a, 0x8a5ad8, 0x3fb8a8, 0xd85a9a][(i + y) % 4];
      g.add(S.capsule([x, y + 6, 6.5], [x + (hash3(i, y, 2) - 0.5) * 3, y + 6 + h, 6.5], 0.8), c, M.jelly);
      if (i % 2) g.add(S.ellipsoid([x, y + 6 + h, 6.5], [2.2, 1.4, 2.2]), shade(c, 1.25), M.jelly);
      else g.add(S.sphere([x + 1, y + 4 + h, 7], 0.9), PAL.pink, M.glow);
    }
  }
  const o = mesh(g, { castShadow: false });
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && m.userData.voxMat === M.glow) m.material = glowMat(0xe8c8ff, 1.3); });
  return o;
}

/**
 * The GLOB LABS sign over the viewport: raised, painted metal letters (GLOB lime, LABS pink)
 * bolted to a riveted backing plate, lit from above by two small hooded lamps. No neon.
 */
export function bigSign(): THREE.Object3D {
  const s = 2.2;
  const w = textWidth('GLOB LABS', s);
  const g = grid([-w / 2 - 6, -3, -2], [w / 2 + 6, 22, 6], 1);
  g.tex(T.plateBig).add(S.box([-w / 2 - 4, -2, -2], [w / 2 + 4, 14, 0], 1), (x) => plate(PAL.hullDark, x + w / 2, 0, { pw: 16, ph: 16 }), M.metal);
  g.tex(T.paint).add(S.box([-w / 2 - 4.6, -2.6, -1.6], [w / 2 + 4.6, -1.4, 0.8]), PAL.hazardY, M.metal);
  g.tex(T.worn);
  const split = -w / 2 + textWidth('GLOB ', s);
  stampText(g, 'GLOB', -w / 2, 11.5, 0, s, 0x9be36a, M.solid, 1.6);
  stampText(g, 'LABS', split, 11.5, 0, s, 0xf07ac8, M.solid, 1.6);
  // drop-shadow edge on letters (paint, one voxel darker below-right)
  g.tex(0);
  for (const lx of [-w / 2 + 6, w / 2 - 6]) {
    g.tex(T.paint).add(S.box([lx - 0.8, 14, -1], [lx + 0.8, 19, 1]), PAL.steelDark, M.metal);           // lamp arm
    g.add(S.box([lx - 3.4, 17, -0.5], [lx + 3.4, 19.6, 4.6], 0.6), PAL.paintTealDark, M.metal);         // hood
    g.tex(0).add(S.box([lx - 2.2, 16.6, 1], [lx + 2.2, 17.4, 3.8]), 0xfff0d0, M.glow);                  // bulb
  }
  return mesh(g, { castShadow: false, override: { [M.glow]: GLOW_LAMP } });
}

// ── space ────────────────────────────────────────────────────────────────────
/** Banded gas giant with voxel rings (coarse voxels: it is far away). */
export function planet(): THREE.Object3D {
  const root = new THREE.Group();
  const R = 26;
  const g = VoxGrid.span([-R - 1, -R - 1, -R - 1], [R + 1, R + 1, R + 1], 1);
  g.add(S.sphere([0, 0, 0], R), (x, y, z) => {
    const band = Math.sin(y * 0.42 + fbm(x * 0.08, y * 0.08, z * 0.08, 2, 5) * 4);
    const base = band > 0.5 ? 0x6ad8c8 : band > -0.2 ? 0x4a8ad8 : band > -0.7 ? 0x8a5ad8 : 0x3a3a9a;
    const light = Math.max(0, (x * -0.5 + y * 0.4 + z * 0.75) / R);
    return mix(shade(base, 0.25), base, Math.min(1, light * 1.4 + 0.1));
  }, M.solid);
  const p = new THREE.Group();
  const pm = mesh(g, { castShadow: false, ao: 0 });
  pm.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }); });
  p.add(pm);
  const rg = VoxGrid.span([-48, -2, -48], [48, 2, 48], 0.5);
  rg.add(S.cyl(0, 0, 46, -0.5, 0.5), (x, _y, z) => { const r = Math.hypot(x, z); return r < 34 ? 0 : Math.sin(r * 0.9) > 0 ? 0xcfc0ff : 0x8a7ad8; }, M.solid);
  rg.carve(S.cyl(0, 0, 33, -2, 2));
  const rm = mesh(rg, { castShadow: false, ao: 0 });
  rm.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false, transparent: true, opacity: 0.85 }); });
  rm.rotation.set(0.32, 0, 0.22);
  p.add(rm);
  root.add(p);
  root.name = 'planet';
  return root;
}

/** A drifting voxel asteroid. */
export function asteroid(seed: number): THREE.Object3D {
  const r = 5 + (seed % 3) * 2;
  const g = VoxGrid.span([-r - 2, -r - 2, -r - 2], [r + 2, r + 2, r + 2], 1);
  g.add(S.sphere([0, 0, 0], r), (x, y, z) => (fbm(x * 0.3, y * 0.3, z * 0.3, 2, seed) > 0.55 ? 0x4a4038 : 0x6a5e52), M.solid);
  for (let i = 0; i < 6; i++) g.carve(S.sphere([(hash3(i, seed, 1) - 0.5) * r * 2, (hash3(i, seed, 2) - 0.5) * r * 2, (hash3(i, seed, 3) - 0.5) * r * 2], r * 0.45));
  for (let i = 0; i < 4; i++) g.paint(S.sphere([(hash3(i, seed, 4) - 0.5) * r * 1.6, (hash3(i, seed, 5) - 0.5) * r * 1.6, r * 0.8], 1.2), 0x8cf5c8, M.glow);
  return mesh(g, { castShadow: false });
}

/** Instanced voxel starfield + nebula cubes behind the viewport. */
export function starfield(count = 1600): THREE.Object3D {
  const root = new THREE.Group();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, fog: false });
  const stars = new THREE.InstancedMesh(cube, mat, count);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = (hash3(i, 1, 1) - 0.5) * 220, y = (hash3(i, 2, 2) - 0.62) * 120, z = -60 - hash3(i, 3, 3) * 80;
    const s = 0.08 + Math.pow(hash3(i, 4, 4), 6) * 0.35;
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    stars.setMatrixAt(i, m);
    const k = hash3(i, 5, 5);
    c.setRGB(k > 0.85 ? 1.6 : 1.2, k > 0.85 ? 1.2 : 1.25, k < 0.2 ? 1.8 : 1.3);
    stars.setColorAt(i, c);
  }
  stars.name = 'stars';
  root.add(stars);
  // nebula: soft additive voxel clouds
  const nmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  const N = 700;
  const neb = new THREE.InstancedMesh(cube, nmat, N);
  let n = 0;
  for (let i = 0; i < 6000 && n < N; i++) {
    const x = (hash3(i, 7, 1) - 0.5) * 140, y = (hash3(i, 7, 2) - 0.5) * 70 - 8, z = -70 - hash3(i, 7, 3) * 30;
    const d = fbm(x * 0.03, y * 0.05, z * 0.03, 3, 9);
    if (d < 0.56) continue;
    const s = 3 + hash3(i, 7, 4) * 5;
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    neb.setMatrixAt(n, m);
    c.set(x < 0 ? 0xb85aff : 0x2fd8ff).lerp(new THREE.Color(0xff5ab8), Math.max(0, (y + 10) / 40));
    neb.setColorAt(n, c);
    n++;
  }
  neb.count = n;
  neb.name = 'nebula';
  neb.renderOrder = -1;
  root.add(neb);
  return root;
}

export { GLOW };
