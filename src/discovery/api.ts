import { SHOPIFY } from '../config';
import { Product, Variant, fetchProducts, gql } from '../shopify';

type L = 'AR' | 'EN';
const CARD = `
  id handle title vendor productType tags availableForSale
  featuredImage { url altText }
  priceRange { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
  compareAtPriceRange { minVariantPrice { amount currencyCode } }
  options { name values }
  variants(first: 6) { nodes { id title availableForSale price { amount currencyCode } compareAtPrice { amount currencyCode } selectedOptions { name value } } }`;
type RawCard = Omit<Product, 'images' | 'variants' | 'description'> & { variants: { nodes: Variant[] } };
const shape = (p: RawCard): Product => ({ ...p, description: '', images: p.featuredImage ? [p.featuredImage] : [], variants: p.variants.nodes });

export type Suggest = { queries: string[]; collections: { handle: string; title: string }[]; products: Product[] };
const EMPTY: Suggest = { queries: [], collections: [], products: [] };

const SUGGEST = `query Suggest($q: String!, $language: LanguageCode) @inContext(language: $language) {
  predictiveSearch(query: $q, limit: 6, limitScope: EACH, types: [PRODUCT, COLLECTION, QUERY], unavailableProducts: LAST) {
    queries { text }
    collections { handle title }
    products { ${CARD} }
  } }`;

// Small in-memory cache: typing "ray", deleting a letter and typing it again costs no request.
const cache = new Map<string, Suggest>();
const remember = (k: string, v: Suggest) => { cache.set(k, v); if (cache.size > 40) cache.delete(cache.keys().next().value as string); return v; };

/**
 * Instant suggestions from Shopify's predictive search. Not written to the disk cache (one entry per
 * keystroke would bloat it) and abortable, so a slow answer for an old keystroke never lands.
 */
export async function predictiveSearch(text: string, lang: L, signal?: AbortSignal): Promise<Suggest> {
  const q = text.trim();
  if (q.length < 2 || !SHOPIFY.token) return EMPTY;
  const key = `${lang}|${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const ctl = new AbortController();
  const stop = () => ctl.abort();
  const timer = setTimeout(stop, 8000);
  signal?.addEventListener('abort', stop);
  try {
    const res = await fetch(`https://${SHOPIFY.domain}/api/${SHOPIFY.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': SHOPIFY.token },
      body: JSON.stringify({ query: SUGGEST, variables: { q, language: lang } }),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`Shopify ${res.status}`);
    const json = await res.json();
    const ps = json?.data?.predictiveSearch;
    if (!ps) throw new Error('no predictiveSearch');
    return remember(key, {
      queries: ((ps.queries ?? []) as { text: string }[]).map((x) => x.text).filter((x) => x && x.toLowerCase() !== q.toLowerCase()).slice(0, 5),
      collections: (ps.collections ?? []) as Suggest['collections'],
      products: ((ps.products ?? []) as RawCard[]).map(shape),
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    // Predictive search unavailable for this shop/token: fall back to a plain product search.
    const r = await fetchProducts({ query: q, first: 6, lang });
    return remember(key, { queries: [], collections: [], products: r.products });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
  }
}

/** Card data for a list of product handles (recently viewed), in the same order. Disk-cached by gql. */
export async function fetchByHandles(handles: string[], lang: L): Promise<Product[]> {
  const list = handles.filter((h) => !/["\\\s]/.test(h)).slice(0, 12);
  if (!list.length) return [];
  const body = list.map((h, i) => `p${i}: product(handle: "${h}") { ${CARD} }`).join('\n');
  const data = await gql<Record<string, RawCard | null>>(`query Recent { ${body} }`, undefined, lang);
  return list.map((_, i) => data[`p${i}`]).filter((p): p is RawCard => !!p).map(shape);
}

export type Page = { products: Product[]; hasNext: boolean; cursor: string | null; missing?: boolean };
export type ColSort = 'COLLECTION_DEFAULT' | 'BEST_SELLING' | 'CREATED' | 'PRICE';

/** One page of a collection with real sorting and filtering (the shared helper only supports the default order). */
export async function fetchCollectionPage(handle: string, o: {
  first: number; after: string | null; sort: ColSort; reverse: boolean; filters: Record<string, unknown>[]; lang: L;
}): Promise<Page> {
  type R = { collection: { products: { nodes: RawCard[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null };
  const data = await gql<R>(
    `query ColPage($handle: String!, $first: Int!, $after: String, $sk: ProductCollectionSortKeys, $rev: Boolean, $filters: [ProductFilter!]) {
      collection(handle: $handle) { products(first: $first, after: $after, sortKey: $sk, reverse: $rev, filters: $filters) {
        nodes { ${CARD} } pageInfo { hasNextPage endCursor } } } }`,
    { handle, first: o.first, after: o.after, sk: o.sort, rev: o.reverse, filters: o.filters }, o.lang);
  if (!data.collection) return { products: [], hasNext: false, cursor: null, missing: true };
  const c = data.collection.products;
  return { products: c.nodes.map(shape), hasNext: c.pageInfo.hasNextPage, cursor: c.pageInfo.endCursor };
}
