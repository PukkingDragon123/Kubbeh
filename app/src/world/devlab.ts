// Ship dev scenes for the voxel lab page: ship:deck (full deck from the home camera),
// ship:close (a crew close-up), ship:tank, ship:console. Renders a few frames then stops.
import * as THREE from 'three';
import { PixelPost, setPost } from './post';
import { buildEnvironment } from './env';
import { buildStations } from './stations';
import { Particles } from './particles';
import { Alien } from './alien';
import { Ufo } from './ufo';
import { makeModel } from './models';
import { DEFAULT_LOOKS, fuel } from '../core/state';
import { studioEnvironment } from '../vox/mesh';

export async function runShipLab(mode: string, r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera) {
  scene.clear();
  scene.background = new THREE.Color(0x03040b);
  scene.fog = new THREE.Fog(0x060814, 36, 130);
  scene.environment = studioEnvironment(r);
  scene.environmentIntensity = 0.42;
  const q = new URLSearchParams(location.search);
  const level = q.has('fuel') ? +q.get('fuel')! : 0.62;
  fuel.value = { ...fuel.value, level, tier: level > 0.5 ? 'full' : level > 0.25 ? 'half' : level > 0.1 ? 'quarter' : 'critical' };
  const fx = new Particles();
  scene.add(fx.group);
  const env = buildEnvironment(scene, 'high');
  const st = buildStations(fx);
  for (const s of st.list) scene.add(s.group);
  const ufos = [new Ufo(0, 0x8cf56b), new Ufo(1, 0xff6fd6)];
  for (const u of ufos) scene.add(u.group);
  // a few placed items
  for (const [id, x, z, rot] of [['beanbag', -2.5, 5.5, 0], ['chomper', 3.5, 5.5, 0], ['lava_lamp', -8.5, -1.5, 0], ['arcade_cab', 9.5, 6.5, 3], ['shroom', -3.5, 6.5, 0]] as [string, number, number, number][]) {
    const m = makeModel(id); m.group.position.set(x, 0, z); m.group.rotation.y = -rot * Math.PI / 2; scene.add(m.group);
  }
  // crew at their stations
  const looks = DEFAULT_LOOKS;
  const aliens: Alien[] = [];
  const place = (i: number, x: number, z: number, face: number, anim: any) => {
    const a = new Alien({ ...looks[i], hat: undefined, outfit: undefined, accessory: undefined });
    a.position.set(x, 0, z); a.heading = a.targetHeading = face; a.anim = anim;
    scene.add(a.root); aliens.push(a); return a;
  };
  place(0, -6.2, 3.15, 0, 'present');
  place(1, 1.2, -5.55, Math.PI, 'type');
  place(2, -9.9, -1.7, -Math.PI / 2, 'research');
  place(3, 2.6, 3.2, 0.4, 'wave');
  place(4, 0.4, 3.6, -0.3, 'wave');

  const home = { target: new THREE.Vector3(0, 1.4, -0.4), radius: 20.5, theta: 0, phi: 1.13 };
  const setCam = (target: THREE.Vector3, radius: number, theta: number, phi: number) => {
    cam.position.set(target.x + radius * Math.sin(phi) * Math.sin(theta), target.y + radius * Math.cos(phi), target.z + radius * Math.sin(phi) * Math.cos(theta));
    cam.lookAt(target);
  };
  cam.fov = 38; cam.near = 0.1; cam.far = 400; cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
  if (mode === 'close') setCam(new THREE.Vector3(-1.5, 0.8, 3.4), 5.5, 0.15, 1.25);
  else if (mode === 'tank') setCam(new THREE.Vector3(9.2, 2.6, -5.6), 9, -0.25, 1.25);
  else if (mode === 'console') setCam(new THREE.Vector3(1.2, 1.5, -6.4), 7.5, 0.1, 1.2);
  else if (mode === 'window') setCam(new THREE.Vector3(0, 3.5, -8), 12, 0, 1.45);
  else setCam(home.target, home.radius, home.theta, home.phi);

  r.toneMapping = THREE.NoToneMapping;
  r.outputColorSpace = THREE.LinearSRGBColorSpace;
  r.setPixelRatio(1);
  const post = new PixelPost(r);
  post.lowResH = q.has('res') ? +q.get('res')! : 440;
  post.setSize(innerWidth, innerHeight, 1);
  setPost(post);
  fx.setViewport(post.h, cam.fov);
  r.shadowMap.enabled = true;
  let n = 0, t = 3;
  r.setAnimationLoop(() => {
    const dt = 1 / 30; t += dt;
    env.update(dt, t);
    for (const s of st.list) s.update?.(dt, t);
    for (const a of aliens) a.update(dt, t);
    for (const u of ufos) u.update(dt, t, fx);
    fx.setCamera(cam); fx.update(dt, t);
    post.render(scene, cam);
    if (++n > 2) { r.setAnimationLoop(null); (window as any).__voxlabDone = true; }
  });
  // triangle budget report (instanced meshes count every instance)
  let tris = 0, meshes = 0, lights = 0;
  scene.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if ((o as THREE.Light).isLight) lights++;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry; const n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    tris += n * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
  });
  const by: Record<string, number> = {};
  const count = (root: THREE.Object3D, label: string) => { let n = 0; root.traverseVisible((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; const g = m.geometry; n += ((g.index ? g.index.count : g.attributes.position.count) / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1); }); by[label] = (by[label] ?? 0) + Math.round(n); };
  env.group.children.forEach((c, i) => count(c, 'env:' + (c.name || c.type) + ':' + i + ':' + (c.children[0]?.name ?? '')));
  st.list.forEach((s2) => count(s2.group, 'station:' + s2.id));
  aliens.forEach((a, i) => count(a.root, 'alien' + i));
  const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 26);
  (window as any).__voxlabStats = { tris: Math.round(tris), meshes, lights, top };
  (window as any).__voxlab = { scene, cam };
}
