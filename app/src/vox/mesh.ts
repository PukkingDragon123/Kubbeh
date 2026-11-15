// Voxel mesher: hidden-face culling, per-vertex ambient occlusion baked into vertex colours,
// one geometry per material, optional greedy merging of coplanar faces (identical colour,
// material, texture and corner AO), and per-voxel surface textures (src/vox/tex.ts) sampled
// in the shader by face axis. Optional inked outline (dilated back-face shell).
//
// Look: matte, flat-shaded PS2-style diffuse. Only glass and gloss (alien eyes, wet things)
// shine. Glow voxels are emissive but stay under the bloom threshold unless a caller gives
// them a brighter material (real light sources only).
import * as THREE from 'three';
import { M, VoxGrid, hash3 } from './core';
import { voxAtlas, TEX_GLSL } from './tex';

const FACES = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], o: [1, 0, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], o: [0, 0, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0], o: [0, 1, 0] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], o: [0, 0, 0] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], o: [0, 0, 1] },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0], o: [0, 0, 0] },
] as const;

const AO_CURVE = [1, 0.8, 0.66, 0.52];
/** sRGB byte → linear float (vertex colours are linear in three.js). */
const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
const transparentMat = (m: number) => m === M.glass;

export interface MeshOptions {
  /** World size of one MODEL unit (one voxel = size / grid.res). */
  size?: number;
  /** Where (0,0,0) voxel-space lands: 'none' keeps voxel origin, 'bottom' centres x/z and puts min y at 0, 'center' centres all. */
  anchor?: 'none' | 'bottom' | 'center';
  /** AO strength 0..1 */
  ao?: number;
  /** Treat these voxels as solid neighbours when culling (part sits inside another part / never-seen sides). */
  occluder?: VoxGrid;
  /** Merge coplanar faces with identical colour / material / texture / AO into large quads. */
  greedy?: boolean;
  /** Texture to use for voxels with no stamped texture, per material channel (props: everything textured). */
  defaultTex?: Partial<Record<number, number>>;
}

export interface MeshResult {
  geos: Map<number, THREE.BufferGeometry>;
  offset: THREE.Vector3;
  size: number;
}

interface Bucket { pos: number[]; nor: number[]; col: number[]; tex: number[]; idx: number[] }

function anchorOffset(g: VoxGrid, anchor: MeshOptions['anchor']) {
  let ox = 0, oy = 0, oz = 0;
  if (!anchor || anchor === 'none') return [ox, oy, oz];
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k < g.d; k++) for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    if (!g.mat[i + g.w * (j + g.h * k)]) continue;
    if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; if (k < z0) z0 = k; if (k > z1) z1 = k;
  }
  if (x0 === Infinity) return [0, 0, 0];
  ox = -((x0 + x1 + 1) / 2 + g.o[0]);
  oz = -((z0 + z1 + 1) / 2 + g.o[2]);
  oy = anchor === 'bottom' ? -(y0 + g.o[1]) : -((y0 + y1 + 1) / 2 + g.o[1]);
  return [ox, oy, oz];
}

