// Link and switch between several Claude accounts. Each has its own projects, chats, files,
// artifacts, idea docs and usage ledger.
import { useState } from 'preact/hooks';
import { accounts, activeAccountId, addAccount, makeAccount, removeAccount, switchAccount, updateAccount, usageLog } from '../../core/state';
import { sfx } from '../../core/bus';
import { isArtifact } from '../../core/env';
import { fmtUsd, fmtTokens } from '../../core/util';
import { Btn, Empty, Win, confirmBox, promptBox } from '../common/kit';
import { sampleReady } from '../../claude/engine';
import { KeyForm } from './Onboarding';

const COLORS = ['#7be35f', '#ff6fd6', '#52f2ff', '#ffbe3d', '#b48cff', '#ff5a5a'];

export function AccountsPanel({ close }: { arg: unknown; close: () => void }) {
  const [adding, setAdding] = useState(accounts.value.length === 0);
  const art = isArtifact();
  return (
    <Win title="CLAUDE ACCOUNTS" icon="user" onClose={close}>
      <div class="col gap-12 scroll" style={{ padding: '4px 8px 8px' }}>
        <div class="dim ws-small">Each account is its own lab: separate projects, chats, files, artifacts and fuel tank. Switch any time from the top bar.</div>
        {!accounts.value.length && <Empty icon="user" title="No accounts linked yet" />}
        {accounts.value.map((a) => {
          const spent = usageLog.value.filter((r) => r.accountId === a.id);
          const usd = spent.reduce((s, r) => s + r.costUsd, 0);
          const tok = spent.reduce((s, r) => s + r.input + r.output, 0);
          const active = a.id === activeAccountId.value;
          return (
            <div class={`card col gap-8 ${active ? 'acct-active' : ''}`} key={a.id}>
              <div class="row wrap">
                <span class="dot" style={{ color: a.color }} />
                <b class="grow ellipsis">{a.name}</b>
                <span class="chip">{a.kind === 'api' ? 'API key' : 'claude.ai'}</span>
                {active ? <span class="chip g">active</span> : <Btn size="sm" tone="glob" onClick={() => { sfx('select', .5); void switchAccount(a.id); }}>Switch</Btn>}
              </div>
              <div class="row wrap dim ws-small gap-12">
                {a.kind === 'api' && <span class="mono">{a.apiKey ? `${a.apiKey.slice(0, 10)}…${a.apiKey.slice(-4)}` : 'no key'}</span>}
                {a.kind === 'claudeai' && <span>{sampleReady.value ? 'Connected through claude.ai' : 'Available when running inside claude.ai'}</span>}
                <span>{a.budget.mode === 'usd' ? `${fmtUsd(a.budget.amount)}/${a.budget.period}` : `${fmtTokens(a.budget.amount)} tok/${a.budget.period}`} tank</span>
                <span>lifetime {a.kind === 'api' ? fmtUsd(usd) : `≈${fmtTokens(tok)} tok`}</span>
              </div>
              <div class="row wrap">
                {COLORS.map((c) => <button type="button" key={c} class="ws-swatch" aria-label={`Color ${c}`} style={{ background: c, outline: a.color === c ? '2px solid #fff' : undefined }} onClick={() => updateAccount(a.id, { color: c })} />)}
                <div class="grow" />
                <Btn size="sm" tone="ghost" icon="pencil" onClick={async () => { const n = await promptBox('Rename account', a.name); if (n) updateAccount(a.id, { name: n }); }}>Rename</Btn>
                {a.kind === 'api' && <Btn size="sm" tone="ghost" onClick={async () => { const k = await promptBox('Replace API key', '', 'Paste the new sk-ant-… key'); if (k?.startsWith('sk-ant-')) updateAccount(a.id, { apiKey: k.trim() }); }}>New key</Btn>}
                <Btn size="sm" tone="danger" icon="trash" onClick={async () => { if (await confirmBox(`Unlink “${a.name}”?`, 'Its key is forgotten and its projects and chats are hidden (they stay stored in this browser). Export your data in Settings first if you want a copy.', { ok: 'Unlink', danger: true })) void removeAccount(a.id); }}>Unlink</Btn>
              </div>
            </div>
          );
        })}

        {art && !accounts.value.some((a) => a.kind === 'claudeai') && (
          <Btn tone="glob" onClick={() => void addAccount(makeAccount('My Claude', 'claudeai'))}>Add my claude.ai account</Btn>
        )}
        {adding ? (
          <div class="card col gap-8"><b>Link an API key</b><KeyForm onDone={() => setAdding(false)} /></div>
        ) : <Btn tone="cyan" icon="plus" onClick={() => setAdding(true)}>Link another API key</Btn>}

        <div class="card col gap-4 dim ws-small">
          <b class="glow-a">What's supported</b>
          <span>• <b>Claude API keys</b> (console.anthropic.com) work everywhere GLOB LABS runs outside claude.ai. Exact usage per call.</span>
          <span>• <b>Your claude.ai account</b> works when GLOB LABS is opened as a published claude.ai artifact — it asks Claude on your own plan, with your permission.</span>
          <span>• Signing in to a claude.ai Pro/Max subscription from a third-party web app isn't offered by Anthropic, so GLOB LABS doesn't pretend to. For real subscription limits in Claude Code, use the GLOB LABS Claude Code mod.</span>
        </div>
      </div>
    </Win>
  );
}
