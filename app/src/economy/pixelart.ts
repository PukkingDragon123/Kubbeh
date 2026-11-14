// Procedural pixel art for GLOB LABS: alien portraits (wardrobe, idea lab, widget) and
// thumbnails for every GENE-O-MAT item. Everything is drawn pixel-by-pixel on a tiny grid
// and finished with a dark sticker outline, then shown upscaled with nearest-neighbour.

import type { AlienLook, Expression } from '../core/types';
import { catalogById } from './catalog';

type RGBA = [number, number, number, number];
const colorCache = new Map<string, RGBA>();
export function rgba(hex: string): RGBA {
  let c = colorCache.get(hex);
  if (c) return c;
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  c = [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16), n.length >= 8 ? parseInt(n.slice(6, 8), 16) : 255];
  colorCache.set(hex, c);
  return c;
}
export function mix(a: string, b: string, t: number): string {
  const A = rgba(a), B = rgba(b);
  const f = (i: number) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0');
  return `#${f(0)}${f(1)}${f(2)}`;
}
export const lighten = (c: string, t = 0.35) => mix(c, '#ffffff', t);
export const darken = (c: string, t = 0.3) => mix(c, '#000000', t);

export class Painter {
  readonly data: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) { this.data = new Uint8ClampedArray(w * h * 4); }

  px(x: number, y: number, color: string, alpha = 1) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b, a] = rgba(color);
    const i = (y * this.w + x) * 4;
    const al = (a / 255) * alpha;
    if (al >= 0.999) { this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255; return; }
    const d = this.data, ea = d[i + 3] / 255, oa = al + ea * (1 - al);
    if (oa <= 0) return;
    d[i] = (r * al + d[i] * ea * (1 - al)) / oa; d[i + 1] = (g * al + d[i + 1] * ea * (1 - al)) / oa; d[i + 2] = (b * al + d[i + 2] * ea * (1 - al)) / oa; d[i + 3] = oa * 255;
  }
  clear(x: number, y: number) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.data[(y * this.w + x) * 4 + 3] = 0; }
  opaque(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.data[(y * this.w + x) * 4 + 3] > 40; }
  rect(x: number, y: number, w: number, h: number, c: string, a = 1) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, a); }
  ell(cx: number, cy: number, rx: number, ry: number, c: string, a = 1, clip?: (x: number, y: number) => boolean) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx - 0.5) / rx, ny = (y + 0.5 - cy - 0.5) / ry;
      if (nx * nx + ny * ny <= 1 && (!clip || clip(x, y))) this.px(x, y, c, a);
    }
  }
  /** Ellipse with a top-left light and a bottom-right shadow — the "jelly" look. */
  blob(cx: number, cy: number, rx: number, ry: number, base: string, a = 1, clip?: (x: number, y: number) => boolean) {
    const light = lighten(base, 0.32), dark = darken(base, 0.24), spec = lighten(base, 0.7);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      if (nx * nx + ny * ny > 1 || (clip && !clip(x, y))) continue;
      let c = base;
      if (nx * 0.35 + ny * 0.85 > 0.55) c = dark;
      else if (-nx * 0.6 - ny * 0.75 > 0.5) c = light;
      this.px(x, y, c, a);
    }
    this.ell(cx - rx * 0.45, cy - ry * 0.55, Math.max(1, rx * 0.14), Math.max(1, ry * 0.12), spec, a);
  }
  ring(cx: number, cy: number, rx: number, ry: number, c: string, t = 1, clip?: (x: number, y: number) => boolean) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const o = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      const i = ((x - cx) / Math.max(0.5, rx - t)) ** 2 + ((y - cy) / Math.max(0.5, ry - t)) ** 2;
      if (o <= 1 && i > 1 && (!clip || clip(x, y))) this.px(x, y, c);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.px(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: string) {
    const minX = Math.floor(Math.min(ax, bx, cx)), maxX = Math.ceil(Math.max(ax, bx, cx));
    const minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
    const s = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const d1 = s(px, py, ax, ay, bx, by), d2 = s(px, py, bx, by, cx, cy), d3 = s(px, py, cx, cy, ax, ay);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) this.px(x, y, c);
    }
  }
  /** Dark sticker outline around every opaque shape. */
  outline(c = '#0b130d') {
    const mark: number[] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.opaque(x, y)) continue;
      if (this.opaque(x - 1, y) || this.opaque(x + 1, y) || this.opaque(x, y - 1) || this.opaque(x, y + 1)) mark.push(x, y);
    }
    for (let i = 0; i < mark.length; i += 2) this.px(mark[i], mark[i + 1], c);
  }
  canvas(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    this.blit(cv);
    return cv;
  }
  blit(cv: HTMLCanvasElement) {
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
  }
}

// ── alien portraits (40×40) ──────────────────────────────────────────────────
export const PORTRAIT = 40;

export interface SkinPalette { body: string; belly: string; alpha?: number; pattern?: 'pickle' | 'magma' | 'void' | 'gold' | 'pounce' }

export function skinPalette(look: Pick<AlienLook, 'skin' | 'body' | 'belly'>): SkinPalette {
  switch (look.skin) {
    case 'pickle': return { body: '#7aa83a', belly: '#b9de6c', pattern: 'pickle' };
    case 'bubblegum': return { body: '#ff8fd0', belly: '#ffd3ee' };
    case 'ghost': return { body: '#8ff3ff', belly: '#e0feff', alpha: 0.72 };
    case 'magma': return { body: '#ff7a2a', belly: '#ffd25a', pattern: 'magma' };
    case 'void': return { body: '#3b2073', belly: '#5d3fa3', pattern: 'void' };
    case 'gold': return { body: '#f2bf3a', belly: '#fff0a3', pattern: 'gold' };
    case 'pounce': return { body: '#e9edf0', belly: '#ffffff', pattern: 'pounce' };
    default: return { body: look.body, belly: look.belly };
  }
}
/** Skins whose colours come from the skin itself (body pickers have no effect). */
export const FIXED_COLOR_SKINS = new Set(['pickle', 'bubblegum', 'ghost', 'magma', 'void', 'gold', 'pounce']);

export interface PortraitOpts { expression?: Expression; blink?: boolean; talk?: boolean; bob?: number; noCosmetics?: boolean }

const HEAD = { cx: 20, cy: 16, rx: 13, ry: 11 };
const BODY = { cx: 20, cy: 31, rx: 7.5, ry: 6 };
const EYE_L = { cx: 14.5, cy: 17, rx: 4.6, ry: 5.4 };
const EYE_R = { cx: 25.5, cy: 17, rx: 4.6, ry: 5.4 };
const INK = '#0b130d';

