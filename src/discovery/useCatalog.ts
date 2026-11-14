import { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Product, ShopifyConfigError, SortKey, fetchProducts, sized } from '../shopify';
import { useI18n } from '../i18n';
import { CATEGORIES, SORTS } from '../catalog';
import { Page, fetchCollectionPage } from './api';
import { Filters, buildColFilters, buildQuery, countActive, matches } from './filters';

export type CatalogError = 'config' | 'network' | null;
type Args = { text: string; cat: string | null; collection: string | null; filters: Filters; sortId: string; pageSize?: number };

/**
 * Paged product list for the Shop screen.
 * - A collection (from the home page, a brand, or the chosen category) is read as a collection, so the
 *   website's own order, every sort and every filter work inside it.
 * - Free-text search, or a category without a collection, uses the product search query.
 */
export function useCatalog({ text, cat, collection, filters, sortId, pageSize = 20 }: Args) {
  const { lang } = useI18n();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [error, setError] = useState<CatalogError>(null);
  /** Goes up each time a fresh first page lands (lets the screen animate new lists in once). */
  const [gen, setGen] = useState(0);
  const cursor = useRef<string | null>(null);
  const seq = useRef(0);
  const viaSearch = useRef(false);
  const fKey = JSON.stringify(filters);

  const load = useCallback(async (reset: boolean, soft = false) => {
    const id = ++seq.current;
    if (reset) { if (!soft) setLoading(true); cursor.current = null; viaSearch.current = false; } else setMore(true);
    setError(null);
    try {
      const l = lang === 'ar' ? 'AR' : 'EN';
      const sort = SORTS.find((x) => x.id === sortId) ?? SORTS[0];
      const col = text ? null : collection ?? CATEGORIES.find((x) => x.id === cat)?.collection ?? null;
      const page = async (): Promise<Page> => {
        if (col && !viaSearch.current) {
          const r = await fetchCollectionPage(col, { first: pageSize, after: cursor.current, sort: sort.col, reverse: sort.reverse, filters: buildColFilters(filters), lang: l });
          // Unknown or unpublished collection: fall back to the search query so the screen is never a dead end.
          const dead = r.missing || (cursor.current === null && r.products.length === 0 && countActive(filters) === 0);
          if (!dead) return { ...r, products: r.products.filter((p) => matches(p, filters)) };
          viaSearch.current = true;
        }
        // "Featured" on a text search means best match first (RELEVANCE is a valid ProductSortKeys value the shared type omits).
        const key = (sort.web && text ? 'RELEVANCE' : sort.sort) as SortKey;
        return fetchProducts({ query: buildQuery(text, collection ? null : cat, filters) || undefined, first: pageSize, after: cursor.current, sort: key, reverse: sort.reverse, lang: l });
      };
      let got: Product[] = [];
      let r = await page();
      got = r.products; cursor.current = r.cursor;
      // Client-side filtering can thin a page out: top it up (bounded) so the list never looks empty too early.
      for (let i = 0; i < 3 && got.length < 8 && r.hasNext && id === seq.current; i++) {
        r = await page();
        got = [...got, ...r.products]; cursor.current = r.cursor;
      }
      if (id !== seq.current) return; // a newer request superseded this one
      if (reset) Image.prefetch(got.slice(0, 8).map((x) => sized(x.featuredImage?.url, 480)).filter(Boolean) as string[], 'memory-disk').catch(() => {});
      setItems((p) => {
        if (reset) return got;
        const seen = new Set(p.map((x) => x.id));
        return [...p, ...got.filter((x) => !seen.has(x.id))];
      });
      setHasNext(r.hasNext);
      if (reset) setGen((g) => g + 1);
    } catch (e) {
      if (id !== seq.current) return;
      // A failed "load more" keeps what is already on screen; scrolling again retries.
      if (reset) setError(e instanceof ShopifyConfigError ? 'config' : 'network');
    } finally {
      if (id === seq.current) { setLoading(false); setMore(false); }
    }
  }, [text, cat, collection, fKey, sortId, pageSize, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch-on-change: the loading flag has to flip as the request starts.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(true); }, [load]);
  const loadMore = useCallback(() => { if (hasNext && !more && !loading) load(false); }, [hasNext, more, loading, load]);
  const reload = useCallback(() => load(true), [load]);
  /** Pull-to-refresh: refetch while the current items stay on screen. */
  const refresh = useCallback(() => load(true, true), [load]);
  return { items, loading, more, error, hasNext, gen, loadMore, reload, refresh };
}
