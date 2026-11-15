// Every placeable GENE-O-MAT item as a high-resolution voxel model.
//
//   buildItemModel(id) → THREE.Object3D   origin at the floor centre of its footprint,
//                                          1 world unit = 1 floor cell (16 model units)
//   ITEM_META[id]                          footprint, hangout spots, panel, light, walkable
//
// Moving parts are separate named children (jaw, eye, wheel, ball, claw, reels, lever,
// leds, bulbs, blobs, ring, tentacleN, brain…) so the world can animate them.
import * as THREE from 'three';
import { M, S, VoxGrid, mix, shade, smoothUnion, hash3, type V3 } from '../core';
import { PAL, U, grid, mesh, plate, hazard, stampText, textWidth, glowMat, vgrad } from './kit';

export interface ItemMeta {
  w: number; d: number;
  walkable?: boolean;
  /** hangout spots: local offset (world units), facing, animation */
  hang?: { x: number; z: number; face: number; anim: 'sit' | 'sleep' | 'play' | 'wave' | 'jump' }[];
  panel?: 'slot' | 'arcade';
  /** wants a point light: colour, intensity, height */
  light?: [number, number, number];
}

export const ITEM_META: Record<string, ItemMeta> = {
  beanbag: { w: 1, d: 1, hang: [{ x: 0, z: 0.05, face: 0, anim: 'sit' }] },
  couch: { w: 2, d: 1, hang: [{ x: -0.45, z: 0.05, face: 0, anim: 'sit' }, { x: 0.45, z: 0.05, face: 0, anim: 'sleep' }] },
  workbench: { w: 2, d: 1 },
  shelf: { w: 1, d: 1 },
  rug: { w: 2, d: 2, walkable: true },
  stool: { w: 1, d: 1, hang: [{ x: 0, z: 0, face: 0, anim: 'sit' }] },
  neon_heart: { w: 1, d: 1, light: [0xff6fd6, 4, 1.6] },
  neon_ufo: { w: 1, d: 1, light: [0x52f2ff, 4, 1.8] },
  poster: { w: 1, d: 1 },
  graffiti: { w: 1, d: 1 },
  lava_lamp: { w: 1, d: 1, light: [0x8cf56b, 2, 0.9] },
  disco: { w: 1, d: 1, light: [0xffffff, 3, 2.2] },
  traffic_cone: { w: 1, d: 1 },
  trash_can: { w: 1, d: 1 },
  gnome: { w: 1, d: 1 },
  chomper: { w: 1, d: 1 },
  eyeplant: { w: 1, d: 1 },
  cactus: { w: 1, d: 1 },
  tentacle_fern: { w: 1, d: 1 },
  shroom: { w: 1, d: 1, light: [0x52f2ff, 1.6, 0.6] },
  tesla: { w: 1, d: 1, light: [0xb48cff, 2, 2.2] },
  microscope: { w: 1, d: 1 },
  jars: { w: 1, d: 1 },
  brain_tank: { w: 1, d: 1 },
  teleporter: { w: 1, d: 1, hang: [{ x: 0, z: 0, face: 0, anim: 'wave' }], light: [0x52f2ff, 2.5, 0.6] },
  server_rack: { w: 1, d: 1 },
  generator: { w: 1, d: 1 },
  slot_machine: { w: 1, d: 1, panel: 'slot', hang: [{ x: 0, z: 0.95, face: Math.PI, anim: 'play' }] },
  arcade_cab: { w: 1, d: 1, panel: 'arcade', hang: [{ x: 0, z: 0.95, face: Math.PI, anim: 'play' }] },
  pinball: { w: 1, d: 2, hang: [{ x: 0, z: 1.25, face: Math.PI, anim: 'play' }] },
  jukebox: { w: 1, d: 1, hang: [{ x: 0, z: 0.95, face: Math.PI, anim: 'jump' }], light: [0xff6fd6, 2.5, 1.4] },
  claw: { w: 1, d: 1, hang: [{ x: 0, z: 0.95, face: Math.PI, anim: 'play' }] },
  string_lights: { w: 2, d: 1, light: [0xffd38a, 2.5, 2.2] },
  lamp_floor: { w: 1, d: 1, light: [0xffc77a, 4, 1.7] },
  neon_tube: { w: 1, d: 1, light: [0xb48cff, 3.5, 1.3] },
};

// ── helpers ──────────────────────────────────────────────────────────────────
const named = (o: THREE.Object3D, name: string) => { o.name = name; return o; };
const put = (o: THREE.Object3D, x: number, y: number, z: number) => { o.position.set(x * U, y * U, z * U); return o; };
/** a piece with its own pivot: build in local model units, place pivot at (x,y,z) */
function part(name: string, g: VoxGrid, x: number, y: number, z: number) { return put(named(mesh(g), name), x, y, z); }

/** metal pot with a soil top, used by every plant */
function pot(g: VoxGrid, r = 5.5, h = 7, col = PAL.paintTeal) {
  g.add(S.cyl(0, 0, r, 0, h - 1), (x, y, z) => {
    const a = Math.atan2(z, x);
    if (y < 1) return shade(col, 0.7);
    if (y > h - 2.4) return shade(col, 1.18);                       // rolled rim
    return Math.floor(a * 6 / Math.PI) % 2 ? col : shade(col, 0.9);  // fluted sides
  }, M.metal);
  g.add(S.cyl(0, 0, r + 0.6, h - 2, h), shade(col, 1.12), M.metal);
  g.add(S.cyl(0, 0, r - 0.6, h - 1.5, h - 0.4), 0x3b2a1e, M.solid);
}

// ── furniture ────────────────────────────────────────────────────────────────
function beanbag() {
  const g = grid([-8, 0, -8], [8, 12, 8], 2);
  const col = (x: number, y: number, z: number) => {
    const seam = Math.abs(Math.atan2(z, x) * 4 / Math.PI % 1) < 0.06;
    return seam ? shade(PAL.glob, 0.62) : vgrad(0x3fae4a, 0xa6ff8a, y, 0, 10);
  };
  g.add(smoothUnion(S.ellipsoid([0, 4, 0], [7, 4.2, 7]), S.ellipsoid([0, 7, -3.2], [5.2, 3.6, 3]), 2.5), col, M.jelly);
  g.carve(S.ellipsoid([0, 8.6, 1.4], [4.2, 2.8, 4]));
  g.add(S.ellipsoid([0, 5.6, 1.4], [3.6, 0.6, 3.4]), 0x5fd84a, M.jelly);
  g.paint(S.box([3, 3, 5.8], [5, 5, 7.2]), PAL.pink, M.solid); // patch
  return mesh(g);
}

