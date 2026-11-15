// The HUD stage — "UI as objects" (after the user's Fishtop): one transparent WebGL layer
// that draws lit voxel miniatures exactly over DOM anchor elements. DOM keeps doing what it
// is good at (hit-testing, focus, tooltips, accessibility, crisp text on plaques); the stage
// makes every button a real little 3D machine that bobs, squashes, tilts toward the cursor
// and springs when clicked.
import * as THREE from 'three';
import { outlineMaterial, studioEnvironment } from '../mesh';
import { INK } from './vkit';
import { matteify } from './pixel';

/** Internal resolution: 1 art pixel = 2 CSS px, upscaled nearest-neighbour (crisp, matches the world). */
export const HUD_PIXEL = 0.5;

export interface StageOpts {
  /** fraction of the anchor's smaller side the model spans */
  fit?: number;
  yaw?: number; pitch?: number;
  /** idle bob amplitude in px */
  bob?: number;
  /** slow idle spin (rad/s) */
  spin?: number;
  /** per-frame hook: animate the model (t seconds, dt) */
  tick?: (t: number, dt: number, it: StageItem) => void;
  /** anchor point inside the element: 0.5 = centre (default), 1 = bottom */
  ay?: number;
  /** extra px offset */
  dy?: number;
}

export interface StageItem {
  el: HTMLElement;
  pivot: THREE.Group;   // positioned/scaled each frame
  tilt: THREE.Group;    // hover tilt + squash
  obj: THREE.Object3D;
  o: Required<Omit<StageOpts, 'tick'>> & { tick?: StageOpts['tick'] };
  hover: boolean;
  /** pointer offset inside the element, -1..1 */
  px: number; py: number;
  press: number;        // spring impulse
  sq: number; sqV: number;
  radius: number; center: THREE.Vector3;
  pushKey: number;
  active: boolean;
  phase: number;
}