export function meshGrid(g: VoxGrid, opt: MeshOptions = {}): MeshResult {
  const size = (opt.size ?? 0.05) / (g.res || 1);
  const aoK = opt.ao ?? 0.85;
  const occ = opt.occluder;
  const [ox, oy, oz] = anchorOffset(g, opt.anchor);
  const filled = (x: number, y: number, z: number) => g.get(x, y, z) || (occ ? occ.get(x, y, z) : 0);
  const solidAt = (x: number, y: number, z: number) => { const m = filled(x, y, z); return m !== 0 && !transparentMat(m); };
  const dt = opt.defaultTex;
  const texOf = (idx: number) => g.tx[idx] || (dt ? dt[g.mat[idx]] ?? 0 : 0);
  let anyTex = !!dt;
  if (!anyTex) for (let i = 0; i < g.tx.length; i++) if (g.tx[i] && g.mat[i]) { anyTex = true; break; }

  const buckets = new Map<number, Bucket>();
  const bucket = (m: number) => { let b = buckets.get(m); if (!b) buckets.set(m, (b = { pos: [], nor: [], col: [], tex: [], idx: [] })); return b; };

  /** occlusion count 0..3 for one face corner (outside layer neighbour n, offsets along u/v) */
  const cornerOcc = (n: number[], u: readonly number[], v: readonly number[], su: number, sv: number) => {
    const s1 = solidAt(n[0] + u[0] * su, n[1] + u[1] * su, n[2] + u[2] * su) ? 1 : 0;
    const s2 = solidAt(n[0] + v[0] * sv, n[1] + v[1] * sv, n[2] + v[2] * sv) ? 1 : 0;
    const s3 = solidAt(n[0] + u[0] * su + v[0] * sv, n[1] + u[1] * su + v[1] * sv, n[2] + u[2] * su + v[2] * sv) ? 1 : 0;
    return s1 && s2 ? 3 : s1 + s2 + s3;
  };
  const emit = (m: number, c: number, t: number, nrm: readonly number[], cs: number[][], occs: number[]) => {
    const B = bucket(m);
    const base = B.pos.length / 3;
    const r = LIN[(c >> 16) & 255], gg = LIN[(c >> 8) & 255], b = LIN[c & 255];
    const tint = nrm[1] > 0 ? 1.04 : nrm[1] < 0 ? 0.9 : 1;
    const ao = occs.map((o) => (m === M.glow ? 1 : 1 - (1 - AO_CURVE[o]) * aoK));
    for (let q = 0; q < 4; q++) {
      B.pos.push((cs[q][0] + ox) * size, (cs[q][1] + oy) * size, (cs[q][2] + oz) * size);
      B.nor.push(nrm[0], nrm[1], nrm[2]);
      const a = ao[q] * tint;
      B.col.push(r * a, gg * a, b * a);
      B.tex.push(t);
    }
    if (ao[0] + ao[2] > ao[1] + ao[3]) B.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else B.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  };

  if (opt.greedy) {
    // ── greedy: sweep slices per axis/direction, merge equal-key rectangles ──
    const dims = [g.w, g.h, g.d];
    for (let d = 0; d < 3; d++) {
      const ua = (d + 1) % 3, va = (d + 2) % 3;
      const W = dims[ua], H = dims[va];
      const keys = new Float64Array(W * H);
      const cellC = new Int32Array(W * H), cellM = new Uint8Array(W * H), cellT = new Uint8Array(W * H), cellO = new Uint8Array(W * H * 4);
      const uVec = [0, 0, 0], vVec = [0, 0, 0]; uVec[ua] = 1; vVec[va] = 1;
      for (const s of [1, -1]) {
        const nrm = [0, 0, 0]; nrm[d] = s;
        for (let k = 0; k < dims[d]; k++) {
          keys.fill(0);
          const p = [0, 0, 0];
          for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
            p[d] = k; p[ua] = i; p[va] = j;
            const x = p[0] + g.o[0], y = p[1] + g.o[1], z = p[2] + g.o[2];
            const idx = x - g.o[0] + g.w * (y - g.o[1] + g.h * (z - g.o[2]));
            const m = g.mat[idx];
            if (!m) continue;
            const n = [x, y, z]; n[d] += s;
            const nm = filled(n[0], n[1], n[2]);
            if (nm && (!transparentMat(nm) || transparentMat(m))) continue;
            const c = g.col[idx], t = texOf(idx);
            let o0 = 0, o1 = 0, o2 = 0, o3 = 0;
            if (m !== M.glow && aoK > 0) { o0 = cornerOcc(n, uVec, vVec, -1, -1); o1 = cornerOcc(n, uVec, vVec, 1, -1); o2 = cornerOcc(n, uVec, vVec, 1, 1); o3 = cornerOcc(n, uVec, vVec, -1, 1); }
            const id = j * W + i;
            cellC[id] = c; cellM[id] = m; cellT[id] = t;
            cellO[id * 4] = o0; cellO[id * 4 + 1] = o1; cellO[id * 4 + 2] = o2; cellO[id * 4 + 3] = o3;
            keys[id] = ((m * 256 + t) * 16777216 + c) * 256 + (o0 * 64 + o1 * 16 + o2 * 4 + o3) + 1;
          }
          for (let j = 0; j < H; j++) for (let i = 0; i < W;) {
            const id = j * W + i, key = keys[id];
            if (!key) { i++; continue; }
            let w = 1; while (i + w < W && keys[id + w] === key) w++;
            let h = 1;
            outer: while (j + h < H) { for (let q = 0; q < w; q++) if (keys[(j + h) * W + i + q] !== key) break outer; h++; }
            for (let jj = 0; jj < h; jj++) for (let q = 0; q < w; q++) keys[(j + jj) * W + i + q] = 0;
            const plane = k + (s > 0 ? 1 : 0);
            const corner = (cu: number, cv: number) => { const P = [0, 0, 0]; P[d] = plane; P[ua] = i + cu; P[va] = j + cv; return [P[0] + g.o[0], P[1] + g.o[1], P[2] + g.o[2]]; };
            const cs = [corner(0, 0), corner(w, 0), corner(w, h), corner(0, h)];
            const occs = [cellO[id * 4], cellO[id * 4 + 1], cellO[id * 4 + 2], cellO[id * 4 + 3]];
            if (s > 0) emit(cellM[id], cellC[id], cellT[id], nrm, cs, occs);
            else emit(cellM[id], cellC[id], cellT[id], nrm, [cs[0], cs[3], cs[2], cs[1]], [occs[0], occs[3], occs[2], occs[1]]);
            i += w;
          }
        }
      }
    }
  } else {
    // ── per-voxel faces ──
    for (let k = 0; k < g.d; k++) for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const id = i + g.w * (j + g.h * k);
      const m = g.mat[id];
      if (!m) continue;
      const x = i + g.o[0], y = j + g.o[1], z = k + g.o[2];
      const c = g.col[id], t = texOf(id);
      const tr = transparentMat(m);
      for (const f of FACES) {
        const n = [x + f.n[0], y + f.n[1], z + f.n[2]];
        const nm = filled(n[0], n[1], n[2]);
        if (nm && (!transparentMat(nm) || tr)) continue;
        const cs: number[][] = [], occs: number[] = [];
        for (const [cu, cv] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
          cs.push([x + f.o[0] + f.u[0] * cu + f.v[0] * cv, y + f.o[1] + f.u[1] * cu + f.v[1] * cv, z + f.o[2] + f.u[2] * cu + f.v[2] * cv]);
          occs.push(m !== M.glow && aoK > 0 ? cornerOcc(n, f.u, f.v, cu ? 1 : -1, cv ? 1 : -1) : 0);
        }
        emit(m, c, t, f.n, cs, occs);
      }
    }
  }

  const geos = new Map<number, THREE.BufferGeometry>();
  for (const [m, B] of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
    if (anyTex && B.tex.some((t) => t > 0)) geo.setAttribute('aTex', new THREE.Float32BufferAttribute(B.tex, 1));
    geo.setIndex(B.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
    geo.computeBoundingSphere();
    geos.set(m, geo);
  }
  return { geos, offset: new THREE.Vector3(ox * size, oy * size, oz * size), size };
}

