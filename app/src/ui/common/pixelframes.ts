// Pixel-art UI skins, painted per pixel on tiny canvases (after the user's Fishtop: pix.ts
// ramps + skins.ts painters) and installed as CSS custom properties. Shared classes use them
// as 9-slice border-images / tiles at an exact 2× scale with image-rendering: pixelated, so
// every corner is a crisp stepped notch and every bevel lands on a whole art pixel.
//
//   --px-<name>  url(...) of the source art     (see installPixelSkins for the list)
// Slices (art px) are fixed per skin and mirrored in styles.css.

type RGBA = [number, number, number, number];
const hx = (s: string, a = 255): RGBA => { const v = parseInt(s.replace('#', ''), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255, a]; };

class Img {
  readonly c: HTMLCanvasElement; private ctx: CanvasRenderingContext2D; private img: ImageData;
  constructor(readonly w: number, readonly h: number) {
    this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h;
    this.ctx = this.c.getContext('2d')!; this.img = this.ctx.createImageData(w, h);
  }
  set(x: number, y: number, col: RGBA | string | null) {
    if (col === null || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const c = typeof col === 'string' ? hx(col) : col;
    const i = (y * this.w + x) * 4; const d = this.img.data;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3];
  }
  url() { this.ctx.putImageData(this.img, 0, 0); return this.c.toDataURL('image/png'); }
}

/** 6-tone ramp, darkest → brightest: ink, lip, lo, base, hi, shine. */
type Ramp = [string, string, string, string, string, string];
export const RAMP: Record<string, Ramp> = {
  steel: ['#0a0e14', '#1a2129', '#2c353f', '#414c58', '#5f6c7a', '#8796a5'],
  hull: ['#0a0e14', '#151b22', '#222a33', '#2b343e', '#3a4551', '#55626f'],
  dark: ['#06090d', '#0b1117', '#111a22', '#16212b', '#1f2c38', '#2d3d4c'],
  glob: ['#0c2410', '#1f5a22', '#3a8a32', '#5cb84a', '#8adc66', '#c6f59a'],
  pink: ['#2a0620', '#6a1650', '#a8327c', '#e05aac', '#f68ccc', '#ffc8ea'],
  cyan: ['#04202a', '#0e4c5e', '#1c7f94', '#34b2c6', '#6ad8e6', '#b8f6fc'],
  amber: ['#2a1604', '#6a3c0a', '#a86a14', '#e0a02a', '#f6c860', '#fff0b0'],
  red: ['#2a0608', '#6a1018', '#a82228', '#d8423e', '#f27a6a', '#ffc4b4'],
  brass: ['#2a1804', '#6a4410', '#a8741e', '#d6a646', '#f2d27e', '#fff4c8'],
  paper: ['#0a0e14', '#8eaec4', '#b9d4e6', '#e6f2fa', '#f6fbff', '#ffffff'],
  violet: ['#140a2a', '#3a1c6a', '#5e36a8', '#8a5ad8', '#b48cf2', '#e0ccff'],
};

/** Corner notch: stepped cut of `n` pixels (n=2 → 3 pixels removed per corner). */
function inside(x: number, y: number, w: number, h: number, n: number, corners = [1, 1, 1, 1]) {
  const L = x, R = w - 1 - x, T = y, B = h - 1 - y;
  if (corners[0] && L + T < n) return false;
  if (corners[1] && R + T < n) return false;
  if (corners[2] && R + B < n) return false;
  if (corners[3] && L + B < n) return false;
  return true;
}

interface FrameOpts {
  w: number; h: number; notch: number; corners?: number[];
  ink?: string | null;
  /** paint by depth from the outline (1 = just inside the ink); return colour or null for transparent */
  paint: (x: number, y: number, depth: number, lit: boolean) => string | null;
  /** extra top-down detail pass */
  detail?: (img: Img) => void;
}

