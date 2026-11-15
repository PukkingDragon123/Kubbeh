// UFO CATCH — the arcade cabinet's game, now a real-time 3D voxel scene. Voxel UFOs drift
// over a voxel city and drop jelly blobs and gene capsules; Blip (the real voxel alien)
// catches them and dodges the space junk. Same rules, score, combo and daily gene cap.
import { useEffect, useRef, useState } from 'preact/hooks';
import * as THREE from 'three';
import { economy, looks, settings } from '../../core/state';
import { sfx } from '../../core/bus';
import { Btn, Win } from '../common/kit';
import { earnGenes, setStatMax, bumpStat } from '../../economy/genes';
import { checkProgress } from '../../economy/achievements';
import { LockedStation } from './Locked';
import { buildAlien } from '../../vox/alien';
import { studioEnvironment } from '../../vox/mesh';
import { blob, bolt, capsule, Cubes, heart, junk, skyline, stars, street, ufo } from './vox/arcadeModels';
import { VoxView } from './vox/VoxView';
import { framed } from './vox/models';
import { pixelBurst } from './vox/pixel';

const W = 160, H = 120;
const wx = (x: number) => (x - W / 2) / 10;
const wy = (y: number) => (H / 2 - y) / 10;

type Kind = 'blob' | 'pink' | 'gene' | 'junk' | 'bolt';
type Obj = { x: number; y: number; vy: number; kind: Kind; spin: number; mesh: THREE.Object3D };

export function ArcadePanel({ close }: { arg: unknown; close: () => void }) {
  const owned = (economy.value.owned.arcade_cab ?? 0) > 0;
  return (
    <Win title="Arcade: UFO CATCH" icon="arcade" onClose={close}>
      {owned ? <Game /> : <LockedStation itemId="arcade_cab" pitch="A real playable cabinet for your HQ. Catch jelly, dodge junk, beat your high score and win a few genes a day." />}
    </Win>
  );
}

