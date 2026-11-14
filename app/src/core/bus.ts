// Typed event bus — the nervous system of the lab.
// Claude engine emits activity → crew director → aliens, widget, HUD, sfx all listen.

import type { ActivityKind, FuelTier, PanelId, MessageUsage } from './types';

export type BusEvents = {
  // ── Claude turn lifecycle (emitted by src/claude/agent.ts) ──
  'turn:start': { runId: string; chatId: string; projectId?: string; prompt: string; agentId?: string };
  'turn:thinking': { runId: string; agentId?: string };
  'turn:writing': { runId: string; agentId?: string; chars: number };
  'turn:end': { runId: string; ok: boolean; usage?: MessageUsage; error?: string; agentId?: string };
  'tool:start': { runId: string; toolId: string; tool: string; kind: ActivityKind; label: string; agentId?: string };
  'tool:end': { runId: string; toolId: string; ok: boolean; agentId?: string };
  'clone:spawn': { runId: string; agentId: string; task: string };
  'clone:update': { runId: string; agentId: string; kind: ActivityKind; label: string };
  'clone:done': { runId: string; agentId: string; ok: boolean };
  'question:ask': { runId: string; questionId: string; question: string; options?: string[] };
  'question:answered': { questionId: string; answer: string };
  'compact:done': { chatId: string; before: number; after: number };
  'file:written': { projectId: string; path: string; bytes: number; created: boolean };
  'artifact:created': { artifactId: string; title: string };

  // ── Fuel & economy ──
  'fuel:tier': { tier: FuelTier; prev: FuelTier; level: number };
  'genes:earn': { amount: number; reason: string; x?: number; y?: number };
  'genes:spend': { amount: number; item: string };
  'achievement': { id: string; name: string; reward: number };

  // ── World / UI glue ──
  'world:click': { target: string; screenX: number; screenY: number };
  'world:hover': { target: string | null };
  'world:ready': {};
  'world:focus': { target: string };
  'ui:open': { panel: PanelId; arg?: unknown };
  'ui:close': { panel: PanelId };
  'ui:toast': { text: string; tone?: 'info' | 'good' | 'warn' | 'bad'; icon?: string };
  'sfx': { name: SfxName; volume?: number; rate?: number };
  'placement:changed': {};
  'look:changed': { lookId: string };
  'idea:send': { text: string };
};

export type SfxName =
  | 'click' | 'hover' | 'toggle' | 'tab' | 'panel_open' | 'panel_close' | 'computer' | 'send'
  | 'slime' | 'ufo' | 'zap' | 'boing' | 'plop' | 'plop2' | 'weird' | 'bell' | 'machine' | 'paper'
  | 'chomp' | 'coin' | 'coins' | 'fanfare' | 'alarm' | 'powerup' | 'error' | 'blip' | 'blip2'
  | 'portal' | 'select' | 'question' | 'bling' | 'poweron' | 'tick';

type Handler<T> = (payload: T) => void;

class Bus {
  private map = new Map<keyof BusEvents, Set<Handler<any>>>();
  private any = new Set<(type: keyof BusEvents, payload: unknown) => void>();

  on<K extends keyof BusEvents>(type: K, fn: Handler<BusEvents[K]>): () => void {
    let set = this.map.get(type);
    if (!set) this.map.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  once<K extends keyof BusEvents>(type: K, fn: Handler<BusEvents[K]>): () => void {
    const off = this.on(type, (p) => { off(); fn(p); });
    return off;
  }

  /** Listen to every event (used by the floating widget mirror and debug overlay). */
  onAny(fn: (type: keyof BusEvents, payload: unknown) => void): () => void {
    this.any.add(fn);
    return () => this.any.delete(fn);
  }

  emit<K extends keyof BusEvents>(type: K, payload: BusEvents[K]): void {
    const set = this.map.get(type);
    if (set) for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[bus] ${String(type)} handler failed`, err); }
    }
    for (const fn of this.any) {
      try { fn(type, payload); } catch (err) { console.error('[bus] any handler failed', err); }
    }
  }
}

export const bus = new Bus();

/** Shorthand helpers used everywhere in the UI. */
export const sfx = (name: SfxName, volume?: number, rate?: number) => bus.emit('sfx', { name, volume, rate });
export const toast = (text: string, tone: 'info' | 'good' | 'warn' | 'bad' = 'info', icon?: string) =>
  bus.emit('ui:toast', { text, tone, icon });
export const openPanel = (panel: PanelId, arg?: unknown) => bus.emit('ui:open', { panel, arg });
