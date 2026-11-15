// Ship stations: the clickable machines the crew works at, all high-resolution voxel.
// Each exposes work "spots" (where an alien stands + which animation it plays), a blocked
// floor rect, a camera focus anchor, and a per-frame update that makes it feel alive.
import * as THREE from 'three';
import type { PanelId } from '../core/types';
import { M, S, hash3, mix, shade } from '../vox/core';
import { PAL, U, grid, mesh, plate, hazard, stampText, textWidth, glowMat, vgrad } from '../vox/props/kit';
import { crew, economy, fuel, activeProjectId, projects } from '../core/state';
import type { Particles } from './particles';

export type Anim = 'type' | 'think' | 'research' | 'carry' | 'hammer' | 'whack' | 'scribble' | 'vat' | 'wave' | 'idle' | 'sit' | 'play' | 'sleep' | 'present' | 'jump';

export interface Spot { id: string; station: string; pos: THREE.Vector3; face: number; anim: Anim; holder?: string }

export interface Station {
  id: string;
  label: string;
  panel?: PanelId;
  group: THREE.Group;
  /** objects that respond to clicks / hover */
  pick: THREE.Object3D[];
  /** blocked floor rect in world units [x0, z0, x1, z1] */
  rect: [number, number, number, number];
  anchor: THREE.Vector3;
  spots: Spot[];
  update?(dt: number, t: number): void;
}

const faceToward = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.x - from.x, to.z - from.z);

function hitBox(w: number, h: number, d: number, y = h / 2) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
  m.position.y = y;
  return m;
}
const busyCount = () => crew.value.filter((m) => m.activity !== 'idle' && m.activity !== 'sleeping').length;
const anyDoing = (...k: string[]) => crew.value.some((m) => k.includes(m.activity));
const setGlow = (o: THREE.Object3D, mat: THREE.Material) => { o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && m.userData.voxMat === M.glow) m.material = mat; }); return o; };