const inHead = (x: number, y: number) => ((x - HEAD.cx) / HEAD.rx) ** 2 + ((y - HEAD.cy) / HEAD.ry) ** 2 <= 1;
const inBody = (x: number, y: number) => ((x - BODY.cx) / BODY.rx) ** 2 + ((y - BODY.cy) / BODY.ry) ** 2 <= 1;

export function drawAlien(p: Painter, look: AlienLook, o: PortraitOpts = {}) {
  const pal = skinPalette(look);
  const A = pal.alpha ?? 1;
  const expr = o.expression ?? look.expression;
  const cos = o.noCosmetics ? {} : { hat: look.hat, outfit: look.outfit, accessory: look.accessory };
  const pounce = look.skin === 'pounce';

  // behind-the-body layers
  if (cos.outfit === 'cape') { p.ell(20, 33, 11, 6.5, '#d8304a'); p.ell(20, 34, 10, 5, '#a81f38', 1, (x, y) => y > 35); }
  if (cos.accessory === 'jetpack') {
    for (const x of [9, 28]) { p.rect(x, 26, 4, 9, '#9aa6b2'); p.rect(x, 26, 1, 9, '#d6dde3'); p.rect(x, 34, 4, 1, '#5f6a75'); p.rect(x + 1, 35, 2, 2, '#ffb43f'); p.px(x + 1, 37, '#ff6a3d'); p.px(x + 2, 37, '#ffe066'); }
  }
  if (cos.accessory === 'backpack') { p.rect(11, 28, 3, 6, '#a0662f'); p.rect(26, 28, 3, 6, '#a0662f'); }

  // antennae (or ears for pounce)
  if (pounce) {
    for (const s of [-1, 1]) {
      const ex = 20 + s * 9.5;
      p.ell(ex, 6.5, 4, 4.2, '#dfe5ea');
      p.ell(ex, 7, 2.4, 2.6, '#9aa4ab');
      p.ell(ex + s * -0.5, 7.5, 1.2, 1.4, '#f2b8c6');
    }
  } else {
    p.line(14, 8, 11, 3, darken(pal.body, 0.1)); p.line(15, 8, 12, 3, pal.body);
    p.line(26, 8, 29, 3, darken(pal.body, 0.1)); p.line(25, 8, 28, 3, pal.body);
    p.blob(11, 2.5, 2.3, 2.3, look.bulbA); p.blob(29, 2.5, 2.3, 2.3, look.bulbB);
  }

  // feet + arms + body
  p.blob(16, 36.5, 2.6, 1.6, pal.body, A); p.blob(24, 36.5, 2.6, 1.6, pal.body, A);
  const pawUp = pounce;
  p.blob(12.2, 31, 2.1, 3, pal.body, A);
  if (!pawUp) p.blob(27.8, 31, 2.1, 3, pal.body, A);
  p.blob(BODY.cx, BODY.cy, BODY.rx, BODY.ry, pal.body, A);
  p.ell(20, 32.5, 4.2, 3.4, pal.belly, A);
  bodyPattern(p, pal, 'body');
  outfitFront(p, cos.outfit);

  // head
  p.blob(HEAD.cx, HEAD.cy, HEAD.rx, HEAD.ry, pal.body, A);
  bodyPattern(p, pal, 'head');
  // cheeks
  if (expr !== 'grumpy') { p.rect(8, 22, 2, 1, '#ff8fb8', 0.85); p.rect(30, 22, 2, 1, '#ff8fb8', 0.85); }

  drawEyes(p, look, expr, !!o.blink, pal);
  drawMouth(p, expr, !!o.talk, pounce);
  if (pounce) {
    // whiskers
    for (const s of [-1, 1]) { p.line(20 + s * 7, 22, 20 + s * 12, 21, '#b8c2c8'); p.line(20 + s * 7, 23, 20 + s * 12, 24, '#b8c2c8'); }
    // the raised paw with beans (just like the photo)
    p.blob(26, 31, 5.6, 5.2, '#f4f6f8');
    p.ell(26, 32.6, 2.4, 1.9, '#1b1b1f');
    for (const [bx, by] of [[22.3, 28.7], [24.6, 27.3], [27.4, 27.3], [29.7, 28.7]]) p.ell(bx, by, 1.15, 1.25, '#1b1b1f');
  }

  accessoryFront(p, cos.accessory, look);
  drawHat(p, cos.hat);
  p.outline(INK);
}

function bodyPattern(p: Painter, pal: SkinPalette, part: 'head' | 'body') {
  const clip = part === 'head' ? inHead : inBody;
  const spots = part === 'head'
    ? [[11, 12], [29, 12], [17, 7], [24, 8], [9, 18], [31, 19], [20, 5], [12, 24], [28, 25]]
    : [[15, 29], [25, 29], [18, 34], [23, 34]];
  switch (pal.pattern) {
    case 'pickle': for (const [x, y] of spots) { p.px(x, y, '#5c8526'); p.px(x + 1, y, '#a3cf5a'); } break;
    case 'magma': for (const [x, y] of spots) { p.line(x - 1, y, x + 1, y + 1, '#ffe066'); p.px(x, y - 1, '#a8320f'); } break;
    case 'void': for (const [i, [x, y]] of spots.entries()) p.px(x, y, i % 2 ? '#b48cff' : '#ffffff'); break;
    case 'gold': for (const [i, [x, y]] of spots.entries()) if (i % 3 === 0) { p.px(x, y, '#ffffff'); p.px(x + 1, y, '#fff7d0'); } break;
    case 'pounce': {
      if (part === 'head') {
        // forehead speckles
        const speck = [[16, 7], [18, 6], [20, 8], [22, 6], [24, 7], [17, 9], [21, 10], [23, 9], [19, 11], [25, 10], [15, 10], [20, 6], [26, 9], [14, 8]];
        for (const [x, y] of speck) if (clip(x, y)) p.px(x, y, '#2a2a2e');
        for (const [x, y] of [[9, 14], [31, 14], [10, 25], [30, 25]]) p.ring(x, y, 1.6, 1.6, '#3a3a40');
      } else {
        for (const [x, y] of [[14, 28], [16, 33], [20, 29], [22, 35], [25, 31]]) if (clip(x, y)) { p.px(x, y, '#2a2a2e'); p.px(x + 1, y, '#2a2a2e'); }
      }
      break;
    }
  }
  void clip;
}

