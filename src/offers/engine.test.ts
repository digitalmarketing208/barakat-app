// Run: npx tsx src/offers/engine.test.ts
import { TrustedClock } from './clock';
import { activeOffers, displayPrice, offerForProduct, validateManifest, nextBoundary } from './engine';
import { countdown, checkoutNote } from './format';
import type { Product } from '../shopify';
import type { OffersManifest } from './types';

let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.error('FAIL', m); } else console.log('ok  ', m); };
const T = (s: string) => Date.parse(s);
const money = (a: number) => ({ amount: a.toFixed(2), currencyCode: 'SAR' });
const prod = (o: Partial<Product> & { price: number; was?: number }): Product => ({
  id: 'gid://p/1', handle: o.handle ?? 'p1', title: 't', vendor: o.vendor ?? 'Ray', productType: '', tags: o.tags ?? [],
  availableForSale: true, description: '', images: [], options: [], variants: [],
  priceRange: { minVariantPrice: money(o.price), maxVariantPrice: money(o.price) },
  compareAtPriceRange: o.was ? { minVariantPrice: money(o.was) } : undefined,
}) as Product;

const m: OffersManifest = validateManifest({
  version: 1, updatedAt: '2026-11-14T00:00:00+03:00',
  offers: [
    { id: 'sun', kind: 'price', titleAr: 'a', titleEn: 'e', startsAt: '2026-11-01T00:00:00+03:00', endsAt: '2026-11-22T23:59:59+03:00', scope: { collections: ['sunglasses-all-brands'], tags: ['autumn'] }, badgeAr: '', badgeEn: '' },
    { id: 'ray', kind: 'price', titleAr: 'a', titleEn: 'e', startsAt: '2026-11-01T00:00:00+03:00', endsAt: '2026-12-31T23:59:59+03:00', scope: { vendors: ['RAYBAN'], handles: ['special-1'] }, badgeAr: '', badgeEn: '' },
    { id: 'strap', kind: 'strap', titleAr: 'a', titleEn: 'e', startsAt: '2026-11-01T00:00:00+03:00', endsAt: '2026-11-22T23:59:59+03:00', scope: { all: true }, badgeAr: '', badgeEn: '' },
    { id: 'bad-no-zone', kind: 'price', startsAt: '2026-11-01T00:00:00', endsAt: '2026-11-22T23:59:59', scope: { all: true } },
    { id: 'bad-order', kind: 'price', startsAt: '2026-11-05T00:00:00+03:00', endsAt: '2026-11-01T00:00:00+03:00', scope: { all: true } },
  ],
})!;
ok(m.offers.length === 3, 'invalid offers dropped (no zone, end<start)');

const live = T('2026-11-20T12:00:00+03:00'), after = T('2026-11-23T00:00:00+03:00');
const sale = prod({ price: 80, was: 100, tags: ['autumn'] });

// Expiry offline
let d = displayPrice(sale, live, {}, m);
ok(d.price.amount === '80.00' && d.compareAt?.amount === '100.00' && d.pct === 20 && d.offer?.id === 'sun' && !d.expired, 'live: sale shown');
d = displayPrice(sale, after, {}, m);
ok(d.price.amount === '100.00' && d.compareAt === null && d.pct === 0 && d.expired && d.differsFromShopify, 'expired: regular price, no pill');
ok(displayPrice(sale, T('2026-11-22T23:59:59+03:00'), {}, m).expired, 'end instant is exclusive');
ok(displayPrice(sale, T('2026-11-22T23:59:58+03:00'), {}, m).pct === 20, 'one second before end still live');
ok(activeOffers(after, ['strap'], m).length === 0 && activeOffers(live, ['strap'], m).length === 1, 'strap hidden after end');
ok(nextBoundary(live, m) === T('2026-11-22T23:59:59+03:00'), 'next boundary = nearest end');
// Normal Shopify sale untouched
const normal = prod({ price: 50, was: 70, handle: 'x', vendor: 'Other' });
d = displayPrice(normal, after, {}, m);
ok(d.price.amount === '50.00' && d.compareAt?.amount === '70.00' && !d.expired && !d.differsFromShopify, 'sale without covering offer unchanged');
ok(displayPrice(prod({ price: 90 }), after, {}, m).compareAt === null, 'no compareAt: nothing to do');

