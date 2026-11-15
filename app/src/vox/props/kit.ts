// Ship kit helpers: the GLOB LABS mothership palette and *structured* voxel textures —
// plate seams, rivets, edge highlights, hazard stripes, grime gradients, decals. No random
// speckle: every darker or lighter voxel means something (a seam, a bolt, a worn edge).
//
// Units: props are modelled in MODEL units where 16 units = 1 world unit (one floor cell),
// and sampled at `res` voxels per unit (res 2 → 1/32 world unit voxels).
import * as THREE from 'three';
import { M, VoxGrid, hash3, mix, shade, type V3 } from '../core';
import { toObject, materials, type BuildOptions } from '../mesh';

/** world units per model unit */
export const U = 1 / 16;

export const PAL = {
  hull: 0x56626c, hullDark: 0x37414a, hullDeep: 0x232a31, hullHi: 0x7d8b96,
  steel: 0x8c98a2, steelDark: 0x5a646d, chrome: 0xc3ccd3,
  floor: 0x3d454d, floorHi: 0x58626b, grate: 0x1b2025,
  paintTeal: 0x2f8f7a, paintTealDark: 0x1f6656, paintCream: 0xd9d2bd, paintRed: 0xc8443c, paintOrange: 0xe0812f,
  glob: 0x8cf56b, globDeep: 0x2a8f2f, pink: 0xff6fd6, cyan: 0x52f2ff, amber: 0xffbe3d, violet: 0xb48cff, red: 0xff4a3d,
  hazardY: 0xf2b632, hazardK: 0x1c1c1e,
  rubber: 0x24282c, cable: 0x2a2f34, wood: 0x8a5a33, woodDark: 0x5e3b20,
  glass: 0xbfeff0, screenOff: 0x0b1416,
};

// ── structured texture functions ─────────────────────────────────────────────

/** Riveted plate texture on a plane: (u,v) in model units on the plate's face. */
export function plate(base: number, u: number, v: number, o: { pw?: number; ph?: number; bolt?: boolean; edge?: number; grime?: number; y?: number } = {}) {
  const pw = o.pw ?? 16, ph = o.ph ?? 16;
  const fu = ((u % pw) + pw) % pw, fv = ((v % ph) + ph) % ph;
  if (fu < 0.6 || fv < 0.6) return shade(base, 0.62);                    // seam groove
  if (fv > ph - 1.1 || fu < 1.3) return shade(base, 1.14);                // worn upper / left bevel
  if (o.bolt !== false) {
    const bu = Math.min(fu, pw - fu), bv = Math.min(fv, ph - fv);
    if (bu > 1.4 && bu < 2.6 && bv > 1.4 && bv < 2.6) return PAL.chrome;  // rivet
  }
  let c = base;
  if (o.grime && o.y !== undefined) c = mix(c, shade(base, 0.72), Math.max(0, Math.min(1, (o.grime - o.y) / o.grime)) * 0.6);
  return c;
}

/** Diagonal hazard stripes. */
export function hazard(u: number, v: number, w = 4) {
  return Math.floor((u + v) / w) % 2 === 0 ? PAL.hazardY : PAL.hazardK;
}

/** Floor grate: dark bars with a glowing gap pattern (returns [colour, mat]). */
export function grateCell(u: number, v: number): [number, number] {
  const gu = ((u % 4) + 4) % 4, gv = ((v % 4) + 4) % 4;
  if (gu < 1.1 || gv < 1.1) return [PAL.grate, M.metal];
  return [0x1d4d2a, M.glow];
}

/** Small deterministic per-panel variation (not per-voxel noise): tints whole plates. */
export function plateTint(base: number, u: number, v: number, pw = 16, ph = 16, amt = 0.06) {
  const k = 1 + (hash3(Math.floor(u / pw), Math.floor(v / ph), 3, 77) - 0.5) * 2 * amt;
  return shade(base, k);
}

/** Vertical gradient (bottom → top) for painted surfaces. */
export const vgrad = (bottom: number, top: number, y: number, y0: number, y1: number) => mix(bottom, top, (y - y0) / (y1 - y0 || 1));

