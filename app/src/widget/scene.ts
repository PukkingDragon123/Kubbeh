// The floating widget's living 3D voxel mini-deck. Real voxel aliens from the crew walk to
// the station that matches what Claude is actually doing, little voxel UFOs orbit, the
// glass fuel tank shows the real fuel level with bubbles and warning lamps, and the active
// project's progress is a row of voxel cells. Rendered with its own WebGL renderer so it
// works inside a Picture-in-Picture window, a popup, or the page itself.
import * as THREE from 'three';
import { M, S, VoxGrid, hash3, mix, shade } from '../vox/core';
import { toObject, studioEnvironment } from '../vox/mesh';
import { buildAlien, type AlienParts, type Face } from '../vox/alien';
import { buildGlyph } from '../ui/shop/vox/glyphs';
import { activeProjectId, crew, fuel, looks, projects, settings } from '../core/state';
import type { ActivityKind, AlienLook, CrewMember } from '../core/types';

const STATION_X = { computer: -3.1, cabinet: -1.75, telescope: -0.35, board: 1.05, vat: 2.35 } as const;
const STATION: Partial<Record<ActivityKind, number>> = {
  thinking: STATION_X.computer + 0.55, writing: STATION_X.computer + 0.55, coding: STATION_X.computer + 0.55, bugfix: STATION_X.computer + 1.05,
  files: STATION_X.cabinet, research: STATION_X.telescope + 0.5, planning: STATION_X.board, building: STATION_X.board + 0.4,
  cloning: STATION_X.vat - 0.6, question: 0, celebrating: 0.4,
};
const FACE: Partial<Record<ActivityKind, Face>> = {
  thinking: 'focused', writing: 'happy', coding: 'focused', bugfix: 'shocked', research: 'focused', files: 'happy',
  planning: 'happy', building: 'focused', cloning: 'love', question: 'wink', celebrating: 'love', sleeping: 'sleepy',
};

const protos = new Map<string, THREE.Object3D>();
const once = (k: string, f: () => THREE.Object3D) => { let p = protos.get(k); if (!p) { p = f(); protos.set(k, p); } return p.clone(true); };
const grain = (c: number, x: number, y: number, z: number, a = 0.12) => shade(c, 1 - a / 2 + hash3(x | 0, y | 0, z | 0) * a);

function deck() {
  return once('deck', () => {
    const v = VoxGrid.span([-48, -3, -14], [48, 0, 14], 1);
    v.add(S.box([-48, -3, -14], [48, 0, 14]), (x, y, z) => {
      const seam = Math.abs(((x + 48) % 12) - 0) < 0.6 || Math.abs(((z + 14) % 9)) < 0.6;
      const stripe = z > 11 && ((Math.floor(x / 2) + Math.floor(z)) % 2 === 0);
      if (z > 11) return stripe ? 0xffbe3d : 0x1a1408;
      return seam ? 0x1b2422 : grain(0x2f3b38, x, y, z);
    }, M.metal);
    // painted floor guide line
    v.add(S.box([-46, -0.4, 9], [46, 0.2, 10]), (x) => (Math.floor(x / 2) % 2 ? 0xd8e2e6 : 0x8a979c), M.solid);
    const back = VoxGrid.span([-48, 0, -16], [48, 34, -12], 1);
    back.add(S.box([-48, 0, -16], [48, 34, -12]), (x, y, z) => {
      const panel = Math.abs(((x + 48) % 16)) < 0.7 || Math.abs((y % 11)) < 0.7;
      return panel ? 0x1a2225 : grain(y > 26 ? 0x2a3438 : 0x232c30, x, y, z, 0.08);
    }, M.metal);
    // window strip with stars
    back.carve(S.box([-40, 16, -13.5], [40, 28, -11]));
    back.add(S.box([-40, 16, -16], [40, 28, -15]), (x, y) => (hash3(x | 0, y | 0, 3) > 0.94 ? 0xffffff : mix(0x0a0620, 0x1a1040, (y - 16) / 12)), M.glow);
    back.recolor((x, y, _z, c) => (y > 16 && y < 28 && c === 0xffffff ? [c, M.glow] : undefined));
    for (let x = -40; x <= 40; x += 10) back.add(S.box([x - 0.6, 16, -13.5], [x + 0.6, 28, -12]), 0x3d4b44, M.metal);
    const g = new THREE.Group();
    g.add(toObject(v, { size: 0.085 }));
    const b = toObject(back, { size: 0.085 }); g.add(b);
    return g;
  });
}

