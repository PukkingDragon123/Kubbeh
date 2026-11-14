// ⌘K command palette: search chats, projects, files and artifacts; run quick actions.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { artifacts, chatIndex, filesByProject, loadFiles, projects, setPanel } from '../../core/state';
import { sfx } from '../../core/bus';
import { Icon, type IconName } from '../common/icons';
import { artifactSel, drawer, fileSel, goHome, openChat, paletteOpen } from './ws';
import { newProjectFlow } from './Sidebar';

type Item = { id: string; icon: IconName; title: string; sub?: string; run: () => void };

export function Palette() {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 20); for (const p of projects.value) void loadFiles(p.id); }, []);
  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const hit = (s: string) => !needle || s.toLowerCase().includes(needle);
    const out: Item[] = [
      { id: 'a-new', icon: 'plus', title: 'New chat', run: () => goHome(null) },
      { id: 'a-game', icon: 'arcade', title: 'New game project', run: () => void newProjectFlow('game') },
      { id: 'a-fuel', icon: 'fuel', title: 'Open fuel tank', run: () => setPanel('fuel') },
      { id: 'a-set', icon: 'gear', title: 'Settings', run: () => setPanel('settings') },
      { id: 'a-acc', icon: 'user', title: 'Accounts', run: () => setPanel('accounts') },
    ].filter((x) => hit(x.title));
    for (const p of projects.value) if (hit(p.name) || hit(p.description)) out.push({ id: p.id, icon: 'folder', title: `${p.glyph} ${p.name}`, sub: 'project', run: () => goHome(p.id) });
    for (const c of chatIndex.value) if (hit(c.title)) out.push({ id: c.id, icon: c.mode === 'idea' ? 'idea' : 'chat', title: c.title, sub: 'chat', run: () => void openChat(c.id) });
    if (needle) for (const [pid, files] of Object.entries(filesByProject.value)) for (const f of files) {
      if (hit(f.path) || (!f.binary && f.content.toLowerCase().includes(needle))) {
        const proj = projects.value.find((p) => p.id === pid);
        out.push({ id: f.id, icon: 'code', title: f.path, sub: proj?.name ?? 'file', run: () => { goHome(pid); fileSel.value = f.path; drawer.value = 'files'; } });
      }
    }
    for (const a of artifacts.value) if (hit(a.title)) out.push({ id: a.id, icon: 'bolt', title: a.title, sub: `${a.kind} artifact`, run: () => { artifactSel.value = a.id; drawer.value = 'artifacts'; } });
    return out.slice(0, 60);
  }, [q, chatIndex.value, projects.value, artifacts.value, filesByProject.value]);

  const go = (it?: Item) => { if (!it) return; sfx('select', .4); paletteOpen.value = false; it.run(); };
  return (
    <div class="ws-palette-back" onClick={(e) => { if (e.target === e.currentTarget) paletteOpen.value = false; }}>
      <div class="ws-palette card" role="dialog" aria-label="Search">
        <div class="row"><Icon name="search" /><input ref={ref} id="ws-palette-q" class="field" placeholder="Search chats, projects, files, artifacts…" value={q}
          onInput={(e) => { setQ((e.target as HTMLInputElement).value); setI(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(items.length - 1, i + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(0, i - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); go(items[i]); }
            else if (e.key === 'Escape') { e.stopPropagation(); paletteOpen.value = false; }
          }} /></div>
        <div class="col gap-4 scroll" style={{ maxHeight: '50vh' }}>
          {items.map((it, k) => (
            <button type="button" key={it.id + k} class="li" aria-current={k === i} onMouseEnter={() => setI(k)} onClick={() => go(it)}>
              <Icon name={it.icon} size="sm" /><span class="grow ellipsis">{it.title}</span>{it.sub && <span class="dimmer ws-small">{it.sub}</span>}
            </button>
          ))}
          {!items.length && <div class="dim" style={{ padding: '12px' }}>Nothing matches “{q}”.</div>}
        </div>
      </div>
    </div>
  );
}
