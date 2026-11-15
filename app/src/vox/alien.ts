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
    case 'pounce': return { top: 0xf4f6f8, mid: 0xe2e7ec, bot: 0xc9d0d8, belly: 0xffffff, ink: 0x2a2e36, skinMat: M.fur, cat: true, eye: 0x0b0d12, eyeMat: M.gloss };
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
const HEAD_R: V3 = [17, 16, 15.5];
const HEAD_Y = 34;            // head centre above the feet
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
const CAT_R: EyeSpec = { cx: 6.8, cy: 0.5, rx: 5.0, ry: 6.0, rot: -0.22 };
const CAT_L: EyeSpec = { cx: -6.8, cy: 0.5, rx: 5.0, ry: 6.0, rot: 0.22 };

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
    if (face === 'love' || face === 'happy') { if (ell(x, y, -12.2, -5.5, 2.2, 1.2).d <= 1 || ell(x, y, 12.2, -5.5, 2.2, 1.2).d <= 1) return 'blush'; }
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

// ── part builders ────────────────────────────────────────────────────────────
function headColor(p: Pal, x: number, y: number, z: number) {
  const t = (y + HEAD_R[1]) / (HEAD_R[1] * 2); // 0 bottom → 1 top
  let c = t > 0.5 ? mix(p.mid, p.top, (t - 0.5) / 0.5) : mix(p.bot, p.mid, Math.pow(t / 0.5, 0.8));
  if (p.cat) c = catFur(p, x, y + HEAD_Y, z, 1);
  if (p.bumps && hash3(x >> 1, y >> 1, z >> 1, 7) > 0.86) c = shade(c, 1.12);
  return c;
}

function catFur(p: Pal, x: number, y: number, z: number, scale = 1) {
  // snow leopard: pale silver-white fur, black rosettes (rings with a smoky centre), tiny forehead speckles
  const base = mix(p.mid, p.top, Math.max(0, Math.min(1, (y - 20) / 30)));
  const n = fbm(x * 0.16 * scale, y * 0.16 * scale, z * 0.16 * scale, 3, 11);
  const ring = Math.abs(n - 0.64);
  if (n > 0.64 && n < 0.69) return 0x2c2d33;
  if (n >= 0.69) return mix(base, 0xb7bec7, 0.65);
  if (ring < 0.012) return 0x3a3b42;
  // forehead speckles
  if (y > HEAD_Y + 6 && z > 2 && hash3(x, y, z, 5) > 0.93) return 0x3a3b42;
  return base;
}

