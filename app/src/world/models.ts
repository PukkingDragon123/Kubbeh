// Voxel models for every placeable item in the GENE-O-MAT catalog, with little behaviours.
import * as THREE from 'three';
import type { PanelId } from '../core/types';
import { Vox, voxMesh, MAT, buildVox } from './voxel';
import { pixTex, pixText, canvas } from './pixels';
import type { Particles } from './particles';
import type { Anim } from './stations';
import { neonText } from './env';

const S = 0.125;

export interface ModelCtx { fx: Particles; pointer: THREE.Vector3 | null; busy: number; thinking: boolean; sfx: (name: any, vol?: number) => void }
export interface PlacedModel {
  group: THREE.Group;
  /** footprint in cells before rotation */
  w: number; d: number;
  /** walkable (rugs) */
  walkable?: boolean;
  /** where an alien hangs out: local offset, facing (local yaw), animation */
  hang?: { x: number; z: number; face: number; anim: Anim }[];
  panel?: PanelId;
  update?(dt: number, t: number, ctx: ModelCtx, world: THREE.Vector3): void;
  click?(ctx: ModelCtx, world: THREE.Vector3): void;
  /** point light budget: true if this model wants a light */
  light?: THREE.PointLight;
}

const m = (v: Vox, metal = false) => voxMesh(v, { size: S, center: 'xz', material: metal ? MAT.metal : MAT.solid });
const glowMat = (c: THREE.ColorRepresentation, k = 2.4) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });
const box = (w: number, h: number, d: number, mat: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

function animatedScreen(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, t: number) => void, cw = 48, ch = 40) {
  const { c, ctx } = canvas(cw, ch);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.4, 1.4, 1.4) }));
  let acc = 0;
  return { mesh, tick(dt: number, t: number) { acc += dt; if (acc > 0.1) { acc = 0; draw(ctx, t); tex.needsUpdate = true; } } };
}

type Maker = () => PlacedModel;

