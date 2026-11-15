// Wardrobe — dress up the crew on a live 3D turntable. Every tile is a studio photo of the
// real voxel model; the alien on the pedestal is the same model the lab uses. Drag to spin,
// poke for a reaction, equip something and it hops. Changes show up in the lab instantly.
import './wardrobe.css';
import * as THREE from 'three';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_LOOKS, economy, looks, settings, updateLook } from '../../core/state';
import { bus, sfx, toast } from '../../core/bus';
import { pick } from '../../core/util';
import type { AlienLook, Expression } from '../../core/types';
import { Btn, Seg, Win } from '../common/kit';
import { Icon } from '../common/icons';
import { ACCESSORIES, ALL_EXPRESSIONS, HATS, OUTFITS, SKINS, catalogById, ownsExpression, ownsItem } from '../../economy/catalog';
import { buyItem } from '../../economy/genes';
import { unlock } from '../../economy/achievements';
import { buildAlien, type AlienParts, type Face } from '../../vox/alien';
import { animateCosmetics, buildCosmetic, dressAlien } from '../../vox/cosmetics';
import { photoURL, studioLights } from '../../vox/studio';
import { M, S, VoxGrid, mix } from '../../vox/core';
import { studioEnvironment, toObject } from '../../vox/mesh';

type OptTab = 'colors' | 'skin' | 'hat' | 'outfit' | 'accessory' | 'face';

const BODY_SWATCHES = ['#7be35f', '#8cf56b', '#5fd36b', '#6fe0a0', '#9be255', '#3fd6c0', '#52c8ff', '#7aa0ff', '#b48cff', '#ff8fd0', '#ff6f61', '#ffbe3d', '#e9edf0', '#9aa6b2'];
const BELLY_SWATCHES = ['#b6f59a', '#c4ffe0', '#dbff9e', '#e0feff', '#ffe0f2', '#fff1a8', '#ffffff', '#d6dde3'];
const EYE_SWATCHES = ['#1b2a8f', '#0f4fa8', '#3a1b8f', '#0f6b4f', '#8f1b3a', '#5a2a8f', '#2a6f8f', '#111111'];
const BULB_SWATCHES = ['#ff7ad9', '#3b5bff', '#ffe14d', '#59f0ff', '#ff5e5e', '#ffa24d', '#8cf56b', '#b48cff', '#ffffff'];
const QUIRKS: AlienLook['quirk'][] = ['bouncy', 'sleepy', 'nerdy', 'chaotic', 'shy'];
const FIXED_COLOR_SKINS = new Set(['pounce', 'pickle', 'bubblegum', 'ghost', 'magma', 'void', 'gold']);
const EXPR_LABEL: Record<Expression, string> = { happy: 'Happy', derp: 'Derp', sleepy: 'Sleepy', wink: 'Wink', shocked: 'Shocked', cry: 'Tears', tongue: 'Blep', focused: 'Focused', love: 'Heart eyes', grumpy: 'Grumpy' };
const TAB_LABEL: Record<OptTab, string> = { colors: 'Colours', skin: 'Skins', hat: 'Hats', outfit: 'Outfits', accessory: 'Extras', face: 'Faces' };

const lookKey = (l: AlienLook) => [l.skin, l.body, l.belly, l.bulbA, l.bulbB, l.hat, l.outfit, l.accessory].join('|');

// ── photo queue: studio shots are generated one per frame so the panel never stalls ──
const ready = new Map<string, string>();
const waiting = new Map<string, { make: () => THREE.Object3D; w: number; yaw: number; pitch: number; subs: Set<(u: string) => void> }>();
let pumping = false;
function pump() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const next = waiting.entries().next();
    if (next.done) { pumping = false; return; }
    const [key, job] = next.value;
    waiting.delete(key);
    let url = '';
    try { url = photoURL(job.make(), job.w, job.w, { key, yaw: job.yaw, pitch: job.pitch, fill: 0.9 }); } catch (err) { console.warn('[wardrobe] photo failed', key, err); }
    ready.set(key, url);
    for (const s of job.subs) s(url);
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
}
function usePhoto(key: string, make: () => THREE.Object3D, w = 112, yaw = -0.45, pitch = 0.18) {
  const [url, setUrl] = useState(() => ready.get(key) ?? '');
  useEffect(() => {
    const hit = ready.get(key);
    if (hit !== undefined) { setUrl(hit); return; }
    setUrl('');
    let job = waiting.get(key);
    if (!job) { job = { make, w, yaw, pitch, subs: new Set() }; waiting.set(key, job); }
    job.subs.add(setUrl);
    pump();
    return () => { job!.subs.delete(setUrl); };
  }, [key]);
  return url;
}