/** Instanced glowing cubes we can drive as a bar graph / waveform. */
class VoxBars {
  mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  constructor(public cols: number, public rows: number, public cell: number, color: number, k = 1.8) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(cell * 0.82, cell * 0.82, cell * 0.5), mat, cols * rows);
    this.mesh.frustumCulled = false;
  }
  set(values: number[]) {
    let n = 0;
    for (let c = 0; c < this.cols; c++) {
      const h = Math.round(Math.max(0, Math.min(1, values[c] ?? 0)) * this.rows);
      for (let r = 0; r < h; r++) { this.m.setPosition((c - (this.cols - 1) / 2) * this.cell, r * this.cell, 0); this.mesh.setMatrixAt(n++, this.m); }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ── MAIN BRIDGE CONSOLE ──────────────────────────────────────────────────────
function computer(): Station {
  const g = new THREE.Group();
  g.position.set(1.2, 0, -7.0);
  // desk: curved console 5 wide, 1.6 deep (model units ×16)
  const d = grid([-42, 0, -14], [42, 66, 14], 1.5);
  const deskTop = (x: number) => 15 + Math.cos((x / 40) * Math.PI * 0.5) * 0.5;
  d.add(S.box([-40, 0, -12], [40, 14, 10], 1.2), (x, y, z) => {
    if (y < 1.5) return PAL.hullDeep;
    if (z > 8 && y > 4 && y < 6) return x % 10 < 0.8 ? PAL.hullDark : PAL.paintTeal;          // front teal band
    return plate(PAL.hullDark, x + 40, y, { pw: 20, ph: 14 });
  }, M.metal);
  d.add(S.box([-41, 14, -13], [41, 16, 12], 0.8), (x, _y, z) => (z > 10 ? PAL.hullHi : plate(PAL.steelDark, x + 41, z + 13, { pw: 82, ph: 25, bolt: false })), M.metal);
  // keyboards
  for (const kx of [-24, 0, 24]) {
    d.add(S.box([kx - 9, 16, 2], [kx + 9, 17, 9], 0.3), PAL.hullDeep, M.metal);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) d.add(S.box([kx - 8 + i * 2.05, 17, 3 + j * 2], [kx - 6.6 + i * 2.05, 17.6, 4.4 + j * 2]), (i + j) % 5 === 0 ? 0xffffff : 0x2f3a40, (i + j) % 5 === 0 ? M.glow : M.solid);
  }
  // big monitors on articulated arms: frames only, holo content is live voxels
  const monitor = (cx: number, w: number, h: number, y0: number, tilt: number) => {
    d.add(S.box([cx - 1.4, 16, -10], [cx + 1.4, y0, -8]), PAL.steelDark, M.metal);
    d.add(S.box([cx - w / 2 - 1.6, y0, -11 + tilt], [cx + w / 2 + 1.6, y0 + h + 3, -7.6 + tilt], 0.8), (x, y) => (y > y0 + h + 1.8 ? PAL.hullHi : PAL.hullDeep), M.metal);
    d.carve(S.box([cx - w / 2, y0 + 1.5, -8.4 + tilt], [cx + w / 2, y0 + h + 1.5, -7 + tilt]));
    d.add(S.box([cx - w / 2, y0 + 1.5, -9 + tilt], [cx + w / 2, y0 + h + 1.5, -8.4 + tilt]), 0x04120c, M.gloss);
    d.add(S.sphere([cx + w / 2 - 0.4, y0 + 0.7, -7.4 + tilt], 0.5), 0xffffff, M.glow);
  };
  monitor(-25, 18, 13, 22, 1.5); monitor(0, 26, 18, 24, 0); monitor(25, 18, 13, 22, 1.5);
  // under-desk server with blinky lights
  d.add(S.box([28, 1.5, -8], [38, 13, 8], 0.6), PAL.hullDeep, M.metal);
  for (let i = 0; i < 5; i++) d.add(S.box([29 + i * 1.8, 10, 8], [30 + i * 1.8, 11, 8.6]), [PAL.glob, PAL.pink, PAL.cyan, PAL.amber, PAL.glob][i], M.glow);
  // hologram emitter puck
  d.add(S.cyl(0, 6, 4, 16, 18), PAL.steel, M.metal);
  d.add(S.cyl(0, 6, 2.6, 18, 18.6), 0xffffff, M.glow);
  const body = setGlow(mesh(d), glowMat(0xc8ffe8, 1.6));
  g.add(body);

  // live holo content on the 3 screens (instanced voxel bars & waves)
  const L = new VoxBars(10, 7, 1.6 * U, PAL.glob), C = new VoxBars(14, 9, 1.6 * U, PAL.cyan), R = new VoxBars(10, 7, 1.6 * U, PAL.pink);
  L.mesh.position.set(-25 * U, 24 * U, (-7.6 + 1.5) * U);
  C.mesh.position.set(0, 26.2 * U, -7.6 * U);
  R.mesh.position.set(25 * U, 24 * U, (-7.6 + 1.5) * U);
  g.add(L.mesh, C.mesh, R.mesh);

  // rotating voxel hologram of the active project above the emitter
  const holo = new THREE.Group(); holo.position.set(0, 30 * U, 6 * U);
  const hg = grid([-8, -8, -8], [8, 8, 8], 1.5);
  hg.add(S.sphere([0, 0, 0], 6), (x, y, z) => ((Math.floor(x * 0.6) + Math.floor(y * 0.6) + Math.floor(z * 0.6)) % 2 ? 0xffffff : 0x8ad8ff), M.glow);
  hg.carve(S.sphere([0, 0, 0], 5));
  hg.add(S.torus([0, 0, 0], [0.3, 1, 0], 7.4, 0.5), 0xffffff, M.glow);
  const holoMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(0.2, 0.8, 0.75), transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const hm = mesh(hg, { castShadow: false }); hm.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.material = holoMat; });
  holo.add(hm);
  g.add(holo);
  // projection cone (stacked translucent voxel rings)
  for (let i = 0; i < 5; i++) {
    const rg = grid([-6, -1, -6], [6, 1, 6], 2);
    rg.add(S.torus([0, 0, 0], [0, 1, 0], 1 + i * 1.1, 0.25), 0xffffff, M.glow);
    const rm = mesh(rg, { castShadow: false }); rm.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.material = holoMat; });
    rm.position.set(0, (19 + i * 2.2) * U, 6 * U); g.add(rm);
  }

  const hit = hitBox(5.2, 3.2, 1.8); g.add(hit);
  const spots: Spot[] = [-1.5, 0, 1.5].map((dx, i) => ({ id: `pc${i}`, station: 'computer', pos: new THREE.Vector3(1.2 + dx, 0, -5.55), face: Math.PI, anim: 'type' as Anim }));
  let acc = 0;
  const vals = { l: new Array(10).fill(0.2), c: new Array(14).fill(0.2), r: new Array(10).fill(0.2) };
  return {
    id: 'computer', label: 'Bridge Console', panel: 'terminal', group: g, pick: [hit, body], rect: [-1.4, -7.9, 3.8, -6.1],
    anchor: new THREE.Vector3(1.2, 1.5, -6.6), spots,
    update(dt, t) {
      acc += dt;
      holo.rotation.y += dt * (busyCount() ? 1.6 : 0.45);
      holo.position.y = 30 * U + Math.sin(t * 1.4) * 0.03;
      if (acc < 0.09) return; acc = 0;
      const busy = busyCount() > 0, writing = anyDoing('writing', 'coding');
      for (let i = 0; i < 10; i++) vals.l[i] = busy ? 0.25 + Math.abs(Math.sin(t * 3 + i * 0.7)) * 0.75 : 0.15 + Math.sin(t * 0.5 + i) * 0.08;
      for (let i = 0; i < 14; i++) vals.c[i] = writing ? 0.3 + Math.abs(Math.sin(t * 7 + i * 1.3) * Math.cos(t * 2.1 + i)) * 0.7 : 0.4 + Math.sin(t * 1.2 + i * 0.45) * 0.3;
      const tasks = projects.value.find((p) => p.id === activeProjectId.value)?.tasks ?? projects.value[0]?.tasks ?? [];
      const done = tasks.filter((x) => x.status === 'done').length / Math.max(1, tasks.length);
      for (let i = 0; i < 10; i++) vals.r[i] = i < Math.round(done * 10) ? 1 : 0.12 + (i % 3) * 0.05;
      L.set(vals.l); C.set(vals.c); R.set(vals.r);
    },
  };
}

