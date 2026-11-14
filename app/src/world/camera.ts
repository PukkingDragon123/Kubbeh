// Constrained orbit camera with smooth focus moves, drag/wheel/pinch, and a gentle idle sway.
import * as THREE from 'three';

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  target = new THREE.Vector3(0, 1.4, -0.4);
  radius = 20.5;
  theta = 0;        // azimuth (0 = looking from +z toward -z)
  phi = 1.13;       // polar from +y
  private goal = { target: this.target.clone(), radius: this.radius, theta: this.theta, phi: this.phi };
  readonly home = { target: new THREE.Vector3(0, 1.4, -0.4), radius: 20.5, theta: 0, phi: 1.13 };
  private pointers = new Map<number, { x: number; y: number }>();
  private downAt: { x: number; y: number; t: number } | null = null;
  private dragDist = 0;
  private pinchStart = 0;
  sway = true;
  /** set when the last pointerup was a click (not a drag) */
  onClick?: (x: number, y: number, button: number) => void;
  onDouble?: (x: number, y: number) => void;
  private lastClick = 0;

  constructor(private el: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    el.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private down = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) { this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; this.dragDist = 0; }
    if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y); }
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (this.pointers.size === 1) {
      this.dragDist += Math.abs(dx) + Math.abs(dy);
      if (this.dragDist > 6) {
        this.goal.theta = THREE.MathUtils.clamp(this.goal.theta - dx * 0.005, -0.75, 0.75);
        this.goal.phi = THREE.MathUtils.clamp(this.goal.phi - dy * 0.004, 0.62, 1.32);
      }
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchStart) { this.goal.radius = THREE.MathUtils.clamp(this.goal.radius * (this.pinchStart / d), 7, 30); this.pinchStart = d; }
      this.dragDist = 99;
    }
  };
  private up = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 0 && this.downAt && this.dragDist <= 6) {
      const now = performance.now();
      if (now - this.lastClick < 320) this.onDouble?.(e.clientX, e.clientY);
      else this.onClick?.(e.clientX, e.clientY, e.button);
      this.lastClick = now;
    }
    if (this.pointers.size === 0) this.downAt = null;
  };
  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.goal.radius = THREE.MathUtils.clamp(this.goal.radius * (1 + Math.sign(e.deltaY) * Math.min(0.12, Math.abs(e.deltaY) / 600)), 7, 30);
  };

  focus(target: THREE.Vector3, radius = 11, theta?: number, phi?: number) {
    this.goal.target.copy(target);
    this.goal.radius = radius;
    if (theta !== undefined) this.goal.theta = theta;
    if (phi !== undefined) this.goal.phi = phi;
  }
  goHome() { this.focus(this.home.target, this.home.radius, this.home.theta, this.home.phi); }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    // keep the lab framed on tall/narrow screens
    this.camera.fov = w / h < 0.9 ? 54 : w / h < 1.3 ? 46 : 41;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, t: number, reduce: boolean) {
    const k = reduce ? 1 : 1 - Math.pow(0.0025, dt);
    this.target.lerp(this.goal.target, k);
    this.radius += (this.goal.radius - this.radius) * k;
    this.theta += (this.goal.theta - this.theta) * k;
    this.phi += (this.goal.phi - this.phi) * k;
    const sway = this.sway && !reduce ? Math.sin(t * 0.13) * 0.035 : 0;
    const th = this.theta + sway, ph = this.phi + (this.sway && !reduce ? Math.sin(t * 0.17) * 0.01 : 0);
    this.camera.position.set(
      this.target.x + this.radius * Math.sin(ph) * Math.sin(th),
      this.target.y + this.radius * Math.cos(ph),
      this.target.z + this.radius * Math.sin(ph) * Math.cos(th),
    );
    this.camera.lookAt(this.target);
  }
}
