// ─────────────────────────────────────────────────────────────────────────────
// Alien cosmetics + held tools — high-resolution voxel sculpts at the aliens' own detail
// level, with the same inked outline. Everything is built in the alien's model frames:
//   head frame  : origin = head centre (hats, face gear, helmets)
//   body frame  : origin = between the feet (outfits, backpacks, scarves)
//   arm frame   : origin = shoulder pivot (sleeves)
// Hats hug the head surface (the head is carved out of them) and carve clean holes where
// the antenna stalks / cat ears pass, so nothing ever clips.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { AlienLook } from '../core/types';
import { M, S, VoxGrid, mix, shade, hash3, type Mat, type Shape, type V3 } from './core';
import { toObject } from './mesh';
import { ALIEN_RES, ARM_PIVOT, CAT_EARS, HEAD_Y, antennaClearance, bodyShape, headShape, type AlienParts } from './alien';

export type HandItem = 'hammer' | 'wrench' | 'magnifier' | 'box' | 'mug' | 'chalk' | 'clipboard' | 'tablet' | null;

const RES = ALIEN_RES;
const DEFAULT_SIZE = 0.016;

// ── shape algebra ────────────────────────────────────────────────────────────
type Box6 = [number, number, number, number, number, number];
const bx = (b: Box6, d: number): Box6 => [b[0] - d, b[1] - d, b[2] - d, b[3] + d, b[4] + d, b[5] + d];
const T = (s: Shape, o: V3): Shape => ({ sdf: (x, y, z) => s.sdf(x - o[0], y - o[1], z - o[2]), box: [s.box[0] + o[0], s.box[1] + o[1], s.box[2] + o[2], s.box[3] + o[0], s.box[4] + o[1], s.box[5] + o[2]] });
const grow = (s: Shape, d: number): Shape => ({ sdf: (x, y, z) => s.sdf(x, y, z) - d, box: bx(s.box, Math.max(0, d)) });
const shell = (s: Shape, t0: number, t1: number): Shape => ({ sdf: (x, y, z) => { const d = s.sdf(x, y, z); return Math.max(d - t1, t0 - d); }, box: bx(s.box, t1) });
const inter = (a: Shape, f: (x: number, y: number, z: number) => number): Shape => ({ sdf: (x, y, z) => Math.max(a.sdf(x, y, z), f(x, y, z)), box: a.box });
const minus = (a: Shape, b: Shape): Shape => ({ sdf: (x, y, z) => Math.max(a.sdf(x, y, z), -b.sdf(x, y, z)), box: a.box });
const union = (...ss: Shape[]): Shape => ({
  sdf: (x, y, z) => { let d = Infinity; for (const s of ss) d = Math.min(d, s.sdf(x, y, z)); return d; },
  box: ss.reduce((b, s) => [Math.min(b[0], s.box[0]), Math.min(b[1], s.box[1]), Math.min(b[2], s.box[2]), Math.max(b[3], s.box[3]), Math.max(b[4], s.box[4]), Math.max(b[5], s.box[5])] as Box6, [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity] as Box6),
});
/** rotate a shape about `pivot` (radians, applied X then Y then Z) */
function rot(s: Shape, ax: number, ay: number, az: number, pivot: V3 = [0, 0, 0]): Shape {
  const cx = Math.cos(-ax), sx = Math.sin(-ax), cy = Math.cos(-ay), sy = Math.sin(-ay), cz = Math.cos(-az), sz = Math.sin(-az);
  const R = Math.hypot(s.box[3] - s.box[0], s.box[4] - s.box[1], s.box[5] - s.box[2]) / 2 + 1;
  const c: V3 = [(s.box[0] + s.box[3]) / 2, (s.box[1] + s.box[4]) / 2, (s.box[2] + s.box[5]) / 2];
  // rotate the box centre too
  const fwd = (p: V3): V3 => {
    let [x, y, z] = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
    let a = Math.cos(ax), b = Math.sin(ax); [y, z] = [y * a - z * b, y * b + z * a];
    a = Math.cos(ay); b = Math.sin(ay); [x, z] = [x * a + z * b, -x * b + z * a];
    a = Math.cos(az); b = Math.sin(az); [x, y] = [x * a - y * b, x * b + y * a];
    return [x + pivot[0], y + pivot[1], z + pivot[2]];
  };
  const cc = fwd(c);
  return {
    sdf: (x, y, z) => {
      x -= pivot[0]; y -= pivot[1]; z -= pivot[2];
      [x, y] = [x * cz - y * sz, x * sz + y * cz];
      [x, z] = [x * cy + z * sy, -x * sy + z * cy];
      [y, z] = [y * cx - z * sx, y * sx + z * cx];
      return s.sdf(x + pivot[0], y + pivot[1], z + pivot[2]);
    },
    box: [cc[0] - R, cc[1] - R, cc[2] - R, cc[0] + R, cc[1] + R, cc[2] + R],
  };
}
const slabY = (lo: number, hi: number) => (_x: number, y: number) => Math.max(lo - y, y - hi);

/** where the head surface is along +z at (x,y) in the head frame */
function headSurfZ(cat: boolean, x: number, y: number) {
  const h = headShape(cat);
  let lo = 0, hi = 22;
  if (h.sdf(x, y, 0) > 0) return null;
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (h.sdf(x, y, m) > 0) hi = m; else lo = m; }
  return lo;
}

// ── a piece = one meshed part attached somewhere on the rig ──────────────────
type Attach = 'head' | 'body' | 'armL' | 'armR';
interface Piece {
  at: Attach;
  grid: VoxGrid;
  ink: number;
  /** model-unit offset of the piece's origin in its attach frame (animated pieces pivot here) */
  pivot?: V3;
  anim?: 'spin' | 'sway' | 'bob' | 'flame';
  outline?: number; // width in voxels (0 = none)
}

function grid(min: V3, max: V3) { return VoxGrid.span(min, max, RES); }
function gridFor(...ss: Shape[]) {
  const u = union(...ss);
  return grid([u.box[0] - 1, u.box[1] - 1, u.box[2] - 1], [u.box[3] + 1, u.box[4] + 1, u.box[5] + 1]);
}

/** carve the antenna stalks / cat ears and the head itself out of a head-frame grid */
function clearHead(g: VoxGrid, cat: boolean, hugHead = true) {
  if (hugHead) g.carve(grow(headShape(cat), -0.3));
  if (cat) for (const e of CAT_EARS) g.carve(S.ellipsoid(e.c, [e.r[0] + 0.6, e.r[1] + 0.6, e.r[2] + 0.6]));
  else for (const c of antennaClearance()) g.carve(S.capsule(c.a, c.b, c.r));
  return g;
}
/** carve the body (and the head above it) out of a body-frame grid */
function clearBody(g: VoxGrid, cat: boolean) {
  g.carve(grow(bodyShape(cat), -0.3));
  g.carve(T(grow(headShape(cat), -0.2), [0, HEAD_Y, 0]));
  return g;
}

