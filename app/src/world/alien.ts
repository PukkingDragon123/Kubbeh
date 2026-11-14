// The jelly aliens. Voxel bodies, pixel faces, squash-and-stretch everything.
import * as THREE from 'three';
import type { AlienLook, Expression } from '../core/types';
import { Vox, buildVox, MAT } from './voxel';
import { drawFace, FACE_W, FACE_H } from './face';
import { canvas } from './pixels';
import type { Anim } from './stations';

const AS = 0.06; // voxel size for aliens

// ── materials ────────────────────────────────────────────────────────────────
function jellyMaterial(rim: THREE.Color, opts: { metal?: boolean; ghost?: boolean; emissive?: THREE.Color } = {}) {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: opts.metal ? 0.22 : 0.3, metalness: opts.metal ? 0.95 : 0.0,
    transparent: !!opts.ghost, opacity: opts.ghost ? 0.62 : 1, envMapIntensity: opts.metal ? 1.6 : 0.9,
    emissive: opts.emissive ?? new THREE.Color(0x000000),
  });
  const uniforms = { rimColor: { value: rim.clone() }, rimStrength: { value: opts.ghost ? 1.1 : 0.55 }, selfGlow: { value: opts.ghost ? 0.25 : 0.1 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor; uniform float rimStrength; uniform float selfGlow;')
      .replace('#include <opaque_fragment>', `
        vec3 vd = normalize(vViewPosition);
        float fres = pow(1.0 - abs(dot(normal, vd)), 2.2);
        outgoingLight += rimColor * fres * rimStrength + diffuseColor.rgb * selfGlow;
        #include <opaque_fragment>`);
  };
  m.userData.uniforms = uniforms;
  return m;
}

const itemMat = MAT.solid;

// ── skin palettes ────────────────────────────────────────────────────────────
interface Palette { body: number; belly: number; spot: number; shine: number; ghost?: boolean; metal?: boolean; emissive?: number; cracks?: number; stars?: boolean; bumps?: boolean; cat?: boolean }
function palette(look: AlienLook): Palette {
  const c = (h: string) => new THREE.Color(h).getHex();
  switch (look.skin) {
    case 'pounce': return { body: 0xe4e8ec, belly: 0xffffff, spot: 0x34343e, shine: 0xffffff, cat: true };
    case 'pickle': return { body: 0x5f9a2e, belly: 0x9cc95a, spot: 0x86c24a, shine: 0xd8ffb0, bumps: true };
    case 'bubblegum': return { body: 0xff8fd0, belly: 0xffd0ec, spot: 0xffb8e4, shine: 0xffffff };
    case 'ghost': return { body: 0x7ff0ff, belly: 0xc8fbff, spot: 0xb0f8ff, shine: 0xffffff, ghost: true };
    case 'magma': return { body: 0x3a1410, belly: 0x5a2014, spot: 0x2a0e0a, shine: 0xff9a4a, cracks: 0xff7a1a };
    case 'void': return { body: 0x2a1650, belly: 0x3e2470, spot: 0x1e0f3c, shine: 0xb48cff, stars: true };
    case 'gold': return { body: 0xe8b73a, belly: 0xffd870, spot: 0xc8962a, shine: 0xfff2b0, metal: true };
    default: return { body: c(look.body), belly: c(look.belly), spot: new THREE.Color(look.body).lerp(new THREE.Color('#ffffff'), 0.32).getHex(), shine: 0xffffff };
  }
}

// ── voxel parts ──────────────────────────────────────────────────────────────
const geoCache = new Map<string, THREE.BufferGeometry>();
const glowCache = new Map<string, THREE.BufferGeometry | null>();
function cachedVox(key: string, make: () => Vox, origin?: [number, number, number], size = AS) {
  let g = geoCache.get(key);
  if (!g) {
    const b = buildVox(make(), { size, center: origin ? 'none' : 'xyz', origin, jitter: 0.03, ao: 0.7 });
    g = b.solid ?? new THREE.BufferGeometry();
    geoCache.set(key, g); glowCache.set(key, b.glow);
  }
  return { solid: g, glow: glowCache.get(key) ?? null };
}

const ROSETTES: [number, number, number][] = [[-5, 7, 2], [4, 8, -1], [-2, 9, -3], [5, 4, 3], [-6, 3, -2], [1, 9, 4], [-3, 5, -5], [3, 2, -5], [6, 6, -4], [-5, 8, -4], [0, 6, -5], [-6, 6, 4]];
function rosette(x: number, y: number, z: number): 0 | 1 | 2 {
  for (const [cx, cy, cz] of ROSETTES) {
    const d = Math.hypot(x - cx, y - cy, z - cz);
    if (d < 1.1) return 1;
    if (d < 2.05) { const a = Math.atan2(y - cy, x - cx + z - cz); return Math.sin(a * 2.5 + cx) > -0.55 ? 2 : 1; }
  }
  return 0;
}

