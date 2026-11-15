// The GLOB LABS voxel icon set: every UI icon is a little sculpted, lit, inked voxel object.
// Model space is ~16 units across, sampled at 2 voxels per unit (≈32³ detail), so an icon
// photographed at 64 px still shows every bevel, rivet and glint.
import * as THREE from 'three';
import { S, smoothUnion, type V3 } from '../core';
import { buildAlien } from '../alien';
import { DEFAULT_LOOKS } from '../../core/state';
import { C, M, grid, obj, prism, stroke, starPts, ngonPts, vgrad, type P2 } from './vkit';

type Builder = () => THREE.Object3D;
const R = 2; // voxels per unit for icons

const glyphZ = (z0: number, z1: number) => [z0, z1] as const;

function rocket(): THREE.Object3D {
  const g = grid([-9, -10, -6], [9, 11, 6], R);
  g.add(smoothUnion(S.ellipsoid([0, 1, 0], [3.6, 7.5, 3.6]), S.cyl(0, 0, 3.4, -5, 2), 1.5), vgrad(C.steelLo, C.white, -6, 8), M.metal);
  g.paint(S.ellipsoid([0, 6.2, 0], [3.7, 2.8, 3.7]), C.red, M.solid);
  g.add(S.disc([0, 2.2, 3.2], [0, 0, 1], 1.7, 0.6), C.cyan, M.glow);
  g.add(S.torus([0, 2.2, 3.1], [0, 0, 1], 1.9, 0.45), C.brass, M.metal);
  for (const sx of [-1, 1]) g.add(prism([[sx * 3, -1], [sx * 6.5, -6], [sx * 6.5, -7.5], [sx * 3, -5.5]], -0.9, 0.9), C.red, M.solid);
  g.add(prism([[-0.8, -2], [0.8, -2], [0.8, -7], [-0.8, -7]], 2.6, 4.4), C.red, M.solid);
  g.add(S.cone(0, 0, -9.5, -5.2, 1.4, 2.8), C.amber, M.glow);
  g.add(S.cone(0, 0, -10.5, -7.5, 0.6, 1.6), C.cream, M.glow);
  return obj(g);
}

