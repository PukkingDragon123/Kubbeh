// API engine — official Anthropic SDK in the browser, streaming manual tool loop.
//
// Request shape choices (see the claude-api skill):
//   • beta endpoint, so we can send `fallbacks: "default"` (server-side refusal fallback) and
//     `thinking.block_binding.prefix_mismatch_behavior: "drop_block"` — if a compaction or a
//     project-instruction edit changes the conversation prefix, stale thinking blocks are dropped
//     instead of failing the request with a 400.
//   • adaptive thinking (Opus 5.5 can't disable it); depth via output_config.effort, set explicitly.
//   • frozen system prompt + top-level cache_control → automatic prompt caching of the prefix.
//   • eager_input_streaming on client tools (file bodies stream as written); every parsed input is
//     validated before it runs; pause_turn resumes; refusal / max_tokens stop the loop cleanly.

import Anthropic from '@anthropic-ai/sdk';
import type { CompleteRequest, Engine, EngineHooks, EngineRequest, EngineResult, ApiMsg } from './engine';
import { EngineError } from './engine';
import { modelInfo, costOf } from './models';
import { rateLimit } from '../core/state';
import type { MessageUsage, RateLimitSnapshot } from '../core/types';
import { validateInput } from './validate';

const clients = new Map<string, Anthropic>();
function client(key: string) {
  let c = clients.get(key);
  if (!c) { c = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 }); clients.set(key, c); }
  return c;
}

/** Validate a key cheaply (models.list); throws EngineError on failure. */
export async function validateKey(key: string): Promise<string[]> {
  try {
    const page = await client(key).models.list({ limit: 50 });
    return page.data.map((m) => m.id);
  } catch (err) { throw toEngineError(err); }
}

let lean = false; // set if the API rejects the beta extras; we then retry without them

function serverTools(model: string, web: boolean): any[] {
  if (!web) return [];
  const m = modelInfo(model);
  return m.webTools2026
    ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }, { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 5 }]
    : [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }, { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 5 }];
}

function buildParams(model: string, req: { effort: string; maxTokens: number; system?: string; showThinking?: boolean }, messages: ApiMsg[], tools: any[]) {
  const m = modelInfo(model);
  const params: any = {
    model,
    max_tokens: req.maxTokens,
    messages,
    cache_control: { type: 'ephemeral' },
    output_config: { effort: req.effort },
    thinking: { type: 'adaptive', ...(req.showThinking ? { display: 'summarized' } : {}) },
  };
  if (req.system) params.system = [{ type: 'text', text: req.system }];
  if (tools.length) params.tools = tools;
  if (!lean) {
    params.betas = ['thinking-binding-controls-2026-08-01', ...(m.fallbacks ? ['server-side-fallback-2026-07-01'] : [])];
    params.thinking.block_binding = { prefix_mismatch_behavior: 'drop_block' };
    if (m.fallbacks) params.fallbacks = 'default';
  }
  return params;
}

function captureRate(headers: Headers | undefined | null) {
  if (!headers) return;
  const n = (k: string) => { const v = headers.get(`anthropic-ratelimit-${k}`); return v === null ? undefined : Number(v); };
  const snap: RateLimitSnapshot = {
    ts: Date.now(),
    requestsLimit: n('requests-limit'), requestsRemaining: n('requests-remaining'),
    tokensLimit: n('tokens-limit'), tokensRemaining: n('tokens-remaining'),
    inputTokensLimit: n('input-tokens-limit'), inputTokensRemaining: n('input-tokens-remaining'),
    outputTokensLimit: n('output-tokens-limit'), outputTokensRemaining: n('output-tokens-remaining'),
    reset: headers.get('anthropic-ratelimit-tokens-reset') ?? headers.get('anthropic-ratelimit-requests-reset') ?? undefined,
  };
  if (Object.entries(snap).some(([k, v]) => k !== 'ts' && v !== undefined)) rateLimit.value = snap;
}

function usageOf(model: string, u: any): MessageUsage {
  const r = { input: u?.input_tokens ?? 0, output: u?.output_tokens ?? 0, cacheRead: u?.cache_read_input_tokens ?? 0, cacheWrite: u?.cache_creation_input_tokens ?? 0 };
  return { ...r, costUsd: costOf(model, r), estimated: false };
}

