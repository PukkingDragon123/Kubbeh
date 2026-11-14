// App state — Preact signals + persistence. The single source of truth every layer reads.
//
// Accounts are separate worlds: each has its own projects, chats, files, artifacts,
// idea docs and usage ledger (keys are prefixed "acct:<id>:"). The lab itself — Gene
// Points, furniture, alien looks, settings — is shared across accounts.

import { signal, computed, effect, batch } from '@preact/signals';
import type {
  Account, AlienLook, Artifact, Chat, CrewMember, DesignDoc, EconomyState, FuelReading,
  PanelId, Project, ProjectFile, RateLimitSnapshot, Settings, UsageRecord,
} from './types';
import { store, saveSoon } from './storage';
import { uid } from './util';
import { isArtifact } from './env';

// ── defaults ─────────────────────────────────────────────────────────────────
export const DEFAULT_MODEL = 'claude-opus-5-5';
/** Cheap model for side jobs: prompt polish, titles, compaction summaries, slot ideas. */
export const SIDE_MODEL = 'claude-haiku-5-5';

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.6,
  muted: false,
  quality: 'high',
  reduceMotion: false,
  model: DEFAULT_MODEL,
  effort: 'high',
  autoSaver: true,
  caveman: 'off',
  polish: 'suggest',
  webSearch: true,
  codeExecution: false,
  maxClones: 3,
  compactAt: 120_000,
  showThinking: false,
  enterToSend: true,
  onboarded: false,
};

export const DEFAULT_LOOKS: AlienLook[] = [
  { id: 'glorp', name: 'Prof. Glorp', skin: 'glob', body: '#7be35f', belly: '#b6f59a', eyes: '#1b2a8f', bulbA: '#ff7ad9', bulbB: '#3b5bff', hat: 'goggles', outfit: 'labcoat', expression: 'happy', quirk: 'nerdy' },
  { id: 'blip', name: 'Blip', skin: 'glob', body: '#6fe0a0', belly: '#c4ffe0', eyes: '#173a9e', bulbA: '#ffe14d', bulbB: '#ff7ad9', hat: 'hardhat', expression: 'focused', quirk: 'bouncy' },
  { id: 'mossy', name: 'Mossy', skin: 'glob', body: '#9be255', belly: '#dbff9e', eyes: '#3a1b8f', bulbA: '#59f0ff', bulbB: '#59f0ff', accessory: 'headphones', expression: 'sleepy', quirk: 'sleepy' },
  { id: 'zib', name: 'Zib', skin: 'glob', body: '#5fd36b', belly: '#a8f0b0', eyes: '#0f4fa8', bulbA: '#ff5e5e', bulbB: '#ffa24d', accessory: 'bowtie', expression: 'derp', quirk: 'chaotic' },
  { id: 'pounce', name: 'Pounce', skin: 'pounce', body: '#e9edf0', belly: '#ffffff', eyes: '#111111', bulbA: '#c9d3da', bulbB: '#c9d3da', expression: 'love', quirk: 'shy' },
];

export const DEFAULT_ECONOMY: EconomyState = {
  balance: 150, lifetime: 150, ledger: [{ ts: Date.now(), amount: 150, reason: 'Welcome to GLOB LABS' }],
  owned: {}, placements: [], achievements: {}, stats: {}, streak: 0,
};

const ACCOUNT_COLORS = ['#7be35f', '#ff7ad9', '#59f0ff', '#ffb43f', '#b48cff', '#ff6b6b'];

// ── signals ──────────────────────────────────────────────────────────────────
export const ready = signal(false);
export const storageKind = signal<'idb' | 'claude-db' | 'memory'>('memory');

export const settings = signal<Settings>({ ...DEFAULT_SETTINGS });
export const accounts = signal<Account[]>([]);
export const activeAccountId = signal<string | null>(null);
export const activeAccount = computed(() => accounts.value.find((a) => a.id === activeAccountId.value) ?? null);

/** Lightweight index of chats (full message lists load on demand). */
export interface ChatMeta { id: string; title: string; projectId?: string; updatedAt: number; pinned?: boolean; mode?: 'chat' | 'idea' }

export const projects = signal<Project[]>([]);
export const chatIndex = signal<ChatMeta[]>([]);
export const artifacts = signal<Artifact[]>([]);
export const designDocs = signal<DesignDoc[]>([]);
export const usageLog = signal<UsageRecord[]>([]);
export const rateLimit = signal<RateLimitSnapshot | null>(null);
/** projectId -> files (loaded lazily) */
export const filesByProject = signal<Record<string, ProjectFile[]>>({});

