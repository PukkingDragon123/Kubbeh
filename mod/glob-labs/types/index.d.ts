// GLOB LABS — the mod's state contract. Every $.state value the hooks module reads or writes.

/** What an alien is visibly doing in the lab. */
export type Activity =
  | 'idle'
  | 'sleeping'
  | 'thinking'
  | 'coding'
  | 'files'
  | 'research'
  | 'web'
  | 'planning'
  | 'ideas'
  | 'question'
  | 'cloning'
  | 'celebrating'

export type Alien = {
  id: string
  name: string
  skin: 'glob' | 'pounce'
  activity: Activity
  /** One short caption of the real action: "Running: npm test". */
  label: string
  since: number
}

/** A running subagent, drawn as a clone that popped out of the vat. */
export type Clone = {
  id: string
  label: string
  activity: Activity
  since: number
}

/** One rate-limit window as the engine reports it (five_hour, seven_day, spend_limit). */
export type FuelWindow = { kind: string; percentUsed: number; resetsAt?: string }

/** full ≥50% left · half <50% · quarter <25% · critical <10% (of the emptiest window). */
export type Tier = 'full' | 'half' | 'quarter' | 'critical'

export type Fuel = {
  windows: FuelWindow[]
  tier: Tier
  /** Percent left in the emptiest window; null before the first reading. */
  remaining: number | null
  contextPercent?: number
  costUsd?: number
  updatedAt: number
  /** Lamps flash until this time (ms) after a marker is crossed. */
  alarmUntil: number
}

export type CavemanMode = 'off' | 'lite' | 'full' | 'ultra' | 'auto'
export type PolishMode = 'off' | 'on' | 'model'

export type LabSettings = {
  saver: boolean
  caveman: CavemanMode
  polish: PolishMode
}

export type Lab = {
  crew: Alien[]
  clones: Clone[]
  caption: string
  /** The question an alien is holding up right now, if any. */
  question: string | null
  /** Prof. Glorp's idea session topic, when idea mode is on. */
  idea: string | null
  genes: number
  savedTokens: number
}

declare module 'claude-code' {
  interface PluginState {
    'glob-labs': {
      lab: Shaped<Lab>
      fuel: Shaped<Fuel>
      settings: Shaped<LabSettings>
    }
  }
}
