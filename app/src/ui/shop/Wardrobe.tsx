// Wardrobe — dress up the crew. Colours, skins (incl. Snow Pounce), hats, outfits,
// accessories and faces. Every change shows up on the voxel alien in the lab instantly.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DEFAULT_LOOKS, economy, looks, updateLook } from '../../core/state';
import { bus, sfx, toast } from '../../core/bus';
import { pick } from '../../core/util';
import type { AlienLook, Expression } from '../../core/types';
import { Btn, Seg, Tabs, Win } from '../common/kit';
import { Icon } from '../common/icons';
import { ACCESSORIES, ALL_EXPRESSIONS, HATS, OUTFITS, SKINS, catalogById, ownsExpression, ownsItem } from '../../economy/catalog';
import { buyItem } from '../../economy/genes';
import { unlock } from '../../economy/achievements';
import { FIXED_COLOR_SKINS, portraitPainter } from '../../economy/pixelart';

type OptTab = 'colors' | 'skin' | 'hat' | 'outfit' | 'accessory' | 'face';

const BODY_SWATCHES = ['#7be35f', '#8cf56b', '#5fd36b', '#6fe0a0', '#9be255', '#3fd6c0', '#52c8ff', '#7aa0ff', '#b48cff', '#ff8fd0', '#ff6f61', '#ffbe3d', '#e9edf0', '#9aa6b2'];
const BELLY_SWATCHES = ['#b6f59a', '#c4ffe0', '#dbff9e', '#e0feff', '#ffe0f2', '#fff1a8', '#ffffff', '#d6dde3'];
const EYE_SWATCHES = ['#1b2a8f', '#0f4fa8', '#3a1b8f', '#0f6b4f', '#8f1b3a', '#5a2a8f', '#2a6f8f', '#111111'];
const BULB_SWATCHES = ['#ff7ad9', '#3b5bff', '#ffe14d', '#59f0ff', '#ff5e5e', '#ffa24d', '#8cf56b', '#b48cff', '#ffffff'];
const QUIRKS: AlienLook['quirk'][] = ['bouncy', 'sleepy', 'nerdy', 'chaotic', 'shy'];
const EXPR_LABEL: Record<Expression, string> = { happy: 'Happy', derp: 'Derp', sleepy: 'Sleepy', wink: 'Wink', shocked: 'Shocked', cry: 'Tears', tongue: 'Blep', focused: 'Focused', love: 'Heart eyes', grumpy: 'Grumpy' };

function portraitUrl(look: AlienLook, extra?: Partial<AlienLook>) {
  return portraitPainter({ ...look, ...extra }).canvas().toDataURL();
}

