// The alley lab shell: wet concrete floor, brick walls with a smashed window, pipes,
// hanging lamps, neon signs, skyline, sky, moon, and alley clutter.
import * as THREE from 'three';
import { Vox, buildVox, voxMesh, mergeGeos, placed, MAT } from './voxel';
import { canvas, pixTex, pixText, pixTextWidth, glyph } from './pixels';
import { rng } from '../core/util';

export const ROOM = { x0: -12, x1: 12, z0: -8, z1: 8, wallH: 5.5 };

export interface EnvHandles {
  group: THREE.Group;
  neonLetters: THREE.Mesh[];
  lamps: THREE.SpotLight[];
  steamVents: THREE.Vector3[];
  drips: THREE.Vector3[];
  neonLights: THREE.PointLight[];
  update(dt: number, t: number): void;
}

const R = rng(1337);

// ── floor ────────────────────────────────────────────────────────────────────
function buildFloor(): THREE.Group {
  const g = new THREE.Group();
  const S = 0.25;
  const v = new Vox();
  const tileTone: number[][] = [];
  for (let tx = 0; tx < 24; tx++) { tileTone[tx] = []; for (let tz = 0; tz < 16; tz++) tileTone[tx][tz] = R(); }
  for (let x = -48; x < 48; x++) for (let z = -32; z < 32; z++) {
    const tx = Math.floor((x + 48) / 4), tz = Math.floor((z + 32) / 4);
    const grout = (x + 48) % 4 === 0 || (z + 32) % 4 === 0;
    const t = tileTone[tx][tz];
    let c = new THREE.Color().setHSL(0.36, 0.06 + t * 0.03, 0.15 + t * 0.05);
    if (grout) c.multiplyScalar(0.55);
    // slime stains near the vat (back-left) and oil near the workbench
    const dv = Math.hypot(x * S + 9, z * S + 6);
    if (dv < 2.6 && R() < 0.9 - dv * 0.3) c.lerp(new THREE.Color('#3f8f2a'), 0.35);
    const dw = Math.hypot(x * S - 6, z * S - 1.5);
    if (dw < 1.6 && R() < 0.5) c.multiplyScalar(0.7);
    if (R() < 0.012) c.multiplyScalar(0.65); // grime speckle
    v.set(x, -1, z, c.getHex());
  }
  const built = buildVox(v, { size: S, center: 'none', origin: [0, 0, 0], noAO: true, jitter: 0.04 });
  const floor = new THREE.Mesh(built.solid!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08 }));
  floor.receiveShadow = true;
  floor.name = 'floor';
  g.add(floor);

  // puddles: glossy dark pools that catch the neon
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x0b1410, roughness: 0.04, metalness: 0.6, transparent: true, opacity: 0.88, envMapIntensity: 1.4 });
  const spots: [number, number, number, number][] = [[-4.2, 4.4, 1.6, 0.9], [3.5, 5.6, 1.2, 0.7], [7.5, -2.6, 1.0, 0.6], [-1.2, -3.5, 0.9, 0.5], [0.8, 2.2, 0.7, 0.45], [-8.2, 1.5, 1.1, 0.7], [9.5, 6.5, 1.3, 0.8]];
  for (const [x, z, rx, rz] of spots) {
    const shape = new THREE.Shape();
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 1 + Math.sin(a * 3 + x) * 0.18 + Math.cos(a * 5 + z) * 0.1;
      const px = Math.cos(a) * rx * r, pz = Math.sin(a) * rz * r;
      if (i === 0) shape.moveTo(px, pz); else shape.lineTo(px, pz);
    }
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), puddleMat);
    m.rotation.x = Math.PI / 2; m.position.set(x, 0.012, z); m.scale.y = -1; m.receiveShadow = true;
    g.add(m);
  }

  // alley asphalt beyond the lab (front + sides) and a curb
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshStandardMaterial({ color: 0x0b0f0e, roughness: 0.9 }));
  asphalt.rotation.x = -Math.PI / 2; asphalt.position.set(0, -0.26, 20); asphalt.receiveShadow = true;
  g.add(asphalt);
  const curb = new Vox();
  for (let x = -60; x < 60; x++) curb.box(x * 2, 0, 0, x * 2 + 2, 1, 1, R() < 0.5 ? 0x5a5f58 : 0x4c514b);
  const cm = voxMesh(curb, { size: 0.25, center: 'none', origin: [0, 0, 0], noAO: true });
  cm.position.set(0, -0.25, 8);
  g.add(cm);
  return g;
}

