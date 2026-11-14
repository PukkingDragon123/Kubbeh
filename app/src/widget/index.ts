// Floating desktop widget.
//   1. Document Picture-in-Picture (Chrome/Edge 116+): a real always-on-top window that
//      stays visible over other apps.
//   2. A small popup window (other browsers, standalone only).
//   3. An in-page draggable mini widget (inside claude.ai artifacts, or if both are blocked).
import './widget.css';
import { h, render } from 'preact';
import { isArtifact, supportsPiP } from '../core/env';
import { sfx, toast } from '../core/bus';
import { actions } from '../ui/actions';
import { Widget } from './Widget';

let current: { win: Window; root: HTMLElement; kind: 'pip' | 'popup' | 'inpage' } | null = null;

function copyStyles(target: Document) {
  for (const sheet of [...document.styleSheets]) {
    try {
      const css = [...sheet.cssRules].map((r) => r.cssText).join('\n');
      const style = target.createElement('style');
      style.textContent = css;
      target.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = target.createElement('link');
        link.rel = 'stylesheet'; link.href = sheet.href;
        target.head.appendChild(link);
      }
    }
  }
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    const l = target.createElement('link'); l.rel = 'stylesheet'; l.href = link.href; target.head.appendChild(l);
  }
}

function home() {
  try { window.focus(); } catch { /* ignore */ }
  try { (window.opener as Window | null)?.focus(); } catch { /* ignore */ }
}

function mountInto(win: Window, kind: 'pip' | 'popup') {
  const doc = win.document;
  doc.title = 'GLOB LABS';
  copyStyles(doc);
  doc.documentElement.style.height = '100%';
  doc.body.style.cssText = 'margin:0;height:100%;overflow:hidden;background:#111a15';
  const root = doc.createElement('div');
  root.style.height = '100%';
  doc.body.appendChild(root);
  render(h(Widget, { win, onHome: home }), root);
  current = { win, root, kind };
  const cleanup = () => { try { render(null, root); } catch { /* window gone */ } if (current?.win === win) current = null; };
  win.addEventListener('pagehide', cleanup, { once: true });
  win.addEventListener('unload', cleanup, { once: true });
}

function mountInPage() {
  const root = document.createElement('div');
  root.className = 'glw-float';
  document.body.appendChild(root);
  const close = () => { render(null, root); root.remove(); current = null; sfx('panel_close', .4); };
  let drag: { x: number; y: number; l: number; t: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const r = root.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, l: r.left, t: r.top };
    root.style.right = 'auto'; root.style.bottom = 'auto';
    root.style.left = `${r.left}px`; root.style.top = `${r.top}px`;
    const move = (ev: PointerEvent) => {
      if (!drag) return;
      root.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, drag.l + ev.clientX - drag.x))}px`;
      root.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, drag.t + ev.clientY - drag.y))}px`;
    };
    const up = () => { drag = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  render(h(Widget, { win: window, onHome: close, onClose: close, dragHandle: onDown }), root);
  current = { win: window, root, kind: 'inpage' };
}

export async function openWidget() {
  if (current) {
    if (current.kind === 'inpage') { current.root.animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 300 }); return; }
    try { current.win.focus(); return; } catch { current = null; }
  }
  sfx('ufo', .4);
  if (supportsPiP()) {
    try {
      const pip = await window.documentPictureInPicture!.requestWindow({ width: 340, height: 250 });
      mountInto(pip, 'pip');
      toast('Lab widget is floating on top of your other apps', 'good', 'widget');
      return;
    } catch (err) { console.warn('[widget] PiP refused', err); }
  }
  if (!isArtifact()) {
    const w = window.open('', 'glob-labs-widget', 'popup,width=340,height=260');
    if (w) { mountInto(w, 'popup'); toast('Widget opened in a small window — keep it beside your other apps', 'info', 'widget'); return; }
  }
  mountInPage();
  if (isArtifact()) toast('This view can’t open a floating window, so the widget floats over the lab instead', 'info', 'widget');
}

actions.openWidget = openWidget;
