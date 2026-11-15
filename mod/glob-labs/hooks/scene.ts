// The lab pane as SVG built from plain data (no `$`, cheap to test): the real GLOB LABS ship
// deck render with pixel-finished voxel sprites of the crew placed where their real work puts
// them. Pixel-art styling only: crisp edges, square corners, no glow filters.
import type { Activity, Alien, Clone, Fuel, Lab, Tier } from '../types'
import { resetsIn, tierOf, windowName } from './fuel'

// ── art ──────────────────────────────────────────────────────────────────────
// Real voxel renders (hooks/art.ts): the ship deck and pixel-finished photos of each alien.
import { DECK, FONT_FACE, SPOTS, SPRITES } from './art'

const SW = 28, SH = 34 // sprite size in pane units = source px: same pixel density as the deck render

/** sprite key for an alien in an activity */
function spriteKey(id: string, a: Activity): string {
  const base = SPRITES[id] ? id : 'blip'
  if (a === 'sleeping') return base + '-shut'
  if (a === 'question' && base === 'glorp') return 'glorp-q'
  if (a === 'coding' || a === 'files' || a === 'research' || a === 'web' || a === 'planning' || a === 'cloning') return SPRITES[base + '-work'] ? base + '-work' : base
  return base
}

/** <image> defs for exactly the sprites a frame uses (keeps the SVG well under its size cap). */
function spriteDefs(keys: Iterable<string>): string {
  let out = ''
  for (const k of new Set(keys)) if (SPRITES[k]) out += `<image id="s-${k}" href="${SPRITES[k]}" width="${SW}" height="${SH}" style="image-rendering:pixelated"/>`
  return out
}


const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

// ── style (pixel animations only: steps(), whole-pixel moves) ────────────────
const CSS = `<style>${FONT_FACE}
text{font-family:PixelSans,ui-monospace,monospace}
image{image-rendering:pixelated}
.bob{animation:bob 1.8s steps(2) infinite}@keyframes bob{50%{transform:translateY(-1px)}}
.type{animation:type .3s steps(2) infinite}@keyframes type{50%{transform:translateY(-1px)}}
.walk{animation:walk 2.6s steps(13) infinite alternate}@keyframes walk{to{transform:translateX(26px)}}
.hop{animation:hop .8s steps(4) infinite}@keyframes hop{50%{transform:translateY(-6px)}}
.breathe{animation:breathe 3.2s steps(2) infinite}@keyframes breathe{50%{transform:translateY(1px)}}
.run{animation:run .36s steps(2) infinite}@keyframes run{50%{transform:translateY(-2px)}}
.zz{animation:zz 2.6s steps(8) infinite}.zz2{animation:zz 2.6s steps(8) 1.3s infinite}
@keyframes zz{0%{transform:translate(0,0);opacity:0}20%{opacity:1}100%{transform:translate(6px,-14px);opacity:0}}
.lamp{animation:lamp .7s steps(1) infinite}@keyframes lamp{50%{opacity:.15}}
.blink{animation:lamp 1.2s steps(1) infinite}
.emerge{animation:emerge .9s steps(6) both}@keyframes emerge{from{transform:translateY(-8px);opacity:0}to{transform:none;opacity:1}}
.spark{animation:spark 1s steps(4) infinite}@keyframes spark{0%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-6px)}}
.bub{animation:bub 2.4s steps(12) infinite}@keyframes bub{0%{transform:translateY(0);opacity:.9}100%{transform:translateY(-44px);opacity:0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>`

/** little pixel props an alien holds up for its activity (square pixels only) */
function extras(a: Activity): string {
  const px = (x: number, y: number, c: string, w = 1, h = 1, cls = '') => `<rect ${cls ? `class="${cls}" ` : ''}x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`
  switch (a) {
    case 'thinking':
      return `<g class="blink">${px(19, 2, '#e8ffe6')}${px(21, 0, '#e8ffe6', 2, 2)}${px(23, -3, '#e8ffe6', 3, 3)}</g>`
    case 'ideas':
      return `<g class="blink">${px(8, -6, '#ffe66b', 4, 4)}${px(9, -2, '#9aa7b0', 2, 1)}</g>`
    case 'sleeping':
      return `<text class="zz" x="15" y="4" font-size="6" fill="#bfe8ff">z</text><text class="zz2" x="17" y="0" font-size="5" fill="#bfe8ff">z</text>`
    case 'celebrating':
      return `${px(-2, 4, '#ffe66b', 2, 2, 'spark')}${px(20, 2, '#ff6fd6', 2, 2, 'spark')}${px(9, -4, '#52f2ff', 2, 2, 'spark')}`
    case 'question':
      return `<text x="18" y="2" font-size="9" fill="#ffbe3d">!</text>`
    default:
      return ''
  }
}

