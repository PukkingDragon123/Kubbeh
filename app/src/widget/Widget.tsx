// The floating lab widget: a tiny living pixel lab you keep on top of other apps.
// Aliens move to the station matching what Claude is really doing (crew signal), little
// UFOs fly around them, and the fuel / genes / project progress stay visible.
import { useEffect, useRef } from 'preact/hooks';
import { activeProjectId, crew, economy, fuel, looks, projects, settings } from '../core/state';
import { isBusy } from '../core/crew';
import type { ActivityKind, CrewMember } from '../core/types';
import { Icon } from '../ui/common/icons';
import { tinyAlien } from '../economy/pixelart';

const W = 160, H = 64, FLOOR = 50;
/** Station x per activity (matches the 3D lab's layout left→right). */
const STATION: Partial<Record<ActivityKind, number>> = {
  thinking: 22, writing: 22, coding: 22, bugfix: 38, files: 56, research: 80, planning: 102, building: 102, cloning: 126, question: 80, celebrating: 80,
};

type Agent = { x: number; tx: number; dir: number; walk: number; carry: boolean; leg: number; hop: number; wanderAt: number };

function drawScene(ctx: CanvasRenderingContext2D, t: number, level: number, tier: string, reduce: boolean) {
  // brick wall
  ctx.fillStyle = '#2a1714'; ctx.fillRect(0, 0, W, FLOOR);
  for (let y = 0; y < FLOOR; y += 5) {
    const off = (y / 5) % 2 ? 5 : 0;
    ctx.fillStyle = '#3a1f1a';
    for (let x = -off; x < W; x += 10) ctx.fillRect(x + 1, y + 1, 8, 3);
  }
  // night window
  ctx.fillStyle = '#0a0620'; ctx.fillRect(4, 4, 30, 16);
  ctx.fillStyle = '#1d2a22'; ctx.fillRect(4, 11, 30, 1); ctx.fillRect(18, 4, 1, 16);
  for (const [sx, sy] of [[8, 6], [26, 8], [13, 15], [30, 17], [22, 6]]) { ctx.fillStyle = Math.sin(t * 2 + sx) > 0 ? '#ffffff' : '#7a86c8'; ctx.fillRect(sx, sy, 1, 1); }
  // pipes
  ctx.fillStyle = '#4d5862'; ctx.fillRect(0, 26, W, 2); ctx.fillStyle = '#6b7680'; ctx.fillRect(0, 26, W, 1);
  ctx.fillStyle = '#5f6a75'; for (let x = 12; x < W; x += 36) ctx.fillRect(x, 25, 3, 4);
  // neon sign
  const on = reduce || Math.sin(t * 9) > -0.95;
  ctx.strokeStyle = on ? '#ff6fd6' : '#5a2a50'; ctx.lineWidth = 1; ctx.strokeRect(62.5, 5.5, 34, 11);
  ctx.fillStyle = on ? '#8cf56b' : '#2a4a20';
  // "GLOB" in 3×5 pixel letters
  const L: Record<string, string[]> = { G: ['111', '100', '101', '101', '111'], L: ['100', '100', '100', '100', '111'], O: ['111', '101', '101', '101', '111'], B: ['110', '101', '110', '101', '110'] };
  'GLOB'.split('').forEach((ch, i) => L[ch].forEach((row, y) => row.split('').forEach((c, x) => { if (c === '1') ctx.fillRect(66 + i * 7 + x, 8 + y, 1, 1); })));
  // floor
  ctx.fillStyle = '#141c17'; ctx.fillRect(0, FLOOR, W, H - FLOOR);
  ctx.fillStyle = '#1d2a22'; for (let x = 0; x < W; x += 16) ctx.fillRect(x, FLOOR, 1, H - FLOOR);
  ctx.fillStyle = '#8cf56b22'; ctx.fillRect(70, 58, 18, 2);
  // desk + computer
  ctx.fillStyle = '#6e4a28'; ctx.fillRect(10, 40, 26, 3); ctx.fillRect(12, 43, 2, 7); ctx.fillRect(32, 43, 2, 7);
  ctx.fillStyle = '#2b2f36'; ctx.fillRect(15, 30, 14, 10);
  ctx.fillStyle = '#0b1a12'; ctx.fillRect(16, 31, 12, 8);
  ctx.fillStyle = '#8cf56b'; for (let i = 0; i < 4; i++) ctx.fillRect(17, 32 + i * 2, 2 + ((Math.floor(t * 4) + i * 3) % 9), 1);
  // file cabinet
  ctx.fillStyle = '#5f7a6a'; ctx.fillRect(48, 32, 12, 18); ctx.fillStyle = '#4a6255'; ctx.fillRect(49, 37, 10, 1); ctx.fillRect(49, 43, 10, 1); ctx.fillStyle = '#c4ccd3'; ctx.fillRect(53, 34, 2, 1); ctx.fillRect(53, 40, 2, 1); ctx.fillRect(53, 46, 2, 1);
  // telescope / antenna
  ctx.fillStyle = '#7a8794'; ctx.fillRect(79, 40, 2, 10); ctx.fillRect(76, 49, 8, 1);
  ctx.save(); ctx.translate(80, 40); ctx.rotate(-0.6); ctx.fillStyle = '#c4ccd3'; ctx.fillRect(-2, -10, 4, 12); ctx.fillStyle = '#52f2ff'; ctx.fillRect(-2, -11, 4, 1); ctx.restore();
  // whiteboard
  ctx.fillStyle = '#d6dde3'; ctx.fillRect(94, 30, 18, 12); ctx.fillStyle = '#9aa6b2'; ctx.fillRect(94, 42, 18, 1);
  ctx.fillStyle = '#3b5bff'; ctx.fillRect(96, 32, 8, 1); ctx.fillStyle = '#ff6fd6'; ctx.fillRect(96, 35, 12, 1); ctx.fillStyle = '#3f8a2a'; ctx.fillRect(96, 38, 6, 1);
  ctx.fillStyle = '#5f6a75'; ctx.fillRect(97, 43, 1, 7); ctx.fillRect(108, 43, 1, 7);
  // cloning vat
  ctx.fillStyle = '#5f6a75'; ctx.fillRect(119, 30, 14, 3); ctx.fillRect(119, 47, 14, 3);
  ctx.fillStyle = '#163a2e'; ctx.fillRect(120, 33, 12, 14);
  ctx.fillStyle = '#8cf56b55'; ctx.fillRect(120, 37, 12, 10);
  ctx.fillStyle = '#c8ffb0'; for (let i = 0; i < 3; i++) { const by = 46 - ((t * 12 + i * 5) % 10); ctx.fillRect(122 + i * 4, by | 0, 1, 1); }
  // fuel tank (real level)
  const c = tier === 'full' ? '#8cf56b' : tier === 'half' ? '#52f2ff' : tier === 'quarter' ? '#ffbe3d' : '#ff5a5a';
  ctx.fillStyle = '#3a404a'; ctx.fillRect(143, 20, 12, 30);
  ctx.fillStyle = '#0b1310'; ctx.fillRect(145, 22, 8, 26);
  const lh = Math.round(26 * level);
  ctx.fillStyle = c; ctx.fillRect(145, 48 - lh, 8, lh);
  ctx.fillStyle = '#ffffff66'; for (const m of [0.5, 0.25, 0.1]) ctx.fillRect(144, 48 - Math.round(26 * m), 10, 1);
  if ((tier === 'critical' || tier === 'quarter' || tier === 'empty') && Math.sin(t * 10) > 0) { ctx.fillStyle = tier === 'quarter' ? '#ffbe3d' : '#ff5a5a'; ctx.fillRect(147, 17, 4, 3); }
}