function headVox(p: Palette, seed: number) {
  const v = new Vox();
  const W = 12, H = 10, D = 10;
  v.rbox(-W / 2, 0, -D / 2, W / 2, H, D / 2, 3.2, p.body);
  // freckle spots + glossy shine (top-left, like a jelly highlight)
  v.paint((vx) => {
    const h = Math.sin(vx.x * 12.9898 + vx.y * 78.233 + vx.z * 37.719 + seed) * 43758.5453;
    const r = h - Math.floor(h);
    if (p.cat) {
      // snow leopard rosettes: dark open rings with a warm grey centre
      if (vx.y < 3 && vx.z > 0) return 0xffffff;
      const ros = rosette(vx.x, vx.y, vx.z);
      if (ros === 2) return p.spot;
      if (ros === 1) return 0xc9c2b4;
      return r < 0.18 ? 0xd9dee2 : undefined;
    }
    if (vx.y >= 7 && vx.x <= -2 && vx.x >= -4 && vx.z >= 1) return p.shine;
    if (r < 0.07 && vx.y > 2) return p.spot;
    return undefined;
  });
  if (p.bumps) for (let i = 0; i < 18; i++) { const a = (i * 2.39996) % (Math.PI * 2); const y = 2 + (i * 7) % 8; const x = Math.round(Math.cos(a) * 6.2), z = Math.round(Math.sin(a) * 5.2); if (!v.has(x, y, z) && v.has(Math.round(x * 0.8), y, Math.round(z * 0.8))) v.set(x, y, z, p.spot); }
  if (p.cracks) v.paint((vx) => ((vx.x * 3 + vx.y * 5 + vx.z * 7) % 11 === 0 ? p.cracks : undefined));
  if (p.stars) for (const vx of v.map.values()) { const h = Math.abs(Math.sin(vx.x * 91.3 + vx.y * 47.1 + vx.z * 13.7)); if (h > 0.97) { vx.m = 2.5; vx.c = h > 0.985 ? 0xff9ae2 : 0xffffff; } }
  if (p.cracks) for (const vx of v.map.values()) if (vx.c === p.cracks) vx.m = 2.2;
  if (p.cat) {
    // round furry ears
    for (const sx of [-1, 1]) { v.rbox(sx * 4 - 2, 9, -2, sx * 4 + 2, 13, 2, 1.2, p.body); v.box(sx * 4 - 1, 10, 2, sx * 4 + 1, 12, 3, 0xff9ac0); v.box(sx * 4 - 2, 12, -2, sx * 4 + 2, 13, 2, 0x3a3a44); }
  }
  return v;
}

function bodyVox(p: Palette) {
  const v = new Vox();
  v.rbox(-4, 0, -3, 4, 6, 3, 2.2, p.body);
  v.paint((vx) => (vx.z >= 2 && Math.abs(vx.x) <= 2 && vx.y >= 1 && vx.y <= 4 ? p.belly : undefined));
  if (p.cat) v.paint((vx) => { if (vx.z >= 2 && Math.abs(vx.x) <= 2) return undefined; const r2 = rosette(vx.x * 1.4, vx.y + 2, vx.z * 1.6); return r2 === 2 ? p.spot : r2 === 1 ? 0xc9c2b4 : undefined; });
  if (p.stars) for (const vx of v.map.values()) if (Math.abs(Math.sin(vx.x * 71.3 + vx.y * 17.1 + vx.z * 33.7)) > 0.975) { vx.m = 2.5; vx.c = 0xffffff; }
  if (p.cracks) for (const vx of v.map.values()) if ((vx.x * 3 + vx.y * 5 + vx.z * 7) % 9 === 0) { vx.c = p.cracks; vx.m = 2.2; }
  return v;
}
function legVox(p: Palette) { const v = new Vox(); v.rbox(-2, 0, -2, 2, 2, 2, 0.9, p.cat ? 0xffffff : p.body); return v; }
function armVox(p: Palette, paw = false) {
  const v = new Vox();
  if (paw) { v.rbox(-1, -5, -1, 1, 0, 1, 0.6, p.body); v.rbox(-2, -7, -2, 2, -3, 2, 1.2, 0xffffff); v.box(-1, -6, 2, 1, -4, 3, 0x6a4a52); v.set(-1, -3, 2, 0x6a4a52).set(1, -3, 2, 0x6a4a52); }
  else v.rbox(-1, -4, -1, 1, 0, 1, 0.6, p.body);
  return v;
}
function bulbVox(color: number) { const v = new Vox(); v.ellipsoid(0, 0, 0, 1.6, 1.6, 1.6, color, 1.7); v.set(-1, 1, 1, 0xffffff, 1.8); return v; }
function stalkVox(color: number) { const v = new Vox(); v.box(0, 0, 0, 1, 5, 1, color); return v; }
function tailVox(p: Palette) {
  const v = new Vox();
  for (let i = 0; i < 14; i++) { const y = Math.round(Math.sin(i * 0.35) * 3); v.ellipsoid(0, y + i * 0.4, -i, 1.6, 1.6, 1.2, i % 3 === 0 ? p.spot : p.body); }
  return v;
}

