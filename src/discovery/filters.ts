import { CATEGORIES, GENDERS, SHAPES } from '../catalog';
import type { Product } from '../shopify';

export type Filters = { gender: string; shapes: string[]; price: string | null; brands: string[]; inStock: boolean };
export const NO_FILTERS: Filters = { gender: 'all', shapes: [], price: null, brands: [], inStock: false };

// Price bands in SAR that fit an optical catalogue (accessories up to designer frames).
export const PRICES: { id: string; min?: number; max?: number }[] = [
  { id: 'u200', max: 200 },
  { id: '200-500', min: 200, max: 500 },
  { id: '500-1000', min: 500, max: 1000 },
  { id: 'o1000', min: 1000 },
];

export const countActive = (f: Filters) =>
  (f.gender !== 'all' ? 1 : 0) + f.shapes.length + (f.price ? 1 : 0) + f.brands.length + (f.inStock ? 1 : 0);

const quote = (s: string) => `"${s.replace(/["\\]/g, ' ')}"`;
const any = (parts: string[]) => (parts.length > 1 ? `(${parts.join(' OR ')})` : parts[0]);

/** Shopify product search syntax for free text + category + every active filter. */
export function buildQuery(text: string, cat: string | null, f: Filters): string {
  const parts: string[] = [];
  if (text) parts.push(text);
  const c = CATEGORIES.find((x) => x.id === cat); if (c) parts.push(c.query);
  const g = GENDERS.find((x) => x.id === f.gender); if (g?.query) parts.push(g.query);
  const sh = SHAPES.filter((x) => f.shapes.includes(x.id)).map((x) => x.query);
  if (sh.length) parts.push(any(sh));
  if (f.brands.length) parts.push(any(f.brands.map((b) => `vendor:${quote(b)}`)));
  const p = PRICES.find((x) => x.id === f.price);
  if (p?.min != null) parts.push(`variants.price:>=${p.min}`);
  if (p?.max != null) parts.push(`variants.price:<${p.max}`);
  if (f.inStock) parts.push('available_for_sale:true');
  return parts.join(' AND ');
}

/** The same filters as Storefront `ProductFilter` inputs, for lists that are a collection. Sold-out items stay hidden there, as on the website. */
export function buildColFilters(f: Filters): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [{ available: true }];
  const p = PRICES.find((x) => x.id === f.price);
  if (p) out.push({ price: { ...(p.min != null && { min: p.min }), ...(p.max != null && { max: p.max }) } });
  for (const b of f.brands) out.push({ productVendor: b });
  // Tag filters are OR-ed together by Shopify, so only one tag group goes to the server; `matches` enforces the rest.
  const shapes = SHAPES.filter((x) => f.shapes.includes(x.id));
  const g = GENDERS.find((x) => x.id === f.gender);
  if (shapes.length) for (const x of shapes) out.push({ tag: x.tag });
  else if (g?.tag) out.push({ tag: g.tag });
  return out;
}

const has = (p: Product, tag: string) => p.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
/** Client-side check of every filter, so a result is never shown that the chips say is excluded. */
export function matches(p: Product, f: Filters): boolean {
  const g = GENDERS.find((x) => x.id === f.gender);
  if (g?.tag && !has(p, g.tag)) return false;
  if (f.shapes.length && !SHAPES.some((x) => f.shapes.includes(x.id) && has(p, x.tag))) return false;
  if (f.brands.length && !f.brands.some((b) => p.vendor.toLowerCase().startsWith(b.toLowerCase()))) return false;
  const r = PRICES.find((x) => x.id === f.price);
  const price = Number(p.priceRange.minVariantPrice.amount);
  if (r?.min != null && price < r.min) return false;
  if (r?.max != null && price >= r.max) return false;
  if (f.inStock && !p.availableForSale) return false;
  return true;
}
