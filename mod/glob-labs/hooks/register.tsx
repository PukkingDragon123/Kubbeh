// GLOB LABS for Claude Code — turns the session into a back-alley alien lab.
//
// Real data only: the fuel tank reads the engine's own rate-limit windows
// ($.session.usage / session.measure), and the aliens move on the tool calls
// Claude actually makes. The Auto-Saver lowers effort per request (turn.step),
// rations subagents (agent.spawn) and adds terse-output notes beside prompts
// (prompt.submit context) — it never touches what a thread already sent.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import type { Activity, Alien, CavemanMode, Clone, Fuel, Lab, LabSettings, PolishMode, Tier } from '../types'
import { makeColors } from './make-colors.js'
import {
  TIER_LABEL, TIER_RANK, cappedEffort, cavemanLevel, cloneLimit, emptyFuel, remainingOf,
  resetsIn, saverActions, tierOf, windowName,
} from './fuel'
import { POLISH_SYSTEM, compress, estimateTokens, keepsMeaning } from './polish'
import { BACKDROP, glanceSvg, labSvg, tankSvg } from './scene'
import { CAVEMAN, GLORP_RESUME, SAVER_NOTE, glorp } from './texts'

const PANE = 'glob-lab'

const START_CREW: Alien[] = [
  { id: 'blip', name: 'Blip', skin: 'glob', activity: 'idle', label: 'Waiting for orders', since: 0 },
  { id: 'zib', name: 'Zib', skin: 'glob', activity: 'idle', label: 'Polishing the file drawers', since: 0 },
  { id: 'mossy', name: 'Mossy', skin: 'glob', activity: 'sleeping', label: 'Napping on the beanbag', since: 0 },
  { id: 'glorp', name: 'Prof. Glorp', skin: 'glob', activity: 'idle', label: 'Doodling game ideas', since: 0 },
  { id: 'pounce', name: 'Pounce', skin: 'pounce', activity: 'idle', label: 'Guarding the whiteboard', since: 0 },
]
const START_LAB: Lab = { crew: START_CREW, clones: [], caption: 'The lab is quiet. Give the crew something to build.', question: null, idea: null, genes: 0, savedTokens: 0 }
const DEFAULT_SETTINGS: LabSettings = { saver: true, caveman: 'auto', polish: 'off' }

const lab = atom({ plugin: 'glob-labs', key: 'lab' } as const, START_LAB, { shape: 'lab-1' })
const fuel = atom({ plugin: 'glob-labs', key: 'fuel' } as const, emptyFuel(), { shape: 'fuel-1' })
const settings = atom({ plugin: 'glob-labs', key: 'settings' } as const, DEFAULT_SETTINGS, { shape: 'settings-1' })

// ── look ─────────────────────────────────────────────────────────────────────
const { theme, problems } = makeColors({
  label: 'GLOB LABS',
  roles: { accent: '#3fbf4a', danger: '#e0424e', success: '#3fae4a', warning: '#d48a12', pro: '#d0409f' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#e6efe6', 'surface-1': '#edf4ec', 'surface-2': '#f4f9f2',
        'text-primary': '#132018', 'text-secondary': '#36483c', 'text-muted': '#4f6355',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0b110d', 'surface-1': '#111a14', 'surface-2': '#16211a', 'surface-3': '#1b281f',
        'text-primary': '#e6f7e4', 'text-secondary': '#bcd3bf', 'text-muted': '#95ad99',
      },
    },
    roles: { accent: '#8cf56b', danger: '#ff6b6b', success: '#8cf56b', warning: '#ffbe3d', pro: '#ff6fd6' },
  },
  codeTheme: { dark: 'github-dark' },
})
const LOOK: ThemeSetArgs = { colors: theme, backdrop: { scene: 'alley', glass: { blur: 18, tint: '#0b110d', opacity: 0.72 } } }

// ── genes (persist in $.store) ───────────────────────────────────────────────
type GeneBook = {
  balance: number
  lifetime: number
  ledger: { ts: number; amount: number; reason: string }[]
  achievements: Record<string, number>
  counters: Record<string, number>
}
const EMPTY_BOOK: GeneBook = { balance: 0, lifetime: 0, ledger: [], achievements: {}, counters: {} }

