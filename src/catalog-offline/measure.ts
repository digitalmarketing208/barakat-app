// Run: npx tsx src/catalog-offline/measure.ts [products=2900]
// Builds a realistic MOCK catalog (Arabic + English titles, vendors, tags, variants, CDN image paths), encodes it with the
// real snapshot codec and prints sizes + a few local-query timings. No network, no device.
import { Cdn, PAGE_SIZE, RawNode, Snapshot, encode, decode, load, pageHash, queryProducts, collectionProducts, toRec } from './snapshot';

let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('');

const vendors = ['Ray-Ban', 'Oakley', 'Gucci', 'Prada', 'Tom Ford', 'Versace', 'Carrera', 'Police', 'Guess', 'Burberry', 'Dior', 'Fendi', 'Hugo Boss', 'Persol', 'Vogue', 'Armani Exchange', 'Polaroid', 'Tommy Hilfiger', 'Lacoste', 'Swarovski'];
const vendorsAr = ['راي بان', 'أوكلي', 'غوتشي', 'برادا', 'توم فورد', 'فيرساتشي', 'كاريرا', 'بوليس', 'جيس', 'بربري'];
const types = ['Eyeglasses', 'Sunglasses', 'Contact Lens', 'Accessories', 'Optical Frame'];
const tags = ['Mens', 'Women', 'Unisex', 'Kids', 'Round', 'Square', 'Cat-Eye', 'Aviator', 'Rectangle', 'Metal', 'Acetate', 'Titanium', 'Gamer', 'New', 'Sale', 'Polarized', 'UV400', 'Blue-Light', 'Full-Rim', 'Half-Rim'];
const colorsEn = ['Black', 'Havana', 'Gold', 'Silver', 'Blue', 'Crystal', 'Brown', 'Green', 'Red', 'Tortoise'];
const colorsAr = ['أسود', 'هافانا', 'ذهبي', 'فضي', 'أزرق', 'شفاف', 'بني', 'أخضر', 'أحمر', 'سلحفاة'];
const word = (ar: boolean, v: number) => (ar ? ['نظارة طبية', 'نظارة شمسية', 'عدسات لاصقة', 'إكسسوارات', 'إطار طبي'][v % 5] : ['Eyeglasses', 'Sunglasses', 'Contact Lens', 'Accessories', 'Optical Frame'][v % 5]);

function mockNode(i: number, ar: boolean): RawNode {
  seed = (i * 2654435761) >>> 0 || 1; // deterministic per product, identical between languages except text
  const vi = Math.floor(rnd() * vendors.length), ti = Math.floor(rnd() * types.length);
  const model = `${['RB', 'OO', 'GG', 'PR', 'TF', 'VE', 'CA'][vi % 7]}${1000 + Math.floor(rnd() * 8999)}`;
  const base = 120 + Math.floor(rnd() * 14) * 50 + (rnd() < 0.3 ? 0.5 : 0);
  const nv = 1 + Math.floor(rnd() * rnd() * 7); // mean ~2.4 variants
  const img = () => `https://cdn.shopify.com/s/files/1/0576/2209/${rnd() < 0.5 ? 'files' : 'products'}/${model}_${hex(3)}_${hex(2)}_${hex(8)}.jpg?v=17${Math.floor(rnd() * 1e8)}`;
  const nodes = Array.from({ length: nv }, (_, k) => {
    const c = Math.floor(rnd() * colorsEn.length);
    return { id: `gid://shopify/ProductVariant/${4400000000000 + i * 10 + k}`, title: `${ar ? colorsAr[c] : colorsEn[c]} / ${48 + (k % 3) * 2}`, availableForSale: rnd() < 0.8, price: { amount: `${base}.0` }, compareAtPrice: rnd() < 0.2 ? { amount: `${base + 80}.0` } : null,
      selectedOptions: [{ value: ar ? colorsAr[c] : colorsEn[c] }, { value: String(48 + (k % 3) * 2) }], image: { url: img() } };
  });
  return {
    id: `gid://shopify/Product/${7700000000000 + i}`, handle: `${vendors[vi].toLowerCase().replace(/[^a-z]+/g, '-')}-${model.toLowerCase()}-${hex(3)}`,
    title: ar ? `${word(true, ti)} ${vendorsAr[vi % vendorsAr.length]} ${model} ${pick(['رجالي', 'نسائي', 'للجنسين'])} ${pick(['كلاسيكي', 'عصري', 'رياضي', 'أنيق'])}` : `${vendors[vi]} ${model} ${pick(['Mens', 'Women', 'Unisex'])} ${word(false, ti)} ${pick(['Classic', 'Modern', 'Sport', 'Elegant'])}`,
    vendor: vendors[vi], productType: types[ti], tags: Array.from({ length: 4 + Math.floor(rnd() * 5) }, () => pick(tags)).filter((x, j, a) => a.indexOf(x) === j),
    availableForSale: nodes.some((n) => n.availableForSale), createdAt: new Date(1.6e12 + i * 3.2e6).toISOString(), featuredImage: { url: nodes[0].image!.url },
    priceRange: { minVariantPrice: { amount: `${base}.0`, currencyCode: 'SAR' }, maxVariantPrice: { amount: `${base}.0` } },
    compareAtPriceRange: { minVariantPrice: { amount: nodes[0].compareAtPrice?.amount ?? '0.0' } },
    options: [{ name: 'Color' }, { name: 'Size' }], variants: { nodes },
  };
}

