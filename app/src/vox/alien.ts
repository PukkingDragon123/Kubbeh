// ─────────────────────────────────────────────────────────────────────────────
// The GLOB alien — high-resolution voxel model after the user's reference:
// big round head with a light-green→teal gradient, two huge tilted glossy-black eyes
// with white highlight voxels, a tiny mouth, two antenna stalks ending in octagonal
// discs (pink left, blue right), a tiny body with stubby arms and feet, and a dark
// green inked outline. Every expression is sculpted in voxels on the face layer.
//
// Also builds the Snow Pounce kitten (the user's snow leopard) and the other skins.
// Units: voxels. World scale = `size` per voxel (default ~0.016 → ~1 world unit tall).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { AlienLook, Expression } from '../core/types';
import { M, S, VoxGrid, fbm, hash3, hex, mix, shade, smoothUnion, noise3, type V3 } from './core';
import { materials, outlineMaterial, toObject } from './mesh';

export type Face = Expression | 'blink';
export const FACES: Face[] = ['happy', 'derp', 'sleepy', 'wink', 'shocked', 'cry', 'tongue', 'focused', 'love', 'grumpy', 'blink'];

export interface AlienParts {
  root: THREE.Group;
  /** squash/stretch pivot at the feet */
  jelly: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group; armR: THREE.Group;
  legL: THREE.Group; legR: THREE.Group;
  antL: THREE.Group | null; antR: THREE.Group | null;
  tail: THREE.Group | null;
  faces: Map<Face, THREE.Object3D>;
  /** attachment anchors for cosmetics & held items (world-space children of the right parts) */
  anchors: { hat: THREE.Group; face: THREE.Group; neck: THREE.Group; back: THREE.Group; handR: THREE.Group; handL: THREE.Group; torso: THREE.Group };
  setFace(f: Face): void;
  /** world units per voxel */
  size: number;
  /** total height in world units (feet → antenna tips) */
  height: number;
  dispose(): void;
}

// ── palette per skin ─────────────────────────────────────────────────────────
interface Pal {
  top: number; mid: number; bot: number; belly: number; ink: number;
  skinMat: number; cat?: boolean; bumps?: boolean; ghost?: boolean; magma?: boolean; stars?: boolean;
  eye: number; eyeMat: number;
}
function palette(look: AlienLook): Pal {
  const body = hex(look.body);
  const base = (mid: number, extra: Partial<Pal> = {}): Pal => ({
    top: mix(mid, 0xc8ff9a, 0.38), mid: mix(mid, 0x4fb86a, 0.35), bot: mix(mid, 0x14806e, 0.72), belly: mix(mid, 0xffffff, 0.12),
    ink: shade(mix(mid, 0x0a3a1a, 0.55), 0.42), skinMat: M.jelly, eye: 0x07090c, eyeMat: M.gloss, ...extra,
  });
  switch (look.skin) {
    case 'pounce': return { top: 0xf4f6f8, mid: 0xe2e7ec, bot: 0xc9d0d8, belly: 0xffffff, ink: 0x3a3f48, skinMat: M.fur, cat: true, eye: 0x101116, eyeMat: M.gloss };
    case 'pickle': return base(0x5f9a2e, { bumps: true, top: 0x8cc04a, bot: 0x3f6e1c });
    case 'bubblegum': return base(0xff8fd0, { top: 0xffc4e8, bot: 0xd9559e, ink: 0x6a1a48 });
    case 'ghost': return base(0x7ff0ff, { top: 0xd8fdff, bot: 0x3fb8d8, ink: 0x0f4a66, ghost: true });
    case 'magma': return base(0x3a1810, { top: 0x5a2618, bot: 0x220c08, ink: 0x120604, magma: true });
    case 'void': return base(0x2a1650, { top: 0x45287a, bot: 0x160a30, ink: 0x0a0418, stars: true });
    case 'gold': return base(0xe8b73a, { top: 0xfff0a8, bot: 0xb07a18, ink: 0x4a3008, skinMat: M.metal });
    default: return base(body);
  }
}

// ── geometry constants (voxels) ──────────────────────────────────────────────
export const HEAD_R: V3 = [17, 16, 15.5];
export const HEAD_Y = 34;     // head centre above the feet
const FACE_DEPTH = 4;         // face layer thickness in voxels (expressions swap this)
/** Voxels per model unit for aliens — the detail level. */
export const ALIEN_RES = 1.6;

// ── 2D face drawing helpers (face coords: x right, y up, origin = head centre) ──
function ell(x: number, y: number, cx: number, cy: number, rx: number, ry: number, rot = 0) {
  const dx = x - cx, dy = y - cy, c = Math.cos(rot), s = Math.sin(rot);
  const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry;
  return { u, v, d: u * u + v * v };
}
function heart(x: number, y: number, cx: number, cy: number, s: number) {
  const X = (x - cx) / s, Y = (y - cy) / s + 0.25;
  const a = X * X + Y * Y - 1;
  return a * a * a - X * X * Y * Y * Y <= 0;
}

type Px = 'skin' | 'eye' | 'hi' | 'mouth' | 'tongue' | 'tear' | 'blush' | 'heart' | 'lid' | 'nose' | 'white';

interface EyeSpec { cx: number; cy: number; rx: number; ry: number; rot: number }
const EYE_R: EyeSpec = { cx: 7.8, cy: -1.4, rx: 6.0, ry: 9.4, rot: -0.48 };
const EYE_L: EyeSpec = { cx: -7.8, cy: -1.4, rx: 6.0, ry: 9.4, rot: 0.48 };
const CAT_R: EyeSpec = { cx: 7.3, cy: 0.8, rx: 4.9, ry: 5.5, rot: -0.24 };
const CAT_L: EyeSpec = { cx: -7.3, cy: 0.8, rx: 4.9, ry: 5.5, rot: 0.24 };

