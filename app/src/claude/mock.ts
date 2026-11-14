// Offline mock engine (open the app with ?mock=1). Streams a scripted, believable turn that
// exercises every path the real engines do: thinking, streamed Markdown, a real write_file into
// project storage, an ask_user bubble you answer, two parallel clones writing their own files,
// an HTML artifact, and usage numbers that move the fuel tank. No network, no key.

import type { CompleteRequest, Engine, EngineHooks, EngineRequest, EngineResult } from './engine';
import { EngineError } from './engine';
import { costOf } from './models';
import { sleep, uid, estimateTokens } from '../core/util';
import type { MessageUsage } from '../core/types';

const GAME_TS = `// Jelly Jump — core loop prototype
export interface Glob { x: number; y: number; vy: number; squish: number; grounded: boolean }

const GRAVITY = 1800;      // px/s²
const JUMP_VELOCITY = -720; // px/s

export function step(g: Glob, dt: number, jumpPressed: boolean): Glob {
  let { x, y, vy, squish, grounded } = g;
  if (grounded && jumpPressed) { vy = JUMP_VELOCITY; grounded = false; squish = 0.35; }
  vy += GRAVITY * dt;
  y += vy * dt;
  if (y >= 0) { if (!grounded) squish = -0.3; y = 0; vy = 0; grounded = true; }
  squish *= Math.pow(0.0008, dt); // jelly settles back
  return { x, y, vy, squish, grounded };
}
`;

