// World-owned DOM overlay: small plaques over busy / hovered aliens (in the user's own fonts),
// the hover label, and the Edit HQ toolbar with your unplaced inventory.
import { economy, editMode, placingItem, unplacedCount } from '../core/state';
import { CATALOG } from '../economy/catalog';
import { bus } from '../core/bus';

const CSS = `
.gl-ov{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;font-family:var(--font-display),ui-monospace,monospace}
.gl-tag{position:absolute;left:0;top:0;transform:translate(-50%,-100%);white-space:nowrap;padding:3px 8px 4px;border-radius:6px;
  background:linear-gradient(#1c262ce6,#0b100de6);color:#e8ffe6;font-size:11px;letter-spacing:.05em;box-shadow:inset 0 1px 0 #ffffff22,0 0 0 1.5px #52f2ff55,0 4px 12px #000a;transition:opacity .25s;max-width:240px;overflow:hidden;text-overflow:ellipsis}
.gl-tag b{color:#8cf56b;font-weight:600;margin-right:5px}
.gl-tag.idle{opacity:0}
.gl-tag.show{opacity:1}
.gl-hover{position:absolute;left:0;top:0;transform:translate(14px,14px);padding:5px 10px;border-radius:10px;background:#fbfff3;color:#142016;font-size:12px;
  letter-spacing:.04em;box-shadow:0 0 0 2.5px #142016,0 6px 0 #14201655;white-space:nowrap;opacity:0;transition:opacity .12s}
.gl-hover.on{opacity:1}
.gl-hover small{display:block;font-family:var(--font-body),system-ui,sans-serif;font-size:11px;color:#4a6a50;letter-spacing:0}
.gl-edit{position:fixed;left:50%;top:calc(64px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:5;pointer-events:auto;display:none;flex-direction:column;gap:8px;align-items:center;
  max-width:calc(100vw - 24px)}
.gl-edit.on{display:flex}
.gl-edit .bar{display:flex;gap:10px;align-items:center;padding:8px 14px;border-radius:16px;background:repeating-linear-gradient(-45deg,#ffbe3d 0 10px,#1a1408 10px 20px);box-shadow:0 8px 24px #000a}
.gl-edit .bar span{background:#0b100d;color:#ffd77a;padding:4px 10px;border-radius:9px;font-size:12px;letter-spacing:.06em}
.gl-edit .inv{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;padding:6px;border-radius:14px;background:#0b100de6;box-shadow:0 0 0 1.5px #ffffff18}
.gl-edit button{font-family:inherit;font-size:12px;border:0;border-radius:10px;padding:6px 10px;cursor:pointer;background:#2b3631;color:#e8ffe6;box-shadow:inset 0 1px 0 #ffffff30,0 3px 0 #1a211d}
.gl-edit button[aria-pressed=true]{background:#8cf56b;color:#062a08}
.gl-edit button.done{background:#8cf56b;color:#062a08}
.gl-edit .hint{font-family:var(--font-body),system-ui,sans-serif;font-size:11px;color:#a9c9af;padding:3px 9px;background:#0b100dd9;border-radius:8px}
`;

export class Overlay {
  root: HTMLDivElement;
  private tags = new Map<string, HTMLDivElement>();
  private hoverEl: HTMLDivElement;
  private edit: HTMLDivElement;
  private inv: HTMLDivElement;
  constructor(private api: { rotate(): void; remove(): void }) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.root = document.createElement('div'); this.root.className = 'gl-ov';
    this.hoverEl = document.createElement('div'); this.hoverEl.className = 'gl-hover';
    this.root.appendChild(this.hoverEl);
    document.body.insertBefore(this.root, document.getElementById('app'));
    this.edit = document.createElement('div'); this.edit.className = 'gl-edit';
    this.edit.innerHTML = `<div class="bar"><span>EDIT HQ</span><button data-a="rot">Rotate (R)</button><button data-a="del">Pack away (Del)</button><button class="done" data-a="done">Done</button></div><div class="inv"></div><div class="hint">Pick an item, then click the floor. Click placed furniture to move it.</div>`;
    this.inv = this.edit.querySelector('.inv') as HTMLDivElement;
    this.edit.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button'); if (!b) return;
      const a = b.dataset.a, item = b.dataset.item;
      bus.emit('sfx', { name: 'click', volume: 0.5 });
      if (a === 'rot') this.api.rotate();
      else if (a === 'del') this.api.remove();
      else if (a === 'done') { editMode.value = false; placingItem.value = null; }
      else if (item) placingItem.value = placingItem.value === item ? null : item;
    });
    document.body.appendChild(this.edit);
    const refresh = () => this.renderInv();
    economy.subscribe(refresh); placingItem.subscribe(refresh);
    editMode.subscribe((on) => { this.edit.classList.toggle('on', on); refresh(); });
  }

  private renderInv() {
    if (!editMode.value) return;
    const items = CATALOG.filter((i) => i.placeable && unplacedCount(i.id) > 0);
    this.inv.innerHTML = items.length
      ? items.map((i) => `<button data-item="${i.id}" aria-pressed="${placingItem.value === i.id}">${i.name} ×${unplacedCount(i.id)}</button>`).join('')
      : `<span class="hint">Nothing in storage — buy furniture at the GENE-O-MAT, then place it here.</span>`;
  }

  hover(text: string | null, sub: string | null, x: number, y: number) {
    if (!text) { this.hoverEl.classList.remove('on'); return; }
    this.hoverEl.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    this.hoverEl.style.left = `${x}px`; this.hoverEl.style.top = `${y}px`;
    this.hoverEl.classList.add('on');
  }

  tagsUpdate(list: { id: string; name: string; label: string; x: number; y: number; visible: boolean; busy: boolean; hovered: boolean }[]) {
    const seen = new Set<string>();
    for (const t of list) {
      seen.add(t.id);
      let el = this.tags.get(t.id);
      if (!el) { el = document.createElement('div'); el.className = 'gl-tag'; this.root.appendChild(el); this.tags.set(t.id, el); }
      const html = `<b>${escapeHtml(t.name)}</b>${t.busy || t.hovered ? escapeHtml(t.label) : ''}`;
      if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
      el.style.left = `${t.x}px`; el.style.top = `${t.y}px`;
      el.classList.toggle('show', t.visible && (t.busy || t.hovered));
      el.classList.toggle('idle', !(t.visible && (t.busy || t.hovered)));
    }
    for (const [id, el] of this.tags) if (!seen.has(id)) { el.remove(); this.tags.delete(id); }
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
