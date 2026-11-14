// Chat view: header, message stream (Markdown, tool rows acted out by named aliens, clones,
// questions, artifacts, search results), jump-to-latest, and the composer.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ActivityKind, ChatMessage, MsgBlock } from '../../core/types';
import { activeAccount, artifacts, crew, fuel, projects, saveChat, writeFile } from '../../core/state';
import { sfx, toast } from '../../core/bus';
import { fmtTokens, fmtUsd, fmtAgo, langOf } from '../../core/util';
import { Btn, copyText, promptBox } from '../common/kit';
import { Icon, type IconName } from '../common/icons';
import { answerQuestion } from '../common/QuestionBubble';
import { modelInfo } from '../../claude/models';
import { compactChat, contextEstimate } from '../../claude/agent';
import { fullPolicy } from '../../claude/fuel';
import { Markdown } from './Markdown';
import { Composer } from './Composer';
import { artifactSel, chatSig, drawer, editAndResend, fuelBlocked, isRunning, retry, send, tick, bump } from './ws';
import { emptyOverride } from '../../claude/fuel';

const KIND_ICON: Record<ActivityKind, IconName> = {
  idle: 'alien', thinking: 'brain', writing: 'pencil', coding: 'code', research: 'search', files: 'folder', bugfix: 'wrench',
  building: 'bolt', planning: 'tasks', question: 'chat', cloning: 'alien', celebrating: 'star', sleeping: 'alien',
};
const KIND_ALIEN: Partial<Record<ActivityKind, string>> = { files: 'zib', research: 'mossy', planning: 'pounce', building: 'pounce' };

function alienName(kind: ActivityKind, idea: boolean) {
  const id = idea ? 'glorp' : KIND_ALIEN[kind] ?? 'blip';
  return crew.value.find((m) => m.id === id)?.name ?? id;
}

function ToolRow({ b, idea }: { b: Extract<MsgBlock, { type: 'tool' }>; idea: boolean }) {
  const [open, setOpen] = useState(false);
  const state = !b.done ? 'run' : b.isError ? 'bad' : 'ok';
  return (
    <div class={`ws-tool ${state}`} data-kind={b.kind}>
      <button type="button" class="ws-tool-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span class="ws-tool-ico"><Icon name={KIND_ICON[b.kind] ?? 'bolt'} size="sm" /></span>
        <b class="ws-tool-who">{alienName(b.kind, idea)}</b>
        <span class="ellipsis grow">{b.label}</span>
        <span class="ws-tool-state">{state === 'run' ? <i class="ws-spin" /> : state === 'ok' ? <Icon name="check" size="sm" /> : <Icon name="warn" size="sm" />}</span>
      </button>
      {open && (b.result || b.input) ? <pre class="ws-tool-body">{b.result ?? JSON.stringify(b.input, null, 2)}</pre> : null}
    </div>
  );
}

function Thinking({ b, live }: { b: Extract<MsgBlock, { type: 'thinking' }>; live: boolean }) {
  if (!b.text.trim()) return <div class="ws-think quiet"><Icon name="brain" size="sm" /> {live ? 'Thinking…' : 'Thought it through'}</div>;
  return (
    <details class="ws-think" open={live}>
      <summary><Icon name="brain" size="sm" /> {live ? 'Thinking…' : 'Thoughts'}</summary>
      <div class="ws-think-body">{b.text}</div>
    </details>
  );
}

function CloneCard({ b }: { b: Extract<MsgBlock, { type: 'clone' }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div class={`ws-clone ${b.status}`}>
      <button type="button" class="row" onClick={() => setOpen(!open)}>
        <span class="glow-g"><Icon name="alien" /></span>
        <span class="grow ellipsis"><b>Clone</b> · {b.task}</span>
        {b.status === 'working' ? <i class="ws-spin" /> : b.status === 'done' ? <span class="chip g">done</span> : <span class="chip r">fizzled</span>}
      </button>
      {open && b.result && <div class="ws-clone-body"><Markdown text={b.result} /></div>}
    </div>
  );
}