const DEMO_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Jelly Jump</title>
<style>html,body{margin:0;height:100%;background:#0b130e;display:grid;place-items:center;font:600 14px system-ui;color:#9dff8a}canvas{background:#10201a;border-radius:16px;box-shadow:0 0 40px #8cf56b33}</style></head>
<body><div><canvas id="c" width="420" height="260"></canvas><p style="text-align:center">Press SPACE or tap to jump</p></div>
<script>
const c=document.getElementById('c'),x=c.getContext('2d');let y=0,vy=0,s=0,g=true,t=performance.now();
const jump=()=>{if(g){vy=-720;g=false;s=.35}};addEventListener('keydown',e=>{if(e.code==='Space')jump()});c.onpointerdown=jump;
function f(n){const dt=Math.min(.05,(n-t)/1000);t=n;vy+=1800*dt;y+=vy*dt;if(y>=0){if(!g)s=-.3;y=0;vy=0;g=true}s*=Math.pow(.0008,dt);
x.clearRect(0,0,420,260);x.fillStyle='#1b3324';x.fillRect(0,220,420,40);const sx=1+s*.6,sy=1-s*.6;x.save();x.translate(210,220+y*.3);x.scale(sx,sy);
x.fillStyle='#8cf56b';x.beginPath();x.ellipse(0,-34,34,34,0,0,7);x.fill();x.fillStyle='#000';x.beginPath();x.ellipse(-12,-38,9,12,0,0,7);x.ellipse(12,-38,9,12,0,0,7);x.fill();
x.fillStyle='#fff';x.beginPath();x.arc(-9,-43,3,0,7);x.arc(15,-43,3,0,7);x.fill();x.restore();requestAnimationFrame(f)}requestAnimationFrame(f);
</script></body></html>`;

function usage(model: string, input: number, output: number, cacheRead = 0): MessageUsage {
  const u = { input, output, cacheRead, cacheWrite: 0 };
  return { ...u, costUsd: costOf(model, u), estimated: false };
}

async function streamText(text: string, hooks: EngineHooks, signal?: AbortSignal, speed = 1) {
  const parts = text.match(/[\s\S]{1,7}/g) ?? [];
  for (const p of parts) {
    if (signal?.aborted) throw new EngineError('Stopped.', 'cancelled');
    hooks.onText(p);
    await sleep((14 + Math.random() * 20) / speed);
  }
}

async function tool(hooks: EngineHooks, name: string, input: any, signal?: AbortSignal, delay = 700) {
  const id = uid('toolu_mock_');
  hooks.onToolStart(id, name, {}, false);
  await sleep(250);
  hooks.onToolInput(id, input);
  await sleep(delay);
  if (signal?.aborted) throw new EngineError('Stopped.', 'cancelled');
  const r = await hooks.runTool(id, name, input);
  hooks.onToolEnd(id, !r.isError, r.content.slice(0, 120));
  return r;
}

export function mockEngine(): Engine {
  async function run(req: EngineRequest, hooks: EngineHooks): Promise<EngineResult> {
    const { signal, model } = req;
    const has = (n: string) => req.tools.some((t) => t.name === n);
    hooks.onThinking('');
    if (req.showThinking) for (const w of 'Sketching the core loop, picking file layout, deciding what to delegate to clones…'.split(' ')) { hooks.onThinking(w + ' '); await sleep(40); }
    await sleep(900);

    if (req.isClone) {
      const slug = (req.hint ?? 'task').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'task';
      await streamText(`Working on **${req.hint}**.\n`, hooks, signal, 2);
      await tool(hooks, 'write_file', { path: `docs/${slug}.md`, content: `# ${req.hint}\n\nDrafted by a clone in the mock lab.\n\n- Idea one\n- Idea two\n` }, signal, 1400);
      await streamText(`Done — wrote docs/${slug}.md with a first draft.`, hooks, signal, 2);
      hooks.onUsage(model, usage(model, 900, 240));
      return { transcript: [{ role: 'assistant', content: [{ type: 'text', text: 'Done.' }] }], text: `Wrote docs/${slug}.md with a first draft.`, stopReason: 'end_turn', contextTokens: 1200 };
    }

    if (has('update_design_doc')) {
      await streamText('Ooh, a jelly platformer! Let me pin down the core first.\n\n', hooks, signal);
      await tool(hooks, 'update_design_doc', { title: 'Jelly Jump', pitch: 'A squishy alien bounces through a neon alley, sticking to walls and absorbing power-ups.', genre: 'Platformer', coreLoop: 'Jump → stick → absorb → grow → reach the rooftop', pillars: ['Squishy physics', 'Neon alley vibes', 'Short runs'], completeness: 40 }, signal);
      let answer = '';
      if (has('ask_user')) answer = (await tool(hooks, 'ask_user', { question: 'Who is this for — quick mobile runs or longer PC sessions?', options: ['Mobile, 2-minute runs', 'PC, 20-minute runs', 'Both'] }, signal)).content;
      await streamText(`\n\nNoted (${answer.replace('User answered: ', '') || 'no answer'}). Next I'd like to nail progression: do power-ups persist between runs?`, hooks, signal);
      hooks.onUsage(model, usage(model, 2400, 380, 1800));
      return { transcript: [{ role: 'assistant', content: [{ type: 'text', text: 'Design doc updated.' }] }], text: 'Design doc updated.', stopReason: 'end_turn', contextTokens: 4600 };
    }

    if (!has('write_file')) {
      await streamText(`*(mock engine)* Here's a quick answer to “${(req.hint ?? '').slice(0, 60)}”. Open the app without **?mock=1** and link a real Claude account for real answers.`, hooks, signal);
      hooks.onUsage(model, usage(model, 800, 120));
      return { transcript: [{ role: 'assistant', content: [{ type: 'text', text: 'Mock answer.' }] }], text: 'Mock answer.', stopReason: 'end_turn', contextTokens: 900 };
    }

    await streamText("On it! I'll set up the core loop first, then ask you one design question.\n\n", hooks, signal);
    hooks.onUsage(model, usage(model, 3200, 160, 0));
    await tool(hooks, 'write_file', { path: 'src/jelly.ts', content: GAME_TS }, signal, 1600);
    const ans = has('ask_user')
      ? (await tool(hooks, 'ask_user', { question: 'When the jelly lands, should it bounce, splat, or explode into confetti?', options: ['Bounce', 'Splat', 'Confetti!'] }, signal)).content.replace('User answered: ', '')
      : 'Bounce';
    hooks.onUsage(model, usage(model, 400, 210, 3200));
    if (has('spawn_clones')) {
      await streamText(`\n\n**${ans}** it is. Spawning two clones for the level generator and the sound board while I build a playable demo.\n\n`, hooks, signal);
      await tool(hooks, 'spawn_clones', { tasks: [
        { title: 'Level generator', instructions: 'Draft a tiny procedural platform generator plan.' },
        { title: 'Sound board', instructions: 'List the sound effects the prototype needs.' },
      ] }, signal, 300);
    }
    if (has('create_artifact')) await tool(hooks, 'create_artifact', { title: 'Jelly Jump demo', kind: 'html', content: DEMO_HTML }, signal, 1200);
    await streamText(`\n\n### What's in the lab now\n- \`src/jelly.ts\` — the squash-and-stretch jump step (gravity **1800 px/s²**, jump **-720 px/s**)\n- Landing style: **${ans.toLowerCase()}**\n- Clone reports in \`docs/\`\n- A playable demo in the artifact viewer\n\n\`\`\`ts\nconst next = step(glob, dt, input.jump);\n\`\`\`\n\nWant me to add wall-sticking next?`, hooks, signal);
    hooks.onUsage(model, usage(model, 600, 420, 3600));
    return { transcript: [{ role: 'assistant', content: [{ type: 'text', text: `Built src/jelly.ts, landing style ${ans}, demo artifact.` }] }], text: 'ok', stopReason: 'end_turn', contextTokens: 8200 };
  }

  async function complete(r: CompleteRequest) {
    await sleep(500);
    if (r.signal?.aborted) throw new EngineError('Stopped.', 'cancelled');
    let text: string;
    if (/rewrite a user's prompt/i.test(r.system ?? '')) {
      text = r.prompt.replace(/\b(please|kindly|basically|actually|just|really|i would like you to|i want you to|could you|can you)\b\s*/gi, '').replace(/\s{2,}/g, ' ').replace(/thqn/g, 'than').trim();
      text = text.charAt(0).toUpperCase() + text.slice(1);
    } else if (/title/i.test(r.system ?? '')) text = 'Mock experiment';
    else if (/compress a conversation/i.test(r.system ?? '')) text = '## Summary\n- The user is prototyping a jelly platformer.\n- src/jelly.ts holds the jump step.';
    else text = `Mock reply to: ${r.prompt.slice(0, 120)}`;
    return { text, usage: usage(r.model, estimateTokens(r.prompt) + 200, estimateTokens(text)), model: r.model };
  }

  return { kind: 'mock', run, complete };
}
