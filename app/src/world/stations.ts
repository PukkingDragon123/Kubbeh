// Lab stations: the clickable machines the crew works at. Each exposes work "spots"
// (where an alien stands + which animation it plays), blocked floor cells, and a focus anchor.
import * as THREE from 'three';
import type { PanelId } from '../core/types';
import { Vox, voxMesh, MAT } from './voxel';
import { pixTex, pixText, canvas, pixEllipse } from './pixels';
import { neonText } from './env';
import { crew, economy, fuel } from '../core/state';
import { bus } from '../core/bus';
import type { Particles } from './particles';

export type Anim = 'type' | 'think' | 'research' | 'carry' | 'hammer' | 'whack' | 'scribble' | 'vat' | 'wave' | 'idle' | 'sit' | 'play' | 'sleep' | 'present' | 'jump';

export interface Spot { id: string; station: string; pos: THREE.Vector3; face: number; anim: Anim; holder?: string }

export interface Station {
  id: string;
  label: string;
  panel?: PanelId;
  group: THREE.Group;
  /** objects that respond to clicks / hover */
  pick: THREE.Object3D[];
  /** blocked floor rect in world units [x0, z0, x1, z1] */
  rect: [number, number, number, number];
  anchor: THREE.Vector3;
  spots: Spot[];
  update?(dt: number, t: number): void;
}

const S = 0.125;
const faceToward = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.x - from.x, to.z - from.z);

function hitBox(w: number, h: number, d: number, y = h / 2) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
  m.position.y = y;
  return m;
}

function screenMesh(w: number, h: number, tex: THREE.Texture, glow = 1.35) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(glow, glow, glow) });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

function label(text: string, color = '#9dff8a', scale = 2) {
  const w = (text.length * 6 + 4) * scale, h = 11 * scale;
  const tex = pixTex(w, h, (ctx) => { ctx.fillStyle = '#0b100dcc'; ctx.fillRect(0, 0, w, h); pixText(ctx, text, 2 * scale, 2 * scale, scale, color); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w / 90, h / 90), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true }));
  return m;
}

