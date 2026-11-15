// Voxel models for the shop-side panels: rarity pedestals, item / cosmetic / skin /
// expression thumbnails, achievement medals, station buttons. Everything the UI shows as
// "art" is a real voxel object photographed by the studio (src/vox/studio.ts).
import * as THREE from 'three';
import { M, S, VoxGrid, hash3, mix, shade } from '../../../vox/core';
import { toObject } from '../../../vox/mesh';
import { buildItemModel } from '../../../vox/props/items';
import { buildCosmetic } from '../../../vox/cosmetics';
import { buildAlien, type Face } from '../../../vox/alien';
import { catalogById } from '../../../economy/catalog';
import { DEFAULT_LOOKS, looks } from '../../../core/state';
import type { AlienLook, CatalogItem } from '../../../core/types';
import { buildGlyph, type GlyphName } from './glyphs';

export const RARITY_COLOR: Record<CatalogItem['rarity'], number> = { common: 0x7fe08a, rare: 0x52f2ff, epic: 0xff6fd6, legendary: 0xffbe3d };

/** Does this object contain any drawable mesh? (contract stubs return empty groups) */
export function hasMesh(o: THREE.Object3D) {
  let found = false;
  o.traverse((c) => { if (!found && (c as THREE.Mesh).isMesh && (c as THREE.Mesh).geometry?.attributes?.position?.count) found = true; });
  return found;
}

/**
 * Wrap an object so the studio frames it the same way at every rotation: an invisible
 * sphere around its bounds dominates the bounding box, so hover spins never "breathe".
 */
export function framed(obj: THREE.Object3D, pad = 1.02): THREE.Group {
  const g = new THREE.Group();
  g.add(obj);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, true);
  const center = box.getCenter(new THREE.Vector3());
  // tight radius: farthest vertex from the centre (outline shells excluded)
  let r2 = 0;
  const v = new THREE.Vector3();
  obj.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh || m.userData.outline || !m.geometry?.attributes?.position) return;
    const pos = m.geometry.attributes.position as THREE.BufferAttribute;
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); r2 = Math.max(r2, v.distanceToSquared(center)); }
  });
  const r = Math.max(0.001, Math.sqrt(r2) * pad);
  const guard = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), new THREE.MeshBasicMaterial({ visible: false }));
  guard.position.copy(center);
  guard.userData.guard = true;
  g.add(guard);
  g.userData.center = center.clone();
  g.userData.radius = r;
  return g;
}

/** The studio frames by the bounding box's diagonal; a guard sphere's box diagonal is r·√3. */
export const FRAME_COMP = Math.sqrt(3);

// ── pedestal ─────────────────────────────────────────────────────────────────
const pedCache = new Map<string, THREE.Object3D>();
/** A riveted hex pedestal with a glowing rarity ring. Top surface at y = 0, ~1 unit wide. */
export function pedestal(rarity: CatalogItem['rarity']): THREE.Object3D {
  let p = pedCache.get(rarity);
  if (!p) {
    const glow = RARITY_COLOR[rarity];
    const v = VoxGrid.span([-14, -7, -14], [14, 1, 14], 1.25);
    v.add(S.disc([0, -4, 0], [0, 1, 0], 13, 3, 6, Math.PI / 6), (x, y, z) => {
      const rim = Math.hypot(x, z) > 11.4;
      const base = rim ? 0x3c4a46 : 0x2b3632;
      return shade(base, 0.92 + hash3(x | 0, y | 0, z | 0) * 0.1 + (y > -2 ? 0.12 : 0));
    }, M.metal);
    v.add(S.torus([0, -1.6, 0], [0, 1, 0], 11.2, 0.9), glow, M.glow);
    v.add(S.disc([0, -0.6, 0], [0, 1, 0], 9.6, 0.6, 6, Math.PI / 6), (x, y, z) => mix(0x1a2420, 0x24302b, hash3(x | 0, 0, z | 0)), M.metal);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; v.add(S.sphere([Math.cos(a) * 12, -4, Math.sin(a) * 12], 1), 0xa8b4bc, M.metal); }
    if (rarity === 'legendary' || rarity === 'epic') for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; v.add(S.sphere([Math.cos(a) * 12.6, -6.3, Math.sin(a) * 12.6], 0.7), glow, M.glow); }
    p = toObject(v, { size: 0.04, name: 'pedestal' });
    // the grid's top is y=1 → place top at 0
    p.position.y = -0.04;
    pedCache.set(rarity, p);
  }
  return p.clone(true);
}

// ── fallback (while other workers' models land) ─────────────────────────────
const crateCache = new Map<string, THREE.Object3D>();
function crate(id: string, color: number): THREE.Object3D {
  let c = crateCache.get(id);
  if (!c) {
    const v = VoxGrid.span([-10, 0, -10], [10, 20, 10], 1);
    v.add(S.box([-9, 0, -9], [9, 18, 9], 1.5), (x, y, z) => {
      const edge = Math.abs(x) > 7 || Math.abs(z) > 7 || y > 16 || y < 2;
      return edge ? shade(0x8a6a3e, 0.9 + hash3(x | 0, y | 0, z | 0) * 0.15) : shade(0xb8925a, 0.92 + hash3(x | 0, y | 0, z | 0) * 0.12);
    }, M.solid);
    v.add(S.box([-5, 5, 8.5], [5, 13, 9.8], 0.5), color, M.glow);
    c = toObject(v, { size: 0.045, anchor: 'bottom', outline: 0x1a120a });
    crateCache.set(id, c);
  }
  return c.clone(true);
}

