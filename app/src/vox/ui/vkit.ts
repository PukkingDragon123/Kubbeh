// Small sculpting helpers for UI voxel models (icons, HUD objects): extruded 2D outlines,
// clean bevel shading (lit top edges, shaded undersides — structured, never speckle noise),
// and a one-liner to mesh a grid with the house inked outline.
import * as THREE from 'three';
import { M, VoxGrid, shade, type Shape, type V3, type Mat } from '../core';
import { toObject } from '../mesh';

export const INK = 0x0a0f16;

/** Palette for the spaceship UI family. */
export const C = {
  steel: 0x8a98a6, steelHi: 0xc4d0da, steelLo: 0x4c5864, gun: 0x3a434d, dark: 0x1c232b,
  glob: 0x8cf56b, globDeep: 0x2f9a3a, pink: 0xff6fd6, pinkDeep: 0xc23d9c, cyan: 0x52f2ff, cyanDeep: 0x1b8fb0,
  amber: 0xffbe3d, amberDeep: 0xc4801a, red: 0xff4f4f, redDeep: 0xa61f2a, white: 0xf4f8fb, cream: 0xfff6e0,
  gold: 0xf2c14a, goldDeep: 0xa8781c, brass: 0xd6a646, wood: 0xb47a46, paper: 0xf2efe6, ink: 0x1a1f26,
  violet: 0xb48cff, glass: 0xbfefff, screen: 0x0b2a1c,
};

export type P2 = [number, number];

/** Signed distance to a 2D polygon (Inigo Quilez). */
function sdPoly(px: number, py: number, v: P2[]) {
  let d = (px - v[0][0]) ** 2 + (py - v[0][1]) ** 2;
  let s = 1;
  for (let i = 0, j = v.length - 1; i < v.length; j = i, i++) {
    const ex = v[j][0] - v[i][0], ey = v[j][1] - v[i][1];
    const wx = px - v[i][0], wy = py - v[i][1];
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
    const bx = wx - ex * t, by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= v[i][1], c2 = py < v[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s *= -1;
  }
  return s * Math.sqrt(d);
}

/** Extrude a 2D outline (x,y) between z0..z1, with a rounded bevel r. */
export function prism(pts: P2[], z0: number, z1: number, r = 0): Shape {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const zc = (z0 + z1) / 2, hz = (z1 - z0) / 2 - r;
  return {
    sdf: (x, y, z) => {
      const d2 = sdPoly(x, y, pts) + r;
      const dz = Math.abs(z - zc) - hz;
      return Math.hypot(Math.max(d2, 0), Math.max(dz, 0)) + Math.min(Math.max(d2, dz), 0) - r;
    },
    box: [x0 - 1, y0 - 1, z0 - 1, x1 + 1, y1 + 1, z1 + 1],
  };
}

/** A polyline "stroke" extruded in z (letters, ticks, arrows): capsule chain thickness w. */
export function stroke(pts: P2[], w: number, z0: number, z1: number): Shape[] {
  const out: Shape[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push(segZ(a, b, w, z0, z1));
  }
  return out;
}
function segZ(a: P2, b: P2, w: number, z0: number, z1: number): Shape {
  const ex = b[0] - a[0], ey = b[1] - a[1], ll = ex * ex + ey * ey || 1;
  const zc = (z0 + z1) / 2, hz = (z1 - z0) / 2;
  return {
    sdf: (x, y, z) => {
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / ll));
      const d2 = Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t) - w / 2;
      const dz = Math.abs(z - zc) - hz;
      return Math.hypot(Math.max(d2, 0), Math.max(dz, 0)) + Math.min(Math.max(d2, dz), 0);
    },
    box: [Math.min(a[0], b[0]) - w, Math.min(a[1], b[1]) - w, z0 - 1, Math.max(a[0], b[0]) + w, Math.max(a[1], b[1]) + w, z1 + 1],
  };
}

/** Regular star / polygon outline. */
export function starPts(n: number, ro: number, ri: number, cx = 0, cy = 0, rot = -Math.PI / 2): P2[] {
  const p: P2[] = [];
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? ri : ro; const a = rot + (i * Math.PI) / n; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return p;
}
export function ngonPts(n: number, r: number, cx = 0, cy = 0, rot = Math.PI / 2): P2[] {
  const p: P2[] = [];
  for (let i = 0; i < n; i++) { const a = rot + (i * Math.PI * 2) / n; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return p;
}

/**
 * Clean bevel shading — the hand-painted voxel-art look: voxels whose top is open get a
 * highlight, undersides a shade, and front-facing rims a soft lift. Glow voxels untouched.
 */
export function bevel(g: VoxGrid, hi = 0.14, lo = 0.2) {
  const W = g.w, H = g.h;
  const at = (i: number, j: number, k: number) => (i < 0 || j < 0 || k < 0 || i >= g.w || j >= g.h || k >= g.d ? 0 : g.mat[i + W * (j + H * k)]);
  const out = new Uint32Array(g.col);
  for (let k = 0; k < g.d; k++) for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    const idx = i + W * (j + H * k);
    const m = g.mat[idx];
    if (!m || m === M.glow || m === M.glass) continue;
    let f = 1;
    if (!at(i, j + 1, k)) f += hi;
    if (!at(i, j - 1, k)) f -= lo;
    if (!at(i - 1, j, k) || !at(i + 1, j, k)) f -= lo * 0.25;
    if (f !== 1) out[idx] = shade(g.col[idx], f);
  }
  g.col.set(out);
  return g;
}

/** Make a grid spanning [min,max) at `res`. */
export const grid = (min: V3, max: V3, res = 2) => VoxGrid.span(min, max, res);

/**
 * Mesh with the house style: clean bevel, inked outline. Glass voxels are meshed
 * separately and never outlined (an outline shell around hollow glass would paint an
 * opaque inner wall over whatever sits inside). Models keep their own origin; the
 * studio / HUD stage frame them by bounding sphere.
 */
export function obj(g: VoxGrid, opts: { outline?: number | false; size?: number; doBevel?: boolean; name?: string; ao?: number } = {}): THREE.Group {
  if (opts.doBevel !== false) bevel(g);
  let glass: VoxGrid | null = null;
  for (let i = 0; i < g.mat.length; i++) if (g.mat[i] === M.glass) {
    if (!glass) glass = g.blank();
    glass.mat[i] = M.glass; glass.col[i] = g.col[i]; g.mat[i] = 0;
  }
  const size = opts.size ?? 0.05;
  const out = toObject(g, {
    size, anchor: 'none', ao: opts.ao ?? 0.7, name: opts.name,
    outline: opts.outline === false ? undefined : (opts.outline ?? INK),
    outlineWidth: Math.max(1, Math.round(g.res * 0.75)),
  });
  if (glass) out.add(toObject(glass, { size, anchor: 'none', occluder: g, name: 'glass' }));
  return out;
}

/** Vertical gradient colour function between two colours over y0..y1. */
export const vgrad = (a: number, b: number, y0: number, y1: number) => (_x: number, y: number) => {
  const t = Math.max(0, Math.min(1, (y - y0) / (y1 - y0 || 1)));
  const ra = (a >> 16) & 255, ga = (a >> 8) & 255, ba = a & 255;
  return (Math.round(ra + (((b >> 16) & 255) - ra) * t) << 16) | (Math.round(ga + (((b >> 8) & 255) - ga) * t) << 8) | Math.round(ba + ((b & 255) - ba) * t);
};

export { M, type Mat };