/** the arm nub (arm frame) — mirrors alien.ts buildArm */
function armShape(cat: boolean, raisedPaw: boolean): Shape {
  if (cat && raisedPaw) return union(S.capsule([0, 0, 0], [0.6, 6.2, 1.8], 3.5, 3.9), S.ellipsoid([0.7, 9.2, 2.6], [5.2, 4.8, 4.4]));
  if (cat) return union(S.capsule([0, 0, 0], [0, -4, 2], 3.2, 3.5), S.ellipsoid([0, -5.4, 2.6], [3.8, 3.2, 3.6]));
  return S.ellipsoid([0, -3, 2], [3.1, 3.4, 3.1]);
}
/** a cuff/sleeve hugging the upper arm */
function sleeves(cat: boolean, color: (x: number, y: number, z: number) => number, ink: number, mat: Mat = M.solid, cuff?: number): Piece[] {
  const out: Piece[] = [];
  for (const side of ['armL', 'armR'] as const) {
    const raised = cat && side === 'armR';
    const arm = armShape(cat, raised);
    const sl = inter(shell(arm, -0.25, 1.05), raised ? (_x, y) => y - 4.2 : (_x, y) => (cat ? -3.4 : -3.2) - y);
    const g = gridFor(sl);
    g.add(sl, (x, y, z) => {
      const edge = raised ? y > 3.2 : y < (cat ? -2.4 : -2.2);
      return cuff !== undefined && edge ? cuff : color(x, y, z);
    }, mat);
    g.carve(grow(arm, -0.25));
    out.push({ at: side, grid: g, ink });
  }
  return out;
}

const tint = (c: number, k: number) => shade(c, k);
const stripe = (a: number, b: number, freq: number, phase = 0) => (x: number, y: number, z: number) => (Math.floor(Math.atan2(z, x) * freq / Math.PI + phase) % 2 === 0 ? a : b);