const ACHIEVEMENTS: { id: string; name: string; reward: number; test: (c: Record<string, number>) => boolean }[] = [
  { id: 'first_turn', name: 'First Experiment', reward: 10, test: c => (c.turns ?? 0) >= 1 },
  { id: 'turns_10', name: 'Lab Regular', reward: 25, test: c => (c.turns ?? 0) >= 10 },
  { id: 'turns_100', name: 'Mad Scientist', reward: 100, test: c => (c.turns ?? 0) >= 100 },
  { id: 'files_50', name: 'Paper Pusher', reward: 30, test: c => (c.files ?? 0) >= 50 },
  { id: 'first_clone', name: 'Clone Wars', reward: 15, test: c => (c.clones ?? 0) >= 1 },
  { id: 'clones_25', name: 'Clone Army', reward: 50, test: c => (c.clones ?? 0) >= 25 },
  { id: 'saver_trip', name: 'Running on Fumes', reward: 10, test: c => (c.saverTrips ?? 0) >= 1 },
  { id: 'polish_1k', name: 'Word Diet', reward: 20, test: c => (c.savedTokens ?? 0) >= 1000 },
  { id: 'idea_1', name: 'Big Brain', reward: 15, test: c => (c.ideas ?? 0) >= 1 },
]

async function readBook($: EngineInterface): Promise<GeneBook> {
  const raw = (await $.store.get('genes')) as Partial<GeneBook> | undefined
  return { ...EMPTY_BOOK, ...(raw ?? {}) }
}

/** Add genes and bump counters; unlocks achievements; mirrors the balance into the pane. */
async function earn($: EngineInterface, amount: number, reason: string, counters: Record<string, number> = {}) {
  const book = await readBook($)
  for (const [k, v] of Object.entries(counters)) book.counters[k] = (book.counters[k] ?? 0) + v
  const add = (n: number, why: string) => {
    if (n <= 0) return
    book.balance += n
    book.lifetime += n
    book.ledger = [{ ts: Date.now(), amount: n, reason: why }, ...book.ledger].slice(0, 30)
  }
  add(amount, reason)
  for (const a of ACHIEVEMENTS) {
    if (book.achievements[a.id] || !a.test(book.counters)) continue
    book.achievements[a.id] = Date.now()
    add(a.reward, `Achievement: ${a.name}`)
    $.ui.toast(`Achievement unlocked: ${a.name}  (+${a.reward} genes)`)
    void play($, 'fanfare')
  }
  await $.store.set('genes', book)
  await update($, lab, l => ({ ...l, genes: book.balance, savedTokens: book.counters.savedTokens ?? l.savedTokens }))
}

// ── helpers ──────────────────────────────────────────────────────────────────
function play($: EngineInterface, name: string): Promise<void> {
  return $.audio.play({ asset: `assets/sfx/${name}.mp3` }).catch(() => undefined)
}

