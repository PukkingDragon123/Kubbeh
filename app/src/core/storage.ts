// Persistence. One tiny key/value API with three backends:
//   • IndexedDB  — standalone web app (fast, local to this browser)
//   • claude.ai db — when published as an artifact: per-viewer private docs under
//                    data/users/<viewerId>/<key>, synced across the viewer's devices
//   • memory     — last-resort fallback (private windows, blocked storage)
//
// Values are JSON. Keys look like "acct:<id>:chat:<chatId>"; we encode them for db paths.
// Large values (chats with big files) are fine in IDB; db docs cap at 256 KiB, so we
// chunk long JSON strings across sibling docs transparently.

import { capability, isArtifact } from './env';

export interface KV {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
  readonly kind: 'idb' | 'claude-db' | 'memory';
}

// ── memory ───────────────────────────────────────────────────────────────────
class MemoryKV implements KV {
  readonly kind = 'memory' as const;
  private m = new Map<string, string>();
  async get<T>(k: string) { const v = this.m.get(k); return v === undefined ? undefined : (JSON.parse(v) as T); }
  async set<T>(k: string, v: T) { this.m.set(k, JSON.stringify(v)); }
  async del(k: string) { this.m.delete(k); }
  async keys(p: string) { return [...this.m.keys()].filter((k) => k.startsWith(p)); }
}

// ── IndexedDB ────────────────────────────────────────────────────────────────
class IdbKV implements KV {
  readonly kind = 'idb' as const;
  private dbp: Promise<IDBDatabase>;
  constructor(name = 'glob-labs') {
    this.dbp = new Promise((res, rej) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.dbp;
    return new Promise((res, rej) => {
      const t = db.transaction('kv', mode);
      const r = fn(t.objectStore('kv'));
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async get<T>(k: string) { return (await this.tx('readonly', (s) => s.get(k))) as T | undefined; }
  async set<T>(k: string, v: T) { await this.tx('readwrite', (s) => s.put(structuredClone(v), k)); }
  async del(k: string) { await this.tx('readwrite', (s) => s.delete(k)); }
  async keys(p: string) {
    const all = (await this.tx('readonly', (s) => s.getAllKeys())) as IDBValidKey[];
    return all.map(String).filter((k) => k.startsWith(p));
  }
}

// ── claude.ai artifact db ────────────────────────────────────────────────────
const CHUNK = 200_000; // chars per doc, safely under 256 KiB serialized

class ClaudeDbKV implements KV {
  readonly kind = 'claude-db' as const;
  private writing = new Map<string, Promise<void>>();
  constructor(private db: any, private base: string, private local: KV) {}

  private enc(key: string) { return encodeURIComponent(key).replace(/%/g, '~').slice(0, 190); }
  private dec(id: string) { return decodeURIComponent(id.replace(/~/g, '%')); }
  private ref(id: string) { return this.db.doc(`${this.base}/${id}`); }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const snap = await this.ref(this.enc(key)).get();
      if (!snap.exists) return this.local.get<T>(key);
      const d = snap.data();
      let json: string = d.v;
      for (let i = 1; i < (d.n ?? 1); i++) {
        const part = await this.ref(this.enc(key) + '~part' + i).get();
        json += part.exists ? part.data().v : '';
      }
      const val = JSON.parse(json) as T;
      this.local.set(key, val).catch(() => {});
      return val;
    } catch {
      return this.local.get<T>(key);
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.local.set(key, value).catch(() => {});
    const prev = this.writing.get(key) ?? Promise.resolve();
    const next = prev.then(async () => {
      const json = JSON.stringify(value);
      const n = Math.max(1, Math.ceil(json.length / CHUNK));
      const id = this.enc(key);
      for (let i = 1; i < n; i++) await this.ref(id + '~part' + i).set({ v: json.slice(i * CHUNK, (i + 1) * CHUNK), k: key });
      await this.ref(id).set({ v: json.slice(0, CHUNK), n, k: key, t: Date.now() });
    }).catch((err) => console.warn('[storage] db write failed, kept locally', err));
    this.writing.set(key, next);
    return next;
  }

  async del(key: string) {
    this.local.del(key).catch(() => {});
    try {
      const id = this.enc(key);
      const snap = await this.ref(id).get();
      const n = snap.exists ? snap.data().n ?? 1 : 1;
      for (let i = 1; i < n; i++) await this.ref(id + '~part' + i).delete();
      await this.ref(id).delete();
    } catch (err) { console.warn('[storage] db delete failed', err); }
  }

  async keys(prefix: string) {
    try {
      const snap = await this.db.collection(this.base).limit(1000).get();
      return snap.docs.map((d: any) => d.data().k ?? this.dec(d.id))
        .filter((k: string) => k.startsWith(prefix) && !k.includes('~part'));
    } catch {
      return this.local.keys(prefix);
    }
  }
}

// ── factory ──────────────────────────────────────────────────────────────────
async function openLocal(): Promise<KV> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no idb');
    const idb = new IdbKV();
    await idb.set('__probe', 1);
    return idb;
  } catch {
    return new MemoryKV();
  }
}

let storePromise: Promise<KV> | null = null;

/** The app-wide store. Resolves once; safe to call from anywhere. */
export function store(): Promise<KV> {
  if (storePromise) return storePromise;
  storePromise = (async () => {
    const local = await openLocal();
    if (!isArtifact()) return local;
    const [db, user] = await Promise.all([capability('db'), capability('user')]);
    if (!db || !user) return local;
    try {
      const id = await user.id();
      if (!id) return local;
      return new ClaudeDbKV(db, `data/users/${id}`, local);
    } catch {
      return local;
    }
  })();
  return storePromise;
}

/** Fire-and-forget save helpers with per-key debouncing (UI state changes are chatty). */
const timers = new Map<string, ReturnType<typeof setTimeout>>();
export function saveSoon<T>(key: string, value: () => T, ms = 400) {
  const t = timers.get(key);
  if (t) clearTimeout(t);
  timers.set(key, setTimeout(async () => {
    timers.delete(key);
    try { await (await store()).set(key, value()); } catch (err) { console.warn('[storage] save failed', key, err); }
  }, ms));
}
