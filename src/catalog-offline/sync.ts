// Offline catalog sync: initial download (Wi-Fi only, and while charging when expo-battery is installed), resumable, delta refresh, 24h throttle.
import { useSyncExternalStore } from 'react';
import { gql } from '../shopify';
import { isWifi, waitFor } from '../net/status';
import { storage, readBytes, removeFile, writeBytes } from './fs';
import { Cdn, PAGE_SIZE, PageRec, RawNode, Snapshot, compactImg, decode, encode, fullImg, pageHash, toRec } from './snapshot';
import { DIR_NAME, deleteSnapshots, loadSnapshot, partName, saveSnapshot, snapshotBytes } from './local';
import { CAP_CHOICES_MB, DEFAULT_CAP_MB, capBytesNow, clearGalleryCache, clearThumbs, dropOrphans, evictToCap, fetchThumb, hasThumb, initThumbs, setCapMB, thumbBytes, thumbName } from './images';

/** Minimum time between automatic syncs. */
export const SYNC_MIN_GAP_MS = 24 * 3600 * 1000;
const EST_PRODUCTS = 2900;
type L = 'AR' | 'EN';
export type SyncStatus = 'off' | 'idle' | 'waiting' | 'downloading' | 'images' | 'done' | 'error';
export type SyncState = {
  status: SyncStatus; progress: number; sizeBytes: number; lastSync: number | null;
  enabled: boolean; capMB: number; /** why it is waiting */ waitingFor: 'wifi' | 'charging' | null; error: string | null; products: number;
};
export { CAP_CHOICES_MB, DEFAULT_CAP_MB };

let state: SyncState = { status: 'off', progress: 0, sizeBytes: 0, lastSync: null, enabled: false, capMB: DEFAULT_CAP_MB, waitingFor: null, error: null, products: 0 };
const subs = new Set<() => void>();
const set = (p: Partial<SyncState>) => { state = { ...state, ...p }; subs.forEach((f) => { try { f(); } catch { /* ignore */ } }); };
export const getSyncState = () => state;
export const subscribeSync = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };

type Saved = { enabled: boolean; last: { AR?: number; EN?: number } };
let saved: Saved = { enabled: false, last: {} };
let hydrated: Promise<void> | null = null;
const persist = async () => { try { await storage()?.setItem('offcat:v1', JSON.stringify(saved)); } catch { /* ignore */ } };
const refreshSize = () => set({ sizeBytes: snapshotBytes() + thumbBytes() });

export function hydrateSync(): Promise<void> {
  return (hydrated ??= (async () => {
    try { const raw = await storage()?.getItem('offcat:v1'); if (raw) saved = { enabled: false, last: {}, ...JSON.parse(raw) }; } catch { /* defaults */ }
    await initThumbs();
    const last = Math.min(saved.last.AR ?? Infinity, saved.last.EN ?? Infinity);
    set({ enabled: saved.enabled, status: saved.enabled ? 'idle' : 'off', lastSync: isFinite(last) ? last : (saved.last.AR ?? saved.last.EN ?? null), capMB: Math.round(capBytesNow() / 1048576) });
    refreshSize();
  })());
}

// ---- charger gate (optional): install expo-battery, then call setChargingProbe(async () => (await getBatteryStateAsync()) is CHARGING/FULL) once at boot ----
let probe: (() => Promise<boolean | null>) | null = null;
export const setChargingProbe = (fn: (() => Promise<boolean | null>) | null) => { probe = fn; };
const charging = async (): Promise<boolean | null> => { try { return probe ? await probe() : null; } catch { return null; } };

let run: { cancelled: boolean } | null = null;
export const stopCatalogSync = () => { if (run) run.cancelled = true; run = null; };
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const PRODUCTS_Q = `query SnapProducts($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: BEST_SELLING) { nodes {
    id handle title vendor productType tags availableForSale createdAt featuredImage { url }
    priceRange { minVariantPrice { amount currencyCode } maxVariantPrice { amount } } compareAtPriceRange { minVariantPrice { amount } }
    options { name } variants(first: 50) { nodes { id title availableForSale price { amount } compareAtPrice { amount } selectedOptions { value } image { url } } } }
    pageInfo { hasNextPage endCursor } } }`;
const COLS_Q = `query SnapCols($first: Int!, $after: String) { collections(first: $first, after: $after) { nodes { handle title image { url } } pageInfo { hasNextPage endCursor } } }`;
const MEMBERS_Q = `query SnapMembers($handle: String!, $first: Int!, $after: String) { collection(handle: $handle) { products(first: $first, after: $after) { nodes { handle } pageInfo { hasNextPage endCursor } } } }`;

