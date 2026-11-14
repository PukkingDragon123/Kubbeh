// Crew controller: turns `crew` (what each alien is doing, from real Claude activity) into
// walking, station work, carrying files, cloning, celebrating and idle shenanigans.
import * as THREE from 'three';
import { crew, looks } from '../core/state';
import { speakerId, LEAD, PROFESSOR } from '../core/crew';
import { bus } from '../core/bus';
import type { ActivityKind, AlienLook, CrewMember } from '../core/types';
import { Alien, type HandItem } from './alien';
import type { Grid } from './grid';
import type { Particles } from './particles';
import type { Spot, Anim, Station } from './stations';
import type { Placements, Hangout } from './placements';

interface Ent {
  id: string;
  alien: Alien;
  member: CrewMember;
  key: string;           // current behaviour key
  spot: Spot | Hangout | null;
  arriveAnim: Anim;
  idleT: number;
  fxT: number;
  courier?: { leg: 'toPc' | 'toCab'; trips: number };
  override?: { activity: ActivityKind; until: number };
  leaving?: number;
  arrived: boolean;
}

const GLORP_SPOT = new THREE.Vector3(-6.2, 0, 3.15);
const QUESTION_SPOTS = [new THREE.Vector3(0, 0, 5.6), new THREE.Vector3(-1.4, 0, 5.4), new THREE.Vector3(1.4, 0, 5.4)];

export class CrewController {
  ents = new Map<string, Ent>();
  private spots: Spot[];
  private night = false;
  constructor(
    private scene: THREE.Scene,
    private grid: Grid,
    private fx: Particles,
    private stations: { list: Station[]; vat: Station & { spawnPoint: THREE.Vector3; flash(): void }; bench: Station & { zap(): void }; byId: Map<string, Station> },
    private placements: Placements,
  ) {
    this.spots = stations.list.flatMap((s) => s.spots);
    crew.subscribe(() => this.sync());
    looks.subscribe((ls) => { for (const e of this.ents.values()) { const l = this.lookFor(e.member, ls); if (l) e.alien.setLook(l); } });
    bus.on('file:written', () => {
      const z = this.ents.get('zib') ?? [...this.ents.values()].find((e) => e.member.role === 'staff');
      if (z && (z.member.activity === 'idle' || z.override)) z.override = { activity: 'files', until: performance.now() + 7000 };
    });
    const h = new Date().getHours(); this.night = h >= 22 || h < 6;
  }

  private lookFor(m: CrewMember, ls: AlienLook[] = looks.value) { return ls.find((l) => l.id === (m.lookId ?? m.id)) ?? ls.find((l) => l.id === LEAD) ?? ls[0]; }

  sync() {
    const want = new Map(crew.value.map((m) => [m.id, m]));
    for (const [id, e] of this.ents) if (!want.has(id) && e.leaving === undefined) {
      e.leaving = 0.35; this.release(e);
      this.fx.poof(e.alien.position.clone().setY(0.5), '#c8ffb0', 18);
      bus.emit('sfx', { name: 'plop2', volume: 0.5 });
    }
    for (const m of want.values()) {
      const have = this.ents.get(m.id);
      if (have) { have.member = m; continue; }
      const look = this.lookFor(m);
      if (!look) continue;
      const alien = new Alien(look, { clone: m.role === 'clone' });
      alien.night = this.night;
      alien.scaleK = m.role === 'clone' ? 1.05 : 1.3; alien.root.scale.setScalar(m.role === 'clone' ? 0.01 : 1.3);
      const e: Ent = { id: m.id, alien, member: m, key: '', spot: null, arriveAnim: 'idle', idleT: Math.random() * 3, fxT: 0, arrived: true };
      alien.onImpact = () => this.impact(e);
      // start positions
      if (m.role === 'clone') { alien.position.copy(this.stations.vat.spawnPoint); this.stations.vat.flash(); bus.emit('sfx', { name: 'portal', volume: 0.6 }); }
      else if (m.id === PROFESSOR) alien.position.copy(GLORP_SPOT);
      else { const [ix, iz] = this.grid.randomFree(); alien.position.set(ix - 12 + 0.5, 0, iz - 8 + 0.5); }
      alien.heading = alien.targetHeading = Math.random() * Math.PI * 2 - Math.PI;
      this.scene.add(alien.root);
      this.ents.set(m.id, e);
    }
  }

  private release(e: Ent) { if (e.spot && e.spot.holder === e.id) e.spot.holder = undefined; e.spot = null; }

