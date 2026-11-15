// Pixel finish + pixel-sprite effects.
//
// pixelFinish(): a 3D render (supersampled) becomes crisp pixel art — box-downsampled to
// the low target resolution, lightly posterised, given a 1 px ink outline (a deep shade of
// the neighbouring colour, darker on the shadow side) and a warm top-left rim. Displayed with
// image-rendering: pixelated at an exact integer scale. (The same recipe as the user's
// Fishtop studio icons.)
//
// pixelBurst(): crisp 2D pixel-art FX (sparkles, coins, confetti, bubbles) over any element —
// used for purchases, jackpots and celebrations.

export function pixelFinish(src: HTMLCanvasElement, W: number, H: number, SS: number, into?: HTMLCanvasElement): HTMLCanvasElement {
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  const sd = sctx.getImageData(0, 0, W * SS, H * SS).data;
  const SW = W * SS;
  const out = into ?? document.createElement('canvas');
  if (out.width !== W) out.width = W;
  if (out.height !== H) out.height = H;
  const ctx = out.getContext('2d')!;
  const img = ctx.createImageData(W, H), D = img.data;
  const A = new Uint8Array(W * H);
  const n = SS * SS;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let yy = 0; yy < SS; yy++) {
      let i = ((y * SS + yy) * SW + x * SS) * 4;
      for (let xx = 0; xx < SS; xx++, i += 4) { const al = sd[i + 3] / 255; r += sd[i] * al; g += sd[i + 1] * al; b += sd[i + 2] * al; a += al; }
    }
    if (a / n < 0.45) continue;
    const j = (y * W + x) * 4;
    const q = (v: number) => Math.min(255, Math.round(v / a / 10) * 10);
    D[j] = q(r); D[j + 1] = q(g); D[j + 2] = q(b); D[j + 3] = 255; A[y * W + x] = 1;
  }
  // warm rim on the lit (top / left) silhouette edge
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!A[i]) continue;
    const litEdge = (x > 0 && !A[i - 1]) || (y > 0 && !A[i - W]);
    if (!litEdge) continue;
    const j = i * 4;
    D[j] = Math.min(255, D[j] * 1.12 + 22); D[j + 1] = Math.min(255, D[j + 1] * 1.08 + 14); D[j + 2] = Math.min(255, D[j + 2] * 1.0 + 4);
  }
  // 1 px ink outline: deep shade of the neighbouring colour, darker on the shadow side
  const put: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (A[y * W + x]) continue;
    let src2 = -1, deep = false;
    if (x + 1 < W && A[y * W + x + 1]) { src2 = y * W + x + 1; }
    if (x > 0 && A[y * W + x - 1]) { src2 = y * W + x - 1; deep = true; }
    if (y + 1 < H && A[(y + 1) * W + x]) { src2 = (y + 1) * W + x; }
    if (y > 0 && A[(y - 1) * W + x]) { src2 = (y - 1) * W + x; deep = true; }
    if (src2 < 0) continue;
    const k = deep ? 0.22 : 0.34;
    put.push(y * W + x, D[src2 * 4] * k + 6, D[src2 * 4 + 1] * k + 4, D[src2 * 4 + 2] * k + 10);
  }
  for (let p = 0; p < put.length; p += 4) { const i = put[p] * 4; D[i] = put[p + 1]; D[i + 1] = put[p + 2]; D[i + 2] = put[p + 3]; D[i + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return out;
}

// ── pixel sprite FX ─────────────────────────────────────────────────────────
type Sprite = string[]; // rows; chars map to palette
const SPR: Record<string, { rows: Sprite; pal: Record<string, string> }> = {
  sparkle: { rows: ['..w..', '..y..', 'wyWyw', '..y..', '..w..'], pal: { w: '#fff8d8', y: '#ffd84a', W: '#ffffff' } },
  coin: { rows: ['.ooo.', 'oyyyo', 'oyWyo', 'oyyyo', '.ooo.'], pal: { o: '#a8650a', y: '#ffc53d', W: '#fff3b0' } },
  gene: { rows: ['.gg.', 'gGGg', 'gwGg', 'gGGg', 'gGGg', '.gg.'], pal: { g: '#2a8f2f', G: '#8cf56b', w: '#e8ffe0' } },
  bubble: { rows: ['.bb.', 'bw.b', 'b..b', '.bb.'], pal: { b: '#9fe6ff', w: '#ffffff' } },
  heart: { rows: ['pp.pp', 'pWppp', 'ppppp', '.ppp.', '..p..'], pal: { p: '#ff5aa8', W: '#ffd0e8' } },
  star: { rows: ['..y..', '.yyy.', 'yyWyy', '.y.y.'], pal: { y: '#ffc53d', W: '#fff3b0' } },
};
const CONFETTI = ['#ff5aa8', '#8cf56b', '#52c8ff', '#ffc53d', '#b48cff'];

export type BurstKind = 'buy' | 'jackpot' | 'win' | 'sparkle' | 'bubbles' | 'love';

/** Pop a crisp pixel-art burst centred on an element (or a point). Self-cleaning. */
export function pixelBurst(target: HTMLElement | { x: number; y: number }, kind: BurstKind = 'buy', scale = 3) {
  if (typeof document === 'undefined') return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = 'getBoundingClientRect' in target ? target.getBoundingClientRect() : { left: target.x, top: target.y, width: 0, height: 0 };
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const S = 220; // css px of the effect box
  const c = document.createElement('canvas');
  const L = Math.round(S / scale);
  c.width = L; c.height = L;
  Object.assign(c.style, { position: 'fixed', left: `${cx - S / 2}px`, top: `${cy - S / 2}px`, width: `${L * scale}px`, height: `${L * scale}px`, imageRendering: 'pixelated', pointerEvents: 'none', zIndex: '90' } as CSSStyleDeclaration);
  document.body.appendChild(c);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  type P = { x: number; y: number; vx: number; vy: number; t: number; life: number; spr?: string; col?: string; w?: number; h?: number; spin?: number };
  const ps: P[] = [];
  const add = (n: number, f: () => Partial<P>) => { for (let i = 0; i < n; i++) ps.push({ x: L / 2, y: L / 2, vx: 0, vy: 0, t: 0, life: 0.9, ...f() }); };
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const ring = (sp: number) => { const a = Math.random() * Math.PI * 2, v = rnd(sp * 0.4, sp); return { vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.3 }; };
  if (kind === 'buy') { add(8, () => ({ spr: 'coin', ...ring(46), life: rnd(0.6, 0.9) })); add(10, () => ({ spr: 'sparkle', ...ring(60), life: rnd(0.4, 0.7) })); }
  if (kind === 'win') { add(6, () => ({ spr: 'gene', ...ring(40) })); add(10, () => ({ spr: 'sparkle', ...ring(56) })); }
  if (kind === 'jackpot') { add(14, () => ({ spr: 'coin', ...ring(70), life: rnd(0.8, 1.2) })); add(36, () => ({ col: CONFETTI[Math.floor(Math.random() * 5)], w: 2, h: Math.random() > 0.5 ? 3 : 2, ...ring(80), life: rnd(0.9, 1.4), spin: rnd(4, 12) })); add(8, () => ({ spr: 'star', ...ring(60) })); }
  if (kind === 'sparkle') add(12, () => ({ spr: 'sparkle', ...ring(48), life: rnd(0.4, 0.7) }));
  if (kind === 'bubbles') add(10, () => ({ spr: 'bubble', x: L / 2 + rnd(-20, 20), y: L / 2 + rnd(0, 20), vx: rnd(-6, 6), vy: rnd(-40, -20), life: rnd(0.8, 1.2) }));
  if (kind === 'love') add(8, () => ({ spr: 'heart', ...ring(36), life: rnd(0.7, 1) }));
  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, L, L);
    let alive = 0;
    for (const p of ps) {
      p.t += dt; if (p.t > p.life) continue;
      alive++;
      if (kind !== 'bubbles') p.vy += 90 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const blink = p.t > p.life * 0.75 && Math.floor(p.t * 20) % 2 === 0;
      if (blink) continue;
      if (p.spr) {
        const s = SPR[p.spr];
        const ox = Math.round(p.x - s.rows[0].length / 2), oy = Math.round(p.y - s.rows.length / 2);
        s.rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const ch = row[x]; if (ch === '.') continue; ctx.fillStyle = s.pal[ch]; ctx.fillRect(ox + x, oy + y, 1, 1); } });
      } else if (p.col) {
        const flip = Math.floor(p.t * (p.spin ?? 8)) % 2;
        ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), flip ? p.h! : p.w!, flip ? p.w! : p.h!);
      }
    }
    if (alive) requestAnimationFrame(tick); else c.remove();
  };
  requestAnimationFrame(tick);
}
