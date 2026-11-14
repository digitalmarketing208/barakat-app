import { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Product, ShopifyConfigError, SortKey, fetchCollectionProducts, fetchProducts, sized } from './shopify';
import { useI18n } from './i18n';
import { isOffline, netState, onReconnect } from './net/status';

export type Err = 'config' | 'network' | null;
type Page = { products: Product[]; hasNext: boolean; cursor: string | null };

/**
 * Product list with offline-first loading: the saved copy paints instantly, then the network refreshes it
 * (stale-while-revalidate). A failed refresh or failed "load more" never clears a list that is already showing.
 */
export function useProducts(query: string, sort: SortKey = 'BEST_SELLING', reverse = false, pageSize = 20, collection?: string) {
  const { lang } = useI18n();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [error, setError] = useState<Err>(null);
  /** True while the list on screen is a saved copy that could not be refreshed. */
  const [saved, setSaved] = useState(false);
  const cursor = useRef<string | null>(null);
  const seq = useRef(0);
  const fallback = useRef(false);
  const count = useRef(0);        // items on screen for the current request
  const pages = useRef(0);        // pages appended for the current request
  const moreFailed = useRef(false); // stops onEndReached hammering a dead network
  const stale = useRef(false);

  const l = lang === 'ar' ? 'AR' : 'EN';
  // One page, from the network (saved copy on failure) or from the saved copy only.
  const fetchPage = useCallback(async (reset: boolean, cacheOnly: boolean): Promise<{ page: Page; fb: boolean }> => {
    const after = reset ? null : cursor.current;
    const useCol = !!collection && collection !== 'products' && !(fallback.current && !reset);
    let fb = reset ? false : fallback.current;
    let page: Page | null = useCol ? await fetchCollectionProducts(collection!, { first: pageSize, after, lang: l, cacheOnly, offset: reset ? undefined : count.current }) : null;
    // No such collection (or an empty one): fall back to the product search.
    if (!page || (reset && page.products.length === 0)) {
      if (reset) fb = true;
      page = await fetchProducts({ query: query || undefined, first: pageSize, after, sort, reverse, lang: l, cacheOnly, offset: reset ? undefined : count.current });
    }
    return { page, fb };
  }, [query, sort, reverse, pageSize, l, collection]);

  const load = useCallback(async (reset: boolean, silent = false) => {
    const id = ++seq.current;
    const apply = ({ page, fb }: { page: Page; fb: boolean }, replace: boolean) => {
      fallback.current = fb; cursor.current = page.cursor;
      pages.current = replace ? 1 : pages.current + 1;
      setItems((prev) => {
        if (replace) { count.current = page.products.length; return page.products; }
        const have = new Set(prev.map((x) => x.id)); // a saved page can overlap a fresh one
        const next = [...prev, ...page.products.filter((x) => !have.has(x.id))];
        count.current = next.length;
        return next;
      });
      setHasNext(page.hasNext);
    };
    let painted = silent && count.current > 0;
    if (reset) { moreFailed.current = false; if (!painted) { setLoading(true); count.current = 0; } } else setMore(true);
    setError(null);
    try {
      if (reset && !painted) {
        // 1) instant paint from disk
        const hit = await fetchPage(true, true).catch(() => null);
        if (id !== seq.current) return;
        if (hit) { apply(hit, true); setLoading(false); painted = true; }
      }
      // 2) refresh from the network
      const r = await fetchPage(reset, false);
      if (id !== seq.current) return; // a newer request superseded this one
      apply(r, reset);
      stale.current = netState().savedData || isOffline(); setSaved(stale.current);
      if (reset && !isOffline()) Image.prefetch(r.page.products.slice(0, 12).map((x) => sized(x.featuredImage?.url, 480)).filter(Boolean) as string[], 'memory-disk').catch(() => {});
    } catch (e) {
      if (id !== seq.current) return;
      if (e instanceof ShopifyConfigError) setError('config');
      else if (!reset) moreFailed.current = true;      // keep the list; retried on reconnect or pull-to-refresh
      else if (painted) { stale.current = true; setSaved(true); } // keep showing the saved copy
      else { setItems([]); count.current = 0; setError('network'); }
    } finally {
      if (id === seq.current) { setLoading(false); setMore(false); }
    }
  }, [fetchPage]);

  // fetch on mount / whenever the query changes; load() raises the loading flag, then waits on the network
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-change; no cascading render beyond the loading flag
  useEffect(() => { count.current = 0; load(true); }, [load]);

  // Back online (or the user tapped retry): refresh what could not be refreshed, without a spinner or scroll jump.
  const errRef = useRef<Err>(null);
  useEffect(() => { errRef.current = error; }, [error]);
  useEffect(() => onReconnect(() => {
    if (errRef.current === 'config') return;
    const blocked = moreFailed.current;
    moreFailed.current = false;
    if (errRef.current === 'network' || count.current === 0) load(true);
    else if (stale.current && pages.current <= 1) load(true, true);
    else if (blocked) load(false);
  }), [load]);

  const loadMore = useCallback(() => { if (hasNext && !more && !loading && !moreFailed.current) load(false); }, [hasNext, more, loading, load]);
  /** Pull-to-refresh / retry: keeps the current list on screen while reloading. */
  const reload = useCallback(() => load(true, true), [load]);
  return { items, loading, more, error, hasNext, loadMore, reload, saved };
}
