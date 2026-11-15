// Dev lab for the UI worker: /?voxlab=ui:icons — every voxel icon + HUD hero models.
import { iconNames, iconURL } from '../ui/common/icons';
import { photoURL } from '../vox/studio';
import { holoComputer, geneCapsule, idCard, geneOMat, glorpFigure } from '../vox/ui/hudmodels';
import { FuelTank } from '../vox/ui/tank';
import '../ui/styles.css';

export function run(mode: string) {
  const app = document.getElementById('app')!;
  if (mode === 'tank') {
    (document.getElementById('world') as HTMLElement).style.display = 'none';
    app.style.cssText += ';pointer-events:auto;display:flex;gap:8px;padding:12px;background:#0b111a';
    const levels: [number, any][] = [[0.9, 'full'], [0.42, 'half'], [0.2, 'quarter'], [0.06, 'critical']];
    for (const [lv, tier] of levels) {
      const t = new FuelTank();
      for (let i = 0; i < 80; i++) t.update(0.05, 1 + i * 0.05, lv, tier);
      const img = document.createElement('img'); img.src = photoURL(t.root, 340, 420, { yaw: -0.35, pitch: 0.16, fill: 0.95 }); img.width = 340; img.height = 420;
      app.append(img);
    }
    (window as any).__voxlabDone = true;
    return;
  }
  (document.getElementById('world') as HTMLElement).style.display = 'none';
  app.style.pointerEvents = 'auto';
  app.style.overflow = 'auto';
  app.style.padding = '18px';
  app.style.background = 'radial-gradient(circle at 50% 30%, #13202b, #070b11 70%)';
  const size = mode === 'small' ? 32 : 96;
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px;';
  for (const n of iconNames) {
    const cell = document.createElement('div');
    cell.style.cssText = 'display:grid;justify-items:center;gap:4px;padding:8px;border-radius:12px;background:#ffffff08;box-shadow:inset 0 0 0 1px #ffffff12;font:12px NanoPlus,monospace;color:#a9bdcc';
    const img = document.createElement('img'); img.src = iconURL(n, size); img.width = size; img.height = size; img.style.imageRendering = 'pixelated';
    cell.append(img, n);
    grid.append(cell);
  }
  app.append(grid);
  const heroes = document.createElement('div');
  heroes.style.cssText = 'display:flex;flex-wrap:wrap;gap:14px;margin-top:16px;';
  const tank = new FuelTank(); tank.update(0.016, 1, 0.22, 'quarter');
  for (let i = 0; i < 60; i++) tank.update(0.05, 1 + i * 0.05, 0.22, 'quarter');
  const models: [string, import('three').Object3D][] = [
    ['computer', holoComputer()], ['glorp', glorpFigure().root], ['gene-o-mat', geneOMat(1.4)], ['fuel tank', tank.root], ['capsule', geneCapsule()], ['id card', idCard('#ff7ad9')],
  ];
  for (const [n, o] of models) {
    const img = document.createElement('img'); img.src = photoURL(o, 220, 220, { yaw: -0.45, pitch: 0.2, fill: 0.92 }); img.width = 220; img.height = 220;
    img.title = n; img.style.cssText = 'background:#ffffff06;border-radius:16px';
    heroes.append(img);
  }
  app.append(heroes);
  (window as any).__tank = tank;
  (window as any).__voxlabDone = true;
  (window as any).__voxlab = true;
}