function drawUfo(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, beam: boolean) {
  if (beam) { ctx.globalAlpha = 0.18 + Math.sin(t * 9) * 0.06; ctx.fillStyle = '#a8f8ff'; ctx.beginPath(); ctx.moveTo(x - 2, y + 3); ctx.lineTo(x + 2, y + 3); ctx.lineTo(x + 6, y + 18); ctx.lineTo(x - 6, y + 18); ctx.fill(); ctx.globalAlpha = 1; }
  ctx.fillStyle = '#a8f8ff'; ctx.fillRect(x - 2, y - 2, 4, 2);
  ctx.fillStyle = '#9aa6b2'; ctx.fillRect(x - 5, y, 10, 2); ctx.fillRect(x - 3, y + 2, 6, 1);
  ctx.fillStyle = Math.sin(t * 8 + x) > 0 ? '#ffe14d' : '#ff6fd6'; ctx.fillRect(x - 4, y + 1, 1, 1); ctx.fillRect(x + 3, y + 1, 1, 1);
}

function effect(ctx: CanvasRenderingContext2D, m: CrewMember, x: number, y: number, t: number) {
  const k = Math.floor(t * 6);
  switch (m.activity) {
    case 'thinking': ctx.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) if ((k + i) % 3 !== 0) ctx.fillRect(x + 3 + i * 2, y - 3 - i, 1, 1); break;
    case 'writing': case 'coding': ctx.fillStyle = '#8cf56b'; for (let i = 0; i < 3; i++) ctx.fillRect(x - 2 + ((k * 3 + i * 5) % 14), y - 2 - ((k + i * 2) % 5), 1, 1); break;
    case 'research': ctx.fillStyle = '#52f2ff'; ctx.fillRect(x + 6, y - 4 + (k % 3), 1, 1); ctx.fillRect(x + 8, y - 6 + (k % 2), 1, 1); break;
    case 'bugfix': ctx.fillStyle = '#ffbe3d'; if (k % 2) { ctx.fillRect(x - 2, y + 4, 1, 1); ctx.fillRect(x - 3, y + 2, 1, 1); } break;
    case 'question': ctx.fillStyle = '#fbfff3'; ctx.fillRect(x + 3, y - 9, 7, 7); ctx.fillStyle = '#142016'; ctx.fillRect(x + 6, y - 8, 1, 3); ctx.fillRect(x + 6, y - 4, 1, 1); break;
    case 'celebrating': { const cs = ['#ff6fd6', '#8cf56b', '#52f2ff', '#ffbe3d']; for (let i = 0; i < 6; i++) { ctx.fillStyle = cs[i % 4]; ctx.fillRect(x - 2 + ((i * 7 + k) % 16), y - 4 - ((i * 3 + k * 2) % 9), 1, 1); } break; }
    case 'sleeping': ctx.fillStyle = '#9db4ff'; ctx.fillRect(x + 8, y - 2 - (k % 4), 2, 1); break;
    case 'cloning': ctx.fillStyle = '#c8ffb0'; ctx.fillRect(x + 1 + (k % 9), y - 1, 1, 1); break;
  }
}