  private claim(e: Ent, pred: (s: Spot) => boolean): Spot | null {
    const mine = e.spot && 'station' in e.spot && pred(e.spot as Spot) ? (e.spot as Spot) : null;
    if (mine) return mine;
    const free = this.spots.filter((s) => pred(s) && (!s.holder || s.holder === e.id));
    if (!free.length) return null;
    free.sort((a, b) => a.pos.distanceTo(e.alien.position) - b.pos.distanceTo(e.alien.position));
    this.release(e);
    free[0].holder = e.id; e.spot = free[0];
    return free[0];
  }

  private goTo(e: Ent, pos: THREE.Vector3, face: number, anim: Anim, speed = 1.7) {
    e.alien.path = this.grid.path(e.alien.position, pos);
    e.alien.speed = speed;
    e.arriveAnim = anim;
    e.alien.anim = 'idle';
    e.arrived = false;
    (e.alien as any)._face = face;
  }

  private impact(e: Ent) {
    const p = e.alien.position;
    if (e.alien.anim === 'whack') { this.stations.bench.zap(); if (Math.random() < 0.25) bus.emit('sfx', { name: 'zap', volume: 0.15, rate: 1.2 }); }
    else this.fx.emit({ tile: ['spark', 'dust'], pos: [p.x + Math.sin(e.alien.heading) * 0.5, 0.8, p.z + Math.cos(e.alien.heading) * 0.5], count: 5, vel: [0, 1.2, 0], spread: [1, 0.6, 1], gravity: 5, life: 0.4, size: 0.1, color: ['#ffe27a', '#ffffff'], additive: true });
  }

  private activityOf(e: Ent): ActivityKind {
    if (e.override && performance.now() < e.override.until && (e.member.activity === 'idle' || e.member.activity === 'celebrating')) return e.override.activity;
    e.override = undefined;
    return e.member.activity;
  }

  /** Decide what an alien should be doing; (re)plan only when the behaviour changes. */
  private plan(e: Ent) {
    const act = this.activityOf(e);
    const isProf = e.id === PROFESSOR;
    let key = act + (act === 'question' ? (speakerId.value === e.id ? ':speak' : ':q') : '');
    if (act === 'files') { if (!e.courier) e.courier = { leg: 'toPc', trips: 0 }; key = `files:${e.courier.leg}:${e.courier.trips}`; } else e.courier = undefined;
    if (key === e.key) return;
    e.key = key;
    const a = e.alien;
    a.setCarry(false); a.hold(null);
    switch (act) {
      case 'question': {
        this.release(e);
        const taken = [...this.ents.values()].filter((x) => x !== e && x.key.startsWith('question')).length;
        const p = QUESTION_SPOTS[Math.min(taken, QUESTION_SPOTS.length - 1)];
        this.goTo(e, p, 0, 'wave', 3.4);
        bus.emit('sfx', { name: 'boing', volume: 0.5, rate: 1.2 });
        break;
      }
      case 'thinking': case 'writing': case 'coding': {
        if (isProf) { this.release(e); this.goTo(e, GLORP_SPOT.clone(), 0, act === 'thinking' ? 'think' : 'present'); break; }
        const s = this.claim(e, (sp) => sp.station === 'computer') ?? this.claim(e, (sp) => sp.station === 'workbench');
        if (s) this.goTo(e, s.pos, s.face, act === 'thinking' ? 'think' : 'type'); else this.wander(e, 'think');
        break;
      }
      case 'research': {
        const s = this.claim(e, (sp) => sp.station === 'research');
        if (s) { this.goTo(e, s.pos, s.face, 'research'); a.hold('magnifier'); } else this.wander(e, 'research');
        break;
      }
      case 'files': {
        this.release(e);
        const pc = this.stations.byId.get('computer')!.spots[2].pos.clone().add(new THREE.Vector3(1.0, 0, 0.6));
        const cab = this.stations.byId.get('cabinet')!.spots[0];
        if (e.courier!.leg === 'toPc') this.goTo(e, pc, Math.PI, 'idle', 2.1);
        else { a.setCarry(true); this.goTo(e, cab.pos, cab.face, 'idle', 2.1); }
        break;
      }
      case 'bugfix': { const s = this.claim(e, (sp) => sp.id === 'wb1') ?? this.claim(e, (sp) => sp.station === 'workbench'); if (s) { this.goTo(e, s.pos, s.face, 'whack'); a.hold('wrench'); } else this.wander(e, 'think'); break; }
      case 'building': { const s = this.claim(e, (sp) => sp.id === 'wb0') ?? this.claim(e, (sp) => sp.station === 'workbench'); if (s) { this.goTo(e, s.pos, s.face, 'hammer'); a.hold('hammer'); } else this.wander(e, 'think'); break; }
      case 'planning': {
        if (isProf) { this.goTo(e, GLORP_SPOT.clone(), 0, 'present'); break; }
        const s = this.claim(e, (sp) => sp.station === 'whiteboard');
        if (s) { this.goTo(e, s.pos, s.face, 'scribble'); a.hold('chalk'); } else { const c = this.claim(e, (sp) => sp.station === 'computer'); if (c) this.goTo(e, c.pos, c.face, 'think'); }
        break;
      }
      case 'cloning': { const s = this.claim(e, (sp) => sp.station === 'vat'); if (s) this.goTo(e, s.pos, s.face, 'vat', 2.4); break; }
      case 'celebrating': {
        a.path = []; a.anim = 'jump'; e.arriveAnim = 'jump'; e.arrived = true;
        this.fx.burst(a.position.clone().setY(1.1));
        break;
      }
      case 'sleeping': { const h = this.freeHangout(e, (x) => x.anim === 'sit' || x.anim === 'sleep'); if (h) this.goTo(e, h.pos, h.face, 'sleep'); else { a.path = []; a.anim = 'sleep'; e.arriveAnim = 'sleep'; e.arrived = true; } break; }
      default: {
        this.release(e);
        if (isProf) { this.goTo(e, GLORP_SPOT.clone(), 0, 'present'); break; }
        e.idleT = 0.5 + Math.random() * 2;
        a.anim = 'idle'; e.arriveAnim = 'idle'; e.arrived = true;
      }
    }
  }