const B: Record<string, Builder> = {
  terminal: () => {
    const g = grid([-9, -9, -6], [9, 9, 7], R);
    g.add(S.box([-8, -3, -4], [8, 8.5, 4], 1.6), vgrad(C.steelLo, C.steelHi, -3, 8.5), M.metal);
    g.carve(S.box([-6.4, -1.6, 2.4], [6.4, 7.1, 6], 0.8));
    g.add(S.box([-6.4, -1.6, 1.4], [6.4, 7.1, 3.0], 0.6), C.screen, M.gloss);
    for (let i = 0; i < 4; i++) g.add(S.box([-5.2, 5.4 - i * 1.7, 2.6], [-5.2 + [8, 5, 9.6, 3.4][i], 6.1 - i * 1.7, 3.2]), i === 3 ? C.pink : C.glob, M.glow);
    g.add(S.box([-1.4, 4.1, 2.6], [-0.4, 4.6, 3.3]), C.cyan, M.glow);
    g.add(S.box([-2, -5.5, -1.5], [2, -3, 1.5]), C.steelLo, M.metal);
    g.add(S.box([-7.5, -8, -4], [7.5, -5.4, 5.5], 1), vgrad(C.gun, C.steel, -8, -5.4), M.metal);
    for (let i = 0; i < 6; i++) g.add(S.box([-6.6 + i * 2.2, -5.6, 1.4], [-5.2 + i * 2.2, -5, 4.6], 0.3), i === 5 ? C.glob : C.dark, i === 5 ? M.glow : M.solid);
    g.add(S.sphere([6.4, 7.3, 3.4], 0.7), C.red, M.glow);
    return obj(g);
  },
  idea: () => {
    const g = grid([-8, -10, -8], [8, 10, 8], R);
    g.add(S.sphere([0, 3, 0], 6.8), C.glass, M.glass);
    g.add(S.sphere([0, 3.2, 0], 4.2), 0xfff4a0, M.glow);
    g.add(S.capsule([-1.6, -1, 0], [-1.6, 3.5, 0], 0.4), 0xffd34a, M.glow);
    g.add(S.capsule([1.6, -1, 0], [1.6, 3.5, 0], 0.4), 0xffd34a, M.glow);
    for (let i = 0; i < 4; i++) g.add(S.cyl(0, 0, 3.4 - (i % 2) * 0.35, -5 - i * 1.2, -3.9 - i * 1.2), C.brass, M.metal);
    g.add(S.cone(0, 0, -9, -5.4, 1.2, 2.6), C.gun, M.metal);
    return obj(g);
  },
  shop: () => gacha(1),
  wardrobe: () => {
    const g = grid([-9, -6, -9], [9, 11, 9], R);
    g.add(S.cyl(0, 0, 8.4, -5.5, -3.8), C.dark, M.solid);
    g.add(S.cyl(0, 0, 5.2, -4, 8.5), vgrad(C.dark, C.gun, -4, 8.5), M.solid);
    g.add(S.cyl(0, 0, 5.3, -3.2, -1), C.glob, M.jelly);
    g.add(S.disc([3.4, -2.1, 4.2], [0.2, 0, 1], 1.1, 0.5, 6), C.pink, M.jelly);
    return obj(g);
  },
  slot: () => {
    const g = grid([-10, -10, -6], [10, 10, 6], R);
    g.add(S.box([-7.5, -9, -4], [6.5, 8, 4], 1.4), vgrad(C.redDeep, C.red, -9, 8), M.solid);
    g.add(S.box([-6.5, 5.5, -3.5], [5.5, 9.5, 3.5], 1.2), C.gold, M.metal);
    g.add(S.box([-6, -1.6, 2.6], [5, 4.4, 4.4], 0.5), C.white, M.solid);
    for (let i = 0; i < 3; i++) {
      const cx = -4.2 + i * 3.6;
      g.add(S.box([cx - 1.4, -1.2, 3.6], [cx + 1.4, 4, 4.6], 0.3), C.cream, M.solid);
      g.add(prism([[cx - 0.9, 3], [cx + 1, 3], [cx + 1, 2.2], [cx - 0.1, -0.4], [cx - 1, -0.4], [cx + 0.1, 2.2], [cx - 0.9, 2.2]], 4.4, 5), C.red, M.glow);
    }
    g.add(S.box([-5, -7, 3], [4, -4, 4.6], 0.6), C.dark, M.solid);
    g.add(S.box([-3, -6.2, 4.2], [2, -5.6, 5]), C.gold, M.metal);
    g.add(S.capsule([7.2, -2, 0], [8.4, 6, 0], 0.7), C.steelHi, M.metal);
    g.add(S.sphere([8.5, 6.8, 0], 1.8), C.red, M.jelly);
    for (let i = 0; i < 5; i++) g.add(S.sphere([-5.6 + i * 2.6, 9.2, 2.4], 0.6), i % 2 ? C.amber : C.cream, M.glow);
    return obj(g);
  },
  fuel: () => fuelFlask(),
  wrench: () => {
    const g = grid([-10, -10, -3], [10, 10, 3], R);
    g.add(S.capsule([-6, -6, 0], [4, 4, 0], 1.5), vgrad(C.steelLo, C.steelHi, -7, 5), M.metal);
    g.add(S.disc([5.4, 5.4, 0], [0, 0, 1], 3.6, 1.3), C.steelHi, M.metal);
    g.carve(prism([[5.2, 5.2], [9, 4], [9.5, 6.4], [6.4, 9.5], [4, 9]], -3, 3));
    g.add(S.disc([-6.4, -6.4, 0], [0, 0, 1], 2.4, 1.3), C.steelHi, M.metal);
    g.carve(S.disc([-6.4, -6.4, 0], [0, 0, 1], 1.0, 2));
    g.add(S.capsule([-4.4, -4.4, 1.3], [2.2, 2.2, 1.3], 0.6), C.red, M.solid);
    return obj(g);
  },
  gear: () => gear(C.steel, C.steelHi),
  sound: () => speaker(false),
  mute: () => speaker(true),
  widget: () => {
    const g = grid([-10, -8, -3], [10, 9, 4], R);
    g.add(S.box([-9, -6.5, -1.5], [8, 7.5, 1.5], 1), vgrad(C.gun, C.steel, -6.5, 7.5), M.metal);
    g.add(S.box([-8, -5.5, 0.6], [7, 5, 2], 0.4), C.screen, M.gloss);
    g.add(S.box([-8, 5.4, 0.5], [7, 6.8, 2]), C.dark, M.solid);
    for (let i = 0; i < 3; i++) g.add(S.sphere([-7 + i * 1.6, 6.1, 1.9], 0.5), [C.red, C.amber, C.glob][i], M.glow);
    g.add(S.box([0.5, -4.5, 1.5], [6.2, 0.6, 3.6], 0.5), C.steelHi, M.metal);
    g.add(S.box([1.2, -3.8, 3.2], [5.5, -0.1, 3.8]), C.glob, M.glow);
    g.add(S.sphere([3.4, -1.9, 4.1], 0.7), C.pink, M.glow);
    return obj(g);
  },
  dna: () => helix(),
  close: () => bigButton(C.red, C.redDeep, 'x'),
  stop: () => bigButton(C.red, C.redDeep, 'square'),
  play: () => bigButton(C.glob, C.globDeep, 'tri'),
  plus: () => {
    const g = grid([-9, -9, -3], [9, 9, 3], R);
    g.add(prism([[-2.2, 7], [2.2, 7], [2.2, 2.2], [7, 2.2], [7, -2.2], [2.2, -2.2], [2.2, -7], [-2.2, -7], [-2.2, -2.2], [-7, -2.2], [-7, 2.2], [-2.2, 2.2]], -2, 2, 0.9), vgrad(C.globDeep, C.glob, -7, 7), M.jelly);
    return obj(g);
  },
  send: rocket,
  trash: () => {
    const g = grid([-8, -10, -8], [8, 10, 8], R);
    g.add(S.cone(0, 0, -9, 4.5, 4.8, 5.8), vgrad(C.steelLo, C.steel, -9, 4.5), M.metal);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(S.capsule([Math.cos(a) * 5, -8, Math.sin(a) * 5], [Math.cos(a) * 5.9, 4, Math.sin(a) * 5.9], 0.45), C.steelHi, M.metal); }
    g.add(S.cyl(0, 0, 6.6, 4.5, 6.2), C.steelHi, M.metal);
    g.add(S.capsule([-2, 7.4, 0], [2, 7.4, 0], 0.8), C.steelHi, M.metal);
    g.add(S.sphere([2.6, 5.4, 4], 1.4), C.glob, M.jelly);
    return obj(g);
  },
  chat: () => {
    const g = grid([-10, -9, -4], [10, 9, 4], R);
    g.add(smoothUnion(S.ellipsoid([0, 1.5, 0], [9, 6.5, 3]), prism([[-5, -2], [-1, -2], [-6.5, -7.5]], -2, 2), 1.5), vgrad(0xd9e8f2, C.white, -6, 8), M.jelly);
    for (let i = 0; i < 3; i++) g.add(S.sphere([-3.5 + i * 3.5, 1.5, 2.8], 1.15), [C.glob, C.cyan, C.pink][i], M.glow);
    return obj(g);
  },
  folder: () => {
    const g = grid([-10, -8, -4], [10, 9, 4], R);
    g.add(prism([[-9, -7], [9, -7], [9, 5], [0, 5], [-2, 7], [-9, 7]], -2.6, -0.6, 0.4), C.amberDeep, M.solid);
    g.add(S.box([-7, -4, -0.8], [7, 6, 0], 0.2), C.paper, M.solid);
    g.add(S.box([-6, -3, 0], [8, 7, 0.6], 0.2), C.white, M.solid);
    g.add(prism([[-9, -7], [9, -7], [8, 3], [-8, 3]], 0.6, 2.6, 0.5), vgrad(C.amberDeep, C.amber, -7, 3), M.solid);
    return obj(g);
  },
  file: () => paper(false),
  copy: () => paper(true),
  search: () => {
    const g = grid([-10, -10, -3], [10, 10, 3], R);
    g.add(S.torus([1.8, 1.8, 0], [0, 0, 1], 5.2, 1.3), C.brass, M.metal);
    g.add(S.disc([1.8, 1.8, 0], [0, 0, 1], 4.4, 0.5), C.glass, M.glass);
    g.add(S.disc([0.2, 3.6, 0.6], [0, 0, 1], 1.2, 0.3), C.white, M.glow);
    g.add(S.capsule([-2.4, -2.4, 0], [-7.6, -7.6, 0], 1.5), C.wood, M.solid);
    g.add(S.capsule([-2.2, -2.2, 0], [-3.4, -3.4, 0], 1.8), C.brass, M.metal);
    return obj(g);
  },
  code: () => {
    const g = grid([-10, -9, -3], [10, 9, 3], R);
    for (const s of stroke([[-3.5, 5.5], [-8, 0], [-3.5, -5.5]], 2.2, -1.6, 1.6)) g.add(s, C.cyan, M.glow);
    for (const s of stroke([[3.5, 5.5], [8, 0], [3.5, -5.5]], 2.2, -1.6, 1.6)) g.add(s, C.cyan, M.glow);
    for (const s of stroke([[1.8, 7], [-1.8, -7]], 2, -1.6, 1.6)) g.add(s, C.pink, M.glow);
    return obj(g);
  },
  clip: () => {
    const g = grid([-6, -10, -2], [6, 10, 2], R);
    const pts: P2[] = [[1.8, -4], [1.8, 5], [0, 7], [-1.8, 5], [-1.8, -6], [0, -8], [3.6, -6], [3.6, 7], [0, 9.2], [-3.6, 7], [-3.6, -2]];
    for (const s of stroke(pts, 1, -0.6, 0.6)) g.add(s, C.steelHi, M.metal);
    return obj(g);
  },
  download: () => {
    const g = grid([-10, -10, -4], [10, 10, 4], R);
    g.add(prism([[-2.2, 9], [2.2, 9], [2.2, 1], [5.5, 1], [0, -5], [-5.5, 1], [-2.2, 1]], -1.6, 1.6, 0.6), vgrad(C.globDeep, C.glob, -5, 9), M.jelly);
    g.add(S.box([-9, -9, -3], [9, -6, 3], 0.8), C.steel, M.metal);
    g.add(S.box([-9, -9, -3], [-6.5, -3, 3], 0.6), C.steel, M.metal);
    g.add(S.box([6.5, -9, -3], [9, -3, 3], 0.6), C.steel, M.metal);
    g.add(S.box([-5, -8, 2.6], [5, -7, 3.2]), C.glob, M.glow);
    return obj(g);
  },
  check: () => {
    const g = grid([-10, -9, -3], [10, 9, 3], R);
    for (const s of stroke([[-7, 0], [-2.2, -5], [7.5, 6]], 3.4, -1.8, 1.8)) g.add(s, C.glob, M.jelly);
    return obj(g);
  },
  star: () => {
    const g = grid([-10, -10, -3], [10, 10, 3], R);
    g.add(prism(starPts(5, 9.4, 4.2), -1.8, 1.8, 0.8), vgrad(0xe0a020, 0xffe680, -8, 9), M.jelly);
    g.add(S.sphere([-1.5, 2.5, 1.8], 0.9), C.white, M.glow);
    return obj(g);
  },
  user: () => {
    const g = grid([-9, -10, -6], [9, 10, 6], R);
    g.add(S.ellipsoid([0, -6.2, 0], [7, 4.4, 4.6]), vgrad(C.cyanDeep, C.cyan, -10, -2), M.jelly);
    g.add(S.sphere([0, 3.2, 0], 5.6), C.glass, M.glass);
    g.add(S.sphere([0, 2.6, 0], 4.2), 0x7be35f, M.jelly);
    g.add(S.ellipsoid([-1.7, 2.6, 3.4], [1.2, 1.8, 0.8]), 0x07090c, M.gloss);
    g.add(S.ellipsoid([1.7, 2.6, 3.4], [1.2, 1.8, 0.8]), 0x07090c, M.gloss);
    g.add(S.cyl(0, 0, 3, -2.6, -1.2), C.steelHi, M.metal);
    return obj(g);
  },
  warn: () => {
    const g = grid([-10, -9, -3], [10, 10, 3], R);
    g.add(prism(ngonPts(3, 9.5, 0, -0.5), -1.8, 1.8, 1), vgrad(C.amberDeep, C.amber, -6, 8), M.solid);
    g.add(prism([[-0.9, 4.6], [0.9, 4.6], [0.6, -1.2], [-0.6, -1.2]], 1, 2.4), C.ink, M.solid);
    g.add(S.box([-0.8, -3.6, 1], [0.8, -2.2, 2.4], 0.2), C.ink, M.solid);
    return obj(g);
  },
  pin: () => {
    const g = grid([-8, -10, -6], [8, 10, 6], R);
    g.add(S.cyl(0, 0, 4.6, 2, 3.6), C.red, M.jelly);
    g.add(S.cyl(0, 0, 2.6, 3.6, 7.5), C.red, M.jelly);
    g.add(S.cyl(0, 0, 3.8, 7.5, 9), C.red, M.jelly);
    g.add(S.capsule([0, 2, 0], [0, -9, 0], 0.5, 0.15), C.steelHi, M.metal);
    g.add(S.sphere([-1.4, 8.6, 1.6], 0.7), C.white, M.glow);
    return obj(g);
  },
  sparkle: () => {
    const g = grid([-10, -10, -3], [10, 10, 3], R);
    g.add(prism(starPts(4, 8, 2, -1.5, 0.5, 0), -1.4, 1.4, 0.4), 0xfff4a0, M.glow);
    g.add(prism(starPts(4, 3.6, 1, 6, 6.5, 0), -1, 1, 0.3), C.pink, M.glow);
    g.add(prism(starPts(4, 2.8, 0.8, 6.2, -5.8, 0), -1, 1, 0.3), C.cyan, M.glow);
    return obj(g);
  },
  mic: () => {
    const g = grid([-8, -10, -6], [8, 10, 6], R);
    g.add(S.capsule([0, 2.5, 0], [0, 6.5, 0], 3.6), C.steelHi, M.metal);
    for (let i = 0; i < 4; i++) g.paint(S.torus([0, 3.4 + i * 1.4, 0], [0, 1, 0], 3.4, 0.35), C.steelLo, M.metal);
    g.add(S.torus([0, 1.8, 0], [0, 0, 1], 5, 0.7), C.gun, M.metal);
    g.carve(S.box([-8, 1.9, -3], [8, 9, 3]));
    g.add(S.capsule([0, 2.5, 0], [0, 6.5, 0], 3.6), C.steelHi, M.metal);
    g.add(S.capsule([0, -3, 0], [0, -7, 0], 0.8), C.gun, M.metal);
    g.add(S.cyl(0, 0, 4, -9, -7.2), C.gun, M.metal);
    g.add(S.sphere([0, 1.5, 3.4], 0.7), C.red, M.glow);
    return obj(g);
  },
  menu: () => {
    const g = grid([-10, -9, -3], [10, 9, 3], R);
    for (let i = 0; i < 3; i++) {
      g.add(S.box([-8, 4.2 - i * 5.4, -1.6], [8, 7.2 - i * 5.4, 1.6], 1.2), vgrad(C.steelLo, C.steelHi, 3 - i * 5.4, 7.2 - i * 5.4), M.metal);
      g.add(S.sphere([-5.8, 5.7 - i * 5.4, 1.6], 0.8), [C.glob, C.cyan, C.pink][i], M.glow);
    }
    return obj(g);
  },
  back: () => {
    const g = grid([-10, -9, -3], [10, 9, 3], R);
    g.add(prism([[-8.5, 0], [-1.5, 7], [-1.5, 3], [8, 3], [8, -3], [-1.5, -3], [-1.5, -7]], -1.8, 1.8, 0.8), vgrad(C.cyanDeep, C.cyan, -7, 7), M.jelly);
    return obj(g);
  },
  pencil: () => {
    const g = grid([-10, -10, -3], [10, 10, 3], R);
    g.add(S.capsule([-4, -4, 0], [6, 6, 0], 2.1), C.amber, M.solid);
    g.add(S.capsule([5.5, 5.5, 0], [7.4, 7.4, 0], 2.15), C.steelHi, M.metal);
    g.add(S.capsule([7.4, 7.4, 0], [8.4, 8.4, 0], 2), C.pink, M.jelly);
    g.add(S.capsule([-4, -4, 0], [-7.4, -7.4, 0], 2, 0.6), 0xe8c8a0, M.solid);
    g.add(S.capsule([-6.6, -6.6, 0], [-8.4, -8.4, 0], 0.9, 0.2), C.ink, M.solid);
    return obj(g);
  },
  refresh: () => {
    const g = grid([-10, -10, -3], [10, 10, 3], R);
    g.add(S.torus([0, 0, 0], [0, 0, 1], 6, 1.6), vgrad(C.globDeep, C.glob, -7, 7), M.jelly);
    g.carve(prism([[0, 0], [10, 4], [10, -2]], -3, 3));
    g.add(prism([[3.2, 1.2], [9.6, 1.6], [6.4, 6.2]], -1.6, 1.6, 0.4), C.glob, M.jelly);
    return obj(g);
  },
  ufo: () => ufo(),
  alien: () => buildAlienMini(),
  trophy: () => {
    const g = grid([-10, -10, -7], [10, 10, 7], R);
    g.add(S.cone(0, 0, -1, 8.5, 2.4, 6.4), vgrad(C.goldDeep, C.gold, -1, 8.5), M.metal);
    g.carve(S.cone(0, 0, 4, 9.5, 2, 5.4));
    g.add(S.cyl(0, 0, 5.2, 7.2, 8.6), 0xff9a3a, M.glow);
    for (const sx of [-1, 1]) g.add(S.torus([sx * 6.2, 4.6, 0], [0, 0, 1], 2.2, 0.7), C.gold, M.metal);
    g.add(S.capsule([0, -1, 0], [0, -5, 0], 1.2), C.gold, M.metal);
    g.add(S.box([-5, -9, -3.4], [5, -5, 3.4], 0.6), C.wood, M.solid);
    g.add(S.box([-2.6, -7.6, 3.2], [2.6, -6.4, 3.8]), C.brass, M.metal);
    g.add(prism(starPts(5, 2, 0.9, 0, 3.2), 4.4, 5.6), C.white, M.glow);
    return obj(g);
  },
  eye: () => {
    const g = grid([-9, -9, -9], [9, 9, 9], R);
    g.add(S.sphere([0, 0, 0], 8), C.white, M.jelly);
    g.paint(S.disc([0, 0, 7.6], [0, 0, 1], 4.4, 1.2), C.glob, M.glow);
    g.paint(S.disc([0, 0, 7.9], [0, 0, 1], 2.2, 0.9), 0x05080a, M.gloss);
    g.paint(S.sphere([1.5, 1.8, 7.8], 0.9), C.white, M.glow);
    g.paint(S.capsule([-6, -2, 5], [-3.6, -4, 6.4], 0.3), 0xff8a8a);
    return obj(g);
  },
  brain: () => {
    const g = grid([-10, -9, -8], [10, 9, 8], R);
    g.add(smoothUnion(S.ellipsoid([-3.4, 1, 0], [5.2, 5.6, 5.8]), S.ellipsoid([3.4, 1, 0], [5.2, 5.6, 5.8]), 2), 0xff9ad0, M.jelly);
    g.add(S.ellipsoid([0, -4.4, -1], [3, 2.6, 3]), 0xf07ab8, M.jelly);
    g.recolor((x, y, z) => (Math.sin(x * 1.6 + Math.sin(y * 1.3) * 1.5) > 0.72 || Math.sin(y * 1.7 + z * 0.8) > 0.86 ? 0xd65296 : undefined));
    g.paint(S.box([-0.5, -2, -8], [0.5, 8, 8]), 0xc2407e);
    return obj(g);
  },
  arcade: () => {
    const g = grid([-8, -10, -7], [8, 11, 7], R);
    g.add(S.box([-6, -10, -5], [6, 9.5, 5], 0.8), vgrad(C.violet, 0x6a3fc8, 9.5, -10), M.solid);
    g.carve(S.box([-5, 1, 3], [5, 7.5, 6]));
    g.add(S.box([-4.6, 1.4, 2], [4.6, 7.1, 3.4], 0.4), C.screen, M.gloss);
    for (let i = 0; i < 3; i++) g.add(S.box([-3.6 + i * 2.6, 3 + (i % 2) * 1.6, 3.2], [-2.2 + i * 2.6, 4.4 + (i % 2) * 1.6, 3.7]), [C.glob, C.pink, C.amber][i], M.glow);
    g.add(S.box([-6, -1.5, -5], [6, 1, 7], 0.6), C.dark, M.solid);
    g.add(S.capsule([-2.6, 1, 5], [-2.6, 2.8, 5], 0.4), C.steelHi, M.metal);
    g.add(S.sphere([-2.6, 3.2, 5], 1), C.red, M.jelly);
    for (let i = 0; i < 2; i++) g.add(S.cyl(1.6 + i * 2.2, 5, 0.9, 1, 1.6), [C.cyan, C.amber][i], M.glow);
    g.add(S.box([-6, 8, -5], [6, 9.8, 5.4], 0.4), C.pink, M.glow);
    return obj(g);
  },
  tasks: () => {
    const g = grid([-9, -10, -3], [9, 11, 3], R);
    g.add(S.box([-7, -9.5, -1.2], [7, 8.5, 0.2], 0.8), C.wood, M.solid);
    g.add(S.box([-6, -8.5, 0.2], [6, 7, 0.9]), C.paper, M.solid);
    g.add(S.box([-3, 7, -0.8], [3, 10, 1.6], 0.6), C.steel, M.metal);
    for (let i = 0; i < 3; i++) {
      const y = 4 - i * 4.2;
      g.add(S.box([-4.8, y - 1.2, 0.9], [-2.4, y + 1.2, 1.6], 0.3), i < 2 ? C.glob : C.steelLo, i < 2 ? M.glow : M.solid);
      g.add(S.box([-1.4, y - 0.5, 0.9], [4.6 - i, y + 0.5, 1.3]), C.ink, M.solid);
    }
    return obj(g);
  },
  bolt: () => {
    const g = grid([-8, -10, -3], [8, 10, 3], R);
    g.add(prism([[1, 9.5], [-5.5, -0.5], [-0.6, -0.5], [-2.4, -9.5], [5.5, 1.8], [0.6, 1.8], [3.4, 9.5]], -1.6, 1.6, 0.5), 0xffe066, M.glow);
    return obj(g);
  },
};

