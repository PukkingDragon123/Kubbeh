// The lab as pixel-art SVG: built from plain data, no `$`, so it is cheap to test.
// Every sprite is hand-placed pixels, run-length merged into rects to stay small.
import type { Activity, Alien, Clone, Fuel, Lab, Tier } from '../types'
import { resetsIn, tierOf, windowName } from './fuel'

// ── sprites ──────────────────────────────────────────────────────────────────
const GLOB = [
  '.PP............BB.',
  '.PP............BB.',
  '...s..........s...',
  '....s........s....',
  '.....HHGGGGGG.....',
  '...HHGGGGGGGGGG...',
  '..HGGGGGGGGGGGGD..',
  '.GGKKKKGGGGKKKKGD.',
  '.GKKWKKKGGKKWKKKD.',
  '.GKKKKKKGGKKKKKKD.',
  '.GKKKKKKGGKKKKKKD.',
  '.GGKKKKGGGGKKKKGD.',
  '..GGGGGGmmGGGGGD..',
  '...DGGGGGGGGGGD...',
  '.....LLLLLLLL.....',
  '...G.LLLLLLLL.G...',
  '.....LLLLLLLL.....',
  '.....DD....DD.....',
]

const POUNCE = [
  '..ww..........ww..',
  '.wppw........wppw.',
  '.wwwwwwwwwwwwwwww.',
  '.wwswwwssswwwwsww.',
  '.wwwwwwwwwwwwwwww.',
  '.wKKKKKwwwwKKKKKw.',
  '.KKWKKKKwwKKWKKKK.',
  '.KKKKKKKwwKKKKKKK.',
  '.wKKKKKwwwwKKKKKw.',
  '.wwwwwwwnnwwwwwww.',
  '.wwswwwwmmwwwwsww.',
  '..wwwwwwwwwwwwww..',
  '...wwwwwwwwwwww.hh',
  '....wswwwwwwsw.hqh',
  '.....wwwwwwww..hh.',
  '.....ww....ww.....',
  '..................',
  '..................',
]

type Palette = Record<string, string>
const GLOB_PAL: Palette = { G: '#7be35f', H: '#b6f59a', D: '#3f9e3a', L: '#c8f7a8', K: '#0b0b0b', W: '#ffffff', m: '#1d3a1a', s: '#3f9e3a', P: '#ff7ad9', B: '#4d6bff' }
const CLONE_PAL: Palette = { ...GLOB_PAL, G: '#6fe0c8', H: '#b9fff0', D: '#2f9c8c', L: '#c9fff4', s: '#2f9c8c', P: '#52f2ff', B: '#52f2ff' }
const POUNCE_PAL: Palette = { w: '#eef1f4', s: '#4a4f57', p: '#f2a0b4', K: '#101010', W: '#ffffff', n: '#f29ab0', m: '#6b6f75', h: '#eef1f4', q: '#3a3a3a' }
const EYE = new Set(['K', 'W'])

/** Pixel grid → rects, horizontal runs merged, split into body and eyes (for blinking). */
function rects(grid: readonly string[], pal: Palette): { body: string; eyes: string } {
  let body = ''
  let eyes = ''
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const c = row[x] ?? '.'
      if (c === '.' || pal[c] === undefined) { x++; continue }
      let w = 1
      while (row[x + w] === c) w++
      const r = `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${pal[c]}"/>`
      if (EYE.has(c)) eyes += r
      else body += r
      x += w
    }
  })
  return { body, eyes }
}

function symbol(id: string, grid: readonly string[], pal: Palette): string {
  const r = rects(grid, pal)
  return `<symbol id="${id}" viewBox="0 0 18 18" width="18" height="18"><g>${r.body}</g><g class="eyes">${r.eyes}</g></symbol><symbol id="${id}-shut" viewBox="0 0 18 18" width="18" height="18"><g>${r.body}</g><g transform="translate(0 9) scale(1 .18) translate(0 -9)">${r.eyes}</g></symbol>`
}

const SYMBOLS = symbol('glob', GLOB, GLOB_PAL) + symbol('pounce', POUNCE, POUNCE_PAL) + symbol('clone', GLOB, CLONE_PAL)