// ── cosmetics ────────────────────────────────────────────────────────────────
type Cos = { make: () => Vox; at: 'head' | 'body' | 'armR'; pos: [number, number, number]; size?: number; rot?: number; spin?: boolean; sway?: boolean; float?: boolean };
const COS: Record<string, Cos> = {
  goggles: { at: 'head', pos: [0, 0.55, 0.18], rot: -0.9, make: () => { const v = new Vox(); v.box(-7, 0, -6, 7, 1, 2, 0x3a2a1e); for (const sx of [-3, 3]) { v.cyl(sx, 0, 2.6, 0, 1, 0x8a6a3a); v.cyl(sx, 0, 1.6, 1, 2, 0x52f2ff, 1.4); } return v; } },
  hardhat: { at: 'head', pos: [0, 0.58, 0], make: () => { const v = new Vox(); v.ellipsoid(0, 0, 0, 6.5, 4, 5.5, 0xffd23a); v.carve((x, y) => y < 0); v.box(-7, 0, -6, 7, 1, 7, 0xffd23a); v.box(-1, 3, -5, 1, 5, 5, 0xffe46a); return v; } },
  tophat: { at: 'head', pos: [0.05, 0.6, 0], make: () => { const v = new Vox(); v.cyl(0, 0, 6, 0, 1, 0x15151a); v.cyl(0, 0, 4, 1, 9, 0x1e1e26); v.cyl(0, 0, 4.1, 2, 3, 0xff6fd6); return v; } },
  propeller: { at: 'head', pos: [0, 0.58, 0], make: () => { const v = new Vox(); v.ellipsoid(0, 0, 0, 6, 3.5, 5.5, 0xff5a5a); v.carve((x, y) => y < 0); v.paint((vx) => (vx.x % 3 === 0 ? 0xffe14d : vx.x % 3 === 1 ? 0x3b5bff : undefined)); v.box(0, 3, 0, 1, 6, 1, 0x9aa69e); return v; } },
  beanie: { at: 'head', pos: [0, 0.5, -0.02], make: () => { const v = new Vox(); v.ellipsoid(0, 1, 0, 6.6, 5, 5.8, 0x8a4fbf); v.carve((x, y) => y < 0); v.box(-7, 0, -6, 7, 2, 6, 0xb48cff); v.ellipsoid(0, 6, -1, 1.8, 1.8, 1.8, 0xffffff); return v; } },
  chef: { at: 'head', pos: [0, 0.58, 0], make: () => { const v = new Vox(); v.cyl(0, 0, 5, 0, 3, 0xf4f4f0); v.ellipsoid(-2, 5, 0, 3.5, 3, 3.5, 0xffffff); v.ellipsoid(2, 5.5, 0, 3.5, 3, 3.5, 0xffffff); v.ellipsoid(0, 6.5, -1, 3, 2.5, 3, 0xfdfdfd); return v; } },
  wizard: { at: 'head', pos: [0, 0.56, 0], make: () => { const v = new Vox(); v.cyl(0, 0, 7, 0, 1, 0x3a1e6b); for (let y = 1; y < 13; y++) v.cyl(Math.round(y * 0.18), 0, Math.max(0.6, 5 - y * 0.4), y, y + 1, 0x4f2a8f); v.set(1, 5, 3, 0xffe27a, 2.5).set(-2, 3, 4, 0xffe27a, 2.5).set(2, 9, 1, 0xffe27a, 2.5); return v; } },
  party: { at: 'head', pos: [0.1, 0.58, 0], make: () => { const v = new Vox(); for (let y = 0; y < 10; y++) v.cyl(0, 0, Math.max(0.6, 3.6 - y * 0.36), y, y + 1, y % 3 === 0 ? 0xff6fd6 : y % 3 === 1 ? 0x52f2ff : 0xffe14d); v.ellipsoid(0, 10.5, 0, 1.4, 1.4, 1.4, 0xffffff); return v; } },
  cowboy: { at: 'head', pos: [0, 0.58, 0], make: () => { const v = new Vox(); v.ellipsoid(0, 0, 0, 9, 1, 7.5, 0x7a4a26); v.rbox(-4, 0, -4, 4, 5, 4, 1.5, 0x8a5a2e); v.box(-4, 1, -4, 4, 2, 4, 0x3a2414); v.carve((x, y, z) => y === 4 && Math.abs(x) < 1); return v; } },
  halo: { at: 'head', pos: [0, 0.82, 0], float: true, make: () => { const v = new Vox(); v.cyl(0, 0, 5, 0, 1, 0xffe27a, 2.6, 1.2); return v; } },
  crown: { at: 'head', pos: [0, 0.58, 0], make: () => { const v = new Vox(); v.cyl(0, 0, 4.5, 0, 2, 0xe8b73a, 0, 1.2); for (let a = 0; a < 5; a++) { const ang = (a / 5) * Math.PI * 2; v.box(Math.round(Math.cos(ang) * 4), 2, Math.round(Math.sin(ang) * 4), Math.round(Math.cos(ang) * 4) + 1, 4, Math.round(Math.sin(ang) * 4) + 1, 0xe8b73a); } v.set(0, 1, 4, 0xff3a6a, 2.4).set(-4, 1, 0, 0x52f2ff, 2.4).set(4, 1, 0, 0x8cf56b, 2.4); return v; } },
  // outfits
  labcoat: { at: 'body', pos: [0, -0.02, 0], size: AS, make: () => { const v = new Vox(); v.rbox(-5, -1, -4, 5, 6, 4, 2, 0xf2f4ee); v.carve((x, y, z) => z >= 1 && Math.abs(x + 0.5) <= 2.5 && y >= -1); v.box(-4, 4, 2, -2, 6, 4, 0xdfe3da).box(2, 4, 2, 4, 6, 4, 0xdfe3da); v.box(2, 1, 3, 4, 3, 4, 0xe4e8e0).set(3, 3, 4, 0x52a0ff).set(2, 3, 4, 0xff6fd6); v.box(-4, 1, 3, -2, 2, 4, 0xe4e8e0); v.paint((vx) => (vx.y === -1 ? 0xd4d8ce : undefined)); return v; } },
  hoodie: { at: 'body', pos: [0, -0.02, 0], size: AS, make: () => { const v = new Vox(); v.rbox(-5, -1, -4, 5, 6, 4, 2, 0x5a5f6b); v.box(-2, 1, 3, 3, 3, 5, 0x4a4f5a); v.rbox(-4, 4, -6, 4, 8, -2, 1.5, 0x5a5f6b); v.set(-1, 5, 4, 0xeeeeee).set(1, 5, 4, 0xeeeeee).set(-1, 4, 4, 0xeeeeee).set(1, 4, 4, 0xeeeeee); return v; } },
  overalls: { at: 'body', pos: [0, -0.02, 0], size: AS, make: () => { const v = new Vox(); v.rbox(-5, -1, -4, 5, 3, 4, 1.5, 0x2f5a9a); v.box(-2, 3, 3, 3, 5, 4, 0x2f5a9a); v.box(-3, 3, 3, -2, 6, 4, 0x2f5a9a).box(3, 3, 3, 4, 6, 4, 0x2f5a9a); v.set(-2, 4, 4, 0xffe14d).set(2, 4, 4, 0xffe14d); v.box(-1, 1, 4, 2, 2, 5, 0x264a80); return v; } },
  hazmat: { at: 'body', pos: [0, -0.02, 0], size: AS, make: () => { const v = new Vox(); v.rbox(-5, -1, -4, 5, 6, 4, 2, 0xffd23a); v.paint((vx) => (vx.y === 2 ? 0x15151a : undefined)); v.box(-1, 3, 4, 2, 5, 5, 0x15151a).set(0, 4, 5, 0xffd23a); return v; } },
  cape: { at: 'body', pos: [0, 0.32, -0.25], size: AS, sway: true, make: () => { const v = new Vox(); for (let y = 0; y < 7; y++) v.box(-4 - Math.floor(y / 3), -y, 0, 4 + Math.floor(y / 3) + 1, -y + 1, 1, y < 1 ? 0xffd23a : 0xd8304a); return v; } },
  tuxedo: { at: 'body', pos: [0, -0.02, 0], size: AS, make: () => { const v = new Vox(); v.rbox(-5, -1, -4, 5, 6, 4, 2, 0x15151a); v.box(-1, 0, 3, 2, 6, 5, 0xffffff); v.set(0, 2, 5, 0x15151a).set(0, 4, 5, 0x15151a); v.box(-2, 5, 4, 3, 6, 5, 0xd8304a); return v; } },
  spacesuit: { at: 'body', pos: [0, -0.02, 0], size: AS, make: () => { const v = new Vox(); v.rbox(-5, -1, -4, 5, 6, 4, 2, 0xe8ecef); v.box(-2, 1, 3, 3, 4, 5, 0x9aa69e).set(-1, 3, 5, 0xff5a5a, 2).set(1, 3, 5, 0x8cf56b, 2).set(0, 2, 5, 0x52f2ff, 2); v.rbox(-3, 0, -7, 3, 6, -3, 1, 0xd0d6da); return v; } },
  // accessories
  headphones: { at: 'head', pos: [0, 0.32, 0], make: () => { const v = new Vox(); for (let x = -8; x <= 8; x++) { const y = Math.round(Math.sqrt(Math.max(0, 72 - x * x)) * 0.9); v.set(x, y, 0, 0x15151a); v.set(x, y + 1, 0, 0x15151a); } for (const sx of [-9, 8]) v.rbox(sx - 1, -3, -2, sx + 2, 2, 2, 0.8, 0xff6fd6); return v; } },
  bowtie: { at: 'body', pos: [0, 0.34, 0.24], make: () => { const v = new Vox(); v.box(-3, -1, 0, -1, 2, 1, 0xff4f7a).box(1, -1, 0, 3, 2, 1, 0xff4f7a).box(-1, 0, 0, 1, 1, 2, 0xd8305a).set(-4, 0, 0, 0xff4f7a).set(3, 0, 0, 0xff4f7a); return v; } },
  scarf: { at: 'body', pos: [0, 0.34, 0], make: () => { const v = new Vox(); v.cyl(0, 0, 4.6, 0, 2, (x, y, z) => ((x + z) % 3 === 0 ? 0xffffff : 0xd8304a), 0, 1.3); v.box(2, -5, 3, 4, 0, 4, 0xd8304a).set(2, -3, 4, 0xffffff).set(3, -1, 4, 0xffffff); return v; } },
  glasses: { at: 'head', pos: [0, 0.31, 0.31], make: () => { const v = new Vox(); for (const sx of [-3, 3]) for (let a = 0; a < 24; a++) { const ang = (a / 24) * Math.PI * 2; v.set(Math.round(sx + Math.cos(ang) * 3.6), Math.round(Math.sin(ang) * 4), 0, 0x15151a); } v.box(-1, 1, 0, 1, 2, 1, 0x15151a); return v; } },
  mustache: { at: 'head', pos: [0, 0.12, 0.31], make: () => { const v = new Vox(); v.box(-4, 0, 0, 4, 1, 1, 0x3a2414).box(-5, 1, 0, -3, 2, 1, 0x3a2414).box(3, 1, 0, 5, 2, 1, 0x3a2414); return v; } },
  backpack: { at: 'body', pos: [0, 0.14, -0.2], size: AS, make: () => { const v = new Vox(); v.rbox(-3, 0, -3, 3, 6, 0, 1, 0xff9a3d); v.box(-2, 1, -4, 2, 3, -3, 0xd87a20).box(-3, 5, 0, -2, 6, 3, 0x3a2414).box(2, 5, 0, 3, 6, 3, 0x3a2414); return v; } },
  monocle: { at: 'head', pos: [0.14, 0.31, 0.31], make: () => { const v = new Vox(); for (let a = 0; a < 20; a++) { const ang = (a / 20) * Math.PI * 2; v.set(Math.round(Math.cos(ang) * 3.6), Math.round(Math.sin(ang) * 3.6), 0, 0xe8b73a); } for (let y = -4; y > -9; y--) v.set(3 + Math.floor((-y) / 3), y, 0, 0xe8b73a); return v; } },
  jetpack: { at: 'body', pos: [0, 0.12, -0.2], size: AS, make: () => { const v = new Vox(); for (const sx of [-2.5, 2.5]) { v.cyl(sx, -2, 1.8, 0, 6, 0xb8c0c6); v.cyl(sx, -2, 1.2, -1, 0, 0x3a403c); v.ellipsoid(sx, -2.5, -2, 1, 1.6, 1, 0xff9a3d, 2.8); } v.box(-1, 2, -2, 1, 5, 0, 0x56645e); return v; } },
};