// ── HATS (head frame) ────────────────────────────────────────────────────────
function hat(id: string, cat: boolean): Piece[] {
  const top = cat ? 13.8 : 15.4; // where the crown of the head is (roughly)
  switch (id) {
    case 'goggles': {
      const strapC = 0x6b4426, brass = 0xd9a441, glass = 0x8ff3ff;
      const strap = inter(shell(headShape(cat), -0.2, 1.2), slabY(cat ? 7.2 : 8.4, cat ? 9.8 : 11));
      const g = grid([-20, 4, -20], [20, 18, 20]);
      g.add(strap, (x, y, z) => (Math.abs(y - (cat ? 8.5 : 9.7)) < 0.35 ? tint(strapC, 1.25) : strapC), M.solid);
      for (const sx of [-1, 1]) {
        const ex = sx * (cat ? 6 : 5.6), ey = cat ? 9.2 : 10.6;
        const zs = headSurfZ(cat, ex, ey) ?? 10;
        const n: V3 = [ex / 17 ** 2, ey / 16 ** 2, zs / 15.5 ** 2];
        const nl = Math.hypot(...n); const N: V3 = [n[0] / nl, n[1] / nl, n[2] / nl];
        const c: V3 = [ex + N[0] * 1.8, ey + N[1] * 1.8, zs + N[2] * 1.8];
        g.add(S.disc(c, N, 4, 1.7), (x, y) => (y > c[1] + 2.4 ? tint(brass, 1.2) : brass), M.metal);
        const f: V3 = [c[0] + N[0] * 1.2, c[1] + N[1] * 1.2, c[2] + N[2] * 1.2];
        g.carve(S.disc(f, N, 2.9, 0.9));
        g.add(S.disc([c[0] + N[0] * 0.6, c[1] + N[1] * 0.6, c[2] + N[2] * 0.6], N, 2.9, 0.5), glass, M.gloss);
        g.add(S.sphere([f[0] - 1.1, f[1] + 1.1, f[2] - 0.5], 0.7), 0xffffff, M.glow);
        // rivets round the rim
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.paint(S.sphere([c[0] + Math.cos(a) * 3.5, c[1] + Math.sin(a) * 3.5, c[2] + 1.2], 0.45), 0xfff0c0); }
      }
      g.add(S.capsule([-2.4, cat ? 9.4 : 10.8, (headSurfZ(cat, 0, 10.6) ?? 10) + 1.5], [2.4, cat ? 9.4 : 10.8, (headSurfZ(cat, 0, 10.6) ?? 10) + 1.5], 0.7), brass, M.metal);
      clearHead(g, cat, true);
      return [{ at: 'head', grid: g, ink: 0x3a2410 }];
    }
    case 'hardhat': {
      const yel = 0xffc21a;
      const dome = inter(S.ellipsoid([0, top - 3.2, -0.5], [9.6, 7.6, 9.6]), slabY(top - 3.2, 99));
      const brim = inter(S.disc([0, top - 2.8, 0.8], [0, 1, 0.06], 12, 0.6), (x, y, z) => -(z + 3)); // brim mostly to the front/sides
      const ridge = inter(S.box([-1.2, top - 3, -10], [1.2, top + 5.2, 10], 1), (x, y, z) => S.ellipsoid([0, top - 3.2, -0.5], [10.4, 8.6, 10.4]).sdf(x, y, z));
      const g = gridFor(dome, brim, ridge);
      g.add(dome, (x, y) => (y > top + 2.5 ? tint(yel, 1.12) : yel), M.solid);
      g.add(ridge, tint(yel, 1.05), M.solid);
      g.add(brim, tint(yel, 0.92), M.solid);
      // headlamp
      const lc: V3 = [0, top + 0.8, 8.4];
      g.add(S.disc(lc, [0, 0.25, 1], 2.4, 1.2), 0x5a5f6a, M.metal);
      g.add(S.disc([lc[0], lc[1] + 0.3, lc[2] + 1.1], [0, 0.25, 1], 1.7, 0.4), 0xfff6c8, M.glow);
      // sticker
      g.paint(S.sphere([-5.4, top + 1.2, 6.2], 1.5), 0x8cf56b);
      clearHead(g, cat);
      return [{ at: 'head', grid: g, ink: 0x6a4a00 }];
    }
    case 'tophat': {
      const blk = 0x24252e, band = 0x9b59ff;
      const crown = S.cyl(0, -0.5, 5.3, top - 0.6, top + 10.5);
      const lip = S.cyl(0, -0.5, 5.8, top + 9.6, top + 10.6);
      const brim = S.disc([0, top - 0.2, -0.5], [0, 1, 0], 8.6, 0.65);
      const g = gridFor(crown, brim, lip);
      g.add(crown, (x, y) => (y > top + 0.9 && y < top + 2.9 ? band : blk), M.solid);
      g.add(lip, tint(blk, 1.4), M.solid);
      g.add(brim, (x, y, z) => (Math.hypot(x, z + 0.5) > 7.8 ? tint(blk, 1.5) : blk), M.solid);
      // little card tucked in the band
      g.add(S.box([2.6, top + 1.2, 4.1], [5, top + 4.6, 4.9], 0.2), 0xfff6e0, M.solid);
      g.paint(S.box([3, top + 3.4, 4.6], [4.6, top + 3.9, 5.1]), 0xe23b5a);
      clearHead(g, cat);
      return [{ at: 'head', grid: g, ink: 0x0a0a10 }];
    }
    case 'propeller': {
      const cols = [0xe23b5a, 0xffc21a, 0x3b7bff, 0x2fbf6a];
      const cap = inter(S.ellipsoid([0, top - 2.4, -0.5], [7.6, 5.6, 7.6]), slabY(top - 2.4, 99));
      const visor = inter(S.disc([0, top - 1.9, 6.4], [0, 1, 0.35], 4.6, 0.55), (x, y, z) => -(z - 3.5));
      const stem = S.cyl(0, -0.5, 0.75, top + 2.4, top + 5.4);
      const g = gridFor(cap, visor, stem);
      g.add(cap, (x, y, z) => cols[((Math.floor(((Math.atan2(z + 0.5, x) + Math.PI) / (Math.PI * 2)) * 8)) % 4 + 4) % 4], M.solid);
      g.add(visor, 0xe23b5a, M.solid);
      g.add(stem, 0xc9ced8, M.metal);
      g.add(S.sphere([0, top + 3, -0.5], 1.3), 0xffc21a, M.solid);
      clearHead(g, cat);
      // spinning blades (their own pivot)
      const pg = grid([-8, -2, -3], [8, 2, 3]);
      pg.add(rot(S.box([-7.2, -0.35, -1.3], [-0.6, 0.35, 1.3], 0.3), 0.35, 0, 0), 0xe23b5a, M.solid);
      pg.add(rot(S.box([0.6, -0.35, -1.3], [7.2, 0.35, 1.3], 0.3), -0.35, 0, 0), 0x3b7bff, M.solid);
      pg.add(S.sphere([0, 0, 0], 1.2), 0xffc21a, M.solid);
      return [{ at: 'head', grid: g, ink: 0x3a1018 }, { at: 'head', grid: pg, ink: 0x101830, pivot: [0, top + 5.6, -0.5], anim: 'spin', outline: 1 }];
    }
    case 'beanie': {
      const a = 0xff7a59, b = 0xffe2c8;
      const cap = inter(shell(headShape(cat), -0.3, 2.1), slabY(cat ? 4.5 : 6, 99));
      const cuff = inter(shell(headShape(cat), -0.3, 2.5), slabY(cat ? 4.5 : 6.4, cat ? 7.2 : 8.8));
      const pom = S.sphere([0, top + 4.6, -0.8], 3.6);
      const g = gridFor(cap, pom);
      g.add(cap, (x, y, z) => {
        const ang = Math.atan2(z, x);
        const row = Math.floor(y * 0.9);
        return (row % 4 === 0) ? b : (Math.floor(ang * 7 + row * 0.5) % 2 === 0 ? a : tint(a, 0.9));
      }, M.fur);
      g.add(cuff, (x, y, z) => (Math.floor((Math.atan2(z, x) + Math.PI) * 9) % 2 === 0 ? tint(a, 0.82) : tint(a, 0.95)), M.fur);
      g.add(pom, (x, y, z) => (hash3(Math.floor(x * 2), Math.floor(y * 2), Math.floor(z * 2), 3) > 0.5 ? b : tint(b, 0.92)), M.fur);
      for (let i = 0; i < 18; i++) {
        const t = (i / 18) * Math.PI * 2, f = 0.7 + hash3(i, 1, 1) * 0.6;
        g.add(S.sphere([Math.cos(t) * 3.4, top + 4.6 + Math.sin(t * 2) * 1.6, -0.8 + Math.sin(t) * 3.4], f), b, M.fur);
      }
      clearHead(g, cat, true);
      return [{ at: 'head', grid: g, ink: 0x5a2010 }];
    }
    case 'chef': {
      const w = 0xf7f8fa;
      const band = inter(shell(headShape(cat), -0.3, 1.6), slabY(cat ? 8.5 : 10, cat ? 12 : 13.6));
      const puffs = union(S.sphere([0, top + 4.4, -0.5], 5.2), S.sphere([-3.4, top + 5.8, -0.5], 4.2), S.sphere([3.4, top + 5.8, -0.5], 4.2), S.sphere([0, top + 6.2, 2.6], 4.2), S.sphere([0, top + 6.2, -3.6], 4.2), S.sphere([0, top + 8.6, -0.5], 4.4));
      const g = gridFor(band, puffs);
      g.add(band, (x, y) => (Math.abs(y - (cat ? 10.2 : 11.8)) < 0.3 ? 0xdfe4ea : w), M.fur);
      g.add(puffs, (x, y, z) => mix(0xe9edf2, w, Math.min(1, (y - top) / 8)), M.fur);
      clearHead(g, cat);
      return [{ at: 'head', grid: g, ink: 0x6a7584 }];
    }
    case 'wizard': {
      const pur = 0x5b3fbf, gold = 0xffcf4a;
      const path: V3[] = [[0, top + 0.5, -0.5], [0, top + 7, -1], [0.6, top + 12.5, -2], [2.4, top + 16.5, -3.2], [5.2, top + 18.4, -3.8]];
      const radii = [7, 5.4, 3.7, 2.1, 0.9];
      const segs: Shape[] = [];
      for (let i = 0; i < path.length - 1; i++) segs.push(S.capsule(path[i], path[i + 1], radii[i], radii[i + 1]));
      const cone = inter(union(...segs), slabY(top - 0.2, 99));
      const brim = S.disc([0, top - 0.1, -0.5], [0, 1, 0], 10.6, 0.65);
      const g = gridFor(cone, brim);
      g.add(cone, (x, y, z) => (y < top + 2.6 ? gold : pur), M.solid);
      g.add(brim, (x, y, z) => (Math.hypot(x, z + 0.5) > 9.8 ? tint(pur, 1.25) : pur), M.solid);
      // stars and moons
      for (const [sx, sy, sz] of [[-4, 6, 3.6], [3.5, 9, 2.4], [-1.6, 12.5, 1.4], [2, 4.4, 5.2]] as const) g.paint(S.sphere([sx, top + sy, sz], 1.25), gold, M.glow);
      g.add(S.sphere([5.4, top + 18.6, -3.8], 1.2), gold, M.glow);
      clearHead(g, cat);
      return [{ at: 'head', grid: g, ink: 0x1e1040 }];
    }
    case 'party': {
      const cols = [0xff6fd6, 0xffe14d, 0x52f2ff];
      const base: V3 = [3, top - 0.8, 1];
      const cone = rot(S.cone(base[0], base[2], base[1], base[1] + 11, 4.8, 0.4), 0, 0, -0.32, base);
      const pom = S.sphere([base[0] + 3.6, base[1] + 10.6, base[2]], 1.9);
      const g = gridFor(cone, pom);
      g.add(cone, (x, y, z) => cols[((Math.floor((y - base[1]) * 0.55 + x * 0.35)) % 3 + 3) % 3], M.solid);
      g.add(pom, 0xffffff, M.fur);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.add(S.sphere([base[0] + 3.6 + Math.cos(a) * 1.8, base[1] + 10.6 + Math.sin(a * 2) * 0.8, base[2] + Math.sin(a) * 1.8], 0.8), 0xfff4fb, M.fur); }
      g.add(S.disc([base[0], base[1] + 0.4, base[2]], [0.3, 1, 0], 5, 0.4), 0xffffff, M.solid);
      clearHead(g, cat);
      return [{ at: 'head', grid: g, ink: 0x401838 }];
    }
    case 'cowboy': {
      const br = 0x9a6a3a;
      const crownS = minus(inter(S.ellipsoid([0, top + 1.6, -0.5], [6.6, 5.4, 7.2]), slabY(top - 1, 99)), S.ellipsoid([0, top + 7.6, -0.5], [1.6, 2.2, 5]));
      const flat = S.disc([0, top - 0.6, -0.5], [0, 1, 0], 11.6, 0.6);
      const curlL = S.capsule([-11, top + 0.6, -6.5], [-11, top + 0.6, 5.5], 1.1);
      const curlR = S.capsule([11, top + 0.6, -6.5], [11, top + 0.6, 5.5], 1.1);
      const g = gridFor(crownS, flat, curlL, curlR);
      g.add(crownS, (x, y) => (y < top + 0.6 ? 0x3a2414 : br), M.solid);
      g.add(flat, (x, y, z) => (Math.hypot(x, z + 0.5) > 10.6 ? tint(br, 0.82) : br), M.solid);
      g.add(curlL, tint(br, 0.85), M.solid); g.add(curlR, tint(br, 0.85), M.solid);
      g.paint(S.box([-2, top - 0.1, 5.9], [2, top + 1.4, 7.6], 0.3), 0xd9a441, M.metal);
      clearHead(g, cat);
      return [{ at: 'head', grid: g, ink: 0x2a1608 }];
    }
    case 'halo': {
      const g = grid([-9, -2, -9], [9, 2, 9]);
      g.add(S.torus([0, 0, 0], [0, 1, 0], 6.6, 1.05), 0xfff1a0, M.glow);
      return [{ at: 'head', grid: g, ink: 0x806010, pivot: [0, top + 7.5, -0.5], anim: 'bob', outline: 0 }];
    }
    case 'crown': {
      const gold = 0xf2c94c;
      const ringO = S.cyl(0, -0.5, 6.4, top - 1.6, top + 2.2), ringI = S.cyl(0, -0.5, 5.4, top - 2, top + 3);
      const pts: Shape[] = [];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 2; pts.push(S.capsule([Math.cos(a) * 5.9, top + 2, -0.5 + Math.sin(a) * 5.9], [Math.cos(a) * 5.4, top + 5.6, -0.5 + Math.sin(a) * 5.4], 1.3, 0.5)); }
      const g = gridFor(ringO, ...pts);
      g.add(minus(ringO, ringI), (x, y) => (y > top + 1.4 ? tint(gold, 1.15) : gold), M.metal);
      for (const p of pts) g.add(p, gold, M.metal);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 2; g.add(S.sphere([Math.cos(a) * 5.5, top + 6, -0.5 + Math.sin(a) * 5.5], 0.95), 0xfff6d0, M.metal); }
      const gems = [0xff3a5a, 0x3af0ff, 0x8cf56b];
      for (let i = 0; i < 3; i++) { const a = Math.PI / 2 + (i - 1) * 0.7; g.add(S.sphere([Math.cos(a) * 6.5, top + 0.3, -0.5 + Math.sin(a) * 6.5], 1.05), gems[i], M.glow); }
      clearHead(g, cat);
      return [{ at: 'head', grid: g, ink: 0x5a3a00 }];
    }
  }
  return [];
}