export function Wardrobe({ close }: { arg: unknown; close: () => void }) {
  const crew = looks.value;
  const [selId, setSelId] = useState(crew[0]?.id ?? 'glorp');
  const [tab, setTab] = useState<OptTab>('colors');
  const look = crew.find((l) => l.id === selId) ?? crew[0];
  const eco = economy.value;

  const apply = (patch: Partial<AlienLook>) => {
    updateLook(look.id, patch);
    bus.emit('look:changed', { lookId: look.id });
    unlock('stylist');
  };

  const tryEquip = (field: 'skin' | 'hat' | 'outfit' | 'accessory', id: string | undefined) => {
    if (!id) { sfx('plop2', .5); apply({ [field]: undefined }); return; }
    if (!ownsItem(eco.owned, id)) {
      const it = catalogById.get(id)!;
      const r = buyItem(id);
      if (!r.ok) { if (r.reason === 'funds') toast(`${it.name} costs ${it.price} genes — you have ${eco.balance}`, 'warn', 'dna'); return; }
    }
    sfx('boing', .5, 1 + Math.random() * .2);
    apply({ [field]: id });
  };
  const tryFace = (e: Expression) => {
    if (!ownsExpression(eco.owned, e)) {
      const r = buyItem(`expr_${e}`);
      if (!r.ok) { if (r.reason === 'funds') toast(`That face costs ${catalogById.get(`expr_${e}`)?.price} genes`, 'warn', 'dna'); return; }
    }
    sfx('blip', .45);
    apply({ expression: e });
  };

  const randomize = () => {
    const owned = (ids: string[]) => ids.filter((i) => ownsItem(eco.owned, i));
    sfx('portal', .45);
    apply({
      body: pick(BODY_SWATCHES), belly: pick(BELLY_SWATCHES), eyes: pick(EYE_SWATCHES), bulbA: pick(BULB_SWATCHES), bulbB: pick(BULB_SWATCHES),
      hat: Math.random() < 0.75 ? pick(owned(HATS)) : undefined,
      outfit: Math.random() < 0.6 ? pick(owned(OUTFITS)) : undefined,
      accessory: Math.random() < 0.6 ? pick(owned(ACCESSORIES)) : undefined,
      expression: pick(ALL_EXPRESSIONS.filter((e) => ownsExpression(eco.owned, e))),
      quirk: pick(QUIRKS),
    });
  };
  const reset = () => {
    const d = DEFAULT_LOOKS.find((x) => x.id === look.id);
    sfx('plop', .5);
    if (d) apply({ ...d });
  };

  return (
    <Win title="Wardrobe" icon="wardrobe" onClose={close}
      actions={<><Btn size="sm" tone="ghost" icon="sparkle" onClick={randomize}>Randomize</Btn><Btn size="sm" tone="ghost" icon="refresh" onClick={reset} class="hide-sm">Reset</Btn></>}>
      <div class="ward">
        <nav class="ward-crew" aria-label="Crew">
          <span class="up dim" style={{ padding: '2px 6px' }}>Crew</span>
          {crew.map((l) => (
            <button type="button" key={l.id} class="li" aria-current={l.id === look.id} onClick={() => { sfx('select', .4); setSelId(l.id); }}>
              <img class="pixelated" src={portraitUrl(l)} alt="" />
              <span class="col gap-4" style={{ minWidth: 0 }}>
                <b class="ellipsis" style={{ color: 'var(--text)' }}>{l.name}</b>
                <span class="dimmer ellipsis" style={{ fontSize: '11px' }}>{l.id === 'glorp' ? 'Idea assistant' : l.skin === 'pounce' ? 'Snow leopard intern' : l.quirk}</span>
              </span>
            </button>
          ))}
        </nav>
        <Stage look={look} onRename={(name) => apply({ name })} onQuirk={(quirk) => apply({ quirk })} />
        <section class="ward-opts">
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: 'colors', label: 'Colours' }, { id: 'skin', label: 'Skins' }, { id: 'hat', label: 'Hats' },
            { id: 'outfit', label: 'Outfits' }, { id: 'accessory', label: 'Extras' }, { id: 'face', label: 'Faces' },
          ]} />
          {tab === 'colors' ? <Colors look={look} apply={apply} /> : (
            <div class="ward-grid">
              {tab === 'face' ? ALL_EXPRESSIONS.map((e) => (
                <Opt key={e} look={look} extra={{ expression: e }} label={EXPR_LABEL[e]} active={look.expression === e}
                  locked={!ownsExpression(eco.owned, e)} price={catalogById.get(`expr_${e}`)?.price} onClick={() => tryFace(e)} />
              )) : (
                <>
                  {tab !== 'skin' && <Opt look={look} extra={{ [tab]: undefined }} label="None" active={!look[tab]} onClick={() => tryEquip(tab, undefined)} />}
                  {(tab === 'skin' ? SKINS : tab === 'hat' ? HATS : tab === 'outfit' ? OUTFITS : ACCESSORIES).map((id) => (
                    <Opt key={id} look={look} extra={{ [tab]: id }} label={catalogById.get(id)?.name ?? id} active={look[tab] === id}
                      locked={!ownsItem(eco.owned, id)} price={catalogById.get(id)?.price} onClick={() => tryEquip(tab, id)} />
                  ))}
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </Win>
  );
}

function Opt({ look, extra, label, active, locked, price, onClick }: { look: AlienLook; extra: Partial<AlienLook>; label: string; active: boolean; locked?: boolean; price?: number; onClick: () => void }) {
  const url = useMemo(() => portraitUrl(look, extra), [JSON.stringify(look), JSON.stringify(extra)]);
  return (
    <button type="button" class={`ward-opt ${locked ? 'locked' : ''}`} aria-pressed={active} onClick={onClick} title={locked ? `${label} — ${price} genes (click to buy)` : label} onMouseEnter={() => sfx('hover', .1)}>
      {locked && <span class="lock"><Icon name="dna" size="sm" />{price}</span>}
      <img class="pixelated" src={url} alt="" />
      <span class="ellipsis" style={{ maxWidth: '100%' }}>{label}</span>
    </button>
  );
}

function Stage({ look, onRename, onQuirk }: { look: AlienLook; onRename: (n: string) => void; onQuirk: (q: AlienLook['quirk']) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [blink, setBlink] = useState(false);
  const [boing, setBoing] = useState(0);
  const [flash, setFlash] = useState<Expression | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const loop = () => { t = setTimeout(() => { setBlink(true); setTimeout(() => setBlink(false), 140); loop(); }, 2200 + Math.random() * 2600); };
    loop();
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!ref.current) return;
    portraitPainter(look, { blink, expression: flash ?? look.expression }).blit(ref.current);
  }, [look, blink, flash]);
  const poke = () => {
    sfx('boing', .6, 0.9 + Math.random() * 0.3);
    setBoing((b) => b + 1);
    setFlash(pick<Expression>(['shocked', 'derp', 'love', 'wink']));
    setTimeout(() => setFlash(null), 900);
  };
  return (
    <div class="ward-stage">
      <canvas key={boing} ref={ref} width={40} height={40} class={`portrait pixelated ${boing ? 'boing' : ''}`} onClick={poke} title="Poke!" aria-label={`${look.name} preview`} />
      <div class="pedestal" />
      <input id="ward-name" class="field" style={{ maxWidth: '240px', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: '18px' }}
        value={look.name} maxLength={24} onChange={(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (v) onRename(v); }} aria-label="Alien name" />
      <div class="col gap-4" style={{ alignItems: 'center' }}>
        <span class="label">Personality</span>
        <Seg value={look.quirk} onChange={onQuirk} options={QUIRKS.map((q) => ({ value: q, label: q }))} label="Personality" />
      </div>
      {FIXED_COLOR_SKINS.has(look.skin) && <span class="chip a" style={{ whiteSpace: 'normal', height: 'auto', padding: '4px 10px', textAlign: 'center' }}>The {catalogById.get(look.skin)?.name} skin brings its own colours</span>}
    </div>
  );
}