// ── brick walls ──────────────────────────────────────────────────────────────
function brickColor(bx: number, by: number) {
  const r = rng(bx * 977 + by * 131)();
  const base = new THREE.Color().setHSL(0.02 + r * 0.03, 0.38 + r * 0.12, 0.2 + r * 0.08);
  return base;
}

/** Build a brick wall in local coords: x along length (voxels), y up, z = 0 front face, thickness 2. */
function brickWall(lenVox: number, heightAt: (x: number) => number, hole?: (x: number, y: number) => boolean, grimeTop = 0.0, flip = false) {
  const v = new Vox();
  const BACK = flip ? 1 : -1, OUT = flip ? -1 : 1;
  for (let x = 0; x < lenVox; x++) {
    const h = heightAt(x);
    for (let y = 0; y < h; y++) {
      if (hole?.(x, y)) continue;
      const row = Math.floor(y / 3);
      const off = row % 2 ? 3 : 0;
      const mortarRow = y % 3 === 2;
      const mortarCol = (x + off) % 6 === 5;
      const bx = Math.floor((x + off) / 6), by = row;
      // back layer always (mortar colour)
      v.set(x, y, BACK, 0x241f1c);
      if (mortarRow || mortarCol) continue;
      const c = brickColor(bx, by);
      // grime gradient toward the floor + soot near top
      const k = 0.62 + Math.min(1, y / 18) * 0.38 - (y > h - 4 ? grimeTop : 0);
      c.multiplyScalar(k);
      // occasional missing / pushed brick
      const rr = rng(bx * 31 + by * 17)();
      if (rr < 0.025) continue;
      v.set(x, y, 0, c.getHex());
      if (rr > 0.985) v.set(x, y, OUT, c.clone().multiplyScalar(1.1).getHex());
    }
  }
  return v;
}

function buildWalls() {
  const S = 0.125;
  const H = Math.round(ROOM.wallH / S); // 44
  const geos: THREE.BufferGeometry[] = [];
  // back wall with a smashed window
  const hole = (x: number, y: number) => {
    const cx = 52, cy = 27; // window centre in voxels (x from left edge)
    const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
    const jag = rng(x * 7 + y * 13)() * 3;
    return dx < 19 + jag && dy < 9 + jag * 0.7;
  };
  const back = brickWall(192, (x) => H - (x > 120 && x < 150 ? 0 : 0) + (x % 23 === 0 ? -1 : 0), hole, 0.15);
  const bb = buildVox(back, { size: S, center: 'none', origin: [0, 0, 0], jitter: 0.05 });
  geos.push(placed(bb.solid, ROOM.x0, 0, ROOM.z0 + S, 0)!);
  // side walls: full height at the back, crumbling toward the front
  const sideH = (x: number) => {
    const t = x / 128; // 0 back → 1 front
    const base = H * (1 - t * 0.72);
    return Math.max(4, Math.round(base - Math.abs(Math.sin(x * 0.37)) * 4 - (rng(x)() * 3)));
  };
  const side = brickWall(128, sideH, undefined, 0.1, true);
  const sb = buildVox(side, { size: S, center: 'none', origin: [0, 0, 0], jitter: 0.05 });
  // left wall: runs from back (z0) to front (z1), bricks facing +x
  geos.push(placed(sb.solid, ROOM.x0 + 2 * S, 0, ROOM.z0, -Math.PI / 2)!);
  // right wall: runs front → back, bricks facing -x
  const sideR = brickWall(128, (x) => sideH(127 - x), undefined, 0.1, true);
  const sbR = buildVox(sideR, { size: S, center: 'none', origin: [0, 0, 0], jitter: 0.05 });
  geos.push(placed(sbR.solid, ROOM.x1 - 2 * S, 0, ROOM.z1, Math.PI / 2)!);
  const mesh = new THREE.Mesh(mergeGeos(geos)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }));
  mesh.receiveShadow = true; mesh.castShadow = true;
  mesh.name = 'walls';
  // window frame: rusty sill
  const sill = new Vox().box(0, 0, 0, 44, 1, 3, 0x3b3a32).box(0, 1, 0, 2, 22, 2, 0x2f2e28).box(42, 1, 0, 44, 22, 2, 0x2f2e28);
  const sm = voxMesh(sill, { size: S, center: 'none', origin: [0, 0, 0] });
  sm.position.set(ROOM.x0 + 30 * S, 17 * S, ROOM.z0 - 0.05);
  const g = new THREE.Group(); g.add(mesh, sm);
  return g;
}

