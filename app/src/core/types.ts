// ─────────────────────────────────────────────────────────────────────────────
// GLOB LABS — shared domain types. Every module imports from here.
// Keep this file dependency-free (no three, no preact) so any layer can use it.
// ─────────────────────────────────────────────────────────────────────────────

export type ID = string;

// ── Accounts & engines ───────────────────────────────────────────────────────

/**
 * `api`      — a Claude Console API key (sk-ant-…), calls api.anthropic.com directly.
 *              Exact token usage + cost per call; rate-limit headers when exposed.
 * `claudeai` — the viewer's own claude.ai account, available only when GLOB LABS runs
 *              as a published claude.ai artifact (window.claude.use('sample')).
 *              No usage numbers are returned, so fuel is an estimate (chars/4).
 */
export type EngineKind = 'api' | 'claudeai';

export interface Account {
  id: ID;
  name: string;
  kind: EngineKind;
  /** API key, kept only in this browser. Never sent anywhere but api.anthropic.com. */
  apiKey?: string;
  /** Optional Admin key (sk-ant-admin…) for the org cost report. */
  adminKey?: string;
  color: string;
  createdAt: number;
  budget: FuelBudget;
}

export interface FuelBudget {
  /** usd: dollars of API spend; tokens: total tokens (in+out) — used for claude.ai estimates. */
  mode: 'usd' | 'tokens';
  amount: number;
  period: 'day' | 'week' | 'month';
}

export type UsageSource = 'chat' | 'clone' | 'polish' | 'idea' | 'compact' | 'title' | 'slot';

export interface UsageRecord {
  ts: number;
  accountId: ID;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
  /** true when numbers are estimated (claude.ai engine) rather than reported by the API. */
  estimated: boolean;
  source: UsageSource;
}

export interface RateLimitSnapshot {
  ts: number;
  requestsLimit?: number;
  requestsRemaining?: number;
  tokensLimit?: number;
  tokensRemaining?: number;
  inputTokensLimit?: number;
  inputTokensRemaining?: number;
  outputTokensLimit?: number;
  outputTokensRemaining?: number;
  reset?: string;
}

/** Fuel tiers. Markers at 50 / 25 / 10 percent. */
export type FuelTier = 'full' | 'half' | 'quarter' | 'critical' | 'empty';

export interface FuelReading {
  /** 0..1 of budget remaining (or rate-limit headroom, whichever is lower). */
  level: number;
  tier: FuelTier;
  spentUsd: number;
  spentTokens: number;
  budget: FuelBudget;
  estimated: boolean;
  periodStart: number;
  rate?: RateLimitSnapshot;
  /** Human sentence explaining where the number comes from. */
  source: string;
}

// ── Projects, chats, files, artifacts ────────────────────────────────────────

export type ProjectKind = 'general' | 'game';

export interface Project {
  id: ID;
  accountId: ID;
  name: string;
  /** A short glyph (emoji or 1–2 letters) shown on the project badge. */
  glyph: string;
  color: string;
  kind: ProjectKind;
  description: string;
  /** Custom instructions appended to the system prompt for chats in this project. */
  instructions: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  archived?: boolean;
  /** Linked Idea Lab design doc, if the project grew from one. */
  designDocId?: ID;
  /** Simple kanban of tasks Claude or the user plans. */
  tasks?: ProjectTask[];
}

export interface ProjectTask {
  id: ID;
  title: string;
  status: 'todo' | 'doing' | 'done';
  createdAt: number;
  doneAt?: number;
}

export interface ProjectFile {
  id: ID;
  projectId: ID;
  /** POSIX-ish path inside the project, e.g. "src/player.ts". */
  path: string;
  /** Text content, or base64 when `binary` is true. */
  content: string;
  binary?: boolean;
  mime: string;
  size: number;
  updatedAt: number;
  source: 'user' | 'claude';
  /** Include this file in the project's knowledge (system prompt, cached). */
  knowledge?: boolean;
}

export interface Chat {
  id: ID;
  accountId: ID;
  projectId?: ID;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  messages: ChatMessage[];
  /** Rolling summary produced by compaction; replaces messages[0..compactedUpTo). */
  summary?: string;
  compactedUpTo?: number;
  /** Last measured/estimated context size in tokens. */
  contextTokens?: number;
  pinned?: boolean;
  /** Chat mode: normal workspace chat, or the Idea Lab brainstorm. */
  mode?: 'chat' | 'idea';
}

export interface MessageUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
  estimated: boolean;
}

export interface ChatMessage {
  id: ID;
  role: 'user' | 'assistant';
  createdAt: number;
  blocks: MsgBlock[];
  model?: string;
  usage?: MessageUsage;
  /** Original text if the prompt polisher rewrote it. */
  polishedFrom?: string;
  /**
   * Engine-specific raw transcript needed to replay this turn to the API unchanged
   * (assistant content incl. thinking signatures, tool_result user messages…).
   * Opaque to the UI.
   */
  api?: unknown[];
  error?: string;
  /** true while streaming */
  pending?: boolean;
}

export type MsgBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool'; id: string; name: string; kind: ActivityKind; label: string; input?: unknown; result?: string; isError?: boolean; done?: boolean }
  | { type: 'attachment'; name: string; mime: string; size: number; fileId?: ID; dataUrl?: string; text?: string }
  | { type: 'artifact'; artifactId: ID; title: string }
  | { type: 'question'; id: string; question: string; options?: string[]; answer?: string }
  | { type: 'clone'; agentId: string; task: string; status: 'working' | 'done' | 'failed'; result?: string }
  | { type: 'notice'; text: string; tone: 'info' | 'warn' | 'good' | 'bad' }
  | { type: 'search'; query: string; results: { title: string; url: string }[] };