function eyeShape(p: Painter, e: typeof EYE_L, iris: string, pal: SkinPalette, mode: 'open' | 'half' | 'narrow' | 'shocked') {
  const ry = mode === 'narrow' ? e.ry * 0.7 : e.ry;
  const cy = mode === 'narrow' ? e.cy + 1 : e.cy;
  if (mode === 'shocked') {
    p.ell(e.cx, e.cy, e.rx, e.ry, '#fbfff3');
    p.ell(e.cx, e.cy + 0.5, e.rx * 0.5, e.ry * 0.5, '#0a0a0c');
    p.px(e.cx - 1, e.cy - 1, '#ffffff');
    return;
  }
  p.ell(e.cx, cy, e.rx, ry, '#0a0a0c');
  // tinted iris glow in the lower part of the eye (like the reference aliens)
  p.ell(e.cx, cy + ry * 0.45, e.rx * 0.78, ry * 0.42, iris, 0.85, (x, y) => ((x - e.cx) / e.rx) ** 2 + ((y - cy) / ry) ** 2 <= 0.8);
  // highlights
  p.ell(e.cx - e.rx * 0.38, cy - ry * 0.42, 1.4, 1.5, '#ffffff');
  p.px(e.cx + e.rx * 0.38, cy + ry * 0.2, '#ffffff');
  if (mode === 'half') p.rect(Math.floor(e.cx - e.rx) - 1, Math.floor(cy - ry) - 1, Math.ceil(e.rx * 2) + 3, Math.ceil(ry) + 1, darken(pal.body, 0.08));
  if (mode === 'narrow' || mode === 'half') p.line(e.cx - e.rx, mode === 'half' ? cy : cy - ry + 0.5, e.cx + e.rx, mode === 'half' ? cy : cy - ry + 0.5, INK);
}

function closedEye(p: Painter, e: typeof EYE_L, happy = true) {
  const y = e.cy + 1;
  if (happy) { p.line(e.cx - 3, y + 1, e.cx - 1, y - 1, INK); p.line(e.cx - 1, y - 1, e.cx + 1, y - 1, INK); p.line(e.cx + 1, y - 1, e.cx + 3, y + 1, INK); }
  else { p.line(e.cx - 3, y - 1, e.cx - 1, y + 1, INK); p.line(e.cx - 1, y + 1, e.cx + 1, y + 1, INK); p.line(e.cx + 1, y + 1, e.cx + 3, y - 1, INK); }
}

function heartEye(p: Painter, e: typeof EYE_L) {
  p.ell(e.cx - 1.6, e.cy - 1, 2.3, 2.3, '#ff4f9a'); p.ell(e.cx + 1.6, e.cy - 1, 2.3, 2.3, '#ff4f9a');
  p.tri(e.cx - 4, e.cy, e.cx + 4, e.cy, e.cx, e.cy + 4.5, '#ff4f9a');
  p.px(e.cx - 2, e.cy - 2, '#ffd0e4');
}

function drawEyes(p: Painter, look: AlienLook, expr: Expression, blink: boolean, pal: SkinPalette) {
  const iris = look.skin === 'pounce' ? '#3a2a20' : look.eyes;
  if (blink && expr !== 'love') { closedEye(p, EYE_L, false); closedEye(p, EYE_R, false); return; }
  switch (expr) {
    case 'sleepy': eyeShape(p, EYE_L, iris, pal, 'half'); eyeShape(p, EYE_R, iris, pal, 'half'); p.px(33, 8, '#9db4ff'); p.px(34, 6, '#9db4ff'); p.px(35, 4, '#cfdcff'); break;
    case 'wink': eyeShape(p, EYE_L, iris, pal, 'open'); closedEye(p, EYE_R, true); break;
    case 'love': heartEye(p, EYE_L); heartEye(p, EYE_R); break;
    case 'focused': eyeShape(p, EYE_L, iris, pal, 'narrow'); eyeShape(p, EYE_R, iris, pal, 'narrow'); break;
    case 'shocked': eyeShape(p, EYE_L, iris, pal, 'shocked'); eyeShape(p, EYE_R, iris, pal, 'shocked'); break;
    case 'grumpy':
      eyeShape(p, EYE_L, iris, pal, 'narrow'); eyeShape(p, EYE_R, iris, pal, 'narrow');
      p.line(10, 11, 18, 13, INK); p.line(30, 11, 22, 13, INK); break;
    case 'derp':
      eyeShape(p, EYE_L, iris, pal, 'open');
      p.ell(EYE_R.cx, EYE_R.cy + 1, EYE_R.rx * 0.8, EYE_R.ry * 0.8, '#0a0a0c');
      p.ell(EYE_R.cx + 1.5, EYE_R.cy + 2.5, 1.2, 1.2, '#ffffff'); break;
    case 'cry':
      eyeShape(p, EYE_L, iris, pal, 'open'); eyeShape(p, EYE_R, iris, pal, 'open');
      for (const x of [11, 29]) { p.rect(x, 22, 1, 5, '#59c8ff'); p.px(x, 27, '#a8e4ff'); } break;
    default: eyeShape(p, EYE_L, iris, pal, 'open'); eyeShape(p, EYE_R, iris, pal, 'open');
  }
}

function drawMouth(p: Painter, expr: Expression, talk: boolean, pounce: boolean) {
  if (pounce) { p.tri(18.5, 21.5, 21.5, 21.5, 20, 23, '#3d3434'); }
  const y = pounce ? 24 : 23;
  if (talk) { p.ell(20, y + 0.5, 1.8, 1.4, '#3a0f1a'); p.px(20, y + 1, '#ff7aa2'); return; }
  switch (expr) {
    case 'shocked': p.ring(20, y + 0.5, 1.6, 1.6, INK); break;
    case 'derp': p.rect(18, y, 4, 2, '#3a0f1a'); p.px(21, y + 1, '#ff7aa2'); p.px(21, y + 2, '#ff7aa2'); break;
    case 'tongue': p.line(18, y, 22, y, INK); p.rect(20, y + 1, 2, 2, '#ff7aa2'); break;
    case 'grumpy': p.line(18, y + 1, 19, y, INK); p.line(19, y, 21, y, INK); p.line(21, y, 22, y + 1, INK); break;
    case 'cry': p.line(18, y + 1, 19, y, INK); p.line(20, y + 1, 21, y, INK); p.px(22, y + 1, INK); break;
    case 'sleepy': p.rect(19, y, 2, 1, INK); break;
    case 'focused': p.line(18, y, 21, y, INK); break;
    default: p.px(18, y, INK); p.line(19, y + 1, 21, y + 1, INK); p.px(22, y, INK);
  }
}

