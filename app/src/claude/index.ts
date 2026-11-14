// Claude engine bootstrap: wires the engine factory, starts the fuel monitor, registers the
// workspace panels (Terminal, Fuel, Accounts, Settings, Artifact) and the shell actions.
import { registerEngines } from './engine';
import { apiEngine } from './engine-api';
import { claudeaiEngine } from './engine-claudeai';
import { mockEngine } from './mock';
import './fuel';
import '../ui/workspace';

registerEngines({ api: apiEngine, claudeai: claudeaiEngine, mock: mockEngine });

export { runTurn, complete, engineAvailable, compactChat } from './agent';
export { polishPrompt, localCompress } from './polish';
export { policy } from './fuel';
