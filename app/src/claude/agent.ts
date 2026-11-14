// The agent: runs one conversation turn end-to-end and narrates it to the lab.
//
// runTurn():  user message → (compaction if needed) → engine tool loop → assistant message,
//             emitting bus events the crew director turns into alien activity:
//               turn:start / turn:thinking / turn:writing / tool:start / tool:end /
//               clone:spawn / clone:update / clone:done / question:* / turn:end
// complete(): cheap one-shot side jobs (polish, titles, compaction, slot ideas).

import type { ActivityKind, Chat, ChatMessage, Effort, MessageUsage, MsgBlock, UsageSource } from '../core/types';
import { bus } from '../core/bus';
import { activeAccountId, filesByProject, loadFiles, projects, recordUsage, saveChat, settings, SIDE_MODEL } from '../core/state';
import { estimateTokens, fmtTokens, uid } from '../core/util';
import { EngineError, engineBlocker, getEngine, mockMode, type ApiMsg, type EngineHooks } from './engine';
import { fullPolicy } from './fuel';
import { BASE_SYSTEM, CAVEMAN_MARK, CLONE_SYSTEM, COMPACT_SYSTEM, TITLE_SYSTEM, cavemanNote, projectSystem } from './prompts';
import { runTool, toolMeta, toolSpecs, type ToolCtx } from './tools';

export interface ExtraTool { name: string; description: string; input_schema: Record<string, unknown>; kind: ActivityKind; label: (input: any) => string; run: (input: any) => Promise<string> }
export interface TurnOptions { chat: Chat; userText: string; attachments?: MsgBlock[]; agentId?: string; systemExtra?: string; extraTools?: ExtraTool[]; disableFileTools?: boolean; onUpdate?: (msg: ChatMessage) => void; signal?: AbortSignal; source?: UsageSource }

export function engineAvailable(): boolean { return engineBlocker() === null && !!getEngine(); }

const KEEP_RECENT = 4; // messages (≈2 exchanges) kept verbatim when compacting

// ── helpers ──────────────────────────────────────────────────────────────────
function record(model: string, u: MessageUsage, source: UsageSource) {
  const acc = activeAccountId.value;
  if (!acc) return;
  recordUsage({ ts: Date.now(), accountId: acc, model, input: u.input, output: u.output, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite, costUsd: u.costUsd, estimated: u.estimated, source });
}

const addUsage = (a: MessageUsage | undefined, b: MessageUsage): MessageUsage => a
  ? { input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite, costUsd: a.costUsd + b.costUsd, estimated: a.estimated || b.estimated }
  : { ...b };

function dataUrlParts(url: string): { mime: string; data: string } | null {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(url);
  return m ? { mime: m[1], data: m[2] } : null;
}

/** API content blocks for a user turn (attachments first, then text). */
function userContent(text: string, atts: MsgBlock[] = []): any[] {
  const out: any[] = [];
  for (const a of atts) {
    if (a.type !== 'attachment') continue;
    const p = a.dataUrl ? dataUrlParts(a.dataUrl) : null;
    if (p && p.mime.startsWith('image/')) out.push({ type: 'image', source: { type: 'base64', media_type: p.mime, data: p.data } });
    else if (p && p.mime === 'application/pdf') out.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.data }, title: a.name });
    else if (a.text !== undefined) out.push({ type: 'text', text: `<attached_file name="${a.name}">\n${a.text}\n</attached_file>` });
  }
  out.push({ type: 'text', text: text || '(see attachments)' });
  return out;
}

function msgText(m: ChatMessage): string {
  return m.blocks.map((b) => {
    if (b.type === 'text') return b.text;
    if (b.type === 'tool') return `[${b.label}${b.isError ? ' — failed' : ''}]`;
    if (b.type === 'attachment') return `[attached ${b.name}]`;
    if (b.type === 'artifact') return `[artifact “${b.title}” id=${b.artifactId}]`;
    if (b.type === 'question') return `[asked: ${b.question} → ${b.answer ?? 'no answer'}]`;
    if (b.type === 'clone') return `[clone “${b.task}”: ${(b.result ?? '').slice(0, 400)}]`;
    return '';
  }).filter(Boolean).join('\n');
}

