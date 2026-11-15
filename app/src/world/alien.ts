// A crew alien in the ship: wraps the high-res voxel model from src/vox/alien.ts with the
// behaviour rig — hop-walk squash & stretch, blinking, activity expressions, poke wobble,
// held tools, file-box carrying, antenna wobble, Pounce's paw wave and tail swish.
import * as THREE from 'three';
import type { AlienLook, Expression } from '../core/types';
import { buildAlien, type AlienParts, type Face } from '../vox/alien';
import { dressAlien, buildHeldItem } from '../vox/cosmetics';
import type { Anim } from './stations';

export type HandItem = 'hammer' | 'wrench' | 'magnifier' | 'box' | 'mug' | 'chalk' | null;

/** World units per alien model unit (≈1.25 world units from feet to antenna tips). */
export const ALIEN_SIZE = 0.0185;

const EXPR_FOR: Partial<Record<Anim, Expression>> = {
  type: 'focused', research: 'focused', hammer: 'focused', whack: 'shocked', scribble: 'happy', vat: 'love',
  wave: 'happy', jump: 'happy', sleep: 'sleepy', play: 'tongue', think: 'derp',
};

let shadowGeo: THREE.CircleGeometry | null = null;
let shadowMat: THREE.MeshBasicMaterial | null = null;

export class Alien {
  readonly root = new THREE.Group();
  parts!: AlienParts;
  private shadow: THREE.Mesh;
  private held: THREE.Object3D | null = null;
  private heldId: HandItem = null;
  private boxAbove: THREE.Object3D | null = null;

  look: AlienLook;
  anim: Anim = 'idle';
  carrying = false;
  path: THREE.Vector3[] = [];
  speed = 1.7;
  moving = false;
  heading = 0;
  targetHeading = 0;
  private phase = Math.random() * 10;
  private sq = 0; private sqV = 0;
  private blinkT = 2 + Math.random() * 3;
  private blinking = 0;
  private exprOverride: { e: Expression; until: number } | null = null;
  private seed = Math.random() * 100;
  scaleK = 1;
  onImpact?: () => void;
  private lastImpactCycle = -1;
  night = false;
  isClone = false;

