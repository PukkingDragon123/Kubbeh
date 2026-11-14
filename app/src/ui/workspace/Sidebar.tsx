import { useState } from 'preact/hooks';
import { activeAccount, activeChatId, activeProjectId, chatIndex, createProject, deleteChat, loadChat, projects, saveChat, setPanel, updateProject, type ChatMeta } from '../../core/state';
import { sfx } from '../../core/bus';
import { Btn, confirmBox, promptBox } from '../common/kit';
import { Icon } from '../common/icons';
import { goHome, openChat, paletteOpen, running } from './ws';

function bucket(ts: number) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const day = 86400_000;
  if (ts >= d.getTime()) return 'Today';
  if (ts >= d.getTime() - day) return 'Yesterday';
  if (ts >= d.getTime() - 7 * day) return 'This week';
  if (ts >= d.getTime() - 30 * day) return 'This month';
  return 'Older';
}

function ChatRow({ c }: { c: ChatMeta }) {
  const proj = projects.value.find((p) => p.id === c.projectId);
  const busy = !!running.value[c.id];
  return (
    <div class="ws-row">
      <button type="button" class="li" aria-current={activeChatId.value === c.id} onClick={() => { sfx('tab', .35); void openChat(c.id); }} title={c.title}>
        {busy ? <i class="ws-spin" /> : c.mode === 'idea' ? <Icon name="idea" size="sm" /> : c.pinned ? <Icon name="pin" size="sm" /> : <Icon name="chat" size="sm" />}
        <span class="grow ellipsis">{c.title}</span>
        {proj && <span class="ws-glyph sm" style={{ background: proj.color }}>{proj.glyph}</span>}
      </button>
      <div class="ws-row-acts">
        <button type="button" title={c.pinned ? 'Unpin' : 'Pin'} onClick={async () => { const ch = await loadChat(c.id); if (ch) { ch.pinned = !ch.pinned; saveChat(ch); } }}><Icon name="pin" size="sm" /></button>
        <button type="button" title="Rename" onClick={async () => { const ch = await loadChat(c.id); const t = await promptBox('Rename chat', c.title); if (ch && t) { ch.title = t; saveChat(ch); } }}><Icon name="pencil" size="sm" /></button>
        <button type="button" title="Delete" onClick={async () => { if (await confirmBox('Delete this chat?', `“${c.title}” will be gone for good.`, { ok: 'Delete', danger: true })) void deleteChat(c.id); }}><Icon name="trash" size="sm" /></button>
      </div>
    </div>
  );
}

export async function newProjectFlow(kind: 'general' | 'game' = 'general') {
  const name = await promptBox(kind === 'game' ? 'New game project' : 'New project', kind === 'game' ? 'My Game' : 'New project', 'Projects keep chats, files, artifacts, tasks and custom instructions together.');
  if (!name) return;
  const p = createProject({ name: name.trim() || 'Project', kind, glyph: kind === 'game' ? '🎮' : name.trim().slice(0, 1).toUpperCase(),
    instructions: kind === 'game' ? 'This is a game project. Prefer small playable increments, keep gameplay constants in one config file, and explain controls.' : '' });
  sfx('powerup', .5);
  goHome(p.id);
}

export function Sidebar() {
  const [showAll, setShowAll] = useState(false);
  const acc = activeAccount.value;
  const ps = [...projects.value].filter((p) => !p.archived).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
  const chats = [...chatIndex.value].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);
  const pinned = chats.filter((c) => c.pinned);
  const recent = chats.filter((c) => !c.pinned).slice(0, showAll ? 500 : 40);
  const groups = new Map<string, ChatMeta[]>();
  for (const c of recent) { const k = bucket(c.updatedAt); groups.set(k, [...(groups.get(k) ?? []), c]); }

  return (
    <nav class="ws-side-in" aria-label="Chats and projects">
      <div class="col gap-8">
        <Btn tone="glob" icon="plus" block onClick={() => { sfx('boing', .5); goHome(activeProjectId.value); setTimeout(() => (document.getElementById('ws-prompt') as HTMLTextAreaElement | null)?.focus(), 60); }}>New chat</Btn>
        <button type="button" class="ws-search-btn" onClick={() => { paletteOpen.value = true; }}>
          <Icon name="search" size="sm" /> <span class="grow">Search everything</span><kbd>⌘K</kbd>
        </button>
      </div>

      <div class="ws-side-scroll scroll">
        <div class="ws-sec">
          <div class="row between"><span class="up dim">Projects</span>
            <span class="row gap-4">
              <button type="button" class="ws-icon-btn" title="New game project" onClick={() => void newProjectFlow('game')}><Icon name="arcade" size="sm" /></button>
              <button type="button" class="ws-icon-btn" title="New project" onClick={() => void newProjectFlow()}><Icon name="plus" size="sm" /></button>
            </span>
          </div>
          {!ps.length && <div class="dimmer ws-small" style={{ padding: '4px 8px' }}>No projects yet. Files Claude writes start one automatically.</div>}
          {ps.map((p) => {
            const t = p.tasks ?? []; const done = t.filter((x) => x.status === 'done').length;
            return (
              <div class="ws-row" key={p.id}>
                <button type="button" class="li" aria-current={activeProjectId.value === p.id && !activeChatId.value} onClick={() => { sfx('tab', .35); goHome(p.id); }}>
                  <span class="ws-glyph" style={{ background: p.color }}>{p.glyph}</span>
                  <span class="grow col gap-4" style={{ alignItems: 'stretch' }}>
                    <span class="ellipsis">{p.name}</span>
                    {t.length > 0 && <span class="ws-mini-meter"><i style={{ width: `${(done / t.length) * 100}%` }} /></span>}
                  </span>
                </button>
                <div class="ws-row-acts">
                  <button type="button" title={p.pinned ? 'Unpin' : 'Pin'} onClick={() => updateProject(p.id, { pinned: !p.pinned })}><Icon name="pin" size="sm" /></button>
                </div>
              </div>
            );
          })}
        </div>

        {!!pinned.length && (
          <div class="ws-sec"><span class="up dim">Pinned</span>{pinned.map((c) => <ChatRow key={c.id} c={c} />)}</div>
        )}
        {[...groups.entries()].map(([k, list]) => (
          <div class="ws-sec" key={k}><span class="up dim">{k}</span>{list.map((c) => <ChatRow key={c.id} c={c} />)}</div>
        ))}
        {!showAll && chats.length > 40 && <button type="button" class="ws-link" onClick={() => setShowAll(true)}>Show all {chats.length} chats</button>}
        {!chats.length && <div class="dimmer ws-small" style={{ padding: '8px' }}>No chats yet.</div>}
      </div>

      <button type="button" class="ws-acct" onClick={() => setPanel('accounts')} title="Accounts">
        <span class="dot" style={{ color: acc?.color ?? 'var(--text-3)' }} />
        <span class="grow ellipsis">{acc?.name ?? 'No account'}</span>
        <span class="chip">{acc ? (acc.kind === 'api' ? 'API' : 'claude.ai') : 'link'}</span>
      </button>
    </nav>
  );
}