function couch() {
  const g = grid([-16, 0, -8], [16, 18, 8], 2);
  const fabric = (x: number, y: number, z: number) => {
    const quilt = (Math.floor(x / 3) + Math.floor(y / 3)) % 2 === 0;
    return quilt ? 0x7a2f5a : 0x8a3866;
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(S.box([sx * 13 - 1, 0, sz * 5 - 1], [sx * 13 + 1, 3, sz * 5 + 1]), PAL.chrome, M.metal);
  g.add(S.box([-15, 3, -7], [15, 7, 7], 1.5), fabric, M.fur);                    // base
  g.add(S.box([-15, 7, -7], [15, 17, -3], 2), fabric, M.fur);                     // back
  g.add(S.box([-15.5, 3, -7], [-11.5, 12, 7], 1.8), fabric, M.fur);               // arms
  g.add(S.box([11.5, 3, -7], [15.5, 12, 7], 1.8), fabric, M.fur);
  for (const cx of [-5.6, 5.6]) g.add(S.box([cx - 5.4, 7, -3.4], [cx + 5.4, 10, 6.6], 1.4), (x, y) => (y > 9.3 ? 0xa04878 : 0x92406c), M.fur);
  g.paint(S.box([7, 7.5, 6], [10, 9.5, 7]), 0x3fb84a, M.jelly);                    // slime stain
  for (let i = 0; i < 4; i++) g.set(Math.floor((-9 + i) * 2), Math.floor(14 * 2), Math.floor(-2.8 * 2), 0xf0e6c8, M.solid); // stitches
  return mesh(g);
}

function workbench() {
  const g = grid([-16, 0, -8], [16, 28, 8], 2);
  g.add(S.box([-15, 11, -7], [15, 13, 7]), (x, y, z) => plate(PAL.wood, x + 16, z + 8, { pw: 6, ph: 30, bolt: false }), M.solid);
  for (const sx of [-1, 1]) g.add(S.box([sx * 13 - 1.2, 0, -6], [sx * 13 + 1.2, 11, 6]), PAL.steelDark, M.metal);
  g.add(S.box([-13, 3, -6], [13, 4, 6]), PAL.steelDark, M.metal);
  g.add(S.box([-15, 13, -8], [15, 27, -6.6]), (x, y) => ((Math.floor(x) + Math.floor(y)) % 2 === 0 && (x * 2) % 2 < 1 ? shade(PAL.paintCream, 0.85) : PAL.paintCream), M.solid);
  for (let i = 0; i < 5; i++) g.add(S.capsule([-11 + i * 5, 17, -6.4], [-11 + i * 5, 23, -6.4], 0.7), [PAL.paintRed, PAL.steel, PAL.amber, PAL.cyan, PAL.steel][i], M.metal);
  g.add(S.box([8, 13, -2], [13, 17, 2]), PAL.paintTeal, M.metal);                 // vise
  g.add(S.capsule([10.5, 15, 2], [10.5, 15, 5], 0.6), PAL.chrome, M.metal);
  g.add(S.box([-6, 13, 1], [-1, 14, 5]), 0x2a2f34, M.solid);                       // tablet
  g.add(S.box([-5.5, 14, 1.5], [-1.5, 14.4, 4.5]), 0x52f2ff, M.glow);
  return mesh(g);
}

function shelf() {
  const g = grid([-8, 0, -8], [8, 34, 8], 2);
  for (const sx of [-1, 1]) g.add(S.box([sx * 7 - 0.8, 0, -6], [sx * 7 + 0.8, 33, -1]), PAL.steelDark, M.metal);
  for (const y of [1, 11, 21, 31]) g.add(S.box([-7, y, -6], [7, y + 1.2, -1]), PAL.steel, M.metal);
  const jar = (x: number, y: number, liquid: number, thing: number) => {
    g.add(S.cyl(x, -3.5, 2, y, y + 6), PAL.glass, M.glass);
    g.add(S.cyl(x, -3.5, 1.6, y, y + 4), liquid, M.glow);
    g.add(S.sphere([x, y + 2.4, -3.5], 1), thing, M.jelly);
    g.add(S.cyl(x, -3.5, 2.2, y + 6, y + 7), PAL.chrome, M.metal);
  };
  jar(-4, 2.2, 0x3fa84a, PAL.pink); jar(0.5, 2.2, 0x2f7fa8, 0xffe14d); jar(4.5, 2.2, 0x8a3fa8, PAL.glob);
  jar(-3, 12.2, 0xa8743f, 0xffffff);
  g.add(S.box([1, 12.2, -5], [6, 16, -2]), 0x8a5a33, M.solid);                      // crate
  g.add(S.capsule([-5, 23, -3], [-2, 23.4, -3], 1.2), 0xf0e6c8, M.fur);             // the sock
  g.add(S.ellipsoid([3, 23.5, -3.5], [2.6, 1.6, 2]), PAL.steel, M.metal);           // bolts pile
  return mesh(g);
}

function rug() {
  const g = grid([-16, 0, -16], [16, 1.2, 16], 2);
  g.add(S.cyl(0, 0, 15.5, 0, 0.8), (x, _y, z) => {
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    if (r > 14.6) return 0x5c3a24;
    if (Math.abs(r - 11) < 0.7 || Math.abs(r - 6) < 0.7) return 0xd8c38a;
    if (r < 2.6) return 0x8cf56b;
    if (r > 6 && r < 11 && Math.abs(Math.sin(a * 3)) > 0.93) return 0xd8c38a;
    return r < 6 ? 0x6e8f3a : 0x8aa24a;
  }, M.fur);
  return mesh(g);
}

function stool() {
  const g = grid([-6, 0, -6], [6, 14, 6], 3);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; g.add(S.capsule([Math.cos(a) * 4.6, 0, Math.sin(a) * 4.6], [Math.cos(a) * 2, 11, Math.sin(a) * 2], 0.7), PAL.steel, M.metal); }
  g.add(S.torus([0, 5, 0], [0, 1, 0], 3.4, 0.4), PAL.steelDark, M.metal);
  g.add(S.cyl(0, 0, 4.6, 11, 13), (x, _y, z) => (Math.hypot(x, z) > 4 ? PAL.steelDark : (Math.hypot(x, z) < 0.9 ? PAL.chrome : PAL.paintRed)), M.metal);
  return mesh(g);
}