function Colors({ look, apply }: { look: AlienLook; apply: (p: Partial<AlienLook>) => void }) {
  const rows: { key: 'body' | 'belly' | 'eyes' | 'bulbA' | 'bulbB'; label: string; sw: string[] }[] = [
    { key: 'body', label: 'Jelly', sw: BODY_SWATCHES },
    { key: 'belly', label: 'Belly', sw: BELLY_SWATCHES },
    { key: 'eyes', label: 'Eye shine', sw: EYE_SWATCHES },
    { key: 'bulbA', label: 'Left antenna bulb', sw: BULB_SWATCHES },
    { key: 'bulbB', label: 'Right antenna bulb', sw: BULB_SWATCHES },
  ];
  return (
    <div class="col gap-16" style={{ padding: '12px 14px', overflow: 'auto', minHeight: 0 }}>
      {rows.map((r) => (
        <div class="col gap-8" key={r.key}>
          <span class="label">{r.label}</span>
          <div class="swatches">
            {r.sw.map((c) => <button type="button" key={c} class="swatch" style={{ background: c }} aria-pressed={look[r.key].toLowerCase() === c} aria-label={`${r.label} ${c}`}
              onClick={() => { sfx('plop', .35, 1 + Math.random() * .3); apply({ [r.key]: c }); }} />)}
            <input type="color" class="color-in" value={look[r.key]} aria-label={`Custom ${r.label}`} onInput={(e) => apply({ [r.key]: (e.target as HTMLInputElement).value })} />
          </div>
        </div>
      ))}
    </div>
  );
}
