// Model catalogue + pricing (Anthropic first-party API list prices, USD per million tokens).
// Cache writes bill at 1.25× input (5-minute TTL); cache reads at the published read price.

import type { Effort } from '../core/types';

export interface ModelInfo {
  id: string;
  name: string;
  short: string;
  blurb: string;
  input: number;      // $/MTok
  output: number;     // $/MTok
  cacheRead: number;  // $/MTok
  /** Server-side refusal fallbacks (`fallbacks: "default"`) are supported. */
  fallbacks: boolean;
  /** Dynamic-filtering web tools (web_search_20260209); else the basic variants. */
  webTools2026: boolean;
  /** claude.ai `sample` model tier this maps to. */
  tier: 'quick' | 'default' | 'complex';
  efforts: Effort[];
}

const ALL: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export const MODELS: ModelInfo[] = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', short: 'Opus 5.5', blurb: 'Default. Smart, steady, great at code.', input: 4, output: 20, cacheRead: 0.2, fallbacks: true, webTools2026: true, tier: 'complex', efforts: ALL },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', short: 'Sonnet 5.5', blurb: 'Fast everyday builder, half the price.', input: 2, output: 10, cacheRead: 0.1, fallbacks: true, webTools2026: true, tier: 'default', efforts: ALL },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', short: 'Haiku 5.5', blurb: 'Tiny and cheap. Side jobs, quick answers.', input: 0.1, output: 0.5, cacheRead: 0.01, fallbacks: false, webTools2026: false, tier: 'quick', efforts: ALL },
  { id: 'claude-fable-5-2', name: 'Claude Fable 5.2', short: 'Fable 5.2', blurb: 'Most capable. Long, hard, agentic work.', input: 8, output: 40, cacheRead: 0.2, fallbacks: true, webTools2026: true, tier: 'complex', efforts: ALL },
];

export const modelInfo = (id: string): ModelInfo => MODELS.find((m) => m.id === id) ?? MODELS[0];

export function costOf(model: string, u: { input: number; output: number; cacheRead: number; cacheWrite: number }): number {
  const m = modelInfo(model);
  return (u.input * m.input + u.output * m.output + u.cacheRead * m.cacheRead + u.cacheWrite * m.input * 1.25) / 1_000_000;
}

export const EFFORT_ORDER: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
export const minEffort = (a: Effort, b: Effort): Effort => (EFFORT_ORDER.indexOf(a) <= EFFORT_ORDER.indexOf(b) ? a : b);

export const EFFORT_LABEL: Record<Effort, string> = { low: 'Low', medium: 'Med', high: 'High', xhigh: 'X-High', max: 'Max' };