// ── PROF. GLORP'S IDEA DESK ──────────────────────────────────────────────────
function ideaDesk(): Station {
  const g = new THREE.Group();
  g.position.set(-6.2, 0, 1.5);
  const d = grid([-24, 0, -12], [24, 60, 10], 1.5);
  // curved wooden-and-brass desk facing the room
  d.add(S.box([-20, 0, -6], [20, 13, 6], 1.2), (x, y, z) => {
    if (y > 11.6) return PAL.woodDark;
    if (z > 4.6) return x % 8 < 0.7 ? PAL.woodDark : PAL.wood;
    return PAL.wood;
  }, M.solid);
  d.add(S.box([-21, 13, -7], [21, 15, 7], 0.8), 0x3a2414, M.solid);
  d.add(S.box([-19, 15, -6], [-11, 16, 0]), 0xefe2b8, M.solid);                                 // paper stack
  for (let i = 0; i < 4; i++) d.add(S.box([-18.5 + i * 0.3, 16 + i * 0.6, -5.5], [-11.5 + i * 0.3, 16.5 + i * 0.6, -0.5]), mix(0xefe2b8, 0xffffff, i * 0.2), M.solid);
  d.add(S.cyl(14, -2, 2.2, 15, 21), PAL.pink, M.metal); d.add(S.capsule([16.2, 19, -2], [17.6, 17, -2], 0.6), PAL.pink, M.metal); // mug
  d.add(S.cyl(14, -2, 1.7, 20, 20.6), 0x5a3a1a, M.solid);
  // brass hologram projector + idea bulb machine
  d.add(S.cyl(0, -1, 5, 15, 18), 0xb8862a, M.metal);
  d.add(S.cyl(0, -1, 3.4, 18, 19), 0xffffff, M.glow);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; d.add(S.sphere([Math.cos(a) * 4.4, 17, -1 + Math.sin(a) * 4.4], 0.6), PAL.chrome, M.metal); }
  // chalk-holo board behind
  d.add(S.box([-23, 20, -11], [23, 58, -9], 1), (x, y) => (Math.min(x + 23, 23 - x, y - 20, 58 - y) < 2 ? PAL.woodDark : 0x1e3a2a), M.solid);
  // chalk doodles in voxels: a jelly alien, an arrow, "IDEA!", a jump arc
  const chalk = 0xe8f4e0;
  for (let a = 0; a < Math.PI * 2; a += 0.06) d.add(S.sphere([12 + Math.cos(a) * 5.4, 41 + Math.sin(a) * 5, -8.8], 0.45), chalk, M.solid);
  for (const sx of [-1, 1]) d.add(S.ellipsoid([12 + sx * 2.2, 41, -8.8], [1.3, 2, 0.4]), chalk, M.solid);
  for (const sx of [-1, 1]) d.add(S.capsule([12 + sx * 2.5, 45.6, -8.8], [12 + sx * 4.2, 50, -8.8], 0.4), chalk, M.solid);
  stampText(d, 'IDEA!', -21, 55, -8.8, 1, PAL.amber, M.solid, 0.5);
  for (let i = 0; i <= 30; i++) { const x = -20 + i * 0.75, y = 27 + Math.sin((i / 30) * Math.PI) * 10; d.add(S.sphere([x, y, -8.8], 0.45), chalk, M.solid); }
  d.add(S.box([-21, 25, -9], [-18, 28, -8.4]), PAL.pink, M.solid);
  d.add(S.box([-1, 25, -9], [2, 28, -8.4]), PAL.cyan, M.solid);
  const body = setGlow(mesh(d), glowMat(0xff9ae2, 1.6));
  g.add(body);
  // floating hologram brain (voxel, additive)
  const brain = new THREE.Group(); brain.position.set(0, 27 * U, -1 * U);
  const bg = grid([-7, -6, -6], [7, 6, 6], 2);
  bg.add(S.ellipsoid([-2.4, 0, 0], [4, 4.4, 5.2]), (x, y, z) => (Math.sin(x * 2 + Math.sin(z * 1.7) * 2) > 0.5 ? 0xffffff : 0xff9ae2), M.glow);
  bg.add(S.ellipsoid([2.4, 0, 0], [4, 4.4, 5.2]), (x, y, z) => (Math.sin(z * 2.2 + y * 1.6) > 0.5 ? 0xffffff : 0xff9ae2), M.glow);
  bg.carve(S.box([-0.25, -6, -6], [0.25, 6, 6]));
  const brainMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.3, 0.9, 1.4), transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const bm = mesh(bg, { castShadow: false }); bm.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.material = brainMat; });
  brain.add(bm);
  g.add(brain);
  const hit = hitBox(2.8, 3.6, 1.6); hit.position.z = -0.2; g.add(hit);
  const spots: Spot[] = [{ id: 'glorp', station: 'idea', pos: new THREE.Vector3(-6.2, 0, 3.15), face: 0, anim: 'present' }];
  return {
    id: 'idea', label: "Prof. Glorp's Idea Desk", panel: 'idea', group: g, pick: [hit, body], rect: [-7.6, 0.7, -4.8, 2.6], anchor: new THREE.Vector3(-6.2, 1.3, 2.6), spots,
    update(dt, t) {
      const glorp = crew.value.find((m) => m.id === 'glorp');
      const active = glorp && glorp.activity !== 'idle';
      brain.rotation.y += dt * (active ? 1.8 : 0.5);
      brain.position.y = 27 * U + Math.sin(t * 1.6) * 0.04;
      const k = active ? 1 + Math.sin(t * 8) * 0.25 : 0.75 + Math.sin(t * 1.5) * 0.1;
      brainMat.opacity = 0.55 * k + 0.2;
    },
  };
}