/** Generic notched frame painter (depth = 4-neighbour distance from the outer edge). */
function frame(o: FrameOpts): Img {
  const { w, h, notch } = o;
  const im = new Img(w, h);
  const M = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inside(x, y, w, h, notch, o.corners);
  // BFS depth from outside
  const depth = new Int16Array(w * h).fill(-1);
  const q: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!M(x, y)) continue;
    if (!M(x - 1, y) || !M(x + 1, y) || !M(x, y - 1) || !M(x, y + 1)) { depth[y * w + x] = 0; q.push(y * w + x); }
  }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (!M(xx, yy) || depth[yy * w + xx] >= 0) continue;
      depth[yy * w + xx] = depth[i] + 1; q.push(yy * w + xx);
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = depth[y * w + x];
    if (d < 0) continue;
    if (d === 0 && o.ink !== null) { im.set(x, y, o.ink ?? RAMP.steel[0]); continue; }
    // lit = nearer the top/left edge than the bottom/right
    const lit = Math.min(x, y) <= Math.min(w - 1 - x, h - 1 - y);
    im.set(x, y, o.paint(x, y, d, lit));
  }
  o.detail?.(im);
  return im;
}

// ── painters ─────────────────────────────────────────────────────────────────
/** Window bezel 32×32, slice 8: steel rim with groove, inner ink, riveted plate face (16×16 tile). */
function paintWin() {
  const R = RAMP.steel, P = RAMP.hull;
  return frame({
    w: 32, h: 32, notch: 3,
    paint: (x, y, d, lit) => {
      if (d === 1) return lit ? R[5] : R[1];
      if (d === 2) return lit ? R[4] : R[2];
      if (d === 3 || d === 4) return R[3];
      if (d === 5) return R[2];                 // groove
      if (d === 6) return lit ? R[1] : R[4];    // inner lip (lit from inside)
      if (d === 7) return R[0];                 // inner ink line
      return plate(x - 8, y - 8, P);
    },
    detail: (im) => { for (const [cx, cy] of [[4, 4], [27, 4], [4, 27], [27, 27]]) bolt(im, cx, cy); },
  });
}

/** Riveted metal plate tile (16×16, seamless): seams on the tile edge, two rivets, one scratch. */
function plate(x: number, y: number, P: Ramp) {
  const tx = ((x % 16) + 16) % 16, ty = ((y % 16) + 16) % 16;
  if (tx === 15 || ty === 15) return P[1];
  if (tx === 0 || ty === 0) return P[4];
  if ((tx === 2 && ty === 2) || (tx === 13 && ty === 13)) return P[5];
  if ((tx === 3 && ty === 3) || (tx === 14 && ty === 14)) return P[1];
  if (ty === 10 && tx >= 5 && tx <= 7) return P[4]; // scratch
  if (ty === 9 && tx === 8) return P[4];
  return P[3];
}

function bolt(im: Img, cx: number, cy: number) {
  const R = RAMP.steel;
  im.set(cx - 1, cy - 1, R[0]); im.set(cx, cy - 1, R[0]); im.set(cx + 1, cy - 1, R[0]);
  im.set(cx - 1, cy, R[0]); im.set(cx + 1, cy, R[0]);
  im.set(cx - 1, cy + 1, R[0]); im.set(cx, cy + 1, R[0]); im.set(cx + 1, cy + 1, R[0]);
  im.set(cx, cy, R[5]);
}

/** Plain tile (no frame) 16×16 — title bars & dark plates. */
function paintTile(P: Ramp) {
  const im = new Img(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) im.set(x, y, plate(x, y, P));
  return im;
}

/** Glass / screen inset 16×16, slice 5: ink, deep top-left shadow, lit bottom-right lip, dark glass. */
function paintInset(face: string, rim: Ramp = RAMP.steel, glint = true, focus?: string) {
  return frame({
    w: 16, h: 16, notch: 2, ink: focus ?? rim[0],
    paint: (x, y, d, lit) => {
      if (d === 1) return lit ? '#020406' : rim[3];
      if (d === 2) return lit ? '#04080c' : rim[2];
      return face;
    },
    detail: glint ? (im) => { im.set(3, 3, '#3a5868'); im.set(4, 3, '#2a4250'); im.set(3, 4, '#2a4250'); } : undefined,
  });
}

