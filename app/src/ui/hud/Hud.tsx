// Top HUD: neon logo, a slim crew plaque, and a row of small floating voxel objects —
// gene capsule (with its count on a brass plaque), account ID card, edit-HQ wrench,
// pop-out widget, speaker, settings gear. Numbers live only on plaques.
import { useRef, useState } from 'preact/hooks';
import { accounts, activeAccount, crew, economy, editMode, openPanelId, patchSettings, setPanel, settings, switchAccount } from '../../core/state';
import { isBusy } from '../../core/crew';
import { sfx } from '../../core/bus';
import { Icon } from '../common/icons';
import { Btn } from '../common/kit';
import { actions } from '../actions';
import { useStageObject } from './stage';
import { geneCapsule, idCard } from '../../vox/ui/hudmodels';
import { buildIcon } from '../../vox/ui/icons';
import type { StageItem } from '../../vox/ui/stage';

function Obj({ label, icon, build, onClick, pressed, wide, children, deps = [], spin }: {
  label: string; icon?: string; build?: () => import('three').Object3D; onClick: () => void; pressed?: boolean; wide?: boolean;
  children?: preact.ComponentChildren; deps?: unknown[]; spin?: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const it = useRef<StageItem | null>(null);
  useStageObject(ref, () => ({ obj: build ? build() : buildIcon(icon!), opts: { fit: 1.12, yaw: -0.4, pitch: 0.2, bob: 1.5, spin }, onItem: (i) => (it.current = i) }), [icon, ...deps]);
  return (
    <button ref={ref} type="button" class={`hud-obj pe ${wide ? 'wide' : ''}`} aria-label={label} aria-pressed={pressed}
      onMouseEnter={() => sfx('hover', 0.15)}
      onClick={() => { sfx('click', 0.5); if (it.current) it.current.sqV += 8; onClick(); }}>
      <span class="tip plaque steel">{label}</span>
      {children}
    </button>
  );
}

function Genes() {
  const e = economy.value;
  return (
    <Obj label={`${e.balance.toLocaleString()} Gene Points · Shop`} build={geneCapsule} onClick={() => setPanel(openPanelId.value === 'shop' ? null : 'shop')}>
      <span class="hud-num plaque glow tnum">{e.balance.toLocaleString()}</span>
    </Obj>
  );
}

function Account() {
  const [open, setOpen] = useState(false);
  const a = activeAccount.value;
  return (
    <div class="pe" style={{ position: 'relative' }} onMouseLeave={() => setOpen(false)}>
      <Obj label={a ? `${a.name} · switch account` : 'Link a Claude account'} wide build={() => idCard(a?.color ?? '#6f8596')} deps={[a?.color]} onClick={() => setOpen(!open)} />
      {open && (
        <div class="card col gap-4 acct-menu">
          <div class="up dim" style={{ padding: '2px 6px' }}>Claude accounts</div>
          {accounts.value.map((acc) => (
            <button type="button" class="li" key={acc.id} aria-current={acc.id === a?.id} onClick={() => { sfx('select', .5); void switchAccount(acc.id); setOpen(false); }}>
              <span class="dot" style={{ color: acc.color }} />
              <span class="grow ellipsis">{acc.name}</span>
              <span class="chip" style={{ height: '20px' }}>{acc.kind === 'api' ? 'API' : 'claude.ai'}</span>
            </button>
          ))}
          <div class="divider" />
          <Btn size="sm" tone="ghost" icon="plus" onClick={() => { setOpen(false); setPanel('accounts'); }}>Link / manage</Btn>
        </div>
      )}
    </div>
  );
}

function CrewPlaque() {
  const busy = crew.value.filter(isBusy);
  const m = busy[busy.length - 1];
  return (
    <div class="crew-plaque hide-sm" title={busy.map((b) => `${b.name}: ${b.label}`).join('\n') || 'Crew idle'}>
      <Icon name="alien" size="lg" />
      {m ? (
        <span class="ellipsis"><b class="glow-g" style={{ fontWeight: 400 }}>{m.name}</b> <span class="dim">{m.label}</span>{busy.length > 1 && <span class="chip g" style={{ height: '20px', marginLeft: '6px' }}>+{busy.length - 1}</span>}</span>
      ) : <span class="dim">{crew.value.length} aliens on shift</span>}
    </div>
  );
}

export function Hud() {
  const s = settings.value;
  return (
    <header class="hud">
      <div class="logo pe" role="button" tabIndex={0} onClick={() => { sfx('boing', .6); setPanel(null); }} onKeyDown={(e) => { if (e.key === 'Enter') setPanel(null); }} title="Back to the lab">
        GLOB<b>LABS</b>
      </div>
      <div class="grow row" style={{ justifyContent: 'center', minWidth: 0 }}><CrewPlaque /></div>
      <div class="hud-top">
        <Genes />
        <Account />
        <Obj label={editMode.value ? 'Done editing (E)' : 'Rearrange HQ (E)'} icon="wrench" pressed={editMode.value} onClick={() => { editMode.value = !editMode.value; if (editMode.value) setPanel(null); }} />
        <span class="hide-sm" style={{ display: 'contents' }}>
          <Obj label="Pop-out lab widget" icon="widget" onClick={() => void actions.openWidget()} />
        </span>
        <Obj label={s.muted ? 'Unmute' : 'Mute'} icon={s.muted ? 'mute' : 'sound'} onClick={() => patchSettings({ muted: !s.muted })} />
        <Obj label="Settings (,)" icon="gear" onClick={() => setPanel(openPanelId.value === 'settings' ? null : 'settings')} />
      </div>
    </header>
  );
}
