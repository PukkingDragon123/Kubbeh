// Fuel tank station: the big glass tank, where its numbers come from, and what Auto-Saver does.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { FuelTank } from '../../vox/ui/tank';
import { MiniView } from '../../vox/ui/miniview';
import type { FuelBudget } from '../../core/types';
import { activeAccount, fuel, patchSettings, rateLimit, settings, updateAccount, usageLog } from '../../core/state';
import { sfx } from '../../core/bus';
import { fmtTokens, fmtUsd } from '../../core/util';
import { Btn, Meter, Seg, SettingRow, Toggle, Win } from '../common/kit';
import { Icon } from '../common/icons';
import { modelInfo } from '../../claude/models';
import { fetchOrgSpend, fullPolicy, orgSpend, periodStart, TIER_LABEL, TIER_RULES } from '../../claude/fuel';

/** The big live 3D voxel tank (same machine as the HUD's FUEL button). Drag to turn it. */
function Tank({ level, tier }: { level: number; tier: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let view: MiniView | null = null;
    try {
      const tank = new FuelTank();
      view = new MiniView(ref.current, tank.root, (t, dt) => { const f = fuel.value; tank.update(dt, t, f.level, f.tier); }, { fill: 0.94, interactive: true });
    } catch (err) { console.warn('[fuel] 3D tank unavailable', err); }
    return () => view?.dispose();
  }, []);
  const pct = Math.round(level * 100);
  const tone = tier === 'full' ? 'glow' : tier === 'half' ? 'steel' : tier === 'quarter' ? 'warn' : 'crit';
  return (
    <div class="fuel-tank3d" role="img" aria-label={`Fuel ${pct} percent`}>
      <canvas ref={ref} />
      <div class="fuel-marks" aria-hidden="true">{[50, 25, 10].map((m) => <span key={m} class={`plaque ${level * 100 <= m ? (m === 10 ? 'crit' : m === 25 ? 'warn' : 'steel') : 'steel'}`}>{m}%</span>)}</div>
      <span class={`plaque ${tone} fuel-pct tnum`}>{pct}%</span>
    </div>
  );
}

function BudgetEditor() {
  const acc = activeAccount.value;
  if (!acc) return null;
  const b = acc.budget;
  const set = (patch: Partial<FuelBudget>) => updateAccount(acc.id, { budget: { ...b, ...patch } });
  return (
    <div class="col gap-8">
      <div class="row wrap gap-12">
        <Seg<FuelBudget['mode']> value={b.mode} onChange={(m) => set({ mode: m, amount: m === 'usd' ? 20 : 2_000_000 })} options={[{ value: 'usd', label: '$ spend' }, { value: 'tokens', label: 'Tokens' }]} />
        <Seg<FuelBudget['period']> value={b.period} onChange={(p) => set({ period: p })} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
      </div>
      <label class="row gap-8"><span class="label">Tank size</span>
        <input class="field tnum" id="fuel-amount" type="number" min={b.mode === 'usd' ? 0.5 : 10000} step={b.mode === 'usd' ? 1 : 100000} style={{ maxWidth: '160px' }} value={b.amount}
          onChange={(e) => { const v = Number((e.target as HTMLInputElement).value); if (v > 0) { set({ amount: v }); sfx('tick', .4); } }} />
        <span class="dim">{b.mode === 'usd' ? 'USD' : 'tokens'} per {b.period}</span>
      </label>
    </div>
  );
}