/** Build the API transcript: optional compaction summary, then each message's stored api turns. */
function history(chat: Chat): ApiMsg[] {
  const out: ApiMsg[] = [];
  const start = chat.compactedUpTo ?? 0;
  if (chat.summary) {
    out.push({ role: 'user', content: [{ type: 'text', text: `<conversation_summary>\nEarlier parts of this conversation were compacted to save tokens:\n${chat.summary}\n</conversation_summary>` }] });
    out.push({ role: 'assistant', content: [{ type: 'text', text: 'Got it — continuing from that summary.' }] });
  }
  for (const m of chat.messages.slice(start)) {
    if (m.pending) continue;
    if (Array.isArray(m.api) && m.api.length) out.push(...(m.api as ApiMsg[]));
    else if (m.role === 'user') out.push({ role: 'user', content: [{ type: 'text', text: msgText(m) || '…' }] });
    else { const t = msgText(m); if (t) out.push({ role: 'assistant', content: [{ type: 'text', text: t }] }); }
  }
  return out;
}

function lastCaveman(chat: Chat): string | null {
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    const api = chat.messages[i].api as ApiMsg[] | undefined;
    if (!api) continue;
    for (let j = api.length - 1; j >= 0; j--) {
      const m = api[j];
      if (m.role === 'system' && typeof m.content === 'string' && m.content.startsWith(CAVEMAN_MARK)) return m.content.slice(CAVEMAN_MARK.length).split(']]')[0];
    }
  }
  return null;
}

async function systemFor(chat: Chat, extra?: string): Promise<string> {
  const project = projects.value.find((p) => p.id === chat.projectId);
  let knowledge = project ? (filesByProject.value[project.id] ?? await loadFiles(project.id)).filter((f) => f.knowledge) : [];
  knowledge = knowledge.slice().sort((a, b) => a.path.localeCompare(b.path));
  return BASE_SYSTEM + projectSystem(project, knowledge) + (extra ? `\n\n${extra}` : '');
}

// ── compaction ───────────────────────────────────────────────────────────────
/**
 * Summarize older messages into chat.summary with the cheap side model. Retained messages
 * have their thinking blocks removed: the conversation prefix changes here, so those blocks
 * would no longer verify (preserved-thinking rule). Removing all of them is allowed; new
 * turns produce fresh blocks bound to the new prefix.
 */
export async function compactChat(chat: Chat, signal?: AbortSignal): Promise<{ before: number; after: number } | null> {
  const eng = getEngine();
  if (!eng) return null;
  const done = chat.messages.filter((m) => !m.pending);
  const cut = Math.max(chat.compactedUpTo ?? 0, done.length - KEEP_RECENT);
  if (cut <= (chat.compactedUpTo ?? 0)) return null;
  // never split a user message from its reply
  let end = cut;
  while (end > 0 && chat.messages[end]?.role === 'assistant') end--;
  if (end <= (chat.compactedUpTo ?? 0)) return null;
  const slice = chat.messages.slice(chat.compactedUpTo ?? 0, end);
  const transcript = slice.map((m) => `### ${m.role.toUpperCase()}\n${msgText(m).slice(0, 6000)}`).join('\n\n');
  const before = chat.contextTokens ?? estimateTokens(JSON.stringify(history(chat)));
  const prompt = `${chat.summary ? `<previous_summary>\n${chat.summary}\n</previous_summary>\n\n` : ''}<transcript>\n${transcript}\n</transcript>\n\nWrite the updated summary (max ~700 words).`;
  const r = await eng.complete({ model: SIDE_MODEL, system: COMPACT_SYSTEM, prompt, effort: 'low', maxTokens: 2500, signal });
  record(r.model, r.usage, 'compact');
  if (!r.text) return null;
  chat.summary = r.text;
  chat.compactedUpTo = end;
  for (const m of chat.messages.slice(end)) {
    if (!Array.isArray(m.api)) continue;
    m.api = (m.api as ApiMsg[]).map((x) => Array.isArray(x.content) && x.role === 'assistant'
      ? { ...x, content: x.content.filter((b: any) => b.type !== 'thinking' && b.type !== 'redacted_thinking') }
      : x).filter((x) => !(x.role === 'assistant' && Array.isArray(x.content) && x.content.length === 0));
  }
  const after = estimateTokens(JSON.stringify(history(chat)));
  chat.contextTokens = after;
  saveChat(chat, true);
  bus.emit('compact:done', { chatId: chat.id, before, after });
  return { before, after };
}