function QuestionBlock({ b, live }: { b: Extract<MsgBlock, { type: 'question' }>; live: boolean }) {
  const waiting = live && !b.answer;
  return (
    <div class={`ws-q ${waiting ? 'waiting' : ''}`}>
      <div class="row"><Icon name="chat" size="sm" /><b>{b.question}</b></div>
      {b.answer ? <div class="ws-q-a">→ {b.answer}</div> : waiting ? (
        <div class="row wrap">
          <span class="dim ws-small">Waiting for you — answer in the alien's bubble or here:</span>
          {b.options?.map((o) => <button type="button" class="chip c" key={o} onClick={() => answerQuestion(b.id, o)}>{o}</button>)}
        </div>
      ) : <div class="dim ws-small">No answer</div>}
    </div>
  );
}

function ArtifactChip({ id, title }: { id: string; title: string }) {
  const a = artifacts.value.find((x) => x.id === id);
  return (
    <button type="button" class="ws-art-chip" onClick={() => { sfx('panel_open', .4); artifactSel.value = id; drawer.value = 'artifacts'; }}>
      <span class="ws-art-ico"><Icon name="bolt" /></span>
      <span class="col gap-4" style={{ alignItems: 'flex-start', minWidth: 0 }}>
        <b class="ellipsis" style={{ maxWidth: '100%' }}>{a?.title ?? title}</b>
        <span class="dim ws-small">{a ? `${a.kind.toUpperCase()} artifact · v${a.versions.length + 1}` : 'artifact'} · click to open</span>
      </span>
    </button>
  );
}

async function onCodeAction(e: MouseEvent, projectId?: string) {
  const btn = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
  if (!btn) return;
  const box = btn.closest('.ws-code');
  const code = box?.querySelector('pre code')?.textContent ?? '';
  if (btn.dataset.act === 'copy') {
    if (await copyText(code)) { btn.textContent = 'Copied!'; sfx('blip', .4); setTimeout(() => { btn.textContent = 'Copy'; }, 1200); }
  } else if (btn.dataset.act === 'save') {
    const pid = projectId ?? chatSig.value?.projectId;
    if (!pid) { toast('Put this chat in a project first (header ▸ project).', 'warn'); return; }
    const lang = btn.dataset.lang || 'txt';
    const ext = ({ typescript: 'ts', ts: 'ts', javascript: 'js', js: 'js', python: 'py', py: 'py', json: 'json', html: 'html', css: 'css', csharp: 'cs', cs: 'cs', gdscript: 'gd', lua: 'lua', glsl: 'glsl', rust: 'rs', go: 'go', bash: 'sh', sh: 'sh', markdown: 'md', md: 'md' } as Record<string, string>)[lang] ?? 'txt';
    const path = await promptBox('Save code to project', `src/snippet.${ext}`, 'Path inside the project');
    if (!path) return;
    await writeFile(pid, path, code, { source: 'user', mime: 'text/plain' });
    toast(`Saved ${path}`, 'good', 'file');
    void langOf;
  }
}