// ── tiny voxel font (3D lettering for signs / labels on props) ───────────────
const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '11111', '10001', '10001'], B: ['11110', '10001', '11110', '10001', '11110'], C: ['01111', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '11110'], E: ['11111', '10000', '11110', '10000', '11111'], F: ['11111', '10000', '11110', '10000', '10000'],
  G: ['01111', '10000', '10011', '10001', '01111'], H: ['10001', '10001', '11111', '10001', '10001'], I: ['111', '010', '010', '010', '111'],
  J: ['00111', '00010', '00010', '10010', '01100'], K: ['10010', '10100', '11000', '10100', '10010'], L: ['10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10001', '10001'], N: ['10001', '11001', '10101', '10011', '10001'], O: ['01110', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '11110', '10000', '10000'], Q: ['01110', '10001', '10101', '10010', '01101'], R: ['11110', '10001', '11110', '10010', '10001'],
  S: ['01111', '10000', '01110', '00001', '11110'], T: ['11111', '00100', '00100', '00100', '00100'], U: ['10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '01010', '00100'], W: ['10001', '10001', '10101', '11011', '10001'], X: ['10001', '01010', '00100', '01010', '10001'],
  Y: ['10001', '01010', '00100', '00100', '00100'], Z: ['11111', '00010', '00100', '01000', '11111'],
  '0': ['01110', '10011', '10101', '11001', '01110'], '1': ['010', '110', '010', '010', '111'], '2': ['11110', '00001', '01110', '10000', '11111'],
  '3': ['11110', '00001', '00110', '00001', '11110'], '4': ['10010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '11110'],
  '6': ['01110', '10000', '11110', '10001', '01110'], '7': ['11111', '00010', '00100', '01000', '01000'], '8': ['01110', '10001', '01110', '10001', '01110'],
  '9': ['01110', '10001', '01111', '00001', '01110'], '-': ['000', '000', '111', '000', '000'], '!': ['1', '1', '1', '0', '1'], '.': ['0', '0', '0', '0', '1'],
  '%': ['11001', '11010', '00100', '01011', '10011'], '/': ['00001', '00010', '00100', '01000', '10000'], ' ': ['00', '00', '00', '00', '00'],
  '♥': ['01010', '11111', '11111', '01110', '00100'], '?': ['1110', '0001', '0110', '0000', '0100'], '+': ['000', '010', '111', '010', '000'],
};

/** Stamp voxel text onto a grid on the z = z0 plane, top-left at (x0, y0), `s` model units per glyph pixel. */
export function stampText(g: VoxGrid, text: string, x0: number, y0: number, z0: number, s: number, color: number, mat: number = M.glow, depth = 1) {
  let x = x0;
  for (const ch of text.toUpperCase()) {
    const gl = GLYPHS[ch] ?? GLYPHS[' '];
    const w = gl[0].length;
    for (let r = 0; r < 5; r++) for (let c = 0; c < w; c++) if (gl[r][c] === '1') {
      for (let a = 0; a < s; a += 1 / g.res) for (let b = 0; b < s; b += 1 / g.res) for (let d = 0; d < depth; d += 1 / g.res)
        g.set(Math.floor((x + c * s + a) * g.res), Math.floor((y0 - r * s - b) * g.res), Math.floor((z0 + d) * g.res), color, mat as any);
    }
    x += (w + 1) * s;
  }
  return x - x0;
}
export function textWidth(text: string, s: number) {
  let w = 0; for (const ch of text.toUpperCase()) w += ((GLYPHS[ch] ?? GLYPHS[' '])[0].length + 1) * s; return w - s;
}

// ── meshing helpers ──────────────────────────────────────────────────────────

/** Glow voxels on props render brighter than 1.0 so the bloom pass picks them up. */
export const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.9, 1.9, 1.9), toneMapped: false });

/** Mesh a prop grid in ship units (16 model units = 1 world unit). Greedy-merged unless it needs an outline / anchor. */
export function mesh(g: VoxGrid, o: Omit<BuildOptions, 'size'> & { anchor?: 'none' | 'bottom' | 'center' } = {}): THREE.Group {
  const override = { [M.glow]: GLOW, ...(o.override ?? {}) };
  if (o.outline === undefined && (o.anchor ?? 'none') === 'none') return greedy(g, { ao: 0.8, castShadow: true, ...o, override });
  return toObject(g, { size: U, ao: 0.8, castShadow: true, anchor: o.anchor ?? 'none', ...o, override });
}