function outfitFront(p: Painter, outfit?: string) {
  if (!outfit) return;
  const clip = (x: number, y: number) => inBody(x, y) && y >= 27;
  const fill = (c: string) => p.ell(BODY.cx, BODY.cy, BODY.rx, BODY.ry, c, 1, clip);
  switch (outfit) {
    case 'labcoat': fill('#f2f5f0'); p.line(20, 27, 20, 37, '#c9d1c6'); p.line(18, 27, 20, 30, '#b4bfb2'); p.line(22, 27, 20, 30, '#b4bfb2'); p.px(16, 33, '#7cc6ff'); p.px(16, 32, '#ff6fd6'); break;
    case 'hoodie': fill('#5a6b8c'); p.rect(17, 32, 6, 3, '#4a5975'); p.px(19, 28, '#ffffff'); p.px(19, 29, '#ffffff'); p.px(21, 28, '#ffffff'); p.px(21, 29, '#ffffff'); break;
    case 'overalls': p.ell(BODY.cx, BODY.cy, BODY.rx, BODY.ry, '#3f6fd8', 1, (x, y) => inBody(x, y) && y >= 31); p.rect(16, 27, 1, 4, '#3f6fd8'); p.rect(23, 27, 1, 4, '#3f6fd8'); p.px(16, 31, '#ffd23f'); p.px(23, 31, '#ffd23f'); p.rect(18, 32, 4, 2, '#2f58b0'); break;
    case 'hazmat': fill('#ffd23f'); p.ring(20, 32, 2.5, 2.5, '#1d1d26'); p.px(20, 32, '#1d1d26'); p.rect(13, 35, 14, 1, '#d9a91a'); break;
    case 'tuxedo': fill('#1d1d26'); p.tri(18, 27, 22, 27, 20, 33, '#f6f6f2'); p.px(20, 30, '#1d1d26'); p.px(20, 32, '#1d1d26'); p.rect(19, 27, 3, 1, '#c22a48'); break;
    case 'spacesuit': fill('#eef2f7'); p.rect(17, 30, 6, 4, '#ff8a3d'); p.px(18, 31, '#52f2ff'); p.px(20, 31, '#8cf56b'); p.px(21, 32, '#ff6fd6'); p.rect(14, 27, 12, 1, '#b8c2cc'); break;
    case 'cape': p.rect(15, 27, 10, 1, '#d8304a'); p.px(20, 28, '#ffd23f'); break;
  }
}

function accessoryFront(p: Painter, acc: string | undefined, look: AlienLook) {
  if (!acc) return;
  switch (acc) {
    case 'headphones':
      p.ring(20, 16, 14.5, 12.5, '#2b2b33', 1.5, (x, y) => y <= 12);
      p.blob(6.5, 17, 2.4, 3.6, '#ff6fd6'); p.blob(33.5, 17, 2.4, 3.6, '#ff6fd6'); break;
    case 'bowtie': p.tri(16.5, 25.5, 16.5, 29.5, 20, 27.5, '#ff4f8a'); p.tri(23.5, 25.5, 23.5, 29.5, 20, 27.5, '#ff4f8a'); p.rect(19, 26, 2, 3, '#d42e6b'); break;
    case 'scarf':
      for (let x = 12; x <= 28; x++) p.rect(x, 26, 1, 2, Math.floor(x / 2) % 2 ? '#ff5a5a' : '#fbfff3');
      p.rect(24, 28, 3, 5, '#ff5a5a'); p.rect(24, 30, 3, 1, '#fbfff3'); break;
    case 'glasses':
      p.ring(EYE_L.cx, EYE_L.cy, EYE_L.rx + 1.3, EYE_L.ry + 1.2, '#2b2b33'); p.ring(EYE_R.cx, EYE_R.cy, EYE_R.rx + 1.3, EYE_R.ry + 1.2, '#2b2b33');
      p.line(19, 15, 21, 15, '#2b2b33'); break;
    case 'mustache':
      p.ell(17.5, 22.5, 2.6, 1.3, '#6b4226'); p.ell(22.5, 22.5, 2.6, 1.3, '#6b4226'); p.px(14, 21, '#6b4226'); p.px(26, 21, '#6b4226'); break;
    case 'monocle': p.ring(EYE_R.cx, EYE_R.cy, EYE_R.rx + 1.4, EYE_R.ry + 1.3, '#e8b84a'); p.line(30, 22, 29, 29, '#e8b84a'); break;
    case 'backpack': p.rect(15, 26, 1, 7, '#7a4a1f'); p.rect(24, 26, 1, 7, '#7a4a1f'); break;
    case 'jetpack': p.rect(15, 26, 1, 5, '#5f6a75'); p.rect(24, 26, 1, 5, '#5f6a75'); break;
  }
  void look;
}

