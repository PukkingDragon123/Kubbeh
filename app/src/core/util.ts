// Small shared helpers. No dependencies.

export const uid = (prefix = '') =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Rough token estimate (~4 chars/token for English & code). Used only where the API gives no count. */
export const estimateTokens = (text: string) => Math.ceil((text?.length ?? 0) / 4);

export const fmtTokens = (n: number) =>
  n >= 1_000_000 ? (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M'
  : n >= 1000 ? (n / 1000).toFixed(n >= 10_000 ? 0 : 1) + 'k' : String(Math.round(n));

export const fmtUsd = (n: number) =>
  n === 0 ? '$0' : n < 0.01 ? '<$0.01' : n < 100 ? '$' + n.toFixed(2) : '$' + Math.round(n).toLocaleString();

export const fmtAgo = (ts: number) => {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  if (s < 86400 * 7) return Math.round(s / 86400) + 'd ago';
  return new Date(ts).toLocaleDateString();
};

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...a: A) => { if (t) clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const extOf = (path: string) => (path.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();

export const langOf = (path: string) => {
  const e = extOf(path);
  return ({ ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', py: 'python',
    rs: 'rust', go: 'go', cs: 'csharp', cpp: 'cpp', c: 'c', h: 'c', java: 'java', lua: 'lua', gd: 'gdscript',
    json: 'json', md: 'markdown', html: 'html', css: 'css', glsl: 'glsl', sh: 'bash', yml: 'yaml', yaml: 'yaml',
    toml: 'toml', xml: 'xml', svg: 'xml', txt: 'plaintext' } as Record<string, string>)[e] ?? 'plaintext';
};

export const mimeOf = (path: string) => {
  const e = extOf(path);
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    pdf: 'application/pdf', json: 'application/json', html: 'text/html', css: 'text/css', svg: 'image/svg+xml',
    js: 'text/javascript', ts: 'text/typescript', md: 'text/markdown' } as Record<string, string>)[e] ?? 'text/plain';
};

export const isTextMime = (mime: string) =>
  mime.startsWith('text/') || /json|xml|javascript|typescript|svg|yaml|toml/.test(mime);

export function readFileAsDataURL(file: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
}
export function readFileAsText(file: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(file); });
}

/** Seeded PRNG (mulberry32) for deterministic voxel/props generation. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