// ── style ────────────────────────────────────────────────────────────────────
const CSS = `<style>
text{font-family:ui-monospace,Menlo,Consolas,monospace}
.bob{animation:bob 1.8s ease-in-out infinite}
@keyframes bob{50%{transform:translateY(-1px)}}
.type{animation:type .28s steps(2) infinite}
@keyframes type{50%{transform:translateY(-1.2px)}}
.walk{animation:walk 2.6s ease-in-out infinite alternate}
@keyframes walk{to{transform:translateX(34px)}}
.hop{animation:hop .7s cubic-bezier(.3,1.6,.5,1) infinite;transform-box:fill-box;transform-origin:50% 100%}
@keyframes hop{0%,100%{transform:translateY(0) scale(1,1)}25%{transform:translateY(0) scale(1.18,.82)}55%{transform:translateY(-9px) scale(.9,1.12)}}
.breathe{animation:breathe 3.2s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
@keyframes breathe{50%{transform:scale(1.06,.95)}}
.run{animation:run .35s steps(2) infinite}
@keyframes run{50%{transform:translateY(-2px) rotate(-3deg)}}
.eyes{animation:blink 4.2s infinite;transform-box:fill-box;transform-origin:50% 50%}
@keyframes blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.12)}}
.zz{animation:zz 2.6s linear infinite}
.zz2{animation:zz 2.6s linear 1.3s infinite}
@keyframes zz{0%{transform:translate(0,0);opacity:0}20%{opacity:1}100%{transform:translate(7px,-15px);opacity:0}}
.flick{animation:flick 7s infinite}
@keyframes flick{0%,38%,41%,44%,100%{opacity:1}39.5%,42.5%{opacity:.3}}
.bub{animation:bub 2.6s linear infinite}
@keyframes bub{0%{transform:translateY(0);opacity:.9}100%{transform:translateY(-52px);opacity:0}}
.scr{animation:scr 1.6s steps(4) infinite}
@keyframes scr{to{transform:translateY(-8px)}}
.ufo{animation:ufo 16s linear infinite}
@keyframes ufo{0%{transform:translate(-24px,6px)}50%{transform:translate(22px,0)}100%{transform:translate(70px,8px)}}
.lamp{animation:lamp .7s steps(1) infinite}
@keyframes lamp{50%{opacity:.15}}
.emerge{animation:emerge 1s cubic-bezier(.3,1.6,.5,1) both;transform-box:fill-box;transform-origin:50% 100%}
@keyframes emerge{from{transform:scale(0) translateY(-10px)}to{transform:scale(1)}}
.dots circle{animation:lamp 1.2s steps(1) infinite}
.dots circle:nth-child(2){animation-delay:.4s}.dots circle:nth-child(3){animation-delay:.8s}
.spark{animation:spark 1.1s ease-out infinite;transform-box:fill-box;transform-origin:50% 50%}
@keyframes spark{0%{transform:scale(0);opacity:1}100%{transform:scale(1.6) rotate(45deg);opacity:0}}
.glow{animation:glow 2.4s ease-in-out infinite}
@keyframes glow{50%{opacity:.55}}
.a:hover use{filter:brightness(1.35)}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>`

const DEFS = `<defs>${SYMBOLS}
<pattern id="brick" width="16" height="8" patternUnits="userSpaceOnUse"><rect width="16" height="8" fill="#1d1211"/><rect x=".5" y=".5" width="7" height="3" fill="#3a2220"/><rect x="8.5" y=".5" width="7" height="3" fill="#33201e"/><rect x="-3.5" y="4.5" width="7" height="3" fill="#36211f"/><rect x="4.5" y="4.5" width="7" height="3" fill="#3d2523"/><rect x="12.5" y="4.5" width="7" height="3" fill="#311d1b"/></pattern>
<pattern id="tile" width="20" height="10" patternUnits="userSpaceOnUse"><rect width="20" height="10" fill="#18201c"/><rect width="19" height="9" fill="#1d2721"/></pattern>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#090b1f"/><stop offset="1" stop-color="#1b1640"/></linearGradient>
<linearGradient id="jel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b6ff8c"/><stop offset="1" stop-color="#2f9c3a"/></linearGradient>
<filter id="neon" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<clipPath id="win"><rect x="170" y="44" width="60" height="44"/></clipPath>
</defs>`