function MessageView({ m, i, last }: { m: ChatMessage; i: number; last: boolean }) {
  const chat = chatSig.value!;
  const idea = chat.mode === 'idea';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const text = m.blocks.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n\n');
  if (m.role === 'user') {
    return (
      <div class="ws-msg user">
        <div class="ws-bubble">
          {editing ? (
            <div class="col">
              <textarea class="textarea" value={draft} rows={4} onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)} />
              <div class="row" style={{ justifyContent: 'flex-end' }}>
                <Btn size="sm" tone="ghost" onClick={() => setEditing(false)}>Cancel</Btn>
                <Btn size="sm" tone="glob" onClick={() => { setEditing(false); editAndResend(i, draft); }}>Resend</Btn>
              </div>
            </div>
          ) : <div class="ws-user-text">{text}</div>}
          {m.blocks.filter((b) => b.type === 'attachment').map((b: any, k) => (
            <span class="chip c" key={k}>{b.dataUrl && b.mime.startsWith('image/') ? <img src={b.dataUrl} class="ws-att-thumb" alt="" /> : <Icon name="file" size="sm" />}{b.name}</span>
          ))}
        </div>
        <div class="ws-msg-foot">
          {m.polishedFrom && <span class="chip p" title={`Original:\n${m.polishedFrom}`}><Icon name="sparkle" size="sm" /> polished</span>}
          <button type="button" class="ws-link" onClick={() => { void copyText(text); sfx('blip', .3); }}>Copy</button>
          {!isRunning(chat.id) && <button type="button" class="ws-link" onClick={() => { setDraft(text); setEditing(true); }}>Edit</button>}
        </div>
      </div>
    );
  }
  const live = !!m.pending;
  const u = m.usage;
  return (
    <div class="ws-msg bot">
      <div class="ws-avatar" aria-hidden="true"><Icon name="alien" size="lg" /></div>
      <div class="ws-bot-body" onClick={(e) => void onCodeAction(e as unknown as MouseEvent, chat.projectId)}>
        {m.blocks.map((b, k) => {
          switch (b.type) {
            case 'text': return <Markdown key={k} text={b.text} />;
            case 'thinking': return <Thinking key={k} b={b} live={live && k === m.blocks.length - 1} />;
            case 'tool': return <ToolRow key={k} b={b} idea={idea} />;
            case 'clone': return <CloneCard key={k} b={b} />;
            case 'question': return <QuestionBlock key={k} b={b} live={live} />;
            case 'artifact': return <ArtifactChip key={k} id={b.artifactId} title={b.title} />;
            case 'search': return (
              <div key={k} class="ws-search"><Icon name="search" size="sm" /> <span class="dim">{b.query}</span>
                <div class="row wrap gap-4">{b.results.map((r) => <a key={r.url} class="chip" href={r.url} target="_blank" rel="noopener noreferrer" title={r.url}>{r.title.slice(0, 40)}</a>)}</div>
              </div>
            );
            case 'notice': return <div key={k} class={`ws-notice ${b.tone}`}>{b.text}</div>;
            default: return null;
          }
        })}
        {live && !m.blocks.length && <div class="ws-think quiet"><i class="ws-spin" /> {alienName('thinking', idea)} is warming up the vats…</div>}
        {!live && (
          <div class="ws-msg-foot">
            {m.model && <span class="dimmer">{modelInfo(m.model).short}</span>}
            {u && <span class="dimmer tnum" title={`input ${u.input} · output ${u.output} · cache read ${u.cacheRead} · cache write ${u.cacheWrite}`}>{fmtTokens(u.input + u.cacheRead + u.cacheWrite)} in · {fmtTokens(u.output)} out · {u.estimated ? 'est.' : fmtUsd(u.costUsd)}</span>}
            {u && u.cacheRead > 0 && <span class="chip g" title="Served from prompt cache">cached {fmtTokens(u.cacheRead)}</span>}
            <button type="button" class="ws-link" onClick={() => { void copyText(text); sfx('blip', .3); }}>Copy</button>
            {last && !isRunning(chat.id) && <button type="button" class="ws-link" onClick={() => retry(i)}>Retry</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatHeader() {
  const chat = chatSig.value!;
  const proj = projects.value.find((p) => p.id === chat.projectId);
  const ctx = contextEstimate(chat);
  const pol = fullPolicy();
  const [compacting, setCompacting] = useState(false);
  return (
    <div class="ws-chat-head">
      <button type="button" class="ws-title" title="Rename" onClick={async () => { const t = await promptBox('Rename chat', chat.title); if (t) { chat.title = t.trim() || chat.title; saveChat(chat); bump(); } }}>
        {chat.mode === 'idea' && <Icon name="idea" size="sm" />}<span class="ellipsis">{chat.title}</span><Icon name="pencil" size="sm" class="dimmer" />
      </button>
      <select class="select ws-mini" aria-label="Project" value={chat.projectId ?? ''} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; chat.projectId = v || undefined; saveChat(chat); bump(); }}>
        <option value="">No project</option>
        {projects.value.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.glyph} {p.name}</option>)}
      </select>
      <div class="grow" />
      <span class="ws-ctx hide-sm" title={`Context ≈ ${fmtTokens(ctx)} tokens. Auto-compacts at ${fmtTokens(pol.compactAt)}.`}>
        <span class="dimmer ws-small">ctx</span>
        <span class="ws-ctx-bar"><i style={{ width: `${Math.min(100, (ctx / pol.compactAt) * 100)}%` }} /></span>
      </span>
      <Btn size="sm" tone="ghost" icon="refresh" disabled={compacting || isRunning(chat.id) || chat.messages.length < 6} title="Summarize older messages now to save tokens"
        onClick={async () => { setCompacting(true); try { const r = await compactChat(chat); toast(r ? `Compacted ${fmtTokens(r.before)} → ${fmtTokens(r.after)} tokens` : 'Nothing to compact yet', r ? 'good' : 'info'); } catch (e: any) { toast(e?.message ?? 'Compaction failed', 'bad'); } finally { setCompacting(false); bump(); } }}>
        <span class="hide-sm">{compacting ? 'Compacting…' : 'Compact'}</span>
      </Btn>
      {proj && <span class="chip hide-sm" style={{ color: proj.color }}>{proj.glyph} {proj.name}</span>}
    </div>
  );
}