function animClass(a: Activity): string {
  switch (a) {
    case 'coding': case 'planning': return 'type'
    case 'files': return 'walk'
    case 'celebrating': return 'hop'
    case 'sleeping': return 'breathe'
    case 'question': return 'run'
    default: return 'bob'
  }
}

// ── where everyone stands (feet positions in the 320×200 pane) ───────────────
const STATION_OF: Partial<Record<Activity, string[]>> = {
  coding: ['pc0', 'pc1', 'pc2'], thinking: ['pc1', 'pc0', 'pc2'], files: ['cabinet'], research: ['books', 'scope'],
  web: ['scope', 'books'], planning: ['wb'], ideas: ['glorp'], cloning: ['vat0', 'vat1'],
}
const HOME: Record<string, [number, number]> = {
  glorp: [74, 146], blip: [132, 156], zib: [184, 162], mossy: [104, 168], pounce: [232, 158],
}
const CLONE_SPOTS: readonly [number, number][] = [[98, 106], [116, 110], [84, 114], [130, 116], [104, 122], [70, 108]]
const QUESTION_SPOT: [number, number] = [160, 186]

function spotFor(alien: Alien, used: Map<string, number>): [number, number] {
  if (alien.activity === 'question') return QUESTION_SPOT
  const ids = STATION_OF[alien.activity]
  if (ids) {
    for (const id of ids) {
      const n = used.get(id) ?? 0
      const sp = SPOTS[id]
      if (sp && n === 0) { used.set(id, 1); return [sp.x, sp.y] }
    }
    const first = ids[0] ?? ''
    const sp = SPOTS[first]
    if (sp) { const n = used.get(first) ?? 1; used.set(first, n + 1); return [sp.x + n * 12, sp.y + 6] }
  }
  return HOME[alien.id] ?? [150, 160]
}

function drawSprite(key: string, x: number, y: number, activity: Activity, title: string, name: string | null, extraClass = '', scale = 1): string {
  const inner = `<g class="${animClass(activity)}"><use href="#s-${key}"/>${extras(activity)}</g>`
  const wrapped = extraClass ? `<g class="${extraClass}">${inner}</g>` : inner
  const tag = name ? `<g><rect x="${(SW - name.length * 3.4) / 2 - 1}" y="${SH + 1}" width="${name.length * 3.4 + 2}" height="6" fill="#0b120e" opacity=".85"/><text x="${SW / 2}" y="${SH + 5.6}" text-anchor="middle" font-size="5" fill="#e8ffe6">${esc(name)}</text></g>` : ''
  const sx = x - (SW * scale) / 2, sy = y - SH * scale
  return `<g transform="translate(${Math.round(sx)} ${Math.round(sy)})${scale !== 1 ? ` scale(${scale})` : ''}"><title>${esc(title)}</title><rect x="5" y="${SH - 1}" width="10" height="2" fill="#000" opacity=".35"/>${wrapped}${tag}</g>`
}

function bubble(text: string): string {
  const lines: string[] = []
  let line = ''
  for (const w of cut(text, 110).split(/\s+/)) {
    if ((line + ' ' + w).trim().length > 30) { lines.push(line.trim()); line = w } else line += ' ' + w
  }
  if (line.trim()) lines.push(line.trim())
  const shown = lines.slice(0, 4)
  const h = 9 + shown.length * 7
  const x = 96, y = 140 - h
  // pixel speech bubble: square box, 1px ink, notched corners, stepped tail
  return `<g transform="translate(${x} ${y})"><rect x="1" y="0" width="126" height="${h}" fill="#142016"/><rect x="0" y="1" width="128" height="${h - 2}" fill="#142016"/><rect x="2" y="1" width="124" height="${h - 2}" fill="#fbfff3"/><rect x="1" y="2" width="126" height="${h - 4}" fill="#fbfff3"/>
<rect x="56" y="${h}" width="10" height="2" fill="#142016"/><rect x="58" y="${h}" width="6" height="2" fill="#fbfff3"/><rect x="58" y="${h + 2}" width="6" height="2" fill="#142016"/><rect x="60" y="${h + 2}" width="2" height="2" fill="#fbfff3"/><rect x="60" y="${h + 4}" width="2" height="2" fill="#142016"/>
${shown.map((l, i) => `<text x="6" y="${10 + i * 7}" font-size="6" fill="#142016">${esc(l)}</text>`).join('')}<text x="119" y="10" font-size="9" fill="#d94f8a">?</text></g>`
}

