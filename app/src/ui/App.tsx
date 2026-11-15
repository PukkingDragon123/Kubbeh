import { useEffect } from 'preact/hooks';
import { editMode, openPanelId, panelArg, setPanel, settings } from '../core/state';
import { bus, sfx } from '../core/bus';
import { panels } from './panels';
import { Hud } from './hud/Hud';
import { HudDock } from './hud/HudDock';
import { stageSig } from './hud/stage';
import { mountHudStage } from '../vox/ui/stage';
import { installChrome } from './common/chrome';
import { installPixelSkins } from './common/pixelframes';

// Paint the pixel-art UI skins before the first frame so no panel ever renders unskinned.
try { installPixelSkins(); } catch (err) { console.warn('[skins]', err); }
import { warmIcons } from './common/icons';
import { useRef } from 'preact/hooks';
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

function HudStageCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try { installChrome(); } catch (err) { console.warn('[chrome]', err); }
    const st = mountHudStage(ref.current);
    stageSig.value = st;
    warmIcons();
  }, []);
  useEffect(() => { const st = stageSig.value; if (st) st.reduceMotion = settings.value.reduceMotion; }, [settings.value.reduceMotion, stageSig.value]);
  return <canvas ref={ref} class="hud3d" aria-hidden="true" />;
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
      if (e.key === 'e' || e.key === 'E') { sfx('toggle', .5); editMode.value = !editMode.value; if (editMode.value) setPanel(null); return; }
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
      <HudStageCanvas />
      <Hud />
      <PanelHost />
      <HudDock />
      <QuestionBubble />
      <Toasts />
      <GenePops />
      <ModalHost />
    </>
  );
}