// ── THE GIANT FUEL TANK ──────────────────────────────────────────────────────
function fuelTank(fx: Particles): Station & { lamps: THREE.MeshBasicMaterial[] } {
  const g = new THREE.Group();
  g.position.set(9.2, 0, -5.6);
  const H = 84; // model units of tank interior (5.25 world)
  const R = 19;
  const t = grid([-26, 0, -26], [26, 104, 26], 1);
  // base plinth with hazard ring
  t.add(S.cyl(0, 0, 23, 0, 8), (x, y, z) => { const r = Math.hypot(x, z); if (y > 6.6) return PAL.hullHi; if (r > 21.6) return hazard(Math.atan2(z, x) * 10, y, 2); return plate(PAL.hullDark, Math.atan2(z, x) * 12, y, { pw: 8, ph: 8 }); }, M.metal);
  // top cap
  t.add(S.cyl(0, 0, 22, 8 + H, 8 + H + 8), (x, y, z) => (y < 8 + H + 1.4 ? PAL.hullHi : plate(PAL.hullDark, Math.atan2(z, x) * 12, y, { pw: 8, ph: 8 })), M.metal);
  t.add(S.cone(0, 0, 8 + H + 8, 8 + H + 14, 14, 6), PAL.steelDark, M.metal);
  // vertical struts with bolts
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = Math.cos(a) * (R + 2), z = Math.sin(a) * (R + 2);
    t.add(S.box([x - 1.4, 8, z - 1.4], [x + 1.4, 8 + H, z + 1.4], 0.4), (_x, y) => (Math.floor(y) % 12 < 1 ? PAL.chrome : PAL.steel), M.metal);
  }
  // marker rings at 50/25/10 with lamp housings (lamps are separate, animated)
  const markers = [0.5, 0.25, 0.1];
  for (const mk of markers) t.add(S.torus([0, 8 + H * mk, 0], [0, 1, 0], R + 1, 0.8), PAL.hazardY, M.metal);
  // glass
  t.add(S.cyl(0, 0, R, 8, 8 + H), PAL.glass, M.glass);
  t.carve(S.cyl(0, 0, R - 1, 8, 8 + H));
  // pipes into the wall + valve
  t.add(S.capsule([0, 100, -4], [0, 104, -26], 3), PAL.paintTeal, M.metal);
  t.add(S.capsule([-16, 4, -10], [-16, 4, -26], 2.4), PAL.paintTeal, M.metal);
  t.add(S.disc([-16, 4, -18], [0, 0, 1], 4, 0.8, 8), PAL.paintRed, M.metal);
  // FUEL sign plate on the cap
  t.add(S.box([-10, 8 + H + 1, R + 1.6], [10, 8 + H + 7, R + 2.4]), PAL.hullDeep, M.metal);
  stampText(t, 'FUEL', -textWidth('FUEL', 1) / 2, 8 + H + 6, R + 2.4, 1, 0xffffff, M.glow, 0.8);
  const shell = setGlow(mesh(t), glowMat(PAL.glob, 2));
  g.add(shell);

  // liquid: unit-height voxel column scaled by fuel level, plus a wavy surface disc
  const lg = grid([-18, 0, -18], [18, 16, 18], 1);
  lg.add(S.cyl(0, 0, R - 1.2, 0, 16), (x, y, z) => (Math.sin(y * 0.8 + Math.atan2(z, x) * 3) > 0.7 ? 0xc8ffb0 : 0x5fe060), M.glow);
  const liquidMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1, 1.3, 1), transparent: true, opacity: 0.72, toneMapped: false, depthWrite: false });
  const liquid = mesh(lg, { castShadow: false }); liquid.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.material = liquidMat; m.renderOrder = 1; } });
  liquid.position.y = 8 * U;
  g.add(liquid);
  const sg = grid([-18, -1, -18], [18, 1, 18], 1);
  sg.add(S.cyl(0, 0, R - 1.2, -0.5, 0.5), (x, _y, z) => ((Math.floor(x / 3) + Math.floor(z / 3)) % 2 ? 0xe8ffd8 : 0x9dff8a), M.glow);
  const surfMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.6, 1.8, 1.6), toneMapped: false, transparent: true, opacity: 0.9 });
  const surface = mesh(sg, { castShadow: false }); surface.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.material = surfMat; });
  g.add(surface);

  // lamps per marker (two per ring) + rotating beacons on top
  const lamps: THREE.MeshBasicMaterial[] = [];
  markers.forEach((mk) => {
    const mat = glowMat(PAL.glob, 2);
    lamps.push(mat);
    for (const a of [-0.5, 0.5]) {
      const lgm = grid([-2, -2, -2], [2, 2, 2], 3);
      lgm.add(S.sphere([0, 0, 0], 1.5), 0xffffff, M.glow);
      const lamp = mesh(lgm, { castShadow: false }); lamp.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.material = mat; });
      lamp.position.set(Math.sin(a) * (R + 2) * U, (8 + H * mk) * U, Math.cos(a) * (R + 2) * U);
      g.add(lamp);
    }
  });
  const beacons = new THREE.Group(); beacons.position.y = (8 + H + 14) * U; g.add(beacons);
  const beaconMat = glowMat(PAL.amber, 0.3);
  const bgd = grid([-4, 0, -4], [4, 6, 4], 2);
  bgd.add(S.cyl(0, 0, 2.6, 0, 1.4), PAL.steelDark, M.metal);
  bgd.add(S.cyl(0, 0, 2.2, 1.4, 5), 0xffffff, M.glow);
  const beaconObj = mesh(bgd, { castShadow: false }); beaconObj.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && m.userData.voxMat === M.glow) m.material = beaconMat; });
  beacons.add(beaconObj);
  const beam = new THREE.SpotLight(0xffa020, 0, 14, 0.35, 0.6, 1.2);
  beam.position.set(0, 0.25, 0); beam.target.position.set(4, -2, 0); beacons.add(beam, beam.target);

  const hit = hitBox(2.8, 6.8, 2.8); g.add(hit);
  let shown = fuel.value.level;
  let bubbleT = 0;
  return {
    id: 'tank', label: 'Fuel Tank', panel: 'fuel', group: g, pick: [hit, shell], rect: [7.8, -7.0, 10.6, -4.2],
    anchor: new THREE.Vector3(9.2, 2.6, -5.6), spots: [], lamps,
    update(dt, tt) {
      const f = fuel.value;
      shown += (f.level - shown) * Math.min(1, dt * 2);
      const lvl = Math.max(0.015, shown);
      const hgt = H * lvl;
      liquid.scale.y = hgt / 16;
      surface.position.y = (8 + hgt) * U + Math.sin(tt * 2) * 0.008;
      surface.rotation.y += dt * 0.2;
      const crit = f.tier === 'critical' || f.tier === 'empty';
      liquidMat.color.setRGB(crit ? 1.5 : f.tier === 'quarter' ? 1.5 : 1, crit ? 0.55 : f.tier === 'quarter' ? 1.1 : 1.3, crit ? 0.5 : 0.8);
      markers.forEach((mk, i) => {
        const below = f.level < mk;
        const k = below ? (Math.sin(tt * (crit ? 12 : 7)) > 0 ? 2.6 : 0.25) : 1.4;
        lamps[i].color.set(below ? (mk <= 0.1 ? PAL.red : PAL.amber) : PAL.glob).multiplyScalar(k);
      });
      const alarm = f.tier !== 'full' && f.tier !== 'half';
      beacons.rotation.y += dt * (alarm ? 6 : 0.6);
      beaconMat.color.set(crit ? PAL.red : PAL.amber).multiplyScalar(alarm ? 2.4 : 0.35);
      beam.intensity = alarm ? 40 : 0;
      beam.color.setHex(crit ? 0xff2a1a : 0xffa020);
      bubbleT -= dt;
      if (bubbleT <= 0) {
        bubbleT = 0.05 + (1 - lvl) * 0.2;
        const a = Math.random() * Math.PI * 2, r = Math.random() * (R - 4) * U;
        fx.emit({ tile: 'bubble', pos: [9.2 + Math.cos(a) * r, 8 * U + 0.05, -5.6 + Math.sin(a) * r], vel: [0, 0.9 + Math.random() * 0.6, 0], life: Math.max(0.2, (hgt * U) / 1.2), size: 0.05 + Math.random() * 0.05, color: '#d8ffd0', wobble: 0.3 });
      }
    },
  };
}