export const economy = signal<EconomyState>(structuredClone(DEFAULT_ECONOMY));
export const looks = signal<AlienLook[]>(structuredClone(DEFAULT_LOOKS));

/** Live fuel reading — computed and written by src/claude/fuel.ts. */
export const fuel = signal<FuelReading>({
  level: 1, tier: 'full', spentUsd: 0, spentTokens: 0, estimated: true, periodStart: Date.now(),
  budget: { mode: 'usd', amount: 20, period: 'month' }, source: 'No usage yet',
});

/** Live crew (aliens) status — written by src/core/crew.ts from bus activity. */
export const crew = signal<CrewMember[]>([]);

// UI routing
export const openPanelId = signal<PanelId | null>(null);
export const panelArg = signal<unknown>(null);
export const activeChatId = signal<string | null>(null);
export const activeProjectId = signal<string | null>(null);
/** Edit mode for HQ furniture placement. */
export const editMode = signal(false);
/** Item id being placed in edit mode. */
export const placingItem = signal<string | null>(null);

// ── keys ─────────────────────────────────────────────────────────────────────
const K = {
  settings: 'settings',
  accounts: 'accounts',
  active: 'activeAccount',
  economy: 'economy',
  looks: 'looks',
  projects: (a: string) => `acct:${a}:projects`,
  chats: (a: string) => `acct:${a}:chats`,
  chat: (a: string, c: string) => `acct:${a}:chat:${c}`,
  files: (a: string, p: string) => `acct:${a}:files:${p}`,
  artifacts: (a: string) => `acct:${a}:artifacts`,
  ideas: (a: string) => `acct:${a}:ideas`,
  usage: (a: string) => `acct:${a}:usage`,
};
export const KEYS = K;

// ── boot / load ──────────────────────────────────────────────────────────────
export async function loadState() {
  const kv = await store();
  storageKind.value = kv.kind;
  const [s, accs, act, eco, lk] = await Promise.all([
    kv.get<Settings>(K.settings), kv.get<Account[]>(K.accounts), kv.get<string>(K.active),
    kv.get<EconomyState>(K.economy), kv.get<AlienLook[]>(K.looks),
  ]);
  batch(() => {
    settings.value = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
    accounts.value = accs ?? [];
    economy.value = { ...structuredClone(DEFAULT_ECONOMY), ...(eco ?? {}) };
    if (lk?.length) {
      // keep user edits, add any new default crew members shipped later
      const ids = new Set(lk.map((l) => l.id));
      looks.value = [...lk, ...DEFAULT_LOOKS.filter((d) => !ids.has(d.id))];
    }
  });

  // In claude.ai we always offer the viewer's own account as an engine.
  if (isArtifact() && !accounts.value.some((a) => a.kind === 'claudeai')) {
    accounts.value = [makeAccount('My Claude', 'claudeai'), ...accounts.value];
  }
  const chosen = accounts.value.find((a) => a.id === act) ?? accounts.value[0] ?? null;
  if (chosen) await switchAccount(chosen.id);

  // persistence effects
  effect(() => { const v = settings.value; if (ready.value) saveSoon(K.settings, () => v); });
  effect(() => { const v = accounts.value; if (ready.value) saveSoon(K.accounts, () => v); });
  effect(() => { const v = economy.value; if (ready.value) saveSoon(K.economy, () => v); });
  effect(() => { const v = looks.value; if (ready.value) saveSoon(K.looks, () => v); });
  effect(() => {
    const a = activeAccountId.value; if (!a || !ready.value) return;
    const p = projects.value, c = chatIndex.value, ar = artifacts.value, d = designDocs.value, u = usageLog.value;
    saveSoon(K.projects(a), () => p); saveSoon(K.chats(a), () => c); saveSoon(K.artifacts(a), () => ar);
    saveSoon(K.ideas(a), () => d); saveSoon(K.usage(a), () => u, 1500);
  });
  ready.value = true;
}

export function makeAccount(name: string, kind: Account['kind'], apiKey?: string): Account {
  return {
    id: uid('acct_'), name, kind, apiKey, createdAt: Date.now(),
    color: ACCOUNT_COLORS[accounts.value.length % ACCOUNT_COLORS.length],
    budget: kind === 'api' ? { mode: 'usd', amount: 20, period: 'month' } : { mode: 'tokens', amount: 2_000_000, period: 'week' },
  };
}