// Static set: wall, floor, pipes, sign, window, the stations.
const STATIC = `
<rect width="320" height="150" fill="url(#brick)"/>
<rect y="146" width="320" height="54" fill="url(#tile)"/>
<rect y="144" width="320" height="3" fill="#0d1210"/>
<rect x="0" y="12" width="320" height="5" fill="#4d5c54"/><rect x="0" y="12" width="320" height="1" fill="#7c8f84"/>
<rect x="6" y="12" width="5" height="134" fill="#4d5c54"/><rect x="6" y="12" width="1" height="134" fill="#7c8f84"/>
<rect x="3" y="70" width="11" height="4" fill="#a8323a"/><rect x="40" y="10" width="4" height="9" fill="#5f6f66"/><rect x="250" y="10" width="4" height="9" fill="#5f6f66"/>
<g class="flick" filter="url(#neon)"><text x="160" y="38" text-anchor="middle" font-size="17" font-weight="700" fill="#ff6fd6" letter-spacing="2">GLOB</text><text x="160" y="38" dx="58" text-anchor="middle" font-size="17" font-weight="700" fill="#8cf56b" letter-spacing="2">LABS</text></g>
<rect x="168" y="42" width="64" height="48" fill="#3b4a42"/><rect x="170" y="44" width="60" height="44" fill="url(#sky)"/>
<g clip-path="url(#win)"><circle cx="216" cy="54" r="5" fill="#fff6c8"/><circle cx="214" cy="53" r="5" fill="#1b1640" opacity=".0"/><rect x="178" y="50" width="1" height="1" fill="#fff"/><rect x="196" y="60" width="1" height="1" fill="#fff"/><rect x="224" y="74" width="1" height="1" fill="#fff"/><rect x="186" y="78" width="1" height="1" fill="#fff"/>
<g class="ufo"><ellipse cx="190" cy="70" rx="9" ry="3" fill="#9aa7b0"/><ellipse cx="190" cy="67" rx="4" ry="3" fill="#8cf56b" opacity=".85"/><rect x="183" y="70" width="2" height="1" fill="#ff6fd6"/><rect x="189" y="71" width="2" height="1" fill="#52f2ff"/><rect x="195" y="70" width="2" height="1" fill="#ffbe3d"/></g></g>
<rect x="198" y="42" width="2" height="48" fill="#3b4a42"/><rect x="168" y="65" width="64" height="2" fill="#3b4a42"/>
<rect x="16" y="120" width="58" height="26" fill="#3b2d24"/><rect x="16" y="118" width="58" height="3" fill="#5a4334"/>
<rect x="20" y="92" width="24" height="22" fill="#4b5a52"/><rect x="22" y="94" width="20" height="16" fill="#03140a"/>
<rect x="46" y="96" width="22" height="18" fill="#4b5a52"/><rect x="48" y="98" width="18" height="13" fill="#03140a"/>
<g clip-path="url(#scr1)"><g class="scr"><rect x="24" y="96" width="12" height="1" fill="#8cf56b"/><rect x="24" y="98" width="8" height="1" fill="#8cf56b"/><rect x="26" y="100" width="13" height="1" fill="#52f2ff"/><rect x="24" y="102" width="6" height="1" fill="#8cf56b"/><rect x="26" y="104" width="10" height="1" fill="#ff6fd6"/><rect x="24" y="106" width="12" height="1" fill="#8cf56b"/><rect x="24" y="108" width="9" height="1" fill="#8cf56b"/><rect x="26" y="110" width="11" height="1" fill="#52f2ff"/><rect x="24" y="112" width="7" height="1" fill="#8cf56b"/></g></g>
<rect x="50" y="100" width="10" height="1" fill="#52f2ff"/><rect x="50" y="103" width="14" height="1" fill="#8cf56b"/><rect x="50" y="106" width="7" height="1" fill="#8cf56b"/>
<rect x="28" y="114" width="8" height="4" fill="#4b5a52"/><rect x="24" y="116" width="32" height="2" fill="#26302b"/>
<rect x="86" y="108" width="24" height="38" fill="#56645d"/><rect x="88" y="111" width="20" height="10" fill="#6d7d74"/><rect x="88" y="123" width="20" height="10" fill="#6d7d74"/><rect x="88" y="135" width="20" height="9" fill="#6d7d74"/><rect x="95" y="115" width="6" height="2" fill="#2b3530"/><rect x="95" y="127" width="6" height="2" fill="#2b3530"/><rect x="95" y="139" width="6" height="2" fill="#2b3530"/>
<rect x="116" y="88" width="34" height="58" fill="#3f2f22"/><rect x="118" y="90" width="30" height="16" fill="#1b130d"/><rect x="118" y="108" width="30" height="16" fill="#1b130d"/><rect x="118" y="126" width="30" height="18" fill="#1b130d"/>
<rect x="119" y="95" width="3" height="11" fill="#a8323a"/><rect x="122" y="93" width="3" height="13" fill="#3b6fb0"/><rect x="125" y="96" width="2" height="10" fill="#d9a43b"/><rect x="128" y="94" width="3" height="12" fill="#5fae4a"/><rect x="133" y="97" width="4" height="9" fill="#8a5bb5"/>
<rect x="119" y="112" width="4" height="12" fill="#3b6fb0"/><rect x="124" y="114" width="3" height="10" fill="#d9a43b"/><rect x="129" y="111" width="3" height="13" fill="#a8323a"/><rect x="138" y="116" width="8" height="8" fill="#8cf56b" opacity=".75"/>
<rect x="120" y="134" width="8" height="10" fill="#7fd0de" opacity=".55"/><rect x="131" y="130" width="6" height="14" fill="#ffbe3d" opacity=".5"/>
<rect x="201" y="104" width="3" height="40" fill="#5f6f66" transform="rotate(-14 202 124)"/><rect x="208" y="104" width="3" height="40" fill="#5f6f66" transform="rotate(14 209 124)"/>
<rect x="190" y="96" width="30" height="8" fill="#aab6bd" transform="rotate(-28 205 100)"/><rect x="214" y="88" width="6" height="10" fill="#7c8a91" transform="rotate(-28 205 100)"/>
<rect x="236" y="66" width="44" height="34" fill="#cfd8d3"/><rect x="238" y="68" width="40" height="30" fill="#f4f8f2"/><rect x="236" y="100" width="44" height="2" fill="#7c8a91"/>
<rect x="241" y="71" width="8" height="6" fill="none" stroke="#3b6fb0" stroke-width="1"/><rect x="252" y="73" width="10" height="1" fill="#3b6fb0"/><rect x="252" y="76" width="7" height="1" fill="#3b6fb0"/>
<rect x="241" y="82" width="2" height="2" fill="#2f9c3a"/><rect x="245" y="83" width="14" height="1" fill="#555"/><rect x="241" y="88" width="2" height="2" fill="#2f9c3a"/><rect x="245" y="89" width="11" height="1" fill="#555"/><rect x="241" y="94" width="2" height="2" fill="#a8323a"/><rect x="245" y="95" width="16" height="1" fill="#555"/>
<path d="M266 72 q4 -3 8 0 q-4 3 -8 0" fill="#ff6fd6"/><rect x="268" y="80" width="6" height="6" fill="#8cf56b"/>
<rect x="282" y="66" width="28" height="6" fill="#56645d"/><rect x="282" y="140" width="28" height="6" fill="#56645d"/>
<rect x="284" y="72" width="24" height="68" fill="#0c2a17" opacity=".9"/><rect x="284" y="92" width="24" height="48" fill="url(#jel)" opacity=".85"/><rect x="284" y="92" width="24" height="2" fill="#d6ffb8"/>
<g><circle class="bub" cx="290" cy="136" r="1.5" fill="#e8ffd8"/><circle class="bub" style="animation-delay:.9s" cx="300" cy="138" r="1" fill="#e8ffd8"/><circle class="bub" style="animation-delay:1.7s" cx="295" cy="137" r="1.2" fill="#e8ffd8"/></g>
<rect x="285" y="73" width="2" height="66" fill="#ffffff" opacity=".18"/><rect x="304" y="73" width="1" height="66" fill="#ffffff" opacity=".1"/>
<rect x="290" y="146" width="12" height="2" fill="#0d1210"/>
<ellipse cx="162" cy="152" rx="15" ry="5" fill="#a8323a"/><ellipse cx="162" cy="148" rx="12" ry="5" fill="#c8434c"/><ellipse cx="158" cy="146" rx="5" ry="2" fill="#e06a72"/>
<ellipse cx="120" cy="184" rx="26" ry="3" fill="#ff6fd6" opacity=".09"/><ellipse cx="240" cy="190" rx="30" ry="3" fill="#8cf56b" opacity=".08"/>
<rect x="0" y="196" width="320" height="4" fill="#ffbe3d" opacity=".5"/>`

