// claude.ai engine — runs on the viewer's own Claude account through the artifact `sample`
// capability. Each call is memory-less and has no system prompt, so the frozen instructions
// travel at the top of the first user turn and history is flattened to text turns. Client tools
// are offered as page functions (`execute`), which the platform calls between rounds.
// No usage numbers come back, so tokens are estimated (≈4 chars/token) and flagged as such.

import { capability } from '../core/env';
import { estimateTokens } from '../core/util';
import type { MessageUsage } from '../core/types';
import type { ApiMsg, CompleteRequest, Engine, EngineHooks, EngineRequest, EngineResult } from './engine';
import { EngineError, sampleReady } from './engine';
import { modelInfo } from './models';
import { uid } from '../core/util';

let sampleFn: any = null;
let toolMax = 0;

capability<any>('sample').then(async (s) => {
  sampleFn = s;
  if (s) { try { const lim = await s.limits?.(); toolMax = lim?.tools?.maxCount ?? 0; } catch { toolMax = 0; } }
  sampleReady.value = !!s;
});

function blockText(content: any): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((b: any) => {
    if (b.type === 'text') return b.text;
    if (b.type === 'image') return '[image attached]';
    if (b.type === 'document') return '[document attached]';
    if (b.type === 'tool_use') return `[used ${b.name}${b.input?.path ? ` on ${b.input.path}` : ''}]`;
    if (b.type === 'tool_result') return `[tool result: ${String(typeof b.content === 'string' ? b.content : 'ok').slice(0, 300)}]`;
    return '';
  }).filter(Boolean).join('\n');
}

/** Flatten API-shaped history into alternating text turns ending on the user. */
function toTurns(system: string, msgs: ApiMsg[]): { role: 'user' | 'assistant'; content: string }[] {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of msgs) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    let text = blockText(m.content);
    if (m.role === 'system') text = `<operator_note>${text}</operator_note>`;
    if (!text.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += '\n\n' + text; else out.push({ role, content: text });
  }
  if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', content: '' });
  out[0].content = `<instructions>\n${system}\n</instructions>\n\n${out[0].content}`;
  if (out[out.length - 1].role !== 'user') out.push({ role: 'user', content: 'Continue.' });
  return out;
}

function images(msgs: ApiMsg[]): Blob[] {
  const last = msgs.filter((m) => m.role === 'user').pop();
  if (!last || !Array.isArray(last.content)) return [];
  const out: Blob[] = [];
  for (const b of last.content) if (b.type === 'image' && b.source?.type === 'base64') {
    const bin = atob(b.source.data); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    out.push(new Blob([arr], { type: b.source.media_type }));
  }
  return out;
}

function mapError(e: any, partial?: string): EngineError {
  const code = e?.code;
  const msg: Record<string, [string, EngineError['code']]> = {
    cancelled: ['Stopped.', 'cancelled'],
    not_granted: ['You declined Claude access for this page. Reload to be asked again.', 'auth'],
    rate_limited: ['Your Claude usage limit (or this page\'s call rate) was reached. Give it a little while.', 'rate'],
    sampling_disabled: ['Claude access is turned off for your account here.', 'unavailable'],
    session_expired: ['Your claude.ai session expired — reload the page.', 'auth'],
    prompt_too_large: ['This conversation is too large for one call — compact it or start a new chat.', 'bad_request'],
    refused: ['Claude declined this request.', 'refused'],
    tools_unavailable: ['Tools are not available in this view.', 'unavailable'],
    images_unavailable: ['Images can\'t be sent from this view.', 'unavailable'],
  };
  const [text, kind] = msg[code] ?? [`Claude call failed (${code ?? 'error'}): ${e?.message ?? ''}`, 'unknown' as const];
  return new EngineError(text, kind, undefined, partial ?? e?.text);
}

export function claudeaiEngine(): Engine {
  async function run(req: EngineRequest, hooks: EngineHooks): Promise<EngineResult> {
    if (!sampleFn) throw new EngineError('claude.ai access is not available here.', 'unavailable');
    const m = modelInfo(req.model);
    const turns = toTurns(req.system, req.messages);
    let toolChars = 0, resultChars = 0, text = '';
    const tools = req.tools.slice(0, toolMax || 0).map((t) => ({
      name: t.name,
      description: t.description.slice(0, 1000),
      inputSchema: t.input_schema,
      execute: async (input: Record<string, unknown>) => {
        const id = uid('tu_');
        toolChars += JSON.stringify(input ?? {}).length;
        hooks.onToolStart(id, t.name, input, false);
        hooks.onToolInput(id, input);
        const r = await hooks.runTool(id, t.name, input);
        hooks.onToolEnd(id, !r.isError, r.content.slice(0, 120));
        resultChars += r.content.length;
        if (r.isError) throw new Error(r.content);
        return r.content.length > 30_000 ? r.content.slice(0, 30_000) + '\n…[truncated]' : r.content;
      },
    }));
    hooks.onThinking('');
    const imgs = images(req.messages);
    try {
      const res = await sampleFn(turns, {
        onText: ({ delta }: { delta: string }) => { text += delta; hooks.onText(delta); },
        signal: req.signal,
        ...(tools.length ? { tools } : {}),
        ...(imgs.length ? { images: imgs } : {}),
        modelTier: m.tier,
        model: req.model,
        effort: req.effort === 'xhigh' || req.effort === 'max' ? 'high' : req.effort,
        cache: false,
      });
      const final = res?.text ?? text;
      const usage: MessageUsage = {
        input: estimateTokens(JSON.stringify(turns)) + Math.ceil(resultChars / 4), output: estimateTokens(final) + Math.ceil(toolChars / 4),
        cacheRead: 0, cacheWrite: 0, costUsd: 0, estimated: true,
      };
      hooks.onUsage(req.model, usage);
      if (res?.truncated) hooks.onNotice('The answer hit a length or time limit — ask Claude to continue.', 'warn');
      return {
        transcript: [{ role: 'assistant', content: [{ type: 'text', text: final }] }],
        text: final, stopReason: res?.truncated ? 'max_tokens' : 'end_turn',
        contextTokens: usage.input + usage.output, servedBy: res?.modelApplied,
      };
    } catch (e: any) {
      throw mapError(e, text);
    }
  }

  async function complete(r: CompleteRequest) {
    if (!sampleFn) throw new EngineError('claude.ai access is not available here.', 'unavailable');
    const prompt = r.system ? `<instructions>\n${r.system}\n</instructions>\n\n${r.prompt}` : r.prompt;
    try {
      const res = await sampleFn(prompt, { modelTier: modelInfo(r.model).tier, effort: r.effort === 'xhigh' || r.effort === 'max' ? 'high' : r.effort, signal: r.signal });
      const text = String(res?.text ?? '').trim();
      return { text, usage: { input: estimateTokens(prompt), output: estimateTokens(text), cacheRead: 0, cacheWrite: 0, costUsd: 0, estimated: true }, model: r.model };
    } catch (e: any) { throw mapError(e); }
  }

  return { kind: 'claudeai', run, complete };
}
