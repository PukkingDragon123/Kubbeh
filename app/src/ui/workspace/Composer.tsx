// The composer: multiline prompt, attachments, model/effort/web controls, prompt polisher,
// Auto-Saver indicator, dictation, send/stop.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { MsgBlock } from '../../core/types';
import { fuel, patchSettings, saveChat, settings } from '../../core/state';
import { sfx, toast } from '../../core/bus';
import { capability } from '../../core/env';
import { estimateTokens, fmtTokens, isTextMime, readFileAsDataURL, readFileAsText } from '../../core/util';
import { Btn } from '../common/kit';
import { Icon } from '../common/icons';
import { MODELS, EFFORT_ORDER, EFFORT_LABEL, modelInfo } from '../../claude/models';
import { fullPolicy, TIER_LABEL } from '../../claude/fuel';
import { localCompress, polishPrompt } from '../../claude/polish';
import { recordPolishSavings } from '../../economy/achievements';
import { contextEstimate, engineAvailable } from '../../claude/agent';
import { chatSig, composerSeed, isRunning, send, stop, tick } from './ws';

type Polish = { text: string; before: number; after: number; notes: string[]; missing: string[]; original: string; usedModel: boolean };

const MAX_FILE = 20 * 1024 * 1024;

async function toAttachment(f: File): Promise<MsgBlock | null> {
  if (f.size > MAX_FILE) { toast(`${f.name} is over 20 MB`, 'warn'); return null; }
  const mime = f.type || (/\.(md|txt|ts|tsx|js|py|json|cs|gd|lua|html|css|glsl|rs|go|yaml|yml|toml|csv)$/i.test(f.name) ? 'text/plain' : 'application/octet-stream');
  if (mime.startsWith('image/') || mime === 'application/pdf') return { type: 'attachment', name: f.name, mime, size: f.size, dataUrl: await readFileAsDataURL(f) };
  if (isTextMime(mime)) return { type: 'attachment', name: f.name, mime, size: f.size, text: await readFileAsText(f) };
  toast(`${f.name}: only images, PDFs and text/code files can be attached`, 'warn');
  return null;
}