export async function addAccount(acc: Account) {
  accounts.value = [...accounts.value, acc];
  await switchAccount(acc.id);
}

export async function removeAccount(id: string) {
  accounts.value = accounts.value.filter((a) => a.id !== id);
  if (activeAccountId.value === id) {
    const next = accounts.value[0];
    if (next) await switchAccount(next.id); else activeAccountId.value = null;
  }
}

export function updateAccount(id: string, patch: Partial<Account>) {
  accounts.value = accounts.value.map((a) => (a.id === id ? { ...a, ...patch } : a));
}

export async function switchAccount(id: string) {
  const kv = await store();
  const [p, c, ar, d, u] = await Promise.all([
    kv.get<Project[]>(K.projects(id)), kv.get<ChatMeta[]>(K.chats(id)), kv.get<Artifact[]>(K.artifacts(id)),
    kv.get<DesignDoc[]>(K.ideas(id)), kv.get<UsageRecord[]>(K.usage(id)),
  ]);
  batch(() => {
    activeAccountId.value = id;
    projects.value = p ?? [];
    chatIndex.value = c ?? [];
    artifacts.value = ar ?? [];
    designDocs.value = d ?? [];
    const cutoff = Date.now() - 40 * 86400_000;
    usageLog.value = (u ?? []).filter((r) => r.ts > cutoff);
    filesByProject.value = {};
    activeChatId.value = null;
    activeProjectId.value = null;
    rateLimit.value = null;
  });
  saveSoon(K.active, () => id, 50);
}

// ── projects ─────────────────────────────────────────────────────────────────
export function createProject(init: Partial<Project> & { name: string }): Project {
  const a = activeAccountId.value!;
  const p: Project = {
    id: uid('prj_'), accountId: a, glyph: init.glyph ?? init.name.slice(0, 1).toUpperCase(),
    color: init.color ?? ACCOUNT_COLORS[projects.value.length % ACCOUNT_COLORS.length],
    kind: init.kind ?? 'general', description: init.description ?? '', instructions: init.instructions ?? '',
    createdAt: Date.now(), updatedAt: Date.now(), tasks: [], ...init,
  };
  projects.value = [p, ...projects.value];
  return p;
}
export function updateProject(id: string, patch: Partial<Project>) {
  projects.value = projects.value.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p));
}
export async function deleteProject(id: string) {
  const a = activeAccountId.value!;
  projects.value = projects.value.filter((p) => p.id !== id);
  (await store()).del(K.files(a, id));
  chatIndex.value = chatIndex.value.map((c) => (c.projectId === id ? { ...c, projectId: undefined } : c));
}

// ── chats ────────────────────────────────────────────────────────────────────
const chatCache = new Map<string, Chat>();

export function newChat(init: Partial<Chat> = {}): Chat {
  const c: Chat = {
    id: uid('chat_'), accountId: activeAccountId.value!, title: 'New experiment', createdAt: Date.now(),
    updatedAt: Date.now(), model: settings.value.model, messages: [], mode: 'chat', ...init,
  };
  chatCache.set(c.id, c);
  chatIndex.value = [{ id: c.id, title: c.title, projectId: c.projectId, updatedAt: c.updatedAt, mode: c.mode }, ...chatIndex.value];
  return c;
}

export async function loadChat(id: string): Promise<Chat | undefined> {
  const hit = chatCache.get(id);
  if (hit) return hit;
  const c = await (await store()).get<Chat>(K.chat(activeAccountId.value!, id));
  if (c) chatCache.set(id, c);
  return c;
}

/** Persist a chat (debounced) and refresh its index entry. Mutate-then-save is fine. */
export function saveChat(c: Chat, immediate = false) {
  c.updatedAt = Date.now();
  chatCache.set(c.id, c);
  const meta: ChatMeta = { id: c.id, title: c.title, projectId: c.projectId, updatedAt: c.updatedAt, pinned: c.pinned, mode: c.mode };
  const rest = chatIndex.value.filter((m) => m.id !== c.id);
  chatIndex.value = [meta, ...rest];
  saveSoon(K.chat(c.accountId, c.id), () => c, immediate ? 0 : 600);
}

export async function deleteChat(id: string) {
  chatCache.delete(id);
  chatIndex.value = chatIndex.value.filter((m) => m.id !== id);
  if (activeChatId.value === id) activeChatId.value = null;
  (await store()).del(K.chat(activeAccountId.value!, id));
}