// ── shared sub-models ────────────────────────────────────────────────────────
function gacha(scale = 1): THREE.Object3D {
  const g = grid([-9, -11, -8], [9, 11, 8], R * scale);
  g.add(S.box([-6.5, -10.5, -5.5], [6.5, -1, 5.5], 1.4), vgrad(C.pinkDeep, C.pink, -10.5, -1), M.solid);
  g.add(S.box([-7, -2, -6], [7, 0, 6], 0.6), C.steelHi, M.metal);
  g.add(S.sphere([0, 5, 0], 6.8), C.glass, M.glass);
  const caps: [number, number, number, number][] = [[-2.5, 1.8, 2, C.glob], [2.6, 2, 1.4, C.cyan], [0, 2.4, -2.4, C.amber], [-3.2, 4.8, -0.8, C.violet], [2.4, 5.4, 2.6, C.red], [0.4, 7.4, 0.6, C.glob], [-1.2, 4.6, 3.6, C.pink]];
  for (const [x, y, z, c] of caps) { g.add(S.sphere([x, y, z], 2.1), c, M.jelly); g.paint(S.box([x - 2.3, y - 2.3, z - 2.3], [x + 2.3, y - 0.1, z + 2.3]), C.white, M.jelly); }
  g.add(S.cyl(0, 0, 2.4, 11, 12.2), C.steelHi, M.metal);
  g.add(S.disc([0, -5, 5.6], [0, 0, 1], 2.6, 0.8), C.steelHi, M.metal);
  g.add(S.capsule([-2.2, -5, 6.4], [2.2, -5, 6.4], 0.7), C.steel, M.metal);
  g.add(S.box([-3, -9.6, 4.2], [3, -7, 6.2], 0.5), C.dark, M.solid);
  g.add(S.box([3.6, -3.6, 5.2], [5.2, -1.6, 6]), C.amber, M.glow);
  return obj(g);
}