// ── OUTFITS (body frame + sleeves + helmets) ─────────────────────────────────
function outfit(id: string, cat: boolean): Piece[] {
  const body = bodyShape(cat);
  const yTop = cat ? 20.6 : 19.8;
  const coat = (color: (x: number, y: number, z: number) => number, lo = 2.2, hi = yTop, t1 = 1.25, mat: Mat = M.solid) => {
    const s = inter(shell(body, -0.3, t1), slabY(lo, hi));
    const g = grid([-13, -1, -12], [13, 25, 13]);
    g.add(s, color, mat);
    return g;
  };
  switch (id) {
    case 'labcoat': {
      const w = 0xf4f7f6, seam = 0xc8d2d0;
      const g = coat((x, y, z) => (z > 2 && Math.abs(x) < 0.55 ? seam : w));
      // open front at the bottom (a little V) and lapels
      g.carve(inter(S.box([-1.6, 1, 2], [1.6, 7.5, 12]), (x, y) => Math.abs(x) - (7.5 - y) * 0.28));
      for (const sx of [-1, 1]) g.add(rot(S.box([sx * 0.6, 14.8, 4.6], [sx * 4.2, 18.8, 6.1], 0.4), 0, 0, sx * 0.35, [0, 18, 5]), tint(w, 0.94), M.solid);
      g.add(S.torus([0, yTop - 0.5, 0.4], [0, 1, 0.12], 5.6, 1.3), w, M.solid);
      // chest pocket + pen, buttons
      g.add(S.box([2.2, 11.6, 5.6], [5.6, 14.2, 6.6], 0.3), tint(w, 0.95), M.solid);
      g.add(S.capsule([3.4, 13.2, 6.7], [3.4, 15.8, 6.6], 0.45), 0x3b7bff, M.solid);
      for (const y of [8, 10.6, 13.2]) g.add(S.sphere([-1.2, y, (body.sdf(-1.2, y, 6) < 0 ? 7.2 : 6.6)], 0.6), 0x8a96a0, M.metal);
      clearBody(g, cat);
      return [{ at: 'body', grid: g, ink: 0x5a6a70 }, ...sleeves(cat, () => w, 0x5a6a70, M.solid, tint(w, 0.9))];
    }
    case 'hoodie': {
      const c = 0x3b4a7b, dark = tint(c, 0.8);
      const g = coat((x, y, z) => (y < 3.6 ? dark : c), 2.2, yTop, 1.35, M.fur);
      // kangaroo pocket
      g.add(inter(S.box([-4.6, 5.2, 4], [4.6, 9.6, 9], 0.8), (x, y, z) => shell(body, 1.1, 1.9).sdf(x, y, z)), tint(c, 0.92), M.fur);
      // hood folded behind the neck
      g.add(minus(S.ellipsoid([0, yTop + 0.6, -5.4], [7.6, 4.4, 4.2]), S.ellipsoid([0, yTop + 1.4, -4.2], [5.4, 2.8, 3])), tint(c, 1.08), M.fur);
      // drawstrings with aglets
      for (const sx of [-1, 1]) {
        g.add(S.capsule([sx * 2, yTop - 0.6, 5.8], [sx * 2.3, yTop - 5.2, 7.2], 0.42), 0xf2f2f2, M.solid);
        g.add(S.sphere([sx * 2.3, yTop - 5.6, 7.3], 0.65), 0xc9ced8, M.metal);
      }
      // a little GLOB patch
      g.paint(S.sphere([-3.6, 14.4, 6.6], 1.6), 0x8cf56b, M.glow);
      clearBody(g, cat);
      return [{ at: 'body', grid: g, ink: 0x141a30 }, ...sleeves(cat, () => c, 0x141a30, M.fur, dark)];
    }
    case 'overalls': {
      const den = 0x3d6ab8, stitch = 0xf0c060;
      const g = coat((x, y, z) => ((Math.round(y * 2) % 5 === 0 && Math.abs(x) > 6.5) ? stitch : den), 1.8, 11.4, 1.25);
      g.add(inter(shell(body, -0.3, 1.25), (x, y, z) => Math.max(11.4 - y, y - 16.6, 2.6 - z, Math.abs(x) - 4.6)), (x, y) => (Math.abs(y - 16.2) < 0.3 ? stitch : den), M.solid);
      // bib pocket with stitching
      g.add(inter(S.box([-2.4, 12.2, 4], [2.4, 15.2, 10], 0.3), (x, y, z) => shell(body, 1.1, 1.75).sdf(x, y, z)), (x, y) => (Math.abs(y - 14.9) < 0.25 ? stitch : tint(den, 1.1)), M.solid);
      // straps over the shoulders
      for (const sx of [-1, 1]) {
        g.add(S.capsule([sx * 3.6, 16.4, 6.3], [sx * 4.2, 19.6, 1], 0.85), den, M.solid);
        g.add(S.capsule([sx * 4.2, 19.6, 1], [sx * 3.6, 12, -6.6], 0.85), den, M.solid);
        g.add(S.sphere([sx * 3.6, 16, 7], 0.9), 0xe8b73a, M.metal);
      }
      clearBody(g, cat);
      return [{ at: 'body', grid: g, ink: 0x14244a }];
    }
    case 'hazmat': {
      const y = 0xffd23a;
      const g = coat((x, yy, z) => {
        if (yy > 6 && yy < 7.8) return Math.floor((x + yy) * 0.9) % 2 === 0 ? 0x1b1c22 : y; // hazard band
        if (Math.abs(yy - 9.8) < 0.5) return 0xc9ced8; // reflective stripe
        return y;
      }, 1.6, yTop, 1.5);
      g.add(S.torus([0, yTop - 0.4, 0.4], [0, 1, 0.12], 5.8, 1.5), tint(y, 0.9), M.solid);
      // chest ID tag
      g.add(S.box([-5.2, 12.4, 5.4], [-1.8, 15, 6.6], 0.25), 0xffffff, M.solid);
      g.paint(S.box([-4.8, 14.1, 6.4], [-2.2, 14.6, 6.8]), 0xe23b5a);
      clearBody(g, cat);
      // respirator over the mouth (head frame)
      const r = grid([-8, -18, 8], [8, -4, 22]);
      const mz = (headSurfZ(cat, 0, -10.5) ?? 13) + 1.6;
      r.add(S.ellipsoid([0, -10.4, mz - 0.5], [4.6, 3.4, 2.4]), 0x2a2d36, M.solid);
      for (const sx of [-1, 1]) {
        r.add(S.disc([sx * 4.6, -11.2, mz - 0.6], [sx * 0.8, -0.2, 0.6], 2.3, 1.2), 0x5a5f6a, M.metal);
        r.add(S.disc([sx * 5.4, -11.4, mz + 0.1], [sx * 0.8, -0.2, 0.6], 1.6, 0.4), 0xe23b5a, M.solid);
      }
      r.carve(grow(headShape(cat), -0.2));
      return [{ at: 'body', grid: g, ink: 0x6a4a00 }, { at: 'head', grid: r, ink: 0x0a0a10 }, ...sleeves(cat, () => y, 0x6a4a00, M.solid, 0x1b1c22)];
    }
    case 'cape': {
      const red = 0xd8303a, lining = 0x5a0f1c;
      const len = cat ? 17 : 16;
      const cloth: Shape = {
        sdf: (x, y, z) => {
          const t = Math.max(0, Math.min(1, -y / len));
          const w = 5.2 + t * 4.4, zc = -0.6 - t * 3.2 - Math.sin(t * Math.PI) * 0.8;
          return Math.max(Math.abs(z - zc) - 0.55, Math.abs(x) - w + Math.sin(y * 0.9) * 0.3, y - 0.3, -len - y);
        },
        box: [-11, -len - 1, -6, 11, 1, 1],
      };
      const g = grid([-11, -len - 1, -6], [11, 1.5, 1.5]);
      g.add(cloth, (x, y, z) => (z > -0.6 - Math.max(0, Math.min(1, -y / len)) * 3.2 ? lining : red), M.fur);
      // clasp at the front of the neck (body frame)
      const cl = grid([-6, 16, 2], [6, 22, 9]);
      for (const sx of [-1, 1]) cl.add(S.disc([sx * 3.2, yTop - 1.4, 5.2], [sx * 0.3, 0.2, 1], 1.5, 0.6), 0xf2c94c, M.metal);
      cl.add(S.capsule([-3.2, yTop - 1.4, 5.4], [3.2, yTop - 1.4, 5.4], 0.35), 0xf2c94c, M.metal);
      return [
        { at: 'body', grid: g, ink: 0x3a0610, pivot: [0, yTop - 0.6, cat ? -6.6 : -5.6], anim: 'sway' },
        { at: 'body', grid: cl, ink: 0x5a3a00, outline: 1 },
      ];
    }
    case 'tuxedo': {
      const blk = 0x1d1f27, shirt = 0xf6f6f6;
      const g = coat((x, y, z) => (z > 2.4 && y > 7 && Math.abs(x) < (y - 7) * 0.42 + 0.4 ? shirt : blk), 2.2, yTop, 1.3);
      // satin lapels
      for (const sx of [-1, 1]) g.add(rot(S.box([sx * 0.9, 12.6, 5.4], [sx * 3.6, 18.4, 6.6], 0.35), 0, 0, sx * 0.42, [0, 18, 6]), 0x2e3140, M.gloss);
      for (const y of [9.6, 12]) g.add(S.sphere([0, y, (headSurfZ(false, 0, 0) ?? 0) * 0 + 7.1], 0.55), 0x1b1c22, M.gloss);
      // bow tie
      for (const sx of [-1, 1]) g.add(S.ellipsoid([sx * 1.9, yTop - 1.2, 5.6], [1.9, 1.3, 0.9]), 0x14151a, M.gloss);
      g.add(S.sphere([0, yTop - 1.2, 5.9], 0.85), 0x14151a, M.gloss);
      // tails at the back
      for (const sx of [-1, 1]) g.add(rot(S.box([sx * 0.4, 0.4, -7.6], [sx * 4, 6, -6.3], 0.4), 0.18, 0, 0, [0, 6, -7]), blk, M.solid);
      clearBody(g, cat);
      return [{ at: 'body', grid: g, ink: 0x000000 }, ...sleeves(cat, () => blk, 0x000000, M.solid, shirt)];
    }
    case 'spacesuit': {
      const wht = 0xeef2f6, org = 0xff8a3d;
      const g = coat((x, y, z) => (Math.abs(y - 4.4) < 0.8 ? org : Math.abs(x) > 6.2 && Math.abs(y - 12) < 0.6 ? org : wht), 1.6, yTop, 1.5);
      // chest control box
      g.add(S.box([-3.4, 9.2, 5.6], [3.4, 13.4, 8.4], 0.6), 0xd5dbe2, M.metal);
      const btn = [0xff3a5a, 0x8cf56b, 0x52f2ff, 0xffe14d];
      btn.forEach((c, i) => g.add(S.sphere([-2.1 + i * 1.4, 12, 8.4], 0.55), c, M.glow));
      g.add(S.box([-2.4, 9.8, 8.1], [2.4, 11, 8.6], 0.2), 0x0b1a10, M.gloss);
      // neck ring
      g.add(S.torus([0, yTop - 0.2, 0.4], [0, 1, 0.1], 7, 1.5), 0xb8c0ca, M.metal);
      // backpack life support
      g.add(S.box([-5.6, 6.5, -11], [5.6, 17, -6.4], 1.2), wht, M.solid);
      g.add(S.cyl(-3, -9.2, 1, 17, 19.2), 0xb8c0ca, M.metal);
      clearBody(g, cat);
      // the glass bubble helmet (head frame) with antenna ports
      const hR = cat ? 21.5 : 20.8;
      const h = grid([-23, -23, -23], [23, 23, 23]);
      h.add(shell(S.sphere([0, 0.8, 0.6], hR), -0.45, 0.45), (x, y, z) => (y > 12 && z > 4 && x < -2 && x > -10 ? 0xffffff : 0xcff6ff), M.glass);
      if (cat) for (const e of CAT_EARS) h.carve(S.ellipsoid(e.c, [e.r[0] + 0.5, e.r[1] + 0.5, e.r[2] + 0.5]));
      else for (const c of antennaClearance()) h.carve(S.capsule(c.a, c.b, c.r - 0.3));
      // metal grommets where the antennae pass
      if (!cat) for (const c of antennaClearance()) {
        const dir: V3 = [c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]];
        for (let t = 0; t <= 1; t += 0.05) {
          const p: V3 = [c.a[0] + dir[0] * t, c.a[1] + dir[1] * t, c.a[2] + dir[2] * t];
          if (Math.abs(Math.hypot(p[0], p[1] - 0.8, p[2] - 0.6) - hR) < 0.6) { h.add(S.torus(p, dir, c.r - 0.1, 0.55), 0xb8c0ca, M.metal); break; }
        }
      }
      return [{ at: 'body', grid: g, ink: 0x4a5560 }, { at: 'head', grid: h, ink: 0x6ad8ff, outline: 0 }, ...sleeves(cat, () => wht, 0x4a5560, M.solid, org)];
    }
  }
  return [];
}

