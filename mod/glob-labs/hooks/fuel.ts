// Fuel logic: pure functions over the engine's real rate-limit windows.
import type { CavemanMode, Fuel, FuelWindow, Tier } from '../types'

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

/** Percent left in the emptiest window, or null with no reading. */
export function remainingOf(windows: readonly FuelWindow[]): number | null {
  if (windows.length === 0) return null
  const used = Math.max(...windows.map(w => w.percentUsed))
  return Math.max(0, Math.round((100 - used) * 10) / 10)
}

/** Markers at 50 / 25 / 10 percent left. */
export function tierOf(remaining: number | null): Tier {
  if (remaining === null) return 'full'
  if (remaining < 10) return 'critical'
  if (remaining < 25) return 'quarter'
  if (remaining < 50) return 'half'
  return 'full'
}

export const TIER_RANK: Record<Tier, number> = { full: 0, half: 1, quarter: 2, critical: 3 }

/** The most effort the Auto-Saver lets a request ask for at a tier. */
export function effortCap(tier: Tier): Effort | null {
  return tier === 'half' ? 'high' : tier === 'quarter' ? 'medium' : tier === 'critical' ? 'low' : null
}

/**
 * The effort a request goes out with: never raised, only lowered to the tier's cap.
 * An unstated effort (the model's default) is only pinned at `critical`, where
 * `low` cannot be a raise.
 */
export function cappedEffort(current: Effort | number | undefined, tier: Tier): Effort | undefined {
  const cap = effortCap(tier)
  if (cap === null) return undefined
  if (current === undefined) return tier === 'critical' ? 'low' : undefined
  if (typeof current === 'number') return undefined
  return EFFORTS.indexOf(current) > EFFORTS.indexOf(cap) ? cap : undefined
}

/** Caveman level actually in force: `auto` follows the fuel. */
export function cavemanLevel(mode: CavemanMode, tier: Tier, saver: boolean): 'off' | 'lite' | 'full' | 'ultra' {
  if (mode !== 'auto') return mode
  if (!saver) return 'off'
  return tier === 'critical' ? 'full' : tier === 'quarter' ? 'lite' : 'off'
}

/** How many subagents may run at once at a tier (Infinity = no limit). */
export function cloneLimit(tier: Tier): number {
  return tier === 'critical' ? 0 : tier === 'quarter' ? 1 : Number.POSITIVE_INFINITY
}

export function windowName(kind: string): string {
  if (kind === 'five_hour') return '5-hour'
  if (kind === 'seven_day') return 'Weekly'
  if (kind === 'seven_day_opus') return 'Weekly Opus'
  if (kind === 'spend_limit') return 'Spend limit'
  return kind.replace(/_/g, ' ')
}

/** "resets in 2h 14m" relative to now (no time zone guessing). */
export function resetsIn(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const t = Date.parse(resetsAt)
  if (Number.isNaN(t)) return ''
  let mins = Math.max(0, Math.round((t - now) / 60000))
  if (mins === 0) return 'resets now'
  const d = Math.floor(mins / 1440)
  mins -= d * 1440
  const h = Math.floor(mins / 60)
  const m = mins - h * 60
  return 'resets in ' + (d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`)
}

export function emptyFuel(): Fuel {
  return { windows: [], tier: 'full', remaining: null, updatedAt: 0, alarmUntil: 0 }
}

export const TIER_LABEL: Record<Tier, string> = {
  full: 'Tank healthy',
  half: 'Below 50%',
  quarter: 'Below 25%',
  critical: 'Below 10%',
}

/** What the Auto-Saver does at each tier, in words for /fuel and the toast. */
export function saverActions(tier: Tier): string {
  switch (tier) {
    case 'full':
      return 'No limits: full effort, unlimited clones.'
    case 'half':
      return 'Effort capped at high.'
    case 'quarter':
      return 'Effort capped at medium, 1 clone at a time, caveman lite (if caveman is auto).'
    case 'critical':
      return 'Effort low, no new clones, caveman full (if caveman is auto).'
  }
}
