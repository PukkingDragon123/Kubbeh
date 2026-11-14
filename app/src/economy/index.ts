// Economy module: Gene Points, purchases, achievements, daily bonus.
import { effect } from '@preact/signals';
import { ready, patchEconomy } from '../core/state';
import { startAchievements } from './achievements';
import { claimDaily, earnGenes } from './genes';

export * from './genes';
export * from './achievements';
export * from './catalog';

startAchievements();

let claimed = false;
effect(() => {
  if (!ready.value || claimed) return;
  claimed = true;
  setTimeout(() => claimDaily(), 0);
});

// Dev-only helpers for testing the shop & stations: __glob.grant(500), __glob.own('slot_machine')
if (import.meta.env.DEV) {
  (window as any).__glob = {
    grant: (n: number) => earnGenes(n, 'Dev grant', undefined, 'bonus'),
    own: (id: string) => patchEconomy((e) => ({ ...e, owned: { ...e.owned, [id]: (e.owned[id] ?? 0) + 1 } })),
  };
}
