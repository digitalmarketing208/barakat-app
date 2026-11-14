// Storefront calls used only by the product / cart / wishlist experience.
// NOTE: gql() disk-caches any query whose text does not contain the word "cart"; keep read queries free of it.
import { Product, Variant, fetchProducts, gql } from '../shopify';
import type { RawMeta } from './fit';

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

const META_IDS = [
  ...['lens_width', 'temple_width', 'bridge_width', 'fit', 'promo_message'].map((key) => ({ namespace: 'custom', key })),
  ...['rating', 'rating_count'].map((key) => ({ namespace: 'reviews', key })),
];

export type Extras = { metafields: RawMeta[]; collections: string[]; promo?: string; rating?: { value: number; count: number } };

const ratingOf = (ms: RawMeta[]): Extras['rating'] => {
  const r = ms.find((m) => m.namespace === 'reviews' && m.key === 'rating')?.value;
  if (!r) return undefined;
  let v = NaN;
  try { const j = JSON.parse(r) as { value?: unknown }; v = Number(j && typeof j === 'object' ? j.value : j); } catch { v = Number(r); }
  if (!Number.isFinite(v) || v <= 0 || v > 5) return undefined;
  const c = Number(ms.find((m) => m.namespace === 'reviews' && m.key === 'rating_count')?.value);
  return { value: Math.round(v * 10) / 10, count: Number.isFinite(c) && c > 0 ? c : 0 };
};

/** Fit / promo / rating metafields + collection handles. Resolves to null on any failure (the UI then stays silent). */
export async function fetchExtras(handle: string): Promise<Extras | null> {
  try {
    const d = await gql<{ product: { metafields: (RawMeta | null)[]; collections: { nodes: { handle: string }[] } } | null }>(
      `query ProductExtras($handle: String!, $ids: [HasMetafieldsIdentifier!]!) {
        product(handle: $handle) { metafields(identifiers: $ids) { namespace key value } collections(first: 4) { nodes { handle } } } }`,
      { handle, ids: META_IDS });
    if (!d.product) return null;
    const metafields = d.product.metafields.filter((m): m is RawMeta => !!m?.value);
    const promo = metafields.find((m) => m.namespace === 'custom' && m.key === 'promo_message')?.value.trim();
    return { metafields, collections: d.product.collections.nodes.map((c) => c.handle), promo: promo || undefined, rating: ratingOf(metafields) };
  } catch { return null; }
}

/** Card data for many handles in one request (wishlist, saved for later). Missing products are dropped. */
export async function fetchCards(handles: string[], lang: L): Promise<Product[]> {
  const out: Product[] = [];
  for (let i = 0; i < handles.length; i += 20) {
    const chunk = handles.slice(i, i + 20);
    const d = await gql<Record<string, RawCard | null>>(
      `query Cards(${chunk.map((_h, k) => `$h${k}: String!`).join(', ')}) {
        ${chunk.map((_h, k) => `p${k}: product(handle: $h${k}) { ${CARD} }`).join('\n')} }`,
      Object.fromEntries(chunk.map((h, k) => [`h${k}`, h])), lang);
    chunk.forEach((_h, k) => { const p = d[`p${k}`]; if (p) out.push(shape(p)); });
  }
  return out;
}

/** The one variant that can be added without asking the shopper anything, or null when a choice is needed. */
export function quickVariant(p: Product): Variant | null {
  const multi = p.options.some((o) => o.values.length > 1) || p.variants.length > 1;
  const v = p.variants.find((x) => x.availableForSale);
  return !multi && v ? v : null;
}

const RX = {
  spray: /spray|clean|بخاخ|منظف|تنظيف/i,
  case: /\bcase\b|علبة|حافظة|جراب/i,
  clip: /clip|كليب|كلبس/i,
  solution: /solution|saline|multi-?purpose|محلول/i,
};
const hay = (p: Product) => `${p.title} ${p.productType} ${p.tags.join(' ')}`;

export type Upsell = { kind: 'spray' | 'case' | 'clip' | 'solution'; product: Product };

/**
 * Smart add-ons for the bag: one lens cleaner, one case, and clip-ons that belong with the frames in it
 * (same collection first, then same brand). Never throws; an empty list hides the section.
 */
