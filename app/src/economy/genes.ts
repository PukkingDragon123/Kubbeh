// Gene Points — the lab's currency. Earned by real work (completed Claude turns, files,
// artifacts, clones, compactions, finished designs), spent in the GENE-O-MAT.
//
// Anti-farm: every earning reason belongs to a bucket with an hourly cap, so poking aliens
// or spamming tiny prompts can't print money. Real projects are what pay.

import { bus, sfx, toast } from '../core/bus';
import { economy, patchEconomy } from '../core/state';
import { todayKey } from '../core/util';
import { catalogById, isStarter } from './catalog';

export type GeneBucket = 'work' | 'files' | 'poke' | 'arcade' | 'slot' | 'bonus' | 'achievement';

/** Max genes per bucket per rolling hour (arcade is per day). */
const CAPS: Record<GeneBucket, number> = {
  work: 160, files: 30, poke: 8, arcade: 40, slot: 1000, bonus: 1000, achievement: 100000,
};

const windows = new Map<GeneBucket, { start: number; total: number }>();

function capLeft(bucket: GeneBucket): number {
  const span = bucket === 'arcade' ? 86400_000 : 3600_000;
  const now = Date.now();
  let w = windows.get(bucket);
  if (!w || now - w.start > span) { w = { start: now, total: 0 }; windows.set(bucket, w); }
  return Math.max(0, CAPS[bucket] - w.total);
}

/** Earn genes. Returns how many were actually granted after caps. */
export function earnGenes(amount: number, reason: string, at?: { x: number; y: number }, bucket: GeneBucket = 'work'): number {
  amount = Math.round(amount);
  if (amount <= 0) return 0;
  const grant = Math.min(amount, capLeft(bucket));
  if (grant <= 0) return 0;
  windows.get(bucket)!.total += grant;
  patchEconomy((e) => ({
    ...e,
    balance: e.balance + grant,
    lifetime: e.lifetime + grant,
    ledger: [...e.ledger, { ts: Date.now(), amount: grant, reason }].slice(-250),
  }));
  bus.emit('genes:earn', { amount: grant, reason, x: at?.x, y: at?.y });
  sfx(grant >= 25 ? 'coins' : 'coin', 0.45, 0.95 + Math.random() * 0.15);
  return grant;
}

/** Spend genes on an item. False (and nothing changes) if the balance is short. */
export function spendGenes(amount: number, itemId: string, reason?: string): boolean {
  if (amount <= 0) return true;
  if (economy.value.balance < amount) return false;
  patchEconomy((e) => ({
    ...e,
    balance: e.balance - amount,
    ledger: [...e.ledger, { ts: Date.now(), amount: -amount, reason: reason ?? `Bought ${catalogById.get(itemId)?.name ?? itemId}` }].slice(-250),
    stats: { ...e.stats, spent: (e.stats.spent ?? 0) + amount },
  }));
  bus.emit('genes:spend', { amount, item: itemId });
  return true;
}

export function bumpStat(key: string, n = 1) {
  patchEconomy((e) => ({ ...e, stats: { ...e.stats, [key]: (e.stats[key] ?? 0) + n } }));
}
export function setStatMax(key: string, value: number) {
  if ((economy.value.stats[key] ?? 0) >= value) return;
  patchEconomy((e) => ({ ...e, stats: { ...e.stats, [key]: value } }));
}
export const stat = (key: string) => economy.value.stats[key] ?? 0;

export type BuyResult = { ok: true } | { ok: false; reason: 'unknown' | 'owned' | 'funds' };

/** Buy one of a catalog item. Placeables stack (you can own several couches). */
export function buyItem(id: string): BuyResult {
  const item = catalogById.get(id);
  if (!item) return { ok: false, reason: 'unknown' };
  const owned = economy.value.owned[id] ?? 0;
  if (!item.placeable && (owned > 0 || isStarter(id))) return { ok: false, reason: 'owned' };
  if (!spendGenes(item.price, id)) {
    sfx('error', 0.5);
    return { ok: false, reason: 'funds' };
  }
  patchEconomy((e) => ({ ...e, owned: { ...e.owned, [id]: (e.owned[id] ?? 0) + 1 } }));
  sfx('coins', 0.55);
  setTimeout(() => sfx('plop', 0.5), 260);
  bumpStat('purchases');
  if (item.category === 'skin') bumpStat('skinsBought');
  toast(`${item.name} dispensed!`, 'good', 'shop');
  return { ok: true };
}

export function canAfford(price: number) { return economy.value.balance >= price; }

// ── daily slime ration ──────────────────────────────────────────────────────
export function claimDaily(): number {
  const today = todayKey();
  const e = economy.value;
  if (e.lastDaily === today) return 0;
  const y = new Date(); y.setDate(y.getDate() - 1);
  const streak = e.lastDaily === todayKey(y) ? (e.streak ?? 0) + 1 : 1;
  const bonus = 15 + 5 * Math.min(streak, 7);
  patchEconomy((x) => ({ ...x, lastDaily: today, streak }));
  setTimeout(() => {
    earnGenes(bonus, `Daily slime ration (day ${streak})`, undefined, 'bonus');
    toast(`Daily slime ration: +${bonus} genes${streak > 1 ? ` · ${streak}-day streak!` : ''}`, 'good', 'dna');
  }, 2200);
  return bonus;
}