function drawHat(p: Painter, hat?: string) {
  if (!hat) return;
  switch (hat) {
    case 'goggles':
      p.rect(7, 7, 26, 2, '#4a3a2e');
      for (const x of [14.5, 25.5]) { p.ell(x, 7.5, 3.3, 3.3, '#c9a25a'); p.ell(x, 7.5, 2.2, 2.2, '#7fe7ff'); p.px(x - 1, 6.5, '#ffffff'); }
      break;
    case 'hardhat':
      p.ell(20, 7.5, 10.5, 6, '#ffcc33', 1, (_x, y) => y <= 7); p.rect(7, 7, 26, 2, '#e0a800'); p.rect(19, 2, 2, 5, '#ffe27a'); p.px(14, 4, '#fff3b0'); break;
    case 'tophat': p.rect(9, 6, 22, 2, '#1d1d26'); p.rect(13, 0, 14, 6, '#1d1d26'); p.rect(13, 4, 14, 1, '#ff6fd6'); p.rect(14, 0, 1, 4, '#3a3a4a'); break;
    case 'propeller':
      p.ell(20, 7, 9, 5, '#ff5a5a', 1, (_x, y) => y <= 6); p.ell(20, 7, 9, 5, '#3b5bff', 1, (x, y) => y <= 6 && x > 20); p.ell(20, 7, 9, 5, '#ffe14d', 1, (x, y) => y <= 6 && Math.abs(x - 20) < 2);
      p.rect(20, 0, 1, 2, '#2b2b33'); p.rect(15, 0, 5, 1, '#ff5a5a'); p.rect(21, 0, 5, 1, '#3b5bff'); break;
    case 'beanie':
      p.ell(20, 8, 11.5, 7, '#ff6f61', 1, (_x, y) => y <= 7); for (let x = 10; x < 31; x += 3) p.rect(x, 3, 1, 4, '#e0503f'); p.rect(8, 7, 24, 2, '#c9433a'); p.ell(20, 1.5, 2, 1.8, '#fbfff3'); break;
    case 'chef': p.rect(12, 4, 16, 5, '#fbfff3'); p.ell(15, 3, 3.5, 3, '#fbfff3'); p.ell(20, 2, 3.6, 2.6, '#fbfff3'); p.ell(25, 3, 3.5, 3, '#fbfff3'); p.rect(12, 7, 16, 1, '#dfe5dc'); break;
    case 'wizard': p.tri(9, 8, 31, 8, 27, -1, '#7a4dff'); p.ell(20, 8, 13, 1.6, '#5a35d0'); p.px(19, 4, '#ffe14d'); p.px(23, 2, '#ffe14d'); p.px(16, 6, '#ffe14d'); p.px(25, 6, '#fff6b0'); break;
    case 'party': p.tri(14, 7, 26, 7, 20, -1, '#52f2ff'); for (let y = 1; y < 7; y += 2) p.line(20 - (y + 1) * 0.75, y, 20 + (y + 1) * 0.75, y, '#ff6fd6'); p.ell(20, 0, 1.6, 1.4, '#ffe14d'); break;
    case 'cowboy': p.rect(13, 1, 14, 6, '#8a5a2b'); p.rect(19, 1, 2, 2, '#6e4520'); p.rect(13, 5, 14, 1, '#3b2a1a'); p.ell(20, 7, 15, 2.2, '#a06a35'); break;
    case 'halo': p.ring(20, 1.5, 7, 1.6, '#ffe66d'); p.px(27, 1, '#52f2ff'); p.px(13, 2, '#ff6fd6'); p.px(24, 0, '#ffffff'); break;
    case 'crown':
      p.rect(12, 4, 16, 4, '#f5c542');
      for (const x of [12, 16, 20, 24, 27]) p.tri(x - 0.5, 4.5, x + 1.5, 4.5, x + 0.5, 0, '#f5c542');
      p.px(16, 5, '#ff4f6a'); p.px(20, 5, '#52f2ff'); p.px(24, 5, '#8cf56b'); p.rect(12, 7, 16, 1, '#c9971f'); break;
  }
}

// ── portrait helpers ─────────────────────────────────────────────────────────
export function portraitPainter(look: AlienLook, o?: PortraitOpts) {
  const p = new Painter(PORTRAIT, PORTRAIT);
  drawAlien(p, look, o);
  return p;
}

const BASE_LOOK: AlienLook = { id: 'base', name: 'Model', skin: 'glob', body: '#7be35f', belly: '#b6f59a', eyes: '#1b2a8f', bulbA: '#ff7ad9', bulbB: '#3b5bff', expression: 'happy', quirk: 'bouncy' };

// ── item thumbnails (32×32 for placeables, portraits for wearables) ─────────
const thumbCache = new Map<string, string>();

export function itemThumb(id: string): string {
  const hit = thumbCache.get(id);
  if (hit) return hit;
  const item = catalogById.get(id);
  let p: Painter;
  if (item && ['hat', 'outfit', 'accessory', 'skin', 'expression'].includes(item.category)) {
    const look: AlienLook = { ...BASE_LOOK };
    if (item.category === 'hat') look.hat = id;
    if (item.category === 'outfit') look.outfit = id;
    if (item.category === 'accessory') look.accessory = id;
    if (item.category === 'skin') look.skin = id;
    if (item.category === 'expression') look.expression = id.replace('expr_', '') as Expression;
    p = portraitPainter(look);
  } else {
    p = new Painter(32, 32);
    (THUMBS[id] ?? THUMBS._default)(p);
    p.outline(INK);
  }
  const url = p.canvas().toDataURL();
  thumbCache.set(id, url);
  return url;
}