/** the open almond eye with highlights (light from the upper right for both eyes). */
function openEye(x: number, y: number, e: EyeSpec, k = 1, hiScale = 1): Px | null {
  const { d, v } = ell(x, y, e.cx, e.cy, e.rx * k, e.ry * k * (1 + 0.04 * Math.sign(0)), e.rot);
  // egg: slightly fuller at the top
  const dd = v > 0 ? d * 0.94 : d * 1.04;
  if (dd > 1) return null;
  const big = ell(x, y, e.cx + 1.9 * k, e.cy + 3.6 * k, 2.15 * k * hiScale, 2.7 * k * hiScale, -0.3).d;
  if (big <= 1) return 'hi';
  const small = ell(x, y, e.cx + 1.25 * k, e.cy - 3.1 * k, 1.05 * k * hiScale, 1.05 * k * hiScale).d;
  if (small <= 1) return 'hi';
  return 'eye';
}

/** closed eye: a curved line (smile-shaped ^ when up=true) */
function closedEye(x: number, y: number, e: EyeSpec, up = true): Px | null {
  const { u, v, d } = ell(x, y, e.cx, e.cy + (up ? -1 : 2), e.rx * 1.05, e.ry * 0.62, e.rot * 0.4);
  if (up ? v < 0 : v > 0) return null;
  return d >= 0.62 && d <= 1.0 && Math.abs(u) < 1 ? 'eye' : null;
}

function mouthDot(x: number, y: number): Px | null {
  return ell(x, y, 0.4, -11.2, 1.4, 0.9).d <= 1 ? 'mouth' : null;
}
function smile(x: number, y: number, w = 3.2, cy = -10.6): Px | null {
  const { d, v } = ell(x, y, 0.3, cy + 1.2, w, 2.0);
  return v < 0 && d >= 0.45 && d <= 1.05 ? 'mouth' : null;
}

/** what is painted at face coordinate (x,y) for an expression */
function facePixel(face: Face, x: number, y: number, cat: boolean): Px | null {
  const R = cat ? CAT_R : EYE_R, L = cat ? CAT_L : EYE_L;
  const both = (fn: (e: EyeSpec) => Px | null) => fn(R) ?? fn(L);
  let p: Px | null = null;

  switch (face) {
    case 'happy': p = both((e) => openEye(x, y, e)); break;
    case 'blink': p = both((e) => closedEye(x, y, e, false)); break;
    case 'focused': p = both((e) => {
      const o = openEye(x, y, e, 0.96, 0.7); if (!o) return null;
      const { v } = ell(x, y, e.cx, e.cy, e.rx, e.ry, e.rot);
      if (v > 0.42) return v < 0.58 ? 'lid' : 'skin';
      return o;
    }); break;
    case 'sleepy': p = both((e) => {
      const o = openEye(x, y, e, 0.95, 0.6); if (!o) return null;
      const { v } = ell(x, y, e.cx, e.cy, e.rx, e.ry, e.rot);
      if (v > -0.05) return v < 0.12 ? 'lid' : 'skin';
      return o === 'hi' ? 'eye' : o;
    }); break;
    case 'wink': p = openEye(x, y, L) ?? closedEye(x, y, R, true); break;
    case 'shocked': p = both((e) => {
      const r = { ...e, rx: e.rx * 1.08, ry: e.ry * 0.9, rot: e.rot * 0.4 };
      const { d } = ell(x, y, r.cx, r.cy, r.rx, r.ry, r.rot); if (d > 1) return null;
      if (ell(x, y, r.cx + 1.4, r.cy + 2.6, 1.3, 1.6).d <= 1) return 'hi';
      return 'eye';
    }); break;
    case 'cry': p = both((e) => openEye(x, y, e, 1.02, 1.35)); break;
    case 'tongue': p = both((e) => closedEye(x, y, e, true)); break;
    case 'love': p = both((e) => heart(x, y, e.cx, e.cy + 0.5, e.rx * (cat ? 0.82 : 0.98)) ? (ell(x, y, e.cx + 1.6, e.cy + 2.6, 1.1, 1.1).d <= 1 ? 'white' : 'heart') : null); break;
    case 'grumpy': p = both((e) => {
      const o = openEye(x, y, e, 0.95, 0.8); if (!o) return null;
      const inner = e.cx > 0 ? -1 : 1; // toward the nose
      const cut = e.cy + 3.2 + (x - e.cx) * inner * -0.55;
      if (y > cut) return y < cut + 1.1 ? 'lid' : 'skin';
      return o;
    }); break;
    case 'derp': {
      const big = { ...L, rx: L.rx * 1.12, ry: L.ry * 1.08 };
      const small = { ...R, rx: R.rx * 0.78, ry: R.ry * 0.78, cy: R.cy + 1.5 };
      p = openEye(x, y, big) ?? openEye(x, y, small, 1, 0.7);
      break;
    }
  }
  if (p) return p;

  // mouths / extras
  if (cat) {
    // pink nose + little "w" mouth live on the muzzle (built separately); blush only
    if (face === 'love') { if (ell(x, y, -12.2, -5.5, 2.2, 1.2).d <= 1 || ell(x, y, 12.2, -5.5, 2.2, 1.2).d <= 1) return 'blush'; }
    if (face === 'cry' && (Math.abs(x - 7.2) < 1 || Math.abs(x + 7.2) < 1) && y < -5 && y > -13) return 'tear';
    return null;
  }
  switch (face) {
    case 'happy': case 'focused': case 'sleepy': case 'blink': return mouthDot(x, y);
    case 'wink': case 'love': return smile(x, y);
    case 'derp': { const wob = -11 + Math.sin(x * 1.3) * 0.7; return Math.abs(y - wob) < 0.6 && Math.abs(x) < 3.2 ? 'mouth' : null; }
    case 'shocked': { const e = ell(x, y, 0.3, -11.4, 2.0, 2.6); return e.d <= 1 ? (e.d > 0.45 ? 'mouth' : 'mouth') : null; }
    case 'grumpy': return Math.abs(y + 11) < 0.55 && Math.abs(x - 0.2) < 2.6 ? 'mouth' : null;
    case 'tongue': {
      const o = ell(x, y, 0.3, -10.6, 3.0, 2.2);
      if (o.d <= 1 && o.v < 0.1) return ell(x, y, 0.3, -12.0, 1.9, 1.6).d <= 1 ? 'tongue' : 'mouth';
      if (ell(x, y, 0.3, -12.6, 1.8, 1.8).d <= 1) return 'tongue';
      return null;
    }
    case 'cry': {
      if ((Math.abs(x - 9.4) < 0.9 || Math.abs(x + 9.4) < 0.9) && y < -8.5 && y > -15) return 'tear';
      const { d, v } = ell(x, y, 0.3, -12.4, 2.6, 1.8); return v > 0 && d >= 0.45 && d <= 1.05 ? 'mouth' : null;
    }
  }
  // two faint shine dots between the eyes (from the reference)
  return null;
}

