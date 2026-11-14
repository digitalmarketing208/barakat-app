import { SHOPIFY } from './config';
import { cacheGet, cacheHas, cacheWrite } from './offline';
import { isOffline, markSaved } from './net/status';
import { noteServerDate } from './offers/manifest';
import { isLocalCursor, localCollectionProducts, localCollections, localProduct, localProducts } from './catalog-offline/local';

export type Money = { amount: string; currencyCode: string };
export type Variant = {
  id: string; title: string; availableForSale: boolean; quantityAvailable?: number | null;
  price: Money; compareAtPrice?: Money | null;
  selectedOptions: { name: string; value: string }[];
  image?: { url: string } | null;
};
export type Product = {
  id: string; handle: string; title: string; vendor: string; productType: string; tags: string[];
  availableForSale: boolean; description: string;
  featuredImage?: { url: string; altText?: string | null } | null;
  images: { url: string; altText?: string | null }[];
  priceRange: { minVariantPrice: Money; maxVariantPrice: Money };
  compareAtPriceRange?: { minVariantPrice: Money };
  options: { name: string; values: string[] }[];
  variants: Variant[];
};
export type Collection = { id: string; handle: string; title: string; image?: { url: string } | null };
export type Cart = {
  id: string; checkoutUrl: string; totalQuantity: number;
  cost: { subtotalAmount: Money; totalAmount: Money };
  lines: { id: string; quantity: number; attributes?: { key: string; value: string }[]; merchandise: { id: string; title: string; product: { title: string; handle: string }; image?: { url: string } | null; price: Money } }[];
};

export class ShopifyConfigError extends Error {}

// Shopify CDN resize: serve small images in lists instead of full-size photos.
export const sized = (url: string | undefined | null, w: number) => {
  if (!url) return undefined;
  if (!url.includes('cdn.shopify.com') && !url.includes('/cdn/shop/')) return url;
  return url + (url.includes('?') ? '&' : '?') + `width=${w}`;
};

const endpoint = () => `https://${SHOPIFY.domain}/api/${SHOPIFY.apiVersion}/graphql.json`;

/** The request never got a usable answer (no connection, timeout, 5xx). Safe to retry later. */
export class NetworkError extends Error {}
/** Thrown by cache-only reads when nothing is saved for the request. */
export class CacheMiss extends Error {}

/**
 * Catalog reads: network (or disk cache) first; when that fails or misses, the offline catalog snapshot answers.
 * Offline, the snapshot is tried right after the disk cache so nothing waits for a network timeout.
 */
async function withLocal<T>(run: (cacheOnly: boolean) => Promise<T>, local: () => Promise<T | null>, cacheOnly?: boolean): Promise<T> {
  if (cacheOnly || isOffline()) {
    try { return await run(true); } catch (e) { const p = await local().catch(() => null); if (p) return p; if (cacheOnly) throw e; return run(false); }
  }
  try { return await run(false); } catch (e) { if (e instanceof ShopifyConfigError) throw e; const p = await local().catch(() => null); if (p) return p; throw e; }
}
/** Local cursors ("o:N") continue a local list; after a network list, `offset` (items already on screen) continues it. */
const localPos = (after: string | null | undefined, offset?: number) => ({ after: isLocalCursor(after) ? after : null, offset: !isLocalCursor(after) && after ? offset : undefined });

export type GqlOpts = {
  /** 'default': network first, saved copy when the network fails. 'only': saved copy, never the network. 'none': never read or write the cache. */
  cache?: 'default' | 'only' | 'none';
};

const rewrite = (query: string) => query.replace(/^(\s*)(query|mutation)\s+(\w+)(\(([^)]*)\))?/, (_m, ws, kind, name, _p, args) =>
  `${ws}${kind} ${name}(${args ? args + ', ' : ''}$language: LanguageCode) @inContext(language: $language)`);

