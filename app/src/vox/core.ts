// ─────────────────────────────────────────────────────────────────────────────
// GLOB LABS voxel engine — dense high-resolution voxel grids + SDF brushes.
//
// Everything in the app (ship, aliens, props, every UI icon) is sculpted with this:
// signed-distance brushes (sphere, ellipsoid, rounded box, capsule, n-gon prism,
// torus, cone) applied in add / carve / paint mode, with per-voxel colour functions
// so surfaces carry real texture (noise, gradients, panel lines, rosettes…).
// Coordinates: x → right, y → up, z → toward the viewer (front). Units = voxels.
// ─────────────────────────────────────────────────────────────────────────────

/** Material channel. 0 = empty. */
export const M = {
  solid: 1,   // matte painted surfaces
  jelly: 2,   // glossy clear-coated alien skin
  metal: 3,   // brushed / painted metal
  glow: 4,    // emissive (feeds bloom)
  glass: 5,   // transparent glass
  gloss: 6,   // mirror-black gloss (alien eyes, screens off)
  fur: 7,     // soft matte (cat skin, fabric)
} as const;
export type Mat = (typeof M)[keyof typeof M];

export type Col = number | ((x: number, y: number, z: number) => number);
export type Mode = 'add' | 'carve' | 'paint' | 'under';