export function Composer({ placeholder, autofocus, compact }: { placeholder?: string; autofocus?: boolean; compact?: boolean }) {
  void tick.value;
  const chat = chatSig.value;
  const s = settings.value;
  const [text, setText] = useState('');
  const [atts, setAtts] = useState<MsgBlock[]>([]);
  const [polish, setPolish] = useState<Polish | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [undo, setUndo] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [dict, setDict] = useState<any>(null);
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const busy = isRunning(chat?.id);
  const pol = fullPolicy();
  const f = fuel.value;
  const ok = engineAvailable();

  // seed from "Build it" / sendToTerminal
  useEffect(() => {
    const seed = composerSeed.value;
    if (!seed) return;
    composerSeed.value = null;
    if (seed.send && ok) void send(seed.text);
    else { setText(seed.text); setTimeout(() => ta.current?.focus(), 50); }
  }, [composerSeed.value]);

  useEffect(() => { if (autofocus) setTimeout(() => ta.current?.focus(), 80); }, [chat?.id]);
  useEffect(() => { capability('dictation').then((d) => setDict(d)); }, []);
  // autosize
  useEffect(() => {
    const el = ta.current; if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.38)) + 'px';
  }, [text, partial]);

  const tokens = estimateTokens(text) + atts.reduce((n, a) => n + (a.type === 'attachment' ? (a.text ? estimateTokens(a.text) : a.mime === 'application/pdf' ? Math.round(a.size / 3) : 1500) : 0), 0);
  const saving = useMemo(() => (text.length > 80 ? estimateTokens(text) - estimateTokens(localCompress(text)) : 0), [text]);
  const ctx = contextEstimate(chat);

  async function doPolish(): Promise<Polish | null> {
    if (!text.trim()) return null;
    setPolishing(true);
    sfx('machine', 0.35);
    try {
      const r = await polishPrompt(text);
      const p = { ...r, original: text };
      setPolish(p);
      sfx('bling', 0.5);
      return p;
    } catch (err: any) {
      toast(`Polish failed: ${err?.message ?? err}`, 'warn');
      return null;
    } finally { setPolishing(false); }
  }

  async function submit() {
    const body = text.trim();
    if ((!body && !atts.length) || busy) return;
    if (!ok) { toast('Link a Claude account first (Accounts).', 'warn'); return; }
    let final = body, from: string | undefined;
    if (s.polish === 'auto' && body.length > 60 && !undo) {
      const p = await doPolish();
      if (p && p.after < p.before) { final = p.text; from = body; }
      setPolish(null);
    }
    if (!from && undo) from = undo;
    if (from && from !== final) recordPolishSavings(Math.max(0, estimateTokens(from) - estimateTokens(final)));
    setText(''); setAtts([]); setPolish(null); setUndo(null);
    void send(final, atts, from);
  }

  async function addFiles(list: FileList | File[]) {
    const out: MsgBlock[] = [];
    for (const f of Array.from(list)) { const a = await toAttachment(f); if (a) out.push(a); }
    if (out.length) { setAtts((x) => [...x, ...out]); sfx('paper', 0.5); }
  }

  async function toggleMic() {
    if (!dict) return;
    if (listening) { try { await dict.stop(); } catch { /* ignore */ } return; }
    try {
      dict.onPartial(({ text: t }: { text: string }) => setPartial(t));
      dict.onFinal(({ text: t }: { text: string }) => { setPartial(''); setText((x) => (x ? x.replace(/\s*$/, ' ') : '') + t); });
      dict.onState(({ state }: { state: string }) => setListening(state === 'listening'));
      dict.start().catch((e: any) => { if (e?.code === 'not_granted') setDict(null); });
    } catch { setDict(null); }
  }

  const setModel = (id: string) => {
    patchSettings({ model: id });
    if (chat) { chat.model = id; saveChat(chat); }
  };
  const model = chat?.model ?? s.model;
  const tierColor = f.tier === 'full' ? 'g' : f.tier === 'half' ? 'c' : f.tier === 'quarter' ? 'a' : 'r';

  return (
    <div class={`ws-composer ${drag ? 'drag' : ''} ${compact ? 'compact' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer?.files?.length) void addFiles(e.dataTransfer.files); }}>

      {polish && (
        <div class="ws-polish">
          <div class="row between wrap">
            <div class="row"><span class="glow-p"><Icon name="sparkle" /></span><b>Polished prompt</b>
              <span class={`chip ${polish.after < polish.before ? 'g' : ''}`}>{fmtTokens(polish.before)} → {fmtTokens(polish.after)} tok{polish.after < polish.before ? ` · −${Math.round((1 - polish.after / polish.before) * 100)}%` : ''}</span>
              {polish.usedModel && <span class="chip p">model pass</span>}
            </div>
            <div class="row">
              <Btn size="sm" tone="ghost" onClick={() => { setPolish(null); sfx('panel_close', .3); }}>Keep mine</Btn>
              <Btn size="sm" tone="glob" icon="check" onClick={() => { setUndo(polish.original); setText(polish.text); setPolish(null); sfx('select', .5); setTimeout(() => ta.current?.focus(), 30); }}>Use polished</Btn>
            </div>
          </div>
          {!!polish.notes.length && <div class="dim ws-small">{polish.notes.join(' · ')}{polish.missing.length ? ` — kept: ${polish.missing.slice(0, 6).join(', ')}` : ''}</div>}
          <textarea class="textarea mono ws-polish-text" value={polish.text} onInput={(e) => setPolish({ ...polish, text: (e.target as HTMLTextAreaElement).value, after: estimateTokens((e.target as HTMLTextAreaElement).value) })} />
        </div>
      )}

      {!!atts.length && (
        <div class="row wrap ws-atts">
          {atts.map((a, i) => a.type === 'attachment' && (
            <span class="chip c" key={i} title={`${a.name} · ${Math.round(a.size / 1024)} KB`}>
              {a.dataUrl && a.mime.startsWith('image/') ? <img src={a.dataUrl} alt="" class="ws-att-thumb" /> : <Icon name={a.mime === 'application/pdf' ? 'file' : 'code'} size="sm" />}
              <span class="ellipsis" style={{ maxWidth: '140px' }}>{a.name}</span>
              <button type="button" class="ws-x" aria-label={`Remove ${a.name}`} onClick={() => setAtts(atts.filter((_, j) => j !== i))}>×</button>
            </span>
          ))}
        </div>
      )}

      <div class="ws-input">
        <textarea ref={ta} id="ws-prompt" class="ws-ta" rows={compact ? 2 : 3} value={text + (partial ? (text ? ' ' : '') + partial : '')}
          placeholder={placeholder ?? (ok ? 'Describe what to build, fix or brainstorm…' : 'Link a Claude account to start…')}
          onInput={(e) => { setText((e.target as HTMLTextAreaElement).value); if (undo) setUndo(null); }}
          onPaste={(e) => { const fl = e.clipboardData?.files; if (fl && fl.length) { e.preventDefault(); void addFiles(fl); } }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); return; }
            if (e.key === 'Enter' && !e.shiftKey && s.enterToSend && !e.isComposing) { e.preventDefault(); void submit(); }
          }} />
        {undo && <button type="button" class="chip p ws-undo" onClick={() => { setText(undo); setUndo(null); }} title="Restore your original wording"><Icon name="sparkle" size="sm" /> polished · undo</button>}
      </div>

      <div class="ws-tools">
        <input ref={fileIn} type="file" multiple hidden accept="image/*,application/pdf,.txt,.md,.ts,.tsx,.js,.jsx,.py,.json,.cs,.gd,.lua,.html,.css,.glsl,.rs,.go,.yaml,.yml,.toml,.csv"
          onChange={(e) => { const fl = (e.target as HTMLInputElement).files; if (fl) void addFiles(fl); (e.target as HTMLInputElement).value = ''; }} />
        <Btn size="sm" tone="ghost" iconOnly icon="clip" title="Attach images, PDFs or code" onClick={() => fileIn.current?.click()} />
        <select class="select ws-mini" aria-label="Model" value={model} onChange={(e) => setModel((e.target as HTMLSelectElement).value)} title={modelInfo(model).blurb}>
          {MODELS.map((m) => <option value={m.id} key={m.id}>{m.short}</option>)}
        </select>
        <select class="select ws-mini" aria-label="Effort" value={s.effort} onChange={(e) => patchSettings({ effort: (e.target as HTMLSelectElement).value as any })}
          title={pol.effort !== s.effort ? `Auto-Saver is running this at ${pol.effort}` : 'Thinking effort'}>
          {EFFORT_ORDER.map((e) => <option value={e} key={e}>{EFFORT_LABEL[e]}{pol.effort !== s.effort && e === s.effort ? ` → ${EFFORT_LABEL[pol.effort]}` : ''}</option>)}
        </select>
        <button type="button" class={`chip ${s.webSearch ? 'c' : ''} hide-sm`} aria-pressed={s.webSearch} onClick={() => { sfx('toggle', .4); patchSettings({ webSearch: !s.webSearch }); }} title="Let Claude search and read the web">
          <Icon name="search" size="sm" /> Web
        </button>
        <Btn size="sm" tone={saving > 3 ? 'pink' : 'ghost'} icon="sparkle" disabled={!text.trim() || polishing} onClick={() => void doPolish()}
          title={`Polish prompt (${s.polish} mode)${saving > 3 ? ` — saves ~${saving} tokens locally` : ''}`}>
          <span class="hide-sm">{polishing ? 'Polishing…' : saving > 3 ? `Polish −${saving}` : 'Polish'}</span>
        </Btn>
        <div class="grow" />
        <span class={`chip ${tierColor} hide-sm`} title={pol.reasons.length ? `Auto-Saver: ${pol.reasons.join(', ')}` : `Fuel ${TIER_LABEL[f.tier]}`}>
          <Icon name="fuel" size="sm" />{Math.round(f.level * 100)}%{pol.caveman !== 'off' ? ' · 🪨' : ''}
        </span>
        <span class="dim tnum ws-small hide-sm" title={`This prompt ≈ ${tokens} tokens · conversation context ≈ ${fmtTokens(ctx)} / compacts at ${fmtTokens(pol.compactAt)}`}>
          {fmtTokens(tokens)} · ctx {fmtTokens(ctx)}
        </span>
        {dict && <Btn size="sm" tone={listening ? 'danger' : 'ghost'} iconOnly icon="mic" title={listening ? 'Stop dictation' : 'Dictate'} onClick={() => void toggleMic()} />}
        {busy
          ? <Btn tone="danger" icon="stop" onClick={() => chat && stop(chat.id)} title="Stop">Stop</Btn>
          : <Btn tone="glob" icon="send" disabled={(!text.trim() && !atts.length) || !ok} onClick={() => void submit()} title="Send (Enter)">Send</Btn>}
      </div>
    </div>
  );
}