function stationModel(kind: keyof typeof STATION_X) {
  return once('st:' + kind, () => {
    const v = VoxGrid.span([-10, 0, -8], [10, 26, 8], 1);
    switch (kind) {
      case 'computer':
        v.add(S.box([-9, 0, -6], [9, 9, 4], 1), (x, y, z) => grain(0x55606a, x, y, z), M.metal);
        v.add(S.box([-8, 9, -6], [8, 21, -1], 1.2), (x, y, z) => grain(0x3a4450, x, y, z), M.metal);
        v.add(S.box([-6.5, 11, -1.4], [6.5, 19.5, -0.4]), (x, y) => ((Math.floor(y) % 2 === 0 && hash3(Math.floor(x), Math.floor(y), 1) > 0.35) ? 0x8cf56b : 0x06140c), M.glow);
        v.add(S.box([-6, 9, 1], [6, 10, 4]), 0x2b333c, M.metal);
        break;
      case 'cabinet':
        v.add(S.box([-6, 0, -5], [6, 20, 5], 0.8), (x, y, z) => grain(0x5f7a6a, x, y, z), M.metal);
        for (const y of [5, 11, 17]) { v.add(S.box([-5, y - 4, 4.6], [5, y + 1.5, 5.4]), 0x4a6255, M.metal); v.add(S.box([-1.5, y - 1.5, 5], [1.5, y - 0.5, 6.2]), 0xc4ccd3, M.metal); }
        break;
      case 'telescope':
        v.add(S.cone(0, 0, 0, 3, 6, 4), (x, y, z) => grain(0x4a525e, x, y, z), M.metal);
        v.add(S.capsule([0, 3, 0], [0, 12, 0], 1.2), 0x7a8794, M.metal);
        v.add(S.capsule([-4, 10, 2], [6, 20, -2], 3, 2.4), (x, y, z) => grain(0xc4ccd3, x, y, z), M.metal);
        v.add(S.disc([6.2, 20.2, -2.1], [1, 1, -0.4], 2.2, 0.5), 0x52f2ff, M.glow);
        break;
      case 'board':
        v.add(S.box([-9, 9, -2], [9, 22, -0.5], 0.6), 0xe6edf2, M.solid);
        v.add(S.box([-9.5, 8.5, -2.5], [9.5, 22.5, -1.5]), 0x7a8794, M.metal);
        for (const [y, w, c] of [[19, 10, 0x3b5bff], [16, 14, 0xff6fd6], [13, 7, 0x3f8a2a]] as const) v.add(S.box([-7, y, -0.6], [-7 + w, y + 1, 0.2]), c, M.solid);
        v.add(S.box([-7, 0, -1.5], [-6, 9, -0.5]), 0x5f6a75, M.metal); v.add(S.box([6, 0, -1.5], [7, 9, -0.5]), 0x5f6a75, M.metal);
        break;
      case 'vat':
        v.add(S.cyl(0, 0, 6.5, 0, 3), (x, y, z) => grain(0x4a525e, x, y, z), M.metal);
        v.add(S.cyl(0, 0, 6.5, 21, 24), (x, y, z) => grain(0x4a525e, x, y, z), M.metal);
        v.add(S.cyl(0, 0, 5.4, 3, 17), (x, y) => mix(0x2f9a4a, 0x8cf56b, y / 17), M.solid);
        v.add(S.cyl(0, 0, 6, 3, 21), 0xa8f8ff, M.glass);
        v.add(S.ellipsoid([0, 9, 0], [2.4, 3, 2]), 0x2a6b3a, M.jelly);
        break;
    }
    return toObject(v, { size: 0.085, outline: 0x0b100e });
  });
}

