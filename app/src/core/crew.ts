// Crew director — turns Claude's real activity (bus events) into what each alien is doing.
// The 3D world, the floating widget and the HUD all render `crew` from state; none of
// them listen to Claude directly. One mapping, three views, always in sync.
//
//   Prof. Glorp  — the main alien, your idea assistant (Idea Lab turns, agentId 'glorp')
//   Blip         — lead worker: runs every workspace turn (thinking, writing, coding)
//   Zib          — courier: carries files whenever Claude reads/writes project files
//   Mossy        — researcher: web search / fetch, reading docs
//   Pounce       — snow-leopard intern: planning, tasks, artifacts
//   clone-*      — sub-agent clones spawned by Claude for parallel work

import { signal } from '@preact/signals';
import { bus } from './bus';
import { crew, looks } from './state';
import type { ActivityKind, CrewMember } from './types';

export const LEAD = 'blip';
export const PROFESSOR = 'glorp';

/** Screen-space anchor of the alien currently talking (for speech bubbles). Written by the world each frame. */
export const speakerAnchor = signal<{ id: string; x: number; y: number; visible: boolean } | null>(null);
/** Which alien is delivering the current question (UI shows the bubble near it). */
export const speakerId = signal<string | null>(null);

const KIND_OWNER: Partial<Record<ActivityKind, string>> = {
  files: 'zib', research: 'mossy', planning: 'pounce', building: 'pounce',
};

const IDLE_LINES = ['Idle', 'Sipping slime coffee', 'Polishing goggles', 'Napping in the vat', 'Juggling bolts'];

function base(): CrewMember[] {
  return looks.value.map((l) => ({
    id: l.id, name: l.name, role: l.id === PROFESSOR || l.id === LEAD ? 'main' : 'staff',
    activity: 'idle' as ActivityKind, label: IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)],
    since: Date.now(), lookId: l.id,
  }));
}

function set(id: string, activity: ActivityKind, label: string, runId?: string) {
  const list = crew.value;
  const i = list.findIndex((m) => m.id === id);
  if (i < 0) return;
  const next = [...list];
  next[i] = { ...next[i], activity, label, since: Date.now(), runId };
  crew.value = next;
}

const resetTimers = new Map<string, ReturnType<typeof setTimeout>>();
function later(id: string, ms: number, activity: ActivityKind = 'idle', label = 'Idle') {
  const t = resetTimers.get(id);
  if (t) clearTimeout(t);
  resetTimers.set(id, setTimeout(() => { resetTimers.delete(id); set(id, activity, label); }, ms));
}
function cancel(id: string) { const t = resetTimers.get(id); if (t) { clearTimeout(t); resetTimers.delete(id); } }

/** tool id -> alien id doing it */
const toolOwner = new Map<string, string>();
const runAgent = new Map<string, string>();