// ── shared materials (matte PS2 diffuse; only eyes / glass shine) ────────────
let mats: Record<number, THREE.Material> | null = null;
const outlineMats = new Map<number, THREE.Material>();
const texturedCache = new WeakMap<THREE.Material, THREE.Material>();

export function materials(): Record<number, THREE.Material> {
  if (mats) return mats;
  mats = {
    [M.solid]: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true }),
    [M.fur]: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }),
    [M.metal]: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.22, envMapIntensity: 0.6, flatShading: true }),
    [M.jelly]: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.5, envMapIntensity: 0.4, flatShading: true }),
    [M.gloss]: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4 }),
    [M.glass]: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.3, clearcoat: 0.6, envMapIntensity: 0.9, depthWrite: false }),
    [M.glow]: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  return mats;
}

/**
 * A copy of a lit voxel material that also samples the pixel texture atlas by each face's
 * axis (triplanar on axis-aligned voxel faces), multiplied over vertex colour + AO.
 * Instanced modules sample in group space so tiles continue across neighbours.
 */
export function texturedMaterial(base: THREE.Material): THREE.Material {
  const hit = texturedCache.get(base);
  if (hit) return hit;
  const m = base.clone();
  const atlas = voxAtlas();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uVoxAtlas = { value: atlas };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTex;\nvarying float vTex;\nvarying vec3 vVoxP;\nvarying vec3 vVoxN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTex = aTex;
        vec4 vp4 = vec4(position, 1.0);
        vec3 vn3 = normal;
        #ifdef USE_INSTANCING
          vp4 = instanceMatrix * vp4;
          vn3 = mat3(instanceMatrix) * vn3;
        #endif
        vVoxP = vp4.xyz; vVoxN = vn3;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uVoxAtlas;\nvarying float vTex;\nvarying vec3 vVoxP;\nvarying vec3 vVoxN;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        if (vTex > 0.5) {
          vec3 an = abs(normalize(vVoxN));
          vec2 tuv = an.x > 0.5 ? vVoxP.zy : (an.y > 0.5 ? vVoxP.xz : vVoxP.xy);
          vec2 tf = fract(tuv * ${TEX_GLSL.scale});
          float tid = floor(vTex + 0.5) - 1.0;
          vec2 tile = vec2(mod(tid, ${TEX_GLSL.atlasGrid}), floor(tid / ${TEX_GLSL.atlasGrid}));
          vec3 tcol = texture2D(uVoxAtlas, (tile + tf) / ${TEX_GLSL.atlasGrid}).rgb;
          diffuseColor.rgb *= tcol * 2.0;
        }`);
  };
  m.customProgramCacheKey = () => 'voxTex:' + base.type + ':' + base.uuid;
  texturedCache.set(base, m);
  return m;
}

/**
 * Inked outline material for a dilated back-face shell. Vertices are pushed away from the
 * camera in view space so the shell never pokes through the model's own surface.
 */
export function outlineMaterial(color: number, push = 0.05) {
  const key = color * 1000 + Math.round(push * 1000);
  let m = outlineMats.get(key);
  if (!m) {
    const mm = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    mm.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `
        vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        mvPosition.xyz += normalize(mvPosition.xyz) * ${push.toFixed(4)};
        gl_Position = projectionMatrix * mvPosition;`);
    };
    mm.customProgramCacheKey = () => 'voxOutline' + push.toFixed(4);
    mm.userData.inkColor = color;
    outlineMats.set(key, (m = mm));
  }
  return m;
}
const outlineMat = (color: number, size = 0.05) => outlineMaterial(color, size * 2.2);

export interface BuildOptions extends MeshOptions {
  /** Dark inked outline colour (dilated back-face shell). */
  outline?: number;
  /** Outline thickness in voxels. */
  outlineWidth?: number;
  castShadow?: boolean;
  /** Override material per channel (e.g. a ghost-skin jelly, a brighter lamp glow). */
  override?: Partial<Record<number, THREE.Material>>;
  name?: string;
}

/** Build a ready-to-add Object3D from a grid. */
export function toObject(g: VoxGrid, opt: BuildOptions = {}): THREE.Group {
  const res = meshGrid(g, opt);
  const group = new THREE.Group();
  group.name = opt.name ?? 'vox';
  const mt = materials();
  for (const [m, geo] of res.geos) {
    let mat = opt.override?.[m] ?? mt[m] ?? mt[M.solid];
    if (geo.getAttribute('aTex') && m !== M.glow && !opt.override?.[m]) mat = texturedMaterial(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = !!opt.castShadow && m !== M.glass && m !== M.glow;
    mesh.receiveShadow = m !== M.glow;
    if (m === M.glass) mesh.renderOrder = 2;
    mesh.userData.voxMat = m;
    group.add(mesh);
  }
  if (opt.outline !== undefined) {
    const shell = g.dilate(opt.outlineWidth ?? Math.max(1, Math.round(g.res * 1.25)), opt.outline);
    const sres = meshGrid(shell, { size: opt.size ?? 0.05, ao: 0, greedy: true });
    for (const geo of sres.geos.values()) {
      geo.translate(res.offset.x, res.offset.y, res.offset.z);
      const o = new THREE.Mesh(geo, outlineMat(opt.outline, res.size * 1.4));
      o.name = 'outline';
      o.userData.outline = true;
      group.add(o);
    }
  }
  group.userData.voxSize = res.size;
  group.userData.voxOffset = res.offset;
  return group;
}

/** Deterministic tiny jitter so neighbouring voxels never look flat-filled. */
export const tex = (c: number, amt: number, x: number, y: number, z: number, s = 0) => {
  const k = 1 + (hash3(x, y, z, s) - 0.5) * 2 * amt;
  return (Math.min(255, ((c >> 16) & 255) * k) << 16) | (Math.min(255, ((c >> 8) & 255) * k) << 8) | Math.min(255, (c & 255) * k);
};

/** A PMREM environment so gloss eyes, glass and metal have something soft to reflect. */
export function studioEnvironment(renderer: THREE.WebGLRenderer, tint = 0x8cffb0): THREE.Texture {
  const pm = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1220);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const panel = (color: number, intensity: number, p: [number, number, number], s: [number, number, number]) => {
    const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) }));
    m.position.set(...p); m.scale.set(...s); scene.add(m);
  };
  panel(0xffffff, 6, [0, 6, 0], [8, 0.2, 8]);        // big soft key from above
  panel(tint, 3, [-7, 2, 2], [0.2, 4, 6]);          // neon side
  panel(0xff7ad9, 2.4, [7, 1.5, -1], [0.2, 3, 5]);  // pink rim
  panel(0x59f0ff, 2, [0, 1, -8], [8, 2, 0.2]);      // cyan back
  panel(0x223344, 1, [0, -4, 0], [20, 0.2, 20]);    // floor bounce
  const rt = pm.fromScene(scene, 0.04);
  pm.dispose();
  return rt.texture;
}
