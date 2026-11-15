// Voxel surface textures: a procedural pixel-art atlas (8×8 tiles of 64 px, ~32 texels per
// world unit) sampled per voxel face in the material shader and multiplied with the voxel's
// colour + baked AO. Textures are DETAIL maps around a neutral grey (128 = ×1.0): seams,
// bevels, rivets, scratches, rust streaks, grain — deliberate shapes, never random speckle,
// so the voxel colour still decides the paint and the texture adds the craft.
//
//   g.tex(T.hull).add(S.box(...), PAL.hull, M.metal)   // stamp a texture onto voxels
import * as THREE from 'three';

export const T = {
  none: 0, hull: 1, tread: 2, grate: 3, paint: 4, wood: 5, worn: 6, glass: 7, fabric: 8,
  rubber: 9, console: 10, pipe: 11, rust: 12, crate: 13, tile: 14, vent: 15, plateBig: 16,
} as const;
export type TexId = (typeof T)[keyof typeof T];

const TILE = 64, GRID = 8, ATLAS = TILE * GRID;
type RGB = [number, number, number];

class Painter {
  d = new Uint8ClampedArray(TILE * TILE * 4);
  constructor() { for (let i = 0; i < TILE * TILE; i++) { this.d[i * 4] = 128; this.d[i * 4 + 1] = 128; this.d[i * 4 + 2] = 128; this.d[i * 4 + 3] = 255; } }
  i(x: number, y: number) { return ((((y | 0) % TILE) + TILE) % TILE) * TILE + ((((x | 0) % TILE) + TILE) % TILE); }
  set(x: number, y: number, c: RGB | number) { const k = this.i(x, y) * 4; const v = typeof c === 'number' ? [c, c, c] : c; this.d[k] = v[0]; this.d[k + 1] = v[1]; this.d[k + 2] = v[2]; }
  get(x: number, y: number): RGB { const k = this.i(x, y) * 4; return [this.d[k], this.d[k + 1], this.d[k + 2]]; }
  mul(x: number, y: number, f: number) { const k = this.i(x, y) * 4; this.d[k] *= f; this.d[k + 1] *= f; this.d[k + 2] *= f; }
  rect(x: number, y: number, w: number, h: number, c: RGB | number) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  hline(x: number, y: number, w: number, c: RGB | number) { this.rect(x, y, w, 1, c); }
  vline(x: number, y: number, h: number, c: RGB | number) { this.rect(x, y, 1, h, c); }
  /** bevelled rectangle: 1 px light top/left, 1 px dark bottom/right, dark gap ring outside */
  plate(x: number, y: number, w: number, h: number, base = 128, gap = 62, hi = 150, lo = 104) {
    this.rect(x, y, w, h, gap);
    this.rect(x + 1, y + 1, w - 2, h - 2, base);
    this.hline(x + 1, y + 1, w - 2, hi); this.vline(x + 1, y + 1, h - 2, hi);
    this.hline(x + 1, y + h - 2, w - 2, lo); this.vline(x + w - 2, y + 1, h - 2, lo);
  }
  rivet(x: number, y: number) { this.set(x, y, 178); this.set(x + 1, y, 132); this.set(x, y + 1, 118); this.set(x + 1, y + 1, 84); }
  screw(x: number, y: number) { this.rect(x - 1, y - 1, 3, 3, 96); this.set(x, y, 160); this.set(x - 1, y, 120); this.set(x + 1, y, 120); }
  streak(x: number, y: number, len: number, c: RGB, c2: RGB) { for (let i = 0; i < len; i++) this.set(x, y + i, i < len * 0.55 ? c : c2); }
  scratch(x: number, y: number, len: number, dx: number, dy: number, c = 152) { for (let i = 0; i < len; i++) this.set(x + Math.round(i * dx), y + Math.round(i * dy), c); }
  /** tiny 3×5 stencil digits */
  digits(x: number, y: number, s: string, c: number) {
    const F: Record<string, string[]> = { '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '011', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'], '7': ['111', '001', '010', '010', '010'], '9': ['111', '101', '111', '001', '111'], 'A': ['010', '101', '111', '101', '101'], 'B': ['110', '101', '110', '101', '110'], 'G': ['011', '100', '101', '101', '011'], 'L': ['100', '100', '100', '100', '111'], '-': ['000', '000', '111', '000', '000'] };
    let cx = x;
    for (const ch of s) { const g = F[ch]; if (g) for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r][q] === '1') this.set(cx + q, y + r, c); cx += 4; }
  }
}
const h2 = (a: number, b: number, s = 0) => { let h = (a * 374761393 + b * 668265263 + s * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const RUST: RGB = [172, 112, 80], RUST2: RGB = [150, 104, 84];

// ── painters (each fills one 64×64 tile = 2×2 world units) ───────────────────
const PAINT: Record<number, (p: Painter) => void> = {
  [T.hull]: (p) => {
    // four riveted plates per tile, staggered seams, rivet rows, a few scratches + rust bleeds, one stencil code
    p.plate(0, 0, 32, 32); p.plate(32, 0, 32, 32); p.plate(0, 32, 40, 32); p.plate(40, 32, 24, 32);
    for (const [y, x0, x1] of [[3, 3, 30], [3, 35, 62], [35, 3, 38], [35, 43, 62]] as [number, number, number][]) for (let x = x0; x < x1; x += 5) p.rivet(x, y);
    for (const [y, x0, x1] of [[27, 3, 30], [27, 35, 62], [59, 3, 38], [59, 43, 62]] as [number, number, number][]) for (let x = x0; x < x1; x += 5) p.rivet(x, y);
    p.scratch(8, 12, 9, 1, 0.35); p.scratch(44, 16, 6, 1, -0.5); p.scratch(14, 46, 11, 1, 0.2, 146);
    p.streak(13, 5, 7, RUST, RUST2); p.streak(48, 37, 9, RUST, RUST2); p.streak(23, 37, 5, RUST, RUST2);
    p.digits(49, 46, '07', 168);
  },
  [T.plateBig]: (p) => {
    // one big plate per tile with a weld bead and corner bolts (large surfaces read calmer)
    p.plate(0, 0, 64, 64);
    for (const [x, y] of [[4, 4], [58, 4], [4, 58], [58, 58]]) p.screw(x, y);
    for (let x = 6; x < 58; x += 3) { p.set(x, 32, 112); p.set(x + 1, 32, 140); }
    p.scratch(10, 18, 14, 1, 0.3); p.streak(31, 34, 10, RUST, RUST2); p.scratch(40, 48, 8, 1, -0.4, 148);
  },
  [T.tread]: (p) => {
    // diamond tread plate: raised slanted bars alternating direction, plate seam on the tile edge
    p.plate(0, 0, 64, 64, 124, 70, 140, 108);
    for (let y = 4; y < 60; y += 6) for (let x = 4; x < 60; x += 6) {
      const up = ((x + y) / 6) % 2 < 1;
      for (let i = 0; i < 4; i++) { const yy = y + (up ? 3 - i : i); p.set(x + i, yy, 150); p.set(x + i, yy + 1, 100); }
    }
    for (const [x, y] of [[3, 3], [60, 3], [3, 60], [60, 60]]) p.screw(x, y);
  },
  [T.grate]: (p) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const bx = x % 8, by = y % 8;
      if (bx < 2 || by < 2) p.set(x, y, bx === 0 || by === 0 ? 158 : 118);
      else p.set(x, y, 40 + (bx + by) * 2);
    }
  },
  [T.paint]: (p) => {
    // painted panel: big panel with screws, chipped edges showing bare metal, a stencilled code + arrow
    p.plate(0, 0, 64, 64, 128, 76, 146, 108);
    for (const [x, y] of [[4, 4], [59, 4], [4, 59], [59, 59]]) p.screw(x, y);
    const chips = [[2, 20, 4, 2], [30, 2, 5, 2], [61, 40, 2, 5], [18, 61, 6, 2], [44, 61, 3, 2]];
    for (const [x, y, w, h] of chips) { p.rect(x, y, w, h, 176); p.hline(x, y + h, w, 96); }
    p.digits(8, 8, 'GL-7', 104);
    for (let i = 0; i < 6; i++) p.hline(46 + i, 50 - i, 10 - 2 * i, 104);
  },
  [T.worn]: (p) => {
    // worn painted surface: scuffs along a walking line, chip clusters, no seams
    for (const [x, y, w] of [[6, 10, 7], [40, 22, 10], [20, 44, 6], [50, 54, 8]]) { p.hline(x, y, w, 150); p.hline(x + 1, y + 1, w - 2, 112); }
    for (const [x, y] of [[12, 30], [36, 8], [54, 36], [28, 58], [6, 52]]) { p.rect(x, y, 2, 2, 168); p.set(x + 2, y + 1, 104); }
    p.scratch(30, 30, 12, 1, 0.5, 146);
  },
  [T.wood]: (p) => {
    // planks: 4 boards per tile, staggered butt joints, 2-3 grain lines, knots, nails
    for (let r = 0; r < 4; r++) {
      const y0 = r * 16, jx = Math.floor(h2(r, 1) * 64);
      p.rect(0, y0, 64, 16, 128);
      p.hline(0, y0, 64, 70); p.hline(0, y0 + 1, 64, 150); p.hline(0, y0 + 15, 64, 100);
      p.vline(jx, y0, 16, 70); p.vline((jx + 1) % 64, y0 + 1, 14, 146);
      for (let g = 0; g < 3; g++) {
        let y = y0 + 3 + Math.floor(h2(r, g + 4) * 10); const x0 = Math.floor(h2(r, g + 9) * 64), len = 20 + Math.floor(h2(r, g + 12) * 30);
        for (let i = 0; i < len; i++) { if (i % 13 === 12) y += h2(r, i) < 0.5 ? 1 : -1; if (y > y0 + 1 && y < y0 + 15) p.set(x0 + i, y, 110); }
      }
      const kx = Math.floor(h2(r, 20) * 60), ky = y0 + 8;
      for (let yy = -2; yy <= 2; yy++) for (let xx = -3; xx <= 3; xx++) { const d = (xx / 3) ** 2 + (yy / 2) ** 2; if (d < 0.4) p.set(kx + xx, ky + yy, 78); else if (d < 1) p.set(kx + xx, ky + yy, 108); }
      for (const nx of [jx + 3, jx - 4]) { p.set(nx, y0 + 4, 60); p.set(nx, y0 + 11, 60); p.set(nx + 1, y0 + 4, 150); p.set(nx + 1, y0 + 11, 150); }
    }
  },
  [T.glass]: (p) => {
    // glass: a couple of long diagonal wipe streaks and a corner smudge (multiplied over the tint)
    for (let i = 0; i < 64; i++) { p.set(i, 60 - i, 168); p.set(i + 1, 60 - i, 150); p.set(i + 10, 63 - i, 150); }
    for (let i = 0; i < 20; i++) p.set(4 + i, 24 - i, 160);
    p.rect(50, 4, 6, 3, 146);
  },
  [T.fabric]: (p) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.set(x, y, ((x >> 1) + (y >> 1)) % 2 ? 136 : 118);
    for (let x = 0; x < 64; x += 3) { p.set(x, 31, 168); p.set(x, 63, 168); }        // stitching
    for (let y = 0; y < 64; y += 3) { p.set(31, y, 168); }
  },
  [T.rubber]: (p) => {
    for (let y = 0; y < 64; y++) { const r = y % 4; p.hline(0, y, 64, r === 0 ? 150 : r === 1 ? 120 : r === 2 ? 100 : 92); }
  },
  [T.console]: (p) => {
    // console fascia: panel lines, vent slots, screw heads, a row of switches and tiny label strips
    p.plate(0, 0, 64, 32, 124); p.plate(0, 32, 30, 32, 124); p.plate(30, 32, 34, 32, 124);
    for (let i = 0; i < 6; i++) { p.hline(6, 8 + i * 3, 18, 72); p.hline(6, 9 + i * 3, 18, 146); }
    for (let i = 0; i < 6; i++) { const x = 32 + i * 5; p.rect(x, 8, 3, 5, 92); p.rect(x + 1, 8, 1, 2, 170); }
    for (let i = 0; i < 6; i++) p.hline(32 + i * 5, 16, 3, 160);
    for (const [x, y] of [[4, 36], [24, 36], [36, 36], [58, 36], [4, 58], [24, 58], [36, 58], [58, 58]]) p.screw(x, y);
    p.rect(8, 44, 14, 6, 96); p.rect(40, 44, 16, 4, 150); p.rect(40, 50, 10, 4, 150);
  },
  [T.pipe]: (p) => {
    for (let y = 0; y < 64; y++) { p.hline(0, y, 64, 128); }
    for (const y of [0, 32]) { p.hline(0, y, 64, 82); p.hline(0, y + 1, 64, 160); p.hline(0, y + 2, 64, 146); p.hline(0, y + 3, 64, 104); }
    for (let x = 0; x < 64; x += 4) { p.set(x, 16, 112); p.set(x + 1, 16, 142); }                 // weld bead
    p.streak(20, 4, 12, RUST, RUST2);
  },
  [T.rust]: (p) => {
    p.plate(0, 0, 64, 64, 120);
    for (const [cx, cy, r] of [[18, 20, 9], [46, 44, 11], [52, 12, 5]]) for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y * 1.2) / r; if (d < 0.75) p.set(cx + x, cy + y, RUST2); else if (d < 1) p.set(cx + x, cy + y, RUST);
    }
    for (const x of [10, 30, 48]) p.streak(x, 30, 14, RUST, RUST2);
  },
  [T.crate]: (p) => {
    // slatted crate face: frame boards + diagonal brace, nails
    p.rect(0, 0, 64, 64, 128);
    for (let r = 0; r < 4; r++) { p.hline(0, r * 16, 64, 76); p.hline(0, r * 16 + 1, 64, 150); }
    for (const x of [0, 58]) { p.rect(x, 0, 6, 64, 136); p.vline(x, 0, 64, 80); p.vline(x + 5, 0, 64, 104); }
    for (let i = 0; i < 52; i++) { p.set(6 + i, 58 - i, 150); p.set(7 + i, 58 - i, 104); }
    for (const [x, y] of [[2, 4], [2, 60], [60, 4], [60, 60]]) { p.set(x, y, 60); p.set(x + 1, y, 160); }
    p.digits(22, 26, 'GLB', 96);
  },
  [T.tile]: (p) => {
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) p.plate(tx * 16, ty * 16, 16, 16, 128 + ((tx + ty) % 2 ? 6 : -4), 92, 146, 112);
  },
  [T.vent]: (p) => {
    p.plate(0, 0, 64, 64, 120);
    for (let y = 8; y < 56; y += 4) { p.hline(8, y, 48, 52); p.hline(8, y + 1, 48, 82); p.hline(8, y + 2, 48, 156); }
    for (const [x, y] of [[4, 4], [59, 4], [4, 59], [59, 59]]) p.screw(x, y);
  },
};

