// One small WebP thumbnail per product (card image), in a size-capped LRU directory; never originals, identical URLs deduped.
import { docDir, fsys, readBytes, removeFile, storage, writeBytes } from './fs';
import { compactImg, imgKey } from './snapshot';
import { sized } from '../shopify';
import { isOffline, netState } from '../net/status';

/** Thumbnail width requested from the Shopify CDN (webp). ~4-10 KB each. */
export const THUMB_WIDTH = 240;
/** Default size cap of the thumbnail directory (MB). The user can change it in OfflineCatalogCard (CAP_CHOICES_MB). */
export const DEFAULT_CAP_MB = 60;
export const CAP_CHOICES_MB = [30, 60, 120, 250] as const;
/** Gallery images (product page) live in expo-image's own disk cache, filled on first view only; its size is managed by the OS/Coil/SDWebImage and cannot be capped from JS. */
const DIR = 'thumbs';
const IDX = '_idx.json';

type Ent = { s: number; t: number };
let idx: Map<string, Ent> | null = null;
let capBytes = DEFAULT_CAP_MB * 1048576;
let timer: ReturnType<typeof setTimeout> | null = null;
let ready: Promise<void> | null = null;
let baseUri = '';
const subs = new Set<() => void>();
export const subscribeThumbs = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
const emit = () => subs.forEach((f) => { try { f(); } catch { /* ignore */ } });

/** Stable file name for an image: hash of its CDN path (without ?v=), so the same picture is stored once. */
export function thumbName(rel: string): string {
  const s = imgKey(rel).slice(1); // first char = CDN prefix index; the path after the prefix identifies the picture
  let a = 5381, b = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = ((a * 33) ^ c) >>> 0; b = Math.imul(b ^ c, 0x01000193) >>> 0; }
  return `${a.toString(36)}${b.toString(36)}.webp`;
}
export const thumbSource = (fullUrl: string) => fullUrl + (fullUrl.includes('?') ? '&' : '?') + `width=${THUMB_WIDTH}&format=webp`;

/** Load the index once. Safe to call repeatedly. */
export function initThumbs(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    idx = new Map();
    try {
      const d = docDir(DIR); if (!d) return;
      baseUri = d.uri.endsWith('/') ? d.uri : `${d.uri}/`;
      const raw = await readBytes(DIR, IDX);
      if (raw) { const o = JSON.parse(new TextDecoder().decode(raw)) as { c?: number; e: Record<string, [number, number]> }; for (const [k, v] of Object.entries(o.e)) idx.set(k, { s: v[0], t: v[1] }); }
      const st = storage(); const c = st ? Number(await st.getItem('offcat:capMB')) : 0;
      if (c > 0) capBytes = c * 1048576;
    } catch { /* start empty */ }
    emit();
  })();
  return ready;
}
const save = () => {
  timer = null;
  if (!idx) return;
  const e: Record<string, [number, number]> = {};
  idx.forEach((v, k) => { e[k] = [v.s, v.t]; });
  writeBytes(DIR, IDX, new TextEncoder().encode(JSON.stringify({ e })));
};
const later = () => { if (!timer) timer = setTimeout(save, 5000); };

export const thumbBytes = () => { let n = 0; idx?.forEach((v) => { n += v.s; }); return n; };
export const thumbCount = () => idx?.size ?? 0;
export const capBytesNow = () => capBytes;
export const hasThumb = (name: string) => !!idx?.has(name);

export async function setCapMB(mb: number) {
  capBytes = mb * 1048576;
  try { await storage()?.setItem('offcat:capMB', String(mb)); } catch { /* ignore */ }
  evictToCap(); emit();
}

/** Delete least-recently-used thumbnails until the directory is at most 80% of the cap. */
export function evictToCap(keep?: Set<string>) {
  if (!idx) return;
  let total = thumbBytes();
  if (total <= capBytes) return;
  const order = [...idx.entries()].filter(([k]) => !keep?.has(k)).sort((x, y) => x[1].t - y[1].t);
  for (const [k, v] of order) { if (total <= capBytes * 0.8) break; removeFile(DIR, k); idx.delete(k); total -= v.s; }
  later();
}

/** Remove thumbnails no snapshot references any more. */
export function dropOrphans(live: Set<string>) {
  if (!idx) return;
  for (const k of [...idx.keys()]) if (!live.has(k)) { removeFile(DIR, k); idx.delete(k); }
  later();
}

/** Download one thumbnail (no-op when present). Returns bytes added, or -1 when the cap is reached / the download failed. */
export async function fetchThumb(fullUrl: string, rel: string): Promise<number> {
  await initThumbs();
  const fs = fsys(); const d = docDir(DIR);
  if (!fs || !d || !idx) return -1;
  const name = thumbName(rel);
  if (idx.has(name)) return 0;
  if (thumbBytes() >= capBytes) return -1;
  try {
    const f = new fs.File(d, name);
    await fs.File.downloadFileAsync(thumbSource(fullUrl), f, { idempotent: true, headers: { Accept: 'image/webp,image/*;q=0.8' } });
    const s = f.size ?? 0;
    if (s < 200) { removeFile(DIR, name); return -1; } // empty / error body
    idx.set(name, { s, t: Date.now() });
    later();
    return s;
  } catch { removeFile(DIR, name); return -1; }
}

/** Local file URI of this image's thumbnail, or null. Marks it as recently used (LRU). */
export function localThumb(fullUrl: string | null | undefined): string | null {
  if (!fullUrl || !idx || !baseUri) return null;
  const e = idx.get(thumbName(compactImg({ list: [] }, fullUrl)));
  if (!e) return null;
  e.t = Date.now(); later();
  return baseUri + name;
}

/**
 * Drop-in for `sized(url, w)`: the local thumbnail when one is saved and good enough (small slot, or no connection), else the network URL.
 * Screens call it where they show product/collection pictures: `offlineSized(p.featuredImage?.url, 480)`.
 */
export function offlineSized(url: string | null | undefined, w: number): string | undefined {
  if (!url) return undefined;
  const local = (w <= THUMB_WIDTH * 1.5 || isOffline() || netState().limited) ? localThumb(url) : null;
  return local ?? sized(url, w);
}


export async function clearThumbs() {
  await initThumbs();
  const d = docDir(DIR);
  if (d) for (const it of d.list()) { try { it.delete(); } catch { /* ignore */ } }
  idx?.clear(); emit();
}
/** Also empties expo-image's own disk cache (gallery images seen on product pages). */
export const clearGalleryCache = (): Promise<boolean> => {
  try { return (require('expo-image') as typeof import('expo-image')).Image.clearDiskCache().catch(() => false); } catch { return Promise.resolve(false); }
};
