// Pooled VOXEL particles: every spark, bubble, steam puff, heart, Zzz, "?" and "!" is a tiny
// 3D voxel model (cube, cross, or an extruded voxel glyph) drawn with InstancedMesh — one
// draw call per shape and blend mode. Same emit() API the crew / stations already use.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type TileName =
  | 'spark' | 'dust' | 'sparkle' | 'star' | 'steam' | 'smoke' | 'puff' | 'drop' | 'bubble' | 'glob' | 'coin' | 'bolt' | 'bug'
  | 'ring' | 'question' | 'bang' | 'zzz' | 'heart' | 'note' | 'code1' | 'code2' | 'code3' | 'code4' | 'eye' | 'file';

export interface EmitOpts {
  tile: TileName | TileName[];
  pos: THREE.Vector3 | [number, number, number];
  count?: number;
  vel?: [number, number, number];
  spread?: [number, number, number];
  jitter?: number;
  life?: number | [number, number];
  size?: number | [number, number];
  color?: string | number | (string | number)[];
  gravity?: number;
  drag?: number;
  additive?: boolean;
  grow?: number;
  wobble?: number;
}

// ── shapes ───────────────────────────────────────────────────────────────────
const BIT: Record<string, string[]> = {
  question: ['01110', '10001', '00010', '00100', '00000', '00100'],
  bang: ['1', '1', '1', '1', '0', '1'],
  zzz: ['11111', '00010', '00100', '01000', '11111'],
  heart: ['01010', '11111', '11111', '01110', '00100'],
  note: ['00111', '00101', '00100', '01100', '11100', '11000'],
  code1: ['00010', '00100', '01000', '00100', '00010'],   // <
  code2: ['01000', '00100', '00010', '00100', '01000'],   // >
  code3: ['00001', '00010', '00100', '01000', '10000'],   // /
  code4: ['00110', '00100', '01100', '00100', '00110'],   // {
  file: ['11100', '10110', '10011', '10001', '10001', '11111'],
  eye: ['01110', '10101', '11111', '10101', '01110'],
  bug: ['10001', '01110', '11111', '01110', '10101'],
  ring: ['11111', '10001', '10001', '10001', '11111'],
};
function glyphGeo(rows: string[]) {
  const boxes: THREE.BufferGeometry[] = [];
  const h = rows.length, w = rows[0].length, s = 1 / Math.max(w, h);
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch !== '1') return;
    const b = new THREE.BoxGeometry(s * 0.96, s * 0.96, s * 0.9);
    b.translate((x - (w - 1) / 2) * s, ((h - 1) / 2 - y) * s, 0);
    boxes.push(b);
  }));
  return mergeGeometries(boxes)!;
}
function crossGeo() {
  const a = new THREE.BoxGeometry(1, 0.34, 0.34), b = new THREE.BoxGeometry(0.34, 1, 0.34), c = new THREE.BoxGeometry(0.34, 0.34, 1);
  return mergeGeometries([a, b, c])!;
}
const CUBE = new THREE.BoxGeometry(1, 1, 1);

type ShapeKey = 'cube' | 'cross' | keyof typeof BIT;
const SHAPE_OF: Record<TileName, ShapeKey> = {
  spark: 'cube', dust: 'cube', sparkle: 'cross', star: 'cross', steam: 'cube', smoke: 'cube', puff: 'cube', drop: 'cube',
  bubble: 'cube', glob: 'cube', coin: 'cube', bolt: 'cross', bug: 'bug', ring: 'ring', question: 'question', bang: 'bang',
  zzz: 'zzz', heart: 'heart', note: 'note', code1: 'code1', code2: 'code2', code3: 'code3', code4: 'code4', eye: 'eye', file: 'file',
};
const GLYPH = new Set<ShapeKey>(['question', 'bang', 'zzz', 'heart', 'note', 'code1', 'code2', 'code3', 'code4', 'file', 'eye', 'bug', 'ring']);
const SOFT = new Set<TileName>(['steam', 'smoke', 'puff']);

type Blend = 'add' | 'solid' | 'soft';
const MAX_PER = 600;

class Batch {
  mesh: THREE.InstancedMesh;
  n = 0;
  constructor(geo: THREE.BufferGeometry, public blend: Blend) {
    const mat = blend === 'add'
      ? new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false })
      : blend === 'soft'
        ? new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, roughness: 1 })
        : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.05 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PER);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PER * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = blend === 'solid' ? 0 : 3;
  }
}

interface P {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  age: number; life: number; s0: number; s1: number; grav: number; drag: number; wob: number;
  r: number; g: number; b: number; batch: Batch; spin: number; rot: number; glyph: boolean;
}

const tmpC = new THREE.Color();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pickN = (v: number | [number, number]) => (Array.isArray(v) ? rnd(v[0], v[1]) : v);

export class Particles {
  readonly group = new THREE.Group();
  enabled = true;
  scale = 1;
  private batches = new Map<string, Batch>();
  private live: P[] = [];
  private camQ = new THREE.Quaternion();
  private geos = new Map<ShapeKey, THREE.BufferGeometry>();

  setViewport(_h: number, _fov: number) {}
  setCamera(cam: THREE.Camera) { this.camQ.copy(cam.quaternion); }