function fuelFlask(): THREE.Object3D {
  const g = grid([-8, -10, -8], [8, 10, 8], R);
  g.add(S.cyl(0, 0, 5.8, -8.5, -6.8), C.steelHi, M.metal);
  g.add(S.cyl(0, 0, 5.8, 6, 7.6), C.steelHi, M.metal);
  g.add(S.cyl(0, 0, 5.2, -6.8, 6), C.glass, M.glass);
  g.add(S.cyl(0, 0, 4.5, -6.8, 2.6), C.glob, M.glow);
  g.add(S.cyl(0, 0, 4.5, 2.2, 2.8), 0xd6ffb8, M.glow);
  for (const [x, y] of [[-1.5, -3], [1.6, -0.6], [0.4, -5]]) g.add(S.sphere([x, y, 3.9], 0.8), 0xeaffda, M.glow);
  g.add(S.cyl(0, 0, 2, 7.6, 9.2), C.steelLo, M.metal);
  g.add(S.capsule([-3.4, 9.4, 0], [3.4, 9.4, 0], 0.9), C.red, M.solid);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(S.capsule([sx * 4.4, -7, sz * 4.4], [sx * 4.4, 6.4, sz * 4.4], 0.6), C.steel, M.metal);
  return obj(g);
}

function gear(c: number, hi: number): THREE.Object3D {
  const g = grid([-10, -10, -3], [10, 10, 3], R);
  g.add(S.disc([0, 0, 0], [0, 0, 1], 6.6, 1.8), vgrad(c, hi, -7, 7), M.metal);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const cx = Math.cos(a) * 7.4, cy = Math.sin(a) * 7.4;
    g.add(S.disc([cx, cy, 0], [0, 0, 1], 1.9, 1.8, 4, a), vgrad(c, hi, -9, 9), M.metal);
  }
  g.carve(S.disc([0, 0, 0], [0, 0, 1], 2.6, 3));
  g.add(S.torus([0, 0, 1.6], [0, 0, 1], 4.4, 0.5), C.steelLo, M.metal);
  g.add(S.torus([0, 0, 0.4], [0, 0, 1], 2.7, 0.5), C.glob, M.glow);
  return obj(g);
}

