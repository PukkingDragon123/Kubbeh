// Dev turntable for voxel models: /?voxlab=alien | /?voxlab=faces | /?voxlab=skins
// Used to check models against the reference art; not part of the app UI.
import * as THREE from 'three';
import { buildAlien, FACES } from '../vox/alien';
import { studioEnvironment } from '../vox/mesh';
import { DEFAULT_LOOKS } from '../core/state';
import type { AlienLook } from '../core/types';

export function runVoxLab(mode: string) {
  document.getElementById('boot')?.remove();
  // fork-owned labs: ship:*, ui:*, cos:*
  const [ns, sub] = mode.includes(':') ? mode.split(':') : ['', mode];
  if (ns === 'ship') { import('./lab-ship').then((m) => m.run(sub)); return; }
  if (ns === 'ui') { import('./lab-ui').then((m) => m.run(sub)); return; }
  if (ns === 'cos') { import('./lab-cos').then((m) => m.run(sub)); return; }
  if (mode === 'export') { import('./export-mod').then((m) => m.run()); return; }
  const canvas = document.getElementById('world') as HTMLCanvasElement;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(Math.min(2, devicePixelRatio));
  r.setSize(innerWidth, innerHeight);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;
  r.toneMappingExposure = 0.95;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(mode === 'alien' ? '#cdf8f4' : '#16202a');
  scene.environment = studioEnvironment(r);
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.01, 100);
  scene.add(new THREE.HemisphereLight('#f4fff8', '#3a5a60', 0.75));
  const key = new THREE.DirectionalLight('#fff6e8', 3.2); key.position.set(-2.5, 4, 4); scene.add(key);
  const rim = new THREE.DirectionalLight('#bff8ff', 1.4); rim.position.set(3, 2, -3); scene.add(rim);

  const base = DEFAULT_LOOKS[0];
  const look = (patch: Partial<AlienLook>): AlienLook => ({ ...base, hat: undefined, outfit: undefined, accessory: undefined, ...patch });
  const items: THREE.Object3D[] = [];
  if (mode === 'alien') {
    const a = buildAlien(look({ expression: 'happy' }));
    a.root.rotation.y = -0.38;
    scene.add(a.root); items.push(a.root);
    cam.position.set(0, 0.62, 2.35); cam.lookAt(0, 0.56, 0);
  } else if (mode === 'faces') {
    FACES.forEach((f, i) => {
      const a = buildAlien(look({ expression: f as any }));
      a.root.position.set((i % 6 - 2.5) * 1.05, i < 6 ? 1.1 : -0.25, 0);
      a.root.rotation.y = -0.2;
      scene.add(a.root); items.push(a.root);
    });
    cam.position.set(0, 0.75, 6.6); cam.lookAt(0, 0.55, 0);
  } else {
    const skins = ['glob', 'pounce', 'pickle', 'bubblegum', 'ghost', 'magma', 'void', 'gold'];
    skins.forEach((s, i) => {
      const a = buildAlien(look({ skin: s, expression: s === 'pounce' ? 'love' : 'happy' }));
      a.root.position.set((i % 4 - 1.5) * 1.2, i < 4 ? 1.15 : -0.2, 0);
      a.root.rotation.y = -0.25;
      scene.add(a.root); items.push(a.root);
    });
    cam.position.set(0, 0.8, 6.2); cam.lookAt(0, 0.6, 0);
  }
  const spin = new URLSearchParams(location.search).has('spin');
  const t0 = performance.now();
  (window as any).__voxlab = { scene, cam, items };
  let frames = 0;
  r.setAnimationLoop(() => {
    const t = (performance.now() - t0) / 1000;
    if (spin) for (const o of items) o.rotation.y = Math.sin(t * 0.6) * 0.7;
    else if (++frames > 2) { r.setAnimationLoop(null); (window as any).__voxlabDone = true; }
    r.render(scene, cam);
  });
}