// ── stations ─────────────────────────────────────────────────────────────────
const STATION: Partial<Record<Activity, [number, number]>> = {
  coding: [70, 128],
  files: [66, 150],
  research: [124, 128],
  web: [186, 128],
  planning: [220, 128],
  ideas: [252, 128],
  cloning: [262, 128],
  question: [14, 152],
}

const HOME: Record<string, [number, number]> = {
  blip: [48, 166],
  zib: [98, 170],
  mossy: [153, 128],
  glorp: [228, 166],
  pounce: [196, 170],
}

const CLONE_SPOTS: readonly [number, number][] = [[288, 160], [266, 170], [302, 172], [250, 176], [280, 180], [236, 182]]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

function extras(a: Activity): string {
  switch (a) {
    case 'thinking':
      return '<g class="dots"><circle cx="20" cy="-2" r="1.2" fill="#e8ffe6"/><circle cx="23" cy="-5" r="1.5" fill="#e8ffe6"/><circle cx="27" cy="-9" r="2" fill="#e8ffe6"/></g>'
    case 'files':
      return '<g transform="translate(4 -9)"><rect width="10" height="8" fill="#f4f8f2"/><rect x="7" width="3" height="3" fill="#b9c4be"/><rect x="2" y="4" width="6" height="1" fill="#7c8a91"/><rect x="2" y="6" width="4" height="1" fill="#7c8a91"/></g>'
    case 'research':
      return '<g transform="translate(15 6)"><circle cx="3" cy="3" r="3" fill="#bdf6ff" fill-opacity=".35" stroke="#d9c26b" stroke-width="1.2"/><rect x="5" y="5" width="4" height="1.5" fill="#d9c26b" transform="rotate(45 5 5)"/></g>'
    case 'ideas':
      return '<g class="glow" transform="translate(6 -11)"><circle cx="3" cy="3" r="3.2" fill="#ffe66b"/><rect x="1.5" y="6" width="3" height="2" fill="#9aa7b0"/></g>'
    case 'planning':
      return '<rect x="15" y="7" width="5" height="1.5" fill="#3b6fb0" transform="rotate(-30 15 7)"/>'
    case 'sleeping':
      return '<text class="zz" x="14" y="2" font-size="6" fill="#bfe8ff">z</text><text class="zz2" x="16" y="-2" font-size="5" fill="#bfe8ff">z</text>'
    case 'celebrating':
      return '<g fill="#ffe66b"><rect class="spark" x="-2" y="2" width="2" height="2"/><rect class="spark" style="animation-delay:.3s" x="19" y="0" width="2" height="2" fill="#ff6fd6"/><rect class="spark" style="animation-delay:.6s" x="9" y="-6" width="2" height="2" fill="#52f2ff"/></g>'
    case 'cloning':
      return '<rect x="-2" y="-2" width="22" height="22" rx="6" fill="#8cf56b" opacity=".18" class="glow"/>'
    default:
      return ''
  }
}

