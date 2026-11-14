// Pure offer logic (no React, no network). All functions take a trusted `now` (ms) so they are testable.
import type { Money, Product, Variant } from '../shopify';
import type { Offer, OfferCtx, OfferKind, OffersManifest } from './types';
import defaultManifest from './offers.default.json';

export type OfferState = 'upcoming' | 'active' | 'expired';
export type DisplayPrice = {
  price: Money; compareAt: Money | null; offer: Offer | null;
  /** A covering price offer has ended: the regular price is shown and the sale pill must be hidden. */
  expired: boolean;
  /** Percent off to show in the pill (0 = no pill). */
  pct: number;
  /** Shown price differs from what Shopify returned (so checkout may differ until the app is online). */
  differsFromShopify: boolean;
};

let current: OffersManifest = defaultManifest as OffersManifest;
export const getManifest = () => current;
export const setManifest = (m: OffersManifest) => { current = m; };
export const defaultOffers = () => defaultManifest as OffersManifest;

const ISO_ZONED = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const KINDS: OfferKind[] = ['price', 'bogo', 'banner', 'strap'];

/** Validate untrusted JSON. Invalid offers are dropped (never throws); returns null if not a manifest. */
export function validateManifest(raw: unknown): OffersManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.offers)) return null;
  const offers: Offer[] = [];
  for (const o of r.offers as Record<string, unknown>[]) {
    if (!o || typeof o.id !== 'string' || !KINDS.includes(o.kind as OfferKind)) continue;
    if (typeof o.startsAt !== 'string' || typeof o.endsAt !== 'string' || !ISO_ZONED.test(o.startsAt) || !ISO_ZONED.test(o.endsAt)) continue;
    const s = Date.parse(o.startsAt), e = Date.parse(o.endsAt);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    const sc = (o.scope ?? {}) as Record<string, unknown>;
    const lk = (o.link ?? undefined) as Record<string, unknown> | undefined;
    offers.push({
      id: o.id, titleAr: String(o.titleAr ?? ''), titleEn: String(o.titleEn ?? ''),
      startsAt: o.startsAt, endsAt: o.endsAt,
      scope: { all: sc.all === true, collections: arr(sc.collections), tags: arr(sc.tags), vendors: arr(sc.vendors), handles: arr(sc.handles) },
      kind: o.kind as OfferKind, badgeAr: String(o.badgeAr ?? ''), badgeEn: String(o.badgeEn ?? ''),
      bannerImage: typeof o.bannerImage === 'string' ? o.bannerImage : undefined,
      link: lk ? { collection: typeof lk.collection === 'string' ? lk.collection : undefined, handle: typeof lk.handle === 'string' ? lk.handle : undefined } : undefined,
    });
  }
  return { version: Number(r.version) || 1, updatedAt: String(r.updatedAt ?? ''), sample: r.sample === true, offers };
}

export const offerState = (o: Offer, now: number): OfferState =>
  now < Date.parse(o.startsAt) ? 'upcoming' : now < Date.parse(o.endsAt) ? 'active' : 'expired';

/** Offers live right now, optionally of given kinds. Ends are exclusive: at endsAt the offer is already gone. */
export function activeOffers(now: number, kinds?: OfferKind[], m: OffersManifest = current): Offer[] {
  return m.offers.filter((o) => offerState(o, now) === 'active' && (!kinds || kinds.includes(o.kind)));
}

const lc = (s: string) => s.trim().toLowerCase();
/** Scope match, ignoring dates. */
export function covers(o: Offer, p: Pick<Product, 'handle' | 'tags' | 'vendor'>, ctx: OfferCtx = {}): boolean {
  const s = o.scope;
  if (s.all) return true;
  if (s.handles?.some((h) => lc(h) === lc(p.handle))) return true;
  if (s.vendors?.some((v) => lc(v) === lc(p.vendor ?? ''))) return true;
  if (s.tags?.length && (p.tags ?? []).some((t) => s.tags!.some((x) => lc(x) === lc(t)))) return true;
  const cols = [...(ctx.collections ?? []), ...(ctx.collection ? [ctx.collection] : []), ...(((p as { collections?: string[] }).collections) ?? [])];
  return !!s.collections?.length && cols.some((c) => s.collections!.some((x) => lc(x) === lc(c)));
}

/** First ACTIVE offer covering the product (optionally only of the given kinds), else null. */
export function offerForProduct(p: Product, now: number, ctx: OfferCtx = {}, kinds?: OfferKind[], m: OffersManifest = current): Offer | null {
  return activeOffers(now, kinds, m).find((o) => covers(o, p, ctx)) ?? null;
}

const num = (m: Money) => Number(m.amount);
export const discountPct = (price: Money, was: Money | null) => (was && num(was) > num(price) ? Math.round((1 - num(price) / num(was)) * 100) : 0);

function resolve(price: Money, was: Money | null | undefined, covering: Offer[], now: number): Omit<DisplayPrice, 'differsFromShopify'> {
  const compare = was && num(was) > num(price) ? was : null;
  if (!compare) return { price, compareAt: null, offer: null, expired: false, pct: 0 };
  // Only 'price' offers govern compareAt-based sales. No covering offer = a normal Shopify sale, untouched.
  const gov = covering.filter((o) => o.kind === 'price');
  if (!gov.length) return { price, compareAt: compare, offer: null, expired: false, pct: discountPct(price, compare) };
  const live = gov.find((o) => offerState(o, now) === 'active');
  if (live) return { price, compareAt: compare, offer: live, expired: false, pct: discountPct(price, compare) };
  // Ended (or not started yet): fall back to the regular price, no sale pill.
  const ended = gov.some((o) => offerState(o, now) === 'expired');
  return { price: compare, compareAt: null, offer: null, expired: ended, pct: 0 };
}

/** Price block for a product card / page (lowest variant price, same basis as ui.tsx Price). */
export function displayPrice(p: Product, now: number, ctx: OfferCtx = {}, m: OffersManifest = current): DisplayPrice {
  const price = p.priceRange.minVariantPrice, was = p.compareAtPriceRange?.minVariantPrice;
  const r = resolve(price, was, m.offers.filter((o) => covers(o, p, ctx)), now);
  return { ...r, differsFromShopify: r.price.amount !== price.amount };
}

/** Same for one variant (product page variant selector). */
export function displayVariantPrice(p: Product, v: Variant, now: number, ctx: OfferCtx = {}, m: OffersManifest = current): DisplayPrice {
  const r = resolve(v.price, v.compareAtPrice, m.offers.filter((o) => covers(o, p, ctx)), now);
  return { ...r, differsFromShopify: r.price.amount !== v.price.amount };
}

/** True if any product is displayed at a price different from Shopify's: show the "confirmed at checkout" note. */
export const anyPriceDiffers = (ps: Product[], now: number, ctx: OfferCtx = {}) => ps.some((p) => displayPrice(p, now, ctx).differsFromShopify);

/** Nearest future start/end among all offers (ms), or null. Used to schedule the exact re-render. */
export function nextBoundary(now: number, m: OffersManifest = current): number | null {
  let best: number | null = null;
  for (const o of m.offers) for (const t of [Date.parse(o.startsAt), Date.parse(o.endsAt)]) if (t > now && (best === null || t < best)) best = t;
  return best;
}
