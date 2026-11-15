// The GLOB LABS mothership lab deck: a cutaway diorama of a ship interior — instanced deck
// tiles, ribbed hull walls, a huge viewport onto space (voxel stars, nebula, a ringed gas
// giant, drifting asteroids), reactor core, airlock, hydroponics, robotic arm, ceiling
// beams with lamps, and the big GLOB LABS sign. Everything is voxel.
import * as THREE from 'three';
import { M, S } from '../vox/core';
import { PAL, U, grid, mesh, hazard, instance, at, glowMat } from '../vox/props/kit';
import { T } from '../vox/tex';
import {
  floorTile, wallPanel, rib, backLower, windowBay, upperTrim, ceilingBeam, hangingLamp, reactor, airlock, roboticArm,
  hydroponics, bigSign, planet, asteroid, starfield, type TileKind, type WallKind,
} from '../vox/props/ship';

export const ROOM = { x0: -12, x1: 12, z0: -8, z1: 8, wallH: 6.4 };

export interface EnvHandles {
  group: THREE.Group;
  update(dt: number, t: number): void;
  steamVents: THREE.Vector3[];
  lamps: THREE.PointLight[];
  hemi: THREE.HemisphereLight;
  arm: THREE.Object3D;
  ufoLane: { y: number; z: number };
}

