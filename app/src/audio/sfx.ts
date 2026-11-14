// Sound effects: CC0 clips (see assets/sfx/CREDITS.md), decoded once into WebAudio buffers.
// Plays on the bus 'sfx' event. Audio starts only after the first user gesture (browser rule).
import { bus, type SfxName } from '../core/bus';
import { settings } from '../core/state';

const files = import.meta.glob('../assets/sfx/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const urls: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) urls[path.split('/').pop()!.replace('.mp3', '')] = url;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<string, number>();

function ensure() {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}

async function load(name: string): Promise<AudioBuffer | null> {
  if (buffers.has(name)) return buffers.get(name)!;
  let p = loading.get(name);
  if (!p) {
    p = (async () => {
      const c = ensure(); const url = urls[name];
      if (!c || !url) return null;
      try {
        const res = await fetch(url);
        const buf = await c.decodeAudioData(await res.arrayBuffer());
        buffers.set(name, buf);
        return buf;
      } catch { return null; }
    })();
    loading.set(name, p);
  }
  return p;
}

export async function playSfx(name: SfxName, volume = 1, rate = 1) {
  const s = settings.value;
  if (s.muted || s.volume <= 0) return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? 0) < 45) return; // de-dupe bursts
  lastPlayed.set(name, now);
  const c = ensure(); if (!c || !master) return;
  if (c.state === 'suspended') { try { await c.resume(); } catch { return; } }
  const buf = await load(name); if (!buf) return;
  const src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
  const g = c.createGain(); g.gain.value = Math.max(0, Math.min(1, volume)) * s.volume;
  src.connect(g); g.connect(master); src.start();
}

/** A tiny procedural "alien babble" — pitched blips like a voice, for speech bubbles. */
export function babble(text: string, pitch = 1) {
  const s = settings.value; if (s.muted || s.volume <= 0) return;
  const c = ensure(); if (!c || !master) return;
  const n = Math.min(10, Math.max(3, Math.round(text.length / 14)));
  for (let i = 0; i < n; i++) {
    const t = c.currentTime + i * 0.075;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = 'square'; o.frequency.setValueAtTime((420 + Math.random() * 380) * pitch, t);
    o.frequency.exponentialRampToValueAtTime((260 + Math.random() * 200) * pitch, t + 0.06);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * s.volume, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.08);
  }
}

export function startSfx() {
  bus.on('sfx', ({ name, volume, rate }) => { void playSfx(name, volume ?? 1, rate ?? 1); });
  const unlock = () => { ensure()?.resume().catch(() => {}); ['click', 'hover', 'panel_open', 'coin', 'boing', 'plop'].forEach((n) => void load(n)); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}