const TIER_COLOR: Record<Tier, string> = { full: '#8cf56b', half: '#52f2ff', quarter: '#ffbe3d', critical: '#ff5a5a' }

/** small fuel readout plate in the pane corner (the big tanks live in the tank pane) */
function fuelPlate(fuel: Fuel, now: number): string {
  const left = fuel.remaining
  const col = TIER_COLOR[fuel.tier]
  const flashing = now < fuel.alarmUntil || fuel.tier === 'critical'
  const h = Math.round(26 * (left === null ? 1 : left / 100))
  const marks = [50, 25, 10].map((m) => `<rect x="2" y="${3 + 26 - Math.round(26 * m / 100)}" width="8" height="1" fill="${left !== null && left < m ? '#ff5a5a' : '#c9d6cf'}"/>`).join('')
  return `<g transform="translate(290 6)"><rect width="24" height="40" fill="#142016"/><rect x="1" y="1" width="22" height="38" fill="#2b3631"/><rect x="2" y="2" width="9" height="30" fill="#0b120e"/>
<rect x="3" y="${3 + 26 - h}" width="7" height="${h}" fill="${col}"/>${marks}<rect x="14" y="4" width="6" height="6" fill="${flashing ? '#ff5a5a' : '#3a4a42'}" ${flashing ? 'class="lamp"' : ''}/>
<text x="12" y="36" text-anchor="middle" font-size="5" fill="${col}">${left === null ? '--' : Math.round(left) + '%'}</text></g>`
}

