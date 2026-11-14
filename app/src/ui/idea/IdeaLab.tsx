// Prof. Glorp's Idea Lab — brainstorm a game with the main alien until the design is
// clear, watch the design doc fill in live, fuse mechanics, then generate the build prompt.
import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { activeAccountId, designDocs, loadChat, newChat, saveChat, setPanel, settings } from '../../core/state';
import { bus, sfx, toast } from '../../core/bus';
import { pick } from '../../core/util';
import type { Chat, ChatMessage, DesignDoc } from '../../core/types';
import { Btn, Seg, Tabs, Win, confirmBox } from '../common/kit';
import { Icon } from '../common/icons';
import { Markdown } from '../workspace/Markdown';
import { runTurn, engineAvailable } from '../../claude/agent';
import { REELS, ideaSentence } from '../shop/slotData';
import { GlorpPortrait, glorpStatus } from './Glorp';
import { DocTab, MixerTab, PromptTab } from './Board';
import { deleteDoc, designDocTool, docAsBrief, getDoc, newDoc, saveDoc } from './doc';
import { GLORP_SYSTEM } from './prompts';
import type { Mechanic } from './mechanics';

/** The doc that stays open between visits. */
const currentDocId = signal<string | null>(null);
/** Text waiting to be sent (from the slot machine, etc). */
const seedText = signal<string>('');

bus.on('idea:send', ({ text }) => {
  const d = newDoc(text.split(/[—.\n]/)[0].slice(0, 48) || 'Slot machine idea');
  saveDoc(d);
  currentDocId.value = d.id;
  seedText.value = text;
});

const STARTERS = [
  'A cozy farming game on a dying star',
  'Roguelike where you play the dungeon',
  'Platformer where your shadow is a second player',
  'Pet sim with jelly aliens that evolve from your code',
  'Racing game on giant musical instruments',
];

const IDLE_LINES = [
  'Tell me any half-baked game idea. I love half-baked. Fully baked is boring.',
  'What game would you play tonight if it existed?',
  'Give me a genre, a vibe, or just a weird sentence.',
];