// ── MAIN COMPUTER BANK ───────────────────────────────────────────────────────
function computerBank(fx: Particles): Station {
  const g = new THREE.Group();
  const v = new Vox();
  const TOP = 0x3a4640, LEG = 0x232b27, DRW = 0x2e3833;
  // desk 40 x 12 voxels, height 5 (0.625)
  v.box(0, 4, 0, 40, 5, 12, TOP);
  v.box(0, 0, 0, 2, 4, 12, LEG).box(38, 0, 0, 40, 4, 12, LEG);
  v.box(2, 0, 0, 10, 4, 11, DRW).box(4, 2, 11, 8, 3, 12, 0x9aa69e);
  // server tower under desk with blinky lights
  v.box(28, 0, 1, 34, 4, 10, 0x1b211e);
  for (let i = 0; i < 4; i++) v.set(29 + i, 3, 10, [0x8cf56b, 0xff6fd6, 0x52f2ff, 0xffbe3d][i], 2.5);
  // keyboards
  for (const kx of [6, 17, 28]) { v.box(kx, 5, 7, kx + 7, 6, 10, 0x2b302d); for (let i = 0; i < 6; i++) v.set(kx + 1 + i, 6, 8, i % 2 ? 0x9dff8a : 0x52f2ff, 1.2); }
  // CRT casings (beige-green retro)
  const crt = (x0: number, w: number, h: number, d: number) => {
    v.rbox(x0, 5, 1, x0 + w, 5 + h, 1 + d, 1, 0xb9b79a);
    v.box(x0 + 1, 5 + 1, 1 + d, x0 + w - 1, 5 + h - 1, 2 + d, 0x1a1f1c);
    v.box(x0 + w - 3, 6, 1 + d, x0 + w - 2, 7, 2 + d, 0xff5a5a, 2);
  };
  crt(1, 11, 9, 6); crt(13, 14, 12, 7); crt(29, 11, 9, 6);
  // antenna on top of the main CRT
  v.box(19, 17, 4, 20, 22, 5, 0x9aa69e).set(19, 22, 4, 0xff6fd6, 3);
  const body = voxMesh(v, { size: S, center: 'none', origin: [20, 0, 6], material: MAT.solid });
  g.add(body);

  // screens: canvas textures redrawn live
  const scr = [canvas(128, 96), canvas(160, 128), canvas(128, 96)];
  const tex = scr.map(({ c }) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; });
  const sL = screenMesh(9 * S, 7 * S, tex[0]); sL.position.set((1 + 5.5 - 20) * S, (5 + 4.5) * S, (2 + 6 - 6) * S + 0.005);
  const sC = screenMesh(12 * S, 10 * S, tex[1]); sC.position.set((13 + 7 - 20) * S, (5 + 6) * S, (2 + 7 - 6) * S + 0.005);
  const sR = screenMesh(9 * S, 7 * S, tex[2]); sR.position.set((29 + 5.5 - 20) * S, (5 + 4.5) * S, (2 + 6 - 6) * S + 0.005);
  g.add(sL, sC, sR);
  const glowLight = new THREE.PointLight(0x52f2ff, 4, 5, 1.6); glowLight.position.set(0, 1.3, 1.2); g.add(glowLight);

  const hit = hitBox(5.2, 2.2, 1.6); g.add(hit);
  g.position.set(1.2, 0, -7.0);
  const lbl = label('TERMINAL'); lbl.position.set(0, 2.45, 0.2); g.add(lbl);

  // live log
  const log: string[] = ['GLOB TERMINAL V5', 'READY.'];
  let burst = 0;
  const push = (s: string) => { log.push(s.toUpperCase().slice(0, 24)); if (log.length > 40) log.shift(); };
  let lastLabels = '';
  bus.on('turn:writing', () => { burst = 1.2; });
  bus.on('tool:start', ({ label: l }) => push('> ' + l));
  bus.on('turn:start', ({ prompt }) => push('$ ' + prompt));
  bus.on('turn:end', ({ ok }) => push(ok ? 'DONE ✓' : 'ERR !'));
  const CODE = ['FN GLORP() {', '  LET X = 42;', '  IF JELLY {', '    WOBBLE();', '  }', 'RETURN OK;', 'FOR I IN 0..N', '  SPAWN(CLONE)', 'CONST G = 9.8', '// TODO: SNACK', 'PLAYER.JUMP()', 'ENEMY.CHOMP()'];
  let acc = 0, sweep = 0;

  const spots: Spot[] = [-1.5, 0, 1.5].map((dx, i) => {
    const pos = new THREE.Vector3(1.2 + dx, 0, -5.75);
    return { id: `pc${i}`, station: 'computer', pos, face: Math.PI, anim: 'type' as Anim };
  });

  return {
    id: 'computer', label: 'Main Terminal', panel: 'terminal', group: g, pick: [hit, body], rect: [-1.4, -7.9, 3.8, -6.1],
    anchor: new THREE.Vector3(1.2, 1.2, -6.4), spots,
    update(dt, t) {
      acc += dt; sweep += dt;
      if (burst > 0) { burst -= dt; if (Math.random() < dt * 14) push(CODE[Math.floor(Math.random() * CODE.length)]); }
      const busy = crew.value.filter((m) => m.activity !== 'idle' && m.activity !== 'sleeping');
      const labels = busy.map((m) => m.name + ':' + m.label).join('|');
      if (labels !== lastLabels) { lastLabels = labels; for (const m of busy) if (!log.some((l) => l.includes(m.label.toUpperCase().slice(0, 12)))) push(`${m.name}: ${m.label}`); }
      if (acc < (busy.length || burst > 0 ? 0.12 : 0.4)) return;
      acc = 0;
      // centre: log
      { const { ctx, c } = scr[1]; ctx.fillStyle = '#04120a'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#0d2a17'; for (let y = 0; y < c.height; y += 2) ctx.fillRect(0, y, c.width, 1);
        pixText(ctx, 'GLOB TERMINAL', 4, 3, 1, '#ff6fd6');
        const lines = log.slice(-14);
        lines.forEach((l, i) => pixText(ctx, l, 4, 14 + i * 8, 1, i === lines.length - 1 ? '#d8ffc8' : '#79e86a'));
        if (Math.floor(t * 2) % 2) { ctx.fillStyle = '#d8ffc8'; ctx.fillRect(4, 14 + lines.length * 8, 5, 7); }
        tex[1].needsUpdate = true; }
      // left: fuel + genes
      { const { ctx, c } = scr[0]; const f = fuel.value; ctx.fillStyle = '#04100c'; ctx.fillRect(0, 0, c.width, c.height);
        const col = f.tier === 'full' ? '#8cf56b' : f.tier === 'half' ? '#52f2ff' : f.tier === 'quarter' ? '#ffbe3d' : '#ff5a5a';
        pixText(ctx, 'FUEL', 6, 6, 2, col);
        pixText(ctx, `${Math.round(f.level * 100)}%`, 64, 6, 2, col);
        ctx.fillStyle = '#0f2a1a'; ctx.fillRect(6, 26, 116, 12); ctx.fillStyle = col; ctx.fillRect(7, 27, Math.round(114 * f.level), 10);
        for (const m of [0.5, 0.25, 0.1]) { ctx.fillStyle = '#ffffff88'; ctx.fillRect(7 + Math.round(114 * m), 24, 1, 16); }
        pixText(ctx, 'GENES ' + economy.value.balance, 6, 48, 1, '#8cf56b');
        pixText(ctx, 'CREW  ' + crew.value.length, 6, 60, 1, '#52f2ff');
        pixText(ctx, busy.length ? 'BUSY  ' + busy.length : 'IDLE', 6, 72, 1, busy.length ? '#ff6fd6' : '#79e86a');
        tex[0].needsUpdate = true; }
      // right: radar
      { const { ctx, c } = scr[2]; ctx.fillStyle = '#030d10'; ctx.fillRect(0, 0, c.width, c.height);
        const cx = 64, cy = 50; ctx.strokeStyle = '#1d6b74';
        for (const r of [14, 28, 42]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
        const a = sweep * 2.2; ctx.strokeStyle = '#52f2ff'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 42, cy + Math.sin(a) * 42); ctx.stroke();
        crew.value.forEach((m, i) => { const ang = i * 1.9 + 0.4, rr = 12 + (i * 9) % 30; ctx.fillStyle = m.activity === 'idle' ? '#2f8f4a' : '#ff6fd6'; ctx.fillRect(Math.round(cx + Math.cos(ang) * rr) - 1, Math.round(cy + Math.sin(ang) * rr) - 1, 3, 3); });
        pixText(ctx, busy.length ? 'WORKING' : 'SCANNING', 4, 86, 1, busy.length ? '#ff6fd6' : '#52f2ff');
        tex[2].needsUpdate = true; }
      glowLight.intensity = 3 + (busy.length ? 2 + Math.sin(t * 20) * 0.6 : 0);
      if (burst > 0 && Math.random() < 0.3) fx.emit({ tile: ['code1', 'code2', 'code3', 'code4'], pos: [1.2 + (Math.random() - 0.5) * 3, 1.6, -6.3], vel: [0, 0.6, 0.4], spread: [0.3, 0.2, 0.2], life: 1.2, size: 0.18, color: ['#9dff8a', '#52f2ff'], additive: true });
    },
  };
}

