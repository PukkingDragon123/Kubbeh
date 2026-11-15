// Pixel-art particle sprites (after the user's games' fxsprites): every spark, steam puff,
// dust mote, bubble, sparkle, heart, Zzz, "!" and "?" is a hand-designed 16 px sprite
// painted in code — hard edges, 3–4 tones, a dark 1 px outline where it helps, short
// animated strips. Drawn as point sprites inside the low-res render, so each is crisp.
// Sprites are greyscale and tinted by the particle colour.
import * as THREE from 'three';

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

// ── the sprite atlas ─────────────────────────────────────────────────────────
const C = 16, COLS = 16, ROWS = 4;
const W = C * COLS, H = C * ROWS;
interface SpriteInfo { cell: number; frames: number; anim: 'life' | 'loop' | 'still'; fps?: number; min: number }
const SPR: Record<TileName, SpriteInfo> = {} as any;
// tones: 0 = transparent, values: 1 outline(dark), 2 shadow, 3 mid, 4 light, 5 highlight(white)
const TONE = [0, 0.12, 0.45, 0.72, 0.9, 1.0];

function buildAtlas(): THREE.DataTexture {
  const data = new Uint8Array(W * H * 4);
  let next = 0;
  const cellAt = (n: number) => [(n % COLS) * C, Math.floor(n / COLS) * C];
  const px = (n: number, x: number, y: number, t: number) => {
    if (x < 0 || y < 0 || x >= C || y >= C || t <= 0) return;
    const [ox, oy] = cellAt(n);
    const k = ((H - 1 - (oy + y)) * W + ox + x) * 4;   // flip rows (texture origin bottom-left)
    const v = Math.round(TONE[t] * 255);
    data[k] = data[k + 1] = data[k + 2] = v; data[k + 3] = 255;
  };
  const rows = (n: number, art: string[], ox = 0, oy = 0) => art.forEach((r, y) => [...r].forEach((ch, x) => px(n, x + ox, y + oy, ch === '.' ? 0 : +ch)));
  const ball = (n: number, cx: number, cy: number, r: number, outline = true) => {
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy) / r;
      if (d > 1) continue;
      if (outline && d > 0.78) { px(n, x, y, 1); continue; }
      const lit = (-dx - dy) / r * 0.5 + (1 - d) * 0.6;
      px(n, x, y, lit > 0.55 ? 5 : lit > 0.3 ? 4 : lit > 0.08 ? 3 : 2);
    }
  };
  const add = (name: TileName, frames: number, anim: SpriteInfo['anim'], min: number, paint: (n: number, f: number) => void, fps?: number) => {
    SPR[name] = { cell: next, frames, anim, fps, min };
    for (let f = 0; f < frames; f++) paint(next + f, f);
    next += frames;
  };

  add('spark', 3, 'life', 0.16, (n, f) => {
    const r = 5 - f * 2;
    for (let i = -r; i <= r; i++) { px(n, 8 + i, 8, Math.abs(i) < 2 ? 5 : 4); px(n, 8, 8 + i, Math.abs(i) < 2 ? 5 : 4); }
    if (f === 0) { px(n, 6, 6, 3); px(n, 10, 10, 3); px(n, 10, 6, 3); px(n, 6, 10, 3); }
  });
  add('sparkle', 4, 'loop', 0.16, (n, f) => {
    const r = [2, 4, 3, 1][f];
    for (let i = -r; i <= r; i++) { px(n, 8 + i, 8, i === 0 ? 5 : 4); px(n, 8, 8 + i, i === 0 ? 5 : 4); }
    if (f === 1) { px(n, 7, 7, 4); px(n, 9, 9, 4); px(n, 9, 7, 4); px(n, 7, 9, 4); }
  }, 10);
  add('star', 1, 'still', 0.2, (n) => rows(n, ['.......5.......', '......454......', '......444......', '.....44444.....', '4444443344444..', '.444433334444..', '..4443333444...', '...44333344....', '...4443344.....', '..444...444....', '..44.....44....', '.4.........4...'].map((r) => r.replace(/3/g, '4')), 1, 2));
  add('dust', 1, 'still', 0.05, (n) => { px(n, 7, 7, 4); px(n, 8, 7, 5); px(n, 7, 8, 3); px(n, 8, 8, 4); });
  add('steam', 4, 'life', 0.3, (n, f) => {
    const blobs: [number, number, number][][] = [[[8, 9, 3]], [[7, 9, 3.5], [10, 7, 2.5]], [[6, 9, 3.5], [10, 8, 3.5], [8, 6, 3]], [[5, 10, 2.5], [11, 9, 2.5], [8, 6, 2.5]]];
    for (const [cx, cy, r] of blobs[f]) ball(n, cx, cy, r, f < 3);
  });
  SPR.smoke = SPR.steam; SPR.puff = SPR.steam;
  add('drop', 1, 'still', 0.08, (n) => rows(n, ['..1..', '.141.', '.141.', '14431', '14331', '13331', '.111.'], 6, 4));
  add('bubble', 2, 'loop', 0.07, (n, f) => {
    const r = f ? 4.5 : 4;
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8); if (d <= r && d > r - 1.2) px(n, x, y, 4); }
    px(n, 6, 6, 5); px(n, 7, 6, 5); px(n, 6, 7, 5);
  }, 4);
  add('glob', 1, 'still', 0.12, (n) => ball(n, 8, 9, 5));
  add('coin', 4, 'loop', 0.14, (n, f) => {
    const w = [5, 3.5, 1.5, 3.5][f];
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { const d = Math.hypot((x + 0.5 - 8) / w, (y + 0.5 - 8) / 5); if (d <= 1) px(n, x, y, d > 0.8 ? 2 : (x + 0.5 - 8) < -w * 0.3 ? 5 : 4); }
  }, 12);
  add('bolt', 2, 'loop', 0.2, (n, f) => rows(n, f ? ['....55', '...55.', '..555.', '.5555.', '...55.', '..55..', '.55...', '55....'] : ['...55', '..55.', '.555.', '5555.', '..55.', '.55..', '55...', '5....'], 5, 4), 18);
  add('bug', 2, 'loop', 0.08, (n, f) => rows(n, f ? ['1...1', '.111.', '13331', '.111.', '1.1.1'] : ['.1.1.', '11111', '13331', '.111.', '1...1'], 6, 6), 14);
  add('ring', 4, 'life', 0.5, (n, f) => { const r = 3 + f * 1.6; for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) { const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8); if (d <= r && d > r - 1.1) px(n, x, y, f < 2 ? 5 : 4); } });
  add('question', 1, 'still', 0.26, (n) => rows(n, ['.11111.', '1555551', '1511151', '.11.151', '..15551', '..1551.', '..151..', '..111..', '..151..', '..111..'], 4, 3));
  add('bang', 1, 'still', 0.26, (n) => rows(n, ['111', '151', '151', '151', '151', '151', '111', '111', '151', '111'], 6, 3));
  add('zzz', 1, 'still', 0.24, (n) => rows(n, ['1111111', '1555551', '1111551', '..1551.', '.1551..', '1551111', '1555551', '1111111'], 4, 4));
  add('heart', 3, 'loop', 0.24, (n, f) => {
    const art = ['.11...11.', '1441.1441', '1454145541', '1444444441', '.14444441.', '..144441..', '...1441...', '....11....'];
    rows(n, art.map((r) => (f === 1 ? r : r)), 3, 4 - (f === 1 ? 1 : 0));
  }, 6);
  add('note', 1, 'still', 0.22, (n) => rows(n, ['....1111', '....1551', '....1511', '....151.', '.11151..', '1555511.', '155551..', '.1111...'], 4, 4));
  const glyph = (name: TileName, art: string[]) => add(name, 1, 'still', 0.18, (n) => rows(n, art, 5, 4));
  glyph('code1', ['...11', '..151', '.151.', '151..', '.151.', '..151', '...11']);
  glyph('code2', ['11...', '151..', '.151.', '..151', '.151.', '151..', '11...']);
  glyph('code3', ['....1', '...15', '..151', '.151.', '151..', '51...', '1....']);
  glyph('code4', ['.111', '.151', '.15.', '151.', '.15.', '.151', '.111']);
  add('eye', 1, 'still', 0.2, (n) => rows(n, ['..11111..', '.1555551.', '155111551', '155141551', '155111551', '.1555551.', '..11111..'], 3, 4));
  add('file', 1, 'still', 0.22, (n) => rows(n, ['111111..', '1555511.', '15555151', '15111111', '15555551', '15111151', '15555551', '15111551', '15555551', '11111111'], 4, 3));

  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