async function post(body: string, variables: Record<string, unknown>, timeoutMs: number) {
  // Manual timeout: AbortSignal.timeout() is not available on every React Native runtime.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': SHOPIFY.token },
      body: JSON.stringify({ query: body, variables }),
      signal: ctl.signal,
    });
    noteServerDate(res.headers.get('date'));
    if (res.status >= 500 || res.status === 429) throw new NetworkError(`Shopify ${res.status}`);
    if (!res.ok) throw new Error(`Shopify ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e instanceof NetworkError || (e instanceof Error && /^Shopify \d/.test(e.message))) throw e;
    throw new NetworkError(e instanceof Error ? e.message : 'network'); // fetch failed, aborted or body unreadable
  } finally { clearTimeout(timer); }
}

const inflight = new Map<string, Promise<unknown>>();

export async function gql<T>(query: string, variables?: Record<string, unknown>, lang: 'AR' | 'EN' = 'EN', opts: GqlOpts = {}): Promise<T> {
  if (!SHOPIFY.token) throw new ShopifyConfigError('missing token');
  // @inContext(language) returns Arabic or English content from Shopify (Translate & Adapt / Markets).
  const q = rewrite(query);
  const mode = opts.cache ?? 'default';
  // Read-only catalog queries are cached on disk; mutations and cart queries never are.
  const cacheable = mode !== 'none' && /^\s*query\b/.test(q) && !/^\s*query\s+\w*cart/i.test(q);
  const ckey = `${q}|${JSON.stringify(variables ?? {})}|${lang}`;
  if (mode === 'only') {
    const hit = cacheable ? await cacheGet<T>(ckey) : null;
    if (!hit) throw new CacheMiss('not cached');
    return hit.data;
  }
  const live = async (): Promise<T> => {
    const saved = cacheable && cacheHas(ckey);
    // Known to be offline: answer from disk at once instead of waiting for a timeout.
    if (saved && isOffline()) { const hit = await cacheGet<T>(ckey); if (hit) { markSaved(true); return hit.data; } }
    try {
      const vars = { ...variables, language: lang };
      // With a saved copy to fall back on, give up on a slow network sooner.
      const ms = saved ? 7000 : 12000;
      let json = await post(q, vars, ms);
      // If the token lacks the inventory scope, retry without stock counts instead of failing the whole screen.
      if (json.errors && JSON.stringify(json.errors).includes('quantityAvailable')) {
        json = await post(q.replace(/quantityAvailable/g, ''), vars, ms);
      }
      if (json.errors) throw new Error(json.errors.map((e: { message: string }) => e.message).join('; '));
      if (cacheable) { cacheWrite(ckey, json.data); markSaved(false); }
      return json.data as T;
    } catch (e) {
      if (cacheable) { const hit = await cacheGet<T>(ckey); if (hit) { markSaved(true); return hit.data; } }
      throw e;
    }
  };
  if (!cacheable) return live();
  // Identical requests in flight (e.g. launch prefetch + the screen itself) share one network call.
  const running = inflight.get(ckey) as Promise<T> | undefined;
  if (running) return running;
  const p = live().finally(() => { inflight.delete(ckey); });
  inflight.set(ckey, p);
  return p;
}

export const __test = { rewrite };

// Every variant seen this session, so the cart can show a line (title, image, price) for an item added while offline.
export type VariantInfo = Cart['lines'][number]['merchandise'];
const variantIndex = new Map<string, VariantInfo>();
const remember = (p: Product): Product => {
  if (variantIndex.size > 6000) variantIndex.clear();
  for (const v of p.variants) {
    variantIndex.set(v.id, { id: v.id, title: v.title, product: { title: p.title, handle: p.handle }, image: v.image ?? (p.featuredImage ? { url: p.featuredImage.url } : null), price: v.price });
  }
  return p;
};
export const variantInfo = (variantId: string): VariantInfo | undefined => variantIndex.get(variantId);

const VARIANT_FIELDS = `
    id title availableForSale quantityAvailable
    price { amount currencyCode } compareAtPrice { amount currencyCode }
    selectedOptions { name value } image { url }`;
const PRODUCT_FIELDS = `
  id handle title vendor productType tags availableForSale description
  featuredImage { url altText }
  images(first: 8) { nodes { url altText } }
  priceRange { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
  compareAtPriceRange { minVariantPrice { amount currencyCode } }
  options { name values }
  variants(first: 250) { nodes { ${VARIANT_FIELDS} } pageInfo { hasNextPage endCursor } }`;

const CARD_FIELDS = `
  id handle title vendor productType tags availableForSale
  featuredImage { url altText }
  priceRange { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
  compareAtPriceRange { minVariantPrice { amount currencyCode } }
  options { name values }
  variants(first: 6) { nodes { id title availableForSale price { amount currencyCode } compareAtPrice { amount currencyCode } selectedOptions { name value } } }`;
type RawCard = Omit<Product, 'images' | 'variants' | 'description'> & { variants: { nodes: Variant[] } };
const shapeCard = (p: RawCard): Product => remember({ ...p, description: '', images: p.featuredImage ? [p.featuredImage] : [], variants: p.variants.nodes });

type RawProduct = Omit<Product, 'images' | 'variants'> & { images: { nodes: Product['images'] }; variants: { nodes: Variant[]; pageInfo?: { hasNextPage: boolean; endCursor: string | null } } };
const shape = (p: RawProduct): Product => ({ ...p, images: p.images.nodes, variants: p.variants.nodes });

export type SortKey = 'BEST_SELLING' | 'CREATED_AT' | 'PRICE';

export async function fetchProducts(opts: {
  query?: string; first?: number; after?: string | null; sort?: SortKey; reverse?: boolean; lang?: 'AR' | 'EN';
  /** Read the saved copy only (instant, no network); throws CacheMiss when nothing is saved. */
  cacheOnly?: boolean;
  /** Items already shown; lets the offline catalog continue a list that began from the network. */
  offset?: number;
}): Promise<{ products: Product[]; hasNext: boolean; cursor: string | null }> {
  return withLocal((cacheOnly) => fetchProductsNet({ ...opts, cacheOnly }),
    () => (opts.after && !isLocalCursor(opts.after) && !opts.offset ? Promise.resolve(null) : localProducts(opts.lang ?? 'EN', { query: opts.query, first: opts.first ?? 20, sort: opts.sort, reverse: opts.reverse, ...localPos(opts.after, opts.offset) })),
    opts.cacheOnly);
}
async function fetchProductsNet(opts: Parameters<typeof fetchProducts>[0]): Promise<{ products: Product[]; hasNext: boolean; cursor: string | null }> {
  const data = await gql<{ products: { nodes: RawCard[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }>(
    `query Products($query: String, $first: Int!, $after: String, $sort: ProductSortKeys, $reverse: Boolean) {
      products(query: $query, first: $first, after: $after, sortKey: $sort, reverse: $reverse) {
        nodes { ${CARD_FIELDS} } pageInfo { hasNextPage endCursor }
      } }`,
    { query: opts.query, first: opts.first ?? 20, after: opts.after ?? null, sort: opts.sort ?? 'BEST_SELLING', reverse: opts.reverse ?? false },
    opts.lang, { cache: opts.cacheOnly ? 'only' : 'default' },
  );
  return { products: data.products.nodes.map(shapeCard), hasNext: data.products.pageInfo.hasNextPage, cursor: data.products.pageInfo.endCursor };
}

// Products in a collection, in the order the website shows them (collection's own sort).
export async function fetchCollectionProducts(handle: string, opts: { first?: number; after?: string | null; lang?: 'AR' | 'EN'; cacheOnly?: boolean; offset?: number } = {}):
  Promise<{ products: Product[]; hasNext: boolean; cursor: string | null }> {
  return withLocal((cacheOnly) => fetchCollectionProductsNet(handle, { ...opts, cacheOnly }),
    () => (opts.after && !isLocalCursor(opts.after) && !opts.offset ? Promise.resolve(null) : localCollectionProducts(opts.lang ?? 'EN', handle, { first: opts.first ?? 20, ...localPos(opts.after, opts.offset) })),
    opts.cacheOnly);
}
async function fetchCollectionProductsNet(handle: string, opts: { first?: number; after?: string | null; lang?: 'AR' | 'EN'; cacheOnly?: boolean }):
  Promise<{ products: Product[]; hasNext: boolean; cursor: string | null }> {
  const data = await gql<{ collection: { products: { nodes: RawCard[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null }>(
    `query ColProducts($handle: String!, $first: Int!, $after: String) {
      collection(handle: $handle) { products(first: $first, after: $after, filters: [{ available: true }]) {
        nodes { ${CARD_FIELDS} } pageInfo { hasNextPage endCursor } } } }`,
    { handle, first: opts.first ?? 20, after: opts.after ?? null }, opts.lang, { cache: opts.cacheOnly ? 'only' : 'default' });
  if (!data.collection) return { products: [], hasNext: false, cursor: null };
  const c = data.collection.products;
  return { products: c.nodes.map(shapeCard), hasNext: c.pageInfo.hasNextPage, cursor: c.pageInfo.endCursor };
}

/** A product opened again within this window is served from disk without a request (back/forward, wishlist, lens picker). */
const PRODUCT_FRESH_MS = 2 * 60 * 1000;

export async function fetchProduct(handle: string, lang: 'AR' | 'EN' = 'EN', opts: { cacheOnly?: boolean; fresh?: boolean } = {}): Promise<Product | null> {
  if (!SHOPIFY.token) throw new ShopifyConfigError('missing token');
  // The fully assembled product (all variant pages) is saved as ONE record, so an offline read is always complete.
  const key = `product|${handle}|${lang}`;
  const saved = cacheHas(key) ? await cacheGet<Product>(key) : null;
  if (opts.cacheOnly) {
    if (saved) return remember(saved.data);
    const p = await localProduct(lang, handle).catch(() => null); // partial product from the offline catalog
    if (p) return remember(p);
    throw new CacheMiss('not cached');
  }
  if (!saved && isOffline()) { const p = await localProduct(lang, handle).catch(() => null); if (p) { markSaved(true); return remember(p); } }
  if (saved && (isOffline() || (!opts.fresh && Date.now() - saved.at < PRODUCT_FRESH_MS))) {
    if (isOffline()) markSaved(true);
    return remember(saved.data);
  }
  const running = inflight.get(key) as Promise<Product | null> | undefined;
  if (running) return running;
  const live = async (): Promise<Product | null> => {
    try {
      const data = await gql<{ product: RawProduct | null }>(
        `query One($handle: String!) { product(handle: $handle) { ${PRODUCT_FIELDS} } }`, { handle }, lang, { cache: 'none' });
      if (!data.product) return null;
      const p = shape(data.product);
      // Large lens products have 250+ variants (every power, left and right eye): page through them all.
      let pi = data.product.variants.pageInfo;
      while (pi?.hasNextPage && p.variants.length < 2000) {
        const more = await gql<{ product: { variants: { nodes: Variant[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null }>(
          `query MoreVariants($handle: String!, $after: String) { product(handle: $handle) { variants(first: 250, after: $after) { nodes { ${VARIANT_FIELDS} } pageInfo { hasNextPage endCursor } } } }`,
          { handle, after: pi.endCursor }, lang, { cache: 'none' });
        if (!more.product) break;
        p.variants.push(...more.product.variants.nodes);
        pi = more.product.variants.pageInfo;
      }
      cacheWrite(key, p);
      markSaved(false);
      return remember(p);
    } catch (e) {
      // Any page failing falls back to the last complete saved product.
      if (saved && !(e instanceof ShopifyConfigError)) { markSaved(true); return remember(saved.data); }
      if (!(e instanceof ShopifyConfigError)) { const p = await localProduct(lang, handle).catch(() => null); if (p) { markSaved(true); return remember(p); } }
      throw e;
    }
  };
  const job = live().finally(() => { inflight.delete(key); });
  inflight.set(key, job);
  return job;
}

export async function fetchCollections(lang?: 'AR' | 'EN', opts: { cacheOnly?: boolean } = {}): Promise<Collection[]> {
  return withLocal((cacheOnly) => fetchCollectionsNet(lang, { cacheOnly }), async () => (await localCollections(lang ?? 'EN'))?.slice(0, 30) ?? null, opts.cacheOnly);
}
async function fetchCollectionsNet(lang?: 'AR' | 'EN', opts: { cacheOnly?: boolean } = {}): Promise<Collection[]> {
  const data = await gql<{ collections: { nodes: Collection[] } }>(
    `query Cols { collections(first: 30, sortKey: UPDATED_AT, reverse: true) { nodes { id handle title image { url } } } }`, undefined, lang,
    { cache: opts.cacheOnly ? 'only' : 'default' });
  return data.collections.nodes;
}

const CART_FIELDS = `
  id checkoutUrl totalQuantity
  cost { subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } }
  lines(first: 100) { nodes { id quantity attributes { key value } merchandise { ... on ProductVariant {
    id title image { url } price { amount currencyCode } product { title handle } } } } }`;
type RawCart = Omit<Cart, 'lines'> & { lines: { nodes: Cart['lines'] } };
const shapeCart = (c: RawCart): Cart => ({ ...c, lines: c.lines.nodes });

export async function cartCreate(variantId: string, quantity = 1): Promise<Cart> {
  const d = await gql<{ cartCreate: { cart: RawCart; userErrors: { message: string }[] } }>(
    `mutation Create($lines: [CartLineInput!]) { cartCreate(input: { lines: $lines }) { cart { ${CART_FIELDS} } userErrors { message } } }`,
    { lines: [{ merchandiseId: variantId, quantity }] });
  if (d.cartCreate.userErrors.length) throw new Error(d.cartCreate.userErrors[0].message);
  return shapeCart(d.cartCreate.cart);
}
export async function cartAdd(cartId: string, variantId: string, quantity = 1): Promise<Cart> {
  const d = await gql<{ cartLinesAdd: { cart: RawCart; userErrors: { message: string }[] } }>(
    `mutation Add($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ${CART_FIELDS} } userErrors { message } } }`,
    { cartId, lines: [{ merchandiseId: variantId, quantity }] });
  if (d.cartLinesAdd.userErrors.length) throw new Error(d.cartLinesAdd.userErrors[0].message);
  return shapeCart(d.cartLinesAdd.cart);
}
export type NewLine = { variantId: string; quantity: number; attributes?: { key: string; value: string }[] };
const toInput = (l: NewLine) => ({ merchandiseId: l.variantId, quantity: l.quantity, attributes: l.attributes });
export async function cartCreateLines(lines: NewLine[]): Promise<Cart> {
  const d = await gql<{ cartCreate: { cart: RawCart; userErrors: { message: string }[] } }>(
    `mutation Create($lines: [CartLineInput!]) { cartCreate(input: { lines: $lines }) { cart { ${CART_FIELDS} } userErrors { message } } }`,
    { lines: lines.map(toInput) });
  if (d.cartCreate.userErrors.length) throw new Error(d.cartCreate.userErrors[0].message);
  return shapeCart(d.cartCreate.cart);
}
export async function cartAddLines(cartId: string, lines: NewLine[]): Promise<Cart> {
  const d = await gql<{ cartLinesAdd: { cart: RawCart; userErrors: { message: string }[] } }>(
    `mutation Add($cartId: ID!, $lines: [CartLineInput!]!) { cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ${CART_FIELDS} } userErrors { message } } }`,
    { cartId, lines: lines.map(toInput) });
  if (d.cartLinesAdd.userErrors.length) throw new Error(d.cartLinesAdd.userErrors[0].message);
  return shapeCart(d.cartLinesAdd.cart);
}
/** Message thrown when Shopify no longer has the cart (net/cartOps treats it as an empty cart). */
export const CART_GONE = 'cart does not exist';
export async function cartUpdate(cartId: string, lineId: string, quantity: number): Promise<Cart> {
  const d = await gql<{ cartLinesUpdate: { cart: RawCart | null } }>(
    `mutation Upd($cartId: ID!, $lines: [CartLineUpdateInput!]!) { cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ${CART_FIELDS} } } }`,
    { cartId, lines: [{ id: lineId, quantity }] });
  if (!d.cartLinesUpdate.cart) throw new Error(CART_GONE); // expired or already checked out
  return shapeCart(d.cartLinesUpdate.cart);
}
export async function cartRemove(cartId: string, lineId: string): Promise<Cart> {
  const d = await gql<{ cartLinesRemove: { cart: RawCart | null } }>(
    `mutation Rem($cartId: ID!, $lineIds: [ID!]!) { cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ${CART_FIELDS} } } }`,
    { cartId, lineIds: [lineId] });
  if (!d.cartLinesRemove.cart) throw new Error(CART_GONE);
  return shapeCart(d.cartLinesRemove.cart);
}
export async function cartGet(cartId: string): Promise<Cart | null> {
  const d = await gql<{ cart: RawCart | null }>(`query GetCart($cartId: ID!) { cart(id: $cartId) { ${CART_FIELDS} } }`, { cartId }, 'EN', { cache: 'none' });
  return d.cart ? shapeCart(d.cart) : null;
}

export const money = (m: { amount: string }) => {
  const n = Number(m.amount);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};