// ── greedy mesher ────────────────────────────────────────────────────────────
// Same look as the engine's per-voxel mesher (vertex colours, baked AO, per-material
// geometry, glass rules), but coplanar faces with identical colour, material and corner
// AO are merged into big quads. Flat hull plates drop from ~2k quads to a few dozen.
const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
const AO_CURVE = [1, 0.8, 0.66, 0.52];
const isGlass = (m: number) => m === M.glass;

export function greedy(g: VoxGrid, o: { ao?: number; castShadow?: boolean; occluder?: VoxGrid; override?: Partial<Record<number, THREE.Material>>; name?: string } = {}): THREE.Group {
  const size = U / (g.res || 1);
  const aoK = o.ao ?? 0.8;
  const occ = o.occluder;
  const filled = (x: number, y: number, z: number) => g.get(x, y, z) || (occ ? occ.get(x, y, z) : 0);
  const solidAt = (x: number, y: number, z: number) => { const m = filled(x, y, z); return m !== 0 && !isGlass(m); };
  const dims = [g.w, g.h, g.d];
  const org = g.o;
  const buckets = new Map<number, { pos: number[]; nor: number[]; col: number[]; idx: number[] }>();
  const bucket = (m: number) => { let b = buckets.get(m); if (!b) buckets.set(m, (b = { pos: [], nor: [], col: [], idx: [] })); return b; };

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const W = dims[u], H = dims[v];
    const keys = new Float64Array(W * H);
    const aoq = new Uint8Array(W * H * 4);
    const cell = new Int32Array(W * H);   // voxel colour
    const mats = new Uint8Array(W * H);
    for (const s of [1, -1]) {
      for (let k = 0; k < dims[d]; k++) {
        keys.fill(0);
        const p = [0, 0, 0];
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
          p[d] = k; p[u] = i; p[v] = j;
          const x = p[0] + org[0], y = p[1] + org[1], z = p[2] + org[2];
          const m = g.get(x, y, z);
          if (!m) continue;
          const n = [x, y, z]; n[d] += s;
          const nm = filled(n[0], n[1], n[2]);
          if (nm && (!isGlass(nm) || isGlass(m))) continue;
          const c = g.color(x, y, z);
          // corner AO (occlusion counts 0..3) in order (0,0) (1,0) (1,1) (0,1)
          const a4 = [0, 0, 0, 0];
          if (m !== M.glow && aoK > 0) {
            const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
            for (let q = 0; q < 4; q++) {
              const [su, sv] = corners[q];
              const A = [...n], Bv = [...n], C = [...n];
              A[u] += su; Bv[v] += sv; C[u] += su; C[v] += sv;
              const s1 = solidAt(A[0], A[1], A[2]) ? 1 : 0, s2 = solidAt(Bv[0], Bv[1], Bv[2]) ? 1 : 0, s3 = solidAt(C[0], C[1], C[2]) ? 1 : 0;
              a4[q] = s1 && s2 ? 3 : s1 + s2 + s3;
            }
          }
          const id = j * W + i;
          cell[id] = c; mats[id] = m;
          aoq.set(a4, id * 4);
          keys[id] = m * 1e10 + c * 300 + a4[0] * 64 + a4[1] * 16 + a4[2] * 4 + a4[3] + 1;
        }
        // greedy rectangles
        for (let j = 0; j < H; j++) for (let i = 0; i < W; ) {
          const id = j * W + i, key = keys[id];
          if (!key) { i++; continue; }
          let w = 1; while (i + w < W && keys[id + w] === key) w++;
          let h = 1;
          outer: while (j + h < H) { for (let q = 0; q < w; q++) if (keys[(j + h) * W + i + q] !== key) break outer; h++; }
          for (let jj = 0; jj < h; jj++) for (let q = 0; q < w; q++) keys[(j + jj) * W + i + q] = 0;
          // emit
          const m = mats[id], c = cell[id];
          const B = bucket(m);
          const base = B.pos.length / 3;
          const plane = k + (s > 0 ? 1 : 0);
          const corner = (cu: number, cv: number) => { const P = [0, 0, 0]; P[d] = plane; P[u] = i + cu; P[v] = j + cv; return [(P[0] + org[0]) * size, (P[1] + org[1]) * size, (P[2] + org[2]) * size]; };
          const cs = [corner(0, 0), corner(w, 0), corner(w, h), corner(0, h)];
          const r = LIN[(c >> 16) & 255], gg = LIN[(c >> 8) & 255], b = LIN[c & 255];
          const nrm = [0, 0, 0]; nrm[d] = s;
          const tint = d === 1 ? (s > 0 ? 1.04 : 0.9) : 1;
          const ao = [0, 1, 2, 3].map((q) => 1 - (1 - AO_CURVE[aoq[id * 4 + q]]) * aoK);
          const order = s > 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];
          for (const q of order) { B.pos.push(...cs[q]); B.nor.push(nrm[0], nrm[1], nrm[2]); const a = ao[q] * tint; B.col.push(r * a, gg * a, b * a); }
          const aoO = order.map((q) => ao[q]);
          if (aoO[0] + aoO[2] > aoO[1] + aoO[3]) B.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          else B.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
          i += w;
        }
      }
    }
  }
  const group = new THREE.Group();
  group.name = o.name ?? 'vox';
  const mt = materials();
  for (const [m, B] of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
    geo.setIndex(B.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, o.override?.[m] ?? mt[m] ?? mt[M.solid]);
    mesh.castShadow = !!o.castShadow && m !== M.glass && m !== M.glow;
    mesh.receiveShadow = m !== M.glow;
    if (m === M.glass) mesh.renderOrder = 2;
    mesh.userData.voxMat = m;
    group.add(mesh);
  }
  group.userData.voxSize = size;
  return group;
}