function alienFor(look: AlienLook, face?: Face) {
  const a = buildAlien({ ...look, expression: (face && face !== 'blink' ? face : look.expression) as Expression });
  dressAlien(a, look);
  if (face) a.setFace(face);
  return a;
}

// ── the panel ────────────────────────────────────────────────────────────────
export function Wardrobe({ close }: { arg: unknown; close: () => void }) {
  const crew = looks.value;
  const [selId, setSelId] = useState(crew[0]?.id ?? 'glorp');
  const [tab, setTab] = useState<OptTab>('hat');
  const [hop, setHop] = useState(0);
  const look = crew.find((l) => l.id === selId) ?? crew[0];
  const eco = economy.value;

  const apply = (patch: Partial<AlienLook>, celebrate = true) => {
    updateLook(look.id, patch);
    bus.emit('look:changed', { lookId: look.id });
    unlock('stylist');
    if (celebrate) setHop((h) => h + 1);
  };

  const tryEquip = (field: 'skin' | 'hat' | 'outfit' | 'accessory', id: string | undefined) => {
    if (!id) { sfx('plop2', .5); apply({ [field]: undefined }); return; }
    if (!ownsItem(eco.owned, id)) {
      const it = catalogById.get(id)!;
      const r = buyItem(id);
      if (!r.ok) { if (r.reason === 'funds') toast(`${it.name} costs ${it.price} genes — you have ${eco.balance}`, 'warn', 'dna'); return; }
    }
    sfx('boing', .5, 1 + Math.random() * .2);
    apply({ [field]: id });
  };
  const tryFace = (e: Expression) => {
    if (!ownsExpression(eco.owned, e)) {
      const r = buyItem(`expr_${e}`);
      if (!r.ok) { if (r.reason === 'funds') toast(`That face costs ${catalogById.get(`expr_${e}`)?.price} genes`, 'warn', 'dna'); return; }
    }
    sfx('blip', .45);
    apply({ expression: e });
  };

  const randomize = () => {
    const owned = (ids: string[]) => ids.filter((i) => ownsItem(eco.owned, i));
    sfx('portal', .45);
    apply({
      body: pick(BODY_SWATCHES), belly: pick(BELLY_SWATCHES), eyes: pick(EYE_SWATCHES), bulbA: pick(BULB_SWATCHES), bulbB: pick(BULB_SWATCHES),
      hat: Math.random() < 0.75 ? pick(owned(HATS)) : undefined,
      outfit: Math.random() < 0.6 ? pick(owned(OUTFITS)) : undefined,
      accessory: Math.random() < 0.6 ? pick(owned(ACCESSORIES)) : undefined,
      expression: pick(ALL_EXPRESSIONS.filter((e) => ownsExpression(eco.owned, e))),
      quirk: pick(QUIRKS),
    });
  };
  const reset = () => {
    const d = DEFAULT_LOOKS.find((x) => x.id === look.id);
    sfx('plop', .5);
    if (d) apply({ ...d });
  };

  const items = tab === 'skin' ? SKINS : tab === 'hat' ? HATS : tab === 'outfit' ? OUTFITS : tab === 'accessory' ? ACCESSORIES : [];

  return (
    <Win title="Wardrobe" icon="wardrobe" onClose={close}
      actions={<><Btn size="sm" tone="ghost" iconOnly icon="sparkle" title="Randomize" onClick={randomize} /><Btn size="sm" tone="ghost" iconOnly icon="refresh" title="Reset to default" onClick={reset} /></>}>
      <div class="wr">
        <nav class="wr-crew" aria-label="Crew">
          {crew.map((l) => <CrewChip key={l.id} look={l} active={l.id === look.id} onClick={() => { sfx('select', .4); setSelId(l.id); }} />)}
        </nav>

        <section class="wr-stage">
          <Turntable look={look} hop={hop} />
          <div class="wr-plaque">
            <input id="wr-name" class="wr-name" value={look.name} maxLength={24} aria-label="Alien name"
              onChange={(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (v) apply({ name: v }, false); }} />
            <Seg value={look.quirk} onChange={(q) => apply({ quirk: q }, false)} options={QUIRKS.map((q) => ({ value: q, label: q }))} label="Personality" />
          </div>
          {FIXED_COLOR_SKINS.has(look.skin) && tab === 'colors' && <span class="wr-note">{catalogById.get(look.skin)?.name} brings its own colours</span>}
        </section>

        <section class="wr-opts">
          <div class="wr-tabs" role="tablist">
            {(Object.keys(TAB_LABEL) as OptTab[]).map((t) => (
              <TabChip key={t} tab={t} look={look} active={tab === t} onClick={() => { sfx('tab', .4); setTab(t); }} />
            ))}
          </div>
          <div class="wr-tab-name">{TAB_LABEL[tab]}</div>
          {tab === 'colors' ? <Colors look={look} apply={(p) => apply(p, false)} /> : (
            <div class="wr-grid">
              {tab === 'face' ? ALL_EXPRESSIONS.map((e) => (
                <FaceTile key={e} look={look} face={e} active={look.expression === e} locked={!ownsExpression(eco.owned, e)} price={catalogById.get(`expr_${e}`)?.price} onClick={() => tryFace(e)} />
              )) : (
                <>
                  {tab !== 'skin' && (
                    <button type="button" class="wr-tile" aria-pressed={!look[tab]} title="Nothing" onClick={() => tryEquip(tab, undefined)}>
                      <span class="wr-none"><Icon name="close" size="lg" /></span>
                    </button>
                  )}
                  {items.map((id) => (
                    <ItemTile key={id} id={id} tab={tab} look={look} active={look[tab as 'skin'] === id} locked={!ownsItem(eco.owned, id)}
                      onClick={() => tryEquip(tab as 'skin' | 'hat' | 'outfit' | 'accessory', id)} />
                  ))}
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </Win>
  );
}

// ── tiles (all real 3D photos) ───────────────────────────────────────────────
function CrewChip({ look, active, onClick }: { look: AlienLook; active: boolean; onClick: () => void }) {
  const url = usePhoto(`crew:${lookKey(look)}`, () => alienFor(look, 'happy').root, 96, -0.35, 0.12);
  return (
    <button type="button" class="wr-crewchip" aria-current={active} onClick={onClick} title={look.name} onMouseEnter={() => sfx('hover', .1)}>
      {url ? <img src={url} alt="" /> : <span class="wr-load" />}
      <span class="wr-crewname">{look.name}</span>
    </button>
  );
}

function TabChip({ tab, look, active, onClick }: { tab: OptTab; look: AlienLook; active: boolean; onClick: () => void }) {
  const make = (): THREE.Object3D => {
    if (tab === 'hat') return buildCosmetic('tophat');
    if (tab === 'outfit') return buildCosmetic('labcoat');
    if (tab === 'accessory') return buildCosmetic('headphones');
    if (tab === 'skin') return alienFor({ ...look, skin: 'pounce', hat: undefined, outfit: undefined, accessory: undefined }, 'happy').head;
    if (tab === 'face') return alienFor({ ...look, hat: undefined, outfit: undefined, accessory: undefined }, 'love').head;
    return paintPot(look.body);
  };
  const url = usePhoto(`tab:${tab}:${tab === 'colors' || tab === 'face' ? look.body : ''}`, make, 64, -0.5, 0.25);
  return (
    <button type="button" role="tab" class="wr-tab" aria-selected={active} title={TAB_LABEL[tab]} onClick={onClick}>
      {url ? <img src={url} alt={TAB_LABEL[tab]} /> : <span class="wr-load" />}
    </button>
  );
}

function ItemTile({ id, tab, look, active, locked, onClick }: { id: string; tab: OptTab; look: AlienLook; active: boolean; locked: boolean; onClick: () => void }) {
  const it = catalogById.get(id);
  const isSkin = tab === 'skin';
  const key = isSkin ? `skinhead:${id}:${FIXED_COLOR_SKINS.has(id) ? '' : look.body + look.bulbA + look.bulbB}` : `cos:${id}`;
  const url = usePhoto(key, () => isSkin ? alienFor({ ...look, skin: id, hat: undefined, outfit: undefined, accessory: undefined }, 'happy').head : buildCosmetic(id), 112, -0.45, isSkin ? 0.1 : 0.22);
  return (
    <button type="button" class={`wr-tile ${locked ? 'locked' : ''} r-${it?.rarity ?? 'common'}`} aria-pressed={active} onClick={onClick}
      title={locked ? `${it?.name} — ${it?.price} genes (click to buy)` : it?.name} onMouseEnter={() => sfx('hover', .1)}>
      {url ? <img src={url} alt={it?.name ?? id} /> : <span class="wr-load" />}
      {locked && <span class="wr-price"><Icon name="dna" size="sm" />{it?.price}</span>}
    </button>
  );
}

function FaceTile({ look, face, active, locked, price, onClick }: { look: AlienLook; face: Expression; active: boolean; locked: boolean; price?: number; onClick: () => void }) {
  const key = `face:${face}:${look.skin}:${FIXED_COLOR_SKINS.has(look.skin) ? '' : look.body}`;
  const url = usePhoto(key, () => alienFor({ ...look, hat: undefined, outfit: undefined, accessory: undefined }, face).head, 96, -0.2, 0.05);
  return (
    <button type="button" class={`wr-tile ${locked ? 'locked' : ''}`} aria-pressed={active} onClick={onClick} title={locked ? `${EXPR_LABEL[face]} — ${price} genes` : EXPR_LABEL[face]} onMouseEnter={() => sfx('hover', .1)}>
      {url ? <img src={url} alt={EXPR_LABEL[face]} /> : <span class="wr-load" />}
      {locked && <span class="wr-price"><Icon name="dna" size="sm" />{price}</span>}
    </button>
  );
}

/** a little voxel paint pot for the colours tab */
function paintPot(color: string) {
  const g = VoxGrid.span([-8, -1, -8], [8, 14, 8], 1.6);
  g.add(S.cyl(0, 0, 6, 0, 9), (x, y) => (y > 7.4 ? 0x9aa6b2 : 0xc8d0da), M.metal);
  g.add(S.cyl(0, 0, 5.2, 8.4, 9.6), parseInt(color.slice(1), 16), M.gloss);
  g.add(S.sphere([3.6, 9.4, 4.2], 1.6), parseInt(color.slice(1), 16), M.gloss);
  g.add(S.torus([0, 9.2, 0], [0, 1, 0], 6, 0.6), 0x8a96a2, M.metal);
  g.paint(S.box([-6.4, 3, -7], [6.4, 6, 7]), mix(0xffffff, parseInt(color.slice(1), 16), 0.4));
  return toObject(g, { size: 0.02, outline: 0x2a3038, outlineWidth: 1 });
}

// ── the live turntable ───────────────────────────────────────────────────────
function pedestal() {
  const g = VoxGrid.span([-30, -6, -30], [30, 1, 30], 1);
  g.add(S.disc([0, -3, 0], [0, 1, 0], 27, 2.6, 8, Math.PI / 8), (x, y, z) => {
    const r = Math.hypot(x, z);
    if (y > -1.2 && r > 21 && r < 23) return Math.floor((Math.atan2(z, x) + Math.PI) * 6) % 2 ? 0xffbe3d : 0x1a1408;
    if (y > -1.2) return Math.floor(x / 6) % 2 === Math.floor(z / 6) % 2 ? 0x3a4a44 : 0x34433d;
    return 0x26302b;
  }, M.metal);
  g.add(S.torus([0, -3, 0], [0, 1, 0], 27.4, 1.1), 0x8cf56b, M.glow);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; g.add(S.sphere([Math.cos(a) * 24.6, -0.4, Math.sin(a) * 24.6], 0.9), 0xc8d0da, M.metal); }
  return toObject(g, { size: 0.016, castShadow: false });
}

function Turntable({ look, hop }: { look: AlienLook; hop: number }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ setLook(l: AlienLook): void; hop(): void; poke(): void } | null>(null);

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      el.classList.add('wr-nogl');
      return;
    }
    const reduce = settings.value.reduceMotion;
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    renderer.domElement.classList.add('wr-canvas');

    const scene = new THREE.Scene();
    scene.environment = studioEnvironment(renderer);
    scene.add(studioLights());
    const spot = new THREE.SpotLight('#eaffef', 26, 6, 0.5, 0.6, 1.6);
    spot.position.set(-0.6, 2.6, 1.6); spot.target.position.set(0, 0.4, 0);
    spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0004;
    scene.add(spot, spot.target);
    const ped = pedestal();
    ped.traverse((o) => { (o as THREE.Mesh).receiveShadow = true; });
    scene.add(ped);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 50);

    const turn = new THREE.Group(); turn.rotation.y = -0.35; scene.add(turn);
    let parts: AlienParts | null = null;
    let current: AlienLook = look;
    let key = '';
    let yawVel = 0, dragging = false, lastX = 0, moved = 0, idleT = 0;
    let hopT = 9, waveT = 9, flash: { f: Face; until: number } | null = null, blinkAt = 1.5, blinkUntil = 0;
    let confetti: THREE.InstancedMesh | null = null;
    const conf: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; c: THREE.Color }[] = [];

    const build = (l: AlienLook) => {
      if (parts) { turn.remove(parts.root); }
      parts = buildAlien(l);
      dressAlien(parts, l);
      parts.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.outline) (o as THREE.Mesh).castShadow = true; });
      turn.add(parts.root);
      key = lookKey(l);
      frame();
    };
    const frame = () => {
      const h = parts?.height ?? 1;
      const w = el.clientWidth || 300, hh = el.clientHeight || 300;
      cam.aspect = w / hh;
      const target = new THREE.Vector3(0, h * 0.44, 0);
      const fitH = (h * 0.74) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const dist = Math.max(fitH, fitH / Math.min(1, cam.aspect * 1.15));
      cam.position.set(0, h * 0.6, dist);
      cam.lookAt(target);
      cam.updateProjectionMatrix();
      renderer.setSize(w, hh, false);
    };
    const burst = () => {
      if (reduce) return;
      if (!confetti) {
        confetti = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), new THREE.MeshBasicMaterial({ toneMapped: false }), 40);
        confetti.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(40 * 3), 3);
        scene.add(confetti);
      }
      conf.length = 0;
      const cols = ['#8cf56b', '#ff6fd6', '#52f2ff', '#ffe14d', '#ffffff'];
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2, up = 1.4 + Math.random() * 1.6;
        conf.push({ p: new THREE.Vector3(0, (parts?.height ?? 1) * 0.55, 0), v: new THREE.Vector3(Math.cos(a) * (0.6 + Math.random()), up, Math.sin(a) * (0.6 + Math.random())), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), c: new THREE.Color(cols[i % cols.length]) });
      }
    };

    build(look);

    api.current = {
      setLook(l) {
        const prev = current; current = l;
        if (lookKey(l) !== key) build(l);
        else if (parts && prev.expression !== l.expression) parts.setFace(l.expression);
      },
      hop() { hopT = 0; waveT = 0; burst(); },
      poke() {
        hopT = 0; waveT = 0.2;
        flash = { f: pick<Face>(['shocked', 'derp', 'love', 'wink', 'tongue']), until: performance.now() / 1000 + 1 };
        sfx('boing', .6, 0.9 + Math.random() * .3);
      },
    };

    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; moved = 0; renderer.domElement.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx); turn.rotation.y += dx * 0.012; yawVel = dx * 0.012 * 60; idleT = 0; };
    const onUp = () => { if (dragging && moved < 4) api.current?.poke(); dragging = false; };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointercancel', onUp);
    const ro = new ResizeObserver(() => frame());
    ro.observe(el);

    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = now / 1000;
      // spin: inertia, then ease back toward a flattering 3/4 view
      if (!dragging) {
        turn.rotation.y += yawVel * dt; yawVel *= Math.pow(0.04, dt);
        idleT += dt;
        if (idleT > 2.5 && Math.abs(yawVel) < 0.05) turn.rotation.y += (Math.sin(t * 0.25) * 0.5 - 0.3 - turn.rotation.y) * dt * 0.8;
      }
      if (parts) {
        const p = parts;
        // breathing jelly + hop with squash & stretch
        hopT += dt;
        const hopY = hopT < 0.5 && !reduce ? Math.sin((hopT / 0.5) * Math.PI) * 0.16 : 0;
        const land = hopT > 0.45 && hopT < 0.75 ? Math.sin(((hopT - 0.45) / 0.3) * Math.PI) * 0.12 : 0;
        const breathe = reduce ? 0 : Math.sin(t * 2.2) * 0.018;
        p.root.position.y = hopY;
        p.jelly.scale.set(1 + land + breathe * 0.6, 1 - land * 1.2 + breathe + (hopY > 0 ? hopY * 0.4 : 0), 1 + land + breathe * 0.6);
        // wave
        waveT += dt;
        const waving = waveT < 1.4 && !reduce;
        p.armR.rotation.z = waving ? 1.9 + Math.sin(waveT * 14) * 0.35 : p.armR.rotation.z * (1 - dt * 6);
        p.armL.rotation.z = Math.sin(t * 2.2) * 0.06;
        // antenna jiggle
        if (p.antL && p.antR && !reduce) { p.antL.rotation.x = Math.sin(t * 3.1) * 0.06 + (hopY ? -0.25 : 0); p.antR.rotation.x = Math.sin(t * 3.4 + 1) * 0.06 + (hopY ? -0.25 : 0); }
        if (p.tail && !reduce) p.tail.rotation.z = Math.sin(t * 2.6) * 0.18;
        // faces: blink, poke reactions
        let f: Face = current.expression;
        if (flash && t < flash.until) f = flash.f; else flash = null;
        if (t > blinkAt) { blinkUntil = t + 0.13; blinkAt = t + 2.2 + Math.random() * 3; }
        if (t < blinkUntil && f !== 'wink') f = 'blink';
        p.setFace(f);
        animateCosmetics(p.root, t, dt);
      }
      if (confetti && conf.length) {
        const m = new THREE.Matrix4(), q = new THREE.Quaternion();
        conf.forEach((c, i) => {
          c.v.y -= 6 * dt; c.p.addScaledVector(c.v, dt);
          if (c.p.y < 0.02) { c.p.y = 0.02; c.v.multiplyScalar(0.4); c.v.y = Math.abs(c.v.y) * 0.3; }
          c.r.x += dt * 8; c.r.y += dt * 6;
          q.setFromEuler(c.r); m.compose(c.p, q, new THREE.Vector3(1, 1, 1));
          confetti!.setMatrixAt(i, m); confetti!.setColorAt(i, c.c);
        });
        confetti.instanceMatrix.needsUpdate = true;
        if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
        if (hopT > 2.4) { conf.length = 0; confetti.visible = false; } else confetti.visible = true;
      }
      renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      api.current = null;
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => { api.current?.setLook(look); }, [lookKey(look), look.expression, look.id]);
  useEffect(() => { if (hop) api.current?.hop(); }, [hop]);

  return <div ref={host} class="wr-turntable" aria-label={`${look.name} on the turntable — drag to spin, click to poke`} />;
}