const VERT = /* glsl */ `
attribute float aSize; attribute float aCell; attribute vec4 aColor;
varying float vCell; varying vec4 vColor;
uniform float uScale;
void main() {
  vCell = aCell; vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, floor(aSize * uScale / max(0.1, -mv.z) + 0.5));
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
uniform sampler2D uAtlas; varying float vCell; varying vec4 vColor;
void main() {
  float c = floor(vCell + 0.5);
  vec2 cell = vec2(mod(c, ${COLS}.0), floor(c / ${COLS}.0));
  vec2 uv = (cell * ${C}.0 + vec2(gl_PointCoord.x, gl_PointCoord.y) * ${C}.0) / vec2(${W}.0, ${H}.0);
  uv.y = 1.0 - uv.y;
  vec4 t = texture2D(uAtlas, uv);
  if (t.a < 0.5 || vColor.a < 0.02) discard;
  gl_FragColor = vec4(t.rgb * vColor.rgb, vColor.a);
}`;

const MAX = 1600;
class Pool {
  pos = new Float32Array(MAX * 3); size = new Float32Array(MAX); cell = new Float32Array(MAX); color = new Float32Array(MAX * 4);
  geo = new THREE.BufferGeometry();
  points: THREE.Points;
  mat: THREE.ShaderMaterial;
  constructor(atlas: THREE.Texture, additive: boolean, uScale: { value: number }) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aCell', new THREE.BufferAttribute(this.cell, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 4).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uAtlas: { value: atlas }, uScale },
      transparent: true, depthWrite: !additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 4 : 3;
  }
}

