// Disk cache for read-only API responses so everything already browsed loads without internet.
// expo-file-system is loaded lazily so plain-Node tests can import shopify.ts without React Native.
type FS = typeof import('expo-file-system');
type Dir = import('expo-file-system').Directory;
let fsMod: FS | null | undefined;
const fsys = (): FS | null => {
  if (fsMod === undefined) { try { fsMod = require('expo-file-system') as FS; } catch { fsMod = null; } }
  return fsMod;
};

/** Entries unused for this long are deleted. */
export const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
/** Total size cap; least-recently-used entries are deleted first. */
export const CACHE_MAX_BYTES = 40 * 1024 * 1024;
const PREFIX = 'c2_';
const LRU_FILE = '_lru.json';

type Rec<T> = { k: string; t: number; d: T };
export type CacheHit<T> = { data: T; at: number };

let dir: Dir | null = null;
const getDir = (): Dir | null => {
  const fs = fsys();
  if (!fs) return null;
  if (!dir) {
    const d = new fs.Directory(fs.Paths.document, 'shopify-cache');
    try { d.create({ idempotent: true, intermediates: true }); } catch { /* exists */ }
    dir = d;
  }
  return dir;
};

// File name = two independent 32-bit hashes + length. The full key is also stored inside the record and
// verified on read, so even a hash collision can never return another request's data.
export const cacheFileName = (s: string) => {
  let a = 5381, b = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = ((a * 33) ^ c) >>> 0;
    b = Math.imul(b ^ c, 0x01000193) >>> 0;
  }
  return `${PREFIX}${a.toString(36)}_${b.toString(36)}_${s.length.toString(36)}.json`;
};
const fileFor = (key: string) => { const d = getDir(); const fs = fsys(); return d && fs ? new fs.File(d, cacheFileName(key)) : null; };

// Last-use times (LRU). Kept in memory and flushed to one small file, so reads never rewrite big entries.
let used: Record<string, number> | null = null;
let lruTimer: ReturnType<typeof setTimeout> | null = null;
const lru = (): Record<string, number> => {
  if (used) return used;
  used = {};
  try {
    const d = getDir(); const fs = fsys();
    if (d && fs) { const f = new fs.File(d, LRU_FILE); if (f.exists) used = JSON.parse(f.textSync()) as Record<string, number>; }
  } catch { used = {}; }
  return used!;
};
const saveLru = () => {
  lruTimer = null;
  try {
    const d = getDir(); const fs = fsys(); if (!d || !fs || !used) return;
    const f = new fs.File(d, LRU_FILE); if (!f.exists) f.create();
    f.write(JSON.stringify(used));
  } catch { /* best-effort */ }
};
const touch = (name: string) => {
  lru()[name] = Date.now();
  if (!lruTimer) lruTimer = setTimeout(saveLru, 4000);
};

const parse = <T>(key: string, text: string): CacheHit<T> | null => {
  const rec = JSON.parse(text) as Rec<T>;
  if (!rec || rec.k !== key || typeof rec.t !== 'number') return null; // other key (collision) or old format
  if (Date.now() - rec.t > CACHE_TTL_MS) return null;
  return { data: rec.d, at: rec.t };
};

/** True when an entry exists on disk for this key (cheap: no read). */
export function cacheHas(key: string): boolean {
  try { return !!fileFor(key)?.exists; } catch { return false; }
}

/** Async read (preferred: does not block the UI thread on large entries). */
export async function cacheGet<T>(key: string): Promise<CacheHit<T> | null> {
  try {
    const f = fileFor(key);
    if (!f || !f.exists) return null;
    const hit = parse<T>(key, await f.text());
    if (hit) touch(f.name);
    return hit;
  } catch { return null; }
}

/** Sync read for small entries (kept for existing callers). */
export function cacheRead<T>(key: string): T | null {
  try {
    const f = fileFor(key);
    if (!f || !f.exists) return null;
    const hit = parse<T>(key, f.textSync());
    if (hit) touch(f.name);
    return hit ? hit.data : null;
  } catch { return null; }
}

let writes = 0;
export function cacheWrite(key: string, data: unknown) {
  try {
    const f = fileFor(key);
    if (!f) return;
    const rec: Rec<unknown> = { k: key, t: Date.now(), d: data };
    if (!f.exists) f.create();
    f.write(JSON.stringify(rec));
    touch(f.name);
    if (++writes % 60 === 0) setTimeout(cachePrune, 0);
  } catch { /* cache is best-effort */ }
}

export function cacheDelete(key: string) {
  try { const f = fileFor(key); if (f?.exists) { delete lru()[f.name]; f.delete(); } } catch { /* ignore */ }
}

/** Pure LRU policy: which entries to delete given their size and last use. Exported for tests. */
export function pickEvictions(entries: { name: string; size: number; last: number }[], now: number, ttl = CACHE_TTL_MS, max = CACHE_MAX_BYTES): string[] {
  const out: string[] = [];
  const keep = entries.filter((e) => { if (now - e.last > ttl) { out.push(e.name); return false; } return true; });
  let total = keep.reduce((n, e) => n + e.size, 0);
  if (total > max) {
    keep.sort((x, y) => x.last - y.last); // least recently used first
    for (const e of keep) { if (total <= max * 0.8) break; out.push(e.name); total -= e.size; }
  }
  return out;
}

/** Delete expired entries, entries from older cache formats, and the least recently used ones above the size cap. */
export function cachePrune(): { files: number; bytes: number; removed: number } {
  const res = { files: 0, bytes: 0, removed: 0 };
  try {
    const d = getDir(); const fs = fsys();
    if (!d || !fs) return res;
    const seen = lru();
    const entries: { name: string; size: number; last: number; file: import('expo-file-system').File }[] = [];
    for (const item of d.list()) {
      if (!(item instanceof fs.File) || item.name === LRU_FILE) continue;
      if (!item.name.startsWith(PREFIX)) { try { item.delete(); res.removed++; } catch { /* ignore */ } continue; }
      entries.push({ name: item.name, size: item.size ?? 0, last: Math.max(seen[item.name] ?? 0, item.modificationTime ?? 0), file: item });
    }
    const drop = new Set(pickEvictions(entries, Date.now()));
    for (const e of entries) {
      if (drop.has(e.name)) { try { e.file.delete(); res.removed++; } catch { /* ignore */ } delete seen[e.name]; }
      else { res.files++; res.bytes += e.size; }
    }
    const names = new Set(entries.map((e) => e.name));
    for (const n of Object.keys(seen)) if (!names.has(n)) delete seen[n];
    saveLru();
  } catch { /* best-effort */ }
  return res;
}

/** Remove every cached entry (e.g. a "clear saved data" setting). */
export function cacheClear() {
  try { const d = getDir(); if (d) for (const item of d.list()) { try { item.delete(); } catch { /* ignore */ } } used = {}; } catch { /* ignore */ }
}