// ── ACCESSORIES ──────────────────────────────────────────────────────────────
function accessory(id: string, cat: boolean): Piece[] {
  const yTop = cat ? 20.6 : 19.8;
  switch (id) {
    case 'headphones': {
      const shellC = 0x2a2d3a, cush = 0xff7ad9, neon = 0x8cf56b;
      const R = cat ? 18.6 : 18.4;
      const band = inter(S.torus([0, 0, -5.2], [0, 0, 1], R, 1.15), (x, y) => -y - 1);
      const g = grid([-23, -6, -10], [23, 23, 6]);
      g.add(band, (x, y) => (y > R - 1.6 ? 0x4a4f62 : shellC), M.solid);
      for (const sx of [-1, 1]) {
        const c: V3 = [sx * (cat ? 18.6 : 17.6), -1.4, -1.6];
        g.add(S.disc(c, [1, 0, 0], 5, 1.9), shellC, M.solid);
        g.add(S.disc([c[0] - sx * 1.9, c[1], c[2]], [1, 0, 0], 4.2, 0.8), cush, M.fur);
        g.add(S.torus([c[0] + sx * 1.9, c[1], c[2]], [1, 0, 0], 3, 0.45), neon, M.glow);
        g.add(S.capsule([c[0], c[1] + 4.6, c[2]], [sx * R * 0.96, 4.4, -4.4], 1.0), 0x4a4f62, M.solid);
      }
      clearHead(g, cat, true);
      return [{ at: 'head', grid: g, ink: 0x07080c }];
    }
    case 'bowtie': {
      const red = 0xe23b5a;
      const g = grid([-6, yTop - 4, 2], [6, yTop + 2, 9]);
      const z = cat ? 6.6 : 5.6;
      for (const sx of [-1, 1]) {
        const wing = minus(S.ellipsoid([sx * 2.5, yTop - 1.2, z], [2.6, 1.9, 1.0]), S.ellipsoid([sx * 5.3, yTop - 1.2, z], [1.2, 0.8, 2]));
        g.add(wing, (x, y, zz) => (hash3(Math.floor(x * 1.2), Math.floor(y * 1.2), 0, 9) > 0.78 ? 0xffffff : red), M.solid);
      }
      g.add(S.ellipsoid([0, yTop - 1.2, z + 0.3], [1.1, 1.2, 1]), tint(red, 0.82), M.solid);
      return [{ at: 'body', grid: g, ink: 0x40061a, outline: 1 }];
    }
    case 'scarf': {
      const a = 0xe23b5a, b = 0xfff4e6;
      const ring = S.torus([0, yTop - 1, 0.4], [0, 1, 0.12], cat ? 7.2 : 6.6, 2);
      const tailS = union(S.capsule([-3, yTop - 2, 6.4], [-4.2, yTop - 7.5, 7.8], 1.8, 1.6), S.capsule([-4.2, yTop - 7.5, 7.8], [-4.6, yTop - 10.5, 8.2], 1.6, 1.5));
      const g = gridFor(ring, tailS);
      const st = (x: number, y: number, z: number) => (Math.floor((Math.atan2(z, x) + Math.PI) * 4) % 2 === 0 ? a : b);
      g.add(ring, st, M.fur);
      g.add(tailS, (x, y) => (Math.floor(y * 0.7) % 2 === 0 ? a : b), M.fur);
      for (let i = 0; i < 5; i++) g.add(S.capsule([-5.8 + i * 0.6, yTop - 11.8, 8.2], [-5.9 + i * 0.6, yTop - 13, 8.3], 0.32), b, M.fur);
      clearBody(g, cat);
      return [{ at: 'body', grid: g, ink: 0x4a0612 }];
    }
    case 'glasses': {
      const frame = 0x23252e;
      const eyes: V3[] = cat ? [[-6.9, 0.4, 0], [6.9, 0.4, 0]] : [[-7.8, -1.2, 0], [7.8, -1.2, 0]];
      const R = cat ? 6.4 : 7.2;
      const g = grid([-20, -12, 2], [20, 10, 22]);
      for (const e of eyes) {
        for (let y = e[1] - R - 1; y <= e[1] + R + 1; y += 1 / RES) for (let x = e[0] - R - 1; x <= e[0] + R + 1; x += 1 / RES) {
          const d = Math.hypot(x - e[0], (y - e[1]) * 1.06);
          if (Math.abs(d - R) > 0.75) continue;
          const zs = headSurfZ(cat, x, y);
          if (zs === null || zs < 3) continue;
          for (let dz = 0.5; dz <= 1.9; dz += 1 / RES) g.set(Math.floor(x * RES), Math.floor(y * RES), Math.floor((zs + dz) * RES), d > R ? tint(frame, 1.3) : frame, M.gloss);
        }
        // a little lens glint
        const zs = headSurfZ(cat, e[0] + 3, e[1] + 4) ?? 10;
        g.add(S.capsule([e[0] + 2.2, e[1] + 4.6, zs + 1.3], [e[0] + 3.8, e[1] + 3.2, zs + 1.3], 0.35), 0xffffff, M.glow);
      }
      const bz = (headSurfZ(cat, 0, 1.8) ?? 14) + 1.2;
      g.add(S.capsule([-(eyes[1][0] - R) - 0.3, 1.6, bz], [eyes[1][0] - R + 0.3, 1.6, bz], 0.6), frame, M.gloss);
      for (const sx of [-1, 1]) g.add(S.capsule([sx * (Math.abs(eyes[0][0]) + R - 0.2), 0.8, (headSurfZ(cat, sx * (Math.abs(eyes[0][0]) + R), 0.8) ?? 6) + 1], [sx * 16.6, 1.2, -5], 0.55), frame, M.gloss);
      clearHead(g, cat, true);
      return [{ at: 'head', grid: g, ink: 0x000000, outline: 1 }];
    }
    case 'mustache': {
      const br = 0x3a2418;
      const g = grid([-10, -14, 6], [10, -3, 22]);
      for (const sx of [-1, 1]) {
        const pts: [number, number, number][] = [[0, cat ? -6.6 : -9.1, 1.25], [sx * 2.6, cat ? -7.2 : -9.7, 1.3], [sx * 5, cat ? -6.8 : -9.2, 1.0], [sx * 6.4, cat ? -5.4 : -7.8, 0.75], [sx * 6, cat ? -4.3 : -6.7, 0.55]];
        for (let i = 0; i < pts.length - 1; i++) {
          const [x0, y0, r0] = pts[i], [x1, y1, r1] = pts[i + 1];
          const z0 = (headSurfZ(cat, x0, y0) ?? 13) + (cat ? 2.6 : 0.7), z1 = (headSurfZ(cat, x1, y1) ?? 13) + (cat ? 2.2 : 0.6);
          g.add(S.capsule([x0, y0, z0], [x1, y1, z1], r0, r1), (x, y) => (y > (cat ? -6 : -8.6) ? tint(br, 1.25) : br), M.fur);
        }
      }
      return [{ at: 'head', grid: g, ink: 0x120804, outline: 1 }];
    }
    case 'backpack': {
      const org = 0xff8a3d;
      const g = grid([-8, 2, -15], [8, 22, 4]);
      const bz = cat ? -8.6 : -7.6;
      g.add(S.box([-5.2, 5.6, bz - 4.6], [5.2, 16.8, bz + 0.6], 1.6), (x, y) => (y > 13.6 ? tint(org, 0.86) : org), M.solid);
      g.add(S.box([-3.6, 6.4, bz - 5.8], [3.6, 11.2, bz - 3.6], 1.0), tint(org, 1.08), M.solid);
      g.add(S.capsule([-3.2, 13.6, bz - 4.8], [3.2, 13.6, bz - 4.8], 0.35), 0xc9ced8, M.metal);
      g.add(S.sphere([0, 9, bz - 5.9], 1.2), 0x8cf56b, M.glow);
      for (const sx of [-1, 1]) {
        g.add(S.capsule([sx * 3.6, 16.6, bz + 0.4], [sx * 4.4, yTop - 0.4, 0.6], 0.8), 0x3a3d48, M.solid);
        g.add(S.capsule([sx * 4.4, yTop - 0.4, 0.6], [sx * 4.8, 12, cat ? 7.2 : 6.6], 0.8), 0x3a3d48, M.solid);
      }
      clearBody(g, cat);
      return [{ at: 'body', grid: g, ink: 0x5a2008 }];
    }
    case 'monocle': {
      const gold = 0xe8b73a;
      const e: V3 = cat ? [6.9, 0.4, 0] : [7.8, -1.2, 0];
      const R = cat ? 6.2 : 7;
      const g = grid([-4, -24, 2], [18, 10, 22]);
      for (let y = e[1] - R - 1; y <= e[1] + R + 1; y += 1 / RES) for (let x = e[0] - R - 1; x <= e[0] + R + 1; x += 1 / RES) {
        const d = Math.hypot(x - e[0], y - e[1]);
        if (Math.abs(d - R) > 0.7) continue;
        const zs = headSurfZ(cat, x, y);
        if (zs === null || zs < 2) continue;
        for (let dz = 0.5; dz <= 1.8; dz += 1 / RES) g.set(Math.floor(x * RES), Math.floor(y * RES), Math.floor((zs + dz) * RES), d > R ? tint(gold, 1.2) : gold, M.metal);
      }
      // chain of little links
      for (let i = 0; i < 12; i++) {
        const t = i / 11;
        const p: V3 = [e[0] + 2 + Math.sin(t * 3) * 2.2, e[1] - R - 0.6 - t * 9, 11.4 - t * 1.6];
        g.add(S.sphere(p, 0.55), gold, M.metal);
      }
      return [{ at: 'head', grid: g, ink: 0x4a3008, outline: 1 }];
    }
    case 'jetpack': {
      const met = 0xc8d0da, red = 0xe23b5a;
      const bz = cat ? -10.4 : -9.4;
      const g = grid([-9, 1, -17], [9, 22, 4]);
      for (const sx of [-1, 1]) {
        g.add(S.cyl(sx * 3.3, bz, 2.9, 6.4, 17), (x, y) => (Math.abs(y - 12) < 0.5 ? red : met), M.metal);
        g.add(S.sphere([sx * 3.3, 17, bz], 2.9), red, M.solid);
        g.add(S.cone(sx * 3.3, bz, 3.6, 6.6, 2.1, 2.8), 0x5a5f6a, M.metal);
      }
      g.add(S.box([-1.6, 8, bz - 1.6], [1.6, 15, bz + 2.6], 0.6), 0x5a5f6a, M.metal);
      g.add(S.sphere([0, 13, bz - 1.8], 0.8), 0x8cf56b, M.glow);
      for (const sx of [-1, 1]) g.add(S.capsule([sx * 3.6, 16, bz + 2.6], [sx * 4.4, yTop - 0.4, 0.6], 0.75), 0x3a3d48, M.solid);
      clearBody(g, cat);
      const flames: Piece[] = [-1, 1].map((sx) => {
        const fg = grid([-3, -7, -3], [3, 1, 3]);
        fg.add(S.cone(0, 0, -6.4, 0, 0.3, 2.1), (x, y) => (y > -2 ? 0xfff2a0 : y > -4 ? 0xffa83a : 0xff5a2a), M.glow);
        return { at: 'body' as const, grid: fg, ink: 0, pivot: [sx * 3.3, 3.4, bz] as V3, anim: 'flame' as const, outline: 0 };
      });
      return [{ at: 'body', grid: g, ink: 0x2a3038 }, ...flames];
    }
  }
  return [];
}

