// Voxel mesher: hidden-face culling, per-vertex ambient occlusion baked into vertex
// colours, one geometry per material so jelly, metal, glass and glow each get their own
// shader. Optional voxel outline (dilated back-face shell) gives the inked-edge look.
import * as THREE from 'three';
import { M, VoxGrid, hash3 } from './core';

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
  /** World size of one voxel. */
  size?: number;
  /** Where (0,0,0) voxel-space lands: 'none' keeps voxel origin, 'bottom' centres x/z and puts min y at 0, 'center' centres all. */
  anchor?: 'none' | 'bottom' | 'center';
  /** AO strength 0..1 */
  ao?: number;
  /** Treat these voxels as solid neighbours when culling (part sits inside another part). */
  occluder?: VoxGrid;
}

export interface MeshResult {
  geos: Map<number, THREE.BufferGeometry>;
  offset: THREE.Vector3;
  size: number;
}

export function meshGrid(g: VoxGrid, opt: MeshOptions = {}): MeshResult {
  // opt.size is world units per MODEL unit; one voxel is size / res
  const size = (opt.size ?? 0.05) / (g.res || 1);
  const aoK = opt.ao ?? 0.85;
  const occ = opt.occluder;
  // anchor offset (voxel coords)
  let ox = 0, oy = 0, oz = 0;
  if (opt.anchor && opt.anchor !== 'none') {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < g.d; k++) for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      if (!g.mat[i + g.w * (j + g.h * k)]) continue;
      if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; if (k < z0) z0 = k; if (k > z1) z1 = k;
    }
    if (x0 !== Infinity) {
      ox = -((x0 + x1 + 1) / 2 + g.o[0]);
      oz = -((z0 + z1 + 1) / 2 + g.o[2]);
      oy = opt.anchor === 'bottom' ? -(y0 + g.o[1]) : -((y0 + y1 + 1) / 2 + g.o[1]);
    }
  }

  const filled = (x: number, y: number, z: number) => g.get(x, y, z) || (occ ? occ.get(x, y, z) : 0);
  // opaque test for AO / culling
  const solidAt = (x: number, y: number, z: number) => { const m = filled(x, y, z); return m !== 0 && !transparentMat(m); };

  // bucket faces per material
  const buckets = new Map<number, { pos: number[]; nor: number[]; col: number[]; idx: number[] }>();
  const bucket = (m: number) => { let b = buckets.get(m); if (!b) buckets.set(m, (b = { pos: [], nor: [], col: [], idx: [] })); return b; };

  for (let k = 0; k < g.d; k++) for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
    const id = i + g.w * (j + g.h * k);
    const m = g.mat[id];
    if (!m) continue;
    const x = i + g.o[0], y = j + g.o[1], z = k + g.o[2];
    const c = g.col[id];
    const r = LIN[(c >> 16) & 255], gg = LIN[(c >> 8) & 255], b = LIN[c & 255];
    const tr = transparentMat(m);
    for (const f of FACES) {
      const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
      const nm = filled(nx, ny, nz);
      if (nm && (!transparentMat(nm) || tr)) continue; // hidden (glass shows faces against air & opaque only)
      const B = bucket(m);
      const base = B.pos.length / 3;
      const corners = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
      const aos: number[] = [];
      for (const [cu, cv] of corners) {
        const px = x + f.o[0] + f.u[0] * cu + f.v[0] * cv;
        const py = y + f.o[1] + f.u[1] * cu + f.v[1] * cv;
        const pz = z + f.o[2] + f.u[2] * cu + f.v[2] * cv;
        B.pos.push((px + ox) * size, (py + oy) * size, (pz + oz) * size);
        B.nor.push(f.n[0], f.n[1], f.n[2]);
        // AO: sample the 3 voxels touching this corner on the outside of the face
        let ao = 1;
        if (m !== M.glow && aoK > 0) {
          const su = cu ? 1 : -1, sv = cv ? 1 : -1;
          const ax = nx + f.u[0] * su, ay = ny + f.u[1] * su, az = nz + f.u[2] * su;
          const bx = nx + f.v[0] * sv, by = ny + f.v[1] * sv, bz = nz + f.v[2] * sv;
          const s1 = solidAt(ax, ay, az) ? 1 : 0, s2 = solidAt(bx, by, bz) ? 1 : 0;
          const s3 = solidAt(nx + f.u[0] * su + f.v[0] * sv, ny + f.u[1] * su + f.v[1] * sv, nz + f.u[2] * su + f.v[2] * sv) ? 1 : 0;
          const occN = s1 && s2 ? 3 : s1 + s2 + s3;
          ao = 1 - (1 - AO_CURVE[occN]) * aoK;
        }
        aos.push(ao);
        // gentle face-direction tint (top faces a touch brighter) adds read without lights
        const dir = f.n[1] > 0 ? 1.04 : f.n[1] < 0 ? 0.9 : 1;
        B.col.push(r * ao * dir, gg * ao * dir, b * ao * dir);
      }
      // flip the quad diagonal to avoid AO anisotropy
      if (aos[0] + aos[2] > aos[1] + aos[3]) B.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else B.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    }
  }

  const geos = new Map<number, THREE.BufferGeometry>();
  for (const [m, B] of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
    geo.setIndex(B.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
    geo.computeBoundingSphere();
    geos.set(m, geo);
  }
  return { geos, offset: new THREE.Vector3(ox * size, oy * size, oz * size), size };
}

// ── shared materials ─────────────────────────────────────────────────────────
let mats: Record<number, THREE.Material> | null = null;
let outlineMats = new Map<number, THREE.Material>();

export function materials(): Record<number, THREE.Material> {
  if (mats) return mats;
  mats = {
    [M.solid]: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 }),
    [M.fur]: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    [M.metal]: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.72, envMapIntensity: 1.2 }),
    [M.jelly]: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.48, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.22, envMapIntensity: 0.55 }),
    [M.gloss]: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.6 }),
    [M.glass]: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.32, clearcoat: 1, envMapIntensity: 1.4, depthWrite: false }),
    [M.glow]: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  return mats;
}

/**
 * Inked outline material for a dilated back-face shell. Vertices are pushed away from the
 * camera in view space so the shell never pokes through the model's own surface (voxel
 * stair-steps would otherwise show as dark streaks) — only the silhouette rim survives.
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
  /** Override material per channel (e.g. a ghost-skin jelly). */
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
    const mesh = new THREE.Mesh(geo, opt.override?.[m] ?? mt[m] ?? mt[M.solid]);
    mesh.castShadow = !!opt.castShadow && m !== M.glass && m !== M.glow;
    mesh.receiveShadow = m !== M.glow;
    if (m === M.glass) mesh.renderOrder = 2;
    mesh.userData.voxMat = m;
    group.add(mesh);
  }
  if (opt.outline !== undefined) {
    const shell = g.dilate(opt.outlineWidth ?? Math.max(1, Math.round(g.res * 1.25)), opt.outline);
    // mesh the shell with the same anchor offset as the model
    const sres = meshGrid(shell, { size: opt.size ?? 0.05, ao: 0 });
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

/** A PMREM environment so glossy jelly, gloss eyes and metal have something to reflect. */
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
