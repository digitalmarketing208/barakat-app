// Launch prefetch: on Wi-Fi, quietly download what the first screens need (Home rails, collections, the Shop's
// first pages, lens add-ons and product images) so they open instantly and keep working offline.
// Requests use exactly the same arguments as the screens, so they land on the same disk-cache entries.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { Product, fetchCollectionProducts, fetchCollections, fetchProduct, fetchProducts, sized } from '../shopify';
import { isWifi, waitFor } from '../net/status';
import { SHOPIFY } from '../config';
import targets from '../data/prefetch.json';

const HOME_PAGE = 10;   // HomeScreen rails: useProducts(..., 10, collection)
const SHOP_PAGE = 20;   // ShopScreen: useProducts(..., 20, collection)
const CARD_WIDTH = 480; // ProductCard image width (ui.tsx)
const MIN_GAP_MS = 20 * 60 * 1000; // do not repeat a full run more often than this
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let current: { cancelled: boolean } | null = null;

export function stopPrefetch() { if (current) current.cancelled = true; current = null; }

/** Start (or restart for another language) the background prefetch. Safe to call repeatedly. */
export function startPrefetch(lang: 'ar' | 'en') {
  stopPrefetch();
  if (!SHOPIFY.token) return;
  const token = { cancelled: false };
  current = token;
  run(lang, token).catch(() => { /* cancelled or failed: the screens load on demand anyway */ });
}

async function run(lang: 'ar' | 'en', token: { cancelled: boolean }) {
  const L = lang === 'ar' ? 'AR' : 'EN';
  const stamp = `prefetchAt:${lang}`;
  const last = Number(await AsyncStorage.getItem(stamp).catch(() => null)) || 0;
  if (Date.now() - last < MIN_GAP_MS) return;

  const images = new Set<string>();
  const collect = (list: Product[]) => list.forEach((p) => { const u = sized(p.featuredImage?.url, CARD_WIDTH); if (u) images.add(u); });
  // Before every step: stop if cancelled, and wait (pause) while offline or not on Wi-Fi.
  const step = async (fn: () => Promise<unknown>) => {
    if (token.cancelled) throw new Error('cancelled');
    await waitFor(isWifi, token);
    if (token.cancelled) throw new Error('cancelled');
    try { await fn(); return true; } catch { return false; }
    finally { await pause(120); } // leave the JS thread and the network free for the user
  };

  let ok = true;
  for (const handle of targets.homeRails) {
    ok = (await step(async () => collect((await fetchCollectionProducts(handle, { first: HOME_PAGE, lang: L })).products))) && ok;
  }
  ok = (await step(() => fetchCollections(L))) && ok;
  ok = (await step(async () => collect((await fetchProducts({ first: SHOP_PAGE, sort: 'BEST_SELLING', reverse: false, lang: L })).products))) && ok;
  for (const handle of targets.shopCollections) {
    ok = (await step(async () => collect((await fetchCollectionProducts(handle, { first: SHOP_PAGE, lang: L })).products))) && ok;
  }
  // The lens picker loads its add-on products in the default (EN) context.
  for (const handle of targets.lensAddons) ok = (await step(() => fetchProduct(handle))) && ok;

  const urls = [...images];
  for (let i = 0; i < urls.length; i += 6) {
    const batch = urls.slice(i, i + 6);
    await step(() => Image.prefetch(batch, 'disk'));
  }
  if (ok && !token.cancelled) AsyncStorage.setItem(stamp, String(Date.now())).catch(() => {});
}