function speaker(muted: boolean): THREE.Object3D {
  const g = grid([-10, -9, -6], [10, 9, 6], R);
  if (muted) {
    for (const st of stroke([[4, 4], [9.5, -4]], 1.8, -1, 1)) g.add(st, C.red, M.glow);
    for (const st of stroke([[4, -4], [9.5, 4]], 1.8, -1, 1)) g.add(st, C.red, M.glow);
  } else {
    for (let i = 0; i < 2; i++) g.add(S.torus([1.4, 0, 0], [0, 0, 1], 4.4 + i * 3, 0.65), i ? C.cyan : C.glob, M.glow);
    g.carve(S.box([-12, -12, -6], [3.4, 12, 6]));
    g.carve(prism([[3.4, 0], [12, 9], [12, 12], [3.4, 12]], -6, 6));
    g.carve(prism([[3.4, 0], [12, -9], [12, -12], [3.4, -12]], -6, 6));
  }
  g.add(S.box([-8.5, -3.5, -3], [-3.5, 3.5, 3], 0.8), C.gun, M.metal);
  g.add(prism([[-4, -3.5], [2, -8], [2, 8], [-4, 3.5]], -4, 4, 0.8), vgrad(C.steelLo, C.steel, -8, 8), M.metal);
  g.add(S.disc([0.6, 0, 3.2], [1, 0, 0.2], 3.6, 0.6), C.dark, M.solid);
  return obj(g);
}