function animClass(a: Activity): string {
  switch (a) {
    case 'coding':
    case 'planning':
      return 'type'
    case 'files':
      return 'walk'
    case 'celebrating':
      return 'hop'
    case 'sleeping':
      return 'breathe'
    case 'question':
      return 'run'
    default:
      return 'bob'
  }
}

function drawAlien(sym: string, x: number, y: number, activity: Activity, title: string, name: string | null, extraClass = '', scale = 1): string {
  const shut = activity === 'sleeping' ? '-shut' : ''
  const core = `<g class="${animClass(activity)}"><use href="#${sym}${shut}" width="18" height="18"/>${extras(activity)}</g>`
  const inner = extraClass ? `<g class="${extraClass}">${core}</g>` : core
  const tag = name ? `<text x="9" y="24" text-anchor="middle" font-size="4.5" fill="#cfe9d3" opacity=".85">${esc(name)}</text>` : ''
  return `<g class="a" transform="translate(${x} ${y})${scale !== 1 ? ` scale(${scale})` : ''}"><title>${esc(title)}</title><ellipse cx="9" cy="18" rx="6" ry="1.4" fill="#000" opacity=".35"/>${inner}${tag}</g>`
}

function spotFor(alien: Alien, taken: Map<string, number>): [number, number] {
  const st = STATION[alien.activity]
  if (alien.activity === 'question') return st ?? [14, 152]
  if (st) {
    const n = taken.get(alien.activity) ?? 0
    taken.set(alien.activity, n + 1)
    return [st[0] + n * 13, st[1] + (n > 0 ? 38 : 0)]
  }
  return HOME[alien.id] ?? [140, 170]
}

function bubble(text: string): string {
  const lines: string[] = []
  const words = cut(text, 110).split(/\s+/)
  let line = ''
  for (const w of words) {
    if ((line + ' ' + w).trim().length > 30) { lines.push(line.trim()); line = w } else line += ' ' + w
  }
  if (line.trim()) lines.push(line.trim())
  const shown = lines.slice(0, 4)
  const h = 8 + shown.length * 7
  return `<g transform="translate(46 ${148 - h})"><rect width="128" height="${h}" rx="5" fill="#fbfff3" stroke="#142016" stroke-width="1.5"/><path d="M6 ${h - 6} l-9 10 l13 -5z" fill="#fbfff3" stroke="#142016" stroke-width="1.2"/><rect x="4" y="${h - 9}" width="4" height="7" fill="#fbfff3"/>${shown
    .map((l, i) => `<text x="6" y="${10 + i * 7}" font-size="5.6" fill="#142016">${esc(l)}</text>`)
    .join('')}<text x="118" y="10" font-size="9" font-weight="700" fill="#ff6fd6">?</text></g>`
}

const TIER_COLOR: Record<Tier, string> = { full: '#8cf56b', half: '#52f2ff', quarter: '#ffbe3d', critical: '#ff5a5a' }

