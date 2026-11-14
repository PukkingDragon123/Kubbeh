// Game Design Doc model for the Idea Lab: sections, completeness scoring, the
// update_design_doc tool Prof. Glorp uses, and requirement-coverage checking for the
// final build prompt.

import { activeAccountId, designDocs } from '../../core/state';
import { uid } from '../../core/util';
import type { DesignDoc } from '../../core/types';
import type { ExtraTool } from '../../claude/agent';

type TextKey = 'pitch' | 'genre' | 'platform' | 'audience' | 'coreLoop' | 'progression' | 'controls' | 'visuals' | 'audio' | 'narrative' | 'scope' | 'tech';
export interface Section { key: TextKey | 'pillars' | 'mechanics'; label: string; weight: number; hint: string; short?: boolean }

export const SECTIONS: Section[] = [
  { key: 'pitch', label: 'Hook', weight: 12, hint: 'One or two sentences that make someone want to play it.' },
  { key: 'genre', label: 'Genre', weight: 5, hint: 'e.g. roguelike deckbuilder', short: true },
  { key: 'platform', label: 'Platform', weight: 4, hint: 'Web, PC, mobile, console…', short: true },
  { key: 'audience', label: 'Audience', weight: 4, hint: 'Who is it for? Session length?', short: true },
  { key: 'pillars', label: 'Pillars', weight: 8, hint: '3–5 words or phrases every decision must serve.' },
  { key: 'coreLoop', label: 'Core loop', weight: 14, hint: 'What the player does every 30 seconds, every run, every session.' },
  { key: 'mechanics', label: 'Mechanics', weight: 14, hint: 'The systems, each with how it actually works.' },
  { key: 'progression', label: 'Progression', weight: 10, hint: 'Unlocks, difficulty curve, meta progression, win/lose.' },
  { key: 'controls', label: 'Controls', weight: 6, hint: 'Inputs per platform, feel, camera.' },
  { key: 'visuals', label: 'Visual style', weight: 7, hint: 'Art direction, palette, camera, UI feel, juice.' },
  { key: 'audio', label: 'Audio', weight: 4, hint: 'Music mood, key sound effects.' },
  { key: 'narrative', label: 'Story & world', weight: 4, hint: 'Setting, characters, tone.' },
  { key: 'scope', label: 'Scope & MVP', weight: 6, hint: 'What is in the first playable build, what waits.' },
  { key: 'tech', label: 'Tech', weight: 2, hint: 'Engine/framework, save system, constraints.', short: true },
];