function helix(): THREE.Object3D {
  const g = grid([-8, -11, -8], [8, 11, 8], R);
  const n = 20;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), y = -9.5 + t * 19, a = t * Math.PI * 2.4;
    const p1: V3 = [Math.cos(a) * 5, y, Math.sin(a) * 5], p2: V3 = [-p1[0], y, -p1[2]];
    g.add(S.sphere(p1, 1.5), C.glob, M.jelly);
    g.add(S.sphere(p2, 1.5), C.pink, M.jelly);
    if (i % 2 === 0) g.add(S.capsule(p1, p2, 0.55), i % 4 ? C.cyan : C.amber, M.glow);
  }
  return obj(g);
}

function bigButton(c: number, deep: number, mark: 'x' | 'square' | 'tri'): THREE.Object3D {
  const g = grid([-10, -10, -5], [10, 10, 6], R);
  g.add(S.disc([0, 0, -2.4], [0, 0, 1], 9.2, 1.4, 12), C.steel, M.metal);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; g.add(S.sphere([Math.cos(a) * 8.1, Math.sin(a) * 8.1, -0.8], 0.7), C.steelHi, M.metal); }
  g.add(S.ellipsoid([0, 0, 0.8], [6.8, 6.8, 3.6]), (x, y) => (y > 2.5 ? c : deep), M.jelly);
  g.carve(S.box([-10, -10, -10], [10, 10, -1]));
  g.add(S.disc([0, 0, -1.2], [0, 0, 1], 7.3, 0.6), C.dark, M.solid);
  g.add(S.ellipsoid([0, 0, 0.8], [6.8, 6.8, 3.6]), (x, y) => (y > 1.5 ? c : deep), M.jelly);
  g.carve(S.box([-10, -10, -10], [10, 10, -1.6]));
  if (mark === 'x') {
    for (const s of stroke([[-2.6, 2.6], [2.6, -2.6]], 1.6, 3, 4.6)) g.add(s, C.white, M.glow);
    for (const s of stroke([[-2.6, -2.6], [2.6, 2.6]], 1.6, 3, 4.6)) g.add(s, C.white, M.glow);
  } else if (mark === 'square') g.add(S.box([-2.4, -2.4, 3], [2.4, 2.4, 4.6], 0.4), C.white, M.glow);
  else g.add(prism([[-2, 3.2], [3.4, 0], [-2, -3.2]], 3, 4.6, 0.3), C.white, M.glow);
  g.add(S.ellipsoid([-2.4, 3, 3.6], [1.6, 1, 0.6]), 0xffffff, M.glow);
  return obj(g);
}

