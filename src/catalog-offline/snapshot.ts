// Compact offline catalog snapshot: record types, builders, gzip codec, page hashing and the local query engine.
// PURE module (no React Native / Expo imports) so plain-Node scripts and tests can load it.
import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import type { Collection, Product, SortKey, Variant } from '../shopify';

/** Variant: [numericId, title ('' for the default one), price, available 0/1, optionValues, imageIdx (-1 none), compareAt (0 none)] */
export type VRec = [string, string, number, 0 | 1, string[], number, number];
/** Product: [numericId, handle, title, vendor, productType, tags, minPrice, maxPrice, compareAtMin, available 0/1, images (CDN prefix stripped), createdAtMinutes, optionNames, variants] */
export type PRec = [string, string, string, string, string, string[], number, number, number, 0 | 1, string[], number, string[], VRec[]];
export type PageRec = { h: number; r: PRec[] };
/** Collection: [handle, title, imageRel, product indices in the collection's own order] */
export type CRec = [string, string, string, number[]];
export type Snapshot = { v: 1; lang: 'AR' | 'EN'; at: number; cur: string; cdn: string[]; pages: PageRec[]; cols: CRec[] };

export const PAGE_SIZE = 100;
export const MAX_VARIANTS = 50;

// ---------- image path compaction (shared CDN prefix stripped) ----------
const PREFIX_RE = /^(https?:\/\/[^/]+\/(?:[^?]*?\/)?(?:files|products)\/)/;
export type Cdn = { list: string[] };
/** "https://cdn.shopify.com/s/files/1/0123/files/a.jpg?v=1" -> "0a.jpg?v=1" (digit = index into the prefix table). */
export function compactImg(cdn: Cdn, url: string | null | undefined): string {
  if (!url) return '';
  const m = PREFIX_RE.exec(url);
  if (!m) return `-${url}`;
  let i = cdn.list.indexOf(m[1]);
  if (i < 0) { if (cdn.list.length >= 9) return `-${url}`; i = cdn.list.push(m[1]) - 1; }
  return `${i}${url.slice(m[1].length)}`;
}
export const fullImg = (cdn: string[], rel: string): string => !rel ? '' : rel[0] === '-' ? rel.slice(1) : (cdn[Number(rel[0])] ?? '') + rel.slice(1);
/** Image identity for dedupe: the file path without the "?v=" cache-buster. */
export const imgKey = (rel: string): string => { const q = rel.indexOf('?'); return q < 0 ? rel : rel.slice(0, q); };

// ---------- building records from Storefront nodes ----------
export type RawNode = {
  id: string; handle: string; title: string; vendor: string; productType: string; tags: string[]; availableForSale: boolean; createdAt?: string;
  featuredImage?: { url: string } | null;
  priceRange: { minVariantPrice: { amount: string; currencyCode?: string }; maxVariantPrice: { amount: string } };
  compareAtPriceRange?: { minVariantPrice: { amount: string } } | null;
  options: { name: string }[];
  variants: { nodes: { id: string; title: string; availableForSale: boolean; price: { amount: string }; compareAtPrice?: { amount: string } | null; selectedOptions: { value: string }[]; image?: { url: string } | null }[] };
};
const tail = (gid: string) => gid.slice(gid.lastIndexOf('/') + 1);
const num = (s: string | undefined | null) => (s ? Number(s) || 0 : 0);

