// Voxel toolkit: sculpt small models with box/ellipsoid/cylinder brushes, then mesh them
// into one BufferGeometry with vertex colours, hidden-face culling and baked per-vertex
// ambient occlusion (the chunky soft-shadow look that makes voxels feel handmade).
//
// Material channel per voxel: 0 = lit solid, >0 = emissive glow (value = intensity, fed
// to the bloom pass). Solid and glow voxels occlude each other.

import * as THREE from 'three';

const OFF = 512;
const key = (x: number, y: number, z: number) => ((x + OFF) << 20) | ((y + OFF) << 10) | (z + OFF);

export interface Voxel { c: number; m: number }

export class Vox {
  map = new Map<number, Voxel & { x: number; y: number; z: number }>();

  set(x: number, y: number, z: number, c: number, m = 0) { this.map.set(key(x, y, z), { x, y, z, c, m }); return this; }
  get(x: number, y: number, z: number) { return this.map.get(key(x, y, z)); }
  has(x: number, y: number, z: number) { return this.map.has(key(x, y, z)); }
  del(x: number, y: number, z: number) { this.map.delete(key(x, y, z)); return this; }

  /** Filled box, half-open: [x0,x1) × [y0,y1) × [z0,z1). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number | ((x: number, y: number, z: number) => number), m = 0) {
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++)
      this.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c, m);
    return this;
  }

  /** Box with rounded (chamfered) edges of radius r — the "soft voxel" look. */
  rbox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, c: number | ((x: number, y: number, z: number) => number), m = 0) {
    const cx = (x0 + x1 - 1) / 2, cy = (y0 + y1 - 1) / 2, cz = (z0 + z1 - 1) / 2;
    const hx = (x1 - x0) / 2 - r, hy = (y1 - y0) / 2 - r, hz = (z1 - z0) / 2 - r;
    for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) {
      const dx = Math.max(0, Math.abs(x - cx) - hx + 0.5), dy = Math.max(0, Math.abs(y - cy) - hy + 0.5), dz = Math.max(0, Math.abs(z - cz) - hz + 0.5);
      if (dx * dx + dy * dy + dz * dz <= r * r + 0.35) this.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c, m);
    }
    return this;
  }

  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: number | ((x: number, y: number, z: number) => number), m = 0) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
          if (d <= 1.0) this.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c, m);
        }
    return this;
  }

  /** Vertical cylinder centred at (cx, cz), radius r, from y0 to y1 (half-open). hollow = wall thickness. */
  cyl(cx: number, cz: number, r: number, y0: number, y1: number, c: number | ((x: number, y: number, z: number) => number), m = 0, hollow = 0) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
        const d = Math.hypot(x - cx, z - cz);
        if (d > r) continue;
        if (hollow && d < r - hollow) continue;
        for (let y = y0; y < y1; y++) this.set(x, y, z, typeof c === 'function' ? c(x, y, z) : c, m);
      }
    return this;
  }

  /** Recolour existing voxels. */
  paint(fn: (v: Voxel & { x: number; y: number; z: number }) => number | undefined) {
    for (const v of this.map.values()) { const c = fn(v); if (c !== undefined) v.c = c; }
    return this;
  }

  carve(fn: (x: number, y: number, z: number) => boolean) {
    for (const [k, v] of this.map) if (fn(v.x, v.y, v.z)) this.map.delete(k);
    return this;
  }

  bounds() {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const v of this.map.values()) {
      x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); z0 = Math.min(z0, v.z);
      x1 = Math.max(x1, v.x + 1); y1 = Math.max(y1, v.y + 1); z1 = Math.max(z1, v.z + 1);
    }
    return { x0, y0, z0, x1, y1, z1 };
  }

  /** Merge another model in at an offset. */
  add(other: Vox, ox = 0, oy = 0, oz = 0) {
    for (const v of other.map.values()) this.set(v.x + ox, v.y + oy, v.z + oz, v.c, v.m);
    return this;
  }
}

// face tables: normal + 4 corners (CCW from outside)
const FACES: { n: [number, number, number]; c: [number, number, number][] }[] = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const AO_CURVE = [0.5, 0.68, 0.84, 1];

