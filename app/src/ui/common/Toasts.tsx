import { signal } from '@preact/signals';
import { bus } from '../../core/bus';
import { Icon, type IconName } from './icons';

type T = { id: number; text: string; tone: 'info' | 'good' | 'warn' | 'bad'; icon?: string };
const list = signal<T[]>([]);
let n = 0;

bus.on('ui:toast', ({ text, tone = 'info', icon }) => {
  const id = ++n;
  list.value = [...list.value.slice(-3), { id, text, tone, icon }];
  if (tone === 'bad') bus.emit('sfx', { name: 'error', volume: 0.5 });
  else if (tone === 'good') bus.emit('sfx', { name: 'bling', volume: 0.4 });
  setTimeout(() => { list.value = list.value.filter((t) => t.id !== id); }, tone === 'bad' ? 6000 : 3800);
});

const ICON: Record<T['tone'], IconName> = { info: 'alien', good: 'check', warn: 'warn', bad: 'warn' };
const COLOR: Record<T['tone'], string> = { info: 'var(--cyan)', good: 'var(--glob)', warn: 'var(--amber)', bad: 'var(--red)' };

export function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {list.value.map((t) => (
        <div key={t.id} class={`toast pe ${t.tone}`} onClick={() => { list.value = list.value.filter((x) => x.id !== t.id); }}>
          <span style={{ color: COLOR[t.tone] }}><Icon name={(t.icon as IconName) ?? ICON[t.tone]} /></span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Floating "+N" pops for Gene Points (screen coords). */
const pops = signal<{ id: number; x: number; y: number; text: string }[]>([]);
bus.on('genes:earn', ({ amount, x, y }) => {
  const id = ++n;
  const px = x ?? window.innerWidth - 150, py = y ?? 60;
  pops.value = [...pops.value, { id, x: px, y: py, text: `+${amount}` }];
  setTimeout(() => { pops.value = pops.value.filter((p) => p.id !== id); }, 1400);
});
export function GenePops() {
  return <>{pops.value.map((p) => <div key={p.id} class="gene-pop" style={{ left: `${p.x}px`, top: `${p.y}px` }}>{p.text} <span style={{ fontSize: '13px' }}>GENES</span></div>)}</>;
}
