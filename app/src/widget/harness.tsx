// DEV ONLY (not part of the app build): renders one feature panel standalone so it can be
// checked while the rest of the app is being rebuilt. /src/widget/harness.html?panel=shop
import '../ui/styles.css';
import * as THREE from 'three';
// dev-only: alien roots keep a circular userData.alienParts that breaks Object3D.copy's JSON
// deep-copy; strip it during copies so in-progress UI code that clones aliens can render.
const origCopy = THREE.Object3D.prototype.copy;
THREE.Object3D.prototype.copy = function (this: THREE.Object3D, source: THREE.Object3D, recursive?: boolean) {
  const ud = source.userData as any; const parts = ud?.alienParts;
  if (parts) delete ud.alienParts;
  try { return origCopy.call(this, source as any, recursive); } finally { if (parts) ud.alienParts = parts; }
} as any;
import { render, h } from 'preact';
import { loadState, setPanel } from '../core/state';
import { startCrewDirector } from '../core/crew';
import '../economy';
import { Shop } from '../ui/shop/Shop';
import { SlotPanel } from '../ui/shop/Slot';
import { ArcadePanel } from '../ui/shop/Arcade';
import { AchievementsPanel } from '../ui/shop/Achievements';
import { IdeaLab } from '../ui/idea/IdeaLab';
import { Widget } from './Widget';
import '../ui/shop/shop.css';
import '../ui/idea/idea.css';
import './widget.css';
import { ModalHost } from '../ui/common/kit';

const C: Record<string, any> = { shop: Shop, slot: SlotPanel, arcade: ArcadePanel, achievements: AchievementsPanel, idea: IdeaLab };

(async () => {
  await loadState();
  startCrewDirector();
  const q = new URLSearchParams(location.search);
  const panel = q.get('panel') ?? 'shop';
  (window as any).__h = { setPanel };
  const el = document.getElementById('app')!;
  if (panel === 'widget') {
    el.style.cssText = 'position:fixed;left:12px;top:12px;width:360px;height:270px;border-radius:16px;overflow:hidden';
    render(h(Widget, { win: window, onHome: () => {} }), el);
  } else {
    render(h('div', { style: 'display:grid;place-items:center;height:100%' }, h('div', { style: 'width:100%;height:100%;max-width:1180px;display:flex' }, h(C[panel], { arg: null, close: () => {} })), h(ModalHost, {})), el);
  }
  document.getElementById('boot')?.remove();
  (window as any).__ready = true;
})();