export function toRec(cdn: Cdn, n: RawNode): PRec {
  const imgs: string[] = [];
  const idx = (url: string | null | undefined): number => {
    if (!url) return -1;
    const rel = compactImg(cdn, url);
    let i = imgs.indexOf(rel);
    if (i < 0) { if (imgs.length >= 6) return -1; i = imgs.push(rel) - 1; }
    return i;
  };
  idx(n.featuredImage?.url); // featured image is always index 0
  const vs: VRec[] = n.variants.nodes.slice(0, MAX_VARIANTS).map((v) => [
    tail(v.id), v.title === 'Default Title' ? '' : v.title, num(v.price.amount), v.availableForSale ? 1 : 0,
    v.selectedOptions.map((o) => o.value), idx(v.image?.url), num(v.compareAtPrice?.amount),
  ]);
  return [
    tail(n.id), n.handle, n.title, n.vendor, n.productType, n.tags,
    num(n.priceRange.minVariantPrice.amount), num(n.priceRange.maxVariantPrice.amount), num(n.compareAtPriceRange?.minVariantPrice.amount),
    n.availableForSale ? 1 : 0, imgs, n.createdAt ? Math.floor(Date.parse(n.createdAt) / 60000) || 0 : 0,
    n.options.map((o) => o.name).filter((x) => x !== 'Title'), vs,
  ];
}

/** Cheap 32-bit hash of a page's records; equal hash = unchanged page (no updatedAt filter exists in the Storefront API). */
export function pageHash(recs: PRec[]): number {
  const s = JSON.stringify(recs);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

// ---------- codec ----------
export const encode = (s: Snapshot): Uint8Array => gzipSync(strToU8(JSON.stringify(s)), { level: 9, mem: 12 });
export function decode(bytes: Uint8Array): Snapshot | null {
  try { const s = JSON.parse(strFromU8(gunzipSync(bytes))) as Snapshot; return s && s.v === 1 && Array.isArray(s.pages) ? s : null; } catch { return null; }
}

// ---------- loaded (indexed) snapshot ----------
export type Loaded = {
  snap: Snapshot; recs: PRec[]; byHandle: Map<string, number>; hay: string[]; cols: Map<string, { title: string; img: string; items: number[] }>;
  currency: string;
};
const CUR = 'SAR';
export const norm = (s: string): string => s.toLowerCase()
  .replace(/[ً-ٰٟـ‎‏]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));

export function load(snap: Snapshot, currency = CUR): Loaded {
  const recs: PRec[] = [];
  const byHandle = new Map<string, number>();
  for (const pg of snap.pages) for (const r of pg.r) { if (byHandle.has(r[1])) continue; byHandle.set(r[1], recs.length); recs.push(r); }
  const hay = recs.map((r) => norm(`${r[2]} ${r[3]} ${r[4]} ${r[5].join(' ')} ${r[13].map((v) => v[1]).join(' ')} ${r[1].replace(/-/g, ' ')}`));
  const cols = new Map<string, { title: string; img: string; items: number[] }>();
  for (const c of snap.cols) cols.set(c[0], { title: c[1], img: c[2], items: c[3] });
  return { snap, recs, byHandle, hay, cols, currency };
}

export type ImgResolver = (fullUrl: string) => string;
const money = (n: number, cur: string) => ({ amount: Number.isInteger(n) ? n.toFixed(1) : String(n), currencyCode: cur });
export function toProduct(L: Loaded, i: number, resolve: ImgResolver = (u) => u): Product {
  const r = L.recs[i]; const cdn = L.snap.cdn; const cur = L.currency;
  const imgs = r[10].map((rel) => ({ url: resolve(fullImg(cdn, rel)) }));
  const names = r[12];
  const variants: Variant[] = r[13].map((v) => ({
    id: `gid://shopify/ProductVariant/${v[0]}`, title: v[1] || 'Default Title', availableForSale: v[3] === 1,
    price: money(v[2], cur), compareAtPrice: v[6] ? money(v[6], cur) : null,
    selectedOptions: v[4].map((value, k) => ({ name: names[k] ?? 'Title', value })),
    image: v[5] >= 0 && imgs[v[5]] ? { url: imgs[v[5]].url } : null,
  }));
  const options = names.map((name, k) => ({ name, values: [...new Set(r[13].map((v) => v[4][k]).filter((x): x is string => !!x))] }));
  return {
    id: `gid://shopify/Product/${r[0]}`, handle: r[1], title: r[2], vendor: r[3], productType: r[4], tags: r[5], availableForSale: r[9] === 1, description: '',
    featuredImage: imgs[0] ? { url: imgs[0].url } : null, images: imgs.slice(0, 1),
    priceRange: { minVariantPrice: money(r[6], cur), maxVariantPrice: money(r[7], cur) },
    compareAtPriceRange: { minVariantPrice: money(r[8], cur) },
    options, variants,
  };
}