export const MODELS: Record<string, Maker> = {
  beanbag: () => {
    const v = new Vox(); v.ellipsoid(0, 2, 0, 4, 2.6, 4, (x, y) => (y > 3 ? 0x8cf56b : 0x5fd84a)); v.ellipsoid(0, 4, -2, 3, 1.5, 1.6, 0x6fe85a);
    return { group: m(v), w: 1, d: 1, hang: [{ x: 0, z: 0.05, face: 0, anim: 'sit' }] };
  },
  couch: () => {
    const v = new Vox(); const C = 0x8a3a5a, D = 0x6b2a46;
    v.box(-8, 0, -3, 8, 3, 4, D).box(-8, 3, -3, 8, 5, 4, C).box(-8, 3, -4, 8, 9, -2, C).box(-9, 3, -4, -7, 7, 4, D).box(7, 3, -4, 9, 7, 4, D);
    v.box(-6, 5, -2, -1, 6, 3, 0xa84a6e).box(1, 5, -2, 6, 6, 3, 0xa84a6e).box(3, 5, 1, 5, 7, 2, 0xffe14d);
    return { group: m(v), w: 2, d: 1, hang: [{ x: -0.4, z: 0.1, face: 0, anim: 'sit' }, { x: 0.4, z: 0.1, face: 0, anim: 'sleep' }] };
  },
  workbench: () => {
    const v = new Vox(); v.box(-8, 5, -4, 8, 6, 4, 0x6b4a2e).box(-8, 0, -4, -6, 5, -2, 0x39433d).box(6, 0, -4, 8, 5, -2, 0x39433d).box(-8, 0, 2, -6, 5, 4, 0x39433d).box(6, 0, 2, 8, 5, 4, 0x39433d);
    v.box(-5, 6, -2, -1, 9, 1, 0x2f6b8f).box(1, 6, 0, 4, 7, 2, 0x9aa69e).set(-3, 9, 0, 0x8cf56b, 2.5);
    return { group: m(v), w: 2, d: 1, hang: [{ x: 0, z: 0.75, face: Math.PI, anim: 'hammer' }] };
  },
  shelf: () => {
    const v = new Vox(); v.box(-8, 0, -2, 8, 16, 2, 0x4d3520);
    for (let s = 0; s < 3; s++) { v.box(-7, s * 5 + 1, -1, 7, s * 5 + 5, 2, 0x1a120c); for (let i = 0; i < 4; i++) v.cyl(-5 + i * 3.4, 0.5, 1.2, s * 5 + 1, s * 5 + 3 + (i % 2), [0x8cf56b, 0xff6fd6, 0x52f2ff, 0xffbe3d][(i + s) % 4], i === s ? 1.8 : 0); }
    return { group: m(v), w: 2, d: 1 };
  },
  rug: () => {
    const v = new Vox(); for (let x = -7; x < 7; x++) for (let z = -7; z < 7; z++) { const r = Math.hypot(x + 0.5, z + 0.5); if (r < 7.2) v.set(x, 0, z, r < 1.8 ? 0x8cf56b : r < 3.2 ? 0x2f6b4a : r < 4.4 ? 0x8cf56b : r < 5.8 ? 0x23503a : 0x8cf56b); }
    const g = voxMesh(v, { size: S, center: 'xz', noAO: true }); g.scale.y = 0.25; g.traverse((o) => { (o as THREE.Mesh).castShadow = false; });
    return { group: g, w: 2, d: 2, walkable: true };
  },
  stool: () => { const v = new Vox(); v.cyl(0, 0, 2.6, 4, 5, 0x9aa69e); for (const [x, z] of [[-2, -2], [2, -2], [0, 2]]) v.box(x, 0, z, x + 1, 4, z + 1, 0x56645e); return { group: m(v, true), w: 1, d: 1, hang: [{ x: 0, z: 0, face: 0, anim: 'sit' }] }; },

  neon_heart: () => {
    const g = new THREE.Group();
    const frame = new Vox().box(-6, 0, 0, -5, 14, 1, 0x39433d).box(5, 0, 0, 6, 14, 1, 0x39433d).box(-6, 6, -1, 6, 14, 0, 0x161b18);
    g.add(m(frame, true));
    const hv = new Vox(); for (let y = 0; y < 8; y++) for (let x = -5; x <= 5; x++) { const nx = x / 4.5, ny = (y - 3) / 4; if (((nx * nx + ny * ny - 1) ** 3 - nx * nx * (-ny) ** 3) <= 0 && ((nx * 1.25) ** 2 + (ny * 1.25) ** 2 - 1) ** 3 - (nx * 1.25) ** 2 * (-ny * 1.25) ** 3 > 0) hv.set(x, 14 - y, 1, 0xff6fd6, 3); }
    const heart = voxMesh(hv, { size: S, center: 'none', origin: [0, 0, 0] }); g.add(heart);
    const word = neonText('GLOB', [0x8cf56b], 0.05, 3); word.group.position.set(-0.28, 0.82, 0.14); g.add(word.group);
    return { group: g, w: 1, d: 1, update(_dt, t) { heart.visible = Math.sin(t * 7) > -0.85 || Math.random() > 0.3; } };
  },
  neon_ufo: () => {
    const g = new THREE.Group();
    g.add(m(new Vox().box(-1, 0, 0, 1, 10, 1, 0x39433d), true));
    const v = new Vox(); for (let x = -6; x <= 6; x++) { v.set(x, 12, 0, 0x52f2ff, 3); } for (let x = -3; x <= 3; x++) v.set(x, 15 - Math.abs(x) * 0.4 | 0, 0, 0x52f2ff, 3);
    v.set(-6, 11, 0, 0xffe14d, 3).set(0, 11, 0, 0xffe14d, 3).set(6, 11, 0, 0xffe14d, 3); for (let y = 6; y < 11; y++) for (let x = -(11 - y); x <= 11 - y; x += 2) v.set(x, y, 0, 0x8cf56b, 2);
    const sign = voxMesh(v, { size: S, center: 'none', origin: [0, 0, 0] }); g.add(sign);
    return { group: g, w: 1, d: 1, update(_dt, t) { sign.position.y = Math.sin(t * 2) * 0.04; } };
  },
  poster: () => {
    const g = new THREE.Group(); g.add(m(new Vox().box(-5, 0, 0, -4, 6, 1, 0x4d3520).box(4, 0, 0, 5, 6, 1, 0x4d3520).box(-5, 6, -1, 5, 18, 0, 0x4d3520), false));
    const tex = pixTex(40, 48, (ctx) => { ctx.fillStyle = '#e9dcb0'; ctx.fillRect(0, 0, 40, 48); pixText(ctx, 'WANTED', 2, 2, 1, '#7a2a1a'); ctx.fillStyle = '#7be35f'; ctx.fillRect(10, 13, 20, 16); ctx.fillStyle = '#000'; ctx.fillRect(13, 17, 5, 7); ctx.fillRect(22, 17, 5, 7); pixText(ctx, 'AREA51', 2, 33, 1, '#3a2a1a'); pixText(ctx, '1 BURGER', 1, 41, 1, '#7a2a1a'); });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); p.position.set(0, 1.5, 0.01); g.add(p);
    return { group: g, w: 1, d: 1 };
  },
  graffiti: () => {
    const v = new Vox(); for (let x = -7; x < 7; x++) for (let y = 0; y < 12; y++) { if (y > 9 + Math.abs(Math.sin(x)) * 2) continue; v.set(x, y, 0, ((x + (Math.floor(y / 2) % 2) * 2) % 4 === 0 || y % 2 === 1) ? 0x2a1f1c : 0x6b3a2e); }
    const g = m(v);
    const tex = pixTex(32, 24, (ctx) => { ctx.fillStyle = '#ff6fd6'; pixText(ctx, 'ZIB', 4, 3, 1, '#ff6fd6'); pixText(ctx, '♥', 22, 3, 1, '#8cf56b'); ctx.fillStyle = '#52f2ff'; ctx.fillRect(3, 14, 26, 2); ctx.fillRect(8, 16, 1, 5); ctx.fillRect(20, 16, 1, 3); });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, emissive: new THREE.Color('#fff'), emissiveMap: tex, emissiveIntensity: 0.5 })); p.position.set(0, 0.75, S * 1.05); g.add(p);
    return { group: g, w: 1, d: 1 };
  },
  lava_lamp: () => {
    const g = new THREE.Group();
    g.add(m(new Vox().cyl(0, 0, 2.5, 0, 3, 0x56645e).cyl(0, 0, 1.6, 10, 12, 0x56645e), true));
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.9, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6fd6').multiplyScalar(0.5), transparent: true, opacity: 0.55, toneMapped: false }));
    glass.position.y = 0.375 + 0.45 - 0.05; g.add(glass);
    const blobs = [0, 1, 2].map((i) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.07 + i * 0.015, 8, 6), glowMat(0x8cf56b, 2.2)); g.add(b); return b; });
    const light = new THREE.PointLight(0xff6fd6, 2.5, 3, 1.8); light.position.y = 0.8; g.add(light);
    return { group: g, w: 1, d: 1, light, update(_dt, t) { blobs.forEach((b, i) => { b.position.set(Math.sin(t * 0.7 + i) * 0.05, 0.45 + (Math.sin(t * 0.5 + i * 2.1) * 0.5 + 0.5) * 0.7, Math.cos(t * 0.6 + i) * 0.05); b.scale.y = 1 + Math.sin(t * 2 + i) * 0.3; }); } };
  },
  disco: () => {
    const g = new THREE.Group();
    g.add(m(new Vox().box(-1, 0, -1, 1, 22, 1, 0x39433d).box(-3, 0, -3, 3, 1, 3, 0x39433d), true));
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.1, flatShading: true, envMapIntensity: 2.4 }));
    ball.position.y = 3.1; g.add(ball);
    const light = new THREE.PointLight(0xff6fd6, 6, 6, 1.6); light.position.y = 2.6; g.add(light);
    const cols = [0xff6fd6, 0x52f2ff, 0x8cf56b, 0xffe14d];
    return { group: g, w: 1, d: 1, light, update(dt, t, ctx, w) {
      ball.rotation.y += dt * 1.4; light.color.setHex(cols[Math.floor(t * 2) % 4]);
      if (Math.random() < dt * 6) ctx.fx.emit({ tile: ['sparkle', 'star'], pos: [w.x + (Math.random() - 0.5) * 3, 0.2 + Math.random() * 2.5, w.z + (Math.random() - 0.5) * 3], life: 0.5, size: 0.12, color: cols.map((c) => '#' + c.toString(16).padStart(6, '0')), additive: true });
    } };
  },
  traffic_cone: () => { const v = new Vox(); v.box(-3, 0, -3, 3, 1, 3, 0xff6a1a); for (let y = 1; y < 9; y++) v.cyl(0, 0, Math.max(0.6, 2.4 - y * 0.25), y, y + 1, y === 4 || y === 6 ? 0xffffff : 0xff6a1a); return { group: m(v), w: 1, d: 1 }; },
  trash_can: () => {
    const v = new Vox(); v.cyl(0, 0, 3, 0, 7, (x, y) => (y % 3 === 0 ? 0x56645e : 0x6f7a73)); v.ellipsoid(0, 7.5, 0, 3, 1.5, 3, 0x2f6b4a).ellipsoid(1, 8.5, 1, 1.4, 1, 1.2, 0xffe14d).set(-1, 9, 0, 0x8cf56b, 2.2);
    return { group: m(v, true), w: 1, d: 1, update(dt, _t, ctx, w) { if (Math.random() < dt * 0.8) ctx.fx.emit({ tile: 'bug', pos: [w.x, 1.2, w.z], vel: [0, 0.3, 0], spread: [0.6, 0.3, 0.6], life: 1.4, size: 0.1, color: '#2a2a2a', wobble: 2 }); } };
  },
  gnome: () => {
    const v = new Vox(); v.ellipsoid(0, 3, 0, 2.6, 3, 2.4, 0x2f6b8f); v.ellipsoid(0, 7, 0, 2, 2, 2, 0xffd0b0); v.ellipsoid(0, 5.6, 1.4, 2, 1.8, 1, 0xffffff);
    for (let y = 9; y < 15; y++) v.cyl(0, 0, Math.max(0.6, 2.6 - (y - 9) * 0.4), y, y + 1, 0xd8304a); v.box(0, 15, 0, 1, 18, 1, 0x9aa69e).set(0, 18, 0, 0x8cf56b, 3);
    return { group: m(v), w: 1, d: 1 };
  },
  chomper: () => {
    const g = new THREE.Group();
    const pot = new Vox().cyl(0, 0, 3, 0, 4, 0xb85a2e).cyl(0, 0, 3.4, 4, 5, 0xc96a3a).cyl(0, 0, 2.6, 5, 5 + 1, 0x3a2414);
    for (let y = 5; y < 11; y++) pot.set(0, y, 0, 0x2f8f3a).set(y % 2 ? 1 : -1, y, 0, y % 3 === 0 ? 0x5fd84a : 0x2f8f3a);
    g.add(m(pot));
    const head = new THREE.Group(); head.position.y = 1.45; g.add(head);
    const jaw = (top: boolean) => { const v = new Vox(); v.ellipsoid(0, 0, 0, 4, 2, 3.5, top ? 0x5fd84a : 0x4bc23a); v.carve((x, y) => (top ? y < 0 : y > 0)); for (let x = -3; x <= 3; x += 2) v.set(x, top ? -1 : 1, 3, 0xffffff); v.paint((vx) => (vx.y === 0 ? 0xd8304a : undefined)); if (top) v.set(-2, 2, 1, 0xffe14d).set(2, 2, 1, 0xffe14d); return voxMesh(v, { size: S, center: 'none', origin: [0, 0, 0] }); };
    const top = jaw(true), bot = jaw(false); head.add(top, bot);
    let chompT = 0;
    const doChomp = (ctx: ModelCtx, w: THREE.Vector3) => { chompT = 0.35; ctx.sfx('chomp', 0.5); ctx.fx.emit({ tile: ['drop'], pos: [w.x, 1.5, w.z + 0.3], count: 4, vel: [0, 1, 1], spread: [0.6, 0.5, 0.4], gravity: 6, life: 0.6, size: 0.1, color: '#8cf56b' }); };
    return { group: g, w: 1, d: 1,
      update(dt, t, ctx, w) {
        chompT = Math.max(0, chompT - dt);
        const near = ctx.pointer ? ctx.pointer.distanceTo(w) < 1.4 : false;
        const open = chompT > 0 ? Math.abs(Math.sin(chompT * 30)) * 0.9 : (near ? 0.6 + Math.sin(t * 14) * 0.3 : 0.25 + Math.sin(t * 2) * 0.15);
        top.rotation.x = -open; bot.rotation.x = open * 0.4;
        head.rotation.z = Math.sin(t * 1.3) * 0.15; head.rotation.y = near && ctx.pointer ? Math.atan2(ctx.pointer.x - w.x, ctx.pointer.z - w.z) : Math.sin(t * 0.5) * 0.6;
        if (near && Math.random() < dt * 0.5) doChomp(ctx, w);
      },
      click(ctx, w) { doChomp(ctx, w); } };
  },
  eyeplant: () => {
    const g = new THREE.Group();
    g.add(m(new Vox().cyl(0, 0, 2.6, 0, 3, 0x6b3a8f).cyl(0, 0, 0.6, 3, 9, 0x2f8f3a).set(1, 6, 0, 0x4bc23a).set(2, 7, 0, 0x4bc23a).set(-1, 5, 0, 0x4bc23a)));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }));
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), new THREE.MeshBasicMaterial({ color: 0x8a4fbf })); iris.position.z = 0.255;
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), new THREE.MeshBasicMaterial({ color: 0x050505 })); pupil.position.z = 0.257;
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4bc23a, side: THREE.DoubleSide }));
    const eg = new THREE.Group(); eg.add(eye, iris, pupil, lid); eg.position.y = 1.35; g.add(eg);
    let blinkT = 2;
    return { group: g, w: 1, d: 1, update(dt, t, ctx, w) {
      const target = ctx.pointer ?? new THREE.Vector3(0, 8, 20);
      eg.lookAt(target.x, Math.max(1, target.y), target.z);
      blinkT -= dt; if (blinkT < 0) blinkT = 2 + Math.random() * 4;
      lid.rotation.x = blinkT < 0.15 ? 0.2 : -1.3; lid.visible = true; eg.position.y = 1.35 + Math.sin(t * 1.5) * 0.04; void w;
    } };
  },
  cactus: () => {
    const v = new Vox(); v.cyl(0, 0, 2.6, 0, 3, 0xb85a2e); v.cyl(0, 0, 1.6, 3, 13, 0x3f9a4a).box(1, 7, 0, 4, 8, 1, 0x3f9a4a).box(3, 8, 0, 4, 11, 1, 0x3f9a4a).box(-4, 5, 0, -1, 6, 1, 0x3f9a4a).box(-4, 6, 0, -3, 9, 1, 0x3f9a4a);
    v.set(0, 13, 0, 0xff6fd6, 2).set(2, 9, 1, 0xffe14d, 2.4).set(-2, 11, 1, 0xffe14d, 2.4);
    return { group: m(v), w: 1, d: 1, click(ctx, w) { ctx.fx.sparks(new THREE.Vector3(w.x, 1.2, w.z), 10); ctx.sfx('zap', 0.4); } };
  },
  tentacle_fern: () => {
    const g = new THREE.Group(); g.add(m(new Vox().cyl(0, 0, 3, 0, 4, 0x3a2a5a).cyl(0, 0, 2.4, 4, 5, 0x1a120c)));
    const tents: THREE.Group[] = [];
    for (let i = 0; i < 5; i++) {
      const t = new THREE.Group(); const segs: THREE.Object3D[] = [];
      let parent: THREE.Object3D = t;
      for (let s = 0; s < 5; s++) { const seg = box(0.09 - s * 0.012, 0.18, 0.09 - s * 0.012, new THREE.MeshStandardMaterial({ color: s === 4 ? 0xff6fd6 : 0x8a4fbf, roughness: 0.4 })); seg.position.y = s === 0 ? 0.09 : 0.17; parent.add(seg); segs.push(seg); parent = seg; }
      t.position.set(Math.cos(i * 1.26) * 0.15, 0.62, Math.sin(i * 1.26) * 0.15); t.rotation.z = Math.cos(i * 1.26) * 0.4; t.rotation.x = -Math.sin(i * 1.26) * 0.4;
      t.userData.segs = segs; g.add(t); tents.push(t);
    }
    return { group: g, w: 1, d: 1, update(_dt, t) { tents.forEach((tt, i) => (tt.userData.segs as THREE.Object3D[]).forEach((s, j) => { s.rotation.z = Math.sin(t * 2 + i + j * 0.6) * 0.25; s.rotation.x = Math.cos(t * 1.6 + i * 2 + j * 0.5) * 0.2; })); } };
  },
  shroom: () => {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const v = new Vox(); for (const [x, z, h, r] of [[0, 0, 7, 3], [-3, 2, 4, 2], [3, -1, 5, 2.2], [2, 3, 3, 1.5]]) { v.cyl(x, z, 0.7, 0, h, 0xe8e2d0); v.ellipsoid(x, h, z, r, r * 0.6, r, 0x52f2ff, 1.8); v.set(x, h + Math.round(r * 0.6), z, 0xffffff, 2); }
    const built = buildVox(v, { size: S, center: 'xz' });
    if (built.solid) g.add(new THREE.Mesh(built.solid, MAT.solid));
    if (built.glow) g.add(new THREE.Mesh(built.glow, mat));
    return { group: g, w: 1, d: 1, update(_dt, t) { const k = 0.7 + Math.sin(t * 1.8) * 0.3; mat.color.setRGB(k, k, k); } };
  },

  tesla: () => {
    const g = new THREE.Group();
    const v = new Vox(); v.cyl(0, 0, 3, 0, 3, 0x39433d).cyl(0, 0, 1.2, 3, 16, (x, y) => (y % 2 ? 0xc96a3a : 0x8a5a33));
    v.ellipsoid(0, 18, 0, 3.4, 2.2, 3.4, 0x9aa69e);
    g.add(m(v, true));
    return { group: g, w: 1, d: 1, update(dt, _t, ctx, w) { const rate = ctx.thinking ? 14 : 2; if (Math.random() < dt * rate) ctx.fx.emit({ tile: ['bolt', 'spark'], pos: [w.x, 2.3, w.z], count: 2, vel: [0, 0, 0], spread: [2, 1.5, 2], life: [0.08, 0.18], size: [0.18, 0.3], color: ['#b48cff', '#ffffff', '#52f2ff'], additive: true }); } };
  },
  microscope: () => { const v = new Vox(); v.box(-3, 0, -3, 3, 1, 3, 0x2b302d).box(-1, 1, -2, 1, 8, -1, 0xd9d4c0).box(-1, 7, -2, 1, 9, 2, 0xd9d4c0).box(-1, 3, -1, 1, 4, 3, 0x2b302d).cyl(0, 0, 1, 9, 11, 0x2f6b8f).set(0, 2, 2, 0x8cf56b, 2.4); return { group: m(v, true), w: 1, d: 1 }; },
  jars: () => {
    const v = new Vox(); v.box(-6, 0, -3, 6, 4, 3, 0x4d3520);
    for (const [x, c, h] of [[-4, 0x8cf56b, 5], [0, 0xff6fd6, 6], [4, 0x52f2ff, 4]] as const) { v.cyl(x, 0, 1.6, 4, 4 + h, c, 1.4); v.cyl(x, 0, 1.8, 4 + h, 5 + h, 0x9aa69e); v.set(x, 5, 1, 0x111111, 0); }
    return { group: m(v), w: 1, d: 1 };
  },
  brain_tank: () => {
    const g = new THREE.Group(); g.add(m(new Vox().cyl(0, 0, 4, 0, 3, 0x39433d).cyl(0, 0, 4, 14, 16, 0x39433d).set(-3, 1, 3, 0x8cf56b, 2.5).set(3, 1, 3, 0xff6fd6, 2.5), true));
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.4, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xbfffe0, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
    jar.position.y = 0.375 + 0.7 + 0.05; g.add(jar);
    const fluid = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 1.3, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color('#2fa860').multiplyScalar(0.6), transparent: true, opacity: 0.5, toneMapped: false })); fluid.position.copy(jar.position); g.add(fluid);
    const bv = new Vox(); bv.ellipsoid(0, 0, 0, 3.2, 2.6, 2.8, (x, y, z) => ((x * 3 + y * 5 + z * 2) % 4 === 0 ? 0xd86a8a : 0xff9ab0)); bv.carve((x) => x === 0);
    const brain = voxMesh(bv, { size: 0.08, center: 'xyz' }); brain.position.y = 1.1; g.add(brain);
    return { group: g, w: 1, d: 1, update(dt, t, ctx, w) { brain.position.y = 1.1 + Math.sin(t * 1.2) * 0.08; brain.rotation.y = Math.sin(t * 0.5) * 0.4; if (Math.random() < dt * 3) ctx.fx.emit({ tile: 'bubble', pos: [w.x + (Math.random() - 0.5) * 0.6, 0.5, w.z + (Math.random() - 0.5) * 0.6], vel: [0, 0.6, 0], life: 1.4, size: 0.07, color: '#d8ffe0' }); } };
  },
  teleporter: () => {
    const g = new THREE.Group(); g.add(m(new Vox().cyl(0, 0, 4, 0, 1, 0x39433d).cyl(0, 0, 3.2, 1, 2, 0x52f2ff, 2.2), true));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 32), glowMat(0x52f2ff, 2.2)); ring.rotation.x = Math.PI / 2; g.add(ring);
    return { group: g, w: 1, d: 1, hang: [{ x: 0, z: 0, face: 0, anim: 'wave' }], update(dt, t, ctx, w) { ring.position.y = 0.3 + ((t * 0.8) % 1) * 1.6; (ring.material as THREE.MeshBasicMaterial).opacity = 1; ring.scale.setScalar(1 - ((t * 0.8) % 1) * 0.3); if (Math.random() < dt * 8) ctx.fx.emit({ tile: 'sparkle', pos: [w.x + (Math.random() - 0.5) * 0.8, 0.3, w.z + (Math.random() - 0.5) * 0.8], vel: [0, 1.2, 0], life: 0.9, size: 0.1, color: '#52f2ff', additive: true }); } };
  },
  server_rack: () => {
    const g = new THREE.Group(); g.add(m(new Vox().box(-4, 0, -3, 4, 18, 3, 0x1b211e).box(-4, 18, -3, 4, 19, 3, 0x2b302d), true));
    const scr = animatedScreen(0.85, 1.9, (ctx, t) => { ctx.fillStyle = '#0a0e0c'; ctx.fillRect(0, 0, 16, 36); for (let r = 0; r < 9; r++) { ctx.fillStyle = '#22302a'; ctx.fillRect(1, r * 4 + 1, 14, 3); for (let i = 0; i < 4; i++) { ctx.fillStyle = Math.sin(t * (3 + i) + r * 7 + i) > 0.2 ? ['#8cf56b', '#ff6fd6', '#52f2ff', '#ffbe3d'][i] : '#14201a'; ctx.fillRect(2 + i * 3, r * 4 + 2, 2, 1); } } }, 16, 36);
    scr.mesh.position.set(0, 1.15, 3 * S + 0.01); g.add(scr.mesh);
    return { group: g, w: 1, d: 1, update(dt, t) { scr.tick(dt, t); } };
  },
  generator: () => {
    const g = new THREE.Group(); g.add(m(new Vox().box(-5, 0, -2, 5, 2, 2, 0x39433d).box(-5, 2, -1, -4, 10, 1, 0x56645e).box(4, 2, -1, 5, 10, 1, 0x56645e).box(-6, 0, 2, -3, 4, 4, 0xffbe3d).set(-5, 3, 4, 0xff5a5a, 3), true));
    const wheel = new THREE.Group(); wheel.position.y = 0.75;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 24), new THREE.MeshStandardMaterial({ color: 0x9aa69e, metalness: 0.8, roughness: 0.3 })); wheel.add(rim);
    for (let i = 0; i < 6; i++) { const sp = box(0.04, 1.08, 0.04, new THREE.MeshStandardMaterial({ color: 0x6f7a73 })); sp.rotation.z = (i / 6) * Math.PI; wheel.add(sp); }
    g.add(wheel);
    const hv = new Vox(); hv.ellipsoid(0, 0, 0, 2.2, 1.6, 1.6, 0xd8a26a).set(2, 1, 0, 0x111111).set(-2, 1, 1, 0xffd0d0).set(-2, 1, -1, 0xffd0d0);
    const hamster = voxMesh(hv, { size: 0.07, center: 'xyz' }); hamster.position.set(0, 0.28, 0); hamster.rotation.y = Math.PI / 2; g.add(hamster);
    return { group: g, w: 1, d: 1, update(dt, t) { wheel.rotation.z -= dt * 3; hamster.position.y = 0.28 + Math.abs(Math.sin(t * 12)) * 0.04; } };
  },
  slot_machine: () => {
    const g = new THREE.Group();
    const v = new Vox(); v.rbox(-5, 0, -3, 5, 16, 3, 1, 0xb23a48).box(-4, 6, 3, 4, 11, 4, 0x111111).box(-5, 16, -2, 5, 18, 2, 0xffbe3d, 1.1).box(5, 6, -1, 6, 8, 1, 0x9aa69e).box(6, 8, 0, 7, 14, 1, 0x9aa69e).box(5, 14, -1, 8, 16, 2, 0xff3a3a, 1.2);
    for (let x = -4; x < 5; x += 2) v.set(x, 12, 3, x % 4 === 0 ? 0xffe14d : 0xff6fd6, 2.5);
    g.add(m(v));
    const syms = ['7', '★', '♥', '$', '?'];
    const scr = animatedScreen(0.95, 0.56, (ctx, t) => { ctx.fillStyle = '#fff6dc'; ctx.fillRect(0, 0, 48, 28); for (let i = 0; i < 3; i++) { const sIdx = Math.floor(t * (i === 1 ? 2 : 1.5) + i * 7) % syms.length; ctx.fillStyle = '#d8d0b8'; ctx.fillRect(1 + i * 16, 1, 14, 26); pixText(ctx, syms[sIdx], 5 + i * 16, 10, 1, ['#d8304a', '#ffbe3d', '#ff4f9a', '#2f8f3a', '#2f6b8f'][sIdx]); } }, 48, 28);
    scr.mesh.position.set(0, 8.5 * S, 4 * S + 0.01); g.add(scr.mesh);
    return { group: g, w: 1, d: 1, panel: 'slot', hang: [{ x: 0, z: 0.8, face: Math.PI, anim: 'play' }], update(dt, t) { scr.tick(dt, t); } };
  },
  arcade_cab: () => {
    const g = new THREE.Group();
    const v = new Vox(); v.box(-5, 0, -4, 5, 20, 4, 0x2a1650).box(-5, 8, 4, 5, 10, 7, 0x3e2470).box(-4, 11, 2, 4, 18, 4, 0x111111).box(-5, 18, -3, 5, 20, 4, 0x52f2ff, 1.1);
    v.set(-2, 10, 6, 0xff3a3a, 2.4).set(1, 10, 6, 0x8cf56b, 2.4).set(2, 10, 5, 0xffe14d, 2.4).box(-3, 10, 5, -2, 12, 6, 0x111111);
    v.paint((vx) => ((vx.x === -5 || vx.x === 4) && vx.y < 18 && (vx.y + vx.z) % 6 === 0 ? 0xff6fd6 : undefined));
    g.add(m(v));
    let px = 10, py = 20, vy = 0;
    const scr = animatedScreen(0.95, 0.8, (ctx, t) => {
      ctx.fillStyle = '#05051a'; ctx.fillRect(0, 0, 48, 40);
      for (let i = 0; i < 12; i++) { ctx.fillStyle = '#ffffff55'; ctx.fillRect((i * 13 + Math.floor(t * 20)) % 48, (i * 7) % 30, 1, 1); }
      ctx.fillStyle = '#2f8f3a'; ctx.fillRect(0, 34, 48, 6);
      vy += 1.2; py += vy; if (py > 28) { py = 28; vy = -6; } px = (px + 1) % 48;
      ctx.fillStyle = '#8cf56b'; ctx.fillRect(px, py - 2, 5, 6); ctx.fillStyle = '#000'; ctx.fillRect(px + 1, py, 1, 2); ctx.fillRect(px + 3, py, 1, 2);
      const ex = 48 - ((Math.floor(t * 18)) % 60); ctx.fillStyle = '#ff6fd6'; ctx.fillRect(ex, 30, 4, 4);
      pixText(ctx, String(Math.floor(t * 10) % 10000).padStart(4, '0'), 22, 2, 1, '#ffe14d');
    });
    scr.mesh.position.set(0, 14.5 * S, 4 * S + 0.01); g.add(scr.mesh);
    return { group: g, w: 1, d: 1, panel: 'arcade', hang: [{ x: 0, z: 0.85, face: Math.PI, anim: 'play' }], update(dt, t) { scr.tick(dt, t); } };
  },
  pinball: () => {
    const g = new THREE.Group();
    const v = new Vox(); v.box(-4, 4, -7, 4, 6, 7, 0x2a1650).box(-4, 0, -7, -3, 4, -6, 0x111111).box(3, 0, -7, 4, 4, -6, 0x111111).box(-4, 0, 6, -3, 4, 7, 0x111111).box(3, 0, 6, 4, 4, 7, 0x111111).box(-4, 6, -7, 4, 14, -5, 0x3e2470);
    g.add(m(v));
    const scr = animatedScreen(0.9, 1.6, (ctx, t) => { ctx.fillStyle = '#12082a'; ctx.fillRect(0, 0, 24, 44); for (let i = 0; i < 6; i++) { ctx.fillStyle = Math.sin(t * 6 + i) > 0 ? ['#ff6fd6', '#52f2ff', '#ffe14d'][i % 3] : '#2a1a3a'; ctx.fillRect(3 + (i % 3) * 7, 6 + Math.floor(i / 3) * 8, 4, 4); } const bx = 12 + Math.sin(t * 3) * 8, by = 24 + Math.cos(t * 2.3) * 14; ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(bx), Math.round(by), 2, 2); ctx.fillStyle = '#ffbe3d'; ctx.fillRect(4, 40, 6, 2); ctx.fillRect(14, 40, 6, 2); }, 24, 44);
    scr.mesh.rotation.x = -Math.PI / 2 + 0.12; scr.mesh.position.set(0, 6 * S + 0.02, 0); g.add(scr.mesh);
    return { group: g, w: 1, d: 1, hang: [{ x: 0, z: 1.0, face: Math.PI, anim: 'play' }], update(dt, t) { scr.tick(dt, t); } };
  },
  jukebox: () => {
    const g = new THREE.Group();
    const v = new Vox(); v.rbox(-5, 0, -3, 5, 14, 3, 2, 0x8a3a1a).ellipsoid(0, 14, 0, 5, 3, 3, 0x8a3a1a).box(-3, 4, 3, 3, 10, 4, 0xffbe3d, 1.4);
    for (let y = 2; y < 13; y++) { v.set(-5, y, 2, 0xff6fd6, 2.2); v.set(4, y, 2, 0x52f2ff, 2.2); }
    g.add(m(v));
    return { group: g, w: 1, d: 1, hang: [{ x: 0, z: 0.9, face: Math.PI, anim: 'jump' }], update(dt, t, ctx, w) { if (Math.random() < dt * 2.5) ctx.fx.emit({ tile: 'note', pos: [w.x, 1.9, w.z], vel: [0, 0.7, 0], spread: [0.5, 0.1, 0.5], life: 1.6, size: 0.18, color: ['#ff6fd6', '#52f2ff', '#ffe14d'], wobble: 1 }); } };
  },
  claw: () => {
    const g = new THREE.Group();
    const v = new Vox(); v.box(-5, 0, -5, 5, 7, 5, 0xff6fd6).box(-5, 7, -5, -4, 18, -4, 0xff6fd6).box(4, 7, -5, 5, 18, -4, 0xff6fd6).box(-5, 7, 4, -4, 18, 5, 0xff6fd6).box(4, 7, 4, 5, 18, 5, 0xff6fd6).box(-5, 18, -5, 5, 20, 5, 0xd84aaf);
    for (let i = 0; i < 10; i++) v.ellipsoid(-3 + (i % 4) * 2, 8, -3 + Math.floor(i / 4) * 2.5, 1, 1, 1, [0x8cf56b, 0x52f2ff, 0xffe14d, 0xb48cff][i % 4]);
    v.box(-2, 3, 5, 2, 5, 6, 0x111111);
    g.add(m(v));
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.35, 1.2), new THREE.MeshStandardMaterial({ color: 0xbfffe0, transparent: true, opacity: 0.12, roughness: 0.05, depthWrite: false })); glass.position.y = 1.55; g.add(glass);
    const clawM = box(0.16, 0.12, 0.16, new THREE.MeshStandardMaterial({ color: 0x9aa69e, metalness: 0.8, roughness: 0.3 })); g.add(clawM);
    return { group: g, w: 1, d: 1, hang: [{ x: 0, z: 0.95, face: Math.PI, anim: 'play' }], update(_dt, t) { clawM.position.set(Math.sin(t * 0.7) * 0.4, 1.9 - Math.max(0, Math.sin(t * 0.9)) * 0.6, Math.cos(t * 0.5) * 0.4); } };
  },
  string_lights: () => {
    const g = new THREE.Group();
    g.add(m(new Vox().box(-8, 0, 0, -7, 20, 1, 0x4d3520).box(7, 0, 0, 8, 20, 1, 0x4d3520)));
    const mats = [glowMat(0xffe14d, 2.6), glowMat(0xff6fd6, 2.6), glowMat(0x52f2ff, 2.6)];
    for (let i = 0; i <= 12; i++) {
      const x = -0.9 + (i / 12) * 1.8, y = 2.45 - Math.sin((i / 12) * Math.PI) * 0.45;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mats[i % 3]); b.position.set(x, y, 0.06); g.add(b);
    }
    const wire = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.008, 4, 24, Math.PI * 0.62), new THREE.MeshBasicMaterial({ color: 0x111111 })); wire.rotation.z = Math.PI + Math.PI * 0.19; wire.position.set(0, 3.2, 0.06); g.add(wire);
    return { group: g, w: 2, d: 1, update(_dt, t) { mats.forEach((mm, i) => { const k = 2 + Math.sin(t * 3 + i * 2) * 0.8; mm.color.setRGB(...(new THREE.Color([0xffe14d, 0xff6fd6, 0x52f2ff][i]).multiplyScalar(k).toArray() as [number, number, number])); }); } };
  },
  lamp_floor: () => {
    const g = new THREE.Group();
    const v = new Vox(); v.cyl(0, 0, 2.6, 0, 1, 0x2b302d).box(0, 1, 0, 1, 18, 1, 0x56645e).box(0, 17, 0, 5, 18, 1, 0x56645e);
    for (let y = 0; y < 3; y++) v.cyl(5, 0, 1.6 + y, 14 - y, 15 - y, 0x2f6b4a, 0, y < 2 ? 1 : 0);
    v.ellipsoid(5, 12, 0, 1.2, 1, 1.2, 0xffd38a, 1.6);
    g.add(m(v, true));
    const light = new THREE.PointLight(0xffc77a, 3, 5, 1.6); light.position.set(5 * S, 1.3, 0); g.add(light);
    return { group: g, w: 1, d: 1, light };
  },
  neon_tube: () => {
    const g = new THREE.Group();
    g.add(m(new Vox().box(-1, 0, -1, 1, 2, 1, 0x39433d).box(0, 2, 0, 1, 4, 1, 0x39433d), true));
    const mat = glowMat(0xb48cff, 1.8);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.6, 8), mat); tube.position.y = 0.5 + 0.8; g.add(tube);
    const light = new THREE.PointLight(0xb48cff, 4, 4, 1.6); light.position.y = 1.3; g.add(light);
    return { group: g, w: 1, d: 1, light, update(_dt, t) { const k = 1.6 + Math.sin(t * 40) * 0.1; mat.color.setRGB(0.7 * k, 0.55 * k, k); } };
  },
};

/** Fallback crate for unknown ids so nothing ever disappears silently. */
export function makeModel(id: string): PlacedModel {
  const f = MODELS[id];
  if (f) return f();
  const v = new Vox().box(-3, 0, -3, 3, 6, 3, 0x6b4a2e).set(0, 6, 0, 0x8cf56b, 2);
  return { group: m(v), w: 1, d: 1 };
}