export class HudStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.OrthographicCamera(0, 1, 0, -1, -4000, 4000);
  private items = new Set<StageItem>();
  private raf = 0;
  private last = 0;
  private t0 = performance.now();
  reduceMotion = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.scene.environment = studioEnvironment(this.renderer);
    // warm practical key, cool fill, warm rim — Fishtop's tabletop-miniature lighting
    const hemi = new THREE.HemisphereLight('#fff2e2', '#4a4a5e', 1.1);
    const key = new THREE.DirectionalLight('#fff0d8', 2.7); key.position.set(-0.55, 0.8, 1);
    const fill = new THREE.DirectionalLight('#a8c8f0', 0.7); fill.position.set(0.9, -0.3, 0.7);
    const rim = new THREE.DirectionalLight('#ffd8a0', 1.1); rim.position.set(0.4, 0.6, -1);
    this.scene.add(hemi, key, fill, rim);
    this.cam.position.set(0, 0, 2000);
    this.resize();
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.last = performance.now(); });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(HUD_PIXEL);
    this.renderer.setSize(w, h, false);
    this.cam.left = 0; this.cam.right = w; this.cam.top = 0; this.cam.bottom = -h;
    this.cam.updateProjectionMatrix();
  }

  /** Float `obj` over `el`. Returns the item; call remove() when the element goes away. */
  add(el: HTMLElement, obj: THREE.Object3D, opts: StageOpts = {}): StageItem & { remove(): void } {
    const pivot = new THREE.Group(), tilt = new THREE.Group(), inner = new THREE.Group();
    matteify(obj);
    inner.add(obj); tilt.add(inner); pivot.add(tilt);
    // normalise: centre the model on its bounding sphere
    const box = new THREE.Box3().setFromObject(obj);
    const sph = box.getBoundingSphere(new THREE.Sphere());
    inner.position.copy(sph.center).multiplyScalar(-1);
    const it: StageItem = {
      el, pivot, tilt, obj,
      o: { fit: opts.fit ?? 0.86, yaw: opts.yaw ?? -0.45, pitch: opts.pitch ?? 0.22, bob: opts.bob ?? 3, spin: opts.spin ?? 0, ay: opts.ay ?? 0.5, dy: opts.dy ?? 0, tick: opts.tick },
      hover: false, px: 0, py: 0, press: 0, sq: 0, sqV: 0, radius: sph.radius || 1, center: sph.center, pushKey: -1, active: false, phase: Math.random() * 10,
    };
    this.scene.add(pivot);
    this.items.add(it);
    const onEnter = () => { it.hover = true; it.sqV += 3.5; this.burst(it, 4, 0.6); };
    const onLeave = () => { it.hover = false; it.px = it.py = 0; };
    const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); it.px = ((e.clientX - r.left) / r.width) * 2 - 1; it.py = ((e.clientY - r.top) / r.height) * 2 - 1; };
    const onDown = () => { it.sqV -= 7; this.burst(it, 12, 1); };
    el.addEventListener('pointerenter', onEnter); el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointermove', onMove); el.addEventListener('pointerdown', onDown);
    el.addEventListener('focus', onEnter); el.addEventListener('blur', onLeave);
    this.start();
    return Object.assign(it, {
      remove: () => {
        el.removeEventListener('pointerenter', onEnter); el.removeEventListener('pointerleave', onLeave);
        el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('focus', onEnter); el.removeEventListener('blur', onLeave);
        this.scene.remove(pivot); this.items.delete(it);
      },
    });
  }

  /** a quick celebratory spring (e.g. when its panel opens or a number changes) */
  poke(it: StageItem, k = 1) { it.sqV += 9 * k; this.burst(it, 8, 0.8); }

  // ── crisp pixel-sprite effects (sparks, plus-signs, pop rings) ────────────
  private fx: { s: THREE.Sprite; vx: number; vy: number; life: number; max: number; size: number }[] = [];
  private fxTex: THREE.Texture[] | null = null;
  private textures() {
    if (this.fxTex) return this.fxTex;
    const mk = (rows: string[], pal: Record<string, string>) => {
      const c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
      const x = c.getContext('2d')!;
      rows.forEach((r, j) => [...r].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, j, 1, 1); } }));
      const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const P = { w: '#fffbe8', y: '#ffd860', o: '#e89a2a', g: '#a8f080', c: '#8fe8ff', p: '#ff9ad8' };
    this.fxTex = [
      mk(['...y...', '...y...', '..ywy..', 'yywwwyy', '..ywy..', '...y...', '...y...'], P),
      mk(['..g..', '..g..', 'ggwgg', '..g..', '..g..'], P),
      mk(['.ccc.', 'c...c', 'c...c', 'c...c', '.ccc.'], P),
      mk(['.p.', 'pwp', '.p.'], P),
      mk(['oo', 'oo'], P),
    ];
    return this.fxTex;
  }
  burst(it: StageItem, n: number, power: number) {
    if (this.reduceMotion || !it.pivot.visible) return;
    const tex = this.textures();
    const r = it.el.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const t = tex[Math.floor(Math.random() * tex.length)];
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
      const a = Math.random() * Math.PI * 2, sp = (40 + Math.random() * 90) * power;
      const size = ((t.image as HTMLCanvasElement).width) * 2 * (Math.random() < 0.3 ? 2 : 1);
      s.position.set(r.left + r.width / 2 + Math.cos(a) * r.width * 0.25, -(r.top + r.height * 0.42) + Math.sin(a) * r.height * 0.2, 900);
      s.scale.set(size, size, 1);
      s.renderOrder = 10;
      this.scene.add(s);
      this.fx.push({ s, vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp + 30, life: 0, max: 0.45 + Math.random() * 0.5, size });
    }
  }
  private stepFx(dt: number) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life += dt;
      if (f.life >= f.max) { this.scene.remove(f.s); f.s.material.dispose(); this.fx.splice(i, 1); continue; }
      f.vy -= 160 * dt;
      // snap to the art-pixel grid so effects stay crisp
      const px = 1 / HUD_PIXEL;
      f.s.position.x = Math.round((f.s.position.x + f.vx * dt) / px) * px;
      f.s.position.y = Math.round((f.s.position.y + f.vy * dt) / px) * px;
      // blink out in steps (pixel-art fade)
      f.s.visible = f.life / f.max < 0.7 || Math.floor(f.life * 20) % 2 === 0;
    }
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      this.frame((now - this.t0) / 1000, dt);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  private frame(t: number, dt: number) {
    let any = false;
    for (const it of this.items) {
      const r = it.el.getBoundingClientRect();
      const visible = it.el.isConnected && r.width > 2 && r.height > 2 && getComputedStyle(it.el).visibility !== 'hidden';
      it.pivot.visible = visible;
      if (!visible) continue;
      any = true;
      const size = Math.min(r.width, r.height) * it.o.fit;
      const scale = size / (2 * it.radius);
      // outline shells are pushed back in view space (= screen px for this ortho camera)
      // far enough that voxel stair-steps never poke through: ~3 voxels deep
      const voxPx = (scale * 0.05) / 2;
      const key = Math.max(2, Math.round(voxPx * 3 * 2) / 2);
      if (key !== it.pushKey) {
        it.pushKey = key;
        it.obj.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && o.userData.outline) m.material = outlineMaterial(((m.material as THREE.MeshBasicMaterial).color?.getHex?.() ?? INK), key);
        });
      }
      // spring squash
      const k = 120, damp = 11;
      it.sqV += (-k * it.sq - damp * it.sqV) * dt;
      it.sq += it.sqV * dt;
      const rm = this.reduceMotion;
      const bob = rm ? 0 : Math.sin(t * 1.6 + it.phase) * it.o.bob + (it.hover ? -4 : 0);
      it.pivot.position.set(r.left + r.width / 2, -(r.top + r.height * it.o.ay) + bob + it.o.dy, 0);
      it.pivot.scale.setScalar(scale * (it.hover ? 1.08 : 1));
      const s = Math.max(-0.35, Math.min(0.35, it.sq * 0.06));
      it.tilt.scale.set(1 + s, 1 - s, 1 + s);
      const yaw = it.o.yaw + (rm ? 0 : Math.sin(t * 0.7 + it.phase) * 0.12) + it.px * 0.35 + (it.o.spin ? t * it.o.spin : 0);
      const pitch = it.o.pitch + it.py * 0.25;
      it.tilt.rotation.set(pitch, yaw, it.hover && !rm ? Math.sin(t * 9) * 0.02 : 0);
      if (it.hover && Math.random() < dt * 3) this.burst(it, 1, 0.4);
      it.o.tick?.(t, dt, it);
    }
    this.stepFx(dt);
    if (any || this.fx.length) this.renderer.render(this.scene, this.cam);
    else this.renderer.clear();
  }
}

let stage: HudStage | null = null;
export function hudStage(): HudStage | null { return stage; }
export function mountHudStage(canvas: HTMLCanvasElement): HudStage | null {
  if (stage) return stage;
  try { stage = new HudStage(canvas); } catch (err) { console.warn('[hud] no WebGL for the HUD stage', err); stage = null; }
  return stage;
}
