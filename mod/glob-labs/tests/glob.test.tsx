import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cappedEffort, cavemanLevel, cloneLimit, remainingOf, tierOf } from '../hooks/fuel'
import { compress, keepsMeaning } from '../hooks/polish'
import { labSvg, tankSvg } from '../hooks/scene'

const PANE = {
  plugin: 'glob-labs',
  component: 'Pane',
  requestId: 'glob-lab',
  props: {
    title: 'GLOB LAB',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const WINDOWS = [
  { kind: 'five_hour', percentUsed: 92.5, resetsAt: '2030-01-01T00:00:00Z' },
  { kind: 'seven_day', percentUsed: 40 },
]

/** Stand-ins for the engine beneath the plugin. */
function engine(on: On, percentUsed = 92.5) {
  mock.store(on)
  mock.clock(on, { now: Date.parse('2029-12-31T20:00:00Z') })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('theme.set', () => ({ value: { isDrawn: false, reason: 'no app attached in a test' } }))
  on('audio.play', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 1_000_000, tokens: 250_000, percent: 25 },
      rateLimits: [{ ...WINDOWS[0]!, percentUsed }, WINDOWS[1]!],
      cost: { usd: 1.5 },
    },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
}

test('fuel tiers follow the 50 / 25 / 10 markers of the emptiest window', () => {
  expect(remainingOf([])).toBe(null)
  expect(tierOf(remainingOf([{ kind: 'a', percentUsed: 30 }]))).toBe('full')
  expect(tierOf(remainingOf([{ kind: 'a', percentUsed: 30 }, { kind: 'b', percentUsed: 55 }]))).toBe('half')
  expect(tierOf(remainingOf([{ kind: 'a', percentUsed: 80 }]))).toBe('quarter')
  expect(tierOf(remainingOf([{ kind: 'a', percentUsed: 95 }]))).toBe('critical')
  expect(cloneLimit('critical')).toBe(0)
  expect(cloneLimit('quarter')).toBe(1)
})

test('the Auto-Saver only ever lowers effort', () => {
  expect(cappedEffort('max', 'half')).toBe('high')
  expect(cappedEffort('xhigh', 'quarter')).toBe('medium')
  expect(cappedEffort('high', 'critical')).toBe('low')
  expect(cappedEffort('low', 'quarter')).toBe(undefined)
  expect(cappedEffort(undefined, 'half')).toBe(undefined)
  expect(cappedEffort(undefined, 'critical')).toBe('low')
  expect(cappedEffort('max', 'full')).toBe(undefined)
  expect(cavemanLevel('auto', 'critical', true)).toBe('full')
  expect(cavemanLevel('auto', 'critical', false)).toBe('off')
  expect(cavemanLevel('ultra', 'full', true)).toBe('ultra')
})

test('polish trims filler and keeps code, paths and numbers', () => {
  const p = 'Hey Claude, could you please make the player jump 2x higher in src/player.ts? I would really like you to also add a "double jump" ability. Thanks so much!'
  const out = compress(p)
  expect(out.saved).toBeGreaterThan(0)
  expect(out.text).toContain('src/player.ts')
  expect(out.text).toContain('2x')
  expect(out.text).toContain('"double jump"')
  expect(out.text).not.toContain('please')
  expect(keepsMeaning(out.text, 'Make player jump 2x higher in src/player.ts; add "double jump".')).toBe(true)
  expect(keepsMeaning(out.text, 'Make the player jump higher.')).toBe(false)
  const code = 'Please fix this:\n```ts\nconst please = 1 // please keep\n```'
  expect(compress(code).text).toContain('const please = 1 // please keep')
})

test('the lab drawings stay under the Svg size limit', () => {
  const crew = ['blip', 'zib', 'mossy', 'glorp', 'pounce'].map(id => ({ id, name: id, skin: id === 'pounce' ? ('pounce' as const) : ('glob' as const), activity: 'coding' as const, label: 'Running: a very long command that keeps going and going', since: 0 }))
  const clones = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, label: 'clone work', activity: 'files' as const, since: 0 }))
  const lab = { crew, clones, caption: '', question: 'A long question that goes on for a while to fill the bubble with text?', idea: 'x', genes: 1, savedTokens: 0 }
  const fuel = { windows: WINDOWS, tier: 'critical' as const, remaining: 7.5, updatedAt: 0, alarmUntil: 0 }
  expect(labSvg(lab, fuel, 0).length).toBeLessThan(131072)
  expect(tankSvg(fuel, 0).length).toBeLessThan(131072)
})

test('the pane shows real usage and the crew acting out a tool call, on every surface', async ($, on) => {
  engine(on)
  let during: string | undefined
  on('tool.call', async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    during = (await ui.find({ type: 'Text', text: /Running: npm test/ }))?.text
    await ui.unmount()
    return { result: {} }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(during).toBe('Blip: Running: npm test')

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Fuel 8% left/ })).toBeDefined()
    expect(await ui.find({ key: 'saver' })).toBeDefined()
    await ui.unmount()
  }
})

test('at critical fuel a new subagent is held back; with the saver off it runs', async ($, on) => {
  engine(on, 95)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  on('agent.list', () => ({ value: [] }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const spawn = { subagentType: 'general-purpose', prompt: 'look into it', description: 'research', tool_use_id: 'tu1', provider: { plugin: 'engine', tier: 'core' as const }, parentModel: 'claude-opus-5-5', background: false, fork: false }
  const held = await $.agent.spawn(spawn)
  expect(held.deny).toContain('Auto-Saver')

  await $.command.run({ command: 'glob', args: 'saver off', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  const ran = await $.agent.spawn(spawn)
  expect(ran.deny).toBe(undefined)
  expect(ran.agentId).toBe('a1')
})

test('effort is lowered per request at low fuel', async ($, on) => {
  engine(on, 80)
  let sent: unknown
  on('turn.step', async function* (_, e) {
    sent = e.effort
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'xhigh', messageCount: 1 })
  for await (const _ of stream) { /* drain */ }
  await stream.result
  expect(sent).toBe('medium')
})

test('caveman notes ride beside the prompt, never in its text', async ($, on) => {
  engine(on, 95)
  let seen: { text: string; context?: readonly string[] } = { text: '' }
  on('prompt.submit', (_, e) => {
    seen = { text: e.text, context: e.context }
    return { text: e.text, context: e.context }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'build the level editor', wait: false, origin: { kind: 'composer' } })
  expect(seen.text).toBe('build the level editor')
  expect((seen.context ?? []).join('\n')).toContain('caveman')
})

test('a command name someone else owns is skipped, and the rest of the lab still starts', async ($, on) => {
  engine(on)
  on('command.register', { name: 'glob-caveman' }, () => { throw new Error('refused: it is the user\'s /glob-caveman') })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Fuel 8% left/ })).toBeDefined()
  await ui.unmount()
  const out = await $.command.run({ command: 'glob', args: 'caveman ultra', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  expect(out.text).toContain('Caveman ultra')
})