// ── alien previews (skins & expressions) ─────────────────────────────────────
function baseLook(): AlienLook {
  return { ...(looks.value.find((l) => l.id === 'blip') ?? DEFAULT_LOOKS[1]), hat: undefined, outfit: undefined, accessory: undefined };
}
export function alienModel(patch: Partial<AlienLook>, face?: Face, size = 0.016): THREE.Object3D {
  const a = buildAlien({ ...baseLook(), ...patch }, size);
  if (face) a.setFace(face);
  return a.root;
}

/** The model that represents a catalog item (without pedestal), scaled to ~1 unit. */
export function itemArt(id: string): THREE.Object3D {
  const it = catalogById.get(id);
  if (!it) return crate(id, 0x8cf56b);
  let o: THREE.Object3D;
  if (it.category === 'skin') o = alienModel({ skin: id, expression: id === 'pounce' ? 'happy' : 'happy' });
  else if (it.category === 'expression') o = alienModel({ expression: id.replace('expr_', '') as any }, id.replace('expr_', '') as Face);
  else if (it.placeable) o = buildItemModel(id);
  else o = buildCosmetic(id);
  if (!hasMesh(o)) o = crate(id, RARITY_COLOR[it.rarity]);
  return normalise(o);
}

/** scale an object to fit a ~1 unit box, standing on y = 0, centred in x/z */
export function normalise(o: THREE.Object3D, target = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(o);
  const b = new THREE.Box3().setFromObject(o, true);
  const size = b.getSize(new THREE.Vector3());
  const k = target / Math.max(size.x, size.y, size.z, 0.0001);
  o.scale.multiplyScalar(k);
  const b2 = new THREE.Box3().setFromObject(o, true);
  const c = b2.getCenter(new THREE.Vector3());
  o.position.x -= c.x; o.position.z -= c.z; o.position.y -= b2.min.y;
  return g;
}

/** Item standing on its rarity pedestal — the shop card subject. */
export function itemOnPedestal(id: string): THREE.Group {
  const it = catalogById.get(id);
  const g = new THREE.Group();
  const ped = pedestal(it?.rarity ?? 'common');
  const art = itemArt(id);
  art.scale.multiplyScalar(0.96);
  art.position.y = 0.02;
  g.add(ped, art);
  return framed(g);
}

// ── medals ───────────────────────────────────────────────────────────────────
const medalCache = new Map<string, THREE.Object3D>();
/** A gold medal on a ribbon with the badge's glyph embossed; locked = dark silhouette. */
export function medal(glyph: GlyphName, color: number, unlocked: boolean): THREE.Group {
  const key = `${glyph}|${color}|${unlocked}`;
  let m = medalCache.get(key);
  if (!m) {
    const v = VoxGrid.span([-14, -16, -4], [14, 18, 4], 1.25);
    const gold = unlocked ? 0xffc53d : 0x26302b;
    // ribbon
    v.add(S.box([-9, 6, -1.5], [-2, 17, 0.5], 0.5), unlocked ? 0xd8325a : 0x1a221e, M.fur);
    v.add(S.box([2, 6, -1.5], [9, 17, 0.5], 0.5), unlocked ? 0x2f6bd8 : 0x1a221e, M.fur);
    // coin with scalloped rim
    v.add(S.disc([0, -3, 0], [0, 0, 1], 12, 2.4, 16), (x, y) => (unlocked ? mix(0xb8860b, 0xfff0a0, (y + 15) / 26) : mix(0x1c2420, 0x2c3833, (y + 15) / 26)), M.metal);
    v.add(S.disc([0, -3, 2], [0, 0, 1], 9.2, 0.6), unlocked ? shade(gold, 0.82) : 0x1a221e, M.metal);
    if (unlocked) for (let i = 0; i < 3; i++) v.add(S.sphere([-6 + i * 1.6, 5 - i * 1.2, 2.6], 0.55), 0xffffff, M.glow);
    m = new THREE.Group();
    const body = toObject(v, { size: 0.04, anchor: 'center', outline: unlocked ? 0x3a2606 : 0x050806 });
    m.add(body);
    const gl = buildGlyph(glyph, color, { dim: !unlocked });
    gl.scale.setScalar(0.5);
    gl.position.set(0, -0.12 * 1, 0.16);
    m.add(gl);
    medalCache.set(key, m);
  }
  return framed(m.clone(true));
}

// ── station / action buttons ────────────────────────────────────────────────
export function stationArt(kind: 'wardrobe' | 'edit' | 'badges' | 'slots' | 'arcade' | 'ledger'): THREE.Group {
  const o: Record<typeof kind, () => THREE.Object3D> = {
    wardrobe: () => { const a = alienModel({ expression: 'wink' }); return a; },
    edit: () => buildGlyph('wrench', 0x52f2ff),
    badges: () => buildGlyph('trophy', 0xffc53d, { gold: true }),
    slots: () => buildGlyph('slot', 0xd8325a),
    arcade: () => buildGlyph('arcade', 0x6f5ad0),
    ledger: () => buildGlyph('dna', 0x8cf56b),
  };
  return framed(normalise(o[kind]()));
}

export { buildGlyph };
