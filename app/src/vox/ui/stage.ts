// The HUD stage — "UI as objects" (after the user's Fishtop): one transparent WebGL layer
// that draws lit voxel miniatures exactly over DOM anchor elements. DOM keeps doing what it
// is good at (hit-testing, focus, tooltips, accessibility, crisp text on plaques); the stage
// makes every button a real little 3D machine that bobs, squashes, tilts toward the cursor
// and springs when clicked.
import * as THREE from 'three';
import { outlineMaterial, studioEnvironment } from '../mesh';
import { INK } from './vkit';

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
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.setClearColor(0x000000, 0);
    this.scene.environment = studioEnvironment(this.renderer);
    const hemi = new THREE.HemisphereLight('#eef8ff', '#283240', 0.9);
    const key = new THREE.DirectionalLight('#fff3e2', 3.0); key.position.set(-0.55, 0.8, 1);
    const fill = new THREE.DirectionalLight('#9fd8ff', 0.8); fill.position.set(0.9, -0.3, 0.7);
    const rim = new THREE.DirectionalLight('#b8ffcf', 1.5); rim.position.set(0.4, 0.6, -1);
    this.scene.add(hemi, key, fill, rim);
    this.cam.position.set(0, 0, 2000);
    this.resize();
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.last = performance.now(); });
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.cam.left = 0; this.cam.right = w; this.cam.top = 0; this.cam.bottom = -h;
    this.cam.updateProjectionMatrix();
  }

  /** Float `obj` over `el`. Returns the item; call remove() when the element goes away. */
  add(el: HTMLElement, obj: THREE.Object3D, opts: StageOpts = {}): StageItem & { remove(): void } {
    const pivot = new THREE.Group(), tilt = new THREE.Group(), inner = new THREE.Group();
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
    const onEnter = () => { it.hover = true; it.sqV += 3.5; };
    const onLeave = () => { it.hover = false; it.px = it.py = 0; };
    const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); it.px = ((e.clientX - r.left) / r.width) * 2 - 1; it.py = ((e.clientY - r.top) / r.height) * 2 - 1; };
    const onDown = () => { it.sqV -= 7; };
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
  poke(it: StageItem, k = 1) { it.sqV += 9 * k; }

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
      it.o.tick?.(t, dt, it);
    }
    if (any) this.renderer.render(this.scene, this.cam);
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
