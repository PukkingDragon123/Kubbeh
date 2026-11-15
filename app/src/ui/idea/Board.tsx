// The right side of the Idea Lab: live design doc, Mechanic Mixer and the final prompt.
import { useMemo, useState } from 'preact/hooks';
import { createProject, setPanel, settings } from '../../core/state';
import { sfx, toast } from '../../core/bus';
import { estimateTokens, fmtUsd, pick } from '../../core/util';
import type { DesignDoc } from '../../core/types';
import { Btn, Meter, Seg, Toggle, copyText } from '../common/kit';
import { Icon } from '../common/icons';
import { VoxView } from '../shop/vox/VoxView';
import { framed } from '../shop/vox/models';
import { buildGlyph, type GlyphName } from '../shop/vox/glyphs';
import { pixelBurst } from '../shop/vox/pixel';
import { SECTIONS, applyPatch, coverage, docAsBrief, fill, saveDoc, type Section } from './doc';
import { FAMILY_COLOR, MECHANICS, type Family, type Mechanic } from './mechanics';
import { DETAIL_LEVELS, TARGETS, finalPromptSystem, type Target } from './prompts';
import { complete, engineAvailable } from '../../claude/agent';
import { localCompress } from '../../claude/polish';
import { costOf } from '../../claude/models';
import { unlock } from '../../economy/achievements';
import { actions } from '../actions';

const readyLabel = (p: number) => (p >= 85 ? 'Ready to build' : p >= 60 ? 'Almost there' : p >= 30 ? 'Taking shape' : 'Napkin sketch');
const readyColor = (p: number) => (p >= 85 ? 'var(--glob)' : p >= 60 ? 'var(--cyan)' : p >= 30 ? 'var(--amber)' : 'var(--pink)');