export function buildEnvironment(scene: THREE.Scene, quality: 'low' | 'medium' | 'high'): EnvHandles {
  const group = new THREE.Group(); group.name = 'ship';
  scene.add(group);

  // ── floor: 12 × 8 tiles of 2×2 ─────────────────────────────────────────────
  const kindAt = (ix: number, iz: number): TileKind => {
    const x = ROOM.x0 + ix * 2, z = ROOM.z0 + iz * 2;
    if (x <= -10 && z <= -6) return 'hazard';                      // reactor corner
    if (z === 4) return 'lightline';                                 // the glowing walkway
    if ((x === -4 || x === 2) && (z === -2 || z === 0)) return 'grate';
    if (x >= 8 && z <= -6) return 'stripe';                         // under the tank
    if (x >= 10 && z >= 4) return 'stripe';                         // airlock apron
    return 'plate';
  };
  const byKind = new Map<TileKind, THREE.Matrix4[]>();
  for (let ix = 0; ix < 12; ix++) for (let iz = 0; iz < 8; iz++) {
    const k = kindAt(ix, iz);
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k)!.push(at(ROOM.x0 + ix * 2, 0, ROOM.z0 + iz * 2));
  }
  const floorGlowMats: THREE.Material[] = [];
  for (const [k, ms] of byKind) {
    const proto = floorTile(k);
    proto.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && m.name === 'floorGlow') floorGlowMats.push(m.material as THREE.Material); });
    group.add(instance(proto, ms, { receiveShadow: true }));
  }

  // front cutaway edge of the deck slab (diorama look) with conduits in the cross-section
  {
    const g = grid([0, -16, -2], [384, 1, 2], 1);
    g.tex(T.worn).add(S.box([0, -14, -2], [384, 0, 1]), (x, y) => (y > -2 ? hazard(x, y, 3) : y < -13 ? PAL.hullDeep : PAL.hullDark), M.metal);
    g.tex(T.pipe);
    g.tex(T.hull);
    for (let x = 8; x < 384; x += 32) { g.tex(0).add(S.box([x, -9, 1], [x + 2, -7, 1.6]), 0xffffff, M.glow); g.tex(T.hull); }
    for (const [y, c] of [[-4, PAL.paintTeal], [-8.5, PAL.paintRed], [-12, PAL.steel]] as [number, number][]) g.add(S.capsule([0, y, 1.2], [384, y, 1.2], 1.1), c, M.metal);
    const edge = mesh(g, { castShadow: false });
    edge.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && m.userData.voxMat === M.glow) { m.material = glowMat(PAL.amber, 2.2); } });
    edge.position.set(ROOM.x0, 0, ROOM.z1);
    group.add(edge);
  }

  // ── side walls (x = ±12): 8 panels per side + ribs ────────────────────────────
  const leftKinds: WallKind[] = ['pipes', 'plain', 'screen', 'plain', 'vent', 'porthole', 'plain', 'plain'];
  const rightKinds: WallKind[] = ['plain', 'pipes', 'plain', 'locker', 'plain', 'sign', 'plain', 'plain'];
  const wallSets = new Map<string, THREE.Matrix4[]>();
  const addWall = (k: WallKind, m: THREE.Matrix4, seed: number) => { const key = k + ':' + (k === 'screen' ? seed : 0); if (!wallSets.has(key)) wallSets.set(key, []); wallSets.get(key)!.push(m); };
  for (let i = 0; i < 8; i++) {
    const z0 = ROOM.z0 + i * 2;
    addWall(leftKinds[i], at(ROOM.x0, 0, z0 + 2, Math.PI / 2), i);          // left wall faces +x
    addWall(rightKinds[i], at(ROOM.x1, 0, z0, -Math.PI / 2), i);             // right wall faces -x
  }
  // back wall beside the window (x −12..−8 and 8..12)
  addWall('pipes', at(-12, 0, ROOM.z0), 10); addWall('screen', at(-10, 0, ROOM.z0), 11);
  addWall('screen', at(8, 0, ROOM.z0), 12); addWall('plain', at(10, 0, ROOM.z0), 13);
  for (const [key, ms] of wallSets) { const [k, seed] = key.split(':'); group.add(instance(wallPanel(k as WallKind, +seed), ms)); }
  const ribM: THREE.Matrix4[] = [];
  for (let i = 0; i <= 8; i++) { const z = ROOM.z0 + i * 2; ribM.push(at(ROOM.x0 + 0.02, 0, z, Math.PI / 2), at(ROOM.x1 - 0.02, 0, z, -Math.PI / 2)); }
  for (const x of [-8, -4, 0, 4, 8]) ribM.push(at(x, 0, ROOM.z0 + 0.02));
  const ribs = rib();
  const ribLightMats: THREE.Material[] = [];
  ribs.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && m.name === 'ribLight') ribLightMats.push(m.material as THREE.Material); });
  group.add(instance(ribs, ribM));

  // ── back wall: lower modules, window bays, upper trim ─────────────────────────
  const lowerKinds: ('plain' | 'vent' | 'conduit')[] = ['conduit', 'plain', 'vent', 'plain', 'plain', 'vent', 'plain', 'conduit'];
  const lowerSets = new Map<string, THREE.Matrix4[]>();
  lowerKinds.forEach((k, i) => { if (!lowerSets.has(k)) lowerSets.set(k, []); lowerSets.get(k)!.push(at(-8 + i * 2, 0, ROOM.z0)); });
  for (const [k, ms] of lowerSets) group.add(instance(backLower(k as any), ms));
  const bays: THREE.Matrix4[] = [];
  for (let i = 0; i < 4; i++) bays.push(at(-8 + i * 4, 36 * U, ROOM.z0));
  group.add(instance(windowBay(), bays));
  const trims: THREE.Matrix4[] = [];
  for (let i = 0; i < 12; i++) trims.push(at(-12 + i * 2, 88 * U, ROOM.z0));
  group.add(instance(upperTrim(), trims));
  // faint reflective glass in the viewport
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(16, 3.25), new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.07, roughness: 0.02, metalness: 0, clearcoat: 1, depthWrite: false }));
  glass.position.set(0, 36 * U + 1.625, ROOM.z0 - 0.06);
  glass.renderOrder = 2;
  group.add(glass);

  const sign = bigSign();
  sign.position.set(0, 5.28, ROOM.z0 + 0.32);
  group.add(sign);

  // ── ceiling beams + hanging lamps ─────────────────────────────────────────────
  // one structural beam just inside the viewport carries the lamps; the rest of the deck is
  // lit by recessed floods we never see (keeps the cutaway view open to space)
  group.add(instance(ceilingBeam(24), [at(ROOM.x0, ROOM.wallH + 0.6, -6.9)]));
  const lampSpots: [number, number][] = [[-5.5, -6.9], [5.5, -6.9]];
  group.add(instance(hangingLamp(), lampSpots.map(([x, z]) => at(x, ROOM.wallH + 0.4, z))));
  const lamps: THREE.PointLight[] = [];
  for (const [x, y, z, i] of [[-5.5, 5.4, -6.6, 6], [5.5, 5.4, -6.6, 6], [-5, 5.2, 1.8, 7], [4, 5.2, 2.2, 7]] as [number, number, number, number][]) {
    const l = new THREE.PointLight(0xffd29a, i, 11, 1.3);
    l.position.set(x, y, z);
    group.add(l); lamps.push(l);
  }

  // ── set pieces ────────────────────────────────────────────────────────────────
  const core = reactor();
  core.position.set(-11.2, 0, -7.2); core.scale.setScalar(0.85);
  group.add(core);
  const coreRings = core.getObjectByName('rings')!;
  const coreMat = (core.getObjectByName('core')!.children[0] as THREE.Mesh)?.material as THREE.MeshBasicMaterial | undefined;
  const coreLight = new THREE.PointLight(0x9ff0a0, 2, 4.5, 1.8); coreLight.position.set(-10.6, 3, -6.6); group.add(coreLight);

  const lock = airlock();
  lock.position.set(ROOM.x1 - 0.1, 0, 5.6); lock.rotation.y = -Math.PI / 2;
  group.add(lock);
  const lockWheel = lock.getObjectByName('wheel')!;

  const hydro = hydroponics();
  hydro.position.set(ROOM.x0 + 0.1, 0, 6); hydro.rotation.y = Math.PI / 2;
  group.add(hydro);
  const hydroLight = new THREE.PointLight(0xe8d0ff, 1.4, 4, 1.8); hydroLight.position.set(-10.8, 2.6, 6); group.add(hydroLight);

  const arm = roboticArm();
  arm.position.set(4.5, ROOM.wallH + 0.15, 2.6);
  group.add(arm);
  {
    // gantry rail cantilevered from the right wall, with a wall bracket and hazard caps
    const rail = grid([0, -4, -3], [104, 4, 3], 1);
    rail.add(S.box([0, -2, -2], [104, 2, 2]), (x) => (x < 4 ? hazard(x, 0, 2) : Math.floor(x) % 8 < 1 ? PAL.hullDeep : PAL.steelDark), M.metal);
    rail.add(S.box([96, -4, -3], [104, 4, 3], 0.8), PAL.hullHi, M.metal);
    for (let x = 8; x < 96; x += 16) rail.add(S.box([x, 2, -1], [x + 2, 3, 1]), 0xffffff, M.glow);
    const r = mesh(rail, { castShadow: false }); r.position.set(4.2, ROOM.wallH + 0.25, 2.6); r.scale.x = 7.7 / 6.5; group.add(r);
  }
  // painted deck emblem: a jelly alien head in a ring, centre of the room
  {
    const e = grid([-48, -0.5, -48], [48, 1, 48], 1);
    e.tex(T.worn);
    e.add(S.cyl(0, 0, 46, 0, 0.5), (x, _y, z) => {
      const r = Math.hypot(x, z);
      if (r > 42) return Math.floor(Math.atan2(z, x) * 12 / Math.PI) % 2 ? PAL.paintTeal : PAL.paintTealDark;
      if (r > 39) return 0x2a3a40;
      const hx = x, hz = z + 2, head = (hx / 20) ** 2 + (hz / 19) ** 2;
      if (head < 1) {
        for (const sx of [-1, 1]) { const ex = x - sx * 8.5, ez = z + 2; const c = Math.cos(sx * 0.5), sn = Math.sin(sx * 0.5); const u = (ex * c - ez * sn) / 6, v = (ex * sn + ez * c) / 9.5; if (u * u + v * v < 1) return 0x101418; }
        return head > 0.86 ? 0x3a8a5a : 0x5fb87a;
      }
      return 0x2a3a40;
    }, M.solid);
    e.carve(S.cyl(0, 0, 38.9, -1, 2));
    e.add(S.torus([0, 0.2, 0], [0, 1, 0], 40.5, 0.6), PAL.paintTeal, M.solid);
    e.add(S.ellipsoid([0, 0.2, -2], [20, 0.5, 19]), (x, _y, z) => { for (const sx of [-1, 1]) { const ex = x - sx * 8.5, ez = z + 2; const c = Math.cos(sx * 0.5), sn = Math.sin(sx * 0.5); const u = (ex * c - ez * sn) / 6, v = (ex * sn + ez * c) / 9.5; if (u * u + v * v < 1) return 0x101418; } const h = (x / 20) ** 2 + ((z + 2) / 19) ** 2; return h > 0.86 ? 0x3a8a5a : 0x5fb87a; }, M.solid);
    const em = mesh(e, { castShadow: false, ao: 0 });
    em.position.set(0, 0.005, 1.4);
    group.add(em);
  }

  // small practical colour spill only next to its real source (screens, a lightbox) — no room washes
  const spill = (c: number, i: number, x: number, y: number, z: number, d = 3.2) => { const l = new THREE.PointLight(c, i, d, 2); l.position.set(x, y, z); group.add(l); return l; };
  spill(0x9fe8c0, 1.4, 1.2, 1.9, -6.2);        // console screens
  spill(0xffc8e8, 1.0, 10.4, 2.6, -1.4);       // GENE-O-MAT lightbox
  // a warm spot on the painted sign
  const signSpot = new THREE.SpotLight(0xffe0b0, 26, 9, 0.55, 0.5, 1.4);
  signSpot.position.set(0, 7.2, -5.6); signSpot.target.position.set(0, 5.4, -7.9);
  group.add(signSpot, signSpot.target);

  // ── space ─────────────────────────────────────────────────────────────────────
  const space = new THREE.Group(); space.name = 'space';
  space.add(starfield(quality === 'low' ? 700 : 1600));
  const gas = planet(); gas.scale.setScalar(4.2); gas.position.set(9, -3.5, -52); space.add(gas);
  const moon = planet(); moon.scale.setScalar(0.9); moon.position.set(-14, 1.5, -46); space.add(moon);
  const rocks: { o: THREE.Object3D; v: THREE.Vector3; spin: THREE.Vector3 }[] = [];
  for (let i = 0; i < (quality === 'low' ? 3 : 6); i++) {
    const o = asteroid(i + 3); o.scale.setScalar(1.6 + (i % 3) * 0.8);
    o.position.set(-30 + i * 11, -6 + (i % 3) * 3.5, -26 - (i % 4) * 6);
    space.add(o);
    rocks.push({ o, v: new THREE.Vector3(0.35 + (i % 3) * 0.15, (i % 2 ? 0.04 : -0.03), 0), spin: new THREE.Vector3(0.1 + i * 0.03, 0.2, 0.07 * i) });
  }
  group.add(space);

  // ── lights ────────────────────────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xb8c8e0, 0x2a2420, 0.7);
  group.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0dc, 1.15);
  key.position.set(-8, 14, 12); key.target.position.set(0, 0, -1);
  key.castShadow = quality === 'high';
  if (key.castShadow) {
    key.shadow.mapSize.set(2048, 2048);
    const c = key.shadow.camera as THREE.OrthographicCamera; c.left = -15; c.right = 15; c.top = 12; c.bottom = -12; c.near = 1; c.far = 50;
    key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
  }
  group.add(key, key.target);
  const spaceLight = new THREE.DirectionalLight(0x9fc8ff, 0.8);
  spaceLight.position.set(4, 4, -20); spaceLight.target.position.set(0, 0, 4);
  group.add(spaceLight, spaceLight.target);

  const steamVents = [new THREE.Vector3(-3, 0.05, -1), new THREE.Vector3(3, 0.05, 1), new THREE.Vector3(ROOM.x0 + 0.5, 1.2, -6.5), new THREE.Vector3(ROOM.x1 - 0.5, 1.4, -5.2)];

  let armT = 0;
  return {
    group, steamVents, lamps, hemi, arm, ufoLane: { y: 1, z: -30 },
    update(dt, t) {
      coreRings.children.forEach((r, i) => { r.position.y = (24 + i * 24) * U + Math.sin(t * 1.6 + i * 1.3) * 0.12; r.rotation.y += dt * (0.4 + i * 0.2); });
      if (coreMat) { const k = 1.0 + Math.sin(t * 2.2) * 0.12; coreMat.color.setRGB(0.55 * k, 1.0 * k, 0.45 * k); }
      coreLight.intensity = 2 + Math.sin(t * 2.2) * 0.4;
      lockWheel.rotation.z = Math.sin(t * 0.15) * 0.4;
      { const k = 1.0 + Math.sin(t * 1.4) * 0.08; for (const m of floorGlowMats) (m as THREE.MeshBasicMaterial).color.setRGB(1.0 * k, 0.75 * k, 0.24 * k); }
      // robotic arm idles over the workbench, faster when the crew builds
      armT += dt;
      const upper = arm.getObjectByName('upper'), lower = arm.getObjectByName('lower'), hand = arm.getObjectByName('hand');
      arm.rotation.y = Math.PI + Math.sin(armT * 0.35) * 0.45;
      if (upper) upper.rotation.x = 0.55 + Math.sin(armT * 0.6) * 0.25;
      if (lower) lower.rotation.x = -1.1 + Math.sin(armT * 0.9 + 1) * 0.3;
      if (hand) hand.rotation.y = armT * 1.2;
      // space drift
      gas.rotation.y += dt * 0.02;
      for (const r of rocks) {
        r.o.position.addScaledVector(r.v, dt);
        r.o.rotation.x += r.spin.x * dt; r.o.rotation.y += r.spin.y * dt; r.o.rotation.z += r.spin.z * dt;
        if (r.o.position.x > 34) r.o.position.x = -34;
      }
    },
  };
}