// ── PROF. GLORP'S IDEA DESK + CHALKBOARD ─────────────────────────────────────
function ideaDesk(): Station {
  const g = new THREE.Group();
  const v = new Vox();
  v.box(0, 4, 0, 20, 5, 9, 0x6b4a2e).box(0, 0, 0, 2, 4, 9, 0x4d3520).box(18, 0, 0, 20, 4, 9, 0x4d3520).box(2, 1, 1, 18, 4, 2, 0x5a3e26);
  // paper stacks + desk lamp + coffee mug + lightbulb trophy
  v.box(2, 5, 2, 6, 7, 6, 0xeeeedd).box(2, 7, 2, 6, 8, 6, 0xdcdcc8);
  v.box(15, 5, 2, 17, 6, 4, 0x2f6b4a).box(15, 6, 2, 16, 11, 3, 0x2f6b4a).box(13, 10, 1, 17, 11, 4, 0x3d8f63).box(14, 9, 2, 16, 10, 3, 0xfff1a8, 3);
  v.cyl(9.5, 6, 1.5, 5, 8, 0xff6fd6).set(11, 6, 6, 0xff6fd6);
  v.ellipsoid(12, 6.5, 6.5, 1.3, 1.3, 1.3, 0xffe27a, 2.2);
  const desk = voxMesh(v, { size: S, center: 'xz' });
  g.add(desk);
  // chalkboard on legs behind the professor
  const cb = new Vox();
  cb.box(0, 0, 0, 1, 22, 1, 0x4d3520).box(33, 0, 0, 34, 22, 1, 0x4d3520).box(0, 8, -1, 34, 22, 0, 0x6b4a2e).box(1, 9, -1, 33, 21, 0, 0x1d3a2a);
  const board = voxMesh(cb, { size: S, center: 'xz' });
  board.position.set(0, 0, -1.1);
  const chalk = pixTex(128, 52, (ctx) => {
    ctx.fillStyle = '#1d3a2a'; ctx.fillRect(0, 0, 128, 52);
    pixText(ctx, 'IDEAS!!', 4, 3, 1, '#fff6c8');
    pixText(ctx, 'JUMP+GRAVITY', 4, 14, 1, '#d6f5ff');
    pixText(ctx, '= ???', 20, 23, 1, '#ffd0f0');
    // platformer doodle
    ctx.fillStyle = '#e8f0d8'; ctx.fillRect(74, 40, 50, 2); ctx.fillRect(84, 30, 14, 2); ctx.fillRect(104, 22, 14, 2);
    pixEllipse(ctx, 88, 25, 3, 3, '#9dff8a'); ctx.fillStyle = '#000'; ctx.fillRect(87, 24, 1, 2); ctx.fillRect(89, 24, 1, 2);
    ctx.strokeStyle = '#ffffffaa'; ctx.beginPath(); ctx.moveTo(78, 38); ctx.quadraticCurveTo(84, 18, 92, 28); ctx.stroke();
    pixText(ctx, 'LOOP:', 4, 35, 1, '#9dff8a'); pixText(ctx, 'EXPLORE>LOOT', 4, 43, 1, '#9dff8a');
    pixText(ctx, '★', 112, 6, 1, '#ffe27a');
  });
  const chalkM = new THREE.Mesh(new THREE.PlaneGeometry(32 * S, 12 * S), new THREE.MeshStandardMaterial({ map: chalk, roughness: 0.95, emissive: new THREE.Color('#ffffff'), emissiveMap: chalk, emissiveIntensity: 0.18 }));
  chalkM.position.set(0, 15 * S, -1.1 + 0.01 - 0.06 + 0.06);
  g.add(board, chalkM);
  const hit = hitBox(2.6, 1.4, 1.2); g.add(hit);
  const lbl = label('IDEA LAB', '#ffe27a'); lbl.position.set(0, 3.2, -1.05); g.add(lbl);
  g.position.set(-6.2, 0, 2.3);
  const spots: Spot[] = [{ id: 'glorp', station: 'idea', pos: new THREE.Vector3(-6.2, 0, 1.55), face: 0, anim: 'present' }];
  return { id: 'idea', label: "Prof. Glorp's Idea Lab", panel: 'idea', group: g, pick: [hit, desk, board], rect: [-7.6, 0.9, -4.8, 2.9], anchor: new THREE.Vector3(-6.2, 1.1, 1.8), spots };
}

// ── FUEL TANK ────────────────────────────────────────────────────────────────
const LIQUID_FRAG = /* glsl */ `
  uniform float uTime; uniform vec3 uDeep; uniform vec3 uBright; uniform float uAlarm;
  varying vec2 vUv; varying vec3 vPos;
  void main() {
    float band = smoothstep(0.0, 1.0, vUv.y);
    vec3 c = mix(uDeep, uBright, band * 0.8 + 0.1);
    float stripe = step(0.85, fract(vUv.y * 6.0 - uTime * 0.25)) * 0.25;
    float swirl = sin(vUv.x * 18.0 + uTime * 1.5 + vUv.y * 9.0) * 0.06;
    c += stripe + swirl;
    c = mix(c, vec3(1.0, 0.25, 0.2), uAlarm * (0.5 + 0.5 * sin(uTime * 8.0)) * 0.35);
    gl_FragColor = vec4(c * 1.35, 0.92);
  }`;