// ── decor ────────────────────────────────────────────────────────────────────
function signStand(g: VoxGrid, h = 26) {
  g.add(S.box([-6, 0, -4], [6, 1.6, 4], 0.4), PAL.hullDark, M.metal);
  g.add(S.box([-0.8, 1.6, -0.8], [0.8, h, 0.8]), PAL.steelDark, M.metal);
}
function neonHeart() {
  const root = new THREE.Group();
  const g = grid([-9, 0, -5], [9, 34, 5], 3);
  signStand(g, 18);
  g.add(S.box([-8.5, 17, -1.4], [8.5, 33, -0.4], 0.6), 0x1a1220, M.solid);       // backboard
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3) / 2.3, y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 2.3;
    g.add(S.sphere([x, 27 + y, 0.4], 0.75), 0xffffff, M.glow);
  }
  root.add(swapGlow(mesh(g), glowMat(PAL.pink, 2.2), 'neon'));
  const t = grid([-9, 16, -1], [9, 22, 2], 3);
  stampText(t, 'GLOB', -textWidth('GLOB', 0.66) / 2, 21.0, 0.2, 0.66, 0xffffff, M.glow, 0.7);
  root.add(swapGlow(mesh(t), glowMat(PAL.glob, 2), 'neon2'));
  return root;
}
function swapGlow(o: THREE.Object3D, mat: THREE.Material, name: string) {
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && m.userData.voxMat === M.glow) { m.material = mat; m.name = name; } });
  return o;
}
function neonUfo() {
  const root = new THREE.Group();
  const g = grid([-10, 0, -5], [10, 36, 5], 3);
  signStand(g, 18);
  g.add(S.box([-9.5, 17, -1.4], [9.5, 35, -0.4], 0.6), 0x101a22, M.solid);
  root.add(mesh(g));
  const n = grid([-10, 16, -1], [10, 36, 2], 3);
  const ring = (cx: number, cy: number, rx: number, ry: number, from = 0, to = Math.PI * 2) => { for (let i = 0; i <= 50; i++) { const a = from + (to - from) * (i / 50); n.add(S.sphere([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 0.4], 0.65), 0xffffff, M.glow); } };
  ring(0, 27, 8, 2.4); ring(0, 28.4, 3.6, 3.6, 0, Math.PI);
  for (const bx of [-5, 0, 5]) n.add(S.sphere([bx, 27, 0.6], 0.9), 0xffffff, M.glow);
  for (let i = 0; i < 6; i++) n.add(S.capsule([-3 + i * 0.4 - i * 1.2 + 3, 23.6 - i * 1.1, 0.4], [3 - i * 0.4 + i * 1.2 - 3, 23.6 - i * 1.1, 0.4], 0.45), 0xffffff, M.glow);
  root.add(swapGlow(mesh(n), glowMat(PAL.cyan, 2.2), 'neon'));
  return root;
}
function poster() {
  const g = grid([-8, 0, -4], [8, 34, 4], 4);
  for (const sx of [-1, 1]) g.add(S.capsule([sx * 6, 0, 0], [sx * 6, 31, -1.6], 0.6), PAL.wood, M.solid);
  g.add(S.box([-7, 10, -2.2], [7, 31, -1.2]), PAL.woodDark, M.solid);
  g.add(S.box([-6.2, 10.8, -1.4], [6.2, 30.2, -0.8]), (x, y) => mix(0xefe2b8, 0xd8c690, (Math.sin(x * 0.7) + Math.sin(y * 0.5)) * 0.1 + 0.2), M.solid);
  stampText(g, 'WANTED', -textWidth('WANTED', 0.33) / 2, 29.0, -0.9, 0.33, 0x7a2a1a, M.solid, 0.4);
  g.add(S.ellipsoid([0, 21, -0.6], [3.6, 3.2, 0.5]), 0x6fd062, M.jelly);           // mugshot head
  for (const sx of [-1, 1]) g.add(S.ellipsoid([sx * 1.5, 21, -0.1], [1, 1.6, 0.3]), 0x0b0b0b, M.gloss);
  stampText(g, 'AREA 51', -textWidth('AREA 51', 0.28) / 2, 15.6, -0.9, 0.28, 0x3a2a1a, M.solid, 0.4);
  g.add(S.sphere([0, 12.4, -0.5], 1), 0xd8a24a, M.solid);                           // the burger reward
  g.add(S.box([-1.1, 12, -0.6], [1.1, 12.4, 0.4]), 0x5a3a1a, M.solid);
  return mesh(g);
}
function graffiti() {
  const g = grid([-8, 0, -3], [8, 32, 3], 2);
  g.add(S.box([-7.6, 0, -2], [7.6, 31, 0]), (x, y) => plate(PAL.hullDark, x + 8, y, { pw: 16, ph: 15.5 }), M.metal);
  for (const sx of [-1, 1]) g.add(S.box([sx * 7 - 1, 0, -3], [sx * 7 + 1, 2, 3]), PAL.hullDeep, M.metal);
  // spray tag: an alien head + ZIB♥
  const spray = (x: number, y: number, r: number, c: number) => g.add(S.sphere([x, y, 0.2], r), c, M.solid);
  for (let a = 0; a < Math.PI * 2; a += 0.12) spray(Math.cos(a) * 4.6, 20 + Math.sin(a) * 4.2, 0.55, PAL.glob);
  spray(-1.7, 20, 1.3, 0x111111); spray(1.7, 20, 1.3, 0x111111);
  for (let i = 0; i < 8; i++) spray(-2.6 - i * 0.1, 24.6 + i * 0.6, 0.45, PAL.glob), spray(2.6 + i * 0.1, 24.6 + i * 0.6, 0.45, PAL.glob);
  stampText(g, 'ZIB♥', -textWidth('ZIB♥', 0.6) / 2, 12, 0, 0.6, PAL.pink, M.solid, 0.5);
  for (let i = 0; i < 6; i++) g.add(S.capsule([-5 + i * 2, 7.8, 0.2], [-5 + i * 2 + 0.1, 5 - (i % 3), 0.2], 0.25), PAL.pink, M.solid); // drips
  return mesh(g);
}
function lavaLamp() {
  const root = new THREE.Group();
  const g = grid([-5, 0, -5], [5, 26, 5], 3);
  g.add(S.cone(0, 0, 0, 7, 4.2, 2.6), PAL.chrome, M.metal);
  g.add(S.cone(0, 0, 7, 20, 2.6, 3.2), PAL.glass, M.glass);
  g.add(S.cone(0, 0, 20, 24, 3.2, 1.6), PAL.chrome, M.metal);
  root.add(mesh(g));
  const blobs = new THREE.Group(); blobs.name = 'blobs';
  for (let i = 0; i < 3; i++) {
    const b = grid([-2, -2, -2], [2, 2, 2], 4);
    b.add(S.ellipsoid([0, 0, 0], [1.6 - i * 0.2, 1.9 - i * 0.2, 1.6 - i * 0.2]), 0xffffff, M.glow);
    const m = swapGlow(mesh(b), glowMat(PAL.glob, 1.7), 'blob');
    m.position.set(0, (9 + i * 4) * U, 0);
    blobs.add(m);
  }
  root.add(blobs);
  return root;
}
function disco() {
  const root = new THREE.Group();
  const g = grid([-6, 0, -6], [6, 42, 6], 2);
  g.add(S.cyl(0, 0, 5, 0, 1.5), PAL.hullDark, M.metal);
  g.add(S.capsule([0, 1.5, 0], [0, 40, 0], 0.7), PAL.steelDark, M.metal);
  g.add(S.capsule([0, 40, 0], [5, 40, 0], 0.6), PAL.steelDark, M.metal);
  root.add(mesh(g));
  const b = grid([-5, -5, -5], [5, 5, 5], 3);
  b.add(S.sphere([0, 0, 0], 4.6), (x, y, z) => {
    const tile = (Math.floor(x * 1.5) + Math.floor(y * 1.5) + Math.floor(z * 1.5)) % 3;
    return [0xe8f0f6, 0xb8c4cc, 0xffffff][tile];
  }, M.metal);
  const ball = named(mesh(b), 'ball'); ball.position.set(5 * U, 33 * U, 0);
  root.add(ball);
  return root;
}
function trafficCone() {
  const g = grid([-6, 0, -6], [6, 16, 6], 3);
  g.add(S.box([-5.5, 0, -5.5], [5.5, 1, 5.5], 0.6), 0xd8601f, M.solid);
  g.add(S.cone(0, 0, 1, 15, 4.2, 0.9), (_x, y) => ((y > 5 && y < 7) || (y > 10 && y < 11.5) ? 0xf4f4f0 : 0xf07a28), M.solid);
  return mesh(g);
}
function trashCan() {
  const g = grid([-7, 0, -7], [7, 20, 7], 2);
  g.add(S.cyl(0, 0, 5.4, 0, 13), (x, y, z) => (Math.floor(Math.atan2(z, x) * 8 / Math.PI) % 2 ? PAL.steelDark : PAL.steel), M.metal);
  g.add(S.torus([0, 13, 0], [0, 1, 0], 5.4, 0.7), PAL.steel, M.metal);
  g.add(S.cyl(0, 0, 4.8, 12, 14), 0x222222, M.solid);
  for (let i = 0; i < 7; i++) g.add(S.ellipsoid([Math.cos(i * 2.3) * 3, 14 + (i % 3) * 1.4, Math.sin(i * 2.3) * 3], [1.8, 1.4, 1.6]), [0xf0ece0, 0xe6dcc0, 0xc8d0d8][i % 3], M.solid);
  g.add(S.capsule([-2, 16.4, 1], [2.5, 17, 0.4], 0.35), 0xf4f0e8, M.solid);           // fish bone spine
  for (let i = 0; i < 4; i++) g.add(S.capsule([-1 + i * 0.9, 17.2, 0.6], [-0.7 + i * 0.9, 18.4, 0.6], 0.2), 0xf4f0e8, M.solid);
  g.add(S.capsule([4.8, 12, 3], [5.2, 6, 3.4], 0.5), 0x8cf56b, M.jelly);              // slime drip
  g.add(S.cyl(-7, 0, 3.2, 0, 0.4), 0x5fd84a, M.jelly);                                 // puddle
  return mesh(g);
}
function gnome() {
  const g = grid([-6, 0, -6], [6, 24, 6], 3);
  g.add(S.cyl(0, 0, 4.4, 0, 1.2), 0x5a8a3a, M.solid);
  g.add(S.ellipsoid([0, 6, 0], [3.6, 5, 3.2]), 0x3a6abf, M.solid);                    // coat
  g.add(S.box([-3.6, 5.4, -3.2], [3.6, 6.4, 3.2]), 0x3a2a1a, M.solid);                 // belt
  g.add(S.sphere([0, 12, 0.4], 2.8), 0xf0c8a0, M.solid);                                // face
  g.add(S.ellipsoid([0, 10.4, 2], [2.8, 3.4, 1.6]), 0xf6f6f0, M.fur);                  // beard
  g.add(S.sphere([0, 12.2, 3.2], 0.9), 0xe08a7a, M.solid);                              // nose
  g.add(S.cone(0, 0, 13.5, 21, 3.2, 0.4), 0xd03a2a, M.solid);                          // hat
  g.add(S.capsule([0, 20.5, 0], [1.6, 23, 0], 0.25), PAL.steel, M.metal);              // the probe
  g.add(S.sphere([1.6, 23, 0], 0.7), 0xffffff, M.glow);
  for (const sx of [-1, 1]) g.add(S.sphere([sx * 1, 12.8, 2.6], 0.4), 0x111111, M.gloss);
  return mesh(g);
}