type PageRes = { products: { nodes: RawNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } };
async function retry<T>(fn: () => Promise<T>, tok: { cancelled: boolean }): Promise<T> {
  let err: unknown;
  for (let i = 0; i < 4; i++) {
    if (tok.cancelled) throw new Error('cancelled');
    try { return await fn(); } catch (e) { err = e; await waitFor(() => isWifi(), tok); await pause(800 * (i + 1)); }
  }
  throw err;
}

/** One language: delta-aware download. Returns whether anything changed. */
async function syncLang(lang: L, tok: { cancelled: boolean }, base: number, span: number, force: boolean): Promise<boolean> {
  const old = await loadSnapshot(lang);
  const cdn: Cdn = { list: old ? [...old.snap.cdn] : [] };
  let cursor: string | null = null;
  let pages: PageRec[] = [];
  // Resume an interrupted first download.
  if (!old) {
    const part = await readBytes(DIR_NAME, partName(lang));
    const p = part ? decode(part) : null;
    if (p && p.cur) { pages = p.pages; cursor = p.cur; cdn.list = [...p.cdn]; }
  }
  let changed = 0; let i = pages.length;
  for (;;) {
    await waitFor(() => isWifi(), tok);
    if (tok.cancelled) throw new Error('cancelled');
    const res = await retry(() => gql<PageRes>(PRODUCTS_Q, { first: PAGE_SIZE, after: cursor }, lang, { cache: 'none' }), tok);
    const recs = res.products.nodes.map((n) => toRec(cdn, n));
    const h = pageHash(recs);
    const prev = old?.snap.pages[i];
    if (prev && prev.h === h) pages.push(prev); // unchanged page: keep the old record, no re-processing
    else { pages.push({ h, r: recs }); changed++; }
    i++;
    const more = res.products.pageInfo.hasNextPage;
    cursor = res.products.pageInfo.endCursor;
    set({ status: 'downloading', progress: base + span * 0.7 * Math.min(0.98, (i * PAGE_SIZE) / Math.max(old?.recs.length ?? EST_PRODUCTS, i * PAGE_SIZE)), products: i * PAGE_SIZE });
    if (!more) break;
    if (!old && i % 5 === 0) writeBytes(DIR_NAME, partName(lang), encode({ v: 1, lang, at: 0, cur: cursor ?? '', cdn: cdn.list, pages, cols: [] }));
    await pause(60);
  }
  if (old && old.snap.pages.length !== pages.length) changed++;

  // Collections (handle-only membership), then index arrays.
  const byHandle = new Map<string, number>(); let n = 0;
  for (const pg of pages) for (const r of pg.r) if (!byHandle.has(r[1])) byHandle.set(r[1], n++);
  const cols: Snapshot['cols'] = [];
  let after: string | null = null;
  const heads: { handle: string; title: string; img: string }[] = [];
  for (;;) {
    const r = await retry(() => gql<{ collections: { nodes: { handle: string; title: string; image?: { url: string } | null }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }>(COLS_Q, { first: 100, after }, lang, { cache: 'none' }), tok);
    for (const c of r.collections.nodes) heads.push({ handle: c.handle, title: c.title, img: compactImg(cdn, c.image?.url) });
    if (!r.collections.pageInfo.hasNextPage) break;
    after = r.collections.pageInfo.endCursor;
  }
  let k = 0;
  for (const c of heads) {
    const items: number[] = []; let a: string | null = null;
    for (;;) {
      await waitFor(() => isWifi(), tok);
      const r = await retry(() => gql<{ collection: { products: { nodes: { handle: string }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null }>(MEMBERS_Q, { handle: c.handle, first: 250, after: a }, 'EN', { cache: 'none' }), tok);
      if (!r.collection) break;
      for (const m of r.collection.products.nodes) { const ix = byHandle.get(m.handle); if (ix !== undefined) items.push(ix); }
      if (!r.collection.products.pageInfo.hasNextPage) break;
      a = r.collection.products.pageInfo.endCursor;
    }
    if (items.length) cols.push([c.handle, c.title, c.img, items]);
    set({ progress: base + span * (0.7 + 0.1 * (++k / heads.length)) });
    await pause(40);
  }
  const colsSame = !!old && JSON.stringify(old.snap.cols) === JSON.stringify(cols);
  if (!old || changed > 0 || !colsSame || force) {
    saveSnapshot({ v: 1, lang, at: Date.now(), cur: '', cdn: cdn.list, pages, cols });
    removeFile(DIR_NAME, partName(lang));
    return true;
  }
  return false;
}

/** Download one thumbnail per product (missing ones only), best-selling first, 4 at a time, until done or the cap is reached. */
async function syncImages(tok: { cancelled: boolean }, base: number, span: number) {
  await initThumbs();
  const lang: L = (await loadSnapshot('EN')) ? 'EN' : 'AR';
  const L = await loadSnapshot(lang); if (!L) return;
  const seen = new Set<string>(); const todo: { url: string; rel: string; name: string }[] = [];
  for (const r of L.recs) { const rel = r[10][0]; if (!rel) continue; const name = thumbName(rel); if (seen.has(name)) continue; seen.add(name); todo.push({ url: fullImg(L.snap.cdn, rel), rel, name }); }
  const missing = todo.filter((t) => !hasThumb(t.name));
  let done = todo.length - missing.length; let capped = false;
  for (let i = 0; i < missing.length && !capped; i += 4) {
    await waitFor(() => isWifi(), tok);
    if (tok.cancelled) throw new Error('cancelled');
    const res = await Promise.all(missing.slice(i, i + 4).map((t) => fetchThumb(t.url, t.rel)));
    if (res.some((x) => x < 0) && thumbBytes() >= capBytesNow()) capped = true;
    done += res.filter((x) => x >= 0).length;
    set({ status: 'images', progress: base + span * Math.min(1, done / Math.max(1, todo.length)), sizeBytes: snapshotBytes() + thumbBytes() });
    await pause(30);
  }
  dropOrphans(seen);
  evictToCap(seen);
}

/**
 * Sync now. Throttled to once per 24h unless `force`. Waits for Wi-Fi; the very first download also waits for the charger
 * (only when expo-battery is installed) unless `force`. Safe to call repeatedly; a running sync is never duplicated.
 */
export async function syncCatalog(lang: L, opts: { force?: boolean } = {}) {
  await hydrateSync();
  if (!state.enabled && !opts.force) return;
  if (run) return;
  if (!opts.force && state.lastSync && Date.now() - state.lastSync < SYNC_MIN_GAP_MS && (await loadSnapshot(lang))) return;
  const tok = { cancelled: false }; run = tok;
  try {
    set({ error: null, status: 'waiting', waitingFor: isWifi() ? null : 'wifi', progress: 0 });
    await waitFor(() => isWifi(), tok);
    const first = !(await loadSnapshot(lang));
    if (first && !opts.force) {
      while ((await charging()) === false) { set({ waitingFor: 'charging' }); if (tok.cancelled) throw new Error('cancelled'); await pause(30000); }
    }
    set({ waitingFor: null, status: 'downloading' });
    const other: L = lang === 'AR' ? 'EN' : 'AR';
    await syncLang(lang, tok, 0, 0.4, !!opts.force);
    await syncLang(other, tok, 0.4, 0.2, false); // second language so switching language offline works
    await syncImages(tok, 0.6, 0.4);
    const now = Date.now(); saved.last = { AR: now, EN: now }; await persist();
    set({ status: 'done', progress: 1, lastSync: now, waitingFor: null });
  } catch (e) {
    const cancelled = e instanceof Error && e.message === 'cancelled';
    set({ status: cancelled ? 'idle' : 'error', error: cancelled ? null : (e instanceof Error ? e.message : 'failed'), waitingFor: null });
  } finally { if (run === tok) run = null; refreshSize(); }
}

export async function setOfflineEnabled(on: boolean, lang: L) {
  await hydrateSync();
  saved.enabled = on; await persist();
  if (on) { set({ enabled: true, status: 'idle' }); syncCatalog(lang, { force: true }).catch(() => {}); }
  else { stopCatalogSync(); set({ enabled: false, status: 'off', progress: 0, waitingFor: null }); }
}
/** Delete the snapshot, thumbnails and the gallery image cache, and switch the feature off. */
export async function clearOfflineData() {
  stopCatalogSync(); saved = { enabled: false, last: {} }; await persist();
  deleteSnapshots(); await clearThumbs(); await clearGalleryCache();
  set({ enabled: false, status: 'off', progress: 0, lastSync: null, sizeBytes: 0, products: 0, error: null, waitingFor: null });
}
export async function setStorageCapMB(mb: number) { await hydrateSync(); await setCapMB(mb); set({ capMB: mb }); refreshSize(); }

/** Boot hook: refresh in the background when the feature is on (throttled). */
export function autoSyncCatalog(lang: L) { hydrateSync().then(() => { if (state.enabled) syncCatalog(lang).catch(() => {}); }).catch(() => {}); }

/** { status, progress (0..1), sizeBytes, lastSync } plus the controls used by OfflineCatalogCard. */
export function useCatalogSync() {
  const s = useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
  hydrateSync().catch(() => {});
  return s;
}
