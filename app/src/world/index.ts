// GLOB LABS — the living 3D voxel mothership lab deck. Boots the renderer, builds the ship,
// and wires clicks, crew, furniture, UFOs and fuel alarms to the app's state and bus.
import * as THREE from 'three';
import { PixelPost, POST, setPost } from './post';
import { studioEnvironment } from '../vox/mesh';
import { bus, type SfxName } from '../core/bus';
import { editMode, fuel, openPanelId, setPanel, settings } from '../core/state';
import { speakerAnchor, speakerId, PROFESSOR } from '../core/crew';
import type { Expression, PanelId } from '../core/types';
import { buildEnvironment } from './env';
import { buildStations, type Station } from './stations';
import { Particles } from './particles';
import { Grid } from './grid';
import { Placements } from './placements';
import { CrewController } from './crewctl';
import { CameraRig } from './camera';
import { Overlay } from './overlay';
import { Ufo } from './ufo';
import type { ModelCtx } from './models';

const FOCUS: Partial<Record<PanelId, string>> = { terminal: 'computer', idea: 'idea', fuel: 'tank', shop: 'vending', wardrobe: 'wardrobe', files: 'cabinet' };

let focusImpl: (target: string) => void = () => {};
export const worldApi = {
  /** Ease the camera toward a station id ('computer', 'idea', 'tank', 'vending', 'wardrobe', 'vat', ...), an alien id, a placed item id, or 'home'. */
  focus(target: string) { focusImpl(target); },
};