// ── plants ───────────────────────────────────────────────────────────────────
function chomper() {
  const root = new THREE.Group();
  const g = grid([-7, 0, -7], [7, 20, 7], 2);
  pot(g, 5, 7, 0x8a4a3a);
  g.add(S.capsule([0, 6, 0], [1, 13, 0.5], 1), 0x3f8a3a, M.jelly);
  for (const sx of [-1, 1]) g.add(S.ellipsoid([sx * 3.4, 9, 0], [3, 0.8, 1.6]), 0x4fa84a, M.jelly);
  root.add(mesh(g));
  const head = new THREE.Group(); head.name = 'head'; put(head, 1, 14, 0.5);
  const top = grid([-5, -1, -5], [5, 5, 5], 3);
  top.add(S.ellipsoid([0, 0.6, 0], [4.6, 3.2, 4.2]), (x, y, z) => (y < 0.4 ? 0xb83a5a : hash3(Math.floor(x), Math.floor(y), Math.floor(z), 4) > 0.8 ? 0xffd84a : 0x3faa3a), M.jelly);
  top.carve(S.box([-5, -2, -5], [5, 0, 5]));
  for (let i = 0; i < 7; i++) top.add(S.cone(-3.6 + i * 1.2, 2.6, -0.4, 1.0, 0.5, 0.05), 0xf6f4ea, M.solid);
  const jaw = grid([-5, -4, -5], [5, 1, 5], 3);
  jaw.add(S.ellipsoid([0, -0.6, 0], [4.4, 2.8, 4]), (_x, y) => (y > -0.4 ? 0xb83a5a : 0x3a9a3a), M.jelly);
  jaw.carve(S.box([-5, 0, -5], [5, 2, 5]));
  for (let i = 0; i < 7; i++) jaw.add(S.cone(-3.6 + i * 1.2, 2.6, -0.2, 1.0, 0.5, 0.05), 0xf6f4ea, M.solid);
  const upper = named(mesh(top), 'upper'); const lower = named(mesh(jaw), 'jaw');
  head.add(upper, lower);
  root.add(head);
  return root;
}
function eyeplant() {
  const root = new THREE.Group();
  const g = grid([-7, 0, -7], [7, 22, 7], 2);
  pot(g, 5, 7, 0x6a3a8a);
  g.add(S.capsule([0, 6, 0], [-1, 11, 0], 0.9), 0x5f8a3a, M.jelly);
  g.add(S.capsule([-1, 11, 0], [0.5, 16, 0], 0.8), 0x5f8a3a, M.jelly);
  for (const [x, y] of [[-3, 9], [2.4, 12]]) g.add(S.ellipsoid([x, y, 0], [2.4, 0.6, 1.4]), 0x6fa84a, M.jelly);
  root.add(mesh(g));
  const e = grid([-4, -4, -4], [4, 4, 4], 4);
  e.add(S.sphere([0, 0, 0], 3.4), (x, y, z) => {
    if (z > 2.2 && Math.hypot(x, y) < 1.0) return 0x05070a;
    if (z > 1.6 && Math.hypot(x, y) < 1.9) return 0x8c3ad8;
    if (z > 1.3 && Math.hypot(x, y) < 2.2) return 0x4a1a7a;
    return Math.abs(Math.sin(x * 2.2 + z)) > 0.97 ? 0xe05a5a : 0xf6f2ec;   // red veins
  }, M.gloss);
  e.add(S.sphere([0.9, 0.9, 3.2], 0.45), 0xffffff, M.glow);
  root.add(part('eye', e, 0.5, 18.6, 0));
  const lid = grid([-4, -1, -4], [4, 4.5, 4], 4);
  lid.add(S.sphere([0, 0, 0], 3.7), 0x5f8a3a, M.jelly); lid.carve(S.box([-5, -5, -5], [5, 0.2, 5]));
  root.add(part('lid', lid, 0.5, 18.6, 0));
  return root;
}
function cactus() {
  const g = grid([-7, 0, -7], [7, 26, 7], 3);
  pot(g, 4.6, 6, 0xc8a46a);
  const green = (x: number, _y: number, z: number) => (Math.floor(Math.atan2(z, x) * 5 / Math.PI) % 2 ? 0x3f8f4a : 0x4fa85a);
  g.add(S.capsule([0, 5, 0], [0, 21, 0], 2.6), green, M.jelly);
  g.add(S.capsule([0, 11, 0], [4.4, 12, 0], 1.3), green, M.jelly); g.add(S.capsule([4.4, 12, 0], [4.4, 17, 0], 1.3), green, M.jelly);
  g.add(S.capsule([0, 14, 0], [-3.8, 15, 0], 1.2), green, M.jelly); g.add(S.capsule([-3.8, 15, 0], [-3.8, 19, 0], 1.2), green, M.jelly);
  for (let i = 0; i < 26; i++) { const a = i * 2.4, y = 7 + (i * 0.55) % 14; g.add(S.capsule([Math.cos(a) * 2.5, y, Math.sin(a) * 2.5], [Math.cos(a) * 3.6, y + 0.3, Math.sin(a) * 3.6], 0.18), 0xd8f8ff, M.glow); }
  g.add(S.sphere([0, 23.4, 0], 1.6), PAL.pink, M.jelly);                       // flower
  return mesh(g);
}
function tentacleFern() {
  const root = new THREE.Group();
  const g = grid([-7, 0, -7], [7, 8, 7], 2);
  pot(g, 5.4, 7, 0x2a6a8a);
  root.add(mesh(g));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const t = grid([-4, 0, -4], [4, 20, 4], 3);
    const pts: V3[] = [[0, 0, 0], [Math.cos(a) * 1.4, 6, Math.sin(a) * 1.4], [Math.cos(a) * 3, 11, Math.sin(a) * 3], [Math.cos(a) * 3.4, 15, Math.sin(a) * 3.4]];
    for (let k = 0; k < 3; k++) t.add(S.capsule(pts[k], pts[k + 1], 1.3 - k * 0.32, 1.1 - k * 0.32), (x, y, z) => (y > 3 && hash3(Math.floor(x * 2), Math.floor(y * 2), Math.floor(z * 2), 2) > 0.86 ? 0xffb8e4 : vgrad(0x7a3a9a, 0xd884ff, y, 0, 15)), M.jelly);
    t.add(S.sphere(pts[3], 1.1), 0xffd0f0, M.glow);
    const m = part('tentacle' + i, t, 0, 7, 0); root.add(m);
  }
  return root;
}
function shroom() {
  const g = grid([-8, 0, -8], [8, 18, 8], 3);
  g.add(S.cyl(0, 0, 6.4, 0, 1.6), 0x3a2a24, M.solid);
  const caps: [number, number, number, number, number][] = [[0, 0, 13, 4.2, PAL.cyan], [-4, 2, 8, 2.8, PAL.pink], [3.6, -2.4, 9, 3, PAL.violet], [2, 4, 5.4, 2, PAL.cyan]];
  for (const [x, z, h, r, c] of caps) {
    g.add(S.capsule([x, 1, z], [x, h, z], r * 0.28), 0xe8f0ec, M.solid);
    g.add(S.ellipsoid([x, h, z], [r, r * 0.55, r]), (px, py, pz) => (Math.hypot(px - x + r * 0.3, pz - z) < r * 0.22 && py > h ? 0xffffff : c), M.glow);
    g.carve(S.ellipsoid([x, h - r * 0.45, z], [r * 0.95, r * 0.35, r * 0.95]));
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.add(S.capsule([x, h - 0.4, z], [x + Math.cos(a) * r * 0.9, h - 0.5, z + Math.sin(a) * r * 0.9], 0.18), shade(c, 0.55), M.solid); }
  }
  return mesh(g);
}

