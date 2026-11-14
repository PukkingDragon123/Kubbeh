// Achievements — badges for real milestones. Each has a reward in genes and, where it
// makes sense, a progress counter (shown in the Achievements panel).

import { effect } from '@preact/signals';
import { bus, sfx, toast } from '../core/bus';
import { chatIndex, designDocs, economy, fuel, looks, patchEconomy, ready, settings } from '../core/state';
import type { IconName } from '../ui/common/icons';
import { bumpStat, earnGenes, setStatMax, stat } from './genes';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  reward: number;
  icon: IconName;
  /** progress: [current, goal] — omitted for one-off badges */
  progress?: () => [number, number];
  secret?: boolean;
}

const prog = (key: string, goal: number) => () => [Math.min(stat(key), goal), goal] as [number, number];

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'exp_1', name: 'First Experiment', desc: 'Finish your first Claude turn in the lab.', reward: 20, icon: 'alien', progress: prog('turns', 1) },
  { id: 'exp_10', name: 'Lab Regular', desc: 'Finish 10 experiments.', reward: 40, icon: 'terminal', progress: prog('turns', 10) },
  { id: 'exp_100', name: 'Mad Scientist', desc: 'Finish 100 experiments.', reward: 200, icon: 'brain', progress: prog('turns', 100) },
  { id: 'chats_10', name: 'Chatterbox', desc: 'Keep 10 chats in one account.', reward: 30, icon: 'chat', progress: prog('maxChats', 10) },
  { id: 'file_1', name: 'Paper Trail', desc: 'Claude writes its first project file.', reward: 15, icon: 'file', progress: prog('files', 1) },
  { id: 'files_50', name: 'Filing Cabinet Overflow', desc: 'Claude writes 50 project files.', reward: 80, icon: 'folder', progress: prog('files', 50) },
  { id: 'artifact_1', name: 'It Lives!', desc: 'Create your first artifact.', reward: 25, icon: 'sparkle', progress: prog('artifacts', 1) },
  { id: 'artifact_10', name: 'Gallery Opening', desc: 'Create 10 artifacts.', reward: 70, icon: 'star', progress: prog('artifacts', 10) },
  { id: 'clone_squad', name: 'Clone Squad', desc: 'Two or more alien clones work on one task.', reward: 40, icon: 'alien' },
  { id: 'clones_25', name: 'Vat Overtime', desc: '25 clones delivered their work.', reward: 90, icon: 'refresh', progress: prog('clonesDone', 25) },
  { id: 'compact_1', name: 'Trash Compactor', desc: 'Context compaction saved tokens for the first time.', reward: 20, icon: 'bolt', progress: prog('compactions', 1) },
  { id: 'polish_1k', name: 'Silver Tongue', desc: 'The prompt polisher saved 1,000 tokens in total.', reward: 50, icon: 'sparkle', progress: prog('polishSaved', 1000) },
  { id: 'caveman', name: 'Me Talk Short', desc: 'Finish a turn with caveman mode on.', reward: 15, icon: 'warn' },
  { id: 'design_done', name: 'Blueprint Approved', desc: 'Bring a game design doc to 90% complete.', reward: 60, icon: 'idea' },
  { id: 'final_prompt', name: 'Launch Codes', desc: 'Generate a final build prompt in the Idea Lab.', reward: 40, icon: 'send' },
  { id: 'fusion', name: 'Mechanic Mixologist', desc: 'Fuse mechanics in the fusion chamber.', reward: 15, icon: 'bolt' },
  { id: 'first_buy', name: 'Retail Therapy', desc: 'Buy something from the GENE-O-MAT.', reward: 10, icon: 'shop', progress: prog('purchases', 1) },
  { id: 'big_spender', name: 'Big Spender', desc: 'Spend 1,000 genes in total.', reward: 100, icon: 'dna', progress: prog('spent', 1000) },
  { id: 'decor_5', name: 'Interior Decorator', desc: 'Place 5 items in your HQ.', reward: 30, icon: 'wrench', progress: prog('placedMax', 5) },
  { id: 'decor_15', name: 'Alley Architect', desc: 'Place 15 items in your HQ.', reward: 90, icon: 'wrench', progress: prog('placedMax', 15) },
  { id: 'stylist', name: 'Jelly Stylist', desc: 'Customize an alien in the Wardrobe.', reward: 15, icon: 'wardrobe' },
  { id: 'skin_1', name: 'New Skin, Who Dis', desc: 'Buy a skin.', reward: 25, icon: 'wardrobe', progress: prog('skinsBought', 1) },
  { id: 'pounce_fan', name: 'Pounce Fan Club', desc: 'Dress another alien in the Snow Pounce skin.', reward: 20, icon: 'star' },
  { id: 'jackpot', name: 'Jackpot!', desc: 'Hit a jackpot on the Idea Slot Machine.', reward: 30, icon: 'slot' },
  { id: 'spins_25', name: 'Lever Puller', desc: 'Spin the slot machine 25 times.', reward: 30, icon: 'slot', progress: prog('spins', 25) },
  { id: 'arcade_ace', name: 'Arcade Ace', desc: 'Score 300+ in UFO Catch.', reward: 40, icon: 'arcade', progress: prog('arcadeHigh', 300) },
  { id: 'streak_3', name: 'Three-Day Goo', desc: 'Visit the lab 3 days in a row.', reward: 30, icon: 'bolt', progress: () => [Math.min(economy.value.streak ?? 0, 3), 3] },
  { id: 'streak_7', name: 'Lab Rat', desc: 'Visit the lab 7 days in a row.', reward: 100, icon: 'trophy', progress: () => [Math.min(economy.value.streak ?? 0, 7), 7] },
  { id: 'night_owl', name: 'Night Owl', desc: 'Finish an experiment between midnight and 5am.', reward: 20, icon: 'eye', secret: true },
  { id: 'fuel_survivor', name: 'Running on Fumes', desc: 'Finish a turn below 10% fuel.', reward: 25, icon: 'fuel', secret: true },
  { id: 'poke_25', name: 'Do Not Poke the Aliens', desc: 'Poke aliens 25 times.', reward: 15, icon: 'alien', progress: prog('pokes', 25), secret: true },
];