function paper(two: boolean): THREE.Object3D {
  const g = grid([-9, -10, -4], [9, 10, 4], R);
  const sheet = (dx: number, dy: number, z: number, col: number) => {
    g.add(prism([[-6 + dx, -8.5 + dy], [6 + dx, -8.5 + dy], [6 + dx, 4.5 + dy], [2 + dx, 8.5 + dy], [-6 + dx, 8.5 + dy]], z, z + 1.2, 0.2), col, M.solid);
    g.add(prism([[2 + dx, 8.5 + dy], [2 + dx, 4.5 + dy], [6 + dx, 4.5 + dy]], z + 1.2, z + 2), 0xd8d4c8, M.solid);
    for (let i = 0; i < 4; i++) g.add(S.box([-4 + dx, 2.6 - i * 2.6 + dy, z + 1.1], [(i === 3 ? 0.5 : 3.6) + dx, 3.4 - i * 2.6 + dy, z + 1.6]), i === 0 ? C.glob : 0x9aa4ae, i === 0 ? M.glow : M.solid);
  };
  if (two) { sheet(-2.4, -1.6, -2.6, 0xdfe6ec); sheet(2, 1.4, -0.4, C.white); } else sheet(0, 0, -0.6, C.white);
  return obj(g);
}

function ufo(): THREE.Object3D {
  const g = grid([-11, -7, -11], [11, 9, 11], R);
  g.add(S.ellipsoid([0, 0, 0], [10, 2.6, 10]), vgrad(C.steelLo, C.steelHi, -2.6, 2.6), M.metal);
  g.add(S.torus([0, 0, 0], [0, 1, 0], 9.2, 0.8), C.steel, M.metal);
  g.add(S.sphere([0, 2, 0], 5.2), C.glass, M.glass);
  g.carve(S.box([-12, -10, -12], [12, -1.2, 12]));
  g.add(S.ellipsoid([0, -1.2, 0], [6, 2, 6]), C.gun, M.metal);
  g.add(S.sphere([0, 3.2, 0], 2.6), 0x7be35f, M.jelly);
  g.add(S.ellipsoid([-0.9, 3.4, 2.1], [0.7, 1.1, 0.5]), 0x07090c, M.gloss);
  g.add(S.ellipsoid([0.9, 3.4, 2.1], [0.7, 1.1, 0.5]), 0x07090c, M.gloss);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(S.sphere([Math.cos(a) * 8.2, 0.2, Math.sin(a) * 8.2], 0.9), [C.glob, C.pink, C.cyan, C.amber][i % 4], M.glow); }
  g.add(S.cone(0, 0, -6.8, -2.6, 3.6, 1.8), 0xc8fff0, M.glow);
  return obj(g);
}

