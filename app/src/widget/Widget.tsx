// The floating lab widget: a tiny living 3D voxel deck you keep on top of other apps.
// Aliens walk to the station that matches what Claude is really doing (crew signal),
// voxel UFOs orbit, the glass tank shows the real fuel level, and a row of voxel cells
// tracks the active project's tasks.
import { useEffect, useRef } from 'preact/hooks';
import { activeProjectId, crew, economy, fuel, projects } from '../core/state';
import { isBusy } from '../core/crew';
import { Icon } from '../ui/common/icons';
import { WidgetScene } from './scene';

export function Widget({ win, onClose, onHome, dragHandle }: { win: Window; onClose?: () => void; onHome: () => void; dragHandle?: (e: PointerEvent) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const f = fuel.value;
  const eco = economy.value;
  const busy = crew.value.filter(isBusy);
  const proj = projects.value.find((p) => p.id === activeProjectId.value) ?? [...projects.value].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const tasks = proj?.tasks ?? [];
  const done = tasks.filter((x) => x.status === 'done').length;
  const fc = f.tier === 'full' ? 'var(--glob)' : f.tier === 'half' ? 'var(--cyan)' : f.tier === 'quarter' ? 'var(--amber)' : 'var(--red)';

  useEffect(() => {
    let scene: WidgetScene | null = null;
    try { scene = new WidgetScene(cv.current!, win); scene.start(); } catch (err) { console.warn('[widget] 3D unavailable', err); }
    const onResize = () => scene?.resize();
    win.addEventListener('resize', onResize);
    const ro = new (win as any).ResizeObserver(onResize); ro.observe(cv.current!);
    return () => { win.removeEventListener('resize', onResize); ro.disconnect(); scene?.stop(); };
  }, [win]);

  return (
    <div class="glw">
      <div class="glw-head" onPointerDown={dragHandle as any}>
        <span class="glw-logo" onClick={onHome} title="Back to the lab">GLOB<b>LABS</b></span>
        <span class="glw-chip" style={{ color: fc }} title={`Fuel ${Math.round(f.level * 100)}% — ${f.source}`}><Icon name="fuel" size="sm" /><span class="tnum">{Math.round(f.level * 100)}%</span></span>
        {proj && tasks.length > 0 && <span class="glw-chip pink" title={proj.name}><Icon name="tasks" size="sm" /><span class="tnum">{done}/{tasks.length}</span></span>}
        <span class="glw-chip glob" title="Gene Points"><Icon name="dna" size="sm" /><span class="tnum">{eco.balance.toLocaleString()}</span></span>
        <button type="button" class="glw-btn" onClick={onHome} title="Open the lab" aria-label="Open the lab"><Icon name="back" size="sm" /></button>
        {onClose && <button type="button" class="glw-btn" onClick={onClose} title="Close widget" aria-label="Close widget"><Icon name="close" size="sm" /></button>}
      </div>
      <div class={`glw-screen ${f.tier === 'critical' || f.tier === 'empty' ? 'alarm' : ''}`}><canvas ref={cv} /></div>
      <div class="glw-status">
        {busy.length ? busy.slice(-1).map((m) => <div key={m.id}><b>{m.name}</b> <span class="dim">{m.label}</span></div>) : <div class="dim">Crew idle</div>}
      </div>
    </div>
  );
}