// ── the turn ─────────────────────────────────────────────────────────────────
export async function runTurn(opts: TurnOptions): Promise<ChatMessage> {
  const { chat } = opts;
  const eng = getEngine();
  const blocker = engineBlocker();
  if (!eng || blocker) throw new EngineError(blocker ?? 'No Claude engine available.', 'unavailable');

  const pol = fullPolicy();
  if (pol.blocked) throw new EngineError('The fuel tank is empty for this budget period. Raise the budget in the Fuel panel, wait for the period to reset, or override once.', 'fuel');

  const runId = uid('run_');
  const source = opts.source ?? (chat.mode === 'idea' ? 'idea' : 'chat');

  // user message (+ caveman change as an appended system note: keeps the cached prefix intact)
  const content = userContent(opts.userText, opts.attachments);
  const userApi: ApiMsg[] = [{ role: 'user', content }];
  const wantCave = pol.caveman;
  const haveCave = lastCaveman(chat) ?? 'off';
  if (wantCave !== haveCave) userApi.push({ role: 'system', content: cavemanNote(wantCave) });
  const userMsg: ChatMessage = { id: uid('msg_'), role: 'user', createdAt: Date.now(), blocks: [{ type: 'text', text: opts.userText }, ...(opts.attachments ?? [])], api: userApi };

  const msg: ChatMessage = { id: uid('msg_'), role: 'assistant', createdAt: Date.now(), blocks: [], model: chat.model, pending: true };
  chat.messages.push(userMsg, msg);
  if (chat.title === 'New experiment' && opts.userText) chat.title = localTitle(opts.userText);
  saveChat(chat);

  let raf = 0;
  const touch = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; opts.onUpdate?.(msg); }); };
  touch();
  bus.emit('turn:start', { runId, chatId: chat.id, projectId: chat.projectId, prompt: opts.userText, agentId: opts.agentId });

  // compaction before sending, if the context is over the threshold
  const projected = (chat.contextTokens ?? 0) + estimateTokens(opts.userText);
  if (projected > pol.compactAt && (chat.messages.length - (chat.compactedUpTo ?? 0)) > KEEP_RECENT + 2) {
    const cid = uid('tu_');
    msg.blocks.push({ type: 'tool', id: cid, name: 'compact', kind: 'files', label: 'Compacting old context', done: false });
    bus.emit('tool:start', { runId, toolId: cid, tool: 'compact', kind: 'files', label: 'Compacting old context', agentId: opts.agentId });
    touch();
    try {
      // the new user turn must not be summarized: compact everything before it
      const r = await compactWithout(chat, [userMsg, msg], opts.signal);
      const b = msg.blocks.find((x) => x.type === 'tool' && x.id === cid) as any;
      b.done = true; b.result = r ? `Context ${fmtTokens(r.before)} → ${fmtTokens(r.after)} tokens` : 'Nothing to compact';
      b.label = r ? `Compacted ${fmtTokens(r.before)} → ${fmtTokens(r.after)} tokens` : 'Context is already lean';
      bus.emit('tool:end', { runId, toolId: cid, ok: true, agentId: opts.agentId });
    } catch (err: any) {
      const b = msg.blocks.find((x) => x.type === 'tool' && x.id === cid) as any;
      b.done = true; b.isError = true; b.result = String(err?.message ?? err);
      bus.emit('tool:end', { runId, toolId: cid, ok: false, agentId: opts.agentId });
    }
    touch();
  }

  const ctx: ToolCtx = {
    chat, msg, runId, agentId: opts.agentId, signal: opts.signal, prompt: opts.userText, touch,
    maxClones: pol.maxClones, extra: opts.extraTools ?? [], fileTools: !opts.disableFileTools,
    spawn: (tasks) => runClones(ctx, tasks, pol.maxClones, pol.effort),
  };
  const hooks = makeHooks(ctx, msg, { runId, agentId: opts.agentId, source, touch, extra: opts.extraTools ?? [], prompt: opts.userText });

  try {
    const system = await systemFor(chat, opts.systemExtra);
    // history() already contains userMsg.api (it is in chat.messages and not pending)
    const messages = history(chat);
    const res = await eng.run({
      model: chat.model, effort: pol.effort, maxTokens: 32000, system, messages,
      tools: toolSpecs(ctx), webSearch: settings.value.webSearch,
      showThinking: settings.value.showThinking, signal: opts.signal, source, hint: opts.userText,
    }, hooks);
    msg.api = res.transcript;
    if (res.servedBy && res.servedBy !== chat.model) msg.blocks.push({ type: 'notice', text: `Answered by ${res.servedBy} (server-side fallback).`, tone: 'info' });
    if (res.contextTokens) chat.contextTokens = res.contextTokens;
    else chat.contextTokens = estimateTokens(JSON.stringify(history(chat)));
    finishBlocks(msg);
    msg.pending = false;
    saveChat(chat, true);
    opts.onUpdate?.(msg);
    bus.emit('turn:end', { runId, ok: true, usage: msg.usage, agentId: opts.agentId });
    if (chat.messages.filter((m) => m.role === 'assistant').length === 1) void autoTitle(chat, opts.userText);
    return msg;
  } catch (err: any) {
    const e = err instanceof EngineError ? err : new EngineError(String(err?.message ?? err), 'unknown');
    finishBlocks(msg, true);
    if (e.partial && !msg.blocks.some((b) => b.type === 'text')) msg.blocks.push({ type: 'text', text: e.partial });
    const partialText = msg.blocks.filter((b) => b.type === 'text').map((b: any) => b.text).join('');
    msg.api = partialText ? [{ role: 'assistant', content: [{ type: 'text', text: partialText }] }] : [];
    if (e.code !== 'cancelled') { msg.error = e.message; msg.blocks.push({ type: 'notice', text: e.message, tone: 'bad' }); }
    else msg.blocks.push({ type: 'notice', text: 'Stopped by you.', tone: 'info' });
    msg.pending = false;
    saveChat(chat, true);
    opts.onUpdate?.(msg);
    bus.emit('turn:end', { runId, ok: e.code === 'cancelled', error: e.message, usage: msg.usage, agentId: opts.agentId });
    if (e.code === 'cancelled') return msg;
    throw e;
  }
}