const LIQUID_VERT = /* glsl */ `varying vec2 vUv; varying vec3 vPos; void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

function fuelTank(fx: Particles): Station {
  const g = new THREE.Group();
  const H = 3.9, R = 1.12, BASE = 0.7;
  const v = new Vox();
  v.cyl(0, 0, 11, 0, 5, (x, y) => (y === 4 ? 0x56645e : (x + y) % 5 === 0 ? 0x2b3631 : 0x39433d));
  v.cyl(0, 0, 10, 5, 6, 0x56645e);
  // hazard stripes
  for (let x = -11; x <= 11; x++) for (let y = 1; y < 3; y++) { const z = 10; if (v.has(x, y, z) || v.has(x, y, z - 1)) v.set(x, y, 11 - (Math.abs(x) > 7 ? 2 : Math.abs(x) > 4 ? 1 : 0), ((x + y) & 2) ? 0xffbe3d : 0x1a1408); }
  // top cap
  const cap = new Vox();
  cap.cyl(0, 0, 10.5, 0, 3, 0x39433d).cyl(0, 0, 7, 3, 4, 0x56645e).box(-1, 4, -1, 2, 7, 2, 0x56645e);
  const base = voxMesh(v, { size: S, center: 'none', origin: [0, 0, 0], material: MAT.metal });
  const capM = voxMesh(cap, { size: S, center: 'none', origin: [0, 0, 0], material: MAT.metal });
  capM.position.y = BASE + H;
  g.add(base, capM);
  // glass
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, H, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0xbfffe0, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2 }));
  glass.position.y = BASE + H / 2; glass.renderOrder = 5;
  // support ribs
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.14, H, 0.14), new THREE.MeshStandardMaterial({ color: 0x39433d, metalness: 0.7, roughness: 0.4 }));
    rib.position.set(Math.cos(a) * (R + 0.12), BASE + H / 2, Math.sin(a) * (R + 0.12)); g.add(rib);
  }
  // liquid
  const liqMat = new THREE.ShaderMaterial({ vertexShader: LIQUID_VERT, fragmentShader: LIQUID_FRAG, transparent: true, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uDeep: { value: new THREE.Color('#1f7a2a') }, uBright: { value: new THREE.Color('#a8ff7a') }, uAlarm: { value: 0 } } });
  const liqGeo = new THREE.CylinderGeometry(R, R, 1, 32, 1);
  liqGeo.translate(0, 0.5, 0);
  const liquid = new THREE.Mesh(liqGeo, liqMat);
  liquid.position.y = BASE;
  g.add(liquid, glass);
  const tankLight = new THREE.PointLight(0x8cf56b, 10, 7, 1.6); tankLight.position.set(0, BASE + 1.4, 1.4); g.add(tankLight);

  // markers at 50 / 25 / 10 %
  const markerDefs = [{ k: 0.5, col: 0xffbe3d, txt: '50%' }, { k: 0.25, col: 0xff8a3d, txt: '25%' }, { k: 0.1, col: 0xff4040, txt: '10%' }];
  const markers = markerDefs.map((m) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.13, 0.045, 6, 40), new THREE.MeshStandardMaterial({ color: 0x6b7d72, metalness: 0.8, roughness: 0.3 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = BASE + H * m.k;
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x222222, toneMapped: false });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.12), lampMat);
    lamp.position.set(0, BASE + H * m.k, R + 0.22);
    const tag = label(m.txt, '#ffd77a', 2); tag.position.set(0.55, BASE + H * m.k, R + 0.2); tag.scale.setScalar(0.85);
    g.add(ring, lamp, tag);
    return { ...m, lampMat };
  });

  // beacons on top
  const beacons: THREE.Group[] = [];
  for (const sx of [-0.55, 0.55]) {
    const b = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x331a0a, toneMapped: false }));
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    beam.rotation.z = Math.PI / 2; beam.position.x = 1.3;
    b.add(dome, beam);
    b.position.set(sx, BASE + H + 0.42, 0);
    g.add(b); beacons.push(b);
  }

  // digital readout on the base
  const { c, ctx } = canvas(64, 20);
  const rtex = new THREE.CanvasTexture(c); rtex.colorSpace = THREE.SRGBColorSpace; rtex.magFilter = THREE.NearestFilter; rtex.minFilter = THREE.NearestFilter; rtex.generateMipmaps = false;
  const readout = screenMesh(0.9, 0.28, rtex, 1.5); readout.position.set(0, 0.42, 1.4 + 0.01);
  g.add(readout);
  const fuelSign = neonText('FUEL', [0x8cf56b], 0.07, 3); fuelSign.group.position.set(-0.4, BASE + H + 0.9, 0.2); g.add(fuelSign.group);

  const hit = hitBox(2.6, H + 1.2, 2.6, (H + 1.2) / 2); g.add(hit);
  g.position.set(9.2, 0, -5.6);
  let shown = fuel.value.level, lastTxt = '';
  return {
    id: 'tank', label: 'Fuel Tank', panel: 'fuel', group: g, pick: [hit], rect: [7.8, -7.0, 10.6, -4.2],
    anchor: new THREE.Vector3(9.2, 2.4, -5.6), spots: [],
    update(dt, t) {
      const f = fuel.value;
      shown += (f.level - shown) * Math.min(1, dt * 2.5);
      const lvl = Math.max(0.02, Math.min(1, shown));
      liquid.scale.y = H * lvl * (1 + Math.sin(t * 3) * 0.004);
      liqMat.uniforms.uTime.value = t;
      const crit = f.tier === 'critical' || f.tier === 'empty';
      liqMat.uniforms.uAlarm.value = crit ? 1 : 0;
      (liqMat.uniforms.uBright.value as THREE.Color).set(f.tier === 'full' ? '#a8ff7a' : f.tier === 'half' ? '#9dfff0' : f.tier === 'quarter' ? '#ffd27a' : '#ff8a6a');
      (liqMat.uniforms.uDeep.value as THREE.Color).set(f.tier === 'full' ? '#1f7a2a' : f.tier === 'half' ? '#1a6a6a' : f.tier === 'quarter' ? '#8a5a10' : '#7a1a14');
      tankLight.color.set(f.tier === 'full' ? 0x8cf56b : f.tier === 'half' ? 0x52f2ff : f.tier === 'quarter' ? 0xffbe3d : 0xff4a3a);
      tankLight.intensity = 8 + Math.sin(t * 2) * 1.5 + (crit ? Math.sin(t * 9) * 4 : 0);
      const blink = Math.floor(t * 3) % 2 === 0;
      for (const m of markers) m.lampMat.color.setHex(lvl <= m.k + 0.001 ? (blink ? m.col : 0x3a1a0a) : 0x1d2420);
      const warn = f.tier === 'quarter' || crit;
      beacons.forEach((b, i) => {
        b.rotation.y = warn ? t * (crit ? 7 : 4) + i * Math.PI : 0;
        const beam = b.children[1] as THREE.Mesh; const bm = beam.material as THREE.MeshBasicMaterial;
        bm.opacity = warn ? 0.22 : 0; bm.color.setHex(crit ? 0xff3020 : 0xffa020);
        ((b.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(warn ? (crit ? 0xff3020 : 0xffa020) : 0x331a0a);
      });
      if (Math.random() < dt * (2 + lvl * 6)) fx.emit({ tile: 'bubble', pos: [9.2 + (Math.random() - 0.5) * 1.6, BASE + 0.2, -5.6 + (Math.random() - 0.5) * 1.6], vel: [0, 0.6 + Math.random() * 0.5, 0], spread: [0.05, 0.1, 0.05], life: Math.max(0.4, H * lvl / 1.0), size: [0.08, 0.16], color: '#d8ffe0', wobble: 0.3 });
      const txt = `${Math.round(f.level * 100)}%`;
      if (txt !== lastTxt || crit) {
        lastTxt = txt;
        ctx.fillStyle = '#05100a'; ctx.fillRect(0, 0, 64, 20);
        pixText(ctx, txt, 4, 4, 2, f.tier === 'full' ? '#8cf56b' : f.tier === 'half' ? '#52f2ff' : f.tier === 'quarter' ? '#ffbe3d' : (blink ? '#ff5a5a' : '#5a1a1a'));
        rtex.needsUpdate = true;
      }
    },
  };
}

// ── GENE-O-MAT VENDING MACHINE ───────────────────────────────────────────────
function vending(): Station {
  const g = new THREE.Group();
  const v = new Vox();
  v.rbox(0, 0, 0, 12, 20, 8, 1, 0x5a2a6b);
  v.box(1, 2, 8, 11, 17, 9, 0x1a0f22);
  v.box(1, 1, 8, 8, 2, 9, 0x111111);
  v.box(9, 6, 8, 11, 9, 9, 0x2b2b2b).set(10, 7, 9, 0xffe27a, 2.5);
  v.box(0, 20, 0, 12, 21, 8, 0x3a1a46);
  const body = voxMesh(v, { size: S, center: 'xz' });
  g.add(body);
  const front = pixTex(64, 96, (ctx) => {
    ctx.fillStyle = '#12081a'; ctx.fillRect(0, 0, 64, 96);
    const items = ['#8cf56b', '#ff6fd6', '#52f2ff', '#ffbe3d', '#b48cff', '#ff5a5a'];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const x = 4 + c * 20, y = 6 + r * 22;
      ctx.fillStyle = '#2a1636'; ctx.fillRect(x, y + 14, 16, 2);
      ctx.fillStyle = items[(r * 3 + c) % items.length];
      if ((r + c) % 3 === 0) pixEllipse(ctx, x + 8, y + 8, 5, 5, ctx.fillStyle as string);
      else if ((r + c) % 3 === 1) ctx.fillRect(x + 3, y + 3, 10, 11);
      else { ctx.fillRect(x + 6, y + 2, 4, 12); ctx.fillRect(x + 3, y + 6, 10, 4); }
      pixText(ctx, `${(r + 1) * 15}`, x + 2, y + 17, 1, '#ffe27a');
    }
  });
  const scr = screenMesh(10 * S, 15 * S, front, 1.25); scr.position.set(0, 9.5 * S, 4.5 * S + 0.04); g.add(scr);
  const sign = neonText('GENE-O-MAT', [0xff6fd6, 0x8cf56b], 0.034, 3.2); sign.group.position.set(-0.6 * 1.6 / 1.6 - 0.18, 18.2 * S, 4.5 * S + 0.06); g.add(sign.group);
  const light = new THREE.PointLight(0xff6fd6, 5, 5, 1.6); light.position.set(0, 1.4, 1.4); g.add(light);
  const hit = hitBox(1.6, 2.6, 1.2); g.add(hit);
  const lbl = label('SHOP', '#ff6fd6'); lbl.position.set(0, 2.95, 0.3); g.add(lbl);
  g.position.set(11.0, 0, -1.4); g.rotation.y = -Math.PI / 2;
  return { id: 'vending', label: 'GENE-O-MAT Shop', panel: 'shop', group: g, pick: [hit, body], rect: [10.3, -2.3, 11.8, -0.5], anchor: new THREE.Vector3(10.6, 1.4, -1.4), spots: [] };
}

// ── WARDROBE POD ─────────────────────────────────────────────────────────────
function wardrobe(): Station {
  const g = new THREE.Group();
  const v = new Vox();
  v.rbox(0, 0, 0, 14, 22, 8, 3, 0x1f6b6b);
  v.box(2, 2, 7, 12, 19, 9, 0x123c3c);
  v.box(0, 22, 2, 14, 23, 6, 0x2a8a8a);
  // hats on pegs on top
  v.box(2, 23, 3, 5, 25, 5, 0xffe14d).box(1, 23, 3, 6, 24, 5, 0xffe14d);
  v.box(9, 23, 3, 12, 26, 5, 0x222222).box(8, 23, 3, 13, 24, 5, 0x222222).box(9, 24, 3, 12, 25, 5, 0xff6fd6);
  const body = voxMesh(v, { size: S, center: 'xz' });
  g.add(body);
  const mirror = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshStandardMaterial({ color: 0xcfeff0, metalness: 1, roughness: 0.06, envMapIntensity: 1.6 }));
  mirror.scale.y = 1.7; mirror.position.set(0, 10.5 * S, 4.5 * S + 0.08); g.add(mirror);
  const sparkleT = pixTex(16, 16, (ctx) => { ctx.fillStyle = '#fff'; ctx.fillRect(7, 2, 2, 12); ctx.fillRect(2, 7, 12, 2); });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleT, toneMapped: false, transparent: true, color: new THREE.Color(2, 2, 2) }));
  sp.scale.setScalar(0.18); sp.position.set(0.25, 1.75, 0.65); g.add(sp);
  const sign = neonText('WARDROBE', [0x52f2ff], 0.034, 3); sign.group.position.set(-0.8, 20 * S, 4.5 * S + 0.1); g.add(sign.group);
  const hit = hitBox(1.8, 3, 1.2); g.add(hit);
  g.position.set(11.0, 0, 2.6); g.rotation.y = -Math.PI / 2;
  return { id: 'wardrobe', label: 'Wardrobe Pod', panel: 'wardrobe', group: g, pick: [hit, body], rect: [10.3, 1.6, 11.8, 3.6], anchor: new THREE.Vector3(10.6, 1.4, 2.6), spots: [],
    update(_dt, t) { sp.material.opacity = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.7)); sp.position.y = 1.6 + Math.sin(t * 0.9) * 0.25; } };
}

// ── FILE CABINET ─────────────────────────────────────────────────────────────
function cabinet(): Station {
  const g = new THREE.Group();
  const v = new Vox();
  v.box(0, 0, 0, 7, 16, 6, 0x6f7a73);
  for (let d = 0; d < 4; d++) { v.box(0, d * 4 + 1, 6, 7, d * 4 + 4, 7, 0x7f8b84); v.box(2, d * 4 + 2, 7, 5, d * 4 + 3, 8, 0x3a403c); v.box(1, d * 4 + 3, 7, 3, d * 4 + 4, 7 + 1, 0xeeeedd); }
  // open top drawer with files
  v.box(0, 13, 7, 7, 16, 10, 0x7f8b84).box(1, 15, 7, 6, 17, 9, 0xffe27a).box(2, 15, 8, 3, 18, 9, 0xff6fd6);
  v.box(1, 16, 1, 6, 19, 5, 0xc9a26a);
  const body = voxMesh(v, { size: S, center: 'xz', material: MAT.metal });
  g.add(body);
  const hit = hitBox(1, 2.2, 1); g.add(hit);
  g.position.set(-11.2, 0, -3.6); g.rotation.y = Math.PI / 2;
  const spots: Spot[] = [{ id: 'cabinet', station: 'cabinet', pos: new THREE.Vector3(-10.1, 0, -3.6), face: -Math.PI / 2, anim: 'carry' }];
  return { id: 'cabinet', label: 'File Cabinet', group: g, pick: [hit], rect: [-11.8, -4.2, -10.6, -3.0], anchor: new THREE.Vector3(-10.8, 1, -3.6), spots, panel: 'terminal' };
}

// ── RESEARCH: bookshelf + satellite dish + telescope ─────────────────────────
function research(): Station {
  const g = new THREE.Group();
  const v = new Vox();
  v.box(0, 0, 0, 18, 20, 5, 0x4d3520);
  for (let s = 0; s < 4; s++) {
    v.box(1, s * 5 + 1, 1, 17, s * 5 + 5, 5, 0x1a120c);
    let x = 1;
    while (x < 17) { const w = 1 + Math.floor(Math.random() * 2), h = 2 + Math.floor(Math.random() * 3); const cc = [0xb23a48, 0x2f6b8f, 0x8cf56b, 0xffbe3d, 0xb48cff, 0xeeeedd][Math.floor(Math.random() * 6)]; v.box(x, s * 5 + 1, 2, Math.min(17, x + w), s * 5 + 1 + h, 5, cc); x += w; }
  }
  v.box(14, 21, 1, 17, 23, 4, 0x8cf56b, 1.6); // glowing specimen jar on top
  const shelf = voxMesh(v, { size: S, center: 'xz' });
  shelf.rotation.y = Math.PI / 2; shelf.position.set(-11.4, 0, 0.8);
  g.add(shelf);
  // telescope on tripod pointing out the window
  const tv = new Vox();
  tv.box(0, 0, 0, 1, 8, 1, 0x39433d).box(4, 0, 0, 5, 8, 1, 0x39433d).box(2, 0, 4, 3, 8, 5, 0x39433d).box(1, 8, 1, 4, 9, 4, 0x56645e);
  for (let i = 0; i < 12; i++) tv.box(2, 9 + Math.floor(i * 0.6), 2 - i, 4, 11 + Math.floor(i * 0.6), 4 - i, i > 9 ? 0xd9d4c0 : 0x2f6b8f);
  tv.box(1, 16, -11, 5, 18, -9, 0x52f2ff, 2.2);
  const tel = voxMesh(tv, { size: S, center: 'xz', material: MAT.metal });
  tel.position.set(-8.9, 0, -1.6); tel.rotation.y = 0.5;
  g.add(tel);
  // satellite dish on the wall top
  const dv = new Vox();
  for (let y = 0; y < 3; y++) dv.cyl(0, 0, 5 - y * 1.5, y, y + 1, 0xd9d4c0, 0, 1);
  dv.box(-0.5, 0, -0.5, 0.5, 7, 0.5, 0x56645e).set(0, 7, 0, 0xff6fd6, 3);
  const dish = voxMesh(dv, { size: 0.1, center: 'xz', material: MAT.metal });
  const dishG = new THREE.Group(); dishG.add(dish); dish.rotation.x = -0.9;
  dishG.position.set(-11.3, 4.6, -1.0);
  g.add(dishG);
  const hit = hitBox(1.2, 2.6, 2.6); hit.position.set(-11.1, 1.3, 0.8); g.add(hit);
  const lbl = label('RESEARCH', '#52f2ff'); lbl.rotation.y = Math.PI / 2; lbl.position.set(-11.2, 2.85, 0.8); g.add(lbl);
  const spots: Spot[] = [
    { id: 'books', station: 'research', pos: new THREE.Vector3(-10.0, 0, 0.6), face: -Math.PI / 2, anim: 'research' },
    { id: 'scope', station: 'research', pos: new THREE.Vector3(-8.4, 0, -0.9), face: 0.5 + Math.PI, anim: 'research' },
  ];
  return { id: 'research', label: 'Research Station', group: g, pick: [hit, tel], rect: [-11.9, -0.4, -10.7, 2.0], anchor: new THREE.Vector3(-10, 1.5, 0.3), spots,
    update(_dt, t) { dishG.rotation.y = Math.sin(t * 0.3) * 0.8; } };
}

// ── CLONING VAT ──────────────────────────────────────────────────────────────
function cloningVat(fx: Particles): Station & { spawnPoint: THREE.Vector3; flash(): void } {
  const g = new THREE.Group();
  const v = new Vox();
  v.cyl(0, 0, 8, 0, 4, (x, y) => (y === 3 ? 0x56645e : 0x2b3631));
  for (let a = 0; a < 8; a++) { const ang = (a / 8) * Math.PI * 2; v.set(Math.round(Math.cos(ang) * 7.5), 2, Math.round(Math.sin(ang) * 7.5), a % 2 ? 0x8cf56b : 0xff6fd6, 2.6); }
  const base = voxMesh(v, { size: S, center: 'none', origin: [0, 0, 0], material: MAT.metal });
  const cap = new Vox(); cap.cyl(0, 0, 8, 0, 2, 0x39433d).cyl(0, 0, 3, 2, 4, 0x56645e);
  const capM = voxMesh(cap, { size: S, center: 'none', origin: [0, 0, 0], material: MAT.metal }); capM.position.y = 0.5 + 2.6;
  g.add(base, capM);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.86, 2.6, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0xbfffe0, transparent: true, opacity: 0.18, roughness: 0.04, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2 }));
  glass.position.y = 0.5 + 1.3; glass.renderOrder = 5;
  const jellyMat = new THREE.ShaderMaterial({ vertexShader: LIQUID_VERT, fragmentShader: LIQUID_FRAG, transparent: true, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uDeep: { value: new THREE.Color('#1a5a3a') }, uBright: { value: new THREE.Color('#7affb0') }, uAlarm: { value: 0 } } });
  const jelly = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.2, 28), jellyMat); jelly.position.y = 0.5 + 1.1;
  // dormant clone silhouette floating inside
  const sil = new Vox(); sil.rbox(0, 4, 0, 6, 9, 5, 1.5, 0x0d2a18).rbox(1, 0, 1, 5, 5, 4, 1, 0x0d2a18).set(1, 9, 2, 0x0d2a18).set(1, 10, 2, 0x0d2a18).set(4, 9, 2, 0x0d2a18).set(4, 10, 2, 0x0d2a18);
  const silM = voxMesh(sil, { size: 0.1, center: 'xz' }); silM.position.y = 1.0;
  g.add(jelly, silM, glass);
  const light = new THREE.PointLight(0x7affb0, 8, 6, 1.6); light.position.set(0, 1.6, 1.2); g.add(light);
  const hit = hitBox(2, 3.4, 2); g.add(hit);
  const lbl = label('CLONE VAT', '#8cf56b'); lbl.position.set(0, 3.6, 0); g.add(lbl);
  g.position.set(-9.3, 0, -6.1);
  let flashT = 0;
  const spawnPoint = new THREE.Vector3(-9.3, 0, -4.9);
  return {
    id: 'vat', label: 'Cloning Vat', group: g, pick: [hit], rect: [-10.4, -7.3, -8.2, -5.0], anchor: new THREE.Vector3(-9.3, 1.6, -6.1),
    spots: [
      { id: 'vat0', station: 'vat', pos: new THREE.Vector3(-7.9, 0, -5.3), face: -Math.PI / 2 - 0.4, anim: 'vat' },
      { id: 'vat1', station: 'vat', pos: new THREE.Vector3(-9.3, 0, -4.5), face: Math.PI, anim: 'vat' },
    ],
    spawnPoint,
    flash() { flashT = 1; fx.emit({ tile: ['ring'], pos: [spawnPoint.x, 0.6, spawnPoint.z], count: 3, life: 0.6, size: 0.6, grow: 4, color: '#8cf56b', additive: true }); fx.emit({ tile: ['sparkle', 'star', 'glob'], pos: [spawnPoint.x, 0.8, spawnPoint.z], count: 24, vel: [0, 1.5, 0], spread: [1.8, 1.2, 1.8], drag: 1.5, life: [0.6, 1.1], size: [0.12, 0.22], color: ['#8cf56b', '#c8ffb0', '#52f2ff'], additive: true }); },
    update(dt, t) {
      jellyMat.uniforms.uTime.value = t;
      silM.position.y = 1.0 + Math.sin(t * 1.3) * 0.12; silM.rotation.y = Math.sin(t * 0.4) * 0.5;
      flashT = Math.max(0, flashT - dt * 1.5);
      light.intensity = 7 + Math.sin(t * 2.3) * 1.2 + flashT * 30;
      if (Math.random() < dt * 5) fx.emit({ tile: 'bubble', pos: [-9.3 + (Math.random() - 0.5) * 1.2, 0.7, -6.1 + (Math.random() - 0.5) * 1.2], vel: [0, 0.8, 0], spread: [0.05, 0.2, 0.05], life: 2.2, size: [0.07, 0.14], color: '#d8ffe0', wobble: 0.3 });
    },
  };
}

// ── WHITEBOARD ───────────────────────────────────────────────────────────────
function whiteboard(): Station {
  const g = new THREE.Group();
  const v = new Vox();
  v.box(0, 0, 0, 1, 20, 1, 0x56645e).box(23, 0, 0, 24, 20, 1, 0x56645e).box(0, 8, 0, 24, 21, 1, 0xd9d4c0);
  const frame = voxMesh(v, { size: S, center: 'xz', material: MAT.metal });
  const tex = pixTex(96, 52, (ctx) => {
    ctx.fillStyle = '#f1f4ea'; ctx.fillRect(0, 0, 96, 52);
    pixText(ctx, 'TODO:', 3, 3, 1, '#2f6b8f');
    pixText(ctx, '1.WORLD DOM. ✓', 3, 13, 1, '#b23a48');
    pixText(ctx, '2.SHIP GAME', 3, 22, 1, '#1e6b2a');
    pixText(ctx, '3.SNACKS!!', 3, 31, 1, '#8a4fbf');
    ctx.fillStyle = '#ffe27a'; ctx.fillRect(74, 4, 18, 16); ctx.fillStyle = '#ff9ae2'; ctx.fillRect(72, 26, 18, 16);
    pixText(ctx, 'BUG', 76, 9, 1, '#5a3a00'); pixText(ctx, 'YAY', 74, 31, 1, '#5a0040');
    ctx.strokeStyle = '#2f6b8f'; ctx.beginPath(); ctx.moveTo(60, 44); ctx.lineTo(70, 36); ctx.lineTo(66, 36); ctx.stroke();
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(22 * S, 12 * S), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.12 }));
  board.position.set(0, 14.5 * S, 0.5 * S + 0.07);
  g.add(frame, board);
  g.position.set(5.4, 0, -7.5);
  return { id: 'whiteboard', label: 'Planning Board', group: g, pick: [frame], rect: [3.9, -7.9, 6.9, -7.1], anchor: new THREE.Vector3(5.4, 1.6, -7), spots: [{ id: 'wb', station: 'whiteboard', pos: new THREE.Vector3(5.0, 0, -6.4), face: Math.PI, anim: 'scribble' }] };
}

// ── WORKBENCH + BUGBOX ───────────────────────────────────────────────────────
function workbench(fx: Particles): Station & { zap(): void } {
  const g = new THREE.Group();
  const v = new Vox();
  v.box(0, 5, 0, 22, 6, 9, 0x6b4a2e).box(0, 0, 0, 2, 5, 2, 0x39433d).box(20, 0, 0, 22, 5, 2, 0x39433d).box(0, 0, 7, 2, 5, 9, 0x39433d).box(20, 0, 7, 22, 5, 9, 0x39433d);
  v.box(2, 1, 1, 20, 2, 8, 0x4d3520);
  // tools
  v.box(3, 6, 2, 8, 7, 3, 0x9aa69e).box(3, 6, 2, 4, 7, 5, 0x9aa69e);
  v.box(9, 6, 5, 10, 7, 9, 0x6b4a2e).box(8, 6, 5, 11, 8, 6, 0x56645e);
  // the BUGBOX: a cranky little machine that sparks when debugging
  v.rbox(13, 6, 2, 20, 12, 8, 1, 0xb23a48).box(14, 8, 8, 19, 11, 9, 0x111111).set(15, 9, 9, 0xff5a5a, 3).set(18, 9, 9, 0xff5a5a, 3).box(16, 12, 4, 17, 15, 5, 0x9aa69e).set(16, 15, 4, 0xffbe3d, 3);
  const body = voxMesh(v, { size: S, center: 'xz' });
  g.add(body);
  const lbl = label('WORKBENCH', '#ffbe3d'); lbl.position.set(0, 2.3, 0); g.add(lbl);
  g.position.set(5.8, 0, 1.5);
  return {
    id: 'workbench', label: 'Workbench', group: g, pick: [body], rect: [4.4, 0.9, 7.2, 2.1], anchor: new THREE.Vector3(5.8, 1, 1.5),
    spots: [
      { id: 'wb0', station: 'workbench', pos: new THREE.Vector3(5.0, 0, 0.45), face: 0, anim: 'hammer' },
      { id: 'wb1', station: 'workbench', pos: new THREE.Vector3(6.7, 0, 0.45), face: 0, anim: 'whack' },
    ],
    zap() { fx.sparks(new THREE.Vector3(6.85, 1.2, 1.5), 12); },
  };
}

export function buildStations(fx: Particles) {
  const vat = cloningVat(fx);
  const bench = workbench(fx);
  const list: Station[] = [computerBank(fx), ideaDesk(), fuelTank(fx), vending(), wardrobe(), cabinet(), research(), vat, whiteboard(), bench];
  return { list, vat, bench, byId: new Map(list.map((s) => [s.id, s])), faceToward };
}
