// First-run: connect a Claude account (claude.ai inside artifacts, API key elsewhere).
import { useState } from 'preact/hooks';
import { accounts, activeAccount, addAccount, makeAccount, switchAccount } from '../../core/state';
import { sfx, toast } from '../../core/bus';
import { isArtifact } from '../../core/env';
import { Btn } from '../common/kit';
import { Icon } from '../common/icons';
import { engineBlocker, sampleReady } from '../../claude/engine';
import { validateKey } from '../../claude/engine-api';

export function KeyForm({ onDone }: { onDone?: () => void }) {
  const [name, setName] = useState(accounts.value.some((a) => a.kind === 'api') ? 'Second key' : 'My API key');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <form class="col gap-8" onSubmit={async (e) => {
      e.preventDefault();
      const k = key.trim();
      if (!/^sk-ant-/.test(k)) { setErr('Claude API keys start with sk-ant-'); return; }
      setBusy(true); setErr('');
      try {
        const models = await validateKey(k);
        await addAccount(makeAccount(name.trim() || 'API key', 'api', k));
        sfx('powerup', .6); toast(`Linked! ${models.length} models available.`, 'good');
        setKey(''); onDone?.();
      } catch (er: any) { setErr(er?.message ?? String(er)); sfx('error', .5); } finally { setBusy(false); }
    }}>
      <label class="col gap-4"><span class="label">Account name</span><input class="field" id="key-name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
      <label class="col gap-4"><span class="label">Claude API key</span>
        <input class="field mono" id="key-value" type="password" autoComplete="off" spellcheck={false} placeholder="sk-ant-…" value={key} onInput={(e) => setKey((e.target as HTMLInputElement).value)} />
      </label>
      {err && <div class="ws-notice bad">{err}</div>}
      <div class="row wrap">
        <Btn type="submit" tone="glob" icon="bolt" disabled={busy || !key}>{busy ? 'Checking key…' : 'Validate & link'}</Btn>
        <a class="ws-small" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">Get a key at console.anthropic.com ↗</a>
      </div>
      <div class="dimmer ws-small">The key stays in this browser's storage and is only ever sent to api.anthropic.com. Usage is billed to that Console account, and the fuel tank tracks it exactly.</div>
    </form>
  );
}

export function Onboarding() {
  const reason = engineBlocker();
  const art = isArtifact();
  const claudeAcc = accounts.value.find((a) => a.kind === 'claudeai');
  return (
    <div class="ws-home scroll">
      <div class="ws-onboard card col gap-16">
        <div class="row gap-12"><span class="glow-g"><Icon name="alien" size="xl" /></span>
          <div class="col gap-4"><h2 class="ws-h px">Power up the lab</h2><div class="dim">{reason}</div></div>
        </div>
        {art && (
          <div class="col gap-8">
            <b>Use your claude.ai account</b>
            <div class="dim ws-small">GLOB LABS is running inside claude.ai, so it can ask Claude on your own plan — no key needed. Claude asks your permission the first time.</div>
            {sampleReady.value === null ? <div class="dim"><i class="ws-spin" /> Connecting…</div>
              : sampleReady.value ? <Btn tone="glob" icon="play" onClick={async () => { if (claudeAcc) await switchAccount(claudeAcc.id); else await addAccount(makeAccount('My Claude', 'claudeai')); sfx('powerup', .6); }}>Use my Claude account</Btn>
              : <div class="ws-notice warn">This view can't reach Claude (it may be embedded outside claude.ai).</div>}
          </div>
        )}
        {!art && (
          <div class="col gap-8">
            <b>Link a Claude API key</b>
            <KeyForm />
            <div class="dimmer ws-small">Signing in with a claude.ai Pro/Max subscription isn't available to third-party apps. Publish GLOB LABS as a claude.ai artifact to run it on your plan instead.</div>
          </div>
        )}
        {activeAccount.value && <div class="dimmer ws-small">Tip: open with <code>?mock=1</code> to try the whole lab offline with a scripted Claude.</div>}
      </div>
    </div>
  );
}