function Colors({ look, apply }: { look: AlienLook; apply: (p: Partial<AlienLook>) => void }) {
  const rows: { key: 'body' | 'belly' | 'eyes' | 'bulbA' | 'bulbB'; label: string; sw: string[] }[] = [
    { key: 'body', label: 'Jelly', sw: BODY_SWATCHES },
    { key: 'belly', label: 'Belly', sw: BELLY_SWATCHES },
    { key: 'eyes', label: 'Eye shine', sw: EYE_SWATCHES },
    { key: 'bulbA', label: 'Left bulb', sw: BULB_SWATCHES },
    { key: 'bulbB', label: 'Right bulb', sw: BULB_SWATCHES },
  ];
  return (
    <div class="wr-colors">
      {rows.map((r) => (
        <div class="wr-colorrow" key={r.key}>
          <span class="wr-colorlabel">{r.label}</span>
          <div class="wr-swatches">
            {r.sw.map((c) => <button type="button" key={c} class="wr-swatch" style={{ '--c': c } as any} aria-pressed={look[r.key].toLowerCase() === c} aria-label={`${r.label} ${c}`}
              onClick={() => { sfx('plop', .35, 1 + Math.random() * .3); apply({ [r.key]: c }); }} />)}
            <input type="color" class="wr-color-in" value={look[r.key]} aria-label={`Custom ${r.label}`} onInput={(e) => apply({ [r.key]: (e.target as HTMLInputElement).value })} />
          </div>
        </div>
      ))}
    </div>
  );
}
