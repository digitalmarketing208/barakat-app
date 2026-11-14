import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LastBrowse = { collection?: string; title?: string; query?: string; categoryId?: string };
export type ViewMode = 'grid' | 'list';

const K = { searches: 'disc:searches', browse: 'disc:lastBrowse', view: 'disc:view' } as const;
type Shape = { searches: string[]; browse: LastBrowse | null; view: ViewMode };
const mem: Shape = { searches: [], browse: null, view: 'grid' };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

let ready: Promise<void> | null = null;
// One read for the whole app, started on first use (never blocks the first paint).
const hydrate = () => (ready ??= AsyncStorage.multiGet([K.searches, K.browse, K.view]).then((rows) => {
  for (const [k, v] of rows) {
    if (!v) continue;
    try {
      const j = JSON.parse(v);
      if (k === K.searches && Array.isArray(j)) mem.searches = j.filter((x) => typeof x === 'string');
      if (k === K.browse && j && typeof j === 'object') mem.browse = j;
      if (k === K.view && (j === 'grid' || j === 'list')) mem.view = j;
    } catch { /* ignore a corrupt entry */ }
  }
  emit();
}).catch(() => {}));

const put = (k: string, v: unknown) => { AsyncStorage.setItem(k, JSON.stringify(v)).catch(() => {}); emit(); };

export function addRecentSearch(q: string) {
  const s = q.trim();
  if (s.length < 2) return;
  mem.searches = [s, ...mem.searches.filter((x) => x.toLowerCase() !== s.toLowerCase())].slice(0, 8);
  put(K.searches, mem.searches);
}
export function removeRecentSearch(q: string) { mem.searches = mem.searches.filter((x) => x !== q); put(K.searches, mem.searches); }
export function clearRecentSearches() { mem.searches = []; put(K.searches, mem.searches); }
export function setLastBrowse(b: LastBrowse | null) {
  if (JSON.stringify(b) === JSON.stringify(mem.browse)) return;
  mem.browse = b; put(K.browse, b);
}
export function setViewMode(v: ViewMode) { mem.view = v; put(K.view, v); }

export function useDiscoveryStore(): Shape {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    subs.add(f); hydrate();
    return () => { subs.delete(f); };
  }, []);
  return mem;
}
