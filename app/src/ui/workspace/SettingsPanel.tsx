import type { CavemanLevel, Effort, PolishMode, Settings } from '../../core/types';
import { patchSettings, settings, storageKind, DEFAULT_SETTINGS } from '../../core/state';
import { sfx, toast } from '../../core/bus';
import { store } from '../../core/storage';
import { saveFile } from '../../core/download';
import { fmtTokens, readFileAsText } from '../../core/util';
import { Btn, Seg, SettingRow, Toggle, Win, confirmBox } from '../common/kit';
import { MODELS, EFFORT_ORDER, EFFORT_LABEL } from '../../claude/models';

export function SettingsPanel({ close }: { arg: unknown; close: () => void }) {
  const s = settings.value;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => patchSettings({ [k]: v } as Partial<Settings>);

  async function exportAll() {
    const kv = await store();
    const keys = await kv.keys('');
    const data: Record<string, unknown> = {};
    for (const k of keys) if (k !== '__probe') data[k] = await kv.get(k);
    // API keys never leave in an export
    const accs = data['accounts'] as any[] | undefined;
    if (accs) data['accounts'] = accs.map((a) => ({ ...a, apiKey: undefined, adminKey: undefined }));
    await saveFile(`glob-labs-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'glob-labs', version: 1, exportedAt: Date.now(), data }, null, 1), 'application/json');
  }

  async function importAll(file: File) {
    try {
      const parsed = JSON.parse(await readFileAsText(file));
      if (parsed?.app !== 'glob-labs' || typeof parsed.data !== 'object') throw new Error('Not a GLOB LABS backup');
      if (!(await confirmBox('Import backup?', 'This merges the backup into this browser (same keys are overwritten). API keys are not in backups — re-link them after.', { ok: 'Import' }))) return;
      const kv = await store();
      for (const [k, v] of Object.entries(parsed.data)) await kv.set(k, v);
      toast('Imported — reloading the lab…', 'good');
      setTimeout(() => location.reload(), 900);
    } catch (err: any) { toast(`Import failed: ${err?.message ?? err}`, 'bad'); }
  }

  return (
    <Win title="SETTINGS" icon="gear" onClose={close}>
      <div class="col scroll" style={{ padding: '0 10px 10px' }}>
        <h3 class="ws-h3">Claude</h3>
        <SettingRow title="Default model" hint="New chats start with this. Change per chat from the composer.">
          <select class="select" id="set-model" value={s.model} onChange={(e) => set('model', (e.target as HTMLSelectElement).value)}>
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </SettingRow>
        <SettingRow title="Thinking effort" hint="Higher = deeper reasoning, more tokens. Auto-Saver can lower it as fuel drops.">
          <Seg<Effort> value={s.effort} onChange={(v) => set('effort', v)} options={EFFORT_ORDER.map((e) => ({ value: e, label: EFFORT_LABEL[e] }))} />
        </SettingRow>
        <SettingRow title="Web search & fetch" hint="Let Claude search the web and read pages (server-side tools)."><Toggle value={s.webSearch} onChange={(v) => set('webSearch', v)} label="Web search" /></SettingRow>
        <SettingRow title="Show thinking" hint="Display Claude's summarized reasoning while it works."><Toggle value={s.showThinking} onChange={(v) => set('showThinking', v)} label="Show thinking" /></SettingRow>
        <SettingRow title="Max clones" hint="Parallel sub-agents Claude may spawn at full fuel. Auto-Saver lowers this.">
          <Seg<string> value={String(s.maxClones)} onChange={(v) => set('maxClones', Number(v))} options={['0', '1', '2', '3', '4', '6'].map((n) => ({ value: n, label: n }))} />
        </SettingRow>

        <h3 class="ws-h3">Saving credits</h3>
        <SettingRow title="Auto-Saver" hint="At 50 / 25 / 10% fuel: lower effort, fewer clones, terser output, earlier compaction."><Toggle value={s.autoSaver} onChange={(v) => set('autoSaver', v)} label="Auto-Saver" /></SettingRow>
        <SettingRow title="Caveman mode" hint="Shorter answers = fewer output tokens. Code and requested details stay complete.">
          <Seg<CavemanLevel> value={s.caveman} onChange={(v) => set('caveman', v)} options={[{ value: 'off', label: 'Off' }, { value: 'lite', label: 'Lite' }, { value: 'full', label: 'Full' }, { value: 'ultra', label: 'Ultra' }]} />
        </SettingRow>
        <SettingRow title="Prompt polisher" hint="Suggest: one tap to tidy a prompt. Auto: every long prompt is polished before sending (with undo).">
          <Seg<PolishMode> value={s.polish} onChange={(v) => set('polish', v)} options={[{ value: 'off', label: 'Off' }, { value: 'suggest', label: 'Suggest' }, { value: 'auto', label: 'Auto' }]} />
        </SettingRow>
        <SettingRow title="Compact context at" hint={`Older messages are summarized by Haiku once a chat passes this size. Now: ${fmtTokens(s.compactAt)} tokens.`}>
          <input class="slider" id="set-compact" type="range" min={20000} max={400000} step={10000} value={s.compactAt} style={{ width: '180px' }} onInput={(e) => set('compactAt', Number((e.target as HTMLInputElement).value))} />
        </SettingRow>
        <SettingRow title="Enter sends" hint="Off: Enter adds a line and Ctrl/⌘+Enter sends."><Toggle value={s.enterToSend} onChange={(v) => set('enterToSend', v)} label="Enter sends" /></SettingRow>

        <h3 class="ws-h3">Lab</h3>
        <SettingRow title="Sound" hint={s.muted ? 'Muted' : `${Math.round(s.volume * 100)}%`}>
          <Toggle value={!s.muted} onChange={(v) => set('muted', !v)} label="Sound on" />
          <input class="slider" id="set-vol" type="range" min={0} max={1} step={0.05} value={s.volume} style={{ width: '140px' }} onInput={(e) => set('volume', Number((e.target as HTMLInputElement).value))} onChange={() => sfx('blip', .7)} />
        </SettingRow>
        <SettingRow title="Graphics" hint="Low turns off bloom and lowers resolution for older machines.">
          <Seg value={s.quality} onChange={(v) => set('quality', v)} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
        </SettingRow>
        <SettingRow title="Reduce motion" hint="Calmer camera and fewer bouncy animations."><Toggle value={s.reduceMotion} onChange={(v) => set('reduceMotion', v)} label="Reduce motion" /></SettingRow>

        <h3 class="ws-h3">Data</h3>
        <SettingRow title="Backup" hint={`Stored in ${storageKind.value === 'claude-db' ? 'your claude.ai artifact storage (synced)' : storageKind.value === 'idb' ? 'this browser (IndexedDB)' : 'memory only — will be lost on reload'}. Backups never include API keys.`}>
          <Btn size="sm" tone="cyan" icon="download" onClick={() => void exportAll()}>Export</Btn>
          <label class="btn sm ghost" style={{ cursor: 'pointer' }}><input type="file" accept="application/json" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void importAll(f); (e.target as HTMLInputElement).value = ''; }} />Import</label>
        </SettingRow>
        <SettingRow title="Reset settings" hint="Restores defaults. Your projects, chats and genes are untouched.">
          <Btn size="sm" tone="danger" onClick={async () => { if (await confirmBox('Reset settings to defaults?', undefined, { ok: 'Reset', danger: true })) { settings.value = { ...DEFAULT_SETTINGS, onboarded: true }; toast('Settings reset', 'good'); } }}>Reset</Btn>
        </SettingRow>
      </div>
    </Win>
  );
}