// ── noise / colour helpers ───────────────────────────────────────────────────
export function hash3(x: number, y: number, z: number, s = 0) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise in [0,1). */
export function noise3(x: number, y: number, z: number, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const n = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, s);
  return l(l(l(n(0, 0, 0), n(1, 0, 0), u), l(n(0, 1, 0), n(1, 1, 0), u), v), l(l(n(0, 0, 1), n(1, 0, 1), u), l(n(0, 1, 1), n(1, 1, 1), u), v), w);
}
export function fbm(x: number, y: number, z: number, oct = 3, s = 0) {
  let a = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { a += amp * noise3(x * f, y * f, z * f, s + i * 17); amp *= 0.5; f *= 2; }
  return a / (1 - Math.pow(0.5, oct));
}
export const rgb = (r: number, g: number, b: number) => ((Math.max(0, Math.min(255, r | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, b | 0)));
export const hex = (s: string) => parseInt(s.replace('#', ''), 16);
export function mix(a: number, b: number, t: number) {
  t = Math.max(0, Math.min(1, t));
  return rgb(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t, ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t, (a & 255) * (1 - t) + (b & 255) * t);
}
export function shade(c: number, k: number) { return rgb(((c >> 16) & 255) * k, ((c >> 8) & 255) * k, (c & 255) * k); }
/** Per-voxel brightness jitter: the "hand-painted texture" on every surface. */
export function grain(c: number, amt: number, s = 0): (x: number, y: number, z: number) => number {
  return (x, y, z) => shade(c, 1 + (hash3(x, y, z, s) - 0.5) * 2 * amt);
}

// ── vector helpers ───────────────────────────────────────────────────────────
export type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A signed distance field + its bounding box (voxel coords). */
export interface Shape { sdf: (x: number, y: number, z: number) => number; box: [number, number, number, number, number, number] }

// ── primitive shapes ─────────────────────────────────────────────────────────
export const S = {
  sphere(c: V3, r: number): Shape {
    return { sdf: (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r, box: [c[0] - r, c[1] - r, c[2] - r, c[0] + r, c[1] + r, c[2] + r] };
  },
  ellipsoid(c: V3, r: V3): Shape {
    return {
      sdf: (x, y, z) => {
        const k0 = Math.hypot((x - c[0]) / r[0], (y - c[1]) / r[1], (z - c[2]) / r[2]);
        const k1 = Math.hypot((x - c[0]) / (r[0] * r[0]), (y - c[1]) / (r[1] * r[1]), (z - c[2]) / (r[2] * r[2]));
        return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
      },
      box: [c[0] - r[0], c[1] - r[1], c[2] - r[2], c[0] + r[0], c[1] + r[1], c[2] + r[2]],
    };
  },
  /** Axis-aligned box [min, max] with rounded edges radius rr. */
  box(min: V3, max: V3, rr = 0): Shape {
    const c: V3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const h: V3 = [(max[0] - min[0]) / 2 - rr, (max[1] - min[1]) / 2 - rr, (max[2] - min[2]) / 2 - rr];
    return {
      sdf: (x, y, z) => {
        const q: V3 = [Math.abs(x - c[0]) - h[0], Math.abs(y - c[1]) - h[1], Math.abs(z - c[2]) - h[2]];
        return Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)) + Math.min(Math.max(q[0], q[1], q[2]), 0) - rr;
      },
      box: [min[0], min[1], min[2], max[0], max[1], max[2]],
    };
  },
  /** Capsule / rod from a to b, radius r (ra→rb tapers). */
  capsule(a: V3, b: V3, ra: number, rb = ra): Shape {
    const ba = sub(b, a), bb = dot(ba, ba) || 1;
    return {
      sdf: (x, y, z) => {
        const pa = sub([x, y, z], a);
        const h = Math.max(0, Math.min(1, dot(pa, ba) / bb));
        return len([pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h]) - (ra + (rb - ra) * h);
      },
      box: [Math.min(a[0], b[0]) - Math.max(ra, rb), Math.min(a[1], b[1]) - Math.max(ra, rb), Math.min(a[2], b[2]) - Math.max(ra, rb),
        Math.max(a[0], b[0]) + Math.max(ra, rb), Math.max(a[1], b[1]) + Math.max(ra, rb), Math.max(a[2], b[2]) + Math.max(ra, rb)],
    };
  },
  /** Flat cylinder / n-gon prism centred at c with axis direction n, radius r, half-thickness t. sides=0 → round. */
  disc(c: V3, n: V3, r: number, t: number, sides = 0, spin = 0): Shape {
    const N = norm(n);
    const up: V3 = Math.abs(N[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const U = norm(cross(up, N)), W = cross(N, U);
    const R = Math.hypot(r, t) + 1;
    return {
      sdf: (x, y, z) => {
        const p = sub([x, y, z], c);
        const h = dot(p, N), u = dot(p, U), w = dot(p, W);
        let radial = Math.hypot(u, w) - r;
        if (sides >= 3) {
          const a = Math.atan2(w, u) + spin;
          const seg = (Math.PI * 2) / sides;
          const local = ((a % seg) + seg) % seg - seg / 2;
          radial = Math.hypot(u, w) * Math.cos(local) - r * Math.cos(Math.PI / sides);
        }
        const dh = Math.abs(h) - t;
        return Math.hypot(Math.max(radial, 0), Math.max(dh, 0)) + Math.min(Math.max(radial, dh), 0);
      },
      box: [c[0] - R, c[1] - R, c[2] - R, c[0] + R, c[1] + R, c[2] + R],
    };
  },
  /** Torus in the plane perpendicular to n. */
  torus(c: V3, n: V3, R: number, r: number): Shape {
    const N = norm(n);
    return {
      sdf: (x, y, z) => {
        const p = sub([x, y, z], c);
        const h = dot(p, N);
        const radial = len([p[0] - N[0] * h, p[1] - N[1] * h, p[2] - N[2] * h]) - R;
        return Math.hypot(radial, h) - r;
      },
      box: [c[0] - R - r, c[1] - R - r, c[2] - R - r, c[0] + R + r, c[1] + R + r, c[2] + R + r],
    };
  },
  /** Vertical cylinder (y axis) — common enough to deserve a fast path. */
  cyl(cx: number, cz: number, r: number, y0: number, y1: number): Shape {
    return {
      sdf: (x, y, z) => {
        const radial = Math.hypot(x - cx, z - cz) - r;
        const dh = Math.max(y0 - y, y - y1);
        return Math.hypot(Math.max(radial, 0), Math.max(dh, 0)) + Math.min(Math.max(radial, dh), 0);
      },
      box: [cx - r, y0, cz - r, cx + r, y1, cz + r],
    };
  },
  /** Cone along y from base radius rb at y0 to rt at y1. */
  cone(cx: number, cz: number, y0: number, y1: number, rb: number, rt: number): Shape {
    return {
      sdf: (x, y, z) => {
        const t = Math.max(0, Math.min(1, (y - y0) / (y1 - y0 || 1)));
        const r = rb + (rt - rb) * t;
        const radial = Math.hypot(x - cx, z - cz) - r;
        const dh = Math.max(y0 - y, y - y1);
        return Math.max(radial * 0.9, dh);
      },
      box: [cx - Math.max(rb, rt), y0, cz - Math.max(rb, rt), cx + Math.max(rb, rt), y1, cz + Math.max(rb, rt)],
    };
  },
};

/** Smooth union of two shapes (blobby joins — jelly!). */
export function smoothUnion(a: Shape, b: Shape, k: number): Shape {
  return {
    sdf: (x, y, z) => {
      const d1 = a.sdf(x, y, z), d2 = b.sdf(x, y, z);
      const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (d2 - d1)) / k));
      return d2 * (1 - h) + d1 * h - k * h * (1 - h);
    },
    box: [Math.min(a.box[0], b.box[0]) - k, Math.min(a.box[1], b.box[1]) - k, Math.min(a.box[2], b.box[2]) - k,
      Math.max(a.box[3], b.box[3]) + k, Math.max(a.box[4], b.box[4]) + k, Math.max(a.box[5], b.box[5]) + k],
  };
}