let atlasTex: THREE.DataTexture | null = null;

/** The shared atlas texture (built once, nearest-filtered, linear data). */
export function voxAtlas(): THREE.DataTexture {
  if (atlasTex) return atlasTex;
  const data = new Uint8Array(ATLAS * ATLAS * 4);
  for (let i = 0; i < ATLAS * ATLAS; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 128; data[i * 4 + 3] = 255; }
  for (const [idStr, fn] of Object.entries(PAINT)) {
    const id = +idStr;
    const p = new Painter(); fn(p);
    const tx = (id - 1) % GRID, ty = Math.floor((id - 1) / GRID);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const s = (y * TILE + x) * 4;
      // texture rows are bottom-up: flip so painter y-down reads top-down on surfaces
      const d = (((ty * TILE) + (TILE - 1 - y)) * ATLAS + tx * TILE + x) * 4;
      data[d] = p.d[s]; data[d + 1] = p.d[s + 1]; data[d + 2] = p.d[s + 2]; data[d + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, ATLAS, ATLAS, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  atlasTex = t;
  return t;
}

/** GLSL injected into voxel materials (see mesh.ts texturedMaterial). */
export const TEX_GLSL = {
  atlasGrid: GRID.toFixed(1),
  /** atlas tiles per world unit (one 64 px tile spans 2 world units → 32 texels / unit) */
  scale: '0.5',
};