// ── shared geometry for cosmetics (model units) ──────────────────────────────
/** The head's outer surface (head-centred frame). Cat heads are a bit wider with cheeks. */
export function headShape(cat: boolean) {
  if (!cat) return S.ellipsoid([0, 0, 0], HEAD_R);
  let s = smoothUnion(S.ellipsoid([0, 0, 0], [17.5, 15.4, 15.6]), S.ellipsoid([-10.5, -6.4, 4.5], [7.2, 6.4, 7.6]), 3.5);
  return smoothUnion(s, S.ellipsoid([10.5, -6.4, 4.5], [7.2, 6.4, 7.6]), 3.5);
}
/** The body's outer surface (feet-origin frame). */
export function bodyShape(cat: boolean) {
  return cat
    ? smoothUnion(S.ellipsoid([0, 11.5, 0], [8.6, 9.6, 7.6]), S.ellipsoid([0, 5.2, 0.4], [9.4, 5.2, 8]), 3.2)
    : smoothUnion(S.ellipsoid([0, 11, 0], [7.6, 9, 6.8]), S.ellipsoid([0, 5.5, 0.5], [8.2, 5, 7]), 3);
}
/** Antenna stalk keep-out capsules in the head frame (hats carve these so they never clip). */
export function antennaClearance(): { a: V3; b: V3; r: number }[] {
  const out: { a: V3; b: V3; r: number }[] = [];
  for (const sx of [-1, 1]) {
    const th = -sx * 0.28, c = Math.cos(th), s = Math.sin(th);
    const tf = (x: number, y: number, z: number): V3 => [x * c - y * s + sx * 7.2, x * s + y * c + 13.2, z - 1.5];
    const p0 = tf(0, 0, 0), p1 = tf(sx * 1.2, 6, 0.2), p2 = tf(sx * 3.2, 11.5, 0.5);
    out.push({ a: p0, b: p1, r: 2.6 }, { a: p1, b: p2, r: 2.5 });
  }
  return out;
}
/** Cat ear keep-out ellipsoids in the head frame. */
export const CAT_EARS: { c: V3; r: V3 }[] = [{ c: [-10.4, 12.6, -2.2], r: [6.2, 6, 3.4] }, { c: [10.4, 12.6, -2.2], r: [6.2, 6, 3.4] }];
/** where the arm pivots sit (feet-origin frame), for sleeves */
export const ARM_PIVOT = { glob: [6.4, 14.5, 3] as V3, cat: [7.4, 15.2, 2.6] as V3 };

// ── part builders ────────────────────────────────────────────────────────────
function headColor(p: Pal, x: number, y: number, z: number) {
  const t = (y + HEAD_R[1]) / (HEAD_R[1] * 2); // 0 bottom → 1 top
  let c = t > 0.5 ? mix(p.mid, p.top, (t - 0.5) / 0.5) : mix(p.bot, p.mid, Math.pow(t / 0.5, 0.8));
  if (p.cat) c = catFur(p, x, y, z, 'head');
  if (p.bumps && hash3(x >> 1, y >> 1, z >> 1, 7) > 0.86) c = shade(c, 1.12);
  return c;
}

// ── Snow-leopard fur ─────────────────────────────────────────────────────────
// Clean, structured pattern (no noise speckle): rosettes are broken dark rings with a
// smoky centre laid out on a jittered 3D grid; the forehead and limbs get small solid
// spots; muzzle, chest and paws stay snow white.
const FUR_HI = 0xf3f5f7, FUR_MID = 0xe2e6ea, FUR_LO = 0xc9cfd6, ROSETTE = 0x2a2b31, SMOKE = 0xaeb5bf, SPOT = 0x34353c;

function nearestCell(x: number, y: number, z: number, cell: number, seed: number, ax = 1, ay = 1, az = 1) {
  const ci = Math.floor(x / cell), cj = Math.floor(y / cell), ck = Math.floor(z / cell);
  let best = Infinity, bx = 0, by = 0, bz = 0, bh = 0;
  for (let k = ck - 1; k <= ck + 1; k++) for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    const h = hash3(i, j, k, seed);
    const cx = (i + 0.2 + 0.6 * h) * cell, cy = (j + 0.2 + 0.6 * hash3(i, j, k, seed + 1)) * cell, cz = (k + 0.2 + 0.6 * hash3(i, j, k, seed + 2)) * cell;
    const d = ((x - cx) * ax) ** 2 + ((y - cy) * ay) ** 2 + ((z - cz) * az) ** 2;
    if (d < best) { best = d; bx = cx; by = cy; bz = cz; bh = h; }
  }
  return { d: Math.sqrt(best), dx: x - bx, dy: y - by, dz: z - bz, h: bh };
}

/** rosette at a point: 'ring' | 'smoke' | null */
function rosette(x: number, y: number, z: number, cell: number, seed = 31): 'ring' | 'smoke' | null {
  const n = nearestCell(x, y, z, cell, seed);
  const R = cell * (0.3 + 0.12 * n.h);
  if (n.d > R) return null;
  if (n.d > R * 0.6) {
    // broken ring: 3–4 dark petals
    const a = Math.atan2(n.dy, n.dx + n.dz * 0.6);
    return Math.sin(a * (3 + Math.floor(n.h * 2)) + n.h * 9) > -0.55 ? 'ring' : null;
  }
  return 'smoke';
}
function spot(x: number, y: number, z: number, cell: number, r: number, seed = 47, ax = 1, ay = 1, az = 1) {
  const n = nearestCell(x, y, z, cell, seed, ax, ay, az);
  return n.d < cell * r * (0.75 + 0.5 * n.h);
}


