// The photo studio: a private offscreen WebGL renderer that photographs voxel models into
// crisp canvases (icons, shop thumbnails, medals, slot symbols). Same lighting everywhere,
// so every 3D object in the UI reads as one family. Results are cached by key.
//
//   photo(obj, 96, 96, { yaw, pitch, key: 'icon:terminal' })  → HTMLCanvasElement
//   photoURL(...)                                              → data URL (for <img>)
//   liveView(canvas, build)                                    → animated mini viewport (hover spin etc.)
import * as THREE from 'three';
import { studioEnvironment } from './mesh';

let R: THREE.WebGLRenderer | null = null;
let env: THREE.Texture | null = null;

export function studioRenderer(): THREE.WebGLRenderer | null {
  if (R) return R;
  try {
    R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    R.outputColorSpace = THREE.SRGBColorSpace;
    R.toneMapping = THREE.NeutralToneMapping;
    R.toneMappingExposure = 1.0;
    R.setPixelRatio(1);
    R.setClearColor(0x000000, 0);
    env = studioEnvironment(R);
  } catch { R = null; }
  return R;
}

/** The shared studio lighting rig: warm key top-left, cool fill, neon rim. */
export function studioLights(): THREE.Group {
  const g = new THREE.Group();
  const hemi = new THREE.HemisphereLight('#f2fff6', '#2c3a44', 0.85);
  const key = new THREE.DirectionalLight('#fff3e2', 3.0); key.position.set(-1.6, 2.4, 2.6);
  const fill = new THREE.DirectionalLight('#9fd8ff', 0.9); fill.position.set(2, 0.4, 1.4);
  const rim = new THREE.DirectionalLight('#b8ffcf', 1.6); rim.position.set(0.8, 1.4, -2.4);
  g.add(hemi, key, fill, rim);
  return g;
}

const scene = new THREE.Scene();
scene.add(studioLights());
const cam = new THREE.PerspectiveCamera(24, 1, 0.01, 200);
const box = new THREE.Box3(), sphere = new THREE.Sphere();

export interface PhotoOpts {
  yaw?: number; pitch?: number;
  /** fraction of the frame the object fills (0..1) */
  fill?: number;
  /** supersampling factor */
  ss?: number;
  /** cache key — same key returns the same canvas */
  key?: string;
  /** solid background colour (default transparent) */
  bg?: string | null;
  fov?: number;
}

const cache = new Map<string, HTMLCanvasElement>();

/** Frame `obj` to fill the shot and render it to a w×h canvas. */
export function photo(obj: THREE.Object3D, w: number, h: number, o: PhotoOpts = {}, into?: HTMLCanvasElement): HTMLCanvasElement {
  if (o.key && !into) { const hit = cache.get(`${o.key}|${w}x${h}`); if (hit) return hit; }
  const out = into ?? document.createElement('canvas');
  if (!into) { out.width = w; out.height = h; }
  const r = studioRenderer();
  if (!r) return out;
  const ss = o.ss ?? 2;
  r.setSize(w * ss, h * ss, false);
  scene.environment = env;
  scene.background = o.bg ? new THREE.Color(o.bg) : null;
  const holder = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.add(obj);
  holder.add(pivot);
  pivot.rotation.set(o.pitch ?? 0.22, o.yaw ?? -0.5, 0);
  scene.add(holder);
  holder.updateMatrixWorld(true);
  box.setFromObject(obj, true);
  box.getBoundingSphere(sphere);
  pivot.position.sub(sphere.center);
  cam.fov = o.fov ?? 24;
  cam.aspect = w / h;
  const fill = o.fill ?? 0.86;
  const fitH = sphere.radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2));
  const fitW = fitH / Math.min(1, cam.aspect);
  const dist = Math.max(fitH, fitW) / fill;
  cam.position.set(0, 0, dist);
  cam.near = dist / 50; cam.far = dist * 4;
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  r.render(scene, cam);
  const ctx = out.getContext('2d')!;
  if (into) ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(r.domElement, 0, 0, w, h);
  scene.remove(holder);
  pivot.remove(obj);
  if (o.key && !into) cache.set(`${o.key}|${w}x${h}`, out);
  return out;
}

export function photoURL(obj: THREE.Object3D, w: number, h: number, o: PhotoOpts = {}): string {
  const k = o.key ? `url:${o.key}|${w}x${h}` : '';
  if (k && urlCache.has(k)) return urlCache.get(k)!;
  const u = photo(obj, w, h, o).toDataURL('image/png');
  if (k) urlCache.set(k, u);
  return u;
}
const urlCache = new Map<string, string>();

/**
 * A live mini viewport: renders `obj` into the given 2D canvas every frame while active
 * (hover spin, idle bob, bubbling tanks…). One shared GL context draws all live views.
 */
export interface LiveView { stop(): void; obj: THREE.Object3D; setActive(on: boolean): void }
const live = new Set<{ c: HTMLCanvasElement; obj: THREE.Object3D; tick: (t: number, dt: number) => void; active: boolean; o: PhotoOpts }>();
let raf = 0, last = 0;
function loop(now: number) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  for (const v of live) {
    if (!v.active || !v.c.isConnected) continue;
    v.tick(t, dt);
    photo(v.obj, v.c.width, v.c.height, { ...v.o, key: undefined, ss: v.o.ss ?? 1 }, v.c);
  }
}
export function liveView(c: HTMLCanvasElement, obj: THREE.Object3D, tick: (t: number, dt: number) => void, o: PhotoOpts = {}): LiveView {
  const v = { c, obj, tick, active: true, o };
  live.add(v);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
  return {
    obj,
    stop() { live.delete(v); if (!live.size && raf) { cancelAnimationFrame(raf); raf = 0; } },
    setActive(on) { v.active = on; },
  };
}
