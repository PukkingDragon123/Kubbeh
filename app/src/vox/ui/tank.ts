// The FUEL TANK — a real voxel machine: riveted base with a hazard ring, four steel
// struts, a thick glass cylinder of glowing fuel that sits at the true fuel level, voxel
// bubbles streaming up, marker rings at 50 / 25 / 10 % whose lamps blink amber/red when
// the level drops past them, a valve wheel and a warning beacon that spins on alarm.
import * as THREE from 'three';
import { M, S, VoxGrid, mix } from '../core';
import { meshGrid, materials, toObject } from '../mesh';
import { C, INK, bevel, vgrad } from './vkit';
import type { FuelTier } from '../../core/types';

const RES = 2.5;
const SIZE = 0.05;            // world units per model unit
const Y0 = -12, Y1 = 11;      // liquid range (model units)
const RL = 7.9;               // liquid radius
const MARKS = [0.5, 0.25, 0.1];
const LAMP_COL = [C.cyan, C.amber, C.red];

export const TIER_COLOR: Record<FuelTier, number> = { full: 0x8cf56b, half: 0x52f2ff, quarter: 0xffbe3d, critical: 0xff5a5a, empty: 0xff5a5a };

function shell(): THREE.Group {
  const g = VoxGrid.span([-13, -17, -13], [13, 19, 13], RES);
  // base plinth with hazard ring + bolts
  g.add(S.cyl(0, 0, 11.4, -16.5, -14), vgrad(C.steel, C.steelHi, -16.5, -14), M.metal);
  g.add(S.cyl(0, 0, 10.4, -14, -12.2), (x, _y, z) => (Math.floor((Math.atan2(z, x) / Math.PI) * 12 + 24) % 2 ? C.amber : 0x1b1a16), M.solid);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.add(S.sphere([Math.cos(a) * 10.6, -14.6, Math.sin(a) * 10.6], 0.55), C.steelHi, M.metal); }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(S.box([sx * 8 - 1.6, -17, sz * 8 - 1.6], [sx * 8 + 1.6, -16, sz * 8 + 1.6], 0.3), C.gun, M.metal);
  // glass cylinder (hollow)
  g.add(S.cyl(0, 0, 8.7, -12.2, 11.2), 0x58808f, M.glass);
  g.carve(S.cyl(0, 0, 8.2, -12.1, 11.1));
  // struts
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; g.add(S.capsule([Math.cos(a) * 9.5, -12.4, Math.sin(a) * 9.5], [Math.cos(a) * 9.5, 11.4, Math.sin(a) * 9.5], 0.75), vgrad(C.steelLo, C.steelHi, -12, 11), M.metal); }
  // marker rings (metal) — lamps are separate meshes
  for (const m of MARKS) { const y = Y0 + (Y1 - Y0) * m; g.add(S.torus([0, y, 0], [0, 1, 0], 9.0, 0.38), C.steelHi, M.metal); g.add(S.box([-1.6, y - 1.1, 8.6], [1.6, y + 1.1, 10.2], 0.3), C.dark, M.solid); }
  // top cap + dome + valve + pipe
  g.add(S.cyl(0, 0, 9.8, 11.2, 13.4), vgrad(C.steelHi, 0xe6eef4, 11, 13.4), M.metal);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.add(S.sphere([Math.cos(a) * 9.1, 12.4, Math.sin(a) * 9.1], 0.5), C.steelLo, M.metal); }
  g.add(S.ellipsoid([0, 13.4, 0], [7.6, 2.6, 7.6]), C.steel, M.metal);
  g.add(S.capsule([0, 14, 0], [0, 16.4, 0], 0.7), C.gun, M.metal);
  g.add(S.torus([0, 16.6, 0], [0, 1, 0], 2.6, 0.55), C.red, M.solid);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI; g.add(S.capsule([Math.cos(a) * 2.6, 16.6, Math.sin(a) * 2.6], [-Math.cos(a) * 2.6, 16.6, -Math.sin(a) * 2.6], 0.3), C.red, M.solid); }
  g.add(S.capsule([-7.2, 13, 0], [-12, 13, 0], 1.3), C.steel, M.metal);
  g.add(S.capsule([-12, 13, 0], [-12, -10, 0], 1.3), C.steel, M.metal);
  g.add(S.torus([-12, 8, 0], [0, 1, 0], 1.6, 0.45), C.brass, M.metal);
  g.add(S.torus([-12, -4, 0], [0, 1, 0], 1.6, 0.45), C.brass, M.metal);
  // gauge plate on the base front
  g.add(S.box([-3.4, -16, 10.6], [3.4, -13.2, 11.8], 0.4), C.dark, M.solid);
  g.add(S.box([-2.8, -15.4, 11.6], [2.8, -13.8, 12.1]), C.screen, M.gloss);
  bevel(g, 0.12, 0.18);
  // glass is meshed on its own, without an outline shell (see vkit.obj)
  const glass = g.blank();
  for (let i = 0; i < g.mat.length; i++) if (g.mat[i] === M.glass) { glass.mat[i] = M.glass; glass.col[i] = g.col[i]; g.mat[i] = 0; }
  const o = toObject(g, { size: SIZE, outline: INK, outlineWidth: 2, ao: 0.75, name: 'tankShell' });
  o.add(toObject(glass, { size: SIZE, occluder: g, name: 'tankGlass' }));
  return o;
}

