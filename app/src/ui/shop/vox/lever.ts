// The slot machine's 3D lever: a riveted housing, a chrome rod on a pivot, a red jelly knob.
import * as THREE from 'three';
import { M, S, VoxGrid, hash3, mix, shade } from '../../../vox/core';
import { toObject } from '../../../vox/mesh';
import { framed } from './models';

let proto: { housing: THREE.Object3D; rod: THREE.Object3D } | null = null;

export function buildLever(): THREE.Group & { userData: { rod: THREE.Object3D } } {
  if (!proto) {
    const h = VoxGrid.span([-8, -10, -8], [8, 8, 8], 1.25);
    h.add(S.box([-7, -9, -7], [7, 6, 7], 2), (x, y, z) => shade(0x4a525e, 0.9 + hash3(x | 0, y | 0, z | 0) * 0.12 + (y > 3 ? 0.12 : 0)), M.metal);
    h.add(S.box([-5, -7, 6], [5, 4, 7.6], 0.6), 0x2b3038, M.metal);
    for (const [x, y] of [[-5, 4], [5, 4], [-5, -7], [5, -7]]) h.add(S.sphere([x, y, 7.2], 0.9), 0xb8c4cf, M.metal);
    h.add(S.disc([0, 0, 7.4], [0, 0, 1], 3.2, 1), 0xd8325a, M.glow);
    const r = VoxGrid.span([-6, -2, -6], [6, 58, 6], 1.25);
    r.add(S.capsule([0, 0, 0], [0, 46, 0], 1.7, 1.4), (_x, y) => mix(0x8a96a0, 0xf2f6f8, 0.5 + Math.sin(y * 0.5) * 0.15), M.metal);
    r.add(S.sphere([0, 50, 0], 5.6), (x, y, z) => (x < -1.5 && y > 51.5 && z > 0 ? 0xffb8c8 : mix(0xb01535, 0xff3a5a, (y - 44) / 12)), M.jelly);
    r.add(S.disc([0, 0, 0], [1, 0, 0], 3.2, 2.6), 0x6b7680, M.metal);
    proto = { housing: toObject(h, { size: 0.03, outline: 0x0b0e12 }), rod: toObject(r, { size: 0.03, outline: 0x2a0610 }) };
  }
  const g = new THREE.Group();
  const housing = proto.housing.clone(true);
  const pivot = new THREE.Group();
  pivot.add(proto.rod.clone(true));
  pivot.position.set(0, 0, 0.12);
  g.add(housing, pivot);
  const f = framed(g, 1.0) as any;
  f.userData.rod = pivot;
  return f;
}