// Surface-placed markings: centres are Poisson-sampled ON the part's surface so every
// rosette slices into a clean ring (no partial specks), each with its own C-gap angle.
interface Mark { c: V3; n: V3; r: number; gap: number }
function sampleEllipsoid(c: V3, r: V3, count: number, minDist: number, seed: number, keep: (p: V3, n: V3) => boolean, rMin: number, rMax: number): Mark[] {
  const out: Mark[] = [];
  for (let i = 0; i < count * 40 && out.length < count; i++) {
    const u = hash3(i, 1, seed) * 2 - 1, th = hash3(i, 2, seed) * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const d: V3 = [s * Math.cos(th), u, s * Math.sin(th)];
    const p: V3 = [c[0] + d[0] * r[0], c[1] + d[1] * r[1], c[2] + d[2] * r[2]];
    const nn: V3 = [d[0] / r[0], d[1] / r[1], d[2] / r[2]];
    const nl = Math.hypot(nn[0], nn[1], nn[2]); const n: V3 = [nn[0] / nl, nn[1] / nl, nn[2] / nl];
    if (!keep(p, n)) continue;
    if (out.some((m) => Math.hypot(m.c[0] - p[0], m.c[1] - p[1], m.c[2] - p[2]) < minDist)) continue;
    out.push({ c: p, n, r: rMin + hash3(i, 3, seed) * (rMax - rMin), gap: hash3(i, 4, seed) * Math.PI * 2 });
  }
  return out;
}
function nearestMark(marks: Mark[], x: number, y: number, z: number) {
  let best: Mark | null = null, bd = Infinity;
  for (const m of marks) { const d = (x - m.c[0]) ** 2 + (y - m.c[1]) ** 2 + (z - m.c[2]) ** 2; if (d < bd) { bd = d; best = m; } }
  return best ? { m: best, d: Math.sqrt(bd) } : null;
}
/** open ring / broken-C rosette with a smoky centre */
function rosetteAt(marks: Mark[], x: number, y: number, z: number): 'ring' | 'smoke' | null {
  const hit = nearestMark(marks, x, y, z);
  if (!hit || hit.d > hit.m.r) return null;
  if (hit.d < hit.m.r * 0.56) return 'smoke';
  const { m } = hit;
  const up: V3 = Math.abs(m.n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const ux = up[1] * m.n[2] - up[2] * m.n[1], uy = up[2] * m.n[0] - up[0] * m.n[2], uz = up[0] * m.n[1] - up[1] * m.n[0];
  const ul = Math.hypot(ux, uy, uz) || 1;
  const vx = m.n[1] * uz - m.n[2] * uy, vy = m.n[2] * ux - m.n[0] * uz, vz = m.n[0] * uy - m.n[1] * ux;
  const dx = x - m.c[0], dy = y - m.c[1], dz = z - m.c[2];
  const a = Math.atan2((dx * vx + dy * vy + dz * vz) / ul, (dx * ux + dy * uy + dz * uz) / ul);
  return Math.cos(a - m.gap) > 0.7 ? null : 'ring'; // one open side → a C
}
let BODY_MARKS: Mark[] | null = null, HEAD_DOTS: Mark[] | null = null, TAIL_MARKS: Mark[] | null = null;
function bodyMarks() {
  return (BODY_MARKS ??= sampleEllipsoid([0, 11.5, 0], [8.6, 9.6, 7.6], 34, 4.3, 101,
    (p) => !(p[2] > 2.5 && Math.abs(p[0]) < 6 && p[1] < 18) && p[1] > 2.5, 1.15, 1.85));
}
function headDots() {
  if (HEAD_DOTS) return HEAD_DOTS;
  const crown = sampleEllipsoid([0, 0, 0], [17.5, 15.4, 15.6], 60, 2.2, 202, (p) => p[1] > 5.5 && p[2] > -3 && Math.hypot(p[0] / 11, (p[1] - 11) / 7) < 1, 0.78, 1.0);
  const rest = sampleEllipsoid([0, 0, 0], [17.5, 15.4, 15.6], 34, 4.2, 203, (p) => (p[2] < 6 || Math.abs(p[0]) > 14) && p[1] > -9 && !(p[1] > 5.5 && p[2] > -3 && Math.abs(p[0]) < 11), 0.9, 1.25);
  return (HEAD_DOTS = [...crown, ...rest]);
}

type FurRegion = 'head' | 'body' | 'limb' | 'tail' | 'ear';
/** Snow-leopard fur colour. Coordinates in the PART's own frame (head: head-centred). */
function catFur(p: Pal, x: number, y: number, z: number, region: FurRegion = 'body'): number {
  void p;
  const shadeY = (lo: number, hi: number, t: number) => mix(lo, hi, Math.max(0, Math.min(1, t)));
  if (region === 'head') {
    const base = shadeY(0xcdd3da, FUR_HI, (y + 8) / 24);
    const front = z > 7.5;
    // white muzzle, cheeks and chin — never spotted
    if (front && y < -2.6 && Math.abs(x) < 12.5) return mix(FUR_HI, 0xffffff, 0.65);
    // soft grey mask down the nose bridge
    if (front && y < 6 && y > -2.6 && Math.abs(x) < 2.6) return mix(0xc9cfd6, base, Math.abs(x) / 2.6);
    // clean round dots: a dense cluster on the crown, sparser round the sides/back
    const hit = nearestMark(headDots(), x, y, z);
    if (hit && hit.d < hit.m.r) return SPOT;
    return base;
  }
  if (region === 'body') {
    const base = shadeY(FUR_LO, FUR_MID, y / 18);
    if (z > 2.5 && Math.abs(x) < 6 && y < 18) return mix(FUR_HI, 0xffffff, 0.7); // white chest & belly
    const r = rosetteAt(bodyMarks(), x, y, z);
    if (r === 'ring') return 0x3a3b42; if (r === 'smoke') return mix(base, 0xa9b0b9, 0.6);
    return base;
  }
  if (region === 'limb') return FUR_MID;
  if (region === 'ear') return FUR_MID;
  return FUR_MID;
}

function buildHead(p: Pal, look: AlienLook) {
  const g = VoxGrid.span([-22, -22, -22], [22, 26, 22], ALIEN_RES);
  const col = (x: number, y: number, z: number) => headColor(p, x, y, z);
  if (p.cat) {
    const fur = (x: number, y: number, z: number) => catFur(p, x, y, z, 'head');
    // a round fluffy kitten head with chubby cheeks melted in
    let shape = smoothUnion(S.ellipsoid([0, 0, 0], [17.5, 15.4, 15.6]), S.ellipsoid([-10.5, -6.4, 4.5], [7.2, 6.4, 7.6]), 3.5);
    shape = smoothUnion(shape, S.ellipsoid([10.5, -6.4, 4.5], [7.2, 6.4, 7.6]), 3.5);
    g.add(shape, fur, M.fur);
    // cheek fluff tufts along the jaw line
    for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) {
      const a = -0.25 - i * 0.16;
      const c: V3 = [sx * (16.4 + Math.sin(i) * 0.4) * Math.cos(a * 0.6), -6 + Math.sin(a) * 6, 3.5 - i * 0.6];
      g.add(S.cone(c[0], c[2], c[1] - 1.4, c[1] + 1.4, 1.6, 0.4), fur, M.fur);
    }
    // round ears: dark backs, pale fuzzy fronts with a pink-grey heart
    for (const sx of [-1, 1]) {
      const c: V3 = [sx * 10.4, 12.6, -2.2];
      g.add(S.ellipsoid(c, [5.6, 5.4, 2.8]), (x, y, z) => (z < c[2] - 0.4 ? ROSETTE : y > c[1] + 3.8 ? ROSETTE : FUR_MID), M.fur);
      g.paint(S.ellipsoid([c[0], c[1] - 0.4, c[2] + 1.9], [3.4, 3.4, 1.4]), 0xd9b4bc, M.fur);
      g.paint(S.ellipsoid([c[0], c[1] - 1.2, c[2] + 2.3], [2, 2, 1]), 0xf2e6e9, M.fur);
    }
  } else {
    const head = S.ellipsoid([0, 0, 0], HEAD_R);
    g.add(head, col, p.skinMat as any);
    if (p.bumps) for (let i = 0; i < 70; i++) {
      const a = hash3(i, 1, 2) * Math.PI * 2, b = (hash3(i, 3, 4) - 0.3) * Math.PI;
      const c: V3 = [Math.cos(a) * Math.cos(b) * HEAD_R[0], Math.sin(b) * HEAD_R[1], Math.sin(a) * Math.cos(b) * HEAD_R[2]];
      if (c[2] > 6 && Math.abs(c[1]) < 9) continue; // keep the face clean
      g.add(S.sphere(c, 1.6 + hash3(i, 9, 9) * 1.2), (x, y, z) => shade(headColor(p, x, y, z), 1.08), p.skinMat as any);
    }
  }
  // texture passes
  if (p.magma) g.recolor((x, y, z) => (Math.abs(fbm(x * 0.2, y * 0.2, z * 0.2, 3, 4) - 0.5) < 0.028 ? [0xff7a1a, M.glow] : undefined));
  if (p.stars) g.recolor((x, y, z) => (hash3(Math.floor(x * 3), Math.floor(y * 3), Math.floor(z * 3), 21) > 0.988 ? [0xe0d4ff, M.glow] : undefined));
  void look;
  return g;
}

