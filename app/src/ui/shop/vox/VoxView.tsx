// <VoxView> — shows a real voxel model as UI art. A studio photo is rendered lazily (one
// per frame, so a grid of 40 cards never stalls the UI) and cached by key; on hover (or
// always, for hero views) the model comes alive in a live viewport: it turns, bobs and
// squashes. Every icon-like thing in the shop / slots / badges / idea lab uses this.
import type { CSSProperties } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type * as THREE from 'three';
import { liveView, photo, type LiveView } from '../../../vox/studio';
import { settings } from '../../../core/state';
import { FRAME_COMP } from './models';

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

export interface VoxViewProps {
  /** builds a FRESH object (wrap it with framed() for stable spins) */
  make: () => THREE.Object3D;
  /** cache key for the still photo (include anything that changes the look) */
  cacheKey: string;
  size?: number;
  width?: number;
  height?: number;
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

export function VoxView(p: VoxViewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const objRef = useRef<THREE.Object3D | null>(null);
  const live = useRef<LiveView | null>(null);
  const w = p.width ?? p.size ?? 96, h = p.height ?? p.size ?? 96;
  const dpr = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  const key = `${p.cacheKey}|${W}x${H}|${p.yaw ?? ''}|${p.pitch ?? ''}|${p.fill ?? ''}`;
  // makes are framed() (guard sphere): compensate for the studio's box-diagonal framing
  const opts = { yaw: p.yaw ?? -0.5, pitch: p.pitch ?? 0.22, fill: (p.fill ?? 0.92) * FRAME_COMP };

  const obj = () => (objRef.current ??= p.make());

  const drawStill = () => {
    const c = ref.current; if (!c) return;
    let shot = shots.get(key);
    if (!shot) { shot = photo(obj(), W, H, opts); shots.set(key, shot); }
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(shot, 0, 0);
  };

  const startLive = () => {
    const c = ref.current; if (!c || live.current) return;
    if (settings.value.reduceMotion && p.spin !== 'always') return;
    const o = obj();
    const base = o.rotation.y;
    let t0 = -1;
    live.current = liveView(c, o, (t, dt) => {
      if (t0 < 0) t0 = t;
      const k = t - t0;
      if (p.animate) p.animate(o, t, dt);
      else {
        o.rotation.y = base + Math.sin(k * 1.4) * 0.7 + k * 0.35;
        const s = 1 + Math.sin(k * 6) * 0.015;
        o.scale.set(1 / s, s, 1 / s);
      }
    }, { ...opts, ss: 1 });
  };
  const stopLive = () => {
    if (!live.current) return;
    live.current.stop(); live.current = null;
    const o = objRef.current;
    if (o) { o.rotation.y = 0; o.scale.set(1, 1, 1); }
    drawStill();
  };

  useEffect(() => {
    objRef.current = null;
    const c = ref.current!;
    const job: Job = { run: () => { drawStill(); if (p.spin === 'always') startLive(); }, alive: () => !!ref.current?.isConnected };
    if (shots.has(key) && p.spin !== 'always') drawStill();
    else { if (p.eager) queue.unshift(job); else queue.push(job); pump(); }
    void c;
    return () => { live.current?.stop(); live.current = null; };
  }, [key]);

  return (
    <canvas ref={ref} width={W} height={H} class={`voxview ${p.class ?? ''}`} role="img" aria-label={p.alt ?? p.title ?? ''} title={p.title}
      style={{ width: `${w}px`, height: `${h}px`, ...(p.style ?? {}) }}
      onPointerEnter={() => { if (p.spin === 'hover') startLive(); }}
      onPointerLeave={() => { if (p.spin === 'hover') stopLive(); }} />
  );
}
