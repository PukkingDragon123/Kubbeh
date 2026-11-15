// Dev export for the Claude Code mod: renders pixel-finished voxel sprites of the crew so the
// mod's lab pane (an SVG) can show the real models. /?voxlab=export → window.__sprites
import { buildAlien } from '../vox/alien';
import { dressAlien, buildHeldItem } from '../vox/cosmetics';
import { pixelPhoto } from '../vox/ui/pixel';
import { DEFAULT_LOOKS } from '../core/state';
import type { AlienLook } from '../core/types';

export function run() {
  document.getElementById('boot')?.remove();
  const out: Record<string, string> = {};
  const shot = (key: string, look: AlienLook, face: any, tool?: string, yaw = -0.32) => {
    const p = buildAlien(look);
    dressAlien(p, look);
    p.setFace(face);
    if (tool) p.anchors.handR.add(buildHeldItem(tool as any));
    out[key] = pixelPhoto(p.root, 28, 34, { yaw, pitch: 0.1, fill: 0.96 }).toDataURL('image/png');
  };
  for (const l of DEFAULT_LOOKS) {
    shot(l.id, l, l.expression);
    shot(l.id + '-shut', l, 'blink');
    shot(l.id + '-work', l, 'focused', l.id === 'zib' ? 'box' : l.id === 'mossy' ? 'magnifier' : l.id === 'pounce' ? 'tablet' : 'wrench');
  }
  const blip = DEFAULT_LOOKS.find((l) => l.id === 'blip')!;
  shot('clone', { ...blip, hat: undefined, body: '#6fe0d0' }, 'happy');
  const glorp = DEFAULT_LOOKS.find((l) => l.id === 'glorp')!;
  shot('glorp-q', glorp, 'shocked', undefined, 0);
  (window as any).__sprites = out;
}