const T = (fn: (p: Painter) => void) => fn;
const THUMBS: Record<string, (p: Painter) => void> = {
  _default: T((p) => { p.blob(16, 18, 9, 9, '#8cf56b'); p.rect(14, 12, 4, 8, '#0b130d'); p.rect(14, 22, 4, 3, '#0b130d'); }),
  beanbag: T((p) => { p.blob(16, 21, 12, 8, '#8cf56b'); p.ell(16, 15, 8, 4, '#a8ff8a'); p.px(10, 18, '#ffffff'); }),
  couch: T((p) => { p.rect(4, 12, 24, 10, '#8a4f7d'); p.rect(2, 16, 4, 10, '#7a4470'); p.rect(26, 16, 4, 10, '#7a4470'); p.rect(6, 19, 20, 5, '#a8619a'); p.line(16, 19, 16, 23, '#7a4470'); p.rect(4, 26, 2, 3, '#3b2a1a'); p.rect(26, 26, 2, 3, '#3b2a1a'); p.rect(9, 14, 5, 3, '#6a3a60'); }),
  workbench: T((p) => { p.rect(3, 13, 26, 4, '#9a6a3a'); p.rect(3, 13, 26, 1, '#c08a52'); p.rect(5, 17, 3, 12, '#6e4a28'); p.rect(24, 17, 3, 12, '#6e4a28'); p.rect(8, 21, 16, 2, '#6e4a28'); p.rect(8, 9, 6, 4, '#52f2ff'); p.rect(18, 10, 2, 3, '#ff6fd6'); p.rect(21, 11, 5, 2, '#9aa6b2'); }),
  shelf: T((p) => { p.rect(5, 3, 22, 26, '#5b4636'); p.rect(7, 5, 18, 22, '#2b2018'); for (const y of [11, 18, 25]) p.rect(7, y, 18, 2, '#7a5d46'); p.blob(11, 8, 2.5, 3, '#8cf56b'); p.blob(19, 8, 2.5, 3, '#ff6fd6'); p.rect(10, 14, 3, 4, '#52f2ff'); p.rect(16, 15, 6, 3, '#ffbe3d'); p.ell(12, 22, 2.5, 3, '#b48cff'); p.rect(18, 21, 4, 4, '#d0d7dd'); }),
  rug: T((p) => { p.ell(16, 19, 14, 8, '#4a7a3a'); p.ring(16, 19, 11, 6, '#8cf56b'); p.ring(16, 19, 6, 3.4, '#c8ff9e'); p.ell(16, 19, 2, 1.2, '#c8ff9e'); p.ell(25, 17, 1.5, 1, '#c8ff9e'); }),
  stool: T((p) => { p.ell(16, 11, 8, 3, '#9aa6b2'); p.ell(16, 10, 6, 1.6, '#c4ccd3'); p.line(10, 13, 7, 28, '#5f6a75'); p.line(22, 13, 25, 28, '#5f6a75'); p.line(16, 14, 16, 29, '#5f6a75'); p.rect(14, 10, 4, 1, '#ffbe3d'); }),
  neon_heart: T((p) => { p.rect(2, 4, 28, 24, '#16121c'); p.ell(12, 13, 4.5, 4.5, '#ff6fd6'); p.ell(20, 13, 4.5, 4.5, '#ff6fd6'); p.tri(7.5, 14, 24.5, 14, 16, 24, '#ff6fd6'); p.ell(12, 13, 2, 2, '#16121c'); p.ell(20, 13, 2, 2, '#16121c'); p.tri(11, 15, 21, 15, 16, 20.5, '#16121c'); p.px(9, 11, '#ffd0f0'); }),
  neon_ufo: T((p) => { p.rect(2, 4, 28, 24, '#121a1c'); p.ring(16, 18, 11, 3.5, '#52f2ff'); p.ring(16, 13, 5, 4, '#8cf56b', 1, (_x, y) => y <= 15); for (const x of [9, 16, 23]) p.px(x, 18, '#ffbe3d'); p.line(12, 23, 10, 27, '#52f2ff'); p.line(20, 23, 22, 27, '#52f2ff'); }),
  poster: T((p) => { p.rect(5, 3, 22, 26, '#e8dcb5'); p.rect(5, 3, 22, 1, '#bfae80'); p.rect(8, 5, 16, 3, '#8a2a2a'); p.blob(16, 15, 5, 4.5, '#8cf56b'); p.ell(14, 15, 1.3, 1.8, '#0b130d'); p.ell(18, 15, 1.3, 1.8, '#0b130d'); p.rect(9, 22, 14, 1, '#6b5b40'); p.rect(11, 25, 10, 1, '#6b5b40'); p.px(5, 3, '#c8c8c8'); p.px(26, 3, '#c8c8c8'); }),
  graffiti: T((p) => { p.rect(1, 2, 30, 28, '#6d3a2e'); for (let y = 2; y < 30; y += 4) p.rect(1, y, 30, 1, '#4f281f'); for (let x = 1; x < 31; x += 6) p.rect(x + ((x / 6) % 2) * 3, 4, 1, 25, '#4f281f'); p.ring(16, 15, 9, 8, '#ff6fd6', 2); p.ell(12.5, 15, 2, 3, '#8cf56b'); p.ell(19.5, 15, 2, 3, '#8cf56b'); p.line(22, 22, 27, 27, '#52f2ff'); p.px(27, 28, '#52f2ff'); }),
  lava_lamp: T((p) => { p.tri(10, 26, 22, 26, 16, 29, '#5f6a75'); p.rect(10, 26, 12, 3, '#5f6a75'); p.tri(11, 25, 21, 25, 14, 6, '#2a1636'); p.tri(11, 25, 21, 25, 18, 6, '#2a1636'); p.rect(13, 4, 6, 3, '#5f6a75'); p.ell(15, 20, 2.5, 3, '#8cf56b'); p.ell(17, 12, 1.8, 2.2, '#8cf56b'); p.ell(16, 24, 3.5, 1.5, '#8cf56b'); }),
  disco: T((p) => { p.rect(15, 0, 2, 5, '#9aa6b2'); p.ell(16, 16, 11, 11, '#b9c3cc'); for (let y = 6; y < 27; y += 3) for (let x = 6; x < 27; x += 3) if (((x - 16) ** 2 + (y - 16) ** 2) < 110) p.px(x, y, (x + y) % 2 ? '#ffffff' : '#7a8794'); p.px(10, 10, '#ff6fd6'); p.px(20, 8, '#52f2ff'); p.px(22, 20, '#ffbe3d'); p.px(9, 22, '#8cf56b'); }),
  traffic_cone: T((p) => { p.rect(6, 26, 20, 3, '#ff7a1a'); p.tri(9, 26, 23, 26, 16, 3, '#ff8a2a'); p.rect(11, 18, 10, 3, '#fbfff3'); p.rect(13, 11, 6, 2, '#fbfff3'); p.line(14, 5, 12, 24, '#ffb06a'); }),
  trash_can: T((p) => { p.rect(7, 10, 18, 19, '#5f7a6a'); for (let x = 9; x < 25; x += 4) p.rect(x, 12, 1, 16, '#4a6255'); p.rect(5, 8, 22, 3, '#6f8d7a'); p.ell(13, 7, 3, 2.5, '#d0c8a0'); p.rect(18, 4, 3, 5, '#8cf56b'); p.px(23, 6, '#ff6fd6'); p.rect(14, 2, 2, 3, '#e8dcb5'); }),
  gnome: T((p) => { p.tri(10, 13, 22, 13, 16, 1, '#e2384b'); p.ell(16, 15, 5, 3.5, '#f2c9a0'); p.tri(11, 16, 21, 16, 16, 25, '#fbfff3'); p.rect(10, 22, 12, 7, '#3f6fd8'); p.rect(10, 28, 5, 2, '#5b3a1e'); p.rect(17, 28, 5, 2, '#5b3a1e'); p.px(14, 14, '#0b130d'); p.px(18, 14, '#0b130d'); p.ring(16, 7, 2, 2, '#8cf56b'); }),
  chomper: T((p) => { p.rect(11, 25, 10, 5, '#a0662f'); p.rect(10, 24, 12, 2, '#c4823f'); p.line(16, 24, 16, 17, '#3f8a2a'); p.ell(12, 21, 3, 1.4, '#5fd84a'); p.ell(16, 11, 9, 7, '#5fd84a'); p.ell(16, 12, 7, 3.5, '#b8204a'); for (let x = 10; x <= 22; x += 2) { p.px(x, 9, '#fbfff3'); p.px(x + 1, 15, '#fbfff3'); } p.ell(12, 6, 1.5, 1.5, '#fbfff3'); p.px(12, 6, '#0b130d'); p.ell(20, 6, 1.5, 1.5, '#fbfff3'); p.px(20, 6, '#0b130d'); }),
  eyeplant: T((p) => { p.rect(11, 25, 10, 5, '#5a4636'); p.line(16, 24, 15, 13, '#3f8a2a'); p.line(15, 18, 10, 14, '#3f8a2a'); p.ell(9, 13, 2, 3, '#5fd84a'); p.ell(16, 9, 6, 6, '#fbfff3'); p.ell(17, 9, 3.2, 3.2, '#ff6fd6'); p.ell(17, 9, 1.6, 1.6, '#0b130d'); p.px(15, 7, '#ffffff'); }),
  cactus: T((p) => { p.rect(10, 25, 12, 5, '#c4823f'); p.rect(13, 6, 6, 19, '#5fd84a'); p.rect(14, 6, 1, 19, '#8cf56b'); p.rect(7, 11, 3, 8, '#5fd84a'); p.rect(9, 17, 4, 2, '#5fd84a'); p.rect(22, 9, 3, 7, '#5fd84a'); p.rect(19, 14, 4, 2, '#5fd84a'); p.line(25, 5, 27, 3, '#52f2ff'); p.line(27, 3, 26, 2, '#52f2ff'); p.px(16, 9, '#fbfff3'); p.px(17, 15, '#fbfff3'); }),
  tentacle_fern: T((p) => { p.rect(10, 25, 12, 5, '#5a4636'); for (const [x, c] of [[8, '#b48cff'], [13, '#9b6ef0'], [19, '#b48cff'], [24, '#9b6ef0']] as const) { p.line(16, 25, x, 10, c); p.line(x, 10, x + (x < 16 ? -2 : 2), 6, c); p.px(x + (x < 16 ? -2 : 2), 5, '#ffd0f0'); } p.ell(16, 22, 3, 2, '#9b6ef0'); }),
  shroom: T((p) => { p.rect(9, 18, 3, 9, '#e8dcb5'); p.ell(10.5, 17, 6, 4, '#52f2ff', 1, (_x, y) => y <= 17); p.rect(20, 14, 3, 13, '#e8dcb5'); p.ell(21.5, 13, 7, 5, '#8cf56b', 1, (_x, y) => y <= 13); p.px(8, 15, '#fbfff3'); p.px(19, 10, '#fbfff3'); p.px(24, 11, '#fbfff3'); p.rect(4, 27, 24, 2, '#3a4a3a'); }),
  tesla: T((p) => { p.rect(9, 25, 14, 5, '#5f6a75'); p.rect(13, 10, 6, 15, '#b87333'); for (let y = 11; y < 25; y += 2) p.rect(13, y, 6, 1, '#8a5524'); p.ell(16, 7, 6, 4, '#c4ccd3'); p.line(22, 5, 27, 2, '#52f2ff'); p.line(10, 5, 5, 1, '#52f2ff'); p.line(5, 1, 3, 4, '#b48cff'); p.line(27, 2, 29, 6, '#b48cff'); }),
  microscope: T((p) => { p.rect(7, 26, 18, 3, '#5f6a75'); p.rect(19, 12, 3, 14, '#7a8794'); p.line(10, 6, 17, 17, '#c4ccd3'); p.line(11, 6, 18, 17, '#c4ccd3'); p.rect(8, 4, 4, 3, '#2b2b33'); p.rect(10, 20, 9, 2, '#9aa6b2'); p.ell(14, 19, 2, 1, '#8cf56b'); }),
  jars: T((p) => { for (const [x, h, c] of [[5, 12, '#8cf56b'], [13, 16, '#ff6fd6'], [21, 10, '#52f2ff']] as const) { p.rect(x, 29 - h, 7, h, '#cfe8e0'); p.rect(x + 1, 30 - h + 2, 5, h - 3, c); p.rect(x, 28 - h, 7, 2, '#7a8794'); p.ell(x + 3.5, 30 - h / 2, 1.5, 1.8, '#0b130d'); } }),
  brain_tank: T((p) => { p.rect(8, 26, 16, 4, '#5f6a75'); p.rect(9, 6, 14, 20, '#163a2e'); p.ring(16, 16, 7, 10, '#9be8d4', 1); p.ell(16, 15, 5, 4, '#ff9ac8'); p.line(13, 13, 15, 16, '#d0608f'); p.line(18, 12, 17, 17, '#d0608f'); p.rect(9, 4, 14, 2, '#7a8794'); p.px(12, 22, '#bfffe8'); p.px(19, 20, '#bfffe8'); }),
  teleporter: T((p) => { p.ell(16, 24, 13, 5, '#5f6a75'); p.ell(16, 23, 10, 3.5, '#52f2ff'); p.ell(16, 23, 6, 2, '#d8feff'); for (let y = 6; y < 22; y += 3) p.rect(10 + (y % 2), y, 12, 1, '#52f2ff', 0.55); p.px(12, 9, '#ffffff'); p.px(20, 14, '#ffffff'); }),
  server_rack: T((p) => { p.rect(8, 2, 16, 28, '#2b2f36'); for (let y = 4; y < 28; y += 4) { p.rect(10, y, 12, 3, '#3a404a'); p.px(11, y + 1, y % 8 ? '#8cf56b' : '#ff6fd6'); p.px(13, y + 1, '#52f2ff'); p.rect(16, y + 1, 5, 1, '#1a1d22'); } }),
  generator: T((p) => { p.ring(15, 15, 11, 11, '#9aa6b2', 2); for (let a = 0; a < 6; a++) p.line(15, 15, 15 + Math.cos(a) * 10, 15 + Math.sin(a) * 10, '#7a8794'); p.blob(15, 22, 4, 3, '#e0b080'); p.px(13, 21, '#0b130d'); p.px(17, 21, '#0b130d'); p.rect(4, 27, 22, 3, '#5f6a75'); p.rect(26, 18, 4, 9, '#ffbe3d'); p.px(27, 20, '#0b130d'); }),
  slot_machine: T((p) => { p.rect(5, 6, 20, 23, '#b8204a'); p.rect(5, 6, 20, 2, '#ff4f6a'); p.rect(7, 10, 16, 7, '#fbfff3'); p.px(10, 13, '#ff6fd6'); p.px(15, 13, '#8cf56b'); p.px(20, 13, '#ffbe3d'); p.rect(9, 20, 12, 2, '#ffbe3d'); p.rect(26, 9, 2, 10, '#c4ccd3'); p.ell(27, 7, 2.2, 2.2, '#ff4f6a'); for (let x = 6; x < 25; x += 3) p.px(x, 4, '#ffe14d'); }),
  arcade_cab: T((p) => { p.rect(7, 2, 18, 27, '#3b2a8a'); p.rect(7, 2, 18, 4, '#ff6fd6'); p.rect(9, 7, 14, 10, '#0b1a12'); p.blob(16, 12, 3, 2.5, '#8cf56b'); p.rect(7, 18, 18, 4, '#2a1f66'); p.px(11, 19, '#ff4f6a'); p.px(14, 20, '#52f2ff'); p.rect(19, 19, 3, 1, '#c4ccd3'); }),
  pinball: T((p) => { p.tri(3, 8, 29, 8, 24, 2, '#163a2e'); p.rect(3, 8, 26, 14, '#1d4d3a'); p.ell(10, 14, 2, 2, '#ff6fd6'); p.ell(18, 12, 2, 2, '#52f2ff'); p.ell(23, 16, 2, 2, '#ffbe3d'); p.ell(15, 17, 1, 1, '#d0d7dd'); p.rect(5, 22, 2, 7, '#5f6a75'); p.rect(25, 22, 2, 7, '#5f6a75'); p.rect(20, 1, 9, 6, '#b8204a'); }),
  jukebox: T((p) => { p.ell(16, 10, 11, 9, '#ff8a2a', 1, (_x, y) => y <= 10); p.rect(5, 10, 22, 19, '#ff8a2a'); p.ell(16, 10, 8, 6, '#ffe14d', 1, (_x, y) => y <= 10); p.rect(8, 10, 16, 8, '#2a1636'); for (let x = 9; x < 24; x += 3) p.rect(x, 11, 1, 6, '#b48cff'); p.rect(8, 21, 16, 3, '#fbfff3'); p.px(10, 22, '#ff4f6a'); }),
  claw: T((p) => { p.rect(6, 2, 20, 27, '#2f9acf'); p.rect(8, 6, 16, 14, '#d8feff'); p.rect(8, 6, 16, 14, '#1d4d6a', 0.65); p.line(16, 6, 16, 10, '#c4ccd3'); p.line(14, 10, 18, 10, '#c4ccd3'); p.line(14, 10, 13, 13, '#c4ccd3'); p.line(18, 10, 19, 13, '#c4ccd3'); p.blob(11, 18, 2.5, 2, '#8cf56b'); p.blob(16, 18, 2.5, 2, '#ff6fd6'); p.blob(21, 18, 2.5, 2, '#ffbe3d'); p.rect(6, 2, 20, 3, '#ffbe3d'); p.rect(10, 23, 4, 2, '#ff4f6a'); }),
  string_lights: T((p) => { for (let x = 1; x < 31; x++) p.px(x, 8 + Math.round(Math.sin(x / 5) * 3), '#3a4a3a'); const cs = ['#ff6fd6', '#8cf56b', '#52f2ff', '#ffbe3d']; for (let i = 0; i < 6; i++) { const x = 3 + i * 5; p.ell(x, 11 + Math.round(Math.sin(x / 5) * 3), 1.5, 2, cs[i % 4]); } for (let x = 1; x < 31; x++) p.px(x, 20 + Math.round(Math.cos(x / 5) * 3), '#3a4a3a'); for (let i = 0; i < 6; i++) { const x = 5 + i * 5; p.ell(x, 23 + Math.round(Math.cos(x / 5) * 3), 1.5, 2, cs[(i + 2) % 4]); } }),
  lamp_floor: T((p) => { p.ell(16, 28, 7, 2, '#3a404a'); p.rect(15, 9, 2, 19, '#5f6a75'); p.tri(8, 10, 24, 10, 16, 2, '#2b2f36'); p.ell(16, 11, 6, 1.5, '#ffe9a8'); p.tri(9, 12, 23, 12, 16, 22, '#ffe9a8'); }),
  neon_tube: T((p) => { p.rect(2, 13, 28, 6, '#16121c'); p.rect(4, 15, 24, 2, '#52f2ff'); p.rect(4, 14, 24, 1, '#a8f8ff'); p.rect(3, 12, 2, 8, '#5f6a75'); p.rect(27, 12, 2, 8, '#5f6a75'); }),
};