// Scope matching
ok(offerForProduct(prod({ price: 1, tags: ['AUTUMN'] }), live, {}, undefined, m)?.id === 'sun', 'tag match case-insensitive');
ok(offerForProduct(prod({ price: 1, handle: 'zz' }), live, { collection: 'sunglasses-all-brands' }, ['price'], m)?.id === 'sun', 'collection via ctx');
ok(offerForProduct(prod({ price: 1, handle: 'zz', vendor: 'Other' }), live, { collection: 'eyeglasses-all-brands' }, ['price'], m) === null, 'collection mismatch -> none');
ok(offerForProduct(prod({ price: 1, vendor: 'Rayban' }), live, {}, ['price'], m)?.id === 'ray', 'vendor match');
ok(offerForProduct(prod({ price: 1, handle: 'special-1', vendor: 'Z' }), live, {}, ['price'], m)?.id === 'ray', 'handle match');
ok(offerForProduct(prod({ price: 1, vendor: 'Z' }), live, {}, ['strap'], m)?.id === 'strap', 'all:true covers everything');
ok(offerForProduct(prod({ price: 1, tags: ['autumn'] }), T('2026-10-01T00:00:00+03:00'), {}, ['price'], m) === null, 'upcoming offer not active');
d = displayPrice(sale, T('2026-10-01T00:00:00+03:00'), {}, m);
ok(d.price.amount === '100.00' && !d.expired, 'before start: regular price, not flagged expired');

// Clock tampering
let dev = T('2026-11-14T10:00:00Z'), mono = 0;
const c = new TrustedClock(() => dev, () => mono);
ok(c.now() === dev, 'unsynced clock = device');
c.observeDateHeader('Sat, 14 Nov 2026 10:00:00 GMT');
dev += 3 * 3600e3; mono += 3 * 3600e3; // device 3h later, in step with real time
ok(c.now() === T('2026-11-14T13:00:00Z'), 'advances with device');
const lastServer = T('2026-11-14T10:00:00Z');
// user sets the device clock back 10 days while offline
dev = T('2026-11-04T13:00:00Z');
ok(c.now() >= T('2026-11-14T13:00:00Z'), 'device set back: never goes backwards');
// restart (mono resets), device still set back: restored floor holds
const c2 = new TrustedClock(() => dev, () => 0); c2.restore(c.snapshot());
ok(c2.now() >= T('2026-11-14T13:00:00Z') && c2.lastSeen === lastServer, 'after restart clamp survives via snapshot');
// device clock wrong (2 days slow) but synced: offset corrects
const c3 = new TrustedClock(() => T('2026-11-12T00:00:00Z'), () => 0); c3.observe(T('2026-11-14T00:00:00Z'));
ok(c3.now() === T('2026-11-14T00:00:00Z'), 'offset corrects a wrong device clock');
// forward tamper then online sync discards the inflated floor
let dv = T('2026-11-14T00:00:00Z'); const c4 = new TrustedClock(() => dv, () => 0);
c4.observe(dv); dv = T('2027-01-01T00:00:00Z'); c4.now(); dv = T('2026-11-15T00:00:00Z'); c4.observe(T('2026-11-15T00:00:00Z'));
ok(c4.now() === T('2026-11-15T00:00:00Z'), 'server sync resets forward-tampered floor');
ok(!c.observeDateHeader('garbage') && !c.observeDateHeader(null), 'bad Date header ignored');
// end to end: stale offer never live when clock set back after expiry seen
const cc = new TrustedClock(() => T('2026-11-23T01:00:00+03:00'), () => 0); cc.now();
const back = new TrustedClock(() => T('2026-11-10T00:00:00+03:00'), () => 0); back.restore(cc.snapshot());
ok(displayPrice(sale, back.now(), {}, m).expired, 'clock set back after expiry: sale stays hidden');

// Formatting
ok(countdown(T('2026-11-22T00:00:00Z') - T('2026-11-19T20:00:00Z'), 'en') === 'Ends in 2d 4h', 'countdown en 2d 4h');
ok(countdown(2 * 86400e3 + 4 * 3600e3, 'ar') === 'ينتهي خلال يومين و4 ساعات', 'countdown ar');
ok(!/[.,،]/.test(countdown(5 * 86400e3 + 11 * 3600e3, 'ar')), 'ar countdown has no dots or commas');
ok(countdown(-1, 'en') === 'Offer ended' && checkoutNote('en').includes('checkout'), 'ended + checkout note');

if (fail) { console.error(`${fail} FAILED`); process.exit(1); } else console.log('all offers tests passed');