function cosmeticMesh(id: string): THREE.Object3D | null {
  const c = COS[id];
  if (!c) return null;
  const { solid, glow } = cachedVox('cos:' + id, c.make, undefined, c.size ?? AS * 0.8);
  const g = new THREE.Group();
  if (solid.attributes.position) { const m = new THREE.Mesh(solid, itemMat); m.castShadow = true; g.add(m); }
  if (glow) g.add(new THREE.Mesh(glow, MAT.glow));
  g.position.set(...c.pos);
  if (c.rot) g.rotation.x = c.rot;
  g.userData.cos = c;
  if (id === 'propeller') {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.06), new THREE.MeshStandardMaterial({ color: 0x52f2ff }));
    blade.position.y = 0.24; blade.name = 'prop'; g.add(blade);
  }
  return g;
}

// ── hand items ───────────────────────────────────────────────────────────────
export type HandItem = 'hammer' | 'wrench' | 'magnifier' | 'box' | 'mug' | 'chalk' | null;
const ITEMS: Record<Exclude<HandItem, null>, () => Vox> = {
  hammer: () => new Vox().box(0, -6, 0, 1, 2, 1, 0x8a5a2e).box(-2, 2, -1, 3, 4, 2, 0x9aa69e),
  wrench: () => new Vox().box(0, -6, 0, 1, 2, 1, 0x9aa69e).box(-1, 2, 0, 2, 4, 1, 0x9aa69e).del(0, 3, 0),
  magnifier: () => { const v = new Vox().box(0, -5, 0, 1, 0, 1, 0x6b4a2e); for (let a = 0; a < 16; a++) { const ang = (a / 16) * Math.PI * 2; v.set(Math.round(Math.cos(ang) * 2.6), Math.round(2.6 + Math.sin(ang) * 2.6), 0, 0xe8b73a); } v.box(-1, 2, 0, 2, 4, 1, 0x9ff6ff, 1.2); return v; },
  box: () => new Vox().box(-4, 0, -3, 4, 5, 3, 0xc9a26a).box(-4, 4, -3, 4, 5, 3, 0xb08a52).box(-1, 1, 3, 2, 3, 4, 0xffffff),
  mug: () => new Vox().cyl(0, 0, 1.6, 0, 3, 0xff6fd6).box(2, 1, 0, 3, 2, 1, 0xff6fd6).cyl(0, 0, 1.1, 2, 3, 0x6b3a1a),
  chalk: () => new Vox().box(0, -2, 0, 1, 1, 1, 0xffffff),
};
function itemMesh(id: Exclude<HandItem, null>) {
  const { solid, glow } = cachedVox('item:' + id, ITEMS[id], undefined, 0.05);
  const g = new THREE.Group();
  if (solid.attributes.position) g.add(new THREE.Mesh(solid, itemMat));
  if (glow) g.add(new THREE.Mesh(glow, MAT.glow));
  return g;
}

