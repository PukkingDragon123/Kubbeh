// Ship worker's dev lab: /?voxlab=ship:items | ship:item-<id> | ship:stations | ship:aliens
// Renders a few frames then stops (software GL in CI is slow) and sets window.__voxlabDone.
import * as THREE from 'three';
import { studioEnvironment } from '../vox/mesh';
import { buildItemModel, ITEM_IDS } from '../vox/props/items';

export async function run(mode: string) {
  const canvas = document.getElementById('world') as HTMLCanvasElement;
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(1);
  r.setSize(innerWidth, innerHeight);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a2430');
  scene.environment = studioEnvironment(r);
  scene.add(new THREE.HemisphereLight('#f4fff8', '#30404a', 0.9));
  const key = new THREE.DirectionalLight('#fff6e8', 2.6); key.position.set(-3, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight('#bff8ff', 1.2); rim.position.set(3, 3, -4); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 400);

  if (mode === 'items' || mode.startsWith('item-')) {
    const ids = mode === 'items' ? ITEM_IDS : [mode.slice(5)];
    const cols = Math.ceil(Math.sqrt(ids.length * 1.6));
    ids.forEach((id, i) => {
      const o = buildItemModel(id);
      o.position.set((i % cols - (cols - 1) / 2) * 2.6, 0, Math.floor(i / cols) * 2.8);
      o.rotation.y = -0.35;
      scene.add(o);
    });
    const rows = Math.ceil(ids.length / cols);
    if (ids.length === 1) { cam.position.set(0, 1.6, 4.2); cam.lookAt(0, 0.9, 0); }
    else { cam.position.set(0, rows * 3.4, rows * 2.8 + 12); cam.lookAt(0, 0, rows * 1.2); }
  } else {
    const { runShipLab } = await import('../world/devlab');
    await runShipLab(mode, r, scene, cam);
    return;
  }
  let n = 0;
  r.setAnimationLoop(() => { r.render(scene, cam); if (++n > 2) { r.setAnimationLoop(null); (window as any).__voxlabDone = true; } });
  (window as any).__voxlab = { scene, cam };
}
