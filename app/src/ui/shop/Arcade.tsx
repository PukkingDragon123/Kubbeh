// UFO CATCH — the arcade cabinet's one and only game. Catch falling jelly and gene
// capsules dropped by passing UFOs, dodge the space junk. Pixel art, 3 lives.
import { useEffect, useRef, useState } from 'preact/hooks';
import { economy, looks, settings } from '../../core/state';
import { sfx } from '../../core/bus';
import { Btn, Win } from '../common/kit';
import { earnGenes, setStatMax, bumpStat } from '../../economy/genes';
import { checkProgress } from '../../economy/achievements';
import { Painter, tinyAlien } from '../../economy/pixelart';
import { LockedStation } from './Locked';

const W = 160, H = 120;

function sprite(w: number, h: number, draw: (p: Painter) => void) { const p = new Painter(w, h); draw(p); p.outline('#0b130d'); return p.canvas(); }
let SPR: Record<string, HTMLCanvasElement> | null = null;
function sprites() {
  if (SPR) return SPR;
  SPR = {
    blob: sprite(9, 9, (p) => { p.blob(4, 4.5, 3.6, 3.4, '#8cf56b'); p.px(3, 4, '#0a0a0c'); p.px(5, 4, '#0a0a0c'); }),
    pink: sprite(9, 9, (p) => { p.blob(4, 4.5, 3.6, 3.4, '#ff6fd6'); p.px(3, 4, '#0a0a0c'); p.px(5, 4, '#0a0a0c'); }),
    gene: sprite(7, 11, (p) => { p.rect(1, 1, 5, 9, '#ffbe3d'); p.rect(1, 1, 5, 2, '#fff1a8'); p.line(2, 4, 4, 7, '#b97a10'); p.line(4, 4, 2, 7, '#b97a10'); }),
    junk: sprite(9, 9, (p) => { p.ell(4, 4, 3.6, 3.4, '#7a8794'); p.px(2, 3, '#5f6a75'); p.px(5, 5, '#5f6a75'); p.px(3, 2, '#c4ccd3'); }),
    bolt: sprite(9, 9, (p) => { p.rect(3, 1, 3, 6, '#9aa6b2'); p.rect(2, 1, 5, 2, '#c4ccd3'); p.px(4, 7, '#9aa6b2'); }),
    ufo: sprite(17, 9, (p) => { p.ell(8, 3, 3.5, 2.6, '#a8f8ff', 1, (_x, y) => y <= 3); p.ell(8, 5, 8, 2.2, '#9aa6b2'); p.px(4, 5, '#ffe14d'); p.px(8, 6, '#ff6fd6'); p.px(12, 5, '#8cf56b'); }),
  };
  return SPR;
}