/** The whole lab: the ship deck, every alien where its real work puts it. */
export function labSvg(lab: Lab, fuel: Fuel, now: number): string {
  const used = new Map<string, number>()
  const parts: { y: number; s: string }[] = []
  const keys: string[] = []
  for (const a of lab.crew) {
    const [x, y] = spotFor(a, used)
    const busy = a.activity !== 'idle' && a.activity !== 'sleeping'
    const key = spriteKey(a.skin === 'pounce' ? 'pounce' : a.id, a.activity)
    keys.push(key)
    const scale = 1
    parts.push({ y: a.activity === 'question' ? 999 : y, s: drawSprite(key, x, y, a.activity, `${a.name}: ${a.label}`, busy || a.activity === 'question' ? a.name : null, '', scale) })
  }
  lab.clones.slice(0, CLONE_SPOTS.length).forEach((c, i) => {
    const [x, y] = CLONE_SPOTS[i] ?? [90, 120]
    keys.push('clone')
    parts.push({ y, s: drawSprite('clone', x, y, c.activity, `Clone ${i + 1}: ${c.label}`, null, now - c.since < 2500 ? 'emerge' : '') })
  })
  parts.sort((p, q) => p.y - q.y)
  const q = lab.question ? bubble(lab.question) : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="640" height="400" shape-rendering="crispEdges" role="img">${CSS}<defs>${spriteDefs(keys)}</defs><image href="${DECK}" width="320" height="200"/>${fuelPlate(fuel, now)}${parts.map((p) => p.s).join('')}${q}</svg>`
}

/** The fuel tanks: one pixel-art glass tank per real usage window, markers at 50/25/10% left. */
export function tankSvg(fuel: Fuel, now: number): string {
  const windows = fuel.windows.slice(0, 3)
  const flashing = now < fuel.alarmUntil
  let body = ''
  if (windows.length === 0) {
    body = `<g transform="translate(16 8)"><rect width="56" height="70" fill="#142016"/><rect x="2" y="2" width="52" height="66" fill="#0b120e"/><text x="28" y="38" text-anchor="middle" font-size="7" fill="#6f8d77">no reading</text></g><text x="90" y="30" font-size="8" fill="#cfe9d3">Usage windows appear after the first reply</text><text x="90" y="42" font-size="7" fill="#8fb39a">on a Claude subscription (5-hour, weekly).</text>`
  }
  windows.forEach((w, i) => {
    const left = Math.max(0, 100 - w.percentUsed)
    const t = tierOf(left)
    const col = TIER_COLOR[t]
    const x = 12 + i * 78, top = 12, H = 56
    const lh = Math.round((H * left) / 100)
    const mark = (m: number) => {
      const y = top + 4 + H - Math.round((H * m) / 100)
      const hit = left < m
      return `<rect x="2" y="${y}" width="52" height="1" fill="${hit ? '#ff5a5a' : '#c9d6cf'}" opacity="${hit ? '1' : '.5'}"/><rect x="54" y="${y - 1}" width="3" height="3" fill="${hit ? '#ff5a5a' : '#56645d'}"/><text x="60" y="${y + 2}" font-size="5" fill="${hit ? '#ff9a9a' : '#8fb39a'}">${m}</text>`
    }
    const lampOn = flashing || t === 'critical' || t === 'quarter'
    body += `<g transform="translate(${x} 0)">
<rect x="24" y="2" width="8" height="6" fill="${lampOn ? (t === 'critical' ? '#ff5a5a' : '#ffbe3d') : '#2b3631'}" ${lampOn ? 'class="lamp"' : ''}/>
<rect x="0" y="${top - 2}" width="56" height="4" fill="#56645d"/><rect x="0" y="${top + H + 6}" width="56" height="4" fill="#56645d"/>
<rect x="1" y="${top + 2}" width="54" height="${H + 4}" fill="#142016"/><rect x="2" y="${top + 2}" width="52" height="${H + 4}" fill="#0f1a14"/>
<rect x="4" y="${top + 4 + H - lh}" width="48" height="${lh}" fill="${col}"/><rect x="4" y="${top + 4 + H - lh}" width="48" height="2" fill="#ffffff" opacity=".45"/>
<rect class="bub" x="14" y="${top + H}" width="2" height="2" fill="#fff" opacity=".8"/><rect class="bub" style="animation-delay:1.2s" x="34" y="${top + H + 2}" width="2" height="2" fill="#fff" opacity=".8"/>
<rect x="6" y="${top + 4}" width="2" height="${H}" fill="#fff" opacity=".18"/>
${mark(50)}${mark(25)}${mark(10)}
<text x="28" y="${top + H + 20}" text-anchor="middle" font-size="7" fill="#e8ffe6">${esc(windowName(w.kind).toUpperCase())}</text>
<text x="28" y="${top + H + 28}" text-anchor="middle" font-size="6.5" fill="${col}">${Math.round(left)}% left</text>
<text x="28" y="${top + H + 35}" text-anchor="middle" font-size="5" fill="#8fb39a">${esc(resetsIn(w.resetsAt, now))}</text></g>`
  })
  const ctx = fuel.contextPercent
  const panel = `<g transform="translate(248 10)"><text x="0" y="6" font-size="6.5" fill="#e8ffe6">SESSION</text>
<text x="0" y="18" font-size="5.5" fill="#8fb39a">context</text><rect x="0" y="21" width="62" height="6" fill="#142016"/><rect x="1" y="22" width="60" height="4" fill="#0b120e"/><rect x="1" y="22" width="${Math.round(60 * Math.min(1, (ctx ?? 0) / 100))}" height="4" fill="#b48cff"/><text x="62" y="18" text-anchor="end" font-size="5.5" fill="#d9c8ff">${ctx === undefined ? '--' : Math.round(ctx) + '%'}</text>
<text x="0" y="40" font-size="5.5" fill="#8fb39a">cost</text><text x="62" y="40" text-anchor="end" font-size="6.5" fill="#e8ffe6">${fuel.costUsd === undefined ? '--' : '$' + fuel.costUsd.toFixed(2)}</text>
<text x="0" y="56" font-size="5.5" fill="${TIER_COLOR[fuel.tier]}">${fuel.remaining === null ? 'waiting' : esc(fuel.tier.toUpperCase())}</text></g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 112" width="640" height="224" shape-rendering="crispEdges" role="img">${CSS}<rect width="320" height="112" fill="#0b120e"/>${body}${panel}</svg>`
}