export function startCrewDirector() {
  crew.value = base();

  // keep crew in sync with the wardrobe (renames, new aliens)
  looks.subscribe((ls) => {
    const have = new Map(crew.value.map((m) => [m.id, m]));
    const clones = crew.value.filter((m) => m.role === 'clone');
    crew.value = [
      ...ls.map((l) => have.get(l.id) ? { ...have.get(l.id)!, name: l.name } : {
        id: l.id, name: l.name, role: 'staff' as const, activity: 'idle' as ActivityKind, label: 'Idle', since: Date.now(), lookId: l.id,
      }),
      ...clones,
    ];
  });

  bus.on('turn:start', ({ runId, agentId, prompt }) => {
    const who = agentId && crew.value.some((m) => m.id === agentId) ? agentId : LEAD;
    runAgent.set(runId, who);
    cancel(who);
    set(who, 'thinking', who === PROFESSOR ? 'Pondering your idea…' : `Reading: ${prompt.slice(0, 40)}${prompt.length > 40 ? '…' : ''}`, runId);
  });

  bus.on('turn:thinking', ({ runId, agentId }) => {
    const who = agentId ?? runAgent.get(runId) ?? LEAD;
    set(who, 'thinking', 'Thinking hard', runId);
  });

  bus.on('turn:writing', ({ runId, agentId, chars }) => {
    const who = agentId ?? runAgent.get(runId) ?? LEAD;
    const m = crew.value.find((x) => x.id === who);
    if (m?.activity !== 'writing') set(who, 'writing', 'Typing the answer', runId);
    void chars;
  });

  bus.on('tool:start', ({ runId, toolId, kind, label, agentId }) => {
    const lead = runAgent.get(runId) ?? LEAD;
    let who = agentId ?? KIND_OWNER[kind] ?? lead;
    // the professor keeps his own work in the Idea Lab
    if (lead === PROFESSOR && !agentId) who = PROFESSOR;
    if (!crew.value.some((m) => m.id === who)) who = lead;
    toolOwner.set(toolId, who);
    cancel(who);
    set(who, kind, label, runId);
    if (who !== lead) set(lead, 'planning', `Directing ${crew.value.find((m) => m.id === who)?.name ?? 'crew'}`, runId);
  });

  bus.on('tool:end', ({ toolId, ok }) => {
    const who = toolOwner.get(toolId);
    toolOwner.delete(toolId);
    if (!who) return;
    const m = crew.value.find((x) => x.id === who);
    if (!m) return;
    if (m.role === 'clone') return; // clones are driven by clone:update/done
    set(who, ok ? 'celebrating' : 'bugfix', ok ? 'Done ✓' : 'Hit a snag', m.runId);
    if (who !== runAgent.get(m.runId ?? '')) later(who, 1600);
  });

  bus.on('clone:spawn', ({ runId, agentId, task }) => {
    const lead = crew.value.find((m) => m.id === (runAgent.get(runId) ?? LEAD));
    const n = crew.value.filter((m) => m.role === 'clone').length + 1;
    crew.value = [...crew.value, {
      id: agentId, name: `${lead?.name ?? 'Blip'} #${n + 1}`, role: 'clone', activity: 'cloning',
      label: task.slice(0, 60), since: Date.now(), runId, lookId: lead?.lookId ?? LEAD,
    }];
    if (lead) set(lead.id, 'cloning', 'Cloning a helper!', runId);
    setTimeout(() => { const c = crew.value.find((m) => m.id === agentId); if (c?.activity === 'cloning') set(agentId, 'coding', task.slice(0, 60), runId); }, 1400);
  });

  bus.on('clone:update', ({ agentId, kind, label }) => set(agentId, kind, label));

  bus.on('clone:done', ({ agentId, ok }) => {
    set(agentId, ok ? 'celebrating' : 'bugfix', ok ? 'Delivered ✓' : 'Clone fizzled');
    setTimeout(() => { crew.value = crew.value.filter((m) => m.id !== agentId); }, 2600);
  });

  bus.on('question:ask', ({ runId }) => {
    const who = runAgent.get(runId) ?? LEAD;
    speakerId.value = who;
    set(who, 'question', 'Has a question for you!', runId);
  });

  bus.on('question:answered', () => {
    const who = speakerId.value;
    speakerId.value = null;
    if (who) set(who, 'thinking', 'Got it, back to work', crew.value.find((m) => m.id === who)?.runId);
  });

  bus.on('turn:end', ({ runId, ok, agentId }) => {
    const who = agentId ?? runAgent.get(runId) ?? LEAD;
    runAgent.delete(runId);
    set(who, ok ? 'celebrating' : 'bugfix', ok ? 'Experiment complete!' : 'Experiment exploded', undefined);
    later(who, ok ? 2200 : 3000);
    // anyone still holding tools from this run goes idle
    for (const m of crew.value) if (m.runId === runId && m.role !== 'clone' && m.id !== who) later(m.id, 800);
  });
}

/** Snapshot used by the floating widget and HUD: who is busy right now. */
export const isBusy = (m: CrewMember) => m.activity !== 'idle' && m.activity !== 'sleeping';