export function Widget({ win, onClose, onHome, dragHandle }: { win: Window; onClose?: () => void; onHome: () => void; dragHandle?: (e: PointerEvent) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const f = fuel.value;
  const eco = economy.value;
  const busy = crew.value.filter(isBusy);
  const proj = projects.value.find((p) => p.id === activeProjectId.value) ?? [...projects.value].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const tasks = proj?.tasks ?? [];
  const done = tasks.filter((x) => x.status === 'done').length;
  const fc = f.tier === 'full' ? 'var(--glob)' : f.tier === 'half' ? 'var(--cyan)' : f.tier === 'quarter' ? 'var(--amber)' : 'var(--red)';

  useEffect(() => {
    const canvas = cv.current!; const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const agents = new Map<string, Agent>();
    const ufos = [{ x: 20, y: 9, vx: 9, beamAt: 0 }, { x: 130, y: 15, vx: -6, beamAt: 0 }];
    let raf = 0, last = performance.now();
    const raff = win.requestAnimationFrame.bind(win);
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = now / 1000;
      const reduce = settings.value.reduceMotion;
      const fr = fuel.value;
      drawScene(ctx, t, fr.level, fr.tier, reduce);
      const members = crew.value;
      const lk = new Map(looks.value.map((l) => [l.id, l]));
      // station crowding offsets
      const atStation = new Map<number, number>();
      members.forEach((m, i) => {
        let a = agents.get(m.id);
        if (!a) { a = { x: m.role === 'clone' ? 126 : 20 + i * 22, tx: 0, dir: 1, walk: 0, carry: false, leg: 0, hop: 0, wanderAt: 0 }; agents.set(m.id, a); }
        const st = STATION[m.activity];
        if (st !== undefined) {
          const n = atStation.get(st) ?? 0; atStation.set(st, n + 1);
          a.tx = st + (n % 2 ? -1 : 1) * Math.ceil(n / 2) * 9;
          if (m.activity === 'files') a.tx = Math.floor(t / 2.2) % 2 ? 26 : 56;
          a.carry = m.activity === 'files';
        } else {
          a.carry = false;
          if (now > a.wanderAt) { a.tx = 8 + Math.random() * 128; a.wanderAt = now + 2500 + Math.random() * 4000; }
        }
        const dx = a.tx - a.x;
        if (reduce) a.x = a.tx;
        else if (Math.abs(dx) > 0.6) { a.x += Math.sign(dx) * Math.min(Math.abs(dx), 34 * dt * (m.activity === 'question' ? 1.8 : 1)); a.dir = Math.sign(dx); a.walk += dt * 10; }
        const moving = Math.abs(dx) > 0.6 && !reduce;
        const hop = m.activity === 'celebrating' && !reduce ? Math.abs(Math.sin(t * 8 + i)) * 5 : moving ? Math.abs(Math.sin(a.walk)) * 1.5 : reduce ? 0 : Math.sin(t * 2 + i) * 0.6;
        const look = lk.get(m.lookId ?? m.id) ?? lk.get('blip') ?? looks.value[0];
        if (!look) return;
        const spr = tinyAlien(look, moving && Math.sin(a.walk * 2) > 0 ? 1 : 0, m.activity === 'sleeping' || (!reduce && Math.sin(t * 1.7 + i * 3) > 0.985));
        const x = Math.round(a.x - 6), y = Math.round(FLOOR - 13 - hop);
        ctx.save();
        if (m.role === 'clone') ctx.globalAlpha = 0.85;
        if (a.dir < 0) { ctx.translate(x + 12, y); ctx.scale(-1, 1); ctx.drawImage(spr, 0, 0); } else ctx.drawImage(spr, x, y);
        ctx.restore();
        if (a.carry) { ctx.fillStyle = '#fbfff3'; ctx.fillRect(x + 3, y - 4, 6, 4); ctx.fillStyle = '#9aa6b2'; ctx.fillRect(x + 4, y - 3, 4, 1); }
        effect(ctx, m, x, y, t);
      });
      for (const id of [...agents.keys()]) if (!members.some((m) => m.id === id)) agents.delete(id);
      // UFOs circle above the crew
      const anyBusy = members.some(isBusy);
      for (const u of ufos) {
        if (!reduce) { u.x += u.vx * dt * (anyBusy ? 1.6 : 1); if (u.x > W + 8) { u.x = -8; u.y = 7 + Math.random() * 12; } if (u.x < -8) { u.x = W + 8; u.y = 7 + Math.random() * 12; } }
        drawUfo(ctx, Math.round(u.x), Math.round(u.y + (reduce ? 0 : Math.sin(t * 3 + u.x / 20) * 1.5)), t, anyBusy && Math.sin(t * 0.7 + u.x) > 0.3);
      }
      raf = raff(frame);
    };
    raf = raff(frame);
    return () => win.cancelAnimationFrame(raf);
  }, [win]);

  return (
    <div class="glw">
      <div class="glw-head" onPointerDown={dragHandle as any}>
        <span class="glw-logo" onClick={onHome} title="Back to the lab"><Icon name="alien" size="sm" />GLOB<b>LABS</b></span>
        <span class="glw-genes" title="Gene Points"><Icon name="dna" size="sm" />{eco.balance.toLocaleString()}</span>
        <button type="button" class="glw-btn" onClick={onHome} title="Open the lab" aria-label="Open the lab"><Icon name="back" size="sm" /></button>
        {onClose && <button type="button" class="glw-btn" onClick={onClose} title="Close widget" aria-label="Close widget"><Icon name="close" size="sm" /></button>}
      </div>
      <div class="glw-screen"><canvas ref={cv} width={W} height={H} /></div>
      <div class="glw-status">
        {busy.length ? busy.slice(-2).map((m) => <div key={m.id}><b>{m.name}</b> <span class="dim">{m.label}</span></div>) : <div class="dim">Crew idle · waiting for your next experiment</div>}
      </div>
      <div class="glw-row">
        <span class="k">Fuel</span>
        <span class={`glw-bar ${f.tier === 'critical' || f.tier === 'empty' ? 'blink' : ''}`}><i style={{ width: `${Math.round(f.level * 100)}%`, background: fc, boxShadow: `0 0 8px ${fc}` }} />{[50, 25, 10].map((m) => <b key={m} style={{ left: `${m}%` }} />)}</span>
        <span class="tnum" style={{ color: fc, fontFamily: 'var(--font-display)' }}>{Math.round(f.level * 100)}%</span>
      </div>
      <div class="glw-row">
        <span class="k">Project</span>
        {proj ? <span class="glw-bar"><i style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%`, background: 'var(--pink)', boxShadow: '0 0 8px var(--pink)' }} /></span> : <span class="dim">No project yet</span>}
        {proj && <span class="dim tnum" title={proj.name} style={{ maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tasks.length ? `${done}/${tasks.length}` : proj.name}</span>}
      </div>
    </div>
  );
}
