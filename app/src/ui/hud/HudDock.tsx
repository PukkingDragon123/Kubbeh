// The four big floating voxel buttons: TERMINAL · IDEAS · SHOP · FUEL.
// No labels — a brass plaque appears on hover. The fuel button IS the fuel tank.
import { useRef } from 'preact/hooks';
import { crew, fuel, openPanelId, setPanel } from '../../core/state';
import { bus, sfx } from '../../core/bus';
import type { PanelId } from '../../core/types';
import { useStageObject } from './stage';
import { holoComputer, glorpFigure, geneOMat } from '../../vox/ui/hudmodels';
import { FuelTank } from '../../vox/ui/tank';
import type { StageItem } from '../../vox/ui/stage';

type Def = { id: PanelId; tip: string; key: string };
const DEFS: Def[] = [
  { id: 'terminal', tip: 'Terminal', key: 'T' },
  { id: 'idea', tip: 'Idea Lab · Prof. Glorp', key: 'I' },
  { id: 'shop', tip: 'GENE-O-MAT', key: 'S' },
  { id: 'fuel', tip: 'Fuel tank', key: 'F' },
];

function Big({ def }: { def: Def }) {
  const ref = useRef<HTMLButtonElement>(null);
  const open = openPanelId.value === def.id;
  const itemRef = useRef<StageItem | null>(null);
  useStageObject(ref, () => {
    if (def.id === 'terminal') return { obj: holoComputer(), opts: { fit: 1.22, yaw: -0.5, pitch: 0.24, bob: 4, ay: 0.46 }, onItem: (it) => (itemRef.current = it) };
    if (def.id === 'shop') return { obj: geneOMat(1.4), opts: { fit: 1.22, yaw: -0.42, pitch: 0.2, bob: 4, ay: 0.46 }, onItem: (it) => (itemRef.current = it) };
    if (def.id === 'idea') {
      const g = glorpFigure();
      let nextBlink = 2, blinkUntil = 0, wave = 0;
      return {
        obj: g.root, onItem: (it) => (itemRef.current = it),
        opts: {
          fit: 1.32, yaw: -0.32, pitch: 0.1, bob: 5, ay: 0.44,
          tick: (t, dt, it) => {
            const me = crew.value.find((m) => m.id === 'glorp');
            const busy = me && me.activity !== 'idle' && me.activity !== 'sleeping';
            if (t > nextBlink) { blinkUntil = t + 0.13; nextBlink = t + 2.4 + Math.random() * 3; }
            g.setFace(t < blinkUntil ? 'blink' : it.hover ? 'love' : busy ? 'focused' : 'happy');
            wave = Math.max(0, wave - dt);
            if (it.hover && wave <= 0) wave = 1.2;
            g.armR.rotation.z = it.hover ? 2.2 + Math.sin(t * 12) * 0.35 : Math.sin(t * 2) * 0.08;
            g.armL.rotation.z = -Math.sin(t * 2 + 1) * 0.08;
            if (g.antL && g.antR) { g.antL.rotation.x = Math.sin(t * 3) * 0.12; g.antR.rotation.x = Math.sin(t * 3 + 1.4) * 0.12; }
            g.jelly.scale.set(1 + Math.sin(t * 2.4) * 0.015, 1 - Math.sin(t * 2.4) * 0.02, 1 + Math.sin(t * 2.4) * 0.015);
          },
        },
      };
    }
    const tank = new FuelTank();
    return {
      obj: tank.root, onItem: (it) => (itemRef.current = it),
      opts: { fit: 1.25, yaw: -0.35, pitch: 0.16, bob: 2, ay: 0.44, tick: (t, dt) => { const f = fuel.value; tank.update(dt, t, f.level, f.tier); } },
    };
  }, []);
  const f = fuel.value;
  const tone = f.tier === 'full' ? 'glow' : f.tier === 'half' ? 'steel' : f.tier === 'quarter' ? 'warn' : 'crit';
  return (
    <button ref={ref} type="button" class="hud-obj big pe" aria-pressed={open} aria-label={def.tip} aria-keyshortcuts={def.key}
      onMouseEnter={() => sfx('hover', 0.2)}
      onClick={() => {
        sfx(open ? 'panel_close' : 'panel_open', 0.5);
        if (itemRef.current) itemRef.current.sqV += 10;
        setPanel(open ? null : def.id);
        if (!open) bus.emit('world:focus', { target: def.id });
      }}>
      <span class="tip plaque">{def.tip}</span>
      <span class="key">{def.key}</span>
      {def.id === 'fuel' && <span class={`hud-num plaque ${tone}`}>{Math.round(f.level * 100)}%</span>}
    </button>
  );
}

export function HudDock() {
  return (
    <nav class="hud-dock" aria-label="Lab stations">
      {DEFS.map((d) => <Big key={d.id} def={d} />)}
    </nav>
  );
}