const hash3 = (x: number, y: number, z: number) => {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export interface BuildOpts {
  /** world size of one voxel */
  size: number;
  /** colour noise amount (0..0.2) for a hand-painted feel */
  jitter?: number;
  /** recentre: 'xz' puts the model's footprint centre at origin with y=0 at its base */
  center?: 'xz' | 'xyz' | 'none';
  /** explicit origin offset in voxels (applied when center='none') */
  origin?: [number, number, number];
  /** skip AO (cheaper, flatter) */
  noAO?: boolean;
  /** strength of the AO darkening 0..1 */
  ao?: number;
}

export interface BuiltVox { solid: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null; size: THREE.Vector3; offset: THREE.Vector3 }

const tmpColor = new THREE.Color();

export function buildVox(v: Vox, opts: BuildOpts): BuiltVox {
  const s = opts.size;
  const jitter = opts.jitter ?? 0.06;
  const aoK = opts.ao ?? 1;
  const b = v.bounds();
  let ox = 0, oy = 0, oz = 0;
  if (opts.center === 'xz' || opts.center === undefined) { ox = -(b.x0 + b.x1) / 2; oy = -b.y0; oz = -(b.z0 + b.z1) / 2; }
  else if (opts.center === 'xyz') { ox = -(b.x0 + b.x1) / 2; oy = -(b.y0 + b.y1) / 2; oz = -(b.z0 + b.z1) / 2; }
  else if (opts.origin) { [ox, oy, oz] = opts.origin.map((n) => -n) as [number, number, number]; }

  const buckets: Record<'solid' | 'glow', { pos: number[]; nor: number[]; col: number[]; idx: number[] }> = {
    solid: { pos: [], nor: [], col: [], idx: [] },
    glow: { pos: [], nor: [], col: [], idx: [] },
  };
  const solidAt = (x: number, y: number, z: number) => (v.has(x, y, z) ? 1 : 0);

  for (const vx of v.map.values()) {
    const { x, y, z } = vx;
    const bucket = vx.m > 0 ? buckets.glow : buckets.solid;
    tmpColor.setHex(vx.c);
    if (vx.m > 0) tmpColor.multiplyScalar(vx.m);
    const n = jitter ? 1 + (hash3(x, y, z) - 0.5) * 2 * jitter : 1;
    const r = tmpColor.r * n, g = tmpColor.g * n, bl = tmpColor.b * n;
    for (const f of FACES) {
      const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
      if (v.has(nx, ny, nz)) continue;
      const base = bucket.pos.length / 3;
      const aos: number[] = [];
      for (const c of f.c) {
        bucket.pos.push((x + c[0] + ox) * s, (y + c[1] + oy) * s, (z + c[2] + oz) * s);
        bucket.nor.push(f.n[0], f.n[1], f.n[2]);
        let ao = 3;
        if (!opts.noAO && vx.m === 0) {
          // tangent offsets for this corner
          const t: number[][] = [];
          for (let a = 0; a < 3; a++) if (f.n[a] === 0) { const o = [0, 0, 0]; o[a] = c[a] === 1 ? 1 : -1; t.push(o); }
          const s1 = solidAt(nx + t[0][0], ny + t[0][1], nz + t[0][2]);
          const s2 = solidAt(nx + t[1][0], ny + t[1][1], nz + t[1][2]);
          const cc = solidAt(nx + t[0][0] + t[1][0], ny + t[0][1] + t[1][1], nz + t[0][2] + t[1][2]);
          ao = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
        }
        aos.push(ao);
        const k = 1 - (1 - AO_CURVE[ao]) * aoK;
        bucket.col.push(r * k, g * k, bl * k);
      }
      if (aos[0] + aos[2] < aos[1] + aos[3]) bucket.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      else bucket.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const make = (bk: typeof buckets.solid) => {
    if (!bk.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bk.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(bk.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(bk.col, 3));
    g.setIndex(bk.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(bk.idx, 1) : new THREE.Uint16BufferAttribute(bk.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  };
  return {
    solid: make(buckets.solid), glow: make(buckets.glow),
    size: new THREE.Vector3((b.x1 - b.x0) * s, (b.y1 - b.y0) * s, (b.z1 - b.z0) * s),
    offset: new THREE.Vector3(ox * s, oy * s, oz * s),
  };
}

// ── shared materials ─────────────────────────────────────────────────────────
export const MAT = {
  solid: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};

/** Turn a Vox into a ready Group (solid + glow meshes). */
export function voxMesh(v: Vox, opts: BuildOpts & { material?: THREE.Material; castShadow?: boolean; receiveShadow?: boolean }): THREE.Group {
  const built = buildVox(v, opts);
  const g = new THREE.Group();
  if (built.solid) {
    const m = new THREE.Mesh(built.solid, opts.material ?? MAT.solid);
    m.castShadow = opts.castShadow ?? true; m.receiveShadow = opts.receiveShadow ?? true;
    g.add(m);
  }
  if (built.glow) g.add(new THREE.Mesh(built.glow, MAT.glow));
  g.userData.voxSize = built.size;
  return g;
}

/** Merge many geometries with the same attribute layout into one (static scenery batching). */
export function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  const list = geos.filter(Boolean);
  if (!list.length) return null;
  let vcount = 0, icount = 0;
  for (const g of list) { vcount += g.attributes.position.count; icount += g.index!.count; }
  const pos = new Float32Array(vcount * 3), nor = new Float32Array(vcount * 3), col = new Float32Array(vcount * 3);
  const idx = vcount > 65535 ? new Uint32Array(icount) : new Uint16Array(icount);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array as Float32Array, vo * 3);
    nor.set(g.attributes.normal.array as Float32Array, vo * 3);
    col.set(g.attributes.color.array as Float32Array, vo * 3);
    const gi = g.index!.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/** Bake a transform into a clone of the geometry (for merging placed scenery). */
export function placed(g: THREE.BufferGeometry | null, x: number, y: number, z: number, rotY = 0, scale = 1): THREE.BufferGeometry | null {
  if (!g) return null;
  const c = g.clone();
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(scale, scale, scale));
  c.applyMatrix4(m);
  return c;
}

/** Colour helpers */
export const shade = (hex: number, k: number) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); };
export const mix = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
export const hex = (css: string) => new THREE.Color(css).getHex();