/**
 * An occluder plane just outside one side of a grid: faces pointing into it are culled by
 * the mesher (floor undersides, wall backs — surfaces the camera can never see).
 */
export function occluderPlane(g: VoxGrid, side: '-y' | '-z' | '+z' | '-x' | '+x'): VoxGrid {
  const o: V3 = [...g.o] as V3;
  let w = g.w, h = g.h, d = g.d;
  if (side === '-y') { o[1] = g.o[1] - 1; h = 1; }
  if (side === '-z') { o[2] = g.o[2] - 1; d = 1; }
  if (side === '+z') { o[2] = g.o[2] + g.d; d = 1; }
  if (side === '-x') { o[0] = g.o[0] - 1; w = 1; }
  if (side === '+x') { o[0] = g.o[0] + g.w; w = 1; }
  const p = new VoxGrid(w, h, d, o, g.res);
  p.mat.fill(M.solid);
  return p;
}

/** New grid spanning model-unit bounds at `res` voxels per unit. */
export const grid = (min: V3, max: V3, res = 2) => VoxGrid.span(min, max, res);

/**
 * Turn a (static) object into an InstancedMesh set: one InstancedMesh per child mesh,
 * placed at every matrix. For repeating hull modules, floor tiles, ribs, lights.
 */
export function instance(proto: THREE.Object3D, matrices: THREE.Matrix4[], opts: { castShadow?: boolean; receiveShadow?: boolean } = {}): THREE.Group {
  const out = new THREE.Group();
  proto.updateMatrixWorld(true);
  proto.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const im = new THREE.InstancedMesh(m.geometry, m.material, matrices.length);
    const local = m.matrixWorld.clone();
    const tmp = new THREE.Matrix4();
    matrices.forEach((mx, i) => im.setMatrixAt(i, tmp.multiplyMatrices(mx, local)));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = !!opts.castShadow && !m.userData.outline;
    im.receiveShadow = opts.receiveShadow ?? true;
    im.renderOrder = m.renderOrder;
    im.computeBoundingSphere();
    out.add(im);
  });
  return out;
}

export const at = (x: number, y: number, z: number, ry = 0, s = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));

/**
 * An emissive material whose colour/intensity we animate (lamps, warning lights). Voxel
 * colours multiply with it, so paint animatable glow voxels white and tint here.
 */
export function glowMat(color: number, k = 2) {
  return new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });
}

/** Re-material every mesh of a voxel object whose voxMat matches (e.g. make a part's glow animatable). */
export function swapMat(o: THREE.Object3D, voxMat: number, mat: THREE.Material) {
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && m.userData.voxMat === voxMat) m.material = mat; });
  return o;
}