  constructor(look: AlienLook, opts: { clone?: boolean } = {}) {
    this.look = look;
    this.isClone = !!opts.clone;
    shadowGeo ??= new THREE.CircleGeometry(0.42, 24);
    shadowMat ??= new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat.clone());
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.012; this.shadow.renderOrder = 1;
    this.root.add(this.shadow);
    this.build();
    this.root.userData.alien = this;
  }

  private build() {
    if (this.parts) this.parts.root.removeFromParent();
    this.parts = buildAlien(this.look, ALIEN_SIZE);
    this.parts.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.outline) m.castShadow = true; });
    dressAlien(this.parts, this.look);
    this.root.add(this.parts.root);
    this.held = null; this.boxAbove = null;
    const h = this.heldId; this.heldId = null; this.hold(h);
    if (this.carrying) { this.carrying = false; this.setCarry(true); }
  }

  setLook(look: AlienLook) {
    const prev = this.look;
    this.look = look;
    if (prev.skin !== look.skin || prev.body !== look.body || prev.belly !== look.belly || prev.hat !== look.hat || prev.outfit !== look.outfit
      || prev.accessory !== look.accessory || prev.bulbA !== look.bulbA || prev.bulbB !== look.bulbB || prev.eyes !== look.eyes) {
      this.build();
      this.poke(0.6);
    }
  }

  hold(item: HandItem) {
    if (this.heldId === item) return;
    if (this.held) { this.held.removeFromParent(); this.held = null; }
    this.heldId = item;
    if (!item || item === 'box') return;
    const m = buildHeldItem(item);
    this.parts.anchors.handR.add(m);
    if (item === 'magnifier') m.rotation.x = -1.2;
    this.held = m;
  }

  setCarry(on: boolean) {
    this.carrying = on;
    if (on && !this.boxAbove) {
      this.boxAbove = buildHeldItem('box');
      this.boxAbove.position.set(0, this.parts.height * 0.62, 0.05);
      this.parts.jelly.add(this.boxAbove);
    }
    if (!on && this.boxAbove) { this.boxAbove.removeFromParent(); this.boxAbove = null; }
  }

  express(e: Expression, seconds = 1.6) { this.exprOverride = { e, until: performance.now() + seconds * 1000 }; }
  poke(strength = 1) { this.sqV += 7 * strength; }

  /** World-space point just above the head (for bubbles & tags). */
  headTop(out: THREE.Vector3) {
    const k = this.look.skin === 'pounce' ? 20 : 30;
    return this.parts.head.localToWorld(out.set(0, k * ALIEN_SIZE, 0));
  }
  get position() { return this.root.position; }

  private currentFace(): Face {
    if (this.blinking > 0) return 'blink';
    if (this.exprOverride && performance.now() < this.exprOverride.until) return this.exprOverride.e;
    if (this.moving && this.speed > 2.6) return 'shocked';
    return EXPR_FOR[this.anim] ?? (this.night && this.anim === 'idle' && this.look.quirk === 'sleepy' ? 'sleepy' : this.look.expression);
  }

  update(dt: number, t: number) {
    const P = this.parts;
    // movement along path
    if (this.path.length) {
      const target = this.path[0];
      const dx = target.x - this.root.position.x, dz = target.z - this.root.position.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * dt;
      if (d <= step) { this.root.position.x = target.x; this.root.position.z = target.z; this.path.shift(); }
      else { this.root.position.x += (dx / d) * step; this.root.position.z += (dz / d) * step; this.targetHeading = Math.atan2(dx, dz); }
      this.moving = this.path.length > 0 || d > step;
    } else this.moving = false;
    let dh = this.targetHeading - this.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading += dh * Math.min(1, dt * 9);
    this.root.rotation.y = this.heading;

    // squash spring
    this.sqV += (-60 * this.sq - 7 * this.sqV) * dt;
    this.sq += this.sqV * dt;

    // blink
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinking = 0.13; this.blinkT = 1.8 + Math.random() * 3.5; }
    if (this.blinking > 0) this.blinking -= dt;

    const a = this.anim;
    const cat = this.look.skin === 'pounce';
    let y = 0, sy = 1 + Math.sin(t * 2.4 + this.seed) * 0.025, lean = 0;
    const armL = P.armL.rotation, armR = P.armR.rotation, legL = P.legL.rotation, legR = P.legR.rotation, head = P.head.rotation;
    armL.set(0, 0, 0.12); armR.set(0, 0, -0.12); legL.set(0, 0, 0); legR.set(0, 0, 0); head.set(0, 0, 0);

    if (this.moving) {
      this.phase += dt * this.speed * 6.2;
      const s = Math.abs(Math.sin(this.phase));
      y = s * (this.speed > 2.6 ? 0.16 : 0.11);
      sy = s < 0.18 ? 0.86 : 1 + s * 0.07;
      if (s < 0.06 && this.sqV > -1) this.sqV -= 1.6;
      legL.x = Math.sin(this.phase) * 0.6; legR.x = -Math.sin(this.phase) * 0.6;
      armL.x = -Math.sin(this.phase) * 0.7; armR.x = Math.sin(this.phase) * 0.7;
      lean = 0.08;
      if (this.carrying) { armL.x = armR.x = -2.9; }
    } else {
      switch (a) {
        case 'type': armL.x = -1.25 + Math.sin(t * 19) * 0.22; armR.x = -1.25 + Math.sin(t * 19 + 1.7) * 0.22; head.x = 0.08 + Math.sin(t * 9) * 0.03; lean = 0.1; break;
        case 'think': armR.x = -2.35; armR.z = 0.55; head.z = Math.sin(t * 1.3) * 0.16; head.x = -0.12; break;
        case 'research': armR.x = -1.5 + Math.sin(t * 1.6) * 0.15; head.z = Math.sin(t * 0.9) * 0.2; head.y = Math.sin(t * 0.7) * 0.25; lean = 0.12; break;
        case 'hammer': case 'whack': {
          const sp = a === 'whack' ? 7.5 : 5.2;
          const cyc = (t * sp) % (Math.PI * 2);
          armR.x = -2.7 + Math.max(0, Math.sin(cyc)) * 2.2; lean = 0.12;
          const ci = Math.floor((t * sp) / (Math.PI * 2));
          if (cyc > Math.PI * 0.45 && cyc < Math.PI * 0.6 && ci !== this.lastImpactCycle) { this.lastImpactCycle = ci; this.onImpact?.(); if (this.sqV > -2) this.sqV -= 2; }
          if (a === 'whack') head.z = Math.sin(t * 13) * 0.08;
          break;
        }
        case 'scribble': armR.x = -1.9 + Math.sin(t * 7) * 0.2; armR.z = -0.3 + Math.cos(t * 7) * 0.25; head.z = Math.sin(t * 2) * 0.08; break;
        case 'vat': armL.x = armR.x = -2.4 + Math.sin(t * 8) * 0.18; armL.z = 0.4; armR.z = -0.4; y = Math.abs(Math.sin(t * 5)) * 0.04; break;
        case 'wave': if (cat) armR.x = -1.0 + Math.sin(t * 6) * 0.35; else armR.z = -2.6 + Math.sin(t * 10) * 0.35; head.z = Math.sin(t * 3) * 0.1; y = Math.abs(Math.sin(t * 6)) * 0.05; break;
        case 'jump': { const s = Math.abs(Math.sin(t * 6.5)); y = s * 0.5; sy = s < 0.15 ? 0.82 : 1.1; armL.z = 2.6; armR.z = -2.6; break; }
        case 'sit': y = -0.06; sy = 0.9; legL.x = legR.x = -1.4; break;
        case 'sleep': y = -0.06; sy = 0.86 + Math.sin(t * 1.5) * 0.03; legL.x = legR.x = -1.4; head.x = 0.28; head.z = 0.2; armL.z = 0.5; armR.z = -0.5; break;
        case 'play': armL.x = armR.x = -1.3 + Math.sin(t * 22) * 0.12; head.x = Math.sin(t * 4) * 0.06; break;
        case 'present': {
          const k = (t * 0.5 + this.seed) % 6;
          if (k < 1.6) { armR.z = -2.5 + Math.sin(t * 5) * 0.2; head.z = 0.1; }
          else if (k < 3) { armL.x = -1.2; armR.x = -1.2; armL.z = 0.6; armR.z = -0.6; }
          head.y = Math.sin(t * 0.6 + this.seed) * 0.3;
          break;
        }
        default: {
          head.y = Math.sin(t * 0.5 + this.seed) * 0.35;
          head.z = Math.sin(t * 0.8 + this.seed) * 0.05;
          if (this.look.quirk === 'bouncy') y = Math.max(0, Math.sin(t * 3 + this.seed)) * 0.05;
          if (cat && Math.sin(t * 0.4 + this.seed) > 0.6) armR.x = -1.0 + Math.sin(t * 6) * 0.3;   // the raised paw
          if (this.heldId === 'mug') armR.x = -1.6 + Math.max(0, Math.sin(t * 0.7)) * -0.4;
        }
      }
      if (this.carrying) { armL.x = armR.x = -2.9; }
    }
    // antenna wobble (springs from the head)
    if (P.antL && P.antR) {
      P.antL.rotation.x = Math.sin(t * 3 + this.seed) * 0.12 - lean - this.sq * 0.6;
      P.antR.rotation.x = Math.sin(t * 3.3 + this.seed) * 0.12 - lean - this.sq * 0.6;
      P.antL.rotation.z = 0.28 + Math.sin(t * 2.1) * 0.06 + (this.moving ? Math.sin(this.phase * 2) * 0.1 : 0);
      P.antR.rotation.z = -0.28 - Math.sin(t * 2.3) * 0.06 - (this.moving ? Math.sin(this.phase * 2) * 0.1 : 0);
    }
    if (P.tail) P.tail.rotation.y = Math.sin(t * 2.2 + this.seed) * 0.45;
    // cosmetic motion hooks (named by the cosmetics module)
    const prop = P.root.getObjectByName('prop'); if (prop) prop.rotation.y += dt * (a === 'type' || this.moving ? 30 : 8);
    const cape = P.root.getObjectByName('cape'); if (cape) cape.rotation.x = 0.1 + (this.moving ? 0.45 : 0.05) + Math.sin(t * 4) * 0.06;

    const squash = Math.max(-0.35, Math.min(0.35, this.sq));
    P.jelly.position.y = y;
    P.jelly.rotation.x = lean;
    const ss = sy + squash;
    P.jelly.scale.set(1 / Math.sqrt(sy + squash * 0.6), ss, 1 / Math.sqrt(sy + squash * 0.6));
    const sh = 1 - Math.min(0.5, y * 1.2);
    this.shadow.scale.setScalar(sh * (cat ? 1.05 : 1));
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.38 * sh;

    P.setFace(this.currentFace());
  }

  pickables(): THREE.Object3D[] { return [this.parts.root]; }

  dispose() { this.root.removeFromParent(); }
}