export function IdeaLab({ close }: { arg: unknown; close: () => void }) {
  const docs = designDocs.value;
  const doc = getDoc(currentDocId.value) ?? docs[0] ?? null;
  const [tab, setTab] = useState<'doc' | 'mix' | 'prompt'>('doc');
  const [view, setView] = useState<'chat' | 'board'>('chat');
  const [chat, setChat] = useState<Chat | null>(null);
  const [rev, setV] = useState(0);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [say, setSay] = useState(pick(IDLE_LINES));
  const edits = useRef<Set<string>>(new Set());
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const bump = () => setV((v) => v + 1);

  useEffect(() => { if (doc && currentDocId.value !== doc.id) currentDocId.value = doc.id; }, [doc?.id]);
  useEffect(() => {
    let alive = true;
    setChat(null);
    if (doc?.chatId) loadChat(doc.chatId).then((c) => { if (alive) setChat(c ?? null); });
    return () => { alive = false; };
  }, [doc?.id, doc?.chatId, activeAccountId.value]);
  useEffect(() => { if (seedText.value) { setText(seedText.value); seedText.value = ''; setView('chat'); setTimeout(() => ta.current?.focus(), 100); } }, [seedText.value]);
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; });

  const ensureDoc = (first: string): DesignDoc => {
    if (doc) return doc;
    const d = newDoc(first.slice(0, 48));
    saveDoc(d);
    currentDocId.value = d.id;
    return d;
  };

  const send = async (raw: string) => {
    const msg = raw.trim();
    if (!msg || busy) return;
    if (!engineAvailable()) { toast('Link a Claude account so Glorp can think', 'warn'); setPanel('accounts'); return; }
    let d = ensureDoc(msg);
    let c = chat;
    if (!c || c.id !== d.chatId) {
      c = (d.chatId ? await loadChat(d.chatId) : undefined) ?? newChat({ mode: 'idea', title: `Idea: ${d.title}`, model: settings.value.model });
      if (d.chatId !== c.id) { d = { ...d, chatId: c.id }; saveDoc(d); }
      setChat(c);
    }
    const first = c.messages.length === 0;
    const hasContent = d.pitch || d.mechanics.length || d.requirements.length;
    let userText = msg;
    if (first && hasContent) userText += `\n\n[Current design doc]\n${docAsBrief(d)}`;
    if (!first && edits.current.size) userText += `\n\n(I edited the doc myself: ${[...edits.current].join(', ')}. Current doc:\n${docAsBrief(d)})`;
    edits.current.clear();
    setText(''); setBusy(true); sfx('send', .45);
    const ctrl = new AbortController(); abort.current = ctrl;
    const docId = d.id;
    try {
      await runTurn({
        chat: c, userText, agentId: 'glorp', disableFileTools: true, systemExtra: GLORP_SYSTEM, source: 'idea', signal: ctrl.signal,
        extraTools: [designDocTool(() => docId, (_n, changed) => { if (changed.length) sfx('paper', .35); bump(); })],
        onUpdate: () => bump(),
      });
      saveChat(c);
    } catch (err: any) {
      if (err?.name !== 'AbortError') toast(err?.message ?? String(err), 'bad');
    } finally { setBusy(false); abort.current = null; bump(); }
  };

  const fuse = (picked: Mechanic[]) => {
    setView('chat');
    void send(`Fuse these mechanics into my game: ${picked.map((m) => `${m.name} (${m.blurb})`).join(' + ')}. Pitch 2–3 concrete fusion concepts.`);
  };

  const rollIdea = () => {
    sfx('portal', .4);
    setText(ideaSentence(REELS.map((r) => pick(r.symbols))));
    setTimeout(() => ta.current?.focus(), 50);
  };

  const newIdea = () => { sfx('plop', .45); const d = newDoc(); saveDoc(d); currentDocId.value = d.id; setChat(null); setText(''); setView('chat'); };
  const removeIdea = async () => {
    if (!doc) return;
    if (!(await confirmBox('Delete this idea?', `“${doc.title}” and its design doc will be removed. The brainstorm chat stays in your chat list.`, { ok: 'Delete', danger: true }))) return;
    deleteDoc(doc.id); currentDocId.value = designDocs.value[0]?.id ?? null; setChat(null);
  };

  const msgs = chat?.messages ?? [];
  const status = glorpStatus();

  return (
    <Win title="Idea Lab" icon="idea" onClose={close}
      actions={
        <div class="row gap-4">
          {docs.length > 0 && (
            <select id="idea-doc" class="select hide-sm" style={{ minHeight: '30px', padding: '2px 8px', maxWidth: '220px' }} value={doc?.id ?? ''} aria-label="Switch idea"
              onChange={(e) => { sfx('select', .4); currentDocId.value = (e.target as HTMLSelectElement).value; }}>
              {docs.map((d) => <option key={d.id} value={d.id}>{d.title} · {d.completeness}%</option>)}
            </select>
          )}
          <Btn size="sm" tone="glob" icon="plus" onClick={newIdea}>New idea</Btn>
          {doc && <Btn size="sm" tone="ghost" iconOnly icon="trash" title="Delete idea" onClick={removeIdea} />}
        </div>
      }>
      <div class="idea-mobile-switch">
        <Seg value={view} onChange={setView} options={[{ value: 'chat', label: 'Chat with Glorp' }, { value: 'board', label: `Design doc${doc ? ` · ${doc.completeness}%` : ''}` }]} label="View" />
      </div>
      <div class="idea" data-view={view}>
        <div class="idea-chat-wrap">
          <div class="chalk idea-chat">
            <div class="glorp-head">
              <GlorpPortrait onPoke={(l) => setSay(l)} />
              <div class="glorp-say"><b>PROF. GLORP</b><br />{busy ? (status || 'Thinking…') : say}</div>
            </div>

            {msgs.length === 0 ? (
              <div class="idea-welcome">
                <h3 class="chalk-text">What are we inventing today?</h3>
                <p class="dim" style={{ margin: 0, maxWidth: '44ch' }}>Type any game idea, however random. Glorp asks the smart questions, suggests mechanics and progression, and keeps the design doc updated until it is clear enough to build.</p>
                <div class="idea-chips" style={{ justifyContent: 'center' }}>
                  {STARTERS.map((s) => <button type="button" class="chip" key={s} onClick={() => { sfx('blip', .4); setText(s); ta.current?.focus(); }}>{s}</button>)}
                  <button type="button" class="chip p" onClick={rollIdea}><Icon name="slot" size="sm" />Roll a random idea</button>
                </div>
                {doc && (doc.pitch || doc.mechanics.length > 0) && <span class="chip c">Continuing “{doc.title}” — the doc on the right comes along</span>}
              </div>
            ) : (
              <div class="idea-msgs" ref={scroller}>
                {msgs.map((m) => <IdeaMsg key={m.id} m={m} rev={rev} />)}
              </div>
            )}

            <form class="idea-compose" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
              <textarea ref={ta} id="idea-input" rows={2} placeholder={msgs.length ? 'Answer, add an idea, or say “surprise me”…' : 'Type a random game idea…'} value={text}
                onInput={(e) => { const t = e.target as HTMLTextAreaElement; setText(t.value); t.style.height = 'auto'; t.style.height = `${Math.min(160, t.scrollHeight)}px`; }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && settings.value.enterToSend) { e.preventDefault(); void send(text); } }} />
              <div class="col gap-4">
                {busy ? <Btn tone="danger" icon="stop" iconOnly title="Stop" onClick={() => abort.current?.abort()} />
                  : <Btn type="submit" tone="glob" icon="send" iconOnly title="Send to Glorp" disabled={!text.trim()} silent />}
                <Btn tone="ghost" size="sm" icon="slot" iconOnly title="Roll a random idea" onClick={rollIdea} />
              </div>
            </form>
          </div>
        </div>

        <section class="idea-board">
          <Tabs value={tab} onChange={setTab} tabs={[{ id: 'doc', label: 'Design doc', icon: 'file' }, { id: 'mix', label: 'Mechanic mixer', icon: 'bolt' }, { id: 'prompt', label: 'Final prompt', icon: 'sparkle' }]} />
          <div class="idea-board-body">
            {!doc ? (
              <div class="empty"><Icon name="idea" size="xl" class="glow-g" /><h3>No idea yet</h3><span>Send Glorp your first idea and the design doc appears here, filling in as you talk.</span></div>
            ) : tab === 'doc' ? <DocTab doc={doc} onEdited={(w) => edits.current.add(w)} onAsk={(q) => { setView('chat'); void send(`Let's settle this: ${q}`); }} />
              : tab === 'mix' ? <MixerTab doc={doc} onFuse={fuse} />
              : <PromptTab key={doc.id} doc={doc} />}
          </div>
        </section>
      </div>
    </Win>
  );
}