/** split off the face layer (outermost FACE_DEPTH voxels of each front column in the face window) */
function faceLayer(head: VoxGrid, cat: boolean) {
  const R = head.res;
  const cells: [number, number, number][] = [];
  const x0 = Math.floor(-17 * R), x1 = Math.ceil(17 * R), y0 = Math.floor(-16 * R), y1 = Math.ceil((cat ? 9 : 10) * R);
  const zTop = head.o[2] + head.d - 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let zs = -Infinity;
    for (let z = zTop; z >= 0; z--) if (head.get(x, y, z)) { zs = z; break; }
    if (zs < 3 * R) continue;
    for (let k = 0; k < FACE_DEPTH; k++) cells.push([x, y, zs - k]);
  }
  return cells;
}

function paintFace(face: Face, cells: [number, number, number][], head: VoxGrid, p: Pal) {
  const g = head.blank();
  for (const [x, y, z] of cells) {
    const px = facePixel(face, head.mc(x), head.mc(y), !!p.cat);
    const skin = head.color(x, y, z);
    const skinMat = head.get(x, y, z) || p.skinMat;
    switch (px) {
      case 'eye': g.set(x, y, z, p.eye, p.eyeMat as any); break;
      case 'hi': g.set(x, y, z, 0xffffff, M.glow); break;
      case 'white': g.set(x, y, z, 0xfff4fb, M.glow); break;
      case 'mouth': g.set(x, y, z, shade(p.ink, 0.7), M.gloss); break;
      case 'tongue': g.set(x, y, z, 0xff6f8e, M.jelly); break;
      case 'tear': g.set(x, y, z, 0x7fe4ff, M.glow); break;
      case 'blush': g.set(x, y, z, mix(skin, 0xff8fb0, 0.55), skinMat as any); break;
      case 'heart': g.set(x, y, z, 0xff4fa8, M.glow); break;
      case 'lid': g.set(x, y, z, shade(p.ink, 1.1), skinMat as any); break;
      case 'skin': default: g.set(x, y, z, skin, skinMat as any);
    }
  }
  return g;
}

