// Prompt polish: a safe, local, free compressor, plus the check a model rewrite must pass.
// Never touches code (fenced or inline), quoted text, URLs, paths or numbers.

const FILLER: readonly [RegExp, string][] = [
  // greetings / sign-offs
  [/^(hey|hi|hello|yo|dear)\s+(claude|there|buddy|friend)[,!.\s]*/gim, ''],
  [/\b(thanks|thank you)( (so|very) much)?( in advance)?( for (your|the) help)?[.!]*/gi, ''],
  [/\b(cheers|much appreciated|i appreciate it)[.!]*/gi, ''],
  // politeness wrappers
  [/\b(could|can|would|will) you (please |kindly )?(maybe |possibly )?/gi, ''],
  [/\bi was wondering if you could\s*/gi, ''],
  [/\bit would be (great|awesome|nice|amazing) if you could\s*/gi, ''],
  [/\bwould you mind\s*/gi, ''],
  [/\bi('d| would) (really )?(like|love|want) (for )?you to\s*/gi, ''],
  [/\bi want you to\s*/gi, ''],
  [/\bplease\s*/gi, ''],
  [/\bkindly\s*/gi, ''],
  [/\bif (at all )?possible,?\s*/gi, ''],
  [/\bif you can,?\s*/gi, ''],
  // hedges and empty intensifiers
  [/\b(basically|literally|honestly|obviously|actually|essentially|simply)\b,?\s*/gi, ''],
  [/\b(kind of|sort of|a little bit)\s+/gi, ''],
  [/\bi think that\s+/gi, ''],
  [/\bjust\s+(?=(make|do|add|use|fix|write|build|create|change|remove|give|show|tell)\b)/gi, ''],
  // wordy → short
  [/\bin order to\b/gi, 'to'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bat this point in time\b/gi, 'now'],
  [/\bfor the purpose of\b/gi, 'for'],
  [/\bin the event that\b/gi, 'if'],
  [/\ba (large|huge) number of\b/gi, 'many'],
  [/\bmake sure (that )?/gi, 'ensure '],
  [/\bas well as\b/gi, 'and'],
  [/\b(is|are) able to\b/gi, 'can'],
  // punctuation noise
  [/([!?.])\1{1,}/g, '$1'],
]

const PROTECT = /```[\s\S]*?```|`[^`\n]+`|"[^"\n]{1,400}"|https?:\/\/\S+|(?:\.{0,2}\/)?[\w.-]+(?:\/[\w.-]+)+|\b\w+\.\w{1,6}\b|\b\d[\d.,:%-]*\b/g

export const estimateTokens = (s: string): number => Math.ceil(s.length / 4)

export type Polished = { text: string; before: number; after: number; saved: number }

/** Local compression. Returns the original when nothing safe can be cut. */
export function compress(input: string): Polished {
  const before = estimateTokens(input)
  const kept: string[] = []
  // Swap protected spans for placeholders that no filler rule can match.
  let work = input.replace(PROTECT, m => `\u0000${kept.push(m) - 1}\u0000`)
  for (const [re, to] of FILLER) work = work.replace(re, to)
  work = work
    .split('\n')
    .map(line => line.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/^[ \t]*[,;]\s*/, '').trimEnd())
    .filter((line, i, all) => line === '' || line !== all[i - 1])
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  // Re-capitalise a sentence start a removal exposed.
  work = work.replace(/(^|[.!?]\s+|\n)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
  const text = work.replace(/\u0000(\d+)\u0000/g, (_, n: string) => kept[Number(n)] ?? '')
  const after = estimateTokens(text)
  if (text.length === 0 || text.length < input.length * 0.4) return { text: input, before, after: before, saved: 0 }
  return { text, before, after, saved: Math.max(0, before - after) }
}

/** Terms a rewrite must keep: numbers, code, quotes, paths, names, long words. */
export function keyTerms(input: string): string[] {
  const terms = new Set<string>()
  for (const m of input.match(PROTECT) ?? []) terms.add(m.replace(/^["`]+|["`]+$/g, '').toLowerCase())
  // Names: capitalised words that are not just a sentence start.
  for (const m of input.match(/(?<=[a-z0-9,;:)]\s)[A-Z][a-zA-Z0-9]{2,}\b/g) ?? []) terms.add(m.toLowerCase())
  for (const m of input.match(/\b[a-zA-Z]{8,}\b/g) ?? []) terms.add(m.toLowerCase())
  return [...terms].filter(t => t.length > 1)
}

/** True when the rewrite kept at least 90% of the key terms (and every number and code span). */
export function keepsMeaning(original: string, rewrite: string): boolean {
  const terms = keyTerms(original)
  if (terms.length === 0) return rewrite.trim().length > 0
  const low = rewrite.toLowerCase()
  const hard = (original.match(PROTECT) ?? []).map(t => t.replace(/^["`]+|["`]+$/g, '').toLowerCase())
  if (hard.some(t => !low.includes(t))) return false
  const kept = terms.filter(t => low.includes(t)).length
  return kept / terms.length >= 0.9
}

export const POLISH_SYSTEM =
  'You tighten prompts for an AI coding assistant. Rewrite the user prompt to use fewer tokens while keeping EVERY requirement, number, name, file path, code span, constraint and preference. Remove only filler, repetition and politeness. Keep the same language and the same intent; never add requirements. Reply with the rewritten prompt only, no preamble.'