// ── GENE-O-MAT ───────────────────────────────────────────────────────────────
function vending(): Station {
  const g = new THREE.Group();
  g.position.set(11.15, 0, -1.4); g.rotation.y = -Math.PI / 2;
  const v = grid([-15, 0, -10], [15, 56, 12], 1.5);
  v.add(S.box([-14, 0, -9], [14, 52, 9], 1.6), (x, y) => (y < 2 ? PAL.hullDeep : Math.abs(x) > 12.4 ? PAL.pink : 0xd84aaf), M.solid);
  v.carve(S.box([-12, 18, 6], [5, 46, 10]));
  v.add(S.box([-12, 18, 6], [5, 46, 6.8]), 0x1a0f22, M.solid);
  // capsule rows (each a voxel gene capsule: two-tone with a glowing helix stripe)
  const caps = [PAL.glob, PAL.cyan, PAL.amber, PAL.violet, PAL.pink];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const x = -9.6 + c * 4.1, y = 21.5 + r * 6.4;
    v.add(S.box([x - 1.8, y - 2.4, 6.8], [x + 1.8, y - 2, 9]), PAL.chrome, M.metal);
    v.add(S.capsule([x, y - 0.6, 7.8], [x, y + 1.8, 7.8], 1.2), (px, py) => (py > y + 0.6 ? 0xf6f6f6 : caps[(r + c) % 5]), M.jelly);
    v.add(S.box([x - 0.25, y - 0.4, 8.8], [x + 0.25, y + 1.6, 9.1]), 0xffffff, M.glow);
  }
  v.add(S.box([-12.4, 17.6, 9], [5.4, 46.4, 9.6]), PAL.glass, M.glass);
  // keypad & coin slot panel
  v.add(S.box([6.5, 20, 6], [12.5, 44, 9.4], 0.4), PAL.hullDark, M.metal);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) v.add(S.box([7.4 + c * 1.8, 30 + r * 2.2, 9.4], [8.6 + c * 1.8, 31.4 + r * 2.2, 10]), (r + c) % 4 === 0 ? 0xffffff : 0x8a9aa4, (r + c) % 4 === 0 ? M.glow : M.metal);
  v.add(S.box([8.5, 24, 9.4], [10.5, 26.6, 9.8]), PAL.hazardK, M.solid);
  v.add(S.box([7, 40, 9.4], [12, 43, 9.8]), 0x2fd8ff, M.glow);
  v.add(S.box([-10, 5, 8], [8, 12, 9.6], 0.6), PAL.hullDeep, M.metal);                       // dispense tray
  // sign
  v.add(S.box([-14, 46.5, 7], [14, 55, 10], 1), 0x2a0f2a, M.solid);
  stampText(v, 'GENE-O-MAT', -textWidth('GENE-O-MAT', 0.95) / 2, 53.2, 10, 0.95, 0xffffff, M.glow, 0.6);
  const body = setGlow(mesh(v), glowMat(0xffc8f0, 1.8));
  g.add(body);
  const hit = hitBox(1.9, 3.5, 1.4); g.add(hit);
  return { id: 'vending', label: 'GENE-O-MAT', panel: 'shop', group: g, pick: [hit, body], rect: [10.3, -2.3, 11.8, -0.5], anchor: new THREE.Vector3(10.6, 1.7, -1.4), spots: [] };
}

// ── WARDROBE POD ─────────────────────────────────────────────────────────────
function wardrobe(): Station {
  const g = new THREE.Group();
  g.position.set(11.15, 0, 2.6); g.rotation.y = -Math.PI / 2;
  const w = grid([-16, 0, -10], [16, 60, 12], 1.5);
  w.add(smoothUnion2(w), (x, y, z) => (Math.abs(x) > 13.4 ? PAL.hullHi : y < 3 ? PAL.hullDeep : plate(0xd9d2bd, x + 16, y, { pw: 32, ph: 14, bolt: false })), M.metal);
  w.carve(S.box([-10, 6, 4], [10, 50, 12]));
  w.add(S.box([-10, 6, 3], [10, 50, 4]), 0x9ab4c4, M.gloss);                                     // mirror
  w.add(S.box([-9, 44, 3.9], [-2, 48, 4.1]), 0xe8f4ff, M.glow);                                   // mirror glint
  for (let i = 0; i < 20; i++) w.add(S.sphere([-11.4 + (i % 2) * 22.8, 8 + Math.floor(i / 2) * 4.4, 5], 0.8), 0xffffff, M.glow); // vanity bulbs
  // hat rack on top
  w.add(S.capsule([-12, 58, 0], [12, 58, 0], 0.6), PAL.chrome, M.metal);
  w.add(S.cone(-7, 0, 58, 64, 3.4, 0.6), 0x8a3fd8, M.solid);                                     // wizard hat
  w.add(S.cyl(0, 0, 2.6, 58, 61), 0x1a1a1a, M.solid); w.add(S.cyl(0, 0, 4, 58, 58.6), 0x1a1a1a, M.solid); // top hat
  w.add(S.ellipsoid([7, 59, 0], [3.4, 1.8, 3.4]), 0xf2b632, M.metal);                            // hard hat
  stampText(w, 'STYLE', -textWidth('STYLE', 0.8) / 2, 54.6, 8.6, 0.8, PAL.pink, M.glow, 0.6);
  const body = setGlow(mesh(w), glowMat(0xffe8c8, 1.7));
  g.add(body);
  const hit = hitBox(2, 3.8, 1.4); g.add(hit);
  return { id: 'wardrobe', label: 'Wardrobe Pod', panel: 'wardrobe', group: g, pick: [hit, body], rect: [10.3, 1.6, 11.8, 3.6], anchor: new THREE.Vector3(10.6, 1.7, 2.6), spots: [] };
}
function smoothUnion2(_g: unknown) { return S.box([-15, 0, -9], [15, 56, 9], 4); }