// ── the grid ─────────────────────────────────────────────────────────────────
export class VoxGrid {
  readonly col: Uint32Array;
  readonly mat: Uint8Array;
  /** Per-voxel surface texture id (0 = plain colour). See src/vox/tex.ts. */
  readonly tx: Uint8Array;
  /** Texture id stamped by subsequent add / set / paint calls (see tex()). */
  curTex = 0;
  /** Voxel coordinate of array index 0 (so models can be centred on 0). */
  readonly o: V3;
  /**
   * Voxels per model unit. Shapes and colour functions work in MODEL units; the grid
   * samples them `res` times per unit, so the same sculpt can be built finer or coarser.
   */
  res = 1;

  constructor(readonly w: number, readonly h: number, readonly d: number, origin: V3 = [0, 0, 0], res = 1) {
    this.col = new Uint32Array(w * h * d);
    this.mat = new Uint8Array(w * h * d);
    this.tx = new Uint8Array(w * h * d);
    this.o = origin;
    this.res = res;
  }

  /** Select the surface texture for following brush calls (0 = none). Chainable. */
  tex(id: number) { this.curTex = id; return this; }

  /** Grid that spans [min, max) in MODEL units at `res` voxels per unit. */
  static span(min: V3, max: V3, res = 1) {
    const a: V3 = [Math.floor(min[0] * res), Math.floor(min[1] * res), Math.floor(min[2] * res)];
    const b: V3 = [Math.ceil(max[0] * res), Math.ceil(max[1] * res), Math.ceil(max[2] * res)];
    return new VoxGrid(b[0] - a[0], b[1] - a[1], b[2] - a[2], a, res);
  }

  /** An empty grid with the same extent / resolution. */
  blank() { return new VoxGrid(this.w, this.h, this.d, [...this.o] as V3, this.res); }
  /** A full copy. */
  copy() { const g = this.blank(); g.col.set(this.col); g.mat.set(this.mat); g.tx.set(this.tx); return g; }
  /** model-unit centre of voxel index coordinate */
  mc(v: number) { return (v + 0.5) / this.res; }

  idx(x: number, y: number, z: number) {
    const i = x - this.o[0], j = y - this.o[1], k = z - this.o[2];
    if (i < 0 || j < 0 || k < 0 || i >= this.w || j >= this.h || k >= this.d) return -1;
    return i + this.w * (j + this.h * k);
  }
  get(x: number, y: number, z: number) { const i = this.idx(x, y, z); return i < 0 ? 0 : this.mat[i]; }
  color(x: number, y: number, z: number) { const i = this.idx(x, y, z); return i < 0 ? 0 : this.col[i]; }
  set(x: number, y: number, z: number, c: number, m: Mat = M.solid) {
    const i = this.idx(x, y, z); if (i < 0) return this;
    this.col[i] = c; this.mat[i] = m; this.tx[i] = this.curTex; return this;
  }
  texAt(x: number, y: number, z: number) { const i = this.idx(x, y, z); return i < 0 ? 0 : this.tx[i]; }
  del(x: number, y: number, z: number) { const i = this.idx(x, y, z); if (i >= 0) this.mat[i] = 0; return this; }