// ── equipment ────────────────────────────────────────────────────────────────
function tesla() {
  const root = new THREE.Group();
  const g = grid([-7, 0, -7], [7, 38, 7], 2);
  g.add(S.box([-6.5, 0, -6.5], [6.5, 4, 6.5], 0.8), (x, y, z) => (y < 1.2 ? hazard(x + z, y * 3, 2.5) : PAL.hullDark), M.metal);
  g.add(S.cyl(0, 0, 2.6, 4, 28), (_x, y) => (Math.floor(y * 2) % 2 ? 0xc87a3a : 0xa85a2a), M.metal);   // copper coil windings
  for (const y of [8, 16, 24]) g.add(S.torus([0, y, 0], [0, 1, 0], 3.4, 0.5), 0xd8d8e0, M.solid);
  root.add(mesh(g));
  const top = grid([-7, -3, -7], [7, 3, 7], 3);
  top.add(S.torus([0, 0, 0], [0, 1, 0], 4.6, 1.8), PAL.chrome, M.metal);
  top.add(S.sphere([0, 0, 0], 1.6), 0xffffff, M.glow);
  root.add(swapGlow(part('top', top, 0, 31, 0), glowMat(PAL.violet, 2.4), 'core'));
  return root;
}
function microscope() {
  const g = grid([-7, 0, -7], [7, 24, 7], 3);
  g.add(S.box([-6, 0, -5], [6, 2, 6], 0.8), PAL.paintCream, M.solid);
  g.add(S.capsule([0, 2, -3.5], [0, 15, -3.5], 1.6), PAL.paintCream, M.solid);          // arm
  g.add(S.box([-4, 7, -2], [4, 8, 4], 0.4), PAL.hullDark, M.metal);                       // stage
  g.add(S.box([-2.4, 8, -0.6], [2.4, 8.4, 1.8]), 0xd8f0f4, M.glass);                      // slide
  g.add(S.ellipsoid([0, 8.6, 0.6], [1.2, 0.4, 0.8]), 0x8cf56b, M.glow);                   // goo
  g.add(S.capsule([0, 15, -3.5], [0, 12, 1.2], 1.8), PAL.paintCream, M.solid);            // head
  g.add(S.capsule([0, 12, 1.2], [0, 9.8, 1.2], 0.9), PAL.chrome, M.metal);                // objective
  g.add(S.capsule([0, 15, -3.5], [0, 21, -1.6], 1.1), PAL.steelDark, M.metal);            // eyepiece
  g.add(S.cyl(0, -1.6, 1.3, 21, 22.4), PAL.hullDeep, M.metal);
  for (const sx of [-1, 1]) g.add(S.disc([sx * 2.4, 10, -3.5], [1, 0, 0], 1.6, 0.4, 10), PAL.steel, M.metal);
  return mesh(g);
}
function jars() {
  const g = grid([-8, 0, -6], [8, 26, 6], 3);
  g.add(S.box([-7.5, 0, -5], [7.5, 2, 5], 0.6), PAL.woodDark, M.solid);
  g.add(S.box([-7.5, 12, -5], [7.5, 13.4, 5], 0.4), PAL.woodDark, M.solid);
  for (const sx of [-1, 1]) g.add(S.box([sx * 7 - 0.6, 0, -1], [sx * 7 + 0.6, 13, 1]), PAL.woodDark, M.solid);
  const jar = (x: number, y: number, r: number, h: number, liquid: number, thing: (cx: number, cy: number) => void) => {
    g.add(S.cyl(x, 0, r, y, y + h), PAL.glass, M.glass);
    g.add(S.cyl(x, 0, r - 0.5, y, y + h * 0.8), liquid, M.glass);
    thing(x, y + h * 0.4);
    g.add(S.cyl(x, 0, r + 0.3, y + h, y + h + 1), 0xb87a3a, M.metal);
  };
  jar(-4.6, 2, 2.4, 8, 0x8cf56b, (cx, cy) => { g.add(S.ellipsoid([cx, cy, 0], [1.2, 1.6, 1.2]), 0x6fd062, M.jelly); g.add(S.sphere([cx - 0.4, cy + 0.4, 1], 0.4), 0, M.gloss); g.add(S.sphere([cx + 0.4, cy + 0.4, 1], 0.4), 0, M.gloss); });
  jar(0, 2, 2.6, 9, 0x52b8ff, (cx, cy) => { for (let i = 0; i < 4; i++) g.add(S.capsule([cx - 1.4 + i * 0.9, cy - 1.6, 0], [cx - 1.2 + i * 0.9, cy + 1.6, 0.3], 0.35), 0xff8ad8, M.jelly); });
  jar(4.6, 2, 2.2, 7, 0xffd84a, (cx, cy) => g.add(S.sphere([cx, cy, 0], 1.3), 0xf6f2ec, M.gloss));
  jar(-3, 13.4, 2.4, 8, 0xb48cff, (cx, cy) => g.add(S.ellipsoid([cx, cy, 0], [1.8, 1, 1]), 0x3a3a3a, M.solid));
  jar(3, 13.4, 2.6, 9, 0x8cf56b, (cx, cy) => { g.add(S.ellipsoid([cx, cy, 0], [1.6, 2, 1.4]), 0x9adf6a, M.jelly); g.add(S.capsule([cx, cy + 1.8, 0], [cx + 1, cy + 3.4, 0], 0.3), 0x9adf6a, M.jelly); });
  return mesh(g);
}
function brainTank() {
  const root = new THREE.Group();
  const g = grid([-7, 0, -7], [7, 30, 7], 2);
  g.add(S.cyl(0, 0, 6, 0, 5), (x, y, z) => (y > 3.6 ? PAL.steel : plate(PAL.hullDark, Math.atan2(z, x) * 6, y, { pw: 3, ph: 10, bolt: false })), M.metal);
  for (let i = 0; i < 4; i++) g.add(S.sphere([Math.cos(i * 1.57) * 6, 2.5, Math.sin(i * 1.57) * 6], 0.6), [PAL.glob, PAL.pink, PAL.cyan, PAL.amber][i], M.glow);
  g.add(S.cyl(0, 0, 5.2, 5, 25), PAL.glass, M.glass);
  g.add(S.cyl(0, 0, 4.6, 5, 22), 0x7fe4c8, M.glass);
  g.add(S.cyl(0, 0, 5.8, 25, 28), PAL.steel, M.metal);
  g.add(S.capsule([0, 28, 0], [3, 30, 0], 0.6), PAL.cable, M.solid);
  root.add(mesh(g));
  const b = grid([-5, -4, -5], [5, 4, 5], 4);
  b.add(smoothUnion(S.ellipsoid([-1.3, 0, 0], [2.2, 2.4, 3]), S.ellipsoid([1.3, 0, 0], [2.2, 2.4, 3]), 1), (x, y, z) => (Math.sin(x * 3 + Math.sin(z * 2.5) * 1.5) > 0.6 || Math.sin(z * 3.3 + y * 2) > 0.8 ? 0xd86a8a : 0xf4a0b4), M.jelly);
  b.carve(S.box([-0.15, -3, -4], [0.15, 3, 4]));
  b.add(S.capsule([0, -2, 0], [0, -3.6, -0.6], 0.6), 0xe88aa0, M.jelly);
  root.add(part('brain', b, 0, 14, 0));
  return root;
}
function teleporter() {
  const root = new THREE.Group();
  const g = grid([-8, 0, -8], [8, 6, 8], 2);
  g.add(S.cyl(0, 0, 7.6, 0, 2.4), (x, _y, z) => { const r = Math.hypot(x, z), a = Math.atan2(z, x); if (r > 6.8) return Math.floor(a * 8 / Math.PI) % 2 ? PAL.hazardY : PAL.hazardK; return PAL.hullDark; }, M.metal);
  g.add(S.cyl(0, 0, 5.6, 2.4, 3), (x, _y, z) => (Math.abs(Math.hypot(x, z) - 3.6) < 0.5 || Math.hypot(x, z) < 1.2 ? 0xffffff : 0x1d3a4a), M.glow);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.add(S.box([Math.cos(a) * 6 - 0.8, 2.4, Math.sin(a) * 6 - 0.8], [Math.cos(a) * 6 + 0.8, 5.4, Math.sin(a) * 6 + 0.8], 0.3), PAL.steel, M.metal); g.add(S.sphere([Math.cos(a) * 6, 5.8, Math.sin(a) * 6], 0.7), 0xffffff, M.glow); }
  root.add(swapGlow(mesh(g), glowMat(PAL.cyan, 1.8), 'pad'));
  const r = grid([-7, -1, -7], [7, 1, 7], 2);
  r.add(S.torus([0, 0, 0], [0, 1, 0], 5.6, 0.45), 0xffffff, M.glow);
  root.add(swapGlow(part('ring', r, 0, 4, 0), glowMat(PAL.cyan, 2.2), 'ringMat'));
  return root;
}
function serverRack() {
  const root = new THREE.Group();
  const g = grid([-7, 0, -7], [7, 38, 7], 2);
  g.add(S.box([-6.5, 0, -6], [6.5, 37, 6], 0.5), PAL.hullDeep, M.metal);
  for (let r = 0; r < 9; r++) {
    const y = 2 + r * 3.8;
    g.add(S.box([-5.6, y, 5.6], [5.6, y + 3.2, 6.4]), (x) => (Math.abs(x) > 4.8 ? PAL.steel : (Math.floor(x * 2) % 2 ? 0x1a1f24 : 0x232a30)), M.metal);
  }
  root.add(mesh(g));
  const leds = grid([-6, 0, 5], [6, 38, 8], 4);
  for (let r = 0; r < 9; r++) for (let i = 0; i < 4; i++) leds.add(S.box([3 + i * 0.6, 3 + r * 3.8, 6.2], [3.4 + i * 0.6, 3.5 + r * 3.8, 6.8]), [PAL.glob, PAL.cyan, PAL.pink, PAL.amber][i], M.glow);
  root.add(named(mesh(leds), 'leds'));
  return root;
}
function generator() {
  const root = new THREE.Group();
  const g = grid([-8, 0, -8], [8, 28, 8], 2);
  g.add(S.box([-7.5, 0, -6], [7.5, 2, 6], 0.6), (x, y, z) => (y < 0.8 ? hazard(x, z, 3) : PAL.hullDark), M.metal);
  for (const sx of [-1, 1]) g.add(S.box([sx * 6.6 - 0.8, 2, -1], [sx * 6.6 + 0.8, 16, 1]), PAL.steel, M.metal);
  g.add(S.box([4, 2, 2.6], [7.5, 9, 6], 0.6), PAL.paintTeal, M.metal);                   // battery box
  g.add(S.box([4.8, 6.4, 6], [6.8, 8.2, 6.4]), 0xffffff, M.glow);
  root.add(mesh(g));
  const w = grid([-1, -12, -12], [1, 12, 12], 2);
  w.add(S.torus([0, 0, 0], [1, 0, 0], 10.4, 0.8), PAL.steel, M.metal);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; w.add(S.capsule([-0.9, Math.cos(a) * 10.4, Math.sin(a) * 10.4], [0.9, Math.cos(a) * 10.4, Math.sin(a) * 10.4], 0.35), PAL.chrome, M.metal); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; w.add(S.capsule([0, 0, 0], [0, Math.cos(a) * 10, Math.sin(a) * 10], 0.35), PAL.steelDark, M.metal); }
  const wheel = part('wheel', w, 0, 16, 0); wheel.rotation.y = Math.PI / 2;
  root.add(wheel);
  const h = grid([-3, 0, -3], [3, 5, 4], 4);                                               // the tired space hamster
  h.add(S.ellipsoid([0, 2, 0], [2, 1.8, 2.6]), 0xd8a46a, M.fur);
  h.add(S.ellipsoid([0, 1.6, 0.6], [1.5, 1.2, 2]), 0xf6e6cc, M.fur);
  for (const sx of [-1, 1]) { h.add(S.sphere([sx * 1, 3.6, 1.2], 0.6), 0xe0b080, M.fur); h.add(S.sphere([sx * 0.7, 2.6, 2.4], 0.3), 0x111111, M.gloss); }
  h.add(S.cyl(0, 0, 2.2, 3.4, 3.7), 0x9fe8ff, M.glass);                                    // space helmet rim
  root.add(part('hamster', h, 0, 6.4, 0));
  return root;
}