// ── HELD ITEMS (grip at the origin, handle along +y) ─────────────────────────
function held(id: Exclude<HandItem, null>): { grid: VoxGrid; ink: number } {
  const g = grid([-8, -5, -6], [8, 16, 6]);
  switch (id) {
    case 'hammer':
      g.add(S.capsule([0, -3.6, 0], [0, 9, 0], 0.95), (x, y) => (y < 1.6 ? 0x2a2d36 : Math.floor(y * 1.5) % 2 ? 0x9a6a3a : 0x8a5a2e), M.solid);
      g.add(S.box([-3.8, 8.4, -1.5], [2.4, 11.4, 1.5], 0.45), 0x8a96a2, M.metal);
      g.add(S.capsule([2.2, 9.9, 0], [4.4, 8.6, 0], 0.8, 0.45), 0x8a96a2, M.metal);
      g.paint(S.box([-3.9, 8.4, -1.6], [-3.2, 11.4, 1.6]), 0xc8d0da);
      return { grid: g, ink: 0x1a1208 };
    case 'wrench':
      g.add(S.box([-0.85, -3.6, -0.5], [0.85, 7.6, 0.5], 0.35), 0xa8b2bd, M.metal);
      g.add(minus(S.disc([0, 9.2, 0], [0, 0, 1], 3, 0.6), union(S.box([-1, 9.4, -2], [1, 13, 2]), S.disc([0, 9.2, 0], [0, 0, 1], 1.1, 2))), 0xa8b2bd, M.metal);
      g.add(minus(S.disc([0, -4.2, 0], [0, 0, 1], 1.9, 0.6), S.disc([0, -4.2, 0], [0, 0, 1], 0.9, 2, 6)), 0xa8b2bd, M.metal);
      return { grid: g, ink: 0x2a3038 };
    case 'magnifier':
      g.add(S.capsule([0, -3.4, 0], [0, 5, 0], 1.05), 0xd8303a, M.solid);
      g.add(S.torus([0, 9.4, 0], [0, 0, 1], 3.9, 0.8), 0xe8b73a, M.metal);
      g.add(S.disc([0, 9.4, 0], [0, 0, 1], 3.3, 0.35), 0xbff6ff, M.glass);
      g.add(S.capsule([-1.6, 11.2, 0.5], [-0.4, 12.2, 0.5], 0.35), 0xffffff, M.glow);
      return { grid: g, ink: 0x3a1008 };
    case 'box': {
      const b = grid([-7, -2, -6], [7, 10, 6]);
      b.add(S.box([-5.4, 0, -4.2], [5.4, 7.6, 4.2], 0.6), (x, y) => (Math.abs(y - 6.6) < 0.5 ? 0xb08a52 : 0xc9a26a), M.solid);
      b.paint(S.box([-0.9, -1, -4.4], [0.9, 8, 4.4]), 0xe8d6a8);                    // tape
      b.add(S.box([-4.4, 2.2, 4.1], [-0.4, 5, 4.5]), 0xffffff, M.solid);              // label
      for (const y of [3, 3.8, 4.5]) b.paint(S.box([-4, y, 4.3], [-1, y + 0.25, 4.7]), 0x8a96a2);
      [0x52f2ff, 0xff6fd6, 0xffe14d].forEach((c, i) => b.add(S.box([-3.6 + i * 2.4, 7.4, -2], [-1.8 + i * 2.4, 9.4, 2], 0.2), c, M.solid));
      return { grid: b, ink: 0x3a2810 };
    }
    case 'mug':
      g.add(minus(S.cyl(0, 0, 2.7, 0, 5.4), S.cyl(0, 0, 2.1, 4.6, 6)), (x, y) => (Math.abs(y - 2.6) < 0.6 ? 0xffffff : 0xff6fd6), M.solid);
      g.add(S.cyl(0, 0, 2.1, 3.8, 4.6), 0x3a1a0a, M.gloss);
      g.add(minus(S.torus([2.9, 2.7, 0], [0, 0, 1], 1.5, 0.55), S.box([-4, -1, -1], [2.5, 6, 1])), 0xff6fd6, M.solid);
      return { grid: g, ink: 0x40102a };
    case 'chalk':
      g.add(S.capsule([0, -1, 0], [0, 3, 0], 0.65), 0xf6f6f6, M.solid);
      return { grid: g, ink: 0x6a7584 };
    case 'clipboard':
      g.add(S.box([-3.8, -1, -0.45], [3.8, 9.4, 0.45], 0.3), 0x8a5a2e, M.solid);
      g.add(S.box([-3.1, -0.4, 0.4], [3.1, 8, 0.75]), 0xfafafa, M.solid);
      for (let i = 0; i < 6; i++) g.paint(S.box([-2.6, 0.8 + i * 1.1, 0.6], [i % 2 ? 1.4 : 2.4, 1.1 + i * 1.1, 0.9]), 0x8a96a2);
      g.paint(S.box([-2.7, 6.3, 0.6], [-1.8, 7.2, 0.9]), 0x8cf56b);
      g.add(S.box([-1.6, 8.4, -0.7], [1.6, 9.9, 1], 0.3), 0xc8d0da, M.metal);
      return { grid: g, ink: 0x2a1608 };
    case 'tablet':
      g.add(S.box([-4.4, -0.6, -0.45], [4.4, 6.2, 0.45], 0.6), 0x23252e, M.gloss);
      g.add(S.box([-3.8, 0, 0.3], [3.8, 5.6, 0.55]), (x, y) => (y > 4.4 ? 0x8cf56b : Math.floor(y * 1.2) % 2 ? 0x2fd0e0 : 0x1a9aa8), M.glow);
      return { grid: g, ink: 0x000000 };
  }
}

