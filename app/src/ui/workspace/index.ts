// Registers the workspace panels and the shell actions they provide.
import './workspace.css';
import { registerPanel } from '../panels';
import { actions } from '../actions';
import { activeProjectId, addAccount, accounts, makeAccount, openPanelId, ready, setPanel } from '../../core/state';
import { mockMode } from '../../claude/engine';
import { Terminal } from './Terminal';
import { FuelPanel } from './FuelPanel';
import { AccountsPanel } from './AccountsPanel';
import { SettingsPanel } from './SettingsPanel';
import { ArtifactPanel } from './ArtifactFrame';
import { composerSeed, goHome } from './ws';

registerPanel({ id: 'terminal', title: 'Terminal', icon: 'terminal', size: 'xl', component: Terminal, dock: { label: 'Terminal', order: 1, hotkey: 't' } });
registerPanel({ id: 'fuel', title: 'Fuel Tank', icon: 'fuel', size: 'lg', component: FuelPanel, dock: { label: 'Fuel', order: 6, hotkey: 'f' } });
registerPanel({ id: 'settings', title: 'Settings', icon: 'gear', size: 'md', component: SettingsPanel, dock: { label: 'Settings', order: 8, hotkey: ',' } });
registerPanel({ id: 'accounts', title: 'Accounts', icon: 'user', size: 'md', component: AccountsPanel });
registerPanel({ id: 'artifact', title: 'Artifact', icon: 'bolt', size: 'lg', component: ArtifactPanel });

actions.newChat = (projectId?: string) => {
  goHome(projectId ?? null);
  if (openPanelId.value !== 'terminal') setPanel('terminal');
};

actions.sendToTerminal = (text: string, projectId?: string) => {
  goHome(projectId ?? activeProjectId.value ?? null);
  composerSeed.value = { text };
  if (openPanelId.value !== 'terminal') setPanel('terminal');
};

// Offline demo: make sure there's an account to hang the mock lab on.
if (mockMode) {
  ready.subscribe((r) => { if (r && !accounts.value.length) void addAccount(makeAccount('Mock Lab (offline)', 'api')); });
}
