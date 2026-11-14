// Loading, caching and refreshing the offers manifest. Source: Shopify page handle "app-offers" (body = JSON).
import { SHOPIFY } from '../config';
import { cacheRead, cacheWrite } from '../offline';
import { clock } from './clock';
import { defaultOffers, getManifest, setManifest, validateManifest } from './engine';
import type { OffersManifest } from './types';

const KEY_MANIFEST = 'offers:manifest:v1';
const KEY_CLOCK = 'offers:clock:v1';
type Saved = { manifest: OffersManifest; fetchedAt: number };

let fetchedAt: number | null = null;
let source: 'default' | 'cache' | 'network' = 'default';
let inited = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => { try { f(); } catch { /* ignore */ } });
export const subscribeOffers = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const offersMeta = () => ({ fetchedAt, source });

/** Decode the page body (Shopify wraps it in HTML) to plain JSON text. */
export function bodyToJson(body: string): string {
  return body.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();
}
export function parseBody(body: string): OffersManifest | null {
  try { return validateManifest(JSON.parse(bodyToJson(body))); } catch { return null; }
}

/** Synchronous start-up: restore clock + last good manifest from disk (else the bundled sample). Call once, early. */
export function initOffers() {
  if (inited) return; inited = true;
  clock.restore(cacheRead<Partial<ReturnType<typeof clock.snapshot>>>(KEY_CLOCK));
  const s = cacheRead<Saved>(KEY_MANIFEST);
  const m = s ? validateManifest(s.manifest) : null;
  if (s && m) { setManifest(m); fetchedAt = s.fetchedAt; source = 'cache'; } else { setManifest(defaultOffers()); }
  emit();
}

export const persistClock = () => cacheWrite(KEY_CLOCK, clock.snapshot());

/** Fetch the manifest. Own fetch (not gql) because gql hides response headers and we need the HTTP Date header. */
export async function refreshOffers(timeoutMs = 8000): Promise<boolean> {
  initOffers();
  if (!SHOPIFY.token) return false;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://${SHOPIFY.domain}/api/${SHOPIFY.apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': SHOPIFY.token },
      body: JSON.stringify({ query: 'query AppOffers { page(handle: "app-offers") { body updatedAt } }' }),
      signal: ctl.signal,
    });
    if (!res.ok) return false;
    noteServerDate(res.headers.get('date'));
    const json = await res.json() as { data?: { page?: { body?: string } | null } };
    if (!json.data) return false;
    const body = json.data.page?.body;
    // No page = marketing has no offers: that is a valid answer (empty manifest), not an error.
    const m = body ? parseBody(body) : { version: 1, updatedAt: '', offers: [] };
    if (!m) return false; // malformed JSON: keep the last good manifest
    fetchedAt = clock.now(); source = 'network';
    setManifest(m);
    cacheWrite(KEY_MANIFEST, { manifest: m, fetchedAt } satisfies Saved);
    emit();
    return true;
  } catch { return false; } finally { clearTimeout(timer); }
}

/** Feed every successful network response's `Date` header here (see docs: one line in shopify.ts post()). */
export function noteServerDate(h: string | null | undefined) {
  if (clock.observeDateHeader(h)) persistClock();
}
export { getManifest };