const base = (p: unknown) => (typeof p === 'string' ? p.split(/[\\/]/).pop() ?? p : 'a file')
const short = (s: unknown, n = 48) => {
  const t = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

type Doing = { who: string; activity: Activity; label: string }

/** What a real tool call looks like in the lab. */
function doingFor(tool: string, input: Record<string, unknown>): Doing {
  switch (tool) {
    case 'Bash':
      return { who: 'blip', activity: 'coding', label: `Running: ${short(input.command) || 'a command'}` }
    case 'Edit':
    case 'MultiEdit':
      return { who: 'zib', activity: 'files', label: `Editing ${base(input.file_path)}` }
    case 'Write':
      return { who: 'zib', activity: 'files', label: `Writing ${base(input.file_path)}` }
    case 'NotebookEdit':
      return { who: 'zib', activity: 'files', label: `Editing ${base(input.notebook_path)}` }
    case 'Read':
      return { who: 'mossy', activity: 'research', label: `Reading ${base(input.file_path)}` }
    case 'Grep':
      return { who: 'mossy', activity: 'research', label: `Searching for "${short(input.pattern, 30)}"` }
    case 'Glob':
      return { who: 'mossy', activity: 'research', label: `Finding ${short(input.pattern, 30)}` }
    case 'LSP':
      return { who: 'mossy', activity: 'research', label: 'Inspecting the code' }
    case 'WebSearch':
      return { who: 'mossy', activity: 'web', label: `Web search: ${short(input.query, 36)}` }
    case 'WebFetch':
      return { who: 'mossy', activity: 'web', label: `Fetching ${short(String(input.url ?? '').replace(/^https?:\/\//, ''), 36)}` }
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TaskList':
    case 'TaskGet':
      return { who: 'pounce', activity: 'planning', label: 'Updating the plan' }
    case 'AskUserQuestion':
      return { who: 'blip', activity: 'question', label: 'Has a question for you!' }
    case 'Agent':
    case 'Workflow':
      return { who: 'blip', activity: 'cloning', label: `Cloning a helper: ${short(input.description, 36) || 'subtask'}` }
    default:
      return { who: 'blip', activity: 'thinking', label: `Using ${tool}` }
  }
}

function firstQuestion(input: Record<string, unknown>): string {
  const qs = input.questions
  if (Array.isArray(qs) && qs[0] && typeof qs[0] === 'object') {
    const q = (qs[0] as Record<string, unknown>).question
    if (typeof q === 'string') return q
  }
  return 'I need your call on something!'
}

const setAlien = (l: Lab, id: string, activity: Activity, label: string, now: number): Lab => ({
  ...l,
  crew: l.crew.map(a => (a.id === id ? { ...a, activity, label, since: now } : a)),
  caption: `${l.crew.find(a => a.id === id)?.name ?? 'Crew'}: ${label}`,
})

const restCrew = (l: Lab, now: number): Lab => ({
  ...l,
  crew: l.crew.map(a =>
    a.id === 'glorp' && l.idea
      ? { ...a, activity: 'ideas' as Activity, label: `Brainstorming: ${short(l.idea, 40)}`, since: now }
      : a.id === 'mossy'
        ? { ...a, activity: 'sleeping' as Activity, label: 'Napping on the beanbag', since: now }
        : { ...a, activity: 'idle' as Activity, label: a.id === 'blip' ? 'Waiting for orders' : 'On break', since: now },
  ),
})

async function persistSettings($: EngineInterface, next: (s: LabSettings) => LabSettings) {
  const s = await update($, settings, next)
  await $.store.set('settings', s)
  return s
}

async function statusLine($: EngineInterface) {
  const [f, l, s] = await Promise.all([read($, fuel), read($, lab), read($, settings)])
  const w = f.windows.length ? f.windows.reduce((a, b) => (b.percentUsed > a.percentUsed ? b : a)) : null
  const fuelText = w && f.remaining !== null ? `fuel ${Math.round(f.remaining)}% (${windowName(w.kind)})` : 'fuel: no reading yet'
  $.ui.status(`GLOB LABS | ${fuelText} | ${l.genes} genes | saver ${s.saver ? 'on' : 'off'}${l.idea ? ' | idea mode' : ''}`)
}

/** Fold a usage reading into the tank; sound the alarm when a marker is crossed. */
async function measure($: EngineInterface, windows: readonly { kind: string; percentUsed: number; resetsAt?: string }[], contextPercent?: number, costUsd?: number) {
  const now = await $.clock.now()
  const before = await read($, fuel)
  const remaining = remainingOf(windows)
  const tier = tierOf(remaining)
  const worse = before.remaining !== null && TIER_RANK[tier] > TIER_RANK[before.tier]
  const next: Fuel = {
    windows: windows.map(w => ({ kind: w.kind, percentUsed: w.percentUsed, ...(w.resetsAt ? { resetsAt: w.resetsAt } : {}) })),
    tier,
    remaining,
    updatedAt: now,
    alarmUntil: worse ? now + 15000 : before.alarmUntil,
    ...(contextPercent !== undefined ? { contextPercent } : before.contextPercent !== undefined ? { contextPercent: before.contextPercent } : {}),
    ...(costUsd !== undefined ? { costUsd } : before.costUsd !== undefined ? { costUsd: before.costUsd } : {}),
  }
  await update($, fuel, () => next)
  if (worse) {
    const s = await read($, settings)
    void play($, 'alarm')
    $.ui.toast(`FUEL ${TIER_LABEL[tier].toUpperCase()}: ${Math.round(remaining ?? 0)}% left. ${s.saver ? 'Auto-Saver: ' + saverActions(tier) : 'Auto-Saver is off (/glob saver on).'}`, { timeoutMs: 9000 })
    if (s.saver) void earn($, 0, 'saver', { saverTrips: 1 })
    $.clock.after(15500, () => { void update($, fuel, f => ({ ...f })) })
  }
  await statusLine($)
}

const toolsThisTurn = { count: 0, files: 0 }

// ── register ─────────────────────────────────────────────────────────────────
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const stored = (await $.store.get('settings')) as Partial<LabSettings> | undefined
    if (stored) await update($, settings, s => ({ ...s, ...stored }))
    const book = await readBook($)
    await update($, lab, l => ({ ...l, genes: book.balance, savedTokens: book.counters.savedTokens ?? 0 }))

    await $.command.register({ name: 'glob', description: 'Open the GLOB LABS pane · /glob saver on|off', argumentHint: '[saver on|off]', immediate: true })
    await $.command.register({ name: 'fuel', description: 'GLOB LABS fuel report: real usage windows, tier, Auto-Saver actions', immediate: true })
    await $.command.register({ name: 'caveman', description: 'Terse output to save tokens: off | lite | full | ultra | auto', argumentHint: '[off|lite|full|ultra|auto]', immediate: true })
    await $.command.register({ name: 'polish', description: 'Trim filler from your prompts before they send: off | on | model', argumentHint: '[off|on|model]', immediate: true })
    await $.command.register({ name: 'idea', description: 'Brainstorm a game with Prof. Glorp until it is clear, then get the build prompt', argumentHint: '<your game idea> | done' })
    await $.command.register({ name: 'genes', description: 'GLOB LABS Gene Points, ledger and achievements', immediate: true })

    const unpainted = problems.find(p => p.startsWith("Desktop won't paint"))
    if (unpainted) $.ui.log(`glob-labs look: ${unpainted}`)
    void $.theme.set(LOOK).catch(() => undefined)

    const usage = await $.session.usage().catch(() => null)
    if (usage) await measure($, usage.rateLimits, usage.context.percent, usage.cost?.usd)
    void $.ui.open({ id: PANE, title: 'GLOB LAB' }).catch(() => undefined)
    return next(e)
  })

  // Real usage, pushed by the engine whenever a window moves a whole point.
  on('session.measure', async ($, e, next) => {
    await measure($, e.rateLimits, e.context.percent, e.cost?.usd)
    return next(e)
  })

  // ── the crew follows Claude's real work ──
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      toolsThisTurn.count = 0
      toolsThisTurn.files = 0
      const now = await $.clock.now()
      await update($, lab, l => setAlien(restCrew(l, now), 'blip', 'thinking', `Reading: ${short(e.text, 40) || 'your request'}`, now))
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    const tool = String(e.tool)
    const d = doingFor(tool, input)
    const now = await $.clock.now()
    if (e.agentId !== undefined) {
      await update($, lab, l => ({
        ...l,
        clones: l.clones.map(c => (c.id === e.agentId ? { ...c, activity: d.activity === 'question' ? 'thinking' : d.activity, label: d.label } : c)),
      }))
      return next(e)
    }
    toolsThisTurn.count++
    const question = tool === 'AskUserQuestion' ? firstQuestion(input) : null
    await update($, lab, l => ({ ...setAlien(l, d.who, d.activity, d.label, now), ...(question ? { question } : {}) }))
    if (question) void play($, 'question')
    const ran = await next(e)
    const ok = ran.deny === undefined && ran.isError !== true
    if (ok && (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit')) toolsThisTurn.files++
    const after = await $.clock.now()
    await update($, lab, l => {
      const cleared = question ? { ...l, question: null } : l
      if (d.who === 'blip') return setAlien(cleared, 'blip', 'thinking', ok ? 'Back at the console' : `Hit a snag with ${tool}`, after)
      const home = setAlien(cleared, d.who, 'idle', ok ? 'Done ✓' : 'Hit a snag', after)
      return { ...home, caption: cleared.caption }
    })
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    if (e.agentId !== undefined) {
      await update($, lab, l => ({ ...l, clones: l.clones.map(c => (c.id === e.agentId ? { ...c, activity: 'celebrating' as Activity, label: 'Delivered ✓' } : c)) }))
      $.clock.after(2600, () => { void update($, lab, l => ({ ...l, clones: l.clones.filter(c => c.id !== e.agentId) })) })
      if (e.reason === 'answer') void earn($, 3, 'A clone delivered', { clones: 1 })
      return next(e)
    }
    if (e.reason === 'answer') {
      await update($, lab, l => setAlien(restCrew(l, now), 'blip', 'celebrating', 'Experiment complete!', now))
      const reward = 3 + Math.min(5, toolsThisTurn.count) + Math.min(10, toolsThisTurn.files)
      void earn($, reward, `Experiment complete (${toolsThisTurn.count} tools)`, { turns: 1, files: toolsThisTurn.files })
      void play($, 'coin')
      $.clock.after(3500, () => {
        void update($, lab, l => (l.crew.find(a => a.id === 'blip')?.activity === 'celebrating' ? setAlien(l, 'blip', 'idle', 'Waiting for orders', now + 3500) : l))
      })
    } else {
      await update($, lab, l => setAlien(restCrew(l, now), 'blip', 'idle', e.reason === 'aborted' ? 'Stopped. Waiting for orders' : 'Experiment exploded (the turn failed)', now))
    }
    await update($, lab, l => ({ ...l, question: null }))
    return next(e)
  })

  // ── Auto-Saver ──
  // Effort per request: only ever lowered, to the tier's cap.
  on('turn.step', async function* ($, e, next) {
    const [s, f] = await Promise.all([read($, settings), read($, fuel)])
    const capped = s.saver ? cappedEffort(e.effort, f.tier) : undefined
    return yield* next(capped ? { ...e, effort: capped } : e)
  })

  // Subagents: none at critical, one at a time at quarter. Fails open.
  on('agent.spawn', async ($, e, next) => {
    const [s, f] = await Promise.all([read($, settings), read($, fuel)])
    if (s.saver) {
      const limit = cloneLimit(f.tier)
      if (limit === 0) {
        $.ui.toast('Auto-Saver held back a clone: fuel is under 10%.')
        return { deny: `GLOB LABS Auto-Saver: the user's Claude usage is under 10% of its limit, so no new subagents right now. Do this part yourself in the main thread, as briefly as you can. (The user can turn this off with /glob saver off.)` }
      }
      if (Number.isFinite(limit)) {
        const running = (await $.agent.list()).filter(a => a.status === 'running').length
        if (running >= limit) {
          return { deny: `GLOB LABS Auto-Saver: usage is under 25% of the limit, so only ${limit} subagent may run at a time and one is running. Wait for it, or do this part yourself.` }
        }
      }
    }
    const r = await next(e)
    if (r.deny === undefined && r.agentId) {
      const now = await $.clock.now()
      const clone: Clone = { id: r.agentId, label: short(e.description, 50) || 'Helping out', activity: 'thinking', since: now }
      await update($, lab, l => ({ ...l, clones: [...l.clones.filter(c => c.id !== clone.id), clone] }))
      void play($, 'portal')
    }
    return r
  }).catch(($, e, next) => next(e))

  // Prompt: optional polish, plus the notes the model reads beside it.
  on('prompt.submit', async ($, e, next) => {
    if (e.command !== undefined || e.isMeta) return next(e)
    const [s, f, l] = await Promise.all([read($, settings), read($, fuel), read($, lab)])
    let text = e.text
    if (s.polish !== 'off' && text.length > 40 && !/^\s*\//.test(text)) {
      let out = compress(text)
      if (s.polish === 'model' && text.length > 280) {
        const r = await $.model.complete({ model: 'haiku', system: POLISH_SYSTEM, prompt: text, maxTokens: Math.min(4000, estimateTokens(text) + 200), effort: 'low' }).catch(() => null)
        const candidate = r && r.isAnswered ? r.text.trim() : ''
        if (candidate && candidate.length < out.text.length && keepsMeaning(out.text, candidate)) {
          out = { text: candidate, before: out.before, after: estimateTokens(candidate), saved: Math.max(0, out.before - estimateTokens(candidate)) }
        }
      }
      if (out.saved > 0) {
        text = out.text
        $.ui.toast(`Prompt polished: trimmed ~${out.saved} tokens (${Math.round((out.saved / out.before) * 100)}%)`)
        void earn($, out.saved >= 20 ? 1 : 0, 'Trimmed a prompt', { savedTokens: out.saved })
      }
    }
    const context = [...(e.context ?? [])]
    const cave = cavemanLevel(s.caveman, f.tier, s.saver)
    if (cave !== 'off') context.push(CAVEMAN[cave])
    if (s.saver && (f.tier === 'quarter' || f.tier === 'critical')) context.push(SAVER_NOTE[f.tier])
    if (l.idea) context.push(GLORP_RESUME)
    return next({ ...e, text, ...(context.length ? { context } : {}) })
  }).catch(($, e, next) => next(e))

  // ── commands ──
  on('command.run', { command: 'glob' }, async ($, e) => {
    const args = e.args.trim().toLowerCase()
    if (args.startsWith('saver')) {
      const want = args.endsWith('off') ? false : args.endsWith('on') ? true : undefined
      const s = await persistSettings($, cur => ({ ...cur, saver: want ?? !cur.saver }))
      await statusLine($)
      return { text: `Auto-Saver ${s.saver ? 'ON: effort, clones and output shrink as fuel drops (50/25/10% markers).' : 'OFF: no automatic limits.'}` }
    }
    const opened = await $.ui.open({ id: PANE, title: 'GLOB LAB' })
    return { text: opened.isPlaced ? 'GLOB LAB pane opened.' : `GLOB LAB pane is waiting for room: ${opened.reason}` }
  })

  on('command.run', { command: 'fuel' }, async $ => {
    const usage = await $.session.usage().catch(() => null)
    if (usage) await measure($, usage.rateLimits, usage.context.percent, usage.cost?.usd)
    const [f, s] = await Promise.all([read($, fuel), read($, settings)])
    const now = await $.clock.now()
    const lines = f.windows.length
      ? f.windows.map(w => `  ${windowName(w.kind).padEnd(12)} ${String(Math.round(100 - w.percentUsed)).padStart(3)}% left  ${resetsIn(w.resetsAt, now)}`)
      : ['  No usage windows reported yet (they appear after the first reply on a Claude subscription; API-key sessions have none).']
    return {
      text: [
        `GLOB LABS fuel: ${f.remaining === null ? 'no reading' : `${Math.round(f.remaining)}% left in the emptiest window`} · ${TIER_LABEL[f.tier]}`,
        ...lines,
        `  Context ${f.contextPercent ?? '--'}% · session cost ${f.costUsd !== undefined ? '$' + f.costUsd.toFixed(2) : '--'}`,
        `Auto-Saver ${s.saver ? 'on' : 'off'}: ${saverActions(f.tier)}`,
        `Caveman: ${s.caveman} (in force: ${cavemanLevel(s.caveman, f.tier, s.saver)}) · Polish: ${s.polish}`,
      ].join('\n'),
    }
  })

  on('command.run', { command: 'caveman' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase() as CavemanMode
    const modes: CavemanMode[] = ['off', 'lite', 'full', 'ultra', 'auto']
    if (!modes.includes(arg)) {
      const s = await read($, settings)
      return { text: `Caveman is ${s.caveman}. Use /caveman off | lite | full | ultra | auto (auto follows the fuel tank).` }
    }
    await persistSettings($, s => ({ ...s, caveman: arg }))
    if (arg !== 'off') void earn($, 0, 'caveman', { caveman: 1 })
    return { text: arg === 'off' ? 'Caveman off. Normal answers.' : arg === 'auto' ? 'Caveman auto: lite below 25% fuel, full below 10%.' : `Caveman ${arg}: me write short. Code stay exact.` }
  })

  on('command.run', { command: 'polish' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase() as PolishMode
    if (!(['off', 'on', 'model'] as PolishMode[]).includes(arg)) {
      const s = await read($, settings)
      return { text: `Polish is ${s.polish}. /polish on trims filler locally (free); /polish model also asks Haiku to tighten long prompts and keeps the result only if every key term survived; /polish off.` }
    }
    await persistSettings($, s => ({ ...s, polish: arg }))
    return { text: `Prompt polish ${arg}.` }
  })

  on('command.run', { command: 'idea' }, async ($, e) => {
    const idea = e.args.trim()
    const now = await $.clock.now()
    if (/^(done|off|stop|exit)$/i.test(idea)) {
      await update($, lab, l => setAlien({ ...l, idea: null }, 'glorp', 'celebrating', 'Idea locked in!', now))
      void play($, 'fanfare')
      return { text: 'Prof. Glorp idea mode off. Go build it!' }
    }
    if (!idea) return { text: 'Usage: /idea <your game idea>  ·  /idea done to finish.' }
    await update($, lab, l => setAlien({ ...l, idea }, 'glorp', 'ideas', `Brainstorming: ${short(idea, 40)}`, now))
    void earn($, 5, 'Started an idea session', { ideas: 1 })
    void play($, 'boing')
    await $.prompt.submit({ text: `Prof. Glorp, let's develop my game idea: ${idea}` })
    return { text: `Prof. Glorp grabbed the chalk. Brainstorming: ${idea}`, context: [glorp(idea)] }
  })

  on('command.run', { command: 'genes' }, async $ => {
    const book = await readBook($)
    const got = ACHIEVEMENTS.filter(a => book.achievements[a.id]).map(a => a.name)
    const todo = ACHIEVEMENTS.filter(a => !book.achievements[a.id]).map(a => `${a.name} (+${a.reward})`)
    return {
      text: [
        `Gene Points: ${book.balance} (lifetime ${book.lifetime})`,
        ...book.ledger.slice(0, 8).map(r => `  +${r.amount}  ${r.reason}`),
        `Achievements: ${got.length ? got.join(', ') : 'none yet'}`,
        `Still to unlock: ${todo.join(', ') || 'all done!'}`,
        'Spend them in the GLOB LABS web app (furniture, hats, the idea slot machine).',
      ].join('\n'),
    }
  })

  // ── drawing ──
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [l, f, s] = await Promise.all([read($, lab), read($, fuel), read($, settings)])
    const now = await $.clock.now()
    const busy = l.crew.filter(a => a.activity !== 'idle' && a.activity !== 'sleeping')
    const fuelLine = f.remaining === null
      ? 'Fuel: waiting for the first usage reading'
      : `Fuel ${Math.round(f.remaining)}% left · ${TIER_LABEL[f.tier]}${s.saver && f.tier !== 'full' ? ' · Auto-Saver: ' + saverActions(f.tier) : ''}`
    const cave = cavemanLevel(s.caveman, f.tier, s.saver)
    const toggles = {
      saver: () => persistSettings($, c => ({ ...c, saver: !c.saver })).then(() => statusLine($)),
      caveman: () => persistSettings($, c => ({ ...c, caveman: (['off', 'lite', 'full', 'ultra', 'auto'] as CavemanMode[])[(['off', 'lite', 'full', 'ultra', 'auto'].indexOf(c.caveman) + 1) % 5] ?? 'off' })),
      polish: () => persistSettings($, c => ({ ...c, polish: (['off', 'on', 'model'] as PolishMode[])[(['off', 'on', 'model'].indexOf(c.polish) + 1) % 3] ?? 'off' })),
    }

    if (e.surface === 'terminal') {
      const { Box, Text, Button, Progress } = $.ui.resolve(e)
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold color="success">GLOB LABS</Text>
          <Box flexDirection="column">
            {l.crew.map(a => (
              <Text dimColor={a.activity === 'idle' || a.activity === 'sleeping'}>
                {a.activity === 'sleeping' ? 'z ' : a.activity === 'idle' ? '. ' : '* '}{a.name}: {a.label}
              </Text>
            ))}
            {l.clones.map((c, i) => <Text color="success">+ clone {i + 1}: {c.label}</Text>)}
          </Box>
          {l.question !== null && <Text bold color="warning">? {l.question}</Text>}
          {f.windows.length === 0
            ? <Text dimColor>Fuel: no usage reading yet</Text>
            : f.windows.map(w => (
              <Progress label={`${windowName(w.kind)} fuel`} value={Math.max(0, 100 - w.percentUsed)} max={100} valueText={`${Math.round(100 - w.percentUsed)}% left ${resetsIn(w.resetsAt, now)}`} color={tierOf(100 - w.percentUsed) === 'full' ? 'success' : tierOf(100 - w.percentUsed) === 'critical' ? 'error' : 'warning'} />
            ))}
          <Text dimColor>{fuelLine}</Text>
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Button key="saver" onPress={toggles.saver}>Saver {s.saver ? 'on' : 'off'}</Button>
            <Button key="caveman" onPress={toggles.caveman}>Caveman {s.caveman}</Button>
            <Button key="polish" onPress={toggles.polish}>Polish {s.polish}</Button>
          </Box>
          <Text dimColor>{l.genes} genes · {l.savedTokens} tokens trimmed</Text>
        </Box>
      )
    }

    const { Box, Text, Button, Svg } = $.ui.resolve(e)
    if (e.props.placement === 'widget') {
      return <Svg source={glanceSvg(l, f)} alt={`GLOB LABS: ${busy.length ? busy.map(a => `${a.name} ${a.label}`).join('; ') : 'crew idle'}; ${fuelLine}`} isInteractive />
    }
    const alt = `The GLOB LABS alley lab. ${busy.length ? busy.map(a => `${a.name}: ${a.label}`).join('. ') : 'The crew is idle.'}${l.clones.length ? ` ${l.clones.length} clone(s) working.` : ''}`
    return (
      <Box flexDirection="column" gap={1}>
        <Svg source={labSvg(l, f, now)} alt={alt} isInteractive />
        <Text bold color={l.question ? 'warning' : 'success'}>{l.question ? `Blip has a question: ${l.question}` : l.caption}</Text>
        {l.clones.length > 0 && <Text dimColor>{l.clones.length} clone{l.clones.length > 1 ? 's' : ''} at work: {l.clones.map(c => c.label).join(' · ')}</Text>}
        <Svg source={tankSvg(f, now)} alt={fuelLine} isInteractive />
        <Text dimColor>{fuelLine}{cave !== 'off' ? ` · caveman ${cave} in force` : ''}</Text>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Button key="saver" variant={s.saver ? 'primary' : 'secondary'} onPress={toggles.saver}>Auto-Saver {s.saver ? 'on' : 'off'}</Button>
          <Button key="caveman" onPress={toggles.caveman}>Caveman: {s.caveman}</Button>
          <Button key="polish" onPress={toggles.polish}>Polish: {s.polish}</Button>
        </Box>
        <Text dimColor>{l.genes} Gene Points · {l.savedTokens} tokens trimmed{l.idea ? ` · Prof. Glorp is brainstorming “${short(l.idea, 40)}”` : ''}</Text>
      </Box>
    )
  })

  // The moving alley behind the whole conversation (desktop + mobile).
  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)
    if (e.props.scene !== 'alley') return next(e)
    const { Svg } = $.ui.resolve(e)
    return <Svg source={BACKDROP} alt="A night alley: brick walls, buzzing neon signs and a UFO drifting past" isInteractive />
  })

  // A question from Claude: the alien who asked runs over with it.
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const node = await next(e)
    const { Box, Text } = $.ui.resolve(e)
    const l = await read($, lab)
    return (
      <Box flexDirection="column">
        <Text bold color="success">{l.idea ? 'Prof. Glorp' : 'Blip'} came running over with a question!</Text>
        {node}
      </Box>
    )
  })
}

// Keep the type import used for readers of this file.
export type { Tier }
