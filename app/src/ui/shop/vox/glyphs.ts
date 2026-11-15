// Voxel glyph library — little sculpted 3D symbols used on slot reels, medals and
// mechanic cards. Each glyph is a real voxel object with an inked outline (same family as
// the aliens), tinted by a colour; `gold` turns it into polished gold with glints.
import * as THREE from 'three';
import { M, S, VoxGrid, hash3, mix, shade, type V3 } from '../../../vox/core';
import { toObject } from '../../../vox/mesh';

export type GlyphName =
  | 'refresh' | 'play' | 'idea' | 'brain' | 'wrench' | 'search' | 'sound' | 'tasks' | 'bolt' | 'eye' | 'star' | 'folder'
  | 'alien' | 'user' | 'back' | 'pencil' | 'dna' | 'chat' | 'sparkle' | 'code' | 'terminal' | 'ufo' | 'shop' | 'warn'
  | 'pin' | 'arcade' | 'stop' | 'widget' | 'trash' | 'file' | 'wardrobe' | 'send' | 'trophy' | 'fuel' | 'slot'
  | 'sword' | 'cube' | 'coin' | 'planet' | 'hourglass' | 'heart' | 'check' | 'close' | 'gear';

const RES = 1.25;
const g = () => VoxGrid.span([-16, -16, -8], [16, 16, 8], RES);
type Mat = (typeof M)[keyof typeof M];

/** shading helper: lighter toward the top-left, like a lit toy */
const tone = (c: number) => (x: number, y: number, _z?: number): number => mix(shade(c, 0.82), mix(c, 0xffffff, 0.25), (y + 14) / 28 * 0.8 + (x < 0 ? 0.1 : 0));

type Sculpt = (v: VoxGrid, c: number, m: Mat, d: (s: any, col: number | ((x: number, y: number, z: number) => number), mm?: Mat) => void) => void;

type ColF = number | ((x: number, y: number, z: number) => number);
const ring = (v: VoxGrid, c: V3, R: number, r: number, col: ColF, m: Mat, n: V3 = [0, 0, 1]) => v.add(S.torus(c, n, R, r), col, m);
const bar = (v: VoxGrid, a: V3, b: V3, r: number, col: ColF, m: Mat) => v.add(S.capsule(a, b, r), col, m);

