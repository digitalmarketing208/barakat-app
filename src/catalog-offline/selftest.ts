// Run: npx tsx src/catalog-offline/selftest.ts  (local query engine + codec checks on mock data)
import { buildMock } from './measure';
import { collectionProducts, decode, encode, load, queryProducts, parseQuery, isLocalCursor } from './snapshot';

let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.error('FAIL', m); } else console.log('ok  ', m); };
const L = load(decode(encode(buildMock(500, false)))!);
ok(L.recs.length === 500, 'codec round-trip keeps all products');
const all = queryProducts(L, { first: 1000 });
ok(all.products.length === 500 && !all.hasNext, 'no filter returns everything');
const p1 = queryProducts(L, { first: 20 }); const p2 = queryProducts(L, { first: 20, after: p1.cursor });
ok(p1.hasNext && isLocalCursor(p1.cursor) && p2.products[0].handle === L.recs[20][1], 'pagination by local cursor');
const q = queryProducts(L, { query: '(product_type:Eyeglasses OR product_type:"Optical Frame") AND tag:Mens AND available_for_sale:true AND variants.price:>=200', first: 1000 });
ok(q.products.length > 0 && q.products.every((p) => /Eyeglasses|Optical Frame/.test(p.productType) && p.tags.includes('Mens') && p.availableForSale && Number(p.priceRange.minVariantPrice.amount) >= 200), 'Shopify query syntax filters');
const pr = queryProducts(L, { first: 1000, sort: 'PRICE' }).products.map((p) => Number(p.priceRange.minVariantPrice.amount));
ok(pr.every((x, i) => i === 0 || x >= pr[i - 1]), 'sort by price asc');
const rv = queryProducts(L, { first: 1000, sort: 'PRICE', reverse: true }).products.map((p) => Number(p.priceRange.minVariantPrice.amount));
ok(rv.every((x, i) => i === 0 || x <= rv[i - 1]), 'sort by price desc (reverse)');
const t = queryProducts(L, { query: 'ray-ban sunglasses', first: 1000 });
ok(t.products.length > 0 && t.products.every((p) => /ray.?ban/i.test(`${p.title} ${p.vendor}`) && /sunglasses/i.test(`${p.title} ${p.productType}`)), 'free-text AND search');
ok(parseQuery('vendor:"Ray-Ban" OR tag:Kids') !== null, 'parser handles quoted values');
const c = collectionProducts(L, 'eyeglasses-all-brands', { first: 1000 })!;
ok(c.products.length > 0 && c.products.every((p) => p.availableForSale), 'collection membership, available only');
ok(collectionProducts(L, 'nope', {}) === null, 'unknown collection returns null');
ok(p1.products[0].variants.length > 0 && p1.products[0].variants[0].id.startsWith('gid://shopify/ProductVariant/') && !!p1.products[0].featuredImage?.url.startsWith('https://'), 'Product shape restored (gid, full image url)');
process.exit(fail ? 1 : 0);
