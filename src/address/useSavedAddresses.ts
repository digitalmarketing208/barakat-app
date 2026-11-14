import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SaudiAddress } from './types';

// Non-secret delivery details only (no payment data), so AsyncStorage is fine; it is the offline cache.
const KEY = 'barakat.addresses.v1';
export type SavedAddress = SaudiAddress & { id: string; isDefault: boolean; label?: string; updatedAt: number };

let cache: SavedAddress[] | null = null;
const listeners = new Set<(l: SavedAddress[]) => void>();
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function load(): Promise<SavedAddress[]> {
  if (cache) return cache;
  try { const raw = await AsyncStorage.getItem(KEY); cache = raw ? (JSON.parse(raw) as SavedAddress[]) : []; } catch { cache = []; }
  return cache;
}
async function commit(list: SavedAddress[]) {
  // exactly one default when the list is not empty
  if (list.length && !list.some((a) => a.isDefault)) list = list.map((a, i) => (i === 0 ? { ...a, isDefault: true } : a));
  cache = list;
  listeners.forEach((l) => l(list));
  try { await AsyncStorage.setItem(KEY, JSON.stringify(list)); } catch { /* in-memory copy still valid */ }
}

export function useSavedAddresses() {
  const [addresses, setAddresses] = useState<SavedAddress[]>(cache ?? []);
  const [ready, setReady] = useState(cache !== null);
  useEffect(() => {
    let live = true;
    listeners.add(setAddresses);
    load().then((l) => { if (live) { setAddresses(l); setReady(true); } });
    return () => { live = false; listeners.delete(setAddresses); };
  }, []);

  /** Add (no id) or update (id). makeDefault forces default; the first saved address is always default. */
  const save = useCallback(async (a: SaudiAddress & { id?: string; label?: string }, makeDefault = false) => {
    const list = await load();
    const id = a.id ?? newId();
    const existing = list.find((x) => x.id === id);
    const isDefault = makeDefault || existing?.isDefault || list.length === 0;
    const item: SavedAddress = { ...a, id, isDefault, updatedAt: Date.now() };
    let next = existing ? list.map((x) => (x.id === id ? item : x)) : [...list, item];
    if (isDefault) next = next.map((x) => ({ ...x, isDefault: x.id === id }));
    await commit(next);
    return item;
  }, []);
  const remove = useCallback(async (id: string) => { await commit((await load()).filter((x) => x.id !== id)); }, []);
  const setDefault = useCallback(async (id: string) => {
    await commit((await load()).map((x) => ({ ...x, isDefault: x.id === id })));
  }, []);
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  return { addresses, defaultAddress, ready, save, remove, setDefault };
}