const SCULPT: Record<GlyphName, Sculpt> = {
  refresh: (v, c, m) => {
    for (let i = 0; i < 26; i++) { const a = 0.5 + (i / 26) * Math.PI * 1.55; bar(v, [Math.cos(a) * 9, Math.sin(a) * 9, 0], [Math.cos(a + 0.12) * 9, Math.sin(a + 0.12) * 9, 0], 2.4, tone(c), m); }
    bar(v, [8, -6, 0], [12.5, -1.5, 0], 2.2, tone(c), m); bar(v, [8, -6, 0], [2.5, -7.5, 0], 2.2, tone(c), m);
  },
  play: (v, c, m) => { for (let y = -10; y <= 10; y++) { const w = 10 - Math.abs(y); v.add(S.box([-7, y, -3], [-7 + w * 1.6 + 0.6, y + 1, 3], 0.4), tone(c), m); } },
  idea: (v, c, m) => {
    v.add(S.sphere([0, 3, 0], 9), (x, y) => (y > 8 && x < -2 ? 0xfffbe0 : mix(0xffe68a, 0xffc43d, (8 - y) / 16)), M.glow);
    v.add(S.box([-4.5, -10, -4.5], [4.5, -5, 4.5], 1.2), (_x, y) => (y | 0) % 2 ? 0x8b97a4 : 0xc8d2db, M.metal);
    v.add(S.box([-2.5, -12.5, -2.5], [2.5, -10, 2.5], 1), 0x3a3f48, M.metal);
    bar(v, [-2, 0, 4], [2, 4, 4], 0.7, 0xff9b2e, M.glow);
    void c;
  },
  brain: (v, c, m) => {
    v.add(S.ellipsoid([-4.5, 1, 0], [7, 8, 6]), tone(c), m); v.add(S.ellipsoid([4.5, 1, 0], [7, 8, 6]), tone(c), m);
    v.recolor((x, y, z) => (Math.sin(x * 0.9 + Math.cos(y * 0.8) * 2) > 0.75 && z > 2 ? shade(c, 0.6) : undefined));
    v.add(S.capsule([0, -7, 0], [1.5, -11, -1], 2), shade(c, 0.85), m);
  },
  wrench: (v, c, m) => {
    bar(v, [-8, -8, 0], [6, 6, 0], 2.4, tone(0xb8c4cf), M.metal);
    v.add(S.disc([8, 8, 0], [0, 0, 1], 5.6, 2.6), tone(0xc8d2db), M.metal); v.carve(S.box([7.5, 8.5, -4], [14, 14, 4]));
    v.add(S.disc([-9, -9, 0], [0, 0, 1], 4, 2.6), tone(c), m);
  },
  search: (v, c, m) => {
    ring(v, [-2, 3, 0], 7, 2, tone(0xd9a43a), M.metal);
    v.add(S.disc([-2, 3, 0], [0, 0, 1], 6, 0.8), mix(0x9ff6ff, c, 0.25), M.glass);
    bar(v, [3.5, -2.5, 0], [10, -10, 0], 2.5, tone(shade(c, 0.9)), m);
  },
  sound: (v, c, m) => {
    v.add(S.box([-11, -4, -3], [-5, 4, 3], 1), tone(c), m);
    for (let y = -9; y <= 9; y++) { const w = 1 + (9 - Math.abs(y)) * 0.0 + (Math.abs(y) < 9 ? 0 : 0); void w; v.add(S.box([-5, Math.max(-9, y), -3], [-5 + (9 - Math.abs(y)) * 0.7 + 1, y + 1, 3], 0.4), tone(c), m); }
    for (const R of [5, 9]) for (let i = -6; i <= 6; i++) { const a = (i / 6) * 0.9; bar(v, [2 + Math.cos(a) * R, Math.sin(a) * R, 0], [2 + Math.cos(a + 0.15) * R, Math.sin(a + 0.15) * R, 0], 1.2, 0x8cf56b, M.glow); }
  },
  tasks: (v, c, m) => {
    v.add(S.box([-9, -12, -2], [9, 11, 1], 1.5), 0xb8885a, M.solid);
    v.add(S.box([-7.5, -10.5, 0], [7.5, 9.5, 2], 0.5), 0xf4f1e6, M.solid);
    v.add(S.box([-4, 9, -2], [4, 13, 3], 1), 0x9aa6b2, M.metal);
    for (const y of [5, 0, -5]) { v.add(S.box([-5.5, y - 1, 1.5], [-2.5, y + 2, 3]), c, M.glow); v.add(S.box([-1, y - 0.2, 1.5], [5.5, y + 1.2, 2.6]), 0x6b7680, M.solid); }
  },
  bolt: (v, c, m) => {
    const pts: [number, number][] = [[3, 13], [-7, -1], [0, -1], [-4, -13], [8, 3], [1, 3]];
    for (let y = -13; y <= 13; y += 0.5) for (let x = -10; x <= 10; x += 0.5) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) v.add(S.box([x, y, -2.5], [x + 0.6, y + 0.6, 2.5]), mix(c, 0xffffff, (y + 13) / 60), M.glow);
    }
    void m;
  },
  eye: (v, c, m) => {
    v.add(S.ellipsoid([0, 0, 0], [12, 7.5, 4]), 0xf8fbff, M.jelly);
    v.add(S.disc([0, 0, 3.2], [0, 0, 1], 5, 1.2), tone(c), M.jelly);
    v.add(S.disc([0, 0, 4.2], [0, 0, 1], 2.6, 0.8), 0x07090c, M.gloss);
    v.add(S.sphere([-1.5, 1.6, 5], 0.9), 0xffffff, M.glow);
    void m;
  },
  star: (v, c, m) => {
    for (let y = -13; y <= 13; y += 0.5) for (let x = -13; x <= 13; x += 0.5) {
      const a = Math.atan2(y, x) + Math.PI / 2, r = Math.hypot(x, y);
      const k = Math.cos(((a % (Math.PI * 2 / 5)) + Math.PI * 2 / 5) % (Math.PI * 2 / 5) - Math.PI / 5);
      const lim = 5.6 / Math.max(0.42, k * k * 1.15);
      if (r < Math.min(13, lim)) v.add(S.box([x, y, -3 + r * 0.12], [x + 0.6, y + 0.6, 3 - r * 0.12]), tone(c), m);
    }
  },
  folder: (v, c, m) => {
    v.add(S.box([-12, -9, -3], [12, 7, 3], 1.2), shade(c, 0.85), m);
    v.add(S.box([-12, 5, -3], [-2, 9, 3], 1), shade(c, 0.85), m);
    v.add(S.box([-11, -9, 1], [11, 4, 4], 1), tone(c), m);
    v.add(S.box([-8, 3, -1], [8, 8, 1]), 0xf4f1e6, M.solid);
  },
  alien: (v, c, m) => {
    v.add(S.ellipsoid([0, -1, 0], [11, 10, 8]), tone(c), M.jelly);
    for (const sx of [-1, 1]) {
      v.paint(S.ellipsoid([sx * 4.5, -1, 6], [3.2, 5, 4]), 0x07090c, M.gloss);
      v.paint(S.sphere([sx * 4.5 + 1.2, 1.4, 7.5], 1.2), 0xffffff, M.glow);
      bar(v, [sx * 4, 8, 0], [sx * 7, 13, 0], 1, tone(c), M.jelly);
      v.add(S.disc([sx * 7.5, 13.5, 0.5], [0, 0, 1], 2.6, 0.9, 8), sx < 0 ? 0xff7ad9 : 0x3b5bff, M.glow);
    }
    void m;
  },
  user: (v, c, m) => { v.add(S.sphere([0, 6, 0], 5.5), tone(c), m); v.add(S.ellipsoid([0, -8, 0], [10, 6, 5]), tone(shade(c, 0.85)), m); v.carve(S.box([-14, -16, -8], [14, -9, 8])); },
  back: (v, c, m) => { bar(v, [-10, 0, 0], [10, 0, 0], 2.8, tone(c), m); bar(v, [-10, 0, 0], [-3, 7, 0], 2.8, tone(c), m); bar(v, [-10, 0, 0], [-3, -7, 0], 2.8, tone(c), m); },
  pencil: (v, c, m) => {
    bar(v, [-8, -8, 0], [7, 7, 0], 3.2, (x, y) => ((x + y) > 8 ? 0xff9ab0 : tone(c)(x, y)), m);
    v.add(S.capsule([-8, -8, 0], [-12, -12, 0], 2.6, 0.4), 0xe9c38a, M.solid);
    v.add(S.sphere([-12, -12, 0], 0.9), 0x2b2f36, M.solid);
  },
  dna: (v, c, m) => {
    v.add(S.capsule([0, -9, 0], [0, 9, 0], 6), (_x, y) => (y > 0 ? mix(c, 0xffffff, 0.2) : shade(c, 0.7)), M.jelly);
    v.add(S.disc([0, 0, 0], [0, 1, 0], 6.3, 0.7), 0xe8ecf0, M.metal);
    for (let i = 0; i < 10; i++) { const y = -7 + i * 1.5, a = i * 0.7; bar(v, [Math.cos(a) * 3, y, Math.sin(a) * 3 + 3], [-Math.cos(a) * 3, y, -Math.sin(a) * 3 + 3], 0.5, 0xffffff, M.glow); }
  },
  chat: (v, c, m) => {
    v.add(S.box([-12, -6, -3], [12, 10, 3], 4), tone(c), m);
    for (let i = 0; i < 6; i++) v.add(S.box([-7 + i * 0.6, -6 - i, -2.5], [-3, -5 - i, 2.5]), tone(c), m);
    for (const x of [-6, 0, 6]) v.add(S.sphere([x, 2, 3], 1.8), 0xffffff, M.glow);
  },
  sparkle: (v, c, m) => {
    for (const [cx, cy, s] of [[0, 1, 1], [-8, -8, 0.45], [8, 9, 0.4]] as const) {
      for (let a = 0; a < 4; a++) { const ang = (a / 4) * Math.PI * 2; v.add(S.capsule([cx, cy, 0], [cx + Math.cos(ang) * 12 * s, cy + Math.sin(ang) * 12 * s, 0], 3 * s, 0.4), mix(c, 0xffffff, 0.3), M.glow); }
      v.add(S.sphere([cx, cy, 0], 3.2 * s), 0xffffff, M.glow);
    }
    void m;
  },
  code: (v, c, m) => {
    bar(v, [-5, 8, 0], [-12, 0, 0], 2.2, tone(c), m); bar(v, [-12, 0, 0], [-5, -8, 0], 2.2, tone(c), m);
    bar(v, [5, 8, 0], [12, 0, 0], 2.2, tone(c), m); bar(v, [12, 0, 0], [5, -8, 0], 2.2, tone(c), m);
    bar(v, [3, 10, 0], [-3, -10, 0], 1.8, 0x8cf56b, M.glow);
  },
  terminal: (v, c, m) => {
    v.add(S.box([-13, -6, -4], [13, 12, 3], 2), tone(0x3a4450), M.metal);
    v.add(S.box([-11, -4, 2], [11, 10, 3.5], 0.6), 0x06140c, M.gloss);
    for (let i = 0; i < 4; i++) v.add(S.box([-9, 7 - i * 3, 3], [-9 + 4 + ((i * 5) % 12), 8 - i * 3, 4]), c, M.glow);
    v.add(S.box([-3, -10, -2], [3, -6, 1]), 0x2b333c, M.metal); v.add(S.box([-8, -12, -4], [8, -10, 3], 1), 0x3a4450, M.metal);
    void m;
  },
  ufo: (v, c, m) => {
    v.add(S.ellipsoid([0, -1, 0], [14, 3.6, 10]), tone(0xb8c4cf), M.metal);
    v.add(S.ellipsoid([0, 3, 0], [6.5, 6, 5]), mix(c, 0xd8fbff, 0.4), M.glass);
    v.add(S.ellipsoid([0, 1.5, 0], [3, 3.4, 2.6]), 0x8cf56b, M.jelly);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; v.add(S.sphere([Math.cos(a) * 11, -1.2, Math.sin(a) * 7.5], 1.3), i % 2 ? 0xffe14d : c, M.glow); }
    void m;
  },
  shop: (v, c, m) => {
    v.add(S.box([-10, -13, -5], [10, 13, 4], 1.5), tone(c), m);
    v.add(S.box([-8, -4, 3], [5, 11, 4.5], 0.5), 0x0a1a12, M.gloss);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) v.add(S.sphere([-5.5 + k * 4.3, 8 - r * 4.6, 4.5], 1.4), [0xff7ad9, 0x8cf56b, 0x52f2ff][(r + k) % 3], M.glow);
    v.add(S.box([6, 2, 3], [9, 10, 4.6], 0.4), 0x2b333c, M.metal);
    v.add(S.box([-8, -11, 3], [8, -7, 4.6], 0.5), 0x050806, M.gloss);
  },
  warn: (v, c, m) => {
    for (let y = -11; y <= 12; y += 0.5) { const w = (12 - y) * 0.6; v.add(S.box([-w, y, -3], [w, y + 0.6, 3], 0.2), tone(c), m); }
    v.add(S.box([-1.4, -3, 2.5], [1.4, 6, 4]), 0x14100a, M.gloss); v.add(S.sphere([0, -7, 3.2], 1.6), 0x14100a, M.gloss);
  },
  pin: (v, c, m) => { v.add(S.sphere([0, 5, 0], 6.5), tone(c), M.jelly); v.add(S.sphere([-2, 7.5, 4.5], 1.5), 0xffffff, M.glow); bar(v, [0, -1, 0], [0, -13, 0], 1, 0xc8d2db, M.metal); void m; },
  arcade: (v, c, m) => {
    v.add(S.box([-9, -14, -6], [9, 14, 5], 1.2), tone(c), m);
    v.add(S.box([-7, 0, 3.5], [7, 10, 5.5], 0.5), 0x101632, M.gloss);
    for (let i = 0; i < 3; i++) v.add(S.box([-5 + i * 3.6, 3 + (i % 2) * 2, 5], [-3 + i * 3.6, 5 + (i % 2) * 2, 6]), [0x8cf56b, 0xff7ad9, 0xffe14d][i], M.glow);
    v.add(S.box([-9, -4, -3], [9, -1, 7], 0.6), shade(c, 0.7), m);
    v.add(S.capsule([-3, -1, 5], [-3, 3, 5], 0.7), 0x2b2f36, M.metal); v.add(S.sphere([-3, 3.5, 5], 1.6), 0xff4f6a, M.jelly);
    for (const x of [2, 5]) v.add(S.sphere([x, -1, 5.5], 1.2), 0x52f2ff, M.glow);
    v.add(S.box([-8, 11, 3], [8, 13.5, 5.5], 0.4), 0xffe14d, M.glow);
  },
  stop: (v, c, m) => {
    for (let a = 0; a < 8; a++) void a;
    v.add(S.disc([0, 0, 0], [0, 0, 1], 12, 3, 8, Math.PI / 8), tone(c), m);
    v.add(S.box([-7, -1.6, 2.5], [7, 1.6, 4]), 0xffffff, M.solid);
  },
  widget: (v, c, m) => {
    v.add(S.box([-13, -9, -3], [13, 10, 2], 1.5), tone(0x3a4450), M.metal);
    v.add(S.box([-11, -7, 1.5], [11, 6, 3], 0.4), 0x0a1a12, M.gloss);
    v.add(S.box([1, -9, 2], [15, 2, 6], 1), tone(c), m);
    v.add(S.box([2.5, -7.5, 5.5], [13.5, 0.5, 6.6]), mix(c, 0xffffff, 0.4), M.glow);
  },
  trash: (v, c, m) => {
    v.add(S.cone(0, 0, -13, 7, 7.5, 9), (x, y, z) => (Math.abs(((x + z) * 1.1) % 4) < 1 ? shade(c, 0.75) : tone(c)(x, y)), m);
    v.carve(S.cyl(0, 0, 7.6, -11, 9));
    v.add(S.disc([0, 9.5, 0], [0, 1, 0], 10, 1.4), tone(shade(c, 1.1)), m);
    v.add(S.capsule([-3, 12, 0], [3, 12, 0], 1.2), 0x6b7680, M.metal);
  },
  file: (v, c, m) => {
    v.add(S.box([-9, -12, -1.5], [9, 12, 1.5], 0.5), 0xf6f3ea, M.solid);
    v.carve(S.box([4, 7, -3], [12, 14, 3]));
    for (let y = 4; y > -10; y -= 3) v.add(S.box([-6, y, 1], [y > 0 ? 2 : 6, y + 1, 2.2]), c, M.glow);
    void m;
  },
  wardrobe: (v, c, m) => {
    v.add(S.cyl(0, 0, 6.5, -1, 11), tone(c), m);
    v.add(S.disc([0, -1, 0], [0, 1, 0], 11, 1.4), tone(c), m);
    v.add(S.cyl(0, 0, 6.7, 0.5, 3), 0xff4fa8, M.glow);
    v.add(S.sphere([-3, 8, 5], 1.2), 0xffffff, M.glow);
  },
  send: (v, c, m) => {
    v.add(S.capsule([-5, -5, 0], [5, 5, 0], 4.2, 3), (x, y) => (x + y > 6 ? 0xff4f6a : tone(0xe8ecf0)(x, y)), M.metal);
    v.add(S.sphere([1.5, 1.5, 3.4], 1.8), 0x52f2ff, M.glass);
    bar(v, [-6, -1, 0], [-11, -1, 0], 1.6, tone(c), m); bar(v, [-1, -6, 0], [-1, -11, 0], 1.6, tone(c), m);
    v.add(S.capsule([-7, -7, 0], [-12, -12, 0], 2.6, 0.6), 0xffa21a, M.glow);
  },
  trophy: (v, c, m) => {
    v.add(S.cone(0, 0, -2, 11, 3, 9), tone(c), m);
    v.carve(S.cone(0, 0, 4, 12, 3, 8));
    ring(v, [-9, 6, 0], 3.4, 1.2, tone(c), m); ring(v, [9, 6, 0], 3.4, 1.2, tone(c), m);
    v.add(S.cyl(0, 0, 1.6, -8, -2), tone(c), m);
    v.add(S.box([-6, -13, -4], [6, -8, 4], 1), 0x5a3a20, M.solid);
    v.add(S.sphere([-3, 8, 5], 1.2), 0xffffff, M.glow);
  },
  fuel: (v, c, m) => {
    v.add(S.box([-8, -12, -5], [8, 10, 5], 2.4), tone(0xc8d2db), M.metal);
    v.add(S.box([-6.5, -10.5, 4], [6.5, 4 - 0, 5.6], 0.5), c, M.glow);
    v.add(S.box([-6.5, 4, 4], [6.5, 8.5, 5.4], 0.5), 0x0b1310, M.gloss);
    v.add(S.capsule([3, 10, 0], [6, 14, 0], 1.6), 0x6b7680, M.metal);
    for (let i = 0; i < 4; i++) v.add(S.sphere([-3 + (i % 2) * 5, -8 + i * 3, 5.6], 0.9), 0xffffff, M.glow);
    void m;
  },
  slot: (v, c, m) => {
    v.add(S.box([-11, -13, -5], [9, 12, 5], 2), tone(c), m);
    v.add(S.box([-9, -3, 3.5], [7, 6, 5.5], 0.6), 0xfbfff3, M.solid);
    for (let i = 0; i < 3; i++) v.add(S.box([-7.5 + i * 5, -1.5, 5], [-4.5 + i * 5, 4.5, 6]), 0xff3a5a, M.glow);
    v.add(S.capsule([11, -4, 0], [11, 9, 0], 1), 0xc8d2db, M.metal); v.add(S.sphere([11, 10, 0], 2.4), 0xff3a5a, M.jelly);
    v.add(S.box([-9, 8, 3.5], [7, 11, 5.5], 0.4), 0xffe14d, M.glow);
  },
  sword: (v, c, m) => {
    v.add(S.box([-1.6, -3, -1], [1.6, 13, 1], 0.4), (_x, y) => mix(0xc8d2db, 0xffffff, (y + 3) / 20), M.metal);
    v.add(S.box([-6, -5, -1.5], [6, -3, 1.5], 0.6), tone(c), m);
    v.add(S.box([-1.2, -12, -1.2], [1.2, -5, 1.2]), 0x5a3a20, M.solid); v.add(S.sphere([0, -13, 0], 1.8), tone(c), m);
  },
  cube: (v, c, m) => {
    v.add(S.box([-8, -8, -8], [8, 8, 8], 1.2), (x, y, z) => ((Math.floor((x + 8) / 5.4) + Math.floor((y + 8) / 5.4) + Math.floor((z + 8) / 5.4)) % 2 ? tone(c)(x, y) : shade(c, 0.7)), m);
    v.add(S.sphere([0, 0, 8.5], 2.4), tone(c), m); v.add(S.sphere([8.5, 0, 0], 2.4), tone(c), m);
  },
  coin: (v, c, m) => { v.add(S.disc([0, 0, 0], [0, 0, 1], 11, 2.2), tone(0xffcf3d), M.metal); v.add(S.disc([0, 0, 1.8], [0, 0, 1], 7.5, 0.8), shade(0xffcf3d, 0.8), M.metal); v.add(S.box([-1.2, -5, 2], [1.2, 5, 3.4]), 0xfff1a8, M.metal); void c; void m; },
  planet: (v, c, m) => {
    v.add(S.sphere([0, 0, 0], 8.5), (x, y, z) => (Math.sin(y * 0.7 + Math.sin(x * 0.4) * 1.4) > 0.3 ? shade(c, 0.75) : tone(c)(x, y)), m);
    v.add(S.torus([0, 0, 0], [0.25, 1, 0.35], 13, 1.4), 0xffd88a, M.metal);
  },
  hourglass: (v, c, m) => {
    v.add(S.box([-8, 10, -4], [8, 13, 4], 1), 0x5a3a20, M.solid); v.add(S.box([-8, -13, -4], [8, -10, 4], 1), 0x5a3a20, M.solid);
    v.add(S.cone(0, 0, 0, 10, 0.8, 6.5), mix(c, 0xd8fbff, 0.6), M.glass); v.add(S.cone(0, 0, 0, -10, 0.8, 6.5), mix(c, 0xd8fbff, 0.6), M.glass);
    v.add(S.cone(0, 0, -10, -5, 6, 3.2), tone(0xffcf6a), M.solid); v.add(S.cone(0, 0, 3, 8, 1, 4.5), tone(0xffcf6a), M.solid);
    void m;
  },
  heart: (v, c, m) => {
    for (let y = -12; y <= 11; y += 0.5) for (let x = -13; x <= 13; x += 0.5) {
      const X = x / 11, Y = y / 11 + 0.25, a = X * X + Y * Y - 1;
      if (a * a * a - X * X * Y * Y * Y <= 0) v.add(S.box([x, y, -3.5], [x + 0.6, y + 0.6, 3.5], 0.3), tone(c), M.jelly);
    }
    v.add(S.sphere([-5, 4, 3.5], 1.6), 0xffffff, M.glow);
    void m;
  },
  check: (v, c, m) => { bar(v, [-10, 0, 0], [-3, -8, 0], 3, tone(c), m); bar(v, [-3, -8, 0], [11, 9, 0], 3, tone(c), m); },
  close: (v, c, m) => { bar(v, [-9, -9, 0], [9, 9, 0], 3, tone(c), m); bar(v, [-9, 9, 0], [9, -9, 0], 3, tone(c), m); },
  gear: (v, c, m) => {
    v.add(S.disc([0, 0, 0], [0, 0, 1], 9, 3), tone(c), m);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; v.add(S.box([Math.cos(a) * 11 - 2, Math.sin(a) * 11 - 2, -3], [Math.cos(a) * 11 + 2, Math.sin(a) * 11 + 2, 3], 0.6), tone(c), m); }
    v.carve(S.cyl(0, 0, 3.4, -10, 10)); v.carve(S.disc([0, 0, 0], [0, 0, 1], 3.4, 4));
  },
};

