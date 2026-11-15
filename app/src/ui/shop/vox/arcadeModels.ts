// Voxel cast for the arcade game UFO CATCH: jelly blobs, gene capsules, space junk,
// bolts, UFOs, the city skyline and a pooled voxel-cube particle system.
import * as THREE from 'three';
import { M, S, VoxGrid, fbm, hash3, mix, shade } from '../../../vox/core';
import { toObject } from '../../../vox/mesh';
import { buildGlyph } from './glyphs';

const protos = new Map<string, THREE.Object3D>();
function proto(key: string, make: () => THREE.Object3D) {
  let p = protos.get(key);
  if (!p) { p = make(); protos.set(key, p); }
  return p.clone(true);
}

/** ~1 world unit wide models (playfield units: 1 = 10 game px) */
export function blob(color: number) {
  return proto('blob' + color, () => {
    const v = VoxGrid.span([-10, -10, -9], [10, 10, 9], 1);
    v.add(S.ellipsoid([0, -1, 0], [8.4, 7.6, 7.2]), (x, y) => mix(shade(color, 0.72), mix(color, 0xffffff, 0.3), (y + 8) / 16), M.solid);
    for (const sx of [-1, 1]) {
      v.paint(S.ellipsoid([sx * 3.2, 0, 6.2], [1.8, 2.6, 2]), 0x07090c, M.gloss);
      v.paint(S.sphere([sx * 3.2 + 0.7, 1.2, 7.3], 0.7), 0xffffff, M.glow);
    }
    v.add(S.sphere([-3.6, 4.6, 4.6], 1.2), 0xffffff, M.solid);
    return toObject(v, { size: 0.055, anchor: 'center', outline: shade(color, 0.3) });
  });
}

export function capsule() {
  return proto('gene', () => { const g = buildGlyph('dna', 0xffbe3d, { gold: false }); g.scale.setScalar(0.9); const o = new THREE.Group(); o.add(g); return o; });
}

export function junk(seed: number) {
  return proto('junk' + (seed % 4), () => {
    const v = VoxGrid.span([-10, -10, -10], [10, 10, 10], 1);
    v.add(S.sphere([0, 0, 0], 7.5), (x, y, z) => shade(0x7a8794, 0.75 + fbm(x * 0.2, y * 0.2, z * 0.2, 2, seed) * 0.5), M.metal);
    for (let i = 0; i < 6; i++) {
      const a = hash3(i, seed, 1) * Math.PI * 2, b = (hash3(i, seed, 2) - 0.5) * Math.PI;
      v.carve(S.sphere([Math.cos(a) * Math.cos(b) * 8, Math.sin(b) * 8, Math.sin(a) * Math.cos(b) * 8], 2.4 + hash3(i, seed, 3) * 2));
    }
    v.paint(S.sphere([-3, 3, 5], 2), 0xc4ccd3, M.metal);
    return toObject(v, { size: 0.06, anchor: 'center', outline: 0x1a1f24 });
  });
}

export function bolt() {
  return proto('bolt', () => {
    const v = VoxGrid.span([-8, -12, -8], [8, 12, 8], 1.25);
    v.add(S.disc([0, 7, 0], [0, 1, 0], 6, 2.2, 6), (x, y, z) => shade(0xc4ccd3, 0.85 + hash3(x | 0, y | 0, z | 0) * 0.2), M.metal);
    v.add(S.cyl(0, 0, 2.4, -10, 5), (_x, y) => ((Math.floor(y * 1.6) % 2) ? 0x9aa6b2 : 0x6b7680), M.metal);
    return toObject(v, { size: 0.05, anchor: 'center', outline: 0x1a1f24 });
  });
}

export function ufo() {
  return proto('ufo', () => { const g = buildGlyph('ufo', 0x52f2ff); g.scale.setScalar(1.25); const o = new THREE.Group(); o.add(g); return o; });
}

export function heart() {
  return proto('heart', () => buildGlyph('heart', 0xff6fd6));
}

