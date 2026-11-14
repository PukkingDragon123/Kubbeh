import { useEffect } from 'preact/hooks';
import { openPanelId, panelArg, setPanel, settings } from '../core/state';
import { bus, sfx } from '../core/bus';
import { panels } from './panels';
import { Hud } from './hud/Hud';
import { Dock } from './hud/Dock';
import { Toasts, GenePops } from './common/Toasts';
import { QuestionBubble } from './common/QuestionBubble';
import { ModalHost } from './common/kit';

function PanelHost() {
  const id = openPanelId.value;
  if (!id) return null;
  const def = panels.get(id);
  if (!def) return null;
  const C = def.component;
  return (
    <div class={`panel-host size-${def.size === 'side' ? 'md side' : def.size}`} key={id}>
      <C arg={panelArg.value} close={() => { sfx('panel_close', .4); setPanel(null); }} />
    </div>
  );
}

export function App() {
  useEffect(() => {
    const offOpen = bus.on('ui:open', ({ panel, arg }) => { sfx('panel_open', .45); setPanel(panel, arg); });
    const offClose = bus.on('ui:close', ({ panel }) => { if (openPanelId.value === panel) setPanel(null); });
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        if (e.key === 'Escape') (t as HTMLElement).blur();
        return;
      }
      if (e.key === 'Escape') { if (openPanelId.value) { sfx('panel_close', .4); setPanel(null); } return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      for (const p of panels.values()) if (p.dock?.hotkey && p.dock.hotkey.toLowerCase() === e.key.toLowerCase()) {
        e.preventDefault(); sfx('panel_open', .45); setPanel(openPanelId.value === p.id ? null : p.id); return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { offOpen(); offClose(); window.removeEventListener('keydown', onKey); };
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('reduce-motion', settings.value.reduceMotion); }, [settings.value.reduceMotion]);
  return (
    <>
      <Hud />
      <PanelHost />
      <Dock />
      <QuestionBubble />
      <Toasts />
      <GenePops />
      <ModalHost />
    </>
  );
}
