// Ship kit helpers: the GLOB LABS mothership palette and *structured* voxel textures —
// plate seams, rivets, edge highlights, hazard stripes, grime gradients, decals. No random
// speckle: every darker or lighter voxel means something (a seam, a bolt, a worn edge).
//
// Units: props are modelled in MODEL units where 16 units = 1 world unit (one floor cell),
// and sampled at `res` voxels per unit (res 2 → 1/32 world unit voxels).
import * as THREE from 'three';
import { M, VoxGrid, hash3, mix, shade, type V3 } from '../core';
import { toObject, type BuildOptions } from '../mesh';

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

/**
 * Plate colour on a plane: per-plate tint + a grime gradient toward the bottom. Seams, bevels
 * and rivets now come from the pixel texture (T.hull / T.plateBig), so voxels stay calm.
 */
export function plate(base: number, u: number, v: number, o: { pw?: number; ph?: number; bolt?: boolean; edge?: number; grime?: number; y?: number } = {}) {
  let c = plateTint(base, u, v, o.pw ?? 16, o.ph ?? 16, 0.035);
  if (o.grime && o.y !== undefined) c = mix(c, shade(base, 0.74), Math.max(0, Math.min(1, (o.grime - o.y) / o.grime)) * 0.55);
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

/** Default glow for props: emissive but calm (stays under the bloom threshold). */
export const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.0, 1.0, 1.0), toneMapped: false });
/** For real light sources only (lamp bulbs, indicator LEDs): bright enough to bloom, tightly. */
export const GLOW_LAMP = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.4, 2.4, 2.4), toneMapped: false });

/** Mesh a prop grid in ship units (16 model units = 1 world unit), greedy-merged, textured where stamped. */
export function mesh(g: VoxGrid, o: Omit<BuildOptions, 'size'> & { anchor?: 'none' | 'bottom' | 'center' } = {}): THREE.Group {
  return toObject(g, { size: U, ao: 0.8, castShadow: true, greedy: true, anchor: o.anchor ?? 'none', ...o, override: { [M.glow]: GLOW, ...(o.override ?? {}) } });
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