/** Tiny sprite (10×10-ish) used by the floating widget. Returns a canvas. */
const spriteCache = new Map<string, HTMLCanvasElement>();
export function tinyAlien(look: AlienLook, frame: 0 | 1 = 0, eyesClosed = false): HTMLCanvasElement {
  const key = `${look.id}:${look.skin}:${look.body}:${look.bulbA}:${look.bulbB}:${look.hat ?? ''}:${frame}:${eyesClosed}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const pal = skinPalette(look);
  const p = new Painter(12, 13);
  const pounce = look.skin === 'pounce';
  if (pounce) { p.ell(3, 2.5, 1.6, 1.6, '#dfe5ea'); p.ell(8, 2.5, 1.6, 1.6, '#dfe5ea'); }
  else { p.px(3, 1, look.bulbA); p.px(8, 1, look.bulbB); p.px(4, 2, pal.body); p.px(7, 2, pal.body); }
  p.ell(5.5, 6, 5, 3.8, pal.body, pal.alpha ?? 1);
  p.ell(5.5, 10, 2.5, 1.8, pal.body, pal.alpha ?? 1);
  p.px(4, frame ? 11 : 12, darken(pal.body, 0.2)); p.px(7, frame ? 12 : 11, darken(pal.body, 0.2));
  if (eyesClosed) { p.rect(2, 6, 3, 1, '#0a0a0c'); p.rect(7, 6, 3, 1, '#0a0a0c'); }
  else { p.rect(2, 5, 3, 3, '#0a0a0c'); p.rect(7, 5, 3, 3, '#0a0a0c'); p.px(2, 5, '#ffffff'); p.px(7, 5, '#ffffff'); }
  if (pounce) { p.px(4, 3, '#2a2a2e'); p.px(7, 4, '#2a2a2e'); }
  if (look.hat) p.rect(2, 1, 8, 2, look.hat === 'hardhat' ? '#ffcc33' : look.hat === 'goggles' ? '#c9a25a' : look.hat === 'crown' ? '#f5c542' : '#ff6fd6');
  p.outline(INK);
  const cv = p.canvas();
  spriteCache.set(key, cv);
  return cv;
}