// ---------- Shopify search syntax (the subset the app uses) ----------
type Node = { k: 'and' | 'or'; a: Node[] } | { k: 'not'; n: Node } | { k: 'term'; field: string; op: string; val: string; wild: boolean };
const FIELDS = new Set(['title', 'vendor', 'product_type', 'tag', 'tag_not', 'available_for_sale', 'variants.price', 'price', 'handle', 'id', 'sku']);

function tokenize(q: string): string[] { return q.match(/\(|\)|(?:[^\s()":]+:)?(?:[<>]=?|=)?"[^"]*"|[^\s()]+/g) ?? []; }

export function parseQuery(q: string): Node | null {
  const t = tokenize(q); let i = 0;
  const or = (): Node | null => {
    const parts: Node[] = []; const first = and(); if (first) parts.push(first);
    while (t[i] === 'OR') { i++; const n = and(); if (n) parts.push(n); }
    return parts.length === 0 ? null : parts.length === 1 ? parts[0] : { k: 'or', a: parts };
  };
  const and = (): Node | null => {
    const parts: Node[] = [];
    while (i < t.length && t[i] !== 'OR' && t[i] !== ')') {
      if (t[i] === 'AND') { i++; continue; }
      const n = not(); if (n) parts.push(n); else break;
    }
    return parts.length === 0 ? null : parts.length === 1 ? parts[0] : { k: 'and', a: parts };
  };
  const not = (): Node | null => {
    if (t[i] === 'NOT') { i++; const n = atom(); return n ? { k: 'not', n } : null; }
    if (t[i]?.startsWith('-') && t[i].length > 1) { t[i] = t[i].slice(1); const n = atom(); return n ? { k: 'not', n } : null; }
    return atom();
  };
  const atom = (): Node | null => {
    const x = t[i];
    if (x === undefined) return null;
    if (x === '(') { i++; const n = or(); if (t[i] === ')') i++; return n; }
    i++;
    const c = x.indexOf(':');
    let field = '', val = x;
    if (c > 0 && FIELDS.has(x.slice(0, c).toLowerCase())) { field = x.slice(0, c).toLowerCase(); val = x.slice(c + 1); }
    let op = '';
    const m = /^(>=|<=|>|<|=)/.exec(val); if (m) { op = m[1]; val = val.slice(op.length); }
    val = val.replace(/^"|"$/g, '');
    const wild = val.endsWith('*'); if (wild) val = val.slice(0, -1);
    return { k: 'term', field, op, val, wild };
  };
  const root = or();
  return root;
}

function cmp(n: number, op: string, v: number) {
  switch (op) { case '>=': return n >= v; case '<=': return n <= v; case '>': return n > v; case '<': return n < v; default: return n === v; }
}

export function evalNode(L: Loaded, i: number, node: Node): boolean {
  switch (node.k) {
    case 'and': return node.a.every((n) => evalNode(L, i, n));
    case 'or': return node.a.some((n) => evalNode(L, i, n));
    case 'not': return !evalNode(L, i, node.n);
    default: {
      const r = L.recs[i]; const v = norm(node.val); const eq = (s: string) => { const x = norm(s); return node.wild ? x.startsWith(v) : x === v; };
      switch (node.field) {
        case 'title': return norm(r[2]).includes(v);
        case 'vendor': return norm(r[3]).startsWith(v) || (!node.wild && norm(r[3]).includes(v));
        case 'product_type': return eq(r[4]);
        case 'tag': return r[5].some(eq);
        case 'tag_not': return !r[5].some(eq);
        case 'available_for_sale': return (node.val.toLowerCase() === 'true') === (r[9] === 1);
        case 'variants.price': case 'price': { const p = Number(node.val); return r[13].length ? r[13].some((x) => cmp(x[2], node.op, p)) : cmp(r[6], node.op, p); }
        case 'handle': return r[1] === node.val;
        case 'id': return r[0] === node.val;
        case 'sku': return false;
        default: return L.hay[i].includes(v);
      }
    }
  }
}

// ---------- queries ----------
export type Page = { products: Product[]; hasNext: boolean; cursor: string | null };
/** Cursor format of the local engine: "o:<offset>". Network cursors never start with "o:". */
export const isLocalCursor = (c: string | null | undefined): c is string => !!c && c.startsWith('o:');
const offsetOf = (c: string | null | undefined) => (isLocalCursor(c) ? Number(c.slice(2)) || 0 : 0);

function paginate(L: Loaded, idx: number[], first: number, after: string | null | undefined, resolve?: ImgResolver): Page {
  const o = offsetOf(after);
  const slice = idx.slice(o, o + first);
  const next = o + slice.length;
  return { products: slice.map((i) => toProduct(L, i, resolve)), hasNext: next < idx.length, cursor: next < idx.length ? `o:${next}` : null };
}

export function matchIndices(L: Loaded, query?: string, universe?: number[]): number[] {
  const all = universe ?? L.recs.map((_, i) => i);
  const ast = query && query.trim() ? parseQuery(query) : null;
  return ast ? all.filter((i) => evalNode(L, i, ast)) : all;
}

export function queryProducts(L: Loaded, o: { query?: string; first?: number; after?: string | null; sort?: SortKey; reverse?: boolean; offset?: number }, resolve?: ImgResolver): Page {
  let idx = matchIndices(L, o.query);
  const sort = o.sort ?? 'BEST_SELLING';
  if (sort === 'PRICE') idx = [...idx].sort((a, b) => L.recs[a][6] - L.recs[b][6] || a - b);
  else if (sort === 'CREATED_AT') idx = [...idx].sort((a, b) => L.recs[a][11] - L.recs[b][11] || b - a); // oldest first, like Shopify ascending
  else if (o.query && o.query.trim()) {
    // free-text relevance: title hits first, snapshot (best-selling) order otherwise
    const words = norm(o.query).replace(/\b(and|or|not)\b|[a-z_.]+:\S*|[()"]/g, ' ').split(/\s+/).filter(Boolean);
    if (words.length) { const hit = (i: number) => (words.every((w) => norm(L.recs[i][2]).includes(w)) ? 0 : 1); idx = idx.map((i) => [hit(i), i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[1]); }
  }
  if (o.reverse) idx = [...idx].reverse();
  const after = o.after ?? (o.offset ? `o:${o.offset}` : null);
  return paginate(L, idx, o.first ?? 20, after, resolve);
}

/** Members of a collection (available only, as the website and fetchCollectionProducts show them), in the collection's own order. */
export function collectionProducts(L: Loaded, handle: string, o: { first?: number; after?: string | null; offset?: number }, resolve?: ImgResolver): Page | null {
  const c = L.cols.get(handle);
  if (!c) return null;
  const idx = c.items.filter((i) => L.recs[i] && L.recs[i][9] === 1);
  return paginate(L, idx, o.first ?? 20, o.after ?? (o.offset ? `o:${o.offset}` : null), resolve);
}

export function listCollections(L: Loaded, cdnResolve: ImgResolver = (u) => u): Collection[] {
  return [...L.cols.entries()].map(([handle, c]) => ({ id: `offline:${handle}`, handle, title: c.title, image: c.img ? { url: cdnResolve(fullImg(L.snap.cdn, c.img)) } : null }));
}