// ── Design doc ───────────────────────────────────────────────────────────────
export function DocTab({ doc, onEdited, onAsk }: { doc: DesignDoc; onEdited: (what: string) => void; onAsk: (q: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [newReq, setNewReq] = useState('');

  const commit = (s: Section | 'title') => {
    const key = s === 'title' ? 'title' : s.key;
    let patch: Record<string, unknown>;
    if (key === 'pillars') patch = { pillars: draft.split(/[,\n;]/).map((x) => x.trim()).filter(Boolean) };
    else if (key === 'mechanics') patch = { mechanics: draft.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [n, ...rest] = l.split(':'); return { name: n.replace(/^[-*]\s*/, '').trim(), detail: rest.join(':').trim() }; }) };
    else patch = { [key]: draft };
    const { doc: next, changed } = applyPatch(doc, patch as any);
    if (changed.length) { saveDoc(next); onEdited(key); sfx('plop', .4); }
    setEditing(null);
  };

  const start = (s: Section | 'title') => {
    const key = s === 'title' ? 'title' : s.key;
    setEditing(key);
    setDraft(key === 'pillars' ? doc.pillars.join(', ') : key === 'mechanics' ? doc.mechanics.map((m) => `${m.name}: ${m.detail}`).join('\n') : String((doc as any)[key] ?? ''));
  };

  return (
    <>
      <div class="ready-meter">
        <span class="pct tnum" style={{ color: readyColor(doc.completeness) }}>{doc.completeness}%</span>
        <div class="col gap-4">
          <b style={{ color: readyColor(doc.completeness) }}>{readyLabel(doc.completeness)}</b>
          <Meter value={doc.completeness / 100} tone={doc.completeness < 30 ? 'warn' : undefined} />
        </div>
        <span class="chip c">{doc.requirements.length} reqs</span>
      </div>
      {editing === 'title' ? (
        <input id="doc-title" class="field" value={draft} autoFocus onInput={(e) => setDraft((e.target as HTMLInputElement).value)} onBlur={() => commit('title')} onKeyDown={(e) => { if (e.key === 'Enter') commit('title'); }} />
      ) : <h3 style={{ fontSize: '26px', cursor: 'text' }} onClick={() => start('title')} title="Click to rename">{doc.title} <Icon name="pencil" size="sm" class="dimmer" /></h3>}

      {doc.openQuestions.length > 0 && (
        <div class="col gap-4">
          <span class="label">Open questions · click to settle with Glorp</span>
          {doc.openQuestions.map((q) => <button type="button" key={q} class="oq" onClick={() => onAsk(q)}><Icon name="warn" size="sm" class="glow-a" />{q}</button>)}
        </div>
      )}

      {SECTIONS.map((s) => {
        const f = fill(doc, s);
        const isEdit = editing === s.key;
        const val = s.key === 'pillars' ? doc.pillars : s.key === 'mechanics' ? null : (doc as any)[s.key] as string;
        return (
          <div key={s.key} class="sec" onClick={() => !isEdit && start(s)}>
            <span class={`fd ${f >= 1 ? 'full' : f > 0 ? 'half' : ''}`} />
            <div class="col gap-4" style={{ minWidth: 0 }}>
              <span class="lbl"><span>{s.label}</span>{!isEdit && <Icon name="pencil" size="sm" class="dimmer" />}</span>
              {isEdit ? (
                <div class="col gap-4" onClick={(e) => e.stopPropagation()}>
                  <textarea id={`doc-${s.key}`} class="textarea" rows={s.short ? 1 : 4} value={draft} autoFocus placeholder={s.key === 'mechanics' ? 'One per line — Name: how it works' : s.key === 'pillars' ? 'Comma separated' : s.hint}
                    onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit(s); if (e.key === 'Escape') setEditing(null); }} />
                  <div class="row" style={{ justifyContent: 'flex-end' }}><Btn size="sm" tone="ghost" onClick={() => setEditing(null)}>Cancel</Btn><Btn size="sm" tone="glob" onClick={() => commit(s)}>Save</Btn></div>
                </div>
              ) : s.key === 'mechanics' ? (
                doc.mechanics.length ? doc.mechanics.map((m) => <div class="mech-row" key={m.name}><span><b>{m.name}</b> <span class="dim">— {m.detail || '…'}</span></span></div>) : <span class="val blank">{s.hint}</span>
              ) : s.key === 'pillars' ? (
                (val as string[]).length ? <div class="row wrap gap-4">{(val as string[]).map((p) => <span key={p} class="chip g">{p}</span>)}</div> : <span class="val blank">{s.hint}</span>
              ) : <span class={`val ${val ? '' : 'blank'}`}>{val || s.hint}</span>}
            </div>
          </div>
        );
      })}

      <div class="col gap-4">
        <span class="label">Your requirements · the final prompt must include all of these</span>
        {doc.requirements.length === 0 && <span class="dimmer" style={{ fontSize: '13px' }}>Glorp records every concrete thing you ask for here. You can add your own too.</span>}
        {doc.requirements.map((r) => (
          <div class="req ok" key={r}>
            <span class="ck"><Icon name="check" size="sm" /></span><span class="grow">{r}</span>
            <Btn size="sm" tone="ghost" iconOnly icon="close" title="Remove requirement" onClick={() => { const { doc: n } = applyPatch(doc, { remove_requirements: [r] }); saveDoc(n); onEdited('requirements'); }} />
          </div>
        ))}
        <form class="row" onSubmit={(e) => { e.preventDefault(); if (!newReq.trim()) return; const { doc: n } = applyPatch(doc, { requirements: [newReq.trim()] }); saveDoc(n); onEdited('requirements'); setNewReq(''); sfx('plop', .4); }}>
          <input id="doc-newreq" class="field" placeholder="Add a must-have (e.g. “cat skin for the player”)" value={newReq} onInput={(e) => setNewReq((e.target as HTMLInputElement).value)} />
          <Btn type="submit" tone="ghost" icon="plus" iconOnly title="Add requirement" />
        </form>
      </div>
    </>
  );
}