/** Compact while temporarily hiding the in-flight messages. */
async function compactWithout(chat: Chat, hide: ChatMessage[], signal?: AbortSignal) {
  const idx = chat.messages.indexOf(hide[0]);
  const tail = idx >= 0 ? chat.messages.splice(idx) : [];
  try { return await compactChat(chat, signal); } finally { chat.messages.push(...tail); }
}

function finishBlocks(msg: ChatMessage, failed = false) {
  for (const b of msg.blocks) {
    if (b.type === 'tool' && !b.done) { b.done = true; if (failed) b.isError = true; }
    if (b.type === 'clone' && b.status === 'working') b.status = failed ? 'failed' : 'done';
  }
}

function makeHooks(ctx: ToolCtx, msg: ChatMessage, o: { runId: string; agentId?: string; cloneOf?: string; source: UsageSource; touch: () => void; extra: ExtraTool[]; prompt: string }): EngineHooks {
  let lastWrite = 0, chars = 0, thinkingAnnounced = false;
  const toolIds = new Set<string>();
  const block = (id: string) => msg.blocks.find((b) => b.type === 'tool' && b.id === id) as Extract<MsgBlock, { type: 'tool' }> | undefined;
  return {
    onThinking(delta) {
      if (!thinkingAnnounced) { thinkingAnnounced = true; bus.emit('turn:thinking', { runId: o.runId, agentId: o.agentId }); }
      const last = msg.blocks[msg.blocks.length - 1];
      if (last?.type === 'thinking') last.text += delta;
      else msg.blocks.push({ type: 'thinking', text: delta });
      o.touch();
    },
    onText(delta) {
      thinkingAnnounced = false;
      chars += delta.length;
      const last = msg.blocks[msg.blocks.length - 1];
      if (last?.type === 'text') last.text += delta; else msg.blocks.push({ type: 'text', text: delta });
      const now = performance.now();
      if (now - lastWrite > 450) { lastWrite = now; bus.emit('turn:writing', { runId: o.runId, agentId: o.agentId, chars }); }
      o.touch();
    },
    onToolStart(id, name, input, server) {
      if (toolIds.has(id)) return;
      toolIds.add(id);
      thinkingAnnounced = false;
      const meta = toolMeta(name, input, o.prompt, o.extra);
      if (name !== 'ask_user' && name !== 'spawn_clones') msg.blocks.push({ type: 'tool', id, name, kind: meta.kind, label: meta.label, input: server ? input : undefined, done: false });
      bus.emit('tool:start', { runId: o.runId, toolId: id, tool: name, kind: meta.kind, label: meta.label, agentId: o.agentId });
      if (o.agentId?.startsWith('clone-')) bus.emit('clone:update', { runId: o.runId, agentId: o.agentId, kind: meta.kind, label: meta.label });
      o.touch();
    },
    onToolInput(id, input) {
      const b = block(id);
      if (!b) return;
      const meta = toolMeta(b.name, input, o.prompt, o.extra);
      if (meta.label !== b.label) {
        b.label = meta.label; b.kind = meta.kind;
        bus.emit('tool:start', { runId: o.runId, toolId: id, tool: b.name, kind: meta.kind, label: meta.label, agentId: o.agentId });
        o.touch();
      }
    },
    onToolEnd(id, ok, summary) {
      const b = block(id);
      if (b && !b.done) { b.done = true; b.isError = !ok; b.result = summary; }
      bus.emit('tool:end', { runId: o.runId, toolId: id, ok, agentId: o.agentId });
      o.touch();
    },
    onSearchResults(id, results) {
      const b = block(id);
      const query = (b?.input as any)?.query ?? b?.label.replace(/^Searching: /, '') ?? 'web';
      msg.blocks.push({ type: 'search', query, results });
      o.touch();
    },
    runTool: (id, name, input) => runTool(ctx, name, input),
    onUsage(model, u) {
      msg.usage = addUsage(msg.usage, u);
      record(model, u, o.source);
      o.touch();
    },
    onNotice(text, tone) { msg.blocks.push({ type: 'notice', text, tone }); o.touch(); },
  };
}