export async function fetchUpsells(frameHandles: string[], exclude: string[], lang: L): Promise<Upsell[]> {
  const skip = new Set(exclude);
  const ok = (p: Product) => p.availableForSale && !skip.has(p.handle) && !/^lens-addon/.test(p.handle);
  const [acc, clipSearch, ctx] = await Promise.all([
    frameHandles.length
      ? fetchProducts({ query: '(product_type:Accessories OR handle:barakat-optical-lens-cleaner-spray) AND available_for_sale:true', first: 30, lang }).then((r) => r.products).catch(() => [] as Product[])
      : Promise.resolve([] as Product[]),
    frameHandles.length
      ? fetchProducts({ query: '(product_type:"Clip-On Eyewear" OR product_type:"Sunglasses Clip-On") AND available_for_sale:true', first: 12, lang }).then((r) => r.products).catch(() => [] as Product[])
      : Promise.resolve([] as Product[]),
    Promise.all(frameHandles.slice(0, 2).map((handle) =>
      gql<{ product: { vendor: string; productType: string; collections: { nodes: { products: { nodes: RawCard[] } }[] } } | null }>(
        `query Siblings($handle: String!) { product(handle: $handle) { vendor productType
          collections(first: 2) { nodes { products(first: 24) { nodes { ${CARD} } } } } } }`, { handle }, lang).catch(() => null))),
  ]);
  const vendors = new Set<string>();
  const siblings: Product[] = [];
  let hasFrame = false;
  for (const c of ctx) {
    if (!c?.product || !/eyeglass|sunglass|optical frame/i.test(c.product.productType)) continue;
    hasFrame = true;
    if (c.product.vendor) vendors.add(c.product.vendor.toLowerCase());
    for (const col of c.product.collections.nodes) siblings.push(...col.products.nodes.map(shape));
  }
  const out: Upsell[] = [];
  const seen = new Set<string>();
  const take = (kind: Upsell['kind'], list: Product[], max: number) => {
    let n = 0;
    for (const p of list) {
      if (n >= max) break;
      if (seen.has(p.handle) || !ok(p) || !RX[kind].test(hay(p))) continue;
      seen.add(p.handle); out.push({ kind, product: p }); n++;
    }
  };
  if (!hasFrame) return out; // add-ons are for frames only
  take('spray', acc, 1);
  take('solution', acc, 1);
  take('case', acc.filter((p) => !RX.spray.test(hay(p)) && !RX.solution.test(hay(p))), 1);
  {
    const brandFirst = [...clipSearch, ...acc].sort((a, b) => Number(vendors.has(b.vendor.toLowerCase())) - Number(vendors.has(a.vendor.toLowerCase())));
    take('clip', [...siblings, ...brandFirst], 3);
  }
  return out;
}

/** Saves the order note on the Shopify cart so it shows on the order. */
export async function saveOrderNote(cartId: string, note: string): Promise<void> {
  const d = await gql<{ cartNoteUpdate: { userErrors: { message: string }[] } }>(
    `mutation NoteUpdate($cartId: ID!, $note: String!) { cartNoteUpdate(cartId: $cartId, note: $note) { cart { id } userErrors { message } } }`,
    { cartId, note });
  if (d.cartNoteUpdate.userErrors.length) throw new Error(d.cartNoteUpdate.userErrors[0].message);
}

/** Checkout URL carrying the promo code (Shopify applies ?discount=CODE on the hosted checkout). */
export const checkoutWithCode = (url: string, code: string | null) =>
  code ? `${url}${url.includes('?') ? '&' : '?'}discount=${encodeURIComponent(code)}` : url;

export type PromoResult =
  | { status: 'applied'; total: number; currency: string }
  | { status: 'invalid' }
  | { status: 'offline' };

/**
 * Checks a promo code on the Shopify cart (Storefront cartDiscountCodesUpdate; discountCodes { code applicable }).
 * Pass code = null to clear codes. 'offline' means it could not be checked: keep the code and let checkout decide.
 */
export async function applyPromoCode(cartId: string, code: string | null): Promise<PromoResult> {
  try {
    const d = await gql<{ cartDiscountCodesUpdate: { cart: { discountCodes: { code: string; applicable: boolean }[]; cost: { totalAmount: { amount: string; currencyCode: string } } } | null; userErrors: { message: string }[] } }>(
      `mutation PromoUpdate($cartId: ID!, $codes: [String!]) { cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $codes) {
        cart { id discountCodes { code applicable } cost { totalAmount { amount currencyCode } } } userErrors { message } } }`,
      { cartId, codes: code ? [code] : [] });
    const r = d.cartDiscountCodesUpdate;
    if (!code) return { status: 'applied', total: Number(r.cart?.cost.totalAmount.amount ?? 0), currency: r.cart?.cost.totalAmount.currencyCode ?? 'SAR' };
    if (r.userErrors.length || !r.cart) return { status: 'invalid' };
    const hit = r.cart.discountCodes.find((x) => x.code.toLowerCase() === code.toLowerCase());
    if (!hit?.applicable) {
      await gql(`mutation PromoClear($cartId: ID!, $codes: [String!]) { cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $codes) { cart { id } } }`, { cartId, codes: [] }).catch(() => {});
      return { status: 'invalid' };
    }
    return { status: 'applied', total: Number(r.cart.cost.totalAmount.amount), currency: r.cart.cost.totalAmount.currencyCode };
  } catch { return { status: 'offline' }; }
}