// ── arcade ───────────────────────────────────────────────────────────────────
function cabinetShell(g: VoxGrid, body: number, trim: number, h = 30) {
  g.add(S.box([-7, 0, -6.5], [7, h, 6], 1), (x, y, z) => (Math.abs(x) > 6.2 ? trim : y < 1.4 ? shade(body, 0.6) : body), M.solid);
  g.carve(S.box([-6, 19, 4], [6, 28, 7]));                    // screen recess
  g.add(S.box([-6.2, 14, 4], [6.2, 16, 9], 0.6), shade(body, 0.85), M.solid);                // control deck
}
function slotMachine() {
  const root = new THREE.Group();
  const g = grid([-8, 0, -8], [10, 34, 9], 2);
  cabinetShell(g, 0xc8302a, 0xf2c043, 30);
  g.add(S.box([-6.6, 30, -6], [6.6, 33, 5.6], 1), 0xf2c043, M.metal);                     // crown
  for (let i = 0; i < 7; i++) g.add(S.sphere([-5.4 + i * 1.8, 31.6, 5.6], 0.6), 0xffffff, M.glow);
  stampText(g, '777', -textWidth('777', 0.5) / 2, 12.6, 6.1, 0.5, 0xffe14d, M.glow, 0.5);
  g.add(S.box([-5, 2, 6.1], [5, 6, 6.6]), 0x3a1a14, M.solid);                                // coin tray
  g.add(S.box([7, 14, -1], [8.6, 18, 1]), PAL.chrome, M.metal);                             // lever base
  root.add(mesh(g));
  const reels = grid([-6, 19, 3], [6, 28, 5], 3);
  const sym = [0xd8304a, 0xffbe3d, 0x8cf56b];
  for (let i = 0; i < 3; i++) {
    const cx = -3.8 + i * 3.8;
    reels.add(S.box([cx - 1.6, 19.6, 3.2], [cx + 1.6, 27.4, 4.2]), 0xfff6dc, M.glow);
    reels.add(S.sphere([cx, 23.5, 4.3], 1.1), sym[i], M.glow);
  }
  root.add(named(mesh(reels), 'reels'));
  const lever = grid([-1, 0, -1], [1, 12, 1], 3);
  lever.add(S.capsule([0, 0, 0], [0, 9, 0], 0.45), PAL.chrome, M.metal);
  lever.add(S.sphere([0, 10, 0], 1.4), 0xd8304a, M.jelly);
  root.add(part('lever', lever, 7.8, 16, 0));
  return root;
}
function arcadeCab() {
  const root = new THREE.Group();
  const g = grid([-8, 0, -8], [8, 34, 10], 2);
  cabinetShell(g, 0x3a2a7a, 0x52f2ff, 32);
  g.add(S.box([-7, 28.5, 4], [7, 32, 6.8], 0.6), 0x1a1240, M.solid);                       // marquee
  g.add(S.capsule([-3, 16, 6], [-3, 18, 6.4], 0.4), PAL.hullDeep, M.metal);                 // joystick
  g.add(S.sphere([-3, 18.4, 6.4], 0.9), PAL.red, M.jelly);
  for (let i = 0; i < 3; i++) g.add(S.cyl(1 + i * 2, 6.4 + (i % 2) * 0.6, 0.7, 16, 16.8), [PAL.glob, PAL.pink, PAL.amber][i], M.glow);
  for (let i = 0; i < 6; i++) g.add(S.box([-6.4 + i * 2.2, 3, 5.2], [-5.4 + i * 2.2, 11, 6.2]), i % 2 ? 0xff6fd6 : 0x52f2ff, M.glow);   // side art stripes
  root.add(mesh(g));
  const mq = grid([-7, 28, 6], [7, 32, 8], 4);
  stampText(mq, 'GLOB', -textWidth('GLOB', 0.5) / 2, 31.4, 6.8, 0.5, 0xffffff, M.glow, 0.4);
  root.add(mesh(mq));
  // voxel screen: a tiny level with our alien hopping over a crater (animated by the world)
  const s = grid([-6, 19, 3], [6, 28, 5], 3);
  s.add(S.box([-5.8, 19.2, 3.6], [5.8, 27.8, 4.4]), 0x0d0a2a, M.glow);
  s.add(S.box([-5.8, 19.2, 4.4], [5.8, 20.6, 4.6]), 0x2f8f3a, M.glow);
  for (let i = 0; i < 9; i++) s.add(S.box([-5.4 + i * 1.3, 25 + (i % 3) * 0.9, 4.4], [-5.1 + i * 1.3, 25.3 + (i % 3) * 0.9, 4.6]), 0xffffff, M.glow);
  root.add(named(mesh(s), 'screen'));
  const hero = grid([-1, 0, 4], [1, 2, 5], 6);
  hero.add(S.box([-0.7, 0, 4.4], [0.7, 1.4, 4.8]), 0x8cf56b, M.glow);
  root.add(part('hero', hero, -3, 20.8, 0));
  return root;
}
function pinball() {
  const root = new THREE.Group();
  const g = grid([-8, 0, -16], [8, 30, 16], 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(S.box([sx * 6 - 0.8, 0, sz * 13 - 0.8], [sx * 6 + 0.8, sz > 0 ? 12 : 15, sz * 13 + 0.8]), PAL.chrome, M.metal);
  const top = (z: number) => 13 + (14 - z) * 0.1;
  for (let z = -15; z < 15; z += 0.5) g.add(S.box([-7.5, top(z) - 2.4, z], [7.5, top(z), z + 0.5]), (x, y) => (Math.abs(x) > 6.8 ? 0x8a3fd8 : y > top(z) - 0.6 ? 0x1a1240 : 0x6a2fb0), M.solid);
  for (const [x, z, c] of [[-3, -6, PAL.pink], [3, -6, PAL.cyan], [0, -10, PAL.amber], [-2, 0, PAL.glob]] as [number, number, number][]) g.add(S.cyl(x, z, 1.4, top(z) - 0.6, top(z) + 1.4), c, M.glow);
  g.add(S.box([-7.5, 14, -16], [7.5, 28, -14], 0.8), 0x2a1a5a, M.solid);                // backbox
  g.add(S.box([-6.4, 15.4, -14], [6.4, 26.6, -13.4]), (x, y) => ((Math.floor(x) + Math.floor(y)) % 3 === 0 ? 0xff6fd6 : 0x3a1a8a), M.glow);
  stampText(g, 'ZETA', -textWidth('ZETA', 0.5) / 2, 24.4, -13.2, 0.5, 0xffffff, M.glow, 0.4);
  root.add(mesh(g));
  const ball = grid([-1, -1, -1], [1, 1, 1], 6); ball.add(S.sphere([0, 0, 0], 0.8), PAL.chrome, M.metal);
  root.add(part('ball', ball, 0, 15, 4));
  return root;
}
function jukebox() {
  const root = new THREE.Group();
  const g = grid([-9, 0, -7], [9, 32, 8], 2);
  g.add(smoothUnion(S.box([-8, 0, -6], [8, 22, 6], 1), S.ellipsoid([0, 22, 0], [8, 9, 6]), 1), (x, y) => (Math.abs(x) > 7 ? 0xc87a3a : y < 2 ? 0x5a3a1a : 0x7a4a2a), M.solid);
  g.add(S.box([-5.6, 3, 5.4], [5.6, 11, 6.4]), (x, y) => ((Math.floor(x * 1.5) + Math.floor(y * 1.5)) % 2 ? 0x2a1a10 : 0x4a2a1a), M.solid);    // speaker grille
  g.add(S.box([-5, 13, 5.6], [5, 19, 6.6]), 0xfff2c8, M.glow);                            // song cards
  for (let i = 0; i < 5; i++) g.add(S.box([-4.4 + i * 2, 13.6, 6.6], [-3 + i * 2, 18.4, 6.8]), [0xff6fd6, 0x52f2ff, 0xffe14d, 0x8cf56b, 0xb48cff][i], M.solid);
  root.add(mesh(g));
  const tube = grid([-9, 0, 5], [9, 32, 8], 3);
  for (let i = 0; i < 40; i++) { const a = Math.PI * (i / 39); tube.add(S.sphere([-Math.cos(a) * 7.2, 21 + Math.sin(a) * 8.4, 6.2], 0.7), 0xffffff, M.glow); }
  for (const sx of [-1, 1]) tube.add(S.capsule([sx * 7.2, 3, 6.2], [sx * 7.2, 21, 6.2], 0.7), 0xffffff, M.glow);
  root.add(swapGlow(named(mesh(tube), 'tubes'), glowMat(PAL.pink, 2), 'tubeMat'));
  return root;
}
function clawMachine() {
  const root = new THREE.Group();
  const g = grid([-8, 0, -8], [8, 38, 8], 2);
  g.add(S.box([-7.5, 0, -7.5], [7.5, 12, 7.5], 1), (x, y) => (y > 10.5 ? 0xffe14d : Math.abs(x) > 6.8 ? 0xd84aaf : 0xff6fd6), M.solid);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(S.box([sx * 7 - 0.6, 12, sz * 7 - 0.6], [sx * 7 + 0.6, 34, sz * 7 + 0.6]), 0xff6fd6, M.solid);
  g.add(S.box([-7.5, 34, -7.5], [7.5, 37, 7.5], 0.8), 0xd84aaf, M.solid);
  stampText(g, 'GRAB', -textWidth('GRAB', 0.5) / 2, 36.4, 7.6, 0.5, 0xffffff, M.glow, 0.4);
  g.add(S.box([-6.8, 12, -6.8], [6.8, 34, 6.8]), PAL.glass, M.glass);
  g.carve(S.box([-6.2, 12.5, -6.2], [6.2, 33.5, 6.2]));
  for (let i = 0; i < 12; i++) { const x = -4.4 + (i % 4) * 3, z = -3.6 + Math.floor(i / 4) * 3.4; g.add(S.sphere([x, 14.6 + (i % 3) * 0.7, z], 1.6), [0x8cf56b, 0x52f2ff, 0xffe14d, 0xb48cff][i % 4], M.jelly); g.add(S.sphere([x - 0.6, 15.2 + (i % 3) * 0.7, z + 1.4], 0.35), 0, M.gloss); g.add(S.sphere([x + 0.6, 15.2 + (i % 3) * 0.7, z + 1.4], 0.35), 0, M.gloss); }
  g.add(S.box([-2.6, 4, 7.4], [2.6, 8, 8]), 0x111111, M.solid);
  root.add(mesh(g));
  const c = grid([-3, -6, -3], [3, 1, 3], 3);
  c.add(S.capsule([0, 0, 0], [0, -2.4, 0], 0.4), PAL.steel, M.metal);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; c.add(S.capsule([0, -2.4, 0], [Math.cos(a) * 2, -4, Math.sin(a) * 2], 0.35), PAL.chrome, M.metal); c.add(S.capsule([Math.cos(a) * 2, -4, Math.sin(a) * 2], [Math.cos(a) * 1.2, -5.4, Math.sin(a) * 1.2], 0.3), PAL.chrome, M.metal); }
  root.add(part('claw', c, 0, 33, 0));
  return root;
}