export async function startWorld(canvas: HTMLCanvasElement): Promise<void> {
  const q = settings.value.quality;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  } catch (err) { throw new Error('WebGL is not available: ' + String((err as Error)?.message ?? err)); }
  if (!renderer.getContext()) throw new Error('WebGL context unavailable');
  const dprCap = () => 2; // the final blit is cheap; the 3D renders at the low internal resolution
  const lowRes = () => (settings.value.quality === 'high' ? 540 : settings.value.quality === 'medium' ? 440 : 360);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap()));
  // tone mapping + sRGB happen in the pixel post pipeline (scene renders linear HDR)
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.shadowMap.enabled = q === 'high';
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x060814, 36, 130);
  scene.background = new THREE.Color(0x03040b);
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.42;

  const rig = new CameraRig(canvas);
  const fx = new Particles();
  fx.scale = q === 'low' ? 0.5 : 1;
  scene.add(fx.group);
  const env = buildEnvironment(scene, q);
  const grid = new Grid();
  const stations = buildStations(fx);
  for (const s of stations.list) {
    scene.add(s.group);
    grid.blockRect(s.rect);
    grid.blockRect([s.rect[0] - 0.4, s.rect[1] - 0.4, s.rect[2] + 0.4, s.rect[3] + 0.4], grid.reserved);
    for (const sp of s.spots) grid.reserve(sp.pos.x, sp.pos.z);
  }
  // keep the "question" runway and the front walkway clear of furniture
  for (const [x, z] of [[0, 5.6], [-1.4, 5.4], [1.4, 5.4]]) grid.reserve(x, z);
  const stationOf = new Map<THREE.Object3D, Station>();
  for (const s of stations.list) for (const p of s.pick) p.traverse((o) => stationOf.set(o, s));

  const placements = new Placements(grid, scene);
  placements.sync();
  const crewCtl = new CrewController(scene, grid, fx, stations, placements);
  crewCtl.sync();
  const ufos = [new Ufo(0, 0x8cf56b), new Ufo(1, 0xff6fd6), new Ufo(2, 0x52f2ff)];
  if (q === 'low') ufos.pop();
  for (const u of ufos) scene.add(u.group);
  const overlay = new Overlay({ rotate: () => placements.rotate(), remove: () => placements.removeSelected() });

  // alarm light (critical fuel)
  const alarm = new THREE.PointLight(0xff2a1a, 0, 30, 1.2); alarm.position.set(0, 6, 0); scene.add(alarm);
  const hemi: THREE.HemisphereLight | undefined = env.hemi;
  const hemiBase = hemi?.color.clone();

  // post: the low-res pixel pipeline
  const post = new PixelPost(renderer);
  post.lowResH = lowRes();
  setPost(post);
  const setupPost = () => { post.setLowRes(lowRes()); };

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap()));
    renderer.setSize(w, h, false);
    rig.resize(w, h);
    post.setSize(w, h, renderer.getPixelRatio());
    fx.setViewport(post.h, rig.camera.fov);
  };
  setupPost();
  resize();
  new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);
  let lastQ = q;
  settings.subscribe((s) => {
    if (s.quality !== lastQ) { lastQ = s.quality; renderer.shadowMap.enabled = s.quality === 'high'; fx.scale = s.quality === 'low' ? 0.5 : 1; setupPost(); }
    rig.sway = !s.reduceMotion;
  });

  // ── picking ────────────────────────────────────────────────────────────────
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pointerIn = false;
  let pointerPx = { x: 0, y: 0 };
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const floorHit = new THREE.Vector3();
  let floorPoint: THREE.Vector3 | null = null;
  canvas.addEventListener('pointermove', (e) => { pointerIn = true; pointerPx = { x: e.clientX, y: e.clientY }; const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); });
  canvas.addEventListener('pointerleave', () => { pointerIn = false; overlay.hover(null, null, 0, 0); canvas.style.cursor = ''; placements.hover(null); });

  type Hit = { kind: 'station'; s: Station; o: THREE.Object3D } | { kind: 'alien'; id: string; o: THREE.Object3D } | { kind: 'placement'; o: THREE.Object3D } | { kind: 'ufo'; u: Ufo; o: THREE.Object3D } | null;
  const pick = (): Hit => {
    ray.setFromCamera(ndc, rig.camera);
    const objs: THREE.Object3D[] = [...crewCtl.pickables(), ...stations.list.flatMap((s) => s.pick), ...placements.pickables(), ...ufos.map((u) => u.group)];
    const hits = ray.intersectObjects(objs, true);
    for (const h of hits) {
      const a = crewCtl.alienOf(h.object); if (a) return { kind: 'alien', id: a.id, o: h.object };
      let o: THREE.Object3D | null = h.object;
      while (o) { const s = stationOf.get(o); if (s) return { kind: 'station', s, o: h.object }; if (o.userData.placementUid) return { kind: 'placement', o: h.object }; if (o.userData.ufo) return { kind: 'ufo', u: o.userData.ufo, o: h.object }; o = o.parent; }
    }
    return null;
  };
  const updateFloor = () => {
    ray.setFromCamera(ndc, rig.camera);
    floorPoint = ray.ray.intersectPlane(floorPlane, floorHit) ? floorHit.clone() : null;
  };

  const sfx = (name: SfxName, volume = 0.6) => bus.emit('sfx', { name, volume });
  const modelCtx: ModelCtx = { fx, pointer: null, busy: 0, thinking: false, sfx };
  const EXPRS: Expression[] = ['happy', 'derp', 'wink', 'shocked', 'love', 'tongue'];

  rig.onClick = (x, y, button) => {
    updateFloor();
    const hit = pick();
    if (editMode.value) {
      if (button === 2) { placements.rotate(); return; }
      placements.hover(floorPoint);
      placements.editClick(hit?.kind === 'placement' ? hit.o : null);
      return;
    }
    if (!hit) return;
    bus.emit('world:click', { target: hit.kind === 'station' ? hit.s.id : hit.kind === 'alien' ? `alien:${hit.id}` : hit.kind === 'ufo' ? 'ufo' : 'placement', screenX: x, screenY: y });
    if (hit.kind === 'station') {
      if (hit.s.panel) { sfx('panel_open', 0.5); setPanel(hit.s.panel); }
      else { sfx('blip', 0.5); bus.emit('ui:toast', { text: `${hit.s.label}: the crew uses this when Claude ${hit.s.id === 'research' ? 'searches the web' : hit.s.id === 'vat' ? 'spawns helper clones' : hit.s.id === 'whiteboard' ? 'plans tasks' : 'builds and fixes things'}.`, tone: 'info' }); }
    } else if (hit.kind === 'alien') {
      const e = crewCtl.get(hit.id);
      if (e) { e.alien.poke(1.2); e.alien.express(EXPRS[Math.floor(Math.random() * EXPRS.length)]); sfx('boing', 0.6); fx.emit({ tile: ['heart', 'sparkle'], pos: e.alien.position.clone().setY(1.3), count: 5, vel: [0, 1.2, 0], spread: [0.6, 0.4, 0.6], life: 0.9, size: 0.16, color: ['#ff6fd6', '#ffe27a'], additive: true }); }
      if (hit.id === PROFESSOR) setTimeout(() => setPanel('idea'), 260);
    } else if (hit.kind === 'placement') {
      placements.click(hit.o, modelCtx);
      const panel = placements.panelOf(hit.o);
      if (panel) { sfx('panel_open', 0.5); setPanel(panel); } else sfx('boing', 0.4);
    } else if (hit.kind === 'ufo') { hit.u.poke(); sfx('ufo', 0.6); }
  };
  rig.onDouble = () => {
    updateFloor();
    const hit = pick();
    if (hit?.kind === 'station') rig.focus(hit.s.anchor, 9);
    else if (hit?.kind === 'alien') { const e = crewCtl.get(hit.id); if (e) rig.focus(e.alien.position.clone().setY(0.8), 5.5); }
    else if (floorPoint) rig.focus(floorPoint.clone().setY(0.6), 10);
  };

  focusImpl = (target: string) => {
    if (target === 'home') return rig.goHome();
    const s = stations.byId.get(target);
    if (s) return rig.focus(s.anchor, target === 'tank' ? 10 : 8.5);
    const e = crewCtl.get(target);
    if (e) return rig.focus(e.alien.position.clone().setY(0.8), 5);
    const p = placements.centerOfItem(target);
    if (p) return rig.focus(p.setY(0.9), 7);
  };
  (window as any).__globWorld = { focus: focusImpl, rig, crewCtl, placements, renderer, scene };

  bus.on('ui:open', ({ panel }) => {
    if (settings.value.reduceMotion) return;
    const st = FOCUS[panel];
    if (st) focusImpl(st);
    else if (panel === 'slot') focusImpl('slot_machine');
    else if (panel === 'arcade') focusImpl('arcade_cab');
  });
  openPanelId.subscribe((p) => {
    if (p === null) rig.goHome();
    else if (!settings.value.reduceMotion) { const st = FOCUS[p]; if (st) focusImpl(st); }
  });
  editMode.subscribe((on) => { if (on) rig.focus(new THREE.Vector3(0, 0, 0), 23, 0, 0.82); else rig.goHome(); });

  // ── loop ───────────────────────────────────────────────────────────────────
  let lastNow = performance.now();
  let t = 0, frame = 0, ready = false, steamT = 0, moteT = 0;
  const v3 = new THREE.Vector3();
  let lastAnchor = '';
  let hoverAlien: string | null = null;
  const loop = () => {
    requestAnimationFrame(loop);
    const now = performance.now();
    const rawDt = (now - lastNow) / 1000; lastNow = now;
    if (document.hidden) return;
    const dt = Math.min(0.05, rawDt);
    t += dt; frame++;
    const reduce = settings.value.reduceMotion;
    rig.update(dt, t, reduce);
    env.update(dt, t);
    for (const s of stations.list) s.update?.(dt, t);
    const busy = crewCtl.tags().filter((x) => x.busy).length;
    modelCtx.busy = busy;
    modelCtx.thinking = [...crewCtl.ents.values()].some((e) => e.member.activity === 'thinking');
    if (pointerIn && frame % 2 === 0) {
      updateFloor();
      modelCtx.pointer = floorPoint ? floorPoint.clone().setY(1) : null;
      if (editMode.value) { placements.hover(floorPoint); canvas.style.cursor = 'crosshair'; overlay.hover(null, null, 0, 0); }
      else {
        const hit = pick();
        hoverAlien = hit?.kind === 'alien' ? hit.id : null;
        let label: string | null = null, sub: string | null = null;
        if (hit?.kind === 'station') { label = hit.s.label; sub = hit.s.panel ? 'Click to open' : 'The crew works here'; }
        else if (hit?.kind === 'alien') { label = null; }
        else if (hit?.kind === 'placement') { const pp = placements.placementOf(hit.o); label = pp ? pp.p.itemId.replace(/_/g, ' ').toUpperCase() : null; sub = placements.panelOf(hit.o) ? 'Click to play' : 'Click to interact'; }
        else if (hit?.kind === 'ufo') { label = 'U.F.O.'; sub = 'Do not poke'; }
        canvas.style.cursor = hit ? 'pointer' : 'grab';
        overlay.hover(label, sub, pointerPx.x, pointerPx.y);
        bus.emit('world:hover', { target: hit ? (hit.kind === 'station' ? hit.s.id : hit.kind) : null });
      }
    }
    placements.update(dt, t, modelCtx);
    crewCtl.update(dt, t, rig.camera);
    for (const u of ufos) u.update(dt, t, fx);

    // ambience: vent steam (soft voxel puffs) and dust motes in the lamp cones
    steamT -= dt; moteT -= dt;
    if (steamT <= 0) { steamT = 0.16; const vnt = env.steamVents[Math.floor(Math.random() * env.steamVents.length)]; fx.emit({ tile: ['steam', 'puff'], pos: vnt, vel: [0.05, 0.8, 0], spread: [0.25, 0.2, 0.25], drag: 0.6, life: [1.4, 2.2], size: [0.1, 0.16], grow: 2.6, color: '#b8c8d0' }); }
    if (moteT <= 0 && !reduce) { moteT = 0.22; const lp = env.lamps[Math.floor(Math.random() * env.lamps.length)].position; fx.emit({ tile: 'dust', pos: [lp.x + (Math.random() - 0.5) * 2, 0.6 + Math.random() * 3.6, lp.z + (Math.random() - 0.5) * 2], vel: [0, 0.05, 0], spread: [0.1, 0.05, 0.1], life: 4, size: 0.022, color: '#ffe2b0', additive: true, wobble: 0.2 }); }
    fx.setCamera(rig.camera);
    fx.update(dt, t);

    // fuel alarm
    const tier = fuel.value.tier;
    const crit = tier === 'critical' || tier === 'empty';
    alarm.intensity = crit ? (Math.sin(t * 6) * 0.5 + 0.5) * 8 : tier === 'quarter' ? (Math.sin(t * 3) * 0.5 + 0.5) * 2 : 0;
    alarm.color.setHex(crit ? 0xff2a1a : 0xffa020);
    POST.uAlarm.value = crit ? 0.25 + Math.sin(t * 6) * 0.2 : 0;
    if (hemi && hemiBase) hemi.color.copy(hemiBase).lerp(new THREE.Color(0x6a1a1a), crit ? 0.2 + Math.sin(t * 6) * 0.1 : 0);

    // speech bubble anchor
    const sid = speakerId.value;
    if (sid) {
      const e = crewCtl.get(sid);
      if (e) {
        e.alien.headTop(v3).project(rig.camera);
        const r = canvas.getBoundingClientRect();
        const x = Math.round((v3.x * 0.5 + 0.5) * r.width + r.left), y = Math.round((-v3.y * 0.5 + 0.5) * r.height + r.top);
        const visible = v3.z < 1 && x > 0 && y > 0 && x < r.width && y < r.height;
        const key = `${sid}:${x >> 1}:${y >> 1}:${visible}`;
        if (key !== lastAnchor) { lastAnchor = key; speakerAnchor.value = { id: sid, x, y, visible }; }
      }
    } else if (lastAnchor) { lastAnchor = ''; speakerAnchor.value = null; }

    // name tags
    if (frame % 2 === 0) {
      const r = canvas.getBoundingClientRect();
      const hovered = pointerIn && !editMode.value ? hoverAlien : null;
      overlay.tagsUpdate(crewCtl.tags().map((tg) => {
        tg.pos.project(rig.camera);
        const x = (tg.pos.x * 0.5 + 0.5) * r.width + r.left, y = (-tg.pos.y * 0.5 + 0.5) * r.height + r.top - 4;
        return { id: tg.id, name: tg.name, label: tg.label, x, y, visible: tg.pos.z < 1 && !openPanelId.value, busy: tg.busy && tg.id !== sid, hovered: hovered === tg.id };
      }));
    }

    post.render(scene, rig.camera);
    if (!ready) { ready = true; bus.emit('world:ready', {}); }
  };
  loop();
}