export function toEngineError(err: unknown, partial?: string): EngineError {
  if (err instanceof EngineError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return new EngineError('Stopped.', 'cancelled', undefined, partial);
  if (err instanceof Anthropic.AuthenticationError) return new EngineError('That API key was rejected. Check it in Accounts (it should start with sk-ant-).', 'auth');
  if (err instanceof Anthropic.PermissionDeniedError) return new EngineError('This API key is not allowed to use that model or feature.', 'auth');
  if (err instanceof Anthropic.RateLimitError) {
    const ra = Number(err.headers?.get?.('retry-after') ?? 0) || undefined;
    return new EngineError(`Rate limited by the API${ra ? ` — try again in ${ra}s` : ''}. Auto-Saver can help: lower effort, fewer clones.`, 'rate', ra, partial);
  }
  if (err instanceof Anthropic.NotFoundError) return new EngineError('That model is not available on this key.', 'bad_request');
  if (err instanceof Anthropic.BadRequestError) return new EngineError(`The API rejected the request: ${err.message}`, 'bad_request', undefined, partial);
  if (err instanceof Anthropic.InternalServerError) return new EngineError(err.status === 529 ? 'Claude is overloaded right now — try again in a moment.' : 'The API had a server error — try again.', 'overloaded', undefined, partial);
  if (err instanceof Anthropic.APIConnectionError) return new EngineError('Could not reach api.anthropic.com. If this page runs inside claude.ai, outside network calls are blocked — use your claude.ai account instead.', 'network', undefined, partial);
  if (err instanceof Anthropic.APIError) return new EngineError(`API error ${err.status}: ${err.message}`, 'unknown', undefined, partial);
  return new EngineError(String((err as any)?.message ?? err), 'unknown', undefined, partial);
}

const isExtrasRejection = (err: unknown) =>
  err instanceof Anthropic.BadRequestError && /block_binding|fallbacks|anthropic-beta|beta/i.test(err.message);

export function apiEngine(key: string): Engine {
  const c = client(key);

  async function run(req: EngineRequest, hooks: EngineHooks): Promise<EngineResult> {
    const tools = [
      ...req.tools.map((t) => ({ ...t, eager_input_streaming: true })),
      ...serverTools(req.model, req.webSearch),
    ];
    const transcript: ApiMsg[] = [];
    let text = '';
    let continuations = 0, jsonRetries = 0, rounds = 0;
    let contextTokens: number | undefined;
    let servedBy: string | undefined;

    while (true) {
      if (++rounds > 40) { hooks.onNotice('Stopped after 40 tool rounds to protect your fuel.', 'warn'); return { transcript, text, stopReason: 'loop_limit', contextTokens, servedBy }; }
      const params = buildParams(req.model, req, [...req.messages, ...transcript], tools);
      let msg: Anthropic.Beta.BetaMessage;
      const toolMeta = new Map<number, { id: string; name: string; json: string; server: boolean }>();
      let roundText = '';
      try {
        const stream = c.beta.messages.stream(params, { signal: req.signal });
        for await (const ev of stream as AsyncIterable<any>) {
          if (ev.type === 'message_start') captureRate(stream.response?.headers);
          else if (ev.type === 'content_block_start') {
            const b = ev.content_block;
            if (b.type === 'thinking' || b.type === 'redacted_thinking') hooks.onThinking('');
            else if (b.type === 'tool_use' || b.type === 'server_tool_use') {
              toolMeta.set(ev.index, { id: b.id, name: b.name, json: '', server: b.type === 'server_tool_use' });
              hooks.onToolStart(b.id, b.name, b.input ?? {}, b.type === 'server_tool_use');
            } else if (typeof b.type === 'string' && b.type.endsWith('_tool_result')) {
              const ok = !(b.content && !Array.isArray(b.content) && (b.content.error_code || b.content.type?.endsWith?.('error')));
              if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
                hooks.onSearchResults(b.tool_use_id, b.content.filter((r: any) => r.url).slice(0, 8).map((r: any) => ({ title: r.title ?? r.url, url: r.url })));
              }
              hooks.onToolEnd(b.tool_use_id, ok, ok ? 'done' : String(b.content?.error_code ?? 'error'));
            }
          } else if (ev.type === 'content_block_delta') {
            const d = ev.delta;
            if (d.type === 'text_delta') { roundText += d.text; hooks.onText(d.text); }
            else if (d.type === 'thinking_delta') hooks.onThinking(d.thinking ?? '');
            else if (d.type === 'input_json_delta') {
              const t = toolMeta.get(ev.index);
              if (t) {
                t.json += d.partial_json;
                // surface the path early so the right alien starts on the right file
                const m = /"(path|title|query|url)"\s*:\s*"([^"]{1,200})"/.exec(t.json);
                if (m && t.json.length < 600) hooks.onToolInput(t.id, { [m[1]]: m[2] });
              }
            }
          } else if (ev.type === 'content_block_stop') {
            const t = toolMeta.get(ev.index);
            if (t && !t.server) { try { hooks.onToolInput(t.id, JSON.parse(t.json || '{}')); } catch { /* validated later */ } }
          }
        }
        msg = await stream.finalMessage();
        captureRate(stream.response?.headers);
        jsonRetries = 0;
      } catch (err) {
        if (isExtrasRejection(err) && !lean) { lean = true; rounds--; continue; }
        if (err instanceof Anthropic.APIUserAbortError || req.signal?.aborted) {
          if (roundText) transcript.push({ role: 'assistant', content: [{ type: 'text', text: roundText }] });
          throw new EngineError('Stopped.', 'cancelled', undefined, text + roundText);
        }
        if (!(err instanceof Anthropic.APIError) && jsonRetries++ < 2) { hooks.onNotice('A tool input arrived garbled — re-asking.', 'warn'); continue; }
        throw toEngineError(err, text + roundText);
      }

      text += roundText;
      const u = usageOf(msg.model ?? req.model, msg.usage);
      hooks.onUsage(msg.model ?? req.model, u);
      contextTokens = u.input + u.cacheRead + u.cacheWrite + u.output;
      if (msg.model && msg.model !== req.model) servedBy = msg.model;

      const content = msg.content as any[];
      const toolUses = content.filter((b) => b.type === 'tool_use');

      if (msg.stop_reason === 'pause_turn') {
        transcript.push({ role: 'assistant', content });
        if (++continuations > 5) { hooks.onNotice('Server tools paused too many times; stopping here.', 'warn'); return { transcript, text, stopReason: 'pause_turn', contextTokens, servedBy }; }
        continue;
      }
      if (msg.stop_reason === 'refusal') {
        transcript.push({ role: 'assistant', content: content.filter((b) => b.type === 'text' || b.type === 'thinking') });
        const det: any = (msg as any).stop_details;
        hooks.onNotice(`Claude declined this request${det?.category ? ` (${det.category})` : ''}. Try rephrasing or a different model.`, 'bad');
        return { transcript, text, stopReason: 'refusal', contextTokens, servedBy };
      }
      if (msg.stop_reason === 'max_tokens' && toolUses.length) {
        transcript.push({ role: 'assistant', content: content.filter((b) => b.type !== 'tool_use') });
        hooks.onNotice('The reply hit the length limit mid tool call — ask Claude to continue in smaller steps.', 'warn');
        for (const t of toolUses) hooks.onToolEnd(t.id, false, 'truncated');
        return { transcript, text, stopReason: 'max_tokens', contextTokens, servedBy };
      }
      transcript.push({ role: 'assistant', content });
      if (msg.stop_reason !== 'tool_use' || !toolUses.length) {
        if (msg.stop_reason === 'max_tokens') hooks.onNotice('The reply hit the length limit.', 'warn');
        return { transcript, text, stopReason: msg.stop_reason ?? 'end_turn', contextTokens, servedBy };
      }

      // run client tools in parallel, answer them all in ONE user message
      const results = await Promise.all(toolUses.map(async (t) => {
        const spec = req.tools.find((s) => s.name === t.name);
        const v = spec ? validateInput(spec.input_schema, t.input) : 'unknown tool';
        if (v) {
          hooks.onToolEnd(t.id, false, 'invalid input');
          return { type: 'tool_result', tool_use_id: t.id, is_error: true, content: JSON.stringify({ INVALID_JSON: JSON.stringify(t.input), problem: v }) };
        }
        try {
          const r = await hooks.runTool(t.id, t.name, t.input);
          hooks.onToolEnd(t.id, !r.isError, r.content.slice(0, 120));
          return { type: 'tool_result', tool_use_id: t.id, content: r.content, ...(r.isError ? { is_error: true } : {}) };
        } catch (err: any) {
          hooks.onToolEnd(t.id, false, String(err?.message ?? err));
          return { type: 'tool_result', tool_use_id: t.id, is_error: true, content: `Tool failed: ${err?.message ?? err}` };
        }
      }));
      transcript.push({ role: 'user', content: results });
      if (req.signal?.aborted) throw new EngineError('Stopped.', 'cancelled', undefined, text);
    }
  }

  async function complete(r: CompleteRequest) {
    try {
      const params = buildParams(r.model, { effort: r.effort, maxTokens: r.maxTokens, system: r.system }, [{ role: 'user', content: r.prompt }], []);
      delete params.cache_control;
      const res = await c.beta.messages.create(params, { signal: r.signal });
      const text = (res.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      return { text, usage: usageOf(res.model ?? r.model, res.usage), model: res.model ?? r.model };
    } catch (err) {
      if (isExtrasRejection(err) && !lean) { lean = true; return complete(r); }
      throw toEngineError(err);
    }
  }

  async function countTokens(r: Pick<EngineRequest, 'model' | 'system' | 'messages' | 'tools'>) {
    try {
      const res = await c.messages.countTokens({
        model: r.model, system: r.system, messages: r.messages.filter((m) => m.role !== 'system') as any,
        ...(r.tools.length ? { tools: r.tools as any } : {}),
      });
      return res.input_tokens;
    } catch { return null; }
  }

  return { kind: 'api', run, complete, countTokens };
}
