// Pooled pixel-art particles: one Points draw call per blend mode, tiles from the atlas.
import * as THREE from 'three';
import { particleAtlas, TILE, type TileName } from './pixels';

export interface EmitOpts {
  tile: TileName | TileName[];
  pos: THREE.Vector3 | [number, number, number];
  count?: number;
  /** base velocity */
  vel?: [number, number, number];
  /** random velocity spread per axis */
  spread?: [number, number, number];
  /** random position jitter */
  jitter?: number;
  life?: number | [number, number];
  size?: number | [number, number];
  color?: string | number | (string | number)[];
  gravity?: number;
  drag?: number;
  additive?: boolean;
  /** end size multiplier */
  grow?: number;
  /** spin flag: wobble horizontally */
  wobble?: number;
}

const VERT = /* glsl */ `
  attribute float aSize; attribute float aTile; attribute vec4 aColor;
  varying float vTile; varying vec4 vColor;
  uniform float uScale;
  void main() {
    vTile = aTile; vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = /* glsl */ `
  uniform sampler2D uAtlas; varying float vTile; varying vec4 vColor;
  void main() {
    float t = floor(vTile + 0.5);
    vec2 tile = vec2(mod(t, 8.0), floor(t / 8.0));
    vec2 uv = (tile * 16.0 + gl_PointCoord * 16.0) / vec2(128.0, 64.0);
    vec4 tex = texture2D(uAtlas, uv);
    if (tex.a * vColor.a < 0.06) discard;
    gl_FragColor = vec4(vColor.rgb, tex.a * vColor.a);
  }`;

class Pool {
  readonly max: number;
  pos: Float32Array; vel: Float32Array; size: Float32Array; size0: Float32Array; size1: Float32Array; tile: Float32Array; color: Float32Array;
  life: Float32Array; age: Float32Array; grav: Float32Array; drag: Float32Array; wob: Float32Array; alpha0: Float32Array;
  n = 0;
  geo = new THREE.BufferGeometry();
  points: THREE.Points;
  mat: THREE.ShaderMaterial;
  constructor(max: number, additive: boolean) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.size = new Float32Array(max);
    this.size0 = new Float32Array(max); this.size1 = new Float32Array(max); this.tile = new Float32Array(max);
    this.color = new Float32Array(max * 4); this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.wob = new Float32Array(max); this.alpha0 = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aTile', new THREE.BufferAttribute(this.tile, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uAtlas: { value: particleAtlas() }, uScale: { value: 500 } },
      toneMapped: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 19;
  }
  spawn(): number {
    if (this.n >= this.max) return -1;
    return this.n++;
  }
  kill(i: number) {
    const j = --this.n;
    if (i === j) return;
    const c3 = (a: Float32Array) => { a[i * 3] = a[j * 3]; a[i * 3 + 1] = a[j * 3 + 1]; a[i * 3 + 2] = a[j * 3 + 2]; };
    c3(this.pos); c3(this.vel);
    for (let k = 0; k < 4; k++) this.color[i * 4 + k] = this.color[j * 4 + k];
    for (const a of [this.size, this.size0, this.size1, this.tile, this.life, this.age, this.grav, this.drag, this.wob, this.alpha0]) a[i] = a[j];
  }
  update(dt: number, t: number) {
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); i--; continue; }
      const k = this.age[i] / this.life[i];
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      const w = this.wob[i] ? Math.sin(t * 6 + i) * this.wob[i] * dt : 0;
      this.pos[i * 3] += this.vel[i * 3] * dt + w;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * k;
      const fade = k < 0.12 ? k / 0.12 : k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1;
      this.color[i * 4 + 3] = this.alpha0[i] * fade;
    }
    this.geo.setDrawRange(0, this.n);
    for (const name of ['position', 'aSize', 'aTile', 'aColor']) (this.geo.attributes[name] as THREE.BufferAttribute).needsUpdate = true;
  }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const tmpC = new THREE.Color();

export class Particles {
  readonly group = new THREE.Group();
  private add = new Pool(1600, true);
  private norm = new Pool(1600, false);
  enabled = true;
  scale = 1; // global density (quality)
  constructor() { this.group.add(this.add.points, this.norm.points); }

  setViewport(heightPx: number, fovDeg: number) {
    const s = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.add.mat.uniforms.uScale.value = s; this.norm.mat.uniforms.uScale.value = s;
  }

  emit(o: EmitOpts) {
    if (!this.enabled) return;
    const pool = o.additive ? this.add : this.norm;
    const count = Math.max(1, Math.round((o.count ?? 1) * (o.count && o.count > 1 ? this.scale : 1)));
    const p = Array.isArray(o.pos) ? o.pos : [o.pos.x, o.pos.y, o.pos.z];
    const tiles = Array.isArray(o.tile) ? o.tile : [o.tile];
    const colors = Array.isArray(o.color) ? o.color : [o.color ?? '#ffffff'];
    for (let c = 0; c < count; c++) {
      const i = pool.spawn(); if (i < 0) return;
      const j = o.jitter ?? 0;
      pool.pos[i * 3] = p[0] + rnd(-j, j); pool.pos[i * 3 + 1] = p[1] + rnd(-j, j) * 0.5; pool.pos[i * 3 + 2] = p[2] + rnd(-j, j);
      const v = o.vel ?? [0, 0, 0], s = o.spread ?? [0, 0, 0];
      pool.vel[i * 3] = v[0] + rnd(-s[0], s[0]); pool.vel[i * 3 + 1] = v[1] + rnd(-s[1], s[1]); pool.vel[i * 3 + 2] = v[2] + rnd(-s[2], s[2]);
      const life = Array.isArray(o.life) ? rnd(o.life[0], o.life[1]) : o.life ?? 1;
      const size = Array.isArray(o.size) ? rnd(o.size[0], o.size[1]) : o.size ?? 0.25;
      pool.life[i] = life; pool.age[i] = 0;
      pool.size0[i] = size; pool.size1[i] = size * (o.grow ?? 1); pool.size[i] = size;
      pool.tile[i] = TILE[tiles[Math.floor(Math.random() * tiles.length)]];
      tmpC.set(colors[Math.floor(Math.random() * colors.length)] as THREE.ColorRepresentation);
      if (o.additive) tmpC.multiplyScalar(1.6);
      pool.color[i * 4] = tmpC.r; pool.color[i * 4 + 1] = tmpC.g; pool.color[i * 4 + 2] = tmpC.b; pool.color[i * 4 + 3] = 0;
      pool.alpha0[i] = 1;
      pool.grav[i] = o.gravity ?? 0; pool.drag[i] = o.drag ?? 0; pool.wob[i] = o.wobble ?? 0;
    }
  }

  update(dt: number, t: number) { this.add.update(dt, t); this.norm.update(dt, t); }

  // ── presets ──
  burst(pos: THREE.Vector3, colors: (string | number)[] = ['#ff6fd6', '#8cf56b', '#52f2ff', '#ffbe3d', '#b48cff'], n = 26) {
    this.emit({ tile: ['confetti', 'square', 'star'], pos, count: n, vel: [0, 3.2, 0], spread: [2.2, 1.6, 2.2], gravity: 6, drag: 1.2, life: [0.9, 1.6], size: [0.12, 0.2], color: colors, wobble: 0.6 });
  }
  poof(pos: THREE.Vector3, color: string | number = '#c9ffd0', n = 14) {
    this.emit({ tile: ['puff', 'smoke'], pos, count: n, vel: [0, 0.6, 0], spread: [1.4, 0.6, 1.4], drag: 2.5, life: [0.5, 0.9], size: [0.3, 0.5], grow: 1.8, color });
  }
  sparks(pos: THREE.Vector3, n = 10) {
    this.emit({ tile: ['spark', 'sparkle', 'plus'], pos, count: n, vel: [0, 2, 0], spread: [2.5, 1.5, 2.5], gravity: 7, life: [0.25, 0.5], size: [0.1, 0.18], color: ['#ffe27a', '#ffffff', '#52f2ff'], additive: true });
  }
}
