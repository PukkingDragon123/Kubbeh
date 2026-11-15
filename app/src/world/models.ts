// HQ furniture behaviours: wraps the voxel item models (src/vox/props/items.ts) with the
// little lives they lead — chomping, staring, swaying, spinning, blinking, buzzing.
import * as THREE from 'three';
import type { PanelId } from '../core/types';
import { buildItemModel, ITEM_META } from '../vox/props/items';
import type { Particles } from './particles';
import type { Anim } from './stations';

export interface ModelCtx { fx: Particles; pointer: THREE.Vector3 | null; busy: number; thinking: boolean; sfx: (name: any, vol?: number) => void }
export interface PlacedModel {
  group: THREE.Group;
  w: number; d: number;
  walkable?: boolean;
  hang?: { x: number; z: number; face: number; anim: Anim }[];
  panel?: PanelId;
  update?(dt: number, t: number, ctx: ModelCtx, world: THREE.Vector3): void;
  click?(ctx: ModelCtx, world: THREE.Vector3): void;
  light?: THREE.PointLight;
}

type Behaviour = (o: THREE.Object3D) => Pick<PlacedModel, 'update' | 'click'>;

const get = (o: THREE.Object3D, n: string) => o.getObjectByName(n);
/** make every glow material under `o` its own copy and return them */
const ownGlow = (o: THREE.Object3D | undefined) => {
  const out: THREE.MeshBasicMaterial[] = [];
  o?.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && (m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial && !m.userData.outline) { m.material = (m.material as THREE.Material).clone(); out.push(m.material as THREE.MeshBasicMaterial); } });
  return out;
};

/** neon buzz: occasional flicker on every glow material */
function flicker(o: THREE.Object3D, rate: number): Pick<PlacedModel, 'update' | 'click'> {
  const mats = ownGlow(o); const base = mats.map((m) => m.color.clone());
  return { update(_dt, t) { const f = Math.sin(t * rate) > 0.97 ? 0.35 : 1; mats.forEach((m, i) => m.color.copy(base[i]).multiplyScalar(f)); } };
}