function Game() {
  const cv = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'ready' | 'play' | 'over'>('ready');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [earned, setEarned] = useState(0);
  const high = economy.value.stats.arcadeHigh ?? 0;
  const input = useRef({ left: false, right: false, pointerX: null as number | null });
  const stateRef = useRef(state);
  stateRef.current = state;
  const view = useRef({ halfW: 8, halfH: 6, rect: null as DOMRect | null });

  const start = () => { sfx('powerup', .5); setScore(0); setEarned(0); setLives(3); setCombo(0); setState('play'); };

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') { input.current.left = true; e.preventDefault(); }
      if (e.key === 'ArrowRight' || e.key === 'd') { input.current.right = true; e.preventDefault(); }
      if ((e.key === ' ' || e.key === 'Enter') && stateRef.current !== 'play') { e.preventDefault(); start(); }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') input.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') input.current.right = false;
    };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  useEffect(() => {
    const canvas = cv.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    } catch { return; }
    // pixel render: low internal resolution, nearest-neighbour upscale (CSS image-rendering: pixelated)
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b0724');
    scene.fog = new THREE.Fog('#0b0724', 26, 40);
    scene.environment = studioEnvironment(renderer, 0xb48cff);
    scene.add(new THREE.HemisphereLight('#c8d8ff', '#1a1030', 0.9));
    const key = new THREE.DirectionalLight('#fff0e0', 2.6); key.position.set(-4, 8, 10); scene.add(key);
    const fill = new THREE.DirectionalLight('#9fb8ff', 0.8); fill.position.set(6, 2, 4); scene.add(fill);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

    // set dressing
    const sky = skyline(); sky.position.set(0, -5, -4.2); scene.add(sky);
    const road = street(); road.position.set(0, -5, 0); scene.add(road);
    const starField = stars(); scene.add(starField);
    const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), new THREE.MeshStandardMaterial({ color: '#e8e6ff', emissive: '#6a68a8', emissiveIntensity: .6, flatShading: true }));
    moon.position.set(6.5, 4.2, -8); scene.add(moon);
    const cubes = new Cubes(); scene.add(cubes.mesh);

    // hero
    const look = looks.value.find((l) => l.id === 'blip') ?? looks.value[0];
    const hero = buildAlien({ ...look, hat: undefined, outfit: undefined, accessory: undefined }, 0.016);
    hero.root.scale.setScalar(1.15);
    scene.add(hero.root);

    // UFOs with tractor beams
    const beamMat = new THREE.MeshBasicMaterial({ color: '#9fdcff', transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
    const ufos = [{ x: -20, y: 10, vx: 22 }, { x: W + 40, y: 20, vx: -16 }].map((u) => {
      const m = ufo(); scene.add(m);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.9, 1.8, 16, 1, true), beamMat);
      scene.add(beam);
      return { ...u, m, beam, beamT: 0 };
    });

    let px = W / 2, lv = 3, sc = 0, t = 0, spawnT = 0, shake = 0, cmb = 0, hitT = 0, joyT = 0;
    let objs: Obj[] = [];
    let raf = 0, last = performance.now();
    const playing = () => stateRef.current === 'play';
    const make = (k: Kind): THREE.Object3D => {
      const m = k === 'blob' ? blob(0x8cf56b) : k === 'pink' ? blob(0xff6fd6) : k === 'gene' ? capsule() : k === 'junk' ? junk(Math.floor(Math.random() * 4)) : bolt();
      const s = k === 'gene' ? 0.9 : k === 'junk' ? 1.05 : 0.95;
      m.scale.multiplyScalar(s);
      scene.add(m);
      return m;
    };

    const resize = () => {
      const r = canvas.parentElement!.getBoundingClientRect();
      const w = Math.max(1, r.width), h = Math.max(1, r.height);
      const PX = Math.max(2, Math.round(h / 150));
      renderer.setSize(Math.round(w / PX), Math.round(h / PX), false);
      cam.aspect = w / h;
      const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const dist = Math.max(6.4 / tan, 8.4 / (tan * cam.aspect));
      cam.position.set(0, 0.9, dist); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
      view.current = { halfW: dist * tan * cam.aspect, halfH: dist * tan, rect: r as DOMRect };
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement!);

    const finish = (final: number) => {
      const best = final > (economy.value.stats.arcadeHigh ?? 0);
      sfx(best ? 'fanfare' : 'weird', .5);
      if (best && final > 0) pixelBurst(canvas, 'jackpot');
      setStatMax('arcadeHigh', final);
      bumpStat('arcadeGames');
      setEarned(earnGenes(Math.floor(final / 20), `UFO Catch score ${final}`, undefined, 'arcade'));
      checkProgress();
    };
    const reset = () => { lv = 3; sc = 0; cmb = 0; px = W / 2; for (const o of objs) scene.remove(o.mesh); objs = []; };
    (canvas as any).__reset = reset;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const reduce = settings.value.reduceMotion;
      let moving = 0;
      if (playing()) {
        const speed = 90;
        const before = px;
        if (input.current.pointerX !== null) px += Math.max(-1, Math.min(1, (input.current.pointerX - px) / 6)) * speed * dt * 1.4;
        if (input.current.left) px -= speed * dt;
        if (input.current.right) px += speed * dt;
        px = Math.max(6, Math.min(W - 6, px));
        moving = px - before;
        spawnT -= dt;
        const level = 1 + sc / 250;
        if (spawnT <= 0) {
          spawnT = Math.max(0.28, 0.9 - level * 0.08);
          const u = ufos[Math.floor(Math.random() * ufos.length)];
          const r = Math.random();
          const kind: Kind = r < 0.07 ? 'gene' : r < 0.42 ? 'blob' : r < 0.55 ? 'pink' : r < 0.8 ? 'junk' : 'bolt';
          const x = u.x > 4 && u.x < W - 4 ? u.x : 10 + Math.random() * (W - 20);
          if (u.x > 4 && u.x < W - 4) u.beamT = 0.5;
          objs.push({ x, y: u.y + 4, vy: 26 + level * 10 + Math.random() * 12, kind, spin: Math.random() * 6, mesh: make(kind) });
        }
        for (const o of objs) { o.y += o.vy * dt; o.spin += dt * 4; }
        objs = objs.filter((o) => {
          if (o.y > H - 18 && o.y < H - 6 && Math.abs(o.x - px) < 8) {
            scene.remove(o.mesh);
            if (o.kind === 'junk' || o.kind === 'bolt') {
              lv -= 1; cmb = 0; shake = 0.35; hitT = 0.8; sfx('error', .45); cubes.burst(wx(o.x), wy(o.y), 0xc4ccd3, 18, 5);
              setLives(lv); setCombo(0);
              if (lv <= 0) { setState('over'); finish(sc); }
            } else {
              cmb += 1;
              const pts = (o.kind === 'gene' ? 25 : o.kind === 'pink' ? 15 : 10) * (1 + Math.min(4, Math.floor(cmb / 5)));
              sc += pts; setScore(sc); setCombo(cmb);
              if (o.kind === 'gene') { joyT = 0.7; const r = canvas.getBoundingClientRect(); const v = new THREE.Vector3(wx(o.x), wy(o.y), 0).project(cam); pixelBurst({ x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }, 'win', 2); }
              sfx(o.kind === 'gene' ? 'coin' : 'plop', .4, 1 + Math.min(.6, cmb * .03));
              cubes.burst(wx(o.x), wy(o.y), o.kind === 'gene' ? 0xffbe3d : o.kind === 'pink' ? 0xff6fd6 : 0x8cf56b, 14);
            }
            return false;
          }
          if (o.y >= H + 10) { scene.remove(o.mesh); return false; }
          return true;
        });
      }
      for (const u of ufos) {
        u.x += u.vx * dt * (reduce ? .3 : 1);
        if (u.x > W + 30) { u.x = -30; u.y = 6 + Math.random() * 16; }
        if (u.x < -30) { u.x = W + 30; u.y = 6 + Math.random() * 16; }
        u.beamT = Math.max(0, u.beamT - dt);
        const bob = reduce ? 0 : Math.sin(t * 3 + u.x * 0.1) * 0.12;
        u.m.position.set(wx(u.x), wy(u.y) + bob, 0);
        u.m.rotation.set(0.25, t * 1.4, Math.sin(t * 2 + u.x) * 0.08);
        u.beam.visible = u.beamT > 0 || (playing() && Math.sin(t * 0.8 + u.x * 0.05) > 0.7);
        u.beam.position.set(wx(u.x), wy(u.y) - 1.05 + bob, 0);
        beamMat.opacity = 0.08 + (Math.floor(t * 8) % 2) * 0.04;
      }
      for (const o of objs) {
        o.mesh.position.set(wx(o.x), wy(o.y), 0);
        o.mesh.rotation.set(o.kind === 'junk' || o.kind === 'bolt' ? o.spin : 0, o.spin * (o.kind === 'gene' ? 1.2 : 0.6), o.kind === 'bolt' ? o.spin * 0.7 : 0);
      }
      // hero: run, bob, squash, face
      const step = playing() && Math.abs(moving) > 0.05;
      const bob = reduce ? 0 : step ? Math.abs(Math.sin(t * 14)) * 0.18 : Math.sin(t * 3) * 0.04;
      hero.root.position.set(wx(px), -5 + bob, 0.4);
      const targetYaw = step ? (moving > 0 ? 0.9 : -0.9) : 0;
      hero.root.rotation.y += (targetYaw - hero.root.rotation.y) * Math.min(1, dt * 10);
      const sq = reduce ? 1 : 1 + Math.sin(t * (step ? 14 : 3)) * (step ? 0.05 : 0.02);
      hero.jelly.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      hero.legL.rotation.x = step ? Math.sin(t * 14) * 0.7 : 0;
      hero.legR.rotation.x = step ? -Math.sin(t * 14) * 0.7 : 0;
      hero.armL.rotation.z = step ? 0.4 + Math.sin(t * 14) * 0.3 : 0.15;
      hero.armR.rotation.z = step ? -0.4 - Math.sin(t * 14) * 0.3 : -0.15;
      hitT = Math.max(0, hitT - dt); joyT = Math.max(0, joyT - dt);
      const over = stateRef.current === 'over';
      hero.setFace(over ? 'cry' : hitT > 0 ? 'shocked' : joyT > 0 ? 'love' : playing() ? (cmb >= 5 ? 'tongue' : 'focused') : (Math.sin(t * 0.9) > 0.97 ? 'blink' : 'happy'));

      starField.rotation.z = reduce ? 0 : Math.sin(t * 0.05) * 0.02;
      cubes.update(dt);
      shake = Math.max(0, shake - dt);
      const sx = shake > 0 && !reduce ? (Math.random() - .5) * 0.3 : 0, sy = shake > 0 && !reduce ? (Math.random() - .5) * 0.3 : 0;
      cam.position.x = sx; cam.position.y = 0.9 + sy;
      renderer.render(scene, cam);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      renderer.dispose(); scene.clear();
    };
  }, []);

  useEffect(() => { if (state === 'play') (cv.current as any)?.__reset?.(); }, [state]);

  const toLocalX = (e: PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    const ndc = ((e.clientX - r.left) / r.width) * 2 - 1;
    return (ndc * view.current.halfW) * 10 + W / 2;
  };

  return (
    <div class="arcade-cab">
      <div class="arcade-screen screen no-scan"
        onPointerDown={(e) => { input.current.pointerX = toLocalX(e as unknown as PointerEvent); if (state !== 'play') start(); }}
        onPointerMove={(e) => { if ((e as PointerEvent).buttons || (e as PointerEvent).pointerType === 'mouse') input.current.pointerX = toLocalX(e as unknown as PointerEvent); }}
        onPointerLeave={() => { input.current.pointerX = null; }}>
        <canvas ref={cv} />
        <div class="arcade-hud">
          <span class="arcade-score tnum">{score}</span>
          {combo >= 5 && <span class="arcade-combo">×{1 + Math.min(4, Math.floor(combo / 5))}</span>}
          <span class="arcade-lives">{[0, 1, 2].map((i) => <VoxView key={i} size={26} cacheKey={`arcade-heart:${i < lives}`} make={() => framed(heart())} class={i < lives ? '' : 'lost'} yaw={-0.2} pitch={0.1} fill={0.98} />)}</span>
        </div>
        {state !== 'play' && (
          <div class="arcade-overlay">
            <h3 class="arcade-title">{state === 'over' ? 'GAME OVER' : 'UFO CATCH'}</h3>
            {state === 'over' ? <div class="col gap-4"><span class="arcade-big tnum">{score}</span><span class="dim">HI {Math.max(high, score)} · +{earned} genes</span></div>
              : <span class="dim">←/→ · A/D · drag</span>}
            <Btn tone="pink" size="lg" icon="play" onClick={start}>{state === 'over' ? 'Again' : 'Play'}</Btn>
          </div>
        )}
      </div>
      <div class="row between arcade-foot">
        <span>HI {high}</span>
        <span class="dimmer">genes capped at 40/day</span>
      </div>
    </div>
  );
}