/** Raised plastic/metal button 16×16, slice 5, three states. */
function paintButton(R: Ramp, state: 'n' | 'h' | 'd') {
  const up = state === 'h' ? 1 : 0;
  const base = R[Math.min(5, 3 + up)], hi = R[Math.min(5, 4 + up)], shine = R[5], lo = R[2 + up], lip = R[1];
  return frame({
    w: 16, h: 16, notch: 2, ink: R[0],
    paint: (x, y, d, lit) => {
      const fb = 15 - y; // the bottom ink row is fb = 0
      if (state === 'd') return d === 1 && lit ? lo : base;   // pressed: shadow inside the top edge, no lip
      if (fb === 1) return lip;                                // the 3D lip
      if (fb === 2) return lo;
      if (d === 1) return lit ? hi : lo;
      if (y === 2 && x >= 3 && x <= 12) return shine;          // plastic shine row
      return base;
    },
  });
}

/** Small chip / pill 8×8, slice 3. */
function paintChip(R: Ramp, flat = false) {
  return frame({ w: 8, h: 8, notch: 1, ink: R[0], paint: (_x, y, d) => (d === 1 && y <= 1 ? R[4] : flat ? R[2] : R[2]) });
}

/** Card 16×16, slice 4: ink, bevel, face plate. */
function paintCard(P: Ramp) {
  return frame({ w: 16, h: 16, notch: 2, ink: P[0], paint: (_x, _y, d, lit) => (d === 1 ? (lit ? P[4] : P[1]) : P[3]) });
}

/** Tab 16×12, slice 4 (top corners notched, open bottom). */
function paintTab(P: Ramp, on: boolean, accent: string) {
  return frame({
    w: 16, h: 12, notch: 2, corners: [1, 1, 0, 0], ink: P[0],
    paint: (_x, y, d, lit) => {
      if (on && y === 1) return accent;
      if (d === 1) return lit ? P[4] : P[2];
      return on ? P[3] : P[2];
    },
  });
}

/** Brass plaque 12×12, slice 4 with a 1 px lip. */
function paintPlaque(R: Ramp) {
  return frame({
    w: 12, h: 12, notch: 1, ink: '#0a0e14',
    paint: (_x, y, d, lit) => {
      if (11 - y === 1 && d >= 1) return R[1];
      if (d === 1) return lit ? R[5] : R[2];
      return R[3];
    },
  });
}

/** Speech bubble 24×24, slice 8 (rounder pixel corners) + a tail. */
function paintBubble() {
  const P = RAMP.paper;
  return frame({
    w: 24, h: 24, notch: 5, ink: '#0a0e14',
    paint: (_x, y, d, lit) => {
      const fb = 23 - y;
      if (fb === 1 && d >= 1) return P[1];
      if (fb === 2 && d >= 1) return P[2];
      if (d === 1) return lit ? P[5] : P[2];
      return P[3];
    },
  });
}
function paintTail() {
  const im = new Img(10, 8);
  const P = RAMP.paper;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) {
    const right = 9 - y;          // diagonal edge
    if (x > right) continue;
    if (x === 0 || x === right || y === 7 - 0 && x <= 1) im.set(x, y, '#0a0e14');
    else im.set(x, y, y < 2 ? P[1] : P[2]);
  }
  for (let x = 1; x < 9; x++) im.set(x, 0, P[1]);
  return im;
}

/** Pixel circle (knobs, thumbs, lamps) of diameter n. */
function paintCircle(n: number, R: Ramp) {
  const im = new Img(n, n);
  const c = (n - 1) / 2, r = n / 2;
  const IN = (x: number, y: number) => (x - c) ** 2 + (y - c) ** 2 <= (r - 0.35) ** 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!IN(x, y)) continue;
    const edge = !IN(x - 1, y) || !IN(x + 1, y) || !IN(x, y - 1) || !IN(x, y + 1);
    if (edge) { im.set(x, y, R[0]); continue; }
    const t = (x - c) + (y - c);
    im.set(x, y, t < -2.5 ? R[5] : t < -0.5 ? R[4] : t < 2 ? R[3] : R[2]);
  }
  return im;
}

