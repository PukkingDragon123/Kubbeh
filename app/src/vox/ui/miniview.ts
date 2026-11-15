// MiniView — a dedicated little 3D viewport inside a panel (the big fuel tank, previews).
// Own renderer on the given canvas; studio lighting; framed once; ticks while connected.
import * as THREE from 'three';
import { studioEnvironment } from '../mesh';
import { matteify } from './pixel';

export class MiniView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
  private raf = 0;
  private t0 = performance.now();
  private last = performance.now();
  private holder = new THREE.Group();
  yaw = -0.4; pitch = 0.18;
  drag = { on: false, x: 0, vy: 0 };

  constructor(readonly canvas: HTMLCanvasElement, readonly obj: THREE.Object3D, private tick?: (t: number, dt: number) => void, opts: { fill?: number; interactive?: boolean } = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    canvas.style.imageRendering = 'pixelated';
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.setClearColor(0, 0);
    this.scene.environment = studioEnvironment(this.renderer);
    const hemi = new THREE.HemisphereLight('#fff2e2', '#4a4a5e', 1.1);
    const key = new THREE.DirectionalLight('#fff0d8', 2.7); key.position.set(-1.6, 2.4, 2.6);
    const fill = new THREE.DirectionalLight('#a8c8f0', 0.7); fill.position.set(2, 0.4, 1.4);
    const rim = new THREE.DirectionalLight('#ffd8a0', 1.1); rim.position.set(0.8, 1.4, -2.4);
    this.scene.add(hemi, key, fill, rim, this.holder);
    matteify(obj);
    const inner = new THREE.Group(); inner.add(obj); this.holder.add(inner);
    const sph = new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere());
    inner.position.copy(sph.center).multiplyScalar(-1);
    const fill2 = opts.fill ?? 0.9;
    const dist = sph.radius / Math.sin(THREE.MathUtils.degToRad(this.cam.fov / 2)) / fill2;
    this.cam.position.set(0, sph.radius * 0.12, dist);
    this.cam.lookAt(0, 0, 0);
    this.cam.near = dist / 40; this.cam.far = dist * 4;
    if (opts.interactive) {
      canvas.style.cursor = 'grab';
      canvas.addEventListener('pointerdown', (e) => { this.drag.on = true; this.drag.x = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
      canvas.addEventListener('pointermove', (e) => { if (!this.drag.on) return; const dx = e.clientX - this.drag.x; this.drag.x = e.clientX; this.yaw += dx * 0.01; this.drag.vy = dx * 0.01; });
      canvas.addEventListener('pointerup', () => { this.drag.on = false; canvas.style.cursor = 'grab'; });
    }
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  private loop(now: number) {
    if (!this.canvas.isConnected) { this.dispose(); return; }
    this.raf = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const t = (now - this.t0) / 1000;
    const r = this.canvas.getBoundingClientRect();
    // low internal resolution (1 art px = 2 CSS px), nearest upscale — matches the pixel-rendered world
    const W = Math.max(1, Math.round(r.width / 2)), H = Math.max(1, Math.round(r.height / 2));
    if (this.canvas.width !== W || this.canvas.height !== H) { this.renderer.setSize(W, H, false); this.cam.aspect = W / H; this.cam.updateProjectionMatrix(); }
    if (!this.drag.on) { this.drag.vy *= 0.92; this.yaw += this.drag.vy; }
    this.holder.rotation.set(this.pitch, this.yaw + Math.sin(t * 0.5) * 0.08, 0);
    this.tick?.(t, dt);
    this.renderer.render(this.scene, this.cam);
  }

  dispose() { cancelAnimationFrame(this.raf); this.renderer.dispose(); }
}