function buildHead(p: Pal, look: AlienLook) {
  const g = VoxGrid.span([-22, -22, -22], [22, 26, 22], ALIEN_RES);
  const col = (x: number, y: number, z: number) => headColor(p, x, y, z);
  if (p.cat) {
    g.add(S.ellipsoid([0, -0.5, 0], [17, 14.8, 15]), col, p.skinMat as any);
    // fluffy cheeks
    g.add(S.ellipsoid([-11, -6, 4], [6.5, 6, 7]), col, p.skinMat as any);
    g.add(S.ellipsoid([11, -6, 4], [6.5, 6, 7]), col, p.skinMat as any);
    // round ears with pink-grey inners and dark rims
    for (const sx of [-1, 1]) {
      const c: V3 = [sx * 10.5, 12.5, -1.5];
      g.add(S.ellipsoid(c, [5.8, 6.4, 2.6]), (x, y) => (y > c[1] + 3.6 ? 0x2c2d33 : catFur(p, x, y + HEAD_Y, 0)), M.fur);
      g.paint(S.ellipsoid([c[0], c[1] - 0.6, c[2] + 1.8], [3.4, 4, 1.5]), 0xd9a6b0, M.fur);
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
    if (p.cat) return z > 3 && Math.abs(x) < 5 && y < 16 ? mix(0xffffff, p.top, 0.2) : catFur(p, x, y, z);
    const t = y / 22;
    let c = mix(shade(p.bot, 0.92), mix(p.bot, p.mid, 0.6), Math.min(1, t));
    if (z > 4 && Math.abs(x) < 4.5 && y > 4 && y < 15) c = mix(c, p.belly, 0.35);
    return c;
  };
  if (p.cat) g.add(smoothUnion(S.ellipsoid([0, 11, 0], [8.4, 9.4, 7.4]), S.ellipsoid([0, 5, 0], [9, 5, 7.8]), 3), col, p.skinMat as any);
  else g.add(smoothUnion(S.ellipsoid([0, 11, 0], [7.6, 9, 6.8]), S.ellipsoid([0, 5.5, 0.5], [8.2, 5, 7]), 3), col, p.skinMat as any);
  return g;
}

function buildArm(p: Pal, paw: boolean) {
  const g = VoxGrid.span([-7, -11, -6], [7, 5, 8], ALIEN_RES);
  const col = (x: number, y: number, z: number) => p.cat ? catFur(p, x + 30, y, z) : mix(p.bot, p.mid, 0.6 + y * 0.03);
  if (paw) {
    // the snow leopard's raised paw: chunky, with black pads facing the viewer
    g.add(S.capsule([0, 2, 0], [0, -4, 1.5], 3.2, 4.2), col, p.skinMat as any);
    g.add(S.ellipsoid([0, -6, 2], [5, 4.6, 4]), col, p.skinMat as any);
    g.paint(S.ellipsoid([0, -7.4, 5.2], [2.4, 1.9, 1.2]), 0x1b1c22, M.gloss);
    for (const [bx, by] of [[-2.8, -3.6], [-0.9, -2.6], [1.1, -2.6], [3, -3.6]]) g.paint(S.ellipsoid([bx, by, 5.3], [0.95, 1.1, 1]), 0x1b1c22, M.gloss);
  } else {
    g.add(S.ellipsoid([0, -3, 2], [3.1, 3.4, 3.1]), col, p.skinMat as any);
  }
  return g;
}

function buildLeg(p: Pal) {
  const g = VoxGrid.span([-6, -6, -6], [6, 4, 9], ALIEN_RES);
  const col = (x: number, y: number, z: number) => p.cat ? (z > 4 ? 0xf6f7f9 : catFur(p, x + 50, y, z)) : mix(p.bot, p.mid, 0.35 + y * 0.04);
  g.add(S.ellipsoid([0, -2.6, 1.6], [3.8, 3.1, 4.8]), col, p.skinMat as any);
  if (p.cat) for (const bx of [-1.6, 0, 1.6]) g.paint(S.sphere([bx, -1.2, 6.2], 0.8), 0xe0b4be, M.fur);
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

function buildTail(p: Pal) {
  const g = VoxGrid.span([-8, -4, -18], [10, 22, 4], ALIEN_RES);
  const pts: V3[] = [[0, 2, 0], [2, 4, -5], [4, 8, -9], [4.5, 13, -11], [3, 16.5, -10]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    g.add(S.capsule(a, b, 3.4 - i * 0.15, 3.3 - i * 0.15), (x, y, z) => {
      const ringy = Math.sin((y + z * 0.4) * 0.75) > 0.55;
      return ringy ? 0x2c2d33 : catFur(p, x + 80, y + 20, z);
    }, M.fur);
  }
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
    if (paw) { g.position.set(V(7.6), V(19), V(3)); }
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
      const g = VoxGrid.span([-12, -14, 6], [12, 0, 22], ALIEN_RES);
      g.add(S.ellipsoid([-2.6, -7.2, 13.2], [3.6, 2.8, 2.6]), 0xfafbfc, M.fur);
      g.add(S.ellipsoid([2.6, -7.2, 13.2], [3.6, 2.8, 2.6]), 0xfafbfc, M.fur);
      g.add(S.ellipsoid([0, -4.6, 15.2], [1.9, 1.3, 1.1]), 0xe58a9e, M.jelly);   // pink nose
      g.add(S.capsule([0, -5.8, 15.3], [0, -7.6, 15.1], 0.45), 0x5a3a44, M.solid);
      g.add(S.capsule([0, -7.6, 15.1], [-1.8, -8.6, 14.8], 0.45), 0x5a3a44, M.solid);
      g.add(S.capsule([0, -7.6, 15.1], [1.8, -8.6, 14.8], 0.45), 0x5a3a44, M.solid);
      for (const sx of [-1, 1]) for (const dy of [0, 1.4]) g.add(S.capsule([sx * 5, -6.4 - dy, 13.5], [sx * 9.8, -5.6 - dy * 1.6, 12.2], 0.35), 0xf0f2f6, M.glow);
      return toObject(g, { size, name: 'muzzle', castShadow: true });
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
    tail.position.set(V(2), V(6), V(-6));
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