export type ArtifactKind = 'html' | 'svg' | 'markdown' | 'code' | 'mermaid' | 'react';

export interface Artifact {
  id: ID;
  accountId: ID;
  chatId?: ID;
  projectId?: ID;
  title: string;
  kind: ArtifactKind;
  language?: string;
  content: string;
  versions: { content: string; ts: number }[];
  createdAt: number;
  updatedAt: number;
}

// ── Idea Lab ─────────────────────────────────────────────────────────────────

export interface DesignDoc {
  id: ID;
  accountId: ID;
  title: string;
  pitch: string;
  genre: string;
  platform: string;
  audience: string;
  pillars: string[];
  coreLoop: string;
  mechanics: { name: string; detail: string }[];
  progression: string;
  controls: string;
  visuals: string;
  audio: string;
  narrative: string;
  scope: string;
  tech: string;
  /** Every concrete thing the user asked for, verbatim-ish — the final prompt must include all of them. */
  requirements: string[];
  /** Things the alien still needs answered before the prompt is ready. */
  openQuestions: string[];
  /** 0..100 — how complete the design is, maintained by the model + heuristics. */
  completeness: number;
  /** The last generated build prompt. */
  finalPrompt?: string;
  chatId?: ID;
  createdAt: number;
  updatedAt: number;
}

// ── Economy, customization, HQ ───────────────────────────────────────────────

export type ItemCategory =
  | 'furniture' | 'decor' | 'plant' | 'equipment' | 'arcade' | 'lighting'
  | 'hat' | 'outfit' | 'accessory' | 'skin' | 'expression' | 'wall';

export interface CatalogItem {
  id: string;
  name: string;
  category: ItemCategory;
  price: number;
  blurb: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  /** World model key (src/world/models) for placeables, or cosmetic key for alien wear. */
  model?: string;
  /** Placeable in the HQ? */
  placeable?: boolean;
  /** Unlocks: achievement id or minimum lifetime genes. */
  unlock?: { achievement?: string; lifetime?: number };
}

export interface Placement {
  uid: ID;
  itemId: string;
  /** Grid cell in the lab floor (integer units). */
  x: number;
  z: number;
  /** Rotation in quarter turns 0..3 */
  rot: number;
}

export type Expression =
  | 'happy' | 'derp' | 'sleepy' | 'wink' | 'shocked' | 'cry' | 'tongue' | 'focused' | 'love' | 'grumpy';

export interface AlienLook {
  id: ID;
  name: string;
  /** 'glob' = classic jelly alien, 'pounce' = snow leopard kitten skin, others from catalog. */
  skin: string;
  body: string;   // hex
  belly: string;  // hex
  eyes: string;   // hex — iris tint (pupils stay big & black)
  bulbA: string;  // antenna bulb left
  bulbB: string;  // antenna bulb right
  hat?: string;
  outfit?: string;
  accessory?: string;
  expression: Expression;
  /** Personality flavour for idle animations. */
  quirk: 'bouncy' | 'sleepy' | 'nerdy' | 'chaotic' | 'shy';
}

export interface GeneLedgerEntry { ts: number; amount: number; reason: string }

export interface EconomyState {
  balance: number;
  lifetime: number;
  ledger: GeneLedgerEntry[];
  owned: Record<string, number>;
  placements: Placement[];
  achievements: Record<string, number>; // id -> unlocked ts
  stats: Record<string, number>;        // counters: messages, files, artifacts, ideas, spins...
  lastDaily?: string;                   // yyyy-mm-dd of last daily bonus
  streak?: number;
}

// ── Settings ─────────────────────────────────────────────────────────────────

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type CavemanLevel = 'off' | 'lite' | 'full' | 'ultra';
export type PolishMode = 'off' | 'suggest' | 'auto';

export interface Settings {
  volume: number;          // 0..1 master sfx volume
  muted: boolean;
  quality: 'low' | 'medium' | 'high';
  reduceMotion: boolean;
  model: string;
  effort: Effort;
  /** Auto-saver: drop effort / clones / verbosity as fuel tiers fall. */
  autoSaver: boolean;
  caveman: CavemanLevel;
  polish: PolishMode;
  webSearch: boolean;
  codeExecution: boolean;
  /** Max parallel alien clones (sub-agents) at full fuel. */
  maxClones: number;
  /** Compact chat context once it passes this many tokens. */
  compactAt: number;
  showThinking: boolean;
  /** Enter sends (else Ctrl/Cmd+Enter). */
  enterToSend: boolean;
  onboarded: boolean;
}

// ── Live activity (Claude → aliens) ──────────────────────────────────────────

/** What a worker alien is visibly doing. */
export type ActivityKind =
  | 'idle' | 'thinking' | 'writing' | 'coding' | 'research' | 'files'
  | 'bugfix' | 'building' | 'planning' | 'question' | 'cloning' | 'celebrating' | 'sleeping';

export interface CrewMember {
  id: string;
  name: string;
  role: 'main' | 'clone' | 'staff';
  activity: ActivityKind;
  /** Short caption: "Writing src/player.ts", "Searching: voxel shaders"… */
  label: string;
  since: number;
  runId?: string;
  /** Which AlienLook to wear (staff use their own; clones copy the main). */
  lookId?: ID;
}

export type PanelId =
  | 'terminal' | 'idea' | 'shop' | 'wardrobe' | 'fuel' | 'slot' | 'arcade'
  | 'settings' | 'accounts' | 'achievements' | 'files' | 'artifact';