// ── build + cache ────────────────────────────────────────────────────────────
function pieces(id: string, cat: boolean): Piece[] {
  return [...hat(id, cat), ...outfit(id, cat), ...accessory(id, cat)];
}

const meshCache = new Map<string, { at: Attach; obj: THREE.Object3D; pivot?: V3; anim?: Piece['anim'] }[]>();

function meshed(id: string, cat: boolean, size: number) {
  const key = `${id}|${cat ? 1 : 0}|${size}`;
  let list = meshCache.get(key);
  if (!list) {
    list = pieces(id, cat).map((p) => {
      const ow = p.outline ?? 2;
      const obj = toObject(p.grid, { size, ao: 0.6, castShadow: true, name: `cos:${id}`, ...(ow > 0 ? { outline: p.ink, outlineWidth: ow } : {}) });
      return { at: p.at, obj, pivot: p.pivot, anim: p.anim };
    });
    meshCache.set(key, list);
  }
  return list;
}

function instance(id: string, cat: boolean, size: number) {
  return meshed(id, cat, size).map((m) => {
    const obj = m.obj.clone(true);
    if (m.pivot) obj.position.set(m.pivot[0] * size, m.pivot[1] * size, m.pivot[2] * size);
    if (m.anim) obj.userData.cosAnim = m.anim;
    obj.userData.cosmetic = id;
    return { at: m.at, obj, pivot: m.pivot };
  });
}