// ── FILE ARCHIVE ─────────────────────────────────────────────────────────────
function cabinet(): Station {
  const g = new THREE.Group();
  g.position.set(-11.2, 0, -3.6); g.rotation.y = Math.PI / 2;
  const c = grid([-10, 0, -8], [10, 60, 10], 1.5);
  c.add(S.box([-9.6, 0, -7], [9.6, 58, 7], 1), PAL.hullDark, M.metal);
  for (let r = 0; r < 6; r++) for (let k = 0; k < 2; k++) {
    const y = 3 + r * 9, x0 = -8.6 + k * 8.8;
    c.add(S.box([x0, y, 6], [x0 + 8.2, y + 8, 8], 0.5), (x, yy) => (yy > y + 6 && yy < y + 7.2 && Math.abs(x - x0 - 4.1) < 1.6 ? PAL.chrome : [0x4a6a8a, 0x6a8a4a, 0x8a6a4a][(r + k) % 3]), M.metal);
    c.add(S.box([x0 + 1, y + 2, 8], [x0 + 3, y + 3.4, 8.4]), [PAL.pink, PAL.cyan, PAL.amber, PAL.glob][(r * 2 + k) % 4], M.glow);
  }
  // overflowing folders on top
  for (let i = 0; i < 5; i++) c.add(S.box([-7 + i * 3, 58, -4 + (i % 2)], [-4.6 + i * 3, 64 - (i % 3), 3]), [0xefe2b8, 0xf6c8a0, 0xd8f0c8][i % 3], M.solid);
  const body = setGlow(mesh(c), glowMat(0xffffff, 1.6));
  g.add(body);
  const hit = hitBox(1.3, 4, 1.2); g.add(hit);
  const spots: Spot[] = [{ id: 'cabinet', station: 'cabinet', pos: new THREE.Vector3(-10.1, 0, -3.6), face: -Math.PI / 2, anim: 'carry' }];
  return { id: 'cabinet', label: 'File Archive', group: g, pick: [hit, body], rect: [-11.8, -4.2, -10.6, -3.0], anchor: new THREE.Vector3(-10.8, 1.3, -3.6), spots, panel: 'terminal' };
}

// ── RESEARCH: data shelves + deep-space scanner ──────────────────────────────
function research(): Station {
  const g = new THREE.Group();
  const s = grid([-10, 0, -20], [10, 64, 34], 1.5);
  // data shelves (world x -11.9..-10.7, z -0.4..2.0) → local, built facing +x via rotation later
  s.add(S.box([-9, 0, -4], [9, 56, 6]), PAL.hullDark, M.metal);
  for (let r = 0; r < 5; r++) {
    const y = 4 + r * 10.4;
    s.add(S.box([-8.4, y, -3], [8.4, y + 1, 6]), PAL.steel, M.metal);
    for (let i = 0; i < 8; i++) {
      const h = 5 + ((hash3(i, r, 9) * 4) | 0);
      const crystal = (i + r) % 3 === 0;
      if (crystal) s.add(S.capsule([-7 + i * 2, y + 1, 2], [-7 + i * 2, y + h, 2], 0.7), [PAL.cyan, PAL.violet, PAL.glob][(i + r) % 3], M.glow);
      else s.add(S.box([-7.8 + i * 2, y + 1, -1], [-6.4 + i * 2, y + 1 + h, 5]), [0x8a3a3a, 0x3a5a8a, 0x3a8a5a, 0x8a7a3a][(i * 3 + r) % 4], M.solid);
    }
  }
  // deep-space scanner on a tripod (world ≈ (-11.2, -1.7))
  const sc = new THREE.Group();
  const t = grid([-10, 0, -10], [10, 70, 10], 2);
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; t.add(S.capsule([Math.cos(a) * 8, 0, Math.sin(a) * 8], [0, 26, 0], 0.7), PAL.steelDark, M.metal); }
  t.add(S.sphere([0, 27, 0], 2.4), PAL.steel, M.metal);
  t.add(S.capsule([0, 28, 0], [6, 52, -2], 3.4, 4.2), (x, y) => (Math.floor(y) % 8 < 1 ? PAL.chrome : PAL.paintCream), M.metal);
  t.add(S.disc([6.4, 53.6, -2], [0.25, 1, -0.08], 4.4, 0.6), 0x2fd8ff, M.glow);
  t.add(S.capsule([-1, 30, 1], [-3, 26, 4], 0.9), PAL.hullDark, M.metal);                                  // eyepiece
  t.add(S.box([3, 16, 3], [9, 22, 5], 0.4), PAL.hullDeep, M.metal);                                         // readout box
  t.add(S.box([4, 17, 5], [8, 21, 5.4]), 0x0a2a1a, M.glow);
  const scope = setGlow(mesh(t), glowMat(PAL.cyan, 1.7));
  sc.add(scope);
  sc.position.set(-11.0, 0, -1.7);
  const shelves = setGlow(mesh(s), glowMat(0xd8fff8, 1.7));
  shelves.position.set(-11.3, 0, 0.8); shelves.rotation.y = Math.PI / 2;
  g.add(shelves, sc);
  const hit = hitBox(1.2, 3.6, 2.4); hit.position.set(-11.3, 0, 0.8); g.add(hit);
  const spots: Spot[] = [
    { id: 'books', station: 'research', pos: new THREE.Vector3(-10.0, 0, 0.8), face: -Math.PI / 2, anim: 'research' },
    { id: 'scope', station: 'research', pos: new THREE.Vector3(-9.9, 0, -1.7), face: -Math.PI / 2, anim: 'research' },
  ];
  return {
    id: 'research', label: 'Deep-Space Scanner', group: g, pick: [hit, scope, shelves], rect: [-11.9, -2.5, -10.6, 2.0], anchor: new THREE.Vector3(-10.8, 1.8, -0.4), spots,
    update(dt) { sc.rotation.y += dt * (anyDoing('research') ? 0.9 : 0.12); },
  };
}