  private freeHangout(e: Ent, pred: (h: Hangout) => boolean): Hangout | null {
    const list = this.placements.hangouts.filter((h) => pred(h) && (!h.holder || h.holder === e.id));
    if (!list.length) return null;
    const h = list[Math.floor(Math.random() * list.length)];
    this.release(e); h.holder = e.id; e.spot = h;
    return h;
  }

  private wander(e: Ent, anim: Anim = 'idle') {
    const [ix, iz] = this.grid.randomFree(Math.random, 0.35);
    this.goTo(e, new THREE.Vector3(ix - 12 + 0.5 + (Math.random() - 0.5) * 0.4, 0, iz - 8 + 0.5 + (Math.random() - 0.5) * 0.4), Math.random() * 6, anim);
  }

  /** Idle shenanigans when nobody needs this alien. */
  private idleTick(e: Ent, dt: number) {
    if (e.id === PROFESSOR) return;
    e.idleT -= dt;
    if (e.idleT > 0 || e.alien.path.length) return;
    e.idleT = 6 + Math.random() * 9;
    const a = e.alien;
    a.hold(null);
    const r = Math.random();
    const q = a.look.quirk;
    if (r < 0.32) { const h = this.freeHangout(e, () => true); if (h) { this.goTo(e, h.pos, h.face, h.anim); return; } }
    this.release(e);
    if (r < 0.55) { this.wander(e); }
    else if (r < 0.7) { this.wander(e); a.hold('mug'); }
    else if (r < 0.8 && q === 'sleepy') { a.anim = 'sleep'; e.arriveAnim = 'sleep'; }
    else if (r < 0.9) { // visit a friend
      const other = [...this.ents.values()].filter((x) => x !== e)[Math.floor(Math.random() * Math.max(1, this.ents.size - 1))];
      if (other) { const p = other.alien.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, 0.9)); this.goTo(e, p, 0, 'wave'); }
    } else { a.anim = q === 'chaotic' || q === 'bouncy' ? 'jump' : 'idle'; e.arriveAnim = a.anim; setTimeout(() => { if (e.key === 'idle') { a.anim = 'idle'; e.arriveAnim = 'idle'; } }, 1800); }
  }

  update(dt: number, t: number, camera: THREE.Camera) {
    for (const [id, e] of this.ents) {
      if (e.leaving !== undefined) {
        e.leaving -= dt;
        e.alien.root.scale.setScalar(Math.max(0.01, e.alien.scaleK * (e.leaving / 0.35)));
        if (e.leaving <= 0) { e.alien.dispose(); this.ents.delete(id); }
        continue;
      }
      this.plan(e);
      const a = e.alien;
      // grow-in for clones
      if (a.root.scale.x < a.scaleK) a.root.scale.setScalar(Math.min(a.scaleK, a.root.scale.x + dt * 2.5));
      a.update(dt, t);
      if (!e.arrived && !a.path.length) {
        e.arrived = true;
        // arrived
        a.anim = e.arriveAnim;
        const f = (a as any)._face;
        if (typeof f === 'number') a.targetHeading = f;
        if (e.key.startsWith('files') && e.courier) {
          if (e.courier.leg === 'toPc') { e.courier.leg = 'toCab'; }
          else { e.courier.leg = 'toPc'; e.courier.trips++; a.setCarry(false); this.fx.emit({ tile: 'file', pos: [a.position.x, 1.3, a.position.z], count: 3, vel: [0, 1, 0], spread: [0.6, 0.4, 0.6], life: 0.9, size: 0.18, color: ['#ffe27a', '#ffffff'] }); bus.emit('sfx', { name: 'paper', volume: 0.25 }); }
        }
        if (e.key.startsWith('question')) { a.targetHeading = Math.atan2(camera.position.x - a.position.x, camera.position.z - a.position.z); a.poke(0.8); }
      }
      if (e.key === 'idle' || e.key === '') this.idleTick(e, dt);
      // activity particles
      e.fxT -= dt;
      if (e.fxT <= 0) {
        e.fxT = 0.9 + Math.random() * 0.6;
        const top = a.position.clone().setY(1.45 * a.scaleK);
        const act = this.activityOf(e);
        if (act === 'thinking') this.fx.emit({ tile: Math.random() < 0.5 ? 'question' : 'sparkle', pos: top, vel: [0, 0.5, 0], spread: [0.2, 0.1, 0.2], life: 1.2, size: 0.22, color: '#ffe27a', additive: true });
        else if (act === 'question' && !a.moving) this.fx.emit({ tile: 'bang', pos: top.setY(top.y + 0.1), vel: [0, 0.4, 0], life: 0.9, size: 0.3, color: '#ff6fd6', additive: true });
        else if ((act === 'coding' || act === 'writing') && !a.moving) this.fx.emit({ tile: ['code1', 'code2', 'code3', 'code4'], pos: top, vel: [0, 0.6, 0], spread: [0.3, 0.2, 0.3], life: 1.1, size: 0.16, color: ['#9dff8a', '#52f2ff'], additive: true });
        else if (act === 'research' && !a.moving) this.fx.emit({ tile: ['eye', 'sparkle'], pos: top, vel: [0, 0.5, 0], spread: [0.3, 0.1, 0.3], life: 1, size: 0.16, color: '#52f2ff', additive: true });
        else if (a.anim === 'sleep') this.fx.emit({ tile: 'zzz', pos: top, vel: [0.2, 0.45, 0], life: 1.8, size: 0.24, color: '#c8d8ff', wobble: 0.4 });
        else if (a.anim === 'jump') this.fx.emit({ tile: ['star', 'heart', 'sparkle'], pos: top, count: 3, vel: [0, 1.2, 0], spread: [0.8, 0.4, 0.8], gravity: 2, life: 0.9, size: 0.16, color: ['#ffe27a', '#ff6fd6', '#8cf56b'], additive: true });
        else if (a.anim === 'vat') this.fx.emit({ tile: ['glob', 'bubble'], pos: top, vel: [0, 0.6, 0], spread: [0.4, 0.2, 0.4], life: 1.1, size: 0.16, color: '#8cf56b', additive: true });
        else if (a.anim === 'play') this.fx.emit({ tile: ['star', 'coin'], pos: top, vel: [0, 0.6, 0], spread: [0.3, 0.2, 0.3], life: 0.9, size: 0.14, color: '#ffe27a', additive: true });
      }
    }
  }

  /** Busy aliens with a label, for name tags. */
  tags(): { id: string; name: string; label: string; pos: THREE.Vector3; busy: boolean }[] {
    const out: { id: string; name: string; label: string; pos: THREE.Vector3; busy: boolean }[] = [];
    const v = new THREE.Vector3();
    for (const e of this.ents.values()) {
      if (e.leaving !== undefined) continue;
      const busy = e.member.activity !== 'idle' && e.member.activity !== 'sleeping';
      out.push({ id: e.id, name: e.member.name, label: e.member.label, pos: e.alien.headTop(v).clone(), busy });
    }
    return out;
  }

  alienOf(o: THREE.Object3D | null): Ent | null {
    while (o) { const al = o.userData.alien as Alien | undefined; if (al) { for (const e of this.ents.values()) if (e.alien === al) return e; } o = o.parent; }
    return null;
  }
  pickables() { return [...this.ents.values()].map((e) => e.alien.root); }
  get(id: string) { return this.ents.get(id) ?? null; }
}