/** Toggle track 26×14 (pill made of steps). */
function paintTrack(on: boolean) {
  const face = on ? RAMP.glob[1] : '#05090d';
  return frame({ w: 26, h: 14, notch: 4, ink: '#0a0e14', paint: (_x, _y, d, lit) => (d === 1 ? (lit ? (on ? RAMP.glob[0] : '#020406') : (on ? RAMP.glob[2] : RAMP.steel[2])) : face) });
}

/** Hazard stripe tile 8×8 (45° stripes, seamless). */
function paintHazard() {
  const im = new Img(8, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) im.set(x, y, (x + y) % 8 < 4 ? '#d89a26' : '#1a160c');
  return im;
}

/** Keycap 8×8 (slice 3). */
function paintKey() {
  const R = RAMP.steel;
  return frame({ w: 8, h: 9, notch: 1, ink: R[0], paint: (_x, y, d, lit) => (8 - y === 1 ? R[1] : d === 1 ? (lit ? R[5] : R[2]) : R[4]) });
}

// ── install ──────────────────────────────────────────────────────────────────
let installed = false;
export function installPixelSkins() {
  if (installed) return;
  installed = true;
  const set: Record<string, string> = {};
  set.win = paintWin().url();
  set.bar = paintTile(RAMP.dark).url();
  set.plate = paintTile(RAMP.hull).url();
  set.screen = paintInset('#07111a').url();
  set.field = paintInset('#040a0f', RAMP.steel, false).url();
  set['field-focus'] = paintInset('#040a0f', RAMP.steel, false, '#34b2c6').url();
  set.card = paintCard(['#0a0e14', '#151d26', '#1c2630', '#1f2a35', '#2e3c4a', '#4a5a6a']).url();
  set.toast = paintCard(RAMP.steel).url();
  for (const [k, R] of Object.entries({ steel: RAMP.steel, glob: RAMP.glob, pink: RAMP.pink, cyan: RAMP.cyan, amber: RAMP.amber, danger: RAMP.red, ghost: RAMP.hull })) {
    set[`btn-${k}`] = paintButton(R, 'n').url();
    set[`btn-${k}-h`] = paintButton(R, 'h').url();
    set[`btn-${k}-d`] = paintButton(R, 'd').url();
  }
  set.chip = paintChip(RAMP.hull).url();
  set['chip-g'] = paintChip(RAMP.glob).url();
  set['chip-p'] = paintChip(RAMP.pink).url();
  set['chip-c'] = paintChip(RAMP.cyan).url();
  set['chip-a'] = paintChip(RAMP.amber).url();
  set['chip-r'] = paintChip(RAMP.red).url();
  set.tab = paintTab(RAMP.hull, false, '').url();
  set['tab-on'] = paintTab(['#0a0e14', '#0b1117', '#111a22', '#0a121a', '#1f2c38', '#2d3d4c'], true, '#34b2c6').url();
  set.plaque = paintPlaque(RAMP.brass).url();
  set['plaque-steel'] = paintPlaque(['#0a0e14', '#4c5866', '#6f7e8c', '#a6b4c2', '#d6e0ea', '#ffffff']).url();
  set['plaque-glow'] = paintPlaque(RAMP.glob).url();
  set['plaque-warn'] = paintPlaque(RAMP.amber).url();
  set['plaque-crit'] = paintPlaque(RAMP.red).url();
  set.bubble = paintBubble().url();
  set.tail = paintTail().url();
  set['track-off'] = paintTrack(false).url();
  set['track-on'] = paintTrack(true).url();
  set.knob = paintCircle(11, RAMP.steel).url();
  set['knob-on'] = paintCircle(11, RAMP.glob).url();
  set.key = paintKey().url();
  set.hazard = paintHazard().url();
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(set)) root.setProperty(`--px-${k}`, `url("${v}")`);
}
