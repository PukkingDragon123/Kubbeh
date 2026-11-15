// <VoxView> — shows a real voxel model as pixel-finished UI art. The model is photographed
// by the studio at low resolution (supersampled), given the pixel finish (posterise, 1 px ink
// outline, warm rim) and shown at an exact integer upscale with crisp pixels. Stills are
// rendered lazily (a few per frame so a grid of 40 never stalls) and cached by key; on hover
// (or always, for hero views) the model comes alive and is re-finished every frame.
import type { CSSProperties } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type * as THREE from 'three';
import { photo } from '../../../vox/studio';
import { settings } from '../../../core/state';
import { FRAME_COMP } from './models';
import { pixelFinish } from './pixel';

export type Spin = 'none' | 'hover' | 'always';

const shots = new Map<string, HTMLCanvasElement>();
type Job = { run: () => void; alive: () => boolean };
const queue: Job[] = [];
let pumping = false;
function pump() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 12) {
      const j = queue.shift()!;
      if (j.alive()) { try { j.run(); } catch (err) { console.warn('[voxview] render failed', err); } }
    }
    if (queue.length) setTimeout(step, 16); else pumping = false;
  };
  setTimeout(step, 0);
}

// one shared animation loop for every live view
type Live = { frame: (t: number, dt: number) => void; alive: () => boolean };
const lives = new Set<Live>();
let raf = 0, lastT = 0;
function loop(now: number) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  for (const l of lives) {
    if (!l.alive()) { lives.delete(l); continue; }
    try { l.frame(now / 1000, dt); } catch (err) { console.warn('[voxview] live frame failed', err); lives.delete(l); }
  }
  if (!lives.size) { cancelAnimationFrame(raf); raf = 0; }
}
function addLive(l: Live) { lives.add(l); if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); } return () => { lives.delete(l); }; }

export interface VoxViewProps {
  /** builds a FRESH object (wrap it with framed() for stable spins) */
  make: () => THREE.Object3D;
  /** cache key for the still (include anything that changes the look) */
  cacheKey: string;
  /** css size */
  size?: number;
  width?: number;
  height?: number;
  /** integer pixel scale: each art pixel is px×px css pixels (default 2) */
  px?: number;
  spin?: Spin;
  yaw?: number;
  pitch?: number;
  fill?: number;
  /** extra per-frame animation while live */
  animate?: (obj: THREE.Object3D, t: number, dt: number) => void;
  class?: string;
  style?: CSSProperties;
  title?: string;
  alt?: string;
  /** render priority: true = jump the queue */
  eager?: boolean;
}

const SS = 3;

export function VoxView(p: VoxViewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const objRef = useRef<THREE.Object3D | null>(null);
  const stopLive = useRef<(() => void) | null>(null);
  const px = Math.max(1, Math.round(p.px ?? 2));
  const cw = p.width ?? p.size ?? 96, ch = p.height ?? p.size ?? 96;
  const W = Math.max(8, Math.round(cw / px)), H = Math.max(8, Math.round(ch / px));
  const key = `${p.cacheKey}|${W}x${H}|${p.yaw ?? ''}|${p.pitch ?? ''}|${p.fill ?? ''}`;
  // makes are framed() (guard sphere): compensate for the studio's box-diagonal framing
  const opts = { yaw: p.yaw ?? -0.5, pitch: p.pitch ?? 0.22, fill: (p.fill ?? 0.92) * FRAME_COMP, ss: 1 };

  const obj = () => (objRef.current ??= p.make());

  const drawStill = () => {
    const c = ref.current; if (!c) return;
    let shot = shots.get(key);
    if (!shot) { shot = pixelFinish(photo(obj(), W * SS, H * SS, opts), W, H, SS); shots.set(key, shot); }
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(shot, 0, 0);
  };

  const startLive = () => {
    const c = ref.current; if (!c || stopLive.current) return;
    if (settings.value.reduceMotion && p.spin !== 'always') return;
    const o = obj();
    const scratch = document.createElement('canvas');
    scratch.width = W * SS; scratch.height = H * SS;
    const base = o.rotation.y;
    let t0 = -1;
    stopLive.current = addLive({
      alive: () => !!ref.current?.isConnected,
      frame: (t, dt) => {
        if (t0 < 0) t0 = t;
        const k = t - t0;
        if (p.animate) p.animate(o, t, dt);
        else if (!settings.value.reduceMotion) {
          o.rotation.y = base + Math.sin(k * 1.4) * 0.7 + k * 0.35;
          const s = 1 + Math.sin(k * 6) * 0.015;
          o.scale.set(1 / s, s, 1 / s);
        }
        photo(o, W * SS, H * SS, opts, scratch);
        pixelFinish(scratch, W, H, SS, c);
      },
    });
  };
  const endLive = () => {
    if (!stopLive.current) return;
    stopLive.current(); stopLive.current = null;
    const o = objRef.current;
    if (o) { o.rotation.y = 0; o.scale.set(1, 1, 1); }
    drawStill();
  };

  useEffect(() => {
    objRef.current = null;
    const job: Job = { run: () => { drawStill(); if (p.spin === 'always') startLive(); }, alive: () => !!ref.current?.isConnected };
    if (shots.has(key) && p.spin !== 'always') drawStill();
    else { if (p.eager) queue.unshift(job); else queue.push(job); pump(); }
    return () => { stopLive.current?.(); stopLive.current = null; };
  }, [key]);

  return (
    <canvas ref={ref} width={W} height={H} class={`voxview ${p.class ?? ''}`} role="img" aria-label={p.alt ?? p.title ?? ''} title={p.title}
      style={{ width: `${W * px}px`, height: `${H * px}px`, imageRendering: 'pixelated', ...(p.style ?? {}) }}
      onPointerEnter={() => { if (p.spin === 'hover') startLive(); }}
      onPointerLeave={() => { if (p.spin === 'hover') endLive(); }} />
  );
}