export function buildMock(n: number, ar: boolean): Snapshot {
  const cdn: Cdn = { list: [] };
  const pages = [];
  for (let s = 0; s < n; s += PAGE_SIZE) {
    const r = Array.from({ length: Math.min(PAGE_SIZE, n - s) }, (_, k) => toRec(cdn, mockNode(s + k, ar)));
    pages.push({ h: pageHash(r), r });
  }
  const cols = ['eyeglasses-all-brands', 'sunglasses-all-brands', 'new-arrivals-all-collections', 'gamer-vision-blue-light-gaming-glasses', 'kids-collections-all-eyeglasses-and-sunglasses', 'accessories-1', 'contact-lenses', 'brand-ray-ban', 'brand-oakley', 'brand-gucci', 'offers']
    .map((h, k) => [h, h.replace(/-/g, ' '), '', Array.from({ length: Math.floor(n * (k < 2 ? 0.45 : 0.08)) }, () => Math.floor(rnd() * n)).filter((x, j, a) => a.indexOf(x) === j)] as [string, string, string, number[]]);
  return { v: 1, lang: ar ? 'AR' : 'EN', at: Date.now(), cur: '', cdn: cdn.list, pages, cols };
}

if (process.argv[1]?.endsWith('measure.ts')) {
  const n = Number(process.argv[2]) || 2900;
  const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`;
  let total = 0;
  for (const ar of [true, false]) {
    const s = buildMock(n, ar);
    const raw = JSON.stringify(s).length;
    const t0 = Date.now(); const bin = encode(s); const t1 = Date.now();
    const back = decode(bin)!; const L = load(back); const t2 = Date.now();
    total += bin.length;
    const q0 = Date.now(); const r = queryProducts(L, { query: '(product_type:Eyeglasses OR product_type:"Optical Frame") AND tag:Mens AND available_for_sale:true AND variants.price:>=200', first: 20, sort: 'PRICE' }); const q1 = Date.now();
    const sr = queryProducts(L, { query: ar ? 'نظارة شمسية راي بان' : 'ray-ban sunglasses', first: 20 }); const q2 = Date.now();
    const cp = collectionProducts(L, 'eyeglasses-all-brands', { first: 20, offset: 40 });
    console.log(`${ar ? 'AR' : 'EN'}: ${n} products | raw JSON ${kb(raw)} | gzip file ${kb(bin.length)} | encode ${t1 - t0}ms, decode+index ${t2 - t1}ms | filter+sort query ${q1 - q0}ms (${r.products.length}${r.hasNext ? '+' : ''}) | text search ${q2 - q1}ms (${sr.products.length}) | collection page ${cp?.products.length}`);
  }
  console.log(`Both languages on disk: ${kb(total)}`);
  const thumbAvg = 7 * 1024;
  console.log(`Thumbnails (estimate): ${n} x ~7 KB webp@240 = ${((n * thumbAvg) / 1048576).toFixed(1)} MB (range ${(n * 4 / 1024).toFixed(0)}-${(n * 10 / 1024).toFixed(0)} MB); default cap 60 MB`);
}