/** The city skyline + street, spanning x ∈ [-9, 9]. */
export function skyline() {
  return proto('skyline', () => {
    const v = VoxGrid.span([-90, 0, -6], [90, 40, 4], 1);
    let x = -90;
    let i = 0;
    while (x < 90) {
      const w = 8 + Math.floor(hash3(i, 7, 7) * 9), h = 10 + Math.floor(hash3(i, 3, 3) * 26);
      const base = mix(0x0e1a26, 0x182838, hash3(i, 9, 9));
      v.add(S.box([x, 0, -5 + (i % 3)], [x + w - 1, h, 2]), (bx, by, bz) => {
        const win = (Math.floor(bx) % 3 === 0) && (Math.floor(by) % 4 === 1) && bz > 1;
        if (win && hash3(Math.floor(bx), Math.floor(by), i) > 0.55) return hash3(Math.floor(bx), Math.floor(by), 5) > 0.7 ? 0xff6fd6 : 0xffbe3d;
        return shade(base, 0.9 + hash3(Math.floor(bx), Math.floor(by), 1) * 0.1);
      }, M.solid);
      // antenna + roof light
      if (hash3(i, 1, 1) > 0.5) { v.add(S.box([x + 3, h, 0], [x + 4, h + 4, 1]), 0x5f6a75, M.metal); v.add(S.box([x + 3, h + 4, 0], [x + 4, h + 5, 1]), 0xff3a5a, M.glow); }
      x += w; i++;
    }
    v.recolor((bx, by, bz, c) => {
      const isWin = (Math.floor(bx) % 3 === 0) && (Math.floor(by) % 4 === 1) && bz > 1;
      return isWin && (c === 0xff6fd6 || c === 0xffbe3d) ? [c, M.glow] : undefined;
    });
    const o = toObject(v, { size: 0.1 });
    return o;
  });
}

/** street slab with a neon curb */
export function street() {
  return proto('street', () => {
    const v = VoxGrid.span([-90, -10, -8], [90, 0, 8], 1);
    // asphalt with paving seams; a painted curb stripe only along the top front edge
    v.add(S.box([-90, -10, -8], [90, 0, 8]), (x, y, z) => {
      if (y > -1.5 && z > 6) return (Math.floor(x / 3) % 2) ? 0xffbe3d : 0x2a2416;
      if (y > -1.5) return shade(0x3a4440, 0.9 + hash3(Math.floor(x), 0, Math.floor(z)) * 0.15);
      return Math.floor(x) % 9 === 0 ? 0x161c1a : shade(0x222a27, 0.9 + hash3(Math.floor(x), Math.floor(y), 2) * 0.12);
    }, M.solid);
    return toObject(v, { size: 0.1 });
  });
}

/** pooled voxel-cube particles */
export class Cubes {
  readonly mesh: THREE.InstancedMesh;
  private p: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; s: number; c: THREE.Color }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  constructor(n = 220) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < n; i++) { this.mesh.setColorAt(i, new THREE.Color(0)); this.mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); }
  }
  burst(x: number, y: number, color: number, n = 12, speed = 4) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      if (this.p.length >= this.mesh.count) this.p.shift();
      const a = Math.random() * Math.PI * 2;
      this.p.push({ x, y, z: 0.3, vx: Math.cos(a) * speed * Math.random(), vy: Math.random() * speed * 1.2, vz: (Math.random() - 0.3) * speed, life: 0, max: 0.5 + Math.random() * 0.5, s: 0.08 + Math.random() * 0.1, c });
    }
  }
  update(dt: number) {
    let i = 0;
    this.p = this.p.filter((p) => (p.life += dt) < p.max);
    for (const p of this.p) {
      p.vy -= 12 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = 1 - p.life / p.max;
      this.e.set(p.life * 8, p.life * 6, 0); this.q.setFromEuler(this.e);
      this.m.compose(new THREE.Vector3(p.x, p.y, p.z), this.q, new THREE.Vector3(p.s * k, p.s * k, p.s * k));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, p.c);
      i++;
    }
    for (let j = i; j < this.mesh.count; j++) this.mesh.setMatrixAt(j, this.m.makeScale(0, 0, 0));
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** a field of twinkling voxel stars */
export function stars(n = 140) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const s = 0.04 + Math.random() * 0.06;
    m.compose(new THREE.Vector3((Math.random() - 0.5) * 26, Math.random() * 11 - 2.5, -6 - Math.random() * 3), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color(Math.random() > 0.8 ? 0xffffff : Math.random() > 0.5 ? 0x9fb4ff : 0xffd8f4));
  }
  return mesh;
}