const isCat = (look: AlienLook) => look.skin === 'pounce';

/** Attach the look's hat / outfit / accessory voxel models to the alien. Idempotent. */
export function dressAlien(parts: AlienParts, look: AlienLook): void {
  const prev = (parts.root.userData.cosmetics as THREE.Object3D[] | undefined) ?? [];
  for (const o of prev) o.removeFromParent();
  const added: THREE.Object3D[] = [];
  const cat = isCat(look);
  for (const id of [look.hat, look.outfit, look.accessory]) {
    if (!id) continue;
    for (const { at, obj } of instance(id, cat, parts.size)) {
      const parent = at === 'head' ? parts.head : at === 'armL' ? parts.armL : at === 'armR' ? parts.armR : parts.body;
      parent.add(obj);
      added.push(obj);
    }
  }
  // a glass helmet + a hat would intersect: hide hats under the bubble
  if (look.outfit === 'spacesuit') for (const o of added) if (o.userData.cosmetic === look.hat) o.visible = false;
  parts.root.userData.cosmetics = added;
}

/** A standalone voxel model of a cosmetic (for shop thumbnails / wardrobe racks). */
export function buildCosmetic(id: string): THREE.Object3D {
  const size = DEFAULT_SIZE;
  const g = new THREE.Group(); g.name = `cosmetic:${id}`;
  for (const { at, obj } of instance(id, false, size)) {
    const holder = new THREE.Group();
    holder.add(obj);
    if (at === 'head') holder.position.y = HEAD_Y * size;
    if (at === 'armL') holder.position.set(-ARM_PIVOT.glob[0] * size, ARM_PIVOT.glob[1] * size, ARM_PIVOT.glob[2] * size);
    if (at === 'armR') holder.position.set(ARM_PIVOT.glob[0] * size, ARM_PIVOT.glob[1] * size, ARM_PIVOT.glob[2] * size);
    g.add(holder);
  }
  return g;
}

const heldCache = new Map<string, THREE.Object3D>();
/** A voxel model of a held tool, origin at the grip. */
export function buildHeldItem(id: Exclude<HandItem, null>): THREE.Object3D {
  let proto = heldCache.get(id);
  if (!proto) {
    const { grid: g, ink } = held(id);
    // tools read a touch chunkier than life so they're legible in the aliens' stubby hands
    proto = toObject(g, { size: DEFAULT_SIZE * 1.4, ao: 0.6, outline: ink, outlineWidth: 1, castShadow: true, name: `held:${id}` });
    heldCache.set(id, proto);
  }
  const o = proto.clone(true);
  o.userData.held = id;
  return o;
}

/** Animate cosmetic parts that move on their own (propeller, cape, halo, jet flames). */
export function animateCosmetics(root: THREE.Object3D, t: number, dt: number, speed = 1): void {
  root.traverse((o) => {
    const a = o.userData.cosAnim as Piece['anim'] | undefined;
    if (!a) return;
    if (a === 'spin') o.rotation.y += dt * 9 * speed;
    else if (a === 'sway') o.rotation.x = 0.12 + Math.sin(t * 2.1) * 0.08 * speed + Math.min(0.35, speed * 0.1);
    else if (a === 'bob') { o.rotation.y += dt * 1.2; o.position.y = (o.userData.baseY ??= o.position.y) + Math.sin(t * 2.4) * 0.012; }
    else if (a === 'flame') { const k = 0.8 + Math.sin(t * 31 + o.id) * 0.12 + Math.sin(t * 17) * 0.08; o.scale.set(1, k, 1); }
  });
}