  private geo(k: ShapeKey) {
    let g = this.geos.get(k);
    if (!g) { g = k === 'cube' ? CUBE : k === 'cross' ? crossGeo() : glyphGeo(BIT[k]); this.geos.set(k, g); }
    return g;
  }
  private batch(shape: ShapeKey, blend: Blend) {
    const key = shape + ':' + blend;
    let b = this.batches.get(key);
    if (!b) { b = new Batch(this.geo(shape), blend); this.batches.set(key, b); this.group.add(b.mesh); }
    return b;
  }

  emit(o: EmitOpts) {
    if (!this.enabled) return;
    const n = Math.max(1, Math.round((o.count ?? 1) * this.scale));
    const tiles = Array.isArray(o.tile) ? o.tile : [o.tile];
    const cols = Array.isArray(o.color) ? o.color : [o.color ?? '#ffffff'];
    const p = Array.isArray(o.pos) ? o.pos : [o.pos.x, o.pos.y, o.pos.z];
    for (let i = 0; i < n; i++) {
      if (this.live.length > 1400) this.live.shift();
      const tile = tiles[(Math.random() * tiles.length) | 0];
      const shape = SHAPE_OF[tile] ?? 'cube';
      const blend: Blend = SOFT.has(tile) && !o.additive ? 'soft' : o.additive ? 'add' : 'solid';
      tmpC.set(cols[(Math.random() * cols.length) | 0] as any);
      const sp = o.spread ?? [0, 0, 0], v = o.vel ?? [0, 0, 0], j = o.jitter ?? 0;
      const size = pickN(o.size ?? 0.1) * (GLYPH.has(shape) ? 1.6 : 0.75);
      this.live.push({
        x: p[0] + (Math.random() - 0.5) * j, y: p[1] + (Math.random() - 0.5) * j, z: p[2] + (Math.random() - 0.5) * j,
        vx: v[0] + (Math.random() - 0.5) * sp[0], vy: v[1] + (Math.random() - 0.5) * sp[1], vz: v[2] + (Math.random() - 0.5) * sp[2],
        age: 0, life: Math.max(0.05, pickN(o.life ?? 1)), s0: size, s1: size * (o.grow ?? (blend === 'soft' ? 2.2 : 0.4)),
        grav: o.gravity ?? 0, drag: o.drag ?? 0, wob: o.wobble ?? 0, r: tmpC.r, g: tmpC.g, b: tmpC.b,
        batch: this.batch(shape, blend), spin: GLYPH.has(shape) ? (Math.random() - 0.5) * 1.2 : (Math.random() - 0.5) * 8, rot: Math.random() * 6, glyph: GLYPH.has(shape),
      });
    }
  }

  update(dt: number, t: number) {
    for (const b of this.batches.values()) b.n = 0;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), pv = new THREE.Vector3();
    const alive: P[] = [];
    for (const p of this.live) {
      p.age += dt;
      if (p.age >= p.life) continue;
      alive.push(p);
      const k = p.age / p.life;
      p.vy -= p.grav * dt;
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt + (p.wob ? Math.sin(t * 4 + p.rot * 3) * p.wob * dt : 0);
      p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.spin * dt;
      const b = p.batch;
      if (b.n >= MAX_PER) continue;
      // pop in, ease out
      const pop = Math.min(1, p.age / 0.08);
      let sz = (p.s0 + (p.s1 - p.s0) * k) * pop;
      let fade = 1;
      if (b.blend === 'add') fade = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1; else if (k > 0.7) sz *= 1 - (k - 0.7) / 0.3;
      if (p.glyph) q.copy(this.camQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(p.rot) * 0.5));
      else q.setFromEuler(e.set(p.rot, p.rot * 0.7, 0));
      m.compose(pv.set(p.x, p.y, p.z), q, s.set(sz, sz, sz));
      b.mesh.setMatrixAt(b.n, m);
      b.mesh.instanceColor!.setXYZ(b.n, p.r * fade * (b.blend === 'add' ? 1.6 : 1), p.g * fade * (b.blend === 'add' ? 1.6 : 1), p.b * fade * (b.blend === 'add' ? 1.6 : 1));
      b.n++;
    }
    this.live = alive;
    for (const b of this.batches.values()) {
      b.mesh.count = b.n;
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
    }
  }

  /** celebratory confetti burst */
  burst(pos: THREE.Vector3, colors: (string | number)[] = ['#ff6fd6', '#8cf56b', '#52f2ff', '#ffbe3d', '#b48cff'], n = 30) {
    this.emit({ tile: ['spark', 'sparkle', 'star'], pos, count: n, vel: [0, 2.6, 0], spread: [3, 2, 3], gravity: 5, drag: 0.6, life: [0.8, 1.5], size: [0.06, 0.11], color: colors });
  }
  poof(pos: THREE.Vector3, color: string | number = '#c9ffd0', n = 16) {
    this.emit({ tile: ['puff', 'steam'], pos, count: n, vel: [0, 0.7, 0], spread: [1.8, 1, 1.8], drag: 1.6, life: [0.5, 0.9], size: [0.12, 0.2], grow: 2.4, color });
    this.emit({ tile: 'sparkle', pos, count: Math.ceil(n / 2), vel: [0, 1.2, 0], spread: [2, 1, 2], life: 0.6, size: 0.08, color, additive: true });
  }
  sparks(pos: THREE.Vector3, n = 10) {
    this.emit({ tile: ['spark', 'bolt'], pos, count: n, vel: [0, 2, 0], spread: [3, 2.4, 3], gravity: 7, life: [0.25, 0.55], size: [0.035, 0.07], color: ['#ffe27a', '#ffffff', '#52f2ff'], additive: true });
  }
}