function IdeaMsg({ m }: { m: ChatMessage; rev: number }) {
  if (m.role === 'user') {
    const t = m.blocks.find((b) => b.type === 'text') as { text: string } | undefined;
    const shown = (t?.text ?? '').split('\n\n[Current design doc]')[0].split('\n\n(I edited the doc myself')[0];
    return <div class="imsg user">{shown}</div>;
  }
  const show = settings.value.showThinking;
  return (
    <div class="imsg glorp">
      <div class="who">Prof. Glorp</div>
      {m.blocks.map((b, i) => {
        switch (b.type) {
          case 'text': return <Markdown key={i} text={b.text} />;
          case 'thinking': return show && b.text ? <details key={i} class="dimmer" style={{ fontSize: '12px' }}><summary>Thinking</summary>{b.text}</details> : null;
          case 'tool': return <span key={i} class={`itool ${b.isError ? 'err' : ''}`}>{b.done ? <Icon name={b.isError ? 'warn' : 'check'} size="sm" /> : <i class="spin" />}{b.label}</span>;
          case 'question': return <div key={i} class="iq"><div>{b.question}</div>{b.answer ? <div class="a">→ {b.answer}</div> : <div class="dimmer">Answer in the bubble…</div>}</div>;
          case 'notice': return <div key={i} class="dimmer" style={{ fontSize: '12px' }}>{b.text}</div>;
          default: return null;
        }
      })}
      {m.pending && !m.blocks.length && <span class="dim">…</span>}
      {m.error && <div style={{ color: 'var(--red)', fontSize: '12.5px' }}>{m.error}</div>}
    </div>
  );
}