// ── lighting ─────────────────────────────────────────────────────────────────
function stringLights() {
  const root = new THREE.Group();
  const g = grid([-16, 0, -2], [16, 40, 2], 2);
  for (const sx of [-1, 1]) { g.add(S.box([sx * 14 - 0.7, 0, -0.7], [sx * 14 + 0.7, 38, 0.7]), PAL.woodDark, M.solid); g.add(S.box([sx * 14 - 3, 0, -2], [sx * 14 + 3, 1.4, 2], 0.4), PAL.hullDark, M.metal); }
  for (let i = 0; i <= 40; i++) { const x = -14 + (i / 40) * 28, y = 37 - Math.sin((i / 40) * Math.PI) * 8; g.add(S.sphere([x, y, 0], 0.35), 0x1a1a1a, M.solid); }
  root.add(mesh(g));
  const b = grid([-16, 20, -2], [16, 40, 2], 3);
  for (let i = 0; i <= 12; i++) { const x = -13 + (i / 12) * 26, y = 36.4 - Math.sin(((x + 14) / 28) * Math.PI) * 8; b.add(S.ellipsoid([x, y - 1, 0], [0.8, 1.1, 0.8]), [0xffe14d, 0xff6fd6, 0x52f2ff][i % 3], M.glow); }
  root.add(named(mesh(b), 'bulbs'));
  return root;
}
function lampFloor() {
  const root = new THREE.Group();
  const g = grid([-8, 0, -6], [10, 32, 6], 2);
  g.add(S.cyl(0, 0, 4.4, 0, 1.4), (x, _y, z) => hazard(Math.atan2(z, x) * 4, 0, 1.5), M.metal);
  g.add(S.capsule([0, 1.4, 0], [0, 28, 0], 0.7), PAL.steelDark, M.metal);
  g.add(S.capsule([0, 28, 0], [6, 29, 0], 0.6), PAL.steelDark, M.metal);
  g.add(S.cone(6, 0, 23, 28.6, 4.2, 1.8), 0x2f6b4a, M.metal);
  g.carve(S.cone(6, 0, 22.9, 27.6, 3.6, 1.2));
  g.add(S.ellipsoid([6, 25, 0], [1.6, 1.4, 1.6]), 0xffe8b8, M.glow);
  for (const y of [8, 16]) g.add(S.cyl(0, 0, 1.1, y, y + 1), PAL.chrome, M.metal);
  root.add(mesh(g));
  return root;
}
function neonTube() {
  const root = new THREE.Group();
  const g = grid([-5, 0, -5], [5, 30, 5], 3);
  g.add(S.box([-3.6, 0, -3.6], [3.6, 2.4, 3.6], 0.6), PAL.hullDark, M.metal);
  g.add(S.cyl(0, 0, 1.2, 2.4, 4), PAL.steel, M.metal);
  g.add(S.cyl(0, 0, 1.2, 27, 28.4), PAL.steel, M.metal);
  for (const sx of [-1, 1]) g.add(S.capsule([sx * 1.4, 2.4, 0], [sx * 1.4, 28, 0], 0.25), PAL.steelDark, M.metal);
  root.add(mesh(g));
  const t = grid([-2, 3, -2], [2, 28, 2], 3);
  t.add(S.capsule([0, 4, 0], [0, 27, 0], 0.8), 0xffffff, M.glow);
  root.add(swapGlow(named(mesh(t), 'tube'), glowMat(PAL.violet, 2.2), 'tubeMat'));
  return root;
}

