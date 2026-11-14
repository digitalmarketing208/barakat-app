export type OfferKind = 'price' | 'bogo' | 'banner' | 'strap';
export type OfferScope = { all?: boolean; collections?: string[]; tags?: string[]; vendors?: string[]; handles?: string[] };
export type Offer = {
  id: string; titleAr: string; titleEn: string;
  /** ISO 8601 WITH offset, e.g. 2026-11-22T23:59:59+03:00. */
  startsAt: string; endsAt: string;
  scope: OfferScope;
  kind: OfferKind;
  badgeAr: string; badgeEn: string;
  bannerImage?: string;
  link?: { collection?: string; handle?: string };
};
export type OffersManifest = { version: number; updatedAt: string; sample?: boolean; offers: Offer[] };
/** What a product screen knows besides the product itself (Storefront Product has no collection list). */
export type OfferCtx = { collection?: string; collections?: string[] };