// ── pipes ────────────────────────────────────────────────────────────────────
function buildPipes(drips: THREE.Vector3[], vents: THREE.Vector3[]) {
  const S = 0.125;
  const v = new Vox();
  const COP = 0x8a5a33, RUST = 0x6b3b22, GRN = 0x2f6b4a, STEEL = 0x56645e;
  const run = (x0: number, x1: number, y: number, z: number, c: number) => {
    for (let x = x0; x < x1; x++) { v.box(x, y, z, x + 1, y + 3, z + 3, (rng(x * 3 + y)() < 0.08 ? RUST : c)); if ((x - x0) % 28 === 0) v.box(x, y - 1, z - 1, x + 2, y + 4, z + 4, STEEL); }
  };
  const drop = (x: number, y0: number, y1: number, z: number, c: number) => { for (let y = y0; y < y1; y++) v.box(x, y, z, x + 3, y + 1, z + 3, c); v.box(x - 1, y1 - 2, z - 1, x + 4, y1, z + 4, STEEL); };
  // two long runs on the back wall (wall-local voxel coords: x from left edge, z from wall face)
  run(0, 192, 37, 1, COP);
  run(0, 150, 32, 4, GRN);
  // drops into vat (left) and tank (right) and one to the floor drain
  drop(22, 6, 37, 1, COP);
  drop(166, 9, 32, 4, GRN);
  drop(150, 0, 37, 1, COP);
  // elbow + valve wheels (glowing red handles)
  v.box(148, 18, 0, 155, 19, 7, 0x9b2a2a, 1.4).box(151, 15, 0, 152, 22, 7, 0x9b2a2a, 1.4);
  v.box(70, 30, 3, 73, 35, 9, 0x9b2a2a, 1.4);
  // pressure gauges
  v.box(90, 34, 4, 95, 39, 6, 0xd9d4c0).box(92, 36, 6, 93, 38, 7, 0x222222);
  const m = voxMesh(v, { size: S, center: 'none', origin: [0, 0, 0], material: MAT.metal });
  m.position.set(ROOM.x0, 0, ROOM.z0 + 0.15);
  // overhead pipe crossing the room
  const over = new Vox();
  for (let z = 0; z < 64; z++) { over.box(0, 0, z, 3, 3, z + 1, z % 31 === 0 ? STEEL : COP); }
  const om = voxMesh(over, { size: S, center: 'none', origin: [0, 0, 0], material: MAT.metal });
  om.position.set(-4.5, 6.6, ROOM.z0);
  const g = new THREE.Group(); g.add(m, om);
  drips.push(new THREE.Vector3(-4.3, 6.5, -3), new THREE.Vector3(ROOM.x0 + 9.6, 4.6, ROOM.z0 + 0.5), new THREE.Vector3(-4.3, 6.5, -6));
  vents.push(new THREE.Vector3(-2.8, 0.05, 5.2), new THREE.Vector3(5.6, 0.05, -2.4), new THREE.Vector3(ROOM.x0 + 0.6, 0.3, 3));
  // floor grates at vents
  for (const p of vents.slice(0, 2)) {
    const gv = new Vox();
    for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) gv.set(x, 0, z, (x + z) % 2 ? 0x1a1f1c : 0x39433d);
    const gm = voxMesh(gv, { size: 0.125, center: 'xz', noAO: true, material: MAT.metal });
    gm.position.set(p.x, -0.11, p.z);
    g.add(gm);
  }
  return g;
}