// ── shadow blob ──────────────────────────────────────────────────────────────
let blobTex: THREE.CanvasTexture | null = null;
function blob() {
  if (!blobTex) {
    const { c, ctx } = canvas(64, 64);
    const gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,0.65)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.015; m.renderOrder = 1;
  return m;
}

// ── the Alien ────────────────────────────────────────────────────────────────
const EXPR_FOR: Partial<Record<Anim, Expression>> = { type: 'focused', research: 'focused', hammer: 'focused', whack: 'shocked', scribble: 'happy', vat: 'love', wave: 'happy', jump: 'happy', sleep: 'sleepy', play: 'tongue', think: 'derp' };

export class Alien {
  readonly root = new THREE.Group();
  private jelly = new THREE.Group();
  private bodyM!: THREE.Mesh;
  private head = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private antL = new THREE.Group();
  private antR = new THREE.Group();
  private cosGroup: THREE.Object3D[] = [];
  private tail: THREE.Object3D | null = null;
  private faceCanvas = canvas(FACE_W, FACE_H);
  private faceTex: THREE.CanvasTexture;
  private faceMat: THREE.MeshBasicMaterial;
  private mat!: THREE.MeshStandardMaterial;
  private shadow = blob();
  private held: THREE.Object3D | null = null;
  private heldId: HandItem = null;
  private boxAbove: THREE.Object3D | null = null;