/** glass fuel tank with a live liquid column, marker rings and a warning lamp */
class Tank {
  readonly g = new THREE.Group();
  private liquid: THREE.Mesh;
  private lamp: THREE.Mesh;
  private bubbles: THREE.InstancedMesh;
  private b: { y: number; x: number; z: number; v: number }[] = [];
  private m = new THREE.Matrix4();
  readonly H = 1.9;
  constructor() {
    const frame = once('tank-frame', () => {
      const v = VoxGrid.span([-8, 0, -8], [8, 26, 8], 1);
      v.add(S.cyl(0, 0, 7.4, 0, 2.5), (x, y, z) => grain(0x55606a, x, y, z), M.metal);
      v.add(S.cyl(0, 0, 7.4, 22.5, 25), (x, y, z) => grain(0x55606a, x, y, z), M.metal);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.6; v.add(S.box([Math.cos(a) * 6.9 - 0.6, 2, Math.sin(a) * 6.9 - 0.6], [Math.cos(a) * 6.9 + 0.6, 23, Math.sin(a) * 6.9 + 0.6]), 0x3a4450, M.metal); }
      // marker rings at 50 / 25 / 10 %
      for (const k of [0.5, 0.25, 0.1]) v.add(S.torus([0, 2.5 + 20 * k, 0], [0, 1, 0], 6.6, 0.45), 0xe6edf2, M.metal);
      v.add(S.cyl(0, 0, 0.9, 25, 26), 0x7a8794, M.metal);
      return toObject(v, { size: 0.085, outline: 0x0b100e });
    });
    this.g.add(frame);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 1.7, 20, 1, true), new THREE.MeshPhysicalMaterial({ color: '#c8fbff', transparent: true, opacity: 0.18, roughness: 0.05, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }));
    glass.position.y = 0.21 + 0.85; glass.renderOrder = 3;
    this.g.add(glass);
    this.liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1), new THREE.MeshBasicMaterial({ color: '#8cf56b', transparent: true, opacity: 0.85, toneMapped: false }));
    this.liquid.renderOrder = 2;
    this.g.add(this.liquid);
    this.lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.22), new THREE.MeshBasicMaterial({ color: '#ff5a5a', toneMapped: false }));
    this.lamp.position.y = 2.28; this.g.add(this.lamp);
    this.bubbles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#e9ffe0', transparent: true, opacity: 0.85, toneMapped: false }), 18);
    this.bubbles.frustumCulled = false;
    this.g.add(this.bubbles);
    for (let i = 0; i < 18; i++) this.b.push({ y: Math.random(), x: (Math.random() - 0.5) * 0.7, z: (Math.random() - 0.5) * 0.7, v: 0.25 + Math.random() * 0.4 });
  }
  update(level: number, tier: string, t: number, dt: number, reduce: boolean) {
    const h = Math.max(0.02, level) * 1.7;
    this.liquid.scale.y = h;
    this.liquid.position.y = 0.21 + h / 2;
    const col = tier === 'full' ? 0x8cf56b : tier === 'half' ? 0x52f2ff : tier === 'quarter' ? 0xffbe3d : 0xff5a5a;
    (this.liquid.material as THREE.MeshBasicMaterial).color.setHex(col);
    const warn = tier === 'quarter' || tier === 'critical' || tier === 'empty';
    this.lamp.visible = warn ? Math.sin(t * (tier === 'quarter' ? 6 : 12)) > 0 : false;
    (this.lamp.material as THREE.MeshBasicMaterial).color.setHex(tier === 'quarter' ? 0xffbe3d : 0xff3a3a);
    let i = 0;
    for (const b of this.b) {
      if (!reduce) b.y += b.v * dt;
      if (b.y > 1) { b.y = 0; b.x = (Math.random() - 0.5) * 0.7; b.z = (Math.random() - 0.5) * 0.7; }
      const y = 0.25 + b.y * h;
      const s = b.y * h < h - 0.05 ? 0.05 + (i % 3) * 0.015 : 0;
      this.m.makeScale(s, s, s).setPosition(b.x + Math.sin(t * 3 + i) * 0.03, y, b.z);
      this.bubbles.setMatrixAt(i++, this.m);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
  }
}

/** a row of 10 voxel cells showing the active project's task progress */
class ProgressBar {
  readonly g = new THREE.Group();
  private cells: THREE.Mesh[] = [];
  constructor() {
    const frame = once('pbar', () => {
      const v = VoxGrid.span([-30, -2, -2], [30, 3, 2], 1);
      v.add(S.box([-29, -2, -2], [29, 3, 2], 0.6), (x, y, z) => grain(0x2b3436, x, y, z), M.metal);
      return toObject(v, { size: 0.085, outline: 0x0b100e });
    });
    this.g.add(frame);
    const geo = new THREE.BoxGeometry(0.38, 0.28, 0.2);
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#2a1424', toneMapped: false }));
      c.position.set(-2.18 + i * 0.485, 0.04, 0.12);
      this.cells.push(c); this.g.add(c);
    }
  }
  update(frac: number, t: number) {
    const lit = Math.round(frac * 10);
    this.cells.forEach((c, i) => {
      const m = c.material as THREE.MeshBasicMaterial;
      if (i < lit) m.color.setHex(i === lit - 1 ? mix(0xff6fd6, 0xffffff, (Math.sin(t * 4) + 1) * 0.15) : 0xff6fd6);
      else m.color.setHex(0x2a1424);
    });
  }
}