// ── lamps ────────────────────────────────────────────────────────────────────
function buildLamp() {
  const v = new Vox();
  const SH = 0x2a4a3a;
  for (let y = 0; y < 4; y++) { const r = 2 + (3 - y) * 1.2; v.cyl(0, 0, r, y, y + 1, y === 3 ? 0x3d6b52 : SH, 0, y === 3 ? 0 : 1.2); }
  v.box(-1, 4, -1, 2, 5, 2, 0x1b221e);
  v.ellipsoid(0, 0.8, 0, 1.6, 1.2, 1.6, 0xffd38a, 3.2);
  const g = voxMesh(v, { size: 0.1, center: 'none', origin: [0, 0, 0] });
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.03, 6, 0.03), new THREE.MeshBasicMaterial({ color: 0x050505 }));
  cable.position.y = 3.4;
  g.add(cable);
  return g;
}

// ── neon signs ───────────────────────────────────────────────────────────────
function neonText(text: string, colors: number[], size = 0.11, intensity = 3.2): { group: THREE.Group; letters: THREE.Mesh[]; width: number } {
  const group = new THREE.Group();
  const letters: THREE.Mesh[] = [];
  let x = 0;
  [...text].forEach((ch, i) => {
    if (ch === ' ') { x += 4; return; }
    const g = glyph(ch);
    const v = new Vox();
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) if (g[row] & (1 << (4 - col))) v.set(col, 6 - row, 0, colors[i % colors.length], intensity);
    const b = buildVox(v, { size, center: 'none', origin: [0, 0, 0], noAO: true, jitter: 0 });
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true });
    const m = new THREE.Mesh(b.glow!, mat);
    m.position.x = x * size;
    group.add(m); letters.push(m);
    x += 6;
  });
  return { group, letters, width: (x - 1) * size };
}

function neonBackboard(w: number, h: number) {
  const v = new Vox();
  const W = Math.round(w / 0.125) + 4, H = Math.round(h / 0.125) + 4;
  v.box(0, 0, 0, W, H, 1, 0x161b18);
  for (const [x, y] of [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]]) v.set(x, y, 1, 0x6b7d72);
  return voxMesh(v, { size: 0.125, center: 'none', origin: [0, 0, 0], material: MAT.metal });
}