const MAKERS: Record<string, () => THREE.Object3D> = {
  beanbag, couch, workbench, shelf, rug, stool,
  neon_heart: neonHeart, neon_ufo: neonUfo, poster, graffiti, lava_lamp: lavaLamp, disco, traffic_cone: trafficCone, trash_can: trashCan, gnome,
  chomper, eyeplant, cactus, tentacle_fern: tentacleFern, shroom,
  tesla, microscope, jars, brain_tank: brainTank, teleporter, server_rack: serverRack, generator,
  slot_machine: slotMachine, arcade_cab: arcadeCab, pinball, jukebox, claw: clawMachine,
  string_lights: stringLights, lamp_floor: lampFloor, neon_tube: neonTube,
};

const cache = new Map<string, THREE.Object3D>();

/** A fresh voxel model for a placeable item (geometry shared; animated materials cloned). */
export function buildItemModel(id: string): THREE.Object3D {
  let proto = cache.get(id);
  if (!proto) {
    const make = MAKERS[id];
    if (make) proto = make();
    else {
      const g = grid([-6, 0, -6], [6, 12, 6], 2);
      g.add(S.box([-5.5, 0, -5.5], [5.5, 11, 5.5], 0.8), (x, y) => plate(PAL.wood, x + 6, y, { pw: 4, ph: 12, bolt: false }), M.solid);
      g.add(S.sphere([0, 11.5, 0], 1.4), PAL.glob, M.glow);
      proto = mesh(g);
    }
    proto.name = 'item:' + id;
    cache.set(id, proto);
  }
  const copy = proto.clone(true);
  // animated emissive materials must be per-instance
  copy.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && /neon|blob|core|ringMat|pad|tubeMat/.test(m.name)) m.material = (m.material as THREE.Material).clone(); });
  return copy;
}

export const ITEM_IDS = Object.keys(MAKERS);
void VoxGrid; void U;
