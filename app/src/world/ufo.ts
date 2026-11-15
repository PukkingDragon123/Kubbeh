// Little voxel UFOs cruising past the viewport out in space, each with a tiny alien pilot
// under a glass dome. Click one and it panics, spins and zooms off.
import * as THREE from 'three';
import { M, S } from '../vox/core';
import { PAL, grid, mesh, glowMat } from '../vox/props/kit';
import type { Particles } from './particles';

let proto: THREE.Object3D | null = null;
function ufoModel(): THREE.Object3D {
  if (proto) return proto.clone(true);
  const root = new THREE.Group();
  const g = grid([-16, -6, -16], [16, 14, 16], 1);
  g.add(S.ellipsoid([0, 0, 0], [15, 3.2, 15]), (x, y, z) => {
    const r = Math.hypot(x, z);
    if (Math.abs(y) < 0.6) return PAL.hullDeep;                                 // seam
    if (y > 0) return r > 11 ? PAL.steel : PAL.chrome;
    return Math.floor(Math.atan2(z, x) * 6 / Math.PI) % 2 ? PAL.steelDark : PAL.hullDark;
  }, M.metal);
  g.add(S.cyl(0, 0, 5, -5, -2.5), PAL.hullDeep, M.metal);
  g.add(S.cyl(0, 0, 3.6, -5.6, -4.8), 0xffffff, M.glow);                         // tractor emitter
  // pilot under the dome: a tiny glob with big eyes
  g.add(S.ellipsoid([0, 5.2, 0], [3.6, 3.4, 3.4]), 0x6fd062, M.jelly);
  for (const sx of [-1, 1]) g.add(S.ellipsoid([sx * 1.5, 5.4, 2.7], [1, 1.4, 0.8]), 0x05070a, M.gloss);
  g.add(S.sphere([0, 7.4, 0], 6.6), 0xbff4ff, M.glass);
  g.carve(S.sphere([0, 7.4, 0], 5.8));
  g.add(S.ellipsoid([0, 5.2, 0], [3.6, 3.4, 3.4]), 0x6fd062, M.jelly);
  for (const sx of [-1, 1]) g.add(S.ellipsoid([sx * 1.5, 5.4, 2.7], [1, 1.4, 0.8]), 0x05070a, M.gloss);
  g.carve(S.box([-16, -6, -16], [16, 2.6, 16]));                                  // keep the saucer below the dome
  g.add(S.ellipsoid([0, 0, 0], [15, 3.2, 15]), (x, y, z) => { const r = Math.hypot(x, z); if (Math.abs(y) < 0.6) return PAL.hullDeep; if (y > 0) return r > 11 ? PAL.steel : PAL.chrome; return Math.floor(Math.atan2(z, x) * 6 / Math.PI) % 2 ? PAL.steelDark : PAL.hullDark; }, M.metal);
  const body = mesh(g, { castShadow: false });
  root.add(body);
  const lg = grid([-16, -2, -16], [16, 2, 16], 1);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; lg.add(S.sphere([Math.cos(a) * 13.2, 0, Math.sin(a) * 13.2], 1.3), 0xffffff, M.glow); }
  const lights = mesh(lg, { castShadow: false }); lights.name = 'lights';
  root.add(lights);
  proto = root;
  return root.clone(true);
}

const COLORS = [0x8cf56b, 0xff6fd6, 0x52f2ff];

export class Ufo {
  group = new THREE.Group();
  private model: THREE.Object3D;
  private lightMat: THREE.MeshBasicMaterial;
  private panic = 0;
  private x: number;
  private speed: number;
  private y0: number; private z0: number;
  constructor(private idx: number, color: number) {
    this.model = ufoModel();
    this.model.scale.setScalar(1.5 + idx * 0.4);
    this.lightMat = glowMat(color ?? COLORS[idx % 3], 2);
    this.model.getObjectByName('lights')!.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.material = this.lightMat; });
    this.group.add(this.model);
    this.group.userData.ufo = this;
    this.x = -30 + idx * 22;
    this.speed = 1.6 + idx * 0.7;
    this.y0 = -1.2 - idx * 1.6;
    this.z0 = -22 - idx * 7;
  }
  poke() { this.panic = 2.5; }
  update(dt: number, t: number, fx: Particles) {
    const sp = this.speed * (this.panic > 0 ? 6 : 1);
    this.x += sp * dt;
    if (this.x > 38) { this.x = -38; }
    this.panic = Math.max(0, this.panic - dt);
    this.group.position.set(this.x, this.y0 + Math.sin(t * 0.9 + this.idx * 2) * 0.6, this.z0 + Math.cos(t * 0.5 + this.idx) * 1.2);
    this.model.rotation.y += dt * (this.panic > 0 ? 18 : 1.2);
    this.model.rotation.z = Math.sin(t * 1.3 + this.idx) * 0.12 + (this.panic > 0 ? Math.sin(t * 30) * 0.3 : 0);
    const k = Math.sin(t * 6 + this.idx) > 0 ? 2.2 : 1.1;
    this.lightMat.color.set(COLORS[this.idx % 3]).multiplyScalar(k);
    if (this.panic > 0 && Math.random() < dt * 30) fx.emit({ tile: 'sparkle', pos: this.group.position.clone(), vel: [-3, 0, 0], spread: [1, 1, 1], life: 0.6, size: 0.3, color: '#ffffff', additive: true });
  }
}