  look: AlienLook;
  anim: Anim = 'idle';
  carrying = false;
  /** world target path */
  path: THREE.Vector3[] = [];
  speed = 1.7;
  moving = false;
  heading = 0;
  targetHeading = 0;
  private phase = Math.random() * 10;
  private sq = 0; private sqV = 0; // squash spring
  private blinkT = 2 + Math.random() * 3;
  private blinking = 0;
  private exprOverride: { e: Expression; until: number } | null = null;
  private lastFaceKey = '';
  private seed = Math.random() * 100;
  scaleK = 1;
  /** fired on the impact frame of hammer/whack loops */
  onImpact?: () => void;
  private lastImpactCycle = -1;
  night = false;
  isClone = false;

  constructor(look: AlienLook, opts: { clone?: boolean } = {}) {
    this.look = look;
    this.isClone = !!opts.clone;
    const t = new THREE.CanvasTexture(this.faceCanvas.c);
    t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    this.faceTex = t;
    this.faceMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.35, color: new THREE.Color(0.95, 0.95, 0.95) });
    this.root.add(this.shadow, this.jelly);
    this.build();
    this.root.userData.alien = this;
  }

  private build() {
    const look = this.look;
    const p = palette(look);
    for (const ch of [...this.jelly.children]) this.jelly.remove(ch);
    this.head.clear(); this.armL.clear(); this.armR.clear(); this.legL.clear(); this.legR.clear(); this.antL.clear(); this.antR.clear();
    this.cosGroup = []; this.tail = null; this.held = null; this.heldId = null; this.boxAbove = null;
    this.mat?.dispose();
    this.mat = jellyMaterial(new THREE.Color(p.body).lerp(new THREE.Color('#ffffff'), 0.3), { metal: p.metal, ghost: p.ghost });
    const key = `${look.skin}|${look.body}|${look.belly}`;
    const mk = (part: string, f: () => Vox, origin?: [number, number, number]) => {
      const { solid, glow } = cachedVox(`${key}|${part}`, f, origin);
      const g = new THREE.Group();
      const m = new THREE.Mesh(solid, this.mat); m.castShadow = true;
      if (solid.attributes.position) g.add(m);
      if (glow) g.add(new THREE.Mesh(glow, MAT.glow));
      g.userData.mesh = m;
      return g;
    };
    // legs
    const legL = mk('leg', () => legVox(p), [0, 0, 0]); this.legL.add(legL); this.legL.position.set(-0.12, 0, 0.02);
    const legR = mk('leg', () => legVox(p), [0, 0, 0]); this.legR.add(legR); this.legR.position.set(0.12, 0, 0.02);
    // body
    const body = mk('body', () => bodyVox(p), [0, 0, 0]); body.position.y = 0.1;
    this.bodyM = body.userData.mesh;
    // arms
    this.armL.add(mk('arm', () => armVox(p), [0, 0, 0])); this.armL.position.set(-0.28, 0.4, 0.02);
    const paw = !!p.cat;
    this.armR.add(mk(paw ? 'paw' : 'arm', () => armVox(p, paw), [0, 0, 0])); this.armR.position.set(0.28, 0.4, 0.02);
    // head
    const headM = mk('head', () => headVox(p, 3), [0, 0, 0]);
    this.head.add(headM); this.head.position.set(0, 0.4, 0);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.55), this.faceMat);
    face.position.set(0, 0.29, 0.3 + 0.004); this.head.add(face);
    // antennae (not on the cat)
    if (!p.cat) {
      for (const [grp, sx, col] of [[this.antL, -1, look.bulbA], [this.antR, 1, look.bulbB]] as const) {
        const stalk = mk('stalk', () => stalkVox(p.body), [0, 0, 0]);
        const bulb = new THREE.Group();
        const { solid, glow } = cachedVox('bulb:' + col, () => bulbVox(new THREE.Color(col).getHex()));
        if (solid.attributes.position) bulb.add(new THREE.Mesh(solid, this.mat));
        if (glow) bulb.add(new THREE.Mesh(glow, MAT.glow));
        bulb.position.y = 0.32;
        grp.add(stalk, bulb);
        grp.position.set(sx * 0.2, 0.56, -0.02);
        grp.rotation.z = -sx * 0.32;
        this.head.add(grp);
      }
    } else {
      const tail = mk('tail', () => tailVox(p), [0, 0, 0]);
      tail.position.set(0, 0.2, -0.22); tail.rotation.x = 0.5;
      this.tail = tail; this.jelly.add(tail);
    }
    this.jelly.add(this.legL, this.legR, body, this.armL, this.armR, this.head);
    // cosmetics
    for (const id of [look.hat, look.outfit, look.accessory]) {
      if (!id) continue;
      const m = cosmeticMesh(id);
      if (!m) continue;
      const c = m.userData.cos as Cos;
      if (c.at === 'head') this.head.add(m); else if (c.at === 'body') { m.position.y += 0.1; this.jelly.add(m); } else this.armR.add(m);
      this.cosGroup.push(m);
    }
    this.lastFaceKey = '';
    this.root.scale.setScalar(this.scaleK);
  }

  setLook(look: AlienLook) {
    const prev = this.look;
    this.look = look;
    if (prev.skin !== look.skin || prev.body !== look.body || prev.belly !== look.belly || prev.hat !== look.hat || prev.outfit !== look.outfit || prev.accessory !== look.accessory || prev.bulbA !== look.bulbA || prev.bulbB !== look.bulbB) {
      this.build();
      this.poke(0.6);
    }
    this.lastFaceKey = '';
  }

  hold(item: HandItem) {
    if (this.heldId === item) return;
    if (this.held) { this.held.parent?.remove(this.held); this.held = null; }
    this.heldId = item;
    if (!item || item === 'box') return;
    const m = itemMesh(item);
    m.position.set(0, -0.26, 0.04); m.rotation.x = item === 'magnifier' ? -1.2 : 0;
    this.armR.add(m); this.held = m;
  }

  setCarry(on: boolean) {
    this.carrying = on;
    if (on && !this.boxAbove) { this.boxAbove = itemMesh('box'); this.boxAbove.position.set(0, 1.08, 0.04); this.jelly.add(this.boxAbove); }
    if (!on && this.boxAbove) { this.jelly.remove(this.boxAbove); this.boxAbove = null; }
  }

  express(e: Expression, seconds = 1.6) { this.exprOverride = { e, until: performance.now() + seconds * 1000 }; }

  poke(strength = 1) { this.sqV += 7 * strength; }

  /** World-space point just above the head (for bubbles & tags). */
  headTop(out: THREE.Vector3) { return this.head.localToWorld(out.set(0, 0.95, 0)); }

  get position() { return this.root.position; }

  private currentExpression(): Expression | 'blink' {
    if (this.blinking > 0) return 'blink';
    if (this.exprOverride && performance.now() < this.exprOverride.until) return this.exprOverride.e;
    if (this.moving && this.speed > 2.6) return 'shocked';
    return EXPR_FOR[this.anim] ?? (this.night && this.anim === 'idle' && this.look.quirk === 'sleepy' ? 'sleepy' : this.look.expression);
  }

  update(dt: number, t: number) {
    // movement along path
    if (this.path.length) {
      const target = this.path[0];
      const dx = target.x - this.root.position.x, dz = target.z - this.root.position.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (d <= step) { this.root.position.x = target.x; this.root.position.z = target.z; this.path.shift(); }
      else { this.root.position.x += (dx / d) * step; this.root.position.z += (dz / d) * step; this.targetHeading = Math.atan2(dx, dz); }
      this.moving = this.path.length > 0 || d > step;
    } else this.moving = false;
    // turn smoothly
    let dh = this.targetHeading - this.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += dh * Math.min(1, dt * 9);
    this.root.rotation.y = this.heading;

    // squash spring
    this.sqV += (-60 * this.sq - 7 * this.sqV) * dt;
    this.sq += this.sqV * dt;

    // blink
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinking = 0.12; this.blinkT = 1.8 + Math.random() * 3.5; }
    if (this.blinking > 0) this.blinking -= dt;

    const a = this.anim;
    let y = 0, sy = 1 + Math.sin(t * 2.4 + this.seed) * 0.025, lean = 0;
    const armL = this.armL.rotation, armR = this.armR.rotation, legL = this.legL.rotation, legR = this.legR.rotation, head = this.head.rotation;
    armL.set(0, 0, 0.12); armR.set(0, 0, -0.12); legL.set(0, 0, 0); legR.set(0, 0, 0); head.set(0, 0, 0);

    if (this.moving) {
      this.phase += dt * this.speed * 6.2;
      const s = Math.abs(Math.sin(this.phase));
      y = s * (this.speed > 2.6 ? 0.18 : 0.13);
      sy = s < 0.18 ? 0.86 : 1 + s * 0.07;
      if (s < 0.06 && this.sqV > -1) this.sqV -= 1.6;
      legL.x = Math.sin(this.phase) * 0.6; legR.x = -Math.sin(this.phase) * 0.6;
      armL.x = -Math.sin(this.phase) * 0.7; armR.x = Math.sin(this.phase) * 0.7;
      lean = 0.08;
      if (this.carrying) { armL.x = armR.x = -2.9; }
    } else {
      switch (a) {
        case 'type': armL.x = -1.25 + Math.sin(t * 19) * 0.22; armR.x = -1.25 + Math.sin(t * 19 + 1.7) * 0.22; head.x = 0.08 + Math.sin(t * 9) * 0.03; lean = 0.1; break;
        case 'think': armR.x = -2.35; armR.z = 0.55; head.z = Math.sin(t * 1.3) * 0.16; head.x = -0.12; break;
        case 'research': armR.x = -1.5 + Math.sin(t * 1.6) * 0.15; head.z = Math.sin(t * 0.9) * 0.2; head.y = Math.sin(t * 0.7) * 0.25; lean = 0.12; break;
        case 'hammer': case 'whack': {
          const sp = a === 'whack' ? 7.5 : 5.2;
          const cyc = (t * sp) % (Math.PI * 2);
          armR.x = -2.7 + Math.max(0, Math.sin(cyc)) * 2.2; lean = 0.12;
          const ci = Math.floor((t * sp) / (Math.PI * 2));
          if (cyc > Math.PI * 0.45 && cyc < Math.PI * 0.6 && ci !== this.lastImpactCycle) { this.lastImpactCycle = ci; this.onImpact?.(); if (this.sqV > -2) this.sqV -= 2; }
          if (a === 'whack') { head.z = Math.sin(t * 13) * 0.08; }
          break;
        }
        case 'scribble': armR.x = -1.9 + Math.sin(t * 7) * 0.2; armR.z = -0.3 + Math.cos(t * 7) * 0.25; head.z = Math.sin(t * 2) * 0.08; break;
        case 'vat': armL.x = armR.x = -2.4 + Math.sin(t * 8) * 0.18; armL.z = 0.4; armR.z = -0.4; y = Math.abs(Math.sin(t * 5)) * 0.04; break;
        case 'wave': if (this.look.skin === 'pounce') { armR.x = -2.6 + Math.sin(t * 6) * 0.25; } else { armR.z = -2.6 + Math.sin(t * 10) * 0.35; } head.z = Math.sin(t * 3) * 0.1; y = Math.abs(Math.sin(t * 6)) * 0.05; break;
        case 'jump': { const s = Math.abs(Math.sin(t * 6.5)); y = s * 0.55; sy = s < 0.15 ? 0.82 : 1.1; armL.z = 2.6; armR.z = -2.6; break; }
        case 'sit': y = -0.08; sy = 0.9; legL.x = legR.x = -1.4; break;
        case 'sleep': y = -0.08; sy = 0.86 + Math.sin(t * 1.5) * 0.03; legL.x = legR.x = -1.4; head.x = 0.28; head.z = 0.2; armL.z = 0.5; armR.z = -0.5; break;
        case 'play': armL.x = armR.x = -1.3 + Math.sin(t * 22) * 0.12; head.x = Math.sin(t * 4) * 0.06; break;
        case 'present': {
          const k = (t * 0.5 + this.seed) % 6;
          if (k < 1.6) { armR.z = -2.5 + Math.sin(t * 5) * 0.2; head.z = 0.1; }
          else if (k < 3) { armL.x = -1.2; armR.x = -1.2; armL.z = 0.6; armR.z = -0.6; }
          head.y = Math.sin(t * 0.6 + this.seed) * 0.3;
          break;
        }
        default: {
          head.y = Math.sin(t * 0.5 + this.seed) * 0.35;
          head.z = Math.sin(t * 0.8 + this.seed) * 0.05;
          if (this.look.quirk === 'bouncy') y = Math.max(0, Math.sin(t * 3 + this.seed)) * 0.06;
          if (this.look.skin === 'pounce' && Math.sin(t * 0.4 + this.seed) > 0.6) { armR.x = -2.5 + Math.sin(t * 6) * 0.2; }
          if (this.heldId === 'mug') armR.x = -1.6 + Math.max(0, Math.sin(t * 0.7)) * -0.4;
        }
      }
      if (this.carrying) { armL.x = armR.x = -2.9; }
    }
    // antenna wobble
    this.antL.rotation.x = Math.sin(t * 3 + this.seed) * 0.12 - lean; this.antR.rotation.x = Math.sin(t * 3.3 + this.seed) * 0.12 - lean;
    this.antL.rotation.z = 0.32 + Math.sin(t * 2.1) * 0.06; this.antR.rotation.z = -0.32 - Math.sin(t * 2.3) * 0.06;
    if (this.tail) this.tail.rotation.y = Math.sin(t * 2.2 + this.seed) * 0.45;
    // cosmetic motion
    for (const c of this.cosGroup) {
      const cfg = c.userData.cos as Cos;
      if (cfg.sway) c.rotation.x = 0.15 + (this.moving ? 0.5 : 0.05) + Math.sin(t * 4) * 0.08;
      if (cfg.float) c.position.y = cfg.pos[1] + Math.sin(t * 2) * 0.03;
      const prop = c.getObjectByName('prop'); if (prop) prop.rotation.y += dt * (a === 'type' || this.moving ? 30 : 8);
    }

    const squash = Math.max(-0.35, Math.min(0.35, this.sq));
    this.jelly.position.y = y;
    this.jelly.rotation.x = lean;
    this.jelly.scale.set(1 / Math.sqrt(sy + squash * 0.6) , sy + squash, 1 / Math.sqrt(sy + squash * 0.6));
    const sh = 1 - Math.min(0.5, y * 1.2);
    this.shadow.scale.setScalar(sh); (this.shadow.material as THREE.MeshBasicMaterial).opacity = sh;

    // face
    const e = this.currentExpression();
    const lookOff = this.moving ? 0 : Math.round(Math.sin(t * 0.5 + this.seed) * 1.2);
    const fk = e + lookOff;
    if (fk !== this.lastFaceKey) {
      this.lastFaceKey = fk;
      const p = palette(this.look);
      drawFace(this.faceCanvas.ctx, e, { skin: this.look.skin, body: '#' + new THREE.Color(p.body).getHexString(), eyes: this.look.skin === 'pounce' ? '#3a3a52' : this.look.eyes, cat: this.look.skin === 'pounce' }, lookOff);
      this.faceTex.needsUpdate = true;
    }
  }

  /** Raycast targets */
  pickables(): THREE.Object3D[] { return [this.bodyM, ...this.head.children.filter((c) => (c as THREE.Mesh).isMesh || c.type === 'Group')]; }

  dispose() {
    this.root.parent?.remove(this.root);
    this.faceTex.dispose(); this.faceMat.dispose(); this.mat.dispose();
  }
}