// ── sky, skyline, moon ───────────────────────────────────────────────────────
function buildSky() {
  const g = new THREE.Group();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#05060f') }, mid: { value: new THREE.Color('#141433') }, low: { value: new THREE.Color('#2a1838') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.15 ? mix(mid, top, smoothstep(0.15, 0.7, h)) : mix(low, mid, smoothstep(-0.1, 0.15, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 16), skyMat);
  g.add(sky);
  // stars
  const n = 700, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const r = rng(99);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, h = 0.08 + r() * 0.9;
    const rad = 170;
    pos[i * 3] = Math.cos(a) * Math.sqrt(1 - h * h) * rad; pos[i * 3 + 1] = h * rad; pos[i * 3 + 2] = Math.sin(a) * Math.sqrt(1 - h * h) * rad;
    const c = new THREE.Color().setHSL(r() < 0.2 ? 0.85 : 0.55, 0.6, 0.7 + r() * 0.3);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, toneMapped: false, transparent: true, opacity: 0.9 }));
  g.add(stars);
  // pixel moon
  const moonTex = pixTex(32, 32, (ctx) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5);
      if (d > 14) continue;
      const shade = d > 12 ? '#cfd8b8' : '#f2f7dc';
      ctx.fillStyle = shade; ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = '#c9d2a8';
    for (const [x, y, s] of [[10, 9, 4], [19, 18, 5], [12, 21, 3], [21, 8, 2]]) ctx.fillRect(x, y, s, s);
  });
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.5) }));
  moon.scale.setScalar(12); moon.position.set(-38, 42, -110);
  g.add(moon);
  // skyline layers (canvas strips)
  const layer = (seed: number, w: number, h: number, dark: string, winP: number, z: number, scaleY: number, tint: string) => {
    const rr = rng(seed);
    const tex = pixTex(512, 128, (ctx) => {
      let x = 0;
      while (x < 512) {
        const bw = 18 + Math.floor(rr() * 40), bh = 30 + Math.floor(rr() * 90);
        ctx.fillStyle = dark; ctx.fillRect(x, 128 - bh, bw, bh);
        if (rr() < 0.3) { ctx.fillRect(x + bw / 2 - 1, 128 - bh - 10, 2, 10); }
        for (let wy = 128 - bh + 4; wy < 124; wy += 5) for (let wx = x + 3; wx < x + bw - 3; wx += 4)
          if (rr() < winP) { ctx.fillStyle = rr() < 0.15 ? '#ff6fd6' : rr() < 0.3 ? '#52f2ff' : tint; ctx.fillRect(wx, wy, 2, 2); }
        x += bw + Math.floor(rr() * 4);
      }
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: true, toneMapped: false }));
    m.position.set(0, h / 2 * scaleY - 2, z);
    return m;
  };
  g.add(layer(7, 260, 60, '#0b0b18', 0.12, -120, 1, '#ffd98a'));
  g.add(layer(11, 170, 40, '#080a0f', 0.2, -70, 1, '#ffcf6a'));
  return g;
}

// ── alley clutter ────────────────────────────────────────────────────────────
function dumpster() {
  const v = new Vox();
  const G = 0x2e5a3c, D = 0x1f3d29;
  v.box(0, 1, 0, 18, 11, 10, (x, y) => (y === 10 ? D : x % 6 === 0 ? D : G));
  v.box(-1, 11, -1, 19, 12, 11, 0x24473a);
  v.box(1, 0, 1, 3, 1, 3, 0x111111).box(15, 0, 1, 17, 1, 3, 0x111111).box(1, 0, 7, 3, 1, 9, 0x111111).box(15, 0, 7, 17, 1, 9, 0x111111);
  // trash bags peeking out
  v.ellipsoid(5, 12.5, 5, 3, 2, 3, 0x15171a).ellipsoid(11, 12.8, 4, 3, 2.4, 3, 0x1a1c20);
  // glowing goo leak
  v.box(8, 1, 10, 11, 2, 12, 0x8cf56b, 2.2);
  return voxMesh(v, { size: 0.125 });
}
function crate(c = 0x6b4a2e) {
  const v = new Vox();
  v.box(0, 0, 0, 8, 8, 8, (x, y, z) => (x === 0 || x === 7 || y === 0 || y === 7 || z === 0 || z === 7 ? c : 0x4d3520));
  for (let i = 0; i < 8; i++) { v.set(i, i, 0, 0x8a6440); v.set(i, i, 7, 0x8a6440); }
  return voxMesh(v, { size: 0.125 });
}
function barrel() {
  const v = new Vox();
  v.cyl(3.5, 3.5, 3.5, 0, 9, (x, y) => (y === 2 || y === 7 ? 0x5a5f58 : 0x8a7a1e));
  v.cyl(3.5, 3.5, 2.6, 9, 10, 0x9dff6b, 2.4);
  v.box(2, 4, -0.5, 6, 6, 0.5, 0x111111);
  return voxMesh(v, { size: 0.125 });
}
function chainLink() {
  const tex = pixTex(64, 64, (ctx) => {
    ctx.strokeStyle = '#9aa69e'; ctx.lineWidth = 1;
    for (let i = -64; i < 128; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 64, 64); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i + 64, 0); ctx.lineTo(i, 64); ctx.stroke(); }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 1.6);
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.6), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }));
  mesh.position.y = 1.3;
  g.add(mesh);
  for (const x of [-2.25, 0, 2.25]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.7, 0.08), new THREE.MeshStandardMaterial({ color: 0x6f7a73, metalness: 0.7, roughness: 0.4 })); p.position.set(x, 1.35, 0); g.add(p); }
  return g;
}
function graffiti() {
  const tex = pixTex(96, 64, (ctx) => {
    // spray alien head
    const cx = 34, cy = 30;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 70; x++) {
      const d = ((x - cx) / 22) ** 2 + ((y - cy) / 18) ** 2;
      if (d < 1 && d > 0.78) { ctx.fillStyle = '#8cf56b'; ctx.fillRect(x, y, 1, 1); }
    }
    ctx.fillStyle = '#8cf56b';
    for (const ex of [26, 42]) for (let y = -6; y <= 6; y++) for (let x = -5; x <= 5; x++) if ((x / 5) ** 2 + (y / 6.5) ** 2 < 1) ctx.fillRect(ex + x, cy - 2 + y, 1, 1);
    ctx.fillRect(20, 6, 2, 8); ctx.fillRect(46, 6, 2, 8); ctx.fillRect(18, 4, 6, 3); ctx.fillRect(44, 4, 6, 3);
    // drips
    for (const dx of [16, 30, 50]) ctx.fillRect(dx, 44, 1, 8 + (dx % 7));
    pixText(ctx, 'GLOB', 60, 22, 1, '#ff6fd6'); pixText(ctx, 'WUZ', 62, 32, 1, '#ff6fd6'); pixText(ctx, 'HERE', 60, 42, 1, '#ff6fd6');
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, roughness: 0.8, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.25 }));
  return m;
}