export function ChatView() {
  void tick.value;
  const chat = chatSig.value!;
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const fb = fuelBlocked.value;
  const msgs = chat.messages;
  const lastAssistant = msgs.map((m) => m.role).lastIndexOf('assistant');

  useEffect(() => {
    const el = scroller.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; setAtBottom(true); }, [chat.id]);

  return (
    <div class="ws-chat">
      <ChatHeader />
      <div class="ws-stream scroll" ref={scroller} onScroll={(e) => { const el = e.currentTarget as HTMLDivElement; setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80); }}>
        {chat.summary && (
          <details class="ws-summary">
            <summary><Icon name="refresh" size="sm" /> Earlier messages were compacted to save tokens</summary>
            <Markdown text={chat.summary} />
          </details>
        )}
        {msgs.map((m, i) => (i < (chat.compactedUpTo ?? 0) ? null : <MessageView key={m.id} m={m} i={i} last={i === lastAssistant} />))}
        {!msgs.length && <div class="empty"><h3>Fresh petri dish</h3><div class="dim">Ask for a feature, paste an error, or drop in a screenshot.</div></div>}
        <div style={{ height: '8px' }} />
      </div>
      {!atBottom && <button type="button" class="ws-jump" onClick={() => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }}><Icon name="download" size="sm" /> Latest</button>}
      {fb && (
        <div class="ws-notice bad row wrap between">
          <span><Icon name="fuel" size="sm" /> Fuel tank empty for this period ({fmtUsd(fuel.value.spentUsd)} used of {activeAccount.value?.budget.mode === 'usd' ? fmtUsd(activeAccount.value.budget.amount) : 'budget'}). Raise the budget in Fuel or override once.</span>
          <span class="row">
            <Btn size="sm" tone="ghost" onClick={() => { fuelBlocked.value = null; }}>Cancel</Btn>
            <Btn size="sm" tone="amber" onClick={() => { emptyOverride.value = true; const x = fb; fuelBlocked.value = null; void send(x.text, x.atts); }}>Send anyway</Btn>
          </span>
        </div>
      )}
      <Composer autofocus />
      <div class="dimmer ws-small ws-last">{msgs.length ? `Updated ${fmtAgo(chat.updatedAt)}` : ''}</div>
    </div>
  );
}