// ── files ────────────────────────────────────────────────────────────────────
export async function loadFiles(projectId: string): Promise<ProjectFile[]> {
  const have = filesByProject.value[projectId];
  if (have) return have;
  const list = (await (await store()).get<ProjectFile[]>(K.files(activeAccountId.value!, projectId))) ?? [];
  filesByProject.value = { ...filesByProject.value, [projectId]: list };
  return list;
}

export function setFiles(projectId: string, list: ProjectFile[]) {
  filesByProject.value = { ...filesByProject.value, [projectId]: list };
  saveSoon(K.files(activeAccountId.value!, projectId), () => list, 500);
}

export async function writeFile(projectId: string, path: string, content: string, opts: Partial<ProjectFile> = {}): Promise<{ file: ProjectFile; created: boolean }> {
  const list = await loadFiles(projectId);
  const clean = path.replace(/^\.?\/+/, '').replace(/\/{2,}/g, '/');
  const existing = list.find((f) => f.path === clean);
  const file: ProjectFile = {
    id: existing?.id ?? uid('file_'), projectId, path: clean, content, mime: opts.mime ?? existing?.mime ?? 'text/plain',
    size: opts.binary ? Math.floor(content.length * 0.75) : new Blob([content]).size, updatedAt: Date.now(),
    source: opts.source ?? 'claude', binary: opts.binary, knowledge: opts.knowledge ?? existing?.knowledge,
  };
  setFiles(projectId, existing ? list.map((f) => (f.id === existing.id ? file : f)) : [...list, file]);
  updateProject(projectId, {});
  return { file, created: !existing };
}

export async function deleteFile(projectId: string, path: string) {
  const list = await loadFiles(projectId);
  setFiles(projectId, list.filter((f) => f.path !== path));
}

// ── artifacts ────────────────────────────────────────────────────────────────
export function upsertArtifact(a: Omit<Artifact, 'versions' | 'createdAt' | 'updatedAt' | 'accountId'> & { id?: string }): Artifact {
  const existing = a.id ? artifacts.value.find((x) => x.id === a.id) : undefined;
  if (existing) {
    const next: Artifact = { ...existing, ...a, id: existing.id, updatedAt: Date.now(), versions: [...existing.versions, { content: existing.content, ts: existing.updatedAt }].slice(-20) };
    artifacts.value = artifacts.value.map((x) => (x.id === existing.id ? next : x));
    return next;
  }
  const created: Artifact = { ...a, id: a.id ?? uid('art_'), accountId: activeAccountId.value!, versions: [], createdAt: Date.now(), updatedAt: Date.now() } as Artifact;
  artifacts.value = [created, ...artifacts.value];
  return created;
}

// ── usage ────────────────────────────────────────────────────────────────────
export function recordUsage(r: UsageRecord) {
  usageLog.value = [...usageLog.value, r];
}

// ── UI routing helpers ───────────────────────────────────────────────────────
export function setPanel(p: PanelId | null, arg: unknown = null) {
  batch(() => { openPanelId.value = p; panelArg.value = arg; });
}
// ── HQ placements (used by the world's edit mode and the shop) ──────────────
export function addPlacement(itemId: string, x: number, z: number, rot = 0) {
  const pl = { uid: uid('pl_'), itemId, x, z, rot };
  patchEconomy((e) => ({ ...e, placements: [...e.placements, pl] }));
  return pl;
}
export function updatePlacement(uidv: string, patch: Partial<{ x: number; z: number; rot: number }>) {
  patchEconomy((e) => ({ ...e, placements: e.placements.map((p) => (p.uid === uidv ? { ...p, ...patch } : p)) }));
}
export function removePlacement(uidv: string) {
  patchEconomy((e) => ({ ...e, placements: e.placements.filter((p) => p.uid !== uidv) }));
}
/** How many of an item are owned but not yet placed in the HQ. */
export function unplacedCount(itemId: string) {
  const e = economy.value;
  return (e.owned[itemId] ?? 0) - e.placements.filter((p) => p.itemId === itemId).length;
}

export function patchSettings(patch: Partial<Settings>) { settings.value = { ...settings.value, ...patch }; }
export function patchEconomy(fn: (e: EconomyState) => EconomyState) { economy.value = fn(structuredClone(economy.value)); }
export function updateLook(id: string, patch: Partial<AlienLook>) {
  looks.value = looks.value.map((l) => (l.id === id ? { ...l, ...patch } : l));
}