// ── clones ───────────────────────────────────────────────────────────────────
async function runClones(lead: ToolCtx, tasks: { title: string; instructions: string }[], max: number, effort: Effort): Promise<string> {
  const maybe = getEngine();
  if (!maybe) return 'Clone vat offline: no engine.';
  const eng = maybe;
  const limit = Math.max(1, max);
  const reports: string[] = new Array(tasks.length);
  const fileList = lead.chat.projectId ? (await loadFiles(lead.chat.projectId)).map((f) => f.path).join('\n') : '';
  let next = 0;
  // clones always run at low effort: fewer, consolidated tool calls, terse reports
  const cloneEffort: Effort = 'low';
  void effort;

  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      const t = tasks[i];
      const agentId = uid('clone-');
      const block: MsgBlock = { type: 'clone', agentId, task: t.title, status: 'working' };
      lead.msg.blocks.push(block);
      lead.touch();
      bus.emit('clone:spawn', { runId: lead.runId, agentId, task: t.title });
      const cmsg: ChatMessage = { id: uid('msg_'), role: 'assistant', createdAt: Date.now(), blocks: [], model: lead.chat.model };
      const cctx: ToolCtx = { ...lead, msg: cmsg, agentId, isClone: true, spawn: undefined, extra: [], fileTools: true, maxClones: 0, touch: () => {} };
      const hooks = makeHooks(cctx, cmsg, { runId: lead.runId, agentId, source: 'clone', touch: () => {}, extra: [], prompt: t.instructions });
      try {
        const res = await eng.run({
          model: lead.chat.model, effort: cloneEffort, maxTokens: 16000,
          system: CLONE_SYSTEM + (lead.chat.projectId ? `\n\nProject files:\n${fileList || '(none yet)'}` : ''),
          messages: [{ role: 'user', content: [{ type: 'text', text: `Sub-task: ${t.title}\n\n${t.instructions}` }] }],
          tools: toolSpecs(cctx), webSearch: false, showThinking: false, signal: lead.signal, source: 'clone', isClone: true, hint: t.title,
        }, hooks);
        // the lead's usage chip includes its clones
        const used = cmsg.usage;
        if (used) lead.msg.usage = addUsage(lead.msg.usage, used);
        (block as any).status = 'done';
        (block as any).result = res.text.trim() || 'Done.';
        reports[i] = `## Clone ${i + 1}: ${t.title}\n${(res.text.trim() || 'Done (no report).').slice(0, 6000)}`;
        bus.emit('clone:done', { runId: lead.runId, agentId, ok: true });
      } catch (err: any) {
        (block as any).status = 'failed';
        (block as any).result = String(err?.message ?? err);
        reports[i] = `## Clone ${i + 1}: ${t.title}\nFAILED: ${err?.message ?? err}`;
        bus.emit('clone:done', { runId: lead.runId, agentId, ok: false });
      }
      lead.touch();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  const capped = tasks.length > limit ? `\n\n(Fuel policy allowed ${limit} clone${limit === 1 ? '' : 's'} at a time; they worked through all ${tasks.length} tasks in waves.)` : '';
  return reports.join('\n\n') + capped;
}