  /** Apply a shape. Voxel centres (x+.5…) inside the field are affected. */
  apply(shape: Shape, col: Col, m: Mat = M.solid, mode: Mode = 'add') {
    const R = this.res;
    const [x0, y0, z0, x1, y1, z1] = shape.box.map((v) => v * R) as [number, number, number, number, number, number];
    const xa = Math.max(Math.floor(x0) - 1, this.o[0]), xb = Math.min(Math.ceil(x1) + 1, this.o[0] + this.w);
    const ya = Math.max(Math.floor(y0) - 1, this.o[1]), yb = Math.min(Math.ceil(y1) + 1, this.o[1] + this.h);
    const za = Math.max(Math.floor(z0) - 1, this.o[2]), zb = Math.min(Math.ceil(z1) + 1, this.o[2] + this.d);
    const fn = typeof col === 'function' ? col : null;
    for (let z = za; z < zb; z++) for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
      const mx = (x + 0.5) / R, my = (y + 0.5) / R, mz = (z + 0.5) / R;
      if (shape.sdf(mx, my, mz) > 0) continue;
      const i = x - this.o[0] + this.w * (y - this.o[1] + this.h * (z - this.o[2]));
      if (mode === 'carve') { this.mat[i] = 0; continue; }
      if (mode === 'paint' && !this.mat[i]) continue;
      if (mode === 'under' && this.mat[i]) continue;
      this.col[i] = fn ? fn(mx, my, mz) : (col as number);
      if (mode !== 'paint') { this.mat[i] = m; this.tx[i] = this.curTex; } else { if (m) this.mat[i] = m; if (this.curTex) this.tx[i] = this.curTex; }
    }
    return this;
  }
  add(s: Shape, c: Col, m: Mat = M.solid) { return this.apply(s, c, m, 'add'); }
  carve(s: Shape) { return this.apply(s, 0, M.solid, 'carve'); }
  paint(s: Shape, c: Col, m?: Mat) { return this.apply(s, c, (m ?? 0) as Mat, 'paint'); }

  /** Recolour every filled voxel (texture pass, MODEL coords). Return a colour, or [colour, mat], or undefined to keep. */
  recolor(fn: (x: number, y: number, z: number, c: number, m: number) => number | [number, number] | undefined) {
    const R = this.res;
    for (let k = 0; k < this.d; k++) for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const idx = i + this.w * (j + this.h * k);
      if (!this.mat[idx]) continue;
      const c = fn((i + this.o[0] + 0.5) / R, (j + this.o[1] + 0.5) / R, (k + this.o[2] + 0.5) / R, this.col[idx], this.mat[idx]);
      if (c === undefined) continue;
      if (Array.isArray(c)) { this.col[idx] = c[0]; this.mat[idx] = c[1]; } else this.col[idx] = c;
    }
    return this;
  }

  /** Is (x,y,z) on the surface (has an empty 6-neighbour)? */
  surface(x: number, y: number, z: number) {
    if (!this.get(x, y, z)) return false;
    return !this.get(x + 1, y, z) || !this.get(x - 1, y, z) || !this.get(x, y + 1, z) || !this.get(x, y - 1, z) || !this.get(x, y, z + 1) || !this.get(x, y, z - 1);
  }

  /** Mirror the x<0 half onto x≥0 (build one side, get both). */
  mirrorX(fromNegative = true) {
    for (let k = 0; k < this.d; k++) for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const x = i + this.o[0];
      if (fromNegative ? x >= 0 : x < 0) continue;
      const mx = -x - 1;
      const src = i + this.w * (j + this.h * k);
      const dst = this.idx(mx, j + this.o[1], k + this.o[2]);
      if (dst >= 0) { this.mat[dst] = this.mat[src]; this.col[dst] = this.col[src]; this.tx[dst] = this.tx[src]; }
    }
    return this;
  }

  /** New grid: this grid grown by r voxels (26-neighbourhood) — used for outlines. */
  dilate(r = 1, color = 0x14321c): VoxGrid {
    const g = new VoxGrid(this.w + 2 * r, this.h + 2 * r, this.d + 2 * r, [this.o[0] - r, this.o[1] - r, this.o[2] - r], this.res);
    for (let k = 0; k < this.d; k++) for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      if (!this.mat[i + this.w * (j + this.h * k)]) continue;
      const x = i + this.o[0], y = j + this.o[1], z = k + this.o[2];
      for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy + dz * dz > r * r + r) continue;
        g.set(x + dx, y + dy, z + dz, color, M.solid);
      }
    }
    return g;
  }

  count() { let n = 0; for (let i = 0; i < this.mat.length; i++) if (this.mat[i]) n++; return n; }
}
