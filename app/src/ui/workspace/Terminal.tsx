// The Terminal — the lab's main computer. Sidebar · chat/home · drawer.
import { useEffect } from 'preact/hooks';
import { activeChatId, activeProjectId, chatIndex, projects } from '../../core/state';
import { Btn, Win } from '../common/kit';
import { Icon } from '../common/icons';
import { engineBlocker } from '../../claude/engine';
import { Sidebar } from './Sidebar';
import { Home } from './Home';
import { ChatView } from './ChatView';
import { Drawer } from './Drawer';
import { Palette } from './Palette';
import { Onboarding } from './Onboarding';
import { chatSig, drawer, isMobile, openChat, paletteOpen, sidebarOpen, tick } from './ws';

export function Terminal({ close }: { arg: unknown; close: () => void }) {
  void tick.value;
  const chat = chatSig.value;
  const blocked = engineBlocker();
  const proj = projects.value.find((p) => p.id === (chat?.projectId ?? activeProjectId.value));

  // reopen the last active chat when the terminal opens
  useEffect(() => {
    if (!chatSig.value && activeChatId.value && chatIndex.value.some((c) => c.id === activeChatId.value)) void openChat(activeChatId.value);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); paletteOpen.value = !paletteOpen.value; }
      else if (e.key === 'Escape' && (paletteOpen.value || drawer.value)) {
        e.stopImmediatePropagation(); e.preventDefault();
        if (paletteOpen.value) paletteOpen.value = false; else drawer.value = null;
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const title = chat ? chat.title : proj ? proj.name : 'Home';
  const toggleDrawer = (t: 'files' | 'artifacts' | 'tasks' | 'project') => { drawer.value = drawer.value === t ? null : t; };

  return (
    <Win title={<span class="row" style={{ gap: '6px' }}>TERMINAL <span class="dimmer hide-sm">·</span> <span class="dim ellipsis hide-sm" style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 'var(--fs-md)', letterSpacing: 0 }}>{title}</span></span>}
      icon="terminal" onClose={close} class="ws-win" bodyClass="ws-winbody"
      actions={<>
        <Btn size="sm" tone="ghost" iconOnly icon="menu" title="Toggle sidebar" onClick={() => { sidebarOpen.value = !sidebarOpen.value; }} />
        <Btn size="sm" tone="ghost" iconOnly icon="search" title="Search (⌘K)" class="hide-sm" onClick={() => { paletteOpen.value = true; }} />
        <Btn size="sm" tone={drawer.value === 'files' ? 'glob' : 'ghost'} iconOnly icon="folder" title="Files" onClick={() => toggleDrawer('files')} />
        <Btn size="sm" tone={drawer.value === 'artifacts' ? 'glob' : 'ghost'} iconOnly icon="bolt" title="Artifacts" onClick={() => toggleDrawer('artifacts')} />
        <Btn size="sm" tone={drawer.value === 'tasks' ? 'glob' : 'ghost'} iconOnly icon="tasks" title="Tasks" class="hide-sm" onClick={() => toggleDrawer('tasks')} />
      </>}>
      <div class={`ws ${sidebarOpen.value ? 'with-side' : ''} ${drawer.value ? 'with-drawer' : ''}`}>
        {sidebarOpen.value && <aside class="ws-side">{<Sidebar />}</aside>}
        {sidebarOpen.value && isMobile() && <div class="ws-scrim" onClick={() => { sidebarOpen.value = false; }} />}
        <main class="ws-main screen no-scan">
          {blocked && !chat ? <Onboarding /> : chat ? <ChatView /> : <Home />}
        </main>
        {drawer.value && <aside class="ws-drawer">{<Drawer />}</aside>}
      </div>
      {paletteOpen.value && <Palette />}
      <span class="sr"><Icon name="alien" /></span>
    </Win>
  );
}