function buildBody(p: Pal) {
  const g = VoxGrid.span([-13, -2, -12], [13, 24, 12], ALIEN_RES);
  const col = (x: number, y: number, z: number) => {
    if (p.cat) return catFur(p, x, y, z, 'body');
    const t = y / 22;
    let c = mix(shade(p.bot, 0.92), mix(p.bot, p.mid, 0.6), Math.min(1, t));
    if (z > 4 && Math.abs(x) < 4.5 && y > 4 && y < 15) c = mix(c, p.belly, 0.35);
    return c;
  };
  if (p.cat) g.add(smoothUnion(S.ellipsoid([0, 11.5, 0], [8.6, 9.6, 7.6]), S.ellipsoid([0, 5.2, 0.4], [9.4, 5.2, 8]), 3.2), col, M.fur);
  else g.add(smoothUnion(S.ellipsoid([0, 11, 0], [7.6, 9, 6.8]), S.ellipsoid([0, 5.5, 0.5], [8.2, 5, 7]), 3), col, p.skinMat as any);
  return g;
}

function buildArm(p: Pal, paw: boolean) {
  const g = VoxGrid.span([-10, -11, -7], [8, 17, 16], ALIEN_RES);
  if (p.cat && paw) {
    // The raised paw, after the photo: a thick fluffy forearm rising from the side of the
    // body to a palm held up in front of the chest (viewer's right, below the cheek),
    // palm to the viewer: one big rounded pad with four round toe beans in an arc above it.
    const fur = (x: number, y: number, z: number) => (z > 5 ? mix(FUR_HI, 0xffffff, 0.55) : mix(FUR_MID, FUR_HI, 0.5));
    const elbow: V3 = [0.8, -5.6, 2.2];
    const P: V3 = [2.4, 1.2, 6.8];              // palm centre (arm frame)
    g.add(S.capsule([0, 0, 0], elbow, 3.4, 3.8), fur, M.fur);              // upper arm down the side
    g.add(S.capsule(elbow, [P[0] - 0.2, P[1] - 2.8, P[2] - 2.2], 3.8, 4.1), fur, M.fur);  // forearm rising forward
    for (let i = 0; i < 6; i++) {                                          // fluffy tufts along the forearm
      const t = i / 5, q: V3 = [elbow[0] + (P[0] - elbow[0]) * t * 0.8, elbow[1] + (P[1] - 2.8 - elbow[1]) * t, elbow[2] + (P[2] - 2.2 - elbow[2]) * t];
      g.add(S.sphere([q[0] + 3.2, q[1], q[2] - 0.4], 1.5), fur, M.fur);
      g.add(S.sphere([q[0] - 3.1, q[1] + 0.4, q[2] - 0.2], 1.4), fur, M.fur);
    }
    g.add(S.ellipsoid(P, [4.9, 4.7, 3.2]), fur, M.fur);                      // the paw itself
    for (const [tx, ty] of [[-3.1, 2.4], [-1.1, 3.6], [1.1, 3.6], [3.1, 2.4]] as const) g.add(S.sphere([P[0] + tx, P[1] + ty, P[2] + 0.6], 1.75), fur, M.fur); // toe lumps
    const pad = 0x2a2b31;
    // the main pad: a rounded three-lobed cushion, wider at the bottom, sitting proud of the fur
    g.add(S.ellipsoid([P[0], P[1] - 1.3, P[2] + 2.6], [2.0, 1.5, 1.0]), pad, M.gloss);
    g.add(S.ellipsoid([P[0] - 1.35, P[1] - 1.9, P[2] + 2.45], [1.25, 1.05, 0.95]), pad, M.gloss);
    g.add(S.ellipsoid([P[0] + 1.35, P[1] - 1.9, P[2] + 2.45], [1.25, 1.05, 0.95]), pad, M.gloss);
    // four round toe beans, separate, in an arc above the pad (each on its own toe lump)
    for (const [bx, by] of [[-3.1, 2.2], [-1.1, 3.5], [1.1, 3.5], [3.1, 2.2]] as const) g.add(S.sphere([P[0] + bx, P[1] + by, P[2] + 2.25], 0.85), pad, M.gloss);
    return g;
  }
  if (p.cat) {
    const fur = (x: number, y: number, z: number) => (y < -4.5 ? FUR_HI : catFur(p, x, y, z, 'limb'));
    g.add(S.capsule([0, 0, 0], [0, -4, 2], 3.2, 3.5), fur, M.fur);
    g.add(S.ellipsoid([0, -5.4, 2.6], [3.8, 3.2, 3.6]), fur, M.fur);
    return g;
  }
  const col = (x: number, y: number) => mix(p.bot, p.mid, 0.6 + y * 0.03);
  g.add(S.ellipsoid([0, -3, 2], [3.1, 3.4, 3.1]), col, p.skinMat as any);
  void paw;
  return g;
}

function buildLeg(p: Pal) {
  const g = VoxGrid.span([-6, -6, -6], [6, 4, 9], ALIEN_RES);
  const col = (x: number, y: number, z: number) => p.cat ? (z > 3 ? FUR_HI : catFur(p, x, y, z, 'limb')) : mix(p.bot, p.mid, 0.35 + y * 0.04);
  g.add(S.ellipsoid([0, -2.6, 1.6], p.cat ? [4.2, 3.3, 5.2] : [3.8, 3.1, 4.8]), col, (p.cat ? M.fur : p.skinMat) as any);
  if (p.cat) for (const bx of [-1.7, 0, 1.7]) g.add(S.sphere([bx, -1.4, 6.4], 1.1), FUR_HI, M.fur);
  return g;
}

function buildAntenna(p: Pal, side: number, bulb: number) {
  const g = VoxGrid.span([-11, -2, -7], [11, 22, 9], ALIEN_RES);
  const stalkCol = (x: number, y: number) => mix(p.mid, p.top, y / 14);
  const tip: V3 = [side * 3.2, 11.5, 0.5];
  g.add(S.capsule([0, 0, 0], [side * 1.2, 6, 0.2], 1.7, 1.45), stalkCol, p.skinMat as any);
  g.add(S.capsule([side * 1.2, 6, 0.2], tip, 1.45, 1.3), stalkCol, p.skinMat as any);
  // octagonal disc, facing forward with a slight outward / upward tilt
  const n: V3 = [side * 0.18, 0.1, 1];
  const c: V3 = [tip[0] + side * 1.8, tip[1] + 5.4, tip[2] + 0.4];
  g.add(S.disc(c, n, 7.2, 1.6, 8, Math.PI / 8), (x, y) => mix(p.mid, p.top, (y - 10) / 12), p.skinMat as any);
  const nn = Math.hypot(...n);
  const front: V3 = [c[0] + (n[0] / nn) * 1.3, c[1] + (n[1] / nn) * 1.3, c[2] + (n[2] / nn) * 1.3];
  g.add(S.disc(front, n, 4.6, 0.9), bulb, M.glow);
  // a tiny specular glint on the disc rim
  g.paint(S.sphere([c[0] - side * 2.6, c[1] + 3.4, c[2] + 1.2], 0.9), mix(p.top, 0xffffff, 0.6));
  return g;
}

