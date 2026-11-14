// Panel registry. Feature modules register their panel component once at import time;
// the PanelHost renders whichever is open. Keeps features decoupled from the shell.
import type { ComponentType } from 'preact';
import type { PanelId } from '../core/types';
import type { IconName } from './common/icons';

export interface PanelDef {
  id: PanelId;
  title: string;
  icon: IconName;
  /** sm 480 · md 760 · lg 1180 · xl 1480 (max widths), side = docked right */
  size: 'sm' | 'md' | 'lg' | 'xl' | 'side';
  component: ComponentType<{ arg: unknown; close: () => void }>;
  /** Shown in the dock? (order = dock order) */
  dock?: { label: string; order: number; hotkey?: string };
}

export const panels = new Map<PanelId, PanelDef>();
export function registerPanel(def: PanelDef) { panels.set(def.id, def); }
