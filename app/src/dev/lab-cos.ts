// Dev lab for cosmetics: /?voxlab=cos:<mode>
//   pounce · hats · outfits · acc · held · mix · cat
import * as THREE from 'three';
import { buildAlien } from '../vox/alien';
import { animateCosmetics, buildHeldItem, dressAlien, type HandItem } from '../vox/cosmetics';
import { studioEnvironment } from '../vox/mesh';
import { DEFAULT_LOOKS } from '../core/state';
import { ACCESSORIES, HATS, OUTFITS } from '../economy/catalog';
import type { AlienLook } from '../core/types';

export function run(mode: string) {
  if (mode === 'wardrobe') { void mountWardrobe(); return; }
  const canvas = document.getElementById('world') as HTMLCanvasElement;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(1);
  r.setSize(innerWidth, innerHeight);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;
  r.toneMappingExposure = 0.95;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(mode === 'pounce' ? '#cfd9e2' : '#1a2430');
  scene.environment = studioEnvironment(r);
  scene.add(new THREE.HemisphereLight('#f4fff8', '#3a4a60', 0.8));
  const key = new THREE.DirectionalLight('#fff6e8', 3.0); key.position.set(-2.5, 4, 4); scene.add(key);
  const rim = new THREE.DirectionalLight('#bff8ff', 1.3); rim.position.set(3, 2, -3); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.01, 100);

  const base = DEFAULT_LOOKS[0];
  const look = (p: Partial<AlienLook>): AlienLook => ({ ...base, hat: undefined, outfit: undefined, accessory: undefined, expression: 'happy', ...p });
  const items: THREE.Object3D[] = [];
  const place = (l: AlienLook, i: number, cols: number, sp = 1.15, yaw = -0.3) => {
    const a = buildAlien(l);
    dressAlien(a, l);
    const row = Math.floor(i / cols), col = i % cols;
    a.root.position.set((col - (cols - 1) / 2) * sp, -row * 1.35, 0);
    a.root.rotation.y = yaw;
    scene.add(a.root); items.push(a.root);
    return a;
  };
  const frame = (rows: number, cols: number, sp = 1.15) => {
    const w = cols * sp, h = rows * 1.35;
    const d = Math.max(w / (2 * Math.tan(THREE.MathUtils.degToRad(15)) * (innerWidth / innerHeight)), h / (2 * Math.tan(THREE.MathUtils.degToRad(15)))) * 1.08;
    cam.position.set(0, -(rows - 1) * 0.675 + 0.62, d);
    cam.lookAt(0, -(rows - 1) * 0.675 + 0.55, 0);
  };

  if (mode === 'one') {
    const q = new URLSearchParams(location.search);
    const base0 = q.get('who') ? DEFAULT_LOOKS.find((x) => x.id === q.get('who'))! : base;
    place(look({ ...base0, hat: q.get('hat') ?? undefined, outfit: q.get('outfit') ?? undefined, accessory: q.get('acc') ?? undefined, expression: (q.get('face') as any) ?? 'happy' }), 0, 1, 1, Number(q.get('yaw') ?? -0.35));
    cam.position.set(0, 0.62, 2.4); cam.lookAt(0, 0.6, 0);
  } else if (mode === 'pounce') {
    const l = look({ ...DEFAULT_LOOKS.find((x) => x.id === 'pounce')!, expression: 'happy' });
    const a = place(l, 0, 1, 1, -0.32);
    void a;
    cam.position.set(0, 0.55, 2.2); cam.lookAt(0, 0.52, 0);
  } else if (mode === 'cat') {
    const l0 = DEFAULT_LOOKS.find((x) => x.id === 'pounce')!;
    const combos: Partial<AlienLook>[] = [{ expression: 'happy' }, { expression: 'love' }, { hat: 'tophat' }, { hat: 'beanie', accessory: 'scarf' }, { outfit: 'hoodie', accessory: 'headphones' }, { outfit: 'spacesuit' }, { hat: 'crown', outfit: 'cape' }, { accessory: 'glasses', outfit: 'labcoat' }];
    combos.forEach((c, i) => place(look({ ...l0, ...c }), i, 4));
    frame(2, 4);
  } else if (mode === 'held') {
    const ids: Exclude<HandItem, null>[] = ['hammer', 'wrench', 'magnifier', 'box', 'mug', 'chalk', 'clipboard', 'tablet'];
    ids.forEach((id, i) => {
      const a = place(look({}), i, 4);
      const h = buildHeldItem(id);
      a.anchors.handR.add(h);
      a.armR.rotation.x = -0.9;
    });
    frame(2, 4);
  } else {
    const list = mode === 'hats' ? HATS.map((h) => ({ hat: h }))
      : mode === 'outfits' ? OUTFITS.map((o) => ({ outfit: o }))
      : mode === 'acc' ? ACCESSORIES.map((a) => ({ accessory: a }))
      : [{ hat: 'goggles', outfit: 'labcoat' }, { hat: 'hardhat', outfit: 'overalls' }, { hat: 'wizard', outfit: 'cape' }, { outfit: 'tuxedo', accessory: 'monocle', hat: 'tophat' }, { hat: 'propeller', accessory: 'backpack' }, { outfit: 'hazmat' }, { accessory: 'jetpack', hat: 'halo' }, { outfit: 'spacesuit' }];
    const cols = 4;
    list.forEach((p, i) => place(look(p), i, cols));
    frame(Math.ceil(list.length / cols), cols);
  }

  const spin = new URLSearchParams(location.search).has('spin');
  const back = new URLSearchParams(location.search).has('back');
  if (back) for (const o of items) o.rotation.y += Math.PI;
  (window as any).__voxlab = { scene, cam, items };
  let frames = 0;
  const t0 = performance.now();
  r.setAnimationLoop(() => {
    const t = (performance.now() - t0) / 1000;
    for (const o of items) animateCosmetics(o, t, 0.016);
    if (spin) for (const o of items) o.rotation.y = Math.sin(t * 0.6) * 0.8;
    else if (++frames > 2) { r.setAnimationLoop(null); (window as any).__voxlabDone = true; }
    r.render(scene, cam);
  });
}

/** Mount the Wardrobe panel alone (no world) for visual testing. */
async function mountWardrobe() {
  await import('../ui/styles.css');
  const { h, render } = await import('preact');
  const { Wardrobe } = await import('../ui/shop/Wardrobe');
  const { patchEconomy } = await import('../core/state');
  const q = new URLSearchParams(location.search);
  if (q.has('rich')) patchEconomy((e) => ({ ...e, balance: 5000 }));
  document.getElementById('world')!.style.display = 'none';
  const host = document.createElement('div');
  host.className = 'panel-host size-lg';
  host.style.pointerEvents = 'auto';
  document.getElementById('app')!.appendChild(host);
  render(h(Wardrobe, { arg: null, close() {} }), host);
  (window as any).__voxlab = { ok: true };
  // let photos + turntable settle, then mark done for the screenshot script
  setTimeout(() => { (window as any).__voxlabDone = true; }, Number(q.get('wait') ?? 20000));
}
