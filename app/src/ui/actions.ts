// Late-bound actions so the shell can offer buttons whose features live in other modules.
// Feature modules assign their implementation at import time.
import { toast } from '../core/bus';

export const actions = {
  /** Open the floating always-on-top widget (src/widget). */
  openWidget: async (): Promise<void> => { toast('Widget module not loaded', 'warn'); },
  /** Start a new chat in the terminal, optionally inside a project. */
  newChat: (_projectId?: string): void => {},
  /** Send text into the active workspace composer (used by Idea Lab → "Build it"). */
  sendToTerminal: (_text: string, _projectId?: string): void => {},
};