// ── CLONING PODS ─────────────────────────────────────────────────────────────
function cloningVat(fx: Particles): Station & { spawnPoint: THREE.Vector3; flash(): void } {
  const g = new THREE.Group();
  g.position.set(-9.3, 0, -6.4);
  const v = grid([-20, 0, -16], [20, 72, 14], 1.5);
  const pod = (cx: number) => {
    v.add(S.cyl(cx, 0, 9, 0, 6), (x, y, z) => (y > 4.6 ? PAL.hullHi : hazard(Math.atan2(z, x - cx) * 8, y, 2)), M.metal);
    v.add(S.cyl(cx, 0, 9, 58, 66), (x, y, z) => plate(PAL.hullDark, Math.atan2(z, x - cx) * 10, y, { pw: 6, ph: 8 }), M.metal);
    v.add(S.cone(cx, 0, 66, 70, 6, 2), PAL.steelDark, M.metal);
    v.add(S.cyl(cx, 0, 8, 6, 58), PAL.glass, M.glass);
    v.carve(S.cyl(cx, 0, 7.2, 6, 58));
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; v.add(S.box([cx + Math.cos(a) * 8.6 - 0.8, 6, Math.sin(a) * 8.6 - 0.8], [cx + Math.cos(a) * 8.6 + 0.8, 58, Math.sin(a) * 8.6 + 0.8]), PAL.steel, M.metal); }
    v.add(S.cyl(cx, 0, 6.8, 6, 46), (x, y, z) => (Math.sin(y * 0.5 + Math.atan2(z, x - cx) * 2) > 0.85 ? 0xffffff : 0x7fe87a), M.glow);
  };
  pod(-9); pod(9);
  // control console between pods
  v.add(S.box([-4, 0, 2], [4, 22, 10], 0.8), PAL.hullDark, M.metal);
  v.add(S.box([-3.4, 16, 9.4], [3.4, 21, 10.2]), (x, y) => ((Math.floor(x) + Math.floor(y)) % 3 === 0 ? 0xffffff : 0x1a4a2a), M.glow);
  v.add(S.capsule([-2, 23, 6], [-2, 26, 7], 0.5), PAL.chrome, M.metal); v.add(S.sphere([-2, 26.6, 7], 1), PAL.red, M.jelly);
  stampText(v, 'CLONE', -textWidth('CLONE', 0.7) / 2, 13, 10, 0.7, PAL.glob, M.glow, 0.5);
  const liquidMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1, 1.25, 1), toneMapped: false, transparent: true, opacity: 0.6, depthWrite: false });
  const body = mesh(v);
  body.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && m.userData.voxMat === M.glow) { m.material = liquidMat; m.renderOrder = 1; } });
  g.add(body);
  // floating embryo-blobs inside each pod
  const blobs: THREE.Object3D[] = [];
  for (const cx of [-9, 9]) {
    const b = grid([-4, -4, -4], [4, 4, 4], 3);
    b.add(S.ellipsoid([0, 0, 0], [2.6, 3, 2.6]), 0x8cf56b, M.jelly);
    for (const sx of [-1, 1]) b.add(S.sphere([sx * 1, 0.6, 2.2], 0.8), 0x05070a, M.gloss);
    const bo = mesh(b); bo.position.set(cx * U, 28 * U, 0); g.add(bo); blobs.push(bo);
  }
  const light = new THREE.PointLight(0x8cf56b, 4, 6, 1.6); light.position.set(0, 2.2, 1.2); g.add(light);
  const hit = hitBox(2.4, 4.2, 1.8); g.add(hit);
  let flashT = 0;
  const spawnPoint = new THREE.Vector3(-9.3, 0, -4.7);
  return {
    id: 'vat', label: 'Cloning Pods', group: g, pick: [hit, body], rect: [-10.6, -7.6, -8.0, -5.4], anchor: new THREE.Vector3(-9.3, 1.9, -6.2),
    spots: [
      { id: 'vat0', station: 'vat', pos: new THREE.Vector3(-7.6, 0, -5.4), face: -Math.PI / 2 - 0.4, anim: 'vat' },
      { id: 'vat1', station: 'vat', pos: new THREE.Vector3(-9.3, 0, -4.6), face: Math.PI, anim: 'vat' },
    ],
    spawnPoint,
    flash() {
      flashT = 1;
      fx.emit({ tile: 'ring', pos: [spawnPoint.x, 0.6, spawnPoint.z], count: 3, life: 0.6, size: 0.5, grow: 4, color: '#8cf56b', additive: true });
      fx.emit({ tile: ['sparkle', 'star', 'glob'], pos: [spawnPoint.x, 0.8, spawnPoint.z], count: 30, vel: [0, 1.6, 0], spread: [2, 1.4, 2], drag: 1.5, life: [0.6, 1.2], size: [0.06, 0.12], color: ['#8cf56b', '#c8ffb0', '#52f2ff'], additive: true });
    },
    update(dt, t) {
      flashT = Math.max(0, flashT - dt * 1.5);
      light.intensity = 4 + Math.sin(t * 2.3) * 0.8 + flashT * 24;
      liquidMat.color.setRGB(1 + flashT, 1.25 + flashT, 1 + flashT);
      blobs.forEach((b, i) => { b.position.y = 28 * U + Math.sin(t * 1.3 + i * 2) * 0.12; b.rotation.y = Math.sin(t * 0.7 + i) * 0.8; });
      if (Math.random() < dt * 6) fx.emit({ tile: 'bubble', pos: [-9.3 + (Math.random() < 0.5 ? -9 : 9) * U + (Math.random() - 0.5) * 0.6, 0.5, -6.4 + (Math.random() - 0.5) * 0.6], vel: [0, 0.8, 0], life: 2.2, size: 0.05, color: '#e8ffe0', wobble: 0.2 });
    },
  };
}