// ── assemble ────────────────────────────────────────────────────────────────
export function buildEnvironment(scene: THREE.Scene, quality: 'low' | 'medium' | 'high'): EnvHandles {
  const group = new THREE.Group(); group.name = 'env';
  const drips: THREE.Vector3[] = [], steamVents: THREE.Vector3[] = [];
  group.add(buildFloor(), buildWalls(), buildPipes(drips, steamVents), buildSky());

  // neon sign: GLOB LABS on the back wall above the computer bank
  const sign = neonText('GLOB LABS', [0x8cf56b, 0x8cf56b, 0x8cf56b, 0x8cf56b, 0, 0xff6fd6, 0xff6fd6, 0xff6fd6, 0xff6fd6], 0.13, 3.4);
  const board = neonBackboard(sign.width + 0.3, 1.2);
  const signGroup = new THREE.Group();
  board.position.set(-0.4, -0.35, -0.12);
  signGroup.add(board, sign.group);
  signGroup.position.set(1.3 - sign.width / 2, 3.95, ROOM.z0 + 0.4);
  group.add(signGroup);
  // OPEN 24/7 on the left wall
  const open = neonText('OPEN 24/7', [0x52f2ff], 0.07, 3);
  open.group.rotation.y = Math.PI / 2;
  open.group.position.set(ROOM.x0 + 0.32, 3.1, -0.5 + open.width / 2);
  const ob = neonBackboard(open.width + 0.2, 0.6); ob.rotation.y = Math.PI / 2; ob.position.set(ROOM.x0 + 0.22, 2.85, -0.4 + open.width / 2 + 0.25);
  group.add(open.group, ob);
  // arrow sign "← LAB" over the alley
  const lab = neonText('LAB', [0xffbe3d], 0.09, 2.6);
  lab.group.position.set(-11, 2.6, 7.2); lab.group.rotation.y = 0.5;
  group.add(lab.group);

  // graffiti on right wall interior
  const gr = graffiti(); gr.rotation.y = -Math.PI / 2; gr.position.set(ROOM.x1 - 0.2, 1.9, 1.2);
  group.add(gr);

  // clutter
  const d = dumpster(); d.position.set(-10.2, 0, 6.6); d.rotation.y = 0.15; group.add(d);
  const c1 = crate(); c1.position.set(10.3, 0, 6.4); group.add(c1);
  const c2 = crate(0x5d4128); c2.position.set(10.9, 0, 5.3); c2.rotation.y = 0.4; group.add(c2);
  const c3 = crate(); c3.position.set(10.5, 1, 6.2); c3.rotation.y = -0.3; c3.scale.setScalar(0.85); group.add(c3);
  const b1 = barrel(); b1.position.set(-7.6, 0, 7.1); group.add(b1);
  const fence = chainLink(); fence.position.set(12.2, 0, 5.8); fence.rotation.y = Math.PI / 2; group.add(fence);

  // hanging lamps (warm pools of light)
  const lamps: THREE.SpotLight[] = [];
  const lampSpots: [number, number, number][] = [[1.2, 4.6, -4.8], [-6.2, 4.4, 1.8], [6, 4.4, 1.2]];
  lampSpots.forEach(([x, y, z], i) => {
    const l = buildLamp(); l.position.set(x, y, z); group.add(l);
    const s = new THREE.SpotLight(0xffc77a, 46, 13, 0.72, 0.65, 1.6);
    s.position.set(x, y + 0.1, z); s.target.position.set(x, 0, z + 0.4);
    if (quality === 'high' && i === 0) { s.castShadow = true; s.shadow.mapSize.set(1024, 1024); s.shadow.bias = -0.0008; s.shadow.radius = 3; }
    group.add(s, s.target); lamps.push(s);
  });

  // lights
  const hemi = new THREE.HemisphereLight(0x3a4a78, 0x0c1410, 1.1);
  const moonLight = new THREE.DirectionalLight(0x8aa0ff, 0.55); moonLight.position.set(-20, 30, -30);
  group.add(hemi, moonLight);
  const neonLights: THREE.PointLight[] = [];
  const pl = (c: number, i: number, d: number, x: number, y: number, z: number) => { const p = new THREE.PointLight(c, i, d, 1.6); p.position.set(x, y, z); group.add(p); neonLights.push(p); return p; };
  pl(0x8cf56b, 16, 11, -1.4, 4.3, ROOM.z0 + 1.4);
  pl(0xff6fd6, 16, 11, 3.6, 4.3, ROOM.z0 + 1.4);
  pl(0x52f2ff, 6, 7, ROOM.x0 + 1.2, 3, -0.5);
  pl(0xffbe3d, 5, 6, -10.5, 2.5, 7);
  // fill from the alley front so silhouettes read
  const fill = new THREE.PointLight(0x6a7cff, 10, 22, 1.4); fill.position.set(0, 6, 12); group.add(fill);

  scene.add(group);

  let flickerT = 0;
  return {
    group, neonLetters: [...sign.letters, ...open.letters, ...lab.letters], lamps, steamVents, drips, neonLights,
    update(dt, t) {
      // neon flicker: a random letter stutters now and then
      flickerT -= dt;
      if (flickerT <= 0) {
        flickerT = 0.6 + Math.random() * 3.5;
        const L = sign.letters[Math.floor(Math.random() * sign.letters.length)];
        const m = L.material as THREE.MeshBasicMaterial;
        let n = 0;
        const iv = setInterval(() => { m.opacity = n % 2 ? 1 : 0.18; if (++n > 5) { clearInterval(iv); m.opacity = 1; } }, 55);
      }
      neonLights[0].intensity = 16 + Math.sin(t * 13) * 0.6;
      neonLights[1].intensity = 16 + Math.sin(t * 11 + 1) * 0.6;
    },
  };
}

export { neonText, neonBackboard, crate, barrel };
export { canvas, pixTextWidth };
