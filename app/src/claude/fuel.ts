// Fuel monitor — turns real usage into the big tank, and the tank into Auto-Saver policy.
//
// Where the numbers come from (and we say so in the UI):
//   • API accounts: exact token counts from every response's `usage`, priced with the
//     published per-model rates; rate-limit headroom from anthropic-ratelimit-* headers
//     when the browser is allowed to read them; optional org-wide spend from the Usage &
//     Cost Analytics API (admin key; usually needs a server because of CORS).
//   • claude.ai accounts (artifact mode): the platform returns no usage numbers to pages,
//     so tokens are estimated (≈4 chars/token) against a budget you set. Your real plan
//     limits are not exposed to web pages — the GLOB LABS Claude Code mod reads those.

import { effect, signal } from '@preact/signals';
import Anthropic from '@anthropic-ai/sdk';
import { activeAccount, fuel, rateLimit, settings, usageLog } from '../core/state';
import { bus, sfx, toast } from '../core/bus';
import type { Account, CavemanLevel, Effort, FuelBudget, FuelReading, FuelTier, RateLimitSnapshot } from '../core/types';
import { fmtTokens, fmtUsd } from '../core/util';
import { minEffort } from './models';

export const TIER_ORDER: FuelTier[] = ['full', 'half', 'quarter', 'critical', 'empty'];
export const TIER_LABEL: Record<FuelTier, string> = { full: 'Full', half: 'Below 50%', quarter: 'Below 25%', critical: 'Below 10%', empty: 'Empty' };

export function tierOf(level: number): FuelTier {
  if (level <= 0) return 'empty';
  if (level <= 0.1) return 'critical';
  if (level <= 0.25) return 'quarter';
  if (level <= 0.5) return 'half';
  return 'full';
}

export function periodStart(period: FuelBudget['period'], now = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === 'week') { const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); }
  if (period === 'month') d.setDate(1);
  return d.getTime();
}

/** Org spend fetched from the Analytics API (USD), keyed by account id. */
export const orgSpend = signal<Record<string, { usd: number; ts: number; error?: string }>>({});
/** One-shot override so a send can go through on an empty tank. */
export const emptyOverride = signal(false);

function rateHeadroom(r: RateLimitSnapshot | null): number | null {
  if (!r || Date.now() - r.ts > 120_000) return null;
  const pairs: [number | undefined, number | undefined][] = [
    [r.tokensRemaining, r.tokensLimit], [r.inputTokensRemaining, r.inputTokensLimit],
    [r.outputTokensRemaining, r.outputTokensLimit], [r.requestsRemaining, r.requestsLimit],
  ];
  let min: number | null = null;
  for (const [rem, lim] of pairs) if (rem !== undefined && lim) { const v = rem / lim; min = min === null ? v : Math.min(min, v); }
  return min;
}

export function computeReading(acc: Account | null): FuelReading {
  const budget: FuelBudget = acc?.budget ?? { mode: 'usd', amount: 20, period: 'month' };
  const start = periodStart(budget.period);
  const recs = usageLog.value.filter((r) => (!acc || r.accountId === acc.id) && r.ts >= start);
  let spentUsd = recs.reduce((s, r) => s + r.costUsd, 0);
  const spentTokens = recs.reduce((s, r) => s + r.input + r.output + r.cacheWrite + r.cacheRead, 0);
  const estimated = recs.some((r) => r.estimated) || acc?.kind === 'claudeai';
  const org = acc ? orgSpend.value[acc.id] : undefined;
  let source: string;
  if (budget.mode === 'usd') {
    if (org && !org.error && org.usd > spentUsd) spentUsd = org.usd;
    source = org && !org.error
      ? `Org spend this ${budget.period} from the Usage & Cost API (${fmtUsd(org.usd)}) vs your ${fmtUsd(budget.amount)} budget`
      : `${fmtUsd(spentUsd)} of exact API usage logged in this browser this ${budget.period}, vs your ${fmtUsd(budget.amount)} budget`;
  } else {
    source = `${estimated ? '≈' : ''}${fmtTokens(spentTokens)} tokens this ${budget.period}${estimated ? ' (estimated — claude.ai does not report usage to pages)' : ''} vs your ${fmtTokens(budget.amount)} budget`;
  }
  const used = budget.mode === 'usd' ? spentUsd / Math.max(0.0001, budget.amount) : spentTokens / Math.max(1, budget.amount);
  let level = Math.max(0, 1 - used);
  const rl = rateHeadroom(rateLimit.value);
  if (rl !== null && rl < level) { level = rl; source += ` · rate-limit headroom ${Math.round(rl * 100)}% (live headers)`; }
  return { level, tier: tierOf(level), spentUsd, spentTokens, budget, estimated, periodStart: start, rate: rateLimit.value ?? undefined, source };
}

export interface Policy { effort: Effort; maxClones: number; caveman: CavemanLevel; compactAt: number; tier: FuelTier; reasons: string[]; blocked: boolean }

const CAVE_ORDER: CavemanLevel[] = ['off', 'lite', 'full', 'ultra'];
const maxCave = (a: CavemanLevel, b: CavemanLevel) => (CAVE_ORDER.indexOf(a) >= CAVE_ORDER.indexOf(b) ? a : b);