const cache = new Map<string, THREE.Object3D>();

/** Build a voxel glyph. Returns a fresh clone each call (geometry shared). */
export function buildGlyph(name: GlyphName, color: number, opts: { gold?: boolean; dim?: boolean } = {}): THREE.Object3D {
  const key = `${name}|${color}|${opts.gold ? 1 : 0}|${opts.dim ? 1 : 0}`;
  let proto = cache.get(key);
  if (!proto) {
    const v = g();
    const base = opts.gold ? 0xffc53d : color;
    const sculpt = SCULPT[name] ?? SCULPT.star;
    sculpt(v, base, opts.gold ? M.metal : M.jelly, () => {});
    if (opts.gold) {
      // polished gold: everything metal-gold except glow bits, plus glints
      v.recolor((x, y, zz, c, m) => (m === M.glow ? undefined : [mix(0xb8860b, 0xfff0a0, (y + 14) / 30 + (hash3(x | 0, y | 0, zz | 0) - 0.5) * 0.08), M.metal]));
      v.recolor((x, y, zz, _c, m) => (m === M.metal && hash3(x * 3 | 0, y * 3 | 0, zz * 3 | 0, 9) > 0.992 ? [0xffffff, M.glow] : undefined));
    }
    if (opts.dim) v.recolor((x, y) => [mix(0x1b2420, 0x2c3a33, (y + 14) / 28 + (x < 0 ? 0.05 : 0)), M.solid]);
    const ink = opts.dim ? 0x070b09 : opts.gold ? 0x3a2606 : shade(mix(color, 0x0a1a12, 0.5), 0.35);
    proto = toObject(v, { size: 0.05, anchor: 'center', outline: ink, outlineWidth: 1, name: 'glyph:' + name });
    cache.set(key, proto);
  }
  return proto.clone(true);
}

export const GLYPHS = Object.keys(SCULPT) as GlyphName[];
