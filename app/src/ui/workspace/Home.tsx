import { useEffect } from 'preact/hooks';
import { activeProjectId, artifacts, chatIndex, crew, filesByProject, fuel, loadFiles, projects, usageLog, activeAccountId } from '../../core/state';
import { sfx } from '../../core/bus';
import { fmtAgo, fmtUsd, fmtTokens } from '../../core/util';
import { Btn } from '../common/kit';
import { Icon } from '../common/icons';
import { isBusy } from '../../core/crew';
import { Composer } from './Composer';
import { newProjectFlow } from './Sidebar';
import { drawer, goHome, openChat } from './ws';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Night shift, scientist.' : h < 12 ? 'Morning, scientist.' : h < 18 ? 'Afternoon shift, scientist.' : 'Evening shift, scientist.';
}

function ProjectHome({ pid }: { pid: string }) {
  const p = projects.value.find((x) => x.id === pid);
  useEffect(() => { void loadFiles(pid); }, [pid]);
  if (!p) return null;
  const files = filesByProject.value[pid] ?? [];
  const chats = chatIndex.value.filter((c) => c.projectId === pid).sort((a, b) => b.updatedAt - a.updatedAt);
  const tasks = p.tasks ?? [];
  const done = tasks.filter((t) => t.status === 'done').length;
  const arts = artifacts.value.filter((a) => a.projectId === pid);
  return (
    <div class="ws-home scroll">
      <header class="ws-proj-head">
        <span class="ws-glyph xl" style={{ background: p.color }}>{p.glyph}</span>
        <div class="col gap-4 grow">
          <h2 class="ws-h">{p.name} {p.kind === 'game' && <span class="chip p">game</span>}</h2>
          <div class="dim">{p.description || 'No description yet — add one in the Project tab.'}</div>
        </div>
        <Btn size="sm" tone="ghost" icon="back" onClick={() => goHome(null)}>All projects</Btn>
      </header>
      <div class="ws-stats">
        <button type="button" class="card ws-stat" onClick={() => { drawer.value = 'files'; }}><b class="px glow-g">{files.length}</b><span class="dim">files</span></button>
        <button type="button" class="card ws-stat" onClick={() => { drawer.value = 'tasks'; }}><b class="px glow-c">{done}/{tasks.length}</b><span class="dim">tasks done</span>{tasks.length > 0 && <span class="ws-mini-meter"><i style={{ width: `${(done / tasks.length) * 100}%` }} /></span>}</button>
        <button type="button" class="card ws-stat" onClick={() => { drawer.value = 'artifacts'; }}><b class="px glow-p">{arts.length}</b><span class="dim">artifacts</span></button>
        <button type="button" class="card ws-stat" onClick={() => { drawer.value = 'project'; }}><b class="px glow-a">{p.instructions ? '✓' : '—'}</b><span class="dim">instructions</span></button>
      </div>
      <div class="ws-home-composer"><Composer placeholder={`Start a chat in ${p.name}…`} autofocus /></div>
      <h3 class="ws-h3">Chats in this project</h3>
      <div class="col gap-4">
        {chats.map((c) => (
          <button type="button" class="li" key={c.id} onClick={() => void openChat(c.id)}>
            <Icon name={c.mode === 'idea' ? 'idea' : 'chat'} size="sm" /><span class="grow ellipsis">{c.title}</span><span class="dimmer ws-small">{fmtAgo(c.updatedAt)}</span>
          </button>
        ))}
        {!chats.length && <div class="dimmer">No chats yet. Everything you start here gets this project's instructions and knowledge files.</div>}
      </div>
    </div>
  );
}

export function Home() {
  const pid = activeProjectId.value;
  if (pid) return <ProjectHome pid={pid} />;
  const ps = [...projects.value].filter((p) => !p.archived).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
  const recent = [...chatIndex.value].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  const busy = crew.value.filter(isBusy);
  const f = fuel.value;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todays = usageLog.value.filter((r) => r.accountId === activeAccountId.value && r.ts >= today.getTime());
  const todayCost = todays.reduce((s, r) => s + r.costUsd, 0);
  const todayTok = todays.reduce((s, r) => s + r.input + r.output + r.cacheRead + r.cacheWrite, 0);
  return (
    <div class="ws-home scroll">
      <header class="col gap-4">
        <h2 class="ws-h px glow-g">{greeting()}</h2>
        <div class="dim">
          {busy.length ? `${busy.map((b) => b.name).join(', ')} ${busy.length === 1 ? 'is' : 'are'} on the job.` : 'The crew is idle and waiting for an experiment.'}
          {' '}Fuel {Math.round(f.level * 100)}% · today {f.budget.mode === 'usd' ? fmtUsd(todayCost) : fmtTokens(todayTok) + ' tokens'}.
        </div>
      </header>
      <div class="ws-home-composer"><Composer autofocus /></div>

      <div class="row between"><h3 class="ws-h3">Projects</h3></div>
      <div class="ws-grid">
        <button type="button" class="ws-pcard new" onClick={() => void newProjectFlow('game')}>
          <span class="ws-glyph xl" style={{ background: 'var(--pink)' }}>🎮</span><b>New game project</b><span class="dim ws-small">Game-dev instructions pre-loaded</span>
        </button>
        <button type="button" class="ws-pcard new" onClick={() => void newProjectFlow()}>
          <span class="ws-glyph xl" style={{ background: 'var(--metal-hi)' }}>+</span><b>New project</b><span class="dim ws-small">Chats, files, tasks & instructions together</span>
        </button>
        {ps.map((p) => {
          const t = p.tasks ?? []; const d = t.filter((x) => x.status === 'done').length;
          const nChats = chatIndex.value.filter((c) => c.projectId === p.id).length;
          return (
            <button type="button" class="ws-pcard" key={p.id} onClick={() => { sfx('select', .4); goHome(p.id); }}>
              <div class="row"><span class="ws-glyph lg" style={{ background: p.color }}>{p.glyph}</span><b class="ellipsis grow">{p.name}</b>{p.kind === 'game' && <span class="chip p">game</span>}</div>
              <span class="dim ws-small ws-clamp">{p.description || `${nChats} chat${nChats === 1 ? '' : 's'}`}</span>
              {t.length > 0 ? <div class="col gap-4"><span class="ws-mini-meter"><i style={{ width: `${(d / t.length) * 100}%` }} /></span><span class="dimmer ws-small">{d}/{t.length} tasks</span></div> : <span class="dimmer ws-small">No tasks yet</span>}
              <span class="dimmer ws-small">Active {fmtAgo(p.updatedAt)}</span>
            </button>
          );
        })}
      </div>

      {!!recent.length && <>
        <h3 class="ws-h3">Recent chats</h3>
        <div class="col gap-4">
          {recent.map((c) => (
            <button type="button" class="li" key={c.id} onClick={() => void openChat(c.id)}>
              <Icon name={c.mode === 'idea' ? 'idea' : 'chat'} size="sm" /><span class="grow ellipsis">{c.title}</span><span class="dimmer ws-small">{fmtAgo(c.updatedAt)}</span>
            </button>
          ))}
        </div>
      </>}
      <div class="ws-tips dim ws-small">
        <span><kbd>T</kbd> terminal anywhere</span><span><kbd>⌘K</kbd> search</span><span><kbd>Shift</kbd>+<kbd>Enter</kbd> new line</span><span>Drop files or paste screenshots into the composer</span>
      </div>
    </div>
  );
}