let mini: THREE.Object3D | null = null;
function buildAlienMini(): THREE.Object3D {
  if (!mini) {
    const a = buildAlien({ ...DEFAULT_LOOKS[0], hat: undefined, outfit: undefined, accessory: undefined, expression: 'happy' });
    mini = a.root;
    mini.userData = {}; // alienParts back-reference is circular; clones must not copy it
  }
  return mini.clone(true);
}

// ── public API ───────────────────────────────────────────────────────────────
export const ICON_NAMES = Object.keys(B);
const protos = new Map<string, THREE.Object3D>();

/** A fresh Object3D for an icon (shared geometry). Unknown names fall back to the alien. */
export function buildIcon(name: string): THREE.Object3D {
  let p = protos.get(name);
  if (!p) { p = (B[name] ?? B.alien)(); protos.set(name, p); }
  return p.clone(true);
}

/** Per-icon camera angle tweaks (flat glyphs face front, objects show their depth). */
export const ICON_POSE: Record<string, { yaw: number; pitch: number }> = {
  default: { yaw: -0.42, pitch: 0.2 },
  close: { yaw: -0.18, pitch: 0.12 }, stop: { yaw: -0.18, pitch: 0.12 }, play: { yaw: -0.18, pitch: 0.12 },
  plus: { yaw: -0.3, pitch: 0.12 }, check: { yaw: -0.3, pitch: 0.12 }, back: { yaw: -0.3, pitch: 0.12 },
  code: { yaw: -0.3, pitch: 0.1 }, bolt: { yaw: -0.3, pitch: 0.1 }, sparkle: { yaw: -0.25, pitch: 0.1 },
  star: { yaw: -0.3, pitch: 0.12 }, warn: { yaw: -0.3, pitch: 0.12 }, menu: { yaw: -0.3, pitch: 0.2 },
  clip: { yaw: -0.3, pitch: 0.1 }, refresh: { yaw: -0.3, pitch: 0.12 }, wrench: { yaw: -0.3, pitch: 0.15 },
  gear: { yaw: -0.35, pitch: 0.15 }, eye: { yaw: -0.2, pitch: 0.1 }, ufo: { yaw: -0.3, pitch: 0.38 },
  alien: { yaw: -0.38, pitch: 0.12 }, file: { yaw: -0.3, pitch: 0.12 }, copy: { yaw: -0.3, pitch: 0.12 },
};
export const poseOf = (name: string) => ICON_POSE[name] ?? ICON_POSE.default;

// re-exported for HUD models
export { gacha, fuelFlask, gear, speaker, helix, bigButton, ufo, buildAlienMini, glyphZ };
