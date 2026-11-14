// Engine abstraction: one interface, three implementations.
//   api      — official Anthropic SDK, streaming Messages API, manual tool loop (engine-api.ts)
//   claudeai — the viewer's own Claude via the artifact `sample` capability (engine-claudeai.ts)
//   mock     — scripted offline engine for demos & self-tests, enabled with ?mock=1 (mock.ts)
//
// The engine runs the full multi-round tool loop and reports everything through hooks, so the
// agent layer (agent.ts) can map it onto chat blocks and alien activity identically for all three.

import type { Effort, MessageUsage, UsageSource } from '../core/types';
import { activeAccount } from '../core/state';
import { signal } from '@preact/signals';

/** Message in Anthropic API shape (role user/assistant/system, content string or blocks). Opaque here. */
export type ApiMsg = { role: 'user' | 'assistant' | 'system'; content: any };

export interface ToolSpec { name: string; description: string; input_schema: Record<string, unknown> }

export interface EngineRequest {
  model: string;
  effort: Effort;
  maxTokens: number;
  /** Frozen system prompt (stable per conversation). */
  system: string;
  /** Full conversation so far INCLUDING the new user turn (and any system note after it). */
  messages: ApiMsg[];
  tools: ToolSpec[];
  webSearch: boolean;
  showThinking: boolean;
  signal?: AbortSignal;
  source: UsageSource;
  isClone?: boolean;
  /** Free-form hint used only by the mock engine to pick a script. */
  hint?: string;
}

export interface ToolRunResult { content: string; isError?: boolean }

export interface EngineHooks {
  /** A thinking block started (delta empty) or streamed summarized text. */
  onThinking(delta: string): void;
  onText(delta: string): void;
  /** A tool call started. `input` may be partial at this point (eager streaming). */
  onToolStart(id: string, name: string, input: unknown, server: boolean): void;
  /** The tool call's input is complete. */
  onToolInput(id: string, input: unknown): void;
  onToolEnd(id: string, ok: boolean, summary: string): void;
  onSearchResults(id: string, results: { title: string; url: string }[]): void;
  /** Execute a client tool. */
  runTool(id: string, name: string, input: unknown): Promise<ToolRunResult>;
  /** One API request finished (called once per loop round). */
  onUsage(model: string, u: MessageUsage): void;
  onNotice(text: string, tone: 'info' | 'warn' | 'good' | 'bad'): void;
}

export interface EngineResult {
  /** Messages appended after the input (assistant turns + tool_result user turns), API shape. */
  transcript: ApiMsg[];
  text: string;
  stopReason: string;
  /** Context size after this turn, when known exactly. */
  contextTokens?: number;
  /** Model that actually answered (fallbacks may differ). */
  servedBy?: string;
}

export interface CompleteRequest { model: string; system?: string; prompt: string; effort: Effort; maxTokens: number; signal?: AbortSignal }

export interface Engine {
  kind: 'api' | 'claudeai' | 'mock';
  run(req: EngineRequest, hooks: EngineHooks): Promise<EngineResult>;
  complete(req: CompleteRequest): Promise<{ text: string; usage: MessageUsage; model: string }>;
  /** Exact input token count for a request, where the engine can measure it. */
  countTokens?(req: Pick<EngineRequest, 'model' | 'system' | 'messages' | 'tools'>): Promise<number | null>;
}

/** Friendly, typed engine error the UI can render. */
export class EngineError extends Error {
  constructor(message: string, public code: 'auth' | 'rate' | 'overloaded' | 'network' | 'refused' | 'bad_request' | 'cancelled' | 'unavailable' | 'fuel' | 'unknown', public retryAfter?: number, public partial?: string) {
    super(message);
  }
}

export const mockMode = typeof location !== 'undefined' && /[?&]mock=1\b/.test(location.search);

/** True once the claude.ai sample capability resolved (artifact mode). */
export const sampleReady = signal<boolean | null>(null);

type Factory = { api: (key: string) => Engine; claudeai: () => Engine; mock: () => Engine };
let factory: Factory | null = null;
export function registerEngines(f: Factory) { factory = f; }

export function getEngine(): Engine | null {
  if (!factory) return null;
  if (mockMode) return factory.mock();
  const acc = activeAccount.value;
  if (!acc) return null;
  if (acc.kind === 'api') return acc.apiKey ? factory.api(acc.apiKey) : null;
  return sampleReady.value ? factory.claudeai() : null;
}

/** Why the current account can't run, or null when it can. */
export function engineBlocker(): string | null {
  if (mockMode) return null;
  const acc = activeAccount.value;
  if (!acc) return 'Link a Claude account to power the lab.';
  if (acc.kind === 'api' && !acc.apiKey) return 'This account has no API key yet.';
  if (acc.kind === 'claudeai') {
    if (sampleReady.value === null) return 'Connecting to your claude.ai account…';
    if (!sampleReady.value) return 'claude.ai access is only available when GLOB LABS runs as a published claude.ai artifact.';
  }
  return null;
}