interface P {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  age: number; life: number; s0: number; s1: number; grav: number; drag: number; wob: number;
  r: number; g: number; b: number; add: boolean; spr: SpriteInfo; seed: number;
}

const tmp = new THREE.Color();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pickN = (v: number | [number, number]) => (Array.isArray(v) ? rnd(v[0], v[1]) : v);
const SOFT = new Set<TileName>(['steam', 'smoke', 'puff']);
/** sprites that read as light sources — drawn additive and slightly over-bright (they bloom tightly) */
const LIGHTY = new Set<TileName>(['spark', 'sparkle', 'bolt', 'ring']);

export class Particles {
  readonly group = new THREE.Group();
  enabled = true;
  scale = 1;
  private uScale = { value: 400 };
  private normal: Pool; private add: Pool;
  private live: P[] = [];

  constructor() {
    const atlas = buildAtlas();
    this.normal = new Pool(atlas, false, this.uScale);
    this.add = new Pool(atlas, true, this.uScale);
    this.group.add(this.normal.points, this.add.points);
  }

  /** viewport height in LOW-RES pixels + vertical fov, for sprite sizing */
  setViewport(heightPx: number, fovDeg: number) { this.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)); }
  setCamera(_cam: THREE.Camera) {}

  emit(o: EmitOpts) {
    if (!this.enabled) return;
    const n = Math.max(1, Math.round((o.count ?? 1) * this.scale));
    const tiles = Array.isArray(o.tile) ? o.tile : [o.tile];
    const cols = Array.isArray(o.color) ? o.color : [o.color ?? '#ffffff'];
    const p = Array.isArray(o.pos) ? o.pos : [o.pos.x, o.pos.y, o.pos.z];
    for (let i = 0; i < n; i++) {
      if (this.live.length >= MAX - 2) this.live.shift();
      const tile = tiles[(Math.random() * tiles.length) | 0];
      const spr = SPR[tile] ?? SPR.dust;
      tmp.set(cols[(Math.random() * cols.length) | 0] as any);
      const add = !!o.additive && !SOFT.has(tile) || LIGHTY.has(tile);
      const sp = o.spread ?? [0, 0, 0], v = o.vel ?? [0, 0, 0], j = o.jitter ?? 0;
      const size = Math.max(spr.min, pickN(o.size ?? 0.1) * 2.2);
      const k = add && LIGHTY.has(tile) ? 1.7 : 1;
      this.live.push({
        x: p[0] + (Math.random() - 0.5) * j, y: p[1] + (Math.random() - 0.5) * j, z: p[2] + (Math.random() - 0.5) * j,
        vx: v[0] + (Math.random() - 0.5) * sp[0], vy: v[1] + (Math.random() - 0.5) * sp[1], vz: v[2] + (Math.random() - 0.5) * sp[2],
        age: 0, life: Math.max(0.05, pickN(o.life ?? 1)), s0: size, s1: size * (o.grow ? Math.min(2.2, o.grow * 0.7) : 1),
        grav: o.gravity ?? 0, drag: o.drag ?? 0, wob: o.wobble ?? 0, r: tmp.r * k, g: tmp.g * k, b: tmp.b * k, add, spr, seed: Math.random() * 10,
      });
    }
  }

  update(dt: number, t: number) {
    let nn = 0, na = 0;
    const alive: P[] = [];
    for (const p of this.live) {
      p.age += dt;
      if (p.age >= p.life) continue;
      alive.push(p);
      const k = p.age / p.life;
      p.vy -= p.grav * dt;
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt + (p.wob ? Math.sin(t * 4 + p.seed * 3) * p.wob * dt : 0);
      p.y += p.vy * dt; p.z += p.vz * dt;
      const s = p.spr;
      let frame = 0;
      if (s.anim === 'life') frame = Math.min(s.frames - 1, Math.floor(k * s.frames));
      else if (s.anim === 'loop') frame = Math.floor((p.age + p.seed) * (s.fps ?? 8)) % s.frames;
      const pool = p.add ? this.add : this.normal;
      const i = p.add ? na++ : nn++;
      pool.pos[i * 3] = p.x; pool.pos[i * 3 + 1] = p.y; pool.pos[i * 3 + 2] = p.z;
      pool.size[i] = p.s0 + (p.s1 - p.s0) * k;
      pool.cell[i] = s.cell + frame;
      const fade = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      pool.color[i * 4] = p.r * (p.add ? fade : 1); pool.color[i * 4 + 1] = p.g * (p.add ? fade : 1); pool.color[i * 4 + 2] = p.b * (p.add ? fade : 1);
      pool.color[i * 4 + 3] = p.add ? 1 : (k > 0.85 ? 0 : 1);   // hard pop-out for normal sprites (no soft alpha)
    }
    this.live = alive;
    for (const [pool, n] of [[this.normal, nn], [this.add, na]] as [Pool, number][]) {
      pool.geo.setDrawRange(0, n);
      for (const a of ['position', 'aSize', 'aCell', 'aColor']) (pool.geo.getAttribute(a) as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  burst(pos: THREE.Vector3, colors: (string | number)[] = ['#ff6fd6', '#8cf56b', '#52f2ff', '#ffbe3d', '#b48cff'], n = 26) {
    this.emit({ tile: ['sparkle', 'star', 'coin'], pos, count: n, vel: [0, 2.6, 0], spread: [3, 2, 3], gravity: 5, drag: 0.6, life: [0.8, 1.5], size: [0.08, 0.12], color: colors });
  }
  poof(pos: THREE.Vector3, color: string | number = '#d8e8e0', n = 12) {
    this.emit({ tile: 'puff', pos, count: n, vel: [0, 0.6, 0], spread: [1.6, 0.8, 1.6], drag: 1.6, life: [0.5, 0.9], size: [0.14, 0.2], color });
    this.emit({ tile: 'sparkle', pos, count: Math.ceil(n / 2), vel: [0, 1.2, 0], spread: [2, 1, 2], life: 0.6, size: 0.08, color, additive: true });
  }
  sparks(pos: THREE.Vector3, n = 10) {
    this.emit({ tile: ['spark', 'bolt'], pos, count: n, vel: [0, 2, 0], spread: [3, 2.4, 3], gravity: 7, life: [0.25, 0.5], size: [0.06, 0.09], color: ['#ffe27a', '#ffffff', '#9fe0ff'], additive: true });
  }
}