export const achievementById = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function hasAchievement(id: string) { return !!economy.value.achievements[id]; }

export function unlock(id: string) {
  const a = achievementById.get(id);
  if (!a || hasAchievement(id) || !ready.value) return;
  patchEconomy((e) => ({ ...e, achievements: { ...e.achievements, [id]: Date.now() } }));
  bus.emit('achievement', { id, name: a.name, reward: a.reward });
  sfx('fanfare', 0.55);
  toast(`Achievement: ${a.name} · +${a.reward} genes`, 'good', 'trophy');
  setTimeout(() => earnGenes(a.reward, `Achievement: ${a.name}`, undefined, 'achievement'), 400);
}

/** Re-check every counter-based badge (cheap; run after any stat change). */
export function checkProgress() {
  if (!ready.value) return;
  for (const a of ACHIEVEMENTS) {
    if (!a.progress || hasAchievement(a.id)) continue;
    const [c, g] = a.progress();
    if (c >= g) unlock(a.id);
  }
}

export function startAchievements() {
  const tools = new Map<string, number>();
  const clonesPerRun = new Map<string, number>();

  bus.on('turn:start', ({ runId }) => tools.set(runId, 0));
  bus.on('tool:start', ({ runId }) => { tools.set(runId, (tools.get(runId) ?? 0) + 1); bumpStat('tools'); });

  bus.on('turn:end', ({ runId, ok }) => {
    const used = tools.get(runId) ?? 0;
    tools.delete(runId);
    clonesPerRun.delete(runId);
    if (!ok) return;
    bumpStat('turns');
    earnGenes(3 + Math.min(5, used), used ? `Experiment complete (${used} tool${used === 1 ? '' : 's'})` : 'Experiment complete');
    const h = new Date().getHours();
    if (h < 5) unlock('night_owl');
    if (settings.value.caveman !== 'off') unlock('caveman');
    if (fuel.value.level < 0.1) unlock('fuel_survivor');
    checkProgress();
  });

  bus.on('file:written', () => { bumpStat('files'); earnGenes(1, 'Project file written', undefined, 'files'); checkProgress(); });
  bus.on('artifact:created', () => { bumpStat('artifacts'); earnGenes(10, 'Artifact created'); checkProgress(); });
  bus.on('clone:spawn', ({ runId }) => {
    bumpStat('clones');
    const n = (clonesPerRun.get(runId) ?? 0) + 1;
    clonesPerRun.set(runId, n);
    if (n >= 2) unlock('clone_squad');
  });
  bus.on('clone:done', ({ ok }) => { if (ok) { bumpStat('clonesDone'); earnGenes(3, 'Clone delivered'); checkProgress(); } });
  bus.on('compact:done', ({ before, after }) => {
    bumpStat('compactions'); bumpStat('tokensCompacted', Math.max(0, before - after));
    earnGenes(5, 'Context compacted'); checkProgress();
  });
  bus.on('world:click', ({ target, screenX, screenY }) => {
    if (!target.startsWith('alien')) return;
    bumpStat('pokes');
    if (Math.random() < 0.3) earnGenes(1, 'Poked an alien', { x: screenX, y: screenY }, 'poke');
    checkProgress();
  });

  // signal-driven checks (only once the saved state is loaded)
  effect(() => {
    if (!ready.value) return;
    const n = economy.value.placements.length;
    if (n > (economy.value.stats.placedMax ?? 0)) setTimeout(() => { setStatMax('placedMax', n); checkProgress(); }, 0);
  });
  effect(() => {
    if (!ready.value) return;
    const n = chatIndex.value.filter((c) => c.mode !== 'idea').length;
    if (n > (economy.value.stats.maxChats ?? 0)) setTimeout(() => { setStatMax('maxChats', n); checkProgress(); }, 0);
  });
  effect(() => {
    if (!ready.value) return;
    if (looks.value.some((l) => l.id !== 'pounce' && l.skin === 'pounce')) setTimeout(() => unlock('pounce_fan'), 0);
  });
  effect(() => {
    if (!ready.value) return;
    if (designDocs.value.some((d) => d.completeness >= 90)) setTimeout(() => unlock('design_done'), 0);
  });
  effect(() => {
    if (!ready.value) return;
    void economy.value.stats;
    setTimeout(checkProgress, 0);
  });
}

/** Called by the prompt polisher (src/claude) when it trims tokens. */
export function recordPolishSavings(tokens: number) {
  if (tokens <= 0) return;
  bumpStat('polishSaved', tokens);
  checkProgress();
}
