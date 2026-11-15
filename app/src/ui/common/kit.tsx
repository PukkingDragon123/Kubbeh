// GLOB LABS UI kit — the jelly-industrial component set every panel builds with.
import type { ComponentChildren } from 'preact';
import type { CSSProperties } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Icon, iconURL, type IconName } from './icons';
import { sfx } from '../../core/bus';

type Tone = 'glob' | 'pink' | 'cyan' | 'amber' | 'danger' | 'ghost' | '';

export function Btn(props: {
  children?: ComponentChildren; onClick?: (e: MouseEvent) => void; tone?: Tone; size?: 'sm' | 'lg';
  icon?: IconName; iconOnly?: boolean; round?: boolean; block?: boolean; disabled?: boolean; title?: string;
  type?: 'button' | 'submit'; class?: string; badge?: string | number; silent?: boolean; style?: CSSProperties;
}) {
  const cls = ['btn', props.tone ?? '', props.size ?? '', props.iconOnly ? 'icon' : '', props.round ? 'round' : '', props.block ? 'block' : '', props.class ?? ''].join(' ');
  return (
    <button
      type={props.type ?? 'button'} class={cls} disabled={props.disabled} title={props.title} aria-label={props.iconOnly ? props.title : undefined} style={props.style}
      onClick={(e) => { if (!props.silent) sfx('click', 0.5, 0.95 + Math.random() * 0.15); props.onClick?.(e as unknown as MouseEvent); }}
      onMouseEnter={() => !props.silent && sfx('hover', 0.12)}
    >
      {props.icon && <Icon name={props.icon} size={props.size === 'lg' ? 'lg' : props.size === 'sm' ? 'sm' : undefined} />}
      {!props.iconOnly && props.children}
      {props.badge !== undefined && props.badge !== 0 && props.badge !== '' && <span class="badge">{props.badge}</span>}
    </button>
  );
}

/** Hull-steel housing: bevelled frame, voxel corner brackets, hazard channel, voxel close button. */
export function Win(props: {
  title: ComponentChildren; icon?: IconName; onClose?: () => void; children: ComponentChildren;
  actions?: ComponentChildren; class?: string; style?: CSSProperties; bodyClass?: string;
}) {
  return (
    <section class={`win ${props.class ?? ''}`} style={props.style} role="dialog" aria-label={typeof props.title === 'string' ? props.title : undefined}>
      <i class="win-corner tl" aria-hidden="true" /><i class="win-corner tr" aria-hidden="true" />
      <i class="win-corner bl" aria-hidden="true" /><i class="win-corner br" aria-hidden="true" />
      <header class="win-bar">
        <h2 class="win-title">{props.icon && <Icon name={props.icon} size="lg" />}<span class="ellipsis">{props.title}</span></h2>
        <div class="win-hazard" aria-hidden="true" />
        {props.actions}
        {props.onClose && (
          <button type="button" class="win-close" title="Close (Esc)" aria-label="Close"
            onMouseEnter={() => sfx('hover', 0.12)} onClick={() => { sfx('click', 0.5); props.onClose!(); }}>
            <Icon name="close" size="xl" />
          </button>
        )}
      </header>
      <div class={`win-body ${props.bodyClass ?? ''}`}>{props.children}</div>
    </section>
  );
}

export function Toggle({ value, onChange, label, id }: { value: boolean; onChange: (v: boolean) => void; label?: string; id?: string }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={value} aria-label={label} class="toggle"
      onClick={() => { sfx('toggle', 0.5, value ? 0.9 : 1.1); onChange(!value); }} />
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ComponentChildren; title?: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div class="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.value} title={o.title} aria-pressed={o.value === value} onClick={() => { sfx('tab', 0.4); onChange(o.value); }}>{o.label}</button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: { id: T; label: ComponentChildren; icon?: IconName; badge?: number }[]; onChange: (v: T) => void }) {
  return (
    <div class="tabs" role="tablist">
      {tabs.map((t) => (
        <button type="button" role="tab" key={t.id} class="tab" aria-selected={t.id === value} onClick={() => { sfx('tab', 0.4); onChange(t.id); }}>
          {t.icon && <Icon name={t.icon} size="sm" />}{t.label}{t.badge ? <span class="chip g" style={{ height: '18px', padding: '0 6px' }}>{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function SettingRow({ title, hint, children }: { title: ComponentChildren; hint?: ComponentChildren; children: ComponentChildren }) {
  return (
    <div class="row between gap-16" style={{ padding: '10px 2px', flexWrap: 'wrap' }}>
      <div class="col gap-4" style={{ flex: '1 1 220px' }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        {hint && <div class="dim" style={{ fontSize: 'var(--fs-sm)' }}>{hint}</div>}
      </div>
      <div class="row">{children}</div>
    </div>
  );
}

export function Meter({ value, tone }: { value: number; tone?: 'warn' | 'crit' }) {
  return <div class={`meter ${tone ?? ''}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}><i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>;
}

export function Empty({ icon = 'alien', title, children }: { icon?: IconName; title: string; children?: ComponentChildren }) {
  const url = iconURL(icon, 96);
  return (
    <div class="empty">
      {url ? <img class="ico vx" src={url} width={96} height={96} alt="" aria-hidden="true" draggable={false} /> : <Icon name={icon} size="xl" />}
      <h3>{title}</h3>
      {children}
    </div>
  );
}

// ── modal confirm (alert/confirm/prompt are blocked inside claude.ai artifacts) ──
type ConfirmReq = { title: string; body?: ComponentChildren; ok?: string; danger?: boolean; input?: string; resolve: (v: string | boolean | null) => void };
const confirmReq = signal<ConfirmReq | null>(null);

export function confirmBox(title: string, body?: ComponentChildren, opts: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => { confirmReq.value = { title, body, ...opts, resolve: (v) => resolve(!!v) }; });
}
export function promptBox(title: string, initial = '', body?: ComponentChildren): Promise<string | null> {
  return new Promise((resolve) => { confirmReq.value = { title, body, input: initial, ok: 'Save', resolve: (v) => resolve(typeof v === 'string' ? v : null) }; });
}

export function ModalHost() {
  const req = confirmReq.value;
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (req) { setText(req.input ?? ''); setTimeout(() => inputRef.current?.focus(), 30); } }, [req]);
  if (!req) return null;
  const done = (v: string | boolean | null) => { confirmReq.value = null; req.resolve(v); };
  return (
    <div class="modal-back" onClick={(e) => { if (e.target === e.currentTarget) done(null); }} onKeyDown={(e) => { if (e.key === 'Escape') done(null); }}>
      <Win title={req.title} icon={req.danger ? 'warn' : 'alien'} onClose={() => done(null)}>
        <form class="col gap-12" style={{ padding: '4px 8px 8px' }} onSubmit={(e) => { e.preventDefault(); done(req.input !== undefined ? text : true); }}>
          {req.body && <div class="dim">{req.body}</div>}
          {req.input !== undefined && <input ref={inputRef} id="modal-input" class="field" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} />}
          <div class="row" style={{ justifyContent: 'flex-end' }}>
            <Btn tone="ghost" onClick={() => done(null)}>Cancel</Btn>
            <Btn type="submit" tone={req.danger ? 'danger' : 'glob'}>{req.ok ?? 'OK'}</Btn>
          </div>
        </form>
      </Win>
    </div>
  );
}

/** Copy with graceful fallback (clipboard can be refused inside some app views). */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch { return false; }
  }
}
