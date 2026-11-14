# Offers (sales, straps, banners, 1+1) that stay correct offline

Code: `src/offers/`. Test: `npx tsx src/offers/engine.test.ts`.

## Manifest format
JSON stored in the body of the Shopify page with handle `app-offers`:

```json
{ "version": 1, "updatedAt": "2026-11-14T00:00:00+03:00",
  "offers": [{
    "id": "autumn-sunglasses-1plus1",
    "titleAr": "...", "titleEn": "...",
    "startsAt": "2026-10-01T00:00:00+03:00", "endsAt": "2026-11-22T23:59:59+03:00",
    "scope": { "all": false, "collections": ["sunglasses-all-brands"], "tags": [], "vendors": [], "handles": [] },
    "kind": "price", "badgeAr": "...", "badgeEn": "...",
    "bannerImage": "https://...", "link": { "collection": "sunglasses-all-brands" }
  }] }
```
- `kind`: `price` (governs compareAtPrice sales), `bogo` (1+1 campaign, badge only), `banner` (home hero), `strap` (top rotating strap).
- Dates MUST carry an offset (`+03:00` or `Z`). The end instant is exclusive (gone at `endsAt`).
- Scope matches if ANY listed rule matches (case-insensitive). `collections` match only where the screen passes the collection handle (`ctx.collection`).
- Invalid offers (no offset, end before start, unknown kind) are silently dropped, never crash the app.

## Marketing: create or edit the page
1. Shopify admin > Online Store > Pages > Add page (edit: open the existing one): https://admin.shopify.com/store/barakatoptical/pages
2. Title `App offers`. In the editor click the `<>` (show HTML) button and paste the JSON as plain text.
3. Right column, Theme template: keep default. Visibility: **Visible**. Save.
4. Handle must be exactly `app-offers`: scroll to Search engine listing > Edit > URL and handle.
5. Edit: change dates or offers, Save. Phones refresh on next open or when they get internet.
6. To end everything early: delete the offer from the list (or set `endsAt` to the past) and Save.
Keep your Shopify prices in step: remove the sale price in Shopify when the offer ends (the app is only a safety net).

## How expiry works offline
1. Every successful network response's HTTP `Date` header is stored as `serverOffset = serverNow - deviceNow`.
2. Trusted now = max(device + offset, last server time seen, highest time ever returned, monotonic estimate). It never goes backwards; setting the phone clock back does not revive an ended offer, also after app restart.
3. The last good manifest is cached on disk with `fetchedAt`; a bundled sample (`offers.default.json`) is used on a fresh install with no internet.
4. A product with `compareAt` covered by an ended `price` offer shows the regular (compareAt) price and no sale pill. A product with `compareAt` and NO covering offer keeps Shopify's price (normal sales untouched).
5. The screen re-renders every 30 s and at the exact next start/end moment, so strap/banner/pill vanish at expiry without internet.
6. Offline the app shows "Prices as of <date>"; if a shown price differs from Shopify's it shows "Final price is confirmed at checkout". Checkout is hosted by Shopify, which always decides the real price.

## Limits
- The app cannot make Shopify's price change: if the sale price is still live in Shopify at checkout, the customer pays Shopify's price (usually lower). The app only avoids advertising an ended sale.
- A brand-new install with no internet and a never-synced device clock trusts the device clock.
- Offers not in the manifest are not managed (no covering offer = Shopify price shown as is).
- `bogo` offers are display only; the discount itself must exist in Shopify.
- The `Date` header has 1 s resolution; the manifest is cached up to the app cache TTL (30 days).
- The bundled default is marked `"sample": true`; replace it via the Shopify page rather than rebuilding. A `sample` manifest is shown in development builds only: in a release build a fresh install with no internet shows no offers until the first sync.