const B: Record<string, Behaviour> = {
  chomper: (o) => {
    const head = get(o, 'head')!, jaw = get(o, 'jaw')!;
    let chompT = 0;
    const chomp = (ctx: ModelCtx, w: THREE.Vector3) => { chompT = 0.4; ctx.sfx('chomp', 0.5); ctx.fx.emit({ tile: 'drop', pos: [w.x, 1.2, w.z + 0.2], count: 5, vel: [0, 1.2, 0.8], spread: [0.8, 0.6, 0.6], gravity: 6, life: 0.6, size: 0.05, color: '#8cf56b' }); };
    return {
      update(dt, t, ctx, w) {
        const near = ctx.pointer ? ctx.pointer.distanceTo(w) < 1.6 : false;
        head.rotation.y = near && ctx.pointer ? Math.atan2(ctx.pointer.x - w.x, ctx.pointer.z - w.z) : Math.sin(t * 0.6) * 0.7;
        head.rotation.z = Math.sin(t * 1.3) * 0.12;
        chompT = Math.max(0, chompT - dt);
        const open = chompT > 0 ? Math.abs(Math.sin(chompT * 22)) * 0.8 : near ? 0.35 + Math.sin(t * 9) * 0.25 : 0.12 + Math.max(0, Math.sin(t * 0.8)) * 0.2;
        jaw.rotation.x = open;
        if (near && Math.random() < dt * 0.6) chomp(ctx, w);
      },
      click: chomp,
    };
  },
  eyeplant: (o) => {
    const eye = get(o, 'eye')!, lid = get(o, 'lid')!;
    let blinkT = 2;
    return {
      update(dt, t, ctx, w) {
        const target = ctx.pointer ?? new THREE.Vector3(0, 9, 20);
        const dx = target.x - w.x, dz = target.z - w.z, dy = target.y - 1.2;
        eye.rotation.y = Math.atan2(dx, dz); eye.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz)) * 0.5;
        lid.rotation.copy(eye.rotation);
        blinkT -= dt; if (blinkT < -0.15) blinkT = 2 + Math.random() * 3;
        lid.scale.y = blinkT < 0 ? 1 : 0.2;
        lid.visible = blinkT < 0.02;
        o.rotation.z = Math.sin(t * 0.9) * 0.03;
      },
      click(ctx) { blinkT = -0.15; ctx.sfx('blip', 0.5); },
    };
  },
  tentacle_fern: (o) => {
    const ts = [0, 1, 2, 3, 4, 5].map((i) => get(o, 'tentacle' + i)!);
    return { update(_dt, t, ctx) { ts.forEach((tt, i) => { const k = ctx.busy ? 1.6 : 1; tt.rotation.x = Math.sin(t * 1.6 * k + i) * 0.22; tt.rotation.z = Math.cos(t * 1.3 * k + i * 1.7) * 0.22; }); }, click(ctx, w) { ctx.sfx('slime', 0.4); ctx.fx.emit({ tile: 'heart', pos: [w.x, 1.4, w.z], count: 3, vel: [0, 1, 0], spread: [0.6, 0.3, 0.6], life: 1, size: 0.1, color: '#ff8ad8', additive: true }); } };
  },
  tesla: (o) => {
    const top = get(o, 'top')!; const mats = ownGlow(top);
    return {
      update(dt, t, ctx, w) {
        top.rotation.y += dt * (ctx.thinking ? 4 : 0.8);
        const k = ctx.thinking ? 2 + Math.random() * 1.5 : 1.6 + Math.sin(t * 3) * 0.3;
        for (const m of mats) m.color.setRGB(0.7 * k, 0.55 * k, k);
        if (Math.random() < dt * (ctx.thinking ? 14 : 2)) ctx.fx.emit({ tile: ['bolt', 'spark'], pos: [w.x, 2.1, w.z], count: 2, spread: [1.6, 1.2, 1.6], life: [0.08, 0.2], size: [0.06, 0.1], color: ['#b48cff', '#ffffff', '#52f2ff'], additive: true });
      },
      click(ctx, w) { ctx.fx.sparks(new THREE.Vector3(w.x, 2.1, w.z), 18); ctx.sfx('zap', 0.5); },
    };
  },
  cactus: () => ({ click(ctx, w) { ctx.fx.sparks(new THREE.Vector3(w.x, 1.1, w.z), 10); ctx.sfx('zap', 0.4); } }),
  brain_tank: (o) => {
    const brain = get(o, 'brain')!;
    return { update(dt, t, ctx, w) { brain.position.y = 14 / 16 + Math.sin(t * 1.2) * 0.08; brain.rotation.y = Math.sin(t * 0.5) * 0.5; if (Math.random() < dt * 4) ctx.fx.emit({ tile: 'bubble', pos: [w.x + (Math.random() - 0.5) * 0.4, 0.4, w.z + (Math.random() - 0.5) * 0.4], vel: [0, 0.6, 0], life: 1.6, size: 0.04, color: '#d8ffe0' }); } };
  },
  teleporter: (o) => {
    const ring = get(o, 'ring')!; const mats = ownGlow(ring);
    return { update(dt, t, ctx, w) { const k = (t * 0.8) % 1; ring.position.y = (4 + k * 26) / 16; ring.scale.setScalar(1 - k * 0.35); for (const m of mats) m.color.setRGB(0.32 * 2.2 * (1 - k), 0.95 * 2.2 * (1 - k), 2.2 * (1 - k)); if (Math.random() < dt * 8) ctx.fx.emit({ tile: 'sparkle', pos: [w.x + (Math.random() - 0.5) * 0.7, 0.3, w.z + (Math.random() - 0.5) * 0.7], vel: [0, 1.2, 0], life: 0.9, size: 0.05, color: '#52f2ff', additive: true }); } };
  },
  server_rack: (o) => {
    const leds = get(o, 'leds')!; const mats = ownGlow(leds);
    return { update(_dt, t) { for (const m of mats) { const k = Math.sin(t * 13) > 0.2 ? 2 : 0.7; m.color.setRGB(k, k, k); } } };
  },
  generator: (o) => {
    const wheel = get(o, 'wheel')!, hamster = get(o, 'hamster')!;
    return { update(dt, t, ctx) { const sp = ctx.busy ? 6 : 2.2; wheel.rotation.x += dt * sp; hamster.position.y = 6.4 / 16 + Math.abs(Math.sin(t * sp * 2)) * 0.05; }, click(ctx) { ctx.sfx('weird', 0.4); } };
  },
  slot_machine: (o) => {
    const lever = get(o, 'lever')!, reels = get(o, 'reels')!; const mats = ownGlow(reels);
    let pull = 0;
    return {
      update(dt, t) { pull = Math.max(0, pull - dt * 2.5); lever.rotation.x = Math.sin(Math.min(1, pull) * Math.PI) * 1.1; const k = pull > 0 ? 1.4 + Math.sin(t * 40) * 0.6 : 1.4; for (const m of mats) m.color.setRGB(k, k, k); },
      click(ctx) { pull = 1; ctx.sfx('machine', 0.5); },
    };
  },
  arcade_cab: (o) => {
    const hero = get(o, 'hero')!;
    return { update(_dt, t) { const k = (t * 0.6) % 1; hero.position.x = (-4.8 + k * 9.6) / 16; hero.position.y = (20.8 + Math.max(0, Math.sin(k * Math.PI * 4)) * 2.4) / 16; } };
  },
  pinball: (o) => {
    const ball = get(o, 'ball')!;
    return { update(_dt, t) { ball.position.x = Math.sin(t * 2.3) * 5 / 16; ball.position.z = (Math.cos(t * 1.7) * 9) / 16; ball.position.y = (13 + (14 - Math.cos(t * 1.7) * 9) * 0.1 + 0.8) / 16; } };
  },
  jukebox: (o) => {
    const mats = ownGlow(get(o, 'tubes'));
    return { update(dt, t, ctx, w) { const c = new THREE.Color().setHSL((t * 0.1) % 1, 1, 0.6).multiplyScalar(2); for (const m of mats) m.color.copy(c); if (Math.random() < dt * 2.5) ctx.fx.emit({ tile: 'note', pos: [w.x, 2.1, w.z], vel: [0, 0.7, 0], spread: [0.5, 0.1, 0.5], life: 1.6, size: 0.12, color: ['#ff6fd6', '#52f2ff', '#ffe14d'], wobble: 1, additive: true }); } };
  },
  claw: (o) => {
    const claw = get(o, 'claw')!;
    return { update(_dt, t) { claw.position.set(Math.sin(t * 0.7) * 0.25, (33 - Math.max(0, Math.sin(t * 0.9)) * 12) / 16, Math.cos(t * 0.5) * 0.25); } };
  },
  disco: (o) => {
    const ball = get(o, 'ball')!;
    return { update(dt, t, ctx, w) { ball.rotation.y += dt * 1.4; if (Math.random() < dt * 6) ctx.fx.emit({ tile: ['sparkle', 'star'], pos: [w.x + (Math.random() - 0.5) * 3, 0.2 + Math.random() * 2.5, w.z + (Math.random() - 0.5) * 3], life: 0.5, size: 0.05, color: ['#ff6fd6', '#52f2ff', '#ffe14d', '#8cf56b'], additive: true }); } };
  },
  lava_lamp: (o) => {
    const blobs = get(o, 'blobs')!;
    return { update(_dt, t) { blobs.children.forEach((b, i) => { b.position.y = (9 + ((t * 0.18 + i * 0.33) % 1) * 10 + Math.sin(t + i) * 0.6) / 16; b.scale.setScalar(0.85 + Math.sin(t * 1.3 + i) * 0.15); }); } };
  },
  string_lights: (o) => {
    const mats = ownGlow(get(o, 'bulbs'));
    return { update(_dt, t) { mats.forEach((m, i) => { const k = 1.4 + Math.sin(t * 3 + i * 2) * 0.6; m.color.setRGB(k, k, k); }); } };
  },
  neon_heart: (o) => flicker(o, 37),
  neon_ufo: (o) => flicker(o, 29),
  trash_can: () => ({ update(dt, _t, ctx, w) { if (Math.random() < dt * 0.8) ctx.fx.emit({ tile: 'bug', pos: [w.x, 1.2, w.z], vel: [0, 0.3, 0], spread: [0.6, 0.3, 0.6], life: 1.4, size: 0.05, color: '#2a2a2a', wobble: 2 }); } }),
  shroom: (o) => { const mats = ownGlow(o); const base = mats.map((m) => m.color.clone()); return { update(_dt, t) { const k = 0.85 + Math.sin(t * 1.4) * 0.2; mats.forEach((m, i) => m.color.copy(base[i]).multiplyScalar(k)); } }; },
};

export function makeModel(id: string): PlacedModel {
  const meta = ITEM_META[id] ?? { w: 1, d: 1 };
  const group = new THREE.Group();
  const obj = buildItemModel(id);
  group.add(obj);
  const beh = B[id]?.(obj) ?? {};
  let light: THREE.PointLight | undefined;
  if (meta.light) { const [c, i, h] = meta.light; light = new THREE.PointLight(c, i, 5, 1.6); light.position.y = h; group.add(light); }
  return { group, w: meta.w, d: meta.d, walkable: meta.walkable, hang: meta.hang as PlacedModel['hang'], panel: meta.panel, light, ...beh };
}