/** What a tier changes, for the UI table. */
export const TIER_RULES: { tier: FuelTier; effort: string; clones: string; caveman: string; compact: string }[] = [
  { tier: 'full', effort: 'Your setting', clones: 'Your max', caveman: 'Your setting', compact: 'Your threshold' },
  { tier: 'half', effort: '≤ High', clones: '≤ 2', caveman: 'Your setting', compact: 'Your threshold' },
  { tier: 'quarter', effort: '≤ Medium', clones: '≤ 1', caveman: '≥ Lite', compact: '× 0.6' },
  { tier: 'critical', effort: 'Low', clones: 'None', caveman: '≥ Full', compact: '× 0.4' },
  { tier: 'empty', effort: 'Low', clones: 'None', caveman: '≥ Full', compact: 'Sends paused' },
];

export function policyFor(tier: FuelTier): Policy {
  const s = settings.value;
  const p: Policy = { effort: s.effort, maxClones: s.maxClones, caveman: s.caveman, compactAt: s.compactAt, tier, reasons: [], blocked: false };
  if (!s.autoSaver || tier === 'full') return p;
  if (tier === 'half') {
    p.effort = minEffort(p.effort, 'high'); p.maxClones = Math.min(p.maxClones, 2);
  } else if (tier === 'quarter') {
    p.effort = minEffort(p.effort, 'medium'); p.maxClones = Math.min(p.maxClones, 1);
    p.caveman = maxCave(p.caveman, 'lite'); p.compactAt = Math.round(p.compactAt * 0.6);
  } else {
    p.effort = 'low'; p.maxClones = 0; p.caveman = maxCave(p.caveman, 'full'); p.compactAt = Math.round(p.compactAt * 0.4);
    if (tier === 'empty') p.blocked = !emptyOverride.value;
  }
  if (p.effort !== s.effort) p.reasons.push(`effort ${s.effort} → ${p.effort}`);
  if (p.maxClones !== s.maxClones) p.reasons.push(p.maxClones === 0 ? 'clone vat offline' : `clones ≤ ${p.maxClones}`);
  if (p.caveman !== s.caveman) p.reasons.push(`caveman ${p.caveman}`);
  if (p.compactAt !== s.compactAt) p.reasons.push(`compact at ${fmtTokens(p.compactAt)}`);
  if (p.blocked) p.reasons.push('sends paused');
  return p;
}

/** Effective Auto-Saver policy for the current fuel level. */
export function policy(): { effort: Effort; maxClones: number; caveman: CavemanLevel; compactAt: number; tier: FuelTier; reasons: string[] } {
  return policyFor(fuel.value.tier);
}
export const fullPolicy = (): Policy => policyFor(fuel.value.tier);

// ── Admin cost report (optional) ─────────────────────────────────────────────
export async function fetchOrgSpend(acc: Account): Promise<void> {
  if (!acc.adminKey) return;
  const start = new Date(periodStart(acc.budget.period)).toISOString().replace(/\.\d{3}Z$/, 'Z');
  try {
    const admin = new Anthropic({ apiKey: acc.adminKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
    let cents = 0;
    for await (const row of admin.beta.organization.analytics.cost.list({ starting_at: start })) cents += Number(row.cost.amount) || 0;
    orgSpend.value = { ...orgSpend.value, [acc.id]: { usd: cents / 100, ts: Date.now() } };
    toast(`Org spend this ${acc.budget.period}: ${fmtUsd(cents / 100)}`, 'good', 'fuel');
  } catch (err: any) {
    const msg = err instanceof Anthropic.APIConnectionError
      ? 'The browser blocked the Admin API call (CORS). Org-wide cost reports need a small server or the Console.'
      : err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError
        ? 'That admin key was rejected — it needs an sk-ant-admin key with analytics access.'
        : `Cost report failed: ${err?.message ?? err}`;
    orgSpend.value = { ...orgSpend.value, [acc.id]: { usd: 0, ts: Date.now(), error: msg } };
    toast(msg, 'warn', 'fuel');
  }
}

// ── monitor ──────────────────────────────────────────────────────────────────
let lastAccount: string | null = null;
let lastTier: FuelTier = 'full';

function recompute() {
  const acc = activeAccount.value;
  const r = computeReading(acc);
  fuel.value = r;
  const switched = (acc?.id ?? null) !== lastAccount;
  lastAccount = acc?.id ?? null;
  if (switched) { lastTier = r.tier; return; }
  if (r.tier !== lastTier) {
    const prev = lastTier;
    lastTier = r.tier;
    bus.emit('fuel:tier', { tier: r.tier, prev, level: r.level });
    const dropping = TIER_ORDER.indexOf(r.tier) > TIER_ORDER.indexOf(prev);
    if (dropping) {
      sfx('alarm', 0.6);
      const p = policyFor(r.tier);
      const what = settings.value.autoSaver && p.reasons.length ? ` Auto-Saver: ${p.reasons.join(', ')}.` : settings.value.autoSaver ? '' : ' Auto-Saver is off.';
      toast(`Fuel ${TIER_LABEL[r.tier].toLowerCase()} (${Math.round(r.level * 100)}%).${what}`, r.tier === 'half' ? 'warn' : 'bad', 'fuel');
    } else {
      sfx('powerup', 0.5);
      toast(`Fuel back to ${TIER_LABEL[r.tier].toLowerCase()} — Auto-Saver eased off.`, 'good', 'fuel');
    }
  }
}

effect(() => {
  // re-run when any of these change
  void usageLog.value; void rateLimit.value; void activeAccount.value; void settings.value.autoSaver; void orgSpend.value;
  recompute();
});
// period rollover / stale rate-limit snapshots
setInterval(recompute, 60_000);
