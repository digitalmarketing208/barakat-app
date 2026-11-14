// Offline serving of the catalog snapshot (used by shopify.ts when the network is down or the disk cache misses).
// Loads lazily; no React Native import at module load (plain-Node tests import shopify.ts).
import type { Collection, Product, SortKey } from '../shopify';
import { Loaded, Page, Snapshot, collectionProducts, decode, encode, listCollections, load, queryProducts, toProduct, fullImg } from './snapshot';
import { fileSize, readBytes, removeFile, writeBytes } from './fs';

const DIR = 'catalog';
type L = 'AR' | 'EN';
export const fileOf = (lang: L) => `catalog_${lang.toLowerCase()}.bin`;

const cache: { AR?: Loaded | null; EN?: Loaded | null } = {};
const pending: { AR?: Promise<Loaded | null>; EN?: Promise<Loaded | null> } = {};
const subs = new Set<() => void>();
export const subscribeSnapshots = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };

const thumbs = (): typeof import('./images') | null => { try { return require('./images') as typeof import('./images'); } catch { return null; } };
const resolve = (u: string) => thumbs()?.localThumb(u) ?? u;

/** Load (once) the snapshot of a language from disk. */
export function loadSnapshot(lang: L): Promise<Loaded | null> {
  if (cache[lang] !== undefined) return Promise.resolve(cache[lang]!);
  return (pending[lang] ??= (async () => {
    try { await thumbs()?.initThumbs(); } catch { /* thumbnails are optional */ }
    const bytes = await readBytes(DIR, fileOf(lang));
    const snap = bytes ? decode(bytes) : null;
    return (cache[lang] = snap ? load(snap) : null);
  })().finally(() => { delete pending[lang]; }));
}

/** The snapshot for `lang`, or the other language's when only that one is saved (better than an empty screen offline). */
export async function bestSnapshot(lang: L): Promise<Loaded | null> {
  return (await loadSnapshot(lang)) ?? (await loadSnapshot(lang === 'AR' ? 'EN' : 'AR'));
}
export const snapshotInfo = (lang: L) => { const c = cache[lang]; return c ? { at: c.snap.at, count: c.recs.length } : null; };
export const peek = (lang: L): Loaded | null => cache[lang] ?? null;

export function saveSnapshot(snap: Snapshot): number {
  const bytes = encode(snap);
  if (!writeBytes(DIR, fileOf(snap.lang), bytes)) return 0;
  cache[snap.lang] = load(snap);
  subs.forEach((f) => { try { f(); } catch { /* ignore */ } });
  return bytes.length;
}
export function deleteSnapshots() {
  for (const l of ['AR', 'EN'] as L[]) { removeFile(DIR, fileOf(l)); removeFile(DIR, `${fileOf(l)}.part`); cache[l] = null; }
  subs.forEach((f) => { try { f(); } catch { /* ignore */ } });
}
export const snapshotBytes = () => fileSize(DIR, fileOf('AR')) + fileSize(DIR, fileOf('EN')) + fileSize(DIR, `${fileOf('AR')}.part`) + fileSize(DIR, `${fileOf('EN')}.part`);
export const partName = (lang: L) => `${fileOf(lang)}.part`;
export const DIR_NAME = DIR;
export { isLocalCursor } from './snapshot';

// ---- fallbacks used by shopify.ts ----
export async function localProducts(lang: L, o: { query?: string; first?: number; after?: string | null; sort?: SortKey; reverse?: boolean; offset?: number }): Promise<Page | null> {
  const s = await bestSnapshot(lang); return s ? queryProducts(s, o, resolve) : null;
}
export async function localCollectionProducts(lang: L, handle: string, o: { first?: number; after?: string | null; offset?: number }): Promise<Page | null> {
  const s = await bestSnapshot(lang); return s ? collectionProducts(s, handle, o, resolve) : null;
}
export async function localCollections(lang: L): Promise<Collection[] | null> {
  const s = await bestSnapshot(lang); return s ? listCollections(s, resolve) : null;
}
/** A partial product (no description, one image, up to 50 variants) good enough to open the product page and add to cart offline. */
export async function localProduct(lang: L, handle: string): Promise<Product | null> {
  const s = await bestSnapshot(lang); const i = s?.byHandle.get(handle);
  return s && i !== undefined ? toProduct(s, i, resolve) : null;
}
/** Local thumbnail file for a product handle, or null (sync; needs the snapshot loaded, which happens on first offline read or sync). */
export function getOfflineImageUri(handle: string): string | null {
  const s = cache.AR ?? cache.EN; const i = s?.byHandle.get(handle);
  if (!s || i === undefined) return null;
  const rel = s.recs[i][10][0]; return rel ? thumbs()?.localThumb(fullImg(s.snap.cdn, rel)) ?? null : null;
}
