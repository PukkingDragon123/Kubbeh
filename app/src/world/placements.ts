// HQ furniture: renders economy.placements, runs their little behaviours, and drives Edit HQ mode.
import * as THREE from 'three';
import { economy, editMode, placingItem, addPlacement, updatePlacement, removePlacement, unplacedCount } from '../core/state';
import { bus } from '../core/bus';
import type { Placement } from '../core/types';
import { makeModel, type ModelCtx, type PlacedModel } from './models';
import { Grid, cellOf, centerOf, GW, GD } from './grid';
import { ROOM } from './env';
import type { Anim } from './stations';

interface Live { p: Placement; model: PlacedModel; world: THREE.Vector3; cells: number[] }
export interface Hangout { id: string; pos: THREE.Vector3; face: number; anim: Anim; holder?: string; itemId: string }

const footprint = (m: PlacedModel, rot: number) => (rot % 2 ? [m.d, m.w] : [m.w, m.d]);

export class Placements {
  readonly group = new THREE.Group();
  private live = new Map<string, Live>();
  hangouts: Hangout[] = [];
  private gridGroup: THREE.Group;
  private ghost: { itemId: string; model: PlacedModel; rot: number } | null = null;
  private moving: Live | null = null;
  private hoverCell: [number, number] | null = null;
  private lightBudget = 4;
  onChange?: () => void;

