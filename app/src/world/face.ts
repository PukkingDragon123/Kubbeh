// Pixel-art alien faces (48×40). Huge glossy black eyes, tiny mouths, pink blush.
import type { Expression } from '../core/types';
import { pixEllipse } from './pixels';

export const FACE_W = 48, FACE_H = 40;
const INK = '#0a0a12';

export interface FaceStyle { skin: string; body: string; eyes: string; cat?: boolean }

function eye(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, tint: string, look = 0, small = false) {
  pixEllipse(ctx, cx, cy, rx, ry, INK);
  // iris tint pooled at the bottom (the cute "reflection" look)
  pixEllipse(ctx, cx + look, cy + ry * 0.42, rx * 0.72, ry * 0.36, tint);
  pixEllipse(ctx, cx + look, cy + ry * 0.55, rx * 0.45, ry * 0.18, shadeHex(tint, 1.45));
  // re-ink the rim so the tint stays inside
  ctx.fillStyle = INK;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
    if (d <= 1 && d > 0.72) ctx.fillRect(x, y, 1, 1);
  }
  // highlights
  if (small) { ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(cx - 2 + look), Math.round(cy - 3), 2, 2); return; }
  pixEllipse(ctx, cx - rx * 0.32 + look, cy - ry * 0.36, rx * 0.34, ry * 0.3, '#ffffff');
  pixEllipse(ctx, cx + rx * 0.36 + look, cy + ry * 0.12, rx * 0.14, ry * 0.12, '#ffffff');
}

function closedArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, up: boolean) {
  ctx.fillStyle = INK;
  for (let x = -w; x <= w; x++) {
    const y = Math.round((x * x) / (w * 1.4)) * (up ? 1 : -1);
    ctx.fillRect(cx + x, cy + (up ? -y : y), 1, 2);
  }
}

function lid(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string, coverTo: number, slant = 0) {
  // paint skin over the top part of an eye (y < coverTo + slant*x)
  ctx.fillStyle = color;
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const d = ((x + 0.5 - cx) / (rx + 0.6)) ** 2 + ((y + 0.5 - cy) / (ry + 0.6)) ** 2;
    if (d <= 1 && y < coverTo + slant * (x - cx)) ctx.fillRect(x, y, 1, 1);
  }
  ctx.fillStyle = INK;
  for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const y = Math.round(coverTo + slant * (x - cx));
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
    if (d <= 1.05) ctx.fillRect(x, y, 1, 2);
  }
}

function heart(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, col: string) {
  ctx.fillStyle = col;
  for (let y = -s; y <= s * 1.2; y++) for (let x = -s * 1.3; x <= s * 1.3; x++) {
    const nx = x / s, ny = -y / s;
    const v = (nx * nx + ny * ny - 1) ** 3 - nx * nx * ny * ny * ny;
    if (v <= 0) ctx.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
  }
  ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(cx - s * 0.6), Math.round(cy - s * 0.4), 2, 2);
}

function shadeHex(hex: string, k: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k)), g = Math.min(255, Math.round(((n >> 8) & 255) * k)), b = Math.min(255, Math.round((n & 255) * k));
  return `rgb(${r},${g},${b})`;
}

