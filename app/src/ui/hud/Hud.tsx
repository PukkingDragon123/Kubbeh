import { useState } from 'preact/hooks';
import { accounts, activeAccount, crew, economy, fuel, openPanelId, patchSettings, setPanel, settings, switchAccount } from '../../core/state';
import { isBusy } from '../../core/crew';
import { sfx } from '../../core/bus';
import { fmtUsd, fmtTokens } from '../../core/util';
import { Icon } from '../common/icons';
import { Btn } from '../common/kit';
import { actions } from '../actions';

function FuelMini() {
  const f = fuel.value;
  const pct = Math.round(f.level * 100);
  const color = f.tier === 'full' ? 'var(--glob)' : f.tier === 'half' ? 'var(--cyan)' : f.tier === 'quarter' ? 'var(--amber)' : 'var(--red)';
  const blink = f.tier === 'critical' || f.tier === 'empty';
  return (
    <button type="button" class="btn ghost sm pe" style={{ gap: '8px', paddingRight: '10px' }} title={`Fuel ${pct}% — ${f.source}`} onClick={() => setPanel(openPanelId.value === 'fuel' ? null : 'fuel')}>
      <span style={{ color }}><Icon name="fuel" size="sm" /></span>
      <span style={{ position: 'relative', width: '76px', height: '12px', borderRadius: '6px', background: '#050a07', boxShadow: 'inset 0 2px 4px #000c', overflow: 'hidden' }}>
        <i style={{ position: 'absolute', inset: '0 auto 0 0', width: `${pct}%`, background: color, boxShadow: `0 0 10px ${color}`, transition: 'width .6s', animation: blink ? 'blink-warn .8s steps(1) infinite' : undefined }} />
        {[50, 25, 10].map((m) => <b key={m} style={{ position: 'absolute', left: `${m}%`, top: 0, bottom: 0, width: '1px', background: '#ffffff55' }} />)}
      </span>
      <span class="tnum px" style={{ color, fontSize: '12px', minWidth: '34px', textAlign: 'right' }}>{pct}%</span>
    </button>
  );
}

function Genes() {
  const e = economy.value;
  return (
    <button type="button" class="btn ghost sm pe" title={`${e.balance} Gene Points — spend them in the Shop`} onClick={() => setPanel(openPanelId.value === 'shop' ? null : 'shop')}>
      <span class="glow-g"><Icon name="dna" size="sm" /></span>
      <span class="tnum px glow-g" style={{ fontSize: '13px' }}>{e.balance.toLocaleString()}</span>
    </button>
  );
}

function AccountSwitch() {
  const [open, setOpen] = useState(false);
  const a = activeAccount.value;
  return (
    <div class="pe" style={{ position: 'relative' }}>
      <button type="button" class="btn ghost sm" onClick={() => { sfx('click', .5); setOpen(!open); }} title="Switch Claude account">
        <span class="dot" style={{ color: a?.color ?? 'var(--text-3)' }} />
        <span class="ellipsis hide-sm" style={{ maxWidth: '120px' }}>{a?.name ?? 'No account'}</span>
        <Icon name="user" size="sm" />
      </button>
      {open && (
        <div class="card col gap-4" style={{ position: 'absolute', top: '40px', right: 0, width: '250px', zIndex: 30, animation: 'pop-in .25s var(--ease-jelly)' }} onMouseLeave={() => setOpen(false)}>
          <div class="up dim" style={{ padding: '2px 6px' }}>Claude accounts</div>
          {accounts.value.map((acc) => (
            <button type="button" class="li" key={acc.id} aria-current={acc.id === a?.id} onClick={() => { sfx('select', .5); void switchAccount(acc.id); setOpen(false); }}>
              <span class="dot" style={{ color: acc.color }} />
              <span class="grow ellipsis">{acc.name}</span>
              <span class="chip" style={{ height: '20px' }}>{acc.kind === 'api' ? 'API' : 'claude.ai'}</span>
            </button>
          ))}
          <div class="divider" />
          <Btn size="sm" tone="ghost" icon="plus" onClick={() => { setOpen(false); setPanel('accounts'); }}>Link / manage accounts</Btn>
        </div>
      )}
    </div>
  );
}

function CrewTicker() {
  const busy = crew.value.filter(isBusy);
  if (!busy.length) return <div class="dim hide-sm" style={{ fontSize: '12px' }}>Crew idle · {crew.value.length} aliens on shift</div>;
  const m = busy[busy.length - 1];
  return (
    <div class="row hide-sm" style={{ fontSize: '12px', minWidth: 0 }} title={busy.map((b) => `${b.name}: ${b.label}`).join('\n')}>
      <span class="dot pulse" style={{ color: 'var(--glob)' }} />
      <span class="ellipsis"><b class="glow-g">{m.name}</b> <span class="dim">{m.label}</span></span>
      {busy.length > 1 && <span class="chip g" style={{ height: '20px' }}>+{busy.length - 1}</span>}
    </div>
  );
}

export function Hud() {
  const s = settings.value;
  const f = fuel.value;
  return (
    <header class="hud">
      <div class="logo pe" role="button" tabIndex={0} onClick={() => { sfx('boing', .6); setPanel(null); }} title="Back to the lab">
        <Icon name="alien" size="lg" /> GLOB<b>LABS</b>
      </div>
      <div class="grow row" style={{ justifyContent: 'center', minWidth: 0 }}><CrewTicker /></div>
      <span class="dim tnum hide-sm" style={{ fontSize: '11px' }} title={f.source}>{f.budget.mode === 'usd' ? fmtUsd(f.spentUsd) : fmtTokens(f.spentTokens) + ' tok'}{f.estimated ? ' est.' : ''}</span>
      <FuelMini />
      <Genes />
      <AccountSwitch />
      <Btn class="pe hide-sm" size="sm" tone="ghost" iconOnly icon="widget" title="Pop out the floating lab widget" onClick={() => void actions.openWidget()} />
      <Btn class="pe" size="sm" tone="ghost" iconOnly icon={s.muted ? 'mute' : 'sound'} title={s.muted ? 'Unmute' : 'Mute'} onClick={() => patchSettings({ muted: !s.muted })} />
    </header>
  );
}