type Agent = { parts: AlienParts; x: number; tx: number; dir: number; walk: number; wanderAt: number; carry: THREE.Object3D; born: number; lookKey: string };

export class WidgetScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  private agents = new Map<string, Agent>();
  private tank = new Tank();
  private bar = new ProgressBar();
  private ufos: THREE.Object3D[] = [];
  private raf = 0;
  private last = performance.now();
  private t = 0;

  constructor(private canvas: HTMLCanvasElement, private win: Window) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    // pixel render: half resolution, nearest-neighbour upscaled by CSS (image-rendering: pixelated)
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.scene.background = new THREE.Color('#0a1014');
    this.scene.environment = studioEnvironment(this.renderer);
    this.scene.add(new THREE.HemisphereLight('#e8fff4', '#22303a', 1.0));
    const key = new THREE.DirectionalLight('#fff2e0', 2.4); key.position.set(-3, 6, 6); this.scene.add(key);
    const fill = new THREE.DirectionalLight('#a8c8ff', 0.7); fill.position.set(4, 2, 3); this.scene.add(fill);

    this.scene.add(deck());
    for (const k of Object.keys(STATION_X) as (keyof typeof STATION_X)[]) {
      const s = stationModel(k);
      s.position.set(STATION_X[k], 0, -0.6);
      this.scene.add(s);
    }
    this.tank.g.position.set(3.55, 0, -0.35);
    this.scene.add(this.tank.g);
    this.bar.g.position.set(-0.2, 0.06, 1.15);
    this.bar.g.scale.setScalar(0.8);
    this.scene.add(this.bar.g);
    for (let i = 0; i < 2; i++) {
      const u = new THREE.Group(); const g = buildGlyph('ufo', i ? 0xff6fd6 : 0x52f2ff); g.scale.setScalar(0.28); u.add(g);
      this.ufos.push(u); this.scene.add(u);
    }
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.renderer.setSize(Math.round(w / 2), Math.round(h / 2), false);
    this.cam.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2));
    const dist = Math.max(1.32 / tan, 4.05 / (tan * this.cam.aspect));
    this.cam.position.set(0.2, 2.6, dist); this.cam.lookAt(0.2, 0.62, 0); this.cam.updateProjectionMatrix();
  }

  private agentFor(m: CrewMember, lk: AlienLook | undefined, i: number): Agent | null {
    if (!lk) return null;
    const lookKey = [lk.skin, lk.body, lk.belly, lk.bulbA, lk.bulbB].join('|');
    let a = this.agents.get(m.id);
    if (a && a.lookKey !== lookKey) { this.scene.remove(a.parts.root); this.agents.delete(m.id); a = undefined; }
    if (!a) {
      const parts = buildAlien({ ...lk, hat: undefined, outfit: undefined, accessory: undefined }, 0.0125);
      const carry = once('crate', () => {
        const v = VoxGrid.span([-5, 0, -4], [5, 7, 4], 1);
        v.add(S.box([-4.5, 0, -3.5], [4.5, 6.5, 3.5], 0.6), (x, y, z) => grain(0xc9a26a, x, y, z), M.solid);
        v.add(S.box([-2, 2, 3.2], [2, 4.5, 3.8]), 0xfbfff3, M.solid);
        return toObject(v, { size: 0.03, anchor: 'center', outline: 0x2a1a0a });
      });
      carry.visible = false;
      carry.position.set(0, 1.12, 0.2);
      parts.root.add(carry);
      const x = m.role === 'clone' ? STATION_X.vat : -3 + (i % 6) * 1.1;
      a = { parts, x, tx: x, dir: 1, walk: 0, wanderAt: 0, carry, born: performance.now(), lookKey };
      this.agents.set(m.id, a);
      this.scene.add(parts.root);
    }
    return a;
  }

  frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    const t = this.t;
    const reduce = settings.value.reduceMotion;
    const members = crew.value;
    const lk = new Map(looks.value.map((l) => [l.id, l]));
    const crowd = new Map<number, number>();
    members.forEach((m, i) => {
      const a = this.agentFor(m, lk.get(m.lookId ?? m.id) ?? lk.get('blip') ?? looks.value[0], i);
      if (!a) return;
      const st = STATION[m.activity];
      if (st !== undefined) {
        const n = crowd.get(st) ?? 0; crowd.set(st, n + 1);
        a.tx = st + (n % 2 ? -1 : 1) * Math.ceil(n / 2) * 0.55;
        if (m.activity === 'files') a.tx = Math.floor(t / 2.2) % 2 ? STATION_X.computer + 0.6 : STATION_X.cabinet + 0.3;
      } else if (now > a.wanderAt) { a.tx = -3.2 + Math.random() * 6; a.wanderAt = now + 2500 + Math.random() * 4000; }
      const dx = a.tx - a.x;
      const moving = Math.abs(dx) > 0.03 && !reduce;
      if (reduce) a.x = a.tx;
      else if (moving) { a.x += Math.sign(dx) * Math.min(Math.abs(dx), 1.4 * dt * (m.activity === 'question' ? 1.8 : 1)); a.dir = Math.sign(dx); a.walk += dt * 12; }
      const p = a.parts;
      const celebrate = m.activity === 'celebrating' && !reduce;
      const hop = celebrate ? Math.abs(Math.sin(t * 8 + i)) * 0.3 : moving ? Math.abs(Math.sin(a.walk)) * 0.06 : 0;
      const zFront = m.activity === 'question' ? 0.75 : 0.15 + (i % 3) * 0.08;
      p.root.position.set(a.x, hop, zFront);
      const yaw = moving ? (a.dir > 0 ? 1.1 : -1.1) : m.activity === 'question' || celebrate ? 0 : st !== undefined && st < -1 ? -0.6 : 0.2;
      p.root.rotation.y += (yaw - p.root.rotation.y) * Math.min(1, dt * 8);
      const sq = reduce ? 1 : 1 + Math.sin(t * (moving ? 12 : 2.5) + i) * (moving ? 0.05 : 0.02);
      p.jelly.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      p.legL.rotation.x = moving ? Math.sin(a.walk) * 0.7 : 0;
      p.legR.rotation.x = moving ? -Math.sin(a.walk) * 0.7 : 0;
      const typing = (m.activity === 'coding' || m.activity === 'writing' || m.activity === 'bugfix') && !moving && !reduce;
      p.armL.rotation.x = typing ? -1 + Math.sin(t * 18) * 0.25 : 0;
      p.armR.rotation.x = typing ? -1 + Math.cos(t * 18) * 0.25 : m.activity === 'question' && !reduce ? 0 : 0;
      p.armR.rotation.z = m.activity === 'question' && !reduce ? -2.2 + Math.sin(t * 9) * 0.35 : -0.1;
      p.setFace(Math.sin(t * 1.3 + i * 2) > 0.985 ? 'blink' : FACE[m.activity] ?? 'happy');
      a.carry.visible = m.activity === 'files';
      const born = (now - a.born) / 500;
      const s = m.role === 'clone' ? Math.min(1, born) : 1;
      p.root.scale.setScalar(s * (m.role === 'clone' ? 0.9 : 1));
    });
    for (const [id, a] of [...this.agents]) if (!members.some((m) => m.id === id)) { this.scene.remove(a.parts.root); this.agents.delete(id); }

    const anyBusy = members.some((m) => m.activity !== 'idle' && m.activity !== 'sleeping');
    this.ufos.forEach((u, i) => {
      const sp = reduce ? 0 : (anyBusy ? 0.9 : 0.5) * (i ? -1 : 1);
      const a = t * sp + i * Math.PI;
      u.position.set(Math.cos(a) * 3.2, 2.15 + Math.sin(t * 2 + i) * 0.08 + i * 0.12, Math.sin(a) * 0.6 - 0.2);
      u.rotation.set(0.25, t * 2, 0);
    });

    const f = fuel.value;
    this.tank.update(f.level, f.tier, t, dt, reduce);
    const proj = projects.value.find((p) => p.id === activeProjectId.value) ?? [...projects.value].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const tasks = proj?.tasks ?? [];
    this.bar.update(tasks.length ? tasks.filter((x) => x.status === 'done').length / tasks.length : 0, t);

    this.renderer.render(this.scene, this.cam);
    this.raf = this.win.requestAnimationFrame(this.frame);
  };

  start() { this.raf = this.win.requestAnimationFrame(this.frame); }
  stop() {
    this.win.cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.scene.clear();
  }
}