  constructor(private grid: Grid, scene: THREE.Scene) {
    scene.add(this.group);
    // edit grid overlay
    this.gridGroup = new THREE.Group();
    const lines: number[] = [];
    for (let x = 0; x <= GW; x++) lines.push(ROOM.x0 + x, 0.02, ROOM.z0, ROOM.x0 + x, 0.02, ROOM.z1);
    for (let z = 0; z <= GD; z++) lines.push(ROOM.x0, 0.02, ROOM.z0 + z, ROOM.x1, 0.02, ROOM.z0 + z);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    this.gridGroup.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x8cf56b, transparent: true, opacity: 0.22 })));
    // blocked cells tint
    const blockedMat = new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.12, depthWrite: false });
    for (let ix = 0; ix < GW; ix++) for (let iz = 0; iz < GD; iz++) {
      if (!grid.stat[grid.idx(ix, iz)] && !grid.reserved[grid.idx(ix, iz)]) continue;
      const q = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), blockedMat); q.rotation.x = -Math.PI / 2; q.position.copy(centerOf(ix, iz)).setY(0.025); this.gridGroup.add(q);
    }
    this.cursor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x8cf56b, transparent: true, opacity: 0.35, depthWrite: false }));
    this.cursor.rotation.x = -Math.PI / 2; this.cursor.position.y = 0.03;
    this.gridGroup.add(this.cursor);
    this.gridGroup.visible = false;
    scene.add(this.gridGroup);
    economy.subscribe(() => this.sync());
    editMode.subscribe((on) => { this.gridGroup.visible = on; if (!on) { this.clearGhost(); this.cancelMove(); } });
    placingItem.subscribe((id) => { this.clearGhost(); if (id && editMode.value) this.makeGhost(id); });
    window.addEventListener('keydown', this.onKey);
  }
  private cursor: THREE.Mesh;

  sync() {
    const want = new Map(economy.value.placements.map((p) => [p.uid, p]));
    let changed = false;
    for (const [uid, l] of this.live) if (!want.has(uid)) { this.group.remove(l.model.group); this.live.delete(uid); changed = true; }
    for (const p of want.values()) {
      const have = this.live.get(p.uid);
      if (have && have.p.x === p.x && have.p.z === p.z && have.p.rot === p.rot) continue;
      if (have) { have.p = p; this.position(have); changed = true; continue; }
      const model = makeModel(p.itemId);
      model.group.userData.placementUid = p.uid;
      const l: Live = { p, model, world: new THREE.Vector3(), cells: [] };
      model.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = true; } });
      this.group.add(model.group);
      this.position(l);
      this.live.set(p.uid, l);
      // little drop-in bounce
      model.group.scale.setScalar(0.01);
      changed = true;
    }
    if (changed) this.rebuild();
  }

  private position(l: Live) {
    const [w, d] = footprint(l.model, l.p.rot);
    const x = ROOM.x0 + l.p.x + w / 2, z = ROOM.z0 + l.p.z + d / 2;
    l.world.set(x, 0, z);
    l.model.group.position.set(x, 0, z);
    l.model.group.rotation.y = -l.p.rot * (Math.PI / 2);
  }

  private rebuild() {
    this.grid.dyn.fill(0);
    this.hangouts = [];
    let lights = 0;
    for (const l of this.live.values()) {
      const [w, d] = footprint(l.model, l.p.rot);
      l.cells = [];
      for (let a = 0; a < w; a++) for (let b = 0; b < d; b++) { const k = this.grid.idx(l.p.x + a, l.p.z + b); l.cells.push(k); if (!l.model.walkable) this.grid.dyn[k] = 1; }
      if (l.model.light) l.model.light.visible = lights++ < this.lightBudget;
      for (const [i, h] of (l.model.hang ?? []).entries()) {
        const local = new THREE.Vector3(h.x, 0, h.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), l.model.group.rotation.y);
        this.hangouts.push({ id: `${l.p.uid}:${i}`, pos: l.world.clone().add(local), face: h.face + l.model.group.rotation.y, anim: h.anim, itemId: l.p.itemId });
      }
    }
    this.onChange?.();
  }

  /** Which placement (if any) an object belongs to. */
  placementOf(o: THREE.Object3D | null): Live | null {
    while (o) { const uid = o.userData.placementUid; if (uid) return this.live.get(uid) ?? null; o = o.parent; }
    return null;
  }
  pickables() { return [...this.live.values()].map((l) => l.model.group); }

  update(dt: number, t: number, ctx: ModelCtx) {
    for (const l of this.live.values()) {
      const s = l.model.group.scale.x;
      if (s < 1) l.model.group.scale.setScalar(Math.min(1, s + dt * 4 + (1 - s) * dt * 6));
      l.model.update?.(dt, t, ctx, l.world);
    }
    if (this.ghost) this.ghost.model.update?.(dt, t, ctx, this.ghost.model.group.position);
  }

  click(o: THREE.Object3D | null, ctx: ModelCtx): boolean {
    const l = this.placementOf(o);
    if (!l) return false;
    if (l.model.click) l.model.click(ctx, l.world);
    return true;
  }
  panelOf(o: THREE.Object3D | null) { return this.placementOf(o)?.model.panel; }
  centerOfItem(itemId: string) { for (const l of this.live.values()) if (l.p.itemId === itemId) return l.world.clone(); return null; }

  // ── edit mode ──────────────────────────────────────────────────────────────
  private makeGhost(itemId: string) {
    const model = makeModel(itemId);
    model.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) { const mt = (mesh.material as THREE.Material).clone(); mt.transparent = true; (mt as THREE.MeshStandardMaterial).opacity = 0.55; mt.depthWrite = false; mesh.material = mt; mesh.castShadow = false; }
    });
    this.ghost = { itemId, model, rot: 0 };
    this.group.add(model.group);
    model.group.visible = false;
  }
  private clearGhost() { if (this.ghost) { this.group.remove(this.ghost.model.group); this.ghost = null; } }
  private cancelMove() { if (this.moving) { this.moving.model.group.visible = true; this.moving = null; } }

  /** Pointer moved over the floor in edit mode. */
  hover(floor: THREE.Vector3 | null) {
    if (!editMode.value) return;
    if (!floor) { this.hoverCell = null; this.cursor.visible = false; if (this.ghost) this.ghost.model.group.visible = false; return; }
    const [w, d] = this.ghost ? footprint(this.ghost.model, this.ghost.rot) : this.moving ? footprint(this.moving.model, this.moving.p.rot) : [1, 1];
    const [cx, cz] = cellOf(floor.x - (w - 1) / 2, floor.z - (d - 1) / 2);
    this.hoverCell = [cx, cz];
    const ok = this.grid.canPlace(cx, cz, w, d, this.moving ? new Set(this.moving.cells) : undefined);
    this.cursor.visible = true;
    this.cursor.scale.set(w, d, 1);
    this.cursor.position.set(ROOM.x0 + cx + w / 2, 0.03, ROOM.z0 + cz + d / 2);
    (this.cursor.material as THREE.MeshBasicMaterial).color.setHex(ok ? 0x8cf56b : 0xff5a5a);
    const g = this.ghost ?? (this.moving ? { model: this.moving.model, rot: this.moving.p.rot } : null);
    if (g) {
      g.model.group.visible = true;
      g.model.group.position.set(ROOM.x0 + cx + w / 2, 0, ROOM.z0 + cz + d / 2);
      g.model.group.rotation.y = -g.rot * (Math.PI / 2);
    }
  }

  /** Click in edit mode. Returns true if consumed. */
  editClick(o: THREE.Object3D | null): boolean {
    if (!editMode.value) return false;
    const cell = this.hoverCell;
    if (this.ghost && cell) {
      const [w, d] = footprint(this.ghost.model, this.ghost.rot);
      if (!this.grid.canPlace(cell[0], cell[1], w, d)) { bus.emit('sfx', { name: 'error', volume: 0.4 }); return true; }
      addPlacement(this.ghost.itemId, cell[0], cell[1], this.ghost.rot);
      bus.emit('sfx', { name: 'plop', volume: 0.7 });
      const id = this.ghost.itemId;
      if (unplacedCount(id) <= 0) placingItem.value = null;
      else { const rot = this.ghost.rot; this.clearGhost(); this.makeGhost(id); this.ghost!.rot = rot; }
      return true;
    }
    if (this.moving && cell) {
      const [w, d] = footprint(this.moving.model, this.moving.p.rot);
      if (!this.grid.canPlace(cell[0], cell[1], w, d, new Set(this.moving.cells))) { bus.emit('sfx', { name: 'error', volume: 0.4 }); return true; }
      const mv = this.moving; this.moving = null; mv.model.group.visible = true;
      updatePlacement(mv.p.uid, { x: cell[0], z: cell[1], rot: mv.p.rot });
      bus.emit('sfx', { name: 'plop2', volume: 0.7 });
      return true;
    }
    const l = this.placementOf(o);
    if (l) { this.moving = l; bus.emit('sfx', { name: 'boing', volume: 0.5 }); return true; }
    return false;
  }

  rotate() {
    if (this.ghost) { this.ghost.rot = (this.ghost.rot + 1) % 4; bus.emit('sfx', { name: 'tick', volume: 0.5 }); }
    else if (this.moving) { this.moving.p = { ...this.moving.p, rot: (this.moving.p.rot + 1) % 4 }; bus.emit('sfx', { name: 'tick', volume: 0.5 }); }
  }

  removeSelected() {
    if (this.moving) { const uid = this.moving.p.uid; this.moving = null; removePlacement(uid); bus.emit('sfx', { name: 'paper', volume: 0.6 }); bus.emit('ui:toast', { text: 'Packed it back into your inventory', tone: 'info' }); }
  }

  private onKey = (e: KeyboardEvent) => {
    if (!editMode.value) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.key === 'r' || e.key === 'R') { this.rotate(); e.preventDefault(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { this.removeSelected(); e.preventDefault(); }
    else if (e.key === 'Escape') { if (this.moving) { this.cancelMove(); } else if (placingItem.value) placingItem.value = null; else editMode.value = false; e.stopPropagation(); }
  };

  get state() { return { moving: !!this.moving, ghost: this.ghost?.itemId ?? null }; }
}