/** A glance for the desktop widget seat: tank of the emptiest window + who is busy. */
export function glanceSvg(lab: Lab, fuel: Fuel): string {
  const busy = [...lab.crew.filter((a) => a.activity !== 'idle' && a.activity !== 'sleeping'), ...lab.clones.map((c) => ({ ...c, id: 'clone', skin: 'glob' as const, name: 'clone' }))].slice(0, 4)
  const left = fuel.remaining
  const col = TIER_COLOR[fuel.tier]
  const h = Math.round((44 * (left ?? 100)) / 100)
  const keys: string[] = []
  const aliens = busy.length === 0
    ? (keys.push('blip-shut'), `<g transform="translate(38 30)" class="breathe"><use href="#s-blip-shut"/><text class="zz" x="16" y="2" font-size="6" fill="#bfe8ff">z</text></g>`)
    : busy.map((a, i) => { const k = a.id === 'clone' ? 'clone' : spriteKey(a.skin === 'pounce' ? 'pounce' : a.id, a.activity); keys.push(k); return `<g transform="translate(${32 + i * 24} 30)"><g class="${animClass(a.activity)}"><use href="#s-${k}"/></g></g>` }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 64" width="280" height="128" shape-rendering="crispEdges" role="img">${CSS}<defs>${spriteDefs(keys)}</defs><rect width="140" height="64" fill="#142016"/><rect x="1" y="1" width="138" height="62" fill="#18241d"/><g transform="translate(8 8)"><rect width="16" height="48" fill="#142016"/><rect x="1" y="1" width="14" height="46" fill="#0b120e"/><rect x="2" y="${2 + 44 - h}" width="12" height="${h}" fill="${col}"/></g><text x="30" y="16" font-size="7" fill="#8cf56b">GLOB LABS</text><text x="30" y="25" font-size="6" fill="${col}">${left === null ? 'fuel: no reading' : `fuel ${Math.round(left)}%`}</text>${aliens}</svg>`
}

/** The slow backdrop behind the whole conversation (desktop + mobile apps): deep space seen
 *  from the ship — pixel stars, a ringed planet, a passing UFO. No neon, no blur. */
export const BACKDROP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges">
<style>.tw{animation:tw 3s steps(2) infinite}@keyframes tw{50%{opacity:.25}}.uf{animation:uf 60s steps(240) infinite}@keyframes uf{0%{transform:translate(-40px,40px)}100%{transform:translate(440px,24px)}}@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>
<rect width="400" height="250" fill="#070a14"/><rect y="150" width="400" height="100" fill="#090d18"/><rect y="210" width="400" height="40" fill="#0b1020"/>
<g fill="#cfe0ff"><rect class="tw" x="40" y="22" width="1" height="1"/><rect x="88" y="60" width="1" height="1"/><rect class="tw" x="132" y="14" width="2" height="2" style="animation-delay:1s"/><rect x="176" y="44" width="1" height="1"/><rect class="tw" x="214" y="18" width="1" height="1" style="animation-delay:2s"/><rect x="250" y="70" width="1" height="1"/><rect x="292" y="30" width="2" height="2"/><rect class="tw" x="338" y="52" width="1" height="1"/><rect x="370" y="16" width="1" height="1"/><rect x="24" y="96" width="1" height="1"/><rect x="150" y="104" width="1" height="1"/><rect x="380" y="110" width="1" height="1"/></g>
<g transform="translate(300 150)"><rect x="-26" y="-26" width="52" height="52" fill="#3a2a6a"/><rect x="-30" y="-20" width="60" height="40" fill="#3a2a6a"/><rect x="-20" y="-30" width="40" height="60" fill="#3a2a6a"/><rect x="-24" y="-14" width="48" height="6" fill="#5a3f8c"/><rect x="-28" y="2" width="56" height="5" fill="#4a3478"/><rect x="-18" y="14" width="36" height="4" fill="#5a3f8c"/><rect x="-60" y="-2" width="120" height="3" fill="#8a7ab8"/><rect x="-54" y="1" width="108" height="2" fill="#5e5290"/></g>
<g class="uf"><rect x="-8" y="0" width="16" height="3" fill="#7d8a93"/><rect x="-4" y="-3" width="8" height="3" fill="#8cf56b"/><rect x="-6" y="3" width="2" height="1" fill="#ffbe3d"/><rect x="4" y="3" width="2" height="1" fill="#ffbe3d"/></g>
</svg>`