function layerGeo(): THREE.BufferGeometry {
  const g = VoxGrid.span([-9, 0, -9], [9, 1 / RES, 9], RES);
  g.add(S.cyl(0, 0, RL, 0, 1 / RES), 0xffffff, M.solid);
  const res = meshGrid(g, { size: SIZE, ao: 0 });
  return [...res.geos.values()][0];
}

function lampGeo(): THREE.BufferGeometry {
  const g = VoxGrid.span([-2, -2, -2], [2, 2, 2], RES);
  g.add(S.ellipsoid([0, 0, 0], [1.2, 0.9, 0.7]), 0xffffff, M.solid);
  return [...meshGrid(g, { size: SIZE, ao: 0 }).geos.values()][0];
}

let shared: { shell: THREE.Group; layer: THREE.BufferGeometry; lamp: THREE.BufferGeometry; bubble: THREE.BoxGeometry; beacon: THREE.Group } | null = null;
function parts() {
  if (shared) return shared;
  const bg = VoxGrid.span([-3, -1, -3], [3, 4, 3], RES);
  bg.add(S.cyl(0, 0, 2.2, -0.6, 0.6), C.gun, M.metal);
  bg.add(S.ellipsoid([0, 0.6, 0], [1.8, 2.2, 1.8]), 0xffffff, M.glass);
  shared = {
    shell: shell(),
    layer: layerGeo(),
    lamp: lampGeo(),
    bubble: new THREE.BoxGeometry(SIZE / RES * 2, SIZE / RES * 2, SIZE / RES * 2),
    beacon: toObject(bg, { size: SIZE, name: 'beacon' }),
  };
  void materials;
  return shared;
}

export class FuelTank {
  readonly root = new THREE.Group();
  private liquid: THREE.InstancedMesh;
  private surface: THREE.Mesh;
  private bubbles: THREE.InstancedMesh;
  private lamps: THREE.Mesh[] = [];
  private liquidMat: THREE.MeshStandardMaterial;
  private surfMat: THREE.MeshStandardMaterial;
  private beaconLight: THREE.Mesh;
  private shown = 1;
  private shake = 0;
  private bub: { y: number; x: number; z: number; v: number; w: number }[] = [];
  private layers: number;
  private lastTier: FuelTier = 'full';
  private body = new THREE.Group();