function tailMarks(pts: V3[]): Mark[] {
  if (TAIL_MARKS) return TAIL_MARKS;
  const out: Mark[] = [];
  for (let i = 0; i < 6; i++) {
    const seg = i % 2, t = 0.25 + (i >> 1) * 0.3;
    const a = pts[seg], b = pts[seg + 1];
    const c: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const ang = hash3(i, 7, 9) * Math.PI * 2;
    const n: V3 = [Math.cos(ang), 0.2, Math.sin(ang)];
    const nl = Math.hypot(...n);
    out.push({ c: [c[0] + (n[0] / nl) * 3.6, c[1] + (n[1] / nl) * 3.6, c[2] + (n[2] / nl) * 3.6], n: [n[0] / nl, n[1] / nl, n[2] / nl], r: 1.3, gap: ang });
  }
  return (TAIL_MARKS = out);
}

function buildTail(p: Pal) {
  void p;
  const g = VoxGrid.span([-14, -5, -20], [14, 26, 6], ALIEN_RES);
  // a thick fluffy snow-leopard tail curling up behind, with clean dark rings
  const pts: V3[] = [[0, 2, 0], [3, 3, -5], [6.5, 6.5, -8.5], [8, 11.5, -10], [7, 16.5, -9.5], [4.5, 19.5, -8]];
  const lens: number[] = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const total = lens[lens.length - 1];
  const along = (x: number, y: number, z: number) => {
    let best = Infinity, t = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const ab: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      const h = Math.max(0, Math.min(1, ((x - a[0]) * ab[0] + (y - a[1]) * ab[1] + (z - a[2]) * ab[2]) / L2));
      const d = (x - a[0] - ab[0] * h) ** 2 + (y - a[1] - ab[1] * h) ** 2 + (z - a[2] - ab[2] * h) ** 2;
      if (d < best) { best = d; t = (lens[i] + Math.sqrt(L2) * h) / total; }
    }
    return t;
  };
  const col = (x: number, y: number, z: number) => {
    const t = along(x, y, z);
    if (t > 0.88) return 0x2e2f35;                                    // dark tip
    if (t > 0.34 && (t * 7.5) % 1 < 0.42) return 0x34353b;             // thick dark rings toward the end
    if (t <= 0.34) { const r = rosetteAt(tailMarks(pts), x, y, z); if (r === 'ring') return 0x3a3b42; if (r === 'smoke') return mix(FUR_MID, 0xa9b0b9, 0.6); }
    return FUR_MID;
  };
  for (let i = 0; i < pts.length - 1; i++) g.add(S.capsule(pts[i], pts[i + 1], 3.6 + i * 0.05, 3.7 + i * 0.05), col, M.fur);
  g.add(S.sphere(pts[pts.length - 1], 3.8), col, M.fur);
  return g;
}

// ── cache of meshed parts (keyed by look) ────────────────────────────────────
const heads = new Map<string, { full: VoxGrid; holed: VoxGrid; cells: [number, number, number][] }>();
function headSource(key: string, p: Pal, look: AlienLook) {
  let h = heads.get(key);
  if (!h) {
    const full = buildHead(p, look);
    const cells = faceLayer(full, !!p.cat);
    const holed = full.copy();
    for (const [x, y, z] of cells) holed.del(x, y, z);
    h = { full, holed, cells };
    heads.set(key, h);
  }
  return h;
}
const cache = new Map<string, { make: () => THREE.Object3D }>();

function part(key: string, build: () => THREE.Object3D) {
  let c = cache.get(key);
  if (!c) {
    const proto = build();
    c = { make: () => proto.clone(true) };
    cache.set(key, c);
  }
  return c.make();
}

function override(p: Pal): Partial<Record<number, THREE.Material>> | undefined {
  if (!p.ghost) return undefined;
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.15, transparent: true, opacity: 0.62, clearcoat: 1, emissive: new THREE.Color('#2fd8ff'), emissiveIntensity: 0.25, depthWrite: true });
  return { [M.jelly]: m };
}

