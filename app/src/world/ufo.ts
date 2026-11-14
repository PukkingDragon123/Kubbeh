// Tiny voxel UFOs patrolling the night sky over the alley. Click one and it panics.
import * as THREE from 'three';
import { Vox, voxMesh } from './voxel';
import type { Particles } from './particles';

export class Ufo {
  group = new THREE.Group();
  private beam: THREE.Mesh;
  private lights: THREE.Mesh[] = [];
  private t0 = Math.random() * 100;
  private panic = 0;
  private beamT = 0;
  constructor(private idx: number, color: number) {
    const v = new Vox();
    v.cyl(0, 0, 7, 0, 1, 0x9aa69e).cyl(0, 0, 5.5, 1, 2, 0xb8c0c6).cyl(0, 0, 4, -1, 0, 0x56645e);
    v.ellipsoid(0, 2.5, 0, 3, 2.4, 3, color, 1.3);
    v.set(-1, 3, 2, 0x111111).set(1, 3, 2, 0x111111);
    const body = voxMesh(v, { size: 0.12, center: 'xz' });
    this.group.add(body);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.12), new THREE.MeshBasicMaterial({ color: 0xffe14d, toneMapped: false }));
      l.position.set(Math.cos(a) * 0.78, 0.06, Math.sin(a) * 0.78);
      this.group.add(l); this.lights.push(l);
    }
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(1.1, 5, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x9dff8a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    this.beam.position.y = -2.5;
    this.group.add(this.beam);
    this.group.userData.ufo = this;
    this.group.scale.setScalar(1.1);
  }
  poke() { this.panic = 2.5; }
  update(dt: number, t: number, fx: Particles) {
    const T = t * (0.06 + this.idx * 0.015) + this.t0;
    let x: number, y: number, z: number;
    if (this.idx === 0) { x = Math.sin(T) * 18; y = 11 + Math.sin(T * 2.3) * 1.2; z = -16 + Math.cos(T * 0.7) * 5; }
    else if (this.idx === 1) { x = Math.cos(T * 1.3) * 24; y = 14 + Math.sin(T * 1.7) * 2; z = -26 + Math.sin(T) * 6; }
    else { x = Math.sin(T * 0.9) * 10 + 4; y = 9.5 + Math.sin(T * 3) * 0.5; z = -11 + Math.cos(T * 1.1) * 3; }
    if (this.panic > 0) { this.panic -= dt; x += Math.sin(t * 30) * 0.4 * this.panic; y += (2.5 - this.panic) * 3; }
    this.group.position.set(x, y, z);
    this.group.rotation.y += dt * (this.panic > 0 ? 12 : 1.2);
    this.group.rotation.z = Math.sin(t * 1.4 + this.t0) * 0.08;
    this.lights.forEach((l, i) => ((l.material as THREE.MeshBasicMaterial).color.setHex(Math.floor(t * 6 + i) % 3 === 0 ? 0xff6fd6 : Math.floor(t * 6 + i) % 3 === 1 ? 0x52f2ff : 0xffe14d)));
    this.beamT -= dt;
    if (this.beamT < -6 - this.idx * 3) this.beamT = 2.5;
    const bm = this.beam.material as THREE.MeshBasicMaterial;
    bm.opacity = this.beamT > 0 ? 0.16 + Math.sin(t * 20) * 0.03 : Math.max(0, bm.opacity - dt);
    if (this.beamT > 0 && Math.random() < dt * 10) fx.emit({ tile: 'sparkle', pos: [x + (Math.random() - 0.5) * 1.2, y - 4 + Math.random() * 3, z + (Math.random() - 0.5) * 1.2], vel: [0, 1.4, 0], life: 0.8, size: 0.2, color: '#9dff8a', additive: true });
  }
}