  constructor() {
    const p = parts();
    this.root.add(this.body);
    this.body.add(p.shell.clone(true));
    this.layers = Math.round((Y1 - Y0) * RES);
    this.liquidMat = new THREE.MeshStandardMaterial({ color: 0x8cf56b, emissive: 0x8cf56b, emissiveIntensity: 0.95, roughness: 0.25, transparent: true, opacity: 0.94 });
    this.surfMat = new THREE.MeshStandardMaterial({ color: 0xd8ffc8, emissive: 0x8cf56b, emissiveIntensity: 0.9, roughness: 0.15 });
    this.liquid = new THREE.InstancedMesh(p.layer, this.liquidMat, this.layers);
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.layers; i++) {
      m.makeTranslation(0, (Y0 + i / RES) * SIZE, 0);
      // alternate a faint stripe every few layers for texture
      this.liquid.setMatrixAt(i, m);
      this.liquid.setColorAt(i, new THREE.Color(i % 6 === 0 ? 0xe8ffe0 : 0xffffff));
    }
    this.liquid.renderOrder = 1;
    this.surface = new THREE.Mesh(p.layer, this.surfMat);
    this.body.add(this.liquid, this.surface);
    // bubbles
    const bm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, toneMapped: false });
    this.bubbles = new THREE.InstancedMesh(p.bubble, bm, 28);
    for (let i = 0; i < 28; i++) this.bub.push(this.newBubble(true));
    this.body.add(this.bubbles);
    // lamps
    MARKS.forEach((mk, i) => {
      const lm = new THREE.Mesh(p.lamp, new THREE.MeshStandardMaterial({ color: 0x26302a, emissive: 0x000000, roughness: 0.3 }));
      lm.position.set(0, (Y0 + (Y1 - Y0) * mk) * SIZE, 10.3 * SIZE);
      lm.userData.col = LAMP_COL[i];
      this.lamps.push(lm);
      this.body.add(lm);
    });
    // beacon
    const bc = p.beacon.clone(true);
    bc.position.set(4.6 * SIZE, 13.6 * SIZE, 3.4 * SIZE);
    this.beaconLight = new THREE.Mesh(new THREE.SphereGeometry(SIZE * 1.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0x441010 }));
    this.beaconLight.position.set(4.6 * SIZE, 14.5 * SIZE, 3.4 * SIZE);
    this.body.add(bc, this.beaconLight);
  }

  private newBubble(anywhere = false) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (RL - 1);
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: anywhere ? Y0 + Math.random() * (Y1 - Y0) : Y0, v: 2 + Math.random() * 4, w: Math.random() * 6 };
  }

  /** Kick the alarm: shake + beacon spin. */
  alarm() { this.shake = 1.4; }

  update(dt: number, t: number, level: number, tier: FuelTier) {
    if (tier !== this.lastTier) {
      const order = ['full', 'half', 'quarter', 'critical', 'empty'];
      if (order.indexOf(tier) > order.indexOf(this.lastTier)) this.alarm();
      this.lastTier = tier;
    }
    level = Math.max(0, Math.min(1, level));
    this.shown += (level - this.shown) * Math.min(1, dt * 2.5);
    const col = TIER_COLOR[tier];
    this.liquidMat.color.setHex(col); this.liquidMat.emissive.setHex(col);
    this.surfMat.emissive.setHex(col); this.surfMat.color.setHex(mix(col, 0xffffff, 0.55));
    const n = Math.round(this.shown * this.layers);
    this.liquid.count = Math.max(0, n - 1);
    const topY = (Y0 + n / RES) * SIZE;
    this.surface.visible = n > 0;
    this.surface.position.y = topY - SIZE / RES + Math.sin(t * 2.2) * SIZE * 0.08;
    // bubbles live under the surface
    const top = Y0 + n / RES;
    const m = new THREE.Matrix4();
    let shownB = 0;
    for (let i = 0; i < this.bub.length; i++) {
      const b = this.bub[i];
      b.y += b.v * dt;
      if (b.y > top - 0.4) Object.assign(b, this.newBubble());
      if (top - Y0 < 1) continue;
      const wob = Math.sin(t * 3 + b.w) * 0.35;
      m.makeTranslation((b.x + wob) * SIZE, b.y * SIZE, b.z * SIZE);
      this.bubbles.setMatrixAt(shownB++, m);
    }
    this.bubbles.count = shownB;
    this.bubbles.instanceMatrix.needsUpdate = true;
    // lamps
    MARKS.forEach((mk, i) => {
      const lm = this.lamps[i];
      const mat = lm.material as THREE.MeshStandardMaterial;
      const lit = this.shown <= mk;
      const blink = lit && Math.sin(t * (i === 2 ? 14 : 8)) > -0.2;
      mat.color.setHex(lit ? lm.userData.col : 0x26302a);
      mat.emissive.setHex(blink ? lm.userData.col : 0x000000);
      mat.emissiveIntensity = blink ? 2.2 : 0;
    });
    // beacon + shake
    const crit = tier === 'critical' || tier === 'empty';
    this.shake = Math.max(0, this.shake - dt);
    const bOn = crit || this.shake > 0 ? Math.sin(t * 10) > 0 : false;
    (this.beaconLight.material as THREE.MeshBasicMaterial).color.setHex(bOn ? 0xff3030 : crit ? 0x661818 : 0x2a1414);
    const s = this.shake * 0.04;
    this.body.position.set(Math.sin(t * 61) * s * SIZE * 20, 0, Math.cos(t * 47) * s * SIZE * 10);
    this.body.rotation.z = Math.sin(t * 53) * s * 0.4;
  }
}