// ── Mechanic Mixer ───────────────────────────────────────────────────────────
export function MixerTab({ doc, onFuse }: { doc: DesignDoc; onFuse: (picked: Mechanic[]) => void }) {
  const [fam, setFam] = useState<Family | 'All'>('All');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Mechanic[]>([]);
  const [hot, setHot] = useState(0);
  const deck = useMemo(() => MECHANICS.filter((m) => (fam === 'All' || m.family === fam) && (!q || (m.name + m.blurb).toLowerCase().includes(q.toLowerCase()))), [fam, q]);
  const toggle = (m: Mechanic) => {
    if (picked.includes(m)) { setPicked(picked.filter((x) => x !== m)); sfx('plop2', .4); return; }
    if (picked.length >= 3) { sfx('error', .35); toast('The chamber holds 3 mechanics', 'warn'); return; }
    setPicked([...picked, m]); sfx('slime', .35, 1 + picked.length * .15);
  };
  const bubbles = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ left: `${5 + Math.random() * 90}%`, delay: `${(i * 0.29).toFixed(2)}s`, size: 5 + Math.random() * 8 })), []);
  return (
    <>
      <div class={`fusion ${hot ? 'hot' : ''}`} key={hot}>
        {bubbles.map((b, i) => <i key={i} class="bub" style={{ left: b.left, animationDelay: b.delay, width: `${b.size}px`, height: `${b.size}px` }} />)}
        <div class="slots">
          {picked.length === 0 && <span class="dim" style={{ fontSize: '13px' }}>Pick 2–3 mechanic cards below to drop them in the chamber.</span>}
          {picked.map((m) => <span key={m.name} class="slot" style={{ ['--fam' as any]: FAMILY_COLOR[m.family] }}><FamilyGlyph family={m.family} size={26} />{m.name}<button type="button" class="btn ghost sm icon" style={{ minHeight: '20px', width: '20px' }} aria-label={`Remove ${m.name}`} onClick={() => toggle(m)}><Icon name="close" size="sm" /></button></span>)}
        </div>
        <div class="row wrap gap-8" style={{ position: 'relative', zIndex: 1, marginTop: 'auto' }}>
          <Btn tone="glob" icon="bolt" disabled={picked.length < 2} onClick={() => { sfx('zap', .5); setHot((h) => h + 1); const fc = document.querySelector('.fusion'); if (fc) pixelBurst(fc as HTMLElement, 'bubbles'); unlock('fusion'); onFuse(picked); setPicked([]); }}>Fuse with Glorp</Btn>
          <Btn tone="ghost" icon="plus" disabled={!picked.length} onClick={() => {
            const { doc: n } = applyPatch(doc, { mechanics: picked.map((m) => ({ name: m.name, detail: m.blurb })) });
            saveDoc(n); sfx('bling', .4); toast(`Added ${picked.length} mechanic${picked.length > 1 ? 's' : ''} to the doc`, 'good'); setPicked([]);
          }}>Add to doc</Btn>
          <Btn tone="ghost" icon="refresh" onClick={() => { const pool = [...MECHANICS]; const p: Mechanic[] = []; while (p.length < 3) { const m = pick(pool); if (!p.includes(m)) p.push(m); } setPicked(p); sfx('portal', .4); }}>Random 3</Btn>
        </div>
      </div>
      <div class="row wrap gap-4">
        {(['All', ...Object.keys(FAMILY_COLOR)] as (Family | 'All')[]).map((f) => (
          <button type="button" key={f} class={`chip ${fam === f ? 'g' : ''}`} style={f !== 'All' ? { color: FAMILY_COLOR[f as Family] } : undefined} onClick={() => { sfx('tab', .3); setFam(f); }}>{f}</button>
        ))}
      </div>
      <input id="mix-search" class="field" placeholder="Search mechanics…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="mix-deck">
        {deck.map((m) => (
          <button type="button" key={m.name} class="mcard" aria-pressed={picked.includes(m)} style={{ ['--fam' as any]: FAMILY_COLOR[m.family] }} onClick={() => toggle(m)} onMouseEnter={() => sfx('hover', .08)}>
            <FamilyGlyph family={m.family} size={40} />
            <span class="mtxt"><b>{m.name}</b><span class="dim">{m.blurb}</span></span>
          </button>
        ))}
      </div>
    </>
  );
}