function wallGauge(fuel: Fuel, now: number): string {
  const left = fuel.remaining
  const pct = left === null ? 1 : left / 100
  const col = TIER_COLOR[fuel.tier]
  const flashing = now < fuel.alarmUntil || fuel.tier === 'critical'
  const h = Math.round(30 * pct)
  return `<g transform="translate(268 22)"><rect width="10" height="34" rx="3" fill="#26302b" stroke="#7c8f84" stroke-width="1"/><rect x="2" y="${2 + 30 - h}" width="6" height="${h}" fill="${col}"/><rect x="1" y="17" width="8" height=".6" fill="#fff" opacity=".5"/><rect x="1" y="24.5" width="8" height=".6" fill="#fff" opacity=".5"/><rect x="1" y="29" width="8" height=".6" fill="#fff" opacity=".5"/><circle cx="5" cy="-3" r="2.6" fill="${flashing ? '#ff5a5a' : col}" ${flashing ? 'class="lamp"' : ''}/><text x="13" y="8" font-size="5" fill="#cfe9d3">FUEL</text><text x="13" y="15" font-size="5.5" font-weight="700" fill="${col}">${left === null ? '--' : Math.round(left) + '%'}</text></g>`
}

/** The whole lab: wall, stations, every alien where its real work puts it. */
export function labSvg(lab: Lab, fuel: Fuel, now: number): string {
  const taken = new Map<string, number>()
  const parts: { y: number; s: string }[] = []
  for (const a of lab.crew) {
    const [x, y] = spotFor(a, taken)
    const busy = a.activity !== 'idle' && a.activity !== 'sleeping'
    const sym = a.skin === 'pounce' ? 'pounce' : 'glob'
    const scale = a.activity === 'question' ? 1.5 : 1
    parts.push({ y: a.activity === 'question' ? 999 : y, s: drawAlien(sym, x, y, a.activity, `${a.name} — ${a.label}`, busy || a.activity === 'question' ? a.name : null, '', scale) })
  }
  lab.clones.slice(0, CLONE_SPOTS.length).forEach((c, i) => {
    const [x, y] = CLONE_SPOTS[i] ?? [280, 170]
    const fresh = now - c.since < 2500
    parts.push({ y, s: drawAlien('clone', x, y, c.activity, `Clone — ${c.label}`, `clone ${i + 1}`, fresh ? 'emerge' : '') })
  })
  parts.sort((p, q) => p.y - q.y)
  const q = lab.question ? bubble(lab.question) : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="640" height="400" shape-rendering="crispEdges" role="img">${CSS}${DEFS}<clipPath id="scr1"><rect x="22" y="94" width="20" height="16"/></clipPath>${STATIC}${wallGauge(fuel, now)}${parts.map(p => p.s).join('')}${q}</svg>`
}

/** The fuel tanks: one per real usage window, markers at 50/25/10% left. */
export function tankSvg(fuel: Fuel, now: number): string {
  const windows = fuel.windows.slice(0, 3)
  const flashing = now < fuel.alarmUntil
  let body = ''
  if (windows.length === 0) {
    body = `<g transform="translate(16 6)"><rect width="56" height="66" rx="8" fill="#0b120e" stroke="#4d5c54" stroke-width="2"/><text x="28" y="38" text-anchor="middle" font-size="7" fill="#6f8d77">no reading</text></g><text x="90" y="30" font-size="8" fill="#cfe9d3">Usage windows appear after the first reply</text><text x="90" y="42" font-size="7" fill="#8fb39a">on a Claude subscription (5-hour, weekly).</text>`
  }
  windows.forEach((w, i) => {
    const left = Math.max(0, 100 - w.percentUsed)
    const t = tierOf(left)
    const col = TIER_COLOR[t]
    const x = 12 + i * 78
    const top = 10
    const H = 58
    const lh = Math.round((H * left) / 100)
    const mark = (m: number) => {
      const y = top + 4 + H - Math.round((H * m) / 100)
      const hit = left < m
      return `<rect x="2" y="${y}" width="52" height="1" fill="${hit ? '#ff5a5a' : '#ffffff'}" opacity="${hit ? '.9' : '.35'}"/><text x="58" y="${y + 2}" font-size="5" fill="${hit ? '#ff9a9a' : '#8fb39a'}">${m}</text>`
    }
    const lampOn = flashing || t === 'critical' || t === 'quarter'
    body += `<g transform="translate(${x} 0)">
<circle cx="28" cy="5" r="3.6" fill="${lampOn ? (t === 'critical' ? '#ff5a5a' : '#ffbe3d') : '#2b3631'}" ${lampOn ? 'class="lamp"' : ''}/>
<rect y="${top}" width="56" height="${H + 8}" rx="8" fill="#0b120e" stroke="#4d5c54" stroke-width="2"/>
<rect x="4" y="${top + 4 + H - lh}" width="48" height="${lh}" rx="3" fill="${col}" opacity=".88"/><rect x="4" y="${top + 4 + H - lh}" width="48" height="1.5" fill="#ffffff" opacity=".6"/>
<circle class="bub" cx="16" cy="${top + H}" r="1.4" fill="#fff" opacity=".7"/><circle class="bub" style="animation-delay:1.2s" cx="36" cy="${top + H + 2}" r="1" fill="#fff" opacity=".7"/>
<rect x="6" y="${top + 3}" width="3" height="${H}" fill="#fff" opacity=".12"/>
${mark(50)}${mark(25)}${mark(10)}
<text x="28" y="${top + H + 18}" text-anchor="middle" font-size="7" font-weight="700" fill="#e8ffe6">${esc(windowName(w.kind).toUpperCase())}</text>
<text x="28" y="${top + H + 26}" text-anchor="middle" font-size="6.5" fill="${col}">${Math.round(left)}% left</text>
<text x="28" y="${top + H + 33}" text-anchor="middle" font-size="5" fill="#8fb39a">${esc(resetsIn(w.resetsAt, now))}</text></g>`
  })
  const sx = 248
  const ctx = fuel.contextPercent
  const panel = `<g transform="translate(${sx} 10)"><text x="0" y="6" font-size="6.5" font-weight="700" fill="#e8ffe6">SESSION</text>
<text x="0" y="18" font-size="5.5" fill="#8fb39a">context</text><rect x="0" y="21" width="62" height="6" rx="3" fill="#0b120e" stroke="#4d5c54"/><rect x="1" y="22" width="${Math.round(60 * Math.min(1, (ctx ?? 0) / 100))}" height="4" rx="2" fill="#b48cff"/><text x="62" y="18" text-anchor="end" font-size="5.5" fill="#d9c8ff">${ctx === undefined ? '--' : Math.round(ctx) + '%'}</text>
<text x="0" y="40" font-size="5.5" fill="#8fb39a">cost</text><text x="62" y="40" text-anchor="end" font-size="6.5" font-weight="700" fill="#e8ffe6">${fuel.costUsd === undefined ? '--' : '$' + fuel.costUsd.toFixed(2)}</text>
<text x="0" y="56" font-size="5.5" fill="${TIER_COLOR[fuel.tier]}">${fuel.remaining === null ? 'waiting' : esc(fuel.tier.toUpperCase())}</text></g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 112" width="640" height="224" role="img">${CSS.replace(/\.a:hover[^\n]*\n/, '')}${body}${panel}</svg>`
}