type Obj = { x: number; y: number; vy: number; kind: 'blob' | 'pink' | 'gene' | 'junk' | 'bolt'; spin: number };
type Part = { x: number; y: number; vx: number; vy: number; life: number; c: string };

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
  const [earned, setEarned] = useState(0);
  const high = economy.value.stats.arcadeHigh ?? 0;
  const input = useRef({ left: false, right: false, pointerX: null as number | null });
  const stateRef = useRef(state);
  stateRef.current = state;

  const start = () => { sfx('powerup', .5); setScore(0); setEarned(0); setState('play'); };

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
    const canvas = cv.current!; const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const S = sprites();
    const hero = tinyAlien(looks.value.find((l) => l.id === 'blip') ?? looks.value[0], 0);
    const hero2 = tinyAlien(looks.value.find((l) => l.id === 'blip') ?? looks.value[0], 1);
    const stars = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() }));
    const city = Array.from({ length: 14 }, (_, i) => ({ x: i * 12, h: 10 + Math.random() * 22, lit: Array.from({ length: 6 }, () => Math.random() < .4) }));
    let px = W / 2, lives = 3, sc = 0, t = 0, spawnT = 0, shake = 0, combo = 0;
    let objs: Obj[] = [], parts: Part[] = [];
    const ufos = [{ x: -20, y: 10, vx: 22 }, { x: W + 40, y: 20, vx: -16 }];
    let raf = 0, last = performance.now();
    const playing = () => stateRef.current === 'play';

    const burst = (x: number, y: number, c: string, n = 10) => { for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - .5) * 60, vy: -Math.random() * 60, life: .5 + Math.random() * .4, c }); };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      const reduce = settings.value.reduceMotion;
      // update
      if (playing()) {
        const speed = 90;
        if (input.current.pointerX !== null) px += Math.max(-1, Math.min(1, (input.current.pointerX - px) / 6)) * speed * dt * 1.4;
        if (input.current.left) px -= speed * dt;
        if (input.current.right) px += speed * dt;
        px = Math.max(6, Math.min(W - 6, px));
        spawnT -= dt;
        const level = 1 + sc / 250;
        if (spawnT <= 0) {
          spawnT = Math.max(0.28, 0.9 - level * 0.08);
          const u = ufos[Math.floor(Math.random() * ufos.length)];
          const r = Math.random();
          const kind: Obj['kind'] = r < 0.07 ? 'gene' : r < 0.42 ? 'blob' : r < 0.55 ? 'pink' : r < 0.8 ? 'junk' : 'bolt';
          const x = u.x > 4 && u.x < W - 4 ? u.x : 10 + Math.random() * (W - 20);
          objs.push({ x, y: u.y + 4, vy: 26 + level * 10 + Math.random() * 12, kind, spin: Math.random() * 6 });
        }
        for (const o of objs) { o.y += o.vy * dt; o.spin += dt * 4; }
        // catch
        objs = objs.filter((o) => {
          if (o.y > H - 18 && o.y < H - 6 && Math.abs(o.x - px) < 8) {
            if (o.kind === 'junk' || o.kind === 'bolt') {
              lives -= 1; combo = 0; shake = 0.35; sfx('error', .45); burst(o.x, o.y, '#c4ccd3', 14);
              if (lives <= 0) { setState('over'); finish(sc); }
            } else {
              combo += 1;
              const pts = (o.kind === 'gene' ? 25 : o.kind === 'pink' ? 15 : 10) * (1 + Math.min(4, Math.floor(combo / 5)));
              sc += pts; setScore(sc);
              sfx(o.kind === 'gene' ? 'coin' : 'plop', .4, 1 + Math.min(.6, combo * .03));
              burst(o.x, o.y, o.kind === 'gene' ? '#ffbe3d' : o.kind === 'pink' ? '#ff6fd6' : '#8cf56b');
            }
            return false;
          }
          return o.y < H + 10;
        });
      }
      for (const u of ufos) { u.x += u.vx * dt * (reduce ? .3 : 1); if (u.x > W + 30) { u.x = -30; u.y = 6 + Math.random() * 16; } if (u.x < -30) { u.x = W + 30; u.y = 6 + Math.random() * 16; } }
      parts = parts.filter((p) => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt; return p.life > 0; });
      shake = Math.max(0, shake - dt);

      // draw
      ctx.save();
      if (shake > 0 && !reduce) ctx.translate(Math.round((Math.random() - .5) * 4), Math.round((Math.random() - .5) * 4));
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0a0620'); g.addColorStop(1, '#16304a');
      ctx.fillStyle = g; ctx.fillRect(-4, -4, W + 8, H + 8);
      for (const s of stars) { ctx.fillStyle = s.s > .7 && Math.sin(t * 3 + s.x) > 0 ? '#ffffff' : '#7a86c8'; ctx.fillRect(s.x | 0, s.y | 0, 1, 1); }
      for (const b of city) {
        ctx.fillStyle = '#0e1a26'; ctx.fillRect(b.x, H - 10 - b.h, 11, b.h);
        b.lit.forEach((l, i) => { if (l) { ctx.fillStyle = i % 3 ? '#ffbe3d' : '#ff6fd6'; ctx.fillRect(b.x + 2 + (i % 2) * 5, H - 6 - b.h + Math.floor(i / 2) * 6, 2, 2); } });
      }
      ctx.fillStyle = '#1d2a22'; ctx.fillRect(0, H - 10, W, 10);
      ctx.fillStyle = '#8cf56b'; ctx.fillRect(0, H - 10, W, 1);
      for (const u of ufos) {
        ctx.globalAlpha = .22 + Math.sin(t * 8) * .08; ctx.fillStyle = '#a8f8ff'; ctx.beginPath(); ctx.moveTo(u.x - 3, u.y + 6); ctx.lineTo(u.x + 3, u.y + 6); ctx.lineTo(u.x + 7, u.y + 22); ctx.lineTo(u.x - 7, u.y + 22); ctx.fill(); ctx.globalAlpha = 1;
        ctx.drawImage(S.ufo, Math.round(u.x - 8), Math.round(u.y - 4 + Math.sin(t * 4 + u.x) * 1.5));
      }
      for (const o of objs) { const im = S[o.kind]; ctx.drawImage(im, Math.round(o.x - im.width / 2), Math.round(o.y - im.height / 2)); }
      const bob = playing() ? Math.abs(Math.sin(t * 12)) * 2 : Math.sin(t * 3);
      ctx.drawImage(Math.sin(t * 12) > 0 ? hero : hero2, Math.round(px - 6), Math.round(H - 23 - bob));
      for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life * 2); ctx.fillStyle = p.c; ctx.fillRect(p.x | 0, p.y | 0, 1, 1); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff'; ctx.font = '8px "Pixelify Sans", monospace'; ctx.fillText(`${sc}`, 4, 10);
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i < lives ? '#ff6fd6' : '#3a2a3a'; ctx.fillRect(W - 8 - i * 7, 4, 5, 5); }
      if (combo >= 5) { ctx.fillStyle = '#ffbe3d'; ctx.fillText(`x${1 + Math.min(4, Math.floor(combo / 5))}`, 4, 20); }
      ctx.restore();
      raf = requestAnimationFrame(frame);
    };
    const finish = (final: number) => {
      sfx(final > (economy.value.stats.arcadeHigh ?? 0) ? 'fanfare' : 'weird', .5);
      setStatMax('arcadeHigh', final);
      bumpStat('arcadeGames');
      const g = earnGenes(Math.floor(final / 20), `UFO Catch score ${final}`, undefined, 'arcade');
      setEarned(g);
      checkProgress();
    };
    const onStart = () => { lives = 3; sc = 0; objs = []; parts = []; combo = 0; px = W / 2; };
    (canvas as any).__reset = onStart;
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => { if (state === 'play') (cv.current as any)?.__reset?.(); }, [state]);

  const toLocalX = (e: PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    const scale = Math.min(r.width / W, r.height / H);
    const ox = (r.width - W * scale) / 2;
    return (e.clientX - r.left - ox) / scale;
  };

  return (
    <div class="arcade-cab">
      <div class="arcade-screen screen"
        onPointerDown={(e) => { input.current.pointerX = toLocalX(e as unknown as PointerEvent); if (state !== 'play') start(); }}
        onPointerMove={(e) => { if ((e as PointerEvent).buttons || (e as PointerEvent).pointerType === 'mouse') input.current.pointerX = toLocalX(e as unknown as PointerEvent); }}
        onPointerLeave={() => { input.current.pointerX = null; }}>
        <canvas ref={cv} width={W} height={H} class="pixelated" style={{ objectFit: 'contain' }} />
        {state !== 'play' && (
          <div class="arcade-overlay">
            <h3 class="glow-p" style={{ fontSize: '28px' }}>{state === 'over' ? 'GAME OVER' : 'UFO CATCH'}</h3>
            {state === 'over' ? <div class="col gap-4"><span class="px glow-g" style={{ fontSize: '20px' }}>Score {score}</span><span class="dim">High score {Math.max(high, score)} · +{earned} genes</span></div>
              : <span class="dim">Catch jelly & gene capsules · dodge junk<br />←/→ or A/D · or drag</span>}
            <Btn tone="pink" size="lg" icon="play" onClick={start}>{state === 'over' ? 'Play again' : 'Insert coin'}</Btn>
            <span class="dimmer" style={{ fontSize: '11px' }}>Genes from the arcade are capped at 40 a day</span>
          </div>
        )}
      </div>
      <div class="row between" style={{ color: '#d8ccff', fontSize: '12px' }}>
        <span class="px">HI {high}</span>
        <span class="px">SCORE {score}</span>
      </div>
    </div>
  );
}