export function FuelPanel({ close }: { arg: unknown; close: () => void }) {
  const f = fuel.value;
  const acc = activeAccount.value;
  const s = settings.value;
  const pol = fullPolicy();
  const [adminKey, setAdminKey] = useState(acc?.adminKey ?? '');
  const recs = useMemo(() => usageLog.value.filter((r) => r.accountId === acc?.id), [usageLog.value, acc?.id]);
  const start = periodStart(f.budget.period);
  const inPeriod = recs.filter((r) => r.ts >= start);

  const days = useMemo(() => {
    const out: { label: string; usd: number; tok: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const e = d.getTime() + 86400_000;
      const rs = recs.filter((r) => r.ts >= d.getTime() && r.ts < e);
      out.push({ label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), usd: rs.reduce((x, r) => x + r.costUsd, 0), tok: rs.reduce((x, r) => x + r.input + r.output + r.cacheRead + r.cacheWrite, 0) });
    }
    return out;
  }, [recs]);
  const usd = f.budget.mode === 'usd';
  const maxDay = Math.max(...days.map((d) => (usd ? d.usd : d.tok)), usd ? 0.01 : 1);

  const by = (key: 'model' | 'source') => {
    const m = new Map<string, { usd: number; tok: number }>();
    for (const r of inPeriod) { const k = String(r[key]); const v = m.get(k) ?? { usd: 0, tok: 0 }; v.usd += r.costUsd; v.tok += r.input + r.output + r.cacheRead + r.cacheWrite; m.set(k, v); }
    return [...m.entries()].sort((a, b) => (usd ? b[1].usd - a[1].usd : b[1].tok - a[1].tok));
  };
  const cacheSaved = inPeriod.reduce((x, r) => x + (r.cacheRead * (modelInfo(r.model).input - modelInfo(r.model).cacheRead)) / 1e6, 0);
  const cacheRead = inPeriod.reduce((x, r) => x + r.cacheRead, 0);
  const rl = rateLimit.value;
  const org = acc ? orgSpend.value[acc.id] : undefined;

  return (
    <Win title="FUEL TANK" icon="fuel" onClose={close}>
      <div class="fuel-grid scroll">
        <div class="col gap-12 fuel-left">
          <Tank level={f.level} tier={f.tier} />
          <div class={`chip ${f.tier === 'full' ? 'g' : f.tier === 'half' ? 'c' : f.tier === 'quarter' ? 'a' : 'r'}`} style={{ alignSelf: 'center' }}>{TIER_LABEL[f.tier]}</div>
          <div class="dim ws-small" style={{ textAlign: 'center' }}>{f.source}</div>
        </div>
        <div class="col gap-16 fuel-right">
          <div class="ws-stats">
            <div class="card ws-stat"><b class="px glow-g tnum">{usd ? fmtUsd(f.spentUsd) : fmtTokens(f.spentTokens)}</b><span class="dim">used this {f.budget.period}{f.estimated ? ' (est.)' : ''}</span></div>
            <div class="card ws-stat"><b class="px glow-c tnum">{usd ? fmtUsd(Math.max(0, f.budget.amount - f.spentUsd)) : fmtTokens(Math.max(0, f.budget.amount - f.spentTokens))}</b><span class="dim">left in tank</span></div>
            <div class="card ws-stat"><b class="px glow-p tnum">{fmtUsd(cacheSaved)}</b><span class="dim">saved by caching ({fmtTokens(cacheRead)} tok)</span></div>
            <div class="card ws-stat"><b class="px glow-a tnum">{inPeriod.length}</b><span class="dim">Claude calls</span></div>
          </div>

          <section class="card col gap-8">
            <h3 class="ws-h3">Tank size · {acc?.name ?? 'no account'}</h3>
            <BudgetEditor />
          </section>

          <section class="card col gap-8">
            <h3 class="ws-h3">Last 14 days</h3>
            <div class="fuel-bars" role="img" aria-label="Daily usage, last 14 days">
              {days.map((d, i) => { const v = usd ? d.usd : d.tok; return (
                <div class="fuel-bar" key={i} title={`${usd ? fmtUsd(d.usd) : fmtTokens(d.tok) + ' tokens'}`}>
                  <i style={{ height: `${Math.max(2, (v / maxDay) * 100)}%`, opacity: v ? 1 : 0.25 }} /><span>{d.label}</span>
                </div>
              ); })}
            </div>
            <div class="row wrap gap-16">
              {(['model', 'source'] as const).map((k) => (
                <div class="col gap-4 grow" key={k} style={{ minWidth: '200px' }}>
                  <span class="label">By {k}</span>
                  {by(k).map(([name, v]) => (
                    <div class="row between ws-small" key={name}><span class="ellipsis">{k === 'model' ? modelInfo(name).short : name}</span><span class="tnum dim">{usd ? fmtUsd(v.usd) : fmtTokens(v.tok)}</span></div>
                  ))}
                  {!by(k).length && <span class="dimmer ws-small">No usage this period</span>}
                </div>
              ))}
            </div>
          </section>

          <section class="card col gap-8">
            <div class="row between"><h3 class="ws-h3">Auto-Saver</h3><Toggle value={s.autoSaver} onChange={(v) => patchSettings({ autoSaver: v })} label="Auto-Saver" /></div>
            <div class="dim ws-small">When the tank crosses a marker, warning lights flash and the lab automatically spends less: lower thinking effort, fewer clones, terser answers, earlier compaction.{pol.reasons.length ? ` Active now: ${pol.reasons.join(', ')}.` : ''}</div>
            <div class="fuel-table" role="table">
              <div class="fuel-tr head" role="row"><span>Tank</span><span>Effort</span><span>Clones</span><span>Caveman</span><span>Compaction</span></div>
              {TIER_RULES.map((r) => (
                <div class={`fuel-tr ${r.tier === f.tier ? 'on' : ''}`} role="row" key={r.tier}>
                  <span>{TIER_LABEL[r.tier]}</span><span>{r.effort}</span><span>{r.clones}</span><span>{r.caveman}</span><span>{r.compact}</span>
                </div>
              ))}
            </div>
          </section>

          {rl && (
            <section class="card col gap-8">
              <h3 class="ws-h3">Rate-limit headroom <span class="dimmer ws-small">(live response headers)</span></h3>
              {([['Requests', rl.requestsRemaining, rl.requestsLimit], ['Tokens', rl.tokensRemaining, rl.tokensLimit], ['Input tokens', rl.inputTokensRemaining, rl.inputTokensLimit], ['Output tokens', rl.outputTokensRemaining, rl.outputTokensLimit]] as const).filter(([, r, l]) => r !== undefined && l).map(([n, r, l]) => (
                <div class="col gap-4" key={n}><div class="row between ws-small"><span>{n}</span><span class="tnum dim">{fmtTokens(r!)} / {fmtTokens(l!)}</span></div><Meter value={r! / l!} tone={r! / l! < 0.1 ? 'crit' : r! / l! < 0.25 ? 'warn' : undefined} /></div>
              ))}
              {rl.reset && <span class="dimmer ws-small">Resets {new Date(rl.reset).toLocaleTimeString()}</span>}
            </section>
          )}

          {acc?.kind === 'api' && (
            <section class="card col gap-8">
              <h3 class="ws-h3">Org-wide spend (optional)</h3>
              <div class="dim ws-small">Paste an Admin key (sk-ant-admin…) to pull this period's real organization spend from the Usage & Cost Analytics API. Browsers often block that endpoint (CORS) — if so, the Console's usage page has the same numbers.</div>
              <div class="row">
                <input class="field mono" id="fuel-admin" type="password" autoComplete="off" placeholder="sk-ant-admin…" value={adminKey} onInput={(e) => setAdminKey((e.target as HTMLInputElement).value)} />
                <Btn size="sm" tone="cyan" disabled={!adminKey.startsWith('sk-ant-')} onClick={async () => { if (!acc) return; updateAccount(acc.id, { adminKey }); await fetchOrgSpend({ ...acc, adminKey }); }}>Fetch</Btn>
              </div>
              {org && <div class={`ws-notice ${org.error ? 'warn' : 'good'}`}>{org.error ?? `Org spend this ${f.budget.period}: ${fmtUsd(org.usd)} (fetched ${new Date(org.ts).toLocaleTimeString()})`}</div>}
            </section>
          )}

          <section class="col gap-4 dim ws-small fuel-notes">
            <SettingRow title="Where these numbers come from" hint={
              acc?.kind === 'claudeai'
                ? 'claude.ai does not report token usage or plan limits to web pages, so this tank estimates tokens (~4 characters per token) against the budget you set. For your real subscription limits inside Claude Code, install the GLOB LABS Claude Code mod — it reads the actual 5-hour and weekly windows.'
                : 'Every API response reports exact input/output/cache tokens; GLOB LABS prices them at Anthropic list prices and logs them in this browser. Spend from other apps on the same key only shows up via the org-wide report above.'}>
              <span />
            </SettingRow>
          </section>
          <div class="row"><Btn size="sm" tone="ghost" icon="refresh" onClick={() => { usageLog.value = [...usageLog.value]; sfx('tick', .4); }}>Recalculate</Btn></div>
        </div>
      </div>
      <span class="sr"><Icon name="fuel" /></span>
    </Win>
  );
}
