// Floor grid: occupancy for pathfinding + placement, and an 8-way A* for the hop-walkers.
import * as THREE from 'three';
import { ROOM } from './env';

export const GW = ROOM.x1 - ROOM.x0; // 24
export const GD = ROOM.z1 - ROOM.z0; // 16

export const cellOf = (x: number, z: number): [number, number] => [Math.floor(x) - ROOM.x0, Math.floor(z) - ROOM.z0];
export const centerOf = (ix: number, iz: number) => new THREE.Vector3(ix + ROOM.x0 + 0.5, 0, iz + ROOM.z0 + 0.5);
export const inGrid = (ix: number, iz: number) => ix >= 0 && iz >= 0 && ix < GW && iz < GD;

export class Grid {
  /** static blockers (stations) */
  stat = new Uint8Array(GW * GD);
  /** dynamic blockers (placements) */
  dyn = new Uint8Array(GW * GD);
  /** cells reserved by stations — placements can't go here (includes stations' work spots) */
  reserved = new Uint8Array(GW * GD);

  idx(ix: number, iz: number) { return iz * GW + ix; }
  blocked(ix: number, iz: number) { return !inGrid(ix, iz) || this.stat[this.idx(ix, iz)] === 1 || this.dyn[this.idx(ix, iz)] === 1; }

  blockRect(r: [number, number, number, number], into: Uint8Array = this.stat) {
    const [x0, z0, x1, z1] = r;
    for (let ix = 0; ix < GW; ix++) for (let iz = 0; iz < GD; iz++) {
      const cx0 = ix + ROOM.x0, cz0 = iz + ROOM.z0;
      if (cx0 + 1 > x0 + 0.05 && cx0 < x1 - 0.05 && cz0 + 1 > z0 + 0.05 && cz0 < z1 - 0.05) into[this.idx(ix, iz)] = 1;
    }
  }

  reserve(x: number, z: number) { const [ix, iz] = cellOf(x, z); if (inGrid(ix, iz)) this.reserved[this.idx(ix, iz)] = 1; }

  canPlace(ix: number, iz: number, w: number, d: number, ignore?: Set<number>) {
    for (let a = 0; a < w; a++) for (let b = 0; b < d; b++) {
      const x = ix + a, z = iz + b;
      if (!inGrid(x, z)) return false;
      const k = this.idx(x, z);
      if (this.stat[k] || this.reserved[k]) return false;
      if (this.dyn[k] && !ignore?.has(k)) return false;
    }
    return true;
  }

  nearestFree(ix: number, iz: number): [number, number] {
    if (!this.blocked(ix, iz)) return [ix, iz];
    for (let r = 1; r < 8; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
      if (!this.blocked(ix + a, iz + b)) return [ix + a, iz + b];
    }
    return [ix, iz];
  }

  randomFree(rand = Math.random, frontBias = 0): [number, number] {
    for (let i = 0; i < 60; i++) {
      const ix = 1 + Math.floor(rand() * (GW - 2));
      const iz = Math.min(GD - 1, 2 + Math.floor(Math.pow(rand(), 1 - frontBias) * (GD - 2)));
      if (!this.blocked(ix, iz)) return [ix, iz];
    }
    return [12, 12];
  }

  /** A* from world pos to world pos; returns world waypoints (ends exactly at `to`). */
  path(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    let [sx, sz] = cellOf(from.x, from.z);
    let [gx, gz] = cellOf(to.x, to.z);
    sx = Math.max(0, Math.min(GW - 1, sx)); sz = Math.max(0, Math.min(GD - 1, sz));
    [gx, gz] = this.nearestFree(Math.max(0, Math.min(GW - 1, gx)), Math.max(0, Math.min(GD - 1, gz)));
    if (sx === gx && sz === gz) return [to.clone()];
    const N = GW * GD;
    const g = new Float32Array(N).fill(Infinity), f = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1);
    const open: number[] = [];
    const s = this.idx(sx, sz), goal = this.idx(gx, gz);
    g[s] = 0; f[s] = Math.hypot(gx - sx, gz - sz); open.push(s);
    const closed = new Uint8Array(N);
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi]; open.splice(bi, 1);
      if (cur === goal) break;
      closed[cur] = 1;
      const cx = cur % GW, cz = Math.floor(cur / GW);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (!inGrid(nx, nz)) continue;
        const n = this.idx(nx, nz);
        if (closed[n] || (this.blocked(nx, nz) && n !== goal)) continue;
        if (dx && dz && (this.blocked(cx + dx, cz) || this.blocked(cx, cz + dz))) continue;
        const ng = g[cur] + (dx && dz ? 1.414 : 1);
        if (ng < g[n]) { g[n] = ng; f[n] = ng + Math.hypot(gx - nx, gz - nz); came[n] = cur; if (!open.includes(n)) open.push(n); }
      }
    }
    if (came[goal] === -1) return [to.clone()];
    const cells: number[] = [];
    for (let c = goal; c !== -1 && c !== s; c = came[c]) cells.push(c);
    cells.reverse();
    // string-pull: drop collinear points
    const pts: THREE.Vector3[] = [];
    let lastDir = '';
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i], p = cells[i - 1] ?? s;
      const dir = `${(c % GW) - (p % GW)},${Math.floor(c / GW) - Math.floor(p / GW)}`;
      if (dir === lastDir && pts.length) pts[pts.length - 1] = centerOf(c % GW, Math.floor(c / GW));
      else pts.push(centerOf(c % GW, Math.floor(c / GW)));
      lastDir = dir;
    }
    pts.push(to.clone());
    return pts;
  }
}