/** A glance for the desktop widget seat: tank of the emptiest window + who is busy. */
export function glanceSvg(lab: Lab, fuel: Fuel): string {
  const busy = [...lab.crew.filter(a => a.activity !== 'idle' && a.activity !== 'sleeping'), ...lab.clones.map(c => ({ ...c, skin: 'glob' as const, name: 'clone' }))].slice(0, 4)
  const left = fuel.remaining
  const col = TIER_COLOR[fuel.tier]
  const h = Math.round((44 * (left ?? 100)) / 100)
  const aliens = busy.length === 0
    ? `<g transform="translate(40 30)"><use href="#glob-shut" width="18" height="18" class="breathe"/><text class="zz" x="16" y="2" font-size="6" fill="#bfe8ff">z</text></g>`
    : busy.map((a, i) => `<g transform="translate(${32 + i * 22} 30)"><g class="${animClass(a.activity)}"><use href="#${'skin' in a && a.skin === 'pounce' ? 'pounce' : 'id' in a && a.name === 'clone' ? 'clone' : 'glob'}" width="18" height="18"/>${extras(a.activity)}</g></g>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 64" width="280" height="128" shape-rendering="crispEdges" role="img">${CSS}<defs>${SYMBOLS}</defs><rect width="140" height="64" rx="8" fill="#0b120e"/><g transform="translate(8 8)"><rect width="16" height="48" rx="4" fill="#18201c" stroke="#4d5c54"/><rect x="2" y="${2 + 44 - h}" width="12" height="${h}" rx="2" fill="${col}"/></g><text x="30" y="16" font-size="7" font-weight="700" fill="#8cf56b">GLOB LABS</text><text x="30" y="25" font-size="6" fill="${col}">${left === null ? 'fuel: no reading' : `fuel ${Math.round(left)}%`}</text>${aliens}</svg>`
}

/** The moving backdrop behind the whole conversation (desktop + mobile apps). */
export const BACKDROP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
<style>.fl{animation:fl 9s infinite}@keyframes fl{0%,47%,49%,52%,100%{opacity:.9}48%,51%{opacity:.25}}
.st{animation:st 7s ease-out infinite}.st2{animation:st 7s ease-out 3.5s infinite}@keyframes st{0%{transform:translateY(0) scale(.6);opacity:0}20%{opacity:.35}100%{transform:translateY(-260px) scale(1.8);opacity:0}}
.uf{animation:uf 46s linear infinite}@keyframes uf{0%{transform:translate(-200px,120px)}100%{transform:translate(1900px,60px)}}
.tw{animation:tw 3s ease-in-out infinite}@keyframes tw{50%{opacity:.2}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#060a12"/><stop offset=".6" stop-color="#08100c"/><stop offset="1" stop-color="#0b140f"/></linearGradient>
<pattern id="b" width="48" height="24" patternUnits="userSpaceOnUse"><rect width="48" height="24" fill="#120c0b"/><rect x="1" y="1" width="22" height="10" fill="#1d1312"/><rect x="25" y="1" width="22" height="10" fill="#1a1110"/><rect x="-11" y="13" width="22" height="10" fill="#1b1211"/><rect x="13" y="13" width="22" height="10" fill="#1f1413"/><rect x="37" y="13" width="22" height="10" fill="#191010"/></pattern>
<filter id="n" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="sb" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="14"/></filter>
<radialGradient id="pk"><stop offset="0" stop-color="#ff6fd6" stop-opacity=".35"/><stop offset="1" stop-color="#ff6fd6" stop-opacity="0"/></radialGradient>
<radialGradient id="gr"><stop offset="0" stop-color="#8cf56b" stop-opacity=".28"/><stop offset="1" stop-color="#8cf56b" stop-opacity="0"/></radialGradient></defs>
<rect width="1600" height="1000" fill="url(#g)"/>
<g fill="#cfe0ff"><circle class="tw" cx="420" cy="60" r="1.6"/><circle cx="610" cy="120" r="1.2"/><circle class="tw" cx="880" cy="40" r="1.4" style="animation-delay:1s"/><circle cx="1050" cy="110" r="1.1"/><circle class="tw" cx="1220" cy="70" r="1.5" style="animation-delay:2s"/><circle cx="760" cy="180" r="1"/></g>
<g class="uf"><ellipse cx="0" cy="0" rx="38" ry="10" fill="#7d8a93" opacity=".55"/><ellipse cx="0" cy="-8" rx="16" ry="11" fill="#8cf56b" opacity=".45"/><path d="M-14 8 L14 8 L40 140 L-40 140Z" fill="#8cf56b" opacity=".05"/></g>
<rect x="0" y="0" width="300" height="1000" fill="url(#b)" opacity=".75"/><rect x="1300" y="0" width="300" height="1000" fill="url(#b)" opacity=".75"/>
<rect x="296" y="0" width="10" height="1000" fill="#0a0707"/><rect x="1294" y="0" width="10" height="1000" fill="#0a0707"/>
<g stroke="#1e2622" stroke-width="5" fill="none"><path d="M1300 300 h170 v180 h-170 M1300 480 h170 v180 h-170"/><path d="M1320 300 l130 180 M1320 480 l130 180"/></g>
<circle cx="150" cy="330" r="190" fill="url(#pk)"/><circle cx="1450" cy="620" r="210" fill="url(#gr)"/>
<g class="fl" filter="url(#n)" font-family="ui-monospace,monospace" font-weight="700" font-size="74" fill="#ff6fd6" text-anchor="middle"><text x="150" y="220">G</text><text x="150" y="300">L</text><text x="150" y="380">O</text><text x="150" y="460">B</text></g>
<g filter="url(#n)" stroke="#52f2ff" stroke-width="6" fill="none" opacity=".85"><ellipse cx="1450" cy="200" rx="90" ry="24"/><path d="M1405 186 q45 -60 90 0"/></g>
<rect x="0" y="900" width="1600" height="100" fill="#070b09"/>
<ellipse cx="160" cy="940" rx="150" ry="14" fill="#ff6fd6" opacity=".12"/><ellipse cx="1440" cy="950" rx="170" ry="14" fill="#52f2ff" opacity=".1"/>
<g filter="url(#sb)"><circle class="st" cx="240" cy="900" r="40" fill="#cfe0d8" opacity=".2"/><circle class="st2" cx="1360" cy="910" r="46" fill="#cfe0d8" opacity=".2"/></g>
</svg>`