// ── Final prompt ─────────────────────────────────────────────────────────────
export function PromptTab({ doc }: { doc: DesignDoc }) {
  const [level, setLevel] = useState(2);
  const [target, setTarget] = useState<Target>('code');
  const [milestones, setMilestones] = useState(true);
  const [tests, setTests] = useState(true);
  const [assume, setAssume] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(doc.finalPrompt ?? '');
  const [added, setAdded] = useState<string[]>([]);
  const cov = useMemo(() => (out ? coverage(out, doc.requirements) : []), [out, doc.requirements]);
  const tokens = estimateTokens(out);
  const model = settings.value.model;
  const cost = costOf(model, { input: tokens, output: 0, cacheRead: 0, cacheWrite: 0 });

  const generate = async () => {
    if (!engineAvailable()) { toast('Link a Claude account first', 'warn'); setPanel('accounts'); return; }
    setBusy(true); setAdded([]); sfx('computer', .35);
    try {
      let text = await complete({
        system: finalPromptSystem(level, target, { milestones, tests, assumptions: assume }),
        prompt: `GAME DESIGN DOC\n\n${docAsBrief(doc)}`,
        model, effort: level <= 1 ? 'low' : 'medium', maxTokens: 2000 + level * 1800, source: 'idea',
      });
      text = text.trim();
      const missing = coverage(text, doc.requirements).filter((c) => !c.covered).map((c) => c.req);
      if (missing.length) {
        text += `\n\n## Must also include (user requirements)\n${missing.map((m) => `- ${m}`).join('\n')}`;
        setAdded(missing);
      }
      if (level === 0) text = localCompress(text);
      setOut(text);
      saveDoc({ ...doc, finalPrompt: text });
      unlock('final_prompt');
      sfx('fanfare', .45);
    } catch (err: any) {
      toast(`Couldn't generate: ${err?.message ?? err}`, 'bad');
    } finally { setBusy(false); }
  };

  const build = () => {
    const p = createProject({ name: doc.title, kind: 'game', designDocId: doc.id, description: doc.pitch, glyph: doc.title.slice(0, 1).toUpperCase() });
    sfx('portal', .5);
    actions.sendToTerminal(out, p.id);
    setPanel('terminal');
  };

  return (
    <>
      {doc.completeness < 70 && (
        <div class="card row gap-12" style={{ boxShadow: 'inset 3px 0 0 var(--amber), inset 0 0 0 1px #ffffff12' }}>
          <Icon name="warn" class="glow-a" />
          <span class="dim" style={{ fontSize: '13px' }}>Glorp rates this design {doc.completeness}% ready{doc.openQuestions.length ? ` with ${doc.openQuestions.length} open question${doc.openQuestions.length > 1 ? 's' : ''}` : ''}. You can generate now; open points get sensible defaults.</span>
        </div>
      )}
      <div class="col gap-8">
        <span class="label">Detail · {DETAIL_LEVELS[level].label}</span>
        <input id="fp-level" type="range" class="slider" min={0} max={4} step={1} value={level} onInput={(e) => { setLevel(Number((e.target as HTMLInputElement).value)); sfx('tick', .3); }} aria-label="Prompt detail" />
        <div class="row between dimmer" style={{ fontSize: '13px' }}><span>Compact · fewer tokens</span><span>{DETAIL_LEVELS[level].note}</span><span>Exhaustive</span></div>
      </div>
      <div class="row wrap gap-12">
        <div class="col gap-4"><span class="label">Built by</span><Seg value={target} onChange={setTarget} options={TARGETS.map((t) => ({ value: t.value, label: t.label }))} label="Target" /></div>
        <label class="row gap-8" style={{ fontSize: '13px' }}><Toggle value={milestones} onChange={setMilestones} label="Milestones" />Milestones</label>
        <label class="row gap-8" style={{ fontSize: '13px' }}><Toggle value={tests} onChange={setTests} label="Acceptance checks" />Acceptance checks</label>
        <label class="row gap-8" style={{ fontSize: '13px' }}><Toggle value={assume} onChange={setAssume} label="Ask before assuming" />Ask before assuming</label>
      </div>
      <Btn tone="pink" size="lg" icon="sparkle" onClick={generate} disabled={busy}>{busy ? 'Glorp is writing your launch codes…' : out ? 'Regenerate final prompt' : 'Generate final prompt'}</Btn>

      {out && (
        <>
          <div class="fp-stats">
            <span class="chip c tnum">≈{tokens.toLocaleString()} tokens</span>
            <span class="chip tnum">≈{fmtUsd(cost)} to send to {model.replace('claude-', '')}</span>
            <span class={`chip ${cov.every((c) => c.covered) ? 'g' : 'a'}`}>{cov.filter((c) => c.covered).length}/{cov.length} requirements covered</span>
            {added.length > 0 && <span class="chip a">Auto-added {added.length} missing</span>}
          </div>
          <textarea id="fp-out" class="textarea fp-out" value={out} onInput={(e) => setOut((e.target as HTMLTextAreaElement).value)} rows={14} />
          <div class="row wrap gap-8">
            <Btn tone="glob" icon="terminal" onClick={build}>Build it in Terminal</Btn>
            <Btn tone="ghost" icon="copy" onClick={async () => { if (await copyText(out)) toast('Prompt copied', 'good'); }}>Copy</Btn>
            <Btn tone="ghost" icon="bolt" onClick={() => { const c = localCompress(out); const saved = estimateTokens(out) - estimateTokens(c); setOut(c); toast(saved > 0 ? `Squeezed out ~${saved} tokens` : 'Already lean', 'good'); }}>Squeeze</Btn>
          </div>
          {doc.requirements.length > 0 && (
            <div class="col gap-4">
              <span class="label">Requirement coverage</span>
              {cov.map((c) => <div key={c.req} class={`req ${c.covered ? 'ok' : 'miss'}`}><span class="ck"><Icon name={c.covered ? 'check' : 'warn'} size="sm" /></span><span>{c.req}</span></div>)}
            </div>
          )}
        </>
      )}
    </>
  );
}

const FAMILY_GLYPH: Record<Family, GlyphName> = {
  Movement: 'bolt', Combat: 'sword', Puzzle: 'cube', Economy: 'coin', Building: 'wrench',
  Progression: 'star', World: 'planet', Narrative: 'chat', Time: 'hourglass', Social: 'heart',
};
/** A sculpted voxel icon for a mechanic family (tinted with the family colour). */
export function FamilyGlyph({ family, size }: { family: Family; size: number }) {
  const col = parseInt(FAMILY_COLOR[family].slice(1), 16);
  return <VoxView class="fam-glyph" size={size} spin="hover" cacheKey={`fam:${family}`} make={() => framed(buildGlyph(FAMILY_GLYPH[family], col))} title={family} yaw={-0.35} pitch={0.15} fill={0.98} />;
}