export function newDoc(title = 'Untitled idea'): DesignDoc {
  return {
    id: uid('doc_'), accountId: activeAccountId.value ?? '', title, pitch: '', genre: '', platform: '', audience: '',
    pillars: [], coreLoop: '', mechanics: [], progression: '', controls: '', visuals: '', audio: '', narrative: '',
    scope: '', tech: '', requirements: [], openQuestions: [], completeness: 0, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

export function saveDoc(doc: DesignDoc) {
  doc.updatedAt = Date.now();
  const rest = designDocs.value.filter((d) => d.id !== doc.id);
  designDocs.value = [{ ...doc }, ...rest];
}
export function deleteDoc(id: string) { designDocs.value = designDocs.value.filter((d) => d.id !== id); }
export function getDoc(id: string | null | undefined) { return designDocs.value.find((d) => d.id === id) ?? null; }

/** 0..1 fill for one section. */
export function fill(doc: DesignDoc, s: Section): number {
  if (s.key === 'pillars') return doc.pillars.length >= 3 ? 1 : doc.pillars.length ? 0.5 : 0;
  if (s.key === 'mechanics') return doc.mechanics.length >= 3 ? 1 : doc.mechanics.length ? 0.4 + doc.mechanics.length * 0.2 : 0;
  const v = (doc[s.key] ?? '').trim();
  const full = s.short ? 3 : 60;
  return v.length >= full ? 1 : v.length >= (s.short ? 1 : 15) ? 0.55 : 0;
}

export function heuristicScore(doc: DesignDoc): number {
  let score = 0;
  for (const s of SECTIONS) score += s.weight * fill(doc, s);
  score -= Math.min(15, doc.openQuestions.length * 3);
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Blend the model's own estimate with the heuristic so neither can run away. */
export function blendedScore(doc: DesignDoc, modelEstimate?: number): number {
  const h = heuristicScore(doc);
  if (modelEstimate === undefined || Number.isNaN(modelEstimate)) return h;
  return Math.round(Math.max(h - 15, Math.min(h + 15, modelEstimate)));
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export interface DocPatch {
  title?: string; pitch?: string; genre?: string; platform?: string; audience?: string; pillars?: string[]; coreLoop?: string;
  mechanics?: { name: string; detail: string }[]; remove_mechanics?: string[]; progression?: string; controls?: string;
  visuals?: string; audio?: string; narrative?: string; scope?: string; tech?: string; requirements?: string[];
  remove_requirements?: string[]; openQuestions?: string[]; completeness?: number;
}

export function applyPatch(doc: DesignDoc, p: DocPatch): { doc: DesignDoc; changed: string[] } {
  const d: DesignDoc = structuredClone(doc);
  const changed: string[] = [];
  for (const k of ['title', 'pitch', 'genre', 'platform', 'audience', 'coreLoop', 'progression', 'controls', 'visuals', 'audio', 'narrative', 'scope', 'tech'] as const) {
    const v = p[k];
    if (typeof v === 'string' && v.trim() && v.trim() !== d[k]) { d[k] = v.trim(); changed.push(k); }
  }
  if (Array.isArray(p.pillars) && p.pillars.length) { d.pillars = p.pillars.map((x) => String(x).trim()).filter(Boolean).slice(0, 6); changed.push('pillars'); }
  if (Array.isArray(p.mechanics)) {
    for (const m of p.mechanics) {
      if (!m?.name) continue;
      const i = d.mechanics.findIndex((x) => norm(x.name) === norm(m.name));
      if (i >= 0) d.mechanics[i] = { name: m.name, detail: m.detail ?? d.mechanics[i].detail };
      else d.mechanics.push({ name: m.name, detail: m.detail ?? '' });
    }
    if (p.mechanics.length) changed.push('mechanics');
  }
  if (Array.isArray(p.remove_mechanics) && p.remove_mechanics.length) {
    const rm = new Set(p.remove_mechanics.map(norm));
    d.mechanics = d.mechanics.filter((m) => !rm.has(norm(m.name)));
    changed.push('mechanics');
  }
  if (Array.isArray(p.requirements)) {
    const have = new Set(d.requirements.map(norm));
    for (const r of p.requirements) { const t = String(r).trim(); if (t && !have.has(norm(t))) { d.requirements.push(t); have.add(norm(t)); } }
    if (p.requirements.length) changed.push('requirements');
  }
  if (Array.isArray(p.remove_requirements) && p.remove_requirements.length) {
    const rm = new Set(p.remove_requirements.map(norm));
    d.requirements = d.requirements.filter((r) => !rm.has(norm(r)));
    changed.push('requirements');
  }
  if (Array.isArray(p.openQuestions)) { d.openQuestions = p.openQuestions.map((q) => String(q).trim()).filter(Boolean).slice(0, 8); changed.push('openQuestions'); }
  d.completeness = blendedScore(d, typeof p.completeness === 'number' ? p.completeness : undefined);
  return { doc: d, changed };
}

const str = (description: string) => ({ type: 'string', description });
const arr = (description: string, items: Record<string, unknown> = { type: 'string' }) => ({ type: 'array', items, description });

export function designDocTool(getId: () => string | null, onChange: (doc: DesignDoc, changed: string[]) => void): ExtraTool {
  return {
    name: 'update_design_doc',
    description: 'Write decisions into the live Game Design Doc shown beside the chat. Call it after every answer that decides or reveals something. Strings replace a field. Mechanics are merged by name. Requirements are APPENDED (only new ones). openQuestions is the full current list.',
    input_schema: {
      type: 'object', additionalProperties: false,
      properties: {
        title: str('Working title'), pitch: str('1–2 sentence hook'), genre: str('Genre'), platform: str('Target platform(s)'), audience: str('Audience and session length'),
        pillars: arr('3–5 design pillars (full list)'), coreLoop: str('Moment-to-moment loop, run/session loop'),
        mechanics: arr('Mechanics to add or update, matched by name', { type: 'object', properties: { name: { type: 'string' }, detail: { type: 'string' } }, required: ['name', 'detail'], additionalProperties: false }),
        remove_mechanics: arr('Names of mechanics the user dropped'),
        progression: str('Progression, difficulty, meta, win/lose'), controls: str('Controls and feel'), visuals: str('Art direction and juice'),
        audio: str('Music and sound'), narrative: str('Setting, characters, tone'), scope: str('MVP scope and what waits'), tech: str('Engine, framework, constraints'),
        requirements: arr('NEW concrete things the user explicitly asked for, close to their own words. Never invent; never drop earlier ones.'),
        remove_requirements: arr('Only if the user explicitly withdrew one'),
        openQuestions: arr('Full current list of unresolved questions (max 8)'),
        completeness: { type: 'number', description: 'Honest estimate 0–100 of how ready this design is to build' },
      },
    },
    kind: 'planning',
    label: (input: DocPatch) => {
      const keys = Object.keys(input ?? {}).filter((k) => k !== 'completeness');
      return keys.length ? `Design doc: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '…' : ''}` : 'Updating the design doc';
    },
    run: async (input: DocPatch) => {
      const doc = getDoc(getId());
      if (!doc) return 'No design doc is open.';
      const { doc: next, changed } = applyPatch(doc, input ?? {});
      saveDoc(next);
      onChange(next, changed);
      return `Saved (${changed.join(', ') || 'no changes'}). Completeness now ${next.completeness}%. Requirements tracked: ${next.requirements.length}. Open questions: ${next.openQuestions.length}.`;
    },
  };
}

// ── requirement coverage ─────────────────────────────────────────────────────
const STOP = new Set('the a an and or but with for from into onto that this those these then than when where what which who whom whose have has had will would should could can may might must shall about over under very really just also like more most some any each every such only own same other into your you our their there here make made game player players should want wants need needs feel feels'.split(' '));

export function keywords(text: string): string[] {
  return [...new Set(text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)))];
}

/** A requirement counts as covered when most of its meaningful words appear in the prompt. */
export function coverage(prompt: string, requirements: string[]): { req: string; covered: boolean; score: number }[] {
  const p = prompt.toLowerCase();
  const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, '');
  return requirements.map((req) => {
    if (p.includes(req.toLowerCase())) return { req, covered: true, score: 1 };
    const ks = keywords(req);
    if (!ks.length) return { req, covered: true, score: 1 };
    const hit = ks.filter((k) => p.includes(k) || p.includes(stem(k))).length;
    const score = hit / ks.length;
    return { req, covered: score >= 0.6, score };
  });
}

export function docAsBrief(doc: DesignDoc): string {
  const lines: string[] = [`Title: ${doc.title}`];
  for (const s of SECTIONS) {
    if (s.key === 'pillars') { if (doc.pillars.length) lines.push(`Pillars: ${doc.pillars.join('; ')}`); continue; }
    if (s.key === 'mechanics') { if (doc.mechanics.length) lines.push('Mechanics:\n' + doc.mechanics.map((m) => `- ${m.name}: ${m.detail}`).join('\n')); continue; }
    const v = doc[s.key];
    if (v) lines.push(`${s.label}: ${v}`);
  }
  if (doc.requirements.length) lines.push('User requirements (ALL must be honoured):\n' + doc.requirements.map((r) => `- ${r}`).join('\n'));
  if (doc.openQuestions.length) lines.push('Still open (decide sensibly and say so):\n' + doc.openQuestions.map((q) => `- ${q}`).join('\n'));
  return lines.join('\n');
}
