// Prompt polisher.
//   localCompress — free, instant, deterministic: strips filler & politeness padding, collapses
//                   whitespace and duplicate lines. Never touches code, quotes, URLs or numbers.
//   polishPrompt  — localCompress + (when an engine is available) a cheap side-model rewrite at
//                   low effort that fixes typos and organizes long prompts. The result is checked
//                   against key terms pulled from the original; anything missing is re-appended,
//                   so the idea is never silently changed or shortened away.

import { estimateTokens } from '../core/util';
import { SIDE_MODEL } from '../core/state';
import { complete, engineAvailable } from './agent';
import { POLISH_SYSTEM } from './prompts';

const PROTECT = /```[\s\S]*?```|`[^`\n]+`|"[^"\n]{1,300}"|“[^”\n]{1,300}”|https?:\/\/\S+/g;

const PHRASES: [RegExp, string][] = [
  [/\b(?:could|can|would) you (?:please |kindly )?/gi, ''],
  [/\bi(?:'d| would) (?:really )?(?:like|love) (?:for )?you to\b\s*/gi, ''],
  [/\bi (?:want|need) you to\b\s*/gi, ''],
  [/\bwould you mind\b\s*/gi, ''],
  [/\bi was wondering if (?:you could )?/gi, ''],
  [/\b(?:please|kindly)\b[,]?\s*/gi, ''],
  [/\b(?:thank you|thanks)(?: (?:so much|a lot|in advance))?[.!]*\s*/gi, ''],
  [/\bif (?:it(?:'s| is) )?possible\b[,]?\s*/gi, ''],
  [/\bif you can\b[,]?\s*/gi, ''],
  [/\bin order to\b/gi, 'to'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bat this point in time\b/gi, 'now'],
  [/\bin the event that\b/gi, 'if'],
  [/\bfor the purpose of\b/gi, 'for'],
  [/\ba lot of\b/gi, 'many'],
  [/\bit is (?:important|worth noting) (?:to note )?that\b\s*/gi, ''],
  [/\b(?:basically|actually|literally|honestly|essentially)\b[,]?\s*/gi, ''],
  [/\bjust\b\s+(?=(?:make|add|use|do|write|build|create|fix|change|keep)\b)/gi, ''],
  [/\bmake sure (?:to|that you)\b/gi, 'ensure you'],
];
const AGGRESSIVE: [RegExp, string][] = [
  [/\b(?:really|very|super|extremely|quite|pretty)\s+(?=\w)/gi, ''],
  [/\b(?:i think|i guess|i feel like|maybe|perhaps)\b[,]?\s*/gi, ''],
  [/\bas well as\b/gi, 'and'],
];

export function localCompress(text: string, aggressive = false): string {
  const saved: string[] = [];
  let s = text.replace(PROTECT, (m) => { saved.push(m); return `\u0000${saved.length - 1}\u0000`; });
  for (const [re, to] of PHRASES) s = s.replace(re, to);
  if (aggressive) for (const [re, to] of AGGRESSIVE) s = s.replace(re, to);
  // whitespace & punctuation tidy
  s = s.replace(/[ \t]+/g, ' ').replace(/ +([,.!?;:])/g, '$1').replace(/([!?.])\1{2,}/g, '$1').replace(/\n{3,}/g, '\n\n');
  // drop exact duplicate lines / sentences (case & spacing insensitive)
  const seen = new Set<string>();
  s = s.split('\n').filter((line) => {
    const k = line.trim().toLowerCase().replace(/\s+/g, ' ');
    if (k.length < 12) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((line) => {
    const parts = line.split(/(?<=[.!?])\s+/);
    const keep: string[] = [];
    for (const p of parts) { const k = p.trim().toLowerCase(); if (k.length > 20 && seen.has('s:' + k)) continue; seen.add('s:' + k); keep.push(p); }
    return keep.join(' ');
  }).join('\n');
  // sentence starts lost their capital after a removed lead-in
  s = s.replace(/(^|[.!?]\s+|\n)([a-z])/g, (_m, a, b) => a + b.toUpperCase());
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i) => saved[Number(i)]).trim();
  return s;
}

/** Words/values that must survive any rewrite. */
export function keyTerms(text: string): string[] {
  const out = new Set<string>();
  const add = (t: string) => { const v = t.trim(); if (v.length >= 2) out.add(v); };
  for (const m of text.matchAll(/```[\s\S]*?```|`[^`\n]+`/g)) add(m[0].replace(/```\w*\n?|```|`/g, '').trim().split('\n')[0].slice(0, 60));
  for (const m of text.matchAll(/"([^"\n]{1,120})"|“([^”\n]{1,120})”/g)) add(m[1] ?? m[2]);
  for (const m of text.matchAll(/https?:\/\/\S+/g)) add(m[0].replace(/[).,]+$/, ''));
  for (const m of text.matchAll(/\b\d+(?:[.,]\d+)?\s?(?:%|px|ms|s|fps|k|kb|mb|gb|x)?\b/gi)) add(m[0]);
  for (const m of text.matchAll(/\b[\w./-]+\.(?:ts|tsx|js|jsx|py|cs|cpp|h|rs|go|lua|gd|json|md|html|css|png|wav|mp3|glb|gltf|unity|tscn)\b/gi)) add(m[0]);
  for (const m of text.matchAll(/\b[A-Z][A-Z0-9]{2,}(?:\s+[A-Z][A-Z0-9]{2,})*\b/g)) add(m[0]);
  for (const m of text.matchAll(/(?<=[a-z,;:]\s)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g)) add(m[1]);
  return [...out].slice(0, 80);
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');

export async function polishPrompt(text: string, opts: { aggressive?: boolean; signal?: AbortSignal } = {}): Promise<{ text: string; before: number; after: number; notes: string[]; usedModel: boolean; missing: string[] }> {
  const before = estimateTokens(text);
  const notes: string[] = [];
  let out = localCompress(text, opts.aggressive);
  if (out.length < text.length) notes.push('Trimmed filler and repetition');
  let usedModel = false;

  if (engineAvailable() && text.trim().length > 40) {
    try {
      const rewritten = await complete({ prompt: text, system: POLISH_SYSTEM, model: SIDE_MODEL, effort: 'low', maxTokens: Math.min(8000, before * 2 + 400), source: 'polish', signal: opts.signal });
      const r = rewritten.replace(/^```\w*\n?|```$/g, '').trim();
      // accept the rewrite unless it ballooned
      if (r && estimateTokens(r) <= Math.max(before * 1.15, before + 40)) {
        out = r; usedModel = true; notes.push('Fixed typos & organized');
      }
    } catch (err: any) {
      if (err?.code === 'cancelled') throw err;
      notes.push('Model polish unavailable — used the free local pass');
    }
  }

  const hay = norm(out);
  const missing = keyTerms(text).filter((t) => !hay.includes(norm(t)));
  if (missing.length) {
    out += `\n\nAlso keep exactly: ${missing.map((m) => (/[,\s]/.test(m) ? `“${m}”` : m)).join(', ')}`;
    notes.push(`Re-added ${missing.length} detail${missing.length === 1 ? '' : 's'} the rewrite dropped`);
  }
  const after = estimateTokens(out);
  if (after >= before && !usedModel) notes.push('Already tight');
  return { text: out, before, after, notes, usedModel, missing };
}
