// The Idea Slot Machine — pull the lever, get a random game idea, pitch it, send it to
// Prof. Glorp in the Idea Lab. 5 genes a spin, one free spin a day, gold symbols pay out.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { economy, SIDE_MODEL, setPanel } from '../../core/state';
import { bus, sfx, toast } from '../../core/bus';
import { todayKey } from '../../core/util';
import { Btn, Win, copyText } from '../common/kit';
import { Icon } from '../common/icons';
import { spendGenes, earnGenes, bumpStat, stat } from '../../economy/genes';
import { unlock, checkProgress } from '../../economy/achievements';
import { patchEconomy } from '../../core/state';
import { LockedStation } from './Locked';
import { REELS, ideaSentence, type Sym } from './slotData';
import { complete, engineAvailable } from '../../claude/agent';
import { VoxView } from './vox/VoxView';
import { framed } from './vox/models';
import { buildGlyph, type GlyphName } from './vox/glyphs';
import { buildLever } from './vox/lever';
import { pixelBurst } from './vox/pixel';
import type * as THREE from 'three';

const symKey = (s: Sym) => `sym:${s.icon}:${s.color}:${s.gold ? 1 : 0}`;
const symArt = (s: Sym) => framed(buildGlyph(s.icon as GlyphName, parseInt(s.color.slice(1), 16), { gold: s.gold }));

const COST = 5;
const todayNum = () => Number(todayKey().replace(/-/g, ''));
const easeOutBack = (t: number) => { const c1 = 1.2, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };

function Reel({ symbols, target, spinId, locked, delay, onStop }: { symbols: Sym[]; target: number; spinId: number; locked: boolean; delay: number; onStop: () => void }) {
  const strip = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const pos = useRef(target);
  const [spinning, setSpinning] = useState(false);
  const N = symbols.length;

  const paint = () => {
    const h = (strip.current?.firstElementChild as HTMLElement | null)?.offsetHeight ?? 56;
    const p = ((pos.current % N) + N) % N;
    if (strip.current) strip.current.style.transform = `translateY(${-(N + p - 1) * h}px)`;
  };
  useLayoutEffect(paint, []);
  useEffect(() => { const on = () => paint(); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);

  useEffect(() => {
    if (!spinId) return;
    if (locked) { onStop(); return; }
    const p0 = pos.current;
    const delta = ((target - (((p0 % N) + N) % N)) + N) % N;
    const p1 = p0 + N * 2 + delta;
    const dur = 900 + delay;
    const t0 = performance.now();
    let lastCell = Math.floor(p0);
    let raf = 0;
    setSpinning(true);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      pos.current = p0 + (p1 - p0) * easeOutBack(t);
      paint();
      const cell = Math.floor(pos.current);
      if (cell !== lastCell) { lastCell = cell; if (t < 0.9) sfx('tick', 0.18, 1.2 + Math.random() * 0.4); }
      if (t < 1) raf = requestAnimationFrame(step);
      else { pos.current = p1; paint(); setSpinning(false); sfx('select', 0.35, 0.9 + delay / 4000); onStop(); }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [spinId]);

  const tripled = [...symbols, ...symbols, ...symbols];
  return (
    <div ref={box} class={`reel ${spinning ? 'spinning' : ''}`}>
      <div ref={strip} class="reel-strip">
        {tripled.map((s, i) => (
          <div key={i} class={`reel-cell ${s.gold ? 'gold' : ''}`}>
            <VoxView class="gl" size={34} cacheKey={symKey(s)} make={() => symArt(s)} yaw={-0.3} pitch={0.12} fill={0.98} />
            <span class="lb">{s.label}</span>
          </div>
        ))}
      </div>
      <div class="reel-pay" />
    </div>
  );
}

export function SlotPanel({ close }: { arg: unknown; close: () => void }) {
  const owned = (economy.value.owned.slot_machine ?? 0) > 0;
  return (
    <Win title="Idea Slot Machine" icon="slot" onClose={close}>
      {owned ? <Machine /> : <LockedStation itemId="slot_machine" pitch="Pull a lever, get a wild game idea: genre, mechanic, setting, twist and art style. Send the best ones straight to Prof. Glorp." />}
    </Win>
  );
}

function Machine() {
  const [result, setResult] = useState<number[]>(() => REELS.map(() => Math.floor(Math.random() * 20)));
  const [locks, setLocks] = useState<boolean[]>(REELS.map(() => false));
  const [spinId, setSpinId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pulled, setPulled] = useState(false);
  const [settled, setSettled] = useState(true);
  const [pitch, setPitch] = useState('');
  const [pitching, setPitching] = useState(false);
  const [win, setWin] = useState<{ n: number; amount: number } | null>(null);
  const stopped = useRef(0);
  const pullAt = useRef(0);
  const free = (economy.value.stats.slotFreeDay ?? 0) !== todayNum();
  const syms = result.map((r, i) => REELS[i].symbols[r]);

  const spin = () => {
    if (busy) return;
    if (!free && !spendGenes(COST, 'slot_machine', 'Slot machine spin')) { sfx('error', .5); toast(`A spin costs ${COST} genes`, 'warn', 'dna'); return; }
    if (free) patchEconomy((e) => ({ ...e, stats: { ...e.stats, slotFreeDay: todayNum() } }));
    sfx('machine', .45); sfx('zap', .3);
    pullAt.current = performance.now(); setPulled(true); setTimeout(() => setPulled(false), 450);
    setBusy(true); setSettled(false); setPitch(''); setWin(null);
    stopped.current = 0;
    setResult((prev) => prev.map((v, i) => (locks[i] ? v : Math.floor(Math.random() * REELS[i].symbols.length))));
    setSpinId((s) => s + 1);
    bumpStat('spins');
  };

  const onStop = () => {
    stopped.current += 1;
    if (stopped.current < REELS.length) return;
    setBusy(false); setSettled(true);
    const golds = result.filter((r, i) => REELS[i].symbols[r].gold).length;
    const pay = golds >= 5 ? 250 : golds === 4 ? 80 : golds === 3 ? 25 : golds === 2 ? COST : 0;
    if (pay) {
      setWin({ n: golds, amount: pay });
      setTimeout(() => earnGenes(pay, golds >= 3 ? `Slot jackpot (${golds} gold)` : 'Slot: pair of gold', undefined, 'slot'), 200);
      const cab = document.querySelector('.slot-window') as HTMLElement | null;
      if (golds >= 3) { sfx('fanfare', .6); unlock('jackpot'); if (cab) pixelBurst(cab, 'jackpot'); } else { sfx('bling', .5); if (cab) pixelBurst(cab, 'win'); }
    }
    checkProgress();
  };

  const idea = ideaSentence(syms);
  const doPitch = async () => {
    if (!engineAvailable()) { toast('Link a Claude account to get pitches', 'warn'); setPanel('accounts'); return; }
    setPitching(true); sfx('computer', .3);
    try {
      const text = await complete({
        prompt: `Game idea: ${idea}\n\nWrite a punchy 3-sentence elevator pitch: the hook, what the player does minute to minute, and why it's memorable. Plain text, no title, no preamble.`,
        system: 'You are a sharp, playful game designer. Be concrete and vivid. Keep it under 90 words.',
        model: SIDE_MODEL, effort: 'low', maxTokens: 400, source: 'slot',
      });
      setPitch(text.trim());
      sfx('bling', .4);
    } catch (err: any) { toast(`Pitch failed: ${err?.message ?? err}`, 'bad'); } finally { setPitching(false); }
  };
  const sendToLab = () => {
    sfx('portal', .5);
    bus.emit('idea:send', { text: pitch ? `${idea}\n\n${pitch}` : idea });
    setPanel('idea');
  };

  const bulbs = Array.from({ length: 22 }, (_, i) => {
    const t = i / 22;
    const top = t < 0.5;
    return <i key={i} style={{ left: `${(top ? t * 2 : (1 - t) * 2) * 96 + 2}%`, top: top ? '3px' : 'calc(100% - 10px)', animationDelay: `${(i % 2) * 0.5}s` }} />;
  });

  return (
    <div class="col gap-12 scroll" style={{ padding: '4px 4px 8px' }}>
      <div class={`slot-cab ${win && win.n >= 3 ? 'jackpot-flash' : ''}`}>
        <div class="slot-marquee"><div class="bulbs">{bulbs}</div><Icon name="star" /> IDEA-O-TRON 5000 <Icon name="star" /></div>
        <div class="slot-window">
          {REELS.map((r) => <div class="reel-head" key={r.id}>{r.title}</div>)}
          {REELS.map((r, i) => <Reel key={r.id} symbols={r.symbols} target={result[i]} spinId={spinId} locked={locks[i]} delay={i * 330} onStop={onStop} />)}
          {REELS.map((r, i) => (
            <div class="reel-lock" key={r.id}>
              <button type="button" aria-pressed={locks[i]} disabled={busy} onClick={() => { sfx('toggle', .4); setLocks(locks.map((l, j) => (j === i ? !l : l))); }}>{locks[i] ? 'HELD' : 'HOLD'}</button>
            </div>
          ))}
        </div>
        <div class="row between wrap gap-8">
          <span class="chip a"><Icon name="dna" size="sm" />{free ? 'Free daily spin!' : `${COST} genes / spin`} · ★ gold pays out</span>
          <Btn tone="amber" size="lg" icon="play" silent onClick={spin} disabled={busy}>{busy ? 'Spinning…' : free ? 'Free spin' : 'Spin'}</Btn>
        </div>
        <button type="button" class={`lever ${pulled ? 'pulled' : ''}`} onClick={spin} disabled={busy} aria-label="Pull the lever">
          <LeverView pulledAt={pullAt.current} />
        </button>
      </div>

      {settled && spinId > 0 && (
        <div class="card slot-result col gap-12" key={spinId}>
          {win && <div class="row gap-8"><span class="chip a" style={{ fontSize: '13px' }}><Icon name="star" size="sm" />{win.n >= 3 ? `JACKPOT! ${win.n} gold` : 'Pair of gold'} · +{win.amount} genes</span></div>}
          <div class="idea">{idea}</div>
          {pitch && <div class="dim" style={{ fontSize: '13px', whiteSpace: 'pre-wrap', borderLeft: '3px solid var(--pink)', paddingLeft: '12px' }}>{pitch}</div>}
          <div class="row wrap gap-8">
            <Btn tone="glob" icon="idea" onClick={sendToLab}>Send to Idea Lab</Btn>
            <Btn tone="pink" icon="sparkle" onClick={doPitch} disabled={pitching}>{pitching ? 'Pitching…' : pitch ? 'Re-pitch' : 'Pitch it'}</Btn>
            <Btn tone="ghost" icon="copy" onClick={async () => { if (await copyText(pitch ? `${idea}\n\n${pitch}` : idea)) toast('Copied', 'good'); }}>Copy</Btn>
          </div>
          <span class="dimmer" style={{ fontSize: '11.5px' }}>Pitches use the small fast model at low effort. Spins so far: {stat('spins')}</span>
        </div>
      )}
      {spinId === 0 && <p class="dim" style={{ textAlign: 'center', margin: 0 }}>Pull the lever. Hold reels you like, re-spin the rest.</p>}
    </div>
  );
}

/** Live 3D lever: idles with a little wobble, swings down hard when pulled, springs back. */
function LeverView({ pulledAt }: { pulledAt: number }) {
  const at = useRef(pulledAt);
  at.current = pulledAt;
  return (
    <VoxView width={52} height={190} spin="always" cacheKey="slot-lever" yaw={-0.55} pitch={0.08} fill={3.3} make={() => buildLever()}
      animate={(o: THREE.Object3D, t: number) => {
        const rod = (o as any).userData.rod as THREE.Object3D | undefined;
        if (!rod) return;
        const k = (performance.now() - at.current) / 1000;
        let a = Math.sin(t * 2.2) * 0.04;
        if (k >= 0 && k < 1.1) a = k < 0.16 ? (k / 0.16) * 1.9 : 1.9 * Math.exp(-(k - 0.16) * 5) * Math.cos((k - 0.16) * 14);
        rod.rotation.x = a;
      }} />
  );
}