export function drawFace(ctx: CanvasRenderingContext2D, expr: Expression | 'blink', st: FaceStyle, look = 0) {
  ctx.clearRect(0, 0, FACE_W, FACE_H);
  const L = 14, Rr = 34, EY = 18, RX = 9, RY = 11;
  const lidCol = shadeHex(st.body, 0.92);
  const tint = st.eyes;
  const blush = (a = 0.55) => { ctx.globalAlpha = a; pixEllipse(ctx, 5, 31, 3.2, 1.8, '#ff7ab8'); pixEllipse(ctx, 43, 31, 3.2, 1.8, '#ff7ab8'); ctx.globalAlpha = 1; };
  const mouth = (kind: 'smile' | 'o' | 'O' | 'flat' | 'frown' | 'wavy' | 'tongue' | 'w' | 'grin') => {
    ctx.fillStyle = INK;
    const mx = 24, my = 33;
    switch (kind) {
      case 'smile': ctx.fillRect(mx - 3, my, 1, 1); ctx.fillRect(mx - 2, my + 1, 5, 1); ctx.fillRect(mx + 3, my, 1, 1); break;
      case 'grin': ctx.fillRect(mx - 4, my - 1, 9, 1); ctx.fillRect(mx - 3, my, 7, 2); ctx.fillStyle = '#ff7a9a'; ctx.fillRect(mx - 1, my + 1, 3, 1); break;
      case 'o': pixEllipse(ctx, mx, my + 0.5, 1.6, 1.6, INK); break;
      case 'O': pixEllipse(ctx, mx, my, 2.6, 3.4, INK); pixEllipse(ctx, mx, my + 1.4, 1.4, 1.2, '#ff7a9a'); break;
      case 'flat': ctx.fillRect(mx - 2, my + 1, 5, 1); break;
      case 'frown': ctx.fillRect(mx - 3, my + 2, 1, 1); ctx.fillRect(mx - 2, my + 1, 5, 1); ctx.fillRect(mx + 3, my + 2, 1, 1); break;
      case 'wavy': ctx.fillRect(mx - 4, my + 1, 2, 1); ctx.fillRect(mx - 2, my, 2, 1); ctx.fillRect(mx, my + 1, 2, 1); ctx.fillRect(mx + 2, my, 2, 1); break;
      case 'tongue': ctx.fillRect(mx - 3, my, 7, 1); ctx.fillStyle = '#ff6f9a'; ctx.fillRect(mx - 1, my + 1, 4, 3); ctx.fillStyle = '#ff9abb'; ctx.fillRect(mx, my + 1, 1, 2); break;
      case 'w': ctx.fillRect(mx - 3, my, 1, 1); ctx.fillRect(mx - 2, my + 1, 2, 1); ctx.fillRect(mx, my, 1, 1); ctx.fillRect(mx + 1, my + 1, 2, 1); ctx.fillRect(mx + 3, my, 1, 1); break;
    }
  };
  const catNose = () => {
    if (!st.cat) return;
    ctx.fillStyle = '#ff8fb0'; ctx.fillRect(22, 29, 5, 1); ctx.fillRect(23, 30, 3, 1); ctx.fillRect(24, 31, 1, 1);
    ctx.fillStyle = '#5a5a66'; for (const [x, y] of [[4, 29], [6, 31], [3, 32], [44, 29], [42, 31], [45, 32]]) ctx.fillRect(x, y, 1, 1);
  };

  switch (expr) {
    case 'blink':
      closedArc(ctx, L, EY + 3, 7, false); closedArc(ctx, Rr, EY + 3, 7, false); blush(0.4); mouth(st.cat ? 'w' : 'smile'); break;
    case 'happy':
      eye(ctx, L, EY, RX, RY, tint, look); eye(ctx, Rr, EY, RX, RY, tint, look); blush(); mouth(st.cat ? 'w' : 'smile'); break;
    case 'derp':
      eye(ctx, L, EY + 1, RX, RY, tint, 2); eye(ctx, Rr, EY - 1, RX - 2.5, RY - 3, tint, -2); mouth('wavy'); ctx.fillStyle = '#ff6f9a'; ctx.fillRect(27, 34, 2, 2); break;
    case 'sleepy':
      eye(ctx, L, EY, RX, RY, tint, 0); eye(ctx, Rr, EY, RX, RY, tint, 0);
      lid(ctx, L, EY, RX, RY, lidCol, EY + 2); lid(ctx, Rr, EY, RX, RY, lidCol, EY + 2); blush(0.35); mouth('o'); break;
    case 'wink':
      eye(ctx, L, EY, RX, RY, tint, look); closedArc(ctx, Rr, EY + 2, 7, true); blush(); mouth(st.cat ? 'w' : 'grin'); break;
    case 'shocked':
      eye(ctx, L, EY - 1, RX + 0.6, RY + 0.8, tint, 0, true); eye(ctx, Rr, EY - 1, RX + 0.6, RY + 0.8, tint, 0, true); mouth('O'); break;
    case 'cry':
      eye(ctx, L, EY, RX, RY, tint, 0); eye(ctx, Rr, EY, RX, RY, tint, 0);
      ctx.fillStyle = '#5ab8ff';
      for (const x of [L - 2, Rr + 1]) for (let y = EY + RY - 2; y < FACE_H; y++) ctx.fillRect(x + Math.round(Math.sin(y * 0.6)), y, 2, 1);
      pixEllipse(ctx, L - 4, EY - 5, 1.5, 1.5, '#fff'); mouth('frown'); break;
    case 'tongue':
      closedArc(ctx, L, EY + 2, 7, true); closedArc(ctx, Rr, EY + 2, 7, true); blush(0.7); mouth('tongue'); break;
    case 'focused':
      eye(ctx, L, EY + 1, RX, RY - 1, tint, look); eye(ctx, Rr, EY + 1, RX, RY - 1, tint, look);
      lid(ctx, L, EY + 1, RX, RY - 1, lidCol, EY - 3, 0.18); lid(ctx, Rr, EY + 1, RX, RY - 1, lidCol, EY - 3, -0.18); mouth('flat'); break;
    case 'love':
      heart(ctx, L, EY + 1, 7.5, '#ff4f9a'); heart(ctx, Rr, EY + 1, 7.5, '#ff4f9a'); blush(0.7); mouth(st.cat ? 'w' : 'smile'); break;
    case 'grumpy':
      eye(ctx, L, EY + 1, RX, RY, tint, 0); eye(ctx, Rr, EY + 1, RX, RY, tint, 0);
      lid(ctx, L, EY + 1, RX, RY, lidCol, EY - 4, 0.45); lid(ctx, Rr, EY + 1, RX, RY, lidCol, EY - 4, -0.45); mouth('frown'); break;
  }
  catNose();
}