// ── HOLO-PLANNER (was the whiteboard) ────────────────────────────────────────
function whiteboard(): Station {
  const g = new THREE.Group();
  g.position.set(5.4, 0, -7.6);
  const b = grid([-26, 0, -4], [26, 62, 4], 1.5);
  b.add(S.box([-24, 18, -3], [24, 56, 0], 1), (x, y) => (Math.min(x + 24, 24 - x, y - 18, 56 - y) < 2.2 ? PAL.hullHi : 0x132028), M.metal);
  for (const sx of [-1, 1]) b.add(S.box([sx * 20 - 1, 0, -3], [sx * 20 + 1, 18, -1]), PAL.steelDark, M.metal);
  // voxel sticky notes
  const notes: [number, number, number][] = [[-19, 49, PAL.amber], [-12, 49, PAL.pink], [-5, 49, PAL.cyan], [-19, 41, PAL.glob], [-12, 41, PAL.amber], [-19, 33, PAL.pink]];
  for (const [x, y, c] of notes) { b.add(S.box([x, y - 5, 0], [x + 6, y + 1, 0.6]), c, M.solid); for (let i = 0; i < 3; i++) b.add(S.box([x + 1, y - 1 - i * 1.4, 0.6], [x + 5 - i, y - 0.6 - i * 1.4, 0.8]), shade(c, 0.5), M.solid); }
  stampText(b, 'PLAN', 6, 54.4, 0, 0.9, PAL.cyan, M.glow, 0.5);
  b.add(S.box([4, 22, 0], [22, 23, 0.4]), PAL.hullHi, M.metal);
  const body = setGlow(mesh(b), glowMat(0xd8fbff, 1.8));
  g.add(body);
  // holo task bars (driven by project tasks)
  const bars = new VoxBars(1, 1, 1, PAL.cyan, 1.8);
  void bars;
  const rows: THREE.Mesh[] = [];
  const rowMat = [glowMat(PAL.glob, 1.6), glowMat(PAL.amber, 1.6), glowMat(0x3a4a52, 1)];
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2 * U, 0.6 * U), rowMat[2]); m.position.set(13 * U, (48 - i * 4) * U, 0.4 * U); g.add(m); rows.push(m); }
  const hit = hitBox(3, 2.6, 0.5, 2.3); g.add(hit);
  let acc = 0;
  return {
    id: 'whiteboard', label: 'Holo-Planner', group: g, pick: [hit, body], rect: [3.9, -7.9, 6.9, -7.1], anchor: new THREE.Vector3(5.4, 2.2, -7), spots: [{ id: 'wb', station: 'whiteboard', pos: new THREE.Vector3(5.0, 0, -6.4), face: Math.PI, anim: 'scribble' }],
    update(dt) {
      acc += dt; if (acc < 0.3) return; acc = 0;
      const tasks = projects.value.find((p) => p.id === activeProjectId.value)?.tasks ?? projects.value[0]?.tasks ?? [];
      rows.forEach((m, i) => {
        const tk = tasks[i];
        const w = tk ? 6 + (tk.title.length % 10) : 4 + i;
        m.scale.x = w * U; m.position.x = (5 + w / 2) * U;
        m.material = tk ? (tk.status === 'done' ? rowMat[0] : tk.status === 'doing' ? rowMat[1] : rowMat[2]) : rowMat[2];
        m.visible = !!tk || i < 3;
      });
    },
  };
}

// ── WORKBENCH ────────────────────────────────────────────────────────────────
function workbench(fx: Particles): Station & { zap(): void } {
  const g = new THREE.Group();
  g.position.set(5.8, 0, 1.5);
  const w = grid([-24, 0, -11], [24, 40, 11], 1.5);
  w.add(S.box([-22, 13, -9], [22, 16, 9], 0.6), (x, _y, z) => plate(0x6a5a4a, x + 22, z + 9, { pw: 11, ph: 18, bolt: false }), M.solid);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) w.add(S.box([sx * 20 - 1.4, 0, sz * 7 - 1.4], [sx * 20 + 1.4, 13, sz * 7 + 1.4]), PAL.steelDark, M.metal);
  w.add(S.box([-20, 4, -8], [20, 5.4, 8]), PAL.steelDark, M.metal);
  w.add(S.box([-18, 5.4, -6], [-6, 11, 6], 0.6), PAL.paintRed, M.metal);                          // tool chest
  for (let i = 0; i < 3; i++) w.add(S.box([-17.4, 6 + i * 1.8, 6], [-6.6, 7.4 + i * 1.8, 6.4]), PAL.chrome, M.metal);
  // half-built robot buddy on the bench
  w.add(S.box([-6, 16, -3], [2, 24, 3], 1), PAL.steel, M.metal);
  w.add(S.sphere([-2, 27, 0], 3.4), PAL.steelDark, M.metal);
  for (const sx of [-1, 1]) w.add(S.sphere([-2 + sx * 1.3, 27.6, 3], 0.8), 0xffffff, M.glow);
  w.add(S.capsule([2, 22, 0], [5, 19, 1], 0.7), PAL.cable, M.solid);
  // sparking machine (the "whack" target)
  w.add(S.box([10, 16, -6], [20, 26, 5], 1), (x, y) => (y > 24 ? hazard(x, y, 2) : PAL.paintTeal), M.metal);
  w.add(S.box([12, 18, 5], [18, 23, 5.6]), 0x0a2a1a, M.glow);
  w.add(S.capsule([15, 26, 0], [15, 31, 0], 0.5), PAL.chrome, M.metal); w.add(S.sphere([15, 31.6, 0], 1.1), PAL.amber, M.glow);
  // vise
  w.add(S.box([4, 16, 3], [8, 19, 7]), PAL.steel, M.metal);
  const body = setGlow(mesh(w), glowMat(0xffe8b0, 1.6));
  g.add(body);
  const hit = hitBox(2.8, 2, 1.2); g.add(hit);
  return {
    id: 'workbench', label: 'Workbench', group: g, pick: [hit, body], rect: [4.4, 0.9, 7.2, 2.1], anchor: new THREE.Vector3(5.8, 1.2, 1.5),
    spots: [
      { id: 'wb0', station: 'workbench', pos: new THREE.Vector3(5.0, 0, 0.45), face: 0, anim: 'hammer' },
      { id: 'wb1', station: 'workbench', pos: new THREE.Vector3(6.7, 0, 0.45), face: 0, anim: 'whack' },
    ],
    zap() { fx.sparks(new THREE.Vector3(6.75, 1.3, 1.45), 14); },
  };
}

export function buildStations(fx: Particles) {
  const vat = cloningVat(fx), bench = workbench(fx), tank = fuelTank(fx);
  const list: Station[] = [computer(), ideaDesk(), tank, vending(), wardrobe(), cabinet(), research(), vat, whiteboard(), bench];
  return { list, vat, bench, tank, byId: new Map(list.map((s) => [s.id, s])), faceToward };
}
void vgrad; void economy;