// ── side jobs ────────────────────────────────────────────────────────────────
export async function complete(opts: { prompt: string; system?: string; model?: string; effort?: Effort; maxTokens?: number; source: UsageSource; signal?: AbortSignal }): Promise<string> {
  const eng = getEngine();
  if (!eng) throw new EngineError(engineBlocker() ?? 'No Claude engine available.', 'unavailable');
  const r = await eng.complete({ model: opts.model ?? SIDE_MODEL, system: opts.system, prompt: opts.prompt, effort: opts.effort ?? 'low', maxTokens: opts.maxTokens ?? 4000, signal: opts.signal });
  record(r.model, r.usage, opts.source);
  return r.text;
}

function localTitle(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim().replace(/^(please|hey|hi|can you|could you|i want you to|i need you to|make|build|create)\s+/i, '');
  const words = t.split(' ').slice(0, 7).join(' ');
  return (words.charAt(0).toUpperCase() + words.slice(1)).replace(/[.,;:!?]+$/, '') || 'New experiment';
}

async function autoTitle(chat: Chat, firstPrompt: string) {
  const eng = getEngine();
  // claude.ai usage is the viewer's plan: keep the free local title there
  if (!eng || eng.kind !== 'api' || mockMode) return;
  try {
    const t = await complete({ prompt: firstPrompt.slice(0, 1500), system: TITLE_SYSTEM, maxTokens: 30, source: 'title' });
    const clean = t.replace(/^["'#\s]+|["'.\s]+$/g, '').slice(0, 60);
    if (clean) { chat.title = clean; saveChat(chat); }
  } catch { /* keep local title */ }
}

/** Projected context size for the composer meter. */
export function contextEstimate(chat: Chat | null): number {
  if (!chat) return 0;
  return chat.contextTokens ?? estimateTokens(JSON.stringify(history(chat)));
}