/** Build a full alien. `size` = world units per voxel. */
export function buildAlien(look: AlienLook, size = 0.016): AlienParts {
  const p = palette(look);
  const key = `${look.skin}|${look.body}|${look.belly}|${look.bulbA}|${look.bulbB}|${size}`;
  const ov = override(p);
  const opts = (name: string) => ({ size, ao: 0.55, outline: p.ink, outlineWidth: 2, castShadow: true, name, override: ov });

  const root = new THREE.Group(); root.name = 'alien';
  const jelly = new THREE.Group(); root.add(jelly);
  const V = (v: number) => v * size;

  // body
  const body = new THREE.Group(); body.name = 'body';
  body.add(part(key + '|body', () => toObject(buildBody(p), opts('body'))));
  jelly.add(body);

  // legs (pivot at hip)
  const legL = new THREE.Group(), legR = new THREE.Group();
  for (const [g, sx] of [[legL, -1], [legR, 1]] as const) {
    g.add(part(key + '|leg', () => toObject(buildLeg(p), opts('leg'))));
    g.position.set(V(sx * 4.2), V(5.6), V(1));
    jelly.add(g);
  }

  // arms (pivot at shoulder)
  const armL = new THREE.Group(), armR = new THREE.Group();
  for (const [g, sx] of [[armL, -1], [armR, 1]] as const) {
    const paw = !!p.cat && sx === 1;
    g.add(part(key + (paw ? '|paw' : '|arm'), () => toObject(buildArm(p, paw), opts('arm'))));
    g.position.set(V(sx * 6.4), V(14.5), V(3));
    if (paw) { g.position.set(V(7.4), V(15.2), V(2.6)); }
    jelly.add(g);
  }

  // head + faces
  const head = new THREE.Group(); head.name = 'head';
  head.position.set(0, V(HEAD_Y), 0);
  const faces = new Map<Face, THREE.Object3D>();
  const src = headSource(key, p, look);
  head.add(part(key + '|head', () => {
    const obj = toObject(src.holed, { size, ao: 0.55, castShadow: true, name: 'head', override: ov });
    const outline = toObject(src.full.dilate(2, p.ink), { size, ao: 0 });
    for (const m of [...outline.children] as THREE.Mesh[]) {
      m.material = outlineMaterial(p.ink, (size / ALIEN_RES) * 3);
      m.userData.outline = true; obj.add(m);
    }
    return obj;
  }));
  for (const f of FACES) {
    const fo = part(`${key}|face:${f}`, () => toObject(paintFace(f, src.cells, src.full, p), { size, occluder: src.holed, name: 'face:' + f, override: ov }));
    fo.visible = f === look.expression;
    faces.set(f, fo);
    head.add(fo);
  }

  // cat muzzle, nose, whiskers (static, live on the head)
  if (p.cat) {
    head.add(part(key + '|muzzle', () => {
      const g = VoxGrid.span([-15, -16, 4], [15, 2, 22], ALIEN_RES);
      const white = mix(FUR_HI, 0xffffff, 0.75);
      // two puffy whisker pads + a soft chin
      g.add(S.ellipsoid([-2.9, -7.4, 13.4], [3.9, 3.0, 2.8]), white, M.fur);
      g.add(S.ellipsoid([2.9, -7.4, 13.4], [3.9, 3.0, 2.8]), white, M.fur);
      g.add(S.ellipsoid([0, -10.4, 12.2], [2.6, 1.8, 2.2]), white, M.fur);
      // pink nose: a rounded inverted triangle with a darker tip line
      for (let i = 0; i < 4; i++) g.add(S.ellipsoid([0, -4.3 - i * 0.5, 15.5 - i * 0.1], [1.9 - i * 0.44, 0.85, 1.05]), 0xc98e9b, M.jelly);
      g.add(S.sphere([-0.7, -3.9, 16.3], 0.45), 0xffd0dc, M.glow);
      // philtrum + smile
      g.add(S.capsule([0, -6.6, 15.4], [0, -7.5, 15.2], 0.3), 0x9a7c84, M.solid);
      g.add(S.capsule([0, -7.5, 15.2], [-1.9, -8.4, 14.9], 0.3), 0x9a7c84, M.solid);
      g.add(S.capsule([0, -7.5, 15.2], [1.9, -8.4, 14.9], 0.3), 0x9a7c84, M.solid);
      // whisker dots + long white whiskers
      for (const sx of [-1, 1]) {
        for (const [dx, dy] of [[1.8, -6.6], [3.2, -7.2], [2.4, -8.2]] as const) g.paint(S.sphere([sx * dx, dy, 15.6], 0.38), 0x8a8f98);
        for (const [dy, droop] of [[0, 0.4], [1.3, -0.6], [2.6, -1.8]] as const) g.add(S.capsule([sx * 5.6, -6.4 - dy, 13.6], [sx * 13.5, -5.6 - dy + droop, 11.2], 0.32), 0xdfe5ec, M.solid);
      }
      return toObject(g, { size, name: 'muzzle', castShadow: true, ao: 0.4 });
    }));
  }

  // antennae
  let antL: THREE.Group | null = null, antR: THREE.Group | null = null;
  if (!p.cat) {
    antL = new THREE.Group(); antR = new THREE.Group();
    for (const [g, sx, col] of [[antL, -1, look.bulbA], [antR, 1, look.bulbB]] as const) {
      g.add(part(`${key}|ant${sx}`, () => toObject(buildAntenna(p, sx, hex(col)), opts('antenna'))));
      g.position.set(V(sx * 7.2), V(13.2), V(-1.5));
      g.rotation.z = -sx * 0.28;
      head.add(g);
    }
  }

  // tail (cat)
  let tail: THREE.Group | null = null;
  if (p.cat) {
    tail = new THREE.Group();
    tail.add(part(key + '|tail', () => toObject(buildTail(p), opts('tail'))));
    tail.position.set(V(1.5), V(4.5), V(-5.5));
    jelly.add(tail);
  }

  jelly.add(head);

  // anchors
  const mk = (parent: THREE.Object3D, x: number, y: number, z: number, name: string) => { const a = new THREE.Group(); a.name = name; a.position.set(V(x), V(y), V(z)); parent.add(a); return a; };
  const anchors = {
    hat: mk(head, 0, p.cat ? 13 : 14.5, -1, 'hat'),
    face: mk(head, 0, -1, 15.5, 'face'),
    neck: mk(body, 0, 19.5, 2, 'neck'),
    torso: mk(body, 0, 11, 0, 'torso'),
    back: mk(body, 0, 12, -7, 'back'),
    handR: mk(armR, 0, p.cat ? -7 : -5, 2, 'handR'),
    handL: mk(armL, 0, -5, 2, 'handL'),
  };

  let current: Face = look.expression;
  const parts: AlienParts = {
    root, jelly, body, head, armL, armR, legL, legR, antL, antR, tail, faces, anchors, size,
    height: V(p.cat ? HEAD_Y + 26 : HEAD_Y + 34),
    setFace(f: Face) {
      if (f === current) return;
      faces.get(current)!.visible = false;
      (faces.get(f) ?? faces.get('happy')!).visible = true;
      current = f;
    },
    dispose() { root.removeFromParent(); },
  };
  root.userData.alienParts = parts;
  return parts;
}

/** Make sure shared materials exist (call once after a renderer exists). */
export function warmAlienMaterials() { materials(); void noise3; }
